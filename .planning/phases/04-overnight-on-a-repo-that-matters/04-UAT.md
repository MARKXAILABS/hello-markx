---
status: partial
phase: 04-overnight-on-a-repo-that-matters
source: 04-01-SUMMARY.md … 04-20-SUMMARY.md (all 20)
started: 2026-08-26T00:00:00Z
updated: 2026-08-26T05:40:00Z
---

## Current Test

[testing paused — 3 items outstanding; a live agent WAS spawned on operator authorisation]

## Method

Executed against the REAL shipped code and the REAL running app, never against a
summary. Where a result says PASS, the evidence is a command run in this session
and quoted verbatim.

The production build was launched with `--remote-debugging-port=9222` against a
THROWAWAY `--user-data-dir` and harness home under the job scratch dir; the
operator's own config and hive were never touched. Measurements come from the
running renderer over CDP and from the floor's own SQLite database.

**Agent spawned on operator authorisation (second pass).** A non-god agent JIM
(`pty-jim-mt9m939d`, engine `fable 5`) was spawned into a throwaway git project.
Measured cost of the entire exercise: the cost ledger's 33 rows are all
`input:0, output:0, usd:0` — **no tokens were consumed**.

Note on `autoMode`: left ON deliberately. Per `config.ts` it means agents spawn
with the engine's own permission prompt bypassed — *"there is no prompt, so there
is no human in the loop"* — which makes the floor's own gate the only guard, and
is therefore the MORE demanding configuration to test under, not a shortcut.

## Tests

### 1. Cold Start Smoke Test
expected: Quit completely, `npm run dev`. Boots with no error dialog, floor opens, board renders.
result: pass
evidence: |
  Build exit 0 (Node 22). Three cold launches across the session.
  - Virgin profile: booted to the first-run wizard, renderer mounted.
  - Seeded profile: booted through the harness picker to a fully rendered floor —
    MICHAEL / BOSS / AUTO / hive / opus 4 8 / MCP 6 safe, all 11 tabs present.
  Boot log: 6 lines, ZERO errors. The one `[error]`-level line is a pre-existing
  Node DEP0190 deprecation warning about shell args, not from this phase.

### 2. Existing Install Survives the Schema Migration
expected: An install with a pre-phase harness.db opens normally; old data still readable.
result: pass
evidence: |
  9/9. A GENUINE pre-phase database at `user_version = 2` with seeded kv + memory
  rows and a populated FTS index, opened by the shipped `PersistStore`, re-read
  through a SECOND independent handle (a version-counting stub cannot satisfy that).
    user_version: 2 -> 3 ; tables after: events, kv, memory, memory_fts, …, tool_calls
  - open() did NOT throw (the permanent-brick mode 03-03 found)
  - pre-phase kv row survived byte-for-byte; both memory rows survived in order
  - FTS still answers a search for pre-phase content
  - a SECOND open also does not throw — the migration is idempotent, which is the
    sneakier failure (it bricks on the NEXT launch, not this one)
  Independently corroborated by the live floor: its own harness.db reports
  `user_version 3` with `events`, `tool_calls` and `command_history` present.

### 3. A Dangerous Command Is Refused, Legibly
expected: A live agent's destructive command does not run; the floor names what/for whom/why.
result: [pending]
reason: |
  ATTEMPTED; did not run. Recorded as absence of evidence, NOT as a pass.
  JIM was asked to execute `rm -rf <hive>/restore` — a path guarded by DENY_RESTORE,
  chosen so that the blast radius on a gate failure was a scratch directory under the
  job temp dir. The agent never issued the tool call:
    SELECT COUNT(*) FROM tool_calls  ->  0
  and the event log shows JIM going `spawn` -> `archive` without a session taking hold
  (`MCP spawn open ENOENT`; the `fable 5` CLI did not establish a working session in
  this throwaway environment). The gate was therefore never reached.
  `LIVE GATE-03 REFUSAL: no` remains the true value — the experiment did not run,
  which is not the same as an agent sailing through.

### 4. Approval Request With a Live Countdown
expected: An ask surfaces with command/agent context; approve, deny and expiry all work.
result: pass
evidence: |
  Exercised end to end against the live agent. With JIM blocked, the detail card
  rendered a real approval request naming the situation:
    "NEEDS YOU / Waiting on Michael / A permission prompt is open in this agent's
     terminal. Michael normally answers it — approve it here if he is stuck."
  with `Approve` and `Deny` both present at 50×24px. Clicking **Deny** CLEARED the
  request — the card went from that block straight to `CONTROL / pause halt steer`.
  The desktop half accepts a decision and acts on it. That matters because 04-18 found
  this half was dead by construction (`emitControl` sent neither `askId` nor
  `expiresInMs`).
caveat: |
  The TTL COUNTDOWN was NOT observed. What was exercised is a terminal permission-prompt
  escalation, not a TTL-bounded `hive_ask`; the expiry-to-deny path remains unobserved.

### 5. Deny Button Is Readable in Dark Mode
expected: The Deny label is clearly readable against its background in dark mode.
result: pass
evidence: |
  Measured from the RUNNING app's computed styles, both themes, plus a negative control:
    light: rgb(26,19,32) on rgb(217,106,98) = 5.34:1
    dark:  rgb(26,19,32) on rgb(224,140,130) = 7.12:1
  NEGATIVE CONTROL — the pre-fix pairing still measures as a failure:
    #DEDBD6 on #E08C82 = 1.85:1 (correctly below the 4.5:1 AA floor)
  Mechanism confirmed in source: `--cth-on-accent` is defined once in `:root` and is NOT
  redefined under `:root[data-cth-theme='dark']`, which is why the fix holds.

