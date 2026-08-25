'use strict';

/**
 * DAEMON-05's offline unit gate — `src/main/tunnel.ts` and `src/main/cloudflared.ts`.
 *
 * No test in this file reaches the network or spawns a real cloudflared. The
 * tunnel lifecycle is driven with a fake spawner (an EventEmitter shaped like
 * a `child_process.ChildProcess`, with PassThrough stdout/stderr); the ONE
 * real-process assertion this file needs — that `stop()` genuinely reaps a
 * pid via `hardKillTree` — is proven against a genuinely disposable Node
 * child this file spawns and kills itself, on whichever platform CI runs on.
 * `cloudflared.ts`'s acquisition is driven with an injected fetcher, per the
 * `test/node-install.test.cjs` `fakeFetch` idiom.
 *
 * DAEMON-05's repo-fact clauses live HERE rather than in
 * `test/repo-claims.test.cjs`: plan 02-07 owns that file this wave, and this
 * plan does not touch it. Every clause runs over COMMENT-STRIPPED source
 * (`stripped()` below — the same construction as `repo-claims.test.cjs`'s own
 * `stripComments`), because this plan deliberately leaves comments that name
 * the deleted vendor and the deleted claim, and a raw grep would match the
 * explanation and fail the correct change.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { spawn: realSpawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const loadTs = require('./load-ts.cjs');

const { openTunnel } = loadTs('src/main/tunnel.ts');
const {
  CLOUDFLARED_RELEASE_TAG,
  CLOUDFLARED_SHA256,
  cloudflaredArtifactFor,
  resolveCloudflared,
  ensureCloudflared
} = loadTs('src/main/cloudflared.ts');
const { isAlive } = loadTs('src/main/procKill.ts');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A temp dir that cleans itself up, realpath'd so macOS's /var -> /private/var
 *  symlink doesn't make every assertion here a symlink test by accident.
 *  Matches test/main-hardening.test.cjs's tempDir. */
function tempDir(t, prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* noop */ } });
  return dir;
}

/** Comment-stripped, whitespace-joined source. Same construction as
 *  `test/repo-claims.test.cjs`'s `stripComments`, plus the join every
 *  code-identity clause in this plan uses so a re-wrap can never defeat it. */
