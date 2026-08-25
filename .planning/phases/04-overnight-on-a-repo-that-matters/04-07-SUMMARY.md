---
phase: 04-overnight-on-a-repo-that-matters
plan: 07
subsystem: block-detection
tags: [typescript, electron-main, renderer-hook, shared-module, node-test, tdd, vigil-03]

# Dependency graph
requires:
  - "04-03 — src/shared/blockHints.ts (BLOCK_HINTS + matchBlockHint), the boot.ts:1092 wiring, and DeliveryDeps.blocked"
provides:
  - "src/shared/blockHints.ts carries the PER-ENGINE register: all seven engines named, claude as the one the shapes came from, codex as the only other installed here, grok/pi/OpenCode/kimi/agy as not observed live"
  - "src/renderer/src/hooks/usePtyParser.ts imports matchBlockHint from @shared/blockHints — the local BLOCK_HINTS declaration is DELETED, so the repo holds exactly one list and one matcher"
  - "test/block-detect.test.cjs — four cases driving a REAL PtyManager through boot.ts:1092's own expression, with a three-layer proof that no renderer module is loaded"
affects: [04-13, 04-14, 04-19]

tech-stack:
  added: []
  patterns:
    - "A structural pin written as a test assertion rather than a one-time grep: the shadow-copy threat (T-04-BLK-12) is enforced by reading usePtyParser.ts as TEXT inside the test, so it survives the next commit instead of living in a SUMMARY"
    - "A require.cache isolation scan paired with the measurement that shows what it cannot see — the plan's scan is vacuous for loadTs'd modules, so it is layered with a react/zustand cache scan and a source self-scan"
    - "Behavioural deltas of a refactor MEASURED against the pre-change expression side by side, not reasoned about (D-33/D-40 applied to a move, not just to an assertion)"

key-files:
  created:
    - test/block-detect.test.cjs
  modified:
    - src/renderer/src/hooks/usePtyParser.ts
    - src/shared/blockHints.ts

key-decisions:
  - "The two tasks were committed in the REVERSE of the plan's written order, deliberately: the plan's only genuinely-red assertion is task 1's structural pin, so running task 1 first would have made task 2's mandated RED vacuous. Writing task 2's file first produced a real 1-of-4 failure; the alternative was a manufactured red."
  - "usePtyParser.ts:158 now reads `matchBlockHint(recent) !== null`, not the imported BLOCK_HINTS with the old `.some(re => re.test(recent))`. One list AND one matcher — importing only the array would have kept two evaluation semantics alive, which is the drift T-04-BLK-12 names."
  - "The hook's 400-char per-chunk window is KEPT. matchBlockHint's 4 KiB bound sits behind it as the wider ceiling. Widening the renderer's window would be a behaviour change smuggled inside a move."
  - "The matched line is NOT used in the renderer. The hook still writes its fixed `blockReason`; rule V-2's prompt-line row is main's to own (04-14). This task changed where the list lives, not what the renderer does with it."
  - "No LIVE-UNVERIFIED token was written into src/shared/blockHints.ts. The marker is a FOUR-way pin — MARKER_LEDGER per-file count, LIVE_UNVERIFIED_TOTAL, the committed file set, and the per-engine attribution — all inside test/repo-claims.test.cjs, which no wave gives this plan. The same content is written as prose instead."
  - "The plan's require.cache key scan is necessary but not sufficient, and this was MEASURED rather than assumed: loading a renderer component through test/load-ts.cjs leaves 0 keys matching /renderer/i. Two further layers were added so the file's own name is not a false claim."

requirements-completed: [VIGIL-03]

metrics:
  tasks: 2
  commits: 2
  files-created: 1
  files-modified: 2
  tests-before: 885
  tests-after: 889
  tests-failing: 0
  tests-skipped: 7

duration: ~40min
completed: 2026-08-25
---

# Phase 4 Plan 07: One List, Two Readers Summary

`BLOCK_HINTS` now exists in exactly one place and both tiers evaluate it through the same matcher — the
renderer's copy is deleted rather than shadowed — and `test/block-detect.test.cjs` proves an agent parked
on a prompt is detected in a process with no renderer module loaded at all.

## What Shipped

