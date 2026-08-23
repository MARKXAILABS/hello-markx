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
 *
 * Property (1) — loopback-only binding — now has a companion (DAEMON-05):
 * the public reach beyond that loopback bind is a cloudflared CHILD PROCESS
 * this app spawned, and `stop()` genuinely closes it (`src/main/tunnel.ts`,
 * `hardKillTree`). It is no longer a library call with "genuinely no handle
 * to capture" — see the inverted case below, which used to be titled for the
 * defect and is now titled for the fix.
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
const { HookServer, HOOK_LINE_MAX } = loadTs('src/main/hooks.ts');

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

test('stop() genuinely closes the tunnel — the child\'s own stop() ran, and publicUrl() goes null', async (t) => {
  const server = new WebhookServer({
    port: 0,
    endpoints: [{ id: 'alpha', name: 'Alpha', secret: SECRET, schema: SCHEMA }],
    onMessage: () => ({ token: 't', pending: false }),
    lookupStatus: () => null
  });
  t.after(() => server.stop());
  const stopCalls = [];
  const fakeHandle = { url: 'https://adams-medical-meeting-enormous.trycloudflare.com', stop: () => stopCalls.push(Date.now()) };
  const fakeOpener = async () => fakeHandle;

  await server.listen();
  const res = await server.startTunnel(fakeOpener);
  assert.equal(res.ok, true);
  assert.equal(server.publicUrl(), fakeHandle.url);

  server.stop();
  assert.equal(stopCalls.length, 1, 'the tunnel handle\'s own stop() must run — this is what actually closes it');
  assert.equal(server.publicUrl(), null);

  // Idempotent: a second stop() must not re-close an already-closed tunnel.
  server.stop();
  assert.equal(stopCalls.length, 1, 'idempotent: nothing left to close');
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

/**
 * A live HookServer on a throwaway socket, plus everything it emitted.
 *
 * `registry` is NOT optional decoration. `denyReason` now measures a RELATIVE
 * target against the agent's absolute registry cwd, so a stub without it throws
 * a TypeError inside `handle()` — which `listenOn` catches and turns into `{}`,
 * i.e. ALLOW. Every deny assertion in this file would then go green-to-red
 * silently. `agentCwd` defaults to the OS temp dir: absolute, existing, and
 * nowhere near the hive, so the nine pre-existing cases below are byte-identical
 * with it as with no registry at all.
 */
async function hookFloor(t, { watchdogMs, rootDir, agentCwd, agents } = {}) {
  const root = rootDir ?? hiveRoot(t);
  const sock = sockFor(root);
  const sent = [];
  const registry = agents ?? { 'a-1': { cwd: agentCwd ?? os.tmpdir(), cwdValid: true } };
  const hive = {
    root: () => root,
    sockPath: () => sock,
    recordSession: () => {},
    isGod: () => false,
    rosterContext: () => null,
    registry: () => ({ godId: null, agents: registry })
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

/** Drive a real PreToolUse over the real socket and report BOTH halves of the
 *  answer. The reason matters as much as the verdict: "main cannot frame this",
 *  "main cannot identify this" and "<hive>/bin" are three different failures and
 *  a test that only reads `permissionDecision` cannot tell them apart. */
function decider(floor, token, extra = {}) {
  return async (tool_name, tool_input) => {
    const resp = await floor.send({
      hook_event_name: 'PreToolUse', agent_id: 'a-1', sock_token: token, tool_name, tool_input, ...extra
    });
    const out = JSON.parse(resp)?.hookSpecificOutput ?? {};
    return { decision: out.permissionDecision ?? 'allow', reason: out.permissionDecisionReason ?? '' };
  };
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

// ─── 2d. the FRAME of a relative target (GATE-01 gap SC-3) ───────────────────

/** A throwaway directory that is NOT a hive — a project cwd, a link target. */
function tmpDir(t, prefix = 'md-net-binding-x-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return fs.realpathSync(dir);
}

/** A hive UNDER the real home directory, so `~/…` and `$HOME/…` can be spelled
 *  against it for real rather than simulated. */
function homeHive(t) {
  const dir = fs.mkdtempSync(path.join(os.homedir(), '.md-net-binding-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return fs.realpathSync(dir);
}

/** A hive whose `bin/` holds a real shim, plus `agents/a-1` as the agent's cwd. */
function seedHive(t, root) {
  fs.mkdirSync(path.join(root, 'bin', 'runtime'), { recursive: true });
  fs.mkdirSync(path.join(root, 'agents', 'a-1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bin', 'cth-hook.cjs'), '// the one shim\n');
  // C-1: `<hive>/bin/runtime` is on EVERY agent PTY's PATH (hive.ts runtimeBinDir,
  // pty.ts withHiveRuntimeFallback), so a second directory entry for a file in it
  // is arbitrary code execution in every agent — one level below `bin/` itself.
  fs.writeFileSync(path.join(root, 'bin', 'runtime', 'node.cmd'), '@echo off\n');
  return path.join(root, 'bin', 'cth-hook.cjs');
}

test('a RELATIVE PreToolUse target is framed by the agent\'s registry cwd, not main\'s', async (t) => {
  const root = hiveRoot(t);
  const shim = seedHive(t, root);
  const cwd = path.join(root, 'agents', 'a-1');
  const floor = await hookFloor(t, { rootDir: root, agentCwd: cwd });
  const decide = decider(floor, floor.server.mintToken('a-1'));

  assert.equal((await decide('Write', { file_path: '../../bin/cth-hook.cjs' })).decision, 'deny',
    'a relative target was resolved against the ELECTRON MAIN process cwd, which has nothing '
    + 'to do with the agent. Every deny branch in this gate is then one `../` away from decorative');
  assert.equal((await decide('Bash', { command: 'cat >> ../../bin/cth-hook.cjs' })).decision, 'deny',
    'the same hole through the shell arm');
  assert.equal((await decide('Write', { file_path: '../b-1/settings.json' })).decision, 'deny',
    'another agent\'s settings.json, reached relatively');

  // CALIBRATION — the agent's OWN directory, relatively, is still its own.
  assert.equal((await decide('Write', { file_path: 'notes.md' })).decision, 'allow',
    'an agent was denied a plain file in its own cwd');
  assert.equal(fs.existsSync(shim), true, 'sanity: the shim this test aims at exists');
});

test('a `~/…` and a `$HOME/…` target reach the same deny branch their absolute spelling does', async (t) => {
  const root = homeHive(t);
  seedHive(t, root);
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  const rel = path.relative(os.homedir(), path.join(root, 'bin', 'cth-hook.cjs'));

  assert.equal((await decide('Write', { file_path: `~${path.sep}${rel}` })).decision, 'deny',
    '`~` is expanded by the SHELL, never by this gate, so a tilde-spelled shim path walked past it');
  assert.equal((await decide('Bash', { command: `cat >> $HOME/${rel.split(path.sep).join('/')}` })).decision, 'deny',
    '$HOME is a shell variable the gate never expanded, so the same target spelled with it walked past');
});

test('$HOME expansion does not eat $HOMEPATH and $HOMEDRIVE', async (t) => {
  const floor = await hookFloor(t);
  const out = floor.server.expandHiveVars('a-1', 'echo $HOMEPATH $HOMEDRIVE ${HOME}/a $HOME/b');
  assert.match(out, /\$HOMEPATH/,
    'a bare-substring $HOME replacement rewrote the REAL Windows $HOMEPATH variable into garbage — '
    + 'a silent behaviour change on every Bash command an agent runs on Windows');
  assert.match(out, /\$HOMEDRIVE/, 'same for $HOMEDRIVE');
  assert.ok(out.includes(`${os.homedir()}/a`), '${HOME} must still expand');
  assert.ok(out.includes(`${os.homedir()}/b`), '$HOME must still expand');
});

test('a relative target with NO absolute registry base is denied — and an attacker-supplied cwd cannot lift it', async (t) => {
  const root = hiveRoot(t);
  seedHive(t, root);
  // hive.ts stores whatever cwd it was handed and merely RECORDS cwdValid beside
  // it (cwdValidity → 'not-absolute'), so a relative registry cwd reaches the
  // registry unchanged. RegistryAgent.cwdValid's own JSDoc names this case.
  const floor = await hookFloor(t, {
    rootDir: root, agents: { 'a-1': { cwd: 'ClaudeTerminalHarness', cwdValid: false } }
  });
  const decide = decider(floor, floor.server.mintToken('a-1'));

  const bare = await decide('Write', { file_path: '../../bin/cth-hook.cjs' });
  assert.equal(bare.decision, 'deny', 'with no absolute base the target is unlocatable — that is a DENY');
  assert.match(bare.reason, /cwdValid/,
    'the reason must name cwdValid so an operator can fix the registry rather than guess');

  // DENY-WINS. One JSON field must not convert a deny into an allow.
  const withCwd = decider(floor, floor.server.mintToken('a-1'), { cwd: os.tmpdir() });
  const lifted = await withCwd('Write', { file_path: '../../bin/cth-hook.cjs' });
  assert.equal(lifted.decision, 'deny',
    'supplying an absolute payload.cwd made the candidate-base set non-empty, no branch matched, '
    + 'and the same write flipped from DENY to ALLOW. One JSON field bought the bypass');
  assert.match(lifted.reason, /cwdValid/, 'and it must be the same reason, not a different failure');
});

test('payload.cwd is READ — it can only ever add a deny, never remove one', async (t) => {
  const root = hiveRoot(t);
  seedHive(t, root);
  const project = tmpDir(t);
  const floor = await hookFloor(t, { rootDir: root, agentCwd: project });
  const token = floor.server.mintToken('a-1');
  // Registry base alone: `../../bin/cth-hook.cjs` from a project dir is ordinary work.
  assert.equal((await decider(floor, token)('Write', { file_path: '../../bin/cth-hook.cjs' })).decision,
    'allow', 'calibration: from an ordinary project cwd this is not the hive shim');
  // The agent then tells the truth about having cd\'d into its hive dir.
  const withCwd = decider(floor, token, { cwd: path.join(root, 'agents', 'a-1') });
  assert.equal((await withCwd('Write', { file_path: '../../bin/cth-hook.cjs' })).decision, 'deny',
    'a truthful payload.cwd is the only thing that catches a cd-relative write, and it was ignored');
});

test('a target main cannot FRAME is denied for that reason, and ordinary colon words are not', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('drive-relative (`C:..\\x`) and rooted-relative (`\\bin\\x`) are win32 path shapes; '
      + 'path.posix.isAbsolute answers correctly for both on POSIX');
    return;
  }
  const root = hiveRoot(t);
  seedHive(t, root);
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));

  for (const spelling of ['C:../../bin/cth-hook.cjs', 'C:..\\..\\bin\\cth-hook.cjs']) {
    const r = await decide('Write', { file_path: spelling });
    assert.equal(r.decision, 'deny', `${spelling} was allowed — path.win32.isAbsolute is FALSE for it, `
      + 'so it took the join(base,target) branch, path.win32.join ate the `C:` as an ordinary segment '
      + 'and consumed one `..`, and the gate measured one directory too deep while cmd.exe wrote the '
      + 'real file into the real bin/');
    assert.match(r.reason, /frame/i,
      'a drive-relative target is a FRAMING failure, not a protected-path match, and the message '
      + 'must say which of the two fired');
  }
  // C-3 — rooted-relative. path.win32.isAbsolute('\\bin\\x') is TRUE, so it takes
  // the measure-one-path branch and is framed against MAIN's cwd drive while
  // cmd.exe frames it against the agent's.
  const rooted = await decide('Write', { file_path: '\\bin\\cth-hook.cjs' });
  assert.equal(rooted.decision, 'deny', 'a rooted-relative target is framed by a drive main cannot see');
  assert.match(rooted.reason, /frame/i);

  // NEGATIVE CONTROLS — the measured false-positive sweep. None of these is a path.
  assert.equal((await decide('Bash', { command: "sed -i 's:foo:bar:g' notes.txt" })).decision, 'allow',
    'a sed substitution was classified drive-relative — the predicate needs the separator half');
  assert.equal((await decide('Bash', { command: 'curl http://a/b -c:v 9:30 a:b' })).decision, 'allow',
    'ordinary colon-bearing words were classified drive-relative');
  assert.equal((await decide('Write', { file_path: 'C:\\abs\\x' })).decision, 'allow',
    'a plain absolute win32 path is not drive-relative');
});

// ─── 2e. the win32 spelling battery — one control, not a checklist ───────────

/** Every spelling of the SAME object this host can produce without external
 *  tooling. Derived, never hard-coded: `os.hostname()` and the machine's own
 *  addresses are exactly the four the four previous revisions' host list missed. */
function win32Spellings(root, shim) {
  const drive = shim[0];
  const tail = shim.slice(3); // past `C:\`
  const s = { 'plain absolute (control)': shim, 'forward slashes': shim.replace(/\\/g, '/') };
  s['long-path prefix \\\\?\\'] = `\\\\?\\${shim}`;
  s['device path \\\\.\\'] = `\\\\.\\${shim}`;
  s['admin share \\\\localhost'] = `\\\\localhost\\${drive}$\\${tail}`;
  s['admin share \\\\LOCALHOST, lc drive'] = `\\\\LOCALHOST\\${drive.toLowerCase()}$\\${tail}`;
  s['admin share \\\\127.0.0.1'] = `\\\\127.0.0.1\\${drive}$\\${tail}`;
  s['admin share \\\\<hostname>'] = `\\\\${os.hostname()}\\${drive}$\\${tail}`;
  s['admin share \\\\<hostname-lc>'] = `\\\\${os.hostname().toLowerCase()}\\${drive}$\\${tail}`;
  s['LP-UNC \\\\?\\UNC'] = `\\\\?\\UNC\\localhost\\${drive}$\\${tail}`;
  s['DEV-UNC \\\\.\\UNC'] = `\\\\.\\UNC\\localhost\\${drive}$\\${tail}`;
  s['LP-UNC + <hostname>'] = `\\\\?\\UNC\\${os.hostname()}\\${drive}$\\${tail}`;
  // The IPv6 loopback can only reach SMB through the ipv6-literal name: a colon
  // is not legal in a UNC host component, which is why a `::1` entry in a host
  // LIST could never have matched anything.
  s['\\\\0--1.ipv6-literal.net'] = `\\\\0--1.ipv6-literal.net\\${drive}$\\${tail}`;
  // Derived from the OS, because a hard-coded IP list is the same defect one level down.
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      s[`own address ${a.address} (${name})`] = `\\\\${a.address}\\${drive}$\\${tail}`;
    }
  }
  // Win32 strips trailing dots and spaces from every component; Node's fs does
  // not, because it runs path.resolve() then toNamespacedPath() and the `\\?\`
  // prefix DISABLES that normalisation. So cmd.exe writes straight through these
  // into the real bin/ while statSync/realpathSync/existsSync all refuse them.
  s['trailing dot'] = `${root}\\bin.\\cth-hook.cjs`;
  s['trailing dot, / spelled'] = `${root.replace(/\\/g, '/')}/bin./cth-hook.cjs`;
  s['trailing space'] = `${root}\\bin \\cth-hook.cjs`;
  s['trailing dot on the LEAF'] = `${root}\\bin\\cth-hook.cjs.`;
  return s;
}

test('every win32 spelling of the shim reaches the shim\'s deny branch', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('the aliasing spellings under attack here (8.3, \\\\?\\, \\\\.\\, admin shares, UNC '
      + 'compositions, trailing dots) are win32 shapes with no POSIX equivalent');
    return;
  }
  const root = hiveRoot(t);
  const shim = seedHive(t, root);
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  const table = [];
  const failures = [];
  for (const [label, spelling] of Object.entries(win32Spellings(root, shim))) {
    const r = await decide('Write', { file_path: spelling });
    const reachable = fs.existsSync(spelling);
    table.push(`  ${r.decision === 'deny' ? 'DENIED ' : 'ALLOWED'} ${reachable ? 'reachable' : '  —      '} ${label}`);
    if (r.decision !== 'deny') failures.push(`${label} -> ${spelling}`);
  }
  console.error(`[net-binding] win32 spelling battery, ${table.length} spellings:\n${table.join('\n')}`);
  assert.deepEqual(failures, [],
    'a spelling of <hive>/bin/cth-hook.cjs was ALLOWED. The comparison is supposed to be (dev, ino) '
    + 'identity, which is spelling-independent by construction — a miss here means something is '
    + 'still comparing strings');
});

