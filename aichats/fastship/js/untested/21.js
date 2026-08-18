/* =============================================================
   EVAL1 v4.0 — Unified Agentic Architecture (From Zero)
   ============================================================= */
var eval1b1 = window.eval1b1 ?? 1; /* marked */
var eval1b2 = window.eval1b2 ?? 1; /* anthropic bridge */
var eval1b3 = window.eval1b3 ?? 1; /* responses hybrid + coalescer */
var eval1b4 = window.eval1b4 ?? 1; /* status pill */
var eval1b5 = window.eval1b5 ?? 1; /* streaming bridge */

(function(){
var NS = window.__eval1 || (window.__eval1 = {});
var FIRST = !NS.installed;

if (FIRST){
  try { if (window.__hybridUpgrade?.disable) window.__hybridUpgrade.disable(); } catch(e){}
  try { if (window.DeepSeekWebSearch?.restore) window.DeepSeekWebSearch.restore(); } catch(e){}
  NS.version = '4.0';
  NS.origFetch = (window.fetch || fetch).bind(window);
  NS.installed = false;
  NS.flags = {};
  NS.stats = { transformed:0, passthrough:0, searchCalls:0, last:{} };
  NS.config = {
    mode: 'auto',
    paintIntervalMs: 160,
    markedSrc: 'https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.js',
    collapseTools: true,
    toolsInThinking: true,
    mirrorToolsInContent: false,
    tools: {
      eval: { on: true, confirm: false },
      webSearch: { on: true }
    }
  };
  try {
    var saved = JSON.parse(localStorage.getItem('dse_eval1_config') || '{}');
    for (var sk in saved) {
      if (sk === 'tools') { for (var tk in saved.tools) NS.config.tools[tk] = Object.assign(NS.config.tools[tk]||{}, saved.tools[tk]); }
      else NS.config[sk] = saved[sk];
    }
  } catch(e){}
} else if (!NS.installed) {
  NS.origFetch = (window.fetch || fetch).bind(window);
}
NS.version = '4.0';

(function(){
  var defs = { marked:eval1b1, anthropic:eval1b2, hybrid:eval1b3, pill:eval1b4, bridgeStream:eval1b5 };
  for (var k in defs) NS.flags[k] = defs[k] ? 1 : 0;
})();

function saveConfig(){ try { localStorage.setItem('dse_eval1_config', JSON.stringify(NS.config)); } catch(e){} }
function warn(msg){ try { console.warn('[eval1] ' + msg); } catch(e){} }
function updateStats(mode, model, url){ NS.stats.last = { mode: mode, model: model, url: url, ts: Date.now() }; }
function cloneHeaders(h){
  if (!h) return {};
  if (typeof Headers !== 'undefined' && h instanceof Headers){ var o = {}; h.forEach((v,k)=>{ o[k]=v; }); return o; }
  var out = {}; for (var k in h) out[k] = h[k]; return out;
}
function encodeText(s){ return new TextEncoder().encode(s); }

/* =========================================================================
   LAYER 1: TOOL SANDBOX & EXECUTION ENGINE
   ========================================================================= */
function safeStr(v) {
  try {
    if (v === undefined) return 'undefined';
    if (typeof v === 'bigint' || typeof v === 'symbol' || typeof v === 'function') return String(v);
    if (typeof v !== 'object' || v === null) return JSON.stringify(v);
    var seen = new WeakSet();
    return JSON.stringify(v, (k,x)=>{
      if (typeof x === 'bigint' || typeof x === 'symbol' || typeof x === 'function') return String(x);
      if (x && typeof x === 'object'){ if (seen.has(x)) return '[circular]'; seen.add(x); }
      return x;
    }, 2).slice(0, 20000) || 'undefined';
  } catch(e){ return String(v); }
}

function evalWorker(code, timeout, signal) {
  return new Promise(resolve => {
    try {
      if (signal?.aborted) return resolve({ ok: 0, e: 'aborted' });
      var src = `self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:1,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:0,e:String(err&&err.stack||err)})}}`;
      var w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      var t = setTimeout(()=>{ w.terminate(); resolve({ ok: 0, e: 'timeout' }); }, timeout);
      var onAbort = () => { clearTimeout(t); w.terminate(); resolve({ ok: 0, e: 'aborted' }); };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      w.onmessage = e => { clearTimeout(t); if(signal) signal.removeEventListener('abort', onAbort); w.terminate(); resolve(e.data); };
      w.onerror = err => { clearTimeout(t); if(signal) signal.removeEventListener('abort', onAbort); w.terminate(); resolve({ ok: 0, e: String(err.message||err) }); };
      w.postMessage(code);
    } catch(e){ resolve({ ok: 0, e: String(e) }); }
  });
}

window.__tools = window.__tools || {};
window.__tools.tool_eval_1 = {
  schema: {
    type: 'function',
    function: {
      name: 'tool_eval_1',
      description: 'Run arbitrary JavaScript in the browser and return JSON result. Use for math, fetch, text/DOM. Default timeout 10000ms; override with "timeout" (ms, max 60000). worker:false runs in page scope (app globals available); default isolated worker.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JavaScript to evaluate. Returned value or resolved Promise is returned as JSON.' },
          timeout: { type: 'number', description: 'ms (default 10000, max 60000)' },
          worker: { type: 'boolean', description: 'default true = isolated worker; false = page scope' }
        },
        required: ['code']
      }
    }
  },
  run: async (args = {}, signal) => {
    var code = String(args.code ?? args.expression ?? '').trim();
    var timeout = args.timeout == null ? 10000 : Math.max(1, Math.min(60000, Number(args.timeout)||10000));
    var worker = args.worker !== false;
    var t0 = performance.now();
    if (!code) return safeStr({ ok: false, error: 'no code provided' });
    var done = r => safeStr({ ok: !!r.ok, ms: Math.round(performance.now()-t0), ...(r.ok ? { result: r.r } : { error: r.e }) });

    if (worker) return done(await evalWorker(code, timeout, signal));

    return new Promise(resolve => {
      var done2 = false;
      var t = setTimeout(()=>{ if(!done2){ done2=true; resolve(done({ ok: 0, e: 'timeout' })); } }, timeout);
      var onAbort = () => { if(!done2){ done2=true; clearTimeout(t); resolve(done({ ok: 0, e: 'aborted' })); } };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      var fin = r => { if(done2) return; done2=true; clearTimeout(t); if(signal) signal.removeEventListener('abort', onAbort); resolve(done(r)); };
      try { Promise.resolve(eval(code)).then(r=>fin({ ok: 1, r }), e=>fin({ ok: 0, e: String(e?.stack||e) })); }
      catch(e){ fin({ ok: 0, e: String(e?.stack||e) }); }
    });
  }
};

