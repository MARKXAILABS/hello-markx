'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const loadTs = require('./load-ts.cjs');

const { TelemetryCollector } = loadTs('src/main/telemetry.ts');
const { AccountPoolManager } = loadTs('src/main/accountPool.ts');
const { DEFAULT_COOLDOWN_MS, SWITCH_COOLDOWN_MS } = loadTs('src/shared/claudeAccountPool.ts');

const H = 3_600_000;
const ACCOUNTS = [
  { id: 'acct-a', label: 'Work', createdAt: 1 },
  { id: 'acct-b', label: 'Personal', createdAt: 2 }
];

const kv = (key, value) => (typeof value === 'number'
  ? { key, value: { intValue: String(value) } }
  : { key, value: { stringValue: value } });

/** A synthetic OTLP/JSON logs export carrying one claude_code.api_error event. */
function otlpApiError({ agentId, sessionId, statusCode, error, email }) {
  const attrs = [kv('event.name', 'api_error'), kv('session.id', sessionId), kv('error', error), kv('model', 'claude-sonnet-4-6')];
  if (statusCode !== undefined) attrs.push(kv('status_code', statusCode));
  if (email) attrs.push(kv('user.email', email));
  return {
    resourceLogs: [{
      resource: { attributes: [kv('agent.id', agentId), kv('agent.name', 'Jim')] },
      scopeLogs: [{ logRecords: [{ body: { stringValue: 'claude_code.api_error' }, attributes: attrs }] }]
    }]
  };
}

/** A synthetic OTLP/JSON metrics export with one token.usage data point. */
function otlpUsage({ agentId, sessionId, tokens, accountUuid }) {
  const attrs = [kv('session.id', sessionId), kv('type', 'input'), kv('model', 'claude-sonnet-4-6')];
  if (accountUuid) attrs.push(kv('user.account_uuid', accountUuid));
  return {
    resourceMetrics: [{
      resource: { attributes: [kv('agent.id', agentId)] },
      scopeMetrics: [{ metrics: [{ name: 'claude_code.token.usage', sum: { dataPoints: [{ asInt: String(tokens), attributes: attrs }] } }] }]
    }]
  };
}

