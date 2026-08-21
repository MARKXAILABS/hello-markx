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
 *   2. The hook socket AUTHENTICATES PER AGENT. It is a UDS / named pipe, so any
 *      local process could post a payload claiming any `agent_id` — enough to
 *      hijack a --resume session id, poison the cost ledger, or clear breaker
 *      state. So identity is DERIVED from a token minted for one agent at one
 *      PTY spawn, and `payload.agent_id` is not read at all (GATE-01).
 *   3. Every secret/token compare is LENGTH-INDEPENDENT: both sides are hashed
 *      to a fixed 32 bytes before `timingSafeEqual`, so the old
 *      `if (a.length !== b.length) return false` length oracle is gone.
 *   4. The hook socket is a CONTROL over the hive's own protected paths, and the
 *      socket itself does not fail open when someone deletes it.
 *
 * (2) and (4) are driven over a REAL socket rather than by calling the handler:
 * the gate deliberately lives at the socket, not inside `handle`, because
 * main-side callers that build their own payloads are already inside the trust
 * boundary.
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
const { HookServer } = loadTs('src/main/hooks.ts');

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

/** A throwaway hive ROOT. Its own mkdtemp, never derived from the socket path:
 *  on win32 `sockPath()` returns a `\\.\pipe\` NAME and creates no directory at
 *  all, so a `path.dirname` of it would make every protected-path assertion
 *  below vacuous on the one platform that most needs them. */
function hiveRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-net-binding-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return fs.realpathSync(dir); // macOS /var → /private/var; compare like for like
}

/** The socket for that root — the same shape `hive.ts:469-476` derives: a file
 *  directly under the root on POSIX, a flat pipe name on win32. */
