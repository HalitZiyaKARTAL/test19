/* =============================================================
   EVAL1 v2.1 — all-in-one upgrade for the AI Chat app
   Folded in, each independently toggleable:
     eval1b1 — marked tables/GFM renderer
     eval1b2 — DeepSeek anthropic web-search bridge
     eval1b3 — responses API hybrid + delta coalescer (P0/P1)
     eval1b4 — status pill
   -------------------------------------------------------------
   v2.1 fix: searchCalls now counts ONLY real searches.
     (v2.0 counted every bridge response — inflated the 🔎 counter.)
   Idempotent: paste any number of times, no double-wraps.
   Permanently disable a part BEFORE pasting (or re-paste after):
     eval1b2 = 0;   // turns off anthropic bridge
   Or after install:  __eval1.setFlag('anthropic', 0)
   Controls:  __eval1.setFlag() .setMode() .setWebSearch()
              .setShowSearchTrace() .setPaintInterval()
              .disable() .status()
   ============================================================= */
var eval1b1 = window.eval1b1 ?? 1; /* marked */
var eval1b2 = window.eval1b2 ?? 1; /* anthropic web search */
var eval1b3 = window.eval1b3 ?? 1; /* responses hybrid + coalescer */
var eval1b4 = window.eval1b4 ?? 1; /* status pill */

