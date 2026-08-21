/**
 * DeliveryService — the floor's autonomy loop, in the MAIN process.
 *
 * Everything here used to live in the renderer (`useHive.ts`): a 4 s inbox poll
 * that nudged agents holding unread mail, and the account-failover executor that
 * kills an agent and respawns it on a healthy account. Both died with the window.
 * Close the floor (macOS keeps the app alive), reload the renderer, or crash a
 * panel and no mail moved; a failover caught mid-switch left the agent killed and
 * never respawned — "switching…" forever (issue #5, upstream #151).
 *
 * So the decisions moved here, where the state outlives every renderer:
 *   - the inbox wake types the nudge itself (main owns the PTYs),
 *   - the Stop hook drains inbox mail as a guarded block-to-continue,
 *   - the failover kill→respawn runs to completion whatever the window does, and
 *     its re-entrancy guard (`switching`) is instance state on a service main
 *     constructs ONCE at boot — a renderer reload cannot forget it.
 *
 * The renderer keeps exactly one say in this: its draft/picker gate, reported up
 * as a VETO (`hive:deliveryVeto`). Main owns the decision; the renderer can only
 * say "not into this terminal right now, the human is typing in it". A veto is an
 * assertion with a lifetime (VETO_TTL_MS) — a renderer that dies mid-veto must
 * not wedge autonomy forever, which is the very failure this file exists to end.
 *
 * Deliberately free of any `electron` import so `node --test` can drive the whole
 * loop with fakes (test/delivery-main.test.cjs). All Electron/hive/PTY specifics
 * arrive through {@link DeliveryDeps}, wired in index.ts.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AgentProvider } from '../shared/agentProvider';
import { isCompactionCommand, terminalReadyToReceive } from '../shared/providerAutomation';
import {
  deliverWithAcknowledgement,
  nextForDelivery,
  noteAttempt,
  MAX_QUEUED_PER_AGENT,
  type QueuedDelivery
} from '../shared/queueDelivery';

export type { QueuedDelivery };

/** The queue as the renderer's pending list wants to read it: grouped by agent.
 *  Main owns the list; this is a VIEW pushed down on every mutation. */
export type QueueSnapshot = Record<string, QueuedDelivery[]>;

/** What a renderer producer may ask main to park. Everything else on a
 *  {@link QueuedDelivery} — its id, its timestamp, its attempt count — is
 *  minted here, because a renderer that picks its own ids can collide with
 *  another window's and with main's own. */
export interface EnqueueRequest {
  agentId: string;
  text: string;
  slack?: { channel: string; thread_ts: string };
  instruction?: string;
}

/** Every mutation returns the fresh snapshot, so a caller that just enqueued
 *  renders the new state without waiting for the push. Never throws — this is
 *  an IPC return value (CONVENTIONS.md: never throw across IPC). */
export interface QueueResult {
  ok: boolean;
  error?: string;
  id?: string;
  queues?: QueueSnapshot;
}

/** One live agent + its PTY, as the loop needs to see it. */
export interface LiveAgentPty {
  agentId: string;
  ptyId: string;
  provider: AgentProvider;
  /** True once the TUI has painted at least one frame (never type before this). */
  hasOutput: boolean;
  /** Milliseconds since this PTY last emitted a byte (ptyManager.idleFor). */
  idleMs: number;
  /** Epoch ms of this PTY's last byte, RAW — `0` means it has never emitted.
   *  `idleMs` cannot express that: a never-painted PTY and one quiet for an hour
   *  both read as "a long time", and the quiesce backstop must not flip the first. */
  lastOutputAt: number;
}

/** The subset of a hive message the loop cares about. */
export interface DeliverableMessage { id: string; from: string }

/** One account move planned by the pool (AccountPoolManager's FailoverSwitch). */
export interface AccountSwitch {
  agentId: string;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
}

