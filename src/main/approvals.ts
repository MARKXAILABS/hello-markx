/**
 * GATE-05's pending-approval registry — the place an `ask` hangs while the
 * operator is asked, and the thing that answers `deny` when nobody does.
 *
 * WHY IT EXISTS. `commandShape.ts` (GATE-03) is the only thing in main that
 * reads a command string, and it already returns `{kind:'ask'}` for a
 * force-push, a recursive delete, a downloader piped into an interpreter and a
 * host outside a non-empty allowlist. Until this file existed there was nowhere
 * for that verdict to hang, so an `ask` was answered as a hard deny. This is the
 * "somewhere".
 *
 * WHY IT IS NOT CARDS (D-10), stated here because the next reader will want to
 * "improve" it into `tasks.json`. `openPhoneAsks()` (index.ts) is card-derived
 * and keyed on `taskId`. A tool approval has no card, it is ephemeral, and it
 * expires to deny in about two minutes. Writing one into `tasks.json` would
 * block a real card, survive its own timeout as a dead question on the operator's
 * phone, and put a high-frequency transient into the durable ledger ADR-0004
 * gives a single committer. So it lives in memory, and an app restart mid-ask
 * loses it — which is the "asked and nobody answered" case, the safe direction,
 * and GATE-05's ceiling item (b).
 *
 * SECURITY PROPERTIES, not conveniences (ASVS V3 session management, V4 access
 * control). All four are asserted in `test/control.test.cjs`:
 *
 *   1. ids are UNGUESSABLE — 128 bits from `node:crypto`'s `randomBytes`, never
 *      a counter and never anything derived from the clock or the agent id. The
 *      id is the whole capability on the phone and the desktop IPC, where there
 *      is no second factor;
 *   2. an answer is SINGLE-USE — a settled ask returns `false` from `answer` and
 *      keeps the verdict it already has;
 *   3. an EXPIRED ask cannot be answered, so an operator's late "yes" can never
 *      answer a question whose asker already denied and moved on. Expiry is
 *      computed on READ as well as on `sweep`, so a missed sweep cannot make an
 *      expired ask look live;
 *   4. an ask belongs to ONE agent. `hooks.ts:authorized()` maps a VALID token
 *      to the identity it was minted for — so agent B polling agent A's ask id
 *      with B's own perfectly valid token is not rejected by anything upstream.
 *      `poll` takes the caller's derived id and treats a mismatch exactly like
 *      an unknown id: deny, and leak nothing about whether the id exists.
 *
 * ELECTRON-FREE and dependency-free on purpose: the clock and the publisher
 * arrive INJECTED (`floor/deps.ts`'s house law), nothing is imported from
 * `webhook.ts`, `index.ts`, `db.ts` or `push.ts`, and `node --test` loads it
 * directly on a CI runner installed with `npm ci --ignore-scripts`.
 *
 * Runs in the Electron main process, but imports nothing from it.
 */
import { randomBytes } from 'node:crypto';

/** One question main is waiting on. `command` is agent-authored and untrusted. */
export interface PendingApproval {
  /** `ask-<32 hex>`. MUST satisfy webhook.ts:231's
   *  `PHONE_TASK_ID_RE = /^[A-Za-z0-9._-]{1,128}$/`, which is enforced at :670
   *  BEFORE `answerAsk` runs — an id that fails it is a 400 the operator reads
   *  as "the floor is broken". 36 characters, well inside the bound. */
  id: string;
  agentId: string;
  tool: string;
  /** AGENT-AUTHORED UNTRUSTED TEXT (ASVS V7), capped. It is about to be rendered
   *  on a phone; escape at render, never eval, never feed to a shell. */
  command: string;
  /** Why this is an ask rather than an allow — main's own sentence, authored
   *  beside the judge that decided it and never re-written downstream. */
  reason: string;
  openedAt: number;
  /** The server-side TTL. MUST be <= the `deadlineMs` handed to the shim; they
   *  are the same number, read off this entry rather than recomputed. */
  expiresAt: number;
}

/** What a poll can hear back. `pending` means "loop again". */
export type ApprovalVerdict = 'pending' | 'allow' | 'deny';

export interface ApprovalRegistryOptions {
  /** The server-side ask TTL in ms. INJECTED rather than imported so this module
   *  keeps zero dependencies and a test can drive a 50 ms ask instead of a
   *  two-minute one. Production passes `ASK_TTL_MS` (hiveProvisioning.ts) at the
   *  one `new ApprovalRegistry(...)` site, in `hooks.ts`. */
  ttlMs: number;
  now?: () => number;
  /** Called with the currently-open asks whenever that set changes — an open, an
   *  answer, or a sweep that expired one. Plan 04-17 wires it to `openAsks()`,
   *  the desktop `Notification` and Web Push. */
  publish?: (open: PendingApproval[]) => void;
}

/** The byte cap on `command`. The SAME bound plan 04-02 chose for
 *  `tool_calls.target` (`db.ts`'s `TARGET_MAX_BYTES`) — re-stated rather than
 *  imported because `db.ts` imports `electron` and this module must stay
 *  loadable without it. If one moves, move the other. */
const COMMAND_MAX_BYTES = 4096;

/** 128 bits. Long enough that guessing one is not a strategy, short enough that
 *  `ask-` + 32 hex characters is 36 — comfortably inside PHONE_TASK_ID_RE's 128. */
