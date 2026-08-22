'use strict';
/**
 * Circuit-breaker policy tests. Self-contained, no test framework — run with
 * `node test/breaker.test.cjs` (mirrors test/agent-provider.test.cjs). breaker.ts
 * only has type-only imports, so it transpiles standalone with the bundled
 * `typescript` compiler.
 *
 * Focus: the no-progress false-positive fixes (upstream issue #109 + fleet
 * evidence — compaction / inbox-ack bursts and background work tripping
 * "no-progress: generating tokens without coordinating"):
 *   1. compaction exemption — PreCompact→PostCompact (with safety cap) skips the
 *      Δoutput-based trips;
 *   2. recent DISTINCT tool activity counts as progress (an agent running varied
 *      tools is working — true loops are still caught by repeatedToolLimit);
 *   3. the no-progress arm requires 2 consecutive tripping beats (debounce) so a
 *      one-beat blip never fires a steer.
 * Plus regression guards for the pre-existing trips (loop, error storm, velocity).
 */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const SRC = path.join(__dirname, '..', 'src', 'main', 'breaker.ts');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'breaker-'));
const js = ts.transpileModule(fs.readFileSync(SRC, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
fs.writeFileSync(path.join(out, 'breaker.js'), js, 'utf8');
const { CircuitBreaker } = require(path.join(out, 'breaker.js'));

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.error(`FAIL  ${name}\n      ${e.message}`); }
}

/** A breaker with fixed config (no caps, hardStop off). */
function makeBreaker(over = {}) {
  return new CircuitBreaker(() => ({
    enabled: true, hardStop: false, repeatedToolLimit: 8, errorStormLimit: 5,
    tokenVelocityPerMin: 60000, ...over
  }));
}

/** Cumulative sample helper. */
function sample(agentId, ts, output, input = 1000) {
  return { agentId, sessionId: 's1', ts, input, output, cacheRead: 0, cacheCreation: 0, model: 'm', usd: 0 };
}

const T0 = 1_000_000_000_000; // fixed epoch base so tests are deterministic
const BEAT = 30_000;

/** Run one beat for a single agent; returns its decision. */
function beat(b, id, s, progressing, now) {
  return b.tick([{ agentId: id, sample: s, progressing }], now)[0];
}

// ── regression: pre-existing trips still fire ────────────────────────────────

test('repeated identical tool calls trip the loop arm', () => {
  const b = makeBreaker();
  for (let i = 0; i < 8; i++) b.recordToolUse('a', 'Bash', { cmd: 'same' });
  const d = beat(b, 'a', null, true, T0);
  assert.equal(d.state.level, 'steering');
  assert.match(d.state.reason, /looping/);
});

test('error storm trips', () => {
  const b = makeBreaker();
  for (let i = 0; i < 5; i++) b.recordError('a');
  const d = beat(b, 'a', null, true, T0);
  assert.equal(d.state.level, 'steering');
  assert.match(d.state.reason, /error storm/);
});

test('token velocity spike trips on the second sample', () => {
  const b = makeBreaker();
  beat(b, 'a', sample('a', T0, 0), true, T0);
  const d = beat(b, 'a', sample('a', T0 + BEAT, 40_000), true, T0 + BEAT); // 80k/min
  assert.equal(d.state.level, 'steering');
  assert.match(d.state.reason, /velocity/);
});

// ── fix 3: no-progress needs 2 consecutive tripping beats ───────────────────

test('no-progress does NOT trip on a single beat (debounce)', () => {
  const b = makeBreaker();
  beat(b, 'a', sample('a', T0, 0), false, T0);
  const d = beat(b, 'a', sample('a', T0 + BEAT, 500), false, T0 + BEAT);
  assert.equal(d.state.level, 'healthy', `reason: ${d.state.reason}`);
});

test('sustained no-progress still trips (second consecutive beat)', () => {
  const b = makeBreaker();
  beat(b, 'a', sample('a', T0, 0), false, T0);
  beat(b, 'a', sample('a', T0 + BEAT, 500), false, T0 + BEAT);
  const d = beat(b, 'a', sample('a', T0 + 2 * BEAT, 1000), false, T0 + 2 * BEAT);
  assert.equal(d.state.level, 'steering');
  assert.match(d.state.reason, /no-progress/);
});

test('a progressing beat resets the no-progress debounce', () => {
  const b = makeBreaker();
  beat(b, 'a', sample('a', T0, 0), false, T0);
  beat(b, 'a', sample('a', T0 + BEAT, 500), false, T0 + BEAT);       // count 1
  beat(b, 'a', sample('a', T0 + 2 * BEAT, 600), true, T0 + 2 * BEAT); // reset
  const d = beat(b, 'a', sample('a', T0 + 3 * BEAT, 1100), false, T0 + 3 * BEAT); // count 1 again
  assert.equal(d.state.level, 'healthy', `reason: ${d.state.reason}`);
});

