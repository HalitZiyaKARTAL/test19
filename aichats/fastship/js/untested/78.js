/* ============================================================
   EVAL1 v4.7.0 — fresh redesign (written from zero)
   Paste into eval console. Idempotent; disable() restores fully.
   Architecture:
     CORE · HOOKS · FETCH(bridges/coalescer) · PRICING · TOOLS
     · AGENTIC · MARKED · UI · API
   ============================================================ */
(() => {

/* ============================ CORE ============================ */
const VERSION = '4.8.0';
const NS = window.__eval1 = window.__eval1 || {};
const FIRST = !NS._v4;

const DEFAULTS = {
  mode:'auto', webSearch:true, webSearchStyle:'tools', showSearchTrace:true, paintIntervalMs:160,
  markedSrc:'https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.js',
  toolEchoCollapseChars:2000, thinkingHistory:'all', peakCounter:'off', toolFontScale:0.7,
  toolMaxTurns:100, toolMaxTurnsOn:true, autoTools:[],
  evalToolVersion:'auto', evalToolNameOverride:'', evalToolNameOverrideOn:false, agenticTools:'on',
  toolCostNote:true, relaxedSendCriteria:false, staleHunter:false, staleHunterMs:900000
};
NS.config = Object.assign({}, DEFAULTS, NS.config || {});
try { Object.assign(NS.config, JSON.parse(localStorage.getItem('dse_eval1_config') || '{}')); } catch(e){}
function save(){ try { localStorage.setItem('dse_eval1_config', JSON.stringify(NS.config)); } catch(e){} }

const FLAGS = ['marked','anthropic','hybrid','pill','bridgeStream','tools'];
NS.flags = NS.flags || {};
FLAGS.forEach((k,i) => { NS.flags[k] = (window['eval1b' + (i+1)] ?? 1) ? 1 : 0; });
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

/* ============================ HOOKS ============================ */
const ORIG = NS._orig || {};
const BINDINGS = {
  executeAPI:            { get:() => executeAPI,            set:v => { executeAPI = v; } },
  buildAPIMessages:      { get:() => buildAPIMessages,      set:v => { buildAPIMessages = v; } },
  formatMarkdown:        { get:() => formatMarkdown,        set:v => { formatMarkdown = v; } },
  buildCodeBlockHTML:    { get:() => buildCodeBlockHTML,    set:v => { buildCodeBlockHTML = v; } },
  applyResponseMetadata: { get:() => applyResponseMetadata, set:v => { applyResponseMetadata = v; } },
  renderFullChat:        { get:() => renderFullChat,        set:v => { renderFullChat = v; } }
};
const HOOKS = (() => {
  const layers = {};
  const install = name => {
    const b = BINDINGS[name]; if (!b || !ORIG[name]) return;
    let fn = ORIG[name];
    (layers[name] || []).forEach(h => { fn = h.make(fn); });
    b.set(fn);
  };
  return {
    wrap: (name, id, make) => {
      const l = layers[name] = layers[name] || [];
      if (l.some(h => h.id === id)) return;
      l.push({ id, make }); install(name);
    },
    unwrap: (name, id) => {
      const l = layers[name]; if (!l) return;
      const i = l.findIndex(h => h.id === id); if (i < 0) return;
      l.splice(i, 1); install(name);
    },
    restoreAll: () => {
      Object.keys(BINDINGS).forEach(name => { if (ORIG[name]) BINDINGS[name].set(ORIG[name]); });
      Object.keys(layers).forEach(k => delete layers[k]);
    }
  };
})();

/* clean any prior eval1 leftovers (v3/v4) once, before capturing originals */
function cleanup(){
  try { if (String(NS.version || '').indexOf('3.') === 0 && typeof NS.disable === 'function') NS.disable(); } catch(e){}
  ['eval1Pill','expPopupWrap','expStyle','dse-peak-timer','dse-codeblock-ux','dse-peak-ui','dse-settings-fix','dse-exp-toolfix','dse-ui-collapser-fix','eval1-ui'].forEach(id => {
    const el = document.getElementById(id); if (el) el.remove();
  });
  const tb = document.querySelector('.tab-btn[data-tab="exp"]'); if (tb) tb.remove();
  const tc = document.getElementById('tab-exp'); if (tc) tc.remove();
  if (window.__dseCounterTick){ clearInterval(window.__dseCounterTick); window.__dseCounterTick = 0; }
  ['__eval1_patched_v33','__dseBAMWrapped','__dseCurMsgHint','__dsePeakStampDone','__dseExpInfoDone','__dseVisHook','__dseFullRenderL','__dseModelFlexObs','__dseCodeblockToggle','__dseBlockOverrides','__dseBlockKey','__dseBlockGet','__dseBlockSet','__origBuildCodeBlockHTML','__origBuildAPIMessages','__origExecuteAPI','__dsePatchPopup','__dseModelHasPeak','__dseMarkPeakPills','__dsePeakTick','__dsePeakState','__dseCurrentMsg'].forEach(k => { try { delete window[k]; } catch(e){ window[k] = undefined; } });
}
if (FIRST){
  cleanup();
  Object.keys(BINDINGS).forEach(k => { try { ORIG[k] = BINDINGS[k].get(); } catch(e){ ORIG[k] = null; } });
  ORIG.fetch = (window.fetch && window.fetch.bind ? window.fetch.bind(window) : window.fetch);
  NS._orig = ORIG;
  NS._v4 = 1;
}

/* ============================ FETCH LAYER ============================ */
const HANDLERS = [];
const fetchInstall = () => {
  const chain = function(input, init){
    const url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
    const opts = init || {};
    if (String(opts.method || (input && input.method) || 'GET').toUpperCase() !== 'POST') return ORIG.fetch.call(this, input, init);
    for (const h of HANDLERS){ const r = h.fn.call(this, input, init, url, opts); if (r) return r; }
    return ORIG.fetch.call(this, input, init);
  };
  window.fetch = chain;
};
const fetchRestore = () => { if (ORIG.fetch) window.fetch = ORIG.fetch; };
const addHandler = (id, fn) => { if (!HANDLERS.some(h => h.id === id)){ HANDLERS.push({ id, fn }); fetchInstall(); } };
const removeHandler = id => { const i = HANDLERS.findIndex(h => h.id === id); if (i >= 0){ HANDLERS.splice(i, 1); fetchInstall(); } };

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
      const handleBlock = block => {
        let data = '';
        (block.split(/\r?\n/) || []).forEach(line => { if (line.indexOf('data:') === 0) data += (data ? '\n' : '') + line.slice(5).replace(/^\s+/, ''); });
        if (!data || data === '[DONE]'){ if (data === '[DONE]') finish(); return; }
        let ev; try { ev = JSON.parse(data); } catch(e){ return; }
        let out; try { out = translate ? translate(ev) : ev; } catch(e){ out = { error:e }; }
        if (!out) return;
        if (out.error){
          if (out.usage){ flushAcc(); enqueue('data: ' + JSON.stringify({ choices:[{ delta:{} }], usage:out.usage }) + '\n\n'); }
          if (!closed){ closed = true; try { controller.error(out.error); } catch(e){} }
          return;
        }
        if (out.finish){ if (out.usage){ flushAcc(); enqueue('data: ' + JSON.stringify({ choices:[{ delta:{} }], usage:out.usage }) + '\n\n'); } finish(); return; }
        const d = (out.choices && out.choices[0] && out.choices[0].delta) || {};
        if (d.content){ acc.content += d.content; scheduleFlush(); }
        if (d.reasoning_content){ acc.reasoning += d.reasoning_content; scheduleFlush(); }
        if (d.tool_calls){ flushAcc(); enqueue('data: ' + JSON.stringify(out) + '\n\n'); }
        if (out.usage){ flushAcc(); enqueue('data: ' + JSON.stringify({ choices:[{ delta:{} }], usage:out.usage }) + '\n\n'); }
      };
      const pump = () => {
        reader.read().then(res => {
          if (closed){ try { reader.cancel(); } catch(e){} return; }
          if (res.done){ finish(); return; }
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
function coalescerHandler(input, init, url, opts){
  if (typeof opts.body !== 'string') return null;
  let payload; try { payload = JSON.parse(opts.body); } catch(e){ return null; }
  if (!(payload && payload.stream && Array.isArray(payload.messages) && /\/chat\/completions(\?|$)/.test(url))) return null;
  NS.stats.passthrough++; updateStats('chat', payload.model, url);
  return ORIG.fetch.call(this, input, init).then(up => up.ok && up.body ? new Response(makeCoalescedStream(up.body, null), { status:200, headers:{'Content-Type':'text/event-stream'} }) : up);
}

/* ============================ ANTHROPIC BRIDGE ============================ */
const ANTHROPIC_ENDPOINT = 'https://api.deepseek.com/anthropic/v1/messages';
const SEARCH_TOOL = { type:'web_search_20250305', name:'web_search' };
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
    tool_uses: blocks.filter(x => x && (x.type === 'tool_use' || x.type === 'server_tool_use')),
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
function openAIStream(answer, model){
  const frames = [], base = { id:'chatcmpl-web-' + Date.now(), object:'chat.completion.chunk', created:Math.floor(Date.now()/1000), model };
  const push = v => frames.push('data: ' + JSON.stringify(v) + '\n\n');
  push(Object.assign({}, base, { choices:[{ index:0, delta:{ role:'assistant' }, finish_reason:null }] }));
  if (answer.reasoning) push(Object.assign({}, base, { choices:[{ index:0, delta:{ reasoning_content:answer.reasoning }, finish_reason:null }] }));
  if (answer.content) push(Object.assign({}, base, { choices:[{ index:0, delta:{ content:answer.content }, finish_reason:null }] }));
  push(Object.assign({}, base, { choices:[{ index:0, delta:{}, finish_reason:answer.stop === 'max_tokens' ? 'length' : 'stop' }], usage:answer.usage }));
  frames.push('data: [DONE]\n\n');
  return new ReadableStream({ start(c){ for (const f of frames) c.enqueue(encodeText(f)); c.close(); } });
}
function anthropicUsageToOpenAI(startUsage, deltaUsage){
  const hit = Number(startUsage && startUsage.cache_read_input_tokens) || 0;
  const creation = Number(startUsage && startUsage.cache_creation_input_tokens) || 0;
  const uncached = Number(startUsage && startUsage.input_tokens) || 0;
  const output = Number(deltaUsage && deltaUsage.output_tokens) || 0;
  const prompt = uncached + hit + creation;
  return { prompt_tokens:prompt, completion_tokens:output, total_tokens:prompt + output,
    prompt_cache_hit_tokens:hit, prompt_cache_miss_tokens:uncached + creation,
    prompt_tokens_details:{ cached_tokens:hit }, input_tokens:prompt, output_tokens:output,
    cache_read_input_tokens:hit, cache_creation_input_tokens:creation };
}
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
function anthropicHandler(input, init, url, opts){
  if (NS.config.mode === 'responses') return null;
  if (!/api\.deepseek\.com\/?(?:v1\/)?chat\/completions(?:\?|$)/i.test(url)) return null;
  if (typeof opts.body !== 'string') return null;
  let original; try { original = JSON.parse(opts.body); } catch(e){ return null; }
  const headers = new Headers(opts.headers || (input && input instanceof Request ? input.headers : undefined));
  const key = (headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key) return null;
  const converted = toAnthropic(original.messages || []);
  const useStream = !!(NS.flags.bridgeStream && original.stream);
  const upstream = { model:original.model, messages:converted.messages, tools:[], stream:useStream,
    max_tokens: original.max_tokens != null ? original.max_tokens : (original.max_completion_tokens != null ? original.max_completion_tokens : 384000) };
  (original.tools || []).forEach(t => { if (t.type === 'function') upstream.tools.push({ name:t.function.name, description:t.function.description || '', input_schema:t.function.parameters || { type:'object', properties:{} } }); });
  if (NS.config.webSearch && !upstream.tools.some(t => t.name === 'web_search')) upstream.tools.push(SEARCH_TOOL);
  if (!upstream.tools.length) delete upstream.tools;
  if (converted.system) upstream.system = converted.system;
  ['temperature','top_p','thinking','reasoning_effort'].forEach(n => { if (original[n] != null) upstream[n] = original[n]; });
  const rInit = { method:'POST', headers:{ 'content-type':'application/json', 'authorization':'Bearer ' + key, 'x-api-key':key, 'anthropic-version':'2023-06-01' }, body:JSON.stringify(upstream), signal:opts.signal };
  return ORIG.fetch(ANTHROPIC_ENDPOINT, rInit).then(resp => {
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
function buildResponsesRequest(chat, plan){
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
  if (NS.config.webSearch && plan.webSearch){ if (NS.config.webSearchStyle === 'tool') req.tool = 'web_search'; else req.tools = [{ type:'web_search' }]; }
  const ft = (chat.tools || []).filter(t => t && t.type === 'function').map(t => ({ type:'function', name:t.function.name, description:t.function.description || '', parameters:t.function.parameters || { type:'object', properties:{} } }));
  if (ft.length) req.tools = (req.tools || []).concat(ft);
  return req;
}
function mapUsage(u){
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
      case 'response.completed': return { finish:true, usage:mapUsage(ev.response && ev.response.usage) };
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
    choices:[{ index:0, message:msg, finish_reason:status }], usage:mapUsage(data.usage) };
}
function responsesHandler(input, init, url, opts){
  if (typeof opts.body !== 'string') return null;
  let payload; try { payload = JSON.parse(opts.body); } catch(e){ return null; }
  const plan = resolvePlan(url, payload);
  if (!plan) return null;
  const rReq = buildResponsesRequest(payload, plan);
  if (!rReq) return null;
  const rUrl = url.replace(/\/chat\/completions(\?|$)/, '') + plan.path;
  const rInit = {};
  for (const k in opts) if (k !== 'body') rInit[k] = opts[k];
  rInit.headers = cloneHeaders(opts.headers); rInit.headers['Content-Type'] = 'application/json'; rInit.body = JSON.stringify(rReq);
  return ORIG.fetch(rUrl, rInit).then(up => {
    NS.stats.transformed++; updateStats('responses', payload.model, rUrl);
    if (!up.ok) return up.text().then(text => { let msg = 'HTTP ' + up.status; try { const j = JSON.parse(text); if (j && j.error && j.error.message) msg += ': ' + j.error.message; } catch(e){} return new Response(JSON.stringify({ error:{ message:msg } }), { status:up.status, headers:{'Content-Type':'application/json'} }); });
    if (payload.stream && up.body) return new Response(makeCoalescedStream(up.body, makeResponsesTranslator()), { status:200, headers:{'Content-Type':'text/event-stream'} });
    return up.json().then(data => {
      if (data.status === 'failed'){ const em = (data.error && data.error.message) || 'Responses request failed.'; return new Response(JSON.stringify({ error:{ message:em } }), { status:400, headers:{'Content-Type':'application/json'} }); }
      return new Response(JSON.stringify(translateFinal(data, plan)), { status:200, headers:{'Content-Type':'application/json'} });
    });
  });
}

/* ============================ PRICING ============================ */
(() => {
  const EP = 1786896000000;
  const TAB = {
    legacy:{ 'deepseek-v4-flash':{ inputCacheHit:2.8e-9, inputCacheMiss:1.4e-7, output:2.8e-7 }, 'deepseek-v4-pro':{ inputCacheHit:3.625e-9, inputCacheMiss:4.35e-7, output:8.7e-7 }, 'deepseek-v4-flash-vision-exp':{ inputCacheHit:2.8e-9, inputCacheMiss:1.4e-7, output:2.8e-7 } },
    off:{ 'deepseek-v4-flash':{ inputCacheHit:7e-9, inputCacheMiss:2.2e-7, output:6.6e-7 }, 'deepseek-v4-pro':{ inputCacheHit:2.2e-8, inputCacheMiss:6.6e-7, output:1.98e-6 }, 'deepseek-v4-flash-vision-exp':{ inputCacheHit:7e-9, inputCacheMiss:2.2e-7, output:6.6e-7 } },
    peak:{ 'deepseek-v4-flash':{ inputCacheHit:1.4e-8, inputCacheMiss:4.4e-7, output:1.32e-6 }, 'deepseek-v4-pro':{ inputCacheHit:4.4e-8, inputCacheMiss:1.32e-6, output:3.96e-6 }, 'deepseek-v4-flash-vision-exp':{ inputCacheHit:1.4e-8, inputCacheMiss:4.4e-7, output:1.32e-6 } },
    windows:{ default:[[1,4],[6,10]], 'deepseek-v4-flash':[[1,4],[6,10]], 'deepseek-v4-pro':[[1,4],[6,10]], 'deepseek-v4-flash-vision-exp':[[1,4],[6,10]] },
    epoch:EP
  };
  const modelWindows = m => (TAB.windows && (TAB.windows[m] || TAB.windows.default)) || [[1,4],[6,10]];
  const isPeak = (d, m) => { const dt = new Date(d), day = dt.getUTCDay(); if (day === 0 || day === 6) return false; const h = dt.getUTCHours(); return modelWindows(m).some(w => h >= w[0] && h < w[1]); };
  const scale = (t, s) => { if (s === 1 || !t) return t; const o = {}; for (const k in t) o[k] = (t[k] || 0) * s; return o; }; const priceAt = (m, d) => { d = d || Date.now(); if (!TAB.legacy[m]) return null; const base = d < EP ? Object.assign({}, TAB.legacy[m]) : Object.assign({}, (isPeak(d, m) ? TAB.peak : TAB.off)[m]); let s = 1; try { const PE2 = window.__pricingEngine; if (PE2 && PE2.effMultAt) s = PE2.effMultAt(d, m); } catch(e){} return s === 1 ? base : scale(base, s); };
  const dyn = m => { const o = {}; Object.defineProperties(o, {
    inputCacheHit:{ get:() => priceAt(m).inputCacheHit, enumerable:true, configurable:true },
    inputCacheMiss:{ get:() => priceAt(m).inputCacheMiss, enumerable:true, configurable:true },
    output:{ get:() => priceAt(m).output, enumerable:true, configurable:true }
  }); return o; };
  const install = () => {
    const t = [];
    const apply = (root, label) => { const fm = root && root.deepseek && root.deepseek.fallbackModels; if (!fm) return; Object.keys(TAB.legacy).forEach(m => { if (fm[m]){ fm[m].pricing = dyn(m); t.push(label + ':' + m); } }); };
    if (typeof providers !== 'undefined') apply(providers, 'providers');
    if (typeof default_providers !== 'undefined') apply(default_providers, 'defaults');
    return t;
  };
  try {
    const p = JSON.parse(localStorage.getItem('dse_providers') || '{}'); p.deepseek = p.deepseek || {}; p.deepseek.fallbackModels = p.deepseek.fallbackModels || {};
    Object.keys(TAB.legacy).forEach(m => { if (!p.deepseek.fallbackModels[m]) p.deepseek.fallbackModels[m] = { maxTokens:384000, contextTokens:1000000, outputTokens:384000, temperature:1, request:{ thinking:{ type:'enabled' }, reasoning_effort:'max' } }; p.deepseek.fallbackModels[m].pricing = TAB.peak[m]; });
    localStorage.setItem('dse_providers', JSON.stringify(p));
  } catch(e){}
  try { localStorage.setItem('dse_pricing_epochs', JSON.stringify(TAB)); } catch(e){}
  const PE = window.__pricingEngine = window.__pricingEngine || {};
  PE.EPOCH = EP; PE.tables = TAB; PE.isPeak = isPeak; PE.windowsFor = modelWindows; PE.priceAt = priceAt; PE.install = install; PE.current = priceAt;
  PE.audit = () => {
    const rows = [], counts = {};
    for (const pid in providers){ const po = providers[pid]; if (!po || pid === 'custom_template') continue; const base = default_providers[pid] || {};
      (modelEntries(po) || []).forEach(x => { const mid = x[0], pricing = (modelDef(po, mid).pricing) || (modelDef(base, mid).pricing) || null; let st;
        if (TAB.legacy[mid]){ const exp = priceAt(mid), eq = (a,b) => Math.abs((a||0) - (b||0)) < 1e-15; st = (pricing && eq(pricing.inputCacheHit, exp.inputCacheHit) && eq(pricing.inputCacheMiss, exp.inputCacheMiss) && eq(pricing.output, exp.output)) ? 'correct' : 'wrong'; }
        else st = 'n_a';
        counts[st] = (counts[st] || 0) + 1;
        rows.push({ provider:pid, model:mid, status:st, stored:pricing ? { hit:pricing.inputCacheHit, miss:pricing.inputCacheMiss, out:pricing.output } : null, expected:TAB.legacy[mid] ? priceAt(mid) : null });
      });
    }
    return { context:{ now:new Date().toISOString(), utcHour:new Date().getUTCHours(), peakNow:isPeak(Date.now()) }, counts, total:rows.length, rows };
  };
  console.log('[pricing] date-aware engine installed: ' + install().join(', '));
})();

/* ============================ TOOLS ============================ */
const evalWorker = (code, timeout, signal) => new Promise(resolve => {
  try {
    if (signal && signal.aborted) return resolve({ ok:0, e:'aborted' });
    const src = 'self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:1,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:0,e:String(err&&err.stack||err)})}}';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type:'text/javascript' })));
    const t = setTimeout(() => { w.terminate(); resolve({ ok:0, e:'timeout' }); }, timeout);
    const abort = () => { clearTimeout(t); w.terminate(); resolve({ ok:0, e:'aborted' }); };
    if (signal) signal.addEventListener('abort', abort);
    w.onmessage = e => { clearTimeout(t); if (signal) signal.removeEventListener('abort', abort); w.terminate(); resolve(e.data); };
    w.onerror = err => { clearTimeout(t); if (signal) signal.removeEventListener('abort', abort); w.terminate(); resolve({ ok:0, e:String(err.message || err) }); };
    w.postMessage(code);
  } catch(e){ resolve({ ok:0, e:String(e) }); }
});
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
    if (worker) return done(await evalWorker(code, timeout, signal));
    return new Promise(resolve => {
      let d2 = false;
      const t = setTimeout(() => { if (!d2){ d2 = true; resolve(done({ ok:0, e:'timeout' })); } }, timeout);
      const abort = () => { if (!d2){ d2 = true; clearTimeout(t); resolve(done({ ok:0, e:'aborted' })); } };
      if (signal) signal.addEventListener('abort', abort);
      const fin = r => { if (d2) return; d2 = true; clearTimeout(t); if (signal) signal.removeEventListener('abort', abort); resolve(done(r)); };
      try { Promise.resolve(eval(code)).then(r => fin({ ok:1, r }), e => fin({ ok:0, e:String(e && e.stack || e) })); } catch(e){ fin({ ok:0, e:String(e && e.stack || e) }); }
    });
  }
};
const TOOL_VERSIONS = NS._toolVersions || (NS._toolVersions = {
  1:{ name:'tool_eval_1', desc:'original schema' },
  2:{ name:'tool_eval_2', desc:'capability-wording schema' },
  3:{ name:'tool_eval_3', desc:'worker-first' },
  4:{ name:'tool_eval_4', desc:'current schema' },
  5:{ name:'tool_eval_5', desc:'mixed-tool nudge schema' },
  6:{ name:'tool_eval_6', desc:'cost-annotated schema (per-round cost in tool result)' },
  7:{ name:'tool_eval_7', desc:'future schema (placeholder)' }
});
NS._toolSchemas = NS._toolSchemas || {};
const validToolSchema = s => { const f = s && s.function, p = f && f.parameters; return !!(p && p.type === 'object' && p.properties && Array.isArray(p.required)); };
const toolNameForVersion = v => { const t = TOOL_VERSIONS[+v]; return (t && t.name) || null; };
const activeToolName = model => {
  const v = NS.config.evalToolVersion;
  if (v === 'off') return null;
  if (v === 'auto') { const m = model || (typeof getCurrentModel === 'function' ? getCurrentModel() : '') || ''; return (NS._lastEvalToolByModel && NS._lastEvalToolByModel[m]) || toolNameForVersion(7); }
  return toolNameForVersion(v);
};
const overrideToolName = () => (NS.config.evalToolNameOverrideOn && NS.config.evalToolNameOverride) ? NS.config.evalToolNameOverride : '';
/* shared schema builder: clones a tool def's schema with a given name */
function toolSchema(name, def){
  const base = window.__tools && window.__tools['tool_eval_1'];
  let s = (def && def.schema) || (base && base.schema);
  if (s && s.function) s = Object.assign({}, s, { function:Object.assign({}, s.function, { name }) });
  return s;
}
function materializeTools(){
  const base = window.__tools && window.__tools['tool_eval_1']; if (!base) return;
  const names = {};
  Object.keys(TOOL_VERSIONS).forEach(id => { names[TOOL_VERSIONS[id].name] = 1; });
  const ov = overrideToolName(); if (ov) names[ov] = 1;
  Object.keys(names).forEach(n => {
    if (window.__tools[n]) return;
    let id = null; Object.keys(TOOL_VERSIONS).forEach(k => { if (TOOL_VERSIONS[k].name === n) id = k; });
    const stored = id != null ? NS._toolSchemas[id] : null;
    window.__tools[n] = { schema: toolSchema(n, { schema: (stored && validToolSchema(stored)) ? stored : base.schema }), run: base.run };
  });
}
NS.registerToolVersion = (id, name, desc) => { TOOL_VERSIONS[id] = { name, desc:desc || '' }; save(); return TOOL_VERSIONS; };
NS.setToolVersionSchema = (id, schema) => { if (validToolSchema(schema)) NS._toolSchemas[id] = clone(schema); return NS._toolSchemas; };
NS._materializeToolAliases = materializeTools;
const execTool = async (tc, signal) => {
  const name = tc.function && tc.function.name, def = window.__tools && window.__tools[name];
  let args = {}; try { args = JSON.parse((tc.function && tc.function.arguments) || '{}'); } catch(e){ args = { parseError:String(e), raw:(tc.function && tc.function.arguments) || '' }; }
  if (!def) return JSON.stringify({ ok:false, error:'unknown tool: ' + name });
  try { const out = await def.run(args, signal); return typeof out === 'string' ? out : JSON.stringify(out); } catch(e){ return JSON.stringify({ ok:false, error:String(e && e.stack || e) }); }
};
function addCumulativeUsage(acc, curr){
  if (!acc) return JSON.parse(JSON.stringify(curr || {}));
  if (!curr) return acc;
  const out = Object.assign({}, acc);
  ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens','cache_creation_input_tokens','cache_read_input_tokens','input_tokens','output_tokens'].forEach(k => { if (curr[k]) out[k] = (out[k] || 0) + curr[k]; });
  if (curr.prompt_tokens_details) out.prompt_tokens_details = Object.assign({}, (out.prompt_tokens_details || {}), { cached_tokens:((out.prompt_tokens_details && out.prompt_tokens_details.cached_tokens) || 0) + ((curr.prompt_tokens_details.cached_tokens) || 0) });
  return out;
}
const hasToolsAtMessage = v => {
  if (!v) return false;
  if (v.tool_calls && v.tool_calls.length) return true;
  if (Array.isArray(v._toolEvents)) return v._toolEvents.some(m => (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) || m.role === 'tool');
  return false;
};
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
function agenticMake(next){
  /* resolve the tool schema list to attach */
  function resolveTools(r){
    if (Array.isArray(r.request && r.request.tools)) return r.request.tools;
    if (typeof (r.request && r.request.tools) === 'string') return r.request.tools.split(/[,\s]+/).filter(Boolean).map(n => window.__tools[n] && window.__tools[n].schema).filter(Boolean);
    if (!(r.request && ('tools' in r.request)) && NS.flags.tools){
      const seen = {}, list = [];
      const push = name => {
        const d = window.__tools[name];
        if (!d || seen[name]) return;
        seen[name] = 1;
        list.push(toolSchema(name, d));
      };
      seedFromView();
      const am = NS.config.agenticTools || 'on';
      if (am === 'off') return [];
      const prior = (am === 'auto' && r && r.m && NS._lastToolsOnByModel) ? NS._lastToolsOnByModel[r.m] : null;
      let tn = overrideToolName();
      if (prior && prior.length){
        prior.forEach(n => { const d = window.__tools[n]; if (d) push(n); });
        tn = tn || prior.find(x => /^tool_eval/.test(x)) || null;
        NS.config.webSearch = prior.includes('web_search');
      } else {
        tn = tn || activeToolName(r.m);
      }
      if (tn){ push(tn); NS._lastEvalTool = tn; if (r && r.m){ NS._lastEvalToolByModel[r.m] = tn; NS._lastToolsOnByModel[r.m] = [tn].concat(NS.config.autoTools || []); } }
      (NS.config.autoTools || []).forEach(push);
      Object.keys(window.__tools || {}).forEach(n => { const t = window.__tools[n]; if (t && t.auto && n !== tn) push(n); });
      return list;
    }
    return [];
  }
  /* normalize tool calls: guarantee object + name */
  function normalizeCalls(calls){
    return (calls || []).map(tc => { if (!tc || typeof tc !== 'object') tc = {}; tc.function = tc.function || {}; if (!tc.function.name) tc.function.name = activeToolName() || 'tool'; return tc; });
  }
  return async function(messages, node, vIndex, controller, r){
    r = r || run();
    window.__sc0 = NS.stats.searchCalls;
    window.__dseCurrentMsg = node && node.id || null;
    try {
      const p = r.p, key = getApiKey(p.id), isStream = settings.streaming, modelId = r.m;
      const tools = resolveTools(r);
      const payload = Object.assign({}, r.request, { model:modelId, temperature:r.supportsTemperature === false ? void 0 : (r.temperature != null ? r.temperature : .7), stream:isStream });
      if (tools.length){ payload.tools = tools; if (!payload.tool_choice) payload.tool_choice = 'auto'; }
      try { const _md = node.versions[vIndex].metadata = node.versions[vIndex].metadata || {}; _md.tools = {}; (payload.tools || []).forEach(_t => { const _n = _t.function && _t.function.name; if (_n) _md.tools[_n] = 0; }); if (NS.config.webSearch && _md.tools.web_search == null) _md.tools.web_search = 0; } catch(e){}
      payload[p.maxTokensParam || 'max_tokens'] = r.maxTokens;
      if (isStream && p.supportsStreamUsage) payload.stream_options = { include_usage:true };
      node.versions[vIndex].startTime = Date.now();

      const toolEvents = [], maxTurns = NS.config.toolMaxTurns == null ? 100 : NS.config.toolMaxTurns;
      const turnsOn = NS.config.toolMaxTurnsOn !== false;
      let uiContent = '', llmContent = '', uiThinking = '', cumulativeUsage = null, cumulativeExactCost = 0, msgSearchCount = 0;
      const toolCostOn = NS.config.toolCostNote !== false;
      const costTotal = () => { try { const c = node.versions[vIndex].metadata && node.versions[vIndex].metadata.cost && node.versions[vIndex].metadata.cost.calculated && node.versions[vIndex].metadata.cost.calculated.total; const v = qv(c); return Number.isFinite(v) ? v : 0; } catch(e){ return 0; } };
      /* per-message call-id state: label + t<seq> + e<epoch> + _ + tool */
      const label = (String(node && node.id || '').split('(')[0] || 'call');
      let callSeq = 0; const epoch = Math.floor(Math.random() * 1e8);
      const genCallId = name => label + 't' + (++callSeq) + 'e' + epoch + '_' + name;

      const applyUsage = envelope => {
        const costBad = {};
        let next = r.usagePath === false ? envelope : r.usagePath ? at(envelope, r.usagePath) : (envelope && (envelope.usage ?? envelope.usageMetadata ?? (envelope.message && envelope.message.usage)));
        const rc = usageValue(envelope, r.usageCost, costBad);
        if (!costBad.value && rc !== undefined) cumulativeExactCost = (cumulativeExactCost || 0) + rc;
        if (next && typeof next === 'object') cumulativeUsage = addCumulativeUsage(cumulativeUsage, next);
        if (cumulativeUsage || cumulativeExactCost > 0) applyResponseMetadata(node.versions[vIndex], cumulativeUsage || {}, r, cumulativeExactCost || undefined);
      };

      for (let turn = 0; !turnsOn || turn < maxTurns; turn++){
        if (controller.signal.aborted) break;
        const reqMessages = messages.concat(toolEvents);
        if (llmContent) reqMessages.push({ role:'assistant', content:llmContent });
        const costBeforeTurn = costTotal();
                if (NS.config.evalInProviders && p.eval) { try { eval(p.eval); } catch(e){ warn('[eval:' + p.id + '] ' + e.message); } }
const res = await fetch(p.baseURL + p.apiPath, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':(p.authHeader ? p.authHeader + ' ' : '') + key }, body:JSON.stringify(Object.assign({}, payload, { messages:reqMessages })), signal:controller.signal });
        if (!res.ok){ const body = (await res.text()).trim(); throw Error('HTTP ' + res.status + ' ' + body); }

        let toolCalls = null, turnC = '', turnT = '';
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
                    const h = buildThinkingSection(v.thinking, node.id, true) + formatMarkdown(v.rawContent);
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

        uiContent += turnC; uiThinking += turnT; llmContent += turnC;
        const roundCostNum = (() => { const a = costBeforeTurn, b = costTotal(); const d = b - a; return (d > 0 && Number.isFinite(d)) ? d : null; })(); const roundCost = roundCostNum != null ? cs(roundCostNum) : null;
        if (toolCalls && toolCalls.length){
          if (controller.signal.aborted) break;
          toolCalls = normalizeCalls(toolCalls);
          toolCalls.forEach(tc => { if (!tc.id) tc.id = genCallId(tc.function.name || activeToolName()); });
          toolEvents.push({ role:'assistant', content:turnC || null, reasoning_content:turnT || null, tool_calls:toolCalls });
          llmContent = '';
          if (toolCalls.some(tc => tc.function && /web_search/i.test(tc.function.name))) toolCalls.forEach(tc => { if (tc.function && /web_search/i.test(tc.function.name)) msgSearchCount++; });
          const nCalls = toolCalls.length;
          const costParam = (toolCostOn && roundCostNum != null) ? { cost_of_this_tool_round_thinking_included: cs(roundCostNum) + (nCalls > 1 ? ('÷' + nCalls) : '') + ((() => { try { const m = typeof getCurrentModel === 'function' ? getCurrentModel() : ''; const PE = window.__pricingEngine; if (Date.now() < PE.EPOCH) return '';
          const discArr = (PE && PE.effFactorsAt ? PE.effFactorsAt(Date.now(), m) : []).map(f => f === 0 ? 'discounted by ÷FREE off-peak' : 'discounted by ÷' + String(Number((1/f).toFixed(6))) + ' off-peak'); const off = PE.tables && PE.tables.off && PE.tables.off[m]; const pk = PE.tables && PE.tables.peak && PE.tables.peak[m]; if (PE.isPeak(Date.now(), m) && pk && off && off.output) { const u = cumulativeUsage || {}; const hit = u.prompt_cache_hit_tokens ?? u.cache_read_input_tokens ?? 0, miss = u.prompt_cache_miss_tokens ?? u.input_tokens ?? u.prompt_tokens ?? 0, outN = u.completion_tokens ?? u.output_tokens ?? 0; const calc = t => (hit||0)*t.inputCacheHit + (miss||0)*t.inputCacheMiss + (outN||0)*t.output; const pc = calc(pk), oc = calc(off); if (oc > 0 && pc > 0) { const ratio = pc / oc; const nice = Math.abs(ratio - Math.round(ratio)) < 0.05; return ' (' + ['peak by ' + (nice ? Math.round(ratio) + 'x' : ratio.toFixed(2) + 'x') + ' off-peak'].concat(discArr).join(' and ') + ')'; } } return discArr.length ? ' (' + discArr.join(' and ') + ')' : ''; } catch(e){ return ''; } })()) } : null;
          const results = await Promise.all(toolCalls.map(async tc => ({ tc, resStr:await execTool(tc, controller.signal) })));
          results.forEach(({ tc, resStr }) => {
            let toolContent = resStr;
            if (costParam){
              let p; try { p = JSON.parse(resStr); } catch(e){ p = null; }
              if (p && typeof p === 'object' && !Array.isArray(p)){
                const __k = 'cost_of_this_tool_round_thinking_included', __v = costParam.cost_of_this_tool_round_thinking_included, __o = {}; let __i = false;
                for (const __kk in p){ __o[__kk] = p[__kk]; if (__kk === 'ms'){ __o[__k] = __v; __i = true; } }
                if (!__i) __o[__k] = __v;
                toolContent = JSON.stringify(__o, null, 2);
              } else {
                toolContent = JSON.stringify(Object.assign({ result: p !== null ? p : resStr }, costParam), null, 2);
              }
            }
            uiContent += '\n\n```javascript\n// Executing: ' + (tc.function && tc.function.name) + '\n' + (tc.function && tc.function.arguments) + '\n```\n';
            try { const _mt = node.versions[vIndex].metadata && node.versions[vIndex].metadata.tools; const _n = tc.function && tc.function.name; if (_mt && _n && _mt[_n] != null) _mt[_n]++; } catch(e){}
            toolEvents.push({ role:'tool', tool_call_id:tc.id, content:toolContent });
            uiContent += '\n```json\n// Result\n' + toolContent + '\n```\n\n';
            node.versions[vIndex].rawContent = uiContent;
            if (node.activeVersion === vIndex) updateNodeDOM(node);
          });
          try { node.versions[vIndex].toolBatch = { requested:toolCalls.length, executed:results.length, names:results.map(r => (r.tc.function && r.tc.function.name) || '?') }; } catch(e){}
          if (controller.signal.aborted) break;
          continue;
        }
        break;
      }

      node.versions[vIndex].rawContent = uiContent;
      node.versions[vIndex].llmContent = llmContent;
      node.versions[vIndex].thinking = uiThinking;
      if (msgSearchCount) node.versions[vIndex].searches = msgSearchCount;
      if (toolEvents.length) node.versions[vIndex]._toolEvents = toolEvents;
      await saveStreamBuffer(node, vIndex);
      node.versions[vIndex].endTime = node.lastUpdateTime || Date.now();
      try { const _md = node.versions[vIndex].metadata; const _d = NS.stats.searchCalls - (window.__sc0 || 0); if (_md && _md.tools && _md.tools.web_search != null && _d > 0) _md.tools.web_search += _d; } catch(e){}
      finalizeGeneration(node, vIndex, controller);
    } finally { window.__dseCurrentMsg = null; }
  };
}

/* ============================ MARKED ============================ */
const MARKED_CSS = '.bubble table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.85rem;overflow-x:auto;display:block}.bubble th,.bubble td{border:1px solid var(--border);padding:8px 12px;text-align:left}.bubble th{background:rgba(0,0,0,.3);font-weight:bold;color:var(--accent)}.bubble tbody tr:nth-child(even){background:rgba(0,0,0,.15)}';
function injectMarkedCss(){ if (NS.markedCss) return; const s = document.createElement('style'); s.id = 'dse-marked-css'; s.textContent = MARKED_CSS; document.head.appendChild(s); NS.markedCss = true; }
function renderMarked(raw){
  const lib = window.marked;
  if (!lib || !raw) return ORIG.markdown ? ORIG.markdown(raw) : String(raw || '');
  try {
    const renderer = { code:token => { const text = (token && token.text != null) ? token.text : String(token || ''); const lang = (token && token.lang) || 'plain'; return buildCodeBlockHTML(lang, text + '\n', !!(settings.blockAutoCollapse && text.length > settings.blockCollapseSize)); } };
    if (typeof lib.Marked === 'function') return new lib.Marked({ gfm:true, breaks:true, renderer }).parse(String(raw));
    if (typeof lib.parse === 'function'){ const r = new lib.Renderer(); r.code = renderer.code; return lib.parse(String(raw), { renderer:r, breaks:true, gfm:true }); }
  } catch(e){ warn('marked render failed: ' + e.message); }
  return ORIG.markdown ? ORIG.markdown(raw) : String(raw || '');
}
function markedMake(next){ return function(raw){ ORIG.markdown = ORIG.markdown || next; return renderMarked(raw); }; }
function loadMarked(){
  if (NS.markedReady) return Promise.resolve(true);
  if (NS.markedLoading) return NS.markedLoading;
  if (window.marked && (window.marked.parse || window.marked.Marked)){ NS.markedReady = true; return Promise.resolve(true); }
  NS.markedLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = NS.config.markedSrc; s.crossOrigin = 'anonymous';
    s.onload = () => { s.remove(); if (window.marked && (window.marked.parse || window.marked.Marked)) resolve(true); else reject(Error('marked unusable')); };
    s.onerror = () => { s.remove(); reject(Error('marked blocked')); };
    document.head.appendChild(s);
  }).then(ok => { NS.markedReady = ok; NS.markedLoading = null; injectMarkedCss(); try { renderFullChat(); } catch(e){} return ok; }).catch(e => { NS.markedLoading = null; warn(e.message); return false; });
  return NS.markedLoading;
}

