'use strict';

/**
 * RECORD-05 — put ONE file back to how it was, without disturbing the operator's
 * repo and without losing the other two agents' work.
 *
 * The requirement names five things a restore-point mechanism must not touch:
 * the operator's **index, working tree, branches, `git status` and `git log`**.
 * D-20 picked a separate `GIT_DIR` over the operator's work-tree for exactly
 * that reason, and 04-RESEARCH.md § Pattern 6 measured it end to end on this
 * machine. This file is the standing version of that measurement.
 *
 * Everything below drives a **real git** against real temp repos. Nothing is
 * mocked: the claim is about what git itself does to the operator's repo, and a
 * fake git cannot be wrong in the way a real one can.
 *
 * Two things this file deliberately does NOT do:
 *
 * 1. **It never compares an index mtime** (Pitfall 4). `git status` refreshes the
 *    stat cache and rewrites `.git/index` when working-tree files changed — that
 *    was measured, and it is the OPERATOR's own `git status` doing it, not the
 *    shadow store. So D-22's assertions compare `git status --porcelain`
 *    **output** and `git rev-parse HEAD`, never file metadata.
 *
 * 2. **It never asserts a negative alone** (D-33/D-40). Every "the ignored
 *    directory contributed nothing" is paired with "and a non-ignored file IS
 *    there", so an empty snapshot cannot pass as a clean one.
 */

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const loadTs = require('./load-ts.cjs');
const { RestorePoints, SNAPSHOT_CADENCE_MS, SNAPSHOT_RETENTION_MS } = loadTs('src/main/restorePoints.ts');

/** Real git in `cwd`. Asserts exit 0 — a silent non-zero here would make every
 *  assertion downstream a comparison of two empty strings. */
const gitIn = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, `git ${args.join(' ')} failed in ${cwd}: ${r.stderr}`);
  return r.stdout;
};

const made = [];
function tempDir(tag) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `md-rp-${tag}-`)));
  made.push(dir);
  return dir;
}

after(() => {
  for (const dir of made) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

/** An operator repo with one commit and three files in it — the three agents'
 *  files that D-22 is about. Returns the repo root and a fresh RestorePoints
 *  whose store lives somewhere else entirely. */
function operatorFloor() {
  const repo = tempDir('repo');
  const storeRoot = path.join(tempDir('home'), 'hive', 'restore');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a0\n');
  fs.writeFileSync(path.join(repo, 'b.txt'), 'b0\n');
  fs.writeFileSync(path.join(repo, 'c.txt'), 'c0\n');
  gitIn(repo, '-c', 'init.defaultBranch=main', 'init', '-q', '.');
  gitIn(repo, 'add', '-A');
  gitIn(repo, '-c', 'user.email=op@local', '-c', 'user.name=operator', 'commit', '-q', '-m', 'initial');
  const logged = [];
  const rp = new RestorePoints({ storeRoot: () => storeRoot, log: (e) => logged.push(e) });
  return { repo, storeRoot, rp, logged };
}

const read = (repo, rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const write = (repo, rel, text) => fs.writeFileSync(path.join(repo, rel), text);

// ── D-22: one file back, the other two untouched, the operator undisturbed ───

test('restoring ONE file leaves the other two agents\' files and the operator\'s repo untouched', async () => {
  const { repo, rp } = operatorFloor();

  // Three agents have each changed their file. This is the state a snapshot is
  // taken OF — deliberately dirty, so that `git status --porcelain` prints the
  // same three ` M` lines at every step below and "identical output" is a real
  // comparison rather than two empty strings.
  write(repo, 'a.txt', 'a1-agentA\n');
  write(repo, 'b.txt', 'b1-agentB\n');
  write(repo, 'c.txt', 'c1-agentC\n');

  const statusBefore = gitIn(repo, 'status', '--porcelain');
  const headBefore = gitIn(repo, 'rev-parse', 'HEAD');
  const branchesBefore = gitIn(repo, 'branch', '--list');
  assert.ok(statusBefore.trim().length > 0, 'positive control: the operator repo must be DIRTY here, '
    + 'or every "status is identical" assertion below compares two empty strings');

  const sha = await rp.snapshot(repo);
  assert.match(String(sha), /^[0-9a-f]{40}$/, `snapshot() returned ${sha}, not a commit sha`);

  assert.equal(gitIn(repo, 'status', '--porcelain'), statusBefore,
    'the snapshot changed the operator\'s `git status` output — RECORD-05 forbids exactly this');
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), headBefore, 'the snapshot moved the operator\'s HEAD');
  assert.equal(gitIn(repo, 'branch', '--list'), branchesBefore, 'the snapshot changed the operator\'s branches');
  assert.deepEqual(
    fs.readdirSync(path.join(repo, '.git')).filter((n) => /restore/i.test(n)),
    [],
    'the snapshot wrote something named restore* into the OPERATOR\'s .git — the whole point of a '
    + 'separate GIT_DIR is that nothing lands there'
  );

  // Time passes; all three agents change their file again.
  write(repo, 'a.txt', 'a2-agentA-broke-it\n');
  write(repo, 'b.txt', 'b2-agentB\n');
  write(repo, 'c.txt', 'c2-agentC\n');

  const ok = await rp.restoreFile(repo, sha, 'a.txt');
  assert.equal(ok, true, 'restoreFile refused');

  // THE assertion, as ONE sequence.
  assert.equal(read(repo, 'a.txt'), 'a1-agentA\n', 'a.txt did not come back to its snapshot state');
  assert.equal(read(repo, 'b.txt'), 'b2-agentB\n',
    'restoring a.txt reverted agent B\'s work — this is the failure RECORD-05 exists to prevent');
  assert.equal(read(repo, 'c.txt'), 'c2-agentC\n', 'restoring a.txt reverted agent C\'s work');
  assert.equal(gitIn(repo, 'status', '--porcelain'), statusBefore,
    'the restore changed the operator\'s `git status` output. Three files are still modified relative '
    + 'to HEAD, so porcelain must still print the same three lines: anything else means the shadow '
    + 'store staged into the OPERATOR\'s index');
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), headBefore, 'the restore moved the operator\'s HEAD');
  assert.equal(gitIn(repo, 'branch', '--list'), branchesBefore, 'the restore changed the operator\'s branches');
});

