#!/usr/bin/env python3
"""sp.py — the session's tools in one file (2026-10-05; was extract_ctx2.py, backup_appendonly.py, autocopy.py, agent_rewind.py,
heater.py + heatall.py, cache_audit.py, spend_window.py). `sp.py help` or `sp.py <command> -h`.

  extract                    rebuild prompts_all_session_v2.txt (every user prompt, verbatim), compactions_all_v2.md and the
                             latest compaction_starters/compaction<N>_summary.md from the main transcript
  backup                     append-only backup of the main transcript, the agent histories, the scratchpad and the hook settings
                             into $BACKUP_DIR (default ~/ccr_backup): contents once by sha256 under objects/, a manifest per run
  autocopy pre|post          the PreCompact / PostCompact hooks: a full copy of the main session before a compaction, a starter
                             copy (summary + attachments) after it, next free acc… id, logged to compaction_starters/autocopy.log
  list|rewind|branch|heat|clonemain|restore|observe   edit a subagent's saved history (the former agent_rewind.py; see README_agent_rewind.md):
      list AGENT [--from N] · rewind AGENT --to UUID|INDEX [--revert-edits] [--dry-run] [--force] · branch AGENT --to X --new ID
      · heat AGENT --new ID · clonemain --new ID [--before TEXT | --fresh] [--desc D] · restore AGENT [--backup P] · observe AGENT [--secs N] [--watch DIR]
  heatall status|wait|due <horizon_s>   the cache heater (config tools/heatall.json; copies are branches that keep an idle agent's cache warm)
  cache AGENT|path.jsonl ...  per model call: gap, cache read/write, cold misses; totals in tokens and dollars
  spend START END             API-price estimate of everything this account ran in a UTC window (main, agents, nested runs)
Secrets are never read or printed by any command. AGENT = an agent id (a705268e22d954f9b) or the path of its .jsonl.

Settings (each: environment variable > the "sp" slice of secrets.json > auto):
  session     CC_SESSION   auto: $CLAUDE_CODE_SESSION_ID (set by Claude Code), else the newest transcript in the project folder
  project     CC_PROJECT   auto: ~/.claude/projects/<current folder with every non-alphanumeric character as ->
  scratchpad  CC_SCRATCH   auto: /tmp/claude-*/<project name>/<session>/scratchpad if it exists, else ~/.sp_scratch/<session>
  backup_dir  BACKUP_DIR   auto: ~/ccr_backup
  secrets.json is found at $SECRETS_JSON, else next to this file; it is optional."""
import argparse, difflib, glob, hashlib, json, os, shutil, stat, subprocess, sys, time
from datetime import datetime

def _slice():   # the "sp" section of secrets.json (optional)
    f = os.environ.get('SECRETS_JSON') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'secrets.json')
    try: return json.load(open(f)).get('sp') or {}
    except Exception: return {}
_S = _slice()
_set = lambda env, key: os.environ.get(env) or (_S.get(key) if _S.get(key) not in (None, '', 'auto') else None)
_dash = lambda p: ''.join(c if c.isalnum() else '-' for c in p)
PROJECT = _set('CC_PROJECT', 'project') or os.path.join(os.path.expanduser('~/.claude/projects'), _dash(os.getcwd()))
def _session():
    s = _set('CC_SESSION', 'session') or os.environ.get('CLAUDE_CODE_SESSION_ID')
    if s: return s
    t = sorted(glob.glob(os.path.join(PROJECT, '*.jsonl')), key=os.path.getmtime)
    return os.path.basename(t[-1])[:-6] if t else 'sessionplaceholder'
SESSION = _session()
def _scratch():
    s = _set('CC_SCRATCH', 'scratchpad')
    if s: return s
    c = glob.glob(f'/tmp/claude-*/{os.path.basename(PROJECT)}/{SESSION}/scratchpad')
    return c[0] if c else os.path.expanduser(f'~/.sp_scratch/{SESSION}')
SP = _scratch()
MAIN = f'{PROJECT}/{SESSION}.jsonl'
D = f'{PROJECT}/{SESSION}/subagents'
WORK = os.environ.get('REWIND_WORK', f'{SP}/tools/rewind_runs')
PRICE = {'opus-4-8': (5, .5, 25), 'opus': (4, .2, 20), 'sonnet': (2, .2, 10), 'haiku': (1, .1, 5), 'fable': (10, .25, 50)}   # $/M: input, cache read, output
fam = lambda m: next((k for k in PRICE if k in (m or '')), 'opus')
path = lambda a: a if a.endswith('.jsonl') else f'{D}/agent-{a}.jsonl'
utc = lambda f='%Y%m%dT%H%M%SZ': time.strftime(f, time.gmtime())

