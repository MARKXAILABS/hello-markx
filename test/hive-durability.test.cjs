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

const { HiveManager, LOG_TAIL_BYTES } = loadTs('src/main/hive.ts');
// SCALE-03's driver below needs a REAL store, wired the way boot.ts wires it.
// `db.ts` imports `app` from electron, which load-ts.cjs stubs; better-sqlite3
// is the real native module and there is deliberately no guard around it — a
// bypass here would make "the SQL path was never exercised" and "the SQL path
// works" produce identical green output.
const { PersistStore } = loadTs('src/main/db.ts');
const { summarizeDay, bucketDetail } = loadTs('src/main/timeline.ts');

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

// ─── FLOOR-09 (#19): the proxy tier's spend reaches getAgentUsage ────────────
//
// A SOURCE assertion, following the idiom test/hive-task-mutation.test.cjs
// already uses for exactly this class of claim ('renderer task actions never
// send a whole stale ledger back to main', which readFileSync's src/main/index.ts
// and asserts on its text).
//
// It is here because the sink and its call site are owned by different plans:
// 01-06 minted the optional `recordCost` parameter on HookServer and proved it
// at runtime through a real hook socket, but could not write index.ts. The
// parameter is OPTIONAL and LAST, so the tree typechecks perfectly with the
// argument absent — which is precisely why nothing but an assertion on the
// composition root can hold it in place.
test('the composition root passes a cost sink at the sole new HookServer() call (FLOOR-09)', () => {
  // 02-02 moved the composition root (bootFloor, including this construction)
  // out of index.ts into src/main/floor/boot.ts; the call itself is unchanged.
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/floor/boot.ts'), 'utf8');

  const at = src.indexOf('new HookServer(');
  assert.ok(at > 0, 'src/main/floor/boot.ts no longer constructs a HookServer at all');
  assert.equal(src.indexOf('new HookServer(', at + 1), -1,
    'a SECOND HookServer construction appeared — this pin only guards the first');

  // Sliced to that call's own argument list before matching.
  const args = src.slice(at, src.indexOf('\n);', at));
  assert.match(args, /recordCostSample/,
    'proxy-tier spend never reaches getAgentUsage — FLOOR-09 (#19) is open, and the budget cap that reads it is a false cap');

  // ...and it is a real sink, not a placeholder that satisfies the grep while
  // dropping every sample on the floor.
  const line = args.split('\n').find((l) => l.includes('recordCostSample'));
  assert.doesNotMatch(line, /^\s*(\/\/|\/\*)/,
    'the cost sink is commented out — FLOOR-09 (#19) is open');
  assert.doesNotMatch(line, /=>\s*(\{\s*\}|undefined|null)/,
    'the cost sink is a stub — proxy-tier spend is accepted and discarded, which is worse than no cap');
});

// ─── FLOOR-04 (#10, defect 5): a secret an agent writes must not reach history ──
//
// The hive's committer is a bare `git add -A` over an agent's workspace, so a
// token an agent echoes into memory.md was in git history forever — and git
// history is durable and hard to redact after the fact. scrubStagedSecrets()
// runs the staged diff through redactSecrets between `add -A` and `commit`,
// inside flushCommit, which ADR-0004's single-committer model makes the one
// place every hive write reaches git through.
//
// These drive a REAL git against a real temp repo — no `git` is mocked or faked
// anywhere below — because the claim being made is about what `git log -p`
// contains, and a fake git cannot be wrong in the way a real one can.

const { spawnSync } = require('node:child_process');

