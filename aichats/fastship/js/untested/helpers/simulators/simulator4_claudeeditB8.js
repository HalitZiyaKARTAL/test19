/* sim.js v6.3.1 (claudeeditB8) — a simulation builder for web pages, in one file. README: SIM.readme / SIM.help('topic'). Design: simulator4_B4_design.md */
var SIM = (function SIMF(cfg) {

// ---- settings: JSON trees in layers (sim, its tags, defaults); one resolver: niche ?? broad ?? … ?? magic ----
// a node is a value, or an object whose `self` is its own value; keys: exact | '*' | '~regex'; 'a/b': v is a path shortcut.
// Only plain objects are trees (a Map, RegExp, Date… is a value); a plain object where the defaults declare a leaf (net/proxy) is a value too
const isO = x => Object.prototype.toString.call(x) === '[object Object]'
const RX = new Map(), rx = k => RX.get(k) || (RX.set(k, new RegExp(k.slice(1))), RX.get(k))
// 'a/b/~re/x' -> ['a','b','~re/x']: a '~' segment takes the rest of the key (a regex may contain '/')
const seg = k => { const i = k[0] === '~' ? 0 : k.indexOf('/~'); return i < 0 ? k.split('/') : [...(i ? k.slice(0, i).split('/') : []), k.slice(i && i + 1)] }
// merge b into a: object+object merge by key, object+value sets self, value+object keeps the value as self
const mix = (a, b) => !isO(a) ? (isO(b) ? (a === undefined || 'self' in b ? b : { self: a, ...b }) : b) : !isO(b) ? (b === undefined ? a : (a.self = b, a)) : (Object.keys(b).forEach(k => a[k] = mix(a[k], b[k])), a)
// sh = the shape (defaults) that says which positions are leaves; g = what the value 'group' means here (a tag's name, or a sim's first tag)
function tree(t, sh, g) {
  if (!isO(t)) return t === 'group' && g ? g : t; const o = {}
  for (const k in t) { const p = seg(k), l = p.at(-1); let n = o, s = sh; p.slice(0, -1).forEach(x => { n = n[x] = isO(n[x]) ? n[x] : n[x] === undefined ? {} : { self: n[x] }; s = isO(s) ? s[x] : undefined })
    n[l] = isO(s) && l in s && !isO(s[l]) && isO(t[k]) ? { self: t[k] } : mix(n[l], tree(t[k], isO(s) ? s[l] : undefined, g)) }
  return o
}
const pick = (n, s) => { if (s in n) return n[s]; for (const k in n) if (k[0] === '~' && rx(k).test(s)) return n[k]; return n['*'] }
const walk = (n, p) => { for (const s of p) { if (!isO(n)) return; n = pick(n, s) } return n }
// the most specific declared value: deepest match first, and at each depth the first layer that declares it
function get(L, path, magic) {
  const p = Array.isArray(path) ? path : path.split('/')
  for (let d = p.length; d >= 0; d--) for (const t of L) { const n = walk(t, p.slice(0, d)), v = isO(n) ? n.self : n; if (v != null) return v }
  return magic
}
const defaults = tree({
  share: { self: 'own' },
  store: { self: 'real' }, keep: false,
  time: { speed: 1, media: true },
  net: { offline: false, proxy: null, proxyMode: 'fallback', proxyStagger: [200, 800, 1000], proxyRequests: 'auto', timeout: 15000 },
  page: { csp: 'strip', rocketLoader: 'undo', bridge: true, bridgeCode: null, bridgePatterns: ['\\(\\s*async\\s*\\(\\s*\\)\\s*=>\\s*\\{', '\\(\\s*function\\s*\\(\\s*\\)\\s*\\{', '\\(\\s*\\(\\s*\\)\\s*=>\\s*\\{'], sandbox: 'auto', offscreen: 'position:fixed;left:-12000px;top:0' },
  realm: { frames: 'boot', workers: 'boot', popups: 'block', serviceWorker: 'block', cookieStore: 'block', navigation: 'virtual' },
  log: { max: 2000, keepHead: 20, clip: 8000 },
  op: { timeout: 15000, retry: 0, readyTimeout: 20000 },
  nest: true
})
const tags = {}
const tag = (name, t) => { if (t === undefined) return tags[name]; tags[name] = t === null ? undefined : mix(tags[name] || {}, tree(t, defaults, name)); all(root).forEach(k => k.tags?.includes(name) && k.api?.set({})); return tags[name] }   // live sims with the tag follow
// a sim's layers: its own tree, then its tags (a later tag wins over an earlier one), then defaults
const layers = (own, tg = []) => [tree(own || {}, defaults, tg[0] || 'own'), ...[...tg].reverse().map(n => tags[n] || {}), defaults]

// ---- time: one engine per realm (self-contained: it runs in pages, frames and workers) ----
// monotonic clock (timers, performance.now, rAF, event.timeStamp) + wall clock (Date) = mono + off.
// mono = m0 + (real ms since r0) * speed; speed 0 = paused, then only advance() moves time. set/shift move Date only.
// c = { speed, start (date), offset (ms), state (resume from), media, raf, events, maxCatchUp }
function clock(S, c = {}) {
  if (S.__simTime) return S.__simTime
  const RD = S.Date, rNow = RD.now.bind(RD), PF = S.performance, rPerf = PF ? PF.now.bind(PF) : rNow, rST = S.setTimeout, rCT = S.clearTimeout, rCI = S.clearInterval, rRAF = S.requestAnimationFrame
  const toMs = x => Object.prototype.toString.call(x) === '[object Date]' ? x.getTime() : typeof x === 'string' && isNaN(x) ? RD.parse(x) : +x
  const s0 = c.state, T = new Map(), cap = c.maxCatchUp || 1000
  let speed = s0 ? s0.speed : c.speed ?? 1, r0 = rNow(), rp0 = rPerf(), m0 = s0 ? s0.m + (r0 - s0.r) * speed : r0
  let off = s0 ? s0.off : c.start != null ? toMs(c.start) - m0 : +c.offset || 0, last = speed || 1, seq = 1e9, wake = 0, busy = 0, touched = speed !== 1
  const mI = m0, p0 = rp0, mono = () => speed ? m0 + (rNow() - r0) * speed : m0, wall = () => mono() + off
  const rebase = () => { m0 = mono(); r0 = rNow(); rp0 = rPerf() }
  const vperf = t => p0 + (speed ? m0 + (t - rp0) * speed : m0) - mI // a real performance time -> virtual
  // timers: virtual ones; timers made before the engine stay real (clear* still reaches them)
  const run = t => { try { typeof t.fn === 'function' ? t.fn.apply(S, t.a) : (0, S.eval)(String(t.fn)) } catch (e) { rST.call(S, () => { throw e }) } }
  const add = rep => (fn, ms, ...a) => { const id = seq++, d = Math.max(0, +ms || 0); T.set(id, { at: mono() + d, fn, a, per: rep ? Math.max(1, d) : 0 }); plan(); return id }
  const clr = real => id => T.delete(id) ? plan() : id != null && real.call(S, id)
  const next = t => { let b; for (const e of T) if (e[1].at <= t && (!b || e[1].at < b[1].at)) b = e; return b }
  // fire all timers due by t, in time order; a paused clock steps to each one (Date is exact inside it);
  // an interval more than maxCatchUp runs behind is moved past t, so a huge speed cannot freeze the page
  function due(t) {
    busy = 1; const n = new Map()
    try { for (let g = 0, b; g < 1e6 && (b = next(t)); g++) { const [id, x] = b; if (!speed && x.at > m0) m0 = x.at; if (x.per) { x.at += x.per; const k = (n.get(id) || 0) + 1; n.set(id, k); if (k >= cap && x.at <= t) x.at = t + x.per } else T.delete(id); run(x) } } finally { busy = 0 }
    if (!speed && t > m0) m0 = t
  }
  function plan() { if (busy) return; wake && rCT.call(S, wake); wake = 0; if (!speed || !T.size) return; let at = Infinity; for (const x of T.values()) at = Math.min(at, x.at); wake = rST.call(S, () => { wake = 0; due(mono()); plan() }, Math.min(2 ** 31 - 1, Math.max(0, (at - mono()) / speed))) }
  Object.assign(S, { setTimeout: add(0), setInterval: add(1), clearTimeout: clr(rCT), clearInterval: clr(rCI) })
  const vNow = () => Math.floor(wall())
  S.Date = new Proxy(RD, { apply: () => new RD(wall()).toString(), construct: (t, a, nt) => Reflect.construct(t, a.length ? a : [wall()], nt), get: (t, k) => k === 'now' ? vNow : t[k] })
  try { Object.defineProperty(RD.prototype, 'constructor', { value: S.Date, configurable: true, writable: true }) } catch {}
  try { PF.now = () => vperf(rPerf()) } catch {}
  if (rRAF && c.raf !== false) S.requestAnimationFrame = f => rRAF.call(S, t => f(vperf(t)))
  const ed = c.events !== false && S.Event && Object.getOwnPropertyDescriptor(S.Event.prototype, 'timeStamp')
  if (ed && ed.get) try { Object.defineProperty(S.Event.prototype, 'timeStamp', { configurable: true, get() { return vperf(ed.get.call(this)) } }) } catch {}
  // media follows the speed: <audio>/<video> (paused at 0), CSS / Web animations, Web Audio buffer sources
  const D = S.document, nodes = new Set()
  const rate = x => { try { if ('paused' in x) { if (!speed) { if (!x.paused) x.__simHeld = 1, x.pause() } else { if (x.__simHeld) x.__simHeld = 0, x.play()?.catch?.(() => {}); x.playbackRate = Math.min(16, Math.max(1 / 16, speed)) } } else x.playbackRate = speed } catch {} }   // <audio>/<video>, or an Animation
  const anim = l => l.forEach(rate), media = () => { if (c.media === false || !touched || !D) return; D.querySelectorAll('audio,video').forEach(rate); D.getAnimations && anim(D.getAnimations()); nodes.forEach(n => { try { n.playbackRate.value = n.__simBase * speed } catch { nodes.delete(n) } }) }
  if (c.media !== false && D) {
    S.addEventListener('play', e => touched && 'playbackRate' in e.target && rate(e.target), true)
    for (const t of ['animationstart', 'transitionrun']) S.addEventListener(t, e => touched && e.target.getAnimations && anim(e.target.getAnimations()), true)
    const EP = S.Element && S.Element.prototype, ea = EP && EP.animate; if (ea) EP.animate = function () { const a = ea.apply(this, arguments); touched && anim([a]); return a } // script animations fire no event
    const AB = S.AudioBufferSourceNode && S.AudioBufferSourceNode.prototype, st = AB && AB.start
    if (st) AB.start = function () { this.__simBase = this.playbackRate.value; touched && (this.playbackRate.value *= speed); nodes.add(this); this.addEventListener('ended', () => nodes.delete(this)); return st.apply(this, arguments) }
  }
  const state = () => ({ m: mono(), r: rNow(), speed, off, time: wall(), pending: T.size })
  const changed = () => { touched = touched || speed !== 1; media(); plan(); api.onchange && api.onchange(state()) }
  const api = S.__simTime = {
    now: wall, perf: () => vperf(rPerf()), state, pending: () => T.size,
    speed(x) { if (x == null) return speed; if (!(+x >= 0 && +x < Infinity)) throw Error('speed must be a finite number >= 0'); rebase(); speed = +x; if (speed) last = speed; changed(); return speed },
    pause: () => api.speed(0), resume: x => api.speed(x ?? last),
    advance(ms) { rebase(); const t = m0 + Math.max(0, +ms || 0); if (speed) m0 = t; due(t); changed(); return wall() },
    set(x) { const t = toMs(x); if (isNaN(t)) throw Error('bad time: ' + x); off = t - mono(); changed(); return wall() },
    shift(ms) { off += +ms || 0; changed(); return wall() },
    // follower (a frame or worker of a sim): copy the owner's state, firing what became due
    follow(s) { rebase(); const t = s.m + (rNow() - s.r) * s.speed; off = s.off; speed = s.speed; if (speed) { last = speed; r0 = rNow(); rp0 = rPerf(); m0 = t; due(t) } else { due(t); m0 = t } touched = touched || speed !== 1; media(); plan() }
  }
  return api
}

// ---- nodes: a tree (host > sims > frames / workers / nested sims); each has state, listeners and an undo list ----
let seq = 0
const uid = p => (p || 'n') + '_' + (++seq).toString(36)
function node(kind, parent, id = uid(kind)) {
  const n = { id, kind, parent, kids: new Map(), undo: [], subs: {}, ac: new AbortController(), st: { id, kind, status: 'new', t0: Date.now() } }
  parent && parent.kids.set(id, n)
  return n
}
const own = (n, f) => (n.undo.push(f), f)                                                    // remember how to undo something; kill runs these in reverse
const on = (n, type, fn) => ((n.subs[type] ||= new Set()).add(fn), () => n.subs[type].delete(fn))
const emit = (n, type, data) => { for (let x = n; x; x = x.parent) x.subs[type]?.forEach(f => { try { f(data, n) } catch {} }) }   // bubbles up the tree
const put = (n, patch) => (Object.assign(n.st, patch), emit(n, 'state', patch), n.st)         // state change + 'state' event
function kill(n, why = 'killed') {
  if (n.st.status === 'dead') return false
  const kids = [...n.kids.values()].reverse(); kids.forEach(k => kill(k, why))
  put(n, { status: 'dead', why }); n.ac.abort()
  const ps = []; for (const f of n.undo.splice(0).reverse()) try { const r = f(); r?.then && ps.push(r.catch(() => {})) } catch {}
  n.done = Promise.all([...ps, ...kids.map(k => k.done)]).then(() => true)
  n.parent?.kids.delete(n.id); emit(n, 'kill', why)
  return true
}
const find = (n, path) => { for (const s of String(path).split('/')) if (s && !(n = n.kids.get(s))) return; return n }   // 'sim_1/frame_2'
const all = n => [...n.kids.values()].flatMap(k => [k, ...all(k)])
const root = node('host', null, 'host')

// ---- waits: a promise with a timeout and an abort signal; a poller ----
const within = (p, ms, signal, name = 'op') => new Promise((res, rej) => {
  let t; const end = (f, v) => { clearTimeout(t); signal?.removeEventListener('abort', ab); f(v) }, ab = () => end(rej, Error('aborted'))
  if (signal?.aborted) return ab(); signal?.addEventListener('abort', ab)
  if (ms > 0) t = setTimeout(() => end(rej, Error('timeout: ' + name)), ms)
  Promise.resolve(p).then(v => end(res, v), e => end(rej, e))
})
// repeat check() until truthy -> true; false on timeout (0 = none) or abort; a throwing check counts as "not yet"
const until = (check, { timeout = 15000, every = 100, signal } = {}) => new Promise(res => {
  const t0 = Date.now(); let t, done
  const stop = v => { if (done) return; done = 1; clearTimeout(t); signal?.removeEventListener('abort', ab); res(v) }, ab = () => stop(false)
  if (signal?.aborted) return ab(); signal?.addEventListener('abort', ab)
  ;(function tick() { if (done) return; Promise.resolve().then(check).then(v => !!v, () => false).then(v => v ? stop(true) : timeout > 0 && Date.now() - t0 >= timeout ? stop(false) : (t = setTimeout(tick, every))) })()
})

// ---- logs: one capped sink. The first keepHead lines never drop; later ones roll behind one "…[N dropped]…" line;
// long lines keep head and tail; a repeat of the last line becomes "line (xN)"; errors keep their stack ----
const isErr = x => !!x && typeof x === 'object' && typeof x.message === 'string' && typeof x.stack === 'string'
const errStr = e => { const h = (e.name || 'Error') + (e.message ? ': ' + e.message : ''), s = String(e.stack || ''); return s.startsWith(h) ? s : h + (s ? '\n' + s : '') }
function str(x, lim) {
  if (typeof x === 'string') return x; if (x === null || typeof x !== 'object') return String(x); if (isErr(x)) return errStr(x)
  let n = 0; try { return JSON.stringify(x, (k, v) => { if (isErr(v)) return errStr(v); if (lim && (n += k.length + (typeof v === 'string' ? v.length : 4)) > lim) throw 0; return v }) }
  catch { let ks = []; try { ks = Object.keys(x).slice(0, 20) } catch {} return Object.prototype.toString.call(x) + (ks.length ? ' {' + ks.join(',') + (ks.length > 19 ? ',…' : '') + '}' : '') }
}
function sink(a, P = {}) {                                                                    // P = { max, keepHead, clip } -> push(prefix, args)
  const max = Math.max(3, P.max || 2000), head = Math.min(P.keepHead ?? 20, max - 2), C = P.clip ?? 8000
  a.dropped = 0
  return (pre, parts) => {
    let s; try { s = pre + Array.from(parts, x => str(x, C * 2)).join(' ') } catch { s = pre + '[unprintable]' }
    if (C && s.length > C) { const h = Math.floor(C * .7); s = s.slice(0, h) + ' …[' + (s.length - C) + ' chars cut]… ' + s.slice(s.length - (C - h)) }
    const i = a.length - 1, m = i >= 0 && /^([\s\S]*) \(x(\d+)\)$/.exec(a[i])
    if (i >= 0 && (a[i] === s || (m && m[1] === s))) return void (a[i] = s + ' (x' + ((m ? +m[2] : 1) + 1) + ')')
    a.push(s)
    while (a.length > max) { if (a.dropped) a.splice(head + 1, 1); a.dropped++; a[head] = '…[' + a.dropped + ' dropped]…' }
  }
}
function capture(S, logs, errs, P) {                                                          // console.* and error events of one scope -> two arrays
  if (S.__simCap) return; S.__simCap = 1
  const L = sink(logs, P), E = sink(errs, P), C = S.console
  for (const k of ['log', 'warn', 'error', 'info', 'debug']) { const o = C[k]?.bind(C) || (() => {}); C[k] = (...a) => { try { L(k + ': ', a) } catch {} return o(...a) } }
  S.addEventListener?.('error', e => E(e.error ? 'Uncaught ' : '', [e.error || e.message + (e.filename ? ` (${e.filename}:${e.lineno}:${e.colno || 0})` : '')]))
  S.addEventListener?.('unhandledrejection', e => E('rej: ', [e.reason]))
}

// ---- page: html -> html as a table of steps. The same table serves the sim page, every navigation and child frames.
// ctx = { L (layers), url, nav (navigation count), child, boot (code that runs first), edit, prepend, append } ; ctx.errors / ctx.bridge are filled in ----
const esc = s => String(s).replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--'), attr = s => String(s).replace(/"/g, '&quot;')
// code -> tags: a string = inline script, { src } = external script, { html } = raw markup, or a list of these
const tagsOf = x => [].concat(x ?? []).map(c => c == null ? '' : typeof c === 'object' ? (c.html != null ? String(c.html) : c.src != null ? `<script src="${attr(c.src)}"></script>` : '') : `<script>${esc(c)}</script>`).join('')
// a string/RegExp pair is one edit; a function gets (html, { url, navigation }); a list holds any of these
const edits = E => E == null ? [] : Array.isArray(E) && (typeof E[0] === 'string' || E[0] instanceof RegExp) ? [E] : [].concat(E)
const BRIDGE = 'window.__app={run:function(c){c=String(c);var N=String.fromCharCode(10),x=true;try{new Function("return ("+c+N+")")}catch(e){x=false}return x?eval(c):eval("(function(){"+c+N+"})()")},v:1};'
// injected code goes right after <head> (or <html>, <!doctype>, or at the very start): always before the page's first script or body
const spliceHead = (html, tag) => { const lim = (i => i < 0 ? html.length : i)(html.search(/<(script|body)[\s>]/i)); let at = 0; for (const re of [/<head(?:\s[^>]*)?>/i, /<html(?:\s[^>]*)?>/i, /<!doctype[^>]*>/i]) { const m = re.exec(html); if (m && m.index < lim) { at = m.index + m[0].length; break } } return html.slice(0, at) + tag + html.slice(at) }
const STEPS = {
  edit: (h, c) => c.child ? h : edits(c.edit).reduce((h, e, i) => { try { return typeof e === 'function' ? (v => v == null ? h : String(v))(e(h, { url: c.url, navigation: c.nav | 0 })) : typeof e[0] === 'string' ? h.split(e[0]).join(typeof e[1] === 'function' ? e[1](e[0]) : e[1]) : h.replace(e[0], e[1]) } catch (x) { c.errors.push('edit ' + i + ': ' + (x.message || x)); return h } }, h),
  // <meta http-equiv> refresh (navigation not 'allow') and CSP (csp 'strip') are kept but switched off; Rocket Loader scripts run as normal scripts
  fixes: (h, c) => { const eq = [get(c.L, 'realm/navigation', 'virtual') !== 'allow' && 'refresh', get(c.L, 'page/csp', 'strip') === 'strip' && 'content-security-policy'].filter(Boolean)
    if (eq.length) h = h.replace(new RegExp('<meta\\b([^>]*?)\\bhttp-equiv(\\s*=\\s*["\']?(?:' + eq.join('|') + '))', 'gi'), '<meta$1data-sim-http-equiv$2')
    return get(c.L, 'page/rocketLoader', 'undo') === 'undo' ? h.replace(/<script\b[^>]*\bsrc\s*=\s*["']?[^"'\s>]*rocket-loader[^>]*>\s*<\/script\s*>/gi, '').replace(/(<script\b[^>]*?\btype\s*=\s*["']?)[0-9a-f]{8,}-(text\/javascript|module)\b/gi, '$1$2') : h },
  // window.__app.run inside the app's main inline script: after the first pattern match, past a leading "use strict" (so the app keeps its own mode)
  bridge: (h, c) => { if (c.child || !get(c.L, 'page/bridge', true)) return (c.bridge = 'off', h)
    const code = get(c.L, 'page/bridgeCode', null) || BRIDGE, pats = [].concat(get(c.L, 'page/bridgePatterns', [])).map(p => p instanceof RegExp ? new RegExp(p.source, p.flags.replace('g', '')) : new RegExp(p))
    const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi; let m
    while ((m = re.exec(h))) { const a = m[1], ty = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(a); if (/\bsrc\s*=/i.test(a) || (ty && !/^(text\/javascript|application\/javascript|module)$/i.test(ty[1]))) continue
      for (const p of pats) { const r = p.exec(m[2]); if (!r) continue; let at = m.index + m[0].indexOf('>') + 1 + r.index + r[0].length; const d = /^\s*(['"])use strict\1;?/.exec(h.slice(at)); if (d) at += d[0].length; c.bridge = 'ok'; return h.slice(0, at) + code + h.slice(at) } }
    c.bridge = 'missing'; return h },
  // the page's own <base> wins (made absolute); otherwise the url becomes the base
  base: (h, c) => { if (!c.url) return h; const b = /<base\b[^>]*>/i.exec(h), hm = b && /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(b[0])
    if (!hm) return b ? h : spliceHead(h, `<base href="${attr(c.url)}">`); let abs; try { abs = new URL(hm[1] ?? hm[2] ?? hm[3], c.url).href } catch { abs = c.url }
    return h.slice(0, b.index) + b[0].slice(0, hm.index) + `href="${attr(abs)}"` + b[0].slice(hm.index + hm[0].length) + h.slice(b.index + b[0].length) },
  head: (h, c) => spliceHead(h, (c.boot ? `<script>${esc(c.boot)}</script>` : '') + (c.child ? '' : tagsOf(c.prepend))),
  tail: (h, c) => { const t = c.child ? '' : tagsOf(c.append); if (!t) return h; const i = h.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i); return i < 0 ? h + t : h.slice(0, i) + t + h.slice(i) }
}
function page(html, c) {
  c.errors = []; html = String(html)
  for (const k in STEPS) try { html = STEPS[k](html, c) } catch (e) { c.errors.push(k + ': ' + (e.message || e)) }
  return html
}

// ---- hooks: every change to a realm API is one row [setting, target, key, how, make]; one loop installs them ----
// how: 'value' (replace), 'get' (accessor returning make(orig) once), 'accessor' (make returns { get, set }), 'absent' (remove the API)
// make(orig, S, ctx, descriptor) -> the replacement. Returns whether the change stuck.
function patch(o, k, how, make) {
  if (!o) return false
  try {
    let d, p = o; while (p && !(d = Object.getOwnPropertyDescriptor(p, k))) p = Object.getPrototypeOf(p)
    if (how === 'absent') { for (p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) try { delete p[k] } catch {} ; if (k in o) Object.defineProperty(o, k, { configurable: true, get: () => undefined, set() {} }); return o[k] === undefined }
    const v = make(d && d.get ? d.get.call(o) : o[k], d)
    if (how === 'value') { try { o[k] = v } catch {} if (o[k] !== v) Object.defineProperty(o, k, { configurable: true, writable: true, value: v }); return o[k] === v }
    Object.defineProperty(o, k, Object.assign({ configurable: true, enumerable: !d || d.enumerable }, how === 'accessor' ? v : { get: () => v })); return how === 'accessor' || o[k] === v
  } catch { return false }
}
const hooks = [], extraHooks = []                                                             // built-in rows; SIM.hook rows and a sim's own rows travel with the sim
const hook = (setting, target, key, how, make) => hooks.push([setting, target, key, how, make])
// install every enabled row into scope S (a setting of false | 'off' | 'allow' disables a row); returns { key: stuck } for the report
function install(S, ctx, rows = hooks) {
  const r = {}
  for (const [s, t, k, how, make] of rows) { const v = s ? get(ctx.L, s, true) : true; if (!v || v === 'off' || v === 'allow') continue; let o; try { o = t(S) } catch { continue } if (!o || (how === 'value' && !(k in o))) continue; r[k] = patch(o, k, how, (orig, d) => make(orig, S, ctx, d)) }
  return r
}
// a fake object: props (writable), getters (computed), methods, on<event> handlers, a prototype (for instanceof);
// fire(type, init, Ctor) dispatches the event and calls the on<type> handler
function shell(S, { proto, props = {}, getters = {}, methods = {}, events = [] }) {
  const o = new S.EventTarget(), def = (k, d) => Object.defineProperty(o, k, Object.assign({ configurable: true }, d))
  if (proto) try { Object.setPrototypeOf(o, proto) } catch {}
  for (const k in props) def(k, { enumerable: true, writable: true, value: props[k] })
  for (const k in getters) def(k, { enumerable: true, get: getters[k] })
  for (const k in methods) def(k, { writable: true, value: methods[k] })
  for (const e of events) def('on' + e, { enumerable: true, writable: true, value: null })
  def('fire', { value: (type, init, C = S.Event) => { let e; try { e = new C(type, init) } catch { e = new S.Event(type) } const h = o['on' + type]; if (typeof h === 'function') try { h.call(o, e) } catch (x) { S.setTimeout(() => { throw x }) } return S.EventTarget.prototype.dispatchEvent.call(o, e) } })
  return o
}
// a blocked API: the listed async methods reject with SecurityError and report '<name>Blocked'; the others are no-ops
const deny = (S, ctx, name, rejects = [], noops = []) => { const o = {}; for (const m of rejects) o[m] = (...a) => (ctx.emit(name + 'Blocked', { method: m, args: a.map(String) }), S.Promise.reject(new S.DOMException(name + ' is blocked inside this sim', 'SecurityError'))); for (const m of noops) o[m] = () => {}; return o }

// ---- loading a url (host side): direct first; if that fails and net/proxy is set, the proxies race: started net/proxyStagger ms
// apart, a failure starts the next one at once, the first good reply wins and the others are aborted ----
const proxies = L => [].concat(get(L, 'net/proxy', null) ?? []).map(x => typeof x === 'string' ? { url: x } : x).filter(x => x && x.url)
const viaProxy = (p, url) => /[?=]$/.test(p.url) ? p.url + encodeURIComponent(url) : p.url + url    // a prefix ending in ? or = gets the url encoded
const unwrap = t => { try { const j = JSON.parse(t); if (typeof j?.contents === 'string') return j.contents } catch {} return t }   // { contents } replies
const text = (u, o) => fetch(u, o).then(r => r.ok ? r.text() : Promise.reject(Error('HTTP ' + r.status)))
const raceProxies = (url, list, stagger) => new Promise((res, rej) => {
  let next = 0, won = false, failed = 0, tm = 0; const errors = [], ctl = []
  const launch = () => { if (won || next >= list.length) return; const i = next++, p = list[i], c = new AbortController(); ctl.push(c); clearTimeout(tm); tm = next < list.length && setTimeout(launch, stagger[Math.min(i, stagger.length - 1)] || 0)
    text(viaProxy(p, url), { signal: c.signal }).then(unwrap).then(t => { if (!t) throw Error('empty reply'); if (won) return; won = true; clearTimeout(tm); ctl.forEach(x => x.abort()); res({ text: t, proxy: p, errors }) }, e => { if (won) return; errors.push((p.name || p.url) + ': ' + e.message); ++failed >= list.length ? (clearTimeout(tm), rej(Object.assign(Error('all proxies failed'), { errors }))) : launch() }) }
  list.length ? launch() : rej(Error('no proxies'))
})
// -> { url, html, via: 'direct' | 'proxy', proxy, errors } ; throws an Error carrying the same fields plus kind: 'cors' | 'offline' | 'unreachable'
async function loadUrl(url, L) {
  const list = proxies(L), st = [].concat(get(L, 'net/proxyStagger', [200, 800, 1000])), info = { url, errors: [] }
  const viaP = async e => { if (!list.length) throw e; try { const r = await raceProxies(url, list, st); return Object.assign(info, { html: r.text, via: 'proxy', proxy: r.proxy.url, errors: r.errors }) } catch (x) { info.errors = x.errors || [x.message]; throw e || x } }
  try { if (get(L, 'net/proxyMode', 'fallback') === 'always' && list.length) return await viaP(null); try { return Object.assign(info, { html: await text(url), via: 'direct' }) } catch (e) { info.directError = e.message; return await viaP(e) } }
  catch (e) { info.kind = typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : await fetch(url, { mode: 'no-cors' }).then(() => 'cors', () => 'unreachable'); throw Object.assign(e, info) }
}

// ---- sharing: every named browser resource is placed by one rule, share/<kind>/<name> -> 'own' | 'real' | '<group>'.
// Real names: own -> '~s<id>~name', a group -> '~g<group>~name', real -> name. A name's prefix says who owns it, so listing,
// events and cleanup all read it back. kinds: local session cookie idb cache lock channel worker opfs ----
const pre = (k, v) => '~' + k + String(v).replace(/~/g, '-') + '~'
const where = (c, kind, name) => { const v = get(c.L, ['share', kind, String(name)], 'own'); return v === 'own' ? pre('s', c.id) : v === 'real' ? '' : pre('g', v) }
const split = rk => { const m = /^~[sg][^~]*~/.exec(rk); return m ? [m[0], rk.slice(m[0].length)] : ['', rk] }
const seen = (c, kind, rk) => { const [p, n] = split(String(rk)); return where(c, kind, n) === p ? n : null }   // the name the sim sees, or null
// key-value engine (local, session, cookie): a backend is the real store with prefixed keys, or a memory Map (store/<kind> = 'memory')
function kv(c, kind, real) {
  const mem = get(c.L, ['store', kind], 'real') === 'memory' || !real ? (c.mem[kind] ||= new Map()) : null
  const B = mem ? { get: k => mem.has(k) ? mem.get(k) : null, set: (k, v) => mem.set(k, v), del: k => mem.delete(k), keys: () => [...mem.keys()] }
    : { get: k => real.getItem(k), set: (k, v, a) => real.setItem(k, v, a), del: k => real.removeItem(k), keys: () => Array.from({ length: real.length }, (_, i) => real.key(i)) }
  const rk = n => where(c, kind, n) + n
  return c.kv[kind] = { get: n => B.get(rk(n)), set: (n, v, a) => B.set(rk(n), String(v), a), del: n => B.del(rk(n)), keys: () => B.keys().map(k => seen(c, kind, k)).filter(n => n != null), real, rk }
}
// a Storage-like view of document.cookie (the real one, through its original descriptor d); setItem's 3rd arg = the attribute string
const jar = (S, d) => { const all = () => Object.fromEntries(String(d.get.call(S.document) || '').split(/;\s*/).filter(Boolean).map(x => { const i = x.indexOf('='); return i < 0 ? [x, ''] : [x.slice(0, i), x.slice(i + 1)] }))
  return { getItem: k => all()[k] ?? null, setItem: (k, v, a = '; path=/') => d.set.call(S.document, k + '=' + v + a), removeItem: k => d.set.call(S.document, k + '=; max-age=0; path=/'), key: i => Object.keys(all())[i] ?? null, get length() { return Object.keys(all()).length } } }
function storageFace(S, k) {                                                                 // localStorage / sessionStorage over a kv
  const api = { getItem: n => k.get(n), setItem: (n, v) => k.set(n, v), removeItem: n => k.del(n), clear: () => k.keys().forEach(n => k.del(n)), key: i => k.keys()[i] ?? null }
  Object.defineProperty(api, 'length', { configurable: true, get: () => k.keys().length })
  const face = new Proxy(api, { get: (t, p) => typeof p === 'symbol' || p in api ? api[p] : k.get(p) ?? undefined, set: (t, p, v) => (k.set(p, v), true), deleteProperty: (t, p) => (k.del(p), true), has: (t, p) => p in api || k.get(p) !== null, ownKeys: () => k.keys(), getOwnPropertyDescriptor: (t, p) => { const v = k.get(p); return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true } } })
  // native 'storage' events carry the real (prefixed) key: translate them to the sim's names, hide the rest
  if (k.real && S.addEventListener) S.addEventListener('storage', e => { if (e.__sim || e.storageArea !== k.real) return; try { e.stopImmediatePropagation() } catch {}; const n = e.key == null ? null : seen(k.c, k.kind, e.key); if (e.key != null && n == null) return; const ev = new S.StorageEvent('storage', { key: n, oldValue: e.oldValue, newValue: e.newValue, url: e.url }); Object.defineProperty(ev, 'storageArea', { value: face }); ev.__sim = 1; S.dispatchEvent(ev) }, true)
  return face
}
const cookieFace = (S, k) => ({ get: () => k.keys().map(n => n + '=' + k.get(n)).join('; '), set(s) { const [kvp, ...at] = String(s).split(';'), i = kvp.indexOf('='), n = (i < 0 ? '' : kvp.slice(0, i)).trim(), v = (i < 0 ? kvp : kvp.slice(i + 1)).trim()
  at.some(a => (a = a.trim().toLowerCase(), /^max-age=(0|-)/.test(a) || (a.startsWith('expires=') && new Date(a.slice(8)) < new Date()))) ? k.del(n) : k.set(n, v, at.length ? ';' + at.join(';') : undefined) } })
// named APIs: name methods map their first argument, list methods map their results back (strings or { name }), the rest pass through
function named(c, kind, real, names, lists, rest = []) {
  const o = {}, rk = n => where(c, kind, n) + n, back = v => typeof v === 'string' ? seen(c, kind, v) : v && typeof v === 'object' && 'name' in v ? (n => n == null ? null : { ...v, name: n })(seen(c, kind, v.name)) : v
  const list = v => Array.isArray(v) ? v.map(back).filter(x => x != null) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, list(x)])) : v
  for (const m of names) o[m] = (n, ...a) => real[m](rk(n), ...a)
  for (const m of lists) o[m] = (...a) => Promise.resolve(real[m](...a)).then(list)
  for (const m of rest) o[m] = (...a) => real[m](...a)
  o.rk = rk; return o
}
hook(null, S => S, 'localStorage', 'get', (o, S, c) => storageFace(S, Object.assign(kv(c, 'local', o), { c, kind: 'local' })))
hook(null, S => S, 'sessionStorage', 'get', (o, S, c) => storageFace(S, Object.assign(kv(c, 'session', o), { c, kind: 'session' })))
hook(null, S => S.document, 'cookie', 'accessor', (v, S, c, d) => cookieFace(S, kv(c, 'cookie', jar(S, d))))
hook('realm/cookieStore', S => S, 'cookieStore', 'absent', () => 0)   // the cookieStore API would bypass the cookie face: removed unless realm/cookieStore 'allow'
hook(null, S => S, 'indexedDB', 'get', (o, S, c) => named(c, 'idb', o, ['open', 'deleteDatabase'], ['databases'], ['cmp']))
hook(null, S => S, 'caches', 'get', (o, S, c) => { const w = named(c, 'cache', o, ['open', 'has', 'delete'], ['keys'])
  w.match = (r, op = {}) => op.cacheName ? o.match(r, { ...op, cacheName: w.rk(op.cacheName) }) : w.keys().then(ks => ks.reduce((p, n) => p.then(x => x || o.open(w.rk(n)).then(ch => ch.match(r, op))), Promise.resolve(undefined))); return w })