/* ============================ UI ============================ */
const updateStats = (mode, model, url) => { NS.stats.last = { mode, model, url, ts:Date.now() }; };
function removeStatusPill(){ const el = document.getElementById('eval1Pill'); if (el) el.remove(); }
function ensureStatusPill(){
  let el = document.getElementById('eval1Pill');
  if (el) return el;
  el = document.createElement('span');
  el.id = 'eval1Pill';
  el.style.cssText = 'font-size:.68rem;padding:2px 8px;border-radius:6px;background:var(--border);color:var(--text-secondary);font-family:monospace;white-space:nowrap;cursor:help;';
  el.title = 'eval1 — click to cycle API mode';
  el.addEventListener('click', () => { NS.config.mode = NS.config.mode === 'responses' ? 'chat' : (NS.config.mode === 'chat' ? 'auto' : 'responses'); save(); updateStatus(); });
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

/* code-block UX: collapse memory + tool-echo collapse + tool font */
const blockOverrides = {}, blockOrder = [];
const blockKey = (m, l, c) => (m ? m + '::' : '') + (l || '') + '::' + String(c || '').slice(0, 80);
function codeblockMake(next){
  return function(lang, c, collapsed){
    const cnt = String(c || ''), key = blockKey(window.__dseCurrentMsg || null, lang, cnt), ov = blockOverrides[key];
    let eff = collapsed;
    if (ov === 'open') eff = false; else if (ov === 'close') eff = true;
    else if (NS.config.toolEchoCollapseChars != null && cnt.indexOf('// Executing:') === 0 && cnt.length > NS.config.toolEchoCollapseChars) eff = true;
    let html = next.call(this, lang, cnt, eff);
    if ((cnt.indexOf('// Executing:') === 0 || cnt.indexOf('// Result') === 0) && NS.config.toolFontScale){
      const prod = (typeof settings !== 'undefined' && settings.fontScale || 0.5) * NS.config.toolFontScale;
      html = html.replace('<div class="code-block">', '<div class="code-block" style="--block-font-scale:' + prod + '">');
    }
    return html;
  };
}
if (!window.__eval1_clickBound){
  window.__eval1_clickBound = true;
  document.addEventListener('click', e => {
    const hf = e.target.closest && e.target.closest('.code-header, .code-footer'); if (!hf) return;
    if (e.target.closest('button') || e.target.closest('.block-arrow')) return;
    const bl = hf.closest('.code-block'), bd = bl && bl.querySelector('.code-body'); if (!bd) return;
    const ic = bd.classList.toggle('collapsed');
    bl.querySelectorAll('.down,.up').forEach(el => el.classList.toggle('collapsed', ic));
    const msg = hf.closest('.message'), mid = msg ? msg.dataset.msgId : (window.__dseCurrentMsg || null);
    const code = bl.querySelector('code'), pre = bl.querySelector('pre');
    blockOverrides[blockKey(mid, pre ? pre.dataset.lang : '', code ? code.textContent : '')] = ic ? 'close' : 'open';
    if (blockOrder.length > 400) delete blockOverrides[blockOrder.shift()];
    e.preventDefault();
  }, true);
}

/* peak display: timer anchored under header (defPos), red cost pills */
function computePeak(){
  const PE = window.__pricingEngine, mid = typeof getCurrentModel === 'function' ? getCurrentModel() : '';
  const nowMs = Date.now();
  const peak = PE && PE.isPeak ? PE.isPeak(nowMs, mid) : false;
  let mult = 1; try { if (PE && PE.effMultAt) mult = PE.effMultAt(nowMs, mid); } catch(e){}
  let mh = false; try { if (PE && PE.tables) mh = !!(PE.tables.legacy && PE.tables.legacy[mid]) || !!(PE.tables.off && PE.tables.off[mid]) || !!(PE.tables.peak && PE.tables.peak[mid]); } catch(e){}
  const b = new Date(nowMs); b.setUTCSeconds(0,0); b.setUTCMinutes(0,0); b.setUTCHours(b.getUTCHours()+1);
  let next = null;
  const isP = t => { try { return PE && PE.isPeak ? PE.isPeak(t, mid) : false; } catch(e){ return false; } };
  for (let i = 0; i <= 168 && !next; i++){ const t = b.getTime() + i*36e5; if (isP(t) !== peak) next = new Date(t); }
  if (!next){ const t = new Date(b); t.setUTCDate(t.getUTCDate() + 1); t.setUTCHours(0, 0, 0, 0); next = t; }
  window.__dsePeakState = { peak, discount: mult < 1, free: mult === 0, modelHasPeak:mh, at:nowMs, boundaryAt:next.getTime() };
}
function defPos(){
  const te = document.getElementById('dse-peak-timer'); if (!te) return;
  const h = document.querySelector('.header h1');
  if (h){ const r = h.getBoundingClientRect(); te.style.left = (r.left - 5) + 'px'; te.style.top = (r.bottom + 2) + 'px'; return; }
  const c = document.getElementById('chatContainer');
  if (c){ const cr = c.getBoundingClientRect(); te.style.left = (cr.left + 16) + 'px'; te.style.top = (cr.top + 16) + 'px'; }
}
let peakTimerEl = null;
function ensurePeakTimer(){
  if (peakTimerEl) return peakTimerEl;
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
window.__dsePeakTick = () => {
  let s = window.__dsePeakState;
  if (!s || !Number.isFinite(s.boundaryAt)){ computePeak(); s = window.__dsePeakState; }
  const ms = s.boundaryAt - Date.now();
  if (ms <= 0){ computePeak(); applyPeakDisplay(); return; }
  const m = NS.config.peakCounter || 'off', show = m !== 'off' && (m === 'next' || s.peak || s.discount || s.free) && (s.modelHasPeak || s.discount || s.free);
  if (show){
    const ss = Math.ceil(ms / 1000), hh = Math.floor(ss / 3600), mi = Math.floor((ss % 3600) / 60), sc = ss % 60;
    const el = ensurePeakTimer();
    el.textContent = ('0' + hh).slice(-2) + ':' + ('0' + mi).slice(-2) + ':' + ('0' + sc).slice(-2);
    el.style.display = 'block'; el.style.color = s.peak ? 'var(--danger)' : (s.discount || s.free) ? 'var(--success)' : '#e8e8e8';
  } else if (peakTimerEl) peakTimerEl.style.display = 'none';
};
function peakCounterStart(){ if (window.__dseCounterTick) return; computePeak(); applyPeakDisplay(); window.__dseCounterTick = setInterval(window.__dsePeakTick, 1000); }
function peakCounterStop(){ if (window.__dseCounterTick){ clearInterval(window.__dseCounterTick); window.__dseCounterTick = 0; } }
function applyPeakDisplay(){
  const s = window.__dsePeakState || computePeak();
  document.body.classList.toggle('dse-peak', !!(s.peak && s.modelHasPeak)); document.body.classList.toggle('dse-discount', !!(s.discount)); document.body.classList.toggle('dse-free', !!(s.free));
  if (window.__dsePeakTick) window.__dsePeakTick();
}
function peakRenderMake(next){ return function(){ const r = next.apply(this, arguments); applyPeakDisplay(); return r; }; }
const peakCostMake = next => function(version, raw, config, reportedExact){
  const r = next.apply(this, arguments);
  try { const PE = window.__pricingEngine, m = config && config.m, peak = PE && PE.isPeak ? PE.isPeak(new Date(), m) : false; version.metadata = version.metadata || {}; version.metadata.peakCost = !!(peak && __dseModelHasPeak(m)); const mult = (PE && PE.effMultAt ? PE.effMultAt(Date.now(), m) : 1); version.metadata.pricing = { mult: mult, factors: (PE && PE.effFactorsAt ? PE.effFactorsAt(Date.now(), m) : []), ts: Date.now() }; } catch(e){}
  return r;
};
const __dseModelHasPeak = modelId => { try { const PE = window.__pricingEngine; if (!PE || !PE.tables || !modelId) return false; return !!(PE.tables.legacy && PE.tables.legacy[modelId]) || !!(PE.tables.off && PE.tables.off[modelId]) || !!(PE.tables.peak && PE.tables.peak[modelId]); } catch(e){ return false; } };
window.__dseModelHasPeak = __dseModelHasPeak;
if (typeof MutationObserver !== 'undefined' && !window.__eval1_peakObs){
  window.__eval1_peakObs = true;
  new MutationObserver(() => { applyPeakDisplay(); }).observe(document.getElementById('chatContainer') || document.body, { childList:true, subtree:true });
  const ms = document.getElementById('modelSelect'); if (ms) ms.addEventListener('change', () => { computePeak(); applyPeakDisplay(); });
}

/* Exp tab */
const EXP_INFO = {
  'About':'eval1 v4.8.0 — experimental controls. Persists via dse_eval1_config.',
  'API mode':'auto per-model routing · chat force chat · responses profiled models → /responses.',
  'Peak counter':'off / only till end peak / till next state — countdown to DeepSeek peak-pricing boundary.',
  'Web search':'Attach the server web_search tool where supported.',
  'Show 🔎 trace':'Print [web_search] query into thinking block + header count.',
  'Agentic tools':'Attach the active tool (tool_eval_5) so the model can run JS.',
  'Tool block collapse':'Auto-collapse tool-echo code blocks over [amount] chars.',
  'Thinking history':'all / only when tools / off — whether reasoning is sent back to the API.',
  'Paint interval (ms)':'Delta-coalescer cadence for streaming UI updates.',
  'Status pill':'Header indicator; click cycles auto→chat→responses.',
  'Marked tables':'marked.js GFM renderer. Raw HTML NOT sanitized.',
  'Anthropic bridge':'DeepSeek chat → /anthropic/v1/messages with web_search_20250305.',
  'Streaming bridge':'Stream DeepSeek chat via anthropic SSE translation.',
  'Responses hybrid':'Chat → /responses for profiled models (deepseek-v4-*, gpt-5.6-*).',
  'Routing':'Where the next request goes given mode + toggles.',
  'routing algorithm':'Where the next request goes given mode + toggles.',
  'Eval tool version':'Which tool_eval schema is attached.\n 1 = original schema \n 2 = capability-wording schema \n 3 = worker-first \n 4 = current schema \n 5 = mixed-tool nudge schema \n 6 = cost-annotated (per-round cost in tool result) \n 7 = future placeholder \n Schemas 1-5 are the 52-55.js era; 6 is the 56.js schema. "auto" = per-model last-used (seeded from visible branch, fallback 7); "off" = disabled.',
  'Name override (cache mask)':'Rename the attached eval tool (cache-mask: avoids repeated identical tool schemas colliding as cache keys).',
  'Tool limit per message':'Max tool-call rounds the agentic loop may run for a single message.',
  'Tool font scale':'Font scale for tool-echo code blocks (compounds with the global code font scale).',
  'Tool round cost in its results':'Appends cost_of_this_tool_round_thinking_included to each tool result — cost of the LLM round that issued the call(s), thinking included. Shown right under "ms" in the JSON; "÷N" when N tools run in parallel (input read once, cost shared). Toggle off to send raw tool results.'
};
function popupHTML(text, title){
  const old = document.getElementById('expPopupWrap'); if (old) old.remove();
  const w = document.createElement('div'); w.id = 'expPopupWrap'; w.className = 'exp-popup-wrap';
  w.innerHTML = '<div class="exp-popup-backdrop"></div><div class="exp-popup"><div class="exp-popup-head"><span>' + esc(title) + '</span><button class="exp-popup-x" data-expx="1">×</button></div><div class="exp-popup-body">' + text + '</div><div class="exp-popup-foot"><button class="exp-popup-close" data-expx="1">Close</button></div></div>';
  document.body.appendChild(w);
  w.addEventListener('click', e => { if (e.target.closest('[data-expx]')){ w.remove(); return; } if (!e.target.closest('.exp-popup')) w.remove(); });
}
function infoBtn(label){
  const t = EXP_INFO[label] || label, tool = activeToolName();
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'exp-info'; btn.title = label; btn.textContent = 'ⓘ';
  btn.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); popupHTML(String(t).split('TOOL').join(tool), label); });
  return btn;
}
function removeExpTab(){
  const b = document.querySelector('.tab-btn[data-tab="exp"]'); if (b) b.remove();
  const c = document.getElementById('tab-exp'); if (c) c.remove();
  const w = document.getElementById('expPopupWrap'); if (w) w.remove();
}
function buildExpTab(){
  removeExpTab();
  const swarmBtn = document.querySelector('.tab-btn[data-tab="swarm"]'), swarmTab = document.getElementById('tab-swarm');
  if (!swarmBtn || !swarmTab) return;
  swarmBtn.insertAdjacentHTML('afterend', '<button class="tab-btn" data-tab="exp">Exp</button>');
  const C = NS.config, F = NS.flags;
  const row = (label, ctrl) => '<div class="setting-row"><span>' + esc(label) + '</span>' + ctrl + '</div>';
  const tg = (id, on) => '<label class="toggle"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span class="slider"></span></label>';
  const sel = (id, opts, val) => '<select id="' + id + '">' + opts.map(o => '<option value="' + o.value + '"' + (o.value === val ? ' selected' : '') + '>' + o.label + '</option>').join('') + '</select>';
  const html = '<div class="tab-content" id="tab-exp">'
  + '<div class="tabs exp-tabs">'
  + '<button class="tab-btn active" data-exp-sub="general">General</button>'
  + '<button class="tab-btn" data-exp-sub="tools">Tools</button>'
  + '</div>'
  + '<div class="tab-content active" id="exp-sub-general">'
  + row('API mode', sel('expMode', [{value:'auto',label:'auto'},{value:'chat',label:'chat'},{value:'responses',label:'responses'}], C.mode))
  + row('Peak counter', sel('expPeakCounter', [{value:'off',label:'off'},{value:'end',label:'till end'},{value:'next',label:'till next'}], C.peakCounter || 'off'))
  + row('Thinking history', sel('expThinkingHistory', [{value:'all',label:'all'},{value:'tools',label:'tools'},{value:'off',label:'off'}], C.thinkingHistory || 'all'))
  + row('Status pill', tg('expPill', !!F.pill))
  + row('Anthropic bridge', tg('expAnthropic', !!F.anthropic))
  + row('Streaming bridge', tg('expBridgeStream', !!F.bridgeStream))
  + row('Responses hybrid', tg('expHybrid', !!F.hybrid))
  + row('Marked tables', tg('expMarked', !!F.marked))
  + row('Paint interval (ms)', '<input type="number" id="expPaint" min="40" step="10" value="' + C.paintIntervalMs + '" style="width:75px">')
  + row('routing algorithm', '<span id="expRoute" style="display:none"></span><button type="button" id="expRouteBtn" class="btn-outline" style="margin-left:auto">details ⓘ</button>')
  + row('About', '<span style="font-size:.68rem;color:var(--text-secondary)">v' + VERSION + '</span>')
  + '</div>'
  + '<div class="tab-content" id="exp-sub-tools">'
  + row('Agentic tools', tg('expTools', !!F.tools))
  + row('Eval tool version', '<select id="expEvalToolVersion"></select>')
  + row('Name override (cache mask)', '<span style="display:inline-flex;align-items:center;gap:6px">' + '<input type="text" id="expEvalToolNameOverride" placeholder="tool_eval_1" value="' + (C.evalToolNameOverride || 'tool_eval_1') + '" style="width:90px;box-sizing:content-box;min-width:90px;padding:4px 8px">' + tg('expEvalToolNameOverrideOn', C.evalToolNameOverrideOn) + '</span>')
  + row('Tool limit per message', '<span style="display:inline-flex;align-items:center;gap:6px"><input type="number" id="expToolMaxTurns" min="1" step="1" value="' + (C.toolMaxTurns || 100) + '" style="">' + tg('expToolMaxTurnsOn', C.toolMaxTurnsOn !== false) + '</span>')
  + row('Tool round cost in its results', tg('expToolCost', C.toolCostNote !== false))
  + row('Web search', tg('expWebSearch', C.webSearch))
  + row('Show 🔎 trace', tg('expShowTrace', C.showSearchTrace))
  + row('Tool block collapse', '<span style="display:inline-flex;align-items:center;gap:6px"><input type="number" id="expToolEchoCollapse" min="0" step="100" value="' + (C.toolEchoCollapseChars || 2000) + '" style=""' + ((C.toolEchoCollapseChars || 0) > 0 ? '' : ' disabled') + '>' + tg('expToolEchoCollapseOn', (C.toolEchoCollapseChars || 0) > 0) + '</span>')
  + row('Tool font scale', '<input type="number" id="expToolFontScale" min="0.01" max="2" step="0.05" value="' + (C.toolFontScale || 0.7) + '" style="">')
  + '</div>'
  + '</div>';
  swarmTab.insertAdjacentHTML('afterend', html);
  const btn = document.querySelector('.tab-btn[data-tab="exp"]'); if (btn) btn._ = document.getElementById('tab-exp');
  document.querySelectorAll('#tab-exp .exp-tabs > .tab-btn').forEach(b => { b._ = document.getElementById('exp-sub-' + b.dataset.expSub); });
  const routeBtn = document.getElementById('expRouteBtn'); if (routeBtn) routeBtn.addEventListener('click', () => { const rt = (document.getElementById('expRoute') || {}).textContent || 'n/a'; popupHTML('Routing algorithm:\n' + rt, 'Routing'); });
  document.getElementById('tab-exp').querySelectorAll('.setting-row').forEach(r => { const span = r.querySelector('span:first-child'); if (span) span.appendChild(infoBtn(span.textContent.trim())); });
  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  on('expMode', 'change', e => NS.setMode(e.target.value));
  on('expPeakCounter', 'change', e => NS.setPeakCounter(e.target.value));
  on('expWebSearch', 'change', e => NS.setWebSearch(e.target.checked));
  on('expShowTrace', 'change', e => NS.setShowSearchTrace(e.target.checked));
  on('expTools', 'change', e => NS.setFlag('tools', e.target.checked ? 1 : 0));
  on('expToolCost', 'change', e => NS.set('toolCostNote', e.target.checked));
  on('expPaint', 'change', e => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 40) NS.setPaintInterval(v); });
  on('expToolFontScale', 'change', e => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) NS.setToolFontScale(v); });
  on('expToolMaxTurns', 'change', e => { const v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v >= 1) NS.setToolMaxTurns(v); });
  on('expToolMaxTurnsOn', 'change', e => NS.setToolMaxTurnsOn(e.target.checked));
  on('expEvalToolVersion', 'change', e => NS.setEvalToolVersion(e.target.value));
  on('expEvalToolNameOverride', 'change', e => NS.setEvalToolNameOverride(e.target.value));
  on('expEvalToolNameOverrideOn', 'change', e => NS.setEvalToolNameOverrideOn(e.target.checked));
  on('expPill', 'change', e => NS.setFlag('pill', e.target.checked ? 1 : 0));
  on('expMarked', 'change', e => NS.setFlag('marked', e.target.checked ? 1 : 0));
  on('expAnthropic', 'change', e => NS.setFlag('anthropic', e.target.checked ? 1 : 0));
  on('expBridgeStream', 'change', e => NS.setFlag('bridgeStream', e.target.checked ? 1 : 0));
  on('expHybrid', 'change', e => NS.setFlag('hybrid', e.target.checked ? 1 : 0));
  on('expThinkingHistory', 'change', e => NS.setThinkingHistory(e.target.value));
  on('expToolEchoCollapseOn', 'change', e => { NS.setToolEchoCollapse(e.target.checked ? 2000 : 0); const n = document.getElementById('expToolEchoCollapse'); if (n) n.disabled = !e.target.checked; });
  on('expToolEchoCollapse', 'change', e => { if (document.getElementById('expToolEchoCollapseOn').checked) NS.setToolEchoCollapse(parseInt(e.target.value, 10) || 2000); });
  const selEl = document.getElementById('expEvalToolVersion');
  if (selEl){ selEl.innerHTML = ''; const add = (val, label) => selEl.appendChild(new Option(label, val)); const grp = lab => { const g = document.createElement('optgroup'); g.label = lab; selEl.appendChild(g); return g; }; add('off', 'off'); add('auto', 'auto (last used)'); let g = grp('52-55.js'); [1,2,3,4,5].forEach(id => g.appendChild(new Option('tool_eval_' + id, String(id)))); g = grp('56.js'); g.appendChild(new Option('tool_eval_6 (cost-annotated)', '6')); g = grp('future'); g.appendChild(new Option('tool_eval_7 (placeholder)', '7')); selEl.value = NS.config.evalToolVersion || 'auto'; }
  updateExpRoute();
}
function fitRoute(){ const el = document.getElementById('expRoute'); if (!el || !el.textContent) return; const base = 10.88; const min = base * 0.7; el.style.fontSize = base + 'px'; let fs = base; let guard = 0; while (el.scrollWidth > el.clientWidth + 1 && fs > min && guard++ < 40){ fs -= 0.5; el.style.fontSize = fs + 'px'; } if (el.scrollWidth > el.clientWidth + 1){ el.style.textOverflow = 'ellipsis'; } else { el.style.textOverflow = 'clip'; } }
function updateExpRoute(){
  const route = document.getElementById('expRoute'); if (!route) return;
  const m = NS.config.mode, parts = [];
  if (m === 'responses') parts.push('deepseek + gpt-5.6 → /responses');
  else if (m === 'chat') parts.push('all → chat (deepseek → anthropic bridge)');
  else parts.push('deepseek → anthropic bridge · openai profiled → /responses · others → chat');
  if (!NS.flags.anthropic) parts.push('anthropic OFF');
  if (!NS.flags.hybrid) parts.push('hybrid OFF');
  if (!NS.flags.tools) parts.push('tools OFF');
  route.textContent = parts.join(' · '); fitRoute();
}

