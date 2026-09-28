/* ============================================================
   EVAL1 v5.0.7 — 96claudeeditB12: 96claudeeditB11 + the Exp tab rebuild (__eval1._rebuildExpTab) keeps the
   "auto update source" row.
   B11 was 96claudeeditB10 + (temporary, until pricing V2) a schedule state named "peak" or
   "discount" is that kind by its name, and a state whose prices all equal off-peak is neither (not red, no countdown);
   the tool-block font falls back to the app's own default font scale, not a written 0.5.
   B10 was 96claudeeditB9 + the 0.8 code font is set only while the setting equals the app's own
   default (read from the app, not a written 0.5), a tool round that reported no usage marks the message cost "+" (not
   for a free model: every price explicitly 0), disable() wording says "nearly".
   B9 was 96claudeeditB8 + the grey tool_eval_1 hint back in an empty Name override box (visual
   only: empty stays empty = off).
   B8 was 96claudeeditB7 + the cost estimate row can be changed only with Riskier and technical
   on (greyed otherwise), Name override is real text (no grey ghost text; empty = off).
   B7 was 96claudeeditB6 + the rest of 22d: cost estimate before send (off by default; over
   the limit the send is held with a popup, the same request sent again goes out), old configs without the collapse
   switch worked out, auto tools read toolBatch for messages without metadata.tools, an empty Name override (switch off)
   shows tool_eval_1 (undone in B8).
   B6 was 96claudeeditB5 + paste rule (a paste replaces only an equal or older running
   build; three true/false gates to tailor it), provider migration run separately for memory and local storage, stream
   buffer size cap with per-entry checks, tool limit 0 shown orange, Name override prefilled (off), readme (__eval1.help()).
   B5 was 96claudeeditB3 + Agentic tools default auto, Stop before the reply finished marks it stopped (text kept), /models greying with the model pick kept in RAM, font-scale restore. B3 was 96claudeeditB1 simplified. Same pricing engine; the rest rebuilt
   around one install list (disable() takes everything back, a new paste starts clean), one fetch
   wrapper, one settings table behind the Exp tab, tool auto mode as a live per-request choice
   (cache hit), mocked tool names routed to the real tool, and a working stream-buffer tidy-up.
   Paste into eval console of a freshly loaded page.
   Sections:
     PRICING · CORE · INSTALL · FETCH (bridges, coalescer) · PRICING view · TOOLS · AGENTIC
     · MARKED · UI · STYLES · EXP TAB · PANEL LAYOUT · API + BOOT · BALANCE · SEAL
     · PROVIDER DEFAULTS · HOST INTEGRATION · STREAM BUFFER · APPLY · ESTIMATE · README
   ============================================================ */
