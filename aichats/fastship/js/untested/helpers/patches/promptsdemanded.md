update stream buffer in ram that it immediately saves tool call to buffer too,  before code in tool is executed so call is saved even if response can't be gotten 


without waiting 500ms since synchronous call can clog it, so it must be completed first( erroring is fine too if local cant be reached too,  it can only delay tool for 100ms)

apply to live app

---

oh 500ms ones should save it too,  and also tool call should be displayed first and response can arrive after its done,  so user can see the call while waiting response

---


give me a function that stops executing the eval tool for arguments[0] many times after its called  and arguments[1] decides stop or not and arguments[2] decides save to clipboard or not  and arguments [3] decides save to localdata by epoch or not 

default is   stops save to clip and local 

give me that functions code and also put in ram,    then give me call format for stopping and non stopping versions, 3 calls each

---
