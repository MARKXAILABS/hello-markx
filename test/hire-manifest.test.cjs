'use strict';

/**
 * The hire@1 / team@1 manifest formats — SCALE-02 (plan 03-04).
 *
 * WHY THIS FILE EXISTS
 * `src/shared/hire.ts` was a finished, security-reviewed single-agent format with no
 * producer and no direct test file. `validateHireManifest`'s default-deny allowlists
 * (`SAFE_FLAG_NAMES`, `MODEL_RE`, `FLAG_RE`, the provider set) were asserted only by
 * greps over the source. team@1 delegates EVERY member back through that exact
 * function; if a parallel, weaker per-member validator ever appears, the delegation
 * tests below stop proving anything — so they assert the ERROR TEXT
 * `validateHireManifest` itself produces, not merely `ok === false`.
 *
 * THE ASSERTION STYLE THAT MATTERS HERE: key ABSENCE, not `=== undefined`.
 * `validateHireManifest` returns an object literal that names every optional field, so
 * `manifest.commandFlags === undefined` is true even when the key is present. Only
 * `'commandFlags' in manifest` distinguishes "stripped" from "present but empty", and
 * only the absent form survives `JSON.stringify` into a file an operator reads.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const loadTs = require('./load-ts.cjs');

const {
  HIRE_SPEC_V1,
  HIRE_TEAM_SPEC_V1,
  HIRE_MAX_BYTES,
  TEAM_MAX_BYTES,
  TEAM_MAX_MEMBERS,
  validateHireManifest,
  validateTeamManifest
} = loadTs('src/shared/hire.ts');

const { AGENT_PROVIDER_PRESETS } = loadTs('src/shared/agentProvider.ts');

/** A minimal manifest that validates today, used as the base for every fixture. */
function hire(extra = {}) {
  return { spec: HIRE_SPEC_V1, name: 'Nora', ...extra };
}

// ─── the widened provider allowlist ─────────────────────────────────────────

test('every AgentProvider except "custom" is an accepted hire provider', () => {
  const ids = AGENT_PROVIDER_PRESETS.map((p) => p.id);
  assert.ok(ids.length >= 10, `expected the real preset list, got ${ids.length} entries`);
  assert.ok(ids.includes('custom'), 'the fixture list must contain "custom", or the negative below is vacuous');

  for (const id of ids.filter((i) => i !== 'custom')) {
    const v = validateHireManifest(hire({ provider: id }));
    assert.equal(v.ok, true, `provider "${id}" should validate, got: ${v.errors.join('; ')}`);
    assert.equal(v.manifest.provider, id);
  }
});

test('provider "custom" is still rejected — a manifest may never name an arbitrary local binary', () => {
  const v = validateHireManifest(hire({ provider: 'custom' }));
  assert.equal(v.ok, false);
  assert.ok(
    v.errors.some((e) => e.includes('"provider" must be one of')),
    `expected the provider allowlist error, got: ${v.errors.join('; ')}`
  );
  assert.ok(
    !v.errors.join(' ').includes('custom,'),
    'the error message must not advertise "custom" as an allowed value'
  );
});

test('provider "agy" still normalizes to "antigravity"', () => {
  const v = validateHireManifest(hire({ provider: 'agy' }));
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.equal(v.manifest.provider, 'antigravity');
});

test('a bogus provider is still rejected', () => {
  const v = validateHireManifest(hire({ provider: 'definitely-not-an-engine' }));
  assert.equal(v.ok, false);
});

// ─── team@1: structure ──────────────────────────────────────────────────────

test('the team spec tag is exactly hello-markx/team@1 and the caps are the stated constants', () => {
  assert.equal(HIRE_TEAM_SPEC_V1, 'hello-markx/team@1');
  assert.equal(TEAM_MAX_MEMBERS, 16);
  assert.equal(TEAM_MAX_BYTES, 256 * 1024);
  assert.notEqual(TEAM_MAX_BYTES, HIRE_MAX_BYTES,
    'the team cap must be its own stated constant, not a silent reuse of the single-manifest cap');
});