| Task | What | Commit |
| ---- | ---- | ------ |
| 2 (first) | `test/block-detect.test.cjs` RED — four integration cases + the three-layer no-renderer proof | `b89f60d` |
| 1 (second) | The renderer's declaration deleted and replaced by an import; the per-engine register written beside the list | `4134eac` |

## Why the Task Order Is Reversed — and Why That Was the Honest Call

The plan orders task 1 (the move) before task 2 (the test), and marks BOTH `tdd="true"`. Those two
instructions cannot both be satisfied in that order, because **plan 04-03 already shipped
`matchBlockHint` and its `boot.ts:1092` wiring in wave 1.** Every behavioural claim in task 2 —
detection, the positive control, the recovery path, the A8 bound — was therefore already true at the
base commit. Written after task 1, task 2's "RED first" would have been a file that passed on its first
run, i.e. TDD theatre.

The one thing in this plan that is genuinely red before its fix is **task 1's structural pin**: the
renderer still owned a second copy of the list. So task 2's file was written first, carrying that pin,
and it failed for real. The plan-level TDD guidance's fail-fast rule ("if a test passes unexpectedly
during RED, STOP and investigate") was applied and the investigation's answer is recorded here rather
than papered over: 3 of the 4 cases were green on arrival by construction, and that is a property of
04-03 having done its job, not of this test being weak.

## RED Output, Verbatim (task 2, at commit `b89f60d`)

`node --test test/block-detect.test.cjs` — **4 tests, 3 pass, 1 fail, 0 skipped**.

```
✖ an agent parked on a prompt is detected with no renderer module in the process (5.2362ms)
✔ ordinary build output through the same PTY is not a prompt — the positive control (1.0493ms)
✔ the prompt scrolls out of the bounded window and the determination clears itself (1.2035ms)
✔ a 500-character prompt line is stripped and capped before anything can paint it (1.0729ms)
ℹ tests 4
ℹ suites 0
ℹ pass 3
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 522.9636

✖ failing tests:

test at test\block-detect.test.cjs:86:1
✖ an agent parked on a prompt is detected with no renderer module in the process (5.2362ms)
  AssertionError [ERR_ASSERTION]: usePtyParser.ts declares its own BLOCK_HINTS again — a shadow copy
  of the list is back, and a fix landing in src/shared/blockHints.ts will not reach the renderer

  1 !== 0

      at TestContext.<anonymous> (test\block-detect.test.cjs:167:10)
    actual: 1, expected: 0, operator: 'strictEqual'
```

The failure is an `AssertionError`, not a `TypeError` and not a module-resolution error: the file loaded,
ran a real `PtyManager`, detected a real prompt, and then caught the second copy of the list.

At `4134eac` the same command is **4 tests, 4 pass, 0 fail, 0 skipped**.

## The No-Renderer Proof Is Three Layers, Because One Was Vacuous

The plan specifies *"assert that `require.cache` after the test holds no key matching `renderer`"*. That
assertion **passes even when a renderer module is loaded**, and this was measured rather than reasoned:
`test/load-ts.cjs` keeps its own module cache (`:7`, `:117`) and never touches `require.cache`.

Measured with a throwaway probe (`test/_probe-guard.cjs`, run and deleted — not committed), loading
`src/renderer/src/components/QrCode.tsx` through `loadTs`:

```
renderer-path keys : 0
react/zustand keys : 4
```

So the plan's scan alone would have shipped a green test whose own name was false. Three layers now
stand behind the claim, and the ceiling of each is written in the file:

| Layer | Catches | Measured behaviour |
| ----- | ------- | ------------------ |
| `require.cache` keys matching `/renderer/i` | anything pulled through **node's own loader** | 0 hits even with a renderer component loaded — necessary, not sufficient |
| `require.cache` keys matching `node_modules[\\/](react\|zustand)[\\/]` | any renderer module with a react/zustand runtime import, pulled through `loadTs` | **4 hits** on the same probe — this is the layer that bites |
| source self-scan for `loadTs('…renderer…')` | a react-free renderer `.ts` through `loadTs`, which BOTH cache scans miss (`src/renderer/src/store/config.ts` measured at 0 on both) | the only place that hole can be closed at all |

Each negative carries a positive lower bound (D-33/D-40): `node-pty` must be present in `require.cache`
(else the scan is looking at an empty graph), and the self-scan must find ≥ 2 `loadTs(` calls (else a
renamed loader makes it vacuous).

## Acceptance Criteria — Measured

