(() => {
  // ---------- 1. safe stringify + worker eval (hard timeout) ----------
  const safeStr = v => { try {
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
    return new Promise(resolve => { let done2=false;
      const t = setTimeout(()=>{ if(!done2){ done2=true; resolve(done({ok:0,e:'timeout'})); } }, timeout);
      const fin = r => { if(done2) return; done2=true; clearTimeout(t); resolve(done(r)); };
      try { Promise.resolve(eval(code)).then(r=>fin({ok:1,r}), e=>fin({ok:0,e:String(e?.stack||e)})); }
      catch(e){ fin({ok:0,e:String(e?.stack||e)}); }
    });
  };

  // ---------- 2. register tool_eval_1 ----------
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

  // ---------- 3. patch executeAPI: collect tool_calls, execute, loop ----------
  const execTool = async tc => {
    const name = tc.function?.name, def = window.__tools?.[name]; let args = {};
    try { args = JSON.parse(tc.function?.arguments || '{}'); } catch(e){ args = { parseError:String(e), raw:tc.function?.arguments }; }
    if (!def) return JSON.stringify({ok:false, error:'unknown tool: '+name});
    try { const out = await def.run(args); return typeof out==='string' ? out : JSON.stringify(out); }
    catch(e){ return JSON.stringify({ok:false, error:String(e?.stack||e)}); }
  };

  executeAPI = async function(messages, node, vIndex, controller, r=run()) {
    const p=r.p, key=getApiKey(p.id), isStream=settings.streaming, modelId=r.m;
    let tools=[];
    if (Array.isArray(r.request?.tools)) tools = r.request.tools;
    else if (typeof r.request?.tools === 'string') tools = r.request.tools.split(/[,\s]+/).filter(Boolean).map(n=>window.__tools?.[n]?.schema).filter(Boolean);
    else if (!('tools' in (r.request||{}))) tools = Object.values(window.__tools||{}).map(t=>t.schema).filter(Boolean);

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
              const i=dtc.index??tAcc.length; let a=tAcc[i] ?? (tAcc[i]={id:'',type:'function',function:{name:'',arguments:''}});
              if(dtc.id) a.id=dtc.id;
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
        for (const tc of toolCalls) messages.push({ role:'tool', tool_call_id:tc.id, content: await execTool(tc) });
        continue;
      }
      break;
    }
    await saveStreamBuffer(node, vIndex);
    node.versions[vIndex].endTime = node.lastUpdateTime || Date.now();
    finalizeGeneration(node, vIndex, controller);
  };

  console.log('✅ tool_eval_1 registered + executeAPI patched');
  return 'tools ready';
})();
