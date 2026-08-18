(() => {
'use strict';
/* ===== tool_eval_1 v2 — multi-call safe + tool log (chat-completions, bypasses eval1) ===== */
var NS = window.__eval1;
var ORIG = (NS && NS.origFetch) || window.fetch.bind(window);

/* ---------- tool_eval_1 ---------- */
var safeStr = v => { try {
  if (v === undefined) return 'undefined';
  if (typeof v === 'bigint' || typeof v === 'symbol' || typeof v === 'function') return String(v);
  if (typeof v !== 'object' || v === null) return JSON.stringify(v);
  const seen = new WeakSet();
  return JSON.stringify(v, (k,x)=>{ if(typeof x==='bigint'||typeof x==='symbol'||typeof x==='function') return String(x); if(x&&typeof x==='object'){ if(seen.has(x)) return '[circular]'; seen.add(x);} return x; }, 2).slice(0,20000) || 'undefined';
} catch(e){ return String(v); } };
const evalWorker = (code, timeout) => new Promise(resolve => { try {
  const src = `self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:1,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:0,e:String(err&&err.stack||err)})}}`;
  const w = new Worker(URL.createObjectURL(new Blob([src], {type:'text/javascript'})));
  const t = setTimeout(()=>{ w.terminate(); resolve({ok:0,e:'timeout'}); }, timeout);
  w.onmessage = e => { clearTimeout(t); w.terminate(); resolve(e.data); };
  w.onerror = err => { clearTimeout(t); w.terminate(); resolve({ok:0,e:String(err.message||err)}); };
  w.postMessage(code);
} catch(e){ resolve({ok:0,e:String(e)}); } });
const runTool = async (args={}) => {
  const code = String(args.code ?? args.expression ?? '').trim();
  const timeout = args.timeout == null ? 10000 : Math.max(1, Math.min(60000, Number(args.timeout)||10000));
  const worker = args.worker !== false;
  const t0 = performance.now();
  if (!code) return safeStr({ok:false, error:'no code provided'});
  const done = r => safeStr({ ok:!!r.ok, ms:Math.round(performance.now()-t0), ...(r.ok ? {result:r.r} : {error:r.e}) });
  if (worker) return done(await evalWorker(code, timeout));
  return new Promise(resolve => { let fin=false;
    const t = setTimeout(()=>{ if(!fin){ fin=true; resolve(done({ok:0,e:'timeout'})); } }, timeout);
    const f = r => { if(fin) return; fin=true; clearTimeout(t); resolve(done(r)); };
    try { Promise.resolve(eval(code)).then(r=>f({ok:1,r}), e=>f({ok:0,e:String(e&&e.stack||e)})); }
    catch(e){ f({ok:0,e:String(e&&e.stack||e)}); }
  });
};
window.__tools = window.__tools || {};
window.__tools.tool_eval_1 = { schema: {
  type:'function', function:{ name:'tool_eval_1',
    description:'Run arbitrary JavaScript in the browser and return JSON result. Use for math, fetch, text/DOM. Default timeout 10000ms; override with "timeout" (ms, max 60000). worker:false runs in page scope (app globals available); default isolated worker.',
    parameters:{ type:'object', properties:{
      code:{ type:'string', description:'JavaScript to evaluate. Returned value or resolved Promise is returned as JSON.' },
      timeout:{ type:'number', description:'ms (default 10000, max 60000)' },
      worker:{ type:'boolean', description:'default true = isolated worker; false = page scope' }
    }, required:['code'] }
  }}, run: runTool };
window.toolEval1 = window.__tools.tool_eval_1;

/* ---------- exec ---------- */
const execTool = async tc => {
  const name = tc.function && tc.function.name, def = window.__tools && window.__tools[name]; let args={};
  try { args = JSON.parse((tc.function && tc.function.arguments)||'{}'); } catch(e){ args = { parseError:String(e), raw:(tc.function && tc.function.arguments) }; }
  if(!def) return JSON.stringify({ok:false, error:'unknown tool: '+name});
  try { const out = await def.run(args); return typeof out==='string'? out : JSON.stringify(out); }
  catch(e){ return JSON.stringify({ok:false, error:String(e && e.stack || e)}); }
};

/* ---------- executeAPI v2 (chat-completions, robust multi-call, tool log) ---------- */
executeAPI = async function(messages, node, vIndex, controller, r=run()) {
  const p=r.p, key=getApiKey(p.id), isStream=settings.streaming, modelId=r.m, v=node.versions[vIndex];
  let tools=[];
  if(Array.isArray(r.request && r.request.tools)) tools=r.request.tools;
  else if(typeof (r.request && r.request.tools)==='string') tools=r.request.tools.split(/[,\s]+/).filter(Boolean).map(n=>{ const t=window.__tools && window.__tools[n]; return t && t.schema; }).filter(Boolean);
  const base=String(p.baseURL||'').replace(/\/+$/,'');
  const url=base+'/chat/completions';          /* proven path; bypasses eval1 */
  const fetchFn=ORIG;
  const log=v.toolLog || (v.toolLog=[]);        /* persisted on the version */
  v.startTime=Date.now();
  const MAX=10;

  for(let turn=0; turn<=MAX; turn++){
    const payload={ ...r.request, model:modelId, messages, temperature:r.supportsTemperature===false?undefined:(r.temperature??0.7), stream:isStream };
    if(tools.length){ payload.tools=tools; if(!('tool_choice' in payload)) payload.tool_choice='auto'; }
    payload[p.maxTokensParam||'max_tokens']=r.maxTokens;
    if(isStream && p.supportsStreamUsage) payload.stream_options={include_usage:true};

    const res=await fetchFn(url,{ method:'POST', headers:{'Content-Type':'application/json','Authorization':(p.authHeader?p.authHeader+' ':'')+key}, body:JSON.stringify(payload), signal:controller.signal });
    if(!res.ok){ const b=(await res.text()).trim(); throw new Error(`HTTP ${res.status}${res.statusText?' '+res.statusText:''}${b?'\n'+b:''}`); }

    let toolCalls=null;

    if(!isStream){
      const data=await res.json();
      const msg=(data.choices&&data.choices[0]&&data.choices[0].message)||{};
      if(msg.tool_calls && msg.tool_calls.length){ toolCalls=msg.tool_calls; messages.push({role:msg.role||'assistant', content:msg.content||null, tool_calls:toolCalls}); }
      else { v.rawContent=msg.content||''; v.thinking=msg.reasoning_content||''; handleNewContent(v.rawContent.length+v.thinking.length,true); }
    } else {
      const reader=res.body.getReader(), dec=new TextDecoder();
      let fullC='', fullT='', buf='', first=true, lastR=0;
      /* robust accumulation: keyed by id AND index; missing-index fragments go to last slot */
      const byId={}, byIndex={}, order=[];
      const slot=(index,id)=>{
        if(id && byId[id]) return byId[id];
        if(index!=null && byIndex[index]) return byIndex[index];
        if(index==null && id==null && order.length) return order[order.length-1];
        const s={id:id||'', name:'', args:''};
        if(id) byId[id]=s;
        if(index!=null) byIndex[index]=s;
        order.push(s);
        return s;
      };
      const accum = dtc => {
        const s=slot(dtc.index, dtc.id);
        if(dtc.function){ if(dtc.function.name) s.name += dtc.function.name; if(dtc.function.arguments) s.args += dtc.function.arguments; }
      };
      const push = delta => {
        fullC += delta.content||''; fullT += delta.reasoning_content||'';
        (delta.tool_calls||[]).forEach(accum);
        v.rawContent=fullC; v.thinking=fullT; node.lastUpdateTime=Date.now();
        if(first && (fullC||fullT||order.length)){ if(node.activeVersion===vIndex) updateNodeDOM(node); first=false; handleNewContent(0,true); }
        if(!first && (fullC.length+fullT.length)){
          if(node.activeVersion===vIndex){
            v.unread=false; const l=fullC.length+fullT.length; handleNewContent(l-lastR,false); lastR=l;
            const el=getMessageEl(node.id);
            if(el){ const b=el.querySelector('.bubble'), cc=el.closest('.message').querySelector('.char-count'), h=buildThinkingSection(fullT,node.id,true)+formatMarkdown(fullC); if(b && b.innerHTML!==h) b.innerHTML=h; if(cc) cc.textContent=getMessageStatString(node,v); }
            scheduleTokenDisplayUpdate(fullC.length, fullT.length);
          } else { const vs=node.versions, a=node.activeVersion; if((vs[a].swarm&&!vs[a].endTime)||!v.unread) updateVersionDots(node,vIndex); }
          const sw=node.id+'|'+vIndex, now=Date.now(); if(now-(lastBufferWrite[sw]||0)>500){ saveStreamBuffer(node,vIndex); lastBufferWrite[sw]=now; }
        }
      };
      while(true){
        const {done,value}=await reader.read(); if(done) break;
        buf += dec.decode(value,{stream:true});
        const lines=buf.split('\n'); buf=lines.pop();
        for(const line of lines){ if(line.indexOf('data:')!==0) continue; const d=line.slice(6).trim(); if(!d||d==='[DONE]') continue; try{ const c=JSON.parse(d); push((c.choices&&c.choices[0]&&c.choices[0].delta)||{}); if(c.usage) applyResponseMetadata(v,c.usage,r,undefined); }catch(e){} }
      }
      if(buf.trim()){ const d=buf.trim(); if(d!=='[DONE]') try{ const c=JSON.parse(d); push((c.choices&&c.choices[0]&&c.choices[0].delta)||{}); if(c.usage) applyResponseMetadata(v,c.usage,r,undefined); }catch(e){} }
      if(order.length){
        toolCalls=order.map(s=>({id:s.id, type:'function', function:{name:s.name, arguments:s.args||'{}'}}));
        messages.push({role:'assistant', content:fullC||null, tool_calls:toolCalls});
        if(!fullC.trim()){ v.rawContent='🔧 Calling '+toolCalls.map(t=>t.function&&t.function.name).join(', ')+'…'; if(node.activeVersion===vIndex) updateNodeDOM(node); }
      } else { v.rawContent=fullC; v.thinking=fullT; }
    }

    if(toolCalls && toolCalls.length){
      if(turn>=MAX) break;
      for(const tc of toolCalls){
        const t0=performance.now();
        const result=await execTool(tc);
        log.push({ name:(tc.function&&tc.function.name)||'?', args:(tc.function&&tc.function.arguments)||'{}', result:String(result).slice(0,2000), ms:Math.round(performance.now()-t0) });
        messages.push({role:'tool', tool_call_id:tc.id, content:result});
      }
      continue;
    }
    break;
  }
  if(log.length){
    v.thinking=(v.thinking? v.thinking+'\n\n':'')+'── tool calls ──\n'+log.map((t,i)=>'['+(i+1)+'] '+t.name+'('+t.args+') → '+t.result).join('\n');
  }
  await saveStreamBuffer(node,vIndex);
  v.endTime=node.lastUpdateTime||Date.now();
  finalizeGeneration(node,vIndex,controller);
};
console.log('✅ tool_eval_1 v2 installed (multi-call safe + tool log)');
return 'tools ready v2';
})();
