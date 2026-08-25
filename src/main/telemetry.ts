/**
 * TelemetryCollector — the live, first-party observability tap for the hive.
 *
 * Every spawned `claude` is launched with `CLAUDE_CODE_ENABLE_TELEMETRY=1` and
 * `OTEL_EXPORTER_OTLP_ENDPOINT` pointed here (see hive.ts `ensureAgent`). Claude
 * Code then PUSHES OpenTelemetry over plain OTLP/HTTP JSON to this embedded
 * collector — no protobuf, no external process, loopback only. We decode it into
 * two products:
 *
 *   1. The usage PROVIDER (the locked cross-lane seam) — `getAgentUsage(agentId)`
 *      (pull, primary) + `onAgentUsage(cb)` (push). Returns `AgentUsageSample`,
 *      a PII-free cumulative cost/token snapshot. Lane A's circuit breaker (#6)
 *      consumes this; the swap between the OTel backend and the transcript
 *      fallback is hidden here so the breaker never changes.
 *   2. An EPHEMERAL ring buffer of rich tool spans (`tool_result` durations +
 *      success) per agent, for the per-agent span waterfall (#7B.2).
 *
 * 🔒 PII: raw OTel records carry `user.email`, `user.account_id/uuid`,
 * `organization.id` and a hashed `user.id`. We read ONLY an allowlist of keys
 * ({agent.id, session.id, model, token type, cost, tool fields, api_error
 * status_code} plus the OPAQUE
 * `user.account_uuid`/`user.account_id` — the account pool's integrity signal,
 * an identifier, never the email) and never persist a raw record — so everything
 * this module emits is PII-free BY CONSTRUCTION. Downstream durable stores
 * (Lane A's cost-ledger, Lane B's SQLite) inherit that guarantee and must never
 * persist a raw record either.
 *
 * Transport posture is a per-agent telemetry capability: the listener is bound
 * to 127.0.0.1 AND every batch must carry an `x-hive-otel-token` minted for one
 * agent at one PTY spawn (`mintAgentToken`, exported on the per-signal OTLP
 * header vars by pty.ts) and revoked when that PTY exits. The batch is
 * attributed to the agent the TOKEN resolves to; the payload's own `agent.id` is
 * not read on any network-reachable path. The bind alone was never a boundary
 * here — this endpoint is injected into every agent's own environment, so the
 * attacker is already inside it.
 *
 * What that model does NOT close, stated so no reader over-trusts it: there is
 * no replay window and no signature over the body, so a captured token is valid
 * until its PTY exits; and the token lives in the agent's own environment, which
 * a same-uid sibling can read (`/proc/<pid>/environ` on Linux) — the ceiling
 * `.planning/REQUIREMENTS.md:569` already records for GATE-01.
 *
 * Runs in the Electron main process; deliberately free of
 * any `electron` import so it can be smoke-tested as a plain Node module.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readAgentUsage } from './transcript';
import { readCodexUsage } from './usage';
import { normalizeModel } from './pricing';

// ─── The locked cross-lane contract (do not change without re-agreeing) ───────

/** A cumulative cost/token snapshot for one agent. The shared row consumed by
 *  Lane A's breaker (#6) and persisted by Lane A's cost-ledger / Lane B's SQLite
 *  (#4). PII-free by construction (see file header). `usd` is Claude's own
 *  per-model cost on the live path, the fallback estimate on the transcript
 *  path — never recomputed downstream.
 *  CUMULATIVE is the contract, not a detail: diff consecutive rows of the same
 *  (agentId, sessionId), never sum them. Summing over-counts quadratically, and
 *  it is what RECORD-03/RECORD-04 exist to fix — see
 *  docs/adr/0005-cumulative-cost-ledger.md. */
export interface AgentUsageSample {
  agentId: string;
  /** Dedup/accounting key — present on every OTel record; fixes the cwd
   *  double-count. Empty string on the transcript fallback when unknown. */
  sessionId: string;
  ts: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  /** Normalized model id (`claude-opus-4-8`, no `[1m]` suffix). */
  model: string;
  usd: number;
  /** Opaque Claude account identifier observed on this agent's telemetry
   *  (`user.account_uuid`, falling back to `user.account_id`). Drives the account
   *  pool's per-account rows + "token not applied" integrity flag. Undefined until
   *  the first export lands / on the transcript fallback. Never the email. */
  accountUuid?: string;
}

