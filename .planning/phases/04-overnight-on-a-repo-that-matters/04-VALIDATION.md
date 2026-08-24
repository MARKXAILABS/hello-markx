---
phase: 4
slug: overnight-on-a-repo-that-matters
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-25
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `04-RESEARCH.md` § Validation Architecture. Every command below was run,
> or its target file read, in the research session at `ad3d2f7`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node builtin runner) + `node:assert/strict` |
| **Config file** | none — the runner is invoked directly |
| **Loader** | `test/load-ts.cjs` — TypeScript transpile + electron stub (`:46-64`) |
| **Quick run command** | `node --test test/<one>.test.cjs` |
| **Full suite command** | `npm test` (→ `node --test test/*.test.cjs`) |
| **Estimated runtime** | quick ~0.5–4 s · full ~24 s |
| **Measured baseline @ `ad3d2f7`** | **805 tests / 798 pass / 0 fail / 7 skipped (23.7 s)** |
| **Typecheck** | `npm run typecheck` (both projects) — 0 errors |
| **Lint** | `npm run lint` → `eslint . --max-warnings 0` |
| **CI gates** | `ci.yml:62` matrix `[ubuntu, windows, macos]`, no `continue-on-error` on the test job |

**Skipped-count invariant:** the baseline is **7** skipped (all win32, from `{ skip: !POSIX }`).
Any new POSIX-only test raises it. The new count MUST be stated in the phase SUMMARY — a
silently-growing skip count is how a platform stops being tested.

---

## Sampling Rate

- **After every task commit:** `node --test test/<the file that task owns>.test.cjs` (0.5–4 s)
- **After every plan wave:** `npm test` **and** `npm run typecheck` **and** `npm run lint`.
  Full suite, not a subset — this phase edits `hooks.ts`, `delivery.ts` and `pty.ts`, the three
  widest-blast-radius files in the repo.
- **Before `/gsd:verify-work`:** full suite green on **all three CI platforms**, plus the
  operator-owned checks below.
- **Max feedback latency:** 24 s (full suite).

---

## Per-Task Verification Map

