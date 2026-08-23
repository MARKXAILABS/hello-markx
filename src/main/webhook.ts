/**
 * WebhookServer — a generic, secret-gated inbound HTTP API that turns external
 * POSTs into hive work and lets each caller poll that work's status by a token.
 *
 * MANY endpoints, ONE server, ONE tunnel. Endpoints are told apart by the id in
 * the request path, so adding a webhook costs no extra port and no extra tunnel:
 *   - POST /<webhookId>  + `x-md-webhook-secret: <that endpoint's secret>`
 *       + JSON body matching THAT endpoint's user-editable schema
 *       → 200 `{ ok, token, taskId }`  when the endpoint's TriggerMode lets the
 *         message through (routed to god, kanban card created), or
 *       → 202 `{ ok, pending: true, token, status: 'awaiting-approval' }` when the
 *         mode holds it for the operator. Either way the caller gets its token.
 *   - GET  /<webhookId>  + `x-md-webhook-token: <token>` (or `?token=`)
 *       → returns ONLY that token's task status: `{ ok, status, title, result? }`.
 *   - POST / (bare) is an alias for the endpoint with id `legacy`, so a caller
 *     holding the pre-multi-endpoint URL keeps working across the upgrade.
 *
 * SECURITY — this is a PUBLIC surface (tunnel-forwarded), unlike the loopback
 * /reply endpoint, so the gate is strict. Every property of the single-endpoint
 * version is preserved, plus the ones multi-tenancy adds:
 *   - constant-time secret comparison (both sides hashed to a fixed width first,
 *     so not even the secret's LENGTH leaks through an early return), against
 *     THAT endpoint's secret only — revoking one endpoint cannot affect another,
 *   - an UNKNOWN endpoint id is answered exactly like a WRONG secret: the compare
 *     still runs (against an unguessable per-process decoy) and the reply is the
 *     same 401 body, so the surface can't be walked to discover which ids exist,
 *   - GET does its token lookup whether or not the id is known, for the same
 *     reason: identical work, identical 404 — no enumeration signal,
 *   - secrets are held only in this class, and NEVER logged, echoed, or forwarded
 *     into the routed message / card / response (the handler is handed `{id,name}`,
 *     not the endpoint record),
 *   - the capability token is unguessable (minted by the caller-side handler,
 *     192-bit) and a GET reveals only the single task it maps to — no listing,
 *   - a request body cap + fixed-window rate limits (GLOBAL *and* per-endpoint, so
 *     one noisy caller can't starve the others) bound abuse before parsing/crypto.
 *
 * Runs in the Electron main process. Deliberately free of any `electron` import so
 * it can be unit-/smoke-tested as a plain Node module. The actual card creation +
 * god routing + token→status lookup are injected as callbacks (they need hive
 * access, which lives in the main entrypoint); this class owns only transport,
 * the secret gate, schema validation, rate limiting, and the tunnel.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isReservedEndpointId, RESERVED_ENDPOINT_IDS, validateAgainstSchema,
  type InboundKind, type WebhookVerifier
} from '../shared/triggers';
import type { TunnelHandle, TunnelOpener } from './tunnel';

/** One servable endpoint — the structural subset of `WebhookTrigger` this class
 *  needs. A whole `WebhookTrigger` is assignable, so callers pass config rows
 *  straight in without a mapping step. */
export interface WebhookEndpoint {
  id: string;
  name: string;
  /** Shared secret the caller echoes in `x-md-webhook-secret`. Never leaves this class. */
  secret: string;
  /** User-editable JSON Schema (serialised) inbound bodies are checked against. */
  schema: string;
  /** DAEMON-03: which verifier strategy gates this endpoint. Absent = 'shared-secret'. */
  verifier?: WebhookVerifier;
}

/** What the dispatch handler is told about the endpoint a message arrived on.
 *  DELIBERATELY excludes `secret`: the handler writes cards, hive messages and
 *  history rows, and none of them may ever be able to carry a live credential. */
export interface WebhookEndpointRef {
  id: string;
  name: string;
}

/** The validated body of an accepted POST — just the work to do plus the sender's
 *  own framing of it. The secret has already been verified and is intentionally
 *  NOT part of this shape, so it can never be forwarded onward. */
