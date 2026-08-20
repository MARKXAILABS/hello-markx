---
phase: 1
slug: finish-the-floor
status: draft
nyquist_compliant: false
wave_0_complete: false
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
  **The frozen skip baseline for this phase is `# skipped 4`** (measured 2026-08-20 post origin/main
  merge, the same run recorded at `:30`). `# fail 0` and `# skipped` **≤ 4** — not `>=`, never `>=` —
  are the standing floor. A `>=` skip clause permits skip growth by construction and is the exact
  shape that lets a phase close green on skipped work.

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

## Per-Requirement Verification Map

"Live" means an operator or CI action that no unit test can substitute for.

| Req | Behaviour to prove | Test type | Automated command | Test file status |
|-----|-------------------|-----------|-------------------|------------------|
| FLOOR-01 | `autoMode` renders on the agent card | static render | `node --test test/renderer-components.test.cjs` | ❌ W0 — needs W1 loader |
| FLOOR-02 | queue-drain + quiesce run in main with no window | unit (DI harness) | `node --test test/delivery-main.test.cjs` | ✅ extend |
| FLOOR-02 | no doc promises a dead code path | repo-fact | `node --test test/repo-claims.test.cjs` | ❌ W0 |
| FLOOR-03 | 3-platform suite green on Electron 43 | full suite | the draft PR's three `Test (os)` rows via `gh pr checks` | ✅ `ci.yml` via the PR (a branch push triggers nothing) |
| FLOOR-03 | the launched app really is Electron ≥43 | e2e | `npm run e2e` (D-10) | ✅ extend `e2e/smoke.spec.ts` |
| FLOOR-03 | real PTY spawns; real `better-sqlite3` write lands on Windows | **live (D-09)** | operator run of the built app | — |
| FLOOR-04 | a secret in an agent file never reaches `git log -p` | integration (real temp git repo) | `node --test test/hive-durability.test.cjs` | ✅ extend — already drives real `git` |
| FLOOR-05 | `openLogs` exposed in preload and reachable from Settings | repo-fact + static render | `test/repo-claims.test.cjs` | ❌ W0 |
| FLOOR-06 | attestation step present with correct permissions | repo-fact (YAML parse) | `node --test test/ci-config.test.cjs` | ✅ extend |
| FLOOR-06 | a published artifact verifies | **live** | `gh attestation verify <file> --repo MARKXAILABS/hello-markx` | — |
| FLOOR-07 | FTS5 table created and queryable | integration (**real** SQLite handle) | `node --test test/db-fts.test.cjs` | ❌ W0 — `FakeDatabase` cannot serve this |
| FLOOR-07 | scope surfaced in `MemoryPanel`; dead preload exports gone | static render + repo-fact | `test/renderer-components.test.cjs`, `test/repo-claims.test.cjs` | ❌ W0 |
| FLOOR-08 | a card finished while everyone is busy is reviewed on a later sweep | unit | `node --test test/hive-protocol-v2.test.cjs` | ✅ extend |
| FLOOR-09 | proxy-tier (qwen/crush) spend reaches `getAgentUsage` and can trip the breaker | unit | `node --test test/engine-parity.test.cjs` | ✅ extend |
| FLOOR-10 | an over-cap card reaches `constrained` — **after ≥2 beats** | unit (fake clock) | `node --test test/breaker.test.cjs` | ✅ exists — extend |
| FLOOR-11 | a single `hiveTasks` timer; no PTY-byte roster re-render | repo-fact | `test/repo-claims.test.cjs` | ❌ W0 |
| FLOOR-11 | terminal pool cap + orphan sweep on every drop path | unit (pure) | `node --test test/terminal-*.test.cjs` | ✅ `terminalPoolPolicy` covered |
| FLOOR-12 | no text token below 14px | repo-fact (parse `tokens.css`) | `test/repo-claims.test.cjs` | ❌ W0 |
| FLOOR-12 | every icon-only `<button>` has an `aria-label` | repo-fact (icon-only **rule** assertion — never a ratio or a count; `01-UI-SPEC.md:329-343` is binding and states a ratio test *would be wrong*, because adding `aria-label` to a text button overrides its visible label) | `test/repo-claims.test.cjs` | ❌ W0 |
| FLOOR-13 | the four renderings agree on the field set, cost included | static render | `test/renderer-components.test.cjs` | ❌ W0 |
| FLOOR-13 | `sidebarWidth` re-clamps on resize | unit (pure clamp fn) | `node --test test/renderer-runstate.test.cjs` | ✅ extend — extract clamp first |
| FLOOR-14 | a blocked non-Claude agent produces a notify call | unit (DI `notify` fake) | `node --test test/hooks-notify.test.cjs` | ❌ W0 |
| FLOOR-15 | 3–5 presentational components render to expected markup | static render | `node --test test/renderer-components.test.cjs` | ❌ W0 |
| FLOOR-16 | lint is a hard gate at zero warnings | repo-fact + live | `test/ci-config.test.cjs` asserts step + flag; `npm run lint` (local install — never bare `npx eslint`) | ✅ extend / live |
| FLOOR-17 | bug template asks only for logs that exist; ADRs present | repo-fact | `test/repo-claims.test.cjs` | ❌ W0 |
| FLOOR-18 | `capabilityLine` declares the Windows Codex gap | unit | `node --test test/engine-parity.test.cjs` | ✅ extend |
| GATE-01 | agent A's token carrying `agent_id: 'B'` surfaces as A, or is dropped | integration (**real** socket / named pipe) | `node --test test/net-binding.test.cjs` | ✅ extend (D-16) |
| GATE-01 | the floor-wide `HIVE_SOCK_TOKEN` assignment is gone | repo-fact | `test/net-binding.test.cjs` | ✅ extend |
| RECORD-03 | spend summed over **all** rows, not a 1 MB tail | unit (ledger > 1 MB) | `node --test test/hive-protocol-v2.test.cjs` | ✅ rewrite `:276-284` (D-23) |
| RECORD-04 | spend from clamped consecutive **diffs**, not sums | unit | `node --test test/hive-protocol-v2.test.cjs` | ✅ rewrite `:276-284` (D-23) |
| VERDICT-02 | obligation survives "no reviewer"; survives a refuse→redo | unit | `node --test test/hive-protocol-v2.test.cjs` | ✅ extend |
| VERDICT-03 | a `canReceiveInbox: false` agent is never selected | unit | `node --test test/hive-protocol-v2.test.cjs` | ✅ new test over **existing** behaviour |

