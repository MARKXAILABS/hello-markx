'use strict';

/**
 * Multi-endpoint webhook server — the routing + isolation rules that a single
 * shared public surface lives or dies on:
 *
 *   1. one server, many endpoints, told apart by the id in the path (and bare
 *      `POST /` still means the pre-multi-endpoint `legacy` endpoint);
 *   2. each endpoint is gated by ITS OWN secret, so revoking one caller cannot
 *      open or close another's door;
 *   3. an unknown id is answered EXACTLY like a wrong secret, so the surface
 *      can't be walked to discover which webhooks exist;
 *   4. the endpoint list is swappable at runtime — a revoked endpoint stops
 *      resolving on the very next request, with no restart (a restart would
 *      rotate the tunnel URL and break every OTHER caller);
 *   5. per-endpoint rate limiting, so one noisy caller burns its own budget;
 *   6. a held message answers 202 (accepted, not started) with its token;
 *   7. `phone` (case-insensitively) is reserved for the phone route prefix and
 *      can never be minted as an operator endpoint id — refused by
 *      `setEndpoints`, driven RED once to prove the refusal is real.
 *
 * The HTTP handler is driven directly with stub req/res objects — not because
 * `start()` opens a tunnel (it no longer does; see the off-by-default case at
 * the end of this file), but because a unit test must never reach the
 * network, and driving the handler directly is the house way to prove that
 * regardless of what `start()` does or does not do.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { WebhookServer, LEGACY_ENDPOINT_ID, PHONE_ASSETS, PHONE_PREFIX } = loadTs('src/main/webhook.ts');

const SECRET_A = 'a'.repeat(64);
const SECRET_B = 'b'.repeat(64);
const SCHEMA = JSON.stringify({
  type: 'object',
  required: ['message'],
  properties: { message: { type: 'string' }, count: { type: 'number' } }
});

function endpoints() {
  return [
    { id: 'alpha', name: 'Alpha', secret: SECRET_A, schema: SCHEMA },
    { id: LEGACY_ENDPOINT_ID, name: 'Default webhook', secret: SECRET_B, schema: SCHEMA }
  ];
}

/** A server whose callbacks record what they were handed. */
function makeServer(overrides = {}) {
  const seen = [];
  const server = new WebhookServer({
    port: 0,
    endpoints: endpoints(),
    onMessage: (msg, endpoint) => {
      seen.push({ msg, endpoint });
      if (overrides.pending) return { token: 'tok-pending', pending: true };
      return { token: `tok-${endpoint.id}`, taskId: `webhook-${endpoint.id}`, pending: false };
    },
    lookupStatus: (token) =>
      token === 'good-token' ? { status: 'todo', title: 'a card' } : null,
    ...overrides.opts
  });
  return { server, seen };
}

/** Fire one request through the handler and resolve with `{status, body, headers}`.
 *  `res._headers` records whatever `writeHead` was given so a static-asset
 *  test can assert on cache-control/CSP/etc without changing the resolution
 *  shape every other case in this file already relies on. */
function request(server, { method = 'POST', url = '/', headers = {}, body = undefined }) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = headers;
    req.destroy = () => { /* no socket to tear down */ };
    const res = {
      writeHead(status, hdrs) { res._status = status; res._headers = hdrs ?? {}; return res; },
      end(payload) {
        let parsed = null;
        if (Buffer.isBuffer(payload)) {
          try { parsed = JSON.parse(payload.toString('utf8')); } catch { parsed = payload; }
        } else {
          try { parsed = payload ? JSON.parse(payload) : null; } catch { parsed = payload; }
        }
        resolve({ status: res._status, body: parsed, headers: res._headers ?? {} });
      }
    };
    server.handleRequest(req, res);
    if (method === 'POST') {
      if (body !== undefined) req.emit('data', Buffer.from(body));
      req.emit('end');
    }
  });
}

const auth = (secret) => ({ 'x-md-webhook-secret': secret });
const post = (msg) => JSON.stringify(msg);

/** The exact 401 body every /phone/api/** failure shares (D-19/D-24). */
const PHONE_AUTH_FAIL_BODY_SHAPE = { ok: false, error: 'unauthorized' };

/** A throwaway fixture directory holding a two-byte `index.html`, mirroring
 *  what `resources/phone/` will hold once plan 02-09 lands. `t` is the test's
 *  own context — cleanup rides `t.after`, the house `tempDir` pattern
 *  (test/main-hardening.test.cjs). `realpathSync` matters here too: macOS
 *  resolves `/var` to `/private/var`, which would otherwise make every
 *  assertion look like a symlink test. */
