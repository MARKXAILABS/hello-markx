/**
 * bootFloor — the composition root, lifted out of `index.ts`'s module-scope
 * prelude (the singleton block `hive`/`delivery`/`telemetry`/… once declared at
 * import time) and its trailing bootstrap sequence (`bootstrapHiveServices()`),
 * plus `SHUTDOWN_STEPS`/`runShutdown`, its exact inverse (#34's rationale for
 * keeping shutdown a single declarative list rather than two hand-maintained
 * teardown paths — a reset used to leave the public tunnel open and every qwen
 * sidecar running against a wiped hive).
 *
 * Deliberately free of any `electron` import: `bootFloor(deps)` constructs every
 * subsystem INSIDE the function, using only {@link FloorDeps} for anything
 * Electron-shaped, so `node --test` can boot and tear down a whole floor with no
 * Electron binary (test/boot-floor.test.cjs). Everything that stays genuinely
 * Electron-owned — `mainWindow`/`BrowserWindow`, `app.on`/`process.on`,
 * `powerMonitor`, the Slack/webhook tunnel servers, the ephemeral-worker spawn
 * path (it calls index.ts's `spawnAgentCore`, which owns real PTY/webContents
 * wiring and is too large and IPC-shaped to move) — stays in index.ts, which
 * imports back whatever bare names it still needs from this module.
 */
import { join, dirname, resolve, basename } from 'node:path';
import {
  existsSync, readdirSync, statSync, readFileSync, mkdirSync, copyFileSync,
  writeFileSync, renameSync, rmSync
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PtyManager, type SpawnOptions } from '../pty';
import {
  readConfig, writeConfig,
  OPS_STANDUP_MISSION, HEARTBEAT_MISSION, COMPACT_MAINTENANCE_MISSION, type ScheduledMission
} from '../config';
import { HiveManager, redactSecrets, type AgentMeta, type HiveTask } from '../hive';
import { AccountPoolManager } from '../accountPool';
import {
  DeliveryService, condenseBoardText, verifyBoard, BOARD_KEEP_SECTIONS,
  type AccountSwitch, type LiveAgentPty
} from '../delivery';
import type { QueuedDelivery } from '../../shared/queueDelivery';
import { HookServer } from '../hooks';
import { CircuitBreaker, type BreakerInput } from '../breaker';
import { TelemetryCollector } from '../telemetry';
import { MemoryManager } from '../memory';
import { MemoryReflector, type ReflectSettings } from '../reflect';
import { PersistStore } from '../db';
import { SPAWN_SAFE_SESSION_ID } from '../transcript';
import {
  appendTriggerHistory, listTriggerHistory
} from '../triggerHistory';
import { worktreeHasUnintegratedWork, removeWorktree } from '../git';
import { IntegrationBroker } from '../integrationBroker';
import * as integrations from '../integrations';
import { RosterStore } from '../roster';
import { ControlRegistry } from '../control';
import {
  inferAgentProvider, isClaudeProvider, type AgentProvider
} from '../../shared/agentProvider';
import { claudeAccountSecretRef } from '../../shared/claudeAccounts';
import { DEFAULT_CONTEXT_TRIGGER, type ContextRule } from '../../shared/triggers';
import type { FloorDeps } from './deps';

// ─── Types shared with index.ts (erased at runtime — safe for a type-only
//     cross-import that never pulls in this module's runtime code) ───────────

/** ptyId → the EXACT options its last successful spawn came through, plus the
 *  window that owns its output. index.ts's `AgentSpawnOptions` used to be
 *  declared next to `spawnAgentCore`; it moves here because `spawnRecipes`
 *  (read by `respawnOnAccount`) needs it and this module cannot import types
 *  back out of index.ts (that would pull in every forbidden module-scope
 *  Electron side effect D-02 exists to keep out of `src/main/floor/**`). */
export type AgentSpawnOptions = SpawnOptions & {
  hive?: AgentMeta; isolate?: boolean; resume?: boolean; requireResume?: boolean;
  resumeSessionId?: string; provider?: AgentProvider; noAutoInstall?: boolean;
};

/** A live god-triggered ephemeral worker, tracked from spawn to teardown.
 *  Shared with index.ts's `ephemeralWorkerTick`/`workers:list` — that machinery
 *  stays in index.ts (it spawns via `spawnAgentCore`), but `teardownPty` here
 *  still needs to read/clear the same map. */
export interface WorkerRec {
  workerId: string;
  reqId: string;
  name?: string;
  slack?: { channel: string; thread_ts: string };
  baseBranch: string;
  spawnedAt: number;
  releasing?: boolean;
  tokenCap?: number;
}

/** A worker worktree that teardown PRESERVED because it held unintegrated work.
 *  Shared with index.ts's GC sweep for the same reason as {@link WorkerRec}. */
export interface PreservedWorktree {
  workerId: string;
  wtPath: string;
  origCwd: string;
  baseBranch: string;
  scratchDir: string | null;
  slack?: { channel: string; thread_ts: string };
  preservedAt: number;
}

/** A mission's live scheduler handles: the initial `setTimeout` that waits out
 *  the time remaining until its next due fire, and the steady `setInterval`
 *  armed once it has fired. Both are tracked so shutdown can clear whichever is
 *  pending. */
interface MissionTimer {
  timeout?: NodeJS.Timeout;
  interval?: NodeJS.Timeout;
}

/** The started floor: every subsystem `bootFloor` constructed, plus its exact
 *  inverse. RESEARCH Pitfall 2 — `telemetry.start()`/`integrationBroker.start()`
 *  both log-and-continue by design, so "the promise resolved" proves nothing; a
 *  caller (the boot test) asserts liveness against these fields directly. */
export interface Floor {
  hive: HiveManager;
  delivery: DeliveryService;
  hookServer: HookServer;
  telemetry: TelemetryCollector;
  persist: PersistStore;
  ptyManager: PtyManager;
  control: ControlRegistry;
  breaker: CircuitBreaker;
  memory: MemoryManager;
  reflector: MemoryReflector;
  accountPool: AccountPoolManager;
  integrationBroker: IntegrationBroker;
  roster: RosterStore;
  ptyToAgent: Map<string, string>;
  worktreePaths: Map<string, string>;
  worktreeOrigins: Map<string, string>;
  worktreeBases: Map<string, string>;
  preservedWorktrees: Map<string, PreservedWorktree>;
  spawnRecipes: Map<string, { opts: AgentSpawnOptions; owner: Electron.WebContents | null }>;
  missionTimers: Map<string, MissionTimer>;
  contextTimers: Map<'compact' | 'clear', MissionTimer>;
  liveWorkers: Map<string, WorkerRec>;
  /** The exact inverse of construction. #34 — ONE list; a reset that stops
   *  neither the webhook server nor the sidecars (drift between two
   *  hand-maintained teardown paths) is the bug this shape exists to prevent. */
  shutdown: () => void;
  /** D-09's non-interactive quit path: `shutdown()` (whose `SHUTDOWN_STEPS`
   *  ends in `ptyManager.killAll()`, which routes every live PTY through
   *  `teardownPty`'s ADR-0003 gate exactly like a confirmed quit does) then
   *  `deps.quit()`. Synchronous by construction (`shutdown`'s `for` loop has
   *  no `await` in it), which is why the caller — `index.ts`'s `before-quit`
   *  — never needs `preventDefault`: by the time this call returns, the
   *  floor is already torn down and `deps.quit()` has already re-entered
   *  `before-quit` with `allowQuit` set, so the re-entrant pass takes
   *  `quitDecision`'s `'allow'` arm and the quit proceeds. */
  teardownAndQuit: () => void;
}

