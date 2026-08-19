'use strict';

/**
 * The regression guard for #7: eight test files sat in test/ for months without
 * ever running, because `test:focused` hand-lists the files it runs and nobody
 * remembers to append to a 33-entry string. `npm test` now uses a glob, and this
 * file is what stops the hand-list from creeping back — if a new *.test.cjs is
 * not covered by the `test` script's pattern, this test fails, in CI, on the PR
 * that added it.
 *
 * It also pins the Node story (`engines` + `.nvmrc`), because "works on my Node"
 * is the other way this repo's build has broken: Node 24 has no better-sqlite3
 * prebuild and breaks node-pty's winpty gyp build.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

// The only wildcard form this repo uses is a `*` inside one path segment
// (`test/*.test.cjs`). Node expands these itself, which is why the script works
// from cmd.exe on Windows too — so match the same shape here rather than
// shelling out.
function globToRegExp(pattern) {
  const escaped = pattern
    .split('*')
    .map((chunk) => chunk.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/\\\\]*');
  return new RegExp(`^${escaped}$`);
}

function testScriptPatterns() {
  assert.ok(pkg.scripts.test, 'package.json needs a "test" script — CI runs `npm test`');
  // Everything that is not the interpreter or a flag is a file/glob argument.
  return pkg.scripts.test
    .split(/\s+/)
    .filter((arg) => arg && arg !== 'node' && !arg.startsWith('-'))
    .map(globToRegExp);
}

const testFiles = fs
  .readdirSync(path.join(root, 'test'))
  .filter((name) => name.endsWith('.test.cjs'));

test('every test file in test/ is covered by the `npm test` glob', () => {
  const patterns = testScriptPatterns();
  assert.ok(testFiles.length > 30, `expected the suite to still be there, found ${testFiles.length} files`);

  const orphans = testFiles.filter((name) => !patterns.some((re) => re.test(`test/${name}`)));
  assert.deepEqual(
    orphans,
    [],
    `these test files would never run under \`npm test\`: ${orphans.join(', ')}`
  );
});

test('the `npm test` glob does not pick up test/ helpers', () => {
  const patterns = testScriptPatterns();
  // load-ts.cjs is the shared TypeScript transpiler shim, not a test. If the
  // pattern ever widens to test/*.cjs it would be executed as one and fail.
  assert.equal(
    patterns.some((re) => re.test('test/load-ts.cjs')),
    false,
    '`npm test` must not try to run test/load-ts.cjs as a test'
  );
});

test('the supported Node range is pinned in package.json and .nvmrc', () => {
  const range = pkg.engines && pkg.engines.node;
  assert.ok(range, 'package.json needs "engines.node" — Node 24 breaks the native build');

  const lower = Number((/>=\s*(\d+)/.exec(range) || [])[1]);
  const upper = Number((/<\s*(\d+)/.exec(range) || [])[1]);
  assert.ok(Number.isFinite(lower) && Number.isFinite(upper), `engines.node ${range} must be a ">=X <Y" range`);

  const nvmrc = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
  const pinned = Number(nvmrc);
  assert.ok(Number.isFinite(pinned), `.nvmrc should be a bare major version, got ${JSON.stringify(nvmrc)}`);
  assert.ok(
    pinned >= lower && pinned < upper,
    `.nvmrc pins Node ${pinned}, which is outside package.json engines.node ${range}`
  );
});
