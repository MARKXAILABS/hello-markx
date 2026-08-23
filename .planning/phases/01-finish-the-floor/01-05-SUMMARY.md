---
phase: 01-finish-the-floor
plan: 05
subsystem: ui
tags: [react, hooks, polling, xterm, node-test, repo-facts]

requires:
  - phase: 01-01
    provides: Electron 43.4.1 runtime and the green three-platform CI the evidence here resolves against
  - phase: 01-04
    provides: docs/adr/0006-terminal-pool-lifetime.md, whose two source pointers this plan owns
provides:
  - One shared 5s hive-task poll for the whole renderer (five per-component timers collapsed onto useHiveTasks)
  - A written per-path terminal-pool drop audit, with a verdict for every path
  - test/repo-claims.test.cjs — the D-45 repo-fact accumulator, created here for later waves to append to
  - test/proc-kill.test.cjs's win32 branch made able to fail
  - The two ADR-0006 source pointer comments 01-04 filed as a blocker
affects: [01-07, 01-09, 01-23, FLOOR-13, D-22]

tech-stack:
  added: []
  patterns:
    - "Adopt-don't-rebuild: the fix for FLOOR-11's open clause already existed and had zero callers"
    - "Shared singleton poller fanned to subscribers; components keep their own parser of the unknown payload"
    - "Repo-fact accumulator: one node:test file pinning claims the project makes about itself, appended one owner per wave"
    - "Poisoned-assert probe as a durable test, not a one-shot: proves a hand-rolled harness can fail"

key-files:
  created:
    - test/repo-claims.test.cjs
    - .planning/phases/01-finish-the-floor/deferred-items.md
  modified:
    - src/renderer/src/components/AgentStrip.tsx
    - src/renderer/src/components/AskMeTab.tsx
    - src/renderer/src/components/TaskDetailOverlay.tsx
    - src/renderer/src/components/TasksKanban.tsx
    - src/renderer/src/scene/office/OfficeFloor.tsx
    - src/renderer/src/components/terminalPool.ts
    - src/renderer/src/store/terminalPoolPolicy.ts
    - test/proc-kill.test.cjs

key-decisions:
  - "Local useState is KEPT in AskMeTab/TaskDetailOverlay/TasksKanban and fed from the shared payload — the hook's own header says 'delete the local useState', and for those three that would delete the optimistic-update path, which IS a rendered-output change and UI-SPEC forbids one"
  - "AgentStrip has no local mutation, so there the header's instruction is followed exactly: useState and effect both deleted, parser moved into a useMemo"
  - "OfficeFloor's pollTaskBoard became applyTaskBoard(payload): the scene is imperative, so the payload is fanned IN through an installed applier plus a ref, rather than the scene pulling"
  - "The cold-start apply is null-guarded so firstPoll is not consumed on an empty ledger — feeding null would make every real card animate as a fresh pin"
  - "repo-claims' FLOOR-11 clause is a per-file rule with ONE reasoned allowlist entry (hooks/useHive.ts), pinned by call-site count — a literal same-effect textual check would have missed 3 of the 5 real sites, because their hiveTasks() lived in a useCallback outside the effect"
  - "useHiveTasks.ts was NOT modified: it needed no change, only callers"

patterns-established:
  - "test/repo-claims.test.cjs shape: node:test, module-level stripComments, sourceFiles() tree walk, readStripped(), one test per pinned claim with a message naming the offender and what a failure MEANS"
  - "Every guard test in this file is proven RED before being committed green"

# FLOOR-11's engineering work is done and evidenced, but the checkbox is deliberately
# left Pending in REQUIREMENTS.md — plan 23 owns it, and the "no visual change" contract
# has not been observed by a human. See "The honest gap on truth 3" below.
requirements-completed: []
requirements-worked: [FLOOR-11]

duration: 55min
completed: 2026-08-21
---

# Phase 01 Plan 05: FLOOR-11 — adopt the shared poller Summary

**Five independent 5-second polls of `hive/tasks.json` collapsed onto the one shared `useHiveTasks` hook that had been written and never called; the other two FLOOR-11 clauses verified already-shipped and audited rather than rebuilt; the phase's repo-fact accumulator created with three RED-proven clauses.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 of 3
- **Files created:** 2 · **Files modified:** 8
- **Commits:** `27b20f4`, `233660b`, `0579387`

