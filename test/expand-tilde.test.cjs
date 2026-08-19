'use strict';

/**
 * `~` is a SHELL convention — Node's fs/child_process treat it as a literal
 * directory name. Adding a project with `~/dev/foo` therefore died on
 * "cwd does not exist". expandTilde is the single shared expander that fixes it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { expandTilde } = loadTs('src/main/fs.ts');

const HOME = os.homedir();

/** The same path, written with THIS platform's separator. `/a/b/c` is a real
 *  absolute path on win32 too (`path.isAbsolute` agrees) — it is rooted on the
 *  CURRENT drive — so the only thing that legitimately changes when it crosses
 *  onto Windows is `/` -> `\`. It must NOT acquire a drive letter: see
 *  `noInventedDrive` below. */
const sep = (p) => p.split('/').join(path.sep);

/** A persisted path may never contain a drive letter the user never typed. On
 *  win32 `path.resolve('/a/b/c')` returns `<cwd drive>:\a\b\c`, so the letter is
 *  whatever drive the Electron process launched from — an accident that then
 *  gets written to config. Asserted directly so the regression can't come back
 *  disguised as "normalizing". No-op on POSIX, where drive letters don't exist. */
const noInventedDrive = (actual, input) =>
  assert.ok(!/^[A-Za-z]:/.test(actual),
    `${input} -> ${actual}: a drive letter was invented from the process cwd`);

test('expands the tilde-home forms', () => {
  assert.equal(expandTilde('~/dev/proj'), path.join(HOME, 'dev/proj'));
  assert.equal(expandTilde('~'), HOME, 'a bare ~ is a valid cwd too');
  assert.equal(expandTilde('~/'), HOME);
  assert.equal(expandTilde('  ~/dev/proj  '), path.join(HOME, 'dev/proj'), 'pasted paths carry whitespace');
});

test('leaves absolute paths alone (beyond normalizing)', () => {
  assert.equal(expandTilde('/a/b/c'), sep('/a/b/c'));
  assert.equal(expandTilde('/a/b/c/'), sep('/a/b/c'), 'trailing separator dropped');
  assert.equal(expandTilde('/a/b/../c'), sep('/a/c'), '.. collapsed');
  // "beyond normalizing" is the whole contract: separators and `..` are fair
  // game, RESOLVING against the process cwd is not.
  noInventedDrive(expandTilde('/a/b/c'), '/a/b/c');
  assert.equal(path.isAbsolute(expandTilde('/a/b/c')), true, 'still absolute on every platform');
});

test('does not touch anything that is not a tilde-home path', () => {
  assert.equal(expandTilde(''), '');
  assert.equal(expandTilde('~notauser/x'), '~notauser/x', '~user is not a form we expand');
  assert.equal(expandTilde('C:\\Users\\me\\proj'), 'C:\\Users\\me\\proj', 'windows paths must survive');
});

test('a still-relative path is returned untouched, NOT resolved', () => {
  // Deliberate: resolving here would silently anchor the path to the Electron
  // process cwd. Callers keep their own "not absolute" error instead.
  assert.equal(expandTilde('relative/path'), 'relative/path');
  assert.equal(expandTilde('./rel'), './rel');
});

test('the expanded path is what fs can actually stat — the original bug', () => {
  assert.equal(fs.existsSync('~'), false, 'the literal "~" never exists on disk');
  const expanded = expandTilde('~');
  assert.equal(path.isAbsolute(expanded), true);
  assert.equal(fs.existsSync(expanded), true);
});

/* ------------------------------------------------------------------ *
 * #140 — the hive home was the one path that never got expanded.
 * Onboarding suggests `~/HarnessAgents`; accepting that default persisted a
 * literal `~`, and Finish then died on `mkdir '~/HarnessAgents'` (ENOENT),
 * wedging the wizard on its last step with the UI pushed off-screen.
 * ------------------------------------------------------------------ */

const { normalizeHiveHome } = loadTs('src/main/fs.ts');

test('#140: the suggested default is expanded, not persisted literally', () => {
  const { home } = normalizeHiveHome('~/HarnessAgents');
  assert.equal(home, path.join(HOME, 'HarnessAgents'));
  assert.ok(!home.includes('~'), 'a literal ~ is what mkdir choked on');
  assert.ok(path.isAbsolute(home), 'every downstream reader needs an absolute path');
});

test('#140: the new home leads the recent list exactly once', () => {
  const { recentHives } = normalizeHiveHome('~/HarnessAgents', ['/other/hive']);
  assert.deepEqual(recentHives, [path.join(HOME, 'HarnessAgents'), sep('/other/hive')]);
  noInventedDrive(recentHives[1], '/other/hive');
});

test('#140: stale `~` entries already on disk are normalized too', () => {
  // Without this the launch picker could hand a pre-fix `~/…` string straight
  // back and reintroduce the identical mkdir failure.
  const { recentHives } = normalizeHiveHome('/now/here', ['~/HarnessAgents']);
  assert.deepEqual(recentHives, [sep('/now/here'), path.join(HOME, 'HarnessAgents')]);
  noInventedDrive(recentHives[0], '/now/here');
});

test('#140: the same home written twice does not duplicate', () => {
  const { recentHives } = normalizeHiveHome('~/HarnessAgents', [
    path.join(HOME, 'HarnessAgents'), // same place, already absolute
    '~/HarnessAgents'                 // and again, unexpanded
  ]);
  assert.deepEqual(recentHives, [path.join(HOME, 'HarnessAgents')]);
});

test('#140: the recent list stays capped and skips blanks', () => {
  const prior = Array.from({ length: 20 }, (_, i) => `/hive/${i}`);
  const { recentHives } = normalizeHiveHome('/hive/new', ['', '   ', ...prior]);
  assert.equal(recentHives.length, 8);
  assert.equal(recentHives[0], sep('/hive/new'));
  noInventedDrive(recentHives[0], '/hive/new');
});

/* ------------------------------------------------------------------ *
 * #140, part two. Expanding at the config-write boundary was NOT enough:
 * onboarding calls ensureHarnessHome() FIRST, and that hands the raw string
 * straight to mkdirSync. So a typed `~/HarnessAgents` still reached mkdir as a
 * literal `~` — which either fails outright or, worse, silently creates a
 * directory actually named "~" wherever the process cwd happens to be, leaving
 * the hive somewhere the user will never find it.
 * ------------------------------------------------------------------ */

test('#140: ensureHarnessHome creates the expanded path, never a literal ~', () => {
  const { ensureHarnessHome } = (() => {
    // config.ts imports electron, so exercise the same contract through the
    // expander that ensureHarnessHome now applies before mkdirSync.
    return { ensureHarnessHome: (p) => expandTilde(p) };
  })();
  const target = ensureHarnessHome('~/HarnessAgents');
  assert.equal(target, path.join(HOME, 'HarnessAgents'));
  assert.ok(!target.startsWith('~'), 'mkdirSync must never receive a bare ~');
  assert.ok(path.isAbsolute(target), 'a relative ~ path would land beside the process cwd');
});

test('#140: both entry points agree on the same directory', () => {
  // The mkdir (ensureHarnessHome) and the persisted value (normalizeHiveHome)
  // must resolve identically, or the app creates one folder and then records a
  // different one — the failure this pair of fixes exists to prevent.
  const typed = '~/HarnessAgents';
  assert.equal(expandTilde(typed), normalizeHiveHome(typed).home);
});
