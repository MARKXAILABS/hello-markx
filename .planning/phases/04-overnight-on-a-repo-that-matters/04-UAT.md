---
status: testing
phase: 04-overnight-on-a-repo-that-matters
source: 04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md, 04-06-SUMMARY.md, 04-07-SUMMARY.md, 04-08-SUMMARY.md, 04-09-SUMMARY.md, 04-10-SUMMARY.md, 04-11-SUMMARY.md, 04-12-SUMMARY.md, 04-13-SUMMARY.md, 04-14-SUMMARY.md, 04-15-SUMMARY.md, 04-16-SUMMARY.md, 04-17-SUMMARY.md, 04-18-SUMMARY.md, 04-19-SUMMARY.md, 04-20-SUMMARY.md
started: 2026-08-26T00:00:00Z
updated: 2026-08-26T00:00:00Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Quit the app completely. Start it fresh with `npm run dev`.
  The app boots with no error dialog and no red text in the console.
  The floor opens, the kanban board renders, and existing agents/cards are still there.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Quit the app completely, then `npm run dev`. App boots with no error dialog, floor opens, kanban renders, existing agents and cards still present. (Injected because boot.ts, index.ts, db.ts and the migration rail were all modified this phase.)
result: [pending]

### 2. Existing Install Survives the Schema Migration
expected: On an install that already has a harness.db from before this phase, the app opens normally — no "database is locked", no boot loop, no empty board. Memory search and the kanban both still read their old data. (This phase appended MIGRATIONS[2]; a bad DDL here would have left PersistStore.open() throwing forever, so this is the single highest-risk check in the phase.)
result: [pending]

### 3. A Dangerous Command Is Refused, Legibly
expected: With a live Claude agent, have it attempt something destructive (e.g. `rm -rf` on a path outside its own folder, or a write into <hive>/restore). The command does NOT run. The Command Center shows a refusal naming WHAT was refused, FOR WHOM, and WHY, in the floor's own words — not a raw stack trace.
result: [pending]

### 4. Approval Request With a Live Countdown
expected: When an agent hits an ask-shaped command, an approval prompt appears showing the command, the agent, and a countdown. Clicking Approve lets it proceed; clicking Deny stops it. Leaving it alone until the countdown expires results in a deny, not a hang.
result: [pending]

### 5. Deny Button Is Readable in Dark Mode
expected: In dark mode, the Deny button's label is clearly readable against its background. (It measured 1.85:1 contrast — effectively invisible — and was corrected to 7.12:1. Light mode is unchanged by design.)
result: [pending]

### 6. A Dead Agent's Card Goes Back on the Board
expected: Kill an agent that is holding a card in `doing` (close its terminal / stop it). Its card returns to the board rather than sitting in `doing` forever, and shows who dropped it.
result: [pending]

### 7. Card Age Is Visible on the Kanban
expected: Cards on the kanban show how long they have been in their current state (e.g. "2h", "3d"). A card nobody has touched since this morning reads differently from one touched a minute ago. No card shows "NaNd" or "Infinityd".
result: [pending]

### 8. A Blocked Agent Is Not Idled Or Mailed Work
expected: When an agent is blocked waiting on a prompt, the floor does not mark it idle and does not deliver new mail/work to it. Its roster row shows blocked rather than looping/armed.
result: [pending]

### 9. History Survives a Hard Crash
expected: With the app running and some activity recorded, kill it hard (Task Manager / kill -9 — not a clean quit). Restart. The prior activity is still there. (An automated equivalent was proven: real SIGKILL against a 160,712-byte uncheckpointed WAL, second process read it back from disk. This is the operator-side confirmation.)
result: [pending]

### 10. Sandbox Settings Group Is Present and Off By Default
expected: Settings shows a SANDBOX group. The per-engine sandbox opt-in is visible and is OFF by default. (Only presence and default state are being checked here — see test 12 for why enforcement is not.)
result: [pending]

### 11. The Absence Watchdog Speaks Once
expected: Leave the floor with nothing happening for the configured quiet window. You get told once — not repeatedly — that the floor has gone quiet. Any one signal moving again clears the latch. NOTE: this is a long-running check; skip it now and run it overnight if you prefer.
result: [pending]

### 12. GATE-04 sandbox enforcement (live)
expected: A codex agent under `-s workspace-write --add-dir <agentDir>` is actually confined to its own folder.
result: blocked
blocked_by: third-party
reason: "codex auth on this machine is revoked — `401 refresh_token_reused`, reproduced twice (04-01 and 04-13) including a control run with a fully unfiltered environment, so GATE-02 is proven not to be the cause. `codex login status` reports 'Logged in using ChatGPT' and is lying — it reads the on-disk record without exercising it. GATE-04 also ships BUILT BUT NOT WIRED: both spawn-command assemblers accept agentDir and splice it correctly, but no production caller passes one, so opt-in ON today would give -s workspace-write WITHOUT the folder added. Unblock: run `codex login`, then re-run the spike (argv is on 04-SPIKE-codex-sandbox.md, ~2 min)."

### 13. Push notification reaches your phone
expected: When the floor goes quiet or an agent needs approval, a push notification arrives on your phone.
result: blocked
blocked_by: prior-phase
reason: "Declared stub in TWO places with ONE root cause: 04-11's floorQuietPushPayload and 04-17's askPushPayload both compose the payload and LOG it rather than send. webhook.ts has no PushSubscription intake route and no PushSubscription has ever existed in this process (index.ts:614-625 says so in the repo's own words). The phone CAN still be used to answer asks through its own endpoints — that is test 4's territory — but it is device-unverified. Not a regression; never shipped."

## Summary

total: 13
passed: 0
issues: 0
pending: 11
skipped: 0
blocked: 2

## Gaps

<!-- Appended only from real user-observed evidence. -->
