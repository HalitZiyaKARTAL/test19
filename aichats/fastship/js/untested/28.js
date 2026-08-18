/* ============================================================
   EVAL EXTRAS v1 — voice TTS replies + auto-send + safeRead
   ------------------------------------------------------------
   NOT in eval1 v3.3.2 or widgets v2.2. Paste AFTER widgets.
   - Voice TTS replies (speaks assistant replies aloud)
   - Auto-send ("send message" → 5s countdown → send + stop mic + clear)
   - safeRead (masked API key reader — privacy)
   Selective + future-proof: owns namespace window.__widgets.extras
   ============================================================ */
(function(){
'use strict';
window.__widgets = window.__widgets || {};
try { if (window.__widgets.extras && window.__widgets.extras.remove) window.__widgets.extras.remove(); } catch(e){}

var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
var toast = function(msg,color){ var o=document.getElementById('extrasToast'); if(o)o.remove(); var t=document.createElement('div'); t.id='extrasToast'; t.textContent=msg; Object.assign(t.style,{position:'fixed',left:'50%',bottom:'150px',transform:'translateX(-50%)',background:'#2a2a3e',border:'1px solid #2a2a40',color:'#e0e0e8',padding:'8px 16px',borderRadius:'20px',fontSize:'13px',zIndex:'9999',boxShadow:'0 6px 20px rgba(0,0,0,.5)',maxWidth:'86vw',textAlign:'center'}); if(color)t.style.borderColor=color; document.body.appendChild(t); setTimeout(function(){t.remove();},2500); };

/* ---------- 1) VOICE TTS replies ---------- */
var voiceKey = 'dse_voice_mode';
var voiceEnabled = localStorage.getItem(voiceKey) === '1';
var pickVoice = function(){
  var vs = speechSynthesis.getVoices();
  return vs.find(function(v){return /en[-_]GB/i.test(v.lang);}) || vs.find(function(v){return /en[-_]US/i.test(v.lang);}) || vs.find(function(v){return /en/i.test(v.lang);}) || vs[0] || null;
};
var speak = function(text){
  try {
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(String(text||'').replace(/```[\s\S]*?```/g,' code block ').slice(0,400));
    var v = pickVoice(); if(v){ u.voice=v; u.lang=v.lang; }
    u.rate=1; u.pitch=1; speechSynthesis.speak(u);
    return {ok:true, voice:v&&v.name};
  } catch(e){ return {ok:false, err:String(e)}; }
};
// auto-speak new assistant messages
if(!window.__voiceReplyObserver){
  window.__voiceReplyObserver = true;
  var chat = document.getElementById('chatContainer');
  if(chat){
    var obs = new MutationObserver(function(muts){
      if(!voiceEnabled) return;
      muts.forEach(function(m){ m.addedNodes.forEach(function(n){
        if(n.nodeType===1 && n.classList && n.classList.contains('assistant')){
          var txt = (n.querySelector('.bubble')?.textContent||'').trim();
          if(txt && txt.indexOf('//')!==0) speak(txt);
        }
      });});
    });
    obs.observe(chat, {childList:true, subtree:false});
  }
}
window.__voice = {
  on: function(){ voiceEnabled=true; localStorage.setItem(voiceKey,'1'); return speak('Voice replies enabled.'); },
  off: function(){ voiceEnabled=false; localStorage.setItem(voiceKey,'0'); return {ok:true}; },
  speak: speak,
  status: function(){ return {enabled:voiceEnabled, voices:speechSynthesis.getVoices().length, voice:pickVoice()&&pickVoice().name}; },
  test: function(){ return speak('Voice chat test successful.'); }
};

/* ---------- 2) AUTO-SEND ("send message" trigger) ---------- */
var TRIGGERS = [
  /\b(send a message now|send the message now|send that message now)\s*$/i,
  /\b(send a message|send the message|send this message)\s*$/i,
  /\b(send message now|send it now|send that now|send this now)\s*$/i,
  /\b(send message|send it|send that|send this|send)\s*$/i
];
var stripTriggers = function(v){
  return v.replace(/\b(send a message now|send the message now|send that message now)\s*$/i,'')
    .replace(/\b(send a message|send the message|send this message)\s*$/i,'')
    .replace(/\b(send message now|send it now|send that now|send this now)\s*$/i,'')
    .replace(/\b(send message|send it|send that|send this|send)\s*$/i,'')
    .replace(/^\s+|\s+$/g,'');
};
var doSend = function(msg){
  var input=document.getElementById('messageInput');
  var send=document.getElementById('sendBtn');
  if(!input||!send) return;
  try { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(input,msg); input.dispatchEvent(new Event('input',{bubbles:true})); }
  catch(e){ input.value=msg; input.dispatchEvent(new Event('input',{bubbles:true})); }
  setTimeout(function(){
    if(!send.disabled){ send.click(); toast('📤 Sent: "'+msg.slice(0,40)+'"','#4caf84'); if(window.__mic && window.__mic.status && window.__mic.status().listening) window.__mic.stop(); }
    else toast('⚠️ Send disabled','#e0556a');
  },250);
};
var astate=null;
if(window.__autosendTimer) clearInterval(window.__autosendTimer);
window.__autosendTimer = setInterval(function(){
  var input=document.getElementById('messageInput');
  if(!input) return;
  var v=input.value;
  var isTrigger = TRIGGERS.some(function(re){return re.test(v.trim());});
  if(astate){
    if(!isTrigger){ astate=null; return; }
    if(Date.now()-astate.at >= 5000){ var msg=stripTriggers(v.trim()); astate=null; if(msg) doSend(msg); }
    return;
  }
  if(isTrigger){
    var msg=stripTriggers(v.trim());
    if(msg){ astate={at:Date.now()}; toast('🗣 Sending "'+msg.slice(0,40)+'" in 5s…','#4caf84'); }
  }
},400);
window.__autosend = {
  enable: function(){ if(window.__autosendTimer) clearInterval(window.__autosendTimer); window.__autosendTimer=setInterval(function(){},400); return 'enabled'; },
  disable: function(){ if(window.__autosendTimer) clearInterval(window.__autosendTimer); window.__autosendTimer=0; astate=null; return 'disabled'; },
  status: function(){ return {enabled: !!window.__autosendTimer, countdown: astate ? {remaining: Math.max(0,Math.round((5000-(Date.now()-astate.at))/1000))} : null}; }
};

/* ---------- 3) safeRead (masked key reader) ---------- */
window.__safeRead = {
  mask: function(v){
    if(v==null) return null;
    var s=String(v);
    if(s.length<=4) return '*'.repeat(s.length);
    return s.slice(0,4)+'…'+'*'.repeat(Math.min(8,s.length-4));
  },
  keySummary: function(){
    var k=document.getElementById('apiKeyInput')?.value||'';
    return {present:!!k, len:k.length, masked:k?window.__safeRead.mask(k):null};
  }
};

window.__widgets.extras = {
  voice: window.__voice,
  autosend: window.__autosend,
  safeRead: window.__safeRead,
  remove: function(){
    if(window.__autosendTimer){ clearInterval(window.__autosendTimer); window.__autosendTimer=0; }
    delete window.__voice; delete window.__autosend; delete window.__safeRead;
    delete window.__widgets.extras;
  }
};
console.log('[extras] voice + autosend + safeRead ready');
})();
