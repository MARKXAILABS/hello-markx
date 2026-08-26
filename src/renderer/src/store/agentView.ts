/**
 * The agent's five stat values — cost, uptime, context, account, block state —
 * derived in ONE place (SCALE-05, D-33).
 *
 * WHY THIS MODULE EXISTS, in one measured fact. FLOOR-13 unified two things at
 * once: the AUTO chip, THROUGH a shared module (`autoMode.ts`), and cost, by
 * copying an expression into three files. Only the copied half drifted — the
 * context-pressure threshold shipped as 85/65 in `FullscreenTerminal.tsx`, 88/75
 * in `CommandCenterPanel.tsx` and 87.5/75 (a `progress >= 7` step over a 0..8
 * integer) in `AgentCard.tsx`, so the same agent could be "about to compact" on
 * one surface and comfortable on another. This module owns the pair, and all
 * three read it.
 *
 * Deliberately pure and React-free, importing only from `@shared`, exactly like
 * `autoMode.ts` — so every rule below is testable under plain `node --test`
 * without a DOM. React stays in the `.tsx` files that consume it, through
 * `useSyncExternalStore(subscribe, get, get)`.
 *
 * The declared-gap discipline is the point of the discriminated returns. Every
 * one of the five fields has a branch that says "not known" in words, because a
 * plausible-looking zero is the faked capability D-35 forbids: `$0.00` reads as
 * "cheap", `0s` reads as "just started", `0%` reads as "empty context", and
 * `healthy` reads as "safe to leave alone".
 */
import { LOGIN_ACCOUNT_LABEL } from '@shared/claudeAccounts';
import type { CostTracking } from '@shared/agentProvider';

// ── the LOCKED context-pressure pair (UI-SPEC S2c) ──────────────────────────
//
// 85/65, and it is the only one of the three shipped pairs with a written reason
// in source: `FullscreenTerminal.tsx`'s own comment says "an agent at 85% is
// about to compact, and that matters more than its accent". A real mechanism
// (the compaction boundary) outranks two thresholds nobody documented.

/** At or above this percentage the agent is about to compact — coral. */
export const CONTEXT_PRESSURE_HIGH = 85;
/** At or above this percentage the window is filling — lemon. */
export const CONTEXT_PRESSURE_WARN = 65;

// ── cost ────────────────────────────────────────────────────────────────────

/**
 * Which gap a cost reading has. Three different facts that a single
 * `no cost meter` would misdescribe, and the words differ because the remedies do.
 *
 * - `no-meter`      — this ENGINE cannot report spend at all (`costTracking: 'none'`,
 *                     7 of 11 presets). Nothing will ever make a number appear.
 * - `unattributed`  — the engine reports, but not per-agent: 03-02's
 *                     `costUnattributed: !u && !own` (`src/main/index.ts`) is true for
 *                     any agent with no live sample whose transcript root is shared, so
 *                     a figure would be some other session's money. Common, and it hits
 *                     CLAUDE agents — telling one of those it has "no cost meter" is a
 *                     false capability claim about an engine that has one.
 * - `unresolved`    — no directory row for this agent yet (the poll has not landed, or
 *                     the agent is not in the hive registry at all). We have not read a
 *                     number, so we must not print one.
 */
export type CostGapKind = 'no-meter' | 'unattributed' | 'unresolved';

export type CostView =
  | { kind: 'measured'; usd: number; lifetime: boolean }
  | { kind: 'unmeasured'; reasonKind: CostGapKind; reason: string };

/** The per-agent cost inputs `deriveCost` reads, as `hive:agentDirectory` joins them. */
export interface CostInputs {
  usd?: number;
  /** 03-02: this total is ALL-TIME cumulative off a transcript, not spend since spawn. */
  costLifetime?: boolean;
  /** 03-02: `usd: 0` here is a DECLARED GAP, not a measurement. */
  costUnattributed?: boolean;
}

/**
 * The cost cell's value.
 *
 * Branch ORDER is load-bearing and is not the order the fields were added:
 *
 *   1. no meter — an engine that cannot report is the strongest statement available,
 *      and it is true regardless of what any directory row says.
 *   2. unattributed — the engine reports, but not for THIS agent.
 *   3. unresolved — we simply have not read a row yet.
 *   4. measured — and only here may a `$` be rendered. `usd: 0` IS legitimate on this
 *      branch: an engine that reports and has spent nothing.
 *
 * Reversing 1 and 2 is the round-9 defect: `costUnattributed` is true for most agents
 * most of the time, so an unattributed-first order would print the engine-level
 * `no cost meter` for a Claude agent that has a perfectly good meter.
 *
 * `engineLabel`/`subject` reproduce `store/config.ts`'s existing `capabilityGaps`
 * spend sentence rather than inventing a second wording for the same fact. The copy is
 * deliberate — this module is `@shared`-only by design so it loads without a DOM, and
 * `config.ts` is not `@shared` — and `test/renderer-runstate.test.cjs` pins the two
 * strings byte-identical, so a reword of either one reddens rather than drifting.
 */