test('a spelling reached through an 8.3 SHORT NAME is denied', async (t) => {
  if (process.platform !== 'win32') { t.skip('8.3 short names are a win32/NTFS feature'); return; }
  const root = hiveRoot(t);
  const shim = seedHive(t, root);
  let short = '';
  try {
    short = require('node:child_process')
      .execSync(`for %I in ("${shim}") do @echo %~sI`, { shell: 'cmd.exe' }).toString().trim();
  } catch (e) { t.skip(`could not derive the 8.3 name: ${e.message}`); return; }
  if (!short || short.toLowerCase() === shim.toLowerCase()) {
    t.skip(`8.3 generation is disabled on this volume (got ${short || 'nothing'})`);
    return;
  }
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  assert.equal((await decide('Write', { file_path: short })).decision, 'deny',
    `the 8.3 spelling ${short} was allowed — the JS realpathSync does not canonicalise short names`);
});

test('a spelling reached through a `subst` drive alias is denied', async (t) => {
  if (process.platform !== 'win32') { t.skip('`subst` is a win32 command'); return; }
  const cp = require('node:child_process');
  const root = hiveRoot(t);
  seedHive(t, root);
  let letter = '';
  for (const c of ['Y', 'W', 'V', 'U', 'S']) {
    try { cp.execSync(`subst ${c}: "${root}"`, { stdio: 'ignore' }); letter = c; break; } catch { /* taken */ }
  }
  if (!letter) { t.skip('every candidate drive letter for `subst` is already taken on this host'); return; }
  t.after(() => { try { cp.execSync(`subst ${letter}: /d`, { stdio: 'ignore' }); } catch { /* noop */ } });
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  assert.equal((await decide('Write', { file_path: `${letter}:\\bin\\cth-hook.cjs` })).decision, 'deny',
    'a subst alias renames the whole tree; identity is what sees through it');
});

