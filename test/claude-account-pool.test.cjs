'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  DEFAULT_COOLDOWN_MS,
  USAGE_WINDOW_MS,
  SWITCH_COOLDOWN_MS,
  emptyPoolState,
  effectiveHealth,
  isHealthy,
  markCooling,
  markDead,
  markActive,
  expireCooling,
  earliestReset,
  seedReference,
  clearReference,
  recordUsage,
  tokensInWindow,
  chooseAccount,
  resolveSpawnAccount,
  planFailover,
  parseResetFromError,
  fmtCountdown
} = loadTs('src/shared/claudeAccountPool.ts');
const { encodeAccountChoice, decodeAccountChoice } = loadTs('src/shared/claudeAccounts.ts');

const H = 3_600_000;
const NOW = 1_700_000_000_000;
const ACCOUNTS = [
  { id: 'acct-a', label: 'A', createdAt: 1 },
  { id: 'acct-b', label: 'B', createdAt: 2 },
  { id: 'acct-c', label: 'C', createdAt: 3 }
];

// ─── state machine ───────────────────────────────────────────────────────────

test('a fresh account is active; cooling lasts until untilTs then lazily reads active and expires', () => {
  let s = emptyPoolState();
  assert.deepEqual(effectiveHealth(s.accounts['acct-a'], NOW), { state: 'active' });
  assert.equal(isHealthy(s.accounts['acct-a'], NOW), true);
  s = markCooling(s, 'acct-a', { untilTs: NOW + 2 * H, reason: '429 usage limit' }, NOW);
  assert.equal(s.accounts['acct-a'].health.state, 'cooling');
  assert.equal(s.accounts['acct-a'].health.untilTs, NOW + 2 * H);
  assert.equal(isHealthy(s.accounts['acct-a'], NOW + H), false);
  assert.equal(isHealthy(s.accounts['acct-a'], NOW + 2 * H), true);
  const r = expireCooling(s, NOW + 2 * H);
  assert.deepEqual(r.resumed, ['acct-a']);
  assert.equal(r.state.accounts['acct-a'].health.state, 'active');
  // nothing to expire a second time
  assert.deepEqual(expireCooling(r.state, NOW + 3 * H).resumed, []);
});

test('a repeated 429 never SHORTENS a cooldown, and a 429 on a dead account leaves it dead', () => {
  let s = markCooling(emptyPoolState(), 'acct-a', { untilTs: NOW + 3 * H, reason: 'first' }, NOW);
  s = markCooling(s, 'acct-a', { untilTs: NOW + H, reason: 'second' }, NOW + 1000);
  assert.equal(s.accounts['acct-a'].health.untilTs, NOW + 3 * H);
  s = markCooling(s, 'acct-a', { untilTs: NOW + 4 * H, reason: 'third' }, NOW + 2000);
  assert.equal(s.accounts['acct-a'].health.untilTs, NOW + 4 * H);
  s = markDead(s, 'acct-b', 'token rejected (401)', NOW);
  s = markCooling(s, 'acct-b', { untilTs: NOW + H, reason: '429' }, NOW);
  assert.equal(s.accounts['acct-b'].health.state, 'dead');
});

test('dead clears the reference uuid, never expires with time, and only a manual mark-active revives it', () => {
  let s = seedReference(emptyPoolState(), 'acct-a', 'uuid-bad');
  assert.equal(s.accounts['acct-a'].referenceUuid, 'uuid-bad');
  s = markDead(s, 'acct-a', 'token rejected (401)', NOW);
  assert.equal(s.accounts['acct-a'].health.state, 'dead');
  assert.equal(s.accounts['acct-a'].referenceUuid, undefined);
  assert.equal(isHealthy(s.accounts['acct-a'], NOW + 100 * H), false);
  assert.deepEqual(expireCooling(s, NOW + 100 * H).resumed, []);
  s = markActive(s, 'acct-a');
  assert.deepEqual(s.accounts['acct-a'].health, { state: 'active' });
  // the next good session re-seeds the reference
  s = seedReference(s, 'acct-a', 'uuid-good');
  assert.equal(s.accounts['acct-a'].referenceUuid, 'uuid-good');
  // seeding never overwrites an existing reference (first session wins)
  s = seedReference(s, 'acct-a', 'uuid-other');
  assert.equal(s.accounts['acct-a'].referenceUuid, 'uuid-good');
  s = clearReference(s, 'acct-a');
  assert.equal(s.accounts['acct-a'].referenceUuid, undefined);
});

