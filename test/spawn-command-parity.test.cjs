'use strict';
/**
 * GATE-04 / L-08 — the two independent spawn-command assemblers must agree.
 *
 * WHY THIS FILE EXISTS AT ALL. The auto-mode flag is appended TWICE, independently:
 *   - main:     `commandForAutoMode`  (src/main/config.ts)
 *   - renderer: `buildSpawnCommand`   (src/renderer/src/store/config.ts)
 * Those files sit in DIFFERENT tsconfig projects (tsconfig.node.json /
 * tsconfig.web.json), so `npm run typecheck` — which passes cleanly on both — CANNOT
 * see a drift between them. A drift means the operator reads one command in
 * AddAgentModal and a different command spawns (T-04-SBX-04): the repudiation shape
 * this project names. Typecheck is not evidence here; this file is.
 *
 * WHY IT IS ONE CASE CALLING BOTH, NOT TWO CASES. 04-UI-SPEC rule S-1 is explicit:
 * "Not two tests — one test that calls both." Two tests are exactly what drifts when
 * someone edits one file — each stays green against its own expectation while the two
 * expectations diverge. Equality between the two live return values cannot do that.
 *
 * WHY NOT test/agent-provider.test.cjs. That file is a hand-rolled harness that
 * `ts.transpileModule`s four src/shared/*.ts files into a tmp dir with no alias
 * resolution and no electron stub. src/main/config.ts imports `electron` at line 1 and
 * src/renderer/src/store/config.ts imports `@shared/…`, so NEITHER subject can be
 * loaded there. test/load-ts.cjs does both halves — the electron stub and the
 * `@shared/` resolver — so this is a plain node:test file that uses it. This is a
 * structural reason, not a stylistic one: co-opting that harness would produce a test
 * that passes because it never ran.
 */

const test = require('node:test');
const assert = require('node:assert');
const loadTs = require('./load-ts.cjs');

const main = loadTs('src/main/config.ts');
const renderer = loadTs('src/renderer/src/store/config.ts');

/** CAPTURED BASELINE — the exact strings BOTH functions returned at 0ab5346, before
 *  plan 04-13 touched either file, measured by calling them (see the SUMMARY's
 *  "captured baseline" section for the run). These are the verified fallback D-15
 *  requires: with the sandbox opt-in absent or off, the produced command must equal
 *  what actually shipped — asserted against THIS constant rather than against a
 *  re-derivation, because a re-derivation drifts with the code it is meant to pin. */
const BASELINE = {
  'codex/auto-on': 'codex --dangerously-bypass-approvals-and-sandbox',
  'codex/auto-off': 'codex',
  'claude/auto-on': 'claude --permission-mode bypassPermissions',
  'claude/auto-off': 'claude',
  'grok/auto-on': 'grok --permission-mode bypassPermissions',
  'opencode/auto-on': 'opencode'
};

/** The agent's own directory — the `--add-dir` value. A sibling of cwd, which is the
 *  whole reason GATE-04 exists (D-14). Shaped like hive.ts's `agentDir(id)`:
 *  <hiveRoot>/agents/<id>. */
const AGENT_DIR = '/tmp/harness/hive/agents/a1';

/** Call BOTH assemblers with the same inputs and assert they agree, then return the
 *  one agreed string for the caller to make its own assertions about.
 *
 *  Note the two signatures differ (`buildSpawnCommand` takes a model that
 *  `commandForAutoMode` has no notion of), which is precisely why a shared expectation
 *  string would be the wrong pin: this compares the two LIVE return values. */
function bothAgree(t, config, provider, agentDir) {
  const fromMain = main.commandForAutoMode(config, provider, agentDir);
  const fromRenderer = renderer.buildSpawnCommand(config, undefined, provider, agentDir);
  assert.strictEqual(
    fromRenderer, fromMain,
    `${t}: renderer's buildSpawnCommand and main's commandForAutoMode disagree — `
    + 'the operator would approve one command and another would spawn (L-08/T-04-SBX-04)'
  );
  return fromMain;
}

