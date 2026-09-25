# ai_chat.html map (host contracts the patches rely on)

Scope: whole app is one `(async () => {...})()`; eval console = direct `eval` inside it, so patches see/assign all closure names.

## Data
- chatTree {rootId:'root', nodes{id: {id, role(user|assistant|system|system-msg), parentId, depth, msgNum, children[], activeChild, versions[], activeVersion, isGenerating, lastUpdateTime, e, p}}}
- version {rawContent, thinking, isDead, startTime, endTime, e, p, unread, errorIcon, errorText, tokens, promptTokens, reasoningTokens, metadata{provider, model, usage, cost{calculated{out,hit,miss,unk,total: strings}, split, exact{total}}}, swarm, agent, x, temperature, maxTokens, request}
- activeViewList [CHAT_ID, {id,v}...]; gens{ 'id|v': {key,node,parent,tree,v,done} }; activeControllers Set
- providers = JSON(dse_providers) with `??=` fill from default_providers (SAME object refs when not persisted). registries.provider.items === providers.
- settings from dse_metadata.settings; models per provider in dse_metadata.models (written only by saveSettings(1)).

## Flow
sendMessage -> createNode(user) -> generateAIResponse(leaf,node,agent,x,messages,v,skip)
  -> r = run(agent,x) (merged config: settings+family+profile+base+p+d+a+x; request/usageMap/pricing merges; pricing = {...modelPricing, ...p.pricing, ...d.pricing,...})
  -> createNode(assistant,isGenerating) / push version
  -> buildAPIMessages(path,r,messages) (rawContent only, system prompt, r.prompt appended)
  -> triggerAI(messages,node,v,r): gens[key], controller, returns executeAPI(...).then(()=>1).catch(err => isDead + finalizeGeneration; 0)
  -> executeAPI(messages,node,vIndex,controller,r): payload{...r.request, model, messages, temperature, stream, [maxTokensParam], stream_options}; fetch(baseURL+apiPath); !ok -> throw.
     stream: SSE lines 'data: {choices[0].delta.content|reasoning_content}'; applyUsage(each chunk) -> applyResponseMetadata; saveStreamBuffer every 500ms;
     end: await saveStreamBuffer; endTime; finalizeGeneration(node,v,controller). On error executeAPI must THROW (caller finalizes).
  -> ok && r.next -> chained agent
finalizeGeneration(node,v,controller): isGenerating=false if no open versions; checkGen(g,1)|queueSave; soft/updateNodeDOM; controllers.delete; resetStopBtn; updateSendBtn; updateTokenDisplay.

## Rendering
renderFullChat / renderPathTopoAware / updateNodeDOM / createMessageDOM; formatMarkdown -> buildCodeBlockHTML(lang, code, collapsed) (collapsed = blockAutoCollapse && len>blockCollapseSize).
Cost: versionCost(v) parses metadata.cost; getVisibleCost; openCostInfo/closeCostInfo tables.

## Persistence
saveHistory: writeLock (1s) in metadata; lastWriter==me -> save whole tree to IDB; else merge into disk tree w/ clash detection (versionState excludes e,p,unread).
Stream buffer dse_sb in IDB keyed CHAT|TAB|node|v -> [ts, lastUpdate, rawContent, thinking]; recovery marks dead if buffer longer.
Hot mirror localStorage dse_hot_default guarded by revision.

## Settings UI
saveProvJsonBtn.onclick replaces provider object (in RAM); persisted only via Save (saveSettings(1) -> saveRegistry).
loadModels(): fetchModels (GET /models) or modelIds(p); selects metadata.models[id] || defaultModel.
