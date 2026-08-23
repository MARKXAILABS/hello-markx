---
phase: 1
slug: finish-the-floor
status: draft
nyquist_compliant: false
wave_0_complete: true
created: 2026-08-20
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `01-RESEARCH.md` § Validation Architecture. Task IDs in the
> Per-Task Verification Map are filled in by execute-phase as plans run.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node --test` + `node:assert/strict`. **No Jest/Vitest/Mocha, and none is being added.** Playwright `@playwright/test ^1.62.1` for e2e only. |
| **Config file** | None for the unit suite — behaviour comes entirely from `package.json` scripts. `playwright.config.ts` for e2e. |
| **Quick run command** | `npm run test:focused` (hand-listed ~33 files) |
| **Full suite command** | `npm test` = `node --test test/*.test.cjs` |
| **Typecheck** | `npm run typecheck` = `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json` |
| **E2E** | `npm run e2e` = `playwright test` — Linux/xvfb only, `workers: 1`, `retries: 0` |
| **Lint (after FLOOR-16)** | `npm run lint` = `eslint . --max-warnings 0`. Both the script and `eslint.config.js` land in **plan 21, wave 8** — there is no linter in the tree before that (no `eslint.config.js`, no `.eslintrc*`, no `eslint` in `package.json`, verified 2026-08-20). Always the local install via `npm run lint`, **never bare `npx eslint`**, which fetches an unpinned ESLint from the registry. |
| **Estimated runtime** | Unit suite seconds; e2e ~minutes (Electron boot under xvfb) |
| **Baseline at plan time** | 56 files, 426 tests — 422 pass / 0 fail / 4 skip (re-measured 2026-08-20 post origin/main merge), green on ubuntu + windows + macos |

**Two shell gotchas that have already cost real time:**
- `node --test test/` does **not** work. The glob `test/*.test.cjs` is expanded by the shell/Node, not treated as a directory. Always use the exact invocation.
- `npm run test:focused` is **never a gate.** `CONTRIBUTING.md` states why: *"a hand-written file list is how eight test files went unrun for months"* (#7).

---

## Sampling Rate

- **After every task commit:** `npm run test:focused` for the tight loop, **then** `npm test` before the task counts as done.
- **After every plan wave:** `npm test` and `npm run typecheck`, with the three-platform evidence read from **the phase's draft PR** via `gh pr checks` — rows `Typecheck`, `Test (ubuntu-latest)`, `Test (windows-latest)`, `Test (macos-latest)`, `Electron smoke (ubuntu-latest)`. Both workflows trigger on `branches: [main]` only (`ci.yml:4-7`, `e2e.yml:11-14`), so a push to the phase branch produces **no run at all** — plan 01 task 3 opens the draft PR that makes these checks exist. Note the E2E **job** is `Electron smoke (ubuntu-latest)`; `E2E` is only the workflow name, and `gh pr checks` lists jobs. After wave 8, add `npm run lint` (`eslint . --max-warnings 0`). **Wave 8, not earlier** — plan 21 is what creates `eslint.config.js` and the `lint` script; running the gate in wave 7 would make `npx` fetch an unpinned ESLint mid-phase and lint an unconfigured tree.
- **After waves 1 and 4 additionally:** `npm run e2e`. Wave 1 changes the runtime; wave 4 changes the boot-time delivery path.
- **Before `/gsd:verify-work`:** full suite green on all three `Test (os)` rows of the draft PR, `Electron smoke (ubuntu-latest)` green, lint green. An empty `gh pr checks` table is a FAIL, not a pass — it means nothing triggered.
- **No `continue-on-error` may be added to the matrix anywhere, for any reason.**
- **Exit 0 is never sufficient evidence — read the counters.** `node --test` counts *skipped* tests in
  its total and exits `0` when every test in a file is skipped, so a suite whose new tests are all
  `{skip: '...'}` is indistinguishable from a passing one by exit code alone. Every gate that reports
  `npm test` must report the TAP counters beside it:
  `node --test --test-reporter=tap test/*.test.cjs | grep -E "^# (tests|pass|fail|skipped|todo) "`.
  Name the TAP reporter explicitly — the default (spec) reporter prints `ℹ skipped 0`, so a criterion
  grepping for `#` against it matches nothing and passes silently.
  **The frozen skip baseline for this phase WAS `# skipped 4`** (measured 2026-08-20 post
  origin/main merge, the same run recorded at `:30`). `# fail 0` and a `≤` skip clause — not `>=`,
  never `>=` — are the standing floor. A `>=` skip clause permits skip growth by construction and is
  the exact shape that lets a phase close green on skipped work.

  ### The ceiling moved to `# skipped 7` on win32 — RE-FROZEN, with the reason

  **Measured on this host** (win32, `DESKTOP-LO8BH39`, Node v24.13.0) by plan 01-31 at the end of the
  gap-closure wave, with the exact command this document mandates:

  ```
  $ node --test --test-reporter=tap test/*.test.cjs | grep -E "^# (tests|pass|fail|skipped|todo) "
  # tests 634
  # pass 627
  # fail 0
  # skipped 7
  # todo 0
  ```

  **The ceiling moved because NON-RUNS WERE RELABELLED AS SKIPS, not because work was skipped.** That
  distinction is the whole reason this paragraph exists, and it is checkable: `# pass` went **DOWN by
  exactly 2** against the pre-gap baseline's own contribution. `node:test` counts a callback that
  returns normally as a **PASS**, so two platform-gated cases were reporting `ok` on win32 having
  executed not one assertion. Converting each to the runner's own conditional skip moves it out of
  `# pass` and into `# skipped`. The identity is therefore `pass = 531 − 2 + N_run`, **not** `531 + N`:

  ```
  pass  = 531 − 2 (the two conversions) + 98 (new cases that RUN here) = 627   ✔ measured 627
  tests = 535 + 99 (new test points; the two conversions were already counted) = 634  ✔ measured 634
  skip  = 4 + 2 (the two conversions) + 1 (one new case that skips here)       = 7    ✔ measured 7
  ```

  **All seven members, enumerated by title, read off the TAP — not from any plan's prose:**

  | # | Test title | Why it skips | Kind |
  |---|---|---|---|
  | 1 | *a hook fires with NO node on PATH, and its payload reaches HIVE_SOCK* (`test/hive-hook-node.test.cjs`) | `{ skip: !POSIX }` | frozen four |
  | 2 | *`node` resolves and RUNS with no node on PATH — the whole point* (`test/hive-runtime-path.test.cjs`) | `{ skip: !POSIX }` | frozen four |
  | 3 | *the real shim authenticates to the real hook server* (`test/hook-auth-roundtrip.test.cjs`) | `{ skip: !POSIX }` | frozen four |
  | 4 | *a shim with no token is still rejected* (`test/hook-auth-roundtrip.test.cjs`) | `{ skip: !POSIX }` | frozen four |
  | 5 | *a LEAF symlink pointing at the shim from outside the hive is denied* (`test/net-binding.test.cjs`) | runtime `t.skip` carrying the caught `EPERM: operation not permitted, symlink` — `fs.symlinkSync` needs elevation or Developer Mode | **ENVIRONMENT**, not platform — it will NOT appear on a runner with symlink permission (plan 01-24) |
  | 6 | *deleting the hook socket no longer opens the gate until the app restarts* (`test/net-binding.test.cjs`) | a win32 named pipe has no filesystem entry to unlink | **CONVERSION** — was a bare `return`, i.e. a PASS (plan 01-24) |
  | 7 | *the win32 branch is genuinely platform-gated* (`test/win-cmd-shim.test.cjs`) | the case asserts the NON-win32 short-circuit; on win32 the branch it names is the live one | **CONVERSION** — was a bare `return`, i.e. a PASS (plan 01-30) |

  **Reconciliation against plan 01-30, which measured this in wave 2:** 01-30 reported `# skipped 7`
  with these same seven titles and instructed 01-31 to re-derive rather than inherit. The measurement
  **agrees with 01-30 title for title**; only `# tests` and `# pass` differ (626/619 → 634/627),
  because 01-29 added +6 and 01-31 added +2 after 01-30 ran. No discrepancy to report.

  **The standing floor is re-frozen at `# fail 0` and `# skipped` ≤ 7 on win32.** Still `≤`, never
  `>=`. Members 1–4 and 6–7 are platform-conditional and 5 is environment-conditional, so a win32
  runner **with** symlink permission should read **6**, and that is a pass, not a failure — the clause
  is a ceiling. The POSIX figure is deliberately NOT frozen here: no POSIX host ran in this session,
  the polarity differs on every one of members 1–7, and publishing an unmeasured number is the defect
  this phase exists to remove.

  **`01-23-SUMMARY.md:181` keeps its `# skipped 4` list permanently.** It is a historical record of
  what was true at the phase gate and is in no plan's `files_modified`.

  **A ceiling move is only legitimate when it is announced.** This paragraph exists specifically to
  forbid an unannounced one: any later move must state the new number, name every member by title,
  and say which of them are relabelled non-runs versus genuinely skipped work.

  ### Re-measured at `1a2bf7e` by the sampling audit — the arithmetic HOLDS

  Re-run from scratch on this host (win32, Node v22.23.2) with the exact mandated command, **before**
  the audit added anything:

  ```
  # tests 634   # pass 627   # fail 0   # skipped 7   # todo 0
  ```

  Identical to 01-31's published figures, all seven members matching by title. The `pass = 531 − 2 +
  N_run` identity is **confirmed, not inherited**: `# pass` really is 2 below `531 + N`, and both
  missing passes are the 01-24 and 01-30 conversions.

  The skip arithmetic is now derived a **second, independent way** — from the source rather than from
  the TAP — and it agrees. `test/suite-integrity.test.cjs` enumerates the seven declared conditional
  skips in the tree and evaluates each one's polarity for the running platform:

  | Polarity | Sites | Fires on win32 |
  |---|---|---|
  | `!POSIX` (≡ `=== 'win32'`) — the frozen four | 4 | yes |
  | `=== 'win32'` — the 01-24 and 01-30 conversions | 2 | yes |
  | `!== 'win32'` — the 01-30 transcript-project-dir conversion | 1 | **no** |

  → **6 deterministic** on win32, `+ 1` environment skip (EPERM on `fs.symlinkSync`) = **7 measured**.
  `4 + 2 + 1 = 7` is correct, and the environment-skip distinction survives: a win32 runner **with**
  symlink permission reads 6 deterministic + 0 = **6**, which the `≤` clause admits.

  After the audit's own additions the same command reads **`# tests 638 / # pass 631 / # fail 0 /
  # skipped 7 / # todo 0`** — `+4` tests, `+4` pass, **skip unchanged**. `npm run typecheck` EXIT=0 and
  `npm run lint` EXIT=0 were both executed in the same session.

  ### The ceiling covers ONE of the three CI platforms, and is enforced by nothing

  Two limits on the paragraphs above, both found by the sampling audit and neither previously stated:

  1. **`≤ 7` is a win32-only clause.** `ci.yml` gates on ubuntu, windows AND macos. Every one of the
     seven declared skips inverts its polarity off win32, and `test/net-binding.test.cjs` carries a
     further **eight** runtime `t.skip(...)` sites gated on `process.platform !== 'win32'` that fire
     on POSIX and did not fire here. Source-derived POSIX floor: **1 declared + 8 runtime = 9**, i.e.
     **above the published ceiling**. That number is **DERIVED FROM SOURCE, NOT MEASURED** — no POSIX
     host ran in this session, and it is recorded as a derivation precisely so nobody mistakes it for
     a measurement. Two of three gated platforms have no frozen ceiling at all.
  2. **No gate reads the counter.** `npm test` is `node --test test/*.test.cjs`, which **exits 0
     however many cases skip**. `grep -rn "skipped" .github/workflows/ package.json scripts/` returns
     two unrelated YAML comments and nothing else. The mandate at `:45-51` — *"every gate that reports
     `npm test` must report the TAP counters beside it"* — is satisfied by **no automated gate in the
     repo**. Until this audit the frozen ceiling was prose: converting twenty more cases to skips
     would have left CI green and silent.

  `test/suite-integrity.test.cjs` clauses 3 and 4 are the partial close. They are a **static census
  proxy, not a counter read**: they pin the declared conditional-skip surface file-for-file and derive
  the platform floor from it, so an unannounced ceiling move goes red on all three runners. They
  cannot see a *runtime* skip firing more often on a differently-configured host. Reading the real
  `# skipped` in CI remains open — see the sign-off.

---

## The Nyquist Problem — where sampling is structurally insufficient

This is the single most important entry in this document.

`npm test` samples the **stubbed-Electron** behaviour of this app at high rate, and the
**real-Electron** behaviour at rate ≈ 0 on Windows and macOS. `test/load-ts.cjs` replaces the
`electron` module with a headless stub, so **no number of unit runs can reconstruct an
Electron-version regression.** A green three-platform CI gate after the Electron 43 bump proves
nothing about the runtime.

The only job that launches real Electron is the Playwright smoke on `.github/workflows/e2e.yml`,
which is Linux/xvfb only. The Windows-only ConPTY path — `node-pty` plus the byte-exact patched
`conpty_console_list_agent.js` — is therefore exercised by **no Electron-launching job on any
platform**.

Two samples raise that rate above zero. **Neither is optional and neither may be replaced by a
CI link:**

1. **D-09 — a live operator run on the Windows machine.** Launch the built app, open a terminal
   pane, confirm a real PTY spawns and a real `better-sqlite3` write lands. This is FLOOR-03's
   closure evidence.
2. **D-10 — a version assertion in the one real-Electron job.** Read `process.versions.electron`
   and `process.versions.modules` from the launched app and assert the major. One line, and the
   only automated thing that would catch a silent revert to Electron 32.

---

## The Sampling Audit — tests that cannot fail (2026-08-23, at `1a2bf7e`)

The 10-of-23 requirement adjudication is plan 01-31's and is **not re-litigated here**. This section
answers the other question: *for the requirements that are ticked, does a test actually go red when the
behaviour regresses?* Every claim below was executed in this session; nothing is inherited.

### S-1 — the bare-`return` defect class had NO guard. **CLOSED.**

`node:test` counts a callback that returns normally as a **PASS**. This repo shipped **three** such
cases and fixed each by hand — the fix was a human noticing, three times, and nothing stopped a fourth:

| Pre-fix blob | Shape | Polarity | Fixed by |
|---|---|---|---|
| `git show 434e5fd^:test/net-binding.test.cjs` :897 | block, with a `console.error` that is not a skip | `=== 'win32'` | 01-24 |
| `git show a588667^:test/transcript-project-dir.test.cjs` :122 | one-line braceless, mid-callback | `!== 'win32'` | 01-30 |
| `git show a588667^:test/win-cmd-shim.test.cjs` :167 | one-line braceless | `=== 'win32'` | 01-30 |

A fresh sweep at `1a2bf7e` over all 55 runner-driven files, **in both polarities and through
`process.platform` aliases**, found **0 remaining instances**. An empty result is exactly the vacuous
shape this phase exists to remove, so the sweep is now a test that has been **SEEN FAILING**:
`test/suite-integrity.test.cjs` runs the same scanner over the three shapes above, held **verbatim**
in `test/fixtures/shipped-unannounced-exits.cjs`, and asserts it finds each one. Demonstrated live:

- against the real pre-fix blobs — **3 hits / 3 defects**, both polarities;
- against an injected fourth defect — clause 1 goes **red**, naming file and line;
- against the landed runner-counted form — **clean**, so the fix is not itself reddened.

*(The fixtures live outside `test/*.test.cjs` deliberately. Held inline they would be found by the
file's own sweep — correctly — and the only escapes would be excluding that file from its own corpus,
a permanent blind spot in the one file whose job is to have none, or mangling the shapes until they
stop being verbatim.)*

### S-2 — `test/win-cmd-shim.test.cjs`'s converted case pins the OUTCOME, not its stated reason. **CONFIRMED, OPEN.**

01-30 self-reported this. It is now **demonstrated, not merely restated.** The case
*"the win32 branch is genuinely platform-gated"* runs on POSIX and asserts
`resolveWindowsShimSpawn(SHIM) === null`, naming the guard `src/main/pty.ts`
`resolveWindowsShimSpawn()` → `if (process.platform !== 'win32') return null`.

`SHIM` is `C:\Users\Tester\AppData\Roaming\npm\opencode.cmd` — a fabricated path. Executed this
session on win32, where **that guard does not fire**, so this host runs the exact body a POSIX host
would run with the guard deleted:

```
guard `platform !== win32` fires : false
probe(SHIM)                      : null
probe(<NPM_DIR>\opencode)        : null
SHIM exists on disk              : false
```

`statSync` throws ENOENT and the `catch` returns `null` either way. The assertion is satisfied
**identically** whether the guard is present or deleted, so deleting `pty.ts`'s platform guard would
**not** redden it. **Cost: 1 case / 2 assertions that cannot fail for the reason their title claims.**
It is not a total non-run — it does prove the probe refuses an absent shim on POSIX — but it does not
prove platform-gating. Closing it needs a *real* on-disk `.cmd` fixture so the two states diverge.
**Owner: unassigned. Carried forward from 01-30 §3 / register A9.**

### S-3 — `test/proc-kill.test.cjs`: five cases, one TAP point. **QUANTIFIED. Registered as A7.**

Registered with a named owner in 01-31's register (row *"7 proc-kill | matches 01-30 §1 | **A7**"*) —
verified present. The cost is now measured rather than asserted. Live probe with throwaway
hand-rolled fixtures:

| File | Internal cases | TAP points | Result |
|---|---|---|---|
| hand-rolled, `process.exit(0)` | 3 | **1** | `ok 1 - green.test.cjs`, `# pass 1` |
| hand-rolled, `process.exit(1)` | 1 | **1** | `not ok 1 - red.test.cjs`, `# fail 1`, runner EXIT=1 |

And in the real suite: `ok 37 - test\proc-kill.test.cjs` — **one** point for the whole file.

**The correction that matters:** the gate is **not** blind. A POSIX regression in `procKill.ts` sets
the file's exit code and `node --test` reports `not ok` and exits 1. What is lost is **counter
granularity**: 5 named cases report as 1 unnamed one, so a failure names the file, never the case.
On win32 the 5 POSIX cases do not run at all — deliberate, documented, and the win32 branch is now
assert-bearing and durably pinned by repo-claims' poisoned-assert probe.

### S-4 — `test/repo-claims.test.cjs`'s poisoned-assert probe is real and durable. **VERIFIED.**

The one existing guard of this class. It poisons `assert` and re-runs every hand-rolled harness,
failing any that still exits 0. It is what caught proc-kill's win32 branch originally. It covers
hand-rolled harnesses **only** — by design, since node:test sets its own exit code — which is exactly
why S-1's sweep was needed and did not overlap it.

### S-5 — a negative assertion over an unasserted corpus. **WARNING, OPEN.**

`test/net-binding.test.cjs` *"the floor-wide hook token cannot come back into main"* (GATE-01's
repo-fact half) loops `fs.readdirSync('src/main')` and asserts a negative per file. It strips comments
first — correctly, and it says why — but it **never asserts the corpus is non-empty**. If the
directory were renamed the loop body would not execute and the test would pass having checked nothing.
Contrast `test/repo-claims.test.cjs`, which asserts `docs.length > 30` and
`docs.includes('DESIGN.md')` *before* asserting the corpus is clean — 01-31 established that pattern
and this pin predates it. Low likelihood (renaming `src/main` breaks the build), real shape.
**Not fixed here:** it is a one-line change to a file this audit does not own. **Owner: unassigned.**

### Requirements whose sampling was checked and found sound

`FLOOR-16` — `test/ci-config.test.cjs:451` pins the `lint` script *and* `--max-warnings 0` as a
regex, and `npm run lint` was **executed this session, EXIT=0**. `FLOOR-03`/D-10 — `e2e/smoke.spec.ts:188`
asserts `Number(versions.electron.split('.')[0]) >= 43` with the native ABI in the failure message.
`RECORD-03`/`RECORD-04` — `test/hive-protocol-v2.test.cjs:394` bills the **difference** between
snapshots and `:435` bills a card's early rows past the 1 MB tail; both are behavioural, not repo-fact.
`VERDICT-02` — `:264` (done while everyone is busy) and `:306` (refuse→redo). `VERDICT-03` — `:333`
*"a reviewer whose engine cannot receive mail is never selected"*. `FLOOR-09`/`FLOOR-10` — real
cases including an explicit **negative control** at `test/engine-parity.test.cjs:202` and
`test/breaker.test.cjs:345`. The comment-stripping discipline holds where it is load-bearing
(`repo-claims` uses `readStripped` throughout; `net-binding`'s source pins strip inline and say why),
so **the "pin satisfied by a commented-out line" class was hunted and not found**.

**What this section does NOT establish.** Every one of those runs with `electron` stubbed. None of
them can fail on an Electron-version or native-ABI regression. That is the Nyquist problem below, and
no amount of the above substitutes for D-09.

---

## Per-Requirement Verification Map

"Live" means an operator or CI action that no unit test can substitute for.

| Req | Behaviour to prove | Test type | Automated command | Test file status |
|-----|-------------------|-----------|-------------------|------------------|
| FLOOR-01 | `autoMode` renders on the agent card | static render | `node --test test/renderer-components.test.cjs` | ✅ W0 landed (plan 22) |
| FLOOR-02 | queue-drain + quiesce run in main with no window | unit (DI harness) | `node --test test/delivery-main.test.cjs` | ✅ extend |
| FLOOR-02 | no doc promises a dead code path | repo-fact | `node --test test/repo-claims.test.cjs` | ✅ W0 landed |
| FLOOR-03 | 3-platform suite green on Electron 43 | full suite | the draft PR's three `Test (os)` rows via `gh pr checks` | ✅ `ci.yml` via the PR (a branch push triggers nothing) |
| FLOOR-03 | the launched app really is Electron ≥43 | e2e | `npm run e2e` (D-10) | ✅ extend `e2e/smoke.spec.ts` |
| FLOOR-03 | real PTY spawns; real `better-sqlite3` write lands on Windows | **live (D-09)** | operator run of the built app | — |
| FLOOR-04 | a secret in an agent file never reaches `git log -p` | integration (real temp git repo) | `node --test test/hive-durability.test.cjs` | ✅ extend — already drives real `git` |
| FLOOR-05 | `openLogs` exposed in preload and reachable from Settings | repo-fact + static render | `test/repo-claims.test.cjs` | ✅ W0 landed |
| FLOOR-06 | attestation step present with correct permissions | repo-fact (YAML parse) | `node --test test/ci-config.test.cjs` | ✅ extend |
| FLOOR-06 | a published artifact verifies | **live** | `gh attestation verify <file> --repo MARKXAILABS/hello-markx` | — |
| FLOOR-07 | FTS5 table created and queryable | integration (**real** SQLite handle) | `node --test test/db-fts.test.cjs` | ✅ W0 landed (plan 10) — a real SQLite handle, `# skipped 0` |
| FLOOR-07 | scope surfaced in `MemoryPanel`; dead preload exports gone | static render + repo-fact | `test/renderer-components.test.cjs`, `test/repo-claims.test.cjs` | ✅ W0 landed |
| FLOOR-08 | a card finished while everyone is busy is reviewed on a later sweep | unit | `node --test test/hive-protocol-v2.test.cjs` | ✅ extend |
| FLOOR-09 | proxy-tier (qwen/crush) spend reaches `getAgentUsage` and can trip the breaker | unit | `node --test test/engine-parity.test.cjs` | ✅ extend |
| FLOOR-10 | an over-cap card reaches `constrained` — **after ≥2 beats** | unit (fake clock) | `node --test test/breaker.test.cjs` | ✅ exists — extend |
| FLOOR-11 | a single `hiveTasks` timer; no PTY-byte roster re-render | repo-fact | `test/repo-claims.test.cjs` | ✅ W0 landed |
| FLOOR-11 | terminal pool cap + orphan sweep on every drop path | unit (pure) | `node --test test/terminal-*.test.cjs` | ✅ `terminalPoolPolicy` covered |
| FLOOR-12 | no text token below 14px | repo-fact (parse `tokens.css`) | `test/repo-claims.test.cjs` | ✅ W0 landed |
| FLOOR-12 | every icon-only `<button>` has an `aria-label` | repo-fact (icon-only **rule** assertion — never a ratio or a count; `01-UI-SPEC.md:329-343` is binding and states a ratio test *would be wrong*, because adding `aria-label` to a text button overrides its visible label) | `test/repo-claims.test.cjs` | ✅ W0 landed |
| FLOOR-13 | the four renderings agree on the field set, cost included | static render | `test/renderer-components.test.cjs` | ✅ W0 landed |
| FLOOR-13 | `sidebarWidth` re-clamps on resize | unit (pure clamp fn) | `node --test test/renderer-runstate.test.cjs` | ✅ extend — extract clamp first |
| FLOOR-14 | a blocked non-Claude agent produces a notify call | unit (DI `notify` fake) | `node --test test/hooks-notify.test.cjs` | ✅ W0 landed |
| FLOOR-15 | 3–5 presentational components render to expected markup | static render | `node --test test/renderer-components.test.cjs` | ✅ W0 landed |
| FLOOR-16 | lint is a hard gate at zero warnings | repo-fact + live | `test/ci-config.test.cjs` asserts step + flag; `npm run lint` (local install — never bare `npx eslint`) | ✅ extend / live |
| FLOOR-17 | bug template asks only for logs that exist; ADRs present | repo-fact | `test/repo-claims.test.cjs` | ✅ W0 landed |
| FLOOR-18 | `capabilityLine` declares the Windows Codex gap | unit | `node --test test/engine-parity.test.cjs` | ✅ extend |
| GATE-01 | agent A's token carrying `agent_id: 'B'` surfaces as A, or is dropped | integration (**real** socket / named pipe) | `node --test test/net-binding.test.cjs` | ✅ extend (D-16) |
| GATE-01 | the floor-wide `HIVE_SOCK_TOKEN` assignment is gone | repo-fact | `test/net-binding.test.cjs` | ✅ extend |
| RECORD-03 | spend summed over **all** rows, not a 1 MB tail | unit (ledger > 1 MB) | `node --test test/hive-protocol-v2.test.cjs` | ✅ rewrite `:276-284` (D-23) |
| RECORD-04 | spend from clamped consecutive **diffs**, not sums | unit | `node --test test/hive-protocol-v2.test.cjs` | ✅ rewrite `:276-284` (D-23) |
| VERDICT-02 | obligation survives "no reviewer"; survives a refuse→redo | unit | `node --test test/hive-protocol-v2.test.cjs` | ✅ extend |
| VERDICT-03 | a `canReceiveInbox: false` agent is never selected | unit | `node --test test/hive-protocol-v2.test.cjs` | ✅ new test over **existing** behaviour |
| *(suite-wide)* | no test callback exits early without telling the runner; the declared skip census and the platform skip floor match the frozen ceiling | repo-fact over the test tree | `node --test test/suite-integrity.test.cjs` | ✅ **added by the sampling audit** — 4 tests, 0 fail, 0 skipped; clauses 1, 3, 4 each demonstrated RED |

---

## Wave 0 Requirements

Test infrastructure that must exist before the requirements depending on it:

- [x] `test/load-ts.cjs` — **lazy-download fix. DONE, plan 01-01 task 1** (see 01-01-SUMMARY.md
      for the commit SHA). `requireElectron()` no longer calls the real loader: it
      resolves the id with `require.resolve('electron')` and reads `require.cache[id]?.exports`,
      falling back to the stub. Evidence, on the UNBUMPED Electron 32 tree:
      `grep -vE "^\s*(//|\*|/\*)" test/load-ts.cjs | grep -c "require('electron')"` → `0`
      (baseline `1`; raw `grep -c` also `0`, baseline `2`), and a live probe showed an injected
      `require.cache['electron']` still winning (`probeElectron() -> INJECTED`).
      `npm test` EXIT=0, TAP `# tests 426 / # pass 422 / # fail 0 / # skipped 4 / # todo 0` on
      win32; `npm run typecheck` EXIT=0.
- [x] `test/load-ts.cjs` — `.tsx` resolution in `resolveTs()` + **`ts.JsxEmit.ReactJSX`**
      (D-25). **DONE, plan 01-01 task 1.** `resolveTs()` now also tries `${base}.tsx` and
      `path.join(base, 'index.tsx')`, and `compilerOptions` carries `jsx: ts.JsxEmit.ReactJSX`.
      **The constant was wrong in this document and is corrected here**: `tsconfig.web.json:7` sets
      `"jsx": "react-jsx"` (automatic runtime) and only 1 of 63 renderer `.tsx` files imports
      `React`, so `ts.JsxEmit.React` emits `React.createElement(...)` and every component would
      throw `ReferenceError: React is not defined` at render time. Verified 2026-08-21 by
      transpiling `export const A = () => <div>hi</div>` both ways —
      `React` → `React.createElement("div", null, "hi")`;
      `ReactJSX` → `require("react/jsx-runtime")` + `(0, jsx_runtime_1.jsx)("div", …)`.
      Evidence: `grep -c "JsxEmit.ReactJSX" test/load-ts.cjs` → `1`,
      `grep -cE "JsxEmit[.]React([^J]|$)" test/load-ts.cjs` → `0`,
      `grep -c "tsx" test/load-ts.cjs` → `4`; and a live probe loaded a `.tsx` entry whose
      `./Widget` (`${base}.tsx`) and `./sub` (`dir/index.tsx`) imports both resolved, rendering
      `<div class="w">hi markx</div><span>b</span>` through `renderToStaticMarkup` with no
      `React` binding in scope.
      Unblocks FLOOR-01, FLOOR-07 (panel), FLOOR-13, FLOOR-15.
- [x] `test/repo-claims.test.cjs` — **21 tests, 0 fail, 0 skipped at wave 9.** The D-45 repo-fact accumulator, following the existing
      `test/ci-config.test.cjs` / `test/main-hardening.test.cjs` / `test/engine-parity.test.cjs`
      precedent. Accumulated by **plan 05 (wave 2) → plan 07 (wave 3) → plan 10 (wave 5)**, and
      **asserted whole by plan 23 (wave 9)**. This file is what turns the end-of-phase sweep into
      `npm test` plus one `gh` query.
- [x] `test/renderer-components.test.cjs` — **6 tests, 0 fail, 0 skipped.** The `renderToStaticMarkup` harness (D-24). **Plan 22, wave 8.**
- [x] `test/db-fts.test.cjs` — **6 pass, 0 fail, 0 skipped, and `grep -cE ".skip(|.todo(|skip:|todo:" test/db-fts.test.cjs` → `0`.** Needs a **real** SQLite handle; `test/config-secrets.test.cjs`'s
      in-memory `FakeDatabase` has no FTS5 and cannot serve it. **Plan 10, wave 5.**
      **No `better-sqlite3` rebuild step is budgeted, and none may be added.** 13.0.3 is N-API,
      ships eight prebuilds and declares no install script, so `npm ci --ignore-scripts` leaves a
      loadable binary in place; `npm rebuild better-sqlite3` would *discard* that prebuild and
      synthesise a `node-gyp rebuild`, which CI can only satisfy on Linux (`setup-python` is pinned
      there only). Plan 01 task 2 and plan 10 both assert
      `grep -c "npm rebuild better-sqlite3" .github/workflows/ci.yml` returns `0`.
- [x] `test/hooks-notify.test.cjs` — **6 pass, 0 fail, 0 skipped.** Or extend an existing hooks test — with a DI `notify` fake
      for FLOOR-14. **Plan 13, wave 6.**
- [x] `test/breaker.test.cjs` — **verified present.** Extend rather than create.
- [x] No framework install needed. No coverage tool exists and none is being added — confidence
      here comes from the three-platform matrix and the "never mock the thing under test" rule,
      not from a coverage number.

---

## Manual-Only Verifications

| Behavior | Requirement | Why manual | Test instructions |
|----------|-------------|-----------|-------------------|
| App runs on Electron 43 with real PTY + real SQLite on Windows | FLOOR-03 | The unit suite stubs `electron`; the only real-Electron job is Linux-only. Structurally unsamplable in CI. | Build the app on the Windows machine, launch it, open a terminal pane, spawn an agent, confirm the PTY is live and a `better-sqlite3` write lands. Record the run as FLOOR-03's closure evidence. |
| A published release artifact verifies against this repo and commit | FLOOR-06 | Requires a real tagged release and a real GitHub attestation. | After the next tag: `gh attestation verify <artifact> --repo MARKXAILABS/hello-markx`, paste the output. |
| `exhaustive-deps` finding count across 131 `useEffect` / 45 `useCallback` / 26 `useMemo` | FLOOR-16 | Unmeasured at plan time. With `--max-warnings 0` every finding becomes phase work. | Run `./node_modules/.bin/eslint .` (plan 21 task 1 installs it first; bare `npx eslint` would fetch an unpinned ESLint from the registry) and paste the count **before** committing the CI gate. If the number is large, that is a planning input, not a surprise. |
| Codex remote control unavailable on Windows | FLOOR-18 | Upstream-blocked (`openai/codex#30372`, daemon lifecycle is Unix-only). Nothing to verify beyond the declaration. | Confirm the limitation appears in source comment, `capabilityLine`, and the docs engine table. |

---

## Validation Sign-Off

Signed off item by item at wave 9 (2026-08-21), re-audited at `1a2bf7e` (2026-08-23). Every
tick carries the command that produced it. **Five are NOT ticked, and the phase is not signed
off because of them** — see the entries marked GAP. The 2026-08-23 sampling audit added one
tick (the bare-`return` sweep, previously unguarded) and **three new GAPs**, so the grounds for
`nyquist_compliant: false` are broader now than they were at wave 9, not narrower.

- [x] **All tasks have an `<automated>` verify or a named Wave 0 dependency.**
      Across all 23 plans: **77 tasks, 72 carrying `<automated>`**. The five that do not
      are exactly the five `checkpoint:*` tasks (01-01 t4, 01-08 t4, 01-12 t4, 01-21 t4,
      01-23 t4), each of which carries a `<human-check>` instead — which is the point of a
      checkpoint. No `type="auto"` task anywhere in the phase lacks an automated verify.
- [x] **Sampling continuity: no 3 consecutive tasks without an automated verify.**
      Follows from the line above: the five non-automated tasks sit in five different
      plans, so the longest run without an automated verify is one.
- [x] **Wave 0 covers all ❌ references above.** All four outstanding Wave 0 files exist
      and run green — `repo-claims` 21/0/0, `renderer-components` 6/0/0, `db-fts` 6/0/0,
      `hooks-notify` 6/0/0 (pass/fail/skipped). The twelve `❌ W0` cells in the
      Per-Requirement Verification Map are flipped to ✅ in this pass.
- [x] **No watch-mode flags anywhere.**
      `grep -rnE "--watch|--watchAll|watch: true" package.json .github/workflows/ e2e/ test/`
      → empty.
- [ ] **GAP — D-09's live Windows run is NOT recorded, and FLOOR-03 therefore does not
      close.** `.planning/phases/01-finish-the-floor/01-01-SUMMARY.md` **does not exist**:
      21 SUMMARYs for 22 completed plans. Plan 01-01's code landed (`package.json` pins
      `^43.4.1`, three-platform CI green) but its blocking checkpoint — a human launching
      `distwin-unpackedHello MarkX.exe` and confirming a real PTY echo, a persisted
      setting surviving a relaunch, and a clean visual pass — has never been run. This
      file states plainly that CI is **not** acceptable closure evidence here: all 535 unit
      tests run with `electron` stubbed and are structurally incapable of failing on an
      Electron-version regression. **Owner: the operator.**
- [x] **D-10 Electron-version assertion present in `e2e/smoke.spec.ts`.**
      `e2e/smoke.spec.ts:188` — *"the launched app really is Electron 43 or newer"*,
      asserting `Number(versions.electron.split('.')[0])` `.toBeGreaterThanOrEqual(43)`
      with the native ABI in the failure message. Green as the
      `Electron smoke (ubuntu-latest)` job on PR #77.
- [x] **No test callback exits early without telling the runner — SWEPT, and the sweep
      has been seen failing.** `node --test test/suite-integrity.test.cjs` → 4 tests, 0 fail,
      0 skipped. 0 offenders across 55 runner-driven files in both polarities; the scanner
      demonstrated at 3 hits / 3 real pre-fix blobs, red against an injected fourth, clean
      against the landed fix. See § The Sampling Audit, S-1. This was **unguarded** before
      2026-08-23: the defect was fixed three times by hand and nothing prevented a fourth.
- [ ] **GAP — no automated gate reads `# skipped`, on any platform.** `npm test` exits 0
      however many cases skip, and nothing in `.github/workflows/` greps the TAP counters.
      The mandate at `:45-51` is therefore satisfied by **no gate in the repo**. Partially
      closed by `test/suite-integrity.test.cjs` clauses 3–4, which pin the declared skip
      census and derive the platform floor — enough to redden an unannounced ceiling move
      on all three runners, **not** enough to observe the real counter. The remaining fix
      is one line in `ci.yml`'s test step piping `--test-reporter=tap` through the grep this
      document already specifies. **Owner: unassigned — Phase 2 planning input.**
- [ ] **GAP — the frozen ceiling is win32-only; ubuntu and macos have none.** All three are
      hard gates. The source-derived POSIX floor is **9**, above the published `≤ 7`. That
      figure is DERIVED, NOT MEASURED, and is recorded as a derivation on purpose.
      **Owner: whoever next runs the suite on a POSIX host.**
- [ ] **GAP — `test/win-cmd-shim.test.cjs`'s converted case cannot fail for its stated
      reason.** Confirmed by live probe this session, not merely restated from 01-30.
      1 case / 2 assertions. See § The Sampling Audit, S-2. **Owner: unassigned (register A9).**
- [ ] **GAP — `nyquist_compliant` stays `false`, and `status` stays `draft`.**
      **Re-affirmed by the sampling audit on 2026-08-23, and the audit did not narrow the
      grounds — it widened them.** Three independent blocks, any one of which is sufficient:
      1. **D-09 is unrun** (the item above). `01-01-SUMMARY.md` still does not exist —
         30 SUMMARYs for 31 plans. All 631 unit tests run with `electron` stubbed by
         `test/load-ts.cjs` and are structurally incapable of failing on an Electron-version
         or native-ABI regression; the only real-Electron job is Linux/xvfb, so the Windows
         ConPTY path is exercised by no Electron-launching job anywhere. CI is explicitly
         **not** acceptable closure evidence here.
      2. **The document's own headline gate is unenforced.** This file mandates that every
         `npm test` gate report the TAP counters; no gate does. A validation contract whose
         central clause nothing checks is the exact defect class this phase exists to remove,
         and it sat undetected through plans 01-23, 01-30 and 01-31.
      3. **13 of 23 requirements remain unticked**, ~9 `human_verification` items in
         `01-VERIFICATION.md` are outstanding, and `01-VERIFICATION.md` itself still reads
         `status: gaps_found` at 0/5 ROADMAP success criteria fully TRUE.

      Flipping either field today would be precisely the "green checklist that overstates
      reality" this phase exists to remove. **Plans 01-23 and 01-31 each refused; this audit
      refuses a third time.**

**Approval:** pending — and correctly so.
