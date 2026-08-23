'use strict';

/**
 * The OTLP collector's identity model (plan 01-25, gap SC-3).
 *
 * The endpoint is injected into every Claude agent's OWN environment
 * (`hive.ts` `ensureAgent`), so "bound to 127.0.0.1" is not a boundary against
 * the attacker this app actually has: an LLM-controlled process with a Bash
 * tool, same uid, holding the URL. Before this plan `handleRequest` applied a
 * body-size cap and NOTHING else, and `ingestMetrics` / `ingestLogs` read
 * `agent.id` and `session.id` straight off the payload. One `curl` could:
 *
 *   - add fabricated spend to a SIBLING's accumulator (the breaker reads that
 *     aggregate and constrains/kills on it),
 *   - post an `api_error` with `status_code: 401` naming a sibling, which the
 *     account pool turns into `markDead` + failover for every agent on that
 *     Claude account,
 *   - choose another agent's `--resume` key.
 *
 * Everything here is driven over a REAL loopback listener with REAL HTTP, for
 * the same reason `test/net-binding.test.cjs` drives the hook socket over a real
 * socket: the gate lives at the transport, and calling the handler directly
 * tests the wrong thing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { TelemetryCollector, sessionKey } = loadTs('src/main/telemetry.ts');

const SRC = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

// ─── OTLP/JSON fixtures (same shape as test/claude-account-failover.test.cjs) ─

const kv = (key, value) => (typeof value === 'number'
  ? { key, value: { intValue: String(value) } }
  : { key, value: { stringValue: value } });

/** A metrics export. `claimIn` decides WHERE the (forgeable) `agent.id` claim
 *  is written: 'resource' is the shape Claude Code really emits, 'point' is the
 *  second read (`str(attrs['agent.id'])`) — a distinct string a grep for the
 *  first one does not catch. 'none' omits the claim entirely. */
function otlpUsage({ agentId, sessionId, input = 100, output = 42, cacheRead = 7, cacheCreation = 3, usd = 0.25, model = 'claude-sonnet-4-6', accountUuid = 'acct-uuid-1', claimIn = 'resource' }) {
  const claim = agentId ? [kv('agent.id', agentId)] : [];
  const base = (type) => [
    kv('session.id', sessionId), kv('type', type), kv('model', model),
    ...(claimIn === 'point' ? claim : [])
  ];
  return {
    resourceMetrics: [{
      resource: { attributes: claimIn === 'resource' ? claim : [] },
      scopeMetrics: [{
        metrics: [
          { name: 'claude_code.token.usage', sum: { dataPoints: [
            { asInt: String(input), attributes: [...base('input'), kv('user.account_uuid', accountUuid)] },
            { asInt: String(output), attributes: base('output') },
            { asInt: String(cacheRead), attributes: base('cacheRead') },
            { asInt: String(cacheCreation), attributes: base('cacheCreation') }
          ] } },
          { name: 'claude_code.cost.usage', sum: { dataPoints: [
            { asDouble: usd, attributes: base('cost') }
          ] } }
        ]
      }]
    }]
  };
}

/** A logs export carrying one `api_error` — the record the account pool acts on. */
function otlpApiError({ agentId, sessionId, statusCode = 401, error = 'token rejected', claimIn = 'resource' }) {
  const claim = agentId ? [kv('agent.id', agentId)] : [];
  return {
    resourceLogs: [{
      resource: { attributes: claimIn === 'resource' ? claim : [] },
      scopeLogs: [{ logRecords: [{
        body: { stringValue: 'claude_code.api_error' },
        attributes: [
          kv('event.name', 'api_error'), kv('session.id', sessionId),
          kv('error', error), kv('status_code', statusCode),
          ...(claimIn === 'point' ? claim : [])
        ]
      }] }]
    }]
  };
}

// ─── the real-HTTP harness ───────────────────────────────────────────────────

const started = [];

async function boot(opts = {}) {
  const c = new TelemetryCollector(opts);
  const r = await c.start();
  assert.equal(r.ok, true, `collector did not start: ${r.error}`);
  started.push(c);
  return c;
}

test.after(() => { for (const c of started) { try { c.stop(); } catch { /* noop */ } } });

/** One real request against the bound listener. `token` rides the header the
 *  collector authenticates on; omit it to be the unauthenticated attacker. */
