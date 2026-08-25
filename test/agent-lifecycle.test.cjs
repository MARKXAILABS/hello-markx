'use strict';

/**
 * The Wave-0 row neither frozen plan claimed (02-VALIDATION.md:55, STRUCT-01):
 * `src/main/floor/lifecycle.ts`'s agent-teardown state machine, driven with a
 * REAL git repo and a real worktree, and NO PTY spawn anywhere — every
 * collaborator that would otherwise be Electron/PTY-shaped is a fake.
 *
 * Modelled on test/main-hardening.test.cjs's tempDir(t, prefix) (realpath'd,
 * so macOS's /var -> /private/var symlink doesn't make every assertion here
 * a symlink test by accident) and its real-git-repo setup.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, realpathSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const loadTs = require('./load-ts.cjs');

const {
  teardownPty, releaseWorkerPty, finalizeWorkerWorktree, finalizeAgentWorktree, workerScratchDir
} = loadTs('src/main/floor/lifecycle.ts');

/** A temp dir that cleans itself up, realpath'd for the same reason
 *  main-hardening.test.cjs's tempDir is. */
function tempDir(t, prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* noop */ } });
  return dir;
}

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' });

/** A real git repo plus one worktree off it, base branch returned too. */
function repoWithWorktree(t, { dirty } = {}) {
  const root = tempDir(t, 'al-repo-');
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
  if (dirty) writeFileSync(join(wt, 'scratch.txt'), 'an hour of work\n');
  return { root, repo, wt, base };
}

/** A fresh set of fakes satisfying AgentTeardownDeps, plus the call-count
 *  spies every test reads back. `hive.root()` returns null (no scratch dir
 *  in play) unless a test overrides it. */
function fakeDeps(overrides = {}) {
  const calls = {
    integrationBrokerRevoke: [], breakerForget: [], controlForget: [], telemetryForget: [],
    hiveStopProxyBridge: [], hiveSetArchived: [], deliveryForgetPty: [], syncKeepAwake: 0,
    savePreservedWorktrees: 0, informGod: []
  };
  const deps = {
    integrationBroker: { revoke: (id) => calls.integrationBrokerRevoke.push(id) },
    ptyToAgent: new Map(),
    breaker: { forget: (id) => calls.breakerForget.push(id) },
    control: { forget: (id) => calls.controlForget.push(id) },
    telemetry: { forget: (id) => calls.telemetryForget.push(id) },
    hive: {
      stopProxyBridge: (id) => calls.hiveStopProxyBridge.push(id),
      enabled: () => true,
      setArchived: (id, archived) => calls.hiveSetArchived.push({ id, archived }),
      root: () => null
    },
    worktreePaths: new Map(),
    worktreeOrigins: new Map(),
    worktreeBases: new Map(),
    liveWorkers: new Map(),
    preservedWorktrees: new Map(),
    spawnRecipes: new Map(),
    delivery: { forgetPty: (id) => calls.deliveryForgetPty.push(id) },
    syncKeepAwake: () => { calls.syncKeepAwake += 1; },
    savePreservedWorktrees: () => { calls.savePreservedWorktrees += 1; },
    informGod: (subject, body, slack) => calls.informGod.push({ subject, body, slack }),
    ...overrides
  };
  return { deps, calls };
}

// ─── 1. A dirty worktree is PRESERVED (ADR-0003) ────────────────────────────

test('finalizeWorkerWorktree PRESERVES a worker worktree holding unintegrated work', async (t) => {
  const { wt, repo, base } = repoWithWorktree(t, { dirty: true });
  const { deps, calls } = fakeDeps();
  const worker = { workerId: 'w1', reqId: 'r1', baseBranch: base, spawnedAt: Date.now() };

  await finalizeWorkerWorktree(wt, repo, worker, deps);

  assert.ok(existsSync(wt), 'a worktree holding unintegrated work was removed from disk');
  const entry = deps.preservedWorktrees.get(wt);
  assert.ok(entry, 'no entry was registered in preservedWorktrees for the preserved worktree');
  assert.equal(entry.workerId, 'w1');
  assert.equal(calls.savePreservedWorktrees, 1,
    '#14: the in-memory Map alone is the bug — the durable ledger write must also run');
  assert.equal(calls.informGod.length, 1, 'god was not told about the preserved worktree');
});

