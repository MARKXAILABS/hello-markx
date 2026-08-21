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
 *
 * And it pins a handful of REPO FACTS that documents claim about themselves —
 * the release workflow's provenance step, the CI gate CONTRIBUTING.md describes,
 * the ADR index, the bug template. Every one of those is a place where a doc can
 * quietly start lying about what the code does, which is the specific defect
 * class the docs here exist to remove. A test is what stops it coming back.
 *
 * The workflow assertions PARSE the YAML rather than grepping it, deliberately:
 *   - a commented-out step still matches a string search, and "the attestation
 *     step got commented out in a refactor" is exactly the regression to catch;
 *   - `continue-on-error` appears FOUR times in ci.yml, and two of those are
 *     prose inside comments — including one inside the `test` job saying there
 *     is no continue-on-error there. A text search cannot tell that comment from
 *     the real key two jobs away, so only a parse can answer the question
 *     CONTRIBUTING.md makes a promise about;
 *   - step ORDER (attest after the merge, before the upload) is an index
 *     comparison, which needs a parsed list.
 * `js-yaml` is therefore a declared devDependency. It was already in the tree
 * transitively via electron-updater/electron-builder, but depending on someone
 * else's transitive hoist is how a `npm test` starts failing with
 * MODULE_NOT_FOUND on a PR that touched nothing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const readYaml = (rel) => yaml.load(read(rel));

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

// ─── Repo facts the docs make promises about ─────────────────────────────────

test('release.yml attests the artifacts it publishes, with the permissions to do it', () => {
  const publish = readYaml('.github/workflows/release.yml').jobs.publish;

  // A job-level permissions block REPLACES the workflow-level one rather than
  // extending it, so all three have to be here. Dropping `contents: write` is
  // the silent one: attestation keeps working and the upload starts 403ing.
  for (const [key, value] of [['contents', 'write'], ['id-token', 'write'], ['attestations', 'write']]) {
    assert.equal(
      publish.permissions && publish.permissions[key],
      value,
      `release.yml's publish job needs "${key}: ${value}". Without contents:write the release `
        + 'upload 403s; without id-token:write there is no OIDC token for Sigstore to sign '
        + 'against; without attestations:write the attestation cannot be persisted. A job-level '
        + 'permissions block replaces the workflow-level one, so all three must be restated here.'
    );
  }

  const steps = publish.steps.map((s) => ({ name: s.name || '', uses: s.uses || '', with: s.with || {} }));
  const attest = steps.findIndex((s) => s.uses.startsWith('actions/attest-build-provenance'));
  assert.notEqual(
    attest,
    -1,
    "release.yml's publish job no longer attests build provenance. That is FLOOR-06's only "
      + 'control over a tampered download: Windows and macOS ship unsigned, so provenance plus '
      + 'the published checksums are the entire answer to "did this really come from this repo".'
  );

  assert.ok(
    steps[attest].with['subject-checksums'],
    'the attestation step must attest via subject-checksums (the merged SHA256SUMS.txt), so one '
      + 'call covers every artifact on every platform. Switching to subject-path silently narrows '
      + 'what is attested to whatever that glob happens to match.'
  );

  const merge = steps.findIndex((s) => /checksums/i.test(s.name));
  const upload = steps.findIndex((s) => s.uses.startsWith('softprops/action-gh-release'));
  assert.ok(merge !== -1 && upload !== -1, 'release.yml lost its checksum-merge or release-upload step');
  assert.ok(
    merge < attest && attest < upload,
    `attestation must run AFTER the checksums are merged (index ${merge}) and BEFORE the upload `
      + `(index ${upload}); it is at ${attest}. Attesting earlier signs digests that are not the `
      + 'bytes that ship, which looks green and proves nothing.'
  );
});

