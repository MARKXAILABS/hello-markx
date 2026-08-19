'use strict';

/**
 * The network trust boundaries of the main process (floor-inspection #10, #37).
 *
 * Three properties, all of which were false before and are only observable from
 * the outside — a code reviewer cannot eyeball any of them:
 *
 *   1. The two TUNNELLED servers (webhook, Slack events) bind LOOPBACK ONLY.
 *      Their public reach is the tunnel; binding 0.0.0.0 additionally handed the
 *      whole LAN an un-tunneled copy of a secret-gated surface for nothing.
 *   2. The hook socket AUTHENTICATES. It is a UDS / named pipe, so any local
 *      process could post a payload claiming any `agent_id` — enough to hijack a
 *      --resume session id, poison the cost ledger, or clear breaker state.
 *      Payloads must now carry `sock_token` === `hookSockToken()`.
 *   3. Every secret/token compare is LENGTH-INDEPENDENT: both sides are hashed
 *      to a fixed 32 bytes before `timingSafeEqual`, so the old
 *      `if (a.length !== b.length) return false` length oracle is gone.
 *
 * (2) is driven over a REAL socket rather than by calling the handler: the gate
 * deliberately lives at the socket, not inside `handle`, because main-side
 * callers that build their own payloads are already inside the trust boundary.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { createHmac, randomBytes } = require('node:crypto');
const loadTs = require('./load-ts.cjs');

// hooks.ts pulls Notification from electron; outside Electron that resolve gives
// a path string, so seed the cache with the surface the server actually touches.
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { WebhookServer } = loadTs('src/main/webhook.ts');
const { SlackWebhookServer, SlackReplyServer } = loadTs('src/main/slack.ts');
const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
const { HookServer, hookSockToken } = loadTs('src/main/hooks.ts');

const SECRET = 'a'.repeat(64);
const SCHEMA = JSON.stringify({ type: 'object', required: ['message'] });

// ─── 1. loopback binding ─────────────────────────────────────────────────────

test('the tunnelled webhook server binds 127.0.0.1, not every interface', async (t) => {
  const server = new WebhookServer({
    port: 0, // OS-assigned; `start()` would open a real tunnel, so bind directly
    endpoints: [{ id: 'alpha', name: 'Alpha', secret: SECRET, schema: SCHEMA }],
    onMessage: () => ({ token: 't', pending: false }),
    lookupStatus: () => null
  });
  t.after(() => server.stop());
  await server.listen();
  assert.equal(server.server.address().address, '127.0.0.1');
});

test('the tunnelled Slack events server binds 127.0.0.1, not every interface', async (t) => {
  const server = new SlackWebhookServer({ port: 0, signingSecret: SECRET, onMessage: () => {} });
  t.after(() => server.stop());
  await server.listen();
  assert.equal(server.server.address().address, '127.0.0.1');
});

test('the loopback siblings they were supposed to match still bind 127.0.0.1', async (t) => {
  const reply = new SlackReplyServer({ token: SECRET, getBotToken: () => 'x' });
  const broker = new IntegrationBroker({ getRecord: () => undefined, getSecret: () => undefined });
  t.after(() => { reply.stop(); broker.stop(); });
  assert.equal((await reply.start(0)).ok, true);
  assert.equal(reply.server.address().address, '127.0.0.1');
  assert.equal((await broker.start(0)).ok, true);
  assert.equal(broker.server.address().address, '127.0.0.1');
});

test('stop() admits the public tunnel outlives it instead of pretending', () => {
  const server = new WebhookServer({
    port: 0,
    endpoints: [{ id: 'alpha', name: 'Alpha', secret: SECRET, schema: SCHEMA }],
    onMessage: () => ({ token: 't', pending: false }),
    lookupStatus: () => null
  });
  server.tunnelUrl = 'https://orphan.tunnelmole.net';
  assert.equal(server.stop().tunnelStillOpen, 'https://orphan.tunnelmole.net');
  assert.equal(server.stop().tunnelStillOpen, null, 'idempotent: nothing left to admit');
});

// ─── 2. the hook socket authenticates ────────────────────────────────────────

function sockPath(t) {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\md-net-binding-${randomBytes(6).toString('hex')}`;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-net-binding-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'hooks.sock');
}

/** A live HookServer on a throwaway socket, plus everything it emitted. */
async function hookFloor(t) {
  const sock = sockPath(t);
  const sent = [];
  const hive = {
    sockPath: () => sock,
    recordSession: () => {},
    isGod: () => false,
    rosterContext: () => null
  };
  const server = new HookServer(
    hive,
    () => ({ send: (channel, payload) => sent.push({ channel, payload }) }),
    () => ({ notifications: false })
  );
  server.start();
  t.after(() => server.stop());
  await new Promise((resolve, reject) => {
    server.server.once('listening', resolve);
    server.server.once('error', reject);
  });
  const send = (payload) => new Promise((resolve, reject) => {
    const c = net.createConnection(sock, () => c.end(JSON.stringify(payload) + '\n'));
    let resp = '';
    c.setEncoding('utf8');
    c.on('data', (d) => { resp += d; });
    c.on('end', () => resolve(resp));
    c.on('error', reject);
  });
  return { send, sent };
}

