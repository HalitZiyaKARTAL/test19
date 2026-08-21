/* =============================================================
   EVAL1 v4.1.0 — final-state redesign (replaces 43/44/45.js)
   Paste the WHOLE block into the app eval console. Idempotent.
   Single hook registry — full enable/disable symmetry, no
   layered wrappers, no one-shot guards, v3 leftovers auto-cleaned.
   ============================================================= */
(() => {
'use strict';

var VERSION = '4.1.0';
var NS = window.__eval1 = window.__eval1 || {};
var FIRST = !NS._v4;

/* ---------------- config ---------------- */
var DEFAULTS = {
  mode:'auto', webSearch:true, webSearchStyle:'tools', showSearchTrace:true, paintIntervalMs:160,
  markedSrc:'https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.js',
  toolEchoCollapseChars:2000, thinkingHistory:'all', peakCounter:'off', toolFontScale:0.7,
  toolMaxTurns:100, toolMaxTurnsOn:true, autoTools:['tool_pricing'], evalToolVersion:5, evalToolNameOverride:'', evalToolNameOverrideOn:false
};
NS.config = Object.assign({}, DEFAULTS, NS.config || {});
try { Object.assign(NS.config, JSON.parse(localStorage.getItem('dse_eval1_config') || '{}')); } catch(e){}
function save(){ try { localStorage.setItem('dse_eval1_config', JSON.stringify(NS.config)); } catch(e){} }

/* ---------------- flags (eval1b1..b6) ---------------- */
var FLAGS = ['marked','anthropic','hybrid','pill','bridgeStream','tools'];
NS.flags = NS.flags || {};
FLAGS.forEach(function(k,i){ NS.flags[k] = (window['eval1b' + (i+1)] ?? 1) ? 1 : 0; });
NS.stats = NS.stats || { transformed:0, passthrough:0, searchCalls:0, last:{} };

/* ---------------- utils ---------------- */
function warn(m){ try { console.warn('[eval1] ' + m); } catch(e){} }
function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function cloneHeaders(h){
  if (!h) return {};
  if (typeof Headers !== 'undefined' && h instanceof Headers){ var o = {}; h.forEach(function(v,k){ o[k] = v; }); return o; }
  var out = {}; for (var k in h) out[k] = h[k]; return out;
}
function encodeText(s){ return new TextEncoder().encode(s); }
function safeStr(v){
  try {
    if (v === undefined) return 'undefined';
    if (typeof v === 'bigint' || typeof v === 'symbol' || typeof v === 'function') return String(v);
    if (typeof v !== 'object' || v === null) return JSON.stringify(v);
    var seen = new WeakSet();
    return JSON.stringify(v, function(k,x){
      if (typeof x === 'bigint' || typeof x === 'symbol' || typeof x === 'function') return String(x);
      if (x && typeof x === 'object'){ if (seen.has(x)) return '[circular]'; seen.add(x); }
      return x;
    }, 2).slice(0, 20000) || 'undefined';
  } catch(e){ return String(v); }
}

/* ============================================================
   HOOK REGISTRY — the only patching mechanism.
   wrap/unwrap by id; restoreAll returns every binding to the
   original captured at first boot. No one-shot guards.
   ============================================================ */
var ORIG = NS._orig || {};
var BINDINGS = {
  executeAPI:            { get:function(){ return executeAPI; },            set:function(v){ executeAPI = v; } },
  buildAPIMessages:      { get:function(){ return buildAPIMessages; },      set:function(v){ buildAPIMessages = v; } },
  formatMarkdown:        { get:function(){ return formatMarkdown; },        set:function(v){ formatMarkdown = v; } },
  buildCodeBlockHTML:    { get:function(){ return buildCodeBlockHTML; },    set:function(v){ buildCodeBlockHTML = v; } },
  applyResponseMetadata: { get:function(){ return applyResponseMetadata; }, set:function(v){ applyResponseMetadata = v; } },
  renderFullChat:        { get:function(){ return renderFullChat; },        set:function(v){ renderFullChat = v; } }
};
var HOOKS = (function(){
  var layers = {};
  function install(name){
    var b = BINDINGS[name]; if (!b || !ORIG[name]) return;
    var fn = ORIG[name];
    (layers[name] || []).forEach(function(h){ fn = h.make(fn); });
    b.set(fn);
  }
  return {
    wrap: function(name, id, make){
      var l = layers[name] = layers[name] || [];
      if (l.some(function(h){ return h.id === id; })) return;
      l.push({ id: id, make: make }); install(name);
    },
    unwrap: function(name, id){
      var l = layers[name]; if (!l) return;
      var i = -1; l.forEach(function(h,j){ if (h.id === id) i = j; });
      if (i < 0) return; l.splice(i, 1); install(name);
    },
    restoreAll: function(){
      Object.keys(BINDINGS).forEach(function(name){ if (ORIG[name]) BINDINGS[name].set(ORIG[name]); });
      Object.keys(layers).forEach(function(k){ delete layers[k]; });
    },
    applied: function(name, id){ return !!((layers[name] || []).some(function(h){ return h.id === id; })); }
  };
})();

/* ---------- v3 leftovers cleanup (first v4 boot only) ---------- */
function cleanupV3(){
  try { if (String(NS.version || '').indexOf('3.') === 0 && typeof NS.disable === 'function') NS.disable(); } catch(e){}
  ['eval1Pill','expStyle','dse-codeblock-ux','dse-peak-ui','dse-peak-timer','dse-settings-fix','dse-exp-toolfix','dse-ui-collapser-fix','expPopupWrap'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.remove();
  });
  var tb = document.querySelector('.tab-btn[data-tab="exp"]'); if (tb) tb.remove();
  var tc = document.getElementById('tab-exp'); if (tc) tc.remove();
  if (window.__dseCounterTick){ clearInterval(window.__dseCounterTick); window.__dseCounterTick = 0; }
  ['__eval1_patched_v33','__dseBAMWrapped','__dseCurMsgHint','__dsePeakStampDone','__dseExpInfoDone','__dseVisHook',
   '__dseFullRenderL','__dseModelFlexObs','__dseCodeblockToggle','__dseBlockOverrides','__dseBlockKey','__dseBlockGet','__dseBlockSet',
   '__origBuildCodeBlockHTML','__origBuildAPIMessages','__origExecuteAPI','__dsePatchPopup','__dseModelHasPeak','__dseMarkPeakPills',
   '__dsePeakTick','__dsePeakState','__dseCurrentMsg'].forEach(function(k){ try { delete window[k]; } catch(e){ window[k] = undefined; } });
}
if (FIRST){
  cleanupV3();
  Object.keys(BINDINGS).forEach(function(k){
    try { ORIG[k] = BINDINGS[k].get(); } catch(e){ ORIG[k] = null; }
  });
  ORIG.fetch = (window.fetch && window.fetch.bind ? window.fetch.bind(window) : window.fetch);
  NS._orig = ORIG;
  NS._v4 = 1;
}

/* ============================================================
   FETCH LAYER — handler chain + shared SSE coalescer
   ============================================================ */
var HANDLERS = [];
function fetchInstall(){
  var chain = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
    var opts = init || {};
    var method = String(opts.method || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'POST') return ORIG.fetch.call(this, input, init);
    for (var i = 0; i < HANDLERS.length; i++){ var r = HANDLERS[i].fn.call(this, input, init, url, opts); if (r) return r; }
    return ORIG.fetch.call(this, input, init);
  };
  window.fetch = chain;
}
function fetchRestore(){ if (ORIG.fetch) window.fetch = ORIG.fetch; }
function addHandler(id, fn){ if (!HANDLERS.some(function(h){ return h.id === id; })){ HANDLERS.push({ id: id, fn: fn }); fetchInstall(); } }
function removeHandler(id){ var i = -1; HANDLERS.forEach(function(h,j){ if (h.id === id) i = j; }); if (i >= 0){ HANDLERS.splice(i, 1); fetchInstall(); } }

function makeCoalescedStream(sourceBody, translate){
  return new ReadableStream({
    start: function(controller){
      var reader = sourceBody.getReader(), decoder = new TextDecoder(), buffer = '', closed = false;
      var acc = { content:'', reasoning:'' }, timer = 0;
      function enqueue(text){ if (!closed) try { controller.enqueue(encodeText(text)); } catch(e){} }
      function flushAcc(){
        if (timer){ clearTimeout(timer); timer = 0; }
        if (acc.content || acc.reasoning){
          var delta = {}; if (acc.content) delta.content = acc.content; if (acc.reasoning) delta.reasoning_content = acc.reasoning;
          enqueue('data: ' + JSON.stringify({ choices:[{ delta: delta }] }) + '\n\n'); acc.content = ''; acc.reasoning = '';
        }
      }
      function scheduleFlush(){
        if (timer) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden'){ flushAcc(); return; }
        timer = setTimeout(function(){ timer = 0; flushAcc(); }, NS.config.paintIntervalMs);
      }
      function finish(){ if (closed) return; flushAcc(); enqueue('data: [DONE]\n\n'); closed = true; try { controller.close(); } catch(e){} }
      function handleBlock(block){
        var data = '';
        (block.split(/\r?\n/) || []).forEach(function(line){ if (line.indexOf('data:') === 0) data += (data ? '\n' : '') + line.slice(5).replace(/^\s+/, ''); });
        if (!data) return; if (data === '[DONE]'){ finish(); return; }
        var ev; try { ev = JSON.parse(data); } catch(e){ return; }
        var out; try { out = translate ? translate(ev) : ev; } catch(e){ out = { error: e }; }
        if (!out) return;
        if (out.error){
          if (out.usage){ flushAcc(); enqueue('data: ' + JSON.stringify({ choices:[{ delta:{} }], usage: out.usage }) + '\n\n'); }
          if (!closed){ closed = true; try { controller.error(out.error); } catch(e){} }
          return;
        }
        if (out.finish){
          if (out.usage){ flushAcc(); enqueue('data: ' + JSON.stringify({ choices:[{ delta:{} }], usage: out.usage }) + '\n\n'); }
          finish(); return;
        }
        var delta = (out.choices && out.choices[0] && out.choices[0].delta) || {};
        if (delta.content){ acc.content += delta.content; scheduleFlush(); }
        if (delta.reasoning_content){ acc.reasoning += delta.reasoning_content; scheduleFlush(); }
        if (delta.tool_calls){ flushAcc(); enqueue('data: ' + JSON.stringify(out) + '\n\n'); }
        if (out.usage){ flushAcc(); enqueue('data: ' + JSON.stringify({ choices:[{ delta:{} }], usage: out.usage }) + '\n\n'); }
      }
      function pump(){
        reader.read().then(function(res){
          if (closed){ try { reader.cancel(); } catch(e){} return; }
          if (res.done){ finish(); return; }
          buffer += decoder.decode(res.value, { stream:true });
          var m;
          while (!closed && (m = buffer.search(/\n\n|\r\n\r\n/)) !== -1){ var sep = buffer[m] === '\r' ? 4 : 2; handleBlock(buffer.slice(0, m)); buffer = buffer.slice(m + sep); }
          pump();
        }).catch(function(err){ if (!closed){ closed = true; try { controller.error(err); } catch(e){} } });
      }
      pump();
    }
  });
}

/* ---------- coalescer passthrough (any streaming chat) ---------- */
function coalescerHandler(input, init, url, opts){
  if (typeof opts.body !== 'string') return null;
  var payload; try { payload = JSON.parse(opts.body); } catch(e){ return null; }
  if (!(payload && payload.stream && Array.isArray(payload.messages) && /\/chat\/completions(\?|$)/.test(url))) return null;
  NS.stats.passthrough++; updateStats('chat', payload.model, url);
  return ORIG.fetch.call(this, input, init).then(function(upstream){
    if (!upstream.ok || !upstream.body) return upstream;
    return new Response(makeCoalescedStream(upstream.body, null), { status:200, headers:{ 'Content-Type':'text/event-stream' } });
  });
}