// ── fix 1: compaction exemption ──────────────────────────────────────────────

test('compaction exempts the no-progress trip', () => {
  const b = makeBreaker();
  beat(b, 'a', sample('a', T0, 0), false, T0);
  b.recordCompactStart('a', T0 + 1);
  // Two beats of token burst with stale coordination — would trip without the fix.
  beat(b, 'a', sample('a', T0 + BEAT, 5000), false, T0 + BEAT);
  const d = beat(b, 'a', sample('a', T0 + 2 * BEAT, 9000), false, T0 + 2 * BEAT);
  assert.equal(d.state.level, 'healthy', `reason: ${d.state.reason}`);
});

test('compaction exempts the velocity trip', () => {
  const b = makeBreaker();
  beat(b, 'a', sample('a', T0, 0), true, T0);
  b.recordCompactStart('a', T0 + 1);
  const d = beat(b, 'a', sample('a', T0 + BEAT, 40_000), true, T0 + BEAT); // 80k/min burst
  assert.equal(d.state.level, 'healthy', `reason: ${d.state.reason}`);
});

test('trips resume after compaction end + trailing grace', () => {
  const b = makeBreaker();
  const GRACE = 120_000; // must cover POST_COMPACT_GRACE_MS
  beat(b, 'a', sample('a', T0, 0), false, T0);
  b.recordCompactStart('a', T0 + 1);
  b.recordCompactEnd('a', T0 + 2);
  const t1 = T0 + GRACE + BEAT;
  const t2 = t1 + BEAT;
  beat(b, 'a', sample('a', t1, 5000), false, t1);
  const d = beat(b, 'a', sample('a', t2, 6000), false, t2);
  assert.equal(d.state.level, 'steering', `reason: ${d.state.reason}`);
});

test('compaction safety cap: exemption expires even without PostCompact', () => {
  const b = makeBreaker();
  const CAP = 10 * 60_000; // must exceed COMPACT_GRACE_MS
  beat(b, 'a', sample('a', T0, 0), false, T0);
  b.recordCompactStart('a', T0 + 1); // PostCompact never arrives
  const t1 = T0 + CAP + BEAT;
  const t2 = t1 + BEAT;
  beat(b, 'a', sample('a', t1, 5000), false, t1);
  const d = beat(b, 'a', sample('a', t2, 6000), false, t2);
  assert.equal(d.state.level, 'steering', `reason: ${d.state.reason}`);
});

test('recordCompactEnd without a compaction in flight is a no-op', () => {
  const b = makeBreaker();
  beat(b, 'a', sample('a', T0, 0), false, T0);
  b.recordCompactEnd('a', T0 + 1); // e.g. SessionStart on a fresh session
  beat(b, 'a', sample('a', T0 + BEAT, 500), false, T0 + BEAT);
  const d = beat(b, 'a', sample('a', T0 + 2 * BEAT, 1000), false, T0 + 2 * BEAT);
  assert.equal(d.state.level, 'steering', `reason: ${d.state.reason}`); // still trips normally
});

// ── fix 2: recent distinct tool activity counts as progress ─────────────────

test('recent distinct tool calls exempt the no-progress trip', () => {
  const b = makeBreaker();
  beat(b, 'a', sample('a', T0, 0), false, T0);
  // Varied tool stream (background workflow / interactive work) right before each beat.
  b.recordToolUse('a', 'Read', { file: 'x' }, T0 + BEAT - 1000);
  beat(b, 'a', sample('a', T0 + BEAT, 5000), false, T0 + BEAT);
  b.recordToolUse('a', 'Read', { file: 'y' }, T0 + 2 * BEAT - 1000);
  const d = beat(b, 'a', sample('a', T0 + 2 * BEAT, 9000), false, T0 + 2 * BEAT);
  assert.equal(d.state.level, 'healthy', `reason: ${d.state.reason}`);
});

test('REPEATED identical tool calls do not count as progress', () => {
  const b = makeBreaker();
  b.recordToolUse('a', 'Bash', { cmd: 'same' }, T0 - 10 * 60_000); // distinct stamp long ago
  beat(b, 'a', sample('a', T0, 0), false, T0);
  b.recordToolUse('a', 'Bash', { cmd: 'same' }, T0 + BEAT - 1000); // repeat — no fresh stamp
  beat(b, 'a', sample('a', T0 + BEAT, 500), false, T0 + BEAT);
  b.recordToolUse('a', 'Bash', { cmd: 'same' }, T0 + 2 * BEAT - 1000);
  const d = beat(b, 'a', sample('a', T0 + 2 * BEAT, 1000), false, T0 + 2 * BEAT);
  assert.equal(d.state.level, 'steering', `reason: ${d.state.reason}`);
  assert.match(d.state.reason, /no-progress/);
});

