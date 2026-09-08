// ============================================================
//  KINGSHOT GIFT-CODE TOOL  (final)
//  Load: paste into DevTools console OR fetch+eval (see USAGE).
//  No player names in code — only numeric Player IDs.
//  Capabilities:
//    redeem(codes[, onlyIds[, skipDone]])   redeem codes on all/selected IDs
//    findCodes([seeds])                      find live codes (net + date patterns)
//    findAndRedeem([seeds])                  find then redeem on all IDs
//    probeCode(code[, fid])                  test one code on one ID
//    ledger.summary() / ledger.clear()       saved results per Player ID
//  Everything exposed as KSR.* after load.
// ============================================================

const ACCS = ['14302414','392282126','387170058','18819937','27352843'];
const KNOWN = { '14302414':'61','392282126':'61','387170058':'61','18819937':'1','27352843':'61' };
const PROBE = ACCS[1];                       // account used by finder probes (change index if desired)
const URL = 'https://kingshot-giftcode.centurygame.com/api';
let KEY = 'mN4!pQs6JrYwV9';
const wait = ms => new Promise(r => setTimeout(r, ms));

function md5(s){function A(x,y){const l=(x&65535)+(y&65535);return(((x>>16)+(y>>16)+(l>>16))<<16)|(l&65535)}function R(n,c){return(n<<c)|(n>>>(32-c))}function C(q,a,b,x,s,t){return A(R(A(A(a,q),A(x,t)),s),b)}function F(a,b,c,d,x,s,t){return C((b&c)|(~b&d),a,b,x,s,t)}function G(a,b,c,d,x,s,t){return C((b&d)|(c&~d),a,b,x,s,t)}function H(a,b,c,d,x,s,t){return C(b^c^d,a,b,x,s,t)}function I(a,b,c,d,x,s,t){return C(c^(b|~d),a,b,x,s,t)}function B2h(b){const h='0123456789abcdef';let o='';for(let i=0;i<b.length*4;i++)o+=h.charAt((b[i>>2]>>((i%4)*8+4))&15)+h.charAt((b[i>>2]>>((i%4)*8))&15);return o}function B2r(i){let o='';for(let j=0;j<i.length*32;j+=8)o+=String.fromCharCode((i[j>>5]>>>(j%32))&255);return o}function r2b(s){const o=[];o[(s.length>>2)-1]=undefined;for(let i=0;i<o.length;i++)o[i]=0;for(let i=0;i<s.length*8;i+=8)o[i>>5]|=(s.charCodeAt(i/8)&255)<<(i%32);return o}function rMD5(s){return B2r(bMD5(r2b(s),s.length*8))}function r2h(i){const h='0123456789abcdef';let o='';for(let j=0;j<i.length;j++){const x=i.charCodeAt(j);o+=h.charAt((x>>>4)&15)+h.charAt(x&15)}return o}function u8(s){return unescape(encodeURIComponent(s))}function bMD5(x,len){x[len>>5]|=128<<(len%32);x[(((len+64)>>>9)<<4)+14]=len;let a=1732584193,b=-271733879,c=-1732584194,d=271733878;for(let i=0;i<x.length;i+=16){const oa=a,ob=b,oc=c,od=d;a=F(a,b,c,d,x[i],7,-680876936);d=F(d,a,b,c,x[i+1],12,-389564586);c=F(c,d,a,b,x[i+2],17,606105819);b=F(b,c,d,a,x[i+3],22,-1044525330);a=F(a,b,c,d,x[i+4],7,-176418897);d=F(d,a,b,c,x[i+5],12,1200080426);c=F(c,d,a,b,x[i+6],17,-1473231341);b=F(b,c,d,a,x[i+7],22,-45705983);a=F(a,b,c,d,x[i+8],7,1770035416);d=F(d,a,b,c,x[i+9],12,-1958414417);c=F(c,d,a,b,x[i+10],17,-42063);b=F(b,c,d,a,x[i+11],22,-1990404162);a=F(a,b,c,d,x[i+12],7,1804603682);d=F(d,a,b,c,x[i+13],12,-40341101);c=F(c,d,a,b,x[i+14],17,-1502002290);b=F(b,c,d,a,x[i+15],22,1236535329);a=G(a,b,c,d,x[i+1],5,-165796510);d=G(d,a,b,c,x[i+6],9,-1069501632);c=G(c,d,a,b,x[i+11],14,643717713);b=G(b,c,d,a,x[i],20,-373897302);a=G(a,b,c,d,x[i+5],5,-701558691);d=G(d,a,b,c,x[i+10],9,38016083);c=G(c,d,a,b,x[i+15],14,-660478335);b=G(b,c,d,a,x[i+4],20,-405537848);a=G(a,b,c,d,x[i+9],5,568446438);d=G(d,a,b,c,x[i+14],9,-1019803690);c=G(c,d,a,b,x[i+3],14,-187363961);b=G(b,c,d,a,x[i+8],20,1163531501);a=G(a,b,c,d,x[i+13],5,-1444681467);d=G(d,a,b,c,x[i+2],9,-51403784);c=G(c,d,a,b,x[i+7],14,1735328473);b=G(b,c,d,a,x[i+12],20,-1926607734);a=H(a,b,c,d,x[i+5],4,-378558);d=H(d,a,b,c,x[i+8],11,-2022574463);c=H(c,d,a,b,x[i+11],16,1839030562);b=H(b,c,d,a,x[i+14],23,-35309556);a=H(a,b,c,d,x[i+1],4,-1530992060);d=H(d,a,b,c,x[i+4],11,1272893353);c=H(c,d,a,b,x[i+7],16,-155497632);b=H(b,c,d,a,x[i+10],23,-1094730640);a=H(a,b,c,d,x[i+13],4,681279174);d=H(d,a,b,c,x[i],11,-358537222);c=H(c,d,a,b,x[i+3],16,-722521979);b=H(b,c,d,a,x[i+6],23,76029189);a=H(a,b,c,d,x[i+9],4,-640364487);d=H(d,a,b,c,x[i+12],11,-421815835);c=H(c,d,a,b,x[i+15],16,530742520);b=H(b,c,d,a,x[i+2],23,-995338651);a=I(a,b,c,d,x[i],6,-198630844);d=I(d,a,b,c,x[i+7],10,1126891415);c=I(c,d,a,b,x[i+14],15,-1416354905);b=I(b,c,d,a,x[i+5],21,-57434055);a=I(a,b,c,d,x[i+12],6,1700485571);d=I(d,a,b,c,x[i+3],10,-1894986606);c=I(c,d,a,b,x[i+10],15,-1051523);b=I(b,c,d,a,x[i+1],21,-2054922799);a=I(a,b,c,d,x[i+8],6,1873313359);d=I(d,a,b,c,x[i+15],10,-30611744);c=I(c,d,a,b,x[i+6],15,-1560198380);b=I(b,c,d,a,x[i+13],21,1309151649);a=I(a,b,c,d,x[i+4],6,-145523070);d=I(d,a,b,c,x[i+11],10,-1120210379);c=I(c,d,a,b,x[i+2],15,718787259);b=I(b,c,d,a,x[i+9],21,-343485551);a=A(a,oa);b=A(b,ob);c=A(c,oc);d=A(d,od)}return[a,b,c,d]}return r2h(rMD5(u8(s)))}

