---
phase: 04-overnight-on-a-repo-that-matters
plan: 02
subsystem: database
tags: [sqlite, better-sqlite3, migrations, wal, retention, audit-trail, prepared-statements, asvs-v7]

# Dependency graph
requires:
  - phase: 01-finish-the-floor
    provides: "FLOOR-07's MIGRATIONS rail in src/main/db.ts (user_version 2, memory_fts) — this plan appends index 2 to it and nothing else"
  - phase: 01-finish-the-floor
    provides: "test/load-ts.cjs's electron stub — db.ts:19 imports `app` from electron, and CI installs with `npm ci --ignore-scripts` with no electron binary at all"
provides:
  - "MIGRATIONS[2] → user_version 3: tool_calls + events, both tables and all four indexes in ONE migration"
  - "PersistStore.recordToolCall / toolCalls — RECORD-01's storage, with target capped at 4 KiB and the hot INSERT cached"
  - "PersistStore.appendEvent / eventsBetween / pruneEvents — RECORD-02's storage, a day as one range scan and retention as a query bound"
  - "EVENT_RETENTION_MS = 30 days, exported so the shipped number is stated rather than buried in a caller"
  - "ToolCallRow / EventRow types"
  - "test/record-persist.test.cjs + test/record-retention.test.cjs — 11 cases, all three platforms, zero skips"
affects: [04-09-the-appendLog-mirror, 04-15-the-hook-socket-writer, 04-20-the-production-wiring, SCALE-03-replay]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cached prepared Statement on the PersistStore instance for the two hot inserts, nulled in close() — the first write path in db.ts that does not re-prepare on every call"
    - "Retention as a query bound (DELETE … WHERE ts < ?) replacing one-generation rotation, with the bound strictly `<` so the caller's own edge day survives"
    - "Byte-capped agent-authored text at the storage boundary (capBytes), sized against the 16 MiB a hook line may carry"
    - "Mutation-probing an assertion before trusting it: each key claim was driven RED by a deliberate one-line defect in the source, then reverted"

key-files:
  created:
    - test/record-persist.test.cjs
    - test/record-retention.test.cjs
  modified:
    - src/main/db.ts
    - test/db-fts.test.cjs

key-decisions:
  - "D-16 honoured literally: ONE storage decision, the existing SQLite PersistStore. No third JSONL, no second store, no new dependency. MIGRATIONS[2] carries BOTH tables because the rail is indexed by POSITION — two plans each appending 'their' table produce two MIGRATIONS[2]s and, on a machine that ran one of them, user_version 3 with half the schema, permanently."
  - "D-17's LITERAL reading was rejected on three measured grounds (see 'D-17 rejected' below). telemetry.ts is untouched: SPAN_RING_CAP stays 200, ATTR_ALLOWLIST is not widened, the ring buffer at telemetry.ts:161 is byte-identical. RECORD-01 is a new writer, not a bigger ring — and this plan ships only its storage."
  - "Durability is stated at the level SQLite actually gives it and NOT silently upgraded: synchronous = NORMAL under WAL (db.ts openOnce) makes a row a committed WAL append before recordToolCall returns, so it survives a PROCESS crash; it is not guaranteed against an OS or power loss until the next checkpoint. FULL would fsync on every one of ~288k tool calls a day to buy a guarantee against a failure that also takes the work being recorded. Written into the code comment, not only here."
  - "No batching queue (ponytail, with the ceiling named in-file): a queue is a buffer that is EMPTY after the crash this record exists for. Upgrade path if a measurement ever shows contention: db.transaction() over a ~100 ms flush window — whose cost is exactly the durability above."
  - "eventsBetween is deliberately UNLIMITED where toolCalls is clamped. 'The day, minus whatever fell past a LIMIT' is precisely the one-generation 8 MiB rotate this requirement replaces: it would return a plausible count and quietly drop the morning. pruneEvents, not a LIMIT, is what keeps the table finite."
  - "test/db-fts.test.cjs's exact `user_version === 2` pin was retired to `>= 2`. The source is correct and the pin was stale — see Deviations; the relaxation was live-fire proved not to weaken the guard."

