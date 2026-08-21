# Phase 2: The Daemon and the Protocol — Pattern Map

**Mapped:** 2026-08-21
**Files analyzed:** 40 (16 new · 24 modified)
**Analogs found:** 33 exact-or-role-match / 40 — **7 have no analog in this repo and say so plainly**

**Every line number below was produced by a command run in this session at `2f29d0b`.** Re-measured
here rather than inherited: `src/main/index.ts` **5,812** lines · `src/main/hive.ts` **4,121** ·
`src/main/webhook.ts` **468** · `src/main/slack.ts` **536** · `src/main/delivery.ts` **924** ·
`src/shared/providerAutomation.ts` **348** · `AgentCard.tsx` **433** · `AddAgentModal.tsx` **1,101** ·
`AskMeTab.tsx` **275**. Verified absent: `src/main/floor/`, `src/main/tunnel.ts`, `resources/phone/`.
Verified: `capabilityLine` is imported by exactly two files — its own
`src/shared/providerAutomation.ts` and `test/engine-parity.test.cjs` (D-30 confirmed a third time).
Verified byte-identical by `diff`: `slack.ts:211-221` vs `webhook.ts:276-286` → **IDENTICAL**;
`slack.ts:180-190` vs `webhook.ts:245-255` differ only in the `[slack]`/`[webhook]` log tag.

---

## File Classification

### New files

| New file | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `src/main/floor/deps.ts` | config / DI contract | dependency injection | `src/main/delivery.ts:94-162` (`DeliveryDeps`) | **exact** |
| `src/main/floor/boot.ts` | service / composition root | lifecycle (boot→teardown) | `index.ts:5537-5577` (`bootstrapHiveServices`) + `index.ts:4340-4357` (`SHUTDOWN_STEPS`) | **exact** |
| `src/main/floor/*.ts` (seam modules) | service | mixed, per seam | the `// ─── … ───` banner sections of `index.ts` themselves; module *style* from `src/main/delivery.ts` | **exact** |
| `src/main/tunnel.ts` | utility / service | child-process lifecycle | `hive.ts:1281-1345` (`startProxyBridge`) + `procKill.ts:34` (`hardKillTree`) | **role-match** |
| `src/main/cloudflared.ts` (acquisition) | utility | file-I/O + network download + verify | `src/main/nodeInstall.ts:114-170` (`shaFor` / `resolveNodeInstaller`) | **exact** |
| `src/main/push.ts` (VAPID / Web Push) | service | outbound request-response | *(crypto shape only)* `slack.ts` HMAC verify, `webhook.ts:463-465` `sha256` | **partial — see No Analog** |
| `resources/phone/index.html` | static asset | browser fetch | — | **NONE** |
| `resources/phone/sw.js` | static asset | browser fetch / push | — | **NONE** |
| `resources/phone/manifest.webmanifest` | static asset | browser fetch | — | **NONE** |
| `resources/phone/icon-{192,512}.png` | static asset | browser fetch | packaging only: `electron-builder.yml` `extraResources` | **partial** |
| `src/shared/terminalWorkOrder.ts` (moved pure fn) | utility (shared) | pure transform | `src/shared/queueDelivery.ts`, `src/shared/providerAutomation.ts` | **exact** |
| `test/boot-floor.test.cjs` | test | lifecycle assertion | `test/delivery-main.test.cjs` + `test/net-binding.test.cjs` + `test/config-secrets.test.cjs:30-45` | **exact** |
| `test/agent-lifecycle.test.cjs` | test | state machine | `test/main-hardening.test.cjs` + `test/hive-durability.test.cjs` `floor(t)` | **exact** |
| `test/hive-router.test.cjs` | test | CRUD / file routing | `test/hive-durability.test.cjs:1-45` (`floor(t)`, `inbox()`, `messagesIn()`) | **exact** |
| `test/tunnel.test.cjs` | test | child-process, injected fake | `test/proc-kill.test.cjs` (real tree) + `test/delivery-main.test.cjs` (fakes harness) | **role-match** |
| `test/mcp-per-agent.test.cjs` | test | file-write assertion | `test/hive-hook-node.test.cjs` + `test/hive-cwd.test.cjs` | **exact** |

### Modified files

| Modified file | Role | Data flow | Pattern to copy from | Match |
|---|---|---|---|---|
| `src/main/index.ts` | entry / Electron wiring | event-driven | its own `index.ts:411-434` (renderer→main move, already done once) | **exact** |
| `src/main/hive.ts` | service (god-file) | CRUD + spawn + routing | its own `installCodexHooks` / `startProxyBridge` / `claim` branch | **exact** |
| `src/main/webhook.ts` | server / route handler | request-response | its own `handleRequest` / `handleStatus` / `verifySecret` | **exact** |
| `src/main/slack.ts` | server | request-response | its `openTunnel`/`stop` (the code being deleted) | **exact** |
| `src/main/config.ts` | config | migration | its own `migrateTriggersV1` (`config.ts:747-785`) | **exact** |
| `src/shared/agentProvider.ts` | model / preset table | pure data | the `grok` / `codex` presets in the same file | **exact** |
| `src/renderer/src/components/AgentCard.tsx` | component | derived render | its own `autoMode` derivation + badge (`:157-163`, `:278-292`) | **exact** |
| `src/renderer/src/components/AddAgentModal.tsx` | component | derived render | its own safe/consent split (`:516-540`) | **exact** |
| `src/renderer/src/components/CommandCenterPanel.tsx` | component | request-response | its own `dispatch()` (`:601-617`) | **exact** |
| `src/renderer/src/components/AskMeTab.tsx` | component | request-response | its own `sendAnswer()` (`:68-103`) | **exact** |
| `src/renderer/src/hooks/useHive.ts` | hook | event-driven (deletions) | the FLOOR-02 deletion comments already in the file (`:665`, `:679`, `:746`) | **exact** |
| `src/preload/index.ts` | bridge | request-response | `preload/index.ts:1227-1233` (`slackStart`/`slackStop`) | **exact** |
| `electron-builder.yml` | config | packaging | its own `extraResources` block (`kg.cjs`, `skills`) | **exact** |
| `test/repo-claims.test.cjs` | test (repo-fact) | grep-pin | its own `test(…, () => { readStripped(...) })` clauses | **exact** |
| `test/engine-parity.test.cjs` | test | pure-fn assertion | its own `capabilityLine` block (`:524-591`) | **exact** |
| `test/webhook-endpoints.test.cjs` | test | request-response | its own `makeServer()` / `request()` stubs (`:44-70`) | **exact** |
| `test/build-assets.test.cjs` | test (repo-fact) | file existence | its own derived-alias walk (`:30-45`) | **exact** |
| `test/hive-task-mutation.test.cjs` | test | CRUD | its own `floor(t)` / `card()` helpers (`:20-38`) | **exact** |
| `test/main-hardening.test.cjs` | test (comment fix) | — | — (delete/correct `:5-7`) | n/a |
| `test/config-secrets.test.cjs` | test (comment fix) | — | — (correct the stale ABI claim `:46-57`) | n/a |
| `test/delivery-main.test.cjs` | test | fakes harness | its own `harness()` (`:28-70`) | **exact** |
| `docs/adr/0001-one-gate-for-pty-writes.md` | doc | — | `docs/adr/README.md` numbering rule | **exact** |
| `README.md` (55-65) | doc | — | — | n/a |
| `.planning/codebase/TESTING.md` | doc | — | — | n/a |

---

## Pattern Assignments

### `src/main/floor/deps.ts` (config / DI contract)

**Analog:** `src/main/delivery.ts:94-162` — `DeliveryDeps`. This is the model D-03's `FloorDeps`
should be shaped like: an interface of **plain functions**, every field carrying a `/** */` that
reasons about *why* it is injected and what breaks otherwise.

**Injection-object pattern** (`delivery.ts:94-107`):
```ts
export interface DeliveryDeps {
  /** Live, non-archived agents that own a PTY right now. */
  liveAgents: () => LiveAgentPty[];
  /** Unread messages in an agent's inbox (hive.inbox). */
  inbox: (agentId: string) => DeliverableMessage[];
  /** Raw PTY write (ptyManager.write). Never throws; reports `ok:false`. */
  write: (ptyId: string, data: string) => { ok: boolean; error?: string };
  /** Operator's auto-delivery pause for this agent (ControlRegistry). */
  paused: (agentId: string) => boolean;
```

