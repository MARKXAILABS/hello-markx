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

test('AgentCard.tsx\'s aria-label carries both the gap sentences and the MCP clause, and the chip/MCP spans stay aria-hidden (A4)', () => {
  const text = readStripped('src/renderer/src/components/AgentCard.tsx');
  const ariaLabelLine = text.split('\n').find((l) => l.includes('aria-label={`${name}'));
  assert.ok(ariaLabelLine, 'AgentCard.tsx must carry the container aria-label template literal');
  // Both directions: the expression folds in gaps' sentences and an MCP
  // clause; a template literal with neither would satisfy neither reference.
  assert.match(ariaLabelLine, /gaps\.map/, 'aria-label must fold in the gap sentences (gaps.map(...))');
  assert.match(ariaLabelLine, /mcpClause/, 'aria-label must fold in the MCP clause (mcpClause)');
  // The chip and the MCP element both stay aria-hidden — announced ONCE, via
  // the label above, per A4 ("the card's chips do NOT take A2's role=img —
  // they are inside a labelled container and are silent by design").
  const chipSpanIdx = text.indexOf('data-cth-chip="capability"');
  assert.ok(chipSpanIdx >= 0, 'the capability chip span must exist');
  const around = text.slice(Math.max(0, chipSpanIdx - 200), chipSpanIdx + 50);
  assert.match(around, /aria-hidden="true"/, 'the capability chip span must carry aria-hidden="true"');
});

// ─── CR-01 / CR-02 — the consent modal's partial-batch path and the defaults
//     snapshot's staleness (02-REVIEW.md). Both are renderer-state defects on a
//     capability surface, so they are pinned here rather than in a new file.
//
// THE CEILING, STATED UP FRONT: this repo renders components with
// `renderToStaticMarkup` (test/renderer-components.test.cjs's own documented
// constraint) — no effects, no events. `submitGrant` and `toggle` are closures
// behind a click and CANNOT be invoked from any harness in this repo. So each
// finding gets BOTH halves and neither is claimed to be the other: a real
// behavioural test of the extracted logic, plus one source clause pinning the
// component to it. The source clauses are the ones that go red on the bug.

/** The body of `const <name> = ... => { ... }` in already-stripped source, matched
 *  by brace depth. Returns null when the binding is not found. */
function arrowBody(text, name) {
  const head = text.indexOf(`const ${name} =`);
  if (head < 0) return null;
  const arrow = text.indexOf('=>', head);
  if (arrow < 0) return null;
  const open = text.indexOf('{', arrow);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

/**
 * The same body with every nested CLOSURE body blanked out — offsets preserved,
 * whitespace kept — and every ordinary block (`if`, `for`, `try`) left intact.
 *
 * Both halves are load-bearing and were measured, not assumed. Blanking by plain
 * brace depth (the first thing tried) blanks the `if (!res.ok) { ... return; }`
 * INSIDE the `for` loop, which is exactly the early exit this clause exists to
 * catch — the assertion then passes against the buggy source, vacuously. Blanking
 * nothing instead trips on the `return next;` inside `setKeys((prev) => { ... })`,
 * which is not an early exit at all, so a CORRECT fix would read as a violation.
 * A closure opener is a `{` whose preceding non-space characters are `=>`.
 */
function withoutNestedClosures(body) {
  const out = body.split('');
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '{') continue;
    let j = i - 1;
    while (j >= 0 && /\s/.test(body[j])) j--;
    if (!(j >= 1 && body[j] === '>' && body[j - 1] === '=')) continue;
    let depth = 0;
    for (let k = i; k < body.length; k++) {
      if (body[k] === '{') depth++;
      else if (body[k] === '}') depth--;
      if (!/\s/.test(body[k])) out[k] = ' ';
      if (depth === 0) { i = k; break; }
    }
  }
  return out.join('');
}

test('CR-01 behaviour: grantMcpBatch reports the ids main actually granted when a later grant fails', async () => {
  const { grantMcpBatch } = loadTs('src/renderer/src/store/config.ts');
  assert.equal(typeof grantMcpBatch, 'function',
    'grantMcpBatch is not exported — the partial-batch path has no testable seam at all');

  const calls = [];
  const partial = await grantMcpBatch(['github-token', 'db', 'email-calendar'], async (id) => {
    calls.push(id);
    return id === 'db' ? { ok: false, error: 'db: could not store the key' } : { ok: true };
  });
  // The whole of CR-01: main HAS granted github-token. Discarding that fact is what
  // leaves every AgentCard rendering it as ungranted for the rest of the session.
  assert.deepEqual(partial.granted, ['github-token'],
    'a partial batch failure must still report the ids main genuinely granted');
  assert.equal(partial.error, 'db: could not store the key', 'the failure must be surfaced, never swallowed');
  assert.deepEqual(calls, ['github-token', 'db'],
    'the batch must stop at the first failure — a later grant is not attempted past a failed one');

  // Both directions: an all-ok batch reports every id and no error, so a fix that
  // simply always reported [] would fail here instead of passing the clause above.
  const all = await grantMcpBatch(['github-token', 'db'], async () => ({ ok: true }));
  assert.deepEqual(all.granted, ['github-token', 'db']);
  assert.equal(all.error, null);
  assert.deepEqual(await grantMcpBatch([], async () => ({ ok: true })), { granted: [], error: null });
});