patterns-established:
  - "Assert the COLUMN, never only the row count, and make the failure message say the row arrived: 04-VALIDATION names 'asserting row count passes with a null target' as RECORD-01's vacuous pass, so a red run must be debuggable as an empty column rather than as a lost write."
  - "Assert the FIRST row of a range by CONTENT: a tail assertion is exactly what the behaviour being replaced already satisfies."
  - "Compute the threshold a test claims to cross inside the test (the >16 MiB day is summed and asserted), so a padding constant edited down for speed goes red instead of silently green."

requirements-completed: [RECORD-01, RECORD-02]

# Metrics
duration: ~35min
completed: 2026-08-25
---

# Phase 04 Plan 02: The Durable Record's Storage — Summary

RECORD-01 and RECORD-02's storage landed in the SQLite handle that was already open: one appended migration (`user_version` 2 → 3) carrying `tool_calls`, `events` and four indexes, five `PersistStore` methods with the two hot inserts cached, and 11 new cases that were driven RED first and then mutation-probed rather than trusted.

## What shipped

| Artifact | What it provides |
|---|---|
| `src/main/db.ts` `MIGRATIONS[2]` | `tool_calls(id, agent_id, ts, tool, target, decision, reason)` + `events(id, ts, kind, json)`, with `idx_tc_agent_ts`, `idx_tc_ts`, `idx_ev_ts`, `idx_ev_kind_ts`. One migration, both tables. |
| `recordToolCall(row)` | One insert, cached statement, `target` capped at 4 KiB by BYTES, bound parameters only. |
| `toolCalls({agentId?, sinceMs?, limit?})` | Newest-first, limit through the existing `clampLimit` (reused, not re-written), inclusive `sinceMs`. |
| `appendEvent(kind, json, ts?)` | One insert, cached statement, `json` stored verbatim and uncapped. |
| `eventsBetween(fromMs, toMs)` | Ascending, `[from, to)`, unlimited — a day as one range scan off `idx_ev_ts`. |
| `pruneEvents(olderThanMs)` | `DELETE FROM events WHERE ts < ?`, returns `changes`. Non-finite bound deletes nothing rather than everything. |
| `EVENT_RETENTION_MS` | 30 days, exported. Verified live: `2592000000` = 30 days. |
| `test/record-persist.test.cjs` | 6 cases — the migration, the reopen, the non-null `target`, the by-design null, the clamp, `sinceMs`, the byte cap. |
| `test/record-retention.test.cjs` | 4 cases + 1 constant pin — the >16 MiB day read from its FIRST row, the half-open range, retention past the bound, the shipped number. |

## The RED runs, as they happened

Both test files were written and committed BEFORE the schema and the methods they exercise (`0ae8d60`), and both failed for the right reason — a missing method or a missing migration, never a `require` error.

**RED run 1 — `node --test test/record-persist.test.cjs test/record-retention.test.cjs`, at `8749a2b`:**

```
ℹ tests 11   ℹ pass 0   ℹ fail 11   ℹ skipped 0

✖ open() lands on user_version 3 with tool_calls, events and all four indexes
  AssertionError: user_version is not 3 after a fresh open(). Migration index 2 takes the
  DB from 2 to 3, so either the entry was not appended or a shipped one was edited ...
  2 !== 3

✖ a reopen re-runs nothing: user_version stays 3 and migration 2's rows survive
  TypeError: first.recordToolCall is not a function
✖ a tool call written before close() survives a reopen with its target non-null
  TypeError: first.recordToolCall is not a function
✖ a null target round-trips as null, and is distinguishable from a row that never arrived
  TypeError: store.recordToolCall is not a function
✖ an untrusted limit is clamped rather than passed through to SQLite
  TypeError: store.recordToolCall is not a function
✖ sinceMs excludes older rows and keeps the boundary row
  TypeError: store.recordToolCall is not a function
✖ an oversized agent-authored target is capped before it is stored
  TypeError: store.recordToolCall is not a function

✖ a day whose events exceed 16 MiB reads back whole, first row included
  TypeError: store.appendEvent is not a function
✖ the range is inclusive of dayStart and exclusive of dayEnd
  TypeError: store.appendEvent is not a function
✖ pruneEvents deletes only strictly-older rows and leaves the day whole
  TypeError: store.appendEvent is not a function
✖ the shipped retention window is a stated number, not an implicit one
  AssertionError: the default retention window moved. D-18 requires the shipped number to
  be STATED ...   (EVENT_RETENTION_MS was undefined)
```

