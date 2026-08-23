'use strict';
/**
 * Engine-parity + cost-accounting tests (#19).
 *
 * The floor advertises eleven engines and used to give exactly one of them the
 * whole protocol. Three things had to become true, and each is checked here:
 *
 *   1. a PROXY-tier engine's CostSample reaches `getAgentUsage`, so qwen/crush
 *      can actually arm the circuit breaker instead of only filling a ledger;
 *   2. a per-agent token cap measures WORK (output + fresh input) and not
 *      session length (cache reads), upstream #189;
 *   3. every roster entry can state, in one line, whether its engine can receive
 *      mail, whether its spend is tracked, and whether it can compact;
 *   4. codex's rollout transcripts are readable, so its spend stops being
 *      invisible to every budget.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { TelemetryCollector } = loadTs('src/main/telemetry.ts');
const { CircuitBreaker } = loadTs('src/main/breaker.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');
const { readCodexUsage } = loadTs('src/main/usage.ts');
const { capabilityLine, providerCapabilities, remoteControlAvailability } =
  loadTs('src/shared/providerAutomation.ts');
const { bridgeOf, canReceiveInbox, AGENT_PROVIDER_PRESETS } = loadTs('src/shared/agentProvider.ts');
const { installKimiConfig } = loadTs('src/main/hiveProvisioning.ts');

/** One proxy-sidecar CostSample, in the shape hooks.ts builds for the ledger. */
function costSample(over = {}) {
  return {
    agentId: 'qwen-1',
    sessionId: 'proxy-session-1',
    ts: Date.now(),
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
    model: 'qwen3-coder-plus',
    usd: 0,
    ...over
  };
}

/** A breaker with fixed config (mirrors test/breaker.test.cjs's helper). */
function makeBreaker(over = {}) {
  return new CircuitBreaker(() => ({
    enabled: true, hardStop: false, repeatedToolLimit: 8, errorStormLimit: 5,
    tokenVelocityPerMin: 60000, ...over
  }));
}

// ── 1. a proxy engine's spend reaches the breaker ────────────────────────────

test('CostSamples accumulate into the same cumulative aggregate as OTel', () => {
  const t = new TelemetryCollector();
  t.recordCostSample(costSample({ input: 1000, output: 200, cacheRead: 50 }));
  t.recordCostSample(costSample({ input: 500, output: 100, cacheRead: 25, usd: 0.02 }));
  const s = t.getAgentUsage('qwen-1');
  // Samples are DELTAS for one response; the aggregate is their running total.
  assert.equal(s.input, 1500);
  assert.equal(s.output, 300);
  assert.equal(s.cacheRead, 75);
  assert.equal(s.usd, 0.02);
  assert.equal(s.sessionId, 'proxy-session-1');
  assert.equal(s.model, 'qwen3-coder-plus');
});

test('a CostSample from a proxy-tier engine arms the breaker', () => {
  const t = new TelemetryCollector();
  const b = makeBreaker({ agentTokenCaps: { 'qwen-1': 10_000 } });
  const now = 1_700_000_000_000;

  // Before any sample the engine is invisible: no sample, no trip. This is
  // exactly the old behaviour for the whole proxy tier.
  assert.equal(b.tick([{ agentId: 'qwen-1', sample: null, progressing: true }], now)[0].state.level, 'healthy');

  t.recordCostSample(costSample({ input: 9_000, output: 5_000 }));
  const d = b.tick([{ agentId: 'qwen-1', sample: t.getAgentUsage('qwen-1'), progressing: true }], now + 30_000)[0];
  assert.equal(d.state.level, 'steering');
  assert.match(d.state.reason, /token limit/);
});

test('a garbage sample cannot rewind a cumulative accumulator', () => {
  // The sidecar is a generated shim parsing someone else's wire format; a NaN or
  // a negative would read as spend going backwards, i.e. a free beat.
  const t = new TelemetryCollector();
  t.recordCostSample(costSample({ input: 1000, output: 100 }));
  t.recordCostSample(costSample({ input: -900, output: Number.NaN, cacheRead: undefined }));
  const s = t.getAgentUsage('qwen-1');
  assert.equal(s.input, 1000);
  assert.equal(s.output, 100);
});

test('a CostSample with no session key is dropped rather than mis-attributed', () => {
  const t = new TelemetryCollector();
  t.recordCostSample(costSample({ sessionId: '' }));
  assert.equal(t.getAgentUsage('qwen-1'), null);
});

// ── 1b. FLOOR-09: the sink is wired, proven through the REAL server ─────────
//
// The six calls above prove the COLLECTOR adds numbers up. They would all stay
// green if the `CostSample` branch in hooks.ts were deleted outright, because
// none of them goes anywhere near it. These two do: a payload is posted down the
// real hook socket, past the real `authorized()` gate, into the real branch, and
// the assertion reads the number back out of `getAgentUsage`.

/** A real hive root with a real HookServer listening on its real socket.
 *  `recordCost` is the eighth constructor argument — the same one production
 *  gets at index.ts's `new HookServer(...)`, so this test and production share
 *  one wiring shape instead of two. Pass `undefined` to model an UNWIRED floor. */
function hookFloor(t, recordCost) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-floor09-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  const server = new HookServer(
    hive, () => null, () => ({}), undefined, undefined, undefined, undefined, recordCost
  );
  server.start();
  t.after(() => server.stop());
  return { home, hive, server, sock: hive.sockPath() };
}

/** Post one payload down the socket exactly as a shim does, and resolve when the
 *  server has answered — so the assertion never races the handler. */
function postToSocket(sock, payload) {
  return new Promise((resolve, reject) => {
    const c = net.createConnection(sock, () => c.write(JSON.stringify(payload) + '\n'));
    let buf = '';
    c.on('data', (d) => { buf += d; });
    c.on('close', () => resolve(buf));
    c.on('error', reject);
  });
}

/** The payload PROXY_BRIDGE_SHIM synthesizes for one qwen response. */
const proxyCostPayload = (token, over = {}) => ({
  hook_event_name: 'CostSample',
  sock_token: token,
  // GATE-01: deliberately a LIE. Identity comes from the token, never from here.
  agent_id: 'someone-else',
  session_id: 'proxy-session-1',
  model: 'qwen3-coder-plus',
  input: 9_000,
  output: 5_000,
  cache_read: 100,
  cache_creation: 0,
  ...over
});

