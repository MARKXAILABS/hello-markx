---
phase: 03-scale-and-observability
plan: 3
subsystem: observability
tags: [sqlite, timeline, cost-attribution, ipc, retention, replay]

# Dependency graph
requires:
  - phase: 04-02 (RECORD-02)
    provides: "MIGRATIONS[2]'s events table, appendEvent/eventsBetween/pruneEvents, the exported EVENT_RETENTION_MS, and hive.setEventStore wired at boot — ALL of which had already landed the storage half this plan was written to build"
  - phase: 03-02
    provides: "hive.ts/index.ts at the base commit; applyCostRow verified unchanged by 03-02, exactly as this plan's interfaces predicted"
provides:
  - "PersistStore.earliestEventTs(): number | null — the earliest event ts STILL STORED, hive:timeline's firstTs"
  - "hive.ts's applyCostRow as a module-level EXPORT returning its computed delta at BOTH exits"
  - "HiveManager.dailyCostRows(dayStartMs, dayEndMs) — per-row cost deltas for a day, diffed then filtered"
  - "hive.ts's LOG_TAIL_BYTES exported, so a test can size a fixture from the real read cap"
  - "src/main/timeline.ts — a pure, import-free aggregation module: summarizeDay, bucketDetail, parseDayParam, validateBucketIndex, BUCKET_MINUTES/BUCKETS_PER_DAY/BUCKET_DETAIL_ROW_CAP, TimelineResult/BucketDetailResult"
  - "hive:timeline and hive:timelineBucket IPC + preload hiveTimeline/hiveTimelineBucket, one discriminated shape on every path"