/* ============================================================
   ANTHROPIC BRIDGE (DeepSeek chat -> /anthropic/v1/messages)
   ============================================================ */
var ANTHROPIC_ENDPOINT = 'https://api.deepseek.com/anthropic/v1/messages';
var SEARCH_TOOL = { type:'web_search_20250305', name:'web_search' };
function textOf(content){
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content == null ? '' : String(content);
  return content.map(function(p){ return typeof p === 'string' ? p : (p && p.text) || ''; }).filter(Boolean).join('\n');
}
function toAnthropic(source){
  var system = [], messages = [];
  for (var i = 0; i < source.length; i++){
    var item = source[i];
    if (item.role === 'system' || item.role === 'developer'){ system.push(item.content || ''); continue; }
    var blocks = [], role = item.role === 'assistant' ? 'assistant' : 'user';
    if (item.role === 'tool'){ blocks.push({ type:'tool_result', tool_use_id:item.tool_call_id, content:String(item.content || '') }); role = 'user'; }
    else {
      if (item.role === 'assistant' && item.reasoning_content) blocks.push({ type:'thinking', thinking:String(item.reasoning_content) });
      if (item.content) blocks.push({ type:'text', text:String(item.content) });
      if (item.tool_calls && item.tool_calls.length) item.tool_calls.forEach(function(tc){
        if (tc.type === 'function'){ var parsedArgs = {}; try { parsedArgs = JSON.parse(tc.function.arguments || '{}'); } catch(e){}
          blocks.push({ type:'tool_use', id:tc.id, name:tc.function.name, input:parsedArgs }); }
      });
    }
    var prev = messages[messages.length - 1];
    if (prev && prev.role === role) prev.content = prev.content.concat(blocks);
    else messages.push({ role: role, content: blocks });
  }
  return { system: system.join('\n\n'), messages: messages };
}
function toUsage(raw){
  var hit = Number(raw && (raw.cache_read_input_tokens != null ? raw.cache_read_input_tokens : raw.prompt_cache_hit_tokens)) || 0;
  var creation = Number(raw && raw.cache_creation_input_tokens) || 0;
  var uncached = Number(raw && (raw.input_tokens != null ? raw.input_tokens : raw.prompt_cache_miss_tokens)) || 0;
  var output = Number(raw && (raw.output_tokens != null ? raw.output_tokens : raw.completion_tokens)) || 0;
  var prompt = uncached + hit + creation;
  return {
    prompt_tokens: prompt, completion_tokens: output, total_tokens: prompt + output,
    prompt_cache_hit_tokens: hit, prompt_cache_miss_tokens: uncached + creation,
    prompt_tokens_details: { cached_tokens: hit }, input_tokens: prompt, output_tokens: output,
    cache_read_input_tokens: hit, cache_creation_input_tokens: creation
  };
}
function toAnswer(data){
  var blocks = Array.isArray(data && data.content) ? data.content : [];
  return {
    content: blocks.filter(function(x){ return x && x.type === 'text'; }).map(function(x){ return x.text || ''; }).join(''),
    reasoning: blocks.filter(function(x){ return x && x.type === 'thinking'; }).map(function(x){ return x.thinking || x.text || ''; }).join(''),
    tool_uses: blocks.filter(function(x){ return x && (x.type === 'tool_use' || x.type === 'server_tool_use'); }),
    usage: toUsage(data && data.usage), stop: (data && data.stop_reason) || 'stop',
    searched: blocks.some(function(x){ return x && (x.type === 'tool_use' || x.type === 'server_tool_use') && (x.name === 'web_search' || (x.input && (x.input.type === 'web_search' || x.input.name === 'web_search'))); })
  };
}
function openAIJson(answer, model){
  var toolCalls = (answer.tool_uses || []).map(function(tu,i){ return { id: tu.id || ('call_' + i), type:'function', function:{ name:tu.name, arguments:JSON.stringify(tu.input || {}) } }; });
  var msg = { role:'assistant', content:answer.content, reasoning_content:answer.reasoning };
  if (toolCalls.length) msg.tool_calls = toolCalls;
  return { id:'chatcmpl-web-' + Date.now(), object:'chat.completion', created:Math.floor(Date.now()/1000), model:model,
    choices:[{ index:0, message:msg, finish_reason: answer.stop === 'max_tokens' ? 'length' : 'stop' }], usage:answer.usage };
}
function openAIStream(answer, model){
  var frames = []; function push(value){ frames.push('data: ' + JSON.stringify(value) + '\n\n'); }
  var base = { id:'chatcmpl-web-' + Date.now(), object:'chat.completion.chunk', created:Math.floor(Date.now()/1000), model:model };
  push(Object.assign({}, base, { choices:[{ index:0, delta:{ role:'assistant' }, finish_reason:null }] }));
  if (answer.reasoning) push(Object.assign({}, base, { choices:[{ index:0, delta:{ reasoning_content:answer.reasoning }, finish_reason:null }] }));
  if (answer.content) push(Object.assign({}, base, { choices:[{ index:0, delta:{ content:answer.content }, finish_reason:null }] }));
  push(Object.assign({}, base, { choices:[{ index:0, delta:{}, finish_reason: answer.stop === 'max_tokens' ? 'length' : 'stop' }], usage:answer.usage }));
  frames.push('data: [DONE]\n\n');
  return new ReadableStream({ start:function(controller){ for (var i = 0; i < frames.length; i++) controller.enqueue(encodeText(frames[i])); controller.close(); } });
}
function anthropicUsageToOpenAI(startUsage, deltaUsage){
  var hit = Number(startUsage && startUsage.cache_read_input_tokens) || 0;
  var creation = Number(startUsage && startUsage.cache_creation_input_tokens) || 0;
  var uncached = Number(startUsage && startUsage.input_tokens) || 0;
  var output = Number(deltaUsage && deltaUsage.output_tokens) || 0;
  var prompt = uncached + hit + creation;
  return {
    prompt_tokens: prompt, completion_tokens: output, total_tokens: prompt + output,
    prompt_cache_hit_tokens: hit, prompt_cache_miss_tokens: uncached + creation,
    prompt_tokens_details: { cached_tokens: hit }, input_tokens: prompt, output_tokens: output,
    cache_read_input_tokens: hit, cache_creation_input_tokens: creation
  };
}
function makeAnthropicTranslate(){
  var startUsage = null, searchedBlock = false, countedSearch = false, currentToolId = null, toolIndex = -1;
  return function(ev){
    switch (ev && ev.type){
      case 'message_start': if (ev.message && ev.message.usage) startUsage = ev.message.usage; return null;
      case 'content_block_start': {
        var cb = ev.content_block || {};
        if (cb.type === 'tool_use' || cb.type === 'server_tool_use'){
          if (cb.name === 'web_search' || (cb.input && (cb.input.type === 'web_search' || cb.input.name === 'web_search'))){
            if (!countedSearch){ NS.stats.searchCalls++; countedSearch = true; } searchedBlock = true;
          } else {
            toolIndex++; currentToolId = cb.id;
            return { choices:[{ delta:{ tool_calls:[{ index:toolIndex, id:cb.id, type:'function', function:{ name:cb.name, arguments:'' } }] } }] };
          }
        }
        return null;
      }
      case 'content_block_delta': {
        var d = ev.delta || {};
        if (d.type === 'thinking_delta') return { choices:[{ delta:{ reasoning_content: d.thinking || '' } }] };
        if (d.type === 'text_delta') return { choices:[{ delta:{ content: d.text || '' } }] };
        if (d.type === 'input_json_delta'){
          if (searchedBlock && NS.config.showSearchTrace){
            try { var j = JSON.parse(d.partial_json || '{}'); if (j.search_query){ searchedBlock = false; return { choices:[{ delta:{ reasoning_content:'[web_search] ' + j.search_query } }] }; } } catch(e){}
          } else if (currentToolId){ return { choices:[{ delta:{ tool_calls:[{ index:toolIndex, function:{ arguments: d.partial_json || '' } }] } }] }; }
        }
        return null;
      }
      case 'content_block_stop': currentToolId = null; searchedBlock = false; return null;
      case 'message_delta': {
        var inc = !!(ev.delta && ev.delta.stop_reason === 'max_tokens');
        var u = anthropicUsageToOpenAI(startUsage, ev.usage);
        return inc ? { error: Error('Incomplete — output truncated (max tokens)'), usage: u } : { finish:true, usage: u };
      }
      case 'message_stop': return { finish:true };
      default: return null;
    }
  };
}
function anthropicHandler(input, init, url, opts){
  if (NS.config.mode === 'responses') return null;
  if (!/api\.deepseek\.com\/?(?:v1\/)?chat\/completions(?:\?|$)/i.test(url)) return null;
  if (typeof opts.body !== 'string') return null;
  var original; try { original = JSON.parse(opts.body); } catch(e){ return null; }
  var headers = new Headers(opts.headers || (input && input instanceof Request ? input.headers : undefined));
  var key = (headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key) return null;
  var converted = toAnthropic(original.messages || []);
  var useStream = !!(NS.flags.bridgeStream && original.stream);
  var upstream = {
    model: original.model, messages: converted.messages, tools: [], stream: useStream,
    max_tokens: original.max_tokens != null ? original.max_tokens : (original.max_completion_tokens != null ? original.max_completion_tokens : 384000)
  };
  if (original.tools) original.tools.forEach(function(t){
    if (t.type === 'function') upstream.tools.push({ name:t.function.name, description:t.function.description || '', input_schema:t.function.parameters || { type:'object', properties:{} } });
  });
  if (NS.config.webSearch && !upstream.tools.some(function(t){ return t.name === 'web_search'; })) upstream.tools.push(SEARCH_TOOL);
  if (!upstream.tools.length) delete upstream.tools;
  if (converted.system) upstream.system = converted.system;
  ['temperature','top_p','thinking','reasoning_effort'].forEach(function(n){ if (original[n] != null) upstream[n] = original[n]; });
  var rInit = { method:'POST', headers:{ 'content-type':'application/json', 'authorization':'Bearer ' + key, 'x-api-key':key, 'anthropic-version':'2023-06-01' }, body: JSON.stringify(upstream), signal: opts.signal };
  return ORIG.fetch(ANTHROPIC_ENDPOINT, rInit).then(function(resp){
    updateStats('anthropic', original.model, ANTHROPIC_ENDPOINT);
    if (useStream){
      if (!resp.ok || !resp.body) return resp;
      return new Response(makeCoalescedStream(resp.body, makeAnthropicTranslate()), { status:200, headers:{ 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-cache' } });
    }
    return resp.text().then(function(rawText){
      if (!resp.ok) return new Response(rawText, { status:resp.status, statusText:resp.statusText, headers:{ 'content-type': resp.headers.get('content-type') || 'application/json' } });
      var data; try { data = JSON.parse(rawText); } catch(e){ throw Error('Anthropic endpoint invalid JSON: ' + rawText.slice(0, 500)); }
      var answer = toAnswer(data);
      if (answer.searched) NS.stats.searchCalls++;
      if (original.stream) return new Response(openAIStream(answer, original.model), { status:200, headers:{ 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-cache' } });
      return new Response(JSON.stringify(openAIJson(answer, original.model)), { status:200, headers:{ 'content-type':'application/json; charset=utf-8' } });
    });
  });
}

/* ============================================================
   RESPONSES HYBRID (chat -> /responses, stateless replay)
   ============================================================ */
var MODELS = {
  'deepseek-v4-pro':   { provider:'deepseek', path:'/responses', webSearch:true },
  'deepseek-v4-flash': { provider:'deepseek', path:'/responses', webSearch:true },
  'gpt-5.6-sol':       { provider:'openai',   path:'/responses', webSearch:true },
  'gpt-5.6-terra':     { provider:'openai',   path:'/responses', webSearch:true },
  'gpt-5.6-luna':      { provider:'openai',   path:'/responses', webSearch:true }
};
var PROVIDER_HOSTS = { deepseek:['api.deepseek.com'], openai:['api.openai.com'] };
var warned = {};
function resolvePlan(url, payload){
  if (NS.config.mode === 'chat') return null;
  var plan = MODELS[payload && payload.model];
  if (!plan){
    if (NS.config.mode === 'responses' && payload && payload.model && !warned[payload.model]){ warned[payload.model] = 1; warn('mode=responses but model not profiled: ' + payload.model + ' -> chat fallback.'); }
    return null;
  }
  if (!/\/chat\/completions(\?|$)/.test(url)) return null;
  var hosts = PROVIDER_HOSTS[plan.provider] || [];
  for (var i = 0; i < hosts.length; i++) if (url.indexOf(hosts[i]) !== -1) return plan;
  return null;
}
function buildResponsesRequest(chat, plan){
  var sys = [], input = [];
  (chat.messages || []).forEach(function(m){
    if (!m) return;
    if (m.role === 'system' || m.role === 'developer'){ sys.push(String(m.content || '')); return; }
    if (m.role === 'tool'){ input.push({ type:'function_call_output', call_id:m.tool_call_id, output:String(m.content || '') }); return; }
    if (m.role === 'assistant'){
      if (m.reasoning_content) input.push({ type:'reasoning', content:[{ type:'reasoning_text', text:String(m.reasoning_content) }] });
      if (m.content) input.push({ role:'assistant', content:String(m.content) });
      if (m.tool_calls && m.tool_calls.length) m.tool_calls.forEach(function(tc){
        if (tc.type === 'function') input.push({ type:'function_call', call_id:tc.id, name:tc.function.name, arguments:tc.function.arguments || '{}' });
      });
      return;
    }
    input.push({ role:'user', content:String(m.content || '') });
  });
  if (!input.length) return null;
  var req = { model: chat.model, input: input, stream: !!chat.stream };
  if (sys.length) req.instructions = sys.join('\n\n');
  var max = chat.max_tokens != null ? chat.max_tokens : chat.max_completion_tokens;
  if (max) req.max_output_tokens = max;
  if (typeof chat.temperature === 'number' && plan.provider !== 'deepseek') req.temperature = chat.temperature;
  if (NS.config.webSearch && plan.webSearch){
    if (NS.config.webSearchStyle === 'tool') req.tool = 'web_search';
    else req.tools = [{ type:'web_search' }];
  }
  if (chat.tools && chat.tools.length){
    var ft = chat.tools.filter(function(t){ return t && t.type === 'function'; }).map(function(t){
      return { type:'function', name:t.function.name, description:t.function.description || '', parameters:t.function.parameters || { type:'object', properties:{} } };
    });
    if (ft.length) req.tools = (req.tools || []).concat(ft);
  }
  return req;
}
function mapUsage(u){
  if (!u || typeof u !== 'object') return undefined;
  var o = {};
  if (typeof u.input_tokens === 'number') o.prompt_tokens = u.input_tokens;
  if (typeof u.output_tokens === 'number') o.completion_tokens = u.output_tokens;
  if (typeof u.total_tokens === 'number') o.total_tokens = u.total_tokens;
  if (u.input_tokens_details && typeof u.input_tokens_details.cached_tokens === 'number') o.prompt_tokens_details = { cached_tokens: u.input_tokens_details.cached_tokens };
  if (u.output_tokens_details && typeof u.output_tokens_details.reasoning_tokens === 'number') o.completion_tokens_details = { reasoning_tokens: u.output_tokens_details.reasoning_tokens };
  return Object.keys(o).length ? o : undefined;
}
/* fresh translator PER REQUEST — no shared mutable state; F4: route args deltas by output_index */
function makeResponsesTranslator(){
  var idx = 0, cur = -1; var oiMap = {};
  return function(ev){
    switch (ev && ev.type){
      case 'response.created': idx = 0; cur = -1; oiMap = {}; return null;
      case 'response.output_text.delta': return { choices:[{ delta:{ content: ev.delta || '' } }] };
      case 'response.reasoning_text.delta': return { choices:[{ delta:{ reasoning_content: ev.delta || '' } }] };
      case 'response.output_item.added': {
        var it = ev.item || {};
        if (it.type === 'function_call'){ cur = idx++; if (Number.isInteger(ev.output_index)) oiMap[ev.output_index] = cur; return { choices:[{ delta:{ tool_calls:[{ index:cur, id:it.call_id, type:'function', function:{ name:it.name, arguments:'' } }] } }] }; }
        return null;
      }
      case 'response.function_call_arguments.delta': {
        var i = (Number.isInteger(ev.output_index) && oiMap[ev.output_index] != null) ? oiMap[ev.output_index] : (cur < 0 ? 0 : cur);
        return { choices:[{ delta:{ tool_calls:[{ index:i, function:{ arguments: ev.delta || '' } }] } }] };
      }
      case 'response.output_item.done': {
        var item = ev.item || {};
        if (item.type === 'web_search_call'){ NS.stats.searchCalls++;
          if (NS.config.showSearchTrace){ var q = (item.action && (item.action.search_query || item.action.query)) || 'web search'; return { choices:[{ delta:{ reasoning_content:'[web_search] ' + q } }] }; } }
        return null;
      }
      case 'response.completed': { var u = ev.response && ev.response.usage, o; if (u && typeof u === 'object') o = mapUsage(u); return { finish:true, usage:o }; }
      case 'response.incomplete': return { error: Error('Incomplete — output truncated (max tokens)'), usage:null };
      case 'response.failed': return { error: Error((ev.response && ev.response.error && ev.response.error.message) || 'Responses request failed.') };
      default: return null;
    }
  };
}
function translateFinal(data, plan){
  var content = '', reasoning = '', toolCalls = [];
  (data.output || []).forEach(function(item){
    if (item && item.type === 'message' && Array.isArray(item.content)) item.content.forEach(function(c){ if (c && c.type === 'output_text') content += c.text || ''; });
    else if (item && item.type === 'reasoning'){ (item.summary || []).forEach(function(s){ if (s && s.type === 'summary_text') reasoning += s.text || ''; }); if (!reasoning && typeof item.encrypted_content === 'string') reasoning = '[encrypted reasoning]'; }
    else if (item && item.type === 'function_call'){ toolCalls.push({ id:item.call_id, type:'function', function:{ name:item.name, arguments:item.arguments || '{}' } }); }
    else if (item && item.type === 'web_search_call'){ NS.stats.searchCalls++; var q = item.action && (item.action.search_query || item.action.query); if (NS.config.showSearchTrace && q) reasoning += (reasoning ? '\n' : '') + '[web_search] ' + q; }
  });
  var status = data.status === 'failed' ? 'error' : (data.status === 'incomplete' ? 'length' : 'stop');
  var msg = { role:'assistant', content:content, reasoning_content:reasoning };
  if (toolCalls.length) msg.tool_calls = toolCalls;
  return { id:data.id, object:'chat.completion', created:Math.floor(Date.now()/1000), model:data.model || plan.model,
    choices:[{ index:0, message:msg, finish_reason:status }], usage:mapUsage(data.usage) };
}
function responsesHandler(input, init, url, opts){
  if (typeof opts.body !== 'string') return null;
  var payload; try { payload = JSON.parse(opts.body); } catch(e){ return null; }
  var plan = resolvePlan(url, payload);
  if (!plan) return null;
  var rReq = buildResponsesRequest(payload, plan);
  if (!rReq) return null;
  var base = url.replace(/\/chat\/completions(\?|$)/, '');
  var rUrl = base + plan.path;
  var rInit = {};
  for (var k in opts) if (k !== 'body') rInit[k] = opts[k];
  rInit.headers = cloneHeaders(opts.headers); rInit.headers['Content-Type'] = 'application/json'; rInit.body = JSON.stringify(rReq);
  return ORIG.fetch(rUrl, rInit).then(function(upstream){
    NS.stats.transformed++; updateStats('responses', payload.model, rUrl);
    if (!upstream.ok){ return upstream.text().then(function(text){ var msg = 'HTTP ' + upstream.status; try { var j = JSON.parse(text); if (j && j.error && j.error.message) msg += ': ' + j.error.message; } catch(e){} return new Response(JSON.stringify({ error:{ message:msg } }), { status:upstream.status, headers:{ 'Content-Type':'application/json' } }); }); }
    if (payload.stream && upstream.body){ return new Response(makeCoalescedStream(upstream.body, makeResponsesTranslator()), { status:200, headers:{ 'Content-Type':'text/event-stream' } }); }
    return upstream.json().then(function(data){
      if (data.status === 'failed'){ var em = (data.error && data.error.message) || 'Responses request failed.'; return new Response(JSON.stringify({ error:{ message:em } }), { status:400, headers:{ 'Content-Type':'application/json' } }); }
      return new Response(JSON.stringify(translateFinal(data, plan)), { status:200, headers:{ 'Content-Type':'application/json' } });
    });
  });
}

/* ============================================================
   PRICING ENGINE (date-aware, dynamic getters)
   ============================================================ */
(function(){
  var EP = 1786896000000; /* 2026-08-16T16:00:00Z */
  var TAB = {
    legacy: { 'deepseek-v4-flash': { inputCacheHit: 2.8e-9,   inputCacheMiss: 1.4e-7,  output: 2.8e-7  }, 'deepseek-v4-pro': { inputCacheHit: 3.625e-9, inputCacheMiss: 4.35e-7, output: 8.7e-7 } },
    off:    { 'deepseek-v4-flash': { inputCacheHit: 7e-9,     inputCacheMiss: 2.2e-7,  output: 6.6e-7  }, 'deepseek-v4-pro': { inputCacheHit: 2.2e-8,  inputCacheMiss: 6.6e-7,  output: 1.98e-6 } },
    peak:   { 'deepseek-v4-flash': { inputCacheHit: 1.4e-8,   inputCacheMiss: 4.4e-7,  output: 1.32e-6 }, 'deepseek-v4-pro': { inputCacheHit: 4.4e-8,  inputCacheMiss: 1.32e-6, output: 3.96e-6 } },
    windows: { default:[[1,4],[6,10]], 'deepseek-v4-flash':[[1,4],[6,10]], 'deepseek-v4-pro':[[1,4],[6,10]] },
    epoch: EP
  };
  function modelWindows(m){ return (TAB.windows && (TAB.windows[m] || TAB.windows.default)) || [[1,4],[6,10]]; }
  function isPeak(d, m){ var h = new Date(d).getUTCHours(); return modelWindows(m).some(function(w){ return h >= w[0] && h < w[1]; }); }
  function priceAt(m, d){ d = d || Date.now(); if (!TAB.legacy[m]) return null; if (d < EP) return Object.assign({}, TAB.legacy[m]); return Object.assign({}, (isPeak(d, m) ? TAB.peak : TAB.off)[m]); }
  function dyn(m){
    var o = {};
    Object.defineProperties(o, {
      inputCacheHit:  { get: function(){ return priceAt(m).inputCacheHit; },  enumerable: true, configurable: true },
      inputCacheMiss: { get: function(){ return priceAt(m).inputCacheMiss; }, enumerable: true, configurable: true },
      output:         { get: function(){ return priceAt(m).output; },         enumerable: true, configurable: true }
    });
    return o;
  }
  function install(){
    var t = [];
    function apply(root, label){ var fm = root && root.deepseek && root.deepseek.fallbackModels; if (!fm) return;
      Object.keys(TAB.legacy).forEach(function(m){ if (fm[m]){ fm[m].pricing = dyn(m); t.push(label + ':' + m); } }); }
    if (typeof providers !== 'undefined') apply(providers, 'providers');
    if (typeof default_providers !== 'undefined') apply(default_providers, 'defaults');
    return t;
  }
  try {
    var KEY = 'dse_providers', p = JSON.parse(localStorage.getItem(KEY) || '{}'); p.deepseek = p.deepseek || {}; p.deepseek.fallbackModels = p.deepseek.fallbackModels || {};
    Object.keys(TAB.legacy).forEach(function(m){
      if (!p.deepseek.fallbackModels[m]) p.deepseek.fallbackModels[m] = { maxTokens:384000, contextTokens:1000000, outputTokens:384000, temperature:1, request:{ thinking:{ type:'enabled' }, reasoning_effort:'max' } };
      p.deepseek.fallbackModels[m].pricing = TAB.peak[m];
    });
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch(e){}
  try { localStorage.setItem('dse_pricing_epochs', JSON.stringify(TAB)); } catch(e){}
  var PE = window.__pricingEngine = window.__pricingEngine || {};
  PE.EPOCH = EP; PE.tables = TAB; PE.isPeak = isPeak; PE.windowsFor = modelWindows; PE.priceAt = priceAt; PE.install = install; PE.current = priceAt;
  PE.audit = function(){
    var rows = [], counts = {};
    for (var pid in providers){ var po = providers[pid]; if (!po || pid === 'custom_template') continue; var base = default_providers[pid] || {};
      (modelEntries(po) || []).forEach(function(x){
        var mid = x[0], pricing = (modelDef(po, mid).pricing) || (modelDef(base, mid).pricing) || null, st;
        if (TAB.legacy[mid]){ var exp = priceAt(mid), eq = function(a,b){ return Math.abs((a || 0) - (b || 0)) < 1e-15; };
          st = (pricing && eq(pricing.inputCacheHit, exp.inputCacheHit) && eq(pricing.inputCacheMiss, exp.inputCacheMiss) && eq(pricing.output, exp.output)) ? 'correct' : 'wrong'; }
        else st = 'n_a';
        counts[st] = (counts[st] || 0) + 1;
        rows.push({ provider:pid, model:mid, status:st, stored: pricing ? { hit:pricing.inputCacheHit, miss:pricing.inputCacheMiss, out:pricing.output } : null, expected: TAB.legacy[mid] ? priceAt(mid) : null });
      });
    }
    return { context:{ now:new Date().toISOString(), utcHour:new Date().getUTCHours(), peakNow:isPeak(Date.now()) }, counts:counts, total:rows.length, rows:rows };
  };
  window.__tools = window.__tools || {}; if (window.__tools){
    window.__tools.tool_pricing={ auto:true,
      schema: { type:'function', function:{ name:'tool_pricing', description:'Date-aware DeepSeek pricing engine. audit | price | install', parameters:{ type:'object', properties:{ action:{ type:'string' }, model:{ type:'string' }, date:{ type:'number' } }, required:['action'] } } },
      run: async function(a){ a = a || {};
        if (a.action === 'audit') return PE.audit();
        if (a.action === 'price') return { model:a.model, at:a.date || Date.now(), iso:new Date(a.date || Date.now()).toISOString(), peak:isPeak(a.date || Date.now()), price:priceAt(a.model, a.date || Date.now()) };
        if (a.action === 'install') return { installed:install() };
        throw Error('unknown action ' + a.action);
      }
    };
  }
  var installed = install();
  console.log('[pricing] date-aware engine installed: ' + installed.join(', '));
})();

/* ============================================================
   TOOLS — eval worker, registry, schema guard, executor
   ============================================================ */
var evalWorker = function(code, timeout, signal){ return new Promise(function(resolve){
  try {
    if (signal && signal.aborted) return resolve({ ok:0, e:'aborted' });
    var src = 'self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:1,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:0,e:String(err&&err.stack||err)})}}';
    var w = new Worker(URL.createObjectURL(new Blob([src], { type:'text/javascript' })));
    var t = setTimeout(function(){ w.terminate(); resolve({ ok:0, e:'timeout' }); }, timeout);
    var abortHandler = function(){ clearTimeout(t); w.terminate(); resolve({ ok:0, e:'aborted' }); };
    if (signal) signal.addEventListener('abort', abortHandler);
    w.onmessage = function(e){ clearTimeout(t); if (signal) signal.removeEventListener('abort', abortHandler); w.terminate(); resolve(e.data); };
    w.onerror = function(err){ clearTimeout(t); if (signal) signal.removeEventListener('abort', abortHandler); w.terminate(); resolve({ ok:0, e:String(err.message || err) }); };
    w.postMessage(code);
  } catch(e){ resolve({ ok:0, e:String(e) }); }
}); };
window.__tools = window.__tools || {};
window.__tools.tool_eval_1 = {
  schema: { type:'function', function:{ name:'tool_eval_1', description:'Execute JavaScript in the browser. Returns JSON result. The last statement must be an expression to return a value (do NOT use console.log to return data). By default runs in isolated Web Worker. SET "worker": false if you need to access window, document, or DOM. You MAY issue multiple tool invokes with different names in one block — each becomes an independent execution; never merge or drop any.', parameters:{ type:'object', properties:{ code:{ type:'string', description:'JavaScript code to run.' }, timeout:{ type:'number' }, worker:{ type:'boolean', description:'false = full page DOM access. true = isolated worker (default)' } }, required:['code'] } } },
  run: async function(args, signal){
    var code = String(args && args.code != null ? args.code : ((args && args.expression) || '')).trim();
    var timeout = (args && args.timeout == null) ? 10000 : Math.max(1, Math.min(60000, Number(args && args.timeout) || 10000));
    var worker = !(args && args.worker === false);
    var t0 = performance.now();
    if (!code) return safeStr({ ok:false, error:'no code provided' });
    function done(r){
      var s = safeStr({ ok:!!r.ok, ms:Math.round(performance.now() - t0), ...(r.ok ? { result:r.r } : { error:r.e }) });
      try { if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'visible'){ var p = JSON.parse(s); if (p && typeof p === 'object'){ p.bg = true; p.note = 'tab hidden: wall-clock timers may be throttled'; s = JSON.stringify(p); } } } catch(e){}
      return s;
    }
    if (worker) return done(await evalWorker(code, timeout, signal));
    return new Promise(function(resolve){
      var done2 = false;
      var t = setTimeout(function(){ if (!done2){ done2 = true; resolve(done({ ok:0, e:'timeout' })); } }, timeout);
      var abortHandler = function(){ if (!done2){ done2 = true; clearTimeout(t); resolve(done({ ok:0, e:'aborted' })); } };
      if (signal) signal.addEventListener('abort', abortHandler);
      function fin(r){ if (done2) return; done2 = true; clearTimeout(t); if (signal) signal.removeEventListener('abort', abortHandler); resolve(done(r)); }
      try { Promise.resolve(eval(code)).then(function(r){ fin({ ok:1, r:r }); }, function(e){ fin({ ok:0, e:String(e && e.stack || e) }); }); }
      catch(e){ fin({ ok:0, e:String(e && e.stack || e) }); }
    });
  }
};
var TOOL_VERSIONS = NS._toolVersions || (NS._toolVersions = {
  1: { name:'tool_eval_1', desc:'3.3.2-era (original schema)' },
  2: { name:'tool_eval_2', desc:'capability-wording schema' },
  3: { name:'tool_eval_3', desc:'3.5.0 final worker-first' },
  4: { name:'tool_eval_4', desc:'40.js/41.js — current schema' },
  5: { name:'tool_eval_5', desc:'41.js — Bug #3 mixed-tool nudge schema' }
});
NS._toolSchemas = NS._toolSchemas || {};
function validToolSchema(s){
  var fn2 = s && s.function, params = fn2 && fn2.parameters;
  return !!(params && params.type === 'object' && params.properties && Array.isArray(params.required));
}
function activeToolName(){ var v = TOOL_VERSIONS[NS.config.evalToolVersion || 5]; return (v && v.name) || 'tool_eval_1'; }
function overrideToolName(){ return (NS.config.evalToolNameOverrideOn && NS.config.evalToolNameOverride) ? NS.config.evalToolNameOverride : ''; }
function toolSchema(name, def){ var s = (def && def.schema) || (window.__tools['tool_eval_1'] && window.__tools['tool_eval_1'].schema); if (s && s.function) s = Object.assign({}, s, { function:Object.assign({}, s.function, { name:name }) }); return s; }
function materializeTools(){
  var base = window.__tools && window.__tools['tool_eval_1']; if (!base) return;
  var names = {};
  Object.keys(TOOL_VERSIONS).forEach(function(id){ names[TOOL_VERSIONS[id].name] = TOOL_VERSIONS[id].name; });
  var ov = overrideToolName(); if (ov) names[ov] = ov;
  Object.keys(names).forEach(function(n){
    if (window.__tools[n]) return;
    var id = null; Object.keys(TOOL_VERSIONS).forEach(function(k){ if (TOOL_VERSIONS[k].name === n) id = k; });
    var stored = id != null ? NS._toolSchemas[id] : null;
    var schema = toolSchema(n, { schema: (stored && validToolSchema(stored)) ? stored : base.schema });
    window.__tools[n] = { schema: schema, run: base.run };
  });
}
NS.registerToolVersion = function(id, name, desc){ TOOL_VERSIONS[id] = { name:name, desc:desc || '' }; save(); return TOOL_VERSIONS; };
NS.setToolVersionSchema = function(id, schema){ if (validToolSchema(schema)) NS._toolSchemas[id] = clone(schema); return NS._toolSchemas; };
NS.setEvalToolVersion = function(v){ NS.config.evalToolVersion = +v || 1; save(); return NS.config.evalToolVersion; };
NS.setEvalToolNameOverride = function(n){ NS.config.evalToolNameOverride = String(n || '').trim(); save(); return NS.config.evalToolNameOverride; };
NS.setEvalToolNameOverrideOn = function(v){ NS.config.evalToolNameOverrideOn = !!v; save(); return NS.config.evalToolNameOverrideOn; };
NS._materializeToolAliases = materializeTools;
var execTool = async function(tc, signal){
  var name = tc.function && tc.function.name, def = window.__tools && window.__tools[name];
  var args = {}; try { args = JSON.parse((tc.function && tc.function.arguments) || '{}'); } catch(e){ args = { parseError:String(e), raw:(tc.function && tc.function.arguments) || '' }; }
  if (!def) return JSON.stringify({ ok:false, error:'unknown tool: ' + name });
  try { var out = await def.run(args, signal); return typeof out === 'string' ? out : JSON.stringify(out); }
  catch(e){ return JSON.stringify({ ok:false, error:String(e && e.stack || e) }); }
};
function addCumulativeUsage(acc, curr){
  if (!acc) return JSON.parse(JSON.stringify(curr || {}));
  if (!curr) return acc;
  var out = Object.assign({}, acc);
  ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens','cache_creation_input_tokens','cache_read_input_tokens','input_tokens','output_tokens'].forEach(function(k){ if (curr[k]) out[k] = (out[k] || 0) + curr[k]; });
  if (curr.prompt_tokens_details) out.prompt_tokens_details = Object.assign({}, (out.prompt_tokens_details || {}), { cached_tokens: ((out.prompt_tokens_details && out.prompt_tokens_details.cached_tokens) || 0) + ((curr.prompt_tokens_details.cached_tokens) || 0) });
  return out;
}
function hasToolsAtMessage(v){
  if (!v) return false;
  if (v.tool_calls && v.tool_calls.length) return true;
  if (Array.isArray(v._toolEvents)) return v._toolEvents.some(function(m){ return (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) || m.role === 'tool'; });
  return false;
}
function stripReasoning(m){ if (m && m.reasoning_content !== undefined){ var c = Object.assign({}, m); delete c.reasoning_content; return c; } return m; }

/* ============================================================
   AGENTIC — one buildAPIMessages hook + one executeAPI hook
   ============================================================ */
function bamMake(next){
  return function(targetPath, r, msgs){
    if (msgs) return next.call(this, targetPath, r, msgs);
    var rr = r || run(), mode = NS.config.thinkingHistory || 'all';
    var out = [{ role: rr.systemRole || 'system', content: 'You are a helpful assistant.' }];
    targetPath.forEach(function(n){
      if (!n || n.id === 'root' || n.role === 'system' || n.role === 'system-msg') return;
      var ver = n.versions[n.activeVersion || 0];
      var te = (ver._toolEvents && Array.isArray(ver._toolEvents)) ? ver._toolEvents.slice() : [];
      var wt = hasToolsAtMessage(ver);
      if (mode !== 'all') te = te.map(function(m){ return m.role === 'assistant' && (!(m.tool_calls && m.tool_calls.length) || mode === 'off') ? stripReasoning(m) : m; });
      if (te.length) out.push.apply(out, te);
      var fc = ver.llmContent;
      if (fc === undefined){ var last = (ver._toolEvents || []).filter(function(m){ return m.role === 'assistant'; }).pop(); fc = last && last.content ? last.content : ver.rawContent; }
      if (fc){
        var inc = mode === 'all' ? !!ver.thinking : (mode === 'tools' ? !!(ver.thinking && wt) : false);
        var msg = { role: n.role, content: fc }; if (inc) msg.reasoning_content = ver.thinking;
        out.push(msg);
      }
    });
    return rr.prompt ? out.concat({ role: rr.systemRole || 'system', content: rr.prompt }) : out;
  };
}
function agenticMake(next){
  return async function(messages, node, vIndex, controller, r){
    r = r || run();
    window.__dseCurrentMsg = node && node.id || null;
    try {
      var p = r.p, key = getApiKey(p.id), isStream = settings.streaming, modelId = r.m;
      var tools = [];
      if (Array.isArray(r.request && r.request.tools)) tools = r.request.tools;
      else if (typeof (r.request && r.request.tools) === 'string') tools = r.request.tools.split(/[,\s]+/).filter(Boolean).map(function(n){ return window.__tools && window.__tools[n] && window.__tools[n].schema; }).filter(Boolean);
      else if (!(r.request && ('tools' in r.request)) && NS.flags.tools){
        var _tn = activeToolName(), _ov = overrideToolName(); if (_ov) _tn = _ov;
        var _seen = {};
        function _pushTool(name){ var d = window.__tools[name] || window.__tools['tool_eval_1']; if (!d || _seen[name]) return; _seen[name] = 1; tools.push(toolSchema(name, d)); }
        _pushTool(_tn);
        (NS.config.autoTools || []).forEach(_pushTool);
        Object.keys(window.__tools || {}).forEach(function(n){ var t = window.__tools[n]; if (t && t.auto && n !== _tn) _pushTool(n); });
      }
      var payload = Object.assign({}, r.request, { model: modelId, temperature: r.supportsTemperature === false ? void 0 : (r.temperature != null ? r.temperature : .7), stream: isStream });
      if (tools.length){ payload.tools = tools; if (!payload.tool_choice) payload.tool_choice = 'auto'; }
      payload[p.maxTokensParam || 'max_tokens'] = r.maxTokens;
      if (isStream && p.supportsStreamUsage) payload.stream_options = { include_usage:true };
      node.versions[vIndex].startTime = Date.now();

      var toolEvents = [], callSeq = 0, epoch = Math.floor(Math.random()*1e8), uiContent = '', llmContent = '', uiThinking = '', cumulativeUsage = null, cumulativeExactCost = 0, msgSearchCount = 0;
      var maxTurns = NS.config.toolMaxTurns == null ? 100 : NS.config.toolMaxTurns;
      var turnsOn = NS.config.toolMaxTurnsOn !== false;

      for (var turn = 0; !turnsOn || turn < maxTurns; turn++){
        if (controller.signal.aborted) break;
        var reqMessages = messages.concat(toolEvents);
        if (llmContent) reqMessages.push({ role:'assistant', content: llmContent });
        var res = await fetch(p.baseURL + p.apiPath, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':(p.authHeader ? p.authHeader + ' ' : '') + key }, body: JSON.stringify(Object.assign({}, payload, { messages: reqMessages })), signal: controller.signal });
        if (!res.ok){ var body = (await res.text()).trim(); throw Error('HTTP ' + res.status + ' ' + body); }

        var applyUsage = function(envelope){
          var costBad = {}, next = r.usagePath === false ? envelope : r.usagePath ? at(envelope, r.usagePath) : (envelope && (envelope.usage ?? envelope.usageMetadata ?? (envelope.message && envelope.message.usage)));
          var rc = usageValue(envelope, r.usageCost, costBad);
          if (!costBad.value && rc !== undefined) cumulativeExactCost = (cumulativeExactCost || 0) + rc;
          if (next && typeof next === 'object') cumulativeUsage = addCumulativeUsage(cumulativeUsage, next);
          if (cumulativeUsage || cumulativeExactCost > 0) applyResponseMetadata(node.versions[vIndex], cumulativeUsage || {}, r, cumulativeExactCost || undefined);
        };

        var toolCalls = null, turnC = '', turnT = '';
        if (!isStream){
          var data = await res.json(); applyUsage(data);
          var msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
          if (msg.tool_calls && msg.tool_calls.length) toolCalls = msg.tool_calls;
          turnC = msg.content || ''; turnT = msg.reasoning_content || '';
        } else {
          var reader = res.body.getReader(), dec = new TextDecoder(), buf = '', first = true, lastR = 0, tAcc = [];
          var proc = function(line){
            if (!line.startsWith('data: ')) return;
            var js = line.slice(6).trim(); if (!js || js === '[DONE]') return;
            try {
              var d = JSON.parse(js), delta = (d.choices && d.choices[0] && d.choices[0].delta) || {};
              turnC += delta.content || ''; turnT += delta.reasoning_content || '';
              (delta.tool_calls || []).forEach(function(dtc){
                var i = dtc.index != null ? dtc.index : tAcc.length;
                var a = tAcc[i] || (tAcc[i] = { id:'', type:'function', function:{ name:'', arguments:'' } });
                if (dtc.id) a.id = dtc.id;
                if (dtc.function){ if (dtc.function.name) a.function.name += dtc.function.name; if (dtc.function.arguments) a.function.arguments += dtc.function.arguments; }
              });
              node.lastUpdateTime = Date.now();
              var v = node.versions[vIndex];
              v.rawContent = uiContent + turnC; v.thinking = uiThinking + turnT;
              if (first && (turnC || turnT || tAcc.length)){ if (node.activeVersion === vIndex) updateNodeDOM(node); first = false; handleNewContent(0, true); }
              if (!first && (turnC.length + turnT.length)){
                if (node.activeVersion === vIndex){
                  v.unread = false;
                  var l = turnC.length + turnT.length; handleNewContent(l - lastR, false); lastR = l;
                  var el = getMessageEl(node.id);
                  if (el){
                    var b = el.querySelector('.bubble'), cc = el.closest('.message').querySelector('.char-count');
                    var h = buildThinkingSection(v.thinking, node.id, true) + formatMarkdown(v.rawContent);
                    if (b && b.innerHTML !== h) b.innerHTML = h;
                    if (cc) cc.textContent = getMessageStatString(node, v);
                  }
                  scheduleTokenDisplayUpdate(turnC.length, turnT.length);
                } else {
                  var va = node.versions, a = node.activeVersion;
                  if ((va[a] && va[a].swarm && !va[a].endTime) || !v.unread) updateVersionDots(node, vIndex);
                }
                var sw = node.id + '|' + vIndex, now = Date.now();
                if (now - (lastBufferWrite[sw] || 0) > 500){ saveStreamBuffer(node, vIndex); lastBufferWrite[sw] = now; }
              }
              applyUsage(d);
            } catch(e){}
          };
          while (true){ var rd = await reader.read(); if (rd.done) break; buf += dec.decode(rd.value, { stream:true });
            var ls = buf.split('\n'); buf = ls.pop(); ls.forEach(proc); }
          if (buf.trim()) proc(buf.trim());
          if (tAcc.length) toolCalls = tAcc.filter(Boolean);
        }

        uiContent += turnC; uiThinking += turnT; llmContent += turnC;
        if (toolCalls && toolCalls.length){
          toolCalls = toolCalls.map(function(tc){ if (!tc || typeof tc !== 'object') tc = {}; tc.function = tc.function || {}; if (!tc.function.name) tc.function.name = activeToolName(); return tc; });
          if (controller.signal.aborted) break;
          toolCalls.forEach(function(tc){ if (!tc.id) tc.id = (String(node && node.id || '').split('(')[0] || 'call') + 't' + (++callSeq) + 'e' + epoch + '_' + (activeToolName() || (tc.function && tc.function.name) || 'tool').replace(/[^A-Za-z0-9_]/g, '_'); });
          toolEvents.push({ role:'assistant', content: turnC || null, reasoning_content: turnT || null, tool_calls: toolCalls });
          llmContent = '';
          if (toolCalls.some(function(tc){ return tc.function && /web_search/i.test(tc.function.name); })) toolCalls.forEach(function(tc){ if (tc.function && /web_search/i.test(tc.function.name)) msgSearchCount++; });
          var results = await Promise.all(toolCalls.map(async function(tc){ return { tc:tc, resStr: await execTool(tc, controller.signal) }; }));
          results.forEach(function(rs){
            uiContent += '\n\n```javascript\n// Executing: ' + (rs.tc.function && rs.tc.function.name) + '\n' + (rs.tc.function && rs.tc.function.arguments) + '\n```\n';
            toolEvents.push({ role:'tool', tool_call_id: rs.tc.id, content: rs.resStr });
            uiContent += '\n```json\n// Result\n' + rs.resStr + '\n```\n\n';
            node.versions[vIndex].rawContent = uiContent;
            if (node.activeVersion === vIndex) updateNodeDOM(node);
          });
          try { node.versions[vIndex].toolBatch = { requested:toolCalls.length, executed:results.length, names:results.map(function(r){ return (r.tc.function && r.tc.function.name) || '?'; }) }; } catch(e){}
          if (controller.signal.aborted) break;
          continue;
        }
        break;
      }

      node.versions[vIndex].rawContent = uiContent;
      node.versions[vIndex].llmContent = llmContent;
      node.versions[vIndex].thinking = uiThinking;
      if (msgSearchCount) node.versions[vIndex].searches = msgSearchCount;
      if (toolEvents.length > 0) node.versions[vIndex]._toolEvents = toolEvents;
      await saveStreamBuffer(node, vIndex);
      node.versions[vIndex].endTime = node.lastUpdateTime || Date.now();
      finalizeGeneration(node, vIndex, controller);
    } finally {
      window.__dseCurrentMsg = null;
    }
  };
}

/* ============================================================
   MARKED (GFM tables) — optional override
   ============================================================ */
var MARKED_CSS = '.bubble table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.85rem;overflow-x:auto;display:block}.bubble th,.bubble td{border:1px solid var(--border);padding:8px 12px;text-align:left}.bubble th{background:rgba(0,0,0,.3);font-weight:bold;color:var(--accent)}.bubble tbody tr:nth-child(even){background:rgba(0,0,0,.15)}';
function captureOrigMarkdown(){ if (!NS.origFormatMarkdown && typeof formatMarkdown === 'function') NS.origFormatMarkdown = formatMarkdown; }
function renderMarked(raw){
  var lib = window.marked;
  if (!lib || !raw) return NS.origFormatMarkdown ? NS.origFormatMarkdown(raw) : String(raw || '');
  try {
    var renderer = { code: function(token){
      var text = (token && token.text != null) ? token.text : String(token || '');
      var lang = (token && token.lang) || 'plain';
      var collapsed = !!(settings.blockAutoCollapse && text.length > settings.blockCollapseSize);
      return buildCodeBlockHTML(lang, text + '\n', collapsed);
    } };
    if (typeof lib.Marked === 'function') return new lib.Marked({ gfm:true, breaks:true, renderer:renderer }).parse(String(raw));
    if (typeof lib.parse === 'function'){ var r = new lib.Renderer(); r.code = renderer.code; return lib.parse(String(raw), { renderer:r, breaks:true, gfm:true }); }
  } catch(e){ warn('marked render failed: ' + e.message); }
  return NS.origFormatMarkdown ? NS.origFormatMarkdown(raw) : String(raw || '');
}
function injectMarkedCss(){ if (NS.markedCss) return; var s = document.createElement('style'); s.textContent = MARKED_CSS; document.head.appendChild(s); NS.markedCss = true; }
function loadMarked(){
  if (NS.markedReady) return Promise.resolve(true);
  if (NS.markedLoading) return NS.markedLoading;
  if (window.marked && (window.marked.parse || window.marked.Marked)){ NS.markedReady = true; return Promise.resolve(true); }
  NS.markedLoading = new Promise(function(resolve, reject){
    var s = document.createElement('script'); s.src = NS.config.markedSrc; s.crossOrigin = 'anonymous';
    s.onload = function(){ s.remove(); if (window.marked && (window.marked.parse || window.marked.Marked)) resolve(true); else reject(Error('marked unusable')); };
    s.onerror = function(){ s.remove(); reject(Error('marked blocked: ' + NS.config.markedSrc)); };
    document.head.appendChild(s);
  }).then(function(ok){ NS.markedReady = ok; NS.markedLoading = null; injectMarkedCss(); try { if (typeof renderFullChat === 'function') renderFullChat(); } catch(e){} return ok; })
    .catch(function(e){ NS.markedLoading = null; warn(e.message); return false; });
  return NS.markedLoading;
}
function markedMake(next){
  return function(raw){
    captureOrigMarkdown();
    if (!NS.flags.marked) return next.call(this, raw);
    return renderMarked(raw);
  };
}

/* ============================================================
   UI — status pill, code-block UX, peak display, Exp tab
   ============================================================ */
function updateStats(mode, model, url){ NS.stats.last = { mode:mode, model:model, url:url, ts:Date.now() }; }
function removeStatusPill(){ var el = document.getElementById('eval1Pill'); if (el) el.remove(); }
function ensureStatusPill(){
  var el = document.getElementById('eval1Pill');
  if (el) return el;
  el = document.createElement('span');
  el.id = 'eval1Pill';
  el.style.cssText = 'font-size:.68rem;padding:2px 8px;border-radius:6px;background:var(--border);color:var(--text-secondary);font-family:monospace;white-space:nowrap;cursor:help;';
  el.title = 'eval1 — click to cycle API mode';
  el.addEventListener('click', function(){
    var m = NS.config.mode === 'responses' ? 'chat' : (NS.config.mode === 'chat' ? 'auto' : 'responses');
    NS.config.mode = m; save(); updateStatus();
  });
  var hr = document.querySelector('.header-right');
  if (hr) hr.insertBefore(el, hr.firstChild);
  return el;
}
function updateStatus(){
  if (!NS.flags.pill){ removeStatusPill(); return; }
  var el = ensureStatusPill();
  var s = 'API ' + (NS.stats.last.mode || (NS.flags.hybrid ? NS.config.mode : 'off'));
  if (NS.stats.last.model) s += ' · ' + NS.stats.last.model;
  if (NS.stats.searchCalls && NS.config.showSearchTrace) s += ' · 🔎' + NS.stats.searchCalls;
  el.textContent = s;
  el.title = 'mode:' + NS.config.mode + (NS.stats.last.id ? ' · id:' + NS.stats.last.id : '') + ' · transformed:' + NS.stats.transformed + ' · passthrough:' + NS.stats.passthrough + ' · searchCalls:' + NS.stats.searchCalls;
}

/* --- code-block UX (collapse memory, tool-echo collapse, tool font) --- */
var blockOverrides = {}, blockOrder = [];
function blockKey(m, l, c){ return (m ? m + '::' : '') + (l || '') + '::' + String(c || '').slice(0, 80); }
function codeblockMake(next){
  return function(lang, c, collapsed){
    var cnt = String(c || ''), key = blockKey(window.__dseCurrentMsg || null, lang, cnt), ov = blockOverrides[key], eff = collapsed;
    if (ov === 'open') eff = false; else if (ov === 'close') eff = true;
    else if (NS.config.toolEchoCollapseChars != null && cnt.indexOf('// Executing:') === 0 && cnt.length > NS.config.toolEchoCollapseChars) eff = true;
    var html = next.call(this, lang, cnt, eff);
    if ((cnt.indexOf('// Executing:') === 0 || cnt.indexOf('// Result') === 0) && NS.config.toolFontScale){
      var prod = (typeof settings !== 'undefined' && settings.fontScale || 0.5) * NS.config.toolFontScale;
      html = html.replace('<div class="code-block">', '<div class="code-block" style="--block-font-scale:' + prod + '">');
    }
    return html;
  };
}
if (!window.__eval1_clickBound){
  window.__eval1_clickBound = true;
  document.addEventListener('click', function(e){
    var hf = e.target.closest && e.target.closest('.code-header, .code-footer'); if (!hf) return;
    if (e.target.closest('button') || e.target.closest('.block-arrow')) return;
    var bl = hf.closest('.code-block'), bd = bl && bl.querySelector('.code-body'); if (!bd) return;
    var ic = bd.classList.toggle('collapsed');
    bl.querySelectorAll('.down,.up').forEach(function(el){ el.classList.toggle('collapsed', ic); });
    var msg = hf.closest('.message'), mid = msg ? msg.dataset.msgId : (window.__dseCurrentMsg || null);
    var code = bl.querySelector('code'), pre = bl.querySelector('pre');
    blockOverrides[blockKey(mid, pre ? pre.dataset.lang : '', code ? code.textContent : '')] = ic ? 'close' : 'open';
    if (blockOrder.length > 400) delete blockOverrides[blockOrder.shift()];
    e.preventDefault();
  }, true);
}

/* --- peak display --- */
function computePeak(){
  var PE = window.__pricingEngine, mid = typeof getCurrentModel === 'function' ? getCurrentModel() : '';
  var ws = PE && PE.windowsFor ? PE.windowsFor(mid) : [[1,4],[6,10]];
  var h = new Date().getUTCHours(), peak = ws.some(function(w){ return h >= w[0] && h < w[1]; }), mh = false;
  try { if (PE && PE.tables) mh = !!(PE.tables.legacy && PE.tables.legacy[mid]) || !!(PE.tables.off && PE.tables.off[mid]) || !!(PE.tables.peak && PE.tables.peak[mid]); } catch(e){}
  var b = new Date(), next = null;
  for (var i = 1; i <= 24 && !next; i++){ var hh2 = (h + i) % 24;
    if (ws.some(function(w){ return hh2 >= w[0] && hh2 < w[1]; }) !== peak){
      var t = new Date(b); t.setUTCHours(hh2, 0, 0, 0); if (t <= b) t.setUTCDate(t.getUTCDate() + 1); next = t; } }
  if (!next){ next = new Date(b); next.setUTCDate(next.getUTCDate() + 1); next.setUTCHours(0, 0, 0, 0); }
  window.__dsePeakState = { peak:peak, modelHasPeak:mh, at:Date.now(), boundaryAt:next.getTime() };
}
function applyPeakDisplay(){
  var s = window.__dsePeakState || computePeak();
  document.body.classList.toggle('dse-peak', !!(s.peak && s.modelHasPeak));
  if (window.__dsePeakTick) window.__dsePeakTick();
}
var peakTimerEl = null;
function defPos(){ var te=document.getElementById('dse-peak-timer'); if(!te) return; var h=document.querySelector('.header h1'); if(h){ var rr=h.getBoundingClientRect(); te.style.left=(rr.left-5)+'px'; te.style.top=(rr.bottom+2)+'px'; return; } var cc=document.getElementById('chatContainer'); if(cc){ var cr=cc.getBoundingClientRect(); te.style.left=(cr.left+16)+'px'; te.style.top=(cr.top+16)+'px'; } }
function ensurePeakTimer(){
  if (peakTimerEl) return peakTimerEl;
  peakTimerEl = document.createElement('div');
  peakTimerEl.id = 'dse-peak-timer';
  peakTimerEl.style.cssText = 'position:absolute;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;font-weight:300;letter-spacing:1.2px;padding:0 2px;background:transparent;border:none;line-height:1;white-space:nowrap;cursor:grab;user-select:none;display:none;z-index:8990;pointer-events:auto;opacity:.8';
  document.body.appendChild(peakTimerEl); defPos();
  var dr = false, dx = 0, dy = 0;
  peakTimerEl.addEventListener('pointerdown', function(e){ dr = true; dx = e.clientX - peakTimerEl.getBoundingClientRect().left; dy = e.clientY - peakTimerEl.getBoundingClientRect().top; peakTimerEl.setPointerCapture(e.pointerId); peakTimerEl.style.cursor = 'grabbing'; e.preventDefault(); });
  peakTimerEl.addEventListener('pointermove', function(e){ if (!dr) return; peakTimerEl.style.left = (e.clientX - dx) + 'px'; peakTimerEl.style.top = (e.clientY - dy) + 'px'; });
  peakTimerEl.addEventListener('pointerup', function(){ dr = false; peakTimerEl.style.cursor = 'grab'; });
  return peakTimerEl;
}
window.__dsePeakTick = function(){
  var s = window.__dsePeakState;
  if (!s || !Number.isFinite(s.boundaryAt)){ computePeak(); s = window.__dsePeakState; }
  var ms = s.boundaryAt - Date.now();
  if (ms <= 0){ computePeak(); applyPeakDisplay(); return; }
  var m = NS.config.peakCounter || 'off', show = m !== 'off' && (m === 'next' || s.peak) && s.modelHasPeak;
  if (show){
    var ss = Math.ceil(ms / 1000), hh = Math.floor(ss / 3600), mi = Math.floor((ss % 3600) / 60), sc = ss % 60;
    var el = ensurePeakTimer();
    el.textContent = ('0' + hh).slice(-2) + ':' + ('0' + mi).slice(-2) + ':' + ('0' + sc).slice(-2);
    el.style.display = 'block'; el.style.color = s.peak ? 'var(--danger)' : '#e8e8e8';
  } else if (peakTimerEl) peakTimerEl.style.display = 'none';
};
function peakCounterStart(){ if (window.__dseCounterTick) return; computePeak(); applyPeakDisplay(); window.__dseCounterTick = setInterval(window.__dsePeakTick, 1000); }
function peakCounterStop(){ if (window.__dseCounterTick){ clearInterval(window.__dseCounterTick); window.__dseCounterTick = 0; } }
function peakRenderMake(next){ return function(){ var r = next.apply(this, arguments); applyPeakDisplay(); return r; }; }
function peakCostMake(next){
  return function(version, raw, config, reportedExact){
    var r = next.apply(this, arguments);
    try {
      var PE = window.__pricingEngine, peak = PE && PE.isPeak ? PE.isPeak(new Date(), config && config.m) : false;
      var modelPeak = !!window.__dseModelHasPeak(config && config.m);
      version.metadata = version.metadata || {}; version.metadata.peakCost = !!(peak && modelPeak);
    } catch(e){}
    return r;
  };
}
window.__dseModelHasPeak = function(modelId){
  try { var PE = window.__pricingEngine; if (!PE || !PE.tables || !modelId) return false;
    return !!(PE.tables.legacy && PE.tables.legacy[modelId]) || !!(PE.tables.off && PE.tables.off[modelId]) || !!(PE.tables.peak && PE.tables.peak[modelId]); } catch(e){ return false; }
};
window.__dseMarkPeakPills = function(){
  try {
    getRenderedMessageEls().forEach(function(el){
      var n = chatTree.nodes[el.dataset.msgId]; if (!n) return;
      var pill = el.querySelector('.cost-pill'); if (!pill) return;
      var v = n.versions[n.activeVersion || 0] || {}, isP;
      if (v.metadata && typeof v.metadata.peakCost === 'boolean') isP = v.metadata.peakCost;
      else {
        var model = (v.metadata && v.metadata.model) || '';
        if (!window.__dseModelHasPeak(model)) isP = false;
        else { var ms = ve(n), PE = window.__pricingEngine; isP = ms >= 1786896000000 && !!(PE && PE.isPeak && PE.isPeak(ms, model)); }
      }
      pill.classList.toggle('peak-cost', isP);
    });
  } catch(e){}
};
if (!window.__eval1_peakObs && typeof MutationObserver !== 'undefined'){
  window.__eval1_peakObs = true;
  new MutationObserver(function(){
    try { if (window.__dseMarkPeakPills) window.__dseMarkPeakPills(); } catch(e){}
    applyPeakDisplay();
  }).observe(document.getElementById('chatContainer') || document.body, { childList:true, subtree:true });
  var msEl = document.getElementById('modelSelect');
  if (msEl) msEl.addEventListener('change', function(){ computePeak(); applyPeakDisplay(); });
}

/* --- Exp tab (single builder + popups) --- */
var EXP_INFO = {
  'About': 'Experimental controls injected by eval1. Toggles map to <code>__eval1.setFlag(...)</code> / <code>__eval1.setMode(...)</code>. Persists via <code>dse_eval1_config</code>.',
  'API mode': '<b>auto</b> per-model routing · <b>chat</b> force chat · <b>responses</b> profiled models → /responses.',
  'Peak counter': 'off / only till end peak / till next state — countdown to DeepSeek peak-pricing boundary.',
  'Web search': 'Attach the server web_search tool where supported.',
  'Show 🔎 trace': 'Print [web_search] query into thinking block + header count.',
  'Agentic tools': 'Attach <code>TOOL</code> to chat requests so the model can execute JS in your browser.',
  'Tool block collapse': 'Auto-collapse tool-echo code blocks over [amount] chars; slider on/off.',
  'Thinking history': 'all / only when tools / off — whether reasoning is sent back to the API.',
  'Paint interval (ms)': 'Delta-coalescer cadence for streaming UI updates.',
  'Status pill': 'Header indicator; click cycles auto→chat→responses.',
  'Marked tables': 'marked.js GFM renderer. Raw HTML NOT sanitized.',
  'Anthropic bridge': 'DeepSeek chat → /anthropic/v1/messages with web_search_20250305.',
  'Streaming bridge': 'Stream DeepSeek chat via anthropic SSE translation.',
  'Responses hybrid': 'Chat → /responses for profiled models (deepseek-v4-*, gpt-5.6-*).',
  'Routing': 'Where the next request goes given mode + toggles.'
};
function popupHTML(text, title){
  var old = document.getElementById('expPopupWrap'); if (old) old.remove();
  var w = document.createElement('div'); w.id = 'expPopupWrap'; w.className = 'exp-popup-wrap';
  w.innerHTML = '<div class="exp-popup-backdrop"></div><div class="exp-popup"><div class="exp-popup-head"><span>' + esc(title) + '</span><button class="exp-popup-x" data-expx="1">×</button></div><div class="exp-popup-body">' + text + '</div><div class="exp-popup-foot"><button class="exp-popup-close" data-expx="1">Close</button></div></div>';
  document.body.appendChild(w);
  w.addEventListener('click', function(e){ if (e.target.closest('[data-expx]')){ w.remove(); return; } if (!e.target.closest('.exp-popup')) w.remove(); });
}
function infoBtn(label){
  var t = EXP_INFO[label] || label, tool = activeToolName();
  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'exp-info'; btn.title = label; btn.textContent = 'ⓘ';
  btn.addEventListener('click', function(ev){ ev.preventDefault(); ev.stopPropagation(); popupHTML(String(t).split('TOOL').join(tool), label); });
  return btn;
}
function rowHTML(label, control){ return '<div class="setting-row"><span>' + esc(label) + '</span>' + control + '</div>'; }
function toggleHTML(id, on){ return '<label class="toggle"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span class="slider"></span></label>'; }
function selectHTML(id, opts, val){ return '<select id="' + id + '">' + opts.map(function(o){ return '<option value="' + o.value + '"' + (o.value === val ? ' selected' : '') + '>' + o.label + '</option>'; }).join('') + '</select>'; }
function removeExpTab(){
  var b = document.querySelector('.tab-btn[data-tab="exp"]'); if (b) b.remove();
  var c = document.getElementById('tab-exp'); if (c) c.remove();
  var w = document.getElementById('expPopupWrap'); if (w) w.remove();
}
function buildExpTab(){
  removeExpTab();
  var swarmBtn = document.querySelector('.tab-btn[data-tab="swarm"]'), swarmTab = document.getElementById('tab-swarm');
  if (!swarmBtn || !swarmTab) return;
  swarmBtn.insertAdjacentHTML('afterend', '<button class="tab-btn" data-tab="exp">Exp</button>');
  var C = NS.config, F = NS.flags;
  var pcOpts = [{ value:'off', label:'off' }, { value:'end', label:'only till end peak' }, { value:'next', label:'till next state' }];
  var thOpts = [{ value:'all', label:'all' }, { value:'tools', label:'only when tools' }, { value:'off', label:'off' }];
  var html = '<div class="tab-content" id="tab-exp">'
    + rowHTML('About', '<span style="font-size:.68rem;color:var(--text-secondary)">v' + VERSION + '</span>')
    + rowHTML('API mode', selectHTML('expMode', [{ value:'auto', label:'auto' }, { value:'chat', label:'chat' }, { value:'responses', label:'responses' }], C.mode))
    + rowHTML('Peak counter', selectHTML('expPeakCounter', pcOpts, C.peakCounter || 'off'))
    + rowHTML('Web search', toggleHTML('expWebSearch', C.webSearch))
    + rowHTML('Show 🔎 trace', toggleHTML('expShowTrace', C.showSearchTrace))
    + rowHTML('Agentic tools', toggleHTML('expTools', !!F.tools))
    + rowHTML('Tool block collapse', '<span style="display:inline-flex;align-items:center;gap:6px"><input type="number" id="expToolEchoCollapse" min="0" step="100" value="' + (C.toolEchoCollapseChars || 2000) + '" style="width:64px"' + ((C.toolEchoCollapseChars || 0) > 0 ? '' : ' disabled') + '>' + toggleHTML('expToolEchoCollapseOn', (C.toolEchoCollapseChars || 0) > 0) + '</span>')
    + rowHTML('Thinking history', selectHTML('expThinkingHistory', thOpts, C.thinkingHistory || 'all'))
    + rowHTML('Paint interval (ms)', '<input type="number" id="expPaint" min="40" step="10" value="' + C.paintIntervalMs + '" style="width:75px">')
    + rowHTML('Tool font scale', '<input type="number" id="expToolFontScale" min="0.01" max="2" step="0.05" value="' + (C.toolFontScale || 0.7) + '" style="width:64px">')
    + rowHTML('Eval tool version', '<select id="expEvalToolVersion"></select>')
    + rowHTML('Name override (cache mask)', '<span style="display:inline-flex;align-items:center;gap:6px">' + toggleHTML('expEvalToolNameOverrideOn', C.evalToolNameOverrideOn) + '<input type="text" id="expEvalToolNameOverride" placeholder="tool_eval_1" value="' + (C.evalToolNameOverride || 'tool_eval_1') + '" style="width:90px;box-sizing:content-box;min-width:90px;padding:4px 8px"></span>')
    + rowHTML('Tool limit per message', '<span style="display:inline-flex;align-items:center;gap:6px"><input type="number" id="expToolMaxTurns" min="1" step="1" value="' + (C.toolMaxTurns || 100) + '" style="width:64px">' + toggleHTML('expToolMaxTurnsOn', C.toolMaxTurnsOn !== false) + '</span>')
    + rowHTML('Status pill', toggleHTML('expPill', !!F.pill))
    + rowHTML('Marked tables', toggleHTML('expMarked', !!F.marked))
    + rowHTML('Anthropic bridge', toggleHTML('expAnthropic', !!F.anthropic))
    + rowHTML('Streaming bridge', toggleHTML('expBridgeStream', !!F.bridgeStream))
    + rowHTML('Responses hybrid', toggleHTML('expHybrid', !!F.hybrid))
    + rowHTML('Routing', '<span id="expRoute" style="font-size:.68rem;color:var(--text-secondary);font-family:monospace;overflow-wrap:anywhere"></span>')
    + '</div>';
  swarmTab.insertAdjacentHTML('afterend', html);
  var btn = document.querySelector('.tab-btn[data-tab="exp"]'); if (btn) btn._ = document.getElementById('tab-exp');
  document.getElementById('tab-exp').querySelectorAll('.setting-row').forEach(function(r){
    var span = r.querySelector('span:first-child'); if (!span) return;
    span.appendChild(infoBtn(span.textContent.trim()));
  });
  function on(id, ev, fn){ var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }
  on('expMode', 'change', function(e){ NS.setMode(e.target.value); });
  on('expPeakCounter', 'change', function(e){ NS.setPeakCounter(e.target.value); });
  on('expWebSearch', 'change', function(e){ NS.setWebSearch(e.target.checked); });
  on('expShowTrace', 'change', function(e){ NS.setShowSearchTrace(e.target.checked); });
  on('expTools', 'change', function(e){ NS.setFlag('tools', e.target.checked ? 1 : 0); });
  on('expPaint', 'change', function(e){ var v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 40) NS.setPaintInterval(v); });
  on('expToolFontScale', 'change', function(e){ var v = parseFloat(e.target.value); if (Number.isFinite(v) && v > 0) NS.setToolFontScale(v); });
  on('expToolMaxTurns', 'change', function(e){ var v = parseInt(e.target.value, 10); if (Number.isFinite(v) && v >= 1) NS.setToolMaxTurns(v); });
  on('expToolMaxTurnsOn', 'change', function(e){ NS.setToolMaxTurnsOn(e.target.checked); });
  on('expEvalToolVersion', 'change', function(e){ NS.setEvalToolVersion(e.target.value); });
  on('expEvalToolNameOverride', 'change', function(e){ NS.setEvalToolNameOverride(e.target.value); });
  on('expEvalToolNameOverrideOn', 'change', function(e){ NS.setEvalToolNameOverrideOn(e.target.checked); });
  on('expPill', 'change', function(e){ NS.setFlag('pill', e.target.checked ? 1 : 0); });
  on('expMarked', 'change', function(e){ NS.setFlag('marked', e.target.checked ? 1 : 0); });
  on('expAnthropic', 'change', function(e){ NS.setFlag('anthropic', e.target.checked ? 1 : 0); });
  on('expBridgeStream', 'change', function(e){ NS.setFlag('bridgeStream', e.target.checked ? 1 : 0); });
  on('expHybrid', 'change', function(e){ NS.setFlag('hybrid', e.target.checked ? 1 : 0); });
  on('expThinkingHistory', 'change', function(e){ NS.setThinkingHistory(e.target.value); });
  on('expToolEchoCollapseOn', 'change', function(e){ NS.setToolEchoCollapse(e.target.checked ? 2000 : 0); var n = document.getElementById('expToolEchoCollapse'); if (n) n.disabled = !e.target.checked; });
  on('expToolEchoCollapse', 'change', function(e){ if (document.getElementById('expToolEchoCollapseOn').checked) NS.setToolEchoCollapse(parseInt(e.target.value, 10) || 2000); });
  var sel = document.getElementById('expEvalToolVersion');
  if (sel){ sel.innerHTML = ''; Object.keys(TOOL_VERSIONS).forEach(function(id){ var v = TOOL_VERSIONS[id]; sel.appendChild(new Option((v.name || ('tool_eval_' + id)) + (v.desc ? (' — ' + v.desc) : ''), id)); }); sel.value = NS.config.evalToolVersion || 1; }
  updateExpRoute();
}
function updateExpRoute(){
  var route = document.getElementById('expRoute'); if (!route) return;
  var m = NS.config.mode, parts = [];
  if (m === 'responses') parts.push('deepseek + gpt-5.6 → /responses');
  else if (m === 'chat') parts.push('all → chat (deepseek → anthropic bridge)');
  else parts.push('deepseek → anthropic bridge · openai profiled → /responses · others → chat');
  if (!NS.flags.anthropic) parts.push('anthropic OFF');
  if (!NS.flags.hybrid) parts.push('hybrid OFF');
  if (!NS.flags.tools) parts.push('tools OFF');
  route.textContent = parts.join(' · ');
}

/* --- consolidated UI styles --- */
(function(){
  if (document.getElementById('eval1-ui')) return;
  var s = document.createElement('style'); s.id = 'eval1-ui';
  s.textContent =
    '.exp-info{background:none;border:1px solid var(--border);color:var(--text-secondary);border-radius:50%;width:17px;height:17px;font-size:10px;line-height:1;padding:0;cursor:help;vertical-align:middle;margin-left:4px;flex-shrink:0}.exp-info:hover{background:var(--border);color:var(--text)}'
    + '.exp-popup-wrap{position:fixed;inset:0;z-index:8900;pointer-events:none}.exp-popup-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45);pointer-events:none}.exp-popup{position:absolute;top:max(64px,calc(env(safe-area-inset-top,0px) + 56px + 8px));left:50%;transform:translateX(-50%);width:min(540px,calc(100dvw - 24px));max-height:calc(100dvh - 120px);display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.6);pointer-events:auto;overflow:hidden}.exp-popup-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600;font-size:.85rem}.exp-popup-x{background:none;border:none;color:var(--text-secondary);font-size:1.2rem;cursor:pointer;line-height:1;padding:0 4px}.exp-popup-x:hover{color:var(--text)}.exp-popup-body{padding:12px 14px;overflow-y:auto;font-size:.78rem;line-height:1.6;color:var(--text)}.exp-popup-body code{background:var(--code-bg);padding:1px 5px;border-radius:4px;font-size:.72rem}.exp-popup-foot{padding:8px 14px;border-top:1px solid var(--border);display:flex;justify-content:flex-end}.exp-popup-close{background:var(--accent);color:#fff;border:none;padding:5px 14px;border-radius:8px;font-size:.75rem;cursor:pointer}'
    + '.code-header,.code-footer{cursor:pointer;user-select:none}.code-header button,.code-footer button{cursor:pointer}.block-arrow{display:inline-grid;place-content:center;min-width:24px;min-height:24px;padding:4px 8px;margin:-4px -8px;border-radius:4px}.block-arrow:hover{background:rgba(255,255,255,.08)}'
    + 'body.dse-peak .msg-stats .cost-pill{color:var(--danger)!important;font-weight:800!important}body.dse-peak .send-btn{-webkit-text-stroke:1px var(--danger);-webkit-text-fill-color:#fff;color:#fff}'
    + '.msg-stats .cost-pill.peak-cost{color:var(--danger)!important;font-weight:800!important}'
    + '.settings-panel{max-height:calc((100dvh - 56px - 96px) * 0.95)!important;overflow:hidden!important;padding-top:.6em!important;padding-bottom:.6em!important;padding-left:.9em!important;padding-right:.9em!important}.settings-panel>.tabs{flex-shrink:0!important;overflow:hidden!important;margin-bottom:.25em!important}.settings-panel>.tabs .tab-btn{padding:.15em .3em!important;font-size:.75rem!important;display:inline!important}.settings-panel>.tab-content{display:none!important;flex-direction:column!important;min-height:0!important}.settings-panel>.tab-content.active{display:flex!important;flex:1 1 auto!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-gutter:stable!important;padding:4px 12px 4px 4px!important;gap:8px!important}.settings-panel>#applySettingsBtn{flex-shrink:0!important;margin-top:8px!important}.settings-panel select{field-sizing:content!important;min-width:0!important;flex:0 1 auto!important}.settings-panel .setting-row select{margin-left:auto!important}.settings-panel .setting-row>span:last-child{margin-left:auto!important}.settings-panel input:not([type="checkbox"]):not([type="file"]):not([type="range"]),.settings-panel textarea:not(.xt),.input-area textarea{box-sizing:content-box!important;padding-right:calc(10% + 3ch)!important}.settings-panel input[type="password"]{padding-left:8px!important}.settings-panel .setting-row:has(.toggle):not(:has(input:not([type="checkbox"]),select,textarea)){padding-right:0!important}#tab-model{padding-right:.3em!important}#modelSelect{align-self:stretch!important;width:100%!important}#providerSelect{width:auto!important;min-width:0!important;margin-left:0!important}#aL .ar,#swarmRows .ar{grid-template-columns:auto minmax(0,1fr) auto!important;column-gap:8px!important;padding:2px 8px!important;min-height:34px!important;border-radius:8px!important}#aL .ag{display:flex!important;flex-wrap:nowrap!important;align-items:center!important;gap:4px!important;overflow:hidden!important}#aL .af{display:inline-flex!important;align-items:center!important;gap:2px!important;font-size:10px!important;flex-shrink:1!important;min-width:0!important}#aL .xt{height:24px!important;min-height:24px!important;max-height:24px!important;field-sizing:fixed!important;padding:0 4px!important;line-height:24px!important;font-size:11px!important;overflow:hidden!important}#aL .ar b{font-size:11px!important;white-space:nowrap!important;align-self:center!important}#tab-swarm>.tabs{margin:0!important}#tab-swarm{gap:.2em!important}'
    + '#expToolEchoCollapse,#msgCollapseSize,#blockCollapseSize{width:64px!important;box-sizing:border-box!important;padding:4px 8px!important}';
  document.head.appendChild(s);
})();
(function(){ /* default code font scale 0.8 (was 0.5) */
  if (typeof settings === 'undefined') return;
  if (settings.fontScale == null || settings.fontScale === 0.5){
    settings.fontScale = 0.8;
    var e = document.getElementById('fontScale'); if (e) e.value = '0.8';
    document.documentElement.style.setProperty('--block-font-scale', '0.8');
  }
})();

/* ============================================================
   API + BOOT
   ============================================================ */
function apply(){
  FLAGS.forEach(function(k,i){ window['eval1b' + (i+1)] = NS.flags[k]; });
  HOOKS.wrap('buildAPIMessages', 'eval1-bam', bamMake);
  HOOKS.wrap('executeAPI', 'eval1-agentic', agenticMake);
  HOOKS.wrap('buildCodeBlockHTML', 'eval1-codeblock', codeblockMake);
  HOOKS.wrap('applyResponseMetadata', 'eval1-peakcost', peakCostMake);
  HOOKS.wrap('renderFullChat', 'eval1-peak', peakRenderMake);
  if (NS.flags.marked){ captureOrigMarkdown(); HOOKS.wrap('formatMarkdown', 'eval1-marked', markedMake); loadMarked(); }
  else HOOKS.unwrap('formatMarkdown', 'eval1-marked');
  if (NS.flags.anthropic) addHandler('anthropic', anthropicHandler); else removeHandler('anthropic');
  if (NS.flags.hybrid){ addHandler('responses', responsesHandler); addHandler('coalescer', coalescerHandler); }
  else { removeHandler('responses'); removeHandler('coalescer'); }
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
  var te = document.getElementById('dse-peak-timer'); if (te) te.remove(); peakTimerEl = null;
  NS.installed = false;
}
NS.apply = apply; NS.disable = disable;
NS.setFlag = function(name, val){ if (FLAGS.indexOf(name) < 0) throw Error('unknown flag: ' + name); NS.flags[name] = val ? 1 : 0; apply(); return JSON.parse(JSON.stringify(NS.flags)); };
NS.set = function(k, v){
  var d = SETTERS[k]; if (!d) throw Error('unknown setting: ' + k);
  if (d.vals && d.vals.indexOf(v) < 0) throw Error('invalid value: ' + v);
  if (d.bool) v = !!v;
  else if (d.num){ v = +v; if (!Number.isFinite(v)) v = (d.def != null ? d.def : 0); if (d.min != null) v = Math.max(d.min, v); if (d.max != null) v = Math.min(d.max, v); }
  else if (d.str) v = String(v).trim();
  NS.config[k] = v; save();
  if (d.apply) d.apply(v);
  return NS.config[k];
};
var SETTERS = {
  mode: { vals:['auto','chat','responses'], apply:function(){ updateStatus(); updateExpRoute(); } },
  webSearch: { bool:1, apply:updateStatus },
  showSearchTrace: { bool:1, apply:updateStatus },
  paintInterval: { num:1, def:160, min:40 },
  thinkingHistory: { vals:['all','tools','off'] },
  toolEchoCollapse: { num:1, def:0, min:0 },
  toolFontScale: { num:1, def:0.7, min:0.01, max:2 },
  toolMaxTurns: { num:1, def:0, min:0 },
  toolMaxTurnsOn: { bool:1 },
  peakCounter: { vals:['off','end','next'], apply:function(v){ if (v !== 'off') peakCounterStart(); else peakCounterStop(); applyPeakDisplay(); } },
  evalToolVersion: { num:1, def:1, min:1 },
  evalToolNameOverride: { str:1 },
  evalToolNameOverrideOn: { bool:1 }
};
['mode','webSearch','showSearchTrace','paintInterval','thinkingHistory','toolEchoCollapse','toolFontScale','toolMaxTurns','toolMaxTurnsOn','peakCounter','evalToolVersion','evalToolNameOverride','evalToolNameOverrideOn'].forEach(function(k){ NS['set' + k[0].toUpperCase() + k.slice(1)] = function(v){ return NS.set(k, v); }; });
NS.status = function(){ return JSON.parse(JSON.stringify({ version:VERSION, flags:NS.flags, config:NS.config, stats:NS.stats, installed:NS.installed })); };
NS.auditPricing = function(){ var PE = window.__pricingEngine; return PE && PE.audit ? PE.audit() : null; };
NS.removeExpTab = removeExpTab; NS._rebuildExpTab = buildExpTab; NS._materializeToolAliases = materializeTools;
NS._internals = { addCumulativeUsage:addCumulativeUsage, buildResponsesRequest:buildResponsesRequest, toAnthropic:toAnthropic,
  makeAnthropicTranslate:makeAnthropicTranslate, makeResponsesTranslator:makeResponsesTranslator, mapUsage:mapUsage };
NS.version = VERSION;
apply();
console.log('[eval1 v' + VERSION + '] installed');
})();