function send(collector, { method = 'POST', urlPath = '/v1/metrics', body, rawBody, token, headers = {} } = {}) {
  const payload = rawBody ?? (body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body)));
  const url = new URL(urlPath, collector.endpoint());
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      // A FRESH connection per request, never the pool.
      //
      // `http.globalAgent` keep-alives by default on Node >= 19, and the
      // oversize case in this file makes the server `req.destroy()` a socket
      // mid-upload ON PURPOSE. That socket returns to the pool poisoned, and the
      // NEXT request reuses it and errors before it reaches the listener —
      // reported as `status: 0`. Measured on ubuntu-latest: the follow-up
      // "listener is still serving" assertion failed with 0 while every other
      // case in this file passed against the same live collector, i.e. the
      // listener was fine and the POOL was not. win32 did not reuse the socket
      // and the bug was invisible there.
      //
      // Without this the assertion silently tests "a destroyed keep-alive socket
      // survived", which is not what it claims and is not what we want pinned.
      agent: false,
      headers: {
        'content-type': 'application/json',
        'content-length': String(payload.length),
        ...(token ? { 'x-hive-otel-token': token } : {}),
        ...headers
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => finish({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    // A bound that destroys the request socket (413) can surface as a write
    // error AFTER the status line landed — the status is what we are asserting,
    // so the first of the two wins and the other is not an error.
    req.on('error', (e) => finish({ status: 0, error: e.message }));
    req.end(payload, () => { /* body flushed */ });
    setTimeout(() => reject(new Error('collector never answered')), 10_000).unref();
  });
}

// ─── 1. an unauthenticated peer moves nothing ────────────────────────────────

test('an OTLP post with NO token is refused, and nothing it carried is accumulated', async () => {
  const collector = await boot();
  const before = collector.rejectedCount;

  const res = await send(collector, { body: otlpUsage({ agentId: 'victim', sessionId: 'victim-1' }) });

  assert.equal(res.status, 401, 'an untokened peer must be refused');
  assert.equal(collector.getAgentUsage('victim'), null, 'the forged spend must not reach the accumulator');
  assert.ok(collector.rejectedCount > before, 'the reject counter must climb (it is the blackout early warning)');
});

test('an OTLP post with an UNKNOWN or STALE token is refused', async () => {
  const collector = await boot();
  const res = await send(collector, { token: 'f'.repeat(64), body: otlpUsage({ agentId: 'victim', sessionId: 'victim-1' }) });
  assert.equal(res.status, 401);
  assert.equal(collector.getAgentUsage('victim'), null);
});

test('an EMPTY registry refuses — an optional gate whose absence opens the door is the defect', async () => {
  const collector = await boot();
  // No PTY has spawned yet, so nothing has been minted. Fail CLOSED.
  const res = await send(collector, { body: otlpUsage({ agentId: 'anyone', sessionId: 's' }) });
  assert.equal(res.status, 401);
  assert.equal(collector.getAgentUsage('anyone'), null);
});

// ─── 2. attribution is DERIVED, never claimed ────────────────────────────────

test('an authenticated agent cannot bill a sibling — the POINT-attribute claim is ignored', async () => {
  const collector = await boot();
  const tokenA = collector.mintAgentToken('alpha');

  const res = await send(collector, {
    token: tokenA,
    body: otlpUsage({ agentId: 'victim', sessionId: 'forged-1', claimIn: 'point' })
  });

  assert.equal(res.status, 200, 'a legitimate holder is accepted');
  assert.equal(collector.getAgentUsage('victim'), null, 'the claim must buy nothing');
  const mine = collector.getAgentUsage('alpha');
  assert.ok(mine, 'the batch lands on the TOKEN holder');
  assert.equal(mine.input, 100);
  assert.equal(mine.output, 42);
  assert.equal(mine.usd, 0.25);
});

test('the RESOURCE-attribute claim is ignored too (it is the second, distinct read)', async () => {
  const collector = await boot();
  const tokenA = collector.mintAgentToken('alpha');

  const res = await send(collector, {
    token: tokenA,
    body: otlpUsage({ agentId: 'victim', sessionId: 'forged-2', claimIn: 'resource' })
  });

  assert.equal(res.status, 200);
  assert.equal(collector.getAgentUsage('victim'), null);
  assert.equal(collector.getAgentUsage('alpha').input, 100);
});

test('a forged api_error cannot mark ANOTHER agent\'s Claude account dead', async () => {
  const collector = await boot();
  const tokenA = collector.mintAgentToken('alpha');
  const fired = [];
  collector.onApiError((agentId, info) => fired.push({ agentId, info }));

  const res = await send(collector, {
    urlPath: '/v1/logs',
    token: tokenA,
    body: otlpApiError({ agentId: 'victim', sessionId: 'forged-3', statusCode: 401 })
  });

  assert.equal(res.status, 200);
  assert.equal(fired.length, 1, 'the subscriber still fires — this must not blind the account pool');
  assert.equal(fired[0].agentId, 'alpha', 'accountPool.handleApiError must be told who really posted');
  assert.notEqual(fired[0].agentId, 'victim');
  assert.equal(fired[0].info.statusCode, 401);
});

