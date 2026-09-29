/* ============================================================================
   sim.js v4.3.1 (claudeeditC2) — self-managing simulation builder: v4, fixed and condensed.
   A sim = a realm (iframe | tab | worker | remote) + one op table (OPS),
   reached directly (iframe) or over a message link (everything else).
   - idempotent load (same version reused; an older one is purged)
   - app scope via an INJECTED BRIDGE (window.__app.run); the app's eval console
     is only driven when allowConsoleEval is set, and it is closed afterwards
   - resources tracked (iframes/workers/urls/timers) + SIM.purge()/stats()
   - caps (maxSims/maxLogs/maxQueue/maxMessage), retry/backoff, cancel(signal),
     version handshake, virtual clock, record/replay, route(delay/offline)
   ============================================================================ */
var SIM = (function () {
  var VERSION = '4.3.1';
  if (typeof window !== 'undefined' && window.SIM && window.SIM.VERSION === VERSION) return window.SIM;
  try { if (typeof window !== 'undefined' && window.SIM && window.SIM.purge) window.SIM.purge(); } catch (e) {}
  var G = typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this;
  var hasDOM = typeof document !== 'undefined' && !!document.createElement;
  var SID = Math.random().toString(36).slice(2, 7);
  var seq = 0, registry = {}, watchdogTimer = 0, PANEL_T = 0;
  // every resource is tracked with the way to free it: hold() returns its release, purge() frees them all
  var TRACK = { iframes: [], workers: [], urls: [], timers: [] };
  var FREE = { iframes: function (f) { f.remove(); }, workers: function (w) { w.terminate(); }, urls: function (u) { URL.revokeObjectURL(u); }, timers: function (t) { clearInterval(t); clearTimeout(t); } };
  var BRIDGE_PATTERNS = [/\(\s*async\s*\(\s*\)\s*=>\s*\{/, /\(\s*function\s*\(\s*\)\s*\{/, /\(\s*\(\s*\)\s*=>\s*\{/];
  var DEFAULTS = {
    runtime: 'iframe', isolate: true, base: '', width: 1024, height: 768,
    readyTimeout: 20000, actionTimeout: 15000, idleTimeout: 0, ttl: 0,
    autoGc: true, gcInterval: 5000, maxSims: 0, maxLogs: 2000, maxQueue: 500, maxMessage: 4e6,
    sandbox: 'allow-scripts allow-same-origin', strictVersion: false, routeById: true, retry: 0, backoff: 200,
    autoAbort: true, heartbeatMs: 0, traceMax: 500, panel: false, clock: false,
    trackStable: false, allowConsoleEval: false, bridge: true, bridgeCode: 'window.__app={run:function(c){c=String(c);var N=String.fromCharCode(10),x=true;try{new Function("return ("+c+N+")")}catch(e){x=false}return x?eval(c):eval("(function(){"+c+N+"})()")},v:1};',
    console: { toggle: '#evalLock', open: '#openEvalBtn', input: '#EI', run: '#ERun', out: '#EO' }
  };

  // ---- small helpers ----
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function now() { return Date.now(); }
  function uid(p) { return (p || 'x') + '_' + SID + '_' + (++seq); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isPlain(x) { return Object.prototype.toString.call(x) === '[object Object]'; }
  function merge(a) { a = a || {}; for (var i = 1; i < arguments.length; i++) { var b = arguments[i]; for (var k in b) if (own(b, k)) a[k] = isPlain(b[k]) && isPlain(a[k]) ? merge({}, a[k], b[k]) : b[k]; } return a; }
  function remove(list, x) { var i = list.indexOf(x); if (i >= 0) list.splice(i, 1); }
  function J(x) { return JSON.stringify(x); }
  function optOf(src, k) { return src[k] === undefined ? DEFAULTS[k] : src[k]; }
  function norm(o) { return o == null ? {} : typeof o === 'number' ? { timeout: o } : o; }
  function fetchText(u) { return fetch(u).then(function (r) { if (!r.ok) throw Error('HTTP ' + r.status + ' ' + u); return r.text(); }); }
  function looksHtml(s) { return /^\s*</.test(s) || /<html[\s>]|<!doctype/i.test(s); }
  function asSource(u) { u = String(u); return /^(https?:|data:|blob:)\S*$/i.test(u) ? fetchText(u) : Promise.resolve(u); }
  function hold(kind, x) { TRACK[kind].push(x); return function () { remove(TRACK[kind], x); try { FREE[kind](x); } catch (e) {} }; }
  function blobUrl(text, type, free) { var u = URL.createObjectURL(new Blob([text], { type: type })), f = hold('urls', u); if (free) free.push(f); return u; }
  function emitter() {
    var m = {};
    return {
      on: function (k, f) { (m[k] || (m[k] = [])).push(f); return function () { remove(m[k] || [], f); }; },
      emit: function (k) { var args = [].slice.call(arguments, 1); (m[k] || []).slice().forEach(function (f) { try { f.apply(null, args); } catch (e) {} }); }
    };
  }
  var EV = emitter();
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function attempt(make, o) {
    var tries = ((o.retry == null ? DEFAULTS.retry : o.retry) | 0) + 1, d = o.backoff == null ? DEFAULTS.backoff : o.backoff;
    function go(n) { return Promise.resolve().then(make).catch(function (e) { if (n <= 1) throw e; return sleep(d * Math.pow(2, tries - n)).then(function () { return go(n - 1); }); }); }
    return go(tries);
  }
  // one guard for timeouts and cancellation; always removes its timer and abort listener
  function guard(p, o) {
    var s = o.signal, t = 0, done = false;
    return new Promise(function (res, rej) {
      function end(f, v) { if (done) return; done = true; clearTimeout(t); if (s) try { s.removeEventListener('abort', abort); } catch (e) {} f(v); }
      function abort() { end(rej, Error('aborted')); }
      if (s) { if (s.aborted) return abort(); try { s.addEventListener('abort', abort); } catch (e) {} }
      if (o.ms > 0) t = setTimeout(function () { end(rej, Error('sim timeout: ' + (o.name || ''))); }, o.ms);
      Promise.resolve(p).then(function (v) { end(res, v); }, function (e) { end(rej, e); });
    });
  }

  // ======== realm side: everything below until "host side" is also stringified into pages and agents ========

  // virtual clock over a realm's Date/performance/timers
  function clockInstall(S) {
    if (S.__simClock) return S.__simClock;
    var vnow = S.Date.now(), timers = {}, cs = 1e9, rct = S.clearTimeout, rci = S.clearInterval;
    function add(per) { return function (fn, ms) { var id = cs++; timers[id] = { at: vnow + (ms || 0), fn: fn, a: [].slice.call(arguments, 2), per: per ? (ms || 1) : 0 }; return id; }; }
    function clr(real) { return function (id) { if (timers[id]) delete timers[id]; else try { real.call(S, id); } catch (e) {} }; }
    function fire(t) { for (var id in timers) { var x = timers[id]; if (x.at > t) continue; if (!x.per) delete timers[id]; do { try { x.fn.apply(null, x.a); } catch (e) {} x.at += x.per; } while (x.per && x.at <= t && timers[id]); } }
    S.Date.now = function () { return vnow; };
    try { if (S.performance) S.performance.now = function () { return vnow; }; } catch (e) {}
    S.setTimeout = add(false); S.setInterval = add(true); S.clearTimeout = clr(rct); S.clearInterval = clr(rci);
    return (S.__simClock = {
      advance: function (ms) { var t = vnow + (ms || 0); for (var g = 0; g < 1e5; g++) { var nx = null; for (var id in timers) if (timers[id].at <= t && (nx === null || timers[id].at < nx)) nx = timers[id].at; if (nx === null) break; vnow = nx; fire(nx); } vnow = t; return vnow; },
      set: function (ms) { vnow = ms; return vnow; },
      now: function () { return vnow; },
      pending: function () { return Object.keys(timers).length; }
    });
  }
  // the realm's OWN console and errors, captured once (into S.__simLogs / S.__simErrs)
  function capture(S, max) {
    if (S.__simCap) return S.__simCap;
    var logs = S.__simLogs = [], errs = S.__simErrs = [], C = S.console || {};
    max = max || 2000;
    function push(a, s) { a.push(s); if (a.length > max) a.splice(0, a.length - max); }
    function str(x) { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return String(x); } }
    ['log', 'warn', 'error', 'info'].forEach(function (k) {
      var o = C[k] ? C[k].bind(C) : function () {};
      C[k] = function () { try { push(logs, k + ': ' + [].map.call(arguments, str).join(' ')); } catch (e) {} return o.apply(null, arguments); };
    });
    if (S.addEventListener) {
      S.addEventListener('error', function (e) { push(errs, String(e.message || e.error)); });
      S.addEventListener('unhandledrejection', function (e) { push(errs, 'rej:' + String((e.reason && e.reason.stack) || e.reason)); });
    }
    return (S.__simCap = { logs: logs, errs: errs });
  }
  // the op table: every op takes one message object and returns a value (or a promise)
  function OPS(scope, opts) {
    opts = opts || {};
    var doc = scope.document || null, maxM = opts.maxMessage || 4e6, cap = capture(scope, opts.maxLogs);
    var CA = opts.consoleAdapter || {};
    function fire(n, t, i) { try { n.dispatchEvent(new scope.Event(t, Object.assign({ bubbles: true, cancelable: true }, i || {}))); } catch (e) {} }
    function edited(n) { fire(n, 'input'); fire(n, 'change'); }
    function q(s) { return doc ? doc.querySelector(s) : null; }
    // element actions: run when the element exists; the op returns whether it did
    var ACT = {
      click: function (n) { n.click(); },
      type: function (n, a) { n.value = (a.clear === false ? n.value : '') + a.text; edited(n); },
      clear: function (n) { n.value = ''; edited(n); },
      focus: function (n) { if (n.focus) n.focus(); },
      blur: function (n) { if (n.blur) n.blur(); },
      press: function (n, a) { ['keydown', 'keypress', 'keyup'].forEach(function (t) { fire(n, t, { key: a.key }); }); },
      select: function (n, a) { if ('value' in n) { n.value = a.value; fire(n, 'change'); } },
      submit: function (n) { if (n.requestSubmit) n.requestSubmit(); else fire(n, 'submit'); },
      scroll: function (n, a) { if (n.scrollIntoView) n.scrollIntoView(a.arg || true); },
      dispatch: function (n, a) { fire(n, a.type, a.init); },
      remove: function (n) { if (n.parentNode) n.parentNode.removeChild(n); }
    };
    // element reads: null when the element is missing (visible: false)
    var READ = {
      value: function (n) { return 'value' in n ? n.value : null; },
      checked: function (n) { return !!n.checked; },
      text: function (n) { return n.textContent; },
      html: function (n) { return n.innerHTML; },
      attr: function (n, a) { return n.getAttribute(a.name); },
      visible: function (n) { var r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
    };
    function dom(a) {
      if (!doc) throw Error('no DOM in runtime');
      if (a.op === 'count') return doc.querySelectorAll(a.sel).length;
      if (a.op === 'append') { if (doc.body) doc.body.insertAdjacentHTML('beforeend', a.html); return true; }
      var f = ACT[a.op] || READ[a.op], n;
      if (!f || !Object.prototype.hasOwnProperty.call(ACT[a.op] ? ACT : READ, a.op)) throw Error('unknown dom op: ' + a.op);
      n = q(a.sel);
      if (ACT[a.op]) { if (n) f(n, a); return !!n; }
      return n ? f(n, a) : (a.op === 'visible' ? false : null);
    }
    // app scope: the injected bridge, or (opt-in) the app's own eval console
    function appEval(m) {
      if (scope.__app && typeof scope.__app.run === 'function') return Promise.resolve(scope.__app.run(m.code)).then(function (v) { return { ok: 1, value: v, via: 'bridge' }; });
      if (!m.allowConsoleEval) throw Error('no __app bridge; console eval disabled (set allowConsoleEval)');
      if (!doc) throw Error('no DOM');
      var t = q(CA.toggle);
      if (t) { try { if ('checked' in t) t.checked = true; edited(t); } catch (e) {} }
      return sleep(80).then(function () { var o = q(CA.open); if (o) try { o.click(); } catch (e) {} return sleep(m.delay || 160); }).then(function () {
        var inp = q(CA.input), run = q(CA.run), out = q(CA.out);
        if (!inp || !run) throw Error('app console missing');
        var before = out ? out.value.length : 0;
        inp.value = m.code; run.click();
        return sleep(90).then(function () {
          var raw = out ? out.value.slice(before).trim() : '', box = doc.getElementById('evalConsole');
          if (box) try { box.remove(); } catch (e) {}
          return { ok: 1, value: raw.split('\n').pop(), via: 'console' };
        });
      });
    }
    var X = function () { return scope.__sim || {}; };
    return {
      ping: function () { return 'pong'; },
      info: function () { return { id: scope.__simId || null, version: opts.version || null, hasDOM: !!doc, hasBridge: !!(scope.__app && scope.__app.run), href: (scope.location && scope.location.href) || null }; },
      run: function (m) { if (String(m.code).length > maxM) throw Error('message too large'); return scope.eval(m.code); },
      logs: function () { return cap.logs.slice(); },
      errs: function () { return cap.errs.slice(); },
      clear: function () { cap.logs.length = 0; cap.errs.length = 0; return true; },
      dom: function (m) { return dom(m.a); },
      appEval: appEval,
      clock: function (m) { var c = clockInstall(scope); return m.co === 'advance' ? c.advance(m.ms) : m.co === 'set' ? c.set(m.ms) : m.co === 'pending' ? c.pending() : c.now(); },
      net: function () { return X().net || 0; },
      stable: function () { return X().mut || 0; },
      offline: function (m) { if (scope.__sim) scope.__sim.offline = !!m.value; return true; },
      pub: function (m) { if (scope.__simOnPub) scope.__simOnPub(m.channel, m.data, m.from, m.to); return true; }
    };
  }
  function call(ops, name, m) {
    return Promise.resolve().then(function () { if (!Object.prototype.hasOwnProperty.call(ops, name)) throw Error('unknown op: ' + name); return ops[name](m || {}); });
  }
  // answers op messages coming over a link (messages without an id get no reply)
  function SERVER(ops, scope, send) {
    return function (m) {
      if (!m || m.__sim !== 1 || !m.op) return;
      if (m.to && m.to !== 'all' && scope.__simId && m.to !== scope.__simId) return;
      call(ops, m.op, m).then(function (v) { if (m.id) send({ __sim: 1, id: m.id, ok: 1, value: v }); },
        function (e) { if (m.id) send({ __sim: 1, id: m.id, ok: 0, error: String((e && e.stack) || e) }); });
    };
  }
  // one message link { send, on, off, close } for every transport, on both ends.
  // Each end stamps its tag on what it sends and ignores its own tag (ends that share one channel).
  function link(cfg, me, S) {
    var hs = [], out, stop, api = { __simTransport: true, kind: cfg.type || 'custom', me: me, closed: false };
    function deliver(m) { if (!m || (m.src && m.src === me)) return; hs.slice().forEach(function (h) { try { h(m); } catch (e) {} }); }
    function parse(e) { var m; try { m = JSON.parse(e.data); } catch (x) {} if (m && m.op !== 'ping') deliver(m); }
    try {
      if (api.kind === 'worker' || api.kind === 'self') {
        var P = api.kind === 'self' ? S : cfg.worker;
        P.onmessage = function (e) { deliver(e.data); };
        out = function (m) { P.postMessage(m); };
        stop = function () { if (P.terminate) P.terminate(); };
      } else if (api.kind === 'broadcast') {
        var bc = new S.BroadcastChannel(cfg.name);
        bc.onmessage = function (e) { deliver(e.data); };
        out = function (m) { bc.postMessage(m); };
        stop = function () { bc.close(); };
      } else if (api.kind === 'window' || api.kind === 'parent') {
        var T = cfg.target || (S.parent && S.parent !== S ? S.parent : S.opener || S);
        var h = function (e) { if (!cfg.origin || e.origin === cfg.origin) deliver(e.data); };
        S.addEventListener('message', h);
        out = function (m) { T.postMessage(m, cfg.origin || '*'); };
        stop = function () { S.removeEventListener('message', h); };
      } else if (api.kind === 'ws') {
        var ws = null, q = [], dead = false, hb = 0, rt = 0, again = cfg.reconnectMs || 1500;
        (function open() {
          if (dead) return;
          try { ws = new S.WebSocket(cfg.url, cfg.protocols); } catch (e) { rt = setTimeout(open, again); return; }
          ws.onmessage = parse;
          ws.onopen = function () { while (q.length) ws.send(q.shift()); if (cfg.heartbeat) hb = setInterval(function () { try { ws.send('{"__sim":1,"op":"ping"}'); } catch (e) {} }, cfg.heartbeat); };
          ws.onclose = function () { clearInterval(hb); if (!dead) rt = setTimeout(open, again); };
        })();
        out = function (m) { var s = JSON.stringify(m); if (ws && ws.readyState === 1) ws.send(s); else { q.push(s); if (q.length > (cfg.maxQueue || 500)) q.shift(); } };
        stop = function () { dead = true; clearTimeout(rt); clearInterval(hb); if (ws) ws.close(); };
      } else if (api.kind === 'sse') {
        var es = new S.EventSource(cfg.url), post = cfg.post || cfg.url;
        es.onmessage = parse;
        out = function (m) { S.fetch(post, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) }).catch(function () {}); };
        stop = function () { es.close(); };
      } else if (cfg.send && cfg.on) {
        cfg.on(deliver); out = cfg.send; stop = cfg.close;
      } else return null;
    } catch (e) { return null; }
    api.send = function (m) { if (api.closed) return; m.src = me; out(m); };
    api.on = function (f) { hs.push(f); return function () { api.off(f); }; };
    api.off = function (f) { var i = hs.indexOf(f); if (i >= 0) hs.splice(i, 1); };
    api.close = function () { if (api.closed) return; api.closed = true; try { if (stop) stop(); } catch (e) {} };
    return api;
  }
  // runs first in every sim page: log capture, isolated localStorage, stability counter, clock, routed fetch
  function prelude(W, o) {
    var X = W.__sim = { routes: [], handlers: {}, net: 0, mut: 0, offline: false }, wait = W.setTimeout.bind(W);
    capture(W, o.maxLogs);
    if (o.isolate) {
      var s = new W.Map(), ls = {
        getItem: function (k) { k = String(k); return s.has(k) ? s.get(k) : null; },
        setItem: function (k, v) { s.set(String(k), String(v)); },
        removeItem: function (k) { s.delete(String(k)); },
        clear: function () { s.clear(); },
        key: function (i) { return Array.from(s.keys())[i] || null; },
        get length() { return s.size; }
      };
      try { Object.defineProperty(W, 'localStorage', { configurable: true, get: function () { return ls; } }); X.hasLS = W.localStorage === ls; } catch (e) { try { W.localStorage = ls; X.hasLS = true; } catch (e2) {} }
    }
    if (o.trackStable && W.MutationObserver) try { new W.MutationObserver(function () { X.mut++; }).observe(W.document.documentElement, { subtree: true, childList: true }); } catch (e) {}
    if (o.clock) clockInstall(W);
    var real = W.fetch && W.fetch.bind(W);
    if (!real) return;
    function toResponse(v) {
      var R = W.Response;
      if (v instanceof R || (v && typeof v.arrayBuffer === 'function' && typeof v.status === 'number')) return v; // a Response, from any realm
      if (typeof v === 'string') return new R(v, { status: 200 });
      if (!v || typeof v !== 'object') return new R('', { status: 200 });
      var b = v.body;
      if (b && typeof b === 'object' && !(b instanceof W.Blob)) try { b = JSON.stringify(b); } catch (e) {}
      return new R(b == null ? '' : b, { status: v.status || 200, headers: v.headers || { 'content-type': 'application/json' } });
    }
    W.fetch = function (input, init) {
      if (X.offline) return Promise.reject(new TypeError('Failed to fetch (sim offline)'));
      var url = typeof input === 'string' ? input : (input && input.url) || String(input);
      var method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      for (var i = 0; i < X.routes.length; i++) {
        var r = X.routes[i], hit = false, out;
        if (r.method && r.method !== method) continue;
        try { hit = r.test(url, input, init); } catch (e) {}
        if (!hit) continue;
        X.net++;
        try { out = X.handlers[r.id](url, input, init); } catch (e) { out = { status: 500, body: 'handler error: ' + e.message }; }
        // the delay uses the page's real timer, so a virtual clock does not hold routed responses
        return new Promise(function (res) { if (out && out.delay) wait(res, out.delay); else res(); })
          .then(function () { return out; }).then(toResponse)
          .then(function (x) { X.net--; return x; }, function (e) { X.net--; throw e; });
      }
      return real(input, init);
    };
  }
  // makes realm S answer ops over link L, runs init, then announces itself (agents and SIM.serve)
  function serveRealm(S, L, opts, onPub, init) {
    var ops = OPS(S, opts), handle = SERVER(ops, S, L.send);
    L.on(handle);
    S.__simOnPub = onPub || S.__simOnPub || function () {};
    S.__simPub = function (ch, d, to) { L.send({ __sim: 1, op: 'pub', channel: ch, data: d, from: S.__simId || null, to: to || null }); };
    if (init) try { S.eval(init); } catch (e) {}
    L.send(Object.assign({ __sim: 1, ev: 'ready' }, ops.info()));
    return handle;
  }
  var REALM_FNS = { sleep: sleep, clockInstall: clockInstall, capture: capture, OPS: OPS, call: call, SERVER: SERVER, link: link, serveRealm: serveRealm, prelude: prelude };
  function realmCode(names) { return names.map(function (k) { return 'var ' + k + '=' + REALM_FNS[k] + ';'; }).join('\n'); }

  // ======== host side ========

  // agent: a script that makes any realm answer ops over a link
  function agentSource(o) {
    o = o || {};
    var cfg = { type: o.type || 'self', name: o.name, url: o.url, heartbeat: o.heartbeat, maxQueue: o.maxQueue };
    var opts = { consoleAdapter: o.consoleAdapter || null, maxMessage: o.maxMessage, maxLogs: o.maxLogs, version: VERSION };
    return [';(function(){', 'var S=typeof self!=="undefined"?self:this;S.__simId=' + J(o.id || null) + ';',
      realmCode(['sleep', 'clockInstall', 'capture', 'OPS', 'call', 'SERVER', 'link', 'serveRealm']),
      o.clock ? 'try{clockInstall(S)}catch(e){}' : '',
      'serveRealm(S,link(' + [J(cfg), J(o.me || o.id || 'peer'), 'S),' + J(opts), 'null', J(o.init || '')].join(',') + ');',
      '})();'].join('\n');
  }
  function agentUrl(o) { return blobUrl(agentSource(o), 'text/javascript'); }
  function transportFrom(cfg, me) {
    if (!cfg) return null;
    if (cfg.__simTransport) return cfg;
    var c = Object.assign({}, cfg);
    if (c.maxQueue == null) c.maxQueue = DEFAULTS.maxQueue;
    if (c.heartbeat == null) c.heartbeat = DEFAULTS.heartbeatMs;
    return link(c, me || uid('c'), G);
  }
  // adapters: how a sim reaches its op table
  function DirectAdapter(getOps, ifr) {
    return { kind: 'direct', ready: Promise.resolve({}), iframe: ifr || null, versionMismatch: false, close: function () {},
      op: function (name, args) { return Promise.resolve().then(getOps).then(function (ops) { return call(ops, name, args); }); } };
  }
  function TransportAdapter(tr) {
    var pending = {}, peer = null, readyRes, readyRej;
    var ad = { kind: tr.kind || 'remote', transport: tr, iframe: null, versionMismatch: false, close: function () { tr.close(); } };
    ad.ready = new Promise(function (res, rej) { readyRes = res; readyRej = rej; });
    ad.ready.catch(function () {});
    tr.on(function (m) {
      if (!m || m.__sim !== 1) return;
      var p = m.id && pending[m.id];
      if (p) { delete pending[m.id]; clearTimeout(p.t); return m.ok ? p.res(m.value) : p.rej(Error(m.error || 'peer error')); }
      if (m.ev !== 'ready' || peer !== null) return;
      peer = m.id || '';
      if (m.version && m.version !== VERSION) {
        ad.versionMismatch = true; EV.emit('versionMismatch', { peer: m.version, self: VERSION });
        if (DEFAULTS.strictVersion) return readyRej(Error('SIM version mismatch: ' + m.version + ' vs ' + VERSION));
      }
      readyRes({ id: m.id, version: m.version, hasDOM: !!m.hasDOM, href: m.href });
    });
    ad.op = function (name, args, timeout) {
      var id = uid('r'), msg = Object.assign({ __sim: 1, op: name, id: id }, args || {});
      if (DEFAULTS.routeById && peer) msg.to = peer;
      return new Promise(function (res, rej) {
        var p = pending[id] = { res: res, rej: rej, t: setTimeout(function () { delete pending[id]; rej(Error('sim timeout: ' + name)); }, timeout || DEFAULTS.actionTimeout) };
        try { tr.send(msg); } catch (e) { delete pending[id]; clearTimeout(p.t); rej(e); }
      });
    };
    return ad;
  }

  // declarative actions: the first key of the action object that is listed here runs
  var DOM_ACTIONS = {
    click: function (v) { return { op: 'click', sel: v }; },
    type: function (v, a) { return { op: 'type', sel: v[0], text: v[1], clear: a.clear }; },
    press: function (v) { return { op: 'press', sel: v[0], key: v[1] }; },
    select: function (v) { return { op: 'select', sel: v[0], value: v[1] }; },
    focus: function (v) { return { op: 'focus', sel: v }; },
    append: function (v) { return { op: 'append', html: v }; }
  };
  var ACTIONS = [
    ['wait', function (s, v) { return sleep(v).then(function () { return { ok: 1 }; }); }],
    ['eval', function (s, v, a) { return s.run(v, a); }],
    ['appEval', function (s, v, a) { return s.appEval(v, a); }],
    ['loadScript', function (s, v) { return s.loadScript(v); }],
    ['loadIntoApp', function (s, v, a) { return s.loadIntoApp(v, a.delay); }],
    ['publish', function (s, v, a) { return { ok: s.publish(v[0], v[1], a.to) }; }],
    ['offline', function (s, v) { return s.offline(v); }],
    ['clock', function (s, v) { return s.clock.advance(v); }]
  ].concat(Object.keys(DOM_ACTIONS).map(function (k) { return [k, function (s, v, a) { return s.action(DOM_ACTIONS[k](v, a), a); }]; }), [
    ['waitForNetworkIdle', function (s, v, a) { return s.waitForNetworkIdle(a.timeout, a.quiet); }],
    ['waitForStable', function (s, v, a) { return s.waitForStable(a.timeout, a.quiet); }],
    ['waitFor', function (s, v, a) { return s.waitFor(v, a.timeout).then(function (ok) { return { ok: !!ok }; }); }],
    ['assert', function (s, v, a) { return s.waitFor(v, a.timeout).then(function (ok) { return { ok: !!ok, assert: v }; }); }],
    ['log', function (s, v) { return { ok: 1, log: v }; }]
  ]);
  function runAction(sim, a) {
    return Promise.resolve().then(function () {
      if (typeof a === 'function') return a(sim);
      if (a.do) return a.do(sim);
      for (var i = 0; i < ACTIONS.length; i++) { var v = a[ACTIONS[i][0]]; if (v != null) return ACTIONS[i][1](sim, v, a); }
      return { ok: 0, error: 'unknown action' };
    }).catch(function (e) { return { ok: 0, error: String(e) }; });
  }

  function Sim(adapter, meta) {
    var sim = {
      id: meta.id, name: meta.id, kind: meta.kind || adapter.kind, ready: adapter.ready, createdAt: now(), lastUsed: now(), ttl: meta.ttl || 0,
      _dead: false, _hooks: [], _m: { ops: 0, errs: 0, ms: 0, byName: {} }, _trace: [], _traceOn: false, _traceMax: DEFAULTS.traceMax, _rec: null, _free: meta.free || [],
      _allowConsoleEval: meta.allowConsoleEval != null ? meta.allowConsoleEval : DEFAULTS.allowConsoleEval,
      _ctl: typeof AbortController !== 'undefined' ? new AbortController() : null
    };
    function touch() { sim.lastUsed = now(); return sim; }
    sim.touch = touch;
    sim.timeout = function (ms) { sim.ttl = ms || 0; sim.createdAt = now(); return sim; };
    sim.alive = function () { return !sim._dead; };
    sim.isDead = function () { return sim._dead || !!(adapter.transport && adapter.transport.closed) || !!(adapter.iframe && adapter.iframe.ownerDocument && !adapter.iframe.ownerDocument.contains(adapter.iframe)); };
    sim.onDestroy = function (f) { sim._hooks.push(f); return sim; };
    sim.onEvent = function (k, f) { return EV.on(k, f); };
    sim.signal = function () { return sim._ctl ? sim._ctl.signal : null; };
    sim.abort = function () { if (!sim._ctl) return false; sim._ctl.abort(); sim._ctl = new AbortController(); return true; };
    sim.metrics = function () { return JSON.parse(JSON.stringify(sim._m)); };
    sim.trace = function (on, max) { sim._traceOn = on !== false; if (max) sim._traceMax = max; return sim._trace; };
    sim._note = function (name, ok, ms) {
      var m = sim._m; m.ops++; m.ms += ms; if (!ok) m.errs++; m.byName[name] = (m.byName[name] || 0) + 1;
      if (sim._traceOn) { sim._trace.push({ op: name, ok: ok ? 1 : 0, ms: ms, t: now() }); if (sim._trace.length > sim._traceMax) sim._trace.shift(); }
      EV.emit('op', sim, { op: name, ok: ok ? 1 : 0, ms: ms });
    };
    // every recorded op goes through here: retry, cancel, metrics, record; result is { ok, value | error }
    sim._call = function (name, args, opts) {
      opts = norm(opts);
      if (sim._dead) return Promise.resolve({ ok: 0, error: 'destroyed' });
      touch();
      var t0 = now(), sig = opts.signal || (DEFAULTS.autoAbort && sim._ctl ? sim._ctl.signal : null);
      return guard(attempt(function () { return adapter.op(name, args, opts.timeout); }, opts), { signal: sig }).then(function (v) {
        sim._note(name, 1, now() - t0); if (sim._rec) sim._rec.push({ op: name, args: args }); return { ok: 1, value: v };
      }, function (e) { sim._note(name, 0, now() - t0); return { ok: 0, error: String((e && e.message) || e) }; });
    };
    sim.run = function (code, o) { return sim._call('run', { code: code }, o); };
    sim.action = function (a, o) { return sim._call('dom', { a: a }, o); };
    sim.offline = function (v) { return sim._call('offline', { value: !!v }); };
    sim.appEval = function (code, o) {
      o = norm(o);
      return sim._call('appEval', { code: code, delay: o.delay, allowConsoleEval: o.allowConsoleEval != null ? o.allowConsoleEval : sim._allowConsoleEval }, o)
        .then(function (r) { return r.ok && r.value && typeof r.value === 'object' && 'ok' in r.value ? r.value : r; });
    };
    sim.loadScript = function (u, o) { return asSource(u).then(function (t) { return sim.run(t, o); }); };
    sim.loadIntoApp = function (u, o) { return asSource(u).then(function (t) { return sim.appEval(t, o); }); };
    // plain reads: the value itself, not wrapped, not recorded
    var RAW = { info: 'info', logs: 'logs', errs: 'errs', clearLogs: 'clear' };
    Object.keys(RAW).forEach(function (k) { sim[k] = function () { touch(); return adapter.op(RAW[k], {}); }; });
    ['value', 'text', 'count'].forEach(function (k) { sim[k] = function (sel, o) { return sim.action({ op: k, sel: sel }, o); }; });
    sim.clock = {};
    ['advance', 'set', 'now', 'pending'].forEach(function (co) { sim.clock[co] = function (ms) { return sim._call('clock', { co: co, ms: ms }); }; });
    sim.publish = function (ch, data, to) { touch(); bus.publish(ch, data, { from: sim.id, to: to }); return true; };
    sim.on = sim.subscribe = function (ch, fn, opt) {
      opt = opt || {};
      return bus.subscribe(ch, function (d, m) { m = m || {}; if (!opt.includeSelf && m.from === sim.id && m.via !== 'peer') return; if (m.to && m.to !== 'all' && m.to !== sim.id) return; fn(d, m); });
    };
    sim.one = function (a) { touch(); return runAction(sim, a); };
    sim.command = function (a) { return sim.one(a); };
    sim.act = function (actions, opts) {
      opts = opts || {}; var out = [];
      var chain = actions.reduce(function (p, a) { return p.then(function () { return sim.one(a).then(function (r) { out.push(r); }); }); }, Promise.resolve()).then(function () { return out; });
      return opts.timeout ? guard(chain, { ms: opts.timeout, name: 'act' }) : chain;
    };
    // one poller for every wait: probe until done(value), a timeout, or destroy
    function poll(probe, done, timeout, every) {
      var T = timeout || DEFAULTS.actionTimeout, t0 = now();
      return new Promise(function (res) {
        (function tick() {
          if (sim._dead) return res(false);
          probe().then(function (v) { if (done(v)) return res(true); if (now() - t0 > T) return res(false); setTimeout(tick, every); }, function () { res(false); });
        })();
      });
    }
    // done once the value has not changed (and was not busy) for Q ms
    function steady(Q, busy) { var last = {}, since = 0; return function (v) { if (busy(v) || v !== last) { last = v; since = now(); return false; } return now() - since >= (Q || 200); }; }
    sim.waitFor = function (cond, timeout) { return poll(function () { return adapter.op('run', { code: '!!(' + cond + ')' }).catch(function () { return false; }); }, Boolean, timeout, 100); };
    sim.waitForNetworkIdle = function (timeout, quiet) { return poll(function () { return adapter.op('net', {}); }, steady(quiet, Boolean), timeout, 60); };
    sim.waitForStable = function (timeout, quiet) { return poll(function () { return adapter.op('stable', {}); }, steady(quiet, function () { return false; }), timeout, 60); };
    sim.record = function (on) { sim._rec = on === false ? null : []; return sim; };
    sim.replay = function (rec) {
      return (rec || sim._rec || []).reduce(function (p, e) { return p.then(function () { return sim._call(e.op, e.args); }); }, Promise.resolve()).then(function () { return true; }, function () { return false; });
    };
    sim.report = function () { return { id: sim.id, kind: sim.kind, name: sim.name, ready: !!adapter.ready, age: now() - sim.createdAt, idle: now() - sim.lastUsed, ttl: sim.ttl, dead: sim.isDead(), versionMismatch: !!adapter.versionMismatch }; };
    sim.destroy = function () {
      if (sim._dead) return true;
      sim._dead = true;
      try { sim.abort(); } catch (e) {}
      sim._hooks.splice(0).forEach(function (f) { try { f(sim); } catch (e) {} });
      try { adapter.close(); } catch (e) {}
      if (adapter.transport) bus.removeTransport(adapter.transport);
      sim._free.splice(0).forEach(function (f) { try { f(); } catch (e) {} });
      delete registry[sim.id]; EV.emit('remove', sim);
      if (!ids().length) watchdog(false);
      return true;
    };
    registry[sim.id] = sim; EV.emit('add', sim);
    if (DEFAULTS.autoGc) watchdog(true);
    return sim;
  }

  // ---- bus: local pub/sub, mirrored to every transport ----
  var bus = (function () {
    var subs = [], trs = [];
    function emit(ch, data, meta) { subs.slice().forEach(function (s) { if (s.ch === '*' || s.ch === ch) try { s.fn(data, meta || {}, ch); } catch (e) {} }); }
    function publish(ch, data, opt) {
      opt = opt || {}; var meta = { from: opt.from || null, to: opt.to || null, via: opt.via || 'local' };
      emit(ch, data, meta);
      trs.slice().forEach(function (t) { try { t.send({ __sim: 1, op: 'pub', channel: ch, data: data, from: meta.from, to: meta.to }); } catch (e) {} });
    }
    function subscribe(ch, fn) { var s = { ch: ch, fn: fn }; subs.push(s); return function () { remove(subs, s); }; }
    function add(t) { if (!t) return null; trs.push(t); t.on(function (m) { if (m && m.__sim === 1 && m.op === 'pub') emit(m.channel, m.data, { from: m.from || null, to: m.to || null, via: 'peer' }); }); return t; }
    return { emit: emit, publish: publish, subscribe: subscribe, addTransport: add, removeTransport: function (t) { remove(trs, t); }, transports: trs, subscribers: subs };
  })();
  function inputsAdd(cfg) {
    cfg = cfg || {};
    if (cfg.type !== 'poll') { var t = transportFrom(cfg); if (t) bus.addTransport(t); return t; }
    var stop = false;
    (function loop() {
      if (stop) return;
      fetch(cfg.url).then(function (r) { return r.json(); }).then(function (d) { bus.emit(cfg.channel || 'poll', cfg.map ? cfg.map(d) : d, { via: 'poll' }); })
        .catch(function () {}).then(function () { if (!stop) setTimeout(loop, cfg.interval || 2000); });
    })();
    return { kind: 'poll', close: function () { stop = true; } };
  }

  // ---- page building: bridge + prelude spliced in before the page's first script ----
  function exposeBridge(html, src) {
    if (optOf(src, 'bridge') === false) return html;
    var inject = optOf(src, 'bridgeCode'), pats = src.bridgePattern ? [src.bridgePattern] : BRIDGE_PATTERNS, hit = false;
    // only inline JavaScript blocks are searched (the app's own code, not markup or JSON blocks)
    return html.replace(/(<script\b([^>]*)>)([\s\S]*?)(<\/script\s*>)/gi, function (all, open, attrs, body, close) {
      if (hit || /\bsrc\s*=/i.test(attrs) || /\btype\s*=\s*["']?(?!text\/javascript|module|application\/javascript)\w/i.test(attrs)) return all;
      for (var i = 0; i < pats.length; i++) if (pats[i].test(body)) { hit = true; return open + body.replace(pats[i], function (m) { return m + inject; }) + close; }
      return all;
    });
  }
  function injectAll(html, src, extra) {
    html = exposeBridge(html, src);
    var o = { isolate: src.isolate !== false, trackStable: optOf(src, 'trackStable'), clock: optOf(src, 'clock'), maxLogs: optOf(src, 'maxLogs') };
    var splice = (src.base ? '<base href="' + String(src.base).replace(/"/g, '&quot;') + '">' : '') +
      '<script>(function(){' + realmCode(['clockInstall', 'capture', 'prelude']) + '\nprelude(window,' + J(o) + ')})();<\/script>' + (extra ? '<script>' + extra + '<\/script>' : '');
    var i = html.search(/<script[\s>]/i); if (i < 0) i = html.search(/<\/head>/i); if (i < 0) i = html.search(/<\/body>/i);
    return i >= 0 ? html.slice(0, i) + splice + html.slice(i) : html + splice;
  }
  function normalize(spec) {
    return Promise.resolve().then(function () {
      if (typeof spec === 'function') return normalize(spec());
      var o;
      if (typeof spec === 'string') o = looksHtml(spec) ? { html: spec } : { url: spec };
      else if (spec && typeof spec === 'object') o = Object.assign({}, spec);
      else throw Error('SIM: bad spec');
      if (o.node && o.node.outerHTML) o.html = o.node.outerHTML;
      if (o.doc && o.doc.documentElement) o.html = '<!doctype html>' + o.doc.documentElement.outerHTML;
      if (o.fn && !o.html && !o.url && !o.src) return normalize(o.fn());
      o.isolate = o.isolate === undefined ? DEFAULTS.isolate : o.isolate;
      o.console = merge({}, DEFAULTS.console, o.console);
      o.base = o.base || DEFAULTS.base; o.runtime = o.runtime || DEFAULTS.runtime;
      o.ttl = o.ttl == null ? DEFAULTS.ttl : o.ttl;
      if (o.runtime === 'worker' || o.runtime === 'remote' || o.html) return o;
      if (o.url) return fetchText(o.url).then(function (t) { o.html = t; o.base = o.base || o.url; return o; }, function () { o.src = o.url; o.limited = true; return o; });
      if (o.target || o.src) { o.src = o.src || o.target; o.limited = true; return o; }
      throw Error('SIM: spec has no html/url/src');
    });
  }

  // ---- runtimes ----
  function makeIframe(src, id) {
    if (!hasDOM) return Promise.reject(Error('SIM: iframe runtime needs DOM'));
    return new Promise(function (resolve) {
      var ifr = document.createElement('iframe'), isDoc = !!src.html, done = false, loaded = false, d0 = null, ops = null, T = optOf(src, 'readyTimeout'), t0 = now();
      var opsOpts = { consoleAdapter: src.console, maxMessage: optOf(src, 'maxMessage'), maxLogs: optOf(src, 'maxLogs'), version: VERSION };
      ifr.id = id; ifr.setAttribute('sandbox', src.sandbox || DEFAULTS.sandbox);
      ifr.style.cssText = 'position:fixed;left:-12000px;top:0;width:' + optOf(src, 'width') + 'px;height:' + optOf(src, 'height') + 'px;border:0';
      document.body.appendChild(ifr);
      var free = [hold('iframes', ifr)];
      if (isDoc) ifr.srcdoc = injectAll(src.html, src, ''); else ifr.src = src.src;
      function win() { return ifr.contentWindow; }
      // ops are bound lazily to the current document: a cross-origin page makes the op fail instead of make() hanging
      function getOps() { var w = win(), d = w && w.document; if (!d) throw Error('iframe has no document'); if (d !== d0) { ops = OPS(w, opsOpts); d0 = d; } return ops; }
      // ready = the page itself loaded (not the iframe's initial about:blank); a cross-origin page counts once its load event fired
      function ready() {
        try { var w = win(), d = w && w.document; if (!isDoc && String(w.location.href) === 'about:blank') return false; return !!(d && d.readyState === 'complete' && d.body && (!isDoc || w.__sim)); }
        catch (e) { return !isDoc && loaded; }
      }
      function X() { var w = win(); return w && w.__sim; }
      function fin() {
        if (done) return; done = true;
        var sim = Sim(DirectAdapter(getOps, ifr), { id: id, ttl: src.ttl, allowConsoleEval: optOf(src, 'allowConsoleEval'), kind: 'iframe', free: free });
        sim.win = win;
        sim.doc = function () { var w = win(); return w && w.document; };
        sim.el = function (s) { var d = sim.doc(); return d ? d.querySelector(s) : null; };
        sim.all = function (s) { var d = sim.doc(); return d ? [].slice.call(d.querySelectorAll(s)) : []; };
        sim.fire = function (n, t, i) { var w = win(); if (n && w) try { n.dispatchEvent(new w.Event(t, Object.assign({ bubbles: true, cancelable: true }, i || {}))); } catch (e) {} };
        // routes: handler(url, input, { win, init }) returns a body string, { status, headers, body, delay } or a Response
        sim.route = function (pattern, handler, o) {
          var x = X(); if (!x) return { ok: 0, error: 'route only on iframe with prelude' };
          o = o || {}; var rid = uid('rt'), times = o.times || 0;
          var test = pattern == null ? function () { return true; } : function (u) { return pattern instanceof RegExp ? pattern.test(u) : String(u).indexOf(pattern) !== -1; };
          x.handlers[rid] = function (u, input, init) { if (times && --times <= 0) sim.unroute(rid); return handler(u, input, { win: win(), init: init }); };
          x.routes.push({ id: rid, method: o.method || null, test: test });
          return rid;
        };
        sim.unroute = function (rid) { var x = X(); if (x) { x.routes = x.routes.filter(function (r) { return r.id !== rid; }); delete x.handlers[rid]; } };
        sim.clearRoutes = function () { var x = X(); if (x) { x.routes.length = 0; x.handlers = {}; } };
        var base = sim.report;
        sim.report = function () {
          var w = win(), d = null; try { d = w && w.document; } catch (e) {}
          return Object.assign(base(), { ready: !!(d && d.readyState === 'complete'), isolated: !!(d && w.__sim && w.__sim.hasLS), hasBridge: !!(d && w.__app && w.__app.run) });
        };
        resolve(sim);
      }
      ifr.addEventListener('load', function () { loaded = true; if (ready()) setTimeout(fin, 0); });
      (function poll() { if (done) return; if (ready() || now() - t0 > T) return fin(); setTimeout(poll, 50); })();
    });
  }
  // every message-linked runtime: register the sim, then wait for the agent's ready (at most readyTimeout)
  function linked(tr, src, id, kind, free) {
    if (!tr) return Promise.reject(Error('SIM: ' + kind + ' needs a working transport'));
    var sim = Sim(TransportAdapter(tr), { id: id, ttl: src.ttl, kind: kind, free: free });
    bus.addTransport(tr);
    return guard(sim.ready, { ms: optOf(src, 'readyTimeout') }).then(function () { return sim; }, function () { return sim; });
  }
  function agentOpts(src, id, type, name) { return { type: type, name: name, id: id, init: src.code || '', consoleAdapter: src.console, clock: optOf(src, 'clock'), maxMessage: optOf(src, 'maxMessage'), maxLogs: optOf(src, 'maxLogs') }; }
  var RUNTIMES = {
    iframe: makeIframe,
    worker: function (src, id) {
      if (typeof Worker === 'undefined') throw Error('SIM: no Worker support');
      var free = [], w = new Worker(blobUrl(agentSource(agentOpts(src, id, 'self')), 'text/javascript', free));
      free.push(hold('workers', w));
      return linked(transportFrom({ type: 'worker', worker: w }), src, id, 'worker', free);
    },
    tab: function (src, id) {
      if (!hasDOM || !G.open) throw Error('SIM: tab runtime needs window.open');
      return (src.html ? Promise.resolve(src.html) : fetchText(src.url || src.src)).then(function (html) {
        var free = [], name = uid('tab'), url = blobUrl(injectAll(html, src, agentSource(agentOpts(src, id, 'broadcast', name))), 'text/html', free), win = null;
        var p = linked(transportFrom({ type: 'broadcast', name: name }), src, id, 'tab', free);
        try { win = G.open(url, '_blank'); } catch (e) {}
        free.push(function () { if (win && !win.closed) win.close(); });
        return p.then(function (sim) { sim.win = win; return sim; });
      });
    },
    remote: function (src, id) { return linked(transportFrom(src.transport || src), src, id, 'remote'); }
  };
  function reserveId(src) {
    if (src.id && registry[src.id]) { if (src.replace) registry[src.id].destroy(); else throw Error('SIM: id already in use: ' + src.id); }
    return src.id ? String(src.id) : uid('sim');
  }
  function make(spec) {
    return normalize(spec).then(function (src) {
      if (DEFAULTS.maxSims && ids().length >= DEFAULTS.maxSims && !src.force) throw Error('SIM: maxSims reached (' + DEFAULTS.maxSims + ')');
      return (RUNTIMES[src.runtime] || makeIframe)(src, reserveId(src));
    });
  }
  function asTransport(x, id) { return (x && x.__simTransport) ? x : (transportFrom(x, id) || x); }
  function connect(t, id) { var tr = asTransport(t), realId = id || uid('sim'), sim = Sim(TransportAdapter(tr), { id: realId }); bus.addTransport(tr); return sim; }
  function remote(cfg, id) { var tr = transportFrom(cfg); if (!tr) throw Error('SIM: bad transport cfg'); return connect(tr, id); }
  // make THIS realm answer ops over a transport
  function serve(t, id) {
    var tr = asTransport(t, id); if (!tr) throw Error('SIM: serve needs a transport');
    G.__simId = id || G.__simId;
    return serveRealm(G, tr, { consoleAdapter: DEFAULTS.console, maxMessage: DEFAULTS.maxMessage, maxLogs: DEFAULTS.maxLogs, version: VERSION },
      function (ch, d, from, to) { bus.emit(ch, d, { from: from, to: to, via: 'peer' }); });
  }

  // ---- registry & lifecycle ----
  function ids() { return Object.keys(registry); }
  function get(id) { return registry[id] || null; }
  function has(id) { return !!registry[id]; }
  function each(fn) { return ids().map(function (id) { return fn(registry[id], id); }); }
  function map() { return each(function (s) { return s.report ? s.report() : { id: s.id, kind: s.kind }; }); }
  function report() { var by = {}; each(function (s) { by[s.kind] = (by[s.kind] || 0) + 1; }); return { count: ids().length, byKind: by, watchdog: !!watchdogTimer, sims: map() }; }
  function command(id, action) { var s = registry[id]; return s ? s.one(action) : Promise.resolve({ ok: 0, error: 'no sim: ' + id }); }
  function commandAll(list, action) { return Promise.all((list || ids()).map(function (id) { return command(id, action); })); }
  function broadcast(action) { return commandAll(ids(), action); }
  // kill(): all | 'id' (exact id, else ids starting with it) | RegExp | [ids] | fn(sim, id) | sim
  function kill(x) {
    var list = x == null ? ids()
      : typeof x === 'string' ? (registry[x] ? [x] : ids().filter(function (id) { return id.indexOf(x) === 0; }))
      : x instanceof RegExp ? ids().filter(function (id) { return x.test(id); })
      : Array.isArray(x) ? x.slice()
      : typeof x === 'function' ? ids().filter(function (id) { return x(registry[id], id); })
      : x && x.id ? [x.id] : [];
    var n = 0;
    list.forEach(function (id) { if (registry[id]) { try { registry[id].destroy(); } catch (e) {} n++; } });
    return n;
  }
  function killAll() { return kill(null); }
  function alive() { return ids().length; }
  function gc() {
    var n = 0;
    each(function (s) {
      var rm; try { rm = s.isDead() || (s.ttl && now() - s.createdAt > s.ttl) || (DEFAULTS.idleTimeout && now() - s.lastUsed > DEFAULTS.idleTimeout); } catch (e) { rm = true; }
      if (rm) { try { s.destroy(); } catch (e) {} n++; }
    });
    if (!ids().length) watchdog(false);
    return n;
  }
  function watchdog(on, ms) {
    if (ms) DEFAULTS.gcInterval = ms;
    if (watchdogTimer) { watchdogTimer(); watchdogTimer = 0; }
    if (on === false) return false;
    watchdogTimer = hold('timers', setInterval(gc, DEFAULTS.gcInterval));
    return true;
  }
  function acquire(spec) { spec = spec || {}; if (spec.id && registry[spec.id]) registry[spec.id].destroy(); return make(spec); }
  function purge() {
    try { killAll(); } catch (e) {}
    Object.keys(TRACK).forEach(function (k) { TRACK[k].splice(0).forEach(function (x) { try { FREE[k](x); } catch (e) {} }); });
    bus.transports.splice(0).forEach(function (t) { try { t.close(); } catch (e) {} });
    bus.subscribers.length = 0;
    for (var k in registry) delete registry[k];
    watchdog(false); panel(false);
    return true;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function panel(on) {
    if (!hasDOM) return null;
    var el = document.getElementById('simPanel');
    if (on === false) { if (PANEL_T) { PANEL_T(); PANEL_T = 0; } if (el) el.remove(); return null; }
    if (el) return el;
    el = document.createElement('div'); el.id = 'simPanel';
    el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99999;background:#111;color:#ddd;border:1px solid #333;border-radius:8px;padding:8px;font:11px monospace;max-height:40vh;overflow:auto';
    document.body.appendChild(el);
    function render() { if (!document.body.contains(el)) return; el.innerHTML = '<b>SIM ' + VERSION + '</b> · ' + alive() + '<br>' + map().map(function (m) { return esc(m.id) + ' [' + esc(m.kind) + ']' + (m.dead ? ' 💀' : '') + ' <a href="#" data-kill="' + esc(m.id) + '">kill</a>'; }).join('<br>'); }
    el.addEventListener('click', function (e) { var id = e.target && e.target.getAttribute && e.target.getAttribute('data-kill'); if (id) { e.preventDefault(); kill(id); render(); } });
    PANEL_T = hold('timers', setInterval(render, 1000)); render();
    return el;
  }
  function expect(actual) {
    function check(ok, msg) { if (!ok) throw Error(msg); return true; }
    return {
      toBe: function (x) { return check(actual === x, 'expect ' + J(x) + ' got ' + J(actual)); },
      toEqual: function (x) { return check(J(actual) === J(x), 'expect ' + J(x) + ' got ' + J(actual)); },
      toBeTruthy: function () { return check(!!actual, 'expect truthy'); },
      toContain: function (x) { return check(String(actual).indexOf(x) >= 0, 'expect contain ' + x); }
    };
  }
  function configure(o) { return merge(DEFAULTS, o); }
  function config(k, v) { if (k == null) return DEFAULTS; if (v === undefined) return DEFAULTS[k]; DEFAULTS[k] = v; return v; }
  function persist(on) {
    try {
      if (on === false) { G.localStorage.removeItem('dse_sim_config'); return false; }
      var c = {}; for (var k in DEFAULTS) if (own(DEFAULTS, k) && k !== 'console') c[k] = DEFAULTS[k];
      G.localStorage.setItem('dse_sim_config', J(c)); return true;
    } catch (e) { return false; }
  }
  function loadConfig() { try { merge(DEFAULTS, JSON.parse(G.localStorage.getItem('dse_sim_config') || '{}')); } catch (e) {} return DEFAULTS; }
  function stats() { var st = { version: VERSION, sims: ids().length }; for (var k in TRACK) st[k] = TRACK[k].length; return Object.assign(st, { transports: bus.transports.length, watchdog: !!watchdogTimer, simsDetail: map() }); }
  function sse(frames) {
    return { status: 200, headers: { 'content-type': 'text/event-stream' }, body: frames.map(function (f) {
      if (f === '[DONE]') return 'data: [DONE]\n\n';
      if (typeof f !== 'string') return 'data: ' + J(f) + '\n\n';
      return /^data:/.test(f) ? (/\n$/.test(f) ? f : f + '\n\n') : 'data: ' + f + '\n\n';
    }).join('') };
  }
  try { G.addEventListener('pagehide', purge); } catch (e) {}
  var SIM = {
    VERSION: VERSION, SID: SID, hasDOM: hasDOM, DEFAULTS: DEFAULTS,
    make: make, remote: remote, connect: connect, serve: serve, agent: agentSource, agentUrl: agentUrl, transport: transportFrom,
    bus: bus, inputs: { add: inputsAdd }, addInput: inputsAdd,
    ids: ids, list: ids, get: get, has: has, each: each, map: map, report: report,
    command: command, commandAll: commandAll, broadcast: broadcast,
    kill: kill, killAll: killAll, alive: alive, gc: gc, watchdog: watchdog, on: EV.on, onChange: EV.on, acquire: acquire,
    purge: purge, clearAll: purge, panel: panel, expect: expect, configure: configure, config: config,
    persist: persist, loadConfig: loadConfig, random: rng, stats: stats, TRACK: TRACK, registry: registry,
    load: function (u) { return fetchText(u).then(function (t) { try { return JSON.parse(t); } catch (e) { return t; } }); },
    revoke: function (u) { try { URL.revokeObjectURL(u); } catch (e) {} },
    util: {
      sleep: sleep, clamp: clamp, merge: merge, sse: sse,
      json: function (o, s) { return { status: s || 200, headers: { 'content-type': 'application/json' }, body: o }; },
      text: function (t, s) { return { status: s || 200, body: t }; }
    }
  };
  if (DEFAULTS.panel) setTimeout(function () { panel(true); }, 0);
  return SIM;
})();
try { window.SIM = SIM; window.simulate = function (s) { return SIM.make(s); }; } catch (e) {}
try { if (typeof module !== 'undefined' && module.exports) module.exports = SIM; } catch (e) {}