# ---------------------------------- extract ----------------------------------
def extract(a):
    summ, prompts = [], []
    def text_of(c):
        if isinstance(c, str): return c, False
        t, tr = [], False
        for b in c:
            if isinstance(b, dict):
                if b.get('type') == 'text': t.append(b.get('text', ''))
                elif b.get('type') == 'tool_result': tr = True
        return '\n'.join(t), tr
    for i, l in enumerate(open(MAIN)):
        try: o = json.loads(l)
        except Exception: continue
        at = o.get('attachment')
        if o.get('type') == 'attachment' and isinstance(at, dict) and at.get('type') == 'queued_command' and at.get('commandMode') == 'prompt' and (at.get('origin') or {}).get('kind') == 'human':
            p = at.get('prompt'); prompts.append((i, at.get('timestamp') or o.get('timestamp'), '[MID-TURN] ' + (p if isinstance(p, str) else json.dumps(p)))); continue
        if o.get('type') != 'user': continue
        t, tr = text_of(o.get('message', {}).get('content'))
        if o.get('isCompactSummary') or t.startswith('This session is being continued from a previous conversation'): summ.append((i, o.get('timestamp'), t)); continue
        if o.get('isMeta') or tr or not t.strip(): continue
        if t.startswith('<command-') or t.startswith('<local-command'): prompts.append((i, o.get('timestamp'), '[CMD] ' + t[:2000])); continue
        if 'Stop hook' in t[:200] or '<task-notification>' in t[:50]: prompts.append((i, o.get('timestamp'), '[SKIPPED-NAG/CMD] ' + t[:200])); continue
        prompts.append((i, o.get('timestamp'), t))
    with open(SP + '/compactions_all_v2.md', 'w') as f:
        for n, (i, ts, t) in enumerate(summ, 1): f.write(f'\n\n# ===== COMPACTION SUMMARY {n} (jsonl line {i}, {ts}) =====\n\n{t}\n')
    longs = []   # a long paste re-sent later: keep the user's own text before it, replace the repeat with a marked helper note
    for n, (i, ts, t) in enumerate(prompts, 1):
        if len(t) < 5000 or t.startswith('[SKIPPED-NAG/CMD] '): continue
        for m, u in longs:
            if difflib.SequenceMatcher(None, t[:8000], u[:8000], autojunk=False).ratio() > 0.9:
                b = max(difflib.SequenceMatcher(None, u, t, autojunk=False).get_matching_blocks(), key=lambda x: x.size)
                prompts[n - 1] = (i, ts, t[:b.b].rstrip() + f'\n\n«««HELPER NOTE, NOT USER TEXT: the rest of this message ({len(t) - b.b} chars) re-sends the paste of PROMPT {m} (>90% the same); full text at transcript line {i}»»»'); break
        else: longs.append((n, t))
    with open(SP + '/prompts_all_session_v2.txt', 'w') as f:
        for n, (i, ts, t) in enumerate(prompts, 1):
            if t.startswith('[SKIPPED-NAG/CMD] '): continue   # not written; numbering kept so #N citations stay valid
            f.write(f'\n----- PROMPT {n} (line {i}, {ts}) -----\n{t}\n')
    if summ: open(SP + f'/compaction_starters/compaction{len(summ)}_summary.md', 'w').write(summ[-1][2])
    print(len(summ), len(prompts))
    for n, (i, ts, t) in enumerate(summ, 1): print(n, i, ts, len(t))