/* styles */
(() => {
  if (document.getElementById('eval1-ui')) return;
  const s = document.createElement('style'); s.id = 'eval1-ui';
  s.textContent =
    '.exp-info{background:none;border:1px solid var(--border);color:var(--text-secondary);border-radius:50%;width:17px;height:17px;font-size:10px;line-height:1;padding:0;cursor:help;vertical-align:middle;margin-left:4px;flex-shrink:0}.exp-info:hover{background:var(--border);color:var(--text)}'
    + '.exp-popup-wrap{position:fixed;inset:0;z-index:8900;pointer-events:none}.exp-popup-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45);pointer-events:none}.exp-popup{position:absolute;top:max(64px,calc(env(safe-area-inset-top,0px) + 56px + 8px));left:50%;transform:translateX(-50%);width:min(540px,calc(100dvw - 24px));max-height:calc(100dvh - 120px);display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.6);pointer-events:auto;overflow:hidden}.exp-popup-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600;font-size:.85rem}.exp-popup-x{background:none;border:none;color:var(--text-secondary);font-size:1.2rem;cursor:pointer;line-height:1;padding:0 4px}.exp-popup-x:hover{color:var(--text)}.exp-popup-body{padding:12px 14px;overflow-y:auto;font-size:.78rem;line-height:1.6;color:var(--text)}.exp-popup-body code{background:var(--code-bg);padding:1px 5px;border-radius:4px;font-size:.72rem}.exp-popup-foot{padding:8px 14px;border-top:1px solid var(--border);display:flex;justify-content:flex-end}.exp-popup-close{background:var(--accent);color:#fff;border:none;padding:5px 14px;border-radius:8px;font-size:.75rem;cursor:pointer}'
    + '.code-header,.code-footer{cursor:pointer;user-select:none}.code-header button,.code-footer button{cursor:pointer}.block-arrow{display:inline-grid;place-content:center;min-width:24px;min-height:24px;padding:4px 8px;margin:-4px -8px;border-radius:4px}.block-arrow:hover{background:rgba(255,255,255,.08)}'
    + 'body.dse-peak .msg-stats .cost-pill{color:var(--danger)!important;font-weight:800!important}body.dse-peak .send-btn{-webkit-text-stroke:1px var(--danger);-webkit-text-fill-color:#fff;color:#fff}.msg-stats .cost-pill.peak-cost{color:var(--danger)!important;font-weight:800!important}'
    + '.settings-panel{max-height:calc((100dvh - 56px - 96px) * 0.95)!important;overflow:hidden!important;padding:.6em .9em!important}.settings-panel>.tabs{flex-shrink:0!important;overflow:hidden!important;margin-bottom:.25em!important}.settings-panel>.tabs .tab-btn{padding:.15em .3em!important;font-size:.75rem!important;display:inline!important}.settings-panel>.tab-content{display:none!important;flex-direction:column!important;min-height:0!important}.settings-panel>.tab-content.active{display:flex!important;flex:1 1 auto!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-gutter:stable!important;padding:4px 12px 4px 4px!important;gap:8px!important}.settings-panel>#applySettingsBtn{flex-shrink:0!important;margin-top:8px!important}.settings-panel select{field-sizing:content!important;min-width:0!important;flex:0 1 auto!important}.settings-panel .setting-row select{margin-left:auto!important}.settings-panel input:not([type="checkbox"]):not([type="file"]):not([type="range"]),.settings-panel textarea:not(.xt),.input-area textarea{box-sizing:content-box!important;padding-right:calc(10% + 3ch)!important}#modelSelect{align-self:stretch!important;width:100%!important}#aL .ar,#swarmRows .ar{grid-template-columns:auto minmax(0,1fr) auto!important;column-gap:8px!important;padding:2px 8px!important;min-height:34px!important;border-radius:8px!important}#aL .ag{display:flex!important;flex-wrap:nowrap!important;align-items:center!important;gap:4px!important;overflow:hidden!important}#aL .af{display:inline-flex!important;align-items:center!important;gap:2px!important;font-size:10px!important;flex-shrink:1!important;min-width:0!important}#aL .xt{height:24px!important;min-height:24px!important;max-height:24px!important;field-sizing:fixed!important;padding:0 4px!important;line-height:24px!important;font-size:11px!important;overflow:hidden!important}#aL .ar b{font-size:11px!important;white-space:nowrap!important;align-self:center!important}#tab-swarm{gap:.2em!important}'
    + '#expToolEchoCollapse,#msgCollapseSize,#blockCollapseSize{width:auto!important;box-sizing:content-box!important;padding-right:calc(10% + 3ch)!important}';
  document.head.appendChild(s);
})();
/* default code font scale 0.8 */
(() => { if (typeof settings !== 'undefined' && (settings.fontScale == null || settings.fontScale === 0.5)){ settings.fontScale = 0.8; const e = document.getElementById('fontScale'); if (e) e.value = '0.8'; document.documentElement.style.setProperty('--block-font-scale', '0.8'); } })();