async function execTool(tc, signal) {
  var name = tc.function?.name, def = window.__tools?.[name];
  var args = {};
  try { args = JSON.parse(tc.function?.arguments || '{}'); } catch(e){ args = { parseError: String(e), raw: tc.function?.arguments }; }
  if (!def) return JSON.stringify({ ok: false, error: 'unknown tool: ' + name });
  try {
    var out = await def.run(args, signal);
    return typeof out === 'string' ? out : JSON.stringify(out);
  } catch(e){ return JSON.stringify({ ok: false, error: String(e?.stack||e) }); }
}

function formatUnifiedBlock(name, callArgs, resStr) {
  var prettyArgs = callArgs;
  try { prettyArgs = JSON.stringify(JSON.parse(callArgs), null, 2); } catch(e){}
  return `\n\n\`\`\`\`${name}\n\`\`\`call\n${prettyArgs}\n\`\`\`\n\`\`\`response\n${resStr}\n\`\`\`\n\`\`\`\`\n\n`;
}

/* =========================================================================
   LAYER 2: AGENTIC LOOP, STATE ENGINE & CONFIRMATION
   ========================================================================= */
window.__eval1_pending = window.__eval1_pending || {};
window.__eval1_confirm = function(id, allow) { if (window.__eval1_pending[id]) window.__eval1_pending[id](allow); };

function addUsage(acc, curr) {
  if (!acc) return JSON.parse(JSON.stringify(curr || {}));
  if (!curr) return acc;
  var out = { ...acc };
  ['prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'input_tokens', 'output_tokens'].forEach(k => {
    if (curr[k]) out[k] = (out[k] || 0) + curr[k];
  });
  if (curr.prompt_tokens_details) {
    out.prompt_tokens_details = out.prompt_tokens_details || {};
    out.prompt_tokens_details.cached_tokens = (out.prompt_tokens_details.cached_tokens || 0) + (curr.prompt_tokens_details.cached_tokens || 0);
  }
  return out;
}

