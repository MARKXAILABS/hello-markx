---
phase: 04-overnight-on-a-repo-that-matters
plan: 15
subsystem: main-process security gates
tags: [GATE-05, RECORD-01, approvals, hooks, audit]
requires:
  - "04-02: PersistStore.recordToolCall / toolCalls (tool_calls at user_version 3)"
  - "04-06: commandShapeDenial's {kind:'deny'|'ask'} verdict and the openAsk seam"
  - "04-01: test/gate-harness.cjs (withHookServer, real socket on win32)"
provides:
  - "src/main/approvals.ts — ApprovalRegistry: unguessable, single-use, self-expiring, owner-checked"
  - "src/main/hiveProvisioning.ts — PRETOOLUSE_HOOK_TIMEOUT_SEC, CLAUDE_PRETOOLUSE_TIMEOUT_SEC, MIN_PRETOOLUSE_SEC, ASK_TTL_MS"
  - "HookServer.openApprovals() / HookServer.answerApproval() — the named accessors 04-17 and 04-18 read"
  - "HookServer constructor seams: recordToolCall (RECORD-01 sink) and publishApproval (04-17/04-20 wire these)"
  - "the ApprovalPoll hook event and the dual-reading hive_ask reply"
affects:
  - "04-16 (the shim poll loop): hive_ask.{id,deadlineMs,pollMs} and the ApprovalPoll wire shape"
  - "04-17 (phone/openAsks) and 04-18 (desktop IPC): openApprovals()/answerApproval()"
  - "04-20 (composition root): recordToolCall + publishApproval arguments; openAsk must NOT be wired"
tech-stack:
  added: []
  patterns:
    - "node:crypto randomBytes capability ids (same discipline as push.ts's VAPID)"
    - "injected clock + injected publisher (floor/deps.ts house law)"
    - "optional trailing constructor seams (hooks.ts:554-561's stated rule)"
key-files:
  created:
    - src/main/approvals.ts
  modified:
    - src/main/hooks.ts
    - src/main/hiveProvisioning.ts
    - test/control.test.cjs
    - test/record-persist.test.cjs
decisions:
  - "PATH A for Claude, taken only after reading the unit out of the installed binary: claude 2.1.236's hook runners compute `e.timeout * 1000`, so the key is SECONDS; the command-hook default is 600000ms, not the 60000ms the plan assumed."
  - "The ask reply's permissionDecisionReason is the JUDGE'S OWN sentence, not the plan's generic string — it keeps the operator's diagnosis and keeps gate03-roundtrip's byte-for-byte assertion as live evidence that the reply is a valid deny."
  - "ApprovalRegistry.poll takes the owner as a REQUIRED argument rather than an optional one: an optional check is a check that is skipped by forgetting it."
  - "An expired or answered ask APPENDS its final verdict to tool_calls rather than rewriting the ask row: PersistStore exposes no UPDATE and db.ts has exactly one owner for this phase (04-02)."
metrics:
  duration: "~2h"
  completed: 2026-08-25
  tasks: 3
  commits: 3
  tests_before: "970 total / 963 pass / 0 fail / 7 skipped"
  tests_after: "1003 total / 996 pass / 0 fail / 7 skipped"
---

# Phase 04 Plan 15: GATE-05's Main-Side Half and RECORD-01's Writer — Summary

GATE-03's `ask` verdict now has somewhere to hang: an electron-free
`ApprovalRegistry` with 128-bit single-use ids, a synchronous reply that an
un-upgraded shim reads as a deny and an upgraded one reads as a poll handle, an
`ApprovalPoll` branch with the owner check `authorized()` structurally cannot
make, an ask TTL derived from the shortest engine budget this app actually
writes — and every PreToolUse verdict persisted to `tool_calls` with a
token-derived agent id, a real target and its final decision.

## Commits

| Task | Commit | What |
|---|---|---|
| 1 | `c530a64` | `approvals.ts` — the registry, its TTL, its unguessable single-use ids |
| 2 | `b6a01b2` | the ask reply, the `ApprovalPoll` branch, the engine budgets and the derived TTL, GATE-05's ceiling (a)-(h) |
| 3 | `1ea60e6` | RECORD-01's writer at all five PreToolUse exits, and the sweep that makes an unanswered ask auditable |

Diffstat against the wave base `0ab5346` — exactly the five files in
`files_modified`, no more:

```
 src/main/approvals.ts        | 226 +++++
 src/main/hiveProvisioning.ts | 109 +++-
 src/main/hooks.ts            | 439 ++++++++-
 test/control.test.cjs        | 570 ++++++++++++
 test/record-persist.test.cjs | 264 ++++++
```

