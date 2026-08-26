---
status: partial
phase: 04-overnight-on-a-repo-that-matters
source: 04-01-SUMMARY.md … 04-20-SUMMARY.md (all 20)
started: 2026-08-26T00:00:00Z
updated: 2026-08-26T05:10:00Z
---

## Current Test

[testing paused — 5 items outstanding, all requiring a live authenticated agent CLI]

## Method

Six of these were executed by the agent against the REAL shipped code, not
against a summary. Where a result says PASS below, the evidence is a command run
in this session and quoted verbatim.

The app was driven headlessly: the production build launched with
`--remote-debugging-port=9222` against a THROWAWAY `--user-data-dir` under the
job scratch dir, so the operator's real config and hive were never touched.
Measurements come from the running renderer over CDP.

**Not done, deliberately:** no agent was spawned. The floor came up with
`auto mode on`, and spawning would have launched a real CLI against the
operator's own authentication and possibly started real work. That is the
operator's call to make, not this session's.

## Tests

### 1. Cold Start Smoke Test
expected: Quit completely, `npm run dev`. App boots with no error dialog, floor opens, kanban renders.
result: pass
evidence: |
  Built with Node 22 (`npm run build` exit 0), launched twice — once against a
  virgin user-data dir, once against a seeded one.
  - Virgin profile: booted to the first-run wizard ("STEP 1 OF 6 · WELCOME"), renderer
    mounted, `rootChildCount: 1`.
  - Seeded profile: booted through the harness picker to a fully rendered floor —
    MICHAEL / BOSS / AUTO / idle / hive / opus 4 8 / MCP 6 safe, and all 11 tabs
    (terminal, monitor, tasks, ask me, triggers, memory, graph, activity, skills,
    workers, day).
  Boot logs: 6 lines total, ZERO errors. The single `[error]`-level line is a
  pre-existing Node DEP0190 deprecation warning about shell args, not from this phase.

### 2. Existing Install Survives the Schema Migration
expected: An install with a pre-phase harness.db opens normally; old data still readable.
result: pass
evidence: |
  `.uat-migration.cjs` — 9/9 checks. Built a GENUINE pre-phase database at
  `user_version = 2` with seeded kv + memory rows + a populated FTS index, then
  opened it with the shipped `PersistStore`, and re-read through a SECOND
  independent better-sqlite3 handle (a version-counting stub cannot satisfy that).
    user_version: 2 -> 3
    tables after: events, kv, memory, memory_fts, …, tool_calls
  - open() did NOT throw (this is the permanent-brick failure mode 03-03 found)
  - pre-phase kv row survived byte-for-byte
  - both pre-phase memory rows survived, in order, with their agent ids
  - FTS still answers a search for pre-phase content
  - opening the SAME db a SECOND time also does not throw (migration is idempotent —
    the sneakier failure, which bricks on the *next* launch rather than this one)

### 3. A Dangerous Command Is Refused, Legibly
expected: A live agent's destructive command does not run; the Command Center names what/for whom/why.
result: [pending]
reason: Requires a live authenticated agent CLI. Not spawned — see Method.

### 4. Approval Request With a Live Countdown
expected: Ask-shaped command surfaces an approval with command, agent and countdown; approve/deny/expiry all work.
result: [pending]
partial_evidence: |
  The desktop surface EXISTS and renders: an `ask me` tab is present and both
  `Approve` and `Deny` buttons are in the live DOM at 50×24px. (04-18 found this half
  was dead by construction — `emitControl` sent neither `askId` nor `expiresInMs` —
  so its presence is meaningful.) The countdown and the approve/deny/expiry
  behaviours need a real ask from a live agent.

### 5. Deny Button Is Readable in Dark Mode
expected: The Deny label is clearly readable against its background in dark mode.
result: pass
evidence: |
  Measured from the RUNNING app's computed styles, both themes, plus a negative control:
    light: rgb(26,19,32) on rgb(217,106,98) = 5.34:1
    dark:  rgb(26,19,32) on rgb(224,140,130) = 7.12:1
  NEGATIVE CONTROL — the pre-fix pairing still measures as a failure:
    #DEDBD6 on #E08C82 = 1.85:1 (correctly below the 4.5:1 AA floor)
  Mechanism confirmed in source: `--cth-on-accent` is defined once in `:root` and is
  NOT redefined under `:root[data-cth-theme='dark']`, which is why the fix holds.
  `.uat-visual.cjs` 12/12.