test('FLOOR-09: a CostSample posted at the hook socket reaches getAgentUsage and arms the breaker', async (t) => {
  const telemetry = new TelemetryCollector();
  const { server, sock } = hookFloor(t, (s) => telemetry.recordCostSample(s));
  const token = server.mintToken('qwen-1');

  const b = makeBreaker({ agentTokenCaps: { 'qwen-1': 10_000 } });
  const now = 1_700_000_000_000;
  assert.equal(
    b.tick([{ agentId: 'qwen-1', sample: null, progressing: true }], now)[0].state.level, 'healthy',
    'the baseline beat must be healthy or the second beat proves nothing'
  );

  // T-P06-01: the gate stays AHEAD of the cost path. FLOOR-09 must not open a
  // second, unauthenticated route into the accounting a budget is enforced on.
  await postToSocket(sock, proxyCostPayload('not-a-real-token'));
  assert.equal(
    telemetry.getAgentUsage('qwen-1'), null,
    'an unauthenticated CostSample was accounted — anything that can reach the socket can '
    + 'now poison a card\'s spend and trip (or dodge) its cap'
  );

  await postToSocket(sock, proxyCostPayload(token));

  // THIS ASSERTION IS FLOOR-09. A doc comment cannot satisfy it and neither can
  // a grep: the number only appears here if hooks.ts's CostSample branch really
  // called the injected sink.
  const s = telemetry.getAgentUsage('qwen-1');
  assert.ok(s, 'the proxy tier is invisible to getAgentUsage — its spend is archived but never budgeted');
  assert.equal(s.input, 9_000, 'the posted sample\'s input did not reach the collector intact');
  assert.equal(s.output, 5_000, 'the posted sample\'s output did not reach the collector intact');
  assert.equal(s.sessionId, 'proxy-session-1');

  const d = b.tick(
    [{ agentId: 'qwen-1', sample: telemetry.getAgentUsage('qwen-1'), progressing: true }],
    now + 30_000
  )[0];
  assert.equal(d.state.level, 'steering',
    'the sample reached getAgentUsage but did not move the breaker — a budget that cannot see '
    + 'the spend is not a budget');
  assert.match(d.state.reason, /token limit/);
});

test('FLOOR-09 negative control: with no cost sink injected, the same payload never reaches getAgentUsage', async (t) => {
  const telemetry = new TelemetryCollector();
  // Exactly what index.ts constructs TODAY — seven arguments, no sink. This is
  // the shape that goes red if 01-08 task 6's production injection is dropped.
  const { server, sock } = hookFloor(t, undefined);
  const token = server.mintToken('qwen-1');

  await postToSocket(sock, proxyCostPayload(token));

  assert.equal(
    telemetry.getAgentUsage('qwen-1'), null,
    'spend appeared with no sink wired, so the positive test above proves nothing about the '
    + 'wiring — something else is feeding the collector'
  );
});

// ── 1c. GATE-01: the qwen sidecar tier, handed over from 01-02 ──────────────
//
// 01-02 replaced the floor-wide hook secret with a per-agent mint and deleted
// `process.env.HIVE_SOCK_TOKEN = hookSockToken()` from index.ts. The proxy
// sidecar lived entirely on that assignment and PROXY_BRIDGE_SHIM sends no
// `sock_token` of its own, so the tier was dead-hooked. Both halves are needed:
// the env WITHOUT the shim field is a no-op, and these two tests are what say so.

/** A temp home with a bootstrapped hive in it. */
function tmpHive(t, prefix) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  return { home, hive, root: path.join(home, 'hive') };
}