## Verification evidence

| Check | Result |
|---|---|
| `npm test` baseline (before any change) | 444 tests / **440 pass / 0 fail** / 4 skipped, exit 0 |
| `npm test` after task 2 | 444 / **440 pass / 0 fail** / 4 skipped, exit 0 — identical |
| `npm test` after task 3 | 447 / **443 pass / 0 fail** / 4 skipped, exit 0 (+3 new) |
| `npm run typecheck` | exit 0 (both projects) |
| **CI on PR #77 @ `0579387`** | **all six jobs green** — Typecheck, Build, Test macos/windows/ubuntu, E2E Electron smoke |
| Windows CI ran the new tests | `ok 339`, `ok 340`, `ok 341`; `# tests 447 / # pass 443 / # fail 0 / # skipped 4` |

**B-repo-claims = 3.** (`# pass 3`, `# fail 0`, `# skipped 0`, `# todo 0`, `EXIT=0`.) Plan 07 asserts a floor against this number in wave 3.

## Task 1 — clause classification, re-run census, drop-path audit

### Clause 1 — "N pollers on one file": OPEN, and the fix had zero callers

```
$ grep -rn "useHiveTasks\|refreshHiveTasks" src/ test/ --include=*.ts --include=*.tsx | grep -v "hooks/useHiveTasks.ts"
(empty)
```

The empty grep is the evidence: `useHiveTasks()` and `refreshHiveTasks()` were exported and called by nothing.

### Re-run census — UI-SPEC's corrected table confirmed, zero delta

`grep -rn "hiveTasks()" src/renderer/src --include=*.ts --include=*.tsx`, excluding the hook's own file: **10 sites across 7 files**, exactly as UI-SPEC records and *not* the "four" in issue #20, CONTEXT.md and RESEARCH.md.

| File | Line | Verdict |
|---|---|---|
| `components/AgentStrip.tsx` | `:81` | **TIMER** — `setInterval(…, 5000)` at `:93` |
| `components/AskMeTab.tsx` | `:55` | **TIMER** — `setInterval(refresh, POLL_MS)` at `:60` |
| `components/TaskDetailOverlay.tsx` | `:26` | **TIMER** — `setInterval(…, POLL_MS)` at `:32` |
| `components/TasksKanban.tsx` | `:128` | **TIMER** — `setInterval(refresh, POLL_MS)` at `:145` |
| `scene/office/OfficeFloor.tsx` | `:1362` | **TIMER** — `setInterval(pollTaskBoard, 5000)` at `:1425` |
| `scene/office/OfficeFloor.tsx` | `:1000` | ONE-SHOT — boss-aura done-counts, refreshed off the Pixi ticker, not a timer |
| `hooks/useHive.ts` | `:218` | ONE-SHOT — inside `ensureSlackCard()`, per delivered message |
| `realtime/tools.ts` | `:169`, `:579`, `:631` | ONE-SHOT ×3 — voice tool calls |

Five timers, five one-shots. Migration target = the five timers.

### Clause 2 — "a PTY byte does not re-render the roster": ALREADY SHIPS

```
$ grep -n "patchChangesAgent" src/renderer/src/store/store.ts
10:import { patchChangesAgent, touchesDurableAgentField } from './agentPatch';
621:      if (!current || !patchChangesAgent(current, patch)) return s;
```

`updateAgent` returns `s` unchanged on a non-material patch; policy extracted pure into `store/agentPatch.ts`; blocked-repaint early return at `usePtyParser.ts:171`. **Not rebuilt.** Already pinned by three pre-existing tests in `test/renderer-runstate.test.cjs` (`:24`, `:36`, `:44`).

*(Anchor correction: the plan and RESEARCH cite `store.ts:614-621`; the guard is at `:621` in current source.)*

### Clause 3 — "the terminal pool is bounded": ALREADY SHIPS