hook(null, S => S.navigator, 'locks', 'get', (o, S, c) => named(c, 'lock', o, ['request'], ['query']))
hook(null, S => S, 'BroadcastChannel', 'value', (o, S, c) => { const B = function (n) { return new o(where(c, 'channel', n) + n) }; B.prototype = o.prototype; return B })
hook(null, S => S, 'SharedWorker', 'value', (o, S, c) => { const W = function (u, op) { op = typeof op === 'string' ? { name: op } : { ...op }; op.name = where(c, 'worker', op.name || '') + (op.name || ''); return new o(u, op) }; W.prototype = o.prototype; return W })
hook(null, S => S.navigator.storage, 'getDirectory', 'value', (o, S, c) => () => o.call(S.navigator.storage).then(r => (p => p ? r.getDirectoryHandle(p + 'root', { create: true }) : r)(where(c, 'opfs', 'root'))))
// delete everything named with prefix p (a sim's '~s<id>~' or a group's '~g<name>~') in this realm's real stores
async function drop(S, p) {
  const n = { local: 0, session: 0, cookie: 0, idb: 0, cache: 0, opfs: 0 }
  for (const [st, nm] of [[S.localStorage, 'local'], [S.sessionStorage, 'session']]) try { for (let i = st.length - 1; i >= 0; i--) { const k = st.key(i); if (k.startsWith(p)) { st.removeItem(k); n[nm]++ } } } catch {}
  for (const c of String(S.document?.cookie || '').split(/;\s*/)) { const k = c.split('=')[0]; if (k.startsWith(p)) { S.document.cookie = k + '=; max-age=0; path=/'; n.cookie++ } }
  try { for (const d of await S.indexedDB.databases()) if (d.name?.startsWith(p)) { S.indexedDB.deleteDatabase(d.name); n.idb++ } } catch {}
  try { for (const k of await S.caches.keys()) if (k.startsWith(p)) { await S.caches.delete(k); n.cache++ } } catch {}
  try { const r = await S.navigator.storage.getDirectory(); for await (const k of r.keys()) if (k.startsWith(p)) { await r.removeEntry(k, { recursive: true }); n.opfs++ } } catch {}
  return n
}

