---
---
---
---
---


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



---
---
---
---
---



# Bug Report — 96.js "Tool block collapse" is non-functional

**Reported (UTC):** 2026-09-11T12:17:06Z  (Fri, 11 Sep 2026 12:17:06 UTC)
**Component:** `96.js` — EVAL1 **v4.10.0** (2351 lines) — `aichats/fastship/js/untested/96.js`
**Host app:** AI Chat (test11) — `https://halitziyakartal.github.io/test11/ai_chat.html`
**Companion module:** `image5.js` (image4.js v4.0.0)
**Module state:** `window.__eval1.version = "4.10.0"`, `installed = true`
**Runtime:** Firefox 150.0 · Windows NT 10.0; Win64; x64 · viewport 1600x767
**Loading:** `fetch(...).then(r => r.text()).then(eval)` over the app — **not** a contributing factor
**Severity:** Medium — feature silently does nothing for its primary target (tool-**result** blocks)

## Summary
Settings → Exp → Tools → **"Tool block collapse"** (threshold number + ON/OFF toggle) does not control collapsing of tool-result code blocks. Two independent defects:

1. **Write/read key mismatch** — the control writes `NS.config.toolEchoCollapse`, but the engine reads `NS.config.toolEchoCollapseChars`. OFF and the number have no effect on the stored threshold.
2. **Match gap** — the collapse test only matches blocks starting with `// Executing:`; tool results start with `// Result` and are never matched. The adjacent font-scale check matches *both*, demonstrating intended behavior.

## Steps to reproduce
1. Load the app; `eval` `96.js`.
2. Settings → Exp → Tools. "Tool block collapse" shows number = **2000**, toggle = **ON**.
3. Open message **#6** (contains 10 × `// Result` blocks > 2000 chars).
4. Observe `// Result` blocks in the **2000–5000** char range remain **expanded**.
5. Toggle "Tool block collapse" OFF, or change the number (e.g. 500) → rendering unchanged.

## Expected
- OFF disables tool-echo collapse.
- Threshold governs *all* tool-echo blocks (`// Executing:` **and** `// Result`).

## Actual
- Threshold stored under `toolEchoCollapse` (never read) → effective threshold is stuck at 2000, and applies only to `// Executing:` blocks.
- `// Result` blocks over the threshold are **not** collapsed by this setting.
- Long blocks (>5000) collapse only via the *unrelated* base-app setting "Auto-collapse block >" (`blockAutoCollapse` + `blockCollapseSize=5000`).

## Evidence (live DOM/JS at report time)
```json
{
  "NS.config.toolEchoCollapseChars": 2000,
  "NS.config.toolEchoCollapse": "2000 -> 0 when toggle clicked",
  "settings.blockAutoCollapse": true,
  "settings.blockCollapseSize": 5000,
  "codeBlocks_total": 77,
  "codeBlocks_byPrefix": { "exec": 35, "result": 35, "other": 7 },
  "over2000": { "exec": 1, "result": 10 }
}
```
- `NS.config.toolEchoCollapseChars` stays **2000** after toggling; `NS.config.toolEchoCollapse` flips **2000 ↔ 0**.
- The 10 `// Result` blocks > 2000 chars split at **5000**, not 2000:
  - **≥5000 → collapsed:** `24656, 14919, 6505, 5767, 5754, 5202`
  - **<5000 → expanded:** `4326, 3649, 2472, 2336, 2276`
  - sole `// Executing:` block >2000: `2874` (collapsed)
- Base-app source of the 5000 split (inline `ai_chat.html` script):
  `buildCodeBlockHTML(lang, codeContent, settings.blockAutoCollapse && codeContent.length > settings.blockCollapseSize)`
  with `blockAutoCollapse=true`, `blockCollapseSize=5000`.

## Root cause — `96.js` line refs (v4.10.0)
- **L43** DEFAULTS: `toolEchoCollapseChars:2000, …`
- **L959** collapse test (BUG):
  `else if (NS.config.toolEchoCollapseChars != null && cnt.indexOf('// Executing:') === 0 && cnt.length > NS.config.toolEchoCollapseChars) eff = true;`
- **L961** font-scale test (correct shape — matches both):
  `if ((cnt.indexOf('// Executing:') === 0 || cnt.indexOf('// Result') === 0) && NS.config.toolFontScale){`