const ID_BYTES = 16;

/** How long a SETTLED entry is kept after it expires, so a shim's last poll
 *  still reads the real verdict before the entry is reaped. One extra TTL. */
const REAP_AFTER_TTLS = 1;

/** `capBytes` from db.ts, same three lines, same reason — a cap on bytes rather
 *  than on characters, because the column and the wire are both bytes. */
function capBytes(s: string, max: number): string {
  const buf = Buffer.from(s, 'utf8');
  return buf.byteLength <= max ? s : buf.subarray(0, max).toString('utf8');
}

interface Entry extends PendingApproval {
  verdict: ApprovalVerdict;
}

export class ApprovalRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly publish: (open: PendingApproval[]) => void;

  constructor(opts: ApprovalRegistryOptions) {
    this.ttlMs = opts.ttlMs;
    this.now = opts.now ?? (() => Date.now());
    this.publish = opts.publish ?? (() => { /* nothing listening yet */ });
  }

  /** Open a question. Publishes, so the operator is paged before the reply that
   *  carries this entry's id goes back down the socket. */
  open(a: Omit<PendingApproval, 'id' | 'openedAt' | 'expiresAt'>): PendingApproval {
    const openedAt = this.now();
    const entry: Entry = {
      id: `ask-${randomBytes(ID_BYTES).toString('hex')}`,
      agentId: a.agentId,
      tool: a.tool,
      command: capBytes(a.command, COMMAND_MAX_BYTES),
      reason: a.reason,
      openedAt,
      expiresAt: openedAt + this.ttlMs,
      verdict: 'pending'
    };
    this.entries.set(entry.id, entry);
    this.publish(this.list());
    return { ...entry };
  }

  /**
   * The verdict for one ask, for the agent that OWNS it.
   *
   * `agentId` is REQUIRED, and that is the fix for T-04-ASK-29 rather than a
   * convenience: the only caller is `hooks.ts`'s `ApprovalPoll` branch, which
   * already holds the id `authorized()` derived from the caller's own token, and
   * an optional parameter is a check that is skipped by forgetting it. A
   * mismatch answers exactly what an unknown id answers, so the reply leaks
   * nothing about whether the id exists.
   */
  poll(id: string, agentId: string): ApprovalVerdict {
    const entry = this.entries.get(id);
    if (!entry || entry.agentId !== agentId) return 'deny';
    if (entry.verdict === 'pending' && this.now() >= entry.expiresAt) return 'deny';
    return entry.verdict;
  }

  /**
   * Settle an ask. Returns false when the id is unknown, already settled, or
   * expired — all three fail closed and change nothing.
   *
   * NO owner parameter, deliberately: the callers are the OPERATOR's surfaces
   * (the phone's `POST /phone/api/answer` and the desktop IPC), where there is
   * no agent identity to compare against and the unguessable single-use id IS
   * the capability. That is written down as GATE-05 ceiling item (f).
   */
  answer(id: string, approved: boolean): boolean {
    const entry = this.entries.get(id);
    if (!entry || entry.verdict !== 'pending') return false;
    if (this.now() >= entry.expiresAt) return false;
    entry.verdict = approved ? 'allow' : 'deny';
    this.publish(this.list());
    return true;
  }

  /** The open questions: unsettled and unexpired. Plan 04-17 merges this into
   *  `openAsks()` behind a `kind` discriminator. Copies, so a consumer cannot
   *  reach in and change a verdict. */
  list(): PendingApproval[] {
    const now = this.now();
    const out: PendingApproval[] = [];
    for (const e of this.entries.values()) {
      if (e.verdict !== 'pending' || now >= e.expiresAt) continue;
      const { verdict, ...open } = e;
      void verdict;
      out.push(open);
    }
    return out;
  }

  /**
   * Expire everything past its deadline, settling each to deny EXACTLY ONCE, and
   * hand the settled entries back.
   *
   * The return value is what lets RECORD-01's writer rewrite those asks' rows
   * without this module ever hearing about a database: an ask that expires with
   * nobody sweeping would leave `tool_calls.decision` reading `'ask'` forever for
   * a call that was in fact denied, which is the Repudiation mitigation missing
   * (T-04-ASK-30). `hooks.ts` drives this from the `ApprovalPoll` branch and from
   * every `open` — the poll loop is the clock, so there is no new timer.
   *
   * Publishes once per sweep that changed something, never once per entry: a
   * floor that sweeps every second must not notify every second.
   */
  sweep(now: number): PendingApproval[] {
    const settled: PendingApproval[] = [];
    const reapBefore = now - this.ttlMs * REAP_AFTER_TTLS;
    for (const e of [...this.entries.values()]) {
      if (e.verdict === 'pending' && now >= e.expiresAt) {
        e.verdict = 'deny';
        const { verdict, ...open } = e;
        void verdict;
        settled.push(open);
        continue;
      }
      // A settled entry is kept one extra TTL so a shim's final poll still reads
      // the real verdict, then dropped — the registry is in-memory and an
      // overnight run opens a lot of questions.
      if (e.verdict !== 'pending' && e.expiresAt <= reapBefore) this.entries.delete(e.id);
    }
    if (settled.length > 0) this.publish(this.list());
    return settled;
  }
}