test('the `test` matrix is a hard gate on all three platforms, exactly as CONTRIBUTING.md claims', () => {
  const ci = readYaml('.github/workflows/ci.yml');
  const job = ci.jobs.test;

  for (const os of ['ubuntu-latest', 'windows-latest', 'macos-latest']) {
    assert.ok(
      job.strategy.matrix.os.includes(os),
      `${os} left the CI test matrix. CONTRIBUTING.md tells contributors all three platforms are `
        + 'hard gates; dropping one makes that a false promise, and a permanently-absent platform '
        + 'is how 7 real Windows source bugs (#57/#58/#60) stayed invisible for months.'
    );
  }

  // Parsed, not grepped: ci.yml mentions `continue-on-error` in prose inside
  // this very job's comment block, and really carries it on two steps in OTHER
  // jobs (the advisory npm audit, and the flaky native rebuild). Both of those
  // are deliberate and outside the matrix, which is why CONTRIBUTING.md says
  // "anywhere in the test matrix" and not "anywhere in ci.yml".
  assert.equal(
    job['continue-on-error'],
    undefined,
    'the CI test job carries a job-level continue-on-error. A permanently-yellow test job is how '
      + 'this repo shipped Windows as a headline feature with 7 real source bugs in it, and it '
      + 'makes CONTRIBUTING.md\'s hard-gate paragraph false.'
  );
  const soft = job.steps.filter((s) => s['continue-on-error']).map((s) => s.name || s.uses);
  assert.deepEqual(
    soft,
    [],
    `these steps in the CI test job would swallow their own failure: ${soft.join(', ')}. A test `
      + 'step that cannot fail is not a gate, and CONTRIBUTING.md promises it is one.'
  );

  assert.ok(
    read('CONTRIBUTING.md').includes('there is no `continue-on-error` anywhere in the test matrix'),
    'CONTRIBUTING.md lost the hard-gate sentence. The doc and ci.yml are pinned to each other on '
      + 'purpose: whichever one drifts, this test fails on the PR that drifts it.'
  );
});

test('no workflow gates a PR on the hand-picked test subset', () => {
  const dir = path.join(root, '.github/workflows');
  const offenders = fs
    .readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('test:focused'));
  assert.deepEqual(
    offenders,
    [],
    `${offenders.join(', ')} reference test:focused. It is a hand-written file list for tight edit `
      + 'loops; gating on it is how eight test files went unrun for months (#7), and both '
      + 'CONTRIBUTING.md and README.md tell contributors it is never a gate.'
  );
});

test('docs/adr/ holds the numbered records and README.md indexes every one', () => {
  const dir = path.join(root, 'docs/adr');
  const records = fs.readdirSync(dir).filter((f) => /^\d{4}-.+\.md$/.test(f)).sort();
  assert.ok(
    records.length >= 6,
    `expected at least 6 ADRs, found ${records.length}. FLOOR-17's clause is that docs/adr/ is the `
      + 'home for rationale that was buried in long source comments; losing a record sends that '
      + 'rationale back to git blame.'
  );

  const index = read('docs/adr/README.md');
  for (const file of records) {
    assert.ok(
      index.includes(file),
      `docs/adr/README.md does not link ${file}. An unindexed ADR is one nobody finds, which is the `
        + 'exact failure that made these records necessary in the first place.'
    );
  }
});

test('the bug template asks only for things a reporter can actually produce', () => {
  const template = readYaml('.github/ISSUE_TEMPLATE/bug_report.yml');
  const logs = template.body.find((f) => f.id === 'logs');
  assert.ok(logs, 'the bug template lost its logs field — the whole point of FLOOR-17\'s template half');

  const description = logs.attributes.description || '';
  assert.match(
    description,
    /Settings/,
    'the logs field must name the Settings route to the log folder. It used to say "there is no log '
      + 'file yet", which stopped being true when #13 landed the file sink — an ask pointed at '
      + 'nothing is the same defect as a doc describing code that does not exist.'
  );
  assert.match(
    description,
    /main\.log/,
    'the logs field must name main.log and the platform paths to it. Until FLOOR-05 ships the '
      + 'Settings button, the by-hand path is the ONLY way a reporter reaches the file, so removing '
      + 'it makes the ask unanswerable again.'
  );
});