// ─── Module state — every field is declared here (typed, unconstructed) and
//     ASSIGNED inside bootFloor(), never at module scope. A bare `let x: T;`
//     has no `new` and no side effect; the `new X(...)` itself only runs when
//     bootFloor() is actually CALLED. This also means a second bootFloor() call
//     (a second `loadTs` in a different test file is a fresh module instance,
//     but nothing stops a future caller re-invoking it) gets fresh state instead
//     of silently sharing the previous boot's Maps. ─────────────────────────
let deps: FloorDeps;

export let ptyManager: PtyManager;
export let hive: HiveManager;
export let control: ControlRegistry;
export let telemetry: TelemetryCollector;
export let breaker: CircuitBreaker;
let fleetTimer: ReturnType<typeof setInterval> | null = null;
let breakerBeatTimer: ReturnType<typeof setInterval> | null = null;
export let accountPool: AccountPoolManager;
export let delivery: DeliveryService;
export let hookServer: HookServer;
export let memory: MemoryManager;
export let reflector: MemoryReflector;
export let persist: PersistStore;
export let integrationBroker: IntegrationBroker;
export let roster: RosterStore;

export let ptyToAgent: Map<string, string>;
export let worktreePaths: Map<string, string>;
export let worktreeOrigins: Map<string, string>;
export let worktreeBases: Map<string, string>;
export let spawnRecipes: Map<string, { opts: AgentSpawnOptions; owner: Electron.WebContents | null }>;
export let liveWorkers: Map<string, WorkerRec>;
export let preservedWorktrees: Map<string, PreservedWorktree>;
const PRESERVED_KV = 'worktrees.preserved';

let missionTimers: Map<string, MissionTimer>;
let contextTimers: Map<'compact' | 'clear', MissionTimer>;
const CONTEXT_LAST_RUN_KV_KEY = 'triggers.context.lastRun';
let contextLastRun: Record<string, number> | null = null;

/** ~32 KB is ~8k tokens re-read on every single god turn — generous for a plan,
 *  far past where a human would still call it one. */
const BOARD_BUDGET_BYTES = 32 * 1024;
const BOARD_CONDENSE_RETRY_MS = 10 * 60_000;
let lastBoardCondenseAt = 0;

/** Senders whose mail is the scheduler's OWN noise — never a reason to wake
 *  god. Kept narrow so any future real sender counts by default. */
const SYSTEM_SENDERS: readonly string[] = ['heartbeat', 'scheduler', 'breaker', 'system'];

const UNSAFE_SID_LOG_INTERVAL_MS = 60_000;
let lastUnsafeSidWarn = 0;

let webhookDoneTimer: ReturnType<typeof setInterval> | null = null;
let webhookOutboundRecorded: Set<string> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────

/** HookServer's `getWebContents` is only ever used as `.send(channel, payload)`
 *  (hooks.ts:1215,1522,1526 — never for anything else, e.g. `.isDestroyed()`),
 *  so a minimal object carrying just `.send` — routed through `deps.send`,
 *  which already encodes "no window → no-op" — satisfies it exactly. */
function fakeWebContents(): Electron.WebContents {
  return { send: (channel: string, payload: unknown) => { deps.send(channel, payload); } } as unknown as Electron.WebContents;
}

/** Persist the preserved-worktree ledger. In-memory only would drop an entry on
 *  a quit between "worker ended holding unintegrated work" and "that work
 *  landed" — the worktree and scratch dir then leak with nothing left that
 *  knew they were reclaimable (#14). */
function savePreservedWorktrees(): void {
  try { persist.setKv(PRESERVED_KV, [...preservedWorktrees.values()]); }
  catch (e) { console.error('[worker gc] could not persist preserved worktrees:', e); }
}

/** Reload it at boot. A live in-memory entry always wins over the snapshot. */
function loadPreservedWorktrees(): void {
  try {
    const rows = persist.getKv<PreservedWorktree[]>(PRESERVED_KV);
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      if (!r || typeof r.wtPath !== 'string' || !r.wtPath || typeof r.workerId !== 'string') continue;
      if (!preservedWorktrees.has(r.wtPath)) preservedWorktrees.set(r.wtPath, r);
    }
    if (preservedWorktrees.size > 0) {
      console.log(`[worker gc] reloaded ${preservedWorktrees.size} preserved worktree(s) awaiting integration`);
    }
  } catch (e) { console.error('[worker gc] could not reload preserved worktrees:', e); }
}

/** Send an inform to the god agent (the human's proxy). */
function informGod(subject: string, body: string, slack?: { channel: string; thread_ts: string }): void {
  try {
    const slackLine = slack
      ? `\n\n[SLACK] Close the loop — post a reply to channel ${slack.channel} thread ${slack.thread_ts} via:\n  the app's bundled Slack reply helper (see the operator UI — main owns the script path)`
      : '';
    hive.send({ to: 'god', act: 'inform', subject, body: body + slackLine }, 'ephemeral-worker');
  } catch (e) {
    console.error('[worker] informGod failed:', e);
  }
}

/** PTY id owning a given agent id, or undefined. */
function ptyForAgent(agentId: string): string | undefined {
  for (const [ptyId, a] of ptyToAgent) if (a === agentId) return ptyId;
  return undefined;
}

/** The hive scratch dir for a worker (its inbox/outbox/memory): HIVE_ROOT/agents/<id>. */
function workerScratchDir(workerId: string): string | null {
  const root = hive.root();
  return root ? join(root, 'agents', workerId) : null;
}

/** Best-effort removal of a worker's scratch (hive agent) dir. Guarded to ONLY
 *  ever delete a path that resolves to exactly HIVE_ROOT/agents/<workerId> and
 *  never a still-live worker. */
function removeWorkerScratch(workerId: string): void {
  if (liveWorkers.has(workerId)) return;
  const dir = workerScratchDir(workerId);
  const root = hive.root();
  if (!dir || !root) return;
  const agentsRoot = join(root, 'agents');
  if (resolve(dir) !== join(resolve(agentsRoot), basename(dir)) || basename(dir) !== workerId) return;
  try { rmSync(dir, { recursive: true, force: true }); }
  catch (e) { console.error('[worker] removeWorkerScratch failed:', e); }
}

/** Gated worktree teardown for an ephemeral worker: remove it ONLY when it
 *  holds no unintegrated work; otherwise leave it (and its branch) in place and
 *  ping god, the sole integrator. Fail-safe — any uncertainty KEEPS it. */