function makeFixtureRoot(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-phone-fixture-')));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* noop */ } });
  fs.writeFileSync(path.join(dir, 'index.html'), 'hi');
  return dir;
}

/** A server with the phone armed (via a real `mintEnrollment()` call — the
 *  same seam `phone:pairing` uses) and `staticRoot` pointed at a fixture
 *  directory. */
function makePhoneServer(t, overrides = {}) {
  const root = overrides.noRoot ? null : makeFixtureRoot(t);
  const { server, seen } = makeServer({
    ...overrides,
    opts: { staticRoot: () => root, ...overrides.opts }
  });
  if (!overrides.unarmed) server.mintEnrollment();
  return { server, seen, root };
}

/** An injectable clock so TTL/lockout cases move virtual time forward
 *  without sleeping a real unit test. */
function makeClock(start = 1_700_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('each endpoint is gated by its OWN secret', async () => {
  const { server, seen } = makeServer();
  const ok = await request(server, {
    url: '/alpha', headers: auth(SECRET_A), body: post({ message: 'hello' })
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.token, 'tok-alpha');
  assert.equal(seen[0].endpoint.id, 'alpha');
  // The handler is handed the endpoint's identity ONLY — never its secret, which
  // must not be able to reach a card, a hive message or the history ledger.
  assert.deepEqual(Object.keys(seen[0].endpoint).sort(), ['id', 'name']);

  // Alpha's door does not open with the other endpoint's key.
  const wrong = await request(server, {
    url: '/alpha', headers: auth(SECRET_B), body: post({ message: 'hello' })
  });
  assert.equal(wrong.status, 401);
});

test('an unknown id is indistinguishable from a wrong secret', async () => {
  const { server, seen } = makeServer();
  const unknown = await request(server, {
    url: '/does-not-exist', headers: auth(SECRET_A), body: post({ message: 'hi' })
  });
  const wrongSecret = await request(server, {
    url: '/alpha', headers: auth(SECRET_B), body: post({ message: 'hi' })
  });
  assert.equal(unknown.status, wrongSecret.status);
  assert.deepEqual(unknown.body, wrongSecret.body);
  assert.deepEqual(unknown.body, { ok: false, error: 'unauthorized' });
  assert.equal(seen.length, 0, 'neither request may reach the dispatch handler');
});

test('bare POST / still means the legacy endpoint', async () => {
  const { server, seen } = makeServer();
  const res = await request(server, {
    url: '/', headers: auth(SECRET_B), body: post({ message: 'legacy caller' })
  });
  assert.equal(res.status, 200);
  assert.equal(seen[0].endpoint.id, LEGACY_ENDPOINT_ID);
});

test('a nested path is not an endpoint', async () => {
  const { server } = makeServer();
  const res = await request(server, {
    url: '/alpha/extra', headers: auth(SECRET_A), body: post({ message: 'hi' })
  });
  assert.equal(res.status, 401);
});

test('setEndpoints revokes one endpoint without touching the others', async () => {
  const { server } = makeServer();
  server.setEndpoints([{ id: LEGACY_ENDPOINT_ID, name: 'Default webhook', secret: SECRET_B, schema: SCHEMA }]);

  const revoked = await request(server, {
    url: '/alpha', headers: auth(SECRET_A), body: post({ message: 'hi' })
  });
  assert.equal(revoked.status, 401, 'the revoked endpoint stops resolving immediately');

  const survivor = await request(server, {
    url: '/legacy', headers: auth(SECRET_B), body: post({ message: 'hi' })
  });
  assert.equal(survivor.status, 200, 'every other endpoint is undisturbed');
});

test('the body is validated against THAT endpoint schema', async () => {
  const { server } = makeServer();
  const bad = await request(server, {
    url: '/alpha', headers: auth(SECRET_A), body: post({ message: 'hi', count: 'seven' })
  });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /count/);

  const missing = await request(server, {
    url: '/alpha', headers: auth(SECRET_A), body: post({ title: 'no message here' })
  });
  assert.equal(missing.status, 400);

  const junk = await request(server, {
    url: '/alpha', headers: auth(SECRET_A), body: 'not json at all'
  });
  assert.equal(junk.status, 400);
  assert.equal(junk.body.error, 'bad json');
});

test('the caller declaration of kind/from is passed through', async () => {
  const { server, seen } = makeServer();
  await request(server, {
    url: '/alpha',
    headers: auth(SECRET_A),
    body: post({ message: 'ship it', kind: 'communication', from: 'ci-bot', title: 'build' })
  });
  assert.equal(seen[0].msg.kind, 'communication');
  assert.equal(seen[0].msg.from, 'ci-bot');
  assert.equal(seen[0].msg.title, 'build');
  // A kind the enum doesn't know is dropped rather than trusted.
  await request(server, {
    url: '/alpha', headers: auth(SECRET_A), body: post({ message: 'x', kind: 'anything-goes' })
  });
  assert.equal(seen[1].msg.kind, undefined);
});

test('a held message answers 202 with its token and no task', async () => {
  const { server } = makeServer({ pending: true });
  const res = await request(server, {
    url: '/alpha', headers: auth(SECRET_A), body: post({ message: 'do the thing' })
  });
  assert.equal(res.status, 202);
  assert.equal(res.body.pending, true);
  assert.equal(res.body.status, 'awaiting-approval');
  assert.equal(res.body.token, 'tok-pending');
  assert.equal(res.body.taskId, undefined);
});

test('GET is token-scoped, and answers 404 identically for every miss', async () => {
  const { server } = makeServer();
  const ok = await request(server, {
    method: 'GET', url: '/alpha', headers: { 'x-md-webhook-token': 'good-token' }
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'todo');

  const badToken = await request(server, {
    method: 'GET', url: '/alpha', headers: { 'x-md-webhook-token': 'nope' }
  });
  const badEndpoint = await request(server, {
    method: 'GET', url: '/ghost', headers: { 'x-md-webhook-token': 'good-token' }
  });
  assert.deepEqual(badToken.body, badEndpoint.body);
  assert.equal(badToken.status, 404);
  assert.equal(badEndpoint.status, 404);

  const noToken = await request(server, { method: 'GET', url: '/alpha' });
  assert.equal(noToken.status, 401);
});

test('the query-param token fallback still works', async () => {
  const { server } = makeServer();
  const res = await request(server, { method: 'GET', url: '/alpha?token=good-token' });
  assert.equal(res.status, 200);
});

test('one noisy endpoint cannot starve the others', async () => {
  const { server } = makeServer();
  let limited = 0;
  for (let i = 0; i < 61; i++) {
    const r = await request(server, {
      url: '/alpha', headers: auth(SECRET_A), body: post({ message: `n${i}` })
    });
    if (r.status === 429) limited++;
  }
  assert.ok(limited > 0, 'the per-endpoint budget must trip before the global one');

  const other = await request(server, {
    url: '/legacy', headers: auth(SECRET_B), body: post({ message: 'still fine' })
  });
  assert.equal(other.status, 200, 'a different endpoint keeps its own budget');
});

test('a secretless endpoint is never served', async () => {
  const { server } = makeServer();
  server.setEndpoints([{ id: 'empty', name: 'Empty', secret: '', schema: SCHEMA }]);
  assert.deepEqual(server.endpointIds(), []);
  const res = await request(server, {
    url: '/empty', headers: { 'x-md-webhook-secret': '' }, body: post({ message: 'hi' })
  });
  assert.equal(res.status, 401);
});

test('phone is reserved and can never be minted as an operator endpoint id', async () => {
  const { server } = makeServer();
  server.setEndpoints([
    ...endpoints(),
    { id: 'phone', name: 'sneaky', secret: SECRET_A, schema: SCHEMA },
    { id: 'PHONE', name: 'sneaky-caps', secret: SECRET_A, schema: SCHEMA }
  ]);
  const ids = server.endpointIds();
  assert.ok(!ids.includes('phone'), 'phone must never be servable as an operator endpoint');
  assert.ok(!ids.includes('PHONE'), 'the reservation is case-insensitive');
  // The positive half: the OTHER, non-reserved endpoints in the same call are
  // still served — a setEndpoints that dropped everything would satisfy the
  // negative half alone (D-40).
  assert.ok(ids.includes('alpha'));
  assert.ok(ids.includes(LEGACY_ENDPOINT_ID));
});

/* ─────────────────────────── /phone/** static shell ─────────────────────── */

test('PHONE_ASSETS is an exact-filename allowlist, exported', () => {
  const keys = Object.keys(PHONE_ASSETS);
  assert.ok(keys.length >= 5);
  for (const k of keys) assert.match(k, /^[a-z0-9][a-z0-9.-]*$/);
  assert.equal(PHONE_PREFIX, 'phone');
});

test('the dark state: an unarmed phone answers exactly like an unknown endpoint', async (t) => {
  const { server } = makePhoneServer(t, { unarmed: true });
  const dark = await request(server, { method: 'GET', url: '/phone/index.html' });
  const unknownEndpoint = await request(server, {
    method: 'GET', url: '/ghost', headers: { 'x-md-webhook-token': 'bogus' }
  });
  assert.equal(dark.status, 404);
  assert.deepEqual(dark.body, unknownEndpoint.body);
  assert.deepEqual(dark.body, { ok: false, error: 'not found' });
});

test('an armed phone serves index.html at both /phone and /phone/index.html, with the security headers', async (t) => {
  const { server, root } = makePhoneServer(t);
  for (const url of ['/phone', '/phone/', '/phone/index.html']) {
    const res = await request(server, { method: 'GET', url });
    assert.equal(res.status, 200, url);
    assert.equal(Buffer.isBuffer(res.body) ? res.body.toString('utf8') : res.body, 'hi');
    assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);
  }
  assert.ok(fs.existsSync(path.join(root, 'index.html')));
});

test('a filename outside the allowlist 404s, and staticRoot() returning null never throws', async (t) => {
  const { server } = makePhoneServer(t);
  const nope = await request(server, { method: 'GET', url: '/phone/nope.txt' });
  assert.equal(nope.status, 404);

  const { server: rootless } = makePhoneServer(t, { noRoot: true });
  const res = await request(rootless, { method: 'GET', url: '/phone/index.html' });
  assert.equal(res.status, 404, 'a missing resources/phone/ (pre-02-09) must 404, never throw/500');
});

test('six traversal shapes are refused, none returning file bytes', async (t) => {
  const { server } = makePhoneServer(t);
  // The pre-task 401 body, captured for the two cases URL normalisation lifts
  // clean out of the /phone/** branch entirely (readEndpointId then sees a
  // single unknown segment).
  const unknownGetWithToken = await request(server, {
    method: 'GET', url: '/ghost', headers: { 'x-md-webhook-token': 'bogus' }
  });
  assert.equal(unknownGetWithToken.status, 404);

  const cases = [
    ['/phone/../config.json', 'GET', { 'x-md-webhook-token': 'bogus' }],
    ['/phone/..%2fconfig.json', 'GET', {}],
    ['/phone/%2e%2e/config.json', 'GET', { 'x-md-webhook-token': 'bogus' }],
    ['/phone/sub/dir/index.html', 'GET', {}],
    ['/phone/./../../package.json', 'GET', { 'x-md-webhook-token': 'bogus' }],
    ['/phone/index.html%00.png', 'GET', {}]
  ];
  const statuses = [];
  for (const [url, method, headers] of cases) {
    const res = await request(server, { method, url, headers });
    statuses.push(res.status);
    assert.equal(res.status, 404, url);
    assert.ok(!Buffer.isBuffer(res.body) || res.body.length === 0 || res.body.toString('utf8') !== 'hi', url);
  }
  assert.deepEqual(statuses, [404, 404, 404, 404, 404, 404]);
});

test('a nested static path is not servable', async (t) => {
  const { server, root } = makePhoneServer(t);
  fs.mkdirSync(path.join(root, 'sub', 'dir'), { recursive: true });
  fs.writeFileSync(path.join(root, 'sub', 'dir', 'index.html'), 'nope');
  const res = await request(server, { method: 'GET', url: '/phone/sub/dir/index.html' });
  assert.equal(res.status, 404);
});

test('a single-segment unknown id is UNCHANGED by the phone route: same 401 as before', async (t) => {
  const { server } = makePhoneServer(t);
  const res = await request(server, {
    url: '/does-not-exist', headers: auth(SECRET_A), body: post({ message: 'hi' })
  });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { ok: false, error: 'unauthorized' });
});

