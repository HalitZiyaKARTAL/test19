{
  "meta": {
    "name": "scaffolding1C",
    "built": "from 97C2.js (GitHub) + C branch conformance",
    "date": "2026-09-06T10:24:17.199Z",
    "note": "C sibling scaffolding: O6 prices->TAB adapter + 14-case conformance list. (Parser core lives in C branch msg 204 / future repo slice.)"
  },
  "modules": {
    "adoptPrices": "/* O6 — prices adapter: mirror provider model prices -> engine TAB (legacy/off/peak) + sched */\n  const adoptPrices = function(){ try {\n    const PE = window.__pricingEngine; if (!PE || !PE.tables) return;\n    Object.keys(providers || {}).forEach(function(id){ const p = providers[id]; if (!p) return;\n      let mids; try { mids = (typeof modelEntries === 'function') ? modelEntries(p).map(function(x){ return x[0]; }) : Object.keys(p.fallbackModels || {}); } catch(e){ mids = Object.keys(p.fallbackModels || {}); }\n      mids.forEach(function(mid){ const md = p.fallbackModels && p.fallbackModels[mid];\n        const prices = (md && md.prices) || p.prices; if (!prices) return;\n        const pick = function(b){ const e = Array.isArray(prices[b]) ? prices[b][0] : prices[b]; return e || null; };\n        const base = pick('base'), off = pick('off') || base, pk = pick('peak');\n        const num = function(e, f){ const t = e && e.table; const v = t ? (t[f] != null ? Number(t[f]) : NaN) : NaN; return Number.isFinite(v) ? v : NaN; };\n        const o = function(e){ const r = {}; ['inputCacheHit','inputCacheMiss','output'].forEach(function(f){ const v = num(e, f);\n          r[f] = Number.isFinite(v) ? v : (f === 'inputCacheHit' ? 7e-9 : f === 'inputCacheMiss' ? 2.2e-7 : 6.6e-7); }); return r; };\n        const T = PE.tables;\n        if (base) T.legacy[mid] = o(base);\n        if (off) T.off[mid] = o(off);\n        if (pk) T.peak[mid] = o(pk);\n        const cond = pk && (pk.condition || pk.cond); const kind = cond && (cond.kind || cond.schedule);\n        if (typeof kind === 'string' && /24hour|168|week|day/.test(kind) && PE.registerSched) {\n          try { PE.registerSched(mid, [ { kind:'week', days:[1,2,3,4,5], from:3600000, to:14400000, state:'peak' },\n                                        { kind:'week', days:[1,2,3,4,5], from:21600000, to:36000000, state:'peak' } ]); } catch(e){}\n        }\n      });\n    });\n  } catch(e){} };\n  setTimeout(adoptPrices, 2600);\n  adoptPrices();\n\n  NS97.__97C2 = { version:'4.12.0', label:'97C2',\n    overlay: 'O1 capture-watch(closest) · O2 eval-restore(+EGG) · O3 reinstall(sched+pricing+install) · O4 modelEntries-sync · O5 inclusive-day smoke · O6 prices adapter',\n    smoke: { total: smoke.length, passed: smoke.length - f.length, failed: f.length, fails: f.map(function(x){ return x.t; }) },\n    instance: inst.id, api: { reinstall: reinstall, syncCorrect: syncCorrect, adoptPrices: adoptPrices, inDay: inDay, inHour: inHour } };\n  try { console.warn('[97C2] overlay installed (O1-O6)'); } catch(e){}\n})();\n\n"
  },
  "conformance14": [
    "Mon08 peak 2x",
    "Fri18 peak 2x (inclusive-day)",
    "Mon13 off",
    "Sat10 off",
    "promo single-category net 1",
    "ovl 2x0.25=0.5",
    "cross-model 2x flash peak",
    "cycle 0+⚠️",
    ">=2 categories highest+⚠️",
    "exclusive",
    "parent-field inherit",
    "minimal base",
    "empty silent",
    "parseLit $/¢/€"
  ],
  "usage": "localStorage.getItem(\"scaffolding1C\") -> JSON.parse -> modules.adoptPrices = C2 O6 code"
}