async function finalizeWorkerWorktree(wtPath: string, origCwd: string, worker: WorkerRec): Promise<void> {
  try {
    const work = await worktreeHasUnintegratedWork(wtPath, worker.baseBranch);
    if (work.keep) {
      console.warn(`[worker] PRESERVING worktree with unintegrated work: ${wtPath} (${work.detail})`);
      preservedWorktrees.set(wtPath, {
        workerId: worker.workerId, wtPath, origCwd, baseBranch: worker.baseBranch,
        scratchDir: workerScratchDir(worker.workerId), slack: worker.slack, preservedAt: Date.now()
      });
      savePreservedWorktrees();
      informGod(
        `[worker worktree preserved] ${worker.workerId}`,
        `Ephemeral worker ${worker.workerId} ended but its worktree holds unintegrated work, so it was NOT auto-removed (you are the sole integrator).\n`
        + `Worktree: ${wtPath}\nBranch: ${work.branch}\nState: ${work.detail}\n`
        + `Review/merge it — it will be auto-reclaimed once its work lands in ${worker.baseBranch}, or remove it now with: git -C "${origCwd}" worktree remove "${wtPath}"`,
        worker.slack
      );
      return;
    }
    const r = await removeWorktree(origCwd, wtPath);
    if (!r.ok) { console.error('[worker] removeWorktree failed:', r.error); return; }
    preservedWorktrees.set(wtPath, {
      workerId: worker.workerId, wtPath, origCwd, baseBranch: worker.baseBranch,
      scratchDir: workerScratchDir(worker.workerId), slack: worker.slack, preservedAt: Date.now()
    });
    savePreservedWorktrees();
  } catch (e) {
    console.error('[worker] finalizeWorkerWorktree threw (worktree left in place):', e);
  }
}

/** Gated worktree teardown for a NORMAL (non-worker) isolated agent: remove it
 *  only when nothing would be lost. Deliberately does NOT register in
 *  `preservedWorktrees` — a real agent's scratch dir is its memory/inbox, not a
 *  worker's disposable scratch. */
async function finalizeAgentWorktree(
  id: string, wtPath: string, origCwd: string, baseBranch: string
): Promise<void> {
  try {
    const work = await worktreeHasUnintegratedWork(wtPath, baseBranch);
    if (work.keep) {
      console.warn(
        `[worktree] PRESERVING ${id}'s worktree — it holds unintegrated work: ${wtPath} `
        + `(branch ${work.branch}, ${work.detail}). Restarting this agent re-enters it; `
        + `once the work has landed, remove it with: git -C "${origCwd}" worktree remove "${wtPath}"`
      );
      return;
    }
    const r = await removeWorktree(origCwd, wtPath);
    if (!r.ok) console.error('[worktree] removeWorktree failed:', r.error);
  } catch (e) {
    console.error('[worktree] finalizeAgentWorktree threw (worktree left in place):', e);
  }
}

/**
 * Tear down everything tied to a PTY id: archive its hive agent, remove its
 * isolated git worktree, and drop the bookkeeping-map entries. Idempotent,
 * best-effort — every step is wrapped so a teardown error can never crash the
 * caller (an IPC handler or node-pty's onExit, both index.ts-owned).
 */
function teardownPty(id: string): void {
  try { integrationBroker.revoke(id); } catch { /* best-effort */ }
  const agentId = ptyToAgent.get(id);
  if (agentId) {
    ptyToAgent.delete(id);
    try { breaker.forget(agentId); } catch { /* best-effort */ }
    try { control.forget(agentId); } catch { /* best-effort */ }
    try { telemetry.forget(agentId); } catch { /* best-effort */ }
    try { hive.stopProxyBridge(agentId); } catch (e) { console.error('[hive] stopProxyBridge failed:', e); }
    if (hive.enabled()) {
      try { hive.setArchived(agentId, true); } catch (e) { console.error('[hive] setArchived failed:', e); }
    }
  }
  const wtPath = worktreePaths.get(id);
  if (wtPath) {
    const origCwd = worktreeOrigins.get(id) ?? wtPath;
    worktreePaths.delete(id);
    worktreeOrigins.delete(id);
    const worker = liveWorkers.get(id);
    const baseBranch = worktreeBases.get(id) ?? 'main';
    worktreeBases.delete(id);
    if (worker) {
      liveWorkers.delete(id);
      void finalizeWorkerWorktree(wtPath, origCwd, worker);
    } else {
      void finalizeAgentWorktree(id, wtPath, origCwd, baseBranch);
    }
  }
  if (liveWorkers.has(id)) liveWorkers.delete(id);
  spawnRecipes.delete(id);
  delivery.forgetPty(id);
  deps.syncKeepAwake?.();
}

/** Clear and forget every armed mission timer. */
function clearMissionTimers(): void {
  for (const t of missionTimers.values()) {
    if (t.timeout) clearTimeout(t.timeout);
    if (t.interval) clearInterval(t.interval);
  }
  missionTimers.clear();
}

/** Read the reflect tunables from config each tick. */
function reflectSettings(): import('../reflect').ReflectSettings {
  const c = readConfig();
  return {
    enabled: c.reflectEnabled !== false,
    intervalMs: c.reflectIntervalMs ?? 1_800_000,
    byteTriggerPct: c.reflectByteTriggerPct ?? 50,
    sectionTrigger: c.reflectSectionTrigger ?? 50,
    recentKeep: c.reflectRecentKeep ?? 12,
    minBytes: c.reflectMinBytes ?? 16_384
  };
}

/** Newest coordination-file mtime for one agent (inbox + inbox/.done, outbox +
 *  outbox/.sent, memory.md) — FILES only, deliberately excluding PTY output. */
function lastCoordinationAt(agentId: string): number {
  const root = hive.root();
  if (!root) return 0;
  const times: number[] = [0];
  const pushMtime = (p: string): void => { try { times.push(statSync(p).mtimeMs); } catch { /* missing */ } };
  const dir = join(root, 'agents', agentId);
  pushMtime(join(dir, 'inbox'));
  pushMtime(join(dir, 'inbox', '.done'));
  pushMtime(join(dir, 'outbox'));
  pushMtime(join(dir, 'outbox', '.sent'));
  pushMtime(join(dir, 'memory.md'));
  return Math.max(...times);
}

/** Is the floor quiet? Derived ONLY from signals main owns or can stat. */
function isFloorQuiet(thresholdMs: number): boolean {
  const root = hive.root();
  if (!root) return false;
  const times: number[] = [];
  const pushMtime = (p: string): void => { try { times.push(statSync(p).mtimeMs); } catch { /* missing */ } };
  pushMtime(join(root, 'log.jsonl'));
  const agentsDir = join(root, 'agents');
  if (existsSync(agentsDir)) {
    for (const id of readdirSync(agentsDir)) {
      pushMtime(join(agentsDir, id, 'inbox'));
      pushMtime(join(agentsDir, id, 'outbox', '.sent'));
    }
  }
  for (const t of ptyManager.list()) times.push(t.lastOutputAt);
  if (times.length === 0) return false;
  return Date.now() - Math.max(...times) > thresholdMs;
}

/** "Stuck" = some worker's PTY is actively printing while its coordination
 *  files have gone stale — working-but-not-coordinating. */
function looksStuck(windowMs: number): boolean {
  const reg = hive.registry();
  const now = Date.now();
  for (const [id, a] of Object.entries(reg.agents)) {
    if (a.archived || id === reg.godId) continue;
    const ptyId = ptyForAgent(id);
    if (!ptyId) continue;
    const idle = ptyManager.idleFor(ptyId) ?? Infinity;
    if (idle < 15_000 && now - lastCoordinationAt(id) > windowMs) return true;
  }
  return false;
}

/** The agent's durable delivery cursor, or null when never advanced. Read-only
 *  — `hive.drainForStop` owns every write to it. */
function readDeliveryCursor(agentId: string): string | null {
  const root = hive.root();
  if (!root) return null;
  try {
    const raw = readFileSync(join(root, 'agents', agentId, 'cursor.json'), 'utf8');
    const cur = JSON.parse(raw) as { lastProcessed?: unknown };
    return typeof cur.lastProcessed === 'string' ? cur.lastProcessed : null;
  } catch { return null; }
}