/* dse-ui-fix (baked into 57) */
(() => { let s = document.getElementById('dse-ui-fix'); if (!s) { s = document.createElement('style'); s.id = 'dse-ui-fix'; document.head.appendChild(s); } s.textContent = '#settingsPanel input:not([type="checkbox"]):not([type="file"]):not([type="range"]){box-sizing:content-box!important;padding:4px 8px!important;padding-inline-end:calc(var(--text-w,0px) * 0.1 + 3ch)!important;min-width:0!important;width:auto!important;field-sizing:content!important;flex-shrink:0!important}#settingsPanel select{width:auto!important;max-width:100%!important;flex:0 1 auto!important}#settingsPanel .setting-row{flex-wrap:nowrap!important;align-items:center!important;min-height:24px!important}#settingsPanel .setting-row>span:first-child{flex:0 1 auto!important;min-width:0!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}#settingsPanel .setting-row label.toggle{margin-left:auto!important;flex-shrink:0!important}#tab-exp select{min-width:0!important;padding:2px .5em!important;padding-right:calc(2% + 1ch)!important;line-height:1.3!important}#tab-io select{padding:2px .5em!important;padding-right:calc(2% + 1ch)!important;max-width:100%!important}#tab-exp .setting-row>span:last-child{margin-left:auto!important;display:inline-flex!important;align-items:center!important;gap:6px!important}#tab-other .setting-row:has(>div)>label.toggle{margin-left:0!important}.exp-tabs{margin-bottom:8px!important;padding-bottom:4px!important}.exp-tabs .tab-btn{font-size:.72rem!important;padding:3px 8px!important}#tab-exp>.tab-content{gap:4px!important}#tab-exp .setting-row>span:first-child{font-size:12px!important}#expToolEchoCollapse,#msgCollapseSize,#blockCollapseSize{width:auto!important;box-sizing:content-box!important;padding-right:calc(10% + 3ch)!important}#tab-exp #expRoute{margin-left:auto!important;text-align:right!important;white-space:nowrap!important;overflow:hidden!important;max-width:100%!important}#tab-model{padding-right:.3em!important}.settings-panel input[type="password"]{padding-left:8px!important}.settings-panel .setting-row:has(.toggle):not(:has(input:not([type="checkbox"]),select,textarea)){padding-right:0!important}#settingsPanel #providerSelect{flex:1 1 0%!important;field-sizing:fixed!important;max-width:none!important}#settingsPanel #modelSelect{width:100%!important;max-width:none!important;align-self:stretch!important}#apiKeyInput{flex:1 1 0%!important;field-sizing:fixed!important;padding-right:calc(10% + 3ch)!important}'; document.head.appendChild(s); })();

