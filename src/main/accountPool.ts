/**
 * AccountPoolManager — the main-process owner of the Claude account pool's
 * health + policy state (PR 2). Glue only: every decision is a pure function in
 * src/shared/claudeAccountPool.ts; this class feeds it the live inputs
 * (collector api_error / usage pushes, the hive registry, the clock), persists
 * the result to its own userData JSON (NOT the secret broker — no token ever
 * lives here), and tells the renderer what to do:
 *
 *   `claudeAccount:state`    PoolSnapshot — every change + each tick
 *   `claudeAccount:failover` {switches:[{agentId, from, to, …}]} — the renderer
 *                            kills + respawns those agents (`--resume`) with the
 *                            new account and nudges each once
 *   `claudeAccount:resumed`  {accounts, agentIds} — a cooldown lapsed / the
 *                            operator marked an account active; the renderer
 *                            nudges the idle agents still on it to continue
 *
 * Detection keys on `status_code` only — 429 cools (reset parsed from the text
 * when present, else 5h), 401 kills (+ clears the integrity reference uuid).
 * Deliberately free of any `electron` import so node --test can drive it with a
 * real TelemetryCollector in front (test/claude-account-failover.test.cjs).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ClaudeAccount } from '../shared/claudeAccounts';
import {
  DEFAULT_COOLDOWN_MS,
  clearReference,
  emptyPoolState,
  expireCooling,
  isHealthy,
  markActive,
  markCooling,
  markDead,
  normalizePoolState,
  parseResetFromError,
  planFailover,
  recordUsage,
  resolveSpawnAccount,
  seedReference,
  snapshotPool,
  fmtCountdown,
  type AccountPolicy,
  type FailoverPlan,
  type PoolSnapshot,
  type PoolState,
  type SpawnResolution
} from '../shared/claudeAccountPool';
import type { AgentUsageSample, ApiErrorInfo } from './telemetry';

export interface LiveAgent {
  agentId: string;
  name: string;
  /** The pool account the agent is currently running on; undefined = login. */
  account?: string;
}

export interface AccountPoolDeps {
  /** Where the JSON state lives (userData/claude-account-pool.json). A getter so
   *  the manager can be constructed before Electron's `app` paths are usable. */
  statePath: () => string;
  accounts: () => ClaudeAccount[];
  /** Whether the broker holds a token for the account — tokenless accounts are
   *  never failover targets / auto choices (they'd fail closed at spawn). */
  tokenPresent: (id: string) => boolean;
  /** Live, non-archived Claude agents with a PTY, and the account each is on. */
  liveAgents: () => LiveAgent[];
  emit: (channel: string, payload: unknown) => void;
  /** Desktop toast (breakerToast in index.ts). Optional. */
  alert?: (title: string, body: string) => void;
  /** Secret-shape redaction for the error text we keep/log (redactSecrets). */
  sanitize?: (text: string) => string;
  log?: (...args: unknown[]) => void;
  now?: () => number;
}

export interface FailoverSwitch {
  agentId: string;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
}

/** Ignore api_errors arriving this soon after a switch when they carry no
 *  session id (the old process flushing its last events). */
const POST_SWITCH_GRACE_MS = 30_000;
const MAX_ERROR_CHARS = 300;

export class AccountPoolManager {
  private state: PoolState = emptyPoolState();
  /** agentId → ts of its last automatic switch (the 10-min rate limit). */
  private readonly lastSwitchAt: Record<string, number> = {};
  /** agentId → the session it was on when we switched it; its late api_errors
   *  must not be blamed on the NEW account. */
  private readonly staleSession: Record<string, string> = {};
  /** agentId → latest session id seen on its usage samples. */
  private readonly agentSession: Record<string, string> = {};
  /** agentId → last cumulative token total (usage pushes are cumulative). */
  private readonly lastTotal: Record<string, number> = {};
  /** Accounts whose calibration payload was already logged this process. */
  private readonly calibrated = new Set<string>();
  private pausedAlerted = false;

  constructor(private readonly deps: AccountPoolDeps) {}

