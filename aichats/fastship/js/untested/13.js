/* =============================================================
   EVAL1 v3.0 — The Agentic Unification Update
   -------------------------------------------------------------
   Combines Advanced Routing (Anthropic/Responses) with 
   Autonomous Tool Loops & Web Worker Sandboxes.
   ============================================================= */

(function(){
'use strict';
var NS = window.__eval1 || (window.__eval1 = {});
var FIRST = !NS.installed;

if (FIRST){
  NS.origFetch = (window.fetch || fetch).bind(window);
  NS.installed = false;
  NS.flags = { marked:1, anthropic:1, hybrid:1, pill:1, bridgeStream:1 };
  NS.stats = { transformed:0, passthrough:0, searchCalls:0, last:{} };
  NS.config = {
    mode:'auto', webSearch:true, webSearchStyle:'tools',
    showSearchTrace:true, paintIntervalMs:160,
    markedSrc:'https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.js'
  };
  try { var saved = JSON.parse(localStorage.getItem('dse_eval1_config') || '{}'); for (var sk in saved) NS.config[sk] = saved[sk]; } catch(e){}
}
NS.version = '3.0';
function saveConfig(){ try { localStorage.setItem('dse_eval1_config', JSON.stringify(NS.config)); } catch(e){} }
function updateStats(mode, model, url){ NS.stats.last = { mode: mode, model: model, url: url, ts: Date.now() }; }
function cloneHeaders(h){ if (!h) return {}; if (typeof Headers !== 'undefined' && h instanceof Headers){ var o = {}; h.forEach(function(v,k){ o[k] = v; }); return o; } var out = {}; for (var k in h) out[k] = h[k]; return out; }
function encodeText(s){ return new TextEncoder().encode(s); }

/* ---------- Usage Accumulator ---------- */
function addUsage(a, b) {
  if (!a) return JSON.parse(JSON.stringify(b||{}));
  let o = {...a};
  for (let k in b) {
    if (typeof b[k] === 'number') o[k] = (o[k]||0) + b[k];
    else if (typeof b[k] === 'object' && b[k] !== null) o[k] = addUsage(o[k]||{}, b[k]);
  }
  return o;
}

/* ---------- 1. Web Worker Tool Registry ---------- */
const safeStr = v => { try {
  if (v === undefined) return 'undefined';
  if (typeof v === 'bigint' || typeof v === 'symbol' || typeof v === 'function') return String(v);
  if (typeof v !== 'object' || v === null) return JSON.stringify(v);
  const seen = new WeakSet();
  return JSON.stringify(v, (k,x)=>{ if(typeof x==='bigint'||typeof x==='symbol'||typeof x==='function') return String(x); if(x&&typeof x==='object'){ if(seen.has(x)) return '[circular]'; seen.add(x);} return x; }, 2).slice(0,20000) || 'undefined';
} catch(e){ return String(v); } };

const evalWorker = (code, timeout, signal) => new Promise(resolve => { try {
  if (signal?.aborted) return resolve({ok:0,e:'aborted'});
  const src = `self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:1,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:0,e:String(err&&err.stack||err)})}}`;
  const w = new Worker(URL.createObjectURL(new Blob([src], {type:'text/javascript'})));
  const t = setTimeout(()=>{ w.terminate(); resolve({ok:0,e:'timeout'}); }, timeout);
  signal?.addEventListener('abort', () => { clearTimeout(t); w.terminate(); resolve({ok:0,e:'aborted'}); });
  w.onmessage = e => { clearTimeout(t); w.terminate(); resolve(e.data); };
  w.onerror = err => { clearTimeout(t); w.terminate(); resolve({ok:0,e:String(err.message||err)}); };
  w.postMessage(code);
} catch(e){ resolve({ok:0,e:String(e)}); } });

window.__tools = window.__tools || {};
window.__tools.tool_eval_1 = { schema: {
  type:'function', function:{ name:'tool_eval_1',
    description:'Run arbitrary JavaScript in the browser and return JSON result. Use for math, fetch, text/DOM. Default timeout 10000ms. worker:false runs in page scope.',
    parameters:{ type:'object', properties:{
      code:{ type:'string', description:'JavaScript to evaluate.' },
      timeout:{ type:'number', description:'ms (default 10000, max 60000)' },
      worker:{ type:'boolean', description:'default true = isolated worker; false = page scope' }
    }, required:['code'] }
  }}, run: async (args={}, signal) => {
    const code = String(args.code ?? args.expression ?? '').trim();
    const timeout = args.timeout == null ? 10000 : Math.max(1, Math.min(60000, Number(args.timeout)||10000));
    const worker = args.worker !== false;
    const t0 = performance.now();
    if (!code) return safeStr({ok:false, error:'no code provided'});
    const done = r => safeStr({ ok:!!r.ok, ms:Math.round(performance.now()-t0), ...(r.ok ? {result:r.r} : {error:r.e}) });
    if (worker) return done(await evalWorker(code, timeout, signal));
    return new Promise(resolve => { let done2=false;
      const t = setTimeout(()=>{ if(!done2){ done2=true; resolve(done({ok:0,e:'timeout'})); } }, timeout);
      signal?.addEventListener('abort', () => { if(!done2){ done2=true; clearTimeout(t); resolve(done({ok:0,e:'aborted'})); } });
      const fin = r => { if(done2) return; done2=true; clearTimeout(t); resolve(done(r)); };
      try { Promise.resolve(eval(code)).then(r=>fin({ok:1,r}), e=>fin({ok:0,e:String(e?.stack||e)})); }
      catch(e){ fin({ok:0,e:String(e?.stack||e)}); }
    });
} };

const execTool = async (tc, signal) => {
  const name = tc.function?.name, def = window.__tools?.[name]; let args = {};
  try { args = JSON.parse(tc.function?.arguments || '{}'); } catch(e){ args = { parseError:String(e), raw:tc.function?.arguments }; }
  if (!def) return JSON.stringify({ok:false, error:'unknown tool: '+name});
  try { const out = await def.run(args, signal); return typeof out==='string' ? out : JSON.stringify(out); }
  catch(e){ return JSON.stringify({ok:false, error:String(e?.stack||e)}); }
};

/* ---------- 2. App-Level Patches (Memory + Multi-Turn) ---------- */
if (!window.__executeAPIPatched) {
  window.__origBuildAPIMessages = buildAPIMessages;
  window.__executeAPIPatched = true;
  
  // Patch memory builder to load tool history across reloads
  buildAPIMessages = function(targetPath, r=run(), msgs) {
      if (msgs) return window.__origBuildAPIMessages(targetPath, r, msgs);
      let out = [{role: r.systemRole || 'system', content: 'You are a helpful assistant.'}];
      targetPath.forEach(n => {
          if (n.id !== 'root' && n.role !== 'system' && n.role !== 'system-msg') {
              const ver = n.versions[n.activeVersion || 0];
              if (ver.rawContent || ver._toolEvents) {
                  if (ver.rawContent || (ver._toolEvents && n.role === 'assistant')) out.push({ role: n.role, content: ver.rawContent || '' });
                  if (ver._toolEvents && Array.isArray(ver._toolEvents)) out.push(...ver._toolEvents);
              }
          }
      });
      return r.prompt ? out.concat({role: r.systemRole||'system', content: r.prompt}) : out;
  };

  // Patch executeAPI for Agentic Loops
  executeAPI = async function(messages, node, vIndex, controller, r=run()) {
      const p = r.p, key = getApiKey(p.id), isStream = settings.streaming, modelId = r.m;
      
      let tools = [];
      if (Array.isArray(r.request?.tools)) tools = r.request.tools;
      else if (typeof r.request?.tools === 'string') tools = r.request.tools.split(/[,\s]+/).filter(Boolean).map(n=>window.__tools?.[n]?.schema).filter(Boolean);
      else if (!('tools' in (r.request||{}))) tools = Object.values(window.__tools||{}).map(t=>t.schema).filter(Boolean);

      const payload = { ...r.request, model: modelId, temperature: r.supportsTemperature===false ? void 0 : (r.temperature??.7), stream: isStream };
      if (tools.length) { payload.tools = tools; if (!payload.tool_choice) payload.tool_choice = 'auto'; }
      payload[p.maxTokensParam || 'max_tokens'] = r.maxTokens;
      if (isStream && p.supportsStreamUsage) payload.stream_options = { include_usage: true };
      
      node.versions[vIndex].startTime = Date.now();

      let toolEvents = [];
      let historyC = '', historyT = ''; 
      let totalUsage = null;
      let finalExactCost = undefined;

      for (let turn = 0; turn <= 10; turn++) {
          if (controller.signal.aborted) break;
          let turnMsgs = [...messages, ...toolEvents];

          const res = await fetch(p.baseURL + p.apiPath, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': (p.authHeader ? p.authHeader + ' ' : '') + key },
              body: JSON.stringify({ ...payload, messages: turnMsgs }),
              signal: controller.signal
          });

          if (!res.ok) { const body = (await res.text()).trim(); throw new Error(`HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''}${body ? '\n' + body : ''}`); }

          const applyUsage = envelope => {
              const costBad = {}, next = r.usagePath === false ? envelope : r.usagePath ? at(envelope, r.usagePath) : envelope?.usage ?? envelope?.usageMetadata ?? envelope?.message?.usage;
              const rc = usageValue(envelope, r.usageCost, costBad);
              if (!costBad.value && rc !== undefined) finalExactCost = (finalExactCost || 0) + rc;
              if (isObj(next)) totalUsage = addUsage(totalUsage, next);
              if (totalUsage || finalExactCost !== undefined) applyResponseMetadata(node.versions[vIndex], totalUsage || {}, r, finalExactCost);
          };

          let toolCalls = null;
          let fullC = '', fullT = '';

          if (!isStream) {
              const data = await res.json(); applyUsage(data);
              const msg = data.choices?.[0]?.message || {};
              if (msg.tool_calls?.length) toolCalls = msg.tool_calls;
              fullC = msg.content || ''; fullT = msg.reasoning_content || '';
          } else {
              const reader = res.body.getReader(), dec = new TextDecoder();
              let buf = '', first = true, lastR = 0, tAcc = [];
              const proc = line => {
                  if (!line.startsWith('data: ')) return; const js = line.slice(6).trim(); if (!js || js === '[DONE]') return;
                  try {
                      const d = JSON.parse(js), delta = d.choices?.[0]?.delta || {};
                      fullC += delta.content || ''; fullT += delta.reasoning_content || '';
                      (delta.tool_calls || []).forEach(dtc => {
                          const i = dtc.index ?? tAcc.length;
                          let a = tAcc[i] ?? (tAcc[i] = { id: '', type: 'function', function: { name: '', arguments: '' } });
                          if (dtc.id) a.id = dtc.id;
                          if (dtc.function) {
                              if (dtc.function.name) a.function.name += dtc.function.name;
                              if (dtc.function.arguments) a.function.arguments += dtc.function.arguments;
                          }
                      });
                      
                      node.lastUpdateTime = Date.now(); const v = node.versions[vIndex];
                      v.rawContent = historyC + fullC; v.thinking = historyT + fullT;
                      
                      if (first && (fullC || fullT || tAcc.length)) { if (node.activeVersion === vIndex) updateNodeDOM(node); first = false; handleNewContent(0, true); }
                      if (!first && (fullC.length + fullT.length)) {
                          if (node.activeVersion === vIndex) {
                              v.unread = false; const l = fullC.length + fullT.length; handleNewContent(l - lastR, false); lastR = l;
                              const el = getMessageEl(node.id);
                              if (el) {
                                  const b = el.querySelector('.bubble'), cc = el.closest('.message').querySelector('.char-count');
                                  const h = buildThinkingSection(v.thinking, node.id, true) + formatMarkdown(v.rawContent);
                                  if (b && b.innerHTML !== h) b.innerHTML = h; if (cc) cc.textContent = getMessageStatString(node, v);
                              }
                              scheduleTokenDisplayUpdate(fullC.length, fullT.length);
                          } else { const vs = node.versions, a = node.activeVersion; if ((vs[a].swarm && !vs[a].endTime) || !v.unread) updateVersionDots(node, vIndex); }
                          const sw = node.id + '|' + vIndex, now = Date.now();
                          if (now - (lastBufferWrite[sw] || 0) > 500) { saveStreamBuffer(node, vIndex); lastBufferWrite[sw] = now; }
                      }
                      applyUsage(d);
                  } catch (e) { }
              };
              
              while (true) {
                  const { done, value } = await reader.read(); if (done) break;
                  buf += dec.decode(value, { stream: true }); const ls = buf.split('\n'); buf = ls.pop(); ls.forEach(proc);
              }
              if (buf.trim()) proc(buf.trim());
              if (tAcc.length) toolCalls = tAcc.filter(Boolean);
          }

          historyC += fullC; historyT += fullT;
          node.versions[vIndex].rawContent = historyC; node.versions[vIndex].thinking = historyT;

          if (toolCalls && toolCalls.length) {
              if (controller.signal.aborted) break;
              toolEvents.push({ role: 'assistant', content: fullC || null, tool_calls: toolCalls });
              
              historyC += `\n\n> ⚙️ **Used Tools:** ${toolCalls.map(t=>t.function?.name).join(', ')}\n\n`;
              node.versions[vIndex].rawContent = historyC;
              if (node.activeVersion === vIndex) updateNodeDOM(node);

              for (const tc of toolCalls) {
                  let resStr = await execTool(tc, controller.signal);
                  toolEvents.push({ role: 'tool', tool_call_id: tc.id, content: resStr });
                  historyC += `<details><summary>Result: ${tc.function?.name}</summary>\n\n\`\`\`json\n${resStr}\n\`\`\`\n</details>\n\n`;
                  node.versions[vIndex].rawContent = historyC;
                  if (node.activeVersion === vIndex) updateNodeDOM(node);
              }
              if (controller.signal.aborted) break;
              continue; 
          }
          break; 
      }
      
      if (toolEvents.length > 0) node.versions[vIndex]._toolEvents = toolEvents;
      await saveStreamBuffer(node, vIndex);
      node.versions[vIndex].endTime = node.lastUpdateTime || Date.now();
      finalizeGeneration(node, vIndex, controller);
  };
}

/* ---------- 3. Network Level (Anthropic Bridge + Stream Translation) ---------- */
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
    if (item.role === 'system' || item.role === 'developer'){ system.push(textOf(item.content)); continue; }
    if (item.role === 'tool'){ messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: item.tool_call_id, content: String(item.content || '') }] }); continue; }
    
    let blocks = [];
    if (item.content) blocks.push({ type: 'text', text: textOf(item.content) });
    if (item.tool_calls && item.tool_calls.length) {
        item.tool_calls.forEach(tc => {
            if (tc.type === 'function') {
                let parsedArgs = {}; try { parsedArgs = JSON.parse(tc.function.arguments || '{}'); } catch(e){}
                blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: parsedArgs });
            }
        });
    }
    
    var role = item.role === 'assistant' ? 'assistant' : 'user';
    var prev = messages[messages.length - 1];
    if (prev && prev.role === role) prev.content = prev.content.concat(blocks);
    else messages.push({ role: role, content: blocks });
  }
  return { system: system.join('\n\n'), messages: messages };
}