/**
 * Kill an agent's PTY and respawn it on `account`, resuming its session (#5).
 * Reuses `spawnAgentCore` (index.ts) via `deps.respawnCore` — that
 * function creates real PTYs/webContents wiring and is too large/IPC-shaped to
 * relocate; everything ELSE about the failover decision lives here.
 */
async function respawnOnAccount(
  agentId: string,
  account: string
): Promise<{ ok: boolean; error?: string; account?: string }> {
  const ptyId = ptyForAgent(agentId);
  if (!ptyId) return { ok: false, error: 'agent has no live PTY' };
  const rec = spawnRecipes.get(ptyId);
  if (!rec) return { ok: false, error: 'no spawn recipe recorded for this agent' };
  const worktree = worktreePaths.get(ptyId);
  try { ptyManager.kill(ptyId); } catch { /* already dead — teardown still runs */ }
  teardownPty(ptyId);
  if (worktree) {
    await new Promise((r) => setTimeout(r, 750));
  }
  const cwd = worktree && existsSync(worktree) ? worktree : rec.opts.cwd;
  const opts: AgentSpawnOptions = {
    ...rec.opts,
    ...(rec.opts.args ? { args: [...rec.opts.args] } : {}),
    ...(rec.opts.env ? { env: { ...rec.opts.env } } : {}),
    cwd,
    isolate: false,
    resume: true,
    hive: rec.opts.hive ? { ...rec.opts.hive, cwd, account } : undefined
  };
  const res = await deps.respawnCore(opts, rec.owner);
  if (!res.ok) return { ok: false, error: res.error };
  const landed = res.account ?? account;
  if (rec.opts.hive?.isGod && landed && landed !== readConfig().godAccount) {
    try { writeConfig({ godAccount: landed }); } catch { /* best-effort */ }
  }
  return { ok: true, account: landed };
}

/** A native toast for breaker constrain/stop, gated on the notifications setting. */
function breakerToast(title: string, body: string): void {
  if (!readConfig().notifications) return;
  deps.notify({ title, body });
}

/** One circuit-breaker beat: pull a fresh usage sample per active agent, append
 *  it to the durable cost ledger, tick the breaker, emit each BreakerState, and
 *  enforce any escalation. God is in the LEDGER but not the breaker inputs. */
function runBreakerBeat(progressWindowMs: number): void {
  if (!hive.enabled()) return;
  const reg = hive.registry();
  const now = Date.now();
  const inputs: BreakerInput[] = [];
  for (const [id, a] of Object.entries(reg.agents)) {
    if (a.archived) continue;
    if (a.isAssistant) continue;
    if (id !== reg.godId && !ptyForAgent(id)) continue;
    const sample = telemetry.getAgentUsage(id);
    if (sample?.sessionId) hive.appendCostLedger(sample);
    if (sample?.sessionId) {
      if (SPAWN_SAFE_SESSION_ID.test(sample.sessionId)) hive.recordSession(id, sample.sessionId);
      else if (Date.now() - lastUnsafeSidWarn >= UNSAFE_SID_LOG_INTERVAL_MS) {
        lastUnsafeSidWarn = Date.now();
        console.warn(`[resume] refusing to record a session id that is not argv-safe for ${id} `
          + `(length ${sample.sessionId.length}) — telemetry is reporting an id no CLI can be handed`);
      }
    }
    if (id === reg.godId) continue;
    const spans = telemetry.getSpans(id);
    const lastSpanAt = spans.length ? spans[spans.length - 1].ts : 0;
    inputs.push({
      agentId: id,
      sample,
      budget: hive.budgetForAgent(id) ?? undefined,
      progressing: now - lastCoordinationAt(id) < progressWindowMs || now - lastSpanAt < progressWindowMs
    });
  }
  for (const d of breaker.tick(inputs, now)) {
    deps.send('control:breakerState', d.state);
    if (d.action === 'none') continue;
    const name = reg.agents[d.state.agentId]?.name ?? d.state.agentId;
    const reason = d.state.reason;
    if (d.action === 'steer') {
      hive.send({ to: d.state.agentId, act: 'request', subject: 'Circuit breaker: steer',
        body: `Automated guardrail: ${reason}. Re-check your approach — if you're looping or stuck, STOP repeating, summarize what you've tried, and ask god for direction.` }, 'breaker');
    } else if (d.action === 'constrain') {
      hive.send({ to: d.state.agentId, act: 'request', subject: 'Circuit breaker: constrain',
        body: `Automated guardrail escalated: ${reason}. Stop active work now: switch to read-only/plan, write a short plan of your next step, and send it to god for sign-off BEFORE running more tools.` }, 'breaker');
      breakerToast(`${name} constrained`, reason);
    } else if (d.action === 'stop') {
      const ptyId = ptyForAgent(d.state.agentId);
      if (ptyId) { try { ptyManager.kill(ptyId); } catch { /* already gone */ } teardownPty(ptyId); }
      breakerToast(`${name} stopped by circuit breaker`, reason);
    }
  }
}

/** Build + write the live fleet snapshot Michael reads. Always-on, PII-free,
 *  never throws (called from a timer). */
function writeFleetSnapshot(): void {
  if (!hive.enabled()) return;
  try {
    const reg = hive.registry();
    const snap = telemetry.snapshot();
    const usageById = new Map(snap.usage.map((u) => [u.agentId, u]));
    const now = Date.now();
    const agents = Object.entries(reg.agents)
      .filter(([, a]) => !a.archived)
      .map(([id, a]) => {
        const u = usageById.get(id);
        const spans = snap.spans[id] ?? [];
        const tokens = u ? u.input + u.output + u.cacheRead + u.cacheCreation : 0;
        return {
          id,
          name: a.name,
          role: a.role ?? (a.isGod ? 'orchestrator' : 'agent'),
          cwd: a.cwd,
          isGod: !!a.isGod,
          breaker: breaker.levelFor(id),
          tokens,
          usd: u ? Number(u.usd.toFixed(4)) : 0,
          lastTool: spans.length ? spans[spans.length - 1].tool : null,
          lastActiveSecAgo: u ? Math.round((now - u.ts) / 1000) : null,
          inboxBacklog: hive.inboxBacklog(id),
          account: a.account ?? null,
          accountUuid: u?.accountUuid ?? null
        };
      });
    hive.writeFleetSnapshot({ ts: now, agents });
  } catch (e) {
    console.error('[fleet] snapshot failed:', e);
  }
}

/** (Re)arm the always-on beats: the live fleet snapshot (~8s) + the
 *  breaker/cost-ledger beat (~30s). Guarded (clear-then-set) so a re-bootstrap
 *  or a powerMonitor resume can't stack duplicate timers. */
export function armAlwaysOnBeats(): void {
  if (fleetTimer) clearInterval(fleetTimer);
  writeFleetSnapshot();
  fleetTimer = setInterval(writeFleetSnapshot, 8_000);
  if (breakerBeatTimer) clearInterval(breakerBeatTimer);
  breakerBeatTimer = setInterval(() => {
    try { runBreakerBeat(300_000); } catch (e) { console.error('[breaker beat]', e); }
    try { accountPool.tick(); } catch (e) { console.error('[account-pool beat]', e); }
    try { condenseBoardIfOversized(); } catch (e) { console.error('[board beat]', e); }
  }, 30_000);
}

