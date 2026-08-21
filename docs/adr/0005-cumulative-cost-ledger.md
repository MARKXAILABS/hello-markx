# ADR-0005 — The cost ledger holds cumulative snapshots

**Status:** Accepted · **Recorded:** 2026-08-21 (extracted from the `AgentUsageSample`
contract comment in `src/main/telemetry.ts` and the reserved `cost_ledger` schema note in
`src/main/db.ts`)

## Context

Spend is accounted in one place: `<hiveRoot>/cost-ledger.jsonl`, appended by
`HiveManager.appendCostLedger()` and read back by `HiveManager.taskSpend()`. Its row shape is
deliberately snake_case and 1:1 with the `cost_ledger` SQLite table reserved in `db.ts`'s
migration list, so the eventual move to SQLite is a mechanical `INSERT…SELECT` rather than a
translation layer.

The rows come from `AgentUsageSample`, and that type's contract is one sentence long and easy
to miss: it is a **cumulative** cost/token snapshot for one agent, not a delta. Claude Code
pushes OpenTelemetry counters, and OTel counters are monotonic — each export restates the
running total for the session. So two consecutive rows for the same `session_id` do not
describe two pieces of work; the second one *contains* the first.

Everything downstream depends on knowing which of those two things a row is, and nothing in
the file itself says. A JSON line with `input: 12000` is indistinguishable whether it means
"12,000 tokens so far this session" or "12,000 tokens on this response".

## Decision

**A row in `cost-ledger.jsonl` is a cumulative snapshot for one `(agent_id, session_id)` at
one instant.** It is not a delta and must never be treated as one.

Consequences that follow mechanically:

- **Velocity, and any "what did this cost" figure, is a DIFFERENCE between consecutive rows**
  of the same `(agent_id, session_id)` — never a sum over rows. Summing cumulative snapshots
  over-counts roughly quadratically: N snapshots of a session that ends at T tokens sum to
  about `N·T/2`, not `T`.
- **The last row of a session is that session's total.** Aggregating a whole agent means
  summing the last row per `session_id`, not summing rows.
- **`session_id` is part of the key, not decoration.** It is what makes "consecutive" mean
  anything, and it is the dedup key that fixed the cwd double-count.
- **The eventual SQLite table indexes `(agent_id, session_id, ts)`** for exactly this reason:
  the diff is an ordered walk within a session.

## Why this is written down rather than left as a comment

Because the contract has already been violated, in both directions, and the requirements
backlog carries the bill.

**A second appender writes deltas into the same file.** `HookServer` handles the `CostSample`
event the qwen proxy-bridge sidecar emits on every response with usage, and appends it through
the same `appendCostLedger()` — but its `input`/`output` come off *one response's* usage
block, so those rows are **per-response deltas**. The Claude/OTel path
(`src/main/index.ts:1524`) appends genuine cumulative snapshots on the ~30s beat. One file now
interleaves both, with nothing in the row saying which is which, and the reader cannot tell
them apart.

**The reader sums them anyway.** `HiveManager.taskSpend()` accumulates
`tokens += (row.input ?? 0) + (row.output ?? 0)` across every matching row. On the cumulative
rows that is the quadratic over-count above; on the delta rows it is correct. The same
function is right and wrong on the same file depending on which engine produced the line.

That is **RECORD-04**: *"A card's spend is not double-counted — cost is derived from the
difference between cumulative usage snapshots, not their sum."* And it rides with
**RECORD-03**, because `taskSpend()` also reads only the ledger's last `COST_TAIL_BYTES`
(1 MB), so a long card's early spend falls out of the window and `over` reads false when it is
true. Both are marked prerequisites of FLOOR-10 for the same reason: **enforcing a spend cap
against a truncated, quadratically over-counted number is worse than having no cap at all**,
because it produces a confident wrong answer instead of an obvious missing one.

Neither is a bug in this decision. Both are what happens when a load-bearing contract lives
only in a doc comment on a type, three files away from the code that has to honour it.

## Consequences

- Any new writer to `cost-ledger.jsonl` must either append cumulative snapshots, or the row
  must carry a field saying it does not. Adding a delta appender silently — which is what
  happened — makes every reader wrong for a subset of rows.
- The fix for RECORD-04 is a diff-based read, and it needs the row semantics to be *decidable*
  per row. That is the design constraint this record exists to make visible before someone
  writes the third appender.
- PII stays out by construction: only the allowlisted `AgentUsageSample` fields are persisted,
  never a raw OTel record. The SQLite table inherits that guarantee.
- This is a convention, not an enforced one. Nothing fails today when a caller sums the rows —
  `taskSpend()` does, and it is green.

## Where it lives

- `src/main/telemetry.ts` — the `AgentUsageSample` interface and the locked cross-lane
  contract comment above it. The word "cumulative" in that comment is the whole contract.
- `src/main/db.ts` — the reserved `cost_ledger` schema in the `MIGRATIONS` header, which
  restates the row semantics and the `(agent_id, session_id, ts)` index.
- `src/main/hive.ts` — `HiveManager.appendCostLedger()` (the writer), `taskSpend()` and
  `COST_TAIL_BYTES` (the reader and its window).
- `src/main/hooks.ts` — the `CostSample` branch, the second appender.