function makeAnthropicTranslate(){
  var startUsage = null, searchedBlock = false, countedSearch = false;
  var currentToolId = null, toolIndex = -1;
  return function(ev){
    switch (ev && ev.type){
      case 'message_start':
        if (ev.message && ev.message.usage) startUsage = ev.message.usage;
        return null;
      case 'content_block_start': {
        var cb = ev.content_block || {};
        if (cb.type === 'tool_use' || cb.type === 'server_tool_use'){
          toolIndex++; currentToolId = cb.id;
          if (cb.name === 'web_search' || (cb.input && (cb.input.type === 'web_search' || cb.input.name === 'web_search'))){
            if (!countedSearch){ NS.stats.searchCalls++; countedSearch = true; }
            searchedBlock = true;
          } else {
            return { choices: [{ delta: { tool_calls: [{ index: toolIndex, id: cb.id, type: 'function', function: { name: cb.name, arguments: '' } }] } }] };
          }
        }
        return null;
      }
      case 'content_block_delta': {
        var d = ev.delta || {};
        if (d.type === 'thinking_delta') return { choices: [{ delta: { reasoning_content: d.thinking || '' } }] };
        if (d.type === 'text_delta') return { choices: [{ delta: { content: d.text || '' } }] };
        if (d.type === 'input_json_delta'){
          if (searchedBlock && NS.config.showSearchTrace) {
            try { var j = JSON.parse(d.partial_json || '{}'); if (j.search_query){ searchedBlock = false; return { choices: [{ delta: { reasoning_content: '[web_search] ' + j.search_query } }] }; } } catch(e){}
          } else if (currentToolId) {
            return { choices: [{ delta: { tool_calls: [{ index: toolIndex, function: { arguments: d.partial_json || '' } }] } }] };
          }
        }
        return null;
      }
      case 'content_block_stop':
        currentToolId = null; searchedBlock = false; return null;
      case 'message_delta': return { finish: true, usage: { prompt_tokens: (startUsage?.input_tokens||0), completion_tokens: (ev.usage?.output_tokens||0) } };
      case 'message_stop': return { finish: true };
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
  
  var upstream = { model: original.model, messages: converted.messages, tools: [], stream: useStream };
  if (original.tools) {
      original.tools.forEach(t => {
          if (t.type === 'function') upstream.tools.push({ name: t.function.name, description: t.function.description || '', input_schema: t.function.parameters || { type: 'object', properties: {} } });
      });
  }
  if (NS.config.webSearch && original.model.indexOf('deepseek') !== -1 && !upstream.tools.some(t => t.name === 'web_search')) upstream.tools.push(SEARCH_TOOL);
  if (!upstream.tools.length) delete upstream.tools;

  if (converted.system) upstream.system = converted.system;
  ['temperature','top_p','thinking','reasoning_effort'].forEach(function(n){ if (original[n] != null) upstream[n] = original[n]; });
  
  var rInit = { method: 'POST', headers: { 'content-type':'application/json', 'authorization':'Bearer ' + key, 'x-api-key': key, 'anthropic-version':'2023-06-01' }, body: JSON.stringify(upstream), signal: opts.signal };
  return NS.origFetch(ANTHROPIC_ENDPOINT, rInit).then(function(resp){
    updateStats('anthropic', original.model, ANTHROPIC_ENDPOINT);
    if (useStream) { if (!resp.ok || !resp.body) return resp; return new Response(makeCoalescedStream(resp.body, makeAnthropicTranslate()), { status: 200, headers: { 'content-type':'text/event-stream; charset=utf-8' } }); }
    return resp; // Standard translation fallback for non-streaming omitted for brevity, streaming highly recommended
  });
}

function coalescerHandler(input, init, url, opts){
  if (typeof opts.body !== 'string') return null;
  var payload; try { payload = JSON.parse(opts.body); } catch(e){ return null; }
  if (!(payload && payload.stream && Array.isArray(payload.messages) && /\/chat\/completions(\?|$)/.test(url))) return null;
  NS.stats.passthrough++; updateStats('chat', payload.model, url);
  return NS.origFetch.call(this, input, init).then(function(upstream){
    if (!upstream.ok || !upstream.body) return upstream;
    return new Response(makeCoalescedStream(upstream.body, null), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  });
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
          var delta = {}; if (acc.content) delta.content = acc.content; if (acc.reasoning) delta.reasoning_content = acc.reasoning;
          enqueue('data: ' + JSON.stringify({ choices: [{ delta: delta }] }) + '\n\n'); acc.content = ''; acc.reasoning = '';
        }
      }
      function scheduleFlush(){ if (timer) return; timer = setTimeout(function(){ timer = 0; flushAcc(); }, NS.config.paintIntervalMs); }
      function finish(){ if (closed) return; flushAcc(); closed = true; enqueue('data: [DONE]\n\n'); try { controller.close(); } catch(e){} }
      function handleBlock(block){
        var data = ''; (block.split(/\r?\n/) || []).forEach(function(line){ if (line.indexOf('data:') === 0) data += (data ? '\n' : '') + line.slice(5).replace(/^\s+/, ''); });
        if (!data) return; if (data === '[DONE]'){ finish(); return; }
        var ev; try { ev = JSON.parse(data); } catch(e){ return; }
        var out; try { out = translate ? translate(ev) : ev; } catch(e){ out = { error: e }; }
        if (!out) return;
        if (out.error){ if (!closed){ closed = true; try { controller.error(out.error); } catch(e){} } return; }
        if (out.finish){ if (out.usage){ flushAcc(); enqueue('data: ' + JSON.stringify({ choices: [{ delta: {} }], usage: out.usage }) + '\n\n'); } finish(); return; }
        var delta = (out.choices && out.choices[0] && out.choices[0].delta) || {};
        if (delta.content){ acc.content += delta.content; scheduleFlush(); }
        if (delta.reasoning_content){ acc.reasoning += delta.reasoning_content; scheduleFlush(); }
        if (delta.tool_calls) { flushAcc(); enqueue('data: ' + JSON.stringify(out) + '\n\n'); }
        if (out.usage){ flushAcc(); enqueue('data: ' + JSON.stringify({ choices: [{ delta: {} }], usage: out.usage }) + '\n\n'); }
      }
      function pump(){
        reader.read().then(function(res){
          if (closed){ try { reader.cancel(); } catch(e){} return; }
          if (res.done){ finish(); return; }
          buffer += decoder.decode(res.value, { stream: true });
          var m; while (!closed && (m = buffer.search(/\n\n|\r\n\r\n/)) !== -1){ var sep = buffer[m] === '\r' ? 4 : 2; handleBlock(buffer.slice(0, m)); buffer = buffer.slice(m + sep); }
          pump();
        }).catch(function(err){ if (!closed){ closed = true; try { controller.error(err); } catch(e){} } });
      }
      pump();
    }
  });
}

/* ---------- 4. Setup / Install ---------- */
function apply(){
  var handlers = [];
  if (NS.flags.anthropic) handlers.push(anthropicHandler);
  handlers.push(coalescerHandler);

  var chained = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
    var opts = init || {}; var method = String(opts.method || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'POST') return NS.origFetch.call(this, input, init);
    for (var i = 0; i < handlers.length; i++){ var r = handlers[i].call(this, input, init, url, opts); if (r) return r; }
    return NS.origFetch.call(this, input, init);
  };
  NS.chained = chained; window.fetch = chained; NS.installed = true;
  console.log('[eval1 v3.0] Ready: Tools, Memory, Streams, and Anthropic Bridge active.');
}
apply();
})();