test('a spelling reached through a `net use` mapped drive is denied', async (t) => {
  if (process.platform !== 'win32') { t.skip('`net use` is a win32 command'); return; }
  const cp = require('node:child_process');
  const root = hiveRoot(t);
  const shim = seedHive(t, root);
  let letter = '';
  for (const c of ['T', 'R', 'Q', 'P', 'N']) {
    try { cp.execSync(`net use ${c}: \\\\localhost\\${shim[0]}$`, { stdio: 'ignore' }); letter = c; break; }
    catch { /* taken, or no admin share */ }
  }
  if (!letter) { t.skip('no drive letter could be mapped to the admin share (no admin rights, or all taken)'); return; }
  t.after(() => { try { cp.execSync(`net use ${letter}: /delete /y`, { stdio: 'ignore' }); } catch { /* noop */ } });
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  assert.equal((await decide('Write', { file_path: `${letter}:\\${shim.slice(3)}` })).decision, 'deny',
    'a mapped network drive is a third name for the same local object');
});

test('the device-namespace spellings — Volume GUID and GLOBALROOT — are denied', async (t) => {
  if (process.platform !== 'win32') { t.skip('the NT device namespace is a win32 shape'); return; }
  const cp = require('node:child_process');
  const root = hiveRoot(t);
  const shim = seedHive(t, root);
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  const tail = shim.slice(3);
  const tried = [];

  // Volume GUID, derived with mountvol — never a hard-coded GUID.
  let guid = '';
  try {
    const out = cp.execSync(`mountvol ${shim[0]}: /L`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    guid = (out.match(/\\\\\?\\Volume\{[0-9a-fA-F-]+\}\\?/) ?? [''])[0].replace(/\\$/, '');
  } catch { /* no mountvol, or no such volume */ }
  if (guid) {
    tried.push('Volume GUID');
    assert.equal((await decide('Write', { file_path: `${guid}\\${tail}` })).decision, 'deny',
      `${guid} names the same volume — the previous revision's non-local-UNC short circuit ALLOWED it`);
  }
  // GLOBALROOT device path — probed, because QueryDosDevice has no Node binding.
  let dev = '';
  for (let n = 1; n <= 8; n++) {
    const p = `\\\\?\\GLOBALROOT\\Device\\HarddiskVolume${n}\\${tail}`;
    try { if (fs.existsSync(p)) { dev = p; break; } } catch { /* not this one */ }
  }
  if (dev) {
    tried.push('GLOBALROOT');
    assert.equal((await decide('Write', { file_path: dev })).decision, 'deny',
      'a GLOBALROOT device path names the same file and was ALLOWED by the deleted short circuit');
  }
  if (tried.length === 0) { t.skip('neither the Volume GUID nor a GLOBALROOT device path could be derived on this host'); return; }
  console.error(`[net-binding] device-namespace spellings covered: ${tried.join(', ')}`);
});

test('an ancestor JUNCTION into <hive>/bin is denied, for an existing leaf and a not-yet-created one', async (t) => {
  if (process.platform !== 'win32') { t.skip('`mklink /J` is a win32 command; the POSIX arm is the leaf-symlink case'); return; }
  const cp = require('node:child_process');
  const root = hiveRoot(t);
  seedHive(t, root);
  const hop = path.join(tmpDir(t), 'hop');
  try { cp.execSync(`mklink /J "${hop}" "${path.join(root, 'bin')}"`, { stdio: 'ignore', shell: 'cmd.exe' }); }
  catch (e) { t.skip(`mklink /J threw: ${e.message}`); return; }
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  assert.equal((await decide('Write', { file_path: path.join(hop, 'cth-hook.cjs') })).decision, 'deny',
    'a junction is a second name for the directory; statSync follows it, so identity needs no resolver');
  assert.equal((await decide('Write', { file_path: path.join(hop, 'not-yet.cjs') })).decision, 'deny',
    'and a file that does not exist yet under the junction is the same directory');
});

test('a HARD LINK to a file under <hive>/bin is denied — including one level down, in bin/runtime', async (t) => {
  const root = hiveRoot(t);
  const shim = seedHive(t, root);
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  const outside = tmpDir(t);

  const link = path.join(outside, 'x.cjs');
  try { fs.linkSync(shim, link); } catch (e) { t.skip(`fs.linkSync threw: ${e.message}`); return; }
  assert.ok(fs.statSync(link).nlink > 1,
    'this platform did not share the inode, so the case below would not mean what it says');
  assert.equal((await decide('Write', { file_path: link })).decision, 'deny',
    'a hard link is a second DIRECTORY ENTRY for the same file — no path canonicalisation can ever '
    + 'reach it, and (dev, ino) closes it');

  // C-1, the critical one. `<hive>/bin/runtime` is appended to EVERY agent PTY's
  // PATH, so a hard link to a file in it is arbitrary code execution in every
  // agent. A one-level readdir of `<hive>/bin` misses it entirely.
  const deep = path.join(outside, 'node.cmd');
  fs.linkSync(path.join(root, 'bin', 'runtime', 'node.cmd'), deep);
  assert.equal((await decide('Write', { file_path: deep })).decision, 'deny',
    'a hard link into <hive>/bin/runtime was ALLOWED — that directory is on every agent PTY\'s PATH '
    + '(hive.ts runtimeBinDir + pty.ts withHiveRuntimeFallback), so the write lands in the node the '
    + 'agents actually execute. The bin scan must be RECURSIVE');
});

test('a LEAF symlink pointing at the shim from outside the hive is denied', async (t) => {
  const root = hiveRoot(t);
  const shim = seedHive(t, root);
  const leaf = path.join(tmpDir(t), 'leaf.cjs');
  try { fs.symlinkSync(shim, leaf, 'file'); }
  catch (e) {
    // Not a silent skip and not a bare return: the caught error is the evidence,
    // and the runner must COUNT this as a skip.
    t.skip(`fs.symlinkSync(..., 'file') threw: ${e.message} — needs elevation or Developer Mode on win32`);
    return;
  }
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  assert.equal((await decide('Write', { file_path: leaf })).decision, 'deny',
    'the LAST component was a symlink into <hive>/bin and nothing dereferenced it. statSync follows a '
    + 'symlinked ANCESTOR on its own, so this is the one shape that still needs realpathSync.native');
});

test('a FRESH hive still denies the writes that would CREATE its protected directories', async (t) => {
  const root = hiveRoot(t); // nothing seeded: no bin/, no .git/, no agents/
  const floor = await hookFloor(t, { rootDir: root });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  const denies = {
    'bin/cth-hook.cjs': path.join(root, 'bin', 'cth-hook.cjs'),
    'BIN/cth-hook.cjs': path.join(root, 'BIN', 'cth-hook.cjs'),
    '.git/hooks/pre-commit': path.join(root, '.git', 'hooks', 'pre-commit'),
    'agents/b-1/settings.json': path.join(root, 'agents', 'b-1', 'settings.json')
  };
  if (process.platform === 'win32') {
    denies['bin./cth-hook.cjs'] = `${root}\\bin.\\cth-hook.cjs`;
    denies['\\\\localhost admin share'] = `\\\\localhost\\${root[0]}$\\${root.slice(3)}\\bin\\cth-hook.cjs`;
    denies['\\\\?\\ long path'] = `\\\\?\\${root}\\bin\\cth-hook.cjs`;
  } else {
    // C-2 — sockPath() is `<hive>/hooks.sock` on POSIX and it is the FOURTH
    // protected literal. The window this closes is real: socketWatchdogMs is
    // 10s and the source's own comment says re-taking is a race we can lose.
    denies['hooks.sock, while it does not exist'] = floor.sock;
  }
  for (const [label, target] of Object.entries(denies)) {
    assert.equal((await decide('Write', { file_path: target })).decision, 'deny',
      `${label} was ALLOWED on a fresh hive. With bin/ not yet created there is no identity to match, `
      + 'so the walk must land on the hive ROOT — an object main HAS identified — and compare the '
      + 'un-created tail against the protected literals');
  }
  for (const [label, target] of Object.entries({
    'README.md': path.join(root, 'README.md'),
    'binary/x.ts': path.join(root, 'binary', 'x.ts'),
    'agents/a-1/notes.md (own)': path.join(root, 'agents', 'a-1', 'notes.md')
  })) {
    assert.equal((await decide('Write', { file_path: target })).decision, 'allow',
      `${label} was DENIED on a fresh hive — the un-created-tail rule is over-matching`);
  }
});

test('a candidate main cannot IDENTIFY is DENIED, not allowed', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('on a local POSIX volume this branch is unreachable: the climb always reaches `/`, which '
      + 'always stats. It fires for an unmapped drive letter and an unreachable UNC host');
    return;
  }
  const root = hiveRoot(t);
  seedHive(t, root);
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  // RFC 2606 guarantees `.invalid` never resolves, so DNS fails in milliseconds
  // instead of the ~21s a plausible NetBIOS name costs on this host.
  const r = await decide('Write', { file_path: '\\\\nas.invalid\\share\\project\\file.ts' });
  assert.equal(r.decision, 'deny',
    'DELIBERATE BEHAVIOUR CHANGE: this path was ALLOWED at HEAD. Main cannot say what it names, and '
    + 'a gate that allows what it cannot identify is a gate with a spelling-shaped hole in it');
  assert.match(r.reason, /identif/i, 'the reason must name identification, not a protected path');
});

