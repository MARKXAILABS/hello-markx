import { useEffect, useRef } from 'react';
import { useStore, type Agent, type QueuedMessage, type StationKind, type ToolKind } from '@/store/store';
import {
  buildSpawnCommand,
  ASSISTANT_MODEL,
  inferAgentProvider,
  isClaudeProvider,
  tokenizeCommand,
  type HarnessConfig
} from '@/store/config';
import {
  clearCommandForProvider,
  compactionCommandForProvider,
  remoteControlCommandForProvider,
  terminalReadyToReceive
} from '../../../shared/providerAutomation';
import { DEFAULT_CONTEXT_TRIGGER, type ContextRule } from '../../../shared/triggers';
import type { AgentProvider } from '../../../shared/agentProvider';
import {
  acquireTerminal,
  resetTerminal,
  isTerminalAutomationSafe,
  terminalAutomationBlockFor,
  disposeOrphanedTerminals
} from '@/components/terminalPool';
import { OFFICE_CAST, DEFAULT_CHARACTER } from '@/scene/office/cast';

const GOD_ID = 'god';
/** Accent palette for MAIN-spawned (voice-hired) agents — picked deterministically
 *  from the agent id so the same agent always gets the same colour. Mirrors the
 *  AddAgentModal palette. */
const SPAWN_ACCENTS = ['coral', 'mint', 'sky', 'lemon', 'lilac', 'peach'] as const;
const GOD_PTY = `pty-${GOD_ID}`;

const REMOTE_CONTROL_SETTLE_MS = 1500;
// After a god/agent spawn, hold off the inbox-wake + queue-drain typers for this
// long while the readiness handshake + provider-specific boot sequence runs.
const BOOT_GRACE_MS = 35_000;
// How often the renderer re-reads its draft/picker gate (#5). Only CHANGES are
// sent, so this is the latency of a draft starting or ending, not a message rate.
const VETO_REPORT_MS = 1500;
// How often a STANDING veto is repeated. Main expires a veto after VETO_TTL_MS
// (5 min) so a renderer that died mid-draft cannot wedge the floor's autonomy;
// a live renderer therefore has to keep asserting. Comfortably inside that.
const VETO_REASSERT_MS = 60_000;
// A PTY quiet for this long is safe for the renderer to type into on its own.
// Mirrors main's delivery.ts IDLE_MS, which is the authority — this copy exists
// because the renderer cannot import from main. Keep them in step.
const PTY_QUIET_MS = 8_000;
// How often orphaned pooled terminals are swept (#20). A leaked terminal costs
// memory, not correctness, so reclaiming it a few seconds late is free.
const TERMINAL_REAP_MS = 30_000;

// The first thing Michael (god) is told on a fresh spawn — orient him and put
// him to work running the floor. Kept terse and action-oriented.
const INITIAL_GOD_PROMPT = [
  "You're online as Michael, the orchestrator of the hive. Get oriented, then start running the floor:",
  '1. Read your memory.md and drain every message in your inbox.',
  '2. Review board.md + tasks.json and the current roster of agents (active vs archived).',
  '3. Check fleet health: read fleet.json in the hive root for every agent\'s live tokens, cost, status, breaker level, and inbox backlog (`claude agents` will NOT show your hive\'s agents). Flag anyone stalled, over-budget, or breaker-armed.',
  '4. Skim COMMANDS.md (hive root) for the Claude Code commands you can use — and run `mempalace wake-up` for a memory digest if the CLI is available.',
  'Then begin orchestrating: triage requests, delegate work to the team, and keep everyone unblocked. You are fully autonomous — there is no approval queue, so handle tool-permission prompts in this session yourself (the human can approve them remotely from their phone).'
].join('\n');

// Per-pty submission chain. Every submitToPty for a given pty is appended here so
// two callers (e.g. the boot sequence's /remote-control and the protocol seed that
// follows it) can NEVER interleave their text + Enter — which jammed them onto one
// line and produced "Unknown command: /remote-control<next prompt>".
const writeChains = new Map<string, Promise<void>>();
const readyPids = new Map<string, number>();

async function waitForTerminalReady(
  ptyId: string,
  provider: AgentProvider,
  timeoutMs = 30_000
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const live = await window.cth.listPtys();
    const pty = live.find((entry) => entry.id === ptyId);
    if (!pty) throw new Error(`PTY exited before becoming ready: ${ptyId}`);
    if (readyPids.get(ptyId) === pty.pid) return;
    if (terminalReadyToReceive(pty.hasOutput, Date.now() - started, provider)) {
      readyPids.set(ptyId, pty.pid);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`PTY did not become ready within ${timeoutMs}ms: ${ptyId}`);
}

/**
 * Scrub text on its way into a live TUI. The single trust boundary for #2.
 *
 * The bracketed-paste wrap in `submitToPty` is a FENCE, not a boundary the
 * sender may move. A body carrying the literal bytes ESC[201~ closes the paste
 * early, and everything after it arrives as KEYSTROKES — including "\r", which
 * submits. Hive text is written by other agents, by Slack and by webhook
 * `message` bodies, so this is untrusted input: into a coding CLI that is
 * prompt injection wearing the human's face, and into a custom-command shell it
 * is direct command execution. It defeats the whole "who may type into a
 * terminal" model in docs/message-queue.md.
 *
 * So: drop both paste markers, then every C0 control except the "\n" and "\t"
 * that real multi-line mail legitimately contains. "\r" goes with them — the
 * submit is ours to send, never the message's. Nothing else is touched: an
 * over-eager filter that mangles ordinary agent mail is its own bug.
 */
