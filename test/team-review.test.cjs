'use strict';

/**
 * `TeamReviewModal.tsx` — the team@1 import review sheet (UI-SPEC S3a, plan 03-06).
 *
 * WHY THIS FILE EXISTS AND NOT test/renderer-components.test.cjs.
 * That file is owned by plan 03-08 in this same wave. Two plans editing one file in
 * one wave is a merge collision, so this plan's renderer coverage lands here —
 * following the precedent test/add-agent-export.test.cjs set in wave 4. It is also
 * the only file that CAN see this component: renderer-components.test.cjs's
 * `Module._load` shim resolves a fixed list (PixelBadge / BlockedBanner / AgentCard /
 * store / agentProvider) and never TeamReviewModal.
 *
 * WHY THERE IS NO SHIM HERE AT ALL.
 * `TeamReviewModal.tsx` imports every cross-directory dependency RELATIVELY
 * (`./Modal`, `../store/config`, `../hooks/bulkSpawn`, `../store/store`), because
 * `resolveTs` resolves `@shared/` and NOT `@/`. That is a deliberate constraint of
 * the component, not an accident of this test — a single value-level `@/...` import
 * in it would make this whole file unrunnable, and the sheet's security obligation
 * below would go back to being a grep.
 *
 * THE ASSERTION THAT MATTERS. `03-UI-SPEC.md:263` makes this sheet the ONLY
 * confirmation a bulk hire gets. A member's `description` becomes `hive.role` and is
 * written into `<agentDir>/identity.md` on EVERY spawn, and its `goal` becomes the
 * hired agent's standing directive — and `src/shared/hire.ts` caps `goal` at 4,000
 * characters of colleague-or-gallery-supplied text. So "the goal is on screen" is
 * checked by rendering the component and looking for the string, never by grepping
 * the source for a variable name: a sheet that stores `goal` in a prop and never
 * paints it would pass the grep and fail the operator.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const loadTs = require('./load-ts.cjs');

const { spawnBatch, batchAgentIds } = loadTs('src/renderer/src/hooks/bulkSpawn.ts');
const {
  TeamReviewModal,
  markDuplicates,
  memberFailureText,
  memberHirePlan
} = loadTs('src/renderer/src/components/TeamReviewModal.tsx');

const member = (name, extra = {}) => ({
  spec: 'hello-markx/hire@1',
  name,
  provider: 'claude',
  ...extra
});

/** Enough HarnessConfig to build a spawn command. */
const CONFIG = {
  defaultCommand: 'claude',
  defaultProvider: 'claude',
  harnessHome: 'C:/home',
  registeredRepos: [],
  projects: [],
  claudeAccounts: []
};

function render(props) {
  return renderToStaticMarkup(
    React.createElement(TeamReviewModal, {
      members: [member('Jim')],
      config: CONFIG,
      cwd: 'C:/repo',
      onClose: () => {},
      ...props
    })
  );
}

/** The `<button>` element whose text is the hire control, so a `disabled` anywhere
 *  else on the sheet can never be mistaken for the gate being on. */
function hireButton(html) {
  const at = html.indexOf('hire ');
  assert.notEqual(at, -1, 'the hire control did not render at all');
  const open = html.lastIndexOf('<button', at);
  assert.notEqual(open, -1, 'the hire label is not inside a <button>');
  return html.slice(open, html.indexOf('</button>', at) + 9);
}

// ─── the duplicate-name rule (pure, no React) ───────────────────────────────

test('second same-named member defaults unchecked', () => {
  const rows = markDuplicates([member('Jim'), member('Jim'), member('Pam')]);
  assert.equal(rows.length, 3);
  // The FIRST occurrence stays checked — the operator asked for this file.
  assert.equal(rows[0].checked, true, 'the first Jim must stay checked');
  assert.equal(rows[0].note, null);
  // Only the later duplicate is flagged. Agent identity is derived from the
  // display name, so a double-import silently doubling the floor is the failure
  // this default exists to stop.
  assert.equal(rows[1].checked, false, 'the second Jim must default UNCHECKED');
  assert.ok(rows[1].note, 'the second Jim must carry a visible reason, not just be off');
  assert.match(rows[1].note, /name taken/);
  assert.equal(rows[2].checked, true, 'Pam is not a duplicate');
  assert.equal(rows[2].note, null);
});

