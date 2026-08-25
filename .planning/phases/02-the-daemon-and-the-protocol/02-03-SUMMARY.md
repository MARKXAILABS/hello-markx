---
phase: 02-the-daemon-and-the-protocol
plan: 03
subsystem: infra
tags: [electron, node-test, daemon-mode, dependency-injection, hive-protocol, adr]

requires:
  - phase: 02-the-daemon-and-the-protocol
    provides: "plan 02-02's bootFloor(deps)/Floor composition root — this plan's headless.ts and lifecycle.ts are new src/main/floor/** modules built on top of that seam"
provides:
  - "src/main/floor/headless.ts — isHeadless/quitDecision/shouldQuitOnLastWindowClose, the pure predicates behind D-09's quit-deadlock fix"
  - "Floor.teardownAndQuit() and Floor.teardownPty(id) — two new Floor methods index.ts calls instead of restating the logic inline"
  - "src/main/floor/lifecycle.ts — teardownPty/finalizeWorkerWorktree/finalizeAgentWorktree/workerScratchDir over an injected AgentTeardownDeps, the agent-lifecycle seam STRUCT-01 names"
  - "HiveManager's injected handoff dep and DeliveryService.noteSpawn's seed param — both D-11 mail gaps closed, terminal work orders and Crush protocol seeds now enqueued by main"
  - "ADR-0001 amended: the five drainQueue gates restated by name, two more renderer writers named as moved, one renderer writer (onClaudeAccountResumed) named as a stated exception"
affects: [02-04, 02-10, 02-12]

tech-stack:
  added: []
  patterns:
    - "A private closure-over-module-state method becomes a free function taking an explicit deps object (hiveProvisioning.ts's own register) — applied here to headless.ts's predicates and lifecycle.ts's teardown state machine"
    - "A module-scope const arrow function (not `function name(...)`) as the delegating wrapper when a repo-fact assertion pins the literal absence of `function <name>` in the file being delegated FROM"

key-files:
  created:
    - src/main/floor/headless.ts
    - src/main/floor/lifecycle.ts
    - test/agent-lifecycle.test.cjs
  modified:
    - src/main/index.ts
    - src/main/floor/boot.ts
    - src/main/floor/deps.ts
    - src/main/hive.ts
    - src/main/delivery.ts
    - src/shared/queueDelivery.ts
    - src/renderer/src/hooks/useHive.ts
    - docs/adr/0001-one-gate-for-pty-writes.md
    - .gitignore
    - test/boot-floor.test.cjs
    - test/hive-router.test.cjs
    - test/delivery-main.test.cjs
    - test/queue-delivery.test.cjs

key-decisions:
  - "DAEMON-01 and STRUCT-01 are NOT flipped complete in REQUIREMENTS.md this session, for two independent reasons stated in full below: DAEMON-01's own 02-VALIDATION.md manual-verification row is explicit that unit/composed evidence alone is 'not a pass' for criterion 2, and this session had no live Electron GUI session to run it in; STRUCT-01 names five seams (agent lifecycle, shutdown, scheduler, workers, IPC) and this plan closes only the agent-lifecycle one -- workers (spawnAgentCore, ~480 lines) and IPC (~152 handlers) are still fully inside index.ts, exactly as 02-02's own SUMMARY already flagged"
  - "task 5 measured first (D-01) and found 02-02 had already relocated teardownPty/the two worktree finalizers/workerScratchDir out of index.ts into boot.ts -- but as private closures over module-scope `let` state, not the AgentTeardownDeps-injected shape this task's acceptance criteria require. Not a no-op: the dependency-injection extraction itself was still the whole task"
  - "WorkerRec and PreservedWorktree type definitions moved from boot.ts into lifecycle.ts (verified first: referenced nowhere outside src/main/floor/**), so lifecycle.ts owns its own vocabulary rather than importing types back from the file it was extracted out of"
  - "terminalWorkOrderPrompt moved into the EXISTING src/shared/queueDelivery.ts rather than a new terminalWorkOrder.ts -- a deliberate deviation from 02-PATTERNS.md:35, recorded per the plan's own instruction. queueDelivery.ts already owns 'every way a renderer may touch the main-owned queue'; a terminal work order is exactly that kind of object, and a second shared/ file for one function plus one interface would be the kind of unrequested split ponytail mode exists to skip"
  - "Two small out-of-task-scope fixes were committed SEPARATELY (373a836, ff0c6ae) rather than folded into the task commit that caused them, specifically to keep each task's containment check clean against its own declared file list -- both are one-line stale-comment/exclusion-list fixes, not scope creep"

