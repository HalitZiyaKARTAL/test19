/* =============================================================
   EVAL1 v3.3.2 — all-in-one (final, GitHub-friendly)
   -------------------------------------------------------------
   Paste the WHOLE file into the app's eval console (Settings → Other
   → Eval console → open console → Run). Idempotent.

   Flags (window.eval1bX or __eval1.setFlag / Exp tab):
     b1 marked · b2 anthropic bridge · b3 responses hybrid
     b4 status pill · b5 streaming bridge · b6 agentic tools
   -------------------------------------------------------------
   v3.3:
     [1] save __origExecuteAPI -> disable() restores everything
     [2] cumulativeExactCost NaN fix
     [3] tools gated behind eval1b6 (no auto-attach)
     [4] responses forwards function tools
     [5] responses tool continuation = FULL REPLAY (never previous_response_id)
     [6] anthropic streaming usage keeps cache fields
     [7] pricing: peak rates in config (off-peak = half)
   v3.3.1:
     [8] agentic patch extracted to installAgenticPatch() (apply()-safe)
     [9] addCumulativeUsage no longer mutates nested prompt_tokens_details
     [10] Exp tab included (tools row + removeExpTab for disable())
   v3.3.2:
     [11] buildResponsesRequest single-pass: correct item order
          (user -> reasoning -> function_call -> function_call_output)
     [12] executeAPI carries reasoning_content on assistant tool msgs
     [13] buildAPIMessages carries stored thinking for prior turns
     (Fixes DeepSeek 400 "No tool call found" + "reasoning_text must be passed back")
   ============================================================= */
var eval1b1 = window.eval1b1 ?? 1;
var eval1b2 = window.eval1b2 ?? 1;
var eval1b3 = window.eval1b3 ?? 1;
var eval1b4 = window.eval1b4 ?? 1;
var eval1b5 = window.eval1b5 ?? 1;
var eval1b6 = window.eval1b6 ?? 1; /* agentic tools */

