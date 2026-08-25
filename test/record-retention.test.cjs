'use strict';

/**
 * RECORD-02 — a day that has already happened is still fully readable, and the
 * bound that keeps the table finite deletes only what is past it.
 *
 * Why this file asserts the FIRST row and not a tail:
 *
 * 04-VALIDATION.md § Anti-Vacuous-Pass Rules — *"RECORD-02 — asserting a tail
 * returns rows is exactly what the 8 MiB rotate already does. Assert the FIRST
 * row of the day."* `hive.appendLog` rotates ONE generation at 8 MiB
 * (`hive.ts:2494-2504`), so a day that crosses 16 MiB has already lost its
 * morning to `log.jsonl.1` being overwritten by the afternoon. Any test that
 * reads the end of the day passes against exactly the behaviour the requirement
 * exists to replace. So the day below is built to exceed **16 MiB** — two full
 * rotate windows, the exact number the requirement names — and the assertion
 * that matters names the row inserted at `dayStart` by its own distinctive
 * payload, not by a count.
 *
 * The 16 MiB is COMPUTED in the test and asserted, rather than claimed in a
 * comment: a padding constant edited down to make the file quick would
 * otherwise leave every assertion below green over a day that never crossed the
 * threshold at all.
 *
 * Pure SQLite on a real file — no `skip:` option, no platform gate, so this
 * file runs on all three CI platforms and adds nothing to the skip census.
 * `db.ts:19` imports `app` from electron, so the module loads through
 * `test/load-ts.cjs`'s stub; `dbPath` is a real constructor parameter, so
 * `app.getPath` is never reached.
 */

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Database = require('better-sqlite3');
new Database(':memory:').close(); // throws here if the native module is unusable — intended

const loadTs = require('./load-ts.cjs');
const { PersistStore, EVENT_RETENTION_MS } = loadTs('src/main/db.ts');

// ── the synthetic day ────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_START = Date.UTC(2026, 0, 15, 0, 0, 0);
const DAY_END = DAY_START + DAY_MS;

/** Two full 8 MiB rotate windows. The requirement names 16 MiB; this is the
 *  number the day below is asserted against, not a comment about it. */
const ROTATE_WINDOW_BYTES = 8 * 1024 * 1024;
const DAY_FLOOR_BYTES = 2 * ROTATE_WINDOW_BYTES;

/** Few rows, fat payloads: 17 × ~1 MiB clears 16 MiB while keeping the insert
 *  count small enough that the whole file runs in about a second. */
const ROW_COUNT = 17;
const PAD_BYTES = 1024 * 1024;

/** The marker on the row at `dayStart`. Asserted by CONTENT, because a count
 *  and an `ORDER BY ts` both look identical when the morning is missing. */
const FIRST_MARKER = 'floor-opened-at-day-start-0001';
const LAST_MARKER = 'floor-closed-at-day-end-0017';

const made = [];
const stores = [];

function tempDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-retain-')));
  made.push(dir);
  return dir;
}