/** Breaker state, emitted by Lane A's policy on `control:breakerState` and
 *  consumed by this lane's avatar adapter (#5C) + cost meter. Defined here as
 *  the shared type so both lanes import one shape. */
export interface BreakerState {
  agentId: string;
  level: 'healthy' | 'steering' | 'constrained' | 'stopped';
  reason: string;
  ts: number;
}

// ─── Internal, lane-owned shapes ──────────────────────────────────────────────

/** A single tool invocation, for the per-agent span waterfall. Ephemeral — kept
 *  only in the in-memory ring buffer, never persisted. */
export interface ToolSpan {
  agentId: string;
  sessionId: string;
  ts: number;
  tool: string;
  success: boolean;
  durationMs: number;
  decision?: 'accept' | 'reject';
  error?: string;
}

/** The normalized event pushed to the renderer over `telemetry:event`. */
export type TelemetryEvent =
  | { kind: 'usage'; sample: AgentUsageSample }
  | { kind: 'tool_result'; span: ToolSpan }
  | { kind: 'api_error'; agentId: string; sessionId: string; ts: number; error: string; statusCode?: number };

/** What an in-process api_error subscriber gets besides the agent id. The
 *  account pool keys its 429/401 handling on `statusCode` (never on the text). */
export interface ApiErrorInfo {
  sessionId: string;
  ts: number;
  error: string;
  /** HTTP status from the event's `status_code` attr; undefined when absent. */
  statusCode?: number;
}

/** Cold-start backfill returned by `snapshot()`. */
export interface TelemetrySnapshot {
  usage: AgentUsageSample[];
  spans: Record<string, ToolSpan[]>;
}

/** Per-session running accumulation (token.usage / cost.usage are DELTA +
 *  monotonic, so we sum each export rather than treating it as a total). */
interface SessionAccum {
  agentId: string;
  model: string;
  ts: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  usd: number;
  accountUuid?: string;
}

const MAX_BODY_BYTES = 8 * 1024 * 1024; // OTLP batches are small; cap unauth peers.
/** At most one reject line per interval, mirroring `hooks.ts` `authorized()`. */
const OTEL_REJECT_LOG_INTERVAL_MS = 10_000;

/** The accumulator key: the (agentId, sessionId) PAIR, never the session id
 *  alone (T-P25-04). Session ids are chosen by whoever posts, so a map keyed by
 *  the id alone lets one agent add spend to another agent's accumulator — and
 *  that arm has to hold even if the token gate failed completely.
 *
 *  The separator is the SAME `\u0000` `hive.ts`'s `applyCostRow` already uses,
 *  so the two halves of the cost path agree; it is written as the six-character
 *  escape rather than a raw NUL so the source stays text to git. A printable
 *  separator would NOT be injective — with a space, ('a','b c') and ('a b','c')
 *  collide, which is exactly the cross-agent fusion this key exists to prevent. */
export function sessionKey(agentId: string, sessionId: string): string {
  return `${agentId}\u0000${sessionId}`;
}
const SPAN_RING_CAP = 200; // rich spans retained per agent for the waterfall.
/** How long a session accumulator may keep feeding an agent's LIVE aggregate.
 *  Sessions are never closed by the OTel protocol — every `--resume`, restart
 *  and account failover just mints a new session.id — so on a week-long floor
 *  `aggregateLive` would sum hundreds of DEAD sessions into the sample the
 *  breaker (#6) diffs, and its view of "spend since last check" drifts. */
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface TelemetryCollectorOptions {
  /** Loopback host to bind. Defaults to 127.0.0.1 (the trust boundary). */
  host?: string;
  /** TCP port. Defaults to 0 → OS-assigned ephemeral port (avoids clashing with
   *  a user's own collector on 4318); the chosen port is read back from the
   *  bound socket and exposed via `endpoint()`. */
  port?: number;
  /** Sink for renderer-facing events (set to `webContents.send`). No-op in tests. */
  emit?: (channel: string, payload: unknown) => void;
  /** Resolve an agent's cwd (from the hive registry) for the transcript fallback. */
  resolveCwd?: (agentId: string) => string | null;
  /** Resolve a CODEX agent's per-agent `CODEX_HOME` (`<hive>/agents/<id>/.codex`),
   *  or null for every other engine. Codex keeps its rollout transcripts there
   *  instead of `~/.claude/projects`, so without this its spend is invisible to
   *  the breaker's caps (#19). Wired in index.ts, next to `resolveCwd`. */
  resolveCodexHome?: (agentId: string) => string | null;
}

