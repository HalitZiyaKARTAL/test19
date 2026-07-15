/*
 * ChatGPT Prompt / Full-Chat Extractor v2.1.1 — 2026-07-15
 *
 * Paste into the DevTools Console or save as a DevTools Snippet while the
 * target ChatGPT conversation is open. It reads only the active DOM branch,
 * makes no network requests, changes no messages, and downloads one .txt file
 * containing clean, pretty-printed JSON.
 */
(() => {
  "use strict";

  // ======================== EDIT THESE ========================
  const INCLUDE_MODEL_MESSAGES = true; // true = user + assistant; false = prompts only
  const EXPECTED_USER_PROMPTS = null;   // e.g. 145; null = discover automatically
  const CHAT_TITLE_OVERRIDE = "";       // blank = detect the current chat title
  const INCLUDE_MESSAGE_HTML = false;   // true only for exact/heavier DOM archiving
  const FORCE_CONSERVATIVE_PASS = false;// true = always verify with slow overlap scrolling
  const INCLUDE_DEBUG_LOG = true;       // bounded diagnostics inside the exported JSON
  // ============================================================

  const NAME = "ChatGPTPromptExtractorV2";
  const VERSION = "2.1.1";
  const SELECTOR = "[data-message-author-role]";
  const DEFAULTS = {
    includeModelMessages: INCLUDE_MODEL_MESSAGES,
    expectedUserPrompts: EXPECTED_USER_PROMPTS,
    chatTitleOverride: CHAT_TITLE_OVERRIDE,
    includeMessageHtml: INCLUDE_MESSAGE_HTML,
    forceConservativePass: FORCE_CONSERVATIVE_PASS,
    includeDebugLog: INCLUDE_DEBUG_LOG,
    debugEventLimit: 500,
    includeOtherRoles: false,
    includeLinks: true,
    includeMedia: true,
    includeMediaUrls: true,
    restoreScroll: true,
    autoDownload: true,
    frontierOverlapViewports: 0.18,
    fastStepViewports: 0.82,
    fallbackStepViewports: 0.50,
    geometryGapViewports: 0.22,
    minimumSettleMs: 60,
    unchangedSettleMs: 150,
    maximumSettleMs: 700,
    edgeSettleMs: 650,
    bottomRecheckMs: 200,
    bottomStableChecks: 4,
    maximumMovesPerPass: 6000,
    maximumRuntimeMs: 20 * 60 * 1000,
    progressEveryMessages: 25,
    progressEveryMs: 12000
  };

  const previous = window[NAME];
  if (previous?.running) {
    console.warn(`[${NAME}] Already running. Use ${NAME}.stop() first.`);
    return;
  }

  let activeController = null;
  const api = window[NAME] = {
    version: VERSION,
    running: false,
    lastResult: previous?.lastResult || null,
    lastDebug: previous?.lastDebug || null,
    lastError: null,
    run,
    stop() {
      if (!activeController) return false;
      activeController.abort("Stopped by user");
      return true;
    },
    download() {
      if (!api.lastResult) throw Error("No completed extraction is cached.");
      return download(api.lastResult);
    },
    readable() {
      if (!api.lastResult) throw Error("No completed extraction is cached.");
      return readable(api.lastResult);
    }
  };

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function abortError(reason = "Extraction stopped") {
    return new DOMException(String(reason), "AbortError");
  }

  function check(context) {
    if (context.signal.aborted) throw abortError(context.signal.reason);
    if (location.pathname !== context.conversationPath)
      throw Error("The conversation changed while extraction was running.");
    if (performance.now() > context.deadline)
      throw Error("Maximum extraction runtime was reached.");
  }

  function wait(ms, signal) {
    if (signal.aborted) return Promise.reject(abortError(signal.reason));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(done, ms);
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

  function frames(count, signal) {
    return new Promise((resolve, reject) => {
      function next() {
        if (signal.aborted) return reject(abortError(signal.reason));
        if (!count--) return resolve();
        requestAnimationFrame(next);
      }
      next();
    });
  }

  function hash(text) {
    let value = 2166136261;
    for (let index = 0; index < text.length; index++)
      value = Math.imul(value ^ text.charCodeAt(index), 16777619);
    return (value >>> 0).toString(36);
  }

  function config(overrides) {
    const external = window.ChatGPTPromptExtractorV2Config || {};
    const value = { ...DEFAULTS, ...external, ...overrides };
    const expected = value.expectedUserPrompts;

    value.expectedUserPrompts = expected == null || expected === ""
      ? null
      : Number(expected);
    if (value.expectedUserPrompts != null &&
        (!Number.isInteger(value.expectedUserPrompts) || value.expectedUserPrompts < 0))
      throw Error("expectedUserPrompts must be null or a non-negative integer.");

    value.frontierOverlapViewports = clamp(Number(value.frontierOverlapViewports) || 0.18, 0.05, 0.45);
    value.fastStepViewports = clamp(Number(value.fastStepViewports) || 0.82, 0.35, 0.95);
    value.fallbackStepViewports = clamp(Number(value.fallbackStepViewports) || 0.50, 0.20, 0.70);
    value.geometryGapViewports = clamp(Number(value.geometryGapViewports) || 0.22, 0.08, 0.50);
    value.debugEventLimit = clamp(Math.round(Number(value.debugEventLimit) || 500), 50, 5000);
    return value;
  }

  function debug(context, event, details = {}) {
    if (!context.settings.includeDebugLog) return;
    if (context.debugEvents.length >= context.settings.debugEventLimit) {
      context.debugDropped++;
      return;
    }
    context.debugEvents.push({
      at_ms: Math.round(performance.now() - context.startedPerformance),
      phase: context.phase,
      event,
      ...details
    });
  }

  function memorySnapshot() {
    const value = performance.memory;
    return value ? {
      used_js_heap_bytes: value.usedJSHeapSize,
      total_js_heap_bytes: value.totalJSHeapSize,
      js_heap_limit_bytes: value.jsHeapSizeLimit
    } : null;
  }

  function environmentSnapshot(port) {
    return {
      user_agent: navigator.userAgent || null,
      language: navigator.language || null,
      platform: navigator.userAgentData?.platform || navigator.platform || null,
      hardware_concurrency: navigator.hardwareConcurrency || null,
      device_memory_gb: navigator.deviceMemory || null,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      device_pixel_ratio: window.devicePixelRatio || 1,
      visibility_state: document.visibilityState,
      initial_scroll_top: Math.round(port.top),
      initial_scroll_maximum: Math.round(port.max)
    };
  }

  function watchLongTasks(context) {
    if (typeof PerformanceObserver !== "function" ||
        !PerformanceObserver.supportedEntryTypes?.includes("longtask")) return null;
    try {
      const observer = new PerformanceObserver(list => addLongTasks(context, list.getEntries()));
      observer.observe({ type: "longtask", buffered: false });
      return observer;
    } catch {
      return null;
    }
  }

  function addLongTasks(context, entries) {
    for (const item of entries) {
      context.stats.longTaskCount++;
      context.stats.longTaskMs += item.duration;
      context.stats.maxLongTaskMs = Math.max(context.stats.maxLongTaskMs, item.duration);
    }
  }

  async function timedPhase(context, name, task) {
    const previousPhase = context.phase;
    context.phase = name;
    const started = performance.now();
    debug(context, "phase_start");
    try {
      return await task();
    } finally {
      const duration = performance.now() - started;
      context.phaseTimings[name] = Number(duration.toFixed(3));
      debug(context, "phase_finish", { duration_ms: Number(duration.toFixed(3)) });
      context.phase = previousPhase;
    }
  }

  function mounted() {
    return [...document.querySelectorAll(SELECTOR)].filter(node => node.isConnected);
  }

  function turnFor(message) {
    return message.closest('[data-testid^="conversation-turn-"]') ||
      message.closest("article") ||
      message.closest("[data-message-id]") ||
      message;
  }

  function identity(message, turn) {
    const role = message.getAttribute("data-message-author-role") || "unknown";
    const messageId = message.getAttribute("data-message-id") ||
      turn.getAttribute("data-message-id") || null;
    const testId = turn.getAttribute("data-testid") || null;
    const match = testId?.match(/conversation-turn-(\d+)/i) || testId?.match(/(\d+)(?!.*\d)/);
    const turnNumber = match ? Number(match[1]) : null;
    const key = messageId ? `id:${messageId}` :
      testId ? `turn:${testId}:${role}` :
      `fallback:${hash(`${role}\0${message.textContent || ""}`)}`;

    return {
      key,
      role,
      messageId,
      testId,
      turnNumber: Number.isFinite(turnNumber) ? turnNumber : null,
      unstable: !messageId && !testId
    };
  }

  function findScroller(seed) {
    const documentScroller = document.scrollingElement || document.documentElement;
    for (let node = seed.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.scrollHeight > node.clientHeight + 80 &&
          /(auto|scroll|overlay)/.test(style.overflowY)) return node;
    }
    return documentScroller;
  }

  function scrollPort(scroller) {
    const isDocument = scroller === document.scrollingElement ||
      scroller === document.documentElement || scroller === document.body;
    const styleNode = isDocument ? document.documentElement : scroller;

    return {
      scroller,
      isDocument,
      mutationRoot: isDocument ? document.body : scroller,
      get top() { return isDocument ? window.scrollY : scroller.scrollTop; },
      get view() { return isDocument ? window.innerHeight : scroller.clientHeight; },
      get height() {
        return isDocument
          ? Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
          : scroller.scrollHeight;
      },
      get max() { return Math.max(0, this.height - this.view); },
      bounds() {
        if (isDocument) return { top: 0, bottom: window.innerHeight };
        const rect = scroller.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      },
      set(value) {
        const target = clamp(value, 0, this.max);
        if (isDocument) window.scrollTo(0, target);
        else scroller.scrollTop = target;
        return target;
      },
      disableSmooth() {
        const old = styleNode.style.scrollBehavior;
        styleNode.style.scrollBehavior = "auto";
        return () => { styleNode.style.scrollBehavior = old; };
      },
      describe() {
        if (isDocument) return { type: "document" };
        const className = typeof scroller.className === "string" ? scroller.className : "";
        return {
          type: "element",
          tag: scroller.tagName,
          id: scroller.id || null,
          class: className ? className.slice(0, 240) : null,
          class_truncated: className.length > 240
        };
      }
    };
  }

  function wanted(role, settings) {
    return role === "user" ||
      (role === "assistant" && settings.includeModelMessages) ||
      (!/^(user|assistant)$/.test(role) && settings.includeOtherRoles);
  }

  function linksFrom(element) {
    const found = [], seen = new Set();
    for (const link of element.querySelectorAll("a[href]")) {
      const href = link.href || link.getAttribute("href") || "";
      const text = (link.innerText || link.textContent || link.getAttribute("aria-label") || "").trim();
      const key = `${text}\0${href}`;
      if (!seen.has(key)) {
        seen.add(key);
        found.push({ text, href });
      }
    }
    return found;
  }

  function mediaFrom(element, includeUrls) {
    const media = [];
    for (const node of element.querySelectorAll("img,video,audio,source")) {
      const raw = node.getAttribute("src") || node.getAttribute("poster") || "";
      media.push({
        type: node.tagName.toLowerCase(),
        alt: node.getAttribute("alt") || null,
        title: node.getAttribute("title") || null,
        aria_label: node.getAttribute("aria-label") || null,
        source: includeUrls
          ? (/^data:/i.test(raw) ? `[data URL: ${raw.length} characters]` : raw || null)
          : null,
        width: Number(node.getAttribute("width")) || node.naturalWidth || null,
        height: Number(node.getAttribute("height")) || node.naturalHeight || null
      });
    }

    const attachments = [], seen = new Set();
    const selector = [
      '[data-testid*="attachment"]', '[data-testid*="file"]',
      '[aria-label*="attachment" i]', '[aria-label*="file" i]'
    ].join(",");
    for (const node of element.querySelectorAll(selector)) {
      const item = {
        test_id: node.getAttribute("data-testid") || null,
        aria_label: node.getAttribute("aria-label") || null,
        text: (node.innerText || node.textContent || "").trim()
      };
      const key = JSON.stringify(item);
      if (!seen.has(key)) {
        seen.add(key);
        attachments.push(item);
      }
    }
    return { media, attachments };
  }

  function descriptor(message, port) {
    const turn = turnFor(message);
    const id = identity(message, turn);
    const rect = turn.getBoundingClientRect();
    const bounds = port.bounds();
    return {
      message,
      turn,
      id,
      rect,
      documentTop: port.top + rect.top - bounds.top
    };
  }

  function readRecord(item, context, old) {
    const readStarted = performance.now();
    const capturedAt = new Date().toISOString();
    const capturedAfter = Math.round(readStarted - context.startedPerformance);
    const scrollTop = Math.round(context.port.top);
    const scrollPercent = Number((context.port.max ? context.port.top / context.port.max * 100 : 100).toFixed(3));
    const time = item.turn.querySelector("time");
    const record = {
      key: item.id.key,
      role: item.id.role,
      message_id: item.id.messageId,
      turn_testid: item.id.testId,
      turn_number: item.id.turnNumber,
      unstable_key: item.id.unstable,
      encounter_order: old?.encounter_order ?? context.encounter++,
      displayed_or_dom_time: time?.dateTime || time?.getAttribute("datetime") || time?.innerText || null,
      captured_at: old?.captured_at || capturedAt,
      captured_after_ms: old?.captured_after_ms ?? capturedAfter,
      capture_phase: old?.capture_phase || context.phase,
      capture_scroll_top: old?.capture_scroll_top ?? scrollTop,
      capture_scroll_percent: old?.capture_scroll_percent ?? scrollPercent,
      last_refreshed_at: capturedAt,
      last_refreshed_after_ms: capturedAfter,
      last_refresh_phase: context.phase,
      last_refresh_scroll_top: scrollTop,
      last_refresh_scroll_percent: scrollPercent,
      capture_count: (old?.capture_count || 0) + 1,
      approximate_document_top_at_capture: old?.approximate_document_top_at_capture ?? Math.round(item.documentTop),
      last_approximate_document_top: Math.round(item.documentTop),
      text: item.message.innerText ?? item.message.textContent ?? ""
    };
    if (context.settings.includeLinks) record.links = linksFrom(item.message);
    if (context.settings.includeMedia)
      Object.assign(record, mediaFrom(item.message, context.settings.includeMediaUrls));
    if (context.settings.includeMessageHtml) record.html = item.message.innerHTML;

    const readDuration = Number((performance.now() - readStarted).toFixed(3));
    record.capture_duration_ms = old?.capture_duration_ms ?? readDuration;
    record.last_refresh_duration_ms = readDuration;
    record.total_capture_duration_ms = Number(((old?.total_capture_duration_ms || 0) + readDuration).toFixed(3));
    context.stats.messageReadOperations++;
    context.stats.messageReadMs += readDuration;
    context.stats.maxMessageReadMs = Math.max(context.stats.maxMessageReadMs, readDuration);
    if (old) context.stats.messageRefreshes++;
    else context.stats.messageInitialReads++;
    return record;
  }

  function capture(context, refresh = false) {
    check(context);
    const captureStarted = performance.now();
    const items = mounted().map(node => descriptor(node, context.port))
      .filter(item => item.rect.width > 0 && item.rect.height > 0)
      .sort((a, b) => a.rect.top - b.rect.top);
    const keys = new Set();
    let added = 0;

    for (const item of items) {
      keys.add(item.id.key);
      if (!context.coverage.has(item.id.key)) {
        context.coverage.set(item.id.key, {
          key: item.id.key,
          role: item.id.role,
          message_id: item.id.messageId,
          turn_number: item.id.turnNumber
        });
        added++;
      }
      if (wanted(item.id.role, context.settings) &&
          (!context.records.has(item.id.key) || refresh)) {
        const old = context.records.get(item.id.key);
        context.records.set(item.id.key, readRecord(item, context, old));
      }
    }

    const bounds = context.port.bounds();
    const tolerance = Math.max(96, context.port.view * context.settings.geometryGapViewports);
    let frontier = bounds.top;
    let continuous = false;
    for (const item of items) {
      if (item.rect.bottom < bounds.top - tolerance) continue;
      if (!continuous) {
        if (item.rect.top <= bounds.top + tolerance && item.rect.bottom >= bounds.top - tolerance) {
          frontier = Math.max(frontier, item.rect.bottom);
          continuous = true;
        } else break;
      } else if (item.rect.top <= frontier + tolerance) {
        frontier = Math.max(frontier, item.rect.bottom);
      } else break;
    }

    const captureDuration = Number((performance.now() - captureStarted).toFixed(3));
    context.stats.captures++;
    context.stats.captureMs += captureDuration;
    context.stats.maxCaptureMs = Math.max(context.stats.maxCaptureMs, captureDuration);
    context.stats.newTurns += added;
    debug(context, "capture", {
      refresh,
      mounted_messages: items.length,
      new_turns: added,
      saved_messages: context.records.size,
      duration_ms: captureDuration,
      scroll_top: Math.round(context.port.top),
      scroll_percent: Number((context.port.max ? context.port.top / context.port.max * 100 : 100).toFixed(2))
    });
    return { items, keys, added, frontier, continuous };
  }

  function signature(port) {
    const ids = mounted().map(node => {
      const turn = turnFor(node);
      return node.getAttribute("data-message-id") ||
        turn.getAttribute("data-message-id") ||
        turn.getAttribute("data-testid") || "?";
    });
    // Do not count the scrollTop assignment itself as DOM progress. If React
    // remounts slowly, this makes us wait for message IDs (or the longer
    // unchanged timeout) instead of stopping after the minimum delay.
    return `${Math.round(port.max)}:${ids.join("|")}`;
  }

  async function move(context, target, maximumWait = context.settings.maximumSettleMs) {
    check(context);
    const beforeTop = context.port.top;
    const beforeCoverage = context.coverage.size;
    let mutations = 0;
    let changedAt = performance.now();
    let lastSignature = signature(context.port);
    let signatureChanged = false;
    const observer = new MutationObserver(() => {
      mutations++;
      changedAt = performance.now();
    });
    observer.observe(context.port.mutationRoot, { childList: true, subtree: true });
    const started = performance.now();

    try {
      context.port.set(target);
      await frames(2, context.signal);
      while (performance.now() - started < maximumWait) {
        check(context);
        const next = signature(context.port);
        if (next !== lastSignature) {
          lastSignature = next;
          signatureChanged = true;
          changedAt = performance.now();
        }
        const elapsed = performance.now() - started;
        const quiet = performance.now() - changedAt;
        if (elapsed >= context.settings.minimumSettleMs &&
            (signatureChanged ? quiet >= 34 : elapsed >= context.settings.unchangedSettleMs)) break;
        await wait(18, context.signal);
      }
    } finally {
      observer.disconnect();
    }

    const elapsed = Math.round(performance.now() - started);
    context.stats.moves++;
    context.stats.mutations += mutations;
    context.stats.settleMs += elapsed;
    const result = capture(context);
    debug(context, "move", {
      requested_top: Math.round(target),
      before_top: Math.round(beforeTop),
      after_top: Math.round(context.port.top),
      scroll_maximum: Math.round(context.port.max),
      new_turns: context.coverage.size - beforeCoverage,
      mutations,
      signature_changed: signatureChanged,
      settle_ms: elapsed
    });
    return result;
  }

  function overlap(left, right) {
    if (left.size > right.size) [left, right] = [right, left];
    for (const key of left) if (right.has(key)) return true;
    return false;
  }

  async function settleAtTop(context) {
    let stable = 0, prior = "";
    for (let attempt = 0; attempt < 7 && stable < 2; attempt++) {
      await move(context, 0, context.settings.edgeSettleMs);
      const state = `${Math.round(context.port.top)}:${Math.round(context.port.max)}:${signature(context.port)}`;
      stable = state === prior ? stable + 1 : 0;
      prior = state;
      if (!stable) await wait(70, context.signal);
    }
    const reached = context.port.top <= 2;
    debug(context, "top_settled", { reached, attempts_state: prior });
    return reached;
  }

  function report(context, force = false) {
    const now = performance.now();
    const userCount = [...context.records.values()].filter(item => item.role === "user").length;
    if (!force &&
        userCount < context.stats.lastUserReport + context.settings.progressEveryMessages &&
        now < context.stats.lastReportAt + context.settings.progressEveryMs) return;
    context.stats.lastUserReport = userCount;
    context.stats.lastReportAt = now;
    console.log(
      `[${NAME}] prompts=${userCount}, saved=${context.records.size}, seen=${context.coverage.size}, ` +
      `scroll=${Math.round(context.port.max ? context.port.top / context.port.max * 100 : 100)}%`
    );
  }

  async function step(context, current, conservative) {
    const { port, settings, stats } = context;
    const beforeTop = port.top;
    const beforeMax = port.max;
    const beforeKeys = current.keys;
    const frontierDistance = current.continuous
      ? current.frontier - port.bounds().top - port.view * settings.frontierOverlapViewports
      : 0;
    const frontierMode = !conservative && frontierDistance > port.view * settings.fastStepViewports;
    const distance = frontierMode ? frontierDistance :
      port.view * (conservative ? settings.fallbackStepViewports : settings.fastStepViewports);
    const target = clamp(beforeTop + Math.max(120, distance), 0, beforeMax);

    debug(context, "step_decision", {
      mode: conservative ? "conservative overlap" : frontierMode ? "frontier jump" : "fast overlap",
      before_top: Math.round(beforeTop),
      target_top: Math.round(target),
      frontier_distance: Math.round(frontierDistance),
      mounted_messages: current.items.length
    });

    if (target <= beforeTop + 2) return { atBottom: true, stalled: false };
    const after = await move(context, target, conservative ? Math.max(850, settings.maximumSettleMs) : settings.maximumSettleMs);
    const travelled = Math.max(0, port.top - beforeTop);

    if (frontierMode && travelled > port.view * 0.75 && !overlap(beforeKeys, after.keys)) {
      stats.frontierRewinds++;
      debug(context, "frontier_rewind", {
        before_top: Math.round(beforeTop),
        unsafe_top: Math.round(port.top),
        reason: "no mounted-message overlap after a large frontier jump"
      });
      console.warn(`[${NAME}] Frontier lost DOM continuity; rewinding and overlap-scrolling.`);
      await move(context, beforeTop, Math.max(500, settings.maximumSettleMs));
      await move(context, beforeTop + port.view * settings.fallbackStepViewports,
        Math.max(850, settings.maximumSettleMs));
      return { atBottom: false, stalled: port.top <= beforeTop + 2 };
    }

    if (frontierMode) stats.frontierJumps++;
    else stats.overlapSteps++;
    return { atBottom: false, stalled: port.top <= beforeTop + 2 };
  }

  async function scan(context, conservative) {
    const reachedTop = await settleAtTop(context);
    let bottomStable = 0, bottomState = "", stalled = 0;

    for (let count = 0; count < context.settings.maximumMovesPerPass; count++) {
      check(context);
      const current = capture(context);
      report(context);

      if (context.port.top >= context.port.max - 2) {
        await wait(context.settings.bottomRecheckMs, context.signal);
        const latest = capture(context, streaming());
        const state = `${Math.round(context.port.top)}:${Math.round(context.port.max)}:${context.coverage.size}:${latest.keys.size}`;
        bottomStable = state === bottomState ? bottomStable + 1 : 0;
        bottomState = state;
        context.port.set(context.port.max);
        if (bottomStable >= context.settings.bottomStableChecks)
          {
            debug(context, "bottom_settled", { checks: bottomStable, moves: count });
            return { reachedTop, reachedBottom: true, stalled: false, moves: count };
          }
        continue;
      }

      bottomStable = 0;
      const result = await step(context, current, conservative);
      stalled = result.stalled ? stalled + 1 : 0;
      if (stalled >= 6)
        return { reachedTop, reachedBottom: false, stalled: true, moves: count + 1 };
    }
    return {
      reachedTop,
      reachedBottom: context.port.top >= context.port.max - 2,
      stalled: false,
      moves: context.settings.maximumMovesPerPass
    };
  }

  function roleCounts(messages) {
    return messages.reduce((out, item) => {
      out[item.role] = (out[item.role] || 0) + 1;
      return out;
    }, {});
  }

  function sorted(records) {
    return [...records.values()].sort((a, b) => {
      const at = Number.isFinite(a.turn_number) ? a.turn_number : Number.MAX_SAFE_INTEGER;
      const bt = Number.isFinite(b.turn_number) ? b.turn_number : Number.MAX_SAFE_INTEGER;
      return at - bt ||
        (a.approximate_document_top_at_capture ?? Number.MAX_SAFE_INTEGER) -
          (b.approximate_document_top_at_capture ?? Number.MAX_SAFE_INTEGER) ||
        a.encounter_order - b.encounter_order || a.key.localeCompare(b.key);
    });
  }

  function turnGaps(coverage) {
    const turns = [...new Set([...coverage.values()]
      .map(item => item.turn_number).filter(Number.isFinite))].sort((a, b) => a - b);
    const gaps = [];
    for (let index = 1; index < turns.length; index++) {
      const missing = turns[index] - turns[index - 1] - 1;
      if (missing > 0) gaps.push({ after: turns[index - 1], before: turns[index], missing });
    }
    return gaps;
  }

  function title(override) {
    const clean = value => String(value || "")
      .replace(/^\(\d+\)\s*/, "")
      .replace(/^\s*(?:ChatGPT|OpenAI)\s*[-—|:]\s*/i, "")
      .replace(/\s*[-—|:]\s*(?:ChatGPT|OpenAI)\s*$/i, "")
      .replace(/\s+/g, " ").trim();
    const usable = value => value && value.length <= 180 && !/^(?:chatgpt|new chat|openai|skip to (?:main )?content|main content|navigation|chat history|open (?:menu|sidebar)|close (?:menu|sidebar))$/i.test(value);
    const browserTabTitle = document.title || "";
    const forced = clean(override);
    if (forced) return { value: forced, source: "override", browserTabTitle };

    // The tab title is maintained by ChatGPT specifically for the active chat.
    const tab = clean(browserTabTitle);
    if (usable(tab)) return { value: tab, source: "browser tab", browserTabTitle };

    // Fallback: accept only a real /c/... or /g/... link without a fragment.
    // This excludes accessibility links such as href="#main" whose resolved
    // pathname happens to equal the current conversation pathname.
    for (const link of document.querySelectorAll('a[href*="/c/"],a[href*="/g/"]')) {
      try {
        const url = new URL(link.getAttribute("href"), location.href);
        if (url.pathname !== location.pathname || url.hash) continue;
        for (const candidate of [link.getAttribute("title"), link.innerText, link.textContent]) {
          const value = clean(candidate);
          if (usable(value)) return { value, source: "conversation link", browserTabTitle };
        }
      } catch { /* malformed link */ }
    }
    const id = location.pathname.match(/\/(?:c|g)\/([^/?#]+)/)?.[1];
    return {
      value: id ? `chat-${id.slice(0, 12)}` : "chatgpt-chat",
      source: "conversation id fallback",
      browserTabTitle
    };
  }

  function timestamp(date) {
    const pad = (value, width = 2) => String(value).padStart(width, "0");
    return `${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1)}${pad(date.getDate())}_` +
      `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}_${pad(date.getMilliseconds(), 3)}`;
  }

  function runToken() {
    if (typeof crypto?.randomUUID === "function")
      return crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.slice(0, 12);
  }

  function safe(value, limit = 110) {
    const part = String(value).normalize("NFKC")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\s+/g, " ").replace(/[. ]+$/g, "").trim().slice(0, limit) || "chatgpt-chat";
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(part) ? `chat-${part}` : part;
  }

  function streaming() {
    return Boolean(document.querySelector(
      '[data-testid="stop-button"],button[aria-label*="stop generating" i],button[aria-label*="stop streaming" i]'
    ));
  }

  function readable(result) {
    let users = 0, models = 0;
    const lines = [
      `Chat: ${result.conversation_title}`,
      `Snapshot: ${result.snapshot_at}`,
      `User prompts: ${result.counts.user_prompts}`,
      `Model messages: ${result.counts.model_messages}`,
      `Scan duration: ${result.timing.scan_duration_seconds} seconds`, ""
    ];
    for (const message of result.messages) {
      const label = message.role === "user" ? `USER PROMPT ${++users}` :
        message.role === "assistant" ? `MODEL MESSAGE ${++models}` : message.role.toUpperCase();
      lines.push(`===== ${label}${Number.isFinite(message.turn_number) ? ` | TURN ${message.turn_number}` : ""} =====`);
      lines.push(message.text || "");
      if (message.links?.length) {
        lines.push("Links:");
        for (const link of message.links) lines.push(`- ${link.text || "link"}: ${link.href}`);
      }
      if (message.attachments?.length) {
        lines.push("Attachments:");
        for (const item of message.attachments)
          lines.push(`- ${item.text || item.aria_label || item.test_id || "attachment"}`);
      }
      if (message.media?.length) {
        lines.push("Media:");
        for (const item of message.media)
          lines.push(`- ${item.type}: ${item.alt || item.title || item.aria_label || item.source || "unlabelled"}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }

  function download(result) {
    const content = JSON.stringify(result, null, 2);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" }); // deliberately no BOM
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: `${result.output_basename}.txt`
    });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    return link.download;
  }

  async function run(overrides = {}) {
    if (api.running) throw Error("An extraction is already running.");
    const settings = config(overrides);
    const initial = mounted();
    if (!initial.length) throw Error("No ChatGPT messages found. Open a conversation first.");

    const controller = new AbortController();
    activeController = controller;
    api.running = true;
    api.lastError = null;
    const startedAt = new Date();
    const startedPerformance = performance.now();
    const port = scrollPort(findScroller(initial[0]));
    const originalRatio = port.max ? port.top / port.max : 1;
    const restoreSmooth = port.disableSmooth();
    const context = {
      settings,
      signal: controller.signal,
      deadline: startedPerformance + settings.maximumRuntimeMs,
      conversationPath: location.pathname,
      startedPerformance,
      port,
      records: new Map(),
      coverage: new Map(),
      encounter: 0,
      phase: "initialization",
      phaseTimings: {},
      debugEvents: [],
      debugDropped: 0,
      environment: null,
      memoryStart: memorySnapshot(),
      stats: {
        captures: 0, moves: 0, mutations: 0, settleMs: 0, newTurns: 0,
        frontierJumps: 0, frontierRewinds: 0, overlapSteps: 0,
        conservativePasses: 0, lastUserReport: 0, lastReportAt: startedPerformance,
        captureMs: 0, maxCaptureMs: 0,
        messageReadOperations: 0, messageInitialReads: 0, messageRefreshes: 0,
        messageReadMs: 0, maxMessageReadMs: 0,
        longTaskCount: 0, longTaskMs: 0, maxLongTaskMs: 0
      }
    };
    context.environment = environmentSnapshot(port);
    const longTaskObserver = watchLongTasks(context);
    const streamedAtStart = streaming();
    let result;
    let scrollRestored = false;

    debug(context, "run_start", {
      include_model_messages: settings.includeModelMessages,
      expected_user_prompts: settings.expectedUserPrompts,
      mounted_messages: initial.length,
      scroller: port.describe()
    });

    console.log(
      `[${NAME} ${VERSION}] Starting ${settings.includeModelMessages ? "full-chat" : "prompt-only"} scan. ` +
      `Do not interact with the chat; ${NAME}.stop() aborts safely.`
    );

    try {
      const fast = await timedPhase(context, "fast scan", () => scan(context, false));
      const fastUserCount = [...context.records.values()].filter(item => item.role === "user").length;
      const missedExpected = settings.expectedUserPrompts != null &&
        fastUserCount < settings.expectedUserPrompts;
      const mustVerify = settings.forceConservativePass || !fast.reachedTop || !fast.reachedBottom ||
        fast.stalled || context.stats.frontierRewinds > 0 || missedExpected;
      let conservative = null;

      if (mustVerify) {
        context.stats.conservativePasses++;
        debug(context, "fallback_requested", {
          force_conservative: settings.forceConservativePass,
          fast_reached_top: fast.reachedTop,
          fast_reached_bottom: fast.reachedBottom,
          fast_stalled: fast.stalled,
          frontier_rewinds: context.stats.frontierRewinds,
          expected_count_missed: missedExpected
        });
        console.warn(
          `[${NAME}] Running the conservative overlapping fallback ` +
          `(rewinds=${context.stats.frontierRewinds}, expected-missed=${missedExpected}).`
        );
        conservative = await timedPhase(context, "conservative scan", () => scan(context, true));
      }

      // Refresh the final mounted window even if streaming just ended after
      // its first capture, so the last assistant response is not left partial.
      await timedPhase(context, "final capture", async () => { capture(context, true); });
      const scanFinishedAt = new Date();
      const scanDuration = Math.round(performance.now() - startedPerformance);
      const messages = sorted(context.records);
      const roles = roleCounts(messages);
      const prompts = roles.user || 0;
      const models = roles.assistant || 0;
      const titleInfo = title(settings.chatTitleOverride);
      const chatTitle = titleInfo.value;
      const snapshot = timestamp(scanFinishedAt);
      const extractionRunId = runToken();

      let scrollRestoreMs = 0;
      if (settings.restoreScroll) {
        context.phase = "scroll restore";
        const restoreStarted = performance.now();
        port.set(originalRatio * port.max);
        await frames(2, controller.signal);
        scrollRestoreMs = Number((performance.now() - restoreStarted).toFixed(3));
        scrollRestored = true;
        debug(context, "scroll_restored", {
          duration_ms: scrollRestoreMs,
          restored_top: Math.round(port.top),
          target_ratio: Number(originalRatio.toFixed(6))
        });
      }

      addLongTasks(context, longTaskObserver?.takeRecords?.() || []);
      longTaskObserver?.disconnect();
      const memoryEnd = memorySnapshot();
      const buildStarted = performance.now();
      context.phase = "result build";
      const basename = [
        safe(chatTitle), `prompts-${prompts}`,
        settings.includeModelMessages ? `model-${models}` : "user-only",
        `snapshot-${snapshot}`,
        `scan-${Math.max(1, Math.round(scanDuration / 1000))}s`,
        `run-${extractionRunId}`
      ].join("__");

      result = {
        schema: "chatgpt-active-branch-extract-v2",
        extractor_version: VERSION,
        conversation_title: chatTitle,
        conversation_title_source: titleInfo.source,
        browser_tab_title: titleInfo.browserTabTitle,
        extraction_run_id: extractionRunId,
        conversation_id: location.pathname.match(/\/(?:c|g)\/([^/?#]+)/)?.[1] || null,
        source_url: location.href,
        snapshot_at: scanFinishedAt.toISOString(),
        snapshot_local_label: snapshot,
        output_basename: basename,
        scope: "active DOM-visible conversation branch",
        settings: {
          include_model_messages: settings.includeModelMessages,
          include_other_roles: settings.includeOtherRoles,
          include_message_html: settings.includeMessageHtml,
          include_debug_log: settings.includeDebugLog,
          debug_event_limit: settings.debugEventLimit,
          expected_user_prompts: settings.expectedUserPrompts,
          force_conservative_pass: settings.forceConservativePass,
          output: "pretty JSON inside one BOM-free .txt file"
        },
        timing: {
          started_at: startedAt.toISOString(),
          scan_finished_at: scanFinishedAt.toISOString(),
          scan_duration_ms: scanDuration,
          scan_duration_seconds: Number((scanDuration / 1000).toFixed(3)),
          scroll_restore_ms: scrollRestoreMs,
          phase_duration_ms: context.phaseTimings,
          note: "Per-message capture timestamps describe extraction time, not the messages' original creation time."
        },
        counts: {
          user_prompts: prompts,
          model_messages: models,
          saved_messages: messages.length,
          all_roles_seen: context.coverage.size,
          role_counts: roles
        },
        validation: {
          reached_top: conservative?.reachedTop ?? fast.reachedTop,
          reached_bottom: conservative?.reachedBottom ?? fast.reachedBottom,
          expected_prompt_count_satisfied: settings.expectedUserPrompts == null
            ? null : prompts >= settings.expectedUserPrompts,
          conservative_fallback_run: Boolean(conservative),
          frontier_rewinds: context.stats.frontierRewinds,
          numeric_turn_gaps: turnGaps(context.coverage),
          note: "Numeric gaps can be legitimate when consecutive user turns or an unanswered prompt has no separate assistant message."
        },
        streaming: {
          detected_at_start: streamedAtStart,
          detected_at_finish: streaming(),
          warning: streamedAtStart || streaming()
            ? "A response was streaming during the snapshot and may be partial." : null
        },
        traversal: {
          scroller: port.describe(),
          captures: context.stats.captures,
          moves: context.stats.moves,
          frontier_jumps: context.stats.frontierJumps,
          frontier_rewinds: context.stats.frontierRewinds,
          overlap_steps: context.stats.overlapSteps,
          conservative_passes: context.stats.conservativePasses,
          mutations_observed: context.stats.mutations,
          settle_time_ms: context.stats.settleMs
        },
        performance: {
          messages_per_scan_second: Number((messages.length / Math.max(0.001, scanDuration / 1000)).toFixed(3)),
          prompts_per_scan_second: Number((prompts / Math.max(0.001, scanDuration / 1000)).toFixed(3)),
          settle_share_percent: Number((context.stats.settleMs / Math.max(1, scanDuration) * 100).toFixed(3)),
          capture_batches: {
            count: context.stats.captures,
            total_ms: Number(context.stats.captureMs.toFixed(3)),
            average_ms: Number((context.stats.captureMs / Math.max(1, context.stats.captures)).toFixed(3)),
            maximum_ms: Number(context.stats.maxCaptureMs.toFixed(3))
          },
          message_dom_reads: {
            operations: context.stats.messageReadOperations,
            initial_reads: context.stats.messageInitialReads,
            refreshes: context.stats.messageRefreshes,
            total_ms: Number(context.stats.messageReadMs.toFixed(3)),
            average_ms: Number((context.stats.messageReadMs / Math.max(1, context.stats.messageReadOperations)).toFixed(3)),
            maximum_ms: Number(context.stats.maxMessageReadMs.toFixed(3))
          },
          long_tasks: {
            supported: Boolean(longTaskObserver),
            count: context.stats.longTaskCount,
            total_ms: Number(context.stats.longTaskMs.toFixed(3)),
            maximum_ms: Number(context.stats.maxLongTaskMs.toFixed(3))
          },
          memory: {
            supported: Boolean(context.memoryStart && memoryEnd),
            start: context.memoryStart,
            finish: memoryEnd,
            used_heap_delta_bytes: context.memoryStart && memoryEnd
              ? memoryEnd.used_js_heap_bytes - context.memoryStart.used_js_heap_bytes : null
          },
          result_build_ms: null
        },
        debug: settings.includeDebugLog ? {
          event_limit: settings.debugEventLimit,
          dropped_events: context.debugDropped,
          environment: context.environment,
          events: context.debugEvents
        } : { enabled: false },
        messages
      };

      const dataReadyAt = new Date();
      const dataReadyDuration = Math.round(performance.now() - startedPerformance);
      result.timing.finished_at = dataReadyAt.toISOString();
      result.timing.total_extraction_duration_ms = dataReadyDuration;
      result.timing.total_extraction_duration_seconds = Number((dataReadyDuration / 1000).toFixed(3));
      result.performance.result_build_ms = Number((performance.now() - buildStarted).toFixed(3));
      debug(context, "run_finish", {
        scan_duration_ms: scanDuration,
        total_extraction_duration_ms: dataReadyDuration,
        messages: messages.length,
        prompts,
        model_messages: models
      });
      if (settings.includeDebugLog) result.debug.dropped_events = context.debugDropped;

      api.lastResult = result;
      api.lastDebug = result.debug;
      window.__CHATGPT_PROMPT_EXTRACT_V2__ = result;
      window.__CHATGPT_PROMPT_EXTRACT_V2_DEBUG__ = result.debug;
      report(context, true);
      if (settings.autoDownload) download(result);

      console.table({
        prompts, model_messages: models, saved_messages: messages.length,
        seconds: result.timing.scan_duration_seconds,
        frontier_jumps: context.stats.frontierJumps,
        rewinds: context.stats.frontierRewinds,
        conservative_fallback: Boolean(conservative),
        reached_top: result.validation.reached_top,
        reached_bottom: result.validation.reached_bottom
      });
      console.log(`[${NAME}] COMPLETE — ${basename}.txt`);
      console.log(`Result: window.__CHATGPT_PROMPT_EXTRACT_V2__ | Debug: ${NAME}.lastDebug | Readable: ${NAME}.readable()`);
      return result;
    } catch (error) {
      api.lastError = error;
      api.lastDebug = {
        failed_at: new Date().toISOString(),
        failed_after_ms: Math.round(performance.now() - startedPerformance),
        phase: context.phase,
        error: { name: error?.name || "Error", message: String(error?.message || error), stack: error?.stack || null },
        stats: context.stats,
        dropped_events: context.debugDropped,
        environment: context.environment,
        events: context.debugEvents
      };
      window.__CHATGPT_PROMPT_EXTRACT_V2_DEBUG__ = api.lastDebug;
      if (error?.name === "AbortError") console.warn(`[${NAME}] Stopped; partial records were not downloaded.`);
      else console.error(`[${NAME}] FAILED:`, error);
      console.log(`[${NAME}] Failure diagnostics: ${NAME}.lastDebug`);
      throw error;
    } finally {
      longTaskObserver?.disconnect();
      if (settings.restoreScroll && !scrollRestored) {
        try { port.set(originalRatio * port.max); } catch { /* best effort, including abort */ }
      }
      restoreSmooth();
      api.running = false;
      activeController = null;
    }
  }

  void api.run().catch(error => {
    if (api.lastError !== error) {
      api.lastError = error;
      console.error(`[${NAME}] FAILED:`, error);
    }
  });
})();
