/**
 * Usage telemetry seam (Lane A #6.6 — Seam 1, the LOCKED contract with Oscar/#7).
 *
 * The circuit breaker (breaker.ts) and the durable cost ledger (hive.ts
 * appendCostLedger) consume usage ONLY through the `UsageProvider` interface —
 * they never read transcripts, never compute tokens, and never recompute `usd`.
 * That keeps a single source of truth for cost and lets the backend swap with
 * zero changes to the consumers:
 *
 *   - PRIMARY (pull): `getAgentUsage(agentId)` — both backends implement it
 *     identically, so consumer code is swap-stable.
 *   - ADDITIVE (push): `onAgentUsage(cb)` — OTel-backend only, a later
 *     zero-rewrite latency upgrade. The stub does not implement it.
 *
 * Two invariants every consumer must honor (Oscar's 7A.1 spike findings):
 *   (i)  Samples are CUMULATIVE snapshots (monotonic running totals). Velocity is
 *        the DIFF of consecutive pulls (Δusd/Δt, Δoutput/Δt) — never treat a
 *        single sample as an increment.
 *   (ii) `model` arrives normalized (base id, any `[1m]` suffix stripped).
 *
 * `StubUsageProvider` is a thin INTERIM backend so Lane A isn't blocked on Lane C:
 * it wraps the existing transcript reader (readAgentUsage) — the same interim
 * "transcript-poll" backend Oscar owns and will evolve, then replace with the
 * native-OTel collector. At integration we drop in Oscar's module; breaker.ts and
 * the ledger are untouched. The stub's `usd` is the transcript fallback estimate
 * (and inherits the known Sonnet-hardcoded pricing limitation, which Oscar fixes
 * in exactly one place — his provider); it is NOT recomputed downstream.
 */
import { closeSync, existsSync, fstatSync, openSync, readSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { estimateCostUsd } from './pricing';
import { readAgentUsage, type AgentUsage } from './transcript';

/** One cumulative usage snapshot for an agent. The identical row that Oscar
 *  emits, Jim (this lane) persists to cost-ledger.jsonl, and Kevin (#4) stores
 *  in the cost_ledger SQLite table — one shape across all three lanes.
 *
 *  🔒 PII-free by construction: the provider's normalize step allowlists only
 *  these fields and strips every identity attribute (user.email, account/uuid,
 *  organization.id, hashed user.id) BEFORE emitting. Persist ONLY this sample;
 *  never a raw OTel record. */
export interface AgentUsageSample {
  agentId: string;
  /** Doubles as the #6.6a --resume key AND the cost accounting/dedup key. */
  sessionId: string | null;
  ts: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  /** Normalized base model id (no `[1m]` suffix), or null if unknown. */
  model: string | null;
  /** Claude-precomputed cost (live path) / transcript-fallback estimate (interim).
   *  Never recomputed by a consumer. */
  usd: number;
}

/** The seam both backends implement. */
export interface UsageProvider {
  /** PRIMARY pull. Returns a cumulative snapshot, or null when unknown. */
  getAgentUsage(agentId: string): AgentUsageSample | null;
  /** ADDITIVE push (OTel backend only). Optional; the stub omits it. */
  onAgentUsage?(cb: (sample: AgentUsageSample) => void): () => void;
}

/** What the stub needs to turn an agentId into a transcript read + sample fields.
 *  Wired (in index.ts) to the hive registry: cwd for the transcript dir,
 *  sessionId for the resume/dedup key, model for the (best-effort) tier. */
export interface UsageResolver {
  (agentId: string): { cwd: string; sessionId?: string | null; model?: string | null } | null;
}

/** Strip the `[1m]` (or `[…]`) context-window suffix so the model id matches the
 *  normalized form Oscar's OTel ingest emits. */
function normalizeModel(model: string | null | undefined): string | null {
  if (!model) return null;
  return model.replace(/\[[^\]]*\]$/, '').trim() || null;
}

/**
 * Interim transcript-backed provider. Reads cumulative token totals from an
 * agent's Claude Code transcripts (readAgentUsage) and shapes them into an
 * AgentUsageSample. Stands in for Oscar's provider until Lane C lands; the
 * consumers (breaker, ledger) call it through UsageProvider and never change.
 */
export class StubUsageProvider implements UsageProvider {
  constructor(private resolve: UsageResolver) {}

  getAgentUsage(agentId: string): AgentUsageSample | null {
    const info = this.resolve(agentId);
    if (!info) return null;
    const u = readAgentUsage(info.cwd); // cumulative running totals across transcripts
    return {
      agentId,
      sessionId: info.sessionId ?? null,
      ts: Date.now(),
      input: u.inputTokens,
      output: u.outputTokens,
      cacheRead: u.cacheReadTokens,
      cacheCreation: u.cacheWriteTokens,
      model: normalizeModel(info.model),
      usd: u.estimatedCostUsd // interim fallback estimate; Oscar's provider supplies Claude-precomputed usd
    };
  }
}

// ─── Codex rollout usage (#19 — the second engine with real cost accounting) ──

