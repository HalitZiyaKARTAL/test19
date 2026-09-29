/* ============================================================
   WORKFLOW A1 v1.0.0 — workflowtestA1: multi-agent workflow scripts inside the AI Chat app.
   Runs Claude Code style scripts (agent / parallel / pipeline / phase / log / args / budget) on the app's own
   provider, key, model and request settings. Every request goes through the page's fetch the way executeAPI sends
   it, so EVAL1's bridges (Anthropic with web search, Responses, coalescer), its tools (tool_eval_*) and its
   pricing engine apply to workflow agents too.
   Paste into the eval console after 96claudeeditB12.js (Other tab -> "Eval console"). Without EVAL1 it still runs,
   with the app's plain requests (no web search, no tools).
   Adds a "Flow" tab to Settings (script, progress, result) and window.__wf1 for the console (__wf1.help()).
   Sections:
     CORE · INSTALL · CONFIG · SCHEMA · REQUEST · AGENT · RUN · UI · STYLES · API + BOOT · README
   ============================================================ */
(() => {

/* ============================ CORE ============================ */
const VERSION = '1.0.0';
/* ===== PASTE RULE — as in EVAL1: replace the running build only if it is the same version or older =====
   Tailor it by editing the three trues. A build turned off by disable() counts as nothing running. */
const older = (a, b) => { const x = String(a).split('.'), y = String(b).split('.');   /* a <= b, numeric parts; unreadable → true */
  for (let i = 0; i < Math.max(x.length, y.length); i++){ const p = +(x[i] || 0), q = +(y[i] || 0); if (isNaN(p) || isNaN(q)) return true; if (p !== q) return p < q; }
  return true; };
{ const cur = window.__wf1;
  if (cur && typeof cur.disable === 'function' && cur.installed !== false && cur.off !== true){
    let swap = false;
    if (true){                                     /* false = never replace */
      if (true){                                   /* false = skip the check below: always replace */
        if (true) swap = older(cur.version, VERSION);   /* false = the check fails: never replace */
      } else swap = true;
    }
    if (!swap){ console.warn('[wf1] v' + cur.version + ' stays: this paste (v' + VERSION + ') does not replace it'); return; }
  } }
const NS = window.__wf1 = window.__wf1 || {};
/* a new paste replaces the earlier one completely (see INSTALL); saved agent results and past runs are kept (RAM) */
try { if (NS.disable) NS.disable(); } catch(e){}
NS.off = false;
NS.saved = NS.saved instanceof Map ? NS.saved : new Map();
NS.runs = Array.isArray(NS.runs) ? NS.runs : [];
/* EVAL1 when it runs (its bridges, tools and pricing engine are used through the page, not called here) */
const E1 = () => { const e = window.__eval1; return e && e.installed && !e.off ? e : null; };
/* the app's run(): request settings for an agent + overrides (provider → model → agent, merged) */
const appRun = (a, x) => run(a, x);

const warn = m => { try { console.warn('[wf1] ' + m); } catch(e){} };
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errText = e => String(e && e.message || e);

/* ============================ INSTALL ============================ */
/* Everything this paste adds to the page is listed with how to take it back; disable() takes it all back, newest
   first, and the next paste starts with disable(). */
const TAKE_BACK = [];
const added = undo => { TAKE_BACK.push(undo); };
const on = (target, type, fn, capture) => { target.addEventListener(type, fn, capture); added(() => target.removeEventListener(type, fn, capture)); };
const mine = el => { added(() => el.remove()); return el; };

/* ============================ CONFIG ============================ */
/* provider / model '' = the app's current selection. budgetUsd 0 = no limit. */
const DEFAULTS = { provider:'', model:'', concurrency:3, budgetUsd:1, maxTurns:8, repair:1, webSearch:false, reuse:true, dryRun:false };
const stored = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch(e){ return {}; } };
const savedConfig = stored('dse_wf1_config');
NS.config = {}; Object.keys(DEFAULTS).forEach(k => { NS.config[k] = k in savedConfig ? savedConfig[k] : DEFAULTS[k]; });
const save = () => { try { localStorage.setItem('dse_wf1_config', JSON.stringify(NS.config)); } catch(e){} };
const keepText = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };
const loadText = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch(e){ return d; } };
const SETTERS = {
  provider:{ str:1, check:v => !v || !!providers[v], apply:() => { NS.config.model = ''; save(); fillModels(); } },
  model:{ str:1 },
  concurrency:{ num:1, def:3, min:1, max:32 },
  budgetUsd:{ num:1, def:1, min:0 },
  maxTurns:{ num:1, def:8, min:1, max:100 },
  repair:{ num:1, def:1, min:0, max:3 },
  webSearch:{ bool:1 }, reuse:{ bool:1 }, dryRun:{ bool:1 }
};
/* table-driven settings, as in EVAL1: checked, stored, shown on every control of it, then applied */
NS.set = (k, v) => {
  const d = SETTERS[k]; if (!d) throw Error('unknown setting: ' + k);
  if (d.check && !d.check(v)) throw Error('invalid value: ' + v);
  if (d.bool) v = !!v;
  else if (d.num){ v = +v; if (!Number.isFinite(v)) v = d.def; if (d.min != null) v = Math.max(d.min, v); if (d.max != null) v = Math.min(d.max, v); }
  else if (d.str) v = String(v == null ? '' : v).trim();
  NS.config[k] = v; save(); showControls(k);
  if (d.apply) d.apply(v);
  return v;
};

/* ============================ SCHEMA ============================ */
/* A schema's answer is asked for in the prompt (providers differ on JSON modes), read from the text, checked here
   and sent back once for a fix when it does not match. */
