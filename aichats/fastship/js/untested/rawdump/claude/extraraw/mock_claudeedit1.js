/* mock provider layer — installed before the app boots (so eval1 captures it as ORIG.fetch) */
(function(){
  localStorage.setItem('dse_metadata_migrated','true');
  var q = new URLSearchParams(location.search);
  var meta = {settings:{}, apiKeys:{deepseek:'sk-test', zai:'sk-test', openai:'sk-test', gemini:'sk-test'}, models:{}, chatStates:{}};
  if (q.get('provider')) localStorage.setItem('dse_active_provider', q.get('provider'));
  localStorage.setItem('dse_metadata', JSON.stringify(meta));
  var LOG = window.__mockLog = [];
  var enc = new TextEncoder();
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  function sse(frames, gapMs){
    return new ReadableStream({ start: async function(c){
      for (var i=0;i<frames.length;i++){ if (gapMs) await sleep(gapMs); c.enqueue(enc.encode(frames[i])); }
      c.close(); window.__mockCfg.closed=(window.__mockCfg.closed||0)+1;
    }});
  }
  var ev = function(o){ return 'event: '+o.type+'\ndata: '+JSON.stringify(o)+'\n\n'; };
  var dat = function(o){ return 'data: '+JSON.stringify(o)+'\n\n'; };
  window.__mockCfg = { delayMs: 0, repeatUsage: false };
  var realFetch = window.fetch.bind(window);
  window.fetch = function(input, init){
    var url = typeof input === 'string' ? input : input.url; init = init || {};
    var body = null; try { body = init.body ? JSON.parse(init.body) : null; } catch(e){}
    if (!/api\.(deepseek|z|openai)\.(com|ai)|generativelanguage\.googleapis\.com/.test(url)) return realFetch(input, init);
    LOG.push({url: url, method: init.method || 'GET', body: body});
    if ((init.method||'GET') === 'GET'){
      if (/\/models$/.test(url)){ var ids = /openai/.test(url)?['gpt-5.6-sol','gpt-5.6-luna']:/googleapis/.test(url)?['gemini-3.1-pro-preview','gemini-3.6-flash']:/api\.z\./.test(url)?['glm-5.2']:['deepseek-v4-pro','deepseek-v4-flash']; return Promise.resolve(new Response(JSON.stringify({data:ids.map(function(i){return {id:i};})}),{status:200})); }
      if (/balance/.test(url)) return Promise.resolve(new Response(JSON.stringify({balance_infos:[{total_balance:'12.34'}]}),{status:200}));
      return Promise.resolve(new Response('{}',{status:404}));
    }
    var cfg = window.__mockCfg, delay = cfg.delayMs;
    var signal = init.signal;
    var wait = new Promise(function(res, rej){
      var t = setTimeout(res, delay);
      if (signal) signal.addEventListener('abort', function(){ clearTimeout(t); rej(new DOMException('aborted','AbortError')); });
    });
    return wait.then(function(){
      if (cfg.fail) return new Response(JSON.stringify({error:{message:'boom'}}),{status:cfg.fail});
      /* anthropic messages endpoint */
      if (/\/anthropic\/v1\/messages/.test(url)){
        var hasResult = (body.messages||[]).some(function(m){ return Array.isArray(m.content) && m.content.some(function(b){ return b.type === 'tool_result'; }); });
        var wantTool = !hasResult && JSON.stringify(body.messages).indexOf('USE_TOOL') >= 0;
        var f = [ ev({type:'message_start', message:{usage:{input_tokens:100, cache_read_input_tokens:50, output_tokens:0}}}) ];
        f.push(ev({type:'content_block_start', index:0, content_block:{type:'thinking', thinking:''}}));
        f.push(ev({type:'content_block_delta', index:0, delta:{type:'thinking_delta', thinking:'thinking...'}}));
        f.push(ev({type:'content_block_stop', index:0}));
        if (wantTool){
          f.push(ev({type:'content_block_start', index:1, content_block:{type:'tool_use', id:'toolu_1', name:(body.tools||[]).filter(function(t){return /tool_eval/.test(t.name);})[0].name, input:{}}}));
          f.push(ev({type:'content_block_delta', index:1, delta:{type:'input_json_delta', partial_json:JSON.stringify({code:cfg.toolCode||'6*7'})}}));
          f.push(ev({type:'content_block_stop', index:1}));
          f.push(ev({type:'message_delta', delta:{stop_reason:'tool_use'}, usage:{output_tokens:20}}));
        } else {
          f.push(ev({type:'content_block_start', index:1, content_block:{type:'text', text:''}}));
          f.push(ev({type:'content_block_delta', index:1, delta:{type:'text_delta', text:'final answer'}}));
          f.push(ev({type:'content_block_stop', index:1}));
          f.push(ev({type:'message_delta', delta:{stop_reason:'end_turn'}, usage:{output_tokens:10}}));
        }
        f.push(ev({type:'message_stop'}));
        return new Response(sse(f, 5), {status:200, headers:{'content-type':'text/event-stream'}});
      }
      /* responses endpoint */
      if (/\/responses$/.test(url)){
        var inp = body.input || [];
        var hasOut = inp.some(function(m){ return m && m.type === 'function_call_output'; });
        var wantT = !hasOut && JSON.stringify(inp).indexOf('USE_TOOL') >= 0;
        var tname = ((body.tools||[]).filter(function(t){ return /tool_eval/.test(t.name||(t.function&&t.function.name)||''); })[0]||{});
        tname = tname.name || (tname.function&&tname.function.name);
        var g = [ ev({type:'response.created', response:{}}), ev({type:'response.reasoning_text.delta', delta:'r'}) ];
        if (wantT && tname){
          g.push(ev({type:'response.output_item.added', output_index:1, item:{type:'function_call', call_id:'call_1', name:tname}}));
          g.push(ev({type:'response.function_call_arguments.delta', output_index:1, delta:'{"code":"6*7"}'}));
          g.push(ev({type:'response.output_item.done', output_index:1, item:{type:'function_call', call_id:'call_1', name:tname, arguments:'{"code":"6*7"}'}}));
        } else g.push(ev({type:'response.output_text.delta', delta:'final answer'}));
        g.push(ev({type:'response.completed', response:{usage:{input_tokens:(window.__mockCfg.respIn||1000), input_tokens_details:{cached_tokens:400}, output_tokens:100, output_tokens_details:{reasoning_tokens:10}, total_tokens:(window.__mockCfg.respIn||1000)+100}}}));
        return new Response(sse(g, 5), {status:200, headers:{'content-type':'text/event-stream'}});
      }
      /* chat/completions passthrough (coalescer path) */
      var msgs = body.messages || [];
      var hasTool = msgs.some(function(m){ return m.role === 'tool'; });
      var ctn = ((body.tools||[]).filter(function(t){ return /tool_eval/.test((t.function&&t.function.name)||t.name||''); })[0]||{});
      ctn = (ctn.function&&ctn.function.name)||ctn.name;
      if (!hasTool && ctn && JSON.stringify(msgs).indexOf('USE_TOOL') >= 0){
        var tf = [ dat({choices:[{delta:{tool_calls:[{index:0,id:'call_1',type:'function',function:{name:ctn,arguments:''}}]}}]}), dat({choices:[{delta:{tool_calls:[{index:0,function:{arguments:'{"code":"6*7"}'}}]}}]}), dat({choices:[{delta:{}, finish_reason:'tool_calls'}], usage:{prompt_tokens:500, completion_tokens:20, total_tokens:520}}), 'data: [DONE]\n\n' ];
        return new Response(sse(tf, 5), {status:200, headers:{'content-type':'text/event-stream'}});
      }
      var frames = [ dat({choices:[{delta:{reasoning_content:'r'}}]}), dat({choices:[{delta:{content:'hello '}}]}) ];
      var u = {prompt_tokens:1000, completion_tokens:100, total_tokens:1100};
      if (cfg.repeatUsage) frames.push(dat({choices:[{delta:{content:'world'}}], usage:u}));
      else frames.push(dat({choices:[{delta:{content:'world'}}]}));
      frames.push(dat({choices:[{delta:{}, finish_reason:'stop'}], usage:u}));
      frames.push('data: [DONE]\n\n');
      return new Response(sse(frames, 5), {status:200, headers:{'content-type':'text/event-stream'}});
    });
  };
})();