// ── the operator's own .gitignore is honoured, for free ─────────────────────

test('a gitignored directory contributes nothing to a snapshot, and a tracked file still does', async () => {
  const { repo, rp } = operatorFloor();
  fs.writeFileSync(path.join(repo, '.gitignore'), 'build/\n');
  fs.mkdirSync(path.join(repo, 'build'));
  fs.writeFileSync(path.join(repo, 'build', 'fat.bin'), 'x'.repeat(64 * 1024));
  write(repo, 'a.txt', 'a1-agentA\n');

  const sha = await rp.snapshot(repo);
  assert.match(String(sha), /^[0-9a-f]{40}$/, 'snapshot() failed on a repo with a gitignored directory');

  const listed = await rp.listFiles(repo, sha);
  assert.deepEqual(listed.filter((f) => f.startsWith('build/')), [],
    'a gitignored directory entered the snapshot. RECORD-05\'s UNTRACK_PATHS warning is answered '
    + 'structurally: `add -A` under the shadow store reads the OPERATOR\'s .gitignore');
  // The paired positive bound (D-33/D-40): an empty snapshot must not pass as a clean one.
  assert.ok(listed.includes('a.txt'),
    `the snapshot listed ${listed.length} file(s) and a.txt is not among them — the negative above `
    + 'passed vacuously over an empty snapshot');
});

// ── L-06: a nested repo must not kill the restore point ─────────────────────

