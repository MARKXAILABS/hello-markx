/**
 * timeline.ts — SCALE-03's day-band aggregation, as a PURE module.
 *
 * Zero imports, deliberately: no `./db`, no `./hive`, no Electron. That is the
 * whole reason this file exists rather than the same code living inside
 * `index.ts`'s IPC handlers. `index.ts` cannot be loaded by any test in this
 * repo — its Electron stub has no `app.on` — so aggregation written in a
 * handler body is only ever checked by greps, and a `return {}` stub satisfies
 * every one of them. Here, `test/timeline.test.cjs` calls these functions and
 * asserts what they actually compute.
 *
 * The division of labour is strict. `index.ts` fetches rows (from `persist` and
 * `hive`) and hands them here; this file does all the arithmetic, all the
 * bounding and all the argument validation, and builds the response envelope
 * itself. The handlers add nothing to the payload.
 *
 * ── ONE SHAPE, ON EVERY PATH ────────────────────────────────────────────────
 * Both channels answer `{ok: true, ...}` or `{ok: false, error}` — success,
 * rejected argument, and store-unavailable alike. There is deliberately NO
 * zeroed-success path: a zeroed success is indistinguishable from a genuinely
 * empty day, so a consumer with no error branch renders a REJECTED day as a
 * quiet one. The `ok` literal is built here, not in the handler, so the test
 * above can assert the discriminant against something it can actually load.
 */

/** Bucket width. 15 minutes divides a day into 96 columns — a fixed, tiny DOM
 *  that needs no windowing library (there is none in the lockfile), while still
 *  being fine enough that a card's worth of work is more than one column.
 *  [ASSUMED] — reasoned from the shape of the surface, not measured against a
 *  real operator's reading habits. */
export const BUCKET_MINUTES = 15;

/** 96. Derived, never typed twice: the day and the bucket width must not be
 *  able to disagree. */
export const BUCKETS_PER_DAY = (24 * 60) / BUCKET_MINUTES;

/** How many detail rows one bucket may ship. 200 is well past what fits on a
 *  screen and far short of what a busy 15 minutes can hold, so the truncation
 *  path is a real path rather than a theoretical one. [ASSUMED] — a reasoned
 *  default. When it bites, the response says so instead of slicing quietly. */
export const BUCKET_DETAIL_ROW_CAP = 200;

const DAY_MS = 24 * 60 * 60 * 1000;
const BUCKET_MS = BUCKET_MINUTES * 60 * 1000;

/** One mirrored hive event, as `PersistStore.eventsBetween` returns it. */
export interface TimelineEvent {
  ts: number;
  kind: string;
  json?: string;
}

/** One cost DELTA, as `HiveManager.dailyCostRows` returns it. Already diffed —
 *  this file must never see a cumulative snapshot, and never sums one (D-22). */
export interface TimelineCostRow {
  ts: number;
  agentId?: string | null;
  taskId?: string | null;
  usd: number;
  tokens: number;
}

/** One column of the band. Counts and totals only — never the rows behind them,
 *  which is what keeps a whole day off the IPC boundary. */
export interface BucketSummary {
  index: number;
  startMs: number;
  events: number;
  /** `kind === 'message'` events. A FILTER of the event track above, not a
   *  second source (D-26) — every envelope is also counted in `events`. */
  envelopes: number;
  usd: number;
  tokens: number;
}

/** One row of the merged detail list for a single bucket. */
export type DetailRow =
  | { type: 'event'; ts: number; kind: string; json: string }
  | { type: 'cost'; ts: number; agentId: string | null; taskId: string | null; usd: number; tokens: number };

export type TimelineResult =
  | { ok: true; buckets: BucketSummary[]; firstTs: number | null; eventsAgedOut: boolean }
  | { ok: false; error: string };

export type BucketDetailResult =
  | { ok: true; rows: DetailRow[]; truncated: boolean; total: number }
  | { ok: false; error: string };

/** A cost row is DISPLAYABLE when it moved something. An idle floor writes
 *  roughly one cumulative snapshot per agent per ~30 s breaker beat, and the
 *  diff between two identical snapshots is zero — ~120 rows per agent per
 *  bucket that the UI never draws. They are dropped, not counted. */
function displayable(row: TimelineCostRow): boolean {
  return row.usd !== 0 || row.tokens !== 0;
}

function inDay(ts: number, dayStartMs: number): boolean {
  return ts >= dayStartMs && ts < dayStartMs + DAY_MS;
}

/**
 * A day's 96 bucket summaries.
 *
 * PURE — no I/O, no clock. `firstTs` is supplied by the caller from
 * `PersistStore.earliestEventTs()` and passed through unchanged; this function
 * deliberately does not derive it from `events`, because `events` is one day's
 * worth and the question `firstTs` answers ("how far back can the store speak
 * at all?") is about the whole table.
 */
