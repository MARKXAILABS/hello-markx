'use strict';

/**
 * Regression for the 2026-08-15 webhook-card loss: ASK ME had read an eight-card
 * ledger, the webhook appended card nine, then ASK ME overwrote tasks.json with
 * its stale eight-card snapshot while recording an answer. Renderer actions must
 * mutate one card against the latest main-process ledger instead of replacing the
 * whole collection they happened to read earlier.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

// Strip line and block comments before any source-text pin — see
// test/repo-claims.test.cjs's own header for why an unstripped pin is a
// vacuous gate a comment can satisfy on its own.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-task-mutate-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return new HiveManager(() => home);
}

/** `floor(t)` does NOT call `ensureHive()`, so `hive/bin/task.cjs` is not on
 * disk — the `--q`/`askedBy` cases in this file drive the REAL generated CLI
 * (the shape `hive-protocol-v2.test.cjs:107-143` uses), so they need their
 * own fixture that does. */
function floorWithCli(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-task-mutate-cli-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  const cli = path.join(home, 'hive', 'bin', 'task.cjs');
  assert.ok(fs.existsSync(cli), 'the ledger CLI ships with the hive skeleton');
  const run = (env, ...args) => {
    const res = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env });
    assert.equal(res.status, 0, `task.cjs ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
    return JSON.parse(res.stdout.trim());
  };
  return { home, hive, cli, run };
}

function card(id, extra = {}) {
  return {
    id,
    title: id,
    status: 'todo',
    dependsOn: [],
    priority: 3,
    createdAt: '2026-08-15T08:00:00.000Z',
    ...extra
  };
}

function tasks(hive) {
  return hive.tasks().tasks;
}

test('patching a stale UI card preserves a concurrently appended webhook card', (t) => {
  const hive = floor(t);
  const question = card('needs-human', {
    status: 'blocked',
    humanQA: [{ q: 'Which option?', askedAt: '2026-08-15T08:00:00.000Z' }]
  });
  hive.writeTasks([question]);

  // The renderer still holds this one-card snapshot when the webhook arrives.
  const staleQuestion = structuredClone(tasks(hive)[0]);
  const webhook = card('webhook-1', {
    webhook: { tokenHash: 'a'.repeat(64) }
  });
  assert.equal(hive.addTask(webhook), true);

  staleQuestion.humanQA[0].a = 'Option B';
  staleQuestion.humanQA[0].answeredAt = '2026-08-15T08:00:01.000Z';
  assert.equal(hive.patchTask(staleQuestion.id, { humanQA: staleQuestion.humanQA }), true);

  assert.deepEqual(tasks(hive).map((task) => task.id), ['needs-human', 'webhook-1']);
  assert.equal(tasks(hive)[0].humanQA[0].a, 'Option B');
  assert.equal(tasks(hive)[1].webhook.tokenHash, 'a'.repeat(64));
});

test('atomic add is idempotent and delete removes only the named card', (t) => {
  const hive = floor(t);
  hive.writeTasks([card('existing')]);

  assert.equal(hive.addTask(card('new')), true);
  assert.equal(hive.addTask(card('new', { title: 'duplicate' })), false);
  assert.equal(hive.deleteTask('existing'), true);
  assert.equal(hive.deleteTask('missing'), false);

  assert.deepEqual(tasks(hive).map((task) => task.id), ['new']);
  assert.equal(tasks(hive)[0].title, 'new');
});

test('patch refuses an unknown card without rewriting the ledger', (t) => {
  const hive = floor(t);
  hive.writeTasks([card('existing')]);

  assert.equal(hive.patchTask('missing', { status: 'done' }), false);

  const after = hive.tasks();
  assert.equal(after.rev, 1,
    'the ledger revision advanced on a REFUSED patch, so the whole collection was written back '
    + 'anyway — the #17 clobber this file exists for, and one no card-content check can see');
  assert.deepEqual(after.tasks.map((c) => c.id), ['existing']);

  // D-22 (#34): rows read back through `hive:tasks` now also carry the card's
  // meter — `tokens` spent, the `budgetTokens` cap and `pct`. Those three are
  // DERIVED per read, not card data (`writeTasks` strips them before persisting),
  // so the card content is compared on its own and the meter is pinned beside it
  // rather than the whole widened row being compared to a bare card literal.
  const { tokens, budgetTokens, pct, ...persisted } = after.tasks[0];
  assert.deepEqual(persisted, card('existing'),
    'a refused patch changed the card that WAS there');
  assert.deepEqual({ tokens, budgetTokens, pct }, { tokens: 0, budgetTokens: null, pct: null },
    'an untouched card with no cap must meter as no spend and no cap — a null cap that reads '
    + 'as 0 would put every capless card permanently over budget');
});

// ─── D-37 — `askedBy` is recorded from the environment, and only the environment ───

test('AGENT_ID patch --q records the calling agent as askedBy and blocks the card', (t) => {
  const { hive, run } = floorWithCli(t);
  hive.writeTasks([card('needs-human')]);

  const patched = run({ ...process.env, AGENT_ID: 'jim-1' }, 'patch', 'needs-human', '--q', 'which account?');
  assert.equal(patched.task.status, 'blocked');
  assert.equal(patched.task.humanQA.at(-1).askedBy, 'jim-1');
  assert.equal(tasks(hive).find((c) => c.id === 'needs-human').humanQA.at(-1).askedBy, 'jim-1');
});

test('with AGENT_ID absent from the child env, patch --q records askedBy: god', (t) => {
  const { hive, run } = floorWithCli(t);
  hive.writeTasks([card('needs-human')]);

  // Build a FRESH env object with the key deleted, never merely set empty —
  // an empty string is still a truthy assignment site and `process.env.AGENT_ID`
  // on an empty string is falsy in JS either way, but a stray case-variant key
  // left in the object would satisfy `process.env.AGENT_ID` on Windows, where
  // the environment block is case-insensitive. Assert the constructed env is
  // really clean before trusting the run.
  const env = { ...process.env };
  delete env.AGENT_ID;
  const leftover = Object.keys(env).filter((k) => /^AGENT_ID$/i.test(k));
  assert.deepEqual(leftover, [], 'the child env must carry no AGENT_ID key in any case variant');

  const patched = run(env, 'patch', 'needs-human', '--q', 'which account?');
  assert.equal(patched.task.humanQA.at(-1).askedBy, 'god');
});

test('a pre-existing humanQA entry has no askedBy key at all — back-compat, not just undefined', (t) => {
  const hive = floor(t);
  hive.writeTasks([card('legacy', {
    status: 'blocked',
    humanQA: [{ q: 'an old question', askedAt: '2026-08-15T08:00:00.000Z' }]
  })]);

  const entry = tasks(hive).find((c) => c.id === 'legacy').humanQA[0];
  // `=== undefined` is what a BROKEN writer that sets `askedBy: undefined`
  // also produces — Object.hasOwn is the assertion that actually distinguishes
  // "the key was never written" from "the key was written as undefined".
  assert.equal(Object.hasOwn(entry, 'askedBy'), false);
});

test('--askedBy is not an accepted flag — the environment value wins regardless', (t) => {
  const { hive, run } = floorWithCli(t);
  hive.writeTasks([card('needs-human')]);

  const patched = run({ ...process.env, AGENT_ID: 'jim-1' }, 'patch', 'needs-human', '--q', 'which account?', '--askedBy', 'evil-1');
  assert.equal(patched.task.humanQA.at(-1).askedBy, 'jim-1');
  assert.ok(!JSON.stringify(patched.task).includes('evil-1'), 'evil-1 must appear nowhere on the card');
});

test('a second --q appends without touching the first entry\'s askedBy, and patchTask round-trips askedBy', (t) => {
  const { hive, run } = floorWithCli(t);
  hive.writeTasks([card('needs-human')]);

  run({ ...process.env, AGENT_ID: 'jim-1' }, 'patch', 'needs-human', '--q', 'first question?');
  run({ ...process.env, AGENT_ID: 'pam-1' }, 'patch', 'needs-human', '--q', 'second question?');

  const humanQA = tasks(hive).find((c) => c.id === 'needs-human').humanQA;
  assert.deepEqual(humanQA.map((e) => e.askedBy), ['jim-1', 'pam-1']);

  // This is the exact write AskMeTab's `sendAnswer` performs when the human
  // answers: patchTask with a spread-updated humanQA array. If that patch path
  // drops askedBy, task 2's recipient resolver is built on sand.
  const answered = humanQA.map((e, i) => (i === 0 ? { ...e, a: 'Option B', answeredAt: '2026-08-15T09:00:00.000Z' } : e));
  assert.equal(hive.patchTask('needs-human', { humanQA: answered }), true);
  const roundTripped = tasks(hive).find((c) => c.id === 'needs-human').humanQA;
  assert.equal(roundTripped[0].a, 'Option B');
  assert.equal(roundTripped[0].askedBy, 'jim-1', 'askedBy must survive the answer-write round trip');
  assert.equal(roundTripped[1].askedBy, 'pam-1');
});

test('renderer task actions never send a whole stale ledger back to main', () => {
  const root = path.resolve(__dirname, '..');
  const preload = fs.readFileSync(path.join(root, 'src/preload/index.ts'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');
  const sources = [
    'src/renderer/src/components/AskMeTab.tsx',
    'src/renderer/src/components/TaskDetailOverlay.tsx',
    'src/renderer/src/components/TasksKanban.tsx',
    'src/renderer/src/hooks/useHive.ts'
  ].map((file) => fs.readFileSync(path.join(root, file), 'utf8'));

  for (const source of sources) {
    assert.doesNotMatch(source, /hiveWriteTasks\s*\(/,
      'renderer code must use atomic task IPC rather than overwrite tasks.json');
  }
  assert.doesNotMatch(preload, /hiveWriteTasks\s*:/,
    'the renderer bridge must not expose the unsafe whole-ledger write primitive');
  assert.doesNotMatch(main, /ipcMain\.handle\('hive:writeTasks'/,
    'main must not accept whole-ledger writes from a stale renderer');
  assert.match(sources[0], /hivePatchTask\s*\(/);
  assert.match(sources[1], /hivePatchTask\s*\(/);
  assert.match(sources[2], /hiveDeleteTask\s*\(/);
  // FLOOR-02 moved the Slack-origin kanban promotion OUT of useHive.ts — it
  // lived in the drain's `.then()`, and the drain is main's now — into main's
  // `onQueueDelivered`. A card minted by the renderer is a card that is NOT
  // minted with the window closed, which is the exact hole that migration exists
  // to close, so the anchor follows the behaviour rather than being dropped.
  // The contract this test guards is untouched: nothing writes a whole ledger.
  assert.doesNotMatch(sources[3], /hiveAddTask\s*\(/,
    'the Slack-origin card promotion belongs to main now; a renderer that mints it does not mint it with the window closed');
  // 02-02 moved the DeliveryService construction (onQueueDelivered included)
  // out of index.ts into src/main/floor/boot.ts's bootFloor(); the hook itself
  // is unchanged, only its file.
  const boot = fs.readFileSync(path.join(root, 'src/main/floor/boot.ts'), 'utf8');
  const hook = boot.indexOf('onQueueDelivered:');
  assert.ok(hook > 0,
    'main lost its post-delivery hook — Slack-origin work would stop becoming a kanban card at all');
  // Sliced to that hook's own block, so an unsliced match here would stay
  // green with the promotion deleted.
  assert.match(boot.slice(hook, boot.indexOf('\n  },', hook)), /hive\.addTask\(/,
    "main's Slack-origin promotion must go through the atomic addTask, never a whole-ledger rewrite");
});
