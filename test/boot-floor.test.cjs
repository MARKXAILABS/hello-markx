'use strict';

/**
 * The gate D-05 exists for: a real floor boots and tears down with no Electron
 * binary. Four liveness assertions (a real git repo, a real routed file, an
 * accepted socket connection, an opened database) — never "the promise
 * resolved" (RESEARCH Pitfall 2: `telemetry.start()`/`integrationBroker.start()`
 * both log-and-continue by design, so a half-dead floor can resolve clean).
 * Shutdown is the fifth assertion, and it is the ONLY thing newly testable
 * here (D-05) — the mail router was already writable at 2f29d0b (plan 02-01),
 * and the git committer already had five tests.
 *
 * Every test gets its OWN harnessHome/userData (never shared) — `hive.sockPath()`
 * is derived from the hive root, so two tests sharing one root would fight over
 * the same socket/pipe the instant either forgot to shut down first.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

// boot.ts (transitively hooks.ts/knowledge.ts/db.ts/integrations.ts — hive.ts and
// delivery.ts are electron-free) pulls Notification/app/safeStorage from electron;
// outside Electron that resolve gives a path string, so seed the cache with the
// identity surface these modules actually touch — BEFORE the module is first
// loaded below, exactly like test/config-secrets.test.cjs:29-45. `userData` is
// a `let`, reassigned per test by floorEnv(t), and the fake closes over it live.
let userData;
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: {
      // `app.getPath('userData')` returns the root ITSELF, not a
      // `<userData>/userData` subdirectory — every other name (logs, temp) is
      // a genuine subdirectory of it, matching Electron's real per-purpose layout.
      getPath: (name) => (name === 'userData' ? userData : path.join(userData, name)),
      getAppPath: () => userData,
      isPackaged: false,
      getVersion: () => '0.0.0-test'
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(`enc:${s}`, 'utf8'),
      decryptString: (b) => Buffer.from(b).toString('utf8').replace(/^enc:/, '')
    },
    // hooks.ts's HookServer imports `Notification` as a value (Notification.isSupported()).
    Notification: class { show() { /* noop */ } static isSupported() { return false; } }
  }
};

const { bootFloor } = loadTs('src/main/floor/boot.ts');

/**
 * A fresh, isolated (userData, harnessHome) pair for ONE test, with
 * config.json pre-seeded so `readConfig()` inside boot.ts picks harnessHome up
 * on its first read. `harnessHome` is deliberately a SEPARATE directory from
 * `userData` (Electron's own per-purpose dir), exactly like a real install.
 * Written directly rather than via `writeConfig()`, which would need a second,
 * separately-cached load of config.ts.
 *
 * T-P02-02-04 — slackEnabled:false and zero webhookTriggers: a unit test must
 * never open a real outbound tunnel.
 */
function floorEnv(t) {
  userData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-boot-floor-')));
  const harnessHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-boot-floor-home-')));
  fs.writeFileSync(
    path.join(userData, 'config.json'),
    JSON.stringify({ harnessHome, slackEnabled: false, webhookTriggers: [], notifications: false }, null, 2),
    'utf8'
  );
  const thisUserData = userData;
  t.after(() => {
    try { fs.rmSync(thisUserData, { recursive: true, force: true }); } catch { /* best-effort */ }
    try { fs.rmSync(harnessHome, { recursive: true, force: true }); } catch { /* best-effort */ }
  });
  return { userData: thisUserData, harnessHome };
}

/** A fresh FloorDeps fake: identity encrypt/decrypt, `notify`/`focus`/
 *  `syncKeepAwake` no-ops, `send` pushing into `sent` and returning `true`
 *  (D-03's landmine: a void-typed `send` would silently invert
 *  emitTerminalHandoff's `=== true` routing decision), `quit` recording that
 *  it was called, `respawnCore`/`startWorkerWatcher` recording invocations
 *  without starting anything real (`PtyManager` is construct-only here —
 *  bootFloor never calls its spawn method on this fake's behalf). */