export function summarizeDay(
  events: TimelineEvent[],
  costRows: TimelineCostRow[],
  dayStartMs: number,
  firstTs: number | null
): TimelineResult {
  const buckets: BucketSummary[] = [];
  for (let i = 0; i < BUCKETS_PER_DAY; i++) {
    buckets.push({ index: i, startMs: dayStartMs + i * BUCKET_MS, events: 0, envelopes: 0, usd: 0, tokens: 0 });
  }

  for (const e of events) {
    if (!Number.isFinite(e.ts) || !inDay(e.ts, dayStartMs)) continue;
    // No clamp: a row outside the day is DROPPED above rather than pushed into
    // bucket 0 or 95, so yesterday's last event never shows up as a spike at
    // this day's edge.
    const b = buckets[Math.floor((e.ts - dayStartMs) / BUCKET_MS)];
    b.events += 1;
    if (e.kind === 'message') b.envelopes += 1;
  }

  let spendInDay = false;
  for (const c of costRows) {
    if (!Number.isFinite(c.ts) || !inDay(c.ts, dayStartMs)) continue;
    if (displayable(c)) spendInDay = true;
    const b = buckets[Math.floor((c.ts - dayStartMs) / BUCKET_MS)];
    b.usd += c.usd;
    b.tokens += c.tokens;
  }

  // The two stores behind this channel have DIFFERENT lifetimes: `events` is
  // pruned at EVENT_RETENTION_MS, `cost-ledger.jsonl` is never rotated. So a
  // day can have real spend and zero events — an aged-out day, or equally a
  // just-migrated install whose ledger is months deeper than its events table.
  // Without this flag 03-07 prints "Nothing was recorded on {date}" directly
  // above the cost bars it is drawing from the same response. The record's
  // start covers BOTH stores or neither.
  const eventsBlind = firstTs === null || firstTs >= dayStartMs + DAY_MS;
  return { ok: true, buckets, firstTs, eventsAgedOut: eventsBlind && spendInDay };
}

/**
 * One bucket's merged detail rows.
 *
 * PURE. Order of operations is load-bearing and is asserted in the test file:
 * DROP the zero-delta cost rows, THEN merge, THEN sort, THEN cap. Dropping
 * after the cap lets 150 rows the UI would never draw evict 60 real events from
 * a 200-row window and report a truncation count of rows nobody could have
 * seen.
 */
export function bucketDetail(
  events: TimelineEvent[],
  costRows: TimelineCostRow[],
  bucketIndex: number,
  dayStartMs: number
): BucketDetailResult {
  const from = dayStartMs + bucketIndex * BUCKET_MS;
  const to = from + BUCKET_MS;
  const within = (ts: number): boolean => Number.isFinite(ts) && ts >= from && ts < to;

  const rows: DetailRow[] = [];
  for (const e of events) {
    if (within(e.ts)) rows.push({ type: 'event', ts: e.ts, kind: e.kind, json: e.json ?? '' });
  }
  for (const c of costRows) {
    // The drop, FIRST — before this row can occupy a slot under the cap.
    if (!displayable(c) || !within(c.ts)) continue;
    rows.push({
      type: 'cost', ts: c.ts, agentId: c.agentId ?? null, taskId: c.taskId ?? null,
      usd: c.usd, tokens: c.tokens
    });
  }
  // One list, one sort, across both sources — that is what makes "one timeline"
  // literal rather than two lists side by side.
  rows.sort((a, b) => a.ts - b.ts);

  const total = rows.length;
  return {
    ok: true,
    rows: total > BUCKET_DETAIL_ROW_CAP ? rows.slice(0, BUCKET_DETAIL_ROW_CAP) : rows,
    truncated: total > BUCKET_DETAIL_ROW_CAP,
    total
  };
}

/**
 * Validate the renderer-supplied `day` and resolve it to LOCAL midnight.
 *
 * `day` is always a `'YYYY-MM-DD'` local-date string — exactly what a native
 * `<input type="date">` produces. Never an epoch range: a range from the
 * renderer is an unbounded query waiting to happen, and this is the one
 * parameter a hostile or simply broken caller controls.
 *
 * The round-trip check is what rejects `'2024-13-45'` and `'2026-02-30'`: the
 * Date constructor rolls those over into a real, wrong day rather than failing,
 * so comparing the parts back out is the only honest test.
 */
export function parseDayParam(raw: unknown, now: number = Date.now()):
  { ok: true; dayStartMs: number } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'day must be a YYYY-MM-DD string' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return { ok: false, error: `day must be YYYY-MM-DD, got ${JSON.stringify(raw)}` };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return { ok: false, error: `${raw} is not a real calendar date` };
  }
  const dayStartMs = dt.getTime();
  if (!Number.isFinite(dayStartMs)) return { ok: false, error: `${raw} is not a usable date` };
  // One day of slack, not zero: the renderer's clock and this process's clock
  // can straddle midnight, and "today" must never be refused. Anything further
  // out has no rows by construction and is a malformed request, not an empty
  // day — the distinction 03-07 needs to print the right sentence.
  if (dayStartMs > now + DAY_MS) return { ok: false, error: `${raw} is in the future` };
  return { ok: true, dayStartMs };
}

/** Validate the renderer-supplied bucket index. Integer, in range, or refused —
 *  this value indexes an array and offsets a query window, so `-1`, `96`,
 *  `1e9`, `NaN` and `'0'` all have to die here rather than downstream. */
export function validateBucketIndex(raw: unknown):
  { ok: true; index: number } | { ok: false; error: string } {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw >= BUCKETS_PER_DAY) {
    return { ok: false, error: `bucketIndex must be an integer in [0, ${BUCKETS_PER_DAY}), got ${String(raw)}` };
  }
  return { ok: true, index: raw };
}