// ─── 2. A clean, integrated worktree is REMOVED ─────────────────────────────

test('finalizeWorkerWorktree REMOVES a clean, fully-integrated worker worktree', async (t) => {
  const { wt, repo, base } = repoWithWorktree(t, { dirty: false });
  const { deps, calls } = fakeDeps();
  const worker = { workerId: 'w2', reqId: 'r2', baseBranch: base, spawnedAt: Date.now() };

  await finalizeWorkerWorktree(wt, repo, worker, deps);

  assert.equal(existsSync(wt), false, 'a clean, integrated worktree was left in place');
  // A removed worktree is ALSO recorded in preservedWorktrees, per boot.ts's
  // verbatim behaviour — it is the map's ledger of every worktree teardown
  // touched, not only the ones it kept; savePreservedWorktrees still fires.
  assert.equal(calls.savePreservedWorktrees, 1);
});

// ─── 3. finalizeAgentWorktree's deliberate asymmetry ────────────────────────

test('finalizeAgentWorktree PRESERVES a dirty worktree but registers NOTHING in preservedWorktrees', async (t) => {
  const { wt, repo, base } = repoWithWorktree(t, { dirty: true });
  const { deps } = fakeDeps();

  await finalizeAgentWorktree('agent-1', wt, repo, base, deps);

  assert.ok(existsSync(wt), 'a dirty agent worktree was removed');
  assert.equal(deps.preservedWorktrees.size, 0,
    'ADR-0003\'s deliberate asymmetry: a real agent\'s scratch dir is its memory/inbox, not a '
    + 'worker\'s disposable scratch, and must NOT be registered in preservedWorktrees');
});

test('finalizeAgentWorktree REMOVES a clean, integrated worktree', async (t) => {
  const { wt, repo, base } = repoWithWorktree(t, { dirty: false });
  const { deps } = fakeDeps();

  await finalizeAgentWorktree('agent-2', wt, repo, base, deps);

  assert.equal(existsSync(wt), false, 'a clean, integrated agent worktree was left in place');
});

// ─── 4. teardownPty's bookkeeping, no worktree in play ──────────────────────

test('teardownPty clears every bookkeeping map and calls every collaborator exactly once', () => {
  const { deps, calls } = fakeDeps();
  deps.ptyToAgent.set('pty1', 'agent-x');
  deps.spawnRecipes.set('pty1', { opts: {}, owner: null });

  teardownPty('pty1', deps);

  assert.equal(deps.ptyToAgent.has('pty1'), false, 'ptyToAgent still holds the torn-down pty');
  assert.equal(deps.spawnRecipes.has('pty1'), false, 'spawnRecipes still holds the torn-down pty');
  assert.deepEqual(calls.hiveSetArchived, [{ id: 'agent-x', archived: true }],
    'hive.setArchived was not called with the right agent id — #14: a stale un-archived entry '
    + 'would deny every PreToolUse of a fresh session spawned with a REUSED id');
  assert.deepEqual(calls.deliveryForgetPty, ['pty1']);
  assert.deepEqual(calls.integrationBrokerRevoke, ['pty1']);
  assert.deepEqual(calls.breakerForget, ['agent-x']);
  assert.deepEqual(calls.controlForget, ['agent-x']);
  assert.deepEqual(calls.telemetryForget, ['agent-x']);
  assert.deepEqual(calls.hiveStopProxyBridge, ['agent-x']);
  assert.equal(calls.syncKeepAwake, 1);
});

// ─── 5. Idempotence — an explicit pty:kill and node-pty's own onExit both
//        reach teardownPty for the SAME id, and the second call must be a
//        harmless no-op ─────────────────────────────────────────────────────