(() => {

/* ============================ CORE ============================ */
const VERSION = '5.0.7';
/* ===== PASTE RULE — replace the running build only if it is the same version or older =====
   Tailor it by editing the three trues. A build turned off by disable() counts as nothing running. */
const older = (a, b) => { const x = String(a).split('.'), y = String(b).split('.');   /* a <= b, numeric parts; unreadable → true */
  for (let i = 0; i < Math.max(x.length, y.length); i++){ const p = +(x[i] || 0), q = +(y[i] || 0); if (isNaN(p) || isNaN(q)) return true; if (p !== q) return p < q; }
  return true; };
{ const cur = window.__eval1;
  if (cur && typeof cur.disable === 'function' && cur.installed !== false && cur.off !== true){
    let swap = false;
    if (true){                                     /* false = never replace */
      if (true){                                   /* false = skip the check below: always replace */
        if (true) swap = older(cur.version, VERSION);   /* false = the check fails: never replace */
      } else swap = true;
    }
    if (!swap){ console.warn('[eval1] v' + cur.version + ' stays: this paste (v' + VERSION + ') does not replace it'); return; }
  } }
/* Built-in DeepSeek provider, single source (= providerdeepseek1.json + the expiring model from image5.js + the demo eval). Used for the engine tables,
   the provider-defaults migration and the provider-JSON pricing mirror. */
const DS_PROVIDER = {
  "id": "deepseek",
  "name": "DeepSeek",
  "source": "default",
  "sched": [
    { "kind": "week", "days": [1,2,3,4,5], "from": 3600000,  "to": 14400000, "state": "peak" },
    { "kind": "week", "days": [1,2,3,4,5], "from": 21600000, "to": 36000000, "state": "peak" }
  ],
  "baseURL": "https://api.deepseek.com",
  "apiPath": "/chat/completions",
  "authHeader": "Bearer",
  "defaultModel": "deepseek-flash",
  "maxTokensParam": "max_tokens",
  "systemRole": "system",
  "supportsStreamUsage": true,
  "usageProfile": "openai",
  "usageFamily": "chat",
  "balance": { "path": "/user/balance", "parse": ["balance_infos", 0, "total_balance"], "mode": "balance", "currency": "USD" },
  "eval": "globalThis.sessionDeepseekMessageCounter = (globalThis.sessionDeepseekMessageCounter ?? 0) + 1;",
  "fallbackModels": {
    "deepseek-flash": {
      "id": "deepseek-flash", "maxTokens": 384000, "contextTokens": 1000000, "outputTokens": 384000, "temperature": 1,
      "request": { "thinking": { "type": "enabled" }, "reasoning_effort": "max" },
      "pricing": { "inputCacheHit": 6e-9, "inputCacheMiss": 3e-7, "output": 1.2e-6 },
      "rates": {
        "legacy": { "inputCacheHit": 3e-9, "inputCacheMiss": 1.5e-7, "output": 6e-7 },
        "off":    { "inputCacheHit": 3e-9, "inputCacheMiss": 1.5e-7, "output": 6e-7 },
        "peak":   { "inputCacheHit": 6e-9, "inputCacheMiss": 3e-7, "output": 1.2e-6 }
      }
    },
    "deepseek-v4-flash": {
      "id": "deepseek-v4-flash", "maxTokens": 384000, "contextTokens": 1000000, "outputTokens": 384000, "temperature": 1,
      "request": { "thinking": { "type": "enabled" }, "reasoning_effort": "max" },
      "pricing": { "inputCacheHit": 6e-9, "inputCacheMiss": 3e-7, "output": 1.2e-6 },
      "rates": {
        "legacy": { "inputCacheHit": 3e-9, "inputCacheMiss": 1.5e-7, "output": 6e-7 },
        "off":    { "inputCacheHit": 3e-9, "inputCacheMiss": 1.5e-7, "output": 6e-7 },
        "peak":   { "inputCacheHit": 6e-9, "inputCacheMiss": 3e-7, "output": 1.2e-6 }
      }
    },
    "deepseek-v4-flash-vision-exp": {
      "id": "deepseek-v4-flash-vision-exp", "maxTokens": 384000, "contextTokens": 1000000, "outputTokens": 384000, "temperature": 1,
      "request": { "thinking": { "type": "enabled" }, "reasoning_effort": "max" },
      "pricing": { "inputCacheHit": 6e-9, "inputCacheMiss": 3e-7, "output": 1.2e-6 },
      "rates": {
        "legacy": { "inputCacheHit": 3e-9, "inputCacheMiss": 1.5e-7, "output": 6e-7 },
        "off":    { "inputCacheHit": 3e-9, "inputCacheMiss": 1.5e-7, "output": 6e-7 },
        "peak":   { "inputCacheHit": 6e-9, "inputCacheMiss": 3e-7, "output": 1.2e-6 }
      }
    },
    "deepseek-v4-pro": {
      "id": "deepseek-v4-pro", "maxTokens": 384000, "contextTokens": 1000000, "outputTokens": 384000, "temperature": 1,
      "request": { "thinking": { "type": "enabled" }, "reasoning_effort": "max" },
      "pricing": { "inputCacheHit": 4.4e-8, "inputCacheMiss": 1.32e-6, "output": 3.96e-6 },
      "rates": {
        "legacy": { "inputCacheHit": 3.625e-9, "inputCacheMiss": 4.35e-7, "output": 8.7e-7 },
        "off":    { "inputCacheHit": 2.2e-8,   "inputCacheMiss": 6.6e-7,  "output": 1.98e-6 },
        "peak":   { "inputCacheHit": 4.4e-8,   "inputCacheMiss": 1.32e-6, "output": 3.96e-6 }
      }
    },
    "deepseek-v4.1-flash-expires-on-0910": {
      "id": "deepseek-v4.1-flash-expires-on-0910", "maxTokens": 384000, "contextTokens": 1000000, "outputTokens": 384000, "temperature": 1,
      "request": { "thinking": { "type": "enabled" }, "reasoning_effort": "max" },
      "pricing": { "inputCacheHit": 7e-9, "inputCacheMiss": 2.2e-7, "output": 6.6e-7 },
      "rates": {
        "legacy": { "inputCacheHit": 2.8e-9, "inputCacheMiss": 1.4e-7, "output": 2.8e-7 },
        "off":    { "inputCacheHit": 7e-9,   "inputCacheMiss": 2.2e-7, "output": 6.6e-7 },
        "peak":   { "inputCacheHit": 1.4e-8, "inputCacheMiss": 4.4e-7, "output": 1.32e-6 }
      }
    }
  },
  "windows": [[1,4],[6,10]],
  "epoch": 1789012800000
};
/* built-in schedules, keyed by provider id — only from the migration JSON above */
const DATA_SCHED = { [DS_PROVIDER.id]: DS_PROVIDER.sched };
/* ===== PRICING RULES — values the pricing code reads from the provider JSON. pricingRule(name,
   provider): the provider's live JSON wins ("pricingRules": { name: value }; for 'epoch' also its
   own "epoch" field), otherwise the default below. No epoch default: legacy rates only with a JSON epoch. ===== */
const PRICING_RULE_DEFAULTS = {
  schedWhenMissing: (p, id) => !!DATA_SCHED[id],     // a provider without "sched" uses its built-in schedule, if it has one
  defaultSched: (p, id) => id,                       // "default" = the provider's own built-in schedule
  netBy: 'output',                                   // price field compared (current ÷ off) for peak/discount
  peakFactorFallback: 2                              // net assumed for a 'peak' message saved without one
};
function pricingRule(name, p, id){
  const own = p && p.pricingRules ? p.pricingRules[name] : undefined;
  if (own !== undefined) return own;
  if (name === 'epoch' && p && p.epoch != null) return p.epoch;
  const d = PRICING_RULE_DEFAULTS[name];
  return typeof d === 'function' ? d(p, id != null ? id : (p && p.id)) : (d && typeof d === 'object' ? clone(d) : d);
}
/* ============================ PRICING CORE ============================ */
/* In words: a request's price = the app's own "pricing", overlaid by "rates.off", overlaid by the rates of
   the state the schedule says is active (the costliest when several are), times the active scalars; before
   "epoch" the "legacy" rates apply. The next change is the first schedule edge where that price differs.
   Every input comes from the request settings the app itself builds (run(): provider → model → agent,
   merged), so the same rule works at every level, for every provider and model form, and a model without
   "rates" simply keeps the app's own price. Nothing is copied or written. */
const scheduleOf = r => {
  const s = r.sched, pid = r.p && r.p.id;
  const n = s === 'default' || (s == null && pricingRule('schedWhenMissing', r, pid)) ? pricingRule('defaultSched', r, pid) : s;
  return Array.isArray(n) ? n : (typeof n === 'string' && DATA_SCHED[n]) || [];
};
const PDAY = 864e5, PWEEK = 7 * PDAY, wpos = ts => ((ts + 4 * PDAY) % PWEEK + PWEEK) % PWEEK;   // 1970-01-01 = Thursday; week starts Sunday 00:00 UTC
const isNum = x => typeof x === 'number' && isFinite(x);
/* schedule entry → plain time ranges [from, to) near ts: weekly entries for weeks −1..+2 (each day's range ends at
   midnight), yearly ones for years −1..+2, 'once' as given; non-numeric or empty ranges are skipped */
const spans = (e, ts) => { const W = ts - wpos(ts), Y = new Date(ts).getUTCFullYear(), K = [-1, 0, 1, 2];
  return (e.kind === 'once' ? [[e.from, e.to]] :
    e.kind === 'year' ? K.map(k => { const t = Date.UTC(Y + k, e.mon, e.day); return [t + (e.from || 0), t + (e.to || PDAY)]; }) :
    K.flatMap(k => [].concat(e.days ?? []).map(d => { const t = W + k * PWEEK + d * PDAY; return [t + e.from, t + Math.min(e.to, PDAY)]; }))
  ).filter(([a, b]) => isNum(a) && isNum(b) && a < b); };
/* a price field: the table's own, else its first size tier's (the app's biller lets top-level fields win too) */
const fv = (t, k) => t ? (t[k] != null ? t[k] : Array.isArray(t.tiers) && t.tiers[0] ? t.tiers[0][k] : undefined) : undefined;
const costGuess = t => (fv(t, 'inputCacheMiss') || 0) + (fv(t, 'output') || 0);
/* a copy of the table with every scalar applied (a number scales all prices, an object the fields it names);
   size tiers are scaled the same way, one level deep, their minInput untouched */
const scaleTable = (t, xs) => xs.reduce((o, s) => {
  const sc = x => { const r = {}; Object.keys(x).forEach(k => { const f = typeof s === 'number' ? s : (s && s[k] != null ? s[k] : 1); r[k] = typeof x[k] === 'number' && k !== 'minInput' ? x[k] * f : x[k]; }); return r; };
  const r = sc(o); if (Array.isArray(o.tiers)) r.tiers = o.tiers.map(x => x && typeof x === 'object' ? sc(x) : x); return r; }, Object.assign({}, t));
/* the one price function, for request settings r (from run()) at time ts: price table, the off table,
   bucket, scalars, conflict, net (vs off), next price change, and which kinds of change the schedule has */
function priceState(r, ts){
  ts = ts || Date.now();
  const pid = r.p && r.p.id, R = r.rates || {}, off = Object.assign({}, r.pricing, R.off), at = st => Object.assign({}, off, R[st]);
  const ep = pricingRule('epoch', r, pid), nb = pricingRule('netBy', r, pid), o = fv(off, nb);
  const kinds = { peak:false, discount:false }, list = [];
  /* TEMPORARY until pricing V2: a state named "peak" / "discount" is that kind by its name; a state whose prices all
     equal off-peak is neither; any other name is judged by netBy as before */
  const PF = ['input','inputCacheHit','inputCacheMiss','inputCacheWrite','output'];
  const same = (a, b) => { const f = x => JSON.stringify([x].concat(x && Array.isArray(x.tiers) ? x.tiers : []).map(y => PF.map(k => y ? y[k] : undefined))); return f(a) === f(b); };
  const named = (name, t) => (name === 'peak' || name === 'discount') && !same(t, off) ? name : null;
  for (const e of scheduleOf(r)) { if (!e || typeof e !== 'object') continue;
    const st = e.state && e.state !== 'off' && R[e.state] ? e.state : null, nm = st && named(st, at(st));
    const flat = !st || same(at(st), off), rel = st && o && !flat ? (fv(at(st), nb) || 0) / o : 1, sc = e.scalar == null ? 1 : typeof e.scalar === 'number' ? e.scalar : (e.scalar[nb] != null ? e.scalar[nb] : 1);
    if (nm === 'peak' || (!nm && rel > 1) || sc > 1) kinds.peak = true;
    if (nm === 'discount' || (!nm && rel < 1) || sc < 1) kinds.discount = true;
    spans(e, ts).forEach(([a, b]) => list.push([a, b, st, e.scalar]));
  }
  const stateAt = t => { if (isNum(ep) && t < ep && R.legacy) return { bucket:'legacy', scalars:[], states:[] };
    const on = list.filter(x => x[0] <= t && t < x[1]), states = on.map(x => x[2]).filter(Boolean);
    return { bucket:states.slice().sort((a, b) => costGuess(at(b)) - costGuess(at(a)))[0] || 'off', scalars:on.filter(x => x[3] != null).map(x => x[3]), states }; };
  const tableAt = s => scaleTable(at(s.bucket), s.scalars), now = stateAt(ts), table = tableAt(now), key = JSON.stringify(table);
  const next = [...new Set(list.flatMap(x => [x[0], x[1]]).concat(isNum(ep) ? [ep] : []))].filter(t => t > ts).sort((a, b) => a - b)
    .find(t => JSON.stringify(tableAt(stateAt(t))) !== key);
  const net = now.bucket === 'legacy' ? 1 : (o ? (fv(table, nb) || 0) / o : 1), nm = now.bucket !== 'legacy' && named(now.bucket, table);
  /* what the page shows now: free / the state's own name / else by net */
  const mode = net === 0 ? 'free' : nm || (net > 1 ? 'peak' : net < 1 ? 'discount' : 'off');
  return { bucket:now.bucket, table, off, scalars:now.scalars, conflict:now.states.length > 1, live:!!r.rates,
           net, mode, next:next != null ? next : null, kinds };
}
/* request settings for a provider/model (default: the current selection) — the app's own merge */
const requestFor = (model, provider) => run(null, Object.assign({}, model ? { model } : {}, provider ? { provider } : {}));
/* never fails: request settings r (or a function giving them; default the current selection) → price state,
   or the app's own price when it cannot be read */
const safeState = (r, ts) => { try { r = typeof r === 'function' ? r() : r || run(); return priceState(r, ts); }
  catch(e){ const t = (r && typeof r === 'object' && r.pricing) || null; return { bucket:'off', table:t, off:t, scalars:[], conflict:false, live:false, net:1, mode:'off', next:null, kinds:{ peak:false, discount:false } }; } };
const NS = window.__eval1 = window.__eval1 || {};
/* a new paste replaces the earlier one completely (see INSTALL) */
try { if (NS.disable) NS.disable(); } catch(e){}
NS.off = false;

const DEFAULTS = {
  mode:'auto', webSearch:true, webSearchStyle:'tools', showSearchTrace:true, paintIntervalMs:160,
  markedSrc:'https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.js',
  toolEchoCollapseChars:2000, toolEchoCollapseOn:true, thinkingHistory:'all', peakCounter:'off', toolFontScale:0.7,
  toolMaxTurns:100, toolMaxTurnsOn:true, autoTools:[],
  evalToolVersion:'auto', evalToolNameOverride:'tool_eval_1', evalToolNameOverrideOn:false, agenticTools:'auto',
  toolCostNote:true, relaxedSendCriteria:false, staleHunter:false, staleHunterMs:900000, discountCounter:'off',
  evalInProviders:false, apiShapeFallback:'auto', pricingFallback:'auto', costBalance:'off', balanceSnap:false,
  technicalUser:false, autoSourceOn:true, autoSourceToken:'edited', estimateOn:false, estimateLimitUsd:0.05
};
const stored = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch(e){ return {}; } };
/* settings: each known setting's saved value, else its default (saved keys no longer used are dropped) */
const savedConfig = stored('dse_eval1_config');
NS.config = {}; Object.keys(DEFAULTS).forEach(k => { NS.config[k] = k in savedConfig ? savedConfig[k] : DEFAULTS[k]; });
/* a config saved before the collapse switch existed: a size of 0 could only come from switching it off (22d) */
if (!('toolEchoCollapseOn' in savedConfig) && savedConfig.toolEchoCollapseChars === 0){ NS.config.toolEchoCollapseOn = false; NS.config.toolEchoCollapseChars = 2000; }
function save(){ try { localStorage.setItem('dse_eval1_config', JSON.stringify(NS.config)); } catch(e){} }
/* switches: saved, else on. Tools are not a switch: they follow the Agentic tools setting */
const FLAGS = ['marked','anthropic','hybrid','pill','bridgeStream'], savedFlags = stored('dse_eval1_flags');
NS.flags = {}; FLAGS.forEach(k => { NS.flags[k] = (savedFlags[k] ?? 1) ? 1 : 0; });
const toolsOn = () => NS.config.agenticTools !== 'off';
NS.stats = NS.stats || { transformed:0, passthrough:0, searchCalls:0, last:{} };

/* ============================ UTILS ============================ */
const warn = m => { try { console.warn('[eval1] ' + m); } catch(e){} };
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clone = o => JSON.parse(JSON.stringify(o));
const chunk = delta => ({ choices:[{ delta }] });           /* shared SSE frame */
const cloneHeaders = h => {
  if (!h) return {};
  if (typeof Headers !== 'undefined' && h instanceof Headers){ const o = {}; h.forEach((v,k) => o[k] = v); return o; }
  return Object.assign({}, h);
};
const encodeText = s => new TextEncoder().encode(s);
const safeStr = v => {
  try {
    if (v === undefined) return 'undefined';
    if (typeof v === 'bigint' || typeof v === 'symbol' || typeof v === 'function') return String(v);
    if (typeof v !== 'object' || v === null) return JSON.stringify(v);
    const seen = new WeakSet();
    return JSON.stringify(v, (k,x) => {
      if (typeof x === 'bigint' || typeof x === 'symbol' || typeof x === 'function') return String(x);
      if (x && typeof x === 'object'){ if (seen.has(x)) return '[circular]'; seen.add(x); }
      return x;
    }, 2).slice(0, 20000) || 'undefined';
  } catch(e){ return String(v); }
};

/* ============================ INSTALL ============================ */
/* Everything this paste adds to the page is listed with how to take it back. disable() takes nearly all of it back,
   newest first, and the next paste starts with disable() — so nothing is ever added twice and nearly nothing stays. */
const TAKE_BACK = [];
const added = undo => { TAKE_BACK.push(undo); };
/* the app's function `name` becomes make(original); the app's functions live in its closure, hence eval */
const swap = (name, make) => { const orig = eval(name), repl = make(orig); eval(name + ' = repl'); added(() => eval(name + ' = orig')); };
const on = (target, type, fn, capture) => { target.addEventListener(type, fn, capture); added(() => target.removeEventListener(type, fn, capture)); };
const watch = (el, opts, fn) => { const m = new MutationObserver(fn); m.observe(el, opts); added(() => m.disconnect()); };
const every = (ms, fn) => { const t = setInterval(fn, ms); added(() => clearInterval(t)); };
const mine = el => { added(() => el.remove()); return el; };

/* ============================ FETCH LAYER ============================ */
/* every POST with a JSON body passes the bridges in a fixed order (the coalescer last); each checks its own switch */
const pageFetch = window.fetch, nativeFetch = pageFetch.bind(window);
window.fetch = function(input, init){
  const url = typeof input === 'string' ? input : (input && input.url) || String(input || ''), opts = init || {};
  let payload = null;
  if (String(opts.method || (input && input.method) || 'GET').toUpperCase() === 'POST' && typeof opts.body === 'string') try { payload = JSON.parse(opts.body); } catch(e){}
  if (payload) for (const bridge of [anthropicHandler, responsesHandler, coalescerHandler]){ const r = bridge(input, init, url, opts, payload); if (r) return r; }
  return nativeFetch(input, init);
};
added(() => { window.fetch = pageFetch; });

/* SSE coalescer: buffers text into paintIntervalMs frames */
function makeCoalescedStream(sourceBody, translate){
  return new ReadableStream({
    start(controller){
      const reader = sourceBody.getReader(), decoder = new TextDecoder();
      let buffer = '', closed = false, timer = 0;
      const acc = { content:'', reasoning:'' };
      const enqueue = text => { if (!closed) try { controller.enqueue(encodeText(text)); } catch(e){} };
      const flushAcc = () => {
        if (timer){ clearTimeout(timer); timer = 0; }
        if (acc.content || acc.reasoning){
          const d = {}; if (acc.content) d.content = acc.content; if (acc.reasoning) d.reasoning_content = acc.reasoning;
          enqueue('data: ' + JSON.stringify(chunk(d)) + '\n\n'); acc.content = ''; acc.reasoning = '';
        }
      };
      const scheduleFlush = () => {
        if (timer) return;
        if (document.visibilityState === 'hidden'){ flushAcc(); return; }
        timer = setTimeout(() => { timer = 0; flushAcc(); }, NS.config.paintIntervalMs);
      };
      const finish = () => { if (closed) return; flushAcc(); enqueue('data: [DONE]\n\n'); closed = true; try { controller.close(); } catch(e){} };
      /* usage frame: a passed-through event keeps its own top-level fields (ids, provider cost fields) */
      const usageFrame = out => { flushAcc(); enqueue('data: ' + JSON.stringify(Object.assign({}, translate ? {} : out, { choices:[{ delta:{} }], usage:out.usage })) + '\n\n'); };
      const handleBlock = block => {
        let data = '';
        (block.split(/\r?\n/) || []).forEach(line => { if (line.indexOf('data:') === 0) data += (data ? '\n' : '') + line.slice(5).replace(/^\s+/, ''); });
        if (!data || data === '[DONE]'){ if (data === '[DONE]') finish(); return; }
        let ev; try { ev = JSON.parse(data); } catch(e){ return; }
        let out; try { out = translate ? translate(ev) : ev; } catch(e){ out = { error:e }; }
        if (!out) return;
        if (out.error){
          if (out.usage) usageFrame(out);
          if (!closed){ closed = true; try { controller.error(out.error); } catch(e){} }
          return;
        }
        if (out.finish){ if (out.usage) usageFrame(out); finish(); return; }
        const d = (out.choices && out.choices[0] && out.choices[0].delta) || {};
        if (d.content){ acc.content += d.content; scheduleFlush(); }
        if (d.reasoning_content){ acc.reasoning += d.reasoning_content; scheduleFlush(); }
        if (d.tool_calls){ flushAcc(); enqueue('data: ' + JSON.stringify(out) + '\n\n'); }
        else if (out.usage) usageFrame(out);
      };
      const pump = () => {
        reader.read().then(res => {
          if (closed){ try { reader.cancel(); } catch(e){} return; }
          if (res.done){ if (buffer.trim()) handleBlock(buffer); buffer = ''; finish(); return; }
          buffer += decoder.decode(res.value, { stream:true });
          let m; while (!closed && (m = buffer.search(/\n\n|\r\n\r\n/)) !== -1){ const sep = buffer[m] === '\r' ? 4 : 2; handleBlock(buffer.slice(0, m)); buffer = buffer.slice(m + sep); }
          pump();
        }).catch(err => { if (!closed){ closed = true; try { controller.error(err); } catch(e){} } });
      };
      pump();
    }
  });
}
/* coalescer passthrough: coalesce any streaming chat */
function coalescerHandler(input, init, url, opts, payload){
  if (!NS.flags.hybrid || !(payload.stream && Array.isArray(payload.messages) && /\/chat\/completions(\?|$)/.test(url))) return null;
  NS.stats.passthrough++; updateStats('chat', payload.model, url);
  return nativeFetch(input, init).then(up => up.ok && up.body ? new Response(makeCoalescedStream(up.body, null), { status:200, headers:{'Content-Type':'text/event-stream'} }) : up);
}

/* ============================ ANTHROPIC BRIDGE ============================ */
const ANTHROPIC_ENDPOINT = 'https://api.deepseek.com/anthropic/v1/messages';
const SEARCH_TOOL = { type:'web_search_20250305', name:'web_search' };
/* web search for one request: what A's request loop chose for it (sent along with the request), else the setting */
const searchFor = opts => opts && opts.eval1 ? !!opts.eval1.webSearch : !!NS.config.webSearch;
function toAnthropic(source){
  const system = [], messages = [];
  for (const item of source){
    if (!item) continue;
    if (item.role === 'system' || item.role === 'developer'){ system.push(String(item.content || '')); continue; }
    const blocks = [];
    let role = item.role === 'assistant' ? 'assistant' : 'user';
    if (item.role === 'tool'){ blocks.push({ type:'tool_result', tool_use_id:item.tool_call_id, content:String(item.content || '') }); role = 'user'; }
    else {
      if (item.role === 'assistant' && item.reasoning_content) blocks.push({ type:'thinking', thinking:String(item.reasoning_content) });
      if (item.content) blocks.push({ type:'text', text:String(item.content) });
      (item.tool_calls || []).forEach(tc => { if (tc.type === 'function'){ let a = {}; try { a = JSON.parse(tc.function.arguments || '{}'); } catch(e){} blocks.push({ type:'tool_use', id:tc.id, name:tc.function.name, input:a }); } });
    }
    const prev = messages[messages.length - 1];
    if (prev && prev.role === role) prev.content = prev.content.concat(blocks);
    else messages.push({ role, content:blocks });
  }
  return { system:system.join('\n\n'), messages };
}
function toUsage(raw){
  const hit = Number(raw && (raw.cache_read_input_tokens != null ? raw.cache_read_input_tokens : raw.prompt_cache_hit_tokens)) || 0;
  const creation = Number(raw && raw.cache_creation_input_tokens) || 0;
  const uncached = Number(raw && (raw.input_tokens != null ? raw.input_tokens : raw.prompt_cache_miss_tokens)) || 0;
  const output = Number(raw && (raw.output_tokens != null ? raw.output_tokens : raw.completion_tokens)) || 0;
  const prompt = uncached + hit + creation;
  return { prompt_tokens:prompt, completion_tokens:output, total_tokens:prompt + output,
    prompt_cache_hit_tokens:hit, prompt_cache_miss_tokens:uncached + creation,
    prompt_tokens_details:{ cached_tokens:hit }, input_tokens:prompt, output_tokens:output,
    cache_read_input_tokens:hit, cache_creation_input_tokens:creation };
}
function toAnswer(data){
  const blocks = Array.isArray(data && data.content) ? data.content : [];
  return {
    content: blocks.filter(x => x && x.type === 'text').map(x => x.text || '').join(''),
    reasoning: blocks.filter(x => x && x.type === 'thinking').map(x => x.thinking || x.text || '').join(''),
    tool_uses: blocks.filter(x => x && x.type === 'tool_use'),        /* server tools (web search) already ran on the server */
    usage: toUsage(data && data.usage), stop:(data && data.stop_reason) || 'stop',
    searched: blocks.some(x => x && (x.type === 'tool_use' || x.type === 'server_tool_use') && (x.name === 'web_search' || (x.input && (x.input.type === 'web_search' || x.input.name === 'web_search'))))
  };
}
function openAIJson(answer, model){
  const toolCalls = (answer.tool_uses || []).map((tu, i) => ({ id:tu.id || ('call_' + i), type:'function', function:{ name:tu.name, arguments:JSON.stringify(tu.input || {}) } }));
  const msg = { role:'assistant', content:answer.content, reasoning_content:answer.reasoning };
  if (toolCalls.length) msg.tool_calls = toolCalls;
  return { id:'chatcmpl-web-' + Date.now(), object:'chat.completion', created:Math.floor(Date.now()/1000), model,
    choices:[{ index:0, message:msg, finish_reason:answer.stop === 'max_tokens' ? 'length' : 'stop' }], usage:answer.usage };
}
/* the same answer as a stream (the app streams while the bridge did not): reasoning, text, tool calls, then the end */
function openAIStream(answer, model){
  const j = openAIJson(answer, model), m = j.choices[0].message, frames = [];
  const push = (delta, end) => frames.push('data: ' + JSON.stringify({ id:j.id, object:'chat.completion.chunk', created:j.created, model, choices:[{ index:0, delta, finish_reason:end ? j.choices[0].finish_reason : null }], ...(end ? { usage:j.usage } : {}) }) + '\n\n');
  push({ role:'assistant' });
  if (m.reasoning_content) push({ reasoning_content:m.reasoning_content });
  if (m.content) push({ content:m.content });
  if (m.tool_calls) push({ tool_calls:m.tool_calls.map((t, index) => Object.assign({ index }, t)) });
  push({}, 1);
  return new ReadableStream({ start(c){ c.enqueue(encodeText(frames.join('') + 'data: [DONE]\n\n')); c.close(); } });
}
/* the stream's usage: input from message_start, output from message_delta (toUsage reads both namings) */
const anthropicUsageToOpenAI = (startUsage, deltaUsage) => toUsage(Object.assign({}, startUsage, { output_tokens:deltaUsage && deltaUsage.output_tokens }));
function makeAnthropicTranslate(){
  let startUsage = null, searchedBlock = false, countedSearch = false, currentToolId = null, toolIndex = -1;
  return ev => {
    switch (ev && ev.type){
      case 'message_start': if (ev.message && ev.message.usage) startUsage = ev.message.usage; return null;
      case 'content_block_start': {
        const cb = ev.content_block || {};
        if (cb.type === 'tool_use' || cb.type === 'server_tool_use'){
          if (cb.name === 'web_search' || (cb.input && (cb.input.type === 'web_search' || cb.input.name === 'web_search'))){ if (!countedSearch){ NS.stats.searchCalls++; countedSearch = true; } searchedBlock = true; }
          else { toolIndex++; currentToolId = cb.id; return chunk({ tool_calls:[{ index:toolIndex, id:cb.id, type:'function', function:{ name:cb.name, arguments:'' } }] }); }
        }
        return null;
      }
      case 'content_block_delta': {
        const d = ev.delta || {};
        if (d.type === 'thinking_delta') return chunk({ reasoning_content:d.thinking || '' });
        if (d.type === 'text_delta') return chunk({ content:d.text || '' });
        if (d.type === 'input_json_delta'){
          if (searchedBlock && NS.config.showSearchTrace){ try { const j = JSON.parse(d.partial_json || '{}'); if (j.search_query){ searchedBlock = false; return chunk({ reasoning_content:'[web_search] ' + j.search_query }); } } catch(e){} }
          else if (currentToolId) return chunk({ tool_calls:[{ index:toolIndex, function:{ arguments:d.partial_json || '' } }] });
        }
        return null;
      }
      case 'content_block_stop': currentToolId = null; searchedBlock = false; return null;
      case 'message_delta': { const inc = !!(ev.delta && ev.delta.stop_reason === 'max_tokens'); const u = anthropicUsageToOpenAI(startUsage, ev.usage); return inc ? { error:Error('Incomplete — output truncated (max tokens)'), usage:u } : { finish:true, usage:u }; }
      case 'message_stop': return { finish:true };
      default: return null;
    }
  };
}
function anthropicHandler(input, init, url, opts, original){
  if (!NS.flags.anthropic || NS.config.mode === 'responses' || !/api\.deepseek\.com\/?(?:v1\/)?chat\/completions(?:\?|$)/i.test(url)) return null;
  const headers = new Headers(opts.headers || (input && input instanceof Request ? input.headers : undefined));
  const key = (headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key) return null;
  const converted = toAnthropic(original.messages || []);
  const useStream = !!(NS.flags.bridgeStream && original.stream);
  const upstream = { model:original.model, messages:converted.messages, tools:[], stream:useStream,
    max_tokens: original.max_tokens != null ? original.max_tokens : (original.max_completion_tokens != null ? original.max_completion_tokens : 384000) };
  (original.tools || []).forEach(t => { if (t.type === 'function') upstream.tools.push({ name:t.function.name, description:t.function.description || '', input_schema:t.function.parameters || { type:'object', properties:{} } }); });
  if (searchFor(opts) && !upstream.tools.some(t => t.name === 'web_search')) upstream.tools.push(SEARCH_TOOL);
  if (!upstream.tools.length) delete upstream.tools;
  if (converted.system) upstream.system = converted.system;
  ['temperature','top_p','thinking','reasoning_effort'].forEach(n => { if (original[n] != null) upstream[n] = original[n]; });
  const rInit = { method:'POST', headers:{ 'content-type':'application/json', 'authorization':'Bearer ' + key, 'x-api-key':key, 'anthropic-version':'2023-06-01' }, body:JSON.stringify(upstream), signal:opts.signal };
  return nativeFetch(ANTHROPIC_ENDPOINT, rInit).then(resp => {
    updateStats('anthropic', original.model, ANTHROPIC_ENDPOINT);
    if (useStream) return !resp.ok || !resp.body ? resp : new Response(makeCoalescedStream(resp.body, makeAnthropicTranslate()), { status:200, headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache'} });
    return resp.text().then(rawText => {
      if (!resp.ok) return new Response(rawText, { status:resp.status, statusText:resp.statusText, headers:{'content-type':resp.headers.get('content-type') || 'application/json'} });
      let data; try { data = JSON.parse(rawText); } catch(e){ throw Error('Anthropic endpoint invalid JSON: ' + rawText.slice(0, 500)); }
      const answer = toAnswer(data);
      if (answer.searched) NS.stats.searchCalls++;
      if (original.stream) return new Response(openAIStream(answer, original.model), { status:200, headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache'} });
      return new Response(JSON.stringify(openAIJson(answer, original.model)), { status:200, headers:{'content-type':'application/json; charset=utf-8'} });
    });
  });
}

/* ============================ RESPONSES BRIDGE ============================ */
const MODELS = {
  'deepseek-v4-pro':{ provider:'deepseek', path:'/responses', webSearch:true },
  'deepseek-v4-flash':{ provider:'deepseek', path:'/responses', webSearch:true },
  'gpt-5.6-sol':{ provider:'openai', path:'/responses', webSearch:true },
  'gpt-5.6-terra':{ provider:'openai', path:'/responses', webSearch:true },
  'gpt-5.6-luna':{ provider:'openai', path:'/responses', webSearch:true }
};
const PROVIDER_HOSTS = { deepseek:['api.deepseek.com'], openai:['api.openai.com'] };
const warned = {};
function resolvePlan(url, payload){
  if (NS.config.mode === 'chat') return null;
  const plan = MODELS[payload && payload.model];
  if (!plan){ if (NS.config.mode === 'responses' && payload && payload.model && !warned[payload.model]){ warned[payload.model] = 1; warn('mode=responses but model not profiled: ' + payload.model + ' -> chat fallback.'); } return null; }
  if (!/\/chat\/completions(\?|$)/.test(url)) return null;
  return (PROVIDER_HOSTS[plan.provider] || []).some(h => url.indexOf(h) !== -1) ? plan : null;
}
function buildResponsesRequest(chat, plan, search){
  const sys = [], input = [];
  (chat.messages || []).forEach(m => {
    if (!m) return;
    if (m.role === 'system' || m.role === 'developer'){ sys.push(String(m.content || '')); return; }
    if (m.role === 'tool'){ input.push({ type:'function_call_output', call_id:m.tool_call_id, output:String(m.content || '') }); return; }
    if (m.role === 'assistant'){
      if (m.reasoning_content) input.push({ type:'reasoning', content:[{ type:'reasoning_text', text:String(m.reasoning_content) }] });
      if (m.content) input.push({ role:'assistant', content:String(m.content) });
      (m.tool_calls || []).forEach(tc => { if (tc.type === 'function') input.push({ type:'function_call', call_id:tc.id, name:tc.function.name, arguments:tc.function.arguments || '{}' }); });
      return;
    }
    input.push({ role:'user', content:String(m.content || '') });
  });
  if (!input.length) return null;
  const req = { model:chat.model, input, stream:!!chat.stream };
  if (sys.length) req.instructions = sys.join('\n\n');
  const max = chat.max_tokens != null ? chat.max_tokens : chat.max_completion_tokens;
  if (max) req.max_output_tokens = max;
  if (typeof chat.temperature === 'number' && plan.provider !== 'deepseek') req.temperature = chat.temperature;
  if (search && plan.webSearch){ if (NS.config.webSearchStyle === 'tool') req.tool = 'web_search'; else req.tools = [{ type:'web_search' }]; }
  const ft = (chat.tools || []).filter(t => t && t.type === 'function').map(t => ({ type:'function', name:t.function.name, description:t.function.description || '', parameters:t.function.parameters || { type:'object', properties:{} } }));
  if (ft.length) req.tools = (req.tools || []).concat(ft);
  return req;
}
/* Responses usage → chat usage (named apart from the app's own mapUsage) */
function respUsage(u){
  if (!u || typeof u !== 'object') return undefined;
  const o = {};
  if (typeof u.input_tokens === 'number') o.prompt_tokens = u.input_tokens;
  if (typeof u.output_tokens === 'number') o.completion_tokens = u.output_tokens;
  if (typeof u.total_tokens === 'number') o.total_tokens = u.total_tokens;
  if (u.input_tokens_details && typeof u.input_tokens_details.cached_tokens === 'number') o.prompt_tokens_details = { cached_tokens:u.input_tokens_details.cached_tokens };
  if (u.output_tokens_details && typeof u.output_tokens_details.reasoning_tokens === 'number') o.completion_tokens_details = { reasoning_tokens:u.output_tokens_details.reasoning_tokens };
  return Object.keys(o).length ? o : undefined;
}
/* fresh translator per request; oiMap: output_index -> function-call ordinal */
function makeResponsesTranslator(){
  let idx = 0, cur = -1; const oiMap = {};
  return ev => {
    switch (ev && ev.type){
      case 'response.created': idx = 0; cur = -1; for (const k in oiMap) delete oiMap[k]; return null;
      case 'response.output_text.delta': return chunk({ content:ev.delta || '' });
      case 'response.reasoning_text.delta': return chunk({ reasoning_content:ev.delta || '' });
      case 'response.output_item.added': {
        const it = ev.item || {};
        if (it.type === 'function_call'){ cur = idx++; if (Number.isInteger(ev.output_index)) oiMap[ev.output_index] = cur; return chunk({ tool_calls:[{ index:cur, id:it.call_id, type:'function', function:{ name:it.name, arguments:'' } }] }); }
        return null;
      }
      case 'response.function_call_arguments.delta': {
        const i = (Number.isInteger(ev.output_index) && oiMap[ev.output_index] != null) ? oiMap[ev.output_index] : (cur < 0 ? 0 : cur);
        return chunk({ tool_calls:[{ index:i, function:{ arguments:ev.delta || '' } }] });
      }
      case 'response.output_item.done': {
        const item = ev.item || {};
        if (item.type === 'web_search_call'){ NS.stats.searchCalls++; if (NS.config.showSearchTrace){ const q = (item.action && (item.action.search_query || item.action.query)) || 'web search'; return chunk({ reasoning_content:'[web_search] ' + q }); } }
        return null;
      }
      case 'response.completed': return { finish:true, usage:respUsage(ev.response && ev.response.usage) };
      case 'response.incomplete': return { error:Error('Incomplete — output truncated (max tokens)') };
      case 'response.failed': return { error:Error((ev.response && ev.response.error && ev.response.error.message) || 'Responses request failed.') };
      default: return null;
    }
  };
}
function translateFinal(data, plan){
  let content = '', reasoning = ''; const toolCalls = [];
  (data.output || []).forEach(item => {
    if (item && item.type === 'message' && Array.isArray(item.content)) item.content.forEach(c => { if (c && c.type === 'output_text') content += c.text || ''; });
    else if (item && item.type === 'reasoning'){ (item.summary || []).forEach(s => { if (s && s.type === 'summary_text') reasoning += s.text || ''; }); if (!reasoning && typeof item.encrypted_content === 'string') reasoning = '[encrypted reasoning]'; }
    else if (item && item.type === 'function_call') toolCalls.push({ id:item.call_id, type:'function', function:{ name:item.name, arguments:item.arguments || '{}' } });
    else if (item && item.type === 'web_search_call'){ NS.stats.searchCalls++; const q = item.action && (item.action.search_query || item.action.query); if (NS.config.showSearchTrace && q) reasoning += (reasoning ? '\n' : '') + '[web_search] ' + q; }
  });
  const status = data.status === 'failed' ? 'error' : (data.status === 'incomplete' ? 'length' : 'stop');
  const msg = { role:'assistant', content, reasoning_content:reasoning };
  if (toolCalls.length) msg.tool_calls = toolCalls;
  return { id:data.id, object:'chat.completion', created:Math.floor(Date.now()/1000), model:data.model || plan.model,
    choices:[{ index:0, message:msg, finish_reason:status }], usage:respUsage(data.usage) };
}
function responsesHandler(input, init, url, opts, payload){
  const plan = NS.flags.hybrid && resolvePlan(url, payload);
  if (!plan) return null;
  const rReq = buildResponsesRequest(payload, plan, searchFor(opts));
  if (!rReq) return null;
  const rUrl = url.replace(/\/chat\/completions(\?|$)/, '') + plan.path;
  const rInit = {};
  for (const k in opts) if (k !== 'body') rInit[k] = opts[k];
  rInit.headers = cloneHeaders(opts.headers); rInit.headers['Content-Type'] = 'application/json'; rInit.body = JSON.stringify(rReq);
  return nativeFetch(rUrl, rInit).then(up => {
    NS.stats.transformed++; updateStats('responses', payload.model, rUrl);
    if (!up.ok) return up.text().then(text => { let msg = 'HTTP ' + up.status; try { const j = JSON.parse(text); if (j && j.error && j.error.message) msg += ': ' + j.error.message; } catch(e){} return new Response(JSON.stringify({ error:{ message:msg } }), { status:up.status, headers:{'Content-Type':'application/json'} }); });
    if (payload.stream && up.body) return new Response(makeCoalescedStream(up.body, makeResponsesTranslator()), { status:200, headers:{'Content-Type':'text/event-stream'} });
    return up.json().then(data => {
      if (data.status === 'failed'){ const em = (data.error && data.error.message) || 'Responses request failed.'; return new Response(JSON.stringify({ error:{ message:em } }), { status:400, headers:{'Content-Type':'application/json'} }); }
      return new Response(JSON.stringify(translateFinal(data, plan)), { status:200, headers:{'Content-Type':'application/json'} });
    });
  });
}

/* ============================ PRICING (public view) ============================ */
/* window.__pricingEngine keeps its function names for other code; every answer comes from priceState.
   Model-id calls use the current provider unless a provider id is given. */
{
  const PE = window.__pricingEngine = {};
  const st = (m, ts, pid) => safeState(() => requestFor(m, pid), ts);
  Object.assign(PE, {
    priceState, requestFor,
    stateAt:(ts, m, pid) => st(m, ts, pid),
    priceAt:(m, ts, pid) => st(m, ts, pid).table,
    effectiveAt:(ts, m, pid) => { const s = st(m, ts, pid); return { baseName:s.bucket, scalars:s.scalars, conflict:s.conflict, table:s.table }; },
    hasRealPeak:(m, pid) => !!st(m, 0, pid).kinds.peak,
    schedFor:(m, pid) => { try { return scheduleOf(requestFor(m, pid)); } catch(e){ return []; } },
    audit:() => {
      const rows = [];
      Object.keys(providers || {}).forEach(pid => { if (pid === 'custom_template') return;
        (modelIds(providers[pid]) || []).forEach(m => { const s = st(m, 0, pid); rows.push({ provider:pid, model:m, live:!!s.live, bucket:s.bucket, table:s.table }); }); });
      return { context:{ now:new Date().toISOString() }, total:rows.length, rows };
    }
  });
  PE.current = PE.priceAt;
}

/* ============================ TOOLS ============================ */
/* a tool run settles on the first of: its own result, the timeout, the abort; stop() ends the work */
const firstOf = (timeout, signal, start, stop) => new Promise(resolve => {
  let t = 0; const abort = () => finish({ ok:0, e:'aborted' });
  const finish = r => { if (!t) return; clearTimeout(t); t = 0; if (signal) signal.removeEventListener('abort', abort); if (stop) stop(); resolve(r); };
  t = setTimeout(() => finish({ ok:0, e:'timeout' }), timeout);
  if (signal){ if (signal.aborted) return abort(); signal.addEventListener('abort', abort); }
  start(finish);
});
const WORKER = 'self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:1,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:0,e:String(err&&err.stack||err)})}}';
const evalWorker = (code, timeout, signal) => { let w = null; return firstOf(timeout, signal, finish => {
  try { w = new Worker(URL.createObjectURL(new Blob([WORKER], { type:'text/javascript' }))); } catch(e){ return finish({ ok:0, e:String(e) }); }
  w.onmessage = e => finish(e.data); w.onerror = err => finish({ ok:0, e:String(err.message || err) }); w.postMessage(code);
}, () => w && w.terminate()); };
window.__tools = window.__tools || {};
window.__tools.tool_eval_1 = {
  schema:{ type:'function', function:{ name:'tool_eval_1', description:'Execute JavaScript in the browser. Returns JSON result. The last statement must be an expression to return a value (do NOT use console.log to return data). By default runs in isolated Web Worker. SET "worker": false if you need to access window, document, or DOM. You MAY issue multiple tool invokes with different names in one block — each becomes an independent execution; never merge or drop any.', parameters:{ type:'object', properties:{ code:{ type:'string', description:'JavaScript code to run.' }, timeout:{ type:'number' }, worker:{ type:'boolean', description:'false = full page DOM access. true = isolated worker (default)' } }, required:['code'] } } },
  run: async (args, signal) => {
    const code = String(args && args.code != null ? args.code : ((args && args.expression) || '')).trim();
    const timeout = (args && args.timeout == null) ? 10000 : Math.max(1, Math.min(60000, Number(args && args.timeout) || 10000));
    const worker = !(args && args.worker === false);
    const t0 = performance.now();
    if (!code) return safeStr({ ok:false, error:'no code provided' });
    const done = r => { let s = safeStr({ ok:!!r.ok, ms:Math.round(performance.now() - t0), ...(r.ok ? { result:r.r } : { error:r.e }) }); try { if (document.visibilityState && document.visibilityState !== 'visible'){ const p = JSON.parse(s); if (p && typeof p === 'object'){ p.bg = true; p.note = 'tab hidden: wall-clock timers may be throttled'; s = JSON.stringify(p); } } } catch(e){} return s; };
    const fail = e => ({ ok:0, e:String(e && e.stack || e) });
    return done(await (worker ? evalWorker(code, timeout, signal)
      : firstOf(timeout, signal, finish => { try { Promise.resolve(eval(code)).then(r => finish({ ok:1, r }), e => finish(fail(e))); } catch(e){ finish(fail(e)); } })));
  }
};
/* tool versions: number → tool name (versions without a schema of their own use tool_eval_1's) */
const TOOL_VERSIONS = NS._toolVersions || (NS._toolVersions = { 1:'tool_eval_1', 2:'tool_eval_2', 3:'tool_eval_3', 4:'tool_eval_4', 5:'tool_eval_5', 6:'tool_eval_6', 7:'tool_eval_7' });
NS._toolSchemas = NS._toolSchemas || {};
const validToolSchema = s => { const f = s && s.function, p = f && f.parameters; return !!(p && p.type === 'object' && p.properties && Array.isArray(p.required)); };
const toolNameForVersion = v => TOOL_VERSIONS[+v] || null;
/* the eval tool for a provider|model key: the dropdown's version; 'auto' = the one that model's last message used (else 7) */
const activeToolName = key => {
  const v = NS.config.evalToolVersion;
  if (v === 'off') return null;
  if (v === 'auto'){ const pr = key && priorTools()[key], t = pr && pr.names.map(n => pr.alias[n] || n).find(x => /^tool_eval/.test(x)); return t || toolNameForVersion(7); }
  return toolNameForVersion(v);
};
const overrideToolName = () => (NS.config.evalToolNameOverrideOn && NS.config.evalToolNameOverride) ? NS.config.evalToolNameOverride : '';
/* shared schema builder: clones a tool def's schema with a given name */
function toolSchema(name, def){
  let s = (def && def.schema) || window.__tools.tool_eval_1.schema;
  if (s && s.function) s = Object.assign({}, s, { function:Object.assign({}, s.function, { name }) });
  return s;
}
/* every tool version runs the eval tool with its own schema (tool_eval_1's when it has none) */
function materializeTools(){
  const base = window.__tools.tool_eval_1;
  Object.keys(TOOL_VERSIONS).forEach(id => { const n = TOOL_VERSIONS[id], s = NS._toolSchemas[id]; if (n !== 'tool_eval_1') window.__tools[n] = { schema:toolSchema(n, { schema:validToolSchema(s) ? s : base.schema }), run:base.run }; });
}
NS.registerToolVersion = (id, name) => { TOOL_VERSIONS[id] = name; return TOOL_VERSIONS; };
NS.setToolVersionSchema = (id, schema) => { if (validToolSchema(schema)) NS._toolSchemas[id] = clone(schema); return NS._toolSchemas; };
NS.setToolVersionSchema(7, {
  type:'function',
  function:{
    name:'tool_eval_7',
    description:'Execute JavaScript in the client-side AI chat WebApp hosting this conversation. Returns ONLY the last statement\'s value (serialized as JSON). By default runs in an isolated Web Worker on a separate thread. SET "worker": false if you need to access window, document, or DOM on the main thread. You may issue multiple tool invokes with same-different names in one block — each tool call becomes an independent execution; never merge or drop any.',
    parameters:{ type:'object', properties:{ code:{ type:'string', description:'JavaScript code to run.' }, timeout:{ type:'number' }, worker:{ type:'boolean', description:'false = full page DOM access. true = isolated worker (default)' } }, required:['code'] }
  }
});
/* runs one call; alias maps a mocked name to the real tool */
const execTool = async (tc, signal, alias) => {
  const name = tc.function && tc.function.name, def = window.__tools[(alias && alias[name]) || name];
  let args = {}; try { args = JSON.parse((tc.function && tc.function.arguments) || '{}'); } catch(e){ args = { parseError:String(e), raw:(tc.function && tc.function.arguments) || '' }; }
  if (!def) return JSON.stringify({ ok:false, error:'unknown tool: ' + name });
  try { const out = await def.run(args, signal); return typeof out === 'string' ? out : JSON.stringify(out); } catch(e){ return JSON.stringify({ ok:false, error:String(e && e.stack || e) }); }
};
/* sum of two usage objects (for token counts across tool rounds): numbers add up, nested objects too,
   anything else keeps the first value */
function addCumulativeUsage(acc, curr){
  if (!acc) return JSON.parse(JSON.stringify(curr || {}));
  if (!curr) return acc;
  const out = Object.assign({}, acc);
  Object.keys(curr).forEach(k => { const a = acc[k], b = curr[k];
    if (typeof b === 'number' && Number.isFinite(b)) out[k] = (typeof a === 'number' ? a : 0) + b;
    else if (b && typeof b === 'object' && !Array.isArray(b)) out[k] = addCumulativeUsage(a && typeof a === 'object' && !Array.isArray(a) ? a : null, b);
    else if (!(k in out)) out[k] = b; });
  return out;
}
const hasToolsAtMessage = v => {
  if (!v) return false;
  if (v.tool_calls && v.tool_calls.length) return true;
  if (Array.isArray(v._toolEvents)) return v._toolEvents.some(m => (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) || m.role === 'tool');
  return false;
};
/* what the last message of each provider|model on the visible branch had attached: its tool names (metadata.tools,
   name → calls) and, when a name was mocked, which real tool it was (metadata.toolNames). Feeds both 'auto' modes.
   A message saved before metadata.tools existed gives the tools its last round called (toolBatch), as 96 did. */
const priorTools = () => { const by = {};
  getViewNodes().forEach(n => { const v = n.role === 'assistant' && (n.versions[n.activeVersion] || {}), md = v && v.metadata; if (!md || !md.model) return;
    let names = md.tools && typeof md.tools === 'object' ? Object.keys(md.tools) : null;
    if ((!names || !names.length) && v.toolBatch && Array.isArray(v.toolBatch.names) && v.toolBatch.names.length) names = v.toolBatch.names.filter(Boolean);
    if (names) by[md.provider + '|' + md.model] = { names, alias:md.toolNames || {} }; });
  return by; };
const stripReasoning = m => { if (m && m.reasoning_content !== undefined){ const c = Object.assign({}, m); delete c.reasoning_content; return c; } return m; };

/* ============================ AGENTIC ============================ */
function bamMake(next){
  return function(targetPath, r, msgs){
    if (msgs) return next.call(this, targetPath, r, msgs);
    const rr = r || run(), mode = NS.config.thinkingHistory || 'all';
    const out = [{ role:rr.systemRole || 'system', content:'You are a helpful assistant.' }];
    targetPath.forEach(n => {
      if (!n || n.id === 'root' || n.role === 'system' || n.role === 'system-msg') return;
      const ver = n.versions[n.activeVersion || 0];
      let te = (ver._toolEvents && Array.isArray(ver._toolEvents)) ? ver._toolEvents.slice() : [];
      const wt = hasToolsAtMessage(ver);
      if (mode !== 'all') te = te.map(m => m.role === 'assistant' && (!(m.tool_calls && m.tool_calls.length) || mode === 'off') ? stripReasoning(m) : m);
      if (te.length) out.push.apply(out, te);
      let fc = ver.llmContent;
      if (fc === undefined){ const last = (ver._toolEvents || []).filter(m => m.role === 'assistant').pop(); fc = last && last.content ? last.content : ver.rawContent; }
      if (fc){ const inc = mode === 'all' ? !!ver.thinking : (mode === 'tools' ? !!(ver.thinking && wt) : false); const msg = { role:n.role, content:fc }; if (inc) msg.reasoning_content = ver.thinking; out.push(msg); }
    });
    return rr.prompt ? out.concat({ role:rr.systemRole || 'system', content:rr.prompt }) : out;
  };
}
/* a request's tools: { names, alias, search } (or the request's own list). The request's own "tools" win;
   Agentic tools off = none; auto = exactly what the last message of this provider+model attached (none if it
   had none) — a live choice for this request, settings stay as they are; otherwise (or with no such message)
   the selection: the dropdown's eval tool under the override name if set, the auto tools, the web-search setting */
function resolveTools(r){
  const q = r.request || {}, ok = n => !!window.__tools[n];
  if (Array.isArray(q.tools)) return { list:q.tools, alias:{}, search:NS.config.webSearch };
  if (typeof q.tools === 'string') return { names:q.tools.split(/[,\s]+/).filter(ok), alias:{}, search:NS.config.webSearch };
  if ('tools' in q || !toolsOn()) return { names:[], alias:{}, search:false };
  const key = r.p.id + '|' + r.m, pr = NS.config.agenticTools === 'auto' && priorTools()[key];
  if (pr) return { names:pr.names.filter(n => n !== 'web_search' && ok(pr.alias[n] || n)), alias:pr.alias, search:pr.names.includes('web_search') };
  const real = activeToolName(key), ov = real && overrideToolName(), fake = ov && ov !== real ? ov : '', names = real ? [fake || real] : [];
  (NS.config.autoTools || []).concat(Object.keys(window.__tools).filter(n => window.__tools[n].auto)).forEach(n => { if (ok(n) && !names.includes(n)) names.push(n); });
  return { names, alias:fake ? { [fake]:real } : {}, search:NS.config.webSearch };
}
/* the schemas a request attaches for those tools */
const toolList = T => T.list || T.names.map(n => toolSchema(n, window.__tools[T.alias[n] || n]));
function agenticMake(next){
  /* normalize tool calls: guarantee object + name */
  function normalizeCalls(calls){
    return (calls || []).map(tc => { if (!tc || typeof tc !== 'object') tc = {}; tc.function = tc.function || {}; if (!tc.function.name) tc.function.name = activeToolName() || 'tool'; return tc; });
  }
  return async function(messages, node, vIndex, controller, r){
    r = r || run();
    /* this round's price, read now: rr = settings billed at it, ro = the same at the off price (for labels) */
    let st, rr, ro;
    const priced = () => { st = safeState(r); rr = Object.assign({}, r, { pricing:st.table }); ro = Object.assign({}, r, { pricing:st.off }); };
    priced();
    requestBalance(r, node, vIndex);
    const sc0 = NS.stats.searchCalls, g = gens[genKey(node.id, vIndex)];
    if (g) g.ctrl = controller;                    /* the stale hunter stops a generation through it */
    {
      const p = r.p, key = getApiKey(p.id), isStream = settings.streaming, modelId = r.m;
      const T = resolveTools(r), tools = toolList(T);
      const payload = Object.assign({}, r.request, { model:modelId, temperature:r.supportsTemperature === false ? void 0 : (r.temperature != null ? r.temperature : .7), stream:isStream });
      if (tools.length){ payload.tools = tools; if (!payload.tool_choice) payload.tool_choice = 'auto'; }
      /* what this message attached (name → calls, web_search counts server searches) and which names were mocked */
      const md0 = node.versions[vIndex].metadata = node.versions[vIndex].metadata || {}; md0.tools = {};
      tools.forEach(t => { const n = t.function && t.function.name; if (n) md0.tools[n] = 0; }); if (T.search) md0.tools.web_search = md0.tools.web_search || 0;
      if (Object.keys(T.alias).length) md0.toolNames = T.alias; else delete md0.toolNames;
      payload[p.maxTokensParam || 'max_tokens'] = r.maxTokens;
      if (isStream && p.supportsStreamUsage) payload.stream_options = { include_usage:true };
      node.versions[vIndex].startTime = Date.now();

      const toolEvents = [], maxTurns = NS.config.toolMaxTurns == null ? 100 : NS.config.toolMaxTurns;
      const turnsOn = NS.config.toolMaxTurnsOn !== false;
      /* turnC/turnT: the round still streaming, not yet added to the message */
      let uiContent = '', llmContent = '', uiThinking = '', turnC = '', turnT = '', cumulativeUsage = null, msgSearchCount = 0;
      const toolCostOn = NS.config.toolCostNote !== false;
      /* per-message call-id state: label + t<seq> + e<epoch> + _ + tool */
      const label = (String(node && node.id || '').split('(')[0] || 'call');
      let callSeq = 0; const epoch = Math.floor(Math.random() * 1e8);
      const genCallId = name => label + 't' + (++callSeq) + 'e' + epoch + '_' + name;

      /* Billing. Within one request the latest usage frame wins (the host's rule: providers may repeat
         running totals). Each tool round is billed on its own, at its own price, and the rounds' amounts
         are added — so size tiers see one request's input, not the whole message's. The exact (provider-
         reported) total is kept only while every round reported one; a reported 0 counts. The round is also
         billed once at the off price when it ends (for the labels: paid ÷ off). */
      let turnUsage = null, turnExact, done = null, sum = null, roundPaid = 0, roundOff = 0;
      /* a round that got an answer but no usage makes the total "+" (unknown part), unless the model is free:
         every price field it has is explicitly 0 */
      let sent = false, missed = false;
      const free = t => { const v = []; [t].concat(t && Array.isArray(t.tiers) ? t.tiers : []).forEach(x => ['input','inputCacheHit','inputCacheMiss','inputCacheWrite','output'].forEach(k => { if (x && x[k] != null) v.push(x[k]); })); return v.length > 0 && v.every(n => n === 0); };
      const unpriced = () => { if (sent && !turnUsage && turnExact === undefined && !free(st.table)) missed = true; sent = false; };
      const applyUsage = envelope => {
        const costBad = {};
        const next = r.usagePath === false ? envelope : r.usagePath ? at(envelope, r.usagePath) : (envelope && (envelope.usage ?? envelope.usageMetadata ?? (envelope.message && envelope.message.usage)));
        const rc = usageValue(envelope, r.usageCost, costBad);
        if (!costBad.value && rc !== undefined) turnExact = rc;
        if (next && typeof next === 'object') turnUsage = mergeUsage(turnUsage, next);
        if (!turnUsage && turnExact === undefined) return;
        const one = {}; applyResponseMetadata(one, turnUsage || {}, rr, turnExact);
        const c = one.metadata.cost, v = node.versions[vIndex];
        roundPaid = qv(c.calculated.total) || 0;
        cumulativeUsage = addCumulativeUsage(done && done.usage, turnUsage || {});
        applyResponseMetadata(v, cumulativeUsage, rr);
        if (Number.isFinite(one.promptTokens)) v.metadata.lastInput = one.promptTokens;   /* this round's input tokens: the estimate's known part next time */
        const calc = {}; ['out','hit','miss','unk','total'].forEach(k => { calc[k] = done ? qadd(done.calc[k], c.calculated[k]) : c.calculated[k]; });
        const exact = c.exact && (!done || done.exact != null) ? (done ? qadd(done.exact, c.exact.total) : c.exact.total) : null;
        v.metadata.cost = Object.assign({}, v.metadata.cost, { calculated:calc, split:!!((done && done.split) || c.split) });
        if (exact != null) v.metadata.cost.exact = { total:exact }; else delete v.metadata.cost.exact;
        sum = { usage:cumulativeUsage, calc, exact, split:v.metadata.cost.split, paid:(done ? done.paid : 0) + roundPaid };
      };
      const endRound = () => {
        unpriced();
        if (sum && sum !== done){ const o = {}; applyResponseMetadata(o, turnUsage || {}, ro); roundOff = qv(o.metadata.cost.calculated.total) || 0; sum.off = (done ? done.off : 0) + roundOff; done = sum; }
        turnUsage = null; turnExact = undefined; };
      /* paid ÷ what the same usage costs at the off price (1 when there is nothing to compare) */
      const ratio = (paid, off) => off > 0 ? Math.round(paid / off * 1e9) / 1e9 : null;

      /* limit 0 = inspect mode: one request, tool calls are shown but never run */
      const inspectOnly = turnsOn && maxTurns <= 0;
      /* whatever ends the loop (answer, error, Stop), the message keeps its text (the unfinished round too), tool history and label */
      try {
      for (let turn = 0; !turnsOn || turn < Math.max(1, maxTurns); turn++){
        if (controller.signal.aborted) break;
        const reqMessages = messages.concat(toolEvents);
        if (llmContent) reqMessages.push({ role:'assistant', content:llmContent });
        roundPaid = roundOff = 0;
        if (turn > 0) priced();
        if (NS.config.evalInProviders && p.eval) { try { eval(p.eval); } catch(e){ warn('[eval:' + p.id + '] ' + e.message); } }
        /* eval1 travels with the request (fetch ignores it): the bridges read this request's web search from it */
        const res = await fetch(p.baseURL + p.apiPath, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':(p.authHeader ? p.authHeader + ' ' : '') + key }, body:JSON.stringify(Object.assign({}, payload, { messages:reqMessages })), signal:controller.signal, eval1:{ webSearch:T.search } });
        if (!res.ok){ const body = (await res.text()).trim(); throw Error('HTTP ' + res.status + ' ' + body); }
        sent = true;

        let toolCalls = null; turnC = turnT = '';
        if (!isStream){
          const data = await res.json(); applyUsage(data);
          const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
          if (msg.tool_calls && msg.tool_calls.length) toolCalls = msg.tool_calls;
          turnC = msg.content || ''; turnT = msg.reasoning_content || '';
        } else {
          const reader = res.body.getReader(), dec = new TextDecoder();
          let buf = '', first = true, lastR = 0; const tAcc = [];
          const proc = line => {
            if (!line.startsWith('data: ')) return;
            const js = line.slice(6).trim(); if (!js || js === '[DONE]') return;
            try {
              const d = JSON.parse(js), delta = (d.choices && d.choices[0] && d.choices[0].delta) || {};
              turnC += delta.content || ''; turnT += delta.reasoning_content || '';
              (delta.tool_calls || []).forEach(dtc => {
                const i = dtc.index != null ? dtc.index : tAcc.length;
                const a = tAcc[i] || (tAcc[i] = { id:'', type:'function', function:{ name:'', arguments:'' } });
                if (dtc.id) a.id = dtc.id;
                if (dtc.function){ if (dtc.function.name) a.function.name += dtc.function.name; if (dtc.function.arguments) a.function.arguments += dtc.function.arguments; }
              });
              node.lastUpdateTime = Date.now();
              const v = node.versions[vIndex];
              v.rawContent = uiContent + turnC; v.thinking = uiThinking + turnT;
              if (first && (turnC || turnT || tAcc.length)){ if (node.activeVersion === vIndex) updateNodeDOM(node); first = false; handleNewContent(0, true); }
              if (!first && (turnC.length + turnT.length)){
                if (node.activeVersion === vIndex){
                  v.unread = false;
                  const l = turnC.length + turnT.length; handleNewContent(l - lastR, false); lastR = l;
                  const el = getMessageEl(node.id);
                  if (el){
                    const b = el.querySelector('.bubble'), cc = el.closest('.message').querySelector('.char-count');
                    const h = withMsg(node, () => buildThinkingSection(v.thinking, node.id, true) + formatMarkdown(v.rawContent));
                    if (b && b.innerHTML !== h) b.innerHTML = h;
                    if (cc) cc.textContent = getMessageStatString(node, v);
                  }
                  scheduleTokenDisplayUpdate(turnC.length, turnT.length);
                } else {
                  const va = node.versions, a = node.activeVersion;
                  if ((va[a] && va[a].swarm && !va[a].endTime) || !v.unread) updateVersionDots(node, vIndex);
                }
                const sw = node.id + '|' + vIndex, now = Date.now();
                if (now - (lastBufferWrite[sw] || 0) > 500){ saveStreamBuffer(node, vIndex); lastBufferWrite[sw] = now; }
              }
              applyUsage(d);
            } catch(e){}
          };
          while (true){ const rd = await reader.read(); if (rd.done) break; buf += dec.decode(rd.value, { stream:true }); const ls = buf.split('\n'); buf = ls.pop(); ls.forEach(proc); }
          if (buf.trim()) proc(buf.trim());
          if (tAcc.length) toolCalls = tAcc.filter(Boolean);
        }

        const said = turnC, thought = turnT; turnC = turnT = '';
        uiContent += said; uiThinking += thought; llmContent += said;
        endRound();
        if (toolCalls && toolCalls.length){
          if (controller.signal.aborted) break;
          toolCalls = normalizeCalls(toolCalls);
          toolCalls.forEach(tc => { if (!tc.id) tc.id = genCallId(tc.function.name); });
          if (inspectOnly){
            /* not added to _toolEvents: tool_calls without results would break the next request */
            toolCalls.forEach(tc => { uiContent += '\n\n```javascript\n// Executing: ' + (tc.function && tc.function.name) + ' (not run — tool limit 0)\n' + (tc.function && tc.function.arguments) + '\n```\n'; });
            node.versions[vIndex].rawContent = uiContent;
            node.versions[vIndex].toolBatch = { requested:toolCalls.length, executed:0, names:toolCalls.map(tc => tc.function.name), inspectOnly:true };
            if (node.activeVersion === vIndex) updateNodeDOM(node);
            break;
          }
          toolEvents.push({ role:'assistant', content:said || null, reasoning_content:thought || null, tool_calls:toolCalls });
          llmContent = '';
          msgSearchCount += toolCalls.filter(tc => /web_search/i.test(tc.function.name)).length;
          /* this round's own bill, "÷N" when N tools share it, and how it compares with the off price */
          const nCalls = toolCalls.length, x = ratio(roundPaid, roundOff), nice = v => Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v) : v.toFixed(2), notes = [];
          if (st.bucket !== 'legacy'){
            if (x != null && x !== 1) notes.push(x > 1 ? 'peak by ' + nice(x) + 'x off-peak' : x === 0 ? 'discounted by ÷FREE off-peak' : 'discounted by ÷' + nice(1 / x) + ' off-peak');
            if (st.conflict) notes.push('⚠️price⚠️'); }
          const costNote = toolCostOn && roundPaid > 0 ? cs(roundPaid) + (nCalls > 1 ? '÷' + nCalls : '') + (notes.length ? ' (' + notes.join(' and ') + ')' : '') : null;
          const results = await Promise.all(toolCalls.map(async tc => ({ tc, resStr:await execTool(tc, controller.signal, T.alias) })));
          results.forEach(({ tc, resStr }) => {
            let toolContent = resStr;
            /* the note goes right after "ms" (else last) in an object result; any other result is wrapped as { result } */
            if (costNote != null){
              let p; try { p = JSON.parse(resStr); } catch(e){ p = null; }
              const o = {}, K = 'cost_of_this_tool_round_thinking_included'; let put = false;
              if (p && typeof p === 'object' && !Array.isArray(p)) Object.keys(p).forEach(k => { o[k] = p[k]; if (k === 'ms'){ o[K] = costNote; put = true; } });
              else o.result = p !== null ? p : resStr;
              if (!put) o[K] = costNote;
              toolContent = JSON.stringify(o, null, 2);
            }
            uiContent += '\n\n```javascript\n// Executing: ' + (tc.function && tc.function.name) + '\n' + (tc.function && tc.function.arguments) + '\n```\n';
            if (md0.tools[tc.function.name] != null) md0.tools[tc.function.name]++;
            toolEvents.push({ role:'tool', tool_call_id:tc.id, content:toolContent });
            uiContent += '\n```json\n// Result\n' + toolContent + '\n```\n\n';
            node.versions[vIndex].rawContent = uiContent;
            if (node.activeVersion === vIndex) updateNodeDOM(node);
          });
          node.versions[vIndex].toolBatch = { requested:toolCalls.length, executed:results.length, names:results.map(x => x.tc.function.name) };
          if (controller.signal.aborted) break;
          continue;
        }
        break;
      }
      } finally {
      node.versions[vIndex].rawContent = uiContent + turnC;
      node.versions[vIndex].llmContent = llmContent + turnC;
      node.versions[vIndex].thinking = uiThinking + turnT;
      if (msgSearchCount) node.versions[vIndex].searches = msgSearchCount;
      if (toolEvents.length) node.versions[vIndex]._toolEvents = toolEvents;
      /* label: the state the last round was priced in, and what the message paid ÷ its off-price cost */
      { const md = node.versions[vIndex].metadata, x = done ? ratio(done.paid, done.off) : null;
        md.pricing = { bucket:st.bucket, scalars:st.scalars, conflict:st.conflict, ts:Date.now(), net:x != null ? x : st.net, provider:r.p.id, model:r.m };
        md.peakCost = md.pricing.net > 1;
        unpriced(); const c = md.cost;                  /* the unfinished round too */
        if (missed && c && c.calculated && !/\+$/.test(String(c.calculated.total))) c.calculated.total += '+'; }
      const searched = NS.stats.searchCalls - sc0; if (md0.tools.web_search != null && searched > 0) md0.tools.web_search += searched;
      }
      /* Stop pressed before the reply finished (e.g. while a tool ran): the app marks it "Stopped by user"; Stop during the save below keeps it complete */
      if (controller.signal.aborted) throw new DOMException('Stopped by user', 'AbortError');
      await saveStreamBuffer(node, vIndex);
      node.versions[vIndex].endTime = node.lastUpdateTime || Date.now();
      finalizeGeneration(node, vIndex, controller);
    }
  };
}

/* ============================ MARKED ============================ */
/* marked.js renders messages while the Marked switch is on and the library is loaded; else the app's own renderer */
function renderMarked(raw, plain){
  const lib = window.marked;
  if (!lib || !raw) return plain(raw);
  try {
    const renderer = { code:token => { const text = (token && token.text != null) ? token.text : String(token || ''); const lang = (token && token.lang) || 'plain'; return buildCodeBlockHTML(lang, text + '\n', !!(settings.blockAutoCollapse && text.length > settings.blockCollapseSize)); } };
    if (typeof lib.Marked === 'function') return new lib.Marked({ gfm:true, breaks:true, renderer }).parse(String(raw));
    if (typeof lib.parse === 'function'){ const r = new lib.Renderer(); r.code = renderer.code; return lib.parse(String(raw), { renderer:r, breaks:true, gfm:true }); }
  } catch(e){ warn('marked render failed: ' + e.message); }
  return plain(raw);
}
function markedMake(next){ return function(raw){ return NS.flags.marked ? renderMarked(raw, x => next.call(this, x)) : next.call(this, raw); }; }
function loadMarked(){
  if (NS.markedReady) return Promise.resolve(true);
  if (NS.markedLoading) return NS.markedLoading;
  if (window.marked && (window.marked.parse || window.marked.Marked)){ NS.markedReady = true; return Promise.resolve(true); }
  NS.markedLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = NS.config.markedSrc; s.crossOrigin = 'anonymous';
    s.onload = () => { s.remove(); if (window.marked && (window.marked.parse || window.marked.Marked)) resolve(true); else reject(Error('marked unusable')); };
    s.onerror = () => { s.remove(); reject(Error('marked blocked')); };
    document.head.appendChild(s);
  }).then(ok => { NS.markedReady = ok; NS.markedLoading = null; try { renderFullChat(); } catch(e){} return ok; }).catch(e => { NS.markedLoading = null; warn(e.message); return false; });
  return NS.markedLoading;
}

/* ============================ UI ============================ */
const updateStats = (mode, model, url) => { NS.stats.last = { mode, model, url, ts:Date.now() }; updateStatus(); };
function removeStatusPill(){ const el = document.getElementById('eval1Pill'); if (el) el.remove(); }
function ensureStatusPill(){
  let el = document.getElementById('eval1Pill');
  if (el) return el;
  el = document.createElement('span');
  el.id = 'eval1Pill';
  el.style.cssText = 'font-size:.68rem;padding:2px 8px;border-radius:6px;background:var(--border);color:var(--text-secondary);font-family:monospace;white-space:nowrap;cursor:help;';
  el.title = 'eval1 — click to cycle API mode';
  el.addEventListener('click', () => NS.set('mode', NS.config.mode === 'responses' ? 'chat' : NS.config.mode === 'chat' ? 'auto' : 'responses'));
  const hr = document.querySelector('.header-right');
  if (hr) hr.insertBefore(el, hr.firstChild);
  return el;
}
function updateStatus(){
  if (!NS.flags.pill){ removeStatusPill(); return; }
  const el = ensureStatusPill();
  let s = 'API ' + (NS.stats.last.mode || (NS.flags.hybrid ? NS.config.mode : 'off'));
  if (NS.stats.last.model) s += ' · ' + NS.stats.last.model;
  if (NS.stats.searchCalls && NS.config.showSearchTrace) s += ' · 🔎' + NS.stats.searchCalls;
  el.textContent = s;
  el.title = 'mode:' + NS.config.mode + ' · transformed:' + NS.stats.transformed + ' · passthrough:' + NS.stats.passthrough + ' · searchCalls:' + NS.stats.searchCalls;
}

/* code-block UX: collapse memory + tool-echo collapse + tool font. A block is named by its message, that message's
   version (place + creation time) and its own place in it: nodeId|v<index>.<time>|<block number>. Only clicks that
   differ from the block's default are remembered; toggling back forgets, so untouched blocks follow the settings. */
const blockOverrides = {}, blockOrder = [];
const msgKey = node => { const i = (node && node.activeVersion) || 0, v = node && node.versions && node.versions[i]; return v ? { id:node.id + '|v' + i + '.' + (v.e || 0), n:0 } : null; };
let renderMsg = null;                            /* the message being drawn: its key and a block counter */
const withMsg = (node, fn) => { const p = renderMsg; renderMsg = msgKey(node); try { return fn(); } finally { renderMsg = p; } };
function codeblockMake(next){
  return function(lang, c, collapsed){
    const cnt = String(c || ''), key = renderMsg ? renderMsg.id + '|' + renderMsg.n++ : null, ov = key && blockOverrides[key];
    const isToolEcho = cnt.indexOf('// Executing:') === 0 || cnt.indexOf('// Result') === 0;   /* call and result blocks */
    let dflt = !!collapsed;
    /* off = never auto-collapse; on with 0 = collapse every tool echo */
    if (NS.config.toolEchoCollapseOn !== false && NS.config.toolEchoCollapseChars >= 0 && isToolEcho && cnt.length > NS.config.toolEchoCollapseChars) dflt = true;
    const eff = ov === 'open' ? false : ov === 'close' ? true : dflt;
    let html = next.call(this, lang, cnt, eff);
    if (isToolEcho && NS.config.toolFontScale){
      const prod = (settings.fontScale || defaultSettings.fontScale) * NS.config.toolFontScale;
      html = html.replace('<div class="code-block">', '<div class="code-block" style="--block-font-scale:' + prod + '">');
    }
    return html.replace('<div class="code-block"', '<div class="code-block" data-dflt="' + (dflt ? 1 : 0) + '"');
  };
}
/* the app draws every message with createMessageDOM: its code blocks get their names, its cost pill its colour */
function renderMsgMake(next){ return function(node){ return withMsg(node, () => { const el = next.apply(this, arguments); try { paintPills(el); } catch(e){} return el; }); }; }
/* a message's cost pill colour, from its own label (metadata.pricing.net); labels older than that fall back to peakCost */
const paintPills = root => root.querySelectorAll('.msg-stats .cost-pill[data-node-id]').forEach(p => {
  const n = chatTree.nodes[p.dataset.nodeId], v = n && n.versions && n.versions[n.activeVersion], md = v && v.metadata; if (!md) return;
  const pr = md.pricing, b = pr ? pr.bucket : md.peakCost && window.__pricingEngine.hasRealPeak(md.model, md.provider) ? 'peak' : 'off';
  const net = pr && pr.net != null ? pr.net : (b === 'peak' ? pricingRule('peakFactorFallback', providers[md.provider] || null) : 1) * ((pr && pr.scalars || []).reduce((a, x) => a * (typeof x === 'number' ? x : 1), 1));
  p.classList.toggle('peak-cost', net > 1);
  p.classList.toggle('discount-cost', net > 0 && net < 1);
  p.classList.toggle('free-cost', net === 0);
  p.title = net > 1 ? 'generated at peak' : net === 0 ? 'free' : net < 1 ? 'generated during discount' : 'off-peak';
});
const rememberBlock = (bl, isCollapsed) => {
  const msg = bl.closest('.message'), k = msg && msgKey(chatTree.nodes[msg.dataset.msgId]); if (!k) return;
  const key = k.id + '|' + Array.prototype.indexOf.call(msg.querySelectorAll('.code-block'), bl);
  const i = blockOrder.indexOf(key); if (i >= 0) blockOrder.splice(i, 1);
  if (bl.dataset.dflt != null && isCollapsed === (bl.dataset.dflt === '1')){ delete blockOverrides[key]; return; }
  blockOverrides[key] = isCollapsed ? 'close' : 'open'; blockOrder.push(key);
  while (blockOrder.length > 400) delete blockOverrides[blockOrder.shift()];
};
const blockClick = e => {
  const hf = e.target.closest && e.target.closest('.code-header, .code-footer'); if (!hf) return;
  if (e.target.closest('button')) return;
  const bl = hf.closest('.code-block'), bd = bl && bl.querySelector('.code-body'); if (!bd) return;
  /* arrows are toggled by the host's own handler after this one; just record the resulting state */
  if (e.target.closest('.block-arrow')){ rememberBlock(bl, !bd.classList.contains('collapsed')); return; }
  const ic = bd.classList.toggle('collapsed');
  bl.querySelectorAll('.down,.up').forEach(el => el.classList.toggle('collapsed', ic));
  rememberBlock(bl, ic);
  e.preventDefault();
};
on(document, 'click', blockClick, true);

/* peak display: one tick (every second while the add-on is on) reads the current selection's price state —
   page colour, and a countdown to the next price change when that kind of change is switched on and the
   model's schedule has it. The timer sits under the header (defPos) and can be dragged. */
function defPos(){
  const te = document.getElementById('dse-peak-timer'); if (!te) return;
  const h = document.querySelector('.header h1');
  if (h){ const r = h.getBoundingClientRect(); te.style.left = (r.left - 5) + 'px'; te.style.top = (r.bottom + 2) + 'px'; return; }
  const c = document.getElementById('chatContainer');
  if (c){ const cr = c.getBoundingClientRect(); te.style.left = (cr.left + 16) + 'px'; te.style.top = (cr.top + 16) + 'px'; }
}
let peakTimerEl = null;
function ensurePeakTimer(){
  if (peakTimerEl && peakTimerEl.isConnected) return peakTimerEl;
  document.querySelectorAll('#dse-peak-timer').forEach(x => x.remove());   /* one left by an earlier paste */
  peakTimerEl = document.createElement('div');
  peakTimerEl.id = 'dse-peak-timer';
  peakTimerEl.style.cssText = 'position:absolute;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;letter-spacing:1.2px;padding:0 2px;background:transparent;border:none;line-height:1;white-space:nowrap;cursor:grab;user-select:none;display:none;z-index:8990;pointer-events:auto;opacity:.8';
  document.body.appendChild(peakTimerEl); defPos();
  let dr = false, dx = 0, dy = 0;
  peakTimerEl.addEventListener('pointerdown', e => { dr = true; dx = e.clientX - peakTimerEl.getBoundingClientRect().left; dy = e.clientY - peakTimerEl.getBoundingClientRect().top; peakTimerEl.setPointerCapture(e.pointerId); peakTimerEl.style.cursor = 'grabbing'; e.preventDefault(); });
  peakTimerEl.addEventListener('pointermove', e => { if (!dr) return; peakTimerEl.style.left = (e.clientX - dx) + 'px'; peakTimerEl.style.top = (e.clientY - dy) + 'px'; });
  peakTimerEl.addEventListener('pointerup', () => { dr = false; peakTimerEl.style.cursor = 'grab'; });
  return peakTimerEl;
}
function applyPeakDisplay(){
  const now = Date.now(), st = safeState(null, now), net = st.net, m = st.mode, k = st.kinds, pc = NS.config.peakCounter || 'off', dc = NS.config.discountCounter || 'off';
  document.body.classList.toggle('dse-peak', m === 'peak');
  document.body.classList.toggle('dse-discount', m === 'discount');
  document.body.classList.toggle('dse-free', m === 'free');
  window.__dsePeakState = { peak:m === 'peak', net, mode:m, bucket:st.bucket, hasPeak:k.peak, hasDiscount:k.discount, boundaryAt:st.next };
  /* a countdown kind only runs for a model whose schedule has that kind; no next change → no countdown */
  const show = st.next != null && (m === 'peak' ? k.peak && pc !== 'off'
    : m === 'discount' || m === 'free' ? k.discount && dc !== 'off'
    : (k.peak && pc === 'next') || (k.discount && dc === 'next'));
  if (show){
    const ss = Math.ceil((st.next - now) / 1000), two = n => String(n).padStart(2, '0'), el = ensurePeakTimer();
    el.textContent = two(Math.floor(ss / 3600)) + ':' + two(Math.floor(ss % 3600 / 60)) + ':' + two(ss % 60);
    el.style.display = 'block'; el.style.color = m === 'peak' ? 'var(--danger)' : m === 'off' ? '#e8e8e8' : 'var(--success)';
  } else if (peakTimerEl) peakTimerEl.style.display = 'none';
}
const peakTick = () => { try { applyPeakDisplay(); } catch(e){} };
every(1000, peakTick);
added(() => { if (peakTimerEl) peakTimerEl.remove(); peakTimerEl = null; document.body.classList.remove('dse-peak', 'dse-discount', 'dse-free'); });
/* selection changes: the model list is also refilled without a change event (provider switch, Apply, key save) */
/* model list, after the app fills it: fallback models its /models answer lacks are added back, half grey (the answer is
   kept in memory only), and the model picked here, else the saved one, is selected again; Save stores the pick */
const apiModels = {}, picked = {};
swap('fetchModels', o => async function(id = activeProviderId){ const list = await o.apply(this, arguments);
  if (list && list.length) apiModels[id] = new Set(list); else delete apiModels[id]; return list; });
const modelsFilled = () => { const sel = els.modelSelect, id = activeProviderId, api = apiModels[id], has = m => Array.from(sel.options).some(o => o.value === m);
  if (!sel.disabled){                            /* not while "Loading..." */
    if (api) modelIds(providers[id]).forEach(m => { if (!has(m)) sel.add(new Option(m, m)); });
    Array.from(sel.options).forEach(o => { const risky = !!api && !api.has(o.value); o.classList.toggle('o', risky); if (risky) o.title = 'not in provider /models (risk)'; else o.removeAttribute('title'); });
    const want = picked[id] || (getMetadata().models || {})[id];
    if (want && want !== sel.value && has(want)){ sel.value = want; updateSendBtn(); } }
  peakTick(); };
on(els.modelSelect, 'change', () => { picked[activeProviderId] = els.modelSelect.value; peakTick(); });
watch(els.modelSelect, { childList:true }, modelsFilled);

/* ============================ STYLES ============================ */
/* one sheet for everything A draws (taken back by disable()) */
mine(document.head.appendChild(Object.assign(document.createElement('style'), { id:'eval1-ui', textContent:
  '.exp-info{background:none;border:1px solid var(--border);color:var(--text-secondary);border-radius:50%;width:17px;height:17px;font-size:10px;line-height:1;padding:0;cursor:help;vertical-align:middle;margin-left:4px;flex-shrink:0}.exp-info:hover{background:var(--border);color:var(--text)}.exp-popup-wrap{position:fixed;inset:0;z-index:8900;pointer-events:none}.exp-popup-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45);pointer-events:none}.exp-popup{position:absolute;top:max(64px,calc(env(safe-area-inset-top,0px) + 56px + 8px));left:50%;transform:translateX(-50%);width:min(540px,calc(100dvw - 24px));max-height:calc(100dvh - 120px);display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.6);pointer-events:auto;overflow:hidden}.exp-popup-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600;font-size:.85rem}.exp-popup-x{background:none;border:none;color:var(--text-secondary);font-size:1.2rem;cursor:pointer;line-height:1;padding:0 4px}.exp-popup-x:hover{color:var(--text)}.exp-popup-body{padding:12px 14px;overflow-y:auto;font-size:.78rem;line-height:1.6;color:var(--text)}.exp-popup-foot{padding:8px 14px;border-top:1px solid var(--border);display:flex;justify-content:flex-end}.exp-popup-close{background:var(--accent);color:#fff;border:none;padding:5px 14px;border-radius:8px;font-size:.75rem;cursor:pointer}.code-header,.code-footer{cursor:pointer;user-select:none}.block-arrow{display:inline-grid;place-content:center;min-width:24px;min-height:24px;padding:4px 8px;margin:-4px -8px;border-radius:4px}.block-arrow:hover{background:rgba(255,255,255,.08)}body.dse-peak .send-btn{-webkit-text-stroke:1px var(--danger);-webkit-text-fill-color:#fff;color:#fff}.settings-panel{max-height:calc((100dvh - 56px - 96px) * 0.95)!important;overflow:hidden!important;padding:.6em .9em!important}.settings-panel>.tabs{flex-shrink:0!important;overflow:hidden!important;margin-bottom:.25em!important}.settings-panel>.tabs .tab-btn{padding:.15em .3em!important;font-size:.75rem!important;display:inline!important}.settings-panel>.tab-content{display:none!important;flex-direction:column!important;min-height:0!important}.settings-panel>.tab-content.active{display:flex!important;flex:1 1 auto!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-gutter:stable!important;padding:4px 12px 4px 4px!important;gap:8px!important}.settings-panel>#applySettingsBtn{flex-shrink:0!important;margin-top:8px!important}.settings-panel select{field-sizing:content!important;min-width:0!important;flex:0 1 auto!important}.settings-panel .setting-row select{margin-left:auto!important}.settings-panel input:not([type="checkbox"]):not([type="file"]):not([type="range"]),.settings-panel textarea:not(.xt),.input-area textarea{box-sizing:content-box!important;padding-right:calc(10% + 3ch)!important}#aL .ar,#swarmRows .ar{grid-template-columns:auto minmax(0,1fr) auto!important;column-gap:8px!important;padding:2px 8px!important;min-height:34px!important;border-radius:8px!important}#aL .ag{display:flex!important;flex-wrap:nowrap!important;align-items:center!important;gap:4px!important;overflow:hidden!important}#aL .af{display:inline-flex!important;align-items:center!important;gap:2px!important;font-size:10px!important;flex-shrink:1!important;min-width:0!important}#aL .xt{height:24px!important;min-height:24px!important;max-height:24px!important;field-sizing:fixed!important;padding:0 4px!important;line-height:24px!important;font-size:11px!important;overflow:hidden!important}#aL .ar b{font-size:11px!important;white-space:nowrap!important;align-self:center!important}#tab-swarm{gap:.2em!important}'
  + '#settingsPanel input:not([type="checkbox"]):not([type="file"]):not([type="range"]){box-sizing:content-box!important;padding:4px 8px!important;padding-inline-end:calc(var(--text-w,0px) * 0.1 + 3ch)!important;min-width:0!important;width:auto!important;field-sizing:content!important;flex-shrink:0!important}#settingsPanel select{width:auto!important;max-width:100%!important;flex:0 1 auto!important}#settingsPanel .setting-row{flex-wrap:nowrap!important;align-items:center!important;min-height:24px!important}#settingsPanel .setting-row>span:first-child{flex:0 1 auto!important;min-width:0!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}#settingsPanel .setting-row label.toggle{margin-left:auto!important;flex-shrink:0!important}#tab-exp select{min-width:0!important;padding:2px .5em!important;padding-right:calc(2% + 1ch)!important;line-height:1.3!important}#tab-io select{padding:2px .5em!important;padding-right:calc(2% + 1ch)!important;max-width:100%!important}#tab-exp .setting-row>span:last-child{margin-left:auto!important;display:inline-flex!important;align-items:center!important;gap:6px!important}#tab-other .setting-row:has(>div)>label.toggle{margin-left:0!important}.exp-tabs{margin-bottom:8px!important;padding-bottom:4px!important}.exp-tabs .tab-btn{font-size:.72rem!important;padding:3px 8px!important}#tab-exp>.tab-content{gap:4px!important}#tab-exp .setting-row>span:first-child{font-size:12px!important}#tab-model{padding-right:.3em!important}#settingsPanel #providerSelect{flex:1 1 0%!important;field-sizing:fixed!important;max-width:none!important}#settingsPanel #modelSelect{width:100%!important;max-width:none!important;align-self:stretch!important}#apiKeyInput{flex:1 1 0%!important;field-sizing:fixed!important;padding-right:calc(10% + 3ch)!important}'
  + '.msg-stats .cost-pill.peak-cost{color:var(--danger)!important;font-weight:800!important}.msg-stats .cost-pill.discount-cost,.msg-stats .cost-pill.free-cost{color:var(--success)!important;font-weight:800!important}body.dse-discount .send-btn,body.dse-free .send-btn{-webkit-text-stroke:1px var(--success);-webkit-text-fill-color:#fff;color:#fff}.send-btn.relaxed-busy{box-shadow:0 0 0 2px rgba(224,85,106,.75),0 0 8px rgba(224,85,106,.35)!important}#costInfo [data-bal68line]{white-space:nowrap!important;overflow:hidden!important;max-width:100%!important}#tab-exp .exp-tabs{flex-shrink:0!important;height:auto!important;min-height:24px!important;overflow:visible!important}#tab-exp .exp-tabs .tab-btn{flex-shrink:0!important;display:inline-block!important}#settingsPanel #tab-other .setting-row:has(#rBX)>label.toggle{margin-left:4.33em!important}#rBX{text-align:right!important}#settingsPanel #expAutoSourceToken{padding:1px 6px!important;padding-right:calc(var(--text-w,0px)*var(--ap,0.1) + var(--ach,3ch))!important;padding-inline-end:calc(var(--text-w,0px)*var(--ap,0.1) + var(--ach,3ch))!important}.bubble table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.85rem;overflow-x:auto;display:block}.bubble th,.bubble td{border:1px solid var(--border);padding:8px 12px;text-align:left}.bubble th{background:rgba(0,0,0,.3);font-weight:bold;color:var(--accent)}.bubble tbody tr:nth-child(even){background:rgba(0,0,0,.15)}' })));
/* default code font scale 0.8 */
/* only while the setting equals the app's own default (read from the app) and that default isn't 0.8 already;
   disable() puts the app's default back only if it is still this 0.8 */
{ const APP = defaultSettings.fontScale, NEW = 0.8;
  const put = v => { settings.fontScale = v; const e = document.getElementById('fontScale'); if (e) e.value = String(v); document.documentElement.style.setProperty('--block-font-scale', String(v)); };
  if (APP !== NEW && (settings.fontScale == null || settings.fontScale === APP)){ added(() => { if (settings.fontScale === NEW) put(APP); }); put(NEW); } }

/* ============================ EXP TAB ============================ */
/* ⓘ texts. A text starting with '!' is shown by alert() only; any other opens the popup (line breaks kept). In
   General every other ⓘ also alerts its own label, as it always did. */
const INFO = {
  'About':'eval1 v' + VERSION + ' — experimental controls. Persists via dse_eval1_config.',
  'API mode':'auto per-model routing · chat force chat · responses profiled models → /responses.',
  'Peak counter':'off / only till end peak / till next state — countdown to the selected model\'s next price change.',
  'Web search':'Attach the server web_search tool where supported.',
  'Show 🔎 trace':'Print [web_search] query into thinking block + header count.',
  'Agentic tools':'Attach the active tool (tool_eval_5) so the model can run JS.',
  'Tool block collapse':'Auto-collapse tool call and tool result code blocks over [amount] chars.',
  'Thinking history':'all / only when tools / off — whether reasoning is sent back to the API.',
  'Paint interval (ms)':'Delta-coalescer cadence for streaming UI updates.',
  'Status pill':'Header indicator; click cycles auto→chat→responses.',
  'Marked tables':'marked.js GFM renderer. Raw HTML NOT sanitized.',
  'Anthropic bridge':'DeepSeek chat → /anthropic/v1/messages with web_search_20250305.',
  'Streaming bridge':'Stream DeepSeek chat via anthropic SSE translation.',
  'Responses hybrid':'Chat → /responses for profiled models (deepseek-v4-*, gpt-5.6-*).',
  'routing algorithm':'Where the next request goes given mode + toggles.',
  'Eval tool version':'Which tool_eval schema is attached.\n 1 = original schema \n 2 = capability-wording schema \n 3 = worker-first \n 4 = current schema \n 5 = mixed-tool nudge schema \n 6 = cost-annotated (per-round cost in tool result) \n 7 = future placeholder \n Schemas 1-5 are the 52-55.js era; 6 is the 56.js schema. "auto" = per-model last-used (seeded from visible branch, fallback 7); "off" = disabled.',
  'Name override (cache mask)':'Rename the attached eval tool (cache-mask: avoids repeated identical tool schemas colliding as cache keys).',
  'Tool limit per message':'Max tool-call rounds the agentic loop may run for a single message.\n 0 = inspect mode (shown orange): one request, tool calls are shown but never run.\n Switch off = no limit.',
  'Tool font scale':'Font scale for tool-echo code blocks (compounds with the global code font scale).',
  'use eval in providers':'Runs provider eval code synchronously before each API request (only when the provider JSON has an eval field). Security: creating a NEW provider (+) whose JSON contains eval auto-flips this OFF · editing an existing provider (even renaming it) does NOT trigger that. The auto-seal is skipped if "technical" + "Riskier" are enabled. Manual toggle always works.',
  'api shape':'placeholder',
  'pricing':'placeholder',
  'record balance snapshot per message':'default off — when on, each new message stores a balance snapshot in that version metadata.balance. access: node.versions[n].metadata.balance → {v, v2, mode, currency, t, provider, keyHash}',
  'Tool round cost in its results':'Appends cost_of_this_tool_round_thinking_included to each tool result — cost of the LLM round that issued the call(s), thinking included. Shown right under "ms" in the JSON; "÷N" when N tools run in parallel (input read once, cost shared). Toggle off to send raw tool results.',
  'relaxed send criteria':'!Default OFF. When ON, send works whenever text is in the input, even while a stale/busy generation blocks the normal button. Delete the text or turn OFF to hold sending.',
  'aggressive stale hunter':'!Default OFF. Auto-finalizes streams that already produced content then stay silent past [ms] (default 15 min) - same as pressing Stop; received content is kept as-is. Targets only mid-stream silences. If your model can pause longer than [ms] or takes >1h to respond, raise [ms] or keep this OFF.',
  'discount counter':'!Countdown while a discount/free period is active (green) or upcoming (next). Default OFF.',
  'cost estimate before send ($ limit)':'!Default OFF. When ON, pressing Send (or Enter) first estimates the input price of the request that would go out. If the cache-missed price is over the $ limit, nothing happens except a popup: no message is made and nothing is sent. The popup shows the cache-hit and cache-miss price as multiples of the limit, and how long ago this model was last used on this branch.\nSend the same request again to send it anyway. Anything changed (text, model, max tokens, tools) shows the popup again.\nKnown part: the input tokens of this model\'s last request on the branch (it can be a cache hit). The rest is counted as characters ÷ 4 (a miss). Output is not included.\nOnly Send/Enter is checked: regenerate, branch edits and tool rounds are not.\nThe row can be changed only with Riskier and technical both on.',
  'auto update source to default→[edited] when edited':"!When ON (default): manually applying provider JSON (pen → Apply JSON) on a provider whose source is exactly 'default' auto-updates source to the token below (default 'edited'), so the edit survives next-load migration. Token 'default' = effectively off. OFF: editing never touches source. Orthogonal to migration."
};
function popupHTML(text, title){
  const old = document.getElementById('expPopupWrap'); if (old) old.remove();
  const w = document.createElement('div'); w.id = 'expPopupWrap'; w.className = 'exp-popup-wrap';
  w.innerHTML = '<div class="exp-popup-backdrop"></div><div class="exp-popup"><div class="exp-popup-head"><span>' + esc(title) + '</span><button class="exp-popup-x" data-expx="1">×</button></div><div class="exp-popup-body">' + text + '</div><div class="exp-popup-foot"><button class="exp-popup-close" data-expx="1">Close</button></div></div>';
  document.body.appendChild(w);
  w.addEventListener('click', e => { if (e.target.closest('[data-expx]')){ w.remove(); return; } if (!e.target.closest('.exp-popup')) w.remove(); });
}
function removeExpTab(){
  const b = document.querySelector('.tab-btn[data-tab="exp"]'); if (b) b.remove();
  const c = document.getElementById('tab-exp'); if (c) c.remove();
  const w = document.getElementById('expPopupWrap'); if (w) w.remove();
}
/* Exp controls say what they set: data-set="<setting>" or data-flag="<switch>". The app's own settings-panel
   handler skips controls carrying data attributes, so they never re-save the app's settings or redraw the chat. */
function buildExpTab(rebuild){
  removeExpTab();
  const swarmBtn = document.querySelector('.tab-btn[data-tab="swarm"]'), swarmTab = document.getElementById('tab-swarm');
  if (!swarmBtn || !swarmTab) return;
  swarmBtn.insertAdjacentHTML('afterend', '<button class="tab-btn" data-tab="exp">Exp</button>');
  const C = NS.config, F = NS.flags, CNT = [['off','off'],['end','till end'],['next','till next']], OAN = [['off'],['auto'],['on']];
  const row = (label, ctrl) => '<div class="setting-row"><span>' + esc(label) + '<button type="button" class="exp-info" title="' + esc(label) + '">ⓘ</button></span>' + ctrl + '</div>';
  const tg = (id, k, on, flag) => '<label class="toggle"><input type="checkbox" id="' + id + '" ' + (flag ? 'data-flag' : 'data-set') + '="' + k + '"' + (on ? ' checked' : '') + '><span class="slider"></span></label>';
  const opt = (v, l, cur) => '<option value="' + v + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + (l || v) + '</option>';
  const sel = (id, k, list) => '<select id="' + id + '" data-set="' + k + '">' + list.map(o => opt(o[0], o[1], C[k])).join('') + '</select>';
  const num = (id, k, attrs) => '<input type="number" id="' + id + '" data-set="' + k + '" ' + attrs + ' value="' + C[k] + '">';
  const pair = h => '<span style="display:inline-flex;align-items:center;gap:6px">' + h + '</span>';
  const ver = (v, l) => opt(v, l, C.evalToolVersion);
  const subs = {
    general:[
      row('API mode', sel('expMode', 'mode', [['auto'],['chat'],['responses']])),
      row('use eval in providers', tg('expEvalInProviders', 'evalInProviders', C.evalInProviders)),
      row('Peak counter', sel('expPeakCounter', 'peakCounter', CNT)),
      row('discount counter', sel('expDiscountCounter', 'discountCounter', CNT)),
      row('Thinking history', sel('expThinkingHistory', 'thinkingHistory', [['all'],['tools'],['off']])),
      row('relaxed send criteria', tg('expRelaxedSend', 'relaxedSendCriteria', C.relaxedSendCriteria)),
      row('aggressive stale hunter', tg('expStaleHunter', 'staleHunter', C.staleHunter) + num('expStaleHunterMs', 'staleHunterMs', 'min="60000" step="60000" style="width:90px"')),
      row('Cost balance', sel('expCostBalance', 'costBalance', [['off','off'],['current','current key'],['provider','all in current provider'],['all','all keys']])),
      row('record balance snapshot per message', tg('expBalanceSnap', 'balanceSnap', C.balanceSnap)),
      row('cost estimate before send ($ limit)', pair(num('expEstimateLimit', 'estimateLimitUsd', 'min="0" step="0.01" style="width:75px"') + tg('expEstimateOn', 'estimateOn', C.estimateOn))),
      row('Status pill', tg('expPill', 'pill', F.pill, 1)), row('Anthropic bridge', tg('expAnthropic', 'anthropic', F.anthropic, 1)),
      row('Streaming bridge', tg('expBridgeStream', 'bridgeStream', F.bridgeStream, 1)), row('Responses hybrid', tg('expHybrid', 'hybrid', F.hybrid, 1)),
      row('Marked tables', tg('expMarked', 'marked', F.marked, 1)),
      row('Paint interval (ms)', num('expPaint', 'paintIntervalMs', 'min="40" step="10" style="width:75px"')),
      row('routing algorithm', '<span id="expRoute" style="display:none"></span><button type="button" id="expRouteBtn" class="btn-outline" style="margin-left:auto">details ⓘ</button>'),
      row('About', '<span style="font-size:.68rem;color:var(--text-secondary)">v' + VERSION + '</span>')],
    tools:[
      row('Agentic tools', sel('expToolsMode', 'agenticTools', [['on'],['auto','auto(to cache hit)'],['off']])),
      row('Eval tool version', '<select id="expEvalToolVersion" data-set="evalToolVersion">' + ver('off') + ver('auto', 'auto (last used)') + '<optgroup label="52-55.js">' + [1,2,3,4,5].map(i => ver(i, 'tool_eval_' + i)).join('') + '</optgroup><optgroup label="56.js">' + ver(6, 'tool_eval_6 (cost-annotated)') + '</optgroup><optgroup label="60.js">' + ver(7, 'tool_eval_7 (60.js)') + '</optgroup></select>'),
      row('Name override (cache mask)', pair('<input type="text" id="expEvalToolNameOverride" data-set="evalToolNameOverride" placeholder="tool_eval_1" value="' + esc(C.evalToolNameOverride) + '" style="width:90px;box-sizing:content-box;min-width:90px;padding:4px 8px">' + tg('expEvalToolNameOverrideOn', 'evalToolNameOverrideOn', C.evalToolNameOverrideOn))),
      row('Tool limit per message', pair(num('expToolMaxTurns', 'toolMaxTurns', 'min="0" step="1"') + tg('expToolMaxTurnsOn', 'toolMaxTurnsOn', C.toolMaxTurnsOn))),
      row('Tool round cost in its results', tg('expToolCost', 'toolCostNote', C.toolCostNote)),
      row('Web search', tg('expWebSearch', 'webSearch', C.webSearch)), row('Show 🔎 trace', tg('expShowTrace', 'showSearchTrace', C.showSearchTrace)),
      row('Tool block collapse', pair(num('expToolEchoCollapse', 'toolEchoCollapseChars', 'min="0" step="100"' + (C.toolEchoCollapseOn ? '' : ' disabled')) + tg('expToolEchoCollapseOn', 'toolEchoCollapseOn', C.toolEchoCollapseOn))),
      row('Tool font scale', num('expToolFontScale', 'toolFontScale', 'min="0.01" max="2" step="0.05"'))],
    fallbacks:[row('api shape', sel('expApiShape', 'apiShapeFallback', OAN)), row('pricing', sel('expPricing', 'pricingFallback', OAN))]
  };
  const names = Object.keys(subs);
  swarmTab.insertAdjacentHTML('afterend', '<div class="tab-content" id="tab-exp"><div class="tabs exp-tabs">'
    + names.map((n, i) => '<button class="tab-btn' + (i ? '' : ' active') + '" data-exp-sub="' + n + '">' + n[0].toUpperCase() + n.slice(1) + '</button>').join('') + '</div>'
    + names.map((n, i) => '<div class="tab-content' + (i ? '' : ' active') + '" id="exp-sub-' + n + '">' + subs[n].join('') + '</div>').join('') + '</div>');
  const tab = document.getElementById('tab-exp');
  document.querySelector('.tab-btn[data-tab="exp"]')._ = tab;              /* the app switches tabs through ._ */
  tab.querySelectorAll('.exp-tabs > .tab-btn').forEach(b => { b._ = document.getElementById('exp-sub-' + b.dataset.expSub); });
  tab.addEventListener('change', expChange); tab.addEventListener('click', expClick);
  updateExpRoute(); greyTools(); paintToolLimit(); lockEstimate();
  buildAutoSourceRow(document.getElementById('expRelaxedSend').closest('.setting-row'));   /* the rebuild removed the old row with the tab */
}
function expChange(e){
  const t = e.target, d = t.dataset, v = t.type === 'checkbox' ? t.checked : t.value;
  if (d.flag) NS.setFlag(d.flag, v ? 1 : 0);
  else if (d.set) try { NS.set(d.set, v); } catch(err){ showControls(d.set); }        /* refused: the control shows the setting again */
}
function expClick(e){
  if (e.target.id === 'expRouteBtn') return popupHTML('Routing algorithm:<br>' + esc(document.getElementById('expRoute').textContent), 'Routing');
  const b = e.target.closest('.exp-info'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const lab = b.title, t = INFO[lab];
  if (t && t[0] === '!') return alert(t.slice(1));
  if (t) popupHTML(t.split('\n').join('<br>'), lab);
  if (b.closest('#exp-sub-general')) alert(lab);
}
/* every control of a setting / switch shows its current value */
const showControls = k => document.querySelectorAll('[data-set="' + k + '"]').forEach(el => { el[el.type === 'checkbox' ? 'checked' : 'value'] = NS.config[k]; });
const showFlag = k => document.querySelectorAll('[data-flag="' + k + '"]').forEach(el => { el.checked = !!NS.flags[k]; });
function updateExpRoute(){
  const route = document.getElementById('expRoute'); if (!route) return;
  const m = NS.config.mode, parts = [];
  if (m === 'responses') parts.push('deepseek + gpt-5.6 → /responses');
  else if (m === 'chat') parts.push('all → chat (deepseek → anthropic bridge)');
  else parts.push('deepseek → anthropic bridge · openai profiled → /responses · others → chat');
  if (!NS.flags.anthropic) parts.push('anthropic OFF');
  if (!NS.flags.hybrid) parts.push('hybrid OFF');
  if (!toolsOn()) parts.push('tools OFF');
  route.textContent = parts.join(' · ');
}
/* the rows below Agentic tools: full grey when off (unused), half grey under auto (only the fallback), with a hint */
function greyTools(){
  const m = NS.config.agenticTools;
  ['expWebSearch','expEvalToolVersion','expEvalToolNameOverrideOn'].forEach(id => {
    const el = document.getElementById(id), row = el && el.closest('.setting-row'); if (!row) return;
    row.classList.toggle('o', m === 'off'); row.style.opacity = m === 'auto' ? '.75' : '';
    row.title = m === 'off' ? 'Agentic tools off: no tools are attached' : m === 'auto' ? "fallback only: used when this model has no earlier message on the branch; otherwise auto repeats that message's tools" : '';
  });
}
/* the cost estimate row can be changed only with Riskier and technical both on; otherwise its controls are greyed
   and locked (the saved setting still applies; __eval1.set still works) */
function lockEstimate(){
  const ok = !!(settings.z && NS.config.technicalUser);
  ['expEstimateOn','expEstimateLimit'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !ok; });
  const el = document.getElementById('expEstimateOn'), row = el && el.closest('.setting-row'); if (!row) return;
  row.classList.toggle('o', !ok); row.title = ok ? '' : 'locked: turn on Riskier (Other tab) and technical to change it';
}
on(document, 'change', e => { if (e.target && e.target.id === 'z') lockEstimate(); });
/* tool limit 0 with the limit on = inspect mode (calls shown, never run): the number turns orange */
function paintToolLimit(){
  const el = document.getElementById('expToolMaxTurns'); if (!el) return;
  const insp = NS.config.toolMaxTurnsOn !== false && NS.config.toolMaxTurns <= 0;
  el.style.color = insp ? 'var(--warning)' : ''; el.title = insp ? 'inspect mode: tool calls are shown, never run' : '';
}
/* auto source default→[token] row (General, after relaxed send); its fit runs with the panel layout */
let autoSrcFit = () => {};
function buildAutoSourceRow(anchorRow){
  const C = NS.config;
  const row = document.createElement('div'); row.className = 'setting-row'; row.style.cssText = 'flex-wrap:nowrap;align-items:center';
  row.innerHTML = '<div id="autoSrcLabel" style="display:inline-flex;align-items:center;gap:5px;flex:1;min-width:0">auto update source to default→<input type="text" id="expAutoSourceToken" data-set="autoSourceToken" value="' + esc(C.autoSourceToken) + '" style="font:inherit;min-width:40px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px"><span style="white-space:nowrap"> when edited</span><button type="button" class="exp-info" title="auto update source to default→[edited] when edited">ⓘ</button></div>'
    + '<label class="toggle"><input type="checkbox" id="expAutoSourceOn" data-set="autoSourceOn"' + (C.autoSourceOn ? ' checked' : '') + '><span class="slider"></span></label>';
  anchorRow.after(row);
  const lab = document.getElementById('autoSrcLabel'), inp = document.getElementById('expAutoSourceToken'), tgl = row.querySelector('.toggle');
  const comf = () => { inp.style.setProperty('--ap','0.1'); inp.style.setProperty('--ach','3ch'); };
  const tight = x => { x = Math.min(1, Math.max(0, x)); inp.style.setProperty('--ap', (0.1 - 0.07 * x).toFixed(4)); inp.style.setProperty('--ach', (3 - 2 * x).toFixed(2) + 'ch'); };
  autoSrcFit = () => { try {
    lab.style.fontSize = ''; lab.style.gap = '5px'; inp.style.minWidth = '40px'; comf();
    const av = Math.max(40, row.clientWidth - (tgl.offsetWidth || 32) - 12);
    const fits = () => { lab.style.whiteSpace = lab.style.flexWrap = 'nowrap'; const ok = lab.scrollWidth <= av; lab.style.whiteSpace = lab.style.flexWrap = ''; return ok; };
    if (fits()) return; lab.style.gap = '2px'; inp.style.minWidth = '0px'; if (fits()) { comf(); return; }
    const base = parseFloat(getComputedStyle(lab).fontSize) || 12, floor = base * 0.7;
    for (let f = base; f >= floor - 0.01; f -= 0.5) { tight((base - f) / (base - floor)); lab.style.fontSize = f + 'px'; if (fits()) return; }
    lab.style.fontSize = ''; lab.style.gap = '5px'; inp.style.minWidth = '40px'; comf();
  } catch(e){} };
  inp.oninput = autoSrcFit;
  autoSrcFit();
}

/* ============================ SETTINGS PANEL LAYOUT ============================ */
/* 45.js FIX 5 — UI collapser rows: combine value + on/off slider (msg + block) */
(() => {
  const findRow = id => { const el = document.getElementById(id); return el ? el.closest('.setting-row') : null; };
  const combine = (label, numId, tglId) => {
    const num = document.getElementById(numId), tglLabel = document.getElementById(tglId).parentElement;
    const sizeRow = findRow(numId), tglRow = findRow(tglId);
    if (!num || !tglLabel || !sizeRow || !tglRow || sizeRow === tglRow) return false;
    const row = document.createElement('div');
    row.className = 'setting-row';
    const lab = document.createElement('span'); lab.textContent = label;
    const ctrl = document.createElement('span');
    ctrl.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
    ctrl.appendChild(num); ctrl.appendChild(tglLabel);
    row.appendChild(lab); row.appendChild(ctrl);
    sizeRow.replaceWith(row); tglRow.remove();
    return true;
  };
  combine('Auto-collapse message', 'msgCollapseSize', 'msgAutoCollapse');
  combine('Auto-collapse block', 'blockCollapseSize', 'blockAutoCollapse');
})();
/* shorten import-mode dropdown option labels (values unchanged) */
(() => { const s = document.getElementById('importModeSelect'); if (!s) return; const m = { 'Merge same chats under main branches like 1.15':'merge same chat → branch 1.15', 'Merge only if different chat ID':'merge if different chat ID', 'Replace all with imported (getting backup suggested)':'replace all (backup suggested)' }; Array.from(s.options).forEach(o => { if (m[o.textContent]) o.textContent = m[o.textContent]; }); })();
/* redone on every panel change and on resize: a label or select that doesn't fit one line shrinks (to 70%); every
   editable input gets --text-w (its text width, for the 10% breathing room); the auto-source row refits */
const shrink = (el, min, fits = () => el.scrollWidth <= el.clientWidth + 1) => { let fs = parseFloat(getComputedStyle(el).fontSize) || 12, n = 0; while (!fits() && fs > min && n++ < 40){ fs -= 0.5; el.style.fontSize = fs + 'px'; } };
const measure = mine(document.body.appendChild(document.createElement('span')));
const textWidth = inp => { const cs = getComputedStyle(inp);
  measure.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;pointer-events:none;font:' + cs.font + ';letter-spacing:' + cs.letterSpacing + ';padding-left:' + cs.paddingLeft + ';border-left:' + cs.borderLeftWidth + ' solid';
  measure.textContent = inp.value || inp.placeholder || ''; inp.style.setProperty('--text-w', measure.getBoundingClientRect().width + 'px'); };
const layoutPanel = () => {
  document.querySelectorAll('#settingsPanel .setting-row > span:first-child, #settingsPanel select').forEach(el => { if (el.clientWidth > 0) shrink(el, 12 * 0.7 + 0.1); });
  document.querySelectorAll('#settingsPanel input:not([type="checkbox"]):not([type="file"]):not([type="range"])').forEach(textWidth);
  autoSrcFit();
};
const typed = e => { if (e.target.matches && e.target.matches('#settingsPanel input')) textWidth(e.target); };
on(document, 'input', typed); on(document, 'change', typed); on(window, 'resize', layoutPanel);
watch(els.settingsPanel, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] }, layoutPanel);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutPanel);
paintPills(document);   /* messages already on screen */

