/**
 * Auto mode, per agent — the ONE derivation the three text renderings share.
 *
 * The agent card, the fullscreen roster row and the command-centre row all show
 * an `AUTO` chip when an agent runs with permissions bypassed. They call THIS
 * function; none of them re-derives the state locally, because three copies of a
 * safety rule are three chances for one of them to drift and start lying.
 *
 * Deliberately pure and dependency-free (no React, no store, no `@/` value
 * import) so it runs under plain `node --test` — the chip is a SAFETY indicator
 * and a false answer in either direction is worse than no chip at all, so the
 * rule has to be testable without a DOM.
 */
import {
  autoModeFlagForProvider,
  inferAgentProvider,
  type AgentProvider
} from '@shared/agentProvider';

/**
 * Does THIS agent act without asking for tool approval?
 *
 * `liveAutoMode` is the floor's global `config.autoMode` toggle. It is the
 * argument of LAST resort — see the `opencode` arm — and is deliberately ignored
 * everywhere else.
 */
export function isAutoModeAgent(
  provider: AgentProvider | undefined,
  command: string | undefined,
  liveAutoMode: boolean
): boolean {
  // Legacy agents carry no `provider` (store.ts: "Defaults to 'claude' when
  // unset ... inferred from command"), so resolve it the same way every other
  // consumer does rather than assuming claude and mislabelling a codex agent.
  const p = inferAgentProvider(command, provider);

  // `custom` is an arbitrary binary the operator typed in. Its preset carries
  // `autoFlag: ''` AND has no env route (unlike opencode below), so the floor
  // never bypasses it — not even with the global toggle on. Returning
  // `liveAutoMode` here would put a permissions-bypassed badge on an engine that
  // has no bypass path at all, which is the worst failure this chip can have.
  if (p === 'custom') return false;

  // `opencode` is the ONE documented exception. Its TUI exposes no
  // skip-permissions flag (`autoFlag: ''`), so nothing lands on the command
  // string; the bypass is instead written into OPENCODE_CONFIG_CONTENT at spawn
  // (`src/main/index.ts`: `if (cfg.autoMode) oc.permission = {edit:'allow',
  // bash:'allow', webfetch:'allow'}`) and is NOT recorded on the agent. The live
  // toggle is the only signal the renderer has for it.
  //
  // KNOWN CEILING: opencode's bypass is baked at spawn like everyone else's, so
  // this arm can lie in both directions for that provider alone — a toggle
  // flipped after spawn moves the chip without moving the agent. Closing it
  // needs the spawn-time value recorded on the Agent shape, which is a store
  // widening, not a renderer change.
  if (p === 'opencode') return liveAutoMode;

  // Everyone else: the agent's OWN command string, never the live toggle.
  //
  // `buildSpawnCommand` (store/config.ts) appends the provider's flag ONCE, at
  // spawn. Toggling auto mode off afterwards does not de-bypass a running agent,
  // and toggling it on does not bypass one that is already up — so a chip driven
  // off `config.autoMode` lies in BOTH directions. The command string is what
  // the PTY is actually running, which is the only thing "runs with permissions
  // bypassed" can honestly mean.
  const flag = autoModeFlagForProvider(p).trim();
  if (!flag) return false;
  return (command ?? '').includes(flag);
}

// ── the floor's global toggle, published once and read by all three ──────────
//
// `config.autoMode` lives in App's state. The fullscreen roster row is handed it
// as a prop, but the agent card is rendered by AgentStrip from flat display
// props and has no path to it, and the command-centre row keeps its own config
// copy — three routes to one boolean is exactly the drift this module exists to
// stop. So App publishes it here and all three renderings read it back, using
// the module-singleton + `useSyncExternalStore` shape already established by
// `components/terminalFontSize.ts` and `design/theme.ts`.
//
// The subscribe/get pair is plain functions on purpose: React stays in the
// .tsx files, so this module still loads under `node --test`.
let liveToggle = false;
const listeners = new Set<() => void>();

/** The last published value of the floor's global `config.autoMode`. */
export function getLiveAutoMode(): boolean {
  return liveToggle;
}

/** Publish the floor's global `config.autoMode`. No-op when unchanged, so a
 *  redundant publish cannot churn every subscriber. App owns the only call. */
export function setLiveAutoMode(on: boolean): void {
  if (on === liveToggle) return;
  liveToggle = on;
  for (const l of [...listeners]) l();
}

export function subscribeLiveAutoMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Resolve the store row behind an `AgentCard`.
 *
 * The card is a presentational component: it is handed `name`, `status`,
 * `ptyId` and friends, never the agent id, and the strip that feeds it belongs
 * to another plan's file set. Auto mode and the model both live on the store's
 * `Agent`, so the card resolves its own row — the same shape `useHasTerminalDraft`
 * already uses inside this component, keyed on the one identifier it is handed.
 *
 * `ptyId` is the strong key and covers every RUNNING agent, which is the only
 * kind that can be bypassed. The name fallback exists for agents with no live
 * PTY (restored-but-dead), whose model still has to render — and it matches only
 * when the name is unambiguous, so a duplicate name fails safe to "unknown"
 * rather than attaching one agent's bypass state to another's card.
 */
export function agentRowForCard<T extends { ptyId?: string; name: string }>(
  agents: readonly T[],
  ptyId: string | undefined,
  name: string
): T | undefined {
  if (ptyId) return agents.find((a) => a.ptyId === ptyId);
  let found: T | undefined;
  for (const a of agents) {
    if (a.name !== name) continue;
    if (found) return undefined; // ambiguous — better nothing than the wrong agent
    found = a;
  }
  return found;
}