test('GATE-04/L-08: both spawn-command assemblers agree, across the sandbox opt-in', () => {
  // ── 1. codex, opt-in ON ────────────────────────────────────────────────────
  // The sandbox variant replaces the bypass flag outright. Both halves matter: the
  // sandbox arrives AND the blanket bypass leaves.
  const on = bothAgree(
    'codex/opt-in-on',
    { defaultCommand: 'claude', autoMode: true, providerSandbox: { codex: true } },
    'codex',
    AGENT_DIR
  );
  assert.strictEqual(on, `codex -s workspace-write --add-dir ${AGENT_DIR}`);
  assert.ok(!on.includes('--dangerously-bypass'), 'the blanket bypass must be GONE when sandboxed');

  // ── 2. codex, opt-in OFF — the VERIFIED FALLBACK (D-15) ────────────────────
  // Byte-identical to the captured pre-change baseline. Absent === off is asserted
  // separately from an explicit `false`, because "absent" is what every existing
  // config on disk actually holds — there is no migration and no explicit write.
  const offAbsent = bothAgree(
    'codex/opt-in-absent',
    { defaultCommand: 'claude', autoMode: true },
    'codex',
    AGENT_DIR
  );
  assert.strictEqual(offAbsent, BASELINE['codex/auto-on'], 'absent opt-in === shipped behaviour');
  const offExplicit = bothAgree(
    'codex/opt-in-explicit-false',
    { defaultCommand: 'claude', autoMode: true, providerSandbox: { codex: false } },
    'codex',
    AGENT_DIR
  );
  assert.strictEqual(offExplicit, BASELINE['codex/auto-on'], 'explicit false === shipped behaviour');

  // ── 3. a NON-codex engine with the opt-in on ───────────────────────────────
  // The opt-in is per-engine. Turning it on for an engine that has no sandbox the
  // floor can turn on must change nothing at all — not even partially.
  for (const p of ['claude', 'grok', 'opencode']) {
    const other = bothAgree(
      `${p}/opt-in-on`,
      { defaultCommand: 'claude', autoMode: true, providerSandbox: { [p]: true, codex: true } },
      p,
      AGENT_DIR
    );
    assert.ok(!other.includes('--add-dir'), `${p} must not grow a writable-root flag`);
    assert.ok(!other.includes('workspace-write'), `${p} must not grow a sandbox mode flag`);
    assert.strictEqual(other, BASELINE[`${p}/auto-on`], `${p} is byte-identical to the baseline`);
  }

  // ── 4. auto mode OFF ───────────────────────────────────────────────────────
  // The sandbox variant is a replacement for the AUTO-MODE flag, so with auto mode
  // off there is nothing to replace and the opt-in must be inert — a sandbox flag
  // appearing here would be a flag nobody asked for on a bare interactive session.
  const autoOff = bothAgree(
    'codex/auto-mode-off',
    { defaultCommand: 'claude', autoMode: false, providerSandbox: { codex: true } },
    'codex',
    AGENT_DIR
  );
  assert.strictEqual(autoOff, BASELINE['codex/auto-off']);
  assert.ok(!autoOff.includes('workspace-write'), 'auto mode off spawns no sandbox flag');

  // ── 5. opt-in on, but NO agent dir ─────────────────────────────────────────
  // Every renderer caller today passes no agent dir (the renderer has no hive-root
  // knowledge — see the SUMMARY's wiring ceiling). That path must NARROW the writable
  // set to workspace-only, never widen it, and must never emit a dangling `--add-dir`.
  const noDir = bothAgree(
    'codex/opt-in-on-no-dir',
    { defaultCommand: 'claude', autoMode: true, providerSandbox: { codex: true } },
    'codex',
    undefined
  );
  assert.strictEqual(noDir, 'codex -s workspace-write');
  assert.ok(!noDir.includes('--add-dir'), 'no dangling --add-dir without a value');
});

test('GATE-04: the opt-in-off path is byte-identical to the captured baseline, every engine', () => {
  // The broad negative behind D-15's fallback clause: with no providerSandbox key at
  // all — which is every config that exists on disk today — NOTHING moves anywhere.
  for (const [key, expected] of Object.entries(BASELINE)) {
    const [provider, mode] = key.split('/');
    const config = { defaultCommand: 'claude', autoMode: mode === 'auto-on' };
    assert.strictEqual(
      main.commandForAutoMode(config, provider), expected,
      `main drifted from the captured baseline for ${key}`
    );
    assert.strictEqual(
      renderer.buildSpawnCommand(config, undefined, provider), expected,
      `renderer drifted from the captured baseline for ${key}`
    );
  }
});

test('GATE-04: the model splice and the sandbox splice coexist without eating each other', () => {
  // buildSpawnCommand also splices a model, and the sandbox flags are appended after
  // it. A regression that appended the sandbox before the model would produce a
  // command codex parses differently — cheap to pin, and it is the only assertion
  // here that main cannot mirror (commandForAutoMode has no model notion at all).
  const cmd = renderer.buildSpawnCommand(
    { defaultCommand: 'claude', autoMode: true, providerSandbox: { codex: true } },
    'gpt-5-codex',
    'codex',
    AGENT_DIR
  );
  assert.strictEqual(cmd, `codex --model gpt-5-codex -s workspace-write --add-dir ${AGENT_DIR}`);
});
