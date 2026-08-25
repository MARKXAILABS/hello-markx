'use strict';

/**
 * SCALE-01 / D-12 — the mission-stamp store follows `harnessHome`, and
 * `repointFiredStore()` is what makes that true at the ONE transition that does
 * not relaunch.
 *
 * Why a real SQLite driver and not `config-secrets.test.cjs`'s stand-in: that
 * file injects a driver whose `exec()` does nothing and whose constructor never
 * touches the filesystem, so `harness.db` is never created anywhere and "the
 * stamps went to the right FILE" is unobservable through it. The whole defect
 * class here is a path, so the file has to be real.
 *
 * The bug being pinned: onboarding sets `harnessHome` through `config:update`,
 * which does NOT relaunch. `config.ts` memoizes its `PersistStore` handle in a
 * module-level `firedDb`, so without an explicit repoint that handle stays bound
 * to the pre-onboarding userData file forever — and `missionLastFiredAt` for
 * project B is then read from, and written to, project A's database. A mission
 * that already fired in the other project looks fired here and never runs.
 *
 * Executed, not grepped: round-4's lesson was four separate "the feature exists
 * and does nothing" defects, every one of which passed a structural check.
 */

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Database = require('better-sqlite3');
new Database(':memory:').close(); // throws here if the native module is unusable — intended

const made = [];
function tempDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-fired-')));
  made.push(dir);
  return dir;
}
after(() => {
  for (const dir of made) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

// `app.getPath('userData')` decides config.json's location AND, before
// onboarding, harness.db's. Reassignable so each test gets a clean one.
let userData = tempDir();
const electronId = require.resolve('electron');
require.cache[electronId] = {
  id: electronId,
  filename: electronId,
  loaded: true,
  exports: {
    app: { getPath: () => userData },
    // config.ts pulls the secret store, which reaches for safeStorage. Off =
    // secrets stay in config.json, which is irrelevant here and keeps this file
    // to the one thing it is about.
    safeStorage: {
      isEncryptionAvailable: () => false,
      encryptString: (s) => Buffer.from(s, 'utf8'),
      decryptString: (b) => b.toString('utf8')
    }
  }
};

const loadTs = require('./load-ts.cjs');
const { readConfig, writeConfig, repointFiredStore } = loadTs('src/main/config.ts');

/** The kv the scheduler actually reads, straight off the file on disk. */
function stampsAt(dbFile) {
  if (!fs.existsSync(dbFile)) return null;
  const raw = new Database(dbFile, { readonly: true });
  try {
    const row = raw.prepare('SELECT value FROM kv WHERE key = ?').get('missionLastFiredAt');
    return row ? JSON.parse(row.value) : null;
  } finally {
    raw.close();
  }
}

const MISSION = { id: 'm-scale01', name: 'nightly', prompt: 'go', cron: '0 3 * * *', enabled: true };

/** A clean userData AND a clean module state. `firedDb` is memoized at module
 *  scope and both tests share one process, so without dropping it here test 2
 *  would inherit test 1's already-open handle — which is the very carryover it
 *  is trying to observe. This is the only legitimate use of the function
 *  outside its production call site. */
function freshUserData() {
  repointFiredStore();
  userData = tempDir();
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ harnessHome: null }), 'utf8');
}

test('readConfig() does not recurse when the fired store resolves harnessHome through it', () => {
  freshUserData();
  // `getHome` is `() => readConfig().harnessHome`, so opening the fired store
  // re-enters readConfig(). A RangeError here means the `firedDb = null` guard
  // that terminates that re-entry was moved or removed.
  writeConfig({ missions: [{ ...MISSION, lastFiredAt: 111 }] });
  assert.equal(readConfig().missions[0].lastFiredAt, 111, 'the stamp did not survive a write/read round-trip');
});

test('the stamps follow harnessHome, and only repointFiredStore() gets them there', () => {
  freshUserData();
  const home = tempDir();
  const preOnboarding = path.join(userData, 'harness.db');
  const projectDb = path.join(home, 'harness.db');

  // ── before onboarding: harnessHome is null, so the stamps land in userData ──
  writeConfig({ missions: [{ ...MISSION, lastFiredAt: 1000 }] });
  assert.deepEqual(
    stampsAt(preOnboarding), { 'm-scale01': 1000 },
    'the pre-onboarding stamp is not in the userData DB — this test would be asserting nothing'
  );

  // ── onboarding sets harnessHome, WITHOUT a repoint ──────────────────────────
  writeConfig({ harnessHome: home, missions: [{ ...MISSION, lastFiredAt: 2000 }] });
  assert.equal(
    stampsAt(projectDb), null,
    'the project DB already has the stamps without a repoint. Either the handle stopped being '
    + 'memoized or something else repoints it — if this stops being true, repointFiredStore() is '
    + 'dead weight and the rest of this test proves nothing'
  );
  assert.deepEqual(
    stampsAt(preOnboarding), { 'm-scale01': 2000 },
    'the stale handle is not writing to the pre-onboarding DB either — the D-12 bug this pins is '
    + 'not being reproduced, so the assertion below is vacuous'
  );

  // ── the repoint ─────────────────────────────────────────────────────────────
  repointFiredStore();
  writeConfig({ missions: [{ ...MISSION, lastFiredAt: 3000 }] });

  assert.deepEqual(
    stampsAt(projectDb), { 'm-scale01': 3000 },
    'after repointFiredStore() the mission stamps are STILL not in the project\'s own database. '
    + 'Every project on this machine shares one missionLastFiredAt, so a mission that fired in '
    + 'another project reads as already-fired here and silently never runs'
  );
  assert.deepEqual(
    stampsAt(preOnboarding), { 'm-scale01': 2000 },
    'the pre-onboarding DB was written again after the repoint — the old handle is still live'
  );
  assert.equal(
    readConfig().missions[0].lastFiredAt, 3000,
    'readConfig() no longer overlays the stamps back onto the mission after a repoint'
  );
});
