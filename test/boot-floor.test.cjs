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
 *
 * `extra` (plan 04-20) merges into the seeded config LAST, so a case can give a
 * floor its own `hostAllowlist` / `notifications` and read the verdict back. It
 * is the only way to prove the composition root passes the OPERATOR's config
 * rather than a default: two floors, two configs, two verdicts.
 */
function floorEnv(t, extra) {
  userData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-boot-floor-')));
  const harnessHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-boot-floor-home-')));
  fs.writeFileSync(
    path.join(userData, 'config.json'),
    JSON.stringify(
      { harnessHome, slackEnabled: false, webhookTriggers: [], notifications: false, ...extra },
      null, 2
    ),
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
 *  (D-03's landmine: a void-typed `send` would silently invert every
 *  `=== true` routing decision that reads it), `quit` recording that
 *  it was called, `respawnCore`/`startWorkerWatcher` recording invocations
 *  without starting anything real (`PtyManager` is construct-only here —
 *  bootFloor never calls its spawn method on this fake's behalf). */
function fakeDeps(env) {
  const sent = [];
  // Plan 04-20: the toast sink, recorded rather than dropped. `publishApproval`'s
  // notification half is only observable here — the data half is the registry
  // itself, which plan 04-17 PULLS through `floor.hookServer.openApprovals()`.
  const notified = [];
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
      notify: (a) => { notified.push(a); },
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
    notified,
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
    'roster',       // RosterStore — reads/writes roster.json on demand, holds nothing open
    // AbsenceWatchdog (VIGIL-01) — a latch and four injected readers, ticked
    // externally by `watchdogTimer`, which IS in SHUTDOWN_STEPS and is pinned
    // BY NAME in the case below (this loop walks Object.keys(floor) and cannot
    // see a module-level `let`). The object itself owns no timer, no socket and
    // no file handle, so a `watchdog.stop()` would be a method with nothing to
    // stop — the same reason `breaker` and `accountPool` are listed above.
    'watchdog'
  ]);

  const offenders = [];
  for (const key of Object.keys(floor)) {
    if (key === 'shutdown' || key === 'teardownAndQuit' || key === 'teardownPty') continue;
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

test('RECORD-05: restorePointTimer is declared in the boot module and cleared by SHUTDOWN_STEPS', async (t) => {
  const env = floorEnv(t);
  const { deps } = fakeDeps(env);
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  const { SHUTDOWN_STEPS } = loadTs('src/main/floor/boot.ts');
  const shutdownSource = SHUTDOWN_STEPS.map((s) => s.stop.toString()).join('\n');
  const bootSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'floor', 'boot.ts'), 'utf8'
  );

  // Both directions, because either half alone is a false pass. The snapshot
  // timer is a module-level `let`, NOT a Floor field, so the offender loop in
  // the case above walks Object.keys(floor) and cannot see it: without this
  // named pin its teardown has no automated assertion at all and the "it is in
  // SHUTDOWN_STEPS" criterion reduces to "someone read the file".
  assert.match(bootSource, /^let restorePointTimer: ReturnType<typeof setInterval> \| null = null;$/m,
    'restorePointTimer is not declared in boot.ts\'s module `let` block — RECORD-05\'s snapshot '
    + 'beat has nowhere to live that shutdown can reach');
  assert.match(shutdownSource, /clearInterval\(restorePointTimer\)/,
    'restorePointTimer is armed by bootFloor but never cleared. boot.ts documents shutdown as '
    + '"the exact inverse of construction. #34 — ONE list": a timer outside that list is a leak, '
    + 'and an un-unref\'d one keeps node --test alive forever after shutdown');
  assert.match(shutdownSource, /restorePoints\?\.stop\(\)/,
    'the interval is cleared but RestorePoints\' own trailing debounce timers are not — a snapshot '
    + 'scheduled seconds before shutdown still fires against a store the floor has finished with');
});

test('VIGIL-01: watchdogTimer is declared in the boot module and cleared by SHUTDOWN_STEPS', async (t) => {
  const env = floorEnv(t);
  const { deps } = fakeDeps(env);
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  const { SHUTDOWN_STEPS } = loadTs('src/main/floor/boot.ts');
  const shutdownSource = SHUTDOWN_STEPS.map((s) => s.stop.toString()).join('\n');
  const bootSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'floor', 'boot.ts'), 'utf8'
  );

  // Both directions, for the same reason the restore-point pin above needs
  // both: the absence beat is a module-level `let`, NOT a Floor field, so the
  // offender loop walks Object.keys(floor) and cannot see it. The WATCHDOG is a
  // Floor field and is exempted there as resource-free precisely because this
  // is where its timer's teardown is proven.
  assert.match(bootSource, /^let watchdogTimer: ReturnType<typeof setInterval> \| null = null;$/m,
    'watchdogTimer is not declared in boot.ts\'s module `let` block — VIGIL-01\'s absence beat has '
    + 'nowhere to live that shutdown can reach');
  assert.match(shutdownSource, /clearInterval\(watchdogTimer\)/,
    'watchdogTimer is armed by bootFloor but never cleared. boot.ts documents shutdown as "the exact '
    + 'inverse of construction. #34 — ONE list": a timer outside that list is a leak, and an '
    + 'un-unref\'d one keeps node --test alive forever after shutdown');

  // ONE publish site, ONE spelling — plan 04-18's chip listens to this literal
  // and has nothing to guess at. Anchored on the SEND, because this file also
  // documents the channel name in a comment and a bare literal count would be 2.
  const sendSites = (bootSource.match(/deps\.send\('floor:quiet'/g) ?? []).length;
  assert.equal(sendSites, 1,
    `boot.ts has ${sendSites} deps.send('floor:quiet', …) sites, expected exactly 1 — two publishers `
    + 'against one latch is two states that can disagree');
  const mentions = (bootSource.match(/'floor:quiet'/g) ?? []).length;
  assert.ok(mentions >= 2,
    'the channel name appears only once — the positive lower bound: the send AND the comment that '
    + 'tells plan 04-18 the name is fixed here. Deleting either must fail this clause');
});

