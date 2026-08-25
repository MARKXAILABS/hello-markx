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

// ─── RECORD-01: the JOIN, not the halves (plan 04-15 task 3) ─────────────────
//
// Everything above proves the STORE: `recordToolCall` is called directly and the
// row is read back. That is plan 04-02's half and it was already green. What
// follows proves the JOIN — a real hook payload, over the REAL socket, through
// the REAL `HookServer`, landing in the REAL SQLite file — because RESEARCH's
// Pitfall 2 is exactly this repo's own history: `test/net-binding.test.cjs`
// proved the server rejects a tokenless payload, `test/hive-hook-node.test.cjs`
// proved the shim sends bytes, and BOTH stayed green through a period when the
// whole floor was dead-hooked. Each half is easier to test than the join.
//
// NOT PLATFORM-GATED and no `skip:`. `hive.sockPath()` answers with a `\\.\pipe\`
// name on win32 and a socket file on POSIX; plan 04-02 bound this file to run on
// all three CI platforms and that binding still holds.

const net = require('node:net');
const { withHookServer } = require('./gate-harness.cjs');

/**
 * A real floor with a real socket, wired to a real `PersistStore`.
 *
 * `withHookServer` (plan 04-01) owns the hive, the socket and the per-agent
 * token. It constructs `HookServer` with the eight arguments that existed when
 * it was written, so this plan's optional trailing seams — `hostAllowlist`,
 * `recordToolCall`, `publishApproval` — are assigned onto the instance
 * afterwards rather than by editing 04-01's file, which is not this plan's to
 * edit. They are TypeScript parameter properties, i.e. ordinary own fields on
 * exactly the object the constructor would have set, so this is the same wiring
 * a constructor argument produces. What is under test here is
 * `handle → record → PersistStore`, not the constructor.
 */
async function withFloor(opts, fn) {
  const o = opts || {};
  const dbPath = path.join(tempDir(), 'harness.db');
  const store = openStore(dbPath);
  const thrown = [];
  return withHookServer({ agentId: 'a1', control: o.control }, async (ctx) => {
    ctx.server.hostAllowlist = o.hostAllowlist;
    ctx.server.recordToolCall = o.throwOnRecord
      ? (row) => { thrown.push(row); throw new Error('the audit store is down'); }
      : (row) => store.recordToolCall(row);

    /** One payload, over the real pipe, answered. */
    const send = (payload) => new Promise((resolve, reject) => {
      const c = net.createConnection(ctx.sock, () => c.end(JSON.stringify(payload) + '\n'));
      let resp = '';
      c.setEncoding('utf8');
      c.on('data', (d) => { resp += d; });
      c.on('close', () => { try { resolve(resp ? JSON.parse(resp) : {}); } catch { resolve(resp); } });
      c.on('error', reject);
    });
    const pre = (tool_name, tool_input, extra = {}) => send({
      hook_event_name: 'PreToolUse', tool_name, tool_input, sock_token: ctx.token, ...extra
    });
    const poll = (ask_id) => send({
      hook_event_name: 'ApprovalPoll', ask_id, sock_token: ctx.token
    });
    const rows = () => store.toolCalls({ agentId: 'a1', limit: 100 });

    try {
      return await fn({ ...ctx, store, send, pre, poll, rows, thrown });
    } finally {
      store.close();
    }
  });
}

test('RECORD-01: a real Write over the real socket persists a NON-NULL target', async () => {
  await withFloor({}, async ({ pre, rows }) => {
    const target = path.join(os.tmpdir(), 'md-record-join', 'alpha.ts');
    await pre('Write', { file_path: target });

    const [row] = rows();
    assert.ok(row, 'no row at all — the writer is not on the hook path');
    assert.equal(
      row.target, target,
      `the row arrived with target=${JSON.stringify(row.target)}. 04-VALIDATION names this exact `
      + 'failure: asserting a row COUNT passes with a null target, which is the half the '
      + 'requirement exists for — "which file did the agent rewrite overnight" is unanswerable'
    );
    assert.equal(row.tool, 'Write');
    assert.equal(row.decision, 'allow', 'a benign write must record its verdict, not `pending`');
  });
});