function stripped(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Every .ts file under a directory, recursively — used to prove "exactly ONE
 *  openTunnel exists" across the whole main process, not just in the two
 *  files this plan happened to edit. */
function tsFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFilesUnder(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const SRC_MAIN = path.join(__dirname, '..', 'src', 'main');

/**
 * A fake `spawn()` matching `openTunnel`'s injected contract: records every
 * call and returns a controllable fake child — an EventEmitter with `pid`,
 * and `stdout`/`stderr` as `PassThrough` streams, the same shape
 * `child_process.spawn` returns. Nothing in this file spawns a real
 * cloudflared; this is the fake spawner PATTERNS names ("no existing test in
 * this repo fakes a spawner" — this is the first one).
 */
function fakeSpawner(pid) {
  const calls = [];
  const children = [];
  const spawnFn = (command, args, options) => {
    const child = new EventEmitter();
    child.pid = pid;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    calls.push({ command, args, options });
    children.push(child);
    return child;
  };
  return { spawnFn, calls, lastChild: () => children[children.length - 1] };
}

/** The real cloudflared quick-tunnel banner shape: an ASCII box, printed to
 *  STDERR, with the URL on its own line INSIDE the box — never a bare first
 *  line. A parser proved only against a bare line is a parser the real
 *  cloudflared defeats (the box border arrives first). */
function banner(url) {
  const pad = ' '.repeat(Math.max(0, 92 - url.length));
  return [
    '2026-08-23T00:00:00Z INF +--------------------------------------------------------------------------------------------+',
    '2026-08-23T00:00:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |',
    `2026-08-23T00:00:00Z INF |  ${url}${pad}|`,
    '2026-08-23T00:00:00Z INF +--------------------------------------------------------------------------------------------+',
    ''
  ].join('\n');
}

const FAKE_URL = 'https://adams-medical-meeting-enormous.trycloudflare.com';

// ─── openTunnel: the fake-spawner unit gate ──────────────────────────────────

test('openTunnel argv is exact: tunnel, --url http://127.0.0.1:<port>, --no-autoupdate', async () => {
  const { spawnFn, calls, lastChild } = fakeSpawner(4242);
  const p = openTunnel(54321, { bin: '/opt/cloudflared', spawn: spawnFn, timeoutMs: 5000 });
  lastChild().stderr.write(banner(FAKE_URL));
  const handle = await p;
  assert.equal(handle.url, FAKE_URL);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, '/opt/cloudflared');
  assert.deepEqual(calls[0].args, ['tunnel', '--url', 'http://127.0.0.1:54321', '--no-autoupdate']);
});

test('the URL is parsed off the box-drawn STDERR banner, delivered in arbitrary chunks', async () => {
  const { spawnFn, lastChild } = fakeSpawner(4243);
  const p = openTunnel(1, { bin: 'cloudflared', spawn: spawnFn, timeoutMs: 5000 });
  // Delivered the way a real pipe delivers: the box border arrives before the
  // URL, split mid-banner — a first-line/indexOf('\n') parse would find the
  // border, not the URL.
  const full = banner(FAKE_URL);
  lastChild().stderr.write(full.slice(0, 40));
  lastChild().stderr.write(full.slice(40));
  const handle = await p;
  assert.equal(handle.url, FAKE_URL);
});

test('a child that emits exit before printing a URL rejects rather than hanging', async () => {
  const { spawnFn, lastChild } = fakeSpawner(4244);
  const p = openTunnel(1, { bin: 'cloudflared', spawn: spawnFn, timeoutMs: 5000 });
  lastChild().emit('exit', 1, null);
  await assert.rejects(p, /exited before reporting/);
});

test('a silent child rejects within timeoutMs, and the real pid it was handed is killed', async (t) => {
  // A genuinely disposable Node child (mirrors D-15's own real-pid pattern) —
  // its pid is handed to the FAKE tunnel child below, so killing it proves
  // openTunnel's timeout path calls hardKillTree against a real OS process.
  const disposable = realSpawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  t.after(() => { try { process.kill(disposable.pid); } catch { /* already gone */ } });
  assert.equal(isAlive(disposable.pid), true, 'sanity: alive before the timeout fires');

  const { spawnFn } = fakeSpawner(disposable.pid);
  const started = Date.now();
  await assert.rejects(
    openTunnel(1, { bin: 'cloudflared', spawn: spawnFn, timeoutMs: 200 }),
    /did not report a tunnel URL/
  );
  assert.ok(Date.now() - started < 5000, 'the rejection itself must not hang');

  const deadline = Date.now() + 5000;
  while (isAlive(disposable.pid) && Date.now() < deadline) await sleep(50);
  assert.equal(isAlive(disposable.pid), false,
    'the real pid handed to the fake child was never killed on timeout — a rejected openTunnel that '
    + 'leaves the child alive is a public origin with no handle, the exact defect this file deletes');
});

// ─── stop() -> hardKillTree, against a REAL pid on the real platform (D-15) ──

test('stop() closes a REAL process via hardKillTree, on the real platform, and is idempotent', async (t) => {
  const disposable = realSpawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });
  t.after(() => { try { process.kill(disposable.pid); } catch { /* already gone */ } });

  const { spawnFn, lastChild } = fakeSpawner(disposable.pid);
  const p = openTunnel(1, { bin: 'cloudflared', spawn: spawnFn, timeoutMs: 5000 });
  lastChild().stderr.write(banner(FAKE_URL));
  const handle = await p;
  assert.equal(handle.url, FAKE_URL);
  assert.equal(isAlive(disposable.pid), true, 'sanity: alive before stop()');

  handle.stop();
  const deadline = Date.now() + 5000;
  while (isAlive(disposable.pid) && Date.now() < deadline) await sleep(50);
  assert.equal(isAlive(disposable.pid), false, 'hardKillTree did not reap the real pid stop() was handed');

  // Idempotent by construction (the handle's own `stopped` latch, no extra
  // injection knob): a second call must not throw, whatever the OS does with
  // a taskkill/SIGKILL aimed at an already-dead pid.
  assert.doesNotThrow(() => handle.stop());
});

