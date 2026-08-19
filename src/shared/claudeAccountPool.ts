/**
 * Claude account pool — policy + failover, the pure half (PR 2).
 *
 * PR 1 gave every agent an optional pin to one of N subscription accounts. This
 * module adds what happens when an account stops working: a per-account health
 * state machine, the spawn-time assignment policy (`pinned` / `auto`), the
 * rolling 5h usage window that "least loaded" is judged on, the failover
 * planner (who moves where, rate-limited), and the cooldown parser that turns a
 * 429 payload into a reset instant. Everything here is dependency-free and
 * deterministic (`now` is always passed in) so `node --test` can drive it; the
 * main process (`src/main/accountPool.ts`) owns persistence + wiring, the
 * renderer only renders snapshots of `PoolState`.
 *
 * State machine (per account):
 *   active ──429──▶ cooling(untilTs, reason) ──untilTs passes──▶ active
 *   active ──401──▶ dead(reason)             ──manual mark-active──▶ active
 *   cooling ──401──▶ dead · dead ──429──▶ dead (a dead token never "cools")
 *   any ──manual rotate──▶ cooling · any ──manual mark-active──▶ active
 * Cooling expiry is LAZY (`effectiveHealth` reads a lapsed cooldown as active)
 * so a missed timer can never strand an account; `expireCooling` is the eager
 * sweep the main tick runs to emit the transition + resume paused agents.
 *
 * Honest limits (documented in docs/claude-accounts.md): failover is a PAUSE —
 * the in-flight turn is lost and the session is resumed on the next account;
 * it cannot create quota (all accounts cooling → wait for the earliest reset);
 * the 429 payload shape is calibrated on the first real hit.
 */
import type { ClaudeAccount } from './claudeAccounts';

export type AccountHealth =
  | { state: 'active' }
  | { state: 'cooling'; untilTs: number; reason: string }
  | { state: 'dead'; reason: string };

export interface AccountLastError {
  ts: number;
  statusCode?: number;
  /** Sanitized + truncated by the main process before it lands here. */
  message: string;
}

export interface AccountPoolRecord {
  health: AccountHealth;
  /** The api error that last changed this account's state. */
  lastError?: AccountLastError;
  /** Lifetime count of agents failed over AWAY from this account. */
  switchCount: number;
  /** First `user.account_uuid` observed for this account ("first session wins").
   *  Cleared on a 401 and on a token replace so the next good session re-seeds it. */
  referenceUuid?: string;
  /** Rolling usage: `[minuteBucketTs, tokens]`, pruned to the last USAGE_WINDOW_MS. */
  usage: Array<[number, number]>;
}

export interface PoolState {
  v: 1;
  /** accountId → record. Accounts never seen are implicitly active/empty. */
  accounts: Record<string, AccountPoolRecord>;
}

/** What the renderer sees (pushed on `claudeAccount:state`). */
export interface PoolSnapshot {
  ts: number;
  accounts: Record<string, {
    health: AccountHealth;
    lastError?: AccountLastError;
    switchCount: number;
    referenceUuid?: string;
    /** Tokens used on this account in the last 5h (least-loaded basis). */
    windowTokens: number;
  }>;
  /** Soonest pending cooldown end, or null when nothing is cooling. */
  earliestReset: number | null;
  /** How many pool accounts are usable right now. */
  healthyCount: number;
  /** Agents currently stuck on an unhealthy account with nowhere to go. */
  stranded: string[];
}

/** Default cooldown when a 429 payload carries no parseable reset time. */
export const DEFAULT_COOLDOWN_MS = 5 * 3_600_000;
/** The usage window "least loaded" is judged on (mirrors the 5h plan window). */
export const USAGE_WINDOW_MS = 5 * 3_600_000;
/** Minimum gap between two automatic switches of the SAME agent. */
export const SWITCH_COOLDOWN_MS = 10 * 60_000;
const USAGE_BUCKET_MS = 60_000;

export function emptyPoolState(): PoolState {
  return { v: 1, accounts: {} };
}

function blank(): AccountPoolRecord {
  return { health: { state: 'active' }, switchCount: 0, usage: [] };
}