/** Real git in the hive root. Never a fake: the assertion is about history. */
const gitIn = (root, ...args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed in ${root}: ${r.stderr}`);
  return r.stdout;
};

// Synthetic credentials. Every one is filler — no account has ever issued these.
/** Matches redactSecrets pattern 3 (the sk-ant- provider prefix). */
const CAUGHT_SECRET = 'sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJ';
/** The SAME key material as CAUGHT_SECRET with `_` where it has `-`. Pattern 3
 *  anchors on a literal `sk-`, so this used to be missed — one character was the
 *  whole gap. It is CAUGHT now, by pattern 6's two arms, which run after pattern
 *  5 so they cannot subtract from anything patterns 1-5 already redacted. The
 *  name is kept: it is what the ceiling test below asserts about, and renaming it
 *  would break the only line that records why this shape has a test at all.
 *  Underscore-separated keys are not hypothetical — Stripe ships
 *  `sk_live_…`. Do NOT "improve" this into a literal Stripe key: a realistic one
 *  here trips GitHub push protection (measured — it blocked this very file with
 *  `GH013 … Stripe API Key`) and the only ways forward are weakening the repo's
 *  secret-scanning posture or not pushing at all. */
const MISSED_SECRET = 'sk_ant_api03_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJ';

test('a secret an agent writes into its workspace never reaches the hive git history (FLOOR-04)', async (t) => {
  const { hive, root } = floor(t);
  await hive.ensureAgent(agent('dwight'));
  const dir = path.join(root, 'agents', 'dwight');

  // What the audit describes: a key pasted into an agent-written file.
  fs.writeFileSync(path.join(dir, 'notes.md'), `the key is ${CAUGHT_SECRET}\n`, 'utf8');
  await hive.flushCommit(root); // the real debounced commit body, driven synchronously

  const history = gitIn(root, 'log', '-p');
  assert.equal(history.includes(CAUGHT_SECRET), false,
    'the secret is in `git log -p` of the hive. Git history is durable and replicated to every '
    + 'clone and every backup, so this is a permanent disclosure that no later commit undoes');

  // The file itself is untouched — the scrub unstages, it does not edit or delete
  // an agent's work. Anything else would make the fix a data-loss path of its own.
  assert.match(fs.readFileSync(path.join(dir, 'notes.md'), 'utf8'), /the key is sk-ant-/,
    "the scrub rewrote or deleted the agent's file — it must only drop it from the INDEX");
});

test('the scrub drops the offending path only — the rest of the commit still lands (FLOOR-04)', async (t) => {
  const { hive, root } = floor(t);
  await hive.ensureAgent(agent('dwight'));
  const dir = path.join(root, 'agents', 'dwight');

  fs.writeFileSync(path.join(dir, 'notes.md'), `the key is ${CAUGHT_SECRET}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, 'plan.md'), 'ship the paper order\n', 'utf8');
  await hive.flushCommit(root);

  const history = gitIn(root, 'log', '-p');
  assert.ok(history.trim().length > 0,
    'nothing was committed at all — a scrub that suppresses the whole commit has traded a '
    + 'disclosure for silent history loss, which is the failure this file exists to catch');
  assert.match(history, /ship the paper order/,
    'the clean file was dropped along with the dirty one — the scrub must be per-path');
  assert.equal(history.includes(CAUGHT_SECRET), false, 'the secret rode in on the same commit');

  // The harness's OWN generated shims must still be versioned. Both embed
  // `payload.sock_token = process.env.HIVE_SOCK_TOKEN`, which pattern 5 matches
  // on sight, so if harnessAuthored() ever stops recognising them the hive
  // unstages its own bootstrap on every commit and the warning above becomes
  // noise an operator learns to ignore.
  assert.match(history, /bin\/cth-hook\.cjs/,
    "the hive unstaged its own hook shim — redactSecrets matches the shim's own "
    + 'HIVE_SOCK_TOKEN line, and harnessAuthored() is what keeps that from crying wolf forever');
  assert.match(history, /bin\/hive-proxy\.cjs/, 'the hive unstaged its own proxy shim');
});

test('a scrubbed commit is announced on the durable hive log, not silently altered (FLOOR-04)', async (t) => {
  const { hive, root } = floor(t);
  await hive.ensureAgent(agent('dwight'));
  fs.writeFileSync(path.join(root, 'agents', 'dwight', 'notes.md'), `key=${CAUGHT_SECRET}\n`, 'utf8');
  await hive.flushCommit(root);

  const scrubbed = hive.logTail().filter((e) => e.kind === 'secret-scrubbed');
  assert.equal(scrubbed.length, 1,
    'the commit was altered with nothing on the record. An operator who cannot tell that a file '
    + 'was withheld will not know a credential is sitting in the workspace waiting to be committed');
  assert.equal(scrubbed[0].path, 'agents/dwight/notes.md',
    'the log names no path, so the operator is told something was scrubbed but not what');
});