test('the two normal endpoints keep working with the phone armed', async (t) => {
  const { server } = makePhoneServer(t);
  const res = await request(server, {
    url: '/alpha', headers: auth(SECRET_A), body: post({ message: 'still fine' })
  });
  assert.equal(res.status, 200);
});

test("the phone has its own rate bucket, strictly below the global cap, and it binds", async (t) => {
  const { server } = makePhoneServer(t);
  let limited = 0;
  for (let i = 0; i < 50; i++) {
    const res = await request(server, { method: 'GET', url: '/phone/index.html' });
    if (res.status === 429) limited++;
  }
  assert.ok(limited > 0, "the phone's own bucket must trip well before the global 120/window cap");
});

/* ────────────────────── enrollment → bearer → data API ──────────────────── */

const enrollHeaders = (token) => ({ 'x-md-phone-enroll': token });
const bearerHeaders = (bearer) => ({ authorization: `Bearer ${bearer}` });

test('the enrollment token is single-use: a replay fails, a fresh mint still succeeds', async (t) => {
  const { server } = makePhoneServer(t, { unarmed: true });
  const { token } = server.mintEnrollment();

  const first = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(token) });
  assert.equal(first.status, 200);
  assert.match(first.body.bearer, /^[0-9a-f]{48,}$/);

  const replay = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(token) });
  assert.equal(replay.status, 401);
  assert.deepEqual(replay.body, PHONE_AUTH_FAIL_BODY_SHAPE);

  // Positive half: burning everything cannot be what satisfies the negative
  // half alone (D-40) — a freshly minted token still succeeds.
  const { token: token2 } = server.mintEnrollment();
  const second = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(token2) });
  assert.equal(second.status, 200);
  assert.match(second.body.bearer, /^[0-9a-f]{48,}$/);
  assert.notEqual(second.body.bearer, first.body.bearer);
});

