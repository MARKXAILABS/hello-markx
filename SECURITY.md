# Security Policy

## Scope

Hello MarkX is a **local-first desktop app**. It spawns local processes in PTYs and
reads/writes files under directories you register. Network surface, so reviewers
know where to look:

- A local **Unix domain socket / named pipe** for the in-app hook server.
- **Loopback HTTP servers** (bound to `127.0.0.1`) for the integration broker, the
  Slack reply helper, the OTel usage collector and the hive bootstrap endpoint.
- **Opt-in inbound HTTP** for the Slack and webhook triggers. These bind a local
  port and, when you enable them, open a public tunnel to it. Requests are verified
  (Slack request signing; a per-endpoint shared secret for webhooks) before anything
  is dispatched.
- Outbound HTTPS to the providers you configure (model APIs, GitHub releases for
  updates, the skills catalog).

No telemetry is sent unless a PostHog key is injected at build time (see
[`TELEMETRY.md`](./TELEMETRY.md)).

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
- `fs:*` / `git:*` IPC calls are path-validated in the main process against the root
  the caller names (see `src/main/fs.ts`).
- The hive commits to a local git repo from a **single committer** (the main process);
  agents only write plain files.
