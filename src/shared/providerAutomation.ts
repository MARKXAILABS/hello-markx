import { providerPreset, type AgentProvider, type CostTracking } from './agentProvider';
import { DEFAULT_COMPACTION_FOCUS } from './triggers';

/**
 * Back-compat alias. The compaction focus used to be a private constant here;
 * it now lives in shared/triggers.ts as the DEFAULT VALUE of the user-editable
 * `ContextRule.message`, so the Triggers UI and this module cannot drift apart.
 * Kept exported under the old name for any consumer still reaching for it.
 */
export const COMPACTION_FOCUS = DEFAULT_COMPACTION_FOCUS;

/** What one provider's interactive TUI accepts for each context action. */
export interface ProviderContextCommands {
  /** Summarise-in-place. `null` = no command we can type with confidence. */
  compact: string | null;
  /** Discard-and-restart. `null` = same. */
  clear: string | null;
  /**
   * Whether the TUI parses text AFTER the compact command as a focus
   * instruction. When false the focus is DROPPED rather than typed: a CLI whose
   * slash parser ignores the remainder is harmless, but one that re-reads it as
   * a fresh prompt would silently turn a compaction into a whole extra turn.
   */
  compactTakesFocus: boolean;
}

const NO_CONTEXT_COMMANDS: ProviderContextCommands = {
  compact: null,
  clear: null,
  compactTakesFocus: false
};

/**
 * THE per-provider context-command table.
 *
 * Deliberately a total `Record<AgentProvider, …>` and NOT a switch with a
 * `default:` arm — the previous switch silently answered `null` for seven of the
 * eleven providers, so auto-compaction quietly did nothing for most of the fleet
 * and nobody found out. A total record makes the compiler stop the next person
 * who adds a provider until they have actually looked its commands up.
 *
 * `null` means "we could not establish a command we trust", NOT "we didn't
 * check". A wrong slash command typed into a live terminal is worse than no
 * command: at best it is dead text the model answers, at worst it fires some
 * other verb. Every entry below cites where it was verified — mostly by reading
 * the SHIPPED BINARY of each CLI (its own embedded command table / docs), which
 * outranks web docs because it cannot lag the installed version.
 */