test('a team@1 document with any other spec tag is rejected as an unsupported spec', () => {
  for (const spec of [HIRE_SPEC_V1, 'hello-markx/team@2', '', undefined, 42]) {
    const v = validateTeamManifest({ spec, members: [] });
    assert.equal(v.ok, false, `spec ${JSON.stringify(spec)} should be rejected`);
    assert.ok(
      v.errors.some((e) => e.includes('unsupported spec')),
      `expected an "unsupported spec" error for ${JSON.stringify(spec)}, got: ${v.errors.join('; ')}`
    );
  }
});

test('a non-object, an array and null are all rejected', () => {
  for (const raw of [null, [], 'team', 7]) {
    assert.equal(validateTeamManifest(raw).ok, false, `${JSON.stringify(raw)} should be rejected`);
  }
});

test('an EMPTY team is a valid document with zero members, not a validator error', () => {
  const v = validateTeamManifest({ spec: HIRE_TEAM_SPEC_V1, members: [] });
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.deepEqual(v.team.members, []);
  assert.deepEqual(v.members, []);
});

test('a missing or non-array members field is rejected', () => {
  for (const members of [undefined, null, 'nope', {}]) {
    const v = validateTeamManifest({ spec: HIRE_TEAM_SPEC_V1, members });
    assert.equal(v.ok, false, `members=${JSON.stringify(members)} should be rejected`);
  }
});

test('more than TEAM_MAX_MEMBERS members is an explicit rejection, never a silent byte-cap pass', () => {
  const under = { spec: HIRE_TEAM_SPEC_V1, members: Array.from({ length: TEAM_MAX_MEMBERS }, () => hire()) };
  assert.equal(validateTeamManifest(under).ok, true, 'exactly TEAM_MAX_MEMBERS must be allowed');

  const over = { spec: HIRE_TEAM_SPEC_V1, members: Array.from({ length: TEAM_MAX_MEMBERS + 1 }, () => hire()) };
  const v = validateTeamManifest(over);
  assert.equal(v.ok, false);
  assert.ok(
    v.errors.some((e) => e.includes('"members" exceeds ' + TEAM_MAX_MEMBERS)),
    `expected an explicit "members" exceeds ${TEAM_MAX_MEMBERS} error, got: ${v.errors.join('; ')}`
  );
  // The cap is checked BEFORE any member is mapped — an over-cap document must not
  // hand back a partially-validated member list a caller could mistake for a team.
  assert.equal(v.team, undefined);
  // ...and the over-cap document is genuinely under the byte cap, so nothing else
  // would have caught it.
  assert.ok(Buffer.byteLength(JSON.stringify(over), 'utf8') < TEAM_MAX_BYTES);
});

// ─── team@1: per-member delegation ──────────────────────────────────────────

test('one result PER member: a bad member fails alone and does not touch the good one', () => {
  const good = hire({ name: 'Ada', provider: 'qwen' });
  const bad = hire({ name: 'Bad', model: 'gpt & rm -rf /' });   // MODEL_RE rejects the metachars
  const v = validateTeamManifest({ spec: HIRE_TEAM_SPEC_V1, members: [good, bad] });

  assert.equal(v.ok, true, 'the DOCUMENT is structurally valid; a bad member is a member-level result');
  assert.equal(v.members.length, 2, 'one result per member, in input order');

  assert.equal(v.members[0].ok, true, v.members[0].errors.join('; '));
  assert.equal(v.members[0].index, 0);
  assert.equal(v.members[0].manifest.name, 'Ada');
  assert.equal(v.members[0].manifest.provider, 'qwen');
  assert.deepEqual(v.members[0].errors, []);

  assert.equal(v.members[1].ok, false);
  assert.equal(v.members[1].index, 1);
  assert.equal(v.members[1].manifest, undefined);

  // The failing member's error is the one validateHireManifest itself produces —
  // byte-identical, which is what proves nothing re-worded or re-implemented it.
  assert.deepEqual(v.members[1].errors, validateHireManifest(bad).errors);

  // team.members carries ONLY the members that validated.
  assert.equal(v.team.members.length, 1);
  assert.equal(v.team.members[0].name, 'Ada');
});