## The four numbers, and where each came from

| Bound | Value | Provenance |
|---|---|---|
| `PRETOOLUSE_HOOK_TIMEOUT_SEC` | **150 s** | `[ASSUMED]` — the smallest round number leaving a workable phone window. Verified IN BOUNDS against codex's own resolver (below) |
| `CLAUDE_PRETOOLUSE_TIMEOUT_SEC` | **150 s** (path A) | This app now writes it. The UNIT was measured, not assumed — see below |
| `MIN_PRETOOLUSE_SEC` | **150 s** | `Math.min` of the two above. grok and agy are excluded because their shims do not poll |
| `ASK_TTL_MS` | **120 000 ms** | Derived: `(MIN_PRETOOLUSE_SEC - 30) * 1000`. The 30 s margin covers shim cold-start (0.6-0.7 s under 8 concurrent spawns, measured in `hiveProvisioning.ts`) plus the final poll round trip |
| `deadlineMs` handed to the shim | `entry.expiresAt` | Read off the registry entry, never recomputed |
| `pollMs` | **1 000 ms** | One fresh short connection per second per pending ask |

Per-engine dispositions, all shipped:

| Engine | PreToolUse timeout after this plan | Shim polls? |
|---|---|---|
| Claude | `timeout: 150` written into `hookSettings`' PreToolUse entry only | yes |
| codex | `timeout = 150` for PreToolUse, `30` for the other seven | yes |
| kimi | `timeout = 150` for PreToolUse, `30` for the other seven | yes |
| grok | **unchanged — no key at all** | **no** (ceiling item (e)) |
| agy | **unchanged — `timeout: 0`, twice** | **no** (ceiling item (e)) |
| pi, OpenCode | no hook timeout surface | **no** (ceiling item (a)) |

## Path A, and the measurement that unlocked it

The plan made path A conditional on confirming Claude's `timeout` unit against
the installed binary. It was confirmed:

```
$ claude --version
2.1.236 (Claude Code)

$ grep -a -o -E "timeout\?e\.timeout\*1000:[a-z_0-9]+" \
    "$(npm root -g)/@anthropic-ai/claude-code/bin/claude.exe"
timeout?e.timeout*1000:30000     # prompt hook
timeout?e.timeout*1000:60000     # agent hook
timeout?e.timeout*1000:g_        # COMMAND hook — the branch that builds
                                 # CLAUDE_PROJECT_DIR and honours
                                 # CLAUDE_CODE_SHELL_PREFIX
$ grep -a -o -E "g_=[0-9]{3,7}," claude.exe
g_=600000,
```

Every hook runner in claude 2.1.236 multiplies the key by 1000, so **the unit is
seconds**. The command-hook default is **600 000 ms = 600 s**, not the 60 s the
plan's table asserted — which makes the pre-change position safer than the plan
believed, and changes nothing about the direction: an inherited default is one a
release can move without telling us, so this app now writes the number. The word
`unreconciled` appears nowhere in `src/main/` (`grep -ri 'unreconciled' src/main/`
→ **0**, asserted by a test that walks the tree).

## The codex resolver check — no model spend

Run against a temp `CODEX_HOME` seeded by `installCodexHooks`, driving
`codex app-server` → `initialize` → `hooks/list`. `codex --version` →
**codex-cli 0.128.0**. Reported `timeoutSec` per event, verbatim:

| eventName | timeoutSec |
|---|---|
| `preToolUse` | **150** |
| `postToolUse` | 30 |
| `sessionStart` | 30 |
| `userPromptSubmit` | 30 |
| `stop` | 30 |

150 is accepted and normalized as seconds, well inside codex's own 600 s
`unwrap_or` default. **Observation, unrelated to this plan and pre-existing:**
codex 0.128.0's `hooks/list` reports only five of the eight groups this app
writes — `subagentStop`, `preCompact` and `postCompact` are absent from its event
vocabulary, so those three `[[hooks.*]]` tables have been inert since the bridge
shipped. Logged to `deferred-items.md`; out of scope here.

## RED runs and mutation probes

Task 1 was written RED-first. Tasks 2 and 3 were written source-first, and rather
than claim a RED that did not happen, each load-bearing assertion was **proved by
mutation** — the source was broken deliberately and the suite was watched go red.
All probes were reverted and the suite re-verified green afterwards.