test('teardownPty is idempotent: a second call for the same id is a harmless no-op', () => {
  const { deps, calls } = fakeDeps();
  deps.ptyToAgent.set('pty1', 'agent-x');
  deps.spawnRecipes.set('pty1', { opts: {}, owner: null });

  teardownPty('pty1', deps);
  const after1 = { ...calls, informGod: [...calls.informGod] };

  teardownPty('pty1', deps); // node-pty's onExit, arriving after an explicit pty:kill already ran

  assert.equal(calls.hiveSetArchived.length, after1.hiveSetArchived.length,
    'a second teardownPty() call for the same id re-archived the agent');
  assert.equal(calls.deliveryForgetPty.length, after1.deliveryForgetPty.length,
    'a second teardownPty() call for the same id re-forgot the pty from delivery');
  assert.equal(calls.integrationBrokerRevoke.length, 2,
    'integrationBroker.revoke is best-effort and unconditional by design (no id-presence guard) — '
    + 'both calls reach it, which is fine: revoking an already-revoked grant is a no-op on that side');
  assert.equal(calls.syncKeepAwake, 2, 'syncKeepAwake re-evaluating twice is harmless by design');
});

// ─── workerScratchDir ────────────────────────────────────────────────────────

test('workerScratchDir joins the hive root and the worker id, or null with no hive root', () => {
  const { deps } = fakeDeps({ hive: { ...fakeDeps().deps.hive, root: () => '/hive' } });
  assert.equal(workerScratchDir('w1', deps), join('/hive', 'agents', 'w1'));

  const { deps: noRoot } = fakeDeps();
  assert.equal(workerScratchDir('w1', noRoot), null, 'no harness home means no scratch dir path');
});

// ─── teardownPty routes a worker-owned pty through finalizeWorkerWorktree,
//     and a normal agent's through finalizeAgentWorktree ────────────────────

test('teardownPty with a live worktree and a WorkerRec routes through the worker finalizer', async (t) => {
  const { wt, repo, base } = repoWithWorktree(t, { dirty: true });
  const { deps, calls } = fakeDeps();
  deps.worktreePaths.set('pty1', wt);
  deps.worktreeOrigins.set('pty1', repo);
  deps.worktreeBases.set('pty1', base);
  deps.liveWorkers.set('pty1', { workerId: 'w1', reqId: 'r1', baseBranch: base, spawnedAt: Date.now() });

  teardownPty('pty1', deps);
  // finalizeWorkerWorktree runs un-awaited inside teardownPty (`void finalizeWorkerWorktree(...)`)
  // — give its microtasks/async git calls a turn before asserting on its effects.
  await new Promise((r) => setTimeout(r, 500));

  assert.equal(deps.liveWorkers.has('pty1'), false, 'liveWorkers still holds the torn-down worker');
  assert.ok(existsSync(wt), 'a dirty worker worktree was removed instead of preserved');
  assert.equal(calls.savePreservedWorktrees, 1, 'the worker path did not run — savePreservedWorktrees never fired');
});

// ─── MAIN-01: releasing a worker must ALWAYS reach teardown ─────────────────
//
// The ephemeral-worker paths (`ephemeralWorkerTick`'s three reap branches and
// the `workers:stop` handler) set `rec.releasing = true` and then called
// `ptyManager.kill(workerId)` BARE. Two independent facts, both read off
// src/main/pty.ts, make that a permanent leak rather than a race:
//
//  1. `kill()` deletes the session from `sessions` BEFORE node-pty's `onExit`
//     ever fires, and `onExit`'s identity guard (`sessions.get(id) !== session`)
//     then returns early — so the exit handler NEVER runs teardown for an
//     EXPLICIT kill. `killByOwner`'s own comment states it: "kill()'s callers
//     all follow it with teardownPty". `pty:kill` and `killAgent` do. The
//     worker paths did not.
//  2. `kill()` never throws; a failure comes back as `{ ok:false }`, which
//     those call sites discarded.
//
// Nothing anywhere resets `releasing`, so the record sat in `liveWorkers`
// forever: `if (rec.releasing) continue` made the reap loop skip it, a repeat
// `workers:stop` answered `{ ok:true }` for a worker that never died, and it
// held a `maxConcurrentWorkers` slot until the app restarted.