test('the token is a stable, unguessable per-process value', () => {
  assert.equal(hookSockToken(), hookSockToken(), 'minted once, not per call');
  assert.match(hookSockToken(), /^[0-9a-f]{64}$/, '256 bits of randomness, hex');
});

test('a hook payload WITHOUT the socket token is dropped', async (t) => {
  const { send, sent } = await hookFloor(t);
  const resp = await send({ hook_event_name: 'Stop', agent_id: 'victim-1', session_id: 's1' });
  assert.equal(resp, '{}', 'answered like any other hook — the socket is not a probe');
  assert.equal(sent.length, 0, 'an unauthenticated payload must reach nothing');
});

test('a hook payload with the WRONG socket token is dropped', async (t) => {
  const { send, sent } = await hookFloor(t);
  await send({ hook_event_name: 'Stop', agent_id: 'victim-1', sock_token: 'b'.repeat(64) });
  assert.equal(sent.length, 0);
  // …and a wrong token of a DIFFERENT length is rejected the same way, not by an
  // early length bail (that would leak the token's width to a local prober).
  await send({ hook_event_name: 'Stop', agent_id: 'victim-1', sock_token: 'b' });
  assert.equal(sent.length, 0);
});

test('a hook payload carrying the token is handled normally', async (t) => {
  const { send, sent } = await hookFloor(t);
  await send({
    hook_event_name: 'PreToolUse',
    agent_id: 'jim-1',
    tool_name: 'Bash',
    sock_token: hookSockToken()
  });
  assert.equal(sent.length, 1, 'the real shim must still get through');
  assert.equal(sent[0].channel, 'hive:hookEvent');
  assert.equal(sent[0].payload.agentId, 'jim-1');
});

// ─── 3. length-independent compares ──────────────────────────────────────────

test('the webhook secret compare does not bail on a length mismatch', () => {
  const server = new WebhookServer({
    port: 0,
    endpoints: [{ id: 'alpha', name: 'Alpha', secret: SECRET, schema: SCHEMA }],
    onMessage: () => ({ token: 't', pending: false }),
    lookupStatus: () => null
  });
  const endpoint = { id: 'alpha', name: 'Alpha', secret: SECRET, schema: SCHEMA };
  const check = (v) => server.verifySecret({ headers: { 'x-md-webhook-secret': v } }, endpoint);
  assert.equal(check(SECRET), true);
  assert.equal(check('b'.repeat(64)), false, 'same length, wrong secret');
  assert.equal(check(SECRET.slice(0, 10)), false, 'a prefix is not the secret');
  assert.equal(check(SECRET + 'extra'), false, 'longer is not the secret');
  assert.equal(check(''), false);
});

test('the Slack signature compare does not bail on a length mismatch', () => {
  const server = new SlackWebhookServer({ port: 0, signingSecret: SECRET, onMessage: () => {} });
  const ts = String(Math.floor(Date.now() / 1000));
  const body = '{"type":"url_verification"}';
  const good = 'v0=' + createHmac('sha256', SECRET).update(`v0:${ts}:${body}`).digest('hex');
  const check = (sig) => server.verify({ headers: { 'x-slack-signature': sig, 'x-slack-request-timestamp': ts } }, body);
  assert.equal(check(good), true);
  assert.equal(check(good.slice(0, -1) + (good.endsWith('a') ? 'b' : 'a')), false, 'same length, wrong sig');
  assert.equal(check(good.slice(0, 12)), false, 'truncated sig');
  assert.equal(check(good + '00'), false, 'over-long sig');
});

test('the reply-token and broker-capability compares do not bail on length', async (t) => {
  const reply = new SlackReplyServer({ token: SECRET, getBotToken: () => 'x' });
  assert.equal(reply.checkToken(SECRET), true);
  assert.equal(reply.checkToken(SECRET.slice(0, 3)), false);
  assert.equal(reply.checkToken(SECRET + 'x'), false);

  const broker = new IntegrationBroker({ getRecord: () => undefined, getSecret: () => undefined });
  t.after(() => broker.stop());
  const token = broker.grant('worker-1', ['gh']);
  assert.equal(broker.resolveCapability(token).workerId, 'worker-1');
  assert.equal(broker.resolveCapability(token.slice(0, 8)), undefined);
  assert.equal(broker.resolveCapability(token + 'x'), undefined);
});

test('no length-mismatch early return survives in any of the four files', () => {
  // The behavioural assertions above pass for a length-bailing implementation
  // too — the leak is in the TIMING, and timing tests are flaky. So pin the one
  // structural thing that made it leak: comparing two `.length`s to each other.
  const guard = /\.length\s*(?:!==|===|!=|==)\s*\w+\.length/;
  // Comments stripped first: each of these files now QUOTES the guard it removed,
  // and the point of the comment is that the code no longer does it.
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const file of ['webhook.ts', 'slack.ts', 'hooks.ts', 'integrationBroker.ts']) {
    const src = stripComments(fs.readFileSync(path.resolve(__dirname, '..', 'src/main', file), 'utf8'));
    assert.equal(guard.test(src), false, `${file} still branches on a length comparison`);
    if (/timingSafeEqual/.test(src)) {
      assert.match(src, /sha256\(/, `${file} must hash to a fixed width before comparing`);
    }
  }
});
