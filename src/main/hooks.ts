/**
 * HookServer — the bridge between `claude` lifecycle hooks and the harness.
 *
 * Each spawned agent is launched with `--settings` pointing its hooks at a tiny
 * shim (see HOOK_SHIM in hive.ts) that forwards the hook payload to the Unix
 * domain socket this server listens on. We then:
 *   - drive avatar state from PreToolUse/PostToolUse/Notification/etc., and
 *   - own the Stop boundary: unread hive mail is handed back as a guarded
 *     block-to-continue (#5, `drainAtStop`), so an agent drains its inbox with no
 *     renderer attached and without anything typing into its input line.
 *
 * AUTHENTICATED. The socket is a Unix-domain socket / named pipe, so ANY local
 * process could connect and post a payload claiming any `agent_id` — enough to
 * hijack another agent's --resume session id, poison the cost ledger, or clear
 * breaker state. Every payload must therefore carry `sock_token` equal to this
 * process's `hookSockToken()`; main puts that value in the agent PTY's child
 * environment as HIVE_SOCK_TOKEN, and the shims (which run as PTY descendants)
 * echo it back. Payloads without it are dropped, LOUDLY (see `authorized`).
 *
 * Runs in the Electron main process.
 */
import { createServer, type Server } from 'node:net';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { Notification, type WebContents } from 'electron';
import type { HiveManager } from './hive';
import type { HarnessConfig } from './config';
import type { ControlRegistry } from './control';
import type { CircuitBreaker } from './breaker';
import { estimateCostUsd } from './pricing';

interface HookPayload {
  hook_event_name?: string;
  agent_id?: string | null;
  /** Per-process shared secret proving the sender is one of OUR shims (see
   *  `hookSockToken`). Checked at the socket boundary, never used past it. */
  sock_token?: string;
  session_id?: string;
  transcript_path?: string;
  /** Status-line payloads only: the session's live context accounting. */
  context_window?: { total_input_tokens?: number; context_window_size?: number };
  cwd?: string;
  tool_name?: string;
  tool_input?: unknown;
  stop_hook_active?: boolean;
  prompt?: string;
  source?: string;
  notification_type?: string;
  /** Notification hook text, e.g. "Claude is waiting for your input" (idle) vs a
   *  permission request. Used to tell "needs you" from "just done / lingering". */
  message?: string;
  /** CostSample payloads only (synthesized by the proxy-bridge sidecar for
   *  qwen). Raw token counts for one response, fed to the cost ledger. */
  model?: string;
  input?: number;
  output?: number;
  cache_read?: number;
  cache_creation?: number;
}

/**
 * Per-process token every hook payload must carry, minted once at module load.
 *
 * The hook socket has no OS-level peer authentication we can lean on (a UDS
 * under the hive root, a `\\.\pipe\` name on Windows — both reachable by any
 * local process), so possession of this value IS the authentication. Main passes
 * it to spawned agents as `HIVE_SOCK_TOKEN`; the shims read it out of their
 * inherited env and put it in the payload as `sock_token`.
 */
const SOCK_TOKEN = randomBytes(32).toString('hex');

/** The token the hook shims must echo back. Main puts this in the agent PTY's
 *  child environment as `HIVE_SOCK_TOKEN`. */
export function hookSockToken(): string {
  return SOCK_TOKEN;
}

/** Fixed-width digest, so the constant-time compare below never has to branch on
 *  (and therefore leak) the token's length. */