test('distinct names all default checked', () => {
  const rows = markDuplicates([member('Jim'), member('Pam'), member('Dwight')]);
  assert.deepEqual(rows.map((r) => r.checked), [true, true, true]);
  assert.deepEqual(rows.map((r) => r.note), [null, null, null]);
});

test('duplicate detection follows the ID SLUG, not the raw name', () => {
  // The rule that matters: flag exactly the members that would land on the same
  // agent id, since that is what makes two rows genuinely confusable on the floor.
  // 'Jim B', 'jim-b' and 'JIM B' all slug to `jim-b`, so the 2nd and 3rd are dups.
  const same = markDuplicates([member('Jim B'), member('jim-b'), member('JIM B')]);
  assert.deepEqual(same.map((r) => r.checked), [true, false, false]);

  // But trailing punctuation is NOT normalised away — 'JIM B!' slugs to `jim-b-`,
  // a genuinely different id, so flagging it would be a false warning. Asserted
  // rather than assumed, because markDuplicates and batchAgentIds MUST agree on
  // this: a rule that warned here while the id generator disagreed would train the
  // operator to ignore the note.
  const punct = markDuplicates([member('Jim B'), member('JIM B!')]);
  assert.deepEqual(punct.map((r) => r.checked), [true, true]);
  const ids = batchAgentIds(['Jim B', 'JIM B!'], 1700000000000);
  assert.equal(new Set(ids).size, 2, `the two rows markDuplicates left unflagged collided: ${ids}`);
});

test('markDuplicates over an empty team returns an empty list rather than throwing', () => {
  assert.deepEqual(markDuplicates([]), []);
});

// ─── the per-member failure copy (unreachable through a render) ──────────────

test('a failed member gets its OWN copy, naming the member and keeping the rest', () => {
  // UI-SPEC Copywriting:250, verbatim. Per member and non-fatal by contract —
  // never one sheet-level error that hides WHICH member failed.
  assert.equal(
    memberFailureText('Jim', 'spawn failed'),
    'Jim did not start: spawn failed. The rest of the team is hired — you can add Jim on their own.'
  );
});

// ─── what a member actually turns into (unreachable through a render) ────────

test('role comes from DESCRIPTION and goal never touches it', () => {
  // `role` is interpolated into <agentDir>/identity.md on every spawn; `goal`
  // becomes the standing directive. Swapping them would move 4,000 characters of
  // untrusted text into the agent's identity, and both fields are strings, so
  // nothing but this assertion would notice.
  const { request, agent } = memberHirePlan(
    member('Jim', { description: 'THE-ROLE', goal: 'THE-GOAL' }),
    'jim-x', 'C:/repo', CONFIG
  );
  assert.equal(request.hive.role, 'THE-ROLE');
  assert.notEqual(request.hive.role, 'THE-GOAL');
  assert.equal(agent.goal, 'THE-GOAL');
  assert.equal(agent.description, 'THE-ROLE');
});

test('D-19: the ONE operator-picked root is threaded into every member', () => {
  const { request, agent } = memberHirePlan(member('Jim'), 'jim-x', 'C:/repo/floor', CONFIG);
  // Both places: main's own spawn guard rejects a missing cwd, and the hive
  // descriptor is what the agent's workspace is provisioned against.
  assert.equal(request.cwd, 'C:/repo/floor');
  assert.equal(request.hive.cwd, 'C:/repo/floor');
  assert.equal(agent.cwd, 'C:/repo/floor');
  assert.equal(agent.project, 'floor');
  assert.equal(request.isolate, false, 'a team import must never isolate without being asked');
});

test('the spawn binary comes from the LOCAL preset, never from the file', () => {
  // The manifest contributes a model and (on the single-hire path) validated
  // flags. It can never name the executable.
  const { request } = memberHirePlan(
    member('Jim', { provider: 'claude', model: 'sonnet' }),
    'jim-x', 'C:/repo', CONFIG
  );
  assert.equal(request.command, 'claude');
  assert.ok(request.args.includes('sonnet'), `model did not reach the args: ${request.args}`);
});