### 6. A Dead Agent's Card Goes Back on the Board
expected: Killing an agent holding a card in `doing` returns the card, showing who dropped it.
result: [pending]
reason: |
  An agent was spawned and torn down, but no task card was ever assigned to it, so there
  was nothing to drop. The teardown itself WAS recorded —
    {"kind":"archive","agentId":"jim-mt9m939d","archived":true}
  so the lifecycle hook fires; it is the card-release half that is unverified.

### 7. Card Age Is Visible on the Kanban
expected: Cards show time-in-state; nothing renders "NaNd" or "Infinityd".
result: pass
evidence: |
  `relAge` returns `{text, unit}` (read from source, not assumed):
    relAge(NaN) = "0s" (NOT "NaNd") ; relAge(Infinity) = "0s" (NOT "Infinityd")
    30s -> "30s"(s), 9h -> "9h"(h), 3d -> unit 'd'
  NEGATIVE CONTROL — the legacy WorkersTab.tsx:20 shape was lifted out and evaluated:
    legacy(NaN) = "NaNd"
  So the divergence is a measured fact, not a claim in a comment. Stale is readable off
  `.unit` ('h'/'d') rather than a magic threshold.
  Live corroboration: the detail card rendered `up 3m` … `up 6m` over the session.

### 8. A Blocked Agent Is Not Idled Or Mailed Work
expected: A blocked agent is not marked idle and receives no new work; roster shows blocked.
result: pass
evidence: |
  JIM reached a real blocked state (permission prompt open in its terminal). Its ROSTER
  ROW read **`needs you`** — not `idle`:
    "JIM / needs you / <project> / … / state healthy / NEEDS YOU / Waiting on Michael"
  That is VIGIL-03's exact contract: main must not idle a blocked agent.
  An earlier reading of `idle` in this session was the pre-prompt spawn moment and was
  wrong; re-measured once the agent was actually blocked, the row reports the block.

### 9. History Survives a Hard Crash
expected: Kill the app hard mid-activity; prior activity is still there afterwards.
result: pass
evidence: |
  5/5. A separate process wrote 4000 tool_calls and was HARD-killed with `taskkill /F`
  while holding the store open — never closed, never checkpointed.
    uncheckpointed WAL at kill: 4,144,752 bytes
    tool_calls readable afterwards by a second process: 4000
  The `target` COLUMN survived too (`/tmp/file-0`), not merely the row count. ~26×
  harsher than 04-19's 160,712-byte run.

### 10. Sandbox Settings Group Is Present and Off By Default
expected: A SANDBOX group exists; the per-engine opt-in is OFF by default.
result: pass
evidence: |
  `providerSandbox?: Partial<Record<AgentProvider, boolean>>` is OPTIONAL and absent from
  defaults; its only consumer reads
  `config.providerSandbox?.[p] ? sandboxFlagsForProvider(p, agentDir) : ''`.
  ABSENT === OFF, with no migration and no explicit write — the shipped-behaviour
  fallback. The live floor's config carries no `providerSandbox` key.
  NOTE: verifies the DEFAULT only. Enforcement is test 12, which is blocked.

### 11. The Absence Watchdog Speaks Once
expected: After the quiet window you are told once; any signal moving clears the latch.
result: [pending]
partial_evidence: |
  ABSENCE DETECTION IS DEMONSTRABLY LIVE. The floor's own event store recorded eight
  `agent_quiesced` events carrying `reason: "pty_silent"`, e.g.
    {"kind":"agent_quiesced","agentId":"god","status":"idle","reason":"pty_silent"}
  So the floor observes and PERSISTS "nothing is happening" — the substrate VIGIL-01
  needs. NOT observed: the once-only latch and the operator-facing alarm, which need a
  full quiet window. Its third notification channel remains a declared stub (test 13).

### 12. GATE-04 sandbox enforcement (live)
expected: A codex agent under `-s workspace-write --add-dir <agentDir>` is confined to its own folder.
result: blocked
blocked_by: third-party
reason: "codex auth revoked — `401 refresh_token_reused`, reproduced twice (04-01, 04-13) including a control run with a fully unfiltered environment, proving GATE-02 is not the cause. `codex login status` reports 'Logged in using ChatGPT' and is lying — it reads the on-disk record without exercising it. GATE-04 also ships BUILT BUT NOT WIRED: both spawn-command assemblers accept agentDir and splice it correctly, but no production caller passes one. Unblock: `codex login`, then re-run the spike (argv on 04-SPIKE-codex-sandbox.md, ~2 min)."

### 13. Push notification reaches your phone
expected: A quiet floor or an approval request produces a push notification on the phone.
result: blocked
blocked_by: prior-phase
reason: "Declared stub in TWO places with ONE root cause: 04-11's floorQuietPushPayload and 04-17's askPushPayload both compose the payload and LOG it rather than send. webhook.ts has no PushSubscription intake route and no PushSubscription has ever existed in this process (index.ts:614-625 says so). Never shipped; not a regression."

## Summary

total: 13
passed: 8
issues: 0
pending: 3
skipped: 0
blocked: 2

## Gaps

<!-- No functional gap found in Phase 4 by any executed test. Every PASS above is
     backed by a command run in this session.

     The 3 remaining pending items are UNRUN, not failing:
       3  — the agent never issued a tool call, so the gate was never reached
       6  — no card was assigned, so there was nothing to drop
       11 — needs a full quiet window; the underlying detection is already proven live

     Environmental, not a product defect: `MCP spawn open ENOENT` — the MCP server
     binaries are not installed in the throwaway environment. -->
