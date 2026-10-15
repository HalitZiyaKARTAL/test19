// price_fuzz.mjs <ref.html> <cand.html> [--n 200000] [--seed 7] [--cov]
// Differential test of the app's usage/pricing code (html lines 510, 651, 652, 670-684: the only lines where a
// converted `let` shares its name with a parameter or another declaration of the same function). Both pages' lines
// are loaded into separate VM contexts and fed the same inputs:
//   A. applyResponseMetadata(version, raw, config, reportedExact) with random provider usage, price tables, configs,
//      and reported costs placed around the app's own computed cost (equal, a hair below/above within the money
//      epsilon, far below/above);
//   B. normalizeUsage / priceUsage / bill called directly on random already-mapped usage (fields the providers do not
//      send, flags, negative and non-integer counts), so every branch of the two minified functions runs;
//   C. usageValue / mapUsage / mergeUsage / safeSum / cacheSum on random inputs.
// Results are compared as JSON (undefined, NaN and ±Infinity kept distinct). With --cov the run also records V8
// block coverage of the candidate's lines 671-676 and lists every block that never ran.
import fs from 'node:fs';
import vm from 'node:vm';
import inspector from 'node:inspector';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [refPath, candPath] = args, N = +opt('--n', 200000), SEED = +opt('--seed', 7), COV = args.includes('--cov');
const LINES = [510, 651, 652, ...Array.from({ length: 684 - 670 + 1 }, (_, i) => 670 + i)];
const load = (file, tag) => {
  const all = fs.readFileSync(file, 'utf8').split('\n');
  const src = LINES.map(n => all[n - 1]).join('\n');
  const code = `(function(){${src}\nreturn {bill,applyResponseMetadata,usageValue,mapUsage,mergeUsage,normalizeUsage,priceUsage,safeSum,cacheSum,moneyEpsilon,usageFamilies,usageProfiles,costFields,nn};})()`;
  const script = new vm.Script(code, { filename: 'pricing_' + tag + '.js' });
  return { api: script.runInNewContext({}), code, src };
};
let session;
if (COV) { session = new inspector.Session(); session.connect(); const post = (m, p) => new Promise((res, rej) => session.post(m, p || {}, (e, r) => e ? rej(e) : res(r)));
  await post('Profiler.enable'); await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true }); globalThis.__post = post; }
const R = load(refPath, 'ref'), C = load(candPath, 'cand'), A = R.api, B = C.api;

let seed = SEED >>> 0; const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };   // mulberry32
const pick = a => a[Math.floor(rnd() * a.length)], maybe = (p, f) => rnd() < p ? f() : undefined;
const J = x => JSON.stringify(x, (k, v) => v === undefined ? '__undef' : typeof v === 'number' && !Number.isFinite(v) ? '__' + String(v) : v);
const cnt = () => pick([0, 0, 1, 2, 7, 15, 100, 999, 1000, 4096, 50000, 272001, 300000, 1e6, 2 ** 52, 2 ** 53 - 1, 2 ** 53 - 1, 2 ** 53, -1, -100, 1.5, 1.5, 0.25, NaN, Infinity, '12', '0', '', ' ', 'x', null, undefined, true, {}, []]);
const cntOk = () => pick([0, 1, 3, 10, 64, 100, 500, 1000, 2000, 30000, 300000]);
const price = () => pick([0, 1e-9, 3e-9, 1e-8, 1.5e-7, 2e-7, 1e-6, 2e-6, 1.2e-5, 4e-6, 1e-6, '1e-6', 'x', null, undefined, -1e-6, NaN, 1e-16, 3e-17, 1e302]);
const priceOk = () => pick([0, 1e-9, 3e-9, 1e-8, 1.5e-7, 2e-7, 1e-6, 2e-6, 1.2e-5, 1e-16, 3e-17]);
const table = ok => { const P = ok ? priceOk : price, t = {};
  for (const k of ['inputCacheHit', 'inputCacheMiss', 'inputCacheWrite', 'output', 'input', 'inputUnknown']) { const v = maybe(k === 'input' || k === 'inputUnknown' ? 0.3 : 0.75, P); if (v !== undefined) t[k] = v; }
  if (rnd() < 0.25) { const same = P(); for (const k of ['inputCacheHit', 'inputCacheMiss', 'inputCacheWrite']) if (rnd() < 0.8) t[k] = same; }   // equal prices: the inputUnknown fallback
  if (rnd() < 0.3) t.tiers = [{ minInput: 0, ...table(true) }, { minInput: pick([100, 1000, 272001, '50', null]), ...table(ok) }].slice(0, pick([1, 2, 2]));
  return t; };
