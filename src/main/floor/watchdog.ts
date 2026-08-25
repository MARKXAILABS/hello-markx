/**
 * watchdog.ts — VIGIL-01: nothing happening is itself an event.
 *
 * When no card advances, no mail routes, no spend lands and no PTY prints for
 * longer than a threshold, the operator is told **once**, with what was in
 * flight when it stopped — **including the case where the god itself died**.
 *
 * ## Why this is not the built-in heartbeat
 *
 * (The heartbeat's own symbol is deliberately absent from this file — a pin in
 * `test/absence-watchdog.test.cjs` asserts that, so "reuse the heartbeat" can
 * never creep back in as an import that a passing suite would not notice.)
 *
 * `src/main/config.ts`'s built-in heartbeat is `to: 'god'`, ships `enabled:
 * false`, and its own doc says it "types into god's PTY" so that it can "nudge
 * it to re-engage anyone stalled". **A beat addressed to the god cannot report
 * that the god died** — which is the one case VIGIL-01 names explicitly. So
 * this is a separate, OPERATOR-directed alarm. It reuses the heartbeat's quiet
 * *number* (300 000 ms) and nothing else; the heartbeat is read-only to it, and
 * this module never writes into any PTY (ADR-0001).
 *
 * ## Why it lives here
 *
 * A watchdog that dies with the thing it watches is not a watchdog. This module
 * is driven from `bootFloor`'s own timer seam, so it outlives the god (it is
 * not the god), it outlives the window (`floor/headless.ts` boots the same floor
 * with no renderer), and it is torn down through the one `SHUTDOWN_STEPS` list.
 *
 * ## Shape
 *
 * Deliberately free of any `electron` import, and of any import of `pty.ts`,
 * `hive.ts`, `telemetry.ts` or `config.ts`: every collaborator arrives injected
 * (`floor/deps.ts` house law), so `node --test` drives every branch with a fake
 * clock and no floor at all. The one import is `../push`, for the tag literal —
 * see {@link AbsenceWatchdogDeps.push}.
 */
import { FLOOR_QUIET_TAG } from '../push';

/** What the operator is told, and what both persistent surfaces render. */
export interface QuietSnapshot {
  /** Duration, never a timestamp. 04-UI-SPEC rule G-3: the client's clock is
   *  not the floor's clock, and a deadline sent to a client is optimistic by
   *  its skew. Recomputed on every {@link AbsenceWatchdog.current} call, so the
   *  phone's strip keeps counting; the value carried on the ONE `publishQuiet`
   *  of the setting edge is that edge's value, and the renderer adds its own
   *  elapsed time to it (which is exactly what a duration is for). */
  sinceMs: number;
  /** Cards in `doing` at the MOMENT OF THE TRANSITION, with their assignees.
   *  Not a detail: the requirement says "with what was in flight when it
   *  stopped", and re-reading the board when the operator finally opens the
   *  notification reports a different — possibly empty — set. */
  inFlight: Array<{ id: string; title: string; assignee?: string }>;
  /** True when the god's own PTY is among the dead. Changes the copy entirely.
   *  A floor whose registry names no god at all reports `false`: it never had
   *  an orchestrator to lose, and claiming a death that never happened is the
   *  copy failure this distinction exists to prevent. */
  godDead: boolean;
}

/** Every signal is a READ of something main already computes. Nothing here is
 *  new state and nothing here is a second source of truth. */
export interface AbsenceWatchdogDeps {
  now(): number;
  /**
   * Milliseconds since the most recent output by ANY live PTY — i.e. the
   * floor's PTY silence, `Infinity` when no PTY is live at all (which is the
   * god-death shape, and it must read as silence, not as "no data").
   *
   * The MINIMUM of `pty.ts`'s per-session `idleFor(id)`, not the maximum: the
   * floor is quiet only when every PTY is, so the most recently active one
   * defines the floor's silence. `boot.ts`'s own `isFloorQuiet` already takes
   * `Date.now() - Math.max(...lastOutputAt)`, which is the same statement.
   * A maximum would let one long-idle agent make a floor look stopped while
   * another was actively printing.
   */
  ptyIdleMs(): number;
  /** The ledger's revision, bumped on EVERY mutation (`hive.ts` `writeTasks`).
   *  One integer, and it is exactly "did the ledger change" — which is why this
   *  watchdog needs nothing from the RECORD track's `tool_calls` table and no
   *  per-card `updatedAt`. */
  ledgerRev(): number;
  /** Epoch ms of the last `appendLog` write of any kind — the "no mail routes"
   *  signal (`kind:'message'` / `kind:'drain'` land here along with everything
   *  else, so one read covers the whole log). */
  lastEventAt(): number;
  /** Epoch ms of the last telemetry cost sample — the "no spend lands" signal. */
  lastSpendAt(): number;
  doingCards(): Array<{ id: string; title: string; assignee?: string }>;
  godAlive(): boolean;
  /** D-25 channel ①, transient: the native OS toast. Gated on the operator's
   *  notifications setting by the WIRING, not here — an operator who turned
   *  notifications off did not ask for this one either. */
  notify(a: { title: string; body: string }): void;
  /** D-25 channel ②, persistent: the snapshot on the setting edge, `null` on
   *  the clearing edge. A publisher that only ever sets leaves the surface
   *  stuck on with nothing to notice it. */
  publishQuiet(s: QuietSnapshot | null): void;
  /** D-25 channel ③, transient: Web Push. `taskId` is
   *  {@link FLOOR_QUIET_TAG} — a distinct, stable tag so the alarm replaces
   *  only its own previous notification and can never collide with, or stack
   *  on, a real ask. */
  push(a: { title: string; body: string; taskId: string }): void;
}

