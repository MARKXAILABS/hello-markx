/**
 * Agent-patch policy — pure, so it can be unit-tested without zustand or a DOM.
 *
 * `updateAgent` is the renderer's hottest write: the pty-stream parser calls it
 * for EVERY chunk of terminal output. Two questions decide what that costs, and
 * both are answered here rather than inline in the store, because both are the
 * kind of rule that is easy to get subtly wrong and worth pinning with a test.
 */
import type { Agent } from './store';

/** Run-state an agent recomputes from its live pty on every reload. A patch made
 *  only of these is not worth a localStorage write; anything else is. Listed as
 *  the volatile set rather than the durable set on purpose — a new durable field
 *  then persists by default instead of being silently dropped. */
export const VOLATILE_AGENT_FIELDS = new Set<keyof Agent>([
  'status', 'action', 'progress', 'currentStation', 'carrying',
  'recentAssistantText', 'recentTextTs', 'blockReason',
  'contextTokens', 'contextLimit', 'lastPrompt'
]);

export function touchesDurableAgentField(patch: Partial<Agent>): boolean {
  return Object.keys(patch).some((k) => !VOLATILE_AGENT_FIELDS.has(k as keyof Agent));
}

/**
 * Would applying `patch` actually change `agent`?
 *
 * The pty parser re-asserts the same run-state on every chunk — `{ status:
 * 'working' }` arrives dozens of times a second for as long as a turn streams,
 * and each one used to reallocate the whole `agents` array, which re-rendered
 * every subscriber tree in the app for no visible difference (#20). A patch
 * whose every field already holds that value is a no-op, and a no-op must not
 * notify.
 *
 * `Object.is` per key, deliberately shallow: `blockReason` is a fresh object
 * each time it is built, so it always reads as changed — correct (we cannot
 * cheaply prove otherwise) and rare enough not to matter. A key explicitly set
 * to `undefined` compares equal to an absent field, which is right: the spread
 * in the store leaves the agent identical either way.
 */
export function patchChangesAgent(agent: Agent, patch: Partial<Agent>): boolean {
  for (const key of Object.keys(patch) as Array<keyof Agent>) {
    if (!Object.is(agent[key], patch[key])) return true;
  }
  return false;
}