test('an unauthenticated api_error reaches no subscriber at all', async () => {
  const collector = await boot();
  const fired = [];
  collector.onApiError((agentId) => fired.push(agentId));
  const res = await send(collector, { urlPath: '/v1/logs', body: otlpApiError({ agentId: 'victim', sessionId: 'x' }) });
  assert.equal(res.status, 401);
  assert.deepEqual(fired, []);
});

// ─── 3. the accumulator key is the PAIR, and it is injective ─────────────────

test('an agent cannot write a SIBLING\'s session accumulator through recordCostSample', async () => {
  const collector = await boot();
  const tokenB = collector.mintAgentToken('bravo');
  await send(collector, { token: tokenB, body: otlpUsage({ sessionId: 'bravo-session', claimIn: 'none' }) });
  const before = collector.getAgentUsage('bravo');
  assert.equal(before.output, 42, 'precondition: bravo has real spend on its own session');

  // alpha names bravo's session id. Independent of the token gate: this arm has
  // to hold even if the gate failed completely.
  collector.recordCostSample({
    agentId: 'alpha', sessionId: 'bravo-session', ts: Date.now(),
    input: 0, output: 2e9, cacheRead: 0, cacheCreation: 0, model: 'claude-sonnet-4-6', usd: 999
  });

  const after = collector.getAgentUsage('bravo');
  assert.equal(after.output, before.output, 'bravo\'s output must be untouched');
  assert.equal(after.usd, before.usd, 'bravo\'s cost must be untouched');
  assert.equal(collector.getAgentUsage('alpha').output, 2e9, 'alpha\'s own accumulator took it');
});

test('the composite session key is INJECTIVE — and this control never names the separator', () => {
  // Every other assertion in this file imports `sessionKey` and therefore AGREES
  // with whatever the implementation chose, by construction, forever — including
  // a space, or no separator at all, either of which fuses two distinct
  // (agentId, sessionId) pairs into one accumulator. These two are the only
  // assertions in the suite that can fail for a wrong separator, which is why
  // they must not be rewritten to reference the separator character.
  assert.notStrictEqual(sessionKey('a', 'b c'), sessionKey('a b', 'c'));
  assert.notStrictEqual(sessionKey('a', 'bc'), sessionKey('ab', 'c'));
});

// ─── 4. negative controls: legitimate telemetry is UNCHANGED ─────────────────

test('an agent\'s own batch produces exactly the sample it produced before the gate', async () => {
  const collector = await boot();
  const token = collector.mintAgentToken('alpha');
  const res = await send(collector, { token, body: otlpUsage({ sessionId: 'sess-alpha-1', claimIn: 'none' }) });
  assert.equal(res.status, 200);
  assert.equal(res.body, '{}', 'still the empty OTLP ExportServiceResponse');

  // Measured at HEAD (a217018) in this session, through the same fixture, before
  // any source change. A silent telemetry blackout is worse than the hole this
  // plan closes, so the sample is asserted FIELD BY FIELD, not just "non-null".
  const s = collector.getAgentUsage('alpha');
  assert.equal(s.agentId, 'alpha');
  assert.equal(s.sessionId, 'sess-alpha-1', 'the RAW session id — it is the --resume key and the ledger dedup key');
  assert.equal(s.input, 100);
  assert.equal(s.output, 42);
  assert.equal(s.cacheRead, 7);
  assert.equal(s.cacheCreation, 3);
  assert.equal(s.model, 'claude-sonnet-4-6');
  assert.equal(s.usd, 0.25);
  assert.equal(s.accountUuid, 'acct-uuid-1');
  assert.ok(s.ts > 0);
});

test('forget() still sweeps an agent whose accumulators are keyed by the pair', async () => {
  const collector = await boot();
  const token = collector.mintAgentToken('alpha');
  await send(collector, { token, body: otlpUsage({ sessionId: 'sess-alpha-1', claimIn: 'none' }) });
  assert.ok(collector.getAgentUsage('alpha'));

  collector.forget('alpha');

  assert.equal(collector.sessions.size, 0, 'a missed key here silently orphans an accumulator forever');
  assert.equal(collector.getAgentUsage('alpha'), null);
});