// ─── cloudflared.ts: platform/arch branches, driven fully offline ───────────

test('cloudflaredArtifactFor / resolveCloudflared cover every artifact shape RESEARCH names', () => {
  // No cloudflared-windows-arm64 asset is published — a stated null, not a
  // silent one.
  assert.equal(cloudflaredArtifactFor('win32', 'arm64'), null);
  assert.equal(resolveCloudflared('win32', 'arm64'), null);

  assert.deepEqual(cloudflaredArtifactFor('win32', 'x64'), { file: 'cloudflared-windows-amd64.exe', kind: 'bin' });
  assert.equal(resolveCloudflared('win32', 'x64').kind, 'bin');

  assert.deepEqual(cloudflaredArtifactFor('linux', 'x64'), { file: 'cloudflared-linux-amd64', kind: 'bin' });

  const darwinArm64 = cloudflaredArtifactFor('darwin', 'arm64');
  assert.equal(darwinArm64.kind, 'tgz', 'macOS ships as a tarball, not a bare binary');
  assert.equal(darwinArm64.file, 'cloudflared-darwin-arm64.tgz');

  // An unknown platform never reaches the (nonexistent) network at all.
  assert.equal(cloudflaredArtifactFor('sunos', 'x64'), null);
  assert.equal(resolveCloudflared('sunos', 'x64'), null);
});

test('resolveCloudflared resolves a real download URL against the pinned release tag', () => {
  const r = resolveCloudflared('linux', 'x64');
  assert.equal(
    r.url,
    `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_RELEASE_TAG}/cloudflared-linux-amd64`
  );
  assert.match(r.sha256, /^[0-9a-f]{64}$/);
});

/**
 * `CLOUDFLARED_SHA256` holds the REAL vendor digest for the real ~55 MB
 * binary — this file must never download that binary just to test the verify
 * logic. Instead this test temporarily overwrites the ONE map entry it
 * exercises with the digest of bytes IT controls (`const` only freezes the
 * binding, not the object it points at), restoring the original in `t.after`
 * so no later test — or a later run of this same file — ever sees a
 * fabricated digest. This proves the real hash-then-compare-then-write path
 * with no network and no multi-megabyte fixture in the repo.
 */
test('ensureCloudflared: matching bytes are written (and chmod 0o755 on POSIX); mismatched bytes are refused with nothing written, citing #57', async (t) => {
  const artifact = cloudflaredArtifactFor('linux', 'x64');
  const goodBytes = Buffer.from('a pretend cloudflared binary, for the unit gate only');
  const goodDigest = createHash('sha256').update(goodBytes).digest('hex');
  const originalDigest = CLOUDFLARED_SHA256[artifact.file];
  CLOUDFLARED_SHA256[artifact.file] = goodDigest;
  t.after(() => { CLOUDFLARED_SHA256[artifact.file] = originalDigest; });

  const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const fetchGood = async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(goodBytes) });

  const dirGood = tempDir(t, 'md-cloudflared-good-');
  const p1 = await ensureCloudflared(dirGood, { platform: 'linux', arch: 'x64', fetchImpl: fetchGood });
  assert.ok(p1, 'matching bytes must resolve to a path');
  assert.ok(fs.existsSync(p1));
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(p1).mode & 0o777, 0o755, 'the written binary must be executable on POSIX');
  }
  // The "already verified" fast path: a second call with a fetcher that would
  // throw if it were ever invoked must still resolve, from the file on disk.
  const p1Again = await ensureCloudflared(dirGood, {
    platform: 'linux', arch: 'x64',
    fetchImpl: async () => { throw new Error('must not be called — the binary is already there'); }
  });
  assert.equal(p1Again, p1);

  const dirBad = tempDir(t, 'md-cloudflared-bad-');
  const badBytes = Buffer.from('not the binary the digest above names');
  const fetchBad = async () => ({ ok: true, arrayBuffer: async () => toArrayBuffer(badBytes) });
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => { logged.push(args.join(' ')); };
  let p2;
  try {
    p2 = await ensureCloudflared(dirBad, { platform: 'linux', arch: 'x64', fetchImpl: fetchBad });
  } finally {
    console.error = originalError;
  }
  assert.equal(p2, null, 'a digest mismatch must refuse, not write an unverified binary');
  assert.equal(fs.existsSync(path.join(dirBad, 'cloudflared')), false, 'nothing may be left on disk after a refusal');
  assert.ok(logged.some((l) => l.includes('#57')),
    'the refusal must cite #57, the precedent this module exists not to repeat');
});

