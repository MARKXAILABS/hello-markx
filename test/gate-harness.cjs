'use strict';

/**
 * The real shim, as a real child process, into a real HookServer.
 *
 * (a) THIS FILE IS DELIBERATELY NOT NAMED `*.test.cjs`, and that name is the
 *     whole mechanism. `npm test` is `node --test test/*.test.cjs`;
 *     test/ci-config.test.cjs pins that glob in both directions — every
 *     `*.test.cjs` must be covered by it, and it must NOT widen to
 *     `test/*.cjs` (its second clause names test/load-ts.cjs as the helper that
 *     would break if it did). So a `.cjs` helper is never collected, adds zero
 *     cases to the suite count, and needs no config entry — which matters,
 *     because D-36 forbids editing package.json at all. There is no glob to add
 *     this file to and none may be added.
 *
 * (b) WHY IT EXISTS. 04-PATTERNS.md § No Analog Found records that no shim in
 *     this repo has ever re-connected to the server after its first payload, so
 *     GATE-05's bounded-wait poll loop is genuinely new code with no in-repo
 *     precedent to copy. The one mechanism that IS modelled — spawning the real
 *     shim as a child against a real HookServer — exists exactly once, at
 *     test/hook-auth-roundtrip.test.cjs:65-125. Two plans need it. Extract it
 *     once rather than solving spawn/token/teardown twice.
 *
 * (c) CONSUMERS: test/gate03-roundtrip.test.cjs (plan 04-06) and
 *     test/gate05-bounded-wait.test.cjs (plan 04-16). Both are criterion 2's
 *     only admissible evidence.
 *
 * WIN32 IS A REQUIREMENT HERE, NOT AN ASPIRATION.
 * test/hook-auth-roundtrip.test.cjs is POSIX-gated, and the obvious reading —
 * that a real-shim-child test is inherently POSIX-only — is wrong. That file's
 * own comment at :39-41 names the real limitation: the app uses a `\\.\pipe\`
 * name on Windows "which this fixture does not model", and the thing that does
 * not model it is its hand-built `path.join(home, 'hive', <socket file name>)`
 * at :89. Ask `hive.sockPath()` (src/main/hive.ts:578) for the value instead
 * and the platform gate evaporates: `sockPath()` returns the `\\.\pipe\` name
 * on win32 and the socket file on POSIX, and its own comment says both the
 * server (`listen`) and the shim (`createConnection`) read that same value so
 * they stay in sync. test/boot-floor.test.cjs:178-190 already connects to that
 * pipe on win32 with no platform gate at all.
 *
 * That is a fixture limitation, not a platform one, and this file does not
 * carry it forward. Nothing here is platform-gated and no consumer should be
 * handed one: a case that does not run has no RED, and both GATE integration
 * tests would then pass vacuously on the only machine this phase runs on
 * (T-04-CMD-16).
 *
 * Never ask the filesystem whether the socket is there (RESEARCH Pitfall 3): a
 * win32 named pipe has no filesystem entry, so the answer is always false.
 * Connect, never stat — test/boot-floor.test.cjs:183 in those words.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

// hooks.ts imports WebContents and uses Notification as a VALUE (RESEARCH
// L-03), so it cannot be required without load-ts.cjs's electron stub.
const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');
const templates = loadTs('src/main/hiveTemplates.ts');

/**
 * A real HookServer on a real socket, in an isolated (userData, harnessHome)
 * tmp pair, for the duration of one `fn`.
 *
 * The two directories are separate on purpose, exactly as
 * test/boot-floor.test.cjs:71-85 has them and exactly as a real install has
 * them: `harnessHome` is where the hive lives (and therefore what `sockPath()`
 * hashes on win32, so every call gets its own pipe name and two of these can
 * run concurrently), `userData` stands in for Electron's per-purpose dir and is
 * where the agent's cwd and this harness's scratch files go. Nothing is ever
 * written under the repo.
 *
 * `ctx.sock` is `hive.sockPath()` — asked for, never hand-built. That single
 * line is the whole win32 fix.
 *
 * `ctx.sent` collects what the server pushed at the renderer
 * (`hive:hookEvent`). It is the cheapest proof that a payload was AUTHORIZED
 * rather than merely delivered: `listenOn` answers an unauthenticated peer with
 * `{}` before `handle()` runs, so an unauthorized round trip still exits the
 * shim 0 and leaves `sent` empty. Assert on an observable, not on the exit
 * code alone.
 *
 * @param {object} opts  `{ agentId, name, provider, config, control, breaker,
 *                          drainAtStop, focus, recordCost }`, all optional.
 * @param {(ctx: object) => Promise<any>} fn
 */
