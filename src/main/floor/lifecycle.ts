/**
 * lifecycle.ts — the agent-teardown state machine, as free functions over an
 * explicitly injected `AgentTeardownDeps` object. `hiveProvisioning.ts`'s
 * register: a private method becomes a free function taking its inputs
 * explicitly, so it is reachable and testable with no Electron binary.
 *
 * Deliberately free of any `electron` import so `node --test` can drive the
 * whole state machine with fakes (test/agent-lifecycle.test.cjs). Everything
 * genuinely Electron-shaped — `syncKeepAwake`'s body reads `powerSaveBlocker`
 * from `electron` — stays outside this file and arrives as an injected
 * callback ({@link AgentTeardownDeps.syncKeepAwake}), never imported here.
 *
 * ADR-0003 is the invariant every function below carries across the move:
 * when we cannot prove a worktree's work is safe to discard, we keep it. The
 * fail-safe polarity is unchanged from `src/main/floor/boot.ts` — same order
 * of steps, same try/catch per step, same comments, moved verbatim rather
 * than re-derived.
 */
import { join, resolve, basename } from 'node:path';
import { rmSync } from 'node:fs';
import { worktreeHasUnintegratedWork, removeWorktree } from './../git';

/** A live god-triggered ephemeral worker, tracked from spawn to teardown.
 *  Moved from `boot.ts` — nothing outside `src/main/floor/**` names this type
 *  (verified: no reference in `index.ts` or any other `src/main` file), so
 *  the move has no call-site fallout. `boot.ts` imports it back. */
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

/** A worker worktree that teardown PRESERVED because it held unintegrated
 *  work. Moved from `boot.ts` for the same reason as {@link WorkerRec}. */
export interface PreservedWorktree {
  workerId: string;
  wtPath: string;
  origCwd: string;
  baseBranch: string;
  scratchDir: string | null;
  slack?: { channel: string; thread_ts: string };
  preservedAt: number;
}

/**
 * Every collaborator `teardownPty` and its two worktree finalizers need,
 * injected explicitly rather than closed over module state — the shape
 * `hiveProvisioning.ts` already established for a private method becoming a
 * free function. Sixteen fields, each named in `02-03-PLAN.md`'s own
 * `<interfaces>` measurement of `teardownPty`'s dependency surface.
 */
export interface AgentTeardownDeps {
  /** Revoke this PTY's per-agent hook/OTEL grants (IntegrationBroker). */
  integrationBroker: { revoke: (id: string) => void };
  /** ptyId → agentId. `teardownPty` deletes the entry and reads the agent id
   *  off it before any other step runs. */
  ptyToAgent: Map<string, string>;
  /** Forget this agent's circuit-breaker state (CircuitBreaker.forget). */
  breaker: { forget: (agentId: string) => void };
  /** Forget this agent's pause/gate state (ControlRegistry.forget). */
  control: { forget: (agentId: string) => void };
  /** Forget this agent's cost/usage tracking (TelemetryCollector.forget). */
  telemetry: { forget: (agentId: string) => void };
  /** The hive registry surface teardown touches: stop a live proxy-tier
   *  sidecar, read whether the hive is enabled at all, and archive the
   *  agent so it can no longer receive mail (id-reuse safety, #14: ids are
   *  REUSED, so a stale un-archived entry would deny every PreToolUse of a
   *  fresh session spawned with the same id). `root()` is read by
   *  {@link workerScratchDir}. */
  hive: {
    stopProxyBridge: (agentId: string) => void;
    enabled: () => boolean;
    setArchived: (agentId: string, archived: boolean) => void;
    root: () => string | null;
  };
  /** ptyId → its isolated worktree's absolute path. */
  worktreePaths: Map<string, string>;
  /** ptyId → the ORIGINAL cwd its worktree was created from (the `git
   *  worktree remove` invocation runs there, not inside the worktree
   *  itself). */
  worktreeOrigins: Map<string, string>;
  /** ptyId → the base branch its worktree's unintegrated-work check compares
   *  against; defaults to `'main'` when absent. */
  worktreeBases: Map<string, string>;
  /** ptyId → its `WorkerRec`, when the pty belongs to a god-triggered
   *  ephemeral worker rather than a normal agent — this Map's presence is
   *  the branch between {@link finalizeWorkerWorktree} and
   *  {@link finalizeAgentWorktree}. */
  liveWorkers: Map<string, WorkerRec>;
  /** Worker worktrees preserved because they held unintegrated work (ADR-0003).
   *  `finalizeWorkerWorktree` writes into it; `finalizeAgentWorktree`
   *  deliberately does NOT (a real agent's scratch dir is its memory/inbox,
   *  not a worker's disposable scratch — the asymmetry is the decision, not
   *  an oversight). */
  preservedWorktrees: Map<string, PreservedWorktree>;
  /** ptyId → its last successful spawn recipe (main-owned failover, #5).
   *  Only ever `.delete()`d here — its value shape is index.ts/boot.ts-local
   *  and irrelevant to teardown. */
  spawnRecipes: Map<string, unknown>;
  /** Drop everything the main-owned delivery queue remembers about this PTY
   *  (DeliveryService.forgetPty). */
  delivery: { forgetPty: (ptyId: string) => void };
  /** Re-evaluate the power-save blocker now that a PTY's liveness may have
   *  changed (issue #18). Injected because its body reads `powerSaveBlocker`
   *  from `electron` — this is the one thing that lets this WHOLE module
   *  load under `node --test` with no Electron binary. */
  syncKeepAwake: () => void;
  /** Persist the preserved-worktree ledger (#14: the in-memory Map alone
   *  drops an entry on a quit between "worker ended holding unintegrated
   *  work" and "that work landed" — the worktree then leaks with nothing
   *  left that knew it was reclaimable). Stays boot.ts-owned (index.ts's own
   *  GC sweep calls the same underlying function outside any teardown), so
   *  it is injected rather than moved. */
  savePreservedWorktrees: () => void;
  /** Send an inform to the god agent — the human's proxy, and the sole
   *  integrator for worktrees this module preserves. Stays boot.ts-owned
   *  (index.ts calls it directly too, for spawn-rejection notices unrelated
   *  to teardown), so it is injected rather than moved. */
  informGod: (subject: string, body: string, slack?: { channel: string; thread_ts: string }) => void;
}