test('earliestReset is the soonest still-pending cooldown, ignoring expired + dead accounts', () => {
  let s = emptyPoolState();
  assert.equal(earliestReset(s, NOW), null);
  s = markCooling(s, 'acct-a', { untilTs: NOW + 3 * H, reason: 'x' }, NOW);
  s = markCooling(s, 'acct-b', { untilTs: NOW + H, reason: 'x' }, NOW);
  s = markDead(s, 'acct-c', '401', NOW);
  assert.equal(earliestReset(s, NOW), NOW + H);
  assert.equal(earliestReset(s, NOW + H), NOW + 3 * H); // B expired → A is next
  assert.equal(earliestReset(s, NOW + 3 * H), null);
});

// ─── usage window + least-loaded chooser ─────────────────────────────────────

test('usage is bucketed per minute and only the last 5h counts', () => {
  let s = recordUsage(emptyPoolState(), 'acct-a', 1000, NOW - USAGE_WINDOW_MS - 60_000); // ancient
  s = recordUsage(s, 'acct-a', 100, NOW); // …pruned by the first in-window record
  s = recordUsage(s, 'acct-a', 50, NOW + 10_000); // same minute bucket
  assert.equal(s.accounts['acct-a'].usage.length, 1);
  assert.equal(tokensInWindow(s.accounts['acct-a'], NOW + 10_000), 150);
  assert.equal(tokensInWindow(s.accounts['acct-a'], NOW + USAGE_WINDOW_MS + 60_000), 0);
  assert.equal(tokensInWindow(undefined, NOW), 0);
});

test('chooseAccount picks the least-loaded HEALTHY account; ties prefer the current account, then creation order', () => {
  let s = emptyPoolState();
  s = recordUsage(s, 'acct-a', 500, NOW);
  s = recordUsage(s, 'acct-b', 100, NOW);
  s = recordUsage(s, 'acct-c', 100, NOW);
  assert.equal(chooseAccount({ accounts: ACCOUNTS, state: s, now: NOW }), 'acct-b'); // tie b/c → created first
  assert.equal(chooseAccount({ accounts: ACCOUNTS, state: s, now: NOW, prefer: 'acct-c' }), 'acct-c');
  s = markCooling(s, 'acct-b', { untilTs: NOW + H, reason: '429' }, NOW);
  s = markDead(s, 'acct-c', '401', NOW);
  assert.equal(chooseAccount({ accounts: ACCOUNTS, state: s, now: NOW }), 'acct-a');
  assert.equal(chooseAccount({ accounts: ACCOUNTS, state: s, now: NOW, exclude: ['acct-a'] }), null);
  // B comes back once its cooldown lapses
  assert.equal(chooseAccount({ accounts: ACCOUNTS, state: s, now: NOW + H }), 'acct-b');
  assert.equal(chooseAccount({ accounts: [], state: s, now: NOW }), null);
});

// ─── spawn-time resolution ───────────────────────────────────────────────────

test('resolveSpawnAccount: no pin and no policy → login; auto with an empty pool → login', () => {
  const s = emptyPoolState();
  assert.deepEqual(resolveSpawnAccount({ policy: undefined, account: undefined, accounts: ACCOUNTS, state: s, now: NOW }), { kind: 'login' });
  assert.deepEqual(resolveSpawnAccount({ policy: 'auto', account: undefined, accounts: [], state: s, now: NOW }), { kind: 'login' });
});

test('resolveSpawnAccount: auto lands on the least-loaded healthy account and fails closed when none is healthy', () => {
  let s = recordUsage(emptyPoolState(), 'acct-a', 900, NOW);
  assert.deepEqual(resolveSpawnAccount({ policy: 'auto', account: 'acct-a', accounts: ACCOUNTS, state: s, now: NOW }), { kind: 'account', account: 'acct-b' });
  for (const id of ['acct-a', 'acct-b']) s = markCooling(s, id, { untilTs: NOW + 2 * H, reason: '429' }, NOW);
  s = markDead(s, 'acct-c', '401', NOW);
  const r = resolveSpawnAccount({ policy: 'auto', account: undefined, accounts: ACCOUNTS, state: s, now: NOW });
  assert.equal(r.kind, 'fail');
  assert.equal(r.earliestReset, NOW + 2 * H);
  assert.match(r.error, /cooling|dead/i);
});

