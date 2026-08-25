'use strict';

/**
 * DAEMON-04 — the per-agent MCP server bundle. D-25 (scripts/mcp-live-probe.cjs,
 * claude 2.1.236): an `mcpServers` key inside a `--settings <file>.json` file is
 * ignored — Claude Code never spawns that server. `<agentDir>/mcp.json`, passed
 * via `--mcp-config`, is the channel that actually spawns one. This file proves,
 * on the `hive-hook-node` / `hive-cwd` harness (02-PATTERNS.md:40):
 *
 *   - the bundle rides `--mcp-config` and the settings channel carries none
 *   - write/secret servers stay fail-closed without BOTH a grant and a resolvable
 *     secret (D-28), and the tier predicate is untouched
 *   - a non-wired provider gets neither the file nor the flag (D-26)
 *   - the credential file is 0600 (POSIX) and git-ignores itself for real
 *   - the config-side migration drops floor-wide write/secret consent, keyed
 *     per-agent so one revoke cannot disarm another (D-27/D-28)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

// config.ts + integrations.ts pull `app`/`safeStorage` from electron; seed the
// cache BEFORE loadTs, exactly like test/config-secrets.test.cjs:29-43.
let userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-mcp-cfg-'));
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

// config.ts's mission-stamp store (PersistStore) pulls in better-sqlite3.
// Without a fake, whichever answer task 4 measures for "does it load under
// plain node" is what happens here — and on a machine where it DOES load, a
// real Database file opens under `userData` and never closes (config.ts
// caches one PersistStore instance module-wide), which then EPERMs the
// tmpdir cleanup on Windows. Same fake driver as test/config-secrets.
// test.cjs:52-76 — enough of the surface PersistStore.getKv/setKv touches.
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

const { HiveManager } = loadTs('src/main/hive.ts');
const { buildDefaultMcpServers, effectiveMcpConsent } = loadTs('src/main/hiveProvisioning.ts');
const { MCP_CATALOG, mcpGrantKey, MCP_GRANT_PREFIX, mcpWiredFor } = loadTs('src/shared/mcpCatalog.ts');
const { readConfig } = loadTs('src/main/config.ts');
const mainIntegrations = loadTs('src/main/integrations.ts');
const { secretRefFor } = loadTs('src/shared/integrations.ts');

/** Point config.ts/integrations.ts's `app.getPath('userData')` at a fresh dir
 *  for one test — exactly test/config-secrets.test.cjs's freshUserData. */