export function deriveCost(
  view: CostInputs | undefined,
  costTracking: CostTracking,
  engineLabel: string,
  subject: string
): CostView {
  if (costTracking === 'none') {
    return {
      kind: 'unmeasured',
      reasonKind: 'no-meter',
      // The cell's two words for this branch are `no cost meter`
      // (AgentDetailPanel.tsx); this is the long form behind its title.
      reason: `${engineLabel} reports no cost — ${subject}'s spend is invisible to every budget and to the breaker.`
    };
  }
  if (view?.costUnattributed) {
    return {
      kind: 'unmeasured',
      reasonKind: 'unattributed',
      reason: `${engineLabel} reports spend, but it cannot be attributed to ${subject} — its transcripts share a directory with other sessions.`
    };
  }
  if (typeof view?.usd !== 'number') {
    return {
      kind: 'unmeasured',
      reasonKind: 'unresolved',
      reason: `No spend has been read for ${subject} yet — the floor directory has no row for it.`
    };
  }
  return { kind: 'measured', usd: view.usd, lifetime: view.costLifetime === true };
}

// ── uptime ──────────────────────────────────────────────────────────────────

/**
 * How long this agent's CURRENT pty has been up.
 *
 * `not recorded` rather than `0s` for a missing stamp: 03-02 added `spawnedAt` to the
 * registry, so every entry written before that has none, and `0s` on one of those reads
 * as "it just started" — the opposite of the truth for an agent that has been up for days.
 *
 * A stamp in the future (a registry written on another host, a DST step) is clamped to
 * `0s` rather than rendered as a negative age.
 */