function sockFor(root) {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\md-net-binding-${randomBytes(6).toString('hex')}`
    : path.join(root, 'hooks.sock');
}

/** A live HookServer on a throwaway socket, plus everything it emitted. */
async function hookFloor(t, { watchdogMs } = {}) {
  const root = hiveRoot(t);
  const sock = sockFor(root);
  const sent = [];
  const hive = {
    root: () => root,
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
  if (watchdogMs) server.socketWatchdogMs = watchdogMs; // before start(), it arms there
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
  return { send, sent, server, root, sock };
}

test('a token names ONE agent, and a fresh one every spawn', async (t) => {
  const { server } = await hookFloor(t);
  const a = server.mintToken('jim-1');
  const b = server.mintToken('jim-1');
  assert.match(a, /^[0-9a-f]{64}$/, '256 bits of randomness, hex');
  assert.notEqual(a, b, 'a per-spawn token that repeats is a floor-wide token wearing a hat');
  assert.notEqual(a, server.mintToken('pam-1'));
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
  const { send, sent, server } = await hookFloor(t);
  await send({
    hook_event_name: 'PreToolUse',
    agent_id: 'jim-1',
    tool_name: 'Bash',
    sock_token: server.mintToken('jim-1')
  });
  assert.equal(sent.length, 1, 'the real shim must still get through');
  assert.equal(sent[0].channel, 'hive:hookEvent');
  assert.equal(sent[0].payload.agentId, 'jim-1');
});

// ─── 2b. identity is DERIVED, not claimed (GATE-01, D-16) ────────────────────

test("agent A's token cannot post as agent B, however the payload is addressed", async (t) => {
  const { send, sent, server } = await hookFloor(t);
  const tokenA = server.mintToken('a-1');
  server.mintToken('b-1'); // B exists on the floor; A just never gets to be it

  const resp = await send({
    hook_event_name: 'Stop',
    agent_id: 'b-1',            // the lie
    sock_token: tokenA,         // the truth
    session_id: 's-forged'
  });

  assert.equal(sent.length, 1, 'A is a real agent — its own events must still land');
  assert.equal(
    sent[0].payload.agentId, 'a-1',
    'the payload was attributed to the agent it CLAIMED to be. payload.agent_id is '
    + 'attacker-controlled on a socket any local process can reach, so anything read '
    + 'from it can hijack another agent\'s --resume id, cost ledger and breaker state'
  );
  assert.notEqual(sent[0].payload.agentId, 'b-1');
  assert.equal(resp, '{}');
});

test('an unknown token is refused like any stranger, and counted', async (t) => {
  const { send, sent, server } = await hookFloor(t);
  const before = server.rejected;
  const resp = await send({
    hook_event_name: 'Stop', agent_id: 'a-1', sock_token: 'f'.repeat(64)
  });
  assert.equal(resp, '{}', 'a rejected peer must not be able to tell it was rejected');
  assert.equal(sent.length, 0, 'a token nobody minted reached the handler');
  assert.ok(
    server.rejected > before,
    'the rejection went uncounted — the throttled log is the only warning an operator '
    + 'gets that a whole engine has gone dead-hooked'
  );
});

test('revoking an agent retires the tokens it was holding', async (t) => {
  const { send, sent, server } = await hookFloor(t);
  const token = server.mintToken('a-1');
  await send({ hook_event_name: 'Stop', agent_id: 'a-1', sock_token: token });
  assert.equal(sent.length, 1, 'sanity: the token worked before revocation');

  server.revokeAgent('a-1');
  await send({ hook_event_name: 'Stop', agent_id: 'a-1', sock_token: token });
  assert.equal(
    sent.length, 1,
    'a token outlived the PTY it was minted for. Whatever read that env — a leaked '
    + 'log, a crash dump, a sibling process — keeps agent identity forever'
  );
});

// ─── 2c. the hive's own protected paths (T-P02-09/12/13) ─────────────────────

test('an agent cannot write the shim, the hive .git, the socket, or another agent', async (t) => {
  const { send, server, root, sock } = await hookFloor(t);
  const token = server.mintToken('a-1');
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });

  /** Drive a real PreToolUse over the real socket and report the decision. */
  const decide = async (tool_name, tool_input) => {
    const resp = await send({ hook_event_name: 'PreToolUse', agent_id: 'a-1', sock_token: token, tool_name, tool_input });
    return JSON.parse(resp)?.hookSpecificOutput?.permissionDecision ?? 'allow';
  };
  const shim = path.join(root, 'bin', 'cth-hook.cjs');

  // 1 — the ONE shim every agent's hooks execute. Appending to it runs the
  //     caller's code inside another agent's hook, with that agent's env.
  assert.equal(await decide('Write', { file_path: shim }), 'deny',
    'agent A can rewrite the shim agent B\'s hooks run — per-agent tokens are then decorative');
  // 2 — the same target through Bash, which no file-tool rule sees.
  assert.equal(await decide('Bash', { command: `cat >> ${shim}` }), 'deny',
    'the file tools are gated but the shell is not — one `cat >>` undoes the gate');
  // 3 — the UNEXPANDED literal. hive.ts:1366 names HIVE_ROOT in every agent's
  //     injected prompt, so this is the app's own documented calling convention,
  //     and a path.resolve+startsWith gate never matches it.
  assert.equal(await decide('Bash', { command: 'cat >> "$HIVE_ROOT/bin/cth-hook.cjs"' }), 'deny',
    'the spelling the app TEACHES agents to use walks straight past the gate');
  // 4 — the hive root is a git repo main commits to; a hook there executes as a
  //     child of the main process, outside every limit the agent itself has.
  assert.equal(await decide('Write', { file_path: path.join(root, '.git', 'hooks', 'pre-commit') }), 'deny',
    'a pre-commit hook in the hive repo is arbitrary execution as a child of main');
  // 5 — deleting the socket is fail-OPEN floor-wide: the shims exit 0 on a
  //     connect error, and exit 0 with no stdout is `allow`. POSIX-shaped: on
  //     win32 `sockPath()` is a `\\.\pipe\` NAME with no filesystem entry, so
  //     there is no `rm` to deny and Node refuses a second bind on a live pipe.
  if (process.platform !== 'win32') {
    assert.equal(await decide('Bash', { command: `rm ${sock}` }), 'deny',
      'one `rm` of the socket disables the PreToolUse gate for every agent on the floor');
  } else {
    console.error('[net-binding] socket-delete case skipped — a win32 named pipe has no file to rm');
  }
  // 6 — another agent's settings.json names the hook commands THAT agent runs.
  assert.equal(await decide('Write', { file_path: path.join(root, 'agents', 'b-1', 'settings.json') }), 'deny',
    'writing another agent\'s settings.json is code execution in their session');

  // 7 — CALIBRATION. An agent may write its OWN directory. A gate that blocks
  //     this is an outage, not a control, and it runs on every PreToolUse.
  assert.equal(await decide('Write', { file_path: path.join(root, 'agents', 'a-1', 'settings.json') }), 'allow',
    'an agent was denied its OWN agent directory — that stops ordinary work');
  // 9 — CALIBRATION. Ordinary work in the agent's own cwd is untouched.
  assert.equal(await decide('Write', { file_path: path.join(os.tmpdir(), 'ordinary-file.ts') }), 'allow',
    'an ordinary file write was denied — this gate is on the hot path of every tool call');
  assert.equal(await decide('Bash', { command: 'npm test' }), 'allow');

  // 8 — the symlink hop. `path.resolve` normalizes `..` but does NOT follow
  //     links, so this is the second case a resolve+startsWith gate allows while
  //     looking correct. POSIX-first: win32 symlinkSync needs elevation or
  //     Developer Mode, so only THIS case is conditional — never the whole test,
  //     which would exit 0 while asserting nothing.
  const hop = path.join(hiveRoot(t), 'b');
  let linked = null;
  try { fs.symlinkSync(path.join(root, 'bin'), hop, 'dir'); linked = true; }
  catch (e) { linked = e; }
  if (linked === true) {
    assert.equal(await decide('Write', { file_path: path.join(hop, 'cth-hook.cjs') }), 'deny',
      'a symlink into <hive>/bin was allowed — realpath is not being applied to the target');
  } else {
    // Not a silent skip: the caught error is the evidence.
    console.error(`[net-binding] symlink case skipped — symlinkSync threw: ${linked.message}`);
  }
});

test('deleting the hook socket no longer opens the gate until the app restarts', async (t) => {
  // POSIX-only for the same reason sockFor() is: a win32 `\\.\pipe\` name has no
  // filesystem entry, so there is nothing to delete and nothing to re-take.
  if (process.platform === 'win32') {
    console.error('[net-binding] socket watchdog case skipped — win32 named pipes have no file to unlink');
    return;
  }
  const { send, sent, server, sock } = await hookFloor(t, { watchdogMs: 50 });
  const token = server.mintToken('a-1');

  fs.unlinkSync(sock); // exactly what `rm "$HIVE_ROOT/hooks.sock"` does
  await new Promise((r) => setTimeout(r, 400)); // past several watchdog ticks

  await send({ hook_event_name: 'Stop', agent_id: 'a-1', sock_token: token });
  assert.equal(
    sent.length, 1,
    'the socket stayed dead after deletion. Every shim then fails to connect, exits 0, '
    + 'and Claude Code reads exit-0-with-no-stdout as ALLOW — so the PreToolUse gate is '
    + 'open for the whole floor until someone restarts the app'
  );
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

test('the floor-wide hook token cannot come back into main', () => {
  // D-12. `pty.ts` spreads process.env into every PTY, so ONE assignment on the
  // main process's own environment hands every LLM-controlled shell on the floor
  // the key that authenticates every other agent — which makes per-agent tokens
  // cosmetic. Pinned as source, because the behavioural symptom (an agent
  // authenticating as another) only shows up with two live PTYs.
  //
  // Comments stripped first, and that step is load-bearing: index.ts deliberately
  // keeps a paragraph explaining what was deleted and why.
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const dir = path.resolve(__dirname, '..', 'src/main');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = stripComments(fs.readFileSync(path.join(dir, file), 'utf8'));
    assert.equal(
      /process\.env\.HIVE_SOCK_TOKEN\s*=/.test(src), false,
      `src/main/${file} assigns a floor-wide HIVE_SOCK_TOKEN again. Every PTY inherits `
      + 'it, so every agent can read the token that authenticates every other agent'
    );
  }
});