function sha256(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

/** Throttle for the rejection log. A BROKEN env wiring rejects every payload —
 *  and the statusLine shim alone fires after every agent response — so an
 *  unthrottled line per rejection would bury the log it is meant to explain. */
const REJECT_LOG_INTERVAL_MS = 10_000;

/** How long a turn must run before its Stop is worth a desktop toast (#42).
 *  Below this the human is almost certainly still watching the terminal, and a
 *  notification per turn-end is how a floor teaches its operator to mute it. */
const LONG_TURN_MS = 2 * 60_000;

export class HookServer {
  private server: Server | null = null;
  /** agentId → the live session's transcript file, learned from hook payloads.
   *  Lets the harness read per-agent telemetry (e.g. current context size)
   *  even when several agents share one cwd. */
  private transcriptPaths = new Map<string, string>();
  /** agentId → the latest context-window accounting from the statusLine shim
   *  (current tokens + the REAL window size — 200k vs 1M, which nothing else
   *  exposes). The renderer already gets this pushed live on `hive:contextUpdate`;
   *  we also retain the last value here so a main-side read (the voice read-layer's
   *  get_agent_detail / list_agents) can report "how full is each agent's context"
   *  without depending on a renderer round-trip. */
  private contextById = new Map<string, { tokens: number; limit: number; ts: number }>();
  /** Rejected-payload accounting for the throttled log in `authorized`. */
  private rejected = 0;
  private lastRejectLog = 0;

  /** agentId → when its current turn started (the last UserPromptSubmit, or the
   *  last Stop when nothing else marked a boundary). Drives the "long task
   *  finished" toast (#42): a Stop is only worth interrupting a human for when
   *  the human has actually been waiting. */
  private turnStartedAt = new Map<string, number>();

  constructor(
    private hive: HiveManager,
    private getWebContents: () => WebContents | null,
    private getConfig: () => HarnessConfig,
    /** #7C — operator control state. Optional so tests can omit it. */
    private control?: ControlRegistry,
    /** Circuit breaker (Lane A #6.6b) — fed the hook-derived signals (session id,
     *  repeated identical tool calls). Optional so the server still runs without it. */
    private breaker?: CircuitBreaker,
    /** #5 — the guarded inbox drain at the Stop boundary (DeliveryService).
     *  Optional so tests (and a hive-less run) get the old plain Stop. */
    private drainAtStop?: (agentId: string) => { block: boolean; reason?: string },
    /** #42 — put an agent in front of the human when they click its toast. */
    private focus?: (agentId: string) => void
  ) {}

  start(): void {
    const sock = this.hive.sockPath();
    if (!sock || this.server) return;
    // Clear a stale socket file left by a previous run.
    try { if (existsSync(sock)) rmSync(sock); } catch { /* noop */ }

    this.server = createServer((conn) => {
      let buf = '';
      conn.on('data', (d) => {
        buf += d.toString();
        const nl = buf.indexOf('\n');
        if (nl === -1) return; // wait for the full line
        let payload: HookPayload = {};
        try { payload = JSON.parse(buf.slice(0, nl)); } catch { /* ignore */ }
        // THE trust boundary. Anything past this line is believed — including
        // `agent_id`, which decides whose session/ledger/breaker gets written.
        // Answer an unauthenticated peer with the same empty object a real hook
        // gets, so the socket is not also a probe for whether it guessed right.
        if (!this.authorized(payload)) { conn.end('{}'); return; }
        let res: unknown = {};
        try { res = this.handle(payload); } catch { res = {}; }
        conn.end(JSON.stringify(res ?? {}));
      });
      conn.on('error', () => { /* shim hung up — ignore */ });
    });
    this.server.on('error', (e) => console.error('[hive] hook server error:', e));
    this.server.listen(sock);
  }

  stop(): void {
    try { this.server?.close(); } catch { /* noop */ }
    this.server = null;
    const sock = this.hive.sockPath();
    try { if (sock && existsSync(sock)) rmSync(sock); } catch { /* noop */ }
  }

  /** The transcript file of an agent's CURRENT session, if any hook has fired. */
  transcriptPath(agentId: string): string | undefined {
    return this.transcriptPaths.get(agentId);
  }

  /** The latest context-window accounting for an agent (current tokens + the real
   *  window size), or undefined if no statusLine tick has fired for it yet. */
  contextFor(agentId: string): { tokens: number; limit: number; ts: number } | undefined {
    return this.contextById.get(agentId);
  }

  /**
   * Does this payload carry our per-process socket token?
   *
   * Deliberately enforced HERE, at the socket, and not inside `handle` — the
   * socket is the trust boundary, and main-side callers that build payloads
   * themselves are already inside it.
   *
   * FAIL-CLOSED, but never silently: if the PTY env ever stops carrying
   * HIVE_SOCK_TOKEN, every hook in the app goes dead at once — avatars freeze,
   * Stop never fires, the cost ledger stops filling — and a silent version of
   * that is far harder to diagnose than the hijack it prevents. So each
   * rejection says WHY, with the agent and event, throttled to one line per
   * REJECT_LOG_INTERVAL_MS plus a running count.
   */
  private authorized(p: HookPayload): boolean {
    const provided = typeof p.sock_token === 'string' ? p.sock_token : '';
    if (timingSafeEqual(sha256(provided), sha256(SOCK_TOKEN))) return true;
    this.rejected += 1;
    const now = Date.now();
    if (now - this.lastRejectLog >= REJECT_LOG_INTERVAL_MS) {
      this.lastRejectLog = now;
      console.error(
        `[hive] hook payload REJECTED (${provided ? 'wrong' : 'missing'} sock_token) — `
        + `agent=${p.agent_id ?? '?'} event=${p.hook_event_name ?? '?'}, `
        + `${this.rejected} rejected so far. If this is every hook, the agent PTY env `
        + 'is missing HIVE_SOCK_TOKEN (see hookSockToken() in hooks.ts).'
      );
    }
    return false;
  }

  private handle(p: HookPayload): unknown {
    const agentId = p.agent_id ?? undefined;
    const event = p.hook_event_name ?? 'Unknown';
    if (agentId && typeof p.transcript_path === 'string' && p.transcript_path) {
      this.transcriptPaths.set(agentId, p.transcript_path);
    }

    // Status-line payloads carry the session's EXACT context accounting —
    // current tokens AND the real window size (200k vs 1M, which nothing else
    // exposes). Forward to the renderer for the agent-card context gauge.
    // Handled FIRST and returned early: this is pure telemetry from the
    // statusLine shim, not a real hook boundary — it must never trip the
    // HALT gate or feed the breaker's loop detector below. The early return
    // also (deliberately) skips recordSession for status ticks: a statusLine
    // payload's session_id adds nothing the real hooks don't already record,
    // and telemetry should never write to the registry. transcript_path IS
    // still captured above, where every payload shape benefits from it.
    if (event === 'Status') {
      const cw = p.context_window;
      if (agentId && cw && typeof cw.total_input_tokens === 'number'
        && typeof cw.context_window_size === 'number' && cw.context_window_size > 0) {
        // Retain for main-side reads (voice get_agent_detail / list_agents) …
        this.contextById.set(agentId, {
          tokens: cw.total_input_tokens,
          limit: cw.context_window_size,
          ts: Date.now()
        });
        // … and forward live to the renderer's agent-card context gauge.
        this.getWebContents()?.send('hive:contextUpdate', {
          agentId,
          tokens: cw.total_input_tokens,
          limit: cw.context_window_size
        });
      }
      return {};
    }

    // 7C.3 — a graceful operator HALT overrides everything (incl. the inbox
    // drain below): stop the agent CLEANLY at this hook boundary rather than
    // killing the PTY. session_id is in the payload for a later --resume.
    if (agentId && this.control?.shouldHalt(agentId)) {
      this.emit(agentId, event, p);
      return { continue: false, stopReason: 'Halted by the operator from the floor.' };
    }

    // Capture the Claude Code session id for idempotent --resume + cost dedup
    // (Lane A #6.6a). Cheap: recordSession writes only when it changes.
    if (agentId && p.session_id) this.hive.recordSession(agentId, p.session_id);

    // CostSample — synthesized by the proxy-bridge sidecar (qwen) on every
    // response with usage. Persist it to the SAME cost ledger as Claude's OTel
    // path, keyed by the synthesized session_id, then return early so cost stays
    // OUT of the Claude-only OTel/breaker/drain paths below. `usd` is the fallback
    // per-model estimate (a local model normally costs ~$0, but the row keeps the
    // accounting schema uniform). Pure telemetry — never feeds the loop detector.
    if (event === 'CostSample') {
      if (agentId && p.session_id) {
        const input = p.input ?? 0;
        const output = p.output ?? 0;
        const cacheRead = p.cache_read ?? 0;
        const cacheCreation = p.cache_creation ?? 0;
        this.hive.appendCostLedger({
          agentId,
          sessionId: p.session_id,
          ts: Date.now(),
          input,
          output,
          cacheRead,
          cacheCreation,
          model: p.model ?? '',
          usd: estimateCostUsd(p.model, {
            inputTokens: input,
            outputTokens: output,
            cacheReadTokens: cacheRead,
            cacheWriteTokens: cacheCreation
          })
        });
      }
      return {};
    }

    // Feed the breaker its hook-derived loop signal: a tool that actually ran.
    // A repeated identical (name+input) PostToolUse is the runaway-loop tell.
    if (event === 'PostToolUse' && agentId) {
      this.breaker?.recordToolUse(agentId, p.tool_name, p.tool_input);
    }

    // Compaction exemption (issue #109): PreCompact opens it so the compaction
    // token burst can't trip the Δoutput arms; PostCompact — or any SessionStart,
    // since a fresh session makes in-flight compaction state moot — closes it
    // down to the trailing grace (a no-op when nothing was compacting).
    if (event === 'PreCompact' && agentId) this.breaker?.recordCompactStart(agentId);
    if ((event === 'PostCompact' || event === 'SessionStart') && agentId) {
      this.breaker?.recordCompactEnd(agentId);
    }

    // Turn clock for the "long task finished" toast (#42). A prompt submission is
    // the only unambiguous start-of-turn boundary the hook stream exposes.
    if (event === 'UserPromptSubmit' && agentId && !this.turnStartedAt.has(agentId)) {
      this.turnStartedAt.set(agentId, Date.now());
    }

    if ((event === 'Stop' || event === 'SubagentStop') && agentId) {
      // Respect any upstream Stop hook that already re-entered this boundary.
      if (p.stop_hook_active) { this.emit(agentId, event, p); return {}; }
      // A SubagentStop is a sub-agent finishing INSIDE the parent's turn: the turn
      // is not over, so neither the inbox drain (whose continuation would land in
      // the subagent) nor the turn clock applies to it.
      if (event === 'SubagentStop') { this.emit(agentId, event, p); return {}; }
      const turnMs = this.closeTurn(agentId);
      // #5 — the GUARDED inbox drain, restored. Unread hive mail becomes this
      // turn's continuation instead of rotting until something types a nudge, and
      // it types NOTHING: the agent's own turn carries the work, so nothing can
      // land on the human's input line.
      //
      // The old unguarded version was removed for a real reason — it bypassed the
      // terminal-draft/HITL gate and could spend credits while a human was
      // mid-answer. DeliveryService now holds both guards main can actually check:
      // the operator's auto-delivery pause, and the renderer's draft/picker veto
      // (`hive:deliveryVeto`). Neither depends on a window being open, so the
      // drain keeps working headless — which is the whole point of issue #5.
      const drain = this.drainAtStop?.(agentId);
      if (drain?.block && drain.reason) {
        this.emit(agentId, event, p);
        // Codex honours the same contract: block + reason = "continue, using
        // reason as the next prompt" (see installCodexHooks in hive.ts).
        return { decision: 'block', reason: drain.reason };
      }
      // #42 — an idle agent is the LEAST urgent thing that happens on this floor,
      // and a toast for every turn-end trains the human to ignore all of them.
      // Only a long task finishing is worth the interruption.
      if (turnMs >= LONG_TURN_MS) {
        this.notify(agentId, this.agentName(agentId), `finished after ${Math.round(turnMs / 60_000)} min`);
      }
      this.emit(agentId, event, p);
      return {};
    }

    // 7C.1 — HITL gate: deny a tool call at the PreToolUse boundary when the
    // agent is paused or this tool is gated. Race-free (immediate return, no
    // renderer round-trip → can't hit the shim timeout). Slow human APPROVAL is
    // deliberately left to Claude's native permission prompt.
    if (event === 'PreToolUse' && agentId && this.control) {
      const d = this.control.toolDecision(agentId, p.tool_name ?? '');
      if (d.deny) {
        this.emitControl(agentId, p.tool_name, d.reason);
        this.emit(agentId, event, p);
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: d.reason ?? 'Denied by operator.'
          }
        };
      }
    }

    // 7C.2 — mid-run steering: inject queued operator guidance as context on the
    // next eligible hook (no fragile typing into the TUI). Delivered once.
    // Merged with the roster line below so the two injections never displace each
    // other (only ONE additionalContext can be returned per hook).
    let steer: string | null = null;
    if ((event === 'UserPromptSubmit' || event === 'PostToolUse') && agentId && this.control) {
      steer = this.control.takeSteer(agentId) ?? null;
    }

    // Keep god's roster CURRENT. fleet.json is always fresh on disk, but god's
    // context is not: after a restart it resumes a transcript describing the old
    // floor and messages agents that are long gone. Push the live roster in as
    // additionalContext at the start of each session and on every prompt, so god
    // knows the floor all the time instead of only when it remembers to Read.
    // God-only and one line — every other agent is unaffected.
    const wantsRoster = (event === 'SessionStart' || event === 'UserPromptSubmit')
      && !!agentId && this.hive.isGod(agentId);
    const roster = wantsRoster ? this.hive.rosterContext() : null;

    if (steer || roster) {
      this.emit(agentId, event, p);
      return {
        hookSpecificOutput: {
          hookEventName: event,
          additionalContext: [roster, steer].filter(Boolean).join('\n\n')
        }
      };
    }

    // #42 — EVERY Notification hook is a toast now, not just the idle one.
    //
    // This used to fire for `idle` alone and deliberately skipped permission
    // requests, on the theory that they "surface natively in the agent's own
    // Claude Code session". They do — in a session nobody is looking at. Blocked
    // on a prompt is the single case where the floor genuinely cannot proceed
    // without the human, so it is exactly the one that must reach them; idle is
    // the case that can wait. Same `notifications` setting gates both.
    if (event === 'Notification' && agentId) {
      this.notify(agentId, this.agentName(agentId), p.message ?? 'needs your attention');
    }

    // Forward everything else to the renderer so avatars reflect real activity.
    this.emit(agentId, event, p);
    return {};
  }

  /** Fire a native desktop notification — gated on the user's `notifications`
   *  setting. Only the OS toast is gated; the hive:hookEvent emit is always sent
   *  so avatars/UI stay live regardless. Best-effort: never throw into the hook.
   *
   *  CLICK-TO-FOCUS (#42): a toast that only says a name is a puzzle — the human
   *  still has to find the agent. Clicking raises the floor and selects it. */
  private notify(agentId: string | undefined, title: string, body: string): void {
    if (!this.getConfig().notifications) return;
    try {
      if (!Notification.isSupported()) return;
      const n = new Notification({ title, body });
      if (agentId) n.on('click', () => { try { this.focus?.(agentId); } catch { /* window gone */ } });
      n.show();
    } catch { /* notifications unsupported on this platform — ignore */ }
  }

  /** The agent's display name for a toast title, falling back to its id. */
  private agentName(agentId: string | undefined): string {
    if (!agentId) return 'Agent';
    try { return this.hive.registry().agents[agentId]?.name ?? agentId; }
    catch { return agentId; }
  }

  /** Close the current turn and return how long it ran (0 when we never saw it
   *  start — a first Stop after a restart must not read as an infinite task). */
  private closeTurn(agentId: string): number {
    const started = this.turnStartedAt.get(agentId);
    this.turnStartedAt.delete(agentId);
    return started ? Date.now() - started : 0;
  }

  /** Tell the renderer a tool call was gated/denied (#7C.1) so it can surface it
   *  (toast / control strip) — distinct from the avatar hook stream. */
  private emitControl(agentId: string, tool: string | undefined, reason: string | undefined): void {
    this.getWebContents()?.send('control:approvalRequest', { agentId, tool, reason });
  }

  private emit(agentId: string | undefined, event: string, p: HookPayload, blocked = false): void {
    this.getWebContents()?.send('hive:hookEvent', {
      agentId,
      event,
      tool: p.tool_name,
      notificationType: p.notification_type,
      source: p.source,
      message: p.message,
      blocked
    });
  }
}