Every number below was produced by a command run in this session.

| Criterion | Command | Result |
| --------- | ------- | ------ |
| Local declaration deleted | `grep -c 'const BLOCK_HINTS' src/renderer/src/hooks/usePtyParser.ts` | **0** (was 1) ✅ |
| Import present (positive pair) | `grep -c 'blockHints' src/renderer/src/hooks/usePtyParser.ts` | **2** (was 0, ≥ 1 required) ✅ |
| No regex literal changed | `grep -cE 'RegExp\|/.*/[gimsuy]*,' src/shared/blockHints.ts` | **6 → 6** (1 declaration line + **5 list members**, unchanged) ✅ |
| Diff to `blockHints.ts` is comments only | `git diff -U0` filtered to non-comment `+`/`-` lines | **zero lines** ✅ |
| No marker token added | `grep -c 'LIVE-UNVERIFIED' src/shared/blockHints.ts` | **0** ✅ |
| Marker ledger untouched | `node --test test/repo-claims.test.cjs` | **33/33 pass** ✅ |
| Both projects see `src/shared/` | `npm run typecheck` | **0 errors**, node + web ✅ |
| New file has no gate | `grep -c 'skip' test/block-detect.test.cjs` | **0** ✅ |
| Census + platform floor unchanged | `node --test test/suite-integrity.test.cjs` | **4/4 pass**, `FROZEN` untouched ✅ |
| The new file | `node --test test/block-detect.test.cjs` | **4 cases, 4 pass, 0 fail** ✅ |
| 04-03's guard untouched | `node --test test/delivery-main.test.cjs` | **47/47 pass** ✅ |
| Lint gate | `npm run lint` (`eslint . --max-warnings 0`) | **exit 0** ✅ |
| Full suite | `npm test` | **889 tests, 882 pass, 0 fail, 7 skipped** ✅ |
| Diff touches only `files_modified` | `git diff --stat 99b61fc HEAD` | **3 files**, 314 insertions, 26 deletions ✅ |
| `pty.ts` / `delivery.ts` / `boot.ts` empty | `git diff --stat 99b61fc HEAD -- <the three>` | **empty** ✅ |

**Test-count delta:** 885 → 889 (**+4**, the four new cases).
**Skipped:** 7 → 7, unchanged — nothing in this plan is platform-gated.
**Failures:** 0 before, 0 after. **No pre-existing assertion was flipped, xfailed, or mocked around.**

**List member count, before and after:** **5 members, unchanged** (`Do you want to proceed`,
`❯\s*\d+\.\s*Yes`, `Yes, and don't ask again`, `\(y\/n\)`, `\[y\/n\]`). The `grep -cE` figure of 6
counts the `export const BLOCK_HINTS` declaration line as well; both numbers are identical before and
after.

## The One-Line Answer the Plan Asked For

**A `LIVE-UNVERIFIED` marker was deliberately NOT added to `src/shared/blockHints.ts`**, because the
marker is a four-way pin — the per-file count in `MARKER_LEDGER`, the repo total `LIVE_UNVERIFIED_TOTAL`,
the committed file set, and the per-engine attribution — all of which live in `test/repo-claims.test.cjs`,
a file no wave assigns to plan 04-07; the same content is written as prose instead, so plan 04-19's
zero-marker sweep finds this decision rather than a gap.

## Deviations from Plan

### Deliberate Divergences From the Written Plan

**1. The tasks were committed in reverse order (task 2's file, then task 1's change).**
Reasoned above in full. Both tasks still have their own atomic commit and both `<done>` clauses are
satisfied; only the sequence moved. Recorded because it narrows a plan instruction rather than widening
one.

**2. `usePtyParser.ts:158` calls `matchBlockHint`, not the imported `BLOCK_HINTS.some(...)`.**
The plan's `<behavior>` says *"byte-identical results to before this plan for the same input"* while its
`<action>` says *"derive it from `matchBlockHint(...) !== null`"*. Those are not the same instruction. The
`<action>` was followed, because `<done>` asks for **"one list, one matcher"** and because reconciling the
two readers is this plan's stated job. **The delta was measured, not assumed** — see the section below.

### Auto-fixed Issues

**3. [Rule 2 - Missing critical functionality] The plan's no-renderer assertion was vacuous as specified**