export interface DeliveryDeps {
  /** Live, non-archived agents that own a PTY right now. */
  liveAgents: () => LiveAgentPty[];
  /** Unread messages in an agent's inbox (hive.inbox). */
  inbox: (agentId: string) => DeliverableMessage[];
  /** Raw PTY write (ptyManager.write). Never throws; reports `ok:false`. */
  write: (ptyId: string, data: string) => { ok: boolean; error?: string };
  /** Operator's auto-delivery pause for this agent (ControlRegistry). */
  paused: (agentId: string) => boolean;
  /**
   * The durable Stop-hook drain: advances the agent's cursor.json and returns the
   * continuation prompt. `delivered` lists the messages the cursor just passed,
   * so the renderer can be told what moved (index.ts computes it — the cursor and
   * the inbox both live behind HiveManager).
   */
  drain: (agentId: string) => { block: boolean; reason?: string; delivered?: DeliverableMessage[] };
  /** Kill the agent's PTY and respawn it on `account`, resuming its session. */
  respawn: (agentId: string, account: string) => Promise<{ ok: boolean; error?: string; account?: string }>;
  /** This agent's circuit-breaker level (CircuitBreaker.levelFor). The quiesce
   *  backstop must never fight the breaker pin: a constrained/stopped agent is
   *  deliberately held 'looping', not idle. Optional — a floor with no breaker
   *  reads every agent as healthy, exactly like `control`/`breaker` on HookServer. */
  breakerLevel?: (agentId: string) => string;
  /** The DURABLE half of a quiesce transition: record that this agent's turn is
   *  over. `emit` reaches a renderer that may not exist; this one has to work with
   *  the window closed, so index.ts points it at the hive log. Same split as
   *  `drain` (durable cursor advance) vs `emit('hive:delivered')` above. */
  setStatus?: (agentId: string, status: 'idle') => void;
  /**
   * Where the MAIN-OWNED delivery queue is persisted (FLOOR-02).
   *
   * A THUNK, not the `string` the plan drafted, and the difference is a real bug
   * rather than a preference: `index.ts` builds this service at module scope,
   * where `readConfig().harnessHome` is legitimately `null` before onboarding.
   * A string captured there would be `join(null-ish, …)` → a RELATIVE path, and
   * the queue would be written into whatever the process CWD happens to be —
   * and would then keep pointing there after the operator changes their hive
   * home in Settings. `null` means "no durable home yet", which disables the
   * queue rather than scattering it.
   *
   * Injected so a test can point the queue at a temp dir and read the bytes.
   */
  queuePath: () => string | null;
  /** Is this agent a live, addressable member of the floor? The enqueue handler
   *  resolves the recipient against MAIN's roster instead of trusting the id a
   *  renderer sent (T-P08-05). Optional: a floor with no roster source accepts
   *  any id, exactly like `breakerLevel` reads every agent as healthy. */
  knownAgent?: (agentId: string) => boolean;
  /**
   * A queued message just landed in a terminal.
   *
   * Exists because the Slack-origin kanban card used to be promoted by the
   * renderer, in the drain's `.then()` — and a card minted by the renderer is a
   * card that is not minted with the window closed, which is the state this
   * whole migration creates. `index.ts` owns the hive, so the promotion is wired
   * there rather than teaching this file about task cards.
   */
  onQueueDelivered?: (item: QueuedDelivery) => void;
  /** Send an event to the renderer (a no-op when no window is attached). */
  emit: (channel: string, payload: unknown) => void;
  log?: (...args: unknown[]) => void;
  now?: () => number;
  /** Injectable delay, so a test can drive the whole loop on a fake clock
   *  instead of actually waiting out a TUI settle + four Enter retries. */
  sleep?: (ms: number) => Promise<void>;
}

/** How often the inbox wake sweeps the floor. The renderer polled every 4 s; main
 *  reads the same files, so keep the cadence and let the idle gate do the work. */
const TICK_MS = 4_000;
/** A PTY quiet for this long is safe to type into. Deliberately generous: the
 *  child echoes the human's own keystrokes, so "quiet" also means "nobody has
 *  touched this terminal for 8 s" — the cheapest draft guard there is, and the
 *  one that keeps working when no renderer is attached to veto at all. */
const IDLE_MS = 8_000;
/**
 * PROVIDER-AGNOSTIC PTY-QUIESCENCE IDLE BACKSTOP (#5). Ported from the renderer
 * (`useHive.ts` effect 2e), which is where it could not do its job: it died with
 * the window.
 *
 * Why it exists at all, carried over verbatim from that effect's own note: hook
 * events are the authoritative status source, but a bridge whose turn-end signal
 * (Stop / session.idle / agent_end) never fires leaves the agent pinned 'working'.
 * `usePtyParser` has a 4 s idle drift that would catch it — but it only parses the
 * MOUNTED terminal, so a backgrounded (or unmounted, or window-less) agent gets
 * none. So an agent whose PTY has emitted NOTHING for QUIESCE_IDLE_MS is treated
 * as turn-done. Safe because a genuinely-working agent — a long streaming tool
 * included — keeps emitting bytes; a false idle self-corrects on the next hook.
 *
 * ADR-0001 (one gate for PTY writes) is untouched by this: the backstop writes
 * ZERO terminal bytes. It only announces a status transition. The wake nudge below
 * remains the single writer.
 */
const QUIESCE_IDLE_MS = 12_000;
/** The renderer polled the backstop on its own 4 s timer. Main does NOT get a
 *  second timer — the quiesce check rides the tick that already exists — so this
 *  is the cadence the tick must keep up with, not a timer of its own. Raising
 *  TICK_MS alone would silently stretch the backstop's latency, so `start()`
 *  clamps to whichever is shorter. */
const QUIESCE_POLL_MS = 4_000;
/** After a spawn/respawn, hold every typer off the agent while its TUI boots. */
const BOOT_GRACE_MS = 35_000;
/**
 * How long a renderer veto stands before main ignores it.
 *
 * ponytail: a TTL, not a liveness protocol. The renderer re-asserts while the
 * human is actually typing, so the only thing this bounds is a veto whose renderer
 * died — and "autonomy stalls for five minutes" beats "autonomy stalls until the
 * app restarts", which is exactly the class of bug this service exists to remove.
 * Upgrade path if it ever bites: clear a sender's vetoes on its webContents
 * `destroyed`/reload instead of on the clock.
 */
const VETO_TTL_MS = 5 * 60_000;
/** Pause between the pasted text and the Enter that submits it. */
const SUBMIT_GAP_MS = 140;
/** Ceiling on waiting for a freshly spawned TUI to paint before typing. */
const READY_TIMEOUT_MS = 30_000;
/** A freshly resumed TUI can swallow the Enter while it loads the transcript; on
 *  a still-parked agent an extra Enter is a harmless no-op on an empty input box
 *  and the missing submit on a parked line. Observed live (v0.4.5 PR 2). */
const RESUME_ENTER_RETRIES = 4;
const RESUME_ENTER_GAP_MS = 4_000;

/** The nudge an agent gets when unread inbox mail is waiting and it went quiet. */
const WAKE_NUDGE =
  'You have new hive inbox message(s) — read your inbox, act on them now, and move handled '
  + 'ones to inbox/.done/. Act autonomously; only message god if you genuinely need a decision.';