- **L1138** row render reads `C.toolEchoCollapseChars` ✅
- **L1351** SETTERS: `toolEchoCollapse:{ num:1, def:0, min:0 },` ❌ (missing `Chars`)
- **L1361** alias list: `…'toolEchoCollapse'…` ❌ → generates `NS.setToolEchoCollapse`
- **L1167** `on('expToolEchoCollapseOn','change', e => { NS.setToolEchoCollapse(e.target.checked ? 2000 : 0); … });` ❌
- **L1168** `on('expToolEchoCollapse','change', e => { … NS.setToolEchoCollapse(parseInt(e.target.value,10) || 2000); });` ❌

Writer key = `toolEchoCollapse`; reader key = `toolEchoCollapseChars`. Even the reader path additionally excludes all `// Result` blocks.

## Fix
```js
// L1351  SETTERS
toolEchoCollapseChars: { num:1, def:2000, min:0 },

// L1361  alias list:  replace 'toolEchoCollapse'  ->  'toolEchoCollapseChars'

// L959   engine
else if (NS.config.toolEchoCollapseChars > 0
      && (cnt.indexOf('// Executing:') === 0 || cnt.indexOf('// Result') === 0)
      && cnt.length > NS.config.toolEchoCollapseChars) eff = true;

// L1167
on('expToolEchoCollapseOn', 'change', e => {
  const n = document.getElementById('expToolEchoCollapse');
  NS.set('toolEchoCollapseChars', e.target.checked ? (parseInt(n.value, 10) || 2000) : 0);
  if (n) n.disabled = !e.target.checked;
});

// L1168
on('expToolEchoCollapse', 'change', e => {
  if (document.getElementById('expToolEchoCollapseOn').checked)
    NS.set('toolEchoCollapseChars', parseInt(e.target.value, 10) || 2000);
});
```
> The `> 0` guard is required: with `0` meaning OFF, a plain `!= null && len > chars` test would collapse *every* tool-echo block when disabled.

## Regression / acceptance criteria
- OFF ⇒ no tool-echo collapse; ON ⇒ collapse blocks larger than the threshold.
- Changing the number changes the effective threshold immediately (no reload).
- Applies to **both** `// Executing:` and `// Result` blocks.
- Existing unrelated behavior (`blockAutoCollapse` / `blockCollapseSize=5000`) unchanged.






---
---
---
---
---



# Review of `96Rcandidate21a.js` (v5.6.0) vs live `96.js` (eval1 v4.10.0)

**Verdict:** A close, faithful port — **0 missing API names, same keys/flags/tools/style-ids** — and it *fixes* three real 96 bugs. But it is **not a clean drop-in**: it carries a batch of regressions, one over-aggressive security change, and an entire second layer of hazards that only appear when you hot-swap instead of reload. Below is everything, organized.

**Severity legend:** 🔴 breaks/regresses behavior · 🟠 real but narrow · 🟡 verify/intentional · ⚪ hygiene
**Scope legend:** `[fresh]` = happens on your stated flow (refresh → load 96R) · `[swap]` = only when 96 is replaced in-place

---

## 0. Method & confidence
- Static presence-diff of live `__eval1` surface vs `c21a` text; compile-check of all six stored candidates (all OK, never executed).
- Line-by-line reading of boot guard → config → pricing → fetch → tool loop → UI → `disable()`.
- Not runtime-verified: the recursive `oneTurn` tool loop, real bridge parsing, peak timing (flagged in §6).

---

## 1. ✅ Parity — confirmed identical

| Surface | Result |
|---|---|
| `__eval1` functions | **42/42 present** (superset, ~101 total) |
| `__eval1.config` keys | all present (**+ `estimate`**) |
| Flags | 6, identical (`marked, anthropic, hybrid, pill, bridgeStream, tools`) |
| Tool aliases | `tool_eval_1…7` |
| Style-sheet ids | 9/9 identical |
| Load contract | same IIFE; sets `__eval1.version` → `5.6.0` |
| Persistence | reads `dse_eval1_config`/`_flags`; dual-writes `dse_96R_*` → migration-safe |
| Host fns patched | all via one `R.host` adapter (15 — more than 96) |
| Bridges / coalescer / `toAnthropic` / translators | ported faithfully; cache-mask naming kept |
| Boot guard | **better** than 96: version-compare + abort-on-downgrade |