| Task | Evidence | Result |
|---|---|---|
| 1 | RED: tests written before `src/main/approvals.ts` existed | `tests 1 / pass 0 / fail 1` (ENOENT on the module) |
| 1 | GREEN | `tests 14 / pass 14 / fail 0` |
| 2 | probe: drop the owner check (`entry.agentId !== agentId`) from `poll` | **2 fail** (registry case + HookServer case) |
| 2 | probe: recompute `deadlineMs` as `Date.now() + ASK_TTL_MS` | **0 fail — the assertion did not bite.** See below |
| 2 | after adding the stepping-clock case, same probe | **1 fail** |
| 3 | probe: drop the expiry record from `sweepApprovals` | **1 fail** |
| 3 | probe: forge `agentId` in `record()` | **4 fail** |

**The one real defect this found in my own tests.** `assert.equal(hive_ask.deadlineMs,
entry.expiresAt)` passes against a *recomputed* deadline, because `openedAt` and
the recompute land in the same millisecond — exactly the vacuous pass the plan
warns about elsewhere. Fixed by driving that case under a clock that steps 10 s
per read, so only a deadline read **off the entry** can still equal `expiresAt`.
The case carries that history in its own comment.

## Acceptance measurements

Every ceiling grep, measured at the wave base and after. **The plan's stated HEAD
baselines were stale** (they were taken before wave 2 merged): it expected
`OpenCode` 2, `grok` 4, `agy` 3. Measured at `0ab5346` they were 4, 7 and 5. The
thresholds below use the *measured* baseline, so each still has to be beaten.

| Check | HEAD (`0ab5346`) | After | Required |
|---|---|---|---|
| `grep -c 'MIN_PRETOOLUSE_SEC' src/main/hooks.ts` | 0 | **1** | ≥ 1 ✅ |
| `grep -ci 'do not poll' src/main/hooks.ts` | 0 | **1** | ≥ 1 ✅ |
| `grep -ci 'degrades to' src/main/hooks.ts` | 2 | **3** | ≥ 3 ✅ |
| `grep -ci 'OpenCode' src/main/hooks.ts` | 4 | **8** | > 4 ✅ |
| `grep -ci 'grok' src/main/hooks.ts` | 7 | **14** | > 7 ✅ |
| `grep -ci 'agy' src/main/hooks.ts` | 5 | **11** | > 5 ✅ |
| `grep -c 'ASK_TTL_MS' src/main/hooks.ts` | 0 | **2** | ≥ 1 ✅ |
| `grep -c 'ttlMs' src/main/hooks.ts` | 0 | **3** | ≥ 1 ✅ |
| `grep -o 'this\.record(' \| wc -l` | 0 | **7** | ≥ 5 ✅ |
| `grep -c '\.sweep(' src/main/hooks.ts` | 0 | **2** | ≥ 1 ✅ |
| `grep -c 'async handle' src/main/hooks.ts` | 0 | **0** | 0 ✅ |
| `grep -c 'writePty' src/main/hooks.ts` | 0 | **0** | unchanged ✅ (ADR-0001) |
| `grep -cE "from './db'" src/main/hooks.ts` | 0 | **0** | 0 ✅ |
| `grep -c "from 'electron'" src/main/approvals.ts` | — | **0** | 0 ✅ |
| `grep -ri 'unreconciled' src/main/ \| wc -l` | 0 | **0** | 0 ✅ |
| `LIVE-UNVERIFIED` added to `src/` | — | **0** | 0 ✅ (`repo-claims` four-way pin untouched) |
| `HOOK_IDLE_MS` value | `2_000` | `2_000` | unchanged ✅ |
| symbol-bounded: `installAgyHooks` `timeout: 0` | 2 | **2** | unchanged ✅ |
| symbol-bounded: `installGrokHooks` `timeout` | 0 | **0** | unchanged ✅ |
| `git diff --stat` telemetry / hiveTemplates / webhook / index / control / boot / db | — | **empty** | empty ✅ |

`HOOK_IDLE_MS` occurrence *count* moved 3 → 4 because `ASK_POLL_MS`'s doc block
references it; the constant's value and every use of it are untouched.

Gates, all run at the final commit:

- `npm test` → **1003 tests, 996 pass, 0 fail, 7 skipped** (base: 970 / 963 / 0 / 7)
- `npm run typecheck` → 0 errors
- `npm run lint` → exit 0
- `node --test test/suite-integrity.test.cjs` → 4/4, `FROZEN` and `DECLARED_SKIPS` unchanged
- `node --test test/engine-parity.test.cjs` → 52/52
- `node --test test/record-persist.test.cjs` → 14/14, **skipped 0**