export function sanitizePtyText(text: string): string {
  return text
    .replace(/\x1b\[20[01]~/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

/** What the Stop arm decided: the patch to merge (or nothing), and whether the
 *  agent's breaker override should be cleared. */
export interface StopArmOutcome {
  patch: Partial<Agent> | null;
  clearBreaker: boolean;
}

/**
 * What a turn-end means for one agent — extracted out of effect 2 so it can be
 * asserted where it ships, the way `sanitizePtyText` above is.
 *
 * THE RULE: a SYNTHESIZED turn-end is not a turn-end for an agent the floor
 * already calls blocked.
 *
 * `synthesized` is set only by main's idle-quiesce backstop
 * (`DeliveryService.quiesce`, src/main/delivery.ts), which flips any PTY silent
 * past QUIESCE_IDLE_MS. An agent parked on a permission prompt paints a static
 * frame and emits nothing further, so it looks exactly like a finished turn to a
 * silence heuristic — and idling it erased the one cue that it needs a human.
 *
 * The guard keys on the event's SOURCE, never on `blocked === false` plus the
 * status alone, for two reasons that pull in opposite directions:
 *   • Claude Code's OWN Stop (src/main/hooks.ts) is a real report and must keep
 *     working exactly as it did — same three populated keys, so a shape or status
 *     heuristic would swallow it too.
 *   • `usePtyParser`'s BLOCK_HINTS match a bare "(y/n)" against the terminal
 *     tail, so an agent that merely ECHOES those bytes is falsely marked blocked.
 *     Its recovery is its next real turn-end. A status-only guard would take that
 *     recovery away and wedge the agent's status paint permanently (R-21 — note
 *     its stronger claim, that mail stops, is false: main's `drainQueue` has no
 *     status gate and keeps delivering).
 *
 * `clearBreaker` stays true for every real turn-end including the blocked-agent
 * case: that write is the ONLY clearer of `breakerLevel` in this file, and
 * skipping it would strand a constrained agent forever (R-22).
 *
 * Not asserted anywhere, deliberately: that `blockReason` survives. `updateAgent`
 * merges and the idle patch has never cleared it, so a normally-idled agent
 * already carries a stale one (R-23). Pinning that would make the eventual fix
 * look like a regression.
 */
export function stopArmDecision(
  self: Pick<Agent, 'status'> | undefined,
  e: { blocked?: boolean; synthesized?: boolean },
  breakerArmed = false
): StopArmOutcome {
  // A blocked Stop means the agent is being re-engaged to process its inbox —
  // it's NOT idle, so keep it working until it genuinely stops. Breaker
  // precedence (#5C) is unchanged: a constrained/stopped agent stays 'looping'.
  if (e.blocked) {
    return breakerArmed
      ? { patch: null, clearBreaker: false }
      : { patch: { status: 'working', action: 'reading inbox', carrying: undefined }, clearBreaker: false };
  }
  if (e.synthesized && self?.status === 'blocked') return { patch: null, clearBreaker: false };
  // A genuine stop clears any breaker override — the run is over.
  return { patch: { status: 'idle', action: 'idle', carrying: undefined }, clearBreaker: true };
}

/**
 * Type a line into an agent's Claude Code TUI and actually submit it.
 *
 * Writing the text and the carriage return in a single chunk makes the TUI
 * treat the whole thing as a paste, so the "\r" lands as a newline inside the
 * input box instead of submitting — the command just sits there as text. We
 * send the text first, then the Enter as a separate keystroke a tick later so
 * the prompt is registered and executed. Idle autonomous agents thus act on a
 * dispatched instruction on their own.
 *
 * Submissions to the same pty are serialized (and each settles for `settleMs`
 * after Enter) so concurrent callers can't jam their input together.
 *
 * The text is wrapped in bracketed-paste markers (ESC[200~ … ESC[201~) so the
 * TUI treats it as ONE paste: embedded newlines land as literal newlines in the
 * input box. Without them, every "\n" in a multi-line message acted as Enter —
 * the message submitted line-by-line in fragments (the agent saw only the last
 * chunk). The closing Enter, sent a tick later, submits the whole block. (#24) */
function submitToPty(
  ptyId: string,
  text: string,
  provider: AgentProvider,
  settleMs = 250
): Promise<void> {
  const prev = writeChains.get(ptyId) ?? Promise.resolve();
  const next = prev.catch(() => { /* a failed prior write must not stall the chain */ }).then(async () => {
    await waitForTerminalReady(ptyId, provider);
    // Bracketed paste (ESC[200~ … ESC[201~) only matters for MULTI-LINE text, so a
    // stray "\n" doesn't submit early (#24). Single-line text (nudges, slash
    // commands) is sent raw — some TUIs (Antigravity's agy) treat the paste
    // markers as literal input and never submit, so skipping them is more robust.
    // Sanitise BEFORE the wrap and before the multi-line test — the body decides
    // neither where the paste ends nor when Enter is pressed (#2).
    const clean = sanitizePtyText(text);
    const payload = clean.includes('\n') ? `\x1b[200~${clean}\x1b[201~` : clean;
    // writePty NEVER rejects for a dead pty — it resolves { ok:false, error:
    // 'no pty: …' } — so an unchecked await here made every failed delivery look
    // successful (the queue-drain then destroyed the message it had already
    // popped, #36). Surface the failure as a rejection; the chain itself is
    // immune (the prev.catch above absorbs it for the next writer).
    const wrote = await window.cth.writePty(ptyId, payload);
    if (!wrote?.ok) throw new Error(wrote?.error ?? `pty write failed: ${ptyId}`);
    await new Promise((r) => setTimeout(r, 140));
    const submitted = await window.cth.writePty(ptyId, '\r');
    if (!submitted?.ok) throw new Error(submitted?.error ?? `pty write failed: ${ptyId}`);
    await new Promise((r) => setTimeout(r, settleMs));
  });
  writeChains.set(ptyId, next);
  return next;
}

/**
 * The main-process surface that the autonomy half of #5 adds (preload declares
 * it there, main emits/handles it). Reached through a loose cast, the same way
 * `onContextTrigger` already is below, so this half compiles and runs whether or
 * not that half has landed yet: every call is optional-chained, and a missing
 * method degrades to "the renderer simply doesn't report / doesn't hear", never
 * a crash.
 *
 * The names are the cross-cluster contract — do not rename one side only.
 */
interface AutonomyApi {
  onHiveDelivered?: (cb: (e: { to: string; from: string; id: string }) => void) => () => void;
  onHiveFailover?: (
    cb: (e: { agentId: string; phase: 'start' | 'done' | 'failed'; account?: string; error?: string }) => void
  ) => () => void;
  hiveDeliveryVeto?: (agentId: string, reason: string | null) => void;
  ptyIdleFor?: (agentId: string) => Promise<number>;
}

function autonomyApi(): AutonomyApi {
  return window.cth as unknown as AutonomyApi;
}

/* Slack-origin kanban promotion MOVED TO MAIN with the drain (FLOOR-02).
 * `ensureSlackCard` ran in the drain's `.then()`, so a Slack request delivered
 * with the window closed would have landed in the terminal with no card behind
 * it and nothing for the done-observer to reply into. It is now
 * `onQueueDelivered` in `src/main/index.ts`, where the delivery happens. Its
 * one-shot task read went with it: `hive.addTask` is already a no-op on a
 * colliding id, which is the only thing that read was ever checking.
 */

/** Wrap a user message as an enrich task for the assistant. The assistant's
 *  system prompt has the full instructions; this just frames the one task. */
function enrichTaskPrompt(text: string): string {
  return [
    `ENRICH TASK: ${text}`,
    '',
    '(Identify the relevant project, cd in, gather READ-ONLY context, then send the improved,',
    'self-contained prompt to Michael via an outbox message with "to":"god". Do not do the task yourself.)'
  ].join('\n');
}

/** Tool name → where the avatar walks + what it carries. */
const TOOL_STATION: Record<string, { station: StationKind; carry?: ToolKind }> = {
  Read: { station: 'shelf', carry: 'Read' },
  Edit: { station: 'desk', carry: 'Edit' },
  Write: { station: 'desk', carry: 'Write' },
  Bash: { station: 'terminal', carry: 'Bash' },
  Grep: { station: 'shelf', carry: 'Grep' },
  Glob: { station: 'shelf', carry: 'Glob' },
  WebFetch: { station: 'web', carry: 'WebFetch' },
  WebSearch: { station: 'web', carry: 'WebSearch' },
  TodoWrite: { station: 'board', carry: 'TodoWrite' },
  // #5A — delegating to a sub-agent reads as "handing off at the outbox".
  Task: { station: 'mailbox', carry: 'TodoWrite' }
};

/** Resolve a tool name to its station/glyph. Falls back: any `mcp__*` tool →
 *  the MCP station (previously these silently sat at the desk, #5A gap); anything
 *  else → the desk. */
function stationForTool(tool: string): { station: StationKind; carry?: ToolKind } {
  if (TOOL_STATION[tool]) return TOOL_STATION[tool];
  if (tool.startsWith('mcp__')) return { station: 'mcp', carry: 'MCP' };
  // Heuristic fallback for non-Claude tool names (Antigravity sends run_command,
  // ListDir, write_file, … — its hook names differ from Claude's exact tags).
  // Match write/edit BEFORE read so "write_file" → desk, not shelf.
  const t = tool.toLowerCase();
  if (/command|bash|shell|exec|terminal|run_/.test(t)) return { station: 'terminal', carry: 'Bash' };
  if (/web|fetch|browser|http|url/.test(t)) return { station: 'web', carry: 'WebFetch' };
  if (/write|edit|create|patch|replace|apply/.test(t)) return { station: 'desk', carry: 'Write' };
  if (/read|list|view|dir|glob|grep|search|find|file|cat|\bls\b/.test(t)) return { station: 'shelf', carry: 'Read' };
  return { station: 'desk' };
}

/** At/above this window size an agent counts as "large context" and is judged
 *  against `minContextPctLargeWindow` instead. Sits between the two real-world
 *  window sizes the app ever sees (200k and 1M) so neither lands ambiguously. */
const LARGE_CONTEXT_WINDOW = 500_000;

/**
 * How full this agent's context window is, 0-100, or null when we have no
 * reading at all.
 *
 * Two sources feed the store and only one is exact: the status-line shim pushes
 * real `contextTokens` + `contextLimit` (effect 2d), while the transcript poll
 * (2c) backfills tokens ONLY. So an agent can legitimately know its token count
 * without knowing its window — infer the window the same way 2c does rather
 * than throwing the token reading away.
 */
function contextFillPct(a: Agent): number | null {
  if (a.contextTokens === undefined || !Number.isFinite(a.contextTokens)) return null;
  const limit = a.contextLimit && a.contextLimit > 0
    ? a.contextLimit
    : (/1m/i.test(a.model ?? '') ? 1_000_000 : 200_000);
  return (a.contextTokens / limit) * 100;
}

/**
 * The context-pressure gate: is this agent full enough to be worth interrupting?
 *
 * `minContextPct` of 0 disables the gate (the rule's cadence alone fires it).
 *
 * FAIL-OPEN when we have no reading. That is the deliberate choice: context
 * telemetry arrives over the Claude status-line/hook path, so most non-Claude
 * providers report nothing at all. Failing closed there would silently reinstate
 * the very bug this replaces — a fleet that never compacts — only harder to
 * notice. An unmetered agent therefore falls back to time-only firing, which is
 * exactly the old behaviour and no worse.
 */
function passesContextPressure(a: Agent, rule: ContextRule): boolean {
  const large = (a.contextLimit ?? 0) >= LARGE_CONTEXT_WINDOW;
  const bar = large ? rule.minContextPctLargeWindow : rule.minContextPct;
  if (!(bar > 0)) return true;
  const pct = contextFillPct(a);
  if (pct === null) return true;
  return pct >= bar;
}

/**
 * The renderer-side glue for the hive:
 *   1. spawns the god agent into Michael's room when none is running,
 *   2. drives avatar state from real Claude Code hook events, and
 *   3. wakes idle agents that have unread inbox messages so collaboration
 *      doesn't stall while an agent sits at its prompt.
 */
export function useHive(config: HarnessConfig | null): void {
  // The LATEST config, readable from a long-lived IPC callback without making that
  // callback's effect depend on `config`. The account-failover subscription (#12)
  // needs account LABELS at the moment an event ARRIVES, not at the moment it
  // subscribed: its effect is keyed on `onboardingComplete`, so it captured the
  // config object from the render at which that last changed. An account renamed
  // - or ADDED - after mount was therefore reported to the user by raw id
  // ("switching to acc_7f3a..."), which is the one string that identifies nothing.
  // Mirrored in an effect rather than assigned during render, so render stays pure.
  const configRef = useRef(config);
  useEffect(() => { configRef.current = config; }, [config]);

  // Per-agent context size at the last auto-/compact queued. See the latch note
  // in the context-trigger effect: an idle agent's token count is frozen, so
  // without this the pressure gate re-fires on the identical number every cycle.
  const lastCompactUsed = useRef<Record<string, number>>({});
  // In-flight spawn guard so a re-render / StrictMode double-mount can't spawn
  // Michael twice (the window between the listPtys check and spawnPty is racy).
  const godSpawning = useRef(false);
  // Per-agent timestamp until which auto-typers (inbox-wake #3, queue-drain #4)
  // must leave the agent alone — set while its boot sequence is typing so nothing
  // collides with /remote-control + the orientation prompt.
  const bootGraceUntil = useRef<Record<string, number>>({});
  // Per-pty timestamp guarding auto-revive (effect #7) against a double-respawn
  // when power-resume + screen-unlock arrive back-to-back: an id revived (or
  // mid-revive) within REVIVE_DEBOUNCE_MS is skipped. Set BEFORE the async spawn
  // so a re-entrant event can't race a second respawn for the same id.
  const reviving = useRef<Record<string, number>>({});
  // Reactive so the assistant bootstrap (effect #1b) re-runs once Michael is ready.
  const godStatus = useStore((s) => s.godStatus);
  // #5C/#7C.4 — latest circuit-breaker level per agent. When 'constrained'/
  // 'stopped' the avatar is pinned to 'looping' and hook events must NOT flip it
  // back to 'working' (the flicker the spec calls out); only a genuine Stop clears it.
  const breakerLevel = useRef<Record<string, string>>({});

  // 1) Bootstrap the god agent (source of truth = live PTYs, to dodge restarts).
  useEffect(() => {
    if (!config?.onboardingComplete || !config.harnessHome) return;
    let cancelled = false;
    useStore.getState().setGodStatus('booting');
    const t = setTimeout(async () => {
      if (cancelled) return;
      const live = await window.cth.listPtys().catch(() => []);
      if (live.some((p) => p.id === GOD_PTY)) { // already running — keep restored entry
        if (!cancelled) useStore.getState().setGodStatus('ready');
        return;
      }
      // Synchronous guard (no await between check and set) → exactly one spawn.
      if (cancelled || godSpawning.current) return;
      godSpawning.current = true;
      useStore.getState().removeAgent(GOD_ID); // clear any stale restored entry

      const godProvider = config.godProvider ?? 'claude';
      const godModel = config.godModel;
      const command = buildSpawnCommand(config, godModel, godProvider);
      const [exe, ...args] = tokenizeCommand(command.trim());
      const res = await window.cth.spawnPty({
        id: GOD_PTY,
        cwd: config.harnessHome!,
        command: exe,
        provider: godProvider,
        args,
        cols: 100,
        rows: 30,
        // Restore Michael's prior conversation across an app restart. His session
        // id lives in the hive registry (recorded from his hooks), so the main
        // process attaches `--resume <id>`; a missing transcript falls back to a
        // fresh session. Without this the most important context on the floor —
        // the orchestrator's — was lost on every restart.
        resume: true,
        // `account` pins Michael to a Claude pool account (Settings/Command
        // Center → godAccount); undefined = the machine's /login account.
        // `accountPolicy: 'auto'` lets the pool pick the least-loaded healthy
        // account instead — main reports the one it landed on in `res.account`.
        hive: {
          id: GOD_ID, name: 'Michael', provider: godProvider, cwd: config.harnessHome!, isGod: true, role: 'orchestrator (god)',
          account: godProvider === 'claude' ? config.godAccount : undefined,
          accountPolicy: godProvider === 'claude' ? config.godAccountPolicy : undefined
        }
      });
      if (cancelled) { godSpawning.current = false; return; }
      // Keep the reason. 'failed' on its own renders as a friendly "EMPTY FLOOR"
      // with nothing to act on, and the usual cause is a CLI the user picked in
      // onboarding but never installed — which the error says verbatim (#12).
      if (!res.ok) { godSpawning.current = false; useStore.getState().setGodStatus('failed', res.error); return; }
      // The pool may have resolved `auto` / swapped a cooling pin: keep the
      // config pin in step so the engine row + the next boot agree with main.
      if (godProvider === 'claude' && res.account !== config.godAccount) {
        void window.cth.updateConfig({ godAccount: res.account }).catch(() => { /* best-effort */ });
      }
      const god: Agent = {
        id: GOD_ID,
        name: 'Michael',
        character: 'michael',
        accent: 'lemon',
        description: 'god — runs the floor, triages requests, escalates only critical calls to you',
        project: 'hive',
        tmuxTarget: '',
        cwd: config.harnessHome!,
        status: 'idle',
        action: 'running the floor',
        progress: 0,
        currentStation: 'desk',
        ptyId: GOD_PTY,
        command: command.trim(),
        provider: godProvider,
        model: godModel,
        account: res.account,
        accountPolicy: godProvider === 'claude' ? config.godAccountPolicy : undefined,
        ...(res.accountSwitchedFrom && res.account ? { accountSwitch: { from: res.accountSwitchedFrom, to: res.account, ts: Date.now() } } : {}),
        isGod: true,
        recentTextTs: Date.now()
      };
      useStore.getState().addAgent(god);
      useStore.getState().setGodStatus('ready');

      // Kick Michael off once his TUI is up. Always re-enable remote control so
      // the human can approve permission prompts from their phone (best-effort — a
      // failed/unknown slash command just prints to his terminal and is harmless).
      // Then, ONLY on a genuinely fresh spawn, hand him the orientation prompt —
      // a RESUMED Michael already has his full context and must not be re-oriented
      // mid-thread (that would reset the floor's situational awareness). Both go
      // through the per-pty submit chain, so they're strictly sequential and can't
      // jam together; the boot-grace window keeps the inbox-wake/drain loops off
      // Michael until he's settled. The live-PTY branch above skips this entirely.
      const resumedGod = res.resumed === true;
      bootGraceUntil.current[GOD_ID] = Date.now() + BOOT_GRACE_MS;
      void (async () => {
        try {
          const remoteCommand = remoteControlCommandForProvider(godProvider, 'Michael');
          if (remoteCommand) {
            // settleMs pauses the chain ~1.5s after /remote-control before the
            // orientation prompt (fresh spawns only) is submitted next.
            await submitToPty(GOD_PTY, remoteCommand, godProvider, REMOTE_CONTROL_SETTLE_MS);
          }
          if (!cancelled && !resumedGod) {
            // A type-into-tui god (Crush) can't ride its hive protocol on argv, so the
            // main process hands it back as seedPrompt — type it FIRST (identity), then
            // the orientation kick. Serialized via writeChains so they can't jam. (ondev-b)
            if (res.seedPrompt) await submitToPty(GOD_PTY, res.seedPrompt, godProvider);
            await submitToPty(GOD_PTY, INITIAL_GOD_PROMPT, godProvider);
          }
        } catch { /* PTY may have died during startup */ }
        finally { bootGraceUntil.current[GOD_ID] = 0; }
      })();
    }, 1200);
    return () => { cancelled = true; clearTimeout(t); };
    // `config` in full is deliberately NOT a dependency. This effect SPAWNS
    // Michael - it clears any stale registry entry, calls spawnPty and types his
    // orientation prompt. ESLint wants the whole object because
    // `buildSpawnCommand(config, ...)` takes it; re-running on every config change
    // would respawn the orchestrator whenever ANY unrelated setting is saved,
    // throwing away his resumed session and the floor's situational awareness with
    // it. The two keys that must re-run it are named. The rest are read inside the
    // 1.2s timeout, at spawn time, which is the moment their values matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.onboardingComplete, config?.harnessHome]);

  // 2) Drive avatars from real hook events emitted by each agent's shim.
  useEffect(() => {
    return window.cth.onHiveHookEvent((e) => {
      if (!e.agentId) return;
      const { updateAgent, agents } = useStore.getState();
      const self = agents.find((a) => a.id === e.agentId);
      if (!self) return;
      // Breaker precedence (#5C): a constrained/stopped agent stays 'looping'
      // regardless of in-flight tool/prompt/compact events.
      const blevel = breakerLevel.current[e.agentId];
      const breakerArmed = blevel === 'constrained' || blevel === 'stopped';
      // Hook events are the authoritative status source for real agents (the
      // pty-stream parser only refines the on-floor action/station).
      if (e.event === 'PreCompact') {
        // #5C — agent entered /compact; show it's boxing up context, not frozen.
        if (!breakerArmed) updateAgent(e.agentId, { status: 'compacting', action: 'compacting context', carrying: undefined });
      } else if (e.event === 'PostCompact') {
        if (!breakerArmed) updateAgent(e.agentId, { status: 'working', action: 'resumed', carrying: undefined });
      } else if (e.event === 'PreToolUse' && e.tool) {
        const m = stationForTool(e.tool);
        if (!breakerArmed) updateAgent(e.agentId, { status: 'working', currentStation: m.station, carrying: m.carry, action: `using ${e.tool}` });
        useStore.getState().bumpToolCount(e.agentId); // usage proxy for the command center
      } else if (e.event === 'PostToolUse' || e.event === 'UserPromptSubmit') {
        // A turn is in progress (prompt submitted / tool just finished) — keep
        // it working so it doesn't flicker idle between tool calls.
        if (!breakerArmed) updateAgent(e.agentId, { status: 'working' });
      } else if (e.event === 'PreInvocation') {
        // Antigravity (agy): the model is being called — it's thinking/working.
        if (!breakerArmed) updateAgent(e.agentId, { status: 'working', action: 'thinking' });
      } else if (e.event === 'PostInvocation') {
        // agy's per-turn boundary. Unlike Claude, agy's Stop fires only on process
        // EXIT, so without this an agy worker would never register as idle and the
        // inbox-wake nudge (idle-only) could never reach it — its mail would sit
        // undrained. Treat it as idle; a follow-up tool/turn re-sets working.
        if (!breakerArmed) updateAgent(e.agentId, { status: 'idle', action: 'idle', carrying: undefined });
      } else if (e.event === 'Stop' || e.event === 'SubagentStop') {
        // The choice lives in `stopArmDecision` (above) so it can be tested; `self`
        // is the store row this effect already read, so no second subscription and
        // no second copy of the status.
        const stop = stopArmDecision(self, e, breakerArmed);
        if (stop.clearBreaker) breakerLevel.current[e.agentId] = 'healthy';
        if (stop.patch) updateAgent(e.agentId, stop.patch);
      } else if (e.event === 'Notification' && !breakerArmed) {
        // Claude Code fires Notification for two very different situations:
        //   1. it genuinely needs the human (a permission / approval prompt), or
        //   2. the prompt has merely gone idle ("Claude is waiting for your
        //      input") — i.e. the agent answered and has nothing queued.
        // Only (1) is a real "needs you". Treating (2) as blocked made Michael
        // march to the door with a red "!" right after finishing, so detect the
        // idle case and let him linger on the floor instead.
        const msg = (e.message ?? '').toLowerCase();
        const idleWaiting = !msg
          || msg.includes('waiting for your input')
          || msg.includes('is idle')
          || msg.includes('waiting for input');
        const needsHuman = msg.includes('permission')
          || msg.includes('approve')
          || msg.includes('confirm')
          || msg.includes('needs your');
        if (needsHuman && !idleWaiting) {
          // A permission prompt is a full stop for whoever is sitting at it, so
          // BOTH get 'blocked'. Sub-agents used to be downgraded to 'waiting' —
          // which also means "parked, nothing to do", so a stuck worker was
          // indistinguishable from a spare one (#12). WHO it is parked on is a
          // separate flag: only the god escalates to the human.
          // FLOOR-14 (#42) — NO toast call here, deliberately. This branch is
          // driven by a hook `Notification` event, and main already fired the
          // OS toast for that exact event when it handled the payload
          // (`hooks.ts` — the `event === 'Notification'` branch). Adding
          // `hiveNotifyBlocked` here would be two toasts for one event; the
          // renderer-only path that main genuinely cannot see is the terminal
          // one, in `usePtyParser`.
          updateAgent(e.agentId, { status: 'blocked', waitingOnGod: !self.isGod });
        } else {
          // Idle notification — responded, nothing to do. Linger, don't flag.
          updateAgent(e.agentId, { status: 'idle', action: 'idle', carrying: undefined });
        }
      }
    });
  }, []);

  // 2b) Consume circuit-breaker state (#7C.4/#5C). Lane A's breaker policy (#6)
  //     pushes BreakerState on `control:breakerState`; this gives it PRECEDENCE
  //     over hook-derived status: a constrained/stopped agent is pinned to
  //     'looping' (see the breakerArmed guard above) until it genuinely Stops.
  useEffect(() => {
    return window.cth.onBreakerState((s) => {
      breakerLevel.current[s.agentId] = s.level;
      const { updateAgent, agents } = useStore.getState();
      if (!agents.some((a) => a.id === s.agentId)) return;
      if (s.level === 'constrained' || s.level === 'stopped') {
        updateAgent(s.agentId, { status: 'looping', action: s.reason || 'breaker armed', carrying: undefined });
      }
      // 'healthy'/'steering' clear the pin; the next hook event refreshes status.
    });
  }, []);

  // 2b2) Operator-gated tool calls (#7C.1). Main denies the call at the
  //      PreToolUse boundary and reports it here — and nothing had ever
  //      subscribed, so a gated tool was invisible on the floor (#12). Record it
  //      as the agent's blockReason so the detail panel can name WHICH tool was
  //      refused and why. `status` is deliberately left alone: the deny is
  //      instant and the agent keeps running, and the PreToolUse hook event that
  //      follows this on the same boundary would overwrite it anyway.
  useEffect(() => {
    return window.cth.onApprovalRequest(({ agentId, tool, reason }) => {
      const { updateAgent, agents, pushFeed } = useStore.getState();
      if (!agents.some((a) => a.id === agentId)) return;
      updateAgent(agentId, {
        blockReason: {
          summary: `${tool ?? 'A tool'} was blocked`,
          detail: reason ?? 'Denied by operator policy — ungate it from the Command Center to let this agent continue.',
          actions: []
        }
      });
      pushFeed(agentId, `\x1b[31m⛔ ${tool ?? 'tool'} blocked\x1b[0m ${reason ?? ''}`);
    });
  }, []);

  // 2c) Context gauge backfill: poll each live agent's current context size
  //     (tokens) from its session transcript — only until the status line
  //     (effect 2d) has delivered exact numbers for that agent.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    const poll = async () => {
      const { agents, updateAgent } = useStore.getState();
      for (const a of agents) {
        if (!a.ptyId) continue;
        // The status line pushes exact numbers after every response (effect
        // 2d) — this transcript poll only backfills agents whose status line
        // hasn't fired yet (e.g. freshly restored, no response so far).
        if (a.contextLimit !== undefined) continue;
        try {
          const ctx = await window.cth.agentContext(a.id);
          if (ctx === null) continue;
          const hinted = /1m/i.test(a.model ?? '') ? 1_000_000 : 200_000;
          const limit = Math.max(hinted, ctx > 200_000 ? 1_000_000 : 0);
          const progress = Math.max(0, Math.min(8, Math.round((ctx / limit) * 8)));
          updateAgent(a.id, { contextTokens: ctx, progress });
        } catch { /* ignore — try again next tick */ }
      }
    };
    const t = setTimeout(poll, 3000); // first fill shortly after boot
    const iv = setInterval(poll, 15000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [config?.onboardingComplete]);

  // 2d) Push-based context gauge: the status-line shim forwards the session's
  //     EXACT context accounting (tokens + real window size) after every
  //     response — no probing, no transcript guesswork.
  useEffect(() => {
    return window.cth.onHiveContextUpdate(({ agentId, tokens, limit }) => {
      // Defense-in-depth: the main process already filters limit > 0, but the
      // renderer must not trust IPC blindly — limit 0 would put NaN progress
      // into the store (NaN survives the Math.min/max clamp).
      if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(tokens)) return;
      const progress = Math.max(0, Math.min(8, Math.round((tokens / limit) * 8)));
      useStore.getState().updateAgent(agentId, { contextTokens: tokens, contextLimit: limit, progress });
    });
  }, []);

  // 2e) THE TERMINAL HANDOFF IS MAIN'S NOW (D-11 gap 1). About 25 lines stood
  //     here: a hive-terminal-handoff IPC subscription that queued a hive
  //     message addressed to a non-Claude (hookless or proxy-tier) agent as a
  //     work-order prompt, deduped through an "already handled" id set that
  //     existed because this subscription re-fires every window reload. It
  //     died with the window — a headless floor (DAEMON-01) has no renderer
  //     to hear that event at all, so every one of those messages silently
  //     bounced to god with a subject blaming "renderer unavailable", which
  //     was never the true cause once main had no window to ask.
  //
  //     `HiveManager`'s injected `handoff` dep (`src/main/floor/boot.ts`) is
  //     the replacement: it formats the same work-order text (moved
  //     byte-identical into `src/shared/queueDelivery.ts`) and calls
  //     `delivery.enqueue()` — the SAME main-owned queue this file's queue
  //     view (effect 4, below) already reads. No id-dedup set needed there:
  //     the hive-side handoff method has exactly two call sites, both inside
  //     one `hive.ts` `send()` pass, so main is called once per routed
  //     message — the renderer's re-subscribe-on-reload problem does not
  //     exist in main.

  // 2e) THE PTY-quiescence IDLE BACKSTOP IS MAIN'S NOW (#5). It used to be a 4 s
  //     setInterval here that listed every PTY over IPC and flipped any 'working'
  //     agent quiet for 12 s to idle — the linchpin that makes canReceiveInbox
  //     safe for bridges whose turn-end signal never fires. Living in the renderer
  //     it did not run with the window closed, which is the exact floor-stall #5
  //     exists to end. It is now a branch of main's delivery tick
  //     (`src/main/delivery.ts` `quiesce()`), reading the same `lastOutputAt` main
  //     already tracks, honouring the same breaker pin and boot grace, and
  //     announcing the flip as a Stop-shaped `hive:hookEvent` — which effect 2
  //     above already maps to idle, so the UI behaves exactly as it did.

  // 3) THE INBOX WAKE IS MAIN'S NOW (#5). This used to be a 4 s poll that read
  //    EVERY agent's full inbox over IPC — main answering each one with a
  //    synchronous readdir + read + JSON.parse per message file — purely to ask
  //    "is there anything new?" (#20), and it kept a per-agent Set of nudged
  //    message ids that, by its own comment, never shrank. Both are gone with
  //    it: main owns the roster, the inboxes and `hive.inboxBacklog`, so it can
  //    answer that question without asking the renderer, and it keeps answering
  //    it when this window is closed, reloading or crashed — which is the whole
  //    point of #5.

  // 3b) THE PROTOCOL SEED IS MAIN'S NOW (D-11 gap 2), for WORKERS. About 35
  //     lines stood here: a 1.5 s setInterval scanning every agent for an
  //     unconsumed `seedPrompt` (Crush's bare TUI rejects a positional seed —
  //     Cobra reads it as a subcommand, "Unknown command" — so main hands the
  //     protocol back this way instead), a `seeded` ref guarding against
  //     re-typing it, and a SEED_BOOT_MS setTimeout that re-parked the seed
  //     if the worker was `waiting`/`blocked` when the timer fired (a
  //     permission prompt would eat the seed's trailing Enter). It died with
  //     the window — a headless floor spawns Crush workers with no renderer
  //     to run this interval at all.
  //
  //     `DeliveryService.noteSpawn`'s `seed` param (`src/main/index.ts`'s
  //     spawn call site) is the replacement: main enqueues the seed through
  //     the SAME queue this file's queue view (effect 4, below) already
  //     reads, gated by the SAME boot grace + idle + veto policy every other
  //     queued message rides. The one guard NOT reproduced: the
  //     `waiting`/`blocked` re-park has no main-side view (that status is
  //     renderer-derived from stream events) — stated here and in
  //     `delivery.ts`'s `noteSpawn` doc comment, not silently dropped.
  //
  //     god-as-Crush still seeds from ITS OWN boot sequence above (the
  //     ordered remote-control-command → seed → orientation-prompt chain) —
  //     only the worker path this effect used to own moved.

  // 4a) WHAT MAIN DELIVERED (#5). Main owns the inbox wake, the Stop-hook drain
  //     and the failover respawn now — all three used to run here and all three
  //     died with the window. It reports every hive message it moves, and two
  //     things follow, both of them the renderer being a view:
  //       • the agent is being handed mail, so the floor should say so — this
  //         effect's ONLY job now.
  //     There is no second job. This used to also stamp a per-agent flush
  //     cooldown so the renderer's own drain would not type on top of main's
  //     write; that drain is gone (see the tombstone below) and the cooldown ref
  //     it stamped was left write-only, with a comment naming a deleted effect as
  //     its reader. The ref is removed with the comment rather than half of each —
  //     `DeliveryService.drainQueue`'s own FLUSH_COOLDOWN_MS is the live one, and
  //     it lives beside the writer it paces.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    return autonomyApi().onHiveDelivered?.(({ to }) => {
      const { agents, updateAgent } = useStore.getState();
      const self = agents.find((a) => a.id === to);
      if (!self || self.status === 'blocked') return; // never talk over a prompt
      updateAgent(to, { status: 'working', action: 'reading inbox', carrying: undefined });
    });
  }, [config?.onboardingComplete]);

  // 4) THE QUEUE AND ITS DRAIN ARE MAIN'S NOW (#5 / FLOOR-02). About 150 lines
  //    stood here: a `dispatch()` over `messageQueues`, an `inFlight` Set, a
  //    `sendFailures` map, a per-agent flush cooldown, a send-attempt ceiling,
  //    a 200 ms debounced store subscription and a 3 s backstop tick. All of it
  //    died with the window - which is why a message typed into the composer was
  //    NOT delivered with the floor closed, the exact stall #5 exists to end.
  //
  //    The loop could never have moved on its own, and its own note here said so:
  //    "it holds messages the RENDERER produced ... it lives in renderer state,
  //    and main has no view of it". So the QUEUE moved. It is a file main owns
  //    (`delivery-queue.json`, beside the hive's other live files), and the drain
  //    moved with it onto the tick `src/main/delivery.ts` already runs, behind the
  //    same idle / boot-grace / pause / veto guards and through the same single
  //    `submit()` PTY gate - ADR-0001 intact, one writer, not two.
  //
  //    What is left here is a VIEW. Main pushes the whole queue on every mutation
  //    and every delivery; the store applies it. The five producers (composer,
  //    Slack ingress, context triggers, terminal work orders, voice bridge) are
  //    untouched at their call sites - they still call `enqueueMessage`, which is
  //    now an IPC forwarder rather than a store write. That is deliberate: the
  //    store action is the renderer's ONE gate onto this path, exactly as its own
  //    dedup comment argued, and a per-call-site rewrite would leave the next
  //    producer someone adds free to write the slice directly again.
  useEffect(() => {
    const off = window.cth.onHiveQueue?.((queues) => { useStore.getState().setQueues(queues); });
    // Pull once as well: a reloaded window subscribes AFTER main may already have
    // pushed, and a timer that re-asks is the thing #20/FLOOR-11 just deleted.
    void window.cth.hiveQueue?.({ op: 'list' }).then((r) => {
      if (r.queues) useStore.getState().setQueues(r.queues);
    }).catch(() => { /* main's half absent - the view stays empty, nothing breaks */ });

    // The ONE thing on this path that still depends on WHAT was delivered, kept
    // verbatim from the deleted drain: zero the gauge on a DELIVERED `/clear`.
    // The new session's context is unknown until statusLine fires after the first
    // post-clear response, so leaving the old value shows a stale-full bar.
    const offDelivered = window.cth.onHiveQueueDelivered?.(({ to, text }) => {
      if (text.trim().toLowerCase() !== '/clear') return;
      useStore.getState().updateAgent(to, { contextTokens: 0, contextLimit: undefined, progress: 0 });
    });

    return () => { off?.(); offDelivered?.(); };
  }, []);

  // 4b) THE VETO (#5). The renderer keeps its draft/picker gate — it is the only
  //     party that can see the xterm buffer and the user's keystrokes — but only
  //     as an opinion it reports UP. Main owns the decision to deliver.
  //
  //     Scope is deliberately just that. Main already refuses to type into a PTY
  //     that has not been quiet for its own idle bar (delivery.ts IDLE_MS, read
  //     from `ptyManager.idleFor`), unsampled and at the instant it writes — a
  //     second, slower copy of that judgement here would only add latency and one
  //     IPC probe per agent per tick, which is the shape of problem #20 is about.
  //     What main CANNOT see is the human's half-typed line, so that is what we
  //     send.
  //
  //     Sent on change, and re-asserted on a slow cadence because a veto in main
  //     expires (VETO_TTL_MS) so a dead renderer can never wedge the floor — a
  //     live one therefore has to keep saying it. Clearing is change-only: there
  //     is no point repeating `null`.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    const reported: Record<string, { reason: string | null; sentAt: number }> = {};
    const tick = (): void => {
      const api = autonomyApi();
      if (!api.hiveDeliveryVeto) return; // main's half not present — nothing to tell
      const now = Date.now();
      const agents = useStore.getState().agents;
      for (const a of agents) {
        if (!a.ptyId) continue;
        const reason = terminalAutomationBlockFor(a.ptyId);
        const last = reported[a.id];
        const stale = !!reason && (!last || now - last.sentAt >= VETO_REASSERT_MS);
        if (last && last.reason === reason && !stale) continue;
        reported[a.id] = { reason, sentAt: now };
        api.hiveDeliveryVeto(a.id, reason);
      }
      // Don't become the thing #20 complained about: forget agents that left.
      for (const id of Object.keys(reported)) {
        if (!agents.some((x) => x.id === id)) delete reported[id];
      }
    };
    const iv = setInterval(tick, VETO_REPORT_MS);
    tick();
    return () => clearInterval(iv);
  }, [config?.onboardingComplete]);

  // 4c) Reap orphaned pooled terminals (#20). Dropping an agent left its xterm in
  //     the pool for the life of the window — its scrollback, its host element
  //     and its live pty subscription — on BOTH paths that drop one (the archive
  //     broadcast in 5b, and `reconcileWithLivePtys` at startup). Sweeping the
  //     pool against the live roster covers both, and any path added later,
  //     without a dispose call wired into each one that could race a
  //     kill→respawn under the same pty id.
  useEffect(() => {
    const sweep = (): void => {
      const live = useStore.getState().agents
        .map((a) => a.ptyId)
        .filter((id): id is string => !!id);
      disposeOrphanedTerminals(live);
    };
    const iv = setInterval(sweep, TERMINAL_REAP_MS);
    return () => clearInterval(iv);
  }, []);

  // 5) Pipe inbound Slack messages into Michael's queue. The main-process Slack
  //    webhook server pushes each verified message here via IPC; enqueueing to
  //    GOD_ID lands it in Michael's queue exactly as if the user had typed it
  //    into the composer — `DeliveryService.drainQueue` (src/main/delivery.ts)
  //    then submits it to his PTY, riding main's tick. See the tombstone above,
  //    "4) THE QUEUE AND ITS DRAIN ARE MAIN'S NOW".
  //    We immediately ack in the triggering thread and stash the thread coords
  //    so the office can post its summary back later.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    return window.cth.onSlackMessage((msg) => {
      const hasFiles = Array.isArray(msg.files) && msg.files.length > 0;
      if (!msg?.text?.trim() && !hasFiles) return;
      let text = msg.text.trim();
      // Append local file paths so the agent (Claude Code) can Read them directly.
      if (hasFiles) {
        const fileLines = msg.files!.map((f) => `- ${f.path} (${f.name})`).join('\n');
        text = text ? `${text}\n\nAttached files:\n${fileLines}` : `Attached files:\n${fileLines}`;
      }
      const slack = { channel: msg.channel, thread_ts: msg.thread_ts };
      // `text` (raw user request + any attachment lines) drives the human-facing
      // kanban card title/description. The autonomy preamble — supplied verbatim
      // by main, the authoritative source — is prepended ONLY to god's working
      // instruction (what gets typed into his PTY), so the board stays readable
      // while every Slack-origin god-session runs under the autonomy policy. When
      // main sends no preamble (older build), god just gets the raw text.
      const instruction = msg.autonomyPreamble ? `${msg.autonomyPreamble}${text}` : undefined;
      useStore.getState().enqueueMessage(GOD_ID, text, { slack, instruction });
      // Immediate "queued" acknowledgement in the originating Slack thread.
      void window.cth.slackReply({
        channel: msg.channel,
        thread_ts: msg.thread_ts,
        text: ':hourglass_flowing_sand: *Received.* Your request has been queued — the team is on it and will reply here when done.'
      });
    });
  }, [config?.onboardingComplete]);

  // 5b) Pipe hive tasks addressed to non-Claude agents (e.g. Codex) into their
  //     terminal queues. When main routes a message to a non-claude provider it
  //     emits 'hive:enqueueToAgent' instead of bouncing; we enqueue the raw
  //     task text here so `DeliveryService.drainQueue` (src/main/delivery.ts)
  //     submits it to the REPL when the agent idles — see the tombstone above,
  //     "4) THE QUEUE AND ITS DRAIN ARE MAIN'S NOW".
  //     No inbox nudge, no /compact — just the verbatim subject+body text.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    return window.cth.onHiveEnqueue?.((msg) => {
      if (!msg?.targetId || !msg?.text?.trim()) return;
      useStore.getState().enqueueMessage(msg.targetId, msg.text.trim());
    });
  }, [config?.onboardingComplete]);

  // 5b) MAIN-initiated roster changes (rt-5 voice spawn/kill). The renderer store is
  //     only mutated by renderer-initiated hires (AddAgentModal); a voice hire/kill
  //     runs in MAIN (spawnAgentCore / teardownPty, owner=null) and would otherwise
  //     be invisible on the floor. Main broadcasts; we build/archive the card here.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    const offSpawn = window.cth.onHiveAgentSpawned?.((rec) => {
      if (!rec?.id) return;
      // addAgent is idempotent, but bail early if the renderer already carded it.
      if (useStore.getState().agents.some((a) => a.id === rec.id)) return;
      const key = (rec.name || rec.id).toLowerCase();
      const character =
        OFFICE_CAST.find((m) => m.name === key || m.displayName.toLowerCase() === key)?.name ??
        DEFAULT_CHARACTER;
      let h = 0;
      for (const ch of rec.id) h = (h + ch.charCodeAt(0)) % SPAWN_ACCENTS.length;
      const project = (rec.cwd || '').split(/[\\/]/).filter(Boolean).pop() || 'hive';
      const agent: Agent = {
        id: rec.id,
        name: rec.name || rec.id,
        character,
        accent: SPAWN_ACCENTS[h],
        description: rec.role || 'a fresh harness',
        project,
        tmuxTarget: '',
        cwd: rec.cwd,
        status: 'idle',
        action: 'starting up',
        progress: 0,
        currentStation: 'desk',
        ptyId: rec.id,
        command: rec.command,
        provider: rec.provider as Agent['provider'],
        isGod: false,
        recentTextTs: Date.now()
      };
      useStore.getState().addAgent(agent);
    });
    const offArchive = window.cth.onHiveAgentArchived?.((e) => {
      if (e?.id) useStore.getState().archiveAgent(e.id);
    });
    return () => { offSpawn?.(); offArchive?.(); };
  }, [config?.onboardingComplete]);

  // 5c) v0.3.4 voice bridge: main stages queue insertions (clear_context) and
  //     pushes them here, so delivery rides EVERY existing gate — idle-only,
  //     boot grace, draft/picker safety, auto-delivery pause. Main owns the
  //     confirm policy; this is just the enqueue.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    return window.cth.onRealtimeEnqueue?.((evt) => {
      if (!evt?.agentId || typeof evt.text !== 'string' || !evt.text.trim()) return;
      const { agents, enqueueMessage } = useStore.getState();
      if (!agents.some((a) => a.id === evt.agentId)) return;
      enqueueMessage(evt.agentId, evt.text.trim());
    });
  }, [config?.onboardingComplete]);

  // 6) CONTEXT TRIGGERS (compact / clear). Main decides WHEN — cadence, and which
  //    half of the rule fired — and pushes `{action, rule}`; this decides WHO, then
  //    queues the provider's own command so the drain (#4) delivers it only at an
  //    idle prompt, never jamming a working terminal.
  //
  //    THE PRESSURE GATE. main/config.ts has long DOCUMENTED that auto-compact
  //    "only compacts agents whose context has filled past a threshold (30% for
  //    ~250k windows, 20% for ~1M windows)". No such check was ever implemented:
  //    every live agent with a resolvable command got compacted on every tick,
  //    hourly, however empty its window was. This makes the documented behaviour
  //    real — `rule.minContextPct`, or `minContextPctLargeWindow` once the window
  //    is >= LARGE_CONTEXT_WINDOW, must be met before an agent is interrupted.
  //    (The shipped bars are now 60/40, twice the stale doc's numbers; see
  //    DEFAULT_CONTEXT_TRIGGER. The doc comment in config.ts is still stale.)
  //
  //    Dedupe generalises to both actions: keyed on the command's own verb, so a
  //    queued `/compact` blocks a second compact without blocking a `/clear`.
  useEffect(() => {
    if (!config?.onboardingComplete) return;

    const fire = (action: 'compact' | 'clear', rule: ContextRule): void => {
      const { agents, messageQueues, enqueueMessage } = useStore.getState();
      for (const a of agents) {
        if (!a.ptyId) continue;
        const provider = inferAgentProvider(a.command, a.provider);
        const command = action === 'clear'
          ? clearCommandForProvider(provider, rule.message)
          : compactionCommandForProvider(provider, rule.message);
        // No trustworthy command for this CLI (Crush's palette-only TUI, Copilot's
        // print mode, an unknown custom binary) — leave its terminal alone.
        if (!command) continue;
        if (!passesContextPressure(a, rule)) continue;
        const verb = command.trimStart().split(/\s+/)[0];
        const queued = messageQueues[a.id] ?? [];
        if (queued.some((m) => m.text.trimStart().startsWith(verb))) continue;
        // The latch, compact only. `used` reaches this gate from Claude's status
        // line, which only reports after an API call. A /compact on an agent that
        // has done nothing since the last one makes no call at all — Claude refuses
        // it locally with "Not enough messages to compact" — so the count stays
        // byte-identical and the pressure gate passes on the same number the next
        // cycle, and the next. Seen in the wild: /compact every hour for 15 straight
        // hours at exactly 400958 tokens, then 11 more at exactly 221772, each a
        // no-op the agent still had to read and answer. Higher thresholds make it
        // rarer, not absent: any agent parked above its bar repeats forever.
        //
        // So remember the count at the last compact queued and skip while it is
        // byte-identical. Deliberately equality and not "hasn't grown": the rule's
        // thresholds own that decision, and an agent still above them deserves its
        // /compact whether the count moved up or down. A frozen count is the one
        // state those thresholds cannot reason about, because nothing they could do
        // would ever change it. /clear needs no equivalent — the queue drain zeroes
        // the store reading when it lands.
        const used = a.contextTokens ?? 0;
        if (action === 'compact') {
          if (lastCompactUsed.current[a.id] === used) continue;
          lastCompactUsed.current[a.id] = used;
        }
        enqueueMessage(a.id, command);
      }
    };

    // The typed `onContextTrigger` arrives with the main-process/preload change
    // that emits it; access it defensively so this lands independently of that.
    const off = (window.cth as unknown as {
      onContextTrigger?: (
        cb: (p: { action: 'compact' | 'clear'; rule: ContextRule }) => void
      ) => () => void;
    }).onContextTrigger?.((p) => {
      if (!p?.rule) return;
      fire(p.action === 'clear' ? 'clear' : 'compact', p.rule);
    });

    // LEGACY fallback: main still emits the old parameterless auto-compact until
    // it switches over. Treat it as the default compact rule so behaviour is
    // continuous across that landing. Harmless if both fire — the dedupe above
    // drops the duplicate.
    const offLegacy = window.cth.onAutoCompact(
      () => fire('compact', DEFAULT_CONTEXT_TRIGGER.compact)
    );

    return () => { off?.(); offLegacy?.(); };
  }, [config?.onboardingComplete]);

  // 7) Auto-revive wedged PTYs after the Mac sleeps/locks. Kevin's main-process
  //    keepalive catches up its schedules on wake and DETECTS terminals that were
  //    live before sleep but went silent after resume — it reports those ids on
  //    `power:resume`. We respawn EXACTLY those, resuming each agent's prior CLI
  //    session (--resume) so the terminal self-heals instead of the user clicking
  //    "Restart & Continue". This reuses the same resume-spawn flow as that button
  //    (CommandCenterPanel.restartWithModel) and restoreTeam's worktree handling.
  //    Pure addition: an empty `dead[]` is a no-op; healthy PTYs are never touched.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    // Skip an id we revived (or are mid-reviving) within this window — coalesces
    // a resume + unlock that arrive back-to-back (main also coalesces on its side).
    const REVIVE_DEBOUNCE_MS = 8000;

    const revive = async (deadId: string): Promise<void> => {
      const now = Date.now();
      if (now - (reviving.current[deadId] ?? 0) < REVIVE_DEBOUNCE_MS) return;
      reviving.current[deadId] = now; // claim BEFORE any await so re-entry can't double-spawn
      // Only respawn a PTY we actually own; never touch an unknown/healthy id.
      const a = useStore.getState().agents.find((x) => x.ptyId === deadId);
      if (!a) return;
      try {
        const cfg = await window.cth.getConfig();
        // Isolated agents run inside their worktree (a.cwd is the base repo); re-enter
        // it if it still exists, else fall back to the base cwd — same as restoreTeam.
        let cwd = a.cwd;
        if (a.worktreePath && (await window.cth.gitIsRepo(a.worktreePath))) cwd = a.worktreePath;
        await window.cth.killPty(deadId);
        // Soft-reset the pooled xterm in place (no-op if none): re-arm input and
        // clear the stale frame so the revived TUI paints clean — like the button.
        resetTerminal(deadId);
        const provider = inferAgentProvider(a.command, a.provider);
        // Prefer the agent's exact recorded command (same model/flags); fall back to
        // a rebuilt one only if it predates the persisted `command` field.
        const command = (a.command ?? '').trim() || buildSpawnCommand(cfg, a.model, provider);
        const [exe, ...args] = tokenizeCommand(command);
        // Re-pin the agent's Claude pool account across the revive (god reads the
        // config pin; workers carry their own on the roster record). The policy
        // rides along so an `auto` agent is re-balanced by the pool.
        const account = provider === 'claude' ? (a.isGod ? cfg.godAccount : a.account) : undefined;
        const accountPolicy = provider === 'claude' ? (a.isGod ? cfg.godAccountPolicy : a.accountPolicy) : undefined;
        const hive = a.isGod
          ? { id: a.id, name: a.name, cwd, provider, isGod: true, role: 'orchestrator (god)', account, accountPolicy }
          : a.isAssistant
          ? { id: a.id, name: a.name, cwd, provider, isAssistant: true, role: "Michael's prep assistant", account, accountPolicy }
          : { id: a.id, name: a.name, cwd, provider, role: a.description, account, accountPolicy };
        // Spawn at the terminal's real grid so the TUI's absolute cursor moves land
        // in the right cells (a size mismatch scatters the redraw).
        const entry = acquireTerminal(deadId);
        let cols = 100, rows = 30;
        try { entry.fit.fit(); cols = entry.term.cols; rows = entry.term.rows; } catch { /* host not sized yet */ }
        const res = await window.cth.spawnPty({
          id: deadId,
          cwd,
          command: exe,
          provider,
          args,
          cols,
          rows,
          // The worktree (if any) already exists on disk — re-enter it, do NOT
          // re-isolate (that conflicts on the existing path/branch).
          isolate: false,
          // Reattach the agent's prior session so no context is lost on revive.
          resume: true,
          hive
        });
        if (res.ok) {
          reviving.current[deadId] = Date.now(); // re-stamp so the debounce covers the spawn
          useStore.getState().updateAgent(a.id, {
            status: 'idle', action: 'revived after sleep',
            // record the account the pool actually landed this revive on
            ...(provider === 'claude' ? { account: res.account } : {}),
            ...(res.accountSwitchedFrom && res.account ? { accountSwitch: { from: res.accountSwitchedFrom, to: res.account, ts: Date.now() } } : {})
          });
          if (a.isGod && provider === 'claude' && res.account !== cfg.godAccount) {
            void window.cth.updateConfig({ godAccount: res.account }).catch(() => { /* best-effort */ });
          }
        } else {
          delete reviving.current[deadId]; // let a later power:resume retry it
          console.error('[autorevive] respawn failed for', a.id, res.error);
        }
      } catch (err) {
        delete reviving.current[deadId];
        console.error('[autorevive] respawn threw for', deadId, err);
      }
    };

    return window.cth.onPowerResume?.((e) => {
      const dead = Array.isArray(e?.dead) ? e.dead : [];
      if (!dead.length) return; // healthy wake — nothing wedged, no-op
      for (const id of dead) void revive(id);
    });
  }, [config?.onboardingComplete]);

  // 8) Claude account failover (#5). MAIN owns the kill→respawn now. It used to
  //    run HERE — a full teardown/respawn executor with a closure-local
  //    re-entrancy Set — which meant a reload or a crashed panel mid-switch left
  //    the agent killed and never respawned, "switching…" forever (upstream
  //    #151). Main already owns spawnAgentCore, the pool, the account tokens and
  //    the pty; it is the only party that can finish what it started.
  //
  //    What is left here is the LABEL. Main reports each phase on
  //    `hive:failover` and the floor says which one the agent is in — which is
  //    all a view should be doing.
  useEffect(() => {
    if (!config?.onboardingComplete) return;
    const labelOf = (id?: string): string =>
      configRef.current?.claudeAccounts?.find((x) => x.id === id)?.label ?? id ?? 'another account';

    const offFailover = autonomyApi().onHiveFailover?.(({ agentId, phase, account, error }) => {
      const { agents, updateAgent } = useStore.getState();
      if (!agents.some((a) => a.id === agentId)) return;
      if (phase === 'start') {
        updateAgent(agentId, { status: 'idle', action: `switching to ${labelOf(account)}…` });
      } else if (phase === 'done') {
        // The store still holds the account it was on until we overwrite it —
        // that is the `from` of the switch the card shows as "switched A→B".
        const from = agents.find((a) => a.id === agentId)?.account;
        updateAgent(agentId, {
          status: 'idle',
          action: `switched to ${labelOf(account)}`,
          ...(account ? { account, accountSwitch: { from: from ?? '', to: account, ts: Date.now() } } : {})
        });
      } else {
        updateAgent(agentId, { action: `account switch failed: ${error ?? 'unknown error'}` });
      }
    });

    // NOT moved: the "your account is usable again" kick. It is a one-line nudge
    // to an already-parked agent, not a respawn, and nothing about it needs to
    // survive this window — but it IS still the renderer typing on its own, so
    // if main ever takes it over this handler must go with it or the agent gets
    // the same sentence twice.
    //
    // #30: `status` alone is not evidence that the prompt is free. It is inferred
    // from 4 s of terminal silence for any provider without hooks, and 4 s of
    // silence during a long tool call looks exactly like 4 s of silence between
    // turns — so this used to be able to type into the middle of one. Ask main
    // what the PTY has ACTUALLY been doing (`ptyIdleFor`, the same handshake its
    // own delivery loop gates on) and only type into a genuinely quiet one. A
    // missing/failed probe or `-1` (no live PTY) fails closed: no nudge.
    const offResumed = window.cth.onClaudeAccountResumed((e) => {
      const labels = (e?.accounts ?? []).map((x) => x.label).join(', ');
      for (const id of e?.agentIds ?? []) {
        const a = useStore.getState().agents.find((x) => x.id === id);
        // Only a parked agent needs the kick; one mid-turn is already working.
        if (!a?.ptyId || a.status === 'working' || a.status === 'thinking') continue;
        const ptyId = a.ptyId;
        const provider = inferAgentProvider(a.command, a.provider);
        void (async () => {
          const idle = await autonomyApi().ptyIdleFor?.(a.id).catch(() => -1);
          if (!(typeof idle === 'number' && idle >= PTY_QUIET_MS)) return;
          await submitToPty(ptyId, `Claude account ${labels} is usable again (${e.reason}). Continue where you left off.`, provider)
            .catch(() => { /* dead pty — nothing to wake */ });
        })();
      }
    });
    return () => { offFailover?.(); offResumed(); };
  }, [config?.onboardingComplete]);
}
