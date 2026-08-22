'use strict';

/**
 * The three platform-conditional early exits this repo REALLY SHIPPED, verbatim
 * from the pre-fix blobs. Input to clause 2 of `test/suite-integrity.test.cjs`:
 * a scanner demonstrated only against a fixture written to suit it has been seen
 * finding what its author already knew how to write.
 *
 *   git show 434e5fd^:test/net-binding.test.cjs             :897-900
 *   git show a588667^:test/transcript-project-dir.test.cjs  :122
 *   git show a588667^:test/win-cmd-shim.test.cjs            :167
 *
 * They live OUT of `test/*.test.cjs` on purpose. Held inline in the test file
 * they would be found by its own sweep — correctly, since they are the defect —
 * and the only fixes would be to exclude that file from its own corpus (a
 * permanent blind spot in the one file whose job is to have none) or to mangle
 * the shapes until they stop being verbatim. Neither is worth a directory.
 *
 * Not a `.test.cjs`, so the runner's glob never collects it.
 */

module.exports = {
  // Polarity A — skips on win32, block form, and it even LOGS. A message on
  // stderr is not a skip: the runner never hears it and the case counts as PASS.
  'net-binding.test.cjs (fixed by 01-24)': [
    "test('deleting the hook socket no longer opens the gate until the app restarts', async (t) => {",
    "  if (process.platform === 'win32') {",
    "    console.error('[net-binding] socket watchdog case skipped — win32 named pipes have no file to unlink');",
    '    return;',
    '  }',
    '});'
  ].join('\n'),

  // Polarity B — skips OFF win32, one-line braceless form, mid-callback. The
  // half above it runs everywhere, so the case reports `ok` on POSIX with this
  // half never executed.
  'transcript-project-dir.test.cjs (fixed by 01-30)': [
    "test('the legacy spelling loses to the current one', () => {",
    "  if (process.platform !== 'win32') return;",
    '  withHome((_home, mkProject) => {',
    "    mkProject('Users-me-app');",
    '  });',
    '});'
  ].join('\n'),

  // Polarity A again, one-line braceless, carrying a trailing comment that
  // claims exactly the guarantee the case does not deliver.
  'win-cmd-shim.test.cjs (fixed by 01-30)': [
    "test('the win32 branch is genuinely platform-gated', () => {",
    '  const mgr = new PtyManager();',
    "  const probe = mgr['resolveWindowsShimSpawn'].bind(mgr);",
    "  if (process.platform === 'win32') return; // the guard under test is the negative one",
    '  assert.equal(probe(SHIM), null);',
    '});'
  ].join('\n'),

  // The landed fix, in both runner-counted spellings. Clause 2 asserts the sweep
  // reads this as CLEAN — a scanner that reddened the fix would be uninstallable.
  FIXED: [
    "test('a', { skip: process.platform === 'win32' && 'why' }, () => {});",
    "test('b', async (t) => {",
    "  if (process.platform !== 'win32') { t.skip('why'); return; }",
    '});'
  ].join('\n')
};