test('the identity comparison keeps FULL inode precision, because this volume needs it', async (t) => {
  const root = hiveRoot(t);
  seedHive(t, root);
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  const outside = tmpDir(t);

  // (1) THE HAZARD IS LIVE ON THIS VOLUME, measured rather than assumed. An NTFS
  //     file reference number is ~2.4e16 — past Number.MAX_SAFE_INTEGER — so a
  //     Number `ino` silently rounds, and two DISTINCT files can then compare
  //     equal. This is the runtime half of the check: if the volume's inodes all
  //     fit in a Number there is no hazard here to pin.
  const sampled = [];
  const lossy = [];
  for (let i = 0; i < 24; i++) {
    const f = path.join(outside, `ino-${i}`);
    fs.writeFileSync(f, 'x');
    sampled.push(fs.statSync(f, { bigint: true }).ino);
  }
  // Long-lived directory entries too: a fresh temp file can land on a low MFT
  // record, while the paths the hive actually runs on have been there a while.
  for (const p of [root, outside, os.tmpdir(), os.homedir(), __dirname]) {
    try { sampled.push(fs.statSync(p, { bigint: true }).ino); } catch { /* not readable */ }
  }
  for (const ino of sampled) if (BigInt(Number(ino)) !== ino) lossy.push(ino);
  console.error(`[net-binding] ${lossy.length}/${sampled.length} inodes sampled on this volume LOSE `
    + `precision as a JS Number${lossy.length ? ` (e.g. ${lossy[0]} -> ${Number(lossy[0])})` : ''}`);

  // (2) SO THE SOURCE MUST NOT USE ONE, and this half is UNCONDITIONAL — the
  //     requirement does not depend on which inodes this run happened to draw.
  //     A behavioural exploit cannot be built on demand (a natural Number
  //     collision needs two live files whose inodes are within one ulp, which no
  //     volume hands out on request), so the guarantee is pinned where it is
  //     decided: the identity stat itself.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'hooks.ts'), 'utf8');
  assert.match(src, /statSync\(p, \{ bigint: true \}\)/,
    'pathIdentity must stat with { bigint: true }. With a Number ino, two distinct files on this '
    + 'very volume round to the same value and the gate calls them the same object');
  assert.match(src, /st\.ino === 0n/,
    'the no-stable-file-ids check must compare against 0n — a Number 0 here reintroduces the '
    + 'same rounding through the back door');

  // (3) AND THE nlink PATH MUST NOT OVER-MATCH. A hard link between two files
  //     that have nothing to do with the hive is ordinary work.
  const a = path.join(outside, 'ordinary.ts');
  fs.writeFileSync(a, 'export const x = 1;');
  const b = path.join(outside, 'ordinary-link.ts');
  try { fs.linkSync(a, b); } catch (e) { t.skip(`fs.linkSync threw: ${e.message}`); return; }
  assert.ok(fs.statSync(b).nlink > 1, 'sanity: this is the nlink > 1 path');
  assert.equal((await decide('Write', { file_path: b })).decision, 'allow',
    'an ordinary hard link outside the hive was denied — the bin scan is matching something it '
    + 'should not, and every hard link on the machine is now a false deny');
});