/* ===================== PART 1 — CORE ===================== */
(function(){
'use strict';
var NS = window.__eval1 || (window.__eval1 = {});
var FIRST = !NS.installed;
if (FIRST){
  try { if (window.__hybridUpgrade && window.__hybridUpgrade.disable) window.__hybridUpgrade.disable(); } catch(e){}
  try { if (window.DeepSeekWebSearch && window.DeepSeekWebSearch.restore) window.DeepSeekWebSearch.restore(); } catch(e){}
  NS.version = '3.3.2';
  NS.origFetch = (window.fetch || fetch).bind(window);
  NS.installed = false;
  NS.flags = {};
  NS.stats = { transformed:0, passthrough:0, searchCalls:0, last:{} };
  NS.config = {
    mode:'auto', webSearch:true, webSearchStyle:'tools',
    showSearchTrace:true, paintIntervalMs:160,
    markedSrc:'https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.js',
    /* [7] pricing: PEAK upper-bound (never under-reports; off-peak = half) */
    pricing: {
      'deepseek-v4-flash': { inputCacheHit:.014e-6, inputCacheMiss:.44e-6, output:1.32e-6 },
      'deepseek-v4-pro':   { inputCacheHit:.044e-6, inputCacheMiss:1.32e-6, output:3.96e-6 }
    }
  };
  try {
    var saved = JSON.parse(localStorage.getItem('dse_eval1_config') || '{}');
    for (var sk in saved) NS.config[sk] = saved[sk];
  } catch(e){}
} else if (!NS.installed){
  NS.origFetch = (window.fetch || fetch).bind(window);
}
NS.version = '3.3.2';
(function(){
  var defs = { marked:eval1b1, anthropic:eval1b2, hybrid:eval1b3, pill:eval1b4, bridgeStream:eval1b5, tools:eval1b6 };
  for (var k in defs) NS.flags[k] = defs[k] ? 1 : 0;
})();

function saveConfig(){ try { localStorage.setItem('dse_eval1_config', JSON.stringify(NS.config)); } catch(e){} }
function warn(msg){ try { console.warn('[eval1] ' + msg); } catch(e){} }
function updateStats(mode, model, url){ NS.stats.last = { mode: mode, model: model, url: url, ts: Date.now() }; }

/* ---------- status pill ---------- */
function removeStatusPill(){ var el=document.getElementById('eval1Pill'); if(el) el.remove(); }
function ensureStatusPill(){
  var el=document.getElementById('eval1Pill');
  if(el) return el;
  el=document.createElement('span');
  el.id='eval1Pill';
  el.style.cssText='font-size:.68rem;padding:2px 8px;border-radius:6px;background:var(--border);color:var(--text-secondary);font-family:monospace;white-space:nowrap;cursor:help;';
  el.title='eval1 — click to cycle API mode';
  el.addEventListener('click',function(){
    var m = NS.config.mode==='responses'?'chat':(NS.config.mode==='chat'?'auto':'responses');
    NS.config.mode=m; saveConfig(); updateStatus();
  });
  var hr=document.querySelector('.header-right');
  if(hr) hr.insertBefore(el,hr.firstChild);
  return el;
}
function updateStatus(){
  if(!NS.flags.pill){ removeStatusPill(); return; }
  var el=ensureStatusPill();
  var s='API '+(NS.stats.last.mode||(NS.flags.hybrid?NS.config.mode:'off'));
  if(NS.stats.last.model) s+=' · '+NS.stats.last.model;
  if(NS.stats.searchCalls && NS.config.showSearchTrace) s+=' · 🔎'+NS.stats.searchCalls;
  el.textContent=s;
  el.title='mode:'+NS.config.mode+(NS.stats.last.id?' · id:'+NS.stats.last.id:'')+' · transformed:'+NS.stats.transformed+' · passthrough:'+NS.stats.passthrough+' · searchCalls:'+NS.stats.searchCalls;
}

/* ---------- shared helpers ---------- */
function cloneHeaders(h){
  if(!h) return {};
  if(typeof Headers!=='undefined' && h instanceof Headers){ var o={}; h.forEach(function(v,k){ o[k]=v; }); return o; }
  var out={}; for(var k in h) out[k]=h[k]; return out;
}
function encodeText(s){ return new TextEncoder().encode(s); }

/* ================= TOOLS + AGENTIC LOOP ================= */
const safeStr = v => {
  try {
    if (v === undefined) return 'undefined';
    if (typeof v === 'bigint' || typeof v === 'symbol' || typeof v === 'function') return String(v);
    if (typeof v !== 'object' || v === null) return JSON.stringify(v);
    const seen = new WeakSet();
    return JSON.stringify(v, (k,x)=>{ if(typeof x==='bigint'||typeof x==='symbol'||typeof x==='function') return String(x); if(x&&typeof x==='object'){ if(seen.has(x)) return '[circular]'; seen.add(x);} return x; }, 2).slice(0,20000) || 'undefined';
  } catch(e){ return String(v); }
};
const evalWorker = (code, timeout, signal) => new Promise(resolve => {
  try {
    if (signal && signal.aborted) return resolve({ok:0,e:'aborted'});
    const src = `self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:1,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:0,e:String(err&&err.stack||err)})}}`;
    const w = new Worker(URL.createObjectURL(new Blob([src], {type:'text/javascript'})));
    const t = setTimeout(()=>{ w.terminate(); resolve({ok:0,e:'timeout'}); }, timeout);
    const abortHandler = () => { clearTimeout(t); w.terminate(); resolve({ok:0,e:'aborted'}); };
    if (signal) signal.addEventListener('abort', abortHandler);
    w.onmessage = e => { clearTimeout(t); if(signal) signal.removeEventListener('abort',abortHandler); w.terminate(); resolve(e.data); };
    w.onerror = err => { clearTimeout(t); if(signal) signal.removeEventListener('abort',abortHandler); w.terminate(); resolve({ok:0,e:String(err.message||err)}); };
    w.postMessage(code);
  } catch(e){ resolve({ok:0,e:String(e)}); }
});
window.__tools = window.__tools || {};
window.__tools.tool_eval_1 = {
  schema: { type:'function', function:{ name:'tool_eval_1', description:'Execute JavaScript in the browser. Returns JSON result. The last statement must be an expression to return a value (do NOT use console.log to return data). By default runs in isolated Web Worker. SET "worker": false if you need to access window, document, or DOM.', parameters:{ type:'object', properties:{ code:{ type:'string', description:'JavaScript code to run.' }, timeout:{ type:'number' }, worker:{ type:'boolean', description:'false = full page DOM access. true = isolated worker (default)' } }, required:['code'] } } },
  run: async (args={}, signal) => {
    const code = String(args.code ?? args.expression ?? '').trim();
    const timeout = args.timeout == null ? 10000 : Math.max(1, Math.min(60000, Number(args.timeout)||10000));
    const worker = args.worker !== false;
    const t0 = performance.now();
    if (!code) return safeStr({ok:false, error:'no code provided'});
    const done = r => safeStr({ ok:!!r.ok, ms:Math.round(performance.now()-t0), ...(r.ok ? {result:r.r} : {error:r.e}) });
    if (worker) return done(await evalWorker(code, timeout, signal));
    return new Promise(resolve => {
      let done2=false;
      const t=setTimeout(()=>{ if(!done2){ done2=true; resolve(done({ok:0,e:'timeout'})); } }, timeout);
      const abortHandler=()=>{ if(!done2){ done2=true; clearTimeout(t); resolve(done({ok:0,e:'aborted'})); } };
      if(signal) signal.addEventListener('abort', abortHandler);
      const fin=r=>{ if(done2)return; done2=true; clearTimeout(t); if(signal) signal.removeEventListener('abort',abortHandler); resolve(done(r)); };
      try { Promise.resolve(eval(code)).then(r=>fin({ok:1,r}), e=>fin({ok:0,e:String(e&&e.stack||e)})); }
      catch(e){ fin({ok:0,e:String(e&&e.stack||e)}); }
    });
  }
};
const execTool = async (tc, signal) => {
  const name = tc.function && tc.function.name, def = window.__tools && window.__tools[name];
  let args = {};
  try { args = JSON.parse((tc.function && tc.function.arguments) || '{}'); } catch(e){ args = { parseError:String(e), raw:(tc.function&&tc.function.arguments)||'' }; }
  if (!def) return JSON.stringify({ok:false, error:'unknown tool: '+name});
  try { const out = await def.run(args, signal); return typeof out==='string' ? out : JSON.stringify(out); }
  catch(e){ return JSON.stringify({ok:false, error:String(e&&e.stack||e)}); }
};
function addCumulativeUsage(acc, curr){
  if (!acc) return JSON.parse(JSON.stringify(curr || {}));
  if (!curr) return acc;
  let out = { ...acc };
  const keys = ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens','cache_creation_input_tokens','cache_read_input_tokens','input_tokens','output_tokens'];
  keys.forEach(k => { if (curr[k]) out[k] = (out[k] || 0) + curr[k]; });
  /* [9] immutability */
  if (curr.prompt_tokens_details){
    out.prompt_tokens_details = {
      ...(out.prompt_tokens_details||{}),
      cached_tokens: ((out.prompt_tokens_details&&out.prompt_tokens_details.cached_tokens)||0) + ((curr.prompt_tokens_details.cached_tokens)||0)
    };
  }
  return out;
}

/* [8] agentic patch — callable from apply() too */
function installAgenticPatch(){
  if (window.__eval1_patched_v33) return;
  window.__eval1_patched_v33 = true;
  window.__origBuildAPIMessages = buildAPIMessages;
  window.__origExecuteAPI = executeAPI;   /* [1] */

  buildAPIMessages = function(targetPath, r, msgs) {
    if (msgs) return window.__origBuildAPIMessages(targetPath, r, msgs);
    var rr = r || run();
    let out = [{role: rr.systemRole || 'system', content: 'You are a helpful assistant.'}];
    targetPath.forEach(n => {
      if (n.id !== 'root' && n.role !== 'system' && n.role !== 'system-msg') {
        const ver = n.versions[n.activeVersion || 0];
        if (ver._toolEvents && Array.isArray(ver._toolEvents)) out.push(...ver._toolEvents);
        let finalContent = ver.llmContent;
        if (finalContent === undefined) {
          const last = (ver._toolEvents||[]).filter(m=>m.role==='assistant').pop();
          finalContent = last && last.content ? last.content : ver.rawContent;
        }
        /* [13] carry stored thinking for prior assistant turns */
        if (finalContent) out.push({ role: n.role, content: finalContent, reasoning_content: (n.role==='assistant' && ver.thinking) ? ver.thinking : undefined });
      }
    });
    return rr.prompt ? out.concat({role: rr.systemRole||'system', content: rr.prompt}) : out;
  };

  executeAPI = async function(messages, node, vIndex, controller, r) {
    const rr = r || run();
    const p = rr.p, key = getApiKey(p.id), isStream = settings.streaming, modelId = rr.m;
    let tools = [];
    /* [3] gating */
    if (Array.isArray(rr.request && rr.request.tools)) tools = rr.request.tools;
    else if (typeof (rr.request && rr.request.tools) === 'string') tools = rr.request.tools.split(/[,\s]+/).filter(Boolean).map(n=>window.__tools && window.__tools[n] && window.__tools[n].schema).filter(Boolean);
    else if (!(rr.request && ('tools' in rr.request)) && NS.flags.tools) tools = Object.values(window.__tools||{}).map(t=>t.schema).filter(Boolean);

    const payload = { ...rr.request, model: modelId, temperature: rr.supportsTemperature===false ? void 0 : (rr.temperature??.7), stream: isStream };
    if (tools.length) { payload.tools = tools; if (!payload.tool_choice) payload.tool_choice='auto'; }
    payload[p.maxTokensParam || 'max_tokens'] = rr.maxTokens;
    if (isStream && p.supportsStreamUsage) payload.stream_options = { include_usage: true };

    node.versions[vIndex].startTime = Date.now();
    let toolEvents = [], uiContent = '', llmContent = '', uiThinking = '', cumulativeUsage = null, cumulativeExactCost = 0;

    for (let turn = 0; turn <= 10; turn++) {
      if (controller.signal.aborted) break;
      const reqMessages = [...messages, ...toolEvents];
      if (llmContent) reqMessages.push({ role:'assistant', content: llmContent });

      const res = await fetch(p.baseURL + p.apiPath, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':(p.authHeader?p.authHeader+' ':'')+key }, body: JSON.stringify({ ...payload, messages: reqMessages }), signal: controller.signal });
      if (!res.ok) { const body=(await res.text()).trim(); throw new Error(`HTTP ${res.status} ${body}`); }

      let applyUsage = envelope => {
        const costBad = {}, next = rr.usagePath===false ? envelope : rr.usagePath ? at(envelope,rr.usagePath) : (envelope && (envelope.usage ?? envelope.usageMetadata ?? (envelope.message && envelope.message.usage)));
        const rc = usageValue(envelope, rr.usageCost, costBad);
        /* [2] NaN fix */
        if (!costBad.value && rc !== undefined) cumulativeExactCost = (cumulativeExactCost || 0) + rc;
        if (next && typeof next === 'object') cumulativeUsage = addCumulativeUsage(cumulativeUsage, next);
        if (cumulativeUsage || cumulativeExactCost > 0) applyResponseMetadata(node.versions[vIndex], cumulativeUsage || {}, rr, cumulativeExactCost || undefined);
      };

      let toolCalls = null, currentTurnC = '', currentTurnT = '';

      if (!isStream) {
        const data = await res.json(); applyUsage(data);
        const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
        if (msg.tool_calls && msg.tool_calls.length) toolCalls = msg.tool_calls;
        currentTurnC = msg.content || ''; currentTurnT = msg.reasoning_content || '';
      } else {
        const reader = res.body.getReader(), dec = new TextDecoder();
        let buf = '', first = true, lastR = 0, tAcc = [];
        const proc = line => {
          if (!line.startsWith('data: ')) return;
          const js = line.slice(6).trim(); if (!js || js === '[DONE]') return;
          try {
            const d = JSON.parse(js), delta = (d.choices && d.choices[0] && d.choices[0].delta) || {};
            currentTurnC += delta.content || ''; currentTurnT += delta.reasoning_content || '';
            (delta.tool_calls || []).forEach(dtc => {
              const i = dtc.index ?? tAcc.length;
              let a = tAcc[i] ?? (tAcc[i] = { id:'', type:'function', function:{ name:'', arguments:'' } });
              if (dtc.id) a.id = dtc.id;
              if (dtc.function){ if (dtc.function.name) a.function.name += dtc.function.name; if (dtc.function.arguments) a.function.arguments += dtc.function.arguments; }
            });
            node.lastUpdateTime = Date.now();
            const v = node.versions[vIndex];
            v.rawContent = uiContent + currentTurnC; v.thinking = uiThinking + currentTurnT;
            if (first && (currentTurnC || currentTurnT || tAcc.length)) { if (node.activeVersion === vIndex) updateNodeDOM(node); first = false; handleNewContent(0, true); }
            if (!first && (currentTurnC.length + currentTurnT.length)) {
              if (node.activeVersion === vIndex) {
                v.unread = false;
                const l = currentTurnC.length + currentTurnT.length; handleNewContent(l - lastR, false); lastR = l;
                const el = getMessageEl(node.id);
                if (el) {
                  const b = el.querySelector('.bubble'), cc = el.closest('.message').querySelector('.char-count');
                  const h = buildThinkingSection(v.thinking, node.id, true) + formatMarkdown(v.rawContent);
                  if (b && b.innerHTML !== h) b.innerHTML = h;
                  if (cc) cc.textContent = getMessageStatString(node, v);
                }
                scheduleTokenDisplayUpdate(currentTurnC.length, currentTurnT.length);
              }
              const sw = node.id + '|' + vIndex, now = Date.now();
              if (now - (lastBufferWrite[sw] || 0) > 500) { saveStreamBuffer(node, vIndex); lastBufferWrite[sw] = now; }
            }
            applyUsage(d);
          } catch(e){}
        };
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          const ls = buf.split('\n'); buf = ls.pop(); ls.forEach(proc);
        }
        if (buf.trim()) proc(buf.trim());
        if (tAcc.length) toolCalls = tAcc.filter(Boolean);
      }

      uiContent += currentTurnC; uiThinking += currentTurnT; llmContent += currentTurnC;

      if (toolCalls && toolCalls.length) {
        if (controller.signal.aborted) break;
        /* [12] carry reasoning_content on the assistant tool message */
        toolEvents.push({ role:'assistant', content: currentTurnC || null, reasoning_content: currentTurnT || null, tool_calls: toolCalls });
        llmContent = '';
        for (const tc of toolCalls) {
          uiContent += '\n\n```javascript\n// Executing: ' + (tc.function && tc.function.name) + '\n' + (tc.function && tc.function.arguments) + '\n```\n';
          node.versions[vIndex].rawContent = uiContent;
          if (node.activeVersion === vIndex) updateNodeDOM(node);
          let resStr = await execTool(tc, controller.signal);
          toolEvents.push({ role:'tool', tool_call_id: tc.id, content: resStr });
          uiContent += '\n```json\n// Result\n' + resStr + '\n```\n\n';
          node.versions[vIndex].rawContent = uiContent;
          if (node.activeVersion === vIndex) updateNodeDOM(node);
        }
        if (controller.signal.aborted) break;
        continue;
      }
      break;
    }

    node.versions[vIndex].rawContent = uiContent;
    node.versions[vIndex].llmContent = llmContent;
    node.versions[vIndex].thinking = uiThinking;
    if (toolEvents.length > 0) node.versions[vIndex]._toolEvents = toolEvents;
    await saveStreamBuffer(node, vIndex);
    node.versions[vIndex].endTime = node.lastUpdateTime || Date.now();
    finalizeGeneration(node, vIndex, controller);
  };
}
installAgenticPatch();

/* ================= anthropic bridge ================= */
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
    var blocks = [];
    var role = item.role === 'assistant' ? 'assistant' : 'user';
    if (item.role === 'tool'){
      blocks.push({ type:'tool_result', tool_use_id: item.tool_call_id, content: String(item.content || '') });
      role = 'user';
    } else {
      if (item.content) blocks.push({ type:'text', text: String(item.content) });
      if (item.tool_calls && item.tool_calls.length){
        item.tool_calls.forEach(tc => {
          if (tc.type === 'function'){
            let parsedArgs = {}; try { parsedArgs = JSON.parse(tc.function.arguments || '{}'); } catch(e){}
            blocks.push({ type:'tool_use', id: tc.id, name: tc.function.name, input: parsedArgs });
          }
        });
      }
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
    prompt_tokens_details: { cached_tokens: hit },
    input_tokens: prompt, output_tokens: output,
    cache_read_input_tokens: hit, cache_creation_input_tokens: creation
  };
}
function toAnswer(data){
  var blocks = Array.isArray(data && data.content) ? data.content : [];
  return {
    content: blocks.filter(function(x){ return x && x.type === 'text'; }).map(function(x){ return x.text || ''; }).join(''),
    reasoning: blocks.filter(function(x){ return x && x.type === 'thinking'; }).map(function(x){ return x.thinking || x.text || ''; }).join(''),
    usage: toUsage(data && data.usage),
    stop: (data && data.stop_reason) || 'stop',
    searched: blocks.some(function(x){ return x && (x.type === 'tool_use' || x.type === 'server_tool_use') && (x.name === 'web_search' || (x.input && (x.input.type === 'web_search' || x.input.name === 'web_search'))); })
  };
}
function openAIJson(answer, model){
  return { id:'chatcmpl-web-'+Date.now(), object:'chat.completion', created:Math.floor(Date.now()/1000), model:model, choices:[{ index:0, message:{ role:'assistant', content:answer.content, reasoning_content:answer.reasoning }, finish_reason: answer.stop==='max_tokens'?'length':'stop' }], usage:answer.usage };
}
function openAIStream(answer, model){
  var frames=[]; function push(value){ frames.push('data: '+JSON.stringify(value)+'\n\n'); }
  var base={ id:'chatcmpl-web-'+Date.now(), object:'chat.completion.chunk', created:Math.floor(Date.now()/1000), model:model };
  push(Object.assign({},base,{choices:[{index:0,delta:{role:'assistant'},finish_reason:null}]}));
  if(answer.reasoning) push(Object.assign({},base,{choices:[{index:0,delta:{reasoning_content:answer.reasoning},finish_reason:null}]}));
  if(answer.content) push(Object.assign({},base,{choices:[{index:0,delta:{content:answer.content},finish_reason:null}]}));
  push(Object.assign({},base,{choices:[{index:0,delta:{},finish_reason:answer.stop==='max_tokens'?'length':'stop'}],usage:answer.usage}));
  frames.push('data: [DONE]\n\n');
  return new ReadableStream({ start:function(controller){ for(var i=0;i<frames.length;i++) controller.enqueue(encodeText(frames[i])); controller.close(); } });
}
function anthropicUsageToOpenAI(startUsage, deltaUsage){
  var hit=Number(startUsage&&startUsage.cache_read_input_tokens)||0;
  var creation=Number(startUsage&&startUsage.cache_creation_input_tokens)||0;
  var uncached=Number(startUsage&&startUsage.input_tokens)||0;
  var output=Number(deltaUsage&&deltaUsage.output_tokens)||0;
  var prompt=uncached+hit+creation;
  return {
    prompt_tokens: prompt, completion_tokens: output, total_tokens: prompt+output,
    prompt_cache_hit_tokens: hit, prompt_cache_miss_tokens: uncached+creation,
    prompt_tokens_details: { cached_tokens: hit },
    input_tokens: prompt, output_tokens: output,
    cache_read_input_tokens: hit, cache_creation_input_tokens: creation
  };
}
function makeAnthropicTranslate(){
  var startUsage=null, searchedBlock=false, countedSearch=false;
  var currentToolId=null, toolIndex=-1;
  return function(ev){
    switch (ev && ev.type){
      case 'message_start': if(ev.message && ev.message.usage) startUsage=ev.message.usage; return null;
      case 'content_block_start': {
        var cb=ev.content_block||{};
        if(cb.type==='tool_use'||cb.type==='server_tool_use'){
          if(cb.name==='web_search'||(cb.input&&(cb.input.type==='web_search'||cb.input.name==='web_search'))){
            if(!countedSearch){ NS.stats.searchCalls++; countedSearch=true; }
            searchedBlock=true;
          } else {
            toolIndex++; currentToolId=cb.id;
            return { choices:[{ delta:{ tool_calls:[{ index:toolIndex, id:cb.id, type:'function', function:{ name:cb.name, arguments:'' } }] } }] };
          }
        }
        return null;
      }
      case 'content_block_delta': {
        var d=ev.delta||{};
        if(d.type==='thinking_delta') return { choices:[{ delta:{ reasoning_content: d.thinking||'' } }] };
        if(d.type==='text_delta') return { choices:[{ delta:{ content: d.text||'' } }] };
        if(d.type==='input_json_delta'){
          if(searchedBlock && NS.config.showSearchTrace){
            try { var j=JSON.parse(d.partial_json||'{}'); if(j.search_query){ searchedBlock=false; return { choices:[{ delta:{ reasoning_content:'[web_search] '+j.search_query } }] }; } } catch(e){}
          } else if(currentToolId){
            return { choices:[{ delta:{ tool_calls:[{ index:toolIndex, function:{ arguments: d.partial_json||'' } }] } }] };
          }
        }
        return null;
      }
      case 'content_block_stop': currentToolId=null; searchedBlock=false; return null;
      case 'message_delta': return { finish:true, usage: anthropicUsageToOpenAI(startUsage, ev.usage) }; /* [6] */
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
  var upstream = { model: original.model, messages: converted.messages, tools: [], stream: useStream };
  if (original.tools) {
    original.tools.forEach(t => {
      if (t.type === 'function') upstream.tools.push({ name:t.function.name, description:t.function.description||'', input_schema:t.function.parameters||{ type:'object', properties:{} } });
    });
  }
  if (NS.config.webSearch && !upstream.tools.some(t=>t.name==='web_search')) upstream.tools.push(SEARCH_TOOL);
  if (!upstream.tools.length) delete upstream.tools;
  if (converted.system) upstream.system = converted.system;
  ['temperature','top_p','thinking','reasoning_effort'].forEach(function(n){ if(original[n]!=null) upstream[n]=original[n]; });
  var rInit = { method:'POST', headers:{ 'content-type':'application/json', 'authorization':'Bearer '+key, 'x-api-key':key, 'anthropic-version':'2023-06-01' }, body: JSON.stringify(upstream), signal: opts.signal };
  return NS.origFetch(ANTHROPIC_ENDPOINT, rInit).then(function(resp){
    updateStats('anthropic', original.model, ANTHROPIC_ENDPOINT); updateStatus();
    if (useStream){
      if(!resp.ok || !resp.body) return resp;
      return new Response(makeCoalescedStream(resp.body, makeAnthropicTranslate()), { status:200, headers:{ 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-cache' } });
    }
    return resp.text().then(function(rawText){
      if(!resp.ok) return new Response(rawText, { status:resp.status, statusText:resp.statusText, headers:{ 'content-type': resp.headers.get('content-type')||'application/json' } });
      var data; try { data=JSON.parse(rawText); } catch(e){ throw Error('Anthropic endpoint invalid JSON: '+rawText.slice(0,500)); }
      var answer=toAnswer(data);
      if(answer.searched) NS.stats.searchCalls++;
      updateStatus();
      if(original.stream) return new Response(openAIStream(answer, original.model), { status:200, headers:{ 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-cache' } });
      return new Response(JSON.stringify(openAIJson(answer, original.model)), { status:200, headers:{ 'content-type':'application/json; charset=utf-8' } });
    });
  });
}

/* ================= responses hybrid (v3.3.2) ================= */
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
    if (NS.config.mode === 'responses' && payload && payload.model && !warned[payload.model]){ warned[payload.model]=1; warn('mode=responses but model not profiled: '+payload.model+' -> chat fallback.'); }
    return null;
  }
  if (!/\/chat\/completions(\?|$)/.test(url)) return null;
  var hosts = PROVIDER_HOSTS[plan.provider] || [];
  for (var i=0;i<hosts.length;i++) if (url.indexOf(hosts[i]) !== -1) return plan;
  return null;
}
/* [11] single-pass, correct order: user -> reasoning -> function_call -> function_call_output */
function buildResponsesRequest(chat, plan){
  var sys = [], input = [];
  (chat.messages || []).forEach(function(m){
    if (!m) return;
    if (m.role === 'system' || m.role === 'developer'){ sys.push(String(m.content || '')); return; }
    if (m.role === 'tool'){
      input.push({ type:'function_call_output', call_id: m.tool_call_id, output: String(m.content || '') });
      return;
    }
    if (m.role === 'assistant'){
      if (m.reasoning_content) input.push({ type:'reasoning', content:[{ type:'reasoning_text', text: String(m.reasoning_content) }] });
      if (m.content) input.push({ role:'assistant', content: String(m.content) });
      if (m.tool_calls && m.tool_calls.length){
        m.tool_calls.forEach(function(tc){
          if (tc.type === 'function') input.push({ type:'function_call', call_id: tc.id, name: tc.function.name, arguments: tc.function.arguments || '{}' });
        });
      }
      return;
    }
    input.push({ role:'user', content: String(m.content || '') });
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
  /* [4] forward function tools */
  if (chat.tools && chat.tools.length) {
    var ft = chat.tools.filter(function(t){ return t && t.type === 'function'; }).map(function(t){ return { type:'function', name:t.function.name, description:t.function.description||'', parameters:t.function.parameters||{ type:'object', properties:{} } }; });
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
function translateResponsesEvent(ev){
  switch (ev && ev.type){
    case 'response.created': if(ev.response && ev.response.id) NS.stats.last.id = ev.response.id; return null;
    case 'response.output_text.delta': return { choices:[{ delta:{ content: ev.delta||'' } }] };
    case 'response.reasoning_text.delta': return { choices:[{ delta:{ reasoning_content: ev.delta||'' } }] };
    case 'response.output_item.added': {
      var it = ev.item || {};
      if (it.type === 'function_call') return { choices:[{ delta:{ tool_calls:[{ index:0, id: it.call_id, type:'function', function:{ name: it.name, arguments:'' } }] } }] };
      return null;
    }
    case 'response.function_call_arguments.delta':
      return { choices:[{ delta:{ tool_calls:[{ index:0, function:{ arguments: ev.delta||'' } }] } }] };
    case 'response.output_item.done': {
      var item = ev.item || {};
      if (item.type === 'web_search_call'){
        NS.stats.searchCalls++;
        if (NS.config.showSearchTrace){ var q=(item.action&&(item.action.search_query||item.action.query))||'web search'; return { choices:[{ delta:{ reasoning_content:'[web_search] '+q } }] }; }
      }
      return null;
    }
    case 'response.completed':
    case 'response.incomplete': return { finish:true, usage: mapUsage(ev.response && ev.response.usage) };
    case 'response.failed': return { error: Error((ev.response && ev.response.error && ev.response.error.message) || 'Responses request failed.') };
    default: return null;
  }
}
function makeCoalescedStream(sourceBody, translate){
  return new ReadableStream({
    start: function(controller){
      var reader=sourceBody.getReader(), decoder=new TextDecoder(), buffer='', closed=false;
      var acc={ content:'', reasoning:'' }, timer=0;
      function enqueue(text){ if(!closed) try{ controller.enqueue(encodeText(text)); }catch(e){} }
      function flushAcc(){
        if(timer){ clearTimeout(timer); timer=0; }
        if(acc.content||acc.reasoning){ var delta={}; if(acc.content) delta.content=acc.content; if(acc.reasoning) delta.reasoning_content=acc.reasoning; enqueue('data: '+JSON.stringify({choices:[{delta:delta}]})+'\n\n'); acc.content=''; acc.reasoning=''; }
      }
      function scheduleFlush(){ if(timer)return; timer=setTimeout(function(){ timer=0; flushAcc(); }, NS.config.paintIntervalMs); }
      function finish(){ if(closed)return; flushAcc(); closed=true; enqueue('data: [DONE]\n\n'); try{ controller.close(); }catch(e){} }
      function handleBlock(block){
        var data=''; (block.split(/\r?\n/)||[]).forEach(function(line){ if(line.indexOf('data:')===0) data+=(data?'\n':'')+line.slice(5).replace(/^\s+/,''); });
        if(!data) return; if(data==='[DONE]'){ finish(); return; }
        var ev; try{ ev=JSON.parse(data); }catch(e){ return; }
        var out; try{ out=translate?translate(ev):ev; }catch(e){ out={error:e}; }
        if(!out) return;
        if(out.error){ if(!closed){ closed=true; try{ controller.error(out.error); }catch(e){} } return; }
        if(out.finish){ if(out.usage){ flushAcc(); enqueue('data: '+JSON.stringify({choices:[{delta:{}}],usage:out.usage})+'\n\n'); } finish(); return; }
        var delta=(out.choices&&out.choices[0]&&out.choices[0].delta)||{};
        if(delta.content){ acc.content+=delta.content; scheduleFlush(); }
        if(delta.reasoning_content){ acc.reasoning+=delta.reasoning_content; scheduleFlush(); }
        if(delta.tool_calls){ flushAcc(); enqueue('data: '+JSON.stringify(out)+'\n\n'); }
        if(out.usage){ flushAcc(); enqueue('data: '+JSON.stringify({choices:[{delta:{}}],usage:out.usage})+'\n\n'); }
      }
      function pump(){
        reader.read().then(function(res){
          if(closed){ try{ reader.cancel(); }catch(e){} return; }
          if(res.done){ finish(); return; }
          buffer+=decoder.decode(res.value,{stream:true});
          var m; while(!closed && (m=buffer.search(/\n\n|\r\n\r\n/))!==-1){ var sep=buffer[m]==='\r'?4:2; handleBlock(buffer.slice(0,m)); buffer=buffer.slice(m+sep); }
          pump();
        }).catch(function(err){ if(!closed){ closed=true; try{ controller.error(err); }catch(e){} } });
      }
      pump();
    }
  });
}
function translateFinal(data, plan){
  var content='', reasoning='';
  (data.output||[]).forEach(function(item){
    if(item && item.type==='message' && Array.isArray(item.content)) item.content.forEach(function(c){ if(c&&c.type==='output_text') content+=c.text||''; });
    else if(item && item.type==='reasoning'){ (item.summary||[]).forEach(function(s){ if(s&&s.type==='summary_text') reasoning+=s.text||''; }); if(!reasoning && typeof item.encrypted_content==='string') reasoning='[encrypted reasoning]'; }
    else if(item && item.type==='web_search_call'){ NS.stats.searchCalls++; var q=item.action&&(item.action.search_query||item.action.query); if(NS.config.showSearchTrace&&q) reasoning+=(reasoning?'\n':'')+'[web_search] '+q; }
  });
  var status = data.status==='failed'?'error':(data.status==='incomplete'?'length':'stop');
  return { id:data.id, object:'chat.completion', created:Math.floor(Date.now()/1000), model:data.model||plan.model, choices:[{ index:0, message:{ role:'assistant', content:content, reasoning_content:reasoning }, finish_reason:status }], usage:mapUsage(data.usage) };
}
function responsesHandler(input, init, url, opts){
  if(typeof opts.body!=='string') return null;
  var payload; try{ payload=JSON.parse(opts.body); }catch(e){ return null; }
  var plan=resolvePlan(url, payload);
  if(!plan) return null;
  var rReq=buildResponsesRequest(payload, plan);
  if(!rReq) return null;
  var base=url.replace(/\/chat\/completions(\?|$)/,'');
  var rUrl=base+plan.path;
  var rInit={};
  for(var k in opts) if(k!=='body') rInit[k]=opts[k];
  rInit.headers=cloneHeaders(opts.headers); rInit.headers['Content-Type']='application/json'; rInit.body=JSON.stringify(rReq);
  return NS.origFetch(rUrl, rInit).then(function(upstream){
    NS.stats.transformed++; updateStats('responses', payload.model, rUrl); updateStatus();
    if(!upstream.ok){ return upstream.text().then(function(text){ var msg='HTTP '+upstream.status; try{ var j=JSON.parse(text); if(j&&j.error&&j.error.message) msg+=': '+j.error.message; }catch(e){} return new Response(JSON.stringify({error:{message:msg}}),{status:upstream.status,headers:{'Content-Type':'application/json'}}); }); }
    if(payload.stream && upstream.body){ return new Response(makeCoalescedStream(upstream.body, translateResponsesEvent), { status:200, headers:{'Content-Type':'text/event-stream'} }); }
    return upstream.json().then(function(data){
      if(data.status==='failed'){ var em=(data.error&&data.error.message)||'Responses request failed.'; return new Response(JSON.stringify({error:{message:em}}),{status:400,headers:{'Content-Type':'application/json'}}); }
      return new Response(JSON.stringify(translateFinal(data, plan)), { status:200, headers:{'Content-Type':'application/json'} });
    });
  });
}
function coalescerHandler(input, init, url, opts){
  if(typeof opts.body!=='string') return null;
  var payload; try{ payload=JSON.parse(opts.body); }catch(e){ return null; }
  if(!(payload && payload.stream && Array.isArray(payload.messages) && /\/chat\/completions(\?|$)/.test(url))) return null;
  NS.stats.passthrough++; updateStats('chat', payload.model, url); updateStatus();
  return NS.origFetch.call(this, input, init).then(function(upstream){
    if(!upstream.ok || !upstream.body) return upstream;
    return new Response(makeCoalescedStream(upstream.body, null), { status:200, headers:{'Content-Type':'text/event-stream'} });
  });
}

/* ================= marked ================= */
var MARKED_CSS='.bubble table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.85rem;overflow-x:auto;display:block}.bubble th,.bubble td{border:1px solid var(--border);padding:8px 12px;text-align:left}.bubble th{background:rgba(0,0,0,.3);font-weight:bold;color:var(--accent)}.bubble tbody tr:nth-child(even){background:rgba(0,0,0,.15)}';
function captureOrigMarkdown(){ if(!NS.origFormatMarkdown && typeof formatMarkdown==='function') NS.origFormatMarkdown=formatMarkdown; }
function renderMarked(raw){
  var lib=window.marked;
  if(!lib||!raw) return NS.origFormatMarkdown?NS.origFormatMarkdown(raw):String(raw||'');
  try{
    var renderer={ code:function(token){ var text=(token&&token.text!=null)?token.text:String(token||''); var lang=(token&&token.lang)||'plain'; var collapsed=!!(settings.blockAutoCollapse&&text.length>settings.blockCollapseSize); return buildCodeBlockHTML(lang,text+'\n',collapsed); } };
    if(typeof lib.Marked==='function') return new lib.Marked({gfm:true,breaks:true,renderer:renderer}).parse(String(raw));
    if(typeof lib.parse==='function'){ var r=new lib.Renderer(); r.code=renderer.code; return lib.parse(String(raw),{renderer:r,breaks:true,gfm:true}); }
  }catch(e){ warn('marked render failed: '+e.message); }
  return NS.origFormatMarkdown?NS.origFormatMarkdown(raw):String(raw||'');
}
function injectMarkedCss(){ if(NS.markedCss)return; var s=document.createElement('style'); s.textContent=MARKED_CSS; document.head.appendChild(s); NS.markedCss=true; }
function loadMarked(){
  if(NS.markedReady) return Promise.resolve(true);
  if(NS.markedLoading) return NS.markedLoading;
  if(window.marked && (window.marked.parse||window.marked.Marked)){ NS.markedReady=true; return Promise.resolve(true); }
  NS.markedLoading=new Promise(function(resolve,reject){
    var s=document.createElement('script'); s.src=NS.config.markedSrc; s.crossOrigin='anonymous';
    s.onload=function(){ s.remove(); if(window.marked&&(window.marked.parse||window.marked.Marked)) resolve(true); else reject(Error('marked unusable')); };
    s.onerror=function(){ s.remove(); reject(Error('marked blocked: '+NS.config.markedSrc)); };
    document.head.appendChild(s);
  }).then(function(ok){ NS.markedReady=ok; NS.markedLoading=null; injectMarkedCss(); try{ if(typeof renderFullChat==='function') renderFullChat(); }catch(e){} return ok; }).catch(function(e){ NS.markedLoading=null; warn(e.message); return false; });
  return NS.markedLoading;
}
function applyMarkedOverride(){
  if(!NS.flags.marked) return;
  if(NS.formatMarkdownPatched) return;
  captureOrigMarkdown();
  try{ formatMarkdown=renderMarked; NS.formatMarkdownPatched=true; }catch(e){ warn('could not patch formatMarkdown: '+e.message); }
}
function removeMarkedOverride(){ if(NS.formatMarkdownPatched&&NS.origFormatMarkdown){ try{ formatMarkdown=NS.origFormatMarkdown; }catch(e){} NS.formatMarkdownPatched=false; } }

/* ================= apply / disable / api ================= */
function apply(){
  window.eval1b1=NS.flags.marked; window.eval1b2=NS.flags.anthropic; window.eval1b3=NS.flags.hybrid; window.eval1b4=NS.flags.pill; window.eval1b5=NS.flags.bridgeStream; window.eval1b6=NS.flags.tools;
  if(NS.flags.marked){ applyMarkedOverride(); loadMarked(); } else removeMarkedOverride();
  if(!window.__eval1_patched_v33) installAgenticPatch();
  var handlers=[];
  if(NS.flags.anthropic) handlers.push(anthropicHandler);
  if(NS.flags.hybrid) handlers.push(responsesHandler, coalescerHandler);
  var chained=function(input,init){
    var url=typeof input==='string'?input:(input&&input.url)||String(input||'');
    var opts=init||{}; var method=String(opts.method||(input&&input.method)||'GET').toUpperCase();
    if(method!=='POST') return NS.origFetch.call(this,input,init);
    for(var i=0;i<handlers.length;i++){ var r=handlers[i].call(this,input,init,url,opts); if(r) return r; }
    return NS.origFetch.call(this,input,init);
  };
  NS.chained=chained; window.fetch=chained;
  if(NS.flags.pill) ensureStatusPill(); else removeStatusPill();
  updateStatus(); NS.installed=true;
  try{ console.log('[eval1 v3.3.2] online — flags: '+JSON.stringify(NS.flags)); }catch(e){}
}
function disable(){
  if(NS.chained && window.fetch===NS.chained) window.fetch=NS.origFetch;
  removeMarkedOverride(); removeStatusPill();
  if(window.__eval1_patched_v33){
    try{ if(window.__origExecuteAPI) executeAPI=window.__origExecuteAPI; }catch(e){}
    try{ if(window.__origBuildAPIMessages) buildAPIMessages=window.__origBuildAPIMessages; }catch(e){}
    window.__eval1_patched_v33=false;
  }
  if(window.__eval1 && window.__eval1.removeExpTab){ try{ window.__eval1.removeExpTab(); }catch(e){} }
  NS.installed=false;
}
NS.apply=apply; NS.disable=disable;
NS.setFlag=function(name,val){ if(!(name in NS.flags)) throw Error('unknown flag: '+name); NS.flags[name]=val?1:0; apply(); return JSON.parse(JSON.stringify(NS.flags)); };
NS.setMode=function(m){ if(['auto','chat','responses'].indexOf(m)<0) throw Error('mode must be auto|chat|responses'); NS.config.mode=m; saveConfig(); updateStatus(); return NS.config.mode; };
NS.setWebSearch=function(v){ NS.config.webSearch=!!v; saveConfig(); updateStatus(); return NS.config.webSearch; };
NS.setShowSearchTrace=function(v){ NS.config.showSearchTrace=!!v; saveConfig(); updateStatus(); return NS.config.showSearchTrace; };
NS.setPaintInterval=function(ms){ NS.config.paintIntervalMs=Math.max(40,+ms||160); saveConfig(); return NS.config.paintIntervalMs; };
NS.status=function(){ return JSON.parse(JSON.stringify({version:NS.version,flags:NS.flags,config:NS.config,stats:NS.stats,installed:NS.installed})); };
NS._internals={ addCumulativeUsage:addCumulativeUsage, buildResponsesRequest:buildResponsesRequest, toAnthropic:toAnthropic, makeAnthropicTranslate:makeAnthropicTranslate, translateResponsesEvent:translateResponsesEvent, mapUsage:mapUsage };
apply();
})();

/* ===================== PART 2 — EXP TAB + INFO POPUPS ===================== */
(function(){
'use strict';
var NS = window.__eval1;
if (!NS) return;

var EXP_INFO = {
  tab: { t:'About this tab', h:'Experimental controls injected by the eval1 package (v3.3.2). Each toggle maps to <code>__eval1.setFlag(...)</code> / <code>__eval1.setMode(...)</code> and persists via localStorage (<code>dse_eval1_config</code>). Re-paste after a page reload.' },
  mode: { t:'API mode', h:'<b>auto</b> — per-model routing (recommended)<br><b>chat</b> — force Chat Completions; DeepSeek → anthropic bridge (web search)<br><b>responses</b> — profiled models (<code>deepseek-v4-pro/flash</code>, <code>gpt-5.6-sol/terra/luna</code>) → <code>/responses</code>. Non-profiled fall back to chat.' },
  webSearch: { t:'Web search', h:'Attach the server-side web_search tool where supported:<br>• anthropic bridge → <code>web_search_20250305</code><br>• responses adapter → <code>tools:[{type:"web_search"}]</code>' },
  showTrace: { t:'Show 🔎 trace', h:'Print <code>[web_search] query</code> into the thinking block + header 🔎 count. Turn off to keep searches invisible (they still run).' },
  paint: { t:'Paint interval', h:'ms between streaming UI updates (delta coalescer). 160ms ≈ 6 renders/s and kills the quadratic reparse freeze. Min 40.' },
  marked: { t:'Marked tables', h:'marked.js (pinned <code>marked@18.0.9/lib/marked.umd.js</code>) for GFM tables etc. Code blocks keep custom copy/collapse. <span style="color:var(--warning)">Raw HTML NOT sanitized.</span>' },
  anthropic: { t:'Anthropic bridge', h:'DeepSeek chat → <code>api.deepseek.com/anthropic/v1/messages</code> with <code>web_search_20250305</code>. Requires ON. Without "Streaming bridge", non-streaming (whole answer at once).' },
  bridgeStream: { t:'Streaming bridge', h:'When ON (and bridge ON): DeepSeek chat uses <code>stream:true</code>, translating <code>thinking_delta</code>/<code>text_delta</code> to live chunks. Tool calls forwarded too. OFF = non-streaming.' },
  hybrid: { t:'Responses hybrid', h:'Chat → <code>/responses</code> translation for profiled models (streaming). Function tools forwarded. Tool continuation uses <b>full stateless replay</b> in correct order <code>user → reasoning → function_call → function_call_output</code> (never <code>previous_response_id</code>). Thinking text is carried back so DeepSeek accepts the replay.' },
  tools: { t:'Agentic tools', h:'When ON, <code>tool_eval_1</code> is attached to chat requests (if the provider supports function calling) so the model can execute JS in your browser via the agentic loop. OFF = tools not auto-attached (save tokens; explicit request tools still honored).' },
  pill: { t:'Status pill', h:'Header indicator <code>API &lt;mode&gt; · &lt;model&gt; · 🔎count</code>. Click cycles auto→chat→responses. Hover for stats.' },
  route: { t:'Routing', h:'Where the next request goes given mode + toggles. DeepSeek → bridge (chat) or /responses · OpenAI profiled → /responses · others → chat (coalesced).' }
};

function qs(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function injectCss(){
  if (qs('expStyle')) return;
  var s=document.createElement('style'); s.id='expStyle';
  s.textContent = '.exp-info{background:none;border:1px solid var(--border);color:var(--text-secondary);border-radius:50%;width:17px;height:17px;font-size:10px;line-height:1;padding:0;cursor:help;vertical-align:middle;margin-left:4px;flex-shrink:0}.exp-info:hover{background:var(--border);color:var(--text)}.exp-popup-wrap{position:fixed;inset:0;z-index:8900;pointer-events:none}.exp-popup-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45);pointer-events:none}.exp-popup{position:absolute;top:max(64px,calc(env(safe-area-inset-top,0px) + 56px + 8px));left:50%;transform:translateX(-50%);width:min(540px,calc(100dvw - 24px));max-height:calc(100dvh - 120px);display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.6);pointer-events:auto;overflow:hidden}.exp-popup-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600;font-size:.85rem}.exp-popup-x{background:none;border:none;color:var(--text-secondary);font-size:1.2rem;cursor:pointer;line-height:1;padding:0 4px}.exp-popup-x:hover{color:var(--text)}.exp-popup-body{padding:12px 14px;overflow-y:auto;font-size:.78rem;line-height:1.6;color:var(--text)}.exp-popup-body code{background:var(--code-bg);padding:1px 5px;border-radius:4px;font-size:.72rem}.exp-popup-foot{padding:8px 14px;border-top:1px solid var(--border);display:flex;justify-content:flex-end}.exp-popup-close{background:var(--accent);color:#fff;border:none;padding:5px 14px;border-radius:8px;font-size:.75rem;cursor:pointer}';
  document.head.appendChild(s);
}
function popup(){ return qs('expPopupWrap'); }
function closePopup(){ var w=popup(); if (w) w.remove(); }
function openPopup(key){
  var info=EXP_INFO[key]||EXP_INFO.tab; closePopup();
  var wrap=document.createElement('div'); wrap.id='expPopupWrap'; wrap.className='exp-popup-wrap';
  wrap.innerHTML = '<div class="exp-popup-backdrop"></div><div class="exp-popup" role="dialog" aria-modal="true"><div class="exp-popup-head"><span>'+esc(info.t)+'</span><button class="exp-popup-x" data-expx="1" aria-label="Close">×</button></div><div class="exp-popup-body">'+info.h+'</div><div class="exp-popup-foot"><button class="exp-popup-close" data-expx="1">Close</button></div></div>';
  document.body.appendChild(wrap);
  wrap.addEventListener('click', function(e){ if (e.target.closest('[data-expx]')){ closePopup(); return; } if (e.target.closest('.exp-popup')) e.stopPropagation(); else closePopup(); });
  if (!NS._expEsc){ NS._expEsc=function(e){ if (e.key==='Escape') closePopup(); }; document.addEventListener('keydown', NS._expEsc, true); }
}
document.addEventListener('click', function(e){ if (!popup()) return; var t=e.target; if (t && t.closest && (t.closest('.exp-popup') || t.closest('[data-expinfo]'))) return; closePopup(); }, true);

function toggle(id){ return '<label class="toggle"><input type="checkbox" id="'+id+'"><span class="slider"></span></label>'; }
function infoBtn(key){ return '<button type="button" class="exp-info" data-expinfo="'+key+'" title="'+esc(EXP_INFO[key].t)+'">ⓘ</button>'; }
function row(label,key,control){ return '<div class="setting-row"><span>'+esc(label)+' '+infoBtn(key)+'</span>'+control+'</div>'; }

function removeExisting(){
  var b=document.querySelector('.tab-btn[data-tab="exp"]'); if (b) b.remove();
  var c=qs('tab-exp'); if (c) c.remove();
  closePopup();
}
function buildTab(){
  removeExisting();
  var swarmBtn=document.querySelector('.tab-btn[data-tab="swarm"]'), swarmTab=qs('tab-swarm');
  if (!swarmBtn || !swarmTab){ console.warn('[exp] swarm tab missing — cannot inject.'); return; }
  swarmBtn.insertAdjacentHTML('afterend','<button class="tab-btn" data-tab="exp">Exp</button>');
  var html = '<div class="tab-content" id="tab-exp">' +
      row('About', 'tab', '<span style="font-size:.68rem;color:var(--text-secondary)">v3.3.2</span>') +
      row('API mode', 'mode', '<select id="expMode"><option value="auto">auto</option><option value="chat">chat</option><option value="responses">responses</option></select>') +
      row('Web search', 'webSearch', toggle('expWebSearch')) +
      row('Show 🔎 trace', 'showTrace', toggle('expShowTrace')) +
      row('Paint interval (ms)', 'paint', '<input type="number" id="expPaint" min="40" step="10" style="width:75px">') +
      row('Marked tables', 'marked', toggle('expMarked')) +
      row('Anthropic bridge', 'anthropic', toggle('expAnthropic')) +
      row('Streaming bridge', 'bridgeStream', toggle('expBridgeStream')) +
      row('Responses hybrid', 'hybrid', toggle('expHybrid')) +
      row('Agentic tools', 'tools', toggle('expTools')) +
      row('Status pill', 'pill', toggle('expPill')) +
      row('Routing', 'route', '<span id="expRoute" style="font-size:.68rem;color:var(--text-secondary);font-family:monospace;overflow-wrap:anywhere"></span>') +
    '</div>';
  swarmTab.insertAdjacentHTML('afterend', html);
  var btn=document.querySelector('.tab-btn[data-tab="exp"]'); btn._=qs('tab-exp');
}
function updateRoute(){
  var el=qs('expRoute'); if (!el) return; var m=NS.config.mode, parts=[];
  if (m==='responses') parts.push('deepseek + gpt-5.6 → /responses');
  else if (m==='chat') parts.push('all → chat (deepseek → anthropic bridge' + (NS.flags.bridgeStream ? ' streaming' : '') + ')');
  else parts.push('deepseek → anthropic bridge' + (NS.flags.bridgeStream ? ' (streaming)' : '') + ' · openai profiled → /responses · others → chat');
  if (!NS.flags.anthropic) parts.push('anthropic OFF');
  if (!NS.flags.hybrid) parts.push('hybrid OFF');
  if (!NS.flags.tools) parts.push('tools OFF');
  el.textContent=parts.join(' · ');
}
function syncUI(){
  var v=function(id,val){ var el=qs(id); if (el) el.value=val; }, c=function(id,val){ var el=qs(id); if (el) el.checked=!!val; };
  v('expMode', NS.config.mode); c('expWebSearch', NS.config.webSearch); c('expShowTrace', NS.config.showSearchTrace); v('expPaint', NS.config.paintIntervalMs);
  c('expMarked', NS.flags.marked); c('expAnthropic', NS.flags.anthropic); c('expBridgeStream', NS.flags.bridgeStream); c('expHybrid', NS.flags.hybrid); c('expTools', NS.flags.tools); c('expPill', NS.flags.pill); updateRoute();
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
  on('expHybrid','change',function(e){ NS.setFlag('hybrid', e.target.checked?1:0); syncUI(); });
  on('expTools','change',function(e){ NS.setFlag('tools', e.target.checked?1:0); syncUI(); });
  on('expPill','change',function(e){ NS.setFlag('pill', e.target.checked?1:0); syncUI(); });
  document.querySelectorAll('#tab-exp [data-expinfo]').forEach(function(b){ b.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openPopup(b.dataset.expinfo); }); });
}
injectCss(); buildTab(); syncUI(); bind();
NS.removeExpTab = removeExisting;   /* [10] */
try { console.log('[exp] Exp tab installed (v3.3.2) — Settings → Exp → click ⓘ on any row.'); } catch(e){}
})();
