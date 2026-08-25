'use strict';

/**
 * RECORD-01 — every agent tool call persisted with agent, timestamp, tool and
 * TARGET, against a REAL SQLite handle on a real file.
 *
 * Why the target is the whole point of this file:
 *
 * 04-VALIDATION.md § Anti-Vacuous-Pass Rules names the failure mode by name —
 * *"RECORD-01 — asserting row count passes with a null `target`, which is the
 * half the requirement exists for."* A writer that inserts `(agent_id, ts,
 * tool)` and drops the command string satisfies "every tool call is persisted"
 * on a row count and answers nothing at all when the operator asks which file
 * the agent rewrote overnight. So every assertion below that counts rows is
 * paired with one that reads the column, and the failure message on that one
 * says explicitly that the ROW arrived — otherwise a red run reads as a lost
 * write and the real defect (an empty column) gets debugged in the wrong file.
 *
 * The nullable column is asserted BOTH ways for the same reason: `target` is
 * nullable on purpose (a `Bash` call with no path-shaped argument genuinely has
 * no target), so "null" must be distinguishable from "nothing was written".
 *
 * ── Real driver, no stand-in ─────────────────────────────────────────────────
 * `test/config-secrets.test.cjs` injects a stand-in SQLite driver whose
 * `pragma()` implements the migration rail while its `exec()` does nothing —
 * run a migration test against that and `user_version` climbs to 3 with not one
 * byte of DDL executed. `node --test` runs each file in its own child process,
 * so this file simply does not inject, and the driver below is the real one.
 * The schema assertions read the file back through a SECOND, independent
 * read-only handle, which a version-counting stub cannot satisfy.
 *
 * No bypass of any kind: no `skip:` option, no guarded require, no early
 * return. `node --test` exits 0 for a file whose every case was skipped, so a
 * bypass here would make "the record was never exercised" and "the record
 * works" produce byte-identical gate output. Pure SQLite, so it runs on all
 * three CI platforms — this file adds nothing to the skip census.
 *
 * `db.ts:19` imports `app` from electron, so the module is loaded through
 * `test/load-ts.cjs`'s stub (CI installs with `npm ci --ignore-scripts` and has
 * no electron binary at all). `dbPath` is a real constructor parameter, so
 * `app.getPath` is never reached on any path this file drives.
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
const { PersistStore } = loadTs('src/main/db.ts');

// ── real temp dirs, self-cleaning ────────────────────────────────────────────

const made = [];

/** A real directory, `realpathSync`-resolved: on macOS `os.tmpdir()` is the
 *  symlink `/var/...` and SQLite reports the resolved `/private/var/...` path
 *  back, so an unresolved path makes equality assertions fail for a reason that
 *  has nothing to do with the code under test. */
function tempDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-record-')));
  made.push(dir);
  return dir;
}

