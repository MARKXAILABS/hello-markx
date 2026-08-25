'use strict';

/**
 * GATE-02, half two: the env object each spawn site actually COMPOSES.
 *
 * `test/pty-env-allowlist.test.cjs` proves `allowFromEnv`'s arithmetic. This file
 * proves the three `pty.spawn` / `spawn` sites in `src/main/` actually call it —
 * by swapping `node-pty`'s `spawn` for a fake child and reading the `env` object
 * the third argument carries. It is the same mechanism `test/runtime-forget.test.cjs`
 * already uses to drive the real `onData` path.
 *
 * ⚠ CEILING OF THIS FILE — A STUB IS NOT AN OS. It proves that `PtyManager.spawn`,
 * `runHiddenClaude` and `MemoryManager.childEnv` compose the right env object. It
 * does NOT prove the operating system hands that object to a child, because
 * nothing here spawns a process. The OS half is the live `env` transcript from a
 * real agent terminal recorded in this plan's SUMMARY. Neither half is the
 * evidence alone; the two together are.
 *
 * ⚠ WHAT COUNTS AS A POSITIVE HERE (D-33 / D-40, T-04-ENV-07). `pty.ts` layers
 * `PATH`, `TERM`, `COLORTERM`, `FORCE_COLOR`, `...opts.env` (which carries
 * `AGENT_ID` and `HIVE_ROOT`) and `HIVE_SOCK_TOKEN` AFTER the base spread — so
 * every one of them is still present against `allowFromEnv = () => ({})`, and a
 * test whose only positives are those names is not evidence of anything. The
 * lower bound has to arrive THROUGH the filter: `HOME`/`USERPROFILE`, `TMP`/`TMPDIR`,
 * and a `HIVE_CANARY_KEEP` planted in the parent env. The post-spread names are
 * asserted in a separately-named REGRESSION case so the two can never be confused.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { PtyManager } = loadTs('src/main/pty.ts');
const { runHiddenClaude } = loadTs('src/main/hiddenClaude.ts');
const { MemoryManager } = loadTs('src/main/memory.ts');

const nodePty = require('node-pty');

/** Swap node-pty's spawn for a fake child and hand back the captured options.
 *  `pty.spawn` is looked up on the module object at call time, so a property
 *  swap is enough; restored on teardown. */
function captureSpawns(t) {
  const realSpawn = nodePty.spawn;
  const calls = [];
  nodePty.spawn = (file, args, opts) => {
    calls.push({ file, args, opts });
    return {
      pid: 0,
      cols: 80, rows: 24,
      onData: () => {}, onExit: () => {},
      kill: () => {}, write: () => {}, resize: () => {}
    };
  };
  t.after(() => { nodePty.spawn = realSpawn; });
  return calls;
}

/** Plant names in the PARENT env for the duration of one test. A planted name is
 *  what makes both directions REACHABLE: without it the negative is satisfied by
 *  a variable that was never there, and the positive by a filter that did nothing. */
