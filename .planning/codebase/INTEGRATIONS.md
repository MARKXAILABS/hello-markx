# External Integrations

**Analysis Date:** 2026-08-20

## Correction to prior framing

Prior docs described "six HTTP servers." Verified against source, that count conflates two different mechanisms:

- **5 persistent `node:http` servers actually run inside the Electron main process:**
  1. `SlackWebhookServer` — `src/main/slack.ts:112` (public, tunneled)
  2. `SlackReplyServer` — `src/main/slack.ts:446` (loopback-only, a second, separate `createServer` call in the *same file* — this is the "two servers in slack.ts" surface)
  3. `WebhookServer` — `src/main/webhook.ts:144` (public, tunneled, multi-endpoint incl. decoys)
  4. `TelemetryCollector` — `src/main/telemetry.ts:32` (loopback-only, OTLP/HTTP receiver)
  5. `IntegrationBroker` — `src/main/integrationBroker.ts:80` (loopback-only, secret-injecting reverse proxy)
- **`HookServer`** (`src/main/hooks.ts:94`) uses `node:net` (`createServer`), i.e. a **Unix domain socket / Windows named pipe with a custom line-JSON protocol** — not HTTP.
- The 6th `http.createServer` call some docs count (`src/main/hive.ts:3436`) is **not a server running in Electron main at all** — it is inside `PROXY_BRIDGE_SHIM`, a template string hive.ts writes to `<hive>/bin/hive-proxy.cjs` and spawns as a **separate per-agent child process** (a loopback reverse-proxy sidecar for proxy-tier CLI engines — qwen, crush). See "Agent CLI Engines" below.

So: 5 in-process HTTP servers + 1 in-process Unix-socket/named-pipe server + N per-agent sidecar HTTP proxies spawned on demand (one per proxy-tier agent, not a fixed count).

## APIs & External Services

