'use strict';

/**
 * The hire@1 / team@1 manifest formats — SCALE-02 (plan 03-04).
 *
 * WHY THIS FILE EXISTS
 * `src/shared/hire.ts` was a finished, security-reviewed single-agent format with no
 * producer and no direct test file. Two things here are load-bearing and were
 * previously asserted only by greps over the source:
 *
 *   1. `validateHireManifest`'s default-deny allowlists (`SAFE_FLAG_NAMES`, `MODEL_RE`,
 *      `FLAG_RE`, the provider set). team@1 delegates EVERY member back through that
 *      exact function; if a parallel, weaker per-member validator ever appears, the
 *      delegation tests below stop proving anything — so they assert the ERROR TEXT
 *      `validateHireManifest` itself produces, not merely `ok === false`.
 *   2. `stripAgentForExport` and `buildTeamExport` (main/hire.ts) — D-16's seven-field
 *      strip and T-03-04e's validate-before-write self-check. The strip is the only
 *      thing standing between `team:export` and a file carrying an operator's account
 *      name, home folder and worktree paths, and it had ZERO coverage before this file.
 *
 * WHY buildTeamExport IS NOT INLINE IN THE HANDLER. `src/main/index.ts` cannot be
 * loaded under this harness, so anything written inside an `ipcMain.handle` body is
 * only ever pinned by a grep that `return {}` also satisfies (03-03's recorded
 * finding). A security control asserted that way is a control nobody has run. So the
 * export path's decisions live in `main/hire.ts`, which loads, and the handler is thin.
 *
 * THE ASSERTION STYLE THAT MATTERS HERE: key ABSENCE, not `=== undefined`.
 * `validateHireManifest` returns an object literal that names every optional field, so
 * `manifest.commandFlags === undefined` is true even when the key is present. Only
 * `'commandFlags' in manifest` distinguishes "stripped" from "present but empty", and
 * only the absent form survives `JSON.stringify` into a file an operator reads.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
const { readHireManifestFile, stripAgentForExport, buildTeamExport } = loadTs('src/main/hire.ts');

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

// ─── D-16: stripAgentForExport ──────────────────────────────────────────────

/** Every field D-16 names, plus everything that SHOULD survive. */
const ROSTER_AGENT = {
  id: 'agent-7',
  name: 'Ada',
  description: 'Docs writer',
  goal: 'Keep the docs true',
  character: 'pam',
  accent: 'mint',
  provider: 'opencode',
  model: 'claude-sonnet-4-6',
  status: 'idle',
  // The seven D-16 fields.
  cwd: 'C:/Users/operator/secret-project',
  account: 'operator@example.com',
  accountPolicy: 'pinned',
  worktreePath: 'C:/Users/operator/secret-project/.worktrees/ada',
  ptyId: 'pty-31337',
  command: 'opencode --model claude-sonnet-4-6 --dangerously-skip-permissions',
  commandFlags: ['--dangerously-skip-permissions']
};

const D16_STRIPPED = ['cwd', 'account', 'accountPolicy', 'worktreePath', 'ptyId', 'command', 'commandFlags'];

test('D-16: stripAgentForExport drops all seven fields — key ABSENCE, not undefined', () => {
  const result = stripAgentForExport(ROSTER_AGENT);

  // Named individually as well as in the loop, so a failure says which field leaked.
  assert.equal('cwd' in result, false, 'cwd leaked — an export must never carry a home folder');
  assert.equal('account' in result, false, 'account leaked');
  assert.equal('accountPolicy' in result, false, 'accountPolicy leaked');
  assert.equal('worktreePath' in result, false, 'worktreePath leaked');
  assert.equal('ptyId' in result, false, 'ptyId leaked');
  assert.equal('command' in result, false, 'the raw command leaked — team@1 must stay binary-free');
  assert.equal('commandFlags' in result, false, 'commandFlags leaked');

  for (const field of D16_STRIPPED) {
    assert.equal(Object.keys(result).includes(field), false, `${field} is present in Object.keys`);
  }

  // ...and the fixture really did carry all seven, or the above proves nothing.
  for (const field of D16_STRIPPED) {
    assert.equal(field in ROSTER_AGENT, true, `the fixture must carry ${field}`);
  }

  // Nothing else sneaks through either: the picker is an ALLOWLIST, so an unrelated
  // roster field (id, status) must not appear just because it was on the input.
  assert.deepEqual(
    Object.keys(result).sort(),
    ['accent', 'character', 'description', 'goal', 'model', 'name', 'provider', 'spec'],
    'stripAgentForExport must be an allowlist of fields to INCLUDE, never a denylist of fields to drop'
  );
});

