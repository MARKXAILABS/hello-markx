'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  clearCommandForProvider,
  compactionCommandForProvider,
  contextCommandsForProvider,
  isCompactionCommand,
  providerCapabilities,
  remoteControlCommandForProvider,
  terminalReadySettleMs,
  terminalReadyToReceive
} = loadTs('src/shared/providerAutomation.ts');

// — the queue's one-pending-compact invariant depends entirely on this predicate —

test('isCompactionCommand matches every provider that has a compact verb', () => {
  for (const p of ['claude', 'codex', 'grok', 'kimi', 'qwen', 'opencode', 'pi', 'copilot']) {
    const cmd = compactionCommandForProvider(p, '');
    if (!cmd) continue; // provider has no typeable compaction — nothing to dedupe
    assert.equal(isCompactionCommand(cmd), true, `${p}: ${cmd}`);
  }
});

test('a focus suffix still reads as a compaction command', () => {
  // This is the real queued shape — the trigger appends the operator's focus
  // text, so matching the whole string instead of the verb would never dedupe.
  assert.equal(isCompactionCommand('/compact keep the auth decisions'), true);
  assert.equal(isCompactionCommand('  /compact   keep everything  '), true);
});

test('prose that merely mentions compaction is NOT a command', () => {
  // The queue carries human instructions too; dropping one as a duplicate
  // compact would silently lose real work.
  assert.equal(isCompactionCommand('please /compact when you are done'), false);
  assert.equal(isCompactionCommand('compact the context'), false);
  assert.equal(isCompactionCommand('summarise and compact'), false);
  assert.equal(isCompactionCommand(''), false);
});

test('a clear command is not a compaction command', () => {
  assert.equal(isCompactionCommand('/clear'), false);
  assert.equal(isCompactionCommand('/new'), false);
});
const { DEFAULT_COMPACTION_FOCUS } = loadTs('src/shared/triggers.ts');
const { AGENT_PROVIDER_PRESETS } = loadTs('src/shared/agentProvider.ts');

test('each provider receives only its supported compaction syntax', () => {
  // Verbs differ per CLI: qwen dropped gemini-cli's /compact alias for /compress.
  assert.equal(compactionCommandForProvider('claude', ''), '/compact');
  assert.equal(compactionCommandForProvider('codex', ''), '/compact');
  assert.equal(compactionCommandForProvider('grok', ''), '/compact');
  assert.equal(compactionCommandForProvider('kimi', ''), '/compact');
  assert.equal(compactionCommandForProvider('qwen', ''), '/compress');
  assert.equal(compactionCommandForProvider('opencode', ''), '/compact');
  assert.equal(compactionCommandForProvider('pi', ''), '/compact');

  // No command we can trust → no keystrokes at all.
  for (const p of ['antigravity', 'crush', 'copilot', 'custom']) {
    assert.equal(compactionCommandForProvider(p), null, p);
  }
});

test('the focus rides along only where the TUI parses it', () => {
  const focus = 'keep the auth decisions';
  assert.equal(compactionCommandForProvider('claude', focus), `/compact ${focus}`);
  assert.equal(compactionCommandForProvider('grok', focus), `/compact ${focus}`);
  assert.equal(compactionCommandForProvider('kimi', focus), `/compact ${focus}`);
  assert.equal(compactionCommandForProvider('pi', focus), `/compact ${focus}`);
  assert.equal(compactionCommandForProvider('qwen', focus), `/compress ${focus}`);

  // codex/opencode ignore trailing text, so it must be dropped, not typed.
  assert.equal(compactionCommandForProvider('codex', focus), '/compact');
  assert.equal(compactionCommandForProvider('opencode', focus), '/compact');

  // Omitting the message keeps the trigger default, not a bare command.
  assert.equal(
    compactionCommandForProvider('claude'),
    `/compact ${DEFAULT_COMPACTION_FOCUS}`
  );
  // A whitespace-only message counts as empty.
  assert.equal(compactionCommandForProvider('claude', '   '), '/compact');
});