export class TelemetryCollector {
  private server: Server | null = null;
  private boundPort: number | null = null;
  private readonly host: string;
  private readonly port: number;
  private readonly emit?: (channel: string, payload: unknown) => void;
  private readonly resolveCwd?: (agentId: string) => string | null;
  private readonly resolveCodexHome?: (agentId: string) => string | null;

  /** sessionId → running accumulation. */
  private readonly sessions = new Map<string, SessionAccum>();
  /** agentId → its sessionIds (lets getAgentUsage aggregate across --resume). */
  private readonly agentSessions = new Map<string, Set<string>>();
  /** agentId → ring buffer of recent tool spans. */
  private readonly spans = new Map<string, ToolSpan[]>();
  /** Push subscribers (Lane A breaker + dashboard). */
  private readonly usageSubs = new Set<(s: AgentUsageSample) => void>();
  /** api_error subscribers — feeds Lane A's breaker error-storm trip (#6), which
   *  has no input source of its own (hook payloads don't expose api errors), and
   *  the account pool's 429/401 detection (which reads `info.statusCode`). */
  private readonly apiErrorSubs = new Set<(agentId: string, info: ApiErrorInfo) => void>();
  /** token -> agentId. THIS collector's own capability registry (T-P25-01),
   *  deliberately NOT the hook token: one secret shared between the hook socket
   *  and an OpenTelemetry-spec'd env var means any grandchild with its own
   *  OTel -> vendor configuration posts the HOOK credential off-box. Two
   *  capabilities, two secrets. Empty until a PTY spawns, and an empty registry
   *  REFUSES — an optional gate whose absence opens the door is the defect this
   *  exists to close. */
  private readonly otelTokens = new Map<string, string>();
  /** Refused batches since start. Read-only accessor below; the only early
   *  warning for a total telemetry blackout (T-P25-08). */
  private rejected = 0;
  private lastRejectLog = 0;

  constructor(opts: TelemetryCollectorOptions = {}) {
    this.host = opts.host ?? '127.0.0.1';
    this.port = opts.port ?? 0;
    this.emit = opts.emit;
    this.resolveCwd = opts.resolveCwd;
    this.resolveCodexHome = opts.resolveCodexHome;
  }

  /** Bind the loopback OTLP listener. The handler is live the instant this
   *  resolves; `endpoint()` then returns the URL to inject into agent env. */
  async start(): Promise<{ ok: boolean; endpoint?: string; error?: string }> {
    if (this.server) return { ok: true, endpoint: this.endpoint() ?? undefined };
    try {
      await this.listen();
      return { ok: true, endpoint: this.endpoint() ?? undefined };
    } catch (e) {
      this.stop();
      return { ok: false, error: errMsg(e) };
    }
  }

  /** Close the listener. Idempotent and best-effort. Accumulated state is kept
   *  (it's ephemeral anyway) so a restart doesn't lose live agents' totals. */
  stop(): void {
    try { this.server?.close(); } catch { /* noop */ }
    this.server = null;
    this.boundPort = null;
  }

  /** The bound loopback URL agents export to, or null until started. */
  endpoint(): string | null {
    return this.boundPort ? `http://${this.host}:${this.boundPort}` : null;
  }

  // ─── the per-agent telemetry capability (T-P25-01) ─────────────────────────