export interface WebhookInbound {
  message: string;
  title?: string;
  /** Declared by the caller when they bothered to; the handler classifies when not. */
  kind?: InboundKind;
  /** Who is sending, for the trigger history. Falls back to the endpoint name. */
  from?: string;
}

/** What the handler did with an accepted message. `pending` is the whole point of
 *  the split: the caller is told, honestly, whether work actually started. */
export interface WebhookDispatch {
  /** Capability token to hand back — the ONLY echo, and only ever returned once. */
  token: string;
  /** Kanban card id; absent while a message waits for the operator (no card yet). */
  taskId?: string;
  /** true = held for operator approval (→ 202), false = routed to god (→ 200). */
  pending: boolean;
}

/** What a GET exposes for a token — mirrors the kanban's public columns only,
 *  plus the synthetic statuses a held message reports before it becomes work. */
export interface WebhookTaskStatus {
  status: string;
  title: string;
  result?: string;
}

/** One open human-feedback ask, shaped for the phone's "ASK ME" screen
 *  (UI-SPEC S5 screen 1). Newest first. */
export interface PhoneAsk {
  taskId: string;
  title: string;
  question: string;
  agent?: string;
  askedAt?: string;
}

export interface WebhookServerOptions {
  /** Local TCP port the HTTP server binds to (and the tunnel forwards to). */
  port: number;
  /** The endpoints to serve. May be swapped later with `setEndpoints`. */
  endpoints: WebhookEndpoint[];
  /**
   * Turn a verified POST into hive work (or into a held message awaiting the
   * operator). Return null to signal a server-side failure (→ 500). The token it
   * returns is the ONLY thing echoed to the caller; no secret ever reaches here.
   */
  onMessage: (msg: WebhookInbound, endpoint: WebhookEndpointRef) => WebhookDispatch | null;
  /**
   * Resolve a capability token to its task's public status, or null when the
   * token maps to nothing (→ 404). MUST be scoped to the one token — it must
   * never reveal or enumerate any other task.
   */
  lookupStatus: (token: string) => WebhookTaskStatus | null;
  /**
   * Where the built phone PWA bundle lives on disk, or null when it isn't
   * available (dev before plan 02-09 lands, or a broken install). INJECTED,
   * never resolved in this file (D-23) — resolving `app.isPackaged` /
   * `process.resourcesPath` here would give this transport-only, electron-free
   * file its first `electron` import, the exact anti-pattern this phase exists
   * to remove. `index.ts` resolves it the same way `slackReplyScriptPath()`
   * already does and passes the closure in.
   */
  staticRoot?: () => string | null;
  /** The floor's currently open human-feedback asks, for `GET /phone/api/asks`.
   *  Injected so no `hive` type ever has to enter this transport file. Absent
   *  or throwing → an empty list, never a 500. */
  openAsks?: () => PhoneAsk[];
  /** Answer one open ask from the phone. Returns false on any failure so the
   *  caller can report honestly (the draft stays, the button re-enables). */
  answerAsk?: (taskId: string, answer: string) => boolean;
  /** Injectable clock — tests move the enrollment TTL and the auth lockout
   *  forward without sleeping a real unit test. Defaults to `Date.now`. */
  now?: () => number;
}

/** Reject bodies larger than this before buffering — callers send tiny JSON; the
 *  cap stops an unauthenticated peer forcing unbounded memory use pre-auth. */
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB
/** Basic abuse guard: at most this many requests per fixed window, globally. */
const RATE_LIMIT = 120;
/** …and this many per endpoint, so one noisy caller burns its own budget first
 *  instead of everyone's. Strictly below the global cap, or it would never bind. */
const PER_ENDPOINT_RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

/** Bare `POST /` keeps serving the endpoint the pre-multi-endpoint migration
 *  parked under this id, so a caller already pointed at the old URL is unaffected. */
export const LEGACY_ENDPOINT_ID = 'legacy';

/** The route prefix the phone bundle owns (D-23). Defined AS the shared
 *  reservation list's own entry, never a second literal — an operator-chosen
 *  endpoint id and this route prefix may never collide, or one silently
 *  shadows the other. `setEndpoints` below and `index.ts`'s
 *  `sanitizeWebhookTrigger` both refuse it independently. */
export const PHONE_PREFIX = RESERVED_ENDPOINT_IDS[0];

