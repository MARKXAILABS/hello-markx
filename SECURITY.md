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
| Per-agent proxy sidecar (**child process**, not main) | `hive.ts` — `PROXY_BRIDGE_SHIM` → `hive-proxy.cjs`, started by `startProxyBridge()` | `127.0.0.1`, ephemeral port | loopback |
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

  **Not yet covered, and it fails closed.** Three of the six lifecycle shims send
  no token at all today — the per-agent proxy sidecar, and the pi and OpenCode
  extensions — so the hook server drops everything they post. The consequence is
  that those engines lose live status, the Stop-boundary inbox drain and cost
  rows, rather than gaining an unauthenticated way in. That is a gap being closed,
  not a design: until it is, treat the hook boundary as enforced only for the
  engines whose shims send a token.
- **The proxy sidecar** is a child process spawned per agent whose CLI has no hook
  system (Codex-family, Crush, …). The CLI is pointed at it with
  `ANTHROPIC_BASE_URL` / `OPENAI_BASE_URL`; it forwards to the real upstream and tees
  the response so hive events can be derived. It sees the full request and response,
  including your prompts — in memory, never written to disk.
- **Slack and webhook triggers** are **off by default**. When you turn one on it binds
  loopback and opens a public tunnel (tunnelmole) to that port. Requests are verified
  before anything is dispatched: Slack request signing, and a per-endpoint shared
  secret for webhooks, both compared in constant time.
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
- **Stopping a trigger does not close its tunnel.** `tunnelmole()` resolves a URL and
  keeps its websocket private — the package exposes no handle and no disposer — so
  `WebhookServer.stop()` / `SlackWebhookServer.stop()` free the local port and report
  the tunnel hostname as still-open rather than claiming a close they cannot perform.
  Residual exposure is a public hostname that 502s until the app quits. Quit the app
  to be certain.
- **The published installers are unsigned, and provenance is not a substitute.**
  Every release carries a `SHA256SUMS.txt` and a Sigstore build-provenance
  attestation over it, generated by `.github/workflows/release.yml`'s `publish`
  job. That is a real supply-chain control — `gh attestation verify <artifact>
  --repo MARKXAILABS/hello-markx` tells you the file was built from this
  repository, at a named commit, by that workflow, and a tampered artifact fails
  it. What it does **not** do is suppress **SmartScreen** on Windows or
  Gatekeeper on macOS: those trust a paid signing certificate (Azure Trusted
  Signing, an EV certificate, the Apple Developer Program) and nothing else, and
  this project runs at zero recurring cost so it holds none. Expect the
  "unrecognised app" prompt on Windows and a right-click → *Open* on macOS, and
  verify the download rather than reading the absence of a warning as safety.
- **Agents are not sandboxed from each other's files.** The single-writer rule
  (§2 of [`HIVE.md`](./HIVE.md)) is a convention in the agents' prompts, not an
  enforced boundary; nothing stops an agent from writing into another agent's
  directory if it decides to.

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
