'use strict';

/**
 * Per-agent runtime state that must NOT outlive its agent (#14, #29, #13).
 *
 * Agent ids are reused: a model change, Restart & Continue, or an account
 * failover does kill()+spawn() under the SAME id. Every map keyed by that id
 * therefore needs a teardown door, or the fresh session inherits a dead one's
 * state — an instantly-paused agent, a cost aggregate the breaker reads as
 * already-spent, a PTY the map still thinks is alive.
 *
 * Also covers the other half of the same seam: the bounded per-session output
 * tail, which exists precisely so state DOES survive a renderer that went away.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { ControlRegistry } = loadTs('src/main/control.ts');
const { TelemetryCollector } = loadTs('src/main/telemetry.ts');
const { PtyManager } = loadTs('src/main/pty.ts');

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── ControlRegistry.forget ───────────────────────────────────────────────────

test('a forgotten agent comes back unpaused, ungated and un-halted', () => {
  const control = new ControlRegistry();
  control.pause('dev1', true);
  control.halt('dev1');
  control.gateTool('dev1', 'Bash', true);
  control.steer('dev1', 'ship it');
  assert.equal(control.toolDecision('dev1', 'Read').deny, true, 'precondition: paused');

  control.forget('dev1');

  // Respawn reuses the id — the fresh session must start clean, or every
  // PreToolUse of a Restart & Continue is denied "Paused by operator".
  const snap = control.snapshot('dev1');
  assert.deepEqual(snap, {
    paused: false, halted: false, autoDeliveryPaused: false, gatedTools: [], pendingSteers: 0
  });
  assert.equal(control.toolDecision('dev1', 'Bash').deny, false);
  assert.equal(control.shouldHalt('dev1'), false);
  assert.equal(control.takeSteer('dev1'), undefined);
});

// ─── TelemetryCollector.forget + the 24 h session cap ─────────────────────────

const kv = (key, value) => (typeof value === 'number'
  ? { key, value: { intValue: String(value) } }
  : { key, value: { stringValue: value } });

/** A synthetic OTLP/JSON metrics export: one token counter for one session. */
function otlpTokens({ agentId, sessionId, tokens }) {
  return {
    resourceMetrics: [{
      resource: { attributes: [kv('agent.id', agentId)] },
      scopeMetrics: [{
        metrics: [{
          name: 'claude_code.token.usage',
          sum: {
            dataPoints: [{
              asInt: String(tokens),
              attributes: [kv('session.id', sessionId), kv('type', 'input'), kv('model', 'claude-sonnet-4-6')]
            }]
          }
        }]
      }]
    }]
  };
}

test('forget drops an agent’s accumulated usage and spans', () => {
  const collector = new TelemetryCollector();
  collector.ingestMetrics(otlpTokens({ agentId: 'jim', sessionId: 's1', tokens: 100 }));
  collector.ingestMetrics(otlpTokens({ agentId: 'pam', sessionId: 's2', tokens: 7 }));
  assert.equal(collector.getAgentUsage('jim').input, 100);

  collector.forget('jim');

  // No resolveCwd, so there is no transcript fallback to mask a stale aggregate.
  assert.equal(collector.getAgentUsage('jim'), null);
  assert.deepEqual(collector.getSpans('jim'), []);
  assert.equal(collector.snapshot().usage.map((u) => u.agentId).join(), 'pam', 'other agents untouched');
  assert.equal(collector.getAgentUsage('pam').input, 7);
});

test('session accumulators older than 24 h leave the live aggregate', () => {
  const collector = new TelemetryCollector();
  // Two sessions for one agent — exactly what a --resume/restart/failover mints.
  collector.ingestMetrics(otlpTokens({ agentId: 'jim', sessionId: 'old', tokens: 900 }));
  collector.ingestMetrics(otlpTokens({ agentId: 'jim', sessionId: 'live', tokens: 10 }));
  assert.equal(collector.getAgentUsage('jim').input, 910);

  // Age the dead one. Reaching into the private map is the house shortcut for
  // "pretend a day passed" (the collector has no injected clock).
  collector.sessions.get('old').ts = Date.now() - DAY_MS - 1000;

  const live = collector.getAgentUsage('jim');
  assert.equal(live.input, 10, 'the breaker must diff live spend only');
  assert.equal(live.sessionId, 'live');
  assert.equal(collector.sessions.has('old'), false, 'expired accumulator is swept, not just skipped');

  // Every session expired → null (a transcript fallback / no data), never an
  // all-zero sample the breaker would read as a spend reset.
  collector.sessions.get('live').ts = Date.now() - DAY_MS - 1000;
  assert.equal(collector.getAgentUsage('jim'), null);
});