if (!window.__eval1_patched) {
  window.__eval1_patched = true;
  window.__origBuildAPIMessages = buildAPIMessages;

  buildAPIMessages = function(targetPath, r=run(), msgs) {
    if (msgs) return window.__origBuildAPIMessages(targetPath, r, msgs);
    var out = [{ role: r.systemRole || 'system', content: 'You are a helpful assistant.' }];
    targetPath.forEach(n => {
      if (n.id !== 'root' && n.role !== 'system' && n.role !== 'system-msg') {
        var ver = n.versions[n.activeVersion || 0];
        if (ver._toolEvents && Array.isArray(ver._toolEvents)) out.push(...ver._toolEvents);
        var finalContent = ver.llmContent !== undefined ? ver.llmContent : ver.rawContent;
        if (finalContent) out.push({ role: n.role, content: finalContent });
      }
    });
    return r.prompt ? out.concat({ role: r.systemRole || 'system', content: r.prompt }) : out;
  };

  executeAPI = async function(messages, node, vIndex, controller, r=run()) {
    var p = r.p, key = getApiKey(p.id), isStream = settings.streaming, modelId = r.m;

    var tools = [];
    if (Array.isArray(r.request?.tools)) tools = r.request.tools;
    else if (typeof r.request?.tools === 'string') tools = r.request.tools.split(/[,\s]+/).filter(Boolean).map(n => window.__tools?.[n]?.schema).filter(Boolean);
    else if (!('tools' in (r.request || {}))) tools = Object.values(window.__tools || {}).map(t => t.schema).filter(Boolean);

    tools = tools.filter(t => {
      if (t.function?.name === 'tool_eval_1') return NS.config.tools.eval.on;
      return true;
    });

    var payload = { ...r.request, model: modelId, temperature: r.supportsTemperature === false ? void 0 : (r.temperature ?? 0.7), stream: isStream };
    if (tools.length) { payload.tools = tools; if (!payload.tool_choice) payload.tool_choice = 'auto'; }
    payload[p.maxTokensParam || 'max_tokens'] = r.maxTokens;
    if (isStream && p.supportsStreamUsage) payload.stream_options = { include_usage: true };

    node.versions[vIndex].startTime = Date.now();
    var toolEvents = [], uiContent = '', llmContent = '', uiThinking = '', cumulativeUsage = null, cumulativeExactCost = 0;

    for (var turn = 0; turn <= 10; turn++) {
      if (controller.signal.aborted) break;
      var reqMessages = [...messages, ...toolEvents];
      if (llmContent) reqMessages.push({ role: 'assistant', content: llmContent });

      var res = await fetch(p.baseURL + p.apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': (p.authHeader ? p.authHeader + ' ' : '') + key },
        body: JSON.stringify({ ...payload, messages: reqMessages }),
        signal: controller.signal
      });

      if (!res.ok) { var errBody = (await res.text()).trim(); throw new Error(`HTTP ${res.status} ${errBody}`); }

      var applyUsage = envelope => {
        var costBad = {}, next = r.usagePath === false ? envelope : r.usagePath ? at(envelope, r.usagePath) : envelope?.usage ?? envelope?.usageMetadata ?? envelope?.message?.usage;
        var rc = usageValue(envelope, r.usageCost, costBad);
        if (!costBad.value && rc !== undefined) cumulativeExactCost += rc;
        if (next && typeof next === 'object') cumulativeUsage = addUsage(cumulativeUsage, next);
        if (cumulativeUsage || cumulativeExactCost > 0) applyResponseMetadata(node.versions[vIndex], cumulativeUsage || {}, r, cumulativeExactCost || undefined);
      };

      var toolCalls = null, currentTurnC = '', currentTurnT = '';

      if (!isStream) {
        var data = await res.json(); applyUsage(data);
        var msg = data.choices?.[0]?.message || {};
        if (msg.tool_calls?.length) toolCalls = msg.tool_calls;
        currentTurnC = msg.content || ''; currentTurnT = msg.reasoning_content || '';
      } else {
        var reader = res.body.getReader(), dec = new TextDecoder();
        var buf = '', first = true, lastR = 0, tAcc = [];
        var proc = line => {
          if (!line.startsWith('data: ')) return;
          var js = line.slice(6).trim();
          if (!js || js === '[DONE]') return;
          try {
            var d = JSON.parse(js), delta = d.choices?.[0]?.delta || {};
            currentTurnC += delta.content || ''; currentTurnT += delta.reasoning_content || '';
            (delta.tool_calls || []).forEach(dtc => {
              var i = dtc.index ?? tAcc.length;
              var a = tAcc[i] ?? (tAcc[i] = { id: '', type: 'function', function: { name: '', arguments: '' } });
              if (dtc.id) a.id = dtc.id;
              if (dtc.function) {
                if (dtc.function.name) a.function.name += dtc.function.name;
                if (dtc.function.arguments) a.function.arguments += dtc.function.arguments;
              }
            });

            node.lastUpdateTime = Date.now();
            var v = node.versions[vIndex];
            v.rawContent = uiContent + currentTurnC;
            v.thinking = uiThinking + currentTurnT;

            if (first && (currentTurnC || currentTurnT || tAcc.length)) {
              if (node.activeVersion === vIndex) updateNodeDOM(node);
              first = false; handleNewContent(0, true);
            }
            if (!first && (currentTurnC.length + currentTurnT.length)) {
              if (node.activeVersion === vIndex) {
                v.unread = false; var l = currentTurnC.length + currentTurnT.length;
                handleNewContent(l - lastR, false); lastR = l;
                var el = getMessageEl(node.id);
                if (el) {
                  var b = el.querySelector('.bubble'), cc = el.closest('.message').querySelector('.char-count');
                  var h = buildThinkingSection(v.thinking, node.id, true) + formatMarkdown(v.rawContent);
                  if (b && b.innerHTML !== h) b.innerHTML = h;
                  if (cc) cc.textContent = getMessageStatString(node, v);
                }
                scheduleTokenDisplayUpdate(currentTurnC.length, currentTurnT.length);
              } else {
                var vs = node.versions, a = node.activeVersion;
                if ((vs[a].swarm && !vs[a].endTime) || !v.unread) updateVersionDots(node, vIndex);
              }
              var sw = node.id + '|' + vIndex, now = Date.now();
              if (now - (lastBufferWrite[sw] || 0) > 500) { saveStreamBuffer(node, vIndex); lastBufferWrite[sw] = now; }
            }
            applyUsage(d);
          } catch(e){}
        };

        while (true) {
          var { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          var ls = buf.split('\n'); buf = ls.pop(); ls.forEach(proc);
        }
        if (buf.trim()) proc(buf.trim());
        if (tAcc.length) toolCalls = tAcc.filter(Boolean);
      }

      uiContent += currentTurnC; uiThinking += currentTurnT; llmContent += currentTurnC;

      if (toolCalls && toolCalls.length) {
        if (controller.signal.aborted) break;
        toolEvents.push({ role: 'assistant', content: currentTurnC || null, tool_calls: toolCalls });
        llmContent = '';

        var wasThinking = currentTurnT.trim().length > 0 && NS.config.toolsInThinking;

        for (var tc of toolCalls) {
          var pendingBlock = formatUnifiedBlock(tc.function?.name, tc.function?.arguments, '[Executing...]');
          if (wasThinking) uiThinking += pendingBlock;
          else uiContent += pendingBlock;

          node.versions[vIndex].rawContent = uiContent;
          node.versions[vIndex].thinking = uiThinking;
          if (node.activeVersion === vIndex) updateNodeDOM(node);

          var resStr = '';
          var needsConfirm = (tc.function?.name === 'tool_eval_1' && NS.config.tools.eval.confirm);

          if (needsConfirm) {
            var cid = 'tc-' + tc.id;
            var confirmHtml = `<div id="${cid}" style="border:1px solid var(--warning);padding:10px;border-radius:8px;margin:8px 0;background:rgba(212,160,80,0.15)">
              <div style="font-size:.82rem;font-weight:bold;color:var(--warning);margin-bottom:6px">⚠️ Tool Confirmation: <code>${tc.function?.name}</code></div>
              <button class="btn" style="background:var(--success);padding:3px 12px" onclick="window.__eval1_confirm('${tc.id}',true)">Allow</button>
              <button class="btn-outline" style="border-color:var(--danger);color:var(--danger);margin-left:6px;padding:3px 12px" onclick="window.__eval1_confirm('${tc.id}',false)">Deny</button>
            </div>`;

            if (wasThinking) uiThinking += confirmHtml;
            else uiContent += confirmHtml;
            node.versions[vIndex].rawContent = uiContent;
            node.versions[vIndex].thinking = uiThinking;
            if (node.activeVersion === vIndex) updateNodeDOM(node);

            var allowed = await new Promise(resolve => {
              window.__eval1_pending[tc.id] = resolve;
              controller.signal.addEventListener('abort', () => resolve(false), { once: true });
            });

            if (wasThinking) uiThinking = uiThinking.replace(confirmHtml, '');
            else uiContent = uiContent.replace(confirmHtml, '');

            if (!allowed) resStr = JSON.stringify({ ok: false, error: 'User denied execution.' });
            else resStr = await execTool(tc, controller.signal);
          } else {
            resStr = await execTool(tc, controller.signal);
          }

          toolEvents.push({ role: 'tool', tool_call_id: tc.id, content: resStr });
          var completedBlock = formatUnifiedBlock(tc.function?.name, tc.function?.arguments, resStr);

          if (wasThinking) {
            uiThinking = uiThinking.replace(pendingBlock, completedBlock);
            if (NS.config.mirrorToolsInContent) uiContent += completedBlock;
          } else {
            uiContent = uiContent.replace(pendingBlock, completedBlock);
          }

          node.versions[vIndex].rawContent = uiContent;
          node.versions[vIndex].thinking = uiThinking;
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

/* =========================================================================
   LAYER 3: NETWORK ADAPTER (Anthropic Bridge, /responses & Coalescer)
   ========================================================================= */
var ANTHROPIC_ENDPOINT = 'https://api.deepseek.com/anthropic/v1/messages';
var SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search' };

function textOf(content){
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content == null ? '' : String(content);
  return content.map(p => typeof p === 'string' ? p : (p && p.text) || '').filter(Boolean).join('\n');
}

function toAnthropic(source){
  var system = [], messages = [];
  for (var i = 0; i < source.length; i++){
    var item = source[i];
    if (item.role === 'system' || item.role === 'developer'){ system.push(item.content || ''); continue; }
    var blocks = [];
    var role = item.role === 'assistant' ? 'assistant' : 'user';

    if (item.role === 'tool'){
      blocks.push({ type: 'tool_result', tool_use_id: item.tool_call_id, content: String(item.content || '') });
      role = 'user';
    } else {
      if (item.content) blocks.push({ type: 'text', text: String(item.content) });
      if (item.tool_calls && item.tool_calls.length){
        item.tool_calls.forEach(tc => {
          if (tc.type === 'function'){
            var parsed = {}; try { parsed = JSON.parse(tc.function.arguments || '{}'); } catch(e){}
            blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: parsed });
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
  var hit = Number(raw && (raw.cache_read_input_tokens ?? raw.prompt_cache_hit_tokens)) || 0;
  var creation = Number(raw && raw.cache_creation_input_tokens) || 0;
  var uncached = Number(raw && (raw.input_tokens ?? raw.prompt_cache_miss_tokens)) || 0;
  var output = Number(raw && (raw.output_tokens ?? raw.completion_tokens)) || 0;
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
    content: blocks.filter(x => x && x.type === 'text').map(x => x.text || '').join(''),
    reasoning: blocks.filter(x => x && x.type === 'thinking').map(x => x.thinking || x.text || '').join(''),
    usage: toUsage(data && data.usage), stop: (data && data.stop_reason) || 'stop',
    searched: blocks.some(x => x && (x.type === 'tool_use' || x.type === 'server_tool_use') && (x.name === 'web_search' || x.input?.type === 'web_search' || x.input?.name === 'web_search'))
  };
}

function openAIJson(answer, model){
  return {
    id: 'chatcmpl-web-' + Date.now(), object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: model,
    choices: [{ index: 0, message: { role: 'assistant', content: answer.content, reasoning_content: answer.reasoning }, finish_reason: answer.stop === 'max_tokens' ? 'length' : 'stop' }],
    usage: answer.usage
  };
}

function openAIStream(answer, model){
  var frames = []; function push(v){ frames.push('data: ' + JSON.stringify(v) + '\n\n'); }
  var base = { id: 'chatcmpl-web-' + Date.now(), object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: model };
  push({ ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });
  if (answer.reasoning) push({ ...base, choices: [{ index: 0, delta: { reasoning_content: answer.reasoning }, finish_reason: null }] });
  if (answer.content) push({ ...base, choices: [{ index: 0, delta: { content: answer.content }, finish_reason: null }] });
  push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: answer.stop === 'max_tokens' ? 'length' : 'stop' }], usage: answer.usage });
  frames.push('data: [DONE]\n\n');
  return new ReadableStream({ start: c => { for (var f of frames) c.enqueue(encodeText(f)); c.close(); } });
}

function makeAnthropicTranslate(){
  var startUsage = null, searchedBlock = false, countedSearch = false;
  var currentToolId = null, toolIndex = -1;
  return function(ev){
    switch (ev?.type){
      case 'message_start': if (ev.message?.usage) startUsage = ev.message.usage; return null;
      case 'content_block_start': {
        var cb = ev.content_block || {};
        if (cb.type === 'tool_use' || cb.type === 'server_tool_use'){
          if (cb.name === 'web_search' || cb.input?.type === 'web_search' || cb.input?.name === 'web_search'){
            if (!countedSearch){ NS.stats.searchCalls++; countedSearch = true; }
            searchedBlock = true;
            return { choices: [{ delta: { content: `\n\n\`\`\`\`web_search\n\`\`\`call\n` } }] };
          } else {
            toolIndex++; currentToolId = cb.id;
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
          if (searchedBlock) return { choices: [{ delta: { content: d.partial_json || '' } }] };
          if (currentToolId) return { choices: [{ delta: { tool_calls: [{ index: toolIndex, function: { arguments: d.partial_json || '' } }] } }] };
        }
        return null;
      }
      case 'content_block_stop':
        if (searchedBlock){ searchedBlock = false; return { choices: [{ delta: { content: `\n\`\`\`\n\`\`\`\`\n\n` } }] }; }
        currentToolId = null; return null;
      case 'message_delta': return { finish: true, usage: { prompt_tokens: startUsage?.input_tokens || 0, completion_tokens: ev.usage?.output_tokens || 0 } };
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
  var headers = new Headers(opts.headers || (input instanceof Request ? input.headers : undefined));
  var key = (headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key) return null;

  var converted = toAnthropic(original.messages || []);
  var useStream = !!(NS.flags.bridgeStream && original.stream);
  var upstream = { model: original.model, messages: converted.messages, tools: [], stream: useStream };

  if (original.tools){
    original.tools.forEach(t => {
      if (t.type === 'function') upstream.tools.push({ name: t.function.name, description: t.function.description || '', input_schema: t.function.parameters || { type: 'object', properties: {} } });
    });
  }
  if (NS.config.tools.webSearch.on && original.model.includes('deepseek') && !upstream.tools.some(t => t.name === 'web_search')) upstream.tools.push(SEARCH_TOOL);
  if (!upstream.tools.length) delete upstream.tools;
  if (converted.system) upstream.system = converted.system;
  ['temperature', 'top_p', 'thinking', 'reasoning_effort'].forEach(n => { if (original[n] != null) upstream[n] = original[n]; });

  var rInit = { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + key, 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(upstream), signal: opts.signal };
  return NS.origFetch(ANTHROPIC_ENDPOINT, rInit).then(resp => {
    updateStats('anthropic', original.model, ANTHROPIC_ENDPOINT); updateStatus();
    if (useStream){
      if (!resp.ok || !resp.body) return resp;
      return new Response(makeCoalescedStream(resp.body, makeAnthropicTranslate()), { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' } });
    }
    return resp.text().then(rawText => {
      if (!resp.ok) return new Response(rawText, { status: resp.status, statusText: resp.statusText, headers: { 'content-type': resp.headers.get('content-type') || 'application/json' } });
      var data; try { data = JSON.parse(rawText); } catch(e){ throw Error('Anthropic endpoint invalid JSON'); }
      var answer = toAnswer(data);
      if (answer.searched) NS.stats.searchCalls++;
      updateStatus();
      if (original.stream) return new Response(openAIStream(answer, original.model), { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' } });
      return new Response(JSON.stringify(openAIJson(answer, original.model)), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
    });
  });
}

var MODELS = { 'deepseek-v4-pro': { provider:'deepseek', path:'/responses' }, 'deepseek-v4-flash': { provider:'deepseek', path:'/responses' }, 'gpt-5.6-sol': { provider:'openai', path:'/responses' }, 'gpt-5.6-terra': { provider:'openai', path:'/responses' }, 'gpt-5.6-luna': { provider:'openai', path:'/responses' } };
var PROVIDER_HOSTS = { deepseek:['api.deepseek.com'], openai:['api.openai.com'] };
var warned = {};

function resolvePlan(url, payload){
  if (NS.config.mode === 'chat') return null;
  var plan = MODELS[payload?.model];
  if (!plan){
    if (NS.config.mode === 'responses' && payload?.model && !warned[payload.model]){
      warned[payload.model] = 1; warn('mode=responses but model not profiled: ' + payload.model + ' -> chat fallback.');
    }
    return null;
  }
  if (!/\/chat\/completions(\?|$)/.test(url)) return null;
  var hosts = PROVIDER_HOSTS[plan.provider] || [];
  for (var h of hosts) if (url.includes(h)) return plan;
  return null;
}

function buildResponsesRequest(chat, plan){
  var sys = [], input = [];
  (chat.messages || []).forEach(m => {
    if (!m) return;
    if (m.role === 'system' || m.role === 'developer') sys.push(String(m.content || ''));
    else if (m.role === 'user' || m.role === 'assistant') input.push({ role: m.role, content: String(m.content || '') });
    else input.push({ role: 'user', content: '[tool] ' + String(m.content || '') });
  });
  if (!input.length) return null;
  var req = { model: chat.model, input: input, stream: !!chat.stream };
  if (sys.length) req.instructions = sys.join('\n\n');
  var max = chat.max_tokens ?? chat.max_completion_tokens;
  if (max) req.max_output_tokens = max;
  if (typeof chat.temperature === 'number' && plan.provider !== 'deepseek') req.temperature = chat.temperature;
  if (NS.config.tools.webSearch.on){
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
  if (typeof u.input_tokens_details?.cached_tokens === 'number') o.prompt_tokens_details = { cached_tokens: u.input_tokens_details.cached_tokens };
  if (typeof u.output_tokens_details?.reasoning_tokens === 'number') o.completion_tokens_details = { reasoning_tokens: u.output_tokens_details.reasoning_tokens };
  return Object.keys(o).length ? o : undefined;
}

function translateResponsesEvent(ev){
  switch (ev?.type){
    case 'response.created': if (ev.response?.id) NS.stats.last.id = ev.response.id; return null;
    case 'response.output_text.delta': return { choices: [{ delta: { content: ev.delta || '' } }] };
    case 'response.reasoning_text.delta': return { choices: [{ delta: { reasoning_content: ev.delta || '' } }] };
    case 'response.output_item.done': {
      var item = ev.item || {};
      if (item.type === 'web_search_call'){
        NS.stats.searchCalls++;
        var q = item.action?.search_query || item.action?.query || 'web search';
        return { choices: [{ delta: { content: `\n\n\`\`\`\`web_search\n\`\`\`call\n{"query": "${q}"}\n\`\`\`\n\`\`\`\`\n\n` } }] };
      }
      return null;
    }
    case 'response.completed':
    case 'response.incomplete': return { finish: true, usage: mapUsage(ev.response?.usage) };
    case 'response.failed': return { error: Error(ev.response?.error?.message || 'Responses request failed.') };
    default: return null;
  }
}

function makeCoalescedStream(sourceBody, translate){
  return new ReadableStream({
    start(controller){
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
      function scheduleFlush(){ if (timer) return; timer = setTimeout(()=>{ timer = 0; flushAcc(); }, NS.config.paintIntervalMs); }
      function finish(){ if (closed) return; flushAcc(); closed = true; enqueue('data: [DONE]\n\n'); try { controller.close(); } catch(e){} }
      function handleBlock(block){
        var data = '';
        (block.split(/\r?\n/) || []).forEach(line => {
          if (line.indexOf('data:') === 0) data += (data ? '\n' : '') + line.slice(5).trimStart();
        });
        if (!data) return;
        if (data === '[DONE]'){ finish(); return; }
        var ev; try { ev = JSON.parse(data); } catch(e){ return; }
        var out; try { out = translate ? translate(ev) : ev; } catch(e){ out = { error: e }; }
        if (!out) return;
        if (out.error){ if (!closed){ closed = true; try { controller.error(out.error); } catch(e){} } return; }
        if (out.finish){ if (out.usage){ flushAcc(); enqueue('data: ' + JSON.stringify({ choices: [{ delta: {} }], usage: out.usage }) + '\n\n'); } finish(); return; }
        var delta = out.choices?.[0]?.delta || {};
        if (delta.content){ acc.content += delta.content; scheduleFlush(); }
        if (delta.reasoning_content){ acc.reasoning += delta.reasoning_content; scheduleFlush(); }
        if (delta.tool_calls){ flushAcc(); enqueue('data: ' + JSON.stringify(out) + '\n\n'); }
        if (out.usage){ flushAcc(); enqueue('data: ' + JSON.stringify({ choices: [{ delta: {} }], usage: out.usage }) + '\n\n'); }
      }
      function pump(){
        reader.read().then(res => {
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
        }).catch(err => { if (!closed){ closed = true; try { controller.error(err); } catch(e){} } });
      }
      pump();
    }
  });
}

function translateFinal(data, plan){
  var content = '', reasoning = '';
  (data.output || []).forEach(item => {
    if (item?.type === 'message' && Array.isArray(item.content)){
      item.content.forEach(c => { if (c?.type === 'output_text') content += c.text || ''; });
    } else if (item?.type === 'reasoning'){
      (item.summary || []).forEach(s => { if (s?.type === 'summary_text') reasoning += s.text || ''; });
      if (!reasoning && typeof item.encrypted_content === 'string') reasoning = '[encrypted reasoning]';
    } else if (item?.type === 'web_search_call'){
      NS.stats.searchCalls++;
      var q = item.action?.search_query || item.action?.query;
      if (q) reasoning += (reasoning ? '\n' : '') + '[web_search] ' + q;
    }
  });
  var status = data.status === 'failed' ? 'error' : (data.status === 'incomplete' ? 'length' : 'stop');
  return {
    id: data.id, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model: data.model || plan.model,
    choices: [{ index: 0, message: { role: 'assistant', content: content, reasoning_content: reasoning }, finish_reason: status }],
    usage: mapUsage(data.usage)
  };
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
  return NS.origFetch(rUrl, rInit).then(upstream => {
    NS.stats.transformed++; updateStats('responses', payload.model, rUrl); updateStatus();
    if (!upstream.ok){
      return upstream.text().then(text => {
        var msg = 'HTTP ' + upstream.status; try { var j = JSON.parse(text); if (j?.error?.message) msg += ': ' + j.error.message; } catch(e){}
        return new Response(JSON.stringify({ error: { message: msg } }), { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
      });
    }
    if (payload.stream && upstream.body){
      return new Response(makeCoalescedStream(upstream.body, translateResponsesEvent), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    return upstream.json().then(data => {
      if (data.status === 'failed'){
        var em = data.error?.message || 'Responses request failed.';
        return new Response(JSON.stringify({ error: { message: em } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(translateFinal(data, plan)), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  });
}

function coalescerHandler(input, init, url, opts){
  if (typeof opts.body !== 'string') return null;
  var payload; try { payload = JSON.parse(opts.body); } catch(e){ return null; }
  if (!(payload?.stream && Array.isArray(payload.messages) && /\/chat\/completions(\?|$)/.test(url))) return null;
  NS.stats.passthrough++; updateStats('chat', payload.model, url); updateStatus();
  return NS.origFetch.call(this, input, init).then(upstream => {
    if (!upstream.ok || !upstream.body) return upstream;
    return new Response(makeCoalescedStream(upstream.body, null), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  });
}

/* =========================================================================
   LAYER 4: MARKED.JS & EXP TAB CONTROLS
   ========================================================================= */
var MARKED_CSS = '.bubble table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.85rem;overflow-x:auto;display:block}.bubble th,.bubble td{border:1px solid var(--border);padding:8px 12px;text-align:left}.bubble th{background:rgba(0,0,0,.3);font-weight:bold;color:var(--accent)}.bubble tbody tr:nth-child(even){background:rgba(0,0,0,.15)}';
function captureOrigMarkdown(){ if (!NS.origFormatMarkdown && typeof formatMarkdown === 'function') NS.origFormatMarkdown = formatMarkdown; }

window.__eval1_toggledBlocks = window.__eval1_toggledBlocks || new Set();
if (!window.__eval1_clickListenerAttached) {
  window.__eval1_clickListenerAttached = true;
  document.addEventListener('click', e => {
    var t = e.target;
    if (t.matches('.down') || t.matches('.up')) {
      var block = t.closest('.code-block'); var pre = block?.querySelector('pre');
      if (pre?.dataset.is4tick === 'true') {
        var code = pre.textContent;
        var isCollapsed = block.querySelector('.code-body')?.classList.contains('collapsed');
        if (!isCollapsed) window.__eval1_toggledBlocks.add(code);
        else window.__eval1_toggledBlocks.delete(code);
      }
    }
  });
}

function renderMarked(raw){
  var lib = window.marked;
  if (!lib || !raw) return NS.origFormatMarkdown ? NS.origFormatMarkdown(raw) : String(raw || '');
  try {
    var renderer = {
      code(token){
        var text = (token?.text != null) ? token.text : String(token || '');
        var lang = token?.lang || 'plain';
        var collapsed = !!(settings.blockAutoCollapse && text.length > settings.blockCollapseSize);
        var is4Ticks = token.raw?.startsWith('````');
        if (is4Ticks && NS.config.collapseTools) {
          if (!window.__eval1_toggledBlocks.has(text + '\n')) collapsed = true;
        } else if (is4Ticks) {
          if (window.__eval1_toggledBlocks.has(text + '\n')) collapsed = false;
        }
        var html = buildCodeBlockHTML(lang, text + '\n', collapsed);
        if (is4Ticks) html = html.replace('<pre ', '<pre data-is4tick="true" ');
        return html;
      }
    };
    if (typeof lib.Marked === 'function') return new lib.Marked({ gfm: true, breaks: true, renderer }).parse(String(raw));
    if (typeof lib.parse === 'function'){ var r = new lib.Renderer(); r.code = renderer.code; return lib.parse(String(raw), { renderer: r, breaks: true, gfm: true }); }
  } catch(e){ warn('marked render error: ' + e.message); }
  return NS.origFormatMarkdown ? NS.origFormatMarkdown(raw) : String(raw || '');
}

function injectMarkedCss(){ if (NS.markedCss) return; var s = document.createElement('style'); s.textContent = MARKED_CSS; document.head.appendChild(s); NS.markedCss = true; }
function loadMarked(){
  if (NS.markedReady) return Promise.resolve(true);
  if (NS.markedLoading) return NS.markedLoading;
  if (window.marked?.parse || window.marked?.Marked){ NS.markedReady = true; return Promise.resolve(true); }
  NS.markedLoading = new Promise((resolve, reject) => {
    var s = document.createElement('script'); s.src = NS.config.markedSrc; s.crossOrigin = 'anonymous';
    s.onload = () => { s.remove(); if (window.marked?.parse || window.marked?.Marked) resolve(true); else reject(Error('marked unready')); };
    s.onerror = () => { s.remove(); reject(Error('marked unavailable')); };
    document.head.appendChild(s);
  }).then(ok => { NS.markedReady = ok; NS.markedLoading = null; injectMarkedCss(); try { renderFullChat?.(); } catch(e){} return ok; })
    .catch(e => { NS.markedLoading = null; warn(e.message); return false; });
  return NS.markedLoading;
}
function applyMarkedOverride(){ if (!NS.flags.marked || NS.formatMarkdownPatched) return; captureOrigMarkdown(); try { formatMarkdown = renderMarked; NS.formatMarkdownPatched = true; } catch(e){} }
function removeMarkedOverride(){ if (NS.formatMarkdownPatched && NS.origFormatMarkdown){ try { formatMarkdown = NS.origFormatMarkdown; } catch(e){} NS.formatMarkdownPatched = false; } }

function apply(){
  window.eval1b1 = NS.flags.marked; window.eval1b2 = NS.flags.anthropic; window.eval1b3 = NS.flags.hybrid; window.eval1b4 = NS.flags.pill; window.eval1b5 = NS.flags.bridgeStream;
  if (NS.flags.marked){ applyMarkedOverride(); loadMarked(); } else removeMarkedOverride();
  var handlers = [];
  if (NS.flags.anthropic) handlers.push(anthropicHandler);
  if (NS.flags.hybrid) handlers.push(responsesHandler, coalescerHandler);

  var chained = function(input, init){
    var url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
    var opts = init || {}; var method = String(opts.method || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'POST') return NS.origFetch.call(this, input, init);
    for (var h of handlers){ var r = h.call(this, input, init, url, opts); if (r) return r; }
    return NS.origFetch.call(this, input, init);
  };
  NS.chained = chained; window.fetch = chained;
  if (NS.flags.pill) ensureStatusPill(); else removeStatusPill();
  updateStatus(); NS.installed = true;
}
function disable(){ if (NS.chained && window.fetch === NS.chained) window.fetch = NS.origFetch; removeMarkedOverride(); removeStatusPill(); NS.installed = false; }

NS.apply = apply; NS.disable = disable;
NS.setFlag = (n,v) => { if (!(n in NS.flags)) throw Error('unknown flag'); NS.flags[n] = v ? 1 : 0; apply(); return NS.flags; };
NS.setMode = m => { NS.config.mode = m; saveConfig(); updateStatus(); return NS.config.mode; };
NS.setWebSearch = v => { NS.config.tools.webSearch.on = !!v; saveConfig(); return NS.config.tools.webSearch.on; };
NS.setPaintInterval = ms => { NS.config.paintIntervalMs = Math.max(40, +ms || 160); saveConfig(); return NS.config.paintIntervalMs; };

apply();
})();

/* =========================================================================
   LAYER 5: EXP TAB INJECTION & MODAL POPUPS
   ========================================================================= */
(function(){
var NS = window.__eval1; if (!NS) return;

var EXP_INFO = {
  tab: { t:'About Exp Tab', h:'Experimental controls injected by the eval1 v4.0 package. Full tool execution, routing & display customization.' },
  mode: { t:'API mode', h:'<b>auto</b> — per-model routing<br><b>chat</b> — force Chat Completions (DeepSeek → Anthropic bridge)<br><b>responses</b> — profiled models → <code>/responses</code> API.' },
  evalTool: { t:'JS Eval Tool', h:'Enables <code>tool_eval_1</code>, allowing the AI to run JavaScript directly in your browser.' },
  evalConfirm: { t:'JS Eval Confirmation', h:'When ON, the AI cannot run code without your explicit permission. A yellow ⚠️ prompt with <b>Allow / Deny</b> buttons will appear in the chat.' },
  webSearch: { t:'Web Search', h:'Attaches the server-side web search tool to supported models (DeepSeek, Responses).' },
  collapseTools: { t:'Auto-Collapse Tools', h:'Keeps tool blocks collapsed by default. User manual expansion is remembered across streaming turns.' },
  toolsInThinking: { t:'Tools in Thinking', h:'When ON, if a model calls a tool while reasoning, the block is rendered inside the thinking section.' },
  mirrorTools: { t:'Mirror Tools in Response', h:'When ON, tools triggered in the thinking phase are also shown in the main response body.' },
  paint: { t:'Paint Interval', h:'Milliseconds between streaming UI renders. 160ms eliminates quadratic Markdown lag.' },
  marked: { t:'Marked Tables', h:'Enables marked.js for full GFM tables, strikethrough, and nested code blocks.' },
  anthropic: { t:'Anthropic Bridge', h:'Rewrites DeepSeek Chat to Anthropic Messages endpoint.' },
  bridgeStream: { t:'Streaming Bridge', h:'Real-time SSE token & tool streaming for Anthropic bridge.' },
  hybrid: { t:'Responses Hybrid', h:'Routes profiled models to /responses.' },
  pill: { t:'Status Pill', h:'Small status badge in top header bar.' },
  route: { t:'Live Route', h:'Shows where your next generation will be routed.' }
};

function qs(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function injectCss(){
  if (qs('expStyle')) return;
  var s = document.createElement('style'); s.id = 'expStyle';
  s.textContent = `
    .exp-info{background:none;border:1px solid var(--border);color:var(--text-secondary);border-radius:50%;width:17px;height:17px;font-size:10px;line-height:1;padding:0;cursor:help;vertical-align:middle;margin-left:4px;flex-shrink:0}
    .exp-info:hover{background:var(--border);color:var(--text)}
    .exp-popup-wrap{position:fixed;inset:0;z-index:8900;pointer-events:none}
    .exp-popup-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45);pointer-events:none}
    .exp-popup{position:absolute;top:max(64px,calc(env(safe-area-inset-top,0px) + 56px + 8px));left:50%;transform:translateX(-50%);width:min(540px,calc(100dvw - 24px));max-height:calc(100dvh - 120px);display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.6);pointer-events:auto;overflow:hidden}
    .exp-popup-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600;font-size:.85rem}
    .exp-popup-x{background:none;border:none;color:var(--text-secondary);font-size:1.2rem;cursor:pointer;line-height:1;padding:0 4px}
    .exp-popup-body{padding:12px 14px;overflow-y:auto;font-size:.78rem;line-height:1.6;color:var(--text)}
    .exp-popup-body code{background:var(--code-bg);padding:1px 5px;border-radius:4px;font-size:.72rem}
    .exp-popup-foot{padding:8px 14px;border-top:1px solid var(--border);display:flex;justify-content:flex-end}
    .exp-popup-close{background:var(--accent);color:#fff;border:none;padding:5px 14px;border-radius:8px;font-size:.75rem;cursor:pointer}
  `;
  document.head.appendChild(s);
}

function closePopup(){ var w = qs('expPopupWrap'); if (w) w.remove(); }
function openPopup(key){
  var info = EXP_INFO[key] || EXP_INFO.tab; closePopup();
  var wrap = document.createElement('div'); wrap.id = 'expPopupWrap'; wrap.className = 'exp-popup-wrap';
  wrap.innerHTML = `
    <div class="exp-popup-backdrop"></div>
    <div class="exp-popup" role="dialog" aria-modal="true">
      <div class="exp-popup-head"><span>${esc(info.t)}</span><button class="exp-popup-x" data-expx="1">×</button></div>
      <div class="exp-popup-body">${info.h}</div>
      <div class="exp-popup-foot"><button class="exp-popup-close" data-expx="1">Close</button></div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => { if (e.target.closest('[data-expx]') || !e.target.closest('.exp-popup')) closePopup(); });
}

document.addEventListener('click', e => {
  if (!qs('expPopupWrap')) return;
  if (!e.target.closest('.exp-popup') && !e.target.closest('[data-expinfo]')) closePopup();
}, true);

function toggle(id){ return `<label class="toggle"><input type="checkbox" id="${id}"><span class="slider"></span></label>`; }
function infoBtn(key){ return `<button type="button" class="exp-info" data-expinfo="${key}" title="${esc(EXP_INFO[key]?.t||'')}">ⓘ</button>`; }
function row(label, key, ctrl){ return `<div class="setting-row"><span>${esc(label)} ${infoBtn(key)}</span>${ctrl}</div>`; }

function buildTab(){
  var oldBtn = document.querySelector('.tab-btn[data-tab="exp"]'); if (oldBtn) oldBtn.remove();
  var oldTab = qs('tab-exp'); if (oldTab) oldTab.remove();

  var swarmBtn = document.querySelector('.tab-btn[data-tab="swarm"]'), swarmTab = qs('tab-swarm');
  if (!swarmBtn || !swarmTab) return;

  swarmBtn.insertAdjacentHTML('afterend', '<button type="button" class="tab-btn" data-tab="exp">Exp</button>');
  var html = `
    <div class="tab-content" id="tab-exp">
      ${row('API mode', 'mode', '<select id="expMode"><option value="auto">auto</option><option value="chat">chat</option><option value="responses">responses</option></select>')}
      
      <div style="margin:8px 0;padding:8px;border:1px solid var(--border);border-radius:8px;background:rgba(0,0,0,0.15)">
        <div style="font-size:0.75rem;font-weight:bold;color:var(--text-secondary);margin-bottom:8px">Autonomous Tool Controls</div>
        ${row('JS Eval Tool', 'evalTool', toggle('expEvalTool'))}
        ${row('Require Permission (Confirm)', 'evalConfirm', toggle('expEvalConfirm'))}
        ${row('Web Search (DeepSeek)', 'webSearch', toggle('expWebSearch'))}
        ${row('Auto-Collapse Tool Blocks', 'collapseTools', toggle('expCollapseTools'))}
        ${row('Place Tools in Thinking', 'toolsInThinking', toggle('expToolsInThinking'))}
        ${row('Mirror Tools in Response', 'mirrorTools', toggle('expMirrorTools'))}
      </div>

      ${row('Paint interval (ms)', 'paint', '<input type="number" id="expPaint" min="40" step="10" style="width:75px">')}
      ${row('Marked tables (GFM)', 'marked', toggle('expMarked'))}
      ${row('Anthropic bridge', 'anthropic', toggle('expAnthropic'))}
      ${row('Streaming bridge', 'bridgeStream', toggle('expBridgeStream'))}
      ${row('Responses hybrid', 'hybrid', toggle('expHybrid'))}
      ${row('Status pill', 'pill', toggle('expPill'))}
      ${row('Live Routing', 'route', '<span id="expRoute" style="font-size:.68rem;color:var(--text-secondary);font-family:monospace;overflow-wrap:anywhere"></span>')}
    </div>`;
  swarmTab.insertAdjacentHTML('afterend', html);

  var btn = document.querySelector('.tab-btn[data-tab="exp"]');
  var content = qs('tab-exp');
  btn._ = content;

  btn.onclick = function(e){
    e.preventDefault(); e.stopPropagation();
    var b = btn.parentNode, p = content.parentNode;
    [...b.children, ...p.children].forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    content.classList.add('active');
    localStorage.dse_activeTab = 'exp';
  };
}

function updateRoute(){
  var el = qs('expRoute'); if (!el) return;
  var m = NS.config.mode, parts = [];
  if (m === 'responses') parts.push('deepseek flash + gpt-5.6 → /responses');
  else if (m === 'chat') parts.push('all → chat (deepseek → anthropic bridge' + (NS.flags.bridgeStream ? ' streaming' : '') + ')');
  else parts.push('deepseek → anthropic bridge' + (NS.flags.bridgeStream ? ' (streaming)' : '') + ' · openai profiled → /responses · others → chat');
  el.textContent = parts.join(' · ');
}

function syncUI(){
  var v = (id, val) => { var el = qs(id); if (el) el.value = val; };
  var c = (id, val) => { var el = qs(id); if (el) el.checked = !!val; };

  v('expMode', NS.config.mode); v('expPaint', NS.config.paintIntervalMs);
  c('expEvalTool', NS.config.tools.eval.on);
  c('expEvalConfirm', NS.config.tools.eval.confirm);
  c('expWebSearch', NS.config.tools.webSearch.on);
  c('expCollapseTools', NS.config.collapseTools);
  c('expToolsInThinking', NS.config.toolsInThinking);
  c('expMirrorTools', NS.config.mirrorToolsInContent);

  c('expMarked', NS.flags.marked);
  c('expAnthropic', NS.flags.anthropic);
  c('expBridgeStream', NS.flags.bridgeStream);
  c('expHybrid', NS.flags.hybrid);
  c('expPill', NS.flags.pill);
  updateRoute();
}

function bind(){
  var on = (id, ev, fn) => { var el = qs(id); if (el) el.addEventListener(ev, fn); };
  on('expMode', 'change', e => { NS.setMode(e.target.value); updateRoute(); });
  on('expEvalTool', 'change', e => { NS.config.tools.eval.on = e.target.checked; saveConfig(); });
  on('expEvalConfirm', 'change', e => { NS.config.tools.eval.confirm = e.target.checked; saveConfig(); });
  on('expWebSearch', 'change', e => { NS.config.tools.webSearch.on = e.target.checked; saveConfig(); });
  on('expCollapseTools', 'change', e => { NS.config.collapseTools = e.target.checked; saveConfig(); });
  on('expToolsInThinking', 'change', e => { NS.config.toolsInThinking = e.target.checked; saveConfig(); });
  on('expMirrorTools', 'change', e => { NS.config.mirrorToolsInContent = e.target.checked; saveConfig(); });

  on('expPaint', 'change', e => { var v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 40) NS.setPaintInterval(v); });
  on('expMarked', 'change', e => { NS.setFlag('marked', e.target.checked ? 1 : 0); syncUI(); });
  on('expAnthropic', 'change', e => { NS.setFlag('anthropic', e.target.checked ? 1 : 0); syncUI(); });
  on('expBridgeStream', 'change', e => { NS.setFlag('bridgeStream', e.target.checked ? 1 : 0); syncUI(); });
  on('expHybrid', 'change', e => { NS.setFlag('hybrid', e.target.checked ? 1 : 0); syncUI(); });
  on('expPill', 'change', e => { NS.setFlag('pill', e.target.checked ? 1 : 0); syncUI(); });

  document.querySelectorAll('#tab-exp [data-expinfo]').forEach(b => {
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openPopup(b.dataset.expinfo); });
  });
}

injectCss(); buildTab(); syncUI(); bind();
console.log('[eval1 v4.0] Clean Engine Loaded: Sandboxes, Confirmations, Hybrid Routing & Exp UI active.');
})();