/**
 * Scrub text on its way into a live TUI — the same trust boundary as the
 * renderer's `sanitizePtyText` (#2): drop both bracketed-paste markers (a body
 * carrying ESC[201~ closes the paste early and the rest arrives as KEYSTROKES,
 * "\r" included) and every C0 control except the "\n"/"\t" real mail contains.
 *
 * DUPLICATED from src/renderer/src/hooks/useHive.ts on purpose: main now types
 * into PTYs too, and this cluster owns neither that file nor src/shared. See
 * `crossFileNeeds` — it belongs in src/shared/ptyText.ts with both callers on it.
 */
/** Process-unique suffix for a queued message id (the clock alone collides when
 *  several are parked inside one millisecond — the same reason the renderer
 *  store's `newQueuedId` carried a counter). */
let queueSeq = 0;

/** Is this parsed JSON actually a queue entry? The file is on disk where an
 *  agent, an editor or a half-finished write could have touched it. */
function isQueuedDelivery(v: unknown): v is QueuedDelivery {
  const m = v as Partial<QueuedDelivery> | null;
  return !!m && typeof m === 'object'
    && typeof m.id === 'string' && !!m.id
    && typeof m.agentId === 'string' && !!m.agentId
    && typeof m.text === 'string' && !!m.text
    && typeof m.ts === 'number';
}

