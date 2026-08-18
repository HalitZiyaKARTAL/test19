/* =============================================================
   EVAL1 v3.1 — The Unified Agentic Architecture
   -------------------------------------------------------------
   Fixed Anthropic multi-tool grouping, improved Worker schema.
   ============================================================= */

(function(){
var NS = window.__eval1 || (window.__eval1 = {});
if (!NS.installed) {
    NS.origFetch = (window.fetch || fetch).bind(window);
    NS.installed = false;
    NS.flags = { marked:1, anthropic:1, hybrid:1, pill:1, bridgeStream:1 };
    NS.stats = { transformed:0, passthrough:0, searchCalls:0, last:{} };
    NS.config = { mode:'auto', webSearch:true, webSearchStyle:'tools', showSearchTrace:true, paintIntervalMs:160, markedSrc:'https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.js' };
    try { var saved = JSON.parse(localStorage.getItem('dse_eval1_config') || '{}'); for (var sk in saved) NS.config[sk] = saved[sk]; } catch(e){}
}
NS.version = '3.1';

function saveConfig(){ try { localStorage.setItem('dse_eval1_config', JSON.stringify(NS.config)); } catch(e){} }
function updateStats(mode, model, url){ NS.stats.last = { mode: mode, model: model, url: url, ts: Date.now() }; }
function cloneHeaders(h){ if (!h) return {}; if (typeof Headers !== 'undefined' && h instanceof Headers){ var o = {}; h.forEach(function(v,k){ o[k] = v; }); return o; } var out = {}; for (var k in h) out[k] = h[k]; return out; }
function encodeText(s){ return new TextEncoder().encode(s); }

/* =========================================================
   1. TOOL REGISTRY & WEB WORKER SANDBOX
   ========================================================= */
const safeStr = v => { 
    try {
        if (v === undefined) return undefined; // Let it drop from JSON
        if (typeof v === 'bigint' || typeof v === 'symbol' || typeof v === 'function') return String(v);
        if (typeof v !== 'object' || v === null) return JSON.stringify(v);
        const seen = new WeakSet();
        return JSON.stringify(v, (k,x)=>{ if(typeof x==='bigint'||typeof x==='symbol'||typeof x==='function') return String(x); if(x&&typeof x==='object'){ if(seen.has(x)) return '[circular]'; seen.add(x);} return x; }, 2).slice(0,20000) || 'undefined';
    } catch(e){ return String(v); } 
};

const evalWorker = (code, timeout, signal) => new Promise(resolve => { 
    try {
        if (signal?.aborted) return resolve({ok:0,e:'aborted'});
        const src = `self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:1,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:0,e:String(err&&err.stack||err)})}}`;
        const w = new Worker(URL.createObjectURL(new Blob([src], {type:'text/javascript'})));
        const t = setTimeout(()=>{ w.terminate(); resolve({ok:0,e:'timeout'}); }, timeout);
        const abortHandler = () => { clearTimeout(t); w.terminate(); resolve({ok:0,e:'aborted'}); };
        if (signal) signal.addEventListener('abort', abortHandler);
        w.onmessage = e => { clearTimeout(t); if(signal) signal.removeEventListener('abort', abortHandler); w.terminate(); resolve(e.data); };
        w.onerror = err => { clearTimeout(t); if(signal) signal.removeEventListener('abort', abortHandler); w.terminate(); resolve({ok:0,e:String(err.message||err)}); };
        w.postMessage(code);
    } catch(e){ resolve({ok:0,e:String(e)}); } 
});

window.__tools = window.__tools || {};
window.__tools.tool_eval_1 = { 
    schema: {
        type:'function', function:{ 
            name:'tool_eval_1',
            description:'Execute JavaScript in the browser. Returns JSON result. The last statement must be an expression to return a value (do NOT use console.log to return data). By default runs in isolated Web Worker. SET "worker": false if you need to access window, document, or DOM.',
            parameters:{ type:'object', properties:{ code:{ type:'string', description:'JavaScript code to run.' }, timeout:{ type:'number' }, worker:{ type:'boolean', description:'false = full page DOM access. true = isolated worker (default)' } }, required:['code'] }
        }
    }, 
    run: async (args={}, signal) => {
        const code = String(args.code ?? args.expression ?? '').trim();
        const timeout = args.timeout == null ? 10000 : Math.max(1, Math.min(60000, Number(args.timeout)||10000));
        const worker = args.worker !== false;
        const t0 = performance.now();
        if (!code) return safeStr({ok:false, error:'no code provided'});
        const done = r => safeStr({ ok:!!r.ok, ms:Math.round(performance.now()-t0), ...(r.ok ? {result:r.r} : {error:r.e}) });
        
        if (worker) return done(await evalWorker(code, timeout, signal));
        
        return new Promise(resolve => { 
            let done2 = false;
            const t = setTimeout(()=>{ if(!done2){ done2=true; resolve(done({ok:0,e:'timeout'})); } }, timeout);
            const abortHandler = () => { if(!done2){ done2=true; clearTimeout(t); resolve(done({ok:0,e:'aborted'})); } };
            if (signal) signal.addEventListener('abort', abortHandler);
            const fin = r => { if(done2) return; done2=true; clearTimeout(t); if(signal) signal.removeEventListener('abort', abortHandler); resolve(done(r)); };
            try { Promise.resolve(eval(code)).then(r=>fin({ok:1,r}), e=>fin({ok:0,e:String(e?.stack||e)})); }
            catch(e){ fin({ok:0,e:String(e?.stack||e)}); }
        });
    } 
};

const execTool = async (tc, signal) => {
    const name = tc.function?.name, def = window.__tools?.[name]; let args = {};
    try { args = JSON.parse(tc.function?.arguments || '{}'); } catch(e){ args = { parseError:String(e), raw:tc.function?.arguments }; }
    if (!def) return JSON.stringify({ok:false, error:'unknown tool: '+name});
    try { const out = await def.run(args, signal); return typeof out==='string' ? out : JSON.stringify(out); }
    catch(e){ return JSON.stringify({ok:false, error:String(e?.stack||e)}); }
};

/* =========================================================
   2. APP LOGIC PATCHES (Memory & Execution)
   ========================================================= */
function addCumulativeUsage(acc, curr) {
    if (!acc) return JSON.parse(JSON.stringify(curr || {}));
    if (!curr) return acc;
    let out = { ...acc };
    const keys = ['prompt_tokens', 'completion_tokens', 'total_tokens', 'prompt_cache_hit_tokens', 'prompt_cache_miss_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'input_tokens', 'output_tokens'];
    keys.forEach(k => { if (curr[k]) out[k] = (out[k] || 0) + curr[k]; });
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
        let out = [{role: r.systemRole || 'system', content: 'You are a helpful assistant.'}];
        targetPath.forEach(n => {
            if (n.id !== 'root' && n.role !== 'system' && n.role !== 'system-msg') {
                const ver = n.versions[n.activeVersion || 0];
                if (ver._toolEvents && Array.isArray(ver._toolEvents)) out.push(...ver._toolEvents);
                const finalContent = ver.llmContent !== undefined ? ver.llmContent : ver.rawContent;
                if (finalContent) out.push({ role: n.role, content: finalContent });
            }
        });
        return r.prompt ? out.concat({role: r.systemRole||'system', content: r.prompt}) : out;
    };

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
        let uiContent = '', llmContent = '', uiThinking = '';
        let cumulativeUsage = null, cumulativeExactCost = 0;

        for (let turn = 0; turn <= 10; turn++) {
            if (controller.signal.aborted) break;
            
            const reqMessages = [...messages, ...toolEvents];
            if (llmContent) reqMessages.push({ role: 'assistant', content: llmContent });

            const res = await fetch(p.baseURL + p.apiPath, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': (p.authHeader ? p.authHeader + ' ' : '') + key },
                body: JSON.stringify({ ...payload, messages: reqMessages }),
                signal: controller.signal
            });

            if (!res.ok) { const body = (await res.text()).trim(); throw new Error(`HTTP ${res.status} ${body}`); }

            let applyUsage = envelope => {
                const costBad = {}, next = r.usagePath === false ? envelope : r.usagePath ? at(envelope, r.usagePath) : envelope?.usage ?? envelope?.usageMetadata ?? envelope?.message?.usage;
                const rc = usageValue(envelope, r.usageCost, costBad);
                if (!costBad.value && rc !== undefined) cumulativeExactCost += rc;
                if (next && typeof next === 'object') cumulativeUsage = addCumulativeUsage(cumulativeUsage, next);
                if (cumulativeUsage || cumulativeExactCost > 0) applyResponseMetadata(node.versions[vIndex], cumulativeUsage || {}, r, cumulativeExactCost || undefined);
            };

            let toolCalls = null;
            let currentTurnC = '', currentTurnT = '';

            if (!isStream) {
                const data = await res.json(); applyUsage(data);
                const msg = data.choices?.[0]?.message || {};
                if (msg.tool_calls?.length) toolCalls = msg.tool_calls;
                currentTurnC = msg.content || ''; currentTurnT = msg.reasoning_content || '';
            } else {
                const reader = res.body.getReader(), dec = new TextDecoder();
                let buf = '', first = true, lastR = 0, tAcc = [];
                
                const proc = line => {
                    if (!line.startsWith('data: ')) return; const js = line.slice(6).trim(); if (!js || js === '[DONE]') return;
                    try {
                        const d = JSON.parse(js), delta = d.choices?.[0]?.delta || {};
                        currentTurnC += delta.content || ''; currentTurnT += delta.reasoning_content || '';
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
                        v.rawContent = uiContent + currentTurnC; v.thinking = uiThinking + currentTurnT;
                        
                        if (first && (currentTurnC || currentTurnT || tAcc.length)) { if (node.activeVersion === vIndex) updateNodeDOM(node); first = false; handleNewContent(0, true); }
                        if (!first && (currentTurnC.length + currentTurnT.length)) {
                            if (node.activeVersion === vIndex) {
                                v.unread = false; const l = currentTurnC.length + currentTurnT.length; handleNewContent(l - lastR, false); lastR = l;
                                const el = getMessageEl(node.id);
                                if (el) {
                                    const b = el.querySelector('.bubble'), cc = el.closest('.message').querySelector('.char-count');
                                    const h = buildThinkingSection(v.thinking, node.id, true) + formatMarkdown(v.rawContent);
                                    if (b && b.innerHTML !== h) b.innerHTML = h; if (cc) cc.textContent = getMessageStatString(node, v);
                                }
                                scheduleTokenDisplayUpdate(currentTurnC.length, currentTurnT.length);
                            }
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

            uiContent += currentTurnC; uiThinking += currentTurnT; llmContent += currentTurnC;

            if (toolCalls && toolCalls.length) {
                if (controller.signal.aborted) break;
                
                toolEvents.push({ role: 'assistant', content: currentTurnC || null, tool_calls: toolCalls });
                llmContent = ''; // Reset LLM text buffer
                
                for (const tc of toolCalls) {
                    uiContent += `\n\n\`\`\`javascript\n// Executing: ${tc.function?.name}\n${tc.function?.arguments}\n\`\`\`\n`;
                    node.versions[vIndex].rawContent = uiContent;
                    if (node.activeVersion === vIndex) updateNodeDOM(node);

                    let resStr = await execTool(tc, controller.signal);
                    toolEvents.push({ role: 'tool', tool_call_id: tc.id, content: resStr });
                    
                    uiContent += `\n\`\`\`json\n// Result\n${resStr}\n\`\`\`\n\n`;
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

/* =========================================================
   3. NETWORK TRANSLATORS (Anthropic & Responses)
   ========================================================= */
const SEARCH_TOOL = { type:'web_search_20250305', name:'web_search' };

function toAnthropic(source){
    var system = [], messages = [];
    for (var i = 0; i < source.length; i++){
        var item = source[i];
        if (item.role === 'system' || item.role === 'developer'){ system.push(item.content || ''); continue; }
        
        let blocks = [];
        var role = item.role === 'assistant' ? 'assistant' : 'user';

        if (item.role === 'tool'){
            blocks.push({ type: 'tool_result', tool_use_id: item.tool_call_id, content: String(item.content || '') });
            role = 'user'; // Tools map to User role in Anthropic
        } else {
            if (item.content) blocks.push({ type: 'text', text: String(item.content) });
            if (item.tool_calls && item.tool_calls.length) {
                item.tool_calls.forEach(tc => {
                    if (tc.type === 'function') {
                        let parsedArgs = {}; try { parsedArgs = JSON.parse(tc.function.arguments || '{}'); } catch(e){}
                        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: parsedArgs });
                    }
                });
            }
        }
        
        // Ensure consecutive same-role messages merge block arrays properly
        var prev = messages[messages.length - 1];
        if (prev && prev.role === role) {
            prev.content = prev.content.concat(blocks);
        } else {
            messages.push({ role: role, content: blocks });
        }
    }
    return { system: system.join('\n\n'), messages: messages };
}

function makeAnthropicTranslate(){
    var startUsage = null, searchedBlock = false, countedSearch = false;
    var currentToolId = null, toolIndex = -1;
    return function(ev){
        switch (ev && ev.type){
            case 'message_start': if (ev.message && ev.message.usage) startUsage = ev.message.usage; return null;
            case 'content_block_start': {
                var cb = ev.content_block || {};
                if (cb.type === 'tool_use' || cb.type === 'server_tool_use'){
                    if (cb.name === 'web_search' || (cb.input && (cb.input.type === 'web_search' || cb.input.name === 'web_search'))){
                        if (!countedSearch){ NS.stats.searchCalls++; countedSearch = true; }
                        searchedBlock = true;
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
                    if (searchedBlock && NS.config.showSearchTrace) {
                        try { var j = JSON.parse(d.partial_json || '{}'); if (j.search_query){ searchedBlock = false; return { choices: [{ delta: { reasoning_content: '[web_search] ' + j.search_query } }] }; } } catch(e){}
                    } else if (currentToolId) {
                        return { choices: [{ delta: { tool_calls: [{ index: toolIndex, function: { arguments: d.partial_json || '' } }] } }] };
                    }
                }
                return null;
            }
            case 'content_block_stop': currentToolId = null; searchedBlock = false; return null;
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
    if (NS.config.webSearch && !upstream.tools.some(t => t.name === 'web_search')) upstream.tools.push(SEARCH_TOOL);
    if (!upstream.tools.length) delete upstream.tools;

    if (converted.system) upstream.system = converted.system;
    ['temperature','top_p','thinking','reasoning_effort'].forEach(function(n){ if (original[n] != null) upstream[n] = original[n]; });
    
    var rInit = { method: 'POST', headers: { 'content-type':'application/json', 'authorization':'Bearer ' + key, 'x-api-key': key, 'anthropic-version':'2023-06-01' }, body: JSON.stringify(upstream), signal: opts.signal };
    
    return NS.origFetch('https://api.deepseek.com/anthropic/v1/messages', rInit).then(function(resp){
        updateStats('anthropic', original.model, 'https://api.deepseek.com/anthropic/v1/messages');
        if (useStream) { if (!resp.ok || !resp.body) return resp; return new Response(makeCoalescedStream(resp.body, makeAnthropicTranslate()), { status: 200, headers: { 'content-type':'text/event-stream; charset=utf-8' } }); }
        return resp; 
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

/* =========================================================
   4. UI TAB & INITIALIZATION
   ========================================================= */
function buildTab(){
    var expBtn = document.querySelector('.tab-btn[data-tab="exp"]'); if (expBtn) expBtn.remove();
    var expTab = document.getElementById('tab-exp'); if (expTab) expTab.remove();
    
    var swarmBtn = document.querySelector('.tab-btn[data-tab="swarm"]');
    var swarmTab = document.getElementById('tab-swarm');
    if (!swarmBtn || !swarmTab) return;
    
    swarmBtn.insertAdjacentHTML('afterend','<button class="tab-btn" data-tab="exp">Exp</button>');
    var html = '<div class="tab-content" id="tab-exp">' +
        '<div class="setting-row"><span>Agentic Network Bridge (v3.1)</span><span style="font-size:0.7rem;color:var(--text-secondary)">Active</span></div>' +
        '<div class="setting-row"><span>Anthropic Protocol</span><label class="toggle"><input type="checkbox" id="expAnthropic" checked><span class="slider"></span></label></div>' +
        '<div class="setting-row"><span>Streaming Translation</span><label class="toggle"><input type="checkbox" id="expBridgeStream" checked><span class="slider"></span></label></div>' +
        '<div class="setting-row"><span>Web Search (DeepSeek)</span><label class="toggle"><input type="checkbox" id="expWebSearch" checked><span class="slider"></span></label></div>' +
      '</div>';
    swarmTab.insertAdjacentHTML('afterend', html);
    
    document.querySelector('.tab-btn[data-tab="exp"]')._ = document.getElementById('tab-exp');
    
    ['expAnthropic', 'expBridgeStream', 'expWebSearch'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', e => {
            const map = { expAnthropic:'anthropic', expBridgeStream:'bridgeStream' };
            if (map[id]) NS.flags[map[id]] = e.target.checked ? 1 : 0;
            if (id === 'expWebSearch') { NS.config.webSearch = e.target.checked; saveConfig(); }
        });
    });
}

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
    
    buildTab();
    console.log('[eval1 v3.1] Systems Online: Anthropic Routing, Tool Sandbox, and Agentic Multi-Turn Loops are active.');
}
apply();
})();