**RED run 2 — after `MIGRATIONS[2]` (`623601e`), before the methods.** Exactly one case flipped, which is what an append-only migration should buy on its own:

```
✔ open() lands on user_version 3 with tool_calls, events and all four indexes
✖ (the other six)  TypeError: ... recordToolCall is not a function
```

**GREEN — after the five methods (`8a4a079`):** `ℹ tests 11 · pass 11 · fail 0 · skipped 0`, in ~0.4 s.

## The assertions were mutation-probed, not assumed

Every key claim was driven RED by a deliberate one-line defect in the SOURCE, then the source was restored byte-identical (`cp` from a pre-probe backup, confirmed by `git diff --stat`). This is what distinguishes an assertion that holds from an assertion that happens to be satisfied.

| Probe (reverted) | Result |
|---|---|
| `eventsBetween` `ORDER BY ts ASC` → `DESC` | ✖ *"the first row of the day is `{...\"marker\":\"floor-closed-at-day-end-0017\"...}` — it does not carry floor-opened-at-day-start-0001"*. A count-only assertion would have passed: all 17 rows were still returned. |
| `recordToolCall` stores `null` for `target` | ✖ *"the row for tool=Bash (id=3, agentId=a1) came back from disk with target=null. The ROW SURVIVED — this is NOT a missing write."* Row counts stayed correct throughout. |
| `pruneEvents` `<` → `<=` | ✖ *"pruneEvents(bound) deleted 2 rows, not 1."* |
| `db-fts`'s relaxed pin, against a ONE-entry rail | ✖ *"user_version is 1, below the 2 that migration index 1 produces."* Control probe (removing only index 0, leaving 2 entries) correctly PASSED at 2 — proving the clause reads the real pragma, not a constant. |

## Gate results (measured this session, on win32 / node v24)

| Gate | Baseline at `8749a2b` | After this plan | Delta |
|---|---|---|---|
| `npm test` | 843 tests · 836 pass · **0 fail** · 7 skipped | 854 tests · 847 pass · **0 fail** · **7 skipped** | **+11 tests, +11 pass, skip count UNCHANGED** |
| `npm run typecheck` | 0 errors | 0 errors | — |
| `npm run lint` (`--max-warnings 0`) | exit 0 | exit 0 | — |
| `git diff --stat -- package.json package-lock.json` | — | **empty** | D-36 held: no install step, no dependency edit |

**The skip count is unchanged at 7, and that is a property of the new files rather than an accident.** Neither carries a `skip:` option, neither is platform-gated, and both are pure SQLite over a real `better-sqlite3` handle — so they run identically on all three CI runners. `test/suite-integrity.test.cjs`'s declared-skip census (which is keyed per-file on the presence of a `skip:` option) sees nothing new, and its `winSkips` floor is untouched.

## D-17 rejected on three measured grounds

D-17's literal instruction — *"persist every tool call at the point the span is recorded"* — is not implementable, and RESEARCH § Pattern 4 / L-05 measured why. Implementing it literally ships a Claude-only record with a null `target` **that passes its own unit test**: exactly the shape of failure this project names. Restated here because a SUMMARY that omits it invites the next plan to "fix" the omission:

1. **No `target` in the span.** `ToolSpan` (`telemetry.ts:97-107`) is `{agentId, sessionId, ts, tool, success, durationMs, decision?, error?}` — no file path, no command. `target` is half of what RECORD-01 asks for.
2. **No `target` available upstream either.** The span is built from `flattenAttrs(lr.attributes)` (`telemetry.ts:535-544`), and `flattenAttrs` (`:682-690`) drops every key outside `ATTR_ALLOWLIST` (`:676-680`), whose only tool-related member is `tool_name`. Widening it would be widening a list whose stated purpose (`:670-675`) is keeping PII out — with a raw command string.
3. **Claude only.** The whole OTel env block is gated `if (claudeProvider && this._otelEndpoint)` (`hive.ts:1122`).