function plant(t, vars) {
  const prior = new Map();
  for (const [k, v] of Object.entries(vars)) {
    prior.set(k, process.env[k]);
    process.env[k] = v;
  }
  t.after(() => {
    for (const [k, v] of prior) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
}

const HOME_NAME = process.platform === 'win32' ? 'USERPROFILE' : 'HOME';
const TMP_NAME = process.platform === 'win32' ? 'TMP' : (process.env.TMPDIR ? 'TMPDIR' : 'TMP');

// ─── pty.ts — the roster PTY, the one GATE-02 names ───────────────────────────

test('THE GATE: the roster PTY env carries only what came THROUGH the filter', (t) => {
  plant(t, { HIVE_CANARY_KEEP: '1', CANARY_DROP: '1', AWS_SECRET_ACCESS_KEY: 'AKIAfake' });
  const calls = captureSpawns(t);

  const manager = new PtyManager();
  manager.setHookTokenSource(() => 'tok-1', () => {});
  const res = manager.spawn({
    id: 'gate-1',
    cwd: process.cwd(),
    command: process.execPath,
    env: { AGENT_ID: 'dev1', HIVE_ROOT: '/hive' }
  });
  assert.equal(res.ok, true, res.error);
  assert.equal(calls.length, 1);
  const env = calls[0].opts.env;

  // ── the POSITIVE lower bound: names with NO later layer, so all three are
  //    gone if allowFromEnv returns {} or if the PTY never spawned at all.
  assert.equal(env[HOME_NAME], process.env[HOME_NAME], `${HOME_NAME} came through the filter`);
  assert.ok(process.env[TMP_NAME], `precondition: the parent has ${TMP_NAME}`);
  assert.equal(env[TMP_NAME], process.env[TMP_NAME], `${TMP_NAME} came through the filter`);
  assert.equal(env.HIVE_CANARY_KEEP, '1', 'a planted HIVE_* name came through the filter');

  // ── the NEGATIVE: a planted credential that WAS in the parent env.
  assert.equal('CANARY_DROP' in env, false, 'a planted operator credential is dropped');
  assert.equal('AWS_SECRET_ACCESS_KEY' in env, false);

  manager.kill('gate-1');
});

test('REGRESSION CHECK, NOT THE GATE: every post-spread layer is untouched', (t) => {
  // Each of these is layered in AFTER `...allowFromEnv(...)`, so each would still
  // be present against a filter that returned {}. They are asserted because the
  // change must not break a working floor — never as evidence that it filtered.
  const calls = captureSpawns(t);
  const manager = new PtyManager();
  manager.setHookTokenSource(() => 'tok-2', () => {});
  assert.equal(manager.spawn({
    id: 'reg-1',
    cwd: process.cwd(),
    command: process.execPath,
    env: { AGENT_ID: 'dev2', HIVE_ROOT: '/hive2' }
  }).ok, true);
  const env = calls[0].opts.env;

  assert.equal(env.AGENT_ID, 'dev2');
  assert.equal(env.HIVE_ROOT, '/hive2');
  assert.equal(env.HIVE_SOCK_TOKEN, 'tok-2');
  assert.ok(env.PATH, 'PATH is set');
  assert.equal(env.TERM, 'xterm-256color');
  assert.equal(env.COLORTERM, 'truecolor');
  assert.equal(env.FORCE_COLOR, '1');
  if (process.platform !== 'win32') {
    assert.ok(env.LANG, 'the POSIX locale pair survives');
    assert.ok(env.LC_CTYPE);
  }

  manager.kill('reg-1');
});

test('the operator escape hatch reaches the PTY through SpawnOptions, both ways', (t) => {
  plant(t, { CANARY_DROP: '1' });
  const calls = captureSpawns(t);
  const manager = new PtyManager();

  assert.equal(manager.spawn({
    id: 'pass-on', cwd: process.cwd(), command: process.execPath,
    envPassThrough: ['CANARY_DROP']
  }).ok, true);
  assert.equal(calls[0].opts.env.CANARY_DROP, '1', 'a listed name is re-admitted');
  manager.kill('pass-on');

  assert.equal(manager.spawn({
    id: 'pass-off', cwd: process.cwd(), command: process.execPath,
    envPassThrough: []
  }).ok, true);
  assert.equal('CANARY_DROP' in calls[1].opts.env, false, 'with the list emptied it is gone');
  manager.kill('pass-off');
});

// ─── hiddenClaude.ts — the `bypassPermissions` session (T-04-ENV-09) ──────────

test('hiddenClaude: the most injection-exposed spawn in the app is filtered too', async (t) => {
  plant(t, { CANARY_HIDDEN: '1', AWS_SECRET_ACCESS_KEY: 'AKIAfake', HIVE_CANARY_KEEP: '1' });
  const calls = captureSpawns(t);

  // timeoutMs settles the promise without any fake output; bootCapMs sits above
  // it so the prompt-write path never arms a timer that outlives the test.
  await runHiddenClaude('ping', {
    model: 'claude-haiku-4-5',
    cwd: process.cwd(),
    command: process.execPath,
    envPassThrough: ['CANARY_HIDDEN'],
    bootCapMs: 5_000,
    timeoutMs: 60
  });

  assert.equal(calls.length, 1, 'the hidden session spawned');
  const env = calls[0].opts.env;
  // Positive lower bound first — an unfiltered spread also satisfies the negative.
  assert.equal(env[HOME_NAME], process.env[HOME_NAME]);
  assert.equal(env.HIVE_CANARY_KEEP, '1');
  assert.equal(env.CANARY_HIDDEN, '1', 'opts.envPassThrough re-admits a name');
  assert.ok(env.PATH, 'PATH is still replaced with the login-shell PATH');
  // ...then the negative.
  assert.equal('AWS_SECRET_ACCESS_KEY' in env, false, 'the operator credential is dropped');
});

// ─── memory.ts — the mempalace CLI, filtered with an EMPTY list (ceiling (h)) ──

test('memory: the mempalace child env is filtered, with no pass-through by design', (t) => {
  plant(t, { AWS_SECRET_ACCESS_KEY: 'AKIAfake', HIVE_CANARY_KEEP: '1', CANARY_DROP: '1' });
  const mm = new MemoryManager(() => 'C:/no/such/hive', () => ({ enabled: true, model: 'minilm', scope: 'shared' }));
  const env = mm.childEnv('dev1');

  // Positives: everything mempalace genuinely needs is on ENV_ALLOW, which is the
  // whole reason an empty pass-through list is safe here rather than merely cheap.
  assert.ok(env.PATH, 'PATH survives — without it `mempalace` is unreachable');
  assert.equal(env[HOME_NAME], process.env[HOME_NAME]);
  assert.equal(env.HIVE_CANARY_KEEP, '1');
  assert.equal(typeof env.MEMPALACE_PALACE_PATH, 'string', 'the palace layer still lands');
  assert.equal(env.MEMPALACE_EMBEDDING_MODEL, 'minilm');
  // Negatives.
  assert.equal('AWS_SECRET_ACCESS_KEY' in env, false);
  assert.equal('CANARY_DROP' in env, false);
});
