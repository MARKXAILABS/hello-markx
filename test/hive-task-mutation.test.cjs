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
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-task-mutate-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return new HiveManager(() => home);
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
  assert.deepEqual(tasks(hive), [card('existing')]);
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
  const hook = main.indexOf('onQueueDelivered:');
  assert.ok(hook > 0,
    'main lost its post-delivery hook — Slack-origin work would stop becoming a kanban card at all');
  // Sliced to that hook's own block: index.ts is ~5,600 lines and already calls
  // hive.addTask inside the `hive:addTask` IPC handler, so an unsliced match
  // here would stay green with the promotion deleted.
  assert.match(main.slice(hook, main.indexOf('\n  },', hook)), /hive\.addTask\(/,
    "main's Slack-origin promotion must go through the atomic addTask, never a whole-ledger rewrite");
});
