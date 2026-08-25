'use strict';

/**
 * God has to know the LIVE floor across its own restarts — a roster it read once
 * goes stale, and it then messages agents that were archived or killed. So the
 * roster is PUSHED into god's context (SessionStart + every prompt) rather than
 * pulled.
 *
 * Only one `additionalContext` may be returned per hook, so the roster and the
 * operator-steer path must MERGE — otherwise they silently displace each other.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

// hooks.ts pulls Notification from electron; outside Electron that resolve gives
// a path string, so seed the cache with the surface the server actually touches.
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');

// Strip line and block comments before any source-text pin — see
// test/repo-claims.test.cjs's own header for why an unstripped pin is a
// vacuous gate a comment can satisfy on its own.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const CONFIG = { notifications: false };

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-roster-inj-'));
}

async function floor(t, { steer } = {}) {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god-1', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'jim-1', name: 'Jim', provider: 'claude', cwd: home });

  const control = steer
    ? { takeSteer: (id) => (id === 'god-1' ? steer : null), shouldHalt: () => false, toolDecision: () => ({ deny: false }) }
    : undefined;
  const server = new HookServer(hive, () => null, () => CONFIG, control, undefined);
  // GATE-01: the agent id is DERIVED from the payload's per-agent token at the
  // socket and passed into handle() — it is no longer read off the payload. The
  // fixture hands it the same way, so it keeps modelling the real call.
  const fire = (agentId, hook_event_name) => server.handle({ hook_event_name, session_id: 's1' }, agentId);
  return { home, hive, server, fire };
}

function snapshot(hive) {
  hive.writeFleetSnapshot({
    ts: Date.now() - 4000,
    agents: [
      { id: 'god-1', name: 'Michael', role: 'orchestrator', isGod: true, breaker: 'ok', tokens: 812_400, usd: 4.2199, lastActiveSecAgo: 6, inboxBacklog: 2 },
      { id: 'jim-1', name: 'Jim', role: 'agent', breaker: 'warn', tokens: 120_401, usd: 1.0231, lastActiveSecAgo: 240, inboxBacklog: 0 },
      { id: 'pam-1', name: 'Pam', role: 'agent', breaker: 'ok', tokens: 0, usd: 0, lastActiveSecAgo: null, inboxBacklog: 0 }
    ]
  });
}

const context = (res) => res?.hookSpecificOutput?.additionalContext ?? '';

test('the roster line carries the whole floor and its state', async (t) => {
  const { hive } = await floor(t);
  assert.equal(hive.rosterContext(), null, 'no snapshot yet — inject nothing rather than noise');

  snapshot(hive);
  const line = hive.rosterContext();

  assert.ok(!line.includes('\n'), 'must stay a single compact line');
  for (const id of ['god-1', 'jim-1', 'pam-1']) assert.ok(line.includes(id), `missing ${id}`);
  assert.match(line, /812k tok/);
  assert.match(line, /\$4\.22/);
  assert.match(line, /inbox 2/);
  assert.match(line, /breaker warn/);
  assert.match(line, /god-1[^;]*you/, 'god has to be able to spot itself');
  assert.match(line, /no activity yet/, 'an agent that never ran must not read as "active never"');
  assert.match(line, /SUPERSEDES/, 'the point is to override what god remembers');
  assert.ok(line.length < 1200, `too long for a 3-agent floor: ${line.length} chars`);
});

test('god gets the roster on SessionStart and on every prompt — nobody else does', async (t) => {
  const { hive, fire } = await floor(t);
  snapshot(hive);

  const start = await fire('god-1', 'SessionStart');
  assert.match(context(start), /LIVE ROSTER/);
  assert.equal(start.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(context(await fire('god-1', 'UserPromptSubmit')), /LIVE ROSTER/);

  assert.doesNotMatch(context(await fire('jim-1', 'SessionStart')), /LIVE ROSTER/);
  assert.doesNotMatch(context(await fire('jim-1', 'UserPromptSubmit')), /LIVE ROSTER/);
  assert.doesNotMatch(context(await fire('god-1', 'PostToolUse')), /LIVE ROSTER/,
    'prompt boundaries only — not once per tool call');
});

test('a queued operator steer is not swallowed by the roster', async (t) => {
  const steer = 'OPERATOR: stop and summarize.';
  const { hive, fire } = await floor(t, { steer });
  snapshot(hive);

  const ctx = context(await fire('god-1', 'UserPromptSubmit'));
  assert.match(ctx, /LIVE ROSTER/);
  assert.ok(ctx.includes(steer), 'only one additionalContext exists — the two must merge, not race');
});

test('a corrupt fleet.json degrades to no injection instead of throwing into a hook', async (t) => {
  const { home, hive, fire } = await floor(t);
  snapshot(hive);
  fs.writeFileSync(path.join(home, 'hive', 'fleet.json'), '{ not json');

  assert.equal(hive.rosterContext(), null);
  const res = await fire('god-1', 'SessionStart');
  assert.doesNotMatch(context(res), /LIVE ROSTER/);
});

// ─── D-30 — capabilityLine() gets its first production consumer, on the roster ───

/** Register an agent the way a spawn would, without booting a real one or
 *  running that engine's own provisioning — the seedAgent shape from
 *  test/hive-protocol-v2.test.cjs:40-52. Used for a NON-claude engine, whose
 *  provisioning this test has no business exercising. */