test('FLOOR-04 ceiling: the control is BOUNDED — what it catches, and the shapes it provably does not (FLOOR-04)', async (t) => {
  const { hive, root } = floor(t);
  await hive.ensureAgent(agent('dwight'));
  const dir = path.join(root, 'agents', 'dwight');

  // This pins the HONEST LIMIT of a bounded matcher, so the ceiling is a measured
  // fact rather than a promise in a doc. It is deliberately NOT a bug report: the
  // project trusts exactly ONE pattern set (redactSecrets, shared with the mail path
  // under a LOCKSTEP contract with test/voice-messages.test.cjs), and two matchers
  // that disagree is a worse position than one imperfect one because the disagreement
  // is silent. If this test goes red because a pattern grew to cover one of these,
  // that is the ceiling moving UP — update it, do not narrow the matcher back.
  //
  // MEASUREMENT UNAVAILABLE without an operator: FLOOR-04's optional live clause —
  // a fake key dropped into a LIVE agent's workspace and committed by the running
  // hive. Everything below drives a real git against a real temp repo, which is not
  // the same thing and is not claimed to be.

  // (1) The unlabelled UNDERSCORE-spelled vendor key. It used to reach history; the
  //     two arms that run after pattern 5 catch it now.
  fs.writeFileSync(path.join(dir, 'underscore-key.md'), `${MISSED_SECRET}\n`, 'utf8');
  // (2) Quoted-key JSON — a RECORDED RESIDUAL, not an oversight. Pattern 5 needs the
  //     `:`/`=` directly after the key name and the closing quote is in the way. An
  //     arm for it was built and MEASURED: it gains 2 detections and costs 2 of the
  //     12 demonstrated false positives (`"api_key": "$OPENAI_API_KEY"` and
  //     `"secret": "REPLACE_ME"`), and a false positive here is not over-redaction —
  //     scrubStagedSecrets calls unstagePath, so the file never reaches history at
  //     all and the log line is indistinguishable from a real catch. +2 detections do
  //     not buy 2 permanent unstages. This arm exists so nobody can re-add it quietly.
  fs.writeFileSync(path.join(dir, 'creds.json'), '{"token": "abcdef123456789"}\n', 'utf8');
  // (3) POSITIVE CONTROL — a benign marker in the same commit. Without it this test
  //     could pass by the scrub suppressing the commit or flushCommit becoming a no-op.
  fs.writeFileSync(path.join(dir, 'marker.md'), 'ceiling positive control marker\n', 'utf8');
  // (4) SPECIFICITY — ordinary tracked source that the matcher must NOT touch. The
  //     two desk ids are byte-copied from tools/mapgen/build_map.py, which the old
  //     matcher unstaged from every commit that touched it. Without this arm the file
  //     measures specificity zero times, and every regression this change risks is a
  //     specificity failure.
  fs.writeFileSync(path.join(dir, 'ordinary.md'),
    'const task_scheduler_interval_ms = 5;\n'
    + '{"maxTokens": 200000, "debug": true}\n'
    + "    'desk-team-lead': grid[6], 'desk-backend-engineer': grid[7],\n"
    + "    'desk-project-manager': grid[10], 'desk-market-researcher': grid[11],\n", 'utf8');
  await hive.flushCommit(root);

  const history = gitIn(root, 'log', '-p');
  // Every arm is evaluated before anything throws. A ceiling test that stops at its
  // first failure reports one number when four moved, and the three it hides are
  // exactly the ones a reviewer needs to see.
  const problems = [];
  const check = (ok, msg) => { if (!ok) problems.push(msg); };

  check(!history.includes(MISSED_SECRET),
    'SENSITIVITY: an UNLABELLED underscore-spelled vendor key reached git history. The two arms '
    + 'that run after pattern 5 are what catch it — if they were narrowed or moved, mirror the '
    + 'change in test/voice-messages.test.cjs and re-run the whole REGRESSION battery first');
  check(/"token": "abcdef123456789"/.test(history),
    'CEILING: redactSecrets now catches quoted-key JSON. Before treating that as a win, re-measure '
    + 'the 12 demonstrated false positives — the arm that does this was rejected because it '
    + 'unstages "api_key": "$OPENAI_API_KEY" and "secret": "REPLACE_ME" FOREVER, not because it '
    + 'did not work');
  check(/ceiling positive control marker/.test(history),
    'POSITIVE CONTROL: the marker never reached history — the commit itself did not land, so '
    + 'every other assertion in this test would have passed vacuously');
  for (const survivor of [
    'const task_scheduler_interval_ms = 5;',
    '{"maxTokens": 200000, "debug": true}',
    'desk-backend-engineer',
    'desk-market-researcher'
  ]) {
    check(history.includes(survivor),
      `SPECIFICITY: ordinary source was unstaged: ${survivor}. scrubStagedSecrets does not `
      + 'over-redact on a false positive — it drops the whole path from the commit, permanently, '
      + "and the agent's work never reaches history");
  }
  assert.deepEqual(problems, [], `FLOOR-04 ceiling, ${problems.length} arm(s) moved:\n  - ${problems.join('\n  - ')}`);

  // ...and the shape it DOES know still does not get through, in the same commit,
  // so this test can never pass by the scrub being switched off wholesale.
  fs.writeFileSync(path.join(dir, 'anthropic.md'), `${CAUGHT_SECRET}\n`, 'utf8');
  await hive.flushCommit(root);
  assert.equal(gitIn(root, 'log', '-p').includes(CAUGHT_SECRET), false,
    'the scrub is off entirely — this ceiling test would then pass vacuously for the wrong reason');
});

