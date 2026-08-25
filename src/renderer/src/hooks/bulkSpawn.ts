// `Agent` is referenced in TYPE POSITION ONLY, and this must stay true.
// `test/load-ts.cjs`'s resolveTs handles `@shared/` and NOT `@/`, so a
// value-level `@/...` import here would make this module unloadable and
// `test/bulk-spawn.test.cjs` — the only coverage the bulk-spawn shape has —
// would stop running. `import type` is erased at transpile, so it costs nothing.
import type { Agent } from '@/store/store';

export interface BatchResult {
  /** Successful spawns, in the INPUT array's order — never completion order. */
  ok: Agent[];
  /** One message per item whose `spawnOne` THREW. Also in input order. */
  failures: string[];
}

/**
 * Spawn a batch of agents concurrently, in order, without letting one failure
 * take the rest down. The one bulk-spawn shape in this app (D-18).
 *
 * This is `useRestoreTeam.ts`'s loop, lifted out unchanged. That loop is the only
 * concurrent-spawn shape in the codebase whose defects are already paid for, and
 * all three are recorded in its own comments:
 *
 *   1. SERIAL COST. Restoring six agents took ~6x one agent, because each spawn's
 *      git probe + spawn awaited the previous one. `Promise.all`, not a for-await.
 *   2. COMPLETION-ORDER ROSTER CORRUPTION. Calling `addAgent` from inside each
 *      spawn let completion timing decide roster order — and that order is
 *      PERSISTED, so a slow provider silently overwrote the sequence the user had
 *      dragged the cards into. Hence: collect first, hand back in input order, and
 *      let the caller add sequentially.
 *   3. ONE REJECTION ABORTING THE BATCH. An unhandled rejection made the whole
 *      restore a silent no-op after the first bad agent. Hence the per-item catch.
 *
 * Re-implementing this shape for team import is exactly how those three come back,
 * which is why it is shared rather than copied. `spawnOne` is parameterised so the
 * two callers — restoring persisted `Agent`s and hiring `HireManifest` members —
 * share the concurrency/ordering/isolation without sharing their (very different)
 * spawn-argument construction.
 *
 * A `null` return means "handled, nothing to add" (e.g. an agent with no saved
 * command, which reports its own message); only a THROW lands in `failures`.
 */
export function spawnBatch<T>(
  items: readonly T[],
  spawnOne: (item: T, index: number) => Promise<Agent | null>
): Promise<BatchResult> {
  return Promise.all(
    items.map(async (item, index): Promise<{ agent: Agent | null; failure: string | null }> => {
      // Per-item guard: one item's failure (or a rejected IPC call) must NEVER
      // abort the others.
      try {
        return { agent: await spawnOne(item, index), failure: null };
      } catch (e) {
        return { agent: null, failure: e instanceof Error ? e.message : String(e) };
      }
    })
  ).then((settled) => {
    // Re-assembled from `settled`, which Promise.all returns in INPUT order
    // regardless of who finished first. Both lists inherit that order.
    const ok: Agent[] = [];
    const failures: string[] = [];
    for (const r of settled) {
      if (r.agent) ok.push(r.agent);
      if (r.failure !== null) failures.push(r.failure);
    }
    return { ok, failures };
  });
}

/**
 * Mint one agent id per name, all from ONE clock reading, all distinct.
 *
 * THE HAZARD THIS CLOSES (UI-SPEC S3a's STOP-AND-REPORT clause). Agent identity in
 * this app is derived from the display name: the rule was
 * `` `${slug}-${Date.now().toString(36)}` ``, so two members with the same name
 * hired in the same millisecond produced the SAME id. A bulk hire is precisely a
 * same-millisecond batch, so this was reachable, not theoretical. `now` is a
 * PARAMETER rather than a `Date.now()` call in here for two reasons: a batch must
 * mint every id from one reading, and a test can then pin the clock without mocking
 * a global.
 *
 * The counter keys on the SLUG, never the raw name. UI-SPEC S3a flags this half
 * explicitly — the old rule was "not collision-safe under a bulk spawn even for
 * *distinct* names, if two slugs happen to match" — and a name-keyed counter would
 * leave `['Jim B', 'jim-b']` colliding.
 *
 * BOTH id-minting callers route through here: the team-hire batch
 * (`TeamReviewModal.tsx`) and the single-hire submit path (`AddAgentModal.tsx`).
 * That is the point of it being exported rather than a widened private helper —
 * while the rule lived module-private inside the component, no test could reach it,
 * so the mandated collision test was unwritable and the hazard stayed unproven.
 *
 * `useRestoreTeam.ts` is deliberately OUT OF SCOPE: it generates no ids at all
 * (`grep -n uniqueId` over it is 0) and reuses each restored agent's PERSISTED
 * identity by design, so applying this there would change the identity an agent's
 * hive workspace, registry entry and memory.md reattach by.
 *
 * ponytail: within-batch only. Two SEPARATE hires landing in the same millisecond
 * can still collide, exactly as they always could — consult the live roster here if
 * that ever shows up in practice.
 */
export function batchAgentIds(names: readonly string[], now: number): string[] {
  const stamp = now.toString(36);
  const seen = new Map<string, number>();
  return names.map((name) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const nth = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, nth);
    // The FIRST of a slug keeps the exact shape the single-hire path always
    // minted, so moving the rule out of the component changed no behaviour.
    return nth === 1 ? `${slug}-${stamp}` : `${slug}-${stamp}-${nth}`;
  });
}
