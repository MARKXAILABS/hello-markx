'use strict';

/**
 * VIGIL-01 — nothing happening is itself an event.
 *
 * The requirement's hardest clause is the one this file exists to pin: the
 * alarm must fire **when the god itself died**, and it must be addressed to the
 * OPERATOR. `HEARTBEAT_MISSION` (src/main/config.ts) cannot do that job — it is
 * `to: 'god'` and its own doc says it "types into god's PTY", so a beat
 * addressed to the god can never report that the god is gone. Hence a separate,
 * operator-directed watchdog, and hence the explicit negative assertion below
 * that no channel carries a `'god'` recipient.
 *
 * Every clock and every signal is injected (`node --test`, no PTY, no hive, no
 * electron, no real timer). The threshold is overridden to 1000 ms so the
 * once-only sequence runs in microseconds; the SHIPPED default is asserted
 * separately.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { AbsenceWatchdog, QUIET_THRESHOLD_MS } = loadTs('src/main/floor/watchdog.ts');
const { FLOOR_QUIET_TAG, floorQuietPushPayload } = loadTs('src/main/push.ts');

const THRESHOLD = 1000;

/**
 * One watchdog over a fully faked floor. `state` is live — a test mutates it
 * between ticks to drive a signal, exactly as the real floor would.
 *
 * The starting state is a MOVING floor: zero PTY idle, and both timestamp
 * signals stamped at `now`. `advance(ms)` ages the clock AND the PTY idle
 * counter together (that is what real elapsed silence looks like); `busy()`
 * puts every signal back to "just happened".
 */
function harness(init = {}) {
  const state = {
    now: 100_000,
    ptyIdleMs: 0,
    rev: 1,
    lastEventAt: 100_000,
    lastSpendAt: 100_000,
    doing: init.doing ?? [],
    godAlive: init.godAlive !== false
  };
  const notified = [];
  const published = [];
  const pushed = [];
  const deps = {
    now: () => state.now,
    ptyIdleMs: () => state.ptyIdleMs,
    ledgerRev: () => state.rev,
    lastEventAt: () => state.lastEventAt,
    lastSpendAt: () => state.lastSpendAt,
    doingCards: () => state.doing,
    godAlive: () => state.godAlive,
    notify: (a) => notified.push(a),
    publishQuiet: (s) => published.push(s),
    push: (a) => pushed.push(a)
  };
  const wd = new AbsenceWatchdog(deps, { thresholdMs: THRESHOLD });
  return {
    wd, state, notified, published, pushed,
    advance: (ms) => { state.now += ms; state.ptyIdleMs += ms; },
    busy: () => { state.ptyIdleMs = 0; state.lastEventAt = state.now; state.lastSpendAt = state.now; }
  };
}

// ─── The once-only latch (D-25, UI-SPEC rule Q-3) ───────────────────────────

test('VIGIL-01: one alarm on the quiet edge, ZERO on the next five ticks, one more after activity → silence', () => {
  const h = harness({ doing: [{ id: 't1', title: 'ship the thing', assignee: 'ada' }] });

  h.wd.tick();
  assert.equal(h.notified.length, 0, 'a moving floor must not alarm — this is the non-vacuous half');
  assert.equal(h.wd.current(), null, 'current() must be null while the floor is moving');

  h.advance(THRESHOLD + 1);
  h.wd.tick();
  assert.equal(h.notified.length, 1, 'the transition into quiet must alarm exactly once');
  assert.equal(h.pushed.length, 1, 'D-25 channel 3 (Web Push) fires on the same edge');
  assert.equal(h.published.length, 1, 'D-25 channel 2 (the persistent surface) is set on the same edge');

  // THE anti-spam assertion. "An alarm fired" is satisfied by a per-tick
  // spammer; five more silent ticks is what actually proves the latch.
  for (let i = 0; i < 5; i++) { h.advance(THRESHOLD); h.wd.tick(); }
  assert.equal(h.notified.length, 1, 'five further quiet ticks produced a repeat toast — the latch is not latching');
  assert.equal(h.pushed.length, 1, 'five further quiet ticks produced a repeat push');
  assert.equal(h.published.length, 1, 'the persistent surface was re-published on a tick with no edge');

  // Real activity clears it...
  h.busy();
  h.wd.tick();
  assert.equal(h.wd.current(), null, 'activity resumed and the latch did not clear');
  assert.equal(h.published.length, 2, 'the clearing edge must publish');
  assert.equal(h.published[1], null, 'the clearing edge publishes null, or the surface stays stuck on');

  // ...and only then may a fresh edge alarm again.
  h.advance(THRESHOLD + 1);
  h.wd.tick();
  assert.equal(h.notified.length, 2, 'a genuine second quiet spell must be reported');
  assert.equal(h.pushed.length, 2);
});