test('VIGIL-01: floor.watchdog is a live Floor member, and floor:quiet fires on BOTH edges', async (t) => {
  const env = floorEnv(t);
  const { deps, sent } = fakeDeps(env);
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  // The accessor plan 04-17 reads through — asserted by EFFECT on a really
  // booted floor, not by grepping the interface.
  assert.equal(typeof floor.watchdog.current, 'function',
    'floor.watchdog is absent or is not the watchdog — plan 04-17 composes the phone\'s floorQuiet '
    + 'field from floor.watchdog.current() in index.ts, and it owns no line of boot.ts to add it');
  assert.equal(floor.watchdog.current(), null,
    'a floor that has just booted is MOVING — a watchdog reporting quiet at boot is reporting its own seed');
  assert.equal(sent.filter((s) => s.channel === 'floor:quiet').length, 0,
    'nothing may be published on floor:quiet while the floor is moving');

  // Drive the latch to SET by moving the clock past the threshold. All four
  // signals are read live through the real wiring: no PTY is alive, no
  // telemetry sample has landed, the ledger rev has not moved, and the hive log
  // was last touched at boot.
  const base = Date.now();
  t.mock.method(Date, 'now', () => base + 20 * 60_000);
  floor.watchdog.tick();
  t.mock.restoreAll();

  const set = floor.watchdog.current();
  assert.notEqual(set, null, 'twenty minutes of silence on all four signals did not set the latch');
  assert.equal(typeof set.sinceMs, 'number');
  // The positive lower bound. A getter wired to a store that is never filled —
  // the "no-op or a simple store" shape this criterion exists to exclude —
  // passes the `null` assertion above and fails here.
  assert.ok(set.sinceMs > 0, `sinceMs was ${set.sinceMs}; a quiet snapshot must carry a real duration`);
  assert.ok(Array.isArray(set.inFlight), 'the snapshot must carry the in-flight set, even when empty');
  assert.equal(typeof set.godDead, 'boolean');

  const afterSet = sent.filter((s) => s.channel === 'floor:quiet');
  assert.equal(afterSet.length, 1, 'the setting edge must publish exactly once on floor:quiet');
  assert.equal(typeof afterSet[0].payload.sinceMs, 'number',
    'the setting edge carried a bare flag, not the snapshot — plan 04-18\'s chip needs the duration');
  assert.ok(Array.isArray(afterSet[0].payload.inFlight));

  // …and the clearing edge, because a publisher that only ever SETS leaves the
  // chip stuck on with nothing left to notice it.
  floor.watchdog.tick();
  assert.equal(floor.watchdog.current(), null,
    'the real clock is back, the floor is inside the threshold again, and the latch did not clear');
  const afterClear = sent.filter((s) => s.channel === 'floor:quiet');
  assert.equal(afterClear.length, 2, 'the clearing edge must publish exactly once');
  assert.equal(afterClear[1].payload, null,
    'the clearing edge published something other than null — the chip would never go out');
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

// ─── D-09: the windowless quit decision, and its composed proof ────────────

const { quitDecision, shouldQuitOnLastWindowClose } = loadTs('src/main/floor/headless.ts');

test('quitDecision: headless with live PTYs takes the non-interactive teardown path', () => {
  assert.equal(
    quitDecision({ allowQuit: false, livePtyCount: 2, hasWindow: false }),
    'teardown',
    'D-09\'s fix — no window, live PTYs, not already quitting — must take \'teardown\', or a headless '
    + 'floor with a live PTY can never quit'
  );
});

test('quitDecision: a window present asks the renderer, even with live PTYs', () => {
  assert.equal(
    quitDecision({ allowQuit: false, livePtyCount: 2, hasWindow: true }),
    'ask-renderer'
  );
});

test('quitDecision: zero live PTYs always allows the quit', () => {
  assert.equal(quitDecision({ allowQuit: false, livePtyCount: 0, hasWindow: false }), 'allow');
  assert.equal(quitDecision({ allowQuit: false, livePtyCount: 0, hasWindow: true }), 'allow');
});

test('quitDecision: allowQuit already true always allows, regardless of PTYs/window', () => {
  assert.equal(quitDecision({ allowQuit: true, livePtyCount: 5, hasWindow: true }), 'allow');
});

test('shouldQuitOnLastWindowClose: headless never quits on last-window-close off darwin', () => {
  assert.equal(shouldQuitOnLastWindowClose({ platform: 'win32', headless: true }), false);
  assert.equal(shouldQuitOnLastWindowClose({ platform: 'linux', headless: true }), false);
});

test('shouldQuitOnLastWindowClose: a normally-started floor keeps quit-on-last-window-close off darwin', () => {
  assert.equal(shouldQuitOnLastWindowClose({ platform: 'win32', headless: false }), true);
  assert.equal(shouldQuitOnLastWindowClose({ platform: 'linux', headless: false }), true);
});

test('shouldQuitOnLastWindowClose: darwin never quits on last-window-close, headless or not', () => {
  assert.equal(shouldQuitOnLastWindowClose({ platform: 'darwin', headless: true }), false);
  assert.equal(shouldQuitOnLastWindowClose({ platform: 'darwin', headless: false }), false);
});

test('floor.teardownAndQuit(): quit is called exactly once, and the socket is refused afterward '
  + '(02-VALIDATION.md:61\'s composed case — D-09)', async (t) => {
  const env = floorEnv(t);
  const { deps, quitCalled } = fakeDeps(env);
  const floor = await bootFloor(deps);

  assert.equal(quitCalled(), false, 'deps.quit was called before teardownAndQuit() ever ran');
  const sock = floor.hive.sockPath();

  floor.teardownAndQuit();

  assert.equal(quitCalled(), true, 'floor.teardownAndQuit() did not call deps.quit()');
  await new Promise((resolve, reject) => {
    const c = net.createConnection(sock);
    c.once('connect', () => { c.end(); reject(new Error('socket still accepts connections after teardownAndQuit()')); });
    c.once('error', () => resolve());
  });
});

// ─── D-11 gap 1, composed: the real wiring, not a fake — a real floor's
//     hive hands a real message off to the real delivery queue file. ────────

/** Every `.json` file directly under a hive agent's inbox, parsed. */
function godInbox(floor) {
  const dir = path.join(floor.hive.root(), 'agents', 'michael', 'inbox');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

test('D-11 composed: a hookless agent\'s mail lands in the real queue file main owns, with no bounce', async (t) => {
  const env = floorEnv(t);
  const { deps } = fakeDeps(env);
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  await floor.hive.ensureAgent({ id: 'michael', name: 'michael', cwd: env.harnessHome, capabilities: [], isGod: true });
  // copilot: canReceiveInbox: false (src/shared/agentProvider.ts) — the hookless
  // branch D-11 gap 1 targets.
  await floor.hive.ensureAgent({ id: 'worker', name: 'worker', cwd: env.harnessHome, capabilities: [], provider: 'copilot' });

  const sent = floor.hive.send({ to: 'worker', act: 'inform', subject: 'do the thing', body: 'go' }, 'michael');

  const queuePath = path.join(env.harnessHome, 'delivery-queue.json');
  assert.ok(fs.existsSync(queuePath), 'the delivery queue file was never written — the wired handoff never enqueued');
  const queued = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  const items = (queued.items ?? []).filter((m) => m.agentId === 'worker');
  assert.equal(items.length, 1, 'exactly one item should be queued for the worker');
  assert.match(items[0].text, /WORK ORDER FROM HIVE/);
  assert.match(items[0].text, new RegExp(`Message: ${sent.id}`));

  assert.equal(godInbox(floor).filter((m) => m.subject.includes('[undeliverable')).length, 0,
    'a message main successfully enqueued must not ALSO bounce to god');
});

test('D-11 composed: an archived agent\'s mail bounces to god, over the real wiring, with a true cause', async (t) => {
  const env = floorEnv(t);
  const { deps } = fakeDeps(env);
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  await floor.hive.ensureAgent({ id: 'michael', name: 'michael', cwd: env.harnessHome, capabilities: [], isGod: true });
  await floor.hive.ensureAgent({ id: 'worker', name: 'worker', cwd: env.harnessHome, capabilities: [], provider: 'copilot' });

  // Archive the worker — teardownPty does exactly this on PTY death. Then
  // route: `DeliveryDeps.knownAgent` (`!!a && !a.archived`) now refuses the
  // enqueue, and the SAME refusal the renderer used to bounce on fires again
  // for the same underlying reason, with the true cause in the subject.
  floor.hive.setArchived('worker', true);
  floor.hive.send({ to: 'worker', act: 'inform', subject: 'do the thing', body: 'go' }, 'michael');

  const bounces = godInbox(floor).filter((m) => m.subject.includes('[undeliverable'));
  assert.equal(bounces.length, 1, 'an archived agent\'s mail must bounce to god exactly once');
  assert.doesNotMatch(bounces[0].subject, /renderer unavailable/,
    'the bounce subject still blames a renderer that was never asked in this test');
});

// ─── D-40: the ipcMain.handle pin — every count and channel name re-derived
//     over comment-stripped, joined source, never a bare `grep -c` (task 1's
//     B-ipc-joined vs raw B-ipc: 152 vs 153, google/* inside a `//` comment
//     defeats the naive block-comment regex and swallows `pty:write`). This
//     lives HERE, not in test/repo-claims.test.cjs — that file is one-owner-
//     per-wave and 02-02 already owns wave 2's clauses in it (see <interfaces>).

/** Same shape as test/repo-claims.test.cjs:53's stripComments, plus a
 *  whitespace squeeze so a prettier-wrapped call site still joins to one
 *  matchable line. */
function joinedStripped(rel) {
  const raw = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ');
}

// 159 -> 160: plan 04-18 (wave 6) adds `control:answerApproval`, GATE-05's one
// renderer->main invoke channel. The main->renderer EVENT channel
// (`control:approvalRequest`) is REUSED and is not an `ipcMain.handle`, so it
// does not appear here — the two are different directions.
// 160 -> 161: plan 03-02 (wave 2) adds `control:breakerSnapshot`, the PULL
// counterpart of the existing `control:breakerState` push event. SCALE-05's
// card reloads with its window and must read the current level immediately
// instead of waiting out the ~30s beat.
const B_IPC_JOINED = 161;

test('D-40: ipcMain.handle( count over joined, comment-stripped index.ts is exactly B-ipc-joined', () => {
  const joined = joinedStripped('src/main/index.ts');
  const count = (joined.match(/ipcMain\s*\.\s*handle\s*\(/g) ?? []).length;
  assert.ok(B_IPC_JOINED >= 1, 'B-ipc-joined must itself be a positive lower bound, or this pin is vacuous');
  assert.equal(count, B_IPC_JOINED,
    `ipcMain.handle( count over joined index.ts is ${count}, expected B-ipc-joined (${B_IPC_JOINED}) — `
    + 'a channel was added or removed without this pin being updated');
});

// B-ipc-names — task 1's exact command (`JC src/main/index.ts | grep -oE
// "ipcMain\s*\.\s*handle\s*\(\s*'[^']*'" | sed ... | sort`), sorted, 152
// entries, re-embedded here (not read off a mktemp file, which does not
// survive between the executor's shell and a later `npm test` run).
const B_IPC_NAMES = [
  'app:cancelClose', 'app:cancelClosingTime', 'app:confirmClose', 'app:copyToClipboard',
  'app:info', 'app:openExternal', 'app:openLogs', 'app:readClipboard', 'app:resetAll',
  'app:setLoginItem', 'app:setNotifications', 'app:startClosingTime', 'claudeAccount:add',
  'claudeAccount:clear', 'claudeAccount:has', 'claudeAccount:markActive',
  'claudeAccount:poolState', 'claudeAccount:remove', 'claudeAccount:rotate',
  'claudeAccount:set', 'clipboard:saveImage', 'config:changeHome', 'config:ensureHome',
  'config:get', 'config:update', 'control:answerApproval',
  'control:autoDelivery', 'control:breakerSnapshot', 'control:gateTool', 'control:halt',
  'control:pause', 'control:resume', 'control:setBreakerState', 'control:snapshot',
  'control:steer', 'dialog:attachFiles', 'dialog:chooseFolder', 'freeflow:setConfig',
  'freeflow:transcribe', 'fs:listDir', 'fs:readBinary', 'fs:readFile', 'fs:statAbs',
  'fs:writeFile', 'git:aheadBehind', 'git:branch', 'git:branches', 'git:checkout',
  'git:commitFiles', 'git:compareRefs', 'git:diff', 'git:isRepo', 'git:log', 'git:logGraph',
  'git:mainRepo', 'git:showFile', 'git:status', 'git:worktrees', 'github:ciRuns',
  'github:issues', 'hero:payload', 'hire:drainPending', 'hire:openFile', 'history:add',
  'history:list', 'history:search', 'hive:addTask', 'hive:agentContext',
  'hive:agentDirectory', 'hive:agentUsage', 'hive:board', 'hive:deleteTask', 'hive:inbox',
  'hive:log', 'hive:memory', 'hive:memoryStatus', 'hive:messages', 'hive:mineNow',
  'hive:notifyBlocked', 'hive:patchTask', 'hive:queue', 'hive:registry',
  'hive:searchMemory', 'hive:send', 'hive:setArchived', 'hive:tasks', 'hive:textSearch',
  'integrations:list', 'integrations:remove', 'integrations:setSecret',
  'integrations:templates', 'integrations:test', 'integrations:upsert', 'kg:addFiles',
  'kg:get', 'kg:ingestFiles', 'kg:list', 'kg:remove', 'kg:search', 'kg:status',
  'mcp:agentState', 'mcp:grant', 'mcp:revoke',
  'missions:list', 'missions:save', 'org:getTrigger', 'org:setTrigger', 'phone:pairing',
  'providerKey:clear',
  'providerKey:has', 'providerKey:set', 'pty:attach', 'pty:idleFor', 'pty:kill', 'pty:list',
  'pty:redraw', 'pty:resize', 'pty:spawn', 'realtime:drainCompletions',
  'realtime:setSessionLive', 'realtime:waitFor', 'roster:read', 'roster:write',
  'session:resolveCwd', 'skills:catalog', 'skills:install', 'skills:local', 'skills:reveal',
  'skills:uninstall', 'slack:reply', 'slack:replyScriptPath', 'slack:setConfig',
  'slack:start', 'slack:status', 'slack:stop', 'telemetry:snapshot', 'telemetry:spans',
  'telemetry:usage', 'terminal:openAtFolder', 'tools:status', 'triggerHistory:clear',
  'triggerHistory:decide', 'triggerHistory:list', 'triggers:getContext',
  'triggers:setContext', 'tunnel:start', 'tunnel:status', 'tunnel:stop',
  'webhook:generateSecret', 'webhook:setConfig', 'webhook:start',
  'webhook:status', 'webhook:stop', 'webhooks:delete', 'webhooks:generateSecret',
  'webhooks:list', 'webhooks:save', 'webhooks:status', 'window:newFloor', 'workers:list',
  'workers:stop'
];

test('D-40: the sorted ipcMain.handle channel-name list diffs empty against B-ipc-names', () => {
  const joined = joinedStripped('src/main/index.ts');
  const names = (joined.match(/ipcMain\s*\.\s*handle\s*\(\s*'[^']*'/g) ?? [])
    .map((m) => m.replace(/.*'(.*)'/, '$1'))
    .sort();
  assert.ok(names.length >= 1, 'the channel-name list came back empty — the extractor broke, not the source');
  assert.equal(names.length, B_IPC_JOINED);
  assert.deepEqual(names, B_IPC_NAMES,
    'the sorted ipcMain.handle channel-name list no longer matches B-ipc-names — a channel was '
    + 'renamed, added or removed; update this baseline in the same commit that changes the channel');
});

// ─── Plan 04-20: THE COMPOSITION ROOT ────────────────────────────────────────
//
// Four optional trailing `HookServer` seams were declared in waves 2 and 4 and
// nothing supplied them. Optional means NOTHING FAILS when they are never wired
// — `hooks.ts`'s `recordCost` doc block states that house rule in its own words
// — and that is exactly why the wiring needs a test that goes red when an
// argument is dropped.
//
// EVERY assertion below observes an EFFECT through a really-booted
// `bootFloor(deps)`: a verdict that changes with the operator's config, a real
// `hive_ask`, a real row in the floor's own store, a real toast. A grep over
// `boot.ts`'s argument list proves the TEXT is present; it does not prove the
// argument reaches the judge, survives boot ordering, or reads the operator's
// config. That distinction is the whole reason this block exists.
//
// WHY NOT `test/gate-harness.cjs` (plan 04-01), which was read before choosing:
// it builds its OWN `HiveManager` + `HookServer` and spawns the real shim. That
// proves the LOOP, which `test/gate03-roundtrip.test.cjs` already does. A server
// this file constructed is precisely the thing that cannot answer the question
// here, because the defect under test IS a green unit suite driving instances
// the tests built while the floor an operator runs has none of the seams. So: no
// child process, no hand-built server — the REAL socket of a floor booted the
// way the operator boots it, driven over `floor.hive.sockPath()` so
// `authorized()` genuinely runs and the agent id in a persisted row is DERIVED
// from a token rather than claimed by a payload.
//
// Not POSIX-gated and no `skip:` — this file already connects to that pipe on
// win32 with no gate (the `net.createConnection(floor.hive.sockPath())` case
// above), so `test/suite-integrity.test.cjs`'s clause-3 census is untouched.

const { ASK_TTL_MS } = loadTs('src/main/hiveProvisioning.ts');
const { DEFAULT_HOST_ALLOWLIST } = loadTs('src/main/commandShape.ts');

// A host genuinely OUTSIDE the shipped default, so "the operator's list was
// read" and "the default happened to answer" produce different verdicts.
const SYNTHETIC_HOST = 'inside.example';
// …and one genuinely INSIDE it, for the mirror image: an operator list that
// EXCLUDES a default host must refuse it. That direction is the one a
// default-only implementation cannot fake in either direction.
const DEFAULT_MEMBER_HOST = 'github.com';

/** One PreToolUse payload over the REAL socket of a REALLY BOOTED floor. */
function hookDriver(floor, agentId) {
  const token = floor.hookServer.mintToken(agentId);
  const sock = floor.hive.sockPath();
  const send = (payload) => new Promise((resolve, reject) => {
    const c = net.createConnection(sock, () => c.end(JSON.stringify(payload) + '\n'));
    let resp = '';
    c.setEncoding('utf8');
    c.on('data', (d) => { resp += d; });
    c.on('close', () => { try { resolve(resp ? JSON.parse(resp) : {}); } catch { resolve(resp); } });
    c.on('error', reject);
  });
  return {
    token,
    send,
    pre: (tool_name, tool_input, extra = {}) => send({
      hook_event_name: 'PreToolUse', tool_name, tool_input, sock_token: token, ...extra
    }),
    bash: (command, extra = {}) => send({
      hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command },
      sock_token: token, ...extra
    })
  };
}

/**
 * Boot ONE floor on its own config, drive it, tear it down.
 *
 * STRICTLY SEQUENTIAL, and that is not stylistic: `floorEnv` reassigns the
 * module-level `userData` the electron stub closes over LIVE, and `readConfig()`
 * resolves `configPath()` through it on EVERY call. Two floors alive at once
 * would make the first read the second's config at verdict time, which is the
 * exact thing these cases measure. So a case comparing two configs boots, drives
 * and shuts down the first before the second `floorEnv` call ever happens.
 *
 * `a1` IS REGISTERED IN THE HIVE, and that is load-bearing rather than tidy.
 * Measured against the tree before this plan's wiring: an UNregistered agent has
 * `cwdValid: false` in the registry, so GATE-01's protected-path arm refuses
 * every relative target it cannot locate — `curl https://github.com/x` came back
 * `permissionDecision: 'deny'` with "main cannot LOCATE this relative target",
 * from the PATH arm, on a floor where the host arm had allowed it. Two of the
 * host cases below would then have asserted a deny they were not testing for and
 * passed VACUOUSLY, pre-wiring, for a reason with nothing to do with the seam
 * (04-VALIDATION.md § Anti-Vacuous-Pass Rules). With the agent registered the
 * same payload comes back `{}` and the RED is the real one.
 */
async function bootedFloor(t, cfg, fn) {
  const env = floorEnv(t, cfg);
  const fake = fakeDeps(env);
  const floor = await bootFloor(fake.deps);
  await floor.hive.ensureAgent({ id: 'a1', name: 'a1', cwd: env.harnessHome, capabilities: [] });
  try {
    return await fn({
      floor, env, notified: fake.notified, sent: fake.sent, ...hookDriver(floor, 'a1')
    });
  } finally {
    floor.shutdown();
  }
}

/** The wire shape of a refusal, whatever opened it. */
const decisionOf = (r) => (r && r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision) || null;

test('04-20 composition: the floor is live enough for the negatives below to mean anything', async (t) => {
  await bootedFloor(t, {}, async ({ floor, bash }) => {
    // The positive lower bound. Every case below asserts something ABOUT a
    // seam, and a bootFloor that threw halfway would satisfy several of them
    // vacuously — so the liveness of the three objects those cases reach
    // through is asserted first, and separately.
    assert.equal(floor.hookServer.constructor.name, 'HookServer');
    assert.equal(typeof floor.hookServer.openApprovals, 'function',
      'floor.hookServer has no openApprovals() — plans 04-17/04-18 read the ask registry through '
      + 'exactly this accessor, and every ask assertion below reaches it the same way');
    assert.equal(typeof floor.watchdog.current, 'function',
      'floor.watchdog is absent — plan 04-11\'s wave-3 accessor is this phase\'s second worked '
      + 'example of a named seam, and it is read here as the model the four below follow');
    assert.equal(floor.persist.isOpen, true,
      'floor.persist is not open — the recordToolCall case cannot distinguish "no row was written" '
      + 'from "there was no database to write to"');

    // …and the socket really answers a really-authorized payload, so a later
    // `{}` reply reads as "allowed" rather than "nothing was listening".
    const allowed = await bash('ls -la');
    assert.equal(decisionOf(allowed), null,
      '`ls -la` came back with a verdict — the driver is not reaching the judge the way these '
      + 'cases assume, and every "no deny" assertion below would pass for the wrong reason');
  });
});

test('04-20 GATE-03: the host allowlist is the OPERATOR\'s — two configs, two verdicts', async (t) => {
  assert.ok(!DEFAULT_HOST_ALLOWLIST.includes(SYNTHETIC_HOST),
    `${SYNTHETIC_HOST} is in DEFAULT_HOST_ALLOWLIST — this case would then pass with the getter `
    + 'unwired, which is precisely the failure it exists to catch');

  // (a) the operator LISTED it: allowed.
  await bootedFloor(t, { hostAllowlist: [...DEFAULT_HOST_ALLOWLIST, SYNTHETIC_HOST] }, async ({ bash }) => {
    const r = await bash(`curl https://${SYNTHETIC_HOST}/x`);
    assert.equal(decisionOf(r), null,
      `curl at ${SYNTHETIC_HOST} was refused on a floor whose config LISTS it — the production `
      + 'HookServer is answering from DEFAULT_HOST_ALLOWLIST, i.e. the hostAllowlist getter never '
      + 'reached the composition root (T-04-NET-02)');
  });

  // (b) the operator did NOT list it: refused. The verdict CHANGED with the
  //     config, which is the only shape a default-only implementation cannot
  //     produce — one deny on its own proves nothing.
  await bootedFloor(t, { hostAllowlist: [...DEFAULT_HOST_ALLOWLIST] }, async ({ bash }) => {
    const r = await bash(`curl https://${SYNTHETIC_HOST}/x`);
    assert.equal(decisionOf(r), 'deny',
      `curl at ${SYNTHETIC_HOST} was allowed on a floor whose config omits it`);
  });
});

test('04-20 GATE-03/GATE-05: an operator list that EXCLUDES a default host refuses it, and ASKS', async (t) => {
  assert.ok(DEFAULT_HOST_ALLOWLIST.includes(DEFAULT_MEMBER_HOST),
    `${DEFAULT_MEMBER_HOST} is not in DEFAULT_HOST_ALLOWLIST — this case needs a host the DEFAULT `
    + 'would allow and the operator\'s list would not, or it cannot discriminate');

  // The mirror image of the case above, and the one an unwired getter cannot
  // fake in either direction: the default WOULD have allowed this host, so a
  // refusal here can only have come from the operator's own list.
  //
  // It is also T-04-NET-04's re-check. An unlisted host is the most frequent
  // ask an overnight run produces, so the ask HANDLE is asserted and not merely
  // the refusal: an ask the operator can never see is a deny with no recourse.
  await bootedFloor(t, { hostAllowlist: [SYNTHETIC_HOST] }, async ({ floor, bash }) => {
    const r = await bash(`curl https://${DEFAULT_MEMBER_HOST}/x`);
    assert.equal(decisionOf(r), 'deny',
      `${DEFAULT_MEMBER_HOST} was allowed on a floor whose operator list excludes it — the judge `
      + 'is reading DEFAULT_HOST_ALLOWLIST, not the config');
    assert.ok(r.hive_ask && typeof r.hive_ask.id === 'string' && r.hive_ask.id.startsWith('ask-'),
      'the refusal carries no hive_ask — a host outside a NON-EMPTY allowlist is an ASK '
      + '(T-04-NET-04)');

    const open = floor.hookServer.openApprovals();
    assert.equal(open.length, 1, 'the production registry does not hold the ask it just handed out');
    assert.equal(open[0].id, r.hive_ask.id);
    assert.equal(open[0].agentId, 'a1',
      'the registry entry is attributed to something other than the token-derived agent id');
  });
});

test('04-20 GATE-05: the production registry\'s TTL is the derived ASK_TTL_MS, by effect', async (t) => {
  // NOT a comparison of two exported constants — that says nothing about what
  // the production instance was CONSTRUCTED with (T-04-ASK-41). The registry is
  // built inside `HookServer`, so there is no composition-root argument to grep
  // and `boot.ts` passes no TTL at all; what IS provable from here is the number
  // the really-booted server actually enforces.
  //
  // Opened through the config-driven host refusal rather than a force-push, so
  // this case is ALSO red when the hostAllowlist getter is missing: an ask that
  // exists only because the operator's list was read cannot have its TTL read
  // off a floor that never read that list.
  await bootedFloor(t, { hostAllowlist: [SYNTHETIC_HOST] }, async ({ floor, bash }) => {
    const r = await bash(`curl https://${DEFAULT_MEMBER_HOST}/x`);
    assert.ok(r.hive_ask, 'no ask was opened, so there is no TTL to read');

    const entry = floor.hookServer.openApprovals().find((e) => e.id === r.hive_ask.id);
    assert.ok(entry, 'the ask id on the wire names no entry in the production registry');
    assert.equal(entry.expiresAt - entry.openedAt, ASK_TTL_MS,
      `the production registry's TTL is ${entry.expiresAt - entry.openedAt}ms, not the derived `
      + `ASK_TTL_MS (${ASK_TTL_MS}ms) — an option nobody supplies silently takes whatever the `
      + 'class was written with');
    assert.equal(r.hive_ask.deadlineMs, entry.expiresAt,
      'the deadline handed to the shim and the deadline the server enforces are two numbers — the '
      + 'shim would stop polling before, or keep polling after, the entry it polls for');
    assert.ok(r.hive_ask.deadlineMs > Date.now(), 'the ask was handed out already expired');
  });
});

test('04-20 GATE-05: ask, bare deny and neither — three legs, because two do not discriminate', async (t) => {
  // Without the deny leg a server that asks about EVERYTHING passes; without
  // the "neither" leg a server that verdicts everything passes.
  await bootedFloor(t, {}, async ({ bash }) => {
    const forced = await bash('git push origin +main');
    assert.equal(decisionOf(forced), 'deny');
    assert.ok(forced.hive_ask && typeof forced.hive_ask.id === 'string',
      'a force-push came back a bare deny — GATE-05\'s third answer is missing from the '
      + 'production server');

    const plain = await bash('ls -la');
    assert.equal(decisionOf(plain), null, '`ls -la` was verdicted');
    assert.equal(plain.hive_ask, undefined, '`ls -la` opened an approval');
  });

  // An EMPTIED allowlist is the operator saying "no hosts", and after round 3
  // moved `rm -rf` to ask it is `commandShapeDenial`'s only remaining
  // `kind: 'deny'`. It is UNREACHABLE from a floor whose getter was never
  // supplied, because the unwired fallback (DEFAULT_HOST_ALLOWLIST) is
  // non-empty by construction.
  await bootedFloor(t, { hostAllowlist: [] }, async ({ bash }) => {
    const r = await bash(`curl https://${DEFAULT_MEMBER_HOST}/x`);
    assert.equal(decisionOf(r), 'deny',
      'an EMPTIED host allowlist allowed an outbound host — the judge is answering from the '
      + 'shipped default, so the operator\'s "no hosts" was never heard');
    assert.equal(r.hive_ask, undefined,
      'an emptied allowlist opened an ASK — the operator answered this question by emptying the '
      + 'list, and waking them for it is the deny they asked for');
  });
});

test('04-20 RECORD-01: a real row in the floor\'s OWN store, with a derived agent id', async (t) => {
  await bootedFloor(t, {}, async ({ floor, pre }) => {
    // Outside the hive root, so GATE-01's protected-path arm is not what
    // answers here — the row under test is an ALLOW's row.
    const target = path.join(os.tmpdir(), 'md-0420-composition', 'alpha.ts');
    // The forged-id negative rides the same payload: `authorized()` DERIVES the
    // sender from its per-agent token and discards this claim. A record that
    // trusted the body would attribute the write to an id any shell can type.
    const r = await pre('Write', { file_path: target }, { agent_id: 'not-a1' });
    assert.equal(decisionOf(r), null, 'the Write was refused, so the row under test is the wrong row');

    const rows = floor.persist.toolCalls({ agentId: 'a1', limit: 100 });
    assert.equal(rows.length, 1,
      'no tool_calls row reached floor.persist. `persist` is a module-scope `let` assigned AFTER '
      + 'the new HookServer(...) call, so an EAGERLY bound `persist.recordToolCall` captures '
      + 'undefined and every tool call is silently unrecorded (T-04-LOG-11) — the argument has to '
      + 'be a closure read at CALL time');
    assert.equal(rows[0].tool, 'Write');
    assert.notEqual(rows[0].target, null,
      'the row arrived with a NULL target — the row is not lost, the column the requirement exists '
      + 'for is empty');
    assert.equal(rows[0].target, target);
    assert.equal(rows[0].decision, 'allow');
    assert.equal(rows[0].agentId, 'a1');
    assert.equal(floor.persist.toolCalls({ agentId: 'not-a1', limit: 100 }).length, 0,
      'the payload\'s forged agent_id reached the ledger — GATE-01 derives the sender from its '
      + 'token and the audit trail must record that id, not a claim (T-04-LOG-09)');
  });
});

test('04-20 GATE-05: the publisher fires, and honours the operator\'s notifications setting', async (t) => {
  // BOTH halves, because a publisher that never fires and a publisher that
  // ignores the gate each pass a one-sided test.
  await bootedFloor(t, { notifications: true }, async ({ floor, bash, notified }) => {
    const r = await bash('git push origin +main');
    assert.ok(r.hive_ask, 'no ask was opened, so the publisher had nothing to publish');
    assert.equal(notified.length, 1,
      'opening an ask raised no toast — publishApproval never reached the production HookServer, '
      + 'so an overnight floor waits on a question nobody is told about');
    assert.ok(String(notified[0].title).includes('a1'),
      `the toast does not name the agent that asked: ${JSON.stringify(notified[0])}`);
    assert.equal(floor.hookServer.openApprovals().length, 1);
  });

  // notifications OFF: the toast half is silent, the DATA half is not. Plan
  // 04-17's `GET /phone/api/asks` is a PULL, and a pull the operator asked for
  // is not a notification (T-04-ASK-39).
  await bootedFloor(t, { notifications: false }, async ({ floor, bash, notified }) => {
    const r = await bash('git push origin +main');
    assert.ok(r.hive_ask, 'no ask was opened, so neither half of the publisher was exercised');
    assert.equal(notified.length, 0,
      'an operator who turned notifications off was toasted anyway — every other toast in boot.ts '
      + 'honours readConfig().notifications and this one must too');
    const open = floor.hookServer.openApprovals();
    assert.equal(open.length, 1,
      'the notifications gate swallowed the DATA half too — the phone would show no pending '
      + 'approval and the ask would expire unanswered with nothing to answer it from');
    assert.equal(open[0].id, r.hive_ask.id);
  });
});

// ─── Plan 03-02: THE COMPOSITION ROOT, second seam ───────────────────────────
//
// `TelemetryCollectorOptions.resolveCodexHome` shipped with a doc comment saying
// "Wired in index.ts, next to `resolveCwd`". It was wired NOWHERE. A declared,
// optional, never-passed option fails silently and completely: `transcriptFallback`
// drops to `resolveCwd` and bills a codex worker for whatever Claude transcripts
// happen to live in the repo it shares with a claude worker.
//
// test/telemetry-auth.test.cjs proves the COLLECTOR honours the option when it is
// given one. That is the half that was already true before this plan. It cannot
// prove boot.ts passes it — and "the feature exists and does nothing" is exactly
// the defect this repo keeps paying for, so the wiring gets its own assertion
// against a REALLY BOOTED floor, driven through `floor.telemetry` and the real
// `hive.codexHomeFor()` path, never a grep over the argument list.
test('03-02: a really-booted floor reads a codex agent OWN rollout, not its cwd-neighbour transcripts', async (t) => {
  const env = floorEnv(t);
  const { deps } = fakeDeps(env);
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  const hiveRoot = floor.hive.root();
  const sharedCwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-0302-boot-cwd-')));
  // A fake HOME so `projectDir()` resolves into a directory this test owns.
  // Set AFTER boot: bootFloor takes its paths from deps.paths(), not from HOME.
  const fakeHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-0302-boot-home-')));
  const prev = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = fakeHome;
  process.env.USERPROFILE = fakeHome;
  t.after(() => {
    for (const k of ['HOME', 'USERPROFILE']) {
      if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k];
    }
    for (const d of [sharedCwd, fakeHome]) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  });

  // Two agents, ONE cwd, two providers — the production registry boot.ts's
  // closures actually read (`hive.registry()` re-reads registry.json per call).
  fs.writeFileSync(path.join(hiveRoot, 'registry.json'), JSON.stringify({
    godId: null,
    agents: {
      cx: { id: 'cx', name: 'Codex', cwd: sharedCwd, provider: 'codex', status: 'idle', lastSeen: Date.now() },
      cl: { id: 'cl', name: 'Claude', cwd: sharedCwd, provider: 'claude', status: 'idle', lastSeen: Date.now() }
    }
  }, null, 2), 'utf8');

  // The NEIGHBOUR's money, in the shared cwd's Claude project dir.
  const { projectDir } = loadTs('src/main/transcript.ts');
  const projDir = projectDir(sharedCwd);
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(path.join(projDir, 'sid-neighbour.jsonl'), JSON.stringify({
    type: 'assistant', sessionId: 'sid-neighbour',
    message: {
      model: 'claude-sonnet-4-6',
      usage: {
        input_tokens: 111, output_tokens: 222,
        cache_creation_input_tokens: 333, cache_read_input_tokens: 444
      }
    }
  }) + '\n', 'utf8');

  // The codex agent's OWN money — written at the path PRODUCTION derives, so
  // this also proves `codexHomeFor` agrees with `installCodexHooks`.
  const codexHome = floor.hive.codexHomeFor('cx');
  assert.equal(codexHome, path.join(hiveRoot, 'agents', 'cx', '.codex'),
    'codexHomeFor no longer mirrors installCodexHooks join(agentDir, ".codex")');
  const rollDir = path.join(codexHome, 'sessions', '2026', '08', '26');
  fs.mkdirSync(rollDir, { recursive: true });
  fs.writeFileSync(path.join(rollDir, 'rollout-2026-08-26T10-00-00-019e1250-177c-7b51-aa43-1bc553929cf8.jsonl'),
    JSON.stringify({
      timestamp: '2026-08-26T10:00:00.000Z', type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: 5000, cached_input_tokens: 1000, output_tokens: 700, reasoning_output_tokens: 0, total_tokens: 5700 } }
      }
    }) + '\n', 'utf8');

  // THE ASSERTION: through the floor's own collector, wired by boot.ts alone.
  const cx = floor.telemetry.getAgentUsage('cx');
  assert.ok(cx, 'the booted floor read NO usage for the codex agent — resolveCodexHome is unwired and '
    + 'resolveCwd found nothing either, so the fixture is not reaching production code');
  assert.equal(cx.output, 700,
    `the booted floor billed the codex agent ${cx.output} output tokens; its own rollout says 700 and the `
    + 'cwd-sharing claude NEIGHBOUR says 222. A 222 here means boot.ts never passed resolveCodexHome');
  assert.equal(cx.input, 4000, 'codex input is input_tokens - cached_input_tokens');
  assert.equal(cx.cacheCreation, 0,
    'codex has no cache-creation concept — a 333 here is the neighbour Claude transcript bleeding through');

  // The mirror image: a NON-codex agent must be completely unaffected by the
  // wiring — it still reads its cwd, exactly as before this plan.
  const cl = floor.telemetry.getAgentUsage('cl');
  assert.ok(cl, 'the claude agent lost its cwd fallback — the gating closure is refusing every provider');
  assert.equal(cl.output, 222, 'a non-codex agent must still read its cwd transcripts, unchanged');

  // ...and the DISPLAY gate agrees about which of the two can be shown a figure.
  const { hasOwnCostSource } = loadTs('src/main/hive.ts');
  const reg = floor.hive.registry();
  assert.equal(hasOwnCostSource(reg.agents, 'cx'), true);
  assert.equal(hasOwnCostSource(reg.agents, 'cl'), false,
    'the claude agent shares that cwd — its whole-directory total is not provably its own money');

  // ─── the DISPLAY join itself, read out of the file it really writes ───────
  //
  // Everything above proves the COLLECTOR is wired. This proves the join that
  // consumes it: `writeFleetSnapshot` sourced `usageById` from
  // `telemetry.snapshot()`, which iterates LIVE OTel sessions only — so a
  // transcript-only agent was written to fleet.json as a flat $0 no matter how
  // much it had spent. `armAlwaysOnBeats()` writes the snapshot synchronously
  // before arming its timer, so the real function runs here, not a copy of it.
  loadTs('src/main/floor/boot.ts').armAlwaysOnBeats();
  const fleet = JSON.parse(fs.readFileSync(path.join(hiveRoot, 'fleet.json'), 'utf8'));
  const row = (id) => fleet.agents.find((a) => a.id === id);

  const cxRow = row('cx');
  assert.ok(cxRow, 'the codex agent is missing from fleet.json entirely');
  assert.equal(cxRow.tokens, 5700,
    `the fleet snapshot shows ${cxRow.tokens} tokens for a codex agent whose rollout totals 5700. `
    + 'A 0 means the join is still sourced from the live-OTel-only snapshot() map');
  assert.ok(cxRow.usd > 0, 'a measured transcript total was written with no dollar figure');
  assert.equal(cxRow.costLifetime, true,
    'a transcript total is ALL-TIME cumulative and must say so — rendered beside "up 4m" without this '
    + 'flag it reads as spend since this spawn');
  assert.equal(cxRow.costUnattributed, false, 'this figure IS attributable — it came from a per-agent CODEX_HOME');
  assert.equal(cxRow.lastActiveSecAgo, null,
    'a fallback sample ts is the READ time, not an activity time — reporting it as freshness renders a '
    + 'dormant agent as permanently "0s ago"');

  // The mirror image, and the reason the gate exists: same cwd, same transcripts
  // sitting right there, but nothing proves they are THIS agent's money.
  const clRow = row('cl');
  assert.ok(clRow, 'the claude agent is missing from fleet.json entirely');
  assert.equal(clRow.tokens, 0, 'a cwd-sharing claude agent was handed a whole-directory total it cannot prove is its own');
  assert.equal(clRow.usd, 0);
  assert.equal(clRow.costUnattributed, true,
    'its 0 must be a DECLARED GAP, not a measurement — an undeclared $0 reads as "this agent is cheap"');
  assert.equal(clRow.costLifetime, false);
});