/** A socket path this process can listen on, on either platform. */
function tmpSockPath() {
  const id = crypto.randomBytes(6).toString('hex');
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\md-shim-bytes-${id}`
    : path.join(os.tmpdir(), `md-shim-bytes-${id}.sock`);
}

test('GATE-01: the qwen sidecar env carries its OWN agent token, never the floor-wide one', async (t) => {
  const { home, hive, root } = tmpHive(t, 'md-sidecar-env-');

  // A decoy floor-wide value in THIS process's environment. 01-02 deleted the
  // assignment that used to put one here; reading it back would restore the
  // exact vulnerability GATE-01 removed, by a longer route.
  const prior = process.env.HIVE_SOCK_TOKEN;
  process.env.HIVE_SOCK_TOKEN = 'FLOOR-WIDE-DECOY';
  t.after(() => {
    if (prior === undefined) delete process.env.HIVE_SOCK_TOKEN;
    else process.env.HIVE_SOCK_TOKEN = prior;
  });

  const revoked = [];
  hive.setHookTokenSource((agentId) => `token-for-${agentId}`, (tk) => revoked.push(tk));

  // Stand in for the real sidecar with a recorder: it writes the environment it
  // was actually given, then reports a port so the spawn settles. This asserts
  // on the env a REAL spawn produced, not on a string in the source.
  const recorded = path.join(home, 'sidecar-env.json');
  fs.writeFileSync(
    path.join(root, 'bin', 'hive-proxy.cjs'),
    `require('fs').writeFileSync(${JSON.stringify(recorded)}, JSON.stringify(process.env));\n`
    + "process.stdout.write(JSON.stringify({ port: 4242 }) + '\\n');\n"
  );

  const port = await hive.startProxyBridge('qwen-1', {
    sock: 'unused-in-this-test', sessionId: 'proxy-session-1', api: 'openai', upstream: 'http://127.0.0.1:1'
  });
  assert.equal(port, 4242, 'the sidecar never reported a port, so nothing was recorded and this test proves nothing');

  const env = JSON.parse(fs.readFileSync(recorded, 'utf8'));
  assert.equal(env.HIVE_SOCK_TOKEN, 'token-for-qwen-1',
    'the sidecar is spawned without its own hook token, so authorized() drops every payload it '
    + 'sends: no live status, no Stop→drain and no cost rows for the whole qwen/crush tier');
  assert.notEqual(env.HIVE_SOCK_TOKEN, 'FLOOR-WIDE-DECOY',
    'the sidecar read the floor-wide secret out of process.env — that is the single shared key '
    + 'GATE-01 exists to delete, reintroduced');
  assert.equal(env.AGENT_ID, 'qwen-1');

  hive.stopProxyBridge('qwen-1');
  assert.deepEqual(revoked, ['token-for-qwen-1'],
    'the sidecar\'s token outlived its sidecar — a revoked-nowhere token is a credential with no expiry');
});

test('GATE-01: PROXY_BRIDGE_SHIM puts sock_token in the BYTES it writes, not just in its source', async (t) => {
  const { root } = tmpHive(t, 'md-shim-bytes-');

  // The REAL file `ensureHive()` writes out of the PROXY_BRIDGE_SHIM template —
  // the exact bytes a qwen agent's sidecar executes, not a re-derived copy. A
  // grep proves the field is in the template; only running it proves the field
  // is in the payload the socket receives. One line is appended to call the
  // shim's own `emit()`; everything above it is the shipped shim verbatim.
  const shimFile = path.join(root, 'bin', 'hive-proxy-driven.cjs');
  fs.writeFileSync(
    shimFile,
    fs.readFileSync(path.join(root, 'bin', 'hive-proxy.cjs'), 'utf8')
    + "\nemit({ hook_event_name: 'CostSample', agent_id: AGENT_ID, session_id: SESSION, input: 7, output: 3 });\n"
    + 'setTimeout(function () { process.exit(0); }, 400);\n'
  );

  const capture = async (token) => {
    const sock = tmpSockPath();
    const lines = [];
    const server = net.createServer((c) => {
      let buf = '';
      c.on('data', (d) => { buf += d; });
      c.on('end', () => { if (buf) lines.push(buf); });
      c.on('error', () => { /* the shim hangs up — its own fire-and-forget */ });
    });
    await new Promise((r) => server.listen(sock, r));
    const env = { ...process.env, HIVE_SOCK: sock, AGENT_ID: 'qwen-1', HIVE_PROXY_SESSION: 'proxy-session-1' };
    if (token === null) delete env.HIVE_SOCK_TOKEN;
    else env.HIVE_SOCK_TOKEN = token;
    const child = spawn(process.execPath, [shimFile], { env, stdio: ['ignore', 'ignore', 'ignore'] });
    await new Promise((r) => child.on('exit', r));
    await new Promise((r) => server.close(r));
    if (process.platform !== 'win32') { try { fs.rmSync(sock); } catch { /* already gone */ } }
    assert.equal(lines.length, 1, `the shim wrote ${lines.length} payloads, expected exactly 1`);
    return JSON.parse(lines[0].trim());
  };

  const withToken = await capture('SENTINEL-TOKEN-abc123');
  assert.equal(withToken.hook_event_name, 'CostSample');
  assert.equal(withToken.sock_token, 'SENTINEL-TOKEN-abc123',
    'the sidecar shim writes no sock_token into its payload, so adding HIVE_SOCK_TOKEN to its '
    + 'env is a NO-OP: it reads a variable it never sends and authorized() drops it anyway');

  // The pre-fix behaviour, kept legible: with no token in the environment the
  // field is the empty string, which is exactly what authorized() rejects (the
  // FLOOR-09 test above pins that rejection with a real HookServer).
  const withoutToken = await capture(null);
  assert.equal(withoutToken.sock_token, '',
    'a shim with no token in its env must still SEND the field, empty — a missing field and an '
    + 'empty one are dropped alike, but only the empty one says which half is broken');
});

test('GATE-01 backstop: the hive\'s own git does not run an agent-planted pre-commit hook', async (t) => {
  const { home, hive, root } = tmpHive(t, 'md-git-hooks-');

  // What a prompt-injected agent plants. The hive root IS a git repo and both
  // git wrappers spawn as children of the Electron MAIN process, inheriting
  // main's environment — so this would run with more privilege than the agent
  // that wrote it, from outside the PreToolUse write gate.
  const sentinel = path.join(home, 'pwned');
  const hooks = path.join(root, '.git', 'hooks');
  fs.mkdirSync(hooks, { recursive: true });
  const hook = path.join(hooks, 'pre-commit');
  fs.writeFileSync(hook, `#!/bin/sh\necho pwned > "${sentinel.replace(/\\/g, '/')}"\nexit 1\n`);
  fs.chmodSync(hook, 0o755);

  // A real commit through the real wrapper: writeTasks persists and commits.
  hive.writeTasks([{
    id: 't-hook', title: 't-hook', status: 'todo', dependsOn: [], priority: 3,
    createdAt: '2026-08-21T00:00:00.000Z'
  }]);
  await hive.flushCommit(root);   // the real debounced commit body, driven synchronously

  assert.equal(fs.existsSync(sentinel), false,
    'the hive ran an agent-planted git hook. <hive>/.git/hooks/pre-commit is arbitrary code '
    + 'execution as a child of the Electron main process, and core.hooksPath is what stops it');

  // And the commit still happened — a suppression that also breaks committing
  // would be traded for a different failure.
  const log = spawnSync('git', ['log', '--oneline'], { cwd: root, encoding: 'utf8' });
  assert.equal(log.status, 0, `git log failed in the hive root: ${log.stderr}`);
  assert.ok(log.stdout.trim().length > 0,
    'nothing was committed, so the hook may simply never have had a chance to run');
});

// ── 2. caps measure work, not session length (upstream #189) ─────────────────

/** A cumulative sample with an explicit token split. */
function usage(agentId, { input = 0, output = 0, cacheRead = 0, cacheCreation = 0 } = {}) {
  return { agentId, sessionId: 's', ts: 1, input, output, cacheRead, cacheCreation, model: 'm', usd: 0 };
}

test('the per-agent cap ignores cached input', () => {
  const b = makeBreaker({ agentTokenCaps: { a: 100_000 } });
  // 2M of cache reads: a long session re-reading a big prompt, no work done.
  const d = b.tick([{ agentId: 'a', sample: usage('a', { input: 10_000, output: 5_000, cacheRead: 2_000_000 }), progressing: true }], 1)[0];
  assert.equal(d.state.level, 'healthy', d.state.reason);
});

test('the per-agent cap still trips on output + fresh input', () => {
  const b = makeBreaker({ agentTokenCaps: { a: 100_000 } });
  const d = b.tick([{ agentId: 'a', sample: usage('a', { input: 60_000, output: 50_000, cacheRead: 0 }), progressing: true }], 1)[0];
  assert.equal(d.state.level, 'steering');
  assert.match(d.state.reason, /billable tokens/);
});

test('the FLOOR budget still counts every token kind', () => {
  // costCapTokens documents itself as input+output+cacheRead+cacheCreation and
  // the Command Center meter renders that same number — it must not drift.
  const b = makeBreaker({ costCapTokens: 100_000 });
  const d = b.tick([{ agentId: 'a', sample: usage('a', { input: 1_000, output: 1_000, cacheRead: 500_000 }), progressing: true }], 1)[0];
  assert.equal(d.state.level, 'steering');
  assert.match(d.state.reason, /token cap/);
});

