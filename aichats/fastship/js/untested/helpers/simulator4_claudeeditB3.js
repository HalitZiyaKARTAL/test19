/* ============================================================================
   sim.js v5.2.1 (claudeeditB3) — hand-over notes: SIM.readme / SIM.help('topic')
   A sim = a realm (iframe | tab | worker | remote) + one channel (op(name, args)) + a policy
   (spec > SIM.configure > DEFAULTS). Storage separation = one naming rule applied to every
   named browser store; every new same-origin realm gets the prelude before its own code.
   README: SIM.readme / SIM.help('topic')
   ============================================================================ */
var SIM = (function () {
  var VERSION = '5.2.1';
  if (typeof window !== 'undefined' && window.SIM && window.SIM.VERSION === VERSION) return window.SIM;
  try { if (typeof window !== 'undefined' && window.SIM && window.SIM.purge) window.SIM.purge(); } catch (e) {}
  var G = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined' ? window : this);
  var hasDOM = (typeof document !== 'undefined' && !!document.createElement);
  var SID = Math.random().toString(36).slice(2, 7);
  var seq = 0, registry = {}, reserving = {}, watchdogTimer = 0, PANEL_T = 0, gcMs = 0;
  var TRACK = { iframes: [], workers: [], urls: [], timers: [], polls: [] };
  var SHARED = (G.__simShared = G.__simShared || {});
  var DEFAULTS = {
    runtime: 'iframe', isolate: true, base: '', width: 1024, height: 768,
    readyTimeout: 20000, actionTimeout: 15000, idleTimeout: 0, ttl: 0,
    autoGc: true, gcInterval: 5000, maxSims: 0, maxLogs: 2000, maxQueue: 500, maxMessage: 4e6,
    sandbox: 'auto', strictVersion: false, routeById: true, retry: 0, backoff: 200,
    autoAbort: true, heartbeatMs: 0, traceMax: 500, panel: false, clock: false,
    trackStable: false, allowConsoleEval: false, bridge: true,
    bridgeCode: 'window.__app={run:function(c){c=String(c);var N=String.fromCharCode(10),x=true;try{new Function("return ("+c+N+")")}catch(e){x=false}return x?eval(c):eval("(function(){"+c+N+"})()")},v:1};',
    bridgePatterns: [/\(\s*async\s*\(\s*\)\s*=>\s*\{/, /\(\s*function\s*\(\s*\)\s*\{/, /\(\s*\(\s*\)\s*=>\s*\{/],
    console: null,
    logs: { maxEntries: 0, maxEntryChars: 8000, maxTotalChars: 2e6, keepHead: 20, collapseRepeats: true, collapseWindow: 8, headRatio: 0.7 },
    isolateModes: { navigation: 'virtual', childFrames: 'isolate', popups: 'block', workers: 'isolate', serviceWorker: 'block', cookieStore: 'isolate', storageBuckets: 'block', opfs: 'isolate', onLost: 'blank' },
    prefix: { 'private': '__sim_', shared: '__simns_' },
    persistKey: 'sim_config', storageQuota: 5e6, persistShared: true,
    timing: { waitPollMs: 100, netPollMs: 60, readyPollMs: 50, quietMs: 200 },
    reconnectMs: 1500, pollMs: 2000,
    offscreen: 'position:fixed;left:-12000px;top:0', edit: null, prepend: null, append: null,
    proxy: null, proxyMode: 'fallback', proxyStagger: [200, 800, 1000], proxyRequests: 'auto', csp: 'strip', rocketLoader: 'undo',
    lostHtml: '<!doctype html><html><head></head><body><p>sim stopped: the page left the sim (isolation lost)</p></body></html>'
  };
  // options that are global (not copied into each sim) and object options that merge key by key
  var GLOBAL_OPTS = { maxSims: 1, autoGc: 1, gcInterval: 1, panel: 1, prefix: 1, persistKey: 1, console: 1 }, MERGE_OPTS = { logs: 1, isolateModes: 1, timing: 1 };
  var PRESETS = { aiChat: { console: { toggle: '#evalLock', open: '#openEvalBtn', input: '#EI', run: '#ERun', out: '#EO', box: '#evalConsole', waits: { toggle: 80, open: 160, run: 90 } } } };

  // ---- small helpers ----
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function now() { return Date.now(); }
  function uid(p) { return (p || 'x') + '_' + SID + '_' + (++seq); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function merge(a) { a = a || {}; for (var i = 1; i < arguments.length; i++) { var b = arguments[i]; if (!b) continue; for (var k in b) if (own(b, k)) a[k] = (isObj(b[k]) && isObj(a[k])) ? merge({}, a[k], b[k]) : b[k]; } return a; }
  function pull(arr, x) { var i = arr.indexOf(x); if (i >= 0) arr.splice(i, 1); return i >= 0; }
  function fetchText(u) { return fetch(u).then(function (r) { if (!r.ok) throw Error('HTTP ' + r.status + ' ' + u); return r.text(); }); }
  function looksHtml(s) { return /^\s*</.test(s) || /<html[\s>]/i.test(s) || /<!doctype/i.test(s); }
  function asSource(u) { if (u && typeof u === 'object') { if (u.code != null) return Promise.resolve(String(u.code)); if (u.url != null) return fetchText(String(u.url)); } var s = String(u); return (!/\s/.test(s) && (/^(https?:|data:|blob:)/i.test(s) || /^(\.{0,2}\/)?[\w.~%-]+(\/[\w.~%-]+)*\.(m?js|cjs|json|txt|html?)(\?[^\s#]*)?(#\S*)?$/i.test(s))) ? fetchText(s) : Promise.resolve(s); }
  function hdrObj(h) { var o = {}; if (!h) return o; try { if (Array.isArray(h)) h.forEach(function (p) { if (p && p.length >= 2) o[String(p[0]).toLowerCase()] = String(p[1]); }); else if (typeof h.forEach === 'function') h.forEach(function (v, k) { o[String(k).toLowerCase()] = String(v); }); else for (var k in h) if (own(h, k)) o[String(k).toLowerCase()] = String(h[k]); } catch (e) {} return o; }
  function js(x) { return JSON.stringify(x).replace(/</g, '\\u003c'); } // JSON that is safe inside <script>
  function errMsg(e) { return String((e && e.message) || e); }
  function emitter() { var m = {}; return { on: function (k, f) { (m[k] || (m[k] = [])).push(f); return function () { pull(m[k] || [], f); }; }, emit: function (k) { var args = [].slice.call(arguments, 1); (m[k] || []).slice().forEach(function (f) { try { f.apply(null, args); } catch (e) {} }); } }; }
  var EV = emitter();
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function attempt(make, o) { o = o || {}; var tries = ((o.retry == null ? DEFAULTS.retry : o.retry) | 0) + 1, d = (o.backoff == null ? DEFAULTS.backoff : o.backoff); function go(n) { return Promise.resolve().then(make).catch(function (e) { if (n <= 1) throw e; return sleep(d * Math.pow(2, tries - n)).then(function () { return go(n - 1); }); }); } return go(tries); }
  // one settle-once guard for signal and timeout races
  function race(p, ms, name, sig) { return new Promise(function (res, rej) { var done = 0, t = 0; function end(f, v) { if (done) return; done = 1; if (t) clearTimeout(t); if (sig) try { sig.removeEventListener('abort', ab); } catch (e) {} f(v); } function ab() { end(rej, Error('aborted')); } if (sig) { if (sig.aborted) return ab(); try { sig.addEventListener('abort', ab); } catch (e) {} } if (ms > 0) t = setTimeout(function () { end(rej, Error('sim timeout: ' + name)); }, ms); Promise.resolve(p).then(function (v) { end(res, v); }, function (e) { end(rej, e); }); }); }
  function optOf(src, k) { return (src && src[k] !== undefined) ? src[k] : DEFAULTS[k]; }
  function timing(src, k, d) { var t = optOf(src, 'timing') || {}; return t[k] != null ? t[k] : d; }
  function nsPrefix(ns, id) { var P = DEFAULTS.prefix || {}, n = ns != null ? String(ns) : String(id || 'x'); return (ns != null ? (P.shared || '__simns_') : (P['private'] || '__sim_')) + n.length + '_' + n + '_'; }
  function sharedOf(ns) { return SHARED[ns] || (SHARED[ns] = { ls: new Map(), ck: new Map(), ss: new Map(), wins: [] }); }

  // ---- logs: one capped sink + one capture hook (stringified into every realm) ----
  function logSink(P) {
    // state lives on the array (arr.__s), so several realms can share one host array.
    // keepHead: first entries are never dropped; later ones roll behind one "…[N entries dropped]…" line.
    // collapseRepeats/collapseWindow: a repeat of one of the last N entries bumps its " (xN)" counter.
    P = P || {}; var N = P.maxEntries > 0 ? P.maxEntries : 2000, C = P.maxEntryChars > 0 ? P.maxEntryChars : 0, T = P.maxTotalChars > 0 ? P.maxTotalChars : 0, R = P.collapseRepeats !== false, CW = P.collapseWindow > 0 ? (P.collapseWindow | 0) : 1, KH = P.keepHead >= 0 ? (P.keepHead | 0) : 20, HR = (P.headRatio > 0 && P.headRatio < 1) ? P.headRatio : 0.7, MK = /^…\[(\d+) entries dropped\]…$/;
    if (KH > N - 2) KH = Math.max(0, Math.floor((N - 2) / 2));
    function clip(s) { if (!C || s.length <= C) return s; var h = Math.floor(C * HR), t = C - h; return s.slice(0, h) + ' …[' + (s.length - C) + ' chars cut]… ' + (t > 0 ? s.slice(s.length - t) : ''); }
    function isErr(x) { try { var t = Object.prototype.toString.call(x); return t === '[object Error]' || t === '[object DOMException]' || (typeof x.stack === 'string' && typeof x.message === 'string'); } catch (e) { return false; } }
    function errStr(x) { var nm = '', msg = '', st = ''; try { nm = String(x.name || 'Error'); msg = String(x.message == null ? '' : x.message); st = String(x.stack || ''); } catch (e) {} var hd = nm + (msg ? ': ' + msg : ''); return st ? (st.indexOf(hd) === 0 ? st : hd + '\n' + st) : hd; }
    function str(x) { if (typeof x === 'string') return x; if (x == null || typeof x !== 'object') return String(x); if (isErr(x)) return errStr(x); var lim = C ? C * 2 : 0, used = 0; try { return JSON.stringify(x, function (k, v) { if (v && typeof v === 'object' && v !== x && isErr(v)) v = errStr(v); if (lim) { used += k.length + (typeof v === 'string' ? v.length : 4); if (used > lim) throw new Error('big'); } return v; }); } catch (e) { var ks = []; try { ks = Object.keys(x).slice(0, 20); } catch (e2) {} return Object.prototype.toString.call(x) + (ks.length ? ' {' + ks.join(',') + (ks.length >= 20 ? ',…' : '') + '}' : ''); } }
    function state(arr) { var st = arr.__s; if (st && st.b.length === arr.length) return st; st = arr.__s = { b: [], n: [], mk: -1, d: 0 }; var c = 0; for (var i = 0; i < arr.length; i++) { var x = String(arr[i]), mm = MK.exec(x); c += x.length; if (mm) { st.mk = i; st.d = +mm[1]; st.b.push(null); st.n.push(0); continue; } var m = / \(x(\d+)\)$/.exec(x); st.b.push(m ? x.slice(0, m.index) : x); st.n.push(m ? +m[1] : 1); } arr.__c = c; return st; }
    return function (arr, pre, parts) {
      var s; try { s = pre + Array.prototype.map.call(parts, str).join(' '); } catch (e) { s = pre + '[unprintable]'; } s = clip(s);
      var st = state(arr), i;
      if (R) for (i = arr.length - 1; i >= Math.max(0, arr.length - CW); i--) { if (i === st.mk || st.b[i] !== s) continue; st.n[i]++; var nl = s + ' (x' + st.n[i] + ')'; arr.__c += nl.length - arr[i].length; arr[i] = nl; return; }
      arr.push(s); st.b.push(s); st.n.push(1); arr.__c = (arr.__c || 0) + s.length;
      for (var g = 0; (arr.length > N || (T && arr.__c > T)) && arr.length > 1 && g < 1e5; g++) {
        var e = st.mk >= 0 ? st.mk + 1 : KH; if (e >= arr.length - 1) e = (st.mk === 0) ? 1 : 0; if (e >= arr.length - 1) break;
        arr.__c -= String(arr.splice(e, 1)[0]).length; st.b.splice(e, 1); st.d += st.n.splice(e, 1)[0]; if (st.mk > e) st.mk--;
        var txt = '…[' + st.d + ' entries dropped]…';
        if (st.mk < 0) { st.mk = e; arr.splice(e, 0, txt); st.b.splice(e, 0, null); st.n.splice(e, 0, 0); arr.__c += txt.length; } else { arr.__c += txt.length - arr[st.mk].length; arr[st.mk] = txt; }
      }
    };
  }
  // hooks console.* and error events of one scope into two arrays (once per scope)
  function capture(S, L, E, sink) {
    if (S.__simCapture) return; S.__simCapture = 1;
    try { var C = S.console; ['log', 'warn', 'error', 'info', 'debug'].forEach(function (k) { var o = C[k] ? C[k].bind(C) : function () {}; C[k] = function () { try { sink(L, k + ': ', arguments); } catch (e) {} return o.apply(null, arguments); }; }); } catch (e) {}
    if (!S.addEventListener) return;
    S.addEventListener('error', function (e) { try { var er = e.error; if (er && typeof er === 'object') sink(E, 'Uncaught ', [er]); else sink(E, '', [String(e.message || er) + (e.filename ? ' (' + e.filename + ':' + e.lineno + ':' + (e.colno || 0) + ')' : '')]); } catch (x) {} });
    S.addEventListener('unhandledrejection', function (e) { try { sink(E, 'rej:', [e.reason]); } catch (x) {} });
  }
  function resetLog(a) { a.length = 0; a.__c = 0; a.__s = null; }
  // spec.clock -> engine config. true = paused (only advance moves time), a number = speed, or
  // { speed, time (start date/ms), offset (ms added to the real date), media, raf, events, maxCatchUp }
  function clockCfg(src, id) {
    var c = optOf(src, 'clock'), o = isObj(c) ? c : {}, on = !!c || c === 0;
    var cfg = { enabled: on, channel: '__simtime_' + String(id).length + '_' + id, media: o.media !== false, raf: o.raf !== false, events: o.events !== false, maxCatchUp: o.maxCatchUp || 1000 };
    if (on) { cfg.speed = typeof c === 'number' ? c : o.speed != null ? +o.speed : (c === true ? 0 : 1); if (o.time != null) cfg.time = (o.time instanceof Date) ? o.time.getTime() : o.time; if (o.offset != null) cfg.offset = +o.offset; }
    return cfg;
  }
  function logPolicy(src) { var P = merge({}, DEFAULTS.logs || {}, (src && src.logs) || {}); if (!(P.maxEntries > 0)) P.maxEntries = +optOf(src, 'maxLogs') || 2000; return P; }

  // ---- time: one engine per realm (stringified into pages, child frames and workers) ----
  // Two clocks, as in a real browser: a monotonic one (timers, performance.now, rAF, event times) and the
  // wall clock (Date) = monotonic + offset. monotonic = m0 + (real ms since r0) * speed; speed 0 = paused,
  // then only advance() moves time. set()/shift() change the wall clock only (timers are not affected).
  // The sim page's engine is the 'main' one: it owns the state, keeps it in the host record (so it survives
  // navigation) and broadcasts it; child frames and page-made workers are 'followers' that copy it.
  function timeEngine(S, cfg) {
    if (S.__simTime) return S.__simTime;
    cfg = cfg || {};
    var RD = S.Date, rNow = RD.now.bind(RD), PF = S.performance, rPerf = (PF && PF.now) ? PF.now.bind(PF) : rNow;
    var rST = S.setTimeout, rCT = S.clearTimeout, rCI = S.clearInterval, rRAF = S.requestAnimationFrame;
    var HOST = (S.__sim && S.__sim.host) || null, main = cfg.role !== 'follower', cap = cfg.maxCatchUp > 0 ? cfg.maxCatchUp : 1000;
    function toMs(x) { if (x instanceof RD || Object.prototype.toString.call(x) === '[object Date]') return x.getTime(); if (typeof x === 'string' && isNaN(+x)) return RD.parse(x); return +x; }
    var r0 = rNow(), rp0 = rPerf(), s0 = (main && HOST && HOST.time && cfg.resume !== false) ? HOST.time : null;
    var speed = s0 ? +s0.speed : (cfg.speed != null ? +cfg.speed : 1), m0 = s0 ? s0.m + (r0 - s0.r) * speed : r0;
    var off = s0 ? +s0.off : (cfg.time != null ? toMs(cfg.time) - m0 : (+cfg.offset || 0));
    var mI = m0, p0 = rp0, last = speed || 1, touched = speed !== 1, timers = {}, seq = 1e9, wake = 0, busy = false, nodes = [];
    function mono() { return speed ? m0 + (rNow() - r0) * speed : m0; }
    function wall() { return mono() + off; }
    function rebase() { var n = mono(); r0 = rNow(); rp0 = rPerf(); m0 = n; }
    function vperf(t) { return p0 + ((speed ? m0 + (t - rp0) * speed : m0) - mI); } // a real performance time -> virtual
    function perfNow() { return vperf(rPerf()); }
    // -- timers: virtual ones; timers made before the engine keep running for real (clear* still reaches them) --
    function thrown(e) { try { rST.call(S, function () { throw e; }, 0); } catch (x) {} }
    function call(t) { try { if (typeof t.fn === 'function') t.fn.apply(S, t.a); else (0, S.eval)(String(t.fn)); } catch (e) { thrown(e); } }
    function add(rep) { return function (fn, ms) { var id = seq++, d = Math.max(0, +ms || 0); timers[id] = { at: mono() + d, fn: fn, a: [].slice.call(arguments, 2), per: rep ? Math.max(1, d) : 0 }; plan(); return id; }; }
    function clr(real) { return function (id) { if (timers[id]) { delete timers[id]; plan(); } else if (id != null) try { real.call(S, id); } catch (e) {} }; }
    // fire every timer due at or before t in time order; a paused clock steps to each one, so Date.now() is right inside it.
    // An interval that is behind by more than maxCatchUp runs is moved past t (a huge speed cannot freeze the page).
    function runDue(t) {
      busy = true; var n = {};
      try { for (var g = 0; g < 1e6; g++) { var at = null, id = null; for (var k in timers) if (timers[k].at <= t && (at === null || timers[k].at < at)) { at = timers[k].at; id = k; } if (id === null) break;
        var x = timers[id]; if (!speed && at > m0) m0 = at; if (x.per) { x.at += x.per; if ((n[id] = (n[id] || 0) + 1) >= cap && x.at <= t) x.at = t + x.per; } else delete timers[id]; call(x); } } finally { busy = false; }
      if (!speed && t > m0) m0 = t;
    }
    function plan() { if (busy) return; if (wake) { rCT.call(S, wake); wake = 0; } if (!speed) return; var at = null; for (var k in timers) if (at === null || timers[k].at < at) at = timers[k].at; if (at !== null) wake = rST.call(S, tick, Math.min(2147483647, Math.max(0, (at - mono()) / speed))); }
    function tick() { wake = 0; runDue(mono()); plan(); }
    S.setTimeout = add(false); S.setInterval = add(true); S.clearTimeout = clr(rCT); S.clearInterval = clr(rCI);
    // -- time sources --
    var vNow = function () { return Math.floor(wall()); };
    if (typeof Proxy === 'function' && typeof Reflect === 'object') {
      S.Date = new Proxy(RD, { apply: function () { return new RD(wall()).toString(); }, construct: function (t, a, nt) { return Reflect.construct(t, a.length ? a : [wall()], nt); }, get: function (t, k) { return k === 'now' ? vNow : t[k]; } });
      try { Object.defineProperty(RD.prototype, 'constructor', { configurable: true, writable: true, enumerable: false, value: S.Date }); } catch (e) {}
    } else RD.now = vNow;
    try { if (PF) PF.now = perfNow; } catch (e) {}
    if (rRAF && cfg.raf !== false) S.requestAnimationFrame = function (f) { return rRAF.call(S, function (t) { f(vperf(t)); }); };
    if (cfg.events !== false && S.Event) { var ed = Object.getOwnPropertyDescriptor(S.Event.prototype, 'timeStamp'); if (ed && ed.get) try { Object.defineProperty(S.Event.prototype, 'timeStamp', { configurable: true, enumerable: ed.enumerable, get: function () { return vperf(ed.get.call(this)); } }); } catch (e) {} }
    // -- media: <audio>/<video> rate (paused while time is paused), CSS/Web animations, Web Audio buffer sources --
    function rate(el) { try { if (!speed) { if (!el.paused) { el.__simHeld = 1; el.pause(); } return; } if (el.__simHeld) { el.__simHeld = 0; var pp = el.play(); if (pp && pp.catch) pp.catch(function () {}); } el.playbackRate = Math.min(16, Math.max(0.0625, speed)); } catch (e) {} }
    function anims(list) { try { list.forEach(function (a) { a.playbackRate = speed; }); } catch (e) {} }
    function media() {
      if (cfg.media === false || !touched || !S.document) return;
      try { [].forEach.call(S.document.querySelectorAll('audio,video'), rate); } catch (e) {}
      if (S.document.getAnimations) anims(S.document.getAnimations());
      nodes = nodes.filter(function (nd) { try { nd.playbackRate.value = nd.__simBase * speed; return !nd.__simEnded; } catch (e) { return false; } });
    }
    if (cfg.media !== false && S.document && S.addEventListener) {
      S.addEventListener('play', function (e) { if (touched && e.target && 'playbackRate' in e.target) rate(e.target); }, true);
      ['animationstart', 'transitionrun'].forEach(function (t) { S.addEventListener(t, function (e) { if (touched && e.target && e.target.getAnimations) anims(e.target.getAnimations()); }, true); });
      var EP = S.Element && S.Element.prototype, ea = EP && EP.animate; if (ea) EP.animate = function () { var an = ea.apply(this, arguments); try { if (touched) an.playbackRate = speed; } catch (e) {} return an; }; // script animations fire no event
      var AB = S.AudioBufferSourceNode; if (AB && AB.prototype.start) { var ns = AB.prototype.start; AB.prototype.start = function () { try { var nd = this; nd.__simBase = nd.playbackRate.value; if (touched) nd.playbackRate.value = nd.__simBase * speed; nodes.push(nd); nd.addEventListener('ended', function () { nd.__simEnded = 1; }); } catch (e) {} return ns.apply(this, arguments); }; }
    }
    // -- one state for every realm of the sim --
    var RBC = (S.__sim && S.__sim.RealBC) || S.BroadcastChannel, bc = null;
    function state() { return { m: mono(), r: rNow(), speed: speed, off: off, time: wall(), pending: Object.keys(timers).length }; }
    function publish() { if (!main) return; var s = state(); try { if (HOST) HOST.time = s; } catch (e) {} if (bc) try { bc.postMessage({ t: 'state', s: s }); } catch (e) {} }
    function follow(s) { rebase(); var t = s.m + (rNow() - s.r) * s.speed; off = s.off; if (!s.speed) { speed = 0; runDue(t); m0 = t; } else { speed = s.speed; last = speed; r0 = rNow(); rp0 = rPerf(); m0 = t; runDue(t); } touched = touched || speed !== 1; media(); plan(); }
    if (cfg.channel && RBC) try { bc = new RBC(cfg.channel); bc.onmessage = function (e) { var m = e.data || {}; if (m.t === 'state' && !main) follow(m.s); else if (m.t === 'hello' && main) publish(); }; if (!main) bc.postMessage({ t: 'hello' }); } catch (e) { bc = null; }
    function changed() { touched = touched || speed !== 1; media(); plan(); publish(); }
    var api = {
      now: wall, perf: perfNow, state: state, pending: function () { return Object.keys(timers).length; },
      speed: function (x) { if (x == null) return speed; x = +x; if (!(x >= 0) || x === Infinity) throw new Error('speed must be a finite number >= 0'); rebase(); speed = x; if (x) last = x; changed(); return speed; },
      pause: function () { return api.speed(0); }, resume: function (x) { return api.speed(x != null ? x : last); },
      advance: function (ms) { rebase(); var t = m0 + Math.max(0, +ms || 0); if (speed) m0 = t; runDue(t); changed(); return wall(); },
      set: function (x) { var t = toMs(x); if (isNaN(t)) throw new Error('bad time: ' + x); off = t - mono(); changed(); return wall(); },
      shift: function (ms) { off += (+ms || 0); changed(); return wall(); }
    };
    S.__simTime = api; publish(); return api;
  }

  // ---- realm side: the operations a sim can run (stringified into workers / tabs / remote agents) ----
  function OPS(scope, opts) {
    opts = opts || {};
    var doc = scope.document || null, maxM = opts.maxMessage || 4e6, CA = opts.consoleAdapter || null;
    var logs = scope.__simLogs || (scope.__simLogs = []), errs = scope.__simErrs || (scope.__simErrs = []);
    capture(scope, logs, errs, logSink(opts.logPolicy || { maxEntries: opts.maxLogs || 2000 }));
    function fire(n, t, i) { try { var EC = (/^key/.test(t) && scope.KeyboardEvent) || (/^(click|dblclick|mouse|contextmenu)/.test(t) && scope.MouseEvent) || scope.Event; n.dispatchEvent(new EC(t, Object.assign({ bubbles: true, cancelable: true }, i || {}))); } catch (e) {} }
    function q(s) { return doc ? doc.querySelector(s) : null; }
    function setVal(n, v, evs) { n.value = v; evs.forEach(function (t) { fire(n, t); }); }
    // dom ops: [needs a matched node, action]; the result is !!node unless the action returns a value
    var DOM = {
      click: function (n) { n.click(); }, focus: function (n) { if (n.focus) n.focus(); }, blur: function (n) { if (n.blur) n.blur(); },
      type: function (n, a) { setVal(n, (a.clear !== false ? '' : n.value) + a.text, ['input', 'change']); },
      clear: function (n) { setVal(n, '', ['input', 'change']); },
      select: function (n, a) { if ('value' in n) setVal(n, a.value, ['change']); },
      press: function (n, a) { ['keydown', 'keypress', 'keyup'].forEach(function (t) { fire(n, t, Object.assign({ key: a.key }, a.init || {})); }); },
      submit: function (n) { if (n.requestSubmit) n.requestSubmit(); else fire(n, 'submit'); },
      scroll: function (n, a) { if (n.scrollIntoView) n.scrollIntoView(a.arg || true); },
      dispatch: function (n, a) { fire(n, a.type, a.init); },
      remove: function (n) { if (n.parentNode) n.parentNode.removeChild(n); }
    };
    var READ = {
      value: function (n) { return ('value' in n) ? n.value : null; }, checked: function (n) { return !!n.checked; }, text: function (n) { return n.textContent; },
      html: function (n) { return n.innerHTML; }, attr: function (n, a) { return n.getAttribute(a.name); },
      visible: function (n) { var r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
    };
    function dom(a) {
      if (!doc) throw Error('no DOM in runtime');
      if (a.op === 'count') return doc.querySelectorAll(a.sel).length;
      if (a.op === 'append') { if (doc.body) doc.body.insertAdjacentHTML('beforeend', a.html); return true; }
      var n = q(a.sel);
      if (DOM[a.op]) { if (n) DOM[a.op](n, a); return !!n; }
      if (READ[a.op]) return n ? READ[a.op](n, a) : (a.op === 'visible' ? false : null);
      throw Error('unknown dom op: ' + a.op);
    }
    function appEval(code, m) {
      m = m || {};
      if (scope.__app && typeof scope.__app.run === 'function') return Promise.resolve().then(function () { return scope.__app.run(code); }).then(function (v) { return { ok: 1, value: v, via: 'bridge' }; });
      if (!m.allowConsoleEval) return Promise.reject(Error('no __app bridge (see sim.report().bridge): set spec.bridgePattern / bridgeCode, or allowConsoleEval:true'));
      if (!doc) return Promise.reject(Error('no DOM'));
      if (!CA) return Promise.reject(Error('no console adapter: pass spec.console or preset (e.g. preset: \'aiChat\')'));
      var W = CA.waits || {}, wait = function (k, d) { return new Promise(function (r) { setTimeout(r, W[k] != null ? W[k] : d); }); };
      var t = q(CA.toggle); if (t) { try { if ('checked' in t) t.checked = true; fire(t, 'input'); fire(t, 'change'); } catch (e) {} }
      return wait('toggle', 80).then(function () { var o = q(CA.open); if (o) try { o.click(); } catch (e) {} return m.delay ? new Promise(function (r) { setTimeout(r, m.delay); }) : wait('open', 160); })
        .then(function () {
          var inp = q(CA.input), run = q(CA.run), out = q(CA.out); if (!inp || !run) throw Error('app console missing');
          var before = out ? out.value.length : 0; inp.value = code; run.click();
          return wait('run', 90).then(function () { var raw = out ? out.value.slice(before).trim() : '', box = CA.box ? q(CA.box) : null; if (box) try { box.remove(); } catch (e) {} return { ok: 1, value: raw.split('\n').pop(), via: 'console' }; });
        });
    }
    var sim = function () { return scope.__sim || {}; };
    return {
      info: function () { return { id: scope.__simId || null, version: opts.version || null, hasDOM: !!doc, hasBridge: !!(scope.__app && scope.__app.run), href: (scope.location && scope.location.href) || null }; },
      run: function (code) { if (String(code).length > maxM) throw Error('message too large'); return Promise.resolve(scope.eval(code)); },
      logs: function () { return logs.slice(); }, errs: function () { return errs.slice(); },
      clear: function () { [logs, errs].forEach(function (a) { a.length = 0; a.__c = 0; a.__s = null; }); return true; },
      dom: dom, appEval: appEval,
      // installed on first use when the sim was made without clock: advance() starts it paused, anything else at speed 1
      clock: function (m) {
        var co = m.co || 'now', c = scope.__simTime;
        if (!c) { if (co === 'state') return null; if (co === 'now') return scope.Date.now(); if (co === 'pending') return 0; c = timeEngine(scope, Object.assign({}, opts.clock || {}, { speed: co === 'advance' ? 0 : 1, role: 'main' })); }
        if (typeof c[co] !== 'function') throw Error('unknown clock op: ' + co); return c[co](m.ms);
      },
      net: function () { return sim().net || 0; }, stable: function () { return sim().mut || 0; },
      offline: function (v) { if (!scope.__sim) throw Error('offline needs iframe runtime with prelude'); scope.__sim.offline = !!v; return true; },
      pub: function (m) { try { if (scope.__simOnPub) scope.__simOnPub(m.channel, m.data, m.from, m.to); } catch (e) {} return true; }
    };
  }
  // one op table for both paths: called directly (iframe) and from a message (worker / tab / remote)
  function dispatch(o, n, a) {
    a = a || {};
    switch (n) {
      case 'ping': return 'pong';
      case 'run': return o.run(a.code); case 'dom': return o.dom(a.a); case 'appEval': return o.appEval(a.code, a);
      case 'offline': return o.offline(a.value); case 'clock': return o.clock(a); case 'pub': return o.pub(a);
      case 'info': case 'logs': case 'errs': case 'clear': case 'net': case 'stable': return o[n]();
    }
    throw Error('unknown op: ' + n);
  }
  function SERVER(ops, scope, send) {
    return function (m) {
      if (!m || m.__sim !== 1 || !m.op || m.ev || ('ok' in m)) return;
      if (m.to && m.to !== 'all' && scope.__simId && m.to !== scope.__simId) return;
      var id = m.id;
      function ok(v) { try { send({ __sim: 1, id: id, ok: 1, value: v }); } catch (e) { send({ __sim: 1, id: id, ok: 0, error: 'unserializable result: ' + String((e && e.message) || e) }); } }
      function bad(e) { send({ __sim: 1, id: id, ok: 0, error: String((e && e.stack) || e) }); }
      try { Promise.resolve(dispatch(ops, m.op, m)).then(ok, bad); } catch (e) { bad(e); }
    };
  }
  // agent: the code a worker / tab / remote page runs to be driven over a channel
  var AGENT_LINKS = {
    broadcast: 'var BC=new ((S.__sim&&S.__sim.RealBC)||S.BroadcastChannel)(A.name);var send=function(m){m.src=ME;BC.postMessage(m)};var listen=function(f){BC.onmessage=function(e){var m=e.data;if(m&&m.src===ME)return;f(m)}};',
    ws: 'var WS=new S.WebSocket(A.url);var send=function(m){m.src=ME;try{WS.send(JSON.stringify(m))}catch(e){}};var listen=function(f){WS.onmessage=function(e){var m;try{m=JSON.parse(e.data)}catch(x){return}f(m)}};',
    parent: 'var send=function(m){m.src=ME;(S.parent||S.opener||S).postMessage(m,"*")};var listen=function(f){S.addEventListener("message",function(e){if(e.data&&e.data.src===ME)return;f(e.data)})};',
    self: 'var send=function(m){S.postMessage(m)};var listen=function(f){S.onmessage=function(e){f(e.data)}};'
  };
  function agentSource(o) {
    o = o || {}; var A = { name: o.name, url: o.url }, fns = [OPS, dispatch, SERVER, timeEngine, logSink, capture].map(function (f) { return 'var ' + f.name + '=' + f.toString() + ';'; }).join('\n');
    return [';(function(){var S=(typeof self!=="undefined")?self:this;S.__simId=' + JSON.stringify(o.id || null) + ';var A=' + JSON.stringify(A) + ',ME=' + JSON.stringify(o.me || o.id || 'peer') + ';', fns, o.pre || '',
      'var OPTS=' + JSON.stringify({ consoleAdapter: o.consoleAdapter || null, maxMessage: o.maxMessage, maxLogs: o.maxLogs, version: VERSION, logPolicy: o.logPolicy || null, clock: o.clock || null }) + ';',
      (o.clock && o.clock.enabled) ? 'try{timeEngine(S,' + JSON.stringify(Object.assign({}, o.clock, { role: 'main' })) + ')}catch(e){}' : '', AGENT_LINKS[o.type] || AGENT_LINKS.self,
      'var ops=OPS(S,OPTS);listen(SERVER(ops,S,send));S.__simOnPub=function(){};S.__simPub=function(ch,d,to){try{send({__sim:1,op:"pub",channel:ch,data:d,from:S.__simId||null,to:to||null})}catch(e){}};',
      o.init ? 'try{S.eval(' + JSON.stringify(o.init) + ')}catch(e){}' : '',
      'send({__sim:1,ev:"ready",id:S.__simId||null,version:' + JSON.stringify(VERSION) + ',hasDOM:!!S.document,href:(S.location&&S.location.href)||null});})();'].join('\n');
  }
  function blobUrl(text, type) { var u = URL.createObjectURL(new Blob([text], { type: type || 'text/javascript' })); TRACK.urls.push(u); return u; }
  function agentUrl(o) { return blobUrl(agentSource(o)); }

  // ---- transports: every kind is send + on + close ----
  function multi(kind, send, attach, close) {
    var hs = [], api = { __simTransport: true, kind: kind, closed: false, send: send, on: function (f) { hs.push(f); return function () { pull(hs, f); }; }, off: function (f) { pull(hs, f); } };
    api.close = function () { if (api.closed) return; api.closed = true; try { if (close) close(); } catch (e) {} };
    try { if (attach) attach(function (m) { hs.slice().forEach(function (h) { try { h(m); } catch (e) {} }); }); } catch (e) {}
    return api;
  }
  function parse(e) { try { return JSON.parse(e.data); } catch (x) { return null; } }
  function transportFrom(cfg, me) {
    if (!cfg) return null; if (cfg.__simTransport) return cfg; me = me || uid('c');
    var T = cfg.type;
    if (T === 'worker') { var w = cfg.worker; return multi('worker', function (m) { w.postMessage(m); }, function (d) { w.onmessage = function (e) { d(e.data); }; }, function () { try { w.terminate(); } catch (e) {} }); }
    if (T === 'broadcast') { if (typeof BroadcastChannel === 'undefined') return null; var bc = new BroadcastChannel(cfg.name), bt = multi('broadcast', function (m) { m.src = me; bc.postMessage(m); }, function (d) { bc.onmessage = function (e) { var m = e.data; if (m && m.src === me) return; d(m); }; }, function () { bc.close(); }); bt.name = cfg.name; bt.me = me; return bt; }
    if (T === 'window') { var d0 = null, h = function (e) { if (cfg.origin && e.origin !== cfg.origin) return; if (e.data && e.data.src === me) return; if (d0) d0(e.data); }; G.addEventListener('message', h); return multi('window', function (m) { m.src = me; cfg.target.postMessage(m, cfg.origin || '*'); }, function (d) { d0 = d; }, function () { G.removeEventListener('message', h); }); }
    if (T === 'sse') { if (typeof EventSource === 'undefined') return null; var es = new EventSource(cfg.url), post = cfg.post || cfg.url; return multi('sse', function (m) { try { var fp = fetch(post, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) }); if (fp && fp.catch) fp.catch(function () {}); } catch (e) {} }, function (d) { es.onmessage = function (e) { var m = parse(e); if (m) d(m); }; }, function () { es.close(); }); }
    if (T === 'ws') {
      if (typeof WebSocket === 'undefined') return null;
      var ws, q = [], open = false, dead = false, hb = 0, rt = 0, wh = null, cap = cfg.maxQueue || DEFAULTS.maxQueue, beat = cfg.heartbeat || DEFAULTS.heartbeatMs;
      (function cx() { if (dead) return; try { ws = new WebSocket(cfg.url, cfg.protocols); } catch (e) { rt = setTimeout(cx, cfg.reconnectMs || DEFAULTS.reconnectMs || 1500); return; } if (wh) ws.onmessage = wh;
        ws.onopen = function () { open = true; while (q.length) try { ws.send(q.shift()); } catch (e) {} if (beat) hb = setInterval(function () { try { ws.send(JSON.stringify({ __sim: 1, op: 'ping' })); } catch (e) {} }, beat); };
        ws.onclose = function () { open = false; if (hb) { clearInterval(hb); hb = 0; } if (!dead) rt = setTimeout(cx, cfg.reconnectMs || DEFAULTS.reconnectMs || 1500); }; })();
      return multi('ws', function (m) { m.src = me; var s = JSON.stringify(m); if (open) try { ws.send(s); } catch (e) {} else { q.push(s); if (q.length > cap) q.splice(0, q.length - cap); } },
        function (d) { wh = function (e) { var m = parse(e); if (m && m.op !== 'ping') d(m); }; if (ws) ws.onmessage = wh; },
        function () { dead = true; if (hb) clearInterval(hb); if (rt) clearTimeout(rt); try { ws.close(); } catch (e) {} });
    }
    if (cfg.send && cfg.on) return multi(T || 'custom', cfg.send, cfg.on, cfg.close);
    return null;
  }

  // ---- one channel: local (call ops in this thread) or message (transport + pending replies) ----
  function Channel(o) {
    var so = o.opts || {}, SO = function (k) { return optOf(so, k); }, ch = { kind: o.tr ? (o.tr.kind || 'remote') : 'direct', iframe: o.iframe || null, transport: o.tr || null, versionMismatch: false, isReady: !o.tr };
    if (!o.tr) { var get = o.ops; ch.ready = Promise.resolve({}); ch.op = function (n, a, T) { return race(Promise.resolve().then(function () { return dispatch(get(), n, a); }), T == null ? SO('actionTimeout') : T, n); }; ch.close = function () {}; return ch; }
    var tr = o.tr, pending = {}, me = tr.me || uid('c'), peer = null, readyRes;
    ch.ready = new Promise(function (r) { readyRes = r; });
    tr.on(function (m) {
      if (!m || m.__sim !== 1) return;
      var p = m.id && pending[m.id]; if (p) { delete pending[m.id]; clearTimeout(p.t); if (m.ok) p.res(m.value); else p.rej(Error(m.error || 'peer error')); return; }
      if (m.ev !== 'ready' || ch.isReady || ch._rejected) return; peer = m.id || null;
      if (m.version && m.version !== VERSION) { ch.versionMismatch = true; EV.emit('versionMismatch', { peer: m.version, self: VERSION }); if (SO('strictVersion')) { ch._rejected = true; readyRes(Promise.reject(Error('SIM version mismatch: ' + m.version + ' vs ' + VERSION))); return; } }
      ch.isReady = true; readyRes({ id: m.id, version: m.version, hasDOM: !!m.hasDOM, href: m.href });
    });
    ch.op = function (n, a, T) { var cid = uid('r'); T = T == null ? SO('actionTimeout') : T; return new Promise(function (res, rej) { pending[cid] = { res: res, rej: rej }; var msg = Object.assign({ __sim: 1, op: n, id: cid, src: me }, a || {}); if (SO('routeById') && peer) msg.to = peer; try { tr.send(msg); } catch (e) { delete pending[cid]; return rej(e); } if (T > 0) pending[cid].t = setTimeout(function () { if (pending[cid]) { delete pending[cid]; rej(Error('sim timeout: ' + n)); } }, T); }); };
    ch.close = function () { try { tr.close(); } catch (e) {} };
    return ch;
  }

  // ---- actions: plain data (or a function) -> one sim call; checked in this order ----
  function norm(o) { return (o == null) ? {} : (typeof o === 'number' ? { timeout: o } : o); }
  function domA(op, f) { return function (s, a) { return s.action(Object.assign({ op: op }, f(a)), a); }; }
  var ACTIONS = [
    ['op', function (s, a) { return s.action(a, a); }],
    ['wait', function (s, a) { return sleep(a.wait).then(function () { return { ok: 1 }; }); }],
    ['eval', function (s, a) { return s.run(a.eval, a); }],
    ['appEval', function (s, a) { return s.appEval(a.appEval, a); }],
    ['loadScript', function (s, a) { return s.loadScript(a.loadScript, { timeout: a.timeout }); }],
    ['loadIntoApp', function (s, a) { return s.loadIntoApp(a.loadIntoApp, { delay: a.delay, timeout: a.timeout }); }],
    ['publish', function (s, a) { return { ok: s.publish(a.publish[0], a.publish[1], a.to) }; }],
    ['offline', function (s, a) { return s.offline(a.offline); }],
    ['clock', function (s, a) { return s.clock.advance(a.clock); }],
    ['speed', function (s, a) { return s.time.speed(a.speed); }],
    ['click', domA('click', function (a) { return { sel: a.click }; })],
    ['type', domA('type', function (a) { return { sel: a.type[0], text: a.type[1], clear: a.clear }; })],
    ['press', domA('press', function (a) { return { sel: a.press[0], key: a.press[1], init: a.init }; })],
    ['select', domA('select', function (a) { return { sel: a.select[0], value: a.select[1] }; })],
    ['focus', domA('focus', function (a) { return { sel: a.focus }; })],
    ['append', domA('append', function (a) { return { html: a.append }; })],
    ['navigate', function (s, a, o) { return s.navigate ? s.navigate(a.navigate, a.init, { timeout: a.timeout != null ? a.timeout : o.timeout }) : { ok: 0, error: 'navigate needs an iframe sim' }; }],
    ['waitForNetworkIdle', function (s, a) { return a.waitForNetworkIdle ? s.waitForNetworkIdle(a.timeout, a.quiet) : null; }],
    ['waitForStable', function (s, a) { return a.waitForStable ? s.waitForStable(a.timeout, a.quiet) : null; }],
    ['waitFor', function (s, a) { return s.waitFor(a.waitFor, a.timeout).then(function (ok) { return { ok: !!ok }; }); }],
    ['assert', function (s, a) { return s.waitFor(a.assert, a.timeout).then(function (ok) { return { ok: !!ok, assert: a.assert }; }); }],
    ['log', function (s, a) { return { ok: 1, log: a.log }; }]
  ];
  function runAction(sim, a, opts) {
    return Promise.resolve().then(function () {
      if (typeof a === 'function') return a(sim);
      if (!a || typeof a !== 'object') return { ok: 0, error: 'unknown action' };
      if (a.do) return a.do(sim);
      for (var i = 0; i < ACTIONS.length; i++) { if (a[ACTIONS[i][0]] == null) continue; var r = ACTIONS[i][1](sim, a, opts || {}); if (r != null) return r; }
      return { ok: 0, error: 'unknown action' };
    }).then(null, function (e) { return { ok: 0, error: String(e) }; });
  }
  // route pattern: substring | RegExp | null (everything)
  function patTest(p) { return p == null ? function () { return true; } : function (u) { try { return (p instanceof RegExp) ? (p.lastIndex = 0, p.test(u)) : String(u).indexOf(p) !== -1; } catch (e) { return false; } }; }
  // repeat check() until it resolves truthy, the sim dies, or timeout (0 = none)
  function pollUntil(sim, check, T, every) { var t0 = now(); return new Promise(function (res) { (function p() { if (sim._dead) return res(false); Promise.resolve().then(check).then(function (v) { if (v === true) return res(true); if (v === false || (T > 0 && now() - t0 > T)) return res(false); setTimeout(p, every); }, function () { res(false); }); })(); }); }

  // ---- the sim object: the same for every runtime; runtimes add win/doc/navigate/report extras ----
  function Sim(ch, meta) {
    var so = meta.opts || {}, O = function (k) { return optOf(so, k); };
    var sim = { id: meta.id, name: meta.id, kind: meta.kind || ch.kind, ready: ch.ready || Promise.resolve({}), createdAt: now(), lastUsed: now(), ttl: meta.ttl || 0, opts: so, _dead: false, _hooks: [], _m: { ops: 0, errs: 0, ms: 0, byName: {} }, _trace: [], _traceOn: false, _traceMax: O('traceMax'), _rec: null, _urls: meta.urls || [], _host: meta.host || null, _allowConsoleEval: meta.allowConsoleEval != null ? meta.allowConsoleEval : O('allowConsoleEval') };
    sim._ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    function touch() { sim.lastUsed = now(); return sim; }
    sim.touch = touch; sim.timeout = function (ms) { sim.ttl = ms || 0; sim.createdAt = now(); return sim; }; sim.alive = function () { return !sim._dead; };
    sim.isDead = function () { return sim._dead || !!(ch.transport && ch.transport.closed) || !!(ch.iframe && ch.iframe.ownerDocument && !ch.iframe.ownerDocument.contains(ch.iframe)); };
    sim.onDestroy = function (f) { sim._hooks.push(f); return sim; }; sim.onEvent = function (k, f) { return EV.on(k, f); };
    sim.signal = function () { if (!sim._ctl) sim._ctl = new AbortController(); return sim._ctl.signal; };
    sim.abort = function () { try { sim._ctl.abort(); } catch (e) {} sim._ctl = new AbortController(); return true; };
    sim.metrics = function () { return JSON.parse(JSON.stringify(sim._m)); };
    sim.trace = function (on, max) { sim._traceOn = (on !== false); if (max) sim._traceMax = max; return sim._trace; };
    sim._note = function (name, ok, ms) { var m = sim._m; m.ops++; m.ms += ms; if (!ok) m.errs++; m.byName[name] = (m.byName[name] || 0) + 1; if (sim._traceOn) { sim._trace.push({ op: name, ok: ok ? 1 : 0, ms: ms, t: now() }); if (sim._trace.length > sim._traceMax) sim._trace.shift(); } EV.emit('op', sim, { op: name, ok: ok ? 1 : 0, ms: ms }); };
    // every op goes through here: timeout, retry/backoff, abort signal, metrics, record
    sim._call = function (name, args, opts) {
      opts = norm(opts); if (sim._dead) return Promise.resolve({ ok: 0, error: 'destroyed' });
      var t0 = now(), T = opts.timeout != null ? opts.timeout : O('actionTimeout'), sig = opts.signal || (O('autoAbort') && sim._ctl ? sim._ctl.signal : null);
      return race(attempt(function () { return ch.op(name, args, T); }, { retry: opts.retry != null ? opts.retry : O('retry'), backoff: opts.backoff != null ? opts.backoff : O('backoff') }), 0, name, sig)
        .then(function (v) { sim._note(name, 1, now() - t0); if (sim._rec) sim._rec.push({ op: name, args: args }); return { ok: 1, value: v }; }, function (e) { sim._note(name, 0, now() - t0); return { ok: 0, error: errMsg(e) }; });
    };
    sim.run = function (code, opts) { touch(); return sim._call('run', { code: code }, opts); };
    sim.action = function (a, opts) { touch(); return sim._call('dom', { a: a }, opts); };
    sim.appEval = function (code, opts) { touch(); opts = norm(opts); return sim._call('appEval', { code: code, delay: opts.delay, allowConsoleEval: opts.allowConsoleEval != null ? opts.allowConsoleEval : sim._allowConsoleEval }, opts).then(function (r) { return (r && r.ok && r.value && typeof r.value === 'object' && 'ok' in r.value) ? r.value : r; }); };
    function loader(fn) { return function (u, opts) { touch(); return asSource(u).then(function (t) { return fn(t, opts); }, function (e) { return { ok: 0, error: 'load failed: ' + errMsg(e) }; }); }; }
    sim.loadIntoApp = loader(sim.appEval); sim.loadScript = loader(sim.run);
    ['value', 'text', 'count'].forEach(function (op) { sim[op] = function (sel, opts) { return sim.action({ op: op, sel: sel }, opts); }; });
    // info / logs / errs: host copy when the realm is gone (or is a tab); worker/remote keep nothing after destroy
    function read(op, hostKey) { return function () { touch(); var H = sim._host; if (hostKey && H && (sim._dead || sim.kind === 'tab')) return Promise.resolve(H[hostKey].slice()); if (sim._dead) return ch.iframe ? (op === 'info' ? Promise.resolve({ id: sim.id, dead: true }) : ch.op(op, {})) : Promise.reject(Error('destroyed: ' + sim.kind + ' sims do not keep ' + op + ' after destroy')); return ch.op(op, {}); }; }
    sim.info = read('info'); sim.logs = read('logs', 'logs'); sim.errs = read('errs', 'errs');
    sim.clearLogs = function () { var H = sim._host; if (H) { resetLog(H.logs); resetLog(H.errs); if (sim._dead || sim.kind === 'tab') return Promise.resolve(true); } return ch.op('clear', {}); };
    sim.publish = function (c, data, to) { touch(); bus.publish(c, data, { from: sim.id, to: to }); return true; };
    sim.on = sim.subscribe = function (c, fn, opt) { opt = opt || {}; return bus.subscribe(c, function (d, m) { m = m || {}; if (!opt.includeSelf && m.from === sim.id && m.via !== 'peer') return; if (m.to && m.to !== 'all' && m.to !== sim.id) return; fn(d, m); }); };
    sim.one = function (a, opts) { touch(); return runAction(sim, a, opts); };
    sim.command = function (a, opts) { return sim.one(a, norm(opts)); };
    sim.act = function (list, opts) { opts = opts || {}; var out = [], chain = list.reduce(function (p, a) { return p.then(function () { return sim.one(a, opts).then(function (r) { out.push(r); }); }); }, Promise.resolve()).then(function () { return out; }); return opts.timeout ? race(chain, opts.timeout, 'act') : chain; };
    sim.offline = function (v) { touch(); if (sim._host) { sim._host.offline = !!v; return Promise.resolve({ ok: 1, value: true }); } return sim._call('offline', { value: !!v }, {}); };
    // routes live in the host record (shared by the page, its child frames and every page it navigates to)
    function RT() { if (sim._host) return sim._host; var w = ch.iframe && ch.iframe.contentWindow; return (w && w.__sim) || null; }
    function pageWin() { return (ch.iframe && ch.iframe.contentWindow) || (typeof sim.win === 'function' ? null : sim.win) || null; }
    function addRoute(list, pattern, opts, fn) {
      var T = RT(); if (!T) return { ok: 0, error: 'routes need an iframe or tab sim' }; opts = opts || {}; var rid = uid('rt'), times = opts.times || 0;
      T.handlers[rid] = function () { if (times && --times <= 0) sim.unroute(rid); return fn.apply(null, arguments); };
      T[list].push({ id: rid, method: opts.method || null, delay: opts.delay || 0, test: patTest(pattern) }); return rid;
    }
    sim.route = function (pattern, handler, opts) { return addRoute('routes', pattern, opts, function (u, i, init) { return handler(u, i, { win: pageWin(), init: init || null, body: (init && init.body != null) ? init.body : ((i && i.body) || null), headers: Object.assign(hdrObj(i && typeof i === 'object' ? i.headers : null), hdrObj(init && init.headers)), method: String((init && init.method) || (i && i.method) || 'GET').toUpperCase() }); }); };
    // WebSocket server: handler(peer, ctx) runs when the page opens a matching socket; return false to refuse it
    sim.routeWs = function (pattern, handler, opts) { return addRoute('wsRoutes', pattern, opts, function (peer) { return handler(peer, { win: pageWin(), url: peer.url, protocols: peer.protocols }); }); };
    sim.unroute = sim.unrouteWs = function (rid) { var T = RT(); if (!T) return; ['routes', 'wsRoutes'].forEach(function (k) { var L = T[k] || []; for (var i = L.length - 1; i >= 0; i--) if (rid == null || L[i].id === rid) { delete T.handlers[L[i].id]; L.splice(i, 1); } }); };
    sim.clearRoutes = function () { sim.unroute(null); };
    // waits: one poller
    var TM = function (k, d) { return timing(so, k, d); }, tOf = function (t) { return t != null ? t : O('actionTimeout'); };
    sim.waitFor = function (cond, timeout) { return pollUntil(sim, function () { var p = typeof cond === 'function' ? Promise.resolve().then(function () { return cond(sim); }).then(function (v) { return { ok: 1, value: v }; }, function () { return {}; }) : (cond && typeof cond === 'object' && cond.app != null) ? sim.appEval('!!(' + cond.app + ')') : sim.run('!!(' + cond + ')'); return p.then(function (r) { return (r && r.ok && r.value) ? true : undefined; }); }, tOf(timeout), TM('waitPollMs', 100)); };
    function quiet(op, busy) { return function (timeout, q) { var Q = q != null ? q : TM('quietMs', 200), q0 = now(), last; return pollUntil(sim, function () { return ch.op(op, {}).then(function (n) { if (busy(n, last)) q0 = now(); else if (now() - q0 >= Q) return true; last = n; }); }, tOf(timeout), TM('netPollMs', 60)); }; }
    sim.waitForNetworkIdle = quiet('net', function (n) { return !!n; });
    sim.waitForStable = quiet('stable', function (n, last) { return n !== last; });
    // time control (sim.clock is the same object, kept for older code)
    sim.time = sim.clock = {}; ['now', 'state', 'pending', 'speed', 'pause', 'resume', 'advance', 'set', 'shift', 'perf'].forEach(function (co) { sim.time[co] = function (ms) { touch(); return sim._call('clock', { co: co, ms: ms }, {}); }; });
    sim.record = function (on) { sim._rec = (on === false) ? null : []; return sim; };
    sim.replay = function (rec) { return (rec || sim._rec || []).reduce(function (p, e) { return p.then(function () { return sim._call(e.op, e.args, {}); }); }, Promise.resolve()).then(function () { return true; }, function () { return false; }); };
    sim.report = function () { return { id: sim.id, kind: sim.kind, name: sim.name, ready: !!ch.isReady, age: now() - sim.createdAt, idle: now() - sim.lastUsed, ttl: sim.ttl, dead: sim.isDead(), versionMismatch: !!ch.versionMismatch, time: liveTime(sim._host && sim._host.time), load: (so._load || null) }; };
    sim.destroy = function () {
      if (sim._dead) return true; sim._dead = true;
      try { sim.abort(); } catch (e) {}
      sim._hooks.splice(0).forEach(function (f) { try { f(sim); } catch (e) {} });
      try { ch.close(); } catch (e) {}
      if (ch.transport) bus.removeTransport(ch.transport);
      sim._urls.forEach(function (u) { pull(TRACK.urls, u); try { URL.revokeObjectURL(u); } catch (e) {} });
      if (ch.iframe) { pull(TRACK.iframes, ch.iframe); try { ch.iframe.remove(); } catch (e) {} }
      try { if (sim.kind === 'tab' && sim.win && !sim.win.closed) sim.win.close(); } catch (e) {}
      delete registry[sim.id]; EV.emit('remove', sim); if (!ids().length) watchdog(false); return true;
    };
    if (ch.transport) bus.addTransport(ch.transport);
    delete reserving[sim.id]; registry[sim.id] = sim; EV.emit('add', sim); if (DEFAULTS.autoGc) watchdog(true); return sim;
  }

  // ---- bus: local pub/sub, mirrored to every transport ----
  var bus = (function () {
    var subs = [], trs = [];
    function emit(c, data, meta) { meta = meta || {}; subs.slice().forEach(function (s) { if (s.ch === '*' || s.ch === c) try { s.fn(data, meta, c); } catch (e) {} }); }
    function publish(c, data, opt) { opt = opt || {}; var meta = { from: opt.from || null, to: opt.to || null, via: opt.via || 'local' }; emit(c, data, meta); trs.slice().forEach(function (t) { try { t.send({ __sim: 1, op: 'pub', channel: c, data: data, from: meta.from, to: meta.to }); } catch (e) {} }); }
    function subscribe(c, fn) { var s = { ch: c, fn: fn }; subs.push(s); return function () { pull(subs, s); }; }
    function add(t) { if (!t || trs.indexOf(t) >= 0) return t || null; trs.push(t); t.on(function (m) { if (m && m.__sim === 1 && m.op === 'pub') emit(m.channel, m.data, { from: m.from || null, to: m.to || null, via: 'peer' }); }); return t; }
    return { emit: emit, publish: publish, subscribe: subscribe, addTransport: add, removeTransport: function (t) { pull(trs, t); }, transports: trs, subscribers: subs };
  })();
  function inputsAdd(cfg) {
    cfg = cfg || {};
    if (cfg.type !== 'poll') { var t = transportFrom(cfg); if (t) bus.addTransport(t); return t; }
    var stop = false, ph = { kind: 'poll', close: function () { stop = true; pull(TRACK.polls, ph); } };
    (function loop() { if (stop) return; fetch(cfg.url).then(function (r) { return r.json(); }).then(function (d) { bus.emit(cfg.channel || 'poll', cfg.map ? cfg.map(d) : d, { via: 'poll' }); }).catch(function () {}).then(function () { if (!stop) setTimeout(loop, cfg.interval || DEFAULTS.pollMs || 2000); }); })();
    TRACK.polls.push(ph); return ph;
  }

  // ---- storage separation: plan (host) ----
  var ISO_FEATURES = ['localStorage', 'sessionStorage', 'cookies', 'indexedDB', 'broadcast', 'caches', 'locks', 'history'];
  var ISO_PER_TAB = { sessionStorage: 1, history: 1 }, KV = { localStorage: 'ls:', sessionStorage: 'ss:', cookies: 'ck:' };
  var ISO_MODES = { navigation: ['virtual', 'block', 'allow'], childFrames: ['isolate', 'block', 'allow'], popups: ['block', 'allow'], workers: ['isolate', 'allow'], serviceWorker: ['block', 'allow'], cookieStore: ['isolate', 'block', 'allow'], storageBuckets: ['block', 'allow'], opfs: ['isolate', 'block', 'allow'] };
  function isoVal(src, k) { var I = src.isolate; return (I === false) ? false : (I && typeof I === 'object' && own(I, k)) ? I[k] : undefined; }
  function compileModes(src) {
    var D = DEFAULTS.isolateModes || {}, m = {};
    Object.keys(ISO_MODES).forEach(function (k) { var L = ISO_MODES[k], v = isoVal(src, k); if (v && typeof v === 'object') v = v.mode; if (v === false) v = 'allow'; if (v === true || v == null) v = D[k]; m[k] = L.indexOf(v) >= 0 ? v : (L.indexOf(D[k]) >= 0 ? D[k] : L[0]); });
    var I = src.isolate, ol = (isObj(I) && I.onLost) || src.onLost || D.onLost; m.onLost = ['blank', 'destroy', 'report'].indexOf(ol) >= 0 ? ol : 'blank';
    if (isObj(I) && isObj(I.navigation) && I.navigation.api === false) m.navApi = false;
    m.csp = optOf(src, 'csp'); m.rocket = optOf(src, 'rocketLoader'); // page fixes, also applied to child frames
    return m;
  }
  function hostStore(pre) { var LS = null; try { LS = G.localStorage; } catch (e) {} if (!LS) return new Map(); return { get: function (k) { return LS.getItem(pre + k); }, set: function (k, v) { LS.setItem(pre + k, String(v)); }, 'delete': function (k) { LS.removeItem(pre + k); }, has: function (k) { return LS.getItem(pre + k) !== null; }, keys: function () { var o = []; for (var i = 0; i < LS.length; i++) { var kk = LS.key(i); if (kk && kk.indexOf(pre) === 0) o.push(kk.slice(pre.length)); } return o; } }; }
  // per feature: off | { ns, prefix, pass, map, seed, store, keep, impl, absent, quota, group, ... }
  function compileIso(src, id) {
    var out = {};
    ISO_FEATURES.forEach(function (k) {
      var r = isoVal(src, k); if (r === undefined) r = true;
      if (r === false) { out[k] = { off: true }; return; }
      var isStore = r && typeof r === 'object' && (r instanceof Map || typeof r.getItem === 'function' || (typeof r.get === 'function' && typeof r.set === 'function'));
      var f = typeof r === 'string' ? { ns: r } : isStore ? { store: r } : isObj(r) ? Object.assign({}, r) : {};
      if (!own(f, 'ns') && !ISO_PER_TAB[k] && src.ns != null) f.ns = src.ns;
      var g = f.ns != null ? sharedOf(String(f.ns)) : null;
      if (f.prefix == null) f.prefix = nsPrefix(f.ns, id);
      if (f.keep == null) { var K = src.keep; f.keep = isObj(K) ? !!K[k] : (K != null ? !!K : f.ns != null); }
      if (KV[k]) {
        if (k !== 'cookies' && f.quota == null) f.quota = optOf(src, 'storageQuota') || 0;
        var persist = f.persist != null ? !!f.persist : (k !== 'sessionStorage' && ((g && optOf(src, 'persistShared') !== false) || !!f.keep));
        if (!f.store) f.store = persist ? hostStore(f.prefix + KV[k]) : g ? g[KV[k].slice(0, 2)] : new Map();
        if (k === 'localStorage' && !f.group) f.group = g || (out.__group || (out.__group = { wins: [] }));
      }
      out[k] = f;
    });
    return out;
  }
  // JSON-safe copy of a plan (for realms that cannot reach the host page): RegExps travel as data, functions are listed as lost
  function plainIso(spec) {
    var o = {}, lost = []; if (spec.__modes) o.__modes = JSON.parse(JSON.stringify(spec.__modes)); if (spec.__opfs) o.__opfs = spec.__opfs;
    function pl(v, path) { if (v instanceof RegExp) return { __re: v.source, flags: v.flags }; if (typeof v === 'function') { lost.push(path); return undefined; } return Array.isArray(v) ? v.map(function (x, i) { return pl(x, path + '[' + i + ']'); }) : v; }
    for (var k in spec) { if (!own(spec, k) || k.indexOf('__') === 0) continue; var f = spec[k], c = {}; for (var j in f) { if (!own(f, j) || j === 'store' || j === 'group' || j === 'impl' || (k === 'indexedDB' && j === 'seed')) continue; var v = pl(f[j], k + '.' + j); if (v !== undefined) c[j] = v; } o[k] = c; }
    if (lost.length) o.__lost = lost; try { return JSON.parse(JSON.stringify(o)); } catch (e) { return {}; }
  }
  // shared by host and realms (stringified): naming rule + where injected code goes in a page
  function isoLib() {
    var H = Object.prototype.hasOwnProperty;
    function rx(p) { return (p && typeof p === 'object' && typeof p.__re === 'string') ? new RegExp(p.__re, p.flags || '') : p; }
    function tester(p) { p = rx(p); if (p == null || p === false) return function () { return false; }; if (p === true) return function () { return true; }; if (typeof p === 'function') return function (n) { try { return !!p(n); } catch (e) { return false; } }; if (typeof p === 'string') return function (n) { return String(n) === p; }; if (Array.isArray(p)) { var ts = p.map(tester); return function (n) { return ts.some(function (t) { return t(n); }); }; } if (typeof p.test === 'function') return function (n) { p.lastIndex = 0; return p.test(String(n)); }; return function () { return false; }; }
    function mapper(m) { if (!m) return function () { return null; }; if (typeof m === 'function') return function (n) { var r = null; try { r = m(n); } catch (e) {} return r == null ? null : String(r); }; return function (n) { return H.call(m, n) ? String(m[n]) : null; }; }
    function revMap(m) { var o = {}; if (m && typeof m === 'object') for (var k in m) if (H.call(m, k)) o[String(m[k])] = k; return o; }
    // to(name): real name + whether it is this sim's own; from(real): the name the page sees (null = not visible)
    function naming(f) { var pass = tester(f.pass), map = mapper(f.map), rv = revMap(f.map), pre = f.prefix == null ? '' : String(f.prefix);
      return { to: function (n) { n = String(n); if (pass(n)) return { name: n, own: false }; var m = map(n); if (m != null) return { name: m, own: false }; return { name: pre + n, own: !!pre }; },
        from: function (r) { r = String(r); if (pre && r.indexOf(pre) === 0) return r.slice(pre.length); if (H.call(rv, r)) return rv[r]; if (pass(r)) return r; return pre ? null : r; } }; }
    // injected code goes right after <head> (or <html>, <!doctype>, or at the start), always before the page's first script or body
    function spliceHead(html, tag) { html = String(html); var lim = html.search(/<(script|body)[\s>]/i), at = 0; if (lim < 0) lim = html.length; [/<head(?:\s[^>]*)?>/i, /<html(?:\s[^>]*)?>/i, /<!doctype[^>]*>/i].some(function (re) { var m = re.exec(html); if (m && m.index < lim) { at = m.index + m[0].length; return true; } return false; }); return html.slice(0, at) + tag + html.slice(at); }
    // o = the sim's modes: <meta http-equiv> refresh (navigation not 'allow') and CSP (csp 'strip') are kept but switched off;
    // rocket 'undo' runs Cloudflare Rocket Loader scripts (type="<hash>-text/javascript") as normal scripts
    function pageFix(html, o) { html = String(html); o = o || {}; var eq = [o.navigation && o.navigation !== 'allow' && 'refresh', o.csp === 'strip' && 'content-security-policy'].filter(Boolean);
      if (eq.length) html = html.replace(new RegExp('<meta\\b([^>]*?)\\bhttp-equiv(\\s*=\\s*["\']?(?:' + eq.join('|') + '))', 'gi'), '<meta$1data-sim-http-equiv$2');
      if (o.rocket === 'undo') html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["']?[^"'\s>]*rocket-loader[^>]*>\s*<\/script\s*>/gi, '').replace(/(<script\b[^>]*?\btype\s*=\s*["']?)[0-9a-f]{8,}-(text\/javascript|module)\b/gi, '$1$2');
      return html; }
    return { tester: tester, mapper: mapper, revMap: revMap, naming: naming, spliceHead: spliceHead, pageFix: pageFix };
  }
  var LIB = isoLib();

  // ---- IndexedDB seed (host, before the page boots): only creates databases that do not exist ----
  function idbExists(fac, name) { return new Promise(function (res) { function probe() { var q, fresh = false; try { q = fac.open(name); } catch (e) { return res(false); } q.onupgradeneeded = function () { fresh = true; try { q.transaction.abort(); } catch (e) {} }; q.onsuccess = function () { try { q.result.close(); } catch (e) {} res(true); }; q.onerror = function (e) { try { e.preventDefault(); } catch (x) {} res(!fresh); }; q.onblocked = function () { res(true); }; } if (typeof fac.databases === 'function') fac.databases().then(function (l) { res((l || []).some(function (d) { return d && d.name === name; })); }, probe); else probe(); }); }
  function seedIdb(src) {
    var f = src._iso && src._iso.indexedDB, fac = f && (f.impl || G.indexedDB);
    if (!f || f.off || f.absent || !f.seed || !fac) return Promise.resolve();
    var N = LIB.naming(f), errs = src._seedErrors = src._seedErrors || [], info = src._seed = { seeded: [], skipped: [], errors: errs }, RES = { keyPath: 1, autoIncrement: 1, records: 1, indexes: 1 }; src._seededDbs = src._seededDbs || [];
    function structured(sd) { if (!isObj(sd)) return false; for (var k in sd) if (own(sd, k) && !RES[k]) return false; return true; }
    return Promise.all(Object.keys(f.seed).map(function (db) {
      var d = f.seed[db] || {}, stores = d.stores || d, r = N.to(db);
      if (!r.own && !f.seedReal) { info.skipped.push({ db: db, name: r.name, reason: 'real name (pass/map): set seedReal: true to allow' }); return; }
      return idbExists(fac, r.name).then(function (ex) {
        if (ex) { info.skipped.push({ db: db, name: r.name, reason: 'already exists (not modified)' }); return; }
        return new Promise(function (res) {
          var fresh = false, q; try { q = fac.open(r.name, d.version || 1); } catch (e) { errs.push(db + ': ' + e.message); return res(); }
          q.onupgradeneeded = function (e) { if (e.oldVersion !== 0) { try { q.transaction.abort(); } catch (x) {} return; } fresh = true; var h = q.result;
            Object.keys(stores).forEach(function (sn) { if (!d.stores && sn === 'version') return;
              try { var sd = stores[sn] || {}, st = structured(sd), o = {}; if (st && sd.keyPath != null) o.keyPath = sd.keyPath; if (st && sd.autoIncrement) o.autoIncrement = true;
                var os = h.createObjectStore(sn, o); if (st && sd.indexes) Object.keys(sd.indexes).forEach(function (ix) { var x = sd.indexes[ix]; os.createIndex(ix, x.keyPath || x, x.options || {}); });
                var recs = st ? (sd.records || []) : sd, inline = st && (sd.keyPath != null || sd.autoIncrement);
                if (Array.isArray(recs)) recs.forEach(function (v) { if (inline) os.put(v); else os.put(v[1], v[0]); }); else Object.keys(recs).forEach(function (k) { os.put(recs[k], k); });
              } catch (x) { errs.push(db + '.' + sn + ': ' + x.message); } }); };
          q.onsuccess = function () { try { q.result.close(); } catch (e) {} if (fresh) { info.seeded.push(db); if (r.own) src._seededDbs.push(r.name); } res(); };
          q.onerror = function (e) { try { e.preventDefault(); } catch (x) {} errs.push(db + ': ' + ((q.error && q.error.message) || 'open failed')); res(); };
          q.onblocked = function () { errs.push(db + ': blocked by an open connection'); res(); };
        });
      });
    }));
  }

  // ---- host record: what the page, its child frames and navigated pages share (found by walking parent/opener) ----
  // the last published time state, carried forward to now (report() reads it without a round trip)
  function liveTime(s) { if (!s) return null; var d = s.speed ? (now() - s.r) * s.speed : 0; return { time: s.time + d, speed: s.speed, offset: s.off, pending: s.pending }; }
  function hostRec(src, id) { var H = { id: id, runtime: src.runtime, routes: [], wsRoutes: [], handlers: {}, time: null, proxy: null, proxies: [], proxyRequests: false, offline: false, logs: [], errs: [], rec: { dbs: [], caches: [] }, iso: null, nav: null }; H.emit = function (type, d) { EV.emit(type, Object.assign({ id: id }, d || {})); }; (G.__simHost = G.__simHost || {})[id] = H; src._host = H; return H; }
  function prepIso(src, id) {
    src._simId = id; var H = src._host || hostRec(src, id); src._clock = clockCfg(src, id);
    // page requests through a proxy: 'auto' = only when the page itself had to be loaded through one
    var PR = optOf(src, 'proxyRequests'); H.proxies = proxyList(src); H.proxy = src._proxy || (PR === true ? H.proxies[0] || null : null); H.proxyRequests = !!H.proxy && PR !== false;
    if (src.isolate === false) return Promise.resolve();
    var S = src._iso = compileIso(src, id); S.__modes = compileModes(src); S.__rec = H.rec; S.__host = H; H.iso = S;
    S.__clock = src._clock.enabled ? { js: timeEngine.toString(), cfg: Object.assign({}, src._clock, { role: 'follower' }) } : null;
    S.__opfs = nsPrefix(src.ns != null ? String(src.ns) : null, id) + 'opfs';
    if (src.runtime === 'worker') return Promise.resolve();
    S.__childJs = preludeJs(src);
    S.__workerSrc = function (abs, mod) { return workerCode(src, abs, mod); };
    // one blob per script url; SharedWorkers of one namespace share it (so they are one worker, like tabs)
    S.__workerUrl = function (abs, mod, shared) { var box = (shared && src.ns != null) ? sharedOf(String(src.ns)) : src, c = box.__wurls || (box.__wurls = {}), key = abs + '|' + (mod ? 'm' : 'c'); return c[key] || (c[key] = URL.createObjectURL(new Blob([workerCode(src, abs, mod)], { type: 'text/javascript' }))); };
    return seedIdb(src);
  }

  // ---- one cleanup: delete stored data whose name matches sel(kind, name) in indexedDB, caches, localStorage, OPFS ----
  function drop(sel, dry) {
    var found = { indexedDB: [], caches: [], localStorage: [], opfs: [] }, jobs = [], i;
    function scan(kind, list) { (list || []).forEach(function (n) { if (n && sel(kind, n)) found[kind].push(n); }); }
    try { if (G.indexedDB && G.indexedDB.databases) jobs.push(G.indexedDB.databases().then(function (l) { scan('indexedDB', l.map(function (d) { return d.name; })); })); } catch (e) {}
    try { if (G.caches) jobs.push(G.caches.keys().then(function (l) { scan('caches', l); })); } catch (e) {}
    try { var LS = G.localStorage, ks = []; for (i = 0; i < LS.length; i++) ks.push(LS.key(i)); scan('localStorage', ks); } catch (e) {}
    var root = null; try { if (G.navigator && G.navigator.storage && G.navigator.storage.getDirectory) jobs.push(G.navigator.storage.getDirectory().then(function (r) { root = r; var names = [], it = r.keys(); return (function nx() { return it.next().then(function (x) { if (x.done) return scan('opfs', names); names.push(x.value); return nx(); }); })(); })); } catch (e) {}
    return Promise.all(jobs.map(function (j) { return j.catch(function () {}); })).then(function () {
      if (!dry) {
        found.indexedDB.forEach(function (n) { try { G.indexedDB.deleteDatabase(n); } catch (e) {} });
        found.caches.forEach(function (n) { try { G.caches['delete'](n); } catch (e) {} });
        found.localStorage.forEach(function (k) { try { G.localStorage.removeItem(k); } catch (e) {} });
        found.opfs.forEach(function (n) { try { root.removeEntry(n, { recursive: true })['catch'](function () {}); } catch (e) {} });
      }
      return { dryRun: !!dry, found: found };
    });
  }
  function starts(p) { return function (k, n) { return String(n).indexOf(p) === 0; }; }
  // after destroy: this sim's own (not kept, not shared) data only
  function isoCleanup(src, id, win) {
    var H = src._host, S = src._iso || {}; try { if (G.__simHost && G.__simHost[id] === H) delete G.__simHost[id]; } catch (e) {}
    var g = S.localStorage && S.localStorage.group; if (g && g.wins) g.wins = g.wins.filter(function (w) { try { return w && w !== win && !w.closed && !!w.document; } catch (e) { return false; } });
    if (src.__wurls) { for (var k in src.__wurls) try { URL.revokeObjectURL(src.__wurls[k]); } catch (e) {} src.__wurls = null; }
    if (src.isolate === false) return Promise.resolve();
    var fi = S.indexedDB, fc = S.caches, R = S.__rec || { dbs: [], caches: [] }, gone = function (f) { return f && !f.off && !f.keep && f.prefix; };
    if (gone(fi) && fi.impl) R.dbs.concat(src._seededDbs || []).forEach(function (n) { if (String(n).indexOf(fi.prefix) === 0) try { fi.impl.deleteDatabase(n); } catch (e) {} });
    if (gone(fc) && fc.impl) R.caches.forEach(function (n) { if (String(n).indexOf(fc.prefix) === 0) try { fc.impl['delete'](n); } catch (e) {} });
    var K = src.keep, keepOpfs = K === true || (isObj(K) && K.opfs) || src.ns != null;
    return drop(function (kind, n) {
      if (kind === 'indexedDB') return !!(gone(fi) && !fi.impl && n.indexOf(fi.prefix) === 0);
      if (kind === 'caches') return !!(gone(fc) && !fc.impl && n.indexOf(fc.prefix) === 0);
      if (kind === 'opfs') return !keepOpfs && n === S.__opfs;
      return Object.keys(KV).some(function (f) { var x = S[f]; return gone(x) && x.ns == null && n.indexOf(x.prefix + KV[f]) === 0; });
    });
  }
  function dropNs(ns) { var list = ns == null ? Object.keys(SHARED) : [String(ns)]; return Promise.all(list.map(function (n) { var w = SHARED[n] && SHARED[n].__wurls; if (w) for (var k in w) try { URL.revokeObjectURL(w[k]); } catch (e) {} delete SHARED[n]; return drop(starts(nsPrefix(n))); })).then(function () { return list; }); }
  function namespaces() { return Object.keys(SHARED).map(function (n) { var pf = nsPrefix(n), keys = 0; try { var LS = G.localStorage; for (var i = 0; i < LS.length; i++) if (String(LS.key(i)).indexOf(pf) === 0) keys++; } catch (e) {} return { ns: n, prefix: pf, sims: (SHARED[n].wins || []).length, persistedKeys: keys }; }); }
  // leftovers of sims that are gone (crash, reload): private by default, shared with shared:true; live ones never
  function sweep(o) {
    o = o || {}; var P = DEFAULTS.prefix || {}, pp = P['private'] || '__sim_', ps = P.shared || '__simns_', ex = o.except;
    var live = ids().concat(Object.keys(reserving)).map(function (id) { return nsPrefix(null, id); }).concat(Object.keys(SHARED).map(function (n) { return nsPrefix(n); }));
    return drop(function (kind, n) {
      if (live.some(function (l) { return n.indexOf(l) === 0; })) return false;
      if (ex && (typeof ex === 'function' ? ex(n) : [].concat(ex).some(function (x) { return x instanceof RegExp ? x.test(n) : n.indexOf(String(x)) === 0; }))) return false;
      return n.indexOf(ps) === 0 ? !!o.shared : n.indexOf(pp) === 0 ? o['private'] !== false : false;
    }, o.dryRun);
  }

  // ---- storage separation: install (runs inside the sim realm; stringified) ----
  // S = the plan (host object when reachable, else plainIso copy), L = isoLib()
  function isoInstall(W, S, L) {
    var H = Object.prototype.hasOwnProperty; S = S || {}; W.__sim = W.__sim || {};
    var iso = W.__sim.iso = {}, M = S.__modes || {}, HOST = S.__host || null, REC = S.__rec || (W.__sim.rec = W.__sim.rec || { dbs: [], caches: [] }), naming = L.naming, tester = L.tester, mapper = L.mapper, revMap = L.revMap;
    try { if (W.document) W.document.__simIso = 1; } catch (e) {}
    function emit(t, d) { try { if (HOST && HOST.emit) HOST.emit(t, d); } catch (e) {} }
    function def(o, k, v) { try { Object.defineProperty(o, k, { configurable: true, get: function () { return v; } }); return o[k] === v; } catch (e) { return false; } }
    function rmApi(o, k) { if (!o) return false; try { delete o[k]; } catch (e) {} for (var p = Object.getPrototypeOf(o), g = 0; (k in o) && p && p !== W.Object.prototype && g < 12; p = Object.getPrototypeOf(p), g++) { try { if (H.call(p, k)) delete p[k]; } catch (e) {} } if (k in o) { try { Object.defineProperty(o, k, { configurable: true, get: function () {}, set: function () {} }); } catch (e) { return false; } } return o[k] === undefined; }
    var RH = null; try { RH = W.history; } catch (e) {}
    // hash change without a real history entry (the real one belongs to the host page)
    W.__sim.setHash = function (url) { try { var old = String(W.location.href), u = String(url); if (!RH || u === old || W.__sim.__inHash) return; W.__sim.__inHash = 1; try { RH.replaceState.call(RH, RH.state, '', u); } finally { W.__sim.__inHash = 0; } var ev; try { ev = new W.HashChangeEvent('hashchange', { oldURL: old, newURL: String(W.location.href) }); } catch (x) { ev = new W.Event('hashchange'); } W.dispatchEvent(ev); var id = decodeURIComponent(String(W.location.hash).slice(1)), el = id && W.document && W.document.getElementById(id); if (el && el.scrollIntoView) el.scrollIntoView(); } catch (x) {} };
    var AT = { localStorage: [W, 'localStorage'], sessionStorage: [W, 'sessionStorage'], cookies: [W.document || null, 'cookie'], indexedDB: [W, 'indexedDB'], broadcast: [W, 'BroadcastChannel'], caches: [W, 'caches'], locks: [W.navigator, 'locks'], history: [W, 'history'] };
    function on(k) { var f = S[k]; return !!(f && !f.off && !f.absent); }
    Object.keys(AT).forEach(function (k) { if (S[k] && S[k].absent) iso[k] = rmApi(AT[k][0], AT[k][1]) ? 'absent' : false; });

    // -- key-value engine: one per feature; faces: Storage, document.cookie, cookieStore --
    function backend(b) {
      if (!b) b = new Map();
      if (typeof b.getItem === 'function') return { get: function (k) { return b.getItem(k); }, set: function (k, v) { b.setItem(k, v); }, del: function (k) { b.removeItem(k); }, has: function (k) { return b.getItem(k) !== null; }, keys: function () { var o = []; for (var i = 0; i < b.length; i++) o.push(b.key(i)); return o; } };
      if (typeof b.get === 'function' && typeof b.set === 'function') return { get: function (k) { return b.has(k) ? String(b.get(k)) : null; }, set: function (k, v) { b.set(k, String(v)); }, del: function (k) { (b['delete'] || b.del).call(b, k); }, has: function (k) { return !!b.has(k); }, keys: function () { return Array.from(b.keys()); } };
      return { get: function (k) { return H.call(b, k) ? String(b[k]) : null; }, set: function (k, v) { b[k] = String(v); }, del: function (k) { delete b[k]; }, has: function (k) { return H.call(b, k); }, keys: function () { return Object.keys(b); } };
    }
    function kv(f, realBe) {
      var be = backend(f.store), pass = tester(f.pass), map = mapper(f.map), rv = revMap(f.map), grp = f.group || null, Q = f.quota > 0 ? +f.quota : 0, kc = null;
      // size counter lives on the store object, so sims that share a store share one quota (never on a Storage object: that would create an item)
      var box = (f.store && typeof f.store === 'object' && typeof f.store.getItem !== 'function') ? f.store : {};
      function inval() { kc = null; }
      function used() { var u = box.__simUsed; if (typeof u !== 'number') { u = 0; be.keys().forEach(function (k) { var v = be.get(k); u += String(k).length + (v == null ? 0 : String(v).length); }); try { Object.defineProperty(box, '__simUsed', { configurable: true, writable: true, value: u }); } catch (e) {} } return u; }
      function grow(d) { if (Q) try { box.__simUsed = used() + d; } catch (e) {} }
      if (f.seed) for (var sk in f.seed) if (H.call(f.seed, sk) && !be.has(sk)) be.set(sk, String(f.seed[sk]));
      function route(k) { k = String(k); if (realBe) { if (pass(k)) return [realBe, k, false]; var m = map(k); if (m != null) return [realBe, m, false]; } return [be, k, true]; }
      // 'storage' events to the other windows sharing this store (sims of one ns, child frames)
      function prune() { grp.wins = grp.wins.filter(function (w2) { try { return !!w2 && !w2.closed && !!w2.document; } catch (x) { return false; } }); }
      function note(k, o, n) { if (!grp || !grp.wins) return; prune(); grp.wins.forEach(function (w2) { if (w2 === W) return; try { var ev = new w2.StorageEvent('storage', { key: k, oldValue: o, newValue: n, url: String(W.location.href) }); ev.__simOwn = 1; w2.dispatchEvent(ev); } catch (x) {} }); }
      if (grp && grp.wins) { prune(); if (grp.wins.indexOf(W) < 0) grp.wins.push(W); }
      return {
        get: function (k) { var r = route(k); return r[0].get(r[1]); },
        set: function (k, v) { var r = route(k), o = r[0].get(r[1]); v = String(v); if (r[2] && Q) { var d = String(k).length + v.length - (o == null ? 0 : String(k).length + String(o).length); if (d > 0 && used() + d > Q) throw new W.DOMException("Failed to execute 'setItem' on 'Storage': Setting the value of '" + k + "' exceeded the quota.", 'QuotaExceededError'); grow(d); } r[0].set(r[1], v); if (o == null) inval(); if (r[2] && o !== v) note(String(k), o, v); },
        del: function (k) { var r = route(k); if (!r[0].has(r[1])) return; var o = r[0].get(r[1]); r[0].del(r[1]); inval(); if (r[2]) { grow(-(String(k).length + String(o).length)); note(String(k), o, null); } },
        // key list cached until the end of the current task (a loop over key(i) is O(n), not O(n^2))
        keys: function () { if (kc) return kc; var out = be.keys().slice(), seen = {}; out.forEach(function (x) { seen['$' + x] = 1; }); if (realBe) realBe.keys().forEach(function (rk) { var sk = H.call(rv, rk) ? rv[rk] : (pass(rk) ? rk : null); if (sk != null && !seen['$' + sk]) { seen['$' + sk] = 1; out.push(sk); } }); kc = out; try { if (W.queueMicrotask) W.queueMicrotask(inval); else W.Promise.resolve().then(inval); } catch (e) { kc = null; } return out; },
        clear: function () { var ks = be.keys(); inval(); if (!ks.length) return; ks.forEach(function (k) { be.del(k); }); if (Q) try { box.__simUsed = 0; } catch (e) {} note(null, null, null); }
      };
    }
    function storage(a) {
      var api = { getItem: function (k) { return a.get(k); }, setItem: function (k, v) { a.set(k, v); }, removeItem: function (k) { a.del(k); }, clear: function () { a.clear(); }, key: function (i) { var ks = a.keys(); return (i >= 0 && i < ks.length) ? ks[i] : null; } };
      if (typeof Proxy === 'undefined') { Object.defineProperty(api, 'length', { get: function () { return a.keys().length; } }); return api; }
      return new Proxy(api, { get: function (t, k) { if (k === 'length') return a.keys().length; if (typeof k === 'symbol' || H.call(api, k)) return api[k]; var v = a.get(k); return v === null ? undefined : v; }, set: function (t, k, v) { a.set(k, v); return true; }, deleteProperty: function (t, k) { a.del(k); return true; }, has: function (t, k) { return a.get(k) !== null || H.call(api, k); }, ownKeys: function () { return a.keys(); }, getOwnPropertyDescriptor: function (t, k) { var v = a.get(k); return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true }; } });
    }
    ['localStorage', 'sessionStorage'].forEach(function (nm) { if (!on(nm) || !(nm in W)) return; var real = null; try { real = W[nm]; } catch (e) {} iso[nm] = def(W, nm, storage(kv(S[nm], real ? backend(real) : null))); });
    // real 'storage' events (from the host page or other tabs) do not reach the sim unless realEvents
    if (W.addEventListener && ['localStorage', 'sessionStorage'].some(function (k) { return S[k] && !S[k].off && !S[k].realEvents; })) W.addEventListener('storage', function (e) { if (!e.__simOwn) try { e.stopImmediatePropagation(); } catch (x) {} }, true);
    (function () { if (!on('cookies') || !W.document) return; var d = W.Document && Object.getOwnPropertyDescriptor(W.Document.prototype, 'cookie'), rb = null;
      if (d && d.get) { var rd = function () { var o = {}; String(d.get.call(W.document) || '').split(';').forEach(function (p) { var i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }); return o; }; rb = { get: function (k) { var o = rd(); return H.call(o, k) ? o[k] : null; }, set: function (k, v) { d.set.call(W.document, k + '=' + v + '; path=/'); }, del: function (k) { d.set.call(W.document, k + '=; max-age=0; path=/'); }, has: function (k) { return H.call(rd(), k); }, keys: function () { return Object.keys(rd()); } }; }
      var ck = kv(S.cookies, rb);
      try { Object.defineProperty(W.document, 'cookie', { configurable: true, get: function () { return ck.keys().map(function (k) { var v = ck.get(k); return k ? k + '=' + v : v; }).join('; '); }, set: function (s) { var pa = String(s).split(';'), i = pa[0].indexOf('='), k = (i < 0 ? '' : pa[0].slice(0, i)).trim(), v = (i < 0 ? pa[0] : pa[0].slice(i + 1)).trim(); if (pa.slice(1).some(function (a) { a = a.trim().toLowerCase(); return /^max-age=(0|-)/.test(a) || (a.indexOf('expires=') === 0 && new Date(a.slice(8)) < new Date()); })) ck.del(k); else ck.set(k, v); } }); iso.cookies = true; } catch (e) { iso.cookies = false; } })();

    // -- named stores: every name goes through naming(); list results are mapped back --
    function unmap(N, v) { if (typeof v === 'string') return N.from(v); if (Array.isArray(v)) return v.map(function (x) { return unmap(N, x); }).filter(function (x) { return x != null; }); if (v && typeof v === 'object') { if ('held' in v || 'pending' in v) return { held: unmap(N, v.held || []), pending: unmap(N, v.pending || []) }; if ('name' in v) { var s = N.from(v.name); return s == null ? null : Object.assign({}, v, { name: s }); } } return v; }
    var NAMED = { indexedDB: { at: AT.indexedDB, name: ['open', 'deleteDatabase'], list: ['databases'], keep: ['cmp'], rec: 'dbs' },
      caches: { at: AT.caches, name: ['open', 'has', 'delete'], list: ['keys'], rec: 'caches' },
      locks: { at: AT.locks, name: ['request'], list: ['query'] } };
    Object.keys(NAMED).forEach(function (k) {
      var t = NAMED[k], f = S[k], real = (f && f.impl) || (t.at[0] && t.at[0][t.at[1]]); if (!on(k) || !real) return; var N = naming(f), o = {};
      t.name.forEach(function (m) { o[m] = function (n) { var a = [].slice.call(arguments), r = N.to(n); if (t.rec && m === 'open' && r.own && REC[t.rec].indexOf(r.name) < 0) REC[t.rec].push(r.name); a[0] = r.name; return real[m].apply(real, a); }; });
      (t.list || []).forEach(function (m) { o[m] = function () { return typeof real[m] !== 'function' ? W.Promise.resolve([]) : W.Promise.resolve(real[m].apply(real, arguments)).then(function (v) { return unmap(N, v); }); }; });
      (t.keep || []).forEach(function (m) { o[m] = function () { return real[m].apply(real, arguments); }; });
      if (k === 'caches') o.match = function (rq, op) { op = op || {}; if (op.cacheName) return real.match(rq, Object.assign({}, op, { cacheName: N.to(op.cacheName).name })); return o.keys().then(function (ks) { var i = 0; return (function nx() { if (i >= ks.length) return undefined; return real.open(N.to(ks[i++]).name).then(function (c) { return c.match(rq, op); }).then(function (x) { return x || nx(); }); })(); }); };
      iso[k] = def(t.at[0], t.at[1], o);
    });
    (function () { var RB = (S.broadcast && S.broadcast.impl) || W.BroadcastChannel; if (!on('broadcast') || !RB) return; var N = naming(S.broadcast), B = function (n) { return new RB(N.to(n).name); }; B.prototype = RB.prototype; try { W.BroadcastChannel = B; iso.broadcast = W.BroadcastChannel === B; } catch (e) { iso.broadcast = false; } })();

    // -- virtual history: entries live in the sim; pushState / hash links never touch the host page's history --
    (function () { if (!on('history') || !('history' in W)) return;
      var cl = function (x) { if (x == null) return null; try { return W.structuredClone ? W.structuredClone(x) : JSON.parse(JSON.stringify(x)); } catch (e) { return x; } };
      var hs = [{ state: null, url: String(W.location.href) }], hi = 0;
      function put(s, u, replace) { var e = { state: cl(s), url: u == null ? hs[hi].url : String(u) }; if (replace) hs[hi] = e; else { hs = hs.slice(0, hi + 1); hs.push(e); hi++; } }
      var vh = { scrollRestoration: 'auto', pushState: function (s, t, u) { put(s, u); }, replaceState: function (s, t, u) { put(s, u, true); },
        go: function (d) { d = d | 0; var n = hi + d; if (!d || n < 0 || n >= hs.length) return; var from = hs[hi].url; hi = n; var to = hs[hi].url;
          try { var cur = String(W.location.href); if (to && to !== from && to !== cur && to.split('#')[0] === cur.split('#')[0] && (to.indexOf('#') >= 0 || cur.indexOf('#') >= 0)) W.__sim.setHash(to.indexOf('#') >= 0 ? to : to + '#'); } catch (x) {}
          var st = hs[hi].state, e; try { e = new W.PopStateEvent('popstate', { state: st }); } catch (x) { e = new W.Event('popstate'); } W.setTimeout(function () { W.dispatchEvent(e); }, 0); },
        back: function () { vh.go(-1); }, forward: function () { vh.go(1); } };
      Object.defineProperty(vh, 'length', { get: function () { return hs.length; } }); Object.defineProperty(vh, 'state', { get: function () { return hs[hi].state; } });
      iso.history = def(W, 'history', vh); W.__sim.historyLog = function () { return { index: hi, entries: hs.slice() }; }; W.__sim.vhPush = function (u) { put(null, u); }; })();
    (function () { // workers: page-made Worker / SharedWorker get the same storage isolation (blob wrapper around the real script)
      if (M.workers !== 'isolate' || !W.Blob || !W.URL || (typeof S.__workerSrc !== 'function' && typeof S.__workerUrl !== 'function')) return; var cache = {};
      function baseOf() { try { return (W.document && W.document.baseURI) || String(W.location.href); } catch (e) { return ''; } }
      function wrap(RW, shared) { if (!RW) return RW; var F = function (u, o) { var abs = new W.URL(String(u), baseOf()).href, mod = !!(o && typeof o === 'object' && o.type === 'module'), key = abs + '|' + (mod ? 'm' : 'c') + (shared ? 's' : ''), bu = cache[key]; if (!bu) bu = cache[key] = (typeof S.__workerUrl === 'function') ? S.__workerUrl(abs, mod, !!shared) : W.URL.createObjectURL(new W.Blob([S.__workerSrc(abs, mod)], { type: 'text/javascript' })); if (shared) { var o2 = typeof o === 'string' ? { name: o } : Object.assign({}, o || {}); o2.name = ((S.broadcast && S.broadcast.prefix) || '') + (o2.name || ''); return new RW(bu, o2); } return new RW(bu, o); }; F.prototype = RW.prototype; return F; }
      try { if (W.Worker) W.Worker = wrap(W.Worker, false); if (W.SharedWorker) W.SharedWorker = wrap(W.SharedWorker, true); iso.workers = 'isolate'; } catch (e) { iso.workers = false; } })();
    (function () { if (M.serviceWorker !== 'block' || !W.navigator || !('serviceWorker' in W.navigator)) return; var P = W.Promise; var stub = { controller: null, ready: new P(function () {}), register: function (u) { emit('serviceWorkerBlocked', { url: String(u) }); return P.reject(new W.DOMException('service workers are blocked inside this sim', 'SecurityError')); }, getRegistration: function () { return P.resolve(undefined); }, getRegistrations: function () { return P.resolve([]); }, startMessages: function () {}, addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; }, oncontrollerchange: null, onmessage: null, onmessageerror: null }; iso.serviceWorker = def(W.navigator, 'serviceWorker', stub) ? 'block' : false; })();
    (function () { // other storage APIs: cookieStore (over the sim's cookies), Storage Buckets, OPFS
      var P = W.Promise, NV = W.navigator;
      if (W.cookieStore && M.cookieStore && M.cookieStore !== 'allow') {
        if (M.cookieStore === 'block' || !S.cookies || S.cookies.off || !W.document) iso.cookieStore = (M.cookieStore === 'block' && rmApi(W, 'cookieStore')) ? 'block' : (M.cookieStore === 'block' ? false : 'real');
        else { var et = new W.EventTarget(), cs;
          var parse = function () { var o = []; String(W.document.cookie || '').split(/;\s*/).forEach(function (p) { if (!p) return; var i = p.indexOf('='); o.push({ name: i < 0 ? '' : p.slice(0, i), value: i < 0 ? p : p.slice(i + 1) }); }); return o; };
          var nm = function (a) { return (a == null || typeof a === 'string') ? a : a.name; };
          var fire = function (ch, del) { try { var ev = new W.Event('change'); ev.changed = ch; ev.deleted = del; et.dispatchEvent(ev); if (typeof cs.onchange === 'function') cs.onchange(ev); } catch (e) {} };
          cs = { onchange: null,
            get: function (a) { var n = nm(a), r = parse().filter(function (c) { return n == null || c.name === n; })[0]; return P.resolve(r || null); },
            getAll: function (a) { var n = nm(a); return P.resolve(parse().filter(function (c) { return n == null || c.name === n; })); },
            set: function (a, b) { var o = typeof a === 'string' ? { name: a, value: b } : (a || {}); var gone = o.expires != null && +new Date(o.expires) < Date.now(); W.document.cookie = o.name + '=' + (o.value == null ? '' : o.value) + (gone ? '; max-age=0' : ''); fire(gone ? [] : [{ name: o.name, value: String(o.value) }], gone ? [{ name: o.name }] : []); return P.resolve(); },
            'delete': function (a) { var n = nm(a); W.document.cookie = n + '=; max-age=0'; fire([], [{ name: n }]); return P.resolve(); },
            addEventListener: function () { return et.addEventListener.apply(et, arguments); }, removeEventListener: function () { return et.removeEventListener.apply(et, arguments); }, dispatchEvent: function (e) { return et.dispatchEvent(e); } };
          iso.cookieStore = def(W, 'cookieStore', cs) ? 'isolate' : false; } }
      if (NV && NV.storageBuckets && M.storageBuckets === 'block') { var sb = { open: function (n) { emit('storageBucketsBlocked', { name: String(n) }); return P.reject(new W.DOMException('Storage Buckets are blocked inside this sim', 'SecurityError')); }, keys: function () { return P.resolve([]); }, 'delete': function () { return P.resolve(); } }; iso.storageBuckets = def(NV, 'storageBuckets', sb) ? 'block' : false; }
      var SM = NV && NV.storage; if (SM && typeof SM.getDirectory === 'function' && M.opfs && M.opfs !== 'allow') {
        if (M.opfs === 'block') { try { Object.defineProperty(SM, 'getDirectory', { configurable: true, writable: true, value: function () { return P.reject(new W.DOMException('OPFS is blocked inside this sim', 'SecurityError')); } }); iso.opfs = 'block'; } catch (e) { iso.opfs = false; } }
        else if (S.__opfs) { var gd = SM.getDirectory.bind(SM), dirName = String(S.__opfs); try { Object.defineProperty(SM, 'getDirectory', { configurable: true, writable: true, value: function () { return gd().then(function (root) { return root.getDirectoryHandle(dirName, { create: true }); }); } }); iso.opfs = 'isolate'; } catch (e) { iso.opfs = false; } } }
    })();
    (function () {
      if (!W.document || !W.HTMLIFrameElement) { if (M.navigation) iso.navigation = 'n/a'; return; }
      var mc = M.childFrames, mn = M.navigation, cj = S.__childJs, D = W.document, FR = { IFRAME: 'src', FRAME: 'src', OBJECT: 'data', EMBED: 'src' };
      function tagOf(n) { return (n && n.nodeType === 1 && n.tagName) ? String(n.tagName).toUpperCase() : ''; }
      function injectChild(html, base) { return L.spliceHead(L.pageFix(html, M), '<script>window.__simChild=1;' + cj + '<\/script>' + (base ? '<base href="' + String(base).replace(/"/g, '&quot;') + '">' : '')); }
      function myOrigin() { try { if (W.origin && W.origin !== 'null') return W.origin; } catch (e) {} try { if (W.location.origin && W.location.origin !== 'null') return W.location.origin; } catch (e) {} try { return new W.URL(D.baseURI).origin; } catch (e) { return ''; } }
      // blob: and about: documents inherit this origin; data: documents are opaque (they cannot reach this origin's storage)
      function sameOrigin(u) { try { var x = new W.URL(u, D.baseURI); if (/^(about|javascript|blob):/i.test(x.protocol)) return true; if (/^data:/i.test(x.protocol)) return false; return x.origin === myOrigin(); } catch (e) { return false; } }
      function marked(cw) { try { return !!(cw.document && cw.document.__simIso); } catch (e) { return true; } }
      function installInto(cw) { try { if (!cw || !cj || marked(cw) || !sameOrigin(String(cw.location.href))) return; cw.__simChild = 1; cw.eval(cj); } catch (e) {} }
      function setAttr(fr, k, v) { if (k !== 'sandbox') { try { var ow = winOf(fr); if (ow && ow.__sim) ow.__sim.__navOK = 1; } catch (e) {} } (fr.__simSet || (fr.__simSet = {}))[k] = String(v); fr.setAttribute(k, v); }
      function mine(fr, k) { return !!(fr.__simSet && H.call(fr.__simSet, k) && fr.getAttribute(k) === fr.__simSet[k]); }
      function blobFor(html, base) { var u = W.URL.createObjectURL(new W.Blob([injectChild(html, base)], { type: 'text/html' })); (W.__sim.blobs || (W.__sim.blobs = [])).push(u); return u; }
      function winOf(fr) { try { if (fr.contentWindow) return fr.contentWindow; } catch (e) {} try { var d = fr.getSVGDocument && fr.getSVGDocument(); return (d && d.defaultView) || null; } catch (e) { return null; } }
      function load(fr, tg, at, abs, orig) { // swap a same-origin url for the same page with the sim prelude injected
        if (tg === 'IFRAME') { setAttr(fr, 'srcdoc', ''); }
        else setAttr(fr, at, 'about:blank');
        W.fetch(abs).then(function (r) { var ct = (r.headers && r.headers.get('content-type')) || ''; if (tg !== 'IFRAME' && ct && !/html|xml/i.test(ct)) { fr.__simPlain = orig; setAttr(fr, at, orig); return; } return r.text().then(function (t) { if (tg === 'IFRAME') setAttr(fr, 'srcdoc', injectChild(t, abs)); else setAttr(fr, at, blobFor(t, abs)); }); }).catch(function (e) { emit('childFrameError', { src: abs, error: String(e) }); });
      }
      function handle(fr, again) { var tg = tagOf(fr), at = FR[tg]; if (!at || mc === 'allow' || (fr.__simSeen && !again)) return; fr.__simSeen = 1;
        installInto(winOf(fr)); // an existing window (initial about:blank) is isolated synchronously, before page code can reach it (window[0], frames[0], contentWindow)
        var sd = tg === 'IFRAME' ? fr.getAttribute('srcdoc') : null, sr = fr.getAttribute(at);
        if (mc === 'block') { if (fr.__simBlocked) return; fr.__simBlocked = 1; emit('childFrameBlocked', { tag: tg, src: sr || (sd != null ? '(srcdoc)' : '(blank)') }); if (tg === 'IFRAME') { setAttr(fr, 'sandbox', ''); setAttr(fr, 'srcdoc', sd != null ? sd : '<!doctype html><title>blocked</title>'); } else if (sr) setAttr(fr, at, 'about:blank'); return; }
        if (!cj) return;
        if (sd != null) { if (!mine(fr, 'srcdoc')) setAttr(fr, 'srcdoc', injectChild(sd, D.baseURI)); return; }
        if (!sr || /^\s*(about:|javascript:)/i.test(sr) || mine(fr, at) || fr.__simPlain === sr) return;
        if (!sameOrigin(sr)) return;
        load(fr, tg, at, new W.URL(sr, D.baseURI).href, sr); }
      function check(fr) { var tg = tagOf(fr); if (!FR[tg] || mc === 'allow') return; var cw = winOf(fr), href = ''; if (!cw) return; try { href = String(cw.location.href); } catch (e) { return; } if (marked(cw) || !sameOrigin(href)) return; if (href === 'about:blank') { installInto(cw); return; } if (fr.__simPlain) return;
        emit('isolationLost', { reason: 'child frame without sim prelude', src: href }); if (tg === 'IFRAME') { setAttr(fr, 'sandbox', ''); setAttr(fr, 'srcdoc', '<!doctype html><title>blocked</title>'); } else setAttr(fr, FR[tg], 'about:blank'); }
      function framesIn(n) { var o = []; try { if (!n || (n.nodeType !== 1 && n.nodeType !== 11 && n.nodeType !== 9)) return o; if (FR[tagOf(n)]) o.push(n); if (n.querySelectorAll) [].push.apply(o, [].slice.call(n.querySelectorAll('iframe,frame,object,embed'))); } catch (e) {} return o; }
      if (mc !== 'allow' && cj) {
        // 1) synchronous hooks: frames inserted by script are handled before the call returns
        var nodeArgs = function (args) { var o = []; for (var i = 0; i < args.length; i++) if (args[i] && typeof args[i] === 'object' && args[i].nodeType) [].push.apply(o, framesIn(args[i])); return o; };
        var hookM = function (proto, name, post) { var d = proto && Object.getOwnPropertyDescriptor(proto, name); if (!d || typeof d.value !== 'function') return; var f = d.value; try { Object.defineProperty(proto, name, { configurable: true, writable: true, enumerable: d.enumerable, value: function () { var pre = nodeArgs(arguments), r = f.apply(this, arguments); try { pre.forEach(function (x) { handle(x, true); }); if (post) post(this, arguments); } catch (e) {} return r; } }); } catch (e) {} };
        var hookS = function (proto, name, scopeOf) { var d = proto && Object.getOwnPropertyDescriptor(proto, name); if (!d || !d.set) return; try { Object.defineProperty(proto, name, { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { var sc = scopeOf(this); d.set.call(this, v); try { framesIn(sc).forEach(function (x) { handle(x, true); }); } catch (e) {} } }); } catch (e) {} };
        var parentScope = function (el) { return el.parentNode || el; };
        [['appendChild'], ['insertBefore'], ['replaceChild']].forEach(function (a) { hookM(W.Node && W.Node.prototype, a[0]); });
        ['append', 'prepend', 'before', 'after', 'replaceWith', 'replaceChildren', 'insertAdjacentElement'].forEach(function (n) { hookM(W.Element && W.Element.prototype, n); hookM(W.DocumentFragment && W.DocumentFragment.prototype, n); hookM(W.Document && W.Document.prototype, n); hookM(W.CharacterData && W.CharacterData.prototype, n); });
        hookM(W.Element && W.Element.prototype, 'insertAdjacentHTML', function (el) { framesIn(parentScope(el)).forEach(function (x) { handle(x, true); }); });
        hookM(W.Element && W.Element.prototype, 'setHTMLUnsafe', function (el) { framesIn(el).forEach(function (x) { handle(x, true); }); });
        hookM(W.Range && W.Range.prototype, 'insertNode');
        hookM(W.Document && W.Document.prototype, 'write', function (d) { framesIn(d).forEach(function (x) { handle(x, true); }); });
        hookM(W.Document && W.Document.prototype, 'writeln', function (d) { framesIn(d).forEach(function (x) { handle(x, true); }); });
        hookS(W.Element && W.Element.prototype, 'innerHTML', function (el) { return el; });
        hookS(W.Element && W.Element.prototype, 'outerHTML', parentScope);
        hookS(W.ShadowRoot && W.ShadowRoot.prototype, 'innerHTML', function (r) { return r; });
        // 2) getters: any window handed to page code is isolated first
        [W.HTMLIFrameElement, W.HTMLFrameElement, W.HTMLObjectElement].forEach(function (C) { if (!C) return; var d1 = Object.getOwnPropertyDescriptor(C.prototype, 'contentWindow'), d2 = Object.getOwnPropertyDescriptor(C.prototype, 'contentDocument'); if (d1 && d1.get) { try { Object.defineProperty(C.prototype, 'contentWindow', { configurable: true, enumerable: d1.enumerable, get: function () { var w = d1.get.call(this); if (w) installInto(w); return w; } }); } catch (e) {} } if (d1 && d1.get && d2 && d2.get) { try { Object.defineProperty(C.prototype, 'contentDocument', { configurable: true, enumerable: d2.enumerable, get: function () { var w = d1.get.call(this); if (w) installInto(w); return d2.get.call(this); } }); } catch (e) {} } });
        // 3) parser-inserted frames and attribute changes (MutationObserver runs before the next parser-inserted script)
        if (W.MutationObserver) { var mo = new W.MutationObserver(function (recs) { recs.forEach(function (r) { if (r.type === 'attributes') { var t = r.target, an = r.attributeName; if (FR[tagOf(t)] && !mine(t, an)) handle(t, true); return; } [].forEach.call(r.addedNodes || [], function (n) { framesIn(n).forEach(function (x) { handle(x); }); }); }); }); mo.observe(D, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcdoc', 'data'] }); }
        // 4) last line of defence: a loaded frame without the prelude is replaced and reported
        W.addEventListener('load', function (e) { check(e.target); }, true);
        try { framesIn(D).forEach(function (x) { handle(x); }); } catch (e) {}
      }
      W.__sim.navChild = function (fe, url, init) { if (url == null) { if (tagOf(fe) === 'IFRAME' && fe.getAttribute('srcdoc') != null) setAttr(fe, 'srcdoc', fe.getAttribute('srcdoc')); return; } var m = init && init.method && String(init.method).toUpperCase() !== 'GET'; (m ? W.fetch(url, { method: init.method, body: init.body }) : W.fetch(url)).then(function (r) { return r.text(); }).then(function (t) { try { var cw = winOf(fe); if (cw && cw.__sim) cw.__sim.__navOK = 1; } catch (e) {} var tg = tagOf(fe); if (tg === 'IFRAME') setAttr(fe, 'srcdoc', injectChild(t, url)); else if (FR[tg]) setAttr(fe, FR[tg], blobFor(t, url)); }, function (e) { emit('navigateError', { url: url, error: String(e) }); }); };
      iso.childFrames = mc || 'allow';
      if (!mn || mn === 'allow') { iso.navigation = 'allow'; W.__sim.go = null; return; }
      var child = !!W.__simChild, virt = mn === 'virtual' && (child ? !!(W.frameElement && W.parent && W.parent.__sim && W.parent.__sim.navChild) : !!(HOST && HOST.nav));
      function go(url, init) { if (!virt) { emit('navigationBlocked', { url: url }); return; } W.__sim.__navOK = 1; if (child) { W.parent.__sim.navChild(W.frameElement, url, init); return; } HOST.nav(url, init); }
      W.__sim.go = go;
      var hist = !!(S.history && !S.history.off && !S.history.absent);
      function hashNav(url) { try { if (hist && W.__sim.vhPush) W.__sim.vhPush(url); W.__sim.setHash(url); } catch (x) {} return true; }
      // in a srcdoc page, '#x' resolves against the base url (another document); a real page at that url would just scroll, so do that
      function inPageHash(u) { var cur = String(W.location.href); if (!/^about:srcdoc/i.test(cur)) return null; u = String(u); var i = u.indexOf('#'); if (i < 0) return null; var b = String(D.baseURI).split('#')[0]; return (u.slice(0, i) === b || u.slice(0, i) === cur.split('#')[0]) ? 'about:srcdoc' + u.slice(i) : null; }
      var api = M.navApi !== false && !!(W.navigation && typeof W.navigation.addEventListener === 'function');
      if (api) W.navigation.addEventListener('navigate', function (e) { try { var d = e.destination; if (e.downloadRequest || !d || W.__sim.__inHash) return;
        if (e.hashChange) { if (e.navigationType === 'push' && e.cancelable && hist) { e.preventDefault(); hashNav(d.url); } return; }
        var ih = inPageHash(d.url); if (ih && e.cancelable && e.navigationType !== 'reload' && e.navigationType !== 'traverse') { e.preventDefault(); hashNav(ih); return; } // a hash link would add an entry to the REAL page's history
        if (d.sameDocument || e.navigationType === 'reload' || e.navigationType === 'traverse' || /^about:srcdoc$/i.test(d.url)) return;
        if (!e.cancelable) { emit('isolationWarning', { url: d.url, reason: 'navigation could not be cancelled' }); return; }
        e.preventDefault(); go(d.url, e.formData ? { method: 'POST', body: e.formData } : null); } catch (x) {} });
      // Without the Navigation API (older browsers): links and forms are handled in the capture phase. The real navigation is cancelled at once;
      // the virtual one runs after the event unless page code cancels it too (preventDefault / returnValue still work for the page).
      function deferNav(e, run) { var pc = false; try { e.preventDefault(); Object.defineProperty(e, 'defaultPrevented', { configurable: true, get: function () { return pc; } }); Object.defineProperty(e, 'returnValue', { configurable: true, get: function () { return !pc; }, set: function (v) { if (v === false) pc = true; } }); e.preventDefault = function () { pc = true; }; } catch (x) {} W.setTimeout(function () { if (!pc) run(); }, 0); }
      function formNav(f, sub) { var meth = String((sub && sub.getAttribute && sub.getAttribute('formmethod')) || f.method || 'GET').toUpperCase(), act = (sub && sub.getAttribute && sub.getAttribute('formaction')) || f.action || String(W.location.href), fd; try { fd = new W.FormData(f, sub || undefined); } catch (x) { fd = new W.FormData(f); } if (meth === 'GET') { var u = new W.URL(act, D.baseURI); u.search = ''; fd.forEach(function (v, k) { u.searchParams.append(k, String(v)); }); go(u.href); } else go(new W.URL(act, D.baseURI).href, { method: meth, body: fd }); }
      W.addEventListener('click', function (e) { try { if (e.button) return; var a = e.target && e.target.closest ? e.target.closest('a[href],area[href]') : null; if (!a || a.hasAttribute('download')) return; var tg = (a.getAttribute('target') || '').toLowerCase(), newWin = tg === '_blank' || (tg && tg !== '_self' && tg !== '_parent' && tg !== '_top' && !(W.frames && W.frames[tg])) || e.ctrlKey || e.metaKey || e.shiftKey; if (newWin) { if (M.popups === 'block' && !e.defaultPrevented) { e.preventDefault(); emit('popupBlocked', { url: a.href }); } return; } if (api) return; var u = new W.URL(a.getAttribute('href'), D.baseURI); if (/^javascript:/i.test(u.protocol)) return; var ih = inPageHash(u.href) || ((u.href.split('#')[0] === String(W.location.href).split('#')[0] && u.hash) ? u.href : null); if (ih) { deferNav(e, function () { hashNav(ih); }); return; } deferNav(e, function () { go(u.href); }); } catch (x) {} }, true);
      W.addEventListener('submit', function (e) { try { var f = e.target, tg = ((e.submitter && e.submitter.getAttribute('formtarget')) || f.getAttribute('target') || '').toLowerCase(); if (tg === '_blank') { if (M.popups === 'block') { e.preventDefault(); emit('popupBlocked', { url: f.action }); } return; } if (api) return; var sub = e.submitter || null; deferNav(e, function () { formNav(f, sub); }); } catch (x) {} }, true);
      if (!api) {
        try { var FP = W.HTMLFormElement && W.HTMLFormElement.prototype; if (FP) Object.defineProperty(FP, 'submit', { configurable: true, writable: true, value: function () { formNav(this, null); } }); } catch (x) {}
        // location.href / assign / replace cannot be intercepted without the Navigation API: onLost catches the page after it loads
      }
      function metaRefresh() { try { [].forEach.call(D.querySelectorAll('meta[data-sim-http-equiv]'), function (m) { if (String(m.getAttribute('data-sim-http-equiv')).toLowerCase() !== 'refresh' || m.__simDone) return; m.__simDone = 1; var c = String(m.getAttribute('content') || ''), mm = /^\s*(\d+(?:\.\d+)?)?\s*[;,]?\s*(?:url\s*=\s*)?["']?([^"']*)["']?\s*$/i.exec(c); if (!mm || !mm[2]) return; var url = new W.URL(mm[2], D.baseURI).href; W.setTimeout(function () { go(url); }, (+mm[1] || 0) * 1000); }); } catch (x) {} }
      if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', metaRefresh); else metaRefresh();
      iso.navigation = virt ? (api ? 'virtual' : 'virtual-fallback') : 'block';
    })();
    (function () { if (M.popups !== 'block' || typeof W.open !== 'function' || !W.document) return; var ro = W.open; W.open = function (u, t) { var tg = String(t == null ? '' : t).toLowerCase(), url = u == null ? '' : String(u); if (url && (tg === '_self' || tg === '_top' || tg === '_parent')) { if (W.__sim.go) { W.__sim.go(new W.URL(url, W.document.baseURI).href); return W; } if (!M.navigation || M.navigation === 'allow') return ro.apply(W, arguments); emit('navigationBlocked', { url: url }); return null; } emit('popupBlocked', { url: url }); return null; }; iso.popups = 'block'; })();
  }

  // ---- workers: wrapper that installs the plan, then loads the real script (also builds nested wrappers) ----
  function workerBoot(spec, abs, mod, II, IL, WB) { // self-contained: also runs inside workers to build nested worker wrappers
    var J = function (x) { return JSON.stringify(x); };
    return '(function(){var W=self;W.__sim=W.__sim||{};' + (abs ? 'var ABS=' + J(abs) + ',__U=new URL(ABS);try{var __loc={};["href","origin","protocol","host","hostname","port","pathname","search","hash"].forEach(function(k){__loc[k]=__U[k]});__loc.toString=function(){return __U.href};Object.defineProperty(W,"location",{configurable:true,get:function(){return __loc}})}catch(e){}' +
      'var __rs=function(x){try{if(typeof x==="string"&&!/^[a-z][\\w+.-]*:/i.test(x))return new URL(x,ABS).href;if(x&&typeof x==="object"&&!(typeof Request!=="undefined"&&x instanceof Request)&&typeof x.href==="string")return x.href}catch(e){}return x};' +
      (mod ? '' : 'var __iu=W.importScripts;if(__iu)W.importScripts=function(){return __iu.apply(W,[].map.call(arguments,function(x){return new URL(x,ABS).href}))};') +
      'var __f=W.fetch;if(__f)W.fetch=function(i,o){return __f.call(W,__rs(i),o)};if(W.XMLHttpRequest){var __xo=W.XMLHttpRequest.prototype.open;W.XMLHttpRequest.prototype.open=function(m,u){var a=[].slice.call(arguments);a[1]=__rs(u);return __xo.apply(this,a)}}["EventSource","WebSocket"].forEach(function(n){var R=W[n];if(!R)return;var F=function(u,o){return o===undefined?new R(__rs(u)):new R(__rs(u),o)};F.prototype=R.prototype;try{W[n]=F}catch(e){}});' : '') +
      'var S=' + J(spec) + ',__II=' + J(II) + ',__IL=' + J(IL) + ',__WB=' + J(WB) + ';S.__workerSrc=function(a,m){var C=JSON.parse(JSON.stringify(S));if(C.__clock)C.__clock.cfg.role="follower";return (0,eval)("("+__WB+")")(C,a,m,__II,__IL,__WB)};W.__sim.RealBC=W.__sim.RealBC||W.BroadcastChannel;if(S.__clock)try{(0,eval)("("+S.__clock.js+")")(W,S.__clock.cfg)}catch(e){}try{(0,eval)("("+__II+")")(W,S,(0,eval)("("+__IL+")")())}catch(e){}' +
      (mod ? 'var __q=[],__rd=false;W.addEventListener("message",function(e){if(__rd||e.__simReplay)return;e.stopImmediatePropagation();__q.push(e)},true);W.__simModReady=function(){if(__rd)return;__rd=true;__q.splice(0).forEach(function(e){try{var n=new MessageEvent("message",{data:e.data,ports:e.ports?[].slice.call(e.ports):[]});n.__simReplay=1;W.dispatchEvent(n)}catch(x){}})};' : '') +
      '})();' + (!abs ? '' : mod ? 'import(' + J(abs) + ').then(function(){self.__simModReady()},function(e){self.__simModReady();setTimeout(function(){throw e})});' : 'importScripts(' + J(abs) + ');');
  }
  function workerSpec(iso) { var spec = plainIso(iso || {}); var m = spec.__modes || {}; spec.__modes = { workers: m.workers || 'isolate', serviceWorker: m.serviceWorker, storageBuckets: m.storageBuckets, opfs: m.opfs, cookieStore: m.cookieStore }; spec.__clock = (iso && iso.__clock) || null; return spec; }
  function workerCode(src, abs, mod) { return workerBoot(workerSpec(src._iso), abs, mod, isoInstall.toString(), isoLib.toString(), workerBoot.toString()); }
  // ---- bridge: window.__app.run injected into the app's main inline script ----
  function exposeBridge(html, spec) {
    try {
      if (spec && spec.bridge === false) return html;
      var inject = (spec && spec.bridgeCode) || DEFAULTS.bridgeCode;
      var pats = (spec && spec.bridgePattern) ? [].concat(spec.bridgePattern) : ((spec && spec.bridgePatterns) || DEFAULTS.bridgePatterns || []);
      var blocks = [], re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, mm; while ((mm = re.exec(html))) { var at = mm[1] || '', ty = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(at); if (/\bsrc\s*=/i.test(at)) continue; if (ty && !/^(text\/javascript|application\/javascript|module|text\/ecmascript|application\/ecmascript)$/i.test(ty[1])) continue; blocks.push({ start: mm.index + 7 + at.length + 1, body: mm[2] }); }
      for (var i = 0; i < pats.length; i++) { var P = pats[i]; for (var j = 0; j < blocks.length; j++) { var bi = -1, bl = 0; if (P instanceof RegExp) { var r2 = new RegExp(P.source, P.flags.replace('g', '')).exec(blocks[j].body); if (r2) { bi = r2.index; bl = r2[0].length; } } else { bi = blocks[j].body.indexOf(String(P)); bl = String(P).length; } if (bi >= 0) { if (spec) spec._bridged = true; var pos = blocks[j].start + bi + bl, dp = /^\s*(['"])use strict\1;?/.exec(html.slice(pos)); if (dp) pos += dp[0].length; return html.slice(0, pos) + inject + html.slice(pos); } } }
      if (spec) spec._bridged = false; EV.emit('bridgeMissing', { id: spec && spec._simId, reason: 'no injection pattern matched' });
    } catch (e) {}
    return html;
  }
  // ---- loading a url: direct first, then through proxies (started a little apart, first good reply wins) ----
  // spec.proxy: a url prefix | { url, getOnly, name } | a list of them. A prefix ending in ? or = gets the target
  // url encoded; otherwise it is appended. A JSON reply { contents } (AllOrigins style) is unwrapped.
  function proxyList(src) { return [].concat(src.proxy || []).map(function (x) { return typeof x === 'string' ? { url: x, getOnly: false } : (x && x.url) ? { url: String(x.url), getOnly: !!x.getOnly, name: x.name || null } : null; }).filter(Boolean); }
  function viaProxy(p, url) { return /[?=]$/.test(p.url) ? p.url + encodeURIComponent(url) : p.url + url; }
  function unwrapProxy(t) { try { var j = JSON.parse(t); if (j && typeof j === 'object' && typeof j.contents === 'string') return j.contents; } catch (e) {} return t; }
  function raceProxies(url, list, stagger) {
    return new Promise(function (res, rej) {
      var next = 0, won = false, failed = 0, errors = [], ctl = [], tm = 0;
      function launch() {
        if (won || next >= list.length) return; var i = next++, p = list[i], c = typeof AbortController !== 'undefined' ? new AbortController() : null; ctl.push(c);
        if (tm) clearTimeout(tm); tm = next < list.length ? setTimeout(launch, +stagger[Math.min(i, stagger.length - 1)] || 0) : 0;
        fetch(viaProxy(p, url), c ? { signal: c.signal } : {}).then(function (r) { if (!r.ok) throw Error('HTTP ' + r.status); return r.text(); }).then(function (t) {
          t = unwrapProxy(t); if (!t) throw Error('empty reply'); if (won) return; won = true; if (tm) clearTimeout(tm);
          ctl.forEach(function (x) { try { if (x) x.abort(); } catch (e) {} }); res({ text: t, proxy: p, errors: errors });
        }).then(null, function (e) { if (won) return; errors.push((p.name || p.url) + ': ' + errMsg(e)); if (++failed >= list.length) { if (tm) clearTimeout(tm); rej(Object.assign(Error('all proxies failed'), { errors: errors })); } else launch(); }); // a failure starts the next one at once
      }
      if (!list.length) return rej(Error('no proxies')); launch();
    });
  }
  // why a load failed: 'offline' | 'cors' (the server answers, but not to scripts) | 'unreachable'
  function diagnose(url) { if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve('offline'); return fetch(url, { mode: 'no-cors' }).then(function () { return 'cors'; }, function () { return 'unreachable'; }); }
  function loadUrl(o) {
    var list = proxyList(o), info = o._load = { url: o.url, via: null };
    function proxied(prev) { if (!list.length) return Promise.reject(prev); return raceProxies(o.url, list, [].concat(optOf(o, 'proxyStagger') || 0)).then(function (r) { info.via = 'proxy'; info.proxy = r.proxy.url; info.errors = r.errors; o._proxy = r.proxy; return r.text; }, function (e) { info.errors = e.errors || [errMsg(e)]; throw prev || e; }); }
    var p = (optOf(o, 'proxyMode') === 'always' && list.length) ? proxied(null) : fetchText(o.url).then(function (t) { info.via = 'direct'; return t; }, function (e) { info.directError = errMsg(e); return proxied(e); });
    return p.then(null, function (e) { info.via = 'src'; info.error = errMsg(e); return diagnose(o.url).then(function (k) { info.kind = k; EV.emit('loadFailed', { url: o.url, kind: k, error: info.error, errors: info.errors || [] }); throw e; }); });
  }
  function sandboxFor(src) { var sb = optOf(src, 'sandbox'); if (sb && sb !== 'auto') return String(sb); var m = (src._iso && src._iso.__modes) || compileModes(src), p = ['allow-scripts', 'allow-same-origin']; if (m.navigation !== 'block') p.push('allow-forms'); if (m.popups === 'allow') p.push('allow-popups'); return p.join(' '); }
  function normalize(spec) {
    return Promise.resolve().then(function () {
      var o;
      if (typeof spec === 'function') return normalize(spec());
      if (typeof spec === 'string') { o = looksHtml(spec) ? { html: spec } : { url: spec }; }
      else if (spec && typeof spec === 'object') { o = Object.assign({}, spec); }
      else throw Error('SIM: bad spec');
      if (o.node && o.node.outerHTML) o.html = o.node.outerHTML;
      if (o.doc && o.doc.documentElement) o.html = '<!doctype html>' + o.doc.documentElement.outerHTML;
      if (o.fn && !o.html && !o.url && !o.src) return normalize(o.fn());
      o.isolate = (o.isolate === undefined ? DEFAULTS.isolate : o.isolate);
      if (o.preset) { var pr = typeof o.preset === 'string' ? PRESETS[o.preset] : o.preset; if (!pr) throw Error('SIM: unknown preset ' + o.preset); o = merge({}, pr, o); }
      o.console = (DEFAULTS.console || o.console) ? merge({}, DEFAULTS.console || {}, o.console || {}) : null;
      Object.keys(DEFAULTS).forEach(function (k) { if (GLOBAL_OPTS[k] || k === 'console') return; var d = DEFAULTS[k]; if (o[k] === undefined) o[k] = isObj(d) ? merge({}, d) : Array.isArray(d) ? d.slice() : d; else if (isObj(d) && isObj(o[k]) && MERGE_OPTS[k]) o[k] = merge({}, d, o[k]); });
      o.base = o.base || DEFAULTS.base; o.runtime = o.runtime || DEFAULTS.runtime; if (['iframe', 'tab', 'worker', 'remote'].indexOf(o.runtime) < 0) throw Error('SIM: unknown runtime \'' + o.runtime + '\' (iframe | tab | worker | remote)');
      o.ttl = (o.ttl == null ? DEFAULTS.ttl : o.ttl);
      if (o.runtime === 'worker' || o.runtime === 'remote') return o;
      if (o.html) return o;
      if (o.url) return loadUrl(o).then(function (t) { o.html = t; o.base = o.base || o.url; return o; }, function () { o.src = o.url; o.limited = true; return o; });
      if (o.target || o.src) { o.src = o.src || o.target; o.limited = true; return o; }
      throw Error('SIM: spec has no html/url/src');
    });
  }

  // ---- prelude: the code every sim page runs first (host lookup, log capture, the plan, clock, network layer) ----
  // network inside the page (stringified): fetch, XMLHttpRequest and WebSocket all go through the sim's routes,
  // the offline switch and (for cross-origin requests) the proxy the page was loaded through
  function routeNet(W) {
    var X = W.__sim, P = W.Promise, of = (W.fetch && W.fetch.bind) ? W.fetch.bind(W) : W.fetch, later = function (f) { P.resolve().then(f); };
    var sse = function (t) { return /^\s*(data|event|id|retry):/.test(t); }, ctOf = function (t) { if (sse(t)) return 'text/event-stream'; try { JSON.parse(t); return 'application/json'; } catch (e) { return 'text/plain;charset=UTF-8'; } };
    var tag = function (x) { return Object.prototype.toString.call(x); };
    var isResp = function (v) { return !!v && typeof v === 'object' && typeof v.arrayBuffer === 'function' && typeof v.status === 'number' && !!v.headers && typeof v.headers.forEach === 'function'; };
    // a handler reply -> { status, headers (lower-case object), body }: a string | { status, headers, body } (object body = JSON)
    function parts(v) {
      if (typeof v === 'string') return { status: 200, headers: sse(v) ? { 'content-type': 'text/event-stream' } : {}, body: v };
      var b = v && typeof v === 'object' ? v.body : null, h = {}; if (b && typeof b === 'object' && !/Blob|ArrayBuffer/.test(tag(b))) { try { b = JSON.stringify(b); } catch (e) {} }
      new W.Headers((v && v.headers) || { 'content-type': typeof b === 'string' ? ctOf(b) : 'application/json' }).forEach(function (x, k) { h[k] = x; });
      return { status: (v && v.status) || 200, headers: h, body: b == null ? '' : b };
    }
    function toResponse(v) {
      var R = W.Response; if (v instanceof R) return v;
      if (isResp(v)) { var hh = []; v.headers.forEach(function (x, k) { hh.push([k, x]); }); return v.arrayBuffer().then(function (b) { return new R((v.status === 204 || v.status === 304) ? null : b, { status: v.status, statusText: v.statusText || '', headers: hh }); }); } // from another realm
      var p = parts(v); return new R(p.body, { status: p.status, headers: p.headers });
    }
    function callH(r, url, input, init) { try { return X.handlers[r.id](url, input, init); } catch (e) { return { status: 500, body: 'handler error: ' + e.message }; } }
    function offline() { return !!(X.offline || (X.host && X.host.offline)); }
    function abs(u, ws) { var b = ''; try { b = W.document ? W.document.baseURI : String(W.location.href); } catch (e) {} if (ws) b = b.replace(/^http/i, 'ws'); try { return new W.URL(String(u), b).href; } catch (e) { return String(u); } }
    function find(list, url, method, input, init) { list = list || []; for (var i = 0; i < list.length; i++) { var r = list[i], h = false; if (r.method && method && r.method !== method) continue; try { h = r.test(url, input, init); } catch (e) {} if (h) return r; } return null; }
    // a routed reply as a Promise<Response>: honours the route's delay (on the sim's clock) and the request's AbortSignal
    function reply(r, url, input, init) {
      X.net++; var out = callH(r, url, input, init), done = 0, tm = 0, sig = (init && init.signal) || (input && typeof input === 'object' && input.signal) || null;
      return new P(function (res, rej) {
        function end(ok, v) { if (done) return; done = 1; X.net--; if (tm) clearTimeout(tm); if (sig) sig.removeEventListener('abort', ab); (ok ? res : rej)(v); }
        function ab() { end(false, new W.DOMException('The user aborted a request.', 'AbortError')); }
        function go() { P.resolve(out).then(toResponse).then(function (x) { end(true, x); }, function (e) { end(false, e); }); }
        if (sig) { if (sig.aborted) return ab(); sig.addEventListener('abort', ab); }
        if (out && out.delay) tm = setTimeout(go, out.delay); else go();
      });
    }
    // cross-origin http(s) requests go through the page's proxy (a GET-only one is swapped for another for other methods)
    function proxify(url, method) {
      var H = X.host; if (!H || !H.proxy || !H.proxyRequests) return null; var a = abs(url), me = ''; if (!/^https?:/i.test(a)) return null;
      try { me = W.origin; if (new W.URL(a).origin === me) return null; } catch (e) { return null; }
      var list = H.proxies || [], px = H.proxy; if (list.some(function (p) { return a.indexOf(p.url) === 0; })) return null;
      if (method && method !== 'GET' && px.getOnly) { px = null; for (var i = 0; i < list.length; i++) if (!list[i].getOnly) { px = list[i]; break; } }
      return px ? (/[?=]$/.test(px.url) ? px.url + encodeURIComponent(a) : px.url + a) : null;
    }
    if (of) W.fetch = function (input, init) {
      try {
        if (offline()) return P.reject(new TypeError('Failed to fetch (sim offline)'));
        var url = typeof input === 'string' ? input : (input && typeof input.url === 'string') ? input.url : String(input == null ? '' : input), method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase(), r = find(X.routes, url, method, input, init);
        if (r) return reply(r, url, input, init);
        var pu = proxify(url, method); if (pu) input = (W.Request && input instanceof W.Request) ? new W.Request(pu, input) : pu;
      } catch (e) {}
      return of(input, init);
    };
    // XMLHttpRequest: a routed or offline request never reaches the network; the object is answered in place
    var XP = W.XMLHttpRequest && W.XMLHttpRequest.prototype;
    if (XP && XP.open && XP.send) (function () {
      var xo = XP.open, xs = XP.send, xh = XP.setRequestHeader, xa = XP.abort, OWN = ['readyState', 'status', 'statusText', 'responseURL', 'responseText', 'response', 'responseXML', 'getResponseHeader', 'getAllResponseHeaders'];
      function ev(x, t, n) { var e; try { e = (t === 'readystatechange' || !W.ProgressEvent) ? new W.Event(t) : new W.ProgressEvent(t, { lengthComputable: n > 0, loaded: n || 0, total: n || 0 }); } catch (z) { e = new W.Event(t); } x.dispatchEvent(e); }
      function fake(x, s) {
        if (s.faked) return; s.faked = 1; s.rs = 1; s.st = 0; s.stt = ''; s.txt = ''; s.res = ''; s.xml = null; s.hd = {};
        var g = function (k, f) { Object.defineProperty(x, k, { configurable: true, get: f }); }, M = { readyState: 'rs', status: 'st', statusText: 'stt', response: 'res', responseXML: 'xml' };
        Object.keys(M).forEach(function (k) { g(k, function () { return s[M[k]]; }); }); g('responseURL', function () { return s.rs === 4 && s.st ? abs(s.url) : ''; });
        g('responseText', function () { var t = x.responseType; if (t && t !== 'text') throw new W.DOMException("The value is only accessible if the object's 'responseType' is '' or 'text'.", 'InvalidStateError'); return s.txt; });
        Object.defineProperty(x, 'getResponseHeader', { configurable: true, writable: true, value: function (k) { k = String(k).toLowerCase(); return s.rs >= 2 && Object.prototype.hasOwnProperty.call(s.hd, k) ? s.hd[k] : null; } });
        Object.defineProperty(x, 'getAllResponseHeaders', { configurable: true, writable: true, value: function () { return s.rs < 2 ? '' : Object.keys(s.hd).map(function (k) { return k + ': ' + s.hd[k] + '\r\n'; }).join(''); } });
      }
      function fail(x, s, t) { if (s.done) return; s.done = 1; s.rs = 4; s.st = 0; ev(x, 'readystatechange'); ev(x, t || 'error', 0); ev(x, 'loadend', 0); }
      function fill(x, s, st, stt, hd, buf, txt) {
        var rt = x.responseType || '', ct = String(hd['content-type'] || '').split(';')[0].trim(), n = buf ? buf.byteLength : txt.length, doc = function (t) { try { return new W.DOMParser().parseFromString(txt, t); } catch (e) { return null; } };
        s.st = st; s.stt = stt || ''; s.hd = hd; s.rs = 2; ev(x, 'readystatechange'); s.txt = txt;
        s.res = (rt === '' || rt === 'text') ? txt : rt === 'json' ? (function () { try { return JSON.parse(txt); } catch (e) { return null; } })() : rt === 'arraybuffer' ? buf : rt === 'blob' ? new W.Blob([buf], { type: ct }) : rt === 'document' ? doc(/xml/.test(ct) ? ct : 'text/html') : txt;
        if (rt === 'document') s.xml = s.res; else if (!rt && /xml/.test(ct)) s.xml = doc(ct);
        s.rs = 3; ev(x, 'readystatechange'); ev(x, 'progress', n); s.rs = 4; s.done = 1; ev(x, 'readystatechange'); ev(x, 'load', n); ev(x, 'loadend', n);
      }
      XP.open = function (m, u) {
        var a = [].slice.call(arguments), mt = String(m || 'GET').toUpperCase(), x = this; OWN.forEach(function (k) { try { delete x[k]; } catch (e) {} });
        var s = x.__simX = { m: mt, url: String(u), h: {}, async: a.length < 3 || !!a[2], r: null };
        try { s.r = find(X.routes, s.url, mt, s.url, null); if (!s.r) { var pu = proxify(s.url, mt); if (pu) a[1] = pu; } } catch (e) {}
        return xo.apply(x, a);
      };
      XP.setRequestHeader = function (k, v) { var s = this.__simX; if (s) s.h[String(k).toLowerCase()] = String(v); return xh.apply(this, arguments); };
      XP.send = function (body) {
        var x = this, s = x.__simX, off = offline(); if (!s || (!s.r && !off)) return xs.apply(x, arguments);
        fake(x, s); ev(x, 'loadstart', 0);
        if (off) { if (!s.async) { s.done = 1; s.rs = 4; throw new W.DOMException("Failed to execute 'send' on 'XMLHttpRequest': sim offline", 'NetworkError'); } later(function () { fail(x, s); }); return; }
        var init = { method: s.m, headers: s.h, body: body == null ? null : body };
        if (!s.async) {
          var out = callH(s.r, s.url, s.url, init), so = (typeof out === 'string' || (out && typeof out === 'object' && !out.then && !out.delay && !isResp(out))) ? parts(out) : null; if (so && typeof so.body !== 'string') so = null; if (!so) { s.done = 1; s.rs = 4; throw new W.DOMException('sim: a synchronous XMLHttpRequest needs a route that answers at once (a string or { status, headers, body } without delay)', 'NetworkError'); }
          fill(x, s, so.status, '', so.headers, new W.TextEncoder().encode(so.body).buffer, so.body); return;
        }
        reply(s.r, s.url, s.url, init).then(function (resp) { var hd = {}; resp.headers.forEach(function (v, k) { hd[k] = v; }); return resp.arrayBuffer().then(function (buf) { if (!s.done) fill(x, s, resp.status, resp.statusText, hd, buf, new W.TextDecoder().decode(buf)); }); }).then(null, function () { fail(x, s); });
      };
      XP.abort = function () { var s = this.__simX; if (s && s.faked) { if (!s.done) fail(this, s, 'abort'); s.rs = 0; return; } return xa.apply(this, arguments); };
    })();
    // WebSocket: a routed socket talks to the route's handler (a fake server); offline sockets fail like a dead network
    var RWS = W.WebSocket;
    if (RWS) (function () {
      function mk(url, protocols, r) {
        var et = new W.EventTarget(), rs = 0, q = [], L = {}, pr = [].concat(protocols == null ? [] : protocols), org = '';
        try { org = new W.URL(url).origin; } catch (e) {}
        try { Object.setPrototypeOf(et, F.prototype); } catch (e) {} // instanceof WebSocket; own properties below shadow the real getters
        var props = { url: url, protocol: '', extensions: '', bufferedAmount: 0, binaryType: 'blob', onopen: null, onmessage: null, onerror: null, onclose: null };
        Object.keys(props).forEach(function (k) { Object.defineProperty(et, k, { configurable: true, enumerable: true, writable: true, value: props[k] }); });
        Object.defineProperty(et, 'readyState', { configurable: true, enumerable: true, get: function () { return rs; } });
        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k, i) { Object.defineProperty(et, k, { value: i }); });
        function fire(t, init, C) { var e; try { e = C ? new C(t, init) : new W.Event(t); } catch (x) { e = new W.Event(t); } var h = et['on' + t]; if (typeof h === 'function') try { h.call(et, e); } catch (x) { later(function () { throw x; }); } W.EventTarget.prototype.dispatchEvent.call(et, e); }
        function toPage(d) {
          if (rs === 0) { q.push(d); return; } if (rs !== 1) return;
          if (W.ArrayBuffer.isView(d)) d = d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
          if (tag(d) === '[object ArrayBuffer]' && et.binaryType === 'blob') d = new W.Blob([d]);
          else if (tag(d) === '[object Blob]' && et.binaryType === 'arraybuffer') { d.arrayBuffer().then(function (b) { if (rs === 1) fire('message', { data: b, origin: org }, W.MessageEvent); }); return; }
          fire('message', { data: d, origin: org }, W.MessageEvent);
        }
        function toPeer(t, a) { var fs = (L[t] || []).slice(), h = peer['on' + t]; if (typeof h === 'function') fs.unshift(h); fs.forEach(function (f) { try { f.call(peer, a); } catch (x) { later(function () { throw x; }); } }); }
        function shut(code, reason, clean) { if (rs === 3) return; rs = 3; if (!clean) fire('error'); var c = { code: code, reason: reason || '', wasClean: !!clean }; fire('close', c, W.CloseEvent); toPeer('close', c); }
        var peer = { url: url, protocols: pr.slice(), received: [], onmessage: null, onopen: null, onclose: null,
          send: function (d) { later(function () { toPage(d); }); return peer; },
          close: function (code, reason) { later(function () { if (rs < 2) rs = 2; shut(code || 1000, reason, true); }); },
          fail: function (code) { later(function () { shut(code || 1006, '', false); }); },
          on: function (t, f) { (L[t] || (L[t] = [])).push(f); return peer; } };
        Object.defineProperty(peer, 'readyState', { get: function () { return rs; } });
        Object.defineProperty(et, 'send', { configurable: true, writable: true, value: function (d) { if (rs === 0) throw new W.DOMException("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.", 'InvalidStateError'); if (rs !== 1) return; peer.received.push(d); later(function () { toPeer('message', d); }); } });
        Object.defineProperty(et, 'close', { configurable: true, writable: true, value: function (code, reason) { if (rs >= 2) return; var was = rs; rs = 2; later(function () { if (was === 0) shut(1006, '', false); else shut(code || 1000, reason, true); }); } });
        var ok = !!r; if (r) try { ok = X.handlers[r.id](peer); } catch (e) { ok = false; later(function () { throw e; }); }
        P.resolve(ok).then(function (v) {
          function open() { if (rs !== 0) return; if (v === false || !r) return shut(1006, '', false); rs = 1; et.protocol = pr[0] || ''; fire('open'); toPeer('open'); q.splice(0).forEach(toPage); }
          if (r && r.delay) setTimeout(open, r.delay); else open();
        }, function () { shut(1006, '', false); });
        return et;
      }
      var F = function WebSocket(url, protocols) { var u = abs(url, true); if (offline()) return mk(u, protocols, null); var r = find(X.wsRoutes, u, null); if (r) return mk(u, protocols, r); return protocols === undefined ? new RWS(url) : new RWS(url, protocols); };
      F.prototype = RWS.prototype; ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k, i) { F[k] = i; });
      try { W.WebSocket = F; } catch (e) {}
    })();
  }
  function preludeJs(opt) {
    var p = ['(function(){var W=window,__H=null;try{var __P=W,__id=' + js(String(opt._simId)) + ';for(var __g=0;__P&&__g<12;__g++){try{if(__P.__simHost&&__P.__simHost[__id]){__H=__P.__simHost[__id];break}}catch(e){}var __nx=(__P.parent&&__P.parent!==__P)?__P.parent:__P.opener;if(!__nx||__nx===__P)break;__P=__nx}}catch(e){}',
      'W.__sim={routes:__H?__H.routes:[],handlers:__H?__H.handlers:{},wsRoutes:__H?__H.wsRoutes:[],net:0,mut:0,offline:false,host:__H,RealBC:W.BroadcastChannel};',
      'try{var __L=W.__simLogs=(__H&&__H.logs)||W.__simLogs||[],__E=W.__simErrs=(__H&&__H.errs)||W.__simErrs||[];(' + capture + ')(W,__L,__E,(' + logSink + ')(' + js(logPolicy(opt)) + '))}catch(e){}'];
    if (opt.isolate !== false) p.push('var __spec=(__H&&__H.iso)||' + js(plainIso(opt._iso || compileIso(opt, opt._simId))) + ';W.__sim.prefix=(__spec.indexedDB&&__spec.indexedDB.prefix)||"";try{(' + isoInstall + ')(W,__spec,(' + isoLib + ')())}catch(e){W.__sim.isoError=String(e&&e.message||e)}');
    if (optOf(opt, 'trackStable')) p.push('try{new W.MutationObserver(function(){W.__sim.mut++}).observe(W.document.documentElement,{subtree:true,childList:true})}catch(e){}');
    // clock: from the start when spec.clock is set; also after a navigation of a sim whose clock was started later
    var ck = opt._clock || clockCfg(opt, opt._simId);
    p.push('if(' + (ck.enabled ? 'true' : '!!(__H&&__H.time)') + ')try{(' + timeEngine + ')(W,Object.assign(' + js(ck) + ',{role:W.__simChild?"follower":"main"}))}catch(e){}');
    p.push('(' + routeNet + ')(W);})();');
    return p.join('');
  }
  // ---- page edits (host side): spec.edit changes the source, prepend / append add code around the page's own ----
  // edit: function (html, info) -> html | [find, replace] (find: string = every occurrence, or RegExp) | a list of these.
  // info = { url, navigation (0 = first load) }. A failing edit is skipped and reported (report().editErrors, 'editError').
  function editHtml(html, src) {
    var E = src.edit; if (E == null) return html;
    var list = (Array.isArray(E) && (typeof E[0] === 'string' || E[0] instanceof RegExp)) ? [E] : [].concat(E), info = { url: src.base || null, navigation: src._navs || 0 };
    list.forEach(function (ed, i) {
      try {
        if (typeof ed === 'function') { var r = ed(html, info); if (r != null) html = String(r); }
        else if (Array.isArray(ed)) html = (typeof ed[0] === 'string') ? (typeof ed[1] === 'function' ? html.split(ed[0]).join(String(ed[1](ed[0]))) : html.split(ed[0]).join(String(ed[1]))) : html.replace(ed[0], ed[1]);
      } catch (e) { var er = 'edit ' + i + ': ' + errMsg(e); (src._editErrors = src._editErrors || []).push(er); EV.emit('editError', { id: src._simId, error: er }); }
    });
    return html;
  }
  // prepend / append: code (a string), { src: url } (a script tag), { html } (raw markup), or a list
  function codeTags(x) { return [].concat(x == null ? [] : x).map(function (c) { if (c == null) return ''; if (typeof c === 'object') { if (c.html != null) return String(c.html); if (c.src != null) return '<script src="' + String(c.src).replace(/"/g, '&quot;') + '"><\/script>'; return ''; } return '<script>' + String(c).replace(/<\/(script)/gi, '<\\/$1') + '<\/script>'; }).join(''); }
  function injectAll(html, src, extra, plain) {
    if (!plain) { html = editHtml(String(html), src); var tail = codeTags(src.append); if (tail) { var eb = html.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i); html = eb >= 0 ? html.slice(0, eb) + tail + html.slice(eb) : html + tail; } }
    html = exposeBridge(LIB.pageFix(html, (src._iso && src._iso.__modes) || { csp: optOf(src, 'csp'), rocket: optOf(src, 'rocketLoader') }), src); var base = src.base ? String(src.base) : '', bt = '';
    if (base) { var own0 = /<base\b[^>]*>/i.exec(html), hm = own0 && /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(own0[0]);
      if (hm) { var abs; try { abs = new URL(hm[1] != null ? hm[1] : hm[2] != null ? hm[2] : hm[3], base).href; } catch (e) { abs = base; } html = html.slice(0, own0.index) + own0[0].slice(0, hm.index) + 'href="' + abs.replace(/"/g, '&quot;') + '"' + own0[0].slice(hm.index + hm[0].length) + html.slice(own0.index + own0[0].length); } // the page's own <base> wins, made absolute
      else bt = '<base href="' + base.replace(/"/g, '&quot;') + '">'; }
    return LIB.spliceHead(html, bt + '<script>' + preludeJs(src) + '<\/script>' + (extra ? '<script>' + String(extra).replace(/<\/(script)/gi, '<\\/$1') + '<\/script>' : '') + (plain ? '' : codeTags(src.prepend)));
  }

  // ---- runtimes ----
  function makeIframe(src, id) {
    if (!hasDOM) return Promise.reject(Error('SIM: iframe runtime needs DOM'));
    return new Promise(function (resolve) {
      var ifr = document.createElement('iframe'), simRef = null, H = src._host || hostRec(src, id), isDoc = !!src.html, done = false, navTok = 0;
      ifr.id = id; ifr.setAttribute('sandbox', sandboxFor(src));
      ifr.style.cssText = (optOf(src, 'offscreen') || '') + ';width:' + optOf(src, 'width') + 'px;height:' + optOf(src, 'height') + 'px;border:0';
      document.body.appendChild(ifr); TRACK.iframes.push(ifr);
      function win() { try { return ifr.contentWindow; } catch (e) { return null; } }
      function load(html) { try { var w = win(); if (w && w.__sim) w.__sim.__navOK = 1; } catch (e) {} ifr.srcdoc = injectAll(html, src, ''); }
      // navigation: fetched through the page's own fetch (routes, offline, delay apply), then loaded again with the prelude
      function nav(url, init, o) {
        url = String(url); o = o || {}; if (simRef && simRef._dead) return Promise.resolve({ ok: 0, error: 'destroyed' });
        var tok = ++navTok, T = o.timeout != null ? o.timeout : optOf(src, 'actionTimeout'), w = win(), f = (w && w.__sim && w.fetch) ? w.fetch.bind(w) : fetch, post = init && init.method && String(init.method).toUpperCase() !== 'GET';
        H.emit('navigate', { url: url });
        var p = f(url, post ? { method: init.method, body: init.body } : {}).then(function (r) { if (!r.ok) throw Error('HTTP ' + r.status + ' ' + url); return r.text(); }).then(function (html) {
          if (tok !== navTok || (simRef && simRef._dead)) return { ok: 0, error: 'cancelled' };
          src.html = html; src.base = url; src._navs = (src._navs || 0) + 1; load(html); return { ok: 1, value: url };
        });
        return race(p, T, 'navigate').then(null, function (e) { if (tok === navTok) navTok++; var m = errMsg(e); if (/^sim timeout/.test(m)) m = 'navigate timeout (' + T + 'ms): ' + url; H.emit('navigateError', { url: url, error: m }); return { ok: 0, error: m }; });
      }
      H.nav = nav;
      if (isDoc) { try { load(src.html); } catch (e) { ifr.srcdoc = src.html; } } else ifr.src = src.src;
      var opsOpts = { consoleAdapter: src.console, maxMessage: optOf(src, 'maxMessage'), maxLogs: optOf(src, 'maxLogs'), version: VERSION, logPolicy: logPolicy(src), clock: src._clock || null }, curW = null, curD = null, curOps = null;
      // keyed on the document too: an iframe keeps one contentWindow object across navigations
      function opsNow() { var w = win(), d = null; try { d = w && w.document; } catch (e) {} if (w && (w !== curW || d !== curD)) { curW = w; curD = d; curOps = OPS(w, opsOpts); } return curOps; }
      function ok() { try { var w = win(), d = w && w.document; return !!(d && d.readyState === 'complete' && d.body && (!isDoc || w.__sim)); } catch (e) { return false; } }
      function fin() {
        if (done) return; done = true;
        var sim = simRef = Sim(Channel({ ops: opsNow, iframe: ifr, opts: src }), { id: id, ttl: src.ttl, allowConsoleEval: optOf(src, 'allowConsoleEval'), host: H, opts: src });
        sim.kind = 'iframe';
        sim.onDestroy(function () { isoCleanup(src, id, win()); });
        sim.navigate = function (url, init, o) { sim.touch(); return nav(url, init, o); };
        sim.win = win; sim.doc = function () { var w = win(); return w && w.document; };
        sim.el = function (s) { var d = sim.doc(); return d ? d.querySelector(s) : null; };
        sim.all = function (s) { var d = sim.doc(); return d ? [].slice.call(d.querySelectorAll(s)) : []; };
        sim.fire = function (n, t, i) { var w = win(); if (n && w) try { n.dispatchEvent(new w.Event(t, Object.assign({ bubbles: true, cancelable: true }, i || {}))); } catch (e) {} };
        var base = sim.report;
        sim.report = function () { var w = win(), d = null, S = null; try { d = w && w.document; S = w && w.__sim; } catch (e) {} var iso = (S && S.iso) || {}, has = !!(w && w.__app && typeof w.__app.run === 'function');
          return Object.assign(base(), { kind: 'iframe', ready: !!(d && d.readyState === 'complete'), isolated: !!iso.localStorage, bridge: has ? 'ok' : src.bridge === false ? 'off' : src._bridged === false ? 'missing' : src._bridged ? 'lost' : 'none', seed: src._seed || null, seedErrors: (src._seedErrors || []).slice(), readyForOk: sim.readyForOk, editErrors: (src._editErrors || []).slice(), lost: !!src._lost, navigations: src._navs || 0, href: src.base || null, isolation: iso, isolatedAll: !!(Object.keys(iso).length && Object.keys(iso).every(function (k) { return iso[k]; })), hasBridge: has }); };
        resolve(sim);
      }
      // a document without the prelude loaded (a navigation the sim could not intercept): report, then onLost policy
      function afterLoad() {
        var w = win(), lost = false; try { lost = !w.__sim; } catch (e) { H.emit('isolationLost', { reason: 'navigated to another origin (it cannot reach this origin\'s storage)' }); return; }
        if (!lost) { H.emit('navigated', { href: src.base || null }); return; }
        if (src.limited || src.isolate === false) return;
        src._lost = true; var mode = (src._iso && src._iso.__modes && src._iso.__modes.onLost) || 'blank'; H.emit('isolationLost', { reason: 'a document without the sim prelude loaded', mode: mode });
        if (mode === 'destroy') { if (simRef) simRef.destroy(); } else if (mode === 'blank') ifr.srcdoc = injectAll(optOf(src, 'lostHtml') || '<!doctype html><title>sim stopped</title>', src, '', true);
      }
      ifr.addEventListener('load', function () { if (!done) { if (ok()) setTimeout(fin, 0); return; } afterLoad(); });
      var T = optOf(src, 'readyTimeout'), t0 = now();
      (function poll() { if (done) return; if (ok() || now() - t0 > T) return fin(); setTimeout(poll, timing(src, 'readyPollMs', 50)); })();
    });
  }
  // worker / tab / remote: a message channel; resolves when the agent says ready, or after readyTimeout
  function msgSim(src, id, tr, x) {
    if (!tr) return Promise.reject(Error(x.missing));
    var sim = Sim(Channel({ tr: tr, opts: src }), { id: id, ttl: src.ttl, urls: x.urls, host: x.host, opts: src }); sim.kind = x.kind; if (x.win !== undefined) sim.win = x.win; if (x.onDestroy) sim.onDestroy(x.onDestroy);
    return Promise.race([sim.ready, sleep(optOf(src, 'readyTimeout'))]).then(function () { return sim; }, function (e) { sim.destroy(); throw e; });
  }
  function agentOpts(src, id, o) { return Object.assign({ id: id, consoleAdapter: src.console, clock: src._clock || clockCfg(src, id), maxMessage: optOf(src, 'maxMessage'), maxLogs: optOf(src, 'maxLogs'), logPolicy: logPolicy(src) }, o); }
  var RUNTIMES = {
    iframe: makeIframe,
    worker: function (src, id) {
      if (typeof Worker === 'undefined') return Promise.reject(Error('SIM: no Worker support'));
      var wsp = workerSpec(src._iso); if (wsp.__clock) wsp.__clock = { js: wsp.__clock.js, cfg: Object.assign({}, wsp.__clock.cfg, { role: 'main' }) }; // this worker is the sim itself
      var pre = src.isolate === false ? '' : 'try{' + workerBoot(wsp, '', false, isoInstall.toString(), isoLib.toString(), workerBoot.toString()) + '}catch(e){}';
      var url = agentUrl(agentOpts(src, id, { type: 'self', init: src.code || '', pre: pre })), w;
      try { w = new Worker(url); } catch (e) { return Promise.reject(Error('SIM worker: ' + e.message)); }
      TRACK.workers.push(w);
      return msgSim(src, id, transportFrom({ type: 'worker', worker: w }, id), { kind: 'worker', urls: [url], onDestroy: function () { pull(TRACK.workers, w); isoCleanup(src, id, null); } });
    },
    tab: function (src, id) {
      if (!hasDOM || !G.open) return Promise.reject(Error('SIM: tab runtime needs window.open'));
      return (src.html != null ? Promise.resolve(src.html) : fetchText(src.url || src.src)).then(function (html) {
        var name = uid('tab'), url = blobUrl(injectAll(html, src, agentSource(agentOpts(src, id, { type: 'broadcast', name: name, me: id }))), 'text/html'), win = null;
        var tr = transportFrom({ type: 'broadcast', name: name }, id + ':ctl'); if (tr) try { win = G.open(url, '_blank'); } catch (e) {}
        return msgSim(src, id, tr, { kind: 'tab', urls: [url], host: src._host, win: win, missing: 'SIM: BroadcastChannel required for tab', onDestroy: function () { isoCleanup(src, id, win); } });
      });
    },
    remote: function (src, id) { return msgSim(src, id, transportFrom(src.transport || src, id), { kind: 'remote', missing: 'SIM: remote needs a transport' }); }
  };
  function reserveId(src) { if (src.id && (registry[src.id] || reserving[src.id])) { if (src.replace && registry[src.id]) registry[src.id].destroy(); else throw Error('SIM: id already in use: ' + src.id); } var rid = (src.id && String(src.id)) || uid('sim'); reserving[rid] = 1; return rid; }
  function make(spec) {
    return normalize(spec).then(function (src) {
      if (DEFAULTS.maxSims && ids().length + Object.keys(reserving).length >= DEFAULTS.maxSims && !src.force) throw Error('SIM: maxSims reached (' + DEFAULTS.maxSims + ')');
      var id = reserveId(src), t0 = now();
      return (src.runtime !== 'remote' ? prepIso(src, id) : Promise.resolve()).then(function () { return RUNTIMES[src.runtime](src, id); })
        .then(function (x) { if (src.readyFor == null) return x; return x.waitFor(src.readyFor, Math.max(1, optOf(src, 'readyTimeout') - (now() - t0))).then(function (ok) { x.readyForOk = ok; return x; }); })
        .then(function (x) { delete reserving[id]; return x; }, function (e) { delete reserving[id]; try { isoCleanup(src, id, null); } catch (x) {} throw e; });
    });
  }

  // ---- registry and controls ----
  function asTransport(x, id) { return (x && x.__simTransport) ? x : (transportFrom(x, id) || x); }
  function connect(t, id) { var tr = asTransport(t, id), realId = id || uid('sim'); return Sim(Channel({ tr: tr }), { id: realId }); }
  function remote(cfg, id) { var tr = transportFrom(cfg, id); if (!tr) throw Error('SIM: bad transport cfg'); return connect(tr, id); }
  function serve(t, id) { var tr = asTransport(t, id); if (!tr) throw Error('SIM: serve needs a transport'); if (id) tr.me = id; G.__simId = id || G.__simId; var handle = SERVER(OPS(G, { consoleAdapter: DEFAULTS.console, maxMessage: DEFAULTS.maxMessage, maxLogs: DEFAULTS.maxLogs, version: VERSION }), G, function (m) { tr.send(m); }); tr.on(handle); G.__simOnPub = function (ch, d, from, to) { bus.emit(ch, d, { from: from, to: to, via: 'peer' }); }; G.__simPub = function (ch, d, to) { try { tr.send({ __sim: 1, op: 'pub', channel: ch, data: d, from: G.__simId || null, to: to || null }); } catch (e) {} }; try { tr.send({ __sim: 1, ev: 'ready', id: G.__simId || null, version: VERSION, hasDOM: hasDOM, href: G.location && G.location.href }); } catch (e) {} return handle; }
  function ids() { return Object.keys(registry); }
  function get(id) { return registry[id] || null; } function has(id) { return !!registry[id]; }
  function each(fn) { return ids().map(function (id) { return fn(registry[id], id); }); }
  function map() { return each(function (s) { return s.report ? s.report() : { id: s.id, kind: s.kind }; }); }
  function report() { var by = {}; ids().forEach(function (id) { by[registry[id].kind] = (by[registry[id].kind] || 0) + 1; }); return { count: ids().length, byKind: by, watchdog: !!watchdogTimer, sims: map() }; }
  function command(id, action, opts) { var s = registry[id]; if (!s) return Promise.resolve({ ok: 0, error: 'no sim: ' + id }); return s.one(action, opts); }
  function commandAll(list, action, opts) { return Promise.all((list || ids()).map(function (id) { return command(id, action, opts); })); }
  function broadcast(action, opts) { return commandAll(ids(), action, opts); }
  function kill(x) { var list; if (x == null) list = ids(); else if (typeof x === 'string') list = registry[x] ? [x] : ids().filter(function (id) { return id.indexOf(x) === 0; }); else if (x instanceof RegExp) list = ids().filter(function (id) { return x.test(id); }); else if (Array.isArray(x)) list = x.slice(); else if (typeof x === 'function') list = ids().filter(function (id) { return x(registry[id], id); }); else if (x && x.id) list = [x.id]; else list = []; var n = 0; list.forEach(function (id) { if (registry[id]) { try { registry[id].destroy(); } catch (e) {} n++; } }); return n; }
  function killAll() { return kill(null); } function alive() { return ids().length; }
  function gc() { var n = 0; ids().forEach(function (id) { var s = registry[id], rm = false; try { if (s.isDead()) rm = true; else if (s.ttl && now() - s.createdAt > s.ttl) rm = true; else { var it = optOf(s.opts, 'idleTimeout'); if (it && now() - s.lastUsed > it) rm = true; } } catch (e) { rm = true; } if (rm) { try { s.destroy(); } catch (e) {} n++; } }); if (!ids().length) watchdog(false); return n; }
  function watchdog(on, ms) { if (ms) gcMs = ms; if (watchdogTimer) { pull(TRACK.timers, watchdogTimer); clearInterval(watchdogTimer); watchdogTimer = 0; } if (on === false) return false; watchdogTimer = setInterval(gc, gcMs || DEFAULTS.gcInterval); TRACK.timers.push(watchdogTimer); return true; }
  function on(k, f) { return EV.on(k, f); }
  // the same time call on every sim, e.g. SIM.timeAll('speed', 4) or SIM.timeAll('pause')
  function timeAll(co, ms) { return Promise.all(ids().map(function (id) { var t = registry[id].time; return t && t[co] ? t[co](ms) : { ok: 0, error: 'no time op: ' + co }; })); }
  function acquire(spec) { return make(Object.assign({}, spec, { replace: true })); }
  function purge() {
    try { killAll(); } catch (e) {}
    TRACK.iframes.splice(0).forEach(function (f) { try { f.remove(); } catch (e) {} });
    TRACK.workers.splice(0).forEach(function (w) { try { w.terminate(); } catch (e) {} });
    TRACK.urls.splice(0).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    TRACK.timers.splice(0).forEach(function (t) { try { clearInterval(t); clearTimeout(t); } catch (e) {} });
    bus.transports.splice(0).forEach(function (t) { try { t.close && t.close(); } catch (e) {} });
    TRACK.polls.splice(0).forEach(function (h) { try { h.close(); } catch (e) {} }); for (var rk in reserving) delete reserving[rk];
    bus.subscribers.length = 0; for (var k in registry) delete registry[k]; watchdog(false); panel(false); PANEL_T = 0;
    return true;
  }
  function clearAll() { return purge(); }
  function panel(on) {
    if (!hasDOM) return null;
    var el = document.getElementById('simPanel');
    if (on === false) { if (PANEL_T) { clearInterval(PANEL_T); PANEL_T = 0; } if (el) el.remove(); return null; }
    if (el) return el;
    el = document.createElement('div'); el.id = 'simPanel';
    el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99999;background:#111;color:#ddd;border:1px solid #333;border-radius:8px;padding:8px;font:11px monospace;max-height:40vh;overflow:auto';
    document.body.appendChild(el);
    function render() { if (!document.body.contains(el)) return; el.innerHTML = '<b>SIM ' + VERSION + '</b> · ' + alive() + '<br>' + map().map(function (m) { var e = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }; return e(m.id) + ' [' + e(m.kind) + ']' + (m.dead ? ' 💀' : '') + ' <a href="#" data-kill="' + e(m.id) + '">kill</a>'; }).join('<br>'); }
    el.addEventListener('click', function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-kill')) { kill(t.getAttribute('data-kill')); render(); } });
    PANEL_T = setInterval(render, 1000); TRACK.timers.push(PANEL_T); render(); return el;
  }
  function expect(actual) { return { toBe: function (x) { if (actual !== x) throw Error('expect ' + JSON.stringify(x) + ' got ' + JSON.stringify(actual)); return true; }, toEqual: function (x) { if (JSON.stringify(actual) !== JSON.stringify(x)) throw Error('expect ' + JSON.stringify(x)); return true; }, toBeTruthy: function () { if (!actual) throw Error('expect truthy'); return true; }, toContain: function (x) { if (String(actual).indexOf(x) < 0) throw Error('expect contain ' + x); return true; } }; }
  function configure(o) { merge(DEFAULTS, o || {}); return DEFAULTS; }
  function config(k, v) { if (k == null) return DEFAULTS; if (v === undefined) return DEFAULTS[k]; DEFAULTS[k] = v; return v; }
  function persist(on) { var key = DEFAULTS.persistKey || 'sim_config'; if (on === false) { try { G.localStorage.removeItem(key); } catch (e) {} return false; } try { var c = {}; for (var k in DEFAULTS) if (own(DEFAULTS, k) && k !== 'console' && typeof DEFAULTS[k] !== 'function') c[k] = DEFAULTS[k]; G.localStorage.setItem(key, JSON.stringify(c)); return true; } catch (e) { return false; } }
  function loadConfig() { try { merge(DEFAULTS, JSON.parse(G.localStorage.getItem(DEFAULTS.persistKey || 'sim_config') || '{}')); } catch (e) {} return DEFAULTS; }
  function stats() { return { version: VERSION, sims: ids().length, iframes: TRACK.iframes.length, workers: TRACK.workers.length, urls: TRACK.urls.length, timers: TRACK.timers.length, polls: TRACK.polls.length, transports: bus.transports.length, watchdog: !!watchdogTimer, simsDetail: map() }; }
  try { G.addEventListener('pagehide', function () { purge(); }); } catch (e) {}
  var SIM = {
    VERSION: VERSION, SID: SID, hasDOM: hasDOM, DEFAULTS: DEFAULTS,
    make: make, remote: remote, connect: connect, serve: serve, agent: agentSource, agentUrl: agentUrl, transport: transportFrom,
    bus: bus, inputs: { add: inputsAdd }, addInput: inputsAdd,
    ids: ids, list: ids, get: get, has: has, each: each, map: map, report: report,
    command: command, commandAll: commandAll, broadcast: broadcast,
    kill: kill, killAll: killAll, alive: alive, timeAll: timeAll, gc: gc, watchdog: watchdog, on: on, onChange: on, acquire: acquire,
    purge: purge, clearAll: clearAll, dropNs: dropNs, namespaces: namespaces, compileIso: compileIso, isoFeatures: ISO_FEATURES, sweep: sweep, presets: PRESETS, isoModes: ISO_MODES, panel: panel, expect: expect, configure: configure, config: config,
    persist: persist, loadConfig: loadConfig, random: rng, stats: stats, TRACK: TRACK,
    load: function (u) { return fetchText(u).then(function (t) { try { return JSON.parse(t); } catch (e) { return t; } }); },
    revoke: function (u) { try { URL.revokeObjectURL(u); } catch (e) {} },
    registry: registry,
    util: { sleep: sleep, clamp: clamp, merge: merge, sse: function (frames) { var body = frames.map(function (f) { if (f === '[DONE]') return 'data: [DONE]\n\n'; if (typeof f === 'string') return /^data:/.test(f) ? (f.charAt(f.length - 1) === '\n' ? f : f + '\n\n') : ('data: ' + f + '\n\n'); return 'data: ' + JSON.stringify(f) + '\n\n'; }).join(''); return { status: 200, headers: { 'content-type': 'text/event-stream' }, body: body }; }, json: function (o, s) { return { status: s || 200, headers: { 'content-type': 'application/json' }, body: o }; }, text: function (t, s) { return { status: s || 200, body: t }; } }
  };
  SIM.readme = [
    "====================================================================",
    " SIM (simulator4) — hand-over notes. SIM.readme holds this text; SIM.help('topic' | number)",
    " prints one section. Version: SIM.VERSION.",
    "====================================================================",
    "",
    "0. WHAT IT IS",
    " - Load this file once in any page -> window.SIM. SIM.make(spec) runs a page or script as a",
    "   \"sim\" (iframe, worker, new tab or remote peer) that you can drive, observe and destroy.",
    " - Mental model: a sim = a realm + one command channel + a policy. Every command goes through",
    "   sim._call(op), so timeout / retry / abort / metrics behave the same everywhere.",
    " - Before the page's own code, every sim page gets a \"prelude\": log capture, storage isolation,",
    "   the clock, and a network layer (routes, offline, proxy) for fetch, XHR and WebSocket.",
    " - Plain ES5-style, sloppy code. Loading the same version again returns the loaded SIM;",
    "   another version purges the old one first.",
    " - Most calls resolve to { ok: 1, value } or { ok: 0, error } and never throw. Exceptions:",
    "   info / logs / errs return raw values; make() rejects only for a bad spec.",
    "",
    "1. QUICK START",
    "   var sim = await SIM.make({ url: 'app.html', clock: 1 });  // or { html: '<!doctype html>...' }",
    "   await sim.appEval('typeof someClosureVar');     // inside the app's own scope (bridge)",
    "   await sim.run('document.title');                // in the sim's global scope",
    "   sim.route(/api\\./, function (url, input, ctx) { return SIM.util.json({ ok: 1 }); });",
    "   await sim.act([{ type: ['#input', 'hi'] }, { click: '#send' }, { waitFor: '!!document.querySelector(\".reply\")' }]);",
    "   await sim.time.speed(10);                        // everything in the page runs 10x faster",
    "   (await sim.logs()); sim.report(); sim.destroy(); // or SIM.killAll() / SIM.purge()",
    "",
    "2. make(spec)",
    "   spec: html string | url string | { html } | { url } | { src } (plain iframe, nothing injected,",
    "   \"limited\") | { node } | { doc } | { fn } | a function returning one of these.",
    "   Options (anything left out comes from SIM.DEFAULTS; a spec value always wins):",
    "     id, replace (destroy the sim with this id first), force (ignore maxSims)",
    "     runtime 'iframe' (default) | 'worker' | 'tab' | 'remote'          -> 3",
    "     clock                                                             -> 8",
    "     isolate, ns, keep                                                 -> 5",
    "     bridge, bridgeCode, bridgePattern, console, preset, allowConsoleEval -> 4",
    "     edit, prepend, append (change the page before it runs)            -> 2c",
    "     proxy, proxyMode, proxyStagger, proxyRequests, csp, rocketLoader  -> 2b",
    "     base (<base href>; a url spec sets it), width, height, sandbox ('auto')",
    "     readyTimeout (make() resolves anyway after it), readyFor (a condition as in 6; sets",
    "       sim.readyForOk), ttl, logs (-> 11), trackStable, actionTimeout, retry, backoff",
    "     worker: code (run at start). remote: transport (-> 9).",
    "   make() resolves even if readiness timed out: check sim.report().ready / sim.readyForOk.",
    "",
    "2b. LOADING A URL",
    "   The direct fetch comes first. If it fails (usually CORS) and spec.proxy is set, proxies race:",
    "   the first starts at once, the others after proxyStagger ms ([200, 800, 1000]); a failure",
    "   starts the next at once. The first good reply wins and the rest are aborted.",
    "     proxy: 'https://p.example/?url=' | { url, getOnly, name } | a list. A prefix ending in ?",
    "       or = gets the target url-encoded, otherwise the target is appended. A JSON reply",
    "       { contents } is unwrapped.",
    "     proxyMode 'fallback' | 'always' (skip the direct fetch).",
    "     proxyRequests 'auto' (the page's own cross-origin fetch / XHR use the same proxy when the",
    "       page was loaded through one; getOnly proxies are swapped for non-GET) | true | false.",
    "   If everything fails, the url loads as a plain iframe src (\"limited\": no prelude, no ops).",
    "   report().load = { via: 'direct'|'proxy'|'src', proxy, errors, error, kind:",
    "     'cors'|'offline'|'unreachable' }. Event 'loadFailed'.",
    "   Page fixes (also in child frames): csp 'strip' (default) switches off <meta> CSP tags;",
    "   rocketLoader 'undo' (default) runs Cloudflare Rocket Loader scripts normally.",
    "",
    "2c. EDITING THE PAGE (iframe and tab; applied again on every navigation)",
    "   edit: function (html, { url, navigation }) -> html | [find, replace] | a list of them.",
    "     find: a string (every occurrence) or a RegExp (use /g for all). replace: a string or",
    "     function, as in String.replace. Runs first, on the raw source. Errors are skipped and",
    "     listed in report().editErrors (event 'editError').",
    "   prepend: code that runs before the page's own scripts (right after the sim prelude, so the",
    "     clock, routes and isolation are already there). append: code at the end of <body> (after",
    "     the page's scripts, before DOMContentLoaded). Each: a code string | { src: url } |",
    "     { html: markup } | a list.",
    "   Example: { url: u, prepend: 'window.DEBUG = true', append: { src: 'patch.js' },",
    "     edit: [[/\"use strict\";?/g, ''], function (h) { return h.replace('<title>', '<title>SIM ') }] }",
    "",
    "3. RUNTIMES",
    "   iframe  default. Same-origin srcdoc: full DOM (sim.win(), doc(), el(sel), all(sel),",
    "           fire(node, type)), routes, offline, isolation, navigate(url).",
    "   tab     window.open + BroadcastChannel. sim.win is the Window. Popup blockers can stop it.",
    "   worker  no DOM: run / clock / logs work, dom and appEval do not.",
    "   remote  any transport; the other side runs SIM.serve(...) or SIM.agent(opts) source.",
    "",
    "4. RUNNING CODE",
    "   sim.run(code)          eval in the global scope.",
    "   sim.appEval(code)      eval inside the app's scope through the bridge window.__app.run,",
    "                          injected right after the first \"(async () => {\", \"(function(){\" or",
    "                          \"(() => {\" of an inline script (bridgePattern / bridgeCode to change;",
    "                          bridge:false to turn off). An expression returns its value;",
    "                          statements need an explicit \"return x\".",
    "                          The bridge never changes the app's mode: it goes after a leading",
    "                          \"use strict\". To make an app sloppy, remove the directive with edit (2c).",
    "   sim.loadIntoApp(u) / sim.loadScript(u)   u = url (x.js, ./x.js, https://...) or code text.",
    "   report().bridge: 'ok' | 'missing' (no pattern matched) | 'lost' (never ran) | 'off'.",
    "   The bridge only reaches inline scripts; an app in an external .js needs another way in.",
    "   No bridge: appEval can drive the page's own eval console with allowConsoleEval:true and a",
    "   console adapter { toggle, open, input, run, out, box, waits } or preset: 'aiChat'.",
    "",
    "5. ISOLATION (default: the sim shares nothing with the real page)",
    "   Features: localStorage, sessionStorage, cookies, indexedDB, broadcast, caches, locks, history.",
    "   isolate: true | false | { feature: VALUE, navigation, childFrames, popups, workers,",
    "     serviceWorker, cookieStore, storageBuckets, opfs, onLost }",
    "   VALUE: true (private) | false (real) | 'ns' (shared namespace) | a Map/Storage-like store |",
    "     { ns, prefix, pass (names that stay real), map (rename), seed, store, keep, impl, absent,",
    "       quota, realEvents }. indexedDB seed: { Db: { version, stores: { s: { k: v } |",
    "       { records: [[k, v]] } | { keyPath, records, indexes } } } } (only creates missing dbs).",
    "   ns: 'group' shares stores between sims like tabs of one browser (sessionStorage and history",
    "   stay per sim). keep: true keeps data after destroy. SIM.dropNs(ns), SIM.namespaces(),",
    "   SIM.sweep({ dryRun, shared }) clean up. SIM.compileIso(spec) shows the resolved plan.",
    "   Escape routes: navigation 'virtual' (default: links, forms, location changes reload inside",
    "   the sim through routes) | 'block' | 'allow'; childFrames 'isolate' | 'block' | 'allow';",
    "   popups 'block' | 'allow'; workers 'isolate' | 'allow'; serviceWorker 'block' | 'allow';",
    "   onLost 'blank' | 'destroy' | 'report' (a page without the prelude loaded anyway).",
    "   report().isolation / isolatedAll / lost. Isolation stops accidents, not hostile code.",
    "",
    "6. ACTIONS: sim.one(a) / sim.act([a, ...], { timeout }) / SIM.command(id, a) / SIM.broadcast(a)",
    "   { click: sel } { type: [sel, text], clear } { press: [sel, key], init } { select: [sel, v] }",
    "   { focus: sel } { append: html } { eval: code } { appEval: code } { loadScript: u }",
    "   { loadIntoApp: u } { wait: ms } { waitFor: cond } { assert: cond } { waitForNetworkIdle: 1 }",
    "   { waitForStable: 1 } { offline: bool } { clock: ms } { speed: x } { navigate: url }",
    "   { publish: [channel, data] } { log: x } { do: function (sim) {} } or a function.",
    "   Raw ops: { op: 'blur'|'clear'|'submit'|'scroll'|'dispatch'|'remove'|'value'|'checked'|",
    "   'text'|'html'|'attr'|'count'|'visible', sel, ... }. Shortcuts: sim.value/text/count(sel).",
    "   cond: 'expr' (global scope) | { app: 'expr' } (bridge) | function (sim) (may be async).",
    "",
    "7. NETWORK (iframe and tab sims)",
    "   sim.route(pattern, handler, { method, times }) -> id. pattern: substring | RegExp | null.",
    "     First match wins. handler(url, input, ctx) with ctx { win, init, body, method, headers }",
    "     returns a Response | string | { status, headers, body, delay } (object body = JSON) or a",
    "     promise of one. Helpers: SIM.util.json(o, status), text(t, status), sse([frames]).",
    "     Covers fetch AND XMLHttpRequest (all responseTypes, events, abort; sync XHR when the",
    "     handler answers at once). Delays run on the sim clock.",
    "   sim.routeWs(pattern, handler, { delay, times }) -> id: fake WebSocket server.",
    "     handler(peer, ctx); return false to refuse. peer: send(d), close(code, reason), fail(code),",
    "     on('open'|'message'|'close', fn), received[], readyState. The page's socket is",
    "     instanceof WebSocket with normal events.",
    "   sim.offline(true) fails fetch, XHR and new WebSockets. sim.unroute(id), unrouteWs(id),",
    "   clearRoutes(). sim.waitForNetworkIdle(timeout, quiet). EventSource is not routed.",
    "",
    "8. TIME: sim.time (alias sim.clock)",
    "   Wall clock (Date, new Date(), Date()) = monotonic clock (timers, performance.now, rAF,",
    "   event.timeStamp) + offset.",
    "   spec.clock: true (paused) | a number (speed; 1 = real time, but controllable) |",
    "     { speed, time (start date), offset (ms), media, raf, events, maxCatchUp }.",
    "   speed(x) (0 = pause), pause(), resume(), advance(ms) (fires due timers in order; Date is",
    "   exact inside each), set(date) and shift(ms) (Date only, timers untouched), now(), perf(),",
    "   pending(), state(). report().time. SIM.timeAll('speed', 4).",
    "   Media follows: audio/video rate (1/16..16, paused at 0), CSS/Web animations, Web Audio.",
    "   Child frames and page-made workers follow when clock is set at make (worker isolation on).",
    "   Navigation keeps the clock. Without spec.clock the first call installs it (advance ->",
    "   paused, others -> speed 1); timers made earlier stay real.",
    "",
    "9. MESSAGING / REMOTE",
    "   SIM.bus publish(ch, data) / subscribe(ch, fn); sim.publish / sim.on.",
    "   Transports: { type: 'worker', worker } | 'broadcast' { name } | 'ws' { url, reconnectMs,",
    "   heartbeat } | 'sse' { url, post } | 'window' { target, origin } | { send, on, close }.",
    "   SIM.remote(cfg, id) / connect(tr, id) drive a peer; SIM.serve(cfg, id) makes this page",
    "   drivable. SIM.addInput({ type: 'poll', url, interval, channel }) feeds the bus.",
    "   'parent'-type agents accept commands from any window: use 'window' with origin for",
    "   untrusted pages.",
    "",
    "10. LIFECYCLE",
    "   SIM.ids(), get(id), has(id), each(fn), map(), report(), stats(), alive().",
    "   SIM.kill(exact id | RegExp | array | fn | sim), killAll(), purge() (everything, including",
    "   blob urls, timers, polls), gc() / watchdog() (ttl, idleTimeout, dead sims).",
    "   sim.destroy(), onDestroy(fn), timeout(ms), abort(), signal().",
    "   Every op takes { timeout (0 = none), signal, retry, backoff }. SIM.panel(true) = live list.",
    "",
    "11. DIAGNOSTICS",
    "   sim.logs() / sim.errs(): the sim's own console and errors from before its first script",
    "   (never the parent's); readable after destroy for iframe and tab sims.",
    "   logs policy: { maxEntries, keepHead, maxEntryChars, maxTotalChars, collapseRepeats,",
    "   collapseWindow, headRatio } (repeats become \"line (xN)\", drops leave one marker line).",
    "   sim.metrics(), trace(true), record() / replay(), report(). Events via SIM.on: add, remove,",
    "   op, versionMismatch, bridgeMissing, loadFailed, navigate, navigateError, isolationLost,",
    "   popupBlocked, ...",
    "",
    "12. CONFIG",
    "   SIM.configure({...}) deep-merges into DEFAULTS; SIM.config(k, v); persist() / loadConfig()",
    "   (localStorage key DEFAULTS.persistKey). SIM.presets holds named spec parts.",
    "   Changing SIM.* functions does not change internal calls: use DEFAULTS or spec options.",
    "",
    "13. TIPS FOR WHOEVER TAKES OVER",
    " - Start with report(): ready, bridge, isolation, load, time, lost tell you most problems.",
    " - appEval failing with \"no __app bridge\": the app's code is external or has no IIFE; use",
    "   bridgePattern, or run/loadScript on globals.",
    " - A test that waits on timers in a paused clock hangs: advance() or speed() it. Route delays",
    "   and page setTimeout are both on that clock.",
    " - Tests that must not touch real data: keep isolate on (default); pass: [...] only the keys",
    "   you really need (e.g. API keys).",
    " - Clean runs: SIM.purge() between suites; SIM.sweep() after crashes."
  ].join('\n');
  SIM.help = function (topic) { var t = SIM.readme; if (topic != null) { var q = String(topic).toLowerCase(), parts = t.split(/\n(?=\s{0,2}\d+\. )/), head = parts.filter(function (p) { var h = p.split('\n')[0].toLowerCase(); return /^\d+$/.test(q) ? new RegExp('^\\s{0,2}' + q + '\\.').test(h) : h.indexOf(q) >= 0; }), hit = head.length ? head : parts.filter(function (p) { return p.toLowerCase().indexOf(q) >= 0; }); t = hit.length ? hit.join('\n') : ('no section matches: ' + topic); } try { console.log(t); } catch (e) {} return t; };
  if (DEFAULTS.panel) { try { setTimeout(function () { panel(true); }, 0); } catch (e) {} }
  return SIM;
})();
try { window.SIM = SIM; window.simulate = function (s) { return SIM.make(s); }; } catch (e) {}
try { if (typeof module !== 'undefined' && module.exports) module.exports = SIM; } catch (e) {}