async function withHookServer(opts, fn) {
  const o = opts || {};
  const agentId = o.agentId || 'a1';
  const userData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-gate-ud-')));
  const harnessHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-gate-home-')));

  const sent = [];
  const hive = new HiveManager(() => harnessHome);
  await hive.ensureAgent({
    id: agentId,
    name: o.name || agentId,
    provider: o.provider || 'claude',
    cwd: userData
  });

  const server = new HookServer(
    hive,
    () => ({ send: (channel, payload) => { sent.push({ channel, payload }); } }),
    () => o.config || {},
    o.control,
    o.breaker,
    o.drainAtStop,
    o.focus,
    o.recordCost
  );
  server.start();

  const sock = hive.sockPath();
  try {
    if (!sock) throw new Error('hive.sockPath() returned null — the hive has no root');
    const token = server.mintToken(agentId);
    return await fn({ sock, token, agentId, server, hive, harnessHome, userData, sent });
  } finally {
    try { server.stop(); } catch { /* already down */ }
    try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* best-effort */ }
    try { fs.rmSync(harnessHome, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

/**
 * Spawn one of hiveTemplates.ts's shim constants as a child process, feed it
 * `payload` on stdin, and resolve `{ code, stdout, stderr, elapsedMs }`.
 *
 * `payload` is the ENGINE-NATIVE object, and the shim builds the wire bytes
 * from it. Never hand-construct what the server receives: that is RESEARCH
 * Pitfall 2 — testing the half rather than the loop — and it is precisely how
 * net-binding and hive-hook-node both stayed green through the dead-hook
 * defect. HOOK_SHIM takes a Claude-shaped payload; GROK_HOOK_SHIM takes grok's
 * own shape (`hookEventName: 'pre_tool_use'`, `toolName`, `toolInput`) and
 * translates it, which is the point of being able to select it.
 *
 * `opts.shim` names the constant, defaulting to `HOOK_SHIM`. Any string export
 * of hiveTemplates.ts is selectable — `GROK_HOOK_SHIM` and `AGY_HOOK_SHIM`
 * included — so plan 04-10 can drive grok's real reply translator through a
 * real child process instead of re-implementing its decoder in a test. The
 * lookup is by name against the module rather than against a list kept here, so
 * a shim added tomorrow is selectable without editing this file.
 *
 * Async, never spawnSync: the child connects back to a socket THIS process
 * serves, so a sync call would block our own event loop and deadlock the
 * handshake (test/hook-auth-roundtrip.test.cjs:52-54).
 *
 * The env is `HIVE_SOCK` / `HIVE_SOCK_TOKEN` / `AGENT_ID` — what pty.ts puts on
 * a real agent's PTY at spawn — and `opts.env` is merged last, so a caller can
 * blank the token to model a foreign process, or point `HIVE_SOCK` at a dead
 * endpoint to exercise the fail-open path.
 *
 * @param {object} ctx   the object handed to `withHookServer`'s callback
 * @param {object} payload  engine-native, stringified onto the child's stdin
 * @param {object} [opts]  `{ shim, env, args }`
 */
function runShim(ctx, payload, opts) {
  const o = opts || {};
  const name = o.shim || 'HOOK_SHIM';
  const src = templates[name];
  if (typeof src !== 'string') {
    throw new Error(
      `src/main/hiveTemplates.ts exports no string constant named ${name} — `
      + `available: ${Object.keys(templates).filter((k) => typeof templates[k] === 'string').join(', ')}`
    );
  }

  const file = path.join(ctx.userData, `${name}.cjs`);
  fs.writeFileSync(file, src, 'utf8');

  const env = {
    ...process.env,
    HIVE_SOCK: ctx.sock,
    HIVE_SOCK_TOKEN: ctx.token,
    AGENT_ID: ctx.agentId,
    ...(o.env || {})
  };

  const started = Date.now();
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [file, ...(o.args || [])], { env });
    let stdout = '';
    let stderr = '';
    c.stdout.on('data', (d) => { stdout += d; });
    c.stderr.on('data', (d) => { stderr += d; });
    c.on('close', (code) => resolve({ code, stdout, stderr, elapsedMs: Date.now() - started }));
    // A shim that exits before draining stdin (no socket in env, for one) makes
    // this end() raise EPIPE. That is the shim behaving correctly.
    c.stdin.on('error', () => { /* the child never read stdin */ });
    c.stdin.end(JSON.stringify(payload));
  });
}