const rawGen = () => {
  const r = {}, put = (k, f, p = 0.4) => { const v = maybe(p, f); if (v !== undefined) r[k] = v; };
  const fam = pick(['chat', 'chat', 'anthropic', 'gemini', 'mixed']);
  const C1 = rnd() < 0.7 ? cntOk : cnt;
  if (fam === 'chat' || fam === 'mixed') { put('prompt_tokens', C1, 0.85); put('completion_tokens', C1, 0.85); put('total_tokens', C1, 0.5); put('prompt_cache_hit_tokens', C1); put('prompt_cache_miss_tokens', C1);
    if (rnd() < 0.4) r.prompt_tokens_details = { cached_tokens: C1(), ...(rnd() < 0.3 ? { cache_write_tokens: C1() } : {}) };
    if (rnd() < 0.4) r.completion_tokens_details = { reasoning_tokens: C1() }; put('reasoning_tokens', C1, 0.1); put('num_cached_tokens', C1, 0.1); }
  if (fam === 'anthropic' || fam === 'mixed') { put('input_tokens', C1, 0.85); put('output_tokens', C1, 0.85); put('cache_read_input_tokens', C1); put('cache_creation_input_tokens', C1);
    if (rnd() < 0.3) r.output_tokens_details = { thinking_tokens: C1(), reasoning_tokens: maybe(0.3, C1) }; if (rnd() < 0.2) r.input_tokens_details = { cached_tokens: C1(), cache_write_tokens: maybe(0.5, C1) }; }
  if (fam === 'gemini' || fam === 'mixed') { put('promptTokenCount', C1, 0.85); put('candidatesTokenCount', C1, 0.85); put('responseTokenCount', C1, 0.1); put('thoughtsTokenCount', C1); put('cachedContentTokenCount', C1); put('totalTokenCount', C1); }
  put('cost_usd', () => pick([0, 1e-6, 0.0004, 0.002, 0.05, 1, -1, 'x', '0.001', null]), 0.15); put('total_cost_usd', () => pick([0.003, 2]), 0.05);
  if (rnd() < 0.05) r.billing = { cost_usd: pick([0.001, 0, 'x']) };
  if (rnd() < 0.1) r.usage = { cost_in_usd_ticks: pick([0, 12345, 1e7, 5e8, -3, 'x']) };
  put('num_server_side_tools_used', () => pick([0, 1, 3]), 0.05); if (rnd() < 0.03) r.web_search_usage = { tool_usage: pick([1, 0, 'x']) };
  if (rnd() < 0.03) r.server_tool_use = { web_search_requests: 2 };
  return r; };
const fams = ['chat', 'anthropic', 'gemini'], profs = Object.keys(A.usageProfiles).concat([undefined, undefined]);
const configGen = () => {
  const F = A.usageFamilies[pick(fams)], P = A.usageProfiles[pick(profs)] || {};
  const c = { ...F, ...P, usageMap: { ...F.usageMap, ...P.usageMap }, pricing: table(rnd() < 0.6), p: { id: 'p' + Math.floor(rnd() * 3) }, m: 'm' };
  if (rnd() < 0.15) c.reasoningInOutput = pick([true, false, undefined, 'x', 1]);
  if (rnd() < 0.15) c.cacheRemainder = pick(['cacheMiss', 'cacheHit', 'cacheWrite', undefined, 'nope']);
  if (rnd() < 0.1) c.usageCostScale = pick([1, 1e-10, 0, 'x', undefined, null]);
  if (rnd() < 0.05) c.usageMap = { ...c.usageMap, [pick(['input', 'output', 'cacheWrite', 'reasoning', 'total'])]: pick([0, false, null, '', 'prompt_tokens', ['?prompt_tokens', 'completion_tokens'], ['prompt_tokens'], 5, -1, 'nope.path']) };
  return c; };
let n = 0, diffs = 0; const byKind = {}, ex = [];
const cmp = (kind, f) => { n++; let a, b;
  try { a = J(f(A)); } catch (e) { a = 'THROW ' + e.message; }
  try { b = J(f(B)); } catch (e) { b = 'THROW ' + e.message; }
  if (a !== b) { diffs++; byKind[kind] = (byKind[kind] || 0) + 1; if (ex.length < 8) ex.push({ kind, ref: a.slice(0, 500), cand: b.slice(0, 500) }); } };
