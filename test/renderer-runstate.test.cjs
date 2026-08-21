'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { patchChangesAgent, touchesDurableAgentField } =
  loadTs('src/renderer/src/store/agentPatch.ts');
const { terminalsToEvict, orphanedTerminalIds, TERMINAL_POOL_MAX } =
  loadTs('src/renderer/src/store/terminalPoolPolicy.ts');
const { isAutoModeAgent, agentRowForCard, getLiveAutoMode, setLiveAutoMode, subscribeLiveAutoMode } =
  loadTs('src/renderer/src/store/autoMode.ts');
const { autoModeFlagForProvider } = loadTs('src/shared/agentProvider.ts');

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

// ── FLOOR-01: auto mode is derived once, from the agent's own command ───────
//
// The chip is a SAFETY indicator: it tells the operator this agent acts without
// asking for tool approval. Both lying directions are graded here.

/** Exactly how store/config.ts's buildSpawnCommand builds it: base + ' ' + flag. */
const spawned = (base, provider) => {
  const flag = autoModeFlagForProvider(provider);
  return flag ? `${base} ${flag}` : base;
};

test('a claude agent whose command carries the auto flag is bypassed', () => {
  const cmd = spawned('claude', 'claude');
  // Positive control on the fixture itself: if the preset ever stops supplying a
  // flag, the assertion below would pass on a bare command and mean nothing.
  assert.notEqual(cmd, 'claude', 'claude preset must still carry an auto flag');
  assert.equal(isAutoModeAgent('claude', cmd, false), true);
});

test('the same provider without the flag is not bypassed', () => {
  assert.equal(isAutoModeAgent('claude', 'claude', false), false);
  // And not even with the global toggle on: the flag was never spliced on, so
  // this agent asks before every tool call whatever Settings says today.
  assert.equal(isAutoModeAgent('claude', 'claude', true), false);
  // A near-miss flag value is not the bypass flag.
  assert.equal(isAutoModeAgent('claude', 'claude --permission-mode acceptEdits', true), false);
});

test('an opencode agent follows the live toggle - its bypass is env-based', () => {
  // opencode's TUI exposes no skip-permissions flag, so nothing lands on the
  // command string; main writes permission:allow into OPENCODE_CONFIG_CONTENT.
  assert.equal(autoModeFlagForProvider('opencode'), '');
  assert.equal(isAutoModeAgent('opencode', 'opencode', true), true);
  assert.equal(isAutoModeAgent('opencode', 'opencode', false), false);
});

test('a custom agent is NEVER bypassed, even with the toggle on', () => {
  // custom has no auto flag AND no env route. A chip here would claim a bypass
  // the floor cannot perform - the worst failure this indicator has.
  assert.equal(autoModeFlagForProvider('custom'), '');
  assert.equal(isAutoModeAgent('custom', 'my-agent --yolo --dangerously-skip-permissions', true), false);
  assert.equal(isAutoModeAgent('custom', '', true), false);
});

test('turning the toggle OFF does not de-bypass an already-running agent', () => {
  // The flag is baked at spawn. This is the direction a chip driven off
  // config.autoMode lies in, and the whole reason the derivation is the command.
  const cmd = spawned('claude', 'claude');
  assert.equal(isAutoModeAgent('claude', cmd, true), true);
  assert.equal(isAutoModeAgent('claude', cmd, false), true);
  // ...and the other direction: turning it ON does not bypass one already up.
  assert.equal(isAutoModeAgent('codex', 'codex', true), false);
  assert.equal(isAutoModeAgent('codex', spawned('codex', 'codex'), false), true);
});

test('the agent card resolves its own store row, and fails safe when it cannot', () => {
  const rows = [
    { ptyId: 'pty-god', name: 'Michael' },
    { ptyId: 'pty-dev1', name: 'Jim' },
    { name: 'Pam' },              // restored, no live PTY
    { name: 'Dwight' },
    { name: 'Dwight' }            // duplicate name - ambiguous
  ];
  assert.equal(agentRowForCard(rows, 'pty-dev1', 'Jim'), rows[1]);
  // No PTY: the unique name is the only key the card is handed.
  assert.equal(agentRowForCard(rows, undefined, 'Pam'), rows[2]);
  // Ambiguous name resolves to nothing rather than to the wrong agent's bypass.
  assert.equal(agentRowForCard(rows, undefined, 'Dwight'), undefined);
  assert.equal(agentRowForCard(rows, 'pty-gone', 'Jim'), undefined);
});

test('the live toggle is published once and every reader is notified', () => {
  const seen = [];
  const off = subscribeLiveAutoMode(() => seen.push(getLiveAutoMode()));
  setLiveAutoMode(true);
  setLiveAutoMode(true);   // no-op: a redundant publish must not churn readers
  setLiveAutoMode(false);
  off();
  setLiveAutoMode(true);   // after unsubscribe: no further notification
  assert.deepEqual(seen, [true, false]);
  setLiveAutoMode(false);  // leave the singleton where the other tests expect it
});