// ── toolKey stays cheap AND discriminating on huge inputs ────────────────────

test('huge identical Write inputs still register as repeats (loop arm)', () => {
  const b = makeBreaker();
  const huge = { file_path: '/x.txt', content: 'A'.repeat(1_000_000) };
  for (let i = 0; i < 8; i++) b.recordToolUse('a', 'Write', huge);
  const d = beat(b, 'a', null, true, T0);
  assert.equal(d.state.level, 'steering');
  assert.match(d.state.reason, /looping/);
});

test('huge inputs differing early still count as distinct calls', () => {
  const b = makeBreaker();
  for (let i = 0; i < 8; i++) {
    b.recordToolUse('a', 'Write', { file_path: `/f${i}.txt`, content: 'A'.repeat(500_000) });
  }
  const d = beat(b, 'a', null, true, T0);
  assert.equal(d.state.level, 'healthy', `reason: ${d.state.reason}`);
});

// ── recovery still works ─────────────────────────────────────────────────────

test('a healthy beat de-escalates one level', () => {
  const b = makeBreaker();
  for (let i = 0; i < 8; i++) b.recordToolUse('a', 'Bash', { cmd: 'same' });
  beat(b, 'a', null, true, T0);                       // → steering
  b.recordToolUse('a', 'Read', { file: 'new' });       // distinct call clears the loop
  const d = beat(b, 'a', null, true, T0 + BEAT);
  assert.equal(d.state.level, 'healthy');
});

// ── FLOOR-10 revisited (a/CR-04): the >= 80% band is ADVISORY, not a shield ──
//
// `evaluate()` returns on the FIRST matching arm, and the budget band sits above
// the per-agent cap, both floor-wide caps, velocity and no-progress while
// returning `ceiling: 'steering'`. It therefore pinned the ladder at rank 1 AND
// skipped every harder arm below it: the arm added to ENFORCE a budget made the
// ceiling WEAKER. An agent at 85% of its card cap that was also the floor's
// biggest spender over `costCapUsd` could no longer be constrained at all.
//
// Every case asserts the level AFTER the last beat, driven through `tick()` —
// index.ts consumes `d.state.level` and `d.action`, never `evaluate()`'s return
// shape, so a decision-shape assertion would prove nothing about the floor.

/** One beat with a FULL input object. `beat()` passes no `budget`, so every
 *  composite case below needs this instead. */
function beatIn(b, input, now) { return b.tick([input], now)[0]; }

/** `sample()` carrying a dollar figure — the floor-wide cost cap's unit. */
const spending = (agentId, ts, usd, output = 0) => ({ ...sample(agentId, ts, output), usd });

/** A card INSIDE the band: 85% of its cap, so the band trips while the card
 *  itself implies no harder arm. */
const inBand = () => ({ taskId: 't-1', tokens: 8_500, cap: 10_000 });

test('a card in the band AND the floor top spender over the cost cap still reaches constrained', () => {
  const b = makeBreaker({ costCapUsd: 5 });
  const inp = (ts) => ({ agentId: 'a', sample: spending('a', ts, 12), progressing: true, budget: inBand() });

  assert.equal(beatIn(b, inp(T0), T0).state.level, 'steering'); // one rank per beat
  const d = beatIn(b, inp(T0 + BEAT), T0 + BEAT);
  assert.equal(d.state.level, 'constrained',
    `a card at 85% shielded the floor cost cap — the budget arm made the ceiling weaker (reason: ${d.state.reason})`);
  assert.match(d.state.reason, /cost cap/,
    `the operator reads the budget warning instead of the cap that actually fired: ${d.state.reason}`);
});

test('a card in the band AND over the per-agent token cap still reaches constrained', () => {
  const b = makeBreaker({ agentTokenCaps: { a: 1_000 } });
  const inp = (ts) => ({ agentId: 'a', sample: sample('a', ts, 0, 5_000), progressing: true, budget: inBand() });

  assert.equal(beatIn(b, inp(T0), T0).state.level, 'steering');
  const d = beatIn(b, inp(T0 + BEAT), T0 + BEAT);
  assert.equal(d.state.level, 'constrained',
    `a card at 85% shielded this agent OWN token cap (reason: ${d.state.reason})`);
  assert.match(d.state.reason, /token limit/, `wrong arm reported: ${d.state.reason}`);
});

test('a card in the band AND a token-velocity spike still reaches constrained', () => {
  const b = makeBreaker();
  const inp = (ts, output) => ({ agentId: 'a', sample: sample('a', ts, output), progressing: true, budget: inBand() });

  beatIn(b, inp(T0, 0), T0);
  const d = beatIn(b, inp(T0 + BEAT, 40_000), T0 + BEAT); // 80k/min
  assert.equal(d.state.level, 'constrained',
    `a card at 85% shielded the velocity arm (reason: ${d.state.reason})`);
  assert.match(d.state.reason, /velocity/, `wrong arm reported: ${d.state.reason}`);
});

