# Security Policy

## Scope

Hello MarkX is a **local-first desktop app**. It spawns local processes in PTYs and
reads/writes files under directories you register. It is not a sandbox: an agent you
spawn runs with your user's privileges, and with auto mode on (the default — see
*Known limitations*) it runs without asking you first.

### Network surface

Everything the app listens on, so a reviewer knows where to look. Nothing here is a
"no listeners" posture — there are six HTTP servers plus a local socket, and two of
them can be reachable from the internet when you opt in.

| Listener | Where | Bind | Reachable from |
| --- | --- | --- | --- |
| Hook server | `hooks.ts` — `HookServer` | Unix domain socket / Windows named pipe | this machine only |
| Per-agent proxy sidecar | `hive.ts` — `startProxyBridge()` | `127.0.0.1`, ephemeral port | loopback |
| Integration broker | `integrationBroker.ts` — `IntegrationBroker` | `127.0.0.1` | loopback |
| Slack reply helper | `slack.ts` — `SlackReplyServer` | `127.0.0.1` | loopback |
| OTel usage collector | `telemetry.ts` — `TelemetryCollector` | `127.0.0.1` | loopback |
| Slack trigger receiver | `slack.ts` — `SlackWebhookServer` | `127.0.0.1` | loopback **+ public tunnel when enabled** |
| Webhook trigger receiver | `webhook.ts` — `WebhookServer` | `127.0.0.1` | loopback **+ public tunnel when enabled** |

(All under `src/main/`. Symbols rather than line numbers on purpose — stale line
numbers are how this document went wrong the first time.)

- **The hook server** is how each agent's lifecycle shims report in. Every payload
  must carry the process-local token `HIVE_SOCK_TOKEN` (`hookSockToken()` in
  `hooks.ts`), minted fresh at each app start and injected only into agent child
  environments. A payload without it is dropped at the socket boundary. This stops
  any other local process from forging agent events; it is not a defence against a
  process that can already read this app's child environments.
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