**And it fixes 3 genuine 96 bugs:**
1. `setToolEchoCollapse` wrote config key `toolEchoCollapse` but the renderer reads `toolEchoCollapseChars` → **96's toolbar control was a no-op**; c21a points it at the right key.
2. 96's `disable()` **leaked all 9 `<style>` tags**; c21a tracks `R.CSS` and removes them.
3. Four pricing sources + shallow-copy aliasing → one source.

---

## 2. 🔴 Definite bugs / regressions

| # | Finding | Scope | Why it matters |
|---|---|---|---|
| **B1** | **`__sealEval` fires on *every* provider-JSON save.** 96 sealed only when a **brand-new provider containing `eval`** was added. c21a: `if (R.cfg.evalInProviders && R.__sealEval) R.__sealEval();` → unconditional. | `[fresh]` | With `technicalUser` on + "Riskier" off, **editing any provider silently flips `evalInProviders` OFF.** Your live config is `evalInProviders:true, technicalUser:true`. Contradicts the documented contract. |
| **B2** | **`window.__pricingEngine` gutted on fresh load.** 96 exposed `tables.{legacy,off,peak,windows}`, `effectiveAt`, `isPeak`, `hasRealPeak`, `schedFor`, `registerSched`, `install`, `audit`; c21a sets only `epoch`, `tables.{epoch}`, `priceAt`. `dse_pricing_epochs` now stores `{epoch}`. | `[fresh]` | App cost path fine (reads `providers…pricing` getters), but **any external tooling/other patch reading `PE.*` breaks**. On `[swap]` the old rich object lingers (see §4). |
| **B3** | **Provider migration narrowed to `deepseek` only.** 96's `evolve()` re-synced **any** provider equal to its factory default (openai/gemini/zai); c21a `continue`s past all non-deepseek. | `[fresh]` | Drifted non-deepseek defaults are never re-normalized. |
| **B4** | **Tool-call normalization drops `tc.function`.** `var f = tc.function || {}; … if(!f.name) f.name=…` — never writes `f` back to `tc`. 96 did `tc.function = tc.function || {}`. | `[fresh]` | A tool-call arriving without a `function` object → "unknown tool". Edge (streamed calls populate it), but a real divergence. |
| **B5** | **`installPricing()` scope narrow.** 96's `install()` patched **`providers` *and* `default_providers`**; c21a patches **only live `providers`**. | `[fresh]` | `modelPricing(p,id)` falls back to `default_providers`, so any un-priced provider now resolves against the app's **baked legacy numbers** (3.625e-9/4.35e-7/8.7e-7), not date-aware ones. |
| **B6** | **`disable()` leaks `window.__s16b`** (stream throttle map) — created lazily, absent from the delete list. | `[fresh]` | Silent growth; residue after teardown. |
| **B7** | **`R.audit()` (buffer) semantics changed.** 96 keyed TTLs on *matched vs unmatched* (24 h/7 d); c21a keys on *own vs foreign*. | `[fresh]` | Can prune an **own unmatched** buffer at 24 h — a recoverable interrupted stream 96 would keep 7 d. |
| **B8** | **`auditPricing()` lost `.context`** (96: `{context,counts,total,rows}`; c21a: `{counts,total,rows}`), and is now **tautological** — it compares the getter to the `priceAt` that *is* the getter, so it can never report `wrong`. | `[fresh]` | Breaks tooling; audit is meaningless. |
| **B9** | **`estimateGatePipe` is dead code** — defined but never registered in `applyFetch()`; only the `sendMessage` gate runs. | `[fresh]` | Harmless today (feature off), but misleading. |
| **B10** | **Tool `run` dropped 96's hidden-tab note** — 96 appended `bg:true`/`note:'tab hidden…'`; c21a returns only `{ok,ms,result\|error}`. | `[fresh]` | Tool results are a different shape; model loses the throttle hint. |
| **B11** | **`__apiModels` pollutes provider objects.** Patched `fetchModels` writes `pv[id].__apiModels = r` into the **live** provider, which then serializes into `dse_providers`. | `[fresh]` | Provider-JSON pollution; round-trips through migration. |

---

## 3. 🟡 Behavior changes to verify (may be intentional)

