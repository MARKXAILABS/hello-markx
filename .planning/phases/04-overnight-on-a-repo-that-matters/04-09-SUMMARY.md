---
phase: 04-overnight-on-a-repo-that-matters
plan: 09
subsystem: infra
tags: [git, restore-points, sqlite, retention, shadow-git-dir, worktree, win32]

# Dependency graph
requires:
  - phase: 04-02
    provides: "the `events` table, `appendEvent`/`eventsBetween`/`pruneEvents`, and an EXPORTED `EVENT_RETENTION_MS` this plan imports rather than re-declares"
provides:
  - "`RestorePoints` — snapshot/restore/prune over a separate GIT_DIR aimed at the operator's work tree, electron-free"
  - "one shadow store per operator repo, keyed by sha256(realpathSync.native(repoRoot))"
  - "the L-06 nested-repo guard: `<store>/info/exclude`, regenerated before every `add -A`"
  - "the L-07 single-writer discipline, copied from gitCommitter for a different repo"
  - "`restorePointTimer` in boot.ts's module `let` block, armed at 15 min, torn down through the ONE shutdown list, pinned BY NAME in test/boot-floor.test.cjs"
  - "the shadow store excluded from the hive repo twice: UNTRACK_PATHS + the ignore seed"
  - "`hive.setEventStore()` — RECORD-02's mirror seam, structurally typed so hive.ts still has zero db.ts imports"
  - "`pruneEventsIfDue()` — retention at boot and once a day, off the restore-point beat"