after(() => {
  for (const store of stores) { try { store.close(); } catch { /* best-effort */ } }
  for (const dir of made) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

let shared = null;

/** One store carrying the whole 16 MiB day, built once. Both cases below read
 *  the SAME day, because "retention left the day whole" is only meaningful
 *  against the day the first case proved readable. */
function dayStore() {
  if (shared) return shared;

  const store = new PersistStore(path.join(tempDir(), 'harness.db'));
  store.open();
  stores.push(store);

  let bytes = 0;
  for (let i = 0; i < ROW_COUNT; i++) {
    const marker = i === 0 ? FIRST_MARKER : i === ROW_COUNT - 1 ? LAST_MARKER : `mid-${i}`;
    // Spread across the day; the last row still lands strictly before DAY_END.
    const ts = DAY_START + Math.floor((i * (DAY_MS - 1)) / (ROW_COUNT - 1));
    const json = JSON.stringify({ ts, kind: 'hive_event', marker, pad: 'x'.repeat(PAD_BYTES) });
    bytes += Buffer.byteLength(json, 'utf8');
    store.appendEvent('hive_event', json, ts);
  }

  shared = { store, bytes };
  return shared;
}

// ── a day past 16 MiB reads back whole, morning included ─────────────────────

test('a day whose events exceed 16 MiB reads back whole, first row included', () => {
  const { store, bytes } = dayStore();

  assert.ok(
    bytes > DAY_FLOOR_BYTES,
    `the synthetic day is only ${bytes} bytes, under the ${DAY_FLOOR_BYTES} this case exists to `
    + 'cross. Everything below would then pass over a day that the 8 MiB rotate could have '
    + 'carried intact — which is the behaviour RECORD-02 replaces, not the behaviour it asserts.'
  );

  const rows = store.eventsBetween(DAY_START, DAY_END);

  assert.equal(
    rows.length,
    ROW_COUNT,
    `${rows.length} of ${ROW_COUNT} events came back for the day. A day that crosses two rotate `
    + 'windows must still be one range scan.'
  );

  // THE assertion. Named by content, at index 0.
  assert.ok(
    rows[0] && rows[0].json.includes(FIRST_MARKER),
    `the first row of the day is ${rows[0] ? JSON.stringify(rows[0].json.slice(0, 120)) : 'missing'} `
    + `— it does not carry ${FIRST_MARKER}. This is the exact failure the one-generation JSONL `
    + 'rotate produces: the afternoon is all there, the count looks plausible, and the morning '
    + 'the operator actually wants to read has been overwritten.'
  );
  assert.equal(rows[0].ts, DAY_START, 'the first row is not the one inserted at dayStart');
  assert.ok(
    rows[rows.length - 1].json.includes(LAST_MARKER),
    'the last row of the day is not the one written last — the range is returning a window, not the day'
  );

  // Ascending, strictly.
  for (let i = 1; i < rows.length; i++) {
    assert.ok(
      rows[i].ts >= rows[i - 1].ts,
      `row ${i} (ts=${rows[i].ts}) precedes row ${i - 1} (ts=${rows[i - 1].ts}); a replay that `
      + 'reads events out of order reconstructs a floor that never happened'
    );
  }

  assert.equal(rows[0].kind, 'hive_event', 'the kind column is not round-tripping');
});

test('the range is inclusive of dayStart and exclusive of dayEnd', () => {
  const { store } = dayStore();

  store.appendEvent('hive_event', JSON.stringify({ marker: 'yesterday' }), DAY_START - 1);
  store.appendEvent('hive_event', JSON.stringify({ marker: 'tomorrow' }), DAY_END);

  const rows = store.eventsBetween(DAY_START, DAY_END);
  assert.equal(
    rows.length,
    ROW_COUNT,
    `the day picked up ${rows.length - ROW_COUNT} row(s) from outside it. Two adjacent days that `
    + 'both claim the midnight event double-count every boundary event in a replay.'
  );
  const blob = rows.map((r) => r.json).join('');
  assert.ok(!blob.includes('yesterday'), 'a row at dayStart - 1 was returned: the lower bound is not >=');
  assert.ok(!blob.includes('tomorrow'), 'a row at dayEnd was returned: the upper bound is not exclusive');

  // Positive control for the two negatives: they ARE in the table.
  assert.equal(
    store.eventsBetween(DAY_START - 1, DAY_END + 1).length,
    ROW_COUNT + 2,
    'the two boundary rows are not stored at all, so the negatives above passed vacuously'
  );
});

// ── retention: a bound, not a rotate ─────────────────────────────────────────

test('pruneEvents deletes only strictly-older rows and leaves the day whole', () => {
  const { store } = dayStore();

  // Ten days before the day under test, so a correct prune cannot reach it.
  const bound = DAY_START - 10 * DAY_MS;
  store.appendEvent('hive_event', JSON.stringify({ marker: 'before-bound' }), bound - 1);
  store.appendEvent('hive_event', JSON.stringify({ marker: 'at-bound' }), bound);
  store.appendEvent('hive_event', JSON.stringify({ marker: 'after-bound' }), bound + 1);

  assert.equal(
    store.eventsBetween(bound - 1, bound + 2).length,
    3,
    'positive control: all three boundary rows must be present before the prune runs'
  );

  const deleted = store.pruneEvents(bound);
  assert.equal(
    deleted,
    1,
    `pruneEvents(bound) deleted ${deleted} rows, not 1. At 0 the table is unbounded; at 2 or `
    + 'more the bound is `<=` rather than `<` and the retention window silently loses its own '
    + 'edge day every time it runs.'
  );

  assert.deepEqual(
    store.eventsBetween(bound - 1, bound + 2).map((r) => JSON.parse(r.json).marker),
    ['at-bound', 'after-bound'],
    'the wrong rows survived the prune'
  );

  // The day under test is 10 days newer than the bound and must be untouched.
  const day = store.eventsBetween(DAY_START, DAY_END);
  assert.equal(
    day.length,
    ROW_COUNT,
    `the prune took ${ROW_COUNT - day.length} row(s) out of a day 10 days newer than its bound. `
    + 'Retention that reaches past its own bound is worse than no retention: it deletes the '
    + 'record the operator came to read.'
  );
  assert.ok(
    day[0].json.includes(FIRST_MARKER),
    'the day survived the prune by count but lost its first row — the same morning-shaped hole, '
    + 'arriving through retention instead of through rotation'
  );
});

// ── the mirror: the REAL appendLog, not appendEvent ─────────────────────────
//
// Everything above drives `appendEvent` directly, which proves the table can
// hold a day but not that the floor's events reach it. 04-VALIDATION.md's
// anti-vacuous rule bites hardest here: the whole requirement is about the
// path from `hive.appendLog` to a readable day, so these two cases drive the
// real method and let the 8 MiB rotate happen for real underneath.

const { HiveManager } = loadTs('src/main/hive.ts');

/** A live hive in a throwaway home. */
function hiveFloor() {
  const home = tempDir();
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  return { hive, home, root: path.join(home, 'hive') };
}

test('a >16 MiB day written through the REAL appendLog reads back from its FIRST row', () => {
  const { hive, root } = hiveFloor();
  const store = new PersistStore(path.join(tempDir(), 'harness.db'));
  store.open();
  stores.push(store);
  hive.setEventStore(store);

  // "Today", because appendLog stamps rows with the real Date.now() and this
  // case exists to drive the real method. Straddling UTC midnight mid-run would
  // split the day across two ranges, so it is asserted rather than assumed.
  const dayStart = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const dayEnd = dayStart + DAY_MS;

  let bytes = 0;
  for (let i = 0; i < ROW_COUNT; i++) {
    const marker = i === 0 ? FIRST_MARKER : i === ROW_COUNT - 1 ? LAST_MARKER : `mid-${i}`;
    const event = { kind: 'hive_event', marker, pad: 'x'.repeat(PAD_BYTES) };
    bytes += Buffer.byteLength(JSON.stringify(event), 'utf8');
    hive.appendLog(event);
  }
  assert.ok(Date.now() < dayEnd, 'the run crossed UTC midnight — re-run; this is a clock straddle, '
    + 'not a defect in the mirror');
  assert.ok(bytes > DAY_FLOOR_BYTES,
    `the day is only ${bytes} bytes, under the ${DAY_FLOOR_BYTES} that makes this case mean anything`);

  // The half that shows WHY the mirror exists: the JSONL has already lost the
  // morning. One rotate generation over ~17 MiB means rows 1-8 were written to
  // log.jsonl, renamed to log.jsonl.1, and then overwritten by rows 9-16.
  const jsonl = fs.readFileSync(path.join(root, 'log.jsonl'), 'utf8');
  const rotated = fs.existsSync(path.join(root, 'log.jsonl.1'))
    ? fs.readFileSync(path.join(root, 'log.jsonl.1'), 'utf8') : '';
  assert.ok(rotated.length > 0, 'positive control: the log must actually have rotated, or the '
    + 'negative below passes over a day the JSONL could have carried intact');
  assert.ok(!jsonl.includes(FIRST_MARKER) && !rotated.includes(FIRST_MARKER),
    'the JSONL still holds the morning, so this day never crossed two rotate windows and the '
    + 'assertion below is not the one RECORD-02 needs');

  // THE assertion: SQLite still has it, at index 0, named by content.
  const rows = store.eventsBetween(dayStart, dayEnd);
  assert.equal(rows.length, ROW_COUNT,
    `${rows.length} of ${ROW_COUNT} events reached the mirror. Every appendLog call must write a row.`);
  assert.ok(rows[0].json.includes(FIRST_MARKER),
    `the first row of the day is ${JSON.stringify(rows[0].json.slice(0, 120))} — not the one `
    + 'appendLog wrote first. The JSONL above has already lost this row to the rotate; if the '
    + 'mirror has lost it too then RECORD-02 has replaced nothing.');
  assert.equal(rows[0].kind, 'hive_event', 'appendLog\'s own `kind` field is not reaching the column');
  assert.ok(rows[rows.length - 1].json.includes(LAST_MARKER), 'the day is a window, not the day');
});

test('a failing event store costs the mirror and never the JSONL line', () => {
  const { hive, root } = hiveFloor();
  const logPath = path.join(root, 'log.jsonl');

  // 1. A REAL store that has been closed — the realistic failure (shutdown
  //    ordering, a reset mid-flight). appendEvent no-ops rather than throwing.
  const closed = new PersistStore(path.join(tempDir(), 'harness.db'));
  closed.open();
  closed.close();
  hive.setEventStore(closed);
  assert.doesNotThrow(() => hive.appendLog({ kind: 'hive_event', marker: 'after-close' }));
  assert.ok(fs.readFileSync(logPath, 'utf8').includes('after-close'),
    'the JSONL line went missing when the store was closed. The event log\'s crash-safety must '
    + 'not become contingent on the database being open — that is a regression dressed as an '
    + 'improvement.');

  // 2. A store that THROWS, which is what a locked or corrupt db does. The
  //    no-op above cannot prove the swallow; only this can.
  let called = 0;
  hive.setEventStore({
    appendEvent() { called++; throw new Error('database is locked'); }
  });
  assert.doesNotThrow(() => hive.appendLog({ kind: 'hive_event', marker: 'after-throw' }));
  assert.equal(called, 1, 'the mirror was never called, so the swallow above proved nothing');
  assert.ok(fs.readFileSync(logPath, 'utf8').includes('after-throw'),
    'a throwing store took the JSONL line down with it');

  // 3. No store at all — the pre-onboarding and headless-test shape.
  hive.setEventStore(null);
  assert.doesNotThrow(() => hive.appendLog({ kind: 'hive_event', marker: 'no-store' }));
  assert.ok(fs.readFileSync(logPath, 'utf8').includes('no-store'));
});

test('hive.ts reaches the store through injection, never a db.ts import', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'hive.ts'), 'utf8');
  assert.equal((src.match(/from '\.\/db'|require\('\.\/db'\)/g) || []).length, 0,
    'hive.ts imports db.ts. The store is injected at floor/boot.ts\'s composition root so hive.ts '
    + 'stays loadable — and testable — without a database at all.');
  // The paired positive: the seam it uses instead actually exists.
  assert.match(src, /setEventStore\(/, 'the injection seam is gone');
});

test('the shipped retention window is a stated number, not an implicit one', () => {
  assert.equal(
    EVENT_RETENTION_MS,
    30 * DAY_MS,
    'the default retention window moved. D-18 requires the shipped number to be STATED: too '
    + 'short and SCALE-03\'s replay loses days Phase 3 wanted, too long and the table is '
    + 'unbounded again. Change it deliberately, here and in db.ts, or not at all.'
  );
});