const schemaNote = s => 'Answer with only a JSON value (no other text, no code fence) that matches this JSON Schema:\n' + JSON.stringify(s);
function parseJson(text){
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch(e){}
  const m = t.match(/[\[{][\s\S]*[\]}]/); if (m) try { return JSON.parse(m[0]); } catch(e){}
  throw Error('the answer is not valid JSON');
}
function validate(s, v, path = '$', errs = []){
  if (!s || typeof s !== 'object') return errs;
  if (s.anyOf){ if (!s.anyOf.some(x => !validate(x, v, path, []).length)) errs.push(path + ': matches none of anyOf'); return errs; }
  const types = Array.isArray(s.type) ? s.type : s.type ? [s.type] : [], got = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
  if (types.length && !types.some(t => t === got || (t === 'integer' && Number.isInteger(v)) || (t === 'number' && got === 'number'))){ errs.push(path + ': expected ' + types.join('|') + ', got ' + got); return errs; }
  if (s.enum && !s.enum.some(x => JSON.stringify(x) === JSON.stringify(v))) errs.push(path + ': not one of ' + JSON.stringify(s.enum));
  if (typeof v === 'number'){ if (s.minimum != null && v < s.minimum) errs.push(path + ': below ' + s.minimum); if (s.maximum != null && v > s.maximum) errs.push(path + ': above ' + s.maximum); }
  if (typeof v === 'string'){ if (s.minLength != null && v.length < s.minLength) errs.push(path + ': shorter than ' + s.minLength); if (s.maxLength != null && v.length > s.maxLength) errs.push(path + ': longer than ' + s.maxLength); }
  if (Array.isArray(v)){ if (s.minItems != null && v.length < s.minItems) errs.push(path + ': fewer than ' + s.minItems + ' items'); if (s.maxItems != null && v.length > s.maxItems) errs.push(path + ': more than ' + s.maxItems + ' items');
    if (s.items) v.forEach((x, i) => validate(s.items, x, path + '[' + i + ']', errs)); }
  if (got === 'object'){ (s.required || []).forEach(k => { if (!(k in v)) errs.push(path + '.' + k + ': missing'); });
    Object.keys(s.properties || {}).forEach(k => { if (k in v) validate(s.properties[k], v[k], path + '.' + k, errs); }); }
  return errs;
}
/* dry run: a value shaped like the schema */
function fake(s, label){
  if (!s || typeof s !== 'object') return null;
  if (s.const !== undefined) return s.const; if (s.enum) return s.enum[0]; if (s.anyOf) return fake(s.anyOf[0], label);
  const t = Array.isArray(s.type) ? s.type[0] : s.type || (s.properties ? 'object' : null);
  if (t === 'object') { const o = {}; Object.keys(s.properties || {}).forEach(k => { o[k] = fake(s.properties[k], label); }); return o; }
  if (t === 'array') return [fake(s.items, label), fake(s.items, label)];
  if (t === 'string') return '(dry run) ' + label;
  if (t === 'integer' || t === 'number') return s.minimum != null ? s.minimum : 3;
  if (t === 'boolean') return true;
  return null;
}
/* the key a saved result is found by: a hash of everything that shapes the request */
const cyrb = (s, seed) => { let a = 0xdeadbeef ^ seed, b = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); a = Math.imul(a ^ c, 2654435761); b = Math.imul(b ^ c, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909); b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(16).padStart(14, '0'); };
const keyOf = async o => { const t = JSON.stringify(o);
  try { if (window.crypto && crypto.subtle){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join(''); } } catch(e){}
  return cyrb(t, 1) + cyrb(t, 2); };

/* ============================ REQUEST ============================ */
/* the usage of a response envelope, read the way EVAL1's agentic loop reads it (the app's usagePath, else usage) */
const usageOf = (r, env) => r.usagePath === false ? env : r.usagePath ? at(env, r.usagePath) : (env && (env.usage ?? env.usageMetadata ?? (env.message && env.message.usage)));
/* one request the app's way (executeAPI): provider, key, model, request fields, max tokens; streamed when the app
   streams. It is the page's fetch, so EVAL1's bridges apply; eval1.webSearch travels with it (fetch ignores it). */
