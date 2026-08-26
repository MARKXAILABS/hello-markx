'use strict';

/**
 * FLOOR-07 — the SQLite FTS5 keyword index the docs have promised since
 * `docs/design/knowledge-graph.md:45`, exercised against a REAL SQLite handle.
 *
 * Why this file exists at all, and why it is not part of another suite:
 *
 * `test/config-secrets.test.cjs` injects a stand-in SQLite driver into
 * `require.cache` whose `pragma()` implements the migration rail while its
 * `exec()` does nothing. Run `PersistStore.open()` against that and the
 * migration loop executes, `user_version` climbs to 2, and NOT ONE BYTE of DDL
 * is executed — an FTS5 test written against it passes with an empty database
 * and would have reported this index as shipped when it did not exist.
 * `node --test` runs each file in its own child process, so this file simply
 * does not inject, and the driver below is the real one.
 *
 * The first assertion in the first test therefore reads the schema back through
 * a SECOND, independent handle opened on the file on disk. A driver that stores
 * a version number and swallows the DDL cannot satisfy that.
 *
 * ── Fail LOUD, never quietly bypass ──────────────────────────────────────────
 * `node --test` exits 0 for a file whose every test was bypassed, so bypassing
 * this one when the native module will not load makes "FTS5 was never
 * exercised" and "FTS5 works" produce byte-identical gate output. That is
 * strictly worse than having no test, because it reports green. There is no
 * bypass of any kind in this file — no per-test option, no guarded require, no
 * early return. The load below is at module top level and outside every guard,
 * so a missing or wrong-ABI binary is the runner's own error and a non-zero
 * exit.
 *
 * Where it runs: better-sqlite3 is 13.x, which is N-API and ships eight
 * prebuilt binaries inside the tarball. The CI `test` jobs install with
 * `npm ci --ignore-scripts`, so the prebuild is exactly what loads and no
 * rebuild step is needed anywhere. If this throws, the prebuild is missing for
 * this platform — fix that. Do not add `npm rebuild better-sqlite3`: it
 * discards the prebuild and synthesises a node-gyp compile that needs Python on
 * the macOS and Windows runners.
 */

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Database = require('better-sqlite3');
new Database(':memory:').close(); // throws here if the native module is unusable — intended

// ── real temp dirs, self-cleaning ────────────────────────────────────────────

const made = [];

/** A real directory, `realpathSync`-resolved: on macOS `os.tmpdir()` is the
 *  symlink `/var/...` and SQLite reports the resolved `/private/var/...` path
 *  back, so an unresolved path makes equality assertions fail for a reason that
 *  has nothing to do with the code under test. */
function tempDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-fts-')));
  made.push(dir);
  return dir;
}

