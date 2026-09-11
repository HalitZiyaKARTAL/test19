update stream buffer in ram that it immediately saves tool call to buffer too,  before code in tool is executed so call is saved even if response can't be gotten 


without waiting 500ms since synchronous call can clog it, so it must be completed first( erroring is fine too if local cant be reached too,  it can only delay tool for 100ms)

apply to live app

---