affects: [03-07, 03-08, SCALE-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Logic that must be tested goes in an import-free module beside the handler, never inside index.ts — index.ts is unloadable under this repo's harness, so a handler body is only ever pinned by greps a `return {}` also satisfies"
    - "ONE discriminated response shape on every path (success, rejection, store-unavailable). A zeroed success is indistinguishable from a genuinely empty day."
    - "Two stores with different lifetimes need an explicit flag (eventsAgedOut), or the UI contradicts itself on the same day"
    - "Order of operations is a testable contract: dropping undisplayable rows BEFORE a cap, and diffing BEFORE a range filter, are both provable by mutation"

key-files:
  created:
    - src/main/timeline.ts
    - test/timeline.test.cjs
  modified:
    - src/main/db.ts
    - src/main/hive.ts
    - src/main/index.ts
    - src/preload/index.ts
    - test/db-fts.test.cjs
    - test/hive-durability.test.cjs
    - test/hive-protocol-v2.test.cjs
    - test/boot-floor.test.cjs

key-decisions:
  - "NO new migration and NO second events table. RECORD-02 landed MIGRATIONS[2] with an events table first. Measured live: the plan's literal migration #3 THROWS `SqliteError: no such column: floor_id` on any already-migrated DB, and db.ts's own migrate() comment says a throw inside a migration escapes the quarantine path and leaves the store permanently unopenable."
  - "EVENTS_RETENTION_DAYS was NOT created. EVENT_RETENTION_MS is already exported and test-pinned; a second copy of the number is how 'the window is 30 days' becomes true in one file and false in the other."
  - "The 4th-constructor-parameter events sink was NOT added. setEventStore already exists, is wired at boot after persist.open(), and is a better shape for the same reason the plan itself gives (persist is built after hive)."
  - "applyCostRow's arithmetic verified byte-identical by DIFF, not by a positive-presence grep. Only the return channel changed, at both exits."
  - "dailyCostRows diffs the WHOLE ledger and filters to the range AFTER — a 00:04 row must be seeded against yesterday's last snapshot, not billed its whole cumulative total to bucket 0."
  - "Every new capability was negative-controlled by mutation before being trusted: both mutants were killed and the exact defect signature recorded."

patterns-established:
  - "Mutation-test the load-bearing assertion, not just the happy path: replace the implementation with the plausible wrong version and watch the specific case go red"
  - "When a plan's core artifact has already been built by another phase under a different shape, re-measure what actually exists before writing anything — the literal plan here was not merely redundant, it was destructive"

requirements-completed: []

# Metrics
duration: 96min
completed: 2026-08-26
---

# Phase 3 Plan 3: SCALE-03 Storage and Timeline IPC Summary

SCALE-03's replay layer landed on RECORD-02's existing `events` table rather than a duplicate
one — `earliestEventTs`, an exported `applyCostRow` with a widened return channel,
`dailyCostRows`, and a pure `timeline.ts` behind two thin, discriminated IPC handlers.

## The deviation that mattered

**The plan's Task 1 would have bricked every shipped install.**

Plan 03-03 was written to create the `events` table as migration #3, with schema
`(id, floor_id, ts, kind, agent_id, task_id, session_id, payload)`. Between planning and
execution, Phase 4's RECORD-01/RECORD-02 landed `MIGRATIONS[2]` — one migration, two tables —
including an `events` table of `(id, ts, kind, json)`, where `json` is the whole event
verbatim and therefore a superset of the columns the plan wanted to split out.

I did not assume the collision was harmless. I ran it:

```
user_version 3, events(id, ts, kind, json) already present
  → CREATE TABLE IF NOT EXISTS events (id, floor_id, ts, ...)   silently no-ops
  → CREATE INDEX IF NOT EXISTS idx_events_floor_ts ON events(floor_id, ts)
    SqliteError: no such column: floor_id
```

`db.ts`'s own `migrate()` comment states the consequence: *"No `throw` in here. The quarantine
path in open() only fires for corruption, and a throw raised by a migration escapes it and
leaves the store permanently unopenable."* Following the plan literally would have made
`PersistStore.open()` throw forever on every machine that had already run RECORD-02 — the
worst available outcome, and completely invisible to every grep in the plan's own acceptance
criteria. Note also that the plan's criterion
`grep "CREATE TABLE IF NOT EXISTS events" src/main/db.ts` **matches exactly 1** was already
satisfied at the base commit and would have gone to 2 (FAIL) had I complied.

So SCALE-03 reads the table that is there. What was genuinely missing was one method.

## What was already landed (verified, not assumed)

| Plan artifact | Status at base commit `07d2cc7` |
|---|---|
| `events` table, migration | **Already there** — `MIGRATIONS[2]`, `user_version` 3 |
| `recordEvent` (the writer) | **Already there** as `appendEvent(kind, json, ts?)` |
| `eventsInRange` (the reader) | **Already there** as `eventsBetween(from, to)`, `[from, to)`, ascending, deliberately unlimited |
| Retention delete | **Already there** as `pruneEvents(olderThanMs)`, called from `boot.ts` at boot and once a day |
| `EVENTS_RETENTION_DAYS` | **Already there** as the exported, test-pinned `EVENT_RETENTION_MS` (30 days) |
| The injected events sink | **Already there** as `setEventStore(store)`, structurally typed, wired at `boot.ts:1413` after `persist.open()` |
| `earliestEventTs` | **Absent — this plan added it** |
| `applyCostRow` exported / widened | **Absent — this plan did it** |
| `dailyCostRows` | **Absent — this plan added it** |
| `timeline.ts`, `hive:timeline`, `hive:timelineBucket` | **Absent — this plan added them** |

Duplicating any of the first six would have been the parallel-implementation risk D-22 exists
to prevent, and my execution brief said so explicitly for the retention constant: *"it is
EXPORTED and pinned by a test SPECIFICALLY so downstream plans do not invent their own
retention window — import it, do not redefine it."*

## SCALE-03's ROADMAP caveat — re-measured, and CORRECTED

`ROADMAP.md:351` records:

> The timeline is real, but on a busy day it has holes — `LOG_ROTATE_BYTES` at `hive.ts:267`
> rotates at 8 MB keeping one generation, so replay reads a window, not the day

**Measured this session, from a live driver — not read off a constant:**

```
LOG_ROTATE_BYTES  hive.ts:375  = 8,388,608 bytes
LOG_TAIL_BYTES    hive.ts:383  =    65,536 bytes   (128x tighter than the rotate cap)
EVENT_RETENTION_MS             = 2,592,000,000 ms = 30 days

fixture: 5 morning events + 33 noise events = 137,099 bytes of log.jsonl
  did the 8 MB rotate fire?            false        (the file is 61x under the cap)
  logTail() sees 15 events; morning?   ABSENT
  eventsBetween(morning window)        5 of 5, with earliestEventTs == the morning

retention: 39 rows before | pruneEvents deleted 6 | 33 rows after
appendLog against a CLOSED store threw? false | the JSONL still got the line? true
```

Three corrections follow, and one new residual:

1. **Wrong mechanism.** The 8 MB rotate never fired, yet `logTail()` had already lost the
   morning at 137 KB. What truncates replay is `LOG_TAIL_BYTES`, a *read* cap in `logTail()`
   — 128× tighter than the rotate the ROADMAP blames. Fixing rotation alone would have
   changed nothing an operator could see. (03-CONTEXT.md's D-21 says this in prose; this is
   the live measurement of it.)
2. **Wrong line.** `LOG_ROTATE_BYTES` is `hive.ts:375`, not `:267`. D-21 recorded `:323`;
   it has since moved again.
3. **The conclusion no longer holds.** Replay does not "read a window, not the day".
   `eventsBetween` returned all five events `logTail` could not reach, unlimited and ordered,
   off `idx_ev_ts`. **The bound on replay is now RETENTION, not rotation** — 30 days, a
   stated, exported, test-pinned number, enforced by a delete that provably removed exactly
   the 6 rows outside the window and spared the 33 inside it.
4. **New residual, stated rather than papered over.** The mirror is deliberately best-effort:
   measured live, `appendLog` against a *closed* store does not throw and the JSONL still gets
   the line. That is the correct trade — the event log's crash-safety must not become
   contingent on SQLite — but it means the `events` table can have holes `log.jsonl` does not,
   and nothing in the timeline response can currently detect that. Separately, the table only
   holds what `appendLog` wrote *after* RECORD-02 landed; older days have `log.jsonl` only,
   which beyond 64 KB the app cannot read. `firstTs` and `eventsAgedOut` exist precisely to
   declare that rather than draw it as a quiet day.

I did **not** edit `ROADMAP.md` — the orchestrator owns that file. The correction is recorded
here for it.

## Baseline drift — 19 of 20 cited line numbers had moved

Measured at the base commit `07d2cc7`, not trusted from the plan's prose:

| Citation | Plan says | Measured at base | Moved |
|---|---|---|---|
| `hive.ts` `private applyCostRow` | :2652 | **:2914** | yes |
| `hive.ts` `if (!taskId) return;` (in applyCostRow) | :2665 | **:2927** | yes |
| `hive.ts` appendCostLedger's applyCostRow call | :2571 | **:2860** | yes |
| `hive.ts` rescanCostLedger's applyCostRow call | :2677 | **:2948** | yes |
| `hive.ts` `rescanCostLedger` def | :2695 | **:2939** | yes |
| `hive.ts` `applyReviewVerdict` | :2016 | **:1787** | yes (moved UP) |
| `hive.ts` `budgetForAgent` | :2750 | **:3012** | yes |
| `hive.ts` `LOG_ROTATE_BYTES` | :323 | **:375** | yes |
| `hive.ts` `LOG_TAIL_BYTES` | :326 | **:378** | yes |
| `hive.ts` `appendLog` | :2529 | **:2780** | yes |
| `hive.ts` `appendCostLedger` | :2550 | **:2833** | yes |
| `hive.ts` `logTail` | :2487 | **:2696** | yes |
| `hive.ts` log.jsonl rotate `renameSync` | :2503 | **:2802** | yes |
| `hive.ts` cost-ledger `appendFileSync` | :2550 | **:2856** | yes |
| `hive.ts` cost-ledger `readFileSync` | :2639 | **:2945** | yes |
| `boot.ts` `hive = new HiveManager(` | :1004 | **:1147** | yes |
| `boot.ts` `persist = new PersistStore` | :1148 | **:1329** | yes |
| `index.ts` hive IPC neighbourhood | :2983 | **:3146** | yes |
| `index.ts` `hive:agentDirectory` | :3450 | **:3625** | yes |
| `tsconfig.node.json` `"strict": true` | :6 | :6 | **no** |

My execution brief predicted `boot.ts persist ≈ :1359` and `hive:agentDirectory :3625`. The
second was exact; the first was **:1329** — the brief's number was 30 lines off, which is why
every anchor here was re-derived by symbol rather than inherited.

**Grep-count baselines the plan pins — all re-measured at `07d2cc7`:**

| Pin | Plan says | Measured | Verdict |
|---|---|---|---|
| `cost-ledger.jsonl` in `hive.ts` | 4 | 4 | correct |
| `session_id` in `hive-protocol-v2.test.cjs` | 1 | 1 | correct |
| `dailyCostRows` in `hive-protocol-v2.test.cjs` | 0 | 0 | correct |
| `LOG_TAIL_BYTES` in `hive-durability.test.cjs` | 0 | 0 | correct |
| `timeline store unavailable` in `index.ts` | 0 | 0 | correct |
| `earliestEventTs` in `db-fts.test.cjs` | 0 | 0 | correct |
| `floor_id\|floorId\|windowId` in `hive.ts` | 0 | 0 | correct |
| `CREATE TABLE IF NOT EXISTS events` in `db.ts` | 0 (implied) | **1** | **STALE — the table already existed** |
| `DELETE FROM events WHERE ts` in `db.ts` | 0 (implied) | **1** | **STALE — retention already existed** |
| `B_IPC_JOINED` in `boot-floor.test.cjs` | (re-derive) | **161** | re-derived live → **163** |

## Task-by-task

### Task 1 — the events reader (`3abe882` RED, `2e8c173` GREEN)

Added `PersistStore.earliestEventTs()`: `MIN(ts)` off `idx_ev_ts`, `null` — never `0` — on an
empty table, because `0` is a real epoch timestamp a UI renders as "records began in 1970".
Its contract is the earliest ts **still stored**, not the first event ever, because
`pruneEvents` moves `MIN(ts)` forward daily and 03-07's gap marker must describe the live
store.

Three cases in `test/db-fts.test.cjs`: a schema pin on the landed table read back through a
second independent readonly handle (columns, `user_version >= 3` as a *lower bound* — the rail
is append-only — and both indexes by name); `null` on empty; and the prune case, which computes
its expired timestamp **from the exported `EVENT_RETENTION_MS`** and asserts the expired row is
actually *gone*, the fresh row *survives*, and `earliestEventTs` has *followed* the delete.

### Task 2 — the shared diff and the time-range cost lane (`78ff639` RED, `5ee6897` GREEN)

`applyCostRow` hoisted out of `HiveManager` to a module-level export. Arithmetic verified
byte-identical by **diff** — the series key (NUL-separated, `\u0000`, never a space), the clamp, the
`cumulative.set`, the `byTask` fold and the `if (!taskId)` *condition* are untouched. Only the
return channel changed, at both exits, and a test asserts the null-task exit *still credits no
card* so widening it did not quietly start billing.

`dailyCostRows(dayStart, dayEnd)` scans the whole ledger, diffs through the shared function,
and filters to the range **after**. That order is load-bearing: a 00:04 row must be diffed
against yesterday's last snapshot, not treated as a series opening that bills its whole
cumulative total to bucket 0. Null-`task_id` rows are kept — the day total is not card-scoped.
Non-finite bounds read nothing, matching `pruneEvents`/`eventsBetween`'s fail-closed rule.

`LOG_TAIL_BYTES` exported (explicitly authorized by the plan) so the driver sizes itself from
the real cap.

Three behavioural cases: the two-exit return channel; a **mid-day session rollover** driven
through the real `appendCostLedger`, whose failure message names all three wrong answers
(agent-only key clamps to 600, unclamped goes negative, summing gives 780); and `dailyCostRows`
with a pre-boundary seed row, a null-task row and an after-the-day row.

The tail-cap driver in `hive-durability.test.cjs` wires a real `PersistStore` through
`setEventStore` exactly as `boot.ts` does, **with a negative control before wiring** (an event
appended with no store must not reach SQLite), then proves the two stores disagree.

### Task 3 — `timeline.ts` and the two handlers (`93a511e` RED, `67d46ae` GREEN)

`src/main/timeline.ts`: zero imports (asserted by a test, not by a guessed-path grep), so
`test/timeline.test.cjs` loads and drives it. 96 buckets of 15 minutes; envelopes as a
*filter* of the event track; rows outside `[dayStart, +24h)` dropped rather than clamped into
the edge buckets; the 200-row cap reporting the real total; the zero-delta drop as
`bucketDetail`'s **first** step; `eventsAgedOut`; and both validators.

`index.ts`'s handlers fetch, delegate and return — no bucket math, no cap logic, no filtering.
One discriminated shape on every path including store-unavailable.

## Deviations from Plan

### 1. [Rule 3 — Blocking] No migration #3; the landed `events` table is reused

Found during Task 1. The plan's literal DDL throws on any already-migrated DB and bricks
`PersistStore` permanently (probe output above). Adapted: reuse `MIGRATIONS[2]`'s table,
`appendEvent`, `eventsBetween`, `pruneEvents` and `EVENT_RETENTION_MS`; add only
`earliestEventTs`. Files: `src/main/db.ts`. Commit `2e8c173`.

**Acceptance criteria affected, with the honest verdict on each:**

| Plan criterion | Verdict |
|---|---|
| `CREATE TABLE IF NOT EXISTS events` matches exactly 1 | **PASSES** — 1, satisfied by RECORD-02's table |
| `idx_events_ts\|idx_events_floor_ts` >= 2 | **NOT MET, and correctly so.** The equivalent indexes exist as `idx_ev_ts` and `idx_ev_kind_ts`. Renaming shipped indexes to satisfy a grep would be a cosmetic migration with real risk. Asserted by NAME in the new schema test instead. |
| `recordEvent\|eventsInRange\|earliestEventTs` >= 3 | **PARTIAL** — `earliestEventTs` added; the other two exist as `appendEvent`/`eventsBetween` |
| `DELETE FROM events WHERE ts` >= 1 | **PASSES** — 1, in `pruneEvents` |
| `EVENTS_RETENTION_DAYS` in the test >= 1 | **NOT MET by name; met in substance** — the test uses `EVENT_RETENTION_MS` (4 occurrences) and derives its expired timestamp from it, which is the intent the pin encodes |
| `eventsInRange` in the test >= 1 | **Met as `eventsBetween`** (2 occurrences) |

### 2. [Rule 3 — Blocking] No fourth constructor parameter; `setEventStore` is the sink

Found during Task 2. RECORD-02 landed the injected sink as a setter, wired at
`boot.ts:1413` after `persist.open()`. Adding a second sink would double-write every event and
is the parallel implementation D-22 forbids. The plan's own interface note gives the reason the
setter is right (persist is constructed after hive). The production-wiring pin was re-derived
and checked as construct → open → `setEventStore`, with retention actually called. Files: none
(boot.ts correctly untouched).

### 3. [Rule 2 — Missing critical] `dailyCostRows` fail-closes on non-finite bounds

The plan did not specify bound validation for `dailyCostRows`. Its arguments originate at the
renderer. `pruneEvents` and `eventsBetween` both already guard this way; matching them costs
one line. Files: `src/main/hive.ts`. Commit `5ee6897`.

### 4. [Rule 1 — Bug, self-inflicted] A raw NUL byte written into `hive.ts`

While hoisting `applyCostRow` I wrote a literal U+0000 into the series-key template instead of
the six-character `\u0000` escape, turning `hive.ts` into a binary file to grep. Caught
immediately (`grep` reported "Binary file matches"), repaired, and the result diffed against
the original body to confirm the key construction is character-for-character unchanged.
Recorded rather than quietly fixed because it is exactly the class of edit that would have
silently changed a series key and mis-billed every card.

### 5. [Rule 1 — Bug] Windows EPERM in the new driver's teardown

The tail-cap driver first put `harness.db` inside the harness home. On Windows an open SQLite
handle (plus `-wal`/`-shm`) makes `rmSync` throw `EPERM`, and `floor(t)` had registered its
cleanup first — so the test failed in teardown with every assertion passing. Fixed by giving
the DB its own temp dir with its own close-then-remove hook. Files:
`test/hive-durability.test.cjs`.

### 6. [Beyond plan] An end-to-end shape-fit case

`timeline.test.cjs` proves the arithmetic against hand-built rows; `index.ts` cannot be loaded.
Neither covers whether the real producers' row shapes match what the pure module consumes — a
mismatch would return 96 well-formed *empty* buckets while every grep and every unit test
stayed green, which is precisely the "the feature exists and does nothing" class this project
keeps paying for. Added a case wiring the real `HiveManager` + `PersistStore` + ledger file
through `eventsBetween` / `dailyCostRows` / `earliestEventTs` into `summarizeDay` and
`bucketDetail`. Files: `test/hive-durability.test.cjs`.

## Negative controls (mutation-tested, not assumed)

Both ran against the real suite, both killed, both reverted:

| Mutation | Predicted defect signature | Observed |
|---|---|---|
| Move the zero-delta drop to AFTER the cap | `200 rows / truncated:true / total:210` | **Exactly that**, test red |
| Zero out `dailyCostRows`' returned delta | `bucket 0 read 0 tokens` | **Exactly that**, test red |

The first proves the 150-idle-rows case is not decorative. The second proves the end-to-end
case detects a dead cost lane that no grep and no unit test would have caught.

## Verification

| Gate | Result |
|---|---|
| `npm test` at base `07d2cc7` | 1088 tests, 1081 pass, **0 fail**, 7 skipped, **24,583.9 ms** |
| `npm test` after this plan | 1116 tests, 1109 pass, **0 fail**, 7 skipped, **24,860.0 ms** |
| Net | **+28 tests, 0 regressions, +276 ms (+1.1%)** |
| `npm run typecheck` | clean (node + web) |
| `npm run lint` | clean (`--max-warnings 0`) |

No test approached the 240,728 ms outlier Phase 4 found; the slowest new file is
`hive-durability.test.cjs`, and the three new cases in it run in 90 ms, 72 ms and 101 ms.

**Acceptance greps, final state:**

```
timeline.ts: 4 exported functions | 0 top-level imports | 0 electron refs | 2 eventsAgedOut
test/timeline.test.cjs: 11 eventsAgedOut
hive.ts: 2 "return delta" | 0 "private applyCostRow" | 0 "this.applyCostRow"
         0 "isFallback" | 0 "from 'electron'" | 3 dailyCostRows | 1 export function applyCostRow
index.ts: 1 hive:timeline | 1 hive:timelineBucket | 4 validator calls | 1 "timeline store unavailable"
preload:  2 (hiveTimeline, hiveTimelineBucket)
boot-floor IPC pin: 161 -> 163, re-derived live
existence pins now: db-fts eventsBetween 2, earliestEventTs 9, EVENT_RETENTION_MS 4
                    hive-protocol-v2 session_id 6, dailyCostRows 5
                    hive-durability LOG_TAIL_BYTES 5
```

**Structural checks run and passed:** `appendCostLedger` contains no `eventsSink`/`eventStore`/
`appendEvent` (paired with the positive that it still writes `cost-ledger.jsonl`, so the
negative is not vacuous); `applyCostRow` returns `{tokens:2,usd:2}` from the null-task exit and
`{tokens:4,usd:5}` from the carded one, driven through `loadTs`; `boot.ts` wiring ordered
construct → open → `setEventStore` with retention called.

## Known Stubs

None. `control:breakerSnapshot` remains caller-less by design (03-08 wires it) and was not
touched. `hive:timeline`/`hive:timelineBucket` are likewise caller-less until 03-07 — that is
this plan's stated contract, not a stub: both are fully implemented, IPC-pinned, and their
logic is exercised by 20 real test cases plus an end-to-end drive.

## Requirements ledger

**SCALE-03 was NOT ticked.** D-07 forbids it in Phase 3, this plan's frontmatter key is
`requirements_addressed` rather than `requirements`, and `requirements-completed` above is
empty. 03-09 asserts SCALE-03 is still `Pending` after every other plan lands.

## Commits

| Hash | Type | What |
|---|---|---|
| `3abe882` | test | RED: earliestEventTs cases + the schema pin on the landed events table |
| `2e8c173` | feat | GREEN: `PersistStore.earliestEventTs()` |
| `78ff639` | test | RED: applyCostRow's two exits, dailyCostRows, the tail-cap driver |
| `5ee6897` | feat | GREEN: applyCostRow hoisted/exported/widened, dailyCostRows, LOG_TAIL_BYTES exported |
| `93a511e` | test | RED: 18 cases against a timeline.ts that did not exist |
| `67d46ae` | feat | GREEN: timeline.ts, hive:timeline/hive:timelineBucket, preload, IPC pin, end-to-end case |

## Notes for 03-07

- The pinned return shape is honoured exactly. **Both branches are mandatory over there:** an
  `ok === false` branch rendering `03-UI-SPEC.md:247`'s error string with this channel's
  `error` substituted, and an `eventsAgedOut === true` branch that **outranks** every
  `firstTs`-derived no-record sentence.
- `firstTs` is the earliest ts **still stored**. It moves forward as retention runs. Do not
  cache it across days.
- `bucketDetail`'s `total` counts **displayable** rows only, so `Showing {shown} of {total}`
  never reports rows the UI would not have drawn. Do not re-filter zero-delta cost rows in the
  renderer; they are already gone.
- `day` is a `'YYYY-MM-DD'` **local** date string. `parseDayParam` accepts today and tomorrow
  and refuses anything further out as malformed, not empty.

## Self-Check: PASSED

- `src/main/timeline.ts` — FOUND
- `test/timeline.test.cjs` — FOUND
- `.planning/phases/03-scale-and-observability/03-03-SUMMARY.md` — FOUND
- Commits `3abe882`, `2e8c173`, `78ff639`, `5ee6897`, `93a511e`, `67d46ae` — all FOUND in
  `git log`
- `STATE.md` / `ROADMAP.md` — NOT modified (orchestrator-owned), confirmed by `git status`