module.exports = { withHookServer, runShim };

// ─── self-check ──────────────────────────────────────────────────────────────
// `node test/gate-harness.cjs` — one round trip per shim shape, no framework,
// no second file. Runs only when this module is the entry point, so requiring
// it from a test adds nothing.
//
// Both cases assert an OBSERVABLE, not just the exit code: HOOK_SHIM's fail-open
// contract (`c.on('error', () => process.exit(0))`) means a shim that never
// reached the server also exits 0, so exit-code-only would be the vacuous check
// this harness exists to make impossible.
if (require.main === module) {
  const assert = require('node:assert/strict');

  withHookServer({ agentId: 'a1' }, async (ctx) => {
    // HookServer.handle records transcript_path for ANY event, but only AFTER
    // authorized() has derived the agent from the per-agent token. A populated
    // value therefore proves acceptance, not mere delivery — the same
    // observable test/hook-auth-roundtrip.test.cjs:95-118 uses.
    const transcript = path.join(ctx.userData, 'transcript.jsonl');
    fs.writeFileSync(transcript, '');

    const claude = await runShim(ctx, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: path.join(ctx.userData, 'benign.txt') },
      transcript_path: transcript
    });
    assert.equal(claude.code, 0, `HOOK_SHIM exited ${claude.code}: ${claude.stderr}`);
    assert.equal(
      ctx.server.transcriptPath('a1'), transcript,
      'the payload reached the socket but was NOT authorized — the round trip is not closing'
    );

    // The same loop through grok's own translator, selected by name. Its shim
    // builds a Claude-shaped payload out of grok's shape, so `PreToolUse` on the
    // renderer channel is proof the translation ran server-side of a real pipe.
    const grok = await runShim(ctx, {
      hookEventName: 'pre_tool_use',
      sessionId: 's1',
      cwd: ctx.userData,
      toolName: 'Read',
      toolInput: { file_path: path.join(ctx.userData, 'benign.txt') }
    }, { shim: 'GROK_HOOK_SHIM' });
    assert.equal(grok.code, 0, `GROK_HOOK_SHIM exited ${grok.code}: ${grok.stderr}`);
    assert.ok(
      ctx.sent.some((e) => e.channel === 'hive:hookEvent' && e.payload.event === 'PreToolUse'
        && e.payload.agentId === 'a1'),
      `GROK_HOOK_SHIM's payload never reached an authorized handle(): ${JSON.stringify(ctx.sent)}`
    );

    console.log(`selfcheck ok — platform=${process.platform} sock=${ctx.sock} `
      + `HOOK_SHIM exit=${claude.code} (${claude.elapsedMs}ms) `
      + `GROK_HOOK_SHIM exit=${grok.code} (${grok.elapsedMs}ms)`);
  }).catch((err) => {
    console.error(`selfcheck FAILED: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });
}