### 6. A Dead Agent's Card Goes Back on the Board
expected: Killing an agent holding a card in `doing` returns the card, showing who dropped it.
result: [pending]
reason: Requires a live agent holding a card. Not spawned — see Method.

### 7. Card Age Is Visible on the Kanban
expected: Cards show time-in-state; nothing renders "NaNd" or "Infinityd".
result: pass
evidence: |
  `relAge` returns `{text, unit}` (read from source, not assumed):
    relAge(NaN)      = "0s"   (NOT "NaNd")
    relAge(Infinity) = "0s"   (NOT "Infinityd")
    30s -> "30s" (s), 9h -> "9h" (h), 3d -> unit 'd'
  NEGATIVE CONTROL — the legacy WorkersTab.tsx:20 shape was lifted out and evaluated:
    legacy(NaN) = "NaNd"
  So the divergence is a measured fact, not a claim in a comment. Stale is readable
  off `.unit` ('h'/'d') rather than a magic threshold.

### 8. A Blocked Agent Is Not Idled Or Mailed Work
expected: A blocked agent is not marked idle and receives no new work; roster shows blocked.
result: [pending]
reason: Requires a live agent reaching a blocked prompt. Not spawned — see Method.

### 9. History Survives a Hard Crash
expected: Kill the app hard mid-activity; prior activity is still there after restart.
result: pass
evidence: |
  `.uat-crash.cjs` — 5/5. A separate process wrote 4000 tool_calls and was then
  HARD-killed with `taskkill /F` while holding the store open — never closed, never
  checkpointed.
    uncheckpointed WAL at kill: 4,144,752 bytes
    tool_calls readable afterwards by a second process: 4000
  The `target` COLUMN survived too (`/tmp/file-0`), not merely the row count — so the
  rows arrived with their content. This is ~26× harsher than 04-19's 160,712-byte run.

### 10. Sandbox Settings Group Is Present and Off By Default
expected: A SANDBOX group exists; the per-engine opt-in is OFF by default.
result: pass
evidence: |
  `providerSandbox?: Partial<Record<AgentProvider, boolean>>` is OPTIONAL and absent
  from defaults, and the only consumer reads
  `config.providerSandbox?.[p] ? sandboxFlagsForProvider(p, agentDir) : ''`.
  So ABSENT === OFF, with no migration and no explicit write — the shipped-behaviour
  fallback. The seeded config carries no `providerSandbox` key and the sandbox is
  therefore off, confirmed structurally.
  NOTE: this verifies the DEFAULT only. Enforcement is test 12, which is blocked.

### 11. The Absence Watchdog Speaks Once
expected: After the quiet window, you are told once — not repeatedly; any signal moving clears the latch.
result: [pending]
reason: |
  Long-running by nature, and needs a floor with real agents to go quiet. Worth running
  overnight. Note its THIRD notification channel is a declared stub (see test 13) — the
  in-app and log arms are what would be observed.

### 12. GATE-04 sandbox enforcement (live)
expected: A codex agent under `-s workspace-write --add-dir <agentDir>` is confined to its own folder.
result: blocked
blocked_by: third-party
reason: "codex auth revoked — `401 refresh_token_reused`, reproduced twice (04-01, 04-13) including a control run with a fully unfiltered environment, proving GATE-02 is not the cause. `codex login status` reports 'Logged in using ChatGPT' and is lying — it reads the on-disk record without exercising it. GATE-04 also ships BUILT BUT NOT WIRED: both spawn-command assemblers accept agentDir and splice it correctly, but no production caller passes one, so opt-in ON today would give -s workspace-write WITHOUT the folder added. Unblock: `codex login`, then re-run the spike (argv on 04-SPIKE-codex-sandbox.md, ~2 min)."

### 13. Push notification reaches your phone
expected: A quiet floor or an approval request produces a push notification on the phone.
result: blocked
blocked_by: prior-phase
reason: "Declared stub in TWO places with ONE root cause: 04-11's floorQuietPushPayload and 04-17's askPushPayload both compose the payload and LOG it rather than send. webhook.ts has no PushSubscription intake route and no PushSubscription has ever existed in this process (index.ts:614-625 says so). Answering asks through the phone's own endpoints is separate and is test 4's territory. Never shipped; not a regression."

## Summary

total: 13
passed: 6
issues: 0
pending: 5
skipped: 0
blocked: 2

## Gaps

<!-- No functional gap found by any executed test. Every PASS above is backed by a
     command run in this session. The 5 pending items are unrun, NOT failing — they
     all need a live authenticated agent CLI, which this session deliberately did not
     spawn. -->