/** Count of UNREAD actionable messages in god's inbox. */
function godActionableInboxCount(): number {
  try {
    const godId = hive.registry().godId;
    if (!godId) return 0;
    return hive.inbox(godId).filter((m) => !SYSTEM_SENDERS.includes(m.from)).length;
  } catch { return 0; }
}

/** Re-engage a quiet floor: drop a durable digest into god's inbox. */
function reengageGod(digest: string): void {
  if (!hive.enabled()) return;
  hive.send({ to: 'god', act: 'request', subject: 'Heartbeat', body: digest }, 'heartbeat');
}

/** Build the heartbeat re-engage digest. */
function buildHeartbeatDigest(quietMs: number, actionable = 0): string {
  const reg = hive.registry();
  const active = Object.entries(reg.agents).filter(([id, a]) => !a.archived && id !== reg.godId);
  const names = active.map(([, a]) => a.name).join(', ') || '—';
  const boardHead = hive.board().split('\n').slice(0, 10).join('\n').trim();
  const log = hive.logTail(8).map((e) => { try { return JSON.stringify(e); } catch { return ''; } }).filter(Boolean).join('\n');
  const withInbox = active.filter(([id]) => hive.inbox(id).length > 0).map(([, a]) => a.name);
  const header = actionable > 0
    ? `Floor heartbeat — ${actionable} actionable inbox message(s) awaiting you (worker/human mail). Drain your inbox NOW and act on them.`
    : `Floor heartbeat — quiet ~${Math.round(quietMs / 60000)}m.`;
  return [
    header,
    `Active agents (${active.length}): ${names}.`,
    withInbox.length ? `Undrained inbox: ${withInbox.join(', ')}.` : 'No undrained inboxes.',
    '',
    'Board (head):',
    boardHead || '(empty)',
    '',
    'Recent log:',
    log || '(none)',
    '',
    'Re-engage anyone stalled or blocked and keep the board accurate — or rest if the work is genuinely done.'
  ].join('\n');
}

/** Arm the heartbeat with an adaptive, self-rescheduling cadence. Registered
 *  into `missionTimers` so shutdown tears it down. */
function armHeartbeat(m: ScheduledMission): void {
  const base = m.intervalMs;
  const quiet = m.quietThresholdMs ?? 300_000;
  const beat = (): void => {
    let next = base;
    try {
      const actionable = godActionableInboxCount();
      if (isFloorQuiet(quiet) || actionable > 0) {
        reengageGod(buildHeartbeatDigest(quiet, actionable));
        next = Math.round(base * 2.5);
      } else if (looksStuck(quiet)) {
        next = Math.max(30_000, Math.round(base / 4));
      }
      const cur = readConfig().missions ?? [];
      writeConfig({ missions: cur.map((x) => (x.id === m.id ? { ...x, lastFiredAt: Date.now() } : x)) });
      deps.send('missions:updated', undefined);
    } catch (e) {
      console.error('[heartbeat]', e);
    }
    const entry = missionTimers.get(m.id) ?? {};
    entry.timeout = setTimeout(beat, next);
    missionTimers.set(m.id, entry);
  };
  const remaining = Math.max(0, base - (Date.now() - (m.lastFiredAt ?? 0)));
  missionTimers.set(m.id, { timeout: setTimeout(beat, remaining) });
}

/** Rebuild the mission scheduler from persisted config. */
function syncMissions(): void {
  clearMissionTimers();
  const missions = readConfig().missions ?? [];
  for (const m of missions) {
    if (!m.enabled || !(m.intervalMs > 0)) continue;
    if (m.kind === 'heartbeat') { armHeartbeat(m); continue; }
    const fire = (): void => {
      try {
        if (m.kind !== 'compact' && hive.enabled()) {
          hive.send({ to: m.to, act: 'request', subject: m.label, body: m.body }, 'scheduler');
        }
        if (m.autoCompact || m.kind === 'compact') {
          emitContextTrigger('compact', contextRule('compact'));
        }
        const current = readConfig().missions ?? [];
        const next = current.map((x) =>
          x.id === m.id ? { ...x, lastFiredAt: Date.now() } : x
        );
        writeConfig({ missions: next });
        deps.send('missions:updated', undefined);
      } catch (e) {
        console.error('[scheduler] mission', m.id, e);
      }
    };
    const remaining = Math.max(0, m.intervalMs - (Date.now() - (m.lastFiredAt ?? 0)));
    const entry: MissionTimer = {};
    entry.timeout = setTimeout(() => {
      fire();
      entry.interval = setInterval(fire, m.intervalMs);
    }, remaining);
    missionTimers.set(m.id, entry);
  }
}

function contextRunMap(): Record<string, number> {
  if (!contextLastRun) {
    try { contextLastRun = persist.getKv<Record<string, number>>(CONTEXT_LAST_RUN_KV_KEY) ?? {}; }
    catch { contextLastRun = {}; }
  }
  return contextLastRun;
}

function contextLastRunAt(action: 'compact' | 'clear'): number {
  const map = contextRunMap();
  const v = map[action];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return stampContextRun(action);
}

function stampContextRun(action: 'compact' | 'clear'): number {
  const map = contextRunMap();
  const at = Date.now();
  map[action] = at;
  try { persist.setKv(CONTEXT_LAST_RUN_KV_KEY, map); } catch { /* DB best-effort */ }
  return at;
}

function contextRule(action: 'compact' | 'clear'): ContextRule {
  return readConfig().contextTrigger?.[action] ?? DEFAULT_CONTEXT_TRIGGER[action];
}

function clearContextTimers(): void {
  for (const t of contextTimers.values()) {
    if (t.timeout) clearTimeout(t.timeout);
    if (t.interval) clearInterval(t.interval);
  }
  contextTimers.clear();
}

/** Ask the renderer to run one half of the context trigger. */
function emitContextTrigger(action: 'compact' | 'clear', rule: ContextRule): void {
  deps.send('trigger:context', { action, rule });
  if (action === 'compact') {
    deps.send('mission:autoCompact', undefined);
  }
}

/** (Re)arm both context timers from persisted config. */
function syncContextTriggers(): void {
  clearContextTimers();
  for (const action of ['compact', 'clear'] as const) {
    const rule = contextRule(action);
    if (!rule.enabled || !(rule.everyMs > 0)) continue;
    const fire = (): void => {
      try {
        stampContextRun(action);
        emitContextTrigger(action, contextRule(action));
      } catch (e) {
        console.error('[triggers] context', action, e);
      }
    };
    const remaining = Math.max(0, rule.everyMs - (Date.now() - contextLastRunAt(action)));
    const entry: MissionTimer = {};
    entry.timeout = setTimeout(() => {
      fire();
      entry.interval = setInterval(fire, rule.everyMs);
    }, remaining);
    contextTimers.set(action, entry);
  }
}

/** Startup migration (#57/#58): archive every agent entry that is
 *  `archived:false` but has NO live PTY. */
function archiveOrphanedAgents(): void {
  if (!hive.enabled()) return;
  try {
    const reg = hive.registry();
    for (const [id, a] of Object.entries(reg.agents)) {
      if (a.archived) continue;
      if (id === reg.godId) continue;
      if (ptyForAgent(id)) continue;
      hive.setArchived(id, true);
      console.log('[migration] archived orphaned agent (no live PTY):', id);
    }
  } catch (e) {
    console.error('[migration] archiveOrphanedAgents failed:', e);
  }
}

/** One-time migration: ensure the built-in hourly ops standup + heartbeat exist,
 *  and retire the old compact-maintenance mission into the context trigger. */
