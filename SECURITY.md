# Security Policy

## Scope

Hello MarkX is a **local-first desktop app**. It spawns local processes in PTYs and
reads/writes files under directories you register. It is not a sandbox: an agent you
spawn runs with your user's privileges, and with auto mode on (the default — see
*Known limitations*) it runs without asking you first.

### Network surface

Everything the app listens on, so a reviewer knows where to look. Nothing here is a
"no listeners" posture. Precisely: **five HTTP servers run inside Electron main**
(`webhook.ts`, `telemetry.ts`, `integrationBroker.ts`, and *two* in `slack.ts` —
`SlackWebhookServer` and `SlackReplyServer`), **one local socket** (`hooks.ts`, which
is `node:net` over a Unix domain socket or a Windows named pipe — not HTTP), and **one
HTTP server per running agent** that lives in a *child process*, not in main: the proxy
sidecar is a template in `hive.ts` written out to `hive-proxy.cjs` and spawned per
agent. Two of these can be reachable from the internet, and only when you opt in.

| Listener | Where | Bind | Reachable from |
| --- | --- | --- | --- |
| Hook server | `hooks.ts` — `HookServer` | Unix domain socket / Windows named pipe | this machine only |
| Per-agent proxy sidecar (**child process**, not main) | `hiveTemplates.ts` — `PROXY_BRIDGE_SHIM` (the template itself; `hive.ts`'s `startProxyBridge()` writes it out to `hive-proxy.cjs` and starts it) | `127.0.0.1`, ephemeral port | loopback |
| Integration broker | `integrationBroker.ts` — `IntegrationBroker` | `127.0.0.1` | loopback |
| Slack reply helper | `slack.ts` — `SlackReplyServer` | `127.0.0.1` | loopback |
| OTel usage collector | `telemetry.ts` — `TelemetryCollector` | `127.0.0.1` | loopback |
| Slack trigger receiver | `slack.ts` — `SlackWebhookServer` | `127.0.0.1` | loopback **+ public tunnel when enabled** |
| Webhook trigger receiver | `webhook.ts` — `WebhookServer` | `127.0.0.1` | loopback **+ public tunnel when enabled** |

(All under `src/main/`. Symbols rather than line numbers on purpose — stale line
numbers are how this document went wrong the first time.)

- **The hook server** is how each agent's lifecycle shims report in. The socket is
  a Unix domain socket / named pipe, so any local process can connect to it and
  post a payload claiming to be any agent. So the server does not read the
  `agent_id` a payload claims. Main mints a **per-agent** token at each PTY spawn
  (`mintToken` in `hooks.ts`), injects it into that one agent's PTY environment as
  `HIVE_SOCK_TOKEN`, and the server DERIVES the sender's identity from the token
  through its own token→agent map (`authorized`). The token is revoked when that
  PTY exits. A payload with no token, or one the server does not recognise, is
  dropped at the socket boundary and logged.

  Two properties are claimed here, and deliberately not a third. There is **no
  floor-wide key** — reading one agent's token buys that agent's identity, not the
  floor's — and **the payload's own `agent_id` is never trusted**. What is *not*
  claimed is secrecy, because an agent's own shell can read whatever its own shim
  can read, and it is not a defence against a process that can already read this
  app's child environments. Nor is it "one agent cannot authenticate as another":
  agent B's token lives in B's process environment, and on Linux a same-uid
  sibling can read that out of `/proc`, which the deny list does not cover.

  **Re-measured this phase: all six now send a real token.** Every one of the
  six lifecycle artifacts (`HOOK_SHIM`, `AGY_HOOK_SHIM`, `PI_EXTENSION`,
  `OPENCODE_PLUGIN`, `PROXY_BRIDGE_SHIM`, `GROK_HOOK_SHIM`, all in
  `hiveTemplates.ts`) forwards `process.env.HIVE_SOCK_TOKEN` as `sock_token`,
  and the token is now genuinely present at spawn for every tier: `pty.ts`
  injects it into every hooks-tier PTY's own environment last, so nothing
  upstream can shadow it, and `hive.ts`'s `mintProxyToken` gives the
  proxy-tier sidecar (qwen, crush) its own token on its separate
  child-process spawn. Both mint paths are wired unconditionally at boot
  (`floor/boot.ts`). A payload that arrives with no token, or a token the
  server does not recognise, is still dropped at the socket boundary and
  logged — that half is unchanged.
- **The proxy sidecar** is a child process spawned per agent whose CLI has no hook
  system (Codex-family, Crush, …). The CLI is pointed at it with
  `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL`; it forwards to the real upstream and tees
  the response so hive events can be derived. It sees the full request and response,
  including your prompts — in memory, never written to disk.
- **Slack and webhook triggers** are **off by default**. When you turn one on it binds
  loopback and opens a public tunnel through a `cloudflared` child process
  (`tunnel.ts`/`cloudflared.ts`) — not the `tunnelmole` library call this file used
  to name; that was replaced (D-13/D-14). Cloudflare publishes no checksum file for
  its releases, so the binary is acquired against a SHA-256 digest **committed in
  this repo** (fetched from GitHub's release API in the session that wrote it, never
  from a moving `latest` pointer) — the same class of gap this project already
  shipped and fixed once (#57, an unverified MSI). Requests are verified before
  anything is dispatched, per-endpoint: Slack request signing; a per-endpoint shared
  secret for a generic webhook; Telegram's own header compare; and Discord's Ed25519
  signature over the raw body — all four compared in constant time, and an unknown
  endpoint id is answered identically to a wrong secret (no enumeration signal).
- **The lockout on the phone's auth endpoints is global, not per-client, and
  remotely triggerable.** Every caller behind the tunnel presents the tunnel's own
  IP, so per-IP limiting is meaningless there; `PHONE_LOCKOUT_FAILURES` (5 failures)
  engages a floor-wide `PHONE_LOCKOUT_MS` (30s) hold that anyone who knows the public
  URL can trigger, repeatedly, against every legitimate phone session at once.
  Accepted and bounded — short, provably clearing, reset on any successful
  credential presentation — never described as per-client. The phone's own request
  bucket (`PHONE_RATE_LIMIT`, 40/60s) sits below the global webhook bucket
  (`RATE_LIMIT`, 120/60s shared with every Telegram/Discord/webhook caller), and a
  TryCloudflare `429` (its own 200-in-flight cap) is indistinguishable from this
  server's own — the phone UI cannot tell you which one fired.
- **The `/phone/` shell is self-identifying, which weakens no-enumeration.** Every
  other unknown path on this server answers identically by design; the phone's
  static shell answers `200` with no token, so the origin identifies itself as a
  Hello MarkX floor to anyone who requests it. Unavoidable for an installable PWA —
  stated, not silently accepted. The phone's *auth* endpoints (`/phone/api/enroll`,
  `/asks`, `/answer`) keep the uniform-failure discipline even though the shell
  itself does not.
- **Discord inverts authenticate-before-buffer, deliberately and endpoint-scoped.**
  Every other endpoint authenticates BEFORE reading the body, so an unauthenticated
  peer cannot make the process allocate. Discord's Ed25519 signature is computed
  over the raw request bytes, which requires buffering first — the one real weakening
  of that property this project ships. It is capped far below the general body limit
  (`DISCORD_MAX_BODY_BYTES`, 64 KB vs 1 MB), named, and scoped to Discord's own route
  only; every other endpoint's order is unchanged.
- **Outbound HTTPS** goes to the providers you configure (model APIs), GitHub releases
  for updates, and the skills catalog.

No telemetry is sent unless a PostHog key is injected at build time (see
[`TELEMETRY.md`](./TELEMETRY.md)).

## Known limitations

These are real today. They are listed here rather than fixed in prose because people
make trust decisions from this file.

- **Auto mode is on by default, and it removes the tool-permission prompt.**
  `autoMode: true` appends each engine's bypass flag at spawn
  (`--permission-mode bypassPermissions`, `--dangerously-bypass-approvals-and-sandbox`,
  `--yolo`, `--dangerously-skip-permissions`; see `commandForAutoMode` in
  `src/main/config.ts`). With it on there is no interactive approval step, so
  "the permission prompt is the human gate" is not true for a default install.
  Three things still hold under a bypass, and they are all the safety there is:
  the harness's own `PreToolUse` gate (`control.toolDecision` →
  `permissionDecision: 'deny'`), the circuit breaker, and a standing
  `permissions.deny` list (`AGENT_DENY_RULES` in `src/main/hive.ts`) written into
  every hive-authored per-agent settings file
  ([#4](https://github.com/MARKXAILABS/hello-markx/issues/4)).
  **The deny list is not a sandbox**, and its own source comment says so: the
  `Bash(…)` rules are prefix matches on the command string, so a model that wants
  past them writes a script or varies the spacing — it stops the confident
  accident, not a hostile model. The `Read`/`Edit` rules bind the file tools, not
  `cat`. And it is **Claude Code only**: the engines with no settings file (Codex,
  Crush, qwen, …) run their bypass flag genuinely ungated. Turn auto mode off in
  Settings → General if you want to be asked.
- **`fs:statAbs` answers for any absolute path.** The other 18 `fs:*` / `git:*` IPC
  handlers are now double-gated ([#9](https://github.com/MARKXAILABS/hello-markx/issues/9)):
  `safeJoin` confines the relative path inside the root, and `managedRoot()` requires
  the renderer-named root to be a folder the app actually manages — a registered repo,
  the harness home, or an agent/worktree cwd — with both sides resolved through
  `realpath`, so neither a symlinked root nor a symlinked target escapes.
  `fs:statAbs` is deliberately outside that gate because it takes an absolute path
  rather than a root; it returns existence and is-file only, so what leaks is
  "does this path exist", not its contents.
- **Stopping a trigger DOES close its tunnel now — narrower than that once was, and
  narrower than "closed" still sounds.** This limitation used to say `stop()` could
  not close the tunnel at all, because the old `tunnelmole()` library call exposed
  no handle. That is false now: the tunnel runs as a `cloudflared` **child process**
  (`tunnel.ts`), and `stop()` calls `hardKillTree` on its pid — the same explicit-kill
  principle `procKill.ts` uses for PTY children. What is verified: a poll confirming
  the public hostname stops resolving within roughly 30 seconds of `stop()`. What is
  **not** verified: no multi-hour soak — Cloudflare gives no SLA for Quick Tunnels and
  documents them as **"testing and development only"**, so treat a tunnel left open
  for hours as untested territory, not as covered by this close proof. Separately,
  Quick Tunnels have **no stable URL**: every open mints a new `trycloudflare.com`
  hostname, so an installed PWA (the phone) cannot hardcode or bookmark an origin —
  each new pairing needs a fresh QR.
- **The published installers are unsigned, and provenance is not a substitute.**
  Every release carries a `SHA256SUMS.txt` and a Sigstore build-provenance
  attestation over it, generated by `.github/workflows/release.yml`'s `publish`
  job. That is a real supply-chain control, and it covers exactly what that file
  names — since the release workflow's hashing step was widened, that is the
  installers (`.dmg`, `.zip`, `.exe`, `.AppImage`), their `.blockmap`s, and the
  `latest*.yml` update feed. `gh attestation verify <artifact> --repo
  MARKXAILABS/hello-markx` tells you the file was built from this repository, at
  a named commit, by that workflow, and an artifact named in `SHA256SUMS.txt`
  that has been tampered with fails that check.

  Two limits on that, both real. First, **you** have to run the command: nothing
  in the app verifies an attestation. The in-app updater validates a download
  against the sha512 inside `latest*.yml`, so attesting that feed makes it
  *checkable by a human*, not self-verifying — an attacker who can rewrite the
  feed can still steer an update, and the attestation is what lets you catch it
  afterwards rather than what stops it. Second, **pre-change releases carry an
  unattested update feed**: before that widening, `SHA256SUMS.txt` named only the
  installers, so on every release published earlier the feed and the blockmaps
  are outside the attestation entirely. Verify installers from those releases by
  hand and treat their update feeds as unverified.

  What none of this does is suppress **SmartScreen** on Windows or
  Gatekeeper on macOS: those trust a paid signing certificate (Azure Trusted
  Signing, an EV certificate, the Apple Developer Program) and nothing else, and
  this project runs at zero recurring cost so it holds none. Expect the
  "unrecognised app" prompt on Windows and a right-click → *Open* on macOS, and
  verify the download rather than reading the absence of a warning as safety.
- **Agents are not sandboxed from each other's files.** The single-writer rule
  (§2 of [`HIVE.md`](./HIVE.md)) is a convention in the agents' prompts, not an
  enforced boundary; nothing stops an agent from writing into another agent's
  directory if it decides to.
- **The phone is a localhost-verified auth path, not a device-verified install.**
  The enrollment/pairing round-trip is verified against localhost; nothing in this
  repo has been tested against a physical Android device — no WebAPK install, no
  `display:standalone`, no Web Push while the phone is asleep. Treat those three as
  unverified, never as shipped, until run on a real device.

## Supported versions

Security fixes target the `main` branch only.

| Version | Supported |
|---|---|
| `main` | ✅ |
| older tags | ❌ |

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's
**private vulnerability reporting**: the *Security → Report a vulnerability* tab on
this repository. You can expect an acknowledgement within a few days.

## Notes for reviewers

- Renderer ↔ main IPC goes through a typed `contextBridge` (`window.cth`); the renderer
  has no direct Node access (`nodeIntegration: false`, `contextIsolation: true`).
- Secrets (provider keys, Slack tokens, Claude account tokens, webhook secrets) live in
  Electron `safeStorage` via the broker in `src/main/integrations.ts`, not in
  `config.json`. Where `safeStorage` is unavailable the app degrades to the old
  plaintext path with a warning rather than losing your setup.
- The hive commits to a local git repo from a **single committer** (the main process);
  agents only write plain files. See [`docs/adr/0004-single-committer-git.md`](./docs/adr/0004-single-committer-git.md).
