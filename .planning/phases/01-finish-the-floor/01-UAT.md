---
status: partial
phase: 01-finish-the-floor
source: [01-VERIFICATION.md]
started: 2026-08-25T14:20:00Z
updated: 2026-08-25T16:35:00Z
build_under_test: dist\win-unpacked\Hello MarkX.exe — rebuilt 2026-08-25 16:24, carrying five operator-found fixes made during this session
---

## Current Test

6. Auto-mode chip truthfulness (FLOOR-01) — and the kanban/god deny, still open

> Rows are recorded ONLY from operator-observed evidence or from a measurement the
> orchestrator ran against real on-disk state. Nothing here is inferred from a SUMMARY.

## Tests

### 1. Terminal + persistence across relaunch — FLOOR-03
expected: a real PTY spawns and echoes; a real `better-sqlite3` write lands and survives a relaunch
result: **PASS** (2026-08-25)

Operator: launched `dist\win-unpacked\Hello MarkX.exe`, terminal pane spawned a live `claude`
session (`Welcome back Shrey!`, Opus 4.8 1M, Claude Max), signed in to a real account. Resized
and moved the window, quit via File → Quit, relaunched.

Orchestrator, reading the real database at
`C:\Users\Alienware\AppData\Roaming\hello-markx\harness.db` (45,056 bytes, mtime 14:17):
```
window.bounds       = {"x":-1603,"y":-135,"width":1445,"height":904}
missionLastFiredAt  = {"ops-standup":1787645972430,"heartbeat":1787647565219}
```
Both are live `better-sqlite3` rows written by this session — `persist.setKv('window.bounds', …)`
at `src/main/index.ts:1650`. The write landed AND was read back, because the app relaunched from
it. This is the D-09 gate: a real Electron process, real PTY, real native-module write on win32,
none of which the stubbed-electron unit suite can reach.

### 2. Open logs from Settings — FLOOR-05
expected: the OS file manager opens the log folder
result: **PASS** (2026-08-25)

Settings → General → `open logs` opened Explorer at
`C:\Users\Alienware\AppData\Roaming\hello-markx\logs\main.log`. The operator does not need to
know where logs live — which is the whole requirement.

### 3. Responsive collapse and the splitter — FLOOR-13 (a)
expected: the sidebar collapses responsively; the splitter handle never becomes unreachable
result: **PASS** (2026-08-25)

Dragging the splitter widened the COMMAND CENTER panel until all four kanban columns
(TODO · DOING · BLOCKED · DONE) rendered with no horizontal scroll. The tab row reflowed with
it — 5+5 at the narrow width, 8+2 at the wide one — so the panel is genuinely responsive rather
than fixed. The handle stayed visible and draggable throughout, which is the invariant issue #38
actually needs (`SidebarSplitter.tsx` `reachableMax`).

### 4. Tiny-text / clipping sweep — FLOOR-12
expected: no user-facing text below 14px; no clipped layout
result: **partial** (2026-08-25)

The operator reported a horizontal scrollbar in the tasks tab. **Investigated and ruled NOT a
defect:** `TasksKanban.tsx` renders four columns at `minWidth: 170` with 8px gaps and 10px
padding, so it needs ~724px; the panel at its default width is ~450px, and
`TasksKanban.tsx:180` sets `overflowX: 'auto'` deliberately. Widening the splitter shows all
four columns (test 3). Recorded because it is worth knowing that two of four columns are
off-screen at the default width — a usability observation, not a clipping bug.

Remaining for this row: a deliberate sweep of the ~600 swept FLOOR-12 surfaces and the Pixi
bubbles at normal window size.

### 5. Hive mail round-trip — FLOOR-02
expected: a producer's message reaches an idle agent's inbox and is acted on
result: **PASS** (2026-08-25) — with a serious bug found and fixed on the way

The god dispatched a task to `jim-mt8h0wci`; Jim listed his workspace, wrote
`E:\markx-scratch\jim\notes.md` (166 B, ISO timestamp), and the god independently verified
the file. The god's own memory records it: *"Mail round-trip: DONE, god-verified … Proven end
to end."*

Then four further messages were observed by the orchestrator reading the hive directly —
`Ping: agent id + current time`, `Re: agent id and current time`, and an unprompted
`Correction: agent id and current time (valid ISO-8601)` Jim sent after noticing his own
timestamp was malformed. All BOM-free, all delivered, **0 dropped, 0 newly quarantined**.