(function(){
'use strict';
var NS = window.__eval1 || (window.__eval1 = {});
var FIRST = !NS.installed;

if (FIRST){
  /* remove older single-purpose installs so the chain starts clean */
  try { if (window.__hybridUpgrade && window.__hybridUpgrade.disable) window.__hybridUpgrade.disable(); } catch(e){}
  try { if (window.DeepSeekWebSearch && window.DeepSeekWebSearch.restore) window.DeepSeekWebSearch.restore(); } catch(e){}
  NS.version = '2.1';
  NS.origFetch = (window.fetch || fetch).bind(window);
  NS.installed = false;
  NS.flags = {};
  NS.stats = { transformed:0, passthrough:0, searchCalls:0, last:{} };
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
  /* re-capture after a disable + external change */
  NS.origFetch = (window.fetch || fetch).bind(window);
}

/* window vars are the source of truth; 0 stays 0 */
(function(){
  var defs = { marked:eval1b1, anthropic:eval1b2, hybrid:eval1b3, pill:eval1b4 };
  for (var k in defs) NS.flags[k] = defs[k] ? 1 : 0;
})();

function saveConfig(){ try { localStorage.setItem('dse_eval1_config', JSON.stringify(NS.config)); } catch(e){} }
function warn(msg){ try { console.warn('[eval1] ' + msg); } catch(e){} }
function updateStats(mode, model, url){
  NS.stats.last = { mode: mode, model: model, url: url, ts: Date.now() };
}

/* ================= status pill ================= */
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
  el.textContent = s;
  el.title = 'mode:' + NS.config.mode +
    (NS.stats.last.id ? ' · id:' + NS.stats.last.id : '') +
    ' · transformed:' + NS.stats.transformed +
    ' · passthrough:' + NS.stats.passthrough +
    ' · searchCalls:' + NS.stats.searchCalls;
}

/* ================= shared helpers ================= */
function cloneHeaders(h){
  if (!h) return {};
  if (typeof Headers !== 'undefined' && h instanceof Headers){
    var o = {}; h.forEach(function(v,k){ o[k] = v; }); return o;
  }
  var out = {}; for (var k in h) out[k] = h[k]; return out;
}
function encodeText(s){ return new TextEncoder().encode(s); }

/* ================= anthropic web-search bridge ================= */
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
              (x.input && (x.input.type === 'web_search' ||
                           x.input.name === 'web_search')));
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
function anthropicHandler(input, init, url, opts){
  if (NS.config.mode === 'responses') return null; /* user wants Responses; let hybrid handle */
  if (!/api\.deepseek\.com\/?(?:v1\/)?chat\/completions(?:\?|$)/i.test(url)) return null;
  if (typeof opts.body !== 'string') return null;
  var original;
  try { original = JSON.parse(opts.body); } catch(e){ return null; }
  var headers = new Headers(opts.headers || (input && input instanceof Request ? input.headers : undefined));
  var key = (headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key) return null;
  var converted = toAnthropic(original.messages || []);
  var upstream = {
    model: original.model,
    max_tokens: original.max_tokens != null ? original.max_tokens : (original.max_completion_tokens != null ? original.max_completion_tokens : 384000),
    messages: converted.messages, tools: [SEARCH_TOOL], stream: false
  };
  if (converted.system) upstream.system = converted.system;
  ['temperature','top_p','thinking','reasoning_effort'].forEach(function(n){ if (original[n] != null) upstream[n] = original[n]; });
  return NS.origFetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type':'application/json', 'authorization':'Bearer ' + key, 'x-api-key': key, 'anthropic-version':'2023-06-01' },
    body: JSON.stringify(upstream), signal: opts.signal
  }).then(function(resp){
    updateStats('anthropic', original.model, ANTHROPIC_ENDPOINT);
    updateStatus();
    return resp.text().then(function(rawText){
      if (!resp.ok) return new Response(rawText, { status: resp.status, statusText: resp.statusText, headers: { 'content-type': resp.headers.get('content-type') || 'application/json' } });
      var data;
      try { data = JSON.parse(rawText); } catch(e){ throw Error('Anthropic endpoint invalid JSON: ' + rawText.slice(0,500)); }
      var answer = toAnswer(data);
      /* v2.1 fix: count ONLY real searches, not every bridge response */
      if (answer.searched) NS.stats.searchCalls++;
      updateStatus();
      if (original.stream) return new Response(openAIStream(answer, original.model), { status:200, headers:{ 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-cache' } });
      return new Response(JSON.stringify(openAIJson(answer, original.model)), { status:200, headers:{ 'content-type':'application/json; charset=utf-8' } });
    });
  });
}

/* ================= responses hybrid ================= */
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
    if (m.role === 'system' || m.role === 'developer') sys.push(String(m.content || ''));
    else if (m.role === 'user' || m.role === 'assistant') input.push({ role: m.role, content: String(m.content || '') });
    else input.push({ role: 'user', content: '[tool] ' + String(m.content || '') });
  });
  if (!input.length) return null;
  var req = { model: chat.model, input: input, stream: !!chat.stream };
  if (sys.length) req.instructions = sys.join('\n\n');
  var max = chat.max_tokens != null ? chat.max_tokens : chat.max_completion_tokens;
  if (max) req.max_output_tokens = max;
  if (typeof chat.temperature === 'number' && plan.provider !== 'deepseek') req.temperature = chat.temperature;
  if (NS.config.webSearch && plan.webSearch){
    if (NS.config.webSearchStyle === 'tool') req.tool = 'web_search';
    else req.tools = [{ type: 'web_search' }];
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
function makeCoalescedStream(sourceBody, translate){
  return new ReadableStream({
    start: function(controller){
      var reader = sourceBody.getReader(), decoder = new TextDecoder(), buffer = '', closed = false;
      var acc = { content: '', reasoning: '' }, timer = 0;
      function enqueue(text){ if (!closed) try { controller.enqueue(encodeText(text)); } catch(e){} }
      function flushAcc(){
        if (timer){ clearTimeout(timer); timer = 0; }
        if (acc.content || acc.reasoning){
          var delta = {};
          if (acc.content) delta.content = acc.content;
          if (acc.reasoning) delta.reasoning_content = acc.reasoning;
          enqueue('data: ' + JSON.stringify({ choices: [{ delta: delta }] }) + '\n\n');
          acc.content = ''; acc.reasoning = '';
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
  var rReq = buildResponsesRequest(payload, plan);
  if (!rReq) return null;
  var base = url.replace(/\/chat\/completions(\?|$)/, '');
  var rUrl = base + plan.path;
  try { console.log('[eval1] → ' + (payload.model || '?') + ' → ' + plan.provider + ' /responses', { url: rUrl, instructions: String(rReq.instructions || '').slice(0,60) + '…', inputItems: (rReq.input || []).length, tool: rReq.tool || (rReq.tools && rReq.tools[0] && rReq.tools[0].type), max_output_tokens: rReq.max_output_tokens, stream: rReq.stream }); } catch(e){}
  var rInit = {};
  for (var k in opts) if (k !== 'body') rInit[k] = opts[k];
  rInit.headers = cloneHeaders(opts.headers);
  rInit.headers['Content-Type'] = 'application/json';
  rInit.body = JSON.stringify(rReq);
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
    if (payload.stream && upstream.body){
      return new Response(makeCoalescedStream(upstream.body, translateResponsesEvent), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return upstream.json().then(function(data){
      if (data.status === 'failed'){
        var em = (data.error && data.error.message) || 'Responses request failed.';
        return new Response(JSON.stringify({ error: { message: em } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(translateFinal(data, plan)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
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

/* ================= marked ================= */
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

/* ================= apply / disable / api ================= */
function apply(){
  /* keep window vars in sync so re-pastes agree with runtime toggles */
  window.eval1b1 = NS.flags.marked; window.eval1b2 = NS.flags.anthropic;
  window.eval1b3 = NS.flags.hybrid;  window.eval1b4 = NS.flags.pill;

  if (NS.flags.marked){ applyMarkedOverride(); loadMarked(); }
  else removeMarkedOverride();

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
  removeStatusPill();
  NS.installed = false;
  try { console.log('[eval1] disabled — original fetch restored. Re-paste to re-enable.'); } catch(e){}
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
return NS;
})();