// ── 2b. FLOOR-10: the per-card budget is ENFORCED, not merely reported ───────
//
// The budget arm is the FIRST consumer `taskSpend().over` ever had: before this
// plan `grep -rn "\.over\b" src/ --include=*.ts` returned nothing at all, so the
// number was computed, attributed, persisted — and acted on by nobody.
//
// Pitfall 6, which these tests exist to not fall into: `evaluate()` returns a
// BOOLEAN, not a level, and `tick()` escalates ONE rank per beat. A budget test
// with a single `tick()` sees `steering` and gets "fixed" by asserting it,
// silently accepting a cap that never constrains. Every test below asserts the
// FINAL level after the last beat.
//
// What they do NOT prove: that the production beat ever populates
// `BreakerInput.budget`. Each one builds its own input. That wiring assertion
// reads main's breaker beat at source and lands in plan 01-10's commit, alongside the one
// line it asserts — see 01-09-SUMMARY.md § "T-INDEX HANDOFF → 01-10 (FLOOR-10)".

/** One beat's input for an agent with a card in flight — exactly the shape
 *  the hive's per-agent budget accessor returns, fed the way `runBreakerBeat` will
 *  feed it. `sample: null` keeps every OTHER arm silent, so a trip here can only
 *  have come from the budget arm. */
const carded = (agentId, taskId, tokens, cap) => ({
  agentId, sample: null, progressing: true, budget: { taskId, tokens, cap }
});

const NOW = 1_700_000_000_000;
const BEAT = 30_000;

test('FLOOR-10: an over-cap card takes its assignee to constrained — on the SECOND beat', () => {
  const b = makeBreaker();
  const input = [carded('jim-1', 't-1', 12_000, 10_000)];

  const first = b.tick(input, NOW)[0];
  assert.equal(first.state.level, 'steering',
    'beat 1 must be steering by construction (one rank per beat from healthy). If this is '
    + 'already healthy the arm never tripped at all and the next assertion proves nothing');

  const second = b.tick(input, NOW + BEAT)[0];
  assert.equal(second.state.level, 'constrained',
    'a card 20% past its token cap never reached the level that actually stops active work. '
    + 'The budget is reported and not enforced, which is the whole of FLOOR-10');
  assert.match(second.state.reason, /over budget/,
    'the operator reads this string — it must say the card is over budget, not name some '
    + 'other arm that happened to trip first');
  assert.match(second.state.reason, /t-1/,
    'the reason names no card, so the operator cannot tell WHICH card burned the budget');
  assert.equal(second.action, 'constrain',
    'the level moved but no action was emitted, so the beat sends no constrain message and '
    + 'fires no operator toast — a silent stop is the failure D-18 exists to prevent');
});

test('FLOOR-10: the same spend against a generous cap is not stopped early', () => {
  const b = makeBreaker();
  const input = [carded('jim-1', 't-1', 12_000, 10_000_000)];

  assert.equal(b.tick(input, NOW)[0].state.level, 'healthy');
  assert.equal(b.tick(input, NOW + BEAT)[0].state.level, 'healthy',
    'a card at 0.12% of its cap was stopped. This is the arithmetic 01-06 corrected: summing '
    + 'cumulative snapshots instead of diffing them over-counts roughly quadratically, and a '
    + 'generous cap then trips anyway');
});

test('FLOOR-10: a card at 85% of its cap steers and STAYS steering — it is a warning, not a stop', () => {
  const b = makeBreaker();
  const input = [carded('jim-1', 't-1', 8_500, 10_000)];

  assert.equal(b.tick(input, NOW)[0].state.level, 'steering',
    'the >= 80% band did not warn at all, so a card gets no notice before it is stopped');

  const second = b.tick(input, NOW + BEAT)[0];
  assert.equal(second.state.level, 'steering',
    'a card that is merely NEAR its cap was escalated to constrained. The >= 80% band is a '
    + 'warning to the assignee; only a real overage may stop active work');
  assert.match(second.state.reason, /85% of its cap/,
    'the warning must say how close to the cap the card is, or it reads as an unexplained steer');

  assert.equal(b.tick(input, NOW + 2 * BEAT)[0].state.level, 'steering',
    'the level oscillated instead of holding. A warn/recover flip re-escalates every other '
    + 'beat, and each escalation re-sends the steer mail to the assignee');
});

test('FLOOR-10: only the assignee is affected — the breaker is per-agent, never a floor-wide trip', () => {
  const b = makeBreaker();
  // pam-1 has NO card in flight, which is what a null from that accessor
  // looks like at the beat: the property is simply absent.
  const inputs = [
    carded('jim-1', 't-1', 12_000, 10_000),
    { agentId: 'pam-1', sample: null, progressing: true }
  ];

  b.tick(inputs, NOW);
  const second = b.tick(inputs, NOW + BEAT);
  const level = (id) => second.find((d) => d.state.agentId === id).state.level;

  assert.equal(level('jim-1'), 'constrained');
  assert.equal(level('pam-1'), 'healthy',
    'an agent with no card in flight was dragged down by someone else\'s budget. One expensive '
    + 'card would then stop the whole floor, which is the failure mode that made a per-agent '
    + 'breaker the right place for this arm in the first place');
});

test('FLOOR-10 / D-18: four beats far over cap and the agent is never stopped, only constrained', () => {
  // makeBreaker ships hardStop false — the shipped default, deliberately not
  // overridden here, because the ceiling IS the assertion.
  const b = makeBreaker();
  const input = [carded('jim-1', 't-1', 999_999, 1_000)];

  const levels = [0, 1, 2, 3].map((i) => b.tick(input, NOW + i * BEAT)[0].state.level);

  assert.deepEqual(levels, ['steering', 'constrained', 'constrained', 'constrained'],
    'the ladder did not settle at constrained. One rank per beat, and the ceiling holds');
  assert.ok(!levels.includes('stopped'),
    'a card 1000x over its cap reached `stopped`, which archives an agent that may hold '
    + 'unsaved work. D-18: over-budget means PAUSED AND REPORTED. A hard kill stays behind '
    + 'the explicit config opt-in and must never be reached by adding a budget');
});

// ── 3. the capability line the god is oriented with ─────────────────────────