**Consequences, asserted as a negative alongside this plan's positives:** `src/main/telemetry.ts` is byte-identical — `SPAN_RING_CAP` is still 200, the ring buffer at `:161` is untouched, and `ATTR_ALLOWLIST` was not widened. `git diff --stat` for this plan lists four files and `telemetry.ts` is not one of them. The writer hangs off the hook socket in plan **04-15**, where `p.tool_name` and `p.tool_input` already arrive and `authorized()` has already derived the agent id from a per-agent token — GATE-01's guarantee applied before the writer sees anything. T-04-LOG-06 is closed by construction: this plan adds no OTel path at all.

## ADR-0005 is not at risk, and here is why

ADR-0005 governs **cumulative** cost samples — diff consecutive rows, never sum them. Nothing in this migration is a cumulative series:

- `tool_calls` rows are **discrete events**: one row per tool call, never a running total. `COUNT(*)` and `ORDER BY ts` are the only aggregations either table invites, and neither is a sum over a cumulative snapshot.
- `events` rows are the same shape — one verbatim event per row.
- The place ADR-0005 *could* have been re-broken is folding `cost-ledger.jsonl` into this migration opportunistically. It was **not** done: `04-CONTEXT.md`'s Deferred list forbids it, and the `cost_ledger` block reserved in `db.ts`'s header comment is left exactly as it was, untouched, for the later migration that will do it deliberately.

## No `UNTRACK_PATHS` entry is needed — a simplification CONTEXT.md does not claim

D-18 warned that the new store might need coordinating with `UNTRACK_PATHS`. It does not. `harness.db` lives at `app.getPath('userData')/harness.db` (`db.ts`, the `open()` default), which is **outside the hive root entirely** — not in the hive repo, not reachable by `git add -A` in the committer's work tree. `gitCommitter.ts:82`'s `log.jsonl` / `log.jsonl.1` entries stay exactly as they are, and `gitCommitter.ts` is not in this plan's diff.

The security consequence is worth stating rather than celebrating: being outside the hive root also means `protectedPathDenial` never sees a path to it (`rootTailVerdict` only compares children of the hive root against its protected literals), so an agent that can reach `%APPDATA%` can read and delete the audit trail of its own tool calls. That is T-04-LOG's boundary row in the plan's threat model, and it is unchanged by this plan — flagged here, not silently absorbed.

## Deferred, with reason (as the plan specified)

- **RECORD-02's `appendLog` mirror is NOT in this plan**, and `LOG_ROTATE_BYTES` was not changed. `hive.ts:2485`'s `appendFileSync` stays exactly as it is — it is the crash-safe path, it is what `logTail` reads, and it is one line inside a `try`. The best-effort `persist.appendEvent(...)` beside it is **plan 04-09**'s (wave 2), which already owns `hive.ts`. This plan ships the storage that call writes into and proves it against a direct driver. `src/main/hive.ts` is not in this plan's diff.
- **RECORD-01's call site is plan 04-15's** (the hook socket), and its production wiring is 04-20's. `src/main/hooks.ts` is not in this plan's diff.
- **`db.ts` remains this plan's sole-owned file for the phase (D-35).** Nothing else may append to `MIGRATIONS`.
- **D-19's SCALE-03 query surface is deliberately not built.** `idx_ev_ts` and `idx_tc_ts` are the criterion that says RECORD-02 IS SCALE-03's storage; Phase 4 builds no replay reader on top of them.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking] `test/db-fts.test.cjs`'s exact `user_version === 2` pin froze an append-only rail**