after(() => {
  for (const dir of made) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function openStore(dbPath) {
  const store = new PersistStore(dbPath);
  store.open();
  return store;
}

/** Read something out of the FILE, through a handle the store does not own. */
function readRaw(dbPath, fn) {
  const raw = new Database(dbPath, { readonly: true });
  try { return fn(raw); } finally { raw.close(); }
}

// ── the migration ────────────────────────────────────────────────────────────

test('open() lands on user_version 3 with tool_calls, events and all four indexes', () => {
  const dbPath = path.join(tempDir(), 'harness.db');
  const store = openStore(dbPath);
  store.close(); // checkpoints the WAL, so the schema is readable from the file

  readRaw(dbPath, (raw) => {
    assert.equal(
      raw.pragma('user_version', { simple: true }),
      3,
      'user_version is not 3 after a fresh open(). Migration index 2 takes the DB from 2 to 3, '
      + 'so either the entry was not appended or a shipped one was edited — and editing a '
      + 'shipped migration means every install that already ran it never gets this schema.'
    );

    const names = raw
      .prepare("SELECT name FROM sqlite_master WHERE name IN ('tool_calls','events') ORDER BY name")
      .all()
      .map((r) => r.name);
    assert.deepEqual(
      names,
      ['events', 'tool_calls'],
      `sqlite_master holds ${JSON.stringify(names)}, not both tables. The migration rail ran `
      + '(user_version is asserted above) but executed no DDL for them, which is exactly what a '
      + 'stand-in driver with a no-op exec() would hide: every write below would then fail on a '
      + 'machine where the version number looked perfectly correct.'
    );

    const indexes = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name")
      .all()
      .map((r) => r.name);
    for (const want of ['idx_ev_kind_ts', 'idx_ev_ts', 'idx_tc_agent_ts', 'idx_tc_ts']) {
      assert.ok(
        indexes.includes(want),
        `${want} is missing (have ${JSON.stringify(indexes)}). Without idx_tc_ts and idx_ev_ts a `
        + '"what did the floor run overnight" query degrades to a full table scan over a table '
        + 'that takes ~288k rows a day — D-19 says a day is a RANGE SCAN, and the index is the '
        + 'only thing that makes that sentence true.'
      );
    }
  });
});

test('a reopen re-runs nothing: user_version stays 3 and migration 2\'s rows survive', () => {
  const dbPath = path.join(tempDir(), 'harness.db');

  const first = openStore(dbPath);
  first.indexMemory('pam-a1', ['The invoice import runs at 04:00 UTC.']);
  first.recordToolCall({ agentId: 'pam-a1', ts: Date.now(), tool: 'Edit', target: 'E:/alpha/a.ts' });
  first.close();

  const second = openStore(dbPath);
  try {
    assert.equal(
      second.searchMemory('invoice import', { agentId: 'pam-a1' }).length,
      1,
      'the memory_fts row did not survive the reopen. The new migration is not additive — it '
      + 're-ran an earlier one over the top of live data, which on a shipped install destroys '
      + 'every note the agent has ever written.'
    );
    assert.equal(
      second.toolCalls({ agentId: 'pam-a1' }).length,
      1,
      'the tool_calls row written before close() is gone after the reopen'
    );
  } finally {
    second.close();
  }

  readRaw(dbPath, (raw) => {
    assert.equal(
      raw.pragma('user_version', { simple: true }),
      3,
      'user_version moved on the second open. The rail is append-only and idempotent: a second '
      + 'open must run no migration at all.'
    );
  });
});

// ── RECORD-01: the target is the half that matters ───────────────────────────

test('a tool call written before close() survives a reopen with its target non-null', () => {
  const dbPath = path.join(tempDir(), 'harness.db');
  const t0 = 1_770_000_000_000;

  // A Windows path, a POSIX path and a raw command — the three shapes
  // hooks.ts:865-889 actually pulls out of tool_input (file_path / path /
  // notebook_path / command).
  const written = [
    { agentId: 'a1', ts: t0 + 1, tool: 'Edit', target: 'C:\\x\\y.ts', decision: 'allow', reason: null },
    { agentId: 'a1', ts: t0 + 2, tool: 'Read', target: '/srv/hive/notes.md', decision: 'allow', reason: null },
    { agentId: 'a1', ts: t0 + 3, tool: 'Bash', target: 'git push origin +main', decision: 'deny', reason: 'force push' }
  ];
  const otherAgent = { agentId: 'a2', ts: t0 + 4, tool: 'Write', target: 'D:\\other\\agent\\secret.txt' };

  const first = openStore(dbPath);
  for (const row of written) first.recordToolCall(row);
  first.recordToolCall(otherAgent);
  first.close();

  const second = openStore(dbPath);
  try {
    const rows = second.toolCalls({ agentId: 'a1' });

    assert.equal(
      rows.length,
      3,
      `a1 wrote 3 tool calls before close() and ${rows.length} came back after the reopen. `
      + 'Under WAL + synchronous = NORMAL a committed row is durable across a PROCESS exit, so '
      + 'this is a lost write, not a checkpoint race.'
    );

    // The half a row count cannot see. Failure message says the ROW arrived, so
    // a red run is debugged as an empty column and not as a lost write.
    for (const r of rows) {
      assert.ok(
        typeof r.target === 'string' && r.target.length > 0,
        `the row for tool=${r.tool} (id=${r.id}, agentId=${r.agentId}) came back from disk with `
        + `target=${JSON.stringify(r.target)}. The ROW SURVIVED — this is NOT a missing write. `
        + 'The target column itself is empty, which is precisely the half of RECORD-01 that '
        + '"assert the row count" passes over: the operator can see that something ran and '
        + 'still cannot see WHAT it touched.'
      );
    }

    // Newest-first, and every target byte-identical to what was written.
    assert.deepEqual(
      rows.map((r) => [r.tool, r.target, r.decision, r.reason, r.ts]),
      [...written].reverse().map((w) => [w.tool, w.target, w.decision, w.reason, w.ts]),
      'the rows did not round-trip verbatim newest-first. A backslash eaten by the driver, a '
      + 'decision dropped, or an ascending order here all read the same on a length check.'
    );

    // Negative, with the positive above as its control.
    const targets = rows.map((r) => r.target);
    assert.ok(
      !targets.includes(otherAgent.target),
      `a2's target (${otherAgent.target}) came back in a1's result. The WHERE agent_id = ? `
      + 'predicate is not applied, so one agent can read the record of what every other agent '
      + 'on the floor touched — including paths outside its own project.'
    );
  } finally {
    second.close();
  }

  readRaw(dbPath, (raw) => {
    assert.equal(raw.pragma('user_version', { simple: true }), 3, 'user_version is not 3 after the reopen');
  });
});

test('a null target round-trips as null, and is distinguishable from a row that never arrived', () => {
  const dbPath = path.join(tempDir(), 'harness.db');
  const t0 = 1_770_100_000_000;

  const store = openStore(dbPath);
  try {
    // `ls -la` has no path-shaped argument, so the column is null BY DESIGN.
    store.recordToolCall({ agentId: 'a1', ts: t0 + 1, tool: 'Bash', target: null });
    store.recordToolCall({ agentId: 'a1', ts: t0 + 2, tool: 'Edit', target: 'C:\\x\\y.ts' });

    const rows = store.toolCalls({ agentId: 'a1' });
    assert.equal(rows.length, 2, 'positive control: both rows must be present before the null is read');

    const bash = rows.find((r) => r.tool === 'Bash');
    const edit = rows.find((r) => r.tool === 'Edit');
    assert.ok(bash, 'the Bash row is missing entirely — a null target must not drop the row');
    assert.equal(
      bash.target,
      null,
      `the Bash row's target is ${JSON.stringify(bash.target)}, not null. The column is nullable `
      + 'on purpose and the two states must stay distinguishable: "" or "null" as a STRING makes '
      + '"this call had no target" indistinguishable from "the target was lost".'
    );
    assert.equal(edit.target, 'C:\\x\\y.ts', 'the non-null neighbour did not round-trip');
  } finally {
    store.close();
  }
});

// ── the query bounds ─────────────────────────────────────────────────────────

test('an untrusted limit is clamped rather than passed through to SQLite', () => {
  const dbPath = path.join(tempDir(), 'harness.db');
  const t0 = 1_770_200_000_000;

  const store = openStore(dbPath);
  try {
    // 1001 — one past clampLimit's ceiling of 1000, so the clamp is the only
    // thing that can make the two numbers below differ.
    for (let i = 0; i < 1001; i++) {
      store.recordToolCall({ agentId: 'bulk', ts: t0 + i, tool: 'Read', target: `f${i}.ts` });
    }

    const got = store.toolCalls({ agentId: 'bulk', limit: 1e9 });
    assert.equal(
      got.length,
      1000,
      `toolCalls returned ${got.length} rows for limit=1e9. The clamp did not fire: an agent-`
      + 'supplied limit reaches SQLite unchanged, so one query can pull the whole table into '
      + 'main-process memory over IPC.'
    );

    store.close();
    const stored = readRaw(dbPath, (raw) =>
      raw.prepare("SELECT COUNT(*) AS n FROM tool_calls WHERE agent_id = 'bulk'").get().n);
    assert.equal(
      stored,
      1001,
      `only ${stored} of 1001 rows reached the table, so the assertion above would have read `
      + '1000 for a reason that has nothing to do with the clamp'
    );
  } finally {
    store.close();
  }
});

test('sinceMs excludes older rows and keeps the boundary row', () => {
  const store = openStore(path.join(tempDir(), 'harness.db'));
  try {
    const t0 = 1_770_300_000_000;
    store.recordToolCall({ agentId: 'a1', ts: t0 - 1, tool: 'Read', target: 'old.ts' });
    store.recordToolCall({ agentId: 'a1', ts: t0, tool: 'Read', target: 'boundary.ts' });
    store.recordToolCall({ agentId: 'a1', ts: t0 + 1, tool: 'Read', target: 'new.ts' });

    assert.equal(store.toolCalls({ agentId: 'a1' }).length, 3, 'positive control: all three rows are stored');

    assert.deepEqual(
      store.toolCalls({ agentId: 'a1', sinceMs: t0 }).map((r) => r.target),
      ['new.ts', 'boundary.ts'],
      'sinceMs is not an inclusive lower bound. Off by one here and "everything since midnight" '
      + 'silently drops the first event of the day — the same first-row blindness RECORD-02 exists to close.'
    );
  } finally {
    store.close();
  }
});

test('an oversized agent-authored target is capped before it is stored', () => {
  const dbPath = path.join(tempDir(), 'harness.db');
  const store = openStore(dbPath);
  try {
    // HOOK_LINE_MAX upstream is 16 MiB, and `target` is whatever string an LLM
    // put in tool_input.command. An uncapped column is an unbounded write.
    store.recordToolCall({ agentId: 'a1', ts: 1, tool: 'Bash', target: 'x'.repeat(1_000_000) });
    const [row] = store.toolCalls({ agentId: 'a1' });
    assert.ok(row, 'the oversized row was dropped entirely — cap it, do not discard it');
    assert.ok(
      Buffer.byteLength(row.target, 'utf8') <= 4096,
      `the stored target is ${Buffer.byteLength(row.target, 'utf8')} bytes. A 16 MiB hook payload `
      + 'then lands verbatim in a column that is read back and rendered, once per tool call.'
    );
    assert.ok(row.target.length > 0, 'the cap truncated the target to nothing, which loses the whole column');
  } finally {
    store.close();
  }
});
