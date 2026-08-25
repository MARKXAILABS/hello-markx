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

## Phase 4 — the three new gates, their ceilings, and the four fail-opens

Phase 4 moved an agent's blast radius out of one engine's settings file and into the
main process. Three gates landed: **GATE-02** (an env allowlist at the `pty.spawn` choke
point, `src/main/shellEnv.ts`), **GATE-03** (a command-shape judge in main,
`src/main/commandShape.ts` called from `hooks.ts`'s `protectedPathDenial` path), and
**GATE-05** (a third answer between allow and deny, `hooks.ts`'s `openApproval` +
`src/main/approvals.ts`). **GATE-04** (a per-engine codex sandbox opt-in) is built and
**LIVE-UNVERIFIED**; its outcome is stated below rather than implied.

Each gate's ceiling is itemised in its own source file, and restated here because people
make trust decisions from this file and not from a doc comment. The lists below are the
same lists, at the same counts — 10 items for GATE-02, 13 for GATE-03, 8 for GATE-05 —
counted against the source at the closing wave rather than summarised from memory.

### The four fail-opens

Three inherited, one new. Every one carries a disposition and, where the fix has an
owner, that owner. A ceiling list that omits one reads as a guarantee that does not hold.

1. **The user-global engine seeds sit outside the hive root.** `~/.codex/config.toml`
   (copied into every codex agent's config at spawn), `~/.gemini/…/hooks.json` and
   `~/.grok/hooks/` are all outside the tree `protectedPathDenial` protects, so an agent
   that appends one `[[hooks.PreToolUse]]` block to a seed has it executed inside another
   agent's hook process, with that agent's environment. Stated at `hooks.ts:54-59`.
   **Disposition:** INHERITED, DEFERRED. **Owner:** the hive maintainer. Closing it needs
   the seeds moved inside a protected location, which is its own change.
2. **The shim's connect-error `process.exit(0)`, which for a Claude `PreToolUse` hook is
   *allow*.** Deleting the socket file therefore disables the gate for everyone. Making
   the shim fail **closed** would break every agent whenever the app is legitimately not
   running — an agent PTY outlives a quit, which is a normal state — so the shim keeps
   exiting 0 and `armSocketWatchdog` re-listens on a missing or replaced socket instead.
   **Disposition:** INHERITED, DELIBERATE, BOUNDED rather than removed. What is guaranteed
   is detection plus a loud log, not exclusion; re-taking a rebound path is a race this app
   can lose.
3. **`protectedPathDenial`'s `if (!root) return null`** — GATE-01/GATE-03 ceiling item (i).
   With no hive root there is nothing to protect, so failing open is a true statement about
   the world. **Disposition:** INHERITED, ACCEPTED. **Owner:** the hive maintainer.
   **The deliberate contrast, and it is the point of listing both together:** GATE-03's
   host arm fails **closed** on an *empty* allowlist (`commandShape.ts` returns
   `kind:'deny'`, naming the key), for exactly the opposite reason — an empty allowlist is
   a configuration this app cannot distinguish from a tampered one, so there *is* something
   to protect and the safe direction is refusal. Two fail directions, both chosen.
4. **NEW this phase, and the only one: on four engines GATE-05's "ask" degrades to
   "deny".** pi, OpenCode, grok and agy all take the first reply's deny and never poll
   back, so for them the third answer collapses into the second. That is the safe side, and
   it is still a behaviour that belongs in a ceiling list: on those four, every force-push,
   every `curl … | sh`, every `rm` with a recursive flag and every fetch to a host outside
   the allowlist becomes a refusal with no path through. **Disposition:** DELIBERATE
   fail-**CLOSED**, named at `hooks.ts` GATE-05 ceiling item (a). **Owner:** the hive
   maintainer. There is a rider `(a-rider)` beside it: the ask is still *opened* for those
   four, so the operator is still paged and their answer is inert.

*(The phase's own closing plan described fail-open 4 as naming pi and OpenCode only. The
source names **four** engines, and grok's and agy's degradation is ceiling item (e)'s
explicit consequence. The wider, measured set is what is written above.)*

### GATE-02's ceiling — what an env allowlist does not reach (`src/main/shellEnv.ts`, 10 items)

The filter bounds the **initial** environment of every process this app spawns, applied at
the three `...process.env` spreads it owns — `pty.ts`, `hiddenClaude.ts` and `memory.ts`.

- (a) An agent that obtains a secret by any route other than inheritance — `aws configure`,
  or simply reading `~/.aws/credentials`, `~/.codex/auth.json` or `~/.netrc`.
- (b) Anything reachable on `PATH`. `PATH` survives by necessity, so every credential
  helper, keychain client and cloud CLI on this machine is one command away.
- (c) The operator's additive pass-through list (`envPassThrough`) — a hole they opened
  knowingly. **Disposition:** ACCEPTED. **Owner:** the operator.
- (d) Grandchildren. A filtered agent may `export` anything into what it spawns; this
  bounds the first hop only.
- (e) win32 env names are case-insensitive to the OS while `Set.has` is not. Mitigated by
  upper-casing both sides and emitting the original spelling; listed because it is the
  failure a future edit would silently reintroduce.
- (f) BYOK engines reading a key the operator exported in their own shell stop
  authenticating unless that name is passed through. Keys configured *in the app* are
  unaffected — they layer after the filter.
- (g) The pass-through list itself lives in `userData/config.json`, outside the hive root
  and outside everything `protectedPathDenial` protects, while the allowlist keeps
  `APPDATA` / `LOCALAPPDATA` / `USERPROFILE` because agents need them. So an agent can
  locate and rewrite its own env allowlist. **Owner:** the hive maintainer.
- (h) `memory.ts` and `hiddenClaude.ts` both filter with an **empty** pass-through list, so
  two of the three sites cannot reach the operator's list. Consequence, stated rather than
  discovered: an operator whose `ANTHROPIC_API_KEY` comes from their own shell loses memory
  condensation with no way to re-admit it. **Owner:** the hive maintainer.
- (i) `HTTP_PROXY` / `HTTPS_PROXY` may embed credentials and are on the allowlist, so that
  string reaches every agent child. The alternative is a corporate floor that cannot fetch.
  **Owner:** the operator.
- (j) **Two further `...process.env` spawns in `src/main/` are NOT filtered by this
  control** — `hive.ts`'s `startProxyBridge` (the first-party proxy sidecar) and
  `index.ts`'s `enableCodexRemoteForSpawn` (the `codex app-server` daemon). Neither was in
  GATE-02's owned line ranges. **Owner:** the hive maintainer.

### GATE-03's ceiling — what a command-shape judge does not reach (`src/main/hooks.ts`, 13 items, (j)-(v))

- (j) A runtime-assembled command string — `C=rm; $C -rf /`, or any spelling the model
  composes after the hook has already seen the literal text.
- (k) A `cd` into a directory followed by a relative invocation.
- (l) A harness home containing a **space** — the Bash arm splits on whitespace.
- (m) A base64 blob, an `eval` body or a here-doc body.
- (n) A tool that carries no command string. A `WebFetch` to a denied host is not judged by
  the command arm.
- (o) The **engines**. This reaches every engine that sends a hook payload carrying a
  command: claude (measured) and codex (envelope measured), plus the four reusing the same
  shim — agy, grok, pi, opencode — **whose payload keys are UNMEASURED**. It does not exist
  at all for an engine with no `PreToolUse` hook.
- (p) **A host outside a downloader's own argument is not judged, and neither is a
  single-label host.** The whole host arm is scoped to a downloader's first non-flag
  argument, and that scope is measured rather than cautious: judging every scheme-ful token
  anywhere in the command refused writing a README here-doc, because this repo's own README
  links to ten hosts in ordinary prose. **So `git clone` / `npm` / `pip` against an unlisted
  host, a downloader this list does not name, and any exfiltration by a non-downloader
  binary (`nc`, `ssh`, a `node -e` fetch) are not reached.** Any wording elsewhere implying
  the host arm covers `git clone` is wrong, and is corrected by this item.
- (q) The host allowlist and the env pass-through list both live in `userData/config.json`,
  outside the hive root, and GATE-02 deliberately keeps the variables that locate it. An
  agent can append its own host to its own allowlist without a restart. **Disposition:**
  ACCEPTED. **Owner:** the hive maintainer.
- (r) `harness.db`, the tool-call audit trail, also lives in `userData` and is reachable by
  the agents it audits, for the same structural reason. **Owner:** the hive maintainer.
- (s) Both arms read `tool_input.command` and **nothing else**. An engine naming its shell
  argument differently is judged by neither arm and is not path-protected either. Measured
  for claude; **UNMEASURED for grok, pi, opencode, kimi and agy.**
- (t) The deletion spellings this gate does **not** judge, enumerated so the list is not
  read as complete: `find . -delete`, `find … -exec rm {} \;`, `git clean -xfd`, `shred`,
  `truncate -s0`, `> file`, `dd of=`, `Remove-Item -Recurse`. The delete arm covers a
  recursive `rm` and nothing else. **Owner:** the hive maintainer.
- (u) `DEFAULT_HOST_ALLOWLIST` is `[ASSUMED]` and known incomplete; the operator extends it.
  **Owner:** the operator. *(The source's own wording ties "the approval transport is wired"
  to `openAsk` being supplied. At the closing wave that reading is stale: production passes
  `openAsk` as `undefined` on purpose, `HookServer` owns an `ApprovalRegistry` and opens a
  real ask anyway, and `floor/boot.ts` supplies `readConfig().hostAllowlist ?? []`. So an
  **unlisted** host is an **ask** today; only an **emptied** allowlist is a hard deny.)*
- (v) The delete arm's **segmentation is a heuristic, not a shell**, and it errs in both
  directions: it splits on `;`, `&&`, `||`, `|` and newline, requires `rm` to head its
  segment, and unwraps one level of `sh -c` / `bash -lc`. **Owner:** the hive maintainer.

### GATE-05's ceiling — what a third answer does not reach (`src/main/hooks.ts`, 8 items, (a)-(h))

- (a) **The deny-on-timeout only binds engines whose shim polls**, and four do not — pi,
  OpenCode, grok and agy. See fail-open 4 above, and its `(a-rider)`: the ask is still
  opened for those four, so the operator is paged and their answer is inert.
- (b) An app restart mid-ask loses the in-memory registry and the next poll denies.
  Deliberate — "asked and nobody answered" and "the floor is down" must not share a default.
- (c) An agent that never runs a hook-bridged tool is not asked about anything.
- (d) `--permission-mode bypassPermissions` (auto mode's default) suppresses Claude's own
  prompt, so this gate is the only thing between the model and the command.
- (e) **grok's and agy's `PreToolUse` timeouts are unchanged and their shims deliberately do
  not poll.** agy is `timeout: 0`; grok writes no key at all and applies its own ~5 s
  event-aware default **whose unit is unverified** — if it reads milliseconds, writing `150`
  would kill every grok hook before the shim could answer. Neither CLI is installed here, so
  neither resolver can be probed. **Owner:** whoever installs them.
- (f) The registry's `answer` is reachable from three places — the hook socket (where the
  owning agent is checked), the phone and the desktop IPC (where **the ask id is the whole
  capability**). Unguessable and single-use, but named so the capability model is legible.
- (g) Claude's `PreToolUse` budget: the unit was read out of the installed binary
  (`claude --version` → 2.1.236, `e.timeout ? e.timeout * 1000 : <default>`, i.e. seconds).
  **Owner:** the hive maintainer.
- (h) `PRETOOLUSE_HOOK_TIMEOUT_SEC = 150` is five times codex's previous 30 s — a real
  latency change on the non-ask path, bounded by the shim's own unconditional 5 s exit timer
  on that path. `150` remains `[ASSUMED]`.

### The honest cross-engine claim

Kept verbatim beside the assertions that support it in `test/engine-parity.test.cjs`, and
repeated here because a reader who trusts this file should not have to find that one. It is
deliberately narrower than the phase's own opening wording, which bound the work to
*"refused for Codex and Grok"* with a live agent observed in each case. grok is not
installed on this machine and an xAI key is a recurring cost this project forbids, so that
wording is not achievable here. The substitution is stated, never performed silently.

> GATE-03 is refused **through the real `HookServer`** for Claude-shaped and Codex-shaped
> `PreToolUse` payloads, driven by the real shim as a child process
> (`test/gate03-roundtrip.test.cjs` and `test/engine-parity.test.cjs`), in **both command
> shapes** — a `command` string and an argv array — with a tool name that is not Claude's
> `Bash`. **NO LIVE AGENT HAS EVER BEEN OBSERVED REFUSED**, and that is a closed measurement
> rather than a pending one: the phase's only live non-Claude agent could not be spawned at
> all, because this machine's stored ChatGPT refresh token is revoked and every codex model
> turn dies at `401 refresh_token_reused` before a tool call is ever emitted. Codex is the
> only one of the four engines named in the phase's own success criterion that is installed
> here (codex-cli 0.128.0).
>
> **Read the sense of that carefully.** It records that no live refusal was observed. It does
> **not** record that a live agent attempted a denied shape and sailed through — that
> experiment never ran. This is an *absence of evidence* about live enforcement, not evidence
> of absence, and nothing may be upgraded on the strength of it. What would settle it is
> unchanged and cheap: `codex login`, then one interactive hive agent asked to run one of
> `commandShapeDenial`'s shapes inside its own worktree.
>
> It is **built for grok, kimi and agy**, and all three are **LIVE-UNVERIFIED** for want of
> an installed CLI and an account. **grok's and agy's reply translators are each exercised
> through a real child process**; kimi reuses `HOOK_SHIM` verbatim, which
> `test/gate03-roundtrip.test.cjs` drives. kimi's open question is unchanged: Moonshot
> documents a hook BLOCK as exit code 2, where this shim expresses a deny as stdout JSON at
> exit 0.
>
> For **pi and OpenCode** it is **built**, and their bridge logic is executed against a real
> `HookServer`: pi's `require()`d extension returns `{approve:false}` carrying main's own
> reason even with `HIVE_AUTO_APPROVE=1`, and OpenCode's dynamically imported ESM plugin
> throws its documented veto. It stays **LIVE-UNVERIFIED for pi**, and equally for OpenCode,
> on the **runtime** question, which no test here can settle — whether pi awaits an async
> return, and whether OpenCode auto-loads the plugin and honours a thrown veto under Bun.
> OpenCode was additionally **inert as shipped**: it posted no `tool_input`, so main answered
> allow on every call. That was a defect, fixed, and it is not laundered into the marker as
> if it were an unverifiable.
>
> The **qwen and crush** proxy tiers have no tool-call boundary to gate at and are out of
> scope. **copilot** has no bridge at all.

One further limit of GATE-03's reach, measured and not implied: OpenCode's `read` tool names
its target `output.args.filePath` while `protectedPathDenial` collects `file_path` / `path` /
`notebook_path`, so **OpenCode's path arm cannot see a file read**. Its command arm does work.

### GATE-04 — built, opt-in, default off, and LIVE-UNVERIFIED

The codex preset gained a sandbox variant: with the per-engine opt-in on, the bypass flag is
replaced by `-s workspace-write --add-dir <agentDir>`, spliced through one shared author
(`sandboxFlagsForProvider`) called from both independent command assemblers.

What was measured, and what was not:

- **Measured, twice, in two independent sessions:** codex-cli 0.128.0 on win32 *admits* the
  sibling agent directory into its writable-root set — its own banner prints it. That is the
  configuration layer.
- **Not measured: enforcement.** No model turn, no shell tool call, no write attempted. Both
  the phase's opening spike and its live run died at `401 refresh_token_reused` before any
  model turn. The spike's verdict was **INCONCLUSIVE**; the live interactive run **did not
  run at all**.
- **Not wired, and this is the part an operator needs.** Both spawn-command assemblers accept
  an `agentDir` and splice it correctly, but **no production caller passes one today** — every
  `buildSpawnCommand(config, model, provider)` call site is three-argument. So turning the
  opt-in on today yields `-s workspace-write` **without** the agent's own folder added, which
  is the failure openai/codex#23552 describes. Wiring it must go through
  `sandboxFlagsForProvider`. **Owner:** the hive maintainer.

GATE-04 therefore ships **built + `LIVE-UNVERIFIED`**, citing
[openai/codex#23552](https://github.com/openai/codex/issues/23552) (OPEN), **neither
reproduced nor ruled out**. Leave the opt-in off until a live run says otherwise.

### The phone's push leg is composed but not delivered

GATE-05's ask and VIGIL-01's absence alarm both compose a push payload
(`askPushPayload`, `floorQuietPushPayload` in `src/main/push.ts`) and neither sends one.
`push.ts` persists a VAPID keypair and nothing else; `webhook.ts` has **no
subscription-intake route**, so **no `PushSubscription` has ever been captured in this
process**. The absence alarm reaches the desktop only, and says so in its own log line. An
alarm raised while the operator's phone is asleep does not arrive. **Owner:** whoever adds
the intake route. This is one root cause with two visible stubs, not two independent gaps.

Related, and recorded rather than fixed: `resources/phone/sw.js`'s comment above the
notification body still says the body is the fixed phrase **"unconditionally"**. Since the
one-line fallback landed, the body renders `data.body` when the sender supplies one — the
security property still holds because the two composers above are the only senders and
neither carries a command, a path or a question, but **the guarantee moved from the worker
to the sender and the comment has not caught up**. A future author who trusts it could put a
command string in `data.body`. **Owner:** the next plan permitted to touch `sw.js`.

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