/* ============================ API + BOOT ============================ */
/* apply(): the page follows the switches (the wrappers and bridges read them when called) */
function apply(){
  if (NS.off) return warn('turned off by disable() — paste again to turn it back on');
  if (NS.flags.marked) loadMarked();
  if (NS.flags.pill) ensureStatusPill(); else removeStatusPill();
  if (!document.querySelector('.tab-btn[data-tab="exp"]')) buildExpTab();
  materializeTools(); updateStatus(); updateExpRoute();
  NS.installed = true;
}
function disable(){ while (TAKE_BACK.length) try { TAKE_BACK.pop()(); } catch(e){} NS.installed = false; NS.off = true; }
NS.apply = apply; NS.disable = disable;
const saveFlags = () => { try { localStorage.setItem('dse_eval1_flags', JSON.stringify(NS.flags)); } catch(e){} };
NS.setFlag = (name, val) => {
  if (FLAGS.indexOf(name) < 0) throw Error('unknown flag: ' + name);
  NS.flags[name] = val ? 1 : 0; showFlag(name); apply(); saveFlags();
  return JSON.parse(JSON.stringify(NS.flags));
};
/* table-driven settings: checked, stored, shown on every control of it, then applied */
NS.set = (k, v) => {
  const d = SETTERS[k]; if (!d) throw Error('unknown setting: ' + k);
  if (d.vals && d.vals.indexOf(v) < 0) throw Error('invalid value: ' + v);
  if (d.check && !d.check(v)) throw Error('invalid value: ' + v);
  if (d.bool) v = !!v;
  else if (d.num){ v = +v; if (!Number.isFinite(v)) v = d.def; if (d.min != null) v = Math.max(d.min, v); if (d.max != null) v = Math.min(d.max, v); }
  else if (d.str) v = String(v).trim();
  NS.config[k] = v; save(); showControls(k);
  if (d.apply) d.apply(v);
  return v;
};
const SETTERS = {
  mode:{ vals:['auto','chat','responses'], apply:() => { updateStatus(); updateExpRoute(); } },
  webSearch:{ bool:1, apply:updateStatus },
  showSearchTrace:{ bool:1, apply:updateStatus },
  paintIntervalMs:{ num:1, def:160, min:40 },
  thinkingHistory:{ vals:['all','tools','off'] },
  toolEchoCollapseChars:{ num:1, def:2000, min:0 },
  toolEchoCollapseOn:{ bool:1, apply:v => { const n = document.getElementById('expToolEchoCollapse'); if (n) n.disabled = !v; } },
  toolFontScale:{ num:1, def:0.7, min:0.01, max:2 },
  toolMaxTurns:{ num:1, def:100, min:0, apply:() => paintToolLimit() },
  toolMaxTurnsOn:{ bool:1, apply:() => paintToolLimit() },
  peakCounter:{ vals:['off','end','next'], apply:() => peakTick() },
  discountCounter:{ vals:['off','end','next'], apply:() => peakTick() },
  evalToolVersion:{ check:v => v === 'off' || v === 'auto' || (Number.isInteger(+v) && +v >= 1 && +v <= 7) },
  evalToolNameOverride:{ str:1 },
  evalToolNameOverrideOn:{ bool:1 },
  toolCostNote:{ bool:1 },
  agenticTools:{ vals:['off','auto','on'], apply:() => { greyTools(); updateExpRoute(); } },
  evalInProviders:{ bool:1 },
  apiShapeFallback:{ vals:['off','auto','on'] },
  pricingFallback:{ vals:['off','auto','on'] },
  costBalance:{ vals:['off','current','provider','all'] },
  balanceSnap:{ bool:1 },
  technicalUser:{ bool:1, apply:() => lockEstimate() },
  relaxedSendCriteria:{ bool:1, apply:() => updateSendBtn() },
  staleHunter:{ bool:1 },
  staleHunterMs:{ num:1, def:900000, min:60000 },
  autoSourceOn:{ bool:1 },
  autoSourceToken:{ str:1 },
  estimateOn:{ bool:1 },
  estimateLimitUsd:{ num:1, def:0.05, min:0 }
};
/* NS.setMode(v) … one per setting, plus two older names */
Object.keys(SETTERS).forEach(k => { NS['set' + k[0].toUpperCase() + k.slice(1)] = v => NS.set(k, v); });
NS.setPaintInterval = NS.setPaintIntervalMs; NS.setToolEchoCollapse = NS.setToolEchoCollapseChars;