after(() => {
  for (const dir of made) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

/** electron's `app.getPath('userData')` is the only electron surface db.ts
 *  touches, and SCALE-01 demoted it to the LAST resort behind an injected
 *  harnessHome getter. Asserting on that fallback needs a real, writable
 *  directory: load-ts's stub returns a path it never creates, so an open() there
 *  fails as SQLITE_CANTOPEN for a reason that has nothing to do with the code
 *  under test. Reassignable, so a test that cares takes a FRESH one and its
 *  existsSync assertion cannot be pre-satisfied by an earlier test in this file.
 *
 *  This injects electron ONLY. better-sqlite3 above stays the real driver — that
 *  is this file's whole reason to exist and nothing here weakens it. */
let userData = tempDir();
const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId, filename: electronId, loaded: true,
  exports: { app: { getPath: () => userData } }
};

const loadTs = require('./load-ts.cjs');
const { PersistStore, EVENT_RETENTION_MS } = loadTs('src/main/db.ts');

/** An opened store on its own throwaway file. `dbPath` is a real constructor
 *  parameter ("Override the DB location (tests)"), so no `app.getPath` fake is
 *  needed for any of this. */
function openStore(dbPath = path.join(tempDir(), 'harness.db')) {
  const store = new PersistStore(dbPath);
  store.open();
  return store;
}

// ── the migration ────────────────────────────────────────────────────────────

test('open() creates memory_fts as a real FTS5 table, at or past user_version 2', () => {
  const dbPath = path.join(tempDir(), 'harness.db');
  const store = openStore(dbPath);
  store.close(); // checkpoints the WAL, so the schema is readable from the file

  const raw = new Database(dbPath, { readonly: true });
  try {
    const row = raw
      .prepare("SELECT name, sql FROM sqlite_master WHERE name = 'memory_fts'")
      .get();

    assert.ok(
      row,
      'memory_fts is not in sqlite_master after PersistStore.open(). The migration rail ran '
      + '(user_version is asserted below) but executed no DDL, which is exactly the failure a '
      + 'stand-in driver with a no-op exec() would hide: recall would silently return nothing '
      + 'forever while every version number looked correct.'
    );
    assert.match(
      row.sql,
      /USING\s+fts5/i,
      `memory_fts exists but is not an FTS5 virtual table (${row.sql}). A plain table accepts `
      + 'the INSERTs and then makes every MATCH a syntax error at recall time, on the user\'s '
      + 'machine, long after this suite went green.'
    );
    assert.match(
      row.sql,
      /agent_id\s+UNINDEXED/i,
      'agent_id is no longer UNINDEXED. Indexed, it joins the searchable text, so a query term '
      + "that happens to equal an agent id matches that agent's rows — the cross-agent leak the "
      + 'WHERE predicate exists to close, reopened through the index instead.'
    );
    // AT LEAST 2, not exactly 2. Migration index 1 is what takes the DB from 1
    // to 2, so this still catches the failure the clause was written for — the
    // entry not appended, or a shipped one edited, either of which means every
    // install that already ran it never gets this schema.
    //
    // The exact pin was retired when RECORD-01/02 appended index 2
    // (user_version 3). It could not survive: db.ts's own header declares the
    // rail APPEND-ONLY and reserves further migrations by name, so an equality
    // here makes the FTS5 file go red for every future schema addition — a
    // failure with nothing to do with FTS5, in the one file whose whole purpose
    // is proving the index is real. What actually guards the FTS5 half is the
    // three sqlite_master assertions above (the table exists, it is fts5,
    // agent_id is UNINDEXED) plus repo-claims' MIGRATIONS entry-count claim;
    // none of them is weakened by this line.
    const version = raw.pragma('user_version', { simple: true });
    assert.ok(
      version >= 2,
      `user_version is ${version}, below the 2 that migration index 1 produces. Either the entry `
      + 'was not appended or an existing one was edited — and editing a shipped migration means '
      + 'installs that already ran it never get this schema at all.'
    );
  } finally {
    raw.close();
  }
});

// ── the scoping clause ───────────────────────────────────────────────────────

test('a MATCH scoped to one agent does not return another agent\'s notes', () => {
  const store = openStore();
  try {
    store.indexMemory('pam-a1', ['The refund window is thirty days for enterprise accounts.']);
    store.indexMemory('jim-b2', ['The refund window is seven days for trial accounts.']);

    const mine = store.searchMemory('refund window', { agentId: 'pam-a1' });
    assert.equal(mine.length, 1, `expected exactly pam-a1's note, got ${JSON.stringify(mine)}`);
    assert.match(mine[0].text, /thirty days/, 'the wrong row came back for pam-a1');
    assert.equal(mine[0].agentId, 'pam-a1', 'the agent id is not round-tripping through the index');

    // Positive control FIRST: without it, a MATCH that silently matches NOTHING
    // would satisfy the cross-agent assertion below for entirely the wrong
    // reason, and this whole file would pass over a broken index.
    assert.equal(
      store.searchMemory('thirty days', {}).length,
      1,
      'positive control failed: an UNSCOPED search for text that is definitely in the index '
      + 'returned nothing, so the cross-agent assertion below would pass vacuously'
    );

    // The scoping clause. Same query, different agent.
    assert.deepEqual(
      store.searchMemory('thirty days', { agentId: 'jim-b2' }),
      [],
      "jim-b2 can recall pam-a1's notes. The WHERE agent_id = ? predicate is not being applied, "
      + 'so memory recall leaks across agents — and SCALE-01 and RECALL-02 both build on the '
      + 'assumption that this predicate is the seam they bind server-side.'
    );
  } finally {
    store.close();
  }
});

test('the project column narrows recall the same way the agent id does', () => {
  const store = openStore();
  try {
    store.indexMemory('pam-a1', ['Deploy runbook: drain the queue before restarting.'], 'E:/alpha');

    const hit = store.searchMemory('deploy runbook', { agentId: 'pam-a1', project: 'E:/alpha' });
    assert.equal(hit.length, 1, `the project predicate excluded a matching row: ${JSON.stringify(hit)}`);
    assert.equal(hit[0].project, 'E:/alpha', 'the project is not round-tripping through the index');

    assert.deepEqual(
      store.searchMemory('deploy runbook', { agentId: 'pam-a1', project: 'E:/beta' }),
      [],
      'a note filed under E:/alpha came back for E:/beta. The project half of the predicate is '
      + 'not applied, so the column is decoration and per-project recall is a claim with no code'
    );
  } finally {
    store.close();
  }
});

// ── T-P10-03: MATCH takes a query language, and binding is not enough ────────

test('FTS5 operators typed into the search box are terms, never syntax (T-P10-03)', () => {
  const store = openStore();
  try {
    store.indexMemory('pam-a1', ['The staging cluster password rotates every Friday.']);
    store.indexMemory('jim-b2', ['The production cluster password rotates every Monday.']);

    // Each of these is a syntax error, an operator, or an unbalanced quote in
    // FTS5's query grammar. A bound parameter binds the STRING and not its
    // MEANING, so binding alone does not stop any of them.
    const hostile = [
      '*',
      '""',
      'password OR *',
      'password" OR agent_id NOT NULL --',
      'NEAR(staging production',
      'password AND NOT staging',
      '^staging',
      'stag*ing:'
    ];
    for (const query of hostile) {
      const hits = store.searchMemory(query, { agentId: 'pam-a1' });
      assert.ok(
        Array.isArray(hits),
        `searchMemory threw or returned a non-array for ${JSON.stringify(query)}. An agent's `
        + 'search box can then crash the recall path with one punctuation mark'
      );
      assert.ok(
        hits.every((h) => h.agentId === 'pam-a1'),
        `${JSON.stringify(query)} widened the scope past pam-a1 — an FTS5 operator reached the `
        + 'query engine and steered it, which is the injection this sanitiser exists to stop'
      );
    }

    // Positive control: real terms still work as terms once the punctuation
    // around them is dropped. Without this the sanitiser could "pass" every
    // assertion above by returning nothing for everything.
    assert.equal(
      store.searchMemory('staging, password!', { agentId: 'pam-a1' }).length,
      1,
      'the sanitiser dropped the real search terms along with the punctuation, so recall now '
      + 'silently returns nothing for any query a human would actually type'
    );

    // The discriminator. `OR` reaching FTS5 as an OPERATOR matches this row on
    // `password` alone; `OR` reduced to a literal TERM does not, because neither
    // "or" nor "pineapple" is in the text. Zero rows is the only answer that
    // distinguishes the two, which is why this is asserted rather than the
    // no-throw above — a sanitiser that merely escaped quotes would pass that
    // and fail this.
    assert.deepEqual(
      store.searchMemory('password OR pineapple', { agentId: 'pam-a1' }),
      [],
      'FTS5 read OR as an operator, so a caller can still steer the query rather than search '
      + 'it. Binding the parameter was never enough: MATCH binds the string, not its meaning'
    );
  } finally {
    store.close();
  }
});

// ── the condense contract ────────────────────────────────────────────────────

test('re-indexing an agent replaces its notes rather than appending to them', () => {
  const store = openStore();
  try {
    store.indexMemory('pam-a1', ['We chose Postgres for the ledger.']);
    assert.equal(store.searchMemory('Postgres ledger', { agentId: 'pam-a1' }).length, 1,
      'precondition: the first note is not in the index');

    // memory.md is rewritten wholesale by the reflector's condense, so this is
    // what every re-mine after a condense actually does.
    store.indexMemory('pam-a1', ['We chose SQLite for the ledger.']);

    assert.deepEqual(
      store.searchMemory('Postgres', { agentId: 'pam-a1' }),
      [],
      'the superseded note survived the re-index. Recall then keeps returning decisions that no '
      + 'longer exist in the memory.md they came from, and the newer note has to out-rank them'
    );
    assert.equal(
      store.searchMemory('SQLite ledger', { agentId: 'pam-a1' }).length,
      1,
      'the replacement note is missing — the re-index deleted and did not insert'
    );
  } finally {
    store.close();
  }
});

test('the index survives a close and a re-open of the same file', () => {
  const dbPath = path.join(tempDir(), 'harness.db');

  const first = openStore(dbPath);
  first.indexMemory('pam-a1', ['The invoice import runs at 04:00 UTC.']);
  first.close();

  const second = openStore(dbPath);
  try {
    assert.equal(
      second.searchMemory('invoice import', { agentId: 'pam-a1' }).length,
      1,
      'the indexed note did not survive a re-open. Either the write never reached disk or the '
      + 'second open re-ran the migration over the top of it — memory that evaporates on restart '
      + 'is the thing this whole subsystem exists to prevent'
    );
  } finally {
    second.close();
  }
});

// ── SCALE-01: harness.db follows harnessHome ─────────────────────────────────
/**
 * `harness.db` used to default under `app.getPath('userData')` — ONE file for
 * every project on the machine, so "an agent in project X cannot see project Y's
 * data" was false for the kv store, the command history and this FTS index.
 * The fix is an injected `getHome` closure (db.ts must never import config.ts —
 * config.ts imports PersistStore FROM here) plus `repoint()`, for the one
 * non-relaunching `harnessHome: null -> set` transition in `config:update`.
 */

test('the injected harnessHome getter, not userData, decides the default DB path', () => {
  userData = tempDir();
  const home = tempDir();
  const store = new PersistStore(undefined, () => home);
  try {
    store.open();
    assert.ok(
      fs.existsSync(path.join(home, 'harness.db')),
      'the DB did not land under the harnessHome the getter returned — the kv store, command '
      + 'history and FTS index are still shared across every project on the machine, which is '
      + 'the entire escape SCALE-01 exists to close'
    );
    assert.ok(
      !fs.existsSync(path.join(userData, 'harness.db')),
      'the DB ALSO opened under userData: the getter is being ignored in favour of the old '
      + 'shared path'
    );
  } finally {
    store.close();
  }
});

test('a null harnessHome still falls back to userData — a fresh install before onboarding is unchanged', () => {
  userData = tempDir();
  const store = new PersistStore(undefined, () => null);
  try {
    store.open();
    assert.ok(
      fs.existsSync(path.join(userData, 'harness.db')),
      'a store whose getHome() returns null (harnessHome not configured yet) no longer falls '
      + 'back to userData — a fresh install would have nowhere to persist before onboarding'
    );
  } finally {
    store.close();
  }
});

test('an explicit dbPath still wins over the getHome getter', () => {
  userData = tempDir();
  const home = tempDir();
  const explicit = path.join(tempDir(), 'explicit.db');
  const store = new PersistStore(explicit, () => home);
  try {
    store.open();
    assert.ok(fs.existsSync(explicit), 'the explicit dbPath override no longer opens where it was told to');
    assert.ok(
      !fs.existsSync(path.join(home, 'harness.db')),
      'the getHome getter overrode an explicit dbPath — every test in this file passes dbPath, '
      + 'so that inversion would silently relocate all of them'
    );
  } finally {
    store.close();
  }
});

test('repoint() moves a LIVE handle from the pre-onboarding path to the new home', () => {
  userData = tempDir();
  const home = tempDir();
  let harnessHome = null;                       // fresh install: not configured yet
  const store = new PersistStore(undefined, () => harnessHome);
  try {
    store.open();
    store.setKv('scale01', 'pre-onboarding');
    assert.equal(store.getKv('scale01'), 'pre-onboarding');
    assert.ok(fs.existsSync(path.join(userData, 'harness.db')));

    harnessHome = home;                         // onboarding writes harnessHome
    store.repoint();

    assert.equal(
      store.isOpen, true,
      'repoint() left the handle CLOSED. Every kv/history call guards on `this.db`, so the app '
      + 'would look healthy while persisting nothing for the rest of the session'
    );
    assert.ok(
      fs.existsSync(path.join(home, 'harness.db')),
      'repoint() did not reopen under the new home — the handle is stranded at the '
      + 'pre-onboarding path, which is the exact stranding this method exists to prevent'
    );
    assert.equal(
      store.getKv('scale01'), undefined,
      'the repointed handle is still READING the pre-onboarding file: close-then-reopen did not '
      + 're-evaluate the default-path branch'
    );
    store.setKv('scale01', 'post-onboarding');
    assert.equal(store.getKv('scale01'), 'post-onboarding');
  } finally {
    store.close();
  }

  // Read the post-repoint write back through an INDEPENDENT handle on the file
  // itself: proves repoint() moved the file, not just the isOpen flag.
  const verify = new PersistStore(path.join(home, 'harness.db'));
  verify.open();
  try {
    assert.equal(
      verify.getKv('scale01'), 'post-onboarding',
      'the value written after repoint() is not in the new home\'s file on disk'
    );
  } finally {
    verify.close();
  }
});

// ── SCALE-03 — the events table, read as a TIME RANGE ────────────────────────
//
// Plan 03-03 was written expecting to CREATE this table as migration #3, with a
// `(id, floor_id, ts, kind, agent_id, task_id, session_id, payload)` schema.
// Phase 4's RECORD-01/RECORD-02 landed migration #3 first, with a narrower
// `(id, ts, kind, json)` — `json` being the whole event verbatim, which is a
// SUPERSET of the columns the plan wanted to split out. Appending the plan's
// version as a fourth migration is not merely redundant, it is FATAL: measured
// this session against the real better-sqlite3 that ships here, the
// `CREATE TABLE IF NOT EXISTS events` silently no-ops on an already-migrated DB
// and the very next statement, `CREATE INDEX ... ON events(floor_id, ts)`,
// throws `SqliteError: no such column: floor_id`. db.ts's own migrate() comment
// spells out what that costs — a throw inside a migration escapes the
// quarantine path and leaves the store PERMANENTLY UNOPENABLE on every install
// that already ran RECORD-02. So SCALE-03 reads the table that is there.
//
// What is genuinely new here is `earliestEventTs()`, which `hive:timeline`
// reports as `firstTs`. Its contract is the earliest timestamp STILL STORED,
// not "the first event ever" — pruneEvents moves MIN(ts) forward every day, and
// a UI that says "no record before 09:14" must be telling the truth about the
// store as it is now, not about a row that was deleted a month ago.

const SCALE03_DAY_MS = 24 * 60 * 60 * 1000;

test('SCALE-03: events is real schema on disk, at or past user_version 3', () => {
  const dbPath = path.join(tempDir(), 'harness.db');
  const store = openStore(dbPath);
  store.close(); // checkpoints the WAL, so the schema is readable from the file

  // A SECOND, independent handle — the same discipline the memory_fts case at
  // the top of this file applies, and for the same reason: a driver that stores
  // a version number and swallows the DDL cannot satisfy it.
  const raw = new Database(dbPath, { readonly: true });
  try {
    const version = raw.pragma('user_version', { simple: true });
    assert.ok(
      version >= 3,
      `user_version is ${version}; the events table lands at 3. The rail is APPEND-ONLY and this `
      + 'is a lower bound on purpose — a later migration must never make this go red.'
    );
    const cols = raw.prepare('PRAGMA table_info(events)').all().map((c) => c.name);
    assert.deepEqual(
      cols, ['id', 'ts', 'kind', 'json'],
      'the events table on disk does not have the shipped RECORD-02 columns. If a migration widened '
      + 'it, widen this list in the same commit — and check that appendEvent still binds every '
      + 'NOT NULL column, because a mismatch here throws on every single append and appendLog '
      + 'swallows it, which is a silent floor-wide record outage.'
    );
    const idx = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'events'")
      .all().map((r) => r.name);
    assert.ok(
      idx.includes('idx_ev_ts'),
      `events has no idx_ev_ts (indexes: ${idx.join(', ') || 'none'}). Without it a DAY is a full `
      + 'table scan, and this table takes on the order of hundreds of thousands of rows a day.'
    );
    assert.ok(idx.includes('idx_ev_kind_ts'), `events has no idx_ev_kind_ts (indexes: ${idx.join(', ')})`);
  } finally {
    raw.close();
  }
});

test('SCALE-03: earliestEventTs() is null on an empty events table', () => {
  const store = openStore();
  try {
    assert.equal(
      store.earliestEventTs(), null,
      'an empty events table must report null, not 0 — hive:timeline hands this through as firstTs '
      + 'and 0 is a real epoch timestamp the UI would happily render as "records began in 1970"'
    );
  } finally {
    store.close();
  }
});

test('SCALE-03: earliestEventTs() reports the earliest ts STILL STORED, and follows the prune', () => {
  const dbPath = path.join(tempDir(), 'harness.db');
  const store = openStore(dbPath);
  const now = Date.now();
  // Expired against the SHIPPED window, computed FROM the exported constant —
  // never a hardcoded 30 — so moving EVENT_RETENTION_MS cannot leave this case
  // silently asserting a window the product no longer has.
  const expiredTs = now - EVENT_RETENTION_MS - SCALE03_DAY_MS;
  const freshTs = now;
  store.appendEvent('hive_event', JSON.stringify({ marker: 'expired' }), expiredTs);
  store.appendEvent('hive_event', JSON.stringify({ marker: 'fresh' }), freshTs);
  assert.equal(
    store.earliestEventTs(), expiredTs,
    'earliestEventTs() did not return MIN(ts) over the stored rows'
  );
  store.close();

  // Reopened as a SECOND, independent handle on the same file: the rows are on
  // disk, not in one process's memory, and the prune below is the real
  // `DELETE FROM events WHERE ts < ?` boot.ts runs at boot and once a day.
  const second = new PersistStore(dbPath);
  second.open();
  try {
    assert.equal(second.earliestEventTs(), expiredTs, 'the events did not survive the handle close');
    const gone = second.pruneEvents(Date.now() - EVENT_RETENTION_MS);
    assert.equal(
      gone, 1,
      `the retention delete removed ${gone} rows, not 1. At 0 the table is unbounded and this `
      + 'whole window is decorative; at 2 it just ate a row inside the window it promised to keep.'
    );
    assert.equal(
      second.eventsBetween(expiredTs - 1, expiredTs + 1).length, 0,
      'the expired row is still readable after the prune — a retention statement that is built but '
      + 'never run, or run with the wrong units, looks exactly like this'
    );
    assert.equal(
      second.eventsBetween(freshTs, freshTs + 1).length, 1,
      'the FRESH row was deleted too — an inverted comparison passes the "expired row is gone" half '
      + 'of this test while destroying the record it exists to keep'
    );
    assert.equal(
      second.earliestEventTs(), freshTs,
      'earliestEventTs() still reports the DELETED row\'s timestamp. It is the earliest ts STILL '
      + 'STORED, not the first event ever — 03-07 draws its "no record before {HH:mm}" marker from '
      + 'this number, and a stale one claims coverage the store cannot deliver.'
    );
  } finally {
    second.close();
  }
});
