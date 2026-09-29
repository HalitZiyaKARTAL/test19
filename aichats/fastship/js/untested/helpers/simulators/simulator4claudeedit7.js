/* ============================================================================
   sim.js v4.3.1 (claudeedit7; header said v4.2.2 while code said 4.2.3) — self-managing simulation builder.
   - README: SIM.readme  /  SIM.help('topic')
   - idempotent load (reuse same version; purge previous on load)
   - app-scope via INJECTED BRIDGE (window.__app.run) — the eval console is
     OFF by default and, if enabled, auto-closes; never used for automation
   - resources tracked (iframes/workers/urls/timers) + SIM.purge()/stats()
   - caps (maxSims/maxLogs/maxQueue/maxMessage), retry/backoff, cancel(signal),
     version handshake, virtual clock, record/replay, route(delay/offline)
   ============================================================================ */
var SIM = (function () {
  if (typeof window !== 'undefined' && window.SIM && window.SIM.VERSION === /*🟢*/'4.3.1'/*🟡'4.2.3'🔴*/) return window.SIM;
  try { if (typeof window !== 'undefined' && window.SIM && window.SIM.purge) window.SIM.purge(); } catch (e) {}
  var VERSION = /*🟢*/'4.3.1'/*🟡'4.2.3'🔴*/;
  var G = (typeof self !== 'undefined') ? self : (typeof window !== 'undefined' ? window : this);
  var hasDOM = (typeof document !== 'undefined' && !!document.createElement);
  var SID = Math.random().toString(36).slice(2, 7);
  var seq = 0, registry = {}, watchdogTimer = 0, PANEL_T = 0;
  var TRACK = { iframes: [], workers: [], urls: [], timers: []/*🟢*/, polls: []/*🟡🔴*/ };/*🟢*/ var reserving = {}; var SHARED = (G.__simShared = G.__simShared || {}); function sharedOf(ns) { return SHARED[ns] || (SHARED[ns] = { ls: new Map(), ck: new Map(), wins: [] }); } function nsPrefix(ns, id) { return ns != null ? '__simns_' + ns + '_' : '__sim_' + (id || 'x') + '_'; }/*🟡🔴*/
  var DEFAULTS = {
    runtime: 'iframe', isolate: true, base: '', width: 1024, height: 768,
    readyTimeout: 20000, actionTimeout: 15000, idleTimeout: 0, ttl: 0,
    autoGc: true, gcInterval: 5000, maxSims: 0, maxLogs: 2000, maxQueue: 500, maxMessage: 4e6, /*🟢*/maxRequestChars: 0,/*🟡🔴*/
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
  /*🟢*/function tmo(t) { return t == null ? DEFAULTS.actionTimeout : t; }
  function waitReady(sim, cond, T) { var t0 = now(); return new Promise(function (res) { (function p() { if (sim._dead) return res(false); var q = typeof cond === 'function' ? Promise.resolve().then(function () { return cond(sim); }) : sim.run('!!(' + cond + ')').then(function (r) { return r.ok && r.value; }); q.then(function (v) { if (v) return res(true); if (now() - t0 > T) return res(false); setTimeout(p, 100); }, function () { if (now() - t0 > T) return res(false); setTimeout(p, 100); }); })(); }); }/*🟡🔴*/
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
      if (!m.allowConsoleEval) return Promise.reject(Error(/*🟢*/'no __app bridge (no injection pattern matched?): set spec.bridgePattern / bridgeCode, or allowConsoleEval:true'/*🟡'no __app bridge; console eval disabled (set allowConsoleEval)'🔴*/));
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
    /*🟢*/function rawOf(r) { return (r && r.ok) ? r.value : Promise.reject(Error((r && r.error) || 'op failed')); }
    sim.op = function (name, args, opts) { touch(); return sim._call(name, args || {}, norm(opts)); };
    sim.info = function (opts) { touch(); return sim._call('info', {}, norm(opts)).then(rawOf); };/*🟡sim.info = function () { touch(); return adapter.op('info', {}); };🔴*/
    sim.value = function (sel, opts) { return sim.action({ op: 'value', sel: sel }, opts); };
    sim.text = function (sel, opts) { return sim.action({ op: 'text', sel: sel }, opts); };
    sim.count = function (sel, opts) { return sim.action({ op: 'count', sel: sel }, opts); };
    sim.loadScript = function (u, opts) { touch(); return asSource(u).then(function (t) { return sim.run(t, opts); }); };
    /*🟢*/sim.logs = function (opts) { touch(); return sim._call('logs', {}, norm(opts)).then(rawOf); };/*🟡sim.logs = function () { touch(); return adapter.op('logs', {}); };🔴*/
    /*🟢*/sim.errs = function (opts) { touch(); return sim._call('errs', {}, norm(opts)).then(rawOf); };/*🟡sim.errs = function () { touch(); return adapter.op('errs', {}); };🔴*/
    /*🟢*/sim.clearLogs = function (opts) { return sim._call('clear', {}, norm(opts)).then(rawOf); };/*🟡sim.clearLogs = function () { return adapter.op('clear', {}); };🔴*/
    sim.publish = function (ch, data, to) { touch(); bus.publish(ch, data, { from: sim.id, to: to }); return true; };
    sim.on = function (ch, fn, opt) { opt = opt || {}; return bus.subscribe(ch, function (d, m) { m = m || {}; if (!opt.includeSelf && m.from === sim.id && m.via !== 'peer') return; if (m.to && m.to !== 'all' && m.to !== sim.id) return; fn(d, m); }); };
    sim.subscribe = sim.on;
    sim.one = function (a, opts) { touch(); return runAction(sim, a, opts); };
    sim.act = function (actions, opts) { opts = opts || {}; var out = []; var chain = actions.reduce(function (p, a) { return p.then(function () { return sim.one(a, opts).then(function (r) { out.push(r); }); }); }, Promise.resolve()).then(function () { return out; }); return opts.timeout ? race(chain, opts.timeout, 'act') : chain; };
    sim.command = function (a, opts) { return sim.one(a, norm(opts)); };
    sim.offline = function (v) { touch(); return sim._call('offline', { value: !!v }, {}); };
    sim.route = function (pattern, handler, opts) { var w = adapter.iframe && adapter.iframe.contentWindow; if (!w || !w.__sim) return { ok: 0, error: 'route only on iframe with prelude' }; opts = opts || {}; var rid = uid('rt'), times = (opts.times == null ? 0 : opts.times); w.__sim.handlers[rid] = function (u, i/*🟢*/, init/*🟡🔴*/) { if (times) { if (--times <= 0) sim.unroute(rid); } return handler(u, i, { win: w/*🟢*/, init: init || null, body: (init && init.body != null) ? init.body : ((i && i.body) || null), headers: (init && init.headers) || (i && i.headers) || null, method: String((init && init.method) || (i && i.method) || 'GET').toUpperCase()/*🟡🔴*/ }); }; w.__sim.routes.push({ id: rid, method: opts.method || null, test: (pattern == null) ? function () { return true; } : (function (pp) { return function (u) { try { return (pp instanceof RegExp) ? pp.test(u) : String(u).indexOf(pp) !== -1; } catch (e) { return false; } }; })(pattern) }); return rid; };
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
      for (var i = 0; i < pats.length; i++) { if (pats[i].test(html)) { /*🟢*/if (spec) spec._bridged = true;/*🟡🔴*/ return html.replace(pats[i], function (m) { return m + inject; }); } }
      /*🟢*/if (spec) spec._bridged = false; EV.emit('bridgeMissing', spec); try { console.warn('[sim] bridge not injected: no pattern matched; appEval needs spec.bridgePattern / bridgeCode or allowConsoleEval'); } catch (e) {}/*🟡🔴*/
    } catch (e) {}
    return html;
  }
  /*🟢*/// ---- isolation: compiled per sim in the page (compileIso), installed inside the sim realm (isoInstall) ----
  var ISO_FEATURES = ['localStorage', 'sessionStorage', 'cookies', 'indexedDB', 'broadcast', 'caches', 'locks', 'history'];
  var ISO_PER_TAB = { sessionStorage: 1, history: 1 }, ISO_ALIAS = { sessionStorage: 'isolateSession', indexedDB: 'isolateIdb', broadcast: 'isolateBroadcast' };
  function compileIso(src, id) {
    var I = src.isolate, out = {}; if (I === 'none') I = false; else if (I === 'full' || I === 'all') I = true; else if (I === 'storage') I = { sessionStorage: false, cookies: false, broadcast: false, caches: false, locks: false, history: false };
    ISO_FEATURES.forEach(function (k) {
      var r = (I === false) ? false : (I && typeof I === 'object' && own(I, k)) ? I[k] : (ISO_ALIAS[k] && src[ISO_ALIAS[k]] === false) ? false : true;
      if (r === false) { out[k] = { off: true }; return; }
      var isStore = r && typeof r === 'object' && (r instanceof Map || typeof r.getItem === 'function' || (typeof r.get === 'function' && typeof r.set === 'function'));
      var f = (typeof r === 'string') ? { ns: r } : isStore ? { store: r } : (r && typeof r === 'object') ? Object.assign({}, r) : {};
      if (!own(f, 'ns') && !ISO_PER_TAB[k] && src.ns != null) f.ns = src.ns;
      if (f.prefix == null) f.prefix = nsPrefix(f.ns, id);
      if (f.ns != null) sharedOf(String(f.ns));
      if (f.ns != null && !f.store && (k === 'localStorage' || k === 'sessionStorage' || k === 'cookies')) { var g = sharedOf(String(f.ns)); f.store = k === 'localStorage' ? g.ls : k === 'cookies' ? g.ck : (g.ss || (g.ss = new Map())); if (k === 'localStorage') f.group = g; }
      if (f.keep == null) { var K = src.keep != null ? src.keep : src.keepDb; f.keep = (K != null && typeof K === 'object') ? !!K[k] : (K != null ? !!K : f.ns != null); }
      out[k] = f;
    });
    return out;
  }
  function isoNameP(f, n) { n = String(n); var p = f.pass, m = f.map, pass = (p == null || p === false) ? false : p === true ? true : typeof p === 'function' ? !!p(n) : typeof p === 'string' ? p === n : Array.isArray(p) ? p.indexOf(n) >= 0 : (p && typeof p.test === 'function') ? (p.lastIndex = 0, p.test(n)) : false; if (pass) return { name: n, own: false }; var mv = typeof m === 'function' ? m(n) : (m && own(m, n) ? m[n] : null); if (mv != null) return { name: String(mv), own: false }; var pre = f.prefix == null ? '' : String(f.prefix); return { name: pre + n, own: !!pre }; }
  function seedIdb(src) {
    var f = src._iso && src._iso.indexedDB, fac = f && (f.impl || G.indexedDB);
    if (!f || f.off || f.absent || !f.seed || !fac) return Promise.resolve();
    src._seededDbs = src._seededDbs || [];
    return Promise.all(Object.keys(f.seed).map(function (db) {
      var d = f.seed[db] || {}, ver = d.version || 1, stores = d.stores || d, r = isoNameP(f, db);
      return new Promise(function (res) {
        var fresh = false, q; try { q = fac.open(r.name, ver); } catch (e) { return res(); }
        q.onupgradeneeded = function (e) { if (e.oldVersion !== 0) return; fresh = true; var dbh = q.result; Object.keys(stores).forEach(function (sn) { if (!d.stores && sn === 'version') return; var sd = stores[sn] || {}, o = {}; if (sd.keyPath != null) o.keyPath = sd.keyPath; if (sd.autoIncrement) o.autoIncrement = true; var os = dbh.createObjectStore(sn, o); var recs = sd.records != null ? sd.records : ((sd.keyPath != null || sd.autoIncrement) ? [] : sd); if (Array.isArray(recs)) recs.forEach(function (v) { os.put(v); }); else Object.keys(recs).forEach(function (k) { os.put(recs[k], k); }); }); };
        q.onsuccess = function () { try { q.result.close(); } catch (e) {} if (fresh && r.own) src._seededDbs.push(r.name); res(); };
        q.onerror = q.onblocked = function () { res(); };
      });
    }));
  }
  function prepIso(src, id) { src._simId = id; if (src.isolate === false) return Promise.resolve(); src._iso = compileIso(src, id); (G.__simSpecs = G.__simSpecs || {})[id] = src._iso; return seedIdb(src); }
  function plainIso(spec) { var o = {}; for (var k in spec) { if (!own(spec, k)) continue; var f = spec[k], c = {}; for (var j in f) { if (!own(f, j) || j === 'store' || j === 'group' || j === 'impl') continue; var v = f[j]; if (typeof v === 'function' || v instanceof RegExp) continue; c[j] = v; } o[k] = c; } try { return JSON.parse(JSON.stringify(o)); } catch (e) { return {}; } }
  function isoInstall(W, S) {
    var H = Object.prototype.hasOwnProperty, iso = W.__sim.iso = {}; W.__sim.dbs = []; W.__sim.caches = []; S = S || {};
    var ABS = { localStorage: [W, 'localStorage'], sessionStorage: [W, 'sessionStorage'], cookies: [W.document, 'cookie'], indexedDB: [W, 'indexedDB'], broadcast: [W, 'BroadcastChannel'], caches: [W, 'caches'], locks: [W.navigator, 'locks'], history: [W, 'history'] };
    Object.keys(ABS).forEach(function (k) { var f = S[k]; if (f && f.absent && ABS[k][0]) { try { Object.defineProperty(ABS[k][0], ABS[k][1], { configurable: true, get: function () { return undefined; }, set: function () {} }); iso[k] = 'absent'; } catch (e) { iso[k] = false; } } });
    function tester(p) { if (p == null || p === false) return function () { return false; }; if (p === true) return function () { return true; }; if (typeof p === 'function') return function (n) { try { return !!p(n); } catch (e) { return false; } }; if (typeof p === 'string') return function (n) { return String(n) === p; }; if (Array.isArray(p)) return function (n) { return p.indexOf(String(n)) >= 0; }; if (typeof p.test === 'function') return function (n) { p.lastIndex = 0; return p.test(String(n)); }; return function () { return false; }; }
    function mapper(m) { if (!m) return function () { return null; }; if (typeof m === 'function') return function (n) { var r = null; try { r = m(n); } catch (e) {} return r == null ? null : String(r); }; return function (n) { return H.call(m, n) ? String(m[n]) : null; }; }
    function revMap(m) { var o = {}; if (m && typeof m === 'object') for (var k in m) if (H.call(m, k)) o[String(m[k])] = k; return o; }
    function naming(f) { var pass = tester(f.pass), map = mapper(f.map), rv = revMap(f.map), pre = f.prefix == null ? '' : String(f.prefix);
      return { to: function (n) { n = String(n); if (pass(n)) return { name: n, own: false }; var m = map(n); if (m != null) return { name: m, own: false }; return { name: pre + n, own: !!pre }; },
        from: function (real) { real = String(real); if (pre && real.indexOf(pre) === 0) return real.slice(pre.length); if (H.call(rv, real)) return rv[real]; if (pass(real)) return real; return pre ? null : real; } }; }
    function backend(b) {
      if (!b) b = new Map();
      if (typeof b.getItem === 'function') return { get: function (k) { return b.getItem(k); }, set: function (k, v) { b.setItem(k, v); }, del: function (k) { b.removeItem(k); }, has: function (k) { return b.getItem(k) !== null; }, keys: function () { var o = []; for (var i = 0; i < b.length; i++) o.push(b.key(i)); return o; } };
      if (typeof b.get === 'function' && typeof b.set === 'function') return { get: function (k) { return b.has(k) ? String(b.get(k)) : null; }, set: function (k, v) { b.set(k, String(v)); }, del: function (k) { (b['delete'] || b.del).call(b, k); }, has: function (k) { return !!b.has(k); }, keys: function () { return Array.from(b.keys()); } };
      return { get: function (k) { return H.call(b, k) ? String(b[k]) : null; }, set: function (k, v) { b[k] = String(v); }, del: function (k) { delete b[k]; }, has: function (k) { return H.call(b, k); }, keys: function () { return Object.keys(b); } };
    }
    function kv(f, realBe) {
      var be = backend(f.store), pass = tester(f.pass), map = mapper(f.map), rv = revMap(f.map), grp = f.group || null;
      if (f.seed) for (var sk in f.seed) if (H.call(f.seed, sk) && !be.has(sk)) be.set(sk, String(f.seed[sk]));
      function route(k) { k = String(k); if (realBe) { if (pass(k)) return [realBe, k, false]; var m = map(k); if (m != null) return [realBe, m, false]; } return [be, k, true]; }
      function note(k, o, n) { if (!grp || !grp.wins) return; grp.wins.forEach(function (w2) { if (w2 === W) return; try { w2.dispatchEvent(new w2.StorageEvent('storage', { key: k, oldValue: o, newValue: n, url: String(W.location.href) })); } catch (x) {} }); }
      if (grp && grp.wins) { grp.wins = grp.wins.filter(function (w) { try { return w && !w.closed && !!w.document; } catch (e) { return false; } }); if (grp.wins.indexOf(W) < 0) grp.wins.push(W); }
      return {
        get: function (k) { var r = route(k); return r[0].get(r[1]); },
        set: function (k, v) { var r = route(k); v = String(v); var o = r[0].get(r[1]); r[0].set(r[1], v); if (r[2] && o !== v) note(String(k), o, v); },
        del: function (k) { var r = route(k); if (!r[0].has(r[1])) return; var o = r[0].get(r[1]); r[0].del(r[1]); if (r[2]) note(String(k), o, null); },
        keys: function () { var out = be.keys().slice(); if (realBe) realBe.keys().forEach(function (rk) { var sk = H.call(rv, rk) ? rv[rk] : (pass(rk) ? rk : null); if (sk != null && out.indexOf(sk) < 0) out.push(sk); }); return out; },
        clear: function () { var ks = be.keys(); if (!ks.length) return; ks.forEach(function (k) { be.del(k); }); note(null, null, null); }
      };
    }
    function storage(a) {
      var api = { getItem: function (k) { return a.get(k); }, setItem: function (k, v) { a.set(k, v); }, removeItem: function (k) { a.del(k); }, clear: function () { a.clear(); }, key: function (i) { var ks = a.keys(); return (i >= 0 && i < ks.length) ? ks[i] : null; } };
      if (typeof Proxy === 'undefined') { Object.defineProperty(api, 'length', { get: function () { return a.keys().length; } }); return api; }
      return new Proxy(api, { get: function (t, k) { if (k === 'length') return a.keys().length; if (typeof k === 'symbol' || H.call(api, k)) return api[k]; var v = a.get(k); return v === null ? undefined : v; }, set: function (t, k, v) { a.set(k, v); return true; }, deleteProperty: function (t, k) { a.del(k); return true; }, has: function (t, k) { return a.get(k) !== null || H.call(api, k); }, ownKeys: function () { return a.keys(); }, getOwnPropertyDescriptor: function (t, k) { var v = a.get(k); return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true }; } });
    }
    function def(o, k, v) { try { Object.defineProperty(o, k, { configurable: true, get: function () { return v; } }); return o[k] === v; } catch (e) { return false; } }
    ['localStorage', 'sessionStorage'].forEach(function (nm) { var f = S[nm]; if (!f || f.off || f.absent) return; var real = null; try { real = W[nm]; } catch (e) {} iso[nm] = def(W, nm, storage(kv(f, real ? backend(real) : null))); });
    (function () { var f = S.cookies; if (!f || f.off || f.absent) return; var d = W.Document && Object.getOwnPropertyDescriptor(W.Document.prototype, 'cookie'), rb = null;
      if (d && d.get) { var rd = function () { var o = {}; String(d.get.call(W.document) || '').split(';').forEach(function (p) { var i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim(); }); return o; }; rb = { get: function (k) { var o = rd(); return H.call(o, k) ? o[k] : null; }, set: function (k, v) { d.set.call(W.document, k + '=' + v + '; path=/'); }, del: function (k) { d.set.call(W.document, k + '=; max-age=0; path=/'); }, has: function (k) { return H.call(rd(), k); }, keys: function () { return Object.keys(rd()); } }; }
      var ck = kv(f, rb);
      try { Object.defineProperty(W.document, 'cookie', { configurable: true, get: function () { return ck.keys().map(function (k) { var v = ck.get(k); return k ? k + '=' + v : v; }).join('; '); }, set: function (s) { s = String(s); var pa = s.split(';'), kv0 = pa[0], i = kv0.indexOf('='); var k = (i < 0 ? '' : kv0.slice(0, i)).trim(), v = (i < 0 ? kv0 : kv0.slice(i + 1)).trim(); var del = pa.slice(1).some(function (a) { a = a.trim().toLowerCase(); return /^max-age=(0|-)/.test(a) || (a.indexOf('expires=') === 0 && new Date(a.slice(8)) < new Date()); }); if (del) ck.del(k); else ck.set(k, v); } }); iso.cookies = true; } catch (e) { iso.cookies = false; } })();
    (function () { var f = S.indexedDB, ri = (f && f.impl) || W.indexedDB; if (!f || f.off || f.absent || !ri) return; var N = naming(f);
      var fi = { open: function (n, v) { var r = N.to(n); if (r.own && W.__sim.dbs.indexOf(r.name) < 0) W.__sim.dbs.push(r.name); return v === undefined ? ri.open(r.name) : ri.open(r.name, v); }, deleteDatabase: function (n) { return ri.deleteDatabase(N.to(n).name); }, cmp: function (a, b) { return ri.cmp(a, b); }, databases: function () { return ri.databases ? ri.databases().then(function (l) { var o = []; l.forEach(function (x) { var s = N.from(x.name); if (s != null) o.push({ name: s, version: x.version }); }); return o; }) : Promise.resolve([]); } };
      iso.indexedDB = def(W, 'indexedDB', fi); })();
    (function () { var f = S.broadcast, RB = (f && f.impl) || W.BroadcastChannel; if (!f || f.off || f.absent || !RB) return; var N = naming(f); var B = function (n) { return new RB(N.to(n).name); }; B.prototype = RB.prototype; try { W.BroadcastChannel = B; iso.broadcast = (W.BroadcastChannel === B); } catch (e) { iso.broadcast = false; } })();
    (function () { var f = S.caches, rc = (f && f.impl) || W.caches; if (!f || f.off || f.absent || !rc) return; var N = naming(f);
      var nm = function (n) { var r = N.to(n); if (r.own && W.__sim.caches.indexOf(r.name) < 0) W.__sim.caches.push(r.name); return r.name; };
      var cs = { open: function (n) { return rc.open(nm(n)); }, has: function (n) { return rc.has(N.to(n).name); }, 'delete': function (n) { return rc['delete'](N.to(n).name); }, keys: function () { return rc.keys().then(function (l) { var o = []; l.forEach(function (k) { var s = N.from(k); if (s != null) o.push(s); }); return o; }); }, match: function (r, o) { o = o || {}; if (o.cacheName) return rc.match(r, Object.assign({}, o, { cacheName: N.to(o.cacheName).name })); return cs.keys().then(function (ks) { var i = 0; function nx() { if (i >= ks.length) return undefined; return rc.open(N.to(ks[i++]).name).then(function (c) { return c.match(r, o); }).then(function (x) { return x || nx(); }); } return nx(); }); } };
      iso.caches = def(W, 'caches', cs); })();
    (function () { var f = S.locks, rl = (f && f.impl) || (W.navigator && W.navigator.locks); if (!f || f.off || f.absent || !rl) return; var N = naming(f);
      var lk = { request: function (n) { var a = [].slice.call(arguments); a[0] = N.to(n).name; return rl.request.apply(rl, a); }, query: function () { return rl.query().then(function (q) { function fl(l) { var o = []; (l || []).forEach(function (x) { var s = N.from(x.name); if (s != null) o.push(Object.assign({}, x, { name: s })); }); return o; } return { held: fl(q.held), pending: fl(q.pending) }; }); } };
      iso.locks = def(W.navigator, 'locks', lk); })();
    (function () { var f = S.history; if (!f || f.off || f.absent) return;
      var cl = function (x) { if (x == null) return null; try { return W.structuredClone ? W.structuredClone(x) : JSON.parse(JSON.stringify(x)); } catch (e) { return x; } };
      var hs = [{ state: null, url: String(W.location.href) }], hi = 0;
      var pop = function () { var st = hs[hi].state, e; try { e = new W.PopStateEvent('popstate', { state: st }); } catch (x) { e = new W.Event('popstate'); } W.setTimeout(function () { W.dispatchEvent(e); }, 0); };
      var vh = { scrollRestoration: 'auto', pushState: function (s, t, u) { hs = hs.slice(0, hi + 1); hs.push({ state: cl(s), url: u == null ? hs[hi].url : String(u) }); hi++; }, replaceState: function (s, t, u) { hs[hi] = { state: cl(s), url: u == null ? hs[hi].url : String(u) }; }, go: function (d) { d = d | 0; if (!d) return; var n = hi + d; if (n < 0 || n >= hs.length) return; hi = n; pop(); }, back: function () { vh.go(-1); }, forward: function () { vh.go(1); } };
      Object.defineProperty(vh, 'length', { get: function () { return hs.length; } }); Object.defineProperty(vh, 'state', { get: function () { return hs[hi].state; } });
      iso.history = def(W, 'history', vh); W.__sim.historyLog = function () { return { index: hi, entries: hs.slice() }; }; })();
    W.__sim.hasLS = !!iso.localStorage; W.__sim.hasSS = !!iso.sessionStorage; W.__sim.hasIDB = !!iso.indexedDB; W.__sim.hasBC = !!iso.broadcast;
  }/*🟡🔴*/
  function prelude(opt) {
    var p = []; p.push('(function(){var W=window;W.__sim={routes:[],handlers:{},net:0,mut:0,offline:false};');
    /*🟢*/if (opt.isolate !== false) p.push("var __spec=null;try{var __P=(W.parent&&W.parent!==W)?W.parent:W.opener;__spec=(__P&&__P.__simSpecs&&__P.__simSpecs[" + JSON.stringify(String(opt._simId)) + "])||null}catch(e){}if(!__spec)__spec=" + JSON.stringify(plainIso(opt._iso || compileIso(opt, opt._simId))).replace(/</g, '\\u003c') + ";W.__sim.prefix=(__spec.indexedDB&&__spec.indexedDB.prefix)||'';try{(" + isoInstall.toString() + ")(W,__spec)}catch(e){W.__sim.isoError=String(e&&e.message||e)}");/*🟡if (opt.isolate !== false) { p.push("var __s=new Map();var __ls={getItem:function(k){k=String(k);return __s.has(k)?__s.get(k):null},setItem:function(k,v){__s.set(String(k),String(v))},removeItem:function(k){__s.delete(String(k))},clear:function(){__s.clear()},key:function(i){return Array.from(__s.keys())[i]||null},get length(){return __s.size}};"); p.push("var __ok=false;try{Object.defineProperty(W,'localStorage',{configurable:true,get:function(){return __ls}});__ok=(W.localStorage===__ls)}catch(e){try{W.localStorage=__ls;__ok=true}catch(e2){}}W.__sim.hasLS=__ok;"); }🔴*/
    if (opt.trackStable) p.push("try{if(W.MutationObserver){new W.MutationObserver(function(){W.__sim.mut++;}).observe(W.document.documentElement,{subtree:true,childList:true});}}catch(e){}");
    if (opt.clock) p.push('(' + clockInstall.toString() + ')(W);');
    p.push("var __of=(W.fetch&&W.fetch.bind)?W.fetch.bind(W):W.fetch;");
    p.push("function __n(v){var R=W.Response;try{if(v instanceof R)return v}catch(e){}if(typeof v==='string')return new R(v,{status:200/*🟢*/,headers:/^\\s*(data|event|id|retry):/.test(v)?{'content-type':'text/event-stream'}:{}/*🟡🔴*/});if(v&&typeof v==='object'){var h=v.headers||/*🟢*/(typeof v.body==='string'&&/^\\s*(data|event|id|retry):/.test(v.body)?{'content-type':'text/event-stream'}:/*🟡🔴*/{'content-type':'application/json'}/*🟢*/)/*🟡🔴*/,b=v.body;if(b&&typeof b==='object'&&!(b instanceof W.Blob)){try{b=JSON.stringify(b)}catch(e){}}return new R(b==null?'':b,{status:v.status||200,headers:h})}return new R('',{status:200})}");
    p.push("if(__of)W.fetch=function(input,init){try{if(W.__sim.offline)return Promise.reject(new TypeError('Failed to fetch (sim offline)'));/*🟢*/var __mx=" + (+optOf(opt, 'maxRequestChars') || 0) + ";if(__mx){var __b=(init&&init.body!=null)?init.body:null,__bl=__b==null?0:(typeof __b==='string'?__b.length:(__b.size||__b.byteLength||0));if(__bl>__mx)return Promise.resolve(new W.Response('sim: request body too large ('+__bl+' > '+__mx+')',{status:413,statusText:'Payload Too Large'}))}/*🟡🔴*/var url=(typeof input==='string')?input:(input&&input.url)||'';var method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();var rs=(W.__sim&&W.__sim.routes)||[];for(var i=0;i<rs.length;i++){var r=rs[i];if(r.method&&r.method!==method)continue;var hit=false;try{hit=r.test(url,input,init)}catch(e){}if(hit){W.__sim.net++;var out;try{out=W.__sim.handlers[r.id](url,input,init)}catch(e){out={status:500,body:'handler error: '+e.message}}var run=function(o){return Promise.resolve(o).then(__n).then(function(res){W.__sim.net--;return res},function(e){W.__sim.net--;throw e})};/*🟢*/var sig=(init&&init.signal)||(input&&input.signal)||null,AE=function(){return new W.DOMException('The user aborted a request.','AbortError')};if(sig&&sig.aborted){W.__sim.net--;return Promise.reject(AE())}if(out&&out.delay)return new Promise(function(res,rej){var dn=0,tm=setTimeout(function(){if(dn)return;dn=1;if(sig)sig.removeEventListener('abort',ab);run(out).then(res,rej)},out.delay);function ab(){if(dn)return;dn=1;clearTimeout(tm);W.__sim.net--;rej(AE())}if(sig)sig.addEventListener('abort',ab)});return run(out)/*🟡return (out&&out.delay)?new Promise(function(res){setTimeout(function(){run(out).then(res,res)},out.delay)}):run(out)🔴*/}}}catch(e){}return __of(input,init)};");
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
      /*🟢*/src._simId = id; if (src.isolate !== false && !src._iso) { src._iso = compileIso(src, id); (G.__simSpecs = G.__simSpecs || {})[id] = src._iso; }/*🟡🔴*/
      if (isDoc) { try { ifr.srcdoc = injectAll(src.html, src, ''); } catch (e) { ifr.srcdoc = src.html; } } else { ifr.src = src.src; }
      var done = false;
      function fin() {
        if (done) return; done = true;
        var adapter = DirectAdapter(OPS(ifr.contentWindow, { consoleAdapter: src.console, maxMessage: optOf(src, 'maxMessage'), maxLogs: optOf(src, 'maxLogs'), version: VERSION }), ifr);
        var sim = Sim(adapter, { id: id, ttl: src.ttl, allowConsoleEval: optOf(src, 'allowConsoleEval') });
        sim.kind = 'iframe';
        /*🟢*/sim.onDestroy(function () { var spec = src._iso || {}, cw = ifr.contentWindow, SW = null; try { SW = cw && cw.__sim; } catch (e) {} try { delete (G.__simSpecs || {})[id]; } catch (e) {} ['localStorage', 'cookies'].forEach(function (k) { var g = spec[k] && spec[k].group; if (g && g.wins) g.wins = g.wins.filter(function (w) { return w !== cw; }); }); try { if (spec.indexedDB && !spec.indexedDB.off && !spec.indexedDB.keep) ((SW && SW.dbs) || []).concat(src._seededDbs || []).forEach(function (n) { try { (spec.indexedDB.impl || indexedDB).deleteDatabase(n); } catch (e) {} }); } catch (e) {} try { if (spec.caches && !spec.caches.off && !spec.caches.keep && G.caches) ((SW && SW.caches) || []).forEach(function (n) { try { G.caches['delete'](n); } catch (e) {} }); } catch (e) {} });/*🟡🔴*/
        sim.win = function () { return ifr.contentWindow; };
        sim.doc = function () { return ifr.contentWindow && ifr.contentWindow.document; };
        sim.el = function (s) { var d = sim.doc(); return d ? d.querySelector(s) : null; };
        sim.all = function (s) { var d = sim.doc(); return d ? Array.prototype.slice.call(d.querySelectorAll(s)) : []; };
        sim.fire = function (n, t, i) { var w = ifr.contentWindow; if (n && w) try { n.dispatchEvent(new w.Event(t, Object.assign({ bubbles: true, cancelable: true }, i || {}))); } catch (e) {} };
        sim.report = function () { var d = sim.doc(), w = ifr.contentWindow; return { id: id, kind: 'iframe', ready: !!(d && d.readyState === 'complete'), isolated: !!(w && w.__sim && w.__sim.hasLS)/*🟢*/, bridge: (w && w.__app && w.__app.run) ? 'ok' : (src._bridged === false ? 'missing' : 'none'), isolation: (w && w.__sim && w.__sim.iso) || {}, isolatedAll: !!(w && w.__sim && w.__sim.iso && Object.keys(w.__sim.iso).length && Object.keys(w.__sim.iso).every(function (k) { return w.__sim.iso[k]; }))/*🟡🔴*/, hasBridge: !!(w && w.__app && w.__app.run), age: now() - sim.createdAt, idle: now() - sim.lastUsed, ttl: sim.ttl, dead: sim.isDead(), versionMismatch: false }; };
        resolve(sim);
      }
      function ok() { try { var w = ifr.contentWindow, d = w && w.document; if (!(d && d.readyState === 'complete' && d.body)) return false; if (isDoc && !w.__sim) return false; return true; } catch (e) { return false; } }
      ifr.addEventListener('load', function () { if (ok()) setTimeout(fin, 0); });
      var T = optOf(src, 'readyTimeout'), t0 = now();
      (function poll() { if (done) return; if (ok()) return fin(); if (now() - t0 > T) return fin(); setTimeout(poll, 50); })();
    });
  }
  function makeWorker(src, id) { if (typeof Worker === 'undefined') return Promise.reject(Error('SIM: no Worker support')); try { var url = URL.createObjectURL(new Blob([agentSource({ type: 'self', id: id, consoleAdapter: src.console, init: src.code || '', clock: optOf(src, 'clock'), maxMessage: optOf(src, 'maxMessage'), maxLogs: optOf(src, 'maxLogs') })], { type: 'text/javascript' })); TRACK.urls.push(url); var w = new Worker(url); TRACK.workers.push(w); var tr = transportFrom({ type: 'worker', worker: w }, id); var sim = Sim(TransportAdapter(tr, id), { id: id, ttl: src.ttl, urls: [url] }); sim.kind = 'worker'; /*🟢*/sim.onDestroy(function () { var i = TRACK.workers.indexOf(w); if (i >= 0) TRACK.workers.splice(i, 1); });/*🟡🔴*/ bus.addTransport(tr); return /*🟢*/Promise.race([sim.ready, sleep(optOf(src, 'readyTimeout'))])/*🟡sim.ready🔴*/.then(function () { return sim; }, function () { return sim; }); } catch (e) { return Promise.reject(Error('SIM worker: ' + e.message)); } }
  function makeTab(src, id) { if (!hasDOM || !G.open) return Promise.reject(Error('SIM: tab runtime needs window.open')); return resolveText(/*🟢*/src.html || src.url/*🟡src.url || src.html🔴*/ || '').then(function (html) { /*🟢*/src._simId = id; if (src.isolate !== false && !src._iso) { src._iso = compileIso(src, id); (G.__simSpecs = G.__simSpecs || {})[id] = src._iso; }/*🟡🔴*/ var name = uid('tab'); var agent = agentSource({ type: 'broadcast', name: name, me: id, id: id, consoleAdapter: src.console, clock: optOf(src, 'clock'), maxMessage: optOf(src, 'maxMessage'), maxLogs: optOf(src, 'maxLogs') }); var url = URL.createObjectURL(new Blob([injectAll(html, src, agent)], { type: 'text/html' })); TRACK.urls.push(url); var tr = transportFrom({ type: 'broadcast', name: name }, id); if (!tr) throw Error('SIM: BroadcastChannel required for tab'); var win = null; try { win = G.open(url, '_blank'); } catch (e) {} var sim = Sim(TransportAdapter(tr, id), { id: id, ttl: src.ttl, urls: [url] }); sim.kind = 'tab'; sim.win = win; /*🟢*/sim.onDestroy(function () { try { delete (G.__simSpecs || {})[id]; } catch (e) {} });/*🟡🔴*/ bus.addTransport(tr); return Promise.race([sim.ready, sleep(optOf(src, 'readyTimeout'))]).then(function () { return sim; }); }); }
  function makeRemote(src, id) { var tr = transportFrom(src.transport || src, id); if (!tr) return Promise.reject(Error('SIM: remote needs a transport')); var sim = Sim(TransportAdapter(tr, id), { id: id, ttl: src.ttl }); sim.kind = 'remote'; bus.addTransport(tr); return /*🟢*/Promise.race([sim.ready, sleep(optOf(src, 'readyTimeout'))])/*🟡sim.ready🔴*/.then(function () { return sim; }, function () { return sim; }); }
  function reserveId(src) { if (src.id && /*🟢*/(registry[src.id] || reserving[src.id])/*🟡registry[src.id]🔴*/) { if (src.replace/*🟢*/ && registry[src.id]/*🟡🔴*/) registry[src.id].destroy(); else throw Error('SIM: id already in use: ' + src.id); } /*🟢*/var rid = (src.id && String(src.id)) || uid('sim'); reserving[rid] = 1; return rid;/*🟡return (src.id && String(src.id)) || uid('sim');🔴*/ }
  function make(spec) {
    return normalize(spec).then(function (src) {
      try {
        if (DEFAULTS.maxSims && ids().length >= DEFAULTS.maxSims && !src.force) throw Error('SIM: maxSims reached (' + DEFAULTS.maxSims + ')');
        var id = reserveId(src);
        /*🟢*/var pre = (src.runtime !== 'worker' && src.runtime !== 'remote') ? prepIso(src, id) : Promise.resolve(); var pr = pre.then(function () { return src.runtime === 'worker' ? makeWorker(src, id) : src.runtime === 'tab' ? makeTab(src, id) : src.runtime === 'remote' ? makeRemote(src, id) : makeIframe(src, id); }).then(function (x) { if (src.readyFor == null) return x; return waitReady(x, src.readyFor, optOf(src, 'readyTimeout')).then(function (ok) { x.readyForOk = ok; return x; }); }); return pr.then(function (x) { delete reserving[id]; return x; }, function (e) { delete reserving[id]; throw e; });/*🟡if (src.runtime === 'worker') return makeWorker(src, id);
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
    purge: purge, clearAll: clearAll, /*🟢*/dropNs: dropNs, namespaces: namespaces, compileIso: compileIso, isoFeatures: ISO_FEATURES,/*🟡🔴*/ panel: panel, expect: expect, configure: configure, config: config,
    persist: persist, loadConfig: loadConfig, random: rng, stats: stats, TRACK: TRACK,
    load: function (u) { return fetchText(u).then(function (t) { try { return JSON.parse(t); } catch (e) { return t; } }); },
    revoke: function (u) { try { URL.revokeObjectURL(u); } catch (e) {} },
    registry: registry,
    util: { sleep: sleep, clamp: clamp, merge: merge, sse: function (frames) { var body = frames.map(function (f) { if (f === '[DONE]') return 'data: [DONE]\n\n'; if (typeof f === 'string') return /^data:/.test(f) ? (f.charAt(f.length - 1) === '\n' ? f : f + '\n\n') : ('data: ' + f + '\n\n'); return 'data: ' + JSON.stringify(f) + '\n\n'; }).join(''); return { status: 200, headers: { 'content-type': 'text/event-stream' }, body: body }; }, json: function (o, s) { return { status: s || 200, headers: { 'content-type': 'application/json' }, body: o }; }, text: function (t, s) { return { status: s || 200, body: t }; } }
  };
  /*🟢*/SIM.readme = [
    "====================================================================",
    " SIM / simulator4 — README  (lives in SIM.readme; SIM.help('topic') prints one section)",
    " version: see SIM.VERSION",
    "====================================================================",
    "",
    "0. WHAT IT IS",
    " - A universal simulation builder for web pages and apps. Load it once in any page",
    "   (script tag, eval, console) -> window.SIM. Each simulation (\"sim\") runs a page in an",
    "   iframe, worker, new tab, or remote peer, and can be commanded, observed and destroyed.",
    " - Not tied to one app. App-specific behaviour (for example a chat app's IndexedDB,",
    "   localStorage or eval console) is handled through generic options: isolate, route, bridge,",
    "   console adapter.",
    " - Loading the same version again returns the loaded SIM. Loading another version purges the",
    "   old one first (kills sims, frees iframes, workers, blob URLs and timers).",
    "",
    "1. QUICK START",
    "   var sim = await SIM.make({ url: 'app.html' });        // or { html: '<!doctype html>...' }",
    "   await sim.appEval('typeof someClosureVar');            // runs INSIDE the app scope (bridge)",
    "   await sim.loadIntoApp('patch.js');                     // fetch + run a patch in the app scope",
    "   sim.route(/api\\.example\\.com/, function (url, input, ctx) { return SIM.util.json({ ok: 1 }); });",
    "   await sim.one({ type: ['#input', 'hello'] });  await sim.one({ click: '#send' });",
    "   sim.report(); sim.destroy();                           // or SIM.killAll() / SIM.purge()",
    "",
    "2. make(spec) — WHAT TO LOAD",
    "   spec can be: an html string | a url string | { html } | { url } | { src/target } (plain",
    "   iframe src, \"limited\": no injection) | { node } (outerHTML) | { doc } (a Document) | { fn } or",
    "   a function returning any of these.",
    "   Common options (anything left out comes from SIM.DEFAULTS):",
    "     id, replace (destroy the existing sim with this id), force (ignore maxSims)",
    "     runtime: 'iframe' (default) | 'worker' | 'tab' | 'remote'",
    "     isolate, ns, keep, keepDb            -> section 5",
    "     base (a <base href>; a url spec sets it automatically), width, height, sandbox",
    "     readyTimeout (ms before make() resolves anyway), ttl (ms lifetime)",
    "     readyFor: expression string (sim global scope) or function(sim) -> truthy/promise; make()",
    "       waits until it is true, up to readyTimeout, and then sets sim.readyForOk (true/false)",
    "     maxRequestChars: cap on request body size; bigger fetches get a 413 answer and never",
    "       leave the sim (0 = off, the default). A guard against runaway uploads and costs.",
    "     bridge (default true), bridgeCode, bridgePattern -> section 4",
    "     console, allowConsoleEval            -> section 4",
    "     clock (virtual time from the start), trackStable (MutationObserver counter)",
    "     worker only: code (run at start); remote only: transport",
    "   make() always resolves with a sim, even when readiness timed out.",
    "   Check sim.report().ready.",
    "",
    "3. RUNTIMES",
    "   iframe : default. Same-origin srcdoc. Full DOM access (sim.win(), sim.doc(), sim.el(),",
    "            sim.all(), sim.fire()), routes, offline, isolation.",
    "   worker : no DOM. Talks over postMessage. run / clock / logs work; dom and appEval do not.",
    "   tab    : opens a new window (window.open). Talks over a BroadcastChannel. Popup blockers",
    "            can stop it; sim.win is the Window object (for iframe, sim.win() is a function).",
    "   remote : any transport (section 9). The other side runs SIM.serve(...) or the agent",
    "            source (SIM.agent(opts)).",
    "",
    "4. RUNNING CODE",
    "   sim.run(code)        eval in the sim's GLOBAL scope (iframe/worker global).",
    "   sim.appEval(code)    eval in the APP scope via the injected bridge window.__app.run.",
    "                        The bridge is inserted right after the first \"(async () => {\",",
    "                        \"(function(){\" or \"(() => {\" in the page (override with bridgePattern /",
    "                        bridgeCode, or bridge:false).",
    "                        An expression returns its value. Statements run inside a function,",
    "                        so write an explicit \"return x\" to get a value back.",
    "   sim.loadIntoApp(u)   u = absolute or relative url (x.js, ./x.js, /x.js) or code text.",
    "   sim.loadScript(u)    same, but in the global scope.",
    "   No bridge? appEval falls back to driving the page's own eval console, but only with",
    "   allowConsoleEval:true. The selectors come from the console adapter: DEFAULTS.console or",
    "   spec.console { toggle, open, input, run, out }. The defaults are one app's preset;",
    "   override them for other apps. Note: this fallback switches the page's console toggle on",
    "   and does not switch it back.",
    "   Results: run / action / appEval / op return { ok, value } or { ok:0, error }.",
    "   info / logs / errs / clearLogs return raw values and REJECT on failure. They share the same",
    "   timeout, metrics and destroyed-sim check as every other op.",
    "   sim.op(name, args, opts) = send any raw op (ping, info, logs, net, clock, dom, ...).",
    "   A page with no injection point: report().bridge becomes 'missing', a console warning",
    "   is printed and SIM.on('bridgeMissing') fires.",
    "",
    "5. ISOLATION (what a sim shares with the real page and with other sims)",
    "   Features: localStorage, sessionStorage, cookies, indexedDB, broadcast (BroadcastChannel),",
    "   caches (Cache API), locks (Web Locks), history.",
    "   isolate: true (default: every feature private) | false (everything real) | { feature: VALUE }",
    "   VALUE per feature:",
    "     true      private to this sim",
    "     false     use the page's real one",
    "     'name'    shared namespace for this feature only",
    "     Map / Storage / {get,set,has,delete,keys}   use it directly as the store (key-value features)",
    "     { ... }   full control:",
    "        ns:     shared namespace name",
    "        prefix: raw prefix for names (default \"__sim_<id>_\" or \"__simns_<ns>_\")",
    "        pass:   names or keys that use the REAL storage unchanged",
    "                (a string, array, RegExp, function(name)->bool, or true for all)",
    "        map:    rename, e.g. { appdb: 'myTestDB' } or function(name)->newName",
    "                (for key-value features, map writes to the real storage under the new key)",
    "        seed:   starting values { key: value } (key-value features)",
    "        store:  your own backend. Put a plain object here, as { store: obj }; a bare {} is",
    "                read as options.",
    "        keep:   keep the data on destroy (true/false)",
    "        impl:   named features only: use this implementation instead of the browser's",
    "                (e.g. an in-memory IndexedDB library, a custom BroadcastChannel class).",
    "                Naming, pass and map still apply.",
    "        absent: true = remove the API entirely (typeof X === 'undefined') to test fallbacks",
    "        seed (indexedDB): databases created BEFORE the page boots, only when fresh:",
    "                { AppDB: { version: 1, stores: { s: { k1: v1 } } } }   (key -> value)",
    "                { AppDB: { stores: { s: { keyPath: 'id', records: [ {id:1}, ... ] } } } }",
    "                Private seeded databases are deleted on destroy like any other.",
    "   isolate also accepts 'none' (= false), 'full' / 'all' (= true) and 'storage' (only",
    "   localStorage and indexedDB private).",
    "   Per-sim defaults: ns: 'group' (applies to every shareable feature), keep / keepDb",
    "   (true, false, or { indexedDB: true, caches: true }). Old aliases still work:",
    "   isolateSession, isolateIdb, isolateBroadcast (false = real).",
    "   Semantics:",
    "     - Sims with the same ns behave like tabs of one browser. localStorage, cookies,",
    "       indexedDB, broadcast, caches and locks are shared. 'storage' events fire in the other",
    "       sims. sessionStorage and history stay per sim, as in real tabs, unless you give",
    "       them an ns yourself.",
    "     - Cleanup: only names a sim created under its OWN prefix are deleted on destroy.",
    "       Names that were passed or mapped belong to you and are never auto-deleted. Named",
    "       namespaces are kept until SIM.dropNs(ns) (no argument = all). SIM.namespaces() lists",
    "       them.",
    "     - localStorage and sessionStorage: property access and getItem/setItem see the same data.",
    "     - history is virtual: pushState/replaceState/back/forward/go with popstate events.",
    "       location does not change. The entries are in sim.win().__sim.historyLog().",
    "     - sim.report().isolation shows the per-feature result, and isolatedAll whether all of",
    "       them are isolated. SIM.compileIso(opts) shows the resolved plan without making a sim.",
    "   Limits:",
    "     - Functions, RegExps, custom stores and shared in-memory stores need the page that loaded",
    "       SIM to be reachable (iframe parent or tab opener). Otherwise only the JSON-safe part",
    "       applies.",
    "     - Real HTTP cookies sent by fetch, service workers, SharedWorker and navigator.storage",
    "       stay shared.",
    "",
    "6. DOM ACTIONS  (sim.one(action) / sim.act([actions]) / SIM.command(id, action))",
    "   { click: sel } { type: [sel, text], clear } { press: [sel, key], init: { ctrlKey: true } }",
    "   { select: [sel, value] } { focus: sel } { append: html } { eval: code } { appEval: code }",
    "   { loadScript: u } { loadIntoApp: u } { wait: ms } { waitFor: expr } { assert: expr }",
    "   { waitForNetworkIdle: true } { waitForStable: true } { offline: bool } { clock: ms }",
    "   { publish: [channel, data], to } { log: x } { do: function (sim) {} }",
    "   raw ops too: { op: 'blur'|'clear'|'submit'|'scroll'|'dispatch'|'remove'|'value'|'checked'|",
    "                 'text'|'html'|'attr'|'count'|'visible', sel, ... }",
    "   Key events are real KeyboardEvents and clicks are MouseEvents, so e.key and modifier keys work.",
    "   waitFor evaluates in the sim's GLOBAL scope. To test app-scope state, use",
    "   \"__app.run('expr')\".",
    "",
    "7. NETWORK (iframe runtime)",
    "   sim.route(pattern, handler, { method, times }) -> route id",
    "     pattern: substring | RegExp | null (everything). The first match wins, so add specific",
    "     routes before catch-all ones.",
    "     handler(url, input, ctx) with ctx = { win, init, body, headers, method }. It returns a",
    "     Response | a string | { status, headers, body, delay }. A body that is an object is",
    "     sent as JSON. A string body that starts with data:/event:/id:/retry: is sent as",
    "     text/event-stream automatically.",
    "     SIM.util.json(obj, status), SIM.util.text(t, status), SIM.util.sse([frames]) build replies.",
    "     AbortSignal is honoured: an aborted request rejects with AbortError, also during delay.",
    "     Routed bodies arrive in one piece (no chunk-by-chunk streaming yet).",
    "   sim.unroute(id), sim.clearRoutes(), sim.offline(true|false) (iframe only; other runtimes",
    "   return an error), sim.waitForNetworkIdle(timeout, quiet).",
    "",
    "8. TIME",
    "   clock:true at make (or the first sim.clock call) installs virtual timers.",
    "   sim.clock.advance(ms) | set(ms) | now() | pending().",
    "   Timers created before the clock was installed keep running in real time, and",
    "   clearTimeout/clearInterval still work on them.",
    "",
    "9. MESSAGING / MULTI-PLACE",
    "   SIM.bus: publish(channel, data) / subscribe(channel, fn). sim.publish / sim.on.",
    "   Transports: { type: 'worker', worker } | { type: 'broadcast', name } | { type: 'ws', url,",
    "   reconnectMs, heartbeat } | { type: 'sse', url, post } | { type: 'window', target, origin } |",
    "   custom { send, on, close }.",
    "   SIM.remote(cfg, id) / SIM.connect(transport, id) = control a peer.",
    "   SIM.serve(cfg, id) = make THIS page controllable.",
    "   SIM.addInput(cfg) = feed a transport or a poll ({ type: 'poll', url, interval, channel }) into",
    "   the bus. SIM.purge() stops polls.",
    "   A server only answers real requests (never replies or ready messages), so peers sharing a",
    "   channel cannot loop.",
    "   Security: agents of type 'parent' accept commands from any window. Use an origin-checked",
    "   transport ('window' with origin) for untrusted pages.",
    "",
    "10. LIFECYCLE / CONTROL",
    "   SIM.ids()/list(), get(id), has(id), each(fn), map(), report(), stats(), alive()",
    "   SIM.kill(x): x = an exact id (a prefix is only used when no exact id matches) | RegExp | array |",
    "   fn(sim, id) | sim. killAll(), purge() (kills everything and frees every tracked",
    "   resource; namespaces are kept), gc() and watchdog() (ttl / idleTimeout / dead sims).",
    "   sim.destroy(), sim.onDestroy(fn), sim.timeout(ms) (sets ttl), sim.abort(), sim.signal().",
    "   Every op accepts { timeout, signal, retry, backoff }. timeout: 0 = no timeout.",
    "   The default timeout is DEFAULTS.actionTimeout, the same for every runtime.",
    "   SIM.panel(true) shows a small live list with kill links. Loading SIM registers a",
    "   pagehide handler that purges.",
    "",
    "11. DIAGNOSTICS",
    "   sim.logs() and sim.errs() capture the SIM's OWN console and errors, never the parent page's.",
    "   sim.metrics(), sim.trace(true), sim.record() / sim.replay(), sim.report(),",
    "   SIM.stats() (sims, iframes, workers, urls, timers, polls, transports).",
    "   SIM.on('add'|'remove'|'op'|'versionMismatch', fn).",
    "",
    "12. CONFIG",
    "   SIM.configure({ ... }) deep-merges into DEFAULTS (nested objects like console merge too).",
    "   SIM.config(k, v), SIM.persist() and SIM.loadConfig() use localStorage key dse_sim_config.",
    "   Anything in DEFAULTS can also be passed per make(spec).",
    "   Note: SIM.* functions are entry points. Replacing them on the SIM object does not change",
    "   calls made inside the module. Override behaviour through DEFAULTS or spec options.",
    "",
    "13. RECIPES",
    "   Chat-style app plus a patch, fully isolated:",
    "     var s = await SIM.make({ url: 'ai_chat.html' }); s.route(/api\\./, handler);",
    "     await s.loadIntoApp('patch.js'); await s.appEval(\"els.messageInput.value='hi'; sendMessage()\");",
    "   Two-tab test (shared storage, own session and history):",
    "     var a = await SIM.make({ url: u, ns: 't' }), b = await SIM.make({ url: u, ns: 't' });",
    "   Reuse the real API keys but keep everything else private:",
    "     isolate: { localStorage: { pass: ['my_keys_entry'] } }",
    "   Run against a copy of a real database under another name:",
    "     isolate: { indexedDB: { map: { AppDB: 'AppDB_test' } } }",
    "",
    "14. CHANGELOG (claudeedit series)",
    "   4.2.4 (e1): IndexedDB, sessionStorage and BroadcastChannel isolation (a sim could overwrite",
    "          the page's real data and shared its TAB-level ids); console capture in the sim's",
    "          own realm (a destroyed sim was kept in memory, about 6.5 MB each); abort listeners",
    "          removed after each op; exact-id kill; relative urls in loadIntoApp; route handler",
    "          gets init/body/method.",
    "   4.2.5 (e2): servers ignore replies (fixed an endless reply storm between peers); iframe",
    "          ops honour timeout; ready timeout for worker and remote; KeyboardEvent/MouseEvent;",
    "          storage property access; purge keeps SIM.registry valid and stops polls; WebSocket",
    "          reconnect keeps onmessage; routes honour AbortSignal; merge takes several objects;",
    "          raw op actions; errors for uncloneable results; lazy clock keeps real",
    "          clearTimeout; destroyed workers removed from TRACK.",
    "   4.2.6 (e3): cookies, Cache API, Web Locks and virtual history isolated; per-feature",
    "          switches; caches cleaned on destroy.",
    "   4.2.7 (e4): shared namespaces (ns) between sims with storage events; keep policy;",
    "          SIM.dropNs / SIM.namespaces.",
    "   4.2.8 (e5): per-feature pass / map / prefix / seed / store / ns / keep; custom backends;",
    "          SIM.compileIso.",
    "   4.2.9 (e6): this README (SIM.readme, SIM.help).",
    "   4.3.1 (e7): ideas taken from simulator4c (4.3.0), without its breaking changes:",
    "          sim.op; info/logs/errs/clearLogs get timeout, metrics and the dead check (still",
    "          raw values); route ctx.headers; automatic SSE content-type; bridge-missing",
    "          report/event/warning; maxRequestChars; readyFor. Also new here: IndexedDB seeding",
    "          before boot, impl and absent per feature, and isolate aliases.",
    "===================================================================="
  ].join('\n');
  SIM.help = function (topic) { var t = SIM.readme; if (topic != null) { var q = String(topic).toLowerCase(), parts = t.split(/\n(?=\s{0,2}\d+\. )/), head = parts.filter(function (p) { return p.split('\n')[0].toLowerCase().indexOf(q) >= 0; }), hit = head.length ? head : parts.filter(function (p) { return p.toLowerCase().indexOf(q) >= 0; }); t = hit.length ? hit.join('\n') : ('no section matches: ' + topic); } try { console.log(t); } catch (e) {} return t; };/*🟡🔴*/
  if (DEFAULTS.panel) { try { setTimeout(function () { panel(true); }, 0); } catch (e) {} }
  return SIM;
})();
try { window.SIM = SIM; window.simulate = function (s) { return SIM.make(s); }; } catch (e) {}
try { if (typeof module !== 'undefined' && module.exports) module.exports = SIM; } catch (e) {}
