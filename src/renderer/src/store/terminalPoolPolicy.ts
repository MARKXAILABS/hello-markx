/**
 * Which pooled xterm terminals may be thrown away — pure, so the two rules that
 * bound the pool can be tested without xterm or a DOM.
 *
 * The pool holds ONE live Terminal per pty for the app's lifetime (see
 * terminalPool.ts for why). Nothing ever bounded it: a long session accumulated
 * a terminal — its scrollback, its host element and its pty subscription — for
 * every agent that had ever run, including every agent that had since been
 * archived or died with the previous session (#20).
 *
 * Two rules, and they cover different failures:
 *   • the CAP is the backstop for churn (many short-lived agents), and
 *   • the SWEEP is the fix for the actual leak (an agent leaves the roster).
 *
 * Both refuse to touch a terminal that is currently attached to a view. A
 * detached terminal can always be rebuilt on its next attach; disposing an
 * attached one blanks a pane the user is looking at.
 */

/** How many terminals the pool may hold. Generous on purpose: the sweep below
 *  is what reclaims dead agents, so this only has to stop unbounded growth from
 *  churn, and evicting a LIVE agent's terminal silently drops its scrollback. */
export const TERMINAL_POOL_MAX = 24;

export interface PooledTerminal {
  ptyId: string;
  /** epoch ms of the last `acquireTerminal` for this pty */
  lastUsedAt: number;
  /** the host element is currently parented into a mounted view */
  attached: boolean;
}

/**
 * The least-recently-acquired detached terminals to evict so the pool fits
 * `cap`. `keep` is the entry the caller just acquired — never evict the
 * terminal we are handing back.
 */
export function terminalsToEvict(
  entries: ReadonlyArray<PooledTerminal>,
  cap = TERMINAL_POOL_MAX,
  keep?: string
): string[] {
  const over = entries.length - cap;
  if (over <= 0) return [];
  return entries
    .filter((e) => !e.attached && e.ptyId !== keep)
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
    .slice(0, over)
    .map((e) => e.ptyId);
}

/**
 * Pooled terminals whose pty is no longer on the roster — the leak itself.
 *
 * Swept against the live roster rather than disposed at each call site that
 * drops an agent: there are several (archive, the main-process archive
 * broadcast, the dead-pty reconcile at startup, a plain remove), they did not
 * agree with each other, and the next one added would not have either.
 */
export function orphanedTerminalIds(
  pooled: ReadonlyArray<PooledTerminal>,
  livePtyIds: Iterable<string>
): string[] {
  const live = new Set(livePtyIds);
  return pooled.filter((e) => !e.attached && !live.has(e.ptyId)).map((e) => e.ptyId);
}