const sign = p => { const ks = Object.keys(p).sort(); return { sign: md5(ks.map(k=>k+'='+encodeURIComponent(p[k])).join('&') + KEY), ...p }; };
const lbl = e => ({20000:'SUCCESS',40005:'USED UP',40007:'EXPIRED',40008:'ALREADY HAVE',40011:'SAME TYPE USED',40014:'NOT FOUND',40020:'USER INFO ERR',40019:'RATE LIMITED'}[e.err_code] || e.msg);
const store = { get(k){ try{ return JSON.parse(localStorage.getItem('ks_'+k)); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem('ks_'+k, JSON.stringify(v)); }catch(e){} } };
const ledger = {
  all(){ return store.get('ledger') || {}; },
  record(fid, cdk, j){ const L = this.all(); (L[fid] = L[fid] || {})[cdk] = { code: j.err_code, msg: j.msg, at: Date.now() }; store.set('ledger', L); },
  done(fid, cdk){ const e = this.all()[fid] && this.all()[fid][cdk]; return !!e && e.code === 20000; },
  summary(){ const rows = []; for (const fid of Object.keys(this.all())) rows.push({ playerId: fid, redeemed: Object.keys(this.all()[fid]).filter(c => this.all()[fid][c].code === 20000) }); return rows; },
  clear(){ store.set('ledger', {}); }
};