test('an uncommitted nested `git init` does not kill the snapshot (L-06)', async () => {
  const { repo, rp } = operatorFloor();
  write(repo, 'a.txt', 'a1-agentA\n');
  // Agents create git worktrees inside the operator's repo (git.ts listWorktrees),
  // and this phase was planned from one. Measured without the guard: `add -A`
  // prints "does not have a commit checked out" and exits 128, adding NOTHING.
  const nested = path.join(repo, '.claude', 'worktrees', 'agent-x');
  fs.mkdirSync(nested, { recursive: true });
  gitIn(nested, '-c', 'init.defaultBranch=main', 'init', '-q', '.');
  fs.writeFileSync(path.join(nested, 'scratch.txt'), 'agent scratch\n');

  const sha = await rp.snapshot(repo);
  assert.match(String(sha), /^[0-9a-f]{40}$/,
    'snapshot() returned null with an uncommitted nested repo present — L-06: the first agent '
    + 'worktree silently ends every restore point from then on');

  const listed = await rp.listFiles(repo, sha);
  assert.ok(listed.length > 0, 'the snapshot is empty — `add -A` exited 0 but staged nothing');
  assert.ok(listed.includes('a.txt'), 'the snapshot survived the nested repo but lost the file that matters');
  // And it must not have recorded the nested repo as a hollow gitlink (mode 160000),
  // which is L-06's quieter half: a snapshot that CLAIMS a subtree it does not contain.
  const modes = await rp.listFiles(repo, sha, true);
  assert.deepEqual(modes.filter((l) => l.startsWith('160000')), [],
    'the snapshot recorded a gitlink (mode 160000) for the nested repo — it now claims a subtree '
    + 'whose objects it does not have, and a restore from it would produce nothing');
});

// ── L-07: two writers must not fight over index.lock ────────────────────────

test('two overlapping snapshots do not produce an index.lock fatal (L-07)', async () => {
  const { repo, rp, logged } = operatorFloor();
  write(repo, 'a.txt', 'a1-agentA\n');

  const [first, second] = await Promise.all([rp.snapshot(repo), rp.snapshot(repo)]);
  const shas = [first, second].filter(Boolean);
  assert.ok(shas.length >= 1,
    'both overlapping snapshots came back null — the coalescing swallowed the work entirely');
  for (const s of shas) assert.match(s, /^[0-9a-f]{40}$/);

  const blob = JSON.stringify(logged);
  assert.ok(!/index\.lock/i.test(blob),
    `an index.lock error was logged during two overlapping snapshots: ${blob}. git does not retry `
    + 'this one — it is fatal, which is why the writer carries gitCommitter\'s single-writer discipline');
});

// ── T-04-SNAP-09: one repo, one store, whatever case the drive letter is in ──

test('the same repo through two path spellings uses ONE store', async () => {
  const { repo, storeRoot, rp } = operatorFloor();
  write(repo, 'a.txt', 'a1-agentA\n');
  const sha = await rp.snapshot(repo);
  assert.match(String(sha), /^[0-9a-f]{40}$/);

  // On win32 `fs.realpathSync` does NOT canonicalize drive-letter case and
  // `fs.realpathSync.native` does, so `E:\repo` and `e:\repo` would hash to two
  // stores and the operator's restore history would silently split in half.
  // On a POSIX runner the two spellings are the SAME STRING, so this case
  // asserts a single store trivially there — that is intended, not a gap: the
  // defect it guards only exists on a case-insensitive volume.
  const other = process.platform === 'win32' ? repo[0].toLowerCase() + repo.slice(1) : repo;

  // The SECOND spelling, and the one that is not hypothetical on this machine:
  // `os.tmpdir()` returns the 8.3 short form (`C:\Users\ALIENW~1\…`) while
  // `git rev-parse --show-toplevel` returns the long one (`C:/Users/Alienware/…`).
  // repoRootOf hands the long form to snapshot() and the caller may hold the
  // short one, so if the key did not reconcile them the store would split on
  // every single Windows floor rather than only on a mis-typed drive letter.
  // Measured: plain realpathSync leaves ALIENW~1 alone; .native expands it.
  const longForm = fs.realpathSync.native(repo);
  assert.equal(fs.realpathSync.native(longForm), fs.realpathSync.native(repo),
    'positive control: the two spellings must canonicalize to one directory, or the store-count '
    + 'assertion below is about two genuinely different repos');

  write(repo, 'b.txt', 'b1-agentB\n');
  const sha2 = await rp.snapshot(other);
  assert.match(String(sha2), /^[0-9a-f]{40}$/, 'the second spelling could not snapshot at all');
  write(repo, 'c.txt', 'c1-agentC\n');
  const sha3 = await rp.snapshot(longForm);
  assert.match(String(sha3), /^[0-9a-f]{40}$/, 'the long-form spelling could not snapshot at all');

  assert.equal(fs.readdirSync(storeRoot).length, 1,
    `the two spellings of the same repo made ${fs.readdirSync(storeRoot).length} stores. Each then `
    + 'holds a partial history and neither knows about the other, so neither can answer "put this '
    + 'file back to 02:00"');
  const points = (await rp.listPoints(other)).map((p) => p.sha);
  assert.ok(points.includes(sha),
    'the second spelling cannot see the first spelling\'s restore point — the history is split');
  assert.ok(points.includes(sha2));
  assert.ok(points.includes(sha3),
    'the long-form spelling\'s restore point is not in the store the short form reads — this is '
    + 'the split that would happen on EVERY Windows floor, because repoRootOf returns git\'s long '
    + 'form and the registry may hold the 8.3 short one');
});