/** The hive scratch dir for a worker (its inbox/outbox/memory):
 *  HIVE_ROOT/agents/<id>. */
export function workerScratchDir(workerId: string, deps: Pick<AgentTeardownDeps, 'hive'>): string | null {
  const root = deps.hive.root();
  return root ? join(root, 'agents', workerId) : null;
}

/** Best-effort removal of a worker's scratch (hive agent) dir. Guarded to
 *  ONLY ever delete a path that resolves to exactly HIVE_ROOT/agents/<workerId>
 *  and never a still-live worker. NOT one of `AgentTeardownDeps`'s own four
 *  named exports (`teardownPty` never calls it — the god-triggered ephemeral
 *  worker GC sweep in `index.ts` does, on a schedule, well after teardown),
 *  but it lives beside {@link workerScratchDir} because it is the same
 *  path-safety logic, moved together rather than split across two files.
 */
export function removeWorkerScratch(
  workerId: string,
  deps: Pick<AgentTeardownDeps, 'hive' | 'liveWorkers'>
): void {
  if (deps.liveWorkers.has(workerId)) return;
  const dir = workerScratchDir(workerId, deps);
  const root = deps.hive.root();
  if (!dir || !root) return;
  const agentsRoot = join(root, 'agents');
  if (resolve(dir) !== join(resolve(agentsRoot), basename(dir)) || basename(dir) !== workerId) return;
  try { rmSync(dir, { recursive: true, force: true }); }
  catch (e) { console.error('[worker] removeWorkerScratch failed:', e); }
}

/** Gated worktree teardown for an ephemeral worker: remove it ONLY when it
 *  holds no unintegrated work; otherwise leave it (and its branch) in place
 *  and ping god, the sole integrator. Fail-safe — any uncertainty KEEPS it. */