const CONTEXT_COMMANDS: Record<AgentProvider, ProviderContextCommands> = {
  // claudeCommands.ts:34,37 (this repo's own catalog): `/compact` takes a focus
  // ("usage: /compact keep the auth decisions"), `/clear` starts a fresh
  // conversation and reclaims the window.
  claude: { compact: '/compact', clear: '/clear', compactTakesFocus: true },

  // Codex 0.137.0 binary, TUI slash-command description table:
  //   "summarize conversation to prevent hitting the context limit"  → /compact
  //   "clear the terminal and start a new chat"                      → /clear
  // NOTE this contradicts codexCommands.ts, which lists /clear but NOT /compact.
  // The binary is right and that catalog is incomplete (see report).
  // compactTakesFocus stays FALSE: codex's own `Usage: /…` strings spell out an
  // argument for every command that takes one (/goal, /raw, /mcp, /keymap,
  // /ide, /sandbox-add-read-dir) and /compact has none.
  codex: { compact: '/compact', clear: '/clear', compactTakesFocus: false },

  // Grok binary ships its own docs inline (04-slash-commands.md):
  //   "/compact [context] — Compress conversation history… Optionally specify
  //    what to preserve", example `/compact keep the auth implementation details`
  //   "/new — Start a new session, clearing the current conversation.
  //    Aliases: /clear"
  // `/new` is the documented spelling (and what grokCommands.ts:13 already
  // records), so prefer it over the alias.
  grok: { compact: '/compact', clear: '/new', compactTakesFocus: true },

  // Moonshot kimi-cli slash-command reference: `/compact` accepts appended
  // custom instructions ("/compact preserve database-related discussions");
  // `/clear` (alias /reset) "Clear the current session's context and start a
  // new conversation". NB `/new` there forks a session rather than discarding.
  kimi: { compact: '/compact', clear: '/clear', compactTakesFocus: true },

  // antigravity.google/docs/cli/reference (Google's own command table):
  //   "/clear  (/new)  — Clear the terminal and reset active conversation
  //    contexts."     ← a REAL context reset, and
  //   "Ctrl+L  cli.clear_screen — Refreshes and clears the visual terminal
  //    buffer."       ← the screen-only one. The two are different things, so
  // the "agy /clear only clears the screen" worry does not hold.
  // That reference lists NO compaction verb at all (zero hits for compact /
  // compress / summarize), and the shipped `agy` binary has no such literal
  // either — agy compacts AUTOMATICALLY when the window fills ("# Resuming from
  // a compaction"). Nothing to type, so: null.
  antigravity: { compact: null, clear: '/clear', compactTakesFocus: false },

  // qwen-code's bundled cli.js, verbatim:
  //   compressCommand = { name:"compress", altNames:["summarize"],
  //     description "Compresses the context by replacing it with a summary." }
  //   and its action reads `context.invocation?.args` as `customInstructions`
  //   (capped at 2000 chars) → it genuinely takes a focus.
  //   clearCommand    = { name:"clear", altNames:["reset","new"],
  //     description "Clear conversation history and free up context." }
  // It is `/compress`, NOT `/compact`: qwen dropped upstream gemini-cli's
  // `compact` altName, so `/compact` would land as plain text here.
  qwen: { compact: '/compress', clear: '/clear', compactTakesFocus: true },

  // opencode binary's command registry, verbatim:
  //   { title:"Compact session", value:"session.compact",
  //     slash:{ name:"compact", aliases:["summarize"] }, run: … }
  // and its own tip text "Run /compact to summarize long sessions near context
  // limits". That `run()` calls session.summarize({sessionID,model}) and never
  // looks at the invocation args → the focus would be silently dropped, so
  // compactTakesFocus is false.
  // `/clear` does NOT exist in the binary (zero literals); the fresh-session
  // verb is `/new` — matched exactly (`t.trim().toLowerCase()==="/new"`).
  opencode: { compact: '/compact', clear: '/new', compactTakesFocus: false },

  // Crush has NO typed slash commands at all. Its own binary strings show
  // "Summarize Session" / "New Session" as ctrl+p COMMAND-PALETTE rows, and the
  // hint "/ or ctrl+p" means a leading `/` OPENS that palette rather than
  // submitting a command. Typing "/compact" would filter a modal and leave it
  // open, swallowing everything queued behind it. Nothing safe to type: null.
  // (Crush's compact/clear are reachable only over its HTTP API.)
  crush: NO_CONTEXT_COMMANDS,

  // pi's dist/core/slash-commands.js, verbatim:
  //   { name:"compact", description:"Manually compact the session context" }
  //   { name:"new",     description:"Start a new session" }
  // and docs/compaction.md: "trigger manually with `/compact [instructions]`,
  // where optional instructions focus the summary". There is no `/clear`.
  pi: { compact: '/compact', clear: '/new', compactTakesFocus: true },

  // Copilot's INTERACTIVE mode does have `/compact [FOCUS-INSTRUCTIONS]` and
  // `/clear` — but this app never runs it interactively. The preset spawns it in
  // print mode (`initialPromptFlag: '-p'`, `canReceiveInbox: false`), which runs
  // one prompt and EXITS. There is no prompt left alive to type a slash command
  // into, so both are null by construction rather than by ignorance.
  copilot: NO_CONTEXT_COMMANDS,

  // An arbitrary user binary. We cannot know its command surface, and guessing
  // means typing slashes into someone's unknown REPL.
  custom: NO_CONTEXT_COMMANDS
};

/** The full context-command entry for a provider (unknown ids degrade to none). */
export function contextCommandsForProvider(provider: AgentProvider): ProviderContextCommands {
  return CONTEXT_COMMANDS[provider] ?? NO_CONTEXT_COMMANDS;
}

/**
 * The compaction command to type, or null when this provider has none.
 *
 * `message` is the user-editable `ContextRule.message` (default
 * `DEFAULT_COMPACTION_FOCUS`) and is appended only where the provider's parser
 * actually reads it — see `compactTakesFocus`.
 */
