/* ============================================================
   EVAL1 v4.1.2 — fresh redesign (written from zero)
   Paste into eval console. Idempotent; disable() restores fully.
   Architecture:
     CORE · HOOKS · FETCH(bridges/coalescer) · PRICING · TOOLS
     · AGENTIC · MARKED · UI · API
   ============================================================ */
(() => {
'use strict';

/* ============================ CORE ============================ */
const VERSION = '4.1.6';
const NS = window.__eval1 = window.__eval1 || {};
const FIRST = !NS._v4;

const DEFAULTS = {
  mode:'auto', webSearch:true, webSearchStyle:'tools', showSearchTrace:true, paintIntervalMs:160,
  markedSrc:'https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.js',
  toolEchoCollapseChars:2000, thinkingHistory:'all', peakCounter:'off', toolFontScale:0.7,
  toolMaxTurns:100, toolMaxTurnsOn:true, autoTools:['tool_pricing'],
  evalToolVersion:'auto', evalToolNameOverride:'', evalToolNameOverrideOn:false,
  toolCostNote:true
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
    legacy:{ 'deepseek-v4-flash':{ inputCacheHit:2.8e-9, inputCacheMiss:1.4e-7, output:2.8e-7 }, 'deepseek-v4-pro':{ inputCacheHit:3.625e-9, inputCacheMiss:4.35e-7, output:8.7e-7 } },
    off:{ 'deepseek-v4-flash':{ inputCacheHit:7e-9, inputCacheMiss:2.2e-7, output:6.6e-7 }, 'deepseek-v4-pro':{ inputCacheHit:2.2e-8, inputCacheMiss:6.6e-7, output:1.98e-6 } },
    peak:{ 'deepseek-v4-flash':{ inputCacheHit:1.4e-8, inputCacheMiss:4.4e-7, output:1.32e-6 }, 'deepseek-v4-pro':{ inputCacheHit:4.4e-8, inputCacheMiss:1.32e-6, output:3.96e-6 } },
    windows:{ default:[[1,4],[6,10]], 'deepseek-v4-flash':[[1,4],[6,10]], 'deepseek-v4-pro':[[1,4],[6,10]] },
    epoch:EP
  };
  const modelWindows = m => (TAB.windows && (TAB.windows[m] || TAB.windows.default)) || [[1,4],[6,10]];
  const isPeak = (d, m) => { const h = new Date(d).getUTCHours(); return modelWindows(m).some(w => h >= w[0] && h < w[1]); };
  const priceAt = (m, d) => { d = d || Date.now(); if (!TAB.legacy[m]) return null; return d < EP ? Object.assign({}, TAB.legacy[m]) : Object.assign({}, (isPeak(d, m) ? TAB.peak : TAB.off)[m]); };
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
  /* register tool_pricing (always create __tools first so fresh pages get it) */
  window.__tools = window.__tools || {};
  window.__tools.tool_pricing = { auto:true,
    schema:{ type:'function', function:{ name:'tool_pricing', description:'Date-aware DeepSeek pricing engine. audit | price | install', parameters:{ type:'object', properties:{ action:{ type:'string' }, model:{ type:'string' }, date:{ type:'number' } }, required:['action'] } } },
    run: async a => { a = a || {}; if (a.action === 'audit') return PE.audit(); if (a.action === 'price') return { model:a.model, at:a.date || Date.now(), iso:new Date(a.date || Date.now()).toISOString(), peak:isPeak(a.date || Date.now()), price:priceAt(a.model, a.date || Date.now()) }; if (a.action === 'install') return { installed:install() }; throw Error('unknown action ' + a.action); }
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
const activeToolName = () => {
  const v = NS.config.evalToolVersion;
  if (v === 'off') return null;
  if (v === 'auto') return NS._lastEvalTool || toolNameForVersion(5);
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
        const d = window.__tools[name] || window.__tools['tool_eval_1'];
        if (!d || seen[name]) return;
        seen[name] = 1;
        list.push(toolSchema(name, d));
      };
      const tn = overrideToolName() || activeToolName();
      if (tn){ push(tn); NS._lastEvalTool = tn; }
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
    window.__dseCurrentMsg = node && node.id || null;
    try {
      const p = r.p, key = getApiKey(p.id), isStream = settings.streaming, modelId = r.m;
      const tools = resolveTools(r);
      const payload = Object.assign({}, r.request, { model:modelId, temperature:r.supportsTemperature === false ? void 0 : (r.temperature != null ? r.temperature : .7), stream:isStream });
      if (tools.length){ payload.tools = tools; if (!payload.tool_choice) payload.tool_choice = 'auto'; }
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
          const costParam = (toolCostOn && roundCostNum != null) ? { cost_of_this_tool_round_thinking_included: cs(roundCostNum) + (nCalls > 1 ? ('÷' + nCalls) : '') + ((() => { try { const m = typeof getCurrentModel === 'function' ? getCurrentModel() : ''; const PE = window.__pricingEngine; if (Date.now() < PE.EPOCH) return ''; const off = PE.tables && PE.tables.off && PE.tables.off[m]; const pk = PE.tables && PE.tables.peak && PE.tables.peak[m]; if (PE.isPeak(Date.now(), m) && pk && off && off.output) { const u = cumulativeUsage || {}; const hit = u.prompt_cache_hit_tokens ?? u.cache_read_input_tokens ?? 0, miss = u.prompt_cache_miss_tokens ?? u.input_tokens ?? u.prompt_tokens ?? 0, outN = u.completion_tokens ?? u.output_tokens ?? 0; const calc = t => (hit||0)*t.inputCacheHit + (miss||0)*t.inputCacheMiss + (outN||0)*t.output; const pc = calc(pk), oc = calc(off); if (oc > 0 && pc > 0) { const ratio = pc / oc; const nice = Math.abs(ratio - Math.round(ratio)) < 0.05; return ' (peak by ' + (nice ? Math.round(ratio) + 'x' : ratio.toFixed(2) + 'x') + ' off-peak)'; } } return ''; } catch(e){ return ''; } })()) } : null;
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
  const ws = PE && PE.windowsFor ? PE.windowsFor(mid) : [[1,4],[6,10]];
  const h = new Date().getUTCHours(), peak = ws.some(w => h >= w[0] && h < w[1]);
  let mh = false; try { if (PE && PE.tables) mh = !!(PE.tables.legacy && PE.tables.legacy[mid]) || !!(PE.tables.off && PE.tables.off[mid]) || !!(PE.tables.peak && PE.tables.peak[mid]); } catch(e){}
  const b = new Date(); let next = null;
  for (let i = 1; i <= 24 && !next; i++){ const hh = (h + i) % 24; if (ws.some(w => hh >= w[0] && hh < w[1]) !== peak){ const t = new Date(b); t.setUTCHours(hh, 0, 0, 0); if (t <= b) t.setUTCDate(t.getUTCDate() + 1); next = t; } }
  if (!next){ next = new Date(b); next.setUTCDate(next.getUTCDate() + 1); next.setUTCHours(0, 0, 0, 0); }
  window.__dsePeakState = { peak, modelHasPeak:mh, at:Date.now(), boundaryAt:next.getTime() };
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
  const m = NS.config.peakCounter || 'off', show = m !== 'off' && (m === 'next' || s.peak) && s.modelHasPeak;
  if (show){
    const ss = Math.ceil(ms / 1000), hh = Math.floor(ss / 3600), mi = Math.floor((ss % 3600) / 60), sc = ss % 60;
    const el = ensurePeakTimer();
    el.textContent = ('0' + hh).slice(-2) + ':' + ('0' + mi).slice(-2) + ':' + ('0' + sc).slice(-2);
    el.style.display = 'block'; el.style.color = s.peak ? 'var(--danger)' : '#e8e8e8';
  } else if (peakTimerEl) peakTimerEl.style.display = 'none';
};
function peakCounterStart(){ if (window.__dseCounterTick) return; computePeak(); applyPeakDisplay(); window.__dseCounterTick = setInterval(window.__dsePeakTick, 1000); }
function peakCounterStop(){ if (window.__dseCounterTick){ clearInterval(window.__dseCounterTick); window.__dseCounterTick = 0; } }
function applyPeakDisplay(){
  const s = window.__dsePeakState || computePeak();
  document.body.classList.toggle('dse-peak', !!(s.peak && s.modelHasPeak));
  if (window.__dsePeakTick) window.__dsePeakTick();
}
function peakRenderMake(next){ return function(){ const r = next.apply(this, arguments); applyPeakDisplay(); return r; }; }
const peakCostMake = next => function(version, raw, config, reportedExact){
  const r = next.apply(this, arguments);
  try { const PE = window.__pricingEngine, peak = PE && PE.isPeak ? PE.isPeak(new Date(), config && config.m) : false; version.metadata = version.metadata || {}; version.metadata.peakCost = !!(peak && __dseModelHasPeak(config && config.m)); } catch(e){}
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
  'About':'eval1 v4.1.0 — experimental controls. Persists via dse_eval1_config.',
  'API mode':'auto per-model routing · chat force chat · responses profiled models → /responses.',
  'Peak counter':'off / only till end peak / till next state — countdown to DeepSeek peak-pricing boundary.',
  'Web search':'Attach the server web_search tool where supported.',
  'Show 🔎 trace':'Print [web_search] query into thinking block + header count.',
  'Agentic tools':'Attach the active tool (tool_eval_5) + autoTools (tool_pricing) so the model can run JS.',
  'Tool block collapse':'Auto-collapse tool-echo code blocks over [amount] chars.',
  'Thinking history':'all / only when tools / off — whether reasoning is sent back to the API.',
  'Paint interval (ms)':'Delta-coalescer cadence for streaming UI updates.',
  'Status pill':'Header indicator; click cycles auto→chat→responses.',
  'Marked tables':'marked.js GFM renderer. Raw HTML NOT sanitized.',
  'Anthropic bridge':'DeepSeek chat → /anthropic/v1/messages with web_search_20250305.',
  'Streaming bridge':'Stream DeepSeek chat via anthropic SSE translation.',
  'Responses hybrid':'Chat → /responses for profiled models (deepseek-v4-*, gpt-5.6-*).',
  'Routing':'Where the next request goes given mode + toggles.',
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
    + row('About', '<span style="font-size:.68rem;color:var(--text-secondary)">v' + VERSION + '</span>')
    + row('API mode', sel('expMode', [{value:'auto',label:'auto'},{value:'chat',label:'chat'},{value:'responses',label:'responses'}], C.mode))
    + row('Peak counter', sel('expPeakCounter', [{value:'off',label:'off'},{value:'end',label:'only till end peak'},{value:'next',label:'till next state'}], C.peakCounter || 'off'))
    + row('Web search', tg('expWebSearch', C.webSearch))
    + row('Show 🔎 trace', tg('expShowTrace', C.showSearchTrace))
    + row('Agentic tools', tg('expTools', !!F.tools))
    + row('Tool round cost in its results', tg('expToolCost', C.toolCostNote !== false))
    + row('Tool block collapse', '<span style="display:inline-flex;align-items:center;gap:6px"><input type="number" id="expToolEchoCollapse" min="0" step="100" value="' + (C.toolEchoCollapseChars || 2000) + '" style="width:64px"' + ((C.toolEchoCollapseChars || 0) > 0 ? '' : ' disabled') + '>' + tg('expToolEchoCollapseOn', (C.toolEchoCollapseChars || 0) > 0) + '</span>')
    + row('Thinking history', sel('expThinkingHistory', [{value:'all',label:'all'},{value:'tools',label:'only when tools'},{value:'off',label:'off'}], C.thinkingHistory || 'all'))
    + row('Paint interval (ms)', '<input type="number" id="expPaint" min="40" step="10" value="' + C.paintIntervalMs + '" style="width:75px">')
    + row('Tool font scale', '<input type="number" id="expToolFontScale" min="0.01" max="2" step="0.05" value="' + (C.toolFontScale || 0.7) + '" style="width:64px">')
    + row('Eval tool version', '<select id="expEvalToolVersion"></select>')
    + row('Name override (cache mask)', '<span style="display:inline-flex;align-items:center;gap:6px">' + tg('expEvalToolNameOverrideOn', C.evalToolNameOverrideOn) + '<input type="text" id="expEvalToolNameOverride" placeholder="tool_eval_1" value="' + (C.evalToolNameOverride || 'tool_eval_1') + '" style="width:90px;box-sizing:content-box;min-width:90px;padding:4px 8px"></span>')
    + row('Tool limit per message', '<span style="display:inline-flex;align-items:center;gap:6px"><input type="number" id="expToolMaxTurns" min="1" step="1" value="' + (C.toolMaxTurns || 100) + '" style="width:64px">' + tg('expToolMaxTurnsOn', C.toolMaxTurnsOn !== false) + '</span>')
    + row('Status pill', tg('expPill', !!F.pill))
    + row('Marked tables', tg('expMarked', !!F.marked))
    + row('Anthropic bridge', tg('expAnthropic', !!F.anthropic))
    + row('Streaming bridge', tg('expBridgeStream', !!F.bridgeStream))
    + row('Responses hybrid', tg('expHybrid', !!F.hybrid))
    + row('Routing', '<span id="expRoute" style="font-size:.68rem;color:var(--text-secondary);font-family:monospace;overflow-wrap:anywhere"></span>')
    + '</div>';
  swarmTab.insertAdjacentHTML('afterend', html);
  const btn = document.querySelector('.tab-btn[data-tab="exp"]'); if (btn) btn._ = document.getElementById('tab-exp');
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
  if (selEl){ selEl.innerHTML = ''; const add = (val, label) => selEl.appendChild(new Option(label, val)); add('off', 'off'); add('auto', 'auto (last used)'); Object.keys(TOOL_VERSIONS).forEach(id => { const v = TOOL_VERSIONS[id]; add(id, (v.name || ('tool_eval_' + id)) + (v.desc ? ' (' + v.desc + ')' : '')); }); selEl.value = NS.config.evalToolVersion || 'auto'; }
  updateExpRoute();
}
function updateExpRoute(){
  const route = document.getElementById('expRoute'); if (!route) return;
  const m = NS.config.mode, parts = [];
  if (m === 'responses') parts.push('deepseek + gpt-5.6 → /responses');
  else if (m === 'chat') parts.push('all → chat (deepseek → anthropic bridge)');
  else parts.push('deepseek → anthropic bridge · openai profiled → /responses · others → chat');
  if (!NS.flags.anthropic) parts.push('anthropic OFF');
  if (!NS.flags.hybrid) parts.push('hybrid OFF');
  if (!NS.flags.tools) parts.push('tools OFF');
  route.textContent = parts.join(' · ');
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
    + '#expToolEchoCollapse,#msgCollapseSize,#blockCollapseSize{width:64px!important;box-sizing:border-box!important;padding:4px 8px!important}';
  document.head.appendChild(s);
})();
/* default code font scale 0.8 */
(() => { if (typeof settings !== 'undefined' && (settings.fontScale == null || settings.fontScale === 0.5)){ settings.fontScale = 0.8; const e = document.getElementById('fontScale'); if (e) e.value = '0.8'; document.documentElement.style.setProperty('--block-font-scale', '0.8'); } })();

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
})();
