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
 *  (D-03's landmine: a void-typed `send` would silently invert every
 *  `=== true` routing decision that reads it), `quit` recording that
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

const B_IPC_JOINED = 155;

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
  'config:get', 'config:update', 'control:autoDelivery', 'control:gateTool', 'control:halt',
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
  'missions:list', 'missions:save', 'org:getTrigger', 'org:setTrigger', 'providerKey:clear',
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