test('a revoked token is refused; a fresh one for the SAME agent still works', async () => {
  const collector = await boot();
  const first = collector.mintAgentToken('alpha');
  assert.equal((await send(collector, { token: first, body: otlpUsage({ sessionId: 's1', claimIn: 'none' }) })).status, 200);

  collector.revokeAgentToken(first);
  assert.equal((await send(collector, { token: first, body: otlpUsage({ sessionId: 's2', claimIn: 'none' }) })).status, 401);

  // A restart mints a fresh token while the old PTY is still tearing down.
  const second = collector.mintAgentToken('alpha');
  assert.notEqual(second, first, 'two mints for one agent must be two DIFFERENT secrets');
  assert.equal((await send(collector, { token: second, body: otlpUsage({ sessionId: 's3', claimIn: 'none' }) })).status, 200);
  assert.equal(collector.getAgentUsage('alpha').input, 200, 'both accepted batches landed on alpha');
});

test('the listener survives a reject — a 401 does not throw out of the socket', async () => {
  const collector = await boot();
  const token = collector.mintAgentToken('alpha');
  for (let i = 0; i < 5; i++) {
    assert.equal((await send(collector, { body: otlpUsage({ sessionId: `junk-${i}`, claimIn: 'none' }) })).status, 401);
  }
  assert.equal((await send(collector, { token, body: otlpUsage({ sessionId: 'after', claimIn: 'none' }) })).status, 200);
  assert.equal(collector.getAgentUsage('alpha').input, 100);
});

test('405 and the body-size bound are unchanged — the token check moves neither', async () => {
  const collector = await boot();
  const token = collector.mintAgentToken('alpha');

  assert.equal((await send(collector, { method: 'GET' })).status, 405, 'the method check still runs first');

  // Over MAX_BODY_BYTES (8 MiB), WITH a valid token, so the SIZE bound is what
  // must answer. Measured in this session, at HEAD and after, by the same probe:
  // the client observes `ECONNRESET`, never a readable 413 — `handleRequest`
  // writes the 413 and then `req.destroy()`s the still-uploading socket, so the
  // status line loses the race. That is pre-existing transport behaviour and is
  // byte-identical before and after this change; what this case pins is that the
  // TOKEN gate did not take the answer away from it.
  const before = collector.rejectedCount;
  const huge = Buffer.alloc(9 * 1024 * 1024, 0x20);
  huge[0] = 0x7b; // '{'
  const res = await send(collector, { token, rawBody: huge });
  assert.notEqual(res.status, 401, 'an authenticated oversize batch must not be answered by the token gate');
  assert.equal(collector.rejectedCount, before, 'and the reject counter must not have moved');
  assert.ok(res.status === 413 || res.status === 0, `expected the size bound to answer or cut, got ${res.status}`);
  assert.equal(collector.getAgentUsage('alpha'), null, 'nothing over the cap is accumulated');

  // ...and the listener is still serving afterwards.
  assert.equal((await send(collector, { token, body: otlpUsage({ sessionId: 'after-413', claimIn: 'none' }) })).status, 200);
});

// ─── 5. the header must describe the posture the file implements ─────────────