---

## Wave 0 Requirements

Test infrastructure that must exist before the requirements depending on it:

- [ ] `test/load-ts.cjs` — **lazy-download fix.** `requireElectron()` calls `require('electron')`
      (verified, `load-ts.cjs:30`) expecting a throw under `npm ci --ignore-scripts`. Electron 43's
      `index.js` may download the ~100 MB binary instead. Read `require.cache` directly — which is
      what the function's own comment says it exists for. **Wave 1, first commit, proven green on
      the OLD Electron before the version changes.**
- [ ] `test/load-ts.cjs` — `.tsx` resolution in `resolveTs()` + `ts.JsxEmit.React` (D-25).
      **Wave 1**, folded into the Electron plan since that plan already owns this file.
      Blocks FLOOR-01, FLOOR-07 (panel), FLOOR-13, FLOOR-15.
- [ ] `test/repo-claims.test.cjs` — the D-45 repo-fact accumulator, following the existing
      `test/ci-config.test.cjs` / `test/main-hardening.test.cjs` / `test/engine-parity.test.cjs`
      precedent. Accumulated by **plan 05 (wave 2) → plan 07 (wave 3) → plan 10 (wave 5)**, and
      **asserted whole by plan 23 (wave 9)**. This file is what turns the end-of-phase sweep into
      `npm test` plus one `gh` query.
- [ ] `test/renderer-components.test.cjs` — the `renderToStaticMarkup` harness (D-24). **Plan 22, wave 8.**
- [ ] `test/db-fts.test.cjs` — needs a **real** SQLite handle; `test/config-secrets.test.cjs`'s
      in-memory `FakeDatabase` has no FTS5 and cannot serve it. **Plan 10, wave 5.**
      **No `better-sqlite3` rebuild step is budgeted, and none may be added.** 13.0.3 is N-API,
      ships eight prebuilds and declares no install script, so `npm ci --ignore-scripts` leaves a
      loadable binary in place; `npm rebuild better-sqlite3` would *discard* that prebuild and
      synthesise a `node-gyp rebuild`, which CI can only satisfy on Linux (`setup-python` is pinned
      there only). Plan 01 task 2 and plan 10 both assert
      `grep -c "npm rebuild better-sqlite3" .github/workflows/ci.yml` returns `0`.
- [ ] `test/hooks-notify.test.cjs` — or extend an existing hooks test — with a DI `notify` fake
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

- [ ] All tasks have an `<automated>` verify or a named Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without an automated verify
- [ ] Wave 0 covers all ❌ references above
- [ ] No watch-mode flags anywhere
- [ ] D-09 live Windows run recorded (FLOOR-03 cannot close without it)
- [ ] D-10 Electron-version assertion present in `e2e/smoke.spec.ts`
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