Case counts: `test/control.test.cjs` 2 → 28 (+26), `test/record-persist.test.cjs`
7 → 14 (+7 new `test(` blocks, +8 counted cases). Skip census unchanged, so
`01-VALIDATION.md`'s frozen ceiling needs no edit.

## Deviations from Plan

### 1. [Rule 2 — security] `poll()` takes the owner as a REQUIRED argument

- **Plan said:** `poll(id: string): 'pending' | 'allow' | 'deny'`.
- **Shipped:** `poll(id: string, agentId: string)`.
- **Why:** the plan's own `<action>` requires the poll branch to compare the
  derived agent against `PendingApproval.agentId`. Putting that comparison in the
  caller leaves it skippable by forgetting it, and there is exactly one caller.
  Making the owner a required parameter is the root-cause form of the same fix.
- **Commit:** `c530a64`.

### 2. [Rule 2 — correctness] `sweep()` returns the entries it settled

- **Plan said:** `sweep(now: number): void`.
- **Shipped:** `sweep(now: number): PendingApproval[]`.
- **Why:** RECORD-01's writer has to know *which* asks expired in order to record
  their denials, and `approvals.ts` must not learn about a database. A `void`
  consumer is unaffected.
- **Commit:** `c530a64`.

### 3. [Rule 1 — the plan's literal would regress behaviour] the ask reply carries the JUDGE'S reason

- **Plan said:** `permissionDecisionReason: 'Approval required and this shim
  cannot wait for one — denied. Re-run after the floor upgrades its shims…'`
- **Shipped:** `permissionDecisionReason: verdict.reason` — byte-identical to
  what the same shape returned before this plan.
- **Why, two reasons:** (a) the generic string tells an operator reading a
  refused agent's transcript nothing about *which* rule refused it, which is a
  strict loss against today; (b) `test/gate03-roundtrip.test.cjs` asserts that
  reason **byte for byte** off a real shim's stdout, and
  `test/command-shape.test.cjs` asserts the same at unit level. Keeping the
  judge's sentence means both files stay green **unmodified** — which is the
  strongest available evidence that the ask reply really is a valid deny to an
  un-upgraded shim. Changing them to accept a new string would have been
  modifying tests to fit the source. The upgrade notice lives on the poll path,
  where only a shim that already understands `hive_ask` can read it.
- **Commit:** `b6a01b2`.

### 4. [Rule 4 boundary respected] an expired/answered ask APPENDS its verdict instead of rewriting the row

- **Plan said:** *"When `sweep` settles an entry to deny, rewrite that ask's
  `tool_calls` row's `decision` and `reason`."*
- **Shipped:** a second row is appended carrying the final verdict, the same
  agent, the same tool and the same target.
- **Why:** `PersistStore` exposes `recordToolCall` (INSERT) and `toolCalls`
  (SELECT) and no UPDATE. Adding one would mean editing `src/main/db.ts`, and
  plan 04-02 declares itself *"`src/main/db.ts`'s sole owner for the entire
  phase"* — `db.ts` is not in this plan's `files_modified`. It is also the better
  record: 04-02's own ADR-0005 note says these rows are **discrete events, not
  cumulative snapshots**, and "a1 asked to run X at T1; that ask was denied at
  T2" is strictly more than a mutated row that has forgotten the question was
  ever open. `toolCalls()` returns newest-first, so the latest row for a call is
  its final verdict.
- **What the acceptance criterion asked for and what was asserted instead:** the
  criterion says *"the same row reads `decision === 'deny'` — asserted by
  re-reading the row"*. The shipped test re-reads the ledger after the TTL
  expires and asserts **two** rows: `[0].decision === 'deny'` with a non-empty
  reason and the right target, and `[1].decision === 'ask'`. The requirement's
  property — *an ask that expires unanswered ends as a denial in `tool_calls`,
  not as `'ask'` forever* — holds. **If the phase wants the literal in-place
  rewrite, it needs a `settleToolCall` on `PersistStore` and therefore an owner
  for `db.ts` in a later wave.** Flagged for the verifier rather than papered
  over.
- **Commit:** `1ea60e6`.

### 5. [Rule 3 — sequencing] the TTL-relationship cases landed in task 2's commit, not task 1's

Task 1's acceptance list includes the three-part TTL assertion, but those
constants are declared in `hiveProvisioning.ts`, which is task 2's file, and task
2's own rule is that the constant is declared and consumed **in one commit**.
Splitting would have left a commit that does not typecheck. Both halves are
green at the end of the plan.