test('telemetry.ts\'s header names the capability model it actually implements', () => {
  const src = SRC('src/main/telemetry.ts');
  const header = src.slice(0, src.indexOf('*/') + 2);
  assert.ok(header.length > 200, 'expected the file to open with its doc block');
  assert.match(header, /per-agent telemetry capability/,
    'deleting the false sentence is not a passing implementation — the header must state what IS true');
  assert.doesNotMatch(header, /mirrors\s+`?slack\.ts/,
    'slack.ts does HMAC over the raw body + a replay window + a timing-safe compare; this file has bind + token');
  assert.doesNotMatch(src, /posture\s+mirrors/i, 'and the claim must not simply move somewhere else in the file');
});

// ─── 6. the producer: every Claude PTY exports its OWN telemetry credential ──
//
// `test/pty-env.test.cjs` does not exist in this repo, so the env-shape cases
// live here (plan 01-25 task 2 says to say which, and this is which).
//
// node-pty is stubbed so the assertions are about the ENV HANDED TO THE CHILD,
// which is the only thing that matters and the only thing a real spawn would
// hide behind a process. Everything else in PtyManager.spawn runs for real.

const ptyModuleId = require.resolve('node-pty');
const spawned = [];
require.cache[ptyModuleId] = {
  id: ptyModuleId,
  filename: ptyModuleId,
  loaded: true,
  exports: {
    spawn(file, args, opts) {
      spawned.push({ file, args, opts });
      return {
        pid: 0, // ensureKilled is a no-op on pid 0 — nothing on this host is signalled
        onData() { /* noop */ },
        onExit() { /* noop */ },
        write() { /* noop */ },
        resize() { /* noop */ },
        kill() { /* noop */ }
      };
    }
  }
};

const { PtyManager } = loadTs('src/main/pty.ts');

const ENDPOINT_ENV = { AGENT_ID: 'alpha', OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:41234' };

/** Spawn one PTY through the real PtyManager and hand back the child env. */
function spawnWith({ env, otelSource = true, collector = null, id = `pty-${spawned.length}` } = {}) {
  const mgr = new PtyManager();
  const hookMinted = [];
  const otelMinted = [];
  const otelRevoked = [];
  mgr.setHookTokenSource(
    (agentId) => { const t = `hook-${agentId}-${hookMinted.length}-${id}`; hookMinted.push(t); return t; },
    () => { /* noop */ }
  );
  if (otelSource) {
    mgr.setOtelTokenSource(
      (agentId) => {
        const t = collector ? collector.mintAgentToken(agentId) : `otel-${agentId}-${otelMinted.length}-${id}`;
        otelMinted.push(t);
        return t;
      },
      (t) => { otelRevoked.push(t); if (collector) collector.revokeAgentToken(t); }
    );
  }
  const before = spawned.length;
  const r = mgr.spawn({ id, cwd: process.cwd(), command: process.execPath, args: [], env });
  assert.equal(r.ok, true, `spawn failed: ${r.error}`);
  assert.equal(spawned.length, before + 1, 'exactly one child was started');
  return { mgr, id, env: spawned[before].opts.env, hookMinted, otelMinted, otelRevoked };
}

test('a Claude PTY with an OTLP endpoint carries its own telemetry token on BOTH per-signal vars', () => {
  const s = spawnWith({ env: { ...ENDPOINT_ENV } });
  assert.equal(s.otelMinted.length, 1, 'exactly one telemetry token was minted for this spawn');
  const expected = `x-hive-otel-token=${s.otelMinted[0]}`;
  assert.equal(s.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS, expected);
  assert.equal(s.env.OTEL_EXPORTER_OTLP_LOGS_HEADERS, expected);
});

test('the telemetry token is NOT the hook token — this is the whole redesign', () => {
  const s = spawnWith({ env: { ...ENDPOINT_ENV } });
  assert.equal(s.env.HIVE_SOCK_TOKEN, s.hookMinted[0], 'the hook path is untouched');
  assert.notEqual(s.otelMinted[0], s.hookMinted[0]);
  assert.ok(!s.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS.includes(s.env.HIVE_SOCK_TOKEN),
    'a copy-paste that reused hookToken would pass every OTHER case in this file');
});

test('the GENERIC OTEL_EXPORTER_OTLP_HEADERS is never set', () => {
  const s = spawnWith({ env: { ...ENDPOINT_ENV } });
  // Every OTel SDK in every language reads the generic variable, for every
  // signal, and every grandchild inherits it — an agent running `npm test` in a
  // repo with its own OTel->vendor config would post our header off-box.
  assert.equal(Object.prototype.hasOwnProperty.call(s.env, 'OTEL_EXPORTER_OTLP_HEADERS'), false);
});

test('ours is set LAST, so an inherited value cannot silently replace it', () => {
  const s = spawnWith({ env: {
    ...ENDPOINT_ENV,
    OTEL_EXPORTER_OTLP_METRICS_HEADERS: 'x-hive-otel-token=stolen',
    OTEL_EXPORTER_OTLP_LOGS_HEADERS: 'x-hive-otel-token=stolen',
    HIVE_SOCK_TOKEN: 'stolen'
  } });
  const expected = `x-hive-otel-token=${s.otelMinted[0]}`;
  assert.equal(s.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS, expected, 'an operator/upstream value would be a floor-wide 401');
  assert.equal(s.env.OTEL_EXPORTER_OTLP_LOGS_HEADERS, expected);
  assert.equal(s.env.HIVE_SOCK_TOKEN, s.hookMinted[0], 'HIVE_SOCK_TOKEN still last-wins too');
});

test('a spawn with NO OTLP endpoint gets neither header key, and nothing else moves', () => {
  const withEndpoint = spawnWith({ env: { ...ENDPOINT_ENV }, id: 'with-endpoint' });
  const without = spawnWith({ env: { AGENT_ID: 'alpha' }, id: 'without-endpoint' });

  assert.equal('OTEL_EXPORTER_OTLP_METRICS_HEADERS' in without.env, false);
  assert.equal('OTEL_EXPORTER_OTLP_LOGS_HEADERS' in without.env, false);
  assert.equal(without.otelMinted.length, 0, 'no endpoint, no credential to leak');
  assert.equal(without.env.HIVE_SOCK_TOKEN, without.hookMinted[0], 'the non-Claude providers are unaffected');

  // ...and the env is otherwise identical: the ONLY differences are the endpoint
  // it was given, the two header keys that endpoint earns, and the per-spawn
  // hook token (a different spawn mints a different one).
  const diff = Object.keys(withEndpoint.env)
    .filter((k) => withEndpoint.env[k] !== without.env[k])
    .sort();
  assert.deepEqual(diff, [
    'HIVE_SOCK_TOKEN',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_EXPORTER_OTLP_LOGS_HEADERS',
    'OTEL_EXPORTER_OTLP_METRICS_HEADERS'
  ]);
});

test('a PtyManager with no otel-token source spawns cleanly and exports neither key', () => {
  const s = spawnWith({ env: { ...ENDPOINT_ENV }, otelSource: false });
  assert.equal('OTEL_EXPORTER_OTLP_METRICS_HEADERS' in s.env, false);
  assert.equal('OTEL_EXPORTER_OTLP_LOGS_HEADERS' in s.env, false);
  assert.equal(s.env.HIVE_SOCK_TOKEN, s.hookMinted[0]);
});

test('the header a spawn exports round-trips against a REAL collector, and dies with its PTY', async () => {
  const collector = await boot();
  const s = spawnWith({ env: { ...ENDPOINT_ENV }, collector, id: 'roundtrip' });

  // Parse the exported value exactly as an OTel SDK would: a `key=value` list.
  const [key, value] = s.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS.split('=');
  assert.equal(key, 'x-hive-otel-token');
  const accepted = await send(collector, {
    headers: { [key]: value },
    body: otlpUsage({ agentId: 'someone-else', sessionId: 'roundtrip-1', claimIn: 'resource' })
  });
  assert.equal(accepted.status, 200, 'the header the app really exports is accepted');
  assert.equal(collector.getAgentUsage('someone-else'), null);
  assert.equal(collector.getAgentUsage('alpha').input, 100, 'attributed to the PTY that holds the token');

  // The PTY goes away → the credential goes with it.
  assert.equal(s.mgr.kill(s.id).ok, true);
  assert.deepEqual(s.otelRevoked, [value], 'revoked token-exact, from a path that drops the session');
  const afterExit = await send(collector, { headers: { [key]: value }, body: otlpUsage({ sessionId: 'x', claimIn: 'none' }) });
  assert.equal(afterExit.status, 401);

  // A restart mints a fresh one that works immediately.
  const restarted = spawnWith({ env: { ...ENDPOINT_ENV }, collector, id: 'pty-restart' });
  const fresh = restarted.env.OTEL_EXPORTER_OTLP_LOGS_HEADERS.split('=')[1];
  assert.notEqual(fresh, value);
  assert.equal((await send(collector, { headers: { 'x-hive-otel-token': fresh }, body: otlpUsage({ sessionId: 'r2', claimIn: 'none' }) })).status, 200);
});

// ═══════════════════════════════════════════════════════════════════════════
// Task 3 — the ARGV-safe session id, and the four sinks that enforce it.
//
// A session id is not only a path component. It becomes ARGV (`--resume <sid>`
// on Claude, `--conversation` on antigravity, `--session` on crush) and it is
// STORED and git-committed by `hive.recordSession`. The charset guard the
// transcript path already had — `VALID_SESSION_ID`, a path-component rule —
// accepts `--dangerously-skip-permissions`, because `-` is a member of
// `[A-Za-z0-9_-]`. Every one of those CLIs then reads the poisoned value as a
// FLAG rather than as the option's argument, which is self-escalation: an agent
// turns permission gating off on an engine the operator deliberately started
// without it. So there are two constants with two jobs, and the subset control
// below is what stops them drifting into contradiction.
//
// Sink 4 (the hook writer) is driven FOR REAL, through `HookServer.handle` with
// a recording hive. Sinks 1-3 live inside `spawnAgentCore` and the breaker beat
// in `src/main/index.ts`, which imports `electron` at module scope and cannot be
// loaded here — `test/main-hardening.test.cjs:5-8` states the same limit and
// takes the same route — so they are pinned STRUCTURALLY against the
// comment-stripped source, WITH ORDERING: the guard must sit between the
// `const sid` statement and the argv push. A structural pin is weaker than a
// behavioural one and is called out here as such; the decision it guards — the
// shape test itself — is exhaustive and behavioural.
// ═══════════════════════════════════════════════════════════════════════════

const os = require('node:os');
const {
  SPAWN_SAFE_SESSION_ID, VALID_SESSION_ID, seedSessionTranscript, resolveSessionCwd, projectDir
} = loadTs('src/main/transcript.ts');
const { HookServer } = loadTs('src/main/hooks.ts');

/** Round 0's proposal, kept as a LIVE control rather than as prose: it is the
 *  reason this constant exists at all. Round 0 asserted it rejected
 *  `--dangerously-skip-permissions`; measured, it accepts every flag shape. */
const CANDIDATE_A = /^[A-Za-z0-9_-]{1,128}$/;

const FLAG_SHAPES = [
  '--dangerously-skip-permissions', '--print', '--permission-mode',
  '--continue', '--strict-mcp-config', '-c', '-'
];

/** [input, SPAWN_SAFE (B), CANDIDATE_A, VALID_SESSION_ID (C)] — the plan's
 *  measured table, reproduced row for row. */
const SHAPE_TABLE = [
  ['--dangerously-skip-permissions', false, true, true],
  ['--print', false, true, true],
  ['--permission-mode', false, true, true],
  ['--continue', false, true, true],
  ['--strict-mcp-config', false, true, true],
  ['-c', false, true, true],
  ['-', false, true, true],
  ['_leading', false, true, true],
  ['x" & whoami & "', false, false, false],
  ['550e8400-e29b-41d4-a716-446655440000', true, true, true],
  ['a'.repeat(128), true, true, true],
  ['a'.repeat(129), false, false, true],
  ['a'.repeat(200), false, false, true],
  ['sess_01-ABC', true, true, true],
  ['', false, false, false],
  ['a-b', true, true, true]
];

const label = (s) => (s.length > 24 ? `${s.length}x"${s[0]}"` : JSON.stringify(s));

test('SPAWN_SAFE_SESSION_ID reproduces the measured shape table, every row', () => {
  for (const [input, b, a, c] of SHAPE_TABLE) {
    assert.equal(SPAWN_SAFE_SESSION_ID.test(input), b, `B: ${label(input)}`);
    assert.equal(CANDIDATE_A.test(input), a, `A (round 0): ${label(input)}`);
    assert.equal(VALID_SESSION_ID.test(input), c, `C (transcript.ts today): ${label(input)}`);
  }
});

test('every flag shape is refused — and the round-0 candidate accepted all seven', () => {
  for (const flag of FLAG_SHAPES) {
    assert.equal(SPAWN_SAFE_SESSION_ID.test(flag), false, `refused: ${flag}`);
    assert.equal(CANDIDATE_A.test(flag), true, `the fix is not vacuous: A accepted ${flag}`);
  }
});

test('subset control: everything argv-safe is also path-safe, and never the inverse', () => {
  for (const [input] of SHAPE_TABLE) {
    if (SPAWN_SAFE_SESSION_ID.test(input)) {
      assert.equal(VALID_SESSION_ID.test(input), true, `${label(input)} must pass both`);
    }
  }
  // …and the narrowing is real, not nominal: at least one input passes C and fails B.
  assert.ok(SHAPE_TABLE.some(([i]) => VALID_SESSION_ID.test(i) && !SPAWN_SAFE_SESSION_ID.test(i)));
});

test('transcript.ts is unchanged in behaviour: a 200-char id and a leading _ still resolve', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-sid-home-'));
  const prev = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'md-sid-cwd-'));
  t.after(() => {
    for (const k of ['HOME', 'USERPROFILE']) {
      if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k];
    }
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  });
  for (const sid of ['a'.repeat(200), '_leading']) {
    const dir = projectDir(cwd);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${sid}.jsonl`), `${JSON.stringify({ cwd })}\n`);
    assert.equal(seedSessionTranscript(cwd, sid), true, `${label(sid)} still seeds its transcript`);
    assert.equal(resolveSessionCwd(sid), cwd, `${label(sid)} still resolves its cwd`);
    assert.equal(SPAWN_SAFE_SESSION_ID.test(sid), false, 'while the ARGV guard refuses it');
  }
});

