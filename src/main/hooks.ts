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
 * AUTHENTICATED, PER AGENT (GATE-01). The socket is a Unix-domain socket / named
 * pipe, so ANY local process can connect and post a payload claiming any
 * `agent_id` — enough to hijack another agent's --resume session id, poison the
 * cost ledger, or clear breaker state. So `payload.agent_id` is NOT trusted and
 * is never read: every payload must carry a `sock_token` that main minted for
 * ONE agent at ONE PTY spawn (`mintToken`, injected as HIVE_SOCK_TOKEN into that
 * PTY's env only), and this server DERIVES the identity from that token via
 * `Map<token, agentId>`. Tokens are revoked when the PTY exits. Payloads whose
 * token is unknown are dropped, LOUDLY (see `authorized`).
 *
 * THE HONEST CEILING (D-14) — exactly two properties, and no more:
 *   1. There is no floor-wide key. Reading one agent's HIVE_SOCK_TOKEN buys that
 *      agent's identity, not the floor's.
 *   2. `payload.agent_id` is no longer trusted for identity.
 * It is NOT secrecy: an agent's own shell reads whatever its own shim reads.
 * It is NOT "agent A cannot authenticate as agent B" — that sentence is false on
 * Linux. B's token lives in B's process environment (pty.ts spreads it into the
 * PTY), so a same-uid sibling reads /proc/<B-pid>/environ; AGENT_DENY_RULES
 * covers no /proc path and B's pid is one `pgrep -f` away. Any same-uid process
 * that can read another agent's environment defeats this mechanism. Claim those
 * two properties and nothing beyond them.
 *
 * REJECTED ALTERNATIVES, recorded so they are not re-litigated (D-15): a
 * permission-restricted token FILE (a no-op against a same-uid shell, and chmod
 * 0o600 is effectively meaningless on NTFS — false assurance); HMAC/nonce
 * rotation (adds freshness, not impersonation resistance, and PI_EXTENSION /
 * OPENCODE_PLUGIN are fire-and-forget so they cannot do challenge-response);
 * socket peer-credential binding (no supported Node API for the socket fd or
 * pipe handle — nodejs/node#7627 — so it means authoring and ABI-rebuilding a
 * native addon on three CI gates).
 *
 * FAIL-OPEN AT THE SHIM, deliberately, and bounded rather than removed. A shim
 * that cannot connect exits 0, and for Claude Code a PreToolUse hook that exits
 * 0 with no stdout is *allow* — so deleting the socket file disables the gate
 * for everyone. Making the shim fail CLOSED would break every agent whenever the
 * app is legitimately not running (an agent PTY outlives a quit), which is a
 * normal state. So the shim keeps exiting 0 and `armSocketWatchdog` re-listens
 * on a missing or replaced socket instead: the outage is bounded by the watchdog
 * interval rather than by the next app restart, and it is never silent. Re-taking
 * a rebound path is a race we can lose; what is guaranteed is detection + a loud
 * log, not exclusion.
 *
 * WHAT THE PreToolUse GATE DOES NOT REACH (see `protectedPathDenial`): the
 * user-global engine seeds — `~/.codex/config.toml` (copied into every codex
 * agent's config at spawn, hive.ts:2107/:2160-2162), `~/.gemini/…/hooks.json`
 * (hive.ts:2070) and `~/.grok/hooks/` (hive.ts:2302) — sit outside the hive root
 * entirely, so an agent appending one `[[hooks.PreToolUse]]` block to a seed has
 * it executed inside another agent's hook process with that agent's env. Nor does
 * it reach an engine with NO PreToolUse hook at all (pi, opencode, the qwen proxy
 * tier): for those, `ensureHive` rewriting the shim from its constant on every
 * bootstrap is a repair, not a gate.
 *
 * Runs in the Electron main process.
 */
import { createServer, type Server } from 'node:net';
import { randomBytes } from 'node:crypto';
import { existsSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { Notification, type WebContents } from 'electron';
import type { HiveManager } from './hive';
import type { HarnessConfig } from './config';
import type { ControlRegistry } from './control';
import type { CircuitBreaker } from './breaker';
// FLOOR-09 (#19): the TELEMETRY AgentUsageSample, deliberately — `usage.ts`
// declares a second interface of the same name whose `sessionId`/`model` are
// nullable, and `recordCostSample` takes this stricter one. The branch below
// already satisfies it (it guards on a truthy session id and coerces the model).
import type { AgentUsageSample } from './telemetry';
import { estimateCostUsd } from './pricing';

interface HookPayload {
  hook_event_name?: string;
  /** IGNORED (GATE-01). The shims still send it and the field is kept so the
   *  wire shape is documented — but nothing in this file reads it for identity:
   *  a payload's own claim about who sent it is worth nothing on a socket any
   *  local process can reach. The agent id comes from `sock_token` instead. */
  agent_id?: string | null;
  /** The PER-AGENT token main minted for one PTY spawn (`mintToken`). This is
   *  the ONLY identity input: the server looks it up to derive `agentId`. */
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
 * Resolve `p` to a real path, following symlinks, for a target that usually does
 * not exist yet.
 *
 * `path.resolve` normalizes `..` and makes a path absolute; it does NOT
 * dereference links. So `ln -s "$HIVE_ROOT/bin" /tmp/b` then writing
 * `/tmp/b/cth-hook.cjs` walks straight past a resolve+startsWith gate. We
 * realpath the deepest EXISTING ancestor and re-join the remainder, which is the
 * only shape that works for a file about to be created.
 */
function realResolve(p: string): string {
  const abs = resolve(p);
  let cur = abs;
  const rest: string[] = [];
  for (;;) {
    try { return join(realpathSync(cur), ...[...rest].reverse()); }
    catch { /* this ancestor does not exist yet — climb */ }
    const parent = dirname(cur);
    if (parent === cur) return abs; // hit the filesystem root, nothing resolved
    rest.push(basename(cur));
    cur = parent;
  }
}

/** Is `target` `base`, or inside it? Separator-safe and case-insensitive on
 *  win32 (NTFS is), never a bare `includes` — which would also match a sibling
 *  like `/tmp/hive-bin-notes`. */
function within(base: string, target: string): boolean {
  const fold = (s: string): string => (process.platform === 'win32' ? s.toLowerCase() : s);
  const rel = relative(fold(base), fold(target));
  if (rel === '') return true; // the base itself
  return !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel);
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

  /**
   * GATE-01 — token → agentId. THE identity source for everything past the
   * socket. One entry per live PTY spawn: `mintToken` adds, PTY exit removes.
   * A token is meaningless on its own — it only ever names the one agent main
   * minted it for, so reading agent A's env yields A's identity and nothing
   * else. This replaced a single floor-wide secret that `pty.ts` spread into
   * every PTY, where reading ANY agent's env yielded the whole floor.
   */
  private tokens = new Map<string, string>();

  /** Socket watchdog (see `armSocketWatchdog`) — POSIX only. */
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private sockIno: number | null = null;
  /** Watchdog period. Public so a test can shorten it to ~50ms: this is a repair
   *  loop, not a hot path, and a test that sleeps 10s gets deleted by the next
   *  person who has to wait for it. */
  socketWatchdogMs = 10_000;

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
    private focus?: (agentId: string) => void,
    /** FLOOR-09 (#19) — the proxy tier's cost sink. `telemetry.recordCostSample`
     *  in production (injected at index.ts's `new HookServer(...)`), omitted in
     *  tests that don't care. Optional so the server still runs without it,
     *  exactly like `breaker` and `control` above — and LAST, so no existing
     *  call site or test has to move an argument. */
    private recordCost?: (s: AgentUsageSample) => void
  ) {
    // GATE-01 — the qwen/crush PROXY SIDECAR is not a PTY, so `PtyManager`'s
    // per-spawn mint never sees it: it is a child of `HiveManager`. Register
    // this server's registry as the hive's token source here rather than adding
    // a wiring line to the composition root, because we already hold the hive
    // and this is the only object that can mint. Without it the sidecar sends
    // `sock_token: ''`, `authorized()` drops it, and every qwen/crush agent is
    // silently dead-hooked — no live status, no Stop→drain, no cost.
    this.hive.setHookTokenSource?.(
      (agentId) => this.mintToken(agentId),
      (token) => this.revokeToken(token)
    );
  }

  start(): void {
    const sock = this.hive.sockPath();
    if (!sock || this.server) return;
    // Clear a stale socket file left by a previous run.
    try { if (existsSync(sock)) rmSync(sock); } catch { /* noop */ }
    this.listenOn(sock);
  }

  /** Build the connection handler and take the path. Split out of `start()` so
   *  the watchdog can re-take a socket that went missing or was replaced. */
  private listenOn(sock: string): void {
    const server = createServer((conn) => {
      let buf = '';
      conn.on('data', (d) => {
        buf += d.toString();
        const nl = buf.indexOf('\n');
        if (nl === -1) return; // wait for the full line
        let payload: HookPayload = {};
        try { payload = JSON.parse(buf.slice(0, nl)); } catch { /* ignore */ }
        // THE trust boundary. `authorized` DERIVES the sender's identity from
        // its per-agent token; the payload's own `agent_id` claim is discarded.
        // Answer an unauthenticated peer with the same empty object a real hook
        // gets, so the socket is not also a probe for whether it guessed right.
        const agentId = this.authorized(payload);
        if (!agentId) { conn.end('{}'); return; }
        let res: unknown = {};
        try { res = this.handle(payload, agentId); } catch { res = {}; }
        conn.end(JSON.stringify(res ?? {}));
      });
      conn.on('error', () => { /* shim hung up — ignore */ });
    });
    server.on('error', (e) => console.error('[hive] hook server error:', e));
    this.server = server;
    server.listen(sock, () => this.armSocketWatchdog(sock));
  }

  /**
   * Re-listen when the socket file goes missing or is replaced (T-P02-12/13).
   *
   * Before this, `listen()` ran exactly once and nothing re-listened, so one
   * `rm "$HIVE_ROOT/hooks.sock"` took the PreToolUse gate down for EVERY agent
   * until the app restarted — the shims exit 0 on a connect error and exit 0
   * with no stdout is *allow*. Worse, an agent that then BOUND that fixed path
   * would collect every other agent's token and answer `allow` to the floor.
   *
   * POSIX only: `sockPath()` is a `\\.\pipe\` NAME on win32 with no filesystem
   * entry, so there is nothing to stat, nothing to `rm`, and a watchdog that
   * threw every 10s there would be a worse bug than the one it fixes.
   */
  private armSocketWatchdog(sock: string): void {
    if (process.platform === 'win32') return;
    try { this.sockIno = statSync(sock).ino; } catch { this.sockIno = null; }
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(() => this.checkSocket(sock), this.socketWatchdogMs);
    this.watchdog.unref?.();
  }

  private checkSocket(sock: string): void {
    if (!this.server) return;
    let ino: number | null = null;
    try { ino = statSync(sock).ino; } catch { ino = null; }
    if (ino !== null && ino === this.sockIno) return;
    if (ino === null) {
      // The accident, or a deliberate fail-open: the gate was DOWN for everyone
      // until now. Loud, because nothing else reports it.
      console.error(
        `[hive] hook socket GONE (${sock}) — the PreToolUse gate was open for every `
        + 'agent on this floor until this re-listen. Something deleted it.'
      );
    } else {
      // A different inode on OUR path is someone else listening on it: every
      // shim would hand THEM its per-agent token and take THEIR allow/deny.
      console.error(
        `[hive] hook socket REPLACED (${sock}) — a DIFFERENT socket is bound to the `
        + 'hive hook path. This is what an agent rebinding HIVE_SOCK looks like: it '
        + 'harvests every other agent\'s token and answers every PreToolUse. Re-taking '
        + 'the path now — re-taking is a race we can lose, so check the floor.'
      );
      try { rmSync(sock); } catch { /* it may be gone again already */ }
    }
    try { this.server.close(); } catch { /* noop */ }
    this.server = null;
    this.listenOn(sock);
  }

  stop(): void {
    // Before anything else: an uncleared interval outlives the server, and a
    // leaked one per HookServer construction is its own flake in a test file
    // that builds ~20 of them.
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
    this.sockIno = null;
    try { this.server?.close(); } catch { /* noop */ }
    this.server = null;
    const sock = this.hive.sockPath();
    try { if (sock && existsSync(sock)) rmSync(sock); } catch { /* noop */ }
  }

  /**
   * Mint the hook token for ONE agent's PTY spawn (GATE-01, D-11).
   *
   * `randomBytes` — never a hand-rolled or time-derived value. Called by
   * `pty.ts` at every spawn that carries an AGENT_ID, and the result goes into
   * that ONE PTY's env as HIVE_SOCK_TOKEN. A fresh token per spawn means a
   * restart invalidates the old one for free.
   */
  mintToken(agentId: string): string {
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, agentId);
    return token;
  }

  /** Drop ONE token — the PTY-exit path. Token-exact rather than by agent on
   *  purpose: a restart is kill()+spawn() under the same id, and the dying
   *  PTY's exit can land AFTER the replacement has already minted, so revoking
   *  by agent there would dead-hook the live agent. */
  revokeToken(token: string): void {
    this.tokens.delete(token);
  }

  /** Drop EVERY token an agent holds — for a teardown where the agent itself is
   *  going away and no replacement is coming. */
  revokeAgent(agentId: string): void {
    for (const [token, id] of this.tokens) if (id === agentId) this.tokens.delete(token);
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
   * WHO sent this payload — derived, never claimed. Returns the agent id bound
   * to the payload's token at mint time, or null if there is no such token.
   *
   * Deliberately enforced HERE, at the socket, and not inside `handle` — the
   * socket is the trust boundary, and main-side callers that build payloads
   * themselves are already inside it.
   *
   * A plain `Map.get` and no compare: the lookup is a hash of the provided
   * string, so there is no per-byte comparison to leak a prefix and nothing for
   * a `.length` shortcut to bail on. The constant-time compare this file used to
   * run is therefore gone along with the single floor-wide constant it compared
   * against — deleted rather than kept as a dead import, and deliberately not
   * named here, because a later plan greps this file raw for its symbols.
   *
   * FAIL-CLOSED, but never silently: if the PTY env ever stops carrying
   * HIVE_SOCK_TOKEN, every hook for that agent goes dead at once — its avatar
   * freezes, Stop never fires, its cost rows stop landing — and a silent version
   * of that is far harder to diagnose than the hijack it prevents. So each
   * rejection says WHY, with the event, throttled to one line per
   * REJECT_LOG_INTERVAL_MS plus a running count. The payload's OWN `agent_id` is
   * deliberately not logged: it is the unauthenticated claim this gate exists to
   * disbelieve, and printing it invites a reader to trust it.
   */
  private authorized(p: HookPayload): string | null {
    const provided = typeof p.sock_token === 'string' ? p.sock_token : '';
    const agentId = provided ? this.tokens.get(provided) : undefined;
    if (agentId) return agentId;
    this.rejected += 1;
    const now = Date.now();
    if (now - this.lastRejectLog >= REJECT_LOG_INTERVAL_MS) {
      this.lastRejectLog = now;
      console.error(
        `[hive] hook payload REJECTED (${provided ? 'unknown' : 'missing'} sock_token) — `
        + `event=${p.hook_event_name ?? '?'}, ${this.rejected} rejected so far. If this is `
        + 'every hook, the agent PTY env is missing HIVE_SOCK_TOKEN (minted per spawn by '
        + 'mintToken() in hooks.ts); if it is one engine, that engine\'s shim is not '
        + 'sending sock_token at all.'
      );
    }
    return null;
  }

  /**
   * Deny a PreToolUse whose target lands in the hive's own protected set
   * (T-P02-09/12/13). Returns the operator-legible reason, or null to allow.
   *
   * WHY HERE and not in `AGENT_DENY_RULES`: that list is written only into
   * Claude's per-session `settings.json` (hive.ts:1072), so it does not exist
   * for the agy/codex/grok engines that reuse this very shim, and its `Bash(…)`
   * rules are prefix matches on the command string. This gate is strictly wider
   * on both axes and lives at the choke point every hook-bridged engine already
   * routes through. Per-agent shim COPIES were considered and rejected: the
   * token rides in each PTY's env, not in the shim, so a second copy adds a file
   * without adding a boundary — the copy is exactly as writable as the original.
   *
   * THE CEILING, so this reads as a control and not a claim: it stops the
   * confident accident, the documented `$HIVE_ROOT` convention and the symlink
   * hop. It does NOT stop a model that assembles the path at runtime
   * (`p=$HIVE_ROOT; p=$p/bin; cat >> $p/cth-hook.cjs`) — the gate sees a command
   * string, not a shell — and it does not exist at all for an engine with no
   * PreToolUse hook (T-P02-11).
   */
  private protectedPathDenial(agentId: string, p: HookPayload): string | null {
    const root = this.hive.root();
    if (!root) return null;
    const ti = (p.tool_input && typeof p.tool_input === 'object')
      ? p.tool_input as Record<string, unknown>
      : {};
    const targets: string[] = [];
    for (const key of ['file_path', 'path', 'notebook_path']) {
      const v = ti[key];
      if (typeof v === 'string' && v) targets.push(v);
    }
    if (p.tool_name === 'Bash' && typeof ti.command === 'string') {
      // The app puts HIVE_ROOT in every agent's env (hive.ts:828) AND names it in
      // the injected prompt (hive.ts:1366), so `cat >> "$HIVE_ROOT/bin/…"` is the
      // DOCUMENTED calling convention, not obfuscation — a prefix test on the
      // unexpanded string never matches it. Expand the spellings this app itself
      // hands out, then treat the shell words as candidate paths. Splitting on
      // shell separators (not a bare substring scan) is what keeps `>>`, quotes
      // and `;`-chains from hiding a target.
      const expanded = this.expandHiveVars(agentId, ti.command);
      for (const word of expanded.split(/[\s;&|<>()"']+/)) if (word) targets.push(word);
    }
    for (const target of targets) {
      const reason = this.denyReason(agentId, root, target);
      if (reason) return reason;
    }
    return null;
  }

  /** Expand the shell spellings of the env vars this app hands every agent, so a
   *  command written the way the injected prompt teaches is still resolvable. */
  private expandHiveVars(agentId: string, cmd: string): string {
    const root = this.hive.root();
    const vars: Record<string, string | null> = {
      HIVE_ROOT: root,
      HIVE_SOCK: this.hive.sockPath(),
      AGENT_DIR: root ? join(root, 'agents', agentId) : null
    };
    let out = cmd;
    for (const [name, value] of Object.entries(vars)) {
      if (!value) continue;
      out = out.split(`\${${name}}`).join(value)
        .split(`$${name}`).join(value)
        .split(`%${name}%`).join(value);
    }
    return out;
  }

  /** One protected path per branch, each with its OWN reason so the operator can
   *  see WHICH gate fired. */
  private denyReason(agentId: string, root: string, target: string): string | null {
    const hiveRoot = realResolve(root);
    const t = realResolve(target);
    if (within(join(hiveRoot, 'bin'), t)) {
      return 'Denied: <hive>/bin holds the ONE hook shim every agent on this floor '
        + 'executes. Writing it runs your code inside another agent\'s hook, with that '
        + 'agent\'s environment and token.';
    }
    if (within(join(hiveRoot, '.git'), t)) {
      return 'Denied: the hive root is a git repo the app itself commits to. A hook or '
        + 'core.hooksPath under <hive>/.git executes as a child of the main process on '
        + 'the next hive commit — outside every limit that applies to you.';
    }
    const sock = this.hive.sockPath();
    // win32 sockPath() is a `\\.\pipe\` NAME, not a filesystem path — nothing to
    // delete, nothing to resolve, so the whole branch is POSIX-shaped.
    if (sock && process.platform !== 'win32' && within(realResolve(sock), t)) {
      return 'Denied: deleting or replacing the hook socket takes the PreToolUse gate '
        + 'down for EVERY agent (the shims fail open), and rebinding that path harvests '
        + 'every agent\'s token.';
    }
    const agents = join(hiveRoot, 'agents');
    if (within(agents, t)) {
      const owner = relative(agents, t).split(/[\\/]/)[0];
      // An agent may write its OWN directory — a gate that blocks that is an
      // outage, not a control.
      if (owner && owner !== agentId) {
        return `Denied: <hive>/agents/${owner} belongs to another agent. Its settings.json `
          + 'names the hook commands that agent runs, so writing it is code execution in '
          + 'their session.';
      }
    }
    return null;
  }

  private handle(p: HookPayload, agentId: string): unknown {
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

    // CostSample — synthesized by the proxy-bridge sidecar (qwen/crush) on every
    // response with usage. Its numbers are PER-RESPONSE DELTAS.
    //
    // RECORD-04 (#34) — WHY THE HAND-BUILT LEDGER ROW IS GONE FROM HERE.
    // This branch used to call the hive's cost-ledger appender directly with
    // those deltas, while the ~30s beat (index.ts: `getAgentUsage(id)` → that
    // same appender) writes CUMULATIVE snapshots for everyone else.
    // One append-only file, two row semantics — and `taskSpend()` summed both,
    // over-counting roughly quadratically. `src/main/db.ts:44` states the
    // contract the beat obeys and this path broke, verbatim: "Rows are
    // CUMULATIVE snapshots (one per agent per heartbeat beat) — diff consecutive
    // rows for velocity." So the ledger has ONE writer again, with one semantics.
    //
    // FLOOR-09 (#19) — WHERE THE SAMPLE GOES INSTEAD, AND WHY THE EARLY RETURN
    // STAYS. It is handed to the injected `recordCost` sink
    // (`telemetry.recordCostSample` in production), which accumulates it in the
    // SAME collector the OTel path fills. So the branch now reaches:
    //   - `telemetry.getAgentUsage(agentId)`, and therefore the circuit
    //     breaker's cost, token and velocity arms — qwen/crush spend can arm a
    //     budget for the first time instead of only being archived;
    //   - the cost ledger, but INDIRECTLY, via the ~30s beat writing this
    //     agent's cumulative row like everyone else's. That indirection is the
    //     whole of RECORD-04's fix.
    // And it still does NOT reach the loop detector, the OTel span buffer or the
    // Stop/drain path below — cost is pure telemetry and a CostSample is not a
    // tool call. That is what the early `return {}` is for; it is rewritten
    // here, not deleted.
    // Deliberately NO fallback to the ledger appender when the sink is absent:
    // that would be the mixed-semantics defect above, reintroduced as a default.
    // An unwired sink must mean "no proxy row", visibly, not "the old wrong row".
    if (event === 'CostSample') {
      if (agentId && p.session_id) {
        const input = p.input ?? 0;
        const output = p.output ?? 0;
        const cacheRead = p.cache_read ?? 0;
        const cacheCreation = p.cache_creation ?? 0;
        this.recordCost?.({
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

    // GATE-01 — the hive's own protected set: the shared shim, the hive repo's
    // .git, the socket, and other agents' directories. FIRST, and deliberately
    // outside the `this.control` guard below: this is a floor invariant, not an
    // operator preference, so it must hold on a floor with no ControlRegistry.
    if (event === 'PreToolUse') {
      const denial = this.protectedPathDenial(agentId, p);
      if (denial) {
        this.emitControl(agentId, p.tool_name, denial);
        this.emit(agentId, event, p, true);
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: denial
          }
        };
      }
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