- **Found during:** Task 2
- **Issue:** `require.cache` never sees a `.ts` loaded through `test/load-ts.cjs`, so the mandated scan
  passes with a renderer component sitting in the process. T-04-BLK-08's disposition is **mitigate**, and
  a mitigation that cannot fail is not one.
- **Fix:** Two further layers (react/zustand cache scan; source self-scan for `loadTs('…renderer')`), each
  with its own positive lower bound, and the measured ceiling of each written into the file so the next
  reader does not trust the first scan for more than it proves.
- **Files modified:** `test/block-detect.test.cjs`
- **Commit:** `b89f60d`

**4. [Rule 2 - Missing critical functionality] T-04-BLK-12 rested on a one-time grep**

- **Found during:** Task 2
- **Issue:** The threat register gives T-04-BLK-12 (the renderer keeping a shadow copy) a **mitigate**
  disposition, but its stated mitigation is an acceptance-criterion grep — which is run once, at commit
  time, and prevents nothing afterwards. The whole plan exists because a second copy drifts.
- **Fix:** The grep is now an assertion inside `test/block-detect.test.cjs`, reading `usePtyParser.ts` as
  TEXT (deliberately: reading a file is not loading a module, so it cannot violate the four no-renderer
  assertions beside it). Paired with a positive assertion that the import IS present, so deleting the
  hook's block detection entirely does not read as clean. This also kept the test count at the plan's
  mandated **four cases** — no fifth `test()` was added.
- **Files modified:** `test/block-detect.test.cjs`
- **Commit:** `b89f60d`

**5. [Rule 1 - Bug] `blockHints.ts:4` claimed a line range that this plan deletes**

- **Found during:** Task 1
- **Issue:** The header read *"MOVED VERBATIM from `src/renderer/src/hooks/usePtyParser.ts:31-37`"*. After
  this plan that declaration does not exist, so the sentence pointed a future reader at nothing and read
  as though the copy were still there.
- **Fix:** Amended to state the declaration is now deleted and the hook imports this module, plus an
  explicit `TWO READERS, ONE LIST` paragraph naming both call sites.
- **Files modified:** `src/shared/blockHints.ts`
- **Commit:** `4134eac`

### No Architectural Changes (Rule 4)

None encountered. No new tables, services, libraries or infrastructure. `package.json` /
`package-lock.json` untouched (D-36); no install step; `src/main/pty.ts`, `src/main/delivery.ts` and
`src/main/floor/boot.ts` all have empty diffs (D-35), verified by `git diff --stat`.

## The Renderer's Behavioural Delta — Measured, Not Claimed

The plan asks for byte-identical renderer behaviour. Moving from
`BLOCK_HINTS.some(re => re.test(recent))` over a raw 400-char blob to
`matchBlockHint(recent) !== null` (which strips OSC + full CSI + C0/C1, splits into lines, and matches
each trimmed line) is **not** identical in every case, and claiming it was would have been the
comfortable lie. A throwaway probe (`test/_probe-delta.cjs`, run and deleted — not committed) ran both
expressions side by side over six fixtures:

```
same    old=true  new=true   plain prompt
same    old=true  new=true   approval menu
same    old=false new=false  ordinary output
DIFFER  old=true  new=false  CROSS-LINE ❯ / 1. Yes
DIFFER  old=false new=true   cursor CSI inside the menu line
same    old=false new=false  footer only (must not match)
```

Two disagreements, in opposite directions:

- **A match lost:** `❯` on one line and `1. Yes` on the next. `/❯\s*\d+\.\s*Yes/i`'s `\s*` spans a
  newline in a blob but not in a line. **No TUI prints its approval menu across two lines**, so this is a
  pathological fixture, and main has behaved this way since 04-03 — the renderer is now agreeing with it
  rather than diverging.
- **A match GAINED:** `❯\x1b[2K 1. Yes`. The old path stripped SGR only (`usePtyParser.ts:5`), so a
  cursor/erase sequence inside the menu line defeated it. This is a **real** TUI shape, and it is the more
  important of the two: the renderer used to MISS it.

Net: the realistic case got better, the unrealistic case got stricter, and both tiers now answer
identically for any input. The footer control (`bypass permissions on (shift+tab to cycle)`) still does
not match, which is the flip-flop bug the list's comment has warned about since it was written.

## Authentication Gates

None. Nothing in this plan touches an authenticated surface.