test('the capability line is honest about a mail-capable engine', () => {
  assert.equal(
    capabilityLine('claude'),
    'claude: mail ok, spend tracked (otel), compacts /compact, remote control ok'
  );
});

test('the capability line SHOUTS about a mail-incapable engine', () => {
  // PARITY-01a gave kimi a hook bridge (below), so the mail-incapable case this
  // test exists to cover is re-pointed at copilot — print mode exits per turn,
  // no hook bridge captures idle, so a copilot worker's mail still bounces to
  // the god. Re-pointed, never deleted: this is the only test of the gap
  // vocabulary's shouting behaviour.
  assert.equal(
    capabilityLine('copilot'),
    'copilot: NO MAIL (bounces to you), spend UNTRACKED (invisible to every budget), '
    + 'NO COMPACT (context cannot be reclaimed), NO REMOTE CONTROL'
  );
});

test('the capability line now reads mail ok for kimi (PARITY-01a)', () => {
  // Kimi has a per-agent hook bridge as of this plan (installKimiConfig,
  // hiveProvisioning.ts) — mail routed to a kimi worker is delivered, not
  // bounced, even though the bridge itself ships LIVE-UNVERIFIED (D-33).
  assert.equal(
    capabilityLine('kimi'),
    'kimi: mail ok, spend UNTRACKED (invisible to every budget), '
    + 'compacts /compact, NO REMOTE CONTROL'
  );
});

test('the capability line names the other two gaps too', () => {
  // crush: proxy-tracked spend but no typeable compaction verb at all.
  assert.equal(
    capabilityLine('crush'),
    'crush: mail ok, spend tracked (proxy), NO COMPACT (context cannot be reclaimed), '
    + 'NO REMOTE CONTROL'
  );
  // copilot: print mode exits per turn — no mail, no prompt to compact into.
  assert.match(capabilityLine('copilot'), /NO MAIL .*spend UNTRACKED.*NO COMPACT/);
});

test('every engine answers all five capability questions', () => {
  for (const p of ['claude', 'codex', 'grok', 'kimi', 'antigravity', 'qwen',
    'opencode', 'crush', 'pi', 'copilot', 'custom']) {
    const c = providerCapabilities(p);
    assert.equal(typeof c.mail, 'boolean', p);
    // FLOOR-18 / Rule C-1b — a missing bit reads as `undefined`, which is
    // falsy, which would silently SHOUT the gap at every engine. Type it,
    // don't truth it — same reasoning as the `remote` assertion below.
    assert.equal(typeof c.mcp, 'boolean', p);
    assert.ok(['otel', 'proxy', 'transcript', 'none'].includes(c.spend), `${p}: ${c.spend}`);
    assert.ok(c.compact === null || typeof c.compact === 'string', p);
    assert.equal(typeof c.remote, 'boolean', p);
  }
});

// Rule C-1b — the eleven `mcp` values against an explicit committed map, so a
// preset that flips goes red rather than being absorbed by the `typeof` check
// above. D-26's scoreboard: pi and custom have no native MCP surface; the
// other nine do (antigravity's per-agent surface is UNVERIFIED but the CLI
// capability itself is documented).
test('the mcp bit matches D-26\'s per-engine scoreboard exactly', () => {
  const expected = {
    claude: true, codex: true, grok: true, kimi: true, antigravity: true,
    qwen: true, opencode: true, crush: true, pi: false, copilot: true, custom: false
  };
  for (const [p, mcp] of Object.entries(expected)) {
    assert.equal(providerCapabilities(p).mcp, mcp, `${p}: expected mcp=${mcp}`);
  }
});

// Rule C-1b's closing sentence: capabilityLine's STRING is not extended with
// an MCP clause. Named for what it pins, not for what it counts.
test('capabilityLine did not grow an MCP clause', () => {
  assert.equal(capabilityLine('claude').split(', ').length, 4);
  assert.ok(!/mcp/i.test(capabilityLine('pi')), capabilityLine('pi'));
});

// Both arities pinned together (UI-SPEC Rule C-1a / D-40): providerCapabilities
// gained an optional platform parameter for the renderer; capabilityLine did
// not grow one, ever — it stays a one-argument prompt-string builder.
test('providerCapabilities took an optional platform; capabilityLine stayed one argument', () => {
  assert.equal(providerCapabilities.length, 2);
  assert.equal(capabilityLine.length, 1);
});

// FLOOR-18 — Codex-on-Windows is a DECLARED limitation (D-39/D-40), so the
// declaration itself is the thing under test. Both branches are asserted on every
// runner: `remoteControlAvailability` takes the platform as a defaulted argument
// precisely so an ubuntu CI job still proves the Windows string, and a Windows CI
// job still proves the non-Windows one.
test('the capability line declares the Codex Windows gap, and only where it is real', () => {
  assert.equal(remoteControlAvailability('codex', 'win32'), 'windows');
  assert.equal(remoteControlAvailability('codex', 'darwin'), 'ok');
  assert.equal(remoteControlAvailability('codex', 'linux'), 'ok');

  // The clause appears for codex when the remote bit is false…
  const onWindows = capabilityLine('codex').includes('REMOTE CONTROL unavailable on Windows');
  assert.equal(onWindows, providerCapabilities('codex').remote === false,
    'the shouted Windows clause and the `remote` bit disagree — capabilityLine is not '
    + 'reading the bit it claims to read');
  assert.equal(providerCapabilities('codex').remote, process.platform !== 'win32');

  // …and never for an engine whose remote control is simply absent, which would
  // blame Windows for a gap that exists on every platform.
  for (const p of ['grok', 'kimi', 'qwen', 'opencode', 'crush', 'pi', 'copilot',
    'antigravity', 'custom']) {
    assert.equal(remoteControlAvailability(p, 'win32'), 'none', p);
    assert.ok(!capabilityLine(p).includes('unavailable on Windows'), p);
    assert.ok(capabilityLine(p).includes('NO REMOTE CONTROL'), p);
  }

  // Claude's remote control is a typed slash command, so it is never platform-gated.
  assert.equal(remoteControlAvailability('claude', 'win32'), 'ok');
  assert.ok(capabilityLine('claude').includes('remote control ok'));
});