export function deriveDuration(spawnedAt: number | null | undefined, now = Date.now()): string {
  if (typeof spawnedAt !== 'number') return 'not recorded';
  const s = Math.max(0, Math.floor((now - spawnedAt) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ── context ─────────────────────────────────────────────────────────────────

export type ContextView =
  | { kind: 'measured'; tokens: number; limit: number; pct: number }
  | { kind: 'unmeasured' };

/**
 * The context cell's raw token/limit pair, and its own declared gap.
 *
 * Separate from `deriveContextColor` on purpose: the colour step takes a percentage its
 * callers already hold (AgentCard's comes out of a 0..8 gauge, not a token count), while
 * the CELL needs the numbers themselves. One function doing both would force AgentCard to
 * supply a limit it does not have.
 *
 * A limit of 0 is a gap, not a divisor. `pct` is clamped to 0..100 because the pty
 * parser can under-report a limit, and a 140% rail is a rendering bug wearing a number.
 */
export function deriveContext(
  contextTokens: number | null | undefined,
  contextLimit: number | null | undefined
): ContextView {
  if (typeof contextTokens !== 'number' || typeof contextLimit !== 'number' || contextLimit <= 0) {
    return { kind: 'unmeasured' };
  }
  const pct = Math.max(0, Math.min(100, Math.round((contextTokens / contextLimit) * 100)));
  return { kind: 'measured', tokens: contextTokens, limit: contextLimit, pct };
}

/**
 * The ONE context-pressure colour step, at the locked 85/65 pair.
 *
 * ONE signature, and it is percentage-based: `deriveContextColor(pct, accent)`. A
 * `(tokens, limit)` signature would be unusable at the call site that needs it most —
 * `AgentCard.tsx` derives its colour from a 0..8 integer and has no measured limit in
 * that path at all (`contextLimit` there feeds the tooltip and nothing else), so a
 * tokens/limit call would return the neutral accent and silently delete the compaction
 * warning for every agent whose limit was never reported.
 */
export function deriveContextColor(pct: number, accent: string): string {
  if (pct >= CONTEXT_PRESSURE_HIGH) return 'var(--cth-coral)';
  if (pct >= CONTEXT_PRESSURE_WARN) return 'var(--cth-lemon)';
  return `var(--cth-${accent})`;
}

// ── account ─────────────────────────────────────────────────────────────────

/**
 * The account cell. An agent with no pool pin runs on the `/login` account, which is a
 * real answer with a shipped name — not an empty cell.
 */
export function deriveAccount(accountLabel: string | undefined): string {
  return accountLabel && accountLabel.trim() ? accountLabel : LOGIN_ACCOUNT_LABEL;
}

// ── block state ─────────────────────────────────────────────────────────────

export interface BreakerView {
  level: string;
  reason: string;
}

/**
 * The breaker cell. `unknown` until `control:breakerSnapshot` resolves, and `healthy` is
 * specifically the WRONG default (D-36): `onBreakerState` only fires on the next ~30s
 * beat, so a card that assumed healthy would call a STOPPED agent healthy for a full
 * beat after every window reload — failing safe in the wrong direction, on the one field
 * whose whole job is to say when an agent has been cut off.
 */
export function deriveState(breaker: BreakerView | undefined): string {
  return breaker && breaker.level ? breaker.level : 'unknown';
}

// ── the module singleton: where the three main-process reads converge ───────
//
// `autoMode.ts`'s shape exactly — a module-level mutable snapshot, a listener Set, and
// a get/publish/subscribe trio read through `useSyncExternalStore(sub, get, get)`. The
// third argument is not optional: React 18 throws "Missing getServerSnapshot" on the
// server, and `test/renderer-components.test.cjs` IS a server render, so a two-arg call
// would make every SCALE-05 assertion fail to RUN rather than fail red.
//
// Two IPCs land here that had no production caller anywhere before this module:
// `control:breakerSnapshot` (03-02 built the pull and left it caller-less by design) and
// `hive:agentDirectory` (zero renderer callers, so 03-02's `spawnedAt`, `costLifetime`
// and `costUnattributed` were typed all the way to the preload and then reached nothing).

export interface AgentViewEntry {
  usd?: number;
  costLifetime?: boolean;
  costUnattributed?: boolean;
  spawnedAt?: number;
  breaker?: BreakerView;
}

/** How often the two pulls re-run. Matches the breaker's own ~30s beat — a one-shot
 *  fetch would go stale for the life of the process, which for `state` is D-36 again. */
export const AGENT_VIEW_POLL_MS = 30_000;

let views: Record<string, AgentViewEntry> = {};
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

/** The snapshot every consumer reads — and, being the `getServerSnapshot` too, the
 *  thing a server-rendered test sees. Seed it with `mergeAgentViews` before render. */
export function getAgentViews(): Record<string, AgentViewEntry> {
  return views;
}

/**
 * Fold per-agent facts into the cache and publish.
 *
 * A per-agent MERGE, never a whole-map replace: the breaker pull and the directory poll
 * write different fields for the same agent id and would otherwise erase each other.
 * A NEW top-level object every time, because `useSyncExternalStore` compares snapshots
 * by reference — mutating in place is how a store stops re-rendering.
 *
 * This is also the seeding seam: a test calls it before `renderToStaticMarkup` and the
 * first-pass markup shows the seeded values.
 */
export function mergeAgentViews(patch: Record<string, AgentViewEntry>): void {
  const next: Record<string, AgentViewEntry> = { ...views };
  for (const [id, entry] of Object.entries(patch)) next[id] = { ...next[id], ...entry };
  views = next;
  for (const l of [...listeners]) l();
}

/** Drop the cache and stop polling. Test teardown, and the only way to un-start the
 *  first-subscriber pull. */
export function resetAgentViews(): void {
  views = {};
  listeners.clear();
  stopPolling();
}

function stopPolling(): void {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}

function pull(): void {
  const cth = typeof window !== 'undefined' ? window.cth : undefined;
  if (!cth) return;

  // The breaker's CURRENT state for every registered agent. Without this the `state`
  // cell would sit on whatever the last push happened to say — i.e. nothing, after a
  // window reload.
  void cth.getBreakerSnapshot?.().then((snap) => {
    const patch: Record<string, AgentViewEntry> = {};
    for (const [id, s] of Object.entries(snap ?? {})) {
      patch[id] = { breaker: { level: s.level, reason: s.reason } };
    }
    if (Object.keys(patch).length) mergeAgentViews(patch);
  }).catch(() => { /* hive disabled — every state stays `unknown`, which is honest */ });

  // The consolidated directory row: spawnedAt, and the cost join with its two honesty
  // flags. Nothing else in the renderer reads this IPC.
  void cth.hiveAgentDirectory?.().then((dir) => {
    const patch: Record<string, AgentViewEntry> = {};
    for (const a of dir?.agents ?? []) {
      const entry: AgentViewEntry = {};
      if (typeof a.usd === 'number') entry.usd = a.usd;
      if (typeof a.costLifetime === 'boolean') entry.costLifetime = a.costLifetime;
      if (typeof a.costUnattributed === 'boolean') entry.costUnattributed = a.costUnattributed;
      if (typeof a.spawnedAt === 'number') entry.spawnedAt = a.spawnedAt;
      patch[a.id] = entry;
    }
    if (Object.keys(patch).length) mergeAgentViews(patch);
  }).catch(() => { /* directory unavailable — cost reads `unresolved`, never $0.00 */ });
}

/**
 * Subscribe, starting the shared pull on the FIRST listener and stopping it on the last.
 *
 * Reference-counted rather than always-on: N mounted cards are one pull per beat, not N,
 * which is the same defect 03-02 had to fix in the breaker snapshot handler itself (it
 * rebuilt the whole map once per agent — 1,600 constructions on a 40-agent floor).
 */
export function subscribeAgentViews(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined && typeof window !== 'undefined' && window.cth) {
    pull();
    timer = setInterval(pull, AGENT_VIEW_POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopPolling();
  };
}