// ─── The clause HEARTBEAT_MISSION cannot serve ──────────────────────────────

test('VIGIL-01: the alarm fires when the GOD is the dead one, and no channel carries a \'god\' recipient', () => {
  const h = harness({ godAlive: false, doing: [{ id: 't1', title: 'ship the thing', assignee: 'ada' }] });
  h.advance(THRESHOLD + 1);
  h.wd.tick();

  assert.equal(h.notified.length, 1, 'a dead god must not silence the watchdog — that is the whole requirement');
  assert.equal(h.wd.current().godDead, true);
  assert.equal(h.published[0].godDead, true);
  assert.equal(h.pushed.length, 1);

  const everyCall = [...h.notified, ...h.pushed, ...h.published];
  assert.ok(everyCall.length >= 3,
    'positive lower bound: all three D-25 channels must have fired, or the negative below is vacuous');
  for (const call of everyCall) {
    assert.equal(Object.prototype.hasOwnProperty.call(call, 'to'), false,
      `a channel carried a recipient field: ${JSON.stringify(call)} — VIGIL-01 is operator-directed, `
      + 'and HEARTBEAT_MISSION\'s to:\'god\' is precisely what it must not be');
    assert.doesNotMatch(JSON.stringify(call), /"to"\s*:\s*"god"/,
      'a channel addressed the god. A beat addressed to the god cannot report that the god died');
  }

  // The copy changes, not just the flag — an operator reading "the floor has
  // stopped" would go looking for a stalled agent, not a missing orchestrator.
  assert.match(h.notified[0].title, /gone/, 'the god-death title must name the death');
  assert.match(h.notified[0].body, /orchestrator/i);
});

// ─── "with what was in flight when it stopped" ──────────────────────────────

test('VIGIL-01: the payload names the doing cards AT THE TRANSITION, not as they look when read', () => {
  const doing = [{ id: 't1', title: 'ship the thing', assignee: 'ada' }];
  const h = harness({ doing });
  h.advance(THRESHOLD + 1);
  h.wd.tick();

  // The board moves on after the alarm — in place AND by replacement, because a
  // watchdog that merely kept the reference passes the second and fails the first.
  doing.length = 0;
  doing.push({ id: 't9', title: 'something else', assignee: 'bob' });
  h.state.doing = [];

  const atTransition = [{ id: 't1', title: 'ship the thing', assignee: 'ada' }];
  assert.deepEqual(h.wd.current().inFlight, atTransition,
    'current() re-read doingCards() instead of reporting the transition-time set');
  assert.deepEqual(h.published[0].inFlight, atTransition,
    'the published snapshot re-read doingCards() instead of reporting the transition-time set');
  assert.match(h.notified[0].body, /1 card/, 'the toast must name what was in flight');
});

// ─── Four independent signals, four separate cases ──────────────────────────
//     One combined case would pass while three signals were ignored.

const SIGNALS = [
  ['a PTY producing output', (h) => { h.state.ptyIdleMs = 0; }],
  ['the ledger rev bumping', (h) => { h.state.rev += 1; }],
  ['an appendLog write', (h) => { h.state.lastEventAt = h.state.now; }],
  ['a telemetry cost sample landing', (h) => { h.state.lastSpendAt = h.state.now; }]
];

