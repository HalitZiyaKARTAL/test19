/*
 * ChatGPT Prompt / Full-Chat Extractor v2.0.0 — 2026-07-15
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
  // ============================================================

  const NAME = "ChatGPTPromptExtractorV2";
  const VERSION = "2.0.0";
  const SELECTOR = "[data-message-author-role]";
  const DEFAULTS = {
    includeModelMessages: INCLUDE_MODEL_MESSAGES,
    expectedUserPrompts: EXPECTED_USER_PROMPTS,
    chatTitleOverride: CHAT_TITLE_OVERRIDE,
    includeMessageHtml: INCLUDE_MESSAGE_HTML,
    forceConservativePass: FORCE_CONSERVATIVE_PASS,
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
    return value;
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
        return isDocument ? { type: "document" } : {
          type: "element",
          tag: scroller.tagName,
          id: scroller.id || null,
          class: typeof scroller.className === "string" ? scroller.className : null
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

  function readRecord(item, context) {
    const time = item.turn.querySelector("time");
    const record = {
      key: item.id.key,
      role: item.id.role,
      message_id: item.id.messageId,
      turn_testid: item.id.testId,
      turn_number: item.id.turnNumber,
      unstable_key: item.id.unstable,
      encounter_order: context.encounter++,
      displayed_or_dom_time: time?.dateTime || time?.getAttribute("datetime") || time?.innerText || null,
      captured_after_ms: Math.round(performance.now() - context.startedPerformance),
      approximate_document_top_at_capture: Math.round(item.documentTop),
      text: item.message.innerText ?? item.message.textContent ?? ""
    };
    if (context.settings.includeLinks) record.links = linksFrom(item.message);
    if (context.settings.includeMedia)
      Object.assign(record, mediaFrom(item.message, context.settings.includeMediaUrls));
    if (context.settings.includeMessageHtml) record.html = item.message.innerHTML;
    return record;
  }

  function capture(context, refresh = false) {
    check(context);
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
        const next = readRecord(item, context);
        if (old) next.encounter_order = old.encounter_order;
        context.records.set(item.id.key, next);
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

    context.stats.captures++;
    context.stats.newTurns += added;
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

    context.stats.moves++;
    context.stats.mutations += mutations;
    context.stats.settleMs += Math.round(performance.now() - started);
    return capture(context);
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
    return context.port.top <= 2;
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

    if (target <= beforeTop + 2) return { atBottom: true, stalled: false };
    const after = await move(context, target, conservative ? Math.max(850, settings.maximumSettleMs) : settings.maximumSettleMs);
    const travelled = Math.max(0, port.top - beforeTop);

    if (frontierMode && travelled > port.view * 0.75 && !overlap(beforeKeys, after.keys)) {
      stats.frontierRewinds++;
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
          return { reachedTop, reachedBottom: true, stalled: false, moves: count };
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
      .replace(/^\s*(?:ChatGPT|OpenAI)\s*[-—|:]\s*/i, "")
      .replace(/\s*[-—|:]\s*(?:ChatGPT|OpenAI)\s*$/i, "")
      .replace(/\s+/g, " ").trim();
    const values = [override];
    for (const link of document.querySelectorAll("a[href]")) {
      try {
        if (new URL(link.href, location.href).pathname === location.pathname)
          values.push(link.getAttribute("title"), link.innerText, link.textContent);
      } catch { /* malformed link */ }
    }
    values.push(document.title);
    for (const value of values.map(clean))
      if (value && !/^(chatgpt|new chat|openai)$/i.test(value) && value.length <= 180) return value;
    const id = location.pathname.match(/\/(?:c|g)\/([^/?#]+)/)?.[1];
    return id ? `chat-${id.slice(0, 12)}` : "chatgpt-chat";
  }

  function timestamp(date) {
    const pad = (value, width = 2) => String(value).padStart(width, "0");
    return `${pad(date.getFullYear(), 4)}${pad(date.getMonth() + 1)}${pad(date.getDate())}_` +
      `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
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
      stats: {
        captures: 0, moves: 0, mutations: 0, settleMs: 0, newTurns: 0,
        frontierJumps: 0, frontierRewinds: 0, overlapSteps: 0,
        conservativePasses: 0, lastUserReport: 0, lastReportAt: startedPerformance
      }
    };
    const streamedAtStart = streaming();
    let result;

    console.log(
      `[${NAME} ${VERSION}] Starting ${settings.includeModelMessages ? "full-chat" : "prompt-only"} scan. ` +
      `Do not interact with the chat; ${NAME}.stop() aborts safely.`
    );

    try {
      const fast = await scan(context, false);
      const fastUserCount = [...context.records.values()].filter(item => item.role === "user").length;
      const missedExpected = settings.expectedUserPrompts != null &&
        fastUserCount < settings.expectedUserPrompts;
      const mustVerify = settings.forceConservativePass || !fast.reachedTop || !fast.reachedBottom ||
        fast.stalled || context.stats.frontierRewinds > 0 || missedExpected;
      let conservative = null;

      if (mustVerify) {
        context.stats.conservativePasses++;
        console.warn(
          `[${NAME}] Running the conservative overlapping fallback ` +
          `(rewinds=${context.stats.frontierRewinds}, expected-missed=${missedExpected}).`
        );
        conservative = await scan(context, true);
      }

      // Refresh the final mounted window even if streaming just ended after
      // its first capture, so the last assistant response is not left partial.
      capture(context, true);
      const finishedAt = new Date();
      const duration = Math.round(performance.now() - startedPerformance);
      const messages = sorted(context.records);
      const roles = roleCounts(messages);
      const prompts = roles.user || 0;
      const models = roles.assistant || 0;
      const chatTitle = title(settings.chatTitleOverride);
      const snapshot = timestamp(finishedAt);
      const basename = [
        safe(chatTitle), `prompts-${prompts}`,
        settings.includeModelMessages ? `model-${models}` : "user-only",
        `snapshot-${snapshot}`
      ].join("__");

      result = {
        schema: "chatgpt-active-branch-extract-v2",
        extractor_version: VERSION,
        conversation_title: chatTitle,
        conversation_id: location.pathname.match(/\/(?:c|g)\/([^/?#]+)/)?.[1] || null,
        source_url: location.href,
        snapshot_at: finishedAt.toISOString(),
        snapshot_local_label: snapshot,
        output_basename: basename,
        scope: "active DOM-visible conversation branch",
        settings: {
          include_model_messages: settings.includeModelMessages,
          include_other_roles: settings.includeOtherRoles,
          include_message_html: settings.includeMessageHtml,
          expected_user_prompts: settings.expectedUserPrompts,
          force_conservative_pass: settings.forceConservativePass,
          output: "pretty JSON inside one BOM-free .txt file"
        },
        timing: {
          started_at: startedAt.toISOString(),
          finished_at: finishedAt.toISOString(),
          scan_duration_ms: duration,
          scan_duration_seconds: Number((duration / 1000).toFixed(3))
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
        messages
      };

      api.lastResult = result;
      window.__CHATGPT_PROMPT_EXTRACT_V2__ = result;
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
      console.log(`Result: window.__CHATGPT_PROMPT_EXTRACT_V2__ | Readable text: ${NAME}.readable()`);
      return result;
    } catch (error) {
      api.lastError = error;
      if (error?.name === "AbortError") console.warn(`[${NAME}] Stopped; partial records were not downloaded.`);
      else console.error(`[${NAME}] FAILED:`, error);
      throw error;
    } finally {
      if (settings.restoreScroll) {
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