> Task IDs are assigned by the planner. Every task in every Phase 4 plan MUST map to one row
> here, and every row's `Automated Command` must be runnable without a watch flag.
> Rows below are the **behaviour contract** the planner must satisfy; the planner fills
> `Task ID` / `Plan` / `Wave` when plans are written.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _tbd_ | _tbd_ | _tbd_ | GATE-02 | T-04-ENV | Allowlist keeps `HIVE_ROOT`/`AGENT_ID`/`PATH` **and** drops `AWS_SECRET_ACCESS_KEY`/`GH_TOKEN`/`ANTHROPIC_API_KEY` | unit | `node --test test/pty-env-allowlist.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | GATE-02 | T-04-ENV | A real PTY's `env` shows the same, both directions | integration | `node --test test/pty-sanitize.test.cjs` | ✅ extend | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | GATE-03 | T-04-CMD | Four shapes denied on tokens; benign forms return null | unit | `node --test test/command-shape.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | GATE-03 | T-04-CMD | Deny reaches a real engine over the real socket | integration | `node --test test/gate03-roundtrip.test.cjs` | ❌ W0 (POSIX) | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | GATE-03 | T-04-CMD | Grok's translator maps the deny to `{decision:'deny'}` | unit | `node --test test/engine-parity.test.cjs` | ✅ extend | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | GATE-03 | T-04-NET | Empty host allowlist fails **closed**, naming the empty config | unit | `node --test test/command-shape.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | GATE-04 | T-04-SBX | argv carries the sandbox flags; opt-in **off** is byte-identical to `ad3d2f7` | unit | `node --test test/agent-provider.test.cjs` | ✅ extend | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | GATE-05 | T-04-ASK | Unanswered ask denies at the deadline, via the real shim's stdout | integration | `node --test test/gate05-bounded-wait.test.cjs` | ❌ W0 (POSIX) | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | GATE-05 | T-04-ASK | Explicit yes allows | integration | `node --test test/gate05-bounded-wait.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | GATE-05 | T-04-ASK | Dead socket still **allows** (D-08 clause 3 — the deliberate fail-open) | integration | `node --test test/gate05-bounded-wait.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | GATE-05 | T-04-ASK | Ask appears on `GET /phone/api/asks`; `POST /phone/api/answer` resolves it | unit | `node --test test/webhook-endpoints.test.cjs` | ✅ extend | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | RECORD-01 | T-04-LOG | Row survives close/reopen **with `target` non-null** | unit | `node --test test/record-persist.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | RECORD-01 | T-04-LOG | Writer fires from a real `PreToolUse` payload through the real `HookServer` | integration | `node --test test/record-persist.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | RECORD-02 | T-04-LOG | A day past 16 MiB reads back **whole**, including its first row | unit | `node --test test/record-retention.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | RECORD-02 | T-04-LOG | Retention deletes only past the bound | unit | `node --test test/record-retention.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | RECORD-05 | T-04-SNAP | Restore 1 of 3 changed files; other 2 byte-identical **and** operator `git status --porcelain` + `rev-parse HEAD` + branch list unchanged | integration | `node --test test/restore-points.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | RECORD-05 | T-04-SNAP | A gitignored fat directory never enters a snapshot (`ls-files` → 0 matches) | integration | `node --test test/restore-points.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | RECORD-05 | T-04-SNAP | An uncommitted nested `git init` does **not** kill the snapshot (exit 0, non-empty `ls-files`) | integration | `node --test test/restore-points.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | VIGIL-01 | T-04-ABS | Silence past threshold alarms **once**: 1 on transition, 0 on next 5 ticks, 1 again after activity→silence | unit | `node --test test/absence-watchdog.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | VIGIL-01 | T-04-ABS | Fires when the **god** is the dead one, addressed to the operator, not `to:'god'` | unit | `node --test test/absence-watchdog.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | VIGIL-01 | T-04-ABS | Alarm payload names the `doing` cards + assignees captured at the transition | unit | `node --test test/absence-watchdog.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | VIGIL-01 | T-04-ABS | The timer is torn down by `floor.shutdown()` | unit | `node --test test/boot-floor.test.cjs` | ✅ extend | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | VIGIL-02 | T-04-CARD | Card released in the teardown tick, naming the dropping agent, **synchronously** | unit | `node --test test/agent-lifecycle.test.cjs` | ✅ extend | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | VIGIL-02 | T-04-CARD | Follow-up patch carries `worktreeHasUnintegratedWork`'s branch/detail | unit | `node --test test/agent-lifecycle.test.cjs` | ✅ extend | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | VIGIL-03 | T-04-BLK | A blocked agent is **not** idled by quiesce (`setStatus` never called, Stop not emitted) | unit | `node --test test/delivery-main.test.cjs` | ✅ extend | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | VIGIL-03 | T-04-BLK | A blocked agent is **not** mailed more work (`WAKE_NUDGE` never written) | unit | `node --test test/delivery-main.test.cjs` | ✅ extend | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | VIGIL-03 | T-04-BLK | Detection works with **no renderer** attached | unit | `node --test test/block-detect.test.cjs` | ❌ W0 | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | VIGIL-04 | T-04-AGE | `add`/`patch`/`claim`/`done` **each** stamp ISO `updatedAt` ≥ `createdAt` | unit | `node --test test/hive-task-mutation.test.cjs` | ✅ extend | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | VIGIL-04 | T-04-AGE | Age renders on cards (9 h) and unanswered asks (4 min) | unit | `node --test test/renderer-components.test.cjs` | ✅ extend | ⬜ pending |
| _tbd_ | _tbd_ | _tbd_ | all | — | `MARKER_LEDGER` still matches reality; new `LIVE-UNVERIFIED` markers added in the same commit | repo-fact | `node --test test/repo-claims.test.cjs` | ✅ must edit | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Anti-Vacuous-Pass Rules (D-33 / D-40, binding)

Every row above carries an **absence signature** in `04-RESEARCH.md` § Phase requirements → test map:
what a *vacuous* version of that test would look like. These are the ones that bite hardest:

| Requirement | The test that could pass while the feature does nothing |
|---|---|
| GATE-02 | Asserting only that secrets are **absent** — passes against a filter returning `{}`, and against a PTY that never spawned. **Assert the positive lower bound too.** |
| GATE-03 | Only deny cases — passes against a function that returns a string unconditionally. **Assert the benign forms return null.** |
| GATE-03/05 | Calling `handle()` directly — proves the judge, not the loop. **Drive the real shim as a child process into the real `HookServer`** (`test/hook-auth-roundtrip.test.cjs:95` is the model). |
| GATE-04 | argv asserted but never spawned — the GATE-01-shaped failure this project names. **A live run is required.** |
| RECORD-01 | Asserting row count — passes with a null `target`, which is the half the requirement exists for. |
| RECORD-02 | Asserting a tail returns rows — that is exactly what the 8 MiB rotate already does. **Assert the FIRST row of the day.** |
| RECORD-05 | Asserting only the restored file — passes while the other two were clobbered. |
| VIGIL-01 | Asserting "an alarm fired" without the next tick — misses per-tick spam. |
| VIGIL-03 | **If `test/delivery-main.test.cjs`'s new blocked-agent test PASSES before the fix lands, the fixture is wrong** — it must fail against `delivery.ts:740` as it stands today. |
| VIGIL-04 | Testing one verb leaves the other three unstamped. |

---

## Wave 0 Requirements

- [ ] `test/pty-env-allowlist.test.cjs` — GATE-02, both directions
- [ ] `test/command-shape.test.cjs` — GATE-03, four shapes + negatives + empty-allowlist-fails-closed
- [ ] `test/gate03-roundtrip.test.cjs` — GATE-03, real shim → real server (`{ skip: !POSIX }`)
- [ ] `test/gate05-bounded-wait.test.cjs` — GATE-05, deadline-denies / yes-allows / dead-socket-allows (`{ skip: !POSIX }`)
- [ ] `test/record-persist.test.cjs` — RECORD-01, survives close/reopen **with target**
- [ ] `test/record-retention.test.cjs` — RECORD-02, day range scan + bounded delete
- [ ] `test/restore-points.test.cjs` — RECORD-05, D-22 sequence + gitignore + **nested-repo survival**
- [ ] `test/absence-watchdog.test.cjs` — VIGIL-01, once-only + god-death + in-flight payload
- [ ] `test/block-detect.test.cjs` — VIGIL-03, detection with no renderer
- [ ] **Spike (not a test file):** `codex -s workspace-write --add-dir <agentDir>` on this machine — decides whether GATE-04 ships live-verified or `LIVE-UNVERIFIED` citing openai/codex#23552

**No framework install needed. No `package.json` edit (D-36).** Every new file follows
`test/boot-floor.test.cjs`'s per-test isolated `(userData, harnessHome)` pattern (`:71-85`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A live codex agent with the sandbox on finishes a task, mails, and writes `memory.md` with **no write refused** | GATE-04 | No automated harness can spawn an authenticated codex agent against a real workspace | Hire one codex agent with the opt-in on; assign a card; confirm task done + mail delivered + `memory.md` written. Codex 0.128.0 is installed and logged in here. |
| One live **non-Claude** agent still authenticates and completes a task after the env allowlist lands | GATE-02 | D-13's explicit condition — the regression this change is most likely to cause | Same codex agent, opt-in off. If it cannot authenticate, the pass-through list is wrong (L-04). |
| GATE-05 approval answered on a **physical Android phone** | GATE-05 | The PWA service worker updates on its own schedule; no local reproduction | Trigger an ask, answer it from the phone. **"Verification needs a real device" is a first-class outcome here, not a failure.** |
| GATE-03 denial honoured by grok / pi / OpenCode | GATE-03 | None of those CLIs are installed on this machine and grok needs an xAI key | Not runnable. Ship `LIVE-UNVERIFIED` markers and update `MARKER_LEDGER` in the same commit. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or a named Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all ❌ references above
- [ ] No watch-mode flags in any command
- [ ] Feedback latency < 24 s
- [ ] Skipped-count delta from the 7-skip baseline is stated in the SUMMARY
- [ ] `nyquist_compliant: true` set in frontmatter (flip only after the plan-checker confirms Dimension 8)

**Approval:** pending