async function requestOnce(r, messages, tools, webSearch, signal, onChars){
  const p = r.p, key = getApiKey(p.id), stream = settings.streaming !== false;
  if (!key) throw Error('no API key saved for provider ' + p.id);
  const payload = Object.assign({}, r.request, { model:r.m, messages, temperature:r.supportsTemperature === false ? void 0 : (r.temperature != null ? r.temperature : .7), stream });
  if (tools.length){ payload.tools = tools; if (!payload.tool_choice) payload.tool_choice = 'auto'; }
  payload[p.maxTokensParam || 'max_tokens'] = r.maxTokens;
  if (stream && p.supportsStreamUsage) payload.stream_options = { include_usage:true };
  const res = await fetch(p.baseURL + p.apiPath, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':(p.authHeader ? p.authHeader + ' ' : '') + key }, body:JSON.stringify(payload), signal, eval1:{ webSearch:!!webSearch } });
  if (!res.ok){ const body = (await res.text()).trim(); throw Error('HTTP ' + res.status + (body ? ' ' + body.slice(0, 500) : '')); }
  /* within one request the latest usage frame wins (merged, as the app does); a provider-reported cost is kept apart */
  const out = { content:'', reasoning:'', toolCalls:null, usage:null, exact:undefined, finish:null };
  const take = d => {
    if (d && d.error) throw Error(typeof d.error === 'string' ? d.error : (d.error.message || JSON.stringify(d.error)));
    const u = usageOf(r, d); if (u && typeof u === 'object') out.usage = mergeUsage(out.usage, u);
    const bad = {}, rc = usageValue(d, r.usageCost, bad); if (!bad.value && rc !== undefined) out.exact = rc;
    const c = d && d.choices && d.choices[0]; if (c && c.finish_reason) out.finish = c.finish_reason;
    return c;
  };
  if (!stream || !res.body || /json/i.test(res.headers.get('content-type') || '')){
    const c = take(await res.json()), m = (c && c.message) || {};
    out.content = m.content || ''; out.reasoning = m.reasoning_content || ''; if (m.tool_calls && m.tool_calls.length) out.toolCalls = m.tool_calls;
    return out;
  }
  const acc = [], reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  const line = l => {
    if (!/^data:/.test(l)) return;
    const js = l.replace(/^data:\s?/, '').trim(); if (!js || js === '[DONE]') return;
    let d; try { d = JSON.parse(js); } catch(e){ return; }
    const c = take(d), delta = (c && c.delta) || {};
    out.content += delta.content || ''; out.reasoning += delta.reasoning_content || '';
    (delta.tool_calls || []).forEach(t => { const i = t.index != null ? t.index : acc.length, a = acc[i] || (acc[i] = { id:'', type:'function', function:{ name:'', arguments:'' } });
      if (t.id) a.id = t.id; if (t.function){ if (t.function.name) a.function.name += t.function.name; if (t.function.arguments) a.function.arguments += t.function.arguments; } });
    if (onChars) onChars(out.content.length + out.reasoning.length);
  };
  while (true){ const rd = await reader.read(); if (rd.done) break; buf += dec.decode(rd.value, { stream:true }); const ls = buf.split('\n'); buf = ls.pop(); ls.forEach(line); }
  if (buf.trim()) line(buf.trim());
  if (acc.length) out.toolCalls = acc.filter(Boolean);
  return out;
}
/* what one request cost: priced as EVAL1 prices a tool round (the price state now: peak / off / discount), else the
   app's own price; applyResponseMetadata is the app's biller. A request without usage is "+" (unknown part). */
function bill(r, usage, exact){
  if (!usage && exact === undefined) return { usd:0, unknown:true, input:0, output:0 };
  let rr = r; try { const PE = window.__pricingEngine, t = PE && PE.priceState && PE.priceState(r).table; if (t) rr = Object.assign({}, r, { pricing:t }); } catch(e){}
  const one = {}; applyResponseMetadata(one, usage || {}, rr, exact);
  const tot = one.metadata.cost.calculated.total, u = one.metadata.usage || {};
  return { usd:qv(tot) || 0, unknown:/\+$/.test(String(tot)), input:u.input || 0, output:u.output || 0 };
}
/* a tool call runs the page's tool (window.__tools, EVAL1's registry); any failure becomes the tool's answer */
async function execTool(tc, signal){
  const name = tc.function && tc.function.name, def = window.__tools && window.__tools[name];
  let args = {}; try { args = JSON.parse((tc.function && tc.function.arguments) || '{}'); } catch(e){ args = { parseError:String(e), raw:(tc.function && tc.function.arguments) || '' }; }
  if (!def) return JSON.stringify({ ok:false, error:'unknown tool: ' + name });
  try { const o = await def.run(args, signal); return typeof o === 'string' ? o : JSON.stringify(o); } catch(e){ return JSON.stringify({ ok:false, error:String(e && e.stack || e) }); }
}

/* ============================ AGENT ============================ */
/* settings for one agent: the app's run() with this agent's overrides. 'effort' only replaces a reasoning_effort the
   model's request already sends (as DeepSeek's does). */
function settingsFor(o){
  const x = {}, pid = o.provider || NS.config.provider, mid = o.model || (o.provider ? '' : NS.config.model);
  if (pid){ if (!providers[pid]) throw Error('unknown provider: ' + pid); x.provider = pid; }
  if (mid) x.model = mid;
  if (o.maxTokens) x.maxTokens = +o.maxTokens;
  if (o.temperature != null) x.temperature = o.temperature;
  if (o.request) x.request = Object.assign({}, o.request);
  let r = appRun(o.agent || null, x);
  if (o.effort && r.request && r.request.reasoning_effort !== undefined){ x.request = Object.assign({}, x.request, { reasoning_effort:o.effort }); r = appRun(o.agent || null, x); }
  if (!r.p || !r.p.baseURL || !r.p.apiPath || !r.m) throw Error('the provider or model is not set up (Model tab)');
  return r;
}
/* tools: 'web' = the server web search EVAL1's bridges attach; 'eval' = tool_eval_1; any other name = that tool of
   window.__tools. The Flow tab's web search switch turns it on for every agent. */
function toolsFor(o){
  const want = o.tools === true ? ['web'] : [].concat(o.tools || []).map(String);
  const web = want.includes('web') || (o.webSearch != null ? !!o.webSearch : !!NS.config.webSearch);
  const names = want.filter(n => n !== 'web').map(n => n === 'eval' ? 'tool_eval_1' : n);
  names.forEach(n => { if (!(window.__tools && window.__tools[n])) throw Error('unknown tool "' + n + '"' + (E1() ? '' : ' (paste 96claudeeditB12.js first)')); });
  return { web, names, list:names.map(n => window.__tools[n].schema) };
}
async function runAgent(R, rec, prompt, o){
  const r = settingsFor(o), T = toolsFor(o), schema = o.schema || null, maxTurns = Math.max(1, +(o.maxTurns || R.cfg.maxTurns) || 8);
  rec.model = r.p.id + '/' + r.m;
  rec.key = await keyOf({ v:1, p:r.p.id, m:r.m, a:o.agent || null, prompt, schema, sys:o.system || null, tools:T.names, web:T.web, max:r.maxTokens, t:r.temperature, req:r.request });
  if (R.cfg.reuse && !R.cfg.dryRun && NS.saved.has(rec.key)){ rec.saved = true; return clone(NS.saved.get(rec.key)); }
  if (R.cfg.dryRun){ await sleep(200 + Math.random() * 600); return schema ? fake(schema, rec.label) : '(dry run) ' + rec.label + ': ' + prompt.slice(0, 80); }
  if (T.web && !E1()) rec.notes.push('web search needs EVAL1 (96claudeeditB12): sent without it');
  const role = r.systemRole || 'system';
  let history = [{ role, content:o.system ? String(o.system) : 'You are a helpful assistant.' }, { role:'user', content:schema ? prompt + '\n\n' + schemaNote(schema) : prompt }];
  if (r.prompt) history.push({ role, content:r.prompt });            /* an app agent's own prompt, as buildAPIMessages adds it */
  const ask = async hist => {
    const out = await requestOnce(r, hist, T.list, T.web, rec.ctrl.signal, n => { rec.chars = n; paint(); });
    const b = bill(r, out.usage, out.exact);
    rec.usd += b.usd; rec.tin += b.input; rec.tout += b.output; rec.unknown = rec.unknown || b.unknown;
    R.usd += b.usd; R.tin += b.input; R.tout += b.output; R.unknown = R.unknown || b.unknown;
    if (out.finish === 'length') rec.notes.push('hit max tokens: the answer may be cut');
    paint(); return out;
  };
  /* the tool loop, as EVAL1's: the assistant turn with its calls (reasoning kept), then one result per call */
  let answer = '';
  for (let turn = 0; ; turn++){
    if (R.off) throw new Stopped(R.why);
    const out = await ask(history);
    if (!out.toolCalls || !out.toolCalls.length){ answer = out.content; break; }
    if (turn + 1 >= maxTurns){ rec.notes.push('tool round limit (' + maxTurns + ') reached'); answer = out.content; break; }
    out.toolCalls.forEach((tc, i) => { tc.type = tc.type || 'function'; tc.function = tc.function || {}; if (!tc.id) tc.id = 'wf' + rec.id + 't' + turn + 'c' + i; });
    history.push({ role:'assistant', content:out.content || null, reasoning_content:out.reasoning || null, tool_calls:out.toolCalls });
    const results = await Promise.all(out.toolCalls.map(tc => execTool(tc, rec.ctrl.signal)));
    out.toolCalls.forEach((tc, i) => history.push({ role:'tool', tool_call_id:tc.id, content:results[i] }));
    rec.calls += out.toolCalls.length; paint();
  }
  if (!schema){ NS.saved.set(rec.key, answer); return answer; }
  let value, problems;
  for (let n = 0; ; n++){
    try { value = parseJson(answer); problems = validate(schema, value); } catch(e){ value = undefined; problems = [e.message]; }
    if (!problems.length || n >= (R.cfg.repair | 0)) break;
    rec.notes.push('asked for a JSON fix: ' + problems.slice(0, 2).join('; '));
    history = history.concat({ role:'assistant', content:answer }, { role:'user', content:'That answer does not match the schema:\n- ' + problems.join('\n- ') + '\nAnswer again with only the corrected JSON.' });
    answer = (await ask(history)).content;
  }
  if (problems.length) throw Error('the answer does not match the schema: ' + problems.slice(0, 4).join('; '));
  NS.saved.set(rec.key, value); return clone(value);
}

/* ============================ RUN ============================ */
/* One run at a time. A script is an async function body (Claude Code workflow style; `export const meta = {...}`
   is read, not exported). It runs in the page's global scope, not the app's closure: it sees the helpers below and
   window (__eval1, __wf1, __tools), not the app's names. */
class Stopped extends Error { constructor(m){ super(m || 'stopped'); this.name = 'Stopped'; } }
class Limiter {
  constructor(n){ this.n = Math.max(1, n | 0); this.active = 0; this.waiting = []; }
  async run(fn){ while (this.active >= this.n) await new Promise(r => this.waiting.push(r)); this.active++;
    try { return await fn(); } finally { this.active--; const w = this.waiting.shift(); if (w) w(); } }
}
let runSeq = 0;
function newRun(meta){
  const R = { id:++runSeq, cfg:Object.assign({}, NS.config), meta, recs:[], logs:[], phase:null, off:false, why:'', usd:0, unknown:false, tin:0, tout:0,
    t0:Date.now(), t1:0, result:undefined, error:null };
  R.lim = new Limiter(R.cfg.concurrency);
  NS.current = R; NS.runs.unshift(R); if (NS.runs.length > 5) NS.runs.length = 5;
  return R;
}
function helpers(R){
  const log = (t, bad) => { R.logs.push({ t:String(t), bad:!!bad, at:Date.now() }); if (R.logs.length > 500) R.logs.shift(); paint(); };
  /* returns the answer (text, or the schema's value), null when the agent failed or was skipped; throws when the
     run is stopped or the budget is spent */
  async function agent(prompt, o = {}){
    if (R.off) throw new Stopped(R.why);
    if (typeof prompt !== 'string') throw TypeError('agent(prompt, opts): prompt must be a string');
    o = o || {};
    const rec = { id:R.recs.length + 1, label:String(o.label || 'agent ' + (R.recs.length + 1)), phase:String(o.phase || R.phase || '(no phase)'), state:'queued',
      t0:0, t1:0, usd:0, unknown:false, tin:0, tout:0, chars:0, calls:0, notes:[], error:'', preview:'', model:'', saved:false, key:'', ctrl:new AbortController() };
    R.recs.push(rec); paint();
    return R.lim.run(async () => {
      if (R.off){ rec.state = 'skipped'; paint(); throw new Stopped(R.why); }
      if (R.cfg.budgetUsd > 0 && R.usd >= R.cfg.budgetUsd){ rec.state = 'error'; rec.error = 'budget reached'; paint(); throw Error('budget of $' + R.cfg.budgetUsd + ' reached'); }
      rec.state = 'running'; rec.t0 = Date.now(); paint();
      try {
        const v = await runAgent(R, rec, prompt, o);
        rec.state = rec.saved ? 'saved' : 'done'; rec.preview = typeof v === 'string' ? v : JSON.stringify(v);
        return v;
      } catch(e){
        if (e instanceof Stopped || R.off){ rec.state = 'skipped'; throw e instanceof Stopped ? e : new Stopped(R.why); }
        if (rec.ctrl.signal.aborted){ rec.state = 'skipped'; rec.error = 'skipped by you'; return null; }
        rec.state = 'error'; rec.error = errText(e); log(rec.label + ': ' + rec.error, 1);
        return null;
      } finally { rec.t1 = Date.now(); paint(); }
    });
  }
  /* all at once (up to "Agents at once"); a task that throws becomes null — a stop still ends the run */
  const parallel = thunks => {
    if (!Array.isArray(thunks)) throw TypeError('parallel() takes an array of functions');
    return Promise.all(thunks.map(t => Promise.resolve().then(t).catch(e => { if (e instanceof Stopped) throw e; log('parallel task failed: ' + errText(e), 1); return null; })));
  };
  /* each item through the stages on its own; stages get (previous, item, index); a stage that throws drops the item */
  const pipeline = (items, ...stages) => {
    if (!Array.isArray(items)) throw TypeError('pipeline() takes an array of items first');
    return Promise.all(items.map(async (item, i) => { let v = item;
      for (const st of stages){ try { v = await st(v, item, i); } catch(e){ if (e instanceof Stopped) throw e; log('pipeline item ' + i + ' dropped: ' + errText(e), 1); return null; } }
      return v; }));
  };
  const phase = t => { R.phase = String(t); log('phase: ' + R.phase); };
  const budget = { get total(){ return R.cfg.budgetUsd; }, spent:() => R.usd, remaining:() => R.cfg.budgetUsd > 0 ? Math.max(0, R.cfg.budgetUsd - R.usd) : Infinity };
  return { agent, parallel, pipeline, phase, log:t => log(t), budget };
}
/* `export const meta = {...}` read without running the script */
function metaOf(src){
  const m = /export\s+const\s+meta\s*=\s*\{/.exec(src); if (!m) return null;
  let depth = 0, q = null; const i = m.index + m[0].length - 1;
  for (let j = i; j < src.length; j++){ const c = src[j];
    if (q){ if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0){ try { return Function('"use strict";return (' + src.slice(i, j + 1) + ')')(); } catch(e){ return null; } } }
  return null;
}
const running = () => !!(NS.current && !NS.current.t1);
async function start(src, argsText, label){
  if (NS.off) throw Error('turned off by disable(): paste again');
  if (running()) throw Error('a workflow is already running');
  let args; try { args = JSON.parse(String(argsText == null ? 'null' : argsText).trim() || 'null'); } catch(e){ throw Error('args is not valid JSON: ' + e.message); }
  const AF = Object.getPrototypeOf(async function(){}).constructor;
  const fn = new AF('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', String(src).replace(/^(\s*)export\s+const\s+meta\s*=/m, '$1const meta ='));
  const R = newRun(metaOf(String(src)) || (label ? { name:label } : null)), h = helpers(R);
  h.log('started: ' + (R.cfg.dryRun ? 'dry run' : whoLabel()) + ', ' + R.cfg.concurrency + ' at once' + (E1() ? ', EVAL1 v' + E1().version : ', without EVAL1'));
  try { R.result = await fn(h.agent, h.parallel, h.pipeline, h.phase, h.log, args, h.budget); h.log('finished'); }
  catch(e){ R.error = errText(e); if (!(e instanceof Stopped)) h.log('script error: ' + R.error, 1); }
  finally {
    R.t1 = Date.now(); paint();
    try { showToast((R.error ? '⚠️ workflow ' + (R.off ? 'stopped' : 'failed') : '✅ workflow finished') + ' · ' + money(R.usd, R.unknown)); } catch(e){}
  }
  return R;
}
function stop(why){
  const R = NS.current; if (!R || R.t1 || R.off) return false;
  R.off = true; R.why = why || 'stopped'; R.recs.forEach(x => x.ctrl.abort());
  R.logs.push({ t:R.why, bad:true, at:Date.now() }); paint(); return true;
}
const money = (usd, unknown) => { try { return cs(usd) + (unknown ? '+' : ''); } catch(e){ return '$' + usd.toFixed(6) + (unknown ? '+' : ''); } };
const whoLabel = () => { try { const r = settingsFor({}); return r.p.id + ' / ' + r.m; } catch(e){ return 'no model'; } };

/* ============================ UI ============================ */
/* The Flow tab sits after Exp (else after Swarm). Its controls carry data attributes, so the app's settings-panel
   handlers skip them (they never re-save the app's settings): data-wf = a setting, data-wfo = a part, data-wfa = an action. */
const EXAMPLES = {
  'parallel then combine':{ args:'null', script:
`export const meta = {
  name: 'parallel-then-combine',
  description: 'three agents write at once, a fourth combines them',
  phases: [{ title: 'Write' }, { title: 'Combine' }],
}

phase('Write')
const topics = ['cats', 'rain', 'coffee']
const lines = await parallel(topics.map(t => () =>
  agent('Write one short, funny sentence about ' + t + '.', { label: 'write:' + t })))
log(lines.filter(Boolean).length + ' of ' + topics.length + ' written')

phase('Combine')
return await agent('Turn these into a 3-line poem:\\n' + lines.filter(Boolean).join('\\n'), { label: 'combine' })
` },
  'web search to JSON':{ args:'{"q": "Kingshot KvK prep phase tips"}', script:
`export const meta = {
  name: 'web-to-json',
  description: 'one agent searches the web (EVAL1 bridge) and answers as JSON',
}

phase('Search')
return await agent('Search the web for: ' + ((args && args.q) || 'Kingshot KvK tips') + '. Summarize what you found.', {
  label: 'search',
  tools: ['web'],
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      tips: { type: 'array', items: { type: 'string' } },
      sources: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'tips', 'sources'],
  },
})
` },
  'eval tool: repo check':{ args:'{"repo": "HalitZiyaKARTAL/test19"}', script:
`export const meta = {
  name: 'repo-check',
  description: 'an agent runs JavaScript itself (tool_eval_1) to read the GitHub API',
}

const repo = (args && args.repo) || 'HalitZiyaKARTAL/test19'
phase('Check')
return await agent('Use the eval tool to fetch https://api.github.com/repos/' + repo + '/commits?per_page=5 ' +
  '(in the worker: (async () => (await fetch(url)).json())()) and list the 5 latest commits: date and message.', {
  label: 'repo-check',
  tools: ['eval'],
})
` },
  'write then judge':{ args:'{"themes": ["after dodging a rally", "after winning a defense", "end of battle"]}', script:
`export const meta = {
  name: 'write-then-judge',
  description: 'each theme is written and judged as soon as its draft is ready',
  phases: [{ title: 'Write' }, { title: 'Judge' }],
}

const THEMES = (args && args.themes) || ['after dodging a rally']
const LINES = { type: 'object', properties: { lines: { type: 'array', items: { type: 'string' } } }, required: ['lines'] }
const VERDICT = {
  type: 'object',
  properties: { best: { type: 'string' }, score: { type: 'integer', minimum: 1, maximum: 5 }, why: { type: 'string' } },
  required: ['best', 'score', 'why'],
}

const results = await pipeline(THEMES,
  theme => agent('Write 5 short, cheeky but friendly game chat lines for this moment: ' + theme + '. Lowercase, casual, end with :D or :))',
    { label: 'write:' + theme, phase: 'Write', schema: LINES }),
  (draft, theme) => agent('Pick the funniest line for "' + theme + '" and score it 1-5:\\n' + draft.lines.join('\\n'),
    { label: 'judge:' + theme, phase: 'Judge', schema: VERDICT }),
)
return results.filter(Boolean)
` }
};
const $f = sel => document.querySelector('#tab-flow ' + sel);
const part = n => $f('[data-wfo="' + n + '"]');
const showControls = k => document.querySelectorAll('#tab-flow [data-wf="' + k + '"]').forEach(el => { el[el.type === 'checkbox' ? 'checked' : 'value'] = NS.config[k]; });
function removeFlowTab(){
  const b = document.querySelector('.tab-btn[data-tab="flow"]'); if (b){ if (b.classList.contains('active')){ const m = document.querySelector('.tab-btn[data-tab="model"]'); if (m) m.click(); } b.remove(); }
  const c = document.getElementById('tab-flow'); if (c) c.remove();
  const w = document.getElementById('wfPopWrap'); if (w) w.remove();
}
function flowHTML(){
  const C = NS.config;
  const row = (label, ctrl) => '<div class="setting-row"><span>' + esc(label) + '</span>' + ctrl + '</div>';
  const tg = k => '<label class="toggle"><input type="checkbox" data-wf="' + k + '"' + (C[k] ? ' checked' : '') + '><span class="slider"></span></label>';
  const num = (k, attrs) => '<input type="number" data-wf="' + k + '" ' + attrs + ' value="' + esc(C[k]) + '">';
  const act = (a, label, extra) => '<button type="button" class="btn-outline" data-wfa="' + a + '"' + (extra || '') + '>' + label + '</button>';
  return '<div class="wf-note" data-wfo="note"></div>'
    + row('Example', '<select data-wfo="example"><option value="">(your script)</option>' + Object.keys(EXAMPLES).map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join('') + '</select>')
    + '<textarea class="xt wf-code" data-wfo="script" spellcheck="false" autocomplete="off"></textarea>'
    + '<div class="wf-label">args (JSON)</div><textarea class="xt wf-code wf-args" data-wfo="args" spellcheck="false" autocomplete="off"></textarea>'
    + row('Provider', '<select data-wf="provider"></select>') + row('Model', '<select data-wf="model"></select>')
    + row('Agents at once', num('concurrency', 'min="1" max="32" step="1"'))
    + row('Budget $ (0 = no limit)', num('budgetUsd', 'min="0" step="0.1"'))
    + row('Tool rounds per agent', num('maxTurns', 'min="1" max="100" step="1"'))
    + row('Web search for every agent', tg('webSearch'))
    + row('Reuse saved results', tg('reuse'))
    + row('Dry run (fake answers, free)', tg('dryRun'))
    + '<div class="wf-bar">' + act('run', '▶ Run') + act('stop', '■ Stop', ' disabled') + act('clear', 'clear saved') + act('help', 'ⓘ') + '</div>'
    + '<div class="wf-totals" data-wfo="totals"></div><div data-wfo="agents"></div><ol class="wf-log" data-wfo="log"></ol>'
    + '<pre class="wf-result" data-wfo="result"></pre>'
    + '<div class="wf-bar">' + act('copy', 'copy') + act('toinput', 'to input') + act('journal', 'journal ⤓') + '</div>';
}
function buildFlowTab(){
  removeFlowTab();
  const btnAfter = document.querySelector('.tab-btn[data-tab="exp"]') || document.querySelector('.tab-btn[data-tab="swarm"]');
  const tabAfter = document.getElementById('tab-exp') || document.getElementById('tab-swarm');
  if (!btnAfter || !tabAfter) return warn('no Swarm/Exp tab to put the Flow tab after');
  btnAfter.insertAdjacentHTML('afterend', '<button class="tab-btn" data-tab="flow">Flow</button>');
  tabAfter.insertAdjacentHTML('afterend', '<div class="tab-content" id="tab-flow">' + flowHTML() + '</div>');
  const tab = document.getElementById('tab-flow');
  document.querySelector('.tab-btn[data-tab="flow"]')._ = tab;              /* the app switches tabs through ._ */
  part('script').value = loadText('dse_wf1_script', EXAMPLES['parallel then combine'].script);
  part('args').value = loadText('dse_wf1_args', EXAMPLES['parallel then combine'].args);
  tab.addEventListener('change', flowChange); tab.addEventListener('click', flowClick); tab.addEventListener('input', flowInput);
  part('script').addEventListener('keydown', e => { if (e.key !== 'Tab') return; e.preventDefault(); e.stopPropagation(); e.target.setRangeText('  ', e.target.selectionStart, e.target.selectionEnd, 'end'); });
  fillModels(); paint();
}
/* Provider: '' = the app's current one; Model: '' = the app's current model (for another provider, its default) */
function fillModels(){
  const ps = $f('[data-wf="provider"]'), ms = $f('[data-wf="model"]'); if (!ps || !ms) return;
  const pid = NS.config.provider && providers[NS.config.provider] ? NS.config.provider : '';
  ps.innerHTML = '<option value="">current (' + esc(activeProviderId) + ')</option>' + Object.keys(providers).filter(id => id !== 'custom_template').map(id => '<option value="' + esc(id) + '">' + esc((providers[id] && providers[id].name) || id) + '</option>').join('');
  ps.value = pid;
  const p = providers[pid || activeProviderId], cur = pid && pid !== activeProviderId ? (p && p.defaultModel) : getCurrentModel();
  const ids = [...new Set((p ? modelIds(p) : []).concat(pid && pid !== activeProviderId ? [] : Array.from(els.modelSelect.options, o => o.value)))].filter(Boolean);
  ms.innerHTML = '<option value="">current (' + esc(cur || '?') + ')</option>' + ids.map(m => '<option value="' + esc(m) + '">' + esc(m) + '</option>').join('');
  ms.value = ids.includes(NS.config.model) ? NS.config.model : '';
}
function flowChange(e){
  const t = e.target, d = t.dataset;
  if (d.wf){ try { NS.set(d.wf, t.type === 'checkbox' ? t.checked : t.value); } catch(err){ showControls(d.wf); showToast('⚠️ ' + err.message); } return; }
  if (d.wfo === 'example' && EXAMPLES[t.value]){ part('script').value = EXAMPLES[t.value].script; part('args').value = EXAMPLES[t.value].args; keepText('dse_wf1_script', part('script').value); keepText('dse_wf1_args', part('args').value); }
}
function flowInput(e){
  const d = e.target.dataset;
  if (d.wfo === 'script'){ keepText('dse_wf1_script', e.target.value); const ex = part('example'); if (ex) ex.value = ''; }
  else if (d.wfo === 'args') keepText('dse_wf1_args', e.target.value);
}
function flowClick(e){
  const skip = e.target.closest('[data-wfskip]');
  if (skip && NS.current){ const rec = NS.current.recs.find(x => String(x.id) === skip.dataset.wfskip); if (rec) rec.ctrl.abort(); return; }
  const b = e.target.closest('[data-wfa]'); if (!b) return;
  const a = b.dataset.wfa, R = NS.current;
  if (a === 'run') start(part('script').value, part('args').value).catch(err => showToast('⚠️ ' + err.message));
  else if (a === 'stop') stop('stopped by you');
  else if (a === 'clear'){ NS.saved.clear(); paint(); showToast('saved results cleared'); }
  else if (a === 'help') popup('<pre style="white-space:pre-wrap;margin:0;font:11px/1.45 ui-monospace,Menlo,Consolas,monospace">' + esc(NS.readme) + '</pre>', 'Workflow A1 v' + VERSION);
  else if (a === 'copy'){ try { navigator.clipboard.writeText(resultText(R)); showToast('copied'); } catch(err){} }
  else if (a === 'toinput' && R && R.t1){ els.messageInput.value = resultText(R); els.messageInput.dispatchEvent(new Event('input', { bubbles:true })); els.settingsPanel.classList.remove('open'); els.messageInput.focus(); }
  else if (a === 'journal' && R) download(R);
}
const resultText = R => !R ? '' : R.result === undefined ? '' : typeof R.result === 'string' ? R.result : JSON.stringify(R.result, null, 2);
function download(R){
  const j = { tool:'workflowtestA1 v' + VERSION, eval1:E1() ? E1().version : null, meta:R.meta, config:R.cfg, started:new Date(R.t0).toISOString(), ended:R.t1 ? new Date(R.t1).toISOString() : null,
    usd:R.usd, costUnknownPart:R.unknown, tokens:{ input:R.tin, output:R.tout }, agents:R.recs.map(x => { const c = Object.assign({}, x); delete c.ctrl; return c; }), logs:R.logs, result:R.result, error:R.error };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(j, null, 2)], { type:'application/json' }));
  a.download = String((R.meta && R.meta.name) || 'workflow').replace(/[^\w.-]+/g, '_') + '-journal.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function popup(html, title){
  const old = document.getElementById('wfPopWrap'); if (old) old.remove();
  const w = document.createElement('div'); w.id = 'wfPopWrap'; w.className = 'wf-pop-wrap';
  w.innerHTML = '<div class="wf-pop"><div class="wf-pop-head"><span>' + esc(title) + '</span><button type="button" data-wfx="1">×</button></div><div class="wf-pop-body">' + html + '</div></div>';
  document.body.appendChild(w);
  w.addEventListener('click', e => { if (e.target.closest('[data-wfx]') || !e.target.closest('.wf-pop')) w.remove(); });
}
/* one paint per frame: the tab (when it exists) and the header pill */
let painting = 0;
function paint(){ if (painting || NS.off) return; painting = requestAnimationFrame(() => { painting = 0; try { draw(); } catch(e){ warn('draw: ' + e.message); } }); }
const secs = (a, b) => a ? (((b || Date.now()) - a) / 1000).toFixed(1) + 's' : '';
const kilo = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(n || 0);
function draw(){
  drawPill();
  const tab = document.getElementById('tab-flow'); if (!tab) return;
  const R = NS.current, busy = running(), e1 = E1();
  part('note').innerHTML = (e1 ? 'EVAL1 v' + esc(e1.version) + ' on: bridges, tools and pricing apply.' : '⚠️ EVAL1 is not running: plain requests, no web search, no tools.')
    + ' Saved results: ' + NS.saved.size + '.';
  $f('[data-wfa="run"]').disabled = busy; $f('[data-wfa="stop"]').disabled = !busy;
  if (!R){ part('totals').textContent = 'Not started.'; part('agents').innerHTML = ''; part('log').innerHTML = ''; part('result').textContent = ''; return; }
  const n = st => R.recs.filter(x => x.state === st).length;
  part('totals').innerHTML = (R.meta && R.meta.name ? '<b>' + esc(R.meta.name) + '</b>' + (R.meta.description ? ' · ' + esc(R.meta.description) : '') + '<br>' : '')
    + 'agents: ' + n('done') + ' done · ' + n('saved') + ' saved · ' + n('running') + ' running · ' + n('queued') + ' waiting · ' + (n('error') + n('skipped')) + ' failed/skipped'
    + '<br>tokens: ' + kilo(R.tin) + ' in · ' + kilo(R.tout) + ' out · cost ' + esc(money(R.usd, R.unknown)) + (R.cfg.budgetUsd > 0 ? ' of ' + esc(money(R.cfg.budgetUsd)) : '')
    + ' · ' + secs(R.t0, R.t1) + (R.cfg.dryRun ? ' · <b>dry run</b>' : '');
  const box = part('agents'), open = new Set(Array.from(box.querySelectorAll('details[open]'), d => d.dataset.ph)), groups = new Map();
  R.recs.forEach(x => { if (!groups.has(x.phase)) groups.set(x.phase, []); groups.get(x.phase).push(x); });
  box.innerHTML = Array.from(groups, ([ph, xs]) => {
    const ok = xs.filter(x => x.state === 'done' || x.state === 'saved').length, isOpen = open.has(ph) || xs.some(x => x.state === 'running' || x.state === 'queued') || !box.childElementCount;
    return '<details class="wf-ph" data-ph="' + esc(ph) + '"' + (isOpen ? ' open' : '') + '><summary>' + esc(ph) + ' (' + ok + '/' + xs.length + ')</summary>' + xs.map(x =>
      '<div class="wf-a"><span class="wf-b wf-' + x.state + '">' + x.state + '</span>' + esc(x.label)
      + ' <span class="wf-m">' + [secs(x.t0, x.t1), x.model, x.tin + x.tout ? kilo(x.tin) + '/' + kilo(x.tout) + 't' : x.chars ? kilo(x.chars) + ' chars' : '', x.usd || x.unknown ? money(x.usd, x.unknown) : '', x.calls ? x.calls + ' tool calls' : ''].filter(Boolean).map(esc).join(' · ') + '</span>'
      + (x.state === 'running' ? ' <button type="button" class="btn-outline wf-skip" data-wfskip="' + x.id + '">skip</button>' : '')
      + (x.notes.length ? '<div class="wf-n">' + esc(x.notes.join(' · ')) + '</div>' : '')
      + (x.error ? '<div class="wf-e">' + esc(x.error) + '</div>' : '')
      + (x.preview ? '<div class="wf-p">' + esc(x.preview.slice(0, 200)) + (x.preview.length > 200 ? '…' : '') + '</div>' : '') + '</div>').join('') + '</details>';
  }).join('');
  const lg = part('log'); lg.innerHTML = R.logs.slice(-120).map(l => '<li' + (l.bad ? ' class="bad"' : '') + '>' + esc(l.t) + '</li>').join(''); lg.scrollTop = lg.scrollHeight;
  part('result').textContent = busy ? '(running…)' : R.error ? '(' + (R.off ? 'stopped: ' + R.why : 'script error: ' + R.error) + ')' : R.result === undefined ? '(the script returned nothing)' : resultText(R);
}
/* header pill while a run is going: agents done / all and the cost so far; click opens the Flow tab */
function drawPill(){
  let el = document.getElementById('wf1Pill'); const R = NS.current;
  if (!R || R.t1){ if (el) el.remove(); return; }
  if (!el){
    el = document.createElement('span'); el.id = 'wf1Pill'; el.title = 'workflow running: click for the Flow tab';
    el.addEventListener('click', () => { els.settingsPanel.classList.add('open'); const b = document.querySelector('.tab-btn[data-tab="flow"]'); if (b) b.click(); });
    const hr = document.querySelector('.header-right'); if (hr) hr.insertBefore(el, hr.firstChild); else return;
  }
  el.textContent = '🧩 ' + R.recs.filter(x => x.state === 'done' || x.state === 'saved').length + '/' + R.recs.length + ' · ' + money(R.usd, R.unknown);
}
added(() => { const el = document.getElementById('wf1Pill'); if (el) el.remove(); });