test('the shouted gaps stay uppercase and the present capabilities stay quiet', () => {
  // The copy contract the god is trained on: gaps SHOUT, present capabilities
  // stay lowercase. A new clause that mixed the two would make every gap harder
  // to skim, which is the whole reason the convention exists (#19).
  assert.match(capabilityLine('copilot'),
    /NO MAIL .*spend UNTRACKED.*NO COMPACT.*NO REMOTE CONTROL/);
  assert.ok(!capabilityLine('claude').includes('NO '), capabilityLine('claude'));
  assert.equal(capabilityLine('claude').split(', ').length, 4);
});

// ── 3b. PARITY-01a: kimi's hook bridge ───────────────────────────────────────
//
// Kimi is bridged as the CODEX case (per-agent --config-file, HOOK_SHIM reused
// verbatim), not the grok case (a translating adapter). Ships LIVE-UNVERIFIED —
// no Moonshot account exists on this machine to run a live kimi session.

test('bridgeOf resolves kimi to a hooks bridge, and kimi is now mail-eligible', () => {
  assert.deepEqual(bridgeOf('kimi'), { kind: 'hooks', shim: 'kimi' });
  assert.equal(canReceiveInbox('kimi'), true);
});

test('installKimiConfig seeds from the operator\'s own config.toml (auth survives)', () => {
  const userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'md-kimi-userhome-'));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-kimi-agent-'));
  try {
    const kimiDir = path.join(userHome, '.kimi');
    fs.mkdirSync(kimiDir, { recursive: true });
    const sentinel = 'oauth_token = "SENTINEL-CREDENTIAL-abc123"';
    const userConfigPath = path.join(kimiDir, 'config.toml');
    fs.writeFileSync(userConfigPath, `model = "kimi-k2"\n${sentinel}\n`, 'utf8');
    const before = { content: fs.readFileSync(userConfigPath, 'utf8'), mtime: fs.statSync(userConfigPath).mtimeMs };

    const shim = path.join(agentDir, 'cth-hook.cjs');
    const nodeRun = (s) => `"node" "${s}"`;
    const result = installKimiConfig({ dir: agentDir, shim, nodeRun, userHome });

    assert.equal(result, path.join(agentDir, 'kimi-config.toml'), 'must return a FILE path, not a directory');
    const written = fs.readFileSync(result, 'utf8');

    // The auth survives — byte-for-byte, not re-derived.
    assert.ok(written.includes(sentinel), 'the operator\'s credential did not survive the seed');

    // LANDMINE 4, both directions: a flat [[hooks]] table, never nested [[hooks.<Event>]].
    assert.match(written, /\[\[hooks\]\]\s*\nevent = "Stop"/, 'no flat [[hooks]] table for Stop');
    assert.ok(!written.includes('[[hooks.Stop]]'), 'wrote codex\'s NESTED shape — kimi cannot parse this');
    assert.ok(!written.includes('[[hooks.'), 'wrote a nested [[hooks.*]] table somewhere');

    // The operator's OWN file is never touched.
    const after = { content: fs.readFileSync(userConfigPath, 'utf8'), mtime: fs.statSync(userConfigPath).mtimeMs };
    assert.deepEqual(after, before, 'installKimiConfig wrote into the operator\'s own ~/.kimi/config.toml');

    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(result).mode & 0o777, 0o600, 'the seeded credential file must be owner-only');
    } else {
      console.error('[engine-parity] kimi config mode case skipped — chmod 0o600 is not a POSIX permission on win32');
    }
  } finally {
    fs.rmSync(userHome, { recursive: true, force: true });
    fs.rmSync(agentDir, { recursive: true, force: true });
  }
});

test('a kimi worker\'s spawn argv carries --config-file pointed at its own kimi-config.toml', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-kimi-spawn-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const realHome = process.env.HOME;
  const realProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(() => {
    if (realHome === undefined) delete process.env.HOME; else process.env.HOME = realHome;
    if (realProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = realProfile;
  });

  const hive = new HiveManager(() => home);
  const spawned = await hive.ensureAgent({ id: 'kimi-1', name: 'K', provider: 'kimi', cwd: home });

  const i = spawned.args.indexOf('--config-file');
  assert.ok(i >= 0, `--config-file missing from argv: ${JSON.stringify(spawned.args)}`);
  assert.ok(
    spawned.args[i + 1] && spawned.args[i + 1].endsWith('kimi-config.toml'),
    `--config-file's value does not end in kimi-config.toml: ${spawned.args[i + 1]}`
  );
});

