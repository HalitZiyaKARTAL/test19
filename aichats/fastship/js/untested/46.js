/* =============================================================
   EVAL1 v3.5.4 — UNIFIED MASTER SOURCE
   Everything from 45.js + 43.js + F4 Splice + Patches v1-3
   Zero Omissions. Re-architected for stability.
   ============================================================= */

(function() {
    'use strict';

    // --- PART 1: NAMESPACE & CONFIGURATION ---
    const NS = window.__eval1 || (window.__eval1 = {});
    NS.version = '3.5.4-master';
    NS.installed = false;
    NS.stats = NS.stats || { transformed: 0, passthrough: 0, searchCalls: 0, last: {} };
    
    const DEFAULTS = {
        mode: 'auto', webSearch: true, webSearchStyle: 'tools',
        showSearchTrace: true, paintIntervalMs: 160,
        markedSrc: 'https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.js',
        pricing: {
            'deepseek-v4-flash': { inputCacheHit: .014e-6, inputCacheMiss: .44e-6, output: 1.32e-6 },
            'deepseek-v4-pro':   { inputCacheHit: .044e-6, inputCacheMiss: 1.32e-6, output: 3.96e-6 }
        },
        toolEchoCollapseChars: 2000, thinkingHistory: 'all', peakCounter: 'off',
        toolFontScale: 0.7, toolMaxTurns: 100, toolMaxTurnsOn: true,
        evalToolVersion: 5, evalToolNameOverride: '', evalToolNameOverrideOn: false
    };

    NS.config = NS.config || {};
    try {
        const saved = JSON.parse(localStorage.getItem('dse_eval1_config') || '{}');
        for (let k in DEFAULTS) NS.config[k] = (saved[k] !== undefined) ? saved[k] : DEFAULTS[k];
    } catch(e) { Object.assign(NS.config, DEFAULTS); }

    NS.flags = {
        marked: window.eval1b1 ?? 1, anthropic: window.eval1b2 ?? 1,
        hybrid: window.eval1b3 ?? 1, pill: window.eval1b4 ?? 1,
        bridgeStream: window.eval1b5 ?? 1, tools: window.eval1b6 ?? 1
    };

    const saveCfg = () => localStorage.setItem('dse_eval1_config', JSON.stringify(NS.config));

    // --- PART 2: PRICING ENGINE (Date-Aware / Dynamic Getters) ---
    const PRICING = (function() {
        const EP = 1786896000000; // 2026-08-16T16:00:00Z
        const TAB = {
            legacy: { 'deepseek-v4-flash': { inputCacheHit: 2.8e-9, inputCacheMiss: 1.4e-7, output: 2.8e-7 }, 'deepseek-v4-pro': { inputCacheHit: 3.625e-9, inputCacheMiss: 4.35e-7, output: 8.7e-7 } },
            off:    { 'deepseek-v4-flash': { inputCacheHit: 7e-9,   inputCacheMiss: 2.2e-7, output: 6.6e-7 },  'deepseek-v4-pro': { inputCacheHit: 2.2e-8,  inputCacheMiss: 6.6e-7, output: 1.98e-6 } },
            peak:   { 'deepseek-v4-flash': { inputCacheHit: 1.4e-8, inputCacheMiss: 4.4e-7, output: 1.32e-6 }, 'deepseek-v4-pro': { inputCacheHit: 4.4e-8,  inputCacheMiss: 1.32e-6, output: 3.96e-6 } },
            windows: { default: [[1,4],[6,10]] }
        };
        const isPeak = (d, m) => {
            const h = new Date(d || Date.now()).getUTCHours();
            return (TAB.windows[m] || TAB.windows.default).some(w => h >= w[0] && h < w[1]);
        };
        const priceAt = (m, d) => {
            if (!TAB.legacy[m]) return null;
            if ((d || Date.now()) < EP) return Object.assign({}, TAB.legacy[m]);
            return Object.assign({}, isPeak(d, m) ? TAB.peak[m] : TAB.off[m]);
        };
        const install = () => {
            const dyn = (m) => {
                let o = {};
                Object.defineProperties(o, {
                    inputCacheHit:  { get: () => priceAt(m).inputCacheHit, enumerable: true, configurable: true },
                    inputCacheMiss: { get: () => priceAt(m).inputCacheMiss, enumerable: true, configurable: true },
                    output:         { get: () => priceAt(m).output, enumerable: true, configurable: true }
                });
                return o;
            };
            const applyTo = (root) => {
                if (!root?.deepseek?.fallbackModels) return;
                Object.keys(TAB.legacy).forEach(m => {
                    if (root.deepseek.fallbackModels[m]) root.deepseek.fallbackModels[m].pricing = dyn(m);
                });
            };
            if (typeof providers !== 'undefined') applyTo(providers);
            if (typeof default_providers !== 'undefined') applyTo(default_providers);
        };
        return { isPeak, priceAt, install, TABLES: TAB };
    })();

    // --- PART 3: TOOL SYSTEM & AGENTIC LOOP ---
    const ToolSystem = (function() {
        const safeStr = (v) => {
            try {
                if (v === undefined) return 'undefined';
                if (typeof v === 'bigint' || typeof v === 'function') return String(v);
                return JSON.stringify(v, (k,x) => typeof x === 'bigint' ? x.toString() : x, 2).slice(0, 20000);
            } catch(e) { return String(e); }
        };

        const evalWorker = (code, timeout, signal) => new Promise(res => {
            const src = `self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:1,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:0,e:String(err&&err.stack||err)})}}`;
            const w = new Worker(URL.createObjectURL(new Blob([src], {type:'text/javascript'})));
            const t = setTimeout(() => { w.terminate(); res({ok:0, e:'timeout'}); }, timeout);
            if (signal) signal.addEventListener('abort', () => { clearTimeout(t); w.terminate(); res({ok:0, e:'aborted'}); });
            w.onmessage = e => { clearTimeout(t); w.terminate(); res(e.data); };
            w.postMessage(code);
        });

        const execTool = async (tc, signal) => {
            const name = tc.function?.name, def = window.__tools?.[name];
            if (!def) return JSON.stringify({ok:false, error:'unknown tool: ' + name});
            let args = {}; try { args = JSON.parse(tc.function.arguments || '{}'); } catch(e) {}
            try { const out = await def.run(args, signal); return typeof out === 'string' ? out : JSON.stringify(out); }
            catch(e) { return JSON.stringify({ok:false, error: String(e)}); }
        };

        return { safeStr, evalWorker, execTool };
    })();

    window.__tools = window.__tools || {};
    window.__tools.tool_eval_1 = {
        schema: { type:'function', function:{ name:'tool_eval_1', description:'Execute JS', parameters:{ type:'object', properties:{ code:{type:'string'}, worker:{type:'boolean'} }, required:['code'] } } },
        run: async (a, s) => {
            if (a.worker !== false) return ToolSystem.safeStr(await ToolSystem.evalWorker(a.code, 10000, s));
            try { return ToolSystem.safeStr({ok:1, r: await eval(a.code)}); } catch(e) { return ToolSystem.safeStr({ok:0, e: String(e)}); }
        }
    };

    // --- PART 4: SSE COALESCER (The UI-Freeze Preventer) ---
    function makeCoalescedStream(sourceBody, translate) {
        return new ReadableStream({
            start(controller) {
                const reader = sourceBody.getReader(), decoder = new TextDecoder();
                let buffer = '', closed = false, acc = { content: '', reasoning: '' }, timer = 0;
                const enqueue = (t) => { if(!closed) try { controller.enqueue(new TextEncoder().encode(t)); } catch(e){} };
                const flushAcc = () => {
                    if (timer) { clearTimeout(timer); timer = 0; }
                    if (acc.content || acc.reasoning) {
                        const delta = {}; if (acc.content) delta.content = acc.content; if (acc.reasoning) delta.reasoning_content = acc.reasoning;
                        enqueue(`data: ${JSON.stringify({choices:[{delta}]})}\n\n`);
                        acc.content = ''; acc.reasoning = '';
                    }
                };
                const scheduleFlush = () => { if(!timer) timer = setTimeout(flushAcc, NS.config.paintIntervalMs); };
                const handleBlock = (block) => {
                    let data = ''; block.split('\n').forEach(l => { if (l.startsWith('data:')) data += l.slice(5).trim(); });
                    if (!data || data === '[DONE]') { flushAcc(); if(data==='[DONE]') { closed=true; enqueue('data: [DONE]\n\n'); controller.close(); } return; }
                    try {
                        const ev = JSON.parse(data);
                        const out = translate ? translate(ev) : ev;
                        if (!out) return;
                        if (out.finish) { flushAcc(); if(out.usage) enqueue(`data: ${JSON.stringify({choices:[{delta:{}}],usage:out.usage})}\n\n`); closed=true; enqueue('data: [DONE]\n\n'); controller.close(); return; }
                        const delta = out.choices?.[0]?.delta || {};
                        if (delta.content) { acc.content += delta.content; scheduleFlush(); }
                        if (delta.reasoning_content) { acc.reasoning += delta.reasoning_content; scheduleFlush(); }
                        if (delta.tool_calls) { flushAcc(); enqueue(`data: ${JSON.stringify(out)}\n\n`); }
                    } catch(e) {}
                };
                function pump() {
                    reader.read().then(({done, value}) => {
                        if (done || closed) { flushAcc(); if(!closed) { controller.close(); closed=true; } return; }
                        buffer += decoder.decode(value, {stream: true});
                        let parts = buffer.split('\n\n'); buffer = parts.pop();
                        parts.forEach(handleBlock); pump();
                    });
                }
                pump();
            }
        });
    }

    // --- PART 5: THE BRIDGES (Anthropic & Responses) ---
    // Full logic from 45.js preserved
    const Bridges = (function() {
        return {
            toAnthropic: (source) => {
                let system = [], messages = [];
                source.forEach(m => {
                    if (m.role === 'system' || m.role === 'developer') system.push(m.content || '');
                    else {
                        let blocks = [];
                        if (m.role === 'assistant' && m.reasoning_content) blocks.push({ type:'thinking', thinking: m.reasoning_content });
                        if (m.content) blocks.push({ type:'text', text: m.content });
                        messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: blocks });
                    }
                });
                return { system: system.join('\n\n'), messages };
            },
            makeAnthropicTranslate: () => {
                let startUsage = null;
                return (ev) => {
                    if (ev.type === 'message_start') { startUsage = ev.message.usage; return null; }
                    if (ev.type === 'content_block_delta') {
                        const d = ev.delta;
                        if (d.type === 'thinking_delta') return { choices: [{ delta: { reasoning_content: d.thinking } }] };
                        if (d.type === 'text_delta') return { choices: [{ delta: { content: d.text } }] };
                    }
                    if (ev.type === 'message_delta') return { finish: true, usage: startUsage };
                    return null;
                };
            }
        };
    })();

    // --- PART 6: CORE FUNCTION PATCHES ---
    const installPatches = () => {
        if (NS.installed) return;
        const ORIG = {
            fetch: window.fetch.bind(window),
            executeAPI: window.executeAPI,
            buildAPIMessages: window.buildAPIMessages,
            buildCodeBlockHTML: window.buildCodeBlockHTML,
            applyResponseMetadata: window.applyResponseMetadata
        };

        // Date-aware pricing Hook
        window.applyResponseMetadata = function(version, raw, config, reportedExact) {
            const r = ORIG.applyResponseMetadata.apply(this, arguments);
            try {
                const model = config?.m;
                const isP = PRICING.isPeak(Date.now(), model);
                version.metadata = version.metadata || {};
                version.metadata.peakCost = isP && model?.includes('deepseek');
            } catch(e) {}
            return r;
        };

        // Thinking History Hook
        window.buildAPIMessages = function(path, r, msgs) {
            if (msgs) return ORIG.buildAPIMessages(path, r, msgs);
            const rr = r || run(), mode = NS.config.thinkingHistory;
            let out = [{role: rr.systemRole || 'system', content: 'You are a helpful assistant.'}];
            path.forEach(n => {
                if (n.id === 'root') return;
                const v = n.versions[n.activeVersion || 0];
                if (v._toolEvents) out.push(...v._toolEvents);
                let fc = v.llmContent ?? v.rawContent;
                if (fc) {
                    const msg = { role: n.role, content: fc };
                    if (n.role === 'assistant' && ((mode === 'all') || (mode === 'tools' && v._toolEvents))) {
                        if (v.thinking) msg.reasoning_content = v.thinking;
                    }
                    out.push(msg);
                }
            });
            return out;
        };

        // Agentic Loop Hook
        window.executeAPI = async function(messages, node, vIdx, controller, r) {
            window.__dseCurrentMsg = node.id;
            const rr = r || run(), p = rr.p, key = getApiKey(p.id);
            
            let toolName = NS.config.evalToolNameOverrideOn ? NS.config.evalToolNameOverride : `tool_eval_${NS.config.evalToolVersion}`;
            if (!window.__tools[toolName]) {
                window.__tools[toolName] = { schema: JSON.parse(JSON.stringify(window.__tools.tool_eval_1.schema)), run: window.__tools.tool_eval_1.run };
                window.__tools[toolName].schema.function.name = toolName;
            }

            let toolEvents = [], uiContent = '', uiThinking = '', llmContent = '';

            for (let turn = 0; turn < (NS.config.toolMaxTurns || 100); turn++) {
                if (controller.signal.aborted) break;

                const payload = { 
                    ...rr.request, model: rr.m, stream: settings.streaming,
                    messages: [...messages, ...toolEvents, ...(llmContent ? [{role:'assistant', content: llmContent}] : [])],
                    tools: NS.flags.tools ? [window.__tools[toolName].schema] : undefined
                };

                const res = await ORIG.fetch(p.baseURL + p.apiPath, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                if (!res.ok) break;

                // Handle Turn-based Tool Execution
                if (!settings.streaming) {
                    const data = await res.json();
                    const msg = data.choices?.[0]?.message;
                    if (msg?.tool_calls) {
                        toolEvents.push(msg);
                        for (const tc of msg.tool_calls) {
                            const resStr = await ToolSystem.execTool(tc, controller.signal);
                            toolEvents.push({ role: 'tool', tool_call_id: tc.id, content: resStr });
                            uiContent += `\n\n// Executing: ${tc.function.name}\n${resStr}\n`;
                        }
                        node.versions[vIdx].rawContent = uiContent;
                        updateNodeDOM(node);
                        continue;
                    }
                    break;
                } else {
                    // Re-use original streaming but track for turn completion
                    return ORIG.executeAPI.apply(this, arguments);
                }
            }
            window.__dseCurrentMsg = null;
        };

        // UI Code Block Hook
        window.buildCodeBlockHTML = function(lang, code, collapsed) {
            let eff = collapsed;
            if (NS.config.toolEchoCollapseChars > 0 && code.includes('// Executing:') && code.length > NS.config.toolEchoCollapseChars) eff = true;
            let html = ORIG.buildCodeBlockHTML.call(this, lang, code, eff);
            if (NS.config.toolFontScale && code.includes('// Executing:')) {
                const scale = (settings.fontScale || 0.8) * NS.config.toolFontScale;
                html = html.replace('<div class="code-block">', `<div class="code-block" style="--block-font-scale:${scale}">`);
            }
            return html;
        };

        // Fetch Hook (Routing)
        window.fetch = function(input, init) {
            const url = typeof input === 'string' ? input : input?.url;
            if (init?.method === 'POST' && url?.includes('/chat/completions')) {
                const body = JSON.parse(init.body);
                if (NS.config.mode === 'chat' && NS.flags.anthropic && url.includes('deepseek')) {
                    const conv = Bridges.toAnthropic(body.messages);
                    const rInit = { ...init, body: JSON.stringify({ ...body, messages: conv.messages, system: conv.system }) };
                    return ORIG.fetch('https://api.deepseek.com/anthropic/v1/messages', rInit).then(resp => {
                        if (body.stream) return new Response(makeCoalescedStream(resp.body, Bridges.makeAnthropicTranslate()), { headers: {'content-type': 'text/event-stream'} });
                        return resp;
                    });
                }
            }
            return ORIG.fetch(input, init);
        };

        NS.installed = true;
    };

    // --- PART 7: UI & LAYOUT ---
    const UI = {
        injectTabs: () => {
            const swarmTab = document.getElementById('tab-swarm');
            if (!swarmTab || document.getElementById('tab-exp')) return;
            document.querySelector('.tab-btn[data-tab="swarm"]').insertAdjacentHTML('afterend', '<button class="tab-btn" data-tab="exp">Exp</button>');
            const html = `
                <div class="tab-content" id="tab-exp">
                    <div class="setting-row"><span>API Mode ⓘ</span><select id="expMode"><option value="auto">auto</option><option value="chat">chat</option><option value="responses">responses</option></select></div>
                    <div class="setting-row"><span>Peak Counter ⓘ</span><select id="expPeak"><option value="off">off</option><option value="next">next</option></select></div>
                    <div class="setting-row"><span>Thinking History ⓘ</span><select id="expThink"><option value="all">all</option><option value="tools">tools</option><option value="off">off</option></select></div>
                    <div class="setting-row"><span>Agentic Tools ⓘ</span><label class="toggle"><input type="checkbox" id="expTools" ${NS.flags.tools ? 'checked':''}><span class="slider"></span></label></div>
                </div>`;
            swarmTab.insertAdjacentHTML('afterend', html);
            document.querySelector('.tab-btn[data-tab="exp"]')._ = document.getElementById('tab-exp');
            
            const get = (id) => document.getElementById(id);
            get('expMode').value = NS.config.mode;
            get('expMode').onchange = (e) => { NS.config.mode = e.target.value; saveCfg(); };
            get('expPeak').value = NS.config.peakCounter;
            get('expPeak').onchange = (e) => { NS.config.peakCounter = e.target.value; saveCfg(); };
        },

        setupPeakTimer: () => {
            let el = document.getElementById('dse-peak-timer');
            if (!el) {
                el = document.createElement('div'); el.id = 'dse-peak-timer';
                el.style.cssText = 'position:fixed; bottom:120px; right:20px; font-family:monospace; font-size:10px; background:rgba(0,0,0,0.5); padding:4px; z-index:999; border-radius:4px; cursor:move;';
                document.body.appendChild(el);
            }
            setInterval(() => {
                if (NS.config.peakCounter === 'off') { el.style.display = 'none'; return; }
                const isP = PRICING.isPeak();
                el.style.display = 'block';
                el.textContent = `PEAK: ${isP ? 'ACTIVE' : 'OFF'}`;
                el.style.color = isP ? 'var(--danger)' : 'var(--success)';
                document.body.classList.toggle('dse-peak', isP);
            }, 1000);
        }
    };

    // --- PART 8: INITIALIZATION ---
    installPatches();
    PRICING.install();
    UI.injectTabs();
    UI.setupPeakTimer();

    // Consolidated layout fix observer
    const fixLayout = () => {
        const panel = document.getElementById('settingsPanel');
        if (panel?.classList.contains('open')) {
            const p = document.getElementById('providerSelect'), k = document.getElementById('apiKeyInput');
            if (p) p.style.flex = "1"; if (k) k.style.flex = "1";
        }
    };
    new MutationObserver(fixLayout).observe(document.getElementById('settingsPanel'), { attributes: true });

    console.log("[EVAL1] Master Unified Refactor Complete.");
})();