test('ensureCloudflared returns null for a platform/arch with no acquirable artifact', async (t) => {
  const dir = tempDir(t, 'md-cloudflared-unsupported-');
  const result = await ensureCloudflared(dir, { platform: 'win32', arch: 'arm64' });
  assert.equal(result, null);
});

// ─── DAEMON-05 repo-fact clauses (test/repo-claims.test.cjs is 02-07's this wave) ──

test('repo-fact: exactly ONE openTunnel DEFINITION exists under src/main, and both servers call startTunnel(', () => {
  // Counts DEFINITIONS ("function openTunnel("), not every reference — index.ts
  // legitimately imports AND calls openTunnel (task 4's enable path), so a count
  // of the bare identifier grows with every legitimate caller. A count of
  // definitions still catches the class this plan deleted: a second COPY of the
  // function body anywhere under src/main.
  let definitions = 0;
  for (const f of tsFilesUnder(SRC_MAIN)) {
    definitions += (stripped(path.relative(path.join(__dirname, '..'), f)).match(/\bfunction openTunnel\(/g) ?? []).length;
  }
  assert.equal(definitions, 1,
    'exactly one openTunnel definition (tunnel.ts\'s export) must exist under src/main — deleting the '
    + 'tunnel outright, or a second copy anywhere, both change this count');
  assert.match(stripped('src/main/tunnel.ts'), /export async function openTunnel\(/);
  assert.match(stripped('src/main/slack.ts'), /startTunnel\(/);
  assert.match(stripped('src/main/webhook.ts'), /startTunnel\(/);
});

test('repo-fact: the tunnel closes through hardKillTree, imported from procKill, never re-implemented', () => {
  const src = stripped('src/main/tunnel.ts');
  assert.match(src, /hardKillTree/);
  assert.match(src, /from '\.\/procKill'/);
  assert.equal(/taskkill|process\.kill\(/.test(src), false,
    'tunnel.ts must call the shared hardKillTree, never re-implement taskkill/process.kill of its own');
});

test('repo-fact: the tunnel is off by default — config.ts pins tunnelEnabled: false and never tunnelEnabled: true', () => {
  const src = stripped('src/main/config.ts');
  assert.match(src, /tunnelEnabled: false/);
  assert.equal(src.includes('tunnelEnabled: true'), false);
});

test('repo-fact: cloudflared.ts is pinned to a release tag with committed digests, never latest or a vendor checksum file', () => {
  const src = stripped('src/main/cloudflared.ts');
  assert.ok((src.match(/[0-9a-f]{64}/g) ?? []).length >= 2, 'at least two committed 64-hex digests');
  assert.match(src, /CLOUDFLARED_RELEASE_TAG = '\d{4}\.\d+\.\d+'/);
  assert.equal(/latest|SHASUMS/.test(src), false);
});
