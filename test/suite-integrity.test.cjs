'use strict';

/**
 * SUITE INTEGRITY — the tests that guard the tests.
 *
 * This phase exists to remove "a green tick that overstates reality", and the
 * purest form of that defect lives in the test suite itself:
 *
 *   `node:test` counts a callback that RETURNS NORMALLY as a **PASS**.
 *
 * So `if (process.platform === 'win32') return;` at the top of a test callback
 * reports `ok` on Windows having executed not one assertion. It is
 * indistinguishable, from the TAP counters and from the exit code, from a case
 * that ran and asserted. Three such cases shipped in this repo and were fixed by
 * hand — `test/net-binding.test.cjs` and `test/transcript-project-dir.test.cjs`
 * (plan 01-24 / 01-30) and `test/win-cmd-shim.test.cjs` (plan 01-30). Nothing
 * stopped a fourth, and the fix for each was a human noticing.
 *
 * The correct form is the RUNNER'S skip, in one of two shapes, because only
 * those move the case out of `# pass` and into `# skipped`:
 *   - the declared option:  test('...', { skip: <cond> && 'why' }, fn)
 *   - the runtime call:     t.skip('why'); return;
 *
 * Clause 1 sweeps for the defect. Clause 2 proves clause 1 can actually fail, by
 * running the same scanner over the three shapes this repo REALLY SHIPPED, taken
 * verbatim from the pre-fix blobs (`git show 434e5fd^`, `git show a588667^`).
 * Both polarities are represented — `=== 'win32'` and `!== 'win32'` — because a
 * sweep that only knows one of them is half a sweep.
 *
 * Clause 3 is the skip census: `01-VALIDATION.md` freezes `# skipped` and
 * nothing in `.github/workflows/ci.yml` reads that counter, so an unannounced
 * ceiling move is invisible to every gate. This clause is the announcement
 * mechanism — add a platform-gated skip and it goes red until the frozen census
 * below is updated and 01-VALIDATION.md says why.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

/** Comments are prose, not code: a defect quoted inside a `//` block (as three
 *  of them now are, in the very files that were fixed) must not read as a hit. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Every identifier in `src` bound to an expression mentioning `process.platform`
 * — `const POSIX = process.platform !== 'win32'`, `const WIN = ...`. Without
 * this the sweep sees only the literal spelling and a one-line alias defeats it.
 */
function platformGuardNames(src) {
  const names = new Set(['process.platform']);
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*process\.platform[^;\n]*/g;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return [...names];
}

/**
 * Platform-conditional early exits that never tell the runner, in `src`.
 *
 * Deliberately a LINE scanner over the stripped source rather than a parser: the
 * shape being hunted is a one- or two-line `if` at the top of a callback, and a
 * TypeScript/acorn dependency for that would be a bigger surface than the thing
 * it guards. The window is bounded at 12 lines and closes on brace balance, so a
 * long `if` body cannot swallow an unrelated `return` far below it.
 */
function unannouncedExits(src) {
  const stripped = stripComments(src);
  const lines = stripped.split(/\r?\n/);
  const names = platformGuardNames(stripped);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\bif\s*\(/.test(lines[i])) continue;
    if (!names.some((n) => lines[i].includes(n))) continue;
    let depth = 0;
    let started = false;
    let window = '';
    for (let j = i; j < lines.length && j < i + 12; j++) {
      window += lines[j] + '\n';
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; }
      }
      if (started && depth <= 0) break;
      if (!started && /;\s*$/.test(lines[j])) break;
    }
    if (!/\breturn\b/.test(window)) continue;
    // `.skip(` covers both `t.skip(...)` and any other context spelling. This is
    // the ONLY thing that turns the early exit into a counted skip.
    if (/\.skip\s*\(/.test(window)) continue;
    hits.push({ line: i + 1, text: lines[i].trim().slice(0, 130) });
  }
  return hits;
}

/** Files driven by the real runner. A hand-rolled harness sets its own exit code
 *  and is covered instead by repo-claims' poisoned-assert probe. */
const runnerFiles = fs
  .readdirSync(path.join(root, 'test'))
  .filter((n) => n.endsWith('.test.cjs'))
  .map((n) => `test/${n}`)
  .filter((rel) => /require\('node:test'\)/.test(fs.readFileSync(path.join(root, rel), 'utf8')));