// ── an unchanged tree is not a restore point ────────────────────────────────

test('a snapshot with nothing changed since the last one returns null', async () => {
  const { repo, rp } = operatorFloor();
  write(repo, 'a.txt', 'a1-agentA\n');
  const first = await rp.snapshot(repo);
  assert.match(String(first), /^[0-9a-f]{40}$/);
  assert.equal(await rp.snapshot(repo), null,
    'an identical tree produced a second restore point — an idle floor would then fill the store '
    + 'with empty commits and push the real ones out of the retention window');
});

// ── an agent's cwd is usually a SUBDIRECTORY, and that changes the answer ───

test('repoRootOf resolves an agent\'s subdirectory cwd to the repo top level', async () => {
  const { repo, rp } = operatorFloor();
  const sub = path.join(repo, 'src', 'deep');
  fs.mkdirSync(sub, { recursive: true });

  // Compared as DIRECTORIES, not as strings. Measured on this machine:
  // `os.tmpdir()` hands back the 8.3 short form `C:\Users\ALIENW~1\...` while
  // `git rev-parse --show-toplevel` prints the long form `C:/Users/Alienware/...`.
  // Two spellings, one directory — which is precisely what realpathSync.native
  // is in storePathFor to reconcile, and comparing raw strings here would assert
  // a spelling rather than the answer.
  const sameDir = (a, b) => fs.realpathSync.native(a) === fs.realpathSync.native(b);

  const fromSub = await rp.repoRootOf(sub);
  assert.ok(fromSub && sameDir(fromSub, repo),
    `an agent cwd one directory down resolved to ${fromSub}, not the repo root ${repo}. `
    + 'Snapshotting the subdirectory instead would make git treat it as the top level and never '
    + 'read the ROOT .gitignore, so the "a gitignored build/ contributes 0 entries" property '
    + 'silently stops holding (T-04-SNAP-05)');
  const fromRoot = await rp.repoRootOf(repo);
  assert.ok(fromRoot && sameDir(fromRoot, repo), 'the repo root does not resolve to itself');
  // The negative, with the positives above as its control.
  assert.equal(await rp.repoRootOf(path.join(os.tmpdir(), 'md-rp-definitely-not-here')), null,
    'a cwd that does not exist came back as a repo root');
});

// ── ASVS V12: an operator-supplied restore path may not escape the repo ─────

test('restoreFile refuses a path that escapes the repo root', async () => {
  const { repo, rp } = operatorFloor();
  write(repo, 'a.txt', 'a1-agentA\n');
  const sha = await rp.snapshot(repo);

  const outside = path.join(path.dirname(repo), 'stolen.txt');
  fs.writeFileSync(outside, 'operator secret\n');
  const before = fs.readFileSync(outside, 'utf8');

  for (const evil of ['../stolen.txt', '../../stolen.txt', path.join('..', 'stolen.txt')]) {
    assert.equal(await rp.restoreFile(repo, sha, evil), false, `restoreFile accepted ${evil}`);
  }
  assert.equal(fs.readFileSync(outside, 'utf8'), before, 'a traversal path reached the work tree');
  // Positive bound: the same call shape with a legitimate path DOES work, so the
  // three refusals above are the guard and not a broken restoreFile.
  write(repo, 'a.txt', 'clobbered\n');
  assert.equal(await rp.restoreFile(repo, sha, 'a.txt'), true);
  assert.equal(read(repo, 'a.txt'), 'a1-agentA\n');
});