```
$ grep -n "TERMINAL_POOL_MAX\|orphanedTerminalIds" src/renderer/src/store/terminalPoolPolicy.ts src/renderer/src/components/terminalPool.ts
terminalPoolPolicy.ts:23:export const TERMINAL_POOL_MAX = 24;
terminalPoolPolicy.ts:40:  cap = TERMINAL_POOL_MAX,
terminalPoolPolicy.ts:60:export function orphanedTerminalIds(
terminalPool.ts:37:  orphanedTerminalIds,
terminalPool.ts:39:  TERMINAL_POOL_MAX,
terminalPool.ts:319:  for (const stale of terminalsToEvict(poolSnapshot(), TERMINAL_POOL_MAX, ptyId)) {
terminalPool.ts:336:  const orphans = orphanedTerminalIds(poolSnapshot(), livePtyIds);
```

Cap applied at `terminalPool.ts:319`, sweep at `:336` (plan cites `:335`), called from `useHive.ts:1007` on a 30s interval. Pinned by five pre-existing tests in `test/renderer-runstate.test.cjs` (`:56`–`:85`).

### Drop-path audit — per-path verdicts

The question the plan sets is *"does every drop path reach the sweep?"*, not *"does every drop path dispose?"* — because `terminalPoolPolicy.ts`'s header and ADR-0006 both record the per-call-site approach as having already failed once.

The sweep is `disposeOrphanedTerminals(live)` at `useHive.ts:1007`, where `live` is recomputed from `useStore.getState().agents` every 30 s (`TERMINAL_REAP_MS`, `useHive.ts:63`), in an ungated app-wide effect. So *any* path that removes an agent from `s.agents` (or clears its `ptyId`) makes its terminal an orphan on the next tick, with no cooperation required from the path.

**Store paths that drop an agent from the roster:**

| Path | Anchor | Verdict |
|---|---|---|
| `removeAgent` | `store.ts:683` | **REACHES.** Filters the agent out of `s.agents`, so its `ptyId` leaves `live`. |
| `archiveAgent` | `store.ts:693` | **REACHES.** Filters out of `s.agents`; the retained archived copy is written with `ptyId: undefined`, and the sweep reads `s.agents` only — the id cannot be reintroduced. Callers: `AgentDetailPanel:94`, `FullscreenTerminal:850`, `OfficeThemePicker:76`, and the main-process archive broadcast at `useHive.ts:1100`. |
| `reconcileWithLivePtys` | `store.ts:829` | **REACHES.** Filters agents whose pty is not live. The `dead` copies pushed into `restorableAgents` keep their `ptyId`, but the sweep never reads `restorableAgents`, so it is not shadowed. |

**The five `disposeTerminal` call sites:**

| Site | Verdict |
|---|---|
| `AgentDetailPanel.tsx:93` | Immediate dispose, then `archiveAgent` — **and** reaches the sweep via that. Belt and braces; harmless. |
| `FullscreenTerminal.tsx:849` | Same shape as above. **REACHES.** |
| `OfficeThemePicker.tsx:73` | Disposes each victim, then `archiveAgent` for each. **REACHES.** |
| `CommandCenterPanel.tsx:501` | **Not a drop path at all** — an in-place respawn under the *same* ptyId (`disposeTerminal` → `acquireTerminal` → bump generation). The agent never leaves the roster, so it is correctly never a sweep candidate. |
| `terminalPool.ts:320` (cap eviction) / `:337` (the sweep itself) | The two policy call sites. |

**The one question that could have made the answer "no", and its resolution.** Both policy functions refuse to touch an `attached` entry. If `attached` were a stored flag it could go stale `true` and pin a dropped agent's terminal forever. It is not: `poolSnapshot()` (`terminalPool.ts:88-95`) derives it live as `!!e.host.parentElement` on every call, and `detachTerminal` (`:587`) plus any view unmount unparent the host. There is no state to keep in step, so no drop path can be stranded behind a stale attachment.

**Verdict: every drop path reaches the sweep. No code change was in scope**, and none was made to the pool beyond the ADR pointer comments.

### RESEARCH Open Question 5 — `pushFeed`: LEAVE ALONE

```
$ grep -rn "feeds" src/renderer/src --include=*.ts --include=*.tsx | grep -v "store/store.ts"
src/renderer/src/realtime/CostHud.tsx:5: * (costStore.ts), which Kevin's session feeds via resetRealtimeCost() on connect
src/renderer/src/realtime/costStore.ts:10: * session (session.ts) feeds it through TWO one-line calls (the integration points
```