test('SECURITY.md describes the per-agent hook token, not the floor-wide secret it replaced', () => {
  const security = read('SECURITY.md');

  // The old design was ONE secret minted at app start and spread into every
  // agent's environment, which meant any prompt-injected agent shell could read
  // the key to the whole floor. It is gone from the code; a doc still describing
  // it is a false claim about what this app protects, in the one file a reader
  // checks first.
  for (const stale of ['process-local token', 'minted fresh at each app start']) {
    assert.equal(
      security.includes(stale),
      false,
      `SECURITY.md still says "${stale}", which describes the single floor-wide hook secret that `
        + 'no longer exists. Tokens are now minted per agent per PTY spawn and the sender identity '
        + 'is derived server-side. A stale trust-boundary claim is worse than no claim.'
    );
  }

  const perAgent = (security.match(/per-agent/g) || []).length;
  assert.ok(
    perAgent >= 2,
    `SECURITY.md mentions "per-agent" ${perAgent} time(s); the hook-server paragraph must say so `
      + 'explicitly. Deleting the stale wording without replacing it leaves a reader with no '
      + 'description of the boundary at all, which passes a "the lie is gone" check and still '
      + 'fails the reader.'
  );

  // Squeezed, because this sentence wraps and a re-wrap must not be able to
  // "delete" it by accident.
  assert.ok(
    security.replace(/\s+/g, ' ').includes(
      'not a defence against a process that can already read this app\'s child environments'
    ),
    'SECURITY.md lost the sentence stating the honest ceiling of the hook token. It survived the '
      + 'per-agent rewrite on purpose: it was true before and is true now, and it is the sentence '
      + 'that keeps the rest of the paragraph from reading as a stronger guarantee than it is.'
  );
});

// ─── FLOOR-16: the lint gate ─────────────────────────────────────────────────
//
// The repo shipped its whole life with no linter while carrying 13
// `eslint-disable` comments in src/. A disable comment nothing reads is worse
// than no comment: it reads like a reviewed exception and is inert, so a real
// dependency bug can hide under one indefinitely. These four tests pin the three
// halves of the gate that can each be softened independently — the STEP (a
// workflow that stops invoking it), the FLAG (a script that stops failing on
// warnings), and the RULE SURFACE (a preset swap that silently adopts ~14 more
// rules) — plus the count of steps in this file that are allowed to swallow
// their own failure.
//
// Parsed, never grepped, for the same reason the assertions above are: with the
// gate written as `run: npm run lint`, a grep of ci.yml for `max-warnings`
// returns 0 on a FULLY CORRECT implementation, and `continue-on-error` appears
// four times in ci.yml of which two are prose in comments.

test('the typecheck job runs `npm run lint`, and neither the step nor the job can swallow it', () => {
  const job = readYaml('.github/workflows/ci.yml').jobs.typecheck;
  const steps = job.steps || [];
  const lint = steps.filter((s) => String(s.run || '').trim() === 'npm run lint');

  assert.equal(
    lint.length,
    1,
    'the typecheck job must run exactly one `npm run lint` step. Written as the npm script (not a '
      + 'bare `eslint` invocation) so the command is byte-identical to the one a contributor runs '
      + 'locally, and so the --max-warnings 0 flag has one definition rather than two that can drift. '
      + `Found ${lint.length} such step(s).`
  );

  assert.equal(
    lint[0]['continue-on-error'],
    undefined,
    'the Lint step carries continue-on-error. A gate that reports and merges anyway is '
      + 'indistinguishable from no gate — which is exactly the state that let 13 inert '
      + 'eslint-disable comments accumulate in src/.'
  );

  assert.equal(
    job['continue-on-error'],
    undefined,
    'the typecheck job carries a job-level continue-on-error, which silently disarms the lint step '
      + 'and the tsc gate together.'
  );
});