// ---- network (realm side): one decision per request -> offline | route | proxy | pass; thin adapters for fetch, XHR,
// WebSocket, EventSource and sendBeacon. Routes are rows on the host node: { id, kind: 'http'|'ws'|'sse', test, method, delay, times, fn } ----
const patTest = p => p == null ? () => true : typeof p === 'function' ? p : u => p instanceof RegExp ? (p.lastIndex = 0, p.test(u)) : String(u).includes(p)
const routeRow = (kind, pattern, fn, o = {}) => ({ id: uid('rt'), kind, test: patTest(pattern), method: o.method ? String(o.method).toUpperCase() : null, delay: o.delay || 0, times: o.times || 0, fn })
const up = s => String(s).toUpperCase(), abs = (S, u, ws) => { let b = ''; try { b = S.__simBase || S.document?.baseURI || S.location.href } catch {} try { return new S.URL(String(u), ws ? b.replace(/^http/i, 'ws') : b).href } catch { return String(u) } }
// the page's cross-origin requests go through the proxy the page itself was loaded through ('auto'), or the first proxy (true); a getOnly proxy is swapped for non-GET
const proxyFor = (c, url, method) => { const m = get(c.L, 'net/proxyRequests', 'auto'), list = proxies(c.L), via = c.host?.st.load?.proxy; if (!m || !list.length || (m === 'auto' && !via)) return null
  let o; try { o = new URL(url).origin } catch { return null } if (!/^https?:$/.test(new URL(url).protocol) || o === c.origin || list.some(p => url.startsWith(p.url))) return null
  let p = list.find(p => p.url === via) || list[0]; if (method && method !== 'GET' && p.getOnly) p = list.find(x => !x.getOnly); return p ? viaProxy(p, url) : null }
