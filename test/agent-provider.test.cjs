'use strict';
/**
 * Agent-provider registry tests. Self-contained, no test framework — run with
 * `node test/agent-provider.test.cjs` (mirrors test/kg-core.test.cjs). The
 * registry lives in TypeScript (src/shared/agentProvider.ts), so we transpile it
 * and its two dependency-free command-group siblings with the bundled `typescript`
 * compiler into a temp dir and require the result. Exercises the copilot preset
 * (GitHub Copilot CLI) end to end: registration, command inference, the print-mode
 * flag shape, and the model/resume passthrough — alongside the pre-existing codex
 * preset as a guard against regressions.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const SHARED = path.join(__dirname, '..', 'src', 'shared');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprov-'));
for (const name of ['claudeCommands', 'codexCommands', 'grokCommands', 'agentProvider']) {
  const src = fs.readFileSync(path.join(SHARED, `${name}.ts`), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  fs.writeFileSync(path.join(out, `${name}.js`), js, 'utf8');
}
const ap = require(path.join(out, 'agentProvider.js'));

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (err) { failures++; console.log(`  ✗ ${name}\n     ${err && err.message}`); }
}

console.log('agent-provider registry tests');

test('copilot is a recognized, selectable provider', () => {
  assert.ok(ap.isAgentProvider('copilot'), 'isAgentProvider("copilot")');
  assert.ok(ap.AGENT_PROVIDER_PRESETS.some((p) => p.id === 'copilot'), 'preset registered');
});

test('inferAgentProvider maps the copilot binary (with path/flags) to copilot', () => {
  assert.strictEqual(ap.inferAgentProvider('copilot'), 'copilot');
  assert.strictEqual(ap.inferAgentProvider('/usr/local/bin/copilot --model gpt-5.4'), 'copilot');
});

test('copilot preset builds the documented non-interactive print-mode shape', () => {
  const p = ap.providerPreset('copilot');
  assert.strictEqual(p.defaultCommand, 'copilot', 'default command binary');
  assert.strictEqual(p.initialPromptFlag, '-p', 'prompt rides in via -p');
  assert.strictEqual(ap.autoModeFlagForProvider('copilot'), '-s --allow-all-tools --no-ask-user');
  assert.strictEqual(p.autoFlag, '-s --allow-all-tools --no-ask-user', 'autoFlag mirrors autoModeFlag');
});

test('copilot passes model + resume through, non-hiveAware, never auto-receives inbox', () => {
  const p = ap.providerPreset('copilot');
  assert.ok(p.supportsModel && p.modelFlag === '--model', 'model picker + --model');
  assert.strictEqual(p.resumeFlag, '--resume', 'session resume flag');
  assert.strictEqual(p.hiveAware, false, 'no Claude-only identity injection');
  assert.strictEqual(ap.canReceiveInbox('copilot'), false, 'print mode exits, no drain → bounces');
  assert.strictEqual(ap.bridgeOf('copilot'), undefined, 'no hook/proxy bridge');
});

test('codex preset still resolves (no regression)', () => {
  assert.strictEqual(ap.inferAgentProvider('codex'), 'codex');
  assert.strictEqual(ap.providerPreset('codex').defaultCommand, 'codex');
});

test('every preset states a required supportsMcp bit (Rule C-1b)', () => {
  const byId = Object.fromEntries(ap.AGENT_PROVIDER_PRESETS.map((p) => [p.id, p]));
  assert.strictEqual(Object.keys(byId).length, 11, 'expected all eleven presets');
  for (const p of ap.AGENT_PROVIDER_PRESETS) {
    assert.strictEqual(typeof p.supportsMcp, 'boolean', `${p.id}.supportsMcp must be a boolean`);
  }
  assert.strictEqual(byId.pi.supportsMcp, false, 'pi has no native MCP support');
  assert.strictEqual(byId.custom.supportsMcp, false, 'custom is an arbitrary binary — no known MCP surface');
  for (const id of ['claude', 'codex', 'grok', 'kimi', 'antigravity', 'qwen', 'opencode', 'crush', 'copilot']) {
    assert.strictEqual(byId[id].supportsMcp, true, `${id} documents MCP server support`);
  }
});

// ─── GATE-04 (04-13): the codex sandbox variant, at the PRESET level only ────
//
// SCOPE, deliberately narrow. This file's harness transpiles exactly four
// src/shared/*.ts files with no alias resolution and no electron stub, so it
// structurally CANNOT load either splice function — src/main/config.ts imports
// `electron` at line 1 and src/renderer/src/store/config.ts imports `@shared/…`.
// The two splices are asserted in test/spawn-command-parity.test.cjs, which uses
// test/load-ts.cjs (electron stub + `@shared/` resolver). Extending this harness
// to reach them would produce a test that passes because it never ran.

test('GATE-04: codex carries a sandbox variant AND keeps the bypass flag as its default', () => {
  const p = ap.providerPreset('codex');
  // The opt-in ON shape. `-s workspace-write` plus a per-agent writable root, which is
  // D-14's whole point: the blocker was a path tree, not a security judgement.
  assert.strictEqual(p.sandboxFlags, '-s workspace-write', 'codex sandbox mode flag');
  assert.strictEqual(p.sandboxDirFlag, '--add-dir', 'codex additional-writable-root flag');
  // The opt-in OFF shape — the VERIFIED FALLBACK D-15 requires, byte-for-byte. If this
  // moves, every codex agent that ever worked changes posture silently.
  assert.strictEqual(
    p.autoModeFlag, '--dangerously-bypass-approvals-and-sandbox',
    'the bypass flag remains the untouched default'
  );
  assert.strictEqual(p.autoFlag, '--dangerously-bypass-approvals-and-sandbox', 'autoFlag mirrors it');
  // D-33/D-40: a positive lower bound beside the negative. The preset must NOT bake a
  // concrete path — that would be wrong for every agent but one (T-04-SBX-07).
  assert.ok(!/[\\/]/.test(p.sandboxDirFlag), 'sandboxDirFlag is a flag, never a path');
});

test('GATE-04: EXACTLY ONE engine ships the opt-in, and the other ten are derived', () => {
  const capable = ap.sandboxCapableProviders();
  assert.deepStrictEqual(capable, ['codex'], 'D-15: exactly one engine, and it is codex');
  // The Settings copy says "the other ten engines". That ten is this subtraction, never
  // a literal — add sandboxFlags to a second preset and both numbers move together.
  assert.strictEqual(
    ap.AGENT_PROVIDER_PRESETS.length - capable.length, 10,
    'eleven presets minus the one sandbox-capable engine'
  );
  for (const p of ap.AGENT_PROVIDER_PRESETS) {
    if (p.id === 'codex') continue;
    assert.strictEqual(p.sandboxFlags, undefined, `${p.id} must not have grown a sandbox`);
    assert.strictEqual(p.sandboxDirFlag, undefined, `${p.id} must not have grown a writable-root flag`);
  }
});

test('GATE-04: sandboxFlagsForProvider is silent for every engine but codex', () => {
  // The negative: no non-codex command can grow a sandbox flag by accident.
  for (const p of ap.AGENT_PROVIDER_PRESETS) {
    if (p.id === 'codex') continue;
    assert.strictEqual(
      ap.sandboxFlagsForProvider(p.id, '/tmp/agents/a1'), '',
      `${p.id} yields no sandbox flags even when handed an agent dir`
    );
  }
  // The positive lower bound beside it (D-33/D-40) — proves the '' above is a real
  // per-engine answer and not a function that returns '' for everything.
  assert.strictEqual(
    ap.sandboxFlagsForProvider('codex', '/tmp/agents/a1'),
    '-s workspace-write --add-dir /tmp/agents/a1'
  );
  // No agent dir → workspace-only. A missing dir must NARROW the writable set, never
  // widen it, and must never emit a bare dangling `--add-dir`.
  assert.strictEqual(ap.sandboxFlagsForProvider('codex'), '-s workspace-write');
  // A path with whitespace survives the command tokenizer (same convention
  // buildSpawnCommand already uses for model labels like "Gemini 3.1 Pro (High)").
  assert.strictEqual(
    ap.sandboxFlagsForProvider('codex', 'C:/Users/A B/hive/agents/a1'),
    '-s workspace-write --add-dir "C:/Users/A B/hive/agents/a1"'
  );
});

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll agent-provider tests passed');