### 6. [Rule 2 — auditability] an OPERATOR'S answer is recorded too

`answerApproval()` records the resulting `allow`/`deny`. The plan only required
the expiry path, but an approved ask whose only row reads `'ask'` is a question
the audit trail never sees answered — the same repudiation hole, on the happy
path. One `record()` call.

### 7. [scope] `test/gate-harness.cjs` was NOT edited

`withHookServer` constructs `HookServer` with the eight arguments that existed
when plan 04-01 wrote it, so this plan's optional trailing seams
(`hostAllowlist`, `recordToolCall`) are assigned onto the returned instance in
`test/record-persist.test.cjs` instead. They are TypeScript parameter properties,
i.e. ordinary own fields on exactly the object the constructor would have set, so
the wiring is identical; and the harness stays 04-01's file. The comment in the
test states this.

## Contracts downstream plans should read before writing a line

- **04-16 (the shim):** the reply is `{ hookSpecificOutput: {...deny...},
  hive_ask: { id, deadlineMs, pollMs: 1000 } }`. The poll event is
  `{ hook_event_name: 'ApprovalPoll', ask_id, sock_token }` on a **fresh short
  connection per poll**. The server answers `{ status: 'pending' }`, or
  `{ status: 'allow'|'deny', hookSpecificOutput: {...} }` — the shim can forward
  `hookSpecificOutput` verbatim. grok and agy stay byte-identical and must not
  poll.
- **04-17 / 04-18:** `floor.hookServer.openApprovals()` and
  `floor.hookServer.answerApproval(id, approved)`. `PendingApproval` is exported
  from `src/main/approvals.ts`. No `Floor` interface change, no `boot.ts` line.
- **04-20:** append **two** arguments after `openAsk` —
  `recordToolCall?: (row: { agentId; ts; tool; target: string|null;
  decision: 'allow'|'deny'|'ask'; reason? }) => void` and
  `publishApproval?: (open: PendingApproval[]) => void`. **Do NOT wire `openAsk`.**
  `HookServer` supplies that handler itself now; an override there replaces the
  registry entry, the poll handle and the operator page in one argument, i.e.
  GATE-05 switched off from the composition root. `recordToolCall` must be a
  closure read at call time — `persist` is assigned after the construction.
  `ASK_TTL_MS` is already in force; 04-20's job is to assert the effect
  (`expiresAt - openedAt === ASK_TTL_MS`) on a really-booted floor, which the
  unit-level half already asserts here.

## Known Stubs

None. Every seam this plan declares either has a production implementation in
this plan (`openAsk` → `openApproval`, the registry, the poll branch, the ceiling)
or is an optional trailing constructor argument whose absence is a documented,
tested behaviour (`recordToolCall` absent → no rows, gates unchanged;
`publishApproval` absent → nothing paged, verdicts unchanged). Neither is a
placeholder rendering into a UI.

## Threat Flags

| Flag | File | Description |
|---|---|---|
| threat_flag: new-endpoint | `src/main/hooks.ts` | `ApprovalPoll` is a NEW hook event on the existing socket. It is behind `authorized()` like every other payload, and additionally behind an ask-owner check. Its reply distinguishes `pending` from a final verdict, which is one bit about whether an id exists **for that agent** — an unowned or unknown id is answered identically (`deny`), so nothing leaks across agents. Named here because it is new attack surface the phase's threat register describes but had not yet shipped. |
| threat_flag: capability-over-ipc | `src/main/hooks.ts` | `answerApproval(id, approved)` is a new public method reachable from `index.ts` (phone HTTP, desktop IPC) once 04-17/04-18 wire it. The ask id is the entire capability on those two paths — this is GATE-05 ceiling item (f), written into the source. |

## Self-Check: PASSED

Files claimed created/modified, verified present at the final commit:

- `src/main/approvals.ts` — FOUND
- `src/main/hooks.ts` — FOUND
- `src/main/hiveProvisioning.ts` — FOUND
- `test/control.test.cjs` — FOUND
- `test/record-persist.test.cjs` — FOUND
- `.planning/phases/04-overnight-on-a-repo-that-matters/04-15-SUMMARY.md` — FOUND

Commits claimed, verified in `git log`:

- `c530a64` — FOUND
- `b6a01b2` — FOUND
- `1ea60e6` — FOUND

`STATE.md` and `ROADMAP.md`: **not modified** by this plan, as required for a
parallel worktree executor.