/* 45.js FIX 5 — UI collapser rows: combine value + on/off slider (msg + block) */
(() => {
  const s = document.createElement('style'); s.id = 'dse-ui-collapser-fix';
  s.textContent = '#msgCollapseSize,#blockCollapseSize{box-sizing:content-box!important;padding-right:calc(10% + 3ch)!important}';
  document.head.appendChild(s);
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

/* route fit observer: re-fit when panel opens or viewport resizes */
(() => { if (window.__routeFitObs) return; window.__routeFitObs = true; const run = () => requestAnimationFrame(() => { try { fitRoute(); } catch(e){} }); const p = document.getElementById('settingsPanel'); if (p) new MutationObserver(() => { if (p.classList.contains('open')) run(); }).observe(p, { attributes: true, attributeFilter: ['class'] }); window.addEventListener('resize', run); run(); })();

/* dynamic label font-fit: shrink to 0.7 when a setting doesn't fit one line */
(() => {
  const fit = () => {
    document.querySelectorAll('#settingsPanel .setting-row > span:first-child, #settingsPanel select').forEach(lab => {
      if (lab.clientWidth <= 0) return;
      if (lab.scrollWidth > lab.clientWidth + 1) {
        let fs = parseFloat(getComputedStyle(lab).fontSize) || 12;
        let min = 12 * 0.7;
        while (lab.scrollWidth > lab.clientWidth + 1 && fs > min + 0.1) { fs -= 0.5; lab.style.fontSize = fs + 'px'; }
      }
    });
  };
  fit();
  if (!window.__dseFitObs) { window.__dseFitObs = true; new MutationObserver(fit).observe(document.getElementById('settingsPanel'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); }
})();

/* shorten import-mode dropdown option labels (values unchanged) */
(() => { const s = document.getElementById('importModeSelect'); if (!s) return; const m = { 'Merge same chats under main branches like 1.15':'merge same chat → branch 1.15', 'Merge only if different chat ID':'merge if different chat ID', 'Replace all with imported (getting backup suggested)':'replace all (backup suggested)' }; Array.from(s.options).forEach(o => { if (m[o.textContent]) o.textContent = m[o.textContent]; }); })();

/* editable inputs: hybrid — native sizing + CSS var for 10%-of-text breath */
(() => {
  const mirror = document.createElement('span');
  mirror.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;pointer-events:none';
  document.body.appendChild(mirror);
  const sync = inp => {
    const cs = getComputedStyle(inp);
    mirror.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;pointer-events:none;font:' + cs.font + ';letter-spacing:' + cs.letterSpacing + ';padding-left:' + cs.paddingLeft + ';border-left:' + cs.borderLeftWidth + ' solid';
    mirror.textContent = inp.value || inp.placeholder || '';
    inp.style.setProperty('--text-w', mirror.getBoundingClientRect().width + 'px');
  };
  const syncAll = () => { document.querySelectorAll('#settingsPanel input:not([type="checkbox"]):not([type="file"]):not([type="range"])').forEach(sync); };
  syncAll();
  document.addEventListener('input', e => { if (e.target && e.target.matches && e.target.matches('#settingsPanel input')) sync(e.target); });
  document.addEventListener('change', e => { if (e.target && e.target.matches && e.target.matches('#settingsPanel input')) sync(e.target); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncAll);
  if (!window.__dseHybridPadObs) { window.__dseHybridPadObs = true; new MutationObserver(syncAll).observe(document.getElementById('settingsPanel'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); }
  window.addEventListener('resize', syncAll);
})();
/* ============================ API + BOOT ============================ */
function apply(){
  FLAGS.forEach((k, i) => { window['eval1b' + (i+1)] = NS.flags[k]; });
  HOOKS.wrap('buildAPIMessages', 'eval1-bam', bamMake);
  HOOKS.wrap('executeAPI', 'eval1-agentic', agenticMake);
  HOOKS.wrap('buildCodeBlockHTML', 'eval1-codeblock', codeblockMake);
  HOOKS.wrap('applyResponseMetadata', 'eval1-peakcost', peakCostMake);
  HOOKS.wrap('renderFullChat', 'eval1-peak', peakRenderMake);
  if (NS.flags.marked){ HOOKS.wrap('formatMarkdown', 'eval1-marked', markedMake); loadMarked(); } else HOOKS.unwrap('formatMarkdown', 'eval1-marked');
  if (NS.flags.anthropic) addHandler('anthropic', anthropicHandler); else removeHandler('anthropic');
  if (NS.flags.hybrid){ addHandler('responses', responsesHandler); addHandler('coalescer', coalescerHandler); } else { removeHandler('responses'); removeHandler('coalescer'); }
  if (NS.flags.pill) ensureStatusPill(); else removeStatusPill();
  if (!document.querySelector('.tab-btn[data-tab="exp"]')) buildExpTab();
  materializeTools();
  if (NS.config.peakCounter !== 'off') peakCounterStart(); else peakCounterStop();
  updateStatus();
  NS.installed = true;
  try { console.log('[eval1 v' + VERSION + '] online — flags ' + JSON.stringify(NS.flags)); } catch(e){}
}
function disable(){
  fetchRestore();
  HOOKS.restoreAll();
  removeStatusPill(); removeExpTab();
  peakCounterStop();
  const te = document.getElementById('dse-peak-timer'); if (te) te.remove(); peakTimerEl = null;
  NS.installed = false;
}
NS.apply = apply; NS.disable = disable;
NS.setFlag = (name, val) => { if (FLAGS.indexOf(name) < 0) throw Error('unknown flag: ' + name); NS.flags[name] = val ? 1 : 0; apply(); return JSON.parse(JSON.stringify(NS.flags)); };

/* table-driven setters */
NS.set = (k, v) => {
  const d = SETTERS[k]; if (!d) throw Error('unknown setting: ' + k);
  if (d.vals && d.vals.indexOf(v) < 0) throw Error('invalid value: ' + v);
  if (d.check && !d.check(v)) throw Error('invalid value: ' + v);
  if (d.bool) v = !!v;
  else if (d.num){ v = +v; if (!Number.isFinite(v)) v = (d.def != null ? d.def : 0); if (d.min != null) v = Math.max(d.min, v); if (d.max != null) v = Math.min(d.max, v); }
  else if (d.str) v = String(v).trim();
  NS.config[k] = v; save();
  if (d.apply) d.apply(v);
  return NS.config[k];
};
const SETTERS = {
  mode:{ vals:['auto','chat','responses'], apply:() => { updateStatus(); updateExpRoute(); } },
  webSearch:{ bool:1, apply:updateStatus },
  showSearchTrace:{ bool:1, apply:updateStatus },
  paintInterval:{ num:1, def:160, min:40 },
  thinkingHistory:{ vals:['all','tools','off'] },
  toolEchoCollapse:{ num:1, def:0, min:0 },
  toolFontScale:{ num:1, def:0.7, min:0.01, max:2 },
  toolMaxTurns:{ num:1, def:0, min:0 },
  toolMaxTurnsOn:{ bool:1 },
  peakCounter:{ vals:['off','end','next'], apply:v => { if (v !== 'off') peakCounterStart(); else peakCounterStop(); applyPeakDisplay(); } },
  evalToolVersion:{ check:v => v === 'off' || v === 'auto' || (Number.isInteger(+v) && +v >= 1 && +v <= 7) },
  evalToolNameOverride:{ str:1 },
  evalToolNameOverrideOn:{ bool:1 },
  toolCostNote:{ bool:1 }
};
['mode','webSearch','showSearchTrace','paintInterval','thinkingHistory','toolEchoCollapse','toolFontScale','toolMaxTurns','toolMaxTurnsOn','peakCounter','evalToolVersion','evalToolNameOverride','evalToolNameOverrideOn'].forEach(k => { NS['set' + k[0].toUpperCase() + k.slice(1)] = v => NS.set(k, v); });

NS.status = () => JSON.parse(JSON.stringify({ version:VERSION, flags:NS.flags, config:NS.config, stats:NS.stats, installed:NS.installed }));
NS.auditPricing = () => { const PE = window.__pricingEngine; return PE && PE.audit ? PE.audit() : null; };
NS.removeExpTab = removeExpTab; NS._rebuildExpTab = buildExpTab; NS._materializeToolAliases = materializeTools;
NS._internals = { addCumulativeUsage, toolSchema, activeToolName, toolNameForVersion, makeResponsesTranslator, makeAnthropicTranslate, buildResponsesRequest, mapUsage, toAnthropic };
NS.version = VERSION;
apply();
console.log('[eval1 v' + VERSION + '] installed');

/* ==================== 75.js — M2/M3/M4/M6/M7 (source-integrated) ==================== */
(() => {
  const NS = window.__eval1;
  if (!NS || NS._v75) return; NS._v75 = 1;
  if (NS.config.relaxedSendCriteria == null) NS.config.relaxedSendCriteria = false;
  if (NS.config.staleHunter == null) NS.config.staleHunter = false;
  if (NS.config.staleHunterMs == null) NS.config.staleHunterMs = 900000;
  try { SETTERS.relaxedSendCriteria = { bool:1 }; } catch(e){}
  try { SETTERS.staleHunter = { bool:1 }; } catch(e){}
  try { SETTERS.staleHunterMs = { num:1, def:900000, min:60000 }; } catch(e){}
  NS.setRelaxedSendCriteria = v => NS.set('relaxedSendCriteria', v);
  NS.setStaleHunter = v => NS.set('staleHunter', v);
  NS.setStaleHunterMs = v => NS.set('staleHunterMs', v);
  const PE = window.__pricingEngine;
  if (PE) {
    const scheds = NS.__scheds = NS.__scheds || {};
    const msDay = 864e5;
    const active = (ts, model) => (scheds[model] || []).filter(e => {
      const d = new Date(ts), day = d.getUTCDay(), msd = ts % msDay;
      if (e.kind === 'once') return ts >= e.from && ts < e.to;
      if (e.kind === 'year') return d.getUTCMonth() === (e.mon||0) && d.getUTCDate() === (e.day||1) && msd >= (e.from||0) && msd < (e.to||msDay);
      return (e.days ? e.days.includes(day) : true) && msd >= (e.from||0) && msd < (e.to||msDay);
    });
    PE.effFactorsAt = (ts, model) => active(ts, model).map(e => e.scalar != null ? e.scalar : 1).filter(s => s !== 1);
    PE.effMultAt = (ts, model) => { try { return PE.effFactorsAt(ts, model).reduce((a,s)=>a*s, 1); } catch(e){ return 1; } };
    PE.registerSched = (model, list) => { scheds[model] = list; };
    try { ['deepseek-v4-flash','deepseek-v4-pro','deepseek-v4-flash-vision-exp'].forEach(m => PE.registerSched(m, [])); } catch(e){}
  }
  if (typeof finalizeGeneration === 'function' && !finalizeGeneration.__75safe) {
    const orig = finalizeGeneration;
    finalizeGeneration = function(node, vIndex, controller){
      try { return orig.apply(this, arguments); }
      finally { try { if (controller && activeControllers) activeControllers.delete(controller); } catch(e){} try { if (typeof resetStopBtn === 'function') resetStopBtn(); } catch(e){} }
    };
    finalizeGeneration.__75safe = 1;
  }
  if (!NS.__75reconciler) {
    NS.__75reconciler = setInterval(() => {
      try {
        const genSet = new Set(Object.keys(gens || {}));
        const liveNodes = Object.values(chatTree.nodes).filter(n => n.isGenerating);
        const orphans = liveNodes.filter(n => !genSet.has(genKey(n.id, n.activeVersion||0)) && !(n.versions[n.activeVersion||0]||{}).endTime && (n.lastUpdateTime ? Date.now() - n.lastUpdateTime > 5000 : (n.e ? Date.now() - n.e > 10000 : true)));
        orphans.forEach(n => { try { const v = n.versions[n.activeVersion||0]||{}; v.isDead = true; v.errorIcon = '☠️'; v.errorText = 'Failed to start (orphan)'; v.endTime = Date.now(); finalizeGeneration(n, n.activeVersion||0); } catch(e){} });
        if (!Object.keys(gens || {}).length && liveNodes.length === 0 && activeControllers && activeControllers.size) { activeControllers.clear(); try { resetStopBtn(); } catch(e){} }
      } catch(e){}
    }, 2000);
  }
  if (!NS.__75hunter) {
    NS.__75hunter = setInterval(() => {
      if (!NS.config.staleHunter) return;
      try {
        const now = Date.now(), ms = NS.config.staleHunterMs || 900000;
        for (const k in gens || {}) {
          const g = gens[k], n = g.node, v = n.versions[g.v];
          if (!v || v.endTime || v.isDead) continue;
          if (!n.lastUpdateTime) continue;
          const age = now - n.lastUpdateTime;
          if (age < ms) continue;
          try { console.warn('[eval1] stale hunter: ' + n.id.slice(0,40) + ' silent ' + Math.round(age/1000) + 's'); } catch(e){}
          v.isDead = true; v.errorIcon = '☠️'; v.errorText = 'Stale stream auto-stopped (no chunks for ' + Math.round(age/1000) + 's)';
          v.endTime = now;
          try { finalizeGeneration(n, g.v); } catch(e){}
          try { showToast('☠️ stale stream stopped'); } catch(e){}
        }
      } catch(e){}
    }, 5000);
  }
  const syncRelaxed = () => {
    try {
      if (!NS.config.relaxedSendCriteria || !els || !els.sendBtn) return;
      const t = els.messageInput ? els.messageInput.value.trim() : '';
      if (!t) { els.sendBtn.disabled = true; return; }
      try { const rr = run(), pp = rr.p; const ok = getApiKey(pp.id).length > 2 && !!pp.baseURL && !!pp.apiPath && !!rr.m; els.sendBtn.disabled = !ok; if (ok) els.sendBtn.style.display = 'flex'; } catch(e){}
    } catch(e){}
  };
  NS.__syncRelaxedSend = syncRelaxed;
  [['updateSendBtn','__75rs1'],['triggerAI','__75rs2'],['resetStopBtn','__75rs3']].forEach(([fn, mark]) => {
    try { if (typeof window[fn] === 'function' && !window[fn][mark]) { const orig = window[fn]; const w = function(){ const r = orig.apply(this, arguments); try { syncRelaxed(); } catch(e){} return r; }; w[mark] = 1; window[fn] = w; } } catch(e){}
  });
  try { if (typeof saveHotMirror === 'function' && !saveHotMirror.__75log) {
    const orig = saveHotMirror; saveHotMirror = function(key, serialized, revision){ try { if (serialized && serialized.length > 2e6) console.warn('[eval1] hot mirror skipped: tree > 2MB (' + serialized.length + ' chars)'); } catch(e){} return orig.apply(this, arguments); }; saveHotMirror.__75log = 1;
  } } catch(e){}
  let st = document.getElementById('dse-75-css');
  if (!st) { st = document.createElement('style'); st.id = 'dse-75-css'; st.textContent = 'body.dse-peak .msg-stats .cost-pill{color:inherit!important;font-weight:inherit!important}.msg-stats .cost-pill.peak-cost{color:var(--danger)!important;font-weight:800!important}.msg-stats .cost-pill.discount-cost{color:var(--success)!important;font-weight:800!important}body.dse-discount .send-btn{-webkit-text-stroke:1px var(--success)!important;-webkit-text-fill-color:#fff;color:#fff}body.dse-free .send-btn{-webkit-text-stroke:1px var(--success)!important;-webkit-text-fill-color:#fff;color:#fff}'; document.head.appendChild(st); }
  const syncPills = () => {
    try { document.querySelectorAll('.msg-stats .cost-pill[data-node-id]').forEach(p => {
      try { const n = chatTree.nodes[p.dataset.nodeId]; const v = n && n.versions && n.versions[n.activeVersion]; const md = v && v.metadata; const mult = (md && md.pricing && md.pricing.mult) || (md && md.peakCost ? 2 : 1); p.classList.toggle('peak-cost', !!(mult > 1)); p.classList.toggle('discount-cost', !!(mult < 1)); } catch(e){}
    }); } catch(e){}
  };
  NS.__syncPills75 = syncPills;
  try { new MutationObserver(syncPills).observe(document.getElementById('chatContainer') || document.body, { childList:true, subtree:true }); } catch(e){}
  syncPills();
  const addRows = () => {
    try {
      const gen = document.getElementById('exp-sub-general'); if (!gen) return;
      if (!document.getElementById('expRelaxedSend')) {
        const row = document.createElement('div'); row.className = 'setting-row';
        row.innerHTML = '<span>relaxed send criteria<button type="button" class="exp-info" title="relaxed send criteria">ⓘ</button></span><label class="toggle"><input type="checkbox" id="expRelaxedSend"' + (NS.config.relaxedSendCriteria ? ' checked' : '') + '><span class="slider"></span></label>';
        ((document.getElementById('expThinkingHistory') || {}).closest ? document.getElementById('expThinkingHistory').closest('.setting-row') : gen.firstChild).after(row);
        document.getElementById('expRelaxedSend').addEventListener('change', e => NS.setRelaxedSendCriteria(e.target.checked));
        row.querySelector('.exp-info').addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); try { popupHTML('When ON: send works whenever there is text, even while busy/stale. OFF = normal.', 'relaxed send criteria'); } catch(e){} });
      }
      if (!document.getElementById('expStaleHunter')) {
        const row = document.createElement('div'); row.className = 'setting-row';
        row.innerHTML = '<span>aggressive stale hunter<button type="button" class="exp-info" title="aggressive stale hunter">ⓘ</button></span><label class="toggle"><input type="checkbox" id="expStaleHunter"' + (NS.config.staleHunter ? ' checked' : '') + '><span class="slider"></span></label><input type="number" id="expStaleHunterMs" min="60000" step="60000" value="' + NS.config.staleHunterMs + '" style="width:90px">';
        (document.getElementById('expRelaxedSend') ? document.getElementById('expRelaxedSend').closest('.setting-row') : gen.firstChild).after(row);
        document.getElementById('expStaleHunter').addEventListener('change', e => NS.setStaleHunter(e.target.checked));
        document.getElementById('expStaleHunterMs').addEventListener('change', e => NS.setStaleHunterMs(parseInt(e.target.value,10) || 900000));
        row.querySelector('.exp-info').addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); try { popupHTML('Auto-finalizes streams that produced content then stay silent past [ms]. Same as Stop; received content kept. Only mid-stream silences. If your model pauses longer or takes >1h, raise [ms] or keep OFF.', 'aggressive stale hunter'); } catch(e){} });
      }
    } catch(e){}
  };
  try { addRows(); } catch(e){}
  try { const origReb = NS._rebuildExpTab; NS._rebuildExpTab = () => { try { origReb(); } catch(e){} addRows(); }; } catch(e){}
  try { const origDis = NS.disable; NS.disable = function(){ try { if (NS.__75reconciler) { clearInterval(NS.__75reconciler); NS.__75reconciler = 0; } if (NS.__75hunter) { clearInterval(NS.__75hunter); NS.__75hunter = 0; } const el = document.getElementById('dse-75-css'); if (el) el.remove(); } catch(e){} return origDis.apply(this, arguments); }; } catch(e){}
  try { save(); } catch(e){}
})();


