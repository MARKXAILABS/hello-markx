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

/** The SAME module object `lifecycle.ts` calls `worktreeHasUnintegratedWork`
 *  through — `load-ts.cjs` caches by filename, and the CommonJS emit reads the
 *  export off the namespace at CALL time, so re-assigning a member here is the
 *  only injection point this module has for a git failure. Always restore it in
 *  a `t.after`, or the fake leaks into every later case in this file. */
const gitModule = loadTs('src/main/git.ts');

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

/** Poll until `predicate` holds, rather than sleeping a fixed interval: the
 *  `void`-fired continuation shells REAL git, and a cold git on a loaded
 *  Windows box is slower than any constant worth hard-coding. Returns false on
 *  timeout so the caller can assert on it with its own message. */
async function until(predicate, ms = 20000) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (predicate()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** One task card, shaped exactly as `tasks.json` holds one. */
function card(over = {}) {
  return {
    id: 't1', title: 'ship the thing', status: 'doing', assignee: 'agent-x',
    dependsOn: [], priority: 1, createdAt: '2026-08-25T00:00:00.000Z', ...over
  };
}

/** A fresh set of fakes satisfying AgentTeardownDeps, plus the call-count
 *  spies every test reads back. `hive.root()` returns null (no scratch dir
 *  in play) unless a test overrides it.
 *
 *  The third return value is the task LEDGER the fake `hive` reads and patches.
 *  It starts empty, so every pre-VIGIL-02 case in this file sees a teardown
 *  with no card in flight and is unaffected. */
function fakeDeps(overrides = {}) {
  const calls = {
    integrationBrokerRevoke: [], breakerForget: [], controlForget: [], telemetryForget: [],
    hiveStopProxyBridge: [], hiveSetArchived: [], deliveryForgetPty: [], syncKeepAwake: 0,
    savePreservedWorktrees: 0, informGod: [], hivePatchTask: []
  };
  const ledger = { tasks: [], rev: 0, updatedAt: '' };
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
      root: () => null,
      // A deep COPY, exactly as the real HiveManager.tasks() hands back: it
      // re-reads tasks.json and widens every row with the card meter, so a
      // caller that mutates what it read can never reach the store.
      tasks: () => JSON.parse(JSON.stringify(ledger)),
      // HiveManager.patchTask merges at the TOP level only and re-pins the id;
      // writeJson then drops undefined keys, which is how `assignee: undefined`
      // clears the field rather than persisting a null.
      patchTask: (id, patch) => {
        calls.hivePatchTask.push({ id, patch });
        const i = ledger.tasks.findIndex((t) => t && t.id === id);
        if (i < 0) return false;
        ledger.tasks[i] = JSON.parse(JSON.stringify({ ...ledger.tasks[i], ...patch, id }));
        return true;
      }
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
  return { deps, calls, ledger };
}

/** Wire a pty that owns a real worktree, so teardown routes through
 *  finalizeAgentWorktree's continuation (the write-2 half). */
function withWorktree(deps, ptyId, { wt, repo, base }) {
  deps.worktreePaths.set(ptyId, wt);
  deps.worktreeOrigins.set(ptyId, repo);
  deps.worktreeBases.set(ptyId, base);
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

// ─── VIGIL-02: a card whose owner died goes back on the board within a minute,
//     naming who dropped it and where their branch is ───────────────────────
//
// TWO writes, and the split is the design (04-RESEARCH L-09, ADR-0003):
//
//  1. SYNCHRONOUS, in `teardownPty` immediately after `hive.setArchived` — the
//     card returns to `todo`, its assignee is cleared, and `released:{by,at}`
//     names the dead agent. "Within a minute" is met in the same tick the PTY
//     exit was observed (D-27); no sweep is involved and none is tested here.
//  2. LATER, from `finalizeAgentWorktree`'s continuation — `released.branch`
//     and `.detail`, taken from the ONE `worktreeHasUnintegratedWork` call that
//     function already makes. It lives inside that function's try/catch on
//     purpose: a git failure may cost the enrichment and must NEVER cost the
//     release, which is ADR-0003's bias applied to the board instead of to disk.
//
// Rule R-1 (04-UI-SPEC §S6b) governs the gap between them: absence is the
// correct representation of "branch not known yet". A sentinel string would be
// indistinguishable from a real branch named `unknown`, so the assertions below
// are `=== undefined`, strictly, never merely falsy.

test('VIGIL-02: teardownPty releases the dead agent\'s in-flight card in the SAME TICK, naming who dropped it', () => {
  const { deps, calls, ledger } = fakeDeps();
  ledger.tasks.push(card());
  deps.ptyToAgent.set('pty1', 'agent-x');

  // D-27, and the reason this case is not `async`: NOTHING runs between the
  // call and the assertions — no await, no timer, not one microtask turn. A
  // test that yields first cannot tell "same tick" from "a sweep got there
  // eventually", which is the entire claim VIGIL-02 makes.
  teardownPty('pty1', deps);

  const t1 = ledger.tasks[0];
  assert.equal(t1.status, 'todo', 'the dead agent\'s card still reads as in progress — the VIGIL-02 failure verbatim');
  assert.equal(t1.assignee, undefined, 'the card is still assigned to an agent whose pty exited');
  assert.ok(t1.released, 'the card does not record that it was released at all');
  assert.equal(t1.released.by, 'agent-x', 'the released card does not name who dropped it');
  assert.equal(t1.released.at, new Date(t1.released.at).toISOString(),
    `released.at is not an ISO-8601 instant (D-30's convention): ${t1.released.at}`);
  assert.equal(t1.released.branch, undefined,
    'write 1 invented a branch placeholder — rule R-1 forbids it: git has not run yet, and absence IS the representation');
  assert.equal(calls.hivePatchTask.length, 1, 'exactly one ledger write belongs to the teardown tick');
});

test('VIGIL-02: an agent holding no card writes NOTHING to the ledger', () => {
  const { deps, calls, ledger } = fakeDeps();
  ledger.tasks.push(card({ id: 'theirs', assignee: 'agent-y' }));
  ledger.tasks.push(card({ id: 'unclaimed', status: 'todo', assignee: undefined }));
  deps.ptyToAgent.set('pty1', 'agent-x');

  teardownPty('pty1', deps);

  assert.equal(calls.hivePatchTask.length, 0,
    'a spurious patch was written for an agent that held nothing — every ledger write costs a CAS round and a commit');
  // The positive lower bound beside the zero (D-33): the teardown really did run
  // over this dep set, so the zero above is a measured zero and not a case that
  // exercised nothing.
  assert.deepEqual(calls.hiveSetArchived, [{ id: 'agent-x', archived: true }],
    'the teardown never ran, so the zero above proves nothing');
});

test('VIGIL-02: a ledger write failure is logged, not fatal — the rest of teardown still runs', () => {
  const { deps, calls, ledger } = fakeDeps();
  ledger.tasks.push(card());
  deps.hive.patchTask = () => { throw new Error('forced: tasks.json is locked'); };
  deps.ptyToAgent.set('pty1', 'agent-x');

  assert.doesNotThrow(() => teardownPty('pty1', deps),
    'a ledger failure aborted a cleanup path that must always finish — the pty is already gone either way');
  assert.deepEqual(calls.deliveryForgetPty, ['pty1'], 'delivery never forgot the pty');
  assert.deepEqual(calls.telemetryForget, ['agent-x'], 'telemetry never forgot the agent');
  assert.equal(calls.syncKeepAwake, 1, 'the power-save blocker was never re-evaluated');
});

test('VIGIL-02: the released card gains branch and detail from the ONE git call that already ran', async (t) => {
  const wtree = repoWithWorktree(t, { dirty: true });
  const { deps, calls, ledger } = fakeDeps();
  ledger.tasks.push(card());
  deps.ptyToAgent.set('pty1', 'agent-x');
  withWorktree(deps, 'pty1', wtree);

  teardownPty('pty1', deps);

  assert.equal(ledger.tasks[0].released.branch, undefined,
    'a branch appeared in the teardown tick — git has not been shelled yet, so it can only be a placeholder');
  assert.ok(await until(() => ledger.tasks[0].released?.branch !== undefined),
    'write 2 never landed: the released card never gained the branch its own git call had in hand');
  assert.equal(ledger.tasks[0].released.branch, 'agent/1', 'the branch is not the worktree\'s actual branch');
  assert.ok(ledger.tasks[0].released.detail.length > 0, 'released.detail is empty');
  assert.equal(ledger.tasks[0].released.by, 'agent-x', 'write 2 clobbered write 1\'s facts instead of patching beside them');
  assert.equal(ledger.tasks[0].status, 'todo', 'write 2 moved the card off the board');
  assert.equal(calls.hivePatchTask.length, 2, 'exactly two ledger writes: the release, then its enrichment');
  assert.ok(existsSync(wtree.wt), 'ADR-0003 still governs the teardown: a worktree holding unintegrated work is PRESERVED');
});

test('VIGIL-02: a forced git failure costs the branch enrichment and NEVER the release', async (t) => {
  const real = gitModule.worktreeHasUnintegratedWork;
  let reachedGit = 0;
  gitModule.worktreeHasUnintegratedWork = async () => {
    reachedGit += 1;
    throw new Error('forced: git exploded');
  };
  t.after(() => { gitModule.worktreeHasUnintegratedWork = real; });

  const wtree = repoWithWorktree(t, { dirty: true });
  const { deps, calls, ledger } = fakeDeps();
  ledger.tasks.push(card());
  deps.ptyToAgent.set('pty1', 'agent-x');
  withWorktree(deps, 'pty1', wtree);

  assert.doesNotThrow(() => teardownPty('pty1', deps));
  assert.equal(ledger.tasks[0].released.by, 'agent-x', 'the release did not even reach the ledger');

  // The positive bound on the negative below: the continuation really did reach
  // the git call and really did get a rejection. Without this, an implementation
  // that never fires the continuation at all would pass the `undefined` assert.
  assert.ok(await until(() => reachedGit === 1),
    'the continuation never reached git, so the failure path was never exercised');
  await new Promise((r) => setTimeout(r, 100)); // let the rejection reach its catch

  assert.equal(ledger.tasks[0].released.branch, undefined,
    'strictly undefined, never a sentinel: a placeholder is indistinguishable from a real branch named `unknown` (rule R-1)');
  assert.equal(ledger.tasks[0].released.by, 'agent-x',
    'the git failure took the release down with it — ADR-0003 inverted, and the VIGIL-02 bug back');
  assert.equal(ledger.tasks[0].status, 'todo', 'the card left the board when git failed');
  assert.equal(calls.hivePatchTask.length, 1, 'exactly the release, and no enrichment');
});

test('VIGIL-02: a card held by a DIFFERENT agent is byte-identical across both writes', async (t) => {
  const wtree = repoWithWorktree(t, { dirty: true });
  const { deps, ledger } = fakeDeps();
  ledger.tasks.push(card({ id: 'mine' }), card({ id: 'theirs', assignee: 'agent-y' }));
  const untouched = JSON.stringify(ledger.tasks[1]);
  deps.ptyToAgent.set('pty1', 'agent-x');
  withWorktree(deps, 'pty1', wtree);

  teardownPty('pty1', deps);
  assert.equal(JSON.stringify(ledger.tasks[1]), untouched, 'write 1 touched a live agent\'s card');

  assert.ok(await until(() => ledger.tasks[0].released?.branch !== undefined),
    'write 2 never ran, so this case proves nothing about it');
  assert.equal(JSON.stringify(ledger.tasks[1]), untouched, 'write 2 touched a live agent\'s card');
});

test('VIGIL-02: a card re-taken between the two writes is NOT re-stamped by the dead agent\'s continuation', async (t) => {
  const wtree = repoWithWorktree(t, { dirty: true });
  const { deps, ledger } = fakeDeps();
  ledger.tasks.push(card({ id: 'grabbed' }), card({ id: 'left-alone' }));
  deps.ptyToAgent.set('pty1', 'agent-x');
  withWorktree(deps, 'pty1', wtree);

  teardownPty('pty1', deps);
  assert.equal(ledger.tasks[0].released.by, 'agent-x', 'write 1 never released the card this case is about');

  // A human takes the freed card off the board before git finishes.
  ledger.tasks[0] = { ...ledger.tasks[0], status: 'doing', assignee: 'agent-z' };
  const grabbed = JSON.stringify(ledger.tasks[0]);

  // `left-alone` is the witness that write 2 ran at all — without it, an
  // implementation with no write 2 whatsoever would pass the no-op assertion.
  assert.ok(await until(() => ledger.tasks[1].released?.branch !== undefined),
    'write 2 never ran, so the no-op below proves nothing');
  assert.equal(JSON.stringify(ledger.tasks[0]), grabbed,
    'a dead agent\'s continuation re-stamped a card a human had already re-assigned');
});

test('VIGIL-02: the release is written between setArchived and the void-fired worktree finalizer, with no await in between', () => {
  const lines = readFileSync(join(__dirname, '..', 'src', 'main', 'floor', 'lifecycle.ts'), 'utf8').split(/\r?\n/);
  const lineOf = (needle, from = 0) => {
    const i = lines.findIndex((l, n) => n >= from && l.includes(needle));
    assert.notEqual(i, -1, `lifecycle.ts no longer contains ${needle}`);
    return i;
  };
  const teardown = lineOf('export function teardownPty(');
  const archived = lineOf('deps.hive.setArchived(', teardown);
  const finalizer = lineOf('void finalizeAgentWorktree(', archived);
  const window = lines.slice(archived + 1, finalizer);

  assert.ok(window.some((l) => l.includes('released')),
    'nothing between setArchived and the worktree finalizer releases the card — VIGIL-02\'s write 1 is missing or misplaced');
  assert.deepEqual(window.filter((l) => /\bawait\b/.test(l)), [],
    'an await between setArchived and the release means the card is no longer freed in the teardown TICK (D-27)');
  // Both directions (D-33): the window is a real, non-empty extract of the
  // function, so the "no await" zero above is measured rather than vacuous.
  assert.ok(window.length > 0 && finalizer > archived,
    'the extracted window is empty — the assertions above parsed nothing');
});
