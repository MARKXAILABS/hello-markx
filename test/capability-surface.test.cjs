'use strict';

/**
 * PARITY-01b / DAEMON-04 — plan 02-06 (wave 6).
 *
 * D-30's honest restatement, pinned here rather than in `test/repo-claims.test.cjs`:
 * that file's `MARKER_LEDGER`-style clauses have ONE owner per wave and this wave is
 * not one of them (02-07/02-12's file). PARITY-01b's VALIDATION.md row literally names
 * `capabilityLine`, and `capabilityLine` itself still has ZERO production consumers
 * after this plan (its one intended job — the god's roster injection — is `hive.ts`'s,
 * plans 02-07/02-08). What this plan actually builds and what this file actually pins
 * is: `providerCapabilities(provider, platform)` has >= 1 PRODUCTION consumer, and the
 * renderer never renders `capabilityLine()`'s joined prompt-line string (UI-SPEC Rule
 * C-1). Plan 02-12 is told to fold this restatement into the honesty ledger.
 *
 * Every clause here is BOTH directions (D-40): a positive lower bound alongside the
 * negative, so deleting the feature fails the clause instead of satisfying it. Source
 * is scanned COMMENT-STRIPPED (repo-claims.test.cjs's own `stripComments`) — several
 * comments in this codebase quote the very substring a naive grep would match.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.join(__dirname, '..');
const rendererRoot = path.join(root, 'src', 'renderer', 'src');
const sharedRoot = path.join(root, 'src', 'shared');

/** Block and line comments removed — same shape as repo-claims.test.cjs's own
 *  `stripComments`, reproduced here rather than required cross-file so this
 *  file has no dependency on repo-claims.test.cjs's internals. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Every .ts/.tsx under a directory, as repo-relative POSIX paths. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out;
}

const readStripped = (rel) => stripComments(fs.readFileSync(path.join(root, rel), 'utf8'));

const rendererFiles = sourceFiles(rendererRoot);

/**
 * Paren-depth scanner (D-40's third instance): a naive `[^()]*`/`[^(),]+`
 * regex reports `providerCapabilities(inferAgentProvider(a.command,
 * a.provider))` — a genuine ONE-argument call — as a two-argument call,
 * because the truncated capture still contains a comma. This walks paren/
 * bracket/brace depth to the real matching close and splits on depth-1
 * commas only.
 *
 * Returns every call site found: `{ total, twoArg, calls: [{file, argCount}] }`
 * merged across every file supplied.
 */
function scanCalls(files, name) {
  const open = name + '(';
  let total = 0;
  let twoArg = 0;
  const sites = [];
  for (const file of files) {
    const text = stripComments(fs.readFileSync(path.join(root, file), 'utf8'));
    let i = 0;
    while ((i = text.indexOf(open, i)) >= 0) {
      const prev = text[i - 1] || '';
      if (/[A-Za-z0-9_$.]/.test(prev)) { i += open.length; continue; }
      total++;
      let depth = 1;
      let j = i + open.length;
      let start = j;
      const args = [];
      for (; j < text.length; j++) {
        const c = text[j];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') {
          depth--;
          if (depth === 0) break;
        } else if (c === ',' && depth === 1) {
          args.push(text.slice(start, j));
          start = j + 1;
        }
      }
      args.push(text.slice(start, j));
      const trimmed = args.map((a) => a.trim()).filter((a, idx, arr) => !(idx === arr.length - 1 && a === ''));
      if (trimmed.length === 2) twoArg++;
      sites.push({ file, argCount: trimmed.length });
      i = j + 1;
    }
  }
  return { total, twoArg, sites };
}

test('every providerCapabilities/remoteControlAvailability call in the renderer is two-argument, depth-scanned', () => {
  for (const name of ['providerCapabilities', 'remoteControlAvailability']) {
    const { total, twoArg, sites } = scanCalls(rendererFiles, name);
    // Positive half: the derivation actually exists in the renderer.
    assert.ok(total >= 1, `${name}: expected >= 1 call across the renderer, found ${total}`);
    // Both-directions half: every call found is two-argument. A one-argument
    // call (the exact D-40 vacuous-pass shape) fails this, not passes it.
    assert.equal(
      twoArg,
      total,
      `${name}: ${total - twoArg} call(s) were NOT two-argument — ` +
      `sites: ${JSON.stringify(sites.filter((s) => s.argCount !== 2))}`
    );
  }
});