test('an unknown character or accent from an untrusted file falls back, never lands raw', () => {
  // The validator only length-caps and lowercases `character` — it does NOT
  // constrain it to the cast, so this is the only guard on the team path.
  const { agent } = memberHirePlan(
    member('Jim', { character: 'not-a-character', accent: 'octarine' }),
    'jim-x', 'C:/repo', CONFIG
  );
  assert.equal(agent.character, 'jim');
  assert.equal(agent.accent, 'sky');
  // …and a legitimate one still round-trips, or the fallback would be hiding a
  // dropped field rather than guarding a bad one.
  const kept = memberHirePlan(member('P', { character: 'pam', accent: 'mint' }), 'p', 'C:/r', CONFIG);
  assert.equal(kept.agent.character, 'pam');
  assert.equal(kept.agent.accent, 'mint');
});

// ─── failure isolation through the SHARED batch ──────────────────────────────

test('one member failing leaves the other two hired — through the shared spawnBatch', async () => {
  const members = [member('Jim'), member('Pam'), member('Dwight')];
  const res = await spawnBatch(members, async (m) => {
    if (m.name === 'Pam') throw new Error('spawn failed');
    return { id: m.name, name: m.name };
  });
  assert.deepEqual(res.ok.map((a) => a.name), ['Jim', 'Dwight']);
  assert.equal(res.failures.length, 1);
  assert.match(res.failures[0], /spawn failed/);
});

// ─── the sheet actually renders, and shows what it is about to hand over ─────

test('the sheet renders — and this file is not asserting against an empty string', () => {
  const html = render({ members: [member('Jim'), member('Pam')] });
  assert.ok(html.length > 500, `the render produced ${html.length} chars; it did not render`);
  assert.ok(html.includes('Import team'), 'the dialog title is missing');
  assert.ok(html.includes('2 agents in this file'), 'the S3a header line is missing');
});

test('every untrusted field that reaches the agent is READABLE before the hire', () => {
  // The security case. `goal` rides into the hired agent as its standing directive
  // and may legally carry 4,000 characters of attacker-authored instruction; a
  // confirmation sheet that hides the field it is confirming is not one.
  const html = render({
    members: [member('Jim', { description: 'a fresh harness', goal: 'ZZ-GOAL-SENTINEL-ZZ' })]
  });
  assert.ok(
    html.includes('ZZ-GOAL-SENTINEL-ZZ'),
    'the member goal never reached the markup — the sheet is confirming a field it does not show'
  );
  // Readable, not hover-only: the sentinel must be a TEXT NODE, not tucked into a
  // title=" attribute where the operator has to go looking for it.
  assert.match(
    html,
    />[^<]*ZZ-GOAL-SENTINEL-ZZ/,
    'the goal is in the markup but not as visible text (a title attribute is not a review surface)'
  );
});

test('a member with no goal says so, so a dropped field is distinguishable from an empty one', () => {
  const html = render({ members: [member('Jim', { description: 'a fresh harness' })] });
  assert.ok(html.includes('no goal'), 'a member carrying no goal must say so, not leave a gap');
});

// ─── the folder gate (D-19: ONE root for the whole team) ─────────────────────

test('with no cwd chosen the hire control is DISABLED and says why', () => {
  const html = render({ cwd: undefined });
  // `cwd` decides the blast radius of a team import — which directory up to
  // TEAM_MAX_MEMBERS agents from an untrusted file get read/write access to.
  assert.match(hireButton(html), /disabled/, 'the hire control is live with no folder chosen');
  assert.ok(html.includes('Pick a folder first'), 'the sheet never says why the hire is off');
});

test('with a cwd chosen the hire control is LIVE and the folder is shown', () => {
  // The negative control for the case above. Without this pair, `/disabled/`
  // would be satisfiable by a sheet whose hire button is ALWAYS off.
  const html = render({ cwd: 'C:/repo/munder-difflin' });
  assert.doesNotMatch(hireButton(html), /disabled/, 'the hire control stayed off with a folder chosen');
  assert.ok(
    html.includes('C:/repo/munder-difflin'),
    'the operator cannot see WHICH folder the team is about to be hired into'
  );
});

test('the hire control names the CHECKED count, not the file count', () => {
  // Two Jims: the second defaults unchecked, so the button offers 2 of 3.
  const html = render({ members: [member('Jim'), member('Jim'), member('Pam')] });
  assert.ok(html.includes('3 agents in this file'), 'the header must count the FILE');
  assert.match(hireButton(html), />\s*hire 2\s*</, 'the button must count the CHECKED rows');
  assert.ok(html.includes('name taken'), 'the duplicate row must show its reason on the sheet');
});
