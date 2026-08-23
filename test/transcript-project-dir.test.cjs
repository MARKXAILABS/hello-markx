'use strict';

// Originally contributed by Vyapak Goyal (@gts-47) in #123, extended here with
// the dotted-path cases that the first version's dot-free fixtures could not
// catch.
//
// projectDir() resolves against os.homedir(), which these cases redirect. That
// redirect is per-platform: os.homedir() reads $HOME on POSIX and %USERPROFILE%
// on Windows, so setting only $HOME (as this file used to) silently leaked every
// case onto the developer's real ~/.claude on Windows.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { projectDir } = loadTs('src/main/transcript.ts');

/** projectDir() resolves against os.homedir() — $HOME on POSIX, %USERPROFILE% on
 *  Windows — so each case gets a throwaway home and never touches the real
 *  ~/.claude. Both vars are set (same pattern as hive-hook-node.test.cjs), and
 *  the redirect is asserted before any case runs: a silently-ignored redirect is
 *  how these cases spent months reading the developer's real home instead. */
function withHome(run) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-transcript-'));
  const prevHome = process.env.HOME;
  const prevProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    assert.equal(os.homedir(), home, 'home redirect failed — aborting before touching the real home');
    return run(home, (key) => {
      const dir = path.join(home, '.claude/projects', key);
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    });
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevProfile;
    fs.rmSync(home, { recursive: true, force: true });
  }
}

/** The pre-2026 name this harness ITSELF used to write, per platform. POSIX
 *  dropped the leading slash and dashed only slashes, so dots survived
 *  (/Users/me/MDv0.3.0 → Users-me-MDv0.3.0). Windows always used the current
 *  rule — dash every non-alphanumeric — so there is no second spelling to fall
 *  back to there. Verified against a real Windows box: every directory under
 *  ~/.claude/projects is the current spelling (`E--munder-difflin`,
 *  `E--GAME-Megastore-Simulator-v0-5-4`, dots dashed), and not one drive-less,
 *  dot-preserving legacy name exists. */
function legacyName(cwd) {
  return process.platform === 'win32'
    ? cwd.replace(/[^a-zA-Z0-9]/g, '-')
    : cwd.replace(/^\//, '').replaceAll('/', '-');
}

test('an unseen cwd resolves to the CURRENT key, leading slash dashed', () => {
  withHome(() => {
    // The regression: this used to return 'Users-me-app', a directory Claude Code
    // has not written to in months, so every read came back empty and every
    // caller read empty as "no data yet".
    assert.equal(path.basename(projectDir('/Users/me/app')), '-Users-me-app');
  });
});

test('DOTS are dashed too, not just slashes', () => {
  withHome(() => {
    // The case a slash-only fix silently fails: Claude Code dashes EVERY
    // non-alphanumeric, so a version-numbered project directory keys as
    // MDv0-3-0. Dashing only the separators yields '-Users-me-MDv0.3.0', which
    // Claude Code never writes to — and because the legacy fallback then finds
    // the harness's own stale twin, the miss looks like a hit.
    assert.equal(
      path.basename(projectDir('/Users/me/Documents/MDv0.3.0')),
      '-Users-me-Documents-MDv0-3-0'
    );
  });
});

test('every other non-alphanumeric is dashed as well', () => {
  withHome(() => {
    assert.equal(
      path.basename(projectDir('/Users/me/my_proj (old)/v1.2')),
      '-Users-me-my-proj--old--v1-2'
    );
  });
});

test('the current directory wins even when a legacy twin exists', () => {
  withHome((_home, mkProject) => {
    // Both spellings exist on a machine that ran the old code: the harness itself
    // created the legacy twin by copying transcripts into it. Preferring the
    // legacy one would mean reading our own stale copies forever.
    const legacy = mkProject('Users-me-app');
    const current = mkProject('-Users-me-app');
    const resolved = projectDir('/Users/me/app');
    assert.equal(resolved, current);
    assert.notEqual(resolved, legacy);
  });
});

test('the dotted legacy twin loses to the dotted current spelling', () => {
  withHome((_home, mkProject) => {
    const legacy = mkProject('Users-me-MDv0.3.0');
    const current = mkProject('-Users-me-MDv0-3-0');
    const resolved = projectDir('/Users/me/MDv0.3.0');
    assert.equal(resolved, current);
    assert.notEqual(resolved, legacy);
  });
});

test('a legacy-only install still resolves, so old transcripts stay readable', () => {
  withHome((_home, mkProject) => {
    const legacy = mkProject(legacyName('/Users/me/app'));
    assert.equal(projectDir('/Users/me/app'), legacy);
  });
});

// Windows never wrote a legacy spelling, so the POSIX one must stay INERT
// even when it is the only directory present: falling back to it would hand
// back a name Claude Code has never written on this platform, and the miss
// would look like a hit — the exact shape of the bug this file guards.
//
// SPLIT out of the case above rather than skipped with it. It used to sit behind
// a bare `if (process.platform !== 'win32') return;` in the middle of that case,
// which node:test counts as a PASS — so on ubuntu and macOS this half never ran
// and the case still reported `ok`. Skipping the WHOLE case would have traded
// that non-run for another: the half above runs, and asserts, on every platform.
//
// Note the polarity: this case RUNS on win32 and skips on POSIX, the mirror of
// the other conversions in this wave. The skip is CONDITIONAL for the same
// reason as theirs: an UNCONDITIONAL skip option would delete the win32 coverage
// entirely, which is a non-run dressed up as a counted one.
test('the POSIX legacy spelling stays inert on win32, even as the only directory present', {
  skip: process.platform !== 'win32'
    && 'this case asserts a win32-only rule: there is no second (legacy) spelling on this platform '
      + 'for the resolver to fall back to, so the assertion has no meaning on POSIX'
}, () => {
  withHome((_home, mkProject) => {
    mkProject('Users-me-app');
    assert.equal(path.basename(projectDir('/Users/me/app')), '-Users-me-app');
  });
});

test('a legacy-only install with dots resolves to its undashed twin', () => {
  withHome((_home, mkProject) => {
    // The legacy key kept dots, so the fallback has to keep them too — deriving
    // it from the new key by stripping the leading dash would look for
    // 'Users-me-MDv0-3-0' and find nothing.
    const legacy = mkProject(legacyName('/Users/me/MDv0.3.0'));
    assert.equal(projectDir('/Users/me/MDv0.3.0'), legacy);
  });
});

test('the real failing path resolves to the dir Claude Code actually writes', () => {
  withHome((_home, mkProject) => {
    // The exact cwd whose transcripts the condense step could not find (#123).
    const cwd = '/Users/vyapakgoyal/Documents/HarnessAgents';
    mkProject('-Users-vyapakgoyal-Documents-HarnessAgents');
    mkProject('Users-vyapakgoyal-Documents-HarnessAgents');
    assert.equal(
      path.basename(projectDir(cwd)),
      '-Users-vyapakgoyal-Documents-HarnessAgents'
    );
  });
});

test('a root cwd never resolves to the projects directory itself', () => {
  withHome((home, _mkProject) => {
    // legacyProjectKey('/') is the empty string, and path.join(root, '') is the
    // projects ROOT — which always exists, so an unguarded fallback would hand
    // back the directory holding EVERY project and seed the session file there.
    const resolved = projectDir('/');
    assert.notEqual(resolved, path.join(home, '.claude/projects'));
    assert.equal(path.basename(resolved), '-');
  });
});