**Thunk-not-value pattern — copy this exactly for `paths`** (`delivery.ts:127-145`, abridged):
```ts
  /**
   * Where the MAIN-OWNED delivery queue is persisted (FLOOR-02).
   *
   * A THUNK, not the `string` the plan drafted, and the difference is a real bug
   * rather than a preference: `index.ts` builds this service at module scope,
   * where `readConfig().harnessHome` is legitimately `null` before onboarding.
   * A string captured there would be `join(null-ish, …)` → a RELATIVE path …
   *
   * Injected so a test can point the queue at a temp dir and read the bytes.
   */
  queuePath: () => string | null;
```

**Optional-dep-degrades-safely pattern** (`delivery.ts:113-118`): `breakerLevel?` is documented as
"a floor with no breaker reads every agent as healthy". `FloorDeps.notify` and `.quit` should carry
the same register.

**⚠️ Deviation the analog does NOT show:** `DeliveryDeps.emit` is typed `(channel, payload) => void`.
`FloorDeps.send` **must return `boolean`** — `hive.ts:1670` computes
`this.emit?.(…) === true` and `index.ts:365-372`'s emitter already returns `boolean`. Copying
`DeliveryDeps.emit`'s signature verbatim silently inverts `emitTerminalHandoff`'s branch. Copy the
*shape*, not that one type.

---

### `src/main/floor/boot.ts` (service / composition root, lifecycle)

**Analog A — the forward order is already written:** `src/main/index.ts:5537-5577`
`bootstrapHiveServices()`. Copy the order and the per-step comments verbatim; do not re-derive them.

```ts
/** Start every hive-bound background service against the current harnessHome.
 *  Called on boot, and again to recover in place if a folder-change copy fails
 *  (config:changeHome tears these down before copying). No-op without a home. */
function bootstrapHiveServices(): void {
  if (!hive.enabled()) return;
  hive.ensureHive();
  loadPreservedWorktrees(); // worktrees awaiting integration survive a restart (#14)
  control.replaceAutoDeliveryPauses(readConfig().autoDeliveryPausedAgents ?? []);
  archiveOrphanedAgents(); // #57/#58: archive stale archived:false entries with no live PTY
  hive.startRouter();
  startEphemeralWorkerWatcher(); // poll HIVE_ROOT/spawn-requests → ephemeral workers
  void integrationBroker.start().then((r) => { … });
  ensureDefaultMissions();
  syncMissions();
  syncContextTriggers();
  if ((readConfig().webhookTriggers ?? []).length > 0) startWebhookDoneObserver();
  hookServer.start();
  void telemetry.start().then((r) => { … });
  memory.start(); reflector.start(); delivery.start();
  adoptRendererQueues(); // FLOOR-02 — one-shot
  armAlwaysOnBeats();
}
```

**Analog B — the inverse is already written:** `src/main/index.ts:4340-4357` `SHUTDOWN_STEPS`. This
becomes `Floor.shutdown()`. Copy the declarative-list shape **and its rationale comment** — the
comment is why the list may not become inline calls:

```ts
/** Every background service this app starts, in the order it must be stopped.
 *  ONE list, because there are two teardown paths — the quit and the full reset
 *  — and they were hand-maintained copies that had DRIFTED: resetAll stopped
 *  neither the webhook server nor the proxy-bridge sidecars, so a reset left the
 *  public tunnel open and every qwen sidecar running against a hive that had
 *  just been wiped (#34). Now a new service can only be added in one place. */
const SHUTDOWN_STEPS: ReadonlyArray<{ name: string; stop: () => void }> = [
  { name: 'clearMissionTimers', stop: () => clearMissionTimers() },
  …
  { name: 'killAll', stop: () => ptyManager.killAll() }
];

/** Run the whole list, best-effort: a throw in one step (a dying child, a
 *  half-torn-down socket) must never abort the rest, the quit, or pop a crash
 *  dialog. `tag` keeps quit and reset distinguishable in the log. */
function runShutdown(tag: 'quit' | 'reset'): void {
  for (const step of SHUTDOWN_STEPS) {
    try { step.stop(); } catch (e) { console.error(`[${tag}] ${step.name}:`, e); }
  }
}
```

**Analog C — module-scope discipline:** `src/main/delivery.ts:1-27` is the header to copy, because it
states the constraint the whole extraction exists to satisfy:

```ts
/**
 * Deliberately free of any `electron` import so `node --test` can drive the whole
 * loop with fakes (test/delivery-main.test.cjs). All Electron/hive/PTY specifics
 * arrive through {@link DeliveryDeps}, wired in index.ts.
 */
```

**Anti-pattern with a live source citation — what boot.ts must NOT copy from `index.ts`:**
`index.ts:175-215` is exactly the set of module-scope side effects that block `loadTs` today.
Reproduced verbatim so the executor recognises them on sight:
```ts
initFileLogging();                                   // :175 — opens a real write stream
try { crashReporter.start({ uploadToServer: false }); } catch (e) { … }   // :179
app.on('render-process-gone', (_e, contents, details) => { … });          // :188 ← THE THROW
app.on('child-process-gone', (_e, details) => { … });                     // :199
process.on('uncaughtException', (err) => { … });                          // :210 ← makes a crashed boot test green
process.on('unhandledRejection', (reason) => { … });                      // :213
```
All six stay in `index.ts`. None may appear under `src/main/floor/**`.

---

### `src/main/floor/*.ts` (seam modules)

**Analog:** the `// ─── … ───` banner sections of `index.ts` itself (D-04) — 53 top-level banners.
Do not invent a taxonomy. Section style, verbatim from `index.ts:4333`:
```ts
// ─── IPC: quit confirmation ─────────────────────────────────────────────────
```
Module naming follows `CONVENTIONS.md`: `src/main/*.ts` is one module per subsystem, camelCase,
named after the primary export's domain. Named exports only, **no barrel `index.ts`** (`CONVENTIONS.md`
"Barrel Files: Not used").

---

### `src/main/tunnel.ts` (utility / child-process lifecycle) — NEW

**What it replaces (delete both, they are byte-identical — verified by `diff` this session):**

`src/main/slack.ts:211-221` and `src/main/webhook.ts:276-286`:
```ts
  private async openTunnel(): Promise<string> {
    // TODO: optional persistent domain — pass `domain` here when config carries one.
    // Dynamic import keeps the ESM-only `tunnelmole` out of the CJS require graph.
    const { tunnelmole } = await import('tunnelmole');
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out')), TUNNEL_START_TIMEOUT_MS);
      tunnelmole({ port: this.port })
        .then((url) => { clearTimeout(timer); resolve(url); })
        .catch((e) => { clearTimeout(timer); reject(e); });
    });
  }
```
and the two `stop()` bodies (`slack.ts:180-190` / `webhook.ts:245-255`), which differ only in
`[slack]` vs `[webhook]`. Both `stop()` bodies carry a comment claiming the tunnel cannot be closed;
that comment becomes false and must be deleted, not reworded (D-15 / §4.5).

**Analog for the new implementation — spawn a child, read its port/URL off stdout, track it for
teardown:** `src/main/hive.ts:1281-1345` `startProxyBridge`. Copy this shape wholesale:
```ts
    return new Promise<number>((resolve) => {
      let settled = false;
      const settle = (port: number): void => { if (!settled) { settled = true; resolve(port); } };
      let child: ChildProcess;
      try {
        child = spawn(process.execPath, [script], {
          env: { …process.env, ELECTRON_RUN_AS_NODE: '1', … },
          // Read the port line from stdout; never inherit stdio (the sidecar must
          // never write into the agent's terminal or leak request bodies to a log).
          stdio: ['ignore', 'pipe', 'ignore']
        });
      } catch (e) { console.error(…); return settle(0); }
      this.proxyChildren.set(agentId, child);
      let buf = '';
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (d: string) => {
        if (settled) return;
        buf += d;
        const nl = buf.indexOf('\n');
        if (nl === -1) return;
        try { const msg = JSON.parse(buf.slice(0, nl)); … } catch { settle(0); }
      });
      child.on('error', () => settle(0));
      child.on('exit', () => { …; settle(0); }); // never hang the spawn if the sidecar dies
      // Hard ceiling: if the sidecar never reports a port, degrade rather than hang.
      setTimeout(() => settle(0), 4000).unref?.();
    });
```
Note the four properties worth copying verbatim: the `settle` idempotence latch, `stdio: ['ignore',
'pipe', 'ignore']`, `on('error')`/`on('exit')` both settling, and the unref'd hard ceiling.
For cloudflared the line to parse off stdout/stderr is the `trycloudflare.com` URL rather than a
JSON `{"port":N}` — same buffer-until-newline shape, different matcher.