test('an expired enrollment token fails against an already-armed phone; re-minting invalidates its predecessor', async (t) => {
  // Armed independently of the token under test (a bearer already issued from
  // an earlier pairing) — otherwise letting the ONLY-ever-minted token expire
  // with nothing else armed correctly re-darkens the whole /phone/** surface
  // (the dark-state 404, tested separately) rather than reaching the compare
  // at all. This mirrors the realistic shape: an old/photographed token
  // presented while the phone is currently live.
  const clock = makeClock();
  const { server } = makePhoneServer(t, { unarmed: true, opts: { now: clock.now } });
  const bootstrap = server.mintEnrollment();
  const armVia = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(bootstrap.token) });
  assert.equal(armVia.status, 200);

  const { token, expiresAt } = server.mintEnrollment();
  assert.ok(expiresAt > clock.now());
  clock.advance(11 * 60_000); // past the 10-minute TTL
  const expired = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(token) });
  assert.equal(expired.status, 401);
  assert.deepEqual(expired.body, PHONE_AUTH_FAIL_BODY_SHAPE);

  // Re-mint invalidates the predecessor even before its own TTL would have
  // lapsed.
  const first = server.mintEnrollment();
  const second = server.mintEnrollment();
  const oldReq = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(first.token) });
  assert.equal(oldReq.status, 401, 'the first mint is dead the instant the second is drawn');
  const newReq = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(second.token) });
  assert.equal(newReq.status, 200);
});