test('clearing uses each CLI own verb, not a hardcoded /clear', () => {
  assert.equal(clearCommandForProvider('claude'), '/clear');
  assert.equal(clearCommandForProvider('codex'), '/clear');
  assert.equal(clearCommandForProvider('kimi'), '/clear');
  assert.equal(clearCommandForProvider('qwen'), '/clear');
  // agy's /clear resets the conversation; Ctrl+L is the screen-only one.
  assert.equal(clearCommandForProvider('antigravity'), '/clear');
  // These three start a fresh session instead — '/clear' is not a command there.
  assert.equal(clearCommandForProvider('grok'), '/new');
  assert.equal(clearCommandForProvider('opencode'), '/new');
  assert.equal(clearCommandForProvider('pi'), '/new');
  // Palette-only TUI, print-mode CLI, unknown binary: nothing typed can land.
  for (const p of ['crush', 'copilot', 'custom']) {
    assert.equal(clearCommandForProvider(p), null, p);
  }
});

test('a non-empty clear message overrides the table verbatim', () => {
  assert.equal(clearCommandForProvider('grok', '/clear'), '/clear');
  // The operator escape hatch for providers the table answers null for.
  assert.equal(clearCommandForProvider('crush', '/reset'), '/reset');
});

test('every provider preset has a considered context-command entry', () => {
  // Guards the whole point of the table: a new provider must be looked up, not
  // silently defaulted. A missing key would fall back to the all-null entry.
  for (const preset of AGENT_PROVIDER_PRESETS) {
    const entry = contextCommandsForProvider(preset.id);
    assert.ok(entry, preset.id);
    assert.ok(entry.compact === null || entry.compact.startsWith('/'), preset.id);
    assert.ok(entry.clear === null || entry.clear.startsWith('/'), preset.id);
    assert.equal(typeof entry.compactTakesFocus, 'boolean', preset.id);
  }
});

test('Claude alone receives a remote-control slash command', () => {
  assert.equal(remoteControlCommandForProvider('claude', 'Michael'), '/remote-control Michael');
  assert.equal(remoteControlCommandForProvider('codex', 'Jim'), null);
  assert.equal(remoteControlCommandForProvider('grok', 'Grok'), null);
  assert.equal(remoteControlCommandForProvider('kimi', 'Pam'), null);
});

test('provider readiness policies allow each TUI to settle', () => {
  assert.equal(terminalReadySettleMs('claude'), 400);
  assert.equal(terminalReadySettleMs('codex'), 500);
  assert.equal(terminalReadySettleMs('grok'), 500);
  assert.equal(terminalReadySettleMs('kimi'), 650);
});

test('continuous TUI repainting cannot block terminal readiness', () => {
  assert.equal(terminalReadyToReceive(false, 10_000, 'codex'), false);
  assert.equal(terminalReadyToReceive(true, 499, 'codex'), false);
  assert.equal(terminalReadyToReceive(true, 500, 'codex'), true);
  assert.equal(terminalReadyToReceive(undefined, 500, 'codex'), true);
});

// UI-SPEC Rule C-1a step 1 — the `??` mechanism, proven MECHANICALLY. A passed
// platform must short-circuit `process.platform` entirely (not merely be
// accepted and ignored), and an omitted one must still read it (today's
// main-side / test-side behaviour, unchanged). Neither half alone proves the
// mechanism: the first alone passes if the parameter is accepted and ignored;
// the second alone passes if the function never reads the platform at all.
test('providerCapabilities: a passed platform short-circuits process.platform via ??', (t) => {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  t.after(() => Object.defineProperty(process, 'platform', original));

  Object.defineProperty(process, 'platform', {
    configurable: true,
    get() {
      throw new Error('process.platform was read despite an explicit platform argument — the ?? did not short-circuit');
    }
  });

  assert.doesNotThrow(
    () => providerCapabilities('codex', 'linux'),
    'a caller that supplies platform must never touch process.platform at all'
  );
  assert.throws(
    () => providerCapabilities('codex'),
    /process\.platform was read/,
    'a caller that omits platform must still read process.platform — the default is not a no-op'
  );
});

// End-to-end forwarding: the value that reaches remoteControlAvailability is
// the one actually passed, not always the live host's.
test('providerCapabilities forwards the passed platform end to end', () => {
  assert.equal(providerCapabilities('codex', 'win32').remote, false);
  assert.equal(providerCapabilities('codex', 'darwin').remote, true);
});

// Rule C-1b — one source of truth, proven directly: ProviderCapabilities.mcp
// is exactly AgentProviderPreset.supportsMcp, over every preset, not just the
// committed map engine-parity.test.cjs pins.
test('providerCapabilities.mcp mirrors the preset\'s supportsMcp bit, for every preset', () => {
  for (const preset of AGENT_PROVIDER_PRESETS) {
    assert.equal(providerCapabilities(preset.id).mcp, preset.supportsMcp, preset.id);
  }
});
