'use strict';

/**
 * Config persistence + secret storage (#3 C3, #10 H2).
 *
 * Three contracts, all of which used to fail:
 *   1. `config:get` handed the renderer the Slack signing secret, the bot token,
 *      every webhook secret and the Groq key in the clear. `redactedConfig` is
 *      what the IPC handler returns now, and it may leak neither the value nor
 *      its length.
 *   2. A config.json that cannot be parsed made `readConfig` return bare defaults
 *      — indistinguishable from a fresh install — and the next write committed
 *      that fiction over the only copy of the floor.
 *   3. Both persist paths (config.json, claude-account-pool.json) were bare
 *      `writeFileSync`, so a crash mid-write truncated them. Temp + rename, the
 *      shape roster.ts has always used.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

// config.ts + integrations.ts pull `app` and `safeStorage` from electron; outside
// Electron that resolve gives a path string. Seed the cache with the surface they
// actually touch. The fake cipher is a reversible tag, not encryption — what is
// under test is that the value leaves config.json, not DPAPI itself.
let userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-cfg-'));
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: {
    app: { getPath: () => userData },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(`enc:${s}`, 'utf8'),
      decryptString: (b) => b.toString('utf8').replace(/^enc:/, '')
    }
  }
};

// MEASURED (plan 02-11 task 4): `require('better-sqlite3')` DOES load under
// plain node — `node -e "require('better-sqlite3')"` succeeds on Node v24.13.0
// against the installed better-sqlite3@13.0.3, which ships N-API prebuilds
// rather than an Electron-ABI-only native build. An earlier claim that the
// driver was unloadable outside Electron was stale; the fake driver below is
// NOT standing in for a load failure. It exists for DETERMINISM instead: no
// native build step, no real file left behind, and no ABI question to
// re-litigate across three CI platforms every time this file runs. Stand a
// fake driver in for it: enough of the surface PersistStore.getKv/setKv
// touches, and nothing else. (The real driver's own load-and-run path is
// exercised every time this file is run WITHOUT the fake, which is how it was
// first seen working.)
const sqlite = require.resolve('better-sqlite3');
require.cache[sqlite] = {
  id: sqlite,
  filename: sqlite,
  loaded: true,
  exports: class FakeDatabase {
    constructor() { this.rows = new Map(); this.version = 0; }
    pragma(q) {
      if (q === 'user_version') return this.version;
      if (q.startsWith('user_version =')) this.version = Number(q.split('=')[1].trim());
      return undefined;
    }
    exec() { /* schema DDL — the Map is the schema here */ }
    transaction(fn) { return fn; }
    prepare() {
      const rows = this.rows;
      return {
        get: (key) => rows.get(key),
        run: (key, value) => rows.set(key, { value }),
        all: () => []
      };
    }
    close() { /* noop */ }
  }
};

const { readConfig, writeConfig, redactedConfig, REDACTED } = loadTs('src/main/config.ts');
const { AccountPoolManager } = loadTs('src/main/accountPool.ts');