# ---------------------------------- backup ----------------------------------
def backup(a):
    BACKUP = _set('BACKUP_DIR', 'backup_dir') or os.path.expanduser('~/ccr_backup'); SKIP = {'node_modules', '.git', 'shell-snapshots', '__pycache__'}
    def files():
        for root in [MAIN, D, SP, os.path.expanduser('~/.claude/settings.json')]:
            if os.path.isfile(root): yield root; continue
            for d, ds, fs in os.walk(root):
                ds[:] = [x for x in ds if x not in SKIP and not d.startswith(BACKUP)]
                for f in fs: yield os.path.join(d, f)
    def store(p):
        h = hashlib.sha256()
        with open(p, 'rb') as f:
            for b in iter(lambda: f.read(1 << 20), b''): h.update(b)
        s = h.hexdigest(); o = os.path.join(BACKUP, 'objects', s[:2], s)
        if os.path.exists(o): return s, False
        os.makedirs(os.path.dirname(o), exist_ok=True); tmp = o + '.tmp'
        with open(p, 'rb') as x, open(tmp, 'wb') as y:
            for c in iter(lambda: x.read(1 << 20), b''): y.write(c)
        os.chmod(tmp, stat.S_IRUSR | stat.S_IRGRP); os.replace(tmp, o); return s, True
    os.makedirs(os.path.join(BACKUP, 'manifests'), exist_ok=True)
    t = utc(); rows = []; new = newb = 0
    for p in files():
        try: s, added = store(p)
        except OSError as e: print('skip', p, e, file=sys.stderr); continue
        sz = os.path.getsize(p); rows.append(f'{p}\t{sz}\t{s}')
        if added: new += 1; newb += sz
    m = os.path.join(BACKUP, 'manifests', t + '.tsv'); open(m, 'w').write('\n'.join(rows) + '\n'); os.chmod(m, stat.S_IRUSR | stat.S_IRGRP)
    print(f'{t}: {len(rows)} files, {new} new objects ({newb / 2 ** 20:.1f} MB) -> {BACKUP}')

# ---------------------------------- agent histories (rewind, branch, clone …) ----------------------------------
def load(p):
    lines = [l for l in open(p).read().split('\n') if l.strip()]
    return lines, [json.loads(l) for l in lines]
def agent_path(agent):
    if agent.endswith('.jsonl') and '/subagents/' not in agent: sys.exit('refused: only agent histories (subagents/) can be edited, never the main session transcript')
    return path(agent)
def summary(o):
    c = (o.get('message') or {}).get('content'); s = ''
    if isinstance(c, str): s = c
    elif isinstance(c, list):
        parts = []
        for x in c:
            if not isinstance(x, dict): continue
            t = x.get('type', '')
            if t == 'tool_use': inp = x.get('input', {}); parts.append(f"tool_use:{x.get('name')}:{inp.get('file_path') or inp.get('description') or ''}")
            elif t == 'tool_result': parts.append('tool_result')
            else: parts.append(f"{t}:{x.get('text') or ''}")
        s = ' ; '.join(parts)
    return s.replace('\n', ' ')[:150]
def find(objs, to):
    if to.lstrip('-').isdigit(): i = int(to); return i if i >= 0 else len(objs) + i
    m = [i for i, o in enumerate(objs) if str(o.get('uuid', '')).startswith(to)]
    if len(m) != 1: sys.exit(f'--to {to}: {len(m)} matches')
    return m[0]
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
def rundir(agent, kind):
    d = os.path.join(WORK, f"{utc()}_{kind}_{os.path.basename(agent_path(agent))[:-6]}"); os.makedirs(d, exist_ok=True); return d
def log(d, msg): print(msg); open(os.path.join(d, 'actions.txt'), 'a').write(msg + '\n')
def side_effects(objs, start):
    out = []
    for i in range(start, len(objs)):
        c = (objs[i].get('message') or {}).get('content')
        if isinstance(c, list):
            for x in c:
                if isinstance(x, dict) and x.get('type') == 'tool_use' and x.get('name') in ('Edit', 'Write', 'NotebookEdit', 'Bash'): out.append((i, x['name'], x.get('input', {})))
    return out
def dump(o): return json.dumps(o, ensure_ascii=False, separators=(',', ':'))
def copy_meta(p, q, note):
    m = p[:-6] + '.meta.json'
    if os.path.exists(m):
        meta = json.load(open(m)); meta['description'] = (meta.get('description', '') + note)[:200]; json.dump(meta, open(q[:-6] + '.meta.json', 'w'))

def cmd_list(a):
    _, objs = load(agent_path(a.agent))
    for i, o in enumerate(objs):
        if i >= a.from_: print(f"{i:4} {o.get('type', '?'):10} uuid={str(o.get('uuid'))[:8]} parent={str(o.get('parentUuid'))[:8]} {o.get('timestamp', '')[11:19]} {summary(o)}")
