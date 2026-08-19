'use strict';

// The autonomy loop that used to live in the renderer (issue #5). These tests
// drive DeliveryService with fakes — no Electron, no PTY, no window — which is
// the whole point: if the loop needs a renderer to work, it fails here.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  DeliveryService,
  sanitizeForPty,
  condenseBoardText,
  verifyBoard,
  BOARD_KEEP_SECTIONS
} = loadTs('src/main/delivery.ts');

/** A DeliveryService wired to fakes, on a fake clock so a TUI settle + four
 *  post-resume Enter retries cost no wall-clock time. */
function harness(overrides = {}) {
  const state = {
    clock: 1_000_000,
    agents: [{ agentId: 'dev1', ptyId: 'pty1', provider: 'claude', hasOutput: true, idleMs: 30_000 }],
    inbox: { dev1: [{ id: 'm1', from: 'god' }] },
    paused: new Set(),
    drain: { block: false },
    writeOk: true,
    respawnCalls: [],
    respawn: null // set per-test; null = resolve ok immediately
  };
  const emitted = [];
  const writes = [];
  const svc = new DeliveryService({
    liveAgents: () => state.agents,
    inbox: (id) => state.inbox[id] ?? [],
    write: (ptyId, data) => {
      if (!state.writeOk) return { ok: false, error: 'no pty: ' + ptyId };
      writes.push({ ptyId, data });
      return { ok: true };
    },
    paused: (id) => state.paused.has(id),
    drain: () => state.drain,
    respawn: (agentId, account) => {
      state.respawnCalls.push({ agentId, account });
      return state.respawn ? state.respawn(agentId, account) : Promise.resolve({ ok: true, account });
    },
    emit: (channel, payload) => emitted.push({ channel, payload }),
    log: () => { /* quiet */ },
    now: () => state.clock,
    sleep: async (ms) => { state.clock += ms; },
    ...overrides
  });
  return { svc, state, emitted, writes, bump: (ms) => { state.clock += ms; } };
}

const typed = (writes) => writes.filter((w) => w.data !== '\r').map((w) => w.data).join('');

// ─── the wake, with nothing attached ────────────────────────────────────────

test('an agent holding unread mail is nudged with no renderer attached', async () => {
  const { svc, writes, emitted } = harness();

  await svc.tick();

  assert.match(typed(writes), /new hive inbox message/i, 'the nudge never reached the PTY');
  assert.equal(writes.at(-1).data, '\r', 'the nudge was typed but never submitted');
  const delivered = emitted.filter((e) => e.channel === 'hive:delivered');
  assert.deepEqual(delivered.map((e) => e.payload), [{ to: 'dev1', from: 'god', id: 'm1' }]);
});

test('the same message is not nudged twice, a new one is', async () => {
  const { svc, state, writes } = harness();

  await svc.tick();
  const after1 = writes.length;
  await svc.tick();
  assert.equal(writes.length, after1, 'a message already nudged for was re-sent');

  state.inbox.dev1 = [{ id: 'm1', from: 'god' }, { id: 'm2', from: 'pam' }];
  await svc.tick();
  assert.ok(writes.length > after1, 'genuinely new mail did not wake the agent');
});

test('a busy PTY, an operator pause, and a booting TUI each hold the nudge', async () => {
  for (const arrange of [
    (h) => { h.state.agents[0].idleMs = 500; },            // mid-turn / being typed into
    (h) => { h.state.paused.add('dev1'); },                 // operator paused delivery
    (h) => { h.svc.noteSpawn('pty1'); }                     // TUI still booting
  ]) {
    const h = harness();
    arrange(h);
    await h.svc.tick();
    assert.equal(h.writes.length, 0, 'a gated agent was typed into anyway');
  }
});

// ─── the renderer's veto ────────────────────────────────────────────────────