test('a kimi worker\'s dropped protocol is recorded, not silently swallowed (D-33)', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-kimi-log-'));
  try {
    const realHome = process.env.HOME;
    const realProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    try {
      const hive = new HiveManager(() => home);
      // Kimi has no initialPromptFlag, no seedDelivery and no positionalInitialPrompt
      // — it falls all the way through ensureAgent's injection branch, exactly the
      // shape 'protocol-not-seeded' exists to catch.
      await hive.ensureAgent({ id: 'kimi-2', name: 'K2', provider: 'kimi', cwd: home });
    } finally {
      if (realHome === undefined) delete process.env.HOME; else process.env.HOME = realHome;
      if (realProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = realProfile;
    }

    const log = fs.readFileSync(path.join(home, 'hive', 'log.jsonl'), 'utf8')
      .trim().split('\n').map((l) => JSON.parse(l));
    const entry = log.find((e) => e.kind === 'protocol-not-seeded' && e.agentId === 'kimi-2');
    assert.ok(entry, `no protocol-not-seeded entry for kimi-2 in log.jsonl: ${JSON.stringify(log)}`);
    assert.equal(entry.provider, 'kimi');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('T-P02-07-01: a real hive commit never carries the seeded kimi credential', async (t) => {
  // The live proof, not the intention: build a real hive, seed a sentinel
  // credential into a fake ~/.kimi/config.toml, spawn a kimi worker for real
  // (which calls installKimiConfig), drive the hive's own commit path, and
  // inspect the REAL git history — not a mock of it.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-kimi-credential-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const realHome = process.env.HOME;
  const realProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(() => {
    if (realHome === undefined) delete process.env.HOME; else process.env.HOME = realHome;
    if (realProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = realProfile;
  });
  assert.equal(os.homedir(), home, 'home redirect failed — aborting before touching the real home');

  const sentinel = 'SENTINEL-KIMI-OAUTH-token-9f3e';
  const kimiDir = path.join(home, '.kimi');
  fs.mkdirSync(kimiDir, { recursive: true });
  fs.writeFileSync(path.join(kimiDir, 'config.toml'), `oauth_token = "${sentinel}"\n`, 'utf8');

  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'kimi-cred', name: 'K', provider: 'kimi', cwd: home });

  const root = path.join(home, 'hive');
  const agentDir = path.join(root, 'agents', 'kimi-cred');

  // (i) the credential really did get copied — the containment proof means
  // nothing if the installer never wrote it in the first place.
  const written = fs.readFileSync(path.join(agentDir, 'kimi-config.toml'), 'utf8');
  assert.ok(written.includes(sentinel), 'installKimiConfig did not seed the sentinel credential onto disk');

  // Drive the hive's own debounced commit body synchronously (same pattern as
  // the GATE-01 backstop test above).
  await hive.flushCommit(root);

  // (ii) the commit path really ran.
  const log = spawnSync('git', ['log', '--oneline'], { cwd: root, encoding: 'utf8' });
  assert.equal(log.status, 0, `git log failed in the hive root: ${log.stderr}`);
  const commitCount = log.stdout.trim().split('\n').filter(Boolean).length;
  assert.ok(commitCount >= 1, 'nothing was committed — the containment proof below would prove nothing');

  // (iii) the file was never staged.
  const lsFiles = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  assert.equal(lsFiles.status, 0, `git ls-files failed: ${lsFiles.stderr}`);
  const tracked = lsFiles.stdout.split('\n').filter((f) => f.endsWith('kimi-config.toml'));
  assert.deepEqual(tracked, [], `kimi-config.toml is tracked by git: ${JSON.stringify(tracked)}`);

  // (iv) the sentinel never entered git history at all, even via a stray line
  // inside some OTHER committed file.
  const logP = spawnSync('git', ['log', '-p'], { cwd: root, encoding: 'utf8' });
  assert.equal(logP.status, 0, `git log -p failed: ${logP.stderr}`);
  assert.equal((logP.stdout.match(new RegExp(sentinel, 'g')) || []).length, 0,
    'the seeded OAuth credential appears in git history');

  // The ignore line itself, proven directly.
  const gitignore = fs.readFileSync(path.join(agentDir, '.gitignore'), 'utf8');
  assert.match(gitignore, /^kimi-config\.toml$/m, '.gitignore does not exclude kimi-config.toml');
});

// ── 3c. PARITY-02: the cost declaration matches the wiring (D-34) ───────────
//
// `bridgeOf` returns ONE descriptor per engine and hive.ts's dispatch is
// `hooks` XOR `proxy` (BridgeDescriptor's doc comment, agentProvider.ts), so
// there is no zero-code way to add proxy-tier cost to a hooks-bridged engine
// without deleting its mail bridge. This plan converts ZERO engines; these
// four assertions are PARITY-02's entire automated half — the declaration
// staying honest about the wiring, checked in both directions, for every
// preset.

test('PARITY-02: costTracking === "proxy" iff the wired bridge is a proxy, for every preset', () => {
  for (const p of AGENT_PROVIDER_PRESETS) {
    const desc = bridgeOf(p.id);
    const wiredProxy = desc?.kind === 'proxy';
    assert.equal(
      p.costTracking === 'proxy', wiredProxy,
      `${p.id}: costTracking=${p.costTracking} but bridgeOf=${JSON.stringify(desc)} — the `
      + 'declaration and the spawn-time wiring have drifted apart'
    );
  }
});

test('PARITY-02: no preset sets both bridge and hookBridge (mutual exclusivity)', () => {
  // The pin that stops a future "just add proxy cost to grok" edit from
  // silently deleting grok's mail bridge — bridgeOf's `if (preset.bridge)
  // return preset.bridge;` means a hookBridge alongside an explicit `bridge`
  // is DEAD, never both-and.
  for (const p of AGENT_PROVIDER_PRESETS) {
    assert.ok(
      !(p.bridge && p.hookBridge),
      `${p.id} sets BOTH bridge (${JSON.stringify(p.bridge)}) and hookBridge `
      + `(${p.hookBridge}) — bridgeOf returns preset.bridge only, so the hookBridge is dead `
      + 'weight and whoever added it believes it still wires the hooks path'
    );
  }
});

test('PARITY-02: the costTracking:"none" set is an explicit, diff-visible list', () => {
  const NONE_ENGINES = ['grok', 'kimi', 'antigravity', 'opencode', 'pi', 'copilot', 'custom'];
  const actual = AGENT_PROVIDER_PRESETS.filter((p) => p.costTracking === 'none').map((p) => p.id);
  assert.deepEqual(actual.sort(), [...NONE_ENGINES].sort(),
    'an engine gained or lost a cost path — this list must be updated by hand, not silently');
});

test('PARITY-02: every costTracking kind is held by at least one engine (D-40 positive lower bound)', () => {
  const kinds = new Set(AGENT_PROVIDER_PRESETS.map((p) => p.costTracking));
  for (const k of ['otel', 'proxy', 'transcript', 'none']) {
    assert.ok(kinds.has(k), `no preset uses costTracking: '${k}' — an empty list would satisfy the other three assertions vacuously`);
  }
  assert.equal(AGENT_PROVIDER_PRESETS.length, 11, 'expected all eleven presets');
});

// ── 4. codex spend is readable ───────────────────────────────────────────────

/** A rollout in the real shape codex 0.128.0 writes (verified against a live
 *  ~/.codex rollout): cumulative `total_token_usage` per token_count record,
 *  `cached_input_tokens` INCLUDED in `input_tokens`, plus `info: null` ticks. */
function seedRollout(home, lines) {
  const dir = path.join(home, 'sessions', '2026', '05', '10');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'rollout-2026-05-10T20-05-09-019e1250-177c-7b51-aa43-1bc553929cf8.jsonl');
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  return file;
}

const tokenCount = (input, cached, output) => ({
  timestamp: '2026-05-10T14:43:00.805Z',
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: {
      total_token_usage: {
        input_tokens: input,
        cached_input_tokens: cached,
        output_tokens: output,
        reasoning_output_tokens: 0,
        total_tokens: input + output
      },
      last_token_usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      model_context_window: 258400
    },
    rate_limits: { limit_id: 'codex' }
  }
});