async function lookupKingdom(fid){   // returns kingdom NUMBER only (name discarded)
  const ACTION = '40a98b52a0796b9ad015ccc308355704ea2b8155c4';
  const gp = 'https://get2post.vercel.app/api/post?url=' + encodeURIComponent('https://kingshot.net/gift-codes/redeem') +
    '&data=' + encodeURIComponent('["' + fid + '"]') +
    '&headers=' + encodeURIComponent(JSON.stringify({ 'Next-Action': ACTION, 'Content-Type':'text/plain;charset=UTF-8', 'Origin':'https://kingshot.net' })) + '&response=json';
  const env = await (await fetch(gp)).json();
  const text = typeof env.body === 'string' ? env.body : JSON.stringify(env.body);
  const line = text.split('\n').find(l => l.indexOf('"status"') > -1 && l.indexOf('"data"') > -1);
  const obj = JSON.parse(line.slice(line.indexOf(':') + 1));
  if (obj.status === 'success' && obj.data && obj.data.kingdom != null) return String(obj.data.kingdom);
  throw new Error('lookup failed');
}
async function kidFor(fid){
  const c = store.get('kid_' + fid); if (c) return c;
  try { const kid = await lookupKingdom(fid); store.set('kid_' + fid, kid); return kid; }
  catch(e){}
  if (KNOWN[fid]) return KNOWN[fid];
  const a = prompt('Kingdom for Player ' + fid + '?');
  if (a) { const k = a.replace(/\D/g,''); store.set('kid_' + fid, k); return k; }
  throw new Error('unknown kingdom ' + fid);
}