function freshUserData(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-mcp-cfg2-'));
  const prev = userData;
  userData = dir;
  t.after(() => {
    userData = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

const POSIX = process.platform !== 'win32';

function tmpHome(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function agentPaths(home, id) {
  const dir = path.join(home, 'hive', 'agents', id);
  return { dir, settings: path.join(dir, 'settings.json'), mcp: path.join(dir, 'mcp.json') };
}

// ── The default-consent bundle rides --mcp-config, not --settings ───────────

test('a claude agent with default consent: mcp.json exists on --mcp-config, settings carries no mcpServers key', async (t) => {
  const home = tmpHome('md-mcp-a-');
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);

  const injection = await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });

  const { settings, mcp } = agentPaths(home, 'a1');
  assert.equal(fs.existsSync(mcp), true, 'mcp.json must exist for the default (all safe-readonly) bundle');
  const written = JSON.parse(fs.readFileSync(mcp, 'utf8'));
  const keys = Object.keys(written.mcpServers);
  assert.ok(keys.length > 0);
  for (const k of keys) assert.match(k, /^hellomarkx-/, `${k} must be namespaced`);
  // Every safe-readonly catalog id shows up, none of the write/secret ones.
  const safeIds = MCP_CATALOG.filter((e) => e.tier === 'safe-readonly').map((e) => `hellomarkx-${e.id}`);
  const writeSecretIds = MCP_CATALOG.filter((e) => e.tier !== 'safe-readonly').map((e) => `hellomarkx-${e.id}`);
  assert.deepEqual(keys.sort(), safeIds.sort());
  for (const id of writeSecretIds) assert.ok(!keys.includes(id), `${id} must not ride in on defaults`);

  assert.ok(injection.args.includes('--mcp-config'), 'argv must carry --mcp-config');
  assert.equal(injection.args[injection.args.indexOf('--mcp-config') + 1], mcp, 'must point at the exact written path');
  assert.ok(injection.args.includes('--strict-mcp-config'), 'the operator\'s own servers must not leak into a bypassed agent');

  // Both directions on the dead channel — either alone is vacuous.
  const settingsJson = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal('mcpServers' in settingsJson, false, 'the --settings file must carry no mcpServers key at all');
  assert.ok(Object.keys(written.mcpServers).length >= 1, 'and --mcp-config must carry at least one server');
});

// ── D-28: write/secret servers are fail-closed on BOTH consent and key ──────

test('a write/secret entry with no consent is absent from the built bundle', () => {
  const secretEntry = MCP_CATALOG.find((e) => e.tier === 'secret');
  assert.ok(secretEntry, 'sanity: the catalog has at least one secret-tier entry');
  const servers = buildDefaultMcpServers('/cwd', {}, { secretFor: () => 'irrelevant-should-never-be-called' });
  assert.ok(!(`hellomarkx-${secretEntry.id}` in servers), 'no consent at all must never arm a write/secret server');
});

test('a write/secret entry WITH consent but an unresolved secret is still absent (D-28 not-armed rule)', () => {
  const secretEntry = MCP_CATALOG.find((e) => e.tier === 'secret');
  const cfg = { [secretEntry.id]: { enabled: true } };
  const servers = buildDefaultMcpServers('/cwd', cfg, { secretFor: () => undefined });
  assert.ok(!(`hellomarkx-${secretEntry.id}` in servers),
    'consent without a resolvable key must not arm the server — an unkeyed write server is worse than an absent one');
});

test('a write/secret entry WITH consent AND a resolved secret is armed, carrying that value in its one declared env key', () => {
  const secretEntry = MCP_CATALOG.find((e) => e.tier === 'secret');
  const envKeys = Object.keys(secretEntry.spec.env);
  assert.equal(envKeys.length, 1, 'sanity: fixture entry declares exactly one env key');
  const cfg = { [secretEntry.id]: { enabled: true } };
  const servers = buildDefaultMcpServers('/cwd', cfg, { secretFor: (id) => (id === secretEntry.id ? 'tok-abc123' : undefined) });
  const written = servers[`hellomarkx-${secretEntry.id}`];
  assert.ok(written, 'a fully-consented, fully-keyed entry must be armed');
  assert.equal(written.env[envKeys[0]], 'tok-abc123');
});

test('every secret-tier catalog entry declares exactly one env key (positive lower bound)', () => {
  const secretTier = MCP_CATALOG.filter((e) => e.tier === 'secret' || e.tier === 'write');
  assert.ok(secretTier.length >= 1, 'sanity: the catalog carries at least one write/secret entry');
  for (const e of secretTier) {
    assert.equal(Object.keys(e.spec.env ?? {}).length, 1, `${e.id} must declare exactly one env key`);
  }
});

test('the fail-closed tier predicate is untouched — a hand-edited safe-readonly:false with consented=true still excludes it only via the tier check', () => {
  // Regression guard for the exact byte-identical predicate (02-01's contract):
  // e.tier !== 'safe-readonly' && consented !== true
  const safeEntry = MCP_CATALOG.find((e) => e.tier === 'safe-readonly');
  const servers = buildDefaultMcpServers('/cwd', { [safeEntry.id]: { enabled: false } });
  assert.ok(!(`hellomarkx-${safeEntry.id}` in servers), 'an explicit false must still disable a safe-readonly entry');
});

// ── effectiveMcpConsent (D-27): safe tier reads the floor, else reads grants ─

test('effectiveMcpConsent: safe-readonly reads the FLOOR map only, write/secret reads the GRANTS map only', () => {
  const safeEntry = MCP_CATALOG.find((e) => e.tier === 'safe-readonly');
  const secretEntry = MCP_CATALOG.find((e) => e.tier === 'secret');
  const floor = { [safeEntry.id]: { enabled: false }, [secretEntry.id]: { enabled: true } };
  const grants = { [secretEntry.id]: { enabled: true } };
  const merged = effectiveMcpConsent(floor, grants);
  assert.equal(merged[safeEntry.id].enabled, false, 'safe-readonly must come from the floor map');
  assert.equal(merged[secretEntry.id].enabled, true, 'secret must come from the grants map, not the floor');
});

test('effectiveMcpConsent never invents a value neither map mentions', () => {
  const secretEntry = MCP_CATALOG.find((e) => e.tier === 'secret');
  const merged = effectiveMcpConsent({}, {});
  assert.equal(secretEntry.id in merged, false, 'absent from both inputs must stay absent, not default to false or true');
});

// ── D-26: only a wired provider gets the file and the flag ──────────────────

test('mcpWiredFor: claude is wired, an arbitrary other engine id is not', () => {
  assert.equal(mcpWiredFor('claude'), true);
  assert.equal(mcpWiredFor('codex'), false);
  assert.equal(mcpWiredFor('grok'), false);
});

test('a non-hive-aware, non-claude provider gets no mcp.json and no --mcp-config on argv', async (t) => {
  const home = tmpHome('md-mcp-b-');
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);

  const injection = await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'codex', cwd: home });

  const { mcp } = agentPaths(home, 'a1');
  assert.equal(fs.existsSync(mcp), false);
  assert.equal(injection.args.includes('--mcp-config'), false);
});