def cmd_rewind(a):
    p = agent_path(a.agent); lines, objs = load(p); k = find(objs, a.to)
    if time.time() - os.path.getmtime(p) < 5 and not a.force: sys.exit('agent file changed <5 s ago: stop the agent first (or --force)')
    fx = side_effects(objs, k + 1)
    print(f'keep 0..{k} ({objs[k].get("type")} {str(objs[k].get("uuid"))[:8]}: {summary(objs[k])[:80]}), drop {len(objs) - k - 1}')
    for i, n, inp in fx: print(f'  after cut: {i} {n} {inp.get("file_path") or inp.get("command", "")[:100]}')
    if a.dry_run: return
    d = rundir(a.agent, 'rewind'); shutil.copy2(p, d); meta = p[:-6] + '.meta.json'
    if os.path.exists(meta): shutil.copy2(meta, d)
    log(d, f'backup {p} sha={sha(p)} lines={len(lines)}')
    if a.revert_edits:
        for i, n, inp in reversed(fx):
            f = inp.get('file_path')
            if n == 'Edit':
                s = open(f).read(); cnt = s.count(inp['new_string'])
                if cnt == 1 or (inp.get('replace_all') and cnt):
                    shutil.copy2(f, os.path.join(d, os.path.basename(f) + f'.before_revert_{i}'))
                    s = s.replace(inp['new_string'], inp['old_string']) if inp.get('replace_all') else s.replace(inp['new_string'], inp['old_string'], 1)
                    open(f, 'w').write(s); log(d, f'reverted Edit at {i} in {f}')
                else: log(d, f'NOT reverted Edit at {i} in {f}: new_string found {cnt}x')
            elif n == 'Write': log(d, f'NOT reverted Write at {i} to {f}: previous content unknown, check by hand')
            elif n == 'Bash': log(d, f'Bash at {i} not reverted (check its effects by hand): {inp.get("command", "")[:200]}')
    tmp = p + '.rewind.tmp'; open(tmp, 'w').write('\n'.join(lines[:k + 1]) + '\n'); os.chmod(tmp, os.stat(p).st_mode & 0o777); os.replace(tmp, p)
    log(d, f'cut to 0..{k}; new sha={sha(p)} lines={k + 1}; resume it with SendMessage to {objs[0].get("agentId")}')
def branch(agent, to, new, dry_run=False, quiet=False):
    p = agent_path(agent); lines, objs = load(p); k = find(objs, to); q = path(new)
    if os.path.exists(q): sys.exit(f'{q} exists')
    out = [dump(dict(o, agentId=new)) for o in objs[:k + 1]]
    if not quiet: print(f'branch {new} = {os.path.basename(p)} 0..{k}')
    if dry_run: return
    d = rundir(agent, 'branch'); open(q, 'w').write('\n'.join(out) + '\n'); os.chmod(q, 0o600)
    copy_meta(p, q, f' [branch of {objs[0].get("agentId")} @{k}]')
    (print if quiet else lambda m: log(d, m))(f'branch {q} from {p} 0..{k} sha={sha(q)}; resume it with SendMessage to {new}')
def cmd_branch(a): branch(a.agent, a.to, a.new, a.dry_run)
def cmd_heat(a):
    """an agent waiting on a long tool: copy it WITH its pending tool call, add a stand-in tool result that tells the copy to wait
    in <=230 s steps (each step = one cache read that keeps the original's cached history warm), stopping when the real result arrives."""
    import uuid as U
    p = agent_path(a.agent); lines, objs = load(p); orig = objs[0].get('agentId'); last = objs[-1]; c = (last.get('message') or {}).get('content') or []
    tu = [x for x in c if isinstance(x, dict) and x.get('type') == 'tool_use']
    if last.get('type') != 'assistant' or not tu: sys.exit('the agent is not waiting on a tool call right now')
    script = f'/tmp/heat_{orig}.py'
    open(script, 'w').write("import time\n" f"P={p!r}; n0={len(lines)}\n" "for _ in range(50):\n" "    L=[l for l in open(P).read().split('\\n') if l.strip()]\n"
        "    if any('\"tool_result\"' in l for l in L[n0:]): print('finished'); break\n" "    time.sleep(5)\n" "else: print('still running')\n")
    note = (f"The command is still running in the background. Wait for it by running `python3 {script}` with the Bash tool (timeout 300000), and run it again each time it prints 'still running'. When it prints 'finished', reply only 'finished'.")
    q = path(a.new)
    if os.path.exists(q): sys.exit(f'{q} exists')
    out = [dump(dict(o, agentId=a.new)) for o in objs]
    stand = dict(objs[0]); stand.pop('promptId', None)
    stand.update(type='user', uuid=str(U.uuid4()), parentUuid=last['uuid'], timestamp=last['timestamp'], agentId=a.new, message={'role': 'user', 'content': [{'type': 'tool_result', 'tool_use_id': t['id'], 'content': note} for t in tu]})
    out.append(dump(stand)); d = rundir(a.agent, 'heat'); open(q, 'w').write('\n'.join(out) + '\n'); os.chmod(q, 0o600)
    copy_meta(p, q, f' [heater for {orig}]')
    log(d, f'heater {a.new} for {orig}: {len(out)} entries, script {script}; start it with SendMessage to {a.new}: "continue"')