test('resolveSpawnAccount: a pinned account is used as-is while healthy (PR 1 behaviour), swapped when unhealthy, passed through when unknown', () => {
  let s = emptyPoolState();
  assert.deepEqual(resolveSpawnAccount({ policy: undefined, account: 'acct-a', accounts: ACCOUNTS, state: s, now: NOW }), { kind: 'account', account: 'acct-a' });
  // unknown id → passthrough so decideClaudeAccountEnv's "no longer exists" fail-closed message still fires
  assert.deepEqual(resolveSpawnAccount({ policy: undefined, account: 'acct-gone', accounts: ACCOUNTS, state: s, now: NOW }), { kind: 'account', account: 'acct-gone' });
  s = markCooling(s, 'acct-a', { untilTs: NOW + H, reason: '429' }, NOW);
  assert.deepEqual(resolveSpawnAccount({ policy: undefined, account: 'acct-a', accounts: ACCOUNTS, state: s, now: NOW }), { kind: 'account', account: 'acct-b', switchedFrom: 'acct-a' });
  s = markCooling(s, 'acct-b', { untilTs: NOW + 3 * H, reason: '429' }, NOW);
  s = markCooling(s, 'acct-c', { untilTs: NOW + 2 * H, reason: '429' }, NOW);
  const r = resolveSpawnAccount({ policy: undefined, account: 'acct-a', accounts: ACCOUNTS, state: s, now: NOW });
  assert.equal(r.kind, 'fail');
  assert.equal(r.earliestReset, NOW + H);
  assert.match(r.error, /A/);
});

// ─── failover planner ────────────────────────────────────────────────────────

test('planFailover moves every agent on an unhealthy account to a healthy one and leaves login/healthy agents alone', () => {
  let s = markCooling(emptyPoolState(), 'acct-a', { untilTs: NOW + H, reason: '429' }, NOW);
  s = recordUsage(s, 'acct-b', 10, NOW);
  const plan = planFailover({
    agents: [
      { agentId: 'jim', account: 'acct-a' },
      { agentId: 'pam', account: 'acct-a' },
      { agentId: 'dwight', account: 'acct-b' },
      { agentId: 'god' } // login account — never touched
    ],
    accounts: ACCOUNTS, state: s, now: NOW, lastSwitchAt: {}
  });
  assert.deepEqual(plan.switches, [
    { agentId: 'jim', from: 'acct-a', to: 'acct-c' },
    { agentId: 'pam', from: 'acct-a', to: 'acct-c' }
  ]);
  assert.deepEqual(plan.stranded, []);
  assert.deepEqual(plan.rateLimited, []);
});

test('planFailover rate-limits to one switch per agent per 10 minutes unless forced, and reports stranded agents with the earliest reset', () => {
  let s = markCooling(emptyPoolState(), 'acct-a', { untilTs: NOW + H, reason: '429' }, NOW);
  const agents = [{ agentId: 'jim', account: 'acct-a' }];
  const recent = { jim: NOW - SWITCH_COOLDOWN_MS + 1000 };
  assert.deepEqual(planFailover({ agents, accounts: ACCOUNTS, state: s, now: NOW, lastSwitchAt: recent }).rateLimited, ['jim']);
  assert.equal(planFailover({ agents, accounts: ACCOUNTS, state: s, now: NOW, lastSwitchAt: recent }).switches.length, 0);
  assert.equal(planFailover({ agents, accounts: ACCOUNTS, state: s, now: NOW, lastSwitchAt: recent, force: true }).switches.length, 1);
  assert.equal(planFailover({ agents, accounts: ACCOUNTS, state: s, now: NOW + SWITCH_COOLDOWN_MS, lastSwitchAt: { jim: NOW - SWITCH_COOLDOWN_MS } }).switches.length, 1);
  // everyone cooling → stranded, with the countdown target
  s = markCooling(s, 'acct-b', { untilTs: NOW + 2 * H, reason: '429' }, NOW);
  s = markCooling(s, 'acct-c', { untilTs: NOW + 3 * H, reason: '429' }, NOW);
  const p = planFailover({ agents, accounts: ACCOUNTS, state: s, now: NOW, lastSwitchAt: {} });
  assert.deepEqual(p.stranded, ['jim']);
  assert.equal(p.earliestReset, NOW + H);
  // `only` narrows a manual rotate to one agent
  const many = [{ agentId: 'jim', account: 'acct-a' }, { agentId: 'pam', account: 'acct-a' }];
  const s2 = markCooling(emptyPoolState(), 'acct-a', { untilTs: NOW + H, reason: '429' }, NOW);
  assert.deepEqual(planFailover({ agents: many, accounts: ACCOUNTS, state: s2, now: NOW, lastSwitchAt: {}, only: ['pam'] }).switches.map((x) => x.agentId), ['pam']);
});