function ensureDefaultMissions(): void {
  const cfg = readConfig();
  if (!cfg.opsStandupSeeded) {
    const missions = cfg.missions ?? [];
    const has = missions.some((m) => m.id === OPS_STANDUP_MISSION.id);
    writeConfig({
      missions: has ? missions : [...missions, { ...OPS_STANDUP_MISSION, lastFiredAt: Date.now() }],
      opsStandupSeeded: true
    });
  }
  const cfg2 = readConfig();
  if (!cfg2.heartbeatSeeded) {
    const missions = cfg2.missions ?? [];
    const has = missions.some((m) => m.id === HEARTBEAT_MISSION.id);
    writeConfig({
      missions: has ? missions : [...missions, { ...HEARTBEAT_MISSION, lastFiredAt: Date.now() }],
      heartbeatSeeded: true
    });
  }
  const cfg3 = readConfig();
  const missions3 = cfg3.missions ?? [];
  const retiring = missions3.find((m) => m.id === COMPACT_MAINTENANCE_MISSION.id);
  if (retiring) {
    const current = cfg3.contextTrigger ?? DEFAULT_CONTEXT_TRIGGER;
    writeConfig({
      missions: missions3.filter((m) => m.id !== COMPACT_MAINTENANCE_MISSION.id),
      contextTrigger: {
        ...current,
        compact: {
          ...current.compact,
          enabled: retiring.enabled,
          everyMs: retiring.intervalMs > 0 ? retiring.intervalMs : current.compact.everyMs
        }
      },
      compactMaintenanceSeeded: true
    });
    if (typeof retiring.lastFiredAt === 'number' && retiring.lastFiredAt > 0) {
      const map = contextRunMap();
      map.compact = retiring.lastFiredAt;
      try { persist.setKv(CONTEXT_LAST_RUN_KV_KEY, map); } catch { /* DB best-effort */ }
    }
    console.log('[triggers] retired the compact-maintenance mission into contextTrigger.compact',
      `(enabled: ${retiring.enabled}, everyMs: ${retiring.intervalMs})`);
  }
  const cfg4 = readConfig();
  const missions4 = cfg4.missions ?? [];
  if (missions4.some((m) => m.autoCompact)) {
    writeConfig({
      missions: missions4.map(({ autoCompact, ...rest }) => {
        void autoCompact;
        return rest;
      })
    });
    console.log('[triggers] dropped the legacy per-mission autoCompact flag —',
      'contextTrigger.compact is now the only schedule that compacts');
  }
}

/** #35 — bound board.md so god's shared plan does not grow unbounded (god
 *  re-reads it every turn). Backup → deterministic condense → verify-don't-
 *  trust → atomic swap; a rejected pass costs nothing and leaves no litter. */
function condenseBoardIfOversized(): void {
  const root = hive.root();
  if (!root) return;
  const board = join(root, 'board.md');
  let oldBytes = 0;
  try { oldBytes = statSync(board).size; } catch { return; }
  if (oldBytes <= BOARD_BUDGET_BYTES) return;
  const now = Date.now();
  if (now - lastBoardCondenseAt < BOARD_CONDENSE_RETRY_MS) return;
  lastBoardCondenseAt = now;

  let original: string;
  try { original = readFileSync(board, 'utf8'); } catch { return; }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const archiveRef = `backups/${stamp}/board.md`;
  const rebuilt = condenseBoardText(original, archiveRef);
  if (!rebuilt) {
    console.warn(`[board] ${Math.round(oldBytes / 1024)}KB and over budget, but it has`,
      `${BOARD_KEEP_SECTIONS} or fewer '## ' sections — nothing to evict.`);
    return;
  }
  const verdict = verifyBoard({ rebuilt, original, keep: BOARD_KEEP_SECTIONS });
  if (!verdict.ok) {
    console.error('[board] condense REJECTED by the verify gate:', verdict.reason);
    try { hive.appendLog({ kind: 'board-condense-abort', reason: verdict.reason, oldBytes }); }
    catch { /* best-effort */ }
    return;
  }
  const backup = join(root, 'backups', stamp, 'board.md');
  try {
    mkdirSync(dirname(backup), { recursive: true });
    copyFileSync(board, backup);
  } catch (e) {
    console.error('[board] backup failed — leaving board.md untouched:', e);
    return;
  }
  try {
    const tmp = `${board}.tmp-${randomBytes(4).toString('hex')}`;
    writeFileSync(tmp, rebuilt, 'utf8');
    renameSync(tmp, board);
  } catch (e) {
    console.error('[board] atomic swap failed — board.md left as it was:', e);
    return;
  }
  const newBytes = Buffer.byteLength(rebuilt, 'utf8');
  console.log(`[board] condensed ${Math.round(oldBytes / 1024)}KB → ${Math.round(newBytes / 1024)}KB (backup: ${archiveRef})`);
  try { hive.appendLog({ kind: 'board-condense', oldBytes, newBytes, backup: archiveRef }); }
  catch { /* best-effort */ }
}

function notifyTriggerHistoryUpdated(): void {
  deps.send('triggerHistory:updated', undefined);
}

function seedWebhookOutbound(): Set<string> {
  const seen = new Set<string>();
  try {
    for (const e of listTriggerHistory()) {
      if (e.direction === 'outbound' && e.taskId) seen.add(e.taskId);
    }
  } catch { /* unreadable ledger → treat as empty; appends are still deduped by taskId */ }
  return seen;
}

function pollWebhookDoneTasks(): void {
  let tasks: HiveTask[];
  try {
    const ledger = hive.tasks() as { tasks?: HiveTask[] };
    tasks = Array.isArray(ledger?.tasks) ? ledger.tasks : [];
  } catch { return; }
  const done = tasks.filter((t) =>
    t.status === 'done' && (t.webhook != null || t.id.startsWith('webhook-')));
  if (done.length === 0) return;
  const recorded = webhookOutboundRecorded ?? (webhookOutboundRecorded = seedWebhookOutbound());
  const fresh = done.filter((t) => !recorded.has(t.id));
  if (fresh.length === 0) return;

  const history = listTriggerHistory();
  let wrote = false;
  for (const t of fresh) {
    const inbound = history.find((e) => e.direction === 'inbound' && e.taskId === t.id);
    if (!inbound) { recorded.add(t.id); continue; }
    appendTriggerHistory({
      source: inbound.source,
      sourceId: inbound.sourceId,
      sourceName: inbound.sourceName,
      direction: 'outbound',
      peer: inbound.peer,
      title: t.title,
      body: (t.result ?? '').trim() || '(finished with no result recorded)',
      kind: inbound.kind,
      correlationId: inbound.correlationId,
      taskId: t.id
    });
    recorded.add(t.id);
    wrote = true;
  }
  if (wrote) notifyTriggerHistoryUpdated();
}

/** Begin watching the kanban for webhook-origin done-transitions (idempotent). */
export function startWebhookDoneObserver(): void {
  if (webhookDoneTimer) return;
  webhookOutboundRecorded = seedWebhookOutbound();
  webhookDoneTimer = setInterval(() => {
    try { pollWebhookDoneTasks(); } catch (e) { console.error('[webhook] done-observer:', e); }
  }, 5000);
}

/** Stop watching the kanban. Safe to call when not running. */
function stopWebhookDoneObserver(): void {
  if (webhookDoneTimer) { clearInterval(webhookDoneTimer); webhookDoneTimer = null; }
  webhookOutboundRecorded = null;
}

