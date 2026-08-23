---
phase: 02-the-daemon-and-the-protocol
plan: 02
subsystem: infra
tags: [electron, node-test, composition-root, dependency-injection, structural-refactor]

requires:
  - phase: 02-the-daemon-and-the-protocol
    provides: "plan 02-01's hive.ts split (hiveTemplates.ts, gitCommitter.ts, hiveProvisioning.ts) — this plan builds bootFloor on top of that seam"
provides:
  - "src/main/floor/deps.ts — FloorDeps, the Electron injection contract bootFloor requires"
  - "src/main/floor/boot.ts — bootFloor(deps): Promise<Floor>, the composition root with zero module-scope side effects"
  - "test/boot-floor.test.cjs — the gate: a real floor booted and torn down with no Electron binary"
  - "a real Node.js race-condition fix in IntegrationBroker/TelemetryCollector's start()/stop() (server assigned before listen(), not inside its async callback)"
affects: [02-03, 02-04, 02-05, 02-06]

tech-stack:
  added: []
  patterns:
    - "Composition root as an injected function (bootFloor(deps)) instead of module-scope construction, so a boot test can drive it with no Electron binary"
    - "Module state as bare `let` declarations (no initializer) at the top of the file, assigned inside the constructor function — passes a 'no module-scope construction' grep while giving every boot a fresh Map/timer set instead of leaking the previous boot's"
    - "Split construction from re-invocable startup: bootFloor constructs once; startHiveServices() is separately exported so config:update/config:changeHome can re-arm the SAME already-built subsystems without leaking the old ones' sockets/timers"

key-files:
  created:
    - src/main/floor/deps.ts
    - src/main/floor/boot.ts
    - test/boot-floor.test.cjs
  modified:
    - src/main/index.ts
    - src/main/integrationBroker.ts
    - src/main/telemetry.ts
    - test/repo-claims.test.cjs
    - test/engine-parity.test.cjs
    - test/hive-durability.test.cjs
    - test/hive-task-mutation.test.cjs
    - test/telemetry-auth.test.cjs

key-decisions:
  - "01-21's lint-gate precondition was verified against HEAD's own ancestry (git merge-base --is-ancestor, plus confirming ci.yml's hard `run: npm run lint` step), not literal `main:eslint.config.js` — this project's milestone branching strategy keeps `main` 203 commits behind the whole time a milestone is in flight, so the plan's literal check would report ABSENT even though the lint gate has been live and enforced on this branch since commit e183a93"
  - "FloorDeps grew two fields beyond the plan's named 7 (focus, syncKeepAwake) plus two more discovered necessary during extraction (respawnCore, startWorkerWatcher) — all four route Electron/spawnAgentCore-coupled behavior that stays index.ts-owned back into code that moved into boot.ts, each documented in deps.ts with why it exists and what degrades without it"
  - "bootstrapHiveServices() was called from three places, not just whenReady (config:update on the onboarding null->set transition, config:changeHome's failure-recovery path) -- both against the ALREADY-CONSTRUCTED floor. bootFloor's tail was split into a separately-exported startHiveServices() so re-invocation re-arms the existing subsystems instead of bootFloor reconstructing everything (and leaking the old hookServer/telemetry HTTP listeners + their timers) on every re-arm"
  - "AgentSpawnOptions is structurally duplicated in index.ts and boot.ts rather than imported across, avoiding a type-only circular import between the two files -- TypeScript's structural typing makes the two declarations interchangeable at every call site"
  - "SHUTDOWN_STEPS now clears fleetTimer/breakerBeatTimer, which the ORIGINAL index.ts SHUTDOWN_STEPS never did either -- a real, pre-existing gap RESEARCH called out and this plan's boot test caught directly (the explicit shutdown test hung before this fix)"

patterns-established:
  - "A file under src/main/floor/** may construct freely INSIDE its composition-root function; the repo-claims regex that forbids module-scope `new X()` is written CRLF-safe (`\\r?`) because this tree has no .gitattributes and readStripped never normalizes newlines"