/**
 * Codex's answer to `readAgentUsage`.
 *
 * Codex writes no OTel and its hook bridge carries no usage, so a codex worker's
 * spend was invisible to every budget — the breaker's caps saw `null` for it
 * forever. It DOES keep a rollout transcript per session, under the per-agent
 * `CODEX_HOME` this harness gives it
 * (`<hive>/agents/<id>/.codex/sessions/<Y>/<M>/<D>/rollout-*-<sessionId>.jsonl`),
 * and every turn appends an `event_msg` / `token_count` record whose
 * `info.total_token_usage` is the session's CUMULATIVE totals.
 *
 * Verified against real rollouts written by codex CLI 0.128.0:
 *   payload.info.total_token_usage = { input_tokens, cached_input_tokens,
 *     output_tokens, reasoning_output_tokens, total_tokens }
 * with `total_tokens === input_tokens + output_tokens`, `cached_input_tokens`
 * INCLUDED in `input_tokens`, and `reasoning_output_tokens` included in
 * `output_tokens`. So the split that matches AgentUsage's Claude-shaped fields is
 * input − cached / cached / output / no cache-creation concept.
 *
 * Lives here rather than in transcript.ts because that module is the
 * `~/.claude/projects` reader specifically; this is the same seam, other engine.
 *
 * Cumulative-per-record means we only ever need the LAST such record, so each
 * file is TAIL-read (rollouts reach many MB) and memoized on size+mtime — this
 * runs on the ~30s breaker beat for every codex agent.
 */
const CODEX_TAIL_BYTES = 256 * 1024;
/** Soft bound on the memo, mirroring transcript.ts's usage cache. */
const CODEX_CACHE_MAX = 512;
const codexCache = new Map<string, { size: number; mtimeMs: number; totals: AgentUsage }>();

export function readCodexUsage(codexHome: string): AgentUsage {
  const total: AgentUsage = {
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0
  };
  try {
    const root = join(codexHome, 'sessions');
    if (!existsSync(root)) return total;
    for (const file of rolloutFiles(root)) {
      const t = rolloutUsage(file);
      if (!t) continue;
      total.inputTokens += t.inputTokens;
      total.outputTokens += t.outputTokens;
      total.cacheReadTokens += t.cacheReadTokens;
      total.cacheWriteTokens += t.cacheWriteTokens;
      total.estimatedCostUsd += t.estimatedCostUsd;
      if (t.model) total.model = t.model;
    }
    return total;
  } catch {
    return total; // unreadable home — same "no data" answer readAgentUsage gives
  }
}

/** Every `*.jsonl` under `sessions/` (codex nests them <Y>/<M>/<D>). */
function rolloutFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop() as string;
    let entries: Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
    }
  }
  return out;
}

/** Cumulative totals of ONE rollout, from its last `token_count` record. */
function rolloutUsage(file: string): AgentUsage | null {
  let st: { size: number; mtimeMs: number };
  try { st = statSync(file); } catch { codexCache.delete(file); return null; }
  const cached = codexCache.get(file);
  if (cached && cached.size === st.size && cached.mtimeMs === st.mtimeMs) return cached.totals;

  const totals: AgentUsage = {
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0
  };
  try {
    const fd = openSync(file, 'r');
    try {
      const size = fstatSync(fd).size;
      const len = Math.min(size, CODEX_TAIL_BYTES);
      if (len > 0) {
        const buf = Buffer.alloc(len);
        readSync(fd, buf, 0, len, size - len);
        const lines = buf.toString('utf8').split('\n');
        // Backwards: the newest token_count wins (totals are cumulative), and the
        // newest `model` seen labels the row. A single record larger than the tail
        // window would hide the totals for that beat; they reappear on the next
        // turn's record, so this never reports a WRONG number, only a late one.
        let seen = false;
        for (let i = lines.length - 1; i >= 0 && !(seen && totals.model); i--) {
          const line = lines[i].trim();
          if (!line) continue;
          let rec: { payload?: { type?: unknown; model?: unknown; info?: { total_token_usage?: Record<string, unknown> } | null } };
          try { rec = JSON.parse(line); } catch { continue; } // first line is usually torn
          const payload = rec.payload;
          if (!payload) continue;
          if (!totals.model && typeof payload.model === 'string' && payload.model) totals.model = payload.model;
          if (seen || payload.type !== 'token_count') continue;
          const u = payload.info?.total_token_usage;
          if (!u) continue; // codex emits `info: null` records too (rate-limit-only ticks)
          const input = num(u.input_tokens);
          const cached_ = Math.min(num(u.cached_input_tokens), input);
          totals.inputTokens = input - cached_;
          totals.cacheReadTokens = cached_;
          totals.outputTokens = num(u.output_tokens);
          seen = true;
        }
      }
    } finally { closeSync(fd); }
  } catch {
    return null; // unreadable right now — the next beat retries
  }
  // Fallback prices only (pricing.ts carries Claude families), so USD for a GPT
  // model is a rough floor. Tokens are exact, and the token caps are what the
  // breaker actually enforces.
  totals.estimatedCostUsd = estimateCostUsd(totals.model, {
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    cacheReadTokens: totals.cacheReadTokens,
    cacheWriteTokens: totals.cacheWriteTokens
  });
  codexCache.set(file, { size: st.size, mtimeMs: st.mtimeMs, totals });
  if (codexCache.size > CODEX_CACHE_MAX) {
    let drop = codexCache.size - CODEX_CACHE_MAX / 2;
    for (const k of codexCache.keys()) { if (drop-- <= 0) break; codexCache.delete(k); }
  }
  return totals;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}