/* ==================== 76.js — M5 buffer policy (verified-clear + TTL/caps + local mirror) ==================== */
(() => {
  if (window.__eval1_m5) return; window.__eval1_m5 = 1;
  const NS = window.__eval1, LS_KEY = 'dse_sb_local';
  const idbGet = key => new Promise((res, rej) => { try { initDB().then(db => { const tx = db.transaction('chatTrees','readonly'); const r = tx.objectStore('chatTrees').get(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); tx.onabort=()=>rej(new Error('aborted')); }); } catch(e){ rej(e); } });
  const idbPut = (key, val) => new Promise((res, rej) => { try { initDB().then(db => { const tx = db.transaction('chatTrees','readwrite'); tx.objectStore('chatTrees').put(val, key); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); }); } catch(e){ rej(e); } });
  const bufChars = v => (v[2]||'').length + (v[3]||'').length;
  const mirror = b => { try { const s = JSON.stringify(b); if (s.length <= 1e6) localStorage.setItem(LS_KEY, s); } catch(e){} };
  const readBuffer = async () => { try { const b = await idbGet('dse_sb'); if (b) return b; } catch(e){} try { const ls = localStorage.getItem(LS_KEY); if (ls) return JSON.parse(ls) || {}; } catch(e){} return {}; };
  const writeBuffer = async b => { const ok = await idbPut('dse_sb', b).then(()=>true).catch(()=>false); mirror(b); return ok; };
  async function safeClear(id, idx) {
    if (id == null) return clearStreamBuffer(id, idx);
    try {
      const b = await readBuffer();
      const key = Object.keys(b).find(k => { const p = k.split('|'); return p.length === 4 && p[2] === id && +p[3] === idx; });
      if (!key) return clearStreamBuffer(id, idx);
      const v = b[key];
      const tree = await idbGet(CHAT_ID).catch(()=>null);
      const dv = tree && tree.nodes && tree.nodes[id] && tree.nodes[id].versions && tree.nodes[id].versions[idx];
      const diskC = dv ? (dv.rawContent||'').length + (dv.thinking||'').length : 0;
      if (diskC >= bufChars(v)) { delete b[key]; await writeBuffer(b); }
      else mirror(b);
    } catch(e){}
  }
  if (typeof clearStreamBuffer === 'function' && !clearStreamBuffer.__m5) {
    const orig = clearStreamBuffer;
    clearStreamBuffer = function(id, i){ if (id && i != null) { safeClear(id, i); return; } return orig.apply(this, arguments); };
    clearStreamBuffer.__m5 = 1;
  }
  if (typeof saveStreamBuffer === 'function' && !saveStreamBuffer.__m5) {
    const orig = saveStreamBuffer;
    saveStreamBuffer = function(n, i){ const p = orig.apply(this, arguments); if (p && p.then) p.then(()=>{ readBuffer().then(mirror).catch(()=>{}); }, ()=>{}); return p; };
    saveStreamBuffer.__m5 = 1;
  }
  const audit = async () => {
    try {
      const b = await readBuffer(); if (!Object.keys(b).length) return;
      const tree = await idbGet(CHAT_ID).catch(()=>null);
      const now = Date.now(), rows = [], del = new Set();
      for (const k in b) { const v = b[k], p = k.split('|'); if (p.length !== 4) continue;
        const dv = tree && tree.nodes && tree.nodes[p[2]] && tree.nodes[p[2]].versions && tree.nodes[p[2]].versions[+p[3]];
        const diskC = dv ? (dv.rawContent||'').length + (dv.thinking||'').length : 0;
        rows.push({ k, matched: diskC >= bufChars(v), size: bufChars(v), age: now - (v[0]||0) }); }
      rows.forEach(r => { if (r.matched && r.age > 864e5) del.add(r.k); if (!r.matched && r.age > 6048e5) del.add(r.k); });
      const ms = rows.filter(r => r.matched && !del.has(r.k)).sort((a,b)=>a.age-b.age);
      let mb = ms.reduce((s,r)=>s+r.size,0);
      for (const r of ms) { if (mb <= 10e6) break; if (r.age > 36e5) { del.add(r.k); mb -= r.size; } }
      if (del.size) { del.forEach(k => delete b[k]); await writeBuffer(b); }
      let ls = JSON.stringify(b); if (ls.length > 1e6) {
        const loc = rows.filter(r => !del.has(r.k)).sort((a,b)=>a.age-b.age);
        for (const r of loc) { if (ls.length <= 1e6) break; if (r.age > 6e5) { delete b[r.k]; ls = JSON.stringify(b); } }
      }
      mirror(b);
    } catch(e){}
  };
  audit();
  if (!window.__m5timer) window.__m5timer = setInterval(audit, 60000);
  try { const origDis = NS.disable; NS.disable = function(){ try { if (window.__m5timer) { clearInterval(window.__m5timer); window.__m5timer = 0; } } catch(e){} return origDis.apply(this, arguments); }; } catch(e){}
})();