test('releaseWorkerPty tears the worker down even when the PTY kill FAILS, and reports that failure verbatim', async (t) => {
  const { wt, repo, base } = repoWithWorktree(t, { dirty: true });
  const { deps } = fakeDeps();
  deps.worktreePaths.set('w1', wt);
  deps.worktreeOrigins.set('w1', repo);
  deps.worktreeBases.set('w1', base);
  deps.liveWorkers.set('w1', { workerId: 'w1', reqId: 'r1', baseBranch: base, spawnedAt: Date.now(), releasing: true });

  const res = releaseWorkerPty('w1', {
    killPty: () => ({ ok: false, error: 'no pty: w1' }), // verbatim PtyManager.kill() failure shape
    teardownPty: (id) => teardownPty(id, deps),          // the REAL teardown, over the real dep set
    liveWorkers: deps.liveWorkers
  });

  assert.equal(res.ok, false,
    'a failed kill must be reported as a failure — answering ok:true for a worker that never died is the bug');
  assert.equal(res.error, 'no pty: w1', 'the kill result must cross back verbatim rather than being swallowed');
  assert.equal(deps.liveWorkers.has('w1'), false,
    'the stranded record still holds a maxConcurrentWorkers slot, and the reap loop skips it forever');

  // finalizeWorkerWorktree runs un-awaited inside teardownPty — give it a turn.
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(existsSync(wt), 'ADR-0003 still governs the failed-kill path: unintegrated work must be PRESERVED');
});

test('releaseWorkerPty tears the worker down on a SUCCESSFUL kill too — onExit can no longer reach teardown', () => {
  const { deps } = fakeDeps();
  deps.liveWorkers.set('w2', { workerId: 'w2', reqId: 'r2', baseBranch: 'main', spawnedAt: Date.now(), releasing: true });

  const res = releaseWorkerPty('w2', {
    killPty: () => ({ ok: true }),
    teardownPty: (id) => teardownPty(id, deps),
    liveWorkers: deps.liveWorkers
  });

  assert.equal(res.ok, true);
  assert.equal(deps.liveWorkers.has('w2'), false,
    "kill() deletes the pty session, so onExit's identity guard bails — nothing else would ever free this slot");
});

test('releaseWorkerPty clears `releasing` when teardown could not drop the record, so a later reap retries', () => {
  const live = new Map([
    ['w3', { workerId: 'w3', reqId: 'r3', baseBranch: 'main', spawnedAt: Date.now(), releasing: true }]
  ]);

  const res = releaseWorkerPty('w3', {
    killPty: () => ({ ok: false, error: 'no pty: w3' }),
    teardownPty: () => { /* no floor bound yet: index.ts's `floor?.teardownPty` is a no-op */ },
    liveWorkers: live
  });

  assert.equal(res.ok, false);
  assert.equal(live.get('w3').releasing, false,
    'a latched `releasing` makes ephemeralWorkerTick skip this worker forever (`if (rec.releasing) continue`)');
});

test('index.ts\'s worker release paths route through the shared helper — no bare ptyManager.kill(workerId) survives', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8')
    .replace(/^[ \t]*\*.*$/gm, '')  // JSDoc continuation lines
    .replace(/\/\/.*$/gm, '');      // trailing + whole-line // comments
  assert.deepEqual(
    src.match(/ptyManager\.kill\(workerId\)/g) || [], [],
    'a worker kill that does not also run teardownPty strands the record in liveWorkers (MAIN-01)'
  );
  assert.ok(/releaseWorker\(workerId\)/.test(src),
    'the reap branches and workers:stop must both go through the shared release helper');
});
