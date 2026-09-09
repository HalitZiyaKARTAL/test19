/* ============================================================================
   image4.js  v4.0.0
   • image input: multi-select / drag&drop / clipboard paste · base64 on message
     · bubble render + in-page lightbox · anthropic-endpoint routing · usage/cost
   • provider: FULL-REPLACES deepseek model list with the valid set (prices+rates)
   • order-agnostic with 96 (re-replaces after 96, either order)
   • dropdown: merges GET /models with provider models so the expiring 4.1 shows
   • expiring 4.1 (…-expires-on-0910) only listed/added BEFORE day 11 (2026-09-11)
   • fixes: b64src field mismatch (no base64,undefined)
   • W.__image4.disable() to remove
   ========================================================================== */
(() => {
  const W = window, D = document;
  if (W.__image4) { try { W.__image4.apply(); } catch(e){} return; }

  const CFG = { maxBytes: 12*1024*1024, thumb: 240, maxCount: 12 };
  W.__pendingImages = W.__pendingImages || [];

  /* ---------- expiring-model gate: only before day 11 ---------- */
  const EXPIRE = 'deepseek-v4.1-flash-expires-on-0910';
  const EXPIRE_UNTIL = Date.UTC(2026, 8, 11);          // month 0-based: 8 = September
  const expireActive = () => Date.now() < EXPIRE_UNTIL;

  /* ---------- full deepseek model set (valid names only, with prices) ---------- */
  const SCHED=[{kind:'week',days:[1,2,3,4,5],from:3600000,to:14400000,state:'peak'},{kind:'week',days:[1,2,3,4,5],from:21600000,to:36000000,state:'peak'}], WIN=[[1,4],[6,10]], EPOCH=1786896000000;
  const M_BASE = {
    'deepseek-v4-pro': { maxTokens:384000, contextTokens:1e6, outputTokens:384000, temperature:1, request:{thinking:{type:'enabled'},reasoning_effort:'max'}, pricing:{inputCacheHit:2.2e-8,inputCacheMiss:6.6e-7,output:1.98e-6}, rates:{legacy:{inputCacheHit:3.625e-9,inputCacheMiss:4.35e-7,output:8.7e-7},off:{inputCacheHit:2.2e-8,inputCacheMiss:6.6e-7,output:1.98e-6},peak:{inputCacheHit:4.4e-8,inputCacheMiss:1.32e-6,output:3.96e-6}} },
    'deepseek-v4-flash': { maxTokens:384000, contextTokens:1e6, outputTokens:384000, temperature:1, request:{thinking:{type:'enabled'},reasoning_effort:'max'}, pricing:{inputCacheHit:7e-9,inputCacheMiss:2.2e-7,output:6.6e-7}, rates:{legacy:{inputCacheHit:2.8e-9,inputCacheMiss:1.4e-7,output:2.8e-7},off:{inputCacheHit:7e-9,inputCacheMiss:2.2e-7,output:6.6e-7},peak:{inputCacheHit:1.4e-8,inputCacheMiss:4.4e-7,output:1.32e-6}} },
    'deepseek-v4-flash-vision-exp': { maxTokens:384000, contextTokens:1e6, outputTokens:384000, temperature:1, request:{thinking:{type:'enabled'},reasoning_effort:'max'}, pricing:{inputCacheHit:7e-9,inputCacheMiss:2.2e-7,output:6.6e-7}, rates:{legacy:{inputCacheHit:2.8e-9,inputCacheMiss:1.4e-7,output:2.8e-7},off:{inputCacheHit:7e-9,inputCacheMiss:2.2e-7,output:6.6e-7},peak:{inputCacheHit:1.4e-8,inputCacheMiss:4.4e-7,output:1.32e-6}} }
  };
  const M_EXPIRE = {
    'deepseek-v4.1-flash-expires-on-0910': { maxTokens:384000, contextTokens:1e6, outputTokens:384000, temperature:1, request:{thinking:{type:'enabled'},reasoning_effort:'high'}, pricing:{inputCacheHit:7e-9,inputCacheMiss:2.2e-7,output:6.6e-7}, rates:{legacy:{inputCacheHit:2.8e-9,inputCacheMiss:1.4e-7,output:2.8e-7},off:{inputCacheHit:7e-9,inputCacheMiss:2.2e-7,output:6.6e-7},peak:{inputCacheHit:1.4e-8,inputCacheMiss:4.4e-7,output:1.32e-6}} }
  };
  const cl = o => JSON.parse(JSON.stringify(o));
  const fullModels = () => { const o = cl(M_BASE); if (expireActive()) o[EXPIRE] = cl(M_EXPIRE[EXPIRE]); return o; };

  function replaceProvider(){
    try{ if(typeof providers!=='undefined'&&providers&&providers.deepseek){ const p=providers.deepseek; p.fallbackModels=fullModels(); p.sched=cl(SCHED); if(!Array.isArray(p.windows))p.windows=cl(WIN); if(p.epoch==null)p.epoch=EPOCH; try{localStorage.setItem('dse_providers',JSON.stringify(providers));}catch(e){} } }catch(e){}
    const ns=W.__eval1; if(!ns)return;
    try{ if(ns.providerDefaults&&ns.providerDefaults.deepseek) ns.providerDefaults.deepseek.fallbackModels=fullModels(); }catch(e){}
    try{ if(ns.pricingJSONData&&ns.pricingJSONData.deepseek){ const r={}; Object.keys(M_BASE).forEach(k=>r[k]=cl(M_BASE[k].rates)); if(expireActive()) r[EXPIRE]=cl(M_EXPIRE[EXPIRE].rates); ns.pricingJSONData.deepseek.rates=r; } }catch(e){}
    try{ if(typeof ns.syncPricing==='function') ns.syncPricing(); }catch(e){}
  }
  function hook96(){
    const ns=W.__eval1; if(!ns)return;
    if(typeof ns.applyProviderDefault==='function'&&!ns.__img4ap){ const _ap=ns.applyProviderDefault; ns.applyProviderDefault=function(){ const r=_ap.apply(this,arguments); try{replaceProvider();}catch(e){} return r; }; ns.__img4ap=1; }
    ['providerDefaults','pricingJSONData'].forEach(k=>{ ns.__img4a=ns.__img4a||{}; if(ns.__img4a[k])return; try{ const d=Object.getOwnPropertyDescriptor(ns,k); if(d&&d.set)return; let val=ns[k]; Object.defineProperty(ns,k,{configurable:true,enumerable:true,get(){return val;},set(v){val=v;try{replaceProvider();}catch(e){}}}); ns.__img4a[k]=1; }catch(e){} });
  }

  /* ---------- dropdown: keep the expiring 4.1 listed (before day 11) ---------- */
  function ensureListed(){
    if(!expireActive()) return;
    try{
      const sel=(typeof els!=='undefined'&&els.modelSelect)||D.getElementById('modelSelect'); if(!sel)return;
      if(!Array.prototype.some.call(sel.options,o=>o.value===EXPIRE)){ const o=D.createElement('option'); o.value=EXPIRE; o.textContent=EXPIRE; sel.appendChild(o); }
      let saved=null; try{ saved=(JSON.parse(localStorage.getItem('dse_metadata')||'{}').models||{}).deepseek; }catch(e){}
      if(saved===EXPIRE&&sel.value!==EXPIRE) sel.value=EXPIRE;
    }catch(e){}
  }
  const ORIG={};
  function patchModelLoaders(){
    if(typeof fetchModels==='function'&&!fetchModels.__img4){ ORIG.fetchModels=fetchModels;
      const _fm=fetchModels;
      const w=async function(id){ const apiList=await _fm.apply(this,arguments);
        try{ const pid=id||(typeof activeProviderId!=='undefined'?activeProviderId:''); const p=(typeof providers!=='undefined')?providers[pid]:null; const fb=(p&&p.fallbackModels)?Object.keys(p.fallbackModels):[]; const merged=Array.from(new Set((apiList||[]).concat(fb))); return merged.length?merged:apiList; }catch(e){ return apiList; }
      }; w.__img4=1; fetchModels=w;
    }
    if(typeof loadModels==='function'&&!loadModels.__img4){ ORIG.loadModels=loadModels;
      const _lm=loadModels;
      const w=async function(){ const r=await _lm.apply(this,arguments); try{ ensureListed(); }catch(e){} return r; }; w.__img4=1; loadModels=w;
    }
  }

  /* ---------- image helpers ---------- */
  const isImg=f=>f&&/^image\//.test(f.type||'');
  const b64src=im=>{ const d=im&&(im.data!=null?im.data:im.b64); return d?'data:'+(im.media||'image/png')+';base64,'+d:''; };
  const toast=m=>{ try{ if(typeof showToast==='function')showToast(m); }catch(e){} };
  const readB64=f=>new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]||''); r.onerror=()=>rej(r.error); r.readAsDataURL(f); });
  function showLightbox(src){ if(!src)return; const old=D.getElementById('img4Lightbox'); if(old)old.remove();
    const ov=D.createElement('div'); ov.id='img4Lightbox'; ov.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out';
    const im=D.createElement('img'); im.src=src; im.style.cssText='max-width:92vw;max-height:92vh;border-radius:10px;box-shadow:0 10px 44px rgba(0,0,0,.65);background:#111'; ov.appendChild(im);
    const close=()=>{ ov.remove(); D.removeEventListener('keydown',onKey); }; const onKey=e=>{ if(e.key==='Escape')close(); };
    ov.addEventListener('click',close); D.addEventListener('keydown',onKey); D.body.appendChild(ov);
  }
  async function addFiles(list){ const files=Array.from(list||[]).filter(isImg); let added=0,skip=0;
    for(const f of files){ if(W.__pendingImages.length>=CFG.maxCount||(f.size||0)>CFG.maxBytes){skip++;continue;} try{ W.__pendingImages.push({data:await readB64(f),media:f.type||'image/png',name:f.name||'image',size:f.size||0}); added++; }catch(e){skip++;} }
    renderChips(); if(skip)toast('⚠️ '+skip+' image(s) skipped'); return added; }
  W.__attachImage=(b64,media,name)=>{ W.__pendingImages.push({data:b64,media:media||'image/png',name:name||'image',size:(b64||'').length}); renderChips(); };
  function clearPending(){ W.__pendingImages=[]; renderChips(); }

  function buildUI(){
    if(D.getElementById('img4AttachBtn'))return;
    const E=(typeof els!=='undefined')?els:{}, input=E.messageInput||D.getElementById('messageInput'), sendBtn=E.sendBtn||D.getElementById('sendBtn'), bar=E.bottomBar||(input&&input.parentElement)||D.querySelector('.input-area');
    const fi=D.createElement('input'); fi.type='file'; fi.accept='image/*'; fi.multiple=true; fi.style.display='none'; fi.id='img4AttachInput'; D.body.appendChild(fi);
    const btn=D.createElement('button'); btn.id='img4AttachBtn'; btn.type='button'; btn.title='Attach image(s) — multi-select / drag / paste'; btn.textContent='🖼️'; btn.style.cssText='cursor:pointer;background:transparent;border:1px solid var(--border,#555);border-radius:12px;padding:8px 10px;font-size:1rem;flex-shrink:0';
    if(sendBtn&&sendBtn.parentElement)sendBtn.parentElement.insertBefore(btn,sendBtn); else if(bar)bar.appendChild(btn);
    const chips=D.createElement('div'); chips.id='img4Chips'; chips.style.cssText='display:flex;flex-wrap:wrap;gap:6px;padding:6px 14px 0;';
    if(input&&input.parentElement)input.parentElement.insertBefore(chips,input); else if(bar)bar.insertBefore(chips,bar.firstChild);
    btn.addEventListener('click',()=>fi.click()); fi.addEventListener('change',()=>{ addFiles(fi.files); fi.value=''; });
    const zone=bar||D.body;
    zone.addEventListener('dragover',e=>{ if(e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],'Files')>=0){ e.preventDefault(); zone.style.outline='2px dashed var(--accent,#5b8def)'; } });
    zone.addEventListener('dragleave',()=>{ zone.style.outline=''; });
    zone.addEventListener('drop',e=>{ if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length){ e.preventDefault(); zone.style.outline=''; addFiles(e.dataTransfer.files); } });
    if(input)input.addEventListener('paste',e=>{ const it=e.clipboardData&&e.clipboardData.items; if(!it)return; const fs=[]; for(const x of it) if(x.kind==='file'&&/^image\//.test(x.type)){ const f=x.getAsFile(); if(f)fs.push(f); } if(fs.length){ e.preventDefault(); addFiles(fs); } });
  }
  function renderChips(){ const chips=D.getElementById('img4Chips'); if(!chips)return; chips.innerHTML='';
    W.__pendingImages.forEach((im,idx)=>{ const src=b64src(im); if(!src)return;
      const w=D.createElement('div'); w.style.cssText='position:relative;width:44px;height:44px;';
      const t=D.createElement('img'); t.src=src; t.title=im.name||''; t.style.cssText='width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid var(--border,#555);display:block;cursor:zoom-in'; t.addEventListener('click',()=>showLightbox(src));
      const x=D.createElement('button'); x.type='button'; x.textContent='×'; x.title='remove'; x.style.cssText='position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:none;background:var(--danger,#e0556a);color:#fff;font-size:12px;line-height:1;cursor:pointer;padding:0'; x.addEventListener('click',()=>{ W.__pendingImages.splice(idx,1); renderChips(); });
      w.appendChild(t); w.appendChild(x); chips.appendChild(w); }); }
  function renderMsgImages(el,node){ try{ const v=node&&node.versions&&node.versions[node.activeVersion||0]; const imgs=v&&v.images; if(!imgs||!imgs.length||!el)return; const bubble=el.querySelector('.bubble'); if(!bubble||bubble.querySelector('.msg-attachments'))return;
    const wrap=D.createElement('div'); wrap.className='msg-attachments'; wrap.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 8px;';
    imgs.forEach(im=>{ const src=b64src(im); if(!src)return; const img=D.createElement('img'); img.src=src; img.loading='lazy'; img.style.cssText='max-width:'+CFG.thumb+'px;max-height:'+CFG.thumb+'px;border-radius:8px;border:1px solid var(--border,#555);display:block;cursor:zoom-in'; img.title='Attached image — base64, '+Math.round((im.data||'').length/1024)+' KB (click to enlarge)'; img.addEventListener('click',()=>showLightbox(src)); wrap.appendChild(img); });
    if(wrap.children.length) bubble.insertBefore(wrap,bubble.firstChild); }catch(e){} }
  function buildAnthropic(messages){ const sys=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n'); const toParts=c=>Array.isArray(c)?c:[{type:'text',text:String(c==null?'':c)}];
    const seq=messages.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({role:m.role,parts:toParts(m.content)})); const merged=[];
    for(const m of seq){ const last=merged[merged.length-1]; if(last&&last.role===m.role)last.parts=last.parts.concat(m.parts); else merged.push({role:m.role,parts:m.parts.slice()}); }
    if(!merged.length||merged[0].role!=='user')merged.unshift({role:'user',parts:[{type:'text',text:'(start)'}]});
    return {system:sys,messages:merged.map(m=>({role:m.role,content:m.parts}))}; }

  function installHooks(){
    if(typeof createNode==='function'&&!createNode.__img4){ ORIG.createNode=createNode; const _n=createNode; const w=function(role,rawContent,thinking,parentId,isGenerating){ const node=_n.apply(this,arguments); try{ if(role==='user'&&W.__pendingImages.length){ const v=node.versions[node.activeVersion||0]; v.images=W.__pendingImages.map(x=>({media:x.media||'image/png',data:x.data,name:x.name||'image'})); } }catch(e){} return node; }; w.__img4=1; createNode=w; }
    if(typeof createMessageDOM==='function'&&!createMessageDOM.__img4){ ORIG.createMessageDOM=createMessageDOM; const _c=createMessageDOM; const w=function(node,isLatest){ const el=_c.apply(this,arguments); try{ renderMsgImages(el,node); }catch(e){} return el; }; w.__img4=1; createMessageDOM=w; }
    if(typeof buildAPIMessages==='function'&&!buildAPIMessages.__img4){ ORIG.buildAPIMessages=buildAPIMessages; const _b=buildAPIMessages; const w=function(targetPath,r,msgs){ const out=_b.apply(this,arguments); try{ const imgs=W.__pendingImages; if(imgs.length){ const parts=imgs.map(x=>({type:'image',source:{type:'base64',media_type:x.media||'image/png',data:x.data}})); let done=false; for(let i=out.length-1;i>=0;i--){ if(out[i].role==='user'){ const txt=(typeof out[i].content==='string'?out[i].content:'')||'Describe the image(s).'; out[i]={role:'user',content:[{type:'text',text:txt},...parts]}; done=true; break; } } if(!done)out.push({role:'user',content:[{type:'text',text:'Describe the image(s).'},...parts]}); } }catch(e){} return out; }; w.__img4=1; buildAPIMessages=w; }
    if(typeof executeAPI==='function'&&!executeAPI.__img4){ ORIG.executeAPI=executeAPI; const _e=executeAPI; const w=async function(messages,node,vIndex,controller,r){ r=r||(typeof run==='function'?run():{}); const hasImg=Array.isArray(messages)&&messages.some(m=>Array.isArray(m.content)); if(!hasImg||!W.__pendingImages.length)return _e.apply(this,arguments);
      try{ const p=r.p,key=getApiKey(p.id),built=buildAnthropic(messages),body={model:r.m,max_tokens:4096,messages:built.messages}; if(built.system)body.system=built.system; node.versions[vIndex].startTime=Date.now();
        const res=await fetch(p.baseURL+'/anthropic/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','Authorization':'Bearer '+key},body:JSON.stringify(body),signal:controller.signal});
        if(!res.ok){ const t=(await res.text()).trim(); throw new Error('HTTP '+res.status+'\n'+t); }
        const data=await res.json(); const text=(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join(''), think=(data.content||[]).filter(c=>c.type==='thinking').map(c=>c.thinking).join('');
        node.versions[vIndex].rawContent=text; node.versions[vIndex].thinking=think; node.lastUpdateTime=Date.now();
        try{ if(typeof applyResponseMetadata==='function'&&typeof usageFamilies!=='undefined')applyResponseMetadata(node.versions[vIndex],data.usage||{},Object.assign({},r,{usageFamily:'anthropic',usageMap:usageFamilies.anthropic.usageMap})); }catch(e){}
        try{ handleNewContent(text.length+think.length,true); }catch(e){} try{ await saveStreamBuffer(node,vIndex); }catch(e){} node.versions[vIndex].endTime=Date.now(); try{ finalizeGeneration(node,vIndex,controller); }catch(e){} clearPending(); return 1;
      }catch(err){ const ver=node.versions[vIndex]; ver.isDead=true; ver.endTime=Date.now(); ver.errorIcon='⚠️'; ver.errorText='Vision error: '+err.message; try{ toast('⚠️ Vision error: '+err.message); }catch(e){} try{ finalizeGeneration(node,vIndex,controller); }catch(e){} } }; w.__img4=1; executeAPI=w; }
  }

  function apply(){
    replaceProvider(); hook96(); patchModelLoaders(); ensureListed();
    if(!W.__eval1){ let n=0; const iv=setInterval(()=>{ if(W.__eval1){ clearInterval(iv); replaceProvider(); hook96(); ensureListed(); } if(++n>240)clearInterval(iv); },500); }
    try{ buildUI(); renderChips(); installHooks(); }catch(e){}
  }
  function disable(){
    try{ ['createNode','createMessageDOM','buildAPIMessages','executeAPI','fetchModels','loadModels'].forEach(k=>{ if(ORIG[k]){ try{ eval(k+'=ORIG[k]'); }catch(e){} } }); }catch(e){}
    ['img4AttachBtn','img4AttachInput','img4Chips','img4Lightbox'].forEach(id=>{ const el=D.getElementById(id); if(el)el.remove(); }); W.__pendingImages=[];
  }
  W.__image4={ version:'4.0.0', apply, disable, cfg:CFG, addFiles, clear:clearPending, lightbox:showLightbox, _buildAnthropic:buildAnthropic, models:M_BASE, expire:M_EXPIRE, replaceProvider, expireActive };
  apply();
  try{ console.log('[image4 v4.0.0] installed'); }catch(e){}
})();