/* ============================ STYLES ============================ */
/* one sheet for everything this draws (taken back by disable()); the textareas win over EVAL1's panel padding rule */
mine(document.head.appendChild(Object.assign(document.createElement('style'), { id:'wf1-ui', textContent:
  '#tab-flow textarea.wf-code{box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-height:30vh;height:auto;padding:8px!important;margin:0!important;font:12px/1.45 ui-monospace,Menlo,Consolas,monospace!important;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:8px;resize:vertical;white-space:pre;overflow:auto;field-sizing:fixed!important;flex-shrink:0}'
  + '#tab-flow textarea.wf-args{min-height:52px}.wf-label{font-size:.72rem;color:var(--text-secondary)}.wf-note{font-size:.72rem;color:var(--text-secondary)}'
  + '.wf-bar{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0}.wf-bar .btn-outline{padding:3px 10px;font-size:.75rem}.wf-bar .btn-outline:disabled{opacity:.4}'
  + '.wf-totals{font-size:.72rem;color:var(--text-secondary);line-height:1.5}.wf-ph{border:1px solid var(--border);border-radius:8px;padding:3px 8px;margin:3px 0}.wf-ph summary{cursor:pointer;font-weight:600;font-size:.78rem}'
  + '.wf-a{font-size:.74rem;padding:4px 0;border-top:1px solid var(--border);word-break:break-word}.wf-m{color:var(--text-secondary);font-size:.68rem}.wf-skip{padding:0 6px!important;font-size:.65rem!important}'
  + '.wf-b{display:inline-block;min-width:52px;text-align:center;border:1px solid currentColor;border-radius:999px;font-size:.62rem;margin-right:6px;padding:0 5px}'
  + '.wf-queued{color:var(--text-secondary)}.wf-running{color:var(--accent)}.wf-done{color:var(--success)}.wf-saved{color:var(--warning)}.wf-error,.wf-skipped{color:var(--danger)}'
  + '.wf-n{color:var(--warning);font-size:.68rem}.wf-e{color:var(--danger);font-size:.68rem}.wf-p{color:var(--text-secondary);font-size:.68rem}'
  + '.wf-log{margin:2px 0;padding-left:18px;font:10.5px/1.4 ui-monospace,Menlo,Consolas,monospace;max-height:20vh;overflow:auto;color:var(--text-secondary)}.wf-log .bad{color:var(--danger)}'
  + '.wf-result{margin:2px 0;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:8px;max-height:35vh;min-height:2em;overflow:auto;white-space:pre-wrap;word-break:break-word;font:11.5px/1.45 ui-monospace,Menlo,Consolas,monospace;flex-shrink:0}'
  + '#wf1Pill{font-size:.68rem;padding:2px 8px;border-radius:6px;background:var(--border);color:var(--accent);font-family:monospace;white-space:nowrap;cursor:pointer;margin-right:4px}'
  + '.wf-pop-wrap{position:fixed;inset:0;z-index:8950;background:rgba(0,0,0,.45)}.wf-pop{position:absolute;top:max(64px,calc(env(safe-area-inset-top,0px) + 64px));left:50%;transform:translateX(-50%);width:min(620px,calc(100dvw - 24px));max-height:calc(100dvh - 120px);display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.6);overflow:hidden}'
  + '.wf-pop-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600;font-size:.85rem}.wf-pop-head button{background:none;border:none;color:var(--text-secondary);font-size:1.2rem;cursor:pointer}.wf-pop-body{padding:12px 14px;overflow:auto;color:var(--text)}' })));