**Slack (`src/main/slack.ts`, 536 lines):**
- Inbound: `SlackWebhookServer` implements the Slack Events API `url_verification` handshake + `message`/`app_mention` events. Every request is verified with Slack's **signing-secret HMAC over the raw body** (`createHmac`) plus a **5-minute replay-timestamp guard**; any failure → 403. Body capped at 1 MB. Bound to `127.0.0.1` only; reachability from Slack's servers comes entirely from the `tunnelmole` tunnel opened after `listen()` (best-effort, non-fatal if it fails).
- Outbound reply: `postSlackReply()` POSTs to `https://slack.com/api/chat.postMessage` using the bot token, over `node:https`.
- `SlackReplyServer` — a **second, loopback-only** HTTP server (never tunneled) that lets a spawned helper script (`resources/md-slack-reply.cjs`, shipped outside the asar) post a reply **without the agent process ever seeing the Slack bot token**. Guarded by a per-session `x-md-reply-token` header, constant-time-compared (SHA-256'd both sides, `timingSafeEqual`).
- Tunnel caveat (explicit in source comments): `tunnelmole` exposes no close handle — `stop()` closes the local server but the public hostname stays registered/resolvable (to a now-closed port) until the whole app process exits.

**Inbound Webhooks (`src/main/webhook.ts`, 468 lines):**
- `WebhookServer` — one HTTP server, **N user-defined endpoints**, disambiguated by `/<webhookId>` in the path (no extra port/tunnel per endpoint). `POST /<id>` + `x-md-webhook-secret` header → routes into hive work or holds for operator approval per `TriggerMode` (see `src/shared/triggers.ts`); `GET /<id>` + `x-md-webhook-token` → poll that task's status only.
- `POST /` (bare) is a compatibility alias for a synthetic endpoint id `legacy` (`LEGACY_ENDPOINT_ID`).
- **Decoy/enumeration-resistance design** (verified in source, `webhook.ts:134-232`): an unknown endpoint id is answered with the exact same 401 shape as a wrong secret — the constant-time compare still runs against an unguessable per-process `decoySecret` (random 32 bytes, `randomBytes(32).toString('hex')`) so timing/response cannot distinguish "endpoint doesn't exist" from "endpoint exists, secret wrong." An unknown-id rate-limit bucket (`UNKNOWN_BUCKET`) is shared across all unknown ids for the same reason.
- Rate limiting: fixed 60s window, `RATE_LIMIT = 120` requests globally, `PER_ENDPOINT_RATE_LIMIT = 60` per endpoint id — both enforced before body parsing/crypto. Body capped at 1 MB.
- Also opens a `tunnelmole` tunnel (same dynamic-`import()` pattern and same "no close handle" caveat as Slack's).

**Loopback secret broker (`src/main/integrationBroker.ts`, 319 lines):**
- `IntegrationBroker` — a `127.0.0.1`-only HTTP reverse proxy at `http://127.0.0.1:<port>/i/<integrationId>/<path...>`. A spawned worker authenticates with a **per-worker capability token** (random 32-byte handle, never a secret) via `Authorization: Bearer` or `X-MD-Broker-Token`; the broker resolves the integration record, decrypts its real secret (`src/main/integrations.ts`), injects the upstream auth header, and streams the proxied response back — **the worker process never sees the credential**.
- Not an open proxy: a worker can only reach `baseUrl`s the user registered (selects by integration id, never an arbitrary host), and `resolveUpstreamUrl()` confines the resolved path under the integration's own origin/path prefix.
- Registered integration catalog (`src/shared/integrations.ts`, `INTEGRATION_TEMPLATES`): **GitHub** (`https://api.github.com`, `authType: 'github'`), **Custom REST API** (user-supplied `baseUrl`), **Linear** (`https://api.linear.app/graphql`, header auth), **Jira** (`https://your-domain.atlassian.net/rest/api/3`, Basic-auth header), **Notion** (`https://api.notion.com/v1`, bearer), **Stripe** (`https://api.stripe.com/v1`, bearer), **Confluence** (`https://your-domain.atlassian.net/wiki/api/v2`, Basic-auth header), **Sentry** (`https://sentry.io/api/0`, bearer), **HubSpot** (`https://api.hubapi.com`, bearer). `IntegrationAuthType` is `'none' | 'bearer' | 'header' | 'github'` — no OAuth2; Gmail/Google Calendar/Salesforce are explicitly documented as *not yet* registered because they need OAuth refresh (a stated v1 non-goal).

**Telemetry collector (`src/main/telemetry.ts`, 587 lines):**
- `TelemetryCollector` — loopback-only OTLP/HTTP-JSON receiver. Every spawned `claude` process is launched with `CLAUDE_CODE_ENABLE_TELEMETRY=1` and `OTEL_EXPORTER_OTLP_ENDPOINT` pointed at this collector; Claude Code **pushes** OpenTelemetry to it (no protobuf, no external collector process). Decoded into `AgentUsageSample` (cumulative cost/token snapshot, PII-free by construction — reads an explicit allowlist of OTel keys, never persists a raw record) and an ephemeral `ToolSpan` ring buffer for a per-agent tool-call waterfall.

**PostHog product analytics (`src/main/analytics.ts`, outbound):**
- `https://us.i.posthog.com` (or `POSTHOG_HOST` override) via `posthog-node`. Anonymous by construction: `$process_person_profile: false` on every event, distinct id is a random UUID minted at first run (not a machine id), per-event property **allowlist** enforced in `track()` so an unlisted property can never leak. Gated on all of: a non-empty build-time `__POSTHOG_KEY__` (empty for dev/fork builds → whole module no-ops), `DO_NOT_TRACK` env, and the user's `telemetryEnabled` config (default ON/opt-out). Contract documented in `TELEMETRY.md`.

**OpenAI Realtime voice ("Realtime Michael") (`src/main/realtime.ts`, 126 lines):**
- Model: `gpt-realtime-2` family (exact id in `src/shared/realtimePricing.ts`, `REALTIME_MODEL`). The renderer connects via WebRTC using `@openai/agents-realtime` but **never holds the real OpenAI API key** — main decrypts the BYOK key (stored under `apikey:openai` in the encrypted secret store) only to mint a short-lived ephemeral client secret via `POST https://api.openai.com/v1/realtime/client_secrets` (GA shape), falling back to the legacy `POST https://api.openai.com/v1/realtime/sessions` on a 404. Only the ephemeral token + minimal session config cross IPC to the renderer.

**Groq (two independent uses, both main-process-only to keep the key off the renderer and dodge CORS):**
- `src/main/groq.ts` — chat completion (`https://api.groq.com/openai/v1/chat/completions`, model `llama-3.1-8b-instant`) for VDE AI-assist suggestion text; blocks payloads that look like they contain secrets before egress; 80,000-char prompt cap.
- `src/main/freeflow.ts` — Whisper transcription (`https://api.groq.com/openai/v1/audio/transcriptions`, model `whisper-large-v3-turbo`) for voice dictation; 25 MB upload cap (Groq free-tier limit), multipart via native `FormData`/`Blob` (Electron 43 bundles Node 24's `undici`).

**GitHub (three independent surfaces):**
- `src/main/github.ts` — shells out to the `gh` CLI (`gh issue list --json …`, `gh run list --json …`) for the in-app issue/CI panel; degrades to an error result if `gh` isn't installed/authenticated, never throws.
- `src/main/updater.ts` — `electron-updater` against GitHub Releases (repo `MARKXAILABS/hello-markx`, `publish.provider: github` in `electron-builder.yml`), plus a fallback plain poll of the `releases/latest` API for the win-portable build.
- `src/main/skills.ts` — fetches a third-party skills catalog markdown from `https://raw.githubusercontent.com/abubakarsiddik31/claude-skills-collection/main/README.md` (24h TTL cache) and, when a user installs a specific skill, walks `https://api.github.com/repos/<owner>/<repo>/contents/<path>` to download it.
- `src/main/hero.ts` — fetches `https://raw.githubusercontent.com/MARKXAILABS/hello-markx/main/docs/hero.json` (Settings hero-card copy/sponsors; 6h TTL cache, never fatal — falls back to cached copy, then compiled-in defaults).

**tunnelmole (public tunnel, opt-in):**
- `^2.4.0`, used identically by `slack.ts` and `webhook.ts`. ESM-only package; dynamically `import()`ed inside `openTunnel()` (a static import would throw `ERR_REQUIRE_ESM` since main is bundled CJS). Forwards to `localhost` from the same machine — the local HTTP handler (secret/HMAC verification) is the actual security boundary, not the tunnel. No disposer/close handle exists in the tunnelmole API, so `stop()` can only close the local listener, not deregister the public hostname (documented, not a bug being hidden).

## Data Storage

**Databases:**
- SQLite via `better-sqlite3` 11.10.0, synchronous, single file `harness.db` next to `config.json` under `app.getPath('userData')`. Class: `PersistStore` (`src/main/db.ts`). WAL mode (`journal_mode = WAL`), `synchronous = NORMAL`, `busy_timeout = 5000`, `foreign_keys = ON`. Schema managed via **append-only `PRAGMA user_version` migrations** (one array entry per version; migration N + version bump run in one transaction). Current scope (v1/migration 0→1): `kv` (scalar app state — main window bounds) and `command_history` (every prompt submitted to an agent). A file that fails to open as a database is quarantined (renamed to `harness.db.corrupt-<ts>`, never deleted) and a fresh DB is created — exactly one retry.
- Reserved-but-not-built migrations are documented inline: a `agents`/`message_queue` mirror of renderer state (Phase B/C), and a `cost_ledger` table matching the JSONL cost-ledger keys 1:1 (cross-lane, Lane A).

**File Storage:**
- Local filesystem only. `userData` (Electron) holds `config.json`, `harness.db` (+ WAL/SHM), `integration-secrets.json`, `updater.log`, hero/skills-catalog caches, `slack-reply.json` (port+token for the loopback reply helper).
- Knowledge store (`src/main/kg-core.cjs`) is a separate file-backed corpus under `<userData>/knowledge` by default: `index.jsonl` (derived search-index cache) + `docs/<docId>/{meta.json, original.<ext>, text.md}` (source of truth). **Not a graph** despite the "knowledge graph" naming in older docs/MEMORY_GRAPH_SPEC.md — retrieval is term-frequency + title/phrase-boost keyword scoring over text chunks, implemented in pure JS (`node:fs`/`path`/`crypto` only, no native deps) so it can also load under a spawned agent's plain `node` invocation via `resources/kg.cjs`. The file header explicitly flags SQLite FTS5 as a documented, not-yet-built upgrade path.

**Caching:**
- Ad hoc file-based TTL caches, not a shared cache layer: hero payload (6h TTL, `src/main/hero.ts`), skills catalog (24h TTL, `src/main/skills.ts`).

## Authentication & Identity

**Auth Provider:**
- None — no OAuth/SSO/identity provider. Every external credential is a user-supplied token/API key.
- **Secret storage:** `src/main/integrations.ts` — Electron `safeStorage`-backed encrypted-at-rest store, **fail-closed**: a secret is never written unless `safeStorage.isEncryptionAvailable()` (no plaintext fallback). Stored in `integration-secrets.json`, a file **separate from** `config.json`, permissions `0o600`. A record (`IntegrationRecord`) carries only a `secretRef` handle — never the secret value — so it's safe to persist in config and cross IPC to the renderer. Secrets are decrypted only inside `integrationBroker.ts`/`realtime.ts`/agent-spawn env injection, at the moment of use, and are never logged, echoed, or placed in agent env visible to the renderer.
- **BYOK model-provider keys** (`src/main/index.ts`, `BACKEND_KEY_ENV`): `anthropic`→`ANTHROPIC_API_KEY`, `openai`→`OPENAI_API_KEY`, `google`→`GEMINI_API_KEY`, `openrouter`→`OPENROUTER_API_KEY`, `groq`→`GROQ_API_KEY`. Stored write-only under `apikey:<backend>` in the same encrypted broker; materialized into a spawned agent's env **main-process-only**, never returned over IPC.
- **Claude account pool** (`src/shared/claudeAccountPool.ts`, `src/main/accountPool.ts`) — a separate, pure state machine for N pinned Claude subscription accounts (not a generic auth provider): per-account health (`active` → `cooling(untilTs)` on 429 → `dead` on 401), a rolling 5h usage window for "least loaded" auto-assignment, and a rate-limited failover planner. Failover is documented as a **pause**, not a fix: it cannot create quota, and an in-flight turn is lost and resumed on the next account.

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry/Bugsnag wired into the app's own runtime — Sentry appears only as a pre-baked *outbound* integration template users can register for their own agents to call, not as first-party crash reporting).

**Logs:**
- `updater.log` — append-only breadcrumb file in `userData` (`src/main/updater.ts`), written specifically because a prior silent updater failure (documented in-file) left no trace anywhere.
- `console.log`/`console.error` throughout main; no structured/shipped logging pipeline.
- Telemetry (`telemetry.ts`) and analytics (`analytics.ts`) are the two closest things to "observability," and both are scoped narrowly (agent cost/tool-span; anonymous product-usage counters) rather than general app logging.

## CI/CD & Deployment

**Hosting:**
- Desktop app distributed via GitHub Releases (repo `MARKXAILABS/hello-markx`); no server-side hosting component.

**CI Pipeline:**
- GitHub Actions, three workflows:
  - `ci.yml` — `typecheck` (ubuntu, `tsc --noEmit` both projects + advisory `npm audit --audit-level=high`), `test` (ubuntu/windows/macos matrix, **hard gate, no `continue-on-error`** — the workflow's own comments document that an earlier permanently-yellow Windows job hid 7 real Windows source bugs and that `--ignore-scripts` install + no linux `node-pty` prebuild used to silently drop 70 tests on Ubuntu), `build` (ubuntu, `electron-vite build`, with native-module rebuild isolated as `continue-on-error` so a real TS/bundle break still hard-fails the job)
  - `e2e.yml` — Electron smoke test (Playwright `_electron`, Linux/xvfb only, 25 min timeout), deliberately its own workflow so a display/GPU flake can't redden the unit gate
  - `release.yml` — triggered on `v*` tags (or manual dispatch for a dry build); pre-flight `links` job validates `RELEASE.md` download links against `package.json` version before the three-platform (mac/win/linux) `electron-builder` build+publish

**Dependency updates:**
- Dependabot (`.github/dependabot.yml`) opens the actual version-bump PRs; `npm audit` in CI is advisory-only (`continue-on-error: true`) so a fresh transitive-dep advisory is visible without blocking an unrelated PR.

## Environment Configuration

**Required env vars (build-time, CI-injected, all optional/no-op-safe locally):**
- `POSTHOG_KEY`, `POSTHOG_HOST` — analytics; empty → `analytics.ts` no-ops
- `AZURE_ENDPOINT`, `AZURE_CODE_SIGNING_ACCOUNT`, `AZURE_CERT_PROFILE`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` — Windows Trusted Signing (release workflow only); absent → unsigned Windows build
- `APPLE_*` (unspecified exact names in this file; consumed by `build/notarize.cjs`) — macOS notarization; absent → signed-but-not-notarized build

**Runtime env vars (user-supplied, at spawn time, per agent):**
- `CLAUDE_CODE_ENABLE_TELEMETRY`, `OTEL_EXPORTER_OTLP_ENDPOINT` — Claude Code → `telemetry.ts`
- `HIVE_SOCK`, `HIVE_SOCK_TOKEN`, `AGENT_ID` — every spawned agent → `hooks.ts`'s Unix-socket/named-pipe protocol. `HIVE_SOCK_TOKEN` is **per-agent, minted per-spawn** (`mintToken`) into that one PTY's environment — not one value handed to every agent — and the server derives the sender's identity from it rather than trusting `payload.agent_id`. The qwen proxy sidecar is spawned separately and does **not** receive one yet, so it is dead-hooked until its `hive.ts` spawn site is given the agent's token
- `OPENAI_BASE_URL` / `CRUSH_PROXY_BASE_URL` (inert sentinel for Crush) — proxy-tier engines routed through the per-agent `hive-proxy.cjs` sidecar
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY` — BYOK keys for non-Claude engines, injected main-only at spawn

**Secrets location:**
- `<userData>/integration-secrets.json` (encrypted via `safeStorage`, 0o600) — separate from `<userData>/config.json` (plaintext app config, no secrets).

## Webhooks & Callbacks

**Incoming:**
- Slack Events API (`SlackWebhookServer`, HMAC + replay-window verified, public via tunnelmole)
- User-defined inbound webhooks (`WebhookServer`, per-endpoint shared secret, public via tunnelmole, decoy-resistant, rate-limited)

**Outgoing:**
- Slack `chat.postMessage` (bot token, via `SlackReplyServer`'s loopback-brokered helper)
- Registered `custom-rest`/`github` integrations, forwarded through `IntegrationBroker` (capability-token-gated, secret injected only at the broker)

## Agent CLI Engines (`src/shared/agentProvider.ts`, 662 lines)

Eleven engine presets (`AgentProvider` union: `claude | codex | grok | kimi | antigravity | qwen | opencode | crush | pi | copilot | custom`). Each is an **external CLI binary** the app spawns via `node-pty`, not an API called directly by this app (except where noted). How each gets hive lifecycle events (status, idle-drain, cost) varies:

| Engine | Bridge mechanism | Cost tracking | Live-verification status |
|---|---|---|---|
| `claude` | Native — `--append-system-prompt` + `--settings` hooks → `HookServer` (Unix socket) | `otel` (OTLP push to `telemetry.ts`, transcript fallback) | Live-verified (default/primary engine) |
| `codex` | Hooks — per-agent `CODEX_HOME/hooks.json` reusing the Claude-shaped `cth-hook` shim | `transcript` (reads Codex's own rollout files, `usage.ts`) | Live-verified |
| `grok` | Hooks — `installGrokHooks()`, camelCase-payload adapter → `HookServer` | `none` | Live-verified |
| `antigravity` (`agy`) | Hooks — `installAgyHooks()` writes `~/.gemini/.../hooks.json` (translating shim) | `none` | Live-verified ("verified agy honors hook decisions" per source comment) |
| `pi` | **Hooks** via a bundled per-agent extension (`installPiHooks`, `PI_EXTENSION`) | `none` | **LIVE-UNVERIFIED** — `agentProvider.ts:371`, `hive.ts:903,2179`: exact extension-discovery path + event API unconfirmed, pending BYOK keys; renderer idle-nudge is the guaranteed fallback drain |
| `opencode` | **Hooks** via a bundled native plugin (`installOpenCodePlugin`, `OPENCODE_PLUGIN`), listens for `session.idle` | `none` | **LIVE-UNVERIFIED** — `agentProvider.ts:371`, `hive.ts:913,2206,2215`: plugin auto-load + `session.idle` firing unconfirmed; source hedges by writing the plugin to *both* `plugin/` and `plugins/` since which directory the installed version scans is itself unverified |
| `qwen` | **Proxy** — loopback reverse-proxy sidecar (`PROXY_BRIDGE_SHIM`/`hive-proxy.cjs`) tees OpenAI-shaped traffic, synthesizes hive events | `proxy` (sidecar `CostSample`) | Marked `// TODO-verify` / `// SPIKE` in source (`agentProvider.ts:325-336`) — whether `qwen-code` even reads `OPENAI_BASE_URL` is unconfirmed |
| `crush` | **Proxy** — same sidecar mechanism as qwen, but routed via a per-agent `CRUSH_GLOBAL_CONFIG` file (Crush has no base-URL env override; `CRUSH_PROXY_BASE_URL` in the preset is an intentionally inert sentinel) | `proxy` | **LIVE-UNVERIFIED** — `agentProvider.ts:443`, `hive.ts:2240`: single-upstream proxy + synthesized Stop unconfirmed pending keys |
| `kimi` | None — hook bridge not implemented | `none` | `canReceiveInbox: false` (mail bounces to the orchestrator) |
| `copilot` | None — print-mode CLI, no hook surface | `none` (spend sits on the user's Copilot plan) | `canReceiveInbox: false` |
| `custom` | None | `none` | `canReceiveInbox: false` |

The four bridges explicitly flagged `LIVE-UNVERIFIED`/`TODO-verify` in source are **pi, opencode, crush, and qwen** — all four are "written best-effort, wrapped so a wrong guess can't break the spawn," with the renderer's idle inbox-wake nudge (`useHive.ts`) as the guaranteed fallback drain path regardless of whether the bridge actually fires.

Each engine also has its own **install path** (`installCommand`/`nativeInstallCommand` per preset in `agentProvider.ts`) — e.g. `npm install -g @anthropic-ai/claude-code`, `npm install -g @openai/codex`, `npm install -g opencode-ai@latest` with a `curl | bash` / `choco install opencode -y` native fallback, `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`, `npm install -g @github/copilot` — invoked by the missing-CLI auto-install ladder (`src/main/cliInstall.ts`, `src/main/nodeInstall.ts`).

---

*Integration audit: 2026-08-20*
