'use strict';

/**
 * Regression for the 2026-08-20 dead-hook defect.
 *
 * `hooks.ts` authenticates the hook socket on possession of a per-process token:
 * `authorized()` rejects any payload whose `sock_token` does not equal
 * `hookSockToken()`. Main puts that value on the agent PTY's environment as
 * `HIVE_SOCK_TOKEN`, and the shims — which run as PTY descendants — are supposed
 * to read it back out and put it in the payload.
 *
 * They did not. The server side and the env wiring both landed; the shim was
 * never updated. `SOCK_TOKEN` is `randomBytes(32)`, never empty, so every real
 * hook arrived with `sock_token: undefined`, failed the compare, and was dropped.
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
const { HookServer, hookSockToken } = loadTs('src/main/hooks.ts');

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
    HIVE_SOCK_TOKEN: hookSockToken(),
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

test('all three shims put sock_token in the payload they build', () => {
  // Cheap source-level guard that also covers the two shims the round-trip above
  // cannot exercise here: AGY_HOOK_SHIM and GROK_HOOK_SHIM are written for
  // engines that are not spawnable in this fixture. The defect was one missing
  // field in a template literal, so asserting the field is present in each is a
  // proportionate check — and it fails loudly if a fourth shim is added without it.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  const shims = ['const HOOK_SHIM', 'const AGY_HOOK_SHIM', 'const GROK_HOOK_SHIM'];

  for (const decl of shims) {
    const start = src.indexOf(decl);
    assert.ok(start > -1, `${decl} not found — did a shim get renamed?`);
    // Each shim is a template literal; take the body up to the next shim or 6k chars.
    const body = src.slice(start, start + 6000);
    assert.match(
      body, /sock_token/,
      `${decl} builds a payload without sock_token — every hook it fires will be rejected`
    );
    assert.match(
      body, /HIVE_SOCK_TOKEN/,
      `${decl} does not read HIVE_SOCK_TOKEN from its environment`
    );
  }
});
