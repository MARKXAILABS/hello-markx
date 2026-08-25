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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Origin | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-05-T1 | 04-05 | 1 | GATE-02 | T-04-ENV | Allowlist keeps `HIVE_ROOT`/`AGENT_ID`/`PATH` **and** drops `AWS_SECRET_ACCESS_KEY`/`GH_TOKEN`/`ANTHROPIC_API_KEY` | unit | `node --test test/pty-env-allowlist.test.cjs` | W0 -> 04-05-T1 | pending |
| 04-05-T2 | 04-05 | 1 | GATE-02 | T-04-ENV | A real PTY's `env` shows the same, both directions | integration | `node --test test/pty-sanitize.test.cjs` | extend | pending |
| 04-06-T1 | 04-06 | 2 | GATE-03 | T-04-CMD | Four shapes denied on tokens; benign forms return null | unit | `node --test test/command-shape.test.cjs` | W0 -> 04-06-T1 | pending |
| 04-06-T3 | 04-06 | 2 | GATE-03 | T-04-CMD | Deny reaches a real engine over the real socket | integration | `node --test test/gate03-roundtrip.test.cjs` | W0 -> 04-06-T3 (POSIX) | pending |
| 04-10-T2 | 04-10 | 3 | GATE-03 | T-04-CMD | Grok's translator maps the deny to `{decision:'deny'}` | unit | `node --test test/engine-parity.test.cjs` | extend | pending |
| 04-06-T1 | 04-06 | 2 | GATE-03 | T-04-NET | Empty host allowlist fails **closed**, naming the empty config | unit | `node --test test/command-shape.test.cjs` | W0 -> 04-06-T1 | pending |
| 04-13-T2 | 04-13 | 4 | GATE-04 | T-04-SBX | argv carries the sandbox flags; opt-in **off** is byte-identical to `ad3d2f7` | unit | `node --test test/agent-provider.test.cjs` | extend | pending |
| 04-16-T2 | 04-16 | 5 | GATE-05 | T-04-ASK | Unanswered ask denies at the deadline, via the real shim's stdout | integration | `node --test test/gate05-bounded-wait.test.cjs` | W0 -> 04-16-T2 (POSIX) | pending |
| 04-16-T2 | 04-16 | 5 | GATE-05 | T-04-ASK | Explicit yes allows | integration | `node --test test/gate05-bounded-wait.test.cjs` | W0 -> 04-16-T2 | pending |
| 04-16-T2 | 04-16 | 5 | GATE-05 | T-04-ASK | Dead socket still **allows** (D-08 clause 3 -- the deliberate fail-open) | integration | `node --test test/gate05-bounded-wait.test.cjs` | W0 -> 04-16-T2 | pending |
| 04-17-T1 | 04-17 | 5 | GATE-05 | T-04-ASK | Ask appears on `GET /phone/api/asks`; `POST /phone/api/answer` resolves it | unit | `node --test test/webhook-endpoints.test.cjs` | extend | pending |
| 04-02-T3 | 04-02 | 1 | RECORD-01 | T-04-LOG | Row survives close/reopen **with `target` non-null** | unit | `node --test test/record-persist.test.cjs` | W0 -> 04-02-T3 | pending |
| 04-15-T3 | 04-15 | 4 | RECORD-01 | T-04-LOG | Writer fires from a real `PreToolUse` payload through the real `HookServer` | integration | `node --test test/record-persist.test.cjs` | W0 04-02-T3, driven 04-15-T3 | pending |
| 04-09-T3 | 04-09 | 2 | RECORD-02 | T-04-LOG | A day past 16 MiB reads back **whole**, including its first row | unit | `node --test test/record-retention.test.cjs` | W0 04-02-T3, driven 04-09-T3 | pending |
| 04-02-T3 | 04-02 | 1 | RECORD-02 | T-04-LOG | Retention deletes only past the bound | unit | `node --test test/record-retention.test.cjs` | W0 -> 04-02-T3 | pending |
| 04-09-T1 | 04-09 | 2 | RECORD-05 | T-04-SNAP | Restore 1 of 3 changed files; other 2 byte-identical **and** operator `git status --porcelain` + `rev-parse HEAD` + branch list unchanged | integration | `node --test test/restore-points.test.cjs` | W0 -> 04-09-T1 | pending |
| 04-09-T1 | 04-09 | 2 | RECORD-05 | T-04-SNAP | A gitignored fat directory never enters a snapshot (`ls-files` gives 0 matches) | integration | `node --test test/restore-points.test.cjs` | W0 -> 04-09-T1 | pending |
| 04-09-T1 | 04-09 | 2 | RECORD-05 | T-04-SNAP | An uncommitted nested `git init` does **not** kill the snapshot (exit 0, non-empty `ls-files`) | integration | `node --test test/restore-points.test.cjs` | W0 -> 04-09-T1 | pending |
| 04-11-T1 | 04-11 | 3 | VIGIL-01 | T-04-ABS | Silence past threshold alarms **once**: 1 on transition, 0 on next 5 ticks, 1 again after activity-then-silence | unit | `node --test test/absence-watchdog.test.cjs` | W0 -> 04-11-T1 | pending |
| 04-11-T1 | 04-11 | 3 | VIGIL-01 | T-04-ABS | Fires when the **god** is the dead one, addressed to the operator, not `to:'god'` | unit | `node --test test/absence-watchdog.test.cjs` | W0 -> 04-11-T1 | pending |
| 04-11-T1 | 04-11 | 3 | VIGIL-01 | T-04-ABS | Alarm payload names the `doing` cards + assignees captured at the transition | unit | `node --test test/absence-watchdog.test.cjs` | W0 -> 04-11-T1 | pending |
| 04-11-T2 | 04-11 | 3 | VIGIL-01 | T-04-ABS | The timer is torn down by `floor.shutdown()` | unit | `node --test test/boot-floor.test.cjs` | extend | pending |
| 04-08-T3 | 04-08 | 2 | VIGIL-02 | T-04-CARD | Card released in the teardown tick, naming the dropping agent, **synchronously** | unit | `node --test test/agent-lifecycle.test.cjs` | extend | pending |
| 04-08-T3 | 04-08 | 2 | VIGIL-02 | T-04-CARD | Follow-up patch carries `worktreeHasUnintegratedWork`'s branch/detail | unit | `node --test test/agent-lifecycle.test.cjs` | extend | pending |
| 04-03-T1 | 04-03 | 1 | VIGIL-03 | T-04-BLK | A blocked agent is **not** idled by quiesce (`setStatus` never called, Stop not emitted) | unit | `node --test test/delivery-main.test.cjs` | extend, **MUST be RED first** | pending |
| 04-03-T1 | 04-03 | 1 | VIGIL-03 | T-04-BLK | A blocked agent is **not** mailed more work (`WAKE_NUDGE` never written) | unit | `node --test test/delivery-main.test.cjs` | extend, **MUST be RED first** | pending |
| 04-07-T3 | 04-07 | 2 | VIGIL-03 | T-04-BLK | Detection works with **no renderer** attached | unit | `node --test test/block-detect.test.cjs` | W0 -> 04-07-T3 | pending |
| 04-04-T3 | 04-04 | 1 | VIGIL-04 | T-04-AGE | `add`/`patch`/`claim`/`done` **each** stamp ISO `updatedAt` >= `createdAt` | unit | `node --test test/hive-task-mutation.test.cjs` | extend | pending |
| 04-12-T3 | 04-12 | 3 | VIGIL-04 | T-04-AGE | Age renders on cards (9 h) and unanswered asks (4 min) | unit | `node --test test/renderer-components.test.cjs` | extend | pending |
| 04-10-T3 / 04-13-T3 / 04-19-T2 | 04-10 / 04-13 / 04-19 | 3 / 4 / 7 | all | -- | `MARKER_LEDGER` still matches reality; new `LIVE-UNVERIFIED` markers added in the same commit | repo-fact | `node --test test/repo-claims.test.cjs` | must edit | pending |

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