test('a member is validated by the UNMODIFIED validateHireManifest — the safe-flag allowlist still bites', () => {
  const member = hire({ commandFlags: ['--dangerously-skip-permissions'] });
  const v = validateTeamManifest({ spec: HIRE_TEAM_SPEC_V1, members: [member] });

  assert.equal(v.members[0].ok, false, 'an unsafe flag must reject the member, not merely be stripped from it');
  assert.deepEqual(v.members[0].errors, validateHireManifest(member).errors);
  assert.ok(
    v.members[0].errors.some((e) => e.includes('safe-flag list')),
    `expected the shared-hire safe-flag error, got: ${v.members[0].errors.join('; ')}`
  );
  assert.deepEqual(v.team.members, [], 'a rejected member never reaches team.members');
});

test('a member with LEGAL commandFlags validates, and comes back with the key ABSENT', () => {
  // `--model sonnet` IS in SAFE_FLAG_NAMES, so validateHireManifest accepts it — which
  // is exactly the case that proves the team path strips rather than merely rejects.
  const member = hire({ commandFlags: ['--model', 'sonnet'] });
  assert.equal(validateHireManifest(member).ok, true, 'the fixture must be legal on a SINGLE manifest');
  assert.deepEqual(validateHireManifest(member).manifest.commandFlags, ['--model', 'sonnet'],
    'the single-manifest path must still carry the flags — only the TEAM path strips them');

  const v = validateTeamManifest({ spec: HIRE_TEAM_SPEC_V1, members: [member] });
  assert.equal(v.members[0].ok, true, v.members[0].errors.join('; '));

  for (const m of [v.members[0].manifest, v.team.members[0]]) {
    assert.equal('commandFlags' in m, false,
      'the key must be DELETED, not left present-and-undefined: no team-import surface shows a '
      + 'per-member command preview, so a flag the operator never saw must not ride into a spawn');
  }
});

test('D-19: skills and mcpServers are not part of team@1 v1 — they are stripped, and the consent gate cannot be bypassed', () => {
  // `github-token` is a `secret`-tier catalog entry: on the single-manifest path it
  // sets consentRequired, which the import UI surfaces for an explicit human decision.
  // validateTeamManifest has no consent channel, so carrying the field through would
  // enable a secret-tier server with nobody ever asked.
  const member = hire({ skills: ['md-audit'], mcpServers: ['github-token'] });
  const single = validateHireManifest(member);
  assert.equal(single.ok, true, single.errors.join('; '));
  assert.deepEqual(single.consentRequired, ['github-token'], 'the fixture must trip the consent gate on a single manifest');

  const v = validateTeamManifest({ spec: HIRE_TEAM_SPEC_V1, members: [member] });
  assert.equal(v.members[0].ok, true, v.members[0].errors.join('; '));
  for (const m of [v.members[0].manifest, v.team.members[0]]) {
    assert.equal('skills' in m, false, 'skills is not part of team@1 v1 (D-19)');
    assert.equal('mcpServers' in m, false, 'mcpServers is not part of team@1 v1 (D-19)');
  }
});

test('the surviving fields of a validated team member are intact', () => {
  const member = hire({
    name: 'Ada', description: 'Docs writer', goal: 'Keep the docs true',
    character: 'Pam', accent: 'Mint', provider: 'opencode', model: 'claude-sonnet-4-6'
  });
  const v = validateTeamManifest({ spec: HIRE_TEAM_SPEC_V1, members: [member] });
  const m = v.team.members[0];
  assert.equal(m.spec, HIRE_SPEC_V1);
  assert.equal(m.name, 'Ada');
  assert.equal(m.description, 'Docs writer');
  assert.equal(m.goal, 'Keep the docs true');
  assert.equal(m.character, 'pam');   // lower-cased by validateHireManifest, unchanged
  assert.equal(m.accent, 'mint');
  assert.equal(m.provider, 'opencode');
  assert.equal(m.model, 'claude-sonnet-4-6');
});