test('the ONLY-ever enrollment expiring with no bearer issued re-darkens the whole /phone/** surface', async (t) => {
  const clock = makeClock();
  const { server } = makePhoneServer(t, { unarmed: true, opts: { now: clock.now } });
  server.mintEnrollment();
  clock.advance(11 * 60_000);
  const res = await request(server, { method: 'GET', url: '/phone/index.html' });
  assert.equal(res.status, 404, 'nothing was ever completed, so the door goes dark again, not merely unauthorized');
  assert.deepEqual(res.body, { ok: false, error: 'not found' });
});

test('the bearer is header-only: a query-param presentation is refused, the header is accepted', async (t) => {
  const { server } = makePhoneServer(t, { unarmed: true });
  const { token } = server.mintEnrollment();
  const enrolled = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(token) });
  const bearer = enrolled.body.bearer;

  const viaQuery = await request(server, { method: 'GET', url: `/phone/api/asks?token=${bearer}` });
  assert.equal(viaQuery.status, 401, 'no phone credential may be accepted from a query parameter (D-20)');

  const viaHeader = await request(server, { method: 'GET', url: '/phone/api/asks', headers: bearerHeaders(bearer) });
  assert.equal(viaHeader.status, 200);
});

test('every auth failure on /phone/api/** is byte-identical: absent, wrong bearer, burned, expired, unknown route', async (t) => {
  const clock = makeClock();
  const { server } = makePhoneServer(t, { unarmed: true, opts: { now: clock.now } });
  const { token } = server.mintEnrollment();
  const enrolled = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(token) });
  const bearer = enrolled.body.bearer;

  const absent = await request(server, { method: 'GET', url: '/phone/api/asks' });
  const wrong = await request(server, { method: 'GET', url: '/phone/api/asks', headers: bearerHeaders('f'.repeat(48)) });
  const burned = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(token) });
  const { token: t2 } = server.mintEnrollment();
  clock.advance(11 * 60_000);
  const expired = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(t2) });
  const unknownRoute = await request(server, { method: 'GET', url: '/phone/api/nope', headers: bearerHeaders(bearer) });

  for (const [name, res] of [['absent', absent], ['wrong', wrong], ['burned', burned], ['expired', expired], ['unknown-route', unknownRoute]]) {
    assert.equal(res.status, 401, name);
    assert.deepEqual(res.body, PHONE_AUTH_FAIL_BODY_SHAPE, name);
  }
});