/** Wire a collector → manager pair the way index.ts does, with fakes around it. */
function rig({ agents, accounts = ACCOUNTS, tokens = ['acct-a', 'acct-b'], now = 1_700_000_000_000 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cth-pool-'));
  const statePath = join(dir, 'claude-account-pool.json');
  const events = [];
  const alerts = [];
  const logs = [];
  const clock = { now };
  const live = { agents: agents ?? [{ agentId: 'jim', name: 'Jim', account: 'acct-a' }] };
  const collector = new TelemetryCollector({ emit: (ch, payload) => events.push({ ch, payload }) });
  const pool = new AccountPoolManager({
    statePath: () => statePath,
    accounts: () => accounts,
    tokenPresent: (id) => tokens.includes(id),
    liveAgents: () => live.agents,
    emit: (ch, payload) => events.push({ ch, payload }),
    alert: (title, body) => alerts.push({ title, body }),
    log: (...a) => logs.push(a.map(String).join(' ')),
    now: () => clock.now
  });
  pool.load();
  collector.onApiError((agentId, info) => pool.handleApiError(agentId, info));
  collector.onAgentUsage((sample) => pool.recordUsage(sample));
  return { statePath, events, alerts, logs, clock, live, collector, pool };
}

const ofKind = (events, ch) => events.filter((e) => e.ch === ch).map((e) => e.payload);

// ─── collector: status_code rides the api_error event, identity still doesn't ─

test('the collector surfaces status_code on api_error (event + in-process feed) and still drops the email', () => {
  const { events, collector } = rig();
  const seen = [];
  collector.onApiError((agentId, info) => seen.push({ agentId, ...info }));
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', statusCode: 429, error: 'rate_limit_error: retry-after: 60', email: 'x@example.com' }));
  const ev = ofKind(events, 'telemetry:event').find((e) => e.kind === 'api_error');
  assert.equal(ev.statusCode, 429);
  assert.equal(ev.agentId, 'jim');
  assert.equal(seen[0].statusCode, 429);
  assert.equal(seen[0].sessionId, 's1');
  assert.doesNotMatch(JSON.stringify(events), /x@example\.com/);
  // a legacy breaker-style subscriber that ignores the info arg still works
  let count = 0;
  collector.onApiError(() => { count += 1; });
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', statusCode: 500, error: 'boom' }));
  assert.equal(count, 1);
});

// ─── 429 → cooling → failover ────────────────────────────────────────────────

test('a 429 cools the agent\'s account (reset parsed from the payload), emits ONE failover to the next healthy account, persists, and logs the payload once', () => {
  const { events, alerts, logs, clock, live, collector, pool, statePath } = rig();
  collector.ingestMetrics(otlpUsage({ agentId: 'jim', sessionId: 's1', tokens: 100 })); // jim's live session is s1
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', statusCode: 429, error: "Claude usage limit reached. Your limit will reset in 2h 30m" }));
  const snap = pool.snapshot();
  assert.equal(snap.accounts['acct-a'].health.state, 'cooling');
  assert.equal(snap.accounts['acct-a'].health.untilTs, clock.now + 2 * H + 30 * 60_000);
  assert.equal(snap.accounts['acct-a'].lastError.statusCode, 429);
  assert.equal(snap.accounts['acct-a'].switchCount, 1);
  assert.equal(snap.accounts['acct-b'].health.state, 'active');
  assert.equal(snap.earliestReset, clock.now + 2 * H + 30 * 60_000);
  const fo = ofKind(events, 'claudeAccount:failover');
  assert.equal(fo.length, 1);
  assert.deepEqual(fo[0].switches, [{ agentId: 'jim', from: 'acct-a', to: 'acct-b', fromLabel: 'Work', toLabel: 'Personal' }]);
  // a second 429 from the SAME (now stale) session must not re-plan / thrash
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', statusCode: 429, error: 'again' }));
  assert.equal(ofKind(events, 'claudeAccount:failover').length, 1);
  // …and even well after the rate-limit window, a LATE event from the killed
  // session s1 must not be blamed on the account jim now runs on (B)
  live.agents[0].account = 'acct-b';
  clock.now += SWITCH_COOLDOWN_MS + 1000;
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', statusCode: 429, error: 'late flush from the old process' }));
  assert.equal(pool.snapshot().accounts['acct-b'].health.state, 'active');
  assert.equal(ofKind(events, 'claudeAccount:failover').length, 1);
  // persisted for the next boot
  assert.equal(existsSync(statePath), true);
  const disk = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(disk.accounts['acct-a'].health.state, 'cooling');
  // calibration log carries the status + text exactly once
  assert.equal(logs.filter((l) => /calibration/.test(l)).length, 1);
  assert.match(logs.find((l) => /calibration/.test(l)), /429/);
  assert.ok(alerts.some((a) => /limit/i.test(a.title)));
});

test('the session named by the triggering 429 itself is the stale one — even when no usage sample ever named it', () => {
  const { events, clock, live, collector, pool } = rig();
  // first call of a brand-new session fails: no usage sample yet, only this error
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 'fresh-1', statusCode: 429, error: 'resets in 2h' }));
  assert.equal(ofKind(events, 'claudeAccount:failover').length, 1);
  live.agents[0].account = 'acct-b'; // renderer respawned jim on B
  clock.now += SWITCH_COOLDOWN_MS + 1000;
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 'fresh-1', statusCode: 429, error: 'late flush' }));
  assert.equal(pool.snapshot().accounts['acct-b'].health.state, 'active');
  assert.equal(ofKind(events, 'claudeAccount:failover').length, 1);
});

test('a 429 with no parseable reset falls back to the 5h default cooldown', () => {
  const { clock, collector, pool } = rig();
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', statusCode: 429, error: 'rate_limit_error' }));
  assert.equal(pool.snapshot().accounts['acct-a'].health.untilTs, clock.now + DEFAULT_COOLDOWN_MS);
});

test('a 429 from an agent on the login account, a non-429/401 status, or an unknown account changes nothing', () => {
  const { events, live, collector, pool } = rig({ agents: [{ agentId: 'god', name: 'Michael' }, { agentId: 'jim', name: 'Jim', account: 'acct-a' }] });
  collector.ingestLogs(otlpApiError({ agentId: 'god', sessionId: 'g1', statusCode: 429, error: 'limit' }));
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', statusCode: 529, error: 'overloaded' }));
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', error: 'no status at all' }));
  live.agents.push({ agentId: 'pam', name: 'Pam', account: 'acct-zzz' });
  collector.ingestLogs(otlpApiError({ agentId: 'pam', sessionId: 'p1', statusCode: 429, error: 'limit' }));
  assert.equal(pool.snapshot().accounts['acct-a'].health.state, 'active');
  assert.equal(ofKind(events, 'claudeAccount:failover').length, 0);
});

// ─── 401 → dead + reference uuid cleared + alert ─────────────────────────────