test('RECORD-01: agent_id is TOKEN-DERIVED — the payload\'s own claim is discarded', async () => {
  await withFloor({}, async ({ pre, rows }) => {
    // The negative is what proves GATE-01 is load-bearing here. Without it a
    // persisted tool-call record attributes to an agent id any shell could forge.
    await pre('Write', { file_path: 'forged.ts' }, { agent_id: 'evil-forged-id' });

    const [row] = rows();
    assert.ok(row, 'no row — the forged payload was dropped entirely, so this proves nothing');
    assert.equal(row.agentId, 'a1', 'the row was attributed to the id the PAYLOAD claimed');
    assert.notEqual(row.agentId, 'evil-forged-id');
  });
});

test('RECORD-01: all FIVE PreToolUse exits record a real verdict — none records `pending`', async () => {
  // A grep over the exits proves the text. This drives one payload per exit
  // CLASS through the real socket and reads the decision back out of SQLite.
  const control = {
    toolDecision: (_id, tool) => (tool === 'GatedTool'
      ? { deny: 'Denied by operator.' } : { deny: false }),
    shouldHalt: () => false,
    takeSteer: () => null
  };

  await withFloor({ control, hostAllowlist: () => [] }, async ({ pre, rows, harnessHome }) => {
    // 1. shape-DENY: an emptied allowlist is the one producer of kind:'deny'.
    await pre('Bash', { command: 'curl https://evil.example/x' });
    // 2. shape-ASK: a force-push.
    await pre('Bash', { command: 'git push origin +main' });
    // 3. path-DENY: the hive's own shim, by identity, on a real hive root.
    await pre('Write', { file_path: path.join(harnessHome, 'hive', 'bin', 'cth-hook.cjs') });
    // 4. toolDecision-DENY: the operator's tool gate.
    await pre('GatedTool', { file_path: 'x.ts' });
    // 5. the fall-through ALLOW.
    await pre('Bash', { command: 'ls -la' });

    const decisions = rows().map((r) => r.decision).reverse();
    assert.equal(decisions.length, 5, `expected five rows, got ${decisions.length}: ${decisions}`);
    assert.deepEqual(
      decisions, ['deny', 'ask', 'deny', 'deny', 'allow'],
      `the five exits recorded ${JSON.stringify(decisions)}. A writer at handle's ENTRY can only `
      + 'ever record `pending`, because `decision` and `reason` are produced at ~30 return points '
      + 'well below it'
    );
    for (const r of rows()) {
      assert.notEqual(r.decision, 'pending', 'an exit recorded `pending` — see above');
      if (r.decision !== 'allow') {
        assert.ok(r.reason && r.reason.length > 0,
          `a ${r.decision} row carries no reason, which is what makes GATE-05 auditable rather `
          + 'than merely interactive');
      }
    }
  });
});