// ── mcpArmed(): the disk-read half of D-29 ───────────────────────────────────

test('mcpArmed() reads back the catalog ids actually written, and [] for an absent file', async (t) => {
  const home = tmpHome('md-mcp-c-');
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);

  assert.deepEqual(hive.mcpArmed('never-spawned'), []);

  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });
  const armed = hive.mcpArmed('a1');
  assert.ok(armed.length > 0);
  for (const id of armed) assert.ok(!id.startsWith('hellomarkx-'), 'mcpArmed must strip the namespace prefix');
  const safeIds = MCP_CATALOG.filter((e) => e.tier === 'safe-readonly').map((e) => e.id);
  assert.deepEqual(armed.sort(), safeIds.sort());
});

// ── The credential file: 0600 (POSIX) and git-ignored by git's own answer ───

test('mcp.json is written 0600 on POSIX (win32 has no meaningful permission bits)', async (t) => {
  const home = tmpHome('md-mcp-d-');
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });
  const { mcp } = agentPaths(home, 'a1');
  // Always asserts something, on every platform — a bare platform-conditional
  // `return` reports `ok` having run zero assertions (test/suite-integrity.
  // test.cjs's own gate), so the win32 half is a real (trivial) assertion
  // plus an announced no-op, never a silent early exit.
  assert.equal(fs.existsSync(mcp), true);

  if (POSIX) {
    // The parentheses ARE the assertion — `&` binds looser than `===`, so an
    // unparenthesised `mode & 0o777 === 0o600` is `mode & (0o777 === 0o600)` =
    // `mode & false` = the constant 0 for every mode there is (measured, plan
    // 02-11 task 2). Never write this comparison without them.
    const mode = fs.statSync(mcp).mode;
    assert.equal((mode & 0o777) === 0o600, true, `expected 0600, got ${(mode & 0o777).toString(8)}`);
  } else {
    console.error('[mcp-per-agent] mode case skipped — POSIX permission bits are not meaningful on win32');
  }
});

test('git check-ignore on the real hive repo answers TRUE for <agentDir>/mcp.json', async (t) => {
  const home = tmpHome('md-mcp-e-');
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });

  const hiveRoot = path.join(home, 'hive');
  // exits 0 = ignored. Asserted by git's own decision, never by reading the
  // .gitignore text (D-40 — a rule can exist and still not be the one that
  // actually matches).
  assert.doesNotThrow(() => {
    execFileSync('git', ['-C', hiveRoot, 'check-ignore', '-q', 'agents/a1/mcp.json']);
  }, 'git must consider <agentDir>/mcp.json ignored');
});

// ── A revoke / empty bundle removes a stale file rather than leaving it ─────

test('an empty server map removes any existing mcp.json rather than leaving a stale one', async (t) => {
  const home = tmpHome('md-mcp-f-');
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);

  // First spawn: default consent arms the safe-readonly bundle.
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });
  const { mcp } = agentPaths(home, 'a1');
  assert.equal(fs.existsSync(mcp), true, 'sanity: something was armed the first time');

  // Second spawn: every catalog entry explicitly disabled → an empty map.
  const allOff = {};
  for (const e of MCP_CATALOG) allOff[e.id] = { enabled: false };
  const injection = await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home }, { mcpDefaults: allOff });
  assert.equal(fs.existsSync(mcp), false, 'a stale mcp.json must not survive an empty bundle');
  assert.equal(injection.args.includes('--mcp-config'), false);
  assert.deepEqual(hive.mcpArmed('a1'), []);
});

