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

/** Strip comments from a shim template BEFORE matching it, so a commented-out
 *  assignment cannot satisfy a pin. Block comments whole, then `//` to end of
 *  line.
 *
 *  A naive `//` strip truncates a URL. That is not left to a comment here:
 *  assertNoUrlsInShims() asserts, over the same derived templates, that no body
 *  contains a `://` — measured 0 across all six — so a future shim that gains
 *  one fails loudly instead of being silently cut in half. */
function stripLineComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** `sock_token` in an ASSIGNMENT position, which is the only position that does
 *  anything: optional quote, `:` or `=`, then a value that actually starts
 *  something. Both live shapes match — `payload.sock_token = process.env.…` and
 *  `sock_token: process.env.…` inside an object literal — while a bare mention
 *  does not. The pin this replaces was `/sock_token/` over RAW source, which a
 *  commented-out `// payload.sock_token = …` satisfied, and it was the ONLY pin
 *  on five of the six shims. */
const ASSIGNS_SOCK_TOKEN = /(^|[^\w$])["']?sock_token["']?\s*[:=]\s*["'`\w$(]/;

/** The other half: the value has to come from the environment main populates on
 *  the agent's PTY, read the way JavaScript reads it — not merely named. */
const READS_SOCK_TOKEN_ENV = /process\.env\s*(\.HIVE_SOCK_TOKEN\b|\[\s*['"]HIVE_SOCK_TOKEN['"]\s*\])/;

/** Comment-stripping is only sound while no shim body carries a `://`. Asserted
 *  rather than recorded, so the guarantee cannot expire silently. */
function assertNoUrlsInShims(shims) {
  for (const [name, body] of shims) {
    assert.equal(
      (body.match(/:\/\//g) || []).length,
      0,
      `${name} contains a \`://\`. stripLineComments() cuts from \`//\` to the end of the line, so `
      + 'a URL in a shim body would take the rest of its line with it — possibly the sock_token '
      + 'assignment these tests pin. Teach the stripper about string literals before adding one.'
    );
  }
}

/** Every shim template in hive.ts, sliced by its REAL delimiters. The old
 *  version took `start + 6000` chars, which overruns the first template into the
 *  second — so ONE of them carrying the field would have passed for both. And it
 *  iterated a hardcoded three-element list while hive.ts has had six shims for
 *  some time, so its "fails loudly if a fourth shim is added" comment was false
 *  for the whole life of the file: three of the six had NEVER carried
 *  `sock_token` and the guard never once fired. Derived, so the claim is now
 *  true — and since 01-06 task 4 landed the three missing bodies, applied to
 *  EVERY template the derivation finds rather than to a chosen subset. */
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

  // EVERY template, with nothing scoped out. Three of them used to build their
  // payloads with no `sock_token` at all — dead-hooked at HEAD, before this
  // phase, so a pre-existing defect rather than one GATE-01 introduced — and
  // this loop was scoped to the other three until those bodies landed. They
  // have. All six write to the same socket and hooks.ts's single connection
  // handler is the only door in, so any template that skips the field is an
  // engine that goes silently dead: no live status, no Stop→drain, no cost.
  // A future exemption must first show a second connection handler or an
  // unauthenticated branch in hooks.ts. There is neither.
  // Comments are stripped before either match, so the pin cannot be satisfied by
  // a mention. The strip's own precondition is asserted first.
  assertNoUrlsInShims(shims);

  for (const [name, body] of shims) {
    assert.ok(body, `${name} not found — did a shim get renamed?`);
    const code = stripLineComments(body);
    assert.match(
      code, ASSIGNS_SOCK_TOKEN,
      `${name} builds a payload without ASSIGNING sock_token — every hook it fires will be `
      + 'rejected. Matched against the template with its comments stripped and requiring a value, '
      + 'because the pin this replaced was a bare /sock_token/ over raw source: a commented-out '
      + '`// payload.sock_token = …` satisfied it, and it was the only pin on five of six shims.'
    );
    assert.match(
      code, READS_SOCK_TOKEN_ENV,
      `${name} does not READ HIVE_SOCK_TOKEN from its environment (comments stripped). That env `
      + 'var is the only place the per-agent token main minted for this PTY exists.'
    );
  }
});

/** The pin above is only worth having if it FIRES. Proven for every template
 *  rather than for a chosen sample: comment out each body's assignment line in
 *  turn, rebuild that body, and assert the pin goes red — while the bare-symbol
 *  pin it replaced still passes on the very same mutant, which is the whole
 *  reason it was replaced.
 *
 *  The iteration count is asserted against the derived `shims.size` (itself
 *  floored at 6 in both tests) so that a shimTemplates() which silently started
 *  returning one template could not turn "6 green then 6 red" into "1 green then
 *  1 red" while the output still read like a universal. */
test('commenting out the sock_token assignment turns the pin RED, in every shim', (t) => {
  const shims = shimTemplates();
  assert.ok(shims.size >= 6, `only ${shims.size} shim templates found — see the floor above`);
  assertNoUrlsInShims(shims);

  let mutated = 0;
  for (const [name, body] of shims) {
    const green = ASSIGNS_SOCK_TOKEN.test(stripLineComments(body));
    assert.ok(green, `${name}: nothing to mutate — the pin is already red at HEAD`);

    const line = body.split('\n').find((l) => ASSIGNS_SOCK_TOKEN.test(stripLineComments(l)));
    assert.ok(
      line,
      `${name}: the assignment does not live on one line, so this mutation cannot be built and `
      + 'this loop would prove nothing for it. Split the assignment or teach this loop the shape.'
    );

    // The mutation, exactly as a careless refactor would leave it.
    const commented = body.replace(line, () => `// ${line.trim()}`);
    const red = !ASSIGNS_SOCK_TOKEN.test(stripLineComments(commented));
    assert.ok(
      red,
      `${name}: commenting out its sock_token assignment did NOT make the pin fail. The pin is `
      + 'vacuous for this shim — every hook it fires would be dropped by authorized() and this '
      + 'file would still be green.'
    );
    assert.match(
      commented, /sock_token/,
      `${name}: the bare-symbol pin this replaced is expected to still match the mutant. It not `
      + 'matching means the mutation removed more than the assignment, so the RED above proves less '
      + 'than it claims.'
    );
    t.diagnostic(`${name.padEnd(18)} pin-green-at-HEAD=${green}  pin-red-when-commented=${red}`);
    mutated++;
  }

  assert.equal(
    mutated, shims.size,
    `the mutation loop ran ${mutated} times for ${shims.size} derived templates — a loop that `
    + 'skips a shim proves nothing about that shim'
  );
  assert.ok(mutated >= 6, `the mutation loop covered only ${mutated} shims; hive.ts has at least 6`);
});