test('a 401 marks the account dead, clears its reference uuid, alerts, and fails its agents over', () => {
  const { events, alerts, live, collector, pool } = rig();
  // the bad-token session seeded a (wrong) reference first — PR 1's first-session-wins nuance
  collector.ingestMetrics(otlpUsage({ agentId: 'jim', sessionId: 's1', tokens: 10, accountUuid: 'uuid-wrong' }));
  assert.equal(pool.snapshot().accounts['acct-a'].referenceUuid, 'uuid-wrong');
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', statusCode: 401, error: 'authentication_error: invalid x-api-key' }));
  const acct = pool.snapshot().accounts['acct-a'];
  assert.equal(acct.health.state, 'dead');
  assert.equal(acct.referenceUuid, undefined);
  assert.equal(acct.lastError.statusCode, 401);
  assert.ok(alerts.some((a) => /401|token/i.test(a.title)));
  assert.deepEqual(ofKind(events, 'claudeAccount:failover')[0].switches.map((s) => s.to), ['acct-b']);
  // a session still on the DEAD account keeps reporting the login uuid (seen
  // live) — it must not re-seed the reference the 401 just cleared
  collector.ingestMetrics(otlpUsage({ agentId: 'jim', sessionId: 's1', tokens: 12, accountUuid: 'uuid-login' }));
  assert.equal(pool.snapshot().accounts['acct-a'].referenceUuid, undefined);
  // Claude Code reports the rejection once per attempt (seen live: 2 per prompt) —
  // the transition fires once; a repeat only refreshes lastError. (jim is now on
  // B in a fresh session s2; B's token is bad too.)
  live.agents[0].account = 'acct-b';
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's2', statusCode: 401, error: 'OAuth access token is invalid.' }));
  const alertsBefore = alerts.length;
  const failoversBefore = ofKind(events, 'claudeAccount:failover').length;
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's2', statusCode: 401, error: 'OAuth access token is invalid. (attempt 2)' }));
  assert.equal(pool.snapshot().accounts['acct-b'].health.state, 'dead');
  assert.equal(alerts.length, alertsBefore);
  assert.equal(ofKind(events, 'claudeAccount:failover').length, failoversBefore);
  assert.equal(pool.snapshot().accounts['acct-b'].lastError.message, 'OAuth access token is invalid. (attempt 2)');
  // time does not revive a dead account; a token replace does (and the next good session re-seeds)
  assert.equal(pool.snapshot().accounts['acct-a'].health.state, 'dead');
  pool.onTokenReplaced('acct-a');
  assert.equal(pool.snapshot().accounts['acct-a'].health.state, 'active');
  live.agents[0].account = 'acct-a'; // the operator restarted jim back on A with the new token
  collector.ingestMetrics(otlpUsage({ agentId: 'jim', sessionId: 's3', tokens: 10, accountUuid: 'uuid-good' }));
  assert.equal(pool.snapshot().accounts['acct-a'].referenceUuid, 'uuid-good');
});

// ─── all accounts cooling → pause, then auto-resume at the earliest reset ─────

test('with every account cooling the agents are paused (no respawn thrash) and the tick resumes them at reset', () => {
  const { events, alerts, clock, collector, pool } = rig({
    agents: [{ agentId: 'jim', name: 'Jim', account: 'acct-a' }, { agentId: 'pam', name: 'Pam', account: 'acct-b' }]
  });
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', statusCode: 429, error: 'resets in 1h' }));
  // jim moved to B
  assert.equal(ofKind(events, 'claudeAccount:failover').length, 1);
  collector.ingestLogs(otlpApiError({ agentId: 'pam', sessionId: 'p1', statusCode: 429, error: 'resets in 3h' }));
  // B now cooling too: pam has nowhere to go → stranded, no further failover event
  assert.equal(ofKind(events, 'claudeAccount:failover').length, 1);
  let snap = pool.snapshot();
  assert.equal(snap.healthyCount, 0);
  assert.ok(snap.stranded.includes('pam'));
  assert.equal(snap.earliestReset, clock.now + H);
  assert.ok(alerts.some((a) => /all .*cooling|paused/i.test(a.title + a.body)));
  // ticks before the reset change nothing
  clock.now += 30 * 60_000;
  pool.tick();
  assert.equal(ofKind(events, 'claudeAccount:resumed').length, 0);
  // at the reset A flips active: its agents get a resume nudge, and the stranded agent on B moves to A
  clock.now += 31 * 60_000;
  pool.tick();
  snap = pool.snapshot();
  assert.equal(snap.accounts['acct-a'].health.state, 'active');
  const resumed = ofKind(events, 'claudeAccount:resumed');
  assert.equal(resumed.length, 1);
  assert.deepEqual(resumed[0].accounts.map((a) => a.id), ['acct-a']);
  const fo = ofKind(events, 'claudeAccount:failover');
  assert.equal(fo.length, 2);
  assert.deepEqual(fo[1].switches.map((s) => [s.agentId, s.to]), [['pam', 'acct-a']]);
});