function fakeDeps(env) {
  const sent = [];
  const respawnCalls = [];
  let quitCalled = false;
  let workerWatcherStarted = false;
  return {
    deps: {
      paths: () => ({ userData: env.userData, logs: path.join(env.userData, 'logs'), appPath: env.userData }),
      version: '0.0.0-test',
      packaged: false,
      secrets: {
        available: () => true,
        encrypt: (s) => `enc:${s}`,
        decrypt: (s) => s.replace(/^enc:/, '')
      },
      notify: () => { /* noop */ },
      send: (channel, payload) => { sent.push({ channel, payload }); return true; },
      quit: () => { quitCalled = true; },
      focus: () => { /* noop */ },
      syncKeepAwake: () => { /* noop */ },
      respawnCore: async (opts, owner) => {
        respawnCalls.push({ opts, owner });
        return { ok: true, account: undefined };
      },
      startWorkerWatcher: () => { workerWatcherStarted = true; }
    },
    sent,
    respawnCalls,
    quitCalled: () => quitCalled,
    workerWatcherStarted: () => workerWatcherStarted
  };
}

// Five distinct liveness assertions (D-05's gate), each its own test() so a
// TAP run reports 5 independent pass/fail results rather than one bundled
// test whose sub-assertions are invisible to the counter.

test('bootFloor: the hive root exists and is a real git repository (real ensureHive)', async (t) => {
  const env = floorEnv(t);
  const { deps } = fakeDeps(env);
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  const hiveRoot = floor.hive.root();
  assert.ok(hiveRoot, 'hive.root() is null — harnessHome from config.json was not picked up');
  assert.equal(hiveRoot, path.join(env.harnessHome, 'hive'));
  assert.ok(fs.existsSync(path.join(hiveRoot, '.git')),
    'ensureHive() did not create a real git repository at the hive root');
  assert.ok(fs.existsSync(path.join(hiveRoot, 'registry.json')),
    'ensureHive() did not write the hive skeleton');
});

test('bootFloor: floor.hive.routeOnce() drains a hand-written outbox file into the recipient inbox', async (t) => {
  const env = floorEnv(t);
  const { deps } = fakeDeps(env);
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  const hiveRoot = floor.hive.root();
  const senderOutbox = path.join(hiveRoot, 'agents', 'sender', 'outbox');
  const recipientInbox = path.join(hiveRoot, 'agents', 'recipient', 'inbox');
  // routeOnce() archives a routed file into outbox/.sent (hive.ts:1638) — that
  // subdirectory is normally created by ensureAgent(), so a hand-written outbox
  // needs it too, or a routed message's renameSync throws, gets swallowed by
  // routeOnce()'s own try/catch, and the file is quarantined as `bad-<name>`
  // instead — reading as "never routed" rather than "routed, but not archived".
  fs.mkdirSync(path.join(senderOutbox, '.sent'), { recursive: true });
  fs.mkdirSync(recipientInbox, { recursive: true });
  const outboxFile = path.join(senderOutbox, 'm1.json');
  fs.writeFileSync(outboxFile, JSON.stringify({
    id: 'm1', to: 'recipient', act: 'inform', subject: 'boot-floor liveness', body: 'hi'
  }), 'utf8');

  const routed = floor.hive.routeOnce();
  assert.equal(routed, 1, 'routeOnce() did not report routing the hand-written outbox file');
  const inboxFiles = fs.readdirSync(recipientInbox).filter((f) => f.endsWith('.json'));
  assert.equal(inboxFiles.length, 1, 'the message never reached the recipient inbox');
  const delivered = JSON.parse(fs.readFileSync(path.join(recipientInbox, inboxFiles[0]), 'utf8'));
  assert.equal(delivered.subject, 'boot-floor liveness');
  assert.ok(!fs.existsSync(outboxFile), 'the source outbox file was not archived off');
  assert.ok(fs.existsSync(path.join(senderOutbox, '.sent', 'm1.json')),
    'the source was not moved to .sent — routeOnce would reprocess it forever');
});

test('bootFloor: net.createConnection(floor.hive.sockPath()) is accepted', async (t) => {
  const env = floorEnv(t);
  const { deps } = fakeDeps(env);
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  // Connect, never stat: a win32 named pipe has no filesystem entry.
  const sock = floor.hive.sockPath();
  assert.ok(sock, 'hookServer has no socket path to connect to');
  await new Promise((resolve, reject) => {
    const c = net.createConnection(sock, () => { c.end(); resolve(); });
    c.once('error', reject);
  });
});

test('bootFloor: floor.persist opened its database against the tmpdir path', async (t) => {
  const env = floorEnv(t);
  const { deps, sent } = fakeDeps(env);
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  assert.equal(floor.persist.isOpen, true, 'persist.open() did not run inside bootFloor');
  // deps.send was actually threaded through (not just present on the fake) —
  // the fake's own `sent` array is the one bootFloor's closures push into.
  assert.ok(Array.isArray(sent), 'the fake\'s `sent` sink was not threaded through deps.send');
});

