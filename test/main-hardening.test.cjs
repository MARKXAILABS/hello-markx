'use strict';

// Guards for the main-process hardening pass (#1, #8, #9).
//
// src/main/index.ts itself is not loaded here — but not because it imports
// 'electron': test/load-ts.cjs has stubbed that import since #55, and lets
// the module load. The real blocker is module-scope side effects — an
// `app.on(...)` call and an `initFileLogging()` that opens a real write
// stream, both executed at import time (D-02) — which a stub cannot paper
// over and which cross-contaminate parallel test files through a shared
// stub path. The composed boot path this file's guards feed into IS tested,
// in test/boot-floor.test.cjs, against `bootFloor(deps)` — the injected
// composition root D-02's fix extracted. Each assertion here targets the
// pure function the handler now delegates to, same as before.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, realpathSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const loadTs = require('./load-ts.cjs');

const { safeJoin, isWithinRoots, isAllowedExternalUrl } = loadTs('src/main/fs.ts');
const { worktreeHasUnintegratedWork } = loadTs('src/main/git.ts');

/** A temp dir that cleans itself up, realpath'd so macOS's /var → /private/var
 *  symlink doesn't make every assertion here a symlink test by accident. */
function tempDir(t, prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* noop */ } });
  return dir;
}

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' });

// ─── #1: a teardown of a dirty isolated worktree must NOT remove it ──────────
// teardownPty now routes EVERY isolated agent (not just ephemeral workers)
// through this gate before `git worktree remove --force`. `keep: true` is the
// answer that saves an hour of uncommitted work when an agent's CLI crashes.
test('worktreeHasUnintegratedWork keeps a dirty worktree and releases a clean one', async (t) => {
  const root = tempDir(t, 'mh-repo-');
  const repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 'test@example.invalid']);
  git(repo, ['config', 'user.name', 'Test']);
  writeFileSync(join(repo, 'README.md'), 'hello\n');
  git(repo, ['add', '.']);
  git(repo, ['commit', '-q', '-m', 'init']);
  const base = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();

  const wt = join(root, 'worktrees', 'agent-1');
  git(repo, ['worktree', 'add', '-q', wt, '-b', 'agent/1']);

  // Clean + nothing ahead of base → safe to reclaim.
  const clean = await worktreeHasUnintegratedWork(wt, base);
  assert.equal(clean.keep, false, 'a clean, un-advanced worktree is removable');

  // An UNTRACKED file is the exact case the force-remove used to destroy.
  writeFileSync(join(wt, 'scratch.txt'), 'an hour of work\n');
  const dirty = await worktreeHasUnintegratedWork(wt, base);
  assert.equal(dirty.dirty, true);
  assert.equal(dirty.keep, true, 'untracked work must never be auto-discarded');

  // …and so is a commit the base branch has never seen.
  rmSync(join(wt, 'scratch.txt'));
  writeFileSync(join(wt, 'feature.txt'), 'committed\n');
  git(wt, ['add', '.']);
  git(wt, ['commit', '-q', '-m', 'feature']);
  const ahead = await worktreeHasUnintegratedWork(wt, base);
  assert.equal(ahead.dirty, false);
  assert.equal(ahead.ahead, 1);
  assert.equal(ahead.keep, true, 'commits not in base must never be auto-discarded');

  // Unanswerable (not a repo at all) fails SAFE.
  const notRepo = tempDir(t, 'mh-norepo-');
  const unknown = await worktreeHasUnintegratedWork(notRepo, base);
  assert.equal(unknown.keep, true, 'a git query we cannot run means "there might be work"');
});

// ─── #9: the renderer names the root, so the root itself must be checked ─────
test('isWithinRoots accepts paths inside a managed root and rejects everything else', (t) => {
  const home = tempDir(t, 'mh-roots-');
  const repo = join(home, 'projects', 'app');
  mkdirSync(repo, { recursive: true });
  const outside = tempDir(t, 'mh-outside-');
  const roots = [repo];

  assert.equal(isWithinRoots(repo, roots), true, 'the root itself');
  assert.equal(isWithinRoots(join(repo, 'src', 'index.ts'), roots), true, 'a path under it');
  assert.equal(isWithinRoots(outside, roots), false, 'an unrelated absolute path');
  assert.equal(isWithinRoots(join(repo, '..'), roots), false, 'the parent of the root');
  // The literal shape from the issue: fs:writeFile('/', 'Users/x/.zshrc', …).
  assert.equal(isWithinRoots('/', roots), false, 'the filesystem root is not a managed root');
  assert.equal(isWithinRoots(join(home, 'projects', 'app-2'), roots), false, 'a sibling with a prefix name');
  assert.equal(isWithinRoots(repo, []), false, 'no roots configured = nothing is managed');
  assert.equal(isWithinRoots('', roots), false);
  assert.equal(isWithinRoots(repo, [undefined, '', repo]), true, 'junk roots are skipped, not fatal');
});

// ─── #9: safeJoin is no longer purely textual ────────────────────────────────
test('safeJoin follows symlinks instead of trusting the string', (t) => {
  const base = tempDir(t, 'mh-link-');
  const root = join(base, 'root');
  const secret = join(base, 'secret');
  mkdirSync(root);
  mkdirSync(secret);
  writeFileSync(join(secret, 'creds.txt'), 'token\n');

  assert.equal(safeJoin(root, 'sub/file.ts'), join(root, 'sub', 'file.ts'), 'ordinary paths still resolve');
  assert.equal(safeJoin(root, '../secret/creds.txt'), null, 'textual traversal is still refused');

  try {
    // 'junction' is the one directory-link Windows grants without elevation.
    symlinkSync(secret, join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    t.skip('this machine will not create symlinks');
    return;
  }
  assert.equal(
    safeJoin(root, 'escape/creds.txt'), null,
    'a symlink INSIDE the root that points outside it must not pass'
  );
});

// ─── #8: the window-open handler denies a non-https scheme ───────────────────
test('isAllowedExternalUrl passes https only', () => {
  assert.equal(isAllowedExternalUrl('https://github.com/MARKXAILABS/hello-markx'), true);
  for (const url of [
    'file:///etc/passwd',
    'ms-msdt:/id PCWDiagnostic',
    'smb://attacker.example/share',
    'http://example.com',
    'javascript:alert(1)',
    'HTTPS://example.com',      // scheme casing is not normalized for us
    'https://',                 // scheme with no host
    '',
    null,
    undefined,
    42
  ]) {
    assert.equal(isAllowedExternalUrl(url), false, `must deny: ${String(url)}`);
  }
  // The onboarding System Settings deep-link is opt-in, per caller.
  const pane = 'x-apple.systempreferences:com.apple.preference.security';
  assert.equal(isAllowedExternalUrl(pane), false, 'not allowed by default');
  assert.equal(isAllowedExternalUrl(pane, { settingsDeepLink: true }), true, 'allowed for app:openExternal');
  assert.equal(
    isAllowedExternalUrl('file:///etc/passwd', { settingsDeepLink: true }), false,
    'the deep-link opt-in does not open the door to other schemes'
  );
});
