/* sim.js v6.4.1 (claudeeditB9) - a simulation builder for web pages, in one file. README: SIM.readme / SIM.help('topic') */
var SIM = (function SIMF(cfg) {
const G = globalThis

// ---- settings: JSON trees in layers (sim, its tags, defaults); one resolver: the most specific declared value ----
// a node is a value, or a plain object (own keys only) whose `self` is its own value; keys: exact | '*' | '~regex'; 'a/b': v is a shortcut
const isO = x => !!x && typeof x === 'object' && !Object.getPrototypeOf(Object.getPrototypeOf(x) || Object.prototype)
// one regex maker (~keys, bridge patterns, routes, kill): no g/y state; an invalid pattern never matches
const RX = Object.create(null), re = p => p instanceof RegExp ? RegExp(p.source, p.flags.replace(/[gy]/g, '')) : RX[p] ||= (() => { try { return RegExp(p) } catch { return /(?!)/ } })()
// 'a/b/~re/x' -> ['a','b','~re/x']: a '~' segment takes the rest of the key (a regex may contain '/')
const seg = k => { const i = k[0] === '~' ? 0 : k.indexOf('/~'); return i < 0 ? k.split('/') : [...(i ? k.slice(0, i).split('/') : []), k.slice(i && i + 1)] }
// merge b into a: objects merge by key, object+value sets self, value+object keeps the value as self
const oh = (n, k) => Object.hasOwn(n, k) ? n[k] : undefined   // own keys only: 'toString' is a name, not Object.prototype's
const mix = (a, b) => b === undefined ? a : !isO(a) ? (isO(b) ? (a === undefined || Object.hasOwn(b, 'self') ? b : { self: a, ...b }) : b) : !isO(b) ? (a.self = b, a) : (Object.keys(b).forEach(k => a[k] = mix(oh(a, k), b[k])), a)
// expand shortcuts; g = what the value 'group' means here (a tag's name, or a sim's first tag)
function tree(t, g) {
  if (!isO(t)) return t === 'group' && g ? g : t; const o = {}
  for (const k of Object.keys(t)) { const p = seg(k), l = p.pop(); let n = o; if (/(^|\/)__proto__(\/|$)/.test(k)) continue
    p.forEach(x => { const v = oh(n, x); n = n[x] = isO(v) ? v : v === undefined ? {} : { self: v } }); n[l] = l === 'self' && isO(t[k]) ? t[k] : mix(oh(n, l), tree(t[k], g)) }
  return o
}
const pick = (n, s) => { if (s !== 'self' && oh(n, s) != null) return n[s]; for (const k of Object.keys(n)) if (k[0] === '~' && n[k] != null && re(k.slice(1)).test(s)) return n[k]; return n['*'] }   // null declares nothing
const walk = (n, p) => { for (const s of p) { if (!isO(n)) return; n = pick(n, s) } return n }
// depth first: the deepest declared value wins across layers; at one depth the first layer (spec, tags, defaults)
function get(L, path) {
  const p = typeof path === 'string' ? path.split('/') : path.map(String)
  for (let d = p.length; d; d--) for (const t of L) { const n = walk(t, p.slice(0, d)), v = isO(n) ? n.self : n; if (v != null) return v }
}
const defaults = tree({
  share: { self: 'own' }, store: { self: 'memory' }, keep: false,
  time: { speed: 1, media: true },
  net: { offline: false, unrouted: 'pass', proxy: null, proxyMode: 'fallback', proxyStagger: [200, 800, 1000], proxyRequests: 'auto', timeout: 15000 },
  page: { csp: 'strip', rocketLoader: 'undo', bridge: true, bridgePatterns: ['(?<![\\w$)\\]]\\s*)\\((?:\\s*async)?\\s*\\(\\s*\\)\\s*=>\\s*\\{', '(?<![\\w$)\\]]\\s*)\\(\\s*function\\s*\\(\\s*\\)\\s*\\{'], sandbox: 'auto', offscreen: 'position:fixed;left:-12000px;top:0' },
  realm: { frames: 'boot', workers: 'boot', popups: 'block', serviceWorker: 'block', cookieStore: 'block', navigation: 'virtual', onLost: 'kill' },
  log: { max: 2000, keepHead: 20, clip: 8000 },
  op: { timeout: 15000, retry: 0, readyTimeout: 20000 },
  nest: true
})
const tags = {}
const tag = (name, t) => { if (t === undefined) return tags[name]; if (t === null) delete tags[name]; else if (!isO(t)) throw TypeError('SIM.tag(name, settings object | null)'); else tags[name] = mix(tags[name] || {}, tree(t, name))
  all(root).forEach(k => k.tags?.includes(name) && k.api?.set({})); return tags[name] }   // live sims with the tag follow
// a sim's layers: its own tree, its tags (a later tag wins), defaults
const layers = (own, tg = []) => [tree(own || {}, tg[0] || 'own'), ...[...tg].reverse().map(n => tags[n] || {}), defaults]

// ---- time: one engine per realm. mono = m0 + (perf.now() - p0) * speed; wall = mono + off. Timers: a sorted queue fired one per
// task (microtasks run between), HTML nesting clamp; live wakes skip missed interval beats, advance() fires every beat exactly ----
// c = { speed, start, offset, state (follow an owner), media }
function clock(S, c = {}) {
  if (S.__simTime) return S.__simTime
  const RD = S.Date, PF = S.performance, rp = PF.now.bind(PF), R = () => PF.timeOrigin + rp(), rST = S.setTimeout, rCT = S.clearTimeout, rRAF = S.requestAnimationFrame, D = S.document
  const fin = (x, pos) => { x = typeof x === 'string' && isNaN(x) ? RD.parse(x) : +x; if (!Number.isFinite(x) || x < 0 && pos) throw RangeError('bad time: ' + x); return x }   // ms, a date string or a Date
  const s0 = c.state, Q = [], ids = new Map(), ch = new S.MessageChannel(), rs = new S.MessageChannel()
  let speed = s0 ? s0.speed : fin(c.speed ?? 1, 1), last = speed || 1, p0 = rp(), m0 = s0 ? s0.m + (R() - s0.r) * speed : R(), lv = 0, lr = 0, seq = 1e9, wake = 0
  let off = s0 ? s0.off : c.start != null ? fin(c.start) - m0 : +c.offset || 0, touched = speed !== 1
  const pI = p0, mI = m0, mono = () => m0 + (rp() - p0) * speed, wall = () => mono() + off
  const vperf = t => pI - mI + (t < p0 ? m0 : m0 + (t - p0) * speed)   // real perf time -> virtual, never before the last rebase
  const rebase = s => { m0 = mono(); p0 = rp(); speed = s }
  const put = x => { let i = 0, j = Q.length; while (i < j) { const k = i + j >> 1, q = Q[k]; q.at < x.at || q.at === x.at && q.n < x.n ? i = k + 1 : j = k } Q.splice(i, 0, x) }
  const head = () => { while (Q.length && ids.get(Q[0].id) !== Q[0]) Q.shift(); return Q[0] }
  const add = rep => function (fn, d = 0, ...a) { const id = seq++, x = { id, fn, a, d: Math.max(0, d | 0), lv: lv + 1, rep, n: seq }
    x.at = mono() + (x.lv > 5 ? Math.max(4, x.d) : x.d); ids.set(id, x); put(x); plan(); return id }
  const clr = real => id => ids.delete(+id | 0) || id == null || real.call(S, id)
  function fire(x, live) {   // live: a real-time wake (skips missed beats)
    Q.shift(); if (!speed && x.at > m0) m0 = x.at
    if (x.rep) { const now = mono(), p = ++x.lv > 5 ? Math.max(4, x.d) : x.d; if (live && p && x.at + p <= now) x.at = now - (now - x.at) % p; x.at += p; x.n = ++seq; put(x) } else ids.delete(x.id)
    lv = x.lv; lr || (lr = rs.port2.postMessage(0) || 1); try { typeof x.fn === 'function' ? x.fn.apply(S, x.a) : (0, S.eval)(String(x.fn)) } catch (e) { S.reportError(e) }
  }
  rs.port1.onmessage = () => lv = lr = 0; ch.port1.onmessage = () => { wake = 0; const x = head(); if (x && speed && x.at <= mono()) fire(x, 1); plan() }
  function plan() { wake && rCT.call(S, wake); wake = 0; const x = head(); if (!x || !speed) return; const d = (x.at - mono()) / speed
    d < 1 ? ch.port2.postMessage(0) : wake = rST.call(S, () => ch.port2.postMessage(0), Math.min(2 ** 31 - 1, d)) }
  Object.assign(S, { setTimeout: add(0), setInterval: add(1), clearTimeout: clr(rCT), clearInterval: clr(S.clearInterval) })
  const vNow = () => Math.floor(wall())
  S.Date = new Proxy(RD, { apply: () => new RD(vNow()).toString(), construct: (t, a, nt) => Reflect.construct(t, a.length ? a : [vNow()], nt), get: (t, k) => k === 'now' ? vNow : t[k] })
  try { Object.defineProperty(RD.prototype, 'constructor', { value: S.Date, configurable: true, writable: true }) } catch {}
  try { PF.now = () => vperf(rp()) } catch {}
  if (rRAF) { let ft, fv; S.requestAnimationFrame = f => rRAF.call(S, t => f(t === ft ? fv : fv = vperf(ft = t))) }   // one frame, one timestamp
  const ed = S.Event && Object.getOwnPropertyDescriptor(S.Event.prototype, 'timeStamp')
  if (ed?.get) try { Object.defineProperty(S.Event.prototype, 'timeStamp', { configurable: true, enumerable: true, get() { return vperf(ed.get.call(this)) } }) } catch {}
  // media: rate = the app's own rate (sign kept) * speed; <audio>/<video> clamp to 1/16..16 and hold at 0; advance() moves them
  const nodes = new Set(), rate = x => { try { const v = x.playbackRate, b = v === x.__simR ? x.__simB : v; x.__simB = b
    if ('paused' in x) { if (!speed) { x.paused || (x.__simHeld = 1, x.pause()); return } if (x.__simHeld) x.__simHeld = 0, x.play()?.catch?.(() => {}) }
    x.playbackRate = x.__simR = 'paused' in x ? Math.min(16, Math.max(1 / 16, b * speed)) : b * speed } catch {} }
  const media = () => D ? [...new Set([...D.querySelectorAll('audio,video'), ...nodes]), ...D.getAnimations?.() || []] : []
  if (c.media !== false && D) {
    for (const t of ['animationstart', 'transitionrun']) S.addEventListener(t, e => touched && e.target.getAnimations?.().forEach(rate), true)
    const EP = S.Element?.prototype, ea = EP?.animate; if (ea) EP.animate = function animate(k, o) { const a = ea.apply(this, arguments); touched && rate(a); return a }   // script animations fire no event
    const MP = S.HTMLMediaElement?.prototype, pl = MP?.play; if (pl) MP.play = function play() { this.isConnected || nodes.add(this) && this.addEventListener('ended', () => nodes.delete(this), { once: true }); const r = pl.apply(this, arguments); touched && rate(this); return r }   // detached new Audio() too
  }
  const state = () => ({ m: mono(), r: R(), speed, off, time: wall(), pending: ids.size })
  const changed = () => { touched ||= speed !== 1; c.media !== false && touched && media().forEach(rate); plan(); api.onchange?.(state()) }
  const yieldTask = () => new S.Promise(r => { const m = new S.MessageChannel(); m.port1.onmessage = r; m.port2.postMessage(0) })
  const api = S.__simTime = {
    now: vNow, perf: () => vperf(rp()), state, pending: () => ids.size,
    speed(x) { if (x == null) return speed; rebase(fin(x, 1)); if (speed) last = speed; changed(); return speed },
    pause: () => api.speed(0), resume: x => api.speed(x ?? last),
    // every due timer fires at its exact time; { async: true } yields a task after each, so awaiting code moves on
    advance(d, o) { d = fin(d, 1); const s = speed, end = mono() + d; rebase(0)
      const done = () => { const dt = end - m0; m0 = end; media().forEach(a => a.playState === 'running' ? a.currentTime += dt * (a.__simB ?? 1) : a.__simHeld && (a.currentTime += dt / 1000 * (a.__simB ?? 1))); rebase(s); changed(); return vNow() }
      const run = g => { for (let x; (x = head()) && x.at <= end && g++ < 1e6;) { fire(x); if (o?.async) return yieldTask().then(() => run(g)) } return done() }
      return run(0) },
    set(x) { off = fin(x) - mono(); changed(); return vNow() },
    shift(d) { off += fin(d); changed(); return vNow() },
    follow(s) { const t = s.m + (R() - s.r) * s.speed; off = s.off; if (!s.speed && t > mono()) { rebase(0); api.advance(t - mono()) } rebase(s.speed); if (speed) last = speed; m0 = t; changed() }   // a follower takes its owner's time; a paused jump is replayed exactly
  }
  return api
}


// ---- nodes: a tree (host > sims > nested sims) with state, listeners, an undo list and an abort signal ----
let seq = 0; const HID = Math.random().toString(36).slice(2, 7), uid = p => p + '_' + HID + (++seq).toString(36)   // ids name storage: unique across tabs
function node(kind, parent, id = uid(kind)) {
  const n = { id, kind, parent, kids: new Map(), undo: [], subs: {}, ac: new AbortController(), st: { id, kind, status: 'new', t0: Date.now() } }
  parent && parent.kids.set(id, n)
  return n
}
const own = (n, f) => (n.undo.push(f), f)   // kill runs these in reverse
const on = (n, type, fn) => ((n.subs[type] ||= new Set()).add(fn), () => n.subs[type].delete(fn))
const emit = (n, type, data) => { for (let x = n; x; x = x.parent) x.subs[type]?.forEach(f => { try { f(data, n) } catch (e) { reportError(e) } }) }   // bubbles up
const put = (n, p) => { if (n.st.status === 'dead') delete p.status; Object.assign(n.st, p); emit(n, 'state', p); return n.st }   // dead stays dead
function kill(n, why = 'killed') {
  if (n.st.status === 'dead') return false
  const kids = [...n.kids.values()].reverse(); kids.forEach(k => kill(k, why))
  put(n, { status: 'dead', why }); n.ac.abort(Error('dead'))
  const ps = []; for (const f of n.undo.splice(0).reverse()) try { const r = f(); r?.then && ps.push(r.catch(() => {})) } catch {}
  n.done = Promise.all([...ps, ...kids.map(k => k.done)]).then(() => true)
  n.parent?.kids.delete(n.id); emit(n, 'kill', why)
  return true
}
const find = (n, path) => { for (const s of String(path).split('/')) if (s && !(n = n.kids.get(s))) return; return n }   // 'id/nested id'
const all = n => [...n.kids.values()].flatMap(k => [k, ...all(k)])
const root = node('host', null, 'host')
root.mem = { local: new Map(), session: new Map(), cookie: new Map(), faces: new Set(), paths: new Set(['/']) }

// ---- waits: native signals (the node's life, the caller's, a timeout) and real timers ----
const RT = { st: setTimeout.bind(G), ct: clearTimeout.bind(G), now: (P => () => P.timeOrigin + P.now())({ timeOrigin: performance.timeOrigin, now: performance.now.bind(performance) }) }
const sig = (n, o, T) => AbortSignal.any([n.ac.signal, o?.signal, T > 0 && AbortSignal.timeout(T)].filter(Boolean))
const within = (p, s, name) => new Promise((res, rej) => { const ab = () => { const r = s.reason; rej(r?.name === 'TimeoutError' ? Error('timeout: ' + name) : r instanceof Error ? r : Error(String(r))) }
  if (s.aborted) return ab(); s.addEventListener('abort', ab, { once: true }); Promise.resolve(p).then(res, rej) })
// check() until truthy -> true; false on timeout (0 = none) or abort; a throw counts as "not yet"
const until = (check, { timeout = 15000, every = 100, signal } = {}) => new Promise(res => {
  let done; const stop = v => done || (done = 1, res(v)); signal?.addEventListener('abort', () => stop(false), { once: true }); timeout > 0 && RT.st(() => stop(false), timeout)
  ;(function tick() { if (done || signal?.aborted) return stop(false); Promise.resolve().then(check).then(v => v ? stop(true) : RT.st(tick, every), () => RT.st(tick, every)) })()
})

// ---- logs: one capped sink per sim, on the host; realms send rendered lines. The first keepHead lines never drop; later ones
// roll behind one "...[N dropped]..." line; long lines keep head and tail; a repeat of the last line becomes "line (xN)" ----
const isErr = x => !!x && typeof x === 'object' && typeof x.name === 'string' && typeof x.message === 'string'   // Error, DOMException, look-alikes
const errStr = e => { const h = e.name + (e.message ? ': ' + e.message : ''), s = String(e.stack || ''); return (s.startsWith(h) ? s : h + (s ? '\n' + s : '')) + (e.errors?.length ? '\n errors: ' + [...e.errors].map(x => str(x)).join('\n ') : '') + (e.cause != null ? '\n cause: ' + str(e.cause) : '') }
function str(x, lim) {
  try { if (typeof x === 'string') return x; if (x === null || typeof x !== 'object') return String(x); if (isErr(x)) return errStr(x)
    let n = 0; try { return JSON.stringify(x, (k, v) => { if (isErr(v)) return errStr(v); if (lim && (n += k.length + (typeof v === 'string' ? v.length : 4)) > lim) throw 0; return v }) }
    catch { const ks = Object.keys(x).slice(0, 20); return Object.prototype.toString.call(x) + (ks.length ? ' {' + ks.join(',') + (ks.length > 19 ? ',...' : '') + '}' : '') } } catch { return '[unprintable]' }
}
const line = (L, pre, parts) => pre + Array.from(parts, x => str(x, get(L, 'log/clip') * 2)).join(' ')
function push(n, k, s) {   // k = 'logs' | 'errs'; the policy is read live from the sim's settings
  const a = n.st[k], max = Math.max(3, get(n.L, 'log/max')), head = Math.min(get(n.L, 'log/keepHead'), max - 2), C = get(n.L, 'log/clip')
  if (C && s.length > C) { const h = Math.floor(C * .7); s = s.slice(0, h) + ' ...[' + (s.length - C) + ' chars cut]... ' + s.slice(s.length - (C - h)) }
  if (a.last === s) return void (a[a.length - 1] = s + ' (x' + ++a.rep + ')')
  a.last = s; a.rep = 1; a.push(s)
  while (a.length > max) { if (a.dropped) a.splice(head + 1, 1); a.dropped = (a.dropped | 0) + 1; a[head] = '...[' + a.dropped + ' dropped]...' }
}
function capture(S, c) {   // console.* and error events of one realm -> its sim's sink
  const C = S.console, say = (k, pre, a) => { try { c.log(k, line(c.L, pre, a)) } catch {} }
  for (const k of ['log', 'warn', 'error', 'info', 'debug', 'trace']) { const o = C[k]?.bind(C) || (() => {}); C[k] = (...a) => (say('logs', k + ': ', a), o(...a)) }
  S.addEventListener('error', e => say('errs', e.error ? 'Uncaught ' : '', [e.error || e.message + (e.filename ? ` (${e.filename}:${e.lineno}:${e.colno || 0})` : '')]))
  S.addEventListener('unhandledrejection', e => say('errs', 'rej: ', [e.reason]))
}

// ---- page: html -> html as a table of steps, the same for the first load and every navigation (role 'main') and child frames
// (role 'frame': fixes and boot only). ctx = { L, url, origin, nav, role, boot }; ctx.errors / ctx.bridge are filled in ----
const attr = s => String(s).replace(/"/g, '&quot;')
// whole tags: quoted attribute values and comments are consumed (a <script> in srcdoc="..." is none); a script's text ends at indexOf
const TAG = /<!-{2}[\s\S]*?-->|<[a-z!\/](?:[^>"']|"[^"]*"|'[^']*')*>/gi
function* tokens(h) { const re = new RegExp(TAG), end = /<\/script/gi; for (let m; (m = re.exec(h));) { if (/^<script\b/i.test(m[0])) { end.lastIndex = m.at = re.lastIndex; const e = end.exec(h)?.index ?? h.length; m.js = h.slice(m.at, e); re.lastIndex = e } yield m } }
const script = s => '<script>' + s + '<\/script>'
// code -> tags: a string = inline script, { src } = external script, { html } = raw markup, or a list of these
const tagsOf = x => [].concat(x ?? []).map(c => c == null ? '' : typeof c === 'object' ? (c.html != null ? String(c.html) : c.src != null ? `<script src="${attr(c.src)}"><\/script>` : '') : script(c)).join('')
// a string/RegExp pair is one edit; a function gets (html, { url, navigation }); a list holds any of these
const edits = E => E == null ? [] : Array.isArray(E) && (typeof E[0] === 'string' || E[0] instanceof RegExp) ? [E] : [].concat(E)
const BRIDGE = 'window.__app={run:function(){return eval(arguments[0])},v:1};'   // no locals: the app's own names stay visible
// injected code goes after the last <!doctype>/<html>/<head> before the first <script> or <body>
const spliceHead = (h, t) => { let at = 0; for (const m of tokens(h)) { if (/^<(script|body)\b/i.test(m[0])) break; if (/^<(!doctype|html|head)\b/i.test(m[0])) at = m.index + m[0].length } return h.slice(0, at) + t + h.slice(at) }
const STEPS = {
  edit: (h, c) => c.role !== 'main' ? h : edits(get(c.L, 'page/edit')).reduce((h, e, i) => { try { return typeof e === 'function' ? (v => v == null ? h : String(v))(e(h, { url: c.url, navigation: c.nav | 0 })) : typeof e[0] === 'string' ? h.split(e[0]).join(typeof e[1] === 'function' ? e[1](e[0]) : e[1]) : h.replace(e[0], e[1]) } catch (x) { c.errors.push('edit ' + i + ': ' + (x?.message ?? x)); return h } }, h),
  // <meta http-equiv> refresh (navigation not 'allow') and CSP (csp 'strip') are kept but switched off; Rocket Loader scripts run as normal scripts
  fixes: (h, c) => { const eq = [get(c.L, 'realm/navigation') !== 'allow' && 'refresh', get(c.L, 'page/csp') === 'strip' && 'content-security-policy'].filter(Boolean)
    if (eq.length) h = h.replace(new RegExp('<meta\\b([^>]*?)\\bhttp-equiv(\\s*=\\s*["\']?(?:' + eq.join('|') + '))', 'gi'), '<meta$1data-sim-http-equiv$2')
    const rl = /<script\b[^>]*\bsrc\s*=\s*["']?[^"'\s>]*rocket-loader[^>]*>\s*<\/script\s*>/gi
    return get(c.L, 'page/rocketLoader') === 'undo' && rl.test(h) ? spliceHead(h.replace(rl, '').replace(/(<script\b[^>]*?\stype\s*=\s*["']?)[0-9a-f]{8,}-(text\/javascript|module)\b/gi, '$1$2'), script('window.__cfRLUnblockHandlers=1')) : h },
  // window.__app.run at the earliest IIFE opening of an inline script (past "use strict") where inserting code breaks
  // the script (so not in a string, comment or regex)
  bridge: (h, c) => { if (c.role !== 'main' || !get(c.L, 'page/bridge')) return (c.bridge = 'off', h)
    const code = get(c.L, 'page/bridgeCode') || BRIDGE, ps = [].concat(get(c.L, 'page/bridgePatterns')).map(p => (p = re(p), RegExp(p.source, p.flags + 'g')))
    for (const m of tokens(h)) { const a = m[0], js = m.js; if (js == null || /\ssrc\s*=/i.test(a) || /\stype\s*=\s*["']?(?!(?:text|application)\/(?:java|ecma)script|module)/i.test(a)) continue
      const ok = i => { try { Function(js.slice(0, i) + '@@@' + js.slice(i)) } catch { return 1 } }
      const i = Math.min(...ps.map(p => { for (const r of js.matchAll(p)) if (ok(r.index + r[0].length)) return r.index + r[0].length; return 1 / 0 })); if (i === 1 / 0) continue   // the earliest of all patterns
      const d = /^\s*(['"])use strict\1;?/.exec(js.slice(i)), at = m.at + i + (d ? d[0].length : 0); c.bridge = 'ok'; return h.slice(0, at) + (d && !d[0].endsWith(';') ? ';' : '') + code + h.slice(at) }
    c.bridge = 'missing'; return h },
  // a page of another origin (via a proxy) cannot take its url: a <base> points its relative urls home
  base: (h, c) => { if (!c.url || new URL(c.url).origin === c.origin) return h; const m = /<base\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(h)
    return spliceHead(h, `<base href="${attr(new URL(m ? m[1] ?? m[2] ?? m[3] : '', c.url).href)}">`) },
  // tail, then head: the boot is the library's own source and must not be searched
  tail: (h, c) => { let t = c.role === 'main' ? tagsOf(get(c.L, 'page/append')) : '', i = h.length; for (const m of h.matchAll(/<\/body/gi)) i = m.index; return !t ? h : h.slice(0, i) + t + h.slice(i) },
  head: (h, c) => spliceHead(h, (c.boot ? script(c.boot) : '') + (c.role === 'main' ? tagsOf(get(c.L, 'page/prepend')) : '')),

}
function page(html, c) {
  c.errors = []; html = String(html)
  for (const k in STEPS) try { html = STEPS[k](html, c) } catch (e) { c.errors.push(k + ': ' + (e?.message ?? e)) }
  return html
}
// a page into a fresh about:blank window; the boot's first act gives it its real url (replaceState)
const write = (w, html) => { const d = w.document; d.open(); d.write(html); d.close() }

// ---- hooks: every change to a realm API is one row [setting, target, key, how, make]; one loop installs them ----
// how: 'value' (replace), 'get' (accessor returning make(orig), made on first read), 'accessor' (make returns { get, set }), 'absent' (remove)
// make(orig, S, ctx, descriptor) -> the replacement. A row whose target or key does not exist in a realm is skipped (false in report().hooks).
function patch(o, k, how, make) {
  let d, p = o; while (p && !(d = Object.getOwnPropertyDescriptor(p, k))) p = Object.getPrototypeOf(p)
  if (how === 'absent') { for (p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) try { delete p[k] } catch {} ; if (k in o) Object.defineProperty(o, k, { configurable: true, get() {} }); return o[k] === undefined }
  if (!d) return false; const orig = () => d.get ? d.get.call(o) : d.value
  if (how === 'value') { const v = make(orig(), d); Object.defineProperty(o, k, { configurable: true, writable: true, enumerable: d.enumerable, value: v }); return o[k] === v }
  let v, made; Object.defineProperty(o, k, { configurable: true, enumerable: d.enumerable, ...how === 'accessor' ? make(null, d) : { get: () => made ? v : (made = 1, v = make(orig(), d)) } }); return true
}
const HOW = ['value', 'get', 'accessor', 'absent'], rowOk = r => { if (typeof r[1] !== 'function' || !HOW.includes(r[3]) || r[3] !== 'absent' && typeof r[4] !== 'function') throw TypeError('a hook row is [setting, S => target, key, how, make]'); return r }
const hooks = [], extraHooks = []   // built-in rows; SIM.hook rows and a sim's own rows travel with the sim
const hook = (setting, target, key, how, make) => hooks.push([setting, target, key, how, make])
// install every enabled row into realm S (a setting of false | 'off' | 'allow' disables a row); returns { key: stuck } for the report
function install(S, c, rows = hooks) {
  const r = {}
  for (const [s, t, k, how, make] of rows) { const v = s ? get(c.L, s) ?? true : true; if (!v || v === 'off' || v === 'allow') continue
    try { const o = t(S); r[k] = r[k] !== false && !!o && k in o && patch(o, k, how, (x, d) => make(x, S, c, d)) } catch { r[k] = false } }
  return r
}
// a fake object (WebSocket, EventSource): an EventTarget with the real prototype; on<event> handlers are listeners, so e.target is set
function shell(S, { proto, props = {}, getters = {}, methods = {}, events = [] }) {
  const o = new S.EventTarget(), def = (k, d) => Object.defineProperty(o, k, { configurable: true, ...d })
  if (proto) try { Object.setPrototypeOf(o, proto) } catch {}
  for (const k in props) def(k, { enumerable: true, writable: true, value: props[k] })
  for (const k in getters) def(k, { enumerable: true, get: getters[k] })
  for (const k in methods) def(k, { writable: true, value: methods[k] })
  for (const e of events) { let h = null; S.EventTarget.prototype.addEventListener.call(o, e, ev => typeof h === 'function' && h.call(o, ev)); def('on' + e, { enumerable: true, get: () => h, set: f => h = f }) }
  def('fire', { value: (type, init, C = S.Event) => S.EventTarget.prototype.dispatchEvent.call(o, new C(type, init)) })
  return o
}
// blocked APIs are absent, as in a browser without them (feature detection says no): a gate value 'allow' keeps them
hook('realm/serviceWorker', S => S.navigator, 'serviceWorker', 'absent')
hook('realm/storageBuckets', S => S.navigator, 'storageBuckets', 'absent')
hook('realm/cookieStore', S => S, 'cookieStore', 'absent')   // it would bypass the cookie face

// ---- loading a url (host side, every page load): through the sim's network (routes, offline) first; if that fails and net/proxy is
// set, the proxies race: started net/proxyStagger ms apart, a failure starts the next at once, the first good reply wins. All within net/timeout ----
const proxies = L => [].concat(get(L, 'net/proxy') ?? []).map(x => typeof x === 'string' ? { url: x } : x).filter(x => x?.url)
const viaProxy = (p, url) => /[?=]$/.test(p.url) ? p.url + encodeURIComponent(url) : p.url + url   // a prefix ending in ? or = gets the url encoded
const unwrap = t => { try { const j = JSON.parse(t); if (typeof j?.contents === 'string') return j.contents } catch {} return t }   // { contents } replies
const text = (F, u, o) => F(u, o).then(r => r.ok ? r.text().then(t => [t, r.url || u]) : Promise.reject(Error('HTTP ' + r.status)))
const raceProxies = (url, list, stagger, T) => new Promise((res, rej) => {
  let next = 0, won = false, failed = 0, tm = 0; const errors = [], c = new AbortController()
  const launch = () => { if (won || next >= list.length) return; const i = next++, p = list[i]; RT.ct(tm); tm = next < list.length && RT.st(launch, stagger[Math.min(i, stagger.length - 1)] || 0)
    text(fetch, viaProxy(p, url), { signal: AbortSignal.any([c.signal, AbortSignal.timeout(T)]) }).then(([t]) => unwrap(t) || Promise.reject(Error('empty reply'))).then(t => { if (won) return; won = true; RT.ct(tm); c.abort(); res({ text: t, proxy: p, errors }) },
      e => { if (won) return; errors.push((p.name || p.url) + ': ' + e.message); ++failed >= list.length ? (RT.ct(tm), rej(Object.assign(Error('all proxies failed'), { errors }))) : launch() }) }
  list.length ? launch() : rej(Error('no proxies'))
})
// -> { url, html, via: 'direct' | 'proxy', proxy, errors } ; throws an Error carrying the same fields plus kind: 'http' | 'offline' | 'timeout' | 'cors' | 'unreachable'
async function loadUrl(url, n, init) {
  const L = n.L, T = get(L, 'net/timeout'), list = proxies(L), info = { url, errors: [] }
  const viaP = async e => { if (!list.length) throw e; try { const r = await raceProxies(url, list, [].concat(get(L, 'net/proxyStagger')), T); return Object.assign(info, { html: r.text, via: 'proxy', proxy: r.proxy.url, errors: r.errors }) } catch (x) { info.errors = x.errors || [x.message]; throw e || x } }
  try { if (get(L, 'net/proxyMode') === 'always' && list.length) return await viaP(null); try { const [html, u] = await text(n.F, url, { ...init, signal: AbortSignal.timeout(T) }); return Object.assign(info, { html, url: u, via: 'direct' }) } catch (e) { info.directError = e.message; return await viaP(e) } }
  catch (e) { info.kind = get(L, 'net/offline') ? 'offline' : /^HTTP /.test(info.directError) ? 'http' : e.name === 'TimeoutError' ? 'timeout' : await fetch(url, { mode: 'no-cors', signal: AbortSignal.timeout(T) }).then(() => 'cors', () => 'unreachable'); throw Object.assign(e, info) }
}

// ---- sharing: every named browser resource is placed by one rule, share/<kind>/<name> -> 'own' | 'real' | '<group>':
// '~s<id>~name' | name | '~g<group>~name'. Listing, events, cleanup read it back. kinds: local session cookie idb cache lock channel worker opfs ----
// the real stores (in a sim page the globals are faces)
const CK = G.Document && Object.getOwnPropertyDescriptor(Document.prototype, 'cookie'), RS = (() => { try { return { l: localStorage, s: sessionStorage, idb: indexedDB, ca: G.caches, gd: navigator.storage?.getDirectory?.bind(navigator.storage) } } catch { return {} } })()
const pre = (k, v) => '~' + k + String(v).replace(/~/g, '-') + '~'
const where = (c, kind, name) => { const v = get(c.L, ['share', kind, name]); return typeof v !== 'string' || v === 'own' ? pre('s', c.id) : v === 'real' ? '' : pre('g', v) }
const split = rk => { const m = /^~[sg][^~]*~/.exec(rk); return m ? [m[0], rk.slice(m[0].length)] : ['', rk] }
const seen = (c, kind, rk) => { const [p, n] = split(String(rk)); return where(c, kind, n) === p ? n : null }
// key-value engine (local, session, cookie): store 'memory' (default: a host Map under the prefixed names) | 'real' (the browser's store)
function kv(c, kind, real) {
  const M = c.mem[kind], pos = n => { const p = where(c, kind, n = String(n)); return [p + n, p && get(c.L, ['store', kind]) !== 'real' ? M : null] }
  let K; const k = { c, kind, real, pos,   // K: keys, cached for a task

    get: n => { const [x, m] = pos(n); return m ? m.get(x) ?? null : real.getItem(x) },
    set: (n, v, a) => { K = null; const [x, m] = pos(n); m ? m.set(x, String(v)) : real.setItem(x, String(v), a) },
    del: n => { K = null; const [x, m] = pos(n); m ? m.delete(x) : real.removeItem(x) },
    keys: () => K ||= (queueMicrotask(() => K = null), [...new Set([...M.keys(), ...Array.from({ length: real.length }, (_, i) => real.key(i))].map(x => seen(c, kind, x)))].filter(n => n != null && k.get(n) != null)) }
  return k
}
// a real document.cookie as a Storage (setItem's 3rd arg: attributes)
const jar = D => { const all = () => Object.fromEntries(String(CK.get.call(D)).split(/;\s*/).filter(Boolean).map(x => { const i = x.indexOf('='); return i < 0 ? ['', x] : [x.slice(0, i), x.slice(i + 1)] }))
  return { getItem: k => all()[k] ?? null, setItem: (k, v, a = '; path=/') => CK.set.call(D, k + '=' + v + a), removeItem: k => CK.set.call(D, k + '=; max-age=0; path=/'), key: i => Object.keys(all())[i] ?? null, get length() { return Object.keys(all()).length } } }
function storageFace(S, k) {   // localStorage / sessionStorage over a kv
  const F = k.c.mem.faces, me = { S, k }   // memory names: we send the storage events
  const tell = (n, o, v) => { const [x, m] = k.pos(n); m && F.forEach(f => { const [y, fm] = f.k.pos(n); f !== me && fm === m && y === x && RT.st(() => f.ev(n, o, v)) }) }
  const api = { getItem: n => k.get(n), setItem: (n, v) => { const o = k.get(n); k.set(n, v); tell(n, o, String(v)) }, removeItem: n => { const o = k.get(n); k.del(n); o != null && tell(n, o, null) }, clear: () => k.keys().forEach(api.removeItem), key: i => k.keys()[i | 0] ?? null }
  Object.defineProperty(Object.setPrototypeOf(api, S.Storage.prototype), 'length', { configurable: true, get: () => k.keys().length })   // instanceof Storage
  const face = new Proxy(api, { get: (t, p) => typeof p === 'symbol' || p in api ? api[p] : k.get(p) ?? undefined, set: (t, p, v) => (typeof p === 'string' && api.setItem(p, v), true), deleteProperty: (t, p) => (typeof p === 'string' && api.removeItem(p), true), has: (t, p) => p in api || typeof p === 'string' && k.get(p) !== null, ownKeys: () => k.keys(), getOwnPropertyDescriptor: (t, p) => { const v = typeof p === 'string' ? k.get(p) : null; return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true } } })
  me.ev = (key, o, v) => { const e = new S.StorageEvent('storage', { key, oldValue: o, newValue: v, url: S.location.href }); Object.defineProperty(e, 'storageArea', { value: face }); e.__sim = 1; S.dispatchEvent(e) }
  F.add(me); S.addEventListener('pagehide', () => F.delete(me))
  // native 'storage' events carry prefixed keys: translate them, hide the rest
  S.addEventListener('storage', e => { if (e.__sim || e.storageArea !== k.real) return; e.stopImmediatePropagation(); const n = e.key == null ? null : seen(k.c, k.kind, e.key); if (e.key == null || n != null && !k.pos(n)[1]) me.ev(n, e.oldValue, e.newValue) }, true)
  return face
}
// document.cookie over a kv: real names keep their attributes (expires on the sim clock); memory keeps name=value
const cookieFace = (S, k) => ({ get: () => k.keys().map(n => n + '=' + k.get(n)).join('; '), set(s) { const [kvp, ...at] = String(s).split(';'), i = kvp.indexOf('='), n = (i < 0 ? '' : kvp.slice(0, i)).trim(), v = (i < 0 ? kvp : kvp.slice(i + 1)).trim()
  const a = at.map(x => x.trim().replace(/^expires=(.*)/i, (_, d) => 'max-age=' + Math.round((new Date(d) - Date.now()) / 1000))), path = a.find(x => /^path=/i.test(x))
  path && k.c.mem.paths.add(path.slice(5)); a.some(x => /^max-age=\s*(-|0*(\.|$))/i.test(x)) ? k.del(n) : k.set(n, v, a.length ? '; ' + a.join('; ') : undefined) } })
// named APIs: name methods map their first argument, list methods map results back
function named(c, kind, real, names, lists) {
  const o = {}, rk = n => where(c, kind, n) + n, back = v => typeof v === 'string' ? seen(c, kind, v) : v && typeof v === 'object' && 'name' in v ? (n => n == null ? null : { ...v, name: n })(seen(c, kind, v.name)) : v
  const list = v => Array.isArray(v) ? v.map(back).filter(x => x != null) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, list(x)])) : v
  for (const m of names) o[m] = (n, ...a) => real[m](rk(n), ...a)
  for (const m of lists) o[m] = (...a) => Promise.resolve().then(() => real[m](...a)).then(list)
  o.rk = rk; return o
}
hook(null, S => S, 'localStorage', 'value', (o, S, c) => storageFace(S, kv(c, 'local', o)))   // eager: events from the start
hook(null, S => S, 'sessionStorage', 'value', (o, S, c) => storageFace(S, kv(c, 'session', o)))
hook(null, S => S.document, 'cookie', 'accessor', (v, S, c) => cookieFace(S, kv(c, 'cookie', jar(S.document))))
hook(null, S => S, 'indexedDB', 'get', (o, S, c) => Object.assign(named(c, 'idb', o, ['open', 'deleteDatabase'], ['databases']), { cmp: (a, b) => o.cmp(a, b) }))
hook(null, S => S, 'caches', 'get', (o, S, c) => { const w = named(c, 'cache', o, ['open', 'has', 'delete'], ['keys'])
  w.match = (r, op = {}) => op.cacheName ? o.match(r, { ...op, cacheName: w.rk(op.cacheName) }) : w.keys().then(ks => ks.reduce((p, n) => p.then(x => x || o.open(w.rk(n)).then(ch => ch.match(r, op))), Promise.resolve(undefined))); return w })
hook(null, S => S.navigator, 'locks', 'get', (o, S, c) => named(c, 'lock', o, ['request'], ['query']))
hook(null, S => S, 'BroadcastChannel', 'value', (o, S, c) => class BroadcastChannel extends o { constructor(n) { super(where(c, 'channel', n) + n) } })
for (const [C, k] of [['IDBDatabase', 'idb'], ['BroadcastChannel', 'channel']]) hook(null, S => S[C]?.prototype, 'name', 'accessor', (v, S, c, d) => ({ get() { return seen(c, k, d.get.call(this)) } }))
hook(null, S => S.navigator.storage, 'getDirectory', 'value', (o, S, c) => () => o.call(S.navigator.storage).then(r => (p => p ? r.getDirectoryHandle(p + 'root', { create: true }) : r)(where(c, 'opfs', 'root'))))
// delete every name that passes hit (kill, SIM.drop, sweep): memory stores, then the real ones
async function drop(hit) {
  const n = { local: 0, session: 0, cookie: 0, idb: 0, cache: 0, opfs: 0 }, D = G.document
  for (const k of ['local', 'session', 'cookie']) for (const x of root.mem[k].keys()) hit(x) && root.mem[k].delete(x) && n[k]++
  for (const [st, k] of [[RS.l, 'local'], [RS.s, 'session']]) try { for (let i = st.length; i--;) { const x = st.key(i); hit(x) && (st.removeItem(x), n[k]++) } } catch {}
  try { for (const c of CK.get.call(D).split(/;\s*/)) { const x = c.split('=')[0]; x && hit(x) && (root.mem.paths.forEach(pa => CK.set.call(D, x + '=; max-age=0; path=' + pa)), n.cookie++) } } catch {}
  try { for (const d of await RS.idb.databases()) hit(d.name) && (await new Promise(r => { const q = RS.idb.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = r }), n.idb++) } catch {}
  try { for (const k of await RS.ca.keys()) hit(k) && (await RS.ca.delete(k), n.cache++) } catch {}
  try { const r = await RS.gd(); for await (const k of r.keys()) hit(k) && (await r.removeEntry(k, { recursive: true }), n.opfs++) } catch {}
  return n
}

// ---- network (realm side): Request -> one decision (offline | route | proxy | pass) -> Response. fetch, XHR, sendBeacon and
// EventSource all consume that Response; WebSocket has its own fake peer. Routes are rows on the sim node (and its parents):
// { id, ws, test, method, delay, times, fn } ----
const patTest = p => p == null ? () => true : typeof p === 'function' ? p : p instanceof RegExp ? (p = re(p), u => p.test(u)) : u => u.includes(p)
const routeRow = (p, fn, o = {}) => { if (typeof fn !== 'function') throw TypeError('route(pattern, fn, { method, times, delay, kind })'); return { id: uid('rt'), ws: o.kind === 'ws' || /^wss?:/.test(p), test: patTest(p), method: o.method ? String(o.method).toUpperCase() : null, delay: o.delay || 0, times: o.times || 0, fn } }
const abs = (S, u, ws) => { const b = S.document?.baseURI || S.location.href; try { return new S.URL(u, ws ? b.replace(/^http/, 'ws') : b).href } catch { return String(u) } }
// the page's cross-origin requests go through the proxy the page itself was loaded through ('auto'), or the first proxy (true); a getOnly proxy is swapped for non-GET
const proxyFor = (c, url, method) => { const m = get(c.L, 'net/proxyRequests'), list = proxies(c.L), via = c.host?.st.load?.proxy, u = new URL(url); if (!c.host || !m || !list.length || m === 'auto' && !via) return null
  if (!/^https?:$/.test(u.protocol) || u.origin === c.origin || list.some(p => url.startsWith(p.url))) return null
  let p = list.find(p => p.url === via) || list[0]; if (method !== 'GET' && p.getOnly) p = list.find(x => !x.getOnly); return p ? viaProxy(p, url) : null }
// decided when the request is sent; data:, blob: and other schemes always pass. Routes of parent sims apply too (nested sims)
const decide = (c, url, method, ws) => { if (!/^(https?|wss?):/.test(url)) return {}; if (get(c.L, 'net/offline')) return { offline: 1 }
  for (let h = c.host; h; h = h.parent) { const r = h.routes?.find(r => r.ws === !!ws && r.times >= 0 && (!r.method || r.method === method) && r.test(url)); if (r) return { route: r } }
  if (!c.page && get(c.L, 'net/unrouted') === 'block') return { offline: 1 }; const p = !ws && !c.page && proxyFor(c, url, method); return p ? { proxy: p } : {} }
const ctOf = t => /^\s*(data|event|id|retry):/.test(t) ? 'text/event-stream' : /^\s*[[{]/.test(t) && (() => { try { return JSON.parse(t), 1 } catch {} })() ? 'application/json' : 'text/plain;charset=UTF-8'
// a handler reply -> Response: a string | { status, statusText, headers, body (an object = JSON), delay } | a Response | a promise of these
function toResp(S, v, url) {
  if (typeof v?.arrayBuffer === 'function') return v
  const o = v == null || typeof v !== 'object' ? { body: v ?? '' } : v, st = o.status || 200, h = new S.Headers(o.headers); let b = o.body ?? ''
  if (isO(b) || Array.isArray(b)) { b = JSON.stringify(b); h.has('content-type') || h.set('content-type', 'application/json') }
  typeof b === 'string' && !h.has('content-type') && h.set('content-type', ctOf(b))
  if (st < 200 || st > 599) throw new S.TypeError('Failed to fetch (status ' + st + ')')
  const r = new S.Response([204, 205, 304].includes(st) ? null : b, { status: st, statusText: o.statusText || '', headers: h }); Object.defineProperty(r, 'url', { value: url }); return r
}
async function answer(S, c, r, q) {   // a routed request -> Response; the delay runs on the sim clock; the request's signal is honoured
  const s = q.signal; s?.throwIfAborted(); if (r.times && !--r.times) r.times = -1; let v
  try { v = await r.fn(q.url, { url: q.url, method: q.method, headers: Object.fromEntries(q.headers), body: /^(GET|HEAD)$/.test(q.method) ? null : await q.clone().text(), req: q }) }
  catch (e) { c.emit('routeError', { url: q.url, error: String(e?.message ?? e) }); v = { status: 500, body: 'handler error: ' + String(e?.message ?? e) } }
  const d = v?.delay ?? r.delay; if (d) await new S.Promise((res, rej) => { const t = S.setTimeout(res, d); s?.addEventListener('abort', () => { S.clearTimeout(t); rej(s.reason) }, { once: true }) })
  s?.throwIfAborted(); return toResp(S, v, q.url)
}
// -> a Response, or { pass: Request } for the browser. A routed redirect is followed (20 hops)
const net = (S, c, q, h = 0) => { const d = decide(c, q.url, q.method); return d.offline ? S.Promise.reject(new S.TypeError('Failed to fetch (sim offline)')) : d.route ? answer(S, c, d.route, q).then(r => { const l = r.status > 300 && r.status < 309 && q.redirect === 'follow' && r.headers.get('location')
  if (!l) return r; if (h > 19) throw new S.TypeError('Failed to fetch (too many redirects)'); const g = r.status === 303 ? !/^(GET|HEAD)$/.test(q.method) : r.status < 303 && q.method === 'POST'   // the browser's rule: these become GET
  return net(S, c, new S.Request(new S.URL(l, q.url), g ? { headers: q.headers, signal: q.signal } : q), h + 1).then(x => x.pass ? x : Object.defineProperty(x, 'redirected', { value: true })) }) : S.Promise.resolve({ pass: d.proxy ? new S.Request(d.proxy, q) : q }) }
const fetchOf = (S, c, o) => function fetch(i, init) { let q; try { q = new S.Request(typeof i === 'string' || i instanceof S.URL ? abs(S, i) : i, init) } catch (e) { return S.Promise.reject(e) }
  c.net.active++; return net(S, c, q).then(r => r.pass ? o.call(S, r.pass) : r).finally(() => c.net.active--) }
// XHR: a routed or offline request is answered by the native object itself: it is re-opened on a blob url of the route's Response
// (a dead blob url = a network error), so readyState, events, responseType and abort stay native
function xhrOf(S, c, XP) {
  const xo = XP.open, xs = XP.send, xh = XP.setRequestHeader, xa = XP.abort, P = ['status', 'statusText', 'responseURL', 'getResponseHeader', 'getAllResponseHeaders'], dead = 'blob:' + S.origin + '/0'
  const go = (x, u, r) => { x.addEventListener('readystatechange', e => e.stopImmediatePropagation(), { capture: true, once: true }); xo.call(x, 'GET', u)   // this second open() is not the app's
    r && P.forEach((k, i) => Object.defineProperty(x, k, { configurable: true, get: [() => r.status, () => r.statusText, () => (r.url || x.__sim.url).split('#')[0], () => n => r.headers.get(n), () => () => [...r.headers].map(([k, v]) => k + ': ' + v + '\r\n').join('')][i] })); xs.call(x) }
  XP.open = function (m, u, ...a) { P.forEach(k => delete this[k]); this.__sim = { m: String(m), url: abs(S, u), h: [], a }; return xo.call(this, m, this.__sim.url, ...a) }
  XP.setRequestHeader = function (k, v) { this.__sim?.h.push([k, v]); return xh.apply(this, arguments) }
  XP.abort = function () { const s = this.__sim; s?.wait && (s.wait = 0, go(this, dead)); return xa.apply(this, arguments) }   // aborting while the route answers: native abort events
  return function (body) { const x = this, s = x.__sim; if (!s) return xs.apply(x, arguments)
    let q; try { q = new S.Request(s.url, { method: s.m, headers: s.h, body: /^(GET|HEAD)$/i.test(s.m) ? null : body }) } catch { return xs.apply(x, arguments) }
    const d = decide(c, q.url, q.method); if (s.a.length && !s.a[0] && (d.route || d.offline)) throw new S.DOMException('sim: a synchronous XMLHttpRequest cannot be routed or offline', 'NetworkError')
    c.net.active++; x.addEventListener('loadend', () => c.net.active--, { once: true })   // every XHR counts for idle()
    if (!d.route && !d.offline) { d.proxy && (xo.call(x, s.m, d.proxy, ...s.a), s.h.forEach(h => xh.apply(x, h))); return xs.call(x, body) }
    s.wait = 1
    ;net(S, c, q).then(async r => { if (r.pass) return s.wait && (s.wait = 0, go(x, r.pass.url)); const u = URL.createObjectURL(await r.blob()); x.addEventListener('loadend', () => URL.revokeObjectURL(u), { once: true }); s.wait && s === x.__sim && (s.wait = 0, go(x, u, r)) }, () => s.wait && (s.wait = 0, go(x, dead))) }
}
// a fake WebSocket for routed or offline urls: the route's handler is the server, given a peer { url, protocols, send, close, fail, on }
// (return false to refuse). Events arrive as tasks, in order.
function wsOf(S, c, RW) {
  const mk = (url, pr, r) => { const L = {}, mc = new S.MessageChannel(), q = []; let st = 0, chain = S.Promise.resolve(); mc.port1.onmessage = () => q.shift()()
    const later = f => chain = chain.then(() => new S.Promise(r => { q.push(r); mc.port2.postMessage(0) })).then(f).catch(e => S.reportError(e))
    const sock = shell(S, { proto: RW.prototype, props: { url, protocol: '', extensions: '', bufferedAmount: 0, binaryType: 'blob' }, getters: { readyState: () => st }, events: ['open', 'message', 'error', 'close'],
      methods: { send(d) { if (!st) throw new S.DOMException("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.", 'InvalidStateError'); if (st === 1) { d = ArrayBuffer.isView(d) ? d.slice?.() ?? d : typeof d === 'object' && /Blob|ArrayBuffer/.test(d) ? d : String(d); later(() => toPeer('message', d)) } },
        close(code, reason) { if (code != null && code !== 1000 && !(code >= 3000 && code < 5000)) throw new S.DOMException('close code ' + code + ' is not 1000 or 3000-4999', 'InvalidAccessError'); if (st > 1) return; const was = st; st = 2; later(() => was ? shut(code ?? 1005, reason, true) : shut(1006, '', false)) } } })
    const toPage = async d => { if (st !== 1) return; if (ArrayBuffer.isView(d)) d = d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength); const t = Object.prototype.toString.call(d)
      if (/ArrayBuffer/.test(t) && sock.binaryType === 'blob') d = new S.Blob([d]); else if (/Blob/.test(t) && sock.binaryType === 'arraybuffer') d = await d.arrayBuffer()
      st === 1 && sock.fire('message', { data: d, origin: new S.URL(url).origin }, S.MessageEvent) }
    const toPeer = (t, a) => (L[t] || []).forEach(f => { try { f.call(peer, a) } catch (e) { S.reportError(e) } })
    const shut = (code, reason, clean) => { if (st === 3) return; st = 3; clean || sock.fire('error'); const d = { code, reason: reason || '', wasClean: !!clean }; sock.fire('close', d, S.CloseEvent); toPeer('close', d) }
    const peer = { url, protocols: pr, get readyState() { return st }, send: d => (later(() => toPage(d)), peer), close: (code, reason) => (later(() => shut(code ?? 1005, reason, true)), peer), fail: code => (later(() => shut(code || 1006, '', false)), peer), on: (t, f) => ((L[t] ||= []).push(f), peer) }
    S.addEventListener('pagehide', () => shut(1001, '', true))
    later(async () => { let ok = !!r; try { ok = r && await r.fn(url, peer) !== false } catch (e) { S.reportError(e); ok = false } r?.delay && await new S.Promise(z => S.setTimeout(z, r.delay))
      if (st) return; if (!ok) return shut(1006, '', false); st = 1; sock.protocol = pr[0] || ''; sock.fire('open'); toPeer('open') })
    return sock }
  const F = function WebSocket(u, p) { const url = abs(S, u, true), d = decide(c, url, 'GET', 1); return d.route || d.offline ? mk(url, [].concat(p ?? []), d.route) : new RW(url, ...(p === undefined ? [] : [p])) }
  F.prototype = RW.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); return F
}
// EventSource for routed or offline urls: a GET through this realm's fetch, parsed as the stream arrives; when it ends it reconnects
// after `retry` ms (sim clock) with Last-Event-ID; a non-200 / non event-stream reply or a 204 closes it
function sseOf(S, c, RE) {
  const F = function EventSource(u, init) { const url = abs(S, u), d = decide(c, url, 'GET'); if (!d.route && !d.offline) return new RE(url, init)
    let st = 0, last = '', wait = 3000; const ac = new S.AbortController(), es = shell(S, { proto: RE.prototype, props: { url, withCredentials: !!init?.withCredentials }, getters: { readyState: () => st }, events: ['open', 'message', 'error'], methods: { close() { st = 2; ac.abort() } } })
    const go = () => S.fetch(url, { headers: { accept: 'text/event-stream', ...last && { 'last-event-id': last } }, signal: ac.signal }).then(async r => {
      if (r.status !== 200 || !/^text\/event-stream/.test(r.headers.get('content-type'))) return st = 2, es.fire('error'); st = 1; es.fire('open')
      let buf = '', f = { data: '' }; const rd = r.body.pipeThrough(new S.TextDecoderStream()).getReader()
      for (let x; !(x = await rd.read()).done;) { const ls = (buf += x.value).split(/\r\n|\r|\n/); buf = ls.pop()
        for (const l of ls) { if (!l) { f.data && es.fire(f.event || 'message', { data: f.data.slice(0, -1), lastEventId: last, origin: new S.URL(url).origin }, S.MessageEvent); f = { data: '' }; continue }
          const i = l.indexOf(':'), k = i < 0 ? l : l.slice(0, i), v = i < 0 ? '' : l.slice(i + 1).replace(/^ /, ''); k === 'data' ? f.data += v + '\n' : k === 'event' ? f.event = v : k === 'id' ? v.includes('\0') || (last = v) : k === 'retry' && /^\d+$/.test(v) && (wait = +v) } }
      throw 0 }).catch(() => { if (st === 2) return; st = 0; es.fire('error'); S.setTimeout(() => st === 0 && go(), wait) })
    go(); return es }
  F.prototype = RE.prototype; Object.assign(F, { CONNECTING: 0, OPEN: 1, CLOSED: 2 }); return F
}
hook('net', S => S, 'fetch', 'value', (o, S, c) => fetchOf(S, c, o))
hook('net', S => S.XMLHttpRequest?.prototype, 'send', 'value', (o, S, c) => xhrOf(S, c, S.XMLHttpRequest.prototype))
hook('net', S => S, 'WebSocket', 'value', (o, S, c) => wsOf(S, c, o))
hook('net', S => S, 'EventSource', 'value', (o, S, c) => sseOf(S, c, o))
hook('net', S => S.navigator, 'sendBeacon', 'value', (o, S, c) => (u, data) => { const q = new S.Request(abs(S, u), { method: 'POST', body: data }), d = decide(c, q.url, 'POST'); if (!d.route && !d.offline) return o.call(S.navigator, d.proxy || q.url, data); d.route && answer(S, c, d.route, q).catch(() => {}); return true })
hook('net', S => S.navigator, 'onLine', 'accessor', (v, S, c, d) => ({ get() { return !get(c.L, 'net/offline') && d.get.call(this) } }))

// ---- realm: history, navigation, child frames, workers, popups, and the one page placer: every document comes from the host's place() ----
// history: entries live on the host node; push/replace use the real replaceState (location follows, joint history stays clean)
function vhistory(S, c, o) {
  const R = o.replaceState.bind(o), H = c.role === 'main' && c.host || {}, hs = H.hist ||= [], doc = H.gen = (H.gen | 0) + 1
  const e = () => ({ state: o.state, url: S.location.href, doc, src: H.cur }), set = (s, u, rep) => { R(s, '', u); rep ? hs[hs.i] = e() : hs.splice(++hs.i, hs.length, e()) }
  if (H.trav) H.trav = 0, hs[hs.i].doc = doc; else hs.i ??= -1, set(null)
  const go = d => { const t = hs[hs.i + (d | 0)]; if (!d) return void c.go(S.location.href); if (!t) return; const from = S.location.href; hs.i += d | 0
    if (t.doc !== doc) return void c.go(t.src || t.url, { traverse: 1 }); R(t.state, '', t.url); RT.st(() => { S.dispatchEvent(new S.PopStateEvent('popstate', { state: t.state })); from.split('#')[0] === t.url.split('#')[0] && from !== t.url && S.dispatchEvent(new S.HashChangeEvent('hashchange', { oldURL: from, newURL: t.url })) }) }
  return { scrollRestoration: 'auto', pushState: (s, t, u) => set(s, u), replaceState: (s, t, u) => set(s, u, 1), go, back: () => go(-1), forward: () => go(1), get length() { return hs.length }, get state() { return hs[hs.i].state }, log: () => ({ index: hs.i, entries: hs.slice() }) }
}
hook('realm/navigation', S => S, 'history', 'value', (o, S, c) => vhistory(S, c, o))   // eager: every document gets its entry
// navigation: the Navigation API catches links, forms, location changes, reloads; hash changes use the virtual history
function vnav(S, c) {
  const mode = get(c.L, 'realm/navigation'), N = S.navigation; if (mode === 'allow' || !N) return mode === 'allow' ? mode : 'n/a'
  N.addEventListener('navigate', e => { const d = e.destination, u = d?.url, from = S.location.href; if (e.downloadRequest || !e.cancelable || !/^https?:/.test(u)) return
    if (e.hashChange) { e.preventDefault(); S.history[e.navigationType === 'replace' ? 'replaceState' : 'pushState'](null, '', u); S.dispatchEvent(new S.HashChangeEvent('hashchange', { oldURL: from, newURL: u })); return S.document.getElementById(decodeURIComponent(new URL(u).hash.slice(1)))?.scrollIntoView() }
    if (d.sameDocument) return; e.preventDefault()
    if (e.navigationType === 'traverse') return
    c.go(u, e.formData ? { method: 'POST', body: e.formData } : {}) })
  // a <meta http-equiv=refresh> was renamed by the pipeline; honour it here, on the sim clock
  const refresh = () => { for (const m of S.document.querySelectorAll('meta[data-sim-http-equiv="refresh" i]')) { const r = /^\s*(\d+)?[;,\s]*(?:url\s*=\s*)?['"]?([^'"]*)/i.exec(m.content || ''); S.setTimeout(() => c.go(abs(S, r[2] || S.location.href)), (+r[1] || 0) * 1000) } }
  S.document.readyState === 'loading' ? S.document.addEventListener('DOMContentLoaded', refresh) : refresh()
  return mode
}
// child frames: a same-origin iframe (src or srcdoc) goes to the host's place() at once, which stops its own load first; others are left alone
const stop = el => { el.removeAttribute('src'); el.removeAttribute('srcdoc'); el.srcdoc = '' }   // a frame's own load ends at once
function vframes(S, c) {
  const mode = get(c.L, 'realm/frames'), D = S.document, seen = new WeakSet(); if (mode === 'allow') return mode
  const handle = el => { if (el.tagName !== 'IFRAME' || el.dataset.sim != null || seen.has(el)) return; const sd = el.getAttribute('srcdoc'), sr = el.getAttribute('src'), u = sr && abs(S, sr)
    if (sd === '' || sd == null && !u?.startsWith(c.origin + '/')) return; seen.add(el)
    mode === 'block' ? (c.emit('frameBlocked', { src: sd != null ? 'srcdoc' : sr }), stop(el)) : c.host.place(sd != null ? { html: sd, url: D.baseURI } : u, null, el).catch(x => c.emit('frameError', { src: sr, error: x.message })) }
  const scan = r => (r.querySelectorAll ? [...r.querySelectorAll('iframe')] : []).concat(r.tagName === 'IFRAME' ? [r] : []).forEach(handle)
  new S.MutationObserver(ms => ms.forEach(m => m.type === 'attributes' ? (seen.delete(m.target), handle(m.target)) : m.addedNodes.forEach(scan))).observe(D, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcdoc'] })
  D.addEventListener('load', e => { const el = e.target; let w; try { w = el.tagName === 'IFRAME' && el.dataset.sim == null && el.contentWindow; if (!w || w.__sim || !w.location.href.startsWith(c.origin + '/')) return } catch { return }   // a same-origin frame without the boot
    c.emit('isolationLost', { src: el.getAttribute('src') }); stop(el) }, true)
  scan(D); return mode
}
// page-made workers run the boot (role 'worker'); one blob per script url (a SharedWorker stays shared), the config in its hash
function workers(S, c, RW, shared) {
  const W = class extends RW { constructor(u, o) { const url = abs(S, u), mod = o?.type === 'module', B = (c.host || c).blobs ||= {}
    const b = B[url + mod] ||= (c.host?.blob || blob)(SRC + '(JSON.parse(decodeURIComponent(location.hash.slice(1))))\n' + (mod ? 'import(' : 'importScripts(') + JSON.stringify(url) + ')')
    if (shared) { o = typeof o === 'string' ? { name: o } : { ...o }; o.name = where(c, 'worker', o.name || '') + (o.name || '') }
    super(b + '#' + encodeURIComponent(JSON.stringify(c.cfg(url, 'worker', !shared))), o) } }
  Object.defineProperty(W, 'name', { value: RW.name }); return W
}
hook('realm/workers', S => S, 'Worker', 'value', (o, S, c) => workers(S, c, o))
hook('realm/workers', S => S, 'SharedWorker', 'value', (o, S, c) => workers(S, c, o, 1))
hook('realm/workers', S => S, 'importScripts', 'value', (o, S) => (...a) => o.apply(S, a.map(u => abs(S, u))))   // relative to the real script url
hook('realm/popups', S => S, 'open', 'value', (o, S, c) => (u, t) => { if (u && /^_(self|top|parent)$/i.test(t)) { c.go(abs(S, u)); return S } c.emit('popupBlocked', { url: String(u ?? '') }); return null })
// target=_blank links are popups too
const popupLinks = (S, c) => S.addEventListener('click', e => { const a = e.target?.closest?.('a[href],area[href]'); if (!a || e.button) return; const tg = (a.getAttribute('target') || '').toLowerCase(); if ((tg === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey) && get(c.L, 'realm/popups') === 'block') { e.preventDefault(); c.emit('popupBlocked', { url: a.href }) } }, true)
// the page placer (host side), every document: the sim's network -> page steps -> a fresh window -> the boot (and 'ready')
const sandboxOf = L => { const s = get(L, 'page/sandbox'); return s === 'auto' ? 'allow-scripts allow-same-origin allow-forms' + (get(L, 'realm/popups') === 'allow' ? ' allow-popups' : '') : s }
const wire = L => JSON.parse(JSON.stringify(L, (k, v) => v instanceof RegExp ? v.source : v))   // settings for realms (functions stay here)
const bootOf = (n, url, role) => SRC + '(' + JSON.stringify({ id: n.sid, L: wire(n.L), url, role, state: n.st.time, clock: n.L.slice(0, -1).some(t => t.time != null && t.time !== false) }).replace(/</g, '\\u003c') + ')'   // the clock goes on from its last state; from the start if a spec or tag sets time
const ready = (n, ms) => new Promise((res, rej) => { const s = sig(n, null, ms), off = on(n, 'state', (p, k) => k === n && p.status === 'ready' && (off(), res(true)))
  s.addEventListener('abort', () => { off(); n.ac.signal.aborted ? rej(n.ac.signal.reason) : res(false) }, { once: true }) })
function frameEl(n) {   // fresh globals: it replaces the old one
  const f = G.document.createElement('iframe'), sb = sandboxOf(n.L); f.id = n.id; f.dataset.sim = ''; sb && f.setAttribute('sandbox', sb); f.style.cssText = get(n.L, 'page/offscreen') + `;width:${n.wh[0]}px;height:${n.wh[1]}px;border:0`
  n.frame ? n.frame.replaceWith(f) : (G.document.body.append(f), own(n, () => n.frame.remove())); n.win = () => n.frame.contentWindow; return n.frame = f
}
async function blank(n) {
  n.pg?.abort(Error('page replaced')); n.pg = new AbortController()   // not the initial about:blank: it has no Navigation API
  let w = n.tab; if (n.rt !== 'tab') { const f = frameEl(n); await new Promise(r => { f.onload = r; f.src = 'about:blank' }); w = f.contentWindow }
  else { if (!w) { w = n.tab = G.open('', '_blank'); if (!w) throw Error('tab blocked by the browser'); own(n, () => w.close()); n.win = () => w } w.__old = 1; w.location.replace('about:blank'); await until(() => !w.__old, { timeout: 5000, every: 5 }) }
  return w
}
async function place(n, src, init, el) {   // el: a child iframe (role 'frame'); none, or the sim's own frame: the sim page
  const main = !el || el === n.frame, role = main ? 'main' : 'frame', nav = n.win ? n.st.navs + 1 : 0, up = p => main && put(n, p)
  const ld = !main && new Promise(r => { stop(el); el.addEventListener('load', r, { once: true }) })   // stopped before any await
  let url = src.html == null ? src : src.url, html = src.html; main && (n.trav = init?.traverse, n.cur = src)
  if (html == null) { const r = await loadUrl(url, n, init && { method: init.method, body: init.body }).catch(e => { up({ load: { url, error: e.message, kind: e.kind, errors: e.errors } }); throw e }); n.ac.signal.throwIfAborted(); html = r.html; url = r.url; up({ load: { ...r, html: undefined, bytes: html.length } }) }
  const ctx = { L: n.L, url, origin: G.location.origin, role, nav, boot: bootOf(n, url, role) }, out = page(html, ctx), p = main && ready(n, get(n.L, 'op/readyTimeout'))
  up({ status: 'loading', url, navs: nav, bridge: ctx.bridge, editErrors: ctx.errors }); await ld
  const w = main ? await blank(n) : el.contentWindow; w.__simH = n; write(w, out); if (!w.__sim) throw Error('boot failed (see errs)'); emit(n, 'load', { url, role })   // the boot runs inside write()
  main && n.frame && (n.frame.onload = () => { let ok; try { ok = n.frame.contentWindow.__sim } catch {} ok || (emit(n, 'isolationLost', { src: url }), get(n.L, 'realm/onLost') === 'kill' && kill(n, 'isolation lost')) })
  return p
}

// ---- ops: what a realm can be asked to do. One table serves direct calls (iframe, tab) and messages (worker sims) ----
const fire = (S, n, t, i) => { const C = /^key/.test(t) && S.KeyboardEvent || /^(click|dblclick|mouse|contextmenu)/.test(t) && S.MouseEvent || S.Event; n.dispatchEvent(new C(t, { bubbles: true, cancelable: true, ...i })) }
const setVal = (S, n, v, evs) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(n), 'value'); d?.set ? d.set.call(n, v) : n.value = v; evs.forEach(t => fire(S, n, t)) }   // the native setter: frameworks that track value see it
const DOM = {   // [needs a node]: act (result is !!node) or read (result is the value)
  click: (S, n) => n.click(), focus: (S, n) => n.focus?.(), blur: (S, n) => n.blur?.(), clear: (S, n) => setVal(S, n, '', ['input', 'change']),
  type: (S, n, a) => setVal(S, n, (a.clear === false ? n.value : '') + a.v, ['input', 'change']), select: (S, n, a) => 'value' in n && setVal(S, n, a.v, ['change']),
  press: (S, n, a) => ['keydown', 'keypress', 'keyup'].forEach(t => fire(S, n, t, { key: a.v, ...a.init })), submit: (S, n) => n.requestSubmit ? n.requestSubmit() : fire(S, n, 'submit'),
  scroll: (S, n, a) => n.scrollIntoView?.(a.v ?? true), dispatch: (S, n, a) => fire(S, n, a.v, a.init), remove: (S, n) => n.remove()
}
const READ = { value: n => 'value' in n ? n.value : null, checked: n => !!n.checked, text: n => n.textContent, html: n => n.innerHTML, attr: (n, a) => n.getAttribute(a.v), visible: n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 } }
function dom(S, a) {
  const D = S.document; if (!D) throw Error('no DOM in this realm')
  if (a.op === 'count') return D.querySelectorAll(a.sel).length; if (a.op === 'append') return (D.body.insertAdjacentHTML('beforeend', a.v ?? a.html), true)
  const n = a.sel == null ? D.documentElement : D.querySelector(a.sel)
  if (Object.hasOwn(DOM, a.op)) return n ? (DOM[a.op](S, n, a), true) : false; if (Object.hasOwn(READ, a.op)) return n ? READ[a.op](n, a) : a.op === 'visible' ? false : null
  throw Error('unknown dom op: ' + a.op)
}
const TIME = ['speed', 'pause', 'resume', 'advance', 'set', 'shift', 'now', 'perf', 'pending', 'state']
const OPS = {
  eval: (a, S) => (0, S.eval)(String(a.code)), app: (a, S) => S.__app?.run ? S.__app.run(a.code) : Promise.reject(Error('no bridge (see report().bridge)')), dom: (a, S) => dom(S, a), state: (a, S, c) => c.state(),
  // reads (and speed() with no value) never install the clock; the first change does (advance -> paused)
  time: (a, S, c) => { if (!TIME.includes(a.op)) throw Error('unknown time op: ' + a.op); const read = /^(state|now|perf|pending)$/.test(a.op) || a.op === 'speed' && a.ms == null, t = S.__simTime || (read ? null : c.clock(a.op === 'advance' ? { speed: 0 } : {}))
    return t ? t[a.op](a.ms, a) : a.op === 'now' ? S.Date.now() : a.op === 'perf' ? S.performance.now() : a.op === 'pending' ? 0 : a.op === 'speed' ? 1 : null },
  set: (a, S, c) => { c.setL(a.L); c.tell({ L: a.L }); c.emit('config', a.L); return true }
}
// ---- messages: worker sims are driven over their port with { __sim, id, op, args } -> { __sim, id, ok, value | error } ----
const serve = (S, send) => m => S.__sim.call(m.op, m.args).then(value => ({ ok: 1, value }), e => ({ ok: 0, error: String(e?.message ?? e) })).then(r => { try { send({ __sim: 1, id: m.id, ...r }) } catch (e) { send({ __sim: 1, id: m.id, ok: 0, error: 'not cloneable: ' + e.message }) } })
// host side: one call path for every op: timeout, retry, abort (the sim's life or the caller's signal), 'op' event
function call(n, op, args = {}, o = {}) {
  const T = o.timeout ?? get(n.L, 'op/timeout'), t0 = Date.now(), fin = (ok, x) => (o.quiet || emit(n, 'op', { op, args, ok, ms: Date.now() - t0, ...x }), { ok, ...x })
  const go = k => Promise.resolve().then(() => { const s = sig(n, { signal: AbortSignal.any([o.signal, n.pg?.signal].filter(Boolean)) }, T); s.throwIfAborted(); return within(n.call(op, args, s), s, op) }).catch(e => k > 0 && !/^timeout/.test(e.message) && !n.ac.signal.aborted && !o.signal?.aborted ? go(k - 1) : Promise.reject(e))   // a timed-out try may still run: no retry
  return n.call ? go(o.retry ?? get(n.L, 'op/retry')).then(value => fin(1, { value }), e => fin(0, { error: String(e?.message ?? e) })) : Promise.resolve(fin(0, { error: 'page not booted' }))
}

// ---- realm boot: one source in every page, frame and worker of a sim; cfg = { id, L, url, role, clock, state }; channel '~sim~<id>' ----
const BC0 = G.BroadcastChannel
function realm(S, cfg) {
  if (S.__sim) return S.__sim
  if (cfg.url && S.document) try { S.history.replaceState(null, '', cfg.url) } catch {}   // first: the real url
  const isW = !S.document, host = S.__simH || null, role = cfg.role, ch = new BC0('~sim~' + cfg.id)
  const send = d => host ? host.got(d) : ch.postMessage(d)
  const c = { id: cfg.id, L: cfg.L, host, role, ch, mem: host?.mem || root.mem, net: host?.net || { active: 0 }, origin: S.origin,
    emit: (t, data) => send({ ev: t, data }), put: data => role === 'main' && send({ ev: 'state', data }), log: (k, s) => send({ ev: 'log', k, s }),
    setL: L => { const was = get(c.L, 'net/offline'); c.L = L; was !== get(L, 'net/offline') && S.dispatchEvent(new S.Event(was ? 'online' : 'offline')) },
    cfg: (url, role, t = 1) => ({ id: c.id, L: c.L, url, role, state: t && S.__simTime?.state() }),
    go: (u, i) => get(c.L, 'realm/navigation') === 'block' ? c.emit('navigationBlocked', { url: u }) : host.place(u, i, S.frameElement).catch(e => c.emit('navigateError', { url: u, error: e.message })),   // every navigation
    clock: o => { const t = clock(S, { speed: get(c.L, 'time/speed') || 0, start: get(c.L, 'time/start') || null, offset: get(c.L, 'time/offset'), media: get(c.L, 'time/media'), ...o })
      if (role === 'main') (t.onchange = s => { c.put({ time: s }); c.tell({ time: s }) })(t.state()); return t },
    tell: d => { ch.postMessage(d); (function each(W) { for (let i = 0; i < W.frames?.length; i++) { const w = W.frames[i]; try { w.__sim?.c.id === c.id && w.__sim.c.got(d) } catch {} each(w) } })(S) },
    got: d => { d.L && c.setL(d.L); d.time && (S.__simTime ? S.__simTime.follow(d.time) : c.clock({ state: d.time })) },
    state: () => ({ url: S.location.href, role, net: c.net.active, bridge: host?.st.bridge ?? null, time: S.__simTime?.state() || null }) }
  ch.onmessage = e => { const d = e.data; role === 'main' ? d.ask && ch.postMessage({ L: c.L, time: S.__simTime?.state() }) : c.got(d) }
  role === 'main' || ch.postMessage({ ask: 1 })   // a late follower catches up
  isW && cfg.url && Object.defineProperty(S, 'location', { value: new URL(cfg.url) })   // not the blob url
  capture(S, c)
  if (cfg.state || cfg.clock) c.clock(cfg.state ? { state: cfg.state } : {})
  const api = S.__sim = { c, hooks: install(S, c, hooks.concat(host?.hooks || [])), call: async (op, a) => { if (!Object.hasOwn(OPS, op)) throw Error('unknown op: ' + op); return OPS[op](a || {}, S, c) } }
  if (!isW) { api.nav = vnav(S, c); api.frames = vframes(S, c); popupLinks(S, c); S.addEventListener('pagehide', () => ch.close()); let ld; S.addEventListener('load', e => ld = e)   // a written document gets no load event: we fire it
    S.document.addEventListener('readystatechange', () => S.document.readyState === 'complete' && RT.st(() => { ld || S.dispatchEvent(new S.Event('load')); c.put({ status: 'ready', url: S.location.href }) })) }
  else if (role === 'main') { const h = serve(S, m => S.postMessage(m)); S.addEventListener('message', e => e.data?.__sim && (e.stopImmediatePropagation(), h(e.data))); c.put({ status: 'ready' }) }   // a worker sim
  return api
}
let SRC = ''   // '(' + SIMF.toString() + ')'

// ---- make: a sim = a node here + a realm there. runtime: 'iframe' (default) | 'tab' | 'worker' | 'src' (a plain frame, nothing injected) ----
const hostReg = () => (G.__simHost ||= {})
const blob = s => URL.createObjectURL(new Blob([s], { type: 'text/javascript' }))
const relayer = n => { n.L = layers(n.own, n.tags) }
const KEYS = ['html', 'url', 'src', 'base', 'code', 'id', 'tags', 'replace', 'runtime', 'width', 'height', 'readyFor', 'setup'], settingsOf = s => Object.fromEntries(Object.entries(s).filter(([k]) => !KEYS.includes(k)))
// the one input gate: a url, html, a function returning a spec, or an object; edit / prepend / append are aliases of page/*
function norm(s) {
  if (typeof s === 'function') return norm(s()); s = typeof s === 'string' ? (/^\s*</.test(s) ? { html: s } : { url: s }) : isO(s) ? { ...s } : null
  if (!s) throw TypeError('a spec is a url, html or object')
  for (const k of ['edit', 'prepend', 'append']) if (k in s) { s['page/' + k] = k === 'edit' ? s[k] : [].concat(s[k]); delete s[k] }
  s.id = s.id == null || s.id === '' ? null : String(s.id); s.tags = [].concat(s.tags ?? []).map(String); JSON.stringify(settingsOf(s))   // circular -> throws
  return s
}
async function makeSim(spec, here) {
  spec = norm(spec); here.ac.signal.throwIfAborted(); const PL = here === root ? cfg?.L : here.L; if (PL && !get(PL, 'nest')) throw Error('nested sims are off (nest: false)')
  const reg = hostReg(); if (spec.id && reg[spec.id]) { if (spec.replace) kill(reg[spec.id], 'replaced'); else throw Error('id in use: ' + spec.id) }
  const n = node('sim', here, spec.id || uid('sim')), rt = n.rt = spec.runtime || (spec.src ? 'src' : 'iframe'), bad = Object.keys(spec).filter(k => !KEYS.includes(k) && !Object.hasOwn(defaults, k.split('/')[0]))
  n.tags = spec.tags; n.own = tree(settingsOf(spec), n.tags[0] || 'own'); relayer(n); Object.assign(n, { routes: [], hooks: [...extraHooks], mem: root.mem, net: { active: 0 }, blob, wh: [spec.width || 1024, spec.height || 768] })
  Object.assign(n, { host: n, page: 1, origin: G.location.origin, emit: (t, d) => emit(n, t, d), place: (u, i, el) => place(n, u, i, el) }); n.F = fetchOf(G, n, G.fetch)   // the node is its own net ctx
  Object.assign(n.st, { runtime: rt, logs: [], errs: [], navs: 0, load: null, bridge: null, editErrors: [], specErrors: bad }); bad.length && console.warn('sim: unknown spec keys (ignored): ' + bad); reg[n.id] = n; own(n, () => delete reg[n.id])
  n.got = d => d.ev === 'log' ? push(n, d.k, d.s) : d.ev === 'state' ? put(n, structuredClone(d.data)) : d.ev && emit(n, d.ev, d.data)   // realm reports; state cloned (no page pinned)
  n.sid = spec.id && !get(n.L, 'keep') ? spec.id + '_' + HID : n.id   // + host part, unless kept
  n.bc = new BC0('~sim~' + n.sid); n.bc.onmessage = e => n.got(e.data); own(n, () => n.bc.close())
  G.navigator.locks?.request('~simlive~' + n.sid, () => new Promise(r => own(n, r))).catch(() => {})   // liveness for sweep
  own(n, () => get(n.L, 'keep') ? null : drop(k => k.startsWith(pre('s', n.sid))).then(d => put(n, { dropped: d })))
  const T = get(n.L, 'op/readyTimeout'), api = n.api = simApi(n), url = spec.url && abs(G, spec.url)
  try {
    if (spec.setup) { await spec.setup(api); n.ac.signal.throwIfAborted() }
    let ok; if (rt === 'worker') {
      const w = new G.Worker(blob(bootOf(n, url, 'main') + (spec.code ? '\n' + spec.code : '') + (url ? '\nimportScripts(' + JSON.stringify(url) + ')' : ''))), P = new Map()
      w.onmessage = e => { const m = e.data, p = m?.__sim && P.get(m.id); p && (P.delete(m.id), m.ok ? p[0](m.value) : p[1](Error(m.error))) }
      w.onerror = e => n.st.status === 'ready' || kill(n, 'failed: ' + e.message); own(n, () => w.terminate())
      n.call = (op, a, s) => new Promise((res, rej) => { const id = uid('m'); P.set(id, [res, rej]); s.addEventListener('abort', () => P.delete(id)); w.postMessage({ __sim: 1, id, op, args: a }) })
      put(n, { status: 'loading' }); ok = await ready(n, T)
    } else if (rt === 'src') { const f = frameEl(n); ok = await new Promise(r => { f.onload = () => r(true); f.src = abs(G, spec.src); RT.st(() => r(false), T) }) }
    else { n.call = (op, a) => { const w = n.win(); if (!w || w.closed || !n.tab && !n.frame.isConnected) { kill(n, 'detached'); throw Error('dead') } let s; try { s = w.__sim } catch {} if (!s) throw Error('page not booted'); return s.call(op, a) }
      ok = await place(n, spec.html != null ? { html: spec.html, url: spec.base ? abs(G, spec.base) : null } : url) }
    n.st.status === 'ready' || put(n, { status: ok ? 'ready' : 'timeout' })
    if (spec.readyFor != null) api.readyForOk = await api.wait(spec.readyFor, { timeout: T }); return api
  } catch (e) { kill(n, 'failed: ' + (e?.message ?? e)); throw Error(n.st.why, { cause: e }) }
}
// ---- the sim object. Host calls (route wait idle logs on el...) return plain values, throw TypeError on bad input; realm calls
// (eval app dom ops time.* set navigate do) return a promise of { ok: 1, value } | { ok: 0, error } ----
const DO = ['eval', 'app', 'navigate', 'offline']
function simApi(n) {
  const c = (op, a, o) => call(n, op, a, o), T = () => get(n.L, 'op/timeout'), q = { quiet: 1 }
  const expr = code => { try { Function('return (' + code + '\n)'); return '(' + code + '\n)' } catch { return '(function(){' + code + '\n})()' } }   // the host decides: expression or statements
  const domOp = (op, sel, v, o) => c('dom', { op, sel, ...v && typeof v === 'object' && !Array.isArray(v) ? v : { v } }, o)
  const api = { id: n.id, prefix: pre('s', n.sid), node: n, tags: n.tags,
    do: (a, o) => Array.isArray(a) ? a.reduce((p, x) => p.then(r => api.do(x, o).then(y => [...r, y])), Promise.resolve([])).then(v => ({ ok: v.every(r => r.ok) ? 1 : 0, value: v }))
      : Promise.resolve().then(() => { if (typeof a === 'function') return Promise.resolve(a(api)).then(value => ({ ok: 1, value })); const k = Object.keys(a || {})[0], v = a?.[k]
        return a.op != null ? c(a.op, a.args || {}, o) : k === 'waitFor' ? api.wait(v, o).then(x => x ? { ok: 1, value: x } : { ok: 0, error: 'timeout: waitFor', value: x }) : k === 'advance' || k === 'speed' ? api.time[k](v, o)
          : DO.includes(k) ? api[k](v) : Object.hasOwn(DOM, k) || Object.hasOwn(READ, k) || k === 'count' ? domOp(k, ...[].concat(v), o) : { ok: 0, error: 'unknown action: ' + k } }).catch(e => ({ ok: 0, error: String(e?.message ?? e) })),
    eval: (code, o) => c('eval', { code }, o), app: (code, o) => c('app', { code: expr(code) }, o), dom: (op, sel, a, o) => c('dom', { op, sel, ...a }, o),
    navigate: (url, init) => url == null || !/^(iframe|tab)$/.test(n.rt) ? Promise.resolve({ ok: 0, error: url == null ? 'navigate(url)' : 'no page to navigate' }) : place(n, new URL(url, n.st.url || G.location.href).href, init).then(ok => ok ? { ok: 1, value: n.st.url } : { ok: 0, error: 'timeout: navigate' }, e => ({ ok: 0, error: String(e?.message ?? e) })),
    state: o => c('state', {}, o), report: () => { const t = n.st.time; let hooks; try { hooks = n.win?.().__sim?.hooks } catch {} return { ...n.st, logs: n.st.logs.length, errs: n.st.errs.length, time: t && { ...t, time: t.m + (RT.now() - t.r) * t.speed + t.off }, hooks } },
    logs: () => n.st.logs.slice(), errs: () => n.st.errs.slice(), clearLogs: () => void Object.assign(n.st, { logs: [], errs: [] }),
    route: (p, fn, o) => { const r = routeRow(p, fn, o); n.routes.push(r); return r.id }, unroute: id => { n.routes = id == null ? [] : n.routes.filter(r => r.id !== id) },
    time: Object.fromEntries(TIME.map(op => [op, (ms, o) => c('time', { op, ms, async: o?.async }, o)])),
    set: (t, o) => { if (!isO(t)) return Promise.resolve({ ok: 0, error: 'set(settings object)' }); n.own = mix(n.own, tree(t, n.tags[0] || 'own')); relayer(n); return c('set', { L: wire(n.L) }, o) }, offline: v => api.set({ net: { offline: !!v } }), hook: (...r) => n.hooks.push(rowOk(r)),
    wait: (cond, o = {}) => { const f = typeof cond === 'function' ? () => cond(api) : typeof cond === 'string' ? () => c('eval', { code: '!!(' + cond + ')' }, q).then(r => r.value) : cond?.app != null ? () => c('app', { code: '!!(' + cond.app + ')' }, q).then(r => r.value) : cond?.state != null ? () => String(cond.state).split('.').reduce((x, k) => x?.[k], n.st) === cond.is : null
      if (!f) throw TypeError("wait(cond): 'expr' | { app } | { state, is } | fn"); return until(f, { timeout: o.timeout ?? T(), every: o.every, signal: sig(n, o) }) },
    idle: (o = {}) => { let t = RT.now(); return until(() => n.net.active ? (t = RT.now(), false) : RT.now() - t >= (o.quiet ?? 200), { timeout: o.timeout ?? T(), every: 50, signal: sig(n, o) }) },
    abort: () => { const a = n.ac; n.ac = new AbortController(); a.abort(Error('aborted')); return { ok: 1 } },   // ends ops and waits, keeps the sim
    on: (t, f) => on(n, t, f), win: () => n.win?.(), doc: () => { try { return n.win?.().document } catch { return null } }, el: s => api.doc()?.querySelector(s) ?? null, all: s => [...api.doc()?.querySelectorAll(s) || []],
    make: spec => makeSim(spec, n), kill: why => (kill(n, why), n.done) }   // kill resolves after the cleanup
  for (const op of [...Object.keys(DOM), ...Object.keys(READ), 'count']) op in api || (api[op] = (sel, v, o) => domOp(op, sel, v, o))   // s.click(sel) s.type(sel, text) s.text(sel) ...
  return api
}
// ---- SIM: the host API ----
const VERSION = '6.4.1'
const sel = (x, from = root) => x === undefined ? [] : x === null ? [...from.kids.values()] : x?.node ? [x.node] : x?.st ? [x] : Array.isArray(x) ? x.flatMap(y => sel(y, from)) : all(from).filter(k => x instanceof RegExp ? re(x).test(k.id) : typeof x === 'function' ? x(k.api || k) : k.id === x)
async function sweep(o = {}) {   // gone sims' names: ours by the tree, other tabs' by their locks
  const held = ((await G.navigator.locks?.query())?.held || []).map(l => l.name), found = new Set()
  await drop(k => { const m = /^~s([^~]*)~/.exec(k), ok = m && (o.all || /_[0-9a-z]{5,}$/.test(m[1])) && !all(root).some(k => k.sid === m[1]) && (m[1].includes('_' + HID) || !held.includes('~simlive~' + m[1])); ok && found.add(m[0]); return ok && !o.dryRun }); return [...found]
}
const SIM = { VERSION, defaults, tags, tag, hook: (...r) => extraHooks.push(rowOk(r)), root,
  make: spec => makeSim(spec, root), get: id => find(root, id)?.api ?? null, ids: () => [...root.kids.keys()], all: () => all(root).map(k => k.api).filter(Boolean),
  kill: (x, why) => sel(x).filter(k => kill(k, why)).length, purge: () => { const ks = sel(null).filter(k => kill(k, 'purge')); return Promise.all(ks.map(k => k.done)).then(() => ks.length) }, on: (t, f) => on(root, t, f),
  drop: g => drop(k => k.startsWith(pre('g', g))), sweep, report: () => all(root).map(k => k.api?.report() || k.st), stats: () => ({ version: VERSION, sims: root.kids.size, nodes: all(root).length, hooks: hooks.length + extraHooks.length, tags: Object.keys(tags) }),
  util: { json: (o, status = 200) => ({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) }), text: (t, status = 200) => ({ status, headers: { 'content-type': 'text/plain;charset=UTF-8' }, body: String(t) }),
    sse: f => ({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: f.map(x => typeof x === 'string' && /^(data|event|id|retry):/.test(x) ? x.replace(/\n*$/, '\n\n') : 'data: ' + (typeof x === 'string' ? x : JSON.stringify(x)).split('\n').join('\ndata: ') + '\n\n').join('') }), sleep: ms => new Promise(r => RT.st(r, ms)), until, get }
}
SIM.readme = [
  "SIM v6.4.1 - hand-over notes. SIM.help('topic' | number) prints one section.",
  "",
  "0. WHAT: load your app page into a box: run code in it (global scope, or inside the app's main IIFE), drive it, fake its",
  " world (network, time, storage), edit it before it runs, watch it, run many, kill cleanly. One sloppy-JS factory runs in",
  " the host and in every realm of a sim (page, child frames, workers). Same-origin isolation by naming, not a security",
  " boundary. Niche cases: add a hook (10) or edit the file.",
  "",
  "1. EXAMPLE",
  " const s = await SIM.make({ url: 'app.html', tags: ['t1'], time: { speed: 0 },",
  "   prepend: 'localStorage.setItem(\"key\", \"x\")',                          // seed storage",
  "   setup: s => s.route('/api/', (url, q) => SIM.util.json({ reply: 'hi' })) })   // routes before boot",
  " await s.type('#in', 'hello'); await s.click('#send'); await s.idle()   // its requests answered",
  " await s.time.advance(5000)                       // timers due in 5 s fire now",
  " const ok = await s.wait('document.querySelector(\".reply\")', { timeout: 3000 })   // true | false",
  " const r = await s.app('typeof someClosureVar')   // { ok: 1, value } | { ok: 0, error }",
  " console.log(ok, r.value, s.report().status, s.logs(), s.errs()); await s.kill()   // kill drops its storage",
  "",
  "2. RETURNS. Realm calls (eval app dom ops text value... time.* set offline navigate state do) -> a promise of { ok: 1,",
  " value } | { ok: 0, error }; they never reject; most take { timeout, retry, signal } last (op/timeout, op/retry).",
  " navigate(url, { method, body }) waits for 'ready'. do(list) -> { ok (all ok), value: [results] }; a dom op on a missing",
  " element -> ok with false | null. Host calls return plain values and throw TypeError on bad input (set returns { ok: 0,",
  " error }): route -> id, wait/idle -> boolean, logs/errs -> arrays, report -> object, on -> unsubscribe fn, kill ->",
  " promise (cleanup done), SIM.kill -> count, SIM.purge -> promise of count. make rejects on a bad spec, a failed load or",
  " boot, or kill during load; a slow page gives status 'timeout'.",
  "",
  "3. SETTINGS: JSON trees in layers: spec > its tags (later tag wins) > SIM.defaults. get('a/b/c') is depth first: the",
  " deepest declared value in any layer wins (a tag's share/local/x beats the spec's share), then layer order. A node is a",
  " value or a plain object whose `self` is its value; keys exact | '*' | '~regex'; 'a/b': v is a shortcut. Arrays are",
  " values (net/proxy is a url or a list). SIM.tag(name, tree | null), s.set(tree) live: frames get it at once, workers",
  " soon. Spec keys (not settings): url html base src code id tags replace runtime width height readyFor setup; edit",
  " prepend append are aliases of page/*. Unknown keys go to report().specErrors.",
  "",
  "4. STORAGE: a name resolves share/<kind>/<name> -> 'own' (s.prefix + name: ~s<id>~; explicit ids add a per-host part) |",
  " 'real' | '<group>' (~g<group>~name; 'group' = the tag's name). Kinds local session cookie idb cache lock channel worker",
  " opfs. store/<kind> for local session cookie: 'memory' (default: a Map on the host page under the prefixed names; groups",
  " share it and get storage events; no leftovers or cross-tab sharing; no cookie reaches the server; lost on host reload)",
  " | 'real' (prefixed in the browser store: shared across tabs, the server sees ~s..~ cookies; keep: true with an explicit",
  " id survives a reload: that id then names the data in every tab). 'real' share names use the real store. idb, caches,",
  " opfs, locks, BroadcastChannel, SharedWorker are always prefixed real. kill drops the prefix (memory and real);",
  " SIM.drop(group); SIM.sweep({ dryRun, all }) drops prefixes of gone sims (kept explicit ids only with all).",
  "",
  "5. NETWORK: fetch, XHR, sendBeacon, EventSource and WebSocket go Request -> offline | route | proxy | pass.",
  " s.route(pattern, (url, q) => reply, { method, times, delay, kind: 'ws' }); pattern substring | RegExp | fn | null; q =",
  " { url, method, headers, body (text), req (the Request) }; reply string | { status, statusText, headers, body (object =",
  " JSON), delay } | Response | promise. A throw -> 500 + 'routeError' event. EventSource = an http route answering 'data:",
  " ...\\n\\n' frames (reconnects when the reply ends). ws route: (url, peer) => peer.send close fail",
  " on('open'|'message'|'close'); false refuses. Routed XHR is the native object fed the route's Response (a sync one",
  " throws). Parent sims' routes apply; workers get offline and net/unrouted only. net/unrouted 'block' = unrouted requests",
  " fail (page loads exempt). Page loads: routes, then the net/proxy race (a url or list; net/proxyStagger, proxyMode",
  " 'always'). report().load = { via, proxy, errors, kind: http | offline | timeout | cors | unreachable }; offline at make",
  " fails the load.",
  "",
  "6. TIME: each realm has a clock; the sim page owns it, frames and workers follow. time: { speed (0 = paused), start,",
  " offset, media }; time: false = none until asked. s.time.speed(x) pause() resume() set(date) shift(ms) now() state();",
  " reads never install it, the first change does (advance installs it paused). advance(ms) runs every due timer at its",
  " exact time, synchronously; advance(ms, { async: true }) yields a task after each so await code moves on (use it when",
  " the app awaits sleeps). Media/animations follow.",
  "",
  "7. PAGE: placed by the host into a fresh window with its real url (location, cookies, routers work): fetched through the",
  " sim network, then steps edit ([find, replace] | fn(html, info) | list), fixes (CSP and meta refresh off), bridge",
  " (window.__app.run at the first IIFE of an inline script), base (proxied pages), tail (append), head (boot + prepend).",
  " Every navigation runs the same steps; child frames get fixes and boot. report().bridge ok | missing | off; editErrors.",
  "",
  "8. REALM: realm/navigation 'virtual' (Navigation API: links, forms, location, reload, meta refresh are placed by the",
  " host; history is virtual and the host's history is untouched) | 'block' | 'allow'. realm/frames 'boot' | 'block' |",
  " 'allow'; realm/workers; realm/popups 'block'; serviceWorker, storageBuckets, cookieStore are absent unless 'allow'.",
  " realm/onLost 'kill' when the page loses its boot. Runtimes: iframe (default; win doc el all), tab, worker ({ code, url",
  " }; no DOM; self.location = url), src ({ src }: plain frame). Nested: s.make(spec) (nest: false off). A SharedWorker is",
  " shared in a sim, not between sims. Known issues: xhr.timeout on routed requests, default statusText, navigate()",
  " timeout, cookies with a path, module workers' first messages, target=_blank forms / <base target> in tab sims,",
  " script-made about:blank frames, no fallback without the Navigation API.",
  "",
  "9. WATCH: s.report() (host state: status url navs load bridge time, logs/errs counts, hooks dropped); s.state() asks the",
  " realm. logs()/errs() keep console and errors of all realms across navigations (log: max keepHead clip); clearLogs().",
  " Events bubble (s.on / SIM.on(type, fn(data, node))): state op config kill load routeError navigateError isolationLost",
  " frameError frameBlocked navigationBlocked popupBlocked. wait(cond: 'expr' | { app } | { state, is } | fn), idle({ quiet",
  " }) and polls use real time even when paused. s.abort() ends running ops and waits; an op into a replaced page ends with",
  " 'page replaced'. Recipes: record = wrap s.do, replay = s.do(list); metrics = SIM.on('op'); ttl = setTimeout(() =>",
  " s.kill(), ms); page -> host = window.__sim.c.emit(type, d) + s.on(type).",
  "",
  "10. EXTEND: SIM.hook(setting, S => target, key, how, make) (value | get | accessor | absent; missing targets skip;",
  " s.hook for one sim; a gate setting of false | 'off' | 'allow' skips the row). Tables: STEPS OPS DOM READ hooks. SIM._",
  " holds the mechanisms."
].join('\n')
SIM.help = t => { let x = SIM.readme; if (t != null) { const q = String(t).toLowerCase(), ps = x.split(/\n(?=\d+\. )/), h = ps.filter(s => /^\d+$/.test(q) ? s.startsWith(q + '.') : s.split('\n')[0].toLowerCase().includes(q)); x = (h.length ? h : ps.filter(s => s.toLowerCase().includes(q))).join('\n') || 'no section matches: ' + t } try { console.log(x) } catch {} return x }
// ---- boot: the same source runs here and in every realm; cfg = a realm's config, or nothing for the page that loads SIM ----
SRC = '(' + SIMF.toString() + ')'
if (cfg?.id) realm(G, cfg)
else if (G.SIM?.VERSION === VERSION && G.SIM.src === SRC) return G.SIM; else try { G.SIM?.purge?.(); G.SIM && (G.SIM.make = () => Promise.reject(Error('replaced by a newer SIM'))) } catch {}
SIM._ = { tree, get, mix, re, layers, clock, node, own, on, emit, put, kill, find, all, sig, within, until, push, capture, str, page, STEPS, tagsOf, spliceHead, write, patch, hooks, install, shell, loadUrl, raceProxies, where, seen, kv, drop, routeRow, decide, toResp, answer, vhistory, vnav, vframes, workers, popupLinks, dom, DOM, READ, OPS, serve, call, realm, place, makeSim, simApi }
SIM.src = SRC; G.SIM = SIM; G.addEventListener?.('pagehide', () => SIM.purge())
if (typeof module !== 'undefined') module.exports = SIM
return SIM
})()
