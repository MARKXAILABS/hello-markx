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
import type { AgentProvider } from '../shared/agentProvider';
import { terminalReadyToReceive } from '../shared/providerAutomation';

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
      const jobs: Array<Promise<void>> = [];
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