  /** Mint a telemetry-only credential for ONE agent at ONE PTY spawn. Called
   *  through `ptyManager.setOtelTokenSource(...)`, the same choke point the hook
   *  token uses, so a spawn site added later gets one automatically. A leaked
   *  telemetry token buys exactly "post telemetry as the agent that already owns
   *  it" — something that agent could do legitimately — and never the hook
   *  socket. Two mints for one agent are two different secrets on purpose: a
   *  restart mints a fresh one while the old PTY is still tearing down. */
  mintAgentToken(agentId: string): string {
    const token = randomBytes(32).toString('hex');
    this.otelTokens.set(token, agentId);
    return token;
  }

  /** Hand a credential back when its PTY is gone. Token-exact, like `pty.ts`'s
   *  `releaseHookToken`, so a restart's fresh token survives the dying spawn's
   *  revoke. */
  revokeAgentToken(token: string): void {
    this.otelTokens.delete(token);
  }

  /** Batches refused for want of a valid token. Climbing steadily means the
   *  producer stopped working, not that an attacker showed up. */
  get rejectedCount(): number {
    return this.rejected;
  }

  // ─── The locked provider seam ──────────────────────────────────────────────

  /** Pull (contract primary). OTel-live aggregate preferred; transcript fallback
   *  when an agent has no live telemetry yet (e.g. spawned before the feature, or
   *  telemetry off). Returns null only when neither source has anything. */
  getAgentUsage(agentId: string): AgentUsageSample | null {
    const live = this.aggregateLive(agentId);
    if (live) return live;
    return this.transcriptFallback(agentId);
  }

  /** Push (additive, OTel-only). Fires the agent's fresh aggregate whenever new
   *  telemetry lands. Returns an unsubscribe fn. */
  onAgentUsage(cb: (s: AgentUsageSample) => void): () => void {
    this.usageSubs.add(cb);
    return () => this.usageSubs.delete(cb);
  }

  /** In-process api_error feed for Lane A's breaker (#6) and the account pool.
   *  `telemetry.onApiError((agentId) => breaker.recordError(agentId))` and
   *  `telemetry.onApiError((agentId, info) => pool.handleApiError(agentId, info))`.
   *  Returns an unsubscribe fn. */
  onApiError(cb: (agentId: string, info: ApiErrorInfo) => void): () => void {
    this.apiErrorSubs.add(cb);
    return () => this.apiErrorSubs.delete(cb);
  }

  /**
   * Push one cost sample from a PROXY-tier engine (qwen, crush) into the SAME
   * accumulator the OTel path fills (#19).
   *
   * Those CLIs have no telemetry and no hook surface: their sidecar synthesizes a
   * `CostSample` hook payload per response, which HookServer used to write
   * straight to the durable ledger — so their spend was archived but never
   * BUDGETED. `getAgentUsage` (and therefore the breaker's cost/token caps and
   * velocity arms) only ever saw Claude. Routing the sample through here instead
   * gives a proxy engine the identical cumulative sample a Claude agent gets, and
   * the ~30s beat writes its ledger row like everyone else's.
   *
   * Sample fields are DELTAS for one response (the OTel `token.usage` metric is
   * delta too, which is why this can share `session()` verbatim). `usd` is the
   * caller's fallback estimate — never recomputed here, same as the live path.
   */
  recordCostSample(s: AgentUsageSample): void {
    if (!s?.agentId || !s.sessionId) return; // no accounting key → nothing to attribute
    const accum = this.session(s.agentId, s.sessionId);
    const model = normalizeModel(s.model);
    if (model) accum.model = model;
    accum.ts = Number.isFinite(s.ts) && s.ts > 0 ? s.ts : Date.now();
    accum.input += delta(s.input);
    accum.output += delta(s.output);
    accum.cacheRead += delta(s.cacheRead);
    accum.cacheCreation += delta(s.cacheCreation);
    accum.usd += delta(s.usd);
    this.publishUsage(s.agentId);
  }

  /** Drop every accumulator for an agent (called from teardownPty, beside
   *  `breaker.forget`). Both maps are keyed by agent, are only ever added to,
   *  and ids are reused across a respawn — so without this a fresh agent starts
   *  life carrying the dead one's cumulative tokens/cost and its stale spans. */
  forget(id: string): void {
    const set = this.agentSessions.get(id);
    if (set) for (const sid of set) this.sessions.delete(sessionKey(id, sid));
    this.agentSessions.delete(id);
    this.spans.delete(id);
  }