/**
 * FLOOR-02 one-shot migration: the renderer used to own the MD queue and
 * mirrored it into roster.json's `queues` field. Adopt it into the main-owned
 * delivery queue exactly once per hive (guarded on the queue file's absence),
 * so an upgrade never silently drops parked messages.
 */
export function adoptRendererQueues(): void {
  try {
    const home = readConfig().harnessHome;
    if (!home) return;
    if (existsSync(join(home, 'delivery-queue.json'))) return;
    const queues = roster.read()?.queues;
    if (!queues) return;
    let adopted = 0;
    for (const [agentId, items] of Object.entries(queues)) {
      for (const m of (Array.isArray(items) ? items : []) as Partial<QueuedDelivery>[]) {
        if (typeof m?.text !== 'string' || !m.text.trim()) continue;
        const res = delivery.enqueue({
          agentId,
          text: m.text,
          ...(m.slack ? { slack: m.slack } : {}),
          ...(m.instruction ? { instruction: m.instruction } : {})
        });
        if (res.ok) adopted += 1;
      }
    }
    if (adopted) console.log(`[delivery] adopted ${adopted} message(s) parked by the renderer`);
  } catch (e) {
    console.error('[delivery] queue adoption failed', e);
  }
}

// ─── SHUTDOWN_STEPS — the exact inverse of bootFloor's construction, as ONE
//     declarative list (#34: two hand-maintained teardown paths had drifted —
//     a reset left the public tunnel open and every qwen sidecar running
//     against a wiped hive). Slack/webhook-tunnel teardown and the ephemeral
//     worker watcher stay index.ts-owned (their START calls never lived in
//     bootstrapHiveServices either — they're config-gated in whenReady, or, for
//     the worker watcher, coupled to spawnAgentCore) — index.ts's own thin
//     shutdown wrapper calls `floor.shutdown()` plus those two/three steps. ──
const SHUTDOWN_STEPS: ReadonlyArray<{ name: string; stop: () => void }> = [
  { name: 'clearMissionTimers', stop: () => clearMissionTimers() },
  { name: 'clearContextTimers', stop: () => clearContextTimers() },
  // NOT in the original SHUTDOWN_STEPS list either — a real gap (RESEARCH:
  // "Timers that are not unref'd and must be cleared by Floor.shutdown()").
  // Un-cleared, these two setIntervals keep the process alive after shutdown,
  // which is exactly what T-P02-02-05 exists to catch (the boot test's
  // explicit shutdown case fails by HANGING, not by a red assertion).
  {
    name: 'clearAlwaysOnBeats',
    stop: () => {
      if (fleetTimer) clearInterval(fleetTimer);
      fleetTimer = null;
      if (breakerBeatTimer) clearInterval(breakerBeatTimer);
      breakerBeatTimer = null;
    }
  },
  { name: 'stopWebhookDoneObserver', stop: () => stopWebhookDoneObserver() },
  { name: 'broker.stop', stop: () => integrationBroker.stop() },
  { name: 'stopRouter', stop: () => hive.stopRouter() },
  { name: 'hookServer.stop', stop: () => hookServer.stop() },
  { name: 'telemetry.stop', stop: () => telemetry.stop() },
  { name: 'memory.stop', stop: () => memory.stop() },
  { name: 'reflector.stop', stop: () => reflector.stop() },
  { name: 'delivery.stop', stop: () => delivery.stop() },
  { name: 'stopAllProxyBridges', stop: () => hive.stopAllProxyBridges() },
  { name: 'persist.close', stop: () => persist.close() },
  { name: 'killAll', stop: () => ptyManager.killAll() }
];

/** Run the whole list, best-effort: a throw in one step must never abort the
 *  rest. */
function shutdown(): void {
  for (const step of SHUTDOWN_STEPS) {
    try { step.stop(); } catch (e) { console.error(`[floor shutdown] ${step.name}:`, e); }
  }
}

// ─── bootFloor — the composition root ────────────────────────────────────

/**
 * Construct and start the whole floor: every subsystem `index.ts` used to
 * build at module scope, then `bootstrapHiveServices()`'s tail, in the SAME
 * topological order (initialization order IS the dependency graph — hive is
 * read by telemetry's resolveCwd, by breaker's config thunk, by accountPool's
 * liveAgents, by delivery's liveAgents, by hookServer, by memory, by reflector).
 *
 * `respawnCore` (spawnAgentCore) and `startWorkerWatcher` are the two pieces of
 * `bootstrapHiveServices()`'s original body that stay index.ts-owned — the
 * first spawns real PTYs/webContents and is too large/IPC-shaped to relocate,
 * the second is its caller. Both are threaded through {@link FloorDeps} so
 * ordering and behavior stay identical; the boot test's fakes simply never
 * spawn a real PTY (`PtyManager` — construct only, NEVER `spawn()`).
 */