test('readCodexUsage takes the LAST cumulative record and splits cached input out', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codexhome-'));
  seedRollout(home, [
    { type: 'turn_context', payload: { model: 'gpt-5.5', cwd: 'E:\\x' } },
    tokenCount(1000, 400, 100),
    { type: 'event_msg', payload: { type: 'token_count', info: null, rate_limits: {} } },
    tokenCount(8000, 6000, 900) // cumulative, so this one alone is the answer
  ]);
  const u = readCodexUsage(home);
  assert.equal(u.inputTokens, 2000);    // 8000 total input − 6000 cached
  assert.equal(u.cacheReadTokens, 6000);
  assert.equal(u.outputTokens, 900);
  assert.equal(u.cacheWriteTokens, 0);  // codex has no cache-creation concept
  assert.equal(u.model, 'gpt-5.5');
  assert.ok(u.estimatedCostUsd > 0);
});

test('readCodexUsage answers zero for a home with no rollouts', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codexhome-'));
  const u = readCodexUsage(home);
  assert.equal(u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens, 0);
});

test('a codex agent gets a usage sample through the collector fallback', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codexhome-'));
  seedRollout(home, [tokenCount(5000, 1000, 700)]);
  const t = new TelemetryCollector({
    // A codex agent shares its cwd with the project, so resolveCwd would bill it
    // a co-located Claude agent's transcripts — the codex home wins.
    resolveCwd: () => null,
    resolveCodexHome: (id) => (id === 'codex-1' ? home : null)
  });
  const s = t.getAgentUsage('codex-1');
  assert.equal(s.input, 4000);
  assert.equal(s.cacheRead, 1000);
  assert.equal(s.output, 700);
});

// ─── FLOOR-10 (#34): the budget arm, fed from the production breaker beat ───

/**
 * Plan 01-09 minted `BreakerInput.budget`, the breaker arm that enforces it and
 * `hive.budgetForAgent()`, and could not wire them: `src/main/index.ts` belonged
 * to plan 01-08 that wave, and a call to a method whose definition had not landed
 * yet does not typecheck. So for one wave every unit test above built its own
 * BreakerInput, stayed green, and proved nothing about production — `budget` is
 * an OPTIONAL field, so the tree compiles perfectly whether or not anything ever
 * sets it. That is the exact shape of a feature that ships dead.
 *
 * This assertion and the line it asserts land in the same commit.
 */

/**
 * The `inputs.push({...})` object literal inside `runBreakerBeat`, comment-free.
 *
 * Bounded by STRUCTURE — the anchor declaration, then the push, then the `});`
 * that closes it — and never by a character count. src/main/index.ts is ~5,800
 * lines and grows every wave, so a fixed-size window is a coin flip: plan 01-09
 * measured the 2,000 characters after this same anchor and found they end THREE
 * LINES SHORT of `inputs.push({`, which would have made this test red no matter
 * what index.ts contained. A structural bound cannot drift that way, and it is
 * also tighter — the regex below can only match INSIDE the literal, so a comment
 * reading `// budget: hive.budgetForAgent(id) — pulled in wave 6` anywhere in the
 * file cannot satisfy it (a bare `grep -c budgetForAgent src/main/index.ts >= 1`
 * would be satisfied by exactly that).
 */
function breakerInputLiteral() {
  const root = path.resolve(__dirname, '..');
  // 02-02 moved runBreakerBeat out of index.ts into src/main/floor/boot.ts's
  // bootFloor() module — the literal itself is unchanged, only its file.
  const main = fs.readFileSync(path.join(root, 'src/main/floor/boot.ts'), 'utf8');

  const at = main.indexOf('const inputs: BreakerInput[]');
  assert.ok(
    at > 0,
    'runBreakerBeat no longer builds a BreakerInput[] — re-derive the anchor with: '
    + 'grep -n "const inputs: BreakerInput\\[\\]" src/main/floor/boot.ts'
  );

  const push = main.indexOf('inputs.push({', at);
  assert.ok(
    push > at,
    'the BreakerInput[] is no longer filled by an inputs.push({...}) literal below its '
    + 'declaration. Whatever replaced it is where the budget has to be fed, and this window '
    + 'can no longer find it — re-derive before touching the assertion.'
  );

  const end = main.indexOf('});', push);
  assert.ok(
    end > push,
    'the inputs.push({ literal is never closed by `});` — the structural bound has no end '
    + 'delimiter, so any window taken here would run past the beat into unrelated code'
  );

  return main.slice(push, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

test('FLOOR-10: the breaker beat populates BreakerInput.budget in production (#34)', () => {
  const literal = breakerInputLiteral();

  // POSITIVE CONTROL, first. A token that is definitely inside this literal must
  // match, or the window is looking at the wrong bytes and the real assertion
  // below would be red — or green — for a reason that has nothing to do with the
  // budget. A source pin whose window is never proven is not evidence.
  assert.match(
    literal, /agentId:\s*id,/,
    'the anchored window does not contain `agentId: id,`, which is the first property of the '
    + 'literal it is supposed to be bounding. The window is wrong, so the budget assertion '
    + 'below proves nothing either way — fix the bound, do not relax the assertion.'
  );

  assert.match(
    literal, /budget:\s*hive\.budgetForAgent\(/,
    'the breaker beat does not populate BreakerInput.budget, so the budget arm is an optional '
    + 'field nothing ever sets. Every breaker unit test constructs its own input and stays '
    + 'green while the per-card cap goes unenforced in production, which is worse than having '
    + 'no cap: the UI reports a budget that cannot trip. FLOOR-10 (#34) is not closed until '
    + 'this property exists inside runBreakerBeat.'
  );
});

test('FLOOR-09: the number the budget arm enforces against includes the proxy tier (#19)', () => {
  // A cap that measures spend excluding every qwen/crush agent is the
  // 'worse than no cap' failure this phase exists to remove, so the two
  // requirements are pinned together: FLOOR-10's arm is only meaningful
  // while FLOOR-09's sink is still wired.
  const root = path.resolve(__dirname, '..');
  // 02-02 moved the HookServer construction out of index.ts into
  // src/main/floor/boot.ts's bootFloor(); the wiring itself is unchanged.
  const main = fs.readFileSync(path.join(root, 'src/main/floor/boot.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  assert.match(
    main, /telemetry\.recordCostSample\(/,
    'src/main/floor/boot.ts no longer hands HookServer the proxy-tier cost sink. The ledger still '
    + 'fills, but getAgentUsage never sees qwen/crush spend, so budgetForAgent under-reports '
    + "and a per-card cap silently exempts every proxy-tier agent — asserted on the CALL and "
    + 'not on a mention, because this source is comment-stripped first.'
  );
});