test('the ordinary work this gate runs in front of is untouched', async (t) => {
  const root = hiveRoot(t);
  seedHive(t, root);
  const project = tmpDir(t, 'md-project-');
  fs.mkdirSync(path.join(project, 'src'), { recursive: true });
  const floor = await hookFloor(t, { rootDir: root, agentCwd: project });
  const decide = decider(floor, floor.server.mintToken('a-1'));

  const allows = {
    'npx tsc against a parent tsconfig': ['Bash', { command: 'npx tsc -p ../tsconfig.json' }],
    'a ../ binary in node_modules': ['Bash', { command: '../node_modules/.bin/tsc --noEmit' }],
    'a ../ source file': ['Write', { file_path: '../shared/lib.ts' }],
    'a plain file in the cwd': ['Write', { file_path: 'notes.md' }],
    'a ../ package': ['Write', { file_path: '../packages/core/index.ts' }],
    'a 40-word chained build': ['Bash', { command:
      'npm ci && npx tsc -p tsconfig.json --noEmit && npx eslint . --max-warnings 0 && '
      + 'node --test test/a.test.cjs test/b.test.cjs && npm run build -- --mode production && '
      + 'cp -r dist/main.js dist/preload.js out/ && echo done' }]
  };
  for (const [label, [tool, input]] of Object.entries(allows)) {
    assert.equal((await decide(tool, input)).decision, 'allow',
      `${label} was DENIED. This gate runs on the hot path of every tool call — a false deny here is `
      + 'an outage with a hive-protected-path message on it');
  }

  // THE HEREDOC. Measured in the plan: 2616 shell words, 102 path-shaped, 67
  // distinct. This is the control that makes a candidate cap safe to add at all.
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
  const started = Date.now();
  const heredoc = await decide('Bash', { command: `cat > README.md <<'EOF'\n${readme}\nEOF` });
  const heredocMs = Date.now() - started;
  assert.equal(heredoc.decision, 'allow',
    'an ordinary heredoc was denied — a cap that stops a padding attack but also stops `cat > README.md` '
    + 'is an outage, not a control');
  assert.ok(heredocMs < 2000, `the heredoc took ${heredocMs}ms of blocking main-thread work`);
  console.error(`[net-binding] README heredoc (${readme.split(/[\s;&|<>()"']+/).filter(Boolean).length} `
    + `shell words) decided in ${heredocMs}ms`);

  // THE BULK ADD. 120 distinct path-shaped candidates is the worst real
  // observation the plan measured; the cap has to clear it with headroom.
  const files = Array.from({ length: 120 }, (_, i) => `src/file-${i}.ts`).join(' ');
  assert.equal((await decide('Bash', { command: `git add ${files}` })).decision, 'allow',
    'a 120-file `git add` was denied — the distinct-candidate cap is set below real work');
});