/* ============================ API + BOOT ============================ */
function apply(){
  if (NS.off) return warn('turned off by disable(): paste again to turn it back on');
  if (!document.getElementById('tab-flow')) buildFlowTab();
  paint(); NS.installed = true;
}
function disable(){ stop('the add-on was turned off'); while (TAKE_BACK.length) try { TAKE_BACK.pop()(); } catch(e){} NS.installed = false; NS.off = true; }
added(removeFlowTab);
/* the model list refills on provider switches, Apply and key saves: the Flow tab's lists follow */
{ const m = new MutationObserver(() => fillModels()); m.observe(els.modelSelect, { childList:true }); added(() => m.disconnect()); }
on(els.modelSelect, 'change', () => fillModels());
Object.assign(NS, {
  version:VERSION, apply, disable, stop:() => stop('stopped by you'),
  /* run a script (default: the Flow tab's); args as JSON text or a value */
  run:(src, args) => start(src != null ? src : (part('script') ? part('script').value : ''), args === undefined ? (part('args') ? part('args').value : 'null') : typeof args === 'string' ? args : JSON.stringify(args)),
  /* one agent from the console, shown in the Flow tab like a run: await __wf1.agent('hi', { schema, tools, model }) */
  agent:(prompt, opts) => start('return await agent(args.p, args.o)', JSON.stringify({ p:prompt, o:opts || {} }), 'console agent').then(R => R.error ? Promise.reject(Error(R.error)) : R.result),
  status:() => ({ version:VERSION, installed:!!NS.installed, eval1:E1() ? E1().version : null, running:running(), saved:NS.saved.size, config:clone(NS.config),
    last:NS.current ? { name:NS.current.meta && NS.current.meta.name, agents:NS.current.recs.length, usd:NS.current.usd, error:NS.current.error } : null }),
  clearSaved:() => { NS.saved.clear(); paint(); },
  examples:EXAMPLES
});
Object.keys(SETTERS).forEach(k => { NS['set' + k[0].toUpperCase() + k.slice(1)] = v => NS.set(k, v); });

