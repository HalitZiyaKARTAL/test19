(async()=>{
const LAST=290,start=performance.now(),startedAt=new Date(),Q='[data-message-author-role]',mounted=()=>[...document.querySelectorAll(Q)],cached=window.__CHATGPT_SCROLL_PROMPTS__?.prompts||[];
if(!mounted().length)throw Error('No mounted chat turns found');
const records=new Map(cached.map(x=>[x.message_id||x.key,{...x,role:'user',source:'cached user scan',captured_after_ms:null}]));
let scroller=mounted()[0];while(scroller.parentElement){scroller=scroller.parentElement;let s=getComputedStyle(scroller);if(/auto|scroll|overlay/.test(s.overflowY)&&scroller.scrollHeight>scroller.clientHeight+50)break}
const page=[document.body,document.documentElement,document.scrollingElement].includes(scroller),top=()=>page?scrollY:scroller.scrollTop,height=()=>page?document.documentElement.scrollHeight:scroller.scrollHeight,view=()=>page?innerHeight:scroller.clientHeight,max=()=>Math.max(0,height()-view()),go=y=>page?scrollTo(0,y):scroller.scrollTop=y,pause=ms=>new Promise(r=>setTimeout(r,ms)),settle=ms=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,ms))),originalRatio=max()?top()/max():1;

function capture(){let added=0;for(const element of mounted()){const turn=element.closest('[data-testid^="conversation-turn-"]')||element.closest('article')||element,role=element.dataset.messageAuthorRole,id=element.dataset.messageId||turn.dataset.messageId,testid=turn.dataset.testid,key=id||testid;if(!key||records.has(key))continue;const n=Number(testid?.match(/(\d+)(?!.*\d)/)?.[1]),time=turn.querySelector('time');records.set(key,{key,role,source:'full scan',message_id:id||null,turn_testid:testid||null,turn_number:Number.isFinite(n)?n:null,displayed_or_dom_time:time?.dateTime||time?.getAttribute('datetime')||time?.innerText||null,captured_after_ms:Math.round(performance.now()-start),inner_text:element.innerText,text_content:element.textContent,inner_html:element.innerHTML});added++}if(added)console.log('New:',added,'Total:',records.size)}

async function scan(ratio,delay){go(0);await pause(650);capture();let stable=0,count=-1,maximum=-1;for(let i=0;i<3000&&stable<6;i++){let here=top(),limit=max(),next=Math.min(limit,here+Math.max(240,view()*ratio));if(next>here+1){go(next);await settle(delay);capture();stable=0}else{await pause(180);capture();let m=max();stable=records.size===count&&m===maximum?stable+1:0;count=records.size;maximum=m}}}

const missing=()=>{let have=new Set([...records.values()].map(x=>x.turn_number).filter(Number.isFinite));return Array.from({length:LAST},(_,i)=>i+1).filter(i=>!have.has(i))};

console.log('Cached users:',cached.length,'Fast full-chat scan starting; do not scroll');
await scan(1.15,45);let gaps=missing();if(gaps.length){console.log('Fast pass missing',gaps.length,'turns; validating slowly');await scan(.55,85);gaps=missing()}
go(originalRatio*max());await settle(40);

const messages=[...records.values()].sort((a,b)=>(a.turn_number??1e9)-(b.turn_number??1e9)),roles=messages.reduce((o,x)=>(o[x.role]=(o[x.role]||0)+1,o),{}),finishedAt=new Date(),duration=Math.round(performance.now()-start),bundle={schema:'chatgpt-full-active-chat-v3',source_url:location.href,started_at:startedAt.toISOString(),finished_at:finishedAt.toISOString(),scan_duration_ms:duration,scan_duration_seconds:+(duration/1000).toFixed(3),expected_last_turn:LAST,complete_visible_turn_sequence:!gaps.length,missing_turn_numbers:gaps,message_count:messages.length,role_counts:roles,readable_chat:messages.map((x,i)=>'### '+(x.turn_number??i+1)+' — '+x.role+'\n'+x.inner_text).join('\n\n'),messages};

window.__CHATGPT_FULL_SCAN__=bundle;
const id=location.pathname.match(/\/c\/([^/?#]+)/)?.[1]||'chat',blob=new Blob(['\ufeff',JSON.stringify(bundle,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=Object.assign(document.createElement('a'),{href:url,download:'chatgpt_'+id+'_FULL_'+messages.length+'_turns_'+Math.round(duration/1000)+'s.json'});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);

console.table({turns:messages.length,user:roles.user||0,assistant:roles.assistant||0,seconds:bundle.scan_duration_seconds,missing:gaps.length});console.log(gaps.length?'INCOMPLETE — missing:':'FULL ACTIVE CHAT COMPLETE',gaps)
})().catch(e=>console.error('FULL CHAT SCAN FAILED:',e));