requirements-completed: [STRUCT-01]

duration: ~70min
completed: 2026-08-23
---

# Phase 02 Plan 02: Move index.ts's composition root into bootFloor(deps) Summary

**`src/main/index.ts`'s ~950-line singleton-construction prelude plus `bootstrapHiveServices()`'s startup tail now live in `src/main/floor/boot.ts`'s `bootFloor(deps): Promise<Floor>`, callable and torn down with zero Electron binary — `test/boot-floor.test.cjs` boots a real hive (real git repo, real socket, real SQLite) and proves it.**

## Performance

- **Duration:** ~70 min
- **Completed:** 2026-08-23
- **Tasks:** 3 (deps.ts contract, boot.ts extraction, boot-floor.test.cjs + repo-claims clauses)
- **Files modified:** 11 (3 created, 8 modified)

## Accomplishments

- `src/main/floor/deps.ts` — the `FloorDeps` interface, zero electron imports, `send` typed to return `boolean` (not `void`), with the D-11 landmine documented inline so a future reader doesn't "fix" it back to the house `void` convention.
- `src/main/floor/boot.ts` — `bootFloor(deps)` constructs all 13 hive-bound subsystems (hive, delivery, control, telemetry, breaker, accountPool, hookServer, memory, reflector, persist, ptyManager, integrationBroker, roster) *inside* the function; zero `new X()`, `app.on(`, `process.on(` or `initFileLogging()` at module scope. `Floor.shutdown()` is `SHUTDOWN_STEPS`' exact inverse for everything `bootFloor` started.
- `test/boot-floor.test.cjs` — 7 tests, all green, `EXIT=0` under `timeout 60`: a real git-backed hive root, `routeOnce()` draining a hand-written outbox file into a recipient's inbox and archiving the source, an accepted connection to the real hook socket, `persist.open()` against a tmpdir SQLite file, a mechanically-derived #34 shutdown-coverage check, a no-outbound-tunnel structural check, and the explicit shutdown-refuses-a-second-connection case.
- Two `repo-claims.test.cjs` clauses pin the module-scope discipline (CRLF-safe, driven RED three ways and reverted) and the fact that `index.ts` calls `bootFloor(` and no longer declares `SHUTDOWN_STEPS`.
- A real, pre-existing race condition found and fixed in `IntegrationBroker.start()`/`TelemetryCollector`'s `listen()`: both only assigned `this.server` inside the async `'listening'` callback, so a `stop()` racing ahead of an in-flight bind (exactly what booting-then-immediately-shutting-down in a test does) silently leaked the real listening socket forever — a `node --test` hang, not just a leak.

## Task Commits

1. **Task 1: FloorDeps contract** — `8fd4ec3` (feat)
2. **Task 2: move the composition root into bootFloor(deps)** — `a30bc18` (feat)
3. **[Rule 1 auto-fix] IntegrationBroker/TelemetryCollector race condition** — `cdcf315` (fix)
4. **Task 3: boot-floor.test.cjs + repo-claims clauses** — `1900443` (test)

_No separate plan-metadata commit was requested by the harness this run; STATE.md/ROADMAP.md/REQUIREMENTS.md updates are captured in the final docs commit below._

## Files Created/Modified

