'use strict';

/**
 * Hooks run under `/bin/sh` with a bare PATH (`/usr/bin:/bin:…`). A hook command
 * of `node "<shim>"` therefore exits 127 — "node: command not found" — on every
 * machine where node lives in a shell-managed prefix (nvm, volta, Homebrew).
 *
 * The fix is `<hive>/bin/hive-node`: a one-line wrapper around Electron's OWN
 * bundled node (`ELECTRON_RUN_AS_NODE=1 exec "<execPath>"`). Every hook installer
 * must route through it.
 *
 * A wrapper SCRIPT rather than an inline `ELECTRON_RUN_AS_NODE=1 "<exe>" …`
 * prefix, because that prefix is POSIX-sh syntax and a hard error under cmd.exe —
 * which is what runs hook commands on Windows.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');
const { installAgyHooks, installGrokHooks, installCodexHooks } = loadTs('src/main/hiveProvisioning.ts');

const POSIX = process.platform !== 'win32';
const STRIPPED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-hive-node-'));
}

const launcherIn = (home) =>
  path.join(home, 'hive', 'bin', POSIX ? 'hive-node' : 'hive-node.cmd');

/** Every file under `dir`. */
function walk(dir, out = []) {
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Sweep every config an installer wrote for commands that invoke one of our
 *  shims. Path-agnostic on purpose, so a new installer cannot be missed. */
function hookCommandsUnder(home) {
  const shim = /(cth-hook\.cjs|agy-hook\.cjs|grok-hook\.cjs)/;
  const found = [];
  for (const file of walk(home)) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (!shim.test(text)) continue;
    // JSON hook configs: "command": "<…>"      TOML (codex): command = '<…>'
    for (const m of text.matchAll(/"command"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) found.push(JSON.parse(`"${m[1]}"`));
    for (const m of text.matchAll(/command = '([^']+)'/g)) found.push(m[1]);
  }
  return found.filter((c) => shim.test(c));
}

const usesLauncher = (cmd, launcher) => cmd.startsWith(launcher) || cmd.startsWith(`"${launcher}"`);

async function run(cmd, env) {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', cmd], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    // Two of the commands run through here — the `command -v node` probe and the
    // bare-`node` control — exit WITHOUT ever reading stdin, so this write lands
    // on a pipe whose reader is already gone. EPIPE is the expected outcome, not
    // a failure; unhandled it becomes an uncaughtException, and since 'close'
    // fires before the write settles the runner attributes it to the test AFTER
    // the test ended (#54, ubuntu-only: the payload fits the pipe buffer on
    // Windows, so it never errored there).
    //
    // The SHIPPED shim is not implicated: it registers c.on('error') and holds
    // the socket handle open until the server's 'end' (or its own 5s unref'd
    // timeout), so a hook firing as an agent exits does not lose its payload.
    child.stdin.on('error', () => { /* the child never read stdin */ });
    child.stdin.end(JSON.stringify({ hook_event_name: 'Stop', session_id: 's1' }));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

test('ensureHive writes an executable bundled-node launcher', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });

  const launcher = launcherIn(home);
  assert.equal(fs.existsSync(launcher), true);
  const body = fs.readFileSync(launcher, 'utf8');
  assert.match(body, /ELECTRON_RUN_AS_NODE=1/, 'without this the binary opens a second app window');
  assert.ok(body.includes(process.execPath), 'execPath is re-baked each bootstrap so an app move/update heals');
  if (POSIX) assert.ok(fs.statSync(launcher).mode & 0o111, 'must be executable');
});

test('the claude hook + statusLine commands run through the launcher', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });

  const launcher = launcherIn(home);
  const settings = JSON.parse(fs.readFileSync(path.join(home, 'hive/agents/a1/settings.json'), 'utf8'));
  const commands = [
    ...Object.values(settings.hooks).flatMap((matchers) => matchers.flatMap((m) => m.hooks.map((h) => h.command))),
    settings.statusLine.command
  ];

  assert.ok(commands.length > 0);
  for (const cmd of commands) assert.equal(usesLauncher(cmd, launcher), true, cmd);
});

test('every hook installer routes through the launcher — none left on bare node', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });

  // agy and grok install into the USER's home. Redirect it, and refuse to run
  // rather than write into the developer's real ~/.gemini / ~/.grok.
  const realHome = process.env.HOME;
  const realProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(() => {
    if (realHome === undefined) delete process.env.HOME; else process.env.HOME = realHome;
    if (realProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = realProfile;
  });
  assert.equal(os.homedir(), home, 'home redirect failed — aborting before touching the real home');

  // installAgyHooks/installGrokHooks/installCodexHooks moved to free functions
  // in hiveProvisioning.ts (STRUCT-02, plan 02-01) — nodeRun/nodeRunUnquoted
  // are the one piece of hive state they need, bound from the live instance.
  const hiveRoot = path.join(home, 'hive');
  installAgyHooks(hiveRoot, hive.nodeRunUnquoted.bind(hive));
  installGrokHooks(hiveRoot, hive.nodeRun.bind(hive));
  installCodexHooks(path.join(home, 'hive/agents/a1'), hive.shimPath(), hive.nodeRunUnquoted.bind(hive), path.join(home, 'work'));

  const launcher = launcherIn(home);
  const commands = hookCommandsUnder(home);
  // claude (Stop/statusLine/…) + agy + grok + codex.
  assert.ok(commands.length >= 4, `expected commands from all installers, got ${commands.length}`);
  const bare = commands.filter((c) => !usesLauncher(c, launcher));
  assert.deepEqual(bare, [], 'these hook commands would exit 127 wherever node is not on the bare PATH');

  for (const shim of ['agy-hook.cjs', 'grok-hook.cjs']) {
    assert.ok(commands.some((c) => c.includes(shim)), `${shim} installer produced no command`);
  }
});