test('CR-01 behaviour: a REJECTED grant is reported like any other failure, never propagated', async () => {
  const { grantMcpBatch } = loadTs('src/renderer/src/store/config.ts');
  // An IPC-level throw is one of the failure modes 02-REVIEW.md names. If it escapes,
  // the modal's `setBusy(false)` never runs and the dialog is wedged busy forever.
  const res = await grantMcpBatch(['github-token', 'db'], async (id) => {
    if (id === 'db') throw new Error('ipc channel closed');
    return { ok: true };
  });
  assert.deepEqual(res.granted, ['github-token']);
  assert.equal(res.error, 'ipc channel closed');
});

test('CR-01 wiring: submitGrant republishes the grants mirror on the partial-failure path too', () => {
  const body = arrowBody(readStripped('src/renderer/src/components/McpConsentModal.tsx'), 'submitGrant');
  assert.ok(body, 'submitGrant not found in McpConsentModal.tsx');
  const flat = withoutNestedClosures(body);

  const republish = flat.indexOf('load()');
  assert.ok(republish >= 0,
    'submitGrant no longer republishes via load() — the mcpGrantsSnapshot every AgentCard reads has no other writer on this path');
  const earlyReturn = flat.search(/\breturn\b/);
  assert.ok(earlyReturn === -1 || earlyReturn > republish,
    'submitGrant returns before it republishes: after a partial batch failure the modal and every AgentCard keep showing an ALREADY-GRANTED server as ungranted, in the permissive direction (CR-01)');

  assert.match(body, /grantMcpBatch\(/,
    'submitGrant must route through grantMcpBatch — an inline loop has no test coverage in this repo');
  const keysIdx = body.indexOf('setKeys(');
  assert.ok(keysIdx >= 0 && body.slice(keysIdx, body.indexOf('load()')).includes('granted'),
    'the secrets cleared after a batch must be the ids that actually succeeded (granted); clearing nothing leaves plaintext keys in React state, which this file documents as forbidden');
});

test('CR-02 wiring: the floor-wide defaults toggle publishes its write into the grants snapshot', () => {
  const text = readStripped('src/renderer/src/components/McpDefaultsSettings.tsx');
  const body = arrowBody(text, 'toggle');
  assert.ok(body, 'toggle not found in McpDefaultsSettings.tsx');
  const write = body.indexOf('updateConfig(');
  assert.ok(write >= 0, 'the toggle must still persist the defaults map to config');
  const publish = body.indexOf('setMcpGrants(');
  assert.ok(publish > write,
    'the safe-readonly defaults toggle writes config and republishes nothing: ensureMcpGrants() latches once per session, so every card’s "MCP N safe" count renders the pre-change number until the app restarts (CR-02)');
});

test('CR-02 payoff: a republished mcpDefaults map moves the card safe count and notifies subscribers', () => {
  const cfg = loadTs('src/renderer/src/store/config.ts');
  const { MCP_CATALOG } = loadTs('src/shared/mcpCatalog.ts');
  const safeOn = MCP_CATALOG.filter((e) => e.tier === 'safe-readonly' && e.defaultEnabled);
  assert.ok(safeOn.length >= 1, 'the catalog must carry at least one on-by-default safe-readonly entry');

  const original = cfg.getMcpGrantsSnapshot();
  let fired = 0;
  const off = cfg.subscribeMcpGrants(() => { fired++; });
  try {
    const before = cfg.mcpCardSummary(cfg.getMcpGrantsSnapshot(), 'a1', { supportsMcp: true }).safeCount;
    cfg.setMcpGrants({ ...cfg.getMcpGrantsSnapshot(), mcpDefaults: { [safeOn[0].id]: { enabled: false } } });
    const after = cfg.mcpCardSummary(cfg.getMcpGrantsSnapshot(), 'a1', { supportsMcp: true }).safeCount;
    assert.equal(after, before - 1, 'turning one safe-readonly default off must drop the card count by exactly one');
    assert.equal(fired, 1, 'the publish must notify subscribers — AgentCard reads this through useSyncExternalStore');
  } finally {
    off();
    cfg.setMcpGrants(original);
  }
});
