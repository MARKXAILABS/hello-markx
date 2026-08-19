'use strict';
/**
 * Engine-parity + cost-accounting tests (#19).
 *
 * The floor advertises eleven engines and used to give exactly one of them the
 * whole protocol. Three things had to become true, and each is checked here:
 *
 *   1. a PROXY-tier engine's CostSample reaches `getAgentUsage`, so qwen/crush
 *      can actually arm the circuit breaker instead of only filling a ledger;
 *   2. a per-agent token cap measures WORK (output + fresh input) and not
 *      session length (cache reads), upstream #189;
 *   3. every roster entry can state, in one line, whether its engine can receive
 *      mail, whether its spend is tracked, and whether it can compact;
 *   4. codex's rollout transcripts are readable, so its spend stops being
 *      invisible to every budget.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { TelemetryCollector } = loadTs('src/main/telemetry.ts');
const { CircuitBreaker } = loadTs('src/main/breaker.ts');
const { readCodexUsage } = loadTs('src/main/usage.ts');
const { capabilityLine, providerCapabilities } = loadTs('src/shared/providerAutomation.ts');

/** One proxy-sidecar CostSample, in the shape hooks.ts builds for the ledger. */
function costSample(over = {}) {
  return {
    agentId: 'qwen-1',
    sessionId: 'proxy-session-1',
    ts: Date.now(),
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
    model: 'qwen3-coder-plus',
    usd: 0,
    ...over
  };
}

/** A breaker with fixed config (mirrors test/breaker.test.cjs's helper). */
function makeBreaker(over = {}) {
  return new CircuitBreaker(() => ({
    enabled: true, hardStop: false, repeatedToolLimit: 8, errorStormLimit: 5,
    tokenVelocityPerMin: 60000, ...over
  }));
}

// ── 1. a proxy engine's spend reaches the breaker ────────────────────────────

test('CostSamples accumulate into the same cumulative aggregate as OTel', () => {
  const t = new TelemetryCollector();
  t.recordCostSample(costSample({ input: 1000, output: 200, cacheRead: 50 }));
  t.recordCostSample(costSample({ input: 500, output: 100, cacheRead: 25, usd: 0.02 }));
  const s = t.getAgentUsage('qwen-1');
  // Samples are DELTAS for one response; the aggregate is their running total.
  assert.equal(s.input, 1500);
  assert.equal(s.output, 300);
  assert.equal(s.cacheRead, 75);
  assert.equal(s.usd, 0.02);
  assert.equal(s.sessionId, 'proxy-session-1');
  assert.equal(s.model, 'qwen3-coder-plus');
});

test('a CostSample from a proxy-tier engine arms the breaker', () => {
  const t = new TelemetryCollector();
  const b = makeBreaker({ agentTokenCaps: { 'qwen-1': 10_000 } });
  const now = 1_700_000_000_000;

  // Before any sample the engine is invisible: no sample, no trip. This is
  // exactly the old behaviour for the whole proxy tier.
  assert.equal(b.tick([{ agentId: 'qwen-1', sample: null, progressing: true }], now)[0].state.level, 'healthy');

  t.recordCostSample(costSample({ input: 9_000, output: 5_000 }));
  const d = b.tick([{ agentId: 'qwen-1', sample: t.getAgentUsage('qwen-1'), progressing: true }], now + 30_000)[0];
  assert.equal(d.state.level, 'steering');
  assert.match(d.state.reason, /token limit/);
});

test('a garbage sample cannot rewind a cumulative accumulator', () => {
  // The sidecar is a generated shim parsing someone else's wire format; a NaN or
  // a negative would read as spend going backwards, i.e. a free beat.
  const t = new TelemetryCollector();
  t.recordCostSample(costSample({ input: 1000, output: 100 }));
  t.recordCostSample(costSample({ input: -900, output: Number.NaN, cacheRead: undefined }));
  const s = t.getAgentUsage('qwen-1');
  assert.equal(s.input, 1000);
  assert.equal(s.output, 100);
});

test('a CostSample with no session key is dropped rather than mis-attributed', () => {
  const t = new TelemetryCollector();
  t.recordCostSample(costSample({ sessionId: '' }));
  assert.equal(t.getAgentUsage('qwen-1'), null);
});

// ── 2. caps measure work, not session length (upstream #189) ─────────────────

/** A cumulative sample with an explicit token split. */
function usage(agentId, { input = 0, output = 0, cacheRead = 0, cacheCreation = 0 } = {}) {
  return { agentId, sessionId: 's', ts: 1, input, output, cacheRead, cacheCreation, model: 'm', usd: 0 };
}

test('the per-agent cap ignores cached input', () => {
  const b = makeBreaker({ agentTokenCaps: { a: 100_000 } });
  // 2M of cache reads: a long session re-reading a big prompt, no work done.
  const d = b.tick([{ agentId: 'a', sample: usage('a', { input: 10_000, output: 5_000, cacheRead: 2_000_000 }), progressing: true }], 1)[0];
  assert.equal(d.state.level, 'healthy', d.state.reason);
});