function seedAgent(home, id, provider) {
  const dir = path.join(home, 'hive', 'agents', id);
  fs.mkdirSync(path.join(dir, 'inbox', '.done'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'outbox', '.sent'), { recursive: true });
  const registry = path.join(home, 'hive', 'registry.json');
  const reg = JSON.parse(fs.readFileSync(registry, 'utf8'));
  reg.agents[id] = { id, name: id, cwd: home, status: 'idle', lastSeen: Date.now(), provider };
  fs.writeFileSync(registry, JSON.stringify(reg, null, 2));
}

test('capabilityLine() has landed on the roster — a gapped engine carries its own gap text', async (t) => {
  const { home, hive } = await floor(t);
  // D-01 re-measurement: the plan that authored this file's cases named kimi as
  // the gapped example, but 02-07 (a declared dependency of this plan) landed
  // kimi's inbox bridge first — providerCapabilities('kimi').mail is now true,
  // so kimi renders "mail ok" and would NOT exercise this clause. copilot's
  // canReceiveInbox is permanently false (D-32/D-33/D-34), so it is used here
  // instead; kimi's own bridge is asserted in test/engine-parity.test.cjs.
  seedAgent(home, 'copilot-1', 'copilot');
  snapshot(hive);
  hive.writeFleetSnapshot({
    ts: Date.now() - 4000,
    agents: [
      { id: 'god-1', name: 'Michael', role: 'orchestrator', isGod: true, breaker: 'ok', tokens: 812_400, usd: 4.2199, lastActiveSecAgo: 6, inboxBacklog: 2 },
      { id: 'jim-1', name: 'Jim', role: 'agent', breaker: 'warn', tokens: 120_401, usd: 1.0231, lastActiveSecAgo: 240, inboxBacklog: 0 },
      { id: 'pam-1', name: 'Pam', role: 'agent', breaker: 'ok', tokens: 0, usd: 0, lastActiveSecAgo: null, inboxBacklog: 0 },
      { id: 'copilot-1', name: 'copilot-1', role: 'agent', breaker: 'ok', tokens: 0, usd: 0, lastActiveSecAgo: null, inboxBacklog: 0 }
    ]
  });

  const line = hive.rosterContext();
  const rows = line.split('; ');
  assert.equal(rows.length, 4, `expected 4 rows (3 base + 1 copilot), no ';' introduced inside a row: ${line}`);

  // `.includes(id + ' "')` rather than `.startsWith(id)`: the FIRST row also
  // carries the "[LIVE ROSTER … ] N ACTIVE agent(s): " preamble ahead of the
  // first agent id, so a startsWith check silently never matches row 0.
  const rowFor = (id) => rows.find((r) => r.includes(`${id} "`));

  const copilotRow = rowFor('copilot-1');
  assert.ok(copilotRow, 'the copilot row must be present');
  assert.match(copilotRow, /NO MAIL \(bounces to you\)/, 'a mail-less engine must shout it on its own row');

  // The claude rows must carry NO capability clause — the gate is proven, not
  // just asserted for the one engine that has a gap.
  for (const id of ['god-1', 'jim-1', 'pam-1']) {
    const row = rowFor(id);
    assert.ok(row, `${id} row must be present`);
    assert.doesNotMatch(row, /NO MAIL|spend UNTRACKED|NO COMPACT|NO REMOTE CONTROL|REMOTE CONTROL unavailable|mail ok|remote control ok/,
      `${id} is claude, gap-free, and must carry no capability text: ${row}`);
  }
});