/* ============================ README ============================ */
NS.readme = `====================================================================
 WORKFLOW A1 v${VERSION} (workflowtestA1) - README
====================================================================

0. WHAT IT IS
 - A third add-on for the AI Chat app: paste it into the eval console
   after 96claudeeditB12.js (EVAL1). It runs multi-agent workflow
   scripts on the app's own provider, key and model.
 - Settings -> "Flow" tab: script, args, options, Run / Stop, progress
   per agent, result (copy, to input, journal download).
 - Console: __wf1.run(), __wf1.agent(), __wf1.stop(), __wf1.status(),
   __wf1.set(name, value), __wf1.help(). __wf1.disable() takes it all
   back; a new paste disables the running build first.

1. PASTE RULE
 - Same as EVAL1: a paste replaces the running build only if that is
   the same version or older. Three if (true) gates at the top tailor it.

2. SCRIPTS
 - An async function body (Claude Code workflow style). It may start
   with export const meta = { name, description, phases }.
 - await agent(prompt, opts): the answer as text, or the schema's value
   when opts.schema is given; null when that agent failed or was
   skipped. Throws when the run is stopped or the budget is spent.
 - await parallel([() => agent(...), ...]): all at once, up to "Agents
   at once"; a task that throws becomes null.
 - await pipeline(items, stage1, stage2, ...): each item goes through the
   stages on its own; stages get (previous, item, index); a stage that
   throws turns that item into null.
 - phase(title) groups the agents after it; log(text) prints a line;
   args = the args JSON; budget.total / spent() / remaining() in $.
 - Scripts run in the page's global scope: they see these helpers and
   window (__eval1, __wf1, __tools), not the app's own names.

3. AGENT OPTIONS
 - label, phase: how it shows in the Flow tab.
 - schema: a JSON Schema; the answer is asked for as JSON in the prompt,
   checked (types, required, enum, min/max, lengths, item counts) and
   sent back once for a fix when it does not match.
 - tools: ['web'] = server web search through EVAL1's bridges (DeepSeek
   via the Anthropic bridge, profiled models via /responses);
   ['eval'] = tool_eval_1 (runs JavaScript in a worker, or on the page
   with worker:false); any other name = that tool of window.__tools.
   Tool rounds per agent is the limit (Flow tab, or opts.maxTurns).
 - provider, model, agent (an app agent id: its provider, model, prompt
   and request), system, maxTokens, temperature, request (extra request
   fields), effort (replaces reasoning_effort only when the model's
   request already sends one).

4. REQUESTS AND COST
 - Sent the app's way (executeAPI): its provider JSON, key, model,
   request fields and max tokens, streamed when the app streams. The
   page's fetch carries it, so EVAL1's bridges and coalescer apply.
 - Each request is billed by the app's own biller at EVAL1's price
   state for that moment (peak / off / discount); a request without
   usage marks the cost "+". Workflow costs are not added to the chat.
 - Budget $ (0 = no limit): once spent, new agent() calls throw.

5. SAVED RESULTS
 - An agent call identical to an earlier one (same provider, model,
   prompt, schema, tools, system, request settings) returns the saved
   answer at no cost while "Reuse saved results" is on. RAM only; kept
   across pastes; "clear saved" empties it.

6. STORAGE
 - dse_wf1_config (options), dse_wf1_script, dse_wf1_args.

7. WHEN YOU EDIT IT
 - As in EVAL1: fix things where they are defined; only this readme
   grows by addition. Bump the last VERSION number on every change.
====================================================================
`;
NS.help = () => { console.log(NS.readme); return NS.readme; };

apply(); save();
console.log('[wf1 v' + VERSION + '] installed' + (E1() ? ' on EVAL1 v' + E1().version : ' (EVAL1 not running: plain requests)'));
})();