// ── ADR-0003: a prune that cannot prove a point is safe to drop keeps it ────

test('prune drops points past the window, keeps the newest, and never empties the store', async () => {
  const { repo, rp } = operatorFloor();
  write(repo, 'a.txt', 'a1\n');
  const older = await rp.snapshot(repo);
  write(repo, 'a.txt', 'a2\n');
  const newer = await rp.snapshot(repo);
  assert.equal((await rp.listPoints(repo)).length, 2,
    'positive control: two points must exist before the prune');

  // A window of 0 asks to drop everything. ADR-0003's bias: the newest point
  // survives regardless, because a store that pruned the operator's only
  // restore point is the failure the requirement exists to prevent.
  const dropped = await rp.prune(repo, 0);
  const left = (await rp.listPoints(repo)).map((p) => p.sha);
  assert.equal(dropped, 1, `prune dropped ${dropped} point(s), expected 1 (everything but the newest)`);
  assert.deepEqual(left, [newer], 'the wrong point survived the prune');
  assert.ok(!left.includes(older));

  // The surviving point still restores — a prune that leaves a ref pointing at
  // a gc'd object is worse than no prune.
  write(repo, 'a.txt', 'clobbered\n');
  assert.equal(await rp.restoreFile(repo, newer, 'a.txt'), true);
  assert.equal(read(repo, 'a.txt'), 'a2\n');
});

test('a prune over a store that is not there leaves every real store intact (ADR-0003)', async () => {
  const { repo, rp, logged } = operatorFloor();
  write(repo, 'a.txt', 'a1\n');
  await rp.snapshot(repo);
  write(repo, 'a.txt', 'a2\n');
  await rp.snapshot(repo);
  const before = (await rp.listPoints(repo)).map((p) => p.sha);

  // A repo with no store yet is the cheapest way to make prune's every git
  // command find nothing. Fail-safe means: 0 dropped, nothing thrown, and the
  // real store untouched.
  const dropped = await rp.prune(path.join(repo, 'no-such-repo-here'), 0);
  assert.equal(dropped, 0, 'prune reported dropping points from a store that does not exist');
  assert.deepEqual((await rp.listPoints(repo)).map((p) => p.sha), before, 'the real store lost points');
  assert.ok(Array.isArray(logged));
});

// ── the shape the rest of the phase depends on ──────────────────────────────

test('the module is electron-free, sets no GIT_INDEX_FILE, and canonicalizes with realpathSync.native', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'restorePoints.ts'), 'utf8'
  );
  assert.equal((src.match(/from 'electron'/g) || []).length, 0,
    'restorePoints.ts imports electron — it must load on all three CI runners, which install with '
    + '`npm ci --ignore-scripts` and have no electron binary');
  assert.equal((src.match(/GIT_INDEX_FILE/g) || []).length, 0,
    'GIT_INDEX_FILE is set. Pitfall 7: --git-dir alone makes the index default to <store>/index — '
    + 'measured — and requiring the env var would force git.ts\'s runGit to grow an env parameter '
    + 'it does not have');
  assert.ok(src.includes('info/exclude') || src.includes('\'exclude\''),
    'the nested-repo guard (L-06) is gone — one `git init` in a subdirectory then ends every snapshot');
  assert.ok(src.includes('realpathSync.native'), 'the store key does not canonicalize drive-letter case');
  assert.equal((src.match(/(?<!\.)\brealpathSync\(/g) || []).length, 0,
    'a bare realpathSync( call remains: on win32 it does not canonicalize drive-letter or segment '
    + 'case, so E:\\repo and e:\\repo would key two different stores (T-04-SNAP-09)');

  // The two policy numbers are stated, not implicit — both [ASSUMED], both one
  // edit away from changing, and both asserted here so a silent drift is red.
  assert.equal(SNAPSHOT_CADENCE_MS, 15 * 60_000, 'the snapshot cadence moved');
  assert.equal(SNAPSHOT_RETENTION_MS, 48 * 60 * 60_000, 'the snapshot retention window moved');
});
