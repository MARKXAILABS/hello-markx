---
status: testing
phase: 03-scale-and-observability
source: 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md, 03-06-SUMMARY.md, 03-07-SUMMARY.md, 03-08-SUMMARY.md, 03-09-SUMMARY.md
started: 2026-08-26T00:00:00Z
updated: 2026-08-26T00:00:00Z
---

## Current Test

number: 1
name: (queued behind Phase 4 UAT)
expected: |
  Phase 4 is the substrate this phase builds on, so its UAT runs first.
  This file is created and ready; testing begins once 04-UAT.md reaches a verdict.
awaiting: phase 4 UAT

## Tests

### 1. Cold Start Smoke Test
expected: Quit the app completely, then `npm run dev`. App boots with no error dialog, floor opens, board renders, existing agents and cards still present. (Injected because config.ts, db.ts, boot.ts and index.ts were all modified this phase.)
result: [pending]

### 2. Switching Project Home Takes the Data With It
expected: Change the harness home (Settings → change home, "move" mode). harness.db AND the knowledge/memory store move with it — not just hive/palace/roster. After the switch, memory search still finds what it found before, and the kanban still shows the same cards. (This is where a re-entrant config read burned a one-shot MCP-consent migration latch and left floor-wide write/secret consent ARMED — it was caught and fixed, and this test is the operator-side confirmation.)
result: [pending]

### 3. MCP Consent Is Still Asked For After the Switch
expected: After changing project home, a write-tier or secret-tier MCP server still requires explicit consent — it is NOT silently pre-enabled. (Directly guards the latch bug in test 2.)
result: [pending]

### 4. Each Agent Is Billed Its Own Money
expected: With more than one agent that has run some work, each agent's cost/token reading matches its own usage. A codex agent shows its own rollout totals, not a neighbour's. No agent shows $0.00 while it has visibly done work. (A booted floor was measured billing a codex agent 222 output tokens when its own rollout said 700.)
result: [pending]

### 5. Yesterday Is Replayable
expected: Open the day band / timeline view and pick a previous day. You see what actually happened that day — activity buckets with real numbers, not 96 empty ones. Picking a day with no data says so plainly rather than rendering a silent blank. (Replay is now bounded by 30-day retention, NOT by log rotation — the roadmap's 8MB-rotation caveat was measured wrong.)
result: [pending]

### 6. A Broken Timeline Channel Says So
expected: The timeline never renders a failed fetch as a quiet/empty day. If it cannot read, it shows an error with a reason and the day picker stays on screen so you can retry.
result: [pending]

### 7. Export a Team, Re-Import It
expected: Export the current floor as a team manifest. The file downloads and declares what it could not carry. Re-import it — the agents come back with their providers intact, and nothing secret (tokens, command flags, MCP servers) rode along in the file.
result: [pending]

### 8. Bulk Spawn Review Sheet Is Legible
expected: Import a team manifest with several members (try 3, then 8, then 16). The review sheet shows EVERY member — no row silently cut off, no clipped goal text, footer reachable. A 17-member file is rejected before the sheet renders. (This is 03-06's operator containment check, which auto-approved without being performed.)
result: [pending]

### 9. Daily Digest Actually Fires
expected: Set the daily digest hour to a minute or two from now. At that time you get the digest — written to file and surfaced as a toast — containing REAL numbers from the ledger, not an empty shell. The Settings toggle for it persists across a restart.
result: [pending]

### 10. Agent Detail Card Reads Correctly at Three Widths
expected: Select a non-god agent with a live PTY. Drag the sidebar splitter to roughly 320, 420 and 900 px, checking `localStorage.getItem('cth.sidebarWidth')` at each stop. At every width the detail card's cells are all present and unclipped, and BlockedBanner still sits directly above SidebarTabs. Compare against base sha f6b60dd6 as a control. (BLOCKING checkpoint — 03-08's executor refused to auto-approve it, correctly. Its own real-Chromium supporting measurement, explicitly NOT the gate, was 320→2 columns, 420→3, 900→5, all present and unclipped.)
result: [pending]

### 11. Docked strip row count and narrowest day-tab body
expected: The docked strip's rendered row count at 1280/1024/800, and the day tab body at its narrowest, match UI-SPEC.
result: blocked
blocked_by: release-build
reason: "03-07 printed these as MEASUREMENT UNAVAILABLE, which UI-SPEC :356-360 itself requires rather than a guess. They need a live CDP probe against the running renderer; this environment has Chrome browser automation but no desktop automation, and the app is Electron. Steps 3 and 4 of that same checkpoint ARE structurally guaranteed from source (flex '1 0 auto' + whiteSpace nowrap makes a clipped label impossible; flexWrap nowrap + overflowX auto makes a second fullscreen row impossible)."

## Summary

total: 11
passed: 0
issues: 0
pending: 10
skipped: 0
blocked: 1

## Gaps

<!-- Appended only from real user-observed evidence. -->