/** Coerce whatever was persisted into a well-formed state (drops junk entries). */
export function normalizePoolState(raw: unknown): PoolState {
  const out = emptyPoolState();
  const accounts = (raw as { accounts?: unknown } | null)?.accounts;
  if (!accounts || typeof accounts !== 'object') return out;
  for (const [id, rec] of Object.entries(accounts as Record<string, Partial<AccountPoolRecord>>)) {
    if (!id || !rec || typeof rec !== 'object') continue;
    const h = rec.health as AccountHealth | undefined;
    const health: AccountHealth =
      h?.state === 'cooling' && typeof h.untilTs === 'number' ? { state: 'cooling', untilTs: h.untilTs, reason: String(h.reason ?? '') }
      : h?.state === 'dead' ? { state: 'dead', reason: String(h.reason ?? '') }
      : { state: 'active' };
    out.accounts[id] = {
      health,
      lastError: rec.lastError && typeof rec.lastError === 'object' ? rec.lastError : undefined,
      switchCount: typeof rec.switchCount === 'number' ? rec.switchCount : 0,
      referenceUuid: typeof rec.referenceUuid === 'string' ? rec.referenceUuid : undefined,
      usage: Array.isArray(rec.usage)
        ? rec.usage.filter((e): e is [number, number] => Array.isArray(e) && typeof e[0] === 'number' && typeof e[1] === 'number')
        : []
    };
  }
  return out;
}

function withRecord(state: PoolState, id: string, fn: (r: AccountPoolRecord) => AccountPoolRecord): PoolState {
  const cur = state.accounts[id] ?? blank();
  return { ...state, accounts: { ...state.accounts, [id]: fn(cur) } };
}

/** The health as of `now` — a lapsed cooldown reads as active (lazy expiry). */
export function effectiveHealth(rec: AccountPoolRecord | undefined, now: number): AccountHealth {
  const h = rec?.health ?? { state: 'active' as const };
  if (h.state === 'cooling' && h.untilTs <= now) return { state: 'active' };
  return h;
}

export function isHealthy(rec: AccountPoolRecord | undefined, now: number): boolean {
  return effectiveHealth(rec, now).state === 'active';
}

/** 429 (or manual rotate): cool the account. A later reset never shortens an
 *  earlier one (repeated 429s during a cooldown keep the furthest instant);
 *  a dead account stays dead — its token is the problem, not its quota. */
export function markCooling(
  state: PoolState,
  id: string,
  i: { untilTs: number; reason: string; error?: AccountLastError },
  now: number
): PoolState {
  return withRecord(state, id, (r) => {
    if (r.health.state === 'dead') return i.error ? { ...r, lastError: i.error } : r;
    const prevUntil = r.health.state === 'cooling' && r.health.untilTs > now ? r.health.untilTs : 0;
    const untilTs = Math.max(prevUntil, i.untilTs);
    return { ...r, health: { state: 'cooling', untilTs, reason: i.reason }, lastError: i.error ?? r.lastError };
  });
}

/** 401: the token is rejected. Dead until the operator replaces the token /
 *  marks it active. Also clears the reference uuid — a session that ran on a bad
 *  token may have seeded a wrong one (PR 1's first-session-wins nuance). */
export function markDead(state: PoolState, id: string, reason: string, now: number, error?: AccountLastError): PoolState {
  return withRecord(state, id, (r) => ({
    ...r,
    health: { state: 'dead', reason },
    lastError: error ?? r.lastError ?? { ts: now, message: reason },
    referenceUuid: undefined
  }));
}

/** Manual "mark active again" (and the auto-resume at reset). */
export function markActive(state: PoolState, id: string): PoolState {
  return withRecord(state, id, (r) => ({ ...r, health: { state: 'active' } }));
}

/** Eager sweep: every cooldown that has lapsed flips to active. Returns the ids
 *  that resumed so the caller can wake their paused agents. */
export function expireCooling(state: PoolState, now: number): { state: PoolState; resumed: string[] } {
  const resumed: string[] = [];
  let next = state;
  for (const [id, r] of Object.entries(state.accounts)) {
    if (r.health.state === 'cooling' && r.health.untilTs <= now) {
      resumed.push(id);
      next = markActive(next, id);
    }
  }
  return { state: next, resumed };
}