const clone = x => x === undefined ? x : JSON.parse(JSON.stringify(x));
for (let k = 0; k < N; k++) {
  // A. the full path, as the app calls it
  const raw = rawGen(), cfg = configGen();
  let base; try { const v = {}; A.applyResponseMetadata(v, clone(raw), cfg); base = A.bill(A.mapUsage(clone(raw), cfg.usageMap), cfg.pricing || {}, undefined, cfg).total; } catch (e) { base = 0; }
  const r = Number.isFinite(base) ? base : 0, eps = A.moneyEpsilon(r, r);
  const exact = pick([undefined, undefined, null, 0, r, r, r + eps / 3, r - eps / 3, r - eps / 8, r * (1 + 1e-17), r * (1 - 1e-16), r - 1e-18, r * 0.5, r * 2, r + 1e-4, 1e-4, 0.002, -1, NaN, '0.001', 1e7]);
  cmp('applyResponseMetadata', X => { const v = { metadata: { cost: { exact: { total: '$9' } } } }; X.applyResponseMetadata(v, clone(raw), cfg, exact); return v; });
  // B. the two minified functions directly
  const t = {}; for (const key of ['input', 'output', 'total', 'reasoning', 'cacheHit', 'cacheMiss', 'cacheWrite', 'fee']) { const v = maybe(0.7, rnd() < 0.75 ? cntOk : cnt); if (v !== undefined) t[key] = v; }
  if (rnd() < 0.5) t._ = Object.fromEntries(['input', 'output', 'cacheMiss', 'cacheHit', 'total'].filter(() => rnd() < 0.2).map(x => [x, 1]));
  const o = { reasoningInOutput: pick([true, false, undefined, 'x']), cacheRemainder: pick(['cacheMiss', 'cacheHit', 'cacheWrite', undefined]) };
  cmp('normalizeUsage', X => X.normalizeUsage(clone(t), o));
  const pt = clone(t); if (rnd() < 0.3) Object.assign(pt, { unknown: pick([0, 5, 100, -1, undefined]), partial: rnd() < 0.5, conflict: rnd() < 0.3, unpriced: rnd() < 0.2 });
  const tab = table(rnd() < 0.5);
  let r2; try { r2 = A.priceUsage(clone(pt), clone(tab)).total; } catch (e) { r2 = 0; } r2 = Number.isFinite(r2) ? r2 : 0;
  const e2 = A.moneyEpsilon(r2, r2), ex2 = pick([undefined, null, 0, r2, r2 + e2 / 4, r2 - e2 / 4, r2 - e2 / 2, r2 * (1 - 1e-16), r2 / 3, r2 * 3, 0.01, '0.5', -2, NaN]);
  cmp('priceUsage', X => X.priceUsage(clone(pt), clone(tab), ex2));
  const ex3 = pick([0, 0, r2 * (1 - 4e-16), r2 - e2 * 0.9]);                        // a reported cost a hair below the price list
  cmp('priceUsage(near)', X => X.priceUsage(clone(pt), clone(tab), ex3));
  cmp('bill', X => X.bill(clone(t), clone(tab), ex2, o));
  // C. the small helpers
  const path = pick(['cost_usd', 'prompt_tokens,input_tokens', 'a.b,c', ['prompt_tokens', '?cache_read_input_tokens'], ['?x', '?y'], ['x'], [], 5, -3, 0, '', false, null, undefined, 'usage.cost_in_usd_ticks', ' , prompt_tokens ']);
  cmp('usageValue', X => { const bad = {}; return [X.usageValue(clone(raw), path, bad), bad]; });
  cmp('mapUsage', X => X.mapUsage(clone(raw), cfg.usageMap));
  const raw2 = rawGen(), base1 = pick([raw, raw, undefined, null, {}]), add2 = pick([raw2, raw2, raw2, undefined, null]);
  cmp('mergeUsage', X => X.mergeUsage(clone(base1), clone(add2)));
  if (k % 50 === 0) {                                                             // costs so large that their sum is not finite
    const big = { input: pick([1e6, 2e6]), output: pick([1e6, 3e6]), cacheHit: 0, cacheMiss: pick([1e6, 0]), cacheWrite: 0 }, bt = { inputCacheMiss: 1e302, output: pick([1e302, 2e302]), inputCacheHit: 1e-6 };
    const bx = pick([undefined, 1, 1e308]);
    cmp('priceUsage(huge)', X => X.priceUsage(clone(big), clone(bt), bx));
  }
  const nums = Array.from({ length: Math.floor(rnd() * 5) }, () => rnd() < 0.8 ? cntOk() : cnt());
  cmp('safeSum/cacheSum', X => [X.safeSum(...nums), X.cacheSum(clone(t))]);
}
console.log('ref ' + refPath.split('/').pop() + ' vs cand ' + candPath.split('/').pop() + ': ' + n + ' comparisons, ' + diffs + ' differ' + (diffs ? ' ' + JSON.stringify(byKind) : ''));
ex.forEach((x, i) => console.log('  example ' + (i + 1) + ' [' + x.kind + ']\n    ref : ' + x.ref + '\n    cand: ' + x.cand));
if (COV) {
  const { result } = await globalThis.__post('Profiler.takePreciseCoverage'); await globalThis.__post('Profiler.stopPreciseCoverage');
  const sc = result.find(s => s.url === 'pricing_cand.js');
  const code = C.code, off = code.indexOf(C.src), lineStart = []; { let p = off; for (const L of LINES) { lineStart.push([L, p]); p += fs.readFileSync(candPath, 'utf8').split('\n')[L - 1].length + 1; } }
  const where = pos => { let best = lineStart[0]; for (const x of lineStart) if (x[1] <= pos) best = x; return 'L' + best[0] + ':' + (pos - best[1] + 1); };
  const zero = [];
  for (const f of sc.functions) for (const r of f.ranges) if (r.count === 0) { const w = where(r.startOffset), L = +w.slice(1).split(':')[0]; if (L >= 671 && L <= 676) zero.push(w + ' (' + (r.endOffset - r.startOffset) + ' chars) ' + JSON.stringify(code.slice(r.startOffset, Math.min(r.endOffset, r.startOffset + 60)))); }
  console.log('coverage of the candidate, lines 671-676: blocks never run: ' + zero.length); zero.forEach(z => console.log('   ' + z));
}