test('a hook fires with NO node on PATH, and its payload reaches HIVE_SOCK', { skip: !POSIX }, async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });

  const sock = path.join(home, 'hive', 'hooks.sock');
  try { fs.unlinkSync(sock); } catch { /* not there */ }

  const received = [];
  const server = net.createServer((conn) => {
    let buf = '';
    conn.on('error', () => { /* the shim may hang up first */ });
    conn.on('data', (d) => { buf += d; });
    // The shim writes its payload and waits for OUR end() — it never half-closes,
    // so the payload is only complete on 'close', not 'end'.
    conn.on('close', () => { if (buf) received.push(buf); });
    conn.write(JSON.stringify({ ok: true }) + '\n', () => conn.end());
  });
  server.on('error', () => { /* keep a socket error out of the test process */ });
  await new Promise((resolve) => server.listen(sock, resolve));
  t.after(() => server.close());

  const env = { PATH: STRIPPED_PATH, HIVE_SOCK: sock, AGENT_ID: 'a1', HOME: home };
  const shim = path.join(home, 'hive/bin/cth-hook.cjs');

  // Control: the command shape used before the fix. Only meaningful if node is
  // genuinely absent from the stripped PATH (it is on a dev machine using nvm,
  // volta or Homebrew; it is not on an image with /usr/bin/node).
  const probe = await run('command -v node', env);
  if (probe.code !== 0) {
    const before = await run(`node "${shim}"`, env);
    assert.equal(before.code, 127, 'the bug: bare `node` is not resolvable from a hook');
  }

  // NOTE: async spawn, not spawnSync — the shim connects back to a socket THIS
  // process is serving, so a sync call would block our own event loop and
  // deadlock the handshake.
  const settings = JSON.parse(fs.readFileSync(path.join(home, 'hive/agents/a1/settings.json'), 'utf8'));
  const after = await run(settings.hooks.Stop[0].hooks[0].command, env);
  assert.equal(after.code, 0, `hook failed under a stripped PATH: ${after.stderr}`);

  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(received.length > 0, 'nothing arrived at HIVE_SOCK');
  assert.match(received[0], /"hook_event_name"\s*:\s*"Stop"/);
});

/* ── codex directory trust is written, not prompted for (operator-found, 2026-08-25) ──
 *
 * codex-cli 0.128.0 removed `--dangerously-bypass-hook-trust` and replaced it with an
 * INTERACTIVE gate, seen live on a real spawn:
 *
 *   Do you trust the contents of this directory? … Trusting the directory allows
 *   project-local config, hooks, and exec policies to load.
 *     1. Yes, continue   2. No, quit
 *
 * A hive worker has nobody to press 1, so it sits there idle forever — never reading
 * its inbox, while LOOKING like a healthy agent. Worse than the flag error it replaced,
 * which at least died loudly.
 *
 * The supported non-interactive answer is the table codex itself writes when the
 * operator picks "Yes". */
test('installCodexHooks trusts the agent cwd in the per-agent config, so no prompt blocks the spawn', () => {
  const home = tmpHome('md-codex-trust-');
  const agentDir = path.join(home, 'hive', 'agents', 'a1');
  const cwd = path.join(home, 'work', 'Project-X');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });

  const codexHome = installCodexHooks(agentDir, null, (s) => `node ${s}`, cwd);
  const cfg = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');

  assert.match(cfg, /trust_level = "trusted"/,
    'the per-agent config must trust something, or codex stops on its interactive gate');
  assert.ok(cfg.toLowerCase().includes(`[projects.'${cwd.toLowerCase()}']`),
    `the trusted path must be the AGENT'S OWN cwd (${cwd}) — trusting some other path does `
    + 'not clear the prompt for this workspace');

  // TOML literal strings do not process escapes, so a Windows path survives verbatim.
  // Double quotes here would turn every backslash into an escape and corrupt the key.
  const line = cfg.split('\n').find((l) => l.toLowerCase().startsWith("[projects.'"));
  assert.ok(line && line.includes("'"), 'the project key must be a single-quoted TOML literal');
});

test('installCodexHooks does not emit a duplicate trust table when the seed already has one', () => {
  const home = tmpHome('md-codex-trust2-');
  const agentDir = path.join(home, 'hive', 'agents', 'a1');
  const cwd = path.join(home, 'work');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });

  // installCodexHooks seeds from the operator's ~/.codex/config.toml. If that file
  // already trusts this path, appending our own copy produces a DUPLICATE TOML table,
  // which codex refuses to parse — a config it cannot read is worse than a prompt.
  const codexHome = installCodexHooks(agentDir, null, (s) => `node ${s}`, cwd);
  const cfg = fs.readFileSync(path.join(codexHome, 'config.toml'), 'utf8');
  const key = `[projects.'${cwd.toLowerCase()}']`;
  const hits = cfg.toLowerCase().split(key).length - 1;
  assert.equal(hits, 1, `the trust table for ${cwd} must appear exactly once, found ${hits}`);
});