export function compactionCommandForProvider(
  provider: AgentProvider,
  message: string = DEFAULT_COMPACTION_FOCUS
): string | null {
  const { compact, compactTakesFocus } = contextCommandsForProvider(provider);
  if (!compact) return null;
  const focus = message.trim();
  return compactTakesFocus && focus ? `${compact} ${focus}` : compact;
}

/** Every distinct compaction verb this harness can type, across all providers.
 *  Derived from CONTEXT_COMMANDS rather than hand-listed, so a provider added to
 *  that table is covered here without a second edit anyone could forget. */
const COMPACT_VERBS: ReadonlySet<string> = new Set(
  Object.values(CONTEXT_COMMANDS)
    .map((c) => c.compact)
    .filter((c): c is string => typeof c === 'string' && c.length > 0)
);

/**
 * Is this queued text a compaction command?
 *
 * Matches the leading VERB only, so `/compact keep the auth decisions` counts
 * while a human sentence that merely mentions compaction does not — the queue
 * carries both, and mistaking prose for a command would silently drop real work.
 *
 * Provider-agnostic on purpose: the queue is keyed by agent, not provider, and a
 * duplicate `/compact` is worth dropping regardless of which CLI is going to
 * receive it.
 */
export function isCompactionCommand(text: string): boolean {
  return COMPACT_VERBS.has(text.trim().split(/\s+/)[0]);
}

/**
 * The context-clearing command to type, or null when nothing typed can reach
 * this provider.
 *
 * Per `ContextRule.message`, a non-empty message on the CLEAR rule is "the
 * literal command to send" — an override, not a suffix. That asymmetry with
 * compact is deliberate and useful: it is the operator's escape hatch for the
 * providers this table answers `null` for, and for a CLI that renames its verb
 * between releases. Empty message = the table's own bare command.
 */
export function clearCommandForProvider(
  provider: AgentProvider,
  message: string = ''
): string | null {
  const override = message.trim();
  if (override) return override;
  return contextCommandsForProvider(provider).clear;
}

/** Claude exposes remote control as a slash command; Codex uses its daemon and
 * Kimi has no equivalent slash command. */
export function remoteControlCommandForProvider(
  provider: AgentProvider,
  sessionName?: string
): string | null {
  if (provider !== 'claude') return null;
  const name = sessionName?.trim();
  return name ? `/remote-control ${name}` : '/remote-control';
}

/** Initial TUI output needs a short provider-specific settle before typing. */
export function terminalReadySettleMs(provider: AgentProvider): number {
  switch (provider) {
    case 'kimi': return 650;
    case 'grok': return 500;
    case 'codex': return 500;
    default: return 400;
  }
}

/**
 * A live TUI is ready after it has produced an initial frame and had a short
 * settle period. Do not require output to become quiet: Codex can continuously
 * repaint its status line, which previously kept queued messages blocked until
 * every readiness attempt timed out.
 *
 * `undefined` is accepted for compatibility with a renderer hot-reloaded
 * against an older main process that does not yet expose `hasOutput`.
 */
export function terminalReadyToReceive(
  hasOutput: boolean | undefined,
  elapsedMs: number,
  provider: AgentProvider
): boolean {
  return hasOutput !== false && elapsedMs >= terminalReadySettleMs(provider);
}

// ─── What the god is told each engine can do (#19) ───────────────────────────

/** The three protocol capabilities that actually change how the god should route
 *  work, collected per engine. Everything else in a preset is spawn mechanics. */
export interface ProviderCapabilities {
  provider: AgentProvider;
  /** The router may deliver hive mail here; false = it bounces back to the god. */
  mail: boolean;
  /** Where this engine's spend comes from — 'none' means no cap can see it. */
  spend: CostTracking;
  /** The compaction verb we can type, or null when nothing typed reaches it. */
  compact: string | null;
  /** FLOOR-18 — whether this engine can be driven from OUTSIDE the app (phone,
   *  another machine) on THIS host. `false` is a declared limitation, not a bug;
   *  `remoteControlAvailability` says which of the two reasons applies. */
  remote: boolean;
}