test('the god case: the harness home as a cwd still denies another agent\'s tree', async (t) => {
  const home = tmpDir(t, 'md-harness-home-');
  const root = path.join(home, 'hive');
  fs.mkdirSync(root, { recursive: true });
  seedHive(t, root);
  fs.mkdirSync(path.join(root, 'agents', 'oscar', 'inbox'), { recursive: true });
  const floor = await hookFloor(t, { rootDir: root, agentCwd: home });
  const decide = decider(floor, floor.server.mintToken('a-1'));
  assert.equal((await decide('Bash', { command: 'cat hive/agents/oscar/inbox/msg.json' })).decision, 'deny',
    'god\'s cwd is the harness home with the hive underneath it, so a RELATIVE path reaches another '
    + 'agent\'s tree — and the absolute spelling of it is already denied today');
  assert.equal((await decide('Bash', { command: 'cat notes.md' })).decision, 'allow',
    'ordinary work in the harness home must still go through');
});

test('the protected-path negative controls: prefixes, new files and deep new directories', async (t) => {
  const root = hiveRoot(t);
  seedHive(t, root);
  const floor = await hookFloor(t, { rootDir: root, agentCwd: path.join(root, 'agents', 'a-1') });
  const decide = decider(floor, floor.server.mintToken('a-1'));

  assert.equal((await decide('Write', { file_path: path.join(root, 'bin', 'brand-new.cjs') })).decision,
    'deny', 'a file that does not exist yet INSIDE bin/ must still be denied');
  assert.equal((await decide('Write', { file_path: path.join(root, 'bin', 'a', 'b', 'c', 'new.ts') })).decision,
    'deny', 'the climb to the nearest existing ancestor has become an allow-by-climb');
  assert.equal((await decide('Write', { file_path: path.join(root, 'bin-notes', 'x.ts') })).decision,
    'allow', 'a SIBLING whose name is a prefix of a protected one was denied');
  assert.equal((await decide('Write', { file_path: path.join(tmpDir(t), 'does-not-exist-yet.ts') })).decision,
    'allow', 'creating an ordinary new file is the case this function was written for');
});

