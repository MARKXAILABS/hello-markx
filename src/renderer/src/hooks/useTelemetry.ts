import { useEffect, useState, useSyncExternalStore } from 'react';
import { mergeAgentViews } from '../store/agentView';

/**
 * Renderer-side consumers of the live telemetry stream (#7B).
 *
 * The main-process collector (telemetry.ts) pushes normalized, PII-free events
 * on `telemetry:event` and breaker state on `control:breakerState`. These hooks
 * subscribe + backfill from the cold-start snapshot, and shape the data for the
 * fleet grid (`useFleetTelemetry`) and the per-agent span waterfall
 * (`useAgentSpans`).
 *
 * Types mirror the LOCKED contract in src/main/telemetry.ts + src/preload (kept
 * in sync by hand, matching the codebase's local-redeclare pattern).
 */

export interface AgentUsageSample {
  agentId: string;
  sessionId: string;
  ts: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  model: string;
  usd: number;
  /** Opaque Claude account id observed in telemetry (account-pool integrity). */
  accountUuid?: string;
}

export interface ToolSpan {
  agentId: string;
  sessionId: string;
  ts: number;
  tool: string;
  success: boolean;
  durationMs: number;
  decision?: 'accept' | 'reject';
  error?: string;
}

export interface BreakerState {
  agentId: string;
  level: 'healthy' | 'steering' | 'constrained' | 'stopped';
  reason: string;
  ts: number;
}

type TelemetryEvent =
  | { kind: 'usage'; sample: AgentUsageSample }
  | { kind: 'tool_result'; span: ToolSpan }
  | { kind: 'api_error'; agentId: string; sessionId: string; ts: number; error: string; statusCode?: number };

/** Total tokens across all kinds — the sparkline/velocity basis. */
export function totalTokens(s: AgentUsageSample): number {
  return s.input + s.output + s.cacheRead + s.cacheCreation;
}

/** How many tokens were fresh vs served from cache, as a 0–1 cache fraction. */
export function cacheFraction(s: AgentUsageSample): number {
  const total = totalTokens(s);
  return total > 0 ? s.cacheRead / total : 0;
}

/** Per-agent rolling token deltas (for the sparkline) plus a simple tokens/min. */
interface Rate {
  deltas: number[]; // most recent first-N token deltas between pushes
  firstTs: number;
  firstTotal: number;
  lastTs: number;
  lastTotal: number;
}

const SPARK_LEN = 14;

export interface FleetTelemetry {
  samples: Record<string, AgentUsageSample>;
  /** sparkline series (token deltas between pushes), oldest→newest, per agent */
  spark: Record<string, number[]>;
  /** tokens/min, derived per agent */
  rate: Record<string, number>;
  /** last tool name seen per agent */
  lastTool: Record<string, string>;
  /** latest breaker state per agent (drives the cost-meter color + ⚠) */
  breakers: Record<string, BreakerState>;
}

// ── ONE fleet subscription, however many components ask for it ──────────────
//
// This used to be five independent React state slots and a `useEffect` INSIDE the hook,
// so the four
// components that mount it (AgentStrip, CommandCenterPanel, FullscreenTerminal,
// ToolWaterfall) each ran their own cold-start `telemetrySnapshot()` backfill and their
// own pair of IPC listeners over the same stream — four copies of one fleet, kept in
// step only by all four happening to see the same pushes.
//
// Same module-singleton + `useSyncExternalStore` shape as `store/autoMode.ts` and
// `store/agentView.ts`. The hook's PUBLIC signature is unchanged and none of the four
// call sites was touched: the collapse is entirely internal to this file.

const EMPTY_FLEET: FleetTelemetry = { samples: {}, spark: {}, rate: {}, lastTool: {}, breakers: {} };

let fleet: FleetTelemetry = EMPTY_FLEET;
const fleetListeners = new Set<() => void>();
const rates: Record<string, Rate> = {};
let offEvent: (() => void) | undefined;
let offBreaker: (() => void) | undefined;

/** Publish a NEW top-level snapshot. `useSyncExternalStore` compares by reference, so
 *  an in-place mutation is a store that has silently stopped re-rendering. */
function publishFleet(patch: Partial<FleetTelemetry>): void {
  fleet = { ...fleet, ...patch };
  for (const l of [...fleetListeners]) l();
}

