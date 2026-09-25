#!/bin/bash
# usage: runS.sh "<query>" [budget_ms]
H=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
timeout 180 $H --no-sandbox --disable-gpu --virtual-time-budget=${2:-30000} --dump-dom "http://127.0.0.1:8765/hostS_claudeedit1.html?$1" 2>/dev/null | python3 -c "
import sys,re,html,json;d=sys.stdin.read();m=re.search(r'<pre id=\"__probe\">(.*?)</pre>',d,re.S)
print(json.dumps(json.loads(html.unescape(m.group(1))),indent=1) if m else 'NO OUTPUT')"