patterns-established:
  - "src/main/floor/**'s electron-free discipline extends cleanly to a second new module (lifecycle.ts) beyond boot.ts/deps.ts/headless.ts -- syncKeepAwake is the one field on AgentTeardownDeps that exists specifically so the whole module loads under node --test with no Electron binary, the same shape FloorDeps already established"

requirements-completed: []

duration: ~3h40m
completed: 2026-08-23
---

# Phase 02 Plan 03: The Daemon and the Protocol — DAEMON-01's deadlock, D-11's two mail gaps, and STRUCT-01's agent-lifecycle seam Summary

**A headless-started floor now quits cleanly with live PTYs (`quitDecision`'s `'teardown'` arm replaces a `preventDefault` that could never resolve with no window), mail to a hookless or proxy-tier agent and a fresh Crush worker's protocol seed both now travel through main's own delivery queue instead of a renderer IPC listener that dies with the window, and the agent-teardown state machine is an electron-free, dependency-injected module with its first tests.**

## Performance

- **Duration:** ~3h40m
- **Completed:** 2026-08-23
- **Tasks:** 5 (baselines/hygiene, D-09 deadlock fix, D-11 gap 1, D-11 gap 2 + ADR-0001, agent-lifecycle extraction)
- **Files modified:** 16 (3 created, 13 modified) — an exact match to the plan's own `files_modified` frontmatter list, zero scope creep

## Accomplishments

- **D-09 (the quit deadlock) closed.** `src/main/floor/headless.ts`'s `quitDecision({allowQuit, livePtyCount, hasWindow})` replaces `before-quit`'s old `preventDefault()`-then-ask-a-window-that-does-not-exist shape. Its `'teardown'` arm calls the new `Floor.teardownAndQuit()` (`shutdown()` — whose `SHUTDOWN_STEPS` already ends in `ptyManager.killAll()`, routing every live PTY through `teardownPty`'s ADR-0003 gate exactly like a confirmed quit does — then `deps.quit()`), the same non-interactive route a confirmed quit already takes. `shouldQuitOnLastWindowClose` and the other three named Electron edits (`second-instance` → `else createWindow()`, the guarded login-item re-registration, the UNVERIFIED-marked darwin `setActivationPolicy`) all landed. 17 new `test/boot-floor.test.cjs` cases, including the composed proof: boot a real floor, assert `quit()` was called zero times, call `teardownAndQuit()`, assert it was called once and the hook socket now refuses a connection.
- **D-11 gap 1 closed.** `HiveManager` gained a third constructor param, `handoff?: (order: TerminalWorkOrder) => boolean`, wired in `boot.ts` to `delivery.enqueue()` (copying `index.ts:411-434`'s `claudeAccount:failover` interception in shape and comment discipline). Both bounce subjects stopped blaming "renderer unavailable" and now name the true cause main's queue refuses on. `terminalWorkOrderPrompt` moved byte-identical (TWOP-extracted digest `7f24b41488f086a7b6c060ea1e3d5f93a326073de7662e8a650199f241ebf210`, 502 bytes, both sides) into `src/shared/queueDelivery.ts`. The renderer's `onHiveTerminalHandoff` listener, its `seenTerminalHandoffs` dedup ref, and the already-dead `deliverWithAcknowledgement` import (D-12 residue) are all deleted.
- **D-11 gap 2 closed.** `DeliveryService.noteSpawn(ptyId, seed?)` extends the existing spawn hook — it still sets the boot grace unconditionally, and when a seed is present it enqueues through the same `enqueue()` gate every other queued message rides, so a Crush worker's protocol seed is delivered behind the boot grace + idle + veto policy instead of a renderer `setInterval`. The god's seed stays a direct write — it is one link in the renderer's ordered three-step boot chain and enqueuing it would invert that order.
- **ADR-0001 amended in place** (Status stays Accepted — this is not a reversal). The 2026-08-21 amendment's five gates are now restated against `delivery.ts`'s own names (`bootGraceUntil`, `idleMs >= IDLE_MS`, `paused`, `vetoed()`, `FLUSH_COOLDOWN_MS`). A new 2026-08-23 amendment names both D-11 fixes. A new Exceptions section names the god's boot chain (unchanged, correct) AND `useHive.ts`'s `onClaudeAccountResumed` nudge as a renderer-side automatic writer this plan does NOT move — stated as a survivor, not rounded off.
- **STRUCT-01's agent-lifecycle seam extracted.** `src/main/floor/lifecycle.ts` (new): `teardownPty`, `finalizeWorkerWorktree`, `finalizeAgentWorktree`, `workerScratchDir`, over one `AgentTeardownDeps` interface (16 collaborators, matching the plan's own `<interfaces>` measurement of `teardownPty`'s dependency surface exactly). Zero `electron` import. Every comment moved with its function — #14's id-reuse reasoning, the deferred-scratch MemPalace-miner note, `finalizeAgentWorktree`'s deliberate non-registration in `preservedWorktrees` (ADR-0003's asymmetry). `test/agent-lifecycle.test.cjs` (new, 8 tests): a dirty worker worktree preserved, a clean one removed, the agent-worktree asymmetry, teardown's full bookkeeping, idempotence, `workerScratchDir`, and the worker-vs-agent routing branch — all against a REAL git repo and worktree, no PTY spawn anywhere.

## Task Commits

1. **Task 1: baselines + psl.dat hygiene** — `1e787f7` (chore)
2. **Task 2: headless.ts, D-09's quit-deadlock fix** — `b6095f9` (feat)
3. **[Rule 1 auto-fix] deps.ts's stale emitTerminalHandoff comment** — `373a836` (fix, separate from task 3's own commit — see Deviations)
4. **Task 3: D-11 gap 1, terminal-handoff mail** — `c420f60` (feat)
5. **Task 4: D-11 gap 2 + ADR-0001 amendment** — `172a5f8` (feat)
6. **[Rule 1 auto-fix] #34 coverage exclusion for the new teardownPty Floor field** — `ff0c6ae` (fix, separate from task 5's own commit — see Deviations)
7. **Task 5: lifecycle.ts extraction + agent-lifecycle.test.cjs** — `1118e3b` (feat)

No separate plan-metadata commit yet — STATE.md/ROADMAP.md/REQUIREMENTS.md updates land in the final docs commit below.

## Files Created/Modified

- `src/main/floor/headless.ts` (new) — `isHeadless`, `quitDecision`, `shouldQuitOnLastWindowClose`.
- `src/main/floor/lifecycle.ts` (new) — `teardownPty`, `finalizeWorkerWorktree`, `finalizeAgentWorktree`, `workerScratchDir`, `removeWorkerScratch`, `AgentTeardownDeps`, `WorkerRec`, `PreservedWorktree`.
- `test/agent-lifecycle.test.cjs` (new) — the STRUCT-01/Wave-0 row neither 02-01 nor 02-02 claimed.
- `src/main/index.ts` — `HEADLESS` computed at module scope; the six D-09 Electron edits; `floor` captured from `bootFloor()`'s resolved value; three `teardownPty(id)` call sites become `floor?.teardownPty(id)`; the conditional `noteSpawn(opts.id, seed)` call site with the `isGod` guard.
- `src/main/floor/boot.ts` — `teardownAndQuit`/`teardownPty` added to `Floor`; the four lifecycle functions become thin bound wrappers delegating to `lifecycle.ts`; `HiveManager`'s `handoff` dep wired; dead imports removed (`worktreeHasUnintegratedWork`/`removeWorktree` from `git.ts`, `resolve`/`basename` from `node:path`, `rmSync` from `node:fs` — all now lifecycle.ts-only).
- `src/main/floor/deps.ts` — `quit`'s doc comment extended (D-09); `send`'s doc comment corrected off the renamed `emitTerminalHandoff`.
- `src/main/hive.ts` — third constructor param `handoff`; `emitTerminalHandoff` renamed `terminalHandoff`; both bounce subjects rewritten.
- `src/main/delivery.ts` — `noteSpawn(ptyId, seed?)`; `enqueue`'s doc comment corrected (main now has two internal producers, not just the renderer over IPC).
- `src/shared/queueDelivery.ts` — `terminalWorkOrderPrompt` + `TerminalWorkOrder`, moved byte-identical.
- `src/renderer/src/hooks/useHive.ts` — effect 2e (terminal handoff) and effect 3b (protocol seed) deleted with FLOOR-02-register deletion comments; `seenTerminalHandoffs`/`seeded` refs, `SEED_BOOT_MS` constant, and the dead `deliverWithAcknowledgement` import all deleted. `bootGraceUntil`/`BOOT_GRACE_MS` survive — the god boot chain uses them.
- `docs/adr/0001-one-gate-for-pty-writes.md` — amended in place, Status unchanged.
- `.gitignore` — narrow `/psl.dat` rule.
- `test/boot-floor.test.cjs` — +12 net cases (4 `quitDecision`, 3 `shouldQuitOnLastWindowClose`, 1 composed teardown proof, 2 D-11 composed proofs, 2 D-40 ipcMain.handle pins), plus the `#34` coverage exclusion fix.
- `test/hive-router.test.cjs`, `test/delivery-main.test.cjs`, `test/queue-delivery.test.cjs` — D-11/D-11-gap-2 case additions on existing harnesses.

## Decisions Made

See `key-decisions` in the frontmatter above — the two REQUIREMENTS.md non-flips (DAEMON-01, STRUCT-01), the lifecycle.ts extraction actually being real work (not a no-op), the `WorkerRec`/`PreservedWorktree` type relocation, the `terminalWorkOrderPrompt` file-placement deviation, and the two separately-committed out-of-scope fixes.

## D-01 baselines (re-measured this session at B-sha `5b598d9804be6367838e3175999f4c7205ef4e94`)

```
$ wc -l src/main/index.ts src/main/hive.ts src/main/delivery.ts src/shared/queueDelivery.ts src/renderer/src/hooks/useHive.ts
  4454 src/main/index.ts
  2685 src/main/hive.ts
   981 src/main/delivery.ts
   120 src/shared/queueDelivery.ts
  1275 src/renderer/src/hooks/useHive.ts

$ grep -c 'ipcMain.handle(' src/main/index.ts
153   (B-ipc, raw — unchanged from 02-01's recorded 153)

$ JC() { node -e '...same helper as test/repo-claims.test.cjs:53, plus a whitespace squeeze...' "$1"; }
$ JC src/main/index.ts | grep -oE "ipcMain\s*\.\s*handle\s*\(\s*'[^']*'" | wc -l
152   (B-ipc-joined — the JC-stripped count the boot-floor pin actually asserts against; the
       one-count gap from raw B-ipc is real: index.ts:3368's `// ...google/*` line comment
       defeats the naive block-comment regex, swallowing `pty:write`)