/** Rate-limit bucket shared by EVERY unknown id. One bucket, not one per id:
 *  per-id buckets for ids we don't serve would let a prober both grow our memory
 *  unboundedly and — worse — observe that unknown ids never hit the per-endpoint
 *  limit while real ones do. Sharing one bucket makes the two indistinguishable. */
const UNKNOWN_BUCKET = ':unknown';

/* ─────────────────────────────── the phone ────────────────────────────────
 * `/phone/**` is routed AHEAD of readEndpointId (D-23) — it is inherently
 * multi-segment (`/phone/index.html`, `/phone/api/asks`), and readEndpointId's
 * own contract answers anything deeper than one segment like an unknown
 * endpoint. The phone gets its OWN rate bucket, strictly below the global cap
 * for the identical reason PER_ENDPOINT_RATE_LIMIT is: UI-SPEC's 10s poll is
 * ~6 requests/minute plus a ~5-request cold load, so this cap bounds the phone
 * without the phone ever being able to consume the whole global budget and
 * starve webhook callers (T-P02-05-08). The global cap above is neither
 * raised nor bypassed by any of this. */
const PHONE_BUCKET = ':phone';
const PHONE_RATE_LIMIT = 40;

/** A second, tighter bucket + lockout guard the auth-bearing routes
 *  (`/phone/api/enroll`, `/asks`, `/answer`) share — this is where DAEMON-05's
 *  "rate limiting and lockout on the auth endpoint" bullet is actually
 *  satisfied. Strictly below PHONE_RATE_LIMIT for the same reason that is
 *  strictly below RATE_LIMIT. */
const PHONE_AUTH_BUCKET = ':phone:auth';
const PHONE_AUTH_RATE_LIMIT = 20;
/** How long a minted enrollment token stays exchangeable. Minting REPLACES any
 *  unburned predecessor (a QR left on screen from a previous press is dead the
 *  moment a new one is drawn — UI-SPEC: "No stale QR is ever left on screen"). */
const PHONE_ENROLL_TTL_MS = 10 * 60_000;
/** Consecutive auth failures on `/phone/api/**` before the lockout engages,
 *  and how long it holds. SHORT and PROVABLY CLEARING — this lockout is
 *  GLOBAL, not per-client (every caller behind the tunnel presents the
 *  tunnel's own IP, webhook.ts's own long-standing comment above), so it is
 *  remotely DoS-able by anyone who knows the URL. Accepted and bounded
 *  (T-P02-05-09), never described as per-client. Resets to zero on any
 *  successful credential presentation. */
const PHONE_LOCKOUT_FAILURES = 5;
const PHONE_LOCKOUT_MS = 30_000;
/** The answer body is capped far below the general MAX_BODY_BYTES — this text
 *  becomes an instruction inside an agent's terminal (T-P02-05-11), and the
 *  boundary is the only place it is bounded at all (no content filtering
 *  exists past this cap). */
const PHONE_MAX_BODY_BYTES = 8 * 1024;
/** A `taskId` presented from the phone must match a boring charset — it is
 *  used only to look up an existing card, never joined into a path or query,
 *  but a free-form string here would still be an unnecessary surface. */
const PHONE_TASK_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * The phone's static shell — an EXACT-FILENAME allowlist, frozen, exported so
 * a test can assert its shape and plan 02-09 can check its own build output
 * against this SAME list rather than a second copy. The allowlist IS the
 * traversal defence: no request-derived string is ever joined into a
 * filesystem path (see `handlePhoneStatic` below), so there is nothing here
 * for `src/main/fs.ts`'s `safeJoin` to add — this file has zero request-derived
 * path segments reaching a `join()` call at all.
 */
export const PHONE_ASSETS: Readonly<Record<string, { file: string; type: string }>> = Object.freeze({
  'index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  'sw.js': { file: 'sw.js', type: 'text/javascript; charset=utf-8' },
  'manifest.webmanifest': { file: 'manifest.webmanifest', type: 'application/manifest+json' },
  'icon-192.png': { file: 'icon-192.png', type: 'image/png' },
  'icon-512.png': { file: 'icon-512.png', type: 'image/png' }
});

/** The Content-Security-Policy every static phone response carries.
 *  `'unsafe-inline'` is a deliberate, stated trade: UI-SPEC S5 locks the phone
 *  to one hand-written `index.html` with an inline `<style>` and `<script>` —
 *  there is no build step to hash or externalise them against. */