/* ==================== 60.js — tool_eval_7 + fallback UI ==================== */
(() => {
  const esc60 = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  // 1) defaults
  DEFAULTS.evalToolVersion = 'auto';
  DEFAULTS.evalInProviders = false;
  DEFAULTS.apiShapeFallback = 'auto';
  DEFAULTS.pricingFallback = 'auto';
  if (NS.config.evalToolVersion == null) NS.config.evalToolVersion = 'auto';
  if (NS.config.evalInProviders == null) NS.config.evalInProviders = false;
  if (NS.config.apiShapeFallback == null) NS.config.apiShapeFallback = 'auto';
  if (NS.config.pricingFallback == null) NS.config.pricingFallback = 'auto';
  // 2) tool_eval_7 full schema
  NS.setToolVersionSchema(7, {
    type:'function',
    function:{
      name:'tool_eval_7',
      description:'Execute JavaScript in the client-side AI chat WebApp hosting this conversation. Returns ONLY the last statement\'s value (serialized as JSON). By default runs in an isolated Web Worker on a separate thread. SET "worker": false if you need to access window, document, or DOM on the main thread. You may issue multiple tool invokes with same-different names in one block — each tool call becomes an independent execution; never merge or drop any.',
      parameters:{ type:'object', properties:{ code:{ type:'string', description:'JavaScript code to run.' }, timeout:{ type:'number' }, worker:{ type:'boolean', description:'false = full page DOM access. true = isolated worker (default)' } }, required:['code'] }
    }
  });
  if (TOOL_VERSIONS[7]) TOOL_VERSIONS[7].desc = 'arrived in 60.js — app-aware wording; better app integration';
  try { materializeTools(); } catch(e){}
  try { const t7 = window.__tools && window.__tools['tool_eval_7']; if (t7 && NS._toolSchemas && NS._toolSchemas[7]) t7.schema = toolSchema('tool_eval_7', { schema: NS._toolSchemas[7] }); } catch(e){}
  // 3) SETTERS + setters
  SETTERS.evalInProviders = { bool:1 };
  SETTERS.apiShapeFallback = { vals:['off','auto','on'] };
  SETTERS.pricingFallback = { vals:['off','auto','on'] };
  NS.setEvalInProviders = v => NS.set('evalInProviders', v);
  NS.setApiShapeFallback = v => NS.set('apiShapeFallback', v);
  NS.setPricingFallback = v => NS.set('pricingFallback', v);
  // 4) EXP_INFO semantic edits + placeholders
  EXP_INFO['Eval tool version'] = 'Which tool_eval schema is attached.\n 1 = original schema \n 2 = capability-wording schema \n 3 = worker-first \n 4 = no longer current schema \n 5 = mixed-tool nudge schema \n 6 = cost-annotated (per-round cost in tool result) \n 7 = arrived in 60.js — app-aware wording; increases clarifications for better integration to the app \n Schemas 1-5 are the 52-55.js era; 6 is the 56.js schema; 7 is the 60.js schema. "auto" = last-used; "off" = disabled.';
  EXP_INFO['use eval in providers'] = 'Runs provider eval code synchronously before each API request (only when the provider JSON has an eval field). Security: creating a NEW provider (+) whose JSON contains eval auto-flips this OFF · editing an existing provider (even renaming it) does NOT trigger that. The auto-seal is skipped if "technical" + "Riskier" are enabled. Manual toggle always works.';
  EXP_INFO['api shape'] = 'placeholder';
  EXP_INFO['pricing'] = 'placeholder';
  // 5) UI patch
  const popup60 = (title, text) => {
    const old = document.getElementById('expPopupWrap'); if (old) old.remove();
    const w = document.createElement('div'); w.id = 'expPopupWrap'; w.className = 'exp-popup-wrap';
    w.innerHTML = '<div class="exp-popup-backdrop"></div><div class="exp-popup"><div class="exp-popup-head"><span>' + esc60(title) + '</span><button class="exp-popup-x" data-expx="1">×</button></div><div class="exp-popup-body">' + text + '</div><div class="exp-popup-foot"><button class="exp-popup-close" data-expx="1">Close</button></div></div>';
    document.body.appendChild(w);
    w.addEventListener('click', e => { if (e.target.closest('[data-expx]')) w.remove(); else if (!e.target.closest('.exp-popup')) w.remove(); });
  };
  const sel60 = (id, val) => '<select id="' + id + '">' + ['off','auto','on'].map(v => '<option value="' + v + '"' + (v === val ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>';
  const row60 = (label, ctrl, tip) => '<div class="setting-row"><span>' + esc60(label) + '<button type="button" class="exp-info" title="' + esc60(tip || '') + '">ⓘ</button></span>' + ctrl + '</div>';
  const bindInfo60 = btn => { if (btn.__wired60) return; btn.__wired60 = 1;
    btn.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); const lab = btn.closest('.setting-row').querySelector('span').childNodes[0].textContent.trim(); popup60(lab, String(EXP_INFO[lab] || 'placeholder').split('\n').join('<br>')); });
  };
  function patchExpUI(){
    if (window.__eval1UI60) return; window.__eval1UI60 = 1;
    const gen = document.getElementById('exp-sub-general');
    if (gen && !document.getElementById('expEvalInProviders')) {
      const modeRow = document.getElementById('expMode') && document.getElementById('expMode').closest('.setting-row');
      const html = '<div class="setting-row"><span>use eval in providers<button type="button" class="exp-info" title="use eval in providers">ⓘ</button></span><label class="toggle"><input type="checkbox" id="expEvalInProviders"' + (NS.config.evalInProviders ? ' checked' : '') + '><span class="slider"></span></label></div>';
      if (modeRow) modeRow.insertAdjacentHTML('afterend', html); else gen.insertAdjacentHTML('beforeend', html);
      const inp = document.getElementById('expEvalInProviders');
      inp.addEventListener('change', () => NS.setEvalInProviders(inp.checked));
      bindInfo60(inp.closest('.setting-row').querySelector('.exp-info'));
    }
    const tabs = document.querySelector('#tab-exp .exp-tabs');
    const tabExp = document.getElementById('tab-exp');
    if (tabs && tabExp && !document.querySelector('#tab-exp .tab-btn[data-exp-sub="fallbacks"]')) {
      tabs.insertAdjacentHTML('beforeend', '<button class="tab-btn" data-exp-sub="fallbacks">Fallbacks</button>');
      tabExp.insertAdjacentHTML('beforeend', '<div class="tab-content" id="exp-sub-fallbacks">' + row60('api shape', sel60('expApiShape', NS.config.apiShapeFallback || 'auto'), 'api shape') + row60('pricing', sel60('expPricing', NS.config.pricingFallback || 'auto'), 'pricing') + '</div>');
      const btn = document.querySelector('#tab-exp .tab-btn[data-exp-sub="fallbacks"]');
      if (btn) btn._ = document.getElementById('exp-sub-fallbacks');
      document.getElementById('expApiShape').addEventListener('change', e => NS.setApiShapeFallback(e.target.value));
      document.getElementById('expPricing').addEventListener('change', e => NS.setPricingFallback(e.target.value));
      bindInfo60(document.getElementById('expApiShape').closest('.setting-row').querySelector('.exp-info'));
      bindInfo60(document.getElementById('expPricing').closest('.setting-row').querySelector('.exp-info'));
    }
    const ev = document.getElementById('expEvalToolVersion');
    if (ev) {
      ev.innerHTML = '';
      ev.appendChild(new Option('off', 'off')); ev.appendChild(new Option('auto (last used)', 'auto'));
      let g = document.createElement('optgroup'); g.label = '52-55.js'; ev.appendChild(g); [1,2,3,4,5].forEach(id => g.appendChild(new Option('tool_eval_' + id, String(id))));
      g = document.createElement('optgroup'); g.label = '56.js'; ev.appendChild(g); g.appendChild(new Option('tool_eval_6 (cost-annotated)', '6'));
      g = document.createElement('optgroup'); g.label = '60.js'; ev.appendChild(g); g.appendChild(new Option('tool_eval_7 (60.js)', '7'));
      ev.value = NS.config.evalToolVersion || 'auto';
    }
  }
  patchExpUI();
  const origRebuild60 = NS._rebuildExpTab;
  NS._rebuildExpTab = () => { window.__eval1UI60 = 0; origRebuild60(); patchExpUI(); };
  try { save(); } catch(e){}
})();

/* ==================== 61.js — per-model auto eval tool (seed-at-attach) ==================== */
NS._lastEvalToolByModel = NS._lastEvalToolByModel || {};
function seedFromView(){
  const byEval = {}, byTools = {};
  try {
    const nodes = typeof getViewNodes === 'function' ? getViewNodes() : [];
    for (const n of nodes){
      if (!n || n.role !== 'assistant') continue;
      const v = (n.versions && n.versions[n.activeVersion]) || {};
      const model = v.metadata && v.metadata.model;
      if (!model) continue;
      let names = null;
      const mt = v.metadata && v.metadata.tools;
      if (mt && typeof mt === 'object' && !Array.isArray(mt)){ names = Object.keys(mt).filter(Boolean); }
      if (!names || !names.length){ const tb = v.toolBatch; if (tb && Array.isArray(tb.names)) names = tb.names.filter(Boolean); }
      if (names && names.length){ byTools[model] = names.slice(); const et = names.find(x => /^tool_eval/.test(x)); if (et) byEval[model] = et; }
    }
  } catch(e){}
  NS._lastEvalToolByModel = byEval;
  NS._lastToolsOnByModel = byTools;
}
NS.refreshBranchTools = function(){ NS._lastEvalToolByModel = {}; seedFromView(); };
try { seedFromView(); } catch(e){}