- `src/main/floor/deps.ts` — the `FloorDeps` injection contract (11 fields: the plan's 7 plus `focus`/`syncKeepAwake`/`respawnCore`/`startWorkerWatcher`, each documented).
- `src/main/floor/boot.ts` (new, 1282 lines) — `bootFloor`, `Floor`, `startHiveServices`, `SHUTDOWN_STEPS`/`shutdown`, and every helper function the singleton graph needs (`teardownPty`, `respawnOnAccount`, `runBreakerBeat`, `armAlwaysOnBeats`, the mission/context-trigger scheduler, the webhook-done observer, etc.).
- `src/main/index.ts` (5877 → 4454 lines) — the moved block removed; `electronDeps()` factory added; `whenReady`'s hive-bootstrap body is now `void bootFloor(electronDeps())`; `runShutdown` is a 2-step thin wrapper (`floorShutdown()` + the 3 steps that never lived in `bootstrapHiveServices` either: Slack/webhook-tunnel stop, ephemeral-worker-watcher stop); `config:update`/`config:changeHome` now call the re-invocable `startHiveServices()`.
- `src/main/integrationBroker.ts`, `src/main/telemetry.ts` — the race-condition fix (assign `this.server` before `.listen()`, not inside its callback).
- `test/boot-floor.test.cjs` (new) — the gate.
- `test/repo-claims.test.cjs` — two new clauses (module-scope discipline under `src/main/floor/**`; `index.ts` calls `bootFloor(`/no longer owns `SHUTDOWN_STEPS`).
- `test/engine-parity.test.cjs`, `test/hive-durability.test.cjs`, `test/hive-task-mutation.test.cjs`, `test/telemetry-auth.test.cjs` — 5 pre-existing source-text pins re-pointed at `src/main/floor/boot.ts` (the wiring they assert on moved verbatim; the assertions and their direction are unchanged).

## D-01 baselines (re-measured this session at HEAD `59bd5f6`, ROADMAP's `5,620`/`~157` are stale and were not used)

```
$ wc -l src/main/index.ts                                                       -> 5877  (B-index-lines)
$ grep -c 'ipcMain.handle(' src/main/index.ts                                   -> 153  (B-ipc)
$ grep -cE '^let |^var ' src/main/index.ts                                      -> 36   (B-globals)
$ grep -cE '^(export )?(const|let|var) [A-Za-z_$][A-Za-z0-9_$]* *(:[^=]*)? *= *new ' src/main/index.ts -> 30  (B-constructions)
$ grep -c '^// ─' src/main/index.ts                                             -> 53   (B-banners)
$ node --test --test-reporter=tap test/repo-claims.test.cjs 2>&1 | grep -E '^# (tests|pass|fail|skipped) '
# tests 25 / # pass 25 / # fail 0 / # skipped 0                                          (B-claims)
$ node --test --test-reporter=tap test/*.test.cjs 2>&1 | grep -E '^# (tests|pass|fail|skipped) '; echo EXIT=${PIPESTATUS[0]}
# tests 642 / # pass 635 / # fail 0 / # skipped 7 / EXIT=0                                (B-suite)
```

## 01-21 precondition

The plan's literal check (`git cat-file -e main:eslint.config.js`) reports `fatal: path 'eslint.config.js' exists on disk, but not in 'main'` — i.e. `01-21 ABSENT ON main`. This is a false negative specific to this project's `git.branching_strategy: "milestone"` config: the whole v1.0 milestone (all of Phase 1's 31 plans plus Phase 2) develops on `gsd/v1.0-floor-closure` and `main` is not fast-forwarded until the milestone closes — `git rev-list --count HEAD..main` is `0` (main is a strict ancestor of HEAD, 203 commits behind, not diverged). Verified instead via the reference this branch actually builds on:

```
$ git merge-base --is-ancestor e183a93 HEAD && echo "01-21 commit e183a93 IS ancestor of HEAD"
01-21 commit e183a93 IS ancestor of HEAD
$ grep -n "lint" .github/workflows/ci.yml
...
        run: npm run lint                    # no continue-on-error
```
`package.json`'s `lint` script is `eslint . --max-warnings 0`. The gate is real, hard, and already landed in this branch's own history — extraction proceeded.

## D-02 reproduction (this session, HEAD `59bd5f6`)

```
$ node -e "require('./test/load-ts.cjs')('src/main/index.ts')"
[log] main log: C:\Users\ALIENW~1\AppData\Local\Temp\md-electron-stub\logs\main.log (pid 40396)
<anonymous_script>:203
electron_1.app.on('render-process-gone', (_e, contents, details) => {
               ^
TypeError: electron_1.app.on is not a function
    at eval (eval at loadFile ...)
    ...
Node.js v24.13.0
```
The log file was created (`initFileLogging()` ran for real, confirming the loader got past the `electron` import), and the throw is at `index.ts`'s `app.on('render-process-gone', ...)` — the first of D-02's six forbidden module-scope statements. Reproduced fresh, not inherited from the plan's own prose.

## Channel-name identity (empty diff)

```
$ BASE=59bd5f6
$ git show "$BASE":src/main/index.ts | grep -o "ipcMain\.handle('[^']*'" | sed "s/.*'\(.*\)'/\1/" | sort > T
$ grep -o "ipcMain\.handle('[^']*'" src/main/index.ts | sed "s/.*'\(.*\)'/\1/" | sort > U
$ diff T U; echo "DIFF_RC=$?"
DIFF_RC=0
$ wc -l T U
 153 T
 153 U
```
All 153 IPC channel names preserved exactly.

## Three RED runs (task 3, all reverted clean afterward)

**RED 1 — planted `const REDTEST_MAP = new Map();` at the bottom of `src/main/floor/boot.ts`:**
```
✖ no module-scope construction or process handler under src/main/floor/** (T-P02-02-01)
  AssertionError: src/main/floor/boot.ts constructs at module scope (`const x = new X(...)` outside
  any function) — bootFloor must construct every subsystem INSIDE the function...
```

**RED 2 — commented out the `void bootFloor(electronDeps());` call in `index.ts`'s `whenReady`:**
```
✖ index.ts calls bootFloor and no longer owns SHUTDOWN_STEPS (D-04)
  AssertionError: src/main/index.ts no longer calls bootFloor(...) — the composition root was
  extracted into src/main/floor/boot.ts specifically so whenReady could inject it...
```

**RED 3 — `rm -rf src/main/floor` (the deletion case D-40 exists to catch):**
```
✖ no module-scope construction or process handler under src/main/floor/** (T-P02-02-01)
  Error: ENOENT: no such file or directory, scandir 'E:\munder-difflin\src\main\floor'
```
The positive half fails by hard error (not a silent pass) when the directory is gone — stronger than a plain assertion failure. All three files restored byte-identical to their pre-RED state (`diff` confirmed empty), then re-verified green (27/27) before committing.

## Un-unref'd timers (RESEARCH's named list)

- **`hive.startRouter`'s `setInterval`** — cleared by `hive.stopRouter()`, already in `SHUTDOWN_STEPS`. Not additionally unref'd; shutdown clears it.
- **`armAlwaysOnBeats`'s two `setInterval`s (`fleetTimer`, `breakerBeatTimer`)** — **not previously cleared by `SHUTDOWN_STEPS` at all** (a real, pre-existing gap the ORIGINAL index.ts also had). Fixed here: a new `clearAlwaysOnBeats` step was added to `SHUTDOWN_STEPS`, pinned by `test/boot-floor.test.cjs`'s coverage test (`/clearInterval\(fleetTimer\)/`, `/clearInterval\(breakerBeatTimer\)/`) and proven by the explicit shutdown test completing without a `timeout`-forced kill.
- **`delivery.start`'s timer** — already calls `this.timer.unref?.()` (unchanged, per RESEARCH).

## D-05: only shutdown became newly testable here

The mail router (`hive.startRouter`/`routeOnce`) was already writable at `2f29d0b` (plan 02-01 wrote it, tested in `test/hive-durability.test.cjs` and others), and the git committer already had five tests (ADR-0004, plan 02-01). What this plan makes newly testable is **`Floor.shutdown()`** — there was no way to construct a floor and tear it down outside a live Electron process before `bootFloor` existed. `test/boot-floor.test.cjs`'s shutdown test (a live connection, then `floor.shutdown()`, then a refused connection) is the one assertion in this whole gate that could not have been written against the pre-extraction `index.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 01-21 precondition check used a stale-assumption reference (`main`)**
- **Found during:** Task 1
- **Issue:** The plan's literal `git cat-file -e main:eslint.config.js` check reports ABSENT because this project's milestone branching strategy keeps `main` 203 commits behind for the whole milestone, not because the lint gate is missing.
- **Fix:** Verified against `HEAD`'s own ancestry (`git merge-base --is-ancestor e183a93 HEAD`) plus confirming `ci.yml`'s hard, non-`continue-on-error` `npm run lint` step.
- **Files modified:** none (verification-only).
- **Committed in:** `8fd4ec3` (documented in the deps.ts commit message).

**2. [Rule 2 - Missing Critical] `FloorDeps` needed 4 fields beyond the plan's named 7**
- **Found during:** Task 2
- **Issue:** `mainWindow`/`powerSaveBlocker` (window-raise on notification click, keep-awake toggle) and `spawnAgentCore`/`startEphemeralWorkerWatcher` (real PTY spawning, ~480 lines too large/Electron-shaped to relocate) are all genuinely needed by code that moved into `bootFloor`, but are themselves Electron/index.ts-owned and explicitly barred from `src/main/floor/**`.
- **Fix:** Added `focus`, `syncKeepAwake`, `respawnCore`, `startWorkerWatcher` to `FloorDeps`, each with a doc comment naming why it exists and what degrades without it — same register as the plan's own `notify`/`quit` fields.
- **Files modified:** `src/main/floor/deps.ts`, `src/main/floor/boot.ts`, `src/main/index.ts`.
- **Committed in:** `a30bc18`.

**3. [Rule 1 - Bug] `bootstrapHiveServices()`'s tail split from `bootFloor`'s one-time construction**
- **Found during:** Task 2
- **Issue:** `bootstrapHiveServices()` was called from THREE places (`whenReady`, `config:update`'s onboarding transition, `config:changeHome`'s failure-recovery path), the latter two against the ALREADY-CONSTRUCTED floor. A `bootFloor` that reconstructs every subsystem on every call would leak the old `hookServer`/`telemetry` HTTP listeners and their timers on re-invocation.
- **Fix:** Split the startup tail into a separately-exported `startHiveServices()`, called once by `bootFloor` and again directly by the two re-invocation sites.
- **Files modified:** `src/main/floor/boot.ts`, `src/main/index.ts`.
- **Committed in:** `a30bc18`.

**4. [Rule 1 - Bug] Real race condition in `IntegrationBroker`/`TelemetryCollector`'s start/stop**
- **Found during:** Task 3 (the boot-floor test hung)
- **Issue:** Both classes only assigned `this.server` inside their async `'listening'` callback. A `stop()` racing ahead of the in-flight bind — which `test/boot-floor.test.cjs`'s boot-then-immediately-shutdown timing does on every run — found `this.server` still `null`, no-op'd, and leaked the real listening socket, hanging `node --test` past its 60s timeout.
- **Fix:** Assign `this.server` immediately after `createServer(...)`, before calling `.listen()`. `server.close()` on a not-yet-listening server is a safe, standard Node pattern.
- **Files modified:** `src/main/integrationBroker.ts`, `src/main/telemetry.ts`.
- **Verification:** `test/boot-floor.test.cjs` exits 0 in ~2s (was hanging to the 60s timeout before); whole suite unaffected (0 new failures).
- **Committed in:** `cdcf315` (separate atomic `fix(...)` commit, per the production-stress mandate).

**5. [Rule 1 - Bug] `SHUTDOWN_STEPS` never cleared `fleetTimer`/`breakerBeatTimer`**
- **Found during:** Task 3 (RESEARCH's own named list, confirmed by the boot test)
- **Issue:** The ORIGINAL (pre-extraction) `index.ts` `SHUTDOWN_STEPS` also never cleared these two `armAlwaysOnBeats` timers — a pre-existing gap, not something this plan introduced, but now directly testable and directly causing a `node --test` hang.
- **Fix:** Added a `clearAlwaysOnBeats` step to `SHUTDOWN_STEPS`.
- **Files modified:** `src/main/floor/boot.ts`.
- **Committed in:** `1900443`.

---

**Total deviations:** 5 auto-fixed (1 blocking precondition, 1 missing-critical dependency surface, 2 bugs found via the boot test, 1 verification-scope note). **Impact on plan:** All necessary for correctness; 2 of the 5 (the race condition and the timer gap) are genuine pre-existing defects this plan's own gate was the first thing to actually exercise. No scope creep — every fix is directly load-bearing for `test/boot-floor.test.cjs`'s own liveness/shutdown claims.

## Issues Encountered

- **`app.getPath('userData')` fake bug (self-caught, not a source defect):** an early draft of the test's electron fake treated `'userData'` as just another named subdirectory (`getPath: (name) => path.join(userData, name)`), so `app.getPath('userData')` returned `<tmp>/userData` instead of `<tmp>` itself, and `readConfig()` never found the seeded `config.json`. Fixed in the test fake before it was ever committed.
- **`hive.ts`'s `routeOnce()` requires `outbox/.sent` to pre-exist** (normally created by `ensureAgent()`): a hand-written outbox file in the boot test needed its `.sent` sibling directory created manually, or a routed message's archival `renameSync` throws, gets swallowed by `routeOnce()`'s own try/catch, and the file is quarantined as `bad-<name>` — reading as "never routed" rather than "routed but not archived". Documented inline in the test.
- **"spawn git ENOENT" console noise** during the boot test (from `hive.ts`'s FLOOR-04 staged-diff scrub degrading to "committing UNSCANNED"): pre-existing `git`-spawn-resolution behavior in this test environment, unrelated to this plan's changes, and already degrades gracefully (commits still land, just unscanned) — left as-is, out of this plan's scope.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `bootFloor(deps)` is now the injectable seam DAEMON-01 (headless daemon mode) needs to be verified against — this was the whole purpose of the extraction.
- `Floor.shutdown()` and `startHiveServices()` are both independently testable and independently callable, so a future daemon entry point can call `bootFloor`/`shutdown` directly without any Electron dependency at all.
- **STRUCT-01 is NOT marked complete in REQUIREMENTS.md.** Its own text names five seams ("agent lifecycle, shutdown, scheduler, workers, IPC"); this plan delivered the shutdown/scheduler construction seam, but `spawnAgentCore` (~480 lines — agent lifecycle) and the ephemeral-worker spawn-request watcher (workers) both stay in `index.ts` by design (too large/IPC-shaped to relocate here — see Deviation #2). `02-03-PLAN.md` also declares `requirements: [DAEMON-01, STRUCT-01]`, confirming the requirement is meant to close across both plans, not this one alone. Left `[ ]` in REQUIREMENTS.md accordingly (an earlier `requirements.mark-complete` call in this session incorrectly flipped it to `[x]`/"Complete" and was reverted before the final commit).
- **Not verified in this session, by design (Windows-executed plan):** `npm run e2e` (Playwright, Linux/xvfb-only per the plan's own guidance) and cross-platform CI on a draft PR — both are read off CI/the PR at phase-close, not run per-plan on Windows. `MEASUREMENT UNAVAILABLE — a pushed branch + open PR with the 6-check matrix (Typecheck/Test×3/Build/Electron smoke) all green.`

---
*Phase: 02-the-daemon-and-the-protocol*
*Completed: 2026-08-23*

## Self-Check: PASSED

All created files verified present (`src/main/floor/deps.ts`, `src/main/floor/boot.ts`,
`test/boot-floor.test.cjs`, this SUMMARY.md). All 4 task commits verified present in
`git log` (`8fd4ec3`, `a30bc18`, `cdcf315`, `1900443`).