**Planner deviation, stated rather than performed silently.** The original Wave 0 named nine new test
files that must exist "before or alongside the work they verify". A separate wave-0 plan creating all
nine with real assertions would leave `npm test` **red for the entire phase** -- and this project's bar
is *0 failures at every checkpoint, with no pre-existing-failure allowance*. So the nine files are
created **RED-first inside the plan that implements the behaviour they test** (the `File Origin` column
above names the owning task). That satisfies "alongside", keeps every wave boundary green, and
preserves the RED-drive discipline every Phase 1 and Phase 2 SUMMARY in this repo already follows.
**Each owning plan's acceptance criteria require the RED run to be recorded verbatim in its SUMMARY.**

Wave 0 proper (**plan 04-01**) therefore carries the two things that genuinely cannot wait:

- [ ] **The spike (04-01 task 1):** `codex exec -s workspace-write --add-dir <agentDir>` on this
      machine, with a **negative control** run without `--add-dir`. It decides whether GATE-04 (plan
      04-13) ships live-verified or `LIVE-UNVERIFIED` citing **openai/codex#23552**. Produces
      `04-SPIKE-codex-sandbox.md` with a single `VERDICT:` line that plan 04-13 reads rather than guesses.
- [ ] **`test/gate-harness.cjs` (04-01 task 2):** the real-shim-child into real-`HookServer` driver,
      extracted from `test/hook-auth-roundtrip.test.cjs:65-125`. Two known consumers
      (`test/gate03-roundtrip.test.cjs`, `test/gate05-bounded-wait.test.cjs`) and no in-repo precedent
      for a re-connecting shim (`04-PATTERNS.md` No Analog Found). **Deliberately not named
      `*.test.cjs`**, so it adds zero cases to `npm test`.