test('D-16: a stripped agent round-trips through the unmodified validateHireManifest', () => {
  // Through JSON, because that is what actually gets written and re-read — a field that
  // survives in memory but not in the file (or vice versa) is the bug this catches.
  const onDisk = JSON.parse(JSON.stringify(stripAgentForExport(ROSTER_AGENT)));
  const v = validateHireManifest(onDisk);
  assert.equal(v.ok, true, `an exported member must be re-importable, got: ${v.errors.join('; ')}`);
  assert.equal(v.manifest.name, 'Ada');
  assert.equal(v.manifest.provider, 'opencode');
  assert.equal(v.manifest.model, 'claude-sonnet-4-6');
});

test('D-16: an agent on a widened-allowlist engine round-trips — the old 3-provider allowlist rejected 8 of 11', () => {
  // This is the gap that made export produce files the app itself refused: before this
  // plan only claude/antigravity/codex validated, so a realistic mixed floor exported
  // members that came back `ok:false` on `provider`.
  const floor = ['grok', 'kimi', 'qwen', 'opencode', 'crush', 'pi', 'copilot', 'claude', 'codex', 'antigravity'];
  for (const provider of floor) {
    const stripped = JSON.parse(JSON.stringify(stripAgentForExport({ ...ROSTER_AGENT, provider })));
    const v = validateHireManifest(stripped);
    assert.equal(v.ok, true, `a ${provider} agent must re-import, got: ${v.errors.join('; ')}`);
  }
});

test('D-16: a "custom" agent is NOT exportable — it fails the validate-before-write check', () => {
  const stripped = JSON.parse(JSON.stringify(stripAgentForExport({ ...ROSTER_AGENT, provider: 'custom' })));
  assert.equal(validateHireManifest(stripped).ok, false,
    'a custom-binary agent must be dropped and counted by the exporter, never shipped');
});

test('stripAgentForExport survives a junk roster entry rather than throwing', () => {
  // RosterSnapshot.agents is `unknown[]` — main never trusts its shape.
  for (const junk of [{}, { name: 42 }, { name: '  ' }, { provider: 99, model: {} }]) {
    const out = stripAgentForExport(junk);
    assert.equal(out.spec, HIRE_SPEC_V1);
    for (const field of D16_STRIPPED) assert.equal(field in out, false);
  }
});

// ─── T-03-04e: buildTeamExport's validate-before-write self-check ───────────

test('buildTeamExport: every member it returns has already been proven re-importable', () => {
  const floor = [
    { ...ROSTER_AGENT, name: 'Ada', provider: 'grok' },
    { ...ROSTER_AGENT, name: 'Bo', provider: 'qwen' },
    { ...ROSTER_AGENT, name: 'Cy', provider: 'opencode' }
  ];
  const out = buildTeamExport(floor);
  assert.equal(out.skipped, 0);
  assert.equal(out.members.length, 3);
  for (const m of out.members) {
    assert.equal(validateHireManifest(m).ok, true, `member ${m.name} is not re-importable`);
    for (const field of D16_STRIPPED) assert.equal(field in m, false, `${field} leaked into the export`);
  }
});