// PRESERVED — the band-only agent must be exactly what it was.

test('a card in the band with every arm below it clear still warns and HOLDS at steering', () => {
  const b = makeBreaker();
  const ds = [0, 1, 2, 3].map((i) =>
    beatIn(b, { agentId: 'a', sample: sample('a', T0 + i * BEAT, 500), progressing: true, budget: inBand() }, T0 + i * BEAT));

  assert.deepEqual(ds.map((d) => d.state.level), ['steering', 'steering', 'steering', 'steering'],
    `the band stopped holding at steering: ${ds.map((d) => d.state.level).join(',')}`);
  assert.match(ds[3].state.reason, /^budget: card t-1 /, `the band reason string changed: ${ds[3].state.reason}`);
  assert.match(ds[3].state.reason, /85% of its cap/);
});

test('a card past 100% of its cap still trips with no ceiling of its own', () => {
  const b = makeBreaker();
  const inp = { agentId: 'a', sample: null, progressing: true, budget: { taskId: 't-9', tokens: 12_000, cap: 10_000 } };

  assert.equal(beatIn(b, inp, T0).state.level, 'steering');
  const d = beatIn(b, inp, T0 + BEAT);
  assert.equal(d.state.level, 'constrained');
  assert.match(d.state.reason, /over budget/);
});

test('a looping agent in the budget band still reports the LOOP first', () => {
  const b = makeBreaker();
  for (let i = 0; i < 8; i++) b.recordToolUse('a', 'Bash', { cmd: 'same' });
  const d = beatIn(b, { agentId: 'a', sample: null, progressing: true, budget: inBand() }, T0);
  assert.match(d.state.reason, /looping/, `a loop is a more urgent diagnosis than a budget: ${d.state.reason}`);
});

test('an api-error storm in the budget band still reports the STORM first', () => {
  const b = makeBreaker();
  for (let i = 0; i < 5; i++) b.recordError('a');
  const d = beatIn(b, { agentId: 'a', sample: null, progressing: true, budget: inBand() }, T0);
  assert.match(d.state.reason, /error storm/, `wrong arm reported: ${d.state.reason}`);
});

// RECORDED BEHAVIOUR CHANGE — asserted so it is a decision, not a discovery.
//
// The no-progress arm is STATEFUL (`s.noProgressBeats += 1`). While the band
// returned early that counter could never advance for a carded agent, so the arm
// was masked outright. Making the band advisory restores it: a card in the band
// that ALSO burns output tokens without coordinating now escalates past
// `steering`. That is a second, independent finding the arm predates FLOOR-10 to
// catch, and hardStop is off by default so the ladder still caps at
// `constrained`.

test('RECORDED CHANGE: a band card that also stops coordinating escalates on the no-progress arm', () => {
  const b = makeBreaker();
  const at = (i, output) =>
    beatIn(b, { agentId: 'a', sample: sample('a', T0 + i * BEAT, output), progressing: false, budget: inBand() }, T0 + i * BEAT);

  assert.equal(at(0, 0).state.level, 'steering');    // no baseline sample yet — band only
  assert.equal(at(1, 500).state.level, 'steering');  // no-progress beat 1 of NO_PROGRESS_BEATS
  const d = at(2, 1_000);                            // rising cumulative output, still not coordinating
  assert.equal(d.state.level, 'constrained',
    `the no-progress arm is still masked by the band (reason: ${d.state.reason})`);
  assert.match(d.state.reason, /no-progress/, `wrong arm reported: ${d.state.reason}`);
});

// NEGATIVE CONTROL — a change that makes a quiet agent trip is a worse outage
// than the mask it removes. Asserted BEFORE and AFTER the source change.

test('NEGATIVE CONTROL: an agent under every threshold stays healthy for several beats', () => {
  const b = makeBreaker(); // no cost cap, no floor token cap, no per-agent cap
  const levels = [0, 1, 2, 3, 4].map((i) => beatIn(b, {
    agentId: 'a',
    sample: sample('a', T0 + i * BEAT, 100),               // flat cumulative output — no Δ, no velocity
    progressing: true,                                     // coordinating
    budget: { taskId: 't-0', tokens: 4_000, cap: 10_000 }  // 40% — below the band
  }, T0 + i * BEAT).state.level);

  assert.deepEqual(levels, ['healthy', 'healthy', 'healthy', 'healthy', 'healthy'],
    `a quiet agent was tripped by this change: ${levels.join(',')}`);
});

process.exit(failures ? 1 : 0);