/** Point the module's userData at a fresh directory for one test. */
function freshUserData(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-cfg-'));
  const prev = userData;
  userData = dir;
  t.after(() => {
    userData = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

const SECRETS = {
  slackSigningSecret: 'a-very-long-slack-signing-secret-0123456789',
  slackBotToken: 'xoxb-1',
  webhookSecret: 'wh-shared-secret',
  groqApiKey: 'gsk_live_abcdefghijklmnop'
};
const TRIGGER_SECRET = 'per-endpoint-secret-value';

function configWithSecrets() {
  return {
    ...SECRETS,
    harnessHome: '/floor',
    webhookTriggers: [
      { id: 'legacy', name: 'Default webhook', secret: TRIGGER_SECRET, enabled: true, mode: 'strict', schema: '', createdAt: 1 }
    ]
  };
}

/* ------------------------------------------------------------------ *
 * (a) redactedConfig leaks neither a secret value nor its length.
 * ------------------------------------------------------------------ */

test('#10: redactedConfig leaks no secret value and no secret length', () => {
  const cfg = configWithSecrets();
  const red = redactedConfig(cfg);
  const wire = JSON.stringify(red);

  for (const [field, value] of Object.entries(SECRETS)) {
    assert.ok(!wire.includes(value), `${field} reached the renderer in the clear`);
    assert.equal(red[field], REDACTED);
  }
  assert.ok(!wire.includes(TRIGGER_SECRET), 'a webhook endpoint secret reached the renderer');
  assert.equal(red.webhookTriggers[0].secret, REDACTED);

  // Every placeholder is the SAME width: a redaction sized to the real secret
  // would hand an attacker the length for free.
  const widths = new Set([
    ...Object.keys(SECRETS).map((f) => red[f].length),
    red.webhookTriggers[0].secret.length
  ]);
  assert.equal(widths.size, 1, 'redaction width must not track the real secret length');

  // Presence survives (the renderer legitimately shows "a key is configured")…
  assert.ok(red.groqApiKey);
  // …and an unset secret stays unset rather than gaining a fake one.
  assert.equal(redactedConfig({ webhookTriggers: [] }).slackBotToken, undefined);

  // Deep copy: redacting must not scrub the live config main is still using.
  assert.equal(cfg.slackSigningSecret, SECRETS.slackSigningSecret);
  assert.equal(cfg.webhookTriggers[0].secret, TRIGGER_SECRET);
});

test('#10: the placeholder round-trips as "unchanged", never as a new secret', (t) => {
  const dir = freshUserData(t);
  writeConfig(configWithSecrets());
  // Exactly what the Settings form sends back when the user saves without
  // retyping the field: the placeholder it was shown.
  writeConfig({ slackSigningSecret: REDACTED, groqApiKey: REDACTED, webhookTriggers: [{ ...configWithSecrets().webhookTriggers[0], secret: REDACTED }] });

  const back = readConfig();
  assert.equal(back.slackSigningSecret, SECRETS.slackSigningSecret, 'a save erased the Slack signing secret');
  assert.equal(back.groqApiKey, SECRETS.groqApiKey);
  assert.equal(back.webhookTriggers[0].secret, TRIGGER_SECRET);
  assert.ok(!fs.readFileSync(path.join(dir, 'config.json'), 'utf8').includes(REDACTED));
});

test('#10: secrets move out of config.json and are still readable in main', (t) => {
  const dir = freshUserData(t);
  const p = path.join(dir, 'config.json');
  // A plaintext-era config, exactly as older builds wrote it.
  fs.writeFileSync(p, JSON.stringify(configWithSecrets(), null, 2), 'utf8');

  const cfg = readConfig();
  // Main still reads them the way every consumer already does…
  for (const [field, value] of Object.entries(SECRETS)) assert.equal(cfg[field], value);
  assert.equal(cfg.webhookTriggers[0].secret, TRIGGER_SECRET);

  // …but the first read migrated them out of the file.
  const onDisk = fs.readFileSync(p, 'utf8');
  for (const value of [...Object.values(SECRETS), TRIGGER_SECRET]) {
    assert.ok(!onDisk.includes(value), `config.json still holds ${value}`);
  }
  assert.ok(fs.existsSync(path.join(dir, 'integration-secrets.json')), 'nothing reached the encrypted store');
});

/* ------------------------------------------------------------------ *
 * (b) A truncated config.json must not quietly become "fresh install".
 * ------------------------------------------------------------------ */

test('#3: a truncated config.json is preserved, not silently replaced by defaults', (t) => {
  const dir = freshUserData(t);
  const p = path.join(dir, 'config.json');
  const whole = JSON.stringify({ onboardingComplete: true, harnessHome: '/floor', registeredRepos: ['/floor/repo'] }, null, 2);
  // What an interrupted `writeFileSync` leaves behind.
  const truncated = whole.slice(0, 40);
  fs.writeFileSync(p, truncated, 'utf8');

  const cfg = readConfig();
  // The app still boots — but on defaults, which is exactly why the damaged file
  // must survive: `harnessHome: null` sends the user back into onboarding.
  assert.equal(cfg.harnessHome, null);

  const kept = fs.readdirSync(dir).filter((f) => f.startsWith('config.json.corrupt-'));
  assert.equal(kept.length, 1, 'the unreadable config was thrown away');
  assert.equal(fs.readFileSync(path.join(dir, kept[0]), 'utf8'), truncated, 'the preserved copy is not the original bytes');
  // Moved aside, so the defaults we just returned cannot be written over it.
  assert.equal(fs.existsSync(p), false);

  writeConfig({ onboardingComplete: false });
  assert.equal(fs.readFileSync(path.join(dir, kept[0]), 'utf8'), truncated, 'a later write clobbered the rescued config');
});

/* ------------------------------------------------------------------ *
 * (c) Both persist paths write to a temp file and rename it into place.
 * ------------------------------------------------------------------ */

/** Record fs writes/renames for the duration of `fn`. The TS→CJS transpile keeps
 *  the `node:fs` namespace access, so patching the module object works. */
function traceFs(fn) {
  const trace = [];
  const realWrite = fs.writeFileSync;
  const realRename = fs.renameSync;
  fs.writeFileSync = (p, ...rest) => { trace.push(['write', String(p)]); return realWrite(p, ...rest); };
  fs.renameSync = (a, b) => { trace.push(['rename', String(a), String(b)]); return realRename(a, b); };
  try { fn(); } finally {
    fs.writeFileSync = realWrite;
    fs.renameSync = realRename;
  }
  return trace;
}

test('#3: accountPool state is written to a temp file and renamed into place', (t) => {
  const dir = freshUserData(t);
  const statePath = path.join(dir, 'claude-account-pool.json');
  const pool = new AccountPoolManager({
    statePath: () => statePath,
    accounts: () => [{ id: 'a1', label: 'A1', createdAt: 1 }],
    tokenPresent: () => true,
    liveAgents: () => [],
    emit: () => {},
    log: () => {},
    now: () => 1_000
  });

  const trace = traceFs(() => pool.markActive('a1'));

  assert.deepEqual(trace.filter((c) => c[0] === 'write').map((c) => c[1]), [`${statePath}.tmp`],
    'pool state must never be written straight onto the live file');
  assert.deepEqual(trace.filter((c) => c[0] === 'rename'), [['rename', `${statePath}.tmp`, statePath]]);
  assert.equal(fs.existsSync(`${statePath}.tmp`), false, 'the temp file was left behind');
  assert.ok(JSON.parse(fs.readFileSync(statePath, 'utf8')).accounts.a1);
});

test('#3: config.json is written to a temp file and renamed, and unchanged writes are skipped', (t) => {
  const dir = freshUserData(t);
  const p = path.join(dir, 'config.json');

  const first = traceFs(() => writeConfig({ onboardingComplete: true }));
  assert.ok(first.some((c) => c[0] === 'write' && c[1] === `${p}.tmp`), 'config.json was written non-atomically');
  assert.deepEqual(first.filter((c) => c[0] === 'rename' && c[2] === p), [['rename', `${p}.tmp`, p]]);
  assert.equal(fs.existsSync(`${p}.tmp`), false);
  assert.equal(readConfig().onboardingComplete, true);

  // The scheduler calls writeConfig on every mission tick and every heartbeat
  // beat; with `lastFiredAt` out of the file those writes change nothing, and a
  // rewrite that changes nothing is a crash window bought for nothing.
  const again = traceFs(() => writeConfig({ onboardingComplete: true }));
  assert.deepEqual(again.filter((c) => c[1].startsWith(p)), [], 'an unchanged config was rewritten anyway');
});

test('#3: a mission fire stamp goes to the kv store, not into config.json', (t) => {
  const dir = freshUserData(t);
  const p = path.join(dir, 'config.json');
  writeConfig({
    missions: [{ id: 'ops-standup', label: 'Hourly ops standup', intervalMs: 3_600_000, to: 'god', body: 'b', enabled: true }]
  });
  const before = fs.readFileSync(p, 'utf8');
  assert.ok(!before.includes('lastFiredAt'));

  // Exactly what the scheduler does on every mission tick and every heartbeat
  // beat — the write that used to rewrite the whole config on a timer.
  const trace = traceFs(() => writeConfig({
    missions: readConfig().missions.map((m) => ({ ...m, lastFiredAt: 1_700_000_000_000 }))
  }));

  assert.deepEqual(trace.filter((c) => c[1].startsWith(p)), [], 'stamping lastFiredAt rewrote config.json');
  assert.equal(fs.readFileSync(p, 'utf8'), before);
  // …and the stamp is still there for the next boot, so a partially-elapsed
  // interval is not restarted from zero.
  assert.equal(readConfig().missions[0].lastFiredAt, 1_700_000_000_000);
});