const keyFailed = j => !j.err_code || /params|sign/i.test(j.msg || '');
async function post(fid, kid, cdk){
  const p = sign({ fid, kid, cdk, captcha_code:'AUTO', time: Math.floor(Date.now()/1000) });
  const r = await fetch(URL + '/gift_code', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams(p).toString() });
  return r.json();
}
async function redeemOne(fid, cdk){
  const kid = await kidFor(fid);
  let j = await post(fid, kid, cdk);
  if (keyFailed(j)) { console.log('key rotated - extracting'); KEY = await extractKey(); await wait(1500); j = await post(fid, kid, cdk); }
  if (j.err_code === 40019) { console.log('rate-limited - waiting 60s'); await wait(60000); j = await post(fid, kid, cdk); }
  return j;
}
async function extractKey(){
  const prox = 'https://allorigins.hexlet.app/raw?url=';
  const gt = async u => { try { const r = await fetch(prox + encodeURIComponent(u)); if(!r.ok) throw 0; return await r.text(); } catch(e){ const r2 = await fetch(u); return await r2.text(); } };
  const html = await gt('https://ks-giftcode.centurygame.com/');
  const hash = (html.match(/\/js\/app\.([0-9a-f]+)\.js/) || [])[1];
  const appJs = await gt('https://ks-giftcode.centurygame.com/js/app.' + hash + '.js');
  const chunkName = (appJs.match(/([A-Za-z0-9_]+_vue)/) || [])[1] || 'src_pages_home_index_vue';
  const chunk = await gt('https://ks-giftcode.centurygame.com/js/' + chunkName + '.' + hash + '.js');
  const hex = (chunk.match(/\[['\"]MD5['\"]\]\)\([^)]*\+[A-Za-z_$][\w$]*\((0x[0-9a-f]+)\)/) || [])[1];
  const dec = (chunk.match(/^var\s+[A-Za-z_$][\w$]*\s*=\s*([A-Za-z_$][\w$]*)\s*;/) || [])[1];
  (0, eval)(chunk);
  return globalThis[dec](parseInt(hex, 16));
}

async function redeem(codes, only, skipDone = true){
  const targets = only ? ACCS.filter(x => only.includes(x)) : ACCS;
  for (const cdk of codes) {
    console.log('\ncode:', cdk);
    for (const fid of targets) {
      if (skipDone && ledger.done(fid, cdk)) { console.log('  ' + fid + ' - already redeemed (saved), skip'); continue; }
      try { const j = await redeemOne(fid, cdk); ledger.record(fid, cdk, j); console.log('  ' + fid.padEnd(10), lbl(j)); }
      catch(e){ console.log('  ' + fid.padEnd(10), 'ERR', e.message); }
      await wait(4000);
    }
  }
}

// ============================ FINDER ============================
const LIVE = new Set([20000, 40005, 40008, 40011]);   // proofs a code exists/is live
async function probeCode(cdk, fid){
  fid = fid || PROBE;
  const j = await redeemOne(fid, cdk);
  ledger.record(fid, cdk, j);
  console.log('  probe ' + cdk + ' on ' + fid + ' -> ' + lbl(j));
  return { cdk, fid, j };
}
function dateCodes(from, to){       // generate KS+MMDD / OFFICIALSTORE+MMDD candidates
  const out = []; const base = new Date();
  for (let d = from; d <= to; d++) {
    const dt = new Date(base.getTime() + d * 86400000);
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    out.push('KS' + mm + dd, 'OFFICIALSTORE' + mm + dd);
  }
  return out;
}
async function liveFromNet(){       // codes currently listed by kingshot.net
  try {
    const prox = 'https://allorigins.hexlet.app/raw?url=';
    const r = await fetch(prox + encodeURIComponent('https://kingshot.net/gift-codes'));
    const html = await r.text();
    const m = html.match(/"numberOfItems":\d+,"itemListElement":\[([\s\S]*?)\]\s*}/);
    if (!m) return [];
    return [...new Set([...m[1].matchAll(/"name":"([A-Z0-9]+)"/g)].map(x => x[1]))];
  } catch(e){ return []; }
}
async function findCodes(seeds, fromDays, toDays){
  seeds = seeds || [];
  const candidates = [...new Set([...(await liveFromNet()), ...seeds, ...dateCodes(fromDays !== undefined ? fromDays : -2, toDays !== undefined ? toDays : 5)])];
  console.log('probing', candidates.length, 'candidates');
  const found = [];
  for (const cdk of candidates) {
    try { const r = await probeCode(cdk); if (LIVE.has(r.j.err_code)) found.push(cdk); }
    catch(e){ console.log('  probe err', cdk, e.message); }
    await wait(4000);
  }
  console.log('LIVE codes found:', found);
  return found;
}
async function findAndRedeem(seeds, fromDays, toDays){
  const found = await findCodes(seeds, fromDays, toDays);
  if (found.length) await redeem(found);
  return found;
}

globalThis.KSR = { redeem, findCodes, findAndRedeem, probeCode, dateCodes, liveFromNet, ledger, kidFor, ACCS, KNOWN };

// ============================ USAGE ============================
// Load:  paste this whole file in console, OR fetch+eval:
//   fetch('YOUR_HOST/kingshot.js').then(r=>r.text()).then(eval)
// Then:
//   KSR.redeem(['KS0907','VIP777']);                 // redeem known codes on all IDs
//   KSR.redeem(['NEWCODE'], ['14302414']);           // one ID only
//   KSR.findAndRedeem();                             // FIND live codes, then redeem all
//   KSR.findCodes(['SOMESEED']);                     // find only (prints live list)
//   KSR.probeCode('KS0910');                         // check one code on PROBE account
//   KSR.ledger.summary();                            // saved results per Player ID
//   KSR.ledger.clear();
