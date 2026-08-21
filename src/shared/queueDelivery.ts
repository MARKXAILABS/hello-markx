/**
 * The MD queue's pure delivery policy — no fs, no IPC, no React, no Electron.
 *
 * It lived at `src/renderer/src/hooks/queueDelivery.ts` while the drain did.
 * FLOOR-02 moved the queue and its drain into MAIN (so a message composed in the
 * UI still reaches its recipient with the window closed), and main cannot import
 * through the renderer's `@/` alias — `src/shared/` is the only directory both
 * processes reach. `test/load-ts.cjs`'s `resolveTs` already resolves `@shared/`.
 *
 * The cooldown and attempt rules moved here WITH the drain rather than being
 * retyped in `src/main/delivery.ts`: two hand-written copies of "how long since
 * the last delivery to this agent" is how the two halves drift apart.
 */

/** A message parked for an agent until its terminal is free.
 *
 *  Structurally the renderer's `QueuedMessage` plus the `agentId` it used to
 *  carry as its map key, because main persists ONE flat list rather than a map:
 *  a flat array is what a single JSON file round-trips without a merge step. */
export interface QueuedDelivery {
  id: string;
  /** The recipient. Resolved against the live roster in main before it lands. */
  agentId: string;
  /** What the human sees on the card / in the pending list. */
  text: string;
  /** epoch ms this was queued — the ordering key and the "queued 2m ago" hint. */
  ts: number;
  /** Slack-originated: thread coordinates so the office can reply in-thread. */
  slack?: { channel: string; thread_ts: string };
  /** What is actually typed into the PTY, when it differs from `text` (the
   *  Slack autonomy preamble rides here so the kanban card stays readable). */
  instruction?: string;
  /** "Send now" while floor-wide auto-delivery is paused. Bypasses ONLY the
   *  pause gate — idle / draft / picker / boot-grace safety all still hold. */
  manual?: boolean;
  /** Consecutive failed PTY writes. Past MAX_SEND_ATTEMPTS the message is
   *  dropped LOUDLY rather than retried forever against a corpse (#113/#36). */
  attempts?: number;
}

/**
 * Every way a renderer may touch the main-owned queue, over the ONE channel
 * (`hive:queue`) that replaced the store's direct writes.
 *
 * A discriminated op rather than four channels on purpose: enqueue is not the
 * only mutation the renderer performs — the composer removes a row, releases one
 * with "send now" and clears the lot, and the roster drops an agent's queue when
 * the agent goes. Shipping only the enqueue half would leave those three editing
 * a VIEW while main kept delivering from the file behind it, which is precisely
 * the "two writers, no single owner" failure this migration exists to close.
 */
export type QueueOp =
  | { op: 'enqueue'; agentId: string; text: string; slack?: { channel: string; thread_ts: string }; instruction?: string }
  | { op: 'remove'; agentId: string; id: string }
  | { op: 'release'; agentId: string; id: string }
  | { op: 'clear'; agentId: string }
  | { op: 'list' };

/** Minimum gap between two deliveries to the SAME agent: back-to-back sends jam
 *  a TUI. Carried over from the renderer drain unchanged. */
export const FLUSH_COOLDOWN_MS = 4_500;

/** A message that fails this many PTY writes (a dead/crashed pty the roster
 *  still thinks is live) is dropped with a warn — bounded so the drain never
 *  spins forever on a corpse, loud so the loss is diagnosable. (#113) */
export const MAX_SEND_ATTEMPTS = 3;

/** Ceiling on one agent's parked messages. The queue is now a file main owns and
 *  main outlives every window, so "the user closed the tab" no longer bounds it:
 *  an agent with no live PTY would otherwise accumulate forever (T-P08-04).
 *  Enqueue REFUSES past this rather than evicting — silently dropping the
 *  human's oldest message is the worse of the two failures. */
export const MAX_QUEUED_PER_AGENT = 200;

/** Run one queued delivery and acknowledge it only after the sender resolves.
 * Rejections deliberately leave the queue item untouched for the next retry. */
export async function deliverWithAcknowledgement(
  send: () => Promise<void>,
  acknowledge: () => void
): Promise<boolean> {
  try {
    await send();
    acknowledge();
    return true;
  } catch {
    return false;
  }
}

/**
 * The head of `agentId`'s queue, if it may be delivered right now.
 *
 * Owns exactly the two decisions the caller must not re-derive: FIFO order
 * (array order, which `release` mutates by moving an item to the front) and the
 * per-agent cooldown. Everything the CALLER can see for itself — idle, boot
 * grace, veto, mid-failover — stays with the caller, because those are live
 * process facts and this module is deliberately free of them.
 *
 * `paused` is the operator's floor-wide auto-delivery pause. It holds everything
 * EXCEPT a message the human explicitly released with "send now" (`manual`),
 * otherwise a paused floor leaves the queue with no escape hatch at all.
 */
export function nextForDelivery(
  queue: readonly QueuedDelivery[],
  agentId: string,
  opts: { now: number; lastFlushAt: number; paused: boolean }
): QueuedDelivery | null {
  if (opts.now - opts.lastFlushAt < FLUSH_COOLDOWN_MS) return null;
  const head = queue.find((m) => m.agentId === agentId);
  if (!head) return null;
  if (opts.paused && !head.manual) return null;
  return head;
}

/** Record one failed PTY write against a message. `drop` is true once it has
 *  burned its attempts — the caller drops it and says so out loud. */
export function noteAttempt(item: QueuedDelivery): { drop: boolean } {
  item.attempts = (item.attempts ?? 0) + 1;
  return { drop: item.attempts >= MAX_SEND_ATTEMPTS };
}