affects: [04-11 (adds watchdogTimer to the same two boot.ts regions — this is its precedent), 04-06 (owes the `restore` literal in rootTailVerdict), SCALE-03, SCALE-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "shadow GIT_DIR over a foreign work tree: read a repo's whole tree into a store that shares none of its state"
    - "restore points as ROOT commits under their own refs, so pruning old ones cannot orphan newer ones"
    - "by-NAME timer pinning for boot-internal `let`s the Floor-field offender loop cannot see"

key-files:
  created:
    - src/main/restorePoints.ts
    - test/restore-points.test.cjs
  modified:
    - src/main/gitCommitter.ts
    - src/main/hive.ts
    - src/main/floor/boot.ts
    - test/boot-floor.test.cjs
    - test/record-retention.test.cjs
    - test/agent-lifecycle.test.cjs

key-decisions:
  - "D-20's mechanism is the separate GIT_DIR alone; no index env var is set anywhere, and the module is grepped to keep it that way (Pitfall 7)"
  - "Restore points are ROOT commits under refs/restore/<iso>, not a commit chain — research's 'update-ref to an older commit' prune keeps the OLDEST and drops the NEWEST, which is backwards for retention"
  - "The store is named `restore`, never `backups` (D-21) — reflect.ts owns `hive/backups/` and prunes it on KEEP_BACKUPS"
  - "realpathSync.native is load-bearing for a SECOND reason planner decision 5 did not name: os.tmpdir() returns 8.3 short paths on Windows while git returns long ones"
  - "EVENT_RETENTION_MS is imported from db.ts, not re-declared — a second copy is how the window becomes 30 days in one file and something else in the other"
  - "The events mirror runs AFTER the JSONL write and outside its try, so a store failure cannot reach the log"

patterns-established:
  - "Prove a guard is load-bearing by disabling it and reproducing the documented failure, rather than trusting a green test"
  - "Replace a fixed sleep with a bounded condition poll wherever the awaited thing has an observable completion signal"

requirements-completed: [RECORD-05, RECORD-02]

# Metrics
duration: 52min
completed: 2026-08-25
---

# Phase 04 Plan 09: Restore Points and the Event Mirror Summary

**A snapshot/restore runner over a shadow `GIT_DIR` that leaves the operator's index, work tree, branches, `status` and `log` byte-identical while putting one file back, plus `appendLog`'s best-effort mirror into SQLite so a day past 16 MiB still reads back from its first row.**

## Performance

- **Duration:** ~52 min
- **Started:** 2026-08-25T14:18Z
- **Completed:** 2026-08-25T15:10Z
- **Tasks:** 3 of 3
- **Files modified:** 7 (2 created, 5 modified)

## Commits

| Commit | Type | What |
|--------|------|------|
| `1f4b0a5` | test | **RED gate 1** — restore-points test, no runner (1 fail, 0 pass) |
| `ce44bda` | feat | **GREEN gate 1** — `restorePoints.ts` (10 pass, 0 fail) |
| `01460f0` | feat | `repoRootOf` + the 8.3 short-path finding (11 pass, 0 fail) |
| `a8aa6e6` | feat | UNTRACK_PATHS, ignore seed, timer, by-name pin |
| `3c336bf` | test | **RED gate 2** — `hive.setEventStore` is not a function (3 fail, 4 pass) |
| `7b3a8d8` | fix | a fixed 500 ms sleep was a race, not a wait |
| `feeecd6` | feat | **GREEN gate 2** — the events mirror (7 pass, 0 fail) |

## TDD Gate Compliance

Both gate sequences are complete and in order: `test(...)` RED → `feat(...)` GREEN, twice (`1f4b0a5`→`ce44bda`, `3c336bf`→`feeecd6`). No REFACTOR commit was needed — neither implementation had cleanup worth a third gate.

**The RED runs, as required:**

- **Task 1 RED:** `node --test test/restore-points.test.cjs` → `ENOENT … src\main\restorePoints.ts`. **1 fail, 0 pass.**
- **Task 3 RED:** `node --test test/record-retention.test.cjs` → **3 fail, 4 pass.** The three new cases failed on `hive.setEventStore is not a function`; the four pre-existing `appendEvent`-driven cases stayed green, which is the control that says the RED is about the mirror and not about the table.

## Accomplishments

### Task 1 — `restorePoints.ts`

`git --git-dir=<store> --work-tree=<operator repo>` with all five measured `-c` overrides (plus `commit.gpgsign=false`). One store per repo at `<hive>/restore/<sha256(realpath)[0:16]>.git`, with the real repo path in `<store>/description` so a directory of hashes is legible.

**The nested-repo guard was proven load-bearing, not assumed.** I disabled `findNestedGitDirs` and re-ran the case; `add -A` failed with L-06's exact measured text — `error: '.claude/worktrees/agent-x/' does not have a commit checked out` — and the test went red (0 pass, 1 fail). Restored, it is green. The test also asserts no `160000` gitlink was recorded, which is L-06's quieter half.

**Pruning is not what the research measured.** RESEARCH § Pattern 6 recorded "pruning by `update-ref` to an older commit: 3 commits → 2 reachable". That keeps the **oldest** and drops the **newest**, which is backwards for a retention window: in a commit chain the old snapshots are ancestors of the new ones, so dropping them requires a history rewrite. Each restore point is therefore a **root commit** (`write-tree` + `commit-tree` with no parent) under its own `refs/restore/<iso>` ref. Pruning is `update-ref -d` + a plain `gc`; dedup is unaffected because git is content-addressed. `refs/restore/<iso>` sorts lexicographically *and* chronologically, so `listPoints` and `prune` never read an object to learn a timestamp.

`snapshot()` returns `null` when the tree is unchanged — an idle floor would otherwise fill the store with empty points and push the real ones out of the window.

### Task 2 — wiring

The store is kept out of the hive repo **twice**, because either half alone leaks: `UNTRACK_PATHS` actively `git rm --cached`es a store git already tracks, and the ignore seed keeps new copies out. Both carry a comment naming D-21 and the `reflect.ts` collision.

`restorePointTimer` is declared beside `fleetTimer`, armed clear-then-set in `bootFloor`, `unref`'d, and torn down through `SHUTDOWN_STEPS` — with the step also calling `restorePoints?.stop()` so the runner's own debounce timers go too. `test/boot-floor.test.cjs` pins all three by name.

`restorePointBeat` resolves each agent cwd to its repo top level and de-duplicates: three agents in one repo cost one snapshot.

### Task 3 — the mirror

`setEventStore(store | null)`, structurally typed. `hive.ts` still has **zero** `./db` imports, so every `HiveManager` in every test stays loadable without SQLite. The mirror runs after the `appendFileSync` and outside its `try`, with its own catch.

The `>16 MiB` case drives the **real** `appendLog` and asserts both halves: the JSONL has already lost `FIRST_MARKER` to two rotate windows (asserted absent from *both* `log.jsonl` and `log.jsonl.1`) while `eventsBetween(dayStart, dayEnd)[0]` still carries it. That contrast is the assertion that distinguishes this from the rotate it replaces.

## Measured Regions (re-measured at wave start)

Every coordinate in the plan is a wave-0 figure and 04-03 edited `boot.ts` in wave 1, so all four regions were re-measured before editing:

| Region | Plan said | Measured at wave start |
|---|---|---|
| `UNTRACK_PATHS` | `gitCommitter.ts:82` | **`:82`** — unchanged |
| ignore-seed `want` array | `hive.ts:782-796`, `'backups/'` at `:787` | **`:845-857`**, `'backups/'` at **`:851`** |
| `LOG_ROTATE_BYTES` | `hive.ts:323` | **`:342`** |
| `appendLog` | `hive.ts:2485-2509` | **`:2686`** |
| `fleetTimer` / `breakerBeatTimer` | `boot.ts:155` / `:156` | **`:157`** / **`:158`** |
| `SHUTDOWN_STEPS` | `boot.ts:928-956` | **`:929`** |
| `gitCommitter` `STALE_LOCK_MS` | `:78` (PATTERNS) vs `:79` (RESEARCH) | **`:78`** — PATTERNS was right |

## Acceptance Criteria — measured

| Criterion | Result |
|---|---|
| `node --test test/restore-points.test.cjs`, ≥ 5 cases | **11 pass, 0 fail** |
| `grep -c 'GIT_INDEX_FILE' src/main/restorePoints.ts` | **0** |
| `grep -c "from 'electron'" src/main/restorePoints.ts` | **0** |
| `grep -c 'info/exclude' src/main/restorePoints.ts` | **1** |
| `grep -c 'realpathSync.native'` / bare `realpathSync(` | **3** / **0** |
| `awk UNTRACK_PATHS \| grep -c "'restore'"` | **1** (HEAD was 0) |
| `awk UNTRACK_PATHS \| grep -oE "'[^']+'" \| wc -l` | **5** (HEAD was 4 — additive, not a replacement) |
| `awk want-array \| grep -c 'restore/'`, `'backups/'` still present | **1**, **yes** |
| `grep -c 'restorePointTimer' src/main/floor/boot.ts` (≥ 3) | **7** |
| `awk appendLog \| grep -c 'appendEvent'` / `'appendFileSync'` | **1** / **1** |
| `grep -c "from './db'\|require('./db')" src/main/hive.ts` | **0** |
| `grep -c 'appendFileSync' src/main/hive.ts` vs base | **3** vs **3** — unchanged |
| `LOG_ROTATE_BYTES` value | **`8 * 1024 * 1024`** — unchanged, still 2 occurrences |
| `grep -c 'new HookServer(' src/main/floor/boot.ts` | **1** — 04-20's region untouched |
| `git diff boot.ts` touches `DeliveryService` dep literal | **0 lines** — 04-03's region untouched |
| `npm run typecheck` | **0 errors** |
| `npm run lint` | **exit 0** |
| `npm test` | **900 tests, 893 pass, 0 fail, 7 skipped** |

**Test-count delta:** 885 → 900 (**+15**): +12 in `restore-points.test.cjs`... corrected: +11 `restore-points`, +1 `boot-floor`, +3 `record-retention`. Skipped is **7**, delta **0** — this plan adds no platform gate and no `skip:`.

**Diff confinement.** `hive.ts` has 4 hunks: one at `:852` (the ignore seed) and three inside `appendLog`'s own region. Its single deleted line is the in-place rewrite of `const line = …` into `row`/`payload`/`line`. `boot.ts`'s single deleted line is the `PersistStore` import gaining `EVENT_RETENTION_MS`. There are no other deletions in either file.

## The Policy Numbers — all three `[ASSUMED]`

Stated as assumptions, marked `[ASSUMED]` at each declaration, and each pinned by a test so a drift is red rather than silent. **None of these was measured; do not read them as findings.**

| Number | Value | Where |
|---|---|---|
| Snapshot cadence | **15 min** | `SNAPSHOT_CADENCE_MS`, restorePoints.ts |
| Snapshot retention | **48 h** | `SNAPSHOT_RETENTION_MS`, restorePoints.ts |
| Events retention | **30 days** | `EVENT_RETENTION_MS`, **imported from db.ts** |

On the third: the plan said to decide it here rather than inherit it. 04-02 had already **exported and test-pinned** it, and the environment brief was explicit — import it, do not redefine it. Re-declaring it in `boot.ts` would have created a second copy of a number whose whole point is being stated once. So the *policy act* this plan performs is calling `pruneEvents` for the first time and scheduling it; the *number* stays in one place. It is still `[ASSUMED]` and still one `DELETE FROM events WHERE ts < ?` from changing.

## Deviations from Plan

### 1. [Rule 2 — missing critical functionality] `repoRootOf` was not in the plan and the mitigation needs it

**Found during:** Task 2, wiring the beat.
**Issue:** The beat holds agent `cwd`s, which are usually subdirectories. Snapshotting one directly is wrong in the expensive direction: with `--work-tree=<subdir>` git treats the subdirectory as the top level and **never reads the repo root's `.gitignore`**, so T-04-SNAP-05's mitigation ("a gitignored `build/` contributes 0 entries") silently stops holding and the store fills with `node_modules`.
**Fix:** `repoRootOf(cwd)` via `rev-parse --show-toplevel` (read-only; does not touch the operator's index), plus a test case.
**Files:** `src/main/restorePoints.ts`, `test/restore-points.test.cjs`. **Commit:** `01460f0`.

### 2. [Rule 1 — bug] A fixed 500 ms sleep in `agent-lifecycle.test.cjs` fired under this plan's load

**Found during:** Task 3's first full `npm test`.
**Issue:** `teardownPty with a live worktree and a WorkerRec…` failed on `savePreservedWorktrees === 1`, then passed on re-run. Not luck: the case slept a flat 500 ms for `finalizeWorkerWorktree`, which `teardownPty` runs **un-awaited** and which shells real git. `npm test` runs test files in parallel, so 500 ms is however long git takes at the busiest moment of the busiest file — and this plan adds `restore-points.test.cjs`, which drives real git hard enough to be that file.
**Why this is not "modify a test so a buggy source passes":** the source path is correct and untouched. `teardownPty` and `finalizeWorkerWorktree` are unchanged, and nothing in this plan runs in that path (the case builds its deps with `fakeDeps`, never `bootFloor`). The defect is in the test's *wait*.
**Fix:** a bounded `waitFor(cond)` poll on the observable completion signal, replacing the sleep. Fast when idle, correct when busy, bounded at 15 s so a genuinely broken path fails rather than hangs, and the caller's own assertion still reports the failure. The file's second flat sleep (`:269`) is deliberately left alone — it gives the async path a chance to *misbehave* before asserting the worktree survived, which has no completion signal to poll.
**Verification:** 3 consecutive full `npm test` runs, 0 fail each.
**Files:** `test/agent-lifecycle.test.cjs`. **Commit:** `7b3a8d8`.

### 3. [Design correction] Restore points are root commits, not a chain

Described under Task 1 above. Following the research's measured prune shape literally would have shipped a retention window that deletes the newest snapshots and keeps the oldest.

## Findings Worth Carrying Forward

**`realpathSync.native` is load-bearing for a second reason planner decision 5 did not name.** Measured on this machine: `os.tmpdir()` returns the **8.3 short form** (`C:\Users\ALIENW~1\…`) while `git rev-parse --show-toplevel` returns the **long form** (`C:/Users/Alienware/…`). Plain `realpathSync` leaves `ALIENW~1` alone; only `.native` expands it. Since `repoRootOf` hands over git's long form while the registry holds whatever the OS gave it, **without `.native` the store would split on every Windows floor** — not merely on a mis-typed drive letter, which is the only case D-20 and planner decision 5 anticipated. The two-spellings test now snapshots through all three spellings and asserts one store.

## Threat Model — dispositions

| Threat | Status |
|---|---|
| T-04-SNAP-01 (disturbing the operator's five) | **Mitigated.** D-22's five-part assertion runs as one sequence. The sequence is built so `status --porcelain` output is *genuinely* identical at every step (all three files stay modified relative to HEAD throughout), rather than comparing two empty strings. Also asserts nothing named `restore*` appears in the operator's `.git/`. |
| T-04-SNAP-02 (restore path escaping) | **Mitigated.** `safeJoin` before anything spawns; three traversal shapes refused, with a legitimate restore as the paired positive control. |
| T-04-SNAP-03 (nested repo) | **Mitigated, and proven load-bearing by disabling the guard.** |
| T-04-SNAP-04 (concurrent writers) | **Mitigated.** Per-store `snapshotting` flag; the overlapping-snapshot case asserts no `index.lock` text was logged, with a positive lower bound so a total no-op cannot pass. |
| T-04-SNAP-05 (fat directory) | **Mitigated**, and the two mechanisms are kept distinct as the plan required: `.gitignore` keeps fat paths out of a snapshot (own test case), `UNTRACK_PATHS` + ignore seed keep the store out of the hive repo (own scoped criteria). `repoRootOf` exists because the first mechanism silently breaks without it. |
| T-04-SNAP-06 (over-pruning) | **Mitigated.** The newest point always survives, a failed ref-delete stops the prune, never `gc --prune=now`. Two test cases. |
| T-04-SNAP-07 (store in the hive repo) | **Mitigated** twice over. |
| T-04-SNAP-09 (split history) | **Mitigated**, and strengthened — see Findings. |
| T-04-LOG-07 (mirror as a PII route) | **Mitigated.** The mirror carries exactly what `appendLog` already writes, verbatim; the doc block says so next to the `appendCostLedger` rule it must not become a route around. |
| T-04-LOG-08 (failing store) | **Mitigated.** Three shapes tested: real closed store, throwing store, no store. |
| T-04-SC (supply chain) | **Mitigated.** No dependency added; `package.json`/`package-lock.json` untouched (D-36). |
| **T-04-SNAP-08 (the store is not protected)** | ⚠️ **NOT CONFIRMED — see below.** |

## ⚠️ Open — T-04-SNAP-08 is unconfirmed, and the plan says that is a stop-and-report

The plan requires this SUMMARY to state whether plan 04-06's `restore` literal landed in `rootTailVerdict`. **Measured at my base commit `99b61fc`: `grep -c "'restore'" src/main/hooks.ts` returns `0`.** `hiveIdentities` still compares against exactly four literals — `bin`, `.git`, the socket name, `agents`.

**I cannot confirm either way from here.** 04-06 is a wave-2 sibling and its work is in a different worktree that this agent cannot see; my base predates it. So this is a genuine unknown, not a negative result.

**What it means if 04-06 did not land it:** `rootTailVerdict` returns `{ deny: null }` for anything that is not one of the four literals, so `<harnessHome>/hive/restore/**` is readable and `rm -rf`-able by any agent. Agents working in repo X could read repo Y's snapshots — this plan explicitly supports several repos per floor — and an agent could delete the recovery data whose entire purpose is recovering from what it just did.

**Required before this phase closes:** verify at the merged wave-2 head that `rootTailVerdict` names `restore` as a fifth literal. If it does not, the store ships unprotected and the plan is explicit that this is a stop-and-report, not a footnote.

## Known Stubs

None. Every path this plan added is wired end to end and driven by a test against real git or a real SQLite file.

## Threat Flags

None. No new network endpoint, auth path or schema change was introduced — the `events` schema is 04-02's and is unchanged here.

## Ceilings

- **Nested-repo scan is bounded** at depth 6 / 4,000 directories, skipping `node_modules`, `.git`, `dist`, `out`, `build`, `.cache`. A nested repo past those bounds is not excluded, which degrades to L-06's **loud** failure (exit 128, logged) rather than to a silent hollow gitlink — the safe direction, but it does mean a deeply-buried worktree stops that repo's restore points until someone reads the log.
- **`synchronous = NORMAL` still applies to the mirror** (`db.ts`). A mirrored row survives a process crash but is not guaranteed against OS/power loss until the next WAL checkpoint. The JSONL is the belt for exactly this; nothing here upgrades the pragma.
- **Snapshot cadence is a wall-clock interval, not activity-driven.** `RestorePoints.schedule()` exists with a trailing debounce, but nothing calls it yet — the beat is purely periodic. A burst of agent work between two ticks is captured at the next tick, not at the burst.
- **The prune runs per repo inside the beat**, so a floor with many operator repos does its snapshot and prune work sequentially on one tick. Deliberate (see the beat's comment) but it does mean beat duration scales with repo count.

## Self-Check

Verified with the Bash tool at the commits recorded above.

**Files:**
- `src/main/restorePoints.ts` — FOUND
- `test/restore-points.test.cjs` — FOUND
- `src/main/gitCommitter.ts`, `src/main/hive.ts`, `src/main/floor/boot.ts` — FOUND, modified
- `test/boot-floor.test.cjs`, `test/record-retention.test.cjs`, `test/agent-lifecycle.test.cjs` — FOUND, modified

**Commits:** `1f4b0a5`, `ce44bda`, `01460f0`, `a8aa6e6`, `3c336bf`, `7b3a8d8`, `feeecd6` — all present in `git log 99b61fc..HEAD`.

**Gates:** `npm run typecheck` 0 errors · `npm run lint` exit 0 · `npm test` 900/893/0 fail/7 skipped, three consecutive runs.

## Self-Check: PASSED

One item is deliberately carried forward rather than claimed: **T-04-SNAP-08 is unconfirmed** and is recorded above as a stop-and-report for phase close, not as a mitigated threat.