function foldUsage(s: AgentUsageSample): void {
  const total = totalTokens(s);
  const r = rates[s.agentId];
  if (!r) {
    rates[s.agentId] = { deltas: [], firstTs: s.ts, firstTotal: total, lastTs: s.ts, lastTotal: total };
    publishFleet({ samples: { ...fleet.samples, [s.agentId]: s } });
    return;
  }
  const delta = Math.max(0, total - r.lastTotal);
  r.deltas = [...r.deltas, delta].slice(-SPARK_LEN);
  r.lastTs = s.ts;
  r.lastTotal = total;
  const minutes = Math.max(1 / 60, (r.lastTs - r.firstTs) / 60000);
  publishFleet({
    samples: { ...fleet.samples, [s.agentId]: s },
    spark: { ...fleet.spark, [s.agentId]: r.deltas },
    rate: { ...fleet.rate, [s.agentId]: (r.lastTotal - r.firstTotal) / minutes }
  });
}

function startFleet(): void {
  // Backfill from the snapshot (we missed every push before the first mount).
  void window.cth.telemetrySnapshot?.().then((snap) => {
    if (!snap) return;
    for (const s of snap.usage ?? []) foldUsage(s as AgentUsageSample);
    const tools: Record<string, string> = {};
    for (const [id, spans] of Object.entries(snap.spans ?? {})) {
      const arr = spans as ToolSpan[];
      if (arr.length) tools[id] = arr[arr.length - 1].tool;
    }
    publishFleet({ lastTool: { ...tools, ...fleet.lastTool } });
  }).catch(() => { /* collector not up — empty grid */ });

  offEvent = window.cth.onTelemetryEvent?.((e: TelemetryEvent) => {
    if (e.kind === 'usage') foldUsage(e.sample);
    else if (e.kind === 'tool_result') {
      publishFleet({ lastTool: { ...fleet.lastTool, [e.span.agentId]: e.span.tool } });
    }
  });
  offBreaker = window.cth.onBreakerState?.((s: BreakerState) => {
    publishFleet({ breakers: { ...fleet.breakers, [s.agentId]: s } });
    // The same push, folded into the stat card's cache so a breaker that trips
    // mid-beat reaches the card without waiting out agentView's 30s pull. Cost
    // deliberately does NOT ride along: a dollar figure 30s stale is fine, a
    // block state 30s stale is exactly the fail-unsafe window D-36 named.
    mergeAgentViews({ [s.agentId]: { breaker: { level: s.level, reason: s.reason } } });
  });
}

/** Subscribe to the shared fleet snapshot, starting the ONE subscription on the first
 *  listener and tearing it down on the last. Exported for `node --test`, which has no
 *  React and cannot mount the hook. */
export function subscribeFleetTelemetry(listener: () => void): () => void {
  const first = fleetListeners.size === 0;
  fleetListeners.add(listener);
  if (first && typeof window !== 'undefined' && window.cth) startFleet();
  return () => {
    fleetListeners.delete(listener);
    if (fleetListeners.size === 0) {
      offEvent?.(); offBreaker?.();
      offEvent = undefined; offBreaker = undefined;
    }
  };
}

/** The current shared snapshot — and, being the `getServerSnapshot` too, what a
 *  server-rendered test sees. */
export function getFleetTelemetry(): FleetTelemetry {
  return fleet;
}

/** Drop the shared state and detach. Test teardown only. */
export function resetFleetTelemetry(): void {
  offEvent?.(); offBreaker?.();
  offEvent = undefined; offBreaker = undefined;
  fleetListeners.clear();
  for (const id of Object.keys(rates)) delete rates[id];
  fleet = EMPTY_FLEET;
}

/**
 * Subscribe to the whole fleet's live telemetry.
 *
 * Unchanged signature and unchanged `FleetTelemetry` shape — every mount now reads the
 * one shared subscription above instead of opening its own.
 */
export function useFleetTelemetry(): FleetTelemetry {
  return useSyncExternalStore(subscribeFleetTelemetry, getFleetTelemetry, getFleetTelemetry);
}

/**
 * Subscribe to ONE agent's tool spans for the waterfall. Backfills from the
 * collector on mount/agent-change, then appends live `tool_result` pushes.
 */
export function useAgentSpans(agentId: string): ToolSpan[] {
  const [spans, setSpans] = useState<ToolSpan[]>([]);

  useEffect(() => {
    let alive = true;
    setSpans([]);
    window.cth.telemetrySpans?.(agentId).then((s) => {
      if (alive && Array.isArray(s)) setSpans(s as ToolSpan[]);
    }).catch(() => { /* none yet */ });

    const off = window.cth.onTelemetryEvent?.((e: TelemetryEvent) => {
      if (e.kind === 'tool_result' && e.span.agentId === agentId) {
        setSpans((prev) => [...prev, e.span].slice(-200));
      } else if (e.kind === 'api_error' && e.agentId === agentId) {
        setSpans((prev) => [...prev, {
          agentId, sessionId: e.sessionId, ts: e.ts, tool: 'api_error',
          success: false, durationMs: 0, error: e.error
        }].slice(-200));
      }
    });
    return () => { alive = false; off?.(); };
  }, [agentId]);

  return spans;
}