// ── Plan 03-02: spawnedAt — "up" means since THIS PTY, never cumulative ──────
//
// SCALE-05's card shows how long an agent has been up. There was no timestamp to
// derive it from, and the tempting fix — letting `...prev` carry the field
// forward the way it deliberately carries `sessionId` — is wrong: a respawn IS a
// new terminal, so a preserved stamp would quietly report uptime across a crash
// and a restart. Driven through the real `ensureAgent` rather than asserted
// against the source, because "the field is spelled correctly in the upsert" and
// "the field advances on respawn" are different claims and only the second one
// is the behaviour.
test('03-02: ensureAgent stamps spawnedAt, and a RESPAWN advances it', async (t) => {
  const { hive } = floor(t);
  const before = Date.now();
  await hive.ensureAgent(agent('pam'));
  const first = hive.registry().agents.pam.spawnedAt;

  assert.equal(typeof first, 'number', 'ensureAgent recorded no spawnedAt — the card has no clock to read');
  assert.ok(first >= before && first <= Date.now(),
    `spawnedAt (${first}) is outside the window this spawn actually happened in`);

  // A session id is the CONTRAST: `...prev` is meant to preserve that one.
  hive.recordSession('pam', 'sid-first-run');
  assert.equal(hive.registry().agents.pam.sessionId, 'sid-first-run');

  await new Promise((r) => setTimeout(r, 5)); // clear the ms tick
  await hive.ensureAgent(agent('pam'));
  const second = hive.registry().agents.pam.spawnedAt;

  assert.ok(second > first,
    `spawnedAt did not advance on respawn (${first} -> ${second}) — it is being carried forward by the `
    + '`...prev` spread, so the card would report uptime accumulated across a crash and a restart');
  assert.equal(hive.registry().agents.pam.sessionId, 'sid-first-run',
    'the respawn also wiped sessionId — spawnedAt must reset WITHOUT disturbing the field `...prev` is '
    + 'deliberately preserving (the --resume key)');
});

// ── SCALE-03 — SQL answers the time range the 64 KB tail read cannot ────────
//
// The H3 case above pins the tail window as a BOUND. This one pins what the
// bound costs, and what now survives it. `logTail` reads the last
// LOG_TAIL_BYTES of log.jsonl, so on any floor busier than a few hundred
// kilobytes a day the morning is simply unreachable — that is the wall SCALE-03
// exists to get past, and it is a READ cap, not the 8 MB rotate the roadmap
// blamed. RECORD-02's mirror puts the same events in SQLite, where a day is a
// range scan; this drives BOTH stores over the same fixture and asserts they
// disagree in exactly the way that makes the mirror worth having.
//
// Sized from the real exported constant. A hardcoded 64 * 1024 here would keep
// passing after someone widened the window, while proving nothing.

