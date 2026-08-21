'use strict';

/**
 * Regression for the 2026-08-20 dead-hook defect.
 *
 * `hooks.ts` authenticates the hook socket on possession of a token, and since
 * GATE-01 that token is minted PER AGENT, PER SPAWN (`mintToken`) — the server
 * looks it up to DERIVE who is calling and ignores `payload.agent_id` entirely.
 * Main puts that one agent's token on its PTY's environment as
 * `HIVE_SOCK_TOKEN`, and the shims — which run as PTY descendants — are supposed
 * to read it back out and put it in the payload.
 *
 * They did not. The server side and the env wiring both landed; the shim was
 * never updated. The token is `randomBytes(32)`, never empty, so every real hook
 * arrived with `sock_token: undefined`, failed the check, and was dropped.
 * That is the whole floor going quiet: no status, no cost samples, no idle
 * detection, no breaker input. `hooks.ts` predicts it verbatim — "every hook in
 * the app goes dead at once — avatars freeze".
 *
 * WHY THE EXISTING TESTS DID NOT CATCH IT, which is the point of this file:
 *   - test/net-binding.test.cjs asserts the SERVER rejects a payload with no
 *     token. True, and it passes, while the real loop is broken.
 *   - test/hive-hook-node.test.cjs runs the real shim but against a RAW
 *     net.createServer that accepts anything. Bytes arrive, so it passes too.
 * Neither drives the real shim into the real HookServer. This one does, so the
 * assertion is "the loop closes", not "each half looks right on its own".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');

// The shim connects to a UNIX domain socket path. On Windows the app uses a
// \\.\pipe\ name instead, which this fixture does not model.
const POSIX = process.platform !== 'win32';

function tmpHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hook-auth-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

/** Run the shim command as a detached child, feed it `payload` on STDIN, and
 *  resolve on exit. Async, never spawnSync: the shim connects back to a socket
 *  THIS process serves, so a sync call would block our own event loop and
 *  deadlock the handshake.
 *
 *  The payload goes on the child's stdin, NOT through a `<<<` here-string.
 *  `shell: true` runs /bin/sh, which on Ubuntu is dash, and dash has no
 *  here-strings — the here-string form died with "Syntax error: redirection
 *  unexpected" on every ubuntu runner while passing on macOS (whose /bin/sh is
 *  bash in sh mode) and skipping on Windows, so the whole file only ever ran
 *  green where it could not fail. Worse, the second test's assertion is that
 *  NOTHING was accepted, so a shim that never started satisfied it vacuously.
 *  stdin is also how the real shim is fed by the engine, so this is the more
 *  faithful fixture as well as the portable one — and it is the shape
 *  test/hive-hook-node.test.cjs:83 already uses. */
function runShim(command, env, payload) {
  return new Promise((resolve) => {
    const c = spawn(command, { shell: true, env });
    let stderr = '';
    c.stderr.on('data', (d) => { stderr += d; });
    c.on('close', (code) => resolve({ code, stderr }));
    // The no-token case makes the shim exit before it drains stdin; an EPIPE
    // there is the shim behaving correctly, not a fixture failure.
    c.stdin.on('error', () => { /* the child never read stdin */ });
    c.stdin.end(payload);
  });
}

async function floorWithHookServer(t) {
  const home = tmpHome(t);
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });

  const server = new HookServer(hive, () => null, () => ({}));
  server.start();
  t.after(() => server.stop());

  const settings = JSON.parse(
    fs.readFileSync(path.join(home, 'hive/agents/a1/settings.json'), 'utf8')
  );
  const command = settings.hooks.Stop[0].hooks[0].command;
  const sock = path.join(home, 'hive', 'hooks.sock');
  return { home, hive, server, command, sock };
}

