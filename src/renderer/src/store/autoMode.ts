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
  AGENT_PROVIDER_PRESETS,
  autoModeFlagForProvider,
  inferAgentProvider,
  type AgentProvider
} from '@shared/agentProvider';

/**
 * Is `flag` present on `command` as WHOLE argv tokens?
 *
 * One matcher for every arm. Two matching idioms in one 70-line safety module is
 * how the two start disagreeing about what "bypassed" means.
 *
 * A raw `command.includes(flag)` answers a substring question, and a substring is
 * not a flag: `--auto` (Kimi's bypass, `agentProvider.ts`) is a prefix of
 * `--auto-compact` and of `--autosave`, so a perfectly safe command painted the
 * AUTO chip. Tokenizing alone would swap that false positive for a false
 * NEGATIVE, because `--flag=value` is one token — so each token contributes
 * itself PLUS both sides of its first `=`, and `--permission-mode=bypassPermissions`
 * matches the same flag as `--permission-mode bypassPermissions`.
 *
 * The empty-flag guard is not defensive noise: `opencode` and `custom` both carry
 * `autoFlag: ''`, and `[].every(...)` is vacuously `true`, so without it every
 * agent alive would wear an AUTO chip.
 */
function hasBypassFlag(command: string | undefined, flag: string): boolean {
  const needles = flag.trim().split(/\s+/).filter(Boolean);
  if (needles.length === 0) return false;
  const tokens = new Set<string>();
  for (const raw of (command ?? '').split(/\s+/)) {
    if (!raw) continue;
    tokens.add(raw);
    const eq = raw.indexOf('=');
    if (eq !== -1) {
      tokens.add(raw.slice(0, eq));
      tokens.add(raw.slice(eq + 1));
    }
  }
  return needles.every((needle) => tokens.has(needle));
}

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
  // `autoFlag: ''` AND has no env route (unlike opencode below), so the FLOOR
  // never splices a bypass onto it — not even with the global toggle on, which is
  // why `liveAutoMode` is still ignored here.
  //
  // But that is not the question FLOOR-01 asks. It asks whether the AGENT is
  // running bypassed, and `buildSpawnCommand` (store/config.ts) hands a custom
  // agent's free-text command to the PTY VERBATIM — so whatever the operator
  // typed is what is really running. A bypass the floor cannot GRANT is still a
  // bypass the floor can READ, and this module's own docstring calls a missing
  // chip on a bypassed agent the worst failure this chip can have.
  //
  // Read `autoFlag`, not `autoModeFlag`: `autoFlag` is the field
  // `buildSpawnCommand` actually appends, so it is the spelling an operator who
  // copied a working command line will have typed. (The two agree on all eleven
  // presets today; `test/renderer-runstate.test.cjs` pins that agreement.)
  //
  // DELIBERATE OVER-REPORT, and it errs in the safe direction: scanning every
  // preset's flag means a generic `--auto` or `--approve` on an unrelated binary
  // also lights the chip. A cosmetic false alarm costs the operator a glance;
  // missing a real bypass costs them the thing the chip exists to prevent.
  // Narrowing it needs a per-preset "is this flag ambiguous" annotation on the
  // shared module. Do not "fix" this by returning false again.
  if (p === 'custom') {
    return AGENT_PROVIDER_PRESETS.some((preset) => hasBypassFlag(command, preset.autoFlag ?? ''));
  }

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
  //
  // Whole-token matching, shared with the custom arm above: `hasBypassFlag` also
  // owns the empty-flag guard this arm used to spell out inline.
  return hasBypassFlag(command, autoModeFlagForProvider(p));
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