// ── config.ts: the per-agent grant migration (D-27) ─────────────────────────
//
// config.ts's migration latches (`mcpConsentMigrationRan`, mirroring
// `triggersMigrationRan`) are IN-PROCESS, module-level state — and
// test/load-ts.cjs caches a loaded module by filename for the lifetime of
// this test FILE's process, not per-test. So config.ts's `readConfig` is
// exercised in exactly ONE test below (first, and only, call in this file) —
// splitting it across two tests would make the second one see an
// already-tripped latch regardless of what its own fresh config.json says,
// which is not the behaviour under test.

test('migrateMcpConsentV1 drops floor-wide write/secret consent, leaves safe-readonly alone, invents no per-agent grant, and is latched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-mcp-cfg2-'));
  const prev = userData;
  userData = dir;
  try {
    const secretEntry = MCP_CATALOG.find((e) => e.tier === 'secret');
    const safeEntry = MCP_CATALOG.find((e) => e.tier === 'safe-readonly');

    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
      mcpDefaults: { [secretEntry.id]: { enabled: true }, [safeEntry.id]: { enabled: true } }
    }));

    const first = readConfig();
    assert.equal(first.mcpDefaults[secretEntry.id].enabled, false, 'floor-wide write/secret consent must be dropped');
    assert.equal(first.mcpDefaults[safeEntry.id].enabled, true, 'safe-readonly stays floor-wide, untouched — both directions matter');
    assert.equal(first.mcpConsentMigratedV1, true);
    assert.deepEqual(first.mcpAgentGrants ?? {}, {}, 'the migration must NOT invent a per-agent grant from what it dropped');

    // The latch: overwrite the on-disk config with enabled:true again AND
    // mcpConsentMigratedV1 reset to false, then read a second time. If the
    // migration re-ran, this would come back false again; the in-process
    // latch (not the on-disk flag) is what must stop it.
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({
      mcpDefaults: { [secretEntry.id]: { enabled: true }, [safeEntry.id]: { enabled: true } },
      mcpConsentMigratedV1: false
    }));
    const second = readConfig();
    assert.equal(second.mcpDefaults[secretEntry.id].enabled, true,
      'a second readConfig() must not re-run the migration — the in-process latch, not the on-disk flag, is what holds');
  } finally {
    userData = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── D-28: cross-agent isolation, and the fail-closed grant order ────────────

test('mcpGrantKey keys per agent-server pair: distinct refs, and revoking one agent leaves the other intact', (t) => {
  freshUserData(t);
  const secretEntry = MCP_CATALOG.find((e) => e.tier === 'secret');
  const refA = secretRefFor(mcpGrantKey('agent-a', secretEntry.id));
  const refB = secretRefFor(mcpGrantKey('agent-b', secretEntry.id));
  assert.notEqual(refA, refB, 'the SAME server granted to two DIFFERENT agents must key differently');
  assert.ok(refA.startsWith('int:' + MCP_GRANT_PREFIX) && refB.startsWith('int:' + MCP_GRANT_PREFIX));

  assert.equal(mainIntegrations.setSecret(refA, 'tok-a').ok, true);
  assert.equal(mainIntegrations.setSecret(refB, 'tok-b').ok, true);
  assert.equal(mainIntegrations.hasSecret(refA), true);
  assert.equal(mainIntegrations.hasSecret(refB), true);

  mainIntegrations.deleteSecret(refA);
  assert.equal(mainIntegrations.hasSecret(refA), false, 'agent A\'s grant was revoked');
  assert.equal(mainIntegrations.hasSecret(refB), true, 'agent B\'s grant must survive — D-28 cross-agent isolation');
});

test('the fail-closed grant order mcp:grant is built on: an unavailable safeStorage refuses the secret, and no grant may be written on that refusal', (t) => {
  // src/main/index.ts's ipcMain handlers are not loadable under node --test —
  // no test file in this repo does, because module load pulls in the whole
  // Electron main-process surface (BrowserWindow, autoUpdater, …) at module
  // scope. This proves the fail-closed PRIMITIVE 'mcp:grant' composes,
  // unconditionally, in that exact order (setSecret first; a { ok:false }
  // from it is returned as-is and the grant write never runs) — verified by
  // reading src/main/index.ts's 'mcp:grant' handler alongside this test.
  freshUserData(t);
  const secretEntry = MCP_CATALOG.find((e) => e.tier === 'secret');

  const original = require.cache[electron].exports.safeStorage.isEncryptionAvailable;
  require.cache[electron].exports.safeStorage.isEncryptionAvailable = () => false;
  t.after(() => { require.cache[electron].exports.safeStorage.isEncryptionAvailable = original; });

  const ref = secretRefFor(mcpGrantKey('agent-x', secretEntry.id));
  const result = mainIntegrations.setSecret(ref, 'tok-x');
  assert.equal(result.ok, false, 'an unavailable safeStorage must refuse the secret rather than write plaintext');

  // Because setSecret failed, mcp:grant's own order never reaches writeConfig
  // — no grant for this pair exists.
  assert.equal(readConfig().mcpAgentGrants?.['agent-x']?.[secretEntry.id]?.enabled, undefined);

  // And end-to-end: no grant + no resolvable secret arms nothing (D-28).
  const servers = buildDefaultMcpServers('/cwd', { [secretEntry.id]: { enabled: true } }, { secretFor: () => undefined });
  assert.ok(!(`hellomarkx-${secretEntry.id}` in servers));
});

// ── The probe script never reaches for `claude mcp list` (mirrors task 1) ───

test('scripts/mcp-live-probe.cjs never invokes `claude mcp list`, and does drive --mcp-config', () => {
  const probePath = path.join(__dirname, '..', 'scripts', 'mcp-live-probe.cjs');
  assert.equal(fs.existsSync(probePath), true, 'sanity: the probe script must exist');
  const raw = fs.readFileSync(probePath, 'utf8');
  // Strip `//` to end-of-line UNANCHORED (a trailing warning comment must be
  // stripped too, not just a whole-line header) plus `^\s*\*` JSDoc lines,
  // join, squeeze whitespace — mirrors task 1's own criterion exactly.
  const stripped = raw
    .split('\n')
    .map((line) => line.replace(/^[ \t]*\*.*$/, ''))
    .join('\n')
    .replace(/\/\/.*$/gm, '')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/[ \t]+/g, ' ');
  const invocationMatches = stripped.match(/mcp list|['"]mcp['"] ?, ?['"]list['"]/g) || [];
  assert.equal(invocationMatches.length, 0, 'the probe must never invoke `claude mcp list`');
  const mcpConfigMatches = raw.match(/--mcp-config/g) || [];
  assert.ok(mcpConfigMatches.length >= 1, 'the probe must actually drive --mcp-config');
});

// ── MAIN-02: the agentId reaching a filesystem path is RENDERER-supplied ─────
//
// `mcp:agentState` takes the agent id straight from the renderer — the
// less-trusted side of that boundary by design — and it reached
// `hive.mcpArmed(agentId)` → `join(root, 'agents', agentId, 'mcp.json')` with
// a shape check (`typeof agentId === 'string'`) and NO membership check. A
// shape check is not a membership check: `../agents/<other>` is a perfectly
// good string. The primitive is bounded (it discloses the `mcpServers` KEY
// NAMES of whatever JSON it lands on, not file contents) but it is a
// traversal read all the same, so the guard belongs at the path-construction
// site where every caller routes through it.

test('mcpArmed refuses an agentId the live registry never issued, including traversal ids that normalize onto a real agent dir', async (t) => {
  const home = tmpHome('md-mcp-g-');
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);

  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });
  assert.ok(hive.mcpArmed('a1').length > 0, 'sanity: a REGISTERED agent still reads back its own armed bundle');

  // Each of these join()s down to exactly <hiveRoot>/agents/a1/mcp.json — the
  // same file, reached through an id the registry never issued.
  for (const id of ['../agents/a1', 'a1/../a1', './a1', '../../hive/agents/a1']) {
    assert.deepEqual(hive.mcpArmed(id), [],
      `a traversal id (${JSON.stringify(id)}) read a real agent dir — validate against the registry BEFORE building the path`);
  }

  // A directory that exists on disk but is not in the registry is refused too:
  // registry membership, not dir existence, is the authority.
  fs.mkdirSync(path.join(home, 'hive', 'agents', 'ghost'), { recursive: true });
  fs.writeFileSync(path.join(home, 'hive', 'agents', 'ghost', 'mcp.json'),
    JSON.stringify({ mcpServers: { 'hellomarkx-leak': {} } }), 'utf8');
  assert.deepEqual(hive.mcpArmed('ghost'), [], 'an unregistered agent dir must not be readable through this channel');
});