test('the per-agent cap still trips on output + fresh input', () => {
  const b = makeBreaker({ agentTokenCaps: { a: 100_000 } });
  const d = b.tick([{ agentId: 'a', sample: usage('a', { input: 60_000, output: 50_000, cacheRead: 0 }), progressing: true }], 1)[0];
  assert.equal(d.state.level, 'steering');
  assert.match(d.state.reason, /billable tokens/);
});

test('the FLOOR budget still counts every token kind', () => {
  // costCapTokens documents itself as input+output+cacheRead+cacheCreation and
  // the Command Center meter renders that same number — it must not drift.
  const b = makeBreaker({ costCapTokens: 100_000 });
  const d = b.tick([{ agentId: 'a', sample: usage('a', { input: 1_000, output: 1_000, cacheRead: 500_000 }), progressing: true }], 1)[0];
  assert.equal(d.state.level, 'steering');
  assert.match(d.state.reason, /token cap/);
});

// ── 3. the capability line the god is oriented with ─────────────────────────

test('the capability line is honest about a mail-capable engine', () => {
  assert.equal(capabilityLine('claude'), 'claude: mail ok, spend tracked (otel), compacts /compact');
});

test('the capability line SHOUTS about a mail-incapable engine', () => {
  // Kimi has no hook bridge, so routed mail bounces to the god — the exact
  // failure #19 opens with (god assigns mail-dependent work to a Kimi worker).
  assert.equal(
    capabilityLine('kimi'),
    'kimi: NO MAIL (bounces to you), spend UNTRACKED (invisible to every budget), compacts /compact'
  );
});

test('the capability line names the other two gaps too', () => {
  // crush: proxy-tracked spend but no typeable compaction verb at all.
  assert.equal(
    capabilityLine('crush'),
    'crush: mail ok, spend tracked (proxy), NO COMPACT (context cannot be reclaimed)'
  );
  // copilot: print mode exits per turn — no mail, no prompt to compact into.
  assert.match(capabilityLine('copilot'), /NO MAIL .*spend UNTRACKED.*NO COMPACT/);
});

test('every engine answers all three capability questions', () => {
  for (const p of ['claude', 'codex', 'grok', 'kimi', 'antigravity', 'qwen',
    'opencode', 'crush', 'pi', 'copilot', 'custom']) {
    const c = providerCapabilities(p);
    assert.equal(typeof c.mail, 'boolean', p);
    assert.ok(['otel', 'proxy', 'transcript', 'none'].includes(c.spend), `${p}: ${c.spend}`);
    assert.ok(c.compact === null || typeof c.compact === 'string', p);
  }
});

// ── 4. codex spend is readable ───────────────────────────────────────────────

/** A rollout in the real shape codex 0.128.0 writes (verified against a live
 *  ~/.codex rollout): cumulative `total_token_usage` per token_count record,
 *  `cached_input_tokens` INCLUDED in `input_tokens`, plus `info: null` ticks. */
function seedRollout(home, lines) {
  const dir = path.join(home, 'sessions', '2026', '05', '10');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'rollout-2026-05-10T20-05-09-019e1250-177c-7b51-aa43-1bc553929cf8.jsonl');
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'utf8');
  return file;
}

const tokenCount = (input, cached, output) => ({
  timestamp: '2026-05-10T14:43:00.805Z',
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: {
      total_token_usage: {
        input_tokens: input,
        cached_input_tokens: cached,
        output_tokens: output,
        reasoning_output_tokens: 0,
        total_tokens: input + output
      },
      last_token_usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      model_context_window: 258400
    },
    rate_limits: { limit_id: 'codex' }
  }
});

test('readCodexUsage takes the LAST cumulative record and splits cached input out', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codexhome-'));
  seedRollout(home, [
    { type: 'turn_context', payload: { model: 'gpt-5.5', cwd: 'E:\\x' } },
    tokenCount(1000, 400, 100),
    { type: 'event_msg', payload: { type: 'token_count', info: null, rate_limits: {} } },
    tokenCount(8000, 6000, 900) // cumulative, so this one alone is the answer
  ]);
  const u = readCodexUsage(home);
  assert.equal(u.inputTokens, 2000);    // 8000 total input − 6000 cached
  assert.equal(u.cacheReadTokens, 6000);
  assert.equal(u.outputTokens, 900);
  assert.equal(u.cacheWriteTokens, 0);  // codex has no cache-creation concept
  assert.equal(u.model, 'gpt-5.5');
  assert.ok(u.estimatedCostUsd > 0);
});

test('readCodexUsage answers zero for a home with no rollouts', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codexhome-'));
  const u = readCodexUsage(home);
  assert.equal(u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens, 0);
});

test('a codex agent gets a usage sample through the collector fallback', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codexhome-'));
  seedRollout(home, [tokenCount(5000, 1000, 700)]);
  const t = new TelemetryCollector({
    // A codex agent shares its cwd with the project, so resolveCwd would bill it
    // a co-located Claude agent's transcripts — the codex home wins.
    resolveCwd: () => null,
    resolveCodexHome: (id) => (id === 'codex-1' ? home : null)
  });
  const s = t.getAgentUsage('codex-1');
  assert.equal(s.input, 4000);
  assert.equal(s.cacheRead, 1000);
  assert.equal(s.output, 700);
});
