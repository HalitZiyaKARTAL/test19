/* =====================================================================
   HYBRID UPGRADE PACKAGE v1.0 — eval-console edition
   For the AI Chat app. Reversible via __hybridUpgrade.disable().
   Features:
     1. Responses API adapter (fetch proxy) for profiled models
     2. Delta coalescer -> kills quadratic Markdown reparse on streams
     3. Web-search tool + visible [web_search] trace in thinking
     4. Usage translation so billing/cost pills keep working
     5. Status pill in header (click to cycle auto/chat/responses)
     6. Console request preview (no API keys logged)
   ===================================================================== */
(function(){
  'use strict';
  if (window.__hybridUpgrade){
    console.log('[hybrid] already installed. Run __hybridUpgrade.disable() first to reinstall.');
    return;
  }
  var VERSION = '1.0';
  var DEFAULT_CONFIG = {
    enabled: true,
    mode: 'auto',            // 'auto' | 'chat' | 'responses'
    webSearch: true,         // attach server web_search tool
    webSearchStyle: 'tools', // 'tools' (OpenAI style) or 'tool' (some providers)
    showSearchTrace: true,   // surface search calls in thinking block
    paintIntervalMs: 160     // delta coalescing cadence
  };
  var config = loadConfig();
  function loadConfig(){
    try {
      var raw = JSON.parse(localStorage.getItem('dse_hybrid_config') || '{}');
      for (var k in DEFAULT_CONFIG) if (raw[k] === undefined) raw[k] = DEFAULT_CONFIG[k];
      return raw;
    } catch(e){ return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }
  }
  function saveConfig(){ try { localStorage.setItem('dse_hybrid_config', JSON.stringify(config)); } catch(e){} }

  /* ---------- profiled models ---------- */
  var MODELS = {
    'deepseek-v4-pro':   { provider:'deepseek', path:'/responses', webSearch:true },
    'deepseek-v4-flash': { provider:'deepseek', path:'/responses', webSearch:true },
    'gpt-5.6-sol':       { provider:'openai',  path:'/responses', webSearch:true },
    'gpt-5.6-terra':     { provider:'openai',  path:'/responses', webSearch:true },
    'gpt-5.6-luna':      { provider:'openai',  path:'/responses', webSearch:true }
  };
  var PROVIDER_HOSTS = { deepseek:['api.deepseek.com'], openai:['api.openai.com'] };
  var warned = {};

  var stats = { transformed:0, passthrough:0, searchCalls:0, last:{ mode:'', model:'', url:'', id:'', ts:0 } };

  /* ---------- helpers ---------- */
  function cloneHeaders(h){
    if (!h) return {};
    if (typeof Headers !== 'undefined' && h instanceof Headers){
      var o = {}; h.forEach(function(v,k){ o[k] = v; });
      return o;
    }
    var out = {};
    for (var k in h) out[k] = h[k];
    return out;
  }

  /* ---------- status pill ---------- */
  function ensureStatusPill(){
    var el = document.getElementById('hybridStatus');
    if (!el){
      el = document.createElement('span');
      el.id = 'hybridStatus';
      el.style.cssText = 'font-size:0.68rem;padding:2px 8px;border-radius:6px;' +
        'background:var(--border);color:var(--text-secondary);' +
        'font-family:monospace;white-space:nowrap;cursor:help;';
      el.title = 'Hybrid adapter — click to cycle API mode';
      el.addEventListener('click', function(){
        var m = config.mode === 'responses' ? 'chat' : (config.mode === 'chat' ? 'auto' : 'responses');
        config.mode = m; saveConfig(); updateStatus();
        console.log('[hybrid] mode → ' + m);
      });
      var hr = document.querySelector('.header-right');
      if (hr) hr.insertBefore(el, hr.firstChild);
    }
    return el;
  }
  function updateStatus(){
    var el = ensureStatusPill();
    var s = 'API ' + (stats.last.mode || (config.enabled ? config.mode : 'off'));
    if (stats.last.model) s += ' · ' + stats.last.model;
    if (stats.searchCalls && config.showSearchTrace) s += ' · 🔎' + stats.searchCalls;
    el.textContent = s;
    el.title = 'mode:' + config.mode + (stats.last.id ? ' · id:' + stats.last.id : '') +
      ' · transformed:' + stats.transformed + ' · passthrough:' + stats.passthrough;
  }

  /* ---------- request preview (console only, no keys) ---------- */
  function logPreview(plan, rReq, rUrl){
    console.log('[hybrid] → ' + plan.model + ' → ' + plan.provider + ' /responses', {
      url: rUrl,
      instructions: String(rReq.instructions || '').slice(0, 60) + '…',
      inputItems: (rReq.input || []).length,
      tool: rReq.tool || (rReq.tools && rReq.tools[0] && rReq.tools[0].type),
      max_output_tokens: rReq.max_output_tokens,
      stream: rReq.stream
    });
  }

  /* ---------- request building ---------- */
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
    if (config.webSearch && plan.webSearch){
      if (config.webSearchStyle === 'tool') req.tool = 'web_search';
      else req.tools = [{ type: 'web_search' }];
    }
    return req;
  }

  /* ---------- usage translation ---------- */
  function mapUsage(u){
    if (!u || typeof u !== 'object') return undefined;
    var o = {};
    if (typeof u.input_tokens === 'number') o.prompt_tokens = u.input_tokens;
    if (typeof u.output_tokens === 'number') o.completion_tokens = u.output_tokens;
    if (typeof u.total_tokens === 'number') o.total_tokens = u.total_tokens;
    var inD = u.input_tokens_details;
    if (inD && typeof inD.cached_tokens === 'number') o.prompt_tokens_details = { cached_tokens: inD.cached_tokens };
    var outD = u.output_tokens_details;
    if (outD && typeof outD.reasoning_tokens === 'number') o.completion_tokens_details = { reasoning_tokens: outD.reasoning_tokens };
    return Object.keys(o).length ? o : undefined;
  }

  /* ---------- responses event -> chat event ---------- */
  function translateResponsesEvent(ev){
    switch (ev.type){
      case 'response.created':
        if (ev.response && ev.response.id) stats.last.id = ev.response.id;
        return null;
      case 'response.output_text.delta':
        return { choices: [{ delta: { content: ev.delta || '' } }] };
      case 'response.reasoning_text.delta':
        return { choices: [{ delta: { reasoning_content: ev.delta || '' } }] };
      case 'response.output_item.done': {
        var item = ev.item || {};
        if (item.type === 'web_search_call'){
          stats.searchCalls++;
          if (config.showSearchTrace){
            var q = (item.action && (item.action.search_query || item.action.query)) || 'web search';
            return { choices: [{ delta: { reasoning_content: '[web_search] ' + q } }] };
          }
        }
        return null;
      }
      case 'response.completed':
      case 'response.incomplete':
        return { finish: true, usage: mapUsage(ev.response && ev.response.usage) };
      case 'response.failed': {
        var msg = (ev.response && ev.response.error && ev.response.error.message) || 'Responses request failed.';
        return { error: new Error(msg) };
      }
      default:
        return null;
    }
  }

  /* ---------- delta coalescer (the P0 renderer fix) ---------- */
  function makeCoalescedStream(sourceBody, translate){
    return new ReadableStream({
      start: function(controller){
        var reader = sourceBody.getReader();
        var decoder = new TextDecoder();
        var buffer = '';
        var closed = false;
        var acc = { content: '', reasoning: '' };
        var timer = 0;

        function enqueue(text){
          if (closed) return;
          try { controller.enqueue(new TextEncoder().encode(text)); } catch(e){}
        }
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
          timer = setTimeout(function(){ timer = 0; flushAcc(); }, config.paintIntervalMs);
        }
        function finish(){
          if (closed) return;
          flushAcc();
          closed = true;
          enqueue('data: [DONE]\n\n');
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
          try { ev = JSON.parse(data); } catch(e){ console.warn('[hybrid] skipped malformed SSE', String(data).slice(0,120)); return; }
          var out;
          try { out = translate ? translate(ev) : ev; } catch(e){ out = { error: e }; }
          if (!out) return;
          if (out.error){
            if (!closed){ closed = true; try { controller.error(out.error); } catch(e){} }
            return;
          }
          if (out.finish){
            if (out.usage){
              flushAcc();
              enqueue('data: ' + JSON.stringify({ choices: [{ delta: {} }], usage: out.usage }) + '\n\n');
            }
            finish();
            return;
          }
          var delta = out.choices && out.choices[0] && out.choices[0].delta || {};
          if (delta.content){ acc.content += delta.content; scheduleFlush(); }
          if (delta.reasoning_content){ acc.reasoning += delta.reasoning_content; scheduleFlush(); }
          if (out.usage){
            flushAcc();
            enqueue('data: ' + JSON.stringify({ choices: [{ delta: {} }], usage: out.usage }) + '\n\n');
          }
        }
        (function pump(){
          reader.read().then(function(res){
            if (closed){ try { reader.cancel(); } catch(e){} return; }
            if (res.done){ finish(); return; }
            buffer += decoder.decode(res.value, { stream: true });
            var m;
            while (!closed && (m = buffer.search(/\n\n|\r\n\r\n/)) !== -1){
              var sep = buffer[m] === '\r' ? 4 : 2;
              var block = buffer.slice(0, m);
              buffer = buffer.slice(m + sep);
              handleBlock(block);
            }
            pump();
          }).catch(function(err){
            if (!closed){ closed = true; try { controller.error(err); } catch(e){} }
          });
        })();
      }
    });
  }

  /* ---------- non-stream final translation ---------- */
  function translateFinal(data, plan){
    var content = '', reasoning = '';
    (data.output || []).forEach(function(item){
      if (item.type === 'message' && Array.isArray(item.content)){
        item.content.forEach(function(c){ if (c && c.type === 'output_text') content += c.text || ''; });
      } else if (item.type === 'reasoning'){
        (item.summary || []).forEach(function(s){ if (s && s.type === 'summary_text') reasoning += s.text || ''; });
        if (!reasoning && typeof item.encrypted_content === 'string') reasoning = '[encrypted reasoning]';
      } else if (item.type === 'web_search_call'){
        stats.searchCalls++;
        var q = item.action && (item.action.search_query || item.action.query);
        if (config.showSearchTrace && q) reasoning += (reasoning ? '\n' : '') + '[web_search] ' + q;
      }
    });
    var status = data.status === 'failed' ? 'error' : (data.status === 'incomplete' ? 'length' : 'stop');
    var usage = mapUsage(data.usage);
    return {
      id: data.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.model || plan.model,
      choices: [{ index: 0, message: { role: 'assistant', content: content, reasoning_content: reasoning }, finish_reason: status }],
      usage: usage
    };
  }

  /* ---------- fetch proxy ---------- */
  var origFetch = window.fetch.bind(window);
  function resolvePlan(url, payload){
    if (config.mode === 'chat') return null;
    var plan = MODELS[payload && payload.model];
    if (!plan){
      if (config.mode === 'responses' && payload && payload.model && !warned[payload.model]){
        warned[payload.model] = 1;
        console.warn('[hybrid] mode=responses but model not profiled: ' + payload.model + ' → using chat fallback.');
      }
      return null;
    }
    if (!/\/chat\/completions(\?|$)/.test(url)) return null;
    var hosts = PROVIDER_HOSTS[plan.provider] || [];
    for (var i = 0; i < hosts.length; i++) if (url.indexOf(hosts[i]) !== -1) return plan;
    return null;
  }
  function installFetchProxy(){
    if (window.__hybridOrigFetch) return;
    window.__hybridOrigFetch = origFetch;
    window.fetch = function(input, init){
      if (!config.enabled) return origFetch(input, init);
      var url = typeof input === 'string' ? input : (input && input.url);
      var opts = init || {};
      var method = String((opts.method || (input && input.method) || 'GET')).toUpperCase();
      if (method !== 'POST' || typeof opts.body !== 'string') return origFetch(input, init);
      var payload;
      try { payload = JSON.parse(opts.body); } catch(e){ return origFetch(input, init); }
      var plan = resolvePlan(url, payload);

      if (plan){
        var rReq = buildResponsesRequest(payload, plan);
        if (!rReq) return origFetch(input, init);
        var base = url.replace(/\/chat\/completions(\?|$)/, '');
        var rUrl = base + plan.path;
        logPreview(plan, rReq, rUrl);
        var rInit = {};
        for (var k in opts) if (k !== 'body') rInit[k] = opts[k];
        rInit.headers = cloneHeaders(opts.headers);
        rInit.headers['Content-Type'] = 'application/json';
        rInit.body = JSON.stringify(rReq);
        return origFetch(rUrl, rInit).then(function(upstream){
          stats.transformed++;
          stats.last.mode = 'responses'; stats.last.model = payload.model; stats.last.url = rUrl; stats.last.ts = Date.now();
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

      /* passthrough chat — still coalesce to kill the renderer freeze */
      if (payload && payload.stream && /\/chat\/completions(\?|$)/.test(url) && Array.isArray(payload.messages)){
        stats.passthrough++;
        stats.last.mode = 'chat'; stats.last.model = payload.model; stats.last.url = url; stats.last.ts = Date.now();
        updateStatus();
        return origFetch(input, init).then(function(upstream){
          if (!upstream.ok || !upstream.body) return upstream;
          return new Response(makeCoalescedStream(upstream.body, null), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        });
      }
      return origFetch(input, init);
    };
    console.log('[hybrid] fetch proxy installed (responses adapter + delta coalescer)');
  }

  function disable(){
    if (window.__hybridOrigFetch){
      window.fetch = window.__hybridOrigFetch;
      window.__hybridOrigFetch = null;
    }
    config.enabled = false;
    saveConfig();
    var el = document.getElementById('hybridStatus');
    if (el) el.remove();
    console.log('[hybrid] disabled — original fetch restored. Config preserved in localStorage.');
    window.__hybridUpgrade = null;
  }
  function enable(){
    config.enabled = true;
    saveConfig();
    installFetchProxy();
    updateStatus();
  }

  /* ---------- public API ---------- */
  window.__hybridUpgrade = {
    version: VERSION,
    config: config,
    stats: stats,
    saveConfig: saveConfig,
    setMode: function(m){
      if (['auto','chat','responses'].indexOf(m) < 0) throw Error('mode must be auto|chat|responses');
      config.mode = m; saveConfig(); updateStatus(); return config;
    },
    setWebSearch: function(v){
      config.webSearch = !!v; saveConfig(); updateStatus(); return config;
    },
    setShowSearchTrace: function(v){
      config.showSearchTrace = !!v; saveConfig(); updateStatus(); return config;
    },
    setPaintInterval: function(ms){
      config.paintIntervalMs = Math.max(40, +ms || 160); saveConfig(); return config;
    },
    enable: enable,
    disable: disable,
    status: function(){ return JSON.parse(JSON.stringify({ config: config, stats: stats })); }
  };

  if (config.enabled){ installFetchProxy(); }
  updateStatus();
  console.log('[hybrid] upgrade package v' + VERSION + ' ready — controls: __hybridUpgrade.setMode()/.setWebSearch()/.disable()/.status()');
})();