  /** Recent tool spans for the per-agent waterfall (#7B.2), oldest→newest. */
  getSpans(agentId: string): ToolSpan[] {
    return this.spans.get(agentId)?.slice() ?? [];
  }

  /** Everything the renderer needs on cold start (it missed the live pushes). */
  snapshot(): TelemetrySnapshot {
    const usage: AgentUsageSample[] = [];
    for (const agentId of this.agentSessions.keys()) {
      const s = this.aggregateLive(agentId);
      if (s) usage.push(s);
    }
    const spans: Record<string, ToolSpan[]> = {};
    for (const [agentId, ring] of this.spans) spans[agentId] = ring.slice();
    return { usage, spans };
  }

  // ─── HTTP plumbing (mirrors slack.ts) ──────────────────────────────────────

  private listen(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => this.handleRequest(req, res));
      // Assigned BEFORE listen(), not inside its callback: a `stop()` racing
      // ahead of an in-flight bind (bootFloor's start() is fire-and-forget, so
      // a caller that shuts down within the same tick — exactly what
      // test/boot-floor.test.cjs does — used to find `this.server` still null
      // and no-op, leaking the real listener forever, which is a
      // `node --test` hang, not just a resource leak). `server.close()` on a
      // not-yet-listening server is a safe, standard Node pattern.
      this.server = server;
      const onError = (e: Error): void => { this.server = null; reject(e); };
      server.once('error', onError);
      server.listen(this.port, this.host, () => {
        server.off('error', onError);
        const addr = server.address();
        this.boundPort = addr && typeof addr === 'object' ? addr.port : null;
        resolve();
      });
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    // THE trust boundary. Resolved BEFORE the body is consumed and BEFORE
    // anything is parsed, so an unauthenticated peer moves nothing at all. The
    // agent this batch is attributed to comes from the TOKEN; the payload's own
    // `agent.id` claim is not read on this path (see ingestMetrics/ingestLogs).
    const agentId = this.agentForToken(req.headers['x-hive-otel-token']);
    if (!agentId) { this.refuse(res); return; }
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c: Buffer) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        res.writeHead(413); res.end();
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      const url = req.url ?? '';
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (url.includes('/v1/metrics')) this.ingestMetrics(body, agentId);
        else if (url.includes('/v1/logs')) this.ingestLogs(body, agentId);
      } catch { /* malformed batch — drop it, never throw into the socket */ }
      // OTLP success response is an empty JSON ExportServiceResponse.
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    req.on('error', () => {
      if (aborted) return;
      try { res.writeHead(400); res.end(); } catch { /* socket gone */ }
    });
  }

  /** Resolve a request header to the agent that holds it, or null. Fails CLOSED
   *  on an absent header, on an unknown/stale token and on an EMPTY registry
   *  alike (a test collector, or main before any PTY has spawned). */
  private agentForToken(header: string | string[] | undefined): string | null {
    const token = Array.isArray(header) ? header[0] : header;
    if (!token) return null;
    return this.otelTokens.get(token) ?? null;
  }

  /** Refuse, loudly but at most once per interval, mirroring the discipline of
   *  `hooks.ts` `authorized()` — and, for the reason that function's own comment
   *  gives, never printing the identity the payload claimed: printing it invites
   *  a reader to trust it. The message is a DIAGNOSIS, not a status line,
   *  because it is the only signal an operator gets before a silent telemetry
   *  blackout takes the cost ledger, the resume key, every breaker cost arm and
   *  account failover dark at once (T-P25-08). */
  private refuse(res: ServerResponse): void {
    this.rejected += 1;
    const now = Date.now();
    if (now - this.lastRejectLog >= OTEL_REJECT_LOG_INTERVAL_MS) {
      this.lastRejectLog = now;
      console.error(
        `[hive] OTLP batch REJECTED (missing or unknown x-hive-otel-token) — ${this.rejected} `
        + 'refused so far. If this is EVERY batch, the Claude Code SDK is not forwarding the '
        + 'per-signal OTLP header vars (set per spawn in pty.ts) and this floor has NO live cost '
        + 'telemetry at all — ledger, resume key, breaker cost arms and account failover are '
        + 'blind; if it is one agent, that PTY exited and its token was revoked with it, or '
        + 'something other than an agent is posting here.'
      );
    }
    try { res.writeHead(401); res.end(); } catch { /* socket already gone */ }
  }

  // ─── OTLP decode → normalize → accumulate ──────────────────────────────────

  private ingestMetrics(body: unknown, authAgentId?: string): void {
    const root = body as { resourceMetrics?: ResourceMetrics[] };
    if (!Array.isArray(root?.resourceMetrics)) return;
    const touched = new Set<string>(); // agentIds with new data this batch
    for (const rm of root.resourceMetrics) {
      const resAttrs = flattenAttrs(rm.resource?.attributes);
      for (const sm of rm.scopeMetrics ?? []) {
        for (const metric of sm.metrics ?? []) {
          const points = metric.sum?.dataPoints ?? metric.gauge?.dataPoints ?? [];
          for (const dp of points) {
            const attrs = flattenAttrs(dp.attributes);
            // ATTRIBUTION. `authAgentId` is the id `handleRequest` resolved from
            // the caller's token, and `handleRequest` is the ONLY caller that is
            // reachable from the network — it answers 401 before it can get here
            // and always passes a non-empty id. The payload's own claim therefore
            // survives ONLY as the `??` fallback, for the 28 in-process call
            // sites that drive this method directly with the id in the
            // attributes (test/claude-account-failover.test.cjs, the whole
            // FLOOR-09 account-pool suite, plus test/claude-accounts.test.cjs).
            // Both claim reads are behind it: `attrs` and `resAttrs` are two
            // distinct strings and a grep for one does not catch the other.
            const agentId = authAgentId ?? (str(attrs['agent.id']) || str(resAttrs['agent.id']));
            const sessionId = str(attrs['session.id']);
            if (!agentId || !sessionId) continue;
            const accum = this.session(agentId, sessionId);
            const model = normalizeModel(str(attrs['model']));
            if (model) accum.model = model;
            const accountUuid = str(attrs['user.account_uuid']) || str(attrs['user.account_id'])
              || str(resAttrs['user.account_uuid']) || str(resAttrs['user.account_id']);
            if (accountUuid) accum.accountUuid = accountUuid;
            accum.ts = Date.now();
            const value = pointValue(dp);
            if (metric.name === 'claude_code.token.usage') {
              switch (str(attrs['type'])) {
                case 'input': accum.input += value; break;
                case 'output': accum.output += value; break;
                case 'cacheRead': accum.cacheRead += value; break;
                case 'cacheCreation': accum.cacheCreation += value; break;
              }
              touched.add(agentId);
            } else if (metric.name === 'claude_code.cost.usage') {
              accum.usd += value;
              touched.add(agentId);
            }
          }
        }
      }
    }
    for (const agentId of touched) this.publishUsage(agentId);
  }

  private ingestLogs(body: unknown, authAgentId?: string): void {
    const root = body as { resourceLogs?: ResourceLogs[] };
    if (!Array.isArray(root?.resourceLogs)) return;
    for (const rl of root.resourceLogs) {
      const resAttrs = flattenAttrs(rl.resource?.attributes);
      for (const sl of rl.scopeLogs ?? []) {
        for (const lr of sl.logRecords ?? []) {
          const attrs = flattenAttrs(lr.attributes);
          const name = str(attrs['event.name']) || str(lr.body?.stringValue);
          // Token-derived, exactly as in ingestMetrics above — and this is the
          // arm that matters most: an `api_error` carrying `status_code: 401`
          // reaches accountPool.handleApiError, which marks a SHARED Claude
          // account dead and plans a failover for every agent on it.
          const agentId = authAgentId ?? (str(attrs['agent.id']) || str(resAttrs['agent.id']));
          const sessionId = str(attrs['session.id']);
          if (!agentId) continue;
          if (name === 'tool_result') {
            const span: ToolSpan = {
              agentId,
              sessionId,
              ts: Date.now(),
              tool: str(attrs['tool_name']) || 'tool',
              success: truthy(attrs['success']),
              durationMs: numAttr(attrs['duration_ms']),
              decision: undefined
            };
            this.pushSpan(span);
            this.emit?.('telemetry:event', { kind: 'tool_result', span } satisfies TelemetryEvent);
          } else if (name === 'tool_decision') {
            // Attach the accept/reject decision to the most recent span, and emit.
            const decision = str(attrs['decision']) === 'reject' ? 'reject' : 'accept';
            const ring = this.spans.get(agentId);
            if (ring?.length) ring[ring.length - 1].decision = decision;
          } else if (name === 'api_error' || (name && name.includes('error'))) {
            const error = str(attrs['error']) || str(attrs['message']) || name;
            // `status_code` is the one attribute the account pool keys on (429 →
            // cool, 401 → dead); an absent/zero value stays undefined so nobody
            // mistakes "unknown" for a real status.
            const statusCode = numAttr(attrs['status_code']) || undefined;
            const ts = Date.now();
            const info: ApiErrorInfo = { sessionId, ts, error, statusCode };
            for (const cb of this.apiErrorSubs) { try { cb(agentId, info); } catch { /* subscriber threw */ } }
            this.emit?.('telemetry:event', { kind: 'api_error', agentId, sessionId, ts, error, statusCode } satisfies TelemetryEvent);
          }
        }
      }
    }
  }

  // ─── Accumulation helpers ──────────────────────────────────────────────────

  private session(agentId: string, sessionId: string): SessionAccum {
    const key = sessionKey(agentId, sessionId);
    let accum = this.sessions.get(key);
    if (!accum) {
      accum = { agentId, model: '', ts: Date.now(), input: 0, output: 0, cacheRead: 0, cacheCreation: 0, usd: 0 };
      this.sessions.set(key, accum);
    }
    let set = this.agentSessions.get(agentId);
    if (!set) { set = new Set(); this.agentSessions.set(agentId, set); }
    set.add(sessionId);
    return accum;
  }

  private pushSpan(span: ToolSpan): void {
    let ring = this.spans.get(span.agentId);
    if (!ring) { ring = []; this.spans.set(span.agentId, ring); }
    ring.push(span);
    if (ring.length > SPAN_RING_CAP) ring.splice(0, ring.length - SPAN_RING_CAP);
  }

  /** Sum an agent's live sessions into one cumulative sample (sessionId/model =
   *  the most recently active session). Null if the agent has no live data.
   *
   *  Doubles as the sweeper for the age cap: expired accumulators are dropped
   *  here rather than on a timer, because this is the exact place their staleness
   *  does damage (and it runs on every publish/pull, so nothing accretes). */
  private aggregateLive(agentId: string): AgentUsageSample | null {
    const set = this.agentSessions.get(agentId);
    if (!set || set.size === 0) return null;
    const cutoff = Date.now() - SESSION_MAX_AGE_MS;
    const out: AgentUsageSample = {
      agentId, sessionId: '', ts: 0, input: 0, output: 0, cacheRead: 0, cacheCreation: 0, model: '', usd: 0
    };
    for (const sid of set) {
      const a = this.sessions.get(sessionKey(agentId, sid));
      if (!a) { set.delete(sid); continue; }
      if (a.ts < cutoff) { this.sessions.delete(sessionKey(agentId, sid)); set.delete(sid); continue; }
      out.input += a.input;
      out.output += a.output;
      out.cacheRead += a.cacheRead;
      out.cacheCreation += a.cacheCreation;
      out.usd += a.usd;
      if (a.ts >= out.ts) {
        out.ts = a.ts;
        out.sessionId = sid;
        out.model = a.model;
        if (a.accountUuid) out.accountUuid = a.accountUuid;
      }
    }
    // Every session expired (or the set held only ghosts) — no live data left, so
    // say so instead of publishing an all-zero sample the breaker would read as a
    // spend RESET. getAgentUsage then falls through to the transcript.
    if (out.ts === 0) { this.agentSessions.delete(agentId); return null; }
    return out;
  }

  private transcriptFallback(agentId: string): AgentUsageSample | null {
    // Codex first: its rollouts live under the agent's own CODEX_HOME, and a
    // codex worker sharing a cwd with a claude worker would otherwise be billed
    // the NEIGHBOUR's Claude transcripts. Only codex agents resolve a home.
    const codexHome = this.resolveCodexHome?.(agentId);
    const cwd = codexHome ? null : this.resolveCwd?.(agentId);
    const u = codexHome ? readCodexUsage(codexHome) : cwd ? readAgentUsage(cwd) : null;
    if (!u) return null;
    if (!u.inputTokens && !u.outputTokens && !u.cacheReadTokens && !u.cacheWriteTokens) return null;
    return {
      agentId,
      sessionId: '',
      ts: Date.now(),
      input: u.inputTokens,
      output: u.outputTokens,
      cacheRead: u.cacheReadTokens,
      cacheCreation: u.cacheWriteTokens,
      model: u.model ?? '',
      usd: u.estimatedCostUsd
    };
  }

  private publishUsage(agentId: string): void {
    const sample = this.aggregateLive(agentId);
    if (!sample) return;
    for (const cb of this.usageSubs) { try { cb(sample); } catch { /* subscriber threw */ } }
    this.emit?.('telemetry:event', { kind: 'usage', sample } satisfies TelemetryEvent);
  }
}

