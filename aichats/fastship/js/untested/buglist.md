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






---






---
----
---



---




Worked for 17m 31s

95 reviewed. The main risks are saved edits being overwritten and schedule prices disagreeing with the live pricing object. These occur on fresh pages too.

95 is b03ceec, published September 5, 2026, at 12:22 UTC.

What changed

Release	Change versus predecessor

90 · 2c53ec3	Fixes nested provider comparison, aligns Pro defaults with the engine’s Pro rates, refreshes models/pricing after migration.
91 · ab4ab89	Adds automatic edited-source tagging, finalization deduplication, and a 10-second stale-stream fallback.
92 · b549441	Makes the recorded price multiplier usage-weighted; adds the busy-send ring; rewrites source controls.
93 · a9b9345	Initially byte-identical to 92. Its subsequent update only changes CSS.
94 · faae4a0	Text-width measurement only; no generation/accounting change.
95 · b03ceec	Loads schedules from provider/model JSON; removes 94’s extra measurement code.


Real issues still in 95

1. Provider-edit protection fails. On the checked-in host, Apply JSON modifies the provider before the added listener takes its “before” snapshot. Consequently, ordinary edits remain source:"default". I reproduced an edited endpoint being reset in both memory and storage by migration. 92 additionally removed the checkbox’s change handler—turning it off visually leaves the configuration enabled. Edit hook and controls


2. 95’s schedule edit can leave pricing frozen. Apply JSON replaces dynamic pricing getters with serialized numbers. The new handler updates schedules but doesn’t reinstall those getters. In an isolated reproduction, the engine returned an output rate of 3.96e-6, while the live provider pricing still returned 1.98e-6: a 2× disagreement between the two pricing paths. Schedule synchronization


3. The new schedule loader bypasses supported model formats. It uses Object.keys(fallbackModels) instead of the host’s modelEntries(). For model arrays, it registers "0" instead of the model ID. My same-input test returned peak in 94, off-peak in 95. It also skips every custom_* provider, so their JSON schedules never register. Loader


4. Pricing calculations remain duplicated and inconsistent. The new weighted calculation ignores prompt_tokens_details.cached_tokens. With entirely cached input and a miss-only 2× scalar, it records 2× instead of 1×. Meanwhile, the header still derives its state solely from output pricing, so free output can activate the “free” state despite chargeable input. Weighted calculation, header calculation



Generation/finalization hasn’t received another substantive fix after 91. Against the repository’s 32.html, the stale hunter still expects object-shaped generation records while the host stores timestamps. The agentic path also expects a missing usageValue helper and a different metadata-function signature. These are inherited host-compatibility problems, not newly introduced by 95. Host, agentic usage call

Safest next edit: fix the provider Apply hook first: capture before mutation, tag only a successfully edited provider, and persist through the existing full-registry save—not a merge with stale storage.

Regression test: change a provider’s endpoint and schedule, save, reload, and verify both survive. Then assert modelPricing() matches the engine before and after a schedule boundary.

Syntax checks and isolated source-based tests completed; stock weekday/weekend boundaries passed. No full browser or paid API test was run. Reviewed through 95.