// ─── sink 4: the hook writer, driven for real ────────────────────────────────

/** A HookServer whose hive records every recordSession call and nothing else.
 *  `recordSession` git-commits into registry.json, the hive log and the cost
 *  ledger, so "was it called" is the whole question. */
function recordingHookServer(recorded) {
  const hive = {
    root: () => os.tmpdir(),
    sockPath: () => path.join(os.tmpdir(), 'md-telemetry-auth-unused.sock'),
    recordSession: (agentId, sessionId) => recorded.push([agentId, sessionId]),
    isGod: () => false,
    rosterContext: () => null,
    registry: () => ({ godId: null, agents: { 'a-1': { cwd: os.tmpdir(), cwdValid: true } } })
  };
  return new HookServer(hive, () => ({ send: () => {} }), () => ({ notifications: false }));
}

test('sink 4: a forged hook payload cannot STORE a flag-shaped session id', () => {
  const recorded = [];
  const server = recordingHookServer(recorded);
  for (const bad of FLAG_SHAPES) {
    server.handle({ hook_event_name: 'SessionStart', session_id: bad }, 'a-1');
  }
  assert.deepEqual(recorded, [], 'nothing flag-shaped reached hive.recordSession');

  // The negative control, and it is the point: sink 4 must not break ordinary
  // session capture — `--resume` is built on it.
  const good = '550e8400-e29b-41d4-a716-446655440000';
  server.handle({ hook_event_name: 'SessionStart', session_id: good }, 'a-1');
  assert.deepEqual(recorded, [['a-1', good]], 'a well-formed id is still stored');
});