export async function finalizeWorkerWorktree(
  wtPath: string, origCwd: string, worker: WorkerRec, deps: AgentTeardownDeps
): Promise<void> {
  try {
    const work = await worktreeHasUnintegratedWork(wtPath, worker.baseBranch);
    if (work.keep) {
      console.warn(`[worker] PRESERVING worktree with unintegrated work: ${wtPath} (${work.detail})`);
      deps.preservedWorktrees.set(wtPath, {
        workerId: worker.workerId, wtPath, origCwd, baseBranch: worker.baseBranch,
        scratchDir: workerScratchDir(worker.workerId, deps), slack: worker.slack, preservedAt: Date.now()
      });
      deps.savePreservedWorktrees();
      deps.informGod(
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
    deps.preservedWorktrees.set(wtPath, {
      workerId: worker.workerId, wtPath, origCwd, baseBranch: worker.baseBranch,
      scratchDir: workerScratchDir(worker.workerId, deps), slack: worker.slack, preservedAt: Date.now()
    });
    deps.savePreservedWorktrees();
  } catch (e) {
    console.error('[worker] finalizeWorkerWorktree threw (worktree left in place):', e);
  }
}

/** Gated worktree teardown for a NORMAL (non-worker) isolated agent: remove
 *  it only when nothing would be lost. Deliberately does NOT register in
 *  `preservedWorktrees` — a real agent's scratch dir is its memory/inbox,
 *  not a worker's disposable scratch. */
export async function finalizeAgentWorktree(
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
export function teardownPty(id: string, deps: AgentTeardownDeps): void {
  try { deps.integrationBroker.revoke(id); } catch { /* best-effort */ }
  const agentId = deps.ptyToAgent.get(id);
  if (agentId) {
    deps.ptyToAgent.delete(id);
    try { deps.breaker.forget(agentId); } catch { /* best-effort */ }
    try { deps.control.forget(agentId); } catch { /* best-effort */ }
    try { deps.telemetry.forget(agentId); } catch { /* best-effort */ }
    try { deps.hive.stopProxyBridge(agentId); } catch (e) { console.error('[hive] stopProxyBridge failed:', e); }
    if (deps.hive.enabled()) {
      try { deps.hive.setArchived(agentId, true); } catch (e) { console.error('[hive] setArchived failed:', e); }
    }
  }
  const wtPath = deps.worktreePaths.get(id);
  if (wtPath) {
    const origCwd = deps.worktreeOrigins.get(id) ?? wtPath;
    deps.worktreePaths.delete(id);
    deps.worktreeOrigins.delete(id);
    const worker = deps.liveWorkers.get(id);
    const baseBranch = deps.worktreeBases.get(id) ?? 'main';
    deps.worktreeBases.delete(id);
    if (worker) {
      deps.liveWorkers.delete(id);
      void finalizeWorkerWorktree(wtPath, origCwd, worker, deps);
    } else {
      void finalizeAgentWorktree(id, wtPath, origCwd, baseBranch);
    }
  }
  if (deps.liveWorkers.has(id)) deps.liveWorkers.delete(id);
  deps.spawnRecipes.delete(id);
  deps.delivery.forgetPty(id);
  deps.syncKeepAwake();
}

/** The collaborators {@link releaseWorkerPty} needs. Deliberately NARROW rather
 *  than the full {@link AgentTeardownDeps}: index.ts holds the bound
 *  `floor?.teardownPty` (boot.ts owns the dep set), not the dep set itself. */
export interface WorkerReleaseDeps {
  /** `PtyManager.kill` — returns `{ ok:false }` on failure and NEVER throws. */
  killPty: (id: string) => { ok: boolean; error?: string };
  /** The bound {@link teardownPty} (`floor?.teardownPty` at the call site). */
  teardownPty: (id: string) => void;
  liveWorkers: Map<string, WorkerRec>;
}

/**
 * Release a live ephemeral worker: kill its PTY, then run teardown
 * UNCONDITIONALLY — exactly what `pty:kill` and `killAgent` already do.
 *
 * The unconditional teardown is load-bearing, not belt-and-braces. `kill()`
 * deletes the session from `PtyManager.sessions` BEFORE node-pty's `onExit`
 * fires, and that callback's identity guard (`sessions.get(id) !== session`)
 * then returns early — so the exit handler NEVER reaches teardown for an
 * EXPLICIT kill. `killByOwner`'s own comment says so: "kill()'s callers all
 * follow it with teardownPty". The worker paths did not, so every stop left
 * its record in `liveWorkers` with `releasing = true`: the reap loop skips it
 * (`if (rec.releasing) continue`), a repeat `workers:stop` answers `{ ok:true }`
 * for a worker that never died, and it holds a `maxConcurrentWorkers` slot
 * until the app restarts (MAIN-01).
 *
 * The kill result crosses back VERBATIM, so a manual stop reports the truth
 * about the process rather than the truth about our bookkeeping. If teardown
 * could not drop the record (no floor bound yet — `floor?.teardownPty` is a
 * no-op then), `releasing` is cleared so a later reap retries instead of
 * skipping it forever.
 */
export function releaseWorkerPty(workerId: string, deps: WorkerReleaseDeps): { ok: boolean; error?: string } {
  const res = deps.killPty(workerId);
  if (!res.ok) {
    console.error(`[worker] kill failed for ${workerId}: ${res.error ?? 'unknown'} — tearing down anyway to free its slot`);
  }
  deps.teardownPty(workerId);
  const rec = deps.liveWorkers.get(workerId);
  if (rec) rec.releasing = false;
  return res;
}
