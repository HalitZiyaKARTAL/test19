/* =============================================================
   EVAL1 v2.5 — all-in-one upgrade for the AI Chat app (single file)
   -------------------------------------------------------------
   Paste the WHOLE file into the app's eval console (Settings → Other
   → Eval console → open console → Run). Idempotent: safe to re-paste.

   Flags (set BEFORE pasting, or via __eval1.setFlag / Exp tab):
     eval1b1 marked tables/GFM
     eval1b2 anthropic web-search bridge
     eval1b3 responses hybrid + coalescer
     eval1b4 status pill
     eval1b5 STREAMING anthropic bridge
     eval1b6 tool_eval_1 (chat model can run JS in browser)
     eval1b7 DeepSeek peak/off-peak pricing (message-send-time based)
   -------------------------------------------------------------
   v2.5 changes:
     - tool_eval_1 uses the exact working implementation you sent
     - /responses adapter now has a function_call/function_call_output
       executor loop, so tool_eval_1 works in responses mode too
     - DeepSeek pricing = peak/off-peak by UTC hour at send time
       (no legacy/epoch switching; new rates only)
   ============================================================= */
var eval1b1 = window.eval1b1 ?? 1; /* marked */
var eval1b2 = window.eval1b2 ?? 1; /* anthropic web search */
var eval1b3 = window.eval1b3 ?? 1; /* responses hybrid + coalescer */
var eval1b4 = window.eval1b4 ?? 1; /* status pill */
var eval1b5 = window.eval1b5 ?? 1; /* STREAMING anthropic bridge */
var eval1b6 = window.eval1b6 ?? 1; /* tool_eval_1 */
var eval1b7 = window.eval1b7 ?? 1; /* deepseek peak/off-peak pricing */