**The close is a call, not new code** — `src/main/procKill.ts:34-44`:
```ts
/** Forcefully kill pid and its descendants NOW. Group-SIGKILL on POSIX (falls
 *  back to the single pid when the group id is gone); `taskkill /T /F` on
 *  Windows. Killing the group of an already-dead leader is exactly the
 *  orphan-reaping case: any surviving members still hold the group id. */
export function hardKillTree(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    try { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { timeout: 10_000 }); } catch { /* gone */ }
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch {
    try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
  }
}
```

**Electron-free header to copy:** `src/main/delivery.ts:24-27` (quoted above). `slack.ts:18-19` and
`webhook.ts:38-40` both carry the same sentence — `tunnel.ts` must too, and `bin` (the cloudflared
path) must be **injected**, never resolved with `app.isPackaged` inside this file.

---

### `src/main/cloudflared.ts` (utility / download + verify) — NEW

**Analog:** `src/main/nodeInstall.ts` — this repo already downloads a platform binary and refuses to
run it unverified. The header states the rule (`nodeInstall.ts:13-17`):
```ts
 * Because we run an installer as root, the download is CHECKSUM-VERIFIED against
 * nodejs.org's own SHASUMS256.txt before anything executes. A mismatch aborts.
 *
 * Nothing here imports electron: the URL/artifact/script logic is all pure, so it
 * is testable without booting an app.
```

**Refuse-without-a-digest pattern** (`nodeInstall.ts:132-167`):
```ts
/** Resolve the exact installer to run on THIS machine, checksum included.
 *  Returns null on any failure (offline, unsupported platform, artifact not in
 *  SHASUMS256) — callers then fall back down the ladder rather than guessing. */
export async function resolveNodeInstaller(
  platform: string = process.platform,
  arch: string = process.arch,
  fetchImpl: Fetcher = timedFetch
): Promise<NodeInstaller | null> {
  try {
    …
    const sha256 = shaFor(await shaRes.text(), artifact.file);
    // No digest → we would be running an unverified installer as root. Refuse.
    if (!sha256) return null;
    return { version: lts.version, file: artifact.file, url: distUrl(…), sha256, kind: artifact.kind };
  } catch { return null; }
}
```
Also copy `nodeArtifactFor(version, platform, arch)` returning `null` for an unsupported
platform/arch — that is exactly how "no `cloudflared-windows-arm64` asset" must fail (a stated
reason, not a silent skip), and it is why `platform`/`arch`/`fetchImpl` are **defaulted parameters**:
`test/node-install.test.cjs` drives every platform branch with a fake fetcher and no network.

**⚠️ One divergence from the analog, mandated by RESEARCH §Package Legitimacy Audit:** Cloudflare
publishes **no** `SHASUMS256.txt`. `shaFor(shasums, file)` has no counterpart — the SHA-256 must come
from a constant **committed into this repo** next to a pinned release tag, never from `latest` and
never from the vendor response. Same failure this repo already shipped and fixed as **#57**.

---

### `src/main/webhook.ts` — phone static handler + auth endpoints + per-endpoint verifier (modify)

**One owner for this file.** DAEMON-02's static route, DAEMON-02's auth endpoints and DAEMON-03's
Telegram/Discord verifier all rewrite `handleRequest`/`verifySecret`. Never in parallel plans.

**Where the branch goes — before `readEndpointId`** (`webhook.ts:296-313`):
```ts
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Rate limit first — cheapest possible rejection, ahead of any work.
    if (!this.allowRequest('', RATE_LIMIT)) { json(res, 429, { ok: false, error: 'rate limited' }); return; }
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
```
The `/phone/**` branch inserts **after the global rate-limit line and before `readEndpointId`**
(RESEARCH §4.3 item 1 / Pitfall 5). A `case '/phone'` inside `handleStatus` is the wrong diff.

**Why it 401s today** (`webhook.ts:422-430`):
```ts
function readEndpointId(req: IncomingMessage): string | null {
  let pathname: string;
  try { pathname = new URL(req.url ?? '/', 'http://localhost').pathname; }
  catch { return null; }
  const segments = pathname.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return LEGACY_ENDPOINT_ID;
  if (segments.length > 1) return null;
  try { return decodeURIComponent(segments[0]); } catch { return segments[0]; }
}
```

**Reserve `phone` here** (`webhook.ts:173-186`, `setEndpoints`) — the same wholesale-rebuild loop
already skips malformed entries, so the reservation is one more `continue`:
```ts
  setEndpoints(list: WebhookEndpoint[]): void {
    const next = new Map<string, WebhookEndpoint>();
    for (const e of list) {
      if (!e || typeof e.id !== 'string' || !e.id || typeof e.secret !== 'string' || !e.secret) continue;
      next.set(e.id, e);
    }
    this.endpoints = next;
```

**The rate-limit bucket pattern the phone needs its own copy of** (`webhook.ts:288-297`):
```ts
  /** Fixed-window limiter — bounds total work before any parse/crypto runs. */
  private allowRequest(bucket: string, limit: number): boolean {
    const now = Date.now();
    const w = this.windows.get(bucket);
    if (!w || now - w.start > RATE_WINDOW_MS) {
      this.windows.set(bucket, { start: now, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= limit;
  }
```
Plus the bucket-choice rationale already in the file (`webhook.ts:139-142`, `UNKNOWN_BUCKET`) —
"one bucket, not one per id … Sharing one bucket makes the two indistinguishable."

**The verifier being generalised** (`webhook.ts:409-414`) — this single call site becomes D-24's
per-endpoint strategy dispatch:
```ts
  private verifySecret(req: IncomingMessage, endpoint: WebhookEndpoint | null): boolean {
    const provided = req.headers['x-md-webhook-secret'];
    if (typeof provided !== 'string') return false;
    const equal = timingSafeEqual(sha256(provided), sha256(endpoint ? endpoint.secret : this.decoySecret));
    return endpoint ? equal : false;
  }
```
and its fixed-width helper (`webhook.ts:463-465`):
```ts
/** Fixed-width digest of a candidate secret, so a constant-time compare never
 *  has to branch on (and therefore leak) its length. */
function sha256(s: string): Buffer { return createHash('sha256').update(s, 'utf8').digest(); }
```

**The authenticate-before-buffering order Discord must deliberately invert** (`webhook.ts:336-346`):
```ts
  /** POST — verify this endpoint's secret, then buffer + validate + dispatch. */
  private handleCreate(req: IncomingMessage, res: ServerResponse, endpoint: WebhookEndpoint | null): void {
    // Authenticate BEFORE reading the body so an unauthenticated peer can't even
    // make us buffer (within the size cap). 401 on any failure — no detail leaked,
    // and an unknown id lands here too so it is answered identically.
    if (!this.verifySecret(req, endpoint) || !endpoint) { json(res, 401, { ok: false, error: 'unauthorized' }); return; }
    const chunks: Buffer[] = [];
    let size = 0; let aborted = false;
    req.on('data', (c: Buffer) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) { aborted = true; json(res, 413, { ok: false, error: 'too large' }); req.destroy(); return; }
      chunks.push(c);
    });
```

**The *other* verification strategy already in this repo** — Discord's "buffer the raw body, then
verify a signature over it" is not new here. `src/main/slack.ts:225+` `handleRequest` does exactly
that shape for Slack's signing-secret HMAC over the RAW body plus a replay-timestamp window
(`REPLAY_WINDOW_SECONDS = 60 * 5`, `slack.ts:108`). Copy slack.ts's buffer-then-verify ordering and
its replay guard; do not invent one.

**Token-in-header-not-URL pattern for the phone bearer** (`webhook.ts:441-452`):
```ts
/** Pull the capability token from the `x-md-webhook-token` header, falling back
 *  to a `?token=` query param. Header is preferred (kept out of URL/access logs). */
function readToken(req: IncomingMessage): string { … }
```

**⚠️ `staticRoot` must be injected.** `webhook.ts` has **no** `electron` import today (verified) and
that property is exactly what D-23 is reusing. Add `staticRoot?: () => string | null` to
`WebhookServerOptions` and resolve it in `index.ts`/`floor` using the repo's existing
packaged/dev resolver (`index.ts:1803-1809`):
```ts
/** Absolute path to the bundled `md-slack-reply.cjs` helper. Packaged: under
 *  `process.resourcesPath` (electron-builder extraResources). Dev: the repo's
 *  `resources/` dir, resolved from the app path. */
function slackReplyScriptPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'md-slack-reply.cjs')
    : join(app.getAppPath(), 'resources', 'md-slack-reply.cjs');
}
```
(`src/main/knowledge.ts:75-86` has the identical pair for `kg.cjs`/`kg-core.cjs`.)

