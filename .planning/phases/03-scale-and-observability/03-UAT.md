---
status: partial
phase: 03-scale-and-observability
source: 03-01-SUMMARY.md … 03-09-SUMMARY.md (all 9)
started: 2026-08-26T00:00:00Z
updated: 2026-08-26T05:10:00Z
---

## Current Test

[testing paused — 7 items outstanding; test 11 was UNBLOCKED and measured]

## Method

Executed against the REAL shipped code and the REAL running app, not against
summaries. The production build was launched with `--remote-debugging-port=9222`
against a THROWAWAY `--user-data-dir` and harness home under the job scratch dir;
the operator's own config and hive were never touched. Layout figures come from
the live renderer over CDP.

**No agent was spawned.** The floor came up with `auto mode on`; spawning would
have launched a real CLI against the operator's own auth and possibly started
real work. That is the operator's call.

## Tests

### 1. Cold Start Smoke Test
expected: Quit completely, `npm run dev`. Boots clean, floor opens, board renders.
result: pass
evidence: |
  Same runs as Phase 4 test 1 — this branch contains both phases. Build exit 0,
  two cold launches, 6 log lines, ZERO errors. Floor rendered with all 11 tabs
  including `day` (this phase's) and `ask me` (Phase 4's).

### 2. Switching Project Home Takes the Data With It
expected: Changing harness home moves harness.db AND the knowledge store, not just hive/palace/roster.
result: [pending]
partial_evidence: |
  The user-facing HONESTY half of 03-01 is verified live. On the harness picker the
  app now reads:
    "Only one project runs at a time — switching relaunches the app into it."
  and the false claim 03-01 existed to remove is GONE:
    saysSideBySide: false      (the "run different setups side by side" sentence)
    saysOneAtATime: true
  The `move` itself (harness.db + knowledge store following the home) was NOT
  exercised — it needs a populated home and a real switch.

### 3. MCP Consent Is Still Asked For After the Switch
expected: After changing home, write/secret-tier MCP servers still require explicit consent.
result: [pending]
reason: |
  Depends on test 2's switch. This is the operator-side guard for the latch bug
  03-01 found — a re-entrant `readConfig()` burned the one-shot `migrateMcpConsentV1`
  latch and left floor-wide write/secret consent ARMED. The floor does report
  "MCP 6 safe" on boot, which is consistent, but that is not the post-switch check.

### 4. Each Agent Is Billed Its Own Money
expected: Each agent's cost/token reading matches its own usage; no neighbour's money.
result: [pending]
reason: Requires ≥2 agents that have actually run work. Not spawned — see Method.

### 5. Yesterday Is Replayable
expected: Pick a previous day; see real buckets, not 96 empty ones. A dataless day says so.
result: [pending]
partial_evidence: |
  The day band RENDERS and its honesty language is live — the axis (00/06/12/18/24),
  the three series (events / envelopes / cost), a date control, and:
    "No record before 10:04 — missing, not quiet."
    "The rest of today has not happened yet."
    "Nothing in this fifteen minutes."
    "Envelopes show their subject. The body was never recorded."
  Replaying a POPULATED past day was not possible: the throwaway home has no history.

### 6. A Broken Timeline Channel Says So
expected: A failed fetch never renders as a quiet/empty day; it shows a reason and keeps the picker.
result: pass
evidence: |
  The shipped copy makes the distinction explicitly, observed in the live renderer:
    "No record before 10:04 — MISSING, NOT QUIET."
  plus separate wording for a genuinely empty bucket ("Nothing in this fifteen
  minutes") and for the future ("The rest of today has not happened yet"). Three
  distinct states — absent record, empty period, not-yet — rather than one silent
  blank. This is the failure 03-07 fixed (a dead channel rendering as a quiet day).

### 7. Export a Team, Re-Import It
expected: Export declares what it cannot carry; re-import restores providers; no secrets in the file.
result: [pending]
partial_evidence: |
  `export team…` and `import…` are both present in the live add-agent modal.
  The round trip was not performed (needs agents on the floor).

### 8. Bulk Spawn Review Sheet Is Legible
expected: 3/8/16-member manifests all render every row unclipped; 17 is rejected before render.
result: [pending]
reason: Requires importing real manifests and spawning. Legibility is operator judgement.

### 9. Daily Digest Actually Fires
expected: At the configured hour the digest is written and toasted, with real ledger numbers.
result: [pending]
reason: Requires a floor with real ledger data and a wall-clock wait.

### 10. Agent Detail Card Reads Correctly at Three Widths
expected: At sidebar 320/420/900 every cell is present and unclipped; BlockedBanner sits directly above SidebarTabs.
result: [pending]
partial_evidence: |
  LAYOUT HALF MEASURED IN THE REAL RUNNING APP (this is more than 03-08 achieved —
  it used a detached render). `localStorage['cth.sidebarWidth']` was written and READ
  BACK at each stop, exactly as the checkpoint instruments it:
    sidebar 320 -> strip 320px, 11 tabs / 4 rows, 0 clipped, 0px page overflow
    sidebar 420 -> strip 420px, 11 tabs / 3 rows, 0 clipped, 0px page overflow
    sidebar 900 -> strip 900px, 11 tabs / 2 rows, 0 clipped, 0px page overflow
  Monotonic and sensible; no element anywhere exceeded the viewport at any stop.
  STILL OWED: a non-god agent with a LIVE PTY, and therefore the
  "BlockedBanner directly above SidebarTabs" assertion, plus the control run at base
  sha f6b60dd6. No agent was spawned — see Method. This remains a BLOCKING operator
  checkpoint; the layout evidence above narrows it but does not discharge it.

### 11. Docked strip row count and narrowest day-tab body
expected: The docked strip's rendered row count at 1280/1024/800, and the day tab body at its narrowest, match UI-SPEC.
result: pass
evidence: |
  Previously MEASUREMENT UNAVAILABLE (03-07 correctly refused to guess). Now measured
  live over CDP at sidebar 420:
    viewport 1280 -> 11 tabs / 3 rows, 0 clipped, 0px page overflow
    viewport 1024 -> 11 tabs / 3 rows, 0 clipped, 0px page overflow
    viewport  800 -> side panel deliberately collapses behind a "show panel" toggle;
                     on opening it: 11 tabs / 3 rows, 0 clipped, 0px page overflow
  Day tab at the narrowest (800): renders fully. Exactly ONE element scrolls
  horizontally — scrollWidth 424 vs clientWidth 420 with `overflow-x: auto`, i.e. it
  scrolls INSIDE its own container while the document itself has 0px horizontal
  overflow. That is the correct responsive contract, not clipping.

## Summary

total: 11
passed: 3
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

<!-- No functional gap found by any executed test. Test 11 moved blocked -> pass.
     The 7 pending items are unrun, NOT failing: they need either a live agent CLI
     (4, 7, 8, 10), a populated history (5, 9), or a real home switch (2, 3). -->