def clonemain(new, desc, before=None, fresh=False):
    """copy the MAIN session (read only) into a new agent: everything since its last compaction boundary, up to the newest entry
    (or to the entry before a user message containing `before`); --fresh = only the summary + attachments, before the first reply."""
    L = [l for l in open(MAIN).read().split('\n') if l.strip()]
    start = max(i for i, l in enumerate(L) if '"compact_boundary"' in l[:600]); end = len(L)
    if fresh: end = next((i for i in range(start + 1, len(L)) if json.loads(L[i]).get('type') == 'assistant'), len(L))
    elif before:
        for i in range(len(L) - 1, start, -1):
            o = json.loads(L[i])
            if o.get('type') == 'user' and before in json.dumps(o.get('message', ''))[:5000]: end = i; break
    q = path(new)
    if os.path.exists(q): sys.exit(f'{q} exists')
    out = []
    for l in L[start:end]:
        o = json.loads(l)
        if 'uuid' not in o: continue
        o.update(agentId=new, isSidechain=True)
        if not out: o['parentUuid'] = None
        out.append(dump(o))
    open(q, 'w').write('\n'.join(out) + '\n'); os.chmod(q, 0o600)
    metas = [m for m in glob.glob(os.path.join(D, '*.meta.json')) if '"opus"' in open(m).read()]
    if not metas: sys.exit('no Opus agent meta to copy; spawn a tiny Opus agent first')
    meta = json.load(open(max(metas, key=os.path.getmtime))); meta['description'] = desc; json.dump(meta, open(q[:-6] + '.meta.json', 'w'))
    d = rundir(new, 'clonemain'); log(d, f'clone of main lines {start}..{end - 1} -> {q}: {len(out)} entries; first SendMessage costs a full cache write (~$4 at 800k), later ones within 5 min are reads')
def cmd_clonemain(a): clonemain(a.new, a.desc, a.before, a.fresh)
def cmd_restore(a):
    p = agent_path(a.agent); b = a.backup
    if not b:
        c = sorted(glob.glob(os.path.join(WORK, f'*_rewind_{os.path.basename(p)[:-6]}', os.path.basename(p))))
        if not c: sys.exit('no backup found')
        b = c[-1]
    shutil.copy2(b, p); print(f'restored {p} from {b} sha={sha(p)}')
def cmd_observe(a):
    p = agent_path(a.agent); d = rundir(a.agent, 'observe'); L = os.path.join(d, 'observe.log'); seen = len(load(p)[1]); dirsig = None; end = time.time() + a.secs
    print(f'observing {p} -> {L}')
    while time.time() < end and not os.path.exists(os.path.join(d, 'stop')):
        _, objs = load(p)
        with open(L, 'a') as f:
            for i in range(seen, len(objs)):
                o = objs[i]; f.write(f"{utc('%H:%M:%S')} {i} {o.get('type')} uuid={str(o.get('uuid'))[:8]} parent={str(o.get('parentUuid'))[:8]} {summary(o)}\n")
            seen = len(objs)
            if a.watch:
                sig = subprocess.run(['ls', '-la', '--time-style=+%T', a.watch], capture_output=True, text=True).stdout
                if sig != dirsig: f.write(f"{utc('%H:%M:%S')} {a.watch} changed:\n{sig}"); dirsig = sig
        time.sleep(2)