export function sanitizeForPty(text: string): string {
  return text
    .replace(/\x1b\[20[01]~/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

export class DeliveryService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  /** agentId → message ids already nudged for. Survives a renderer reload because
   *  main holds it; the DURABLE exactly-once record is cursor.json, advanced by
   *  the Stop drain. This set only stops the wake repeating within a run. */
  private readonly nudged = new Map<string, Set<string>>();
  /** agentId → the renderer's standing veto (draft/picker), with the instant it
   *  was asserted so a dead renderer's veto expires (VETO_TTL_MS). */
  private readonly vetoes = new Map<string, { reason: string; ts: number }>();
  /** ptyId → the instant its boot grace ends. */
  private readonly bootGraceUntil = new Map<string, number>();
  /** agentIds already announced idle for their CURRENT quiet spell, so the
   *  backstop is edge-triggered: one announcement per quiet spell, not one every
   *  four seconds for as long as the agent stays quiet. An agent leaves the set
   *  the moment its PTY emits again, or when it stops being live. */
  private readonly quiesced = new Set<string>();
  /** agentIds mid-failover. THE re-entrancy guard from issue #5: it used to be a
   *  closure local in a renderer effect, so a reload between kill and respawn lost
   *  it and the agent stayed dead, pinned at "switching…". */
  private readonly switching = new Set<string>();
  /** ptyId → tail of its serialized write chain, so two callers (a wake nudge and
   *  a post-failover "continue") can never jam their text onto one line. */
  private readonly writeChains = new Map<string, Promise<void>>();
  /** The MD queue, in memory, mirroring the file at `deps.queuePath()`. `null`
   *  until first read. NEVER the source of truth on its own: every mutation is
   *  written through to disk before the mutator returns, because the whole point
   *  of moving this out of the renderer is surviving a process that goes away. */
  private queue: QueuedDelivery[] | null = null;
  /** The path `this.queue` was loaded from, so a changed harness home reloads
   *  rather than writing one hive's queue into another's file. */
  private queueFile: string | null = null;
  /** agentId → the instant of its last queue delivery (the FLUSH_COOLDOWN_MS
   *  gate the renderer drain kept in a ref). */
  private readonly lastFlushAt = new Map<string, number>();
  /** `agentId:messageId` claimed BEFORE the first await, exactly as the renderer
   *  drain's `inFlight` Set was: every await between "is this already going out?"
   *  and the claim is a window in which two ticks both pass that check and the
   *  head of the queue is typed in twice. Released in a `finally`. */
  private readonly queueInFlight = new Set<string>();

  constructor(private readonly deps: DeliveryDeps) {}

  private now(): number { return this.deps.now?.() ?? Date.now(); }
  private sleep(ms: number): Promise<void> {
    return this.deps.sleep ? this.deps.sleep(ms) : new Promise((r) => { setTimeout(r, ms); });
  }
  private log(...a: unknown[]): void { (this.deps.log ?? console.log)('[delivery]', ...a); }

  start(): void {
    if (this.timer) return;
    // The tick carries BOTH the inbox wake and the quiesce backstop, so it has to
    // run at least as often as the faster of the two cadences (#5).
    this.timer = setInterval(() => { void this.tick(); }, Math.min(TICK_MS, QUIESCE_POLL_MS));
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Hold the typers off a freshly (re)spawned PTY while its TUI boots. */
  noteSpawn(ptyId: string): void {
    this.bootGraceUntil.set(ptyId, this.now() + BOOT_GRACE_MS);
  }

  /** Drop everything remembered about a PTY that is gone (teardown). */
  forgetPty(ptyId: string): void {
    this.bootGraceUntil.delete(ptyId);
    this.writeChains.delete(ptyId);
  }

  /** The renderer's draft/picker gate, reported up. `reason: null` clears it. */
  setVeto(agentId: string, reason: string | null): void {
    if (reason) this.vetoes.set(agentId, { reason, ts: this.now() });
    else this.vetoes.delete(agentId);
  }

  /** Is a live (unexpired) renderer veto standing against this agent? */
  vetoed(agentId: string): boolean {
    const v = this.vetoes.get(agentId);
    if (!v) return false;
    if (this.now() - v.ts > VETO_TTL_MS) { this.vetoes.delete(agentId); return false; }
    return true;
  }

  /** True while a failover is between kill and respawn for this agent. */
  isSwitching(agentId: string): boolean { return this.switching.has(agentId); }

  // ─── the MAIN-OWNED MD queue (FLOOR-02) ─────────────────────────────────────
  //
  // This queue was renderer state until now, and `useHive.ts` effect #4's own
  // comment explained why it had to be: "it holds messages the RENDERER produced
  // … it lives in renderer state, and main has no view of it." That is exactly
  // why nothing composed in the UI was delivered with the window closed. Moving
  // the DRAIN alone was never possible; the QUEUE had to move, so it did.
  //
  // Storage is one plain JSON file beside the hive's other live files, written
  // through on every mutation before the mutator returns. Not `PersistStore`:
  // `src/main/delivery.ts` is deliberately the cluster's only Electron-free
  // module, which is what lets `node --test` drive the whole loop with fakes,
  // and pulling a native SQLite binding in here would end that.
  //
  // Not append-only jsonl either, unlike `log.jsonl` and `cost-ledger.jsonl`
  // beside it: those are records of things that happened, while this is a
  // MUTABLE list — items leave it on delivery and move within it on "send now".
  // An append-only log of enqueue/remove events would need its own compactor,
  // which is precisely the unbounded-growth failure (T-P08-04) that pruning is
  // supposed to close. A whole-file rewrite is O(queue), the queue is bounded by
  // MAX_QUEUED_PER_AGENT, and pruning is free: a delivered item is simply not in
  // the next write.

  /** The queue as it is on disk, read once per path. Anything unreadable or
   *  malformed degrades to an EMPTY queue rather than throwing out of a timer —
   *  and, because a load failure must not then be written back over a file that
   *  might be fine, `queueFile` is only armed once a load has actually landed. */
  private loadQueue(): QueuedDelivery[] {
    const path = this.deps.queuePath();
    if (!path) { this.queue = null; this.queueFile = null; return []; }
    if (this.queue && this.queueFile === path) return this.queue;
    let items: QueuedDelivery[] = [];
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
      const raw = (parsed as { items?: unknown })?.items;
      if (Array.isArray(raw)) items = raw.filter(isQueuedDelivery);
    } catch { /* absent or corrupt — an empty queue, not a crashed tick */ }
    this.queue = items;
    this.queueFile = path;
    return items;
  }

  /**
   * Persist SYNCHRONOUSLY, before the caller returns.
   *
   * A buffer flushed "later" is indistinguishable from no durability at all in
   * the kill-the-process case this exists for. Staged through a temp file and
   * renamed into place (the same rule `roster.ts` follows) so a crash mid-write
   * leaves the previous queue intact rather than a truncated one — the hive's
   * `.gitignore` already carries `*.tmp-*` for exactly this staging pattern.
   */
  private saveQueue(): void {
    const path = this.queueFile;
    if (!path) return;
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(tmp, JSON.stringify({ version: 1, items: this.queue ?? [] }), 'utf8');
      renameSync(tmp, path);
    } catch (e) {
      this.log('queue persist failed', String(e));
      try { rmSync(tmp, { force: true }); } catch { /* nothing staged */ }
    }
  }

  /** Persist, then tell every attached renderer. The push is what keeps the
   *  composer's pending list a live VIEW now that main owns the list itself —
   *  main is a no-op emitter with no window, which is the whole point. */
  private commitQueue(): QueueResult {
    this.saveQueue();
    const queues = this.queueSnapshot();
    this.deps.emit('hive:queue', queues);
    return { ok: true, queues };
  }

  /** The queue grouped by agent, in delivery order. */
  queueSnapshot(): QueueSnapshot {
    const out: QueueSnapshot = {};
    for (const m of this.loadQueue()) (out[m.agentId] ??= []).push(m);
    return out;
  }

  /**
   * Park a message for an agent. THE one way anything reaches the drain.
   *
   * Validates at this boundary rather than trusting its caller: the renderer's
   * producers reach it over IPC, and text accepted here is text that will be
   * typed into a live terminal (T-P08-01/05).
   */
  enqueue(req: EnqueueRequest): QueueResult {
    const agentId = typeof req?.agentId === 'string' ? req.agentId.trim() : '';
    const text = typeof req?.text === 'string' ? req.text.trim() : '';
    if (!agentId) return { ok: false, error: 'invalid agentId' };
    if (!text) return { ok: false, error: 'empty message' };
    // Resolve the recipient against MAIN's roster. A renderer naming an agent
    // that is not on this floor does not get to make main type at it.
    if (this.deps.knownAgent && !this.deps.knownAgent(agentId)) {
      return { ok: false, error: `unknown agent: ${agentId}` };
    }
    const queue = this.loadQueue();
    if (!this.queueFile) return { ok: false, error: 'no harness home — nowhere durable to park this' };
    if (queue.filter((m) => m.agentId === agentId).length >= MAX_QUEUED_PER_AGENT) {
      return { ok: false, error: `queue full for ${agentId} (${MAX_QUEUED_PER_AGENT})` };
    }
    // ONE PENDING COMPACT PER AGENT. Compaction is idempotent in the worst way:
    // the first `/compact` does the work and every one behind it answers "nothing
    // to compact", so a queue that accumulates them spends a delivery slot and a
    // model round-trip per copy and buries the operator's real backlog.
    //
    // This invariant used to live in the renderer store's `enqueueMessage`, for a
    // reason that survives the move verbatim: there are several producers — the
    // context trigger, god dispatching a work order, Slack, the composer — and
    // each one that grew its own check could still be bypassed by the next path
    // someone adds. So it moved WITH the queue, to the queue's new one gate.
    // Leaving it in the renderer would have made it advisory: two producers can
    // both read a stale view between their enqueue and main's push back.
    if (isCompactionCommand(text)
      && queue.some((m) => m.agentId === agentId && isCompactionCommand(m.text))) {
      return { ok: true, error: 'compaction already queued', queues: this.queueSnapshot() };
    }
    const item: QueuedDelivery = {
      id: `q-${Date.now()}-${++queueSeq}`,
      agentId,
      text,
      ts: Date.now(),
      ...(req.slack ? { slack: req.slack } : {}),
      ...(typeof req.instruction === 'string' && req.instruction ? { instruction: req.instruction } : {})
    };
    queue.push(item);
    return { ...this.commitQueue(), id: item.id };
  }

  /** Drop one parked message (the user removed it, or it was just delivered). */
  removeQueued(agentId: string, messageId: string): QueueResult {
    const queue = this.loadQueue();
    const i = queue.findIndex((m) => m.id === messageId && m.agentId === agentId);
    if (i < 0) return { ok: false, error: 'not queued', queues: this.queueSnapshot() };
    queue.splice(i, 1);
    return this.commitQueue();
  }

  /** "Send now" while auto-delivery is paused: mark it manual and move it to the
   *  front of that agent's queue. Bypasses ONLY the pause gate. */
  releaseQueued(agentId: string, messageId: string): QueueResult {
    const queue = this.loadQueue();
    const i = queue.findIndex((m) => m.id === messageId && m.agentId === agentId);
    if (i < 0) return { ok: false, error: 'not queued', queues: this.queueSnapshot() };
    const [item] = queue.splice(i, 1);
    item.manual = true;
    queue.unshift(item);
    return this.commitQueue();
  }

  /** Clear one agent's whole queue (the user asked, or the agent was removed). */
  clearQueued(agentId: string): QueueResult {
    const queue = this.loadQueue();
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].agentId === agentId) queue.splice(i, 1);
    return this.commitQueue();
  }

  /**
   * Drain the queue into live terminals, from the tick that already exists.
   *
   * Every gate the renderer drain applied is applied here, and the two that only
   * the renderer could see are the two the renderer KEPT: the draft/picker gate
   * arrives as `vetoed()`, reported up over `hive:deliveryVeto`. The rest —
   * idle, boot grace, operator pause, mid-failover — main can see for itself and
   * already did, which is why they are the tick's own guards rather than copies.
   *
   * ADR-0001 is intact: this writes through `submit()`, the same single gate the
   * wake nudge and the post-failover "continue" use, which serializes per PTY.
   * The renderer drain is DELETED, not left as a fallback — one queue, one owner,
   * one writer.
   */
  private async drainQueue(live: LiveAgentPty[], now: number): Promise<void> {
    if (!this.loadQueue().length) return;
    const jobs: Array<Promise<void>> = [];
    for (const a of live) {
      if (this.switching.has(a.agentId)) continue;                  // mid-respawn
      if (this.vetoed(a.agentId)) continue;                         // the human is typing
      if ((this.bootGraceUntil.get(a.ptyId) ?? 0) > now) continue;  // TUI still booting
      if (a.idleMs < IDLE_MS) continue;                             // mid-turn
      const next = nextForDelivery(this.loadQueue(), a.agentId, {
        now,
        lastFlushAt: this.lastFlushAt.get(a.agentId) ?? 0,
        paused: this.deps.paused(a.agentId)
      });
      if (!next) continue;
      const key = `${a.agentId}:${next.id}`;
      if (this.queueInFlight.has(key)) continue;
      // CLAIMED BEFORE THE AWAIT — see `queueInFlight`.
      this.queueInFlight.add(key);
      this.lastFlushAt.set(a.agentId, now);
      jobs.push(this.deliverQueued(a, next, key));
    }
    await Promise.all(jobs);
  }

  private async deliverQueued(a: LiveAgentPty, item: QueuedDelivery, key: string): Promise<void> {
    try {
      // `instruction`, when present, is the authoritative text to type; card and
      // list surfaces keep showing the readable `text`.
      const sent = await deliverWithAcknowledgement(
        () => this.submit(a.ptyId, item.instruction ?? item.text, a.provider),
        () => {
          // The DURABLE dedup: a delivered message leaves the file. Deliberately
          // NOT the wake's `seenSet` — that set is pruned against the live hive
          // inbox on every tick (`stillUnread` below), so a queue id parked in it
          // would be erased within four seconds and the message re-typed. The
          // queue's own removal is both narrower and stronger: it survives the
          // restart the in-memory set cannot.
          const q = this.loadQueue();
          const i = q.findIndex((m) => m.id === item.id);
          if (i >= 0) q.splice(i, 1);
          this.commitQueue();
        }
      );
      if (sent) {
        try { this.deps.onQueueDelivered?.(item); }
        catch (e) { this.log('post-delivery hook threw for', item.id, String(e)); }
        // `text` rides along because the renderer has a job that depends on WHAT
        // landed, not just that something did: zeroing the context gauge on a
        // delivered `/clear`. It cannot read the item out of the queue any more —
        // the acknowledge above already removed it, which is the point.
        this.deps.emit('hive:queueDelivered', { to: a.agentId, id: item.id, text: item.text });
        return;
      }
      // Failed write (a dead/crashed pty the roster still thinks is live): retry
      // on the next cooldown-spaced tick, bounded, then drop LOUDLY. (#113/#36)
      if (noteAttempt(item).drop) {
        const q = this.loadQueue();
        const i = q.findIndex((m) => m.id === item.id);
        if (i >= 0) q.splice(i, 1);
        this.log(
          `dropping queued message ${item.id} for ${a.agentId} after ${item.attempts} failed pty writes`,
          `("${item.text.slice(0, 80)}${item.text.length > 80 ? '…' : ''}")`
        );
      }
      this.commitQueue();
    } finally {
      this.queueInFlight.delete(key);
    }
  }

  // ─── the guarded Stop drain (#5) ────────────────────────────────────────────

  /**
   * The Stop-hook half of delivery: hand the agent its unread mail as a
   * block-to-continue instead of letting the turn end with the inbox full.
   *
   * This is the path that was ripped out for a real reason — a forced
   * continuation bypassed the terminal-draft/HITL gate and could spend credits
   * while a human was mid-answer. It comes back GUARDED: never when the operator
   * has paused auto-delivery to this agent, and never while the renderer holds a
   * veto for it (a draft in the box, a picker open). `stop_hook_active` is
   * screened by the caller, so this can never re-enter its own continuation.
   *
   * Unlike the wake nudge, it types NOTHING — the agent's own turn carries the
   * work — which is why it is the preferred path whenever a Stop actually fires.
   */
  drainAtStop(agentId: string): { block: boolean; reason?: string } {
    if (this.deps.paused(agentId)) return { block: false };
    if (this.vetoed(agentId)) return { block: false };
    const res = this.deps.drain(agentId);
    if (!res.block) return { block: false };
    // The cursor has advanced, so mark these seen for the wake loop too — the two
    // paths must not both announce the same message.
    const seen = this.seenSet(agentId);
    for (const m of res.delivered ?? []) {
      seen.add(m.id);
      this.deps.emit('hive:delivered', { to: agentId, from: m.from, id: m.id });
    }
    return { block: true, reason: res.reason };
  }

  // ─── the inbox wake (#5) ────────────────────────────────────────────────────

  // ─── the idle-quiesce backstop (#5) ───────────────────────────────────

  /**
   * Flip every agent whose PTY has gone silent past QUIESCE_IDLE_MS to idle.
   *
   * This ran in the renderer until now (`useHive.ts` effect 2e) and therefore did
   * not run at all with the window closed — an agent whose bridge never fires its
   * turn-end signal stayed pinned 'working' forever, which is exactly the stuck
   * floor issue #5 is about. It rides the existing tick: no second timer, in this
   * file or in index.ts.
   *
   * Writes NO terminal bytes — ADR-0001's one-gate rule is about typing into a
   * PTY, and this only announces a status transition, so the wake nudge below
   * stays the single writer.
   *
   * The two announcements mirror the Stop drain's split: `setStatus` is the
   * durable half (index.ts writes the hive log, which does not need a window) and
   * `emit` is the live half (a documented no-op when no webContents exists). The
   * event is Stop-shaped on purpose: a synthesized turn-end is how every bridged
   * engine already keeps the harness status in step (`hive.ts` agent_end→Stop,
   * session.idle→Stop), so the renderer needs no new channel and no new code.
   */
  private quiesce(live: LiveAgentPty[], now: number): void {
    const ids = new Set(live.map((a) => a.agentId));
    // Main outlives every renderer, so bound the set by the live roster — same
    // reason the wake's seen-set is pruned against the live inbox below.
    for (const id of this.quiesced) if (!ids.has(id)) this.quiesced.delete(id);

    for (const a of live) {
      // Never fight the breaker pin: a constrained/stopped agent is deliberately
      // held 'looping', and calling it idle would re-arm the delivery paths that
      // the breaker exists to hold off.
      const level = this.deps.breakerLevel?.(a.agentId);
      if (level === 'constrained' || level === 'stopped') continue;
      // A still-booting TUI is mid-type; its silence is the boot sequence, not a
      // finished turn. Reuses the boot grace this service already tracks.
      if ((this.bootGraceUntil.get(a.ptyId) ?? 0) > now) continue;
      // A TUI that has NEVER painted a frame is not a finished turn — it is a
      // broken or still-starting child, and calling it idle un-gates the delivery
      // paths against a terminal that cannot receive. `lastOutputAt` alone cannot
      // see that: pty.ts:752 SEEDS it to the spawn instant, so it reads as "quiet
      // for ages" the moment boot grace lapses. `hasOutput` is the flag that can
      // (pty.ts:753/764). The `> 0` floor stays as a guard against a caller that
      // supplies neither.
      const painted = a.hasOutput && a.lastOutputAt > 0;
      const quiet = painted && now - a.lastOutputAt > QUIESCE_IDLE_MS;
      if (!quiet) { this.quiesced.delete(a.agentId); continue; }
      if (this.quiesced.has(a.agentId)) continue;   // already announced this spell
      this.quiesced.add(a.agentId);
      this.deps.setStatus?.(a.agentId, 'idle');
      this.deps.emit('hive:hookEvent', { agentId: a.agentId, event: 'Stop', blocked: false });
    }
  }

  /** One sweep: nudge every quiet agent holding mail it has not been told about.
   *  Agents are handled in PARALLEL — `submit` already serializes per PTY, and a
   *  single wedged TUI must not hold the whole floor's mail behind its timeout. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = this.now();
      const live = this.deps.liveAgents();
      this.quiesce(live, now);
      // FLOOR-02's queue drain rides THIS tick — no second timer, in this file or
      // in index.ts. It shares `submit()`'s per-PTY write chain with the wake
      // nudge below, so the two can never jam their text onto one line.
      const jobs: Array<Promise<void>> = [this.drainQueue(live, now)];
      for (const a of live) {
        if (this.switching.has(a.agentId)) continue;      // mid-respawn
        if (this.deps.paused(a.agentId)) continue;         // operator pause
        if (this.vetoed(a.agentId)) continue;              // human is typing
        if ((this.bootGraceUntil.get(a.ptyId) ?? 0) > now) continue;
        // Mid-turn — or being typed into: the child echoes the human's keystrokes,
        // so PTY silence is also "nobody has touched this terminal recently". That
        // is the one draft guard that keeps working with no renderer to veto.
        if (a.idleMs < IDLE_MS) continue;
        let mail: DeliverableMessage[];
        try { mail = this.deps.inbox(a.agentId); } catch { continue; }
        const seen = this.seenSet(a.agentId);
        // Forget ids that have left the inbox (the agent moved them to .done).
        // Main outlives every renderer, so an append-only set would grow for the
        // life of the app; bounding it to the live inbox costs one pass.
        const stillUnread = new Set(mail.map((m) => m.id));
        for (const id of seen) if (!stillUnread.has(id)) seen.delete(id);
        const fresh = mail.filter((m) => m.id && !seen.has(m.id));
        if (!fresh.length) continue;
        // Claim BEFORE the await: the nudge covers everything currently unread, and
        // a second sweep must not re-send it while the first is still typing.
        for (const m of fresh) seen.add(m.id);
        jobs.push(
          this.submit(a.ptyId, WAKE_NUDGE, a.provider).then(
            () => {
              for (const m of fresh) {
                this.deps.emit('hive:delivered', { to: a.agentId, from: m.from, id: m.id });
              }
            },
            (e: unknown) => {
              // The write failed (dead PTY, a TUI that never became ready). Un-claim
              // so the next sweep retries — unread mail beats a tidy set.
              for (const m of fresh) seen.delete(m.id);
              this.log('wake nudge failed for', a.agentId, String(e));
            }
          )
        );
      }
      await Promise.all(jobs);
    } finally {
      this.ticking = false;
    }
  }

  // ─── account failover (#5) ──────────────────────────────────────────────────

  /** Execute an account-pool failover plan: kill → respawn on the new account →
   *  one "continue" nudge, per agent, concurrently but never twice per agent. */
  failover(switches: AccountSwitch[], reason: string): void {
    for (const sw of switches) void this.switchAccount(sw, reason);
  }

  private async switchAccount(sw: AccountSwitch, reason: string): Promise<void> {
    if (this.switching.has(sw.agentId)) return; // a re-plan while this one is in flight
    this.switching.add(sw.agentId);
    this.deps.emit('hive:failover', { agentId: sw.agentId, phase: 'start', account: sw.to });
    try {
      const res = await this.deps.respawn(sw.agentId, sw.to);
      if (!res.ok) {
        this.log('respawn failed for', sw.agentId, res.error);
        this.deps.emit('hive:failover', {
          agentId: sw.agentId, phase: 'failed', account: sw.to, error: res.error ?? 'spawn failed'
        });
        return;
      }
      const landed = res.account ?? sw.to;
      this.deps.emit('hive:failover', { agentId: sw.agentId, phase: 'done', account: landed });
      // The ONE nudge: the in-flight turn is gone, but the resumed session still
      // holds the whole thread, so "continue" is all it needs.
      const live = this.deps.liveAgents().find((x) => x.agentId === sw.agentId);
      if (!live) return;
      await this.submit(
        live.ptyId,
        `Your previous turn was interrupted by a Claude account switch (${sw.fromLabel} → ${sw.toLabel}; ${reason}). Continue where you left off.`,
        live.provider
      );
      await this.pressEnterWhileParked(sw.agentId);
    } catch (e) {
      this.log('switch threw for', sw.agentId, String(e));
      this.deps.emit('hive:failover', {
        agentId: sw.agentId, phase: 'failed', account: sw.to, error: String(e)
      });
    } finally {
      // ALWAYS — this is the guard whose loss left agents pinned at "switching…".
      this.switching.delete(sw.agentId);
    }
  }

  /** Re-press Enter while the agent stays parked: a resumed TUI can swallow the
   *  first one while it loads the transcript, leaving the text sitting unsent. */
  private async pressEnterWhileParked(agentId: string): Promise<void> {
    for (let i = 0; i < RESUME_ENTER_RETRIES; i++) {
      await this.sleep(RESUME_ENTER_GAP_MS);
      const cur = this.deps.liveAgents().find((x) => x.agentId === agentId);
      if (!cur || cur.idleMs < RESUME_ENTER_GAP_MS) return; // it woke up — done
      if (!this.deps.write(cur.ptyId, '\r').ok) return;     // PTY gone
    }
  }

  // ─── typing into a TUI ──────────────────────────────────────────────────────

  /**
   * Type one line into a TUI and submit it, serialized per PTY.
   *
   * Same shape as the renderer's `submitToPty`, for the same hard-won reasons:
   * sanitize first (the body decides neither where the paste ends nor when Enter
   * is pressed), wrap MULTI-LINE text in bracketed paste so embedded newlines do
   * not submit fragment-by-fragment, single-line text raw (some TUIs echo the
   * paste markers as literal input and never submit), then Enter a tick later.
   */
  private submit(ptyId: string, text: string, provider: AgentProvider): Promise<void> {
    const prev = this.writeChains.get(ptyId) ?? Promise.resolve();
    const next = prev
      .catch(() => { /* a failed prior write must not stall the chain */ })
      .then(async () => {
        await this.waitReady(ptyId, provider);
        const clean = sanitizeForPty(text);
        const payload = clean.includes('\n') ? `\x1b[200~${clean}\x1b[201~` : clean;
        const wrote = this.deps.write(ptyId, payload);
        if (!wrote.ok) throw new Error(wrote.error ?? `pty write failed: ${ptyId}`);
        await this.sleep(SUBMIT_GAP_MS);
        const submitted = this.deps.write(ptyId, '\r');
        if (!submitted.ok) throw new Error(submitted.error ?? `pty write failed: ${ptyId}`);
      });
    this.writeChains.set(ptyId, next);
    return next;
  }

  /** Wait for the TUI to paint its first frame + settle. Throws if the PTY dies
   *  or never gets there, so the caller can un-claim and retry. */
  private async waitReady(ptyId: string, provider: AgentProvider): Promise<void> {
    const started = this.now();
    for (;;) {
      const live = this.deps.liveAgents().find((x) => x.ptyId === ptyId);
      if (!live) throw new Error(`PTY exited before becoming ready: ${ptyId}`);
      const elapsed = this.now() - started;
      if (terminalReadyToReceive(live.hasOutput, elapsed, provider)) return;
      if (elapsed >= READY_TIMEOUT_MS) throw new Error(`PTY did not become ready: ${ptyId}`);
      await this.sleep(100);
    }
  }

  private seenSet(agentId: string): Set<string> {
    let s = this.nudged.get(agentId);
    if (!s) { s = new Set(); this.nudged.set(agentId, s); }
    return s;
  }
}

