'use strict';

/**
 * SCALE-03 — the day band's arithmetic, tested where it can actually be tested.
 *
 * `src/main/index.ts` cannot be loaded by any test in this repo (its Electron
 * stub has no `app.on`), which three existing test files already say in prose.
 * Aggregation written inside an `ipcMain.handle` body is therefore exercised
 * only by greps that an empty stub also satisfies — a `return {}` passes
 * "the handler is registered" and "the word truncated appears in the file".
 *
 * So the bucket math, the detail cap, the zero-delta drop and the argument
 * validators live in `src/main/timeline.ts`, which imports NOTHING — no db.ts,
 * no hive.ts, no Electron — and this file calls those functions directly.
 * Everything asserted here is behaviour, not the presence of a symbol.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  summarizeDay, bucketDetail, parseDayParam, validateBucketIndex,
  BUCKET_MINUTES, BUCKETS_PER_DAY, BUCKET_DETAIL_ROW_CAP
} = loadTs('src/main/timeline.ts');

const DAY_MS = 24 * 60 * 60 * 1000;
const BUCKET_MS = 15 * 60 * 1000;
/** A local-midnight day start, built exactly the way parseDayParam builds one,
 *  so nothing here depends on the runner's timezone. */
const DAY_START = new Date(2026, 0, 15).getTime();

const ev = (ts, kind = 'spawn', body = {}) => ({ ts, kind, json: JSON.stringify({ kind, ...body }) });
const cost = (ts, usd, tokens, taskId = 't-1') => ({ ts, agentId: 'jim-1', taskId, usd, tokens });

// ── the constants are reasoned, and the day really is 96 buckets ─────────────

test('the day divides into exactly BUCKETS_PER_DAY buckets of BUCKET_MINUTES', () => {
  assert.equal(BUCKET_MINUTES, 15);
  assert.equal(BUCKETS_PER_DAY, 96);
  assert.equal(BUCKET_DETAIL_ROW_CAP, 200);
  assert.equal(BUCKETS_PER_DAY * BUCKET_MINUTES * 60 * 1000, DAY_MS,
    'the bucket size and the bucket count disagree about how long a day is');
});

// ── summarizeDay ────────────────────────────────────────────────────────────

test('summarizeDay returns 96 bucket summaries, never raw rows', () => {
  const events = [];
  // One event in every bucket, so a fencepost error at either end shows up as a
  // count rather than as a plausible-looking 95 or 97.
  for (let i = 0; i < BUCKETS_PER_DAY; i++) events.push(ev(DAY_START + i * BUCKET_MS + 1000));
  const res = summarizeDay(events, [], DAY_START, DAY_START);

  assert.equal(res.ok, true, 'the SUCCESS path must carry the ok discriminant too — a bare payload '
    + 'is what let a rejected day render as a quiet one');
  assert.equal(res.buckets.length, BUCKETS_PER_DAY);
  assert.deepEqual(res.buckets.map((b) => b.events), new Array(BUCKETS_PER_DAY).fill(1),
    'events did not land one per bucket — the index arithmetic is off');
  assert.deepEqual(res.buckets.map((b) => b.index), [...Array(BUCKETS_PER_DAY).keys()]);
  assert.equal(res.buckets[0].startMs, DAY_START);
  assert.equal(res.buckets[95].startMs, DAY_START + 95 * BUCKET_MS);
  // The whole point of a summary: the day's rows do not travel to the renderer.
  const shipped = JSON.stringify(res.buckets);
  assert.equal(shipped.includes('"json"'), false, 'a bucket carried a raw event body to the renderer');
  assert.equal(res.firstTs, DAY_START, 'firstTs is passed through, not recomputed from the rows');
});

test('summarizeDay counts envelopes as a FILTER of the event track, not a second source', () => {
  const b0 = DAY_START + 1000;
  const res = summarizeDay(
    [ev(b0, 'message'), ev(b0 + 1, 'message'), ev(b0 + 2, 'spawn'), ev(b0 + 3, 'drain')],
    [], DAY_START, DAY_START
  );
  assert.equal(res.buckets[0].events, 4, 'every event counts on the event track, envelopes included');
  assert.equal(res.buckets[0].envelopes, 2, "only kind === 'message' counts as an envelope");
});

test('summarizeDay ignores rows outside the day rather than folding them into an edge bucket', () => {
  const res = summarizeDay(
    [ev(DAY_START - 1), ev(DAY_START), ev(DAY_START + DAY_MS - 1), ev(DAY_START + DAY_MS)],
    [], DAY_START, DAY_START
  );
  const total = res.buckets.reduce((n, b) => n + b.events, 0);
  assert.equal(total, 2, 'the day is [dayStart, dayStart + 24h) — yesterday\'s last event and '
    + 'tomorrow\'s first must not be clamped into bucket 0 and bucket 95');
  assert.equal(res.buckets[0].events, 1);
  assert.equal(res.buckets[95].events, 1);
});