test('buildTeamExport: an unimportable member is DROPPED AND COUNTED, never silently shipped', () => {
  const floor = [
    { ...ROSTER_AGENT, name: 'Ada' },
    // Over validateHireManifest's 200-char description cap. Nothing else in the
    // export path looks at description length, so without the self-check this
    // member would be written into a file the app itself then refuses.
    { ...ROSTER_AGENT, name: 'TooChatty', description: 'x'.repeat(400) },
    // A 'custom' agent: a real floor can hold one, and team@1 can never carry it.
    { ...ROSTER_AGENT, name: 'Bespoke', provider: 'custom' },
    // A model id with shell metacharacters — MODEL_RE's job, delegated not re-implemented.
    { ...ROSTER_AGENT, name: 'Sneaky', model: 'gpt & calc.exe' },
    { ...ROSTER_AGENT, name: 'Bo', provider: 'kimi' }
  ];
  const out = buildTeamExport(floor);

  assert.equal(out.skipped, 3, 'three members could not be re-imported and must be counted');
  assert.deepEqual(out.members.map((m) => m.name), ['Ada', 'Bo'], 'surviving members keep roster order');
  for (const m of out.members) assert.equal(validateHireManifest(m).ok, true);
});

test('buildTeamExport: an empty roster is an empty team, not a throw and not a refusal', () => {
  assert.deepEqual(buildTeamExport([]), { members: [], skipped: 0 });
});

test('buildTeamExport: a roster where EVERY member is skipped still yields a valid empty team', () => {
  const out = buildTeamExport([
    { ...ROSTER_AGENT, provider: 'custom' },
    { ...ROSTER_AGENT, provider: 'custom' }
  ]);
  assert.deepEqual(out.members, []);
  assert.equal(out.skipped, 2, 'members:0 with skipped:2 must be distinguishable from a genuinely empty floor');
});

test('buildTeamExport: a junk roster entry is skipped, not thrown on (agents is unknown[])', () => {
  const out = buildTeamExport([null, 'nope', 42, {}, { name: '' }, { ...ROSTER_AGENT, name: 'Ada' }]);
  assert.deepEqual(out.members.map((m) => m.name), ['Ada']);
  assert.equal(out.skipped, 5);
});

test('the exported bytes round-trip back in through the real reader — the whole loop, end to end', () => {
  // This is the promise team@1 exists to keep: export is the only safe producer
  // BECAUSE what it writes can be re-imported. Anything less than writing the real
  // file and reading it back with the real reader is a claim, not a proof.
  const floor = ['grok', 'kimi', 'qwen', 'opencode', 'crush', 'pi', 'copilot', 'claude', 'codex', 'antigravity']
    .map((provider, i) => ({ ...ROSTER_AGENT, name: `Agent${i}`, provider }));
  floor.push({ ...ROSTER_AGENT, name: 'Bespoke', provider: 'custom' });

  const { members, skipped } = buildTeamExport(floor);
  assert.equal(skipped, 1);
  assert.equal(members.length, 10);

  const p = path.join(tmp, 'exported.json');
  fs.writeFileSync(p, JSON.stringify({ spec: HIRE_TEAM_SPEC_V1, members }, null, 2), 'utf8');

  const bytes = fs.readFileSync(p, 'utf8');
  for (const leak of ['secret-project', 'operator@example.com', 'pty-31337', '.worktrees', 'dangerously-skip-permissions']) {
    assert.equal(bytes.includes(leak), false, `the written file leaks ${leak}`);
  }

  const res = readHireManifestFile(p);
  assert.equal(res.ok, true, `the app cannot re-import its own export: ${res.error}`);
  assert.equal(res.team.members.length, 10, 'every exported member re-validated');
  assert.deepEqual(res.team.members.map((m) => m.provider),
    ['grok', 'kimi', 'qwen', 'opencode', 'crush', 'pi', 'copilot', 'claude', 'codex', 'antigravity']);
});

// ─── the two byte caps ──────────────────────────────────────────────────────

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hire-'));

