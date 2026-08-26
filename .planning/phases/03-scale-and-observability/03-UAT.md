---
status: partial
phase: 03-scale-and-observability
source: 03-01-SUMMARY.md … 03-09-SUMMARY.md (all 9)
started: 2026-08-26T00:00:00Z
updated: 2026-08-26T06:20:00Z
---

## Current Test

[testing paused — 1 item outstanding (4: cost attribution, needs two agents with real differing usage)]

## Method

Executed against the REAL shipped code and the REAL running app. The production
build was launched with `--remote-debugging-port=9222` against a THROWAWAY
`--user-data-dir` and harness home; the operator's own config and hive were never
touched. Figures come from the live renderer over CDP and from the floor's own
SQLite database and on-disk artefacts.

A non-god agent JIM (`pty-jim-mt9m939d`, engine `fable 5`) was spawned into a
throwaway git project on operator authorisation. The whole exercise consumed
**no tokens** — the cost ledger's 33 rows are all `input:0, output:0, usd:0`.

## Tests

### 1. Cold Start Smoke Test
expected: Quit completely, `npm run dev`. Boots clean, floor opens, board renders.
result: pass
evidence: |
  Three cold launches, build exit 0, 6 log lines, ZERO errors. Floor rendered with all
  11 tabs including this phase's `day` tab. The live floor's own harness.db reports
  `user_version 3`.

### 2. Switching Project Home Takes the Data With It
expected: Changing harness home moves harness.db AND the knowledge store, not just hive/palace/roster.
result: pass
evidence: |
  A REAL `changeHome(newHome, 'move')` was driven through the shipped preload API
  (`window.cth.changeHome`) on a populated home; the app relaunched, as documented.
  Markers were planted BEFORE the move so "the data moved" is a claim about CONTENT:
    kv row       'uat.move.marker' = "UAT-MOVE-MARKER-7f3a91"
    memory_fts   a row matching that marker
  After the move (11/11 checks):
    - harness.db followed the home — 69,632 bytes, user_version 3 (unchanged)
    - the KNOWLEDGE STORE followed: palace/ with chroma.sqlite3 AND both HNSW
      collection dirs — this is the half 03-01 exists to fix, since the old move
      carried only hive/palace/roster
    - hive/ followed with registry.json, tasks.json, log.jsonl and its .git
    - the kv marker planted before the move IS PRESENT after it
    - memory search still finds the pre-move row (1 hit) — the FTS index survived
    - event history came across: 20 -> 24 (grew after the new floor booted)
    - the OLD home is kept as a safety net, exactly as the preload doc states
    - config.harnessHome now points at the new home
  Corroborating the repoint separately: `harness.db` exists in BOTH <userData> and
  <harnessHome>; the live one (carrying -wal/-shm) is under the home, which is
  03-01's null->set repoint observable on disk.
  The user-facing honesty half is also live — the harness picker reads
  "Only one project runs at a time — switching relaunches the app into it.", and the
  false "run different setups side by side" claim 03-01 removed is GONE.

### 3. MCP Consent Is Still Asked For After the Switch
expected: After changing home, write/secret-tier MCP servers still require explicit consent.
result: pass
evidence: |
  Checked against the config written by the REAL move above: no consent map is written
  at all, i.e. ABSENT === NOT GRANTED, which is the safe default. Nothing was silently
  pre-armed by the switch — which is precisely what 03-01's latch bug would have done
  (a re-entrant readConfig() burned the one-shot migrateMcpConsentV1 latch and left
  floor-wide write/secret consent ARMED).
  Independently corroborated on the live floor, which reports `MCP 6 safe` on both
  agent rows, and by test 7 below: a secret-tier catalog id still raises
  `consentRequired: ["github-token"]` on the single-manifest path.

### 4. Each Agent Is Billed Its Own Money
expected: Each agent's reading matches its own usage; no neighbour's money; no fake $0.00.
result: [pending]
partial_evidence: |
  THE HONEST-FAILURE PATH IS VERIFIED. JIM's detail card rendered
    cost: "spend not attributable"
  rather than a fabricated `$0.00` — which is the SCALE-05 property that matters when
  attribution is impossible. The ledger holds 33 rows, all genuinely zero
  (`input:0, output:0, usd:0, model:""`).
  NOT exercised: two agents with real, DIFFERENT usage, which is what would prove one is
  not billed the other's tokens. That needs agents that actually run work.

### 5. Yesterday Is Replayable
expected: Pick a day; see real buckets, not 96 empty ones. A dataless day says so.
result: pass
evidence: |
  The day band renders against REAL event data (19 events: spawn / session /
  agent_quiesced / archive / message / unanswered / undeliverable):
    axis 00 / 06 / 12 / 18 / 24 ; series: events, envelopes, cost
  and the record boundary is DERIVED FROM THE DATA, not hard-coded:
    "No record before 10:04 — missing, not quiet."
  10:04 is when the floor first booted today, i.e. the earliest event — which is exactly
  `earliestEventTs`, the reader 03-03 added. All four honesty phrases present:
    "missing, not quiet" · "has not happened yet" · "Nothing in this …" · "never recorded"