- **Found during:** the wave gate after Task 2 — `npm test` reported exactly one failure across the whole suite.
- **Issue:** `db-fts.test.cjs:117` asserted `user_version === 2` after a fresh `open()`. `MIGRATIONS[2]` makes it 3.
- **Why this is a stale pin and not a bad source path** (this distinction matters, and the mandate is explicit that a test must never be bent to fit buggy source): the source is *correct*. `04-02-PLAN` mandates `user_version 3`; `db.ts`'s own header declares the rail **append-only** and reserves further migrations by name. An equality there makes the FTS5 file go red for every future schema addition — a failure with nothing to do with FTS5, in the one file whose whole purpose is proving the index is real. The clause's own message states what it guards: *"Migration index 1 takes the DB from 1 to 2, so either the entry was not appended or an existing one was edited"* — which `>= 2` preserves exactly.
- **Fix:** relaxed to `assert.ok(version >= 2, ...)` with the reasoning written in-file, and the test title updated to match.
- **Proved not weakened, live-fire rather than in prose:** with `db.ts` cut down to a **one-entry rail carrying only the FTS5 migration** — so `memory_fts` still exists, is still `USING fts5`, still has `agent_id UNINDEXED`, and all three `sqlite_master` clauses above still pass — the relaxed line is the only thing that fires: `✖ user_version is 1, below the 2 that migration index 1 produces`. A control probe that removed only migration index 0 correctly still PASSED at 2, confirming the clause reads the live pragma rather than a constant. `db.ts` was restored byte-identical after both probes (`git diff --stat` showed only the intended changes).
- **What still pins the FTS5 contract exactly:** the three `sqlite_master` assertions in the same test, `repo-claims.test.cjs`'s independent `MIGRATIONS` entry-count claim and its `CREATE VIRTUAL TABLE ... USING fts5` grep, and this plan's new *"a reopen re-runs nothing: user_version stays 3 and migration 2's rows survive"* case.
- **Files modified:** `test/db-fts.test.cjs`
- **Commit:** `52273a0`

### Additions beyond the plan's letter

**2. [Rule 2 — Missing critical functionality] Non-finite guards on the two range/delete bounds**

`pruneEvents(NaN)` would otherwise bind `NaN` and throw at a caller that is a scheduler, and a `DELETE` whose bound is garbage is the one operation in this file that is not recoverable. `pruneEvents` now deletes **nothing** on a non-finite bound (fail-closed), and `eventsBetween` coerces both bounds. Same reasoning for `recordToolCall`'s `ts` and `appendEvent`'s `ts`, which fall back to `Date.now()`.

**3. [Rule 2] `EVENT_RETENTION_MS` exported rather than left to the caller**

D-18 requires the shipped retention number to be *stated*. The plan's method signature takes an explicit `olderThanMs`, which alone would have let plan 04-09 or 04-20 invent its own window silently. Exporting the constant makes 30 days a single stated fact with a test pinned to it (`the shipped retention window is a stated number, not an implicit one`), and changing it a deliberate two-place act.

**4. Two cases the plan did not require: `sinceMs` and the byte cap**

`sinceMs` is a live branch and the byte cap is a security control (T-04-LOG-03); an untested branch and an unasserted cap are both the shape of thing that is discovered to have never worked. Both are asserted, and the `sinceMs` case pins the *inclusive* boundary specifically — off by one there and "everything since midnight" drops the first event of the day, which is the same first-row blindness RECORD-02 exists to close.

## Authentication gates

None. No credential, token or network access was needed at any point in this plan.

## Threat model — dispositions delivered