**Path containment for the static read** — `src/main/fs.ts` `safeJoin` is the house pattern and
returns `null` on a traversal violation rather than throwing (`CONVENTIONS.md` "Return Values").
`test/main-hardening.test.cjs:18` already loads it: `const { safeJoin, isWithinRoots, … } = loadTs('src/main/fs.ts')`.

---

### `src/main/hive.ts` — per-agent MCP (`--mcp-config`) (modify)

**The exact site** (`hive.ts:1104-1112`):
```ts
    const sock = this.sockPath();
    const shim = this.shimPath();
    if (sock && shim) {
      env.HIVE_SOCK = sock;
      const settingsPath = join(dir, 'settings.json');
      this.writeJson(settingsPath, this.hookSettings(shim, meta.cwd, opts.mcpDefaults, opts.theme));
      args.push('--settings', settingsPath);
    }
```

**The fail-closed tier branch to reuse — D-27 changes only where `cfg` comes from**
(`hive.ts:1223-1250`):
```ts
  private buildDefaultMcpServers(
    cwd: string,
    cfg: McpDefaultsMap
  ): Record<string, { command: string; args: string[]; env?: Record<string, string> }> {
    const out: … = {};
    for (const e of MCP_CATALOG) {
      const consented = cfg?.[e.id]?.enabled;
      const enabled = consented ?? e.defaultEnabled;
      if (!enabled) continue;
      // Defense-in-depth: a write/secret server requires an EXPLICIT opt-in; it can
      // never ride in on a default (the catalog already ships these OFF, but this
      // guards a hand-edited/partial mcpDefaults map too).
      if (e.tier !== 'safe-readonly' && consented !== true) continue;
      // Replace the `<cwd>` placeholder (filesystem/git) with the agent cwd at merge
      // time so these stay strictly workspace-scoped.
      const args = e.spec.args.map((a) => (a === '<cwd>' ? cwd : a));
      out[`hellomarkx-${e.id}`] = { command: e.spec.command, args, ...(e.spec.env ? { env: e.spec.env } : {}) };
    }
    return out;
  }
```

**The false comment that must be corrected in the same commit** (`hive.ts:1188-1192`):
```ts
      // W3 — default skills/MCP bundle. Written into the PER-SESSION settings file
      // only (never ~/.claude), so the user's own MCP servers are never clobbered;
      // Claude merges this additively.        ← FALSE, live-verified 2026-08-21
      ...(Object.keys(mcpServers).length ? { mcpServers } : {}),
```

**Per-agent-file precedent** (`hive.ts:998`): `env.CODEX_HOME = this.installCodexHooks(dir);` —
`<agentDir>/mcp.json` joins `settings.json`, `.codex/config.toml`, `.pi-agent/`, `.opencode/`.

**Type location:** `hive.ts:46` `type McpDefaultsMap = { [id: string]: { enabled: boolean } } | undefined;`.
Catalog + tiers: `src/shared/mcpCatalog.ts` (`McpTier = 'safe-readonly' | 'write' | 'secret'`,
`McpCatalogEntry`, `MCP_CATALOG`) — dependency-free and importable by both processes, so the consent
UI reads tiers from there, not from main.

---

### `src/main/hive.ts` — the kimi hook bridge (PARITY-01a) (modify)

**Analog: `installCodexHooks`** (`hive.ts:2346-2411`) — the **codex** case, not grok. The seed-and-
append string TOML, with no parser (`hive.ts:2398-2408`):
```ts
      const shim = this.shimPath();
      let config = existsSync(join(userHome, 'config.toml'))
        ? readFileSync(join(userHome, 'config.toml'), 'utf8') : '';
      if (shim) {
        const events = ['PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop',
          'SessionStart', 'UserPromptSubmit', 'PreCompact', 'PostCompact'];
        config += '\n# --- hellomarkx-hive lifecycle hooks (auto-generated; do not edit) ---\n';
        for (const ev of events) {
          config += `\n[[hooks.${ev}]]\n[[hooks.${ev}.hooks]]\ntype = "command"\ncommand = '${this.nodeRunUnquoted(shim)}'\ntimeout = 30\n`;
        }
      }
      writeFileSync(join(home, 'config.toml'), config, 'utf8');
    } catch (e) { console.error('[hive] installCodexHooks failed:', e); }
    return home;
```
Copy: reading the operator's own file as a **string** first (this is what preserves `kimi login`'s
OAuth credentials — RESEARCH §6.3 item 4), the auto-generated banner, the single-quoted TOML literal
path, the `timeout = 30` seconds value, the try/catch-and-log, and returning the per-agent dir/path.
Copy also the ~25-line comment above it explaining *why* `timeout` is seconds — that comment style is
the codebase's defining convention (`CONVENTIONS.md` § Comments), and the kimi bridge inherits the
same class of hazard.

**Where the dispatch happens** (`hive.ts:996-1030`) — `preArgs` already exists for exactly this:
```ts
      const preArgs: string[] = [];
      const desc = bridgeOf(meta.provider);
      const sock = this.sockPath();
      if (desc && sock) {
        env.HIVE_SOCK = sock;
        try {
          if (desc.kind === 'hooks') {
            if (desc.shim === 'agy') this.installAgyHooks();
            else if (desc.shim === 'codex') {
              env.CODEX_HOME = this.installCodexHooks(dir);
              preArgs.push('--dangerously-bypass-hook-trust');
            }
            …
```
kimi's branch is `preArgs.push('--config-file', this.installKimiConfig(dir))`.

**Do NOT use `GROK_HOOK_SHIM` as the analog.** It is a 68-line camelCase→snake_case translator
(`agentProvider.ts:98-99` documents why grok needs one). Kimi is Claude-shaped snake_case, so
`HOOK_SHIM` is reused verbatim — the same sentence `agentProvider.ts:95-97` already writes for codex.

**Preset edit** (`src/shared/agentProvider.ts:281-298`) — the current kimi entry, whose comment
becomes false the moment the bridge lands:
```ts
  {
    id: 'kimi',
    costTracking: 'none',
    …
    // Kimi's interactive TUI has no positional initial-prompt form. It supports
    // lifecycle hooks, but Hello MarkX does not yet install a Kimi hook bridge,
    // so mail must bounce rather than being delivered with no drain path.
    canReceiveInbox: false
  },
```
The union to widen is one line (`agentProvider.ts:103`): `hookBridge?: 'agy' | 'codex' | 'grok';`.
Model the new preset comment on `grok`'s (`agentProvider.ts:275-280`), and carry a
`LIVE-UNVERIFIED` marker in the same register as the eight already in `hive.ts` — the bridge ships
marked (D-33/D-35).

---

### `src/main/hive.ts` + `src/main/index.ts` — the two headless mail gaps (DAEMON-01) (modify)

**The exact defect** (`hive.ts:1668-1680`, `emitTerminalHandoff`):
```ts
  /** Non-Claude providers cannot drain hive inbox; hand direct mail to the
   *  renderer so it can queue a terminal work order for the target PTY. */
  private emitTerminalHandoff(msg: HiveMessage, targetId: string): boolean {
    const delivered = this.emit?.('hive:terminalHandoff', { … }) === true;
    this.appendLog({ kind: 'terminal-handoff', …, delivered });
    return delivered;
  }
```
and its two bounce sites (`hive.ts:1596-1620`), both of which read:
```ts
        if (!this.emitTerminalHandoff(msg, t)) {
          this.deliver({ ...msg, to: godId,
            subject: `[undeliverable — "${t}" runs … and the terminal handoff failed (renderer unavailable); relay this to it] ${msg.subject}` }, godId);
        }
        continue;
```

**The analog is the same move, already executed once in this repo** — `index.ts:411-434`, the
account-pool emitter that intercepts a renderer-bound channel and runs it in main instead:
```ts
  emit: (channel, payload) => {
    // #5 — MAIN owns the kill→respawn now. The plan used to be shipped to the
    // renderer, which executed it from a React effect: reload the window between
    // kill and respawn and the agent stayed dead, pinned at "switching…" forever
    // (upstream #151). We run it here and tell the renderer what happened on
    // `hive:failover` instead, so `claudeAccount:failover` is deliberately NOT
    // forwarded — two executors would respawn the same agent twice.
    if (channel === 'claudeAccount:failover') {
      const plan = payload as { reason?: string; switches?: AccountSwitch[] };
      delivery.failover(plan.switches ?? [], plan.reason ?? 'account failover');
      return;
    }
    try { liveWebContents()?.send(channel, payload); } catch { /* window tore down */ }
  },
```
Copy the shape **and the comment discipline**: name the failure the renderer path caused, and say
explicitly why the renderer is no longer forwarded (two executors).