for (const [what, move] of SIGNALS) {
  test(`VIGIL-01: ${what} — on its own — clears the latch and re-arms the edge`, () => {
    const h = harness();
    h.advance(THRESHOLD + 1);
    h.wd.tick();
    assert.equal(h.notified.length, 1,
      'positive lower bound: the latch must be SET first, or "it cleared" means nothing');
    assert.notEqual(h.wd.current(), null);

    move(h);
    h.wd.tick();
    assert.equal(h.wd.current(), null, `${what} did not clear the latch — that signal is being ignored`);
    assert.equal(h.published.length, 2);
    assert.equal(h.published[1], null, 'the clear must publish null');
    assert.equal(h.notified.length, 1, 'clearing the latch is not itself an alarm');

    h.advance(THRESHOLD + 1);
    h.wd.tick();
    assert.equal(h.notified.length, 2, 'after real activity, a fresh quiet spell must be reportable again');
  });
}

// ─── current(): the accessor plan 04-17 reads through ───────────────────────

test('VIGIL-01: current() is null while the floor moves, and a LIVE duration once it has stopped', () => {
  const h = harness();
  assert.equal(h.wd.current(), null, 'a watchdog that has never ticked reports no quiet');
  h.wd.tick();
  assert.equal(h.wd.current(), null);

  h.advance(THRESHOLD + 1);
  h.wd.tick();
  const first = h.wd.current();
  assert.equal(typeof first.sinceMs, 'number');
  assert.ok(first.sinceMs >= THRESHOLD, `sinceMs was ${first.sinceMs}, expected at least the threshold`);
  assert.equal(first.godDead, false);

  // A DURATION, not a frozen number: the phone's strip says "nothing has moved
  // for 32m" and that has to keep counting (04-UI-SPEC rule G-3 — the client's
  // clock is not the floor's, so the wire carries elapsed time, never a deadline).
  h.advance(60_000);
  assert.ok(h.wd.current().sinceMs >= first.sinceMs + 60_000,
    'sinceMs did not advance with the clock — the surface would be frozen at the transition value');
});

// ─── The push channel's shape (UI-SPEC rule Q-4) ────────────────────────────

test('VIGIL-01 rule Q-4: the push title is self-sufficient on an INSTALLED OLD service worker', () => {
  for (const godAlive of [true, false]) {
    const h = harness({ godAlive });
    h.advance(THRESHOLD + 1);
    h.wd.tick();
    const p = h.pushed[0];
    // sw.js:26-42 hard-codes `body: 'is waiting on you'` and renders `data.agent`
    // as the TITLE. An old worker ignores any new `body`, so a title of `Floor`
    // renders as "Floor is waiting on you", which is false.
    assert.match(p.title, /stopped|gone/,
      `push title ${JSON.stringify(p.title)} is not a self-sufficient sentence fragment`);
    assert.notEqual(p.title, 'Floor');
    assert.notEqual(p.title, 'Alert');
    assert.equal(p.taskId, 'floor-quiet',
      'the alarm needs a distinct, stable tag so it replaces only itself and never a real ask');

    // …and the wire body sw.js actually parses puts that title in `agent`.
    const wire = floorQuietPushPayload(p);
    assert.equal(wire.agent, p.title, 'sw.js:31 reads data.agent as the notification title');
    assert.equal(wire.body, p.body);
    assert.equal(wire.taskId, FLOOR_QUIET_TAG);
  }
});

// ─── The shipped threshold, and the module's isolation ──────────────────────

test('VIGIL-01: the shipped default threshold is HEARTBEAT_MISSION\'s own quietThresholdMs, not a second number', () => {
  assert.equal(QUIET_THRESHOLD_MS, 300_000,
    'the default reuses config.ts\'s quietThresholdMs (300_000) — inventing a second quiet window is '
    + 'two controls that disagree');
});

test('VIGIL-01: watchdog.ts is electron-free, imports no floor subsystem, and is not the heartbeat', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'floor', 'watchdog.ts'), 'utf8');
  assert.ok(src.length > 500, 'positive lower bound: the file must exist and have content');
  assert.doesNotMatch(src, /from 'electron'/, 'the watchdog runs on all three CI runners');
  assert.doesNotMatch(src, /from '\.\.\/(pty|hive|telemetry|config)'/,
    'every collaborator arrives injected (floor/deps.ts house law) — importing the subsystem is the '
    + 'thing that makes it untestable outside a real floor');
  assert.doesNotMatch(src, /HEARTBEAT_MISSION/,
    'D-23: VIGIL-01 is a NEW operator-directed alarm, not a reuse of the god-directed heartbeat');
});