test('summarizeDay totals a bucket\'s cost from the deltas it is given, never a sum of snapshots', () => {
  const res = summarizeDay([], [cost(DAY_START + 1000, 1.5, 150), cost(DAY_START + 2000, 0.5, 50)],
    DAY_START, DAY_START);
  assert.equal(Number(res.buckets[0].usd.toFixed(2)), 2.00);
  assert.equal(res.buckets[0].tokens, 200);
  assert.equal(res.buckets[1].usd, 0, 'a bucket with no rows must read 0, not undefined');
});

// ── eventsAgedOut — the two stores have different lifetimes ─────────────────

test('eventsAgedOut is TRUE when the events table lost the day but the ledger still has its spend', () => {
  // The events table has been pruned past this day: its earliest surviving row
  // is a week LATER. cost-ledger.jsonl is never rotated, so the spend is there.
  const firstTs = DAY_START + 7 * DAY_MS;
  const res = summarizeDay([], [cost(DAY_START + 1000, 4.20, 420)], DAY_START, firstTs);
  assert.equal(res.ok, true);
  assert.equal(res.eventsAgedOut, true,
    'without this flag 03-07 prints "Nothing was recorded on {date}" directly above real cost bars '
    + '— the events table is pruned at EVENT_RETENTION_MS, the ledger never is');
});

test('eventsAgedOut is FALSE for the same firstTs when the day has no spend either', () => {
  const firstTs = DAY_START + 7 * DAY_MS;
  const res = summarizeDay([], [], DAY_START, firstTs);
  assert.equal(res.eventsAgedOut, false,
    'neither store has this day, so it is a genuine no-record day and the no-record sentence is '
    + 'the honest thing to print. Flagging it aged-out would suppress that.');
});

test('eventsAgedOut is FALSE when the events table can still speak to the day', () => {
  const res = summarizeDay([ev(DAY_START + 1000)], [cost(DAY_START + 1000, 1, 100)],
    DAY_START, DAY_START + 1000);
  assert.equal(res.eventsAgedOut, false,
    'firstTs falls INSIDE this day — the existing "No record before {HH:mm}" sentence already tells '
    + 'that truth and must not be outranked');
});

test('eventsAgedOut is FALSE when the only cost rows in the day are zero-delta', () => {
  const firstTs = DAY_START + 7 * DAY_MS;
  const res = summarizeDay([], [cost(DAY_START + 1000, 0, 0)], DAY_START, firstTs);
  assert.equal(res.eventsAgedOut, false,
    'an idle floor\'s zero-delta beat rows are never rendered, so they are not evidence that the '
    + 'ledger has spend this day the events table lost');
});

test('eventsAgedOut is TRUE on a fresh install whose events table is empty but whose ledger is deep', () => {
  const res = summarizeDay([], [cost(DAY_START + 1000, 2, 200)], DAY_START, null);
  assert.equal(res.eventsAgedOut, true, 'firstTs === null is the just-migrated install, and it has '
    + 'exactly the same mixed-record problem as an aged-out day');
});

// ── bucketDetail ────────────────────────────────────────────────────────────

test('bucketDetail returns one bucket\'s merged rows, sorted by ts', () => {
  const b3 = DAY_START + 3 * BUCKET_MS;
  const res = bucketDetail(
    [ev(b3 + 3000, 'spawn'), ev(b3 + 1000, 'message')],
    [cost(b3 + 2000, 1, 100)],
    3, DAY_START
  );
  assert.equal(res.ok, true, 'the success path must carry the ok discriminant');
  assert.deepEqual(res.rows.map((r) => r.ts), [b3 + 1000, b3 + 2000, b3 + 3000],
    'one merged list means one sort across BOTH sources — that is what "one timeline" is literal about');
  assert.deepEqual(res.rows.map((r) => r.type), ['event', 'cost', 'event']);
  assert.equal(res.truncated, false);
  assert.equal(res.total, 3);
});

test('bucketDetail ignores rows from neighbouring buckets', () => {
  const b3 = DAY_START + 3 * BUCKET_MS;
  const res = bucketDetail(
    [ev(b3 - 1), ev(b3), ev(b3 + BUCKET_MS - 1), ev(b3 + BUCKET_MS)],
    [], 3, DAY_START
  );
  assert.equal(res.total, 2, 'a bucket is [start, start + 15m) — the neighbours\' edge rows leaked in');
});

test('bucketDetail caps at BUCKET_DETAIL_ROW_CAP and reports the real total, never a silent slice', () => {
  const b0 = DAY_START;
  const events = [];
  for (let i = 0; i < 312; i++) events.push(ev(b0 + i));
  const res = bucketDetail(events, [], 0, DAY_START);
  assert.equal(res.rows.length, BUCKET_DETAIL_ROW_CAP, 'the response is not bounded');
  assert.equal(res.truncated, true);
  assert.equal(res.total, 312,
    'the UI prints "showing 200 of {total}" — a total that equals the cap is a silent slice wearing '
    + 'a truncated flag');
});