test('GATE-05: the three-way contrast, driven for real — ask, bare deny, and neither', async () => {
  // Any TWO of these are satisfied by a judge with exactly one answer. All three,
  // through the real HookServer, or the whole GATE-05 surface in this phase can
  // ship green with zero commands ever routed to ask.
  await withFloor({ hostAllowlist: () => [] }, async ({ pre }) => {
    const push = await pre('Bash', { command: 'git push origin +main' });
    assert.ok(push.hive_ask && push.hive_ask.id,
      `a real force-push produced no ask: ${JSON.stringify(push)}`);
    assert.equal(push.hookSpecificOutput.permissionDecision, 'deny',
      'the same object must still read as a deny to an un-upgraded shim');

    const curl = await pre('Bash', { command: 'curl https://evil.example/x' });
    assert.equal(curl.hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(curl.hive_ask, undefined,
      'a hard deny handed out a poll handle — an operator can now "approve" a final decision');

    const benign = await pre('Bash', { command: 'ls -la' });
    assert.deepEqual(benign, {},
      `an ordinary command was judged: ${JSON.stringify(benign)}. Without this leg a judge that `
      + 'verdicts everything passes both assertions above');

    // `rm -rf` MOVED from deny to ask in plan 04-06's round 3. The test is what
    // holds that decision, rather than prose.
    const rm = await pre('Bash', { command: 'rm -rf ./x' });
    assert.ok(rm.hive_ask && rm.hive_ask.id,
      `a recursive delete produced no ask: ${JSON.stringify(rm)}`);
  });
});

test('GATE-05: an ask nobody answers is auditable as the DENIAL it actually was', async () => {
  const { ASK_TTL_MS } = loadTs('src/main/hiveProvisioning.ts');
  const realNow = Date.now;
  try {
    await withFloor({}, async ({ pre, poll, rows }) => {
      const push = await pre('Bash', { command: 'git push origin +main' });
      const ask = push.hive_ask;
      assert.ok(ask && ask.id, 'no ask was opened, so the expiry below proves nothing');
      assert.equal(rows()[0].decision, 'ask',
        'an open ask must be recorded as an ask — a call the operator was asked about is a fact');

      // The positive control FIRST: while the ask is live, the poll says pending
      // and nothing has been settled. Without it, "it denied after the TTL" is
      // also what a registry that denies everything returns.
      assert.deepEqual(await poll(ask.id), { status: 'pending' });
      assert.equal(rows().length, 1, 'a live ask settled itself');

      // Then jump the clock past the REAL TTL rather than sleeping through two
      // minutes of it. `sweep` has a caller in production — the poll loop IS the
      // clock — so an ordinary poll is what drives the expiry.
      const jumped = realNow() + ASK_TTL_MS + 1;
      Date.now = () => jumped;
      const expired = await poll(ask.id);
      Date.now = realNow;

      assert.equal(expired.status, 'deny', 'an ask past its deadline still told the shim to wait');
      assert.equal(expired.hookSpecificOutput.permissionDecision, 'deny');

      const all = rows();
      assert.equal(all.length, 2,
        `expected the ask and its denial, got ${JSON.stringify(all.map((r) => r.decision))}`);
      assert.equal(
        all[0].decision, 'deny',
        'the ledger still reads `ask` for a call that was in fact DENIED. An ask that expires with '
        + 'nobody sweeping stays pending forever, and the Repudiation mitigation would not exist'
      );
      assert.equal(all[0].target, 'git push origin +main',
        'the denial row lost the command it denied');
      assert.ok(all[0].reason && all[0].reason.length > 0, 'the denial row carries no reason');
      assert.equal(all[1].decision, 'ask', 'the question itself was overwritten rather than answered');
    });
  } finally {
    Date.now = realNow;
  }
});

test('RECORD-01: a store that THROWS costs a row and never a verdict', async () => {
  // A gate that fails open because its audit log was unavailable is a worse bug
  // than a missing row. Both returns are compared, not merely "it did not throw".
  let healthy;
  await withFloor({ hostAllowlist: () => [] }, async ({ pre }) => {
    healthy = await pre('Bash', { command: 'curl https://evil.example/x' });
  });

  await withFloor({ hostAllowlist: () => [], throwOnRecord: true }, async ({ pre, thrown }) => {
    const broken = await pre('Bash', { command: 'curl https://evil.example/x' });
    assert.deepEqual(
      broken, healthy,
      'the verdict changed when the audit store threw. A recording failure must never be able to '
      + 'move a security decision in either direction'
    );
    assert.equal(thrown.length, 1, 'the writer was never even called, so nothing was proved');

    const benign = await pre('Bash', { command: 'ls -la' });
    assert.deepEqual(benign, {}, 'a throwing store turned an allow into something else');
  });
});

test('RECORD-01: the writer is on the hook path and NOT on the telemetry path', () => {
  const hooksSrc = fs.readFileSync(
    path.resolve(__dirname, '..', 'src/main/hooks.ts'), 'utf8'
  );
  assert.equal(
    (hooksSrc.match(/from '\.\/db'|require\('\.\/db'\)/g) || []).length, 0,
    'hooks.ts imports db.ts. The store arrives as an INJECTED thunk read at call time, because '
    + 'boot.ts assigns its module-scope `persist` let AFTER the new HookServer(...) call'
  );
  assert.ok(
    (hooksSrc.match(/this\.record\(/g) || []).length >= 5,
    'fewer than five record call sites — the five PreToolUse exits cannot all be covered'
  );
  // And nothing records at `handle`'s ENTRY, by SYMBOL boundary rather than by a
  // line window: a window would drift with every insertion above it and return 0
  // for the wrong region, which is a silently vacuous pass.
  const entry = hooksSrc.slice(
    hooksSrc.indexOf('private handle(p: HookPayload, agentId: string): unknown {')
  );
  const untilPreToolUse = entry.slice(0, entry.indexOf('PreToolUse'));
  assert.ok(untilPreToolUse.length > 0, 'the symbol boundary found nothing — this gate went blind');
  assert.equal(
    (untilPreToolUse.match(/this\.record\(/g) || []).length, 0,
    'something records at handle\'s entry, where `decision` and `reason` do not exist yet — every '
    + 'row there can only say `pending`'
  );
});
