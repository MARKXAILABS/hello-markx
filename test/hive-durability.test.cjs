'use strict';

/**
 * The hive's three silent-loss paths, pinned.
 *
 * 1. C3 — registry.json/tasks.json were written with a bare writeFileSync. A
 *    crash mid-write truncates the JSON, readJson swallows the parse error and
 *    returns defaults, and the whole floor (god id, every agent's cwd/provider/
 *    session, the kanban) resets to onboarding without a word.
 * 2. C6 — mail to an id that was never registered evaporated while the log said
 *    "message" and the floor flew an envelope.
 * 3. C4 — autoMode ships `--permission-mode bypassPermissions`, so the
 *    permission prompt HIVE.md calls the human-in-the-loop gate never fires. A
 *    deny list is the one rule that still applies under it.
 *
 * Plus H3's log budget: log.jsonl is append-only with a dozen writers, so it
 * rotates, and logTail reads a bounded window instead of the whole file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

/** A throwaway harness home with a live hive in it. */
function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hive-durable-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  return { hive, home, root: path.join(home, 'hive') };
}

const agent = (id, extra = {}) => ({ id, name: id, cwd: os.tmpdir(), capabilities: [], ...extra });
const inbox = (root, id) => path.join(root, 'agents', id, 'inbox');
const messagesIn = (dir) =>
  (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

// ── C3 — a torn write must not cost the floor ───────────────────────────────

test('a crash mid-write leaves the previous registry intact', async (t) => {
  const { hive, root } = floor(t);
  await hive.ensureAgent(agent('michael', { isGod: true }));
  const registry = path.join(root, 'registry.json');
  const before = fs.readFileSync(registry, 'utf8');
  assert.equal(hive.registry().godId, 'michael');

  // Power loss partway through the write: the first 20 bytes land, then the
  // process dies. `p` is the STAGING path once writeJson is atomic, which is
  // the whole point — the torn bytes never reach registry.json.
  const real = fs.writeFileSync;
  const torn = [];
  fs.writeFileSync = (p, data, enc) => {
    if (!String(p).includes('registry.json')) return real(p, data, enc);
    torn.push(String(p));
    real(p, String(data).slice(0, 20), enc);
    throw new Error('simulated power loss');
  };
  try {
    hive.recordSession('michael', 'session-abc'); // best-effort: swallows the throw
  } finally {
    fs.writeFileSync = real;
  }

  assert.equal(torn.length, 1, 'the write was actually attempted');
  assert.notEqual(torn[0], registry, 'the truncated bytes went to a staging file, not registry.json');
  assert.equal(fs.readFileSync(registry, 'utf8'), before, 'registry.json is byte-identical');
  assert.equal(hive.registry().godId, 'michael', 'the floor still knows who god is');
});

// ── C6 — mail to nobody must bounce, not evaporate ──────────────────────────

test('mail to an unknown recipient bounces to god and is logged undeliverable', async (t) => {
  const { hive, root } = floor(t);
  await hive.ensureAgent(agent('michael', { isGod: true }));
  await hive.ensureAgent(agent('pam'));

  // 'oscar-old' is a name remembered from a pre-restart transcript. It passes
  // every guard in routeMessage — canReceiveInbox(undefined) falls back to the
  // claude preset — and has no workspace on disk.
  const sent = hive.send({ to: 'oscar-old', subject: 'status?', body: 'where are we on Q3?' }, 'pam');

  const log = hive.logTail();
  const drop = log.find((e) => e.kind === 'undeliverable');
  assert.ok(drop, 'the drop is on the record, not only the "message" line');
  assert.equal(drop.reason, 'unknown-agent');
  assert.equal(drop.to, 'oscar-old');
  assert.equal(drop.id, sent.id);

  const bounced = messagesIn(inbox(root, 'michael'));
  assert.equal(bounced.length, 1, 'exactly one bounce, to god');
  assert.match(bounced[0].subject, /undeliverable/);
  assert.match(bounced[0].subject, /oscar-old/);
  assert.equal(bounced[0].body, 'where are we on Q3?', 'the full body survives the bounce');
  assert.equal(bounced[0].to, 'michael');
});

test('a known recipient still gets its mail, with no bounce to god', async (t) => {
  const { hive, root } = floor(t);
  await hive.ensureAgent(agent('michael', { isGod: true }));
  await hive.ensureAgent(agent('pam'));

  hive.send({ to: 'pam', subject: 'hello', body: 'welcome aboard' }, 'michael');

  assert.equal(messagesIn(inbox(root, 'pam')).length, 1);
  assert.equal(messagesIn(inbox(root, 'michael')).length, 0, 'no bounce on the happy path');
  assert.equal(hive.logTail().some((e) => e.kind === 'undeliverable'), false);
});

// ── C4 — the gate has to be enforcement, not prose ──────────────────────────

test('the per-agent settings carry a deny list that survives bypassPermissions', async (t) => {
  const { hive, root } = floor(t);
  const injection = await hive.ensureAgent(agent('dwight'));

  const settingsPath = path.join(root, 'agents', 'dwight', 'settings.json');
  assert.ok(injection.args.includes('--settings'), 'the settings file is actually passed to the CLI');
  assert.equal(injection.args[injection.args.indexOf('--settings') + 1], settingsPath);

  const deny = JSON.parse(fs.readFileSync(settingsPath, 'utf8')).permissions?.deny;
  assert.ok(Array.isArray(deny) && deny.length > 0, 'permissions.deny exists');
  const covers = (re) => assert.ok(deny.some((rule) => re.test(rule)), `nothing denies ${re}`);
  covers(/^Bash\(rm -rf/);            // recursive force-delete
  covers(/^Bash\(git push --force/);  // history nobody can get back
  covers(/^Bash\(git reset --hard/);
  covers(/^Bash\(git clean -f/);
  covers(/^Bash\(sudo/);              // privilege escalation
  covers(/\.ssh/);                    // credentials + keys
  covers(/\.env/);

  // Calibration: an agent that cannot do ordinary work is an outage, not a
  // control. Nothing here may deny a plain commit, push, or single-file delete.
  for (const rule of deny) {
    assert.doesNotMatch(rule, /^Bash\(git commit/);
    assert.doesNotMatch(rule, /^Bash\(git push\)/);
    assert.doesNotMatch(rule, /^Bash\(rm:?\*?\)/);
  }
});

// ── H3 — the log is bounded, and so is reading it ───────────────────────────

test('log.jsonl rotates once past its cap and logTail reads only the tail', (t) => {
  const { hive, root } = floor(t);
  const log = path.join(root, 'log.jsonl');

  // Seed just past the 8 MB rotation cap, with a marker on the last line so we
  // can prove the pre-rotation content is gone from the live file.
  fs.writeFileSync(log, `${'x'.repeat(8 * 1024 * 1024)}\n${JSON.stringify({ kind: 'ancient' })}\n`, 'utf8');
  hive.appendLog({ kind: 'after-rotate' });

  assert.ok(fs.existsSync(`${log}.1`), 'the previous generation is kept, one deep');
  assert.ok(fs.statSync(log).size < 1024, 'the live log started over');
  assert.deepEqual(hive.logTail().map((e) => e.kind), ['after-rotate']);

  // Now the read window: ~200 KB of events, of which only the last 64 KB may be
  // read. The oldest must be out of reach and the newest must be present.
  hive.appendLog({ kind: 'oldest', pad: 'p'.repeat(200 * 1024) });
  for (let i = 0; i < 50; i++) hive.appendLog({ kind: 'recent', i });
  const tail = hive.logTail();
  assert.equal(tail.some((e) => e.kind === 'oldest'), false, 'logTail did not slurp the whole file');
  assert.equal(tail.filter((e) => e.kind === 'recent').length, 50);
  // The window's first line is a fragment of the padded event — dropped, not
  // handed back as a {raw:…} shard.
  assert.equal(tail.some((e) => e.raw !== undefined), false);
});