The nine RED-first files and their owners:

| File | Owning plan / task | Wave | POSIX-only |
|---|---|---|---|
| `test/pty-env-allowlist.test.cjs` | 04-05 / T1 | 1 | no |
| `test/record-persist.test.cjs` | 04-02 / T3 | 1 | no |
| `test/record-retention.test.cjs` | 04-02 / T3 | 1 | no |
| `test/command-shape.test.cjs` | 04-06 / T1 | 2 | no |
| `test/gate03-roundtrip.test.cjs` | 04-06 / T3 | 2 | **yes** |
| `test/block-detect.test.cjs` | 04-07 / T3 | 2 | no |
| `test/restore-points.test.cjs` | 04-09 / T1 | 2 | no |
| `test/absence-watchdog.test.cjs` | 04-11 / T1 | 3 | no |
| `test/gate05-bounded-wait.test.cjs` | 04-16 / T2 | 5 | **yes** |

**Skipped-count impact:** exactly two files are POSIX-gated, so the 7-skip baseline rises by their
case counts and by nothing else. Plans 04-06 and 04-16 each state their own delta; plan 04-19 states
the phase total. A silently-growing skip count is how a platform stops being tested.

**One addition the original Wave 0 did not name:** `ApprovalRegistry`'s unit coverage (unguessable
single-use ids, TTL expiry, `PHONE_TASK_ID_RE` conformance) extends the existing
**`test/control.test.cjs`** rather than adding a tenth file -- that file is already the house analog
for a pure, electron-free main module driven with an injected clock. Owned by plan 04-15 / T1, wave 4.

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

**Approval:** planned 2026-08-25 -- **19 plans, 7 waves, 55 tasks**. Every behaviour row above is claimed
by a named task. `nyquist_compliant` stays **false** until the plan-checker confirms Dimension 8; plan
04-19 task 2 flips it, and only against evidence.
