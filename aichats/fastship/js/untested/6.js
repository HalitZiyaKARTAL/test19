// ============ tool_eval_1 : eval tool with timeout + tool-call loop ============
(() => {
  const safeStringify = v => {
    try {
      if (v === undefined) return 'undefined';
      if (typeof v === 'bigint' || typeof v === 'symbol' || typeof v === 'function') return String(v);
      if (typeof v !== 'object' || v === null) return JSON.stringify(v);
      const seen = new WeakSet();
      return JSON.stringify(v, (k, val) => {
        if (typeof val === 'bigint' || typeof val === 'symbol' || typeof val === 'function') return String(val);
        if (val && typeof val === 'object') { if (seen.has(val)) return '[circular]'; seen.add(val); }
        return val;
      }, 2).slice(0, 20000) || 'undefined';
    } catch (e) { return String(v); }
  };

  // Hard-timeout eval via Web Worker — kills infinite loops / sync hangs
  const evalInWorker = (code, timeout) => new Promise(resolve => {
    try {
      const src = `self.onmessage=async e=>{try{const r=eval(e.data);self.postMessage({ok:true,r:await Promise.resolve(r)})}catch(err){self.postMessage({ok:false,e:String(err&&err.stack||err)})}}`;
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      const t = setTimeout(() => { w.terminate(); resolve({ ok: false, e: 'timeout' }); }, timeout);
      w.onmessage = e => { clearTimeout(t); w.terminate(); resolve(e.data); };
      w.onerror = err => { clearTimeout(t); w.terminate(); resolve({ ok: false, e: String(err.message || err) }); };
      w.postMessage(code);
    } catch (e) { resolve({ ok: false, e: String(e) }); }
  });

  const runEvalTool = async (args = {}) => {
    const code = String(args.code ?? args.expression ?? '').trim();
    const timeout = args.timeout == null ? 10000 : Math.max(1, Math.min(60000, Number(args.timeout) || 10000));
    const useWorker = args.worker !== false;              // worker:false => run in page scope
    const t0 = performance.now();
    if (!code) return safeStringify({ ok: false, error: 'no code provided' });
    const done = r => safeStringify({ ok: r.ok, ms: Math.round(performance.now() - t0), ...(r.ok ? { result: r.r } : { error: r.e }) });

    if (useWorker) return done(await evalInWorker(code, timeout));  // safe, but no page access

    // In-page eval — can use app globals (run, chatTree, fetch, ...). Async timeout only.
    return await new Promise(resolve => {
      let settled = false;
      const t = setTimeout(() => { if (!settled) { settled = true; resolve(done({ ok: false, e: 'timeout' })); } }, timeout);
      const finish = r => { if (settled) return; settled = true; clearTimeout(t); resolve(done(r)); };
      try { Promise.resolve(eval(code)).then(r => finish({ ok: true, r }), e => finish({ ok: false, e: String(e?.stack || e) })); }
      catch (e) { finish({ ok: false, e: String(e?.stack || e) }); }
    });
  };

  const toolEval1Schema = {
    type: 'function',
    function: {
      name: 'tool_eval_1',
      description: 'Run arbitrary JavaScript (eval) in the browser and return the JSON result. Use for calculations, fetching data, text manipulation, DOM inspection. Default timeout 10000ms; pass "timeout" in ms to override (max 60000).',
      parameters: {
        type: 'object',
        properties: {
          code:     { type: 'string', description: 'JavaScript code to evaluate. Its return value (or resolved Promise value) is sent back as JSON.' },
          timeout:  { type: 'number', description: 'Optional timeout in milliseconds (default 10000).' },
          worker:   { type: 'boolean', description: 'Optional, default true. true = isolated worker (hard-kill on timeout, no page access). false = page scope (app globals available, but sync infinite loops can only be escaped if async).' }
        },
        required: ['code']
      }
    }
  };

  // ---- Full tool-call loop against the active provider/model ----
  window.chatWithEvalTool = async (userText = 'Use tool_eval_1 to compute 6*7 and report.', opts = {}) => {
    const r = run(), p = r.p, key = getApiKey(p.id);
    if (!key || !p?.baseURL) throw new Error('No API key / provider');
    const messages = [
      { role: r.systemRole || 'system', content: opts.system || 'You are a helpful assistant. Use tool_eval_1 whenever a calculation, code execution, or live data fetch would help. Call it with valid JSON arguments. When you receive the tool result, answer the user concisely using it.' }
    ];
    if (userText) messages.push({ role: 'user', content: userText });

    for (let turn = 0; turn < (opts.maxTurns || 10); turn++) {
      const res = await fetch(p.baseURL + p.apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: (p.authHeader ? p.authHeader + ' ' : '') + key },
        body: JSON.stringify({ ...r.request, model: r.m, messages, tools: [toolEval1Schema], tool_choice: 'auto', stream: false })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 500));
      const data = await res.json();
      const msg = data?.choices?.[0]?.message;
      if (!msg) throw new Error('No message: ' + JSON.stringify(data).slice(0, 500));

      if (!msg.tool_calls?.length) return msg.content || '';   // final answer

      messages.push(msg);  // assistant message with tool_calls
      for (const tc of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); }
        catch (e) { args = { code: tc.function?.arguments, parseError: String(e) }; }
        const content = tc.function?.name === 'tool_eval_1'
          ? await runEvalTool(args)
          : JSON.stringify({ ok: false, error: 'unknown tool: ' + tc.function?.name });
        messages.push({ role: 'tool', tool_call_id: tc.id, content });   // ← send result back to model
      }
    }
    return '[max turns reached]';
  };

  window.toolEval1 = { schema: toolEval1Schema, run: runEvalTool };
  console.log('tool_eval_1 ready → try: chatWithEvalTool()');
  return 'loaded';
})();