const PHONE_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; "
  + "style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; "
  + "base-uri 'none'; form-action 'none'";

/** Every failure on `/phone/api/**` — an absent header, a wrong bearer, a
 *  burned or expired enrollment token, an unknown route — answers with this
 *  SAME body, byte-identical to the main endpoint gate's 401 (D-19/D-24): the
 *  auth surface keeps the no-enumeration property even though the static
 *  shell above it necessarily gives it up. */
const PHONE_AUTH_FAIL_BODY = { ok: false, error: 'unauthorized' } as const;

export class WebhookServer {
  private server: Server | null = null;
  private tunnel: TunnelHandle | null = null;
  private readonly port: number;
  private endpoints = new Map<string, WebhookEndpoint>();
  private readonly onMessage: (msg: WebhookInbound, endpoint: WebhookEndpointRef) => WebhookDispatch | null;
  private readonly lookupStatus: (token: string) => WebhookTaskStatus | null;
  private readonly staticRootFn?: () => string | null;
  private readonly openAsksFn?: () => PhoneAsk[];
  private readonly answerAskFn?: (taskId: string, answer: string) => boolean;
  /** Injectable clock (tests only — defaults to `Date.now`). */
  private readonly now: () => number;
  /** Compared against when the requested id doesn't exist, purely so the failure
   *  path does the same work as a wrong-secret failure. Random per process and
   *  never exported, so it cannot be matched even by accident. */
  private readonly decoySecret = randomBytes(32).toString('hex');
  // Fixed-window rate limiters keyed by bucket ('' = global, else the endpoint id).
  // The remote IP is the tunnel's, so per-IP would be meaningless behind cloudflared
  // — every caller presents cloudflared's own IP, so per-IP limiting buys nothing and
  // the global lockout below is remotely DoS-able by anyone who knows the URL (D-23).
  private windows = new Map<string, { start: number; count: number }>();

  /** The current single-use enrollment token's digest + expiry, or null once
   *  burned/never minted. Neither this nor a bearer is EVER persisted (D-19):
   *  the bearer is origin-scoped and the tunnel origin dies with the process,
   *  so a persisted credential could never be presented again. */
  private phoneEnrollment: { hash: Buffer; expiresAt: number } | null = null;
  /** SHA-256 digests of every issued, still-live bearer — never the raw
   *  bearer, which is returned to the caller exactly once and forgotten. */
  private readonly phoneBearerDigests = new Set<string>();
  private phoneAuthFailures = 0;
  private phoneLockedUntil = 0;

  constructor(opts: WebhookServerOptions) {
    this.port = opts.port;
    this.onMessage = opts.onMessage;
    this.lookupStatus = opts.lookupStatus;
    this.staticRootFn = opts.staticRoot;
    this.openAsksFn = opts.openAsks;
    this.answerAskFn = opts.answerAsk;
    this.now = opts.now ?? Date.now;
    this.setEndpoints(opts.endpoints);
  }

  /**
   * Swap the served endpoint list WITHOUT restarting the server or the tunnel —
   * the operator adds, edits and revokes webhooks from the UI, and a restart would
   * mint a fresh (ephemeral) tunnel URL, silently breaking every caller of every
   * OTHER endpoint. The map is rebuilt wholesale so a removed id stops resolving
   * on the very next request.
   */
  setEndpoints(list: WebhookEndpoint[]): void {
    const next = new Map<string, WebhookEndpoint>();
    for (const e of list) {
      if (!e || typeof e.id !== 'string' || !e.id || typeof e.secret !== 'string' || !e.secret) continue;
      // `phone` (case-insensitively) is the route prefix PHONE_PREFIX reserves
      // for the phone bundle — an operator-configured endpoint here would
      // either shadow that route or be silently unservable. Refused here AND
      // in index.ts's sanitizeWebhookTrigger, so the UI cannot save it either.
      if (isReservedEndpointId(e.id)) continue;
      next.set(e.id, e);
    }
    this.endpoints = next;
    // Drop rate-limit state for ids we no longer serve; keep the global and
    // unknown buckets so a swap can't be used to reset an in-flight flood.
    for (const key of [...this.windows.keys()]) {
      if (key === '' || key === UNKNOWN_BUCKET) continue;
      if (!next.has(key)) this.windows.delete(key);
    }
  }