test('the real shim authenticates to the real hook server', { skip: !POSIX }, async (t) => {
  const { home, server, command, sock } = await floorWithHookServer(t);

  // transcript_path is the observable: HookServer only records it AFTER
  // authorized() passes, so a populated value proves the payload was accepted
  // rather than merely delivered.
  const transcript = path.join(home, 'transcript.jsonl');
  fs.writeFileSync(transcript, '');

  const env = {
    ...process.env,
    HIVE_SOCK: sock,
    // a1's OWN token, minted through the real server exactly as pty.ts does at
    // spawn. There is no floor-wide value to reach for any more, and that is the
    // point: this env is what agent a1 — and only agent a1 — can read.
    HIVE_SOCK_TOKEN: server.mintToken('a1'),
    AGENT_ID: 'a1',
    CLAUDE_TRANSCRIPT_PATH: transcript,
  };
  const res = await runShim(command, env, JSON.stringify({
    hook_event_name: 'Stop', agent_id: 'a1', transcript_path: transcript,
  }));

  assert.equal(res.code, 0, `shim exited non-zero: ${res.stderr}`);
  await new Promise((r) => setTimeout(r, 300));

  assert.equal(
    server.transcriptPath('a1'), transcript,
    'the payload was delivered but NOT accepted — the shim is not sending sock_token, '
    + 'so authorized() dropped it and every hook on this floor is dead'
  );
});

test('a shim with no token is still rejected', { skip: !POSIX }, async (t) => {
  const { home, server, command, sock } = await floorWithHookServer(t);
  const transcript = path.join(home, 'transcript.jsonl');
  fs.writeFileSync(transcript, '');

  // Same call, HIVE_SOCK_TOKEN deliberately absent. This is what a foreign local
  // process — one that found the socket but not the env — looks like.
  const env = {
    ...process.env,
    HIVE_SOCK: sock,
    AGENT_ID: 'a1',
    CLAUDE_TRANSCRIPT_PATH: transcript,
  };
  delete env.HIVE_SOCK_TOKEN;

  await runShim(command, env, JSON.stringify({
    hook_event_name: 'Stop', agent_id: 'a1', transcript_path: transcript,
  }));
  await new Promise((r) => setTimeout(r, 300));

  assert.equal(
    server.transcriptPath('a1'), undefined,
    'an unauthenticated payload was accepted — the token check is not doing anything'
  );
});

/** Every shim template in hive.ts, sliced by its REAL delimiters. The old
 *  version took `start + 6000` chars, which overruns HOOK_SHIM into
 *  AGY_HOOK_SHIM — so HOOK_SHIM alone carrying the field would have passed for
 *  both. And it iterated a hardcoded three-element list while hive.ts has had
 *  six shims for some time, so its "fails loudly if a fourth shim is added"
 *  comment was false for the whole life of the file: three of the six have NEVER
 *  carried `sock_token` and the guard never once fired. Derived, so the claim is
 *  now true. */
function shimTemplates() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  const decl = /^const (\w+_SHIM|\w+_EXTENSION|\w+_PLUGIN) = `/gm;
  const out = new Map();
  for (let m = decl.exec(src); m; m = decl.exec(src)) {
    const end = src.indexOf('\n`;', m.index);
    assert.ok(end > -1, `${m[1]} is not closed by a lone \`; — the slice would run into the next shim`);
    out.set(m[1], src.slice(m.index, end));
  }
  return out;
}

test('every shim template in hive.ts is enumerated, and the wired ones send sock_token', () => {
  const shims = shimTemplates();
  assert.ok(
    shims.size >= 6,
    `only ${shims.size} shim templates found (${[...shims.keys()].join(', ')}). The list is `
    + 'DERIVED so that adding a shim without sock_token fails here — a hardcoded list is how '
    + 'three shims stayed unwired without anything noticing'
  );

  // Scoped to the three that carry the field TODAY. PI_EXTENSION, OPENCODE_PLUGIN
  // and PROXY_BRIDGE_SHIM build their payloads with no `sock_token` at all and
  // are therefore dead-hooked at HEAD — a pre-existing defect, not one GATE-01
  // introduced. 01-06-PLAN.md task 4 (wave 3) lands all three bodies and widens
  // this list to every template. Asserting all six HERE would leave the suite red
  // until another plan lands, which deadlocks a parallel wave.
  for (const name of ['HOOK_SHIM', 'AGY_HOOK_SHIM', 'GROK_HOOK_SHIM']) {
    const body = shims.get(name);
    assert.ok(body, `${name} not found — did a shim get renamed?`);
    assert.match(
      body, /sock_token/,
      `${name} builds a payload without sock_token — every hook it fires will be rejected`
    );
    assert.match(
      body, /HIVE_SOCK_TOKEN/,
      `${name} does not read HIVE_SOCK_TOKEN from its environment`
    );
  }
});