**The gate everything routes through** — `delivery.enqueue()`. `DeliveryService` already owns the
idle gate, boot grace, veto, write chain and Enter-retry (`delivery.ts:1-27` header, `:165-175`
`TICK_MS`/`IDLE_MS`). ADR-0001 is unchanged by this; only its named location moves (D-12).

**The emitter whose `boolean` return is load-bearing** (`index.ts:365-372`):
```ts
const hive = new HiveManager(
  () => readConfig().harnessHome,
  (channel, payload) => {
    const wc = liveWebContents();
    if (!wc) return false;
    try { wc.send(channel, payload); return true; } catch { return false; }
  }
);
```
and `liveWebContents()` itself (`index.ts:1741-1751`), the 28-call-site function every prelude
`send` must become `deps.send(channel, payload)`:
```ts
/** The live renderer webContents, or null if the window is gone/destroyed.
 *  Anything that emits to the renderer from a timer/socket/child callback must
 *  route through here — during quit the window can be destroyed while those
 *  callbacks are still in flight, and `.send()` on a destroyed webContents
 *  throws "Object has been destroyed" (the main-process crash dialog). */
function liveWebContents(): Electron.WebContents | null { … }
```

---

### `src/main/index.ts` — the headless edits (DAEMON-01) (modify)

**The deadlock, verbatim** (`index.ts:5783-5790`):
```ts
app.on('before-quit', (e) => {
  if (allowQuit) return;
  const count = ptyManager.list().length;
  if (count === 0) return;
  e.preventDefault();
  if (mainWindow) {
    mainWindow.focus();
    mainWindow.webContents.send('app:closeRequested', { ptyCount: count });
  }
});
```
The non-interactive path already exists in the same file (`index.ts:4370-4374`) — call it, do not
write a second teardown:
```ts
/** Tear the harness down and quit. Shared by the hard "kill all & quit" path
 *  and the closing-time conclusion (after the god confirmed the floor saved). */
function teardownAndQuit(): void {
  allowQuit = true;
  runShutdown('quit');
  app.quit();
}
```

**The gate that must not fire headless** (`index.ts:5792-5797`):
```ts
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    ptyManager.killAll();
    app.quit();
  }
});
```

**Where the `--headless` argv read goes** — beside the existing cold-start argv scan
(`index.ts:5701-5703`):
```ts
  // A cold-start deep link (Windows/Linux) rides in on OUR argv.
  const startupHireLink = process.argv.find((a) => a.startsWith('hellomarkx://'));
  if (startupHireLink) void handleHireLink(startupHireLink);
```

**Re-attach** (`index.ts:2610-2622`) — `else createWindow()` in this handler is the whole story:
```ts
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) { allowQuit = true; app.quit(); }
else {
  app.on('second-instance', (_evt, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const link = argv.find((a) => a.startsWith('hellomarkx://'));
    if (link) void handleHireLink(link);
  });
}
```

**Login item** (`index.ts:4655-4659`) — note the return value is what will lie on Linux:
```ts
/** Toggle macOS "Open at Login" — fully programmatic, no permission prompt.
 *  Returns the resulting state so the renderer toggle reflects reality. */
ipcMain.handle('app:setLoginItem', (_evt, enabled: unknown) => {
  app.setLoginItemSettings({ openAtLogin: enabled === true });
  return app.getLoginItemSettings().openAtLogin;
});
```

---

### `src/main/config.ts` — the MCP consent migration (DAEMON-04) (modify)

**Analog:** `config.ts:747-785` `migrateTriggersV1` — a one-shot, latched, try/catch-wrapped,
never-fatal migration. Copy every one of those four properties:
```ts
function migrateTriggersV1(cfg: HarnessConfig): HarnessConfig {
  if (cfg.triggersMigratedV1 || triggersMigrationRan) return cfg;
  triggersMigrationRan = true;
  try {
    const next: HarnessConfig = { ...cfg, triggersMigratedV1: true };
    …
    persistConfig(next);
    return next;
  } catch {
    // Leave the config exactly as read. The latch above stays set, so a failing
    // migration retries on the next launch rather than on every single read.
    return cfg;
  }
}
```
Its header (`config.ts:740-746`) also carries the rule D-27's migration needs verbatim: *"A
user-chosen interval is a decision, not a stale default, and is left alone."* — the inverse applies
here: a floor-wide `enabled:true` on a `write`/`secret` entry **is** dropped, deliberately, and the
plan must say so (fail closed).

Migration chain to hook into: `config.ts:823` `return migrateTriggersV1(migrateSecrets(merged, parsed));`.
Config path (no override exists — RESEARCH §1.3 item 7): `config.ts:500-502`
`function configPath(): string { return join(app.getPath('userData'), 'config.json'); }`.

---

### `src/main/hive.ts` (task.cjs template) — `askedBy` (GSD-06) (modify)

**Analog is one line away in the same generated file** — `hive.ts:3435`, the `claim` branch:
```js
    patch.assignee = f.assignee || process.env.AGENT_ID || die('claim needs --assignee (or AGENT_ID in the environment)');
```

**The site to change** (`hive.ts:3454-3460`):
```js
    // --q appends a human question and blocks the card, matching the humanQA
    // contract in PROTOCOL.md (never replace the history — it IS the decision trail).
    if (patch.__q) {
      delete merged.__q;
      merged.humanQA = (Array.isArray(tasks[i].humanQA) ? tasks[i].humanQA : []).concat([{ q: patch.__q, askedAt: new Date().toISOString() }]);
      merged.status = 'blocked';
    }
```
`AGENT_ID` is already in every PTY env (`hive.ts:937` `AGENT_ID: meta.id,`) and the sidecar env
(`hive.ts:1305`). Type: `hive.ts:114` `humanQA?: HumanQA[];`.

**⚠️ Prompt-cache collision (RESEARCH §4.6):** `hive.ts:1466` — the god's injected roster prompt —
contains the literal sentence *"the human's answer lands in the same entry ("a") AND arrives as an
inbox message to you"*. GSD-06 makes that false. `hive.ts:1390-1491` is the agent-facing-text seam
governed by `docs/adr/0002-prompt-cache-invariant.md`; **one owner for that block**, shared with any
PARITY plan touching roster text.

---

### `src/renderer/src/components/AskMeTab.tsx` — address the asker (GSD-06) (modify)

**Analog: the function being changed.** `AskMeTab.tsx:68-103` `sendAnswer` — the numbered two-step
comment style is what D-39's "the god is still told" clause must extend:
```ts
      // 1) Document the answer ON the card.
      const next = tasks.map((t) => { … });
      const result = updated
        ? await window.cth.hivePatchTask(task.id, { humanQA: updated.humanQA })
        : { ok: false };
      if (!result.ok) throw new Error('task changed before answer could be saved');
      setTasks(next);
      // 2) Tell the god, so the card gets unblocked and work continues.
      await window.cth.hiveSend({
        to: 'god',                     // ← AskMeTab.tsx:92, the hardcode (D-36)
        act: 'inform',
        subject: `HUMAN ANSWER on task "${task.title}"`,
        body: [ … ].join('\n')
      }, 'human');
```
The fallback chain is already available in this file: `nameFor()` at `:63-64` resolves an id against
`agents`/`restorable`, so `open.askedBy ?? task.assignee ?? 'god'` has a display name for free.
`dismiss()` at `:113+` is the sibling to keep consistent.

---

### `capabilityLine` consumers (PARITY-01b) — `AgentCard.tsx`, `AddAgentModal.tsx`, `CommandCenterPanel.tsx`

**The function with zero production consumers** (`src/shared/providerAutomation.ts:332-348`):
```ts
export function capabilityLine(provider: AgentProvider): string {
  const c = providerCapabilities(provider);
  const bits = [
    c.mail ? 'mail ok' : 'NO MAIL (bounces to you)',
    c.spend === 'none' ? 'spend UNTRACKED (invisible to every budget)' : `spend tracked (${c.spend})`,
    c.compact ? `compacts ${c.compact}` : 'NO COMPACT (context cannot be reclaimed)',
    c.remote ? 'remote control ok'
      : remoteControlAvailability(c.provider) === 'windows'
        ? 'REMOTE CONTROL unavailable on Windows' : 'NO REMOTE CONTROL'
  ];
  return `${c.provider}: ${bits.join(', ')}`;
}
```
Its doc-comment (`:305-331`) already states the ADR-0002 constraint on *how* it may be called: the
platform is read once through a defaulted parameter, and the signature is asserted on by
`test/engine-parity.test.cjs`. **Do not add a platform parameter** — the comment explains why D-40
chose a `remote` bit instead.