  /** Ids currently served, for the settings surface that shows per-endpoint URLs. */
  endpointIds(): string[] {
    return [...this.endpoints.keys()];
  }

  /** The public tunnel URL, or null when no tunnel is up. */
  publicUrl(): string | null {
    return this.tunnel?.url ?? null;
  }

  /** Is the local HTTP server bound? `start()` reports ok:false for a tunnel
   *  failure too, and in THAT case the security boundary is still live — the
   *  caller must keep the instance (or the listener leaks, unstoppable). */
  listening(): boolean {
    return this.server != null;
  }

  /**
   * Bind the local HTTP server. That is ALL this does now — DAEMON-05's
   * off-by-default clause made structural, not a config check: no public
   * tunnel opens as a side effect of starting this server, ever. A tunnel
   * exists only where an operator action calls {@link startTunnel} afterwards.
   * The local handler is the security boundary and is live the instant this
   * resolves `{ ok: true }`. `url` stays in the return shape (always absent
   * here — never set by this method) so `index.ts`'s call sites keep
   * typechecking across the plan's own task boundary; plan 02-04 task 4 is
   * where the caller-side wiring onto {@link startTunnel} actually lands.
   */
  async start(): Promise<{ ok: boolean; url?: string; error?: string }> {
    if (this.server) return { ok: false, error: 'already running' };
    // The phone needs the server up with no webhook trigger configured at
    // all. Breaking the circularity in the direction that keeps the door off
    // by default: `phoneArmed()` is only ever true after an operator action
    // (phone:pairing) mints an enrollment token, so this guard still refuses
    // to bind on a stone-cold-default install with nothing configured.
    if (this.endpoints.size === 0 && !this.phoneArmed()) {
      return { ok: false, error: 'no enabled webhook endpoints' };
    }
    try {
      await this.listen();
    } catch (e) {
      this.stop();
      return { ok: false, error: `failed to bind port ${this.port}: ${errMsg(e)}` };
    }
    return { ok: true };
  }

  /**
   * Open a public tunnel over the already-listening local server, via an
   * injected {@link TunnelOpener}. Never called by `start()` itself — an
   * operator action supplies `open`. Non-fatal: the local handler stays live
   * even when this fails, and the caller is told why.
   */
  async startTunnel(open: TunnelOpener): Promise<{ ok: boolean; url?: string; error?: string }> {
    if (!this.server) return { ok: false, error: 'local server is not running' };
    if (this.tunnel) return { ok: true, url: this.tunnel.url };
    try {
      this.tunnel = await open(this.port);
      return { ok: true, url: this.tunnel.url };
    } catch (e) {
      return { ok: false, error: `tunnel unavailable: ${errMsg(e)}` };
    }
  }

  /** Close the tunnel this server opened, if any. Idempotent — it is a call
   *  into the tunnel handle's own idempotent `stop()`, never re-implemented. */
  stopTunnel(): void {
    this.tunnel?.stop();
    this.tunnel = null;
  }

  /**
   * Close the HTTP server AND the tunnel over it, if one is open. Idempotent
   * and best-effort. The tunnel actually closes now: it is a child process
   * this app spawned, and `stopTunnel()` -> `hardKillTree(child.pid)` is the
   * OS reclaiming a process handle, not anything special about `stop()`.
   */
  stop(): void {
    this.stopTunnel();
    try { this.server?.close(); } catch { /* noop */ }
    this.server = null;
  }