// POSIX-only for the same reason sockFor() is: a win32 `\\.\pipe\` name has no
// filesystem entry, so there is nothing to delete and nothing to re-take.
//
// The skip is the RUNNER'S, not a bare `return`. A node:test callback that
// returns normally is counted as a PASS, so this — GATE-01's own socket-watchdog
// case — reported green on the operator's platform while never executing a
// single assertion there. The `pass` figure is EXPECTED TO DROP by one and
// `skipped` to rise by one; that is the laundering being undone, not a
// regression.
test('deleting the hook socket no longer opens the gate until the app restarts', {
  skip: process.platform === 'win32'
    ? 'a win32 named pipe has no filesystem entry to unlink, so there is nothing to delete and '
      + 'nothing for the watchdog to re-take'
    : undefined
}, async (t) => {
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

// ─── 2f. one payload handled once, and every abnormal exit answers DENY ──────

/**
 * A raw client that keeps its READABLE side open after the server half-closes.
 *
 * `allowHalfOpen: true` is the whole point: `conn.end()` closes only the
 * server's writable side, so a peer like this can keep writing afterwards — and
 * with `buf` never sliced, one more byte re-satisfies `indexOf('\n')` and the
 * same payload is handled a second time. A full-close client (what `send()`
 * uses) cannot observe that at all.
 */
function rawClient(sock) {
  const c = net.createConnection({ path: sock, allowHalfOpen: true });
  c.setEncoding('utf8');
  const started = Date.now();
  let body = '';
  let firstAt = 0;
  const waiters = [];
  c.on('data', (d) => {
    body += d;
    if (!firstAt) firstAt = Date.now();
    for (const w of waiters.splice(0)) w();
  });
  c.on('error', () => { /* the peer hanging up is one of the outcomes under test */ });
  return {
    socket: c,
    write: (s) => new Promise((r) => c.write(s, () => r())),
    reply: (ms = 15000) => new Promise((resolve, reject) => {
      const settle = () => resolve({ body, ms: firstAt - started, connected: !c.destroyed });
      if (body) { settle(); return; }
      const to = setTimeout(
        () => reject(new Error(`no reply within ${ms}ms — a silent close is ALLOW at every shim`)), ms);
      waiters.push(() => { clearTimeout(to); settle(); });
    }),
    get body() { return body; },
    close: () => c.destroy()
  };
}

const idle = (ms) => new Promise((r) => setTimeout(r, ms));

test('one newline-terminated payload is handled EXACTLY once, however the peer chunks or lingers', async (t) => {
  const floor = await hookFloor(t);
  const token = floor.server.mintToken('a-1');
  const payload = JSON.stringify({ hook_event_name: 'Stop', agent_id: 'a-1', sock_token: token });

  // (1) one complete payload, then ONE more byte on the same open connection.
  const c1 = rawClient(floor.sock);
  t.after(() => c1.close());
  await c1.write(`${payload}\n`);
  await c1.reply();
  await c1.write('x');
  await idle(150);
  assert.equal(floor.sent.length, 1,
    'the same payload was handled TWICE. `buf` is appended to and read with indexOf but never '
    + 'sliced, and nothing marks the connection done, so one more byte re-satisfies the newline '
    + 'test and every side effect on that payload is applied a second time');

  // (2) the SAME single payload, chunked across three writes.
  const before2 = floor.sent.length;
  const c2 = rawClient(floor.sock);
  t.after(() => c2.close());
  await c2.write(payload.slice(0, 12));
  await c2.write(payload.slice(12, 40));
  await c2.write(`${payload.slice(40)}\n`);
  await c2.reply();
  await idle(100);
  assert.equal(floor.sent.length - before2, 1, 'a chunked payload was handled more than once');

  // (3) TWO complete payloads batched onto one connection. The first must be
  //     handled once — never twice — which is what the slice fixes.
  const before3 = floor.sent.length;
  const c3 = rawClient(floor.sock);
  t.after(() => c3.close());
  await c3.write(`${payload}\n${payload}\n`);
  await c3.reply();
  await idle(150);
  assert.ok(floor.sent.length - before3 <= 1,
    'the FIRST of two batched payloads was handled twice — the un-sliced buffer re-reads it');
});

test('a Write past the byte cap still comes back DENY, on a socket the peer is still reading', async (t) => {
  const root = hiveRoot(t);
  const shim = seedHive(t, root);
  const floor = await hookFloor(t, { rootDir: root });
  const token = floor.server.mintToken('a-1');
  const c = rawClient(floor.sock);
  t.after(() => c.close());

  // A real PreToolUse aimed at the shim, padded past the cap by the attacker's
  // own choice of `content` size. At HEAD this is DENIED; a cap that closes
  // silently would turn it into an ALLOW at a size the attacker picks.
  await c.write(`{"hook_event_name":"PreToolUse","sock_token":"${token}","tool_name":"Write",`
    + `"tool_input":{"file_path":${JSON.stringify(shim)},"content":"`);
  const chunk = 'A'.repeat(1024 * 1024);
  const target = HOOK_LINE_MAX + 2 * 1024 * 1024;
  for (let written = 0; written < target && !c.body; written += chunk.length) await c.write(chunk);

  const r = await c.reply(20000);
  assert.ok(r.body.length > 0,
    'the over-cap peer read ZERO bytes. Every shim exits 0 on a connect error or an empty read, and '
    + 'exit 0 with no stdout is `allow` — so a silent cap hands the attacker the gate for the price '
    + 'of some padding');
  assert.equal(JSON.parse(r.body)?.hookSpecificOutput?.permissionDecision, 'deny',
    'the bound must answer with the same deny shape a protected path answers with');
  assert.match(JSON.parse(r.body).hookSpecificOutput.permissionDecisionReason, /bytes|cap|size/i,
    'the reason must name the bound that fired, so an operator can tell it from a protected-path deny');
  assert.ok(r.connected, 'the deny was written to a peer that was already gone');

  // …and it must not be discarded on the way out. `destroy()` would throw the
  // pending write away, the shim would see ECONNRESET, exit 0, and ALLOW.
  await c.write('more');
  await idle(100);
  assert.equal(JSON.parse(c.body)?.hookSpecificOutput?.permissionDecision, 'deny',
    'the deny body did not survive the close — conn.end(response), never conn.destroy()');
});

test('an idle connection is answered with an explicit deny BEFORE the shims 5s self-timeout', async (t) => {
  const floor = await hookFloor(t);
  const c = rawClient(floor.sock);
  t.after(() => c.close());
  await c.write('{"hook_event_name":"PreToolUse"'); // no newline, well under the cap

  const r = await c.reply(12000);
  assert.ok(r.body.length > 0, 'an idle connection was closed silently, which is ALLOW at every shim');
  assert.ok(r.ms < 5000,
    `the deny arrived at ${r.ms}ms. Every shim runs setTimeout(() => process.exit(0), 5000), and a `
    + 'deny written after that goes to a peer that has already exited 0 — which is an allow. The '
    + 'idle timeout has to sit BELOW the shim budget or it is decoration');
  assert.ok(r.connected, 'the peer was already destroyed when the deny was written');
  assert.equal(JSON.parse(r.body)?.hookSpecificOutput?.permissionDecision, 'deny');
});

test('idle connections cannot starve the listener, and EVERY one of them gets a deny BODY', async (t) => {
  const root = hiveRoot(t);
  const shim = seedHive(t, root);
  const floor = await hookFloor(t, { rootDir: root });
  const token = floor.server.mintToken('a-1');
  // The roster this app models caps its own listing at 24 agents (hive.ts
  // rosterContext), so 24 is the floor size the arithmetic is published against.
  const FLOOR = 24;
  const holders = Array.from({ length: FLOOR }, () => rawClient(floor.sock));
  t.after(() => holders.forEach((h) => h.close()));
  await Promise.all(holders.map((h) => h.write('{"hook_event_name":"Stop"'))); // under the cap, no newline

  // While all 24 are open and holding bytes, a fresh protected-path Write is
  // still answered DENY. A listener that can be starved is a floor-wide allow.
  assert.equal(
    (await decider(floor, token)('Write', { file_path: shim })).decision, 'deny',
    'the gate stopped answering while other connections were held open');

  const replies = await Promise.all(holders.map((h) => h.reply(15000)));
  for (const [i, r] of replies.entries()) {
    assert.ok(r.body.length > 0,
      `holder ${i} was closed having read ZERO bytes. "It closed" is exactly what server.maxConnections `
      + 'satisfied while handing the floor an allow — the assertion has to be on the BODY');
    assert.equal(JSON.parse(r.body)?.hookSpecificOutput?.permissionDecision, 'deny');
  }
});

test('there is no third state: a peer either stops sending and is reaped, or keeps sending and is capped', async (t) => {
  const floor = await hookFloor(t);
  const quiet = rawClient(floor.sock);
  const loud = rawClient(floor.sock);
  t.after(() => { quiet.close(); loud.close(); });

  await quiet.write('{"hook_event_name":"Stop"');
  const chunk = 'B'.repeat(1024 * 1024);
  await loud.write('{"padding":"');
  for (let n = 0; n < HOOK_LINE_MAX + 2 * 1024 * 1024 && !loud.body; n += chunk.length) {
    await loud.write(chunk);
  }

  const [q, l] = await Promise.all([quiet.reply(15000), loud.reply(20000)]);
  for (const [label, r] of [['the silent peer', q], ['the talkative peer', l]]) {
    assert.ok(r.body.length > 0,
      `${label} held buffered bytes and was never answered. That third state is what the deleted `
      + 'aggregate byte budget was supposed to bound, and the byte cap + idle timeout replace it by '
      + 'closing the loop between them — with forced turnover, and a deny either way');
    assert.equal(JSON.parse(r.body)?.hookSpecificOutput?.permissionDecision, 'deny');
  }
  // …and it must be a DIFFERENT bound for each, or only one of the two halves is
  // actually being exercised and the loop is not closed.
  assert.match(JSON.parse(q.body).hookSpecificOutput.permissionDecisionReason, /no complete line within/,
    'the silent peer must be reaped by the IDLE timeout');
  assert.match(JSON.parse(l.body).hookSpecificOutput.permissionDecisionReason, /bytes on one line/,
    'the talkative peer must be stopped by the BYTE CAP — if it hit the idle timeout instead, the '
    + 'cap half of the turnover argument is untested');
});

test('the framing bounds do not fire on ordinary traffic', async (t) => {
  const floor = await hookFloor(t);
  const token = floor.server.mintToken('a-1');

  // A well-behaved single-line client gets its normal reply and exactly one
  // side effect — every pre-existing case in this file depends on it.
  const resp = await floor.send({ hook_event_name: 'Stop', agent_id: 'a-1', sock_token: token });
  assert.equal(resp, '{}');
  assert.equal(floor.sent.length, 1);

  // A legitimate large Write JUST UNDER the cap is handled normally, not denied.
  // src/main/fs.ts allows a 2MB text read and a 10MB binary read, and a Write
  // PreToolUse carries the file contents — so the cap has to sit above both.
  const big = 'C'.repeat(HOOK_LINE_MAX - 1024 * 1024);
  const bigResp = await floor.send({
    hook_event_name: 'PreToolUse', agent_id: 'a-1', sock_token: token,
    tool_name: 'Write', tool_input: { file_path: path.join(os.tmpdir(), 'ordinary-big.ts'), content: big }
  });
  assert.notEqual(JSON.parse(bigResp)?.hookSpecificOutput?.permissionDecision, 'deny',
    `a ${(big.length / (1024 * 1024)).toFixed(0)}MB Write under the cap was denied — the cap is sized `
    + 'below what this app itself lets a tool move');

  // And the floor's ordinary concurrency is served with no bound fired.
  const before = floor.sent.length;
  const replies = await Promise.all(Array.from({ length: 24 }, (_, i) => floor.send({
    hook_event_name: 'Stop', agent_id: 'a-1', sock_token: token, session_id: `s-${i}`
  })));
  assert.deepEqual([...new Set(replies)], ['{}'], '24 simultaneous well-formed hook calls must all '
    + 'get the ordinary reply — the app models a 24-agent floor');
  assert.equal(floor.sent.length - before, 24);
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

test('no document this plan owns still describes ONE floor-wide hook secret', () => {
  // A stale trust-boundary claim is the worst kind of stale doc: a reader uses it
  // to decide what the app protects. These three described a single process-wide
  // secret, which is the design GATE-01 deleted — so left alone they would make
  // the repo's own security claim false.
  //
  // Exactly three files. A fourth document carries the same stale claim and is
  // deliberately absent from this list — including from this comment, which a
  // plain grep cannot read the intent of — because it belongs to another plan in
  // the same wave, and a test that stays red until someone else's work lands
  // turns a parallel wave into a deadlock. That plan pins its own file.
  const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
  const docs = ['HIVE.md', '.planning/codebase/ARCHITECTURE.md', '.planning/codebase/INTEGRATIONS.md'];
  const stale = [
    /injected into agent child environments only/,
    /minted once at module load/,
    /per-process `sock_token`/,
    /hooks\.ts:70/
  ];
  for (const doc of docs) {
    const src = read(doc);
    for (const claim of stale) {
      assert.equal(
        claim.test(src), false,
        `${doc} still describes the floor-wide hook secret (${claim}). The code mints a `
        + 'token per agent per spawn; a doc that says otherwise tells a reader the app '
        + 'protects something it does not'
      );
    }
    assert.match(
      src, /per-spawn/,
      `${doc} does not say the token is per-spawn — deleting the old claim is not the `
      + 'same as making the new one'
    );
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