export async function bootFloor(d: FloorDeps): Promise<Floor> {
  deps = d;

  ptyManager = new PtyManager();

  ptyToAgent = new Map<string, string>();
  hive = new HiveManager(
    () => readConfig().harnessHome,
    (channel, payload) => deps.send(channel, payload)
  );
  control = new ControlRegistry();
  telemetry = new TelemetryCollector({
    emit: (channel: string, payload: unknown) => { deps.send(channel, payload); },
    resolveCwd: (agentId: string) => hive.registry().agents[agentId]?.cwd ?? null
  });
  breaker = new CircuitBreaker(() => {
    const c = readConfig();
    return { ...(c.circuitBreaker ?? {}), costCapUsd: c.costCapUsd, costCapTokens: c.costCapTokens, agentTokenCaps: c.agentTokenCaps };
  });
  telemetry.onApiError((agentId: string) => breaker.recordError(agentId));

  accountPool = new AccountPoolManager({
    statePath: () => join(deps.paths().userData, 'claude-account-pool.json'),
    accounts: () => readConfig().claudeAccounts ?? [],
    tokenPresent: (id) => integrations.hasSecret(claudeAccountSecretRef(id)),
    liveAgents: () => Object.entries(hive.enabled() ? hive.registry().agents : {})
      .filter(([id, a]) => !a.archived && isClaudeProvider(a.provider ?? 'claude') && !!ptyForAgent(id))
      .map(([id, a]) => ({ agentId: id, name: a.name, account: a.account })),
    emit: (channel, payload) => {
      if (channel === 'claudeAccount:failover') {
        const plan = payload as { reason?: string; switches?: AccountSwitch[] };
        delivery.failover(plan.switches ?? [], plan.reason ?? 'account failover');
        return;
      }
      deps.send(channel, payload);
    },
    alert: (title, body) => breakerToast(title, body),
    sanitize: redactSecrets
  });
  telemetry.onApiError((agentId: string, info: unknown) => accountPool.handleApiError(agentId, info as never));
  telemetry.onAgentUsage((sample: unknown) => accountPool.recordUsage(sample as never));

  worktreePaths = new Map<string, string>();
  worktreeOrigins = new Map<string, string>();
  worktreeBases = new Map<string, string>();
  spawnRecipes = new Map<string, { opts: AgentSpawnOptions; owner: Electron.WebContents | null }>();
  liveWorkers = new Map<string, WorkerRec>();
  preservedWorktrees = new Map<string, PreservedWorktree>();
  missionTimers = new Map<string, MissionTimer>();
  contextTimers = new Map<'compact' | 'clear', MissionTimer>();
  lastBoardCondenseAt = 0;
  lastUnsafeSidWarn = 0;
  contextLastRun = null;
  fleetTimer = null;
  breakerBeatTimer = null;
  webhookDoneTimer = null;
  webhookOutboundRecorded = null;

  delivery = new DeliveryService({
    liveAgents: (): LiveAgentPty[] => {
      if (!hive.enabled()) return [];
      const ptys = new Map(ptyManager.list().map((p) => [p.id, p]));
      const out: LiveAgentPty[] = [];
      for (const [id, a] of Object.entries(hive.registry().agents)) {
        if (a.archived || a.isAssistant) continue;
        const ptyId = ptyForAgent(id);
        const p = ptyId ? ptys.get(ptyId) : undefined;
        if (!ptyId || !p) continue;
        out.push({
          agentId: id,
          ptyId,
          provider: inferAgentProvider(p.command, a.provider),
          hasOutput: p.hasOutput,
          idleMs: Math.max(0, Date.now() - p.lastOutputAt),
          lastOutputAt: p.lastOutputAt
        });
      }
      return out;
    },
    inbox: (agentId) => (hive.enabled() ? hive.inbox(agentId).map((m) => ({ id: m.id, from: m.from })) : []),
    write: (ptyId, data) => ptyManager.write(ptyId, data),
    paused: (agentId) => control.isAutoDeliveryPaused(agentId),
    drain: (agentId) => {
      if (!hive.enabled()) return { block: false };
      const before = readDeliveryCursor(agentId);
      const pending = hive.inbox(agentId).filter((m) => !before || m.id > before);
      const res = hive.drainForStop(agentId);
      return { ...res, delivered: res.block ? pending.map((m) => ({ id: m.id, from: m.from })) : [] };
    },
    respawn: respawnOnAccount,
    queuePath: () => {
      const home = readConfig().harnessHome;
      return home ? join(home, 'delivery-queue.json') : null;
    },
    knownAgent: (agentId) => {
      if (!hive.enabled()) return false;
      const a = hive.registry().agents[agentId];
      return !!a && !a.archived;
    },
    onQueueDelivered: (item) => {
      if (!item.slack || !hive.enabled()) return;
      const title = item.text.length > 80 ? `${item.text.slice(0, 79)}…` : item.text;
      hive.addTask({
        id: `slack-${item.slack.thread_ts}-${item.id}`,
        title,
        description: item.text,
        status: 'todo',
        dependsOn: [],
        priority: 1,
        createdAt: new Date().toISOString(),
        slack: item.slack
      });
    },
    breakerLevel: (agentId) => breaker.levelFor(agentId),
    setStatus: (agentId, status) => {
      if (!hive.enabled()) return;
      hive.appendLog({ kind: 'agent_quiesced', agentId, status, reason: 'pty_silent' });
    },
    emit: (channel, payload) => { deps.send(channel, payload); }
  });

  hookServer = new HookServer(
    hive, () => fakeWebContents(), () => readConfig(), control, breaker,
    (agentId) => delivery.drainAtStop(agentId),
    (agentId) => deps.focus?.(agentId),
    (s) => telemetry.recordCostSample(s)
  );
  ptyManager.setHookTokenSource(
    (agentId) => hookServer.mintToken(agentId),
    (token) => hookServer.revokeToken(token)
  );
  ptyManager.setOtelTokenSource(
    (agentId) => telemetry.mintAgentToken(agentId),
    (token) => telemetry.revokeAgentToken(token)
  );

  memory = new MemoryManager(
    () => readConfig().harnessHome,
    () => { const c = readConfig(); return { enabled: c.semanticMemory !== false, model: c.embeddingModel ?? 'minilm' }; },
    () => persist,
    (agentId) => hive.registry().agents[agentId]?.cwd ?? null
  );
  reflector = new MemoryReflector(
    () => readConfig().harnessHome,
    () => readConfig().defaultCommand ?? 'claude',
    () => memory.env(),
    reflectSettings,
    (event) => { try { hive.appendLog(event); } catch { /* best-effort */ } }
  );
  persist = new PersistStore();
  integrationBroker = new IntegrationBroker({
    getRecord: integrations.getRecord,
    getSecret: integrations.getSecret
  });
  roster = new RosterStore(() => readConfig().harnessHome);

  try { persist.open(); } catch (e) { console.error('[db] open failed:', e); }
  try { accountPool.load(); } catch (e) { console.error('[account-pool] load failed:', e); }

  startHiveServices();

  return {
    hive, delivery, hookServer, telemetry, persist, ptyManager, control, breaker,
    memory, reflector, accountPool, integrationBroker, roster,
    ptyToAgent, worktreePaths, worktreeOrigins, worktreeBases, preservedWorktrees,
    spawnRecipes, missionTimers, contextTimers, liveWorkers,
    shutdown,
    teardownAndQuit: () => { shutdown(); deps.quit(); }
  };
}

/**
 * `bootstrapHiveServices()`'s tail, verbatim order — split out of `bootFloor`
 * because it is genuinely re-invoked against the ALREADY-CONSTRUCTED floor, not
 * just called once at boot: `config:update` (index.ts) re-arms it the moment
 * onboarding sets `harnessHome` (the hive/delivery/etc. instances already exist,
 * just `!hive.enabled()` until now), and `config:changeHome` re-arms it to
 * recover IN PLACE when a folder-move copy fails, after tearing the same
 * services down. Neither path wants a SECOND `new HiveManager(...)` etc. —
 * that would leak the old hookServer/telemetry HTTP listeners and orphan their
 * timers, since `bootFloor`'s construction resets `fleetTimer`/`breakerBeatTimer`
 * to null without clearing whatever the previous instance was already holding.
 * No-op without a home (mirrors `bootstrapHiveServices`'s own early return).
 */
export function startHiveServices(): void {
  if (!hive.enabled()) return;
  hive.ensureHive();
  loadPreservedWorktrees();
  control.replaceAutoDeliveryPauses(readConfig().autoDeliveryPausedAgents ?? []);
  archiveOrphanedAgents();
  hive.startRouter();
  deps.startWorkerWatcher?.();
  void integrationBroker.start().then((r) => {
    if (r.ok) console.log('[broker] integration broker listening on', integrationBroker.url());
    else console.error('[broker] failed to start:', r.error);
  });
  ensureDefaultMissions();
  syncMissions();
  syncContextTriggers();
  if ((readConfig().webhookTriggers ?? []).length > 0) startWebhookDoneObserver();
  hookServer.start();
  void telemetry.start().then((r: { ok: boolean; endpoint?: string; error?: string }) => {
    if (r.ok && r.endpoint) { hive.setOtelEndpoint(r.endpoint); console.log('[telemetry] collector listening', r.endpoint); }
    else console.error('[telemetry] collector failed to start:', r.error);
  });
  memory.start();
  reflector.start();
  delivery.start();
  adoptRendererQueues();

  armAlwaysOnBeats();
}

export {
  teardownPty, respawnOnAccount, informGod, syncMissions, syncContextTriggers,
  archiveOrphanedAgents, ensureDefaultMissions, breakerToast, condenseBoardIfOversized,
  ptyForAgent, isFloorQuiet, lastCoordinationAt, looksStuck, readDeliveryCursor,
  notifyTriggerHistoryUpdated, savePreservedWorktrees, clearMissionTimers,
  clearContextTimers, stopWebhookDoneObserver, shutdown, removeWorkerScratch,
  SHUTDOWN_STEPS
};