**Analog for `AgentCard.tsx` — its own derived-per-agent-state pattern.** The card is presentational
and resolves its own store row; copy this exactly rather than threading a new prop
(`AgentCard.tsx:153-163`):
```ts
  // FLOOR-01 - does this agent act without asking for tool approval?
  //
  // The card is presentational: it is handed display props, never an agent id,
  // and provider/command/model live on the store row. So it resolves its own row
  // the same way useHasTerminalDraft above already keys off ptyId, and calls the
  // ONE shared derivation the fullscreen roster row and the command-centre row
  // also call. Three copies of a safety rule are three chances to start lying.
  const row = useStore((s) => agentRowForCard(s.agents, ptyId, name));
  const liveAutoMode = useSyncExternalStore(subscribeLiveAutoMode, getLiveAutoMode, getLiveAutoMode);
  const autoMode = isAutoModeAgent(row?.provider, row?.command, liveAutoMode);
```
and the render half (`AgentCard.tsx:278-292`) — the "declared capability chip" pattern, including
the accessibility decision:
```tsx
                {autoMode && (
                  <span
                    aria-hidden="true"
                    title={`Auto mode: ${name} acts without asking for tool approval.`}
                    style={{
                      fontFamily: 'var(--cth-font-display)',
                      fontSize: 'var(--cth-text-display-md)',
                      lineHeight: 'var(--cth-lh-display-md)',
                      background: 'var(--cth-lilac-light)',
                      boxShadow: 'inset 0 0 0 1px var(--cth-lilac)',
                      color: 'var(--cth-ink-900)',
                      padding: '1px 4px 0', flexShrink: 0
                    }}
                  >AUTO</span>
                )}
```
Note `aria-hidden="true"` with the state carried in the card's own `aria-label` (`AgentCard.tsx:187`)
— a `NO MAIL` chip must follow the same rule, not announce twice. All sizes via `var(--cth-text-*)`
tokens, never literals (accessibility is in scope per the standing constraints).

**Analog for `AddAgentModal.tsx` — the safe/needs-consent split** (`AddAgentModal.tsx:516-540`).
D-29 says copy this **pattern**; RESEARCH §4.7 warns it is a `hireMeta.mcpServers` preview block, not
a reusable component:
```tsx
                {hireMeta.mcpServers && hireMeta.mcpServers.length > 0 && (() => {
                  const safe = hireMeta.mcpServers!.filter(
                    (id) => MCP_CATALOG.find((e) => e.id === id)?.tier === 'safe-readonly'
                  );
                  const consent = hireMeta.mcpServers!.filter(
                    (id) => MCP_CATALOG.find((e) => e.id === id)?.tier !== 'safe-readonly'
                  );
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                      {safe.length > 0 && (
                        <span …>
                          <span …>MCP servers (safe, pre-enabled):</span>
                          {safe.map((id) => (<code key={id} style={{ …sky… }}>{id}</code>))}
                        </span>
                      )}
                      {consent.length > 0 && (
                        <span …>
                          <span …>⚠️ MCP (needs your consent — NOT auto-enabled):</span>
```

**Analog for the dispatch box** (`CommandCenterPanel.tsx:601-617`) — the suggestion-not-assignment
shape D-31 identified, and the only surface where an operator names a target agent:
```ts
  const dispatch = async () => {
    const body = dispatchText.trim();
    if (!body) return;
    const suggested = dispatchTo ? agents.find((a) => a.id === dispatchTo) : undefined;
    const full = suggested
      ? `${body}\n\n(The human suggests ${suggested.name} (${suggested.id}) for this — your call as orchestrator.)`
      : body;
    const res = await window.cth.hiveSend(
      { to: 'god', act: 'request', subject: 'Task from the human', body: full }, 'human');
```
The engine picker in the same file (`CommandCenterPanel.tsx:959`) already filters on
`canReceiveInbox` — `AGENT_PROVIDER_PRESETS.filter((p) => canReceiveInbox(p.id))` — which is the
precedent for consuming a shared capability predicate in the renderer. `capabilityLine` follows the
same import route.

---

### `test/boot-floor.test.cjs` (test — the phase gate) — NEW

**Analog A — the fakes harness** (`test/delivery-main.test.cjs:1-70`). Header, then a `harness()`
that builds the dep object from plain closures and collects what was sent:
```js
// The autonomy loop that used to live in the renderer (issue #5). These tests
// drive DeliveryService with fakes — no Electron, no PTY, no window — which is
// the whole point: if the loop needs a renderer to work, it fails here.
…
const { DeliveryService, … } = loadTs('src/main/delivery.ts');
function harness(overrides = {}) {
  const state = { … };
  const emitted = [];
  const svc = new DeliveryService({
    liveAgents: () => state.agents,
    write: (ptyId, data) => { …; writes.push({ ptyId, data }); return { ok: true }; },
    queuePath: () => null,
    …
  });
```

**Analog B — the `electron` `require.cache` seed, done BEFORE `loadTs`** (`test/config-secrets.test.cjs:29-43`).
This is RESEARCH §2.3's recommended route (a), and it is a shipped pattern that already runs on all
three CI platforms:
```js
let userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-cfg-'));
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: {
    app: { getPath: () => userData },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(`enc:${s}`, 'utf8'),
      decryptString: (b) => b.toString('utf8').replace(/^enc:/, '')
    }
  }
};
```
Why it wins over the stub is documented in `test/load-ts.cjs:22-26` (`requireElectron`): *"A test that
injects the API into require.cache before calling loadTs must still win … Anything a test needs to
assert on should be injected, not reached through the stub."*

**Analog C — the real hive on a tmpdir** (`test/hive-durability.test.cjs:9-25`):
```js
const { HiveManager } = loadTs('src/main/hive.ts');
/** A throwaway harness home with a live hive in it. */
function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hive-durable-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  return { hive, home, root: path.join(home, 'hive') };
}
```

**Analog D — proving a socket is listening by CONNECTING, on both platform families**
(`test/net-binding.test.cjs:112-150`). Assertion 7 of RESEARCH §2.4 is this, verbatim:
```js
function sockFor(root) {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\md-net-binding-${randomBytes(6).toString('hex')}`
    : path.join(root, 'hooks.sock');
}
…
  server.start();
  t.after(() => server.stop());
  await new Promise((resolve, reject) => {
    server.server.once('listening', resolve);
    server.server.once('error', reject);
  });
  const send = (payload) => new Promise((resolve, reject) => {
    const c = net.createConnection(sock, () => c.end(JSON.stringify(payload) + '\n'));
    …
  });
```
Note `t.after(() => server.stop())` — for `boot-floor` that becomes `t.after(() => floor.shutdown())`,
which RESEARCH §3.3 says **is the shutdown test**, not cleanup.

**Analog E — the announced skip** (`test/net-binding.test.cjs:286`):
```js
    console.error('[net-binding] socket-delete case skipped — a win32 named pipe has no file to rm');
```
Three such lines exist (`:286`, `:315`, `:323`). A silent skip is a test that does not exist.

**Analog F — realpath the tmpdir** (`test/main-hardening.test.cjs:22-26`):
```js
/** A temp dir that cleans itself up, realpath'd so macOS's /var → /private/var
 *  symlink doesn't make every assertion here a symlink test by accident. */
