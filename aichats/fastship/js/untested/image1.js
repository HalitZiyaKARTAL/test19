/* 97.js — include the DeepSeek v4.1 models ("you") in the provider JSON + 96.js replace logic.
   Order-independent (96 before OR after), idempotent, additive-only. */
(() => {
  const W = window;
  if (W.__v41patch) { try { W.__v41patch(); } catch(e){} return; }

  const MODELS = {
    'deepseek-v4.1-flash': {
      maxTokens:384000, contextTokens:1000000, outputTokens:384000, temperature:1,
      request:{ thinking:{ type:'enabled' }, reasoning_effort:'high' },
      pricing:{ inputCacheHit:2.8e-9, inputCacheMiss:1.4e-7, output:5.6e-7 },
      rates:{ legacy:{ inputCacheHit:2.8e-9, inputCacheMiss:1.4e-7, output:2.8e-7 },
              off:   { inputCacheHit:2.8e-9, inputCacheMiss:1.4e-7, output:5.6e-7 },
              peak:  { inputCacheHit:5.6e-9, inputCacheMiss:2.8e-7, output:1.12e-6 } }
    },
    'deepseek-v4.1-flash-expires-on-0910': {
      maxTokens:384000, contextTokens:1000000, outputTokens:384000, temperature:1,
      request:{ thinking:{ type:'enabled' }, reasoning_effort:'high' },
      pricing:{ inputCacheHit:7e-9, inputCacheMiss:2.2e-7, output:6.6e-7 },
      rates:{ legacy:{ inputCacheHit:2.8e-9, inputCacheMiss:1.4e-7, output:2.8e-7 },
              off:   { inputCacheHit:7e-9, inputCacheMiss:2.2e-7, output:6.6e-7 },
              peak:  { inputCacheHit:1.4e-8, inputCacheMiss:4.4e-7, output:1.32e-6 } }
    }
  };
  const SCHED = [
    { kind:'week', days:[1,2,3,4,5], from:3600000,  to:14400000, state:'peak' },
    { kind:'week', days:[1,2,3,4,5], from:21600000, to:36000000, state:'peak' }
  ];
  const WINDOWS = [[1,4],[6,10]], EPOCH = 1786896000000;
  const clone = o => JSON.parse(JSON.stringify(o));
  const ids = Object.keys(MODELS);

  function fill(p){
    if (!p || typeof p !== 'object') return false;
    p.fallbackModels = p.fallbackModels || {};
    let ch = false;
    ids.forEach(id => {
      const def = MODELS[id], m = p.fallbackModels[id];
      if (!m) { p.fallbackModels[id] = Object.assign({ id }, clone(def)); ch = true; }
      else {
        if (!m.rates)      { m.rates = clone(def.rates);      ch = true; }
        if (!m.request)    { m.request = clone(def.request);  ch = true; }
        if (m.pricing == null) { m.pricing = clone(def.pricing); ch = true; }
      }
    });
    if (p.sched == null || p.sched === 'default') { p.sched = clone(SCHED); ch = true; }
    if (!Array.isArray(p.windows)) { p.windows = clone(WINDOWS); ch = true; }
    if (p.epoch == null) { p.epoch = EPOCH; ch = true; }
    return ch;
  }

  /* 96.js exposes CANON (replace logic) + DATA (pricing mirror); inject additively */
  function inject(ns){
    if (!ns) return false;
    let ch = false;
    try { const C = ns.providerDefaults && ns.providerDefaults.deepseek;
      if (C) { C.fallbackModels = C.fallbackModels || {};
        ids.forEach(id => { if (!C.fallbackModels[id]) { C.fallbackModels[id] = Object.assign({ id }, clone(MODELS[id])); ch = true; } }); } } catch(e){}
    try { const D = ns.pricingJSONData && ns.pricingJSONData.deepseek;
      if (D) { D.rates = D.rates || {};
        ids.forEach(id => { if (!D.rates[id]) { D.rates[id] = clone(MODELS[id].rates); ch = true; } }); } } catch(e){}
    return ch;
  }

  /* live provider JSON — only when source is default/undefined ("unless source is non default") */
  function live(){
    let ch = false;
    try {
      if (typeof providers === 'undefined' || !providers || !providers.deepseek) return false;
      const p = providers.deepseek;
      if (p.source && p.source !== 'default') return false;
      ch = fill(p);
      if (ch) { try { localStorage.setItem('dse_providers', JSON.stringify(providers)); } catch(e){} }
    } catch(e){}
    return ch;
  }

  function run(){
    const ns = W.__eval1;
    let ch = inject(ns);
    ch = live() || ch;
    try { if (ns && typeof ns.syncPricing === 'function') ns.syncPricing(); } catch(e){}
    return ch;
  }

  /* arm an accessor so a later 96.js assignment triggers injection (no polling) */
  function arm(ns, key){
    if (!ns) return;
    try {
      const d = Object.getOwnPropertyDescriptor(ns, key);
      if (d && d.set) { inject(ns); return; }
      let val = ns[key];
      Object.defineProperty(ns, key, {
        configurable:true, enumerable:true,
        get(){ return val; },
        set(v){ val = v; try { inject(ns); } catch(e){} }
      });
      if (val) inject(ns);
    } catch(e){}
  }

  W.__v41patch = run;
  try { run(); } catch(e){}
  if (!W.__eval1) { try { W.__eval1 = {}; } catch(e){} }   // let 96.js reuse it
  arm(W.__eval1, 'providerDefaults');
  arm(W.__eval1, 'pricingJSONData');
  setTimeout(() => { try { run(); } catch(e){} }, 1800);   // catch 96 post-load state
})();
