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
const { capabilityLine, providerCapabilities } = loadTs('src/shared/providerAutomation.ts');

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

// ── 3. the capability line the god is oriented with ─────────────────────────

test('the capability line is honest about a mail-capable engine', () => {
  assert.equal(capabilityLine('claude'), 'claude: mail ok, spend tracked (otel), compacts /compact');
});

test('the capability line SHOUTS about a mail-incapable engine', () => {
  // Kimi has no hook bridge, so routed mail bounces to the god — the exact
  // failure #19 opens with (god assigns mail-dependent work to a Kimi worker).
  assert.equal(
    capabilityLine('kimi'),
    'kimi: NO MAIL (bounces to you), spend UNTRACKED (invisible to every budget), compacts /compact'
  );
});

test('the capability line names the other two gaps too', () => {
  // crush: proxy-tracked spend but no typeable compaction verb at all.
  assert.equal(
    capabilityLine('crush'),
    'crush: mail ok, spend tracked (proxy), NO COMPACT (context cannot be reclaimed)'
  );
  // copilot: print mode exits per turn — no mail, no prompt to compact into.
  assert.match(capabilityLine('copilot'), /NO MAIL .*spend UNTRACKED.*NO COMPACT/);
});

test('every engine answers all three capability questions', () => {
  for (const p of ['claude', 'codex', 'grok', 'kimi', 'antigravity', 'qwen',
    'opencode', 'crush', 'pi', 'copilot', 'custom']) {
    const c = providerCapabilities(p);
    assert.equal(typeof c.mail, 'boolean', p);
    assert.ok(['otel', 'proxy', 'transcript', 'none'].includes(c.spend), `${p}: ${c.spend}`);
    assert.ok(c.compact === null || typeof c.compact === 'string', p);
  }
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