// ─── board.md size policy (#35) ───────────────────────────────────────────────
// The pure half lives here because this is the cluster's only electron-free
// module, so it is the only one `node --test` can load. index.ts owns the fs
// side (backup → rewrite → verify → atomic rename), exactly like reflect.ts.

/** Newest `## ` sections kept verbatim when the board is condensed. */
export const BOARD_KEEP_SECTIONS = 12;

/**
 * Condense an oversized `board.md`: keep the preamble (the `# ` title and
 * anything before the first `## `) plus the newest K sections verbatim, and
 * replace the evicted middle with a one-line pointer at the backup that still
 * holds it. Returns null when there is nothing to evict.
 *
 * ponytail: deterministic surgery, NOT an LLM summary. reflect.ts pays a whole
 * hidden-TUI boot to compress prose it must not lose; the board is god's own
 * rolling plan — the current sections are the plan, the old ones are history, and
 * history has a backup file. Upgrade path if the evicted middle ever turns out to
 * matter: swap this for reflect.ts's summarize step, the verify gate is the same.
 */
export function condenseBoardText(
  text: string,
  archiveRef: string,
  keep = BOARD_KEEP_SECTIONS
): string | null {
  const sections = splitBoardSections(text);
  if (sections.sections.length <= keep) return null;
  const kept = sections.sections.slice(-keep);
  const evicted = sections.sections.length - kept.length;
  const parts = [
    sections.preamble.replace(/\s+$/, ''),
    `_[condensed] ${evicted} older section(s) archived to \`${archiveRef}\`._`,
    ...kept.map((s) => s.replace(/\s+$/, ''))
  ].filter((p) => p.length > 0);
  return parts.join('\n\n') + '\n';
}

