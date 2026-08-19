'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { patchChangesAgent, touchesDurableAgentField } =
  loadTs('src/renderer/src/store/agentPatch.ts');
const { terminalsToEvict, orphanedTerminalIds, TERMINAL_POOL_MAX } =
  loadTs('src/renderer/src/store/terminalPoolPolicy.ts');

const agent = () => ({
  id: 'dev1',
  name: 'Jim',
  status: 'working',
  action: 'bash npm test',
  description: 'ships the parser',
  currentStation: 'terminal',
  carrying: 'Bash',
  progress: 0
});

// ── a PTY chunk must not reallocate the agent list ─────────────────────────
test('re-asserting the run-state a chunk already reported is a no-op', () => {
  // The pty parser's streaming-prose write, dozens of times a second.
  assert.equal(patchChangesAgent(agent(), { status: 'working' }), false);
  // Its tool-line write, when the same tool line is still the last one seen.
  assert.equal(
    patchChangesAgent(agent(), {
      status: 'working', action: 'bash npm test', currentStation: 'terminal', carrying: 'Bash'
    }),
    false
  );
});

test('a field that actually moved still notifies', () => {
  assert.equal(patchChangesAgent(agent(), { status: 'idle' }), true);
  assert.equal(patchChangesAgent(agent(), { action: 'read spec.md' }), true);
  // Clearing a set field is a change; clearing an already-empty one is not.
  assert.equal(patchChangesAgent(agent(), { carrying: undefined }), true);
  assert.equal(patchChangesAgent({ ...agent(), carrying: undefined }, { carrying: undefined }), false);
});

test('run-state is volatile; everything else still persists', () => {
  assert.equal(touchesDurableAgentField({ status: 'idle', action: 'awaiting' }), false);
  assert.equal(touchesDurableAgentField({ contextTokens: 12, progress: 3 }), false);
  // `description` is the agent's role, not its current action — a write to it
  // rewrites localStorage and the roster file.
  assert.equal(touchesDurableAgentField({ description: 'bash npm test' }), true);
  assert.equal(touchesDurableAgentField({ model: 'claude-opus-5' }), true);
});

// ── the pool evicts at its cap ─────────────────────────────────────────────
const pooled = (ptyId, lastUsedAt, attached = false) => ({ ptyId, lastUsedAt, attached });

test('under the cap the pool evicts nothing', () => {
  const entries = [pooled('a', 1), pooled('b', 2), pooled('c', 3)];
  assert.deepEqual(terminalsToEvict(entries, 3), []);
  assert.deepEqual(terminalsToEvict(entries, TERMINAL_POOL_MAX), []);
});

test('over the cap the least recently acquired detached terminals go', () => {
  const entries = [pooled('new', 50), pooled('old', 1), pooled('mid', 20), pooled('older', 0)];
  assert.deepEqual(terminalsToEvict(entries, 2, 'new'), ['older', 'old']);
});

test('an attached terminal is never evicted, nor the one just acquired', () => {
  // 'onscreen' is the oldest by far, but a view is showing it.
  const entries = [pooled('onscreen', 0, true), pooled('fresh', 99), pooled('cold', 10)];
  assert.deepEqual(terminalsToEvict(entries, 2, 'fresh'), ['cold']);
  // Nothing eligible → nothing evicted, rather than blanking a live pane.
  assert.deepEqual(terminalsToEvict([pooled('onscreen', 0, true), pooled('fresh', 99)], 1, 'fresh'), []);
});

// ── dropping an agent disposes its terminal, on BOTH paths ─────────────────
test('a terminal whose agent left the roster is an orphan', () => {
  const entries = [pooled('pty-god', 5), pooled('pty-dev1', 6), pooled('pty-dev2', 7)];
  // Path 1 — the archive broadcast: dev1 was archived, so it is off the roster.
  assert.deepEqual(orphanedTerminalIds(entries, ['pty-god', 'pty-dev2']), ['pty-dev1']);
  // Path 2 — reconcileWithLivePtys at startup: both workers died with the last
  // session and only god's pty came back.
  assert.deepEqual(orphanedTerminalIds(entries, ['pty-god']), ['pty-dev1', 'pty-dev2']);
});

test('a live roster orphans nothing, and an attached terminal is left alone', () => {
  const entries = [pooled('pty-god', 5), pooled('pty-dev1', 6)];
  assert.deepEqual(orphanedTerminalIds(entries, ['pty-god', 'pty-dev1']), []);
  // Restart & Continue kills and respawns under the SAME id: the agent never
  // leaves the roster, so its terminal is never a candidate.
  assert.deepEqual(orphanedTerminalIds([pooled('pty-dev1', 6, true)], []), []);
});