// ─── OTLP/JSON attribute decoding ─────────────────────────────────────────────

interface OtelKV { key?: string; value?: OtelAnyValue }
interface OtelAnyValue {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
}
interface OtelDataPoint { attributes?: OtelKV[]; asInt?: string | number; asDouble?: number; timeUnixNano?: string }
interface OtelMetric { name?: string; sum?: { dataPoints?: OtelDataPoint[] }; gauge?: { dataPoints?: OtelDataPoint[] } }
interface ResourceMetrics { resource?: { attributes?: OtelKV[] }; scopeMetrics?: { metrics?: OtelMetric[] }[] }
interface OtelLogRecord { attributes?: OtelKV[]; body?: { stringValue?: string } }
interface ResourceLogs { resource?: { attributes?: OtelKV[] }; scopeLogs?: { logRecords?: OtelLogRecord[] }[] }

/** Allowlist of attribute keys we ever read — anything else (notably the PII:
 *  user.email, organization.id, user.id) is ignored, so nothing this module
 *  emits can carry identity. `user.account_uuid`/`user.account_id` ARE allowed
 *  (v0.4.5 account pool): they are opaque account identifiers — not the email —
 *  and they are the only signal that can prove a per-agent setup-token actually
 *  took effect (the integrity flag in the per-account panel). */