test('bucketDetail drops zero-delta cost rows BEFORE the cap, and totals only displayable rows', () => {
  const b0 = DAY_START;
  const rows = [];
  // An idle floor is roughly one cost sample per agent per ~30s beat: ~120 per
  // agent per 15-minute bucket. None of them is rendered.
  for (let i = 0; i < 150; i++) rows.push(cost(b0 + i, 0, 0));
  const events = [];
  for (let i = 0; i < 60; i++) events.push(ev(b0 + 200 + i));

  const res = bucketDetail(events, rows, 0, DAY_START);
  assert.equal(res.rows.length, 60,
    `bucketDetail returned ${res.rows.length} rows, truncated=${res.truncated}, total=${res.total}. `
    + 'With the drop applied AFTER the cap this reads 200 / true / 210: 150 rows the UI would never '
    + 'have drawn crowded out real events and inflated the count.');
  assert.equal(res.truncated, false, 'an idle floor made a 60-row bucket look truncated');
  assert.equal(res.total, 60, 'total must count DISPLAYABLE rows only');
  assert.equal(res.rows.every((r) => r.type === 'event'), true, 'a zero-delta cost row survived the drop');
});

test('bucketDetail keeps a cost row with a delta in EITHER field', () => {
  const b0 = DAY_START;
  const res = bucketDetail([], [cost(b0, 0, 5), cost(b0 + 1, 0.01, 0), cost(b0 + 2, 0, 0)], 0, DAY_START);
  assert.equal(res.total, 2,
    'the drop is usd === 0 AND tokens === 0. A row with tokens but no priced dollars is real spend, '
    + 'and so is a fractional dollar with no token movement.');
});

// ── the validators — every hostile shape a renderer could send ──────────────

test('parseDayParam accepts a YYYY-MM-DD local date and rejects everything else', () => {
  const now = new Date(2026, 0, 20).getTime();
  const ok = parseDayParam('2026-01-15', now);
  assert.equal(ok.ok, true);
  assert.equal(ok.dayStartMs, DAY_START, 'the day must resolve to LOCAL midnight — that is what a '
    + 'native <input type="date"> hands back, and a UTC read shifts the whole band by the offset');

  for (const bad of [undefined, null, 42, {}, [], '', 'yesterday', '2026-1-5', '2026-01-15T00:00',
    '2024-13-45', '2026-02-30', '99999-01-01', '2026-00-10', '2026-01-00']) {
    const res = parseDayParam(bad, now);
    assert.equal(res.ok, false, `parseDayParam accepted ${JSON.stringify(bad)}`);
    assert.ok(typeof res.error === 'string' && res.error.length > 0,
      'a rejection must carry a reason — 03-07 substitutes it into its error copy');
  }
});

test('parseDayParam rejects a day more than one day in the future', () => {
  const now = new Date(2026, 0, 20, 13, 0, 0).getTime();
  assert.equal(parseDayParam('2026-01-20', now).ok, true, 'today is not the future');
  assert.equal(parseDayParam('2026-01-21', now).ok, true, 'tomorrow is inside the one-day allowance');
  assert.equal(parseDayParam('2026-06-01', now).ok, false, 'a far-future day queries nothing and is a '
    + 'malformed request, not an empty one');
});

test('validateBucketIndex accepts only a real bucket index', () => {
  for (let i = 0; i < BUCKETS_PER_DAY; i++) {
    assert.equal(validateBucketIndex(i).ok, true, `bucket ${i} was rejected`);
  }
  assert.equal(validateBucketIndex(0).index, 0);
  for (const bad of [-1, 96, 1e9, NaN, Infinity, -Infinity, 1.5, '0', null, undefined, {}, []]) {
    const res = validateBucketIndex(bad);
    assert.equal(res.ok, false, `validateBucketIndex accepted ${String(bad)}`);
    assert.ok(typeof res.error === 'string' && res.error.length > 0);
  }
});

// ── ONE shape on every path ─────────────────────────────────────────────────

test('both pure entry points answer with the ok discriminant even when the day is empty', () => {
  const a = summarizeDay([], [], DAY_START, null);
  const b = bucketDetail([], [], 0, DAY_START);
  assert.equal(a.ok, true, 'summarizeDay returned a bare payload on the success path');
  assert.equal(b.ok, true, 'bucketDetail returned a bare payload on the success path');
  assert.equal(a.buckets.length, BUCKETS_PER_DAY, 'an empty day is still 96 buckets of zero');
  assert.deepEqual(b.rows, []);
  assert.equal(b.total, 0);
  assert.equal(b.truncated, false);
});

test('timeline.ts is import-free, which is what makes this whole file possible', () => {
  const src = require('node:fs')
    .readFileSync(require('node:path').join(__dirname, '..', 'src', 'main', 'timeline.ts'), 'utf8');
  assert.equal((src.match(/^import /gm) || []).length, 0,
    'timeline.ts grew an import. A db.ts or hive.ts import drags SQLite and the filesystem in; an '
    + 'electron one makes it as unloadable as index.ts, and every assertion above disappears.');
  assert.equal(/require\(/.test(src), false, 'timeline.ts grew a require');
});
