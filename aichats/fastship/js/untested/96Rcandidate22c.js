(function(){
var __IN='5.6.3';
function __cmpVer(a,b){
  function seg(s){ s=String(s==null?'':s).trim(); if(s.charAt(0)==='v'||s.charAt(0)==='V') s=s.slice(1); var out=[],cur=''; for(var i=0;i<s.length;i++){ var c=s.charAt(i); if(c==='.'||c==='-'||c==='_'||c===' '){ if(cur){out.push(cur);cur='';} } else cur+=c; } if(cur)out.push(cur); return out; }
  function num(x){ return x!=='' && String(+x)===x && +x>=0; }
  function lead(s){ var i=0; while(i<s.length && s.charAt(i)>='0' && s.charAt(i)<='9') i++; return [ i>0 ? +s.slice(0,i) : null, s.slice(i).toLowerCase() ]; }
  var A=seg(a),B=seg(b); if(!A.length||!B.length) return null; var N=Math.max(A.length,B.length);
  for(var j=0;j<N;j++){ var x=A[j],y=B[j]; if(x===undefined) return -1; if(y===undefined) return 1; if(x===y) continue;
    if(num(x)&&num(y)){ var d=(+x)-(+y); if(d) return d<0?-1:1; continue; }
    var lx=lead(x),ly=lead(y); if((lx[0]!=null)!==(ly[0]!=null)) return null;
    if(lx[0]!=null&&ly[0]!=null&&lx[0]!==ly[0]) return lx[0]<ly[0]?-1:1; if(lx[1]!==ly[1]) return lx[1]<ly[1]?-1:1; }
  return 0;
}
function __shouldReplace(prev,inc){ if(!prev) return true; if(String(prev)===String(inc)) return true; var c=__cmpVer(prev,inc); return c===null?true:c<=0; }
window.__eval1_cmpVer=__cmpVer; window.__eval1_shouldReplace=__shouldReplace;
(function(){ var __prev=window.__eval1&&window.__eval1.version; if(__prev&&typeof window.__eval1.disable==='function'){ if(__shouldReplace(__prev,__IN)){ try{ window.__eval1.disable(); }catch(e){} window.__eval1={}; } else { window.__96R_abort=1; } } })();
var __a96R=window.__96R_abort; try{ delete window.__96R_abort; }catch(e){} if(__a96R) return;
/* ================= 96R · CORE ================= */
var R = window.__eval1 = window.__eval1 || {};
R.version = '5.6.3'; R.build = '96R22c';
R._slots = R._slots || new Map(); R._pipes = R._pipes || new Map();
R._mods  = R._mods  || new Map(); R._down  = R._down  || [];

R.get = function(name){ var s=R._slots.get(name); return s && s.fn; };
R.pipe = function(name, fn, o){ o=o||{}; var l=R._pipes.get(name)||(R._pipes.set(name,[]),R._pipes.get(name));
  if (o.id && l.some(function(x){return x.id===o.id;})) return R;
  l.push({ fn:fn, order:(o.order==null?100:o.order), id:o.id||null, owner:R._tag||R.build }); l.sort(function(a,b){return a.order-b.order;}); return R; };
R.run = function(name, v, ctx){ var l=R._pipes.get(name)||[]; for (var i=0;i<l.length;i++){ var r=l[i].fn(v,ctx); if (r!==undefined && r!==null) v=r; } return v; };
R.use = function(mod){ if (R._mods.has(mod.id)) return R;
  (mod.requires||[]).forEach(function(r){ if(!R._mods.has(r)) throw Error('96R: missing dep '+r); });
  R._tag = mod.id+'@'+(mod.version||'1'); R._mods.set(mod.id, mod);
  var down; try{ down = (mod.setup && mod.setup({ R:R })) || []; }catch(e){ R._tag=null; R._mods.delete(mod.id); throw e; }
  R._down.push(function(){ (down||[]).forEach(function(f){ try{ f(); }catch(e){} }); if (mod.teardown) mod.teardown(); });
  R._tag = null; return R; };
R.whoOwns = function(n){ var s=R._slots.get(n); return s && { owner:s.owner, at:s.at }; };
R.graph = function(){ return { version:R.version, build:R.build, mods:Array.from(R._mods.keys()),
  slots:Array.from(R._slots.keys()).map(function(k){return k+':'+R._slots.get(k).owner;}),
  pipes:Array.from(R._pipes.keys()).map(function(k){return k+'['+R._pipes.get(k).map(function(x){return x.owner+'/'+x.order;}).join(',')+']';}) }; };
R.host = (function(){
  function get(n){ try{ return eval(n); }catch(e){ return undefined; } }
  function set(n,v){ try{ if(typeof get(n)!=='undefined') eval(n+' = v'); }catch(e){} }
  var names = ['executeAPI','buildAPIMessages','formatMarkdown','buildCodeBlockHTML','applyResponseMetadata','renderFullChat','finalizeGeneration','triggerAI','resetStopBtn','updateSendBtn','saveHistory','saveHotMirror','createNode','generateAIResponse','sendMessage','run','getApiKey','getCurrentModel','fetchModels','loadModels','providers','settings'];
  var orig = {}; names.forEach(function(n){ orig[n]=get(n); });
  return { get:get, set:set, orig:orig };
})();
R.cfg = (function(){
  var DEF = { mode:'auto', webSearch:true, webSearchStyle:'tools', showSearchTrace:true, paintIntervalMs:160,
    markedSrc:'https://cdn.jsdelivr.net/npm/marked@18.0.9/lib/marked.umd.js', toolEchoCollapseChars:2000,
    thinkingHistory:'all', peakCounter:'off', toolFontScale:0.7, toolMaxTurns:100, toolMaxTurnsOn:true, autoTools:[],
    evalToolVersion:'auto', evalToolNameOverride:'', evalToolNameOverrideOn:false, agenticTools:'auto', toolCostNote:true,
    relaxedSendCriteria:false, staleHunter:false, staleHunterMs:900000, discountCounter:'off', evalInProviders:false,
    apiShapeFallback:'auto', pricingFallback:'auto', costBalance:'off', balanceSnap:false, technicalUser:false,
    autoSourceOn:true, autoSourceToken:'edited', estimate:{ on:false, limitUsd:0.05 } };
  var c; try { c = Object.assign({}, DEF, JSON.parse(localStorage.getItem('dse_96R_config')||localStorage.getItem('dse_eval1_config')||'{}')); } catch(e){ c = Object.assign({}, DEF); }
  c.estimate = Object.assign({ on:false, limitUsd:0.05 }, c.estimate||{}); if(c.toolEchoCollapseOn==null){ c.toolEchoCollapseOn=(c.toolEchoCollapseChars!==0); if(c.toolEchoCollapseChars===0) c.toolEchoCollapseChars=2000; }
  var f; try { f = Object.assign({ marked:1, anthropic:1, hybrid:1, pill:1, bridgeStream:1, tools:1 }, JSON.parse(localStorage.getItem('dse_96R_flags')||localStorage.getItem('dse_eval1_flags')||'{}')); } catch(e){ f = { marked:1, anthropic:1, hybrid:1, pill:1, bridgeStream:1, tools:1 }; }
  R.flags = f; return c;
})();
R.config = R.cfg; R.FLAGS = R.flags;
R.save = function(){ try{ localStorage.setItem('dse_96R_config', JSON.stringify(R.cfg)); localStorage.setItem('dse_96R_flags', JSON.stringify(R.flags||{})); }catch(e){} try{ localStorage.setItem('dse_eval1_config', JSON.stringify(R.cfg)); localStorage.setItem('dse_eval1_flags', JSON.stringify(R.flags||{})); }catch(e){} };
(function(){ var NEW=0.8, OLD=0.5;
  try{ if(typeof defaultSettings!=='undefined') defaultSettings.fontScale=NEW; }catch(e){}
  var cur=null; try{ cur=(typeof settings!=='undefined')?settings.fontScale:null; }catch(e){} window.__r96origFS=cur;
  if(cur==null||cur===OLD){ try{ if(typeof settings!=='undefined') settings.fontScale=NEW; }catch(e){} try{ if(typeof updateMetadata==='function') updateMetadata(function(m){ m.settings=Object.assign({}, m.settings||{}, { fontScale:NEW }); }); }catch(e){} cur=NEW; }
  var eff=(cur!=null?cur:NEW);
  try{ document.documentElement.style.setProperty('--block-font-scale', String(eff)); }catch(e){}
  try{ var el=document.getElementById('fontScale'); if(el) el.value=String(eff); }catch(e){}
  
})();

function patchHost(name, make){ var orig=R.host.orig[name]; if(typeof orig!=='function'){ console.warn('96R: host fn missing: '+name); return false; } var w=make(orig); R.host.set(name, w); R._slots.set(name,{fn:w,owner:'96R',at:Date.now()}); R[name]=w; return true; }
function patchFn(name, wrap){ var o=R.host.orig[name]; if(typeof o!=='function'){ console.warn('96R: host fn missing: '+name); return false; } var w=wrap(o); R.host.set(name,w); R._slots.set(name,{fn:w,owner:'96R',at:Date.now()}); R[name]=w; return true; }

/* ================= 96R · PRICING (provider-JSON is the only truth) ================= */
/* ================= 96R · PRICING (JSON: provider-level sched/windows/epoch + per-model rates; default JSON fallback) ================= */

function isGetterProp(o,k){ try{ var d=o&&Object.getOwnPropertyDescriptor(o,k); return !!(d&&d.get); }catch(e){ return false; } }
function providerOfModel(model){ try{ var pv=R.host.get('providers')||{}; for(var k in pv){ if(k==='custom_template') continue; var fm=pv[k]&&pv[k].fallbackModels; if(fm&&Object.prototype.hasOwnProperty.call(fm,model)) return k; } }catch(e){} return null; }
function ratesOf(p){ var out={}, fm=(p&&p.fallbackModels)||{};
  for(var m in fm){ var md=fm[m]||{}, r=md.rates;
    if(r&&(r.off||r.peak||r.legacy)){ out[m]={ legacy:(r.legacy||r.off||r.peak), off:(r.off||r.peak||r.legacy), peak:(r.peak||r.off||r.legacy) }; continue; }
    var pr=md.pricing;
    if(pr && !Array.isArray(pr.tiers) && !isGetterProp(pr,'output') && pr.inputCacheMiss!=null){ var f={inputCacheHit:pr.inputCacheHit,inputCacheMiss:pr.inputCacheMiss,output:pr.output}; out[m]={legacy:f,off:f,peak:f}; } }
  return out; }
function pricingOf(p){ var pj=(p&&p.pricing)||{};
  var ep=(p&&p.epoch!=null)?p.epoch:(pj.epoch!=null?pj.epoch:0);
  var wd=((p&&Array.isArray(p.windows)&&p.windows.length)?p.windows:((Array.isArray(pj.windows)&&pj.windows.length)?pj.windows:[]));
  var sc=((p&&Array.isArray(p.sched)&&p.sched.length)?p.sched:((Array.isArray(pj.sched)&&pj.sched.length)?pj.sched:[]));
  var out={ epoch:ep, windows:wd, sched:sc, models:{} };
  
  var rm=ratesOf(p); for(var m in rm) out.models[m]=rm[m];
  var pm=pj.models||{}; for(var m2 in pm) out.models[m2]=JSON.parse(JSON.stringify(pm[m2]));
  return out; }
R.getPricing = function(pid){ var pv=R.host.get('providers')||{}; pid = pid || (typeof activeProviderId!=='undefined' && activeProviderId) || 'deepseek'; var p=pv[pid]||{}; var _out=pricingOf(p);  return _out; };
function winSched(w){ if(!Array.isArray(w)||!w.length) return []; return w.map(function(x){ return {kind:'week',days:[1,2,3,4,5],from:(x[0]||0)*3600000,to:(x[1]!=null?x[1]:24)*3600000,state:'peak'}; }); }
function schedActive(sched, ts){ var d=new Date(ts), day=d.getUTCDay(), dom=((ts%86400000)+86400000)%86400000;
  return (sched||[]).filter(function(e){ if(!e) return false;
    if (e.kind==='once') return ts>=e.from && ts<e.to;
    if (e.kind==='year') return e.mon===d.getUTCMonth() && e.day===d.getUTCDate() && dom>=(e.from||0) && dom<(e.to||86400000);
    return ((e.days&&e.days.length)?(e.days.indexOf(day)>=0):true) && dom>=(e.from||0) && dom<(e.to||86400000); }); }
function scaleTable(t, s){ var o={inputCacheHit:t.inputCacheHit,inputCacheMiss:t.inputCacheMiss,output:t.output};
  (s||[]).forEach(function(x){ var f=(typeof x==='number')?{inputCacheHit:x,inputCacheMiss:x,output:x}:(x||{});
    o={inputCacheHit:(o.inputCacheHit||0)*(f.inputCacheHit!=null?f.inputCacheHit:1),inputCacheMiss:(o.inputCacheMiss||0)*(f.inputCacheMiss!=null?f.inputCacheMiss:1),output:(o.output||0)*(f.output!=null?f.output:1)}; }); return o; }
function effSchedFor(mid, pid){ try{ pid=pid||providerOfModel(mid)||((typeof activeProviderId!=='undefined'&&activeProviderId)||'deepseek'); var pv=R.host.get('providers')||{}, po=pv[pid]||{}, md=(po.fallbackModels&&po.fallbackModels[mid])||null; if(md&&Array.isArray(md.sched)&&md.sched.length) return md.sched; if(po.sched&&po.sched.length) return po.sched; if(po.windows&&po.windows.length) return winSched(po.windows); return (R.getPricing(pid).sched)||[]; }catch(e){ return []; } }
R.priceAt = function(model, ts, pid){ ts=ts||Date.now(); pid=pid||providerOfModel(model)||((typeof activeProviderId!=='undefined'&&activeProviderId)||'deepseek'); var P=R.getPricing(pid); var md=null, _po={};
  try{ var pv=R.host.get('providers')||{}; _po=pv[pid]||{}; md=(pv[pid]&&pv[pid].fallbackModels&&pv[pid].fallbackModels[model])||null; }catch(e){}
  if(md&&md.pricing&&Array.isArray(md.pricing.tiers)) return { bucket:'tier', conflict:false, tiers:JSON.parse(JSON.stringify(md.pricing.tiers)) };
  if (ts < ((md&&md.epoch!=null)?md.epoch:(P.epoch||0))){ var L=P.models[model]&&P.models[model].legacy; if (L) return Object.assign({bucket:'legacy',conflict:false}, L); }
  var _sched=effSchedFor(model, pid); var acts=schedActive(_sched,ts), withState=acts.filter(function(a){return a.state;}).map(function(a){return a.state;});
  var bucket='off', conflict=false; if (withState.length===1) bucket=withState[0]; else if (withState.length>1){ conflict=true; var _cost=function(s){ var t=P.models[model]&&P.models[model][s]; return t?((t.inputCacheMiss||0)+(t.output||0)):0; }; bucket=withState.slice().sort(function(a,b){return _cost(b)-_cost(a);})[0]; }
  var m=P.models[model]||{}, table=m[bucket]||m.off||null;
  var scalars=acts.filter(function(a){return a.scalar!=null;}).map(function(a){return a.scalar;});
  if (table && scalars.length) table=scaleTable(table,scalars);
  return table ? Object.assign({bucket:bucket, conflict:conflict, scalars:scalars}, table) : null; };
R.current = R.priceAt;
function installPricing(){ var pv=R.host.get('providers')||{}; for(var pid in pv){ if(pid==='custom_template') continue; var po=pv[pid]; var fm=po&&po.fallbackModels; if(!fm) continue;
  for(var mid in fm){ (function(mid,fm,pid){ var cur=fm[mid]||{}, pr=cur.pricing;
    if(Array.isArray(pr&&pr.tiers)||isGetterProp(pr,'output')) return;
    if(pr && pr.inputCacheMiss!=null && !cur.rates){ cur.rates={ legacy:{inputCacheHit:pr.inputCacheHit,inputCacheMiss:pr.inputCacheMiss,output:pr.output}, off:{inputCacheHit:pr.inputCacheHit,inputCacheMiss:pr.inputCacheMiss,output:pr.output}, peak:{inputCacheHit:pr.inputCacheHit,inputCacheMiss:pr.inputCacheMiss,output:pr.output} }; }
    var d={}; Object.defineProperties(d,{ inputCacheHit:{ get:function(){ var t=R.priceAt(mid, undefined, pid); return t?t.inputCacheHit:undefined; }, enumerable:true, configurable:true }, inputCacheMiss:{ get:function(){ var t=R.priceAt(mid, undefined, pid); return t?t.inputCacheMiss:undefined; }, enumerable:true, configurable:true }, output:{ get:function(){ var t=R.priceAt(mid, undefined, pid); return t?t.output:undefined; }, enumerable:true, configurable:true } }); fm[mid].pricing=d; })(mid,fm,pid); } } }

installPricing();

/* ================= 96R · FETCH (helpers + coalescer + anthropic + responses + chain) ================= */
var NL = String.fromCharCode(10);
R.stats = R.stats || { transformed:0, passthrough:0, searchCalls:0, last:{} };
var esc = function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
var chunk = function(delta){ return { choices:[{ delta:delta }] }; };
var encodeText = function(s){ return new TextEncoder().encode(s); };
var cloneHeaders = function(h){ if(!h) return {}; if(typeof Headers!=='undefined'&&h instanceof Headers){ var o={}; h.forEach(function(v,k){o[k]=v;}); return o; } return Object.assign({},h); };
var at = function(o,k){ return String(k).split('.').reduce(function(a,x){ return a==null?undefined:a[x]; }, o); };
R._origFetch = window.fetch.bind(window);
function makeCoalescedStream(sourceBody, translate){
  return new ReadableStream({ start: function(controller){
    var reader=sourceBody.getReader(), dec=new TextDecoder();
    var buffer='', closed=false, timer=0; var acc={content:'',reasoning:''};
    function enqueue(t){ if(!closed){ try{ controller.enqueue(encodeText(t)); }catch(e){} } }
    function flushAcc(){ if(timer){ clearTimeout(timer); timer=0; } if(acc.content||acc.reasoning){ var d={}; if(acc.content)d.content=acc.content; if(acc.reasoning)d.reasoning_content=acc.reasoning; enqueue('data: '+JSON.stringify(chunk(d))+NL+NL); acc.content=''; acc.reasoning=''; } }
    function scheduleFlush(){ if(timer) return; if(document.visibilityState==='hidden'){ flushAcc(); return; } timer=setTimeout(function(){ timer=0; flushAcc(); }, R.cfg.paintIntervalMs||160); }
    function finish(){ if(closed) return; flushAcc(); enqueue('data: [DONE]'+NL+NL); closed=true; try{ controller.close(); }catch(e){} }
    function handleBlock(block){ var data=''; (block.split(/\r?\n/)||[]).forEach(function(line){ if(line.indexOf('data:')===0) data += (data?NL:'')+line.slice(5).replace(/^\s+/,''); });
      if(!data||data==='[DONE]'){ if(data==='[DONE]') finish(); return; }
      var ev; try{ ev=JSON.parse(data); }catch(e){ return; }
      var out; try{ out=translate?translate(ev):ev; }catch(e){ out={error:e}; }
      if(!out) return;
      if(out.error){ if(out.usage){ flushAcc(); enqueue('data: '+JSON.stringify({choices:[{delta:{}}],usage:out.usage})+NL+NL); } if(!closed){ closed=true; try{ controller.error(out.error); }catch(e){} } return; }
      if(out.finish){ if(out.usage){ flushAcc(); enqueue('data: '+JSON.stringify({choices:[{delta:{}}],usage:out.usage})+NL+NL); } finish(); return; }
      var d=(out.choices&&out.choices[0]&&out.choices[0].delta)||{};
      if(d.content){ acc.content+=d.content; scheduleFlush(); }
      if(d.reasoning_content){ acc.reasoning+=d.reasoning_content; scheduleFlush(); }
      if(d.tool_calls){ flushAcc(); enqueue('data: '+JSON.stringify(out)+NL+NL); }
      if(out.usage){ flushAcc(); enqueue('data: '+JSON.stringify({choices:[{delta:{}}],usage:out.usage})+NL+NL); }
    }
    function pump(){ reader.read().then(function(res){ if(closed){ try{ reader.cancel(); }catch(e){} return; } if(res.done){ finish(); return; } buffer+=dec.decode(res.value,{stream:true}); var m; while(!closed && (m=buffer.search(/\n\n|\r\n\r\n/))!==-1){ var sep=buffer[m]==='\r'?4:2; handleBlock(buffer.slice(0,m)); buffer=buffer.slice(m+sep); } pump(); }).catch(function(err){ if(!closed){ closed=true; try{ controller.error(err); }catch(e){} } }); }
    pump();
  }});
}
var ANTHROPIC_ENDPOINT='https://api.deepseek.com/anthropic/v1/messages';
var SEARCH_TOOL={type:'web_search_20250305',name:'web_search'};
function toAnthropic(source){ var system=[],messages=[]; for(var i=0;i<(source||[]).length;i++){ var item=source[i]; if(!item)continue;
  if(item.role==='system'||item.role==='developer'){ system.push(String(item.content||'')); continue; }
  var blocks=[]; var role=item.role==='assistant'?'assistant':'user';
  if(item.role==='tool'){ blocks.push({type:'tool_result',tool_use_id:item.tool_call_id,content:String(item.content||'')}); role='user'; }
  else { if(item.role==='assistant'&&item.reasoning_content) blocks.push({type:'thinking',thinking:String(item.reasoning_content)});
    if(item.content) blocks.push({type:'text',text:String(item.content)});
    (item.tool_calls||[]).forEach(function(tc){ if(tc.type==='function'){ var a={}; try{ a=JSON.parse(tc.function.arguments||'{}'); }catch(e){} blocks.push({type:'tool_use',id:tc.id,name:tc.function.name,input:a}); } }); }
  var prev=messages[messages.length-1]; if(prev&&prev.role===role) prev.content=prev.content.concat(blocks); else messages.push({role:role,content:blocks}); }
  return {system:system.join(NL+NL), messages:messages}; }
function toUsage(raw){ var hit=Number(raw&&(raw.cache_read_input_tokens!=null?raw.cache_read_input_tokens:raw.prompt_cache_hit_tokens))||0;
  var creation=Number(raw&&raw.cache_creation_input_tokens)||0; var uncached=Number(raw&&(raw.input_tokens!=null?raw.input_tokens:raw.prompt_cache_miss_tokens))||0;
  var output=Number(raw&&(raw.output_tokens!=null?raw.output_tokens:raw.completion_tokens))||0; var prompt=uncached+hit+creation;
  return {prompt_tokens:prompt,completion_tokens:output,total_tokens:prompt+output,prompt_cache_hit_tokens:hit,prompt_cache_miss_tokens:uncached+creation,prompt_tokens_details:{cached_tokens:hit},input_tokens:prompt,output_tokens:output,cache_read_input_tokens:hit,cache_creation_input_tokens:creation}; }
function toAnswer(data){ var b=Array.isArray(data&&data.content)?data.content:[]; return { content:b.filter(function(x){return x&&x.type==='text';}).map(function(x){return x.text||'';}).join(''), reasoning:b.filter(function(x){return x&&x.type==='thinking';}).map(function(x){return x.thinking||x.text||'';}).join(''), tool_uses:b.filter(function(x){return x&&(x.type==='tool_use'||x.type==='server_tool_use');}), usage:toUsage(data&&data.usage), stop:(data&&data.stop_reason)||'stop', searched:b.some(function(x){return x&&(x.type==='tool_use'||x.type==='server_tool_use')&&(x.name==='web_search'||(x.input&&(x.input.type==='web_search'||x.input.name==='web_search')));}) }; }
function openAIJson(answer, model){ var tc=(answer.tool_uses||[]).map(function(tu,i){return {id:tu.id||('call_'+i),type:'function',function:{name:tu.name,arguments:JSON.stringify(tu.input||{})}};});
  var msg={role:'assistant',content:answer.content,reasoning_content:answer.reasoning}; if(tc.length)msg.tool_calls=tc;
  return {id:'chatcmpl-web-'+Date.now(),object:'chat.completion',created:Math.floor(Date.now()/1000),model:model,choices:[{index:0,message:msg,finish_reason:answer.stop==='max_tokens'?'length':'stop'}],usage:answer.usage}; }
function openAIStream(answer, model){ var frames=[], base={id:'chatcmpl-web-'+Date.now(),object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:model};
  function push(v){ frames.push('data: '+JSON.stringify(v)+NL+NL); }
  push(Object.assign({},base,{choices:[{index:0,delta:{role:'assistant'},finish_reason:null}]}));
  if(answer.reasoning) push(Object.assign({},base,{choices:[{index:0,delta:{reasoning_content:answer.reasoning},finish_reason:null}]}));
  if(answer.content) push(Object.assign({},base,{choices:[{index:0,delta:{content:answer.content},finish_reason:null}]}));
  push(Object.assign({},base,{choices:[{index:0,delta:{},finish_reason:answer.stop==='max_tokens'?'length':'stop'}],usage:answer.usage}));
  frames.push('data: [DONE]'+NL+NL);
  return new ReadableStream({ start:function(c){ frames.forEach(function(f){ c.enqueue(encodeText(f)); }); c.close(); } }); }
function anthropicUsageToOpenAI(su, du){ var hit=Number(su&&su.cache_read_input_tokens)||0, creation=Number(su&&su.cache_creation_input_tokens)||0, uncached=Number(su&&su.input_tokens)||0, output=Number(du&&du.output_tokens)||0, prompt=uncached+hit+creation;
  return {prompt_tokens:prompt,completion_tokens:output,total_tokens:prompt+output,prompt_cache_hit_tokens:hit,prompt_cache_miss_tokens:uncached+creation,prompt_tokens_details:{cached_tokens:hit},input_tokens:prompt,output_tokens:output,cache_read_input_tokens:hit,cache_creation_input_tokens:creation}; }
function makeAnthropicTranslate(){ var startUsage=null, searchedBlock=false, countedSearch=false, currentToolId=null, toolIndex=-1;
  return function(ev){ switch(ev&&ev.type){
    case 'message_start': if(ev.message&&ev.message.usage) startUsage=ev.message.usage; return null;
    case 'content_block_start': { var cb=ev.content_block||{};
      if(cb.type==='tool_use'||cb.type==='server_tool_use'){ if(cb.name==='web_search'||(cb.input&&(cb.input.type==='web_search'||cb.input.name==='web_search'))){ if(!countedSearch){ R.stats.searchCalls++; countedSearch=true; } searchedBlock=true; }
        else { toolIndex++; currentToolId=cb.id; return chunk({tool_calls:[{index:toolIndex,id:cb.id,type:'function',function:{name:cb.name,arguments:''}}]}); } }
      return null; }
    case 'content_block_delta': { var d=ev.delta||{};
      if(d.type==='thinking_delta') return chunk({reasoning_content:d.thinking||''});
      if(d.type==='text_delta') return chunk({content:d.text||''});
      if(d.type==='input_json_delta'){ if(searchedBlock&&R.cfg.showSearchTrace){ try{ var j=JSON.parse(d.partial_json||'{}'); if(j.search_query){ searchedBlock=false; return chunk({reasoning_content:'[web_search] '+j.search_query}); } }catch(e){} }
        else if(currentToolId) return chunk({tool_calls:[{index:toolIndex,function:{arguments:d.partial_json||''}}]}); }
      return null; }
    case 'content_block_stop': currentToolId=null; searchedBlock=false; return null;
    case 'message_delta': { var inc=!!(ev.delta&&ev.delta.stop_reason==='max_tokens'); var u=anthropicUsageToOpenAI(startUsage,ev.usage); return inc?{error:Error('Incomplete - output truncated'),usage:u}:{finish:true,usage:u}; }
    case 'message_stop': return {finish:true};
    default: return null; } }; }
function anthropicHandler(input, init, url, opts){ if(R.cfg.mode==='responses') return null;
  if(!/api\.deepseek\.com\/?(?:v1\/)?chat\/completions(?:\?|$)/i.test(url)) return null;
  if(typeof opts.body!=='string') return null;
  var original; try{ original=JSON.parse(opts.body); }catch(e){ return null; }
  var headers=new Headers(opts.headers||(input&&input instanceof Request?input.headers:undefined));
  var key=(headers.get('authorization')||'').replace(/^Bearer\s+/i,''); if(!key) return null;
  var converted=toAnthropic(original.messages||[]); var useStream=!!(R.flags.bridgeStream&&original.stream);
  var upstream={model:original.model,messages:converted.messages,tools:[],stream:useStream,max_tokens:(original.max_tokens!=null?original.max_tokens:(original.max_completion_tokens!=null?original.max_completion_tokens:384000))};
  (original.tools||[]).forEach(function(t){ if(t.type==='function') upstream.tools.push({name:t.function.name,description:t.function.description||'',input_schema:t.function.parameters||{type:'object',properties:{}}}); });
  if(R.cfg.webSearch&&!upstream.tools.some(function(t){return t.name==='web_search';})) upstream.tools.push(SEARCH_TOOL);
  if(!upstream.tools.length) delete upstream.tools;
  if(converted.system) upstream.system=converted.system;
  ['temperature','top_p','thinking','reasoning_effort'].forEach(function(n){ if(original[n]!=null) upstream[n]=original[n]; });
  var rInit={method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+key,'x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify(upstream),signal:opts.signal};
  return R._origFetch(ANTHROPIC_ENDPOINT,rInit).then(function(resp){ R.stats.last={mode:'anthropic',model:original.model,url:ANTHROPIC_ENDPOINT,ts:Date.now()}; try{ R.setPillText&&R.setPillText(); }catch(e){}
    if(useStream) return (!resp.ok||!resp.body)?resp:new Response(makeCoalescedStream(resp.body, makeAnthropicTranslate()),{status:200,headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache'}});
    return resp.text().then(function(raw){ if(!resp.ok) return new Response(raw,{status:resp.status,statusText:resp.statusText,headers:{'content-type':resp.headers.get('content-type')||'application/json'}});
      var data; try{ data=JSON.parse(raw); }catch(e){ throw Error('Anthropic endpoint invalid JSON'); }
      var answer=toAnswer(data); if(answer.searched) R.stats.searchCalls++;
      if(original.stream) return new Response(openAIStream(answer,original.model),{status:200,headers:{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-cache'}});
      return new Response(JSON.stringify(openAIJson(answer,original.model)),{status:200,headers:{'content-type':'application/json; charset=utf-8'}}); }); }); }
R.anthropicHandler = anthropicHandler;
var RESP_MODELS = { 'deepseek-v4-pro':{provider:'deepseek',path:'/responses',webSearch:true}, 'deepseek-v4-flash':{provider:'deepseek',path:'/responses',webSearch:true}, 'gpt-5.6-sol':{provider:'openai',path:'/responses',webSearch:true}, 'gpt-5.6-terra':{provider:'openai',path:'/responses',webSearch:true}, 'gpt-5.6-luna':{provider:'openai',path:'/responses',webSearch:true} };
var PROVIDER_HOSTS = { deepseek:['api.deepseek.com'], openai:['api.openai.com'] };
var warned = {};
function resolvePlan(url,payload){ if(R.cfg.mode==='chat') return null; var plan=RESP_MODELS[payload&&payload.model];
  if(!plan){ if(R.cfg.mode==='responses'&&payload&&payload.model&&!warned[payload.model]){ warned[payload.model]=1; console.warn('96R: mode=responses but model not profiled: '+payload.model); } return null; }
  if(url.indexOf('/chat/completions')<0) return null;
  return (PROVIDER_HOSTS[plan.provider]||[]).some(function(h){return url.indexOf(h)!==-1;})?plan:null; }
function buildResponsesRequest(chat,plan){ var sys=[],input=[];
  (chat.messages||[]).forEach(function(m){ if(!m)return;
    if(m.role==='system'||m.role==='developer'){ sys.push(String(m.content||'')); return; }
    if(m.role==='tool'){ input.push({type:'function_call_output',call_id:m.tool_call_id,output:String(m.content||'')}); return; }
    if(m.role==='assistant'){ if(m.reasoning_content) input.push({type:'reasoning',content:[{type:'reasoning_text',text:String(m.reasoning_content)}]});
      if(m.content) input.push({role:'assistant',content:String(m.content)});
      (m.tool_calls||[]).forEach(function(tc){ if(tc.type==='function') input.push({type:'function_call',call_id:tc.id,name:tc.function.name,arguments:tc.function.arguments||'{}'}); }); return; }
    input.push({role:'user',content:String(m.content||'')}); });
  if(!input.length) return null; var req={model:chat.model,input:input,stream:!!chat.stream}; if(sys.length) req.instructions=sys.join(NL+NL);
  var max=(chat.max_tokens!=null?chat.max_tokens:chat.max_completion_tokens); if(max) req.max_output_tokens=max;
  if(typeof chat.temperature==='number'&&plan.provider!=='deepseek') req.temperature=chat.temperature;
  if(R.cfg.webSearch&&plan.webSearch){ if(R.cfg.webSearchStyle==='tool') req.tool='web_search'; else req.tools=[{type:'web_search'}]; }
  var ft=(chat.tools||[]).filter(function(t){return t&&t.type==='function';}).map(function(t){return {type:'function',name:t.function.name,description:t.function.description||'',parameters:t.function.parameters||{type:'object',properties:{}}};});
  if(ft.length) req.tools=(req.tools||[]).concat(ft); return req; }
function mapUsage(u){ if(!u||typeof u!=='object') return undefined; var o={};
  if(typeof u.input_tokens==='number') o.prompt_tokens=u.input_tokens;
  if(typeof u.output_tokens==='number') o.completion_tokens=u.output_tokens;
  if(typeof u.total_tokens==='number') o.total_tokens=u.total_tokens;
  if(u.input_tokens_details&&typeof u.input_tokens_details.cached_tokens==='number') o.prompt_tokens_details={cached_tokens:u.input_tokens_details.cached_tokens};
  if(u.output_tokens_details&&typeof u.output_tokens_details.reasoning_tokens==='number') o.completion_tokens_details={reasoning_tokens:u.output_tokens_details.reasoning_tokens};
  return Object.keys(o).length?o:undefined; }
function makeResponsesTranslator(){ var idx=0,cur=-1,oiMap={}; return function(ev){ switch(ev&&ev.type){
  case 'response.created': idx=0; cur=-1; for(var k in oiMap) delete oiMap[k]; return null;
  case 'response.output_text.delta': return chunk({content:ev.delta||''});
  case 'response.reasoning_text.delta': return chunk({reasoning_content:ev.delta||''});
  case 'response.output_item.added': { var it=ev.item||{}; if(it.type==='function_call'){ cur=idx++; if(Number.isInteger(ev.output_index)) oiMap[ev.output_index]=cur; return chunk({tool_calls:[{index:cur,id:it.call_id,type:'function',function:{name:it.name,arguments:''}}]}); } return null; }
  case 'response.function_call_arguments.delta': { var i=(Number.isInteger(ev.output_index)&&oiMap[ev.output_index]!=null)?oiMap[ev.output_index]:(cur<0?0:cur); return chunk({tool_calls:[{index:i,function:{arguments:ev.delta||''}}]}); }
  case 'response.output_item.done': { var item=ev.item||{}; if(item.type==='web_search_call'){ R.stats.searchCalls++; if(R.cfg.showSearchTrace){ var q=(item.action&&(item.action.search_query||item.action.query))||'web search'; return chunk({reasoning_content:'[web_search] '+q}); } } return null; }
  case 'response.completed': return {finish:true,usage:mapUsage(ev.response&&ev.response.usage)};
  case 'response.incomplete': return {error:Error('Incomplete - output truncated')};
  case 'response.failed': return {error:Error((ev.response&&ev.response.error&&ev.response.error.message)||'Responses request failed.')};
  default: return null; } }; }
function translateFinal(data,plan){ var content='',reasoning='',toolCalls=[];
  (data.output||[]).forEach(function(item){ if(item&&item.type==='message'&&Array.isArray(item.content)) item.content.forEach(function(c){ if(c&&c.type==='output_text') content+=c.text||''; });
    else if(item&&item.type==='reasoning'){ (item.summary||[]).forEach(function(s){ if(s&&s.type==='summary_text') reasoning+=s.text||''; }); if(!reasoning&&typeof item.encrypted_content==='string') reasoning='[encrypted reasoning]'; }
    else if(item&&item.type==='function_call') toolCalls.push({id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments||'{}'}});
    else if(item&&item.type==='web_search_call'){ R.stats.searchCalls++; if(R.cfg.showSearchTrace){ var __q=(item.action&&(item.action.search_query||item.action.query))||'web search'; reasoning+=(reasoning?String.fromCharCode(10):'')+'[web_search] '+__q; } } });
  var status=data.status==='failed'?'error':(data.status==='incomplete'?'length':'stop');
  var msg={role:'assistant',content:content,reasoning_content:reasoning}; if(toolCalls.length) msg.tool_calls=toolCalls;
  return {id:data.id,object:'chat.completion',created:Math.floor(Date.now()/1000),model:data.model||plan.model,choices:[{index:0,message:msg,finish_reason:status}],usage:mapUsage(data.usage)}; }
function responsesHandler(input,init,url,opts){ if(typeof opts.body!=='string') return null; var payload; try{ payload=JSON.parse(opts.body); }catch(e){ return null; }
  var plan=resolvePlan(url,payload); if(!plan) return null; var rReq=buildResponsesRequest(payload,plan); if(!rReq) return null;
  var rUrl=url.replace(/\/chat\/completions(\?.*)?$/,'')+plan.path; var rInit={}; for(var k in opts) if(k!=='body') rInit[k]=opts[k];
  rInit.headers=cloneHeaders(opts.headers); rInit.headers['Content-Type']='application/json'; rInit.body=JSON.stringify(rReq);
  return R._origFetch(rUrl,rInit).then(function(up){ R.stats.transformed++; R.stats.last={mode:'responses',model:payload.model,url:rUrl,ts:Date.now()}; try{ R.setPillText&&R.setPillText(); }catch(e){}
    if(!up.ok) return up.text().then(function(t){ var msg='HTTP '+up.status; try{ var j=JSON.parse(t); if(j&&j.error&&j.error.message) msg+=': '+j.error.message; }catch(e){} return new Response(JSON.stringify({error:{message:msg}}),{status:up.status,headers:{'Content-Type':'application/json'}}); });
    if(payload.stream&&up.body) return new Response(makeCoalescedStream(up.body, makeResponsesTranslator()),{status:200,headers:{'Content-Type':'text/event-stream'}});
    return up.json().then(function(data){ if(data.status==='failed'){ var em=(data.error&&data.error.message)||'Responses request failed.'; return new Response(JSON.stringify({error:{message:em}}),{status:400,headers:{'Content-Type':'application/json'}}); } return new Response(JSON.stringify(translateFinal(data,plan)),{status:200,headers:{'Content-Type':'application/json'}}); }); }); }
function coalescerHandler(input,init,url,opts){ if(typeof opts.body!=='string') return null; var payload; try{ payload=JSON.parse(opts.body); }catch(e){ return null; }
  if(!(payload&&payload.stream&&Array.isArray(payload.messages)&&url.indexOf('/chat/completions')>=0)) return null;
  R.stats.passthrough++; R.stats.last={mode:'chat',model:payload.model,url:url,ts:Date.now()}; try{ R.setPillText&&R.setPillText(); }catch(e){}
  return R._origFetch.call(this,input,init).then(function(up){ return (up.ok&&up.body)?new Response(makeCoalescedStream(up.body,null),{status:200,headers:{'Content-Type':'text/event-stream'}}):up; }); }
R.applyFetch = function(){ var __own={anthropic:1,responses:1,coalescer:1,estimate:1}; R._pipes.set('fetch',(R._pipes.get('fetch')||[]).filter(function(x){return !__own[x.id];}));
  if(R.flags.anthropic) R.pipe('fetch', anthropicHandler, {order:10,id:'anthropic'});
  if(R.flags.hybrid){ R.pipe('fetch', responsesHandler, {order:20,id:'responses'}); R.pipe('fetch', coalescerHandler, {order:30,id:'coalescer'}); }
   };
R._installFetch = function(){ if(R._fetchInstalled) return; var chain=function(input,init){
  var url=typeof input==='string'?input:(input&&input.url)||String(input||''); var opts=init||{};
  if(String(opts.method||(input&&input.method)||'GET').toUpperCase()!=='POST') return R._origFetch.call(this,input,init);
  var hs=R._pipes.get('fetch')||[]; for(var i=0;i<hs.length;i++){ var r=hs[i].fn.call(this,input,init,url,opts); if(r) return r; } return R._origFetch.call(this,input,init); };
  window.fetch=chain; R._fetchInstalled=true; };
R.applyFetch(); R._installFetch();

/* ================= 96R · TOOLS + AGENTIC ================= */
window.__tools = window.__tools || {};
function safeStr(v){ try{ if(v===undefined) return 'undefined'; if(typeof v==='number'||typeof v==='string'||typeof v==='boolean'||v===null) return JSON.stringify(v);
    var seen=new WeakSet(); return JSON.stringify(v,function(k,x){ if(typeof x==='bigint'||typeof x==='symbol'||typeof x==='function') return String(x); if(x&&typeof x==='object'){ if(seen.has(x)) return '[circular]'; seen.add(x); } return x; },2).slice(0,20000)||'undefined'; }catch(e){ return String(v); } }
function evalWorker(code, timeout, signal){ return new Promise(function(resolve){ try{ if(signal&&signal.aborted) return resolve({ ok:0, e:'aborted' });
  var src='self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:1,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:0,e:String(err&&err.stack||err)})}}';
  var w=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));
  var t=setTimeout(function(){ w.terminate(); resolve({ok:0,e:'timeout'}); }, timeout);
  var ab=function(){ clearTimeout(t); w.terminate(); resolve({ok:0,e:'aborted'}); };
  if(signal) signal.addEventListener('abort',ab);
  w.onmessage=function(e){ clearTimeout(t); if(signal) signal.removeEventListener('abort',ab); w.terminate(); resolve(e.data); };
  w.onerror=function(err){ clearTimeout(t); if(signal) signal.removeEventListener('abort',ab); w.terminate(); resolve({ok:0,e:String(err.message||err)}); };
  w.postMessage(code); }catch(e){ resolve({ok:0,e:String(e)}); } }); }
var TOOL_DESC='Execute JavaScript in the browser. Returns JSON result. The last statement must be an expression to return a value (do NOT use console.log to return data). By default runs in isolated Web Worker. SET "worker": false if you need to access window, document, or DOM. You MAY issue multiple tool invokes with different names in one block \u2014 each becomes an independent execution; never merge or drop any.';
if(!window.__tools.tool_eval_1){
  window.__tools.tool_eval_1 = { schema:{ type:'function', function:{ name:'tool_eval_1', description:TOOL_DESC, parameters:{ type:'object', properties:{ code:{ type:'string', description:'JavaScript code to run.' }, timeout:{ type:'number' }, worker:{ type:'boolean', description:'false = full page DOM access. true = isolated worker (default)' } }, required:['code'] } } },
    run: async function(args, signal){ var code=String(args&&args.code!=null?args.code:((args&&args.expression)||'')).trim(); var timeout=(args&&args.timeout==null)?10000:Math.max(1,Math.min(60000,Number(args&&args.timeout)||10000)); var worker=!(args&&args.worker===false); var t0=performance.now();
      if(!code) return safeStr({ ok:false, error:'no code provided' });
      if(worker){ var r=await evalWorker(code,timeout,signal); var o={ ok:!!r.ok, ms:Math.round(performance.now()-t0) }; if(r.ok) o.result=r.r; else o.error=r.e; return safeStr(o); }
      return await new Promise(function(resolve){ var done=false; var t=setTimeout(function(){ if(!done){ done=true; resolve(safeStr({ok:false,ms:Math.round(performance.now()-t0),error:'timeout'})); } },timeout);
        if(signal) signal.addEventListener('abort',function(){ if(!done){ done=true; clearTimeout(t); resolve(safeStr({ok:false,ms:Math.round(performance.now()-t0),error:'aborted'})); } });
        try{ Promise.resolve(eval(code)).then(function(v){ if(done)return; done=true; clearTimeout(t); resolve(safeStr({ok:true,ms:Math.round(performance.now()-t0),result:v})); }, function(e){ if(done)return; done=true; clearTimeout(t); resolve(safeStr({ok:false,ms:Math.round(performance.now()-t0),error:String(e&&e.stack||e)})); }); }catch(e){ if(done)return; done=true; clearTimeout(t); resolve(safeStr({ok:false,ms:Math.round(performance.now()-t0),error:String(e&&e.stack||e)})); } }); } };
}
var TOOL_VERSIONS = { 1:{name:'tool_eval_1',desc:'original'}, 2:{name:'tool_eval_2'}, 3:{name:'tool_eval_3'}, 4:{name:'tool_eval_4'}, 5:{name:'tool_eval_5'}, 6:{name:'tool_eval_6',desc:'cost-annotated'}, 7:{name:'tool_eval_7',desc:'app-aware'} };
function toolSchemaClone(name){ var base=window.__tools['tool_eval_1']; var s=base&&base.schema; if(!s||!s.function) return null; return Object.assign({},s,{ function:Object.assign({},s.function,{ name:name }) }); }
for(var _k in TOOL_VERSIONS){ var nm=TOOL_VERSIONS[_k].name; if(!window.__tools[nm]) window.__tools[nm]={ schema: toolSchemaClone(nm), run: window.__tools['tool_eval_1'].run }; }
(function(){ try{ var APP="Execute JavaScript in the client-side AI chat WebApp hosting this conversation. Returns ONLY the last statement's value (serialized as JSON). By default runs in an isolated Web Worker on a separate thread. SET \"worker\": false if you need to access window, document, or DOM on the main thread. You may issue multiple tool invokes with same-different names in one block \u2014 each tool call becomes an independent execution; never merge or drop any."; var t7=window.__tools&&window.__tools.tool_eval_7; if(t7&&t7.schema&&t7.schema.function) t7.schema.function.description=APP; }catch(e){} })();
R.registerToolVersion = function(id,name,desc){ TOOL_VERSIONS[id]={name:name,desc:desc||''}; return TOOL_VERSIONS; };
R._materializeToolAliases = function(){ var names={}; for(var k in TOOL_VERSIONS) names[TOOL_VERSIONS[k].name]=1; if(R.cfg.evalToolNameOverride) names[R.cfg.evalToolNameOverride]=1; for(var n in names){ if(!window.__tools[n]) window.__tools[n]={ schema: toolSchemaClone(n), run: window.__tools['tool_eval_1'].run }; } };
R.setEvalToolVersion = function(v){ R.cfg.evalToolVersion = v; R.save(); return v; };
function hasToolsAtMessage(v){ if(!v) return false; if(v.tool_calls&&v.tool_calls.length) return true;
  if(Array.isArray(v._toolEvents)) return v._toolEvents.some(function(m){ return (m.role==='assistant'&&m.tool_calls&&m.tool_calls.length)||m.role==='tool'; }); return false; }
function stripReasoning(m){ if(m&&m.reasoning_content!==undefined){ var c=Object.assign({},m); delete c.reasoning_content; return c; } return m; }
function bamMake(next){ return function(targetPath, r, msgs){ if(msgs) return next.call(this,targetPath,r,msgs);
  var rr=r||run(); var mode=R.cfg.thinkingHistory||'all'; var out=[{role:rr.systemRole||'system',content:'You are a helpful assistant.'}];
  targetPath.forEach(function(n){ if(!n||n.id==='root'||n.role==='system'||n.role==='system-msg') return; var ver=n.versions[n.activeVersion||0];
    var te=(ver._toolEvents&&Array.isArray(ver._toolEvents))?ver._toolEvents.slice():[]; var wt=hasToolsAtMessage(ver);
    if(mode!=='all') te=te.map(function(m){ return (m.role==='assistant'&&(!(m.tool_calls&&m.tool_calls.length)||mode==='off'))?stripReasoning(m):m; });
    if(te.length) out.push.apply(out,te);
    var fc=ver.llmContent; if(fc===undefined){ var last=(ver._toolEvents||[]).filter(function(m){return m.role==='assistant';}).pop(); fc=(last&&last.content)?last.content:ver.rawContent; }
    if(fc){ var inc=(mode==='all')?!!ver.thinking:((mode==='tools')?!!(ver.thinking&&wt):false); var msg={role:n.role,content:fc}; if(inc) msg.reasoning_content=ver.thinking; out.push(msg); } });
  return rr.prompt?out.concat({role:rr.systemRole||'system',content:rr.prompt}):out; }; }
function activeToolName(){ var v=R.cfg.evalToolVersion; if(v==='off') return null; if(v==='auto') return 'tool_eval_7'; return 'tool_eval_'+v; }
function toolSchema(name, def){ var b=(window.__tools&&window.__tools['tool_eval_7'])||(window.__tools&&window.__tools['tool_eval_1']); var s=(def&&def.schema)||(b&&b.schema);
  if(s&&s.function) s=Object.assign({},s,{function:Object.assign({},s.function,{name:name})}); return s; }
function resolveTools(r){ if(Array.isArray(r.request&&r.request.tools)) return r.request.tools;
  if(!(r.request&&('tools' in r.request))&&R.flags.tools){ var am=R.cfg.agenticTools||'on'; if(am==='off') return []; var list=[], tn=activeToolName();
    if(tn&&window.__tools&&window.__tools[tn]) list.push(toolSchema(tn,window.__tools[tn]));
    (R.cfg.autoTools||[]).forEach(function(n){ if(window.__tools&&window.__tools[n]) list.push(toolSchema(n,window.__tools[n])); }); return list; } return []; }
function execTool(tc, signal){ var name=tc.function&&tc.function.name, def=window.__tools&&window.__tools[name]; var args={};
  try{ args=JSON.parse((tc.function&&tc.function.arguments)||'{}'); }catch(e){ args={ parseError:String(e) }; }
  if(!def) return Promise.resolve(JSON.stringify({ ok:false, error:'unknown tool: '+name }));
  try{ return Promise.resolve(def.run(args, signal)).then(function(o){ return typeof o==='string'?o:JSON.stringify(o); }, function(e){ return JSON.stringify({ ok:false, error:String(e&&e.stack||e) }); }); }
  catch(e){ return Promise.resolve(JSON.stringify({ ok:false, error:String(e&&e.stack||e) })); } }
function addCumulativeUsage(acc,curr){ if(!acc) return JSON.parse(JSON.stringify(curr||{})); if(!curr) return acc; var out=Object.assign({},acc);
  ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens','cache_creation_input_tokens','cache_read_input_tokens','input_tokens','output_tokens'].forEach(function(k){ if(curr[k]) out[k]=(out[k]||0)+curr[k]; }); if(curr.prompt_tokens_details) out.prompt_tokens_details=Object.assign({}, out.prompt_tokens_details||{}, { cached_tokens:((out.prompt_tokens_details&&out.prompt_tokens_details.cached_tokens)||0)+((curr.prompt_tokens_details.cached_tokens)||0) }); return out; }
function costNoteExtra(model){ try{ var P=R.getPricing(providerOfModel(model)); var off=(P.models[model]&&P.models[model].off)||null; var cur=R.priceAt(model); if(!off||!cur||!cur.bucket) return ''; var notes=[]; if(cur.bucket==='peak'&&off.output&&cur.output){ var ratio=cur.output/off.output; var nice=Math.abs(ratio-Math.round(ratio))<0.05; notes.push('peak by '+(nice?Math.round(ratio)+'x':ratio.toFixed(2)+'x')+' off-peak'); } (cur.scalars||[]).forEach(function(sx){ var f=(typeof sx==='number')?sx:1; if(f===0) notes.push('discounted by ÷FREE off-peak'); else if(f<1) notes.push('discounted by ÷'+String(Number((1/f).toFixed(6)))+' off-peak'); else if(f>1) notes.push('peak by '+String(Number(f.toFixed(6)))+'x off-peak'); }); if(cur.conflict) notes.push('⚠️price⚠️'); return notes.length?' ('+Array.from(new Set(notes)).join(' and ')+')':''; }catch(e){ return ''; } }
function costNote(resStr, roundCostNum, nCalls, model){ if(!(roundCostNum!=null&&roundCostNum>0&&Number.isFinite(roundCostNum))) return resStr;
  var note=cs(roundCostNum)+costNoteExtra(model)+(nCalls>1?('\u00F7'+nCalls):''); var parr; try{ parr=JSON.parse(resStr); }catch(e){ parr=null; }
  if(parr&&typeof parr==='object'&&!Array.isArray(parr)){ var o={},ins=false; for(var k in parr){ o[k]=parr[k]; if(k==='ms'){ o.cost_of_this_tool_round_thinking_included=note; ins=true; } } if(!ins) o.cost_of_this_tool_round_thinking_included=note; return JSON.stringify(o,null,2); }
  return JSON.stringify(Object.assign({ result: (parr!==null?parr:resStr) }, { cost_of_this_tool_round_thinking_included:note }), null, 2); }
function agenticMake(next){ return function(messages, node, vIndex, controller, r){
  r = r || run(); window.__dseCurrentMsg = (node&&node.id)||null;
  return (function(){
    var p=r.p, key=getApiKey(p.id), isStream=settings.streaming, modelId=r.m, tools=resolveTools(r);
    var payload=Object.assign({}, r.request, { model:modelId, temperature:(r.supportsTemperature===false?undefined:(r.temperature!=null?r.temperature:.7)), stream:isStream });
    if(tools.length){ payload.tools=tools; if(!payload.tool_choice) payload.tool_choice='auto'; }
    try{ var md=node.versions[vIndex].metadata=node.versions[vIndex].metadata||{}; md.tools={}; (payload.tools||[]).forEach(function(t){ var n=t.function&&t.function.name; if(n) md.tools[n]=0; }); if(R.cfg.webSearch&&md.tools.web_search==null) md.tools.web_search=0; }catch(e){}
    payload[p.maxTokensParam||'max_tokens']=r.maxTokens;
    if(isStream&&p.supportsStreamUsage) payload.stream_options={ include_usage:true };
    node.versions[vIndex].startTime=Date.now();
    var toolEvents=[], maxTurns=(R.cfg.toolMaxTurns==null?100:R.cfg.toolMaxTurns), turnsOn=(R.cfg.toolMaxTurnsOn!==false);
    var uiContent='', llmContent='', uiThinking='', cum=null, cumCost=0, msgSearch=0; var tU=null, bU=null, tCost=0, bCost=0, turns=[]; var sc0=(R.stats&&R.stats.searchCalls)||0; var NLx=String.fromCharCode(10), BT=String.fromCharCode(96);
    function costTot(){ try{ var c=node.versions[vIndex].metadata&&node.versions[vIndex].metadata.cost&&node.versions[vIndex].metadata.cost.calculated&&node.versions[vIndex].metadata.cost.calculated.total; var v=qv(c); return Number.isFinite(v)?v:0; }catch(e){ return 0; } }
    function usageValueLocal(root,path,bad){ if(path===false) return undefined; var ks=String(path||'').split(',').map(function(x){return x.trim();}).filter(Boolean); for(var i=0;i<ks.length;i++){ var k=ks[i], neg=k.charAt(0)==='?'; if(neg)k=k.slice(1); var vv=at(root,k), n=Number(vv); if(vv!=null&&vv!==''&&isFinite(n)) return n; if(!neg) bad.value=1; } return undefined; } function turnMax(a,b){ var o=Object.assign({},a||{}); for(var k in b){ var x=b[k], y=o[k]; if(x==null) continue; if(typeof x==='number'&&typeof y==='number') o[k]=Math.max(x,y); else if(x&&typeof x==='object'&&!Array.isArray(x)) o[k]=turnMax(y&&typeof y==='object'?y:null,x); else o[k]=x; } return o; } function tierFix(){ try{ var pr=r.pricing||{}, all=turns.concat(tU?[tU]:[]); if(!Array.isArray(pr.tiers)||!pr.tiers.length||all.length<2) return; var v=node.versions[vIndex], cc=v.metadata&&v.metadata.cost; if(!cc||cc.exact) return; var K=['out','hit','miss','unk','total'], sum={}, unk={}; K.forEach(function(k){ sum[k]=0; }); all.forEach(function(u){ var sv={}; applyResponseMetadata(sv,u,r); var c=sv.metadata.cost.calculated; K.forEach(function(k){ var q=qv(c[k]); if(Number.isFinite(q)) sum[k]+=q; if(String(c[k]).slice(-1)==='+') unk[k]=1; }); }); cc.calculated={}; K.forEach(function(k){ cc.calculated[k]=cs(sum[k])+(unk[k]?'+':''); }); cc.perTurn=all.length; }catch(e){} } function applyUsage(env){ var bad={}; var rc=(typeof usageValue==='function'?usageValue:usageValueLocal)(env,r.usageCost,bad); if(!bad.value&&rc!==undefined){ tCost=Math.max(tCost||0,rc); cumCost=bCost+tCost; } var nxt=(r.usagePath===false?env:(r.usagePath?at(env,r.usagePath):(env&&(env.usage||env.usageMetadata||(env.message&&env.message.usage))))); if(nxt&&typeof nxt==='object'){ tU=turnMax(tU,nxt); cum=addCumulativeUsage(bU?JSON.parse(JSON.stringify(bU)):null,tU); } if(cum||cumCost>0){ applyResponseMetadata(node.versions[vIndex], cum||{}, r, cumCost||undefined); tierFix(); } }
    async function finishTurn(){ var abAtEntry=controller.signal.aborted; node.versions[vIndex].rawContent=uiContent; node.versions[vIndex].llmContent=llmContent; node.versions[vIndex].thinking=uiThinking; var _sd=((R.stats&&R.stats.searchCalls)||0)-sc0; var _se=msgSearch+(_sd>0?_sd:0);
      if(_se) node.versions[vIndex].searches=_se; if(toolEvents.length) node.versions[vIndex]._toolEvents=toolEvents;
 try{ var _ts=Date.now(), _tbl=R.priceAt(r.m,_ts,(r&&r.p&&r.p.id)||providerOfModel(r.m)), _P=R.getPricing((r&&r.p&&r.p.id)||providerOfModel(r.m)), _off=(_P.models[r.m]&&_P.models[r.m].off)||null, _net=(function(){try{ var u=cum||{}; var hit=u.prompt_cache_hit_tokens||u.cache_read_input_tokens||0; var inAll=u.input_tokens||u.prompt_tokens||0; var miss=(u.prompt_cache_miss_tokens!=null)?u.prompt_cache_miss_tokens:Math.max(0,(inAll||0)-hit); var outN=u.completion_tokens||u.output_tokens||0; if(_off&&_tbl&&((hit||0)+(miss||0)+(outN||0))>0){ var ct=(hit*(_tbl.inputCacheHit||0))+(miss*(_tbl.inputCacheMiss||0))+(outN*(_tbl.output||0)); var co=(hit*(_off.inputCacheHit||0))+(miss*(_off.inputCacheMiss||0))+(outN*(_off.output||0)); if(co>0) return ct/co; } }catch(e){} return (_off&&_off.output&&_tbl)?(_tbl.output||0)/_off.output:1; })(); var _md=node.versions[vIndex].metadata=node.versions[vIndex].metadata||{}; _md.pricing={ bucket:(_tbl&&_tbl.bucket)||'off', scalars:(_tbl&&_tbl.scalars)||[], conflict:!!(_tbl&&_tbl.conflict), ts:_ts, net:_net, provider:(r&&r.p&&r.p.id)||null, model:r.m }; _md.peakCost=((_tbl&&_tbl.bucket)==='peak'); if(_md.tools&&_md.tools.web_search!=null&&_se) _md.tools.web_search+=_se; }catch(e){}
      try{ await saveStreamBuffer(node,vIndex); }catch(e){} node.versions[vIndex].endTime=node.lastUpdateTime||Date.now(); if(node.activeVersion===vIndex) updateNodeDOM(node); if(abAtEntry) throw new DOMException('Stopped by user','AbortError'); finalizeGeneration(node,vIndex,controller); }
    function oneTurn(tnum){
      if(controller.signal.aborted || (turnsOn && tnum>=maxTurns)) return Promise.resolve(finishTurn());
      if(tU){ turns.push(tU); bU=cum; } bCost=cumCost; tU=null; tCost=0; var reqMessages=messages.concat(toolEvents); if(llmContent) reqMessages.push({ role:'assistant', content:llmContent });
      var costBefore=costTot(); if(R.cfg.evalInProviders&&p&&p.eval){ try{ eval(p.eval); }catch(e){ console.warn('[96R eval '+p.id+'] '+e.message); } }
      return fetch(p.baseURL+p.apiPath, { method:'POST', headers:{ 'Content-Type':'application/json','Authorization':(p.authHeader?p.authHeader+' ':'')+key }, body:JSON.stringify(Object.assign({},payload,{ messages:reqMessages })), signal:controller.signal })
        .then(function(res){ if(!res.ok) return res.text().then(function(b){ throw Error('HTTP '+res.status+' '+b); });
          if(!isStream) return res.json().then(function(data){ applyUsage(data); var m2=(data.choices&&data.choices[0]&&data.choices[0].message)||{}; return { c:m2.content||'', t:m2.reasoning_content||'', tc:m2.tool_calls||null }; });
          var reader=res.body.getReader(), dec=new TextDecoder(), buf='', acc={ c:'', t:'', tc:[] }, first=true, lastR=0;
          function proc(line){ if(line.indexOf('data: ')!==0) return; var js=line.slice(6).trim(); if(!js||js==='[DONE]') return;
            try{ var d=JSON.parse(js), delta=(d.choices&&d.choices[0]&&d.choices[0].delta)||{}; acc.c+=delta.content||''; acc.t+=delta.reasoning_content||''; node.lastUpdateTime=Date.now(); node.versions[vIndex].rawContent=uiContent+acc.c; node.versions[vIndex].thinking=uiThinking+acc.t;if(first&&(acc.c||acc.t)){ if(node.activeVersion===vIndex){ updateNodeDOM(node); } first=false; handleNewContent(0,true); }if(!first&&(acc.c.length+acc.t.length)){ var _l=acc.c.length+acc.t.length; if(node.activeVersion===vIndex){ var _v=node.versions[vIndex]; _v.unread=false; handleNewContent(_l-lastR,false); lastR=_l; var _el=getMessageEl(node.id); if(_el){ var _bb=_el.querySelector('.bubble'), _cc=_el.closest('.message')&&_el.closest('.message').querySelector('.char-count'); var _h=buildThinkingSection(_v.thinking,node.id,true)+formatMarkdown(_v.rawContent); if(_bb&&_bb.innerHTML!==_h)_bb.innerHTML=_h; if(_cc)_cc.textContent=getMessageStatString(node,_v); } scheduleTokenDisplayUpdate(acc.c.length,acc.t.length); } var _sw=node.id+'|'+vIndex; if(Date.now()-((window.__s16b=window.__s16b||{})[_sw]||0)>500){ window.__s16b[_sw]=Date.now(); try{ saveStreamBuffer(node,vIndex); }catch(e){} } }
              (delta.tool_calls||[]).forEach(function(x){ var i=(x.index!=null?x.index:acc.tc.length); var a=acc.tc[i]||(acc.tc[i]={ id:'', type:'function', function:{ name:'', arguments:'' } }); if(x.id)a.id=x.id; if(x.function){ if(x.function.name)a.function.name+=x.function.name; if(x.function.arguments)a.function.arguments+=x.function.arguments; } });
              applyUsage(d); }catch(e){} }
          function loop(){ return reader.read().then(function(rd){ if(rd.done){ if(buf.trim()) proc(buf.trim()); return acc; } buf+=dec.decode(rd.value,{stream:true}); var ls=buf.split(NLx); buf=ls.pop(); ls.forEach(proc); return loop().then(function(a){ if(a&&a.tc) a.tc=a.tc.filter(Boolean); return a; }); }); }
          return loop(); })
        .then(function(resp){ var turnC=resp.c||'', turnT=resp.t||'', toolCalls=resp.tc;
          uiContent+=turnC; uiThinking+=turnT; llmContent+=turnC;
          if(toolCalls && toolCalls.length && (turnsOn ? tnum<maxTurns : true)){ if(controller.signal.aborted) return finishTurn();
            toolCalls.forEach(function(tc){ var f=tc.function=tc.function||{}; if(!tc.id) tc.id=(String(node&&node.id||'').split('(')[0]||'call')+'t'+((window.__r96seq=(window.__r96seq||0)+1))+'e'+(window.__r96ep=window.__r96ep||Math.floor(Math.random()*1e8))+'_'+((tc.function&&tc.function.name)||'tool'); if(!f.name) f.name=activeToolName()||'tool'; });
            toolEvents.push({ role:'assistant', content:turnC||null, reasoning_content:turnT||null, tool_calls:toolCalls }); llmContent='';
            toolCalls.forEach(function(tc){ if(tc.function&&/web_search/i.test(tc.function.name)) msgSearch++; });
            var rc=costTot()-costBefore;
            return Promise.all(toolCalls.map(function(tc){ return execTool(tc, controller.signal).then(function(s){ return { tc:tc, s:s }; }); })).then(function(results){
              var nCalls=toolCalls.length; var withNote=(R.cfg.toolCostNote!==false && rc>0 && Number.isFinite(rc));
              results.forEach(function(x){ var tc=x.tc, toolContent=x.s; if(withNote) toolContent=costNote(toolContent, rc, nCalls, r.m);
                uiContent += NLx+NLx+BT+BT+BT+'javascript'+NLx+'// Executing: '+(tc.function&&tc.function.name)+NLx+(tc.function&&tc.function.arguments)+NLx+BT+BT+BT+NLx;
                try{ var mt=node.versions[vIndex].metadata&&node.versions[vIndex].metadata.tools; var nn=tc.function&&tc.function.name; if(mt&&nn&&mt[nn]!=null) mt[nn]++; }catch(e){}
                toolEvents.push({ role:'tool', tool_call_id:tc.id, content:toolContent });
                uiContent += NLx+NLx+BT+BT+BT+'json'+NLx+'// Result'+NLx+toolContent+NLx+BT+BT+BT+NLx+NLx; });
              try{ node.versions[vIndex].toolBatch={ requested:toolCalls.length, executed:results.length, names:results.map(function(x){ return (x.tc.function&&x.tc.function.name)||'?'; }) }; }catch(e){}
              node.versions[vIndex].rawContent=uiContent; if(node.activeVersion===vIndex) updateNodeDOM(node);
              if(controller.signal.aborted) return finishTurn();
              return oneTurn(tnum+1); });
          }
          return finishTurn(); });
    }
    return oneTurn(0);
  })().then(function(){ window.__dseCurrentMsg=null; }, function(e){ window.__dseCurrentMsg=null; throw e; }); }; }
patchHost('buildAPIMessages', bamMake);
patchHost('executeAPI', agenticMake);

/* ================= 96R · MARKED + CODE-BLOCK UX ================= */
function renderMarked(raw){ var lib=window.marked;
  if(!lib||!raw) return (typeof R.host.orig.formatMarkdown==='function')?R.host.orig.formatMarkdown(raw):String(raw||'');
  try{ var renderer={ code:function(token){ var text=(token&&token.text!=null)?token.text:String(token||''); var lang=(token&&token.lang)||'plain';
        return buildCodeBlockHTML(lang, text+NL, !!(settings.blockAutoCollapse&&text.length>settings.blockCollapseSize)); } };
    if(typeof lib.Marked==='function') return new lib.Marked({ gfm:true, breaks:true, renderer:renderer }).parse(String(raw));
    if(typeof lib.parse==='function'){ var r=new lib.Renderer(); r.code=renderer.code; return lib.parse(String(raw),{ renderer:r, breaks:true, gfm:true }); }
  }catch(e){}
  return (typeof R.host.orig.formatMarkdown==='function')?R.host.orig.formatMarkdown(raw):String(raw||''); }
function loadMarked(){ if(R.markedReady) return Promise.resolve(true); if(R.markedLoading) return R.markedLoading;
  if(window.marked&&(window.marked.parse||window.marked.Marked)){ R.markedReady=true; return Promise.resolve(true); }
  R.markedLoading=new Promise(function(resolve,reject){ var s=document.createElement('script'); s.src=R.cfg.markedSrc; s.crossOrigin='anonymous';
    s.onload=function(){ s.remove(); if(window.marked&&(window.marked.parse||window.marked.Marked)) resolve(true); else reject(Error('marked unusable')); };
    s.onerror=function(){ s.remove(); reject(Error('marked blocked')); }; document.head.appendChild(s); })
   .then(function(ok){ R.markedReady=ok; R.markedLoading=null; try{ renderFullChat(); }catch(e){} return ok; }, function(e){ R.markedLoading=null; return false; });
  return R.markedLoading; }
function markedMake(next){ return function(raw){ return renderMarked(raw); }; }
var blockOverrides={}, blockOrder=[];
function blockKey(m,l,c){ return (m?m+'::':'')+(l||'')+'::'+String(c||'').slice(0,80); }
function codeblockMake(next){ return function(lang,c,collapsed){ var cnt=String(c||''), key=blockKey(window.__dseCurrentMsg||null,lang,cnt), ov=blockOverrides[key]; var eff=collapsed;
  if(ov==='open') eff=false; else if(ov==='close') eff=true;
  else if(R.cfg.toolEchoCollapseOn!==false && R.cfg.toolEchoCollapseChars!=null && (cnt.indexOf('// Executing:')===0 || cnt.indexOf('// Result')===0) && cnt.length>R.cfg.toolEchoCollapseChars) eff=true;
  var isTool=(cnt.indexOf('// Executing:')===0||cnt.indexOf('// Result')===0);
  var html=next.call(this,lang,cnt,eff);
  if(isTool&&R.cfg.toolFontScale){ var prod=((typeof settings!=='undefined'&&settings.fontScale)||0.5)*R.cfg.toolFontScale; html=html.replace('<div class="code-block">','<div class="code-block" style="--block-font-scale:'+prod+'">'); }
  return html; }; }
if(!window.__r96_clickBound){ window.__r96_clickBound=true;
  window.__r96clickHandler=function(e){ var hf=e.target.closest&&e.target.closest('.code-header, .code-footer'); if(!hf) return;
    if(e.target.closest('button')||e.target.closest('.block-arrow')) return;
    var bl=hf.closest('.code-block'), bd=bl&&bl.querySelector('.code-body'); if(!bd) return;
    var ic=bd.classList.toggle('collapsed'); bl.querySelectorAll('.down,.up').forEach(function(el){ el.classList.toggle('collapsed',ic); });
    var msg=hf.closest('.message'), mid=msg?msg.dataset.msgId:(window.__dseCurrentMsg||null);
    var code=bl.querySelector('code'), pre=bl.querySelector('pre');
    blockOverrides[blockKey(mid, pre?pre.dataset.lang:'', code?code.textContent:'')]=ic?'close':'open';
    if(blockOrder.length>400) delete blockOverrides[blockOrder.shift()];
    e.preventDefault(); }; document.addEventListener('click', window.__r96clickHandler, true); }
patchHost('formatMarkdown', markedMake);
patchHost('buildCodeBlockHTML', codeblockMake);

/* ================= 96R · PEAK ================= */
function priceNet(mid, ts){ try{ var P=R.getPricing(providerOfModel(mid)); var off=P.models[mid]&&P.models[mid].off; var cur=R.priceAt(mid, ts||Date.now()); if(!off||!off.output) return 1; var net=(cur.output||0)/off.output; return isFinite(net)?net:1; }catch(e){ return 1; } }
function modelHasPeak(mid){ try{ var P=R.getPricing(providerOfModel(mid)); var m=P.models[mid]; if(m&&m.peak&&m.off&&(m.peak.output!==m.off.output||m.peak.inputCacheMiss!==m.off.inputCacheMiss||m.peak.inputCacheHit!==m.off.inputCacheHit)) return true; var pv=R.host.get('providers')||{}, p=pv[providerOfModel(mid)]||{}, ws=((p.sched&&p.sched.length)?p.sched:((p.windows&&p.windows.length)?p.windows:[])); for(var i=0;i<ws.length;i++){ if(ws[i]&&ws[i].state==='peak') return true; } return false; }catch(e){ return false; } }
  function modelHasDiscount(mid){ try{ var pv=R.host.get('providers')||{}, p=pv[providerOfModel(mid)]||{}, ws=((p.sched&&p.sched.length)?p.sched:((p.windows&&p.windows.length)?p.windows:[])); for(var i=0;i<ws.length;i++){ var w=ws[i]; if(w&&((w.scalar!=null&&w.scalar!==1)||(w.state&&w.state!=='peak'&&w.state!=='off'))) return true; } var P=R.getPricing(providerOfModel(mid)), m=P.models[mid]; if(m&&m.discount&&m.off&&m.discount.output!==m.off.output) return true; return false; }catch(e){ return false; } }
function nextBoundary(mid, now){ now=now||Date.now(); var cur=(R.priceAt(mid,now)||{}).bucket||'off'; var sched=effSchedFor(mid); var cand=[]; var d=new Date(now),y=d.getUTCFullYear(),mo=d.getUTCMonth(),da=d.getUTCDate(); for(var k=0;k<10;k++){ var base=Date.UTC(y,mo,da+k); var wd=new Date(base).getUTCDay(); for(var i=0;i<sched.length;i++){ var e=sched[i]; if(!e) continue; if(e.kind==='once'){ cand.push(e.from); cand.push(e.to); continue; } if(e.kind==='year'){ var yy=(k<6?y:y+1); var t0=Date.UTC(yy,e.mon,e.day); cand.push(t0+(e.from||0)); cand.push(t0+(e.to!=null?e.to:864e5)); continue; } if((!e.days||!e.days.length)||e.days.indexOf(wd)>=0){ cand.push(base+(e.from||0)); cand.push(base+(e.to!=null?e.to:864e5)); } } } cand=cand.filter(function(t){return t>now;}).sort(function(a,b){return a-b;}); for(var j=0;j<cand.length;j++){ if(((R.priceAt(mid,cand[j])||{}).bucket||'off')!==cur) return cand[j]; } return now+24*3600000; }
function computePeak(){ var mid=(typeof getCurrentModel==='function')?getCurrentModel():''; var st={ peak:false, net:1, bucket:'off', modelHasPeak:modelHasPeak(mid), at:Date.now(), boundaryAt:nextBoundary(mid) }; try{ st.net=priceNet(mid); st.bucket=R.priceAt(mid).bucket; st.peak=st.net>1; }catch(e){} window.__dsePeakState=st; return st; }
var peakTimerEl=null;
function defPos(){ var te=document.getElementById('dse-peak-timer'); if(!te) return; var h=document.querySelector('.header h1'); if(h){ var r=h.getBoundingClientRect(); te.style.left=(r.left-5)+'px'; te.style.top=(r.bottom+2)+'px'; return; } var c=document.getElementById('chatContainer'); if(c){ var cr=c.getBoundingClientRect(); te.style.left=(cr.left+16)+'px'; te.style.top=(cr.top+16)+'px'; } }
function ensurePeakTimer(){ if(peakTimerEl) return peakTimerEl; peakTimerEl=document.createElement('div'); peakTimerEl.id='dse-peak-timer';
  peakTimerEl.style.cssText='position:absolute;font-family:ui-monospace,monospace;font-size:10px;letter-spacing:1.2px;padding:0 2px;line-height:1;white-space:nowrap;cursor:grab;user-select:none;display:none;z-index:8990;pointer-events:auto;opacity:.8';
  document.body.appendChild(peakTimerEl); defPos(); var dr=false,dx=0,dy=0;
  peakTimerEl.addEventListener('pointerdown',function(e){ dr=true; dx=e.clientX-peakTimerEl.getBoundingClientRect().left; dy=e.clientY-peakTimerEl.getBoundingClientRect().top; try{ peakTimerEl.setPointerCapture(e.pointerId); }catch(x){} peakTimerEl.style.cursor='grabbing'; e.preventDefault(); });
  peakTimerEl.addEventListener('pointermove',function(e){ if(!dr)return; peakTimerEl.style.left=(e.clientX-dx)+'px'; peakTimerEl.style.top=(e.clientY-dy)+'px'; });
  peakTimerEl.addEventListener('pointerup',function(){ dr=false; peakTimerEl.style.cursor='grab'; });
  return peakTimerEl; }
function peakTick(){ var s=window.__dsePeakState; if(!s||!isFinite(s.boundaryAt)){ computePeak(); s=window.__dsePeakState; } var ms=s.boundaryAt-Date.now(); if(ms<=0){ computePeak(); applyPeakDisplay(); return; }
  var net=priceNet((typeof getCurrentModel==='function')?getCurrentModel():'');
  var _mid=(typeof getCurrentModel==='function')?getCurrentModel():''; var peakRel=(net>1)?((R.cfg.peakCounter||'off')!=='off'):(R.cfg.peakCounter==='next'); var discRel=(net<1)?((R.cfg.discountCounter||'off')!=='off'):(R.cfg.discountCounter==='next'); var mode=(peakRel||discRel)?'on':'off';
  var show=((peakRel&&modelHasPeak(_mid))||(discRel&&modelHasDiscount(_mid)));
  if(show){ var ss=Math.ceil(ms/1000),hh=Math.floor(ss/3600),mi=Math.floor((ss%3600)/60),sc=ss%60; var el=ensurePeakTimer();
    el.textContent=('0'+hh).slice(-2)+':'+('0'+mi).slice(-2)+':'+('0'+sc).slice(-2); el.style.display='block'; el.style.color=(net>1)?'var(--danger)':(net<1)?'var(--success)':'#e8e8e8'; }
  else if(peakTimerEl) peakTimerEl.style.display='none'; }
function applyPeakDisplay(){ var s=computePeak(); var net=s.net; document.body.classList.toggle('dse-peak',net>1); document.body.classList.toggle('dse-discount',net>0&&net<1); document.body.classList.toggle('dse-free',net===0); peakTick(); }
function peakCounterStart(){ if(window.__r96Tick) return; computePeak(); applyPeakDisplay(); window.__r96Tick=setInterval(peakTick,1000); }
function peakCounterStop(){ if(window.__r96Tick){ clearInterval(window.__r96Tick); window.__r96Tick=0; } }
function peakCostMake(next){ return function(version,raw,config,reportedExact){ var r=next.apply(this,arguments); try{ var net=(config&&config.m)?priceNet(config.m):1; version.metadata=version.metadata||{}; version.metadata.peakCost=net>1; }catch(e){} return r; }; }
function peakRenderMake(next){ return function(){ var r=next.apply(this,arguments); applyPeakDisplay(); return r; }; }
patchHost('applyResponseMetadata', peakCostMake);
patchHost('renderFullChat', peakRenderMake);
if(R.flags.marked) loadMarked();
if(R.cfg.peakCounter!=='off'||R.cfg.discountCounter!=='off') peakCounterStart();

/* ================= 96R · HOST-INTEGRATION (85/88) ================= */
R.__finDone = new Set();
function syncRelaxed(){ try{ var ac=(typeof activeControllers!=='undefined')?activeControllers:null; if(!ac) return; var busy=ac.size>0; var sb=document.getElementById('sendBtn'), tb=document.getElementById('stopBtn'); if(!sb||!tb) return;
  if(!R.cfg.relaxedSendCriteria){ if(busy){ tb.style.display='flex'; sb.style.display='none'; } else { tb.style.display='none'; sb.style.display='block'; } return; }
  var ta=document.getElementById('messageInput'); var txt=ta?String(ta.value||'').trim():''; var can=false; try{ var rr=run(); var k=getApiKey(rr.p.id); can=!!(txt&&k&&k.length>2&&rr.p.baseURL&&rr.p.apiPath&&rr.m); }catch(e){}
  if(can){ sb.disabled=false; sb.style.display='block'; tb.style.display='none'; } else if(busy){ tb.style.display='flex'; sb.style.display='none'; } else { tb.style.display='none'; sb.style.display='block'; } try{ var _b=busy; var _vis=getComputedStyle(sb).display!=='none'; var _ta2=document.getElementById('messageInput'); var _tx2=_ta2?String(_ta2.value||'').trim().length>0:false; sb.classList.toggle('relaxed-busy', !!(R.cfg.relaxedSendCriteria&&_b&&_vis&&_tx2)); }catch(e){} }catch(e){} }
window.__r96SyncRelaxed=syncRelaxed;
patchFn('finalizeGeneration', function(o){ return function(node,vIndex,controller){
  try{ var v=node&&node.versions&&node.versions[vIndex]; var hr=v&&v.metadata&&v.metadata.hunter;
    if(hr&&!hr.applied){ hr.applied=true; v.isDead=true; v.errorIcon='\u2620\uFE0F'; v.errorText=hr.reason||'Stale stream'; v.endTime=v.endTime||Date.now(); }
    var key=node&&(node.id+'|'+vIndex);
    if(key&&R.__finDone.has(key)&&!(typeof gens!=='undefined'&&gens[key])){ try{ updateNodeDOM(node); }catch(e){} try{ queueSave(node); }catch(e){} return; }
    if(key) R.__finDone.add(key);
    return o.apply(this,arguments);
  } finally { try{ if(controller&&typeof activeControllers!=='undefined') activeControllers.delete(controller); }catch(e){} try{ resetStopBtn(); }catch(e){} } }; });
patchFn('triggerAI', function(o){ return function(){
  var beforeC=new Set(typeof activeControllers!=='undefined'?activeControllers:[]); var beforeK=new Set(Object.keys(typeof gens!=='undefined'?gens:{}));
  var r=o.apply(this,arguments);
  try{ var nc=Array.from(typeof activeControllers!=='undefined'?activeControllers:[]).filter(function(c){ return !beforeC.has(c); }); var idx=0;
    Object.keys(typeof gens!=='undefined'?gens:{}).forEach(function(k){ if(!beforeK.has(k)&&gens[k]&&!gens[k].ctrl&&nc[idx]){ gens[k].ctrl=nc[idx]; idx++; } }); }catch(e){}
  return r; }; });
['resetStopBtn','updateSendBtn'].forEach(function(nm){ patchFn(nm, function(o){ return function(){ var r=o.apply(this,arguments); try{ syncRelaxed(); }catch(e){} return r; }; }); });
patchFn('saveHistory', function(o){ return function(){ try{ var r=o.apply(this,arguments); try{ setTimeout(R.audit, 2000); }catch(e){} return r; }catch(e){ return o.apply(this,arguments); } }; });
patchFn('saveHotMirror', function(o){ return function(){ try{ var r=o.apply(this,arguments);
    try{ var meta=JSON.parse(localStorage.getItem('dse_metadata')||'{}'); var cid=(typeof CHAT_ID!=='undefined'&&CHAT_ID)||'default'; var st=meta.chatStates&&meta.chatStates[cid]&&meta.chatStates[cid].storage;
      if(st&&st.localFailure&&window.__r96_lastMF!==st.localFailure){ window.__r96_lastMF=st.localFailure; console.warn('[96R] hot mirror failed (tree large?): '+new Date(st.localFailure).toISOString()); } }catch(e){}
    return r; }catch(e){ return o.apply(this,arguments); } }; });

window.__r96Reconcile = setInterval(function(){ try{ var gensN=Object.keys(typeof gens!=='undefined'?gens:{}).length; var all=(typeof chatTree!=='undefined')?Object.values(chatTree.nodes||{}):[]; var generating=all.filter(function(n){ return n&&n.isGenerating; }); var ac=(typeof activeControllers!=='undefined')?activeControllers:null;
  if(!gensN&&!generating.length&&ac&&ac.size){ ac.clear(); try{ resetStopBtn(); }catch(e){} }
  var gk=new Set(Object.keys(typeof gens!=='undefined'?gens:{})); var now=Date.now();
  generating.forEach(function(n){ try{ var vi=n.activeVersion||0, v=n.versions[vi]; if(!v) return; var key=(typeof genKey==='function')?genKey(n.id,vi):''; if(gk.has(key)) return; var pre=n.id+'|'; if(Array.from(gk).some(function(x){ return x.indexOf(pre)===0; })) return; var live=false; try{ if(typeof liveGen==='function') live=liveGen((typeof vp==='function')?vp(n,v):(n.p||''),key); }catch(e){} var started=v.startTime||n.e||0;
    if(!live&&!v.endTime&&!v.isDead&&now-started>15000&&document.visibilityState!=='hidden'){ v.isDead=true; v.errorIcon='\u2620\uFE0F'; v.errorText='Generation failed to start'; v.endTime=now; n.isGenerating=false; try{ finalizeGeneration(n,vi); }catch(e){} } }catch(e){} }); }catch(e){} }, 2000);
if(R.cfg.staleHunter){ window.__r96Hunter=setInterval(function(){ try{ var now=Date.now(), ms=R.cfg.staleHunterMs||900000; for(var k in (typeof gens!=='undefined'?gens:{})){ var g=gens[k], n=g.node, v=n.versions[g.v]; if(!v||v.endTime||v.isDead) continue; if(!n.lastUpdateTime) continue; var age=now-n.lastUpdateTime; if(age<ms) continue; try{ v.metadata=v.metadata||{}; v.metadata.hunter={ age:age, at:now, reason:'Stale stream auto-stopped (no chunks for '+Math.round(age/1000)+'s)' }; }catch(e){} try{ if(g.ctrl&&g.ctrl.abort) g.ctrl.abort(); }catch(e){} } }catch(e){} }, 5000); }

/* ================= 96R · UI ================= */
R.CSS = {
 'eval1-ui':
   '.exp-info{background:none;border:1px solid var(--border);color:var(--text-secondary);border-radius:50%;width:17px;height:17px;font-size:10px;line-height:1;padding:0;cursor:help;vertical-align:middle;margin-left:4px;flex-shrink:0}.exp-info:hover{background:var(--border);color:var(--text)}'
  +'.exp-popup-wrap{position:fixed;inset:0;z-index:8900;pointer-events:none}.exp-popup-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.45);pointer-events:none}.exp-popup{position:absolute;top:max(64px,calc(env(safe-area-inset-top,0px) + 56px + 8px));left:50%;transform:translateX(-50%);width:min(540px,calc(100dvw - 24px));max-height:calc(100dvh - 120px);display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.6);pointer-events:auto;overflow:hidden}.exp-popup-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-weight:600;font-size:.85rem}.exp-popup-x{background:none;border:none;color:var(--text-secondary);font-size:1.2rem;cursor:pointer;line-height:1;padding:0 4px}.exp-popup-x:hover{color:var(--text)}.exp-popup-body{padding:12px 14px;overflow-y:auto;font-size:.78rem;line-height:1.6;color:var(--text)}.exp-popup-body code{background:var(--code-bg);padding:1px 5px;border-radius:4px;font-size:.72rem}.exp-popup-foot{padding:8px 14px;border-top:1px solid var(--border);display:flex;justify-content:flex-end}.exp-popup-close{background:var(--accent);color:#fff;border:none;padding:5px 14px;border-radius:8px;font-size:.75rem;cursor:pointer}'
  +'.code-header,.code-footer{cursor:pointer;user-select:none}.code-header button,.code-footer button{cursor:pointer}.block-arrow{display:inline-grid;place-content:center;min-width:24px;min-height:24px;padding:4px 8px;margin:-4px -8px;border-radius:4px}.block-arrow:hover{background:rgba(255,255,255,.08)}'
  +'body.dse-peak .msg-stats .cost-pill{color:var(--danger)!important;font-weight:800!important}body.dse-peak .send-btn{-webkit-text-stroke:1px var(--danger);-webkit-text-fill-color:#fff;color:#fff}.msg-stats .cost-pill.peak-cost{color:var(--danger)!important;font-weight:800!important}'
  +'.settings-panel{max-height:calc((100dvh - 56px - 96px) * 0.95)!important;overflow:hidden!important;padding:.6em .9em!important}.settings-panel>.tabs{flex-shrink:0!important;overflow:hidden!important;margin-bottom:.25em!important}.settings-panel>.tabs .tab-btn{padding:.15em .3em!important;font-size:.75rem!important;display:inline!important}.settings-panel>.tab-content{display:none!important;flex-direction:column!important;min-height:0!important}.settings-panel>.tab-content.active{display:flex!important;flex:1 1 auto!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-gutter:stable!important;padding:4px 12px 4px 4px!important;gap:8px!important}.settings-panel>#applySettingsBtn{flex-shrink:0!important;margin-top:8px!important}.settings-panel select{field-sizing:content!important;min-width:0!important;flex:0 1 auto!important}.settings-panel .setting-row select{margin-left:auto!important}.settings-panel input:not([type="checkbox"]):not([type="file"]):not([type="range"]),.settings-panel textarea:not(.xt),.input-area textarea{box-sizing:content-box!important;padding-right:calc(10% + 3ch)!important}#modelSelect{align-self:stretch!important;width:100%!important}#aL .ar,#swarmRows .ar{grid-template-columns:auto minmax(0,1fr) auto!important;column-gap:8px!important;padding:2px 8px!important;min-height:34px!important;border-radius:8px!important}#aL .ag{display:flex!important;flex-wrap:nowrap!important;align-items:center!important;gap:4px!important;overflow:hidden!important}#aL .af{display:inline-flex!important;align-items:center!important;gap:2px!important;font-size:10px!important;flex-shrink:1!important;min-width:0!important}#aL .xt{height:24px!important;min-height:24px!important;max-height:24px!important;field-sizing:fixed!important;padding:0 4px!important;line-height:24px!important;font-size:11px!important;overflow:hidden!important}#aL .ar b{font-size:11px!important;white-space:nowrap!important;align-self:center!important}#tab-swarm{gap:.2em!important}'
  +'#expToolEchoCollapse,#msgCollapseSize,#blockCollapseSize{width:auto!important;box-sizing:content-box!important;padding-right:calc(10% + 3ch)!important}',
 'dse-ui-fix':
   '#settingsPanel input:not([type="checkbox"]):not([type="file"]):not([type="range"]){box-sizing:content-box!important;padding:4px 8px!important;padding-inline-end:calc(var(--text-w,0px) * 0.1 + 3ch)!important;min-width:0!important;width:auto!important;field-sizing:content!important;flex-shrink:0!important}#settingsPanel select{width:auto!important;max-width:100%!important;flex:0 1 auto!important}#settingsPanel .setting-row{flex-wrap:nowrap!important;align-items:center!important;min-height:24px!important}#settingsPanel .setting-row>span:first-child{flex:0 1 auto!important;min-width:0!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}#settingsPanel .setting-row label.toggle{margin-left:auto!important;flex-shrink:0!important}#tab-exp select{min-width:0!important;padding:2px .5em!important;padding-right:calc(2% + 1ch)!important;line-height:1.3!important}#tab-io select{padding:2px .5em!important;padding-right:calc(2% + 1ch)!important;max-width:100%!important}#tab-exp .setting-row>span:last-child{margin-left:auto!important;display:inline-flex!important;align-items:center!important;gap:6px!important}#tab-other .setting-row:has(>div)>label.toggle{margin-left:0!important}.exp-tabs{margin-bottom:8px!important;padding-bottom:4px!important}.exp-tabs .tab-btn{font-size:.72rem!important;padding:3px 8px!important}#tab-exp>.tab-content{gap:4px!important}#tab-exp .setting-row>span:first-child{font-size:12px!important}#expToolEchoCollapse,#msgCollapseSize,#blockCollapseSize{width:auto!important;box-sizing:content-box!important;padding-right:calc(10% + 3ch)!important}#tab-exp #expRoute{margin-left:auto!important;text-align:right!important;white-space:nowrap!important;overflow:hidden!important;max-width:100%!important}#tab-model{padding-right:.3em!important}.settings-panel input[type="password"]{padding-left:8px!important}.settings-panel .setting-row:has(.toggle):not(:has(input:not([type="checkbox"]),select,textarea)){padding-right:0!important}#settingsPanel #providerSelect{flex:1 1 0%!important;field-sizing:fixed!important;max-width:none!important}#settingsPanel #modelSelect{width:100%!important;max-width:none!important;align-self:stretch!important}#apiKeyInput{flex:1 1 0%!important;field-sizing:fixed!important;padding-right:calc(10% + 3ch)!important}',
 'dse-ui-collapser-fix': '#msgCollapseSize,#blockCollapseSize{box-sizing:content-box!important;padding-right:calc(10% + 3ch)!important}',
 'dse-85-pills': 'body.dse-peak .msg-stats .cost-pill{color:inherit!important;font-weight:inherit!important}.msg-stats .cost-pill.peak-cost{color:var(--danger)!important;font-weight:800!important}.msg-stats .cost-pill.discount-cost{color:var(--success)!important;font-weight:800!important}.msg-stats .cost-pill.free-cost{color:var(--success)!important;font-weight:800!important}body.dse-discount .send-btn,body.dse-free .send-btn{-webkit-text-stroke:1px var(--success);-webkit-text-fill-color:#fff;color:#fff}',
 'dse-bal68-css': '#costInfo [data-bal68line]{white-space:nowrap!important;overflow:hidden!important;max-width:100%!important}#tab-exp .exp-tabs{flex-shrink:0!important;height:auto!important;min-height:24px!important;overflow:visible!important}#tab-exp .exp-tabs .tab-btn{flex-shrink:0!important;display:inline-block!important}',
 'dse-hfix70': '#settingsPanel #tab-other .setting-row:has(#rBX)>label.toggle{margin-left:4.33em!important}#rBX{text-align:right!important}',
 'autoSrcPadRule': '#settingsPanel #expAutoSourceToken{padding:1px 6px!important}#settingsPanel #expAutoSourceToken{padding-right:calc(var(--text-w,0px)*var(--ap,0.1) + var(--ach,3ch))!important;padding-inline-end:calc(var(--text-w,0px)*var(--ap,0.1) + var(--ach,3ch))!important}',
 'dse-92-ring': '.send-btn.relaxed-busy{box-shadow:0 0 0 2px rgba(224,85,106,.75),0 0 8px rgba(224,85,106,.35)!important}',
 'dse-marked-css': '.bubble table{border-collapse:collapse;width:100%;margin:12px 0;font-size:.85rem;overflow-x:auto;display:block}.bubble th,.bubble td{border:1px solid var(--border);padding:8px 12px;text-align:left}.bubble th{background:rgba(0,0,0,.3);font-weight:bold;color:var(--accent)}.bubble tbody tr:nth-child(even){background:rgba(0,0,0,.15)}'
};
R.applyCSS = function(){ var order=['eval1-ui','dse-ui-fix','dse-ui-collapser-fix','dse-85-pills','dse-bal68-css','dse-hfix70','autoSrcPadRule','dse-92-ring','dse-marked-css'];
  for(var i=0;i<order.length;i++){ var id=order[i]; var s=document.getElementById(id); if(!s){ s=document.createElement('style'); s.id=id; document.head.appendChild(s); } s.textContent=R.CSS[id]; } };
R.applyCSS();
R.EXP_INFO = { 'API mode':'auto per-model routing · chat force chat · responses profiled models to /responses.','use eval in providers':'run provider eval code before each request.','Peak counter':'off / till end / till next.','discount counter':'discount/free countdown.','Thinking history':'all / only when tools / off.','relaxed send criteria':'send while a stale/busy generation blocks the button.','aggressive stale hunter':'auto-finalize stale streams.','Cost balance':'show remaining balance in the cost popup.','record balance snapshot per message':'store a balance snapshot per message.','Status pill':'header indicator, click cycles mode.','Anthropic bridge':'deepseek chat to /anthropic/v1/messages.','Streaming bridge':'stream deepseek via anthropic SSE.','Responses hybrid':'chat to /responses for profiled models.','Marked tables':'marked.js GFM renderer.','Paint interval (ms)':'delta-coalescer cadence.','routing algorithm':'where the next request goes.','About':'96R version.','Agentic tools':'attach the eval tool.','Eval tool version':'which tool_eval schema.','Name override (cache mask)':'rename the attached tool.','Tool limit per message':'max tool-call rounds.','Tool round cost in its results':'append per-round cost to tool results.','Web search':'attach server web_search.','Show \ud83d\udd0e trace':'print [web_search] query.','Tool block collapse':'collapse tool-echo blocks.','Tool font scale':'tool-echo font scale.','api shape':'fallback.','pricing':'fallback.' };
function popupHTML(text,title){ var old=document.getElementById('expPopupWrap'); if(old) old.remove(); var w=document.createElement('div'); w.id='expPopupWrap'; w.className='exp-popup-wrap'; w.innerHTML='<div class="exp-popup-backdrop"></div><div class="exp-popup"><div class="exp-popup-head"><span>'+esc(title)+'</span><button class="exp-popup-x" data-expx="1">\u00d7</button></div><div class="exp-popup-body">'+text+'</div><div class="exp-popup-foot"><button class="exp-popup-close" data-expx="1">Close</button></div></div>'; document.body.appendChild(w); w.addEventListener('click',function(e){ if(e.target.closest('[data-expx]')){ w.remove(); return; } if(!e.target.closest('.exp-popup')) w.remove(); }); }
function infoBtn(label){ var b=document.createElement('button'); b.type='button'; b.className='exp-info'; b.title=label; b.textContent='\u24d8'; b.addEventListener('click',function(ev){ ev.preventDefault(); ev.stopPropagation(); popupHTML(String(R.EXP_INFO[label]||label),label); }); return b; }
function expRow(label, ctrl){ return '<div class="setting-row"><span>'+esc(label)+'</span>'+ctrl+'</div>'; }
function expTg(id,on){ return '<label class="toggle"><input type="checkbox" id="'+id+'"'+(on?' checked':'')+'><span class="slider"></span></label>'; }
function expSel(id,opts,val){ return '<select id="'+id+'">'+opts.map(function(o){ return '<option value="'+o[0]+'"'+(o[0]===val?' selected':'')+'>'+o[1]+'</option>'; }).join('')+'</select>'; }
R.removeExpTab = function(){ var b=document.querySelector('.tab-btn[data-tab="exp"]'); if(b) b.remove(); var c=document.getElementById('tab-exp'); if(c) c.remove(); var w=document.getElementById('expPopupWrap'); if(w) w.remove(); };
R.buildExpTab = function(){ R.removeExpTab();
  var swarmBtn=document.querySelector('.tab-btn[data-tab="swarm"]'), swarmTab=document.getElementById('tab-swarm'); if(!swarmBtn||!swarmTab) return;
  swarmBtn.insertAdjacentHTML('afterend','<button class="tab-btn" data-tab="exp">Exp</button>');
  var C=R.cfg, F=R.flags;
  var autoSrcRow = '<div class="setting-row" style="flex-wrap:nowrap;align-items:center"><div id="autoSrcLabel" style="display:inline-flex;align-items:center;gap:5px;flex:1;min-width:0">auto update source to default\u2192<input type="text" id="expAutoSourceToken" value="'+esc(C.autoSourceToken||'edited')+'" style="font:inherit;min-width:40px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:4px"><span style="white-space:nowrap"> when edited</span><button type="button" class="exp-info" title="auto update source">\u24d8</button></div><label class="toggle"><input type="checkbox" id="expAutoSourceOn"'+(C.autoSourceOn?' checked':'')+'><span class="slider"></span></label></div>';
  var gen = '<div class="tab-content active" id="exp-sub-general">'
   + expRow('API mode', expSel('expMode',[['auto','auto'],['chat','chat'],['responses','responses']], C.mode))
   + expRow('use eval in providers', expTg('expEvalInProviders', C.evalInProviders))
   + expRow('Peak counter', expSel('expPeakCounter',[['off','off'],['end','till end'],['next','till next']], C.peakCounter||'off'))
   + expRow('discount counter', expSel('expDiscountCounter',[['off','off'],['end','till end'],['next','till next']], C.discountCounter||'off'))
   + expRow('Thinking history', expSel('expThinkingHistory',[['all','all'],['tools','tools'],['off','off']], C.thinkingHistory||'all'))
   + expRow('relaxed send criteria', expTg('expRelaxedSend', C.relaxedSendCriteria))
   + autoSrcRow
   + expRow('aggressive stale hunter', expTg('expStaleHunter', C.staleHunter)+'<input type="number" id="expStaleHunterMs" min="60000" step="60000" value="'+(C.staleHunterMs||900000)+'" style="width:90px">')
   + expRow('Cost balance', expSel('expCostBalance',[['off','off'],['current','current key'],['provider','all in current provider'],['all','all keys']], C.costBalance||'off'))
   + expRow('record balance snapshot per message', expTg('expBalanceSnap', C.balanceSnap))
   + expRow('Status pill', expTg('expPill', !!F.pill))
   + expRow('Anthropic bridge', expTg('expAnthropic', !!F.anthropic))
   + expRow('Streaming bridge', expTg('expBridgeStream', !!F.bridgeStream))
   + expRow('Responses hybrid', expTg('expHybrid', !!F.hybrid))
   + expRow('Marked tables', expTg('expMarked', !!F.marked))
   + expRow('Paint interval (ms)', '<input type="number" id="expPaint" min="40" step="10" value="'+C.paintIntervalMs+'" style="width:75px">')
   + expRow('routing algorithm', '<span id="expRoute" style="display:none"></span><button type="button" id="expRouteBtn" class="btn-outline" style="margin-left:auto">details \u24d8</button>')
   + expRow('About', '<span style="font-size:.68rem;color:var(--text-secondary)">v'+R.version+'</span>')
   + '</div>';
  var tools = '<div class="tab-content" id="exp-sub-tools">'
   + expRow('Agentic tools', expSel('expToolsMode',[['on','on'],['auto','auto(to cache hit)'],['off','off']], C.agenticTools||'on'))
   + expRow('Eval tool version', '<select id="expEvalToolVersion"></select>')
   + expRow('Name override (cache mask)', '<span style="display:inline-flex;align-items:center;gap:6px"><input type="text" id="expEvalToolNameOverride" value="'+(C.evalToolNameOverride||'tool_eval_1')+'" style="width:90px;box-sizing:content-box;min-width:90px;padding:4px 8px">'+expTg('expEvalToolNameOverrideOn', C.evalToolNameOverrideOn)+'</span>')
   + expRow('Tool limit per message', '<span style="display:inline-flex;align-items:center;gap:6px"><input type="number" id="expToolMaxTurns" min="1" step="1" value="'+(C.toolMaxTurns||100)+'">'+expTg('expToolMaxTurnsOn', C.toolMaxTurnsOn!==false)+'</span>')
   + expRow('Tool round cost in its results', expTg('expToolCost', C.toolCostNote!==false))
   + expRow('Web search', expTg('expWebSearch', C.webSearch))
   + expRow('Show \ud83d\udd0e trace', expTg('expShowTrace', C.showSearchTrace))
   + expRow('Tool block collapse', '<span style="display:inline-flex;align-items:center;gap:6px"><input type="number" id="expToolEchoCollapse" min="0" step="100" value="'+(C.toolEchoCollapseChars!=null?C.toolEchoCollapseChars:2000)+'"'+(C.toolEchoCollapseOn===false?' disabled':'')+'>'+expTg('expToolEchoCollapseOn',C.toolEchoCollapseOn!==false)+'</span>')
   + expRow('Tool font scale', '<input type="number" id="expToolFontScale" min="0.01" max="2" step="0.05" value="'+(C.toolFontScale||0.7)+'">')
   + '</div>';
  var fb = '<div class="tab-content" id="exp-sub-fallbacks">'
   + expRow('api shape', expSel('expApiShape',[['off','off'],['auto','auto'],['on','on']], C.apiShapeFallback||'auto'))
   + expRow('pricing', expSel('expPricing',[['off','off'],['auto','auto'],['on','on']], C.pricingFallback||'auto'))
   + '</div>';
  var html = '<div class="tab-content" id="tab-exp"><div class="tabs exp-tabs"><button class="tab-btn active" data-exp-sub="general">General</button><button class="tab-btn" data-exp-sub="tools">Tools</button><button class="tab-btn" data-exp-sub="fallbacks">Fallbacks</button></div>'+ gen + tools + fb + '</div>';
  swarmTab.insertAdjacentHTML('afterend', html);
  var btn=document.querySelector('.tab-btn[data-tab="exp"]'); if(btn) btn._=document.getElementById('tab-exp');
  document.querySelectorAll('#tab-exp .exp-tabs > .tab-btn').forEach(function(b){ b._=document.getElementById('exp-sub-'+b.dataset.expSub); });
  document.getElementById('tab-exp').querySelectorAll('.setting-row').forEach(function(r){ var s=r.querySelector(':scope > span:first-child'); if(s && !s.querySelector('.exp-info')) s.appendChild(infoBtn(s.textContent.trim())); });
  var on=function(id,ev,fn){ var el=document.getElementById(id); if(el) el.addEventListener(ev,fn); };
  on('expMode','change',function(e){ R.setMode(e.target.value); });
  on('expEvalInProviders','change',function(e){ R.setEvalInProviders(e.target.checked); });
  on('expPeakCounter','change',function(e){ R.setPeakCounter(e.target.value); });
  on('expDiscountCounter','change',function(e){ R.setDiscountCounter(e.target.value); });
  on('expThinkingHistory','change',function(e){ R.setThinkingHistory(e.target.value); });
  on('expRelaxedSend','change',function(e){ R.setRelaxedSendCriteria(e.target.checked); });
  on('expAutoSourceOn','change',function(e){ R.setAutoSourceOn(e.target.checked); });
  on('expAutoSourceToken','change',function(e){ R.setAutoSourceToken(e.target.value.trim()); });
  on('expStaleHunter','change',function(e){ R.setStaleHunter(e.target.checked); });
  on('expStaleHunterMs','change',function(e){ R.setStaleHunterMs(parseInt(e.target.value,10)||900000); });
  on('expCostBalance','change',function(e){ R.setCostBalance(e.target.value); });
  on('expBalanceSnap','change',function(e){ R.setBalanceSnap(e.target.checked); });
  on('expPill','change',function(e){ R.setFlag('pill',e.target.checked?1:0); });
  on('expAnthropic','change',function(e){ R.setFlag('anthropic',e.target.checked?1:0); });
  on('expBridgeStream','change',function(e){ R.setFlag('bridgeStream',e.target.checked?1:0); });
  on('expHybrid','change',function(e){ R.setFlag('hybrid',e.target.checked?1:0); });
  on('expMarked','change',function(e){ R.setFlag('marked',e.target.checked?1:0); });
  on('expPaint','change',function(e){ R.setPaintInterval(parseFloat(e.target.value)); });
  on('expToolsMode','change',function(e){ R.cfg.agenticTools=e.target.value; R.setFlag('tools', e.target.value==='off'?0:1); });
  on('expWebSearch','change',function(e){ R.setWebSearch(e.target.checked); });
  on('expShowTrace','change',function(e){ R.setShowSearchTrace(e.target.checked); });
  on('expToolCost','change',function(e){ R.cfg.toolCostNote=e.target.checked; R.save(); });
  on('expToolFontScale','change',function(e){ R.setToolFontScale(parseFloat(e.target.value)); });
  on('expToolMaxTurns','change',function(e){ R.setToolMaxTurns(parseInt(e.target.value,10)||100); });
  on('expToolMaxTurnsOn','change',function(e){ R.setToolMaxTurnsOn(e.target.checked); });
  on('expToolEchoCollapse','change',function(e){ var n=parseInt(e.target.value,10); R.setToolEchoCollapse(Number.isFinite(n)&&n>=0?n:2000); });
  on('expToolEchoCollapseOn','change',function(e){ R.setToolEchoCollapseOn(e.target.checked); var n=document.getElementById('expToolEchoCollapse'); if(n) n.disabled=!e.target.checked; });
  on('expApiShape','change',function(e){ R.setApiShapeFallback(e.target.value); }); on('expEvalToolNameOverride','change',function(e){ R.setEvalToolNameOverride(e.target.value.trim()); }); on('expEvalToolNameOverrideOn','change',function(e){ R.setEvalToolNameOverrideOn(e.target.checked); });
  on('expPricing','change',function(e){ R.setPricingFallback(e.target.value); });
  var selEl=document.getElementById('expEvalToolVersion'); if(selEl){ var add=function(v,l){ selEl.appendChild(new Option(l,v)); }; add('off','off'); add('auto','auto (last used)'); var g=document.createElement('optgroup'); g.label='52-55.js'; selEl.appendChild(g); [1,2,3,4,5].forEach(function(id){ g.appendChild(new Option('tool_eval_'+id,String(id))); }); g=document.createElement('optgroup'); g.label='56.js'; selEl.appendChild(g); g.appendChild(new Option('tool_eval_6 (cost-annotated)','6')); g=document.createElement('optgroup'); g.label='60.js'; selEl.appendChild(g); g.appendChild(new Option('tool_eval_7 (60.js)','7')); selEl.value=R.cfg.evalToolVersion||'auto'; selEl.addEventListener('change',function(e){ R.setEvalToolVersion(e.target.value); }); }
  R.updateExpRoute();
};
R.updateExpRoute=function(){ var r=(function(){ var route=document.getElementById('expRoute'); if(!route) return; var parts=[]; var m=R.cfg.mode; if(m==='responses') parts.push('deepseek + gpt-5.6 \u2192 /responses'); else if(m==='chat') parts.push('all \u2192 chat'); else parts.push('deepseek \u2192 anthropic bridge \u00b7 openai profiled \u2192 /responses \u00b7 others \u2192 chat'); route.textContent=parts.join(' \u00b7 '); }).apply(this,arguments); try{ fitRoute96(); }catch(e){} return r; };
R.combine = function(label,numId,tglId){ var num=document.getElementById(numId), tgl=document.getElementById(tglId); var tglLabel=tgl&&tgl.parentElement; var sizeRow=num&&num.closest('.setting-row'), tglRow=tgl&&tgl.closest('.setting-row'); if(!num||!tglLabel||!sizeRow||!tglRow||sizeRow===tglRow) return false; var row=document.createElement('div'); row.className='setting-row'; var lab=document.createElement('span'); lab.textContent=label; var ctrl=document.createElement('span'); ctrl.style.cssText='display:inline-flex;align-items:center;gap:6px'; ctrl.appendChild(num); ctrl.appendChild(tglLabel); row.appendChild(lab); row.appendChild(ctrl); sizeRow.replaceWith(row); tglRow.remove(); return true; };
R.doCombine = function(){ R.combine('Auto-collapse message','msgCollapseSize','msgAutoCollapse'); R.combine('Auto-collapse block','blockCollapseSize','blockAutoCollapse'); };
R.addTechnical = function(__tries){ __tries=(__tries==null?40:__tries); var host=document.getElementById('rBX'); if(!host){ if(__tries>0) setTimeout(function(){ R.addTechnical(__tries-1); },250); return; } if(document.getElementById('expTechnicalUser')) return; var row=document.createElement('div'); row.className='setting-row'; row.style.cssText='margin-top:4px;'; row.innerHTML='<span>technical</span><label class="toggle"><input type="checkbox" id="expTechnicalUser"'+(R.cfg.technicalUser?' checked':'')+'><span class="slider"></span></label>'; host.appendChild(row); var inp=document.getElementById('expTechnicalUser'); inp.addEventListener('change',function(e){ R.setTechnicalUser(e.target.checked); }); };
R.shortenImports = function(){ var s=document.getElementById('importModeSelect'); if(!s) return; var m={ 'Merge same chats under main branches like 1.15':'merge same chat \u2192 branch 1.15', 'Merge only if different chat ID':'merge if different chat ID', 'Replace all with imported (getting backup suggested)':'replace all (backup suggested)' }; Array.prototype.slice.call(s.options).forEach(function(o){ if(m[o.textContent]) o.textContent=m[o.textContent]; }); };
R.setPillText = function(){ var el=document.getElementById('eval1Pill'); if(el) el.textContent='API '+((R.stats&&R.stats.last&&R.stats.last.mode)||R.cfg.mode); };
R.buildUI = function(){ if(R.flags.pill && !document.getElementById('eval1Pill')){ var el=document.createElement('span'); el.id='eval1Pill'; el.title='96R';
    el.style.cssText='font-size:.68rem;padding:2px 8px;border-radius:6px;background:var(--border);color:var(--text-secondary);font-family:monospace;white-space:nowrap;cursor:help;';
    el.textContent='API '+R.cfg.mode; el.addEventListener('click',function(){ R.cfg.mode=(R.cfg.mode==='responses'?'chat':(R.cfg.mode==='chat'?'auto':'responses')); R.save(); R.setPillText(); R.applyFetch(); });
    var hr=document.querySelector('.header-right'); if(hr) hr.insertBefore(el,hr.firstChild); } else { R.setPillText(); } };
(function(){ if(window.__r96Pad) return; window.__r96Pad=1;
  var mirror=document.createElement('span'); mirror.setAttribute('data-r96-mirror','1'); mirror.style.cssText='position:absolute;visibility:hidden;white-space:pre;pointer-events:none'; document.body.appendChild(mirror);
  function sync(inp){ try{ var cs=getComputedStyle(inp);
    mirror.style.cssText='position:absolute;visibility:hidden;white-space:pre;pointer-events:none;font:'+cs.font+';letter-spacing:'+cs.letterSpacing+';padding-left:'+cs.paddingLeft+';border-left:'+cs.borderLeftWidth+' solid';
    mirror.textContent=inp.value||inp.placeholder||'';
    inp.style.setProperty('--text-w', Math.round(mirror.getBoundingClientRect().width)+'px'); }catch(e){} }
  function syncAll(){ Array.prototype.forEach.call(document.querySelectorAll('#settingsPanel input:not([type=checkbox]):not([type=file]):not([type=range])'), sync); }
  syncAll();
  window.__r96padIn=function(e){ if(e.target&&e.target.matches&&e.target.matches('#settingsPanel input')) sync(e.target); }; document.addEventListener('input',window.__r96padIn);
  window.__r96padCh=function(e){ if(e.target&&e.target.matches&&e.target.matches('#settingsPanel input')) sync(e.target); }; document.addEventListener('change',window.__r96padCh);
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(syncAll);
  var sp=document.getElementById('settingsPanel');
  if(sp&&!window.__r96PadObs){ window.__r96PadObs=new MutationObserver(syncAll); window.__r96PadObs.observe(sp,{childList:true,subtree:true,attributes:true,attributeFilter:['class']}); }
  window.__r96padRs=syncAll; window.addEventListener('resize',window.__r96padRs);
})();
R._rebuildExpTab = function(){ R.buildExpTab(); R.doCombine(); R.addTechnical(); R.shortenImports(); };
R.buildExpTab(); R.doCombine(); R.addTechnical(); R.shortenImports(); R.buildUI();

/* ================= 96R · API SURFACE ================= */
function setCfg(k,v){ R.cfg[k]=v; R.save(); return v; }
R.setFlag=function(){ var n=arguments[0], v=arguments[1]; var r=(function(n,v){ R.flags[n]=v?1:0; R.applyFetch(); if(n==='pill'){ if(R.flags.pill){ R.buildUI(); } else { var p=document.getElementById('eval1Pill'); if(p) p.remove(); } } if(n==='marked'&&R.flags.marked) loadMarked(); R.save(); return JSON.parse(JSON.stringify(R.flags)); }).apply(this,arguments); try{ if(n==='marked') applyMarked(); if(R.setPillText) R.setPillText(); if(R.updateExpRoute) R.updateExpRoute(); }catch(e){} return r; };
R.set=function(k,v,d){ if(typeof v==='function'&&arguments.length>=2&&typeof k==='string'){ var prev=R._slots.get(k); if(prev&&prev.dispose){ try{prev.dispose();}catch(e){} } R._slots.set(k,{fn:v,dispose:d,owner:'96R',at:Date.now()}); R[k]=v; return R; } if(!(k in R.cfg)) throw Error('96R: unknown setting '+k); var _rv=setCfg(k,v); if(k==='mode'){ try{ R.setPillText(); R.updateExpRoute(); }catch(e){} } return _rv; };
R.setMode=function(){ var r=(function(v){ return setCfg('mode',v); }).apply(this,arguments); try{ R.setPillText(); R.updateExpRoute(); }catch(e){} return r; };
R.setWebSearch=function(v){ return setCfg('webSearch',v); };
R.setShowSearchTrace=function(v){ return setCfg('showSearchTrace',v); };
R.setPaintInterval=function(v){ return setCfg('paintIntervalMs',v); };
R.setThinkingHistory=function(v){ return setCfg('thinkingHistory',v); };
R.setToolEchoCollapse=function(v){ return setCfg('toolEchoCollapseChars',v); }; R.setToolEchoCollapseOn=function(v){ return setCfg('toolEchoCollapseOn',!!v); };
R.setToolFontScale=function(v){ return setCfg('toolFontScale',v); };
R.setToolMaxTurns=function(v){ if(!Number.isFinite(+v)||+v<1) v=100; return setCfg('toolMaxTurns',v); };
R.setToolMaxTurnsOn=function(v){ return setCfg('toolMaxTurnsOn',v); };
R.setPeakCounter=function(v){ setCfg('peakCounter',v); (((R.cfg.peakCounter||'off')!=='off'||(R.cfg.discountCounter||'off')!=='off')?peakCounterStart():peakCounterStop()); applyPeakDisplay(); return v; };
R.setDiscountCounter=function(v){ setCfg('discountCounter',v); (((R.cfg.peakCounter||'off')!=='off'||(R.cfg.discountCounter||'off')!=='off')?peakCounterStart():peakCounterStop()); applyPeakDisplay(); return v; };
R.setEvalToolNameOverride=function(v){ return setCfg('evalToolNameOverride',v); };
R.setEvalToolNameOverrideOn=function(v){ return setCfg('evalToolNameOverrideOn',v); };
R.setEvalInProviders=function(v){ return setCfg('evalInProviders',v); };
R.setApiShapeFallback=function(v){ return setCfg('apiShapeFallback',v); };
R.setPricingFallback=function(v){ return setCfg('pricingFallback',v); };
R.setCostBalance=function(v){ return setCfg('costBalance',v); };
R.setBalanceSnap=function(v){ return setCfg('balanceSnap',v); };
R.setTechnicalUser=function(v){ return setCfg('technicalUser',v); };
R.setRelaxedSendCriteria=function(v){ setCfg('relaxedSendCriteria',v); try{ syncRelaxed(); }catch(e){} return v; };
R.setStaleHunter=function(v){ setCfg('staleHunter',v); try{ if(v){ if(!window.__r96Hunter){ window.__r96Hunter=setInterval(function(){ try{ var now=Date.now(), ms=R.cfg.staleHunterMs||900000; for(var k in (typeof gens!=='undefined'?gens:{})){ var g=gens[k], n=g.node, vv=n&&n.versions&&n.versions[g.v]; if(!vv||vv.endTime||vv.isDead) continue; if(!n.lastUpdateTime) continue; var age=now-n.lastUpdateTime; if(age<ms) continue; try{ vv.metadata=vv.metadata||{}; vv.metadata.hunter={age:age,at:now,reason:'Stale stream auto-stopped (no chunks for '+Math.round(age/1000)+'s)'}; }catch(e){} try{ if(g.ctrl&&g.ctrl.abort) g.ctrl.abort(); }catch(e){} } }catch(e){} }, 5000); } } else { if(window.__r96Hunter){ clearInterval(window.__r96Hunter); window.__r96Hunter=0; } } }catch(e){} return v; };
R.setStaleHunterMs=function(v){ return setCfg('staleHunterMs',v); };
R.setAutoSourceOn=function(v){ return setCfg('autoSourceOn',v); };
R.setAutoSourceToken=function(v){ return setCfg('autoSourceToken',v); };
(function(){ try{ var b=document.getElementById('saveProvJsonBtn'); if(b){ if(window.__r96saveProvFn) b.removeEventListener('click',window.__r96saveProvFn); var snap=function(){ var o={}; Object.keys(providers||{}).forEach(function(id){ try{ o[id]=JSON.stringify(providers[id]); }catch(e){} }); return o; }; window.__r96lastProv=snap(); b.addEventListener('click',window.__r96saveProvFn=function(){ setTimeout(function(){ try{ if(R.cfg.evalInProviders&&R.__sealEval) R.__sealEval(); }catch(e){} try{ if(R.cfg.autoSourceOn){ var tok=R.cfg.autoSourceToken||'edited'; var cur=snap(); var before=window.__r96lastProv||{}; Object.keys(providers||{}).forEach(function(id){ if(id==='custom_template'||/^custom_/.test(id))return; var p=providers[id]; if(p&&p.source==='default'&&before[id]!==cur[id]) p.source=tok; }); try{ if(typeof renderRegistry==='function') renderRegistry('provider'); }catch(e){} } }catch(e){} window.__r96lastProv=snap(); },60); }); } }catch(e){} })();
R.setToolVersionSchema=function(id,schema){ if(schema&&schema.function) R._toolSchemas=R._toolSchemas||{}, R._toolSchemas[id]=schema; return R._toolSchemas; };

R.__sealEval=function(){ if(!(typeof settings!=='undefined'&&settings.z&&R.cfg.technicalUser)){ if(R.cfg.evalInProviders){ setCfg('evalInProviders',false); return true; } } return false; };



R.providerDefaults = { deepseek: { id:'deepseek', name:'DeepSeek', source:'default', sched:[{kind:'week',days:[1,2,3,4,5],from:3600000,to:14400000,state:'peak'},{kind:'week',days:[1,2,3,4,5],from:21600000,to:36000000,state:'peak'}], windows:[[1,4],[6,10]], epoch:1786896000000, baseURL:'https://api.deepseek.com', apiPath:'/chat/completions', authHeader:'Bearer', defaultModel:'deepseek-flash', maxTokensParam:'max_tokens', systemRole:'system', supportsStreamUsage:true, usageProfile:'openai', usageFamily:'chat', balance:{ path:'/user/balance', parse:['balance_infos',0,'total_balance'], mode:'balance', currency:'USD' }, fallbackModels: {
  'deepseek-v4-pro': { id:'deepseek-v4-pro', maxTokens:384000, contextTokens:1000000, outputTokens:384000, temperature:1, request:{ thinking:{type:'enabled'}, reasoning_effort:'max' }, pricing:{ inputCacheHit:2.2e-8, inputCacheMiss:6.6e-7, output:1.98e-6 } },
  'deepseek-v4-flash': { id:'deepseek-v4-flash', maxTokens:384000, contextTokens:1000000, outputTokens:384000, temperature:1, request:{ thinking:{type:'enabled'}, reasoning_effort:'max' }, pricing:{ inputCacheHit:7e-9, inputCacheMiss:2.2e-7, output:6.6e-7 } },
  'deepseek-v4-flash-vision-exp': { id:'deepseek-v4-flash-vision-exp', maxTokens:384000, contextTokens:1000000, outputTokens:384000, temperature:1, request:{ thinking:{type:'enabled'}, reasoning_effort:'max' }, pricing:{ inputCacheHit:7e-9, inputCacheMiss:2.2e-7, output:6.6e-7 } }
} } };
try { R.providerDefaults.deepseek.fallbackModels['deepseek-flash'] = { id:'deepseek-flash', maxTokens:384000, contextTokens:1000000, outputTokens:384000, temperature:1, request:{ thinking:{type:'enabled'}, reasoning_effort:'max' }, rates:{ legacy:{inputCacheHit:2.8e-9,inputCacheMiss:1.4e-7,output:2.8e-7}, off:{inputCacheHit:7e-9,inputCacheMiss:2.2e-7,output:6.6e-7}, peak:{inputCacheHit:1.4e-8,inputCacheMiss:4.4e-7,output:1.32e-6} }, pricing:{ inputCacheHit:7e-9, inputCacheMiss:2.2e-7, output:6.6e-7 } }; } catch(e){}
try { var FB=R.providerDefaults.deepseek.fallbackModels; FB['deepseek-v4-pro'].rates={ legacy:{inputCacheHit:3.625e-9,inputCacheMiss:4.35e-7,output:8.7e-7}, off:{inputCacheHit:2.2e-8,inputCacheMiss:6.6e-7,output:1.98e-6}, peak:{inputCacheHit:4.4e-8,inputCacheMiss:1.32e-6,output:3.96e-6} }; FB['deepseek-v4-flash'].rates={ legacy:{inputCacheHit:2.8e-9,inputCacheMiss:1.4e-7,output:2.8e-7}, off:{inputCacheHit:7e-9,inputCacheMiss:2.2e-7,output:6.6e-7}, peak:{inputCacheHit:1.4e-8,inputCacheMiss:4.4e-7,output:1.32e-6} }; FB['deepseek-v4-flash-vision-exp'].rates={ legacy:{inputCacheHit:2.8e-9,inputCacheMiss:1.4e-7,output:2.8e-7}, off:{inputCacheHit:7e-9,inputCacheMiss:2.2e-7,output:6.6e-7}, peak:{inputCacheHit:1.4e-8,inputCacheMiss:4.4e-7,output:1.32e-6} }; } catch(e){}
R.applyProviderDefault = function(){
  function evolve(obj){ var changed=false; var C=R.providerDefaults;
    for(var id in obj){ if(id==='custom_template'||/^custom_/.test(id)) continue; var p=obj[id]; if(!p) continue;
      if(id==='deepseek'){ if(!p.source||p.source==='default'){ obj[id]=JSON.parse(JSON.stringify(C.deepseek)); changed=true; } continue; } }
    return changed; }
  try{ if(typeof providers!=='undefined') evolve(providers); }catch(e){}
  try{ var saved=JSON.parse(localStorage.getItem('dse_providers')||'{}'); evolve(saved); saved.deepseek=saved.deepseek||JSON.parse(JSON.stringify(R.providerDefaults.deepseek)); localStorage.setItem('dse_providers', JSON.stringify(saved)); }catch(e){}
  try{ if(typeof renderRegistry==='function') renderRegistry('provider'); }catch(e){}
  try{ R.installPricing(); }catch(e){}
  try{ if(typeof loadModels==='function') loadModels(); }catch(e){}
  return { ok:true };
};
R.applyProviderDefault();
R.__apiModels=null;
function greyModels(){ try{ var sel=document.getElementById('modelSelect'); if(!sel) return; var pid=(typeof activeProviderId!=='undefined')?activeProviderId:null; var p=pid&&(R.host.get('providers')||{})[pid]; if(!p) return; var api=(p.__apiModels&&p.__apiModels.length)?p.__apiModels:null; (modelIds(p)||[]).forEach(function(id){ if(!Array.prototype.some.call(sel.options,function(o){return o.value===id;})){ sel.add(new Option(id,id)); } }); Array.prototype.forEach.call(sel.options,function(o){ var risky=api?api.indexOf(o.value)<0:false; o.classList.toggle('o',risky); o.title=risky?'not in provider /models (risk)':''; }); }catch(e){} }
patchHost('fetchModels', function(o){ return function(id){ return Promise.resolve(o.apply(this,arguments)).then(function(r){ try{ var pv=R.host.get('providers')||{}; if(pv&&pv[id]) pv[id].__apiModels=r; }catch(e){} return r; }, function(e){ return null; }); }; });
patchHost('loadModels', function(o){ return function(){ var r=o.apply(this,arguments); Promise.resolve(r).then(greyModels, greyModels); return r; }; });
R.auditPricing=function(){ var rows=[],counts={}; try{ var pv=R.host.get('providers')||{}; for(var pid in pv){ if(pid==='custom_template') continue; var po=pv[pid]; var fm=po&&po.fallbackModels; if(!fm) continue;
    for(var mid in fm){ if(!R.getPricing(providerOfModel(mid)).models[mid]){ counts.n_a=(counts.n_a||0)+1; rows.push({provider:pid,model:mid,status:'n_a'}); continue; }
      var pricing=(fm[mid]&&fm[mid].pricing)||null; var exp=R.priceAt(mid, undefined, pid); var eq=function(a,b){ return Math.abs((a||0)-(b||0))<1e-15; };
      var st=(pricing&&eq(pricing.inputCacheHit,exp.inputCacheHit)&&eq(pricing.inputCacheMiss,exp.inputCacheMiss)&&eq(pricing.output,exp.output))?'correct':'wrong';
      counts[st]=(counts[st]||0)+1; rows.push({provider:pid,model:mid,status:st}); } } }catch(e){}
  return { counts:counts, total:rows.length, rows:rows }; };



/* ================= 96R · ESTIMATE (inert; off) + BOOT ================= */
try { function estimatePriceCandidate1(o){o=o||{};var NL=String.fromCharCode(10);var D=(o.charsDivisor==null)?4:o.charsDivisor;var thr=(o.thresholdUsd==null)?0.05:o.thresholdUsd;var req=o.req||o;var model=o.model||req.model||"(unknown)";var msgs=Array.isArray(req.messages)?req.messages:[];var first=[],later=[],gf=false;for(var i=0;i<msgs.length;i++){var m=msgs[i]||{},role=m.role;if(role==="system"||role==="developer"){first.push(m);continue;}if(!gf){first.push(m);gf=true;}else later.push(m);}var j=function(a){return a.map(function(x){return String((x&&x.content)||"");}).join("");};var toolsTxt=req.tools?JSON.stringify(req.tools):(o.tools?JSON.stringify(o.tools):"");var firstTxt=toolsTxt+j(first),laterTxt=j(later);var firstTokens=(o.knownInputTokens!=null)?o.knownInputTokens:Math.ceil(firstTxt.length/D);var laterTokens=Math.ceil(laterTxt.length/D);var inputTokens=firstTokens+laterTokens;var outTokens=(o.outputTokens!=null)?o.outputTokens:0;var r=o.rates||o.pricing||{};if(r&&Array.isArray(r.tiers))r=r.tiers.slice().sort(function(a,b){return a.minInput-b.minInput;}).reduce(function(a,t){return (t.minInput<=inputTokens)?t:a;},r.tiers[0])||{};var hit=(r.inputCacheHit!=null)?r.inputCacheHit:(r.inputCacheMiss||0);var miss=(r.inputCacheMiss!=null)?r.inputCacheMiss:0;var out=(r.output!=null)?r.output:0;var missCost=inputTokens*miss+outTokens*out;var hitCost=firstTokens*hit+laterTokens*miss+outTokens*out;var X=function(v){return thr>0?v/thr:Infinity;};var M=function(v){var a=Math.abs(v);var d=a<0.0001?8:a<0.001?7:a<0.01?6:a<1?5:3;return "$"+v.toFixed(d);};var RR=function(v){var x=X(v);return (isFinite(x)?x.toFixed(1):"inf")+"X";};var dur=function(ms){if(!(ms>0))return "0 seconds";var s=Math.floor(ms/1000),d=Math.floor(s/86400);s%=86400;var h=Math.floor(s/3600);s%=3600;var mi=Math.floor(s/60);s%=60;var p=[];if(d)p.push(d+(d===1?" day":" days"));if(h)p.push(h+(h===1?" hour":" hours"));if(mi)p.push(mi+(mi===1?" minute":" minutes"));p.push(s+(s===1?" second":" seconds"));return p.join(" ");};var text="estimated cache hitted price of this request: "+M(hitCost)+" which is "+RR(hitCost)+" of your "+M(thr)+" threshold"+NL+"estimated cache missed price of this request: "+M(missCost)+" which is "+RR(missCost)+" of your "+M(thr)+" threshold"+NL+dur(o.sinceLastUseMs)+" passed since "+model+" is used in this branch - send again to proceed";return {model:model,inputTokens:inputTokens,firstTokens:firstTokens,laterTokens:laterTokens,outputTokens:outTokens,hitCost:hitCost,missCost:missCost,xHit:X(hitCost),xMiss:X(missCost),thresholdUsd:thr,rates:{hit:hit,miss:miss,out:out},text:text};}
function estimateGate(inputText,ctx){window.__estArm=window.__estArm||{popupKey:null};var key=String(inputText||"");if(window.__estArm.popupKey===key){window.__estArm.popupKey=null;return {action:"network"};}window.__estArm.popupKey=key;return {action:"popup",text:estimatePriceCandidate1(ctx||{}).text};}; R.estimatePriceCandidate1=estimatePriceCandidate1; R.estimateGate=estimateGate; R.estimateGatePipe=function(input,init,url,opts){ try{ if(String((opts&&opts.method)||'GET').toUpperCase()!=='POST') return null; if(!(R.cfg&&R.cfg.estimate&&R.cfg.estimate.on)) return null; var body=null; try{ body=JSON.parse(opts.body); }catch(e){ return null; } if(!body||!Array.isArray(body.messages)) return null; var _ns=body.messages.filter(function(m){return m.role!=='system'&&m.role!=='developer';}); if(_ns.length && _ns[_ns.length-1].role==='tool') return null; var last=body.messages.filter(function(m){return m.role!=='system'&&m.role!=='developer';}).pop()||{}; var rates={}; try{ var t=R.priceAt(body.model); if(t){ rates={inputCacheHit:t.inputCacheHit,inputCacheMiss:t.inputCacheMiss,output:t.output}; } }catch(e){} var __usr=(body.messages||[]).filter(function(m){return m.role!=='system'&&m.role!=='developer'&&m.role!=='tool';}).pop()||{}; var g=R.estimateGate(String(url||'')+'|'+body.model+'|'+String(__usr.content||''),{model:body.model,messages:body.messages,outputTokens:(body.max_tokens||0),thresholdUsd:0.05,sinceLastUseMs:0,rates:rates}); if(g&&g.action==='network') return null; try{ popupHTML(String(g.text).split(String.fromCharCode(10)).join('<br>'),'cost estimate'); }catch(e){} return Promise.reject(new Error('estimate gate: send again to proceed')); }catch(e){ return null; } }; } catch(e){}
R._styleIds = Object.keys(R.CSS);
R.__estArm = R.__estArm || { key:null };
function estimateSendGate(){
  try{
    if(!(R.cfg && R.cfg.estimate && R.cfg.estimate.on)) return true;
    var ta=document.getElementById('messageInput'); var input=ta?String(ta.value||'').trim():''; if(!input) return true;
    var r=run(); var msgs=buildAPIMessages(getViewNodes(), r).concat([{role:'user',content:input}]);
    var rates={}; try{ var _t=R.priceAt(r.m); if(_t) rates={inputCacheHit:_t.inputCacheHit,inputCacheMiss:_t.inputCacheMiss,output:_t.output}; }catch(e){}
    var lim=(R.cfg.estimate.limitUsd!=null)?R.cfg.estimate.limitUsd:0.05;
    var est=R.estimatePriceCandidate1({model:r.m, messages:msgs, outputTokens:0, thresholdUsd:lim, sinceLastUseMs:0, rates:rates});
    if(est.missCost<=lim) return true;
    var key=String(r.m)+'|'+String(r.maxTokens||'')+'|'+JSON.stringify(msgs);
    if(R.__estArm.key===key){ R.__estArm.key=null; return true; }
    R.__estArm.key=key;
    try{ popupHTML(String(est.text).split(String.fromCharCode(10)).join('<br>'),'cost estimate'); }catch(e){}
    return false;
  }catch(e){ return true; }
}
patchFn('sendMessage', function(o){ return function(){ if(!estimateSendGate()) return; return o.apply(this,arguments); }; });
R.apply = function(){ R.applyFetch(); R.buildUI(); R.installed=true; return R; };

R.status = function(){ return { version:R.version, build:R.build, installed:!!R.installed, flags:R.flags, stats:R.stats, graph:R.graph() }; };

/* 96R · persist model pick on change (root fix for loadModels reset; no timer) */
if (!window.__r96_modelPersist){ window.__r96_modelPersist = 1;
  try { var _msel = document.getElementById('modelSelect'); if (_msel && window.__r96_modelPersistFn) _msel.removeEventListener('change', window.__r96_modelPersistFn); if (_msel) _msel.addEventListener('change', window.__r96_modelPersistFn = function(){ try { if (typeof activeProviderId !== 'undefined' && activeProviderId){ updateMetadata(function(m){ m.models[activeProviderId] = document.getElementById('modelSelect').value; }); } } catch(e){} }); } catch(e){}
}

R._internals={get addCumulativeUsage(){return addCumulativeUsage;},get toolSchema(){return toolSchema;},get activeToolName(){return activeToolName;},get toolNameForVersion(){return function(v){var t=TOOL_VERSIONS[+v];return t&&t.name;};},get makeResponsesTranslator(){return makeResponsesTranslator;},get makeAnthropicTranslate(){return makeAnthropicTranslate;},get buildResponsesRequest(){return buildResponsesRequest;},get mapUsage(){return mapUsage;},get toAnthropic(){return toAnthropic;}};

try{ window.__eval1&&window.__eval1.save&&window.__eval1.save(); }catch(e){}

R.disable=function(){ var __fs96=window.__r96origFS; try{ (R._down||[]).slice().reverse().forEach(function(f){ try{f();}catch(e){} }); }catch(e){}
  try{ window.fetch=R._origFetch; R._fetchInstalled=false; }catch(e){}
  try{ Object.keys(R.host.orig).forEach(function(n){ if(typeof R.host.orig[n]==='function') R.host.set(n, R.host.orig[n]); }); }catch(e){}
  try{ ['eval1Pill','dse-peak-timer'].forEach(function(id){ var el=document.getElementById(id); if(el) el.remove(); }); }catch(e){}
  try{ (R._styleIds||[]).forEach(function(id){ var s=document.getElementById(id); if(s) s.remove(); }); }catch(e){}
  try{ R.removeExpTab(); }catch(e){} try{ var m=document.querySelector('span[data-r96-mirror]'); if(m) m.remove(); }catch(e){}
  try{ peakCounterStop(); }catch(e){} try{ if(window.__r96Reconcile){clearInterval(window.__r96Reconcile);window.__r96Reconcile=0;} }catch(e){} try{ if(window.__r96Hunter){clearInterval(window.__r96Hunter);window.__r96Hunter=0;} }catch(e){} try{ if(window.__r96PadObs){window.__r96PadObs.disconnect();window.__r96PadObs=0;} }catch(e){}
   try{ if(window.__r96pillObs){ window.__r96pillObs.disconnect(); window.__r96pillObs=0; } }catch(e){} try{ if(window.__r96PadObs&&window.__r96PadObs.disconnect){window.__r96PadObs.disconnect();window.__r96PadObs=0;} }catch(e){} try{ try{ if(window.__r96routeObs&&window.__r96routeObs.disconnect) window.__r96routeObs.disconnect(); }catch(e){} try{ delete window.__r96routeObs; }catch(e){} try{ if(window.__r96clickHandler) document.removeEventListener('click', window.__r96clickHandler, true); window.__r96_clickBound=0; }catch(e){} }catch(e){} ['__r96balWrap','__r96BalWrap','__eval1_cmpVer','__eval1_shouldReplace','__r96seq','__r96ep'].forEach(function(k){ try{ delete window[k]; }catch(e){} }); try{ var mm=document.querySelector('span[data-r96-mirror]'); if(mm) mm.remove(); }catch(e){} try{ window.__r96Pad=0; if(window.__r96padIn) document.removeEventListener('input',window.__r96padIn); if(window.__r96padCh) document.removeEventListener('change',window.__r96padCh); if(window.__r96padRs) window.removeEventListener('resize',window.__r96padRs); if(window.__r96fitRs) window.removeEventListener('resize',window.__r96fitRs); if(window.__r96routeBtn) document.removeEventListener('click',window.__r96routeBtn); window.__r96routeBtnBound=0; }catch(e){} try{ delete window.__dsePeakState; delete window.__r96Tick; delete window.__r96SyncRelaxed; delete window.__r96clickHandler; delete window.__r96_modelPersist; delete window.__r96lastProv; ['__r96Pad','__r96_clickBound','__r96Reconcile','__r96padIn','__r96padCh','__r96padRs','__r96fitRs','__r96PadObs','__r96pillObs','__r96routeBtn','__r96routeBtnBound','__r96origFS'].forEach(function(k){ try{ delete window[k]; }catch(e){} }); }catch(e){} try{ if(__fs96!=null && typeof settings!=='undefined') settings.fontScale=__fs96; }catch(e){} try{ delete window.__r96AuditBusy; delete window.__r96AuditAgain; }catch(e){} R.installed=false; return true; };
function installPricing96(){ try{ var pv=R.host.get('providers')||{}; for(var pid in pv){ if(pid==='custom_template') continue; var fm=pv[pid]&&pv[pid].fallbackModels; if(!fm) continue; for(var mid in fm){ (function(pid,mid,fm){ var cur=fm[mid]||{}, pr=cur.pricing; if(Array.isArray(pr&&pr.tiers)||isGetterProp(pr,'output')) return;  if(!cur.rates&&pr&&!Array.isArray(pr.tiers)&&pr.inputCacheMiss!=null){ var _f={inputCacheHit:pr.inputCacheHit,inputCacheMiss:pr.inputCacheMiss,output:pr.output}; cur.rates={ legacy:_f, off:_f, peak:_f }; } var d={}; ['inputCacheHit','inputCacheMiss','output'].forEach(function(k){ Object.defineProperty(d,k,{enumerable:true,configurable:true,get:function(){ var t=R.priceAt(mid,undefined,pid); return t?t[k]:undefined; }}); }); cur.pricing=d; })(pid,mid,fm); } } }catch(e){} }
R.installPricing=installPricing96; installPricing96();
try{ window.__pricingEngine=window.__pricingEngine||{}; window.__pricingEngine.epoch=(function(){try{return (R.getPricing()||{}).epoch||0;}catch(e){return 0;}})(); window.__pricingEngine.tables=window.__pricingEngine.tables||{epoch:window.__pricingEngine.epoch}; window.__pricingEngine.priceAt=R.priceAt; localStorage.setItem('dse_pricing_epochs', JSON.stringify({epoch:window.__pricingEngine.epoch||0})); }catch(e){}
R.syncPricing=function(){ try{ installPricing96(); return {ok:true}; }catch(e){ return {ok:false,error:String(e)}; } };
R.syncSchedules=R.schedulesFromJSON=function(){ try{ var pv=R.host.get('providers')||{}; for(var pid in pv){ var fm=pv[pid]&&pv[pid].fallbackModels; if(!fm)continue; for(var m in fm){ /* provider sched is authoritative; models must not hold stale schedule copies */ } } return {ok:true}; }catch(e){ return {ok:false,error:String(e)}; } };
function seedFromView96(){ var byEval={},byTools={}; try{ getViewNodes().forEach(function(n){ if(!n||n.role!=='assistant')return; var v=n.versions[n.activeVersion]||{}, model=v.metadata&&v.metadata.model; if(!model)return; var names=null, mt=v.metadata&&v.metadata.tools; if(mt&&typeof mt==='object'&&!Array.isArray(mt)) names=Object.keys(mt).filter(Boolean); if((!names||!names.length)&&v.toolBatch&&Array.isArray(v.toolBatch.names)) names=v.toolBatch.names.filter(Boolean); if(names&&names.length){ byTools[model]=names.slice(); var et=names.filter(function(x){return /^tool_eval/.test(x);})[0]; if(et) byEval[model]=et; } }); }catch(e){} R._lastEvalToolByModel=byEval; R._lastToolsOnByModel=byTools; }
function overrideToolName96(){ return (R.cfg.evalToolNameOverrideOn&&R.cfg.evalToolNameOverride)?R.cfg.evalToolNameOverride:''; }
function activeToolName96(){ var v=R.cfg.evalToolVersion; if(v==='off')return null; if(v==='auto'){ var m=(typeof getCurrentModel==='function')?getCurrentModel():''; return (R._lastEvalToolByModel&&R._lastEvalToolByModel[m])||'tool_eval_7'; } return 'tool_eval_'+v; }
function resolveTools96(r){ if(Array.isArray(r.request&&r.request.tools)) return r.request.tools; if(typeof(r.request&&r.request.tools)==='string') return String(r.request.tools).split(/[,\s]+/).filter(Boolean).map(function(n){ return window.__tools[n]&&toolSchema(n,window.__tools[n]); }).filter(Boolean); if(!(r.request&&('tools' in r.request))&&R.flags.tools){ var am=R.cfg.agenticTools||'auto'; if(am==='off')return []; var seen={},list=[],push=function(n){ var d=window.__tools&&window.__tools[n]; if(!d||seen[n])return; seen[n]=1; list.push(toolSchema(n,d)); }; if(am==='auto'||R.cfg.evalToolVersion==='auto'){ seedFromView96(); } else { R._lastEvalToolByModel={}; R._lastToolsOnByModel={}; } var prior=(am==='auto'&&r&&r.m&&R._lastToolsOnByModel)?R._lastToolsOnByModel[r.m]:null; var tn=overrideToolName96(); if(prior&&prior.length){ prior.forEach(function(n){ if(window.__tools[n]) push(n); }); tn=tn||prior.filter(function(x){return /^tool_eval/.test(x);})[0]||null; R.cfg.webSearch=prior.indexOf('web_search')>=0; } else { tn=tn||activeToolName96(); } if(tn) push(tn); (R.cfg.autoTools||[]).forEach(push); Object.keys(window.__tools||{}).forEach(function(n){ if(window.__tools[n]&&window.__tools[n].auto) push(n); }); return list; } return []; }
try{ resolveTools=resolveTools96; activeToolName=activeToolName96; R.refreshBranchTools=function(){ seedFromView96(); return true; }; }catch(e){}
try{ R._materializeToolAliases&&R._materializeToolAliases(); }catch(e){}

function applyMarked(){ if(R.flags.marked){ patchHost('formatMarkdown', markedMake); loadMarked(); } else if(R.host.orig.formatMarkdown){ R.host.set('formatMarkdown', R.host.orig.formatMarkdown); } }
R.applyMarked=applyMarked; applyMarked();
R.__bal=R.__bal||{cache:new Map(),inflight:new Map(),lastReal:new Map(),ticker:0};
function __kh(k){ var h=0; for(var i=0;i<k.length;i++) h=(h*31+k.charCodeAt(i))|0; return (h>>>0).toString(36); }
function __balSrc(p){ return (p&&p.balance)||null; }
function __balUrl(p,src){ return /^https?:/i.test(src.path||'')?src.path:((p.baseURL||'')+(src.path||'')); }
function __pick(d,path){ if(d==null) return undefined; if(Array.isArray(path)){ var x=d; for(var i=0;i<path.length;i++){ if(x==null) return undefined; x=x[path[i]]; } return x; } return String(path).split('.').reduce(function(a,k){ return a==null?undefined:a[k]; }, d); }
function getCachedBal(p,key){ try{ return R.__bal.cache.get(p.id+'|'+__kh(key))||null; }catch(e){ return null; } }
R.fetchBalance=function(p,key,force,guard){ var src=__balSrc(p); if(!src||!key) return Promise.resolve(null); var ck=p.id+'|'+__kh(key); if(R.__bal.inflight.has(ck)) return R.__bal.inflight.get(ck); var now=Date.now(); var pr=(function(){ if(!force){ var hit=R.__bal.cache.get(ck); if(hit&&now-hit.t<60000) return Promise.resolve(hit); if(hit&&hit.neg&&now-hit.t<30000) return Promise.resolve(hit); } if(force&&guard){ var nowP=performance.now(), last=R.__bal.lastReal.get(ck), el=(last==null?Infinity:Math.max(0,nowP-last)); if(el<1000) return Promise.resolve(R.__bal.cache.get(ck)||{ok:false,throttled:true,t:Date.now()}); R.__bal.lastReal.set(ck,nowP); } return fetch(__balUrl(p,src),{headers:{Authorization:(p.authHeader?p.authHeader+' ':'')+key}}).then(function(res){ if(!res.ok) throw Error('HTTP '+res.status); return res.json(); }).then(function(d){ var num=src.parse?__pick(d,src.parse):d; var num2=src.parse2?__pick(d,src.parse2):null; var entry={v:Number.isFinite(Number(num))?Number(num):num, v2:(num2!=null&&Number.isFinite(Number(num2)))?Number(num2):null, mode:src.mode||'balance', currency:src.currency||null, t:now, ok:true}; R.__bal.cache.set(ck,entry); return entry; }, function(e){ var entry={ok:false,neg:true,t:now,error:String(e&&e.message||e)}; R.__bal.cache.set(ck,entry); return entry; }); })(); R.__bal.inflight.set(ck,pr); return pr.then(function(v){ R.__bal.inflight.delete(ck); return v; }, function(e){ R.__bal.inflight.delete(ck); throw e; }); };
function __balFmt(e){ if(!e||!e.ok) return '-'; var f=function(n){ return Number.isFinite(n)?('$'+(n<1?n.toFixed(2):n.toLocaleString())):'-'; }; var u=function(n){ return Number.isFinite(n)?('$'+n.toFixed(6).replace(/0+$/,'').replace(/\.$/,'')):'-'; }; if(e.mode==='usage') return f(e.v)+' (usage '+u(e.v2!=null?e.v2:e.v)+')'; return f(e.v); }
function __balAgo(ms){ if(!Number.isFinite(ms)||ms<0) return ''; var s=Math.floor(ms/1000); if(s<5) return 'just now'; if(s<60) return s+'s ago'; var m=Math.floor(s/60); return m<60?(m+'m '+(s%60)+'s ago'):(Math.floor(m/60)+'h ago'); }
function injectBalanceLines(t){ try{ var mode=R.cfg.costBalance||'off'; if(mode==='off') return; if(!(t&&t.dataset&&t.dataset.cost==='global')) return; var targets=[]; var pv=R.host.get('providers')||{}; if(mode==='current'||mode==='provider'){ var pid=(typeof activeProviderId!=='undefined')?activeProviderId:null; var p=pid&&pv[pid]; var k=p&&getApiKey(p.id); if(p&&k&&__balSrc(p)) targets.push({p:p,key:k}); } else if(mode==='all'){ for(var id in pv){ var pp=pv[id]; var kk=getApiKey(id); if(pp&&kk&&__balSrc(pp)) targets.push({p:pp,key:kk}); } } if(!targets.length) return; var box=document.getElementById('costInfo'); if(!box) return; var el=box.querySelector('[data-bal68line]'); if(!el){ el=document.createElement('div'); el.setAttribute('data-bal68line','1'); el.style.cssText='border-top:1px solid var(--border);margin-top:6px;padding-top:6px;font-size:.68rem;color:var(--text-secondary);font-family:monospace'; box.appendChild(el); } var render=function(rows){ el.innerHTML=rows.map(function(r){ var e=r.e; var ago=(e&&e.t)?(' \u00b7 '+__balAgo(Date.now()-e.t)):''; return 'balance ('+(r.p.name||r.p.id)+'): '+__balFmt(e)+ago; }).join('<br>'); }; render(targets.map(function(t2){ return {p:t2.p, e:getCachedBal(t2.p,t2.key)}; })); if(targets.some(function(t2){ var e=getCachedBal(t2.p,t2.key); return !e||Date.now()-e.t>5000; })){ Promise.all(targets.map(function(t2){ return R.fetchBalance(t2.p,t2.key,true,true).then(function(e){ return {p:t2.p,e:e}; }); })).then(render).catch(function(){}); } if(!R.__bal.ticker){ R.__bal.ticker=setInterval(function(){ try{ if(!document.getElementById('costInfo')){ clearInterval(R.__bal.ticker); R.__bal.ticker=0; return; } el.querySelectorAll('[data-bal68ago]').forEach(function(sp){ sp.textContent=__balAgo(Date.now()-(+sp.getAttribute('data-bal68ago'))); }); }catch(e){} }, 1000); } }catch(e){} }
(function(){ try{ if(window.__r96balWrap||typeof openCostInfo!=='function') return; window.__r96balWrap=1; R.host.orig.openCostInfo=openCostInfo; var o=openCostInfo; openCostInfo=function(){ var r=o.apply(this,arguments); try{ injectBalanceLines(arguments[0]); }catch(e){} return r; }; }catch(e){} })();
(function(){ var o=executeAPI; if(typeof o!=='function'||o.__r96pe) return; var w=function(messages,node,vIndex,controller,r){ r=r||run(); try{ var p=r.p,k=getApiKey(p.id); if(p&&p.balance&&k&&(R.cfg.costBalance!=='off'||R.cfg.balanceSnap)) R.fetchBalance(p,k).then(function(e){ if(e!=null&&R.cfg.balanceSnap&&node&&node.versions&&node.versions[vIndex]){ var md=node.versions[vIndex].metadata=node.versions[vIndex].metadata||{}; md.balance={ v:(e&&e.v), v2:(e&&e.v2), mode:(e&&e.mode), currency:(e&&e.currency), t:(e&&e.t)||Date.now(), provider:p.id, keyHash:(typeof __kh==='function'?__kh(k):'') }; } }); }catch(e){} return o.apply(this,arguments); }; w.__r96pe=1; executeAPI=w; })();


function syncPills96(){ try{ var pills=document.querySelectorAll('.msg-stats .cost-pill[data-node-id]'); Array.prototype.forEach.call(pills,function(p){ try{ var n=chatTree.nodes[p.dataset.nodeId]; var v=n&&n.versions&&n.versions[n.activeVersion]; var md=v&&v.metadata; if(!md)return; var pr=md.pricing; var net=(pr&&pr.net!=null)?pr.net:(md.peakCost?2:1); p.classList.toggle('peak-cost',net>1); p.classList.toggle('discount-cost',net>0&&net<1); p.classList.toggle('free-cost',net===0); }catch(e){} }); }catch(e){} }

try{ if(!window.__r96pillObs){ window.__r96pillObs=new MutationObserver(function(){ syncPills96(); }); window.__r96pillObs.observe(document.getElementById('chatContainer')||document.body,{ childList:true, subtree:true }); } }catch(e){} syncPills96();
R.audit=function(){ if(window.__r96AuditBusy){ window.__r96AuditAgain=true; return; } window.__r96AuditBusy=true;
  try{ if(typeof initDB!=='function'){ window.__r96AuditBusy=false; return; } initDB().then(function(db){ try{ var SN=(typeof STORE_NAME!=='undefined')?STORE_NAME:'chatTrees', SBK=(typeof SB!=='undefined')?SB:'dse_sb';
      var tx=db.transaction(SN,'readwrite'), st=tx.objectStore(SN), r=st.get(SBK);
      r.onsuccess=function(){ var b=r.result||{}, now=Date.now(), del=[], cap=1e7, size=0, own=(typeof TAB_PID!=='undefined')?TAB_PID:'';
        for(var k in b){ var v=b[k]; if(!Array.isArray(v)) continue; var sz=(v[2]||'').length+(v[3]||'').length; size+=sz; var age=now-(v[0]||0); if(age>(k.indexOf('|'+own+'|')<0?6048e5:864e5)) del.push(k); }
        if(size>cap){ var ks=Object.keys(b).filter(function(q){return del.indexOf(q)<0;}); ks.sort(function(a,c){return (b[a][0]||0)-(b[c][0]||0);}); for(var i2=0;i2<ks.length&&size>cap;i2++){ size-=((b[ks[i2]][2]||'').length+(b[ks[i2]][3]||'').length); del.push(ks[i2]); } }
        del.forEach(function(q){ delete b[q]; }); st.put(b,SBK); };
      tx.oncomplete=function(){ window.__r96AuditBusy=false; if(window.__r96AuditAgain){ window.__r96AuditAgain=false; setTimeout(R.audit,2000); } };
      tx.onerror=tx.onabort=function(){ window.__r96AuditBusy=false; };
    }catch(e){ window.__r96AuditBusy=false; } }, function(){ window.__r96AuditBusy=false; }); }catch(e){ window.__r96AuditBusy=false; } };



try{ ['marked','anthropic','hybrid','pill','bridgeStream','tools'].forEach(function(n,i){ window['eval1b'+(i+1)]=R.flags[n]?1:0; }); }catch(e){}
(function(){ if(window.__r96routeBtnBound) return; window.__r96routeBtnBound=1; window.__r96routeBtn=function(e){ var b=e.target&&e.target.closest&&e.target.closest('#expRouteBtn'); if(!b) return; try{ var t=(document.getElementById('expRoute')||{}).textContent||'n/a'; popupHTML('Routing algorithm:'+String.fromCharCode(10)+t,'Routing'); }catch(x){} }; document.addEventListener('click', window.__r96routeBtn); })();
function fitRoute96(){ try{ var el=document.getElementById('expRoute'); if(!el||!el.textContent) return; var base=10.88, min=base*0.7; el.style.fontSize=base+'px'; var fs=base,g=0; while(el.scrollWidth>el.clientWidth+1&&fs>min&&g++<40){ fs-=0.5; el.style.fontSize=fs+'px'; } el.style.textOverflow=(el.scrollWidth>el.clientWidth+1)?'ellipsis':'clip'; }catch(e){} }
 try{ fitRoute96(); }catch(e){}
(function(){ var o=R.updateExpRoute; if(typeof o==='function'&&!o.__r96f){  R.updateExpRoute.__r96f=1; } })();
try{ if(!window.__r96routeObs){ window.__r96routeObs=1; var sp=document.getElementById('settingsPanel'); if(sp){ window.__r96routeObs=new MutationObserver(function(){ if(sp.classList.contains('open')) requestAnimationFrame(fitRoute96); }); window.__r96routeObs.observe(sp,{attributes:true,attributeFilter:['class']}); } window.__r96fitRs=fitRoute96; window.addEventListener('resize',window.__r96fitRs); } }catch(e){}
try{ if(R._toolSchemas){ for(var _id in R._toolSchemas){ var _nm=TOOL_VERSIONS[_id]&&TOOL_VERSIONS[_id].name; if(_nm&&window.__tools[_nm]) window.__tools[_nm].schema=R._toolSchemas[_id]; } } }catch(e){}

try{ ['core','host','config','pricing','fetch','tools','agentic','marked','ui','host-integration','balance','security','providers','estimate'].forEach(function(id){ if(!R._mods.has(id)) R._mods.set(id,{id:id,version:R.version}); }); }catch(e){}
R.apply();
console.log('[96R v'+R.version+'] online · flags '+JSON.stringify(R.flags));

})();

/* 96R readme — single source: readable in this file AND a live value at runtime. Reach: __eval1.readme */
try {
  window.__eval1.readmeName = "readme1";
  window.__eval1.readme = `====================================================================
 EVAL1 / 96R — ENGINEERING NOTES  (readme1)
 Derived from live experimentation on the "AI Chat" app + 96.js.
====================================================================

0. WHAT THIS IS
 - "96.js" = eval1 v4.10.0 patch: 172,951 bytes / 2351 lines / 21 banner blocks,
   loaded into the app's eval console.
 - "96R" = consolidation rewrite from zero. Single IIFE, ~118 KB.
 - LOAD (same as 96):
      eval(await (await fetch(URL)).text())
   in the app's eval console. The console is OFF by default (settings.evalLock);
   enable via Other tab -> "Eval console", or programmatically.

1. PERSISTED KEYS (dev)
   dse_96R_body  : section source (concatenated body)
   dse_96R_src   : the full file (IIFE-wrapped) -> eval() THIS
   dse_96R_wip   : scratch notes
   dse_96R_estimate_c1 / dse_96R_estimate_gate : price-estimator candidates (inert)

2. THE GOLDEN RULE (scope) — READ FIRST
 - The patch is eval()d INSIDE the app closure (the eval-console arrow scope), so
   bare host names resolve: executeAPI, settings, chatTree, providers, run,
   getApiKey, renderFullChat, updateNodeDOM, loadModels, ... You can READ and ASSIGN.
 - Declarations are TRAPPED: a var/let/const does NOT leak to host or next eval.
     within one packet : var x=2 ... var x=3 -> x is 3 (redeclare overrides); let/const redeclare throws.
     across packets    : var does NOT persist. Only a PROPERTY on a shared object persists.
 - => override points a future patch must touch -> put them on E (window.__eval1).
      internal-only override -> plain var inside the file is fine.
 - Avoid accidental globals via bare assignment; use E.set / E.pipe.

3. THE E RUNTIME (public facade)
   E = window.__eval1
   E.set(name, fn, dispose)          set/replace a capability (property on E)
   E.get(name) / E.whoOwns(name) / E.graph()
   E.pipe(name, fn, {order,id})      append an ORDERED layer; E.run(name,v,ctx) applies
   E.use({id, requires, setup, teardown})   module w/ deps + teardown (E._down)
   E.applyFetch()                    rebuild fetch pipes from flags
   E.installPricing()                inject dyn() getters into providers.<p>.fallbackModels[m].pricing
   E.priceAt(model, ts)              date-aware table from provider JSON
   E.disable()                       reverse teardown + restore host fns + REMOVE styles

4. SURFACE CONTRACT (keep for drop-in)
 - __eval1 functions: all 42 of 96's are present (+96R extras). Notable:
   registerToolVersion, setToolVersionSchema, _materializeToolAliases, apply, disable,
   setFlag, set, status, auditPricing, removeExpTab, _rebuildExpTab, refreshBranchTools,
   syncSchedules, schedulesFromJSON, syncPricing, applyProviderDefault, __sealEval,
   + the setters setMode/WebSearch/ShowSearchTrace/PaintInterval/ThinkingHistory/
     ToolEchoCollapse/ToolFontScale/ToolMaxTurns/ToolMaxTurnsOn/PeakCounter/EvalToolVersion/
     EvalToolNameOverride/EvalToolNameOverrideOn/EvalInProviders/ApiShapeFallback/
     PricingFallback/CostBalance/BalanceSnap/TechnicalUser/RelaxedSendCriteria/StaleHunter/
     StaleHunterMs/DiscountCounter/AutoSourceOn/AutoSourceToken.
 - Config: 30 keys (+96R 'estimate'). Flags (6): marked, anthropic, hybrid, pill, bridgeStream, tools.
 - Tools aliases: window.__tools.tool_eval_1..7.
 - Compat aliases 96R adds: __eval1.config (=== .cfg), __eval1.FLAGS.
 - DOM ids: #eval1Pill, .tab-btn[data-tab=exp], #tab-exp (#exp-sub-general/tools/fallbacks),
   #dse-peak-timer, and the 9 style ids (sec. 8).

5. PRICING (provider-JSON is the ONLY truth)
   providers.<pid>.pricing = {
     epoch, windows:[[1,4],[6,10]],
     sched:[{kind:'week',days:[1,2,3,4,5],from:3600000,to:14400000,state:'peak'}, ...],
     models:{ '<model>': { off:{inputCacheHit,inputCacheMiss,output}, peak:{...}, legacy:{...} } } }
 - E.priceAt(model, ts) -> { bucket, conflict, inputCacheHit, inputCacheMiss, output }.
   before epoch -> legacy. Peak = UTC hours 1-4 & 6-10, Mon-Fri.
 - install(): model pricing becomes live getters -> E.priceAt, so the app cost path matches.
 - EDIT prices = JSON only; EDIT logic = E.priceAt only.
 - COST ASYMMETRY (observed): anthropic bridge prices input as cache-MISS (correct);
   chat/responses passthrough leaves input UNKNOWN (partial, shows "+").

6. FETCH ROUTING (order: anthropic > responses > coalescer)
 - POST-only; non-POST passes through.
 - anthropic : deepseek chat/completions -> https://api.deepseek.com/anthropic/v1/messages
               (adds web_search tool when webSearch is on).
 - responses : profiled models (deepseek-v4-*, gpt-5.6-*) on their host -> /responses.
 - coalescer : other streaming chat/completions -> buffered to paintIntervalMs frames.
 - Observed body sizes: anthropic ~263b (payload 77), responses ~176b, coalescer ~361b;
   tool rounds grow ~0.4k -> 1.1k payload.

7. TOOL LOOP (agentic)
 - Attaches tool_eval_<n>; model emits tool_calls; run via window.__tools[name].run(args, signal).
 - Tool results carry a per-round note: cost_of_this_tool_round_thinking_included ("divide by N" for parallel).
 - version.metadata.tools = per-name counts; version._toolEvents = [assistant(tool_calls), tool(result)];
   version.toolBatch = {requested, executed, names}.
 - BUG PATTERN (fixed): never shadow the loop counter with the response object
   (object < number === false -> loop never runs). Use a distinct name for the response.

8. UI (must match)
 - 9 CSS sheets (ids): eval1-ui, dse-ui-fix, dse-ui-collapser-fix, dse-85-pills, dse-bal68-css,
   dse-hfix70, autoSrcPadRule, dse-92-ring, dse-marked-css.
 - Exp tab: 3 sub-tabs (General/Tools/Fallbacks), 29 rows, each with an (i) popup.
 - UI tab: auto-collapse size + its ON toggle are COMBINED to one row (45.js combine()).
 - Other tab: 'technical' toggle (69.js) inside #rBX.
 - Pill: text 'API <mode>'; click cycles auto->responses->chat.
 - Editable inputs: padding-inline-end needs --text-w (10% of text width, set by a mirror span);
   without it inputs are ~5px narrow and the panel shifts.
 - Import mode option labels are shortened.

9. BEHAVIORS / DEFAULTS
 - Code-block header/footer click toggles .collapsed (+ arrows).
 - Tool-echo auto-collapse: rule matches blocks starting with '// Executing:' AND (96R) '// Result'
   longer than toolEchoCollapseChars (default 2000). (96 collapsed ONLY '// Executing:'.)
 - Block auto-collapse: formatMarkdown passes collapsed = blockAutoCollapse && len>blockCollapseSize.
 - Message auto-collapse: msgAutoCollapse && totalChars>msgCollapseSize -> .msg-body.collapsed.
 - Thinking: autoCollapseThinking; a live stream can force-open it.
 - Peak: body gains .dse-peak/.dse-discount/.dse-free; #dse-peak-timer countdown when
   peakCounter/discountCounter != 'off'.

10. 96's KNOWN BUGS (96R fixes)
 - setToolEchoCollapse writes key 'toolEchoCollapse' but the renderer reads
   'toolEchoCollapseChars' -> 96's UI setting is a NO-OP. 96R points the setter at the key it reads.
 - disable() leaks its injected <style> tags (8). 96R removes them.
 - Pricing duplicated in 4 places (default_providers, providers, PE.tables, provider JSON rates)
   + a shallow-copy aliasing hazard. 96R: one source.

11. TEST HARNESS (simulator4.js)
 - SIM.make({html:appHtml, runtime:'iframe', isolate:true}) then load the patch.
 - ISOLATION GAP: SIM only shims localStorage. This app uses IndexedDB (AIChatDB),
   BroadcastChannel (dse_tab_beat), sessionStorage. You MUST Object.defineProperty-shim
   indexedDB/BC/sessionStorage in the prelude, else the clone reads/writes the REAL chat tree
   (a 162k-token runaway = about 10 cents in one call).
 - CONSOLE LOAD (clicks): pass bridge:false, inject your shim via string-replacing the app's
   '(async () => {' , then sim.loadIntoApp(code,{allowConsoleEval:true}).
 - GUARD: wrap fetch to reject bodies > N chars pre-network (tiered: first 10k, later 100k,
   measured on messages/input, not tool schema).
 - GOTCHAS:
   * console eval returns only the LAST LINE -> read state via a window.__tmp + poll.
   * sim.route accumulates; FIRST match wins -> use a FRESH sim per distinct route set.
   * loadModels() resets #modelSelect to provider defaultModel -> pin providers.<p>.defaultModel.
   * appEval runs in the app scope: cannot call a patch's CLOSURE helpers (applyPeakDisplay etc.);
     trigger them via the app's own calls (renderFullChat triggers the peak render wrapper).
 - REAL API: key at localStorage dse_metadata.apiKeys.deepseek; use deepseek-v4-flash for cheap
   tests. Output/cost vary run-to-run (nondeterminism) -> compare mechanics (model, promptTokens,
   peakCost, content), never the exact cost.

12. PARITY STATUS (96 vs 96R)
 - SAME: all fns (superset), 12/12 host fns patched, config, flags, tools(7), CSS sheets, Exp tab
   (29/3), UI-tab combine, Other technical, pill, computed styles, geometry, interactive
   (block collapse, tool-echo, sub-tab, popup, pill cycle), routing(3), markdown, cost mechanics, disable.
 - INTENTIONAL IMPROVEMENTS: working tool-collapse setter; tool-echo collapse covers BOTH
   call and response; disable removes styles; single pricing source.
 - ADDITIVE: extra internal fns + config key 'estimate'.
 - COSMETIC: 0.09px sub-pixel on the exp <select> padding-right.

13. WHEN YOU EDIT / REWRITE
 - Author in sections; append to dse_96R_body; syntax-check with
      new Function('(function(){' + body + '})()')
   then reassemble  dse_96R_src = '(function(){' + PREAMBLE + body + '})();'  and eval it.
   PREAMBLE disables an existing v4 __eval1 before boot.
 - Template-literal escaping when authoring: avoid literal backticks (use \\u0060) and avoid
   \\n in the source (use String.fromCharCode(10)); regex slashes need \\\\ .
 - After changing pricing data, call E.installPricing() again.
 - New capability a future patch must override -> E.set (not a top-level var).
====================================================================
`;
  window.__eval1.help = function(){ try{ console.log(window.__eval1.readme); }catch(e){} return window.__eval1.readme; };
} catch(e){}