const ATTR_ALLOWLIST = new Set([
  'agent.id', 'agent.name', 'session.id', 'model', 'type',
  'tool_name', 'success', 'duration_ms', 'decision', 'event.name', 'error', 'message', 'status_code',
  'user.account_uuid', 'user.account_id'
]);

/** Flatten an OTLP KeyValue[] to a plain object, keeping only allowlisted keys. */
function flattenAttrs(attrs: OtelKV[] | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!Array.isArray(attrs)) return out;
  for (const kv of attrs) {
    if (!kv?.key || !ATTR_ALLOWLIST.has(kv.key)) continue;
    const v = kv.value;
    if (!v) continue;
    if (typeof v.stringValue === 'string') out[kv.key] = v.stringValue;
    else if (v.intValue !== undefined) out[kv.key] = Number(v.intValue);
    else if (typeof v.doubleValue === 'number') out[kv.key] = v.doubleValue;
    else if (typeof v.boolValue === 'boolean') out[kv.key] = v.boolValue;
  }
  return out;
}

/** A metric data point's numeric value (int counters arrive as strings in JSON). */
function pointValue(dp: OtelDataPoint): number {
  if (dp.asInt !== undefined) return Number(dp.asInt) || 0;
  if (typeof dp.asDouble === 'number') return dp.asDouble;
  return 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v);
}
function numAttr(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
/** One non-negative delta from an untrusted-ish sidecar payload. A NaN or a
 *  negative would silently corrupt a cumulative accumulator the breaker diffs
 *  (a negative reads as spend going backwards = a free beat), so clamp. */
function delta(v: unknown): number {
  return Math.max(0, numAttr(v));
}
function truthy(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1';
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