// ─── PtyManager: killByOwner empties the map; the output tail survives ────────

/** A PtySession stand-in. pid 0 makes ensureKilled a no-op, so nothing on this
 *  machine is ever signalled by these tests. */
function fakeSession(id, owner) {
  let killed = 0;
  return {
    id, owner, cwd: '/tmp', command: 'claude', lastOutputAt: Date.now(), hasOutput: false,
    tail: [], tailBytes: 0,
    proc: { pid: 0, kill: () => { killed++; } },
    get killed() { return killed; }
  };
}

test('killByOwner removes the sessions it kills and runs their teardown once', () => {
  const manager = new PtyManager();
  const floorA = { isDestroyed: () => true, send: () => {} };
  const floorB = { isDestroyed: () => false, send: () => {} };
  const a1 = fakeSession('a1', floorA);
  const a2 = fakeSession('a2', floorA);
  const b1 = fakeSession('b1', floorB);
  for (const s of [a1, a2, b1]) manager.sessions.set(s.id, s);

  const tornDown = [];
  manager.setExitHandler((id) => tornDown.push(id));
  manager.killByOwner(floorA);

  assert.deepEqual(manager.list().map((s) => s.id), ['b1'], 'dead floor leaves no phantom terminals');
  assert.equal(manager.countByOwner(floorA), 0);
  assert.equal(manager.countByOwner(floorB), 1);
  assert.equal(a1.killed + a2.killed, 2);
  assert.equal(b1.killed, 0, 'another floor’s terminals keep running');
  // Archive + worktree cleanup still happens — the window-closed path has no
  // other teardown caller, and deleting the entry mutes node-pty's onExit.
  assert.deepEqual(tornDown.sort(), ['a1', 'a2']);
});

test('a session keeps a bounded output tail even with no renderer listening', (t) => {
  // Drive the REAL onData path (guard + ring) by swapping node-pty's spawn for a
  // fake child. `pty.spawn` is looked up on the module object at call time, so a
  // property swap is enough; restored on teardown.
  const nodePty = require('node-pty');
  const realSpawn = nodePty.spawn;
  let emit = null;
  nodePty.spawn = () => ({
    pid: 0,
    cols: 80, rows: 24,
    onData: (cb) => { emit = cb; },
    onExit: () => {},
    kill: () => {},
    write: () => {}, resize: () => {}
  });
  t.after(() => { nodePty.spawn = realSpawn; });

  const manager = new PtyManager();
  // An absolute, existing path skips resolveCommand's `where`/`which` probe.
  const res = manager.spawn({ id: 'p1', cwd: process.cwd(), command: process.execPath });
  assert.equal(res.ok, true, res.error);
  assert.equal(typeof emit, 'function');

  // No attachWebContents and no owner: safeSend drops every chunk, exactly like a
  // renderer that reloaded mid-turn. The tail must still have them.
  emit('hello ');
  emit('world');
  assert.equal(manager.outputTail('p1'), 'hello world');

  const CAP = 256 * 1024;
  emit('a'.repeat(100 * 1024));
  emit('b'.repeat(100 * 1024));
  emit('c'.repeat(100 * 1024));
  const tail = manager.outputTail('p1');
  assert.ok(tail.length <= CAP + 100 * 1024, `tail is bounded (${tail.length})`);
  assert.equal(tail.includes('hello'), false, 'oldest chunks are trimmed off the front');
  assert.equal(tail.includes('a'), false, 'trim keeps going until the ring is under cap');
  // 300 KB in, cap 256 KB → the two greetings AND 'a' go; b+c stay whole.
  assert.equal(tail, 'b'.repeat(100 * 1024) + 'c'.repeat(100 * 1024));

  // A single chunk over the cap is kept whole rather than dropped to nothing —
  // the documented ceiling is CAP + one chunk.
  emit('z'.repeat(CAP + 4096));
  assert.equal(manager.outputTail('p1').startsWith('z'), true);

  manager.kill('p1');
  assert.equal(manager.outputTail('p1'), '', 'the tail dies with its session');
});