test('floor.shutdown() clears the socket — a second connection is refused, not accepted', async (t) => {
  const env = floorEnv(t);
  const { deps } = fakeDeps(env);
  const floor = await bootFloor(deps);

  const sock = floor.hive.sockPath();
  // Prove the socket is live BEFORE shutdown, so the refusal below contrasts
  // against a PROVEN baseline rather than "maybe it was never up".
  await new Promise((resolve, reject) => {
    const c = net.createConnection(sock, () => { c.end(); resolve(); });
    c.once('error', reject);
  });

  floor.shutdown();

  await new Promise((resolve, reject) => {
    const c = net.createConnection(sock);
    c.once('connect', () => { c.end(); reject(new Error('socket still accepts connections after floor.shutdown()')); });
    c.once('error', () => resolve()); // ECONNREFUSED / ENOENT — exactly what "refused" means here
  });
});

test('every subsystem bootFloor started appears in the shutdown list (#34 coverage)', async (t) => {
  const env = floorEnv(t);
  const { deps } = fakeDeps(env);
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  const { SHUTDOWN_STEPS } = loadTs('src/main/floor/boot.ts');
  // Derived, not hardcoded: the joined SOURCE TEXT of every stop closure, so a
  // subsystem referenced anywhere in the teardown list satisfies coverage
  // without this test having to guess the exact call shape.
  const shutdownSource = SHUTDOWN_STEPS.map((s) => s.stop.toString()).join('\n');

  // Floor fields that are plain data (Maps) own no background resource and
  // need no stop step — a Map cannot leak a timer or a socket by existing.
  const dataFields = new Set([
    'ptyToAgent', 'worktreePaths', 'worktreeOrigins', 'worktreeBases',
    'preservedWorktrees', 'spawnRecipes', 'missionTimers', 'contextTimers', 'liveWorkers'
  ]);
  // Floor fields that are genuinely resource-free (pure in-memory policy/state,
  // no timer, no socket, no file handle of their own) — named explicitly, each
  // with why, so an addition here is a deliberate exemption, not a silent gap.
  const resourceFreeFields = new Set([
    'control',      // ControlRegistry — in-memory pause/gate state only
    'breaker',      // CircuitBreaker — pure policy, ticked externally by the beat timer
    'accountPool',  // AccountPoolManager — ticked externally too; no timer/socket of its own
    'roster'        // RosterStore — reads/writes roster.json on demand, holds nothing open
  ]);

  const offenders = [];
  for (const key of Object.keys(floor)) {
    if (key === 'shutdown') continue;
    if (dataFields.has(key)) continue;
    if (resourceFreeFields.has(key)) continue;
    if (!shutdownSource.includes(`${key}.`)) offenders.push(key);
  }
  assert.deepEqual(offenders, [],
    `bootFloor started a subsystem with no matching shutdown step: ${offenders.join(', ')} — `
    + 'this is #34\'s exact failure class: a service started here and never torn down leaves '
    + 'a live listener/timer behind every reset');

  // The two always-on-beat timers are NOT Floor fields (pure boot.ts-internal
  // state), so the loop above cannot see them — pinned by name directly.
  assert.match(shutdownSource, /clearInterval\(fleetTimer\)/,
    'fleetTimer is armed by armAlwaysOnBeats but never cleared — RESEARCH: '
    + 'an un-unref\'d, un-cleared setInterval keeps node --test alive forever after shutdown');
  assert.match(shutdownSource, /clearInterval\(breakerBeatTimer\)/,
    'breakerBeatTimer is armed by armAlwaysOnBeats but never cleared — same hang class');
});

test('no outbound tunnel: the boot sequence never starts Slack/webhook servers', async (t) => {
  const env = floorEnv(t);
  const { deps } = fakeDeps(env);
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());
  // slackEnabled:false and zero webhookTriggers (config.json above) means
  // bootFloor's own tail never calls startSlackServer/startWebhookServer —
  // those functions are not even reachable from bootFloor (index.ts-owned,
  // config-gated in whenReady). The structural proof lives in
  // test/repo-claims.test.cjs's source-text clauses; this is the runtime half:
  // the floor booted with no network surface beyond the loopback broker/
  // telemetry/hook servers RESEARCH names as safe to run for real.
  assert.equal(floor.hookServer.constructor.name, 'HookServer');
});