const decide = (c, kind, url, method) => { if (get(c.L, 'net/offline', false)) return { offline: 1 }; const r = (c.host?.routes || []).find(r => r.kind === kind && (!r.method || r.method === method) && r.test(url)); if (r) return { route: r }; const p = proxyFor(c, url, method); return p ? { proxy: p } : {} }
const callRoute = (c, r, url, q, raw) => { if (r.times && --r.times <= 0) { const i = c.host.routes.indexOf(r); i >= 0 && c.host.routes.splice(i, 1) } try { return r.fn(url, q) } catch (e) { if (raw) throw e; return { status: 500, body: 'handler error: ' + e.message } } }
const sse = t => /^\s*(data|event|id|retry):/.test(t), ctOf = t => { if (sse(t)) return 'text/event-stream'; try { JSON.parse(t); return 'application/json' } catch { return 'text/plain;charset=UTF-8' } }
const isResp = v => !!v && typeof v === 'object' && typeof v.arrayBuffer === 'function' && typeof v.status === 'number'
function parts(S, v) {                                      // a handler reply -> { status, headers (lower-case object), body }: a string | { status, headers, body } (object body = JSON)
  if (typeof v === 'string') return { status: 200, headers: { 'content-type': ctOf(v) }, body: v }
  let b = v?.body ?? '', h = {}; if (b && typeof b === 'object' && !ArrayBuffer.isView(b) && !/Blob|ArrayBuffer|FormData|URLSearchParams|ReadableStream/.test(Object.prototype.toString.call(b))) { try { b = JSON.stringify(b) } catch {} }
  new S.Headers(v?.headers || { 'content-type': typeof b === 'string' ? ctOf(b) : 'application/octet-stream' }).forEach((x, k) => h[k] = x)
  return { status: v?.status || 200, headers: h, body: b }
}
const abortErr = S => new S.DOMException('The user aborted a request.', 'AbortError')
async function reply(S, c, r, q) {                          // a routed request -> Response; the delay runs on the sim's clock; the request's AbortSignal is honoured
  const sig = q.init?.signal || q.input?.signal; let out = callRoute(c, r, q.url, q); if (out && typeof out.then === 'function') out = await out
  const d = out?.delay || r.delay; if (d) await new S.Promise((res, rej) => { const ab = () => { S.clearTimeout(t); rej(abortErr(S)) }, t = S.setTimeout(() => { sig?.removeEventListener('abort', ab); res() }, d); sig?.addEventListener('abort', ab) })
  if (sig?.aborted) throw abortErr(S); if (isResp(out)) return out
  const p = parts(S, out); return new S.Response(p.status === 204 || p.status === 304 ? null : p.body, { status: p.status, headers: p.headers })
}
function fetchOf(S, c, o) { return (input, init) => { c.net.active++; const done = r => (c.net.active--, r), fail = e => { c.net.active--; throw e }
  return (async () => { const url = abs(S, typeof input === 'string' ? input : input?.url ?? input), method = up(init?.method || input?.method || 'GET'), d = decide(c, 'http', url, method)
    if (d.offline) throw new S.TypeError('Failed to fetch (sim offline)')
    if (d.route) return reply(S, c, d.route, { url, method, headers: Object.fromEntries(new S.Headers(init?.headers || (input?.headers ?? {}))), body: init?.body ?? (S.Request && input instanceof S.Request && !/^(GET|HEAD)$/.test(method) ? await input.clone().text() : null), input, init })
    return o(d.proxy ? (S.Request && input instanceof S.Request ? new S.Request(d.proxy, input) : d.proxy) : input, init) })().then(done, fail) } }
function xhrOf(S, c, XP) {                                   // routed / offline requests never reach the network: the object is answered in place
  const xo = XP.open, xs = XP.send, xh = XP.setRequestHeader, xa = XP.abort
  const ev = (x, t, n) => x.dispatchEvent(t === 'readystatechange' ? new S.Event(t) : new S.ProgressEvent(t, { lengthComputable: n > 0, loaded: n || 0, total: n || 0 }))
  const fake = (x, s) => { Object.assign(s, { faked: 1, rs: 1, st: 0, stt: '', txt: '', res: '', xml: null, hd: {} }); const g = (k, f) => Object.defineProperty(x, k, { configurable: true, get: f })
    for (const [k, v] of Object.entries({ readyState: 'rs', status: 'st', statusText: 'stt', response: 'res', responseXML: 'xml' })) g(k, () => s[v])
    g('responseURL', () => s.rs === 4 && s.st ? s.url : ''); g('responseText', () => { if (x.responseType && x.responseType !== 'text') throw new S.DOMException("The value is only accessible if the object's 'responseType' is '' or 'text'.", 'InvalidStateError'); return s.txt })
    Object.assign(x, { getResponseHeader: k => s.rs >= 2 ? s.hd[String(k).toLowerCase()] ?? null : null, getAllResponseHeaders: () => s.rs < 2 ? '' : Object.entries(s.hd).map(([k, v]) => k + ': ' + v + '\r\n').join('') }) }
  const fail = (x, s, t = 'error') => { if (s.done) return; s.done = 1; s.rs = 4; s.st = 0; ev(x, 'readystatechange'); ev(x, t, 0); ev(x, 'loadend', 0) }
  const fill = (x, s, p, buf, txt) => { const rt = x.responseType || '', ct = String(p.headers['content-type'] || '').split(';')[0].trim(), doc = t => { try { return new S.DOMParser().parseFromString(txt, t) } catch { return null } }, n = buf.byteLength
    Object.assign(s, { st: p.status, hd: p.headers, rs: 2 }); ev(x, 'readystatechange'); s.txt = txt
    s.res = rt === '' || rt === 'text' ? txt : rt === 'json' ? (() => { try { return JSON.parse(txt) } catch { return null } })() : rt === 'arraybuffer' ? buf : rt === 'blob' ? new S.Blob([buf], { type: ct }) : rt === 'document' ? doc(/xml/.test(ct) ? ct : 'text/html') : txt
    s.xml = rt === 'document' ? s.res : !rt && /xml/.test(ct) ? doc(ct) : null
    s.rs = 3; ev(x, 'readystatechange'); ev(x, 'progress', n); s.rs = 4; s.done = 1; ev(x, 'readystatechange'); ev(x, 'load', n); ev(x, 'loadend', n) }
  XP.open = function (m, u, ...a) { const s = this.__sim = { m: up(m || 'GET'), url: abs(S, u), h: {}, async: !a.length || !!a[0] }; s.d = decide(c, 'http', s.url, s.m); return xo.call(this, m, s.d.proxy || u, ...a) }
  XP.setRequestHeader = function (k, v) { this.__sim && (this.__sim.h[String(k).toLowerCase()] = String(v)); return xh.apply(this, arguments) }
  XP.abort = function () { const s = this.__sim; if (!s?.faked) return xa.apply(this, arguments); s.done || fail(this, s, 'abort'); s.rs = 0 }
  return function (body) { const x = this, s = x.__sim; if (!s || !(s.d.route || s.d.offline)) { if (x.__simFaked) for (const k of ['readyState', 'status', 'statusText', 'response', 'responseXML', 'responseURL', 'responseText', 'getResponseHeader', 'getAllResponseHeaders']) delete x[k]; x.__simFaked = 0; return xs.apply(x, arguments) }
    x.__simFaked = 1; fake(x, s); ev(x, 'loadstart', 0); c.net.active++; const end = () => c.net.active--
    if (s.d.offline) { end(); if (!s.async) { s.done = 1; s.rs = 4; throw new S.DOMException('Failed to execute send: sim offline', 'NetworkError') } S.Promise.resolve().then(() => fail(x, s)); return }
    const q = { url: s.url, method: s.m, headers: s.h, body: body ?? null }, r = s.d.route
    if (!s.async) { const out = callRoute(c, r, s.url, q), p = out && typeof out.then !== 'function' && !isResp(out) && !out.delay && !r.delay && parts(S, out); end()
      if (!p || typeof p.body !== 'string') { s.done = 1; s.rs = 4; throw new S.DOMException('sim: a synchronous XMLHttpRequest needs a route that answers at once (a string or { status, headers, body } without delay)', 'NetworkError') }
      return fill(x, s, p, new S.TextEncoder().encode(p.body).buffer, p.body) }
    reply(S, c, r, q).then(async r => { const hd = {}; r.headers.forEach((v, k) => hd[k] = v); const buf = await r.arrayBuffer(); s.done || fill(x, s, { status: r.status, headers: hd }, buf, new S.TextDecoder().decode(buf)) }).catch(() => fail(x, s)).then(end) }
}
const CODES = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }
// a fake endpoint (WebSocket / EventSource): a shell with the real prototype, url, origin, readyState, the state codes and the events
const endpoint = (S, R, url, events, more) => { const st = { rs: 0 }, origin = (() => { try { return new S.URL(url).origin } catch { return '' } })()
  const o = shell(S, { proto: R.prototype, props: { url, ...CODES, ...more.props }, getters: { readyState: () => st.rs }, events, methods: more.methods(st) }); return { o, st, origin } }