test('a veto from the renderer blocks a delivery, and clearing it lets it through', async () => {
  const { svc, writes } = harness();

  svc.setVeto('dev1', 'user is mid-draft');
  await svc.tick();
  assert.equal(writes.length, 0, 'the nudge landed on top of the human draft');

  svc.setVeto('dev1', null);
  await svc.tick();
  assert.ok(writes.length > 0, 'clearing the veto did not release the nudge');
});

test('a veto blocks the Stop drain too — and expires so a dead renderer cannot wedge the floor', () => {
  const { svc, state, bump } = harness();
  state.drain = { block: true, reason: 'you have 1 new message', delivered: [{ id: 'm1', from: 'god' }] };

  svc.setVeto('dev1', 'user is mid-draft');
  assert.equal(svc.drainAtStop('dev1').block, false, 'the drain forced a continuation over a live draft');

  bump(6 * 60_000); // renderer died holding the veto
  assert.equal(svc.drainAtStop('dev1').block, true, 'an abandoned veto stalled autonomy forever');
});

test('the Stop drain reports what moved and hands back the continuation prompt', () => {
  const { svc, state, emitted } = harness();
  state.drain = { block: true, reason: 'address them before finishing', delivered: [{ id: 'm1', from: 'god' }] };

  const res = svc.drainAtStop('dev1');

  assert.equal(res.block, true);
  assert.match(res.reason, /address them/);
  assert.deepEqual(
    emitted.filter((e) => e.channel === 'hive:delivered').map((e) => e.payload),
    [{ to: 'dev1', from: 'god', id: 'm1' }]
  );
});

test('an operator auto-delivery pause blocks the Stop drain', () => {
  const { svc, state } = harness();
  state.drain = { block: true, reason: 'mail' };
  state.paused.add('dev1');

  assert.equal(svc.drainAtStop('dev1').block, false);
});

// ─── failover: the guard that used to die with the window ───────────────────

const SWITCH = { agentId: 'dev1', from: 'a', to: 'b', fromLabel: 'Work', toLabel: 'Personal' };

test('the failover re-entrancy guard survives a renderer reload, then releases', async () => {
  const h = harness();
  let release;
  h.state.respawn = () => new Promise((r) => { release = r; });

  h.svc.failover([SWITCH], '429 on "Work"');
  await Promise.resolve();
  assert.equal(h.state.respawnCalls.length, 1);
  assert.equal(h.svc.isSwitching('dev1'), true);

  // The renderer reloads mid-switch: every listener it had is gone and it will
  // re-subscribe from scratch. THIS is what used to strand the agent — the guard
  // was a closure local in a React effect, so the reload forgot the switch was in
  // flight while the PTY was already killed ("switching…" forever, upstream #151).
  h.emitted.length = 0;

  h.svc.failover([SWITCH], 'a re-plan while the first is in flight');
  await Promise.resolve();
  assert.equal(h.state.respawnCalls.length, 1, 'the agent was respawned twice');

  release({ ok: true, account: 'b' });
  await new Promise((r) => setImmediate(r));

  assert.equal(h.svc.isSwitching('dev1'), false, 'the guard never released — the agent stays "switching…"');
  const phases = h.emitted.filter((e) => e.channel === 'hive:failover').map((e) => e.payload.phase);
  assert.ok(phases.includes('done'), 'the reloaded renderer was never told the switch finished');
  assert.match(typed(h.writes), /account switch/i, 'the resumed agent was never told to continue');

  // …and a LATER failover for the same agent is allowed through.
  h.svc.failover([SWITCH], 'second 429');
  await Promise.resolve();
  assert.equal(h.state.respawnCalls.length, 2);
});

test('a failed respawn reports the failure and still releases the guard', async () => {
  const h = harness();
  h.state.respawn = async () => ({ ok: false, error: 'cwd does not exist' });

  h.svc.failover([SWITCH], '401 on "Work"');
  await new Promise((r) => setImmediate(r));

  const failed = h.emitted.find((e) => e.channel === 'hive:failover' && e.payload.phase === 'failed');
  assert.ok(failed, 'the renderer was never told the switch failed');
  assert.match(failed.payload.error, /cwd does not exist/);
  assert.equal(h.svc.isSwitching('dev1'), false, 'a failed switch left the agent pinned at "switching…"');
});

