/* ============================================================
   EVAL WIDGETS v2.3 — mic(+autosend+safeRead) + music + small TTS
   ------------------------------------------------------------
   3 things, one dock:
     🎤 Mic  — tap talk/stop · long-press lang · AUTO-SEND included
              (say "send message" → 5s → sends + stops mic + clears)
              · safeRead (masked key reader) included
     🎵 Music — tap open/close player (🔁 loop · 🔊 mute · 🔄 next · ✕)
     🔊 TTS  — tap to toggle: speaks assistant replies aloud
   DRAG: dock + player draggable, clamped on-screen
   Selective: owns namespace window.__widgets.voiceMusic.
     Other widgets (screen reader etc) untouched.
   REMOVE MUSIC: delete MUSIC PLAYER START..END block (+ btnMusic line)
   ============================================================ */
(function(){
'use strict';
window.__widgets = window.__widgets || {};
try { if (window.__widgets.voiceMusic && window.__widgets.voiceMusic.remove) window.__widgets.voiceMusic.remove(); } catch(e){}
['widgetDock','widgetPlayer','widgetToast'].forEach(function(id){ var el=document.getElementById(id); if(el) el.remove(); });
try { if (window.__ytPlayer) window.__ytPlayer.destroy(); } catch(e){}
window.__ytPlayer = null;
delete window.__widgets.voiceMusic;

var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

/* ============ DOCK ============ */
var dock = document.createElement('div');
dock.id = 'widgetDock';
Object.assign(dock.style, { position:'fixed', zIndex:'9800', display:'flex', flexDirection:'column', gap:'8px', padding:'8px', borderRadius:'22px', background:'rgba(20,20,40,.85)', border:'1px solid #2a2a40', boxShadow:'0 8px 24px rgba(0,0,0,.5)', userSelect:'none', touchAction:'none', WebkitTapHighlightColor:'transparent', cursor:'grab' });
document.body.appendChild(dock);

var btnMic=document.createElement('div'); btnMic.textContent='🎤';
btnMic.style.cssText='width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:20px;background:linear-gradient(135deg,#5b8def,#3b6fc2);color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.35);pointer-events:none;';
dock.appendChild(btnMic);

var btnMusic=document.createElement('div'); btnMusic.textContent='🎵';
btnMusic.style.cssText='width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:20px;background:linear-gradient(135deg,#e0556a,#b3364d);color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.35);pointer-events:none;';
dock.appendChild(btnMusic);

var btnTts=document.createElement('div'); btnTts.textContent='🔊';
btnTts.style.cssText='width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:20px;background:linear-gradient(135deg,#3a7d5a,#2a6b5c);color:#fff;box-shadow:0 4px 12px rgba(0,0,0,.35);pointer-events:none;';
dock.appendChild(btnTts);

var toast=function(msg,color){ var o=document.getElementById('widgetToast'); if(o)o.remove(); var t=document.createElement('div'); t.id='widgetToast'; t.textContent=msg; Object.assign(t.style,{position:'fixed',left:'50%',bottom:'150px',transform:'translateX(-50%)',background:'#2a2a3e',border:'1px solid #2a2a40',color:'#e0e0e8',padding:'8px 16px',borderRadius:'20px',fontSize:'13px',zIndex:'9999',boxShadow:'0 6px 20px rgba(0,0,0,.5)',maxWidth:'86vw',textAlign:'center'}); if(color)t.style.borderColor=color; document.body.appendChild(t); setTimeout(function(){t.remove();},2500); };
if(!document.getElementById('widgetPulseKf')){ var st=document.createElement('style'); st.id='widgetPulseKf'; st.textContent='@keyframes widgetPulse{0%{box-shadow:0 0 0 0 rgba(224,85,106,.6)}70%{box-shadow:0 0 0 14px rgba(224,85,106,0)}100%{box-shadow:0 0 0 0 rgba(224,85,106,0)}}'; document.head.appendChild(st); }

/* ============ DRAG + TAP (coordinate hit-test, 3 buttons) ============ */
var drag={active:false,moved:false,sx:0,sy:0,bx:0,by:0,btn:null,longTimer:0};
var clamp=function(x,y){ var vv=window.visualViewport,W=vv?vv.width:innerWidth,H=vv?vv.height:innerHeight,top=vv?vv.offsetTop:0,w=dock.offsetWidth,h=dock.offsetHeight; return {x:Math.max(4,Math.min(W-w-4,x)),y:Math.max(top+4,Math.min(top+H-h-4,y))}; };
var hit=function(x,y){
  var a=btnMic.getBoundingClientRect(); if(x>=a.left&&x<=a.right&&y>=a.top&&y<=a.bottom) return 'mic';
  var b=btnMusic.getBoundingClientRect(); if(x>=b.left&&x<=b.right&&y>=b.top&&y<=b.bottom) return 'music';
  var c=btnTts.getBoundingClientRect(); if(x>=c.left&&x<=c.right&&y>=c.top&&y<=c.bottom) return 'tts';
  return null;
};
var down=function(x,y){ drag.active=true;drag.moved=false;drag.sx=x;drag.sy=y; var r=dock.getBoundingClientRect();drag.bx=r.left;drag.by=r.top; drag.btn=hit(x,y); drag.longTimer=0; if(drag.btn==='mic')drag.longTimer=setTimeout(function(){ if(drag.active&&!drag.moved) cycleLang(); },600); dock.style.transition='none'; };
var move=function(x,y){ if(!drag.active)return; var dx=x-drag.sx,dy=y-drag.sy; if(Math.abs(dx)+Math.abs(dy)>8)drag.moved=true; if(drag.moved){ clearTimeout(drag.longTimer); var c=clamp(drag.bx+dx,drag.by+dy); dock.style.left=c.x+'px';dock.style.top=c.y+'px';dock.style.right='auto';dock.style.bottom='auto'; } };
var up=function(){ if(!drag.active)return; var wasMoved=drag.moved,btn=drag.btn; clearTimeout(drag.longTimer); drag.active=false;drag.moved=false;drag.btn=null; dock.style.transition=''; if(wasMoved){ var r=dock.getBoundingClientRect(); try{localStorage.setItem('dse_widget_pos',JSON.stringify({x:r.left,y:r.top}));}catch(e){} } else if(btn==='mic')toggleMic(); else if(btn==='music')toggleMusic(); else if(btn==='tts')toggleTts(); };
dock.addEventListener('pointerdown',function(e){down(e.clientX,e.clientY);try{dock.setPointerCapture(e.pointerId);}catch(err){}e.preventDefault();});
dock.addEventListener('pointermove',function(e){move(e.clientX,e.clientY);});
dock.addEventListener('pointerup',up);
dock.addEventListener('pointercancel',up);
dock.addEventListener('touchstart',function(e){var t=e.touches[0];down(t.clientX,t.clientY);e.preventDefault();},{passive:false});
dock.addEventListener('touchmove',function(e){if(drag.active){var t=e.touches[0];move(t.clientX,t.clientY);e.preventDefault();}},{passive:false});
dock.addEventListener('touchend',up,{passive:false});
dock.addEventListener('touchcancel',up,{passive:false});

/* ============ SAFE READ (masked key reader) ============ */
window.__safeRead = {
  mask: function(v){ if(v==null)return null; var s=String(v); if(s.length<=4)return '*'.repeat(s.length); return s.slice(0,4)+'…'+'*'.repeat(Math.min(8,s.length-4)); },
  keySummary: function(){ var k=document.getElementById('apiKeyInput')?.value||''; return {present:!!k, len:k.length, masked:k?window.__safeRead.mask(k):null}; }
};

/* ============ MIC (incl AUTO-SEND) ============ */
var listening=false, rec=null, sessionId=0, restartCount=0, accText='', baseValue='', curSessionText='';
var LANGS=['en-US','en-GB','en-IN','tr-TR','auto'];
var lang=(function(){var s=localStorage.getItem('dse_mic_lang');return LANGS.indexOf(s)>=0?s:'en-US';})();
var effLang=function(){return lang==='auto'?(navigator.language||'en-US'):lang;};
var setMicVisual=function(s){
  if(s){btnMic.style.background='linear-gradient(135deg,#e0556a,#b3364d)';btnMic.style.animation='widgetPulse 1.2s infinite';btnMic.textContent='◉';}
  else{btnMic.style.background='linear-gradient(135deg,#5b8def,#3b6fc2)';btnMic.style.animation='none';btnMic.textContent='🎤';}
};
var setInputRaw=function(v){var input=document.getElementById('messageInput');if(!input)return;try{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(input,v);input.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){input.value=v;input.dispatchEvent(new Event('input',{bubbles:true}));}};
var render=function(){var p=[];if(baseValue)p.push(baseValue.trimEnd());if(accText)p.push(accText.trim());if(curSessionText)p.push(curSessionText.trim());setInputRaw(p.join(' '));};
var beginSession=function(){
  if(!listening)return;
  var id=++sessionId;
  if(rec){try{rec.abort();}catch(e){}rec=null;}
  var r=new SR();r.lang=effLang();r.interimResults=true;r.continuous=false;r.maxAlternatives=3;
  curSessionText='';
  r.onstart=function(){if(sessionId===id&&listening)setMicVisual(true);};
  r.onresult=function(e){if(sessionId!==id||!listening)return;var t='';for(var i=0;i<e.results.length;i++){var a=e.results[i][0];if(a&&a.transcript)t+=a.transcript+' ';}curSessionText=t.trim();render();};
  r.onerror=function(e){if(sessionId!==id)return;if(['no-speech','aborted','network'].indexOf(e.error)>=0)return;toast('Mic: '+e.error,'#e0556a');};
  r.onend=function(){if(sessionId!==id)return;if(curSessionText)accText=(accText?accText+' ':'')+curSessionText;curSessionText='';if(listening){restartCount++;if(restartCount<=60)setTimeout(beginSession,400);else{listening=false;setMicVisual(false);toast('Long session — tap 🎤 again','#d4a050');}}else setMicVisual(false);};
  try{r.start();rec=r;}catch(e){if(sessionId===id){listening=false;setMicVisual(false);toast('Mic start failed: '+e.message,'#e0556a');}}
};
var startListen=function(){if(listening)return;listening=true;restartCount=0;accText='';curSessionText='';baseValue=document.getElementById('messageInput')?document.getElementById('messageInput').value:'';setMicVisual(true);toast('🎤 Listening ('+effLang()+')… tap to stop','#4caf84');beginSession();};
var stopListen=function(){if(!listening&&!rec)return;listening=false;sessionId++;if(rec){try{rec.stop();}catch(e){}}rec=null;setMicVisual(false);toast('🛑 Stopped','#9090a8');};
var toggleMic=function(){if(listening)stopListen();else startListen();};
var cycleLang=function(){var i=LANGS.indexOf(lang);lang=LANGS[(i+1)%LANGS.length];localStorage.setItem('dse_mic_lang',lang);toast('🗣 Lang: '+lang,'#4caf84');};

/* AUTO-SEND (part of mic): say "send message" → 5s → send + stop + clear */
var TRIGGERS=[
  /\b(send a message now|send the message now|send that message now)\s*$/i,
  /\b(send a message|send the message|send this message)\s*$/i,
  /\b(send message now|send it now|send that now|send this now)\s*$/i,
  /\b(send message|send it|send that|send this|send)\s*$/i
];
var stripTriggers=function(v){ return v.replace(/\b(send a message now|send the message now|send that message now)\s*$/i,'').replace(/\b(send a message|send the message|send this message)\s*$/i,'').replace(/\b(send message now|send it now|send that now|send this now)\s*$/i,'').replace(/\b(send message|send it|send that|send this|send)\s*$/i,'').replace(/^\s+|\s+$/g,''); };
var doSend=function(msg){ var input=document.getElementById('messageInput'); var send=document.getElementById('sendBtn'); if(!input||!send)return; try{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(input,msg);input.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){input.value=msg;input.dispatchEvent(new Event('input',{bubbles:true}));} setTimeout(function(){ if(!send.disabled){ send.click(); toast('📤 Sent: "'+msg.slice(0,40)+'"','#4caf84'); if(listening) stopListen(); } else toast('⚠️ Send disabled','#e0556a'); },250); };
var astate=null;
if(window.__autosendTimer) clearInterval(window.__autosendTimer);
window.__autosendTimer=setInterval(function(){ var input=document.getElementById('messageInput'); if(!input)return; var v=input.value; var isT=TRIGGERS.some(function(re){return re.test(v.trim());}); if(astate){ if(!isT){astate=null;return;} if(Date.now()-astate.at>=5000){ var m=stripTriggers(v.trim()); astate=null; if(m)doSend(m); } return; } if(isT){ var m=stripTriggers(v.trim()); if(m){ astate={at:Date.now()}; toast('🗣 Sending "'+m.slice(0,40)+'" in 5s…','#4caf84'); } } },400);

/* ===== MUSIC PLAYER START ===== */
var playerEl=null, player=null;
var MUSIC_IDS=['9bZkp7q19f0','ASO_zypdnsQ','aJOTlE1K90k'];
var midx=0;
var buildPlayer=function(){
  if(playerEl)playerEl.remove();
  playerEl=document.createElement('div');playerEl.id='widgetPlayer';
  Object.assign(playerEl.style,{position:'fixed',zIndex:'9700',width:'280px',background:'#000',borderRadius:'12px',overflow:'hidden',boxShadow:'0 8px 30px rgba(0,0,0,.6)',border:'1px solid #2a2a40'});
  playerEl.innerHTML='<div id="wpHead" style="display:flex;justify-content:space-between;align-items:center;background:#1a1a2e;padding:8px 10px;color:#e0e0e8;font-size:12px;font-weight:600;cursor:grab;touch-action:none;user-select:none;min-height:30px;"><span id="wpTitle">⠿ 🎵 Music</span><span style="display:flex;gap:4px;"><button id="wpLoop" style="background:#2a2a40;color:#4caf84;border:none;border-radius:4px;cursor:pointer;font-size:11px;padding:2px 5px;">🔁</button><button id="wpMute" style="background:#2a2a40;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;padding:2px 5px;">🔊</button><button id="wpNext" style="background:#2a2a40;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;padding:2px 5px;">🔄</button><button id="wpClose" style="background:none;border:none;color:#9090a8;font-size:15px;cursor:pointer;line-height:1;padding:0 2px;">✕</button></span></div><div id="wpStage" style="width:280px;height:158px;background:#000;position:relative;"><div id="wpMsg" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:#9090a8;font-size:12px;text-align:center;padding:10px;z-index:2;">tap ▶</div><div id="wpPlayerDiv"></div></div>';
  document.body.appendChild(playerEl);
  playerEl.style.display='block';
  var msg=document.getElementById('wpMsg');
  var load=function(id,autoplay){
    if(player){try{player.destroy();}catch(e){}player=null;}
    document.getElementById('wpPlayerDiv').innerHTML=''; msg.style.display='none';
    if(!window.YT||!window.YT.Player){msg.textContent='YT API loading…';msg.style.display='flex';return;}
    player=new YT.Player('wpPlayerDiv',{width:280,height:158,videoId:id,playerVars:{autoplay:autoplay?1:0,playsinline:1,rel:0,modestbranding:1,origin:location.origin},events:{
      onReady:function(){window.__ytPlayer=player;try{document.getElementById('wpTitle').textContent='⠿ 🎵 '+(player.getVideoData().title||'Music').slice(0,26);}catch(e){}msg.style.display='none';},
      onStateChange:function(e){if(e.data===0&&window.__ytLoopOn!==false){try{player.playVideo();}catch(err){}}},
      onError:function(e){var c={2:'invalid',5:'html5',100:'not found',101:'embedding disabled',150:'embedding disabled'};msg.textContent='❌ '+(c[e.data]||'err '+e.data)+' — 🔄 next';msg.style.display='flex';}
    }});
  };
  var next=function(){midx=(midx+1)%MUSIC_IDS.length;load(MUSIC_IDS[midx],true);};
  document.getElementById('wpClose').onclick=function(){playerEl.style.display='none';};
  document.getElementById('wpNext').onclick=next;
  document.getElementById('wpLoop').onclick=function(){window.__ytLoopOn=!(window.__ytLoopOn!==false);document.getElementById('wpLoop').style.color=window.__ytLoopOn?'#4caf84':'#9090a8';};
  document.getElementById('wpMute').onclick=function(){if(player){if(player.isMuted()){player.unMute();document.getElementById('wpMute').textContent='🔊';}else{player.mute();document.getElementById('wpMute').textContent='🔇';}}};
  var head=document.getElementById('wpHead');
  var hp=false,hm=false,hx=0,hy=0,hbx=0,hby=0;
  head.addEventListener('pointerdown',function(e){if(e.target.closest('button'))return;hp=true;hm=false;hx=e.clientX;hy=e.clientY;var r=playerEl.getBoundingClientRect();hbx=r.left;hby=r.top;try{playerEl.setPointerCapture(e.pointerId);}catch(err){}e.preventDefault();});
  head.addEventListener('pointermove',function(e){if(!hp)return;var dx=e.clientX-hx,dy=e.clientY-hy;if(Math.abs(dx)+Math.abs(dy)>5)hm=true;if(hm){var w=playerEl.offsetWidth,h=playerEl.offsetHeight;playerEl.style.left=Math.max(4,Math.min(innerWidth-w-4,hbx+dx))+'px';playerEl.style.top=Math.max(60,Math.min(innerHeight-h-4,hby+dy))+'px';playerEl.style.right='auto';playerEl.style.bottom='auto';}});
  var endH=function(){if(!hp)return;hp=false;if(hm){var r=playerEl.getBoundingClientRect();try{localStorage.setItem('dse_widget_player_pos',JSON.stringify({x:r.left,y:r.top}));}catch(e){}}};
  head.addEventListener('pointerup',endH); head.addEventListener('pointercancel',endH);
  head.addEventListener('touchstart',function(e){if(e.target.closest('button'))return;var t=e.touches[0];hp=true;hm=false;hx=t.clientX;hy=t.clientY;var r=playerEl.getBoundingClientRect();hbx=r.left;hby=r.top;e.preventDefault();},{passive:false});
  head.addEventListener('touchmove',function(e){if(!hp)return;var t=e.touches[0];var dx=t.clientX-hx,dy=t.clientY-hy;if(Math.abs(dx)+Math.abs(dy)>5)hm=true;if(hm){var w=playerEl.offsetWidth,h=playerEl.offsetHeight;playerEl.style.left=Math.max(4,Math.min(innerWidth-w-4,hbx+dx))+'px';playerEl.style.top=Math.max(60,Math.min(innerHeight-h-4,hby+dy))+'px';playerEl.style.right='auto';playerEl.style.bottom='auto';e.preventDefault();}},{passive:false});
  head.addEventListener('touchend',endH,{passive:false});
  try{var s=JSON.parse(localStorage.getItem('dse_widget_player_pos')||'null');if(s&&typeof s.x==='number'){playerEl.style.left=s.x+'px';playerEl.style.top=s.y+'px';playerEl.style.right='auto';playerEl.style.bottom='auto';}else{playerEl.style.right='14px';playerEl.style.top='100px';playerEl.style.left='auto';playerEl.style.bottom='auto';}}catch(e){}
  load(MUSIC_IDS[0],true);
};
var toggleMusic=function(){
  if(playerEl&&playerEl.style.display==='block'){playerEl.style.display='none';}
  else if(playerEl&&playerEl.style.display==='none'){playerEl.style.display='block';}
  else{buildPlayer();}
};
/* ===== MUSIC PLAYER END ===== */

/* ============ SMALL TTS (speaks assistant replies) ============ */
var ttsEnabled = localStorage.getItem('dse_voice_mode') === '1';
var pickVoice=function(){ var vs=speechSynthesis.getVoices(); return vs.find(function(v){return /en[-_]GB/i.test(v.lang);})||vs.find(function(v){return /en[-_]US/i.test(v.lang);})||vs.find(function(v){return /en/i.test(v.lang);})||vs[0]||null; };
var speak=function(text){ try{ speechSynthesis.cancel(); var u=new SpeechSynthesisUtterance(String(text||'').replace(/```[\s\S]*?```/g,' code block ').slice(0,400)); var v=pickVoice(); if(v){u.voice=v;u.lang=v.lang;} u.rate=1;u.pitch=1; speechSynthesis.speak(u); return {ok:true,voice:v&&v.name}; }catch(e){ return {ok:false,err:String(e)}; } };
var setTtsVisual=function(s){ btnTts.style.opacity = s ? '1' : '0.5'; btnTts.style.boxShadow = s ? '0 0 12px rgba(74,175,132,.8)' : '0 4px 12px rgba(0,0,0,.35)'; };
if(!window.__voiceReplyObserver){
  window.__voiceReplyObserver=true;
  var chatEl=document.getElementById('chatContainer');
  if(chatEl){
    var obs=new MutationObserver(function(muts){ if(!ttsEnabled)return; muts.forEach(function(m){ m.addedNodes.forEach(function(n){ if(n.nodeType===1&&n.classList&&n.classList.contains('assistant')){ var t=(n.querySelector('.bubble')?.textContent||'').trim(); if(t&&t.indexOf('//')!==0) speak(t); } }); }); });
    obs.observe(chatEl,{childList:true,subtree:false});
  }
}
var toggleTts=function(){
  ttsEnabled=!ttsEnabled;
  localStorage.setItem('dse_voice_mode', ttsEnabled?'1':'0');
  setTtsVisual(ttsEnabled);
  toast(ttsEnabled?'🔊 TTS replies ON':'🔊 TTS replies OFF', ttsEnabled?'#4caf84':'#9090a8');
  if(ttsEnabled) speak('Voice replies on.');
};
setTtsVisual(ttsEnabled);

/* ============ POSITION ============ */
setTimeout(function(){
  var vv=window.visualViewport,W=vv?vv.width:innerWidth,H=vv?vv.height:innerHeight,top=vv?vv.offsetTop:0,w=dock.offsetWidth,h=dock.offsetHeight;
  try{var s=JSON.parse(localStorage.getItem('dse_widget_pos')||'null');if(s&&typeof s.x==='number'){dock.style.left=Math.max(4,Math.min(W-w-4,s.x))+'px';dock.style.top=Math.max(top+4,Math.min(top+H-h-4,s.y))+'px';}else{dock.style.right='14px';dock.style.bottom='120px';dock.style.left='auto';dock.style.top='auto';}}catch(e){dock.style.right='14px';dock.style.bottom='120px';}
},50);

window.__widgets.voiceMusic={
  mic:{toggle:toggleMic,start:startListen,stop:stopListen,cycleLang,status:function(){return{listening:listening,lang:lang,supported:!!SR};}},
  music:{toggle:toggleMusic,status:function(){return{playerOpen:!!(playerEl&&playerEl.style.display==='block')};}},
  tts:{toggle:toggleTts,speak:speak,status:function(){return{enabled:ttsEnabled,voices:speechSynthesis.getVoices().length};}},
  autosend:{status:function(){return{enabled:!!window.__autosendTimer,countdown:astate?{remaining:Math.max(0,Math.round((5000-(Date.now()-astate.at))/1000))}:null};}},
  safeRead:window.__safeRead,
  remove:function(){ try{if(rec)rec.abort();}catch(e){} try{if(player)player.destroy();}catch(e){} if(playerEl)playerEl.remove(); if(window.__autosendTimer){clearInterval(window.__autosendTimer);window.__autosendTimer=0;} dock.remove(); delete window.__widgets.voiceMusic; delete window.__voice; delete window.__autosend; }
};
window.__mic=window.__widgets.voiceMusic.mic;
window.__voice={on:function(){ttsEnabled=true;localStorage.setItem('dse_voice_mode','1');setTtsVisual(true);return speak('Voice replies enabled.');},off:function(){ttsEnabled=false;localStorage.setItem('dse_voice_mode','0');setTtsVisual(false);return {ok:true};},speak:speak,status:function(){return{enabled:ttsEnabled};}};
window.__autosend={status:window.__widgets.voiceMusic.autosend.status,disable:function(){if(window.__autosendTimer){clearInterval(window.__autosendTimer);window.__autosendTimer=0;}},enable:function(){}};
console.log('[widgets v2.3] 🎤 mic+autosend · 🎵 music · 🔊 tts ready');
})();