// ─── rate limit + stale-session guard ────────────────────────────────────────

test('an agent is switched at most once per 10 minutes: a 429 on the new account right away waits; the periodic tick moves it once the window passes', () => {
  const THREE = [...ACCOUNTS, { id: 'acct-c', label: 'Team', createdAt: 3 }];
  const { events, clock, live, collector, pool } = rig({ accounts: THREE, tokens: ['acct-a', 'acct-b', 'acct-c'] });
  // jim on A → 429 → moves to B (the renderer respawns; the registry now says B)
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', statusCode: 429, error: 'resets in 4h' }));
  assert.equal(ofKind(events, 'claudeAccount:failover').length, 1);
  assert.equal(ofKind(events, 'claudeAccount:failover')[0].switches[0].to, 'acct-b');
  live.agents[0].account = 'acct-b';
  // B 429s too (a NEW session id, so not the stale-session guard) inside the
  // 10-min window → B cools, C is healthy, but jim is rate-limited: no 2nd switch yet
  clock.now += 60_000;
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's2', statusCode: 429, error: 'resets in 4h' }));
  assert.equal(pool.snapshot().accounts['acct-b'].health.state, 'cooling');
  assert.equal(ofKind(events, 'claudeAccount:failover').length, 1);
  // once the window passes the periodic tick carries out the pending move → C
  clock.now += SWITCH_COOLDOWN_MS;
  pool.tick();
  const fo = ofKind(events, 'claudeAccount:failover');
  assert.equal(fo.length, 2);
  assert.deepEqual(fo[1].switches.map((s) => [s.agentId, s.from, s.to]), [['jim', 'acct-b', 'acct-c']]);
});

test('an account without a stored token is never a failover target or an auto choice; a manual rotate cools + moves, mark-active revives', () => {
  const { events, clock, collector, pool } = rig({ tokens: ['acct-a'] }); // B has no token
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', statusCode: 429, error: 'resets in 1h' }));
  assert.equal(ofKind(events, 'claudeAccount:failover').length, 0);
  assert.deepEqual(pool.snapshot().stranded, ['jim']);
  // operator marks A active again by hand
  pool.markActive('acct-a');
  assert.equal(pool.snapshot().accounts['acct-a'].health.state, 'active');
  assert.equal(ofKind(events, 'claudeAccount:resumed').length, 1);
  // manual rotate: cools A for the default window and moves its agents — none can move (B tokenless) → stranded
  pool.rotateAccount('acct-a');
  const h = pool.snapshot().accounts['acct-a'].health;
  assert.equal(h.state, 'cooling');
  assert.equal(h.untilTs, clock.now + DEFAULT_COOLDOWN_MS);
  assert.match(h.reason, /manual/i);
});

test('resolveForSpawn honours auto / pinned / login against the live state and only offers accounts with a token', () => {
  const { clock, collector, pool } = rig({ tokens: ['acct-a', 'acct-b'] });
  assert.deepEqual(pool.resolveForSpawn({ policy: undefined, account: undefined }), { kind: 'login' });
  assert.deepEqual(pool.resolveForSpawn({ policy: undefined, account: 'acct-a' }), { kind: 'account', account: 'acct-a' });
  assert.deepEqual(pool.resolveForSpawn({ policy: 'auto', account: undefined }), { kind: 'account', account: 'acct-a' }); // tie → created first
  collector.ingestMetrics(otlpUsage({ agentId: 'jim', sessionId: 's1', tokens: 5000 })); // jim is on A → A is now the loaded one
  assert.deepEqual(pool.resolveForSpawn({ policy: 'auto', account: undefined }), { kind: 'account', account: 'acct-b' });
  collector.ingestLogs(otlpApiError({ agentId: 'jim', sessionId: 's1', statusCode: 429, error: 'resets in 1h' }));
  // pinned to cooling A → swapped to B, flagged so the caller re-pins
  assert.deepEqual(pool.resolveForSpawn({ policy: undefined, account: 'acct-a' }), { kind: 'account', account: 'acct-b', switchedFrom: 'acct-a' });
  clock.now += H;
  assert.deepEqual(pool.resolveForSpawn({ policy: undefined, account: 'acct-a' }), { kind: 'account', account: 'acct-a' });
});