$ grep -c 'LIVE-UNVERIFIED' src/main/hive.ts
2   (B-markers-hive — see "B-markers-hive discrepancy" below, this is a relocation not a loss)

$ node --test --test-reporter=tap test/main-hardening.test.cjs | grep -E '^# (tests|pass|fail|skipped) '
# tests 4 / # pass 4 / # fail 0 / # skipped 0    (B-hardening-pass = 4, unchanged after task 5)

$ node --test --test-reporter=tap test/boot-floor.test.cjs
# tests 7 / # pass 7 / # fail 0 / # skipped 0    (B-boot-pass = 7 — the D-05 gate, proven green
                                                    BEFORE any source was touched)

$ node --test --test-reporter=tap test/*.test.cjs
# tests 651 / # pass 644 / # fail 0 / # skipped 7   (B-suite)
```

## The extraction gate (D-05)

`node --test --test-reporter=tap test/boot-floor.test.cjs` at B-sha `5b598d9804be6367838e3175999f4c7205ef4e94`: `EXIT=0`, `# tests 7`, `# pass 7`, `# fail 0`, `# skipped 0`. Green before any source in this plan was touched — the gate wave 3 needed.

## The 01-21 precondition (resolved against HEAD, not `main` — same D-01 correction 02-02's SUMMARY already recorded)

```
$ git log --oneline HEAD -- eslint.config.js | grep -c '01-21'
1
$ git ls-tree --name-only HEAD -- eslint.config.js
eslint.config.js
```
Both halves true. 01-21 is in this branch's ancestry (this plan edits `src/renderer/src/hooks/useHive.ts`, inside 01-21's wildcard).

## The ten-symbol relocation table (task 1, re-measured this session — every later task read this table, not the plan's own stale line numbers)

| Symbol | Where it actually was (this session) |
|---|---|
| `teardownPty` | `src/main/floor/boot.ts:334` — private closure over module state (moved to `lifecycle.ts` in task 5) |
| `finalizeWorkerWorktree` | `src/main/floor/boot.ts:273` — same (moved in task 5) |
| `finalizeAgentWorktree` | `src/main/floor/boot.ts:308` — same (moved in task 5) |
| `savePreservedWorktrees` | `src/main/floor/boot.ts:212` — stays boot.ts-owned; index.ts's own GC sweep calls it too, so it is injected into `AgentTeardownDeps` rather than moved |
| `syncKeepAwake` | `src/main/index.ts:456` (the real implementation, reads `powerSaveBlocker`); `FloorDeps.syncKeepAwake` is the injection point |
| `SHUTDOWN_STEPS` | `src/main/floor/boot.ts:1009` (02-02 already moved it there — no action needed) |
| `teardownAndQuit` | `src/main/index.ts:3033` — the ORIGINAL, wider version (`allowQuit=true; runShutdown('quit'); app.quit()`), used by `app:confirmClose`/`app:resetAll`/`closingTime`. This plan added a SEPARATE, narrower `Floor.teardownAndQuit()` (`shutdown()` + `deps.quit()`) for D-09's headless path — see "Why two teardownAndQuits" below |
| `new HiveManager(` | `src/main/floor/boot.ts:1069` (inside `bootFloor`) |
| `new DeliveryService(` | `src/main/floor/boot.ts:1121` (inside `bootFloor`) |
| `spawnAgentCore` | `src/main/index.ts:1680` — still in index.ts, ~480 lines, imports `electron` at module scope, unreachable by any test harness. STRUCT-01's "workers" seam remains unclosed |

## Why two `teardownAndQuit`s exist, and why that is correct

The plan's `<interfaces>` section reads "the non-interactive path already exists in the same file... call it, do not write a second teardown" — but the measured reality (D-01) is that `index.ts`'s local `teardownAndQuit()` does MORE than the floor-level shutdown: it also stops the ephemeral-worker watcher and the Slack/webhook tunnel servers (three steps that never lived in `bootstrapHiveServices` either, per `boot.ts`'s own `runShutdown`-successor comment). The plan's own acceptance criteria (`grep -c 'teardownAndQuit' src/main/floor/boot.ts` >= 1, joined `floor.teardownAndQuit(` in `index.ts` >= 1) are unambiguous that a NEW `Floor.teardownAndQuit()` method is wanted, distinct from the local function. Threat model row T-P02-03-02's own mitigation text confirms this is sufficient: `Floor.shutdown()`'s `SHUTDOWN_STEPS` already ends in `ptyManager.killAll()`, which is the ADR-0003 gate that actually matters for a headless quit's data-loss risk — the worker-watcher/tunnel-server steps `teardownAndQuit()` additionally runs are secondary services that terminate with the process regardless. Both functions now coexist: the local one for confirmed/reset paths (unchanged, still calls the wider `runShutdown`), the new `Floor` method for the headless deadlock path.

## B-markers-hive discrepancy (task 1, reported per D-01 rather than silently adopted)

Measured this session: `grep -c 'LIVE-UNVERIFIED' src/main/hive.ts` = **2**. 02-01's own SUMMARY recorded `B-markers-hive = 6`. This is NOT a regression: `git log --oneline -- src/main/hive.ts` shows 02-01's THIRD commit (`23f02c6`, "lift the per-provider installers into hiveProvisioning.ts") landed after that SUMMARY line was written, and it relocated 4 of the 6 markers out of `hive.ts` into the new `hiveProvisioning.ts`. Confirmed: `hive.ts`(2) + `hiveTemplates.ts`(2) + `hiveProvisioning.ts`(4) = **8**, matching 02-01's own "Sum: 8 — unchanged" PARITY-03 claim exactly. This plan's own edits to `hive.ts` (the `handoff` param, the rename, the bounce-subject rewrite) touch none of the two markers that remain there — confirmed unchanged before/after this plan's commits.

## Three RED runs (all reverted clean afterward, diff-confirmed byte-identical)

**RED 1 — the D-40 `ipcMain.handle` pin, both directions, `test/boot-floor.test.cjs`:**
- Renamed one channel (`window:newFloor` → `window:REDTEST`): the count pin (test 16) stayed green (a rename doesn't change the count) but the channel-name-list diff (test 17) went RED — `not ok 17`, printing the full diff.
- Deleted that same handler entirely: the count pin went RED too — `151 !== 152`.
- Restored, re-verified 19/19 green.

**RED 2 — the boot-grace half, `test/delivery-main.test.cjs`:**
Temporarily removed `noteSpawn`'s `this.bootGraceUntil.set(...)` line (leaving only the seed-enqueue half). The "does not deliver inside the grace" test failed: `2 !== 0` (two PTY writes landed — the typed seed plus its `\r` submit — where zero were expected). Restored, re-verified 39/39 green.

**RED 3 — the preserve case, `test/agent-lifecycle.test.cjs`:**
Inverted `finalizeWorkerWorktree`'s `if (work.keep)` to `if (!work.keep)`. Both worktree-preservation tests failed by the worktree GENUINELY DISAPPEARING from disk (`assert.equal(existsSync(wt), true)` → actual `false`) — the exact real data-loss class this test exists to catch, not merely an assertion mismatch. Restored, re-verified 8/8 green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `deps.ts`'s `send` doc comment went stale mid-rename**
- **Found during:** Task 3, immediately after renaming `HiveManager.emitTerminalHandoff` → `terminalHandoff`
- **Issue:** The plan's own acceptance criterion (`grep -rn 'emitTerminalHandoff' src/ test/ docs/ *.md` returns nothing) is repo-wide, and `src/main/floor/deps.ts`'s `send` field doc comment quoted the old method name as its motivating example for why `send` must return `boolean`, not `void` (D-03's landmine).
- **Fix:** Reworded to point at the callers that still genuinely depend on the boolean return (`index.ts`'s `HiveManager` emitter, `accountPool`'s emitter) and to name where terminal-handoff mail actually moved to.
- **Files modified:** `src/main/floor/deps.ts`.
- **Committed separately** in `373a836`, NOT folded into task 3's own commit — `deps.ts` is outside task 3's declared file list (`src/shared/queueDelivery.ts, src/main/hive.ts, src/main/floor/boot.ts, src/renderer/src/hooks/useHive.ts, test/hive-router.test.cjs, test/queue-delivery.test.cjs, test/boot-floor.test.cjs`), and the plan's containment check is per-commit range-bound against exactly that list. Verified this session: containment against the task-3-only commit range comes back clean once `373a836` is excluded (its own pathspec never touches any of task 3's files, so it is invisible to that check by construction).

**2. [Rule 1 - Bug] The `#34` shutdown-coverage test's offenders list needed the new `teardownPty` Floor field excluded**
- **Found during:** Task 5, immediately after adding `teardownPty` to the `Floor` interface/return object
- **Issue:** `test/boot-floor.test.cjs`'s `#34` coverage test flags any `Floor` field with no matching `SHUTDOWN_STEPS` entry as an "offender" — the exact class `shutdown`/`teardownAndQuit` were already exempted from. `teardownPty` is a per-PTY teardown METHOD, not a subsystem `bootFloor` starts and must stop; without the exclusion the test failed with `bootFloor started a subsystem with no matching shutdown step: teardownPty`.
- **Fix:** Added `key === 'teardownPty'` to the same exclusion the two prior methods already use.
- **Files modified:** `test/boot-floor.test.cjs`.
- **Committed separately** in `ff0c6ae`, for the identical containment reason as deviation #1 — `test/boot-floor.test.cjs` is outside task 5's declared file list (`src/main/floor/lifecycle.ts, src/main/floor/boot.ts, src/main/index.ts, test/agent-lifecycle.test.cjs`).

---

**Total deviations:** 2 auto-fixed (both Rule 1, both one-line stale-reference fixes triggered by an earlier task's rename/field-addition). **Impact on plan:** Both were load-bearing for the plan's OWN acceptance criteria (the repo-wide `emitTerminalHandoff` grep, the `#34` coverage test staying green) and both were deliberately isolated into their own commits rather than smuggled into a task's declared diff, so every task's containment check is genuinely clean. No scope creep beyond what the plan itself required.

## Issues Encountered

- **Containment-check methodology note, not a defect:** running task 3's or task 5's `git log --format=%H "$BASE"..HEAD -- <task files>` containment check with `$BASE` fixed at the WHOLE PLAN's B-sha (`5b598d9...`, as task 1 recorded it) surfaces files from OTHER tasks whenever two tasks share a file (`src/main/floor/boot.ts` is in every task's file list from task 2 onward). This is not a real violation — re-running the same check with `$BASE` set to the immediately-preceding task's own final commit (e.g. `b6095f9` for task 3, `ff0c6ae` for task 5) isolates exactly that task's own commits and comes back clean every time, as pasted in each task's work above. Recording this for 02-12, which owns the phase-wide containment sweep: the per-task containment bullets in this plan (and likely others) need `$BASE` re-derived per task, not inherited from task 1's single recorded value, once a file is shared across tasks.

## User Setup Required

None — no external service configuration required.

## Hand-offs to other plans (grep-able headings, per this plan's own `<output>` instruction)

### For 02-04 (owns `src/preload/index.ts` in wave 4)

`src/preload/index.ts:943-946`'s `onHiveTerminalHandoff` export and the `hive:terminalHandoff` channel it subscribes to are now orphaned — this plan's task 3 deleted the renderer's only caller (`useHive.ts`'s effect 2e). Not touched here per the plan's explicit instruction ("Two things this plan hands to other plans rather than reaching into their files").

### For 02-10 (owns `SettingsModal.tsx` in wave 8)

The Linux login-item UI sentence. Within this plan's ownership the source already tells a partial truth: `app:setLoginItem`'s handler comment states plainly that `setLoginItemSettings` is a no-op on Linux and the toggle visibly refuses to stick (`getLoginItemSettings().openAtLogin` always reads `false` there). The "stated in source, docs AND UI" bar (`02-VALIDATION.md:116`) is met in source + this SUMMARY; the UI sentence is 02-10's to add.

### For 02-12 (owns the phase-wide `test/repo-claims.test.cjs` sweep and containment methodology)

1. `test/main-hardening.test.cjs:3-8`'s header states the wrong reason `src/main/index.ts` cannot be loaded under `node --test` ("every guard used to be inline in a handler") — the REAL, measured reason (D-02) is that `index.ts` imports `electron` at module scope. Not this plan's file to edit.
2. `test/repo-claims.test.cjs:53`'s `stripComments` helper is the SAME naive block-comment regex this plan's own `JC` reader corrects for (a `//` line comment ending in `google/*` is read as an opening `/*`, swallowing 5,167 characters and one `ipcMain.handle(` registration — measured this session as 152 stripped vs. 153 raw). Any future STRUCT-01 pin in `repo-claims.test.cjs` asserting the raw `153` count would be asserting the WRONG number for a correct tree.
3. The containment-methodology note above (per-task `$BASE`, not the whole-plan B-sha).

## D-08, stated as a real cost (RESEARCH's own number, not re-measured this session)

Windowless Electron in ONE process — no second daemon binary, no plain-Node fork, because `safeStorage` (`integrations.ts:19`) has no plain-Node equivalent. `02-RESEARCH.md`'s own figure: **~290 MB resident is the accepted, stated cost** of that one-process design. No sentence anywhere in this plan's source or tests calls headless mode free.

## Four limitations, written down rather than ticked (per the plan's own `<output>` instruction)

1. **Criterion 2's "or with the window quit" holds only for a `--headless`-started floor.** A normally-started floor keeps today's quit-on-last-window-close (`shouldQuitOnLastWindowClose`'s own header states this deliberately — no tray affordance ships in this phase, and a windowless, iconless process with no way back in is a worse failure than a quit). Stated in `src/main/floor/headless.ts`'s own header, not only here.
2. **A Crush god still seeds from the renderer's ordered boot chain.** Only the WORKER path (`useHive.ts` effect 3b) moved to `noteSpawn`'s `seed` param. `index.ts`'s spawn call site explicitly excludes the god (`!opts.hive?.isGod`) with the reason in its own comment: enqueuing would both duplicate the write and invert the chain's required order.
3. **`useHive.ts:1196`'s `onClaudeAccountResumed` nudge is still a renderer-side automatic PTY write.** Measured this session: `submitToPty(` call sites in `useHive.ts` went from 6 to 5 (the seed timer died; the function definition, the three-step god boot chain, and this nudge survive). ADR-0001's new Exceptions section names it explicitly rather than rounding the renderer's automatic writers to zero.
4. **DAEMON-01's live headless run was NOT performed this session.** Attempting a real `--headless` launch, visual confirmation that no window appears, a second launch re-attaching a window, and a live-PTY quit all require an interactive Electron GUI session and a way to visually confirm window state — neither is available to this executor (Bash-only tool access, no screenshot/GUI-automation tool in this session). `02-VALIDATION.md`'s own Manual-Only Verifications table is explicit: "Not a pass. Criterion 2 explicitly asks for both the `node --test` case and a live run." Recorded as **not run**, never described as completion.

## MEASUREMENT UNAVAILABLE — items this session could not produce a number for

- **The live headless run itself** (launch `--headless`, confirm no window, relaunch to re-attach, quit with a live PTY) — needs an interactive Electron GUI session; not available to this executor.
- **`npm run e2e` (Playwright)** — Linux/xvfb-only per the plan's own guidance; not run on this Windows executor, matching 02-02's own precedent.
- **Cross-platform CI rows** (`Typecheck`, `Test (ubuntu/windows/macos-latest)`, `Build`, `Electron smoke`) — read off a draft PR's checks; no PR was pushed in this session.

## Next Phase Readiness

- `src/main/floor/headless.ts` and `src/main/floor/lifecycle.ts` are both new, tested, electron-free modules under `src/main/floor/**`, following the exact discipline `boot.ts`/`deps.ts` established in 02-02.
- `Floor.teardownAndQuit()` and `Floor.teardownPty(id)` are both independently callable with no Electron binary — the same seam DAEMON-01's remaining live-run verification needs.
- **DAEMON-01 is NOT marked complete in REQUIREMENTS.md.** All four of its unit/composed-test rows in `02-VALIDATION.md`'s table are now green (the D-09 quit deadlock, both D-11 mail gaps, `window-all-closed`'s headless policy), but its one Manual-Only Verification row (a real Electron process, real PTYs, real agent CLIs, with no window) was not run this session and is explicitly not satisfied by unit evidence alone per that same document. Left `[ ]` in REQUIREMENTS.md.
- **STRUCT-01 is NOT marked complete in REQUIREMENTS.md.** This plan closes the "agent lifecycle" seam (the fifth of five STRUCT-01 names: agent lifecycle, shutdown, scheduler, workers, IPC). 02-02 closed "shutdown"/"scheduler" (construction). "workers" (the ephemeral-worker spawn-request watcher, ~150 lines, still index.ts-owned, coupled to `spawnAgentCore`) and "IPC" (the ~152 `ipcMain.handle` registrations, all still in `index.ts`) remain fully unsplit. Left `[ ]` in REQUIREMENTS.md accordingly.
- Every plan named in `<output>`'s hand-off list (02-04, 02-10, 02-12) has a grep-able heading above to find its item.

---
*Phase: 02-the-daemon-and-the-protocol*
*Completed: 2026-08-23*

## Self-Check: PASSED

All created files verified present (`src/main/floor/headless.ts`,
`src/main/floor/lifecycle.ts`, `test/agent-lifecycle.test.cjs`, this
SUMMARY.md). All 7 commits verified present in `git log` (`1e787f7`,
`b6095f9`, `373a836`, `c420f60`, `172a5f8`, `ff0c6ae`, `1118e3b`).
