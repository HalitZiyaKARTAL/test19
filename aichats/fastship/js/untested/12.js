/* ============================================================
   EVAL1 v3.1 — AI Chat app upgrade, written as one module
   ------------------------------------------------------------
   Paste into Settings → Other → Eval console → open console → Run.
   Idempotent; re-paste after reload. Disable: __eval1.disable().

   v3.1 fixes:
     - /responses function tools now use Responses format
       ({type,name,description,parameters}) — fixes HTTP 400
       "missing field name" when tool_eval_1 is enabled
     - Exp tab no longer throws "log is not defined" (scope fix)

   Flags (before paste or via Exp tab / __eval1.setFlag):
     eval1b1 marked · eval1b2 anthropic bridge · eval1b3 responses
     eval1b4 status pill · eval1b5 streaming bridge · eval1b6 tool_eval_1
     eval1b7 deepseek peak pricing
   ============================================================ */
var eval1b1 = window.eval1b1 ?? 1;
var eval1b2 = window.eval1b2 ?? 1;
var eval1b3 = window.eval1b3 ?? 1;
var eval1b4 = window.eval1b4 ?? 1;
var eval1b5 = window.eval1b5 ?? 1;
var eval1b6 = window.eval1b6 ?? 1;
var eval1b7 = window.eval1b7 ?? 1;