test('SCALE-03: the morning falls out of logTail\'s window but stays readable in SQLite', (t) => {
  const { hive, root } = floor(t);
  // The DB gets its OWN temp dir, not the harness home. On Windows an open
  // SQLite handle (plus its -wal/-shm) makes `rmSync` throw EPERM, and `floor`
  // registered its cleanup first — so a shared dir fails the test in teardown
  // no matter what the assertions found.
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hive-timeline-'));
  const store = new PersistStore(path.join(dbDir, 'harness.db'));
  store.open();
  t.after(() => { store.close(); fs.rmSync(dbDir, { recursive: true, force: true }); });

  // NEGATIVE CONTROL, before any wiring: an event appended with no store must
  // not appear in SQLite. Without this the assertions below would also pass if
  // rows were arriving by some path other than the sink under test.
  const MORNING = Date.UTC(2026, 0, 15, 9, 0, 0);
  hive.appendLog({ kind: 'pre-wiring', ts: MORNING - 10 });
  assert.equal(store.eventsBetween(MORNING - 100, MORNING).length, 0,
    'a row reached the events table before setEventStore was ever called — this driver is not '
    + 'measuring the sink it claims to measure');

  // Wired EXACTLY as floor/boot.ts wires it, immediately after persist.open().
  hive.setEventStore(store);

  // The earliest hour: five events carrying their own timestamps, so the window
  // asserted below is deterministic rather than a race against the wall clock.
  for (let i = 0; i < 5; i++) hive.appendLog({ kind: 'daybreak', ts: MORNING + i, i });

  // Then a day's worth of traffic — enough to push those five past the read cap.
  const pad = 'p'.repeat(4096);
  for (let i = 0; Buffer.byteLength(pad) * i <= LOG_TAIL_BYTES * 2; i++) {
    hive.appendLog({ kind: 'noise', i, pad });
  }

  const size = fs.statSync(path.join(root, 'log.jsonl')).size;
  assert.ok(size > LOG_TAIL_BYTES,
    `the fixture is ${size} bytes and LOG_TAIL_BYTES is ${LOG_TAIL_BYTES} — it must exceed the read `
    + 'cap or this test proves nothing at all');

  // 1. The JSONL tail read, at any n: the morning is GONE. Not truncated with a
  //    marker, not paged — absent, with the read reporting success.
  const tail = hive.logTail(1_000_000);
  assert.equal(tail.some((e) => e.kind === 'daybreak'), false,
    'logTail still sees the morning, so the fixture never cleared the window and the SQL half '
    + 'below is being compared against nothing');
  assert.ok(tail.some((e) => e.kind === 'noise'), 'logTail returned nothing at all — it is broken, not bounded');

  // 2. The SQL range read over the same five milliseconds: all five, by content.
  const early = store.eventsBetween(MORNING, MORNING + 5);
  assert.equal(early.length, 5,
    `the events table returned ${early.length} of the 5 morning events that logTail can no longer `
    + 'reach. This is the whole requirement: a time range the 64 KB tail read cannot answer.');
  assert.deepEqual(early.map((e) => JSON.parse(e.json).i), [0, 1, 2, 3, 4],
    'the rows came back, but not the right ones — assert by content, because a count looks '
    + 'identical whether the morning is there or the noise merely happened to land in the window');
  assert.equal(store.earliestEventTs(), MORNING,
    'firstTs must name the earliest event the STORE holds — 03-07 draws its gap marker from it');
});

// ── SCALE-03 — the two halves actually fit ──────────────────────────────────
//
// `test/timeline.test.cjs` proves the arithmetic against hand-built rows.
// `hive:timeline` cannot be loaded by any test here, so the ONE thing neither
// covers is whether the real producers' row shapes match what the pure module
// consumes: `eventsBetween` returns `{id, ts, kind, json}` and `dailyCostRows`
// returns `{ts, agentId, taskId, usd, tokens}`. A mismatch in either would
// return a perfectly well-formed response full of zeroes — the feature existing
// and doing nothing — and every grep and every unit test above would stay green.
//
// So this drives the handler's exact composition end to end: real HiveManager,
// real PersistStore, real ledger file, real timeline.ts.

