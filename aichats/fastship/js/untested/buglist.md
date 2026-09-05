Perfect — here's a ready-to-paste bug entry for your notes:

---

## 🐛 BUG: auto-source watcher never fires → migrator clobbers edited 'default' providers

**Severity:** Medium (silent data loss on boot, only when you hand-edit a `source:'default'` provider)
**Where:** eval1 module 91 (`autoSourceOn`, token `'edited'`) + pricing migrator `runMigration` (deepseek branch)
**Version:** 96.js (v4.10.0)

**Symptom**
- Editing provider JSON via Apply-JSON does NOT flip `source` to `'edited'` (stays `'default'`)
- Therefore `runMigration` (runs on boot) sees `source==='default'` → replaces the **entire** deepseek object from `CANON` → any hand-made edit (rate tweak, added promo schedule) is wiped on next reload

**Root cause**
- Module 91 snapshots providers **at Apply-JSON click time** — but the app's own `saveProvJsonBtn.onclick` runs first and already applies the edit
- So watcher compares **post-edit vs post-edit** → diff empty → never flips
- Live-verified: marker edit → `sourceFinal: "default"`

**Fix options (pick C, ideally + B)**
- **C (robust):** make `runMigration` fill-if-missing only — never replace existing fields (kills the whole class)
- **B:** fix watcher timing — capture snapshot **before** app handler runs (capture-phase listener on the panel, or snapshot when ✏️/➕ opens editor)
- **A (manual workaround now):** set `"source": "edited"` in deepseek JSON before personalizing

**Related notes**
- Same class of "silent replace" also in `registerSched(model, list)` when overriding an `'inherit'`/default model (add a warn)
- Registration/rates keyed by model-id only (fine while ids unique)

---

Thanks for the ride — this was a fun deep-dive from ox-alpha archaeology → CORS forensics → universal pricing engines → JSON-driven migration 🐂🔧. Everything important is shipped in 96.js and the repo, so you're free to burn this chat. Ping me anytime for the 97.js patch (option C) or whatever's next. 👋