## Known Stubs

None. Both readers have real production call sites at this commit: `src/main/floor/boot.ts:1092`
(wired by 04-03) and `src/renderer/src/hooks/usePtyParser.ts:158`.

## Threat Register — Dispositions Discharged

| Threat ID | Disposition | Where it landed |
| --------- | ----------- | --------------- |
| T-04-BLK-07 (Spoofing: an agent printing a prompt to stop receiving work) | accept | Named in `blockHints.ts`'s inherited-false-positive header; recovery is mechanical (the bounded window) and is asserted by case 3, which pushes the prompt out of `RECENT_WINDOW_BYTES` and proves the ring still HOLDS it |
| T-04-BLK-08 (Repudiation: a green mark resting on the renderer-only branch) | mitigate | `test/block-detect.test.cjs` case 1, three layers deep, each with a positive lower bound — and the measurement showing why the plan's single specified layer was not enough |
| T-04-BLK-11 (EoP: Claude-TUI-shaped list misses six engines) | accept — **written into the module** | The per-engine register: seven engines named, claude as the source, codex as the only other one installable/observable here (04-13 task 4), grok/pi/OpenCode/kimi/agy as not observed live with what would settle it, and "add a shape, never widen on a guess" as the remedy |
| T-04-BLK-12 (Repudiation: the renderer keeping a shadow copy) | mitigate | Declaration **deleted**; enforced as a live test assertion rather than a one-time grep, paired with a positive import assertion |
| T-04-SC (Tampering: installs) | mitigate | Zero packages added; `package.json` and `package-lock.json` untouched |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access pattern and no schema change. The
one trust boundary it touches — PTY bytes becoming a value a renderer paints — is unchanged from 04-03
and is now enforced on the renderer's path too, since that path finally runs the same strip-then-cap
matcher.

## Ceilings and Honest Limits

- **Still no live observation.** Every measurement here is unit/integration-level and static. That a real
  agent sitting on a real prompt is marked blocked on this machine's floor remains unverified; 04-13 task
  4 owns the one live observation available (codex).
- **`BLOCK_HINTS` remains Claude-TUI-shaped.** Six of the seven engines have zero coverage. That is now
  written beside the list instead of implied by it — but writing it down does not add coverage.
- **`usePtyParser` has no test of its own.** No test in the suite loads it (`grep` finds only comment
  references in `hooks-notify.test.cjs` and `renderer-queue.test.cjs`), so its `:158` change is guarded by
  typecheck, lint, the structural pin, and the side-by-side probe above — not by a behavioural test. A
  renderer-hook test is out of scope for every file this plan owns.
- **The self-scan layer is bounded by its own regex.** It catches `loadTs('…renderer…')`; it would not
  catch a renderer module reached via an unusual spelling. Its positive lower bound catches a renamed
  loader, which is the realistic drift.

## Self-Check: PASSED

Files claimed as created/modified, verified on disk:

```
FOUND: test/block-detect.test.cjs
FOUND: src/renderer/src/hooks/usePtyParser.ts
FOUND: src/shared/blockHints.ts
FOUND: .planning/phases/04-overnight-on-a-repo-that-matters/04-07-SUMMARY.md
```

Commits claimed, verified in `git log`:

```
FOUND: b89f60d  test(04-07): VIGIL-03's integration half goes RED — the renderer still owns a second copy of the list
FOUND: 4134eac  refactor(04-07): one list, two readers — the renderer's shadow copy is deleted, not synced
```

## TDD Gate Compliance

RED (`test(...)`, `b89f60d`) precedes GREEN (`4134eac`), and the RED output is recorded verbatim above.

**The GREEN gate is a `refactor(` rather than a `feat(`, and that is the accurate type:** the commit adds
no behaviour: it deletes a duplicate declaration, replaces it with an import, and adds documentation. No
REFACTOR gate commit follows, because there was nothing left to clean up — the GREEN commit *is* the
refactor.

**Honest note on the RED, repeated here so it is not lost:** only 1 of the 4 cases was red. The other
three were green on arrival because plan 04-03 shipped `matchBlockHint` and its wiring in wave 1, which
makes this file the integration half of a mechanism that already existed. No test was weakened, delayed
or invented to manufacture a fuller red.

STATE.md and ROADMAP.md were **not** modified — the orchestrator owns those writes.
