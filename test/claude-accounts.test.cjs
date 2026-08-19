'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  claudeAccountSecretRef,
  sanitizeResourceAttr,
  validateClaudeAccounts,
  newAccountLabelError,
  decideClaudeAccountEnv,
  pinnedAgentsForAccount,
  reduceAccountIntegrity,
  LOGIN_ACCOUNT_KEY
} = loadTs('src/shared/claudeAccounts.ts');

// ─── secret ref ──────────────────────────────────────────────────────────────

test('the broker ref for an account is namespaced under claude-account:', () => {
  assert.equal(claudeAccountSecretRef('acct-1a2b3c'), 'claude-account:acct-1a2b3c');
});

// ─── OTEL resource-attribute sanitizer ───────────────────────────────────────

test('sanitizer keeps only [A-Za-z0-9_-] — commas and equals can never split the attr list', () => {
  assert.equal(sanitizeResourceAttr('Work, A=B'), 'Work-A-B');
  assert.equal(sanitizeResourceAttr('team_max-2'), 'team_max-2');
  assert.doesNotMatch(sanitizeResourceAttr('a,b=c d'), /[,= ]/);
});

test('sanitizer collapses runs, trims edge dashes, and falls back when nothing is left', () => {
  assert.equal(sanitizeResourceAttr('  ~~Personal!!  '), 'Personal');
  assert.equal(sanitizeResourceAttr('***'), 'account');
  assert.equal(sanitizeResourceAttr(''), 'account');
});

test('sanitizer caps the value at 64 chars', () => {
  assert.equal(sanitizeResourceAttr('x'.repeat(200)).length, 64);
});

// ─── config validation ───────────────────────────────────────────────────────