test('the naive [^)]* regex passes a one-argument call the depth scanner correctly fails', () => {
  // D-40's third instance, reproduced exactly (plan text, `<interfaces>`).
  // MEASURED CORRECTION (D-01 — the plan's own quoted pattern is not data):
  // the plan's `<interfaces>` prose writes the naive pattern as
  // `providerCapabilities\(([^()]*)\)`, but excluding BOTH parens from the
  // character class cannot span the nested `inferAgentProvider(...)` call at
  // all — `.exec()` returns null. The capture the plan itself quotes
  // (`providerCapabilities(inferAgentProvider(a.command, a.provider)`, one
  // unconsumed inner close-paren) is only produced by excluding `)` ALONE
  // (`[^)]*`), which is free to walk straight through the nested `(`. Verified
  // both ways below before trusting either.
  const planted = "const x = providerCapabilities(inferAgentProvider(a.command, a.provider));";
  assert.equal(/providerCapabilities\(([^()]*)\)/.exec(planted), null,
    'excluding both parens cannot match at all — confirms the interfaces prose is imprecise');
  const naive = /providerCapabilities\(([^)]*)\)/.exec(planted);
  assert.ok(naive, 'the naive [^)]* regex should match something');
  assert.ok(naive[1].includes(','), 'the naive capture contains a comma — this is the vacuous pass');
  // The depth scanner, run over the same one-liner, must find it as ONE call
  // with ONE argument — i.e. NOT two-argument.
  const tmpFile = path.join(__dirname, '..', '.tmp-capability-surface-planted.ts');
  fs.writeFileSync(tmpFile, planted);
  try {
    const { total, twoArg } = scanCalls([path.relative(root, tmpFile).split(path.sep).join('/')], 'providerCapabilities');
    assert.equal(total, 1);
    assert.equal(twoArg, 0, 'the depth scanner must NOT count this one-argument call as two-argument');
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
});

test('providerCapabilities has >= 1 production consumer outside src/shared/providerAutomation.ts (the restated PARITY-01b gate)', () => {
  const consumers = [];
  for (const file of rendererFiles) {
    const { total } = scanCalls([file], 'providerCapabilities');
    if (total > 0) consumers.push(file);
  }
  assert.ok(
    consumers.length >= 1,
    'providerCapabilities has ZERO production consumers — PARITY-01b (restated) is unbuilt'
  );
});

