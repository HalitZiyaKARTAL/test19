(() => {
  const old = window.DeepSeekWebSearch;
  if (old?.restore) old.restore();

  const nativeFetch = window.fetch;
  if (typeof nativeFetch !== "function")
    throw new Error("window.fetch is unavailable; reload this tab, then run the Eval once.");

  const endpoint = "https://api.deepseek.com/anthropic/v1/messages";
  const searchTool = {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 3
  };

  const textOf = content => {
    if (typeof content === "string") return content;
    if (!Array.isArray(content))
      return content == null ? "" : String(content);
    return content
      .map(part => typeof part === "string" ? part : part?.text || "")
      .filter(Boolean)
      .join("\n");
  };

  const toAnthropic = source => {
    const system = [];
    const messages = [];

    for (const item of Array.isArray(source) ? source : []) {
      const content = textOf(item?.content);
      if (!content) continue;

      if (item.role === "system" || item.role === "developer") {
        system.push(content);
        continue;
      }

      const role = item.role === "assistant" ? "assistant" : "user";
      const previous = messages.at(-1);

      if (previous?.role === role)
        previous.content += "\n\n" + content;
      else
        messages.push({ role, content });
    }

    return {
      system: system.join("\n\n"),
      messages
    };
  };

  const toUsage = raw => {
    const hit =
      Number(raw?.cache_read_input_tokens ??
             raw?.prompt_cache_hit_tokens ?? 0) || 0;
    const creation =
      Number(raw?.cache_creation_input_tokens ?? 0) || 0;
    const uncached =
      Number(raw?.input_tokens ??
             raw?.prompt_cache_miss_tokens ?? 0) || 0;
    const output =
      Number(raw?.output_tokens ??
             raw?.completion_tokens ?? 0) || 0;
    const prompt = uncached + hit + creation;

    return {
      prompt_tokens: prompt,
      completion_tokens: output,
      total_tokens: prompt + output,
      prompt_cache_hit_tokens: hit,
      prompt_cache_miss_tokens: uncached + creation,
      prompt_tokens_details: { cached_tokens: hit },
      input_tokens: prompt,
      output_tokens: output,
      cache_read_input_tokens: hit,
      cache_creation_input_tokens: creation
    };
  };

  const toAnswer = data => {
    const blocks = Array.isArray(data?.content) ? data.content : [];

    return {
      content: blocks
        .filter(x => x?.type === "text")
        .map(x => x.text || "")
        .join(""),
      reasoning: blocks
        .filter(x => x?.type === "thinking")
        .map(x => x.thinking || x.text || "")
        .join(""),
      usage: toUsage(data?.usage),
      stop: data?.stop_reason || "stop"
    };
  };

  const openAIJson = (answer, model) => ({
    id: "chatcmpl-web-" + Date.now(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: answer.content,
        reasoning_content: answer.reasoning
      },
      finish_reason: answer.stop === "max_tokens" ? "length" : "stop"
    }],
    usage: answer.usage
  });

  const openAIStream = (answer, model) => {
    const encoder = new TextEncoder();
    const base = {
      id: "chatcmpl-web-" + Date.now(),
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model
    };
    const frames = [];
    const push = value =>
      frames.push("data: " + JSON.stringify(value) + "\n\n");

    push({
      ...base,
      choices: [{
        index: 0,
        delta: { role: "assistant" },
        finish_reason: null
      }]
    });

    if (answer.reasoning) {
      push({
        ...base,
        choices: [{
          index: 0,
          delta: { reasoning_content: answer.reasoning },
          finish_reason: null
        }]
      });
    }

    if (answer.content) {
      push({
        ...base,
        choices: [{
          index: 0,
          delta: { content: answer.content },
          finish_reason: null
        }]
      });
    }

    push({
      ...base,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: answer.stop === "max_tokens" ? "length" : "stop"
      }],
      usage: answer.usage
    });

    frames.push("data: [DONE]\n\n");

    return new ReadableStream({
      start(controller) {
        for (const frame of frames)
          controller.enqueue(encoder.encode(frame));
        controller.close();
      }
    });
  };

  const patchedFetch = async function (input, init = {}) {
    const url =
      typeof input === "string" ? input : input?.url || String(input);

    const isDeepSeekChat =
      /api\.deepseek\.com\/?(?:v1\/)?chat\/completions(?:\?|$)/i.test(url);

    if (
      !isDeepSeekChat ||
      String(init.method || "GET").toUpperCase() !== "POST"
    ) {
      return nativeFetch.call(this, input, init);
    }

    let original;
    try {
      original = JSON.parse(init.body || "{}");
    } catch {
      return nativeFetch.call(this, input, init);
    }

    const headers = new Headers(
      init.headers || (input instanceof Request ? input.headers : undefined)
    );
    const authorization = headers.get("authorization") || "";
    const key = authorization.replace(/^Bearer\s+/i, "");

    if (!key)
      throw new Error("DeepSeek API key was not present in the app request.");

    const converted = toAnthropic(original.messages);
    const upstream = {
      model: original.model,
      max_tokens:
        original.max_tokens ??
        original.max_completion_tokens ??
        384000,
      messages: converted.messages,
      tools: [searchTool],
      stream: false
    };

    if (converted.system)
      upstream.system = converted.system;

    for (const name of [
      "temperature",
      "top_p",
      "thinking",
      "reasoning_effort"
    ]) {
      if (original[name] != null)
        upstream[name] = original[name];
    }

    const response = await nativeFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + key,
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(upstream),
      signal: init.signal
    });

    const rawText = await response.text();

    if (!response.ok) {
      return new Response(rawText, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "content-type":
            response.headers.get("content-type") || "application/json"
        }
      });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(
        "DeepSeek Anthropic endpoint returned invalid JSON: " +
        rawText.slice(0, 500)
      );
    }

    const answer = toAnswer(data);

    if (original.stream) {
      return new Response(openAIStream(answer, original.model), {
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache"
        }
      });
    }

    return new Response(
      JSON.stringify(openAIJson(answer, original.model)),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8"
        }
      }
    );
  };

  window.fetch = patchedFetch;

  window.DeepSeekWebSearch = {
    version: 8,
    endpoint,
    restore() {
      if (window.fetch === patchedFetch)
        window.fetch = nativeFetch;
      delete window.DeepSeekWebSearch;
    }
  };

  console.log(
    "DeepSeek native web search bridge v8 installed. " +
    "Use the ordinary chat composer. Restore with " +
    "DeepSeekWebSearch.restore()."
  );

  return window.DeepSeekWebSearch;
})()