function wsOf(S, c, RW) {                                    // a routed socket talks to the route's handler (a fake server); offline sockets fail like a dead network
  const later = f => S.Promise.resolve().then(f), tag = x => Object.prototype.toString.call(x)
  const mk = (url, protocols, r) => {
    const q = [], L = {}, pr = [].concat(protocols ?? [])
    const { o: sock, st, origin } = endpoint(S, RW, url, ['open', 'message', 'error', 'close'], { props: { protocol: '', extensions: '', bufferedAmount: 0, binaryType: 'blob' },
      methods: st => ({ send(d) { if (st.rs === 0) throw new S.DOMException("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.", 'InvalidStateError'); if (st.rs !== 1) return; peer.received.push(d); later(() => toPeer('message', d)) },
        close(code, reason) { if (st.rs >= 2) return; const was = st.rs; st.rs = 2; later(() => was === 0 ? shut(1006, '', false) : shut(code || 1000, reason, true)) } }) })
    const toPage = d => { if (st.rs === 0) return q.push(d); if (st.rs !== 1) return; if (ArrayBuffer.isView(d)) d = d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)
      if (tag(d) === '[object ArrayBuffer]' && sock.binaryType === 'blob') d = new S.Blob([d]); else if (tag(d) === '[object Blob]' && sock.binaryType === 'arraybuffer') return d.arrayBuffer().then(b => st.rs === 1 && sock.fire('message', { data: b, origin }, S.MessageEvent))
      sock.fire('message', { data: d, origin }, S.MessageEvent) }
    const toPeer = (t, a) => { const fs = [...(L[t] || [])], h = peer['on' + t]; typeof h === 'function' && fs.unshift(h); fs.forEach(f => { try { f.call(peer, a) } catch (x) { later(() => { throw x }) } }) }
    const shut = (code, reason, clean) => { if (st.rs === 3) return; st.rs = 3; clean || sock.fire('error'); const d = { code, reason: reason || '', wasClean: !!clean }; sock.fire('close', d, S.CloseEvent); toPeer('close', d) }
    const peer = { url, protocols: pr, received: [], onmessage: null, onopen: null, onclose: null, get readyState() { return st.rs }, send: d => (later(() => toPage(d)), peer),
      close: (code, reason) => later(() => { st.rs < 2 && (st.rs = 2); shut(code || 1000, reason, true) }), fail: code => later(() => shut(code || 1006, '', false)), on: (t, f) => ((L[t] ||= []).push(f), peer) }
    let ok = false; if (r) try { ok = callRoute(c, r, url, peer, 1) } catch (e) { later(() => { throw e }) }
    S.Promise.resolve(ok).then(v => { const open = () => { if (st.rs !== 0) return; if (v === false || !r) return shut(1006, '', false); st.rs = 1; sock.protocol = pr[0] || ''; sock.fire('open'); toPeer('open'); q.splice(0).forEach(toPage) }; r?.delay ? S.setTimeout(open, r.delay) : open() }, () => shut(1006, '', false))
    return sock }
  const F = function (url, protocols) { const u = abs(S, url, true), d = decide(c, 'ws', u, null); return d.offline || d.route ? mk(u, protocols, d.route) : protocols === undefined ? new RW(url) : new RW(url, protocols) }
  F.prototype = RW.prototype; Object.assign(F, CODES); return F
}
function sseOf(S, c, RE) {                                   // a routed EventSource gets the route's reply parsed as SSE frames (event:, data:, id:); offline ones error out
  const F = function (url, init) { const u = abs(S, url), d = decide(c, 'sse', u, null); if (!d.offline && !d.route) return init === undefined ? new RE(url) : new RE(url, init)
    let last = ''; const { o: es, st, origin } = endpoint(S, RE, u, ['open', 'message', 'error'], { props: { withCredentials: !!init?.withCredentials }, methods: st => ({ close() { st.rs = 2 } }) })
    S.Promise.resolve(d.route && callRoute(c, d.route, u, { url: u, method: 'GET', headers: {}, body: null })).then(async out => { if (d.offline || out === false || out == null) return (st.rs = 2, es.fire('error'))
      if (out?.delay || d.route.delay) await new S.Promise(r => S.setTimeout(r, out?.delay || d.route.delay)); if (st.rs === 2) return
      const txt = isResp(out) ? await out.text() : parts(S, out).body; st.rs = 1; es.fire('open')
      for (const blk of String(txt).split(/\r?\n\r?\n/)) { if (st.rs === 2) return; const f = { event: 'message', data: [] }; for (const ln of blk.split(/\r?\n/)) { const m = /^(\w+):\s?(.*)$/.exec(ln); if (!m) continue; m[1] === 'data' ? f.data.push(m[2]) : m[1] === 'id' ? last = m[2] : f[m[1]] = m[2] }
        if (f.data.length) es.fire(f.event, { data: f.data.join('\n'), lastEventId: last, origin }, S.MessageEvent) } })
    return es }
  F.prototype = RE.prototype; Object.assign(F, CODES); return F
}
hook('net', S => S, 'fetch', 'value', (o, S, c) => fetchOf(S, c, o))
hook('net', S => S.XMLHttpRequest?.prototype, 'send', 'value', (o, S, c, d, XP = S.XMLHttpRequest.prototype) => xhrOf(S, c, XP))
hook('net', S => S, 'WebSocket', 'value', (o, S, c) => wsOf(S, c, o))
hook('net', S => S, 'EventSource', 'value', (o, S, c) => sseOf(S, c, o))
hook('net', S => S.navigator, 'sendBeacon', 'value', (o, S, c) => (url, data) => { const u = abs(S, url), d = decide(c, 'http', u, 'POST'); if (d.offline) return false; if (d.route) return (reply(S, c, d.route, { url: u, method: 'POST', headers: {}, body: data ?? null }).catch(() => {}), true); return o.call(S.navigator, d.proxy || url, data) })