/** Soonest pending cooldown end (> now), or null. Dead accounts have no reset. */
export function earliestReset(state: PoolState, now: number): number | null {
  let min: number | null = null;
  for (const r of Object.values(state.accounts)) {
    if (r.health.state === 'cooling' && r.health.untilTs > now && (min === null || r.health.untilTs < min)) min = r.health.untilTs;
  }
  return min;
}

/** First session wins: set the reference only when none is recorded. */
export function seedReference(state: PoolState, id: string, uuid: string): PoolState {
  if (!uuid) return state;
  return withRecord(state, id, (r) => (r.referenceUuid ? r : { ...r, referenceUuid: uuid }));
}

export function clearReference(state: PoolState, id: string): PoolState {
  return withRecord(state, id, (r) => ({ ...r, referenceUuid: undefined }));
}

/** Add `tokens` to the account's rolling window (minute buckets, pruned to 5h). */
export function recordUsage(state: PoolState, id: string, tokens: number, now: number): PoolState {
  if (!(tokens > 0)) return state;
  const bucket = Math.floor(now / USAGE_BUCKET_MS) * USAGE_BUCKET_MS;
  if (bucket < now - USAGE_WINDOW_MS) return state; // already outside the window
  return withRecord(state, id, (r) => {
    const usage = r.usage.filter(([ts]) => ts >= now - USAGE_WINDOW_MS);
    const last = usage[usage.length - 1];
    if (last && last[0] === bucket) usage[usage.length - 1] = [bucket, last[1] + tokens];
    else usage.push([bucket, tokens]);
    return { ...r, usage };
  });
}

/** Tokens used on this account inside the last USAGE_WINDOW_MS. */
export function tokensInWindow(rec: AccountPoolRecord | undefined, now: number): number {
  if (!rec) return 0;
  let sum = 0;
  for (const [ts, tok] of rec.usage) if (ts >= now - USAGE_WINDOW_MS) sum += tok;
  return sum;
}

export interface ChooseInput {
  accounts: ClaudeAccount[];
  state: PoolState;
  now: number;
  /** Wins ties — the agent's current account, so a balanced pool doesn't churn. */
  prefer?: string;
  /** Never pick these (the account being left). */
  exclude?: string[];
}

/** The `auto` policy: the least-loaded HEALTHY account by tokens in the 5h
 *  window. Ties → `prefer`, then creation order, then id. Null when no pool
 *  account is usable right now. */
export function chooseAccount(i: ChooseInput): string | null {
  const excluded = new Set(i.exclude ?? []);
  let best: { id: string; load: number; createdAt: number } | null = null;
  for (const a of i.accounts) {
    if (excluded.has(a.id) || !isHealthy(i.state.accounts[a.id], i.now)) continue;
    const load = tokensInWindow(i.state.accounts[a.id], i.now);
    const cand = { id: a.id, load, createdAt: a.createdAt };
    if (!best) { best = cand; continue; }
    if (load < best.load) { best = cand; continue; }
    if (load > best.load) continue;
    // tie
    if (cand.id === i.prefer) { best = cand; continue; }
    if (best.id === i.prefer) continue;
    if (cand.createdAt < best.createdAt || (cand.createdAt === best.createdAt && cand.id < best.id)) best = cand;
  }
  return best?.id ?? null;
}

export type AccountPolicy = 'auto' | undefined;

export interface SpawnResolveInput {
  /** `'auto'` = least loaded; undefined = pinned to `account` (or login when unset). */
  policy: AccountPolicy;
  /** The pin (pinned) or the last assignment (auto). */
  account: string | undefined;
  accounts: ClaudeAccount[];
  state: PoolState;
  now: number;
}

export type SpawnResolution =
  | { kind: 'login' }
  | { kind: 'account'; account: string; switchedFrom?: string }
  | { kind: 'fail'; error: string; earliestReset: number | null };

function unavailableError(accounts: ClaudeAccount[], state: PoolState, now: number, pinned?: ClaudeAccount): SpawnResolution {
  const reset = earliestReset(state, now);
  const dead = accounts.filter((a) => effectiveHealth(state.accounts[a.id], now).state === 'dead').length;
  const head = pinned
    ? `Claude account "${pinned.label}" is ${describeHealth(effectiveHealth(state.accounts[pinned.id], now), now)} and no other account is healthy`
    : `No Claude account is healthy right now (${accounts.length} in the pool${dead ? `, ${dead} dead` : ''})`;
  const tail = reset
    ? ` — the earliest cooldown ends in ${fmtCountdown(reset, now)} (${new Date(reset).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`
    : ' — paste a new token for the dead account(s) in Settings → AI Engines (saving one marks the account active again).';
  return { kind: 'fail', error: head + tail, earliestReset: reset };
}