  private listen(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => this.handleRequest(req, res));
      const onError = (e: Error): void => reject(e);
      server.once('error', onError);
      // '127.0.0.1' ONLY. The public reach of this server is the tunnel, and
      // cloudflared forwards to the explicit literal `http://127.0.0.1:PORT` —
      // never a `localhost` resolution the OS could send elsewhere, which is a
      // STRONGER guarantee than the previous tunnel vendor's own rationale gave
      // (that one forwarded to a resolved `localhost`). Binding every interface
      // would additionally hand the whole LAN an un-tunneled copy of a
      // public-secret-gated surface, for nothing. Matches SlackReplyServer and
      // IntegrationBroker.
      server.listen(this.port, '127.0.0.1', () => {
        server.off('error', onError);
        this.server = server;
        resolve();
      });
    });
  }

  /**
   * Mint a fresh 192-bit enrollment token (the size the file's own capability
   * token already uses), TTL-bounded. REPLACES any unburned predecessor — a QR
   * left on screen from a previous press is dead the instant a new one is
   * drawn. Arms the phone (see {@link phoneArmed}); never persisted (D-19).
   */
  mintEnrollment(): { token: string; expiresAt: number } {
    const token = randomBytes(24).toString('hex');
    const expiresAt = this.now() + PHONE_ENROLL_TTL_MS;
    this.phoneEnrollment = { hash: sha256(token), expiresAt };
    return { token, expiresAt };
  }

  /** True while an unexpired enrollment token or at least one issued bearer
   *  exists. `/phone/**`'s dark-state branch and `start()`'s zero-endpoint
   *  guard both read this — the phone route stays a 404 exactly like an
   *  unknown endpoint until the operator deliberately pairs. */
  phoneArmed(): boolean {
    if (this.phoneEnrollment && this.now() <= this.phoneEnrollment.expiresAt) return true;
    return this.phoneBearerDigests.size > 0;
  }

  /** Fixed-window limiter — bounds total work before any parse/crypto runs. */
  private allowRequest(bucket: string, limit: number): boolean {
    const now = this.now();
    const w = this.windows.get(bucket);
    if (!w || now - w.start > RATE_WINDOW_MS) {
      this.windows.set(bucket, { start: now, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= limit;
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Rate limit first — cheapest possible rejection, ahead of any work.
    if (!this.allowRequest('', RATE_LIMIT)) { json(res, 429, { ok: false, error: 'rate limited' }); return; }
    // The phone is judged HERE, ahead of readEndpointId (D-23) — never inside
    // handleStatus/handleCreate. `/phone/**` is inherently multi-segment, and
    // readEndpointId's own contract (below) answers anything deeper than one
    // segment like an unknown endpoint; without this branch the phone would
    // never be reachable at all.
    const segments = pathSegments(req);
    if (segments[0] === PHONE_PREFIX) { this.handlePhone(req, res, segments.slice(1)); return; }
    const id = readEndpointId(req);
    const endpoint = id !== null ? this.endpoints.get(id) ?? null : null;
    // Per-endpoint budget, with every unknown id sharing one bucket (see UNKNOWN_BUCKET).
    if (!this.allowRequest(endpoint ? endpoint.id : UNKNOWN_BUCKET, PER_ENDPOINT_RATE_LIMIT)) {
      json(res, 429, { ok: false, error: 'rate limited' }); return;
    }
    const method = req.method ?? '';
    if (method === 'GET') { this.handleStatus(req, res, endpoint); return; }
    if (method === 'POST') { this.handleCreate(req, res, endpoint); return; }
    res.writeHead(405); res.end();
  }

  /**
   * `/phone/**` — the phone's own rate bucket, then the dark-state gate: until
   * the operator pairs, this answers exactly like an unknown endpoint (same
   * 404 body), so the origin does not self-identify as a Hello MarkX floor
   * (RESEARCH §4.3 item 3, narrowed to "after pairing, for the life of the
   * process" — T-P02-05-10).
   */
  private handlePhone(req: IncomingMessage, res: ServerResponse, rest: string[]): void {
    if (!this.allowRequest(PHONE_BUCKET, PHONE_RATE_LIMIT)) {
      json(res, 429, { ok: false, error: 'rate limited' }); return;
    }
    if (!this.phoneArmed()) { json(res, 404, { ok: false, error: 'not found' }); return; }
    this.handlePhoneStatic(req, res, rest);
  }

  /**
   * Serve the phone PWA shell off `PHONE_ASSETS` — an EXACT-FILENAME allowlist
   * lookup, never a joined path. `rest` is everything after `/phone/`; an
   * empty or missing second segment means `index.html` (`/phone` and
   * `/phone/` both work). Anything deeper than one segment, or not a key in
   * the allowlist, is a 404 — including a nested path, a `..`-shaped key that
   * survived URL normalisation, and a NUL-embedded name.
   */
  private handlePhoneStatic(req: IncomingMessage, res: ServerResponse, rest: string[]): void {
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    if (rest.length > 1) { json(res, 404, { ok: false, error: 'not found' }); return; }
    let key = rest[0] ?? '';
    if (key) {
      try { key = decodeURIComponent(key); } catch { json(res, 404, { ok: false, error: 'not found' }); return; }
    } else {
      key = 'index.html';
    }
    const asset = PHONE_ASSETS[key];
    if (!asset) { json(res, 404, { ok: false, error: 'not found' }); return; }
    const root = this.staticRootFn ? this.staticRootFn() : null;
    if (!root) { json(res, 404, { ok: false, error: 'not found' }); return; }
    let body: Buffer;
    try {
      // The ONLY path join in this file, and its joined component is the
      // ALLOWLIST ENTRY'S OWN `.file` — never `key`, never anything derived
      // from the request. The allowlist is the mechanism, not a supplement
      // to `src/main/fs.ts`'s `safeJoin`: by this line there is no
      // request-derived segment left to traverse with. A missing
      // `resources/phone/` (dev, before plan 02-09 lands) is a normal state
      // and answers 404, never a 500.
      body = readFileSync(join(root, asset.file));
    } catch { json(res, 404, { ok: false, error: 'not found' }); return; }
    res.writeHead(200, {
      'content-type': asset.type,
      // Load-bearing on sw.js specifically: a cached service worker outliving
      // a rotated tunnel origin is a zombie (D-19).
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      // The enrollment token rides in the URL fragment (never sent in a
      // Referer by browsers, but stated as policy rather than left implicit).
      'referrer-policy': 'no-referrer',
      'content-security-policy': PHONE_CSP
    });
    res.end(body);
  }

  /**
   * GET — return the status of the token's task (token only; never a listing).
   *
   * The lookup runs even when the id is unknown, and the answer is then the same
   * 404 the unknown-token case gives. Skipping the lookup would make "no such
   * webhook" measurably cheaper than "no such token", which is exactly the signal
   * an id-enumeration probe is looking for.
   */
  private handleStatus(req: IncomingMessage, res: ServerResponse, endpoint: WebhookEndpoint | null): void {
    const token = readToken(req);
    if (!token) { json(res, 401, { ok: false, error: 'token required' }); return; }
    let status: WebhookTaskStatus | null = null;
    try { status = this.lookupStatus(token); }
    catch { json(res, 500, { ok: false, error: 'lookup failed' }); return; }
    // 404 for an unknown token — identical to a malformed one and to an unknown
    // endpoint id, so a probe can't distinguish any of the three (no enumeration).
    if (!status || !endpoint) { json(res, 404, { ok: false, error: 'not found' }); return; }
    json(res, 200, { ok: true, status: status.status, title: status.title, result: status.result ?? null });
  }

  /** POST — verify this endpoint's secret, then buffer + validate + dispatch. */
  private handleCreate(req: IncomingMessage, res: ServerResponse, endpoint: WebhookEndpoint | null): void {
    // Authenticate BEFORE reading the body so an unauthenticated peer can't even
    // make us buffer (within the size cap). 401 on any failure — no detail leaked,
    // and an unknown id lands here too so it is answered identically.
    if (!this.verifySecret(req, endpoint) || !endpoint) { json(res, 401, { ok: false, error: 'unauthorized' }); return; }

    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    req.on('data', (c: Buffer) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) { aborted = true; json(res, 413, { ok: false, error: 'too large' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      let parsed: unknown;
      try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { json(res, 400, { ok: false, error: 'bad json' }); return; }

      // The endpoint's own schema decides what a valid body is. Echoing the
      // validator's message is safe: it describes the CALLER's payload and can
      // never contain our secret (the schema is the operator's own document).
      const check = validateAgainstSchema(parsed, parseSchema(endpoint.schema));
      if (!check.ok) { json(res, 400, { ok: false, error: check.error }); return; }

      const body = (parsed ?? {}) as Record<string, unknown>;
      // `message` is required regardless of what the user's schema says — it is
      // the one field the router cannot work without, so a schema edited to drop
      // it fails here rather than producing an empty card.
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (!message) { json(res, 400, { ok: false, error: 'message required' }); return; }
      const inbound: WebhookInbound = { message };
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (title) inbound.title = title;
      if (body.kind === 'directive' || body.kind === 'communication') inbound.kind = body.kind;
      const from = typeof body.from === 'string' ? body.from.trim() : '';
      if (from) inbound.from = from;

      let out: WebhookDispatch | null = null;
      try { out = this.onMessage(inbound, { id: endpoint.id, name: endpoint.name }); }
      catch { json(res, 500, { ok: false, error: 'could not create task' }); return; }
      if (!out) { json(res, 500, { ok: false, error: 'could not create task' }); return; }
      // 202, not 200: the message was accepted but no work has started. The caller
      // still gets its token so it can poll the hold, and the GET reports the hold
      // honestly rather than pretending a task is queued.
      if (out.pending) {
        json(res, 202, {
          ok: true,
          pending: true,
          status: 'awaiting-approval',
          token: out.token,
          detail: 'accepted — waiting for the operator to approve it before the hive sees it'
        });
        return;
      }
      json(res, 200, { ok: true, token: out.token, taskId: out.taskId });
    });
    req.on('error', () => { if (!aborted) { try { res.writeHead(400); res.end(); } catch { /* socket gone */ } } });
  }

  /**
   * Constant-time check that `x-md-webhook-secret` equals THIS endpoint's secret.
   * Both sides are SHA-256'd to a fixed 32 bytes first: `timingSafeEqual` throws
   * on unequal lengths, and the obvious `if (a.length !== b.length) return false`
   * guard answers a wrong-length guess measurably faster than a right-length one,
   * which hands a public caller the secret's length for free.
   *
   * A null endpoint (unknown id) still runs the comparison, against a decoy no
   * caller can hold, and then fails unconditionally — so "no such webhook" costs
   * the same as "wrong secret" and answers with the same 401.
   */
  private verifySecret(req: IncomingMessage, endpoint: WebhookEndpoint | null): boolean {
    const provided = req.headers['x-md-webhook-secret'];
    if (typeof provided !== 'string') return false;
    const equal = timingSafeEqual(sha256(provided), sha256(endpoint ? endpoint.secret : this.decoySecret));
    return endpoint ? equal : false;
  }
}

/** Split a request's URL into non-empty path segments. Shared by
 *  `readEndpointId` and `handleRequest`'s phone-prefix check, which runs
 *  BEFORE `readEndpointId` is ever called — `/phone/**` never reaches it. */
function pathSegments(req: IncomingMessage): string[] {
  let pathname: string;
  try { pathname = new URL(req.url ?? '/', 'http://localhost').pathname; }
  catch { return []; }
  return pathname.split('/').filter((s) => s.length > 0);
}

/**
 * The endpoint id from the request path: `/foo` → `foo`, bare `/` → `legacy`.
 * A deeper path (`/a/b`) resolves to null = "no such endpoint", which is then
 * answered exactly like a wrong secret / unknown token. `/phone/**` no longer
 * reaches this function at all — `handleRequest` judges that prefix first.
 */
function readEndpointId(req: IncomingMessage): string | null {
  const segments = pathSegments(req);
  if (segments.length === 0) return LEGACY_ENDPOINT_ID;
  if (segments.length > 1) return null;
  try { return decodeURIComponent(segments[0]); } catch { return segments[0]; }
}

/** Parse the endpoint's stored schema. An unparseable one yields `undefined`,
 *  which `validateAgainstSchema` treats as "accept" — a mistyped schema must not
 *  lock a caller out of an endpoint they hold a valid secret for. */
function parseSchema(schema: string): unknown {
  if (typeof schema !== 'string' || !schema.trim()) return undefined;
  try { return JSON.parse(schema); } catch { return undefined; }
}

/** Pull the capability token from the `x-md-webhook-token` header, falling back
 *  to a `?token=` query param. Header is preferred (kept out of URL/access logs). */
function readToken(req: IncomingMessage): string {
  const h = req.headers['x-md-webhook-token'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    const q = url.searchParams.get('token');
    if (q && q.trim()) return q.trim();
  } catch { /* malformed url → no token */ }
  return '';
}

function json(res: ServerResponse, status: number, body: unknown): void {
  try {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  } catch { /* socket already gone */ }
}

/** Fixed-width digest of a candidate secret, so a constant-time compare never
 *  has to branch on (and therefore leak) its length. */
function sha256(s: string): Buffer {
  return createHash('sha256').update(s, 'utf8').digest();
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