// ---- realm (page side): one loader for every page load, virtual navigation and history, child frames, page-made workers, popups ----
// load(S, c, target, src, init): fetch through the page's own network (routes, offline, proxy, clock) -> pipeline -> place.
// target: { frame } (a sim page or child frame element) | { win: S } (this document replaces itself) ; src: a url | { html }
async function load(S, c, target, src, init = {}) {
  const url = typeof src === 'string' ? abs(S, src) : null, el = target.frame
  let html; if (url) { const post = init.method && up(init.method) !== 'GET', r = await S.fetch(url, post ? { method: init.method, body: init.body } : undefined); if (!r.ok) throw Error('HTTP ' + r.status + ' ' + url); html = await r.text() } else html = src.html
  const navs = c.host?.st.navs ?? c.navs ?? 0, ctx = { L: c.L, url: url || src.url || null, nav: navs, child: !!el, boot: c.bootFor ? c.bootFor(url || src.url || '') : '', errors: [] }
  const out = page(html, ctx); c.emit('load', { url: ctx.url, child: !!el, errors: ctx.errors })
  if (el) { el.__simOk = 1; c.followers?.add(el); if (el.tagName === 'IFRAME') el.srcdoc = out; else el[el.tagName === 'OBJECT' ? 'data' : 'src'] = URL.createObjectURL(new S.Blob([out], { type: 'text/html' })); return out }
  c.navs = navs + 1; c.put({ navs: c.navs, url: ctx.url, status: 'loading' })                 // the page replaces itself: a blob url gives a fresh window and a fresh boot
  c.swapping = 1; try { S.location.replace(URL.createObjectURL(new S.Blob([out], { type: 'text/html' }))) } finally { c.swapping = 0 } return out
}
// virtual history: entries live here, the real history is never touched; hash changes stay in-page
function vhistory(S, c) {
  const hs = [{ state: null, url: String(S.location.href) }]; let i = 0, inHash = 0
  const cl = x => { try { return S.structuredClone(x) } catch { return x } }, put = (s, u, rep) => { const e = { state: cl(s), url: u == null ? hs[i].url : abs(S, u) }; rep ? hs[i] = e : (hs.splice(i + 1), hs.push(e), i++) }
  // in a srcdoc page '#x' resolves against the base url (another document): the hash is applied to the current url instead
  const hash = u => { try { const old = String(S.location.href), h = u.includes('#') ? u.slice(u.indexOf('#')) : '', nu = old.split('#')[0] + h; if (nu === old || inHash) return; inHash = 1; try { S.history.__sim.replaceState.call(S.history.__sim, null, '', nu) } finally { inHash = 0 } S.dispatchEvent(new S.HashChangeEvent('hashchange', { oldURL: old, newURL: nu })); S.document.getElementById(decodeURIComponent(h.slice(1)))?.scrollIntoView() } catch {} }
  const go = d => { const n = i + (d | 0); if (!d || n < 0 || n >= hs.length) return; const from = hs[i].url; i = n; const to = hs[i].url; if (to.split('#')[0] === from.split('#')[0] && to !== from) hash(to); S.setTimeout(() => S.dispatchEvent(new S.PopStateEvent('popstate', { state: hs[i].state })), 0) }
  const vh = { scrollRestoration: 'auto', pushState: (s, t, u) => put(s, u), replaceState: (s, t, u) => put(s, u, 1), go, back: () => go(-1), forward: () => go(1), get length() { return hs.length }, get state() { return hs[i].state }, log: () => ({ index: i, entries: hs.slice() }), hash }
  return vh
}
hook('realm/navigation', S => S, 'history', 'get', (o, S, c) => { const vh = vhistory(S, c); vh.__sim = o; return vh })
const navTo = (S, u) => { const r = S.navigation?.navigate(u); r?.committed.catch(() => {}); r?.finished.catch(() => {}) }   // a cancelled navigation rejects these
// navigation: the Navigation API catches links, forms, location changes and traversal; the page is fetched and loaded again with the prelude
function vnav(S, c) {
  const mode = get(c.L, 'realm/navigation', 'virtual'), N = S.navigation; if (mode === 'allow' || !N) return mode === 'allow' ? 'allow' : 'n/a'
  const same = (a, b) => a.split('#')[0] === b.split('#')[0]
  N.addEventListener('navigate', e => { try { const d = e.destination; if (c.swapping || e.downloadRequest || !d || !e.cancelable) return; const cur = String(S.location.href), u = d.url
    if (e.navigationType === 'traverse' || e.navigationType === 'reload') { e.preventDefault(); return }
    if (e.hashChange || (u.includes('#') && (same(u, cur) || u.split('#')[0] === String(S.document.baseURI).split('#')[0]))) { e.preventDefault(); S.history.hash && (e.navigationType === 'push' && S.history.pushState(null, '', u), S.history.hash(u)); return }
    if (d.sameDocument || /^about:srcdoc/i.test(u)) return; e.preventDefault()
    if (mode === 'block') return c.emit('navigationBlocked', { url: u })
    load(S, c, { win: S }, u, e.formData ? { method: 'POST', body: e.formData } : {}).catch(x => c.emit('navigateError', { url: u, error: x.message })) } catch {} })
  // a <meta http-equiv=refresh> was renamed by the pipeline; honour it here, on the sim's clock
  const refresh = () => { for (const m of S.document.querySelectorAll('meta[data-sim-http-equiv="refresh"]')) { const r = /^\s*(\d+)?[;,\s]*(?:url\s*=\s*)?['"]?([^'"]*)/i.exec(m.content || ''); if (r?.[2]) S.setTimeout(() => navTo(S, abs(S, r[2])), (+r[1] || 0) * 1000) } }
  S.document.readyState === 'loading' ? S.document.addEventListener('DOMContentLoaded', refresh) : refresh()
  return 'virtual'
}
// child frames: a same-origin frame gets the same boot (sharing, clock, network) before its own code; data:/cross-origin ones are left alone
function vframes(S, c) {
  const mode = get(c.L, 'realm/frames', 'boot'), D = S.document, AT = { IFRAME: 'src', FRAME: 'src', OBJECT: 'data', EMBED: 'src' }; if (mode === 'allow') return 'allow'
  const mine = u => { try { const x = new S.URL(u, D.baseURI); return /^(about|blob|javascript):/.test(x.protocol) ? 1 : x.protocol === 'data:' ? 0 : x.origin === c.origin } catch { return 0 } }
  const seen = new WeakSet(), handle = el => { const at = AT[el.tagName]; if (!at || seen.has(el)) return; seen.add(el)
    const sd = el.tagName === 'IFRAME' ? el.getAttribute('srcdoc') : null, sr = el.getAttribute(at)
    if (mode === 'block') { c.emit('frameBlocked', { src: sr || (sd != null ? 'srcdoc' : 'blank') }); el.setAttribute('sandbox', ''); return }
    if (sd != null) { if (!el.__simOk) load(S, c, { frame: el }, { html: sd, url: D.baseURI }) } else if (sr && !/^\s*(about|javascript):/i.test(sr) && mine(sr)) load(S, c, { frame: el }, sr).catch(x => c.emit('frameError', { src: sr, error: x.message })) }
  const scan = r => (r.querySelectorAll ? [...r.querySelectorAll('iframe,frame,object,embed')] : []).concat(AT[r.tagName] ? [r] : []).forEach(handle)
  new S.MutationObserver(ms => ms.forEach(m => m.type === 'attributes' ? (seen.delete(m.target), !m.target.__simOk && handle(m.target)) : m.addedNodes.forEach(scan))).observe(D, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcdoc', 'data'] })
  S.addEventListener('load', e => { const el = e.target; if (!AT[el?.tagName]) return; if (el.__simOk) return el.__simOk = 0; let w; try { w = el.contentWindow; if (!w || w.__sim || !mine(String(w.location.href)) || w.location.href === 'about:blank') return } catch { return } c.emit('isolationLost', { reason: 'a frame loaded without the sim boot', src: el.getAttribute(AT[el.tagName]) }); el.setAttribute('sandbox', ''); el.srcdoc = '' }, true)
  scan(D); return mode
}
// page-made workers run the same boot (their own realm: sharing, clock as a follower); the real script is imported after it
function workers(S, c, orig = {}) {
  const wrap = (RW, shared) => { const F = function (u, o) { const url = abs(S, u), mod = o && typeof o === 'object' && o.type === 'module', code = c.bootFor ? c.bootFor(url, { worker: 1, mod }) : ''
    const b = (c.wurls ||= {})[url + (mod ? '|m' : '')] ||= URL.createObjectURL(new S.Blob([code + (mod ? `\nimport(${JSON.stringify(url)})` : `\nimportScripts(${JSON.stringify(url)})`)], { type: 'text/javascript' })), w = new RW(b, o); shared || c.followers?.add(w); return w }; F.prototype = RW.prototype; return F }
  return { Worker: (orig.Worker || S.Worker) && wrap(orig.Worker || S.Worker), SharedWorker: (orig.SharedWorker || S.SharedWorker) && wrap(orig.SharedWorker || S.SharedWorker, 1) }
}
hook('realm/workers', S => S, 'Worker', 'value', (o, S, c) => workers(S, c, { Worker: o }).Worker)
hook('realm/workers', S => S, 'SharedWorker', 'value', (o, S, c) => workers(S, c, { SharedWorker: o }).SharedWorker)
hook('realm/popups', S => S, 'open', 'value', (o, S, c) => (u, t) => { const tg = String(t ?? '').toLowerCase(); if (u && ['_self', '_top', '_parent'].includes(tg)) { navTo(S, abs(S, u)); return S } c.emit('popupBlocked', { url: String(u ?? '') }); return null })
hook('realm/serviceWorker', S => S.navigator, 'serviceWorker', 'get', (o, S, c) => Object.assign(deny(S, c, 'serviceWorker', ['register'], ['addEventListener', 'removeEventListener', 'startMessages']), { controller: null, ready: new S.Promise(() => {}), getRegistration: () => S.Promise.resolve(undefined), getRegistrations: () => S.Promise.resolve([]) }))
// target=_blank links and forms are popups too
const popupLinks = (S, c) => S.addEventListener('click', e => { const a = e.target?.closest?.('a[href],area[href]'); if (!a || e.button) return; const tg = (a.getAttribute('target') || '').toLowerCase(); if ((tg === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey) && get(c.L, 'realm/popups', 'block') === 'block') { e.preventDefault(); c.emit('popupBlocked', { url: a.href }) } }, true)

hook('realm/workers', S => S, 'importScripts', 'value', (o, S) => (...a) => o.apply(S, a.map(u => abs(S, u))))   // blob workers: relative urls against the real script url

// ---- ops: what a realm can be asked to do. One table serves direct calls (iframe) and messages (tab, worker) ----
const fire = (S, n, t, i) => { const C = /^key/.test(t) && S.KeyboardEvent || /^(click|dblclick|mouse|contextmenu)/.test(t) && S.MouseEvent || S.Event; n.dispatchEvent(new C(t, { bubbles: true, cancelable: true, ...i })) }
const setVal = (S, n, v, evs) => { n.value = v; evs.forEach(t => fire(S, n, t)) }
const DOM = {                                               // [needs a node]: act (result is !!node) or read (result is the value)
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
  if (DOM[a.op]) return n ? (DOM[a.op](S, n, a), true) : false; if (READ[a.op]) return n ? READ[a.op](n, a) : a.op === 'visible' ? false : null
  throw Error('unknown dom op: ' + a.op)
}
const OPS = {
  ping: () => 'pong', eval: (a, S) => (0, S.eval)(String(a.code)), app: (a, S) => S.__app?.run ? S.__app.run(a.code) : Promise.reject(Error('no bridge (see report().bridge)')), dom: (a, S) => dom(S, a),
  state: (a, S, c) => c.state(), logs: (a, S, c) => ({ logs: c.logs.slice(a.from | 0), errs: c.errs.slice(a.errFrom | 0) }), clear: (a, S, c) => (c.logs.length = c.errs.length = 0, true),
  time: (a, S, c) => { const read = ['state', 'now', 'perf', 'pending'].includes(a.op), t = S.__simTime || (read ? null : c.clock({ speed: a.op === 'advance' ? 0 : 1 }))
    if (!t) return a.op === 'now' ? S.Date.now() : a.op === 'perf' ? S.performance.now() : a.op === 'pending' ? 0 : null; if (typeof t[a.op] !== 'function') throw Error('unknown time op: ' + a.op); return t[a.op](a.ms) },
  nav: (a, S, c) => load(S, c, { win: S }, a.url, a.init).then(() => a.url), set: (a, S, c) => { c.L = a.L; c.followers.forEach(f => { try { f.postMessage ? f.postMessage({ __simL: a.L }) : (f.contentWindow?.__sim && (f.contentWindow.__sim.c.L = a.L)) } catch {} }); c.emit('config', a.L); return true }
}
// ---- messages: { id, op, args } -> { id, ok, value | error }. A pipe is { send(m), on(f), close() } ----
const pipeOf = x => x?.send && x.on ? x : { send: m => x.postMessage(m), on: f => (x.onmessage = e => f(e.data), () => { x.onmessage = null }), close: () => x.terminate?.() }   // a Worker, or your own { send, on, close }
const serve = (S, c, send) => m => { if (!m || !m.op || m.id == null) return; Promise.resolve().then(() => OPS[m.op] ? OPS[m.op](m.args || {}, S, c) : Promise.reject(Error('unknown op: ' + m.op))).then(v => send({ id: m.id, ok: 1, value: v }), e => send({ id: m.id, ok: 0, error: String(e?.message || e) })) }
// host side: one call path for every op: direct (iframe) or over a pipe; timeout, retry, abort, metrics, 'op' event
function call(n, op, args = {}, o = {}) {
  if (n.st.status === 'dead') return Promise.resolve({ ok: 0, error: 'dead' })
  const T = o.timeout ?? get(n.L, 'op/timeout', 15000), tries = (o.retry ?? get(n.L, 'op/retry', 0)) + 1, t0 = Date.now(); n.st.used = t0
  const once = () => n.call ? n.call(op, args) : new Promise((res, rej) => { const id = uid('m'); n.pending.set(id, { res, rej }); try { n.pipe.send({ id, op, args }) } catch (e) { n.pending.delete(id); rej(e) } })
  const go = k => within(once(), T, o.signal || n.ac.signal, op).catch(e => k > 1 && !/aborted|dead/.test(e.message) ? go(k - 1) : Promise.reject(e))
  return go(tries).then(v => (emit(n, 'op', { op, ok: 1, ms: Date.now() - t0 }), { ok: 1, value: v }), e => (emit(n, 'op', { op, ok: 0, ms: Date.now() - t0, error: e.message }), { ok: 0, error: String(e?.message || e) }))
}
const attach = (n, pipe) => { n.pipe = pipe; n.pending = new Map(); const off = pipe.on(m => { if (!m) return; const p = m.id != null && n.pending.get(m.id); if (p) { n.pending.delete(m.id); return m.ok ? p.res(m.value) : p.rej(Error(m.error)) } if (m.ev === 'state') put(n, m.data); else if (m.ev) emit(n, m.ev, m.data); if (m.ev === 'ready') n.st.ready = 1 }); own(n, () => { off?.(); pipe.close() }) }

// ---- realm boot: the same source runs in every sim page, child frame and worker; cfg = { id, L, url, child, worker, state (clock) } ----
function realm(S, cfg) {
  if (S.__sim) return S.__sim
  const isW = !S.document, host = (() => { for (let w = S, g = 0; !isW && w && g < 12; g++) { try { const h = w.__simHost?.[cfg.id]; if (h) return h } catch {} let nx; try { nx = w.parent !== w ? w.parent : w.opener } catch {} if (!nx || nx === w) break; w = nx } return null })()
  const post = m => { try { (isW ? S : S.parent !== S ? S.parent : S.opener)?.postMessage(m, isW ? undefined : '*') } catch {} }
  const L = cfg.L, P = { max: get(L, 'log/max', 2000), keepHead: get(L, 'log/keepHead', 20), clip: get(L, 'log/clip', 8000) }
  const c = { id: cfg.id, L, host, mem: host?.mem || {}, kv: {}, net: { active: 0 }, logs: host?.st.logs || [], errs: host?.st.errs || [], followers: new Set(), child: !!cfg.child,
    origin: (() => { try { const o = S.origin !== 'null' ? S.origin : null; return o || new S.URL(S.document?.baseURI || S.location.href).origin } catch { return '' } })(),
    emit: (t, d) => host ? emit(host, t, d) : post({ ev: t, data: d }), put: p => host ? put(host, p) : post({ ev: 'state', data: p }),
    bootFor: (url, o) => SRC + '(' + JSON.stringify({ ...cfg, L: c.L, child: 1, worker: !!o?.worker, url, state: S.__simTime?.state() || cfg.state }, rxJson) + ')',
    clock: o => { const t = clock(S, { speed: get(c.L, 'time/speed', 1), start: get(c.L, 'time/start', null), offset: get(c.L, 'time/offset', 0), media: get(c.L, 'time/media', true), ...o })
      t.onchange = s => { c.followers.forEach(f => { try { f.postMessage ? f.postMessage({ __simTime: s }) : (f.contentWindow || f).__simTime?.follow(s) } catch {} }); c.put({ time: s }) }; c.put({ time: t.state() }); return t },
    state: () => ({ ...(host?.st || {}), url: S.location?.href, net: c.net.active, bridge: !!S.__app?.run, time: S.__simTime?.state() || null, logs: c.logs.length, errs: c.errs.length }) }
  if (isW) S.__simBase = cfg.url
  capture(S, c.logs, c.errs, P)
  if (cfg.clock || cfg.state) c.clock(cfg.state ? { state: cfg.state } : {})
  S.addEventListener?.('message', e => { const d = e.data; if (d?.__simTime || d?.__simL) { e.stopImmediatePropagation(); d.__simTime ? S.__simTime?.follow(d.__simTime) : c.L = d.__simL } }, true)   // workers: the app never sees these
  const api = S.__sim = { ready: 1, c, hooks: install(S, c, hooks.concat(host?.hooks || [])), call: (op, a) => Promise.resolve().then(() => OPS[op] ? OPS[op](a || {}, S, c) : Promise.reject(Error('unknown op: ' + op))) }
  if (!isW) { api.nav = vnav(S, c); api.frames = vframes(S, c); popupLinks(S, c); if (!cfg.child) { S.addEventListener('load', () => c.put({ status: 'ready' })) } }
  if (!host && !cfg.child) { const h = serve(S, c, post); S.addEventListener('message', e => h(e.data)); post({ ev: 'ready' }) }   // tab / worker: driven over messages
  return api
}
let SRC = ''                                                                                   // set by the factory wrapper: '(' + SIMF.toString() + ')'

// ---- make: a sim = a node here + a realm there. runtime: 'iframe' (default) | 'tab' | 'worker' ; src = a plain frame (nothing injected) ----
const G = globalThis, hostReg = () => (G.__simHost ||= {})
const sandboxOf = L => { const s = get(L, 'page/sandbox', 'auto'); return s === 'auto' ? 'allow-scripts allow-same-origin allow-forms' + (get(L, 'realm/popups', 'block') === 'allow' ? ' allow-popups' : '') : s }
const relayer = n => { n.L = [n.own, ...[...n.tags].reverse().map(t => tags[t] || {}), defaults] }
const specOf = s => typeof s === 'function' ? specOf(s()) : typeof s === 'string' ? (/^\s*</.test(s) ? { html: s } : { url: s }) : { ...s }
const NOT_SETTINGS = ['html', 'url', 'src', 'base', 'code', 'edit', 'prepend', 'append', 'readyFor', 'id', 'tags', 'replace', 'runtime', 'width', 'height', 'node', 'doc', 'fn'], settingsOf = o => Object.fromEntries(Object.entries(o).filter(([k]) => !NOT_SETTINGS.includes(k)))
const rxJson = (k, v) => v instanceof RegExp ? v.source : v                                   // settings go to realms as JSON
async function makeSim(spec, here) {
  spec = specOf(spec); if (here !== root && !get(here.L || [], 'nest', true)) throw Error('nested sims are off (nest: false)')
  if (spec.id && here.kids.has(spec.id)) { if (spec.replace) kill(here.kids.get(spec.id), 'replaced'); else throw Error('id in use: ' + spec.id) }
  const n = node('sim', here, spec.id); n.tags = spec.tags || []; n.own = tree(settingsOf(spec), defaults, n.tags[0] || 'own'); relayer(n); n.routes = []; n.hooks = [...extraHooks]; n.mem = {}; n.spec = spec
  Object.assign(n.st, { logs: [], errs: [], navs: 0, load: null, bridge: null, editErrors: [] }); hostReg()[n.id] = n; own(n, () => delete hostReg()[n.id])
  own(n, () => get(n.L, 'keep', false) ? null : drop(G, pre('s', n.id)).then(d => put(n, { dropped: d })))
  const rt = spec.runtime || 'iframe', T = get(n.L, 'op/readyTimeout', 20000); let html = spec.html, url = spec.url ? abs(G, spec.url) : spec.base || null
  try {
    if (spec.url && html == null && rt !== 'worker') { try { const r = await loadUrl(url, n.L); html = r.html; put(n, { load: { ...r, html: undefined, bytes: r.html.length } }) } catch (e) { put(n, { load: { url, via: 'src', kind: e.kind, error: e.message, errors: e.errors } }); spec.src = url } }
    const cfg = { id: n.id, L: n.L, url, clock: n.L.slice(0, -1).some(t => t.time != null) }, boot = () => SRC + '(' + JSON.stringify(cfg, rxJson) + ')'   // clock from the start when a spec or tag declares time
    if (rt === 'worker') { const w = new G.Worker(URL.createObjectURL(new G.Blob([boot() + (spec.code ? '\n' + spec.code : '') + (spec.url ? '\nimportScripts(' + JSON.stringify(url) + ')' : '')], { type: 'text/javascript' }))); attach(n, pipeOf(w, G)) }
    else {
      const out = spec.src ? null : (ctx => { const h = page(html ?? '', ctx); put(n, { bridge: ctx.bridge, editErrors: ctx.errors }); return h })({ L: n.L, url, boot: boot(), edit: spec.edit, prepend: spec.prepend, append: spec.append })
      let w; if (rt === 'tab') { w = G.open(out == null ? spec.src : URL.createObjectURL(new G.Blob([out], { type: 'text/html' })), '_blank'); if (!w) throw Error('tab blocked by the browser'); own(n, () => { try { w.close() } catch {} }); n.win = () => w }
      else { const f = n.frame = G.document.createElement('iframe'); f.id = n.id; sandboxOf(n.L) && f.setAttribute('sandbox', sandboxOf(n.L)); f.style.cssText = get(n.L, 'page/offscreen', 'position:fixed;left:-12000px;top:0') + `;width:${spec.width || 1024}px;height:${spec.height || 768}px;border:0`
        G.document.body.appendChild(f); own(n, () => f.remove()); out == null ? f.src = spec.src : f.srcdoc = out; n.win = () => f.contentWindow }
      n.call = (op, a) => { const s = n.win()?.__sim; return s ? s.call(op, a) : Promise.reject(Error('page not booted')) }
    }
    const ok = await until(() => { try { return n.st.ready || (n.win && (spec.src ? n.win().document?.readyState === 'complete' : n.win()?.__sim?.ready && n.win().document.readyState === 'complete')) } catch { return spec.src } }, { timeout: T, signal: n.ac.signal })
    put(n, { status: ok ? 'ready' : 'timeout', url }); const api = n.api = simApi(n)
    if (spec.readyFor != null) api.readyForOk = await api.wait(spec.readyFor, { timeout: T }); return api
  } catch (e) { kill(n, 'failed: ' + e.message); throw e }
}
// ---- the sim object: every method returns { ok, value } or { ok: 0, error } and never throws ----
// action shorthands: { click: sel } { type: [sel, v] } … for every dom op, plus eval app navigate speed advance
const SHORT = { eval: v => ['eval', { code: v }], app: v => ['app', { code: v }], navigate: v => ['nav', { url: v }], speed: v => ['time', { op: 'speed', ms: v }], advance: v => ['time', { op: 'advance', ms: v }], dom: v => ['dom', v] }
for (const op of [...Object.keys(DOM), ...Object.keys(READ), 'count']) SHORT[op] = v => ['dom', Array.isArray(v) ? { op, sel: v[0], v: v[1] } : { op, sel: v }]
function simApi(n) {
  const c = (op, a, o) => call(n, op, a, o), T = () => get(n.L, 'op/timeout', 15000)
  const api = { id: n.id, node: n, tags: n.tags,
    do: (a, o) => Array.isArray(a) ? a.reduce((p, x) => p.then(r => api.do(x, o).then(y => [...r, y])), Promise.resolve([])) : typeof a === 'function' ? Promise.resolve().then(() => a(api)).then(value => ({ ok: 1, value }), e => ({ ok: 0, error: e.message }))
      : a.op ? c(a.op, a.args || {}, o) : a.wait != null ? new Promise(r => setTimeout(() => r({ ok: 1 }), a.wait)) : a.waitFor != null ? api.wait(a.waitFor, o).then(v => ({ ok: v ? 1 : 0, value: v })) : a.offline != null ? Promise.resolve(api.offline(a.offline)) : a.log != null ? Promise.resolve({ ok: 1, log: a.log })
      : (k => k ? c(...SHORT[k](a[k]), o) : Promise.resolve({ ok: 0, error: 'unknown action' }))(Object.keys(SHORT).find(k => a[k] != null)),
    eval: (code, o) => c('eval', { code }, o), app: (code, o) => c('app', { code }, o), script: (u, o) => text(abs(G, u)).then(code => c('eval', { code }, o), e => ({ ok: 0, error: e.message })), appScript: (u, o) => text(abs(G, u)).then(code => c('app', { code }, o), e => ({ ok: 0, error: e.message })), dom: (op, sel, a, o) => c('dom', { op, sel, ...a }, o), navigate: (url, init, o) => c('nav', { url, init }, o),
    state: () => c('state'), report: () => ({ ...n.st, logs: n.st.logs.length, errs: n.st.errs.length, hooks: n.win?.()?.__sim?.hooks }), logs: () => n.st.logs.slice(), errs: () => n.st.errs.slice(), clear: () => { n.st.logs.length = n.st.errs.length = 0 },
    route: (p, fn, o) => n.routes[n.routes.push(routeRow('http', p, fn, o)) - 1].id, routeWs: (p, fn, o) => n.routes[n.routes.push(routeRow('ws', p, fn, o)) - 1].id, routeSse: (p, fn, o) => n.routes[n.routes.push(routeRow('sse', p, fn, o)) - 1].id,
    unroute: id => { n.routes = n.routes.filter(r => id != null && r.id !== id) },
    time: Object.fromEntries(['speed', 'pause', 'resume', 'advance', 'set', 'shift', 'now', 'perf', 'pending', 'state'].map(op => [op, ms => c('time', { op, ms })])),
    set: t => { n.own = mix(n.own, tree(t, defaults, n.tags[0] || 'own')); relayer(n); return c('set', { L: n.L }) }, offline: v => api.set({ net: { offline: !!v } }), hook: (...row) => n.hooks.push(row),
    wait: (cond, o = {}) => until(typeof cond === 'function' ? () => cond(api) : typeof cond === 'string' ? () => c('eval', { code: '!!(' + cond + ')' }).then(r => r.ok && r.value) : cond?.app != null ? () => c('app', { code: '!!(' + cond.app + ')' }).then(r => r.ok && r.value) : () => String(cond.state).split('.').reduce((x, k) => x?.[k], n.st) === cond.is, { timeout: o.timeout ?? T(), every: o.every, signal: n.ac.signal }),
    idle: o => { let q0 = Date.now(); return until(() => c('state').then(r => r.ok && !r.value.net ? Date.now() - q0 >= (o?.quiet ?? 200) : (q0 = Date.now(), false)), { timeout: o?.timeout ?? T(), every: 60, signal: n.ac.signal }) },
    on: (t, f) => on(n, t, f), win: () => n.win?.(), doc: () => { try { return n.win?.()?.document } catch { return null } }, el: s => api.doc()?.querySelector(s) ?? null, all: s => [...(api.doc()?.querySelectorAll(s) || [])],
    make: spec => makeSim(spec, n), kill: why => (kill(n, why), n.done) }   // resolves when the cleanup (storage drop included) is done
  for (const op of [...Object.keys(DOM), ...Object.keys(READ), 'count']) if (!(op in api)) api[op] = (sel, v, o) => api.dom(op, sel, v && typeof v === 'object' && !Array.isArray(v) ? v : { v }, o)   // s.click(sel) s.type(sel, text) s.text(sel) …
  return api
}
// ---- SIM: the host API ----
const VERSION = '6.3.1'
const sel = (x, from = root) => x == null ? [...from.kids.values()] : x?.node ? [x.node] : x?.st ? [x] : Array.isArray(x) ? x.flatMap(y => sel(y, from)) : all(from).filter(k => x instanceof RegExp ? x.test(k.id) : typeof x === 'function' ? x(k.api || k) : k.id === x)
async function sweep(o = {}) {                                // leftovers of sims that are gone (a crash, a reload): every '~s<id>~' prefix with no live sim
  const live = new Set(all(root).map(k => pre('s', k.id))), found = new Set(), add = k => { const m = /^~s[^~]*~/.exec(String(k)); m && !live.has(m[0]) && found.add(m[0]) }
  for (let i = 0; i < G.localStorage.length; i++) add(G.localStorage.key(i)); String(G.document?.cookie || '').split(/;\s*/).forEach(x => add(x.split('=')[0]))
  try { (await G.indexedDB.databases()).forEach(d => add(d.name)) } catch {} try { (await G.caches.keys()).forEach(add) } catch {} try { for await (const k of (await G.navigator.storage.getDirectory()).keys()) add(k) } catch {}
  if (!o.dryRun) for (const p of found) await drop(G, p); return [...found]
}
const SIM = { VERSION, defaults, tags, tag, hook: (...row) => extraHooks.push(row), root, node: root,
  make: spec => makeSim(spec, root), get: id => find(root, id)?.api ?? null, ids: () => [...root.kids.keys()], all: () => all(root).map(k => k.api).filter(Boolean),
  kill: (x, why) => sel(x).filter(k => kill(k, why)).length, purge: () => { const ks = sel(null).filter(k => kill(k, 'purge')); return Promise.all(ks.map(k => k.done)).then(() => ks.length) }, on: (t, f) => on(root, t, f),
  drop: g => drop(G, pre('g', g)), sweep, report: () => all(root).map(k => k.api?.report() || k.st), stats: () => ({ version: VERSION, sims: root.kids.size, nodes: all(root).length, hooks: hooks.length + extraHooks.length, tags: Object.keys(tags) }),
  util: { json: (o, status = 200) => ({ status, headers: { 'content-type': 'application/json' }, body: o }), text: (t, status = 200) => ({ status, body: t }), sse: f => ({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: f.map(x => x === '[DONE]' ? 'data: [DONE]\n\n' : typeof x === 'string' ? (/^data:/.test(x) ? x.replace(/\n*$/, '\n\n') : 'data: ' + x + '\n\n') : 'data: ' + JSON.stringify(x) + '\n\n').join('') }), sleep: ms => new Promise(r => setTimeout(r, ms)), until, get }
}

SIM.readme = [
  "SIM v6.3.1 — hand-over notes. SIM.help('topic' | number) prints one section.",
  "",
  "0. WHAT: load an app page into a box you control: run code in it (global scope or inside the app's closure), drive",
  " it, fake its world (network, time, storage), edit it before it runs, watch it, run many, kill cleanly. Nothing",
  " touches your real data unless a share rule says so. Every method returns { ok, value } | { ok: 0, error }, never",
  " throws; make() rejects only for a bad spec (a readiness timeout gives status 'timeout'). One sloppy-JS function",
  " (SIMF) runs in every realm (host page, sim page, child frame, worker); its cfg says which. Built to be edited:",
  " niche cases are yours (9). Dropped from v5 on purpose: record/replay, metrics, panel, expect, the console-adapter",
  " fallback for appEval, IndexedDB seeding, quotas, cross-machine control, hostile-escape hardening.",
  "",
  "1. QUICK",
  " const s = await SIM.make({ url: 'ai_chat.html', time: { speed: 10 }, tags: ['exp1'] })",
  " await s.app('typeof someClosureVar')     // inside the app's main IIFE (the bridge)",
  " await s.eval('document.title')           // global scope",
  " s.route(/api\\./, (url, q) => SIM.util.json({ ok: 1 }))",
  " await s.do([{ type: ['#in', 'hi'] }, { click: '#send' }, { waitFor: '!!document.querySelector(\".reply\")' }])",
  " s.report(); s.logs(); s.kill()           // SIM.purge() kills everything",
  "",
  "2. SETTINGS: one JSON tree, layered: spec > its tags (a later tag wins) > SIM.defaults > a magic value in code.",
  " get('a/b/c') = the deepest declared value (a/b/c ?? a/b ?? a), per layer. A node is a value or an object whose",
  " `self` is its own value; keys: exact | '*' | '~regex'; 'a/b': v is a shortcut. An explicit false / 0 stops the",
  " chain. Plain objects are trees; a Map, RegExp, Date, or an object where the defaults declare a leaf (net/proxy) is",
  " a value. SIM.tag(name, tree); spec.tags; s.set(tree) on a live sim (frames and workers follow). Top keys: share",
  " store keep time net page realm log op nest.",
  "",
  "3. SHARING: every named thing (kinds local session cookie idb cache lock channel worker opfs) resolves",
  " share/<kind>/<name> -> 'own' (real name ~s<id>~name) | 'real' | 'group' (this tag's group) | '<name>' (a group,",
  " ~g<name>~name). Listing, storage events and cleanup read the prefix back; other sims' data stays invisible.",
  "   { share: { self: 'own', local: { apiKey: 'real', '~^draft_': 'own' }, 'idb/chatDB': 'real' } }",
  "   SIM.tag('exp', { share: { self: 'group' } })   // sims tagged exp share everything under ~gexp~",
  " store/<kind>: 'real' (default) | 'memory' (a host Map, fresh each run; no storage events). keep: true leaves own",
  " data after kill. kill drops ~s<id>~*; SIM.drop(group); SIM.sweep() drops prefixes of sims that are gone (kept",
  " data too: use a group for data that must outlive sims). A sim's frames and workers share its prefix.",
  "",
  "4. NETWORK (fetch, XHR, WebSocket, EventSource, sendBeacon): one decision, offline | route | proxy | pass.",
  " s.route(pattern, (url, q) => reply, { method, times, delay }); pattern: substring | RegExp | fn | null (all).",
  " q = { url, method, headers (lower-case), body, input, init }. reply: string | { status, headers, body, delay } |",
  " Response | a promise; an object body is JSON. SIM.util.json(o, status) text(t, status) sse([frames]). A delay runs",
  " on the sim clock; sync XHR needs a reply without delay. s.routeWs(pattern, (url, peer) => …): peer.send close(code,",
  " reason) fail() on('open'|'message'|'close', fn) received[]; return false to refuse. s.routeSse(pattern, () =>",
  " 'event: x\\ndata: 1\\n\\n') (one-shot). s.offline(bool). s.idle({ quiet }). unroute() with no id removes every route. Routes and the proxy do not apply inside workers (no host there): only net/offline does. Loading a url: direct, then net/proxy",
  " ('https://p/?url=' | { url, getOnly, name } | list) as a race started net/proxyStagger ms apart; net/proxyMode",
  " 'always'; net/proxyRequests 'auto' (the page's cross-origin requests use the winning proxy) | true | false.",
  " report().load = { via: direct|proxy|src, proxy, errors, kind: cors|offline|unreachable }.",
  "",
  "5. TIME: one engine per realm; the sim page owns it, frames and workers follow. Monotonic clock (timers,",
  " performance.now, rAF, event.timeStamp) + wall clock (Date, new Date()) = mono + offset. time: { speed (0 =",
  " paused), start, offset, media }. s.time.speed(x) pause() resume() advance(ms) set(date) shift(ms) now() state(); reads never install it.",
  " Media (audio/video, animations, Web Audio) follow the speed. Lazy: the first time call installs it (advance ->",
  " paused); the reads now() state() pending() perf() never do. It survives navigation. Declaring time in a spec or tag (even speed 1) starts the clock at boot. s.set({ time }) before the clock starts applies to it. s.kill() resolves after cleanup.",
  "",
  "6. PAGE: fetched through the sim's own network, then the steps: edit (yours: [find, replace] | fn(html, info) |",
  " list), fixes (page/csp 'strip', page/rocketLoader 'undo', meta refresh made virtual), bridge (window.__app.run",
  " after the first IIFE opening of an inline script, past \"use strict\"; page/bridgePatterns, page/bridgeCode), base,",
  " head (boot + prepend), tail (append). prepend / append: code | { src } | { html } | list. Same steps on every",
  " navigation; child frames get fixes and boot only. report().bridge: ok | missing | off; report().editErrors.",
  "",
  "7. REALM: realm/navigation 'virtual' (the Navigation API makes links, forms, location changes, meta refresh and",
  " history virtual: the page reloads itself with the boot) | 'block' | 'allow'. realm/frames 'boot' | 'block' |",
  " 'allow'. realm/workers 'boot'. realm/popups 'block' (window.open, target=_blank). realm/serviceWorker 'block'.",
  " realm/cookieStore 'block' (it would bypass the cookie face). Only normal paths are covered. Runtimes: iframe",
  " (default; s.win() doc() el(sel) all(sel)), tab ({ runtime: 'tab' }), worker ({ runtime: 'worker', code, url }, no",
  " DOM), src ({ src: url }: a plain frame, nothing injected, only report()). page/sandbox 'auto'.",
  "",
  "8. DRIVE AND WATCH: s.eval(code) app(code) script(url) appScript(url) dom(op, sel, { v }) and one method per dom",
  " op: click(sel) type(sel, text) press(sel, key) select(sel, v) focus blur submit scroll dispatch(sel, type)",
  " remove text value checked html attr(sel, name) (the dom op 'clear' is s.dom('clear', sel); s.clear() clears the logs) count visible; navigate(url, init) wait(cond, { timeout }) idle()",
  " do(action | list | fn). cond: 'expr' | { app: 'expr' } | { state: 'status', is: 'ready' } | fn(s). Actions: { op,",
  " args } or { <domOp>: sel | [sel, v], eval, app, navigate, speed, advance, wait: ms, waitFor, offline, log }.",
  " Every op takes { timeout, retry, signal } (op/timeout, op/retry). s.report() = the host's state (status url navs",
  " load bridge time logs errs hooks); s.state() asks the realm. s.logs() / s.errs(): console and errors from the",
  " first script on, kept across navigations (log: { max, keepHead, clip }). Events bubble: s.on / SIM.on(type,",
  " fn(data, node)): state load kill op config popupBlocked navigationBlocked frameBlocked serviceWorkerBlocked",
  " isolationLost navigateError frameError. SIM: make get ids all kill(id | RegExp | fn | list) purge on tag hook drop",
  " sweep report stats defaults util. Nested: s.make(spec); nest: false turns it off.",
  "",
  "9. EXTEND: SIM.hook(setting, S => target, key, how, (orig, S, c) => replacement) adds a realm patch (how: value |",
  " get | accessor | absent; the setting gates it, null = always); s.hook(...) for one sim. Tables: STEPS (page), OPS",
  " (realm ops), DOM / READ (dom ops), hooks (patch rows), SHORT (actions). Mechanisms, each written once: get ·",
  " clock · node own kill · page · install patch shell deny · where kv · decide reply · load · realm · call. SIM._ has them."
].join('\n')
SIM.help = t => { let x = SIM.readme; if (t != null) { const q = String(t).toLowerCase(), ps = x.split(/\n(?=\d+\. )/), h = ps.filter(s => /^\d+$/.test(q) ? s.startsWith(q + '.') : s.split('\n')[0].toLowerCase().includes(q)); x = (h.length ? h : ps.filter(s => s.toLowerCase().includes(q))).join('\n') || 'no section matches: ' + t } try { console.log(x) } catch {} return x }
// ---- boot: the same source runs here and in every realm; cfg = a realm's config, or nothing for the page that loads SIM ----
SRC = '(' + SIMF.toString() + ')'
if (cfg && cfg.id) realm(G, cfg)
else if (G.SIM?.VERSION === VERSION && G.SIM.src === SRC) return G.SIM; else try { G.SIM?.purge?.() } catch {}
SIM._ = { tree, get, mix, layers, clock, node, own, on, emit, put, kill, find, all, within, until, sink, capture, str, page, STEPS, tagsOf, spliceHead, patch, hooks, install, shell, deny, loadUrl, raceProxies, viaProxy, where, seen, kv, drop, routeRow, decide, parts, load, vhistory, vnav, vframes, workers, popupLinks, dom, OPS, pipeOf, serve, call, attach, realm, makeSim, simApi }
SIM.src = SRC; G.SIM = SIM; G.addEventListener?.('pagehide', () => SIM.purge())
if (typeof module !== 'undefined') module.exports = SIM
return SIM
})()