test('the three D-31 surfaces each consume capabilityGaps at least once (the anti-D-30 clause)', () => {
  const surfaces = [
    'src/renderer/src/components/AgentCard.tsx',
    'src/renderer/src/components/AddAgentModal.tsx',
    'src/renderer/src/components/CommandCenterPanel.tsx'
  ];
  for (const rel of surfaces) {
    const text = readStripped(rel);
    const count = (text.match(/capabilityGaps\(/g) || []).length;
    assert.ok(count >= 1, `${rel}: capabilityGaps( found ${count} times — a derivation rendered nowhere is D-30`);
  }
});

test('the renderer NEVER renders capabilityLine()\'s joined prompt-line string (Rule C-1), and capabilityLine still exists', () => {
  let rendererHits = 0;
  for (const file of rendererFiles) {
    const text = readStripped(file);
    rendererHits += (text.match(/capabilityLine\(/g) || []).length;
  }
  assert.equal(rendererHits, 0, `capabilityLine( found ${rendererHits} time(s) in src/renderer/src — Rule C-1 forbids this`);
  // Paired positive: capabilityLine is still exported from shared — deleting
  // it would satisfy the negative above for the wrong reason.
  const sharedText = readStripped('src/shared/providerAutomation.ts');
  assert.ok(/export function capabilityLine\(/.test(sharedText), 'capabilityLine must still be exported from providerAutomation.ts');
});

test('the gap vocabulary is the locked six strings, in rank order, for all eleven presets on both platforms — and reads no process global', () => {
  const { AGENT_PROVIDER_PRESETS } = loadTs('src/shared/agentProvider.ts');
  const { capabilityGaps } = loadTs('src/renderer/src/store/config.ts');
  assert.ok(AGENT_PROVIDER_PRESETS.length >= 11, `expected >= 11 presets, found ${AGENT_PROVIDER_PRESETS.length}`);

  const LOCKED = new Set(['NO MAIL', 'NO MCP', 'NO SPEND', 'NO COMPACT', 'NO REMOTE']);
  const RANK = ['mail', 'mcp', 'spend', 'compact', 'remote'];
  let sawNonEmpty = false;

  for (const preset of AGENT_PROVIDER_PRESETS) {
    for (const platform of ['win32', 'darwin']) {
      const gaps = capabilityGaps(preset.id, platform, preset.label);
      if (gaps.length > 0) sawNonEmpty = true;
      let lastRank = -1;
      for (const gap of gaps) {
        assert.ok(LOCKED.has(gap.chip), `${preset.id}/${platform}: unlocked chip text "${gap.chip}"`);
        const rankIdx = RANK.indexOf(gap.key);
        assert.ok(rankIdx > lastRank, `${preset.id}/${platform}: gaps out of rank order (${gap.key})`);
        lastRank = rankIdx;
      }
    }
  }
  assert.ok(sawNonEmpty, 'at least one preset must yield a non-empty gap list (e.g. pi/custom: NO MCP)');

  // The negative half: the derivation itself never reads process.platform —
  // proven structurally in the file's own containment criterion (grep -c
  // 'process.platform' src/renderer/src/store/config.ts === 0), re-asserted
  // here over the loaded module's source text.
  const src = readStripped('src/renderer/src/store/config.ts');
  assert.equal((src.match(/process\.platform/g) || []).length, 0);
});

test('the two NO REMOTE sentences differ by platform and share the same chip', () => {
  const { capabilityGaps } = loadTs('src/renderer/src/store/config.ts');
  // remoteControlAvailability: codex on win32 -> 'windows' (a gap, Windows
  // named); codex on darwin/linux -> 'ok' (NO gap at all — codex's remote
  // control genuinely works there). The 'none' branch (no remote-control
  // affordance on ANY platform) belongs to every other non-claude engine, so
  // grok (any platform) is the 'none' fixture, not codex on a second platform.
  const winGaps = capabilityGaps('codex', 'win32', 'Ada');
  const noneGaps = capabilityGaps('grok', 'darwin', 'Ada');
  const win = winGaps.find((g) => g.key === 'remote');
  const none = noneGaps.find((g) => g.key === 'remote');
  assert.ok(win, 'codex on win32 must report a remote gap');
  assert.ok(none, 'grok must report a remote gap (no remote-control affordance on any platform)');
  assert.equal(win.chip, 'NO REMOTE');
  assert.equal(none.chip, 'NO REMOTE');
  assert.notEqual(win.sentence, none.sentence);
  assert.match(win.sentence, /Windows/);
  assert.doesNotMatch(none.sentence, /Windows/);
});

test('mcpCardSummary: ⚿ is never rendered for an unkeyed grant, and the three marks never collapse', () => {
  const { mcpCardSummary } = loadTs('src/renderer/src/store/config.ts');
  const { MCP_CATALOG } = loadTs('src/shared/mcpCatalog.ts');

  // Positive lower bound: the catalog has >= 1 consent-tier (non-safe-readonly)
  // entry, and every one of them has a `short` <= 6 characters.
  const consentTier = MCP_CATALOG.filter((e) => e.tier !== 'safe-readonly');
  assert.ok(consentTier.length >= 1, 'the catalog must carry at least one consent-tier entry');
  for (const entry of consentTier) {
    const short = entry.id.includes('-') ? entry.id.slice(0, entry.id.indexOf('-')) : entry.id;
    assert.ok(short.length <= 6, `${entry.id}: short id "${short}" exceeds 6 characters`);
  }
  const targetId = consentTier[0].id;

  const baseCfg = { mcpDefaults: {}, agents: {} };

  // supportsMcp: false -> null, unconditionally.
  assert.equal(mcpCardSummary(baseCfg, 'a1', { supportsMcp: false }), null);

  // keyed + applied -> ⚿
  const keyedApplied = {
    ...baseCfg,
    agents: { a1: { granted: [{ id: targetId, tier: consentTier[0].tier, hasSecret: true }], armed: [targetId] } }
  };
  const r1 = mcpCardSummary(keyedApplied, 'a1', { supportsMcp: true, ptyId: 'pty-1' });
  assert.equal(r1.granted[0].mark, '⚿');
  assert.equal(r1.granted[0].pending, false);

  // unkeyed + applied -> ⚠, and explicitly NOT ⚿
  const unkeyedApplied = {
    ...baseCfg,
    agents: { a1: { granted: [{ id: targetId, tier: consentTier[0].tier, hasSecret: false }], armed: [targetId] } }
  };
  const r2 = mcpCardSummary(unkeyedApplied, 'a1', { supportsMcp: true, ptyId: 'pty-1' });
  assert.equal(r2.granted[0].mark, '⚠');
  assert.notEqual(r2.granted[0].mark, '⚿', 'an unkeyed grant must NEVER render ⚿');

  // keyed + running + not-applied (armed is empty) -> ↻
  const keyedPending = {
    ...baseCfg,
    agents: { a1: { granted: [{ id: targetId, tier: consentTier[0].tier, hasSecret: true }], armed: [] } }
  };
  const r3 = mcpCardSummary(keyedPending, 'a1', { supportsMcp: true, ptyId: 'pty-1' });
  assert.equal(r3.granted[0].mark, '↻');
  assert.equal(r3.granted[0].pending, true);
});
