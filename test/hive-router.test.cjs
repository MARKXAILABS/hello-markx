'use strict';

/**
 * The router's own test — it never had one.
 *
 * RESEARCH §3.1 ran routeOnce() against unmodified source and it returned 1:
 * this is not a test the hive.ts split enabled, it is a test that did not
 * exist (D-07 / T-P02-01-05). `startRouter`/`stopRouter`/`routeOnce` stayed
 * put in hive.ts (they own no separable state), but nothing in this repo had
 * ever exercised them until now.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

/** A throwaway harness home with a live hive in it, realpath'd so macOS's
 *  /var -> /private/var symlink doesn't turn every assertion here into a
 *  symlink test by accident (main-hardening.test.cjs:22-26's pattern). Model
 *  is hive-durability.test.cjs:29-36's floor(). */
function floor(t) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-hive-router-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  return { hive, home, root: path.join(home, 'hive') };
}

const agent = (id, extra = {}) => ({ id, name: id, cwd: os.tmpdir(), capabilities: [], ...extra });
const inbox = (root, id) => path.join(root, 'agents', id, 'inbox');
const outbox = (root, id) => path.join(root, 'agents', id, 'outbox');
const messagesIn = (dir) =>
  (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

/** A full HiveMessage, hand-written the way an agent actually produces one:
 *  a JSON file dropped straight into its own outbox/, never through
 *  hive.send(). routeOnce() is what drains this — send() has its own tests
 *  already (hive-durability.test.cjs), this file's job is the drain path. */
function writeOutboxMessage(root, fromId, overrides = {}) {
  const msg = {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    conversation: 'conv-router-test',
    in_reply_to: null,
    from: fromId,
    to: 'michael',
    act: 'inform',
    subject: 'status',
    body: 'reception is quiet today',
    hops: 0,
    requires_reply: false,
    needs_human: false,
    created_at: new Date().toISOString(),
    ...overrides
  };
  const file = path.join(outbox(root, fromId), `${msg.id}.json`);
  fs.writeFileSync(file, JSON.stringify(msg), 'utf8');
  return { msg, file };
}

test('routeOnce drains a hand-written outbox message into the recipient inbox and archives the source', async (t) => {
  const { hive, root } = floor(t);
  await hive.ensureAgent(agent('michael', { isGod: true }));
  await hive.ensureAgent(agent('pam'));

  const { file } = writeOutboxMessage(root, 'pam');

  const routed = hive.routeOnce();
  assert.equal(routed, 1, 'routeOnce reports exactly one message routed');

  const delivered = messagesIn(inbox(root, 'michael'));
  assert.equal(delivered.length, 1, 'the message landed in the recipient inbox/');
  assert.equal(delivered[0].body, 'reception is quiet today');
  assert.equal(delivered[0].from, 'pam', 'from is authoritative from the owning outbox directory');

  assert.equal(fs.existsSync(file), false, 'the source file no longer sits in outbox/');
  const archived = fs.readdirSync(path.join(outbox(root, 'pam'), '.sent'));
  assert.equal(archived.length, 1, 'the source is archived under outbox/.sent/, not deleted');
});

test('startRouter schedules routeOnce on an interval and stopRouter clears it', async (t) => {
  const { hive, root } = floor(t);
  await hive.ensureAgent(agent('michael', { isGod: true }));
  await hive.ensureAgent(agent('pam'));
  // startRouter's setInterval is NOT unref'd (RESEARCH Pitfall 3) — without
  // this cleanup node --test hangs waiting for a timer that never fires
  // usefully again once the test process is otherwise done.
  t.after(() => hive.stopRouter());

  writeOutboxMessage(root, 'pam');

  hive.startRouter(20); // short interval — this test drives it, not a real deployment cadence
  await new Promise((resolve) => setTimeout(resolve, 200));

  const deliveredWhileRunning = messagesIn(inbox(root, 'michael'));
  assert.equal(deliveredWhileRunning.length, 1, 'the router timer drained the outbox on its own, unattended');

  hive.stopRouter();
  // A second outbox message written AFTER stopRouter must never be routed —
  // proving the interval was actually cleared, not merely a coincidence of
  // there being nothing left to route.
  writeOutboxMessage(root, 'pam', { subject: 'should not route' });
  await new Promise((resolve) => setTimeout(resolve, 150));

  const deliveredAfterStop = messagesIn(inbox(root, 'michael'));
  assert.equal(deliveredAfterStop.length, 1, 'no further routing happens once stopRouter has run');
});

// ─── D-11 gap 1: the terminal-handoff dep, headless (`emit` always false) ──

/** `emit: () => false` — exactly what a headless floor's renderer emitter
 *  returns (no window to send to). If `handoff` alone routes correctly with
 *  `emit` never delivering, the mail is provably not depending on a window. */
function headlessFloor(t, handoff) {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-hive-router-handoff-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home, () => false, handoff);
  hive.ensureHive();
  return { hive, home, root: path.join(home, 'hive') };
}

test('D-11: a hookless agent\'s mail is handed off, not bounced, when handoff accepts it', async (t) => {
  const calls = [];
  const { hive, root } = headlessFloor(t, (order) => { calls.push(order); return true; });
  await hive.ensureAgent(agent('michael', { isGod: true }));
  // kimi: canReceiveInbox: false (src/shared/agentProvider.ts) — the hookless
  // branch this task's D-11 gap 1 fix targets.
  await hive.ensureAgent(agent('worker', { provider: 'kimi' }));

  hive.send({ to: 'worker', act: 'inform', subject: 'do the thing', body: 'go' }, 'michael');

  assert.equal(calls.length, 1, 'handoff was not called exactly once');
  assert.equal(calls[0].to, 'worker', 'handoff was called with the wrong target');
  const godInbox = messagesIn(inbox(root, 'michael'));
  const bounces = godInbox.filter((m) => m.subject.includes('[undeliverable'));
  assert.equal(bounces.length, 0,
    'a handoff that main accepted must not ALSO bounce to god — that would be the double-delivery '
    + 'D-11\'s fix exists to prevent');
});

test('D-11: a hookless agent\'s mail bounces to god, with a true cause, when handoff refuses it', async (t) => {
  const { hive, root } = headlessFloor(t, () => false);
  await hive.ensureAgent(agent('michael', { isGod: true }));
  await hive.ensureAgent(agent('worker', { provider: 'kimi' }));

  hive.send({ to: 'worker', act: 'inform', subject: 'do the thing', body: 'go' }, 'michael');

  const godInbox = messagesIn(inbox(root, 'michael'));
  const bounces = godInbox.filter((m) => m.subject.includes('[undeliverable'));
  assert.equal(bounces.length, 1, 'a refused handoff must bounce to god exactly once');
  assert.doesNotMatch(bounces[0].subject, /renderer unavailable/,
    'the bounce subject still blames "renderer unavailable" — that stopped being the true cause '
    + 'once main, not the renderer, is the thing refusing the handoff');
});