// ─── clause 1: the sweep ─────────────────────────────────────────────────────

test('no platform-gated case leaves a test callback without telling the runner', () => {
  assert.ok(
    runnerFiles.length > 40,
    `only ${runnerFiles.length} node:test files were collected — the walker has lost the suite, `
      + 'and an empty corpus would make every clause below pass vacuously'
  );

  const offenders = [];
  for (const rel of runnerFiles) {
    for (const hit of unannouncedExits(fs.readFileSync(path.join(root, rel), 'utf8'))) {
      offenders.push(`${rel}:${hit.line}  ${hit.text}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'a platform-conditional `return` has come back into a test callback. node:test counts a '
      + 'callback that returns normally as a PASS, so each of these reports `ok` on the platform '
      + 'it skips while executing not one assertion — a non-run laundered as coverage:\n'
      + offenders.map((o) => `  ${o}`).join('\n')
      + '\nFix by handing the decision to the runner: `t.skip(\'why\'); return;` for a runtime '
      + 'condition, or `test(\'...\', { skip: <cond> && \'why\' }, fn)` for a platform one. Then '
      + 'update the census in clause 3 and the frozen ceiling in 01-VALIDATION.md.'
  );
});

// ─── clause 2: the sweep has been SEEN failing ───────────────────────────────

const SHIPPED = require('./fixtures/shipped-unannounced-exits.cjs');

test('the sweep has been SEEN failing: the same scanner, against the three shipped defects', () => {
  const { FIXED, ...defects } = SHIPPED;

  assert.equal(
    Object.keys(defects).length,
    3,
    'the shipped-defect fixture has lost members — clause 1 is only as strong as the shapes this '
      + 'clause proves the scanner can still see'
  );

  for (const [label, src] of Object.entries(defects)) {
    const hits = unannouncedExits(src);
    assert.equal(
      hits.length,
      1,
      `the scanner found ${hits.length} early exits in the pre-fix ${label}, expected exactly 1. `
        + 'A scanner that cannot see the defect the tree really shipped is a permanently-green '
        + 'clause 1, not a clean tree.'
    );
  }

  // Both polarities, named: a sweep that only knows `=== win32` is half a sweep,
  // and the repo shipped one of each.
  assert.ok(
    Object.values(defects).some((s) => s.includes("=== 'win32'"))
      && Object.values(defects).some((s) => s.includes("!== 'win32'")),
    'the fixtures no longer cover both polarities'
  );

  // The CONVERSE: the landed fix must read clean, or clause 1 would be red for
  // the fixed shape and the sweep would be uninstallable.
  assert.deepEqual(
    unannouncedExits(FIXED),
    [],
    'the sweep reddens the runner-counted form it is supposed to require'
  );
});

// ─── clause 3: the skip census ───────────────────────────────────────────────

/**
 * Every DECLARED conditional skip in the suite, frozen. These are the
 * deterministic members of `# skipped` — given a platform, each one's outcome is
 * decided before a single line runs, so the platform's skip floor is derivable
 * from this table alone.
 *
 * `winSkips: true`  — the case skips ON win32 and runs on POSIX
 * `winSkips: false` — the case skips OFF win32 and runs on win32
 *
 * The runtime `t.skip(...)` sites are deliberately NOT in this table: they are
 * host-conditional (elevation, 8.3 generation, a free drive letter, admin
 * rights) and their count is a property of the machine, not of the tree. That is
 * exactly why 01-VALIDATION.md's ceiling is a `<=` and never a `>=`.
 */
const DECLARED_SKIPS = [
  { file: 'test/hive-hook-node.test.cjs', winSkips: true, title: 'a hook fires with NO node on PATH, and its payload reaches HIVE_SOCK' },
  { file: 'test/hive-runtime-path.test.cjs', winSkips: true, title: '`node` resolves and RUNS with no node on PATH — the whole point' },
  { file: 'test/hook-auth-roundtrip.test.cjs', winSkips: true, title: 'the real shim authenticates to the real hook server' },
  { file: 'test/hook-auth-roundtrip.test.cjs', winSkips: true, title: 'a shim with no token is still rejected' },
  { file: 'test/net-binding.test.cjs', winSkips: true, title: 'deleting the hook socket no longer opens the gate until the app restarts' },
  { file: 'test/win-cmd-shim.test.cjs', winSkips: true, title: 'the win32 branch is genuinely platform-gated' },
  { file: 'test/transcript-project-dir.test.cjs', winSkips: false, title: 'the POSIX legacy spelling stays inert on win32, even as the only directory present' }
];

/**
 * String literals, blanked. The census token below is a common thing to NAME in
 * an assertion message — this file names it several times — and prose about the
 * option is not the option, exactly as a commented-out line is not code. Without
 * this, any file that explains the census would be counted by it, and this file
 * would have to exclude itself from its own corpus to stay green.
 */
function stripLiterals(src) {
  return src
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\[\s\S])*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\[\s\S])*"/g, '""');
}

/** Count of declared runner-skip options actually present in the tree, per file. */
function declaredSkipCount(rel) {
  const src = stripLiterals(stripComments(fs.readFileSync(path.join(root, rel), 'utf8')));
  return (src.match(/\bskip:\s*(?!false\b)/g) ?? []).length;
}

test('the declared conditional-skip census matches the tree, file for file', () => {
  const expected = new Map();
  for (const row of DECLARED_SKIPS) expected.set(row.file, (expected.get(row.file) ?? 0) + 1);

  const actual = new Map();
  for (const rel of runnerFiles) {
    const n = declaredSkipCount(rel);
    if (n > 0) actual.set(rel, n);
  }

  assert.deepEqual(
    Object.fromEntries([...actual].sort()),
    Object.fromEntries([...expected].sort()),
    'the declared conditional-skip surface has moved. 01-VALIDATION.md freezes `# skipped` and '
      + 'NOTHING in .github/workflows/ci.yml reads that counter — `npm test` exits 0 however many '
      + 'cases skip — so this clause is the only thing standing between the suite and an '
      + 'unannounced ceiling move. Update DECLARED_SKIPS here AND the frozen ceiling in '
      + '.planning/phases/01-finish-the-floor/01-VALIDATION.md, naming the new member by title '
      + 'and saying whether it is a relabelled non-run or genuinely skipped work.'
  );
});

test('the deterministic skip floor for this platform is what 01-VALIDATION.md derives', () => {
  const win = process.platform === 'win32';
  const floor = DECLARED_SKIPS.filter((r) => r.winSkips === win).length;

  // 01-VALIDATION.md's arithmetic: `skip = 4 + 2 + 1 = 7` on win32, where the 1
  // is the EPERM environment skip that does NOT appear on a host with symlink
  // permission. 4 + 2 is exactly the declared floor this clause derives, so a
  // win32 host reads 6 deterministic + 0-or-1 environmental, and the published
  // `<= 7` holds with the environment distinction preserved.
  const FROZEN = { win32: 6, other: 1 };
  const want = win ? FROZEN.win32 : FROZEN.other;

  assert.equal(
    floor,
    want,
    `${floor} declared skips fire on ${process.platform}, but 01-VALIDATION.md's ceiling is `
      + `derived from ${want}. On win32 the published identity is 4 (the frozen four, !POSIX) + 2 `
      + '(the 01-24 and 01-30 conversions) = 6 deterministic, plus at most 1 environment skip '
      + '(EPERM on fs.symlinkSync) = the frozen `# skipped <= 7`. If this number moved, the '
      + 'published ceiling is now wrong and must be re-derived, not re-typed.'
  );

  // The POSIX floor is 1 and 01-VALIDATION.md deliberately does NOT freeze a
  // POSIX total: the runtime t.skip sites in net-binding invert their polarity
  // there, so the total is higher than 7 and no POSIX host ran in the session
  // that froze it. Asserting a number nobody measured is the defect this file
  // exists to catch, so this clause asserts only the DETERMINISTIC part.
  assert.ok(
    DECLARED_SKIPS.filter((r) => !r.winSkips).length >= 1,
    'the win32-running / POSIX-skipping polarity has vanished from the suite. A census that only '
      + 'knows one polarity cannot see a conversion made in the other direction'
  );
});