| Threat ID | Disposition | Delivered as |
|---|---|---|
| T-04-LOG-01 (SQLi through `target`/`kind`/`json`) | mitigated | Bound parameters only in all five methods. `toolCalls` spells its column list out twice in `listHistory`'s two-branch shape rather than building a `WHERE` by interpolation. **Measured: `0` occurrences of `${` across the new method range.** Both branches still read off `idx_tc_agent_ts`. |
| T-04-LOG-02 (log injection through `target`) | mitigated | Stored raw with bound parameters; the migration comment and the `ToolCallRow` doc comment both state it is agent-authored untrusted text that must be escaped at render, never `eval`ed, never handed to a shell, never trusted as a path. Rendering is out of this plan's scope and is stated as such. |
| T-04-LOG-03 (unbounded `target` from a 16 MiB hook line) | mitigated | `capBytes(target, 4096)` before insert — **bytes, not characters**, because one emoji is four of them. The number and its rationale are in the code, and an asserted case drives a 1,000,000-char target through it. |
| T-04-LOG-04 (unbounded `events` growth) | mitigated | `pruneEvents(olderThanMs)` as a query bound; `EVENT_RETENTION_MS` = 30 days, exported and pinned. The caller that schedules it is a later plan's, by design. |
| T-04-LOG-05 (durability claimed above what WAL gives) | accepted, stated | `synchronous = NORMAL` under WAL survives a **process** crash, not an OS/power loss until checkpoint. Written into `recordToolCall`'s doc comment and into this SUMMARY, rather than silently upgraded to `FULL`. |
| T-04-LOG-06 (raw OTel / PII entering the store) | mitigated | No OTel path added at all; `telemetry.ts` byte-identical. |
| T-04-SC (supply chain) | mitigated | Zero packages added. `better-sqlite3` 13.0.3 was already a dependency; `git diff` on `package.json` / `package-lock.json` is empty. |

## Threat Flags

None. This plan opens no network endpoint, adds no auth path, and its only new trust boundary (agent-authored text → `tool_calls.target`) is already in the plan's `<threat_model>` as T-04-LOG-01/02/03. The `harness.db`-outside-`protectedPathDenial` observation is the register's own boundary row, restated above rather than newly discovered.

## Known Stubs

None. Every method shipped here is fully implemented and exercised by an assertion that fails when the implementation is wrong (mutation-probed above). The two *call sites* are deferred by design to plans 04-09 and 04-15 — that is a wiring boundary the plan specifies and the SUMMARY states, not a stub: nothing in this plan renders an empty value to a UI or returns a placeholder.

## TDD Gate Compliance

RED → GREEN → (no refactor needed) all present in `git log`:

- **RED:** `0ae8d60 test(04-02): RED — the record has no store yet, and both files say so` (11 fail, 0 pass)
- **GREEN:** `623601e feat(04-02): MIGRATIONS[2] ...` then `8a4a079 feat(04-02): the five PersistStore methods — GREEN, 11/11`
- **REFACTOR:** none — no cleanup was warranted, so no empty `refactor` commit was manufactured.
- **Fail-fast honoured:** no case passed unexpectedly during RED. Every one of the 11 failed, and each failure was inspected for its *reason* (missing method / missing migration) rather than merely its colour.

## Commits

| Commit | Type | What |
|---|---|---|
| `0ae8d60` | `test` | Both test files, RED (11 fail / 0 pass) |
| `623601e` | `feat` | `MIGRATIONS[2]` — one migration, two tables, `user_version` 3 |
| `8a4a079` | `feat` | The five `PersistStore` methods — GREEN, 11/11 |
| `52273a0` | `fix` | Retire `db-fts`'s exact `user_version` pin (Deviation 1) |

`src/main/db.ts` +232 · `test/record-persist.test.cjs` +346 · `test/record-retention.test.cjs` +236 · `test/db-fts.test.cjs` +19/−5.

## Self-Check

- `src/main/db.ts` — FOUND (modified, +232)
- `test/record-persist.test.cjs` — FOUND (created)
- `test/record-retention.test.cjs` — FOUND (created)
- `test/db-fts.test.cjs` — FOUND (modified)
- `0ae8d60`, `623601e`, `8a4a079`, `52273a0` — all FOUND in `git log 8749a2b..HEAD`
- `MIGRATIONS[2]` present and unique: `awk '/^const MIGRATIONS: /,/^\];$/' src/main/db.ts | grep -v '^\s*//' | grep -c 'CREATE TABLE IF NOT EXISTS tool_calls'` → **1**
- No `throw` inside the new migration body: the only two hits in that range are the comment stating why there is none
- `EVENT_RETENTION_MS` loaded live through the electron stub → `2592000000` (30 days)
- `npm test` 854/847/**0 fail**/7 skipped · `npm run typecheck` 0 errors · `npm run lint` exit 0 · `package.json`/`package-lock.json` diff empty
- Working tree clean; `STATE.md` and `ROADMAP.md` NOT modified (orchestrator owns those)

## Self-Check: PASSED
