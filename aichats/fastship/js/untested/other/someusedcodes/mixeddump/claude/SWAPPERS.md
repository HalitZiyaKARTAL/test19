# The scripts that made the var candidates

Written by the helper, 2026-10-15. The user's question: «are there the one making swaps to var etc,  i can also check it». Yes: every candidate file was produced by a script, and `REPRODUCE.sh` rebuilds the whole chain from the original app and checks each sha256 (run on 2026-10-15: every hash matched).

## The chain

| step | input → output (sha256) | script | what it does |
|---|---|---|---|
| const pass | orig.html (1ef7ec2f) → candidate1 (3dab682a) | `tools/const2var_apply.mjs` + the spacing clean-up in REPRODUCE.sh | finds every `const` declaration with acorn, writes `var  ` over it (same length), re-parses, reverts only the declarations that break the parse (it reverted 3), then compares every identifier's binding before and after with eslint-scope |
| | orig.html → candidate2 (7942c4ca) | `tools/const2var_check2.mjs` | the same conversion, but the three parse-breakers become `let`; also the one-at-a-time parse test, a hoisting scan and a write scan (default eslint-scope mode: it skipped names inside the eval-containing IIFE, which is why the Opus checkers re-ran it in optimistic mode) |
| | candidate2 → candidate3 (0e69c9d4) → candidate4 (689307a0) | two one-keyword edits in REPRODUCE.sh | `var t=p-r` → `let t=p-r` (the miss the three checkers found: as var the function returned a number as the usage); then `let e=[["cacheHit"` → `var e=[["cacheHit"` (that block never needed `let`) |
| let pass | candidate4 → candidate5_12 (ac6c141a) | `let2var/opus_12/tools/let2var_apply.mjs` + `lib.mjs`, keep list `keep4.json` | every `let` → `var` except the four listed positions; audits: parse all-at-once and one-at-a-time, binding comparison (optimistic mode), loop/closure scan, re-entry scan, early reads, catch names, block functions, script-top lets |
| same result | candidate4 → the same bytes | `let2var/opus_10/tools/l2v_scan.mjs` (`--keep L:C,…  --out`), `let2var/opus_11/let2var_apply.mjs` (keep positions as arguments) | copies 10 and 11 wrote their own tool and got the identical file |
| keep-8 variant | candidate4 → candidate5 (36d046aa) | `let2var/tools/let2var_apply.mjs` (copy 0f; `keep=L<line>:<name>,…`) | the same keyword swap, keeping the four pricing lets and AA's four |
| zero-let | candidate5_12 → zero_let (d08fa683) | `let2var/opus_12/tools/zero_let.mjs` | renames the four kept temporaries to l2/n2/t2/e2 by exact snippet replacement (each snippet must occur once), then var; parses and checks the names are new |
| zero-let | candidate5_12 → nolet (53a4c899) | `let2var/opus_10/tools/nolet_variant.mjs` | renames them to g/g/d/k through eslint-scope references (not text), checking each new name is unused in the whole function |

Checks you can run yourself: `tools/decl_census.mjs <file.html>…` counts declarations by kind and lists remaining lets; `tools/rename_clash.mjs <base.html> <variant.html>` lists every binding of the two pricing functions that changed between two files.

## Reading notes

- All swaps keep the byte length (`const` → `var  `, then the clean-up; `let` → `var` is already 3 letters), so every other byte and every line number stays; that is why the candidates differ from the original only in keywords (plus the two renamed lines in the zero-let files).
- The scripts locate declarations by parsing, never by regex, and only ever touch the keyword; the parse-breaker detection is the parser's own verdict.
- The pricing fuzz harness that tested the results is `let2var/opus_10/tools/price_fuzz.mjs` (sent separately).