// ─── cooldown math: parse a reset instant out of an error payload ────────────

test('parseResetFromError understands retry-after seconds, relative "in", clock times, ISO + epoch — and gives up on garbage', () => {
  assert.equal(parseResetFromError('rate_limit_error: retry-after: 90', NOW), NOW + 90_000);
  assert.equal(parseResetFromError('{"error":{"type":"rate_limit_error","message":"Too many requests"},"retry_after":120}', NOW), NOW + 120_000);
  assert.equal(parseResetFromError('Your limit will reset in 2h 30m', NOW), NOW + 2 * H + 30 * 60_000);
  assert.equal(parseResetFromError('resets in 45 minutes', NOW), NOW + 45 * 60_000);
  assert.equal(parseResetFromError('limit resets in 3 hours', NOW), NOW + 3 * H);
  const iso = new Date(NOW + 4 * H).toISOString();
  assert.equal(parseResetFromError(`usage limit reached; resets_at ${iso}`, NOW), NOW + 4 * H);
  assert.equal(parseResetFromError(`"resets_at":${Math.floor((NOW + 5 * H) / 1000)}`, NOW), NOW + 5 * H);
  assert.equal(parseResetFromError('something else entirely', NOW), null);
  assert.equal(parseResetFromError('', NOW), null);
  // a parsed instant in the past (or absurdly far out) is useless — let the caller default
  assert.equal(parseResetFromError(`resets_at ${new Date(NOW - H).toISOString()}`, NOW), null);
  assert.equal(parseResetFromError('retry-after: 9999999', NOW), null);
});

test('parseResetFromError turns "resets 3pm" into the next 3pm in local time (today, else tomorrow)', () => {
  const base = new Date(2026, 7, 19, 12, 0, 0, 0).getTime(); // local noon
  const r = parseResetFromError("You've hit your limit · resets 3pm (Asia/Kolkata)", base);
  assert.equal(r, new Date(2026, 7, 19, 15, 0, 0, 0).getTime());
  const late = parseResetFromError('resets at 9:30am', base);
  assert.equal(late, new Date(2026, 7, 20, 9, 30, 0, 0).getTime());
  assert.equal(parseResetFromError('Your limit will reset at 22:15', base), new Date(2026, 7, 19, 22, 15, 0, 0).getTime());
});

test('fmtCountdown renders hours+minutes, minutes, or "now"', () => {
  assert.equal(fmtCountdown(NOW + 2 * H + 5 * 60_000, NOW), '2h 5m');
  assert.equal(fmtCountdown(NOW + 40 * 60_000, NOW), '40m');
  assert.equal(fmtCountdown(NOW + 20_000, NOW), '<1m');
  assert.equal(fmtCountdown(NOW - 1, NOW), 'now');
  assert.equal(DEFAULT_COOLDOWN_MS, 5 * H);
});

// ─── UI choice encoding (login / auto / pinned id) ───────────────────────────

test('account choice encode/decode round-trips login, auto and a pinned id', () => {
  assert.equal(encodeAccountChoice(undefined, undefined), '');
  assert.equal(encodeAccountChoice(undefined, 'acct-1'), 'acct-1');
  assert.equal(encodeAccountChoice('auto', 'acct-1'), 'auto');
  assert.deepEqual(decodeAccountChoice(''), { account: undefined, accountPolicy: undefined });
  // auto keeps whatever concrete account the agent last ran on (it's only a tie-break hint)
  assert.deepEqual(decodeAccountChoice('auto'), { accountPolicy: 'auto' });
  assert.deepEqual(decodeAccountChoice('acct-1'), { account: 'acct-1', accountPolicy: undefined });
});