export function describeHealth(h: AccountHealth, now: number): string {
  if (h.state === 'cooling') return `cooling (resets in ${fmtCountdown(h.untilTs, now)})`;
  if (h.state === 'dead') return `dead (${h.reason})`;
  return 'active';
}

/** Spawn-time assignment. Runs BEFORE the PR 1 token decision, so injection
 *  stays fail-closed: this only decides WHICH account id to materialize.
 *  - no pin, no policy → login account (PR 1 behaviour, untouched)
 *  - auto → least-loaded healthy account; empty pool → login; none healthy → fail
 *  - pinned → that account while healthy (PR 1 behaviour); while cooling/dead →
 *    the next healthy account (`switchedFrom` set so the caller records the
 *    switch and re-pins); none healthy → fail. An UNKNOWN pin passes through so
 *    `decideClaudeAccountEnv` keeps producing its "no longer exists" error. */
export function resolveSpawnAccount(i: SpawnResolveInput): SpawnResolution {
  if (i.policy === 'auto') {
    if (i.accounts.length === 0) return { kind: 'login' };
    const id = chooseAccount({ accounts: i.accounts, state: i.state, now: i.now, prefer: i.account });
    return id ? { kind: 'account', account: id } : unavailableError(i.accounts, i.state, i.now);
  }
  if (!i.account) return { kind: 'login' };
  const pinned = i.accounts.find((a) => a.id === i.account);
  if (!pinned) return { kind: 'account', account: i.account };
  if (isHealthy(i.state.accounts[pinned.id], i.now)) return { kind: 'account', account: pinned.id };
  const next = chooseAccount({ accounts: i.accounts, state: i.state, now: i.now, exclude: [pinned.id] });
  if (next) return { kind: 'account', account: next, switchedFrom: pinned.id };
  return unavailableError(i.accounts, i.state, i.now, pinned);
}

export interface FailoverPlanInput {
  /** Live Claude agents: id + the account they are CURRENTLY on (undefined = login). */
  agents: Array<{ agentId: string; account?: string }>;
  accounts: ClaudeAccount[];
  state: PoolState;
  now: number;
  /** agentId → ts of its last automatic switch (the 10-min rate limit). */
  lastSwitchAt: Record<string, number>;
  /** Manual rotate: bypass the per-agent rate limit. */
  force?: boolean;
  /** Restrict planning to these agents (manual per-agent rotate). */
  only?: string[];
}

export interface FailoverPlan {
  switches: Array<{ agentId: string; from: string; to: string }>;
  /** Agents on an unhealthy account with no healthy target — paused until a reset. */
  stranded: string[];
  /** Agents that would move but switched less than SWITCH_COOLDOWN_MS ago. */
  rateLimited: string[];
  earliestReset: number | null;
}

/** Who moves where. Agents on the login account or on a healthy account are
 *  never touched. ponytail: every mover lands on the single least-loaded
 *  account this instant; spread them round-robin if a real pool shows it matters. */
export function planFailover(i: FailoverPlanInput): FailoverPlan {
  const known = new Set(i.accounts.map((a) => a.id));
  const only = i.only ? new Set(i.only) : null;
  const plan: FailoverPlan = { switches: [], stranded: [], rateLimited: [], earliestReset: earliestReset(i.state, i.now) };
  for (const agent of i.agents) {
    const from = agent.account;
    if (!from || !known.has(from)) continue;
    if (only && !only.has(agent.agentId)) continue;
    if (isHealthy(i.state.accounts[from], i.now)) continue;
    if (!i.force && i.now - (i.lastSwitchAt[agent.agentId] ?? 0) < SWITCH_COOLDOWN_MS) {
      plan.rateLimited.push(agent.agentId);
      continue;
    }
    const to = chooseAccount({ accounts: i.accounts, state: i.state, now: i.now, exclude: [from] });
    if (!to) { plan.stranded.push(agent.agentId); continue; }
    plan.switches.push({ agentId: agent.agentId, from, to });
  }
  return plan;
}

