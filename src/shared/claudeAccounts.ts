/**
 * Claude account pool — the pure, dependency-free half (shared by main + renderer).
 *
 * An "account" is a Claude subscription the operator authorized with
 * `claude setup-token`. The TOKEN lives ONLY in the main-process secret broker
 * (Electron safeStorage, write-only over IPC) under `claudeAccountSecretRef(id)`;
 * this module never sees it. What lives here is everything that can be unit-tested
 * without Electron: the non-secret metadata shape, validation, the spawn-time
 * decision ("inject / skip / fail closed"), the OTEL attribute sanitizer, the
 * remove-guard, and the account_uuid integrity reducer the Command Center renders.
 *
 * PR 1 (account pool). Pool policy / failover is deliberately NOT here (PR 2).
 */
import type { AgentProvider } from './agentProvider';

/** Non-secret account metadata, persisted in HarnessConfig.claudeAccounts. */
export interface ClaudeAccount {
  /** Stable opaque id — the broker ref suffix and the per-agent assignment key. */
  id: string;
  /** Operator-chosen display name (unique, case-insensitive). */
  label: string;
  createdAt: number;
}

/** Bucket key for agents that ride the machine's `/login` account (no pin). */
export const LOGIN_ACCOUNT_KEY = 'login';
export const LOGIN_ACCOUNT_LABEL = 'Login account';

const MAX_LABEL = 40;

/** Broker ref for an account's setup-token. Main-only consumers read it. */
export function claudeAccountSecretRef(id: string): string {
  return `claude-account:${id}`;
}

/** OTEL_RESOURCE_ATTRIBUTES is a `k=v,k=v` list, so a label can never carry `,`
 *  `=` or whitespace into it. Keep [A-Za-z0-9_-] only, collapse runs, trim, cap. */
export function sanitizeResourceAttr(value: string, fallback = 'account'): string {
  const cleaned = (value ?? '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || fallback;
}

/** Validate a persisted/incoming account list: shape + unique ids + unique labels. */
export function validateClaudeAccounts(
  list: unknown
): { ok: true; accounts: ClaudeAccount[] } | { ok: false; error: string } {
  if (!Array.isArray(list)) return { ok: false, error: 'claudeAccounts must be an array' };
  const ids = new Set<string>();
  const labels = new Set<string>();
  const accounts: ClaudeAccount[] = [];
  for (const raw of list) {
    const a = raw as Partial<ClaudeAccount> | null;
    if (!a || typeof a !== 'object') return { ok: false, error: 'account entry must be an object' };
    if (typeof a.id !== 'string' || !a.id.trim()) return { ok: false, error: 'account id required' };
    if (typeof a.label !== 'string' || !a.label.trim()) return { ok: false, error: 'account label required' };
    if (typeof a.createdAt !== 'number' || !Number.isFinite(a.createdAt)) return { ok: false, error: 'account createdAt required' };
    const id = a.id.trim();
    const label = a.label.trim();
    if (ids.has(id)) return { ok: false, error: `duplicate account id: ${id}` };
    const key = label.toLowerCase();
    if (labels.has(key)) return { ok: false, error: `duplicate account label: ${label}` };
    ids.add(id);
    labels.add(key);
    accounts.push({ id, label, createdAt: a.createdAt });
  }
  return { ok: true, accounts };
}

/** Why a candidate label can't be added to the pool, or null when it can. */
export function newAccountLabelError(label: string, existing: ClaudeAccount[]): string | null {
  const l = (label ?? '').trim();
  if (!l) return 'A label is required';
  if (l.length > MAX_LABEL) return `Label must be at most ${MAX_LABEL} characters`;
  if (existing.some((a) => a.label.trim().toLowerCase() === l.toLowerCase())) {
    return `An account labelled "${l}" already exists`;
  }
  return null;
}

export interface AccountEnvDecisionInput {
  provider: AgentProvider | undefined;
  /** The agent's pinned account id; undefined = the machine's /login account. */
  account: string | undefined;
  /** Whether the id still resolves to an entry in HarnessConfig.claudeAccounts. */
  accountKnown: boolean;
  /** Whether the broker holds a token under the account's ref. */
  tokenPresent: boolean;
  /** Label for the error message (falls back to the id). */
  label?: string;
}

export type AccountEnvDecision =
  | { kind: 'skip' }
  | { kind: 'inject' }
  | { kind: 'fail'; error: string };

/** The spawn-time rule. Fail CLOSED: a pinned agent whose token can't be
 *  materialized must not quietly spawn on whatever account `/login` happens to be. */
export function decideClaudeAccountEnv(i: AccountEnvDecisionInput): AccountEnvDecision {
  if (!i.account) return { kind: 'skip' };
  if (i.provider !== 'claude') return { kind: 'skip' };
  const name = i.label ?? i.account;
  if (!i.accountKnown) {
    return { kind: 'fail', error: `Claude account "${name}" no longer exists — set this agent back to the login account or re-add the account in Settings → AI Engines.` };
  }
  if (!i.tokenPresent) {
    return { kind: 'fail', error: `Claude account "${name}" has no stored token — paste a \`claude setup-token\` token for it in Settings → AI Engines, or set this agent back to the login account.` };
  }
  return { kind: 'inject' };
}

/** Names of the live agents (and "Michael" via godAccount) pinned to `accountId` —
 *  a non-empty list blocks removing the account. Archived agents don't count. */
export function pinnedAgentsForAccount(
  accountId: string,
  agents: Array<{ id: string; name: string; account?: string; archived?: boolean }>,
  godAccount?: string
): string[] {
  const names = agents
    .filter((a) => !a.archived && a.account === accountId)
    .map((a) => a.name);
  if (godAccount === accountId && !names.includes('Michael')) names.push('Michael');
  return names;
}

export interface AccountObservation {
  agentId: string;
  /** Assigned account id; undefined = login account. */
  account?: string;
  /** `user.account_uuid` observed in this agent's telemetry, if any yet. */
  accountUuid?: string;
}

export interface AccountIntegrity {
  /** accountKey → the first uuid observed for that account ("first session wins"). */
  reference: Record<string, string>;
  /** agentId → the disagreement, for agents whose uuid differs from their account's reference. */
  mismatches: Record<string, { expected: string; observed: string }>;
}

/** Fold observations IN ORDER (first-seen first). Agents with no uuid yet are
 *  neither references nor mismatches. */
export function reduceAccountIntegrity(observations: AccountObservation[]): AccountIntegrity {
  const reference: Record<string, string> = {};
  const mismatches: AccountIntegrity['mismatches'] = {};
  for (const o of observations) {
    if (!o.accountUuid) continue;
    const key = o.account ?? LOGIN_ACCOUNT_KEY;
    const ref = reference[key];
    if (!ref) { reference[key] = o.accountUuid; continue; }
    if (ref !== o.accountUuid) mismatches[o.agentId] = { expected: ref, observed: o.accountUuid };
  }
  return { reference, mismatches };
}