- **`defaultModel` changed to `'deepseek-flash'`** in `providerDefaults.deepseek`; c21a also *adds* a `deepseek-flash` model. If `providers.deepseek.source==='default'`, **each load replaces your deepseek provider with CANON**.
- **`applyProviderDefault()` runs on every load** (96 used a one-time `__eval1_88_def` guard) → re-clobbers a `source:'default'` provider each boot.
- **UI affordances**: sub-row greying when `Agentic tools ≠ on` (96's 63.js) is **gone**; pill text drops `· <model> · 🔎n`; `#expToolEchoCollapse` no longer starts `disabled` when its toggle is off.
- **`R.set()` semantics changed** — 96 validated via a `SETTERS` table; c21a throws on unknown keys (`NS.set('paintInterval',…)` now throws). Its *slot form* (`R.set(name,fn)`) writes `R._slots` but **cannot reach the real host binding** → desyncs.
- **`resolveTools` mutates `R.cfg.webSearch`** from prior tools (parity with 96, but note it's unsaved/transient).
- **`R.providerDefaults` dropped 96's openrouter balance config** → openrouter balance support gone (minor; not in default providers).

---

## 4. 🔴 `[swap]`-only: 96's leaky teardown contaminates the swap

This is the subtle layer: **c21a trusts 96's `disable()` to be clean, and it isn't.**

1. **Pricing engine bypassed.** 96's `PE.install()` stamped **live `dyn()` getters** onto `providers.deepseek…pricing`. 96's `disable()` never undoes them → c21a's `installPricing()` hits `isGetterProp(pr,'output')` and **skips** them. Net: deepseek costs keep flowing through **96's still-alive closure**, and c21a's "provider-JSON is the only truth" design **never takes effect for deepseek**.
2. **`openCostInfo`/`closeCostInfo` residue.** 96 wrapped these *outside* the `__85_orig` system → c21a captures a **96 wrapper** as its "original" → double balance injection, and `disable()` can never restore the true original (**circular**).
3. **96's `__eval1_peakObs` MutationObserver isn't disconnected** by 96's `disable()` → keeps firing `applyPeakDisplay` into the half-dead closure, fighting c21a on the `dse-peak`/`dse-discount` body classes.
4. **Boot guard has no post-`disable()` verification.** If 96's `disable()` throws partway (or a `__eval1` exists with hooks but no `disable`), c21a proceeds and captures **already-wrapped** host fns into `R.host.orig` → wrappers stack and c21a's own `disable()` "restores" to a wrapper.

> **Your flow (refresh → load 96R) is immune to all of §4.** But "swap in place" ≠ "reload," and the readme treats them as equivalent.

---

## 5. ⚪ Hygiene / cosmetic
- `patchHost` and `patchFn` are **byte-identical** — one is dead weight.
- The **module system is decorative**: `R.pipe/use/_mods/_down` exist, and `_mods` is seeded with bare `{id,version}` stubs, so **no module runs `setup`/`teardown`** — `disable()` is still hand-rolled.
- `R.executeAPI` (property) ≠ host `executeAPI` after the balance wrap → stale.
- fontScale restore is **RAM-only**: `defaultSettings.fontScale=0.8` was set permanently and `metadata.settings.fontScale` keeps 0.8 → the 0.5→0.8 change is **sticky across disable+reload**.
- `dse_eval1_config` may still carry 96's stale `toolEchoCollapse` key (harmless; re-saved).

---

## 6. ❓ Cannot be certified statically (needs the harness)
- The **recursive `oneTurn` promise loop** (resolve/reject across `finishTurn()` early-returns + stream-reader recursion) — highest-risk rewrite.
- Real **bridge parse** (anthropic/responses SSE), peak/discount timing, balance fetch.
- Whether `disable()` fully unwinds on a *real* session.

---

## 7. Recommended fix order (for a `c21a → c21b`)
1. **B1** seal trigger — restore "new provider only."
2. **B2 / B5 / B3** — restore `__pricingEngine` surface; patch `default_providers` too; widen migration.
3. **§4.1/4.4** — make `installPricing()` **overwrite** existing getters (don't skip), and add a post-`disable()` integrity check.
4. **B7 / B8 / B10 / B11** — audit semantics, `auditPricing` shape, tool `bg` note, `__apiModels` (use a WeakMap, not the provider object).
5. **B4 / B6 / B9 + §3 & §5** — cleanup and small fixes.

**Bottom line:** on the *contract* it's ~complete; on *behavior* it's ~95%. As a fresh reload it's close to safe after B1–B5. As a hot-swap it inherits 96's teardown debt and needs §4 addressed. Want me to draft the `c21b` patch for items 1–5?