# ---------------------------------- autocopy (the compaction hooks) ----------------------------------
def autocopy(a):
    kind = a.kind
    nsumm = lambda: sum('"isCompactSummary":true' in l for l in open(MAIN, errors='ignore'))
    mark = SP + '/compaction_starters/presumm.txt'   # the summary count seen by the PRE hook; POST waits until it has grown
    if kind == 'pre': open(mark, 'w').write(str(nsumm()))
    if kind == 'post':   # PostCompact may fire before OR after the new summary is written: detach, wait until the count is above PRE's, then copy
        if os.fork(): sys.exit(0)
        os.setsid(); t0 = time.time()
        try: base = int(open(mark).read())
        except Exception: base = nsumm() - 1
        while nsumm() <= base and time.time() - t0 < 600: time.sleep(3)
        time.sleep(5)
    ids = [int(os.path.basename(f)[9:-6], 16) for f in glob.glob(D + '/agent-acc*.jsonl') if len(os.path.basename(f)) == 29]
    new = 'acc%014x' % (max(ids, default=0) + 1); when = utc('%Y-%m-%dT%H:%MZ')
    desc = ('pre-compaction copy (auto, PreCompact hook) ' if kind == 'pre' else 'just-compacted starter copy (auto, PostCompact hook) ') + when
    r = subprocess.run([sys.executable, os.path.abspath(__file__), 'clonemain', '--new', new, '--desc', desc] + (['--fresh'] if kind == 'post' else []), capture_output=True, text=True)
    line = f'{when} {kind} {new} rc={r.returncode} {(r.stdout or r.stderr).strip().splitlines()[-1][:200] if (r.stdout or r.stderr).strip() else ""}'
    open(SP + '/compaction_starters/autocopy.log', 'a').write(line + '\n')
    open(SP + '/CONTEXT_DIGEST.md', 'a').write(f'- AUTOCOPY {kind} {when}: {new} (rc={r.returncode}; log compaction_starters/autocopy.log)\n')

# ---------------------------------- heater (every idle agent, cache-TTL aware) ----------------------------------
CFG, ST = SP + '/tools/heatall.json', SP + '/tools/heatall_state.json'
HEAT_DEFAULT = dict(on=True, whitelist=[], blacklist=[], auto=True, auto_window_h=6, floor_pct=60, margin_s=300)
COPY_PREFIX = ('a0ea7', 'a1b0', 'acc0', 'afab1e')   # heater copies, old heat copies, main clones: never heated themselves
def info(a):
    """an agent's model, context size, cache TTL, the price of one cold revive and of one heater read"""
    model, ctx, ttl = 'opus', 0, '5m'
    for l in open(path(a), errors='ignore'):
        if '"usage"' not in l: continue
        m = json.loads(l).get('message') or {}; u = m.get('usage')
        if not u: continue
        model = fam(m.get('model')); ctx = u.get('input_tokens', 0) + u.get('cache_read_input_tokens', 0) + u.get('cache_creation_input_tokens', 0)
        cc = u.get('cache_creation') or {}
        if cc.get('ephemeral_1h_input_tokens'): ttl = '1h'
        elif cc.get('ephemeral_5m_input_tokens'): ttl = '5m'
    inp, read, _ = PRICE[model]; revive = ctx * inp * (2 if ttl == '1h' else 1.25) / 1e6; ping = ctx * read / 1e6
    return dict(model=model, ctx=ctx, ttl=ttl, revive=revive, ping=ping)
def jload(p, d):
    try: return {**d, **json.load(open(p))}
    except Exception: return dict(d)
def heat_agents(cfg):
    now, out = time.time(), set(cfg['whitelist'])
    if cfg['auto']:
        for f in glob.glob(D + '/agent-*.jsonl'):
            x = os.path.basename(f)[6:-6]
            if not x.startswith(COPY_PREFIX) and now - os.path.getmtime(f) < cfg['auto_window_h'] * 3600: out.add(x)
    return sorted(out - set(cfg['blacklist']))
def new_copy():
    n = 1
    while os.path.exists(path(f'a0ea7{n:012x}')): n += 1
    return f'a0ea7{n:012x}'