test('the `lint` script IS the gate: eslint, at --max-warnings 0, from devDependencies', () => {
  const script = (pkg.scripts || {}).lint || '';

  assert.match(
    script,
    /eslint/,
    `package.json's "lint" script must invoke eslint; it is ${JSON.stringify(script)}. ci.yml runs `
      + '`npm run lint` and nothing else, so this string is the entire gate.'
  );

  assert.match(
    script,
    /--max-warnings 0/,
    `the "lint" script must carry --max-warnings 0; it is ${JSON.stringify(script)}. Both `
      + 'react-hooks/exhaustive-deps and unused-disable-directive reporting default to WARNING '
      + 'severity, so without the flag eslint exits 0 while printing findings and CI goes green on '
      + 'a repo full of them.'
  );

  assert.ok(
    (pkg.devDependencies || {}).eslint,
    'eslint left devDependencies. The typecheck job installs with `npm ci --ignore-scripts`, which '
      + 'installs devDependencies — losing it there makes `npm run lint` fail to resolve, not fail '
      + 'to find problems.'
  );

  assert.equal(
    (pkg.dependencies || {}).eslint,
    undefined,
    'eslint is in runtime dependencies. It is build tooling; shipping it inside the packaged app '
      + 'adds megabytes and a parser to the attack surface for no runtime benefit.'
  );
});

test('exactly two steps in ci.yml are allowed to swallow their own failure', () => {
  const ci = readYaml('.github/workflows/ci.yml');
  const soft = [];
  for (const [jobName, job] of Object.entries(ci.jobs || {})) {
    if (job['continue-on-error'] === true) soft.push(`${jobName} (whole job)`);
    for (const step of job.steps || []) {
      if (step['continue-on-error'] === true) soft.push(`${jobName}: ${step.name || step.uses || step.run}`);
    }
  }

  assert.equal(
    soft.length,
    2,
    `ci.yml declares ${soft.length} continue-on-error, expected the two pre-existing ones (the `
      + 'advisory `npm audit`, and the historically flaky electron-rebuild in `build`). Found: '
      + `${soft.join(' | ') || 'none'}. Both existing ones are documented inline with the reason `
      + 'they are advisory; a third is how a gate gets disarmed without anyone deleting it. Count '
      + 'the PARSED declarations — the raw string appears four times in the file, twice inside '
      + 'comments explaining why there is no continue-on-error there.'
  );
});

test('the ESLint flat config resolves to exactly the two named rules, with a real TypeScript parser', async () => {
  const configFile = ['eslint.config.mjs', 'eslint.config.js'].find((n) => fs.existsSync(path.join(root, n)));
  assert.ok(
    configFile,
    'there is no flat config at the repo root. `npm run lint` with no config lints nothing and '
      + 'exits 0 — a green gate over an empty file set.'
  );

  const { ESLint } = require('eslint');
  const resolved = await new ESLint({ cwd: root })
    .calculateConfigForFile(path.join(root, 'src/renderer/src/App.tsx'));
  const rules = Object.keys(resolved.rules || {}).sort();

  assert.deepEqual(
    rules,
    ['react-hooks/exhaustive-deps', 'react-hooks/rules-of-hooks'],
    `${configFile} resolves to [${rules.join(', ')}]. The surface is deliberately these two rules `
      + 'and no preset: eslint-plugin-react-hooks v7 ships the React Compiler rule set, and BOTH of '
      + 'its flat presets carry 16-17 rules, most at "error". Spreading one in — or a future minor '
      + 'adding to one — would adopt a ruleset this project never agreed to, silently, on an '
      + 'unrelated `npm update`. Asserted through ESLint\'s own resolver rather than by reading the '
      + 'file, because that is what a preset spread cannot hide from.'
  );

  assert.ok(
    resolved.languageOptions && resolved.languageOptions.parser,
    `${configFile} configures no parser for src/. ESLint's default parser (espree) cannot parse a `
      + 'TypeScript type annotation, so without @typescript-eslint/parser every file in src/ fails '
      + 'to parse and the gate passes over nothing.'
  );
});
