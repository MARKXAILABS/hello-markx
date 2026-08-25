'use strict';

// The autonomy loop that used to live in the renderer (issue #5). These tests
// drive DeliveryService with fakes — no Electron, no PTY, no window — which is
// the whole point: if the loop needs a renderer to work, it fails here.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { MAX_QUEUED_PER_AGENT } = loadTs('src/shared/queueDelivery.ts');

const {
  DeliveryService,
  sanitizeForPty,
  condenseBoardText,
  verifyBoard,
  BOARD_KEEP_SECTIONS
} = loadTs('src/main/delivery.ts');

/** A DeliveryService wired to fakes, on a fake clock so a TUI settle + four
 *  post-resume Enter retries cost no wall-clock time. */
const CLOCK0 = 1_000_000;

function harness(overrides = {}) {
  const state = {
    clock: CLOCK0,
    // `lastOutputAt` is the raw epoch stamp main reads off the PTY; `idleMs` is the
    // same fact pre-subtracted. Both are kept coherent here because production
    // derives one from the other (index.ts `liveAgents`).
    agents: [{
      agentId: 'dev1', ptyId: 'pty1', provider: 'claude', hasOutput: true,
      idleMs: 30_000, lastOutputAt: CLOCK0 - 30_000
    }],
    inbox: { dev1: [{ id: 'm1', from: 'god' }] },
    paused: new Set(),
    /** VIGIL-03: agents sitting on a prompt waiting for a human. In production
     *  this is derived per-call from the PTY's own output ring
     *  (boot.ts wires `matchBlockHint(ptyManager.outputTail(ptyId))`), so it is
     *  a Set here rather than a fixed flag on the agent literal — a test can
     *  flip it between ticks exactly like a real prompt appearing and clearing. */
    blocked: new Set(),
    /** agentId → breaker level; absent = healthy. */
    breaker: {},
    /** The DURABLE half of a quiesce flip (index.ts appends it to the hive log). */
    statuses: [],
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
    blocked: (id) => state.blocked.has(id),
    // No durable home by default: `null` disables the main-owned MD queue, so
    // every pre-existing test drives exactly the loop it always drove. The queue
    // tests below pass a real path into a mkdtemp dir and read the bytes back.
    queuePath: () => null,
    knownAgent: () => true,
    breakerLevel: (id) => state.breaker[id] ?? 'healthy',
    setStatus: (id, status) => state.statuses.push({ id, status }),
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

// ─── the idle-quiesce backstop, with nothing attached ───────────────────────

test('a silent PTY is flipped idle with NO window attached, once per quiet spell', async () => {
  // The renderer version of this ran in a React effect, so with the window closed
  // an agent whose bridge never fires its turn-end signal stayed 'working' forever.
  // `emit` here is the real no-window behaviour — a no-op, exactly what index.ts's
  // `liveWebContents()?.send` does with no webContents — so the ONLY thing that can
  // carry the flip is the durable half. If this passes on `emit` alone it is not
  // testing the property the move exists for.
  const { svc, state } = harness({ emit: () => { /* no webContents attached */ } });
  state.inbox.dev1 = [];               // no mail: this is the quiesce path, not the wake

  await svc.tick();
  assert.deepEqual(
    state.statuses,
    [{ id: 'dev1', status: 'idle' }],
    'an agent silent for 30 s was not flipped idle with no window attached'
  );

  await svc.tick();
  assert.equal(state.statuses.length, 1, 'the flip re-announced on every 4 s tick while the agent stayed quiet');

  // The PTY speaks again, then goes quiet again: a NEW turn, so a new announcement.
  state.clock += 60_000;
  state.agents[0].lastOutputAt = state.clock;
  await svc.tick();
  assert.equal(state.statuses.length, 1, 'a talking PTY was announced idle');
  state.clock += 60_000;
  await svc.tick();
  assert.equal(state.statuses.length, 2, 'the backstop did not re-arm after the agent worked again');
});

test('the quiesce Stop is marked SYNTHESIZED, so the renderer can tell it from a real turn-end', async () => {
  // Asserted where the emit lives. The renderer cannot derive this: hooks.ts's
  // real Stop sends { agentId, event:'Stop', blocked:false } with every other key
  // undefined — byte-equivalent to this one without the discriminator — so a
  // renderer-side heuristic would have to guess, and guessing wrong either erases
  // a permission-prompted agent's "needs you" or swallows Claude Code's own
  // turn-end. useHive.ts's `stopArmDecision` is the consumer.
  const { svc, state, emitted } = harness();
  state.inbox.dev1 = [];               // no mail: this is the quiesce path, not the wake

  await svc.tick();

  const stops = emitted.filter((m) => m.channel === 'hive:hookEvent' && m.payload.event === 'Stop');
  assert.equal(stops.length, 1, 'the quiesce backstop did not emit exactly one Stop for a silent PTY');
  assert.deepEqual(stops[0].payload, {
    agentId: 'dev1', event: 'Stop', blocked: false, synthesized: true
  }, 'the synthesized turn-end is indistinguishable from a real one on the wire');
});

test('silence that is not a finished turn does not flip: a booting TUI, and a PTY that never painted', async () => {
  const { svc, state } = harness();
  state.inbox.dev1 = [];
  svc.noteSpawn('pty1');               // boot grace: its silence IS the boot sequence

  await svc.tick();
  assert.deepEqual(state.statuses, [], 'a booting TUI was called idle mid-boot');

  svc.forgetPty('pty1');
  // pty.ts SEEDS lastOutputAt to the spawn instant, so a TUI that never painted
  // still carries an old-looking stamp — `hasOutput` is the only thing that can
  // tell the two apart, which is why the guard reads it and not just the clock.
  state.agents[0].hasOutput = false;
  await svc.tick();
  assert.deepEqual(state.statuses, [], 'a PTY that has never painted a frame was read as quiet-for-ages');

  state.agents[0].lastOutputAt = 0;    // no stamp at all
  state.agents[0].hasOutput = true;
  await svc.tick();
  assert.deepEqual(state.statuses, [], 'a PTY with no output stamp was flipped on a 1970 epoch');
});

test('the backstop never fights the breaker pin', async () => {
  const { svc, state } = harness();
  state.inbox.dev1 = [];
  state.breaker.dev1 = 'constrained';

  await svc.tick();
  assert.deepEqual(state.statuses, [], 'a breaker-constrained agent was flipped idle out from under the pin');

  state.breaker.dev1 = 'stopped';
  await svc.tick();
  assert.deepEqual(state.statuses, [], 'a breaker-stopped agent was flipped idle out from under the pin');

  state.breaker.dev1 = 'healthy';
  await svc.tick();
  assert.deepEqual(state.statuses, [{ id: 'dev1', status: 'idle' }], 'a healthy silent agent was not flipped');
});

test('the backstop is on the timer start() arms — not a method nobody schedules', () => {
  // The three tests above call svc.tick() by hand, so all three would stay green
  // if start() stopped scheduling the tick at all — and then the backstop would
  // not run, which is the whole property. Stub the global timer instead of
  // waiting TICK_MS of real wall clock: capture what start() arms, then fire it.
  const realSetInterval = global.setInterval;
  const armed = [];
  global.setInterval = (fn, ms) => { armed.push({ fn, ms }); return { unref() { /* noop */ } }; };
  try {
    const { svc, state } = harness();
    state.inbox.dev1 = [];

    svc.start();
    assert.equal(armed.length, 1, 'start() armed ' + armed.length + ' timers; the backstop rides the ONE tick');
    assert.ok(
      armed[0].ms <= 4000,
      `the tick is ${armed[0].ms} ms apart, slower than the 4 s cadence the renderer's backstop ran at`
    );

    // quiesce() runs at the top of tick(), before its first await, so the
    // scheduled callback drives it synchronously.
    armed[0].fn();
    assert.deepEqual(
      state.statuses,
      [{ id: 'dev1', status: 'idle' }],
      'the timer start() arms does not run the quiesce backstop — it is dead code in production'
    );
  } finally {
    global.setInterval = realSetInterval;
  }
});

// ─── VIGIL-03: an agent parked on a prompt is not idled, and not mailed more ──

/** Two agents, side by side, identical in every input the loop reads: both quiet
 *  past QUIESCE_IDLE_MS, both painted, both breaker-healthy, both past boot grace,
 *  both holding unread mail. The ONLY difference is `deps.blocked`, so every
 *  assertion below is about that dep and nothing else.
 *
 *  The control half is not decoration (D-33/D-40): without it, a `quiesce` that
 *  returned on its first line and a `tick` that never nudged would satisfy all
 *  three negatives, and the block would pass against a loop that does nothing. */
function blockedPair() {
  const h = harness();
  h.state.agents = [
    { agentId: 'blockedAgent', ptyId: 'pty-blocked', provider: 'claude', hasOutput: true,
      idleMs: 30_000, lastOutputAt: CLOCK0 - 30_000 },
    { agentId: 'controlAgent', ptyId: 'pty-control', provider: 'claude', hasOutput: true,
      idleMs: 30_000, lastOutputAt: CLOCK0 - 30_000 }
  ];
  h.state.inbox = {
    blockedAgent: [{ id: 'm-blocked', from: 'god' }],
    controlAgent: [{ id: 'm-control', from: 'god' }]
  };
  h.state.blocked.add('blockedAgent');
  return h;
}

/** Asserted as "was THIS exact call made", never as a count of all calls:
 *  `setStatus` legitimately fires for other agents in the same tick, so a bare
 *  length assertion would go red or green for reasons unrelated to the guard. */
const idledCount = (statuses, id) => statuses.filter((s) => s.id === id && s.status === 'idle').length;
const stopsFor = (emitted, id) => emitted.filter(
  (e) => e.channel === 'hive:hookEvent' && e.payload.event === 'Stop' && e.payload.agentId === id
);
const nudgesTo = (writes, ptyId) => writes.filter(
  (w) => w.ptyId === ptyId && /new hive inbox message/i.test(w.data)
);

test('VIGIL-03: a blocked agent is not flipped idle by the quiesce backstop, with NO window attached', async () => {
  // The harness `emit` collects but nothing consumes it, which is the real
  // no-window behaviour — index.ts's `liveWebContents()?.send` is a documented
  // no-op with no webContents. So the only thing that can carry (or wrongly
  // carry) this flip is the DURABLE half, and that is the whole of VIGIL-03:
  // `stopArmDecision` (useHive.ts:169) guards only the renderer's reaction to
  // the synthesized Stop, and on a headless floor there is no renderer to guard
  // with — the durable status is already wrong before it would ever run.
  const h = blockedPair();

  await h.svc.tick();

  assert.equal(
    idledCount(h.state.statuses, 'blockedAgent'), 0,
    'setStatus(blockedAgent, idle): an agent sitting on a prompt was flipped idle by the durable backstop'
  );
  assert.equal(
    idledCount(h.state.statuses, 'controlAgent'), 1,
    'setStatus(controlAgent, idle): the control agent was NOT flipped — the backstop is skipping everybody'
  );
});

test('VIGIL-03: no synthesized Stop is emitted for a blocked agent, and one IS for the control', async () => {
  const h = blockedPair();

  await h.svc.tick();

  assert.equal(
    stopsFor(h.emitted, 'blockedAgent').length, 0,
    'a synthesized turn-end was announced for an agent that has not finished its turn — it is waiting for a human'
  );
  const control = stopsFor(h.emitted, 'controlAgent');
  assert.equal(control.length, 1, 'the control agent got no synthesized Stop — the backstop is not running at all');
  assert.equal(control[0].payload.synthesized, true, 'the control Stop was not marked synthesized');
});

test('VIGIL-03: the wake nudge does not mail a blocked agent more work, and does mail the control', async () => {
  // The nudge's five filters (switching, paused, vetoed, boot grace, idleMs) are
  // all about the FLOOR's state and none about the AGENT's, which is why a blocked
  // agent gets typed into today: it is quiet by definition, so it reads as ready.
  const h = blockedPair();

  await h.svc.tick();

  assert.equal(
    nudgesTo(h.writes, 'pty-blocked').length, 0,
    'WAKE_NUDGE was typed into a terminal parked on a prompt — that text lands in the prompt box, not in a turn'
  );
  assert.equal(
    nudgesTo(h.writes, 'pty-control').length, 1,
    'WAKE_NUDGE never reached the control agent — the nudge is off entirely, so the negative above proves nothing'
  );
});

test('VIGIL-03: a blocked agent LEAVES the quiesced set, so it re-announces when it unblocks', async () => {
  // Delete-and-continue, not bare continue (T-04-BLK-03). The ordering here is
  // what lets the test tell the two apart: the agent is announced FIRST, so it is
  // already a member of `quiesced` when the block arrives. A bare `continue`
  // leaves that stale membership in place and swallows the real turn-end that
  // follows. `delivery.ts:733` is the in-file precedent for pruning that set.
  const h = harness();
  h.state.inbox.dev1 = [];             // quiesce path only, no mail

  await h.svc.tick();
  assert.equal(idledCount(h.state.statuses, 'dev1'), 1, 'the quiet agent was not announced at all');

  h.state.blocked.add('dev1');         // a prompt appears; the PTY stays silent
  await h.svc.tick();
  assert.equal(idledCount(h.state.statuses, 'dev1'), 1, 'a blocked agent was announced idle');

  h.state.blocked.delete('dev1');      // the human answered; the PTY is still quiet
  await h.svc.tick();
  assert.equal(
    idledCount(h.state.statuses, 'dev1'), 2,
    'the unblocked agent never re-announced: a stale `quiesced` membership swallowed its real turn-end'
  );

  await h.svc.tick();
  assert.equal(
    idledCount(h.state.statuses, 'dev1'), 2,
    'the re-announcement is not edge-triggered — it repeats on every tick'
  );
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

// ─── the MD queue, with no window attached (FLOOR-02) ───────────────────────
//
// ROADMAP criterion 1's headline clause: "with the app window closed, a message
// composed in the UI still reaches its recipient's inbox and is typed into that
// agent's terminal". Before this migration the queue and its drain lived in
// `useHive.ts` and every one of these tests was unwritable — there was nothing
// in main to drive.
//
// `emit` is a genuine no-op in these tests, which is what main's emit IS with no
// webContents: `try { liveWebContents()?.send(...) } catch {}`. Nothing below may
// depend on a renderer receiving anything.

/** A queue rooted in its own temp dir, torn down whatever the body does. */
function withQueueDir(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-delivery-queue-'));
  try {
    return body({ dir, queuePath: path.join(dir, 'delivery-queue.json') });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The child that plays "the app restarted": a genuinely separate
 *  `process.execPath`, a FRESH DeliveryService over the same file, its own fakes,
 *  and the pending message ids on stdout as JSON. A `fork()`ed worker sharing
 *  module state, a `vm` context or `delete require.cache` would prove nothing —
 *  the point is that the bytes, not the process, carry the queue. */
const RESTART_CHILD = `
const loadTs = require(${JSON.stringify(path.join(__dirname, 'load-ts.cjs'))});
const { DeliveryService } = loadTs('src/main/delivery.ts');
const svc = new DeliveryService({
  liveAgents: () => [],
  inbox: () => [],
  write: () => ({ ok: true }),
  paused: () => true,
  drain: () => ({ block: false }),
  respawn: () => Promise.resolve({ ok: true }),
  queuePath: () => process.argv[2],
  emit: () => {},
  log: () => {}
});
const pending = Object.values(svc.queueSnapshot()).flat().map((m) => m.id);
process.stdout.write(JSON.stringify(pending));
`;

test('a message enqueued through main is typed into the recipient PTY with NO window attached', async () => {
  await withQueueDir(async ({ queuePath }) => {
    const { svc, state, writes } = harness({ queuePath: () => queuePath, emit: () => {} });
    state.inbox.dev1 = [];   // isolate: no unread mail, so the wake nudge cannot be the writer

    const res = svc.enqueue({ agentId: 'dev1', text: 'ship the release notes' });
    assert.equal(res.ok, true, res.error);
    await svc.tick();

    assert.match(typed(writes), /ship the release notes/, 'the queued message never reached the PTY');
    assert.equal(writes.at(-1).data, '\r', 'the message was typed but never submitted');
  });
});

test("the human's draft still vetoes a queued delivery — the renderer keeps exactly that job", async () => {
  await withQueueDir(async ({ queuePath }) => {
    const { svc, state, writes, bump } = harness({ queuePath: () => queuePath, emit: () => {} });
    state.inbox.dev1 = [];
    svc.enqueue({ agentId: 'dev1', text: 'do not land on my half-typed line' });

    svc.setVeto('dev1', 'user is mid-draft');
    await svc.tick();
    assert.equal(writes.length, 0, 'a queued message landed on top of the human draft');

    svc.setVeto('dev1', null);
    bump(10_000);
    await svc.tick();
    assert.match(typed(writes), /half-typed line/, 'clearing the veto did not release the queued message');
  });
});

test('enqueue-and-tick twice writes ONCE — a delivered message leaves the queue', async () => {
  await withQueueDir(async ({ queuePath }) => {
    const { svc, state, writes, bump } = harness({ queuePath: () => queuePath, emit: () => {} });
    state.inbox.dev1 = [];
    svc.enqueue({ agentId: 'dev1', text: 'exactly once please' });

    await svc.tick();
    const after1 = writes.length;
    assert.ok(after1 > 0, 'nothing was delivered at all');

    // Past the per-agent cooldown, so a second write is genuinely un-gated here:
    // without the queue removal this tick WOULD type the message again.
    bump(10_000);
    await svc.tick();
    assert.equal(writes.length, after1, 'the same queued message was typed in twice');
    assert.deepEqual(svc.queueSnapshot(), {}, 'a delivered message was left in the queue');
  });
});

test('the delivered event names the message AND its text — the /clear gauge depends on it', async () => {
  await withQueueDir(async ({ queuePath }) => {
    const { svc, state, emitted } = harness({ queuePath: () => queuePath });
    state.inbox.dev1 = [];
    const { id } = svc.enqueue({ agentId: 'dev1', text: '/clear' });

    await svc.tick();

    // The acknowledge REMOVES the item before this fires, so the renderer cannot
    // look the text up afterwards — it has to arrive on the event or the context
    // bar stays stale-full through a session that no longer has that context.
    assert.deepEqual(
      emitted.filter((e) => e.channel === 'hive:queueDelivered').map((e) => e.payload),
      [{ to: 'dev1', id, text: '/clear' }]
    );
  });
});

test('an operator pause holds a queued message, and "send now" releases it', async () => {
  await withQueueDir(async ({ queuePath }) => {
    const { svc, state, writes, bump } = harness({ queuePath: () => queuePath, emit: () => {} });
    state.inbox.dev1 = [];
    state.paused.add('dev1');
    const { id } = svc.enqueue({ agentId: 'dev1', text: 'held by the floor switch' });

    await svc.tick();
    assert.equal(writes.length, 0, 'a paused floor delivered anyway');

    svc.releaseQueued('dev1', id);
    bump(10_000);
    await svc.tick();
    assert.match(typed(writes), /held by the floor switch/, '"send now" did not bypass the pause');
  });
});

test('the enqueue boundary refuses what it cannot trust', () => {
  withQueueDir(({ queuePath }) => {
    const { svc } = harness({
      queuePath: () => queuePath,
      emit: () => {},
      knownAgent: (id) => id === 'dev1'
    });
    assert.equal(svc.enqueue({ agentId: 'dev1', text: '   ' }).ok, false, 'an empty message was parked');
    assert.equal(svc.enqueue({ agentId: '', text: 'hi' }).ok, false, 'a blank agent id was accepted');
    // T-P08-05: the recipient is resolved against MAIN's roster, not the id a
    // renderer happened to send.
    assert.equal(svc.enqueue({ agentId: 'not-on-this-floor', text: 'hi' }).ok, false,
      'a renderer named an agent that is not on this floor and main typed at it');
    assert.equal(svc.enqueue({ agentId: 'dev1', text: 'hi' }).ok, true);
  });
});

// ─── D-11 gap 2: noteSpawn's seed param — a Crush worker's protocol seed,
//     enqueued by main at spawn instead of typed by a renderer setInterval ──

test('noteSpawn with a seed parks it in the queue main owns', async () => {
  await withQueueDir(async ({ queuePath }) => {
    const { svc } = harness({ queuePath: () => queuePath, emit: () => {} });
    svc.noteSpawn('pty1', { agentId: 'dev1', text: '<protocol>' });
    const snap = svc.queueSnapshot();
    assert.ok((snap.dev1 ?? []).some((m) => m.text === '<protocol>'),
      'noteSpawn\'s seed was never enqueued');
  });
});

test('a tick INSIDE the boot grace does not deliver a spawned seed', async () => {
  await withQueueDir(async ({ queuePath }) => {
    const { svc, state, writes } = harness({ queuePath: () => queuePath, emit: () => {} });
    state.inbox.dev1 = []; // isolate: no unread mail, so the wake nudge cannot be the writer
    svc.noteSpawn('pty1', { agentId: 'dev1', text: '<protocol>' });

    await svc.tick(); // no clock movement — still inside BOOT_GRACE_MS (35 s)

    assert.equal(writes.length, 0,
      'a freshly spawned worker\'s protocol seed landed before its TUI had painted');
  });
});

test('a tick AFTER the boot grace and past IDLE_MS delivers the seed through submit()', async () => {
  await withQueueDir(async ({ queuePath }) => {
    const { svc, state, writes, bump } = harness({ queuePath: () => queuePath, emit: () => {} });
    state.inbox.dev1 = [];
    svc.noteSpawn('pty1', { agentId: 'dev1', text: '<protocol>' });

    bump(35_000 + 1); // past BOOT_GRACE_MS; state.agents[0].idleMs (30_000) already clears IDLE_MS
    await svc.tick();

    assert.match(typed(writes), /<protocol>/, 'the seed was never delivered once the boot grace elapsed');
    assert.equal(writes.at(-1).data, '\r', 'the seed was typed but never submitted');
  });
});

test('noteSpawn with NO seed still sets the boot grace and enqueues nothing', async () => {
  await withQueueDir(async ({ queuePath }) => {
    const { svc, writes } = harness({ queuePath: () => queuePath, emit: () => {} });

    svc.noteSpawn('pty1'); // no second argument — the ordinary respawn/boot-grace-only call

    assert.deepEqual(svc.queueSnapshot(), {}, 'a plain noteSpawn(ptyId) with no seed enqueued something anyway');
    await svc.tick();
    assert.equal(writes.length, 0, 'the boot grace noteSpawn(ptyId) sets was not honored');
  });
});

test('a message enqueued and not yet delivered survives a REAL process restart', () => {
  withQueueDir(({ dir, queuePath }) => {
    // 1. Parent: park a message and hold it (the floor is paused, so nothing
    //    delivers), then assert on the BYTES before any restart. This is the
    //    assertion a module-level Map cannot pass, and it is deliberately a
    //    separate, earlier failure point than the reload below.
    const { svc, state } = harness({ queuePath: () => queuePath, emit: () => {} });
    state.inbox.dev1 = [];
    state.paused.add('dev1');
    const { ok, id } = svc.enqueue({ agentId: 'dev1', text: 'survive the restart' });
    assert.equal(ok, true);

    assert.equal(fs.existsSync(queuePath), true, 'the queue wrote no bytes to disk at all');
    const onDisk = fs.readFileSync(queuePath, 'utf8');
    assert.ok(onDisk.includes(id), `the queue file does not contain ${id}: ${onDisk}`);

    // 2. Restart: a genuinely separate process, a fresh service, the same file.
    const child = path.join(dir, 'restart-child.cjs');
    fs.writeFileSync(child, RESTART_CHILD, 'utf8');
    const res = spawnSync(process.execPath, [child, queuePath], { encoding: 'utf8' });
    assert.equal(res.status, 0, `restart child exited ${res.status}: ${res.stderr}`);

    // 3. The SPECIFIC message, not merely "the queue is non-empty".
    assert.deepEqual(JSON.parse(res.stdout), [id],
      `a fresh process did not read back the parked message (stdout: ${res.stdout})`);

    // NEGATIVE CONTROL. Delete the file and run the same child again: if the
    // message is still there, it is being served from somewhere that is not the
    // bytes, and this test has been proving nothing.
    fs.rmSync(queuePath);
    const gone = spawnSync(process.execPath, [child, queuePath], { encoding: 'utf8' });
    assert.equal(gone.status, 0, `negative-control child exited ${gone.status}: ${gone.stderr}`);
    assert.deepEqual(JSON.parse(gone.stdout), [],
      'the queue survived deletion of its own file — it is not reading the disk');
  });
});

test('the queue is durable across a changed harness home, and bounded per agent', () => {
  withQueueDir(({ dir, queuePath }) => {
    let target = queuePath;
    const { svc, state } = harness({ queuePath: () => target, emit: () => {} });
    state.inbox.dev1 = [];
    svc.enqueue({ agentId: 'dev1', text: 'hive one' });

    // The thunk is the point: a path captured at construction would keep writing
    // the first hive's queue into the second hive's file.
    target = path.join(dir, 'other-hive-queue.json');
    assert.deepEqual(svc.queueSnapshot(), {}, 'a second hive was handed the first hive\'s queue');
    svc.enqueue({ agentId: 'dev1', text: 'hive two' });
    assert.ok(fs.readFileSync(target, 'utf8').includes('hive two'));
    assert.ok(fs.readFileSync(queuePath, 'utf8').includes('hive one'), 'the first hive\'s file was clobbered');

    // T-P08-04: an agent with no live PTY must not accumulate forever.
    for (let i = 0; i < MAX_QUEUED_PER_AGENT; i++) svc.enqueue({ agentId: 'dev1', text: `spam ${i}` });
    const full = svc.enqueue({ agentId: 'dev1', text: 'one too many' });
    assert.equal(full.ok, false, 'the queue grew past its ceiling');
    assert.match(full.error, /queue full/);
  });
});

// ─── a queue that cannot be READ is not a queue that is EMPTY (a/CR-05) ──────
//
// `loadQueue` armed the write path on EVERY path, including after its `catch`
// swallowed a failure — while the doc comment three lines above stated the
// opposite invariant. One EBUSY/EPERM (Windows AV, an indexer) or one EMFILE
// under load replaced the queue with `[]`, and the next mutation wrote that
// emptiness over a file that was fine.
//
// The disk is the observable throughout. The armed-path field is private and
// no test below reads it: a service that "looks disarmed" while still writing
// is exactly the failure being closed.

/** The portable read fault: a DIRECTORY where the queue file should be. EISDIR
 *  is the win32, linux and darwin answer alike, so one fixture drives the
 *  non-ENOENT branch on every CI runner. ASSERTED, not assumed — if a platform
 *  ever answers something else this fails HERE, loudly, instead of silently
 *  turning every case below into a no-op. */
function unreadableQueuePath(dir, name) {
  const p = path.join(dir, name);
  fs.mkdirSync(p);
  let code = null;
  try { fs.readFileSync(p, 'utf8'); } catch (e) { code = e.code; }
  assert.equal(code, 'EISDIR',
    `a directory at the queue path did not throw EISDIR on ${process.platform} (got ${code}) — `
    + 'this fixture no longer drives the non-ENOENT branch and the tests below prove nothing');
  return p;
}

test('a queue whose read FAILS leaves the write path disarmed and the persisted bytes intact', () => {
  withQueueDir(({ dir, queuePath }) => {
    let target = queuePath;
    const { svc, state } = harness({ queuePath: () => target, emit: () => {} });
    state.inbox.dev1 = [];
    assert.equal(svc.enqueue({ agentId: 'dev1', text: 'parked before the fault' }).ok, true);
    assert.equal(svc.enqueue({ agentId: 'dev1', text: 'parked before the fault as well' }).ok, true);
    const good = fs.readFileSync(queuePath, 'utf8');

    // The antivirus hold: the next read of the queue throws, and it is NOT ENOENT.
    target = unreadableQueuePath(dir, 'held-by-the-scanner.json');

    const refused = svc.enqueue({ agentId: 'dev1', text: 'arrived during the hold' });
    assert.equal(refused.ok, false,
      'an enqueue was ACCEPTED against a queue whose read had just failed. The write path was armed '
      + 'BY the failure, so the caller is told its message is parked and the next mutation writes an '
      + 'empty queue over a file that was fine');
    assert.match(refused.error, /temporarily unreadable/,
      `the refusal must name the real cause: ${refused.error}`);
    assert.equal(/no harness home/.test(refused.error), false,
      'the operator is told there is no harness home during a transient read fault — plan 01-28 '
      + 'renders this exact string to the screen unaltered');

    // Nothing was staged or written at the path that could not be read.
    assert.deepEqual(fs.readdirSync(target), [],
      'the failed load wrote into the very path it could not read');
    assert.deepEqual(fs.readdirSync(dir).filter((n) => n.includes('.tmp-')), [],
      'a persist was staged off a load that never landed');

    // The bytes that WERE durable are untouched, read straight back off disk.
    assert.equal(fs.readFileSync(queuePath, 'utf8'), good,
      'the persisted queue was rewritten after a failed read');

    // And the refused message was refused, not buffered for the next mutation.
    target = queuePath;
    assert.equal(JSON.stringify(svc.queueSnapshot()).includes('during the hold'), false,
      'a refused message survived in memory and will be written on the next successful mutation');
  });
});

// POSITIVE CONTROL. Without this a loader that NEVER arms passes everything above.

test('a transient read fault is TRANSIENT: the next good read re-arms and one enqueue reaches disk', () => {
  withQueueDir(({ dir, queuePath }) => {
    let target = queuePath;
    const { svc, state } = harness({ queuePath: () => target, emit: () => {} });
    state.inbox.dev1 = [];
    svc.enqueue({ agentId: 'dev1', text: 'one' });
    svc.enqueue({ agentId: 'dev1', text: 'two' });
    const before = JSON.parse(fs.readFileSync(queuePath, 'utf8')).items.length;
    assert.equal(before, 2);

    target = unreadableQueuePath(dir, 'held-open.json');
    assert.equal(svc.enqueue({ agentId: 'dev1', text: 'during the hold' }).ok, false);

    target = queuePath; // the scanner lets go
    const res = svc.enqueue({ agentId: 'dev1', text: 'three' });
    assert.equal(res.ok, true, `the loader never re-armed — a transient fault became permanent: ${res.error}`);

    const items = JSON.parse(fs.readFileSync(queuePath, 'utf8')).items;
    assert.equal(items.length, before + 1, 'a healthy enqueue after the fault never reached disk');
    assert.equal(items.filter((m) => m.text === 'during the hold').length, 0,
      'a message that was refused during the fault was written to disk anyway');
    assert.ok(items.some((m) => m.text === 'three'));
    assert.ok(items.some((m) => m.text === 'one'), 'the pre-fault queue was lost on re-arm');
  });
});

// NEGATIVE CONTROLS — the ordinary operations that must still work.

test('ENOENT is a first boot, not a fault: an absent queue still arms and the first enqueue writes it', () => {
  withQueueDir(({ dir }) => {
    const fresh = path.join(dir, 'never-written-yet.json');
    const { svc, state } = harness({ queuePath: () => fresh, emit: () => {} });
    state.inbox.dev1 = [];
    assert.equal(fs.existsSync(fresh), false);

    const res = svc.enqueue({ agentId: 'dev1', text: 'first message on a fresh floor' });
    assert.equal(res.ok, true, `a first boot was treated as a read fault: ${res.error}`);

    const items = JSON.parse(fs.readFileSync(fresh, 'utf8')).items;
    assert.equal(items.length, 1, 'the first message on a fresh floor never reached disk');
    assert.equal(items[0].text, 'first message on a fresh floor');
  });
});

test('no harness home at all still returns the harness-home refusal — that string stays right for its own case', () => {
  const { svc, state } = harness(); // queuePath: () => null, the default
  state.inbox.dev1 = [];
  const res = svc.enqueue({ agentId: 'dev1', text: 'nowhere durable to put this' });
  assert.equal(res.ok, false);
  assert.match(res.error, /no harness home/,
    `a genuinely homeless floor must still say so: ${res.error}`);
});

test('a corrupt file is still replaceable: unparseable JSON is an empty queue, and it ARMS', () => {
  withQueueDir(({ queuePath }) => {
    fs.writeFileSync(queuePath, '{ not json at all', 'utf8');
    const { svc, state } = harness({ queuePath: () => queuePath, emit: () => {} });
    state.inbox.dev1 = [];

    // Readable-vs-unreadable is the distinction being drawn, NOT valid-vs-invalid:
    // a file that read fine and parsed badly is genuinely corrupt, and a floor that
    // could never overwrite it would be wedged forever.
    const res = svc.enqueue({ agentId: 'dev1', text: 'past the corruption' });
    assert.equal(res.ok, true, `a corrupt queue file wedged the floor permanently: ${res.error}`);
    assert.equal(JSON.parse(fs.readFileSync(queuePath, 'utf8')).items.length, 1);
  });
});

// VISIBILITY — the row filter is a silent deleter on the first launch after a
// shape change. It stays a deleter; it stops being silent.

test('rows dropped by the shape filter are COUNTED and logged, not deleted in silence', () => {
  withQueueDir(({ queuePath }) => {
    fs.writeFileSync(queuePath, JSON.stringify({
      version: 1,
      items: [
        { id: 'q-1', agentId: 'dev1', text: 'survives', ts: 1 },
        { id: 'q-2', agentId: 'dev1', ts: 2 },   // a `text` that a shape change renamed
        { id: 'q-3', agentId: 'dev1', text: 'no ts' }
      ]
    }), 'utf8');
    const logs = [];
    const { svc, state } = harness({
      queuePath: () => queuePath, emit: () => {}, log: (...a) => logs.push(a.map(String).join(' '))
    });
    state.inbox.dev1 = [];

    assert.equal(Object.values(svc.queueSnapshot()).flat().length, 1);
    assert.ok(logs.some((l) => /drop/i.test(l) && /2/.test(l)),
      `a shape change deleted 2 parked messages leaving no trace at all: ${JSON.stringify(logs)}`);
  });
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