test('SCALE-03: the real event + cost producers feed timeline.ts without a shape mismatch', (t) => {
  const { hive, home } = floor(t);
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hive-e2e-'));
  const store = new PersistStore(path.join(dbDir, 'harness.db'));
  store.open();
  t.after(() => { store.close(); fs.rmSync(dbDir, { recursive: true, force: true }); });
  hive.setEventStore(store);

  const DAY_START = new Date(2026, 0, 15).getTime();     // local midnight, as parseDayParam resolves it
  const DAY_END = DAY_START + 24 * 60 * 60 * 1000;
  const B0 = DAY_START;                                   // bucket 0  — 00:00
  const B40 = DAY_START + 40 * 15 * 60 * 1000;            // bucket 40 — 10:00

  // Events through the REAL appendLog, so they take the real mirror path.
  hive.appendLog({ kind: 'spawn', ts: B0 + 1000, agentId: 'jim-1' });
  hive.appendLog({ kind: 'message', ts: B0 + 2000, from: 'jim-1', to: 'pam-1' });
  hive.appendLog({ kind: 'message', ts: B40 + 1000, from: 'pam-1', to: 'jim-1' });

  // Cost through the real ledger file, cumulative as every row is.
  const raw = (sessionId, taskId, ts, tokens, usd) => JSON.stringify({
    agent_id: 'jim-1', session_id: sessionId, task_id: taskId, ts,
    input: tokens, output: 0, cache_read: 0, cache_creation: 0, model: 'claude-x', usd
  }) + '\n';
  fs.writeFileSync(path.join(home, 'hive', 'cost-ledger.jsonl'), [
    raw('s1', 't-1', B0 + 500, 100, 1.00),   // series opens → +100 / +1.00, bucket 0
    raw('s1', 't-1', B0 + 1500, 100, 1.00),  // no movement  → zero-delta, dropped from detail
    raw('s1', 't-1', B40 + 500, 260, 2.60)   // 260 − 100    → +160 / +1.60, bucket 40
  ].join(''));

  // EXACTLY what the hive:timeline handler does, in the same order.
  const events = store.eventsBetween(DAY_START, DAY_END);
  const costRows = hive.dailyCostRows(DAY_START, DAY_END);
  const res = summarizeDay(events, costRows, DAY_START, store.earliestEventTs());

  assert.equal(res.ok, true);
  assert.equal(res.buckets.length, 96);
  assert.equal(res.buckets[0].events, 2, `bucket 0 counted ${res.buckets[0].events} events. 0 means `
    + 'eventsBetween\'s row shape does not reach summarizeDay — the response would be 96 well-formed '
    + 'empty buckets over a day that really did have traffic');
  assert.equal(res.buckets[0].envelopes, 1, 'the envelope filter never saw a real kind field');
  assert.equal(res.buckets[40].events, 1);
  assert.equal(res.buckets[40].envelopes, 1);
  assert.equal(res.buckets[0].tokens, 100, `bucket 0 read ${res.buckets[0].tokens} tokens. 0 means `
    + 'dailyCostRows\' row shape does not reach summarizeDay; 200 means the zero-delta second '
    + 'snapshot was SUMMED instead of diffed.');
  assert.equal(res.buckets[40].tokens, 160, 'bucket 40 must carry the DIFF, not the 260 snapshot');
  assert.equal(Number(res.buckets[40].usd.toFixed(2)), 1.60);
  assert.equal(res.firstTs, B0 + 1000, 'firstTs did not come from the store');
  assert.equal(res.eventsAgedOut, false, 'the events table can speak to this day');

  // And the detail path, over the bucket whose cost row was a no-op.
  const detail = bucketDetail(events, costRows, 0, DAY_START);
  assert.equal(detail.ok, true);
  assert.deepEqual(detail.rows.map((r) => r.type), ['cost', 'event', 'event'],
    'the merged list is one sort across both real sources; the zero-delta row at +1500 must be '
    + 'absent, which is what makes this three rows and not four');
  assert.equal(detail.total, 3);
  assert.equal(detail.truncated, false);
});