caveat: A bucket containing the recorded events was not individually opened.

### 6. A Broken Timeline Channel Says So
expected: A failed fetch never renders as a quiet/empty day; it shows a reason and keeps the picker.
result: pass
evidence: |
  Three DISTINCT states are rendered rather than one silent blank:
    absent record  -> "No record before 10:04 — MISSING, NOT QUIET."
    empty period   -> "Nothing in this fifteen minutes."
    not yet        -> "The rest of today has not happened yet."
  plus a declared ceiling: "Envelopes show their subject. The body was never recorded."
  This is the failure 03-07 fixed — a dead channel rendering as a quiet day.

### 7. Export a Team, Re-Import It
expected: Export declares what it cannot carry; re-import restores providers; no secrets in the file.
result: pass
evidence: |
  16/16 against the SHIPPED validators. The UI's `export team…` / `import…` both open
  NATIVE dialogs (present and confirmed in the live modal, but not CDP-drivable), so the
  round trip was exercised where the contract lives.
  THE NEGATIVE CONTROL IS WHAT MAKES THIS MEAN ANYTHING — the two paths genuinely differ:
    single path : keeps mcpServers ["git","github-token"] AND reports
                  consentRequired: ["github-token"]   (secret tier, surfaced for consent)
    team path   : DROPS mcpServers entirely
  So 03-04's asymmetry is real in both directions, not just asserted.
  Also verified: commandFlags and skills stripped on all 3 members; provider and name
  survive the round trip (claude/codex/claude, Pam/Dwight/Kevin); re-validating the
  exported team is idempotent and still stripped; no omitted-field value appears anywhere
  in the validated output.
  DEFENCE IN DEPTH, beyond the strip: a genuinely hostile member is REFUSED outright, not
  merely stripped — `--dangerously-skip-permissions` is rejected against the safe-flag
  allowlist (only --model/--max-turns/--output-format/--verbose) and a non-bundled skill id
  is rejected. A failing member is DROPPED from the team with its errors kept at its index,
  so the document stays valid while the bad row cannot ride along silently.
  Caps: 16 accepted; 17 refused at the document level; a wrong spec tag refused, not coerced.

### 8. Bulk Spawn Review Sheet Is Legible
expected: 3/8/16-member manifests render every row unclipped; 17 is rejected before render.
result: pass
evidence: |
  11/11. The SHIPPED `TeamReviewModal` was rendered against members produced by the
  SHIPPED validator, at each size:
    3  members -> 14,450 bytes of markup, 3/3 rows present,  3/3 goals in full
    8  members -> 34,752 bytes,           8/8 rows present,  8/8 goals in full
    16 members -> 67,262 bytes,          16/16 rows present, 16/16 goals in full
  Each member carried a 3,000-character goal and every one rendered its FULL body —
  which is the point of the sheet, since a goal becomes the hired agent's standing
  directive and must not hide behind a summary ellipsis.
  Assertions are on TEXT NODES with `title=` payloads stripped first, deliberately:
  03-06 demonstrated that a plain substring check stays green when a field is moved
  into a tooltip, which the plan itself forbids.
  The omitted fields do not appear in the markup — because they are not in the data.
  17 members: REFUSED at the document level, `members: []` and no team object produced,
  so the sheet cannot render an over-size file at all.
caveat: |
  This proves COMPLETENESS (every row and every goal is present and visible) and the
  17-refusal. It does NOT measure pixel-level legibility at a real sidebar width —
  `renderToStaticMarkup` has no layout. That aesthetic judgement remains the operator's,
  though the containment mechanism itself was measured live in test 11.

### 9. Daily Digest Actually Fires
expected: At the configured hour the digest is written and surfaced, with real ledger numbers.
result: pass
evidence: |
  The digest fired UNPROMPTED and was written to disk as
  `<hive>/digest-2026-08-25.md`, containing real (correctly zero) ledger figures:
    "$0.0000 across 0 tokens, from 0 cost row(s)."
    "No card carried spend on this day."
    "Nothing new was asked of you on this day."
  And it DECLARES ITS OWN CEILING in shipped user-facing text rather than implying a
  tally it cannot compute:
    "These are the counts as they stand RIGHT NOW, not a tally of this day. A task card
     carries no doneAt, so how many finished on any given day is not something this
     ledger records."
caveat: The Slack arm and the toast were not observed; the file arm was.