/**
 * How long the floor must be silent on all four signals before the operator is
 * told. **[ASSUMED]** — nothing in the research session measured the right
 * value, and D-25 leaves it open. 300 000 ms is the built-in heartbeat's own
 * `quietThresholdMs` (`src/main/config.ts`): reusing the number the floor has
 * already reasoned about
 * rather than inventing a second one that would eventually disagree with it.
 * Overridable per-instance through the constructor's `opts`.
 */
export const QUIET_THRESHOLD_MS = 300_000;

/** `32m`, `1h 4m`. Minutes are the resolution the operator reads at 3am; a
 *  seconds field on a five-minute threshold is noise. */
function humanDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** 04-UI-SPEC §S6a's three cases. The TITLE is self-sufficient on purpose
 *  (rule Q-4): `sw.js` renders `data.agent` as the notification title and
 *  hard-codes `body: 'is waiting on you'`, so an INSTALLED OLD service worker
 *  drops any new body — a title of `Floor` would render as "Floor is waiting on
 *  you", which is false. The body carries a duration, an agent name and a card
 *  title only; never a question, never a path, never a command. */
function alarmCopy(s: QuietSnapshot): { title: string; body: string } {
  const been = humanDuration(s.sinceMs);
  if (s.godDead) {
    return {
      title: 'The orchestrator is gone',
      body: `The floor has no orchestrator, and nothing has moved for ${been}.`
    };
  }
  const n = s.inFlight.length;
  const flight = n === 0
    ? 'No cards were in flight.'
    : `${n} card${n === 1 ? '' : 's'} in flight: ${s.inFlight.map(cardLine).join(', ')}.`;
  return { title: 'The floor has stopped', body: `Nothing has moved for ${been}. ${flight}` };
}

function cardLine(c: { title: string; assignee?: string }): string {
  return c.assignee ? `${c.title} (${c.assignee})` : c.title;
}

/**
 * The edge-trigger latch. `DeliveryService.quiesce` (`delivery.ts`) is the
 * in-repo model and this is the same shape in the same process: announce on the
 * transition, hold, and clear on the first real activity so the next genuine
 * spell can be announced again.
 *
 * Told once means told once (rule Q-3): no repeats, no escalation ladder, no
 * re-fire on a timer. The two transient channels fire exactly once per edge.
 * The persistent channel is a STATE — set on one edge, cleared on the other —
 * and states do not fatigue.
 */
export class AbsenceWatchdog {
  private readonly deps: AbsenceWatchdogDeps;
  private readonly thresholdMs: number;
  /** The ledger `rev` seen on the last read, and when it last changed. The rev
   *  is an integer with no clock of its own, so its silence has to be timed
   *  here — "unchanged since the last tick" would alarm on any tick interval
   *  shorter than the threshold, which is every sane one. */
  private lastRev: number;
  private lastRevChangeAt: number;
  /** Set === the operator has been told about THIS spell. Null === moving. */
  private latched: {
    quietSince: number;
    inFlight: Array<{ id: string; title: string; assignee?: string }>;
    godDead: boolean;
  } | null = null;

  constructor(deps: AbsenceWatchdogDeps, opts?: { thresholdMs?: number }) {
    this.deps = deps;
    this.thresholdMs = opts?.thresholdMs ?? QUIET_THRESHOLD_MS;
    this.lastRev = deps.ledgerRev();
    this.lastRevChangeAt = deps.now();
  }

  /** Epoch ms of the most recent activity on ANY of the four signals. Clamped
   *  to `now` so a clock-skewed timestamp from disk can never produce a
   *  negative duration. */
  private lastActivityAt(now: number): number {
    const rev = this.deps.ledgerRev();
    if (rev !== this.lastRev) {
      this.lastRev = rev;
      this.lastRevChangeAt = now;
    }
    return Math.min(now, Math.max(
      now - this.deps.ptyIdleMs(),
      this.lastRevChangeAt,
      this.deps.lastEventAt(),
      this.deps.lastSpendAt()
    ));
  }

  /** Called from the boot timer. Idempotent per tick: a quiet tick with the
   *  latch already set does nothing at all. */
  tick(): void {
    const now = this.deps.now();
    const activeAt = this.lastActivityAt(now);

    if (now - activeAt <= this.thresholdMs) {
      // Any one of the four moving clears the latch — the "clear on the first
      // real activity" half of D-25.
      if (this.latched) {
        this.latched = null;
        this.deps.publishQuiet(null);
      }
      return;
    }

    if (this.latched) return;   // already told; rule Q-3

    this.latched = {
      quietSince: activeAt,
      // Copied, not referenced: the board keeps moving after the alarm and the
      // operator must see what was in flight when it STOPPED.
      inFlight: this.deps.doingCards().map((c) => ({ id: c.id, title: c.title, assignee: c.assignee })),
      godDead: !this.deps.godAlive()
    };

    const snapshot = this.current() as QuietSnapshot;
    const copy = alarmCopy(snapshot);
    this.deps.publishQuiet(snapshot);
    this.deps.notify(copy);
    this.deps.push({ ...copy, taskId: FLOOR_QUIET_TAG });
  }

  /** The current snapshot, or `null` when the floor is moving. This is the
   *  accessor `Floor.watchdog` exposes and the phone's `floorQuiet` field is
   *  composed from. `inFlight` and `godDead` are the transition's; `sinceMs` is
   *  recomputed live, because it is a duration and durations run. */
  current(): QuietSnapshot | null {
    if (!this.latched) return null;
    return {
      sinceMs: Math.max(0, this.deps.now() - this.latched.quietSince),
      inFlight: this.latched.inFlight.slice(),
      godDead: this.latched.godDead
    };
  }
}