Two hits, **both unrelated prose in comments**. **Zero components select `s.feeds`.** With no subscriber, `pushFeed`'s unconditional reallocation (`store.ts:638`) cannot re-render anything, so it is not a FLOOR-11 defect and a guard added there would be speculative work. **Decision: leave alone.** The separate finding that the slice is write-only (3 writers, 0 readers) is logged in `deferred-items.md` — `store.ts` is not in this plan's `files_modified`.

## Task 2 — the migration

The one judgement call, and why it went the way it did: **the hook's own header says "delete the local `useState` + polling `useEffect`, call this." That is right for one of the five files and wrong for three of them.** `AskMeTab.dismiss`/`sendAnswer`, `TaskDetailOverlay.move` and `TasksKanban.dismissTask` all write to their local `tasks` optimistically before the disk round trip. Deriving straight off the shared payload deletes that path, so a dismissed card would sit on the board for up to five seconds — a change in rendered output, which UI-SPEC's FLOOR-11 contract explicitly calls a regression rather than an improvement. So in those three the local state stays and is fed from the shared payload; only the *timer* goes. `AgentStrip` has no local mutation, so there the header is followed literally.

| File | What changed |
|---|---|
| `AgentStrip.tsx` | `useState` + polling `useEffect` deleted; the same parser now runs in a `useMemo` off `useHiveTasks()` |
| `AskMeTab.tsx` | timer + `refresh` + `timer` ref + `POLL_MS` deleted; `useEffect([rawTasks])` feeds the existing `parse` into the existing `setTasks` |
| `TaskDetailOverlay.tsx` | same; `move()`'s failure path now calls `refreshHiveTasks()` |
| `TasksKanban.tsx` | same; `dismissTask` now calls `refreshHiveTasks()` after the mutation (the exported function's stated use case) |
| `OfficeFloor.tsx` | `pollTaskBoard()` → `applyTaskBoard(payload)`; the `setInterval` and `__taskBoardPoll` teardown are gone; payload fanned in via `__applyTaskBoard` + `hiveTasksRef` |
| `terminalPool.ts` | one-line ADR-0006 pointer |
| `terminalPoolPolicy.ts` | one-line ADR-0006 pointer, nothing else |

**`useHiveTasks.ts` itself was not modified.** It needed no change — only callers. Every component keeps its own parser; the `unknown` return contract is untouched.

**OfficeFloor detail worth recording.** The scene is imperative and outlives any single payload, so the value is pushed *in* rather than pulled. Two things make that behaviour-preserving: the ref is seeded from the first render, so a scene whose async `init()` completes before any effect runs still cold-starts on the payload the shared poller already had; and the cold-start apply is `!= null`-guarded, because feeding `null` in would consume `firstPoll` against an empty ledger and make every real card animate as a fresh pin instead of drawing the truth.

### Acceptance criteria, measured

| Criterion | Baseline | After | Verdict |
|---|---|---|---|
| `useHiveTasks` refs outside the hook (≥5) | 0 | **16** | PASS |
| `refreshHiveTasks` in TasksKanban (≥1) | 0 | **2** | PASS |
| `hiveTasks()` in `useHive.ts` (preserve 1) | 1 | **1** | PASS |
| `hiveTasks()` in `realtime/tools.ts` (preserve 3) | 3 | **3** | PASS |
| `adr/0006` in `terminalPool.ts` (≥1) | 0 | **1** | PASS |
| `adr/0006` in `terminalPoolPolicy.ts` (≥1) | 0 | **1** | PASS |
| `git diff --numstat -- terminalPoolPolicy.ts` | — | `1	0	src/renderer/src/store/terminalPoolPolicy.ts` | PASS (exactly one line added, none removed) |
| Path-scoped containment, declared files | — | only the 7 declared paths listed | PASS |
| Path-scoped containment, forbidden files (`store.ts`, `usePtyParser.ts`, `agentPatch.ts`, `SidebarSplitter.tsx`) | — | **prints nothing** | PASS |
| `npm run typecheck` | 0 | **0** | PASS |
| `npm test` | 440/0 | **440/0** | PASS |

### One criterion reported NOT satisfied as literally worded — read this

The per-file timer criterion, run verbatim:

```
$ for f in $(grep -rl "hiveTasks(" src/renderer/src --include=*.tsx --include=*.ts | grep -v useHiveTasks); do grep -qE "setInterval\(" "$f" && echo "$f"; done
```

- **Baseline (6 files):** `AgentStrip.tsx`, `AskMeTab.tsx`, `TaskDetailOverlay.tsx`, `TasksKanban.tsx`, `hooks/useHive.ts`, `scene/office/OfficeFloor.tsx`
- **After (1 file):** `src/renderer/src/hooks/useHive.ts`

The criterion says it must list **no file**. It lists one. **That criterion is unsatisfiable by construction and the survivor is a false positive, not a surviving poller** — reported loudly rather than declared green:

- `useHive.ts`'s only `hiveTasks()` (`:218`) is inside `ensureSlackCard()`, a module-level `async function` invoked per delivered Slack message. The plan explicitly forbids converting it: *"Do not convert `useHive.ts:218` … Converting a one-shot read into a subscription starts a timer that would otherwise not exist."*
- Its six `setInterval`s (`:646`, `:706`, `:749`, `:947`, `:990`, `:1009`) are the nudge poll, two unrelated polls, the feed flush, the veto report, and the 30 s terminal reap — **this plan's own audit depends on that last one existing.** None references `hiveTasks`.
- So satisfying the criterion literally would require either violating the plan's own instruction or deleting the sweep. The check is a per-file proximity test that cannot see call-site semantics.

**This is why the durable guard in `test/repo-claims.test.cjs` is not this pipeline.** It applies the same per-file rule but carries one reasoned allowlist entry (`hooks/useHive.ts`) whose exact `hiveTasks(` call-site **count** is pinned instead — so a new read appearing there fails the test and forces a human to check whether it is on a timer. The hole the coarse check leaves is closed; the false positive is not paid for.

## Task 3 — `test/repo-claims.test.cjs`

Created as the D-45 accumulator. Real `node:test` file, comment-stripping mandatory, three clauses.

### Its shape — the contract plan 07 (wave 3) appends to

```js
'use strict';
/** header: names #4/#5/#10/#34 (the CONCERNS.md § Method over-claims), then the clause list */

const test   = require('node:test');           // the ONLY literal occurrence in the file
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root         = path.join(__dirname, '..');
const rendererRoot = path.join(root, 'src', 'renderer', 'src');

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
function sourceFiles(dir)  { /* recursive .ts/.tsx walk → repo-relative POSIX paths */ }
const readStripped = (rel) => stripComments(fs.readFileSync(path.join(root, rel), 'utf8'));

const POLLER           = 'src/renderer/src/hooks/useHiveTasks.ts';
const ONE_SHOT_READERS = { 'src/renderer/src/hooks/useHive.ts': 1 };
const POISON           = "const M=require('module'),o=M.prototype.require,…";

test('no renderer file outside the shared poller owns a hiveTasks timer (#20)', …);
test('the shared poller still has its callers — it was written once and orphaned (#20)', …);
test('every hand-rolled harness fails loudly — no assertion that cannot fail (#7)', …);
```

**Contract for later owners:**
- No `module.exports`; the file exports nothing. Append `test(...)` blocks at the bottom.
- Reuse the module-level `stripComments`, `sourceFiles`, `readStripped`, `root` — do not redeclare them.
- **`require('node:test')` must appear exactly once** in the file (a criterion asserts `grep -c` returns `1`; the skip-regex in clause 3 is written `/require\('node:test'\)/`, which does not match the bare literal).
- **No `process.exit` anywhere**, comments included — a criterion asserts `grep -c` returns `0`.
- One owner per wave; do not add clauses for another wave's requirements.

### Every clause proven RED before being committed green

The mandate's rule is that a test which cannot fail is not evidence. Each was driven red against the real defect it guards:

| Clause | RED probe | Result |
|---|---|---|
| FLOOR-11 negative grep | `git checkout 27b20f4 -- AskMeTab.tsx TasksKanban.tsx` (pre-migration form) | **`not ok 1`** — *"…These files both read hiveTasks() and run a setInterval: AskMeTab.tsx, TasksKanban.tsx"* |
| caller count ≥5 | same revert | **`not ok 2`** — *"…is down to 3 caller(s) (AgentStrip, TaskDetailOverlay, OfficeFloor)"* |
| poisoned-assert probe | `git checkout HEAD -- test/proc-kill.test.cjs` (un-fix the win32 branch) | **`not ok 3`** — *"these harnesses cannot fail…: test/proc-kill.test.cjs"* |

All three reverts were restored and the file re-run green (`EXIT=0 / # pass 3 / # fail 0 / # skipped 0`) before commit.

### `test/proc-kill.test.cjs` — the win32 silent pass, closed and proven

The file's win32 branch exited 0 immediately after the smoke import and before a single assertion, so on Windows it was green forever — green even if `procKill.ts` stopped exporting anything. Two lines now assert the import it claims to perform. Measured on this host:

| State | `node test/proc-kill.test.cjs` | Under the poison probe |
|---|---|---|
| **Before the fix** | exit 0 | **exit 0 — SILENT-FAILURE** |
| **After the fix** | exit 0 (still passes) | **exit 1 — fails loudly** |

The full authoring-time probe over all eight hand-rolled harnesses:

- **Before:** `SILENT-FAILURE: test/proc-kill.test.cjs` (one offender — every other harness already failed loudly)
- **After:** prints **nothing**

And it is not a one-shot: clause 3 re-runs it inside `npm test`, and **Windows CI executed it at `0579387` (`ok 341`)** — the platform where the defect actually lived.

### Task 3 criteria, measured

| Criterion | Required | Actual |
|---|---|---|
| TAP run | `EXIT=0`, `# pass ≥3`, `# fail 0`, `# skipped 0`, `# todo 0` | `EXIT=0`, `# tests 3`, `# pass 3`, `# fail 0`, `# skipped 0`, `# todo 0` |
| `grep -c "POISON"` | ≥1 | 2 |
| `grep -c "stripComments"` | ≥1 | 2 |
| `grep -c "require('node:test')"` | 1 | 1 |
| `grep -c "process.exit"` | 0 | 0 |
| test-file count (`--cached --others --exclude-standard`) | 57 | **57** (56 baseline + 1) |
| test files outside the runner's glob | 0 | 0 |
| `grep -c "assert.strictEqual(typeof ensureKilled" test/proc-kill.test.cjs` | 1 | 1 |
| `node test/proc-kill.test.cjs` | exit 0 | exit 0 |
| poison probe over all harnesses | prints nothing | prints nothing |

## must_haves — every truth adjudicated

| # | Truth | Status |
|---|---|---|
| 1 | Exactly one 5-second timer polls the hive task file for the whole renderer | **SATISFIED.** Five `setInterval` sites removed; the only remaining one is `useHiveTasks`'s, which exists only while something is subscribed. Pinned by clause 1 (RED-proven), with the `useHive.ts` allowlist entry pinned by call-site count. |
| 2 | The five one-shot `hiveTasks()` reads are unchanged | **SATISFIED.** `useHive.ts` 1, `realtime/tools.ts` 3, `OfficeFloor.tsx:1017` (was `:1000`) 1 — measured as preservation criteria, untouched. |
| 3 | Migrating a poller produces no change in rendered output | **PARTIAL — see the honest gap below.** |
| 4 | A PTY byte does not re-render the roster (already true — audited and pinned, not rebuilt) | **SATISFIED.** Audited with pasted evidence; not rebuilt; `store.ts`/`agentPatch.ts`/`usePtyParser.ts` provably untouched (containment check prints nothing). Pinned by pre-existing `test/renderer-runstate.test.cjs:24,36,44`. |
| 5 | The terminal pool is bounded and every drop path reaches the orphan sweep | **SATISFIED.** Per-path verdicts above: all reach. Bounded by `TERMINAL_POOL_MAX = 24` + LRU + sweep, pinned by pre-existing `renderer-runstate.test.cjs:56-85`. No code change needed or made. |

### The honest gap on truth 3 — I would not bet a pager on "looks identical"

The plan's `<verification>` asks for a manual run of the dev app with the Tasks board and office floor open, confirming the data still updates and looks identical. **That was not performed and is not claimed.** What *was* run, and what it does and does not prove:

- **E2E Electron smoke, green on CI at `0579387`.** It boots the packaged main bundle, walks onboarding, spawns a real PTY, and asserts `MICHAEL` becomes visible — which is `AgentStrip` (a migrated file) rendering an agent card. So the migrated components mount, the renderer does not crash, and the roster still paints. That is real evidence, on the real bundle.
- **It does not open the Tasks board, the detail overlay or the kanban**, and it asserts nothing about pixels. So "the Tasks board still updates and looks identical" rests on source reasoning (each component's parser kept verbatim; local optimistic state deliberately preserved; `OfficeFloor`'s `firstPoll` cold-start behaviour preserved by the null guard) — **not on observation.**

The residual risk this leaves is specifically: a timing difference visible only with a live ledger being edited — e.g. the first paint of the kanban now arriving from the shared cache rather than from a component-owned first read. Source says these are equivalent; nobody has watched it. **Recommend an operator run of `npm run dev` with the Tasks board and floor open before FLOOR-11 is ticked in plan 23.**

## Deviations from Plan

**No Rule 1/2/3 auto-fixes were needed** — no bug, missing critical functionality or blocker was found in the files this plan owns. Three deliberate departures from the plan's letter, each recorded because it changes what an executor would naively have written:

1. **The hook header's "delete the local `useState`" was followed in 1 of 5 files, not 5 of 5.** In `AskMeTab`, `TaskDetailOverlay` and `TasksKanban` the local state carries the optimistic-update path; deleting it would change rendered output, which UI-SPEC forbids. Timers deleted, state kept. (Task 2.)
2. **`OfficeFloor` needed a structural change the plan did not describe** — the plan says "delete the local `useState` and the polling `useEffect`", but that site is an imperative Pixi closure with no React state. `pollTaskBoard()` became `applyTaskBoard(payload)` with the payload fanned in. This is the same migration, expressed for an imperative consumer.
3. **The durable FLOOR-11 guard is not the literal "same effect" check the plan's task 3 specifies.** A textual same-effect check would have missed 3 of the 5 real sites, because `AskMeTab`/`TaskDetailOverlay`/`TasksKanban` each defined `refresh` in a `useCallback` *outside* the effect and passed the identifier in. The implemented rule is per-file with one reasoned, count-pinned allowlist entry — strictly stronger on the sites that mattered. Proven by driving it RED against two of those exact three files.

**No architectural (Rule 4) checkpoint arose.** No authentication gate arose.

## Known Stubs

None. No hardcoded empty values, placeholder text or unwired components were introduced.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change at a trust boundary. T-P05-01 is mitigated as planned (five timers → one); T-P05-02 and T-P05-03 were confirmed already-mitigated and left alone; T-P05-04 is mitigated by keeping every parser verbatim; T-P05-05 is mitigated by clause 2's caller-count assertion.

## For later plans

- **`test/repo-claims.test.cjs` exists and its shape is a contract** — see "Its shape" above. Plan 07 appends in wave 3 and asserts a floor against **B-repo-claims = 3**.
- **The ADR-0006 blocker 01-04 filed is closed.** Both pointer comments are in. `terminalPoolPolicy.ts` received *exactly one line* and nothing else; later owners of these two files must not revert either comment.
- **FLOOR-11 is left `[ ]` Pending in REQUIREMENTS.md on purpose** — matching 01-02 (GATE-01) and 01-04 (FLOOR-06/17), where plan 23 owns the checkboxes. All three clauses have real evidence; the un-observed item is the "no visual change" contract. `requirements.mark-complete` ticked it during state updates and the tick was **reverted**, because a green checklist that overstates reality is the exact defect this phase exists to remove (PROJECT.md, Key Decisions). Tick it after the operator run.
- **Issue #20 is not closed by this plan.** Its FLOOR-11 clauses now all have pasted evidence and named tests, but closing it per D-43 is plan 23's call.
- **`deferred-items.md` now exists** in the phase directory with one entry (`store.feeds` is write-only). Later plans should append rather than recreate it.

## Self-Check: PASSED

All created files exist on disk (`test/repo-claims.test.cjs`, `deferred-items.md`, this SUMMARY); all three task commits (`27b20f4`, `233660b`, `0579387`) are present in `git log` and pushed to `origin/gsd/v1.0-milestone`, where CI is green on all six jobs at `0579387`.