test('mcpArmed answers [] rather than THROWING when there is no harness home', () => {
  // `agentDir` is `join(this.root()!, ...)` and the non-null assertion is a
  // compile-time fiction: with harnessHome null (the shipped default until the
  // operator picks a hive) `join(null, …)` throws a TypeError, and mcp:agentState
  // is a SYNC ipcMain handler — so the throw crossed IPC as a rejected invoke.
  const hive = new HiveManager(() => null);
  assert.deepEqual(hive.mcpArmed('a1'), []);
});

/* ───────────────── MAIN-02: the agentId guard is a SHAPE guard ─────────────────
 *
 * History, because it is the point of these cases. The first MAIN-02 fix guarded
 * `mcp:agentState` with `hive.registry().agents[agentId]` and returned
 * `{ok:false, error:'unknown agent'}` on a miss. That closed the traversal but
 * broke DAEMON-04: `hive.registry()` is NOT the agent roster (`spawnAgentCore`
 * only calls `hive.ensureAgent` under `if (opts.hive && hive.enabled())`, and its
 * missing-CLI installer rung returns before even that), so the consent modal
 * rendered a load error for every real non-hive agent.
 *
 * The pin that guarded it was itself vacuous: it asserted the SUBSTRING
 * `registry().agents[agentId]` appeared before path construction, which a mere
 * `registry().agents[agentId]?.provider` lookup also satisfies. It passed while
 * pinning nothing. Both cases below are behavioural instead. */