/* ===================== PART 1 — CORE ===================== */
(function(){
'use strict';
var NS = window.__eval1 || (window.__eval1 = {});
var FIRST = !NS.installed;

if (FIRST){
  try { if (window.__hybridUpgrade && window.__hybridUpgrade.disable) window.__hybridUpgrade.disable(); } catch(e){}
  try { if (window.DeepSeekWebSearch && window.DeepSeekWebSearch.restore) window.DeepSeekWebSearch.restore(); } catch(e){}
  NS.version = '2.5';
  NS.origFetch = (window.fetch || fetch).bind(window);
  NS.installed = false;
  NS.flags = {};
  NS.stats = { transformed:0, passthrough:0, searchCalls:0, toolCalls:0, last:{} };
  NS.config = {
    mode:'auto', webSearch:true, webSearchStyle:'tools',
    showSearchTrace:true, paintIntervalMs:160,
    markedSrc:'https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.js'
  };
  try {
    var saved = JSON.parse(localStorage.getItem('dse_eval1_config') || '{}');
    for (var sk in saved) NS.config[sk] = saved[sk];
  } catch(e){}
} else if (!NS.installed){
  NS.origFetch = (window.fetch || fetch).bind(window);
}
NS.version = '2.5';

(function(){
  var defs = { marked:eval1b1, anthropic:eval1b2, hybrid:eval1b3, pill:eval1b4, bridgeStream:eval1b5, toolEval:eval1b6, pricing:eval1b7 };
  for (var k in defs) NS.flags[k] = defs[k] ? 1 : 0;
})();

function saveConfig(){ try { localStorage.setItem('dse_eval1_config', JSON.stringify(NS.config)); } catch(e){} }
function warn(msg){ try { console.warn('[eval1] ' + msg); } catch(e){} }
function updateStats(mode, model, url){
  NS.stats.last = { mode: mode, model: model, url: url, ts: Date.now() };
}

/* ---------- status pill ---------- */
function removeStatusPill(){ var el = document.getElementById('eval1Pill'); if (el) el.remove(); }
function ensureStatusPill(){
  var el = document.getElementById('eval1Pill');
  if (el) return el;
  el = document.createElement('span');
  el.id = 'eval1Pill';
  el.style.cssText = 'font-size:.68rem;padding:2px 8px;border-radius:6px;background:var(--border);color:var(--text-secondary);font-family:monospace;white-space:nowrap;cursor:help;';
  el.title = 'eval1 — click to cycle hybrid API mode';
  el.addEventListener('click', function(){
    var m = NS.config.mode === 'responses' ? 'chat' : (NS.config.mode === 'chat' ? 'auto' : 'responses');
    NS.config.mode = m; saveConfig(); updateStatus();
    console.log('[eval1] mode -> ' + m);
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
  if (NS.stats.toolCalls) s += ' · 🔧' + NS.stats.toolCalls;
  el.textContent = s;
  el.title = 'mode:' + NS.config.mode +
    (NS.stats.last.id ? ' · id:' + NS.stats.last.id : '') +
    ' · transformed:' + NS.stats.transformed +
    ' · passthrough:' + NS.stats.passthrough +
    ' · searchCalls:' + NS.stats.searchCalls +
    ' · toolCalls:' + NS.stats.toolCalls;
}

/* ---------- shared helpers ---------- */
function cloneHeaders(h){
  if (!h) return {};
  if (typeof Headers !== 'undefined' && h instanceof Headers){
    var o = {}; h.forEach(function(v,k){ o[k] = v; }); return o;
  }
  var out = {}; for (var k in h) out[k] = h[k]; return out;
}
function encodeText(s){ return new TextEncoder().encode(s); }

/* ---------- anthropic web-search bridge (streaming + non-streaming) ---------- */
var ANTHROPIC_ENDPOINT = 'https://api.deepseek.com/anthropic/v1/messages';
var SEARCH_TOOL = { type:'web_search_20250305', name:'web_search', max_uses:3 };
function textOf(content){
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content == null ? '' : String(content);
  return content.map(function(p){ return typeof p === 'string' ? p : (p && p.text) || ''; }).filter(Boolean).join('\n');
}
function toAnthropic(source){
  var system = [], messages = [];
  for (var i = 0; i < source.length; i++){
    var item = source[i];
    var content = textOf(item && item.content);
    if (!content) continue;
    if (item.role === 'system' || item.role === 'developer'){ system.push(content); continue; }
    var role = item.role === 'assistant' ? 'assistant' : 'user';
    var prev = messages[messages.length - 1];
    if (prev && prev.role === role) prev.content += '\n\n' + content;
    else messages.push({ role: role, content: content });
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
    prompt_tokens_details: { cached_tokens: hit },
    input_tokens: prompt, output_tokens: output,
    cache_read_input_tokens: hit, cache_creation_input_tokens: creation
  };
}
function toAnswer(data){
  var blocks = Array.isArray(data && data.content) ? data.content : [];
  return {
    content: blocks.filter(function(x){ return x && x.type === 'text'; })
                   .map(function(x){ return x.text || ''; }).join(''),
    reasoning: blocks.filter(function(x){ return x && x.type === 'thinking'; })
                     .map(function(x){ return x.thinking || x.text || ''; }).join(''),
    usage: toUsage(data && data.usage),
    stop: (data && data.stop_reason) || 'stop',
    searched: blocks.some(function(x){
      return x && (x.type === 'tool_use' || x.type === 'server_tool_use') &&
             (x.name === 'web_search' ||
              (x.input && (x.input.type === 'web_search' || x.input.name === 'web_search')));
    })
  };
}
function openAIJson(answer, model){
  return {
    id: 'chatcmpl-web-' + Date.now(), object: 'chat.completion',
    created: Math.floor(Date.now() / 1000), model: model,
    choices: [{ index: 0, message: { role: 'assistant', content: answer.content, reasoning_content: answer.reasoning }, finish_reason: answer.stop === 'max_tokens' ? 'length' : 'stop' }],
    usage: answer.usage
  };
}
function openAIStream(answer, model){
  var frames = [];
  function push(value){ frames.push('data: ' + JSON.stringify(value) + '\n\n'); }
  var base = { id: 'chatcmpl-web-' + Date.now(), object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: model };
  push(Object.assign({}, base, { choices: [{ index:0, delta:{ role:'assistant' }, finish_reason:null }] }));
  if (answer.reasoning) push(Object.assign({}, base, { choices: [{ index:0, delta:{ reasoning_content: answer.reasoning }, finish_reason:null }] }));
  if (answer.content) push(Object.assign({}, base, { choices: [{ index:0, delta:{ content: answer.content }, finish_reason:null }] }));
  push(Object.assign({}, base, { choices: [{ index:0, delta:{}, finish_reason: answer.stop === 'max_tokens' ? 'length' : 'stop' }], usage: answer.usage }));
  frames.push('data: [DONE]\n\n');
  return new ReadableStream({ start: function(controller){ for (var i=0;i<frames.length;i++) controller.enqueue(encodeText(frames[i])); controller.close(); } });
}

/* ---- streaming translation: anthropic SSE -> chat chunks ---- */
function anthropicUsageToOpenAI(startUsage, deltaUsage){
  var hit = Number(startUsage && startUsage.cache_read_input_tokens) || 0;
  var creation = Number(startUsage && startUsage.cache_creation_input_tokens) || 0;
  var uncached = Number(startUsage && startUsage.input_tokens) || 0;
  var output = Number(deltaUsage && deltaUsage.output_tokens) || 0;
  var prompt = uncached + hit + creation;
  return {
    prompt_tokens: prompt,
    completion_tokens: output,
    total_tokens: prompt + output,
    prompt_cache_hit_tokens: hit,
    prompt_cache_miss_tokens: uncached + creation,
    prompt_tokens_details: { cached_tokens: hit }
  };
}
function makeAnthropicTranslate(){
  var startUsage = null, searchedBlock = false, countedSearch = false;
  return function(ev){
    switch (ev && ev.type){
      case 'message_start':
        if (ev.message && ev.message.usage) startUsage = ev.message.usage;
        return null;
      case 'content_block_start': {
        var cb = ev.content_block || {};
        if (cb.type === 'tool_use' || cb.type === 'server_tool_use'){
          if (cb.name === 'web_search' || (cb.input && (cb.input.type === 'web_search' || cb.input.name === 'web_search'))){
            if (!countedSearch){ NS.stats.searchCalls++; countedSearch = true; }
            searchedBlock = true;
          }
        }
        return null;
      }
      case 'content_block_delta': {
        var d = ev.delta || {};
        if (d.type === 'thinking_delta')
          return { choices: [{ delta: { reasoning_content: d.thinking || '' } }] };
        if (d.type === 'text_delta')
          return { choices: [{ delta: { content: d.text || '' } }] };
        if (d.type === 'input_json_delta' && searchedBlock && NS.config.showSearchTrace){
          try {
            var j = JSON.parse(d.partial_json || '{}');
            if (j.search_query){
              searchedBlock = false;
              return { choices: [{ delta: { reasoning_content: '[web_search] ' + j.search_query } }] };
            }
          } catch(e){}
        }
        return null;
      }
      case 'message_delta':
        return { finish: true, usage: anthropicUsageToOpenAI(startUsage, ev.usage) };
      case 'message_stop':
        return { finish: true };
      default:
        return null;
    }
  };
}

function anthropicHandler(input, init, url, opts){
  if (NS.config.mode === 'responses') return null;
  if (!/api\.deepseek\.com\/?(?:v1\/)?chat\/completions(?:\?|$)/i.test(url)) return null;
  if (typeof opts.body !== 'string') return null;
  var original;
  try { original = JSON.parse(opts.body); } catch(e){ return null; }
  if ((original.tools || []).some(function(t){ return t && t.type === 'function'; })) return null;
  var headers = new Headers(opts.headers || (input && input instanceof Request ? input.headers : undefined));
  var key = (headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key) return null;
  var converted = toAnthropic(original.messages || []);
  var useStream = !!(NS.flags.bridgeStream && original.stream);
  var upstream = {
    model: original.model,
    max_tokens: original.max_tokens != null ? original.max_tokens : (original.max_completion_tokens != null ? original.max_completion_tokens : 384000),
    messages: converted.messages, tools: [SEARCH_TOOL], stream: useStream
  };
  if (converted.system) upstream.system = converted.system;
  ['temperature','top_p','thinking','reasoning_effort'].forEach(function(n){ if (original[n] != null) upstream[n] = original[n]; });
  var rInit = {
    method: 'POST',
    headers: { 'content-type':'application/json', 'authorization':'Bearer ' + key, 'x-api-key': key, 'anthropic-version':'2023-06-01' },
    body: JSON.stringify(upstream), signal: opts.signal
  };
  return NS.origFetch(ANTHROPIC_ENDPOINT, rInit).then(function(resp){
    updateStats('anthropic', original.model, ANTHROPIC_ENDPOINT);
    updateStatus();
    if (useStream){
      if (!resp.ok || !resp.body) return resp;
      return new Response(makeCoalescedStream(resp.body, makeAnthropicTranslate()),
        { status: 200, headers: { 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-cache' } });
    }
    return resp.text().then(function(rawText){
      if (!resp.ok) return new Response(rawText, { status: resp.status, statusText: resp.statusText, headers: { 'content-type': resp.headers.get('content-type') || 'application/json' } });
      var data;
      try { data = JSON.parse(rawText); } catch(e){ throw Error('Anthropic endpoint invalid JSON: ' + rawText.slice(0,500)); }
      var answer = toAnswer(data);
      if (answer.searched) NS.stats.searchCalls++;
      updateStatus();
      if (original.stream) return new Response(openAIStream(answer, original.model), { status:200, headers:{ 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-cache' } });
      return new Response(JSON.stringify(openAIJson(answer, original.model)), { status:200, headers:{ 'content-type':'application/json; charset=utf-8' } });
    });
  });
}

/* ---------- responses hybrid (with function_call executor loop) ---------- */
var MODELS = {
  'deepseek-v4-pro':   { provider:'deepseek', path:'/responses', webSearch:true },
  'deepseek-v4-flash': { provider:'deepseek', path:'/responses', webSearch:true },
  'gpt-5.6-sol':       { provider:'openai',  path:'/responses', webSearch:true },
  'gpt-5.6-terra':     { provider:'openai',  path:'/responses', webSearch:true },
  'gpt-5.6-luna':      { provider:'openai',  path:'/responses', webSearch:true }
};
var PROVIDER_HOSTS = { deepseek:['api.deepseek.com'], openai:['api.openai.com'] };
var warned = {};
function resolvePlan(url, payload){
  if (NS.config.mode === 'chat') return null;
  var plan = MODELS[payload && payload.model];
  if (!plan){
    if (NS.config.mode === 'responses' && payload && payload.model && !warned[payload.model]){
      warned[payload.model] = 1;
      warn('mode=responses but model not profiled: ' + payload.model + ' -> chat fallback.');
    }
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
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length){
      input.push({ type:'message', role:'assistant', content: m.content ? [{ type:'output_text', text:String(m.content) }] : [] });
      m.tool_calls.forEach(function(tc){
        if (!tc || !tc.id) return;
        input.push({ type:'function_call', call_id:tc.id, name:(tc.function && tc.function.name) || '', arguments:(tc.function && tc.function.arguments) || '{}' });
      });
      return;
    }
    if (m.role === 'tool'){
      input.push({ type:'function_call_output', call_id:m.tool_call_id || '', output: String(m.content == null ? '' : m.content) });
      return;
    }
    if (m.role === 'user' || m.role === 'assistant')
      input.push({ type:'message', role:m.role, content:[{ type:'input_text', text:String(m.content || '') }] });
  });
  if (!input.length) return null;
  var req = { model: chat.model, input: input, stream: !!chat.stream };
  if (sys.length) req.instructions = sys.join('\n\n');
  var max = chat.max_tokens != null ? chat.max_tokens : chat.max_completion_tokens;
  if (max) req.max_output_tokens = max;
  if (typeof chat.temperature === 'number' && plan.provider !== 'deepseek') req.temperature = chat.temperature;
  var tools = [];
  (chat.tools || []).forEach(function(t){ if (t && t.type === 'function') tools.push(t); });
  if (NS.config.webSearch && plan.webSearch && !tools.some(function(t){ return t && t.type === 'web_search'; })){
    if (NS.config.webSearchStyle === 'tool') req.tool = 'web_search';
    else tools.push({ type: 'web_search' });
  }
  if (tools.length) req.tools = tools;
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
/* non-tool responses SSE -> chat chunks */
function translateResponsesEvent(ev){
  switch (ev && ev.type){
    case 'response.created':
      if (ev.response && ev.response.id) NS.stats.last.id = ev.response.id;
      return null;
    case 'response.output_text.delta':
      return { choices: [{ delta: { content: ev.delta || '' } }] };
    case 'response.reasoning_text.delta':
      return { choices: [{ delta: { reasoning_content: ev.delta || '' } }] };
    case 'response.output_item.done': {
      var item = ev.item || {};
      if (item.type === 'web_search_call'){
        NS.stats.searchCalls++;
        if (NS.config.showSearchTrace){
          var q = (item.action && (item.action.search_query || item.action.query)) || 'web search';
          return { choices: [{ delta: { reasoning_content: '[web_search] ' + q } }] };
        }
      }
      return null;
    }
    case 'response.completed':
    case 'response.incomplete':
      return { finish: true, usage: mapUsage(ev.response && ev.response.usage) };
    case 'response.failed':
      return { error: Error((ev.response && ev.response.error && ev.response.error.message) || 'Responses request failed.') };
    default:
      return null;
  }
}
/* tool-aware responses SSE translator (stateful) */
function makeResponsesTranslate(){
  var calls = [], current = null;
  return {
    next: function(ev){
      switch (ev && ev.type){
        case 'response.created':
          if (ev.response && ev.response.id) NS.stats.last.id = ev.response.id;
          return null;
        case 'response.output_text.delta':
          return { choices: [{ delta: { content: ev.delta || '' } }] };
        case 'response.reasoning_text.delta':
          return { choices: [{ delta: { reasoning_content: ev.delta || '' } }] };
        case 'response.output_item.added': {
          var it = ev.item || {};
          if (it.type === 'function_call'){ current = { id: it.id || '', name: it.name || '', arguments: '' }; return null; }
          if (it.type === 'web_search_call'){
            NS.stats.searchCalls++;
            if (NS.config.showSearchTrace){
              var q = (it.action && (it.action.search_query || it.action.query)) || 'web search';
              return { choices: [{ delta: { reasoning_content: '[web_search] ' + q } }] };
            }
          }
          return null;
        }
        case 'response.function_call_arguments.delta':
          if (current) current.arguments += ev.delta || '';
          return null;
        case 'response.output_item.done': {
          var it2 = ev.item || {};
          if (it2.type === 'function_call' || (current && it2.id && it2.id === current.id)){
            if (current){ calls.push(current); current = null; }
            return null;
          }
          return null;
        }
        case 'response.completed':
        case 'response.incomplete':
          return { finish: true, usage: mapUsage(ev.response && ev.response.usage) };
        case 'response.failed':
          return { error: Error((ev.response && ev.response.error && ev.response.error.message) || 'Responses request failed.') };
        default:
          return null;
      }
    },
    calls: function(){ return calls; }
  };
}
/* read an SSE body, call onEvent per parsed JSON */
function pumpSSE(body, onEvent){
  return new Promise(function(resolve, reject){
    var reader = body.getReader(), dec = new TextDecoder(), buf = '';
    (function pump(){
      reader.read().then(function(res){
        if (res.done){ resolve(); return; }
        buf += dec.decode(res.value, { stream: true });
        var m;
        while ((m = buf.search(/\n\n|\r\n\r\n/)) !== -1){
          var sep = buf[m] === '\r' ? 4 : 2;
          var block = buf.slice(0, m); buf = buf.slice(m + sep);
          var data = '';
          (block.split(/\r?\n/) || []).forEach(function(line){ if (line.indexOf('data:') === 0) data += (data ? '\n' : '') + line.slice(5).replace(/^\s+/, ''); });
          if (data && data !== '[DONE]'){ try { onEvent(JSON.parse(data)); } catch(e){} }
        }
        pump();
      }).catch(reject);
    })();
  });
}
/* streaming responses + local function_call executor loop */
function makeResponsesToolStream(firstBody, rReqBase, plan, rInit, signal){
  return new ReadableStream({
    start: async function(controller){
      var enc = new TextEncoder();
      var acc = { content:'', reasoning:'' }, timer = 0;
      function enqueue(text){ try { controller.enqueue(enc.encode(text)); } catch(e){} }
      function flush(){
        if (timer){ clearTimeout(timer); timer = 0; }
        if (acc.content || acc.reasoning){
          var d = {};
          if (acc.content) d.content = acc.content;
          if (acc.reasoning) d.reasoning_content = acc.reasoning;
          enqueue('data: ' + JSON.stringify({ choices: [{ delta: d }] }) + '\n\n');
          acc.content = ''; acc.reasoning = '';
        }
      }
      function sched(){ if (timer) return; timer = setTimeout(function(){ timer = 0; flush(); }, NS.config.paintIntervalMs); }
      function emitDelta(d){
        if (d && d.content){ acc.content += d.content; sched(); }
        if (d && d.reasoning_content){ acc.reasoning += d.reasoning_content; sched(); }
      }
      var t = makeResponsesTranslate(), calls = null, usageFinal = null;
      try {
        await pumpSSE(firstBody, function(ev){
          var out = t.next(ev);
          if (!out) return;
          if (out.error) throw out.error;
          if (out.finish){ usageFinal = out.usage || null; return; }
          var d = (out.choices && out.choices[0] && out.choices[0].delta) || {};
          emitDelta(d);
        });
        flush();
        calls = t.calls();
        var turn = 0;
        while (calls && calls.length && turn < 6){
          turn++;
          var input = (rReqBase.input || []).slice();
          calls.forEach(function(c){ input.push({ type:'function_call', call_id:c.id, name:c.name, arguments:c.arguments || '{}' }); });
          var outputs = [];
          for (var i = 0; i < calls.length; i++){
            var outStr = await execTool({ id: calls[i].id, function: { name: calls[i].name, arguments: calls[i].arguments || '{}' } });
            NS.stats.toolCalls++;
            outputs.push({ type:'function_call_output', call_id: calls[i].id, output: outStr });
          }
          updateStatus();
          input = input.concat(outputs);
          var followReq = Object.assign({}, rReqBase, { input: input, stream: false });
          var resp = await NS.origFetch(rReqBase._url || '', { method:'POST', headers: rReqBase._headers || {}, body: JSON.stringify(followReq), signal: signal });
          var data = await resp.json();
          if (data.status === 'failed') throw Error((data.error && data.error.message) || 'Responses request failed.');
          var fin = translateFinal(data, plan);
          if (fin.choices && fin.choices[0] && fin.choices[0].message){
            var mm = fin.choices[0].message;
            emitDelta({ content: mm.content || '' });
            if (mm.reasoning_content) emitDelta({ reasoning_content: mm.reasoning_content || '' });
          }
          usageFinal = fin.usage || usageFinal;
          calls = [];
          (data.output || []).forEach(function(it){ if (it && it.type === 'function_call') calls.push({ id: it.id, name: it.name, arguments: it.arguments || '' }); });
        }
        flush();
        if (usageFinal) enqueue('data: ' + JSON.stringify({ choices: [{ delta: {} }], usage: usageFinal }) + '\n\n');
        enqueue('data: [DONE]\n\n');
        controller.close();
      } catch(e){
        flush();
        try { controller.error(e); } catch(_){}
      }
    }
  });
}
/* non-streaming responses + local function_call executor loop */
async function runResponsesNonStream(upstream, plan, rReq, rUrl, rInit, signal){
  var input = (rReq.input || []).slice();
  var turn = 0, data = null;
  try {
    data = await upstream.json();
  } catch(e){
    return new Response(JSON.stringify({ error: { message: 'Invalid responses JSON' } }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
  while (turn <= 10){
    if (data.status === 'failed'){
      var em = (data.error && data.error.message) || 'Responses request failed.';
      return new Response(JSON.stringify({ error: { message: em } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    var calls = [];
    (data.output || []).forEach(function(it){ if (it && it.type === 'function_call') calls.push(it); });
    if (!calls.length){
      return new Response(JSON.stringify(translateFinal(data, plan)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (turn >= 10) break;
    input = input.concat(calls.map(function(c){ return { type:'function_call', call_id:c.id, name:c.name, arguments:c.arguments || '{}' }; }));
    for (var i = 0; i < calls.length; i++){
      var outStr = await execTool({ id: calls[i].id, function: { name: calls[i].name, arguments: calls[i].arguments || '{}' } });
      NS.stats.toolCalls++;
      input.push({ type:'function_call_output', call_id: calls[i].id, output: outStr });
    }
    updateStatus();
    var followReq = Object.assign({}, rReq, { input: input, stream: false });
    var resp = await NS.origFetch(rUrl, Object.assign({}, rInit, { body: JSON.stringify(followReq) }));
    data = await resp.json();
    turn++;
  }
  return new Response(JSON.stringify(translateFinal(data, plan)), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
function translateFinal(data, plan){
  var content = '', reasoning = '';
  (data.output || []).forEach(function(item){
    if (item && item.type === 'message' && Array.isArray(item.content)){
      item.content.forEach(function(c){ if (c && c.type === 'output_text') content += c.text || ''; });
    } else if (item && item.type === 'reasoning'){
      (item.summary || []).forEach(function(s){ if (s && s.type === 'summary_text') reasoning += s.text || ''; });
      if (!reasoning && typeof item.encrypted_content === 'string') reasoning = '[encrypted reasoning]';
    } else if (item && item.type === 'web_search_call'){
      NS.stats.searchCalls++;
      var q = item.action && (item.action.search_query || item.action.query);
      if (NS.config.showSearchTrace && q) reasoning += (reasoning ? '\n' : '') + '[web_search] ' + q;
    }
  });
  var status = data.status === 'failed' ? 'error' : (data.status === 'incomplete' ? 'length' : 'stop');
  return {
    id: data.id, object: 'chat.completion', created: Math.floor(Date.now() / 1000),
    model: data.model || plan.model,
    choices: [{ index: 0, message: { role: 'assistant', content: content, reasoning_content: reasoning }, finish_reason: status }],
    usage: mapUsage(data.usage)
  };
}
function responsesHandler(input, init, url, opts){
  if (typeof opts.body !== 'string') return null;
  var payload;
  try { payload = JSON.parse(opts.body); } catch(e){ return null; }
  var plan = resolvePlan(url, payload);
  if (!plan) return null;
  var hasFnTools = (payload.tools || []).some(function(t){ return t && t.type === 'function'; });
  var rReq = buildResponsesRequest(payload, plan);
  if (!rReq) return null;
  var base = url.replace(/\/chat\/completions(\?|$)/, '');
  var rUrl = base + plan.path;
  try { console.log('[eval1] → ' + (payload.model || '?') + ' → ' + plan.provider + ' /responses' + (hasFnTools ? ' [tools]' : ''), { url: rUrl, inputItems: (rReq.input || []).length, tools: (rReq.tools || []).map(function(t){ return t.type; }), max_output_tokens: rReq.max_output_tokens, stream: rReq.stream }); } catch(e){}
  var rInit = {};
  for (var k in opts) if (k !== 'body') rInit[k] = opts[k];
  rInit.headers = cloneHeaders(opts.headers);
  rInit.headers['Content-Type'] = 'application/json';
  rInit.body = JSON.stringify(rReq);
  rReq._url = rUrl; rReq._headers = rInit.headers;
  return NS.origFetch(rUrl, rInit).then(function(upstream){
    NS.stats.transformed++;
    updateStats('responses', payload.model, rUrl);
    updateStatus();
    if (!upstream.ok){
      return upstream.text().then(function(text){
        var msg = 'HTTP ' + upstream.status;
        try { var j = JSON.parse(text); if (j && j.error && j.error.message) msg += ': ' + j.error.message; } catch(e){}
        return new Response(JSON.stringify({ error: { message: msg } }), { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
      });
    }
    if (hasFnTools){
      if (payload.stream && upstream.body)
        return new Response(makeResponsesToolStream(upstream.body, rReq, plan, rInit, opts.signal), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      return runResponsesNonStream(upstream, plan, rReq, rUrl, rInit, opts.signal);
    }
    if (payload.stream && upstream.body)
      return new Response(makeCoalescedStream(upstream.body, translateResponsesEvent), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    return upstream.json().then(function(data){
      if (data.status === 'failed'){
        var em = (data.error && data.error.message) || 'Responses request failed.';
        return new Response(JSON.stringify({ error: { message: em } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(translateFinal(data, plan)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });
}
/* generic coalescer (preserves tool_calls for chat) */
function makeCoalescedStream(sourceBody, translate){
  return new ReadableStream({
    start: function(controller){
      var reader = sourceBody.getReader(), decoder = new TextDecoder(), buffer = '', closed = false;
      var acc = { content: '', reasoning: '', toolCalls: null }, timer = 0;
      function enqueue(text){ if (!closed) try { controller.enqueue(encodeText(text)); } catch(e){} }
      function flushAcc(){
        if (timer){ clearTimeout(timer); timer = 0; }
        if (acc.content || acc.reasoning || acc.toolCalls){
          var delta = {};
          if (acc.content) delta.content = acc.content;
          if (acc.reasoning) delta.reasoning_content = acc.reasoning;
          if (acc.toolCalls) delta.tool_calls = acc.toolCalls;
          enqueue('data: ' + JSON.stringify({ choices: [{ delta: delta }] }) + '\n\n');
          acc.content = ''; acc.reasoning = ''; acc.toolCalls = null;
        }
      }
      function scheduleFlush(){
        if (timer) return;
        timer = setTimeout(function(){ timer = 0; flushAcc(); }, NS.config.paintIntervalMs);
      }
      function finish(){
        if (closed) return;
        flushAcc(); closed = true; enqueue('data: [DONE]\n\n');
        try { controller.close(); } catch(e){}
      }
      function handleBlock(block){
        var data = '';
        (block.split(/\r?\n/) || []).forEach(function(line){
          if (line.indexOf('data:') === 0) data += (data ? '\n' : '') + line.slice(5).replace(/^\s+/, '');
        });
        if (!data) return;
        if (data === '[DONE]'){ finish(); return; }
        var ev;
        try { ev = JSON.parse(data); } catch(e){ warn('skipped malformed SSE ' + String(data).slice(0,120)); return; }
        var out;
        try { out = translate ? translate(ev) : ev; } catch(e){ out = { error: e }; }
        if (!out) return;
        if (out.error){ if (!closed){ closed = true; try { controller.error(out.error); } catch(e){} } return; }
        if (out.finish){
          if (out.usage){ flushAcc(); enqueue('data: ' + JSON.stringify({ choices: [{ delta: {} }], usage: out.usage }) + '\n\n'); }
          finish(); return;
        }
        var delta = (out.choices && out.choices[0] && out.choices[0].delta) || {};
        if (delta.content){ acc.content += delta.content; scheduleFlush(); }
        if (delta.reasoning_content){ acc.reasoning += delta.reasoning_content; scheduleFlush(); }
        var dcs = delta.tool_calls;
        if (dcs && dcs.length){
          acc.toolCalls = acc.toolCalls || [];
          dcs.forEach(function(dtc){
            if (!dtc) return;
            var i = dtc.index != null ? dtc.index : acc.toolCalls.length;
            var a = acc.toolCalls[i] || (acc.toolCalls[i] = { id:'', type:'function', function:{ name:'', arguments:'' } });
            if (dtc.id) a.id += dtc.id;
            if (dtc.function){
              if (dtc.function.name) a.function.name += dtc.function.name;
              if (dtc.function.arguments) a.function.arguments += dtc.function.arguments;
            }
          });
          scheduleFlush();
        }
        if (out.usage){ flushAcc(); enqueue('data: ' + JSON.stringify({ choices: [{ delta: {} }], usage: out.usage }) + '\n\n'); }
      }
      function pump(){
        reader.read().then(function(res){
          if (closed){ try { reader.cancel(); } catch(e){} return; }
          if (res.done){ finish(); return; }
          buffer += decoder.decode(res.value, { stream: true });
          var m;
          while (!closed && (m = buffer.search(/\n\n|\r\n\r\n/)) !== -1){
            var sep = buffer[m] === '\r' ? 4 : 2;
            handleBlock(buffer.slice(0, m));
            buffer = buffer.slice(m + sep);
          }
          pump();
        }).catch(function(err){ if (!closed){ closed = true; try { controller.error(err); } catch(e){} } });
      }
      pump();
    }
  });
}
function coalescerHandler(input, init, url, opts){
  if (typeof opts.body !== 'string') return null;
  var payload;
  try { payload = JSON.parse(opts.body); } catch(e){ return null; }
  if (!(payload && payload.stream && Array.isArray(payload.messages) && /\/chat\/completions(\?|$)/.test(url))) return null;
  NS.stats.passthrough++;
  updateStats('chat', payload.model, url);
  updateStatus();
  return NS.origFetch.call(this, input, init).then(function(upstream){
    if (!upstream.ok || !upstream.body) return upstream;
    return new Response(makeCoalescedStream(upstream.body, null), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  });
}

/* ---------- tool_eval_1 (your working implementation, integrated) ---------- */
var safeStr = function(v){ try {
  if (v === undefined) return 'undefined';
  if (typeof v === 'bigint' || typeof v === 'symbol' || typeof v === 'function') return String(v);
  if (typeof v !== 'object' || v === null) return JSON.stringify(v);
  var seen = new WeakSet();
  return JSON.stringify(v, function(k,x){
    if (typeof x === 'bigint' || typeof x === 'symbol' || typeof x === 'function') return String(x);
    if (x && typeof x === 'object'){ if (seen.has(x)) return '[circular]'; seen.add(x); }
    return x;
  }, 2).slice(0,20000) || 'undefined';
} catch(e){ return String(v); } };

var evalWorker = function(code, timeout){
  return new Promise(function(resolve){
    try {
      var src = "self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:1,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:0,e:String(err&&err.stack||err)})}}";
      var w = new Worker(URL.createObjectURL(new Blob([src], {type:'text/javascript'})));
      var t = setTimeout(function(){ w.terminate(); resolve({ok:0,e:'timeout'}); }, timeout);
      w.onmessage = function(e){ clearTimeout(t); w.terminate(); resolve(e.data); };
      w.onerror = function(err){ clearTimeout(t); w.terminate(); resolve({ok:0,e:String(err.message||err)}); };
      w.postMessage(code);
    } catch(e){ resolve({ok:0,e:String(e)}); }
  });
};

var runTool = async function(args){
  args = args || {};
  var code = String(args.code ?? args.expression ?? '').trim();
  var timeout = args.timeout == null ? 10000 : Math.max(1, Math.min(60000, Number(args.timeout)||10000));
  var worker = args.worker !== false;
  var t0 = performance.now();
  if (!code) return safeStr({ok:false, error:'no code provided'});
  var done = function(r){ return safeStr({ ok:!!r.ok, ms:Math.round(performance.now()-t0), ...(r.ok ? {result:r.r} : {error:r.e}) }); };
  if (worker) return done(await evalWorker(code, timeout));
  return new Promise(function(resolve){
    var done2=false;
    var t = setTimeout(function(){ if(!done2){ done2=true; resolve(done({ok:0,e:'timeout'})); } }, timeout);
    var fin = function(r){ if(done2) return; done2=true; clearTimeout(t); resolve(done(r)); };
    try { Promise.resolve(eval(code)).then(function(r){ fin({ok:1,r:r}); }, function(e){ fin({ok:0,e:String(e && e.stack || e)}); }); }
    catch(e){ fin({ok:0,e:String(e && e.stack || e)}); }
  });
};

var execTool = async function(tc){
  var name = tc.function && tc.function.name;
  var def = window.__tools && window.__tools[name];
  var args = {};
  try { args = JSON.parse(tc.function && tc.function.arguments || '{}'); } catch(e){ args = { parseError:String(e), raw:tc.function && tc.function.arguments }; }
  if (!def) return JSON.stringify({ok:false, error:'unknown tool: '+name});
  try { var out = await def.run(args); return typeof out === 'string' ? out : JSON.stringify(out); }
  catch(e){ return JSON.stringify({ok:false, error:String(e && e.stack || e)}); }
};

function installTools(){
  if (NS.toolsInstalled) return;
  if (typeof executeAPI !== 'function'){ warn('executeAPI not found — tool_eval_1 disabled'); return; }
  NS.origExecuteAPI = executeAPI;
  window.__tools = window.__tools || {};
  window.__tools.tool_eval_1 = {
    schema: { type:'function', function:{ name:'tool_eval_1',
      description:'Run arbitrary JavaScript in the browser and return JSON result. Use for math, fetch, text/DOM inspection. Default timeout 10000ms; override with "timeout" (ms, max 60000). worker:false runs in page scope (app globals available); default isolated worker.',
      parameters:{ type:'object', properties:{
        code:{ type:'string', description:'JavaScript to evaluate. Returned value or resolved Promise is returned as JSON.' },
        timeout:{ type:'number', description:'ms (default 10000, max 60000)' },
        worker:{ type:'boolean', description:'default true = isolated worker; false = page scope' }
      }, required:['code'] }
    }},
    run: runTool
  };
  window.toolEval1 = window.__tools.tool_eval_1;

  executeAPI = async function(messages, node, vIndex, controller, r=run()) {
    const p=r.p, key=getApiKey(p.id), isStream=settings.streaming, modelId=r.m;
    let tools=[];
    if (Array.isArray(r.request?.tools)) tools = r.request.tools.slice();
    else if (typeof r.request?.tools === 'string') tools = r.request.tools.split(/[,\s]+/).filter(Boolean).map(n=>window.__tools?.[n]?.schema).filter(Boolean);
    if (NS.flags.toolEval && window.__tools?.tool_eval_1){
      let has = tools.some(t=>t && t.type==='function' && t.function && t.function.name==='tool_eval_1');
      if (!has) tools.push(window.__tools.tool_eval_1.schema);
    }
    const payload = { ...r.request, model:modelId, messages, temperature:r.supportsTemperature===false?void 0:r.temperature??.7, stream:isStream };
    if (tools.length) { payload.tools = tools; if (!payload.tool_choice) payload.tool_choice='auto'; }
    payload[p.maxTokensParam || 'max_tokens'] = r.maxTokens;
    if (isStream && p.supportsStreamUsage) payload.stream_options = { include_usage:true };
    node.versions[vIndex].startTime = Date.now();

    for (let turn=0; turn<=10; turn++) {
      const res = await fetch(p.baseURL+p.apiPath, { method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':(p.authHeader?p.authHeader+' ':'')+key },
        body:JSON.stringify({ ...payload, messages }), signal:controller.signal });
      if (!res.ok) { const body=(await res.text()).trim(); throw new Error(`HTTP ${res.status}${res.statusText?' '+res.statusText:''}${body?'\n'+body:''}`); }
      let usageState, exactCost;
      const applyUsage = envelope => {
        const costBad={}, next=r.usagePath===false?envelope:r.usagePath?at(envelope,r.usagePath):envelope?.usage??envelope?.usageMetadata??envelope?.message?.usage, rc=usageValue(envelope,r.usageCost,costBad);
        if(!costBad.value && rc!==undefined) exactCost=rc;
        if(isObj(next)) usageState=mergeUsage(usageState,next);
        if(usageState || exactCost!==undefined) applyResponseMetadata(node.versions[vIndex], usageState||{}, r, exactCost);
      };
      let toolCalls = null;

      if (!isStream) {
        const data = await res.json(); applyUsage(data);
        const msg = data.choices?.[0]?.message || {};
        if (msg.tool_calls?.length) {
          toolCalls = msg.tool_calls;
          messages.push({ role: msg.role||'assistant', content: msg.content||null, tool_calls: toolCalls });
        } else {
          node.versions[vIndex].rawContent = msg.content||'';
          node.versions[vIndex].thinking = msg.reasoning_content||'';
          handleNewContent(node.versions[vIndex].rawContent.length + node.versions[vIndex].thinking.length, true);
        }
      } else {
        const reader=res.body.getReader(), dec=new TextDecoder();
        let fullC='', fullT='', buf='', first=true, lastR=0, tAcc=[];
        const proc = line => {
          if(!line.startsWith('data: ')) return; const js=line.slice(6).trim(); if(!js || js==='[DONE]') return;
          try {
            const d=JSON.parse(js), delta=d.choices?.[0]?.delta||{};
            fullC += delta.content||''; fullT += delta.reasoning_content||'';
            (delta.tool_calls||[]).forEach(dtc=>{
              const i=dtc.index!=null?dtc.index:tAcc.length; let a=tAcc[i] ?? (tAcc[i]={id:'',type:'function',function:{name:'',arguments:''}});
              if(dtc.id) a.id+=dtc.id;
              if(dtc.function){ if(dtc.function.name) a.function.name+=dtc.function.name; if(dtc.function.arguments) a.function.arguments+=dtc.function.arguments; }
            });
            node.lastUpdateTime=Date.now(); const v=node.versions[vIndex];
            v.rawContent=fullC; v.thinking=fullT;
            if(first && (fullC||fullT||tAcc.length)){ if(node.activeVersion===vIndex) updateNodeDOM(node); first=false; handleNewContent(0,true); }
            if(!first && (fullC.length+fullT.length)){
              if(node.activeVersion===vIndex){
                v.unread=false; const l=fullC.length+fullT.length; handleNewContent(l-lastR,false); lastR=l;
                const el=getMessageEl(node.id);
                if(el){ const b=el.querySelector('.bubble'), cc=el.closest('.message').querySelector('.char-count'), h=buildThinkingSection(fullT,node.id,true)+formatMarkdown(fullC);
                  if(b && b.innerHTML!==h) b.innerHTML=h; if(cc) cc.textContent=getMessageStatString(node,v); }
                scheduleTokenDisplayUpdate(fullC.length, fullT.length);
              } else { const vs=node.versions, a=node.activeVersion; if((vs[a].swarm&&!vs[a].endTime)||!v.unread) updateVersionDots(node,vIndex); }
              const sw=node.id+'|'+vIndex, now=Date.now(); if(now-(lastBufferWrite[sw]||0)>500){ saveStreamBuffer(node,vIndex); lastBufferWrite[sw]=now; }
            }
            applyUsage(d);
          } catch(e){}
        };
        while(true){ const {done,value}=await reader.read(); if(done)break; buf+=dec.decode(value,{stream:true}); const ls=buf.split('\n'); buf=ls.pop(); ls.forEach(proc); }
        if(buf.trim()) proc(buf.trim());
        if(tAcc.length){
          toolCalls=tAcc.filter(Boolean);
          messages.push({ role:'assistant', content: fullC||null, tool_calls: toolCalls });
          if(!fullC.trim()){ node.versions[vIndex].rawContent='🔧 Calling '+toolCalls.map(t=>t.function?.name).join(', ')+'…'; if(node.activeVersion===vIndex) updateNodeDOM(node); }
        } else {
          node.versions[vIndex].rawContent=fullC; node.versions[vIndex].thinking=fullT;
        }
      }

      if (toolCalls && toolCalls.length) {
        if (turn >= 10) break;
        for (const tc of toolCalls){
          NS.stats.toolCalls++;
          messages.push({ role:'tool', tool_call_id:tc.id, content: await execTool(tc) });
        }
        updateStatus();
        continue;
      }
      break;
    }
    await saveStreamBuffer(node, vIndex);
    node.versions[vIndex].endTime = node.lastUpdateTime || Date.now();
    finalizeGeneration(node, vIndex, controller);
  };
  NS.toolsInstalled = true;
  try { console.log('[eval1] tool_eval_1 registered + executeAPI patched (tool loop up to 10 turns)'); } catch(e){}
}
function removeTools(){
  if (!NS.toolsInstalled) return;
  if (NS.origExecuteAPI) executeAPI = NS.origExecuteAPI;
  if (window.__tools) delete window.__tools.tool_eval_1;
  try { delete window.toolEval1; } catch(e){}
  NS.toolsInstalled = false;
}

/* ---------- deepseek peak/off-peak pricing (message-send-time based) ---------- */
var DS_RATES = {
  'deepseek-v4-flash': {
    peak:{ inputCacheHit:.014e-6, inputCacheMiss:.44e-6, output:1.32e-6 },
    off: { inputCacheHit:.007e-6, inputCacheMiss:.22e-6, output:.66e-6 }
  },
  'deepseek-v4-pro': {
    peak:{ inputCacheHit:.044e-6, inputCacheMiss:1.32e-6, output:3.96e-6 },
    off: { inputCacheHit:.022e-6, inputCacheMiss:.66e-6, output:1.98e-6 }
  }
};
function deepseekRates(model, at){
  var h = new Date(at || Date.now()).getUTCHours();
  var peak = (h>=1 && h<4) || (h>=6 && h<10);
  var m = DS_RATES[model];
  return m ? Object.assign({}, m[peak ? 'peak' : 'off']) : null;
}
function installPricing(){
  if (NS.pricingInstalled) return;
  if (typeof applyResponseMetadata !== 'function'){ warn('applyResponseMetadata not found — pricing patch skipped'); return; }
  NS.origARM = applyResponseMetadata;
  applyResponseMetadata = function(version, raw, config, reportedExact){
    if (config && config.p && config.p.id === 'deepseek' && config.m){
      var rates = deepseekRates(config.m, Date.now());
      if (rates) config = Object.assign({}, config, { pricing: Object.assign({}, config.pricing || {}, rates) });
    }
    return NS.origARM(version, raw, config, reportedExact);
  };
  NS.pricingInstalled = true;
  try { console.log('[eval1] deepseek peak/off-peak pricing installed (UTC 01-04 / 06-10 peak)'); } catch(e){}
}
function removePricing(){
  if (NS.pricingInstalled && NS.origARM){ applyResponseMetadata = NS.origARM; NS.pricingInstalled = false; }
}

/* ---------- marked ---------- */
var MARKED_CSS = '.bubble table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.85rem;overflow-x:auto;display:block}.bubble th,.bubble td{border:1px solid var(--border);padding:8px 12px;text-align:left}.bubble th{background:rgba(0,0,0,.3);font-weight:bold;color:var(--accent)}.bubble tbody tr:nth-child(even){background:rgba(0,0,0,.15)}';
function captureOrigMarkdown(){
  if (!NS.origFormatMarkdown && typeof formatMarkdown === 'function') NS.origFormatMarkdown = formatMarkdown;
}
function renderMarked(raw){
  var lib = window.marked;
  if (!lib || !raw) return NS.origFormatMarkdown ? NS.origFormatMarkdown(raw) : String(raw || '');
  try {
    var renderer = {
      code: function(token){
        var text = (token && token.text != null) ? token.text : String(token || '');
        var lang = (token && token.lang) || 'plain';
        var collapsed = !!(settings.blockAutoCollapse && text.length > settings.blockCollapseSize);
        return buildCodeBlockHTML(lang, text + '\n', collapsed);
      }
    };
    if (typeof lib.Marked === 'function'){
      return new lib.Marked({ gfm: true, breaks: true, renderer: renderer }).parse(String(raw));
    }
    if (typeof lib.parse === 'function'){
      var r = new lib.Renderer();
      r.code = renderer.code;
      return lib.parse(String(raw), { renderer: r, breaks: true, gfm: true });
    }
  } catch(e){ warn('marked render failed, falling back: ' + e.message); }
  return NS.origFormatMarkdown ? NS.origFormatMarkdown(raw) : String(raw || '');
}
function injectMarkedCss(){
  if (NS.markedCss) return;
  var s = document.createElement('style');
  s.textContent = MARKED_CSS;
  document.head.appendChild(s);
  NS.markedCss = true;
}
function loadMarked(){
  if (NS.markedReady) return Promise.resolve(true);
  if (NS.markedLoading) return NS.markedLoading;
  if (window.marked && (window.marked.parse || window.marked.Marked)){ NS.markedReady = true; return Promise.resolve(true); }
  NS.markedLoading = new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = NS.config.markedSrc;
    s.crossOrigin = 'anonymous';
    s.onload = function(){ s.remove(); if (window.marked && (window.marked.parse || window.marked.Marked)) resolve(true); else reject(Error('marked loaded but unusable')); };
    s.onerror = function(){ s.remove(); reject(Error('marked blocked/unavailable: ' + NS.config.markedSrc)); };
    document.head.appendChild(s);
  }).then(function(ok){
    NS.markedReady = ok; NS.markedLoading = null;
    injectMarkedCss();
    try { if (typeof renderFullChat === 'function') renderFullChat(); } catch(e){}
    return ok;
  }).catch(function(e){
    NS.markedLoading = null; warn(e.message);
    return false;
  });
  return NS.markedLoading;
}
function applyMarkedOverride(){
  if (!NS.flags.marked) return;
  if (NS.formatMarkdownPatched) return;
  captureOrigMarkdown();
  try { formatMarkdown = renderMarked; NS.formatMarkdownPatched = true; }
  catch(e){ warn('could not patch formatMarkdown: ' + e.message); }
}
function removeMarkedOverride(){
  if (NS.formatMarkdownPatched && NS.origFormatMarkdown){
    try { formatMarkdown = NS.origFormatMarkdown; } catch(e){}
    NS.formatMarkdownPatched = false;
  }
}

/* ---------- apply / disable / api ---------- */
function apply(){
  window.eval1b1 = NS.flags.marked; window.eval1b2 = NS.flags.anthropic;
  window.eval1b3 = NS.flags.hybrid;  window.eval1b4 = NS.flags.pill;
  window.eval1b5 = NS.flags.bridgeStream; window.eval1b6 = NS.flags.toolEval;
  window.eval1b7 = NS.flags.pricing;

  if (NS.flags.marked){ applyMarkedOverride(); loadMarked(); }
  else removeMarkedOverride();

  if (NS.flags.toolEval){ installTools(); } else { removeTools(); }
  if (NS.flags.pricing){ installPricing(); } else { removePricing(); }

  var handlers = [];
  if (NS.flags.anthropic) handlers.push(anthropicHandler);
  if (NS.flags.hybrid) handlers.push(responsesHandler, coalescerHandler);

  var chained = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
    var opts = init || {};
    var method = String(opts.method || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'POST') return NS.origFetch.call(this, input, init);
    for (var i = 0; i < handlers.length; i++){
      var r = handlers[i].call(this, input, init, url, opts);
      if (r) return r;
    }
    return NS.origFetch.call(this, input, init);
  };
  NS.chained = chained;
  window.fetch = chained;

  if (NS.flags.pill) ensureStatusPill(); else removeStatusPill();
  updateStatus();
  NS.installed = true;
  try { console.log('[eval1] applied v' + NS.version + ' — flags: ' + JSON.stringify(NS.flags) + ' | controls: __eval1.setFlag()/.setMode()/.disable()/.status()'); } catch(e){}
}
function disable(){
  if (NS.chained && window.fetch === NS.chained) window.fetch = NS.origFetch;
  removeMarkedOverride();
  removeTools();
  removePricing();
  removeStatusPill();
  NS.installed = false;
  try { console.log('[eval1] disabled — original fetch + executeAPI + pricing restored. Re-paste to re-enable.'); } catch(e){}
}
NS.apply = apply;
NS.disable = disable;
NS.setFlag = function(name, val){
  if (!(name in NS.flags)) throw Error('unknown flag: ' + name);
  NS.flags[name] = val ? 1 : 0;
  apply();
  return JSON.parse(JSON.stringify(NS.flags));
};
NS.setMode = function(m){ if (['auto','chat','responses'].indexOf(m) < 0) throw Error('mode must be auto|chat|responses'); NS.config.mode = m; saveConfig(); updateStatus(); return NS.config.mode; };
NS.setWebSearch = function(v){ NS.config.webSearch = !!v; saveConfig(); updateStatus(); return NS.config.webSearch; };
NS.setShowSearchTrace = function(v){ NS.config.showSearchTrace = !!v; saveConfig(); updateStatus(); return NS.config.showSearchTrace; };
NS.setPaintInterval = function(ms){ NS.config.paintIntervalMs = Math.max(40, +ms || 160); saveConfig(); return NS.config.paintIntervalMs; };
NS.status = function(){ return JSON.parse(JSON.stringify({ version: NS.version, flags: NS.flags, config: NS.config, stats: NS.stats, installed: NS.installed })); };

apply();
})();

/* ===================== PART 2 — EXP TAB + INFO POPUPS ===================== */
(function(){
'use strict';
var NS = window.__eval1;
if (!NS){ console.warn('[exp] eval1 core not found — paste the whole file (core is above).'); return; }

var EXP_INFO = {
  tab: { t:'About this tab', h:'Experimental controls injected by the eval1 package. Each toggle maps to <code>__eval1.setFlag(...)</code> / <code>__eval1.setMode(...)</code> and persists via localStorage (<code>dse_eval1_config</code>). Re-paste this file after a page reload — the tab and fetch chain are in-memory.' },
  mode: { t:'API mode', h:'<b>auto</b> — per-model routing (recommended)<br><b>chat</b> — force Chat Completions; DeepSeek requests go through the anthropic bridge (web search)<br><b>responses</b> — profiled models (<code>deepseek-v4-flash</code>, <code>deepseek-v4-pro</code>, <code>gpt-5.6-sol/terra/luna</code>) are translated to the <code>/responses</code> API. Non-profiled models fall back to chat.' },
  webSearch: { t:'Web search', h:'Attach the server-side web_search tool where supported:<br>• anthropic bridge → <code>web_search_20250305</code><br>• responses adapter → <code>tools:[{type:"web_search"}]</code><br>Toggle off to send plain (non-searching) requests.' },
  showTrace: { t:'Show 🔎 trace', h:'When on, every executed search is printed as <code>[web_search] query</code> inside the thinking block, and the header pill shows a running 🔎 count. The trace is stored with the message, so it survives reload. Turn off to keep searches invisible (they still run).' },
  paint: { t:'Paint interval', h:'Milliseconds between streaming UI updates (delta coalescer).<br>• Lower = smoother updates, more renders<br>• 160 ms ≈ 6 renders/sec and eliminates the quadratic Markdown reparse freeze on long streams<br>• Minimum 40 ms' },
  marked: { t:'Marked tables', h:'Replaces the built-in lightweight Markdown parser with <b>marked.js</b> (pinned CDN <code>marked@18.0.9/lib/marked.umd.js</code>) for GFM: tables, strikethrough, etc. Code blocks keep the app’s custom copy/collapse UI.<br><span style="color:var(--warning)">Raw HTML is NOT sanitized</span> — be careful with untrusted model output.' },
  anthropic: { t:'Anthropic bridge', h:'DeepSeek Chat requests are rewritten to <code>api.deepseek.com/anthropic/v1/messages</code> with the <code>web_search_20250305</code> tool.<br>Requires this toggle ON. <span style="color:var(--warning)">Without "Streaming bridge" below, the bridge is non-streaming</span> — you see the whole answer only after all thinking is done.<br>Requests that carry local function tools (e.g. <code>tool_eval_1</code>) automatically bypass this bridge.' },
  bridgeStream: { t:'Streaming anthropic bridge', h:'When <b>ON</b> (and Anthropic bridge is ON), DeepSeek chat-mode requests use <code>stream:true</code> upstream and <code>thinking_delta</code>/<code>text_delta</code> are translated into live Chat chunks — <span style="color:var(--success)">thinking + content stream in real time</span> (coalesced to the paint interval). Web-search tool-use is still detected and counted, and the query is shown as <code>[web_search] …</code> in the thinking block.<br>When <b>OFF</b>, the bridge behaves as before: non-streaming, whole answer arrives after thinking completes.' },
  toolEval: { t:'Tool eval (tool_eval_1)', h:'Registers <code>tool_eval_1</code> — a function tool the chat model can call to run arbitrary JavaScript in your browser and return JSON.<br><br>• <b>Isolated worker</b> by default (10 s timeout, max 60 s); <code>worker:false</code> runs in page scope with app globals.<br>• Patching <code>executeAPI</code> enables the tool-call loop (Chat), and the <code>/responses</code> adapter now has a <b>function_call / function_call_output executor loop</b>, so the tool works in responses mode too (up to 6 follow-up turns).<br>• Header pill shows 🔧<i>count</i> of executed tools.<br><br><span style="color:var(--danger)">⚠ SECURITY: this tool can read everything in the page (API keys, chat history) and call fetch. Only enable if you trust the model + provider. Keep it off when not experimenting.</span>' },
  hybrid: { t:'Responses hybrid', h:'Profiled models are translated Chat → <code>/responses</code> (instructions, input items, max_output_tokens, web_search tool). SSE from <code>/responses</code> is translated back to Chat chunks the app understands.<br><span style="color:var(--success)">Streaming:</span> reasoning and content arrive live.<br>Currently profiled: <code>deepseek-v4-flash</code>, <code>deepseek-v4-pro</code>, <code>gpt-5.6-sol</code>, <code>gpt-5.6-terra</code>, <code>gpt-5.6-luna</code>. Both DeepSeek V4 models now support /responses (verified).<br>Function tools (like tool_eval_1) run through the built-in executor loop instead of falling back.' },
  pricing: { t:'DeepSeek peak pricing', h:'<b>Message-send-time based peak/off-peak rates.</b> No legacy/epoch switching — the new pricing is already in effect.<br><br>Peak windows (UTC): <b>[01:00, 04:00)</b> and <b>[06:00, 10:00)</b>.<br>Off-peak = exactly half of peak.<br><br>Rates applied when usage is recorded:<br>• Flash peak: hit $0.014/M · miss $0.44/M · out $1.32/M<br>• Flash off:  hit $0.007/M · miss $0.22/M · out $0.66/M<br>• Pro peak:   hit $0.044/M · miss $1.32/M · out $3.96/M<br>• Pro off:    hit $0.022/M · miss $0.66/M · out $1.98/M<br><br>Implemented by wrapping <code>applyResponseMetadata</code>, so cost pills reflect the correct window on all paths (chat, bridge, responses).' },
  pill: { t:'Status pill', h:'Shows the small header indicator: <code>API &lt;mode&gt; · &lt;last model&gt; · 🔎count · 🔧count</code>.<br>• Click it to cycle auto → chat → responses<br>• Hover for stats<br>• Toggle off to hide it' },
  route: { t:'Routing', h:'Live summary of where the next request will go given current mode + toggles.<br>• DeepSeek → anthropic bridge (chat) or <code>/responses</code> (responses mode)<br>• OpenAI profiled → <code>/responses</code><br>• Gemini / Z.ai / custom → chat (still coalesced)<br>• Function tools → <code>/responses</code> executor loop (responses mode) or chat tool loop<br>Requests are logged to the browser console as <code>[eval1] → model → provider /responses</code>.' }
};

function qs(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function injectCss(){
  if (qs('expStyle')) return;
  var s=document.createElement('style');
  s.id='expStyle';
  s.textContent =
    '.exp-info{background:none;border:1px solid var(--border);color:var(--text-secondary);border-radius:50%;width:17px;height:17px;font-size:10px;line-height:1;padding:0;cursor:help;vertical-align:middle;margin-left:4px;flex-shrink:0}' +
    '.exp-info:hover{background:var(--border);color:var(--text)}' +
    '.exp-popup-wrap{position:fixed;inset:0;z-index:8900;pointer-events:none}' +
    '.exp-popup-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45);pointer-events:none}' +
    '.exp-popup{position:absolute;top:max(64px,calc(env(safe-area-inset-top,0px) + 56px + 8px));left:50%;transform:translateX(-50%);width:min(540px,calc(100dvw - 24px));max-height:calc(100dvh - 120px);display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.6);pointer-events:auto;overflow:hidden}' +
    '.exp-popup-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600;font-size:.85rem}' +
    '.exp-popup-x{background:none;border:none;color:var(--text-secondary);font-size:1.2rem;cursor:pointer;line-height:1;padding:0 4px}' +
    '.exp-popup-x:hover{color:var(--text)}' +
    '.exp-popup-body{padding:12px 14px;overflow-y:auto;font-size:.78rem;line-height:1.6;color:var(--text)}' +
    '.exp-popup-body code{background:var(--code-bg);padding:1px 5px;border-radius:4px;font-size:.72rem}' +
    '.exp-popup-foot{padding:8px 14px;border-top:1px solid var(--border);display:flex;justify-content:flex-end}' +
    '.exp-popup-close{background:var(--accent);color:#fff;border:none;padding:5px 14px;border-radius:8px;font-size:.75rem;cursor:pointer}';
  document.head.appendChild(s);
}

function popup(){ return qs('expPopupWrap'); }
function closePopup(){ var w=popup(); if (w) w.remove(); }
function openPopup(key){
  var info=EXP_INFO[key]||EXP_INFO.tab;
  closePopup();
  var wrap=document.createElement('div');
  wrap.id='expPopupWrap';
  wrap.className='exp-popup-wrap';
  wrap.innerHTML =
    '<div class="exp-popup-backdrop"></div>' +
    '<div class="exp-popup" role="dialog" aria-modal="true">' +
      '<div class="exp-popup-head"><span>'+esc(info.t)+'</span><button class="exp-popup-x" data-expx="1" aria-label="Close">×</button></div>' +
      '<div class="exp-popup-body">'+info.h+'</div>' +
      '<div class="exp-popup-foot"><button class="exp-popup-close" data-expx="1">Close</button></div>' +
    '</div>';
  document.body.appendChild(wrap);
  wrap.addEventListener('click', function(e){
    if (e.target.closest('[data-expx]')){ closePopup(); return; }
    if (e.target.closest('.exp-popup')) e.stopPropagation();
    else closePopup();
  });
  if (!NS._expEsc){
    NS._expEsc=function(e){ if (e.key==='Escape') closePopup(); };
    document.addEventListener('keydown', NS._expEsc, true);
  }
}

document.addEventListener('click', function(e){
  if (!popup()) return;
  var t=e.target;
  if (t && t.closest && (t.closest('.exp-popup') || t.closest('[data-expinfo]'))) return;
  closePopup();
}, true);

function toggle(id){ return '<label class="toggle"><input type="checkbox" id="'+id+'"><span class="slider"></span></label>'; }
function infoBtn(key){ return '<button type="button" class="exp-info" data-expinfo="'+key+'" title="'+esc(EXP_INFO[key].t)+'">ⓘ</button>'; }
function row(label,key,control){
  return '<div class="setting-row"><span>'+esc(label)+' '+infoBtn(key)+'</span>'+control+'</div>';
}
function removeExisting(){
  var b=document.querySelector('.tab-btn[data-tab="exp"]');
  if (b) b.remove();
  var c=qs('tab-exp');
  if (c) c.remove();
  closePopup();
}
function buildTab(){
  removeExisting();
  var swarmBtn=document.querySelector('.tab-btn[data-tab="swarm"]');
  var swarmTab=qs('tab-swarm');
  if (!swarmBtn || !swarmTab){ console.warn('[exp] swarm tab missing — cannot inject.'); return; }
  swarmBtn.insertAdjacentHTML('afterend','<button class="tab-btn" data-tab="exp">Exp</button>');
  var html =
    '<div class="tab-content" id="tab-exp">' +
      row('About', 'tab', '<span style="font-size:.68rem;color:var(--text-secondary)">experimental controls</span>') +
      row('API mode', 'mode', '<select id="expMode"><option value="auto">auto</option><option value="chat">chat</option><option value="responses">responses</option></select>') +
      row('Web search', 'webSearch', toggle('expWebSearch')) +
      row('Show 🔎 trace', 'showTrace', toggle('expShowTrace')) +
      row('Paint interval (ms)', 'paint', '<input type="number" id="expPaint" min="40" step="10" style="width:75px">') +
      row('Marked tables', 'marked', toggle('expMarked')) +
      row('Anthropic bridge', 'anthropic', toggle('expAnthropic')) +
      row('Streaming bridge', 'bridgeStream', toggle('expBridgeStream')) +
      row('Tool eval (tool_eval_1)', 'toolEval', toggle('expToolEval')) +
      row('Responses hybrid', 'hybrid', toggle('expHybrid')) +
      row('DeepSeek peak pricing', 'pricing', toggle('expPricing')) +
      row('Status pill', 'pill', toggle('expPill')) +
      row('Routing', 'route', '<span id="expRoute" style="font-size:.68rem;color:var(--text-secondary);font-family:monospace;overflow-wrap:anywhere"></span>') +
    '</div>';
  swarmTab.insertAdjacentHTML('afterend', html);
  var btn=document.querySelector('.tab-btn[data-tab="exp"]');
  btn._=qs('tab-exp');
}
function updateRoute(){
  var el=qs('expRoute'); if (!el) return;
  var m=NS.config.mode, parts=[];
  if (m==='responses') parts.push('deepseek flash/pro + gpt-5.6 → /responses');
  else if (m==='chat') parts.push('all → chat (deepseek → anthropic bridge' + (NS.flags.bridgeStream ? ' streaming' : '') + ')');
  else parts.push('deepseek → anthropic bridge' + (NS.flags.bridgeStream ? ' (streaming)' : '') + ' · openai profiled → /responses · others → chat');
  if (NS.flags.toolEval) parts.push('tool_eval_1 ON');
  if (NS.flags.pricing) parts.push('peak pricing ON');
  if (!NS.flags.anthropic) parts.push('anthropic OFF');
  if (!NS.flags.hybrid) parts.push('hybrid OFF');
  el.textContent=parts.join(' · ');
}
function syncUI(){
  var v=function(id,val){ var el=qs(id); if (el) el.value=val; };
  var c=function(id,val){ var el=qs(id); if (el) el.checked=!!val; };
  v('expMode', NS.config.mode);
  c('expWebSearch', NS.config.webSearch);
  c('expShowTrace', NS.config.showSearchTrace);
  v('expPaint', NS.config.paintIntervalMs);
  c('expMarked', NS.flags.marked);
  c('expAnthropic', NS.flags.anthropic);
  c('expBridgeStream', NS.flags.bridgeStream);
  c('expToolEval', NS.flags.toolEval);
  c('expHybrid', NS.flags.hybrid);
  c('expPricing', NS.flags.pricing);
  c('expPill', NS.flags.pill);
  updateRoute();
}
function bind(){
  var on=function(id,ev,fn){ var el=qs(id); if (el) el.addEventListener(ev,fn); };
  on('expMode','change',function(e){ NS.setMode(e.target.value); updateRoute(); });
  on('expWebSearch','change',function(e){ NS.setWebSearch(e.target.checked); });
  on('expShowTrace','change',function(e){ NS.setShowSearchTrace(e.target.checked); });
  on('expPaint','change',function(e){ var v=parseFloat(e.target.value); if (Number.isFinite(v)&&v>=40) NS.setPaintInterval(v); });
  on('expMarked','change',function(e){ NS.setFlag('marked', e.target.checked?1:0); syncUI(); });
  on('expAnthropic','change',function(e){ NS.setFlag('anthropic', e.target.checked?1:0); syncUI(); });
  on('expBridgeStream','change',function(e){ NS.setFlag('bridgeStream', e.target.checked?1:0); syncUI(); });
  on('expToolEval','change',function(e){ NS.setFlag('toolEval', e.target.checked?1:0); syncUI(); });
  on('expHybrid','change',function(e){ NS.setFlag('hybrid', e.target.checked?1:0); syncUI(); });
  on('expPricing','change',function(e){ NS.setFlag('pricing', e.target.checked?1:0); syncUI(); });
  on('expPill','change',function(e){ NS.setFlag('pill', e.target.checked?1:0); syncUI(); });
  document.querySelectorAll('#tab-exp [data-expinfo]').forEach(function(b){
    b.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openPopup(b.dataset.expinfo); });
  });
}
injectCss();
buildTab();
syncUI();
bind();
try { console.log('[exp] Exp tab installed — Settings → Exp → click ⓘ on any row for details.'); } catch(e){}
})();