/**
 * FLOOR-18 — where each engine's remote control stands, on a given host.
 *
 *   - `'ok'`      Claude exposes it as the `/remote-control` slash command. That
 *                 is typed text, so it works on every platform.
 *   - `'windows'` The engine HAS remote control, but not here. Codex's remote
 *                 control *is* its app-server daemon, and upstream records that
 *                 daemon's lifecycle as Unix-only — a pidfile plus Unix
 *                 process/file-locking primitives: openai/codex#30372, "Codex
 *                 remote control cannot start on Windows, CLI reports daemon
 *                 lifecycle is Unix-only" (open; labelled windows-os /
 *                 app-server / remote). `enableCodexRemoteForSpawn` in
 *                 `src/main/index.ts` returns false on win32 for exactly this
 *                 reason — the two must move together.
 *   - `'none'`    The engine has no remote-control affordance at all, on any
 *                 platform (`remoteControlCommandForProvider` returns null and
 *                 there is no daemon).
 *
 * `platform` is a defaulted parameter, following `installInfoForProvider` in
 * `agentProvider.ts`, so a test can exercise BOTH Codex branches on any CI
 * runner rather than only the one it happens to be running on.
 */
export function remoteControlAvailability(
  provider: AgentProvider,
  platform: string = process.platform
): 'ok' | 'windows' | 'none' {
  if (provider === 'claude') return 'ok';
  if (provider !== 'codex') return 'none';
  return platform === 'win32' ? 'windows' : 'ok';
}

export function providerCapabilities(provider: AgentProvider): ProviderCapabilities {
  const preset = providerPreset(provider);
  return {
    provider,
    mail: preset.canReceiveInbox,
    spend: preset.costTracking,
    compact: contextCommandsForProvider(provider).compact,
    remote: remoteControlAvailability(provider) === 'ok'
  };
}

/**
 * One line telling the god what an engine can actually do — the fix for #19's
 * real damage: the god assigns mail-dependent work to a Kimi worker that cannot
 * receive mail, and reads a floor budget that silently omits five engines.
 *
 * Written for a model skimming a roster, so the MISSING capabilities shout
 * (uppercase) and the present ones stay quiet — the gaps are the actionable
 * half. Kept to one clause per capability: this is injected once per roster
 * entry, and a paragraph per agent would crowd out the prompt it decorates.
 *
 * `hive.ts` owns where this lands (it must go in a cache-safe position — the
 * roster path, not the content; see #44).
 *
 * ADR-0002 (the prompt-cache invariant) governs this string, and the REMOTE
 * CONTROL clause is the one that could have broken it. The invariant is
 * "interpolate only values stable for an agent's whole lifetime" — NOT "never
 * vary by machine": the ADR already requires per-OS text, since "every path and
 * command is written the way the agent will actually type it on the platform it
 * is running on", and a prompt cache is per-account-per-machine anyway. What
 * would break it is a value that can CHANGE BETWEEN TURNS. So the platform is
 * read once, through `remoteControlAvailability`'s defaulted `process.platform`
 * argument — a constant for the life of the process — and this line is
 * byte-identical on every turn of every agent on a given host. That is also why
 * `capabilityLine` itself grew a `remote` BIT and not a platform PARAMETER
 * (D-40): a caller free to pass a varying platform is exactly how a stable
 * prefix turns volatile, and the signature is asserted on by
 * `test/engine-parity.test.cjs`.
 */
export function capabilityLine(provider: AgentProvider): string {
  const c = providerCapabilities(provider);
  const bits = [
    c.mail ? 'mail ok' : 'NO MAIL (bounces to you)',
    c.spend === 'none' ? 'spend UNTRACKED (invisible to every budget)' : `spend tracked (${c.spend})`,
    c.compact ? `compacts ${c.compact}` : 'NO COMPACT (context cannot be reclaimed)',
    // FLOOR-18 — the gap SHOUTS and names WHICH gap it is, so the god (and the
    // human reading the roster) can tell "this engine never had remote control"
    // from "this engine has it and this machine cannot use it".
    c.remote
      ? 'remote control ok'
      : remoteControlAvailability(c.provider) === 'windows'
        ? 'REMOTE CONTROL unavailable on Windows'
        : 'NO REMOTE CONTROL'
  ];
  return `${c.provider}: ${bits.join(', ')}`;
}