test('MAIN-02: isSafeAgentId refuses every traversal and separator shape, and accepts every id uniqueId() can emit', () => {
  const { isSafeAgentId } = loadTs('src/shared/mcpCatalog.ts');

  // Must be REFUSED — each of these is a plausible renderer-supplied attack shape.
  // '../agents/a1' is not hypothetical: it was MEASURED returning another agent's
  // armed server list before any guard existed.
  for (const bad of [
    '../agents/a1', '..', '../..', 'a/../../b', 'pty-a/../pty-b',
    'a/b', 'a\\b', '/etc/passwd', 'C:\\Windows', '.\\x', './x',
    '', 'a\u0000b', 'a b', 'a\nb', 'x'.repeat(129),
    null, undefined, 42, {}, [],
  ]) {
    assert.equal(isSafeAgentId(bad), false, `must refuse ${JSON.stringify(bad)}`);
  }

  // Must be ACCEPTED — a guard that rejects a legitimate id is the DAEMON-04 break.
  // `uniqueId(name)` emits `${slug}-${Date.now().toString(36)}` and the caller
  // prefixes `pty-`, so the real charset is [a-z0-9-]; the rest are defensive.
  for (const good of [
    'pty-researcher-m4k2p1', 'pty-a-0', 'a', 'A', '0',
    'pty-my-agent-name-abc123', 'agent_1', 'agent.1', 'x'.repeat(128),
  ]) {
    assert.equal(isSafeAgentId(good), true, `must accept ${JSON.stringify(good)}`);
  }
});

test('MAIN-02: all three MCP handlers gate agentId on isSafeAgentId, and none hard-rejects an unknown agent', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');

  for (const channel of ['mcp:agentState', 'mcp:grant', 'mcp:revoke']) {
    const start = src.indexOf(`ipcMain.handle('${channel}'`);
    assert.ok(start > 0, `sanity: the ${channel} handler must exist`);
    const body = src.slice(start, start + 1200);
    assert.ok(/isSafeAgentId\(/.test(body),
      `${channel} takes a renderer-supplied agentId that selects a secret namespace and a `
      + 'filesystem path — it must gate on isSafeAgentId. Guarding only one of the three '
      + 'handlers is what the first MAIN-02 fix did.');
  }

  // The regression itself: a registry MISS must not be an error. If this string
  // comes back, the DAEMON-04 consent modal is broken for non-hive agents again.
  const stateStart = src.indexOf("ipcMain.handle('mcp:agentState'");
  const stateBody = src.slice(stateStart, src.indexOf("ipcMain.handle('mcp:grant'", stateStart));
  assert.ok(!/'unknown agent'/.test(stateBody),
    "mcp:agentState must NOT reject an id the hive registry does not know — a non-hive agent "
    + 'is a real, working agent with no hive dir, and mcpArmed() already answers [] for it. '
    + 'Rejecting it renders a load error in McpConsentModal for every such agent.');
});
