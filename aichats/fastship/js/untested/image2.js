/* ============================================================================
   image1.js  v1.0.0 — image input for the AI Chat app (paste once at eval)
   • multi-image: picker multi-select · drag&drop · clipboard paste · per-image ✕
   • stored as BASE64 on the message + rendered in the bubble + in-page lightbox
   • image turns route to DeepSeek's Anthropic-compatible endpoint (only shape
     that accepts images); roles sanitized; usage/cost recorded
   • idempotent, additive, guarded. Safe over the app (96/97 before OR after).
   • W.__image1.disable() fully removes it.
   ========================================================================== */
(() => {
  const W = window, D = document;
  if (W.__image1) { try { W.__image1.apply(); } catch(e){} return; }

  const CFG = { maxBytes: 12 * 1024 * 1024, thumb: 240, maxCount: 12 };
  W.__pendingImages = W.__pendingImages || [];

  const isImg   = f => f && /^image\//.test(f.type || '');
  const b64src  = im => 'data:' + (im.media || 'image/png') + ';base64,' + im.data;
  const toast   = m => { try { if (typeof showToast === 'function') showToast(m); } catch(e){} };
  const readB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

  /* ---------- in-page lightbox ---------- */
  function showLightbox(src){
    const old = D.getElementById('img1Lightbox'); if (old) old.remove();
    const ov = D.createElement('div'); ov.id = 'img1Lightbox';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out';
    const im = D.createElement('img'); im.src = src;
    im.style.cssText = 'max-width:92vw;max-height:92vh;border-radius:10px;box-shadow:0 10px 44px rgba(0,0,0,.65);background:#111';
    ov.appendChild(im);
    const close = () => { ov.remove(); D.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    ov.addEventListener('click', close); D.addEventListener('keydown', onKey);
    D.body.appendChild(ov);
  }
  W.__showLightbox = showLightbox;

  /* ---------- collect (multi) ---------- */
  async function addFiles(list){
    const files = Array.from(list || []).filter(isImg);
    let added = 0, skipped = 0;
    for (const f of files){
      if (W.__pendingImages.length >= CFG.maxCount || (f.size || 0) > CFG.maxBytes){ skipped++; continue; }
      try { W.__pendingImages.push({ b64: await readB64(f), media: f.type || 'image/png', name: f.name || 'image', size: f.size || 0 }); added++; }
      catch(e){ skipped++; }
    }
    renderChips();
    if (skipped) toast('⚠️ ' + skipped + ' image(s) skipped');
    return added;
  }
  W.__attachImage = (b64, media, name) => { W.__pendingImages.push({ b64, media: media || 'image/png', name: name || 'image', size: (b64||'').length }); renderChips(); };
  function clearPending(){ W.__pendingImages = []; renderChips(); }

  /* ---------- composer UI ---------- */
  function buildUI(){
    if (D.getElementById('img1AttachBtn')) return;
    const E = (typeof els !== 'undefined') ? els : {};
    const input = E.messageInput || D.getElementById('messageInput');
    const sendBtn = E.sendBtn || D.getElementById('sendBtn');
    const bar = E.bottomBar || (input && input.parentElement) || D.querySelector('.input-area');

    const fi = D.createElement('input'); fi.type='file'; fi.accept='image/*'; fi.multiple=true; fi.style.display='none'; fi.id='img1AttachInput';
    D.body.appendChild(fi);

    const btn = D.createElement('button'); btn.id='img1AttachBtn'; btn.type='button'; btn.title='Attach image(s) — multi-select / drag / paste'; btn.textContent='🖼️';
    btn.style.cssText='cursor:pointer;background:transparent;border:1px solid var(--border,#555);border-radius:12px;padding:8px 10px;font-size:1rem;flex-shrink:0';
    if (sendBtn && sendBtn.parentElement) sendBtn.parentElement.insertBefore(btn, sendBtn); else if (bar) bar.appendChild(btn);

    const chips = D.createElement('div'); chips.id='img1Chips';
    chips.style.cssText='display:flex;flex-wrap:wrap;gap:6px;padding:6px 14px 0;';
    if (input && input.parentElement) input.parentElement.insertBefore(chips, input); else if (bar) bar.insertBefore(chips, bar.firstChild);

    btn.addEventListener('click', () => fi.click());
    fi.addEventListener('change', () => { addFiles(fi.files); fi.value=''; });

    const zone = bar || D.body;
    zone.addEventListener('dragover', e => { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types||[], 'Files') >= 0){ e.preventDefault(); zone.style.outline='2px dashed var(--accent,#5b8def)'; } });
    zone.addEventListener('dragleave', () => { zone.style.outline=''; });
    zone.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length){ e.preventDefault(); zone.style.outline=''; addFiles(e.dataTransfer.files); } });

    if (input) input.addEventListener('paste', e => {
      const items = e.clipboardData && e.clipboardData.items; if (!items) return;
      const files = []; for (const it of items) if (it.kind === 'file' && /^image\//.test(it.type)){ const f = it.getAsFile(); if (f) files.push(f); }
      if (files.length){ e.preventDefault(); addFiles(files); }
    });
  }
  function renderChips(){
    const chips = D.getElementById('img1Chips'); if (!chips) return;
    chips.innerHTML = '';
    W.__pendingImages.forEach((im, idx) => {
      const w = D.createElement('div'); w.style.cssText='position:relative;width:44px;height:44px;';
      const t = D.createElement('img'); t.src=b64src(im); t.title=im.name||''; t.style.cssText='width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid var(--border,#555);display:block;cursor:zoom-in';
      t.addEventListener('click', () => showLightbox(t.src));
      const x = D.createElement('button'); x.type='button'; x.textContent='×'; x.title='remove';
      x.style.cssText='position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;border:none;background:var(--danger,#e0556a);color:#fff;font-size:12px;line-height:1;cursor:pointer;padding:0';
      x.addEventListener('click', () => { W.__pendingImages.splice(idx,1); renderChips(); });
      w.appendChild(t); w.appendChild(x); chips.appendChild(w);
    });
  }

  /* ---------- render N images in a message bubble ---------- */
  function renderMsgImages(el, node){
    try {
      const v = node && node.versions && node.versions[node.activeVersion || 0];
      const imgs = v && v.images; if (!imgs || !imgs.length || !el) return;
      const bubble = el.querySelector('.bubble'); if (!bubble || bubble.querySelector('.msg-attachments')) return;
      const wrap = D.createElement('div'); wrap.className='msg-attachments';
      wrap.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 8px;';
      imgs.forEach(im => {
        const img = D.createElement('img'); img.src=b64src(im); img.loading='lazy';
        img.style.cssText='max-width:'+CFG.thumb+'px;max-height:'+CFG.thumb+'px;border-radius:8px;border:1px solid var(--border,#555);display:block;cursor:zoom-in';
        img.title='Attached image — base64, ' + Math.round((im.data||'').length/1024) + ' KB (click to enlarge)';
        img.addEventListener('click', () => showLightbox(img.src));
        wrap.appendChild(img);
      });
      bubble.insertBefore(wrap, bubble.firstChild);
    } catch(e){}
  }

  /* ---------- pure: build Anthropic payload (sanitized roles + N image blocks) ---------- */
  function buildAnthropic(messages){
    const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const toParts = c => Array.isArray(c) ? c : [{ type:'text', text:String(c == null ? '' : c) }];
    const seq = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role:m.role, parts:toParts(m.content) }));
    const merged = [];
    for (const m of seq){ const last = merged[merged.length-1]; if (last && last.role === m.role) last.parts = last.parts.concat(m.parts); else merged.push({ role:m.role, parts:m.parts.slice() }); }
    if (!merged.length || merged[0].role !== 'user') merged.unshift({ role:'user', parts:[{ type:'text', text:'(start)' }] });
    return { system: sys, messages: merged.map(m => ({ role:m.role, content:m.parts })) };
  }

  /* ---------- hooks ---------- */
  const ORIG = {};
  function installHooks(){
    if (typeof createNode === 'function' && !createNode.__img1){
      ORIG.createNode = createNode; const _n = createNode;
      const w = function(role, rawContent, thinking, parentId, isGenerating){
        const node = _n.apply(this, arguments);
        try { if (role === 'user' && W.__pendingImages.length){ const v = node.versions[node.activeVersion || 0]; v.images = W.__pendingImages.map(x => ({ media:x.media||'image/png', data:x.b64, name:x.name||'image' })); } } catch(e){}
        return node;
      }; w.__img1 = 1; createNode = w;
    }
    if (typeof createMessageDOM === 'function' && !createMessageDOM.__img1){
      ORIG.createMessageDOM = createMessageDOM; const _c = createMessageDOM;
      const w = function(node, isLatest){ const el = _c.apply(this, arguments); try { renderMsgImages(el, node); } catch(e){} return el; };
      w.__img1 = 1; createMessageDOM = w;
    }
    if (typeof buildAPIMessages === 'function' && !buildAPIMessages.__img1){
      ORIG.buildAPIMessages = buildAPIMessages; const _b = buildAPIMessages;
      const w = function(targetPath, r, msgs){
        const out = _b.apply(this, arguments);
        try {
          const imgs = W.__pendingImages;
          if (imgs.length){
            const parts = imgs.map(x => ({ type:'image', source:{ type:'base64', media_type:x.media||'image/png', data:x.b64 } }));
            let done = false;
            for (let i = out.length-1; i >= 0; i--){ if (out[i].role === 'user'){ const txt = (typeof out[i].content === 'string' ? out[i].content : '') || 'Describe the image(s).'; out[i] = { role:'user', content:[ { type:'text', text:txt }, ...parts ] }; done = true; break; } }
            if (!done) out.push({ role:'user', content:[ { type:'text', text:'Describe the image(s).' }, ...parts ] });
          }
        } catch(e){}
        return out;
      }; w.__img1 = 1; buildAPIMessages = w;
    }
    if (typeof executeAPI === 'function' && !executeAPI.__img1){
      ORIG.executeAPI = executeAPI; const _e = executeAPI;
      const w = async function(messages, node, vIndex, controller, r){
        r = r || (typeof run === 'function' ? run() : {});
        const hasImg = Array.isArray(messages) && messages.some(m => Array.isArray(m.content));
        if (!hasImg || !W.__pendingImages.length) return _e.apply(this, arguments);
        try {
          const p = r.p, key = getApiKey(p.id);
          const built = buildAnthropic(messages);
          const body = { model:r.m, max_tokens:4096, messages:built.messages }; if (built.system) body.system = built.system;
          node.versions[vIndex].startTime = Date.now();
          const res = await fetch(p.baseURL + '/anthropic/v1/messages', { method:'POST', headers:{ 'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','Authorization':'Bearer '+key }, body:JSON.stringify(body), signal:controller.signal });
          if (!res.ok){ const t = (await res.text()).trim(); throw new Error('HTTP ' + res.status + '\n' + t); }
          const data = await res.json();
          const text = (data.content||[]).filter(c => c.type === 'text').map(c => c.text).join('');
          const think = (data.content||[]).filter(c => c.type === 'thinking').map(c => c.thinking).join('');
          node.versions[vIndex].rawContent = text; node.versions[vIndex].thinking = think; node.lastUpdateTime = Date.now();
          try { if (typeof applyResponseMetadata === 'function' && typeof usageFamilies !== 'undefined') applyResponseMetadata(node.versions[vIndex], data.usage || {}, Object.assign({}, r, { usageFamily:'anthropic', usageMap: usageFamilies.anthropic.usageMap })); } catch(e){}
          try { handleNewContent(text.length + think.length, true); } catch(e){}
          try { await saveStreamBuffer(node, vIndex); } catch(e){}
          node.versions[vIndex].endTime = Date.now();
          try { finalizeGeneration(node, vIndex, controller); } catch(e){}
          clearPending(); return 1;
        } catch(err){
          const ver = node.versions[vIndex]; ver.isDead = true; ver.endTime = Date.now(); ver.errorIcon='⚠️'; ver.errorText='Vision error: ' + err.message;
          try { toast('⚠️ Vision error: ' + err.message); } catch(e){}
          try { finalizeGeneration(node, vIndex, controller); } catch(e){}
        }
      }; w.__img1 = 1; executeAPI = w;
    }
  }

  function apply(){ try { buildUI(); renderChips(); installHooks(); } catch(e){} }
  function disable(){
    try { if (ORIG.createNode) createNode = ORIG.createNode; if (ORIG.createMessageDOM) createMessageDOM = ORIG.createMessageDOM; if (ORIG.buildAPIMessages) buildAPIMessages = ORIG.buildAPIMessages; if (ORIG.executeAPI) executeAPI = ORIG.executeAPI; } catch(e){}
    ['img1AttachBtn','img1AttachInput','img1Chips','img1Lightbox'].forEach(id => { const el = D.getElementById(id); if (el) el.remove(); });
    W.__pendingImages = [];
  }
  W.__image1 = { version:'1.0.0', apply, disable, cfg:CFG, addFiles, clear:clearPending, lightbox:showLightbox, _buildAnthropic:buildAnthropic };
  apply();
  try { console.log('[image1 v1.0.0] installed — multi-image ready'); } catch(e){}
})();