// ─── cooldown math ───────────────────────────────────────────────────────────

const MAX_PARSED_AHEAD_MS = 8 * 24 * 3_600_000; // a weekly limit at most
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Pull a reset instant (epoch ms) out of a 429 payload, or null when the text
 *  carries none the parser recognises (the caller then applies
 *  DEFAULT_COOLDOWN_MS). Understood shapes — calibrated against the first real
 *  hit, see docs: `retry-after: N` / `"retry_after": N` seconds · `resets in 2h
 *  30m|45 minutes|3 hours` · `resets (at) 3pm|9:30am|22:15` (local clock, next
 *  occurrence) · `resets Tuesday 10am` · an ISO-8601 timestamp · a 10/13-digit
 *  epoch after `reset(s)_at`. Anything in the past or >8 days out is rejected. */
export function parseResetFromError(text: string, now: number): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const accept = (ts: number | null): number | null =>
    ts !== null && Number.isFinite(ts) && ts > now && ts - now <= MAX_PARSED_AHEAD_MS ? ts : null;

  const retry = /retry[-_ ]?after["']?\s*[:=]?\s*"?(\d{1,7})\b/.exec(t);
  if (retry) return accept(now + Number(retry[1]) * 1000);

  const iso = /(\d{4}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:z|[+-]\d{2}:?\d{2})?)/.exec(t);
  if (iso) return accept(Date.parse(iso[1].toUpperCase()));

  const epoch = /reset(?:s)?(?:_|\s)?at["']?\s*[:=]?\s*"?(\d{10,13})\b/.exec(t);
  if (epoch) {
    const n = Number(epoch[1]);
    return accept(epoch[1].length === 13 ? n : n * 1000);
  }

  const rel = /\b(?:in|after)\s+(?:(\d+)\s*(?:h|hr|hrs|hour|hours)\b)?\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes)\b)?\s*(?:(\d+)\s*(?:s|sec|secs|second|seconds)\b)?/.exec(t);
  if (rel && (rel[1] || rel[2] || rel[3])) {
    const ms = (Number(rel[1] ?? 0) * 3600 + Number(rel[2] ?? 0) * 60 + Number(rel[3] ?? 0)) * 1000;
    if (ms > 0) return accept(now + ms);
  }

  const clock = /\b(?:reset(?:s|ting)?|until|at)\b[^0-9a-z]*(?:(?:on\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s*)?(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(t);
  if (clock && (clock[3] !== undefined || clock[4] !== undefined || clock[1] !== undefined)) {
    let hour = Number(clock[2]);
    const minute = Number(clock[3] ?? 0);
    if (clock[4] === 'pm' && hour < 12) hour += 12;
    if (clock[4] === 'am' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    const d = new Date(now);
    d.setHours(hour, minute, 0, 0);
    if (clock[1]) {
      const want = DAYS.indexOf(clock[1]);
      let delta = (want - d.getDay() + 7) % 7;
      if (delta === 0 && d.getTime() <= now) delta = 7;
      d.setDate(d.getDate() + delta);
    } else if (d.getTime() <= now) {
      d.setDate(d.getDate() + 1);
    }
    return accept(d.getTime());
  }
  return null;
}

/** "2h 5m" / "40m" / "<1m" / "now" — the countdown the UI + errors show. */
export function fmtCountdown(untilTs: number, now: number): string {
  const ms = untilTs - now;
  if (ms <= 0) return 'now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return '<1m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** The renderer-facing view of the state (no usage arrays, derived fields in). */
export function snapshotPool(state: PoolState, accounts: ClaudeAccount[], now: number, stranded: string[] = []): PoolSnapshot {
  const out: PoolSnapshot = { ts: now, accounts: {}, earliestReset: earliestReset(state, now), healthyCount: 0, stranded };
  for (const a of accounts) {
    const r = state.accounts[a.id];
    const health = effectiveHealth(r, now);
    if (health.state === 'active') out.healthyCount += 1;
    out.accounts[a.id] = {
      health,
      lastError: r?.lastError,
      switchCount: r?.switchCount ?? 0,
      referenceUuid: r?.referenceUuid,
      windowTokens: tokensInWindow(r, now)
    };
  }
  return out;
}