// ─── sinks 1-3: structural, with ordering ────────────────────────────────────

/** The file with comment-only lines removed — the same `readStripped` idiom
 *  `test/repo-claims.test.cjs` uses on this file, so a guard that exists only
 *  inside a comment cannot satisfy anything below. */
const stripped = (rel) => SRC(rel).split('\n').filter((l) => !/^\s*[/*]/.test(l)).join('\n');

/** The source between two anchors, so an assertion is about ONE branch rather
 *  than about the 5,800-line file. Anchored on statements, never on offsets. */
function region(src, from, to) {
  const a = src.indexOf(from);
  assert.notEqual(a, -1, `anchor not found: ${from}`);
  const b = src.indexOf(to, a);
  assert.notEqual(b, -1, `closing anchor not found: ${to}`);
  return src.slice(a, b);
}

test('sink 1: the Claude resume branch refuses before it can push --resume', () => {
  const claude = region(
    stripped('src/main/index.ts'),
    'const sid = explicitSid ||',
    'opts.args = args;'
  );
  assert.match(claude, /SPAWN_SAFE_SESSION_ID\.test\(sid\)/);
  assert.ok(
    claude.indexOf('SPAWN_SAFE_SESSION_ID') < claude.indexOf("args.push('--resume', sid)"),
    'the guard must precede the argv push, not trail it'
  );
});

test('sink 2: the generic resume branch refuses BOTH the flag and the subcommand form', () => {
  const full = stripped('src/main/index.ts');
  const generic = region(full, 'const sid = typedSid ||', 'args.push(rf, sid)');
  assert.match(generic, /SPAWN_SAFE_SESSION_ID\.test\(sid\)/);
  // One guard, placed above `if (sid && rf)`, therefore ahead of the
  // `else if (sid && rsub)` arm too — assert the arm order rather than trusting it.
  assert.ok(generic.indexOf('SPAWN_SAFE_SESSION_ID') < generic.indexOf('if (sid && rf)'));
  assert.ok(
    full.indexOf('SPAWN_SAFE_SESSION_ID.test(sid)', full.indexOf('const sid = typedSid ||'))
      < full.indexOf('else if (sid && rsub)'),
    'the subcommand form is downstream of the same guard'
  );
});

test('sink 3: the breaker beat refuses to record an unsafe id from the collector', () => {
  // 02-02 moved runBreakerBeat out of index.ts into src/main/floor/boot.ts's
  // bootFloor() module — the guard itself is unchanged, only its file.
  const beat = region(
    stripped('src/main/floor/boot.ts'),
    'hive.appendCostLedger(sample)',
    'if (id === reg.godId) continue;'
  );
  assert.match(beat, /SPAWN_SAFE_SESSION_ID\.test\(sample\.sessionId\)/);
  assert.ok(
    beat.indexOf('SPAWN_SAFE_SESSION_ID') < beat.indexOf('hive.recordSession('),
    'the guard must precede the write'
  );
});

test('the guard is imported, not redeclared, in both sink files', () => {
  for (const rel of ['src/main/index.ts', 'src/main/hooks.ts']) {
    const src = stripped(rel);
    assert.match(src, /import \{[^}]*SPAWN_SAFE_SESSION_ID[^}]*\} from '\.\/transcript'/, rel);
    assert.doesNotMatch(src, /const SPAWN_SAFE_SESSION_ID\s*=/, `${rel} must not fork the constant`);
  }
});

// ─── FLOOR-13: the collapse the shipped window could not reach ───────────────

test('the window minimum lets the responsive collapse be reached, and both docs say so', () => {
  const main = stripped('src/main/index.ts');
  assert.match(main, /const MIN_WIN = \{ width: 960, height: 800 \}/);
  assert.match(main, /minWidth: MIN_WIN\.width/, 'the BrowserWindow still consumes the constant');
  assert.doesNotMatch(main, /minWidth:\s*\d/, 'and nothing hardcodes a minimum beside it');

  const design = SRC('DESIGN.md');
  assert.equal((design.match(/1280/g) || []).length, 0, 'no doc still promises the old minimum');
  assert.equal((design.match(/960/g) || []).length, 2, 'both statements corrected');
  assert.doesNotMatch(design, /bottom drawer/, 'App.tsx renders a right-edge overlay, not a drawer');
});