/** Write a JSON document padded with filler to `bytes`, and return its path. */
function writeSized(name, doc, bytes) {
  const p = path.join(tmp, name);
  const base = JSON.stringify(doc);
  // Pad inside a filler key so the document still PARSES — the point is file SIZE.
  const pad = Math.max(0, bytes - Buffer.byteLength(base, 'utf8') - 12);
  const padded = JSON.stringify({ ...doc, _filler: 'x'.repeat(pad) });
  fs.writeFileSync(p, padded, 'utf8');
  return p;
}

test('the single-manifest 64KB ceiling is NOT raised to 256KB as a side effect of the team branch', () => {
  const big = writeSized('big-hire.json', hire(), 100 * 1024);
  assert.ok(fs.statSync(big).size > HIRE_MAX_BYTES, 'the fixture must actually exceed the single-manifest cap');
  assert.ok(fs.statSync(big).size < TEAM_MAX_BYTES, 'and must sit UNDER the team cap, or this proves nothing');

  const res = readHireManifestFile(big);
  assert.deepEqual(res, { ok: false, error: 'manifest too large' });
});

test('a team@1 file of the SAME size is accepted', () => {
  const doc = { spec: HIRE_TEAM_SPEC_V1, members: [hire()] };
  const big = writeSized('big-team.json', doc, 100 * 1024);
  assert.ok(fs.statSync(big).size > HIRE_MAX_BYTES);
  assert.ok(fs.statSync(big).size < TEAM_MAX_BYTES);

  const res = readHireManifestFile(big);
  assert.equal(res.ok, true, `expected the team file to be accepted, got: ${res.error}`);
  assert.equal(res.team.members.length, 1);
  assert.equal(res.team.members[0].name, 'Nora');
});

test('a team@1 file over the 256KB team cap is rejected before JSON.parse ever runs', () => {
  const doc = { spec: HIRE_TEAM_SPEC_V1, members: [hire()] };
  const huge = writeSized('huge-team.json', doc, TEAM_MAX_BYTES + 4096);
  assert.deepEqual(readHireManifestFile(huge), { ok: false, error: 'manifest too large' });
});

test('a normal hire@1 file still reads exactly as it did before the team branch', () => {
  const p = path.join(tmp, 'plain.json');
  fs.writeFileSync(p, JSON.stringify(hire({ provider: 'grok', goal: 'ship it' })), 'utf8');
  const res = readHireManifestFile(p);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.manifest.name, 'Nora');
  assert.equal(res.manifest.provider, 'grok');
  assert.equal(res.team, undefined);
});

test('a team@1 file whose members are partly invalid still reads, carrying only the valid ones', () => {
  const p = path.join(tmp, 'mixed.json');
  fs.writeFileSync(p, JSON.stringify({
    spec: HIRE_TEAM_SPEC_V1,
    members: [hire({ name: 'Ada' }), hire({ name: 'Bad', provider: 'custom' })]
  }), 'utf8');
  const res = readHireManifestFile(p);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.team.members.length, 1);
  assert.equal(res.team.members[0].name, 'Ada');
});

test('a structurally broken team@1 file is an error, not a silently empty team', () => {
  const p = path.join(tmp, 'overcap.json');
  fs.writeFileSync(p, JSON.stringify({
    spec: HIRE_TEAM_SPEC_V1,
    members: Array.from({ length: TEAM_MAX_MEMBERS + 1 }, () => hire())
  }), 'utf8');
  const res = readHireManifestFile(p);
  assert.equal(res.ok, false);
  assert.ok(res.error.includes('"members" exceeds'), res.error);
});

test('a file that is not JSON at all is still the existing read error', () => {
  const p = path.join(tmp, 'junk.json');
  fs.writeFileSync(p, 'not json {{{', 'utf8');
  const res = readHireManifestFile(p);
  assert.equal(res.ok, false);
  assert.ok(res.error.startsWith('could not read manifest:'), res.error);
});