  private now(): number { return this.deps.now?.() ?? Date.now(); }
  private log(...a: unknown[]): void { (this.deps.log ?? console.log)('[account-pool]', ...a); }
  private sanitize(text: string): string {
    const s = this.deps.sanitize ? this.deps.sanitize(text) : text;
    return s.length > MAX_ERROR_CHARS ? `${s.slice(0, MAX_ERROR_CHARS)}…` : s;
  }
  private label(id: string): string { return this.deps.accounts().find((a) => a.id === id)?.label ?? id; }
  /** The accounts the chooser may hand out: known AND holding a token. */
  private usable(): ClaudeAccount[] { return this.deps.accounts().filter((a) => this.deps.tokenPresent(a.id)); }

  // ─── persistence ───────────────────────────────────────────────────────────

  load(): void {
    try {
      const path = this.deps.statePath();
      if (existsSync(path)) this.state = normalizePoolState(JSON.parse(readFileSync(path, 'utf8')));
    } catch (e) {
      this.log('state unreadable, starting fresh:', e instanceof Error ? e.message : String(e));
      this.state = emptyPoolState();
    }
  }

  private save(): void {
    try {
      const path = this.deps.statePath();
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(this.state));
    } catch (e) {
      this.log('could not persist state:', e instanceof Error ? e.message : String(e));
    }
  }

  // ─── reads ─────────────────────────────────────────────────────────────────

  snapshot(): PoolSnapshot {
    const now = this.now();
    const stranded = planFailover({
      agents: this.deps.liveAgents(), accounts: this.usable(), state: this.state, now, lastSwitchAt: {}, force: true
    }).stranded;
    return snapshotPool(this.state, this.deps.accounts(), now, stranded);
  }

  private publish(): void {
    this.deps.emit('claudeAccount:state', this.snapshot());
  }

  /** Spawn-time assignment for one agent (see resolveSpawnAccount). Only
   *  token-backed accounts are candidates for `auto` / a swap; a pinned account
   *  passes through regardless so the PR 1 fail-closed messages still fire. */
  resolveForSpawn(i: { policy: AccountPolicy; account: string | undefined }): SpawnResolution {
    const now = this.now();
    const pinnedKnown = i.account ? this.deps.accounts().find((a) => a.id === i.account) : undefined;
    const candidates = this.usable();
    if (pinnedKnown && !candidates.some((a) => a.id === pinnedKnown.id)) candidates.push(pinnedKnown);
    return resolveSpawnAccount({ policy: i.policy, account: i.account, accounts: candidates, state: this.state, now });
  }

  /** The spawn path resolved a pinned-but-unhealthy account to another one —
   *  count it like a failover so the panel's switch count stays honest. */
  noteSpawnSwitch(agentId: string, from: string, to: string): void {
    const now = this.now();
    this.lastSwitchAt[agentId] = now;
    this.state = bumpSwitch(this.state, from);
    this.log(`spawn: ${agentId} moved ${this.label(from)} → ${this.label(to)} (pinned account unhealthy)`);
    this.save();
    this.publish();
  }

  // ─── inputs ────────────────────────────────────────────────────────────────

  /** Collector usage push: feeds the 5h window + seeds the reference uuid. */
  recordUsage(sample: AgentUsageSample): void {
    const now = this.now();
    if (sample.sessionId) this.agentSession[sample.agentId] = sample.sessionId;
    const total = sample.input + sample.output + sample.cacheRead + sample.cacheCreation;
    const prev = this.lastTotal[sample.agentId] ?? 0;
    const delta = total >= prev ? total - prev : total;
    this.lastTotal[sample.agentId] = total;
    const account = this.deps.liveAgents().find((a) => a.agentId === sample.agentId)?.account;
    if (!account || !this.deps.accounts().some((a) => a.id === account)) return;
    const before = this.state;
    this.state = recordUsage(this.state, account, delta, now);
    // Seed the integrity reference — but never from a session on a DEAD account:
    // Claude Code keeps reporting the login account's uuid when the injected
    // token is rejected (seen live), which is exactly the wrong reference the
    // 401 just cleared.
    if (sample.accountUuid && this.state.accounts[account]?.health.state !== 'dead') {
      this.state = seedReference(this.state, account, sample.accountUuid);
    }
    if (this.state !== before) {
      this.save();
      // the reference uuid is what the integrity panel renders — push on change
      if (before.accounts[account]?.referenceUuid !== this.state.accounts[account]?.referenceUuid) this.publish();
    }
  }

  /** Collector api_error push. Keyed on status_code only. */
  handleApiError(agentId: string, info: ApiErrorInfo): void {
    if (info.statusCode !== 429 && info.statusCode !== 401) return;
    const now = this.now();
    const agent = this.deps.liveAgents().find((a) => a.agentId === agentId);
    const account = agent?.account;
    if (!account || !this.deps.accounts().some((a) => a.id === account)) return; // login account: untouched
    // Late events from the process we already killed belong to the OLD account.
    if (info.sessionId && this.staleSession[agentId] === info.sessionId) return;
    if (!info.sessionId && now - (this.lastSwitchAt[agentId] ?? 0) < POST_SWITCH_GRACE_MS) return;
    // Remember the failing session BEFORE planning: if this very error triggers
    // a switch, it is the session whose late flushes must be ignored — even
    // when no usage sample ever named it (a session whose first call fails).
    if (info.sessionId) this.agentSession[agentId] = info.sessionId;

    const message = this.sanitize(info.error ?? '');
    const lastError = { ts: now, statusCode: info.statusCode, message };
    const label = this.label(account);
    if (info.statusCode === 429) {
      const parsed = parseResetFromError(info.error ?? '', now);
      const untilTs = parsed ?? now + DEFAULT_COOLDOWN_MS;
      const wasHealthy = isHealthy(this.state.accounts[account], now);
      this.state = markCooling(this.state, account, {
        untilTs,
        reason: parsed ? '429 — reset time parsed from the error' : '429 — no reset time in the error, default 5h cooldown',
        error: lastError
      }, now);
      if (wasHealthy) {
        if (!this.calibrated.has(account)) {
          this.calibrated.add(account);
          // The ONE place the raw-but-sanitized payload is logged: the 429 shape
          // gets calibrated against this on the first real hit (see docs).
          this.log(`calibration: first 429 on "${label}" — status_code=429 parsedReset=${parsed ? new Date(parsed).toISOString() : 'none'} error=${JSON.stringify(message)}`);
        }
        this.log(`"${label}" hit its limit (agent ${agent?.name ?? agentId}) — cooling until ${new Date(untilTs).toLocaleTimeString()} (${fmtCountdown(untilTs, now)})`);
        this.deps.alert?.(`Claude account "${label}" hit its usage limit`, `Cooling for ${fmtCountdown(untilTs, now)} — moving its agents to the next healthy account.`);
      }
      this.save();
      this.publish();
      this.failover(`429 on "${label}"`);
      return;
    }
    // 401: the token is rejected — dead until the operator replaces it. Claude
    // Code reports the same rejection per attempt (two events observed live per
    // prompt), so the transition — log, alert, re-plan — fires once; repeats
    // only refresh lastError.
    const wasDead = this.state.accounts[account]?.health.state === 'dead';
    this.state = markDead(this.state, account, 'token rejected (401)', now, lastError);
    this.save();
    if (wasDead) return;
    this.log(`"${label}" token rejected (401) by agent ${agent?.name ?? agentId} — marked dead, reference uuid cleared`);
    this.deps.alert?.(`Claude account "${label}" token rejected (401)`, 'Marked dead and its agents are being moved. Paste a new `claude setup-token` token for it in Settings → AI Engines — saving it marks the account active again.');
    this.publish();
    this.failover(`401 on "${label}"`);
  }

  /** Periodic beat (~30s): expire lapsed cooldowns (→ resume nudges), retry
   *  pending moves once their rate-limit window passed, refresh the snapshot. */
  tick(): void {
    const now = this.now();
    const { state, resumed } = expireCooling(this.state, now);
    if (resumed.length) {
      this.state = state;
      this.save();
      this.emitResumed(resumed, 'cooldown lapsed');
    }
    this.failover('periodic re-plan');
    this.publish();
  }

  // ─── manual actions (IPC) ──────────────────────────────────────────────────

  /** Operator: "mark active again" (after replacing a dead token, or to end a cooldown early). */
  markActive(id: string): void {
    this.state = markActive(this.state, id);
    this.save();
    this.emitResumed([id], 'marked active by the operator');
    this.publish();
  }

  /** Operator: "rotate now" — drain this account: cool it for the default
   *  window and move its agents (bypassing the per-agent rate limit). */
  rotateAccount(id: string): FailoverPlan {
    const now = this.now();
    this.state = markCooling(this.state, id, { untilTs: now + DEFAULT_COOLDOWN_MS, reason: 'manual rotate' }, now);
    this.save();
    this.publish();
    return this.failover(`manual rotate of "${this.label(id)}"`, { force: true });
  }

  /** A new token was saved for the account: it gets a clean slate — active, and
   *  its reference uuid cleared so the next good session re-seeds it. */
  onTokenReplaced(id: string): void {
    this.state = clearReference(markActive(this.state, id), id);
    this.save();
    this.publish();
  }

  /** The account left the pool — drop its record. */
  onAccountRemoved(id: string): void {
    if (!this.state.accounts[id]) return;
    const accounts = { ...this.state.accounts };
    delete accounts[id];
    this.state = { ...this.state, accounts };
    this.save();
    this.publish();
  }

  // ─── the failover step ─────────────────────────────────────────────────────

  private failover(reason: string, opts: { force?: boolean; only?: string[] } = {}): FailoverPlan {
    const now = this.now();
    const plan = planFailover({
      agents: this.deps.liveAgents(), accounts: this.usable(), state: this.state, now,
      lastSwitchAt: this.lastSwitchAt, force: opts.force, only: opts.only
    });
    if (plan.switches.length) {
      const switches: FailoverSwitch[] = [];
      for (const sw of plan.switches) {
        this.lastSwitchAt[sw.agentId] = now;
        const sid = this.agentSession[sw.agentId];
        if (sid) this.staleSession[sw.agentId] = sid;
        this.state = bumpSwitch(this.state, sw.from);
        switches.push({ ...sw, fromLabel: this.label(sw.from), toLabel: this.label(sw.to) });
        this.log(`failover (${reason}): ${sw.agentId} ${this.label(sw.from)} → ${this.label(sw.to)}`);
      }
      this.save();
      this.deps.emit('claudeAccount:failover', { ts: now, reason, switches });
      this.publish();
    }
    if (plan.stranded.length) {
      if (!this.pausedAlerted) {
        this.pausedAlerted = true;
        const when = plan.earliestReset
          ? `the earliest cooldown ends in ${fmtCountdown(plan.earliestReset, now)} (${new Date(plan.earliestReset).toLocaleTimeString()})`
          : 'no cooldown is pending — replace the dead token(s) and mark an account active';
        this.log(`all accounts cooling/dead — ${plan.stranded.length} agent(s) paused; ${when}`);
        this.deps.alert?.('All Claude accounts are cooling or dead', `${plan.stranded.length} agent(s) paused — ${when}.`);
      }
    } else {
      this.pausedAlerted = false;
    }
    return plan;
  }

  private emitResumed(accountIds: string[], reason: string): void {
    const set = new Set(accountIds);
    const agentIds = this.deps.liveAgents().filter((a) => a.account && set.has(a.account)).map((a) => a.agentId);
    this.log(`resumed (${reason}): ${accountIds.map((id) => this.label(id)).join(', ')} — nudging ${agentIds.length} agent(s)`);
    this.deps.emit('claudeAccount:resumed', {
      ts: this.now(),
      reason,
      accounts: accountIds.map((id) => ({ id, label: this.label(id) })),
      agentIds
    });
  }
}

function bumpSwitch(state: PoolState, id: string): PoolState {
  const cur = state.accounts[id] ?? { health: { state: 'active' as const }, switchCount: 0, usage: [] };
  return { ...state, accounts: { ...state.accounts, [id]: { ...cur, switchCount: cur.switchCount + 1 } } };
}