function tempDir(t, prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* noop */ } });
```

---

### `test/agent-lifecycle.test.cjs` (test) — NEW

**Analog:** `test/main-hardening.test.cjs` — and its header is the false claim this phase corrects
(`main-hardening.test.cjs:3-8`):
```js
// Guards for the main-process hardening pass (#1, #8, #9).
//
// src/main/index.ts itself cannot be loaded here — it imports 'electron' — so
// each assertion targets the pure function the handler now delegates to. That
// is deliberate: index.ts was untestable precisely because every guard used to
// be inline in a handler.
```
The reason is wrong (D-02: the blocker is module-scope side effects, not the import) and the
correction belongs in the same wave. The file's own `worktreeHasUnintegratedWork` test is the
isolated half; the new file is the composed version — `teardownPty(id)` against a fake `ptyManager`
and a real tmpdir git repo, no PTY spawn.

---

### `test/hive-router.test.cjs` (test) — NEW

**Analog:** `test/hive-durability.test.cjs:9-32` — `floor(t)` above, plus its inbox readers:
```js
const agent = (id, extra = {}) => ({ id, name: id, cwd: os.tmpdir(), capabilities: [], ...extra });
const inbox = (root, id) => path.join(root, 'agents', id, 'inbox');
const messagesIn = (dir) =>
  (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
```
`routeOnce()` is a public method (`hive.ts:1711`) and RESEARCH §3.1 proved it returns 1 against an
unmodified tree — so the honest wording is *"a router test that did not exist"*, **not** "could not
be written before the split". Same for the git committer: four tests already exist at
`hive-durability.test.cjs:243/263/291/305`, each `await hive.flushCommit(root); // the real debounced
commit body, driven synchronously`.

---

### `test/tunnel.test.cjs` (test) — NEW

**Analog A — driving a real process tree, with a self-honest win32 branch**
(`test/proc-kill.test.cjs:28-38`):
```js
if (process.platform === 'win32') {
  // ASSERT the smoke import this branch claims to be. Without these two lines
  // the branch exits 0 before a single assertion runs, so on Windows this file
  // was green forever — green even if procKill.ts stopped exporting anything at
  // all. That is not a passing test, it is an unrunnable one. Pinned durably by
  // the poisoned-assert probe in test/repo-claims.test.cjs.
  assert.strictEqual(typeof ensureKilled, 'function');
  assert.strictEqual(typeof hardKillTree, 'function');
  console.log('  ok  (win32: smoke import only — POSIX group semantics not applicable)');
  process.exit(0);
}
```

**Analog B — the injected fake** is `DeliveryDeps`' shape (above). There is **no existing test in this
repo that injects a fake `spawn`** — `startProxyBridge` calls `spawn` directly from module scope
(`hive.ts:1302`). So `tunnel.ts` must take its spawner as an option to be testable at all; that is a
design constraint the analogs imply but do not demonstrate. Say so in the plan.

**D-16's poll assertion has no analog** and is live-network — see No Analog Found.

---

### `test/repo-claims.test.cjs` (extend — the repo-fact accumulator)

**Analog: the file's own clauses.** Its header states the ownership rule that matters for wave
planning (`repo-claims.test.cjs:15-17`): *"Clauses are added by later waves — one owner per wave —
and the whole file is asserted at the end of the phase."* With `use_worktrees: false` this file is a
cross-plan write hotspot: **exactly one owner per wave.**

**Comment-stripping is mandatory, not tidiness** (`repo-claims.test.cjs:33-37, 53`):
```js
 * Everything here greps COMMENT-STRIPPED source. That is mandatory, not
 * tidiness: several Phase 1 fixes deliberately add a comment quoting the very
 * thing they removed … and a raw grep would match the explanation and fail the
 * correct fix.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
```
This bites Phase 2 immediately: the honesty work deliberately leaves comments quoting the false
claims it deletes.

**Both-directions pinning — copy this shape for every Phase 2 clause**
(`repo-claims.test.cjs:245-269`):
```js
test('the Stop-drain wiring HIVE.md now describes is still there (#5, FLOOR-02)', () => {
  // The negative test above can be satisfied by DELETING the feature as well as by
  // correcting the docs — and a deletion would make every removed denial
  // retroactively true. Pin the positive direction in the same file so that
  // refactor fails the suite instead of quietly winning the argument.
  const index = readStripped('src/main/index.ts');
  …
  assert.ok(
    /drainForStop\(/.test(index) && /delivery\.drainAtStop\(/.test(index),
    'src/main/index.ts no longer wires the Stop-drain … HIVE.md §2.5/§3/§5/§7/§8 now all say it runs'
  );
```
Phase 2 clauses that follow this template directly: no module-scope `new X(` / `process.on(` under
`src/main/floor/**`; all 153 IPC channel names still registered; exactly one `new GitCommitter(` in
`src/` (ADR-0004); `capabilityLine` has ≥1 `src/renderer` importer (the honest gate for D-30);
neither `slack.ts` nor `webhook.ts` retains an `openTunnel` body; the `LIVE-UNVERIFIED` count in
`src/main/hive.ts` matches a committed number (currently **8**).

---

### `test/webhook-endpoints.test.cjs` (extend)

**Analog: its own stub-request driver** (`webhook-endpoints.test.cjs:18-70`), including the reason a
unit test never calls `start()`:
```js
 * The HTTP handler is driven directly with stub req/res objects: `start()` opens
 * a real tunnel, and a unit test must never reach the network.
…
function makeServer(overrides = {}) {
  const seen = [];
  const server = new WebhookServer({
    port: 0,
    endpoints: endpoints(),
    onMessage: (msg, endpoint) => { seen.push({ msg, endpoint }); … },
    lookupStatus: (token) => token === 'good-token' ? { status: 'todo', title: 'a card' } : null,
    ...overrides.opts
  });
  return { server, seen };
}
/** Fire one request through the handler and resolve with `{status, body}`. */
function request(server, { method = 'POST', url = '/', headers = {}, body = undefined }) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method; req.url = url; req.headers = headers;
    req.destroy = () => { /* no socket to tear down */ };
```
Discord's Ed25519 test builds its keypair locally with `node:crypto`
`generateKeyPairSync('ed25519')` — the same zero-dependency route `test/engine-parity.test.cjs`
already uses `crypto` for.

---

### `test/build-assets.test.cjs` (extend — phone assets) + `electron-builder.yml` (modify)

**Analog: the test's derived-not-hardcoded rule** (`build-assets.test.cjs:16-20`):
```js
 * Deliberately derived, not hardcoded: the alias map is read out of
 * electron.vite.config.ts and the imports out of the sources, so a NEW aliased
 * asset is covered the day it is added — which is exactly how logo.png slipped
 * through.
```

**Analog: the packaging entry to copy** (`electron-builder.yml`, `extraResources`):
```yaml
extraResources:
  - from: resources/md-slack-reply.cjs
    to: md-slack-reply.cjs
  # Knowledge Graph agent CLI + its pure-JS core. Agents invoke `node
  # <resources>/kg.cjs` out-of-process; kg-core.cjs ships beside it …
  - from: resources/kg.cjs
    to: kg.cjs
  - from: src/main/kg-core.cjs
    to: kg-core.cjs
  # Bundled default skills (read-only/no-secret). copyBundledSkills() reads these
  # from skillsResourceDir() = <process.resourcesPath>/skills in the packaged app …
  - from: resources/skills
    to: skills
```
`resources/skills` is the directory-copy precedent `resources/phone` follows. Note `files:` contains
only `out/**`, `package.json`, `CHANGELOG.md` — `resources/` is **not** in it, which is Pitfall 4
(#52) exactly.

---

### `src/preload/index.ts` (extend — new IPC wrappers)

**Analog** (`preload/index.ts:1227-1233`) — one wrapper per channel, doc-commented, typed to the
handler's `{ ok, … }` return:
```ts
  /** Start the Slack webhook server; returns the public tunnel URL to paste into … */
  slackStart: (): Promise<{ ok: boolean; url?: string; error?: string }> =>
    ipcRenderer.invoke('slack:start'),
  /** Stop the Slack webhook server + tunnel. */
  slackStop: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('slack:stop'),
```
Channel names are `domain:action`, colon-namespaced (`CONVENTIONS.md` § Naming). The extraction must
preserve all **153** `ipcMain.handle` names in `index.ts` exactly.

---

## Shared Patterns

### 1. Electron-free main modules (applies to: `floor/**`, `tunnel.ts`, `cloudflared.ts`, `webhook.ts`, `slack.ts`)
**Source:** `src/main/delivery.ts:24-27`
```ts
 * Deliberately free of any `electron` import so `node --test` can drive the whole
 * loop with fakes (test/delivery-main.test.cjs). All Electron/hive/PTY specifics
 * arrive through {@link DeliveryDeps}, wired in index.ts.
```
Same sentence at `slack.ts:18-19` and `webhook.ts:38-40`. **Anything platform- or Electron-shaped is
a constructor/option field, resolved by the caller** — the cloudflared binary path, the phone
`staticRoot`, `FloorDeps.paths`. Adding `app.isPackaged` to `webhook.ts` would destroy the exact
property D-23 is reusing.

### 2. Discriminated `{ ok, … }` results, never a throw across a boundary (applies to: every new fallible fn)
**Source:** `CONVENTIONS.md` § Error Handling + `src/main/fs.ts` `readFileText`
```ts
export async function readFileText(root: string, rel: string): Promise<{
  ok: true; content: string; path: string; size: number;
} | { ok: false; error: string }> {
  const abs = safeJoin(root, rel);
  if (!abs) return { ok: false, error: 'path escapes root' };
  try { … } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
```
`e instanceof Error ? e.message : String(e)` is the repo-wide narrowing idiom. `null` (not a throw)
for "not found / could not determine" — `safeJoin`, `resolveNodeInstaller`, `parseNpmCmdShim`.
No custom `Error` subclasses exist anywhere in `src/`; do not introduce the first one.

### 3. Fail closed on secrets (applies to: MCP grants, phone bearer, tunnel enable)
**Source:** `src/main/integrations.ts:116-133` + `hive.ts:1235`
```ts
export function setSecret(secretRef: string, plaintext: string): { ok: boolean; error?: string } {
  …
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'OS secret encryption is unavailable; refusing to store a secret in plaintext' };
    }
```
```ts
      if (e.tier !== 'safe-readonly' && consented !== true) continue;   // fail closed
```
**Revoke must call `deleteSecret`** (`integrations.ts:156-170`, idempotent, removes the file when the
last ref goes). `deleteSecretsWithPrefix` (`:173-186`) exists for exactly the "a family of refs I
cannot enumerate" case — `mcp:<agentId>:` is that shape when an agent is archived.
Key with `secretRefFor` from `src/shared/integrations.ts:91`; the renderer sees only a
`hasSecret` boolean (`integrations.ts:78-79` `listRecordsRedacted`).

### 4. Comments explain WHY, at length, citing the incident (applies to: all new source)
**Source:** `CONVENTIONS.md` § Comments — *"This is the codebase's defining convention."*
Live exemplars to model on: `procKill.ts:1-19` (names the two leaks it prevents),
`webhook.ts:18-40` (enumerates every security property and why), `delivery.ts:127-145` (why a thunk,
with the exact bug a string would cause), `hive.ts:2380-2397` (why `timeout` is seconds, with the
measured cold-start numbers). A comment that only restates the code is not this convention.
New standing decisions get an ADR — `docs/adr/README.md`'s rule: never renumbered; a reversed
decision gets a new record, not an edit.

### 5. Repo-fact tests pin a claim mechanically (applies to: every honesty item in this phase)
**Source:** `test/repo-claims.test.cjs` (462 lines), `test/ci-config.test.cjs`,
`test/engine-parity.test.cjs`. See the full pattern under `test/repo-claims.test.cjs` above.
**Pitfall-1 rule from RESEARCH:** for every channel this phase adds, land a repo-fact test that a
**production consumer exists** — a grep for the import in `src/main` or `src/renderer`, not just an
assertion on the pure function's output. The warning sign is "a test file is the only importer of a
`src/shared` export", which is precisely `capabilityLine` today.

### 6. Announced skips (applies to: every platform- or network-conditional test)
**Source:** `test/net-binding.test.cjs:286, 315, 323`; `test/proc-kill.test.cjs:28-37`
```js
console.error('[net-binding] socket watchdog case skipped — win32 named pipes have no file to unlink');
```
Never `return` silently. A conditional branch that skips must either assert something real or print
why it did not.

### 7. Per-agent isolation under `agentDir` (applies to: MCP, kimi config)
**Source:** `hive.ts:527` `agentDir(id) = <root>/agents/<id>`; already written there:
`settings.json`, `.codex/config.toml` (per-agent `CODEX_HOME`, `hive.ts:998`),
`.pi-agent/extensions/`, `.opencode/plugin/`, per-agent `CRUSH_GLOBAL_CONFIG`.
`<agentDir>/mcp.json` and `<agentDir>/kimi-config.toml` join an established pattern, not a new one.

### 8. `loadTs` + `node:test` + `node:assert/strict`, one file per concern
**Source:** `test/load-ts.cjs`; `CONVENTIONS.md` § Naming — `test/<area>.test.cjs`, kebab-case, named
after the **subsystem**, not 1:1 with the source file. Note `test/load-ts.cjs:10-26` explains why the
electron stub exists and why an injected `require.cache` entry must win over it — that comment is the
authority for the boot test's approach, and it is what makes D-02's correction of
`main-hardening.test.cjs:5-7` a comment fix rather than a behaviour change.

---

## No Analog Found

The planner and executor should use RESEARCH.md's cited patterns here, not a loose match from this
repo. **A wrong analog is worse than none — the executor will copy it.**

| File / surface | Role | Data flow | Why there is no analog |
|---|---|---|---|
| `resources/phone/index.html` | static asset | browser fetch | **No HTML file is served over HTTP anywhere in this repo.** `src/renderer/index.html` is a Vite entry consumed by Electron's own loader, not by a `node:http` server. Nothing to copy. |
| `resources/phone/sw.js` | static asset | service worker | **Zero occurrences of `serviceWorker` in `src/`** (verified by grep). No registration, no scope handling, no cache strategy exists. |
| `resources/phone/manifest.webmanifest` | static asset | browser | **Zero occurrences of `webmanifest`** in the repo. Icon sizes, `display: standalone`, `start_url` all come from the spec, not from precedent. |
| Static-file HTTP handler in `webhook.ts` | route handler | file-I/O over HTTP | **No `createReadStream`-to-HTTP path and no MIME map exist in `src/main`** (verified). The *containment* half has an analog (`fs.ts safeJoin`) and the *routing* half has one (`handleRequest`), but the serving itself is new. RESEARCH § Security V12 mandates an exact-filename allowlist rather than a directory walk — do not build a general static server. |
| Web Push / VAPID (`src/main/push.ts`) | service | outbound POST + ECDH/AES-GCM | **No ECDH, no HKDF, no AES-GCM anywhere in `src/`.** The repo's `node:crypto` use is HMAC (`slack.ts`), SHA-256 + `timingSafeEqual` (`webhook.ts`), and `randomBytes`. VAPID's `generateKeyPairSync('ec')` / `diffieHellman` / `hkdfSync` / `createCipheriv('aes-128-gcm')` / `sign(…,{dsaEncoding:'ieee-p1363'})` chain has no precedent here. RESEARCH § Don't Hand-Roll still says use node-core over a `web-push` dependency — but there is no in-repo shape to copy. |
| QR rendering + enrollment-token exchange (renderer) | component | one-shot handshake | **No QR generation exists in the repo**, and the enrollment flow (token in the URL `#fragment`, burned on first use, exchanged for a bearer in origin-scoped IndexedDB) has no precedent. The nearest *conceptual* relative is the 192-bit capability token minted in `webhook.ts` — reuse the minting and the constant-time compare; the single-use-burn and fragment handling are new. |
| The live cloudflared close test (D-16) | test | live network, polling | **No test in this repo makes an outbound network call.** `test/node-install.test.cjs` drives every download branch with an injected fake fetcher precisely to avoid it. The poll-until-non-200-within-15 s assertion is new, must be **outside** the default `npm test` gate, and must announce its skip (`net-binding` pattern) when offline or when `cloudflared` is absent (it is absent on this machine — verified). |
| Injected fake `spawn` in a test | test | child process | Partial only. `hive.ts:1302` calls `spawn` directly at method scope, so no existing test fakes a spawner. `DeliveryDeps` shows the *injection* pattern; nothing shows it applied to `child_process`. `tunnel.ts` must accept its spawner as an option or its unit test cannot exist. |

**Also worth stating plainly:** `src/main/floor/` does not exist, `src/main/tunnel.ts` does not exist,
and `resources/phone/` does not exist (all three verified this session). Nothing in this phase is
being "moved into an existing module" except the `hive.ts` seam work.

---

## Metadata

**Analog search scope:** `src/main/**` (48 modules), `src/shared/**`, `src/renderer/src/components/**`,
`src/renderer/src/hooks/**`, `src/preload/index.ts`, `test/**` (59 files), `electron-builder.yml`,
`electron.vite.config.ts`, `.planning/codebase/CONVENTIONS.md`.

**Files read for excerpt extraction (16):** `src/main/{delivery,procKill,index,slack,webhook,hive,integrations,knowledge,nodeInstall,config}.ts`,
`src/shared/{providerAutomation,agentProvider,mcpCatalog}.ts`,
`src/renderer/src/components/{AgentCard,AddAgentModal,AskMeTab,CommandCenterPanel}.tsx`,
`src/preload/index.ts`,
`test/{delivery-main,net-binding,config-secrets,repo-claims,webhook-endpoints,build-assets,hive-durability,hive-task-mutation,hive-hook-node,main-hardening,proc-kill,engine-parity,load-ts}.cjs`,
`electron-builder.yml`.

**Facts verified in this session (not inherited):** the nine line counts in the header; the
byte-identity of the two `openTunnel()` bodies via `diff`; that the two `stop()` bodies differ only
in the log tag; `capabilityLine`'s two importers; the absence of `src/main/floor/`,
`src/main/tunnel.ts`, `resources/phone/`, `createReadStream`-to-HTTP, `serviceWorker` and
`webmanifest` anywhere in the tree.

**Pattern extraction date:** 2026-08-21