(function(){
'use strict';

/* ============================ state ============================ */
const NS = window.__eval1 || (window.__eval1 = {});
if (!NS.flags)  NS.flags  = {};
if (!NS.stats)  NS.stats  = { transformed:0, passthrough:0, searchCalls:0, toolCalls:0, last:{} };

const FLAG_NAMES = ['marked','anthropic','hybrid','pill','bridgeStream','toolEval','pricing'];
const FLAG_VARS  = [eval1b1, eval1b2, eval1b3, eval1b4, eval1b5, eval1b6, eval1b7];
FLAG_NAMES.forEach((k,i) => NS.flags[k] = FLAG_VARS[i] ? 1 : 0);

if (!NS.origFetch){
  try { window.__hybridUpgrade?.disable?.(); } catch(e){}
  try { window.DeepSeekWebSearch?.restore?.(); } catch(e){}
  NS.origFetch        = (window.fetch || fetch).bind(window);
  NS.origExecuteAPI   = typeof executeAPI === 'function' ? executeAPI : null;
  NS.origARM          = typeof applyResponseMetadata === 'function' ? applyResponseMetadata : null;
  NS.origFormatMarkdown = typeof formatMarkdown === 'function' ? formatMarkdown : null;
  NS.config = { mode:'auto', webSearch:true, webSearchStyle:'tools', showSearchTrace:true,
                paintIntervalMs:160, markedSrc:'https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.js' };
  try { Object.assign(NS.config, JSON.parse(localStorage.getItem('dse_eval1_config') || '{}')); } catch(e){}
}
NS.version = '3.1';

const save = () => { try { localStorage.setItem('dse_eval1_config', JSON.stringify(NS.config)); } catch(e){} };
const log  = (...a) => { try { console.log('[eval1]', ...a); } catch(e){} };
const warn = (...a) => { try { console.warn('[eval1]', ...a); } catch(e){} };
const $    = id => document.getElementById(id);
const esc  = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const enc  = new TextEncoder();

/* ============================ sse engine ============================ */
/* one reader: parses SSE blocks, yields JSON events */
function readSSE(body, onEvent){
  return new Promise((resolve, reject) => {
    const reader = body.getReader(), dec = new TextDecoder();
    let buf = '';
    (function pump(){
      reader.read().then(res => {
        if (res.done) return resolve();
        buf += dec.decode(res.value, { stream:true });
        let m;
        while ((m = buf.search(/\n\n|\r\n\r\n/)) !== -1){
          const sep = buf[m] === '\r' ? 4 : 2;
          const block = buf.slice(0, m); buf = buf.slice(m + sep);
          let data = '';
          block.split(/\r?\n/).forEach(l => { if (l.startsWith('data:')) data += (data?'\n':'') + l.slice(5).trim(); });
          if (data && data !== '[DONE]'){ try { onEvent(JSON.parse(data)); } catch(e){} }
        }
        pump();
      }).catch(reject);
    })();
  });
}

/* one coalescer: batches deltas → chat chunks (kills quadratic reparse) */
class Coalescer {
  constructor(controller){ this.c = controller; this.iv = NS.config.paintIntervalMs; this.acc = { content:'', reasoning:'', toolCalls:null }; this.timer = 0; }
  enq(s){ try { this.c.enqueue(enc.encode(s)); } catch(e){} }
  add(d){
    if (d.content) this.acc.content += d.content;
    if (d.reasoning_content) this.acc.reasoning += d.reasoning_content;
    const tc = d.tool_calls;
    if (tc?.length){
      this.acc.toolCalls = this.acc.toolCalls || [];
      tc.forEach(dtc => {
        const i = dtc.index ?? this.acc.toolCalls.length;
        let a = this.acc.toolCalls[i] || (this.acc.toolCalls[i] = { id:'', type:'function', function:{ name:'', arguments:'' } });
        if (dtc.id) a.id += dtc.id;
        if (dtc.function){ if (dtc.function.name) a.function.name += dtc.function.name; if (dtc.function.arguments) a.function.arguments += dtc.function.arguments; }
      });
    }
    if (d.content || d.reasoning_content || tc?.length) this.schedule();
  }
  schedule(){ if (this.timer) return; this.timer = setTimeout(() => { this.timer = 0; this.flush(); }, this.iv); }
  flush(){
    if (this.timer){ clearTimeout(this.timer); this.timer = 0; }
    const { content, reasoning, toolCalls } = this.acc;
    if (!content && !reasoning && !toolCalls) return;
    const delta = {};
    if (content) delta.content = content;
    if (reasoning) delta.reasoning_content = reasoning;
    if (toolCalls) delta.tool_calls = toolCalls;
    this.enq('data: ' + JSON.stringify({ choices:[{ delta }] }) + '\n\n');
    this.acc = { content:'', reasoning:'', toolCalls:null };
  }
  usage(u){ this.flush(); this.enq('data: ' + JSON.stringify({ choices:[{ delta:{} }], usage:u }) + '\n\n'); }
  end(){ this.flush(); this.enq('data: [DONE]\n\n'); try { this.c.close(); } catch(e){} }
  error(e){ this.flush(); try { this.c.error(e); } catch(_){} }
}

/* one stream builder: SSE body + event translator → coalesced chat stream */
function chatStream(body, translate){
  return new ReadableStream({ start(controller){
    const co = new Coalescer(controller);
    readSSE(body, ev => {
      let out;
      try { out = translate(ev); } catch(e){ out = { error:e }; }
      if (!out) return;
      if (out.error){ co.error(out.error); return; }
      if (out.done){ if (out.usage) co.usage(out.usage); co.end(); return; }
      if (out.delta) co.add(out.delta);
    }).then(() => co.end()).catch(e => co.error(e));
  }});
}

/* ============================ helpers ============================ */
function cloneHeaders(h){
  if (!h) return {};
  if (h instanceof Headers){ const o = {}; h.forEach((v,k) => o[k] = v); return o; }
  return { ...h };
}
function mapUsage(u){
  if (!u || typeof u !== 'object') return undefined;
  const o = {};
  if (typeof u.input_tokens === 'number') o.prompt_tokens = u.input_tokens;
  if (typeof u.output_tokens === 'number') o.completion_tokens = u.output_tokens;
  if (typeof u.total_tokens === 'number') o.total_tokens = u.total_tokens;
  if (u.input_tokens_details?.cached_tokens != null) o.prompt_tokens_details = { cached_tokens: u.input_tokens_details.cached_tokens };
  if (u.output_tokens_details?.reasoning_tokens != null) o.completion_tokens_details = { reasoning_tokens: u.output_tokens_details.reasoning_tokens };
  return Object.keys(o).length ? o : undefined;
}
function updateStats(mode, model, url){ NS.stats.last = { mode, model, url, ts: Date.now() }; }

/* ============================ routing ============================ */
const PROFILES = {
  'deepseek-v4-pro':   { host:'api.deepseek.com', search:true },
  'deepseek-v4-flash': { host:'api.deepseek.com', search:true },
  'gpt-5.6-sol':       { host:'api.openai.com',  search:true },
  'gpt-5.6-terra':     { host:'api.openai.com',  search:true },
  'gpt-5.6-luna':      { host:'api.openai.com',  search:true }
};
function route(url, payload){
  if (!payload || typeof payload !== 'object' || !/\/chat\/completions/.test(url)) return null;
  const hasFn = (payload.tools || []).some(t => t?.type === 'function');
  if (NS.flags.hybrid && NS.config.mode !== 'chat'){
    const plan = PROFILES[payload.model];
    if (plan && url.includes(plan.host)) return { kind:'responses', plan };
  }
  if (NS.flags.anthropic && NS.config.mode !== 'responses' && !hasFn && url.includes('api.deepseek.com'))
    return { kind:'anthropic' };
  if (payload.stream && Array.isArray(payload.messages)) return { kind:'coalesce' };
  return null;
}

/* ============================ responses adapter ============================ */
const responses = {
  build(payload, plan){
    const input = [], sys = [];
    (payload.messages || []).forEach(m => {
      if (!m) return;
      if (m.role === 'system' || m.role === 'developer'){ sys.push(String(m.content || '')); return; }
      if (m.role === 'assistant' && m.tool_calls?.length){
        input.push({ type:'message', role:'assistant', content: m.content ? [{ type:'output_text', text:String(m.content) }] : [] });
        m.tool_calls.forEach(tc => tc?.id && input.push({ type:'function_call', call_id:tc.id, name:tc.function?.name || '', arguments:tc.function?.arguments || '{}' }));
        return;
      }
      if (m.role === 'tool'){ input.push({ type:'function_call_output', call_id:m.tool_call_id || '', output:String(m.content ?? '') }); return; }
      if (m.role === 'user' || m.role === 'assistant') input.push({ type:'message', role:m.role, content:[{ type:'input_text', text:String(m.content || '') }] });
    });
    if (!input.length) return null;
    const req = { model:payload.model, input, stream:!!payload.stream };
    if (sys.length) req.instructions = sys.join('\n\n');
    const max = payload.max_tokens ?? payload.max_completion_tokens;
    if (max) req.max_output_tokens = max;
    if (typeof payload.temperature === 'number' && !plan.host.includes('deepseek')) req.temperature = payload.temperature;
    /* v3.1 FIX: Chat function tool -> Responses function tool (name at top level) */
    const tools = (payload.tools || [])
      .filter(t => t?.type === 'function' && t.function?.name)
      .map(t => ({ type:'function', name:t.function.name, description:t.function.description, parameters:t.function.parameters, strict:t.function.strict }));
    if (NS.config.webSearch && plan.search && !tools.some(t => t?.type === 'web_search'))
      NS.config.webSearchStyle === 'tool' ? (req.tool = 'web_search') : tools.push({ type:'web_search' });
    if (tools.length) req.tools = tools;
    return req;
  },
  translator(){
    const calls = []; let current = null;
    return function(ev){
      switch (ev?.type){
        case 'response.created': if (ev.response?.id) NS.stats.last.id = ev.response.id; return null;
        case 'response.output_text.delta': return { delta:{ content: ev.delta || '' } };
        case 'response.reasoning_text.delta': return { delta:{ reasoning_content: ev.delta || '' } };
        case 'response.output_item.added': {
          const it = ev.item || {};
          if (it.type === 'function_call') current = { id:it.id || '', name:it.name || '', arguments:'' };
          else if (it.type === 'web_search_call'){
            NS.stats.searchCalls++;
            if (NS.config.showSearchTrace){
              const q = it.action?.search_query || it.action?.query || 'web search';
              return { delta:{ reasoning_content:'[web_search] ' + q } };
            }
          }
          return null;
        }
        case 'response.function_call_arguments.delta': if (current) current.arguments += ev.delta || ''; return null;
        case 'response.output_item.done': {
          const it = ev.item || {};
          if (it.type === 'function_call' || (current && it.id && it.id === current.id)){ if (current){ calls.push(current); current = null; } }
          return null;
        }
        case 'response.completed':
        case 'response.incomplete': return { done:true, usage: mapUsage(ev.response?.usage) };
        case 'response.failed': return { error: Error(ev.response?.error?.message || 'Responses request failed.') };
        default: return null;
      }
    };
  },
  toChat(data, plan){
    let content = '', reasoning = '';
    (data.output || []).forEach(it => {
      if (it?.type === 'message') (it.content || []).forEach(c => { if (c?.type === 'output_text') content += c.text || ''; });
      else if (it?.type === 'reasoning'){
        (it.summary || []).forEach(s => { if (s?.type === 'summary_text') reasoning += s.text || ''; });
        if (!reasoning && it.encrypted_content) reasoning = '[encrypted reasoning]';
      } else if (it?.type === 'web_search_call'){
        NS.stats.searchCalls++;
        const q = it.action?.search_query || it.action?.query;
        if (NS.config.showSearchTrace && q) reasoning += (reasoning ? '\n' : '') + '[web_search] ' + q;
      }
    });
    return {
      id:data.id, object:'chat.completion', created:Math.floor(Date.now()/1000), model:data.model || plan.model,
      choices:[{ index:0, message:{ role:'assistant', content, reasoning_content:reasoning },
        finish_reason:data.status === 'failed' ? 'error' : data.status === 'incomplete' ? 'length' : 'stop' }],
      usage:mapUsage(data.usage)
    };
  },
  async handle(payload, plan, url, opts){
    const req = this.build(payload, plan);
    if (!req) return null;
    const rUrl = url.replace(/\/chat\/completions(\?|$)/, '') + '/responses';
    const headers = { ...cloneHeaders(opts.headers), 'Content-Type':'application/json' };
    req._url = rUrl; req._headers = headers;
    log('→', payload.model, '→ responses', { tools:(req.tools || []).map(t => t.type), stream:req.stream });
    const upstream = await NS.origFetch(rUrl, { ...opts, headers, body:JSON.stringify(req) });
    NS.stats.transformed++; updateStats('responses', payload.model, rUrl); pill();
    if (!upstream.ok){
      const text = await upstream.text();
      let msg = 'HTTP ' + upstream.status;
      try { const j = JSON.parse(text); if (j.error?.message) msg += ': ' + j.error.message; } catch(e){}
      return new Response(JSON.stringify({ error:{ message:msg } }), { status:upstream.status, headers:{ 'Content-Type':'application/json' } });
    }
    const hasFn = (payload.tools || []).some(t => t?.type === 'function');
    if (hasFn && payload.stream && upstream.body)
      return new Response(this.toolStream(upstream.body, req, plan, opts.signal), { status:200, headers:{ 'Content-Type':'text/event-stream' } });
    if (hasFn)
      return this.toolFinal(upstream, req, plan, rUrl, opts.signal);
    if (payload.stream && upstream.body)
      return new Response(chatStream(upstream.body, this.translator()), { status:200, headers:{ 'Content-Type':'text/event-stream' } });
    const data = await upstream.json();
    if (data.status === 'failed')
      return new Response(JSON.stringify({ error:{ message:data.error?.message || 'Responses request failed.' } }), { status:400, headers:{ 'Content-Type':'application/json' } });
    return new Response(JSON.stringify(this.toChat(data, plan)), { status:200, headers:{ 'Content-Type':'application/json' } });
  },
  toolStream(firstBody, req, plan, signal){
    return new ReadableStream({ async start(controller){
      const co = new Coalescer(controller);
      const tr = this.translator();
      let usage = null;
      try {
        await readSSE(firstBody, ev => {
          const o = tr(ev); if (!o) return;
          if (o.error) throw o.error;
          if (o.done){ usage = o.usage || usage; return; }
          if (o.delta) co.add(o.delta);
        });
        co.flush();
        let calls = tr.calls, turns = 0;
        while (calls.length && turns < 6){
          turns++;
          const input = req.input.concat(calls.map(c => ({ type:'function_call', call_id:c.id, name:c.name, arguments:c.arguments || '{}' })));
          for (const c of calls) input.push({ type:'function_call_output', call_id:c.id, output: await execTool({ id:c.id, function:{ name:c.name, arguments:c.arguments || '{}' } }) });
          NS.stats.toolCalls += calls.length; pill();
          const res = await NS.origFetch(req._url, { method:'POST', headers:req._headers, body:JSON.stringify({ ...req, input, stream:false }), signal });
          const data = await res.json();
          if (data.status === 'failed') throw Error(data.error?.message || 'Responses request failed.');
          const fin = this.toChat(data, plan), m = fin.choices[0]?.message;
          if (m?.content) co.add({ content:m.content });
          if (m?.reasoning_content) co.add({ reasoning_content:m.reasoning_content });
          usage = fin.usage || usage;
          calls = (data.output || []).filter(it => it?.type === 'function_call').map(it => ({ id:it.id, name:it.name, arguments:it.arguments || '{}' }));
        }
        co.flush(); if (usage) co.usage(usage); co.end();
      } catch(e){ co.error(e); }
    }});
  },
  async toolFinal(upstream, req, plan, rUrl, signal){
    let data = await upstream.json();
    for (let turn = 0; turn <= 10; turn++){
      if (data.status === 'failed')
        return new Response(JSON.stringify({ error:{ message:data.error?.message || 'Responses request failed.' } }), { status:400, headers:{ 'Content-Type':'application/json' } });
      const calls = (data.output || []).filter(it => it?.type === 'function_call');
      if (!calls.length) return new Response(JSON.stringify(this.toChat(data, plan)), { status:200, headers:{ 'Content-Type':'application/json' } });
      if (turn >= 10) break;
      const input = req.input.concat(calls.map(c => ({ type:'function_call', call_id:c.id, name:c.name, arguments:c.arguments || '{}' })));
      for (const c of calls) input.push({ type:'function_call_output', call_id:c.id, output: await execTool({ id:c.id, function:{ name:c.name, arguments:c.arguments || '{}' } }) });
      NS.stats.toolCalls += calls.length; pill();
      const res = await NS.origFetch(rUrl, { method:'POST', headers:req._headers, body:JSON.stringify({ ...req, input, stream:false }), signal });
      data = await res.json();
    }
    return new Response(JSON.stringify(this.toChat(data, plan)), { status:200, headers:{ 'Content-Type':'application/json' } });
  }
};

/* ============================ anthropic adapter ============================ */
const ANTHRO_URL = 'https://api.deepseek.com/anthropic/v1/messages';
const ANTHRO_TOOL = { type:'web_search_20250305', name:'web_search', max_uses:3 };
function textOf(c){
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return c == null ? '' : String(c);
  return c.map(p => typeof p === 'string' ? p : (p?.text || '')).filter(Boolean).join('\n');
}
function anthroUsage(start, delta){
  const hit = +start?.cache_read_input_tokens || 0, cre = +start?.cache_creation_input_tokens || 0;
  const unc = +start?.input_tokens || 0, out = +delta?.output_tokens || 0, prompt = unc + hit + cre;
  return { prompt_tokens:prompt, completion_tokens:out, total_tokens:prompt + out,
    prompt_cache_hit_tokens:hit, prompt_cache_miss_tokens:unc + cre, prompt_tokens_details:{ cached_tokens:hit } };
}
function toAnswer(data){
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const hit = +data?.usage?.cache_read_input_tokens || 0, cre = +data?.usage?.cache_creation_input_tokens || 0;
  const unc = +data?.usage?.input_tokens || 0, out = +data?.usage?.output_tokens || 0, prompt = unc + hit + cre;
  return {
    content: blocks.filter(x => x?.type === 'text').map(x => x.text || '').join(''),
    reasoning: blocks.filter(x => x?.type === 'thinking').map(x => x.thinking || x.text || '').join(''),
    usage:{ prompt_tokens:prompt, completion_tokens:out, total_tokens:prompt + out, prompt_cache_hit_tokens:hit, prompt_cache_miss_tokens:unc + cre, prompt_tokens_details:{ cached_tokens:hit } },
    stop: data?.stop_reason || 'stop',
    searched: blocks.some(x => (x?.type === 'tool_use' || x?.type === 'server_tool_use') && (x.name === 'web_search' || x.input?.type === 'web_search' || x.input?.name === 'web_search'))
  };
}
function openAIJson(ans, model){
  return { id:'chatcmpl-web-' + Date.now(), object:'chat.completion', created:Math.floor(Date.now()/1000), model,
    choices:[{ index:0, message:{ role:'assistant', content:ans.content, reasoning_content:ans.reasoning }, finish_reason:ans.stop === 'max_tokens' ? 'length' : 'stop' }], usage:ans.usage };
}
function openAIStream(ans, model){
  const frames = [], base = { id:'chatcmpl-web-' + Date.now(), object:'chat.completion.chunk', created:Math.floor(Date.now()/1000), model };
  const push = v => frames.push('data: ' + JSON.stringify(v) + '\n\n');
  push({ ...base, choices:[{ index:0, delta:{ role:'assistant' }, finish_reason:null }] });
  if (ans.reasoning) push({ ...base, choices:[{ index:0, delta:{ reasoning_content:ans.reasoning }, finish_reason:null }] });
  if (ans.content) push({ ...base, choices:[{ index:0, delta:{ content:ans.content }, finish_reason:null }] });
  push({ ...base, choices:[{ index:0, delta:{}, finish_reason:ans.stop === 'max_tokens' ? 'length' : 'stop' }], usage:ans.usage });
  frames.push('data: [DONE]\n\n');
  return new ReadableStream({ start(c){ frames.forEach(f => c.enqueue(enc.encode(f))); c.close(); } });
}
const anthropic = {
  translator(){
    let start = null, pending = false, counted = false;
    return function(ev){
      switch (ev?.type){
        case 'message_start': if (ev.message?.usage) start = ev.message.usage; return null;
        case 'content_block_start': {
          const cb = ev.content_block || {};
          if ((cb.type === 'tool_use' || cb.type === 'server_tool_use') && (cb.name === 'web_search' || cb.input?.type === 'web_search' || cb.input?.name === 'web_search')){
            if (!counted){ NS.stats.searchCalls++; counted = true; }
            pending = true;
          }
          return null;
        }
        case 'content_block_delta': {
          const d = ev.delta || {};
          if (d.type === 'thinking_delta') return { delta:{ reasoning_content:d.thinking || '' } };
          if (d.type === 'text_delta') return { delta:{ content:d.text || '' } };
          if (d.type === 'input_json_delta' && pending && NS.config.showSearchTrace){
            try { const j = JSON.parse(d.partial_json || '{}'); if (j.search_query){ pending = false; return { delta:{ reasoning_content:'[web_search] ' + j.search_query } }; } } catch(e){}
          }
          return null;
        }
        case 'message_delta': return { done:true, usage:anthroUsage(start, ev.usage) };
        case 'message_stop': return { done:true };
        default: return null;
      }
    };
  },
  async handle(payload, opts){
    const key = String(new Headers(opts.headers).get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!key) return null;
    const sys = [], msgs = [];
    (payload.messages || []).forEach(m => {
      const c = textOf(m?.content); if (!c) return;
      if (m.role === 'system' || m.role === 'developer'){ sys.push(c); return; }
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const prev = msgs[msgs.length - 1];
      if (prev?.role === role) prev.content += '\n\n' + c; else msgs.push({ role, content:c });
    });
    const useStream = !!(NS.flags.bridgeStream && payload.stream);
    const body = { model:payload.model, max_tokens:payload.max_tokens ?? payload.max_completion_tokens ?? 384000, messages:msgs, tools:[ANTHRO_TOOL], stream:useStream };
    if (sys.length) body.system = sys.join('\n\n');
    ['temperature','top_p','thinking','reasoning_effort'].forEach(k => { if (payload[k] != null) body[k] = payload[k]; });
    const resp = await NS.origFetch(ANTHRO_URL, { method:'POST', headers:{ 'content-type':'application/json', authorization:'Bearer ' + key, 'x-api-key':key, 'anthropic-version':'2023-06-01' }, body:JSON.stringify(body), signal:opts.signal });
    updateStats('anthropic', payload.model, ANTHRO_URL); pill();
    if (useStream){
      if (!resp.ok || !resp.body) return resp;
      return new Response(chatStream(resp.body, this.translator()), { status:200, headers:{ 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-cache' } });
    }
    const text = await resp.text();
    if (!resp.ok) return new Response(text, { status:resp.status, statusText:resp.statusText, headers:{ 'content-type':resp.headers.get('content-type') || 'application/json' } });
    const ans = toAnswer(JSON.parse(text));
    if (ans.searched) NS.stats.searchCalls++;
    pill();
    if (payload.stream) return new Response(openAIStream(ans, payload.model), { status:200, headers:{ 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-cache' } });
    return new Response(JSON.stringify(openAIJson(ans, payload.model)), { status:200, headers:{ 'content-type':'application/json; charset=utf-8' } });
  }
};

/* ============================ coalesce adapter ============================ */
function coalesce(payload, url, opts, input, init){
  NS.stats.passthrough++; updateStats('chat', payload.model, url); pill();
  return NS.origFetch(input, init).then(upstream => {
    if (!upstream.ok || !upstream.body) return upstream;
    return new Response(chatStream(upstream.body, ev => {
      const d = ev?.choices?.[0]?.delta;
      return d ? { delta:d } : null;
    }), { status:200, headers:{ 'Content-Type':'text/event-stream' } });
  });
}

/* ============================ fetch proxy ============================ */
function makeProxy(){
  return function(input, init){
    const url = typeof input === 'string' ? input : input?.url || String(input || '');
    const opts = init || {};
    if (String(opts.method || input?.method || 'GET').toUpperCase() !== 'POST') return NS.origFetch.call(this, input, init);
    let payload;
    if (typeof opts.body !== 'string') return NS.origFetch.call(this, input, init);
    try { payload = JSON.parse(opts.body); } catch(e){ return NS.origFetch.call(this, input, init); }
    const r = route(url, payload);
    if (!r) return NS.origFetch.call(this, input, init);
    if (r.kind === 'responses') return responses.handle(payload, r.plan, url, opts);
    if (r.kind === 'anthropic') return anthropic.handle(payload, opts);
    return coalesce(payload, url, opts, input, init);
  };
}

/* ============================ tool_eval_1 ============================ */
const safeString = v => {
  try {
    if (v === undefined) return 'undefined';
    if (typeof v === 'bigint' || typeof v === 'symbol' || typeof v === 'function') return String(v);
    if (typeof v !== 'object' || v === null) return JSON.stringify(v);
    const seen = new WeakSet();
    return JSON.stringify(v, (k,x) => {
      if (typeof x === 'bigint' || typeof x === 'symbol' || typeof x === 'function') return String(x);
      if (x && typeof x === 'object'){ if (seen.has(x)) return '[circular]'; seen.add(x); }
      return x;
    }, 2).slice(0,20000) || 'undefined';
  } catch(e){ return String(v); }
};
const workerEval = (code, ms) => new Promise(resolve => {
  try {
    const src = "self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:1,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:0,e:String(err&&err.stack||err)})}}";
    const w = new Worker(URL.createObjectURL(new Blob([src], { type:'text/javascript' })));
    const t = setTimeout(() => { w.terminate(); resolve({ ok:0, e:'timeout' }); }, ms);
    w.onmessage = e => { clearTimeout(t); w.terminate(); resolve(e.data); };
    w.onerror = err => { clearTimeout(t); w.terminate(); resolve({ ok:0, e:String(err.message || err) }); };
    w.postMessage(code);
  } catch(e){ resolve({ ok:0, e:String(e) }); }
});
async function runTool(args = {}){
  const code = String(args.code ?? args.expression ?? '').trim();
  const ms = args.timeout == null ? 10000 : Math.max(1, Math.min(60000, +args.timeout || 10000));
  const worker = args.worker !== false;
  const t0 = performance.now();
  if (!code) return safeString({ ok:false, error:'no code provided' });
  const done = r => safeString({ ok:!!r.ok, ms:Math.round(performance.now() - t0), ...(r.ok ? { result:r.r } : { error:r.e }) });
  if (worker) return done(await workerEval(code, ms));
  return new Promise(resolve => {
    let settled = false;
    const t = setTimeout(() => { if (!settled){ settled = true; resolve(done({ ok:0, e:'timeout' })); } }, ms);
    const fin = r => { if (settled) return; settled = true; clearTimeout(t); resolve(done(r)); };
    try { Promise.resolve(eval(code)).then(r => fin({ ok:1, r }), e => fin({ ok:0, e:String(e?.stack || e) })); }
    catch(e){ fin({ ok:0, e:String(e?.stack || e) }); }
  });
}
async function execTool(tc){
  const name = tc.function?.name, def = window.__tools?.[name];
  let args = {};
  try { args = JSON.parse(tc.function?.arguments || '{}'); } catch(e){ args = { parseError:String(e), raw:tc.function?.arguments }; }
  if (!def) return JSON.stringify({ ok:false, error:'unknown tool: ' + name });
  try { const out = await def.run(args); return typeof out === 'string' ? out : JSON.stringify(out); }
  catch(e){ return JSON.stringify({ ok:false, error:String(e?.stack || e) }); }
}
function patchExecuteAPI(){
  if (NS.toolsInstalled || typeof executeAPI !== 'function') return;
  NS.origExecuteAPI = executeAPI;
  window.__tools = window.__tools || {};
  window.__tools.tool_eval_1 = {
    schema:{ type:'function', function:{ name:'tool_eval_1',
      description:'Run arbitrary JavaScript in the browser and return JSON result. Use for math, fetch, text/DOM inspection. Default timeout 10000ms; override with "timeout" (ms, max 60000). worker:false runs in page scope (app globals available); default isolated worker.',
      parameters:{ type:'object', properties:{
        code:{ type:'string', description:'JavaScript to evaluate. Returned value or resolved Promise is returned as JSON.' },
        timeout:{ type:'number', description:'ms (default 10000, max 60000)' },
        worker:{ type:'boolean', description:'default true = isolated worker; false = page scope' }
      }, required:['code'] } } },
    run: runTool
  };
  executeAPI = async function(messages, node, vIndex, controller, r = run()){
    const p = r.p, key = getApiKey(p.id), isStream = settings.streaming, modelId = r.m;
    let tools = [];
    if (Array.isArray(r.request?.tools)) tools = r.request.tools.slice();
    else if (typeof r.request?.tools === 'string') tools = r.request.tools.split(/[,\s]+/).filter(Boolean).map(n => window.__tools?.[n]?.schema).filter(Boolean);
    if (NS.flags.toolEval && window.__tools?.tool_eval_1 && !tools.some(t => t?.type === 'function' && t.function?.name === 'tool_eval_1')) tools.push(window.__tools.tool_eval_1.schema);
    const payload = { ...r.request, model:modelId, messages, temperature:r.supportsTemperature === false ? undefined : r.temperature ?? .7, stream:isStream };
    if (tools.length){ payload.tools = tools; if (!payload.tool_choice) payload.tool_choice = 'auto'; }
    payload[p.maxTokensParam || 'max_tokens'] = r.maxTokens;
    if (isStream && p.supportsStreamUsage) payload.stream_options = { include_usage:true };
    node.versions[vIndex].startTime = Date.now();
    for (let turn = 0; turn <= 10; turn++){
      const res = await fetch(p.baseURL + p.apiPath, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':(p.authHeader ? p.authHeader + ' ' : '') + key }, body:JSON.stringify({ ...payload, messages }), signal:controller.signal });
      if (!res.ok){ const body = (await res.text()).trim(); throw new Error(`HTTP ${res.status}${res.statusText ? ' ' + res.statusText : ''}${body ? '\n' + body : ''}`); }
      let usageState, exactCost;
      const applyUsage = envelope => {
        const costBad = {}, next = r.usagePath === false ? envelope : r.usagePath ? at(envelope, r.usagePath) : envelope?.usage ?? envelope?.usageMetadata ?? envelope?.message?.usage;
        const rc = usageValue(envelope, r.usageCost, costBad);
        if (!costBad.value && rc !== undefined) exactCost = rc;
        if (isObj(next)) usageState = mergeUsage(usageState, next);
        if (usageState || exactCost !== undefined) applyResponseMetadata(node.versions[vIndex], usageState || {}, r, exactCost);
      };
      let toolCalls = null;
      if (!isStream){
        const data = await res.json(); applyUsage(data);
        const msg = data.choices?.[0]?.message || {};
        if (msg.tool_calls?.length){
          toolCalls = msg.tool_calls;
          messages.push({ role:msg.role || 'assistant', content:msg.content || null, tool_calls:toolCalls });
        } else {
          node.versions[vIndex].rawContent = msg.content || '';
          node.versions[vIndex].thinking = msg.reasoning_content || '';
          handleNewContent(node.versions[vIndex].rawContent.length + node.versions[vIndex].thinking.length, true);
        }
      } else {
        const reader = res.body.getReader(), dec = new TextDecoder();
        let fullC = '', fullT = '', buf = '', first = true, lastR = 0, tAcc = [];
        const proc = line => {
          if (!line.startsWith('data: ')) return;
          const js = line.slice(6).trim(); if (!js || js === '[DONE]') return;
          try {
            const d = JSON.parse(js), delta = d.choices?.[0]?.delta || {};
            fullC += delta.content || ''; fullT += delta.reasoning_content || '';
            (delta.tool_calls || []).forEach(dtc => {
              const i = dtc.index ?? tAcc.length;
              let a = tAcc[i] ?? (tAcc[i] = { id:'', type:'function', function:{ name:'', arguments:'' } });
              if (dtc.id) a.id += dtc.id;
              if (dtc.function){ if (dtc.function.name) a.function.name += dtc.function.name; if (dtc.function.arguments) a.function.arguments += dtc.function.arguments; }
            });
            node.lastUpdateTime = Date.now(); const v = node.versions[vIndex];
            v.rawContent = fullC; v.thinking = fullT;
            if (first && (fullC || fullT || tAcc.length)){ if (node.activeVersion === vIndex) updateNodeDOM(node); first = false; handleNewContent(0, true); }
            if (!first && (fullC.length + fullT.length)){
              if (node.activeVersion === vIndex){
                v.unread = false;
                const l = fullC.length + fullT.length; handleNewContent(l - lastR, false); lastR = l;
                const el = getMessageEl(node.id);
                if (el){ const b = el.querySelector('.bubble'), cc = el.closest('.message').querySelector('.char-count'), h = buildThinkingSection(fullT, node.id, true) + formatMarkdown(fullC);
                  if (b && b.innerHTML !== h) b.innerHTML = h; if (cc) cc.textContent = getMessageStatString(node, v); }
                scheduleTokenDisplayUpdate(fullC.length, fullT.length);
              } else { const vs = node.versions, a = node.activeVersion; if ((vs[a].swarm && !vs[a].endTime) || !v.unread) updateVersionDots(node, vIndex); }
              const sw = node.id + '|' + vIndex, now = Date.now();
              if (now - (lastBufferWrite[sw] || 0) > 500){ saveStreamBuffer(node, vIndex); lastBufferWrite[sw] = now; }
            }
            applyUsage(d);
          } catch(e){}
        };
        while (true){ const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream:true }); const ls = buf.split('\n'); buf = ls.pop(); ls.forEach(proc); }
        if (buf.trim()) proc(buf.trim());
        if (tAcc.length){
          toolCalls = tAcc.filter(Boolean);
          messages.push({ role:'assistant', content:fullC || null, tool_calls:toolCalls });
          if (!fullC.trim()){ node.versions[vIndex].rawContent = '🔧 Calling ' + toolCalls.map(t => t.function?.name).join(', ') + '…'; if (node.activeVersion === vIndex) updateNodeDOM(node); }
        } else { node.versions[vIndex].rawContent = fullC; node.versions[vIndex].thinking = fullT; }
      }
      if (toolCalls?.length){
        if (turn >= 10) break;
        for (const tc of toolCalls){ NS.stats.toolCalls++; messages.push({ role:'tool', tool_call_id:tc.id, content:await execTool(tc) }); }
        pill();
        continue;
      }
      break;
    }
    await saveStreamBuffer(node, vIndex);
    node.versions[vIndex].endTime = node.lastUpdateTime || Date.now();
    finalizeGeneration(node, vIndex, controller);
  };
  NS.toolsInstalled = true;
  log('tool_eval_1 registered + executeAPI patched');
}
function unpatchExecuteAPI(){
  if (NS.toolsInstalled && NS.origExecuteAPI) executeAPI = NS.origExecuteAPI;
  if (window.__tools) delete window.__tools.tool_eval_1;
  NS.toolsInstalled = false;
}

/* ============================ pricing ============================ */
const DS_RATES = {
  'deepseek-v4-flash':{ peak:{ inputCacheHit:.014e-6, inputCacheMiss:.44e-6, output:1.32e-6 }, off:{ inputCacheHit:.007e-6, inputCacheMiss:.22e-6, output:.66e-6 } },
  'deepseek-v4-pro':  { peak:{ inputCacheHit:.044e-6, inputCacheMiss:1.32e-6, output:3.96e-6 }, off:{ inputCacheHit:.022e-6, inputCacheMiss:.66e-6, output:1.98e-6 } }
};
function dsRates(model, at = Date.now()){
  const h = new Date(at).getUTCHours(), peak = (h >= 1 && h < 4) || (h >= 6 && h < 10);
  const m = DS_RATES[model];
  return m ? { ...m[peak ? 'peak' : 'off'] } : null;
}
function patchPricing(){
  if (NS.pricingInstalled || typeof applyResponseMetadata !== 'function') return;
  NS.origARM = applyResponseMetadata;
  applyResponseMetadata = function(version, raw, config, exact){
    if (config?.p?.id === 'deepseek' && config.m){ const r = dsRates(config.m); if (r) config = { ...config, pricing:{ ...config.pricing, ...r } }; }
    return NS.origARM(version, raw, config, exact);
  };
  NS.pricingInstalled = true;
  log('deepseek peak/off-peak pricing installed');
}
function unpatchPricing(){ if (NS.pricingInstalled && NS.origARM){ applyResponseMetadata = NS.origARM; NS.pricingInstalled = false; } }

/* ============================ marked ============================ */
const MARKED_CSS = '.bubble table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.85rem;overflow-x:auto;display:block}.bubble th,.bubble td{border:1px solid var(--border);padding:8px 12px;text-align:left}.bubble th{background:rgba(0,0,0,.3);font-weight:bold;color:var(--accent)}.bubble tbody tr:nth-child(even){background:rgba(0,0,0,.15)}';
function loadMarked(){
  if (NS.markedReady || NS.markedLoading) return;
  if (window.marked?.parse || window.marked?.Marked){ NS.markedReady = true; return; }
  NS.markedLoading = new Promise(resolve => {
    const s = document.createElement('script');
    s.src = NS.config.markedSrc; s.crossOrigin = 'anonymous';
    s.onload = () => { s.remove(); NS.markedLoading = null; NS.markedReady = !!(window.marked?.parse || window.marked?.Marked); if (NS.markedReady) injectMarkedCss(); try { renderFullChat(); } catch(e){} resolve(); };
    s.onerror = () => { s.remove(); NS.markedLoading = null; warn('marked unavailable'); resolve(); };
    document.head.appendChild(s);
  });
}
function injectMarkedCss(){ if (NS.markedCss) return; const s = document.createElement('style'); s.textContent = MARKED_CSS; document.head.appendChild(s); NS.markedCss = true; }
function renderMarked(raw){
  const lib = window.marked;
  if (!lib || !raw) return NS.origFormatMarkdown ? NS.origFormatMarkdown(raw) : String(raw || '');
  try {
    const renderer = { code(tok){
      const text = tok?.text != null ? tok.text : String(tok || '');
      const lang = tok?.lang || 'plain';
      return buildCodeBlockHTML(lang, text + '\n', !!(settings.blockAutoCollapse && text.length > settings.blockCollapseSize));
    }};
    if (typeof lib.Marked === 'function') return new lib.Marked({ gfm:true, breaks:true, renderer }).parse(String(raw));
    if (typeof lib.parse === 'function'){ const r = new lib.Renderer(); r.code = renderer.code; return lib.parse(String(raw), { renderer:r, breaks:true, gfm:true }); }
  } catch(e){ warn('marked render failed: ' + e.message); }
  return NS.origFormatMarkdown ? NS.origFormatMarkdown(raw) : String(raw || '');
}
function patchMarkdown(){
  if (NS.markedPatched || typeof formatMarkdown !== 'function') return;
  NS.origFormatMarkdown = formatMarkdown;
  formatMarkdown = raw => renderMarked(raw);
  NS.markedPatched = true;
  loadMarked();
}
function unpatchMarkdown(){ if (NS.markedPatched && NS.origFormatMarkdown){ formatMarkdown = NS.origFormatMarkdown; NS.markedPatched = false; } }

/* ============================ status pill ============================ */
function pill(){
  if (!NS.flags.pill){ removePill(); return; }
  let el = $('eval1Pill');
  if (!el){
    el = document.createElement('span');
    el.id = 'eval1Pill';
    el.style.cssText = 'font-size:.68rem;padding:2px 8px;border-radius:6px;background:var(--border);color:var(--text-secondary);font-family:monospace;white-space:nowrap;cursor:help;';
    el.addEventListener('click', () => NS.setMode(NS.config.mode === 'responses' ? 'chat' : NS.config.mode === 'chat' ? 'auto' : 'responses'));
    document.querySelector('.header-right')?.insertBefore(el, document.querySelector('.header-right').firstChild);
  }
  const s = NS.stats.last.mode || (NS.flags.hybrid ? NS.config.mode : 'off');
  let txt = 'API ' + s + (NS.stats.last.model ? ' · ' + NS.stats.last.model : '');
  if (NS.stats.searchCalls && NS.config.showSearchTrace) txt += ' · 🔎' + NS.stats.searchCalls;
  if (NS.stats.toolCalls) txt += ' · 🔧' + NS.stats.toolCalls;
  el.textContent = txt;
  el.title = 'mode:' + NS.config.mode + (NS.stats.last.id ? ' · id:' + NS.stats.last.id : '') +
    ' · transformed:' + NS.stats.transformed + ' · passthrough:' + NS.stats.passthrough +
    ' · searchCalls:' + NS.stats.searchCalls + ' · toolCalls:' + NS.stats.toolCalls;
}
function removePill(){ $('eval1Pill')?.remove(); }

/* ============================ apply / api ============================ */
function apply(){
  FLAG_NAMES.forEach((k,i) => { window['eval1b' + (i + 1)] = NS.flags[k]; });
  NS.flags.marked ? patchMarkdown() : unpatchMarkdown();
  NS.flags.toolEval ? patchExecuteAPI() : unpatchExecuteAPI();
  NS.flags.pricing ? patchPricing() : unpatchPricing();
  window.fetch = makeProxy();
  NS.flags.pill ? pill() : removePill();
  NS.installed = true;
  log('applied v' + NS.version, NS.flags);
}
function disable(){
  if (NS.origFetch) window.fetch = NS.origFetch;
  unpatchMarkdown(); unpatchExecuteAPI(); unpatchPricing(); removePill();
  NS.installed = false;
  log('disabled — original fetch/executeAPI/pricing restored');
}
NS.apply = apply;
NS.disable = disable;
NS.setFlag = (name, val) => {
  if (!FLAG_NAMES.includes(name)) throw Error('unknown flag: ' + name);
  NS.flags[name] = val ? 1 : 0;
  apply();
  return { ...NS.flags };
};
NS.setMode = m => { if (!['auto','chat','responses'].includes(m)) throw Error('mode must be auto|chat|responses'); NS.config.mode = m; save(); pill(); return m; };
NS.setWebSearch = v => { NS.config.webSearch = !!v; save(); return NS.config.webSearch; };
NS.setShowSearchTrace = v => { NS.config.showSearchTrace = !!v; save(); pill(); return NS.config.showSearchTrace; };
NS.setPaintInterval = ms => { NS.config.paintIntervalMs = Math.max(40, +ms || 160); save(); return NS.config.paintIntervalMs; };
NS.status = () => JSON.parse(JSON.stringify({ version:NS.version, flags:NS.flags, config:NS.config, stats:NS.stats, installed:NS.installed }));

apply();
})();

/* ============================ Exp tab + info popups ============================ */
(function(){
'use strict';
const NS = window.__eval1;
if (!NS) return;

const INFO = {
  about:{ t:'About this tab', h:'Experimental controls injected by the eval1 v3.1 module. Each toggle maps to <code>__eval1.setFlag(...)</code>/<code>setMode(...)</code> and persists via localStorage (<code>dse_eval1_config</code>). Re-paste after reload — tab and fetch chain are in-memory.' },
  mode:{ t:'API mode', h:'<b>auto</b> — per-model routing<br><b>chat</b> — DeepSeek → anthropic bridge (web search)<br><b>responses</b> — profiled models (<code>deepseek-v4-flash/pro</code>, <code>gpt-5.6-sol/terra/luna</code>) → <code>/responses</code>, streaming. Others fall back to chat.' },
  webSearch:{ t:'Web search', h:'Server-side search tool:<br>• anthropic bridge → <code>web_search_20250305</code><br>• responses → <code>tools:[{type:"web_search"}]</code><br>Off = plain requests.' },
  showTrace:{ t:'Show 🔎 trace', h:'Prints <code>[web_search] query</code> into the thinking block and shows the 🔎 counter on the pill. Stored with the message, survives reload.' },
  paint:{ t:'Paint interval', h:'ms between streaming UI updates. 160 ms ≈ 6 renders/s and eliminates the quadratic Markdown reparse freeze on long streams. Min 40.' },
  marked:{ t:'Marked tables', h:'Replaces the built-in parser with <b>marked.js</b> (pinned <code>marked@18.0.9/lib/marked.umd.js</code>) for GFM tables. Code blocks keep copy/collapse UI. <span style="color:var(--warning)">Raw HTML not sanitized.</span>' },
  anthropic:{ t:'Anthropic bridge', h:'DeepSeek Chat → <code>api.deepseek.com/anthropic/v1/messages</code> with <code>web_search_20250305</code>.<br>Without "Streaming bridge": non-streaming (whole answer after thinking). Requests with function tools bypass this bridge.' },
  bridgeStream:{ t:'Streaming bridge', h:'ON → DeepSeek chat uses <code>stream:true</code>, translating <code>thinking_delta</code>/<code>text_delta</code> into live chunks. OFF → old non-streaming behavior.' },
  toolEval:{ t:'Tool eval (tool_eval_1)', h:'Registers a function tool letting the model run JS in your browser (isolated worker, 10 s default timeout). <code>executeAPI</code> is patched for the tool loop (Chat), and the <code>/responses</code> adapter has a <code>function_call/function_call_output</code> executor loop — works in responses mode too.<br><span style="color:var(--danger)">⚠ Can read everything in the page (API keys, history) and call fetch. Keep off when not experimenting.</span>' },
  hybrid:{ t:'Responses hybrid', h:'Chat → <code>/responses</code> translation: instructions, input items, max_output_tokens, web_search, function tools (Responses format, <code>name</code> at top level). SSE translated back to chat chunks. Both DeepSeek V4 models support /responses (verified).' },
  pricing:{ t:'DeepSeek peak pricing', h:'Message-send-time rates by UTC hour. Peak <b>[01:00,04:00)</b> and <b>[06:00,10:00)</b>; off-peak = half.<br>• Flash peak: hit $0.014/M · miss $0.44/M · out $1.32/M<br>• Pro peak: hit $0.044/M · miss $1.32/M · out $3.96/M<br>Applied via <code>applyResponseMetadata</code> wrapper so pills are right on all paths.' },
  pill:{ t:'Status pill', h:'Header indicator <code>API mode · model · 🔎n · 🔧n</code>. Click to cycle auto → chat → responses. Hover for stats.' },
  route:{ t:'Routing', h:'Where the next request goes: DeepSeek → anthropic bridge (chat) or /responses (responses); OpenAI profiled → /responses; Gemini/Z.ai/custom → chat (coalesced); function tools → tool loop. Console logs each transformed request.' }
};
const ROWS = [
  ['about','About',null], ['mode','API mode','select'], ['webSearch','Web search','toggle'],
  ['showTrace','Show 🔎 trace','toggle'], ['paint','Paint interval (ms)','number'],
  ['marked','Marked tables','toggle'], ['anthropic','Anthropic bridge','toggle'],
  ['bridgeStream','Streaming bridge','toggle'], ['toolEval','Tool eval (tool_eval_1)','toggle'],
  ['hybrid','Responses hybrid','toggle'], ['pricing','DeepSeek peak pricing','toggle'],
  ['pill','Status pill','toggle'], ['route','Routing',null]
];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function injectCss(){
  if ($('expStyle')) return;
  const s = document.createElement('style');
  s.id = 'expStyle';
  s.textContent = '.exp-info{background:none;border:1px solid var(--border);color:var(--text-secondary);border-radius:50%;width:17px;height:17px;font-size:10px;line-height:1;padding:0;cursor:help;vertical-align:middle;margin-left:4px;flex-shrink:0}' +
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
function popup(){ return $('expPopupWrap'); }
function closePopup(){ popup()?.remove(); }
function openPopup(key){
  const info = INFO[key] || INFO.about;
  closePopup();
  const w = document.createElement('div');
  w.id = 'expPopupWrap'; w.className = 'exp-popup-wrap';
  w.innerHTML = '<div class="exp-popup-backdrop"></div>' +
    '<div class="exp-popup" role="dialog" aria-modal="true">' +
    '<div class="exp-popup-head"><span>' + esc(info.t) + '</span><button class="exp-popup-x" data-expx="1">×</button></div>' +
    '<div class="exp-popup-body">' + info.h + '</div>' +
    '<div class="exp-popup-foot"><button class="exp-popup-close" data-expx="1">Close</button></div></div>';
  document.body.appendChild(w);
  w.addEventListener('click', e => { if (e.target.closest('[data-expx]')) closePopup(); else if (!e.target.closest('.exp-popup')) closePopup(); });
}
/* capture: while popup open, keep settings panel open; close popup on outside click */
document.addEventListener('click', e => {
  const p = popup(); if (!p) return;
  const t = e.target;
  if (t.closest('.exp-popup') || t.closest('[data-expinfo]')){ e.stopPropagation(); return; }
  closePopup();
}, true);

function buildTab(){
  document.querySelector('.tab-btn[data-tab="exp"]')?.remove();
  $('tab-exp')?.remove();
  const swarmBtn = document.querySelector('.tab-btn[data-tab="swarm"]'), swarmTab = $('tab-swarm');
  if (!swarmBtn || !swarmTab) return;
  swarmBtn.insertAdjacentHTML('afterend', '<button class="tab-btn" data-tab="exp">Exp</button>');
  const html = '<div class="tab-content" id="tab-exp">' + ROWS.map(([key,label,type]) => {
    const info = '<button type="button" class="exp-info" data-expinfo="' + key + '" title="' + esc(INFO[key].t) + '">ⓘ</button>';
    let ctrl = '';
    if (type === 'select') ctrl = '<select id="exp_' + key + '" data-eval1="1"><option>auto</option><option>chat</option><option>responses</option></select>';
    else if (type === 'toggle') ctrl = '<label class="toggle"><input type="checkbox" id="exp_' + key + '" data-eval1="1"><span class="slider"></span></label>';
    else if (type === 'number') ctrl = '<input type="number" id="exp_' + key + '" data-eval1="1" min="40" step="10" style="width:75px">';
    else ctrl = '<span id="exp_route" style="font-size:.68rem;color:var(--text-secondary);font-family:monospace;overflow-wrap:anywhere"></span>';
    return '<div class="setting-row"><span>' + esc(label) + ' ' + info + '</span>' + ctrl + '</div>';
  }).join('') + '</div>';
  swarmTab.insertAdjacentHTML('afterend', html);
  document.querySelector('.tab-btn[data-tab="exp"]')._ = $('tab-exp');
}
function sync(){
  const set = (k,v) => { const el = $('exp_' + k); if (el){ if (el.type === 'checkbox') el.checked = !!v; else el.value = v; } };
  set('mode', NS.config.mode); set('webSearch', NS.config.webSearch); set('showTrace', NS.config.showSearchTrace);
  set('paint', NS.config.paintIntervalMs);
  ['marked','anthropic','bridgeStream','toolEval','hybrid','pricing','pill'].forEach(k => set(k, NS.flags[k]));
  const r = $('exp_route'); if (!r) return;
  const parts = [];
  if (NS.config.mode === 'responses') parts.push('deepseek flash/pro + gpt-5.6 → /responses');
  else if (NS.config.mode === 'chat') parts.push('all → chat (deepseek → anthropic bridge' + (NS.flags.bridgeStream ? ' streaming' : '') + ')');
  else parts.push('deepseek → anthropic bridge' + (NS.flags.bridgeStream ? ' (streaming)' : '') + ' · openai profiled → /responses · others → chat');
  if (NS.flags.toolEval) parts.push('tool_eval_1 ON');
  if (NS.flags.pricing) parts.push('peak pricing ON');
  r.textContent = parts.join(' · ');
}
function bind(){
  const on = (k, ev, fn) => { const el = $('exp_' + k); if (el) el.addEventListener(ev, fn); };
  on('mode','change', e => { NS.setMode(e.target.value); sync(); });
  on('webSearch','change', e => { NS.setWebSearch(e.target.checked); });
  on('showTrace','change', e => { NS.setShowSearchTrace(e.target.checked); });
  on('paint','change', e => { const v = +e.target.value; if (v >= 40) NS.setPaintInterval(v); });
  ['marked','anthropic','bridgeStream','toolEval','hybrid','pricing','pill'].forEach(k =>
    on(k,'change', e => { NS.setFlag(k, e.target.checked ? 1 : 0); sync(); }));
  document.querySelectorAll('#tab-exp [data-expinfo]').forEach(b =>
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openPopup(b.dataset.expinfo); }));
}
injectCss(); buildTab(); sync(); bind();
try { console.log('[eval1] Exp tab installed — Settings → Exp → ⓘ for details'); } catch(e){}
})();