test('an all-claude floor (no gaps) renders the roster byte-for-byte what it rendered before this plan', async (t) => {
  const { hive } = await floor(t);
  snapshot(hive);
  const line = hive.rosterContext();

  // Every pre-existing assertion from the first test in this file, unchanged:
  assert.ok(!line.includes('\n'));
  for (const id of ['god-1', 'jim-1', 'pam-1']) assert.ok(line.includes(id));
  assert.match(line, /812k tok/);
  assert.match(line, /\$4\.22/);
  assert.match(line, /inbox 2/);
  assert.match(line, /breaker warn/);
  assert.match(line, /god-1[^;]*you/);
  assert.match(line, /no activity yet/);
  assert.match(line, /SUPERSEDES/);
  assert.ok(line.length < 1200, `too long for a 3-agent floor: ${line.length} chars`);

  // …and the new fact this plan adds: a gap-free floor carries zero capability
  // text — measured EQUAL to the pre-plan length, not just "still short".
  assert.doesNotMatch(line, /NO MAIL|spend UNTRACKED|NO COMPACT|NO REMOTE CONTROL|REMOTE CONTROL unavailable|mail ok|remote control ok/);
  // The raw `line.length` embeds an OS temp-dir path ("auto-injected from
  // <path>") whose length varies by machine/CI runner, so pinning an absolute
  // byte count here would be an environment-fragile literal, not a real gate.
  // Strip that one volatile preamble before measuring — everything after it is
  // static fixture content, deterministic on every machine.
  const contentOnly = line.replace(/^\[.*?\] /, '');
  // Measured this session against the real pre-plan hive.ts (git show
  // 674ed4c), loaded through test/load-ts.cjs and run against this exact
  // fixture with the SAME home directory reused for both loads (so the only
  // variable was the code): 469 characters both before and after this plan's
  // edit, over the content-only slice — an EXACT equality. Full transcript in
  // 02-08-SUMMARY.md.
  assert.equal(contentOnly.length, 469, 'a gap-free roster must be byte-for-byte identical to the pre-plan length');
});

test('a 24-row worst-case floor (MAX cap, every row gapped) stays one line and under 6KB', async (t) => {
  const { home, hive } = await floor(t);
  const fleetAgents = [
    { id: 'god-1', name: 'Michael', role: 'orchestrator', isGod: true, breaker: 'ok', tokens: 0, usd: 0, lastActiveSecAgo: 6, inboxBacklog: 0 }
  ];
  // 23 more rows, all `custom` — the worst-case provider (all four gap bits
  // set, longest capabilityLine of the eleven presets) — for a floor of MAX=24.
  for (let i = 1; i <= 23; i++) {
    const id = `custom-${i}`;
    seedAgent(home, id, 'custom');
    fleetAgents.push({ id, name: id, role: 'agent', breaker: 'ok', tokens: 0, usd: 0, lastActiveSecAgo: null, inboxBacklog: 0 });
  }
  hive.writeFleetSnapshot({ ts: Date.now() - 1000, agents: fleetAgents });

  const line = hive.rosterContext();
  assert.ok(!line.includes('\n'), 'still one line at the MAX cap');
  // Measured this session: 24 rows (1 claude + 23 all-gapped custom) = 4941
  // raw characters on win32 — recorded here as the worst-case ceiling this
  // plan's own `// ponytail:` comment names, not as a hard limit: the roster
  // has no hard byte cap today, only MAX=24 rows.
  assert.ok(line.length < 6000, `24-row worst case must stay well under a prompt-crowding size: ${line.length} chars`);
});

test('the ADR-0002 seam carries no capabilityLine( and no volatile value', () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'src/main/hive.ts'), 'utf8');
  const start = source.indexOf('— agent-facing text —');
  const end = source.indexOf('— messaging —');
  assert.ok(start > 0 && end > start, 'the agent-facing-text seam markers must both be present');
  const slice = stripComments(source.slice(start, end));
  assert.doesNotMatch(slice, /capabilityLine\(/, 'the capability clause must never enter the cached prefix');
  assert.doesNotMatch(slice, /Date\.now\(\)/, 'no volatile value may enter the cached prefix');
  assert.match(slice, /injectedPrompt/, 'survival pin — an unsliced match would stay green with the seam deleted');
});
