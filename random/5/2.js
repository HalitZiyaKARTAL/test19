/*
 * ChatGPT Prompt / Full-Chat Extractor
 * Version 1.0.0 — 2026-07-15
 *
 * Best use: save this file as a DevTools Snippet, open a ChatGPT conversation,
 * then run the snippet. It reads only the active visible branch, scrolls the
 * conversation to materialize virtualized turns, and downloads local files.
 * It makes no network requests and does not edit the conversation.
 */
(() => {
  "use strict";

  // ---------- Main choices (edit these) ----------
  const INCLUDE_MODEL_MESSAGES = true; // true: user + assistant; false: user prompts only
  const OUTPUT_FORMAT = "both";         // "txt", "json", or "both"
  const CHAT_TITLE_OVERRIDE = "";       // blank = detect the current chat name
  const INCLUDE_MESSAGE_HTML = false;   // slower/larger; useful only for exact DOM archiving

  // ---------- Advanced choices ----------
  const BASE_CONFIG = {
    includeModelMessages: INCLUDE_MODEL_MESSAGES,
    includeOtherRoles: false,
    outputFormat: OUTPUT_FORMAT,
    chatTitleOverride: CHAT_TITLE_OVERRIDE,
    includeMessageHtml: INCLUDE_MESSAGE_HTML,
    includeLinks: true,
    includeMediaMetadata: true,
    includeMediaUrls: true,
    restoreScrollPosition: true,
    reuseCompatibleWindowCaches: true,
    expectedUserPromptCount: null, // e.g. 145; null = discover automatically
    autoDownload: true,

    // The fast path anchors to an already-mounted message, so it can skip empty
    // scroll space without skipping materialized messages. It temporarily falls
    // back to overlapping scroll steps whenever anchoring is unproductive.
    useAnchorJumps: true,
    anchorLookAheadViewports: 2.25,
    maximumAnchorJumpViewports: 2.5,
    manualStepViewports: 0.88,
    fallbackStepViewports: 0.48,
    anchorCooldownMoves: 8,

    minimumSettleMs: 45,
    maximumSettleMs: 700,
    mutationQuietMs: 34,
    bottomRecheckMs: 220,
    bottomStableChecks: 5,
    initialEdgeSettleMs: 900,
    maximumMovesPerPass: 6000,
    maximumRuntimeMs: 20 * 60 * 1000,
    progressEveryMessages: 25,
    progressEveryMs: 12_000,
    runValidationPassOnRisk: true
  };

  const TOOL_NAME = "ChatGPTPromptExtractor";
  const TOOL_VERSION = "1.0.0";
  const MESSAGE_SELECTOR = "[data-message-author-role]";
  const previousTool = window[TOOL_NAME];

  if (previousTool?.running) {
    console.warn(
      `[${TOOL_NAME}] A scan is already running. ` +
      `Use ${TOOL_NAME}.stop() before starting another.`
    );
    return;
  }

  const runtimeCache = new Map();
  let cacheConversationPath = location.pathname;
  let activeAbortController = null;

  const api = {
    version: TOOL_VERSION,
    running: false,
    lastResult: previousTool?.lastResult || null,
    lastError: null,
    run,
    stop() {
      if (!activeAbortController) return false;
      activeAbortController.abort("Stopped by user");
      return true;
    },
    download(format = api.lastResult?.settings?.outputFormat || "both") {
      if (!api.lastResult) throw new Error("No completed extraction is cached.");
      return downloadBundle(api.lastResult, format);
    }
  };

  window[TOOL_NAME] = api;

  function abortError(reason = "Extraction stopped") {
    return new DOMException(String(reason), "AbortError");
  }

  function assertRunning(signal, deadline) {
    if (signal.aborted) throw abortError(signal.reason);
    if (performance.now() > deadline)
      throw new Error("Maximum extraction runtime was reached.");
  }

  function delay(milliseconds, signal) {
    if (signal.aborted) return Promise.reject(abortError(signal.reason));

    return new Promise((resolve, reject) => {
      const timer = setTimeout(done, milliseconds);

      function done() {
        signal.removeEventListener("abort", stopped);
        resolve();
      }

      function stopped() {
        clearTimeout(timer);
        signal.removeEventListener("abort", stopped);
        reject(abortError(signal.reason));
      }

      signal.addEventListener("abort", stopped, { once: true });
    });
  }

  function animationFrames(count, signal) {
    return new Promise((resolve, reject) => {
      function next() {
        if (signal.aborted) return reject(abortError(signal.reason));
        if (!count--) return resolve();
        requestAnimationFrame(next);
      }

      next();
    });
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function hashText(text) {
    let value = 2166136261;

    for (let index = 0; index < text.length; index++)
      value = Math.imul(value ^ text.charCodeAt(index), 16777619);

    return (value >>> 0).toString(36);
  }

  function normalizeConfig(overrides) {
    const config = { ...BASE_CONFIG, ...overrides };
    const format = String(config.outputFormat).toLowerCase();
    const expectedCount = config.expectedUserPromptCount;

    if (!["txt", "json", "both"].includes(format))
      throw new Error('outputFormat must be "txt", "json", or "both".');

    config.outputFormat = format;
    config.manualStepViewports = clamp(
      Number(config.manualStepViewports) || 0.88,
      0.2,
      0.98
    );
    config.fallbackStepViewports = clamp(
      Number(config.fallbackStepViewports) || 0.48,
      0.15,
      0.8
    );
    config.expectedUserPromptCount =
      expectedCount != null &&
      expectedCount !== "" &&
      Number.isFinite(Number(expectedCount))
        ? Number(expectedCount)
        : null;

    return config;
  }

  function mountedMessageElements() {
    return [...document.querySelectorAll(MESSAGE_SELECTOR)]
      .filter(element => element.isConnected);
  }

  function turnElementFor(messageElement) {
    return messageElement.closest('[data-testid^="conversation-turn-"]') ||
      messageElement.closest("article") ||
      messageElement.closest("[data-message-id]") ||
      messageElement;
  }

  function messageIdentity(messageElement, turnElement) {
    const role =
      messageElement.getAttribute("data-message-author-role") || "unknown";
    const messageId =
      messageElement.getAttribute("data-message-id") ||
      turnElement.getAttribute("data-message-id") ||
      null;
    const turnTestId = turnElement.getAttribute("data-testid") || null;
    const turnMatch =
      turnTestId?.match(/conversation-turn-(\d+)/i) ||
      turnTestId?.match(/(\d+)(?!.*\d)/);
    const turnNumber = turnMatch ? Number(turnMatch[1]) : null;
    let key;

    if (messageId) key = `id:${messageId}`;
    else if (turnTestId) key = `turn:${turnTestId}:${role}`;
    else {
      const fallbackSource = [
        role,
        messageElement.textContent,
        messageElement.innerHTML
      ].join("\u0000");

      key = `fallback:${hashText(fallbackSource)}`;
    }

    return {
      key,
      role,
      messageId,
      turnTestId,
      turnNumber: Number.isFinite(turnNumber) ? turnNumber : null,
      unstableKey: !messageId && !turnTestId
    };
  }

  function findConversationScroller(seedElements) {
    const candidates = new Map();
    const documentScroller =
      document.scrollingElement || document.documentElement;

    candidates.set(documentScroller, {
      element: documentScroller,
      depth: Number.MAX_SAFE_INTEGER,
      documentScroller: true
    });

    for (const seed of seedElements) {
      let depth = 0;

      for (
        let element = seed.parentElement;
        element;
        element = element.parentElement, depth++
      ) {
        const overflow = getComputedStyle(element).overflowY;
        const range = element.scrollHeight - element.clientHeight;

        if (range > 80 && /(auto|scroll|overlay)/.test(overflow)) {
          const current = candidates.get(element);

          if (!current || depth < current.depth) {
            candidates.set(element, {
              element,
              depth,
              documentScroller: false
            });
          }
        }
      }
    }

    const viable = [...candidates.values()].filter(candidate => {
      const element = candidate.element;

      return candidate.documentScroller ||
        seedElements.every(seed => element.contains(seed));
    });

    viable.sort((left, right) => {
      if (left.documentScroller !== right.documentScroller)
        return left.documentScroller ? 1 : -1;

      return left.depth - right.depth ||
        (right.element.scrollHeight - right.element.clientHeight) -
        (left.element.scrollHeight - left.element.clientHeight);
    });

    return viable[0]?.element || documentScroller;
  }

  function makeScrollPort(scroller) {
    const documentScroller =
      scroller === document.scrollingElement ||
      scroller === document.documentElement ||
      scroller === document.body;

    return {
      scroller,
      documentScroller,
      mutationRoot: documentScroller ? document.body : scroller,

      get top() {
        return documentScroller ? window.scrollY : scroller.scrollTop;
      },

      get viewportHeight() {
        return documentScroller ? window.innerHeight : scroller.clientHeight;
      },

      get scrollHeight() {
        return documentScroller
          ? Math.max(
              document.documentElement.scrollHeight,
              document.body.scrollHeight
            )
          : scroller.scrollHeight;
      },

      get maximum() {
        return Math.max(0, this.scrollHeight - this.viewportHeight);
      },

      bounds() {
        if (documentScroller)
          return { top: 0, bottom: window.innerHeight };

        const rect = scroller.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      },

      setTop(value) {
        const target = clamp(value, 0, this.maximum);

        if (documentScroller) window.scrollTo(0, target);
        else scroller.scrollTop = target;

        return target;
      },

      describe() {
        return documentScroller
          ? { type: "document" }
          : {
              type: "element",
              tag: scroller.tagName,
              id: scroller.id || null,
              class:
                typeof scroller.className === "string"
                  ? scroller.className
                  : null
            };
      }
    };
  }

  function shouldExportRole(role, config) {
    if (role === "user") return true;
    if (role === "assistant") return config.includeModelMessages;
    return config.includeOtherRoles;
  }

  function extractLinks(element) {
    const seen = new Set();
    const links = [];

    for (const link of element.querySelectorAll("a[href]")) {
      const href =
        link.href ||
        link.getAttribute("href") ||
        "";

      const text = (
        link.innerText ||
        link.textContent ||
        link.getAttribute("aria-label") ||
        ""
      ).trim();

      const key = `${text}\u0000${href}`;

      if (!seen.has(key)) {
        seen.add(key);
        links.push({ text, href });
      }
    }

    return links;
  }

  function extractMedia(element, includeUrls) {
    const media = [];

    for (const node of element.querySelectorAll("img,video,audio,source")) {
      const rawSource =
        node.getAttribute("src") ||
        node.getAttribute("poster") ||
        "";

      const source = /^data:/i.test(rawSource)
        ? `[data URL: ${rawSource.length} characters]`
        : rawSource;

      media.push({
        type: node.tagName.toLowerCase(),
        alt: node.getAttribute("alt") || null,
        title: node.getAttribute("title") || null,
        ariaLabel: node.getAttribute("aria-label") || null,
        source: includeUrls ? source || null : null,
        width:
          Number(node.getAttribute("width")) ||
          node.naturalWidth ||
          null,
        height:
          Number(node.getAttribute("height")) ||
          node.naturalHeight ||
          null
      });
    }

    const attachmentSelectors = [
      '[data-testid*="attachment"]',
      '[data-testid*="file"]',
      '[aria-label*="attachment" i]',
      '[aria-label*="file" i]'
    ].join(",");

    const attachments = [];
    const seenAttachments = new Set();

    for (const node of element.querySelectorAll(attachmentSelectors)) {
      const record = {
        testId: node.getAttribute("data-testid") || null,
        ariaLabel: node.getAttribute("aria-label") || null,
        text: (node.innerText || node.textContent || "").trim()
      };

      const key = JSON.stringify(record);

      if (!seenAttachments.has(key)) {
        seenAttachments.add(key);
        attachments.push(record);
      }
    }

    return { media, attachments };
  }

  function displayedTime(turnElement) {
    const time = turnElement.querySelector("time");

    return time?.dateTime ||
      time?.getAttribute("datetime") ||
      time?.innerText ||
      null;
  }

  function readMessageRecord(
    descriptor,
    config,
    startedPerformance
  ) {
    const {
      messageElement,
      turnElement,
      identity,
      documentTop
    } = descriptor;

    const record = {
      key: identity.key,
      role: identity.role,
      message_id: identity.messageId,
      turn_testid: identity.turnTestId,
      turn_number: identity.turnNumber,
      unstable_key: identity.unstableKey,
      displayed_or_dom_time: displayedTime(turnElement),
      captured_after_ms:
        Math.round(performance.now() - startedPerformance),
      approximate_document_top_at_capture:
        Math.round(documentTop),
      text: messageElement.innerText,
      links:
        config.includeLinks
          ? extractLinks(messageElement)
          : undefined,
      html:
        config.includeMessageHtml
          ? messageElement.innerHTML
          : undefined
    };

    if (config.includeMediaMetadata) {
      Object.assign(
        record,
        extractMedia(
          messageElement,
          config.includeMediaUrls
        )
      );
    }

    return record;
  }

  function descriptorFor(messageElement, port) {
    const turnElement = turnElementFor(messageElement);
    const identity = messageIdentity(messageElement, turnElement);
    const bounds = port.bounds();
    const rect = turnElement.getBoundingClientRect();

    return {
      messageElement,
      turnElement,
      identity,
      rect,
      documentTop:
        port.top +
        rect.top -
        bounds.top
    };
  }

  function captureMounted(context) {
    const {
      port,
      config,
      records,
      coverage,
      startedPerformance,
      stats
    } = context;

    const descriptors = mountedMessageElements()
      .map(element => descriptorFor(element, port))
      .filter(
        descriptor =>
          descriptor.rect.width > 0 &&
          descriptor.rect.height > 0
      )
      .sort(
        (left, right) =>
          left.rect.top - right.rect.top
      );

    const mountedKeys = new Set();
    let addedCoverage = 0;
    let addedRecords = 0;

    for (const descriptor of descriptors) {
      const { identity } = descriptor;
      mountedKeys.add(identity.key);

      if (!coverage.has(identity.key)) {
        coverage.set(identity.key, {
          key: identity.key,
          role: identity.role,
          message_id: identity.messageId,
          turn_number: identity.turnNumber,
          first_seen_after_ms:
            Math.round(
              performance.now() -
              startedPerformance
            )
        });

        addedCoverage++;

        if (
          records.has(identity.key) &&
          shouldExportRole(identity.role, config)
        ) {
          stats.cacheHits++;
        }
      }

      if (!shouldExportRole(identity.role, config))
        continue;

      const existing = records.get(identity.key);
      const needsHtmlUpgrade =
        config.includeMessageHtml &&
        existing &&
        existing.html == null;

      if (!existing || needsHtmlUpgrade) {
        const record = readMessageRecord(
          descriptor,
          config,
          startedPerformance
        );

        if (existing) {
          records.set(identity.key, {
            ...existing,
            ...record,
            source: "live DOM upgrade"
          });
        } else {
          records.set(identity.key, {
            ...record,
            source: "live DOM"
          });

          addedRecords++;
        }
      }
    }

    stats.captures++;
    stats.newCoverage += addedCoverage;
    stats.newRecords += addedRecords;

    return {
      descriptors,
      mountedKeys,
      addedCoverage,
      addedRecords
    };
  }

  async function moveAndSettle(
    port,
    move,
    config,
    signal,
    settleMaximum = config.maximumSettleMs
  ) {
    let mutationCount = 0;
    let lastMutationAt = -Infinity;

    const observer = new MutationObserver(() => {
      mutationCount++;
      lastMutationAt = performance.now();
    });

    observer.observe(port.mutationRoot, {
      childList: true,
      subtree: true
    });

    const started = performance.now();

    try {
      move();
      await animationFrames(2, signal);

      while (
        performance.now() - started <
        settleMaximum
      ) {
        const elapsed =
          performance.now() - started;

        const quietFor =
          performance.now() - lastMutationAt;

        if (
          elapsed >= config.minimumSettleMs &&
          (
            mutationCount === 0 ||
            quietFor >= config.mutationQuietMs
          )
        ) {
          break;
        }

        await delay(16, signal);
      }
    } finally {
      observer.disconnect();
    }

    return {
      mutationCount,
      elapsedMs:
        Math.round(
          performance.now() - started
        )
    };
  }

  function chooseAnchor(
    descriptors,
    port,
    config
  ) {
    const bounds = port.bounds();
    const view = port.viewportHeight;

    const minimumTop =
      bounds.top + view * 0.28;

    const maximumTop =
      bounds.bottom +
      view * config.anchorLookAheadViewports;

    const maximumDelta =
      view *
      config.maximumAnchorJumpViewports;

    return descriptors
      .filter(descriptor => {
        const rect = descriptor.rect;

        return (
          descriptor.turnElement.isConnected &&
          rect.height > 0 &&
          rect.width > 0 &&
          rect.top >= minimumTop &&
          rect.top <= maximumTop &&
          rect.top - bounds.top <=
            maximumDelta
        );
      })
      .at(-1) || null;
  }

  function setsOverlap(left, right) {
    if (left.size > right.size)
      [left, right] = [right, left];

    for (const key of left) {
      if (right.has(key))
        return true;
    }

    return false;
  }

  async function advance(
    context,
    captureResult,
    pass
  ) {
    const {
      port,
      config,
      signal,
      stats
    } = context;

    const beforeTop = port.top;
    const beforeMaximum = port.maximum;
    const beforeCoverage =
      context.coverage.size;

    const beforeMounted =
      captureResult.mountedKeys;

    let mode = "manual";
    let anchorKey = null;
    let targetTop;

    if (
      pass.allowAnchors &&
      config.useAnchorJumps &&
      stats.anchorCooldown === 0
    ) {
      const anchor = chooseAnchor(
        captureResult.descriptors,
        port,
        config
      );

      if (anchor) {
        const bounds = port.bounds();

        targetTop =
          beforeTop +
          anchor.rect.top -
          bounds.top;

        anchorKey =
          anchor.identity.key;

        mode = "anchor";
      }
    }

    if (mode === "manual") {
      targetTop =
        beforeTop +
        port.viewportHeight *
          pass.stepViewports;
    }

    targetTop = clamp(
      targetTop,
      0,
      beforeMaximum
    );

    if (targetTop <= beforeTop + 2) {
      return {
        atBottom: true,
        mode,
        newCoverage: 0
      };
    }

    const settle = await moveAndSettle(
      port,
      () => port.setTop(targetTop),
      config,
      signal,
      pass.settleMaximumMs
    );

    stats.settleMs += settle.elapsedMs;
    stats.mutations += settle.mutationCount;

    const afterCapture =
      captureMounted(context);

    const actualDistance =
      Math.max(0, port.top - beforeTop);

    const newCoverage =
      context.coverage.size -
      beforeCoverage;

    const overlap = setsOverlap(
      beforeMounted,
      afterCapture.mountedKeys
    );

    if (mode === "anchor") {
      stats.anchorMoves++;

      const productive =
        actualDistance >=
          Math.min(
            80,
            port.viewportHeight * 0.12
          ) &&
        (
          newCoverage > 0 ||
          afterCapture.mountedKeys.has(
            anchorKey
          )
        );

      if (!productive) {
        stats.anchorFallbacks++;
        stats.anchorFailuresInARow++;

        if (
          stats.anchorFailuresInARow >= 2
        ) {
          stats.anchorCooldown =
            config.anchorCooldownMoves;

          stats.anchorFailuresInARow = 0;
        }

        if (
          port.top <
          port.maximum - 2
        ) {
          const fallbackBefore =
            port.top;

          const fallbackTarget =
            fallbackBefore +
            port.viewportHeight *
              config.fallbackStepViewports;

          const fallbackSettle =
            await moveAndSettle(
              port,
              () =>
                port.setTop(
                  fallbackTarget
                ),
              config,
              signal,
              pass.settleMaximumMs
            );

          stats.settleMs +=
            fallbackSettle.elapsedMs;

          stats.mutations +=
            fallbackSettle.mutationCount;

          captureMounted(context);
          stats.manualMoves++;
        }
      } else {
        stats.anchorFailuresInARow = 0;
      }

      if (
        !overlap &&
        actualDistance >
          port.viewportHeight * 0.9
      ) {
        stats.continuityRisks++;
      }
    } else {
      stats.manualMoves++;

      if (stats.anchorCooldown > 0)
        stats.anchorCooldown--;
    }

    stats.moves++;

    return {
      atBottom: false,
      mode,
      newCoverage,
      overlap
    };
  }

  async function settleAtTop(context) {
    const {
      port,
      config,
      signal,
      stats
    } = context;

    let stable = 0;
    let previousState = "";

    for (
      let attempt = 0;
      attempt < 8 && stable < 3;
      attempt++
    ) {
      const settle =
        await moveAndSettle(
          port,
          () => port.setTop(0),
          config,
          signal,
          config.initialEdgeSettleMs
        );

      stats.settleMs += settle.elapsedMs;
      stats.mutations +=
        settle.mutationCount;

      const capture =
        captureMounted(context);

      const state = [
        Math.round(port.top),
        Math.round(port.maximum),
        context.coverage.size,
        capture.mountedKeys.size
      ].join(":");

      stable =
        state === previousState
          ? stable + 1
          : 0;

      previousState = state;

      if (!stable)
        await delay(80, signal);
    }

    return port.top <= 2;
  }

  function reportProgress(
    context,
    force = false
  ) {
    const now = performance.now();

    const {
      stats,
      records,
      coverage,
      config
    } = context;

    const enoughMessages =
      records.size >=
      stats.lastReportedRecords +
        config.progressEveryMessages;

    const enoughTime =
      now >=
      stats.lastReportedAt +
        config.progressEveryMs;

    if (
      !force &&
      !enoughMessages &&
      !enoughTime
    ) {
      return;
    }

    stats.lastReportedRecords =
      records.size;

    stats.lastReportedAt = now;

    const userCount =
      [...records.values()]
        .filter(
          record =>
            record.role === "user"
        )
        .length;

    console.log(
      `[${TOOL_NAME}] prompts=${userCount}, ` +
      `saved messages=${records.size}, ` +
      `seen turns=${coverage.size}, ` +
      `scroll=${
        Math.round(
          context.port.maximum
            ? context.port.top /
                context.port.maximum *
                100
            : 100
        )
      }%`
    );
  }

  async function scanPass(
    context,
    pass
  ) {
    const {
      port,
      config,
      signal,
      deadline
    } = context;

    const reachedTop =
      await settleAtTop(context);

    let bottomStable = 0;
    let previousBottomState = "";

    for (
      let moveNumber = 0;
      moveNumber <
        config.maximumMovesPerPass;
      moveNumber++
    ) {
      assertRunning(signal, deadline);

      const capture =
        captureMounted(context);

      reportProgress(context);

      if (
        port.top >=
        port.maximum - 2
      ) {
        await delay(
          config.bottomRecheckMs,
          signal
        );

        const nextCapture =
          captureMounted(context);

        const state = [
          Math.round(port.top),
          Math.round(port.maximum),
          context.coverage.size,
          nextCapture.mountedKeys.size
        ].join(":");

        bottomStable =
          state === previousBottomState
            ? bottomStable + 1
            : 0;

        previousBottomState = state;

        if (
          bottomStable >=
          config.bottomStableChecks
        ) {
          return {
            reachedTop,
            reachedBottom: true,
            moves: moveNumber
          };
        }

        port.setTop(port.maximum);
        continue;
      }

      bottomStable = 0;

      await advance(
        context,
        capture,
        pass
      );
    }

    return {
      reachedTop,
      reachedBottom:
        port.top >= port.maximum - 2,
      moves:
        config.maximumMovesPerPass
    };
  }

  function sameConversation(sourceUrl) {
    if (!sourceUrl)
      return false;

    try {
      return new URL(
        sourceUrl,
        location.href
      ).pathname === location.pathname;
    } catch {
      return false;
    }
  }

  function normalizeCachedRecord(
    record,
    defaultRole = "user"
  ) {
    const role =
      record.role || defaultRole;

    const messageId =
      record.message_id ||
      record.messageId ||
      null;

    const turnTestId =
      record.turn_testid ||
      record.turnTestId ||
      null;

    const rawTurnNumber =
      record.turn_number ??
      record.turnNumber;

    const turnNumber =
      rawTurnNumber != null &&
      rawTurnNumber !== "" &&
      Number.isFinite(
        Number(rawTurnNumber)
      )
        ? Number(rawTurnNumber)
        : null;

    const key =
      record.key ||
      (
        messageId
          ? `id:${messageId}`
          : turnTestId
            ? `turn:${turnTestId}:${role}`
            : null
      );

    if (!key)
      return null;

    return {
      ...record,
      key,
      role,
      message_id: messageId,
      turn_testid: turnTestId,
      turn_number: turnNumber,
      text:
        record.text ??
        record.inner_text ??
        record.text_content ??
        "",
      source:
        "compatible window cache"
    };
  }

  function seedCompatibleCaches(
    context
  ) {
    if (
      !context.config
        .reuseCompatibleWindowCaches
    ) {
      return 0;
    }

    const candidates = [
      api.lastResult,
      previousTool?.lastResult,
      window.__CHATGPT_FULL_SCAN__,
      window.__CHATGPT_SCROLL_PROMPTS__,
      window.__CHATGPT_DOM_PROMPTS__
    ].filter(Boolean);

    let seeded = 0;

    for (const candidate of candidates) {
      if (
        !sameConversation(
          candidate.source_url
        )
      ) {
        continue;
      }

      const messages =
        candidate.messages ||
        candidate.prompts ||
        [];

      const defaultRole =
        candidate.messages
          ? "unknown"
          : "user";

      for (const rawRecord of messages) {
        const record =
          normalizeCachedRecord(
            rawRecord,
            defaultRole
          );

        if (!record)
          continue;

        if (
          shouldExportRole(
            record.role,
            context.config
          ) &&
          !context.records.has(record.key)
        ) {
          context.records.set(
            record.key,
            record
          );

          seeded++;
        }
      }
    }

    return seeded;
  }

  function roleCounts(records) {
    return records.reduce(
      (counts, record) => {
        counts[record.role] =
          (counts[record.role] || 0) + 1;

        return counts;
      },
      {}
    );
  }

  function sortRecords(records) {
    return [...records.values()]
      .sort((left, right) => {
        const leftTurn =
          Number.isFinite(
            left.turn_number
          )
            ? left.turn_number
            : Number.MAX_SAFE_INTEGER;

        const rightTurn =
          Number.isFinite(
            right.turn_number
          )
            ? right.turn_number
            : Number.MAX_SAFE_INTEGER;

        return (
          leftTurn -
            rightTurn ||
          (
            left
              .approximate_document_top_at_capture ??
            Number.MAX_SAFE_INTEGER
          ) -
          (
            right
              .approximate_document_top_at_capture ??
            Number.MAX_SAFE_INTEGER
          ) ||
          (
            left.captured_after_ms ??
            0
          ) -
          (
            right.captured_after_ms ??
            0
          ) ||
          left.key.localeCompare(
            right.key
          )
        );
      });
  }

  function numericTurnGaps(coverage) {
    const turns = [
      ...new Set(
        [...coverage.values()]
          .map(
            record =>
              record.turn_number
          )
          .filter(Number.isFinite)
      )
    ].sort(
      (left, right) =>
        left - right
    );

    const gaps = [];

    for (
      let index = 1;
      index < turns.length;
      index++
    ) {
      const missing =
        turns[index] -
        turns[index - 1] -
        1;

      if (missing > 0) {
        gaps.push({
          after: turns[index - 1],
          before: turns[index],
          missing
        });
      }
    }

    return gaps;
  }

  function detectConversationTitle(
    override
  ) {
    const clean = value =>
      String(value || "")
        .replace(
          /^\s*(?:ChatGPT|OpenAI)\s*[-—|:]\s*/i,
          ""
        )
        .replace(
          /\s*[-—|:]\s*(?:ChatGPT|OpenAI)\s*$/i,
          ""
        )
        .replace(/\s+/g, " ")
        .trim();

    const candidates = [];

    if (override)
      candidates.push(override);

    for (
      const link of
        document.querySelectorAll(
          "a[href]"
        )
    ) {
      try {
        if (
          new URL(
            link.href,
            location.href
          ).pathname ===
          location.pathname
        ) {
          candidates.push(
            link.getAttribute("title"),
            link.innerText,
            link.textContent
          );
        }
      } catch {
        // Ignore malformed hrefs.
      }
    }

    candidates.push(document.title);

    for (
      const value of
        candidates.map(clean)
    ) {
      if (
        value &&
        !/^(chatgpt|new chat|openai)$/i
          .test(value) &&
        value.length <= 180
      ) {
        return value;
      }
    }

    const conversationId =
      location.pathname
        .match(
          /\/(?:c|g)\/([^/?#]+)/
        )?.[1];

    return conversationId
      ? `chat-${conversationId.slice(
          0,
          12
        )}`
      : "chatgpt-chat";
  }

  function localTimestamp(date) {
    const part = (
      value,
      length = 2
    ) =>
      String(value)
        .padStart(length, "0");

    return [
      part(date.getFullYear(), 4),
      part(date.getMonth() + 1),
      part(date.getDate()),
      "_",
      part(date.getHours()),
      part(date.getMinutes()),
      part(date.getSeconds())
    ].join("");
  }

  function safeFilePart(
    value,
    maximumLength = 110
  ) {
    const cleaned = String(value)
      .normalize("NFKC")
      .replace(
        /[<>:"/\\|?*\u0000-\u001f]/g,
        "_"
      )
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, maximumLength) ||
      "chatgpt-chat";

    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
      .test(cleaned)
        ? `chat-${cleaned}`
        : cleaned;
  }

  function readableText(bundle) {
    let userIndex = 0;
    let assistantIndex = 0;

    const header = [
      `Chat: ${bundle.conversation_title}`,
      `Snapshot: ${bundle.snapshot_at}`,
      `Source: ${bundle.source_url}`,
      `User prompts: ${bundle.counts.user_prompts}`,
      `Model messages: ${bundle.counts.model_messages}`,
      `Saved messages: ${bundle.counts.saved_messages}`,
      `Scan duration: ${bundle.timing.scan_duration_seconds} seconds`,
      "Active visible branch only; hidden branches/system messages are not available through the DOM.",
      ""
    ];

    const sections =
      bundle.messages.map(message => {
        let label;

        if (message.role === "user") {
          label =
            `USER PROMPT ${++userIndex}`;
        } else if (
          message.role === "assistant"
        ) {
          label =
            `MODEL MESSAGE ${++assistantIndex}`;
        } else {
          label =
            message.role.toUpperCase();
        }

        const identity = [
          Number.isFinite(
            message.turn_number
          )
            ? `turn ${message.turn_number}`
            : null,
          message.message_id
            ? `id ${message.message_id}`
            : null
        ]
          .filter(Boolean)
          .join(" | ");

        const extras = [];

        if (
          message.attachments?.length
        ) {
          extras.push(
            "Attachments:\n" +
            message.attachments
              .map(
                item =>
                  `- ${
                    item.text ||
                    item.ariaLabel ||
                    item.testId ||
                    "attachment"
                  }`
              )
              .join("\n")
          );
        }

        if (message.media?.length) {
          extras.push(
            "Media:\n" +
            message.media
              .map(
                item =>
                  `- ${item.type}: ${
                    item.alt ||
                    item.title ||
                    item.ariaLabel ||
                    item.source ||
                    "unlabelled"
                  }`
              )
              .join("\n")
          );
        }

        return [
          `===== ${label}${
            identity
              ? ` | ${identity}`
              : ""
          } =====`,
          message.text || "",
          ...extras,
          ""
        ].join("\n");
      });

    return [
      ...header,
      ...sections
    ].join("\n");
  }

  function downloadFile(
    content,
    mimeType,
    filename
  ) {
    const blob = new Blob(
      ["\ufeff", content],
      {
        type:
          `${mimeType};charset=utf-8`
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link = Object.assign(
      document.createElement("a"),
      {
        href: url,
        download: filename
      }
    );

    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(
      () => URL.revokeObjectURL(url),
      15_000
    );
  }

  function downloadBundle(
    bundle,
    requestedFormat =
      bundle.settings.outputFormat
  ) {
    const format =
      String(requestedFormat)
        .toLowerCase();

    if (
      !["txt", "json", "both"]
        .includes(format)
    ) {
      throw new Error(
        'Download format must be "txt", "json", or "both".'
      );
    }

    const base =
      bundle.output_basename;

    if (
      format === "json" ||
      format === "both"
    ) {
      downloadFile(
        JSON.stringify(
          bundle,
          null,
          2
        ),
        "application/json",
        `${base}.json`
      );
    }

    if (
      format === "txt" ||
      format === "both"
    ) {
      setTimeout(
        () =>
          downloadFile(
            bundle.readable_chat,
            "text/plain",
            `${base}.txt`
          ),
        format === "both"
          ? 180
          : 0
      );
    }

    return { format, basename: base };
  }

  function streamingNow() {
    return Boolean(
      document.querySelector(
        '[data-testid="stop-button"], button[aria-label*="stop generating" i], button[aria-label*="stop streaming" i]'
      )
    );
  }

  async function run(overrides = {}) {
    if (api.running) {
      throw new Error(
        "An extraction is already running."
      );
    }

    if (
      cacheConversationPath !==
      location.pathname
    ) {
      runtimeCache.clear();
      cacheConversationPath =
        location.pathname;
    }

    const config =
      normalizeConfig(overrides);

    const initialMessages =
      mountedMessageElements();

    if (!initialMessages.length) {
      throw new Error(
        "No ChatGPT message elements were found. Open a conversation and try again."
      );
    }

    const controller =
      new AbortController();

    activeAbortController =
      controller;

    api.running = true;
    api.lastError = null;

    const startedAt = new Date();

    const startedPerformance =
      performance.now();

    const deadline =
      startedPerformance +
      config.maximumRuntimeMs;

    const scroller =
      findConversationScroller(
        initialMessages
      );

    const port =
      makeScrollPort(scroller);

    const originalRatio =
      port.maximum
        ? port.top / port.maximum
        : 1;

    const records = runtimeCache;
    const coverage = new Map();

    const stats = {
      captures: 0,
      moves: 0,
      anchorMoves: 0,
      manualMoves: 0,
      anchorFallbacks: 0,
      anchorFailuresInARow: 0,
      anchorCooldown: 0,
      continuityRisks: 0,
      settleMs: 0,
      mutations: 0,
      newCoverage: 0,
      newRecords: 0,
      seededRecords: 0,
      cacheHits: 0,
      validationPasses: 0,
      lastReportedRecords: 0,
      lastReportedAt:
        startedPerformance
    };

    const context = {
      config,
      signal: controller.signal,
      deadline,
      startedPerformance,
      port,
      records,
      coverage,
      stats
    };

    const streamingAtStart =
      streamingNow();

    try {
      stats.seededRecords =
        seedCompatibleCaches(context);

      stats.cachedRecordsAvailableAtStart =
        records.size;

      console.log(
        `[${TOOL_NAME} ${TOOL_VERSION}] ` +
        `Starting ${
          config.includeModelMessages
            ? "full-chat"
            : "prompt-only"
        } scan. ` +
        `Cached records reused: ${
          stats.seededRecords
        }. ` +
        `Use ${TOOL_NAME}.stop() to abort.`
      );

      const fastPass =
        await scanPass(context, {
          name:
            "adaptive anchor pass",
          allowAnchors: true,
          stepViewports:
            config.manualStepViewports,
          settleMaximumMs:
            config.maximumSettleMs
        });

      const currentUserCount =
        [...records.values()]
          .filter(
            record =>
              record.role === "user" &&
              coverage.has(record.key)
          )
          .length;

      const expectedCountMissed =
        config.expectedUserPromptCount !=
          null &&
        currentUserCount <
          config.expectedUserPromptCount;

      const needsValidation =
        config.runValidationPassOnRisk &&
        (
          !fastPass.reachedTop ||
          !fastPass.reachedBottom ||
          stats.continuityRisks > 0 ||
          expectedCountMissed
        );

      let validationPass = null;

      if (needsValidation) {
        stats.validationPasses++;

        console.warn(
          `[${TOOL_NAME}] Fast traversal needs validation ` +
          `(continuity risks=${
            stats.continuityRisks
          }, expected-count-missed=${
            expectedCountMissed
          }). ` +
          "Running the slower overlapping scroll pass."
        );

        stats.anchorCooldown = 0;

        validationPass =
          await scanPass(context, {
            name:
              "overlapping validation pass",
            allowAnchors: false,
            stepViewports:
              config.fallbackStepViewports,
            settleMaximumMs:
              Math.max(
                config.maximumSettleMs,
                900
              )
          });
      }

      captureMounted(context);

      const finishedAt = new Date();

      const durationMs =
        Math.round(
          performance.now() -
          startedPerformance
        );

      const activeBranchRecords =
        new Map(
          [...records].filter(
            ([, record]) =>
              coverage.has(record.key) &&
              shouldExportRole(
                record.role,
                config
              )
          )
        );

      const messages =
        sortRecords(activeBranchRecords)
          .map(record =>
            config.includeMessageHtml
              ? record
              : {
                  ...record,
                  html: undefined
                }
          );

      const counts =
        roleCounts(messages);

      const promptCount =
        counts.user || 0;

      const modelCount =
        counts.assistant || 0;

      const title =
        detectConversationTitle(
          config.chatTitleOverride
        );

      const snapshotLabel =
        localTimestamp(finishedAt);

      const outputBase = [
        safeFilePart(title),
        `prompts-${promptCount}`,
        config.includeModelMessages
          ? `model-${modelCount}`
          : "user-only",
        `snapshot-${snapshotLabel}`
      ].join("__");

      const turnGaps =
        numericTurnGaps(coverage);

      const result = {
        schema:
          "chatgpt-active-branch-extract-v1",
        extractor_version:
          TOOL_VERSION,
        conversation_title: title,
        conversation_id:
          location.pathname
            .match(
              /\/(?:c|g)\/([^/?#]+)/
            )?.[1] || null,
        source_url: location.href,
        snapshot_at:
          finishedAt.toISOString(),
        snapshot_local_label:
          snapshotLabel,
        output_basename: outputBase,
        scope:
          "active DOM-visible conversation branch",

        settings: {
          includeModelMessages:
            config.includeModelMessages,
          includeOtherRoles:
            config.includeOtherRoles,
          includeMessageHtml:
            config.includeMessageHtml,
          includeLinks:
            config.includeLinks,
          includeMediaMetadata:
            config.includeMediaMetadata,
          outputFormat:
            config.outputFormat,
          expectedUserPromptCount:
            config.expectedUserPromptCount
        },

        timing: {
          started_at:
            startedAt.toISOString(),
          finished_at:
            finishedAt.toISOString(),
          scan_duration_ms:
            durationMs,
          scan_duration_seconds:
            Number(
              (durationMs / 1000)
                .toFixed(3)
            )
        },

        counts: {
          user_prompts:
            promptCount,
          model_messages:
            modelCount,
          saved_messages:
            messages.length,
          all_roles_seen_during_traversal:
            coverage.size,
          role_counts: counts
        },

        validation: {
          reached_top:
            validationPass?.reachedTop ??
            fastPass.reachedTop,
          reached_bottom:
            validationPass?.reachedBottom ??
            fastPass.reachedBottom,
          expected_prompt_count_satisfied:
            config.expectedUserPromptCount ==
              null
              ? null
              : promptCount >=
                config.expectedUserPromptCount,
          continuity_risks_detected:
            stats.continuityRisks,
          validation_pass_run:
            Boolean(validationPass),
          numeric_turn_gaps:
            turnGaps,
          note:
            "A numeric turn gap can be legitimate when consecutive user turns or an unanswered user turn have no intervening assistant message."
        },

        streaming: {
          detected_at_start:
            streamingAtStart,
          detected_at_finish:
            streamingNow(),
          warning:
            streamingAtStart ||
            streamingNow()
              ? "A model response was streaming during the snapshot and may be partial."
              : null
        },

        traversal: {
          scroller:
            port.describe(),
          captures:
            stats.captures,
          moves:
            stats.moves,
          anchor_moves:
            stats.anchorMoves,
          manual_moves:
            stats.manualMoves,
          anchor_fallbacks:
            stats.anchorFallbacks,
          mutations_observed:
            stats.mutations,
          settle_time_ms:
            stats.settleMs,
          cached_records_available_at_start:
            stats.cachedRecordsAvailableAtStart,
          records_reused_from_cache:
            stats.cacheHits,
          new_records_read_from_dom:
            stats.newRecords
        },

        messages
      };

      result.readable_chat =
        readableText(result);

      api.lastResult = result;

      window.__CHATGPT_PROMPT_EXTRACT__ =
        result;

      reportProgress(context, true);

      if (
        config.restoreScrollPosition
      ) {
        await moveAndSettle(
          port,
          () =>
            port.setTop(
              originalRatio *
              port.maximum
            ),
          config,
          controller.signal,
          Math.min(
            config.maximumSettleMs,
            300
          )
        );
      }

      if (config.autoDownload) {
        downloadBundle(
          result,
          config.outputFormat
        );
      }

      console.table({
        prompts: promptCount,
        model_messages: modelCount,
        saved_messages:
          messages.length,
        all_roles_seen:
          coverage.size,
        seconds:
          result.timing
            .scan_duration_seconds,
        anchor_moves:
          stats.anchorMoves,
        anchor_fallbacks:
          stats.anchorFallbacks,
        validation_pass:
          Boolean(validationPass),
        reached_top:
          result.validation.reached_top,
        reached_bottom:
          result.validation.reached_bottom
      });

      console.log(
        `[${TOOL_NAME}] COMPLETE — ${outputBase}`
      );

      console.log(
        `Result cache: window.__CHATGPT_PROMPT_EXTRACT__ or ${TOOL_NAME}.lastResult`
      );

      return result;
    } catch (error) {
      api.lastError = error;

      if (
        config.restoreScrollPosition &&
        !controller.signal.aborted
      ) {
        try {
          port.setTop(
            originalRatio *
            port.maximum
          );
        } catch {
          // Best effort.
        }
      }

      if (
        error?.name === "AbortError"
      ) {
        console.warn(
          `[${TOOL_NAME}] Stopped. Partial records remain in memory.`
        );
      } else {
        console.error(
          `[${TOOL_NAME}] FAILED:`,
          error
        );
      }

      throw error;
    } finally {
      api.running = false;
      activeAbortController = null;
    }
  }

  // Auto-run when pasted or executed as a DevTools Snippet.
  void api.run().catch(error => {
    if (api.lastError === error)
      return;

    api.lastError = error;

    console.error(
      `[${TOOL_NAME}] FAILED:`,
      error
    );
  });
})();