test('a well-formed account list validates and is returned normalized', () => {
  const r = validateClaudeAccounts([
    { id: 'acct-1', label: 'Work', createdAt: 1 },
    { id: 'acct-2', label: 'Personal', createdAt: 2 }
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.accounts.map((a) => a.id), ['acct-1', 'acct-2']);
});

test('duplicate ids are rejected', () => {
  const r = validateClaudeAccounts([
    { id: 'acct-1', label: 'Work', createdAt: 1 },
    { id: 'acct-1', label: 'Other', createdAt: 2 }
  ]);
  assert.equal(r.ok, false);
  assert.match(r.error, /duplicate.*id/i);
});

test('duplicate labels are rejected case-insensitively', () => {
  const r = validateClaudeAccounts([
    { id: 'acct-1', label: 'Work', createdAt: 1 },
    { id: 'acct-2', label: ' work ', createdAt: 2 }
  ]);
  assert.equal(r.ok, false);
  assert.match(r.error, /duplicate.*label/i);
});

test('malformed entries are rejected instead of being silently dropped', () => {
  assert.equal(validateClaudeAccounts('nope').ok, false);
  assert.equal(validateClaudeAccounts([{ id: '', label: 'x', createdAt: 1 }]).ok, false);
  assert.equal(validateClaudeAccounts([{ id: 'a', label: '', createdAt: 1 }]).ok, false);
  assert.equal(validateClaudeAccounts([{ id: 'a', label: 'x' }]).ok, false);
});

test('a new label must be non-blank and unique against the existing pool', () => {
  const existing = [{ id: 'acct-1', label: 'Work', createdAt: 1 }];
  assert.equal(newAccountLabelError('Personal', existing), null);
  assert.match(newAccountLabelError('   ', existing), /label/i);
  assert.match(newAccountLabelError('work', existing), /already/i);
  assert.match(newAccountLabelError('x'.repeat(41), existing), /40/);
});

// ─── env-injection decision matrix ───────────────────────────────────────────

test('an agent with no account is left on the /login account — nothing injected', () => {
  assert.deepEqual(
    decideClaudeAccountEnv({ provider: 'claude', account: undefined, accountKnown: false, tokenPresent: false }),
    { kind: 'skip' }
  );
});

test('a non-Claude provider never gets a Claude token even if an account is set', () => {
  assert.deepEqual(
    decideClaudeAccountEnv({ provider: 'codex', account: 'acct-1', accountKnown: true, tokenPresent: true }),
    { kind: 'skip' }
  );
});

test('a Claude agent pinned to a known account with a stored token gets the token injected', () => {
  assert.deepEqual(
    decideClaudeAccountEnv({ provider: 'claude', account: 'acct-1', accountKnown: true, tokenPresent: true }),
    { kind: 'inject' }
  );
});

test('a pinned agent whose token is missing FAILS the spawn — never silently the wrong account', () => {
  const r = decideClaudeAccountEnv({ provider: 'claude', account: 'acct-1', accountKnown: true, tokenPresent: false, label: 'Work' });
  assert.equal(r.kind, 'fail');
  assert.match(r.error, /Work/);
  assert.match(r.error, /no stored token/i);
});

test('a pinned agent whose account no longer exists FAILS the spawn', () => {
  const r = decideClaudeAccountEnv({ provider: 'claude', account: 'acct-gone', accountKnown: false, tokenPresent: false });
  assert.equal(r.kind, 'fail');
  assert.match(r.error, /acct-gone/);
});

// ─── remove-blocked-when-pinned ──────────────────────────────────────────────

test('removing an account is blocked by every live agent pinned to it, Michael included', () => {
  const agents = [
    { id: 'jim-1', name: 'Jim', account: 'acct-1' },
    { id: 'pam-1', name: 'Pam', account: 'acct-2' },
    { id: 'old-1', name: 'Old', account: 'acct-1', archived: true },
    { id: 'dw-1', name: 'Dwight' }
  ];
  assert.deepEqual(pinnedAgentsForAccount('acct-1', agents, 'acct-1'), ['Jim', 'Michael']);
  assert.deepEqual(pinnedAgentsForAccount('acct-2', agents, 'acct-1'), ['Pam']);
  assert.deepEqual(pinnedAgentsForAccount('acct-3', agents, undefined), []);
});

// ─── account_uuid integrity reducer ──────────────────────────────────────────

test('the first observed uuid per account is the reference; a later different uuid is a mismatch', () => {
  const r = reduceAccountIntegrity([
    { agentId: 'a1', account: 'acct-1', accountUuid: 'uuid-A' },
    { agentId: 'a2', account: 'acct-1', accountUuid: 'uuid-A' },
    { agentId: 'a3', account: 'acct-1', accountUuid: 'uuid-B' },
    { agentId: 'a4', account: 'acct-2', accountUuid: 'uuid-B' }
  ]);
  assert.equal(r.reference['acct-1'], 'uuid-A');
  assert.equal(r.reference['acct-2'], 'uuid-B');
  assert.deepEqual(r.mismatches, { a3: { expected: 'uuid-A', observed: 'uuid-B' } });
});

test('agents on the /login account are tracked under their own bucket and agents without telemetry are ignored', () => {
  const r = reduceAccountIntegrity([
    { agentId: 'god', account: undefined, accountUuid: 'uuid-L' },
    { agentId: 'new', account: 'acct-1', accountUuid: undefined },
    { agentId: 'w1', account: undefined, accountUuid: 'uuid-X' }
  ]);
  assert.equal(r.reference[LOGIN_ACCOUNT_KEY], 'uuid-L');
  assert.equal(r.reference['acct-1'], undefined);
  assert.deepEqual(Object.keys(r.mismatches), ['w1']);
});

// ─── telemetry allowlist: account_uuid in, email out ─────────────────────────

const { TelemetryCollector } = loadTs('src/main/telemetry.ts');

function otlpMetrics(agentId, sessionId, extraAttrs) {
  const kv = (key, stringValue) => ({ key, value: { stringValue } });
  return {
    resourceMetrics: [{
      resource: { attributes: [kv('agent.id', agentId), kv('agent.name', 'Jim')] },
      scopeMetrics: [{
        metrics: [{
          name: 'claude_code.token.usage',
          sum: { dataPoints: [{
            asInt: '120',
            attributes: [kv('session.id', sessionId), kv('type', 'input'), kv('model', 'claude-sonnet-4-6'), ...extraAttrs.map(([k, v]) => kv(k, v))]
          }] }
        }]
      }]
    }]
  };
}

test('the collector surfaces user.account_uuid on the usage sample but never the email', () => {
  const events = [];
  const c = new TelemetryCollector({ emit: (_ch, payload) => events.push(payload) });
  c.ingestMetrics(otlpMetrics('jim-1', 'sess-1', [
    ['user.account_uuid', '11111111-2222-3333-4444-555555555555'],
    ['user.email', 'someone@example.com'],
    ['organization.id', 'org-1']
  ]));
  const sample = c.getAgentUsage('jim-1');
  assert.equal(sample.accountUuid, '11111111-2222-3333-4444-555555555555');
  assert.equal(sample.input, 120);
  const serialized = JSON.stringify({ sample, events, snapshot: c.snapshot() });
  assert.doesNotMatch(serialized, /someone@example\.com/);
  assert.doesNotMatch(serialized, /org-1/);
});

test('user.account_id is accepted as the fallback when account_uuid is absent', () => {
  const c = new TelemetryCollector({});
  c.ingestMetrics(otlpMetrics('pam-1', 'sess-2', [['user.account_id', 'acct-id-9']]));
  assert.equal(c.getAgentUsage('pam-1').accountUuid, 'acct-id-9');
});