/* ==================== 63.js UI: Agentic tools dropdown (on/auto/off) + tool-set grey + persistence ==================== */
(() => {
  const SUB = ['expWebSearch','expEvalToolVersion','expEvalToolNameOverrideOn'];
  try { SETTERS.agenticTools = { vals:['off','auto','on'] }; } catch(e){}
  // persist flags (status pill etc.) — eval1 never saved these before
  const saveFlags = () => { try { const f = {}; FLAGS.forEach((k,i)=>{ f[k]=NS.flags[k]; }); localStorage.setItem('dse_eval1_flags', JSON.stringify(f)); } catch(e){} };
  if (NS.setFlag && !NS.setFlag.__persist63){
    const orig = NS.setFlag;
    NS.setFlag = function(name, val){ const r = orig.call(this, name, val); try { save(); saveFlags(); } catch(e){} return r; };
    NS.setFlag.__persist63 = 1;
  }
  // restore flags from storage at boot
  try {
    const saved = JSON.parse(localStorage.getItem('dse_eval1_flags') || '{}');
    let changed = false;
    FLAGS.forEach(k => { if (saved[k] != null && NS.flags[k] !== saved[k]) { NS.flags[k] = saved[k]; changed = true; } });
    if (changed) { try { apply(); } catch(e){} }
  } catch(e){}

  const build = () => {
    const oldRow = document.getElementById('expTools') ? document.getElementById('expTools').closest('.setting-row') : null;
    if (!oldRow) return;
    const cur = NS.config.agenticTools || 'on';
    const opts = [{v:'on',l:'on'},{v:'auto',l:'auto(to cache hit)'},{v:'off',l:'off'}];
    const html = '<select id="expToolsMode">' + opts.map(o => '<option value="' + o.v + '"' + (o.v === cur ? ' selected' : '') + '>' + o.l + '</option>').join('') + '</select>';
    let sel = document.getElementById('expToolsMode');
    if (!sel) {
      const ctrl = oldRow.querySelector('label.toggle');
      if (ctrl) ctrl.outerHTML = html; else oldRow.insertAdjacentHTML('beforeend', html);
      sel = document.getElementById('expToolsMode');
    } else {
      sel.innerHTML = opts.map(o => '<option value="' + o.v + '"' + (o.v === cur ? ' selected' : '') + '>' + o.l + '</option>').join('');
    }
    const applyGrey = () => {
      const mode = sel.value;
      try { NS.set('agenticTools', mode); } catch(e){ NS.config.agenticTools = mode; }
      if (mode === 'off') { try { NS.setFlag('tools', 0); } catch(e){} } else { try { NS.setFlag('tools', 1); } catch(e){} }
      const grey = mode !== 'on';
      SUB.forEach(id => {
        const el = document.getElementById(id); if (!el) return;
        const row = el.closest('.setting-row'); if (!row) return;
        row.classList.toggle('o', grey);
        row.title = grey ? 'superseded by auto(to cache hit) — toggle does nothing until Agentic tools = on' : '';
      });
    };
    if (!sel.__bound63) { sel.__bound63 = 1; sel.addEventListener('change', applyGrey); }
    applyGrey();
  };
  window.__eval1UI63 = 0;
  build();
  const orig = NS._rebuildExpTab;
  NS._rebuildExpTab = () => { window.__eval1UI63 = 0; if (orig) orig(); build(); };
  window.__eval1UI63 = 1;
})();

/* ==================== 65.js — seed gate (covers both autos) ==================== */
(() => {
  const origSeed = typeof seedFromView === 'function' ? seedFromView : null;
  if (!origSeed || NS._seedGated65) return;
  NS._seedGated65 = 1;
  const anyAuto = () => {
    const am = NS.config.agenticTools || 'on';
    const ev = NS.config.evalToolVersion || 'auto';
    return am === 'auto' || ev === 'auto';
  };
  seedFromView = function(){
    if (!anyAuto()) {
      NS._lastEvalToolByModel = {};
      NS._lastToolsOnByModel = {};
      return;
    }
    return origSeed.apply(this, arguments);
  };
  NS.refreshBranchTools = function(){ NS._lastEvalToolByModel = {}; return origSeed(); };
})();

/* ==================== 67.js — cost balance (per-key) ==================== */
(() => {
  if (window.__eval1_balance67) return;
  const NS = window.__eval1;
  if (!NS) return;
  window.__eval1_balance67 = 1;

  if (NS.config.costBalance == null) NS.config.costBalance = 'off';
  try { SETTERS.costBalance = { vals: ['off','current','provider','all'] }; } catch(e){}
  NS.setCostBalance = v => NS.set('costBalance', v);
  if (NS.config.balanceSnap == null) NS.config.balanceSnap = false;
  try { SETTERS.balanceSnap = { bool:1 }; } catch(e){}
  NS.setBalanceSnap = v => NS.set('balanceSnap', v);
  try { EXP_INFO['record balance snapshot per message'] = 'default off — when on, each new message stores a balance snapshot in that version metadata.balance. access: node.versions[n].metadata.balance → {v, v2, mode, currency, t, provider, keyHash}'; } catch(e){}
  try { EXP_INFO['Cost balance'] = 'off / current key / all in current provider / all keys · show remaining balance (per API key) in the global cost popup. Note: multiple keys per provider are not stored yet (one key per provider), so "provider" behaves like "current" for now.'; } catch(e){}

  const balCache = new Map();
  const balInflight = new Map();
  const balLastReal = new Map();                     // ck -> performance.now() at last real fetch
  const keyHash = k => { let h = 0; for (let i = 0; i < k.length; i++){ h = (h * 31 + k.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); };
  const balSource = p => (p && p.balance) || null;
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
  const fitFont = el => { const base = parseFloat(getComputedStyle(el).fontSize) || 11; let fs = base; const min = base * 0.5; let guard = 0; while (el.scrollWidth > el.clientWidth + 1 && fs > min && guard++ < 40) { fs -= 0.5; el.style.fontSize = fs + 'px'; } };

  const injectBalanceLines = t => {
    const mode = NS.config.costBalance || 'off';
    if (mode === 'off') return;
    if (!(t && t.dataset && t.dataset.cost === 'global')) return;
    const tok = (NS.__balRenderTok = (NS.__balRenderTok || 0) + 1);
    const targets = [];
    if (mode === 'current' || mode === 'provider') {
      const pid = typeof activeProviderId !== 'undefined' ? activeProviderId : null;
      const p = pid ? providers[pid] : null;
      const key = p ? getApiKey(p.id) : '';
      if (p && key && balSource(p)) targets.push({ p, key });
    } else if (mode === 'all') {
      for (const pid of Object.keys(providers || {})) { const p = providers[pid]; const key = getApiKey(pid); if (p && key && balSource(p)) targets.push({ p, key }); }
    }
    if (!targets.length) return;
    const render = rows => {
      if (tok !== NS.__balRenderTok) return;
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
      fitFont(div);
    };
    render(targets.map(({ p, key }) => ({ p, e: getCached(p, key) })));
    const needFresh = targets.some(({ p, key }) => { const e = getCached(p, key); return !e || Date.now() - e.t > 5000; });
    if (needFresh) Promise.all(targets.map(async ({ p, key }) => ({ p, e: await fetchBalance(p, key, true, true) }))).then(rows => render(rows)).catch(() => {});
  };

  if (!NS.__balTicker) NS.__balTicker = setInterval(() => { try { const now = Date.now(); document.querySelectorAll('#costInfo [data-bal68line] [data-bal68ago]').forEach(sp => { if (sp.isConnected) sp.textContent = fmtAgo(now - (+sp.getAttribute('data-bal68ago'))); }); } catch(e){} }, 1000);

  if (typeof openCostInfo === 'function' && !NS.__balPatched67) {
    NS.__balPatched67 = 1;
    const origOpen = openCostInfo;
    openCostInfo = function(t, mode) { const r = origOpen.apply(this, arguments); try { injectBalanceLines(t); } catch(e){} return r; };
  }

  try {
    HOOKS.wrap('executeAPI', 'eval1-bal68', next => async function(messages, node, vIndex, controller, r) {
      try {
        const rr = r || run();
        const p = rr.p, key = getApiKey(p.id);
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
      return next.call(this, messages, node, vIndex, controller, r);
    });
  } catch(e){}

  const addUI = () => {
    const gen = document.getElementById('exp-sub-general');
    if (!gen || document.getElementById('expCostBalance')) return;
    const anchor = document.getElementById('expThinkingHistory');
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = '<span>Cost balance<button type="button" class="exp-info" title="Cost balance">ⓘ</button></span><select id="expCostBalance">'
      + [['off','off'],['current','current key'],['provider','all in current provider'],['all','all keys']]
        .map(o => '<option value="' + o[0] + '"' + (NS.config.costBalance === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
    if (anchor && anchor.closest('.setting-row')) anchor.closest('.setting-row').after(row);
    else gen.insertBefore(row, gen.firstChild);
    document.getElementById('expCostBalance').addEventListener('change', e => NS.setCostBalance(e.target.value));
        if (!document.getElementById('expBalanceSnap')) {
      const row2 = document.createElement('div');
      row2.className = 'setting-row';
      row2.innerHTML = '<span>record balance snapshot per message<button type="button" class="exp-info" title="record balance snapshot per message">ⓘ</button></span><label class="toggle"><input type="checkbox" id="expBalanceSnap"' + (NS.config.balanceSnap ? ' checked' : '') + '><span class="slider"></span></label>';
      document.getElementById('expCostBalance').closest('.setting-row').after(row2);
      document.getElementById('expBalanceSnap').addEventListener('change', e => NS.setBalanceSnap(e.target.checked));
      const info2 = row2.querySelector('.exp-info');
      if (info2) info2.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); try { popupHTML(String(EXP_INFO['record balance snapshot per message'] || '').split('\n').join('<br>'), 'record balance snapshot per message'); } catch(e){} });
    }
  };
  addUI();
  const origRebuild = NS._rebuildExpTab;
  NS._rebuildExpTab = () => { try { origRebuild(); } catch(e){} addUI(); };

  const setBal = (p, b) => { if (p && !p.balance) p.balance = b; };
  try { setBal(providers.deepseek, { path: '/user/balance', parse: ['balance_infos',0,'total_balance'], mode: 'balance', currency: 'USD' }); setBal(default_providers.deepseek, providers.deepseek.balance); } catch(e){}
  try { setBal(providers.openrouter, { path: '/credits', parse: ['data','total_credits'], parse2: ['data','total_usage'], mode: 'usage', currency: 'USD' }); setBal(default_providers.openrouter, providers.openrouter.balance); } catch(e){}
  try { const saved = JSON.parse(localStorage.getItem('dse_providers') || '{}'); if (saved.deepseek && !saved.deepseek.balance) saved.deepseek.balance = providers.deepseek.balance; if (saved.openrouter && !saved.openrouter.balance) saved.openrouter.balance = providers.openrouter.balance; localStorage.setItem('dse_providers', JSON.stringify(saved)); } catch(e){}

  let st = document.getElementById('dse-bal68-css');
  if (!st) { st = document.createElement('style'); st.id = 'dse-bal68-css'; document.head.appendChild(st); }
  st.textContent = '#costInfo [data-bal68line]{white-space:nowrap!important;overflow:hidden!important;max-width:100%!important}'
    + '#tab-exp .exp-tabs{flex-shrink:0!important;height:auto!important;min-height:24px!important;overflow:visible!important}'
    + '#tab-exp .exp-tabs .tab-btn{flex-shrink:0!important;display:inline-block!important}';

  NS.__bal68 = { fetchBalance, cache: balCache, getCached, fmtEntry, fmtAgo, injectBalanceLines, keyHash, balSource, pick };
})();
/* ==================== 69.js — technicalUser XSS seal + balance ticker fix ==================== */
(() => {
  const NS = window.__eval1;
  if (!NS || NS._v69) return;
  NS._v69 = 1;

  if (NS.config.technicalUser == null) NS.config.technicalUser = false;
  try { SETTERS.technicalUser = { bool: 1 }; } catch(e){}
  NS.setTechnicalUser = v => NS.set('technicalUser', v);
  
  const shouldSeal = () => !(!!(typeof settings !== 'undefined' && settings.z) && !!NS.config.technicalUser);
  const seal = () => {
    if (!shouldSeal()) return false;
    if (NS.config.evalInProviders) {
      NS.config.evalInProviders = false;
      try { save(); } catch(e){}
      const ui = document.getElementById('expEvalInProviders');
      if (ui) ui.checked = false;
      return true;
    }
    return false;
  };
  NS.__sealEval = seal;

  const addUI = () => {
    const host = document.getElementById('rBX');
    if (!host || document.getElementById('expTechnicalUser')) return true;
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.style.cssText = 'margin-top:4px;';
    row.innerHTML = '<span>technical</span><label class="toggle"><input type="checkbox" id="expTechnicalUser"' + (NS.config.technicalUser ? ' checked' : '') + '><span class="slider"></span></label>';
    host.appendChild(row);
    document.getElementById('expTechnicalUser').addEventListener('change', e => NS.setTechnicalUser(e.target.checked));
    const info = row.querySelector('.exp-info');
    if (info) info.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); try { popupHTML(String(EXP_INFO['technical user'] || '').split('\n').join('<br>'), 'technical user'); } catch(e){} });
    return true;
  };
  let _t69 = 0;
  const _iv69 = setInterval(() => { if (addUI() || ++_t69 > 40) clearInterval(_iv69); }, 250);

  /* 72-fix: ➕-click seal removed — decided at save-time only */
  const btn = document.getElementById('saveProvJsonBtn');
  if (btn) btn.addEventListener('click', () => {
    const had = new Set(Object.keys(providers || {}));
    setTimeout(() => { const added = Object.keys(providers || {}).filter(id => !had.has(id) && id !== 'custom_template'); const isNew = typeof editingId !== 'undefined' && !editingId; if (isNew && added.some(id => providers[id] && providers[id].eval)) { if (seal()) try { showToast('⚠️ evalInProviders disabled · new provider contains eval · if you trust the provider JSON source for full control you can turn it back on'); } catch(e){} } }, 0);
  });

  try {
    const stopT = () => { if (NS.__balTicker) { clearInterval(NS.__balTicker); NS.__balTicker = 0; } };
    const startT = () => { if (!NS.__balTicker) NS.__balTicker = setInterval(() => { try { if (!document.getElementById('costInfo')) return; document.querySelectorAll('#costInfo [data-bal68line] [data-bal68ago]').forEach(sp => { if (sp.isConnected) sp.textContent = (NS.__bal68 && NS.__bal68.fmtAgo ? NS.__bal68.fmtAgo(Date.now() - (+sp.getAttribute('data-bal68ago'))) : ''); }); } catch(e){} }, 1000); };
    stopT();
    const origClose = closeCostInfo;
    closeCostInfo = function(){ stopT(); return origClose.apply(this, arguments); };
    const origOpen = openCostInfo;
    openCostInfo = function(t, mode){ startT(); const r = origOpen.apply(this, arguments); try { if (NS.__bal68) NS.__bal68.injectBalanceLines(t); } catch(e){} return r; };
  } catch(e){}
})();

/* ==================== 70.js — sloppy provider evals + demo egg ==================== */
(() => {
  const NS = window.__eval1;
  if (!NS || NS._v70) return;
  NS._v70 = 1;
  const EGG = "globalThis.sessionDeepseekMessageCounter = (globalThis.sessionDeepseekMessageCounter ?? 0) + 1;";
  try {
    if (providers.deepseek && !providers.deepseek.eval) providers.deepseek.eval = EGG;
    if (default_providers.deepseek && !default_providers.deepseek.eval) default_providers.deepseek.eval = EGG;
    const saved = JSON.parse(localStorage.getItem('dse_providers') || '{}');
    if (saved.deepseek && !saved.deepseek.eval) { saved.deepseek.eval = EGG; localStorage.setItem('dse_providers', JSON.stringify(saved)); }
  } catch(e){}
})();

})();

/* 71.js — hfix */
(() => { let st = document.getElementById('dse-hfix70'); if (!st) { st = document.createElement('style'); st.id = 'dse-hfix70'; document.head.appendChild(st); } st.textContent = '#settingsPanel #tab-other .setting-row:has(#rBX)>label.toggle{margin-left:4.33em!important}#rBX{text-align:right!important}'; })();