test('GET /phone/api/asks returns exactly what openAsks() returned, newest first, and never throws', async (t) => {
  const fixtureAsks = [
    { taskId: 'a', title: 'A', question: 'q1' },
    { taskId: 'b', title: 'B', question: 'q2' },
    { taskId: 'c', title: 'C', question: 'q3' }
  ];
  const { server } = makePhoneServer(t, { opts: { openAsks: () => fixtureAsks } });
  const mint = server.mintEnrollment();
  const ex = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(mint.token) });
  const res = await request(server, { method: 'GET', url: '/phone/api/asks', headers: bearerHeaders(ex.body.bearer) });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.asks, fixtureAsks);

  const { server: throws } = makePhoneServer(t, { opts: { openAsks: () => { throw new Error('boom'); } } });
  const m2 = throws.mintEnrollment();
  const ex2 = await request(throws, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(m2.token) });
  const res2 = await request(throws, { method: 'GET', url: '/phone/api/asks', headers: bearerHeaders(ex2.body.bearer) });
  assert.equal(res2.status, 200);
  assert.deepEqual(res2.body, { ok: true, asks: [] });
});

test('POST /phone/api/answer calls answerAsk with the exact trimmed args, and refuses an oversized body', async (t) => {
  const calls = [];
  const { server } = makePhoneServer(t, {
    opts: { answerAsk: (taskId, answer) => { calls.push({ taskId, answer }); return true; } }
  });
  const mint = server.mintEnrollment();
  const ex = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(mint.token) });
  const bearer = ex.body.bearer;

  const res = await request(server, {
    method: 'POST', url: '/phone/api/answer', headers: bearerHeaders(bearer),
    body: JSON.stringify({ taskId: 'webhook-abc123', answer: '  yes, ship it  ' })
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(calls, [{ taskId: 'webhook-abc123', answer: 'yes, ship it' }]);

  const oversized = 'x'.repeat(9 * 1024);
  const big = await request(server, {
    method: 'POST', url: '/phone/api/answer', headers: bearerHeaders(bearer),
    body: JSON.stringify({ taskId: 'webhook-abc123', answer: oversized })
  });
  assert.equal(big.status, 413);
  assert.equal(calls.length, 1, 'answerAsk must never be invoked for an oversized body');
});

test('the lockout engages after PHONE_LOCKOUT_FAILURES and clears after PHONE_LOCKOUT_MS', async (t) => {
  const clock = makeClock();
  const { server } = makePhoneServer(t, { unarmed: true, opts: { now: clock.now } });
  const { token } = server.mintEnrollment();
  const enrolled = await request(server, { method: 'POST', url: '/phone/api/enroll', headers: enrollHeaders(token) });
  const bearer = enrolled.body.bearer;

  for (let i = 0; i < 5; i++) {
    const res = await request(server, { method: 'GET', url: '/phone/api/asks', headers: bearerHeaders('bad'.repeat(20)) });
    assert.equal(res.status, 401);
  }
  const stillLocked = await request(server, { method: 'GET', url: '/phone/api/asks', headers: bearerHeaders(bearer) });
  assert.equal(stillLocked.status, 401, 'the NEXT VALID credential is still refused while locked out');

  clock.advance(31_000);
  const cleared = await request(server, { method: 'GET', url: '/phone/api/asks', headers: bearerHeaders(bearer) });
  assert.equal(cleared.status, 200, 'the lockout provably clears');
});

/* ───────────────────── per-endpoint verifier strategy (D-24) ────────────── */

const crypto = require('node:crypto');

function makeDiscordKeypair() {
  return crypto.generateKeyPairSync('ed25519');
}

/** The 64-character hex application public key Discord publishes — the SAME
 *  shape as the plan's own live round trip: export SPKI DER, drop the
 *  12-byte header, hex-encode the 32 raw bytes. */