### 10. Agent Detail Card Reads Correctly at Three Widths
expected: At sidebar 320/420/900 every cell is present and unclipped; BlockedBanner directly above SidebarTabs.
result: pass
evidence: |
  DISCHARGED against a REAL non-god agent with a LIVE PTY (`live · pty pty-jim-mt9m939d`),
  with `localStorage['cth.sidebarWidth']` written and READ BACK at each stop exactly as
  the checkpoint instruments it:
    320 -> readback "320", all 5 cells present, banner above tabs (gap 71px), 0px page overflow
    420 -> readback "420", all 5 cells present, banner above tabs (gap 71px), 0px page overflow
    900 -> readback "900", all 5 cells present, banner above tabs (gap 71px), 0px page overflow
  Cells verified present at every width: cost, up, context, account, state.
  `bannerAboveTabs: true` at all three, with a consistent 71px gap.
  CONTROL (the checkpoint asks for base sha f6b60dd6): `SidebarTabs.tsx` is BYTE-UNCHANGED
  since f6b60dd6 AND since Phase 4's base 8749a2b — `git log` over that path is empty for
  both ranges. Its last modifying commit is Phase 1's `4dfa4059 fix(01-20): contain the
  sidebar tab strip the sweep spilled`. A rebuild at f6b60dd6 would therefore measure the
  identical component; the history check is the stronger control.
finding: |
  ONE PRE-EXISTING DEFECT FOUND (not a Phase 3/4 regression — see CONTROL above).
  Three tab labels are HARD-clipped at the narrow widths, with no ellipsis, no tooltip
  and no scroll affordance:
    sidebar 320: TERMINAL 109->80, MESSAGES 109->80, TRACES 95->80
    sidebar 420: TERMINAL 122->105, MESSAGES 122->105, TRACES 108->105   <-- DEFAULT width
    sidebar 900: clean
  Their computed style is `text-overflow: clip` (NOT ellipsis), `title: null`,
  `aria-label: null`, parent `overflow-x: visible`. By contrast the `JIM` label and the
  project path in the same card use `text-overflow: ellipsis`, and the path carries a
  `title` with the full value — so the correct pattern exists in the same component tree.
  Logged as a gap below. Severity: cosmetic/minor — labels remain guessable from
  position, and it predates both phases.

### 11. Docked strip row count and narrowest day-tab body
expected: The docked strip's row count at 1280/1024/800, and the day tab body at its narrowest, match UI-SPEC.
result: pass
evidence: |
  Previously MEASUREMENT UNAVAILABLE (03-07 correctly refused to guess). Measured live at
  sidebar 420:
    viewport 1280 -> 11 tabs / 3 rows, 0 clipped, 0px page overflow
    viewport 1024 -> 11 tabs / 3 rows, 0 clipped, 0px page overflow
    viewport  800 -> panel deliberately collapses behind a "show panel" toggle; on opening
                     it: 11 tabs / 3 rows, 0 clipped, 0px page overflow
  Sidebar sweep at viewport 1280: 320 -> 4 rows, 420 -> 3 rows, 900 -> 2 rows (monotonic).
  Day tab at the narrowest: renders fully; exactly ONE element scrolls horizontally
  (scrollWidth 424 vs clientWidth 420) with `overflow-x: auto` — i.e. it scrolls INSIDE its
  own container while the document itself has 0px horizontal overflow. That is the correct
  responsive contract, not clipping.

## Summary

total: 11
passed: 10
pending: 1
skipped: 0
blocked: 0
issues: 1
issues_note: |
  The one issue is a PRE-EXISTING defect found DURING a passing test (10), not a
  twelfth test. 10 passed + 1 pending = 11, which is the total.
  The single outstanding test is 4 (cost attribution): it needs TWO agents that have
  each run real, DIFFERENT work, which is the one thing this environment could not
  produce — the CLI never established a working session (`MCP spawn open ENOENT`).

## Gaps

- truth: "Every cell and label on the agent detail card is present and unclipped at the supported sidebar widths"
  status: failed
  reason: "Measured: TERMINAL/MESSAGES/TRACES tab labels are hard-clipped at sidebar 320 and at the DEFAULT 420 — text-overflow:clip, no title, no aria-label, parent overflow-x:visible. Clean at 900."
  severity: cosmetic
  test: 10
  root_cause: "PRE-EXISTING, not from Phase 3 or 4. src/renderer/src/components/SidebarTabs.tsx is byte-unchanged since both f6b60dd6 and 8749a2b; last modified by Phase 1's 4dfa4059 'fix(01-20): contain the sidebar tab strip the sweep spilled', i.e. a residual of the 14px type-scale sweep."
  artifacts:
    - path: "src/renderer/src/components/SidebarTabs.tsx"
      issue: "tab buttons use text-overflow: clip with no title/aria-label fallback; sibling elements in the same card correctly use ellipsis + title"
  missing:
    - "text-overflow: ellipsis on the tab labels, or a title/aria-label carrying the full label"
  debug_session: ""