/** Split a board into its preamble and its `## ` sections, in file order. */
export function splitBoardSections(text: string): { preamble: string; sections: string[] } {
  const lines = text.split('\n');
  const preamble: string[] = [];
  const sections: string[] = [];
  let cur: string[] | null = null;
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      if (cur) sections.push(cur.join('\n'));
      cur = [line];
    } else if (cur) cur.push(line);
    else preamble.push(line);
  }
  if (cur) sections.push(cur.join('\n'));
  return { preamble: preamble.join('\n'), sections };
}

/**
 * The verify-don't-trust gate for a board rewrite, mirroring reflect.ts: the
 * rewrite is rejected — original left byte-for-byte — unless every check holds.
 * The backup taken first makes a rejection a pure no-op.
 */
export function verifyBoard(args: {
  rebuilt: string;
  original: string;
  keep: number;
}): { ok: true } | { ok: false; reason: string } {
  const { rebuilt, original, keep } = args;
  if (!rebuilt.trim()) return { ok: false, reason: 'empty' };
  const oldBytes = Buffer.byteLength(original, 'utf8');
  const newBytes = Buffer.byteLength(rebuilt, 'utf8');
  if (!(newBytes < oldBytes * 0.95)) return { ok: false, reason: 'not-smaller' };
  const before = splitBoardSections(original);
  const after = splitBoardSections(rebuilt);
  // The preamble (god's title + any standing header) must survive untouched. The
  // rebuilt preamble is LONGER by exactly the archive pointer, which sits before
  // the first `## ` and therefore parses back as part of it — hence startsWith.
  if (!after.preamble.startsWith(before.preamble.replace(/\s+$/, ''))) {
    return { ok: false, reason: 'preamble-altered' };
  }
  if (after.sections.length !== keep) return { ok: false, reason: 'section-count-mismatch' };
  // The newest K sections must round-trip byte-for-byte — nothing is summarized.
  const expected = before.sections.slice(-keep);
  for (let i = 0; i < keep; i++) {
    if (after.sections[i].replace(/\s+$/, '') !== expected[i].replace(/\s+$/, '')) {
      return { ok: false, reason: 'section-altered' };
    }
  }
  return { ok: true };
}