def heat_plan(cfg, st):
    """per agent: (due_at, agent, info, state, floor) — due_at = when its cache needs a read"""
    rows = []
    for a in heat_agents(cfg):
        if not os.path.exists(path(a)): continue
        i, s = info(a), st.setdefault(a, dict(copy=None, copy_from=None, pings=0, last_ping=0))
        last = max(os.path.getmtime(path(a)), s['last_ping'])
        if time.time() - last > (3600 if i['ttl'] == '1h' else 300): continue   # already cold: reviving is not the heater's job
        floor = int(cfg['floor_pct'] / 100 * i['revive'] / i['ping']) if i['ping'] else 0
        rows.append((last + (3600 - cfg['margin_s'] if i['ttl'] == '1h' else 250), a, i, s, floor))
    return sorted(rows)
def heat_ping(a, i, s, floor):
    m = os.path.getmtime(path(a))
    if not s['copy'] or s['copy_from'] != m: c = new_copy(); branch(a, '-1', c, quiet=True); s.update(copy=c, copy_from=m, pings=0)   # the agent moved on: a fresh copy
    s['pings'] += 1; s['last_ping'] = time.time()
    return f"PING {s['copy']}  ({a} {i['model']} {i['ttl']} ping {s['pings']}/{floor} ≈${i['ping']:.3f})"
def heatall(a):
    cfg, st = jload(CFG, HEAT_DEFAULT), jload(ST, {})
    if a.what == 'status':
        for due, x, i, s, floor in heat_plan(cfg, st): print(f"{x} {i['model']} {i['ctx']:,} ttl {i['ttl']} due in {int(due - time.time())} s  pings {s['pings']}/{floor}  copy {s['copy']}")
        return
    if a.what == 'due':   # for the main session's own wakes: ping now every agent whose cache would expire before now + horizon
        out = []
        for due_at, x, i, s, floor in heat_plan(cfg, st):
            if s['pings'] >= floor and x not in cfg['whitelist']: out.append(f'FLOOR {x} ({s["pings"]}/{floor})'); continue
            if due_at <= time.time() + float(a.horizon or 0): out.append(heat_ping(x, i, s, floor))
        json.dump(st, open(ST, 'w'), indent=1); print('\n'.join(out) or 'NONE'); return
    while True:   # wait: sleep until something is due, print PING lines (or STOP)
        cfg, st = jload(CFG, HEAT_DEFAULT), jload(ST, {})
        if not cfg['on']: print('STOP: heatall off'); return
        rows = [r for r in heat_plan(cfg, st) if r[3]['pings'] < r[4] or r[1] in cfg['whitelist']]
        if not rows: print('STOP: nothing to heat (all at their floor or none idle)'); return
        due = rows[0][0] - time.time()
        if due > 0: time.sleep(min(due, 60)); continue   # re-plan every minute: config edits and new agents apply
        out = [heat_ping(x, i, s, floor) for due_at, x, i, s, floor in rows if due_at <= time.time()]
        json.dump(st, open(ST, 'w'), indent=1); print('\n'.join(out)); return

# ---------------------------------- cost: cache audit and spend window ----------------------------------
def cache(a):
    for x in a.agents:
        p = path(x); seen, prev, rows = set(), None, []
        for l in open(p):
            if not l.strip(): continue
            o = json.loads(l); m = o.get('message') or {}; u = m.get('usage')
            if not u or m.get('id') in seen: continue
            seen.add(m.get('id')); t = datetime.fromisoformat(o['timestamp'].replace('Z', '+00:00')).timestamp()
            gap = t - prev if prev else 0; prev = t
            rows.append((o['timestamp'][11:19], gap, u.get('cache_read_input_tokens', 0), u.get('cache_creation_input_tokens', 0), u.get('output_tokens', 0), m.get('model')))
        if not rows: print(x, 'no calls'); continue
        inp, r, o = PRICE[fam(rows[0][5])]; w = inp * 1.25
        miss = [y for y in rows[1:] if y[1] > 300 and y[3] > 5000]
        R = sum(y[2] for y in rows); W = sum(y[3] for y in rows); O = sum(y[4] for y in rows); MW = sum(y[3] for y in miss)
        print(f'{x} ({rows[0][5]}): {len(rows)} calls, read {R:,} (${R * r / 1e6:.2f}), write {W:,} (${W * w / 1e6:.2f}), out {O:,} (${O * o / 1e6:.2f}), hit {100 * R / max(1, R + W):.1f}%')
        print(f'   cold misses (gap > 5 min): {len(miss)} calls, rewrote {MW:,} tokens = ${MW * w / 1e6:.2f}; would cost ${MW * r / 1e6:.2f} as reads')
        for y in miss: print(f'     {y[0]} gap {y[1] / 60:.1f} min, wrote {y[3]:,}, read {y[2]:,}')
