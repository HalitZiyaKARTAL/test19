/* ============================================================================
   sim.js v4.2.7 (claudeedit4; header said v4.2.2 while code said 4.2.3) — self-managing simulation builder.
   - idempotent load (reuse same version; purge previous on load)
   - app-scope via INJECTED BRIDGE (window.__app.run) — the eval console is
     OFF by default and, if enabled, auto-closes; never used for automation
   - resources tracked (iframes/workers/urls/timers) + SIM.purge()/stats()
   - caps (maxSims/maxLogs/maxQueue/maxMessage), retry/backoff, cancel(signal),
     version handshake, virtual clock, record/replay, route(delay/offline)
   ============================================================================ */
var SIM = (function () {
  if (typeof window !== 'undefined' && window.SIM && window.SIM.VERSION === /*🟢*/'4.2.7'/*🟡'4.2.3'🔴*/) return window.SIM;
  try { if (typeof window !== 'undefined' && window.SIM && window.SIM.purge) window.SIM.purge(); } catch (e) {}
  var VERSION = /*🟢*/'4.2.7'/*🟡'4.2.3'🔴*/;
  var G = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined' ? window : this);
  var hasDOM = (typeof document !== 'undefined' && !!document.createElement);
  var SID = Math.random().toString(36).slice(2, 7);
  var seq = 0, registry = {}, watchdogTimer = 0, PANEL_T = 0;
  var TRACK = { iframes: [], workers: [], urls: [], timers: []/*🟢*/, polls: []/*🟡🔴*/ };/*🟢*/ var reserving = {}; var SHARED = (G.__simShared = G.__simShared || {}); function sharedOf(ns) { return SHARED[ns] || (SHARED[ns] = { ls: new Map(), ck: new Map(), wins: [] }); } function nsPrefix(ns, id) { return ns != null ? '__simns_' + ns + '_' : '__sim_' + (id || 'x') + '_'; }/*🟡🔴*/
  var DEFAULTS = {
    runtime: 'iframe', isolate: true, base: '', width: 1024, height: 768,
    readyTimeout: 20000, actionTimeout: 15000, idleTimeout: 0, ttl: 0,
    autoGc: true, gcInterval: 5000, maxSims: 0, maxLogs: 2000, maxQueue: 500, maxMessage: 4e6,
    sandbox: 'allow-scripts allow-same-origin', strictVersion: false, routeById: true, retry: 0, backoff: 200,
    autoAbort: true, heartbeatMs: 0, traceMax: 500, panel: false, clock: false,
    trackStable: false, allowConsoleEval: false, bridge: true, bridgeCode: 'window.__app={run:function(c){c=String(c);var N=String.fromCharCode(10),x=true;try{new Function("return ("+c+N+")")}catch(e){x=false}return x?eval(c):eval("(function(){"+c+N+"})()")},v:1};',
    console: { toggle: '#evalLock', open: '#openEvalBtn', input: '#EI', run: '#ERun', out: '#EO' }
  };
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function now() { return Date.now(); }
  function uid(p) { return (p || 'x') + '_' + SID + '_' + (++seq); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function fetchText(u) { return fetch(u).then(function (r) { if (!r.ok) throw Error('HTTP ' + r.status + ' ' + u); return r.text(); }); }
  function looksHtml(s) { return /^\s*</.test(s) || /<html[\s>]/i.test(s) || /<!doctype/i.test(s); }
  function resolveText(u) { return looksHtml(u) ? Promise.resolve(u) : fetchText(u); }
  function asSource(u) { return /*🟢*/(/^(https?:|data:|blob:|\.{0,2}\/)/i.test(String(u)) || /^[\w.~%-][\w.~%\/-]*\.(m?js|json|txt|html?)(\?[^\s]*)?$/i.test(String(u)))/*🟡/^(https?:|data:|blob:)/i.test(String(u))🔴*/ && !/\s/.test(String(u)) ? fetchText(u) : Promise.resolve(String(u)); }
  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function merge(a, b) { a = a || {}; /*🟢*/for (var i = 1; i < arguments.length; i++) { b = arguments[i]; if (!b) continue; for (var k in b) { if (!own(b, k)) continue; a[k] = (isObj(b[k]) && isObj(a[k])) ? merge({}, a[k], b[k]) : b[k]; } }/*🟡if (!b) return a; for (var k in b) { if (!own(b, k)) continue; a[k] = (isObj(b[k]) && isObj(a[k])) ? merge({}, a[k], b[k]) : b[k]; }🔴*/ return a; }
  function emitter() { var m = {}; return { on: function (k, f) { (m[k] || (m[k] = [])).push(f); return function () { var a = m[k] || [], i = a.indexOf(f); if (i >= 0) a.splice(i, 1); }; }, emit: function (k) { var a = (m[k] || []).slice(), args = [].slice.call(arguments, 1); a.forEach(function (f) { try { f.apply(null, args); } catch (e) {} }); } }; }
  var EV = emitter();
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function attempt(make, o) { o = o || {}; var tries = ((o.retry == null ? DEFAULTS.retry : o.retry) | 0) + 1, d = (o.backoff == null ? DEFAULTS.backoff : o.backoff); function go(n) { return Promise.resolve().then(make).catch(function (e) { if (n <= 1) throw e; return sleep(d * Math.pow(2, tries - n)).then(function () { return go(n - 1); }); }); } return go(tries); }
  function withSignal(p, s) { if (!s) return p; return new Promise(function (res, rej) { var done = false; /*🟢*/function un() { try { s.removeEventListener('abort', ab); } catch (e) {} }/*🟡🔴*/ function ab() { if (!done) { done = true; /*🟢*/un();/*🟡🔴*/ rej(Error('aborted')); } } if (s.aborted) return ab(); try { s.addEventListener('abort', ab); } catch (e) {} Promise.resolve(p).then(function (v) { if (!done) { done = true; /*🟢*/un();/*🟡🔴*/ res(v); } }, function (e) { if (!done) { done = true; /*🟢*/un();/*🟡🔴*/ rej(e); } }); }); }
  function race(p, ms, name) { /*🟢*/var t; return Promise.race([Promise.resolve(p), new Promise(function (_, rej) { t = setTimeout(function () { rej(Error('sim timeout: ' + name)); }, ms); })]).then(function (v) { clearTimeout(t); return v; }, function (e) { clearTimeout(t); throw e; });/*🟡return Promise.race([Promise.resolve(p), new Promise(function (_, rej) { setTimeout(function () { rej(Error('sim timeout: ' + name)); }, ms); })]);🔴*/ }
  /*🟢*/function tmo(t) { return t == null ? DEFAULTS.actionTimeout : t; }/*🟡🔴*/
  function wrap(p) { return Promise.resolve(p).then(function (v) { return { ok: 1, value: v }; }, function (e) { return { ok: 0, error: String((e && e.message) || e) }; }); }

  function clockInstall(src) {
    if (src.__simClock) return src.__simClock;
    var rn = src.Date.now.bind(src.Date), vnow = rn(), timers = {}, cs = /*🟢*/1e9, rct = src.clearTimeout, rci = src.clearInterval/*🟡1🔴*/;
    src.Date.now = function () { return vnow; };
    try { if (src.performance) src.performance.now = function () { return vnow; }; } catch (e) {}
    src.setTimeout = function (fn, ms) { var a = [].slice.call(arguments, 2), id = cs++; timers[id] = { at: vnow + (ms || 0), fn: fn, a: a, per: 0 }; return id; };
    src.clearTimeout = function (id) { /*🟢*/if (timers[id]) delete timers[id]; else try { rct.call(src, id); } catch (e) {}/*🟡delete timers[id];🔴*/ };
    src.setInterval = function (fn, ms) { var a = [].slice.call(arguments, 2), id = cs++; timers[id] = { at: vnow + (ms || 0), fn: fn, a: a, per: ms || 1 }; return id; };
    src.clearInterval = function (id) { /*🟢*/if (timers[id]) delete timers[id]; else try { rci.call(src, id); } catch (e) {}/*🟡delete timers[id];🔴*/ };
    function fa(t) { for (var id in timers) { var x = timers[id]; if (x.at <= t) { if (x.per) { while (x.at <= t) { try { x.fn.apply(null, x.a); } catch (e) {} x.at += x.per; } } else { delete timers[id]; try { x.fn.apply(null, x.a); } catch (e) {} } } } }
    var api = { advance: function (ms) { var t = vnow + (ms || 0), g = 1e5; while (g-- > 0) { var nx = null; for (var id in timers) if (timers[id].at <= t && (nx === null || timers[id].at < nx)) nx = timers[id].at; if (nx === null) break; vnow = nx; fa(nx); } vnow = t; return vnow; }, set: function (ms) { vnow = ms; return vnow; }, now: function () { return vnow; }, pending: function () { return Object.keys(timers).length; } };
    src.__simClock = api; return api;
  }

  function OPS(scope, opts) {
    opts = opts || {};
    var doc = scope.document || null, maxM = opts.maxMessage || 4e6, maxLogs = opts.maxLogs || 2000;
    var CA = opts.consoleAdapter || { toggle: '#evalLock', open: '#openEvalBtn', input: '#EI', run: '#ERun', out: '#EO' };
    var logs = scope.__simLogs || (scope.__simLogs = []), errs = scope.__simErrs || (scope.__simErrs = []);
    if (!scope.__simCapture) {
      scope.__simCapture = 1;
      try { /*🟢*/var C = scope.console || console;/*🟡🔴*/ ['log', 'warn', 'error', 'info'].forEach(function (k) { var o = /*🟢*/C[k] ? C[k].bind(C)/*🟡console[k] ? console[k].bind(console)🔴*/ : function () {}; /*🟢*/C[k]/*🟡console[k]🔴*/ = function () { try { logs.push(k + ': ' + Array.prototype.slice.call(arguments).map(function (x) { try { return typeof x === 'string' ? x : JSON.stringify(x); } catch (e) { return String(x); } }).join(' ')); if (logs.length > maxLogs) logs.splice(0, logs.length - maxLogs); } catch (e) {} return o.apply(null, arguments); }; }); } catch (e) {}
      if (scope.addEventListener) { scope.addEventListener('error', function (e) { try { errs.push(String(e.message || e.error)); if (errs.length > maxLogs) errs.shift(); } catch (x) {} }); scope.addEventListener('unhandledrejection', function (e) { try { errs.push('rej:' + String((e.reason && e.reason.stack) || e.reason)); } catch (x) {} }); }
    }
    function fire(n, t, i) { try { /*🟢*/var EC = (/^key/.test(t) && scope.KeyboardEvent) ? scope.KeyboardEvent : (/^(click|dblclick|mouse|contextmenu)/.test(t) && scope.MouseEvent) ? scope.MouseEvent : scope.Event;/*🟡🔴*/ n.dispatchEvent(new /*🟢*/EC/*🟡scope.Event🔴*/(t, Object.assign({ bubbles: true, cancelable: true }, i || {}))); } catch (e) {} }
    function q(s) { return doc ? doc.querySelector(s) : null; }
    function dom(a) {
      if (!doc) throw Error('no DOM in runtime');
      var n = q(a.sel);
      switch (a.op) {
        case 'click': if (n) n.click(); return !!n;
        case 'type': if (n) { if (a.clear !== false) n.value = ''; n.value += a.text; fire(n, 'input'); fire(n, 'change'); } return !!n;
        case 'clear': if (n) { n.value = ''; fire(n, 'input'); fire(n, 'change'); } return !!n;
        case 'focus': if (n && n.focus) n.focus(); return !!n;
        case 'blur': if (n && n.blur) n.blur(); return !!n;
        case 'press': if (n) { ['keydown', 'keypress', 'keyup'].forEach(function (t) { fire(n, t, /*🟢*/Object.assign({ key: a.key }, a.init || {})/*🟡{ key: a.key }🔴*/); }); } return !!n;
        case 'select': if (n && ('value' in n)) { n.value = a.value; fire(n, 'change'); } return !!n;
        case 'submit': if (n) { if (n.requestSubmit) n.requestSubmit(); else fire(n, 'submit'); } return !!n;
        case 'scroll': if (n && n.scrollIntoView) n.scrollIntoView(a.arg || true); return !!n;
        case 'value': return n ? (('value' in n) ? n.value : null) : null;
        case 'checked': return n ? !!n.checked : null;
        case 'text': return n ? n.textContent : null;
        case 'html': return n ? n.innerHTML : null;
        case 'attr': return n ? n.getAttribute(a.name) : null;
        case 'count': return doc.querySelectorAll(a.sel).length;
        case 'visible': if (!n) return false; var r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0;
        case 'append': if (doc.body) doc.body.insertAdjacentHTML('beforeend', a.html); return true;
        case 'dispatch': fire(n, a.type, a.init); return !!n;
        case 'remove': if (n && n.parentNode) n.parentNode.removeChild(n); return !!n;
        default: throw Error('unknown dom op: ' + a.op);
      }
    }
    function appEval(code, m) {
      m = m || {};
      if (scope.__app && typeof scope.__app.run === 'function') {
        return Promise.resolve().then(function () { return scope.__app.run(code); }).then(function (v) { return { ok: 1, value: v, via: 'bridge' }; });
      }
      if (!m.allowConsoleEval) return Promise.reject(Error('no __app bridge; console eval disabled (set allowConsoleEval)'));
      if (!doc) return Promise.reject(Error('no DOM'));
      var t = q(CA.toggle); if (t) { try { if ('checked' in t) t.checked = true; fire(t, 'input'); fire(t, 'change'); } catch (e) {} }
      return sleep(80)
        .then(function () { var o = q(CA.open); if (o) try { o.click(); } catch (e) {}; return sleep(m.delay || 160); })
        .then(function () {
          var inp = q(CA.input), run = q(CA.run), out = q(CA.out);
          if (!inp || !run) throw Error('app console missing');
          var before = out ? out.value.length : 0;
          inp.value = code; run.click();
          return sleep(90).then(function () {
            var raw = out ? out.value.slice(before).trim() : '';
            var box = doc.getElementById('evalConsole'); if (box) { try { box.remove(); } catch (e) {} }
            return { ok: 1, value: raw.split('\n').pop(), via: 'console' };
          });
        });
    }
    return {
      info: function () { return { id: scope.__simId || null, version: opts.version || null, hasDOM: !!doc, hasBridge: !!(scope.__app && scope.__app.run), href: (scope.location && scope.location.href) || null }; },
      run: function (code) { if (String(code).length > maxM) throw Error('message too large'); return Promise.resolve(scope.eval(code)); },
      logs: function () { return logs.slice(); }, errs: function () { return errs.slice(); }, clear: function () { logs.length = 0; errs.length = 0; return true; },
      dom: dom, appEval: appEval,
      clock: function (m) { if (!scope.__simClock) clockInstall(scope); var api = scope.__simClock; if (m.co === 'advance') return api.advance(m.ms); if (m.co === 'set') return api.set(m.ms); if (m.co === 'pending') return api.pending(); return api.now(); },
      net: function () { return (scope.__sim && scope.__sim.net) || 0; },
      stable: function () { return (scope.__sim && scope.__sim.mut) || 0; },
      offline: function (v) { /*🟢*/if (!scope.__sim) throw Error('offline needs iframe runtime with prelude');/*🟡🔴*/ scope.__sim.offline = !!v; return true; },
      pub: function (m) { try { if (scope.__simOnPub) scope.__simOnPub(m.channel, m.data, m.from, m.to); } catch (e) {} return true; }
    };
  }
  function SERVER(ops, scope, send) {
    return function (m) {
      if (!m || m.__sim !== 1) return;
      /*🟢*/if (!m.op || m.ev || ('ok' in m)) return;/*🟡🔴*/
      if (m.to && m.to !== 'all' && scope.__simId && m.to !== scope.__simId) return;
      var id = m.id, op = m.op;
      function ok(v) { /*🟢*/try { send({ __sim: 1, id: id, ok: 1, value: v }); } catch (e) { send({ __sim: 1, id: id, ok: 0, error: 'unserializable result: ' + String((e && e.message) || e) }); }/*🟡send({ __sim: 1, id: id, ok: 1, value: v });🔴*/ }
      function bad(e) { send({ __sim: 1, id: id, ok: 0, error: String((e && e.stack) || e) }); }
      try {
        if (op === 'ping') return ok('pong'); if (op === 'pub') return ok(ops.pub(m)); if (op === 'info') return ok(ops.info()); if (op === 'logs') return ok(ops.logs()); if (op === 'errs') return ok(ops.errs()); if (op === 'clear') return ok(ops.clear()); if (op === 'net') return ok(ops.net()); if (op === 'stable') return ok(ops.stable()); if (op === 'offline') return ok(ops.offline(m.value)); if (op === 'clock') return ok(ops.clock(m));
        if (op === 'dom') { try { return ok(ops.dom(m.a)); } catch (e) { return bad(e); } }
        if (op === 'run') return Promise.resolve(ops.run(m.code)).then(ok, bad);
        if (op === 'appEval') return Promise.resolve(ops.appEval(m.code, m)).then(ok, bad);
        bad('unknown op: ' + op);
      } catch (e) { bad(e); }
    };
  }
  function agentSource(opts) {
    opts = opts || {}; var L = [];
    L.push(';(function(){'); L.push('var S=(typeof self!=="undefined")?self:this;'); L.push('S.__simId=' + JSON.stringify(opts.id || null) + ';');
    L.push('var OPS=' + OPS.toString() + ';'); L.push('var SERVER=' + SERVER.toString() + ';'); L.push('var clockInstall=' + clockInstall.toString() + ';');
    L.push('var OPTS=' + JSON.stringify({ consoleAdapter: opts.consoleAdapter || null, maxMessage: opts.maxMessage, maxLogs: opts.maxLogs, version: VERSION }) + ';');
    if (opts.clock) L.push('try{clockInstall(S)}catch(e){}');
    if (opts.type === 'broadcast') L.push('var ME=' + JSON.stringify(opts.me || opts.id || 'peer') + ';var BC=new S.BroadcastChannel(' + JSON.stringify(opts.name) + ');var send=function(m){m.src=ME;BC.postMessage(m)};var listen=function(f){BC.onmessage=function(e){var m=e.data;if(m&&m.src===ME)return;f(m)}};');
    else if (opts.type === 'ws') L.push('var ME=' + JSON.stringify(opts.me || opts.id || 'peer') + ';var W=new S.WebSocket(' + JSON.stringify(opts.url) + ');var send=function(m){m.src=ME;try{W.send(JSON.stringify(m))}catch(e){}};var listen=function(f){W.onmessage=function(e){var m;try{m=JSON.parse(e.data)}catch(x){return}f(m)}};');
    else if (opts.type === 'parent') L.push('var ME=' + JSON.stringify(opts.me || opts.id || 'peer') + ';var send=function(m){m.src=ME;(S.parent||S.opener||S).postMessage(m,"*")};var listen=function(f){S.addEventListener("message",function(e){if(e.data&&e.data.src===ME)return;f(e.data)})};');
    else L.push('var send=function(m){S.postMessage(m)};var listen=function(f){S.onmessage=function(e){f(e.data)}};');
    L.push('var ops=OPS(S,OPTS);'); L.push('var handle=SERVER(ops,S,send);'); L.push('listen(handle);');
    L.push('S.__simOnPub=function(){};'); L.push('S.__simPub=function(ch,d,to){try{send({__sim:1,op:"pub",channel:ch,data:d,from:S.__simId||null,to:to||null})}catch(e){}};');
    if (opts.init) L.push('try{S.eval(' + JSON.stringify(opts.init) + ')}catch(e){}');
    L.push('send({__sim:1,ev:"ready",id:S.__simId||null,version:' + JSON.stringify(VERSION) + ',hasDOM:!!S.document,href:(S.location&&S.location.href)||null});');
    L.push('})();'); return L.join('\n');
  }
  function agentUrl(opts) { var u = URL.createObjectURL(new Blob([agentSource(opts)], { type: 'text/javascript' })); TRACK.urls.push(u); return u; }
  function multi(kind, send, attach, close) {
    var hs = []; function deliver(m) { hs.slice().forEach(function (h) { try { h(m); } catch (e) {} }); }
    var api = { __simTransport: true, kind: kind, closed: false, send: send, on: function (f) { hs.push(f); return function () { var i = hs.indexOf(f); if (i >= 0) hs.splice(i, 1); }; }, off: function (f) { var i = hs.indexOf(f); if (i >= 0) hs.splice(i, 1); } };
    api.close = function () { if (api.closed) return; api.closed = true; try { if (close) close(); } catch (e) {} };
    try { if (attach) attach(deliver); } catch (e) {}
    return api;
  }
  function transportFrom(cfg, me) {
    if (!cfg) return null;
    if (cfg.__simTransport) return cfg;
    me = me || uid('c');
    if (cfg.type === 'worker') { var w = cfg.worker; return multi('worker', function (m) { w.postMessage(m); }, function (d) { w.onmessage = function (e) { d(e.data); }; }, function () { try { w.terminate(); } catch (e) {} }); }
    if (cfg.type === 'broadcast') { if (typeof BroadcastChannel === 'undefined') return null; var bc = new BroadcastChannel(cfg.name); var bt = multi('broadcast', function (m) { m.src = me; bc.postMessage(m); }, function (d) { bc.onmessage = function (e) { var m = e.data; if (m && m.src === me) return; d(m); }; }, function () { try { bc.close(); } catch (e) {} }); bt.name = cfg.name; bt.me = me; return bt; }
    if (cfg.type === 'ws') { if (typeof WebSocket === 'undefined') return null; var ws, q = [], open = false, dead = false, hb = 0, cap = cfg.maxQueue || DEFAULTS.maxQueue/*🟢*/, wh = null/*🟡🔴*/; (function cx() { try { ws = new WebSocket(cfg.url, cfg.protocols); } catch (e) { return; } /*🟢*/if (wh) ws.onmessage = wh;/*🟡🔴*/ ws.onopen = function () { open = true; while (q.length) try { ws.send(q.shift()); } catch (e) {} if (cfg.heartbeat || DEFAULTS.heartbeatMs) hb = setInterval(function () { try { ws.send(JSON.stringify({ __sim: 1, op: 'ping' })); } catch (e) {} }, cfg.heartbeat || DEFAULTS.heartbeatMs); }; ws.onclose = function () { open = false; if (hb) { clearInterval(hb); hb = 0; } if (!dead) setTimeout(cx, cfg.reconnectMs || 1500); }; })(); return multi('ws', function (m) { m.src = me; var s = JSON.stringify(m); if (open) try { ws.send(s); } catch (e) {} else { q.push(s); if (q.length > cap) q.splice(0, q.length - cap); } }, function (d) { /*🟢*/wh/*🟡ws.onmessage🔴*/ = function (e) { var m; try { m = JSON.parse(e.data); } catch (x) { return; } if (m && m.op === 'ping') return; d(m); };/*🟢*/ if (ws) ws.onmessage = wh;/*🟡🔴*/ }, function () { dead = true; if (hb) clearInterval(hb); try { ws.close(); } catch (e) {} }); }
    if (cfg.type === 'sse') { if (typeof EventSource === 'undefined') return null; var es = new EventSource(cfg.url), post = cfg.post || cfg.url; return multi('sse', function (m) { try { fetch(post, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) }); } catch (e) {} }, function (d) { es.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (x) { return; } d(m); }; }, function () { try { es.close(); } catch (e) {} }); }
    if (cfg.type === 'window') { var d0 = null; var h = function (e) { if (cfg.origin && e.origin !== cfg.origin) return; if (e.data && e.data.src === me) return; if (d0) d0(e.data); }; G.addEventListener('message', h); return multi('window', function (m) { m.src = me; cfg.target.postMessage(m, cfg.origin || '*'); }, function (d) { d0 = d; }, function () { try { G.removeEventListener('message', h); } catch (e) {} }); }
    if (cfg.send && cfg.on) return multi(cfg.type || 'custom', cfg.send, cfg.on, cfg.close);
    return null;
  }
  function DirectAdapter(ops, ifr) {
    var ad = { kind: 'direct', ready: Promise.resolve({}), iframe: ifr || null, versionMismatch: false };
    ad.op = function (name, args/*🟢*/, timeout/*🟡🔴*/) {
      args = args || {};
      /*🟢*/var T = tmo(timeout); var p =/*🟡return🔴*/ new Promise(function (res, rej) { try {
        if (name === 'run') return Promise.resolve(ops.run(args.code)).then(res, rej);
        if (name === 'dom') return res(ops.dom(args.a));
        if (name === 'appEval') return Promise.resolve(ops.appEval(args.code, args)).then(res, rej);
        if (name === 'ping') return res('pong');
        if (name === 'info') return res(ops.info()); if (name === 'logs') return res(ops.logs()); if (name === 'errs') return res(ops.errs()); if (name === 'clear') return res(ops.clear());
        if (name === 'net') return res(ops.net()); if (name === 'stable') return res(ops.stable()); if (name === 'offline') return res(ops.offline(args.value)); if (name === 'clock') return res(ops.clock(args)); if (name === 'pub') return res(ops.pub(args));
        rej(Error('unknown op: ' + name));
      } catch (e) { rej(e); } });
      /*🟢*/return T > 0 ? race(p, T, name) : p;/*🟡🔴*/
    };
    ad.close = function () {}; return ad;
  }
  function TransportAdapter(tr, id) {
    var pending = {}, me = tr.me || uid('c'), readyDone = false, readyRes, peerId = null;
    var ready = new Promise(function (res) { readyRes = res; });
    var ad = { kind: tr.kind || 'remote', transport: tr, ready: ready, iframe: null, versionMismatch: false/*🟢*/, isReady: false/*🟡🔴*/ };
    tr.on(function (m) { if (!m || m.__sim !== 1) return; if (m.id && pending[m.id]) { var p = pending[m.id]; delete pending[m.id]; /*🟢*/if (p.t) clearTimeout(p.t);/*🟡🔴*/ if (m.ok) p.res(m.value); else p.rej(Error(m.error || 'peer error')); return; } if (m.ev === 'ready' && !readyDone) { readyDone = true; peerId = m.id || null; if (m.version && m.version !== VERSION) { ad.versionMismatch = true; EV.emit('versionMismatch', { peer: m.version, self: VERSION }); if (DEFAULTS.strictVersion) { readyRes(Promise.reject(Error('SIM version mismatch: ' + m.version + ' vs ' + VERSION))); return; } } /*🟢*/ad.isReady = true;/*🟡🔴*/ readyRes({ id: m.id, version: m.version, hasDOM: !!m.hasDOM, href: m.href }); } });
    ad.op = function (name, args, timeout) { var cid = uid('r'); return new Promise(function (res, rej) { pending[cid] = { res: res, rej: rej }; var msg = Object.assign({ __sim: 1, op: name, id: cid, src: me }, args || {}); if (DEFAULTS.routeById && peerId) msg.to = peerId; try { tr.send(msg); } catch (e) { delete pending[cid]; return rej(e); } /*🟢*/var T = tmo(timeout); if (T > 0) pending[cid].t = /*🟡🔴*/setTimeout(function () { if (pending[cid]) { delete pending[cid]; rej(Error('sim timeout: ' + name)); } }, /*🟢*/T/*🟡timeout || DEFAULTS.actionTimeout🔴*/); }); };
    ad.close = function () { try { tr.close(); } catch (e) {} }; return ad;
  }
  function norm(o) { return (o == null) ? {} : (typeof o === 'number' ? { timeout: o } : o); }
  function runAction(sim, a, opts) {
    return new Promise(function (res) { try {
      if (typeof a === 'function') return Promise.resolve(a(sim)).then(res, function (e) { res({ ok: 0, error: String(e) }); });
      if (a.do) return Promise.resolve(a.do(sim)).then(res, function (e) { res({ ok: 0, error: String(e) }); });
      if (a.wait != null) return sleep(a.wait).then(function () { res({ ok: 1 }); });
      if (a.eval != null) return sim.run(a.eval, a).then(res);
      if (a.appEval != null) return sim.appEval(a.appEval, a).then(res);
      if (a.loadScript != null) return sim.loadScript(a.loadScript).then(res);
      if (a.loadIntoApp != null) return sim.loadIntoApp(a.loadIntoApp, a.delay).then(res);
      if (a.publish != null) return res({ ok: sim.publish(a.publish[0], a.publish[1], a.to) });
      if (a.offline != null) return sim.offline(a.offline).then(res);
      if (a.clock != null) return sim.clock.advance(a.clock).then(res);
      if (a.click != null) return sim.action({ op: 'click', sel: a.click }, a).then(res);
      if (a.type != null) return sim.action({ op: 'type', sel: a.type[0], text: a.type[1], clear: a.clear }, a).then(res);
      if (a.press != null) return sim.action({ op: 'press', sel: a.press[0], key: a.press[1] }, a).then(res);
      if (a.select != null) return sim.action({ op: 'select', sel: a.select[0], value: a.select[1] }, a).then(res);
      if (a.focus != null) return sim.action({ op: 'focus', sel: a.focus }, a).then(res);
      if (a.append != null) return sim.action({ op: 'append', html: a.append }, a).then(res);
      if (a.waitForNetworkIdle) return sim.waitForNetworkIdle(a.timeout, a.quiet).then(res);
      if (a.waitForStable) return sim.waitForStable(a.timeout, a.quiet).then(res);
      if (a.waitFor != null) return sim.waitFor(a.waitFor, a.timeout).then(function (ok) { res({ ok: !!ok }); });
      if (a.assert != null) return sim.waitFor(a.assert, a.timeout).then(function (ok) { res({ ok: !!ok, assert: a.assert }); });
      if (a.log != null) return res({ ok: 1, log: a.log });
      /*🟢*/if (a.op != null) return sim.action(a, a).then(res);/*🟡🔴*/
      res({ ok: 0, error: 'unknown action' });
    } catch (e) { res({ ok: 0, error: String(e) }); } });
  }
  function Sim(adapter, meta) {
    var sim = { id: meta.id, name: meta.id, kind: meta.kind || adapter.kind, ready: adapter.ready || Promise.resolve({}), createdAt: now(), lastUsed: now(), ttl: meta.ttl || 0, _dead: false, _hooks: [], _m: { ops: 0, errs: 0, ms: 0, byName: {} }, _trace: [], _traceOn: false, _rec: null, _urls: meta.urls || [], _allowConsoleEval: (meta.allowConsoleEval != null ? meta.allowConsoleEval : DEFAULTS.allowConsoleEval) };
    sim._ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    function touch() { sim.lastUsed = now(); return sim; }
    function stopped() { return sim._dead; }
    sim.touch = touch; sim.timeout = function (ms) { sim.ttl = ms || 0; sim.createdAt = now(); return sim; }; sim.alive = function () { return !sim._dead; };
    sim.isDead = function () { if (sim._dead) return true; if (adapter.transport && adapter.transport.closed) return true; if (adapter.iframe && adapter.iframe.ownerDocument && !adapter.iframe.ownerDocument.contains(adapter.iframe)) return true; return false; };
    sim.onDestroy = function (f) { sim._hooks.push(f); return sim; }; sim.onEvent = function (k, f) { return EV.on(k, f); };
    sim.signal = function () { if (!sim._ctl) sim._ctl = new AbortController(); return sim._ctl.signal; };
    sim.abort = function () { try { sim._ctl.abort(); } catch (e) {} sim._ctl = new AbortController(); return true; };
    sim.metrics = function () { return JSON.parse(JSON.stringify(sim._m)); };
    sim.trace = function (on, max) { sim._traceOn = (on !== false); if (max) DEFAULTS.traceMax = max; return sim._trace; };
    sim._note = function (name, ok, ms) { var m = sim._m; m.ops++; m.ms += ms; if (!ok) m.errs++; m.byName[name] = (m.byName[name] || 0) + 1; if (sim._traceOn) { sim._trace.push({ op: name, ok: ok ? 1 : 0, ms: ms, t: now() }); if (sim._trace.length > DEFAULTS.traceMax) sim._trace.shift(); } EV.emit('op', sim, { op: name, ok: ok ? 1 : 0, ms: ms }); };
    sim._call = function (name, args, opts) { opts = norm(opts); if (sim._dead) return Promise.resolve({ ok: 0, error: 'destroyed' }); var t0 = now(), sig = opts.signal || (DEFAULTS.autoAbort && sim._ctl ? sim._ctl.signal : null); var p = attempt(function () { return adapter.op(name, args, opts.timeout); }, opts); return withSignal(p, sig).then(function (v) { sim._note(name, 1, now() - t0); if (sim._rec) { try { sim._rec.push({ op: name, args: args }); } catch (e) {} } return { ok: 1, value: v }; }, function (e) { sim._note(name, 0, now() - t0); return { ok: 0, error: String((e && e.message) || e) }; }); };
    sim.run = function (code, opts) { touch(); return sim._call('run', { code: code }, opts); };
    sim.action = function (a, opts) { touch(); return sim._call('dom', { a: a }, opts); };
    sim.appEval = function (code, opts) { touch(); opts = norm(opts); return sim._call('appEval', { code: code, delay: opts.delay, allowConsoleEval: opts.allowConsoleEval != null ? opts.allowConsoleEval : sim._allowConsoleEval }, opts).then(function (r) { return (r && r.ok && r.value && typeof r.value === 'object' && 'ok' in r.value) ? r.value : r; }); };
    sim.loadIntoApp = function (u, opts) { touch(); return asSource(u).then(function (t) { return sim.appEval(t, opts); }); };
    sim.info = function () { touch(); return adapter.op('info', {}); };
    sim.value = function (sel, opts) { return sim.action({ op: 'value', sel: sel }, opts); };
    sim.text = function (sel, opts) { return sim.action({ op: 'text', sel: sel }, opts); };
    sim.count = function (sel, opts) { return sim.action({ op: 'count', sel: sel }, opts); };
    sim.loadScript = function (u, opts) { touch(); return asSource(u).then(function (t) { return sim.run(t, opts); }); };
    sim.logs = function () { touch(); return adapter.op('logs', {}); };
    sim.errs = function () { touch(); return adapter.op('errs', {}); };
    sim.clearLogs = function () { return adapter.op('clear', {}); };
    sim.publish = function (ch, data, to) { touch(); bus.publish(ch, data, { from: sim.id, to: to }); return true; };
    sim.on = function (ch, fn, opt) { opt = opt || {}; return bus.subscribe(ch, function (d, m) { m = m || {}; if (!opt.includeSelf && m.from === sim.id && m.via !== 'peer') return; if (m.to && m.to !== 'all' && m.to !== sim.id) return; fn(d, m); }); };
    sim.subscribe = sim.on;
    sim.one = function (a, opts) { touch(); return runAction(sim, a, opts); };
    sim.act = function (actions, opts) { opts = opts || {}; var out = []; var chain = actions.reduce(function (p, a) { return p.then(function () { return sim.one(a, opts).then(function (r) { out.push(r); }); }); }, Promise.resolve()).then(function () { return out; }); return opts.timeout ? race(chain, opts.timeout, 'act') : chain; };
    sim.command = function (a, opts) { return sim.one(a, norm(opts)); };
    sim.offline = function (v) { touch(); return sim._call('offline', { value: !!v }, {}); };
    sim.route = function (pattern, handler, opts) { var w = adapter.iframe && adapter.iframe.contentWindow; if (!w || !w.__sim) return { ok: 0, error: 'route only on iframe with prelude' }; opts = opts || {}; var rid = uid('rt'), times = (opts.times == null ? 0 : opts.times); w.__sim.handlers[rid] = function (u, i/*🟢*/, init/*🟡🔴*/) { if (times) { if (--times <= 0) sim.unroute(rid); } return handler(u, i, { win: w/*🟢*/, init: init || null, body: (init && init.body != null) ? init.body : ((i && i.body) || null), method: String((init && init.method) || (i && i.method) || 'GET').toUpperCase()/*🟡🔴*/ }); }; w.__sim.routes.push({ id: rid, method: opts.method || null, test: (pattern == null) ? function () { return true; } : (function (pp) { return function (u) { try { return (pp instanceof RegExp) ? pp.test(u) : String(u).indexOf(pp) !== -1; } catch (e) { return false; } }; })(pattern) }); return rid; };
    sim.unroute = function (rid) { var w = adapter.iframe && adapter.iframe.contentWindow; if (w && w.__sim) { w.__sim.routes = w.__sim.routes.filter(function (r) { return r.id !== rid; }); delete w.__sim.handlers[rid]; } };
    sim.clearRoutes = function () { var w = adapter.iframe && adapter.iframe.contentWindow; if (w && w.__sim) { w.__sim.routes.length = 0; w.__sim.handlers = {}; } };
    sim.waitFor = function (cond, timeout) { var t0 = now(), T = timeout || DEFAULTS.actionTimeout; return new Promise(function (res) { (function p() { if (stopped()) return res(false); sim.run('!!(' + cond + ')').then(function (r) { if (r.ok && r.value) return res(true); if (now() - t0 > T) return res(false); setTimeout(p, 100); }); })(); }); };
    sim.waitForNetworkIdle = function (timeout, quiet) { var t0 = now(), T = timeout || DEFAULTS.actionTimeout, q0 = now(), Q = quiet || 200; return new Promise(function (res) { (function p() { if (stopped()) return res(false); adapter.op('net', {}).then(function (n) { if (n) { q0 = now(); } else if (now() - q0 >= Q) return res(true); if (now() - t0 > T) return res(false); setTimeout(p, 60); }, function () { res(false); }); })(); }); };
    sim.waitForStable = function (timeout, quiet) { var t0 = now(), T = timeout || DEFAULTS.actionTimeout, last = -1, q0 = now(), Q = quiet || 200; return new Promise(function (res) { (function p() { if (stopped()) return res(false); adapter.op('stable', {}).then(function (n) { if (n !== last) { last = n; q0 = now(); } else if (now() - q0 >= Q) return res(true); if (now() - t0 > T) return res(false); setTimeout(p, 60); }, function () { res(false); }); })(); }); };
    sim.clock = { advance: function (ms) { return sim._call('clock', { co: 'advance', ms: ms }, {}); }, set: function (ms) { return sim._call('clock', { co: 'set', ms: ms }, {}); }, now: function () { return sim._call('clock', { co: 'now' }, {}); }, pending: function () { return sim._call('clock', { co: 'pending' }, {}); } };
    sim.record = function (on) { sim._rec = (on === false) ? null : []; return sim; };
    sim.replay = function (rec) { var list = rec || sim._rec || []; return list.reduce(function (p, e) { return p.then(function () { return sim._call(e.op, e.args, {}); }); }, Promise.resolve()).then(function () { return true; }, function () { return false; }); };
    sim.report = function () { return { id: sim.id, kind: sim.kind, name: sim.name, ready: /*🟢*/(adapter.isReady != null ? !!adapter.isReady : true)/*🟡!!adapter.ready🔴*/, age: now() - sim.createdAt, idle: now() - sim.lastUsed, ttl: sim.ttl, dead: sim.isDead(), versionMismatch: !!adapter.versionMismatch }; };
    sim.destroy = function () {
      if (sim._dead) return true; sim._dead = true;
      try { sim.abort(); } catch (e) {}
      sim._hooks.splice(0).forEach(function (f) { try { f(sim); } catch (e) {} });
      try { adapter.close(); } catch (e) {}
      if (adapter.transport) bus.removeTransport(adapter.transport);
      sim._urls.forEach(function (u) { var i = TRACK.urls.indexOf(u); if (i >= 0) TRACK.urls.splice(i, 1); try { URL.revokeObjectURL(u); } catch (e) {} });
      if (adapter.iframe) { var j = TRACK.iframes.indexOf(adapter.iframe); if (j >= 0) TRACK.iframes.splice(j, 1); try { adapter.iframe.remove(); } catch (e) {} }
      try { if (sim.kind === 'tab' && sim.win && !sim.win.closed) sim.win.close(); } catch (e) {}
      delete registry[sim.id]; EV.emit('remove', sim); if (!ids().length) watchdog(false); return true;
    };
    /*🟢*/delete reserving[sim.id];/*🟡🔴*/ registry[sim.id] = sim; EV.emit('add', sim); if (DEFAULTS.autoGc) watchdog(true); return sim;
  }
  var bus = (function () {
    var subs = [], trs = [];
    function emit(ch, data, meta) { meta = meta || {}; subs.slice().forEach(function (s) { if (s.ch === '*' || s.ch === ch) { try { s.fn(data, meta, ch); } catch (e) {} } }); }
    function publish(ch, data, opt) { opt = opt || {}; var meta = { from: opt.from || null, to: opt.to || null, via: opt.via || 'local' }; emit(ch, data, meta); trs.slice().forEach(function (t) { try { t.send({ __sim: 1, op: 'pub', channel: ch, data: data, from: meta.from, to: meta.to }); } catch (e) {} }); }
    function subscribe(ch, fn) { var s = { ch: ch, fn: fn }; subs.push(s); return function () { var i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; }
    function add(t) { if (!t) return null; trs.push(t); t.on(function (m) { if (m && m.__sim === 1 && m.op === 'pub') emit(m.channel, m.data, { from: m.from || null, to: m.to || null, via: 'peer' }); }); return t; }
    function remove(t) { var i = trs.indexOf(t); if (i >= 0) trs.splice(i, 1); }
    return { emit: emit, publish: publish, subscribe: subscribe, addTransport: add, removeTransport: remove, transports: trs, subscribers: subs };
  })();
  function inputsAdd(cfg) { cfg = cfg || {}; if (cfg.type === 'poll') { var stop = false; (function loop() { if (stop) return; fetch(cfg.url).then(function (r) { return r.json(); }).then(function (d) { bus.emit(cfg.channel || 'poll', cfg.map ? cfg.map(d) : d, { via: 'poll' }); }).catch(function () {}).then(function () { if (!stop) setTimeout(loop, cfg.interval || 2000); }); })(); /*🟢*/var ph = { kind: 'poll', close: function () { stop = true; var i = TRACK.polls.indexOf(ph); if (i >= 0) TRACK.polls.splice(i, 1); } }; TRACK.polls.push(ph); return ph;/*🟡return { kind: 'poll', close: function () { stop = true; } };🔴*/ } var t = transportFrom(cfg); if (t) bus.addTransport(t); return t; }
  function exposeBridge(html, spec) {
    try {
      if (spec && spec.bridge === false) return html;
      var inject = (spec && spec.bridgeCode) || DEFAULTS.bridgeCode;
      var pats = (spec && spec.bridgePattern) ? [spec.bridgePattern] : [/\(\s*async\s*\(\s*\)\s*=>\s*\{/, /\(\s*function\s*\(\s*\)\s*\{/, /\(\s*\(\s*\)\s*=>\s*\{/];
      for (var i = 0; i < pats.length; i++) { if (pats[i].test(html)) return html.replace(pats[i], function (m) { return m + inject; }); }
    } catch (e) {}
    return html;
  }
  function prelude(opt) {
    var p = []; p.push('(function(){var W=window;W.__sim={routes:[],handlers:{},net:0,mut:0,offline:false};');
    /*🟢*/var isoOn = function (k, alias) { var I = opt.isolate; if (I === false) return false; if (I && typeof I === 'object' && I[k] === false) return false; if (alias && opt[alias] === false) return false; return true; };
    if (opt.isolate !== false) {
      p.push("var __pf=" + JSON.stringify(nsPrefix(opt.ns, opt._simId)) + ";var __NS=" + JSON.stringify(opt.ns != null ? String(opt.ns) : null) + ";W.__sim.prefix=__pf;W.__sim.ns=__NS;W.__sim.dbs=[];W.__sim.iso={};var __sh=null;try{if(__NS!=null){var __P=W.parent;__sh=(__P&&__P!==W&&__P.__simShared&&__P.__simShared[__NS])||null}}catch(e){}if(__sh){__sh.wins=__sh.wins.filter(function(w){try{return w&&!w.closed&&!!w.document}catch(e){return false}});__sh.wins.push(W)}var __note=__sh?function(k,o,n){__sh.wins.forEach(function(w2){if(w2===W)return;try{w2.dispatchEvent(new w2.StorageEvent('storage',{key:k,oldValue:o,newValue:n,url:String(W.location.href)}))}catch(x){}})}:null;function __mkS(m0,cb){var m=m0||new Map(),H=Object.prototype.hasOwnProperty;var put=function(k,v){k=String(k);v=String(v);var o=m.has(k)?m.get(k):null;m.set(k,v);if(cb&&o!==v)cb(k,o,v)},del=function(k){k=String(k);if(!m.has(k))return;var o=m.get(k);m.delete(k);if(cb)cb(k,o,null)};var api={getItem:function(k){k=String(k);return m.has(k)?m.get(k):null},setItem:put,removeItem:del,clear:function(){if(!m.size)return;m.clear();if(cb)cb(null,null,null)},key:function(i){return Array.from(m.keys())[i]||null}};if(typeof Proxy==='undefined'){Object.defineProperty(api,'length',{get:function(){return m.size}});return api}return new Proxy(api,{get:function(t,k){if(k==='length')return m.size;if(typeof k==='symbol'||H.call(api,k))return api[k];k=String(k);return m.has(k)?m.get(k):undefined},set:function(t,k,v){put(k,v);return true},deleteProperty:function(t,k){del(k);return true},has:function(t,k){return m.has(String(k))||H.call(api,k)},ownKeys:function(){return Array.from(m.keys())},getOwnPropertyDescriptor:function(t,k){k=String(k);return m.has(k)?{value:m.get(k),writable:true,enumerable:true,configurable:true}:undefined}})}");
      if (isoOn('localStorage')) p.push("var __ls=__sh?__mkS(__sh.ls,__note):__mkS();var __ok=false;try{Object.defineProperty(W,'localStorage',{configurable:true,get:function(){return __ls}});__ok=(W.localStorage===__ls)}catch(e){try{W.localStorage=__ls;__ok=true}catch(e2){}}W.__sim.hasLS=W.__sim.iso.localStorage=__ok;");
      if (isoOn('sessionStorage', 'isolateSession')) p.push("var __ss=__mkS();try{Object.defineProperty(W,'sessionStorage',{configurable:true,get:function(){return __ss}});W.__sim.hasSS=W.__sim.iso.sessionStorage=(W.sessionStorage===__ss)}catch(e){W.__sim.iso.sessionStorage=false}");
      if (isoOn('indexedDB', 'isolateIdb')) p.push("try{var __ri=W.indexedDB;if(__ri){var __fi={open:function(n,v){n=__pf+n;if(W.__sim.dbs.indexOf(n)<0)W.__sim.dbs.push(n);return (v===undefined)?__ri.open(n):__ri.open(n,v)},deleteDatabase:function(n){return __ri.deleteDatabase(__pf+n)},cmp:function(a,b){return __ri.cmp(a,b)},databases:function(){return __ri.databases?__ri.databases().then(function(l){return l.filter(function(d){return d.name.indexOf(__pf)===0}).map(function(d){return {name:d.name.slice(__pf.length),version:d.version}})}):Promise.resolve([])}};Object.defineProperty(W,'indexedDB',{configurable:true,get:function(){return __fi}});W.__sim.hasIDB=W.__sim.iso.indexedDB=(W.indexedDB===__fi)}}catch(e){W.__sim.iso.indexedDB=false}");
      if (isoOn('broadcast', 'isolateBroadcast')) p.push("try{var __RB=W.BroadcastChannel;if(__RB){var __B=function(n){return new __RB(__pf+n)};__B.prototype=__RB.prototype;W.BroadcastChannel=__B;W.__sim.hasBC=W.__sim.iso.broadcast=true}}catch(e){W.__sim.iso.broadcast=false}");
      if (isoOn('cookies')) p.push("try{var __ck=__sh?__sh.ck:new Map();Object.defineProperty(W.document,'cookie',{configurable:true,get:function(){var o=[];__ck.forEach(function(v,k){o.push(k?k+'='+v:v)});return o.join('; ')},set:function(s){s=String(s);var pa=s.split(';'),kv=pa[0],i=kv.indexOf('=');var k=(i<0?'':kv.slice(0,i)).trim(),v=(i<0?kv:kv.slice(i+1)).trim();var del=pa.slice(1).some(function(a){a=a.trim().toLowerCase();return /^max-age=(0|-)/.test(a)||(a.indexOf('expires=')===0&&new Date(a.slice(8))<new Date())});if(del)__ck.delete(k);else __ck.set(k,v)}});W.__sim.iso.cookies=true}catch(e){W.__sim.iso.cookies=false}");
      if (isoOn('caches')) p.push("try{var __rc=W.caches;if(__rc){var __cs={open:function(n){return __rc.open(__pf+n)},has:function(n){return __rc.has(__pf+n)},'delete':function(n){return __rc['delete'](__pf+n)},keys:function(){return __rc.keys().then(function(l){return l.filter(function(k){return k.indexOf(__pf)===0}).map(function(k){return k.slice(__pf.length)})})},match:function(r,o){o=o||{};if(o.cacheName)return __rc.match(r,Object.assign({},o,{cacheName:__pf+o.cacheName}));return __cs.keys().then(function(ks){var i=0;function nx(){if(i>=ks.length)return undefined;return __rc.open(__pf+ks[i++]).then(function(c){return c.match(r,o)}).then(function(x){return x||nx()})}return nx()})}};Object.defineProperty(W,'caches',{configurable:true,get:function(){return __cs}});W.__sim.iso.caches=(W.caches===__cs)}}catch(e){W.__sim.iso.caches=false}");
      if (isoOn('locks')) p.push("try{var __rl=W.navigator&&W.navigator.locks;if(__rl){var __lk={request:function(n){var a=[].slice.call(arguments);a[0]=__pf+n;return __rl.request.apply(__rl,a)},query:function(){return __rl.query().then(function(q){function f(l){return (l||[]).filter(function(x){return x.name.indexOf(__pf)===0}).map(function(x){return Object.assign({},x,{name:x.name.slice(__pf.length)})})}return {held:f(q.held),pending:f(q.pending)}})}};Object.defineProperty(W.navigator,'locks',{configurable:true,get:function(){return __lk}});W.__sim.iso.locks=(W.navigator.locks===__lk)}}catch(e){W.__sim.iso.locks=false}");
      if (isoOn('history')) p.push("try{var __cl=function(x){if(x==null)return null;try{return W.structuredClone?W.structuredClone(x):JSON.parse(JSON.stringify(x))}catch(e){return x}};var __hs=[{state:null,url:String(W.location.href)}],__hi=0;var __pop=function(){var st=__hs[__hi].state,e;try{e=new W.PopStateEvent('popstate',{state:st})}catch(x){e=new W.Event('popstate');try{e.state=st}catch(y){}}setTimeout(function(){W.dispatchEvent(e)},0)};var __vh={scrollRestoration:'auto',pushState:function(s,t,u){__hs=__hs.slice(0,__hi+1);__hs.push({state:__cl(s),url:u==null?__hs[__hi].url:String(u)});__hi++},replaceState:function(s,t,u){__hs[__hi]={state:__cl(s),url:u==null?__hs[__hi].url:String(u)}},go:function(d){d=d|0;if(!d)return;var n=__hi+d;if(n<0||n>=__hs.length)return;__hi=n;__pop()},back:function(){__vh.go(-1)},forward:function(){__vh.go(1)}};Object.defineProperty(__vh,'length',{get:function(){return __hs.length}});Object.defineProperty(__vh,'state',{get:function(){return __hs[__hi].state}});Object.defineProperty(W,'history',{configurable:true,get:function(){return __vh}});W.__sim.iso.history=(W.history===__vh);W.__sim.historyLog=function(){return {index:__hi,entries:__hs.slice()}}}catch(e){W.__sim.iso.history=false}");
    }/*🟡if (opt.isolate !== false) { p.push("var __s=new Map();var __ls={getItem:function(k){k=String(k);return __s.has(k)?__s.get(k):null},setItem:function(k,v){__s.set(String(k),String(v))},removeItem:function(k){__s.delete(String(k))},clear:function(){__s.clear()},key:function(i){return Array.from(__s.keys())[i]||null},get length(){return __s.size}};"); p.push("var __ok=false;try{Object.defineProperty(W,'localStorage',{configurable:true,get:function(){return __ls}});__ok=(W.localStorage===__ls)}catch(e){try{W.localStorage=__ls;__ok=true}catch(e2){}}W.__sim.hasLS=__ok;"); }🔴*/
    if (opt.trackStable) p.push("try{if(W.MutationObserver){new W.MutationObserver(function(){W.__sim.mut++;}).observe(W.document.documentElement,{subtree:true,childList:true});}}catch(e){}");
    if (opt.clock) p.push('(' + clockInstall.toString() + ')(W);');
    p.push("var __of=(W.fetch&&W.fetch.bind)?W.fetch.bind(W):W.fetch;");
    p.push("function __n(v){var R=W.Response;try{if(v instanceof R)return v}catch(e){}if(typeof v==='string')return new R(v,{status:200});if(v&&typeof v==='object'){var h=v.headers||{'content-type':'application/json'},b=v.body;if(b&&typeof b==='object'&&!(b instanceof W.Blob)){try{b=JSON.stringify(b)}catch(e){}}return new R(b==null?'':b,{status:v.status||200,headers:h})}return new R('',{status:200})}");
    p.push("if(__of)W.fetch=function(input,init){try{if(W.__sim.offline)return Promise.reject(new TypeError('Failed to fetch (sim offline)'));var url=(typeof input==='string')?input:(input&&input.url)||'';var method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();var rs=(W.__sim&&W.__sim.routes)||[];for(var i=0;i<rs.length;i++){var r=rs[i];if(r.method&&r.method!==method)continue;var hit=false;try{hit=r.test(url,input,init)}catch(e){}if(hit){W.__sim.net++;var out;try{out=W.__sim.handlers[r.id](url,input,init)}catch(e){out={status:500,body:'handler error: '+e.message}}var run=function(o){return Promise.resolve(o).then(__n).then(function(res){W.__sim.net--;return res},function(e){W.__sim.net--;throw e})};/*🟢*/var sig=(init&&init.signal)||(input&&input.signal)||null,AE=function(){return new W.DOMException('The user aborted a request.','AbortError')};if(sig&&sig.aborted){W.__sim.net--;return Promise.reject(AE())}if(out&&out.delay)return new Promise(function(res,rej){var dn=0,tm=setTimeout(function(){if(dn)return;dn=1;if(sig)sig.removeEventListener('abort',ab);run(out).then(res,rej)},out.delay);function ab(){if(dn)return;dn=1;clearTimeout(tm);W.__sim.net--;rej(AE())}if(sig)sig.addEventListener('abort',ab)});return run(out)/*🟡return (out&&out.delay)?new Promise(function(res){setTimeout(function(){run(out).then(res,res)},out.delay)}):run(out)🔴*/}}}catch(e){}return __of(input,init)};");
    p.push('})();'); return '<script>' + p.join('') + '<\/script>';
  }
  function injectAll(html, src, extra) { html = exposeBridge(html, src); var splice = (src.base ? '<base href="' + String(src.base) + '">' : '') + prelude(src) + (extra ? '<script>' + extra + '<\/script>' : ''); var i = html.search(/<script[\s>]/i); if (i >= 0) return html.slice(0, i) + splice + html.slice(i); var j = html.search(/<\/head>/i); if (j >= 0) return html.slice(0, j) + splice + html.slice(j); var k = html.search(/<\/body>/i); if (k >= 0) return html.slice(0, k) + splice + html.slice(k); return html + splice; }
  function optOf(src, k) { return src[k] === undefined ? DEFAULTS[k] : src[k]; }
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
      o.console = merge({}, DEFAULTS.console, o.console || {});
      o.base = o.base || DEFAULTS.base; o.runtime = o.runtime || DEFAULTS.runtime;
      o.ttl = (o.ttl == null ? DEFAULTS.ttl : o.ttl);
      if (o.runtime === 'worker' || o.runtime === 'remote') return o;
      if (o.html) return o;
      if (o.url) return fetchText(o.url).then(function (t) { o.html = t; o.base = o.base || o.url; return o; }).catch(function () { o.src = o.url; o.limited = true; return o; });
      if (o.target || o.src) { o.src = o.src || o.target; o.limited = true; return o; }
      throw Error('SIM: spec has no html/url/src');
    });
  }
  function makeIframe(src, id) {
    if (!hasDOM) return Promise.reject(Error('SIM: iframe runtime needs DOM'));
    return new Promise(function (resolve) {
      var ifr = document.createElement('iframe');
      ifr.id = id; ifr.setAttribute('sandbox', src.sandbox || DEFAULTS.sandbox);
      ifr.style.cssText = 'position:fixed;left:-12000px;top:0;width:' + optOf(src, 'width') + 'px;height:' + optOf(src, 'height') + 'px;border:0';
      document.body.appendChild(ifr); TRACK.iframes.push(ifr);
      var isDoc = !!src.html;
      /*🟢*/src._simId = id; if (src.ns != null && src.isolate !== false) sharedOf(String(src.ns));/*🟡🔴*/
      if (isDoc) { try { ifr.srcdoc = injectAll(src.html, src, ''); } catch (e) { ifr.srcdoc = src.html; } } else { ifr.src = src.src; }
      var done = false;
      function fin() {
        if (done) return; done = true;
        var adapter = DirectAdapter(OPS(ifr.contentWindow, { consoleAdapter: src.console, maxMessage: optOf(src, 'maxMessage'), maxLogs: optOf(src, 'maxLogs'), version: VERSION }), ifr);
        var sim = Sim(adapter, { id: id, ttl: src.ttl, allowConsoleEval: optOf(src, 'allowConsoleEval') });
        sim.kind = 'iframe';
        /*🟢*/sim.onDestroy(function () { try { var sh = src.ns != null && SHARED[String(src.ns)], cw = ifr.contentWindow; if (sh) sh.wins = sh.wins.filter(function (w) { return w !== cw; }); } catch (e) {} var keep = src.keep != null ? src.keep : (src.keepDb != null ? src.keepDb : src.ns != null); if (keep === true) return; var pf = nsPrefix(src.ns, id); try { var w = ifr.contentWindow, dbs = (w && w.__sim && w.__sim.dbs) || []; if (!(keep && keep.indexedDB)) dbs.forEach(function (n) { try { indexedDB.deleteDatabase(n); } catch (e) {} }); } catch (e) {} try { if (!(keep && keep.caches) && G.caches) G.caches.keys().then(function (ks) { ks.forEach(function (k) { if (k.indexOf(pf) === 0) G.caches['delete'](k); }); }).catch(function () {}); } catch (e) {} });/*🟡🔴*/
        sim.win = function () { return ifr.contentWindow; };
        sim.doc = function () { return ifr.contentWindow && ifr.contentWindow.document; };
        sim.el = function (s) { var d = sim.doc(); return d ? d.querySelector(s) : null; };
        sim.all = function (s) { var d = sim.doc(); return d ? Array.prototype.slice.call(d.querySelectorAll(s)) : []; };
        sim.fire = function (n, t, i) { var w = ifr.contentWindow; if (n && w) try { n.dispatchEvent(new w.Event(t, Object.assign({ bubbles: true, cancelable: true }, i || {}))); } catch (e) {} };
        sim.report = function () { var d = sim.doc(), w = ifr.contentWindow; return { id: id, kind: 'iframe', ready: !!(d && d.readyState === 'complete'), isolated: !!(w && w.__sim && w.__sim.hasLS)/*🟢*/, isolation: (w && w.__sim && w.__sim.iso) || {}, isolatedAll: !!(w && w.__sim && w.__sim.iso && Object.keys(w.__sim.iso).length && Object.keys(w.__sim.iso).every(function (k) { return w.__sim.iso[k]; }))/*🟡🔴*/, hasBridge: !!(w && w.__app && w.__app.run), age: now() - sim.createdAt, idle: now() - sim.lastUsed, ttl: sim.ttl, dead: sim.isDead(), versionMismatch: false }; };
        resolve(sim);
      }
      function ok() { try { var w = ifr.contentWindow, d = w && w.document; if (!(d && d.readyState === 'complete' && d.body)) return false; if (isDoc && !w.__sim) return false; return true; } catch (e) { return false; } }
      ifr.addEventListener('load', function () { if (ok()) setTimeout(fin, 0); });
      var T = optOf(src, 'readyTimeout'), t0 = now();
      (function poll() { if (done) return; if (ok()) return fin(); if (now() - t0 > T) return fin(); setTimeout(poll, 50); })();
    });
  }
  function makeWorker(src, id) { if (typeof Worker === 'undefined') return Promise.reject(Error('SIM: no Worker support')); try { var url = URL.createObjectURL(new Blob([agentSource({ type: 'self', id: id, consoleAdapter: src.console, init: src.code || '', clock: optOf(src, 'clock'), maxMessage: optOf(src, 'maxMessage'), maxLogs: optOf(src, 'maxLogs') })], { type: 'text/javascript' })); TRACK.urls.push(url); var w = new Worker(url); TRACK.workers.push(w); var tr = transportFrom({ type: 'worker', worker: w }, id); var sim = Sim(TransportAdapter(tr, id), { id: id, ttl: src.ttl, urls: [url] }); sim.kind = 'worker'; /*🟢*/sim.onDestroy(function () { var i = TRACK.workers.indexOf(w); if (i >= 0) TRACK.workers.splice(i, 1); });/*🟡🔴*/ bus.addTransport(tr); return /*🟢*/Promise.race([sim.ready, sleep(optOf(src, 'readyTimeout'))])/*🟡sim.ready🔴*/.then(function () { return sim; }, function () { return sim; }); } catch (e) { return Promise.reject(Error('SIM worker: ' + e.message)); } }
  function makeTab(src, id) { if (!hasDOM || !G.open) return Promise.reject(Error('SIM: tab runtime needs window.open')); return resolveText(/*🟢*/src.html || src.url/*🟡src.url || src.html🔴*/ || '').then(function (html) { var name = uid('tab'); var agent = agentSource({ type: 'broadcast', name: name, me: id, id: id, consoleAdapter: src.console, clock: optOf(src, 'clock'), maxMessage: optOf(src, 'maxMessage'), maxLogs: optOf(src, 'maxLogs') }); var url = URL.createObjectURL(new Blob([injectAll(html, src, agent)], { type: 'text/html' })); TRACK.urls.push(url); var tr = transportFrom({ type: 'broadcast', name: name }, id); if (!tr) throw Error('SIM: BroadcastChannel required for tab'); var win = null; try { win = G.open(url, '_blank'); } catch (e) {} var sim = Sim(TransportAdapter(tr, id), { id: id, ttl: src.ttl, urls: [url] }); sim.kind = 'tab'; sim.win = win; bus.addTransport(tr); return Promise.race([sim.ready, sleep(optOf(src, 'readyTimeout'))]).then(function () { return sim; }); }); }
  function makeRemote(src, id) { var tr = transportFrom(src.transport || src, id); if (!tr) return Promise.reject(Error('SIM: remote needs a transport')); var sim = Sim(TransportAdapter(tr, id), { id: id, ttl: src.ttl }); sim.kind = 'remote'; bus.addTransport(tr); return /*🟢*/Promise.race([sim.ready, sleep(optOf(src, 'readyTimeout'))])/*🟡sim.ready🔴*/.then(function () { return sim; }, function () { return sim; }); }
  function reserveId(src) { if (src.id && /*🟢*/(registry[src.id] || reserving[src.id])/*🟡registry[src.id]🔴*/) { if (src.replace/*🟢*/ && registry[src.id]/*🟡🔴*/) registry[src.id].destroy(); else throw Error('SIM: id already in use: ' + src.id); } /*🟢*/var rid = (src.id && String(src.id)) || uid('sim'); reserving[rid] = 1; return rid;/*🟡return (src.id && String(src.id)) || uid('sim');🔴*/ }
  function make(spec) {
    return normalize(spec).then(function (src) {
      try {
        if (DEFAULTS.maxSims && ids().length >= DEFAULTS.maxSims && !src.force) throw Error('SIM: maxSims reached (' + DEFAULTS.maxSims + ')');
        var id = reserveId(src);
        /*🟢*/var pr = src.runtime === 'worker' ? makeWorker(src, id) : src.runtime === 'tab' ? makeTab(src, id) : src.runtime === 'remote' ? makeRemote(src, id) : makeIframe(src, id); return pr.then(function (x) { delete reserving[id]; return x; }, function (e) { delete reserving[id]; throw e; });/*🟡if (src.runtime === 'worker') return makeWorker(src, id);
        if (src.runtime === 'tab') return makeTab(src, id);
        if (src.runtime === 'remote') return makeRemote(src, id);
        return makeIframe(src, id);🔴*/
      } catch (e) { return Promise.reject(e); }
    });
  }
  function asTransport(x, id) { return (x && x.__simTransport) ? x : (transportFrom(x, id) || x); }
  function connect(t, id) { var tr = asTransport(t, id), realId = id || uid('sim'); var sim = Sim(TransportAdapter(tr, realId), { id: realId }); bus.addTransport(tr); return sim; }
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
  function kill(x) { var list; if (x == null) list = ids(); else if (typeof x === 'string') list = /*🟢*/registry[x] ? [x] : ids().filter(function (id) { return id.indexOf(x) === 0; });/*🟡ids().filter(function (id) { return id === x || id.indexOf(x) === 0; });🔴*/ else if (x instanceof RegExp) list = ids().filter(function (id) { return x.test(id); }); else if (Array.isArray(x)) list = x.slice(); else if (typeof x === 'function') list = ids().filter(function (id) { return x(registry[id], id); }); else if (x && x.id) list = [x.id]; else list = []; var n = 0; list.forEach(function (id) { if (registry[id]) { try { registry[id].destroy(); } catch (e) {} n++; } }); return n; }
  function killAll() { return kill(null); } function alive() { return ids().length; }
  function gc() { var n = 0; ids().forEach(function (id) { var s = registry[id], rm = false; try { if (s.isDead()) rm = true; else if (s.ttl && now() - s.createdAt > s.ttl) rm = true; else if (DEFAULTS.idleTimeout && now() - s.lastUsed > DEFAULTS.idleTimeout) rm = true; } catch (e) { rm = true; } if (rm) { try { s.destroy(); } catch (e) {} n++; } }); if (!ids().length) watchdog(false); return n; }
  function watchdog(on, ms) { if (ms) DEFAULTS.gcInterval = ms; if (watchdogTimer) { var wi = TRACK.timers.indexOf(watchdogTimer); if (wi >= 0) TRACK.timers.splice(wi, 1); clearInterval(watchdogTimer); watchdogTimer = 0; } if (on === false) return false; watchdogTimer = setInterval(gc, DEFAULTS.gcInterval); TRACK.timers.push(watchdogTimer); return true; }
  function on(k, f) { return EV.on(k, f); }
  function acquire(spec) { spec = spec || {}; if (spec.id && registry[spec.id]) registry[spec.id].destroy(); return make(spec); }
  function purge() {
    try { killAll(); } catch (e) {}
    TRACK.iframes.splice(0).forEach(function (f) { try { f.remove(); } catch (e) {} });
    TRACK.workers.splice(0).forEach(function (w) { try { w.terminate(); } catch (e) {} });
    TRACK.urls.splice(0).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    TRACK.timers.splice(0).forEach(function (t) { try { clearInterval(t); clearTimeout(t); } catch (e) {} });
    bus.transports.splice(0).forEach(function (t) { try { t.close && t.close(); } catch (e) {} });
    /*🟢*/TRACK.polls.splice(0).forEach(function (h) { try { h.close(); } catch (e) {} }); for (var rk in reserving) delete reserving[rk];/*🟡🔴*/
    bus.subscribers.length = 0; /*🟢*/for (var k in registry) delete registry[k];/*🟡registry = {};🔴*/ watchdog(false); panel(false); PANEL_T = 0;
    return true;
  }
  function clearAll() { return purge(); }
  /*🟢*/function dropNs(ns) { var list = ns == null ? Object.keys(SHARED) : [String(ns)]; var jobs = []; list.forEach(function (n) { var pf = nsPrefix(n); delete SHARED[n]; try { if (G.indexedDB && G.indexedDB.databases) jobs.push(G.indexedDB.databases().then(function (l) { l.forEach(function (d) { if (d.name && d.name.indexOf(pf) === 0) G.indexedDB.deleteDatabase(d.name); }); })); } catch (e) {} try { if (G.caches) jobs.push(G.caches.keys().then(function (ks) { ks.forEach(function (k) { if (k.indexOf(pf) === 0) G.caches['delete'](k); }); })); } catch (e) {} }); return Promise.all(jobs.map(function (j) { return j.catch(function () {}); })).then(function () { return list; }); }
  function namespaces() { return Object.keys(SHARED).map(function (n) { return { ns: n, keys: SHARED[n].ls.size, cookies: SHARED[n].ck.size, sims: SHARED[n].wins.length }; }); }/*🟡🔴*/
  function panel(on) {
    if (!hasDOM) return null;
    var el = document.getElementById('simPanel');
    if (on === false) { if (PANEL_T) { clearInterval(PANEL_T); PANEL_T = 0; } if (el) el.remove(); return null; }
    if (el) return el;
    el = document.createElement('div'); el.id = 'simPanel';
    el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:99999;background:#111;color:#ddd;border:1px solid #333;border-radius:8px;padding:8px;font:11px monospace;max-height:40vh;overflow:auto';
    document.body.appendChild(el);
    function render() { if (!document.body.contains(el)) return; el.innerHTML = '<b>SIM ' + VERSION + '</b> · ' + alive() + '<br>' + map().map(function (m) { return m.id + ' [' + m.kind + ']' + (m.dead ? ' 💀' : '') + ' <a href="#" data-kill="' + m.id + '">kill</a>'; }).join('<br>'); }
    el.addEventListener('click', function (e) { var t = e.target; if (t && t.getAttribute && t.getAttribute('data-kill')) { kill(t.getAttribute('data-kill')); render(); } });
    PANEL_T = setInterval(render, 1000); TRACK.timers.push(PANEL_T); render(); return el;
  }
  function expect(actual) { return { toBe: function (x) { if (actual !== x) throw Error('expect ' + JSON.stringify(x) + ' got ' + JSON.stringify(actual)); return true; }, toEqual: function (x) { if (JSON.stringify(actual) !== JSON.stringify(x)) throw Error('expect ' + JSON.stringify(x)); return true; }, toBeTruthy: function () { if (!actual) throw Error('expect truthy'); return true; }, toContain: function (x) { if (String(actual).indexOf(x) < 0) throw Error('expect contain ' + x); return true; } }; }
  function configure(o) { merge(DEFAULTS, o || {}); return DEFAULTS; }
  function config(k, v) { if (k == null) return DEFAULTS; if (v === undefined) return DEFAULTS[k]; DEFAULTS[k] = v; return v; }
  function persist(on) { if (on === false) { try { G.localStorage.removeItem('dse_sim_config'); } catch (e) {} return false; } try { var c = {}; for (var k in DEFAULTS) if (own(DEFAULTS, k) && k !== 'console' && typeof DEFAULTS[k] !== 'function') c[k] = DEFAULTS[k]; G.localStorage.setItem('dse_sim_config', JSON.stringify(c)); return true; } catch (e) { return false; } }
  function loadConfig() { try { merge(DEFAULTS, JSON.parse(G.localStorage.getItem('dse_sim_config') || '{}')); } catch (e) {} return DEFAULTS; }
  function stats() { return { version: VERSION, sims: ids().length, iframes: TRACK.iframes.length, workers: TRACK.workers.length, urls: TRACK.urls.length, timers: TRACK.timers.length, /*🟢*/polls: TRACK.polls.length, /*🟡🔴*/transports: bus.transports.length, watchdog: !!watchdogTimer, simsDetail: map() }; }
  try { G.addEventListener('pagehide', function () { purge(); }); } catch (e) {}
  var SIM = {
    VERSION: VERSION, SID: SID, hasDOM: hasDOM, DEFAULTS: DEFAULTS,
    make: make, remote: remote, connect: connect, serve: serve, agent: agentSource, agentUrl: agentUrl, transport: transportFrom,
    bus: bus, inputs: { add: inputsAdd }, addInput: inputsAdd,
    ids: ids, list: ids, get: get, has: has, each: each, map: map, report: report,
    command: command, commandAll: commandAll, broadcast: broadcast,
    kill: kill, killAll: killAll, alive: alive, gc: gc, watchdog: watchdog, on: on, onChange: on, acquire: acquire,
    purge: purge, clearAll: clearAll, /*🟢*/dropNs: dropNs, namespaces: namespaces,/*🟡🔴*/ panel: panel, expect: expect, configure: configure, config: config,
    persist: persist, loadConfig: loadConfig, random: rng, stats: stats, TRACK: TRACK,
    load: function (u) { return fetchText(u).then(function (t) { try { return JSON.parse(t); } catch (e) { return t; } }); },
    revoke: function (u) { try { URL.revokeObjectURL(u); } catch (e) {} },
    registry: registry,
    util: { sleep: sleep, clamp: clamp, merge: merge, sse: function (frames) { var body = frames.map(function (f) { if (f === '[DONE]') return 'data: [DONE]\n\n'; if (typeof f === 'string') return /^data:/.test(f) ? (f.charAt(f.length - 1) === '\n' ? f : f + '\n\n') : ('data: ' + f + '\n\n'); return 'data: ' + JSON.stringify(f) + '\n\n'; }).join(''); return { status: 200, headers: { 'content-type': 'text/event-stream' }, body: body }; }, json: function (o, s) { return { status: s || 200, headers: { 'content-type': 'application/json' }, body: o }; }, text: function (t, s) { return { status: s || 200, body: t }; } }
  };
  if (DEFAULTS.panel) { try { setTimeout(function () { panel(true); }, 0); } catch (e) {} }
  return SIM;
})();
try { window.SIM = SIM; window.simulate = function (s) { return SIM.make(s); }; } catch (e) {}
try { if (typeof module !== 'undefined' && module.exports) module.exports = SIM; } catch (e) {}