NS.status = () => JSON.parse(JSON.stringify({ version:VERSION, flags:NS.flags, config:NS.config, stats:NS.stats, installed:NS.installed }));
NS.auditPricing = () => window.__pricingEngine.audit();
NS.removeExpTab = removeExpTab;
NS._rebuildExpTab = () => buildExpTab(true);
NS._internals = { addCumulativeUsage, toolSchema, activeToolName, toolNameForVersion, makeResponsesTranslator, makeAnthropicTranslate, buildResponsesRequest, respUsage, toAnthropic };
NS.version = VERSION;

/* install: the app functions A wraps, then the page follows the switches */
swap('buildAPIMessages', bamMake);
swap('executeAPI', agenticMake);
swap('buildCodeBlockHTML', codeblockMake);
swap('createMessageDOM', renderMsgMake);
swap('formatMarkdown', markedMake);
added(removeStatusPill); added(removeExpTab);
apply(); save(); saveFlags();
console.log('[eval1 v' + VERSION + '] installed — switches ' + JSON.stringify(NS.flags));

/* ============================ BALANCE (per key) ============================ */
const balCache = new Map();
const balInflight = new Map();
const balLastReal = new Map();                     // ck -> performance.now() at last real fetch
let balTok = 0;                                    // only the newest popup render draws
const keyHash = k => { let h = 0; for (let i = 0; i < k.length; i++){ h = (h * 31 + k.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); };
const balSource = p => (p && p.balance) || null;
/* a provider's keys: a list when the app keeps one, else its single key — 1 per provider for now */
const KEYS_PER_PROVIDER = 1, keysOf = pid => [].concat(getApiKey(pid) || []).slice(0, KEYS_PER_PROVIDER);
const balUrl = (p, src) => /^https?:/i.test(src.path || '') ? src.path : (p.baseURL || '') + (src.path || '');
const pick = (d, path) => { if (d == null) return undefined; if (Array.isArray(path)) { let x = d; for (const k of path) { if (x == null) return undefined; x = x[k]; } return x; } return at(d, path); };
async function fetchBalance(p, key, force, guard) {
  const src = balSource(p);
  if (!src || !key) return null;
  const ck = p.id + '|' + keyHash(key);
  if (balInflight.has(ck)) return balInflight.get(ck);
  const pr = (async () => {
    const now = Date.now();
    if (!force) {
      const hit = balCache.get(ck);
      if (hit && now - hit.t < 60000) return hit;
      if (hit && hit.neg && now - hit.t < 30000) return hit;
    }
    if (force && guard) {
      const nowP = performance.now();
      const last = balLastReal.get(ck);
      const elapsed = last == null ? Infinity : Math.max(0, nowP - last);
      if (elapsed < 1000) return balCache.get(ck) || { ok:false, throttled:true, t:Date.now() };
      balLastReal.set(ck, nowP);
    }
    try {
      const res = await fetch(balUrl(p, src), { headers: { 'Authorization': (p.authHeader ? p.authHeader + ' ' : '') + key }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const num = src.parse ? pick(data, src.parse) : data;
      const num2 = src.parse2 ? pick(data, src.parse2) : null;
      const entry = { v: Number.isFinite(Number(num)) ? Number(num) : num, v2: num2 != null && Number.isFinite(Number(num2)) ? Number(num2) : null, mode: src.mode || 'balance', currency: src.currency || null, t: now, ok: true };
      balCache.set(ck, entry);
      return entry;
    } catch (e) {
      const entry = { ok: false, neg: true, t: now, error: String(e && e.message || e) };
      balCache.set(ck, entry);
      return entry;
    }
  })();
  balInflight.set(ck, pr);
  try { return await pr; } finally { balInflight.delete(ck); }
}
const getCached = (p, key) => { try { return balCache.get(p.id + '|' + keyHash(key)) || null; } catch(e){ return null; } };
const $f = n => Number.isFinite(n) ? '$' + (n < 1 ? n.toFixed(2) : n.toLocaleString()) : '—';
const $u = n => Number.isFinite(n) ? '$' + n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'') : '—';
const fmtEntry = e => { if (!e || !e.ok) return '—'; if (e.mode === 'usage') return $f(e.v) + ' (usage ' + $u(e.v2 != null ? e.v2 : e.v) + ')'; return $f(e.v); };
const fmtAgo = ms => { if (!Number.isFinite(ms) || ms < 0) return ''; const s = Math.floor(ms/1000); if (s < 5) return 'just now'; if (s < 60) return s + ' seconds ago'; const m = Math.floor(s/60), rs = s%60; if (m < 60) return m + ' min ' + rs + ' seconds ago'; return Math.floor(m/60) + ' hours ago'; };
const injectBalanceLines = t => {
  const mode = NS.config.costBalance || 'off';
  if (mode === 'off') return;
  if (!(t && t.dataset && t.dataset.cost === 'global')) return;
  const tok = ++balTok;
  const targets = [];
  /* current key · every key of the current provider · every key of every provider */
  (mode === 'all' ? Object.keys(providers) : [activeProviderId]).forEach(pid => { const p = providers[pid];
    if (p && balSource(p)) keysOf(pid).slice(0, mode === 'current' ? 1 : KEYS_PER_PROVIDER).forEach(key => targets.push({ p, key })); });
  if (!targets.length) return;
  const render = rows => {
    if (tok !== balTok) return;
    const box = document.getElementById('costInfo');
    if (!box) return;
    const old = box.querySelector('[data-bal68line]'); if (old) old.remove();
    const lines = rows.map(({ p, e }) => {
      const model = (document.getElementById('modelSelect') || {}).value || p.defaultModel || '';
      const base = 'balance at current key at ' + esc(p.name) + (mode === 'all' ? '' : ' (' + esc(model) + ')') + ': ' + fmtEntry(e);
      const stale = !!(e && e.t && Date.now() - e.t > 60000);
      const ago = e && e.t ? '<span data-bal68ago="' + e.t + '">' + fmtAgo(Date.now() - e.t) + '</span>' : '';
      const line = base + (ago ? ' · ' + ago : '');
      return stale ? '<span style="font-size:.85em;color:#78788a">' + line + '</span>' : line;
    });
    const div = document.createElement('div');
    div.dataset.bal68line = '1';
    div.style.cssText = 'border-top:1px solid var(--border);margin-top:6px;padding-top:6px;font-size:.68rem;color:var(--text-secondary);font-family:monospace';
    div.innerHTML = lines.join('<br>');
    box.appendChild(div);
    shrink(div, (parseFloat(getComputedStyle(div).fontSize) || 11) * 0.5);
  };
  render(targets.map(({ p, key }) => ({ p, e: getCached(p, key) })));
  const needFresh = targets.some(({ p, key }) => { const e = getCached(p, key); return !e || Date.now() - e.t > 5000; });
  if (needFresh) Promise.all(targets.map(async ({ p, key }) => ({ p, e: await fetchBalance(p, key, true, true) }))).then(rows => render(rows)).catch(() => {});
};
/* "x seconds ago" ticker: runs while the cost popup is open, stops itself when it is gone */
let balTicker = 0;
const balTickStop = () => { clearInterval(balTicker); balTicker = 0; };
added(balTickStop);
swap('openCostInfo', o => function(t){
  balTicker = balTicker || setInterval(() => { const box = document.getElementById('costInfo'); if (!box) return balTickStop();
    box.querySelectorAll('[data-bal68line] [data-bal68ago]').forEach(sp => { sp.textContent = fmtAgo(Date.now() - (+sp.getAttribute('data-bal68ago'))); }); }, 1000);
  const r = o.apply(this, arguments); try { injectBalanceLines(t); } catch(e){} return r; });
/* called at the start of each request: balance fetch + optional per-message snapshot */
function requestBalance(r, node, vIndex){
  try {
    const p = r.p, key = getApiKey(p.id);
    const snapOn = !!NS.config.balanceSnap;
    const balOn = NS.config.costBalance !== 'off';
    if (p && p.balance && key && (snapOn || balOn)) {
      fetchBalance(p, key, true).then(e => {
        if (snapOn && node && node.versions && node.versions[vIndex] && e) {
          try { const md = node.versions[vIndex].metadata = node.versions[vIndex].metadata || {}; md.balance = { v: e.v, v2: e.v2, mode: e.mode, currency: e.currency, t: e.t, provider: p.id, keyHash: keyHash(key) }; } catch(err){}
        }
      }).catch(() => {});
    }
  } catch(e){}
}
NS.__bal68 = { fetchBalance, cache: balCache, getCached, fmtEntry, fmtAgo, injectBalanceLines, keyHash, balSource, pick };


/* ============================ TECHNICAL USER + PROVIDER EVAL SEAL ============================ */
/* the seal turns "use eval in providers" off (not for a technical user with Riskier on) */
NS.__sealEval = () => { if ((settings.z && NS.config.technicalUser) || !NS.config.evalInProviders) return false; NS.set('evalInProviders', false); return true; };
{ const host = document.getElementById('rBX');
  if (host){ const row = mine(host.appendChild(document.createElement('div'))); row.className = 'setting-row'; row.style.cssText = 'margin-top:4px;';
    row.innerHTML = '<span>technical</span><label class="toggle"><input type="checkbox" id="expTechnicalUser"' + (NS.config.technicalUser ? ' checked' : '') + '><span class="slider"></span></label>';
    row.querySelector('input').addEventListener('change', e => NS.set('technicalUser', e.target.checked)); } }

/* ============================ EVAL CONSOLE TYPING FIX ============================ */
/* the app's console input handler returns false for every key but Ctrl+Enter, which cancels typing: other keys
   are kept from reaching it (Ctrl+Enter still runs through it) */
on(document, 'keydown', e => { if (e.target.id === 'EI' && !(e.ctrlKey && e.key === 'Enter')) e.stopPropagation(); }, true);

/* ============================ PROVIDER DEFAULTS (self-correcting migration) ============================ */
/* a built-in provider with source 'default' (or none) becomes the migration JSON; an app provider equal to the
   app's own default, or tagged 'default', is reset to it. keep(id) limits which providers it may touch. */
const CANON = { deepseek: clone(DS_PROVIDER) };
const sameJson = (a, b) => { const k = o => JSON.stringify(o, (_, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(q => [q, x[q]])) : x); return k(a) === k(b); };
/* Memory (the app's providers) and local storage (dse_providers) are migrated separately, each from its own content:
   nothing read from one is written to the other, and each has its own "changed since the paste" check. Memory waits
   while a reply runs; local storage does not (the app's Save later stores memory over it, as always). */
const evolve = (obj, keep) => {
  let changed = false;
  Object.keys(obj).forEach(id => {
    const p = obj[id]; if (!p || id === 'custom_template' || /^custom_/.test(id) || (keep && !keep(id, p))) return;
    if (CANON[id]){ if (!p.source || p.source === 'default'){ obj[id] = clone(CANON[id]); changed = true; } return; }
    const orig = default_providers[id]; if (!orig) return;
    const rest = clone(p); delete rest.source;
    if (p.source === 'default' || sameJson(rest, orig)){ obj[id] = Object.assign(clone(orig), { source:'default' }); changed = true; }
  });
  return changed;
};
const readLocal = () => { try { const s = JSON.parse(localStorage.getItem('dse_providers') || '{}'); return s && typeof s === 'object' && !Array.isArray(s) ? s : null; } catch(e){ return null; } };
const migrateRam = keep => {
  if (activeControllers.size > 0 || Object.keys(gens).length > 0) return { ok:false, reason:'busy' };
  let changed = false;
  try { changed = evolve(providers, keep); } catch(e){ return { ok:false, reason:String(e) }; }
  try { renderRegistry('provider'); loadModels(); } catch(e){}   /* also the first /models read that greys the list */
  return { ok:true, changed };
};
const migrateLocal = keep => {
  const saved = readLocal(); if (!saved) return { ok:false, reason:'unreadable' };
  let changed = false;
  try { changed = evolve(saved, keep); if (changed) localStorage.setItem('dse_providers', JSON.stringify(saved)); } catch(e){ return { ok:false, reason:String(e) }; }
  return { ok:true, changed };
};
/* by hand: both, or one of them ({ ram:false } / { local:false }) */
NS.applyProviderDefault = (o = {}) => ({ ram:o.ram === false ? null : migrateRam(), local:o.local === false ? null : migrateLocal() });
NS.providerDefaults = CANON;
/* automatic run 1.5 s after the paste; memory is retried while a reply runs. Each never touches a provider changed
   in its own store since the paste. */
{ const ramAt = {}, localAt = {}, localNow = readLocal() || {};
  Object.keys(providers).forEach(id => { ramAt[id] = JSON.stringify(providers[id]); });
  Object.keys(localNow).forEach(id => { localAt[id] = JSON.stringify(localNow[id]); });
  let t; const goRam = () => { try { if (migrateRam((id, p) => ramAt[id] === JSON.stringify(p)).reason === 'busy') t = setTimeout(goRam, 1500); } catch(e){} };
  const t2 = setTimeout(() => { try { migrateLocal((id, p) => localAt[id] === JSON.stringify(p)); } catch(e){} }, 1500);
  t = setTimeout(goRam, 1500); added(() => { clearTimeout(t); clearTimeout(t2); }); }

/* ============================ HOST INTEGRATION ============================ */
/* send / stop buttons, after the app sets them: with relaxed send, text + key + provider + model is enough even
   while busy (the red ring marks that case) */
const canSend = () => { try { const r = run(); return !!els.messageInput.value.trim() && getApiKey(r.p.id).length > 2 && !!r.p.baseURL && !!r.p.apiPath && !!r.m; } catch(e){ return false; } };
const sendSync = () => {
  const sb = els.sendBtn, busy = activeControllers.size > 0, can = !!NS.config.relaxedSendCriteria && canSend(), send = can || !busy;
  if (can) sb.disabled = false;
  sb.style.display = send ? 'block' : 'none'; els.stopBtn.style.display = send ? 'none' : 'flex';
  sb.classList.toggle('relaxed-busy', can && busy);
};
swap('updateSendBtn', o => function(){ const r = o.apply(this, arguments); try { sendSync(); } catch(e){} return r; });

/* finalize: apply a stale-hunter verdict, finalize each generation run once (a run = version + its start time, so a
   version run again — swarm synthesis after its candidates — finalizes again), always release its controller */
{ const finDone = new Set();
  swap('finalizeGeneration', o => function(node, vIndex, controller){
    try { const v = node && node.versions && node.versions[vIndex], hr = v && v.metadata && v.metadata.hunter;
      if (hr && !hr.applied){ hr.applied = true; v.isDead = true; v.errorIcon = '☠️'; v.errorText = hr.reason || 'Stale stream'; v.endTime = v.endTime || Date.now(); }
      const key = v && (node.id + '|' + vIndex + '|' + v.startTime);
      if (key && finDone.has(key)){ try { updateNodeDOM(node); queueSave(node); } catch(e){} return; }
      if (key) finDone.add(key);
      return o.apply(this, arguments);
    } finally { if (controller) activeControllers.delete(controller); resetStopBtn(); updateSendBtn(); }
  }); }

/* every 2 s: the reconciler (orphan controllers; generations that never started — a node with any generation still
   running, here or in a live other tab, is left alone) and, when on, the stale hunter */
const nodeBusy = id => { const own = k => k.slice(0, k.lastIndexOf('|')) === id, now = Date.now();
  return Object.keys(gens).some(own) || Object.keys(tabGen).some(p => now - (tabSeen[p] || 0) < 2500 && (tabGen[p] || []).some(own)); };
function hunterTick(){
  const now = Date.now(), ms = NS.config.staleHunterMs || 900000;
  for (const k in gens){
    try {
      const g = gens[k], n = g.node, v = n.versions[g.v], age = now - (n.lastUpdateTime || now);
      if (!v || v.endTime || v.isDead || age < ms) continue;
      /* the verdict is applied by finalize; stop the stream now, finalize ourselves if nothing did within 10 s */
      const md = v.metadata = v.metadata || {}; if (!md.hunter) md.hunter = { age, at:now, model:md.model || null, reason:'Stale stream auto-stopped (no chunks for ' + Math.round(age / 1000) + 's)' };
      if (g.ctrl) g.ctrl.abort();
      setTimeout(() => { try { const g2 = gens[k], v2 = g2 && g2.node.versions[g2.v];
        if (v2 && !v2.isDead && v2.metadata && v2.metadata.hunter && !v2.metadata.hunter.applied) finalizeGeneration(g2.node, g2.v); } catch(e){} }, 10000);
      showToast('☠️ stale stream stopped');
    } catch(e){}
  }
}
every(2000, () => {
  if (NS.config.staleHunter) hunterTick();
  try {
    const generating = Object.values(chatTree.nodes).filter(n => n && n.isGenerating), now = Date.now();
    if (!Object.keys(gens).length && !generating.length && activeControllers.size){ activeControllers.clear(); resetStopBtn(); updateSendBtn(); }
    generating.forEach(n => { try {
      const vi = n.activeVersion || 0, v = n.versions[vi], key = genKey(n.id, vi); if (!v || gens[key] || nodeBusy(n.id) || liveGen(vp(n, v), key)) return;
      if (!v.endTime && !v.isDead && now - (v.startTime || n.e || 0) > 15000 && document.visibilityState !== 'hidden'){
        v.isDead = true; v.errorIcon = '☠️'; v.errorText = 'Generation failed to start'; v.endTime = now; n.isGenerating = false;
        finalizeGeneration(n, vi); }
    } catch(e){} });
  } catch(e){}
});

/* ============================ STREAM BUFFER: tidy-up, spare copy, recovery ============================ */
/* The app keeps partial replies in the database (dse_sb) and recovers them at load. A keeps a spare copy in
   localStorage (dse_sb_local, ≤ 1 MB) that follows every app write, and recovers from it at paste when the database
   lost an entry. After each chat save it tidies the buffer: an entry whose text the saved tree (the database, not
   memory — another tab may be ahead or behind) already holds in full, and older than an hour, is deleted inside the
   app's own buffer update; entries still streaming or longer than the save stay (the app drops all after 24 h).
   Size cap (10M characters): when the buffer is larger, entries go in this order, oldest first, until it fits:
   saved in full but under an hour old; older than an hour whose chat is gone; older than an hour whose message or
   version is gone. Entries running in any tab, text the saved chat lacks, and chats that could not be read are never
   removed; if only those are left, it warns instead.
   The same check reports a failed hot-mirror save once the app's delayed write is done. */
{
  const LOCAL = 'dse_sb_local', CAP = 1e6, HOUR = 36e5, len = x => (x[2] || '').length + (x[3] || '').length, vlen = v => (v.rawContent || '').length + (v.thinking || '').length;
  let spare = stored(LOCAL);
  const spareSave = () => { try { const t = JSON.stringify(spare); if (t.length <= CAP) localStorage.setItem(LOCAL, t); } catch(e){} };
  const dbGet = key => initDB().then(db => new Promise(res => { const r = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(null); })).catch(() => null);   /* null = could not read */
  /* the spare copy takes the entry the app just wrote (the app's rule: only a longer text replaces) */
  swap('saveStreamBuffer', o => function(n, i){ const r = o.apply(this, arguments); try { const v = n.versions[i];
    if (v && !v.endTime){ const k = sKey(n, i), e = [Date.now(), n.lastUpdateTime, v.rawContent || '', v.thinking || '']; if (len(e) >= len(spare[k] || [])){ spare[k] = e; spareSave(); } } } catch(e){} return r; });
  /* size cap for the database buffer (text + thinking characters; the app itself drops entries after 24 h) */
  const BUF_CAP = 1e7;
  let busy = false, again = false, lastFail = 0, lastOver = 0;
  const tidy = async () => {
    if (busy){ again = true; return; } busy = true;
    try {
      const b = await dbGet(SB) || {}, trees = {}, del = {}, now = Date.now(), ranked = [[], [], []];
      let size = 0;
      for (const k in b){ const [c, p, id, i] = k.split('|'), e = b[k]; if (!Array.isArray(e)) continue;
        if (!(c in trees)){ const t = await dbGet(c); trees[c] = t === null ? false : t && t.nodes ? t.nodes : null; }   /* null = no saved chat, false = unreadable */
        const nd = trees[c] && trees[c][id], v = nd && nd.versions && nd.versions[+i], age = now - (e[0] || 0);
        const saved = !!(v && v.endTime && vlen(v) >= len(e));        /* the saved chat holds this text in full */
        if (saved && age > HOUR){ del[k] = e[0]; continue; }
        size += len(e);
        /* running anywhere, or the only copy of text the saved chat lacks: never removed */
        if ((c === CHAT_ID && gens[genKey(id, +i)]) || liveGen(p, genKey(id, i))) continue;
        if (saved) ranked[0].push(k);                                  /* 1. saved in full, under an hour old */
        else if (trees[c] === null && age > HOUR) ranked[1].push(k);           /* 2. its chat is gone */
        else if (trees[c] && !v && age > HOUR) ranked[2].push(k);      /* 3. its message or version is gone */
      }
      /* over the cap: remove by those classes in order, oldest first, until under it */
      if (size > BUF_CAP) for (const list of ranked){ list.sort((x, y) => b[x][0] - b[y][0]);
        for (const k of list){ if (size <= BUF_CAP) break; del[k] = b[k][0]; size -= len(b[k]); } }
      if (size > BUF_CAP && size !== lastOver){ lastOver = size; console.warn('[eval1] stream buffer over ' + BUF_CAP / 1e6 + 'M chars (' + size + '): what is left is running or not saved yet, so it stays'); }
      spare = (await streamReg(x => { for (const k in del) if (x[k] && x[k][0] === del[k]) delete x[k]; return clone(x); })) || spare; spareSave();
      const st = ((getMetadata().chatStates || {})[CHAT_ID] || {}).storage;
      if (st && st.localFailure && st.localFailure !== lastFail){ lastFail = st.localFailure; console.warn('[eval1] hot mirror failed (tree large?): ' + new Date(lastFail).toISOString()); }
    } catch(e){} finally { busy = false; if (again){ again = false; setTimeout(tidy, 2000); } }
  };
  every(300000, tidy);
  swap('saveHistory', o => function(){ const r = o.apply(this, arguments); setTimeout(tidy, 2500); return r; });
  /* recovery at paste: an entry of this chat longer than the saved version and running nowhere is restored the way the app does it */
  const got = [];
  for (const k in spare){ const [c, p, id, i] = k.split('|'), n = chatTree.nodes[id], v = n && n.versions && n.versions[+i], e = spare[k];
    if (c !== CHAT_ID || !v || gens[genKey(id, +i)] || liveGen(p, genKey(id, i)) || len(e) <= vlen(v)) continue;
    Object.assign(v, { rawContent:e[2], thinking:e[3], isDead:true, errorIcon:'☠️', errorText:'Stream interrupted', endTime:e[1] || e[0] }); v.e ??= e[1] || e[0]; if (p !== n.p) v.p ??= p;
    n.lastUpdateTime = e[1] || e[0]; n.isGenerating = false; got.push(n); }
  if (got.length){ queueSave(got); renderFullChat(); showToast('recovered ' + got.length + ' interrupted repl' + (got.length > 1 ? 'ies' : 'y') + ' from the local copy'); }
}

/* ============================ PROVIDER JSON "Apply" ============================ */
/* around the app's own Apply handler, in the same click and in memory only (the app's Save stores it): a NEW provider
   whose JSON has eval seals evalInProviders; with auto source on, a provider whose source is 'default' and whose JSON
   the Apply changed is re-tagged to the token, so the next-load migration keeps the edit */
{ const btn = els.saveProvJsonBtn, appApply = btn.onclick;
  btn.onclick = function(){
    const before = {}, isNew = !editingId; Object.keys(providers).forEach(id => { before[id] = JSON.stringify(providers[id]); });
    const r = appApply.apply(this, arguments);
    try {
      if (isNew && Object.keys(providers).some(id => !(id in before) && id !== 'custom_template' && providers[id].eval) && NS.__sealEval())
        showToast('⚠️ evalInProviders disabled · new provider contains eval · if you trust the provider JSON source for full control you can turn it back on');
      if (NS.config.autoSourceOn){ let ch = 0;
        Object.keys(providers).forEach(id => { const p = providers[id]; if (id !== 'custom_template' && !/^custom_/.test(id) && p && p.source === 'default' && before[id] !== JSON.stringify(p)){ p.source = NS.config.autoSourceToken || 'edited'; ch = 1; } });
        if (ch) renderRegistry('provider'); }
    } catch(e){}
    return r;
  };
  added(() => { btn.onclick = appApply; }); }

/* ============================ ESTIMATE (cost check before send) ============================ */
/* 96R #49.2, #51.2 and 55.5 #85–#87. estimatePriceCandidate1 is tied to nothing: a known part (input tokens that
   this model's last request on the branch already sent, which can be a cache hit) plus the rest counted as
   characters ÷ 4, priced both ways from the given price table (a size tier picked by the total, like the app's biller). */
function estimatePriceCandidate1(o){
  const known = Math.max(0, Math.round(o.knownTokens || 0)), later = Math.ceil(Math.max(0, o.laterChars || 0) / 4), all = known + later, lim = +o.limitUsd || 0;
  const p = o.pricing || {}, tier = (Array.isArray(p.tiers) ? p.tiers : []).reduce((a, x) => x && x.minInput <= all && (!a || x.minInput > a.minInput) ? x : a, null), t = Object.assign({}, tier, p);
  const hitRate = t.inputCacheHit != null ? t.inputCacheHit : t.input, missRate = t.inputCacheMiss != null ? t.inputCacheMiss : t.input;
  const hitCost = (known ? known * hitRate : 0) + later * missRate, missCost = all * missRate;
  const M = v => { const a = Math.abs(v); return Number.isFinite(v) ? '$' + v.toFixed(a < 1e-4 ? 8 : a < 1e-3 ? 7 : a < 0.01 ? 6 : a < 1 ? 5 : 3) : '$?'; };
  const X = v => (lim > 0 ? (v / lim).toFixed(1) : '∞') + 'X';
  const dur = ms => { let s = Math.floor(ms / 1000); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), out = []; s %= 60;
    const one = (n, w) => n + ' ' + w + (n === 1 ? '' : 's'); if (d) out.push(one(d, 'day')); if (h) out.push(one(h, 'hour')); if (m) out.push(one(m, 'minute')); out.push(one(s, 'second')); return out.join(' '); };
  const text = 'estimated cache hitted price of this request: ' + M(hitCost) + ' which is ' + X(hitCost) + ' of your ' + M(lim) + ' threshold\n'
    + 'estimated cache missed price of this request: ' + M(missCost) + ' which is ' + X(missCost) + ' of your ' + M(lim) + ' threshold\n'
    + (o.sinceMs != null ? dur(o.sinceMs) + ' passed since ' + o.model + ' model is used in this branch' : o.model + ' model is not used in this branch yet') + ' - send again to proceed';
  return { knownTokens:known, laterTokens:later, hitCost, missCost, text };
}
NS.estimatePriceCandidate1 = estimatePriceCandidate1;
/* the gate, on the send before any message is made: under the limit it does nothing; over it, the request is held
   (no message, nothing sent), a popup shows the estimate and the request is remembered; the same request sent again
   goes out, a different one is remembered instead. The memory is RAM only and clears whenever a send goes out. */
let estArm = null;
const estimateGate = () => {
  if (!NS.config.estimateOn) return true;
  try {
    const text = els.messageInput.value.trim(); if (!text || els.sendBtn.disabled) return true;
    const r = run(), path = getViewNodes(), T = resolveTools(r), tools = toolList(T);
    const msgs = buildAPIMessages(path.concat({ id:'estimate', role:'user', versions:[{ rawContent:text }], activeVersion:0 }), r);
    const key = JSON.stringify([r.p.id, r.m, r.maxTokens, tools, !!T.search, msgs]);   /* the whole request */
    /* this model's last message on the branch: how long ago it was made, and its last request's input tokens (the known part) */
    let since = null, known = 0, laterChars = JSON.stringify(msgs).length + JSON.stringify(tools).length;
    for (let i = path.length - 1; i >= 0; i--){
      const n = path[i], v = n.role === 'assistant' && n.versions[n.activeVersion || 0], md = v && v.metadata;
      if (!md || md.provider !== r.p.id || md.model !== r.m) continue;
      if (since == null) since = Math.max(0, Date.now() - (v.endTime || v.startTime || ve(n) || Date.now()));
      const k = md.lastInput != null ? md.lastInput : (v._toolEvents ? null : v.promptTokens);   /* older messages: only a one-round message's input is its last request's */
      if (!Number.isFinite(k)) continue;
      const pre = buildAPIMessages(path.slice(0, i + 1), r), last = pre[pre.length - 1];
      if (last && last.role === 'assistant' && !last.tool_calls) pre.pop();                     /* its own answer came after that request */
      known = k; laterChars = Math.max(0, JSON.stringify(msgs).length - JSON.stringify(pre).length); break;
    }
    const lim = NS.config.estimateLimitUsd, est = estimatePriceCandidate1({ knownTokens:known, laterChars, pricing:safeState(r).table || r.pricing, limitUsd:lim, model:r.m, sinceMs:since });
    if (!(est.missCost > lim) || estArm === key){ estArm = null; return true; }
    estArm = key; popupHTML(esc(est.text).split('\n').join('<br>'), 'cost estimate'); return false;
  } catch(e){ warn('estimate: ' + e.message); return true; }
};
swap('sendMessage', o => function(){ if (!estimateGate()) return; return o.apply(this, arguments); });
/* the Send button holds the app's own sendMessage, so its click is checked here, before it */
on(document, 'click', e => { if (e.target.closest && e.target.closest('#sendBtn') && !estimateGate()){ e.stopImmediatePropagation(); e.preventDefault(); } }, true);

/* ============================ README ============================ */
/* readable here and at runtime: __eval1.readme, or __eval1.help() prints it */
NS.readme = `====================================================================
 EVAL1 v${VERSION} (96claudeeditB12) - README
====================================================================

0. WHAT IT IS
 - An add-on for the AI Chat app, pasted into its eval console
   (Other tab -> "Eval console"). Load it from a URL with:
      eval(await (await fetch(URL)).text())
 - Nearly everything it adds is taken back by __eval1.disable(). A new paste
   first disables the build that is running (see 1).

1. PASTE RULE (which build runs)
 - A paste replaces the running build only if that build is the same
   version or older (numeric parts: 5.0.1 < 5.0.2 < 5.1.0). A build
   turned off by disable() counts as nothing running.
 - Tailor it by editing the three if (true) gates at the top of the file:
   first false = never replace; second false = always replace;
   third false = never replace.
 - Why: a model may run files out of order, or one may be pasted by
   mistake; an older build must not replace a newer one.

2. HOW IT REACHES THE APP
 - The console evals inside the app's own closure, so the app's names
   (settings, providers, run, executeAPI, chatTree, ...) can be read and
   reassigned. swap(name, make) replaces an app function by eval.
 - var / let / const inside a paste do not survive it: anything a later
   paste or a person must reach lives on window.__eval1.

3. STORAGE
 - Its own: dse_eval1_config (settings), dse_eval1_flags (switches),
   dse_sb_local (spare copy of partial replies, up to 1 MB).
 - The app's, which it reads or writes the app's way: dse_providers,
   dse_metadata, and the database buffer dse_sb (partial replies).
 - Memory first: the provider editor's Apply, the model you pick and the
   /models list stay in memory; the app's Save stores them.

4. SETTINGS
 - __eval1.set(name, value) / setFlag(name, 0|1) / status(). Every Exp
   tab control names the setting it sets. Invalid values are refused;
   bad numbers fall back to the default.

5. REQUESTS (fetch)
 - Every POST passes, in order: Anthropic bridge (DeepSeek chat ->
   /anthropic/v1/messages, web search), Responses bridge (profiled models
   -> /responses), coalescer (streams painted in paintIntervalMs frames).
   Each follows its own switch.

6. PRICING (the provider JSON is the only source)
 - A request's price = the model's "pricing", overlaid by "rates.off",
   overlaid by the rates of the state the provider's "sched" says is on
   (the costliest when several are), times any scalars; before "epoch"
   the "legacy" rates. Rules can be changed per provider ("pricingRules").
 - Peak/discount display (temporary until pricing V2): a state named
   "peak" or "discount" is that by its name; one whose prices all equal
   off-peak is neither (not red, no countdown); other names by netBy.
 - Each tool round is billed at its own price; the message label
   (metadata.pricing.net) = what it paid / the same usage at off price.
 - A round that got an answer but no usage marks the total "+"
   (unknown part), unless the model is free (every price explicitly 0).
 - __pricingEngine.priceState / priceAt / audit() read the same function.

7. TOOLS (agentic loop)
 - Agentic tools: on / auto (repeat what this model's last message on the
   branch attached; else the selection) / off.
 - Tool limit: rounds per message; 0 = inspect mode (orange): tool calls
   are shown, never run; switch off = no limit.
 - Per message: metadata.tools (attached tool -> calls; web_search counts
   server searches), metadata.toolNames (mocked name -> real tool),
   metadata.lastInput (input tokens of its last request, for the estimate),
   _toolEvents (the real tool conversation sent back as history),
   toolBatch (the last round: requested, executed, names). Auto reads
   toolBatch only for messages saved before metadata.tools existed.
 - Tool block collapse: off = never; on + N = over N characters; on + 0 =
   every tool block. A config saved before the switch existed with a
   size of 0 loads as off (size 2000).
 - Stop before the reply finished = "Stopped by user"; the message keeps
   its text, thinking, tool history and label either way.

8. MODEL LIST
 - Fallback models the provider's /models answer lacks stay listed, half
   grey ("not in provider /models (risk)"). The pick survives refills.

9. PROVIDER DEFAULTS (migration)
 - Memory and local storage are migrated separately, each from its own
   content, each skipping providers changed there since the paste.
   __eval1.applyProviderDefault({ ram, local }) runs it by hand.

10. PARTIAL REPLIES (stream buffer)
 - Tidied after each save: entries the saved chat holds in full, older
   than 1 h, go. Size cap 10M characters, with per-entry checks (see the
   STREAM BUFFER section). Recovery at paste from the spare copy.

11. COST ESTIMATE BEFORE SEND (Exp General, default off)
 - On Send/Enter the request that would go out is built the app's way.
   Known part = input tokens of this model's last request on the branch
   (can be a cache hit); the rest = characters / 4 (a miss). Output is not
   counted. Over the $ limit (cache-miss price): nothing is made or sent,
   a popup shows hit and miss price as multiples of the limit and the
   time since this model was used on the branch. The same request sent
   again goes out; any change shows the popup again. RAM only.
 - __eval1.estimatePriceCandidate1({ knownTokens, laterChars, pricing,
   limitUsd, model, sinceMs }) is the estimator on its own.
 - Not checked: regenerate, branch edits, tool rounds.
 - The row is greyed and locked unless Riskier and technical are both on.

12. WHEN YOU EDIT IT
 - Fix things where they are defined, not with patch blocks added later;
   only this readme grows by addition.
 - Every behaviour change is flagged, with original vs changed.
 - VERSION: bump the last number on every change (5.0.1 -> 5.0.2); a
   major change may bump the middle one. The paste rule orders by it.
====================================================================
`;
NS.help = () => { console.log(NS.readme); return NS.readme; };
})();
