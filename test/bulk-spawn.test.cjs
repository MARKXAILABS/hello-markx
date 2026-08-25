'use strict';

/**
 * `src/renderer/src/hooks/bulkSpawn.ts` — the shared bulk-spawn shape (D-18) and
 * the one production agent-id generator (plan 03-06, SCALE-02).
 *
 * WHY THIS FILE EXISTS.
 * `useRestoreTeam.ts`'s spawn loop carries three defects that were already found and
 * fixed IN ITS COMMENTS — serial cost (~6x for six agents), completion-order
 * overwriting the persisted roster order, and one rejected IPC call silently aborting
 * every subsequent agent. Before this file, `grep -rEn
 * "restoreTeam|useRestoreTeam|spawnBatch|batchAgentIds" test/` returned ZERO hits:
 * none of those three fixes had a single test. Re-implementing that loop for team
 * import is exactly how all three come back, so the shape is extracted into
 * `spawnBatch` — and this file is what makes "behaviour-preserving" a measurement
 * rather than a claim.
 *
 * WHY THE ID CASE DRIVES AN EXPORTED FUNCTION.
 * `uniqueId` used to be module-private inside `AddAgentModal.tsx`, so the collision
 * rule UI-SPEC S3a flags (STOP-AND-REPORT) could not be reached by any test at all.
 * It now lives here as `batchAgentIds`, and BOTH id-minting callers — the single-hire
 * submit path and the team-hire batch — route through it. The case below therefore
 * exercises the code the app actually runs, not a copy of the rule.
 *
 * `bulkSpawn.ts` is loadable by plain `loadTs` with NO `Module._load` shim, because
 * its only `@/` reference is an `import type` (erased at transpile). That is a
 * deliberate constraint of the module, not an accident: `resolveTs` does not resolve
 * `@/`, so a value-level `@/...` import would make this whole file unrunnable.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const loadTs = require('./load-ts.cjs');

const { spawnBatch, batchAgentIds } = loadTs('src/renderer/src/hooks/bulkSpawn.ts');

/** A minimal roster-shaped result. `spawnBatch` only ever checks it for null. */
const agent = (name) => ({ id: name, name });

test('every spawnOne starts before any resolves — the batch is concurrent, not serial', async () => {
  const started = [];
  let resolveAll;
  const gate = new Promise((r) => { resolveAll = r; });

  const items = ['a', 'b', 'c', 'd'];
  const run = spawnBatch(items, async (item) => {
    started.push(item);
    // Nothing may resolve until every call has been entered. Serially this
    // deadlocks: call 2 would never start, so `started.length` would stay 1.
    await gate;
    return agent(item);
  });

  // Yield once so the synchronous prologue of every mapped async fn has run.
  await Promise.resolve();
  assert.deepEqual(
    started,
    items,
    `only ${started.length} of ${items.length} spawns had started before the first resolve — the batch is serial`
  );

  resolveAll();
  const res = await run;
  assert.equal(res.ok.length, 4);
});

test('successes come back in input order, never completion order', async () => {
  const items = ['first', 'second', 'third', 'fourth'];
  // INVERTED completion: the LAST item finishes first. Anything that appends on
  // completion (the defect useRestoreTeam.ts records: a slow provider silently
  // overwriting the sequence the user dragged the cards into) returns the reverse.
  const delayFor = { first: 40, second: 30, third: 20, fourth: 0 };
  const completionOrder = [];

  const res = await spawnBatch(items, async (item) => {
    await new Promise((r) => setTimeout(r, delayFor[item]));
    completionOrder.push(item);
    return agent(item);
  });

  // The premise of the case: if these were equal the fixture proves nothing.
  assert.deepEqual(completionOrder, ['fourth', 'third', 'second', 'first'], 'the fixture did not invert');
  assert.deepEqual(res.ok.map((a) => a.name), items);
  assert.deepEqual(res.failures, []);
});

test('failure isolation — one spawn throwing leaves every other member spawned', async () => {
  const items = ['ok-1', 'boom', 'ok-2'];
  const res = await spawnBatch(items, async (item) => {
    if (item === 'boom') throw new Error('IPC rejected');
    return agent(item);
  });

  // The original defect: an unhandled rejection made the entire restore a silent
  // no-op after the first bad agent.
  assert.deepEqual(res.ok.map((a) => a.name), ['ok-1', 'ok-2']);
  assert.equal(res.failures.length, 1);
  assert.match(res.failures[0], /IPC rejected/);
});

test('a spawnOne returning null is a skip, not a failure', async () => {
  const res = await spawnBatch(['a', 'skip', 'b'], async (item) =>
    (item === 'skip' ? null : agent(item)));
  assert.deepEqual(res.ok.map((a) => a.name), ['a', 'b']);
  assert.deepEqual(res.failures, [], 'a null return is how useRestoreTeam reports "no saved command" AFTER pushing its own message — it must not double-count as a throw');
});

test('spawnBatch over an empty batch resolves rather than hanging', async () => {
  assert.deepEqual(await spawnBatch([], async () => agent('never')), { ok: [], failures: [] });
});

test('batchAgentIds mints DISTINCT ids for same-named members under one fixed clock', () => {
  // Identical milliseconds are the normal case for a bulk hire, not an edge case:
  // every id in a batch is minted from the same `now`. `Date.now()` is a parameter
  // precisely so this is assertable without mocking a global.
  const ids = batchAgentIds(['Jim', 'Jim', 'Pam'], 1700000000000);
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3, `same-name collision: ${ids.join(', ')}`);
  assert.ok(ids[0].startsWith('jim-'), ids[0]);
  assert.ok(ids[1].startsWith('jim-'), ids[1]);
  assert.ok(ids[2].startsWith('pam-'), ids[2]);
});

test('batchAgentIds keys its counter on the SLUG, so two distinct names that slug alike still differ', () => {
  // UI-SPEC S3a's explicitly flagged half: "not collision-safe under a bulk spawn
  // even for *distinct* names, if two slugs happen to match". A name-keyed counter
  // leaves this open; only a slug-keyed one closes it.
  const ids = batchAgentIds(['Jim B', 'jim-b', 'JIM  B!'], 1700000000000);
  assert.equal(new Set(ids).size, 3, `distinct names sharing one slug collided: ${ids.join(', ')}`);
  for (const id of ids) assert.ok(id.startsWith('jim-b-'), id);
});

test('batchAgentIds slugs exactly as the single-hire path always did', () => {
  // The shape AddAgentModal.tsx minted before this move: slug + base-36 stamp.
  // The FIRST id in any batch is byte-identical to the old `uniqueId` output, so
  // moving the rule out of the component changed no existing behaviour.
  assert.deepEqual(batchAgentIds(['Jim Halpert'], 1700000000000), ['jim-halpert-' + (1700000000000).toString(36)]);
  assert.deepEqual(batchAgentIds([], 1700000000000), []);
});