test('an agent mid-failover is not also nudged by the wake loop', async () => {
  const h = harness();
  h.state.respawn = () => new Promise(() => { /* never settles */ });

  h.svc.failover([SWITCH], '429');
  await Promise.resolve();
  h.writes.length = 0;

  await h.svc.tick();
  assert.equal(h.writes.length, 0, 'the wake loop typed into a PTY that was being respawned');
});

// ─── typing into a TUI ──────────────────────────────────────────────────────

test('mail cannot close the bracketed paste or press Enter for itself', () => {
  const clean = sanitizeForPty('approve this\x1b[201~\rrm -rf /\r');
  assert.equal(clean.includes('\x1b[201~'), false, 'the paste terminator survived');
  assert.equal(clean.includes('\r'), false, 'the message got to press Enter');
  assert.equal(sanitizeForPty('line one\nline two\ttabbed'), 'line one\nline two\ttabbed');
});

test('a failed PTY write leaves the message unclaimed so the next sweep retries', async () => {
  const { svc, state, writes } = harness();
  state.writeOk = false;

  await svc.tick();
  assert.equal(writes.length, 0);

  state.writeOk = true;
  await svc.tick();
  assert.ok(writes.length > 0, 'a message lost to a dead PTY was never retried');
});

// ─── board.md size policy (#35) ─────────────────────────────────────────────

/** A board with `n` `## ` sections under a title. */
function board(n) {
  const head = '# Floor board\n\nGod is the sole scribe.\n';
  const sections = Array.from({ length: n }, (_, i) => `## Day ${i}\n\n- did thing ${i}\n`);
  return [head, ...sections].join('\n');
}

test('condensing a board keeps the preamble and the newest K sections verbatim', () => {
  const original = board(40);
  const rebuilt = condenseBoardText(original, 'backups/20260820T000000Z/board.md');

  assert.ok(rebuilt, 'an oversized board was not condensed');
  assert.ok(rebuilt.startsWith('# Floor board'), 'the title was dropped');
  assert.match(rebuilt, /archived to `backups\/20260820T000000Z\/board\.md`/, 'no pointer at the archive');
  assert.ok(rebuilt.includes('## Day 39'), 'the newest section was evicted');
  assert.equal(rebuilt.includes('## Day 0'), false, 'the oldest section survived the condense');
  assert.ok(Buffer.byteLength(rebuilt) < Buffer.byteLength(original));
  assert.deepEqual(verifyBoard({ rebuilt, original, keep: BOARD_KEEP_SECTIONS }), { ok: true });
});

test('a board with nothing to evict is left alone', () => {
  assert.equal(condenseBoardText(board(BOARD_KEEP_SECTIONS), 'backups/x/board.md'), null);
});

test('the verify gate rejects a rewrite that altered a kept section', () => {
  const original = board(40);
  const rebuilt = condenseBoardText(original, 'backups/x/board.md').replace('did thing 39', 'summarised');
  const verdict = verifyBoard({ rebuilt, original, keep: BOARD_KEEP_SECTIONS });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'section-altered');
});

test('the verify gate rejects a rewrite that lost the preamble or grew', () => {
  const original = board(40);
  const rebuilt = condenseBoardText(original, 'backups/x/board.md');
  assert.equal(verifyBoard({ rebuilt: rebuilt.replace('# Floor board', '# Other'), original, keep: BOARD_KEEP_SECTIONS }).reason, 'preamble-altered');
  assert.equal(verifyBoard({ rebuilt: original, original, keep: BOARD_KEEP_SECTIONS }).reason, 'not-smaller');
});