function discordPublicKeyHex(publicKey) {
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  return spki.subarray(spki.length - 32).toString('hex');
}

function signDiscord(privateKey, ts, rawBody) {
  return crypto.sign(null, Buffer.from(ts + rawBody), privateKey).toString('hex');
}

function discordHeaders(sig, ts) {
  return { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts };
}

test('Discord: valid signature accepted, tampered body rejected, stale timestamp rejected, malformed key never 500s', async () => {
  const { privateKey, publicKey } = makeDiscordKeypair();
  const pubHex = discordPublicKeyHex(publicKey);
  const { server, seen } = makeServer({
    opts: { endpoints: [{ id: 'dsc', name: 'Discord', secret: pubHex, verifier: 'discord', schema: SCHEMA }] }
  });

  const ts = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 2, data: { name: 'ping', options: [{ value: 'hello from discord' }] } });
  const sig = signDiscord(privateKey, ts, body);

  const ok = await request(server, { url: '/dsc', headers: discordHeaders(sig, ts), body });
  assert.equal(ok.status, 200);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].msg.message, 'hello from discord');

  const tampered = body + ' ';
  const tamperedRes = await request(server, { url: '/dsc', headers: discordHeaders(sig, ts), body: tampered });
  assert.equal(tamperedRes.status, 401);

  const staleTs = String(Math.floor(Date.now() / 1000) - 60 * 10);
  const staleSig = signDiscord(privateKey, staleTs, body);
  const stale = await request(server, { url: '/dsc', headers: discordHeaders(staleSig, staleTs), body });
  assert.equal(stale.status, 401);

  const { server: badKeyServer } = makeServer({
    opts: { endpoints: [{ id: 'dsc', name: 'Discord', secret: 'not-a-key', verifier: 'discord', schema: SCHEMA }] }
  });
  const badKey = await request(badKeyServer, { url: '/dsc', headers: discordHeaders(sig, ts), body });
  assert.equal(badKey.status, 401, 'a malformed stored public key must 401, never 500');

  assert.equal(seen.length, 1, 'only the one valid request ever reached onMessage');
});

test('Discord: a body over DISCORD_MAX_BODY_BYTES is refused with 413, onMessage never called', async () => {
  const { privateKey, publicKey } = makeDiscordKeypair();
  const pubHex = discordPublicKeyHex(publicKey);
  const { server, seen } = makeServer({
    opts: { endpoints: [{ id: 'dsc', name: 'Discord', secret: pubHex, verifier: 'discord', schema: SCHEMA }] }
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const oversized = JSON.stringify({ type: 2, data: { name: 'x'.repeat(70 * 1024) } });
  const sig = signDiscord(privateKey, ts, oversized);
  const res = await request(server, { url: '/dsc', headers: discordHeaders(sig, ts), body: oversized });
  assert.equal(res.status, 413);
  assert.equal(seen.length, 0);
});

test("Discord's PING is answered after verification; a bad signature on a PING still 401s", async () => {
  const { privateKey, publicKey } = makeDiscordKeypair();
  const pubHex = discordPublicKeyHex(publicKey);
  const { server } = makeServer({
    opts: { endpoints: [{ id: 'dsc', name: 'Discord', secret: pubHex, verifier: 'discord', schema: SCHEMA }] }
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const ping = JSON.stringify({ type: 1 });
  const sig = signDiscord(privateKey, ts, ping);

  const ok = await request(server, { url: '/dsc', headers: discordHeaders(sig, ts), body: ping });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { type: 1 });

  const bad = await request(server, { url: '/dsc', headers: discordHeaders('00'.repeat(64), ts), body: ping });
  assert.equal(bad.status, 401);
});

test('the Discord inversion is keyed on the REQUEST, not on config: unknown id and known discord endpoint answer the identical 401', async () => {
  const { privateKey, publicKey } = makeDiscordKeypair();
  const pubHex = discordPublicKeyHex(publicKey);
  const { server } = makeServer({
    opts: { endpoints: [{ id: 'dsc', name: 'Discord', secret: pubHex, verifier: 'discord', schema: SCHEMA }] }
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ type: 2, data: { name: 'x' } });
  const badSig = '00'.repeat(64);

  const unknownId = await request(server, { url: '/not-discord-at-all', headers: discordHeaders(badSig, ts), body });
  const knownWrongSig = await request(server, { url: '/dsc', headers: discordHeaders(badSig, ts), body });
  assert.equal(unknownId.status, 401);
  assert.equal(knownWrongSig.status, 401);
  assert.deepEqual(unknownId.body, knownWrongSig.body);
});

test('default order did not move: a shared-secret POST with a wrong secret 401s WITHOUT the body ever being read', async () => {
  const { server, seen } = makeServer();
  let dataEventFired = false;
  await new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = 'POST';
    req.url = '/alpha';
    req.headers = auth(SECRET_B); // wrong secret for /alpha
    req.destroy = () => { /* no socket to tear down */ };
    req.on('newListener', (event) => { if (event === 'data') dataEventFired = true; });
    const res = {
      writeHead(status) { res._status = status; return res; },
      end() { resolve(); }
    };
    server.handleRequest(req, res);
  });
  assert.equal(dataEventFired, false, 'readBody must never be reached — verifySecret runs first and fails synchronously');
  assert.equal(seen.length, 0);
});

test('Telegram: correct secret_token adapts the update, a wrong one 401s identically to shared-secret', async () => {
  const { server, seen } = makeServer({
    opts: { endpoints: [{ id: 'tg', name: 'Telegram', secret: 'tg-secret-token', verifier: 'telegram', schema: SCHEMA }] }
  });
  const update = JSON.stringify({
    update_id: 1,
    message: { text: 'hello from telegram', from: { username: 'someuser' } }
  });
  const ok = await request(server, {
    url: '/tg', headers: { 'x-telegram-bot-api-secret-token': 'tg-secret-token' }, body: update
  });
  assert.equal(ok.status, 200);
  assert.equal(seen[0].msg.message, 'hello from telegram');
  assert.equal(seen[0].msg.from, 'someuser');

  const wrong = await request(server, {
    url: '/tg', headers: { 'x-telegram-bot-api-secret-token': 'nope' }, body: update
  });
  const sharedWrong = await request(server, { url: '/alpha', headers: auth(SECRET_B), body: post({ message: 'x' }) });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, sharedWrong.body);
});