**The bug this test exposed (fixed, `eb2cdaf`):** Jim's FIRST two reports were silently
destroyed. PowerShell's `Set-Content` / `Out-File -Encoding utf8` write a UTF-8 BOM by default
on Windows; `JSON.parse` rejects a leading BOM; and the router's catch renamed the file to
`.sent/bad-*` with **no log and no bounce**. Both ends believed it worked. The god drew the
wrong conclusion in his own memory ("either in transit or didn't happen") and only learned the
task was done by inspecting the deliverable by hand.

Proven precisely: both quarantined files begin `0xEF 0xBB 0xBF` and parse cleanly once the BOM
is stripped — `to: god, act: done, "Hive mail round-trip proven"` and `to: god, act: inform,
"BLOCKED: … Knowledge Graph is empty (0 docs)"`. Jim wrote valid JSON both times.

NOT YET DONE for this row: the **window-closed** half. The round trip above ran with the window
open. Closing the window and confirming delivery continues remains outstanding.

### 6. Auto-mode chip truthfulness — FLOOR-01
expected: the chip reflects what the running agent is actually doing, is keyboard-reachable and
announced, and shows on a custom agent whose command carries `--dangerously-skip-permissions`
result: [pending]

### 7. One toast, and it focuses the agent — FLOOR-14
expected: blocking a real NON-Claude agent on Windows fires exactly one toast; clicking it
focuses that agent
result: [pending]

### 8. Telemetry auth does not reject its own batches
expected: `[hive] OTLP batch REJECTED (missing or unknown x-hive-otel-token)` does NOT appear in
the main log within a minute of spawning a real `claude` agent
result: [pending]

### 9. Secret scrub on the hive commit path — FLOOR-04
expected: a fake API key dropped into a live agent's workspace does not appear in `git log -p`
of the hive
result: **partial** (2026-08-25) — the scrub works; a size cap bypasses it

Demonstrated live without planting anything: a codex agent's `auth.json` was caught and held
out of history by the scrubber itself —
```
[hive] FLOOR-04: unstaged agents/jim-mt8fhr2i/.codex/auth.json — it carries a secret-shaped
value, and it has been kept OUT of the hive's git history.
```

**But the same log shows the gap, twice today:**
```
[hive] FLOOR-04: staged diff is 105089 lines, over the 20000 scan cap — committing UNSCANNED
[hive] FLOOR-04: staged diff is 106609 lines, over the 20000 scan cap — committing UNSCANNED
```
A commit larger than `SECRET_SCAN_MAX_LINES` skips the secret scan entirely. The requirement
says a secret-shaped value written into a workspace is scrubbed from the hive's history; a
large enough diff walks past it. The code is honest about this rather than silent, which is the
right design — but the row cannot close while size alone can mean "skip". Suggested fix is to
scan in chunks, not to raise the number.

### 10. Release provenance — FLOOR-06
expected: cutting a `v*` tag from merged main and running
`gh attestation verify <artifact> --repo MARKXAILABS/hello-markx` verifies the artifact against
this repo and commit, with `latest*.yml` inside the attested checksum set
result: [pending]

### 11. Four renderings of an agent agree, including cost — FLOOR-13 (b)
expected: the bottom strip card, the COMMAND CENTER header, the floor sprite label and the agent
detail panel agree on status AND cost
result: **partial** (2026-08-25)

Status agrees across all four observed surfaces (`idle` in every one). **Cost was not visible on
any of them in the observed state**, so agreement on cost is untested — that is #39's actual
subject and the row cannot close without it.

## Summary

total: 11
passed: 3
issues: 0
pending: 6
partial: 2
skipped: 0
blocked: 0

## Incidental observations (not requirement rows)

- **The quit confirmation works.** File → Quit with a live agent raised *"QUITTING NOW? — 1 AGENT
  STILL RUNNING"*, naming the data loss (PTY conversation history) and offering `closing time` as
  the safe path. That is threat **T-P02-03-02**'s mitigation observed live rather than inferred
  from source — a windowed-quit sibling of the headless path 02-03 built.
- **`v0.4.4 · update check failed`** shows in the titlebar. Expected if no release has been
  published to check against; flagged here so it is not mistaken for a regression later. Relates
  to FLOOR-06, which is still pending.