def spend(a):
    S, E = a.start, a.end; seen, tot, parts, models = set(), 0.0, {}, {}
    files = [(MAIN, 'main')] + [(f, 'agents') for f in glob.glob(D + '/*.jsonl')] + [(f, 'nested') for f in glob.glob(SP + '/psb_check/home/.claude/projects/**/*.jsonl', recursive=True)]
    for f, grp in files:
        for l in open(f, errors='ignore'):
            if '"usage"' not in l: continue
            o = json.loads(l); ts = o.get('timestamp', '')
            if not (S <= ts < E): continue
            m = o.get('message') or {}; u = m.get('usage'); k = m.get('id')
            if not u or k in seen: continue
            seen.add(k); i, r, out = PRICE[fam(m.get('model'))]; cc = u.get('cache_creation') or {}
            w1 = cc.get('ephemeral_1h_input_tokens', 0); w5 = cc.get('ephemeral_5m_input_tokens', 0)
            if not cc: w1, w5 = (u.get('cache_creation_input_tokens', 0), 0) if grp == 'main' else (0, u.get('cache_creation_input_tokens', 0))
            c = (u.get('input_tokens', 0) * i + u.get('cache_read_input_tokens', 0) * r + w5 * i * 1.25 + w1 * i * 2 + u.get('output_tokens', 0) * out) / 1e6
            tot += c; parts[grp] = parts.get(grp, 0) + c; fm = fam(m.get('model')); models[fm] = models.get(fm, 0) + c
    print(f'{S} → {E}: ${tot:.2f}  ' + '  '.join(f'{g} ${v:.2f}' for g, v in sorted(parts.items())) + f'  ({len(seen)} calls)  by model: ' + '  '.join(f'{g} ${v:.2f}' for g, v in sorted(models.items())))

# ---------------------------------- commands ----------------------------------
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
sub = ap.add_subparsers(dest='cmd', required=True)
sub.add_parser('help'); sub.add_parser('extract'); sub.add_parser('backup')
s = sub.add_parser('autocopy'); s.add_argument('kind', choices=['pre', 'post'])
s = sub.add_parser('list'); s.add_argument('agent'); s.add_argument('--from', dest='from_', type=int, default=0)
s = sub.add_parser('rewind'); s.add_argument('agent'); s.add_argument('--to', required=True); s.add_argument('--revert-edits', action='store_true'); s.add_argument('--dry-run', action='store_true'); s.add_argument('--force', action='store_true')
s = sub.add_parser('branch'); s.add_argument('agent'); s.add_argument('--to', required=True); s.add_argument('--new', required=True); s.add_argument('--dry-run', action='store_true')
s = sub.add_parser('heat'); s.add_argument('agent'); s.add_argument('--new', required=True)
s = sub.add_parser('clonemain'); s.add_argument('--new', required=True); s.add_argument('--before'); s.add_argument('--fresh', action='store_true'); s.add_argument('--desc', default='main session copy')
s = sub.add_parser('restore'); s.add_argument('agent'); s.add_argument('--backup')
s = sub.add_parser('observe'); s.add_argument('agent'); s.add_argument('--secs', type=int, default=3600); s.add_argument('--watch')
s = sub.add_parser('heatall'); s.add_argument('what', choices=['status', 'wait', 'due']); s.add_argument('horizon', nargs='?')
s = sub.add_parser('cache'); s.add_argument('agents', nargs='+')
s = sub.add_parser('spend'); s.add_argument('start'); s.add_argument('end')
a = ap.parse_args()
if a.cmd == 'help': print(__doc__)
else: {'extract': extract, 'backup': backup, 'autocopy': autocopy, 'list': cmd_list, 'rewind': cmd_rewind, 'branch': cmd_branch, 'heat': cmd_heat, 'clonemain': cmd_clonemain, 'restore': cmd_restore, 'observe': cmd_observe, 'heatall': heatall, 'cache': cache, 'spend': spend}[a.cmd](a)