test('the mode gate still applies to an adapted Telegram directive: strict mode holds it at 202, not 200', async () => {
  const { server } = makeServer({
    opts: {
      endpoints: [{
        id: 'tg', name: 'Telegram', secret: 'tg-secret-token', verifier: 'telegram', schema: SCHEMA
      }]
    },
    pending: true
  });
  const update = JSON.stringify({ update_id: 1, message: { text: 'deploy the release now', from: { username: 'x' } } });
  const res = await request(server, {
    url: '/tg', headers: { 'x-telegram-bot-api-secret-token': 'tg-secret-token' }, body: update
  });
  assert.equal(res.status, 202);
  assert.equal(res.body.pending, true);
});

test('start() alone opens no tunnel — DAEMON-05\'s off-by-default clause, proven as behaviour not grep', async (t) => {
  const { server } = makeServer();
  t.after(() => server.stop());
  const res = await server.start();
  assert.equal(res.ok, true);
  assert.equal(server.publicUrl(), null, 'start() must not have opened any tunnel as a side effect');
  assert.equal(server.listening(), true, 'the local security boundary must still be live on its own');
});

/* ───────────── D-23's circularity, and the 02-12 fresh-install fix ──────── */

test('start() refuses to bind with zero endpoints and an unarmed phone — a stone-cold-default install has nothing to expose', async (t) => {
  const { server } = makeServer({ opts: { endpoints: [] } });
  t.after(() => server.stop());
  const res = await server.start();
  assert.equal(res.ok, false);
  assert.equal(res.error, 'no enabled webhook endpoints');
  assert.equal(server.listening(), false, 'a refused start() must not leave a port bound');
});

test('mint-then-start with zero endpoints binds once the phone is armed — the exact sequence tunnel:start now uses on a fresh install', async (t) => {
  const { server } = makeServer({ opts: { endpoints: [] } });
  t.after(() => server.stop());
  // The same order index.ts's tunnel:start handler runs when
  // enabledWebhookEndpoints() is empty (02-12 fix): mint an enrollment
  // BEFORE calling start(), never after — start()'s own guard reads
  // phoneArmed() synchronously and a mint that arrives later is too late.
  server.mintEnrollment();
  const res = await server.start();
  assert.equal(res.ok, true, 'an armed phone must be enough to bind with zero webhook endpoints configured');
  assert.equal(server.listening(), true);
  assert.equal(server.publicUrl(), null, 'start() still opens no tunnel by itself — arming is not the same as exposing');
});
