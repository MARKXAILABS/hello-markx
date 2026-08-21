# Phase 2: The Daemon and the Protocol — Research

**Researched:** 2026-08-21
**Domain:** Electron main-process extraction · headless daemon · public tunnel · PWA-over-tunnel · per-agent MCP · eleven-engine parity
**Confidence:** HIGH on everything measured in this session (see Sources); MEDIUM on Kimi's runtime behaviour (vendor docs only, CLI not installed); LOW on nothing that a plan depends on.

**Baseline re-measured in this session at `2f29d0b`, Windows 11, Node v24.13.0, npm 11.6.2:**

| Command | Result | Evidence |
|---|---|---|
| `npm test` | **515 tests / 511 pass / 0 fail / 4 skipped**, 18.47 s | run 2026-08-21 |
| `npm run typecheck` | **exit 0** | run 2026-08-21 |
| `npm run build` | **✓ built in 36.95 s**, exit 0, renderer main chunk **12,228.98 kB** | run 2026-08-21 |

CONTEXT.md's baseline is confirmed. The build time differs (36.95 s vs 41.17 s) — machine noise, not a regression.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

All thirty-nine decisions D-01 … D-39 in `.planning/phases/02-the-daemon-and-the-protocol/02-CONTEXT.md` are locked and are **not** re-litigated here. Restated in compressed form so the planner does not have to hold two documents open:

**The extraction (STRUCT-01/02 — the internal gate)**
- **D-01** Re-measure line counts in-session; never quote the roadmap's.
- **D-02** The blocker is **module-scope side effects, not the `electron` import**. The success test is "no module-scope construction + an injectable boot function", never a line count. `test/main-hardening.test.cjs:5-7` states the wrong reason and is corrected as part of this phase.
- **D-03** Target: `src/main/floor/` + `bootFloor(deps: FloorDeps)`. `index.ts` keeps every `app.on`, `ipcMain.handle`, `BrowserWindow`, `powerMonitor`, `dialog`. Three rules: no module-scope `new X()` under `src/main/floor/**`; `index.ts` is Electron wiring only; `whenReady` becomes `bootFloor(electronDeps()).then(registerIpc)`.
- **D-04** Extract along `SHUTDOWN_STEPS` (`index.ts:4340-4357`) and the file's own `// ─── … ───` banners. Do not invent a taxonomy.
- **D-05** The gate is `test/boot-floor.test.cjs` going green, plus four named tests, plus `npm run build` from a clean clone.
- **D-06** The extraction lands **after** plan 01-21 (the eslint pass).
- **D-07** `hive.ts` splits for the **seam**, not for testability. Never repeat the testability claim for `hive.ts`.

**Headless (DAEMON-01)**
- **D-08** Windowless Electron, one process. `safeStorage` is the disqualifier for a plain-Node daemon. ~290 MB resident is the accepted, stated cost.
- **D-09** DAEMON-01 is a **deadlock fix**: `before-quit` (`index.ts:5783-5790`) prevents quit with live PTYs and only confirms `if (mainWindow)`.
- **D-10** Four named edits: `--headless` argv gate on `createWindow()`; `window-all-closed` must not kill the floor; `second-instance` gains `else createWindow()`; `setLoginItemSettings` gains `args:['--headless']` (no-op on Linux). macOS uses `setActivationPolicy('accessory')` — **unverified, no Mac**.
- **D-11** The audit is bounded: the `webContents.send` sites and the renderer pollers.
- **D-12** ADR-0001 is stale (the gate moved to `src/main/delivery.ts`); amend it and clear the `useHive.ts` residue.

**Tunnel (DAEMON-05)**
- **D-13** The stop-criterion is achievable; the blocker was library mode.
- **D-14** Spawn `cloudflared tunnel --url http://127.0.0.1:PORT` as a child. Drop the `tunnelmole` library call. tunnelmole rejected (WAN IP in hostname); `bore.pub` disqualified (no TLS).
- **D-15** Close via `procKill.hardKillTree`. `openTunnel()`/`stop()` in `slack.ts` and `webhook.ts` are byte-identical and become **one shared helper**.
- **D-16** The close test **polls** for non-200 + changed body within ~15 s. Live-network, so not in the default `npm test` gate.
- **D-17** The limitation that must ship stated: at $0 you get a stable URL **or** a zero-setup ephemeral URL, not both. Quick tunnels: 200 concurrent in-flight, no SSE, "testing and development only".

**Phone (DAEMON-02)**
- **D-18** The tunnel is mandatory — `http://192.168.x.x` is not a secure context. A LAN-only fallback is a shortcut, not a PWA.
- **D-19** Origin churn is the failure mode; QR re-onboarding with the token in the URL `#fragment`, burned on first use.
- **D-20** Rejected with reasons: session cookie, WebAuthn, ngrok static domain, third-party static host.
- **D-21** Hand-written static files under `resources/phone/`, served by `WebhookServer`. Not a renderer route.
- **D-22** Visibility-gated polling for foreground + Web Push (VAPID) for the pocket. No SSE.
- **D-23** Reuse `WebhookServer`'s trust boundary verbatim. Behind a tunnel every client is the tunnel's IP — say so, do not claim per-client lockout.

**Telegram / Discord (DAEMON-03)**
- **D-24** Existing webhook rails + a **per-endpoint verification strategy**. Telegram = header compare; Discord = Ed25519 over `timestamp + body`, native in `node:crypto`, zero new deps.

**MCP (DAEMON-04)**
- **D-25** Verify the `mcpServers`-in-`--settings` channel before building on it; the fix is `<agentDir>/mcp.json` + `--mcp-config`.
- **D-26** Per-agent is structurally free — every agent already owns `agentDir(id)`.
- **D-27** Floor-wide for `safe-readonly`; per-agent grant for `write`/`secret` only. The branch already exists at `hive.ts:1235`.
- **D-28** Secrets reuse `integrations.ts`, keyed `secretRefFor('mcp:<agentId>:<mcpId>')`. Revoke must call `deleteSecret`.
- **D-29** Nothing hot-reloads; the card says `pending · restart`. Consent UI shows the literal launch spec, env var **names** only, the tier, and the bypassed-permissions line.

**Parity (PARITY-01a/01b/02/03)**
- **D-30** `capabilityLine()` has **zero production consumers**. PARITY-01b is 100 % unbuilt. Phase 1's D-40 rests on the same false assumption and must be re-checked.
- **D-31** The three real surfaces are `AgentCard.tsx`, `AddAgentModal.tsx`, and the Command Center dispatch box. The requirement's literal "assignment flow" does not exist.
- **D-32** The engine ledger: 8 of 11 can receive mail; 4 of 11 have any cost path.
- **D-33** PARITY-01a's real work is **kimi's bridge**. copilot and custom fall to PARITY-01b's label.
- **D-34** PARITY-02 as written is unachievable; the buildable reading is "every engine that can be pointed at a base URL gets proxy cost; the rest are declared."
- **D-35** `LIVE-UNVERIFIED` is 8 sites in `src/main/hive.ts`, comment-and-doc only. One-directional: unmark only after a real session against a real account.

**GSD-06**
- **D-36** The hardcode is `AskMeTab.tsx:92` (`to: 'god'`).
- **D-37** Add `askedBy` to the `humanQA` entry, from `process.env.AGENT_ID`, exactly as `claim` does.
- **D-38** The answer goes to that agent's **inbox**, never its PTY. ADR-0001 unchanged.
- **D-39** The god is still told; addressing the worker is an addition, not a replacement.

### Claude's Discretion

Left to the planner by CONTEXT.md:
- Plan slicing and wave assignment across the twelve requirements — subject to the extraction being the gate.
- Exact module boundaries inside `src/main/floor/` beyond the `SHUTDOWN_STEPS` seam list.
- Exact disjoint file-ownership lists per agent (`use_worktrees: false`).
- How the `cloudflared` binary is acquired — bundled per platform or downloaded on first enable. **No `cloudflared-windows-arm64` asset.**
- Which of the three PARITY-01b surfaces the phase covers, and in what order.
- Which additional engines get proxy-bridge cost under D-34.
- Whether the phone bundle stays hand-written or is promoted to a Vite entry.

### Deferred Ideas (OUT OF SCOPE)

Tailscale Funnel for a stable phone origin · a local CA + `https://<static-LAN-IP>` · a second `electron.vite.config.ts` entry for the phone bundle · serving the phone shell from a free stable static host · WebAuthn/passkeys · a plain-Node daemon · per-agent control of the safe-readonly MCP tier · antigravity cost via a `gemini` api mode · Windows/macOS Electron-launching e2e runners · a multi-hour cloudflared soak.

Also out of scope per CONTEXT.md `<domain>`: SCALE-01/03 (Phase 3), RECORD-01/02 (Phase 4), RECALL-02 (Phase 5), GSD-on-the-floor (Phase 6), iOS, app-store builds, any paid tier.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research support |
|----|-------------|------------------|
| **STRUCT-01** | `src/main/index.ts` split along its seams, each extraction landing tests that cannot exist today | §1 The Extraction's Real Dependency Graph; §2 What a `node --test` Boot Test Can Actually Assert; §3 Test-Surface Inventory |
| **STRUCT-02** | `src/main/hive.ts` split (git committer, messaging, provider provisioning, templates) | §1.4 `hive.ts`'s five seams, measured |
| **DAEMON-01** | The floor runs with no window — agents spawn, mail moves, failover happens, entirely in main | §4.1 — **two headless mail gaps beyond D-11's audit**; §4.2 the quit deadlock |
| **DAEMON-02** | Android PWA served by the daemon, over an authenticated connection | §4.3 — the `WebhookServer` routing wall, the `phone` id collision, the `staticRoot` injection constraint, packaging |
| **DAEMON-03** | Telegram/Discord onto the existing webhook/Slack rails | §4.4 — the per-endpoint verifier is the same edit the PWA needs; order them |
| **DAEMON-04** | MCP installable per agent, with consent, visible on the card | §5 — **D-25 is now LIVE-VERIFIED as a real defect**; the fix is one flag |
| **DAEMON-05** | The PWA reachable over the public tunnel, off by default, generated token, rate-limited, URL visible, `stop()` genuinely closes | §4.5 — the shared helper's home and owner; §7 cloudflared acquisition, measured |
| **GSD-06** | A human answer addressable to **any** agent | §4.6 — three files, one prompt-cache hazard |
| **PARITY-01a** | Every engine that *can* have a routed inbox has one | §6 The Kimi Hook Bridge — **vendor-verified, and cheaper than expected** |
| **PARITY-01b** | The UI says so for engines that cannot | §4.7 — `capabilityLine` has zero consumers, independently confirmed |
| **PARITY-02** | All eleven report cost to the ledger and the breaker | §4.8 — the `bridge:{kind:'proxy'}` extension point, one branch per engine |
| **PARITY-03** | The four `live-unverified` bridges verified or still marked | §9 Validation Architecture — **and kimi makes it five, not three** |

</phase_requirements>

---

## Summary

The single most important thing this research produced is a **live verification that closes DAEMON-04's gate item**: `mcpServers` written inside a `--settings` file is **silently ignored by Claude Code 2.1.236** — the server process is never spawned — while `--mcp-config <file>` spawns it, with or without `--strict-mcp-config`, and with no interactive approval. Measured twice on this machine with a marker-writing stdio server. D-25's suspicion is a confirmed defect: today's default MCP bundle is a no-op, `hive.ts:1188-1190`'s "Claude merges this additively" comment is false, and every existing MCP test passes while the effect is nil. That converts a "verify, then build" prerequisite into "the defect is proven; the fix is one flag next to the `--settings` already on the spawn command."

The second most important finding is that **DAEMON-01's audit is bigger than D-11's five-send-sites-and-eight-pollers bound, in two specific and provable ways.** (a) `hive.ts:1590-1620` routes mail to every hookless and proxy-tier agent through `emitTerminalHandoff`, whose return value is literally `this.emit?.(…) === true` — with no window `emit` returns `undefined`, so **every message to qwen, crush, opencode, pi and kimi bounces to the god with subject `[undeliverable — … the terminal handoff failed (renderer unavailable); relay this to it]`.** The source already documents this behaviour. DAEMON-01's criterion is "mail still routes between them", so this is a hard blocker, not a nicety. (b) Crush is the only `seedDelivery:'type-into-tui'` provider and its one-time hive-protocol seed is typed **only** by the renderer (`useHive.ts:341/694`, `AddAgentModal.tsx:413`) — headless, a Crush agent spawns without ever learning the protocol. Both fixes route through `delivery.enqueue()`, which already exists and already owns the PTY write and the boot grace.

Third: **two of criterion 1's four named tests can be written today, without any split.** I proved the mail router one empirically — a fresh `HiveManager` on a tmpdir, two `ensureAgent` calls, a hand-written outbox file, `hive.routeOnce()` returns 1 and the message lands in the recipient's inbox. And the git committer already has **four** tests (`test/hive-durability.test.cjs:243/263/291/305`) driving the real debounced commit body via `hive.flushCommit(root)` against a real git repo. Only *agent lifecycle* and *shutdown* are genuinely blocked, because `spawnAgentCore`, `teardownPty`, `SHUTDOWN_STEPS` and `runShutdown` are module-private inside `index.ts`. That changes what the split buys and it changes how the criterion should be worded in a SUMMARY — claiming all four "could not be written before the split" would be a false claim of exactly the kind this phase exists to delete.

**Primary recommendation:** Slice the extraction bottom-up along the measured sub-boundaries in §1.2 — templates first (807 zero-coupling lines out of `hive.ts`), then the composition root (`index.ts:175-735`), then the timer/server groups — and make wave 1's *only* deliverables `test/boot-floor.test.cjs` plus the two tests that genuinely need the split (agent lifecycle, shutdown). Do not schedule cloudflared, the phone or kimi until that is green, and do not schedule any of them before plan 01-21 lands, because 01-21 touches `src/main/slack.ts`, `package.json`, `package-lock.json`, `.github/workflows/ci.yml` and `test/ci-config.test.cjs` — five files Phase 2 also needs.

---

## Architectural Responsibility Map

| Capability | Primary tier | Secondary tier | Rationale |
|---|---|---|---|
| Floor boot / subsystem construction | **Main (extracted `src/main/floor/`)** | — | D-03; must be constructible with no Electron binary |
| Window lifecycle, dialogs, menus, deep links, power events | **Main (`index.ts`, Electron wiring)** | — | D-03 rule 2; 11 `BrowserWindow`, 5 `dialog.`, 4 `powerMonitor.`, 8 `app.on(` sites stay |
| IPC surface (153 handlers) | **Main (`index.ts`)** | Preload (162 `invoke` wrappers) | Thin `ipcMain.handle(name, wrapper)`; all 153 names preserved exactly |
| Agent spawn / teardown / worktrees | **Main** | — | Already main-only; `spawnRecipes` exists precisely so respawn survives the window |
| Mail routing (outbox → inbox) | **Main (`HiveManager.routeOnce`)** | — | Already main-only and testable today |
| Mail **delivery to a hookless/proxy engine** | **Main (`delivery.enqueue`)** | ~~Renderer~~ | **Currently renderer — §4.1 gap 1.** Must move for DAEMON-01 |
| Crush protocol seed | **Main (`delivery.enqueue` after boot grace)** | ~~Renderer~~ | **Currently renderer — §4.1 gap 2** |
| Account failover execution | **Main (`delivery.failover`)** | — | Already main-owned (`index.ts:411-434`); DAEMON-01 criterion already met here |
| Cost sampling | **Main (proxy sidecar / hooks → `telemetry.recordCostSample`)** | — | `hive.ts:1039-1062`, `:1281` |
| Public reachability (tunnel) | **Main (child process)** | OS process table (`hardKillTree`) | D-14/D-15; the OS handle *is* the missing disposer |
| Phone shell (HTML/SW/manifest/icons) | **Static files served by `WebhookServer`** | Packaged via `extraResources` | D-21; must NOT become a renderer route |
| Phone auth + API | **Main (`WebhookServer` trust boundary)** | Browser IndexedDB (bearer at rest) | D-19/D-23 |
| Push to a sleeping phone | **Main (outbound POST to the push endpoint)** | Browser service worker | D-22; outbound-only is why it works while the tunnel is down |
| Per-agent MCP config | **Main (`<agentDir>/mcp.json` + `--mcp-config`)** | Renderer (consent UI only) | §5; live-verified |
| Per-engine capability declaration | **Renderer (`AgentCard`, `AddAgentModal`, dispatch box)** | `src/shared/providerAutomation.ts` | D-30/D-31; the shared function exists, the wiring does not |

---

## Standard Stack

### Core — nothing is added

| Library | Version | Purpose | Why standard |
|---|---|---|---|
| `node:test` + `node:assert/strict` | Node 22 (CI) / 24 (this box) | The whole unit gate | House standard; no framework, 59 `test/*.test.cjs` files [VERIFIED: `package.json`, `.planning/codebase/TESTING.md`] |
| `node:crypto` | Node ≥20 | Ed25519 verify (Discord), VAPID/Web Push, constant-time compares | Native; D-24 measured a local Ed25519 round trip returning `true`; zero new deps |
| `node:net` / `node:http` | Node ≥20 | Hook socket / named pipe; `WebhookServer`; the proxy sidecar | Already the transport everywhere |
| `node:child_process` | Node ≥20 | `cloudflared` child; git; proxy sidecar | `procKill.hardKillTree` is the cross-platform close |
| `cloudflared` | **2026.8.2** (latest at research time) | The public tunnel | A single static Go binary, no Node dep tree, no asar unpack needed [VERIFIED: GitHub releases API] |

### Removed

| Package | Current | Action | Consequence |
|---|---|---|---|
| `tunnelmole` | `^2.4.0`, a **direct `dependencies` entry** | Removed by D-14 | Also deletes `src/main/tunnelmole.d.ts` (a hand-written ambient module declaration, dead once the import goes) and the two dynamic `await import('tunnelmole')` calls. **Requires a `package-lock.json` rewrite.** |

> ⚠️ **Lockfile hazard, measured.** The standing constraint is *"`package-lock.json` is written by npm 10, never npm 11."* This machine has **npm 11.6.2** and no cached npm 10 (`npx --no-install npm@10 --version` → not cached; no bundled npm under `C:\Program Files\nodejs`). Any plan that removes `tunnelmole` (DAEMON-05) or adds an eslint dependency (01-21) must first obtain npm 10 (`npm i -g npm@10` or `npx npm@10 …` with network) or the lockfile it writes violates a standing constraint. **This is a prerequisite task, not an afterthought.**

### Alternatives considered

| Instead of | Could use | Tradeoff |
|---|---|---|
| `cloudflared` child process | `tunnelmole` child process | Smaller diff, zero new binary — but the hostname embeds the WAN IP. Rejected by D-14. |
| `cloudflared` child process | Tailscale Funnel | Stable origin, kills D-19's churn — needs an account + system daemon, and its close semantics are unverified. Deferred. |
| Hand-written TOML append for the kimi config | A TOML parser dependency | No TOML parser exists in Node core or in this repo's deps; `installCodexHooks` already does string-append TOML and is the house pattern. Take the house pattern. |
| A `web-push` npm package | `node:crypto` VAPID | D-22 already established node-core is sufficient; adding a dep for this would fail the ladder. |

**Installation:** none. **This phase adds zero npm packages.**

---

## Package Legitimacy Audit

**No external packages are installed by this phase.** The only registry mutation is a **removal** (`tunnelmole`). `cloudflared` is a signed platform binary from Cloudflare's own GitHub releases, not a package-manager artifact.

| Artifact | Source | Version | Digest available | Disposition |
|---|---|---|---|---|
| `cloudflared-windows-amd64.exe` | github.com/cloudflare/cloudflared releases | `2026.8.2` (2026-08-14) | **yes** — GitHub REST `assets[].digest` = `sha256:c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5`, size 54,893,480 B | Approved, **must be checksum-pinned** |
| `tunnelmole` | npm | `^2.4.0` | n/a | **REMOVED** by D-14 |

**Packages removed due to a slopcheck `[SLOP]` verdict:** none — slopcheck was not run because no package is installed.
**Packages flagged `[SUS]`:** none.

> ⚠️ **There is no publisher checksum file in the cloudflared release.** I enumerated all 26 assets of `2026.8.2`: there is no `SHA256SUMS`, no `.sha256`, no `.sig`. The only digest available is GitHub's own `assets[].digest` field, which comes from the same origin as the binary — an integrity check, not a supply-chain proof. This repo already shipped and fixed exactly this defect (**#57: "msiexec ran on an unverified MSI"**, cited in `.github/workflows/ci.yml`). A download-on-first-enable path that skips verification would re-open #57. The honest options are: **(a)** bundle the binary and pin its digest in the repo, or **(b)** download a **pinned release tag** (never `latest`) and verify against a SHA-256 the repo itself records. Never `latest`, never unverified.

---

## §1 The Extraction's Real Dependency Graph (STRUCT-01, STRUCT-02)

### 1.1 Measured shape of `index.ts` at `2f29d0b`

| Metric | Count | How measured |
|---|---|---|
| Lines | **5,812** | `wc -l` |
| `ipcMain.handle(` in `index.ts` | **153** | `grep -c` |
| `ipcMain.handle(` elsewhere in `src/main` | 12 (`updater.ts` 6, `realtimeActions.ts` 3, `realtime.ts` 2, `config.ts` 1) | `grep -c src/main/*.ts` |
| Preload `invoke(` wrappers | 162 (`src/preload/index.ts`, 1,535 lines) | `grep -c` |
| Top-level `let`/`var` | **35** | `grep -c '^let \|^var '` |
| Top-level `const x = new X(...)` | **30** | `grep -c` |
| Top-level `// ─── … ───` banners | **53** (plus 7 indented sub-banners inside `IPC: pty lifecycle`) | `grep -c '^// ─'` |
| Electron surface | `app.getPath`×14, `app.on`×8, `app.quit`×4, `app.getAppPath`×3, `setAsDefaultProtocolClient`×2, `relaunch`×2, `isPackaged`×2, `getVersion`×2, `exit`×2, `whenReady`, `setLoginItemSettings`, `requestSingleInstanceLock`, `getLoginItemSettings`; `dialog.`×5, `shell.`×5, `Notification`×2, `BrowserWindow`×11, `powerMonitor.`×4, `safeStorage`×1 | `grep -o … | uniq -c` |

### 1.2 The **module-scope side effects** that actually block `loadTs` — reproduced

I re-ran D-02's experiment. It reproduces exactly:

```
$ node -e "require('./test/load-ts.cjs')('src/main/index.ts')"
[log] main log: C:\Users\ALIENW~1\AppData\Local\Temp\md-electron-stub\logs\main.log (pid 44428)
ERR: electron_1.app.on is not a function
```

The file is created before the throw. Pinpointing the module-scope statements:

| Line | Statement | Why it blocks / matters |
|---|---|---|
| **175** | `initFileLogging();` | Opens a real write stream under `app.getPath('logs')`. Runs at import. |
| **179** | `crashReporter.start({…})` | Electron-only; guarded by try/catch so it survives the stub. |
| **188** | `app.on('render-process-gone', …)` | **This is the throw.** The stub's `app` has no `on`. |
| **199** | `app.on('child-process-gone', …)` | Same class. |
| **210** | `process.on('uncaughtException', …)` | ⚠️ **A `node --test` hazard, not just an Electron one.** If anything under `src/main/floor/**` installs this, a crashed boot is swallowed and the boot test reports green. **`bootFloor` must never install a process-global handler.** |
| **213** | `process.on('unhandledRejection', …)` | Same. |
| **2610** | `const gotInstanceLock = app.requestSingleInstanceLock();` | Electron-only, stays in `index.ts`. |
| 218–735 | 30 `const x = new X(...)` constructions | The composition root proper — D-03 rule 1. |

### 1.3 Which globals each section actually reads — the wave map

Machine-generated by walking the 53 banners and testing each identifier with a word-boundary regex against the body between banners. Full output preserved; the load-bearing rows:

| Lines | Section | IPC | Globals it reads |
|---|---|---|---|
| 106–1055 | *(prelude / composition root — no banner separates it)* | 0 | **all 30** + `mainWindow` + `liveWebContents` |
| 1056–1292 | Context trigger | 0 | `hive control breaker persist ptyToAgent missionTimers contextTimers liveWebContents` |
| 1293–1443 | Heartbeat + breaker beat | 0 | `ptyManager hive delivery memory ptyToAgent worktreePaths spawnRecipes mainWindow liveWebContents` |
| 1444–1751 | board.md size policy | 0 | `ptyManager hive control telemetry breaker memory ptyToAgent missionTimers allWindows mainWindow liveWebContents dialog Notification` |
| 1752–1782 | Slack webhook server | 0 | `hive slackServer` |
| 1783–2135 | Slack done-notifier | 0 | `hive persist liveWebContents slackServer` |
| 2136–2371 | Generic inbound webhook | 0 | `hive memory persist liveWebContents webhookServer heldWebhookTokens` |
| 2372–2554 | Webhook done-observer | 0 | `hive allWindows mainWindow webhookServer` |
| 2555–2906 | Shareable hires / deep link / **window creation** | 2 | `ptyManager hive telemetry persist allWindows mainWindow dialog shell BrowserWindow` |
| 2907–3541 | IPC: pty lifecycle | **10** | 19 globals — **the densest handler block in the file** |
| 3542–5123 | 45 IPC banners | **139** | mostly 1–4 globals each |
| 5124–5813 | god-triggered ephemeral workers + `whenReady` + quit | 2 | 19 globals + `powerMonitor` |

**Reference counts** (whole file): `hive` 256 · `control` 54 · `breaker` 47 · `ptyManager` 44 · `memory` 38 · `telemetry` 33 · `mainWindow` 28 · `liveWebContents` 28 · `delivery` 26 · `persist` 25 · `roster` 21 · `knowledge` 16 · `preservedWorktrees` 14 · `liveWorkers` 14 · `accountPool` 13 · `integrationBroker` 11 · `ptyToAgent` 10 · `missionTimers` 10 · `hookServer` 10 · `worktreePaths` 8 · `completionWatcher` 7 · `closingTime` 7 · `allWindows` 7 · `worktreeOrigins` 5 · `worktreeBases` 4 · `spawnRecipes` 4 · `reflector` 4 · `pendingInstallRelaunch` 4 · `contextTimers` 4 · `floorWatcher` 3.

**Cleanly separable sections** (read ≤3 globals, no `mainWindow`/`BrowserWindow`/`dialog`, and no timer shared with another section):

`IPC: clipboard` · `IPC: folder picker` · `IPC: Terminal.app` · `IPC: integrations` · `IPC: per-provider BYOK` · `IPC: git` (reads only `roster`) · `v0.3.4 history/compare` (reads only `ptyManager`) · `IPC: Settings hero` · `IPC: setup catalog` · `IPC: semantic memory` · `IPC: command history` (reads only `persist`) · `IPC: live telemetry` · `IPC: circuit-breaker state` · `IPC: operator control` (reads only `control`) · `IPC: scheduled missions` · `IPC: GitHub issue ingestion` · `IPC: GitHub CI status` · `IPC: desktop notifications` · `IPC: Triggers — context` · `IPC: Triggers — organisation` · `IPC: Triggers — history` (reads only `hive`) · `IPC: Free Flow` · `IPC: Realtime Michael` ×2.

**Genuinely entangled — the hard cases, named:**

1. **The prelude (106–1055) cannot be sliced.** It declares every singleton *and* its dependency object *in one topologically-ordered block*: `hive` is constructed at 365 and read by `telemetry`'s `resolveCwd` at 380, by `breaker`'s config thunk, by `accountPool.liveAgents` at 415, by `delivery.liveAgents` at 444, by `hookServer` at 544, by `memory` at 560, by `reflector` at 591. Initialization order *is* the dependency graph. **This is one plan, one owner, one commit — it cannot be split across waves.**
2. **`liveWebContents()` (defined at `index.ts:1741`, 28 call sites)** is the single hardest rename. It reads `mainWindow` *and* iterates `allWindows`, both `BrowserWindow`-typed and both Electron-only. Every one of its 17 prelude call sites must become `deps.send(channel, payload)`. Note the **return-value semantics**: `accountPool`'s and `hive`'s emitters return `boolean` (`{ …send(); return true } catch { return false }`) and callers branch on it — see §4.1. A `deps.send` typed `void` **silently changes behaviour**. `FloorDeps.send` must return `boolean`.
3. **`mainWindow` (28 refs) + `allWindows` (7 refs) + `floorSeq` + `allowQuit`** must stay in `index.ts`. Three of the prelude's sections (`board.md size policy`, `Heartbeat`, `Webhook done-observer`, `Shareable hires`) read them directly, so they either move behind `deps` or stay behind.
4. **`ptyToAgent` is read by six unrelated sections** (context triggers, heartbeat, board policy, pty lifecycle, closing time, filesystem). It is a plain `Map` with no Electron dependency, so it moves cleanly — but it must move **with** the prelude, not after.
5. **`SHUTDOWN_STEPS` (4340–4357) sits inside the IPC region but is prelude-shaped.** Its 16 entries call 11 different globals plus 5 module-private functions (`clearMissionTimers`, `clearContextTimers`, `stopWebhookDoneObserver`, `stopEphemeralWorkerWatcher`, `stopSlackServer`, `stopWebhookServer`). It must move with the prelude and be *returned* by `bootFloor` (as `Floor.shutdown()`), not left behind.
6. **`bootstrapHiveServices()` (5539–5575) is already `bootFloor`'s body.** 21 statements, in order: `ensureHive` → `loadPreservedWorktrees` → `control.replaceAutoDeliveryPauses` → `archiveOrphanedAgents` → `hive.startRouter` → `startEphemeralWorkerWatcher` → `integrationBroker.start` → `ensureDefaultMissions` → `syncMissions` → `syncContextTriggers` → `startWebhookDoneObserver` → `hookServer.start` → `telemetry.start` → `memory.start` → `reflector.start` → `delivery.start` → `adoptRendererQueues` → `armAlwaysOnBeats`. **This is the forward order D-04 asks for and it is already written down.**
7. **`config.ts` has no injectable path.** `configPath()` at `src/main/config.ts:500-501` is `join(app.getPath('userData'), 'config.json')` with no override. `readConfig()` is called from inside the prelude's dependency thunks (`hive`'s `getHome`, `breaker`'s config, `accountPool.accounts`, `delivery.queuePath`). So `bootFloor` cannot be config-path-free without either injecting `electron` in the test (the `test/config-secrets.test.cjs` pattern) or adding a `setConfigRoot()`. **See §2.**

### 1.4 `hive.ts` — the five seams, measured

4,121 lines. Structure is unusually clean:

| Lines | Region | Size | Seam |
|---|---|---|---|
| 1–488 | Types, protocol-deadline constants, git/log budgets, module helpers | 488 | — |
| 489–3314 | `class HiveManager` | 2,826 | see below |
| **3315–4121** | **Module-level template string constants** — `PROTOCOL_MD`, `bin/task.cjs`, `HOOK_SHIM`, `AGY_HOOK_SHIM`, `PI_EXTENSION`, `OPENCODE_PLUGIN`, `PROXY_BRIDGE_SHIM`, `GROK_HOOK_SHIM` | **807** | **shim templates — zero coupling, pure `const … = \`…\``. Trivially extractable. Do this one first; it is 20 % of the file at zero risk.** |

In-class section markers (`grep '^  // —'`):

| Lines | Section | Size | Seam |
|---|---|---|---|
| 519–735 | paths | 217 | shared |
| 736–1389 | bootstrap (`ensureHive`, spawn args/env, MCP, per-provider installers) | 654 | **provisioning** |
| 1390–1491 | agent-facing text (roster/injected prompt) | 102 | ⚠️ **ADR-0002 prompt-cache territory** |
| 1492–1692 | messaging (`send`, `deliver`, `emitTerminalHandoff`) | 201 | **router** |
| 1693–1739 | router (`startRouter`/`stopRouter`/`routeOnce`) | 47 | **router** |
| 1740–2032 | protocol enforcement (reply deadlines, done review) | 293 | router-adjacent |
| 2033–2707 | read helpers for IPC/UI | 675 | shared |
| 2708–2785 | log | 78 | shared |
| 2786–2960 | cost ledger (RECORD-03/04) | 175 | **ledger** |
| 2961–2985 | json + atomic io | 25 | shared |
| 2986–3314 | git (single committer: debounced, off-thread, stale-lock recovery) | 329 | **git committer** |

**The hard truth about splitting `HiveManager`:** it is **one class with private state**, so the seams are *method groups*, not files. `commit()` reads `this.pendingCommits`, `this.commitTimer`, `this.committing`, `this.gitInFlight`, `this.untrackedIgnored`, `this.appendLog`. Two viable shapes:

- **(A) Composition — recommended.** `HiveManager` gains a private field `this.committer = new GitCommitter({root: () => this.root(), log: (e) => this.appendLog(e)})`, and `commit`/`flushCommit` become one-line delegations. **`flushCommit(root)` already takes `root` as an explicit argument**, so the extraction is nearly mechanical. Keeps ADR-0004's single-committer invariant structurally (only `HiveManager` owns the instance).
- **(B) Free functions** — cheaper diff, but **violates ADR-0004** the moment anything else imports them. Do not take (B).

⚠️ **ADR-0004 gate for STRUCT-02:** `.planning/phases/…/02-CONTEXT.md` names `docs/adr/0004-single-committer-git.md` as load-bearing. The git-committer extraction must not create a second committer. A repo-fact test asserting exactly one `new GitCommitter(` in `src/` is the cheap mechanical guard, in the same register as `test/net-binding.test.cjs`'s regex pin.

⚠️ **Test-API compatibility:** `test/hive-durability.test.cjs` calls `hive.flushCommit(root)` **four times** and `hive.commit` is exercised transitively by `routeOnce`. Shape (A) preserves both; shape (B) breaks four tests.

---

## §2 What a `node --test` Boot Test Can Actually Assert (D-05)

### 2.1 What CI actually gives you

`.github/workflows/ci.yml`, `test` job, all three platforms:
- `npm ci --ignore-scripts` — **no Electron binary**, no `electron-rebuild`.
- Then, deliberately, **`npm rebuild node-pty`** on every platform (with a Python 3.11 pin on Linux for `node-gyp`), because two existing test files load `src/main/pty.ts`.
- `better-sqlite3@^13` is N-API and resolves a prebuild; ci.yml's own comment says the `test` jobs **must never rebuild it**.

Verified locally on Node v24.13.0: `require('better-sqlite3')` + `new Database(':memory:')` + `exec` → OK. `require('node-pty')` → OK, `spawn` is a function.

**So a boot test may construct `PersistStore` and `PtyManager` for real on all three CI platforms.** It must not *spawn* a PTY (needs a shell, is slow, and is the e2e job's business).

### 2.2 What `bootFloor(fakeDeps)` must do

| Subsystem | Run for real against tmpdir? | Why |
|---|---|---|
| `HiveManager` + `ensureHive()` | **yes** | `test/hive-durability.test.cjs` already does exactly this. Real `git init`, real files. |
| `hive.startRouter()` / `routeOnce()` | **yes** | Proven in §3.1. `startRouter` uses a plain `setInterval`; **it is not `unref`'d** — the test must call `stopRouter()` (or `Floor.shutdown()`) or `node --test` will hang. |
| `HookServer.start()` | **yes, on both platform families** | `test/net-binding.test.cjs` already binds a **real** Unix socket on POSIX and a **real `\\.\pipe\` named pipe on win32** under plain Node, using a fake `hive` object that only supplies `sockPath()`. `sockPath()` (`hive.ts:536-545`) derives the pipe name from a sha1 of the root, so a tmpdir root gives a unique pipe per test — no collision. |
| `PersistStore` | **yes** | `constructor(private dbPath?: string)` — the override is documented "(tests)". Point it at the tmpdir. |
| `TelemetryCollector.start()` | **yes** | Plain `node:http` on loopback; already loaded by 4 test files. |
| `IntegrationBroker.start()` | **yes** | Loopback, already loaded by a test file. |
| `PtyManager` | **construct only** | No explicit constructor, pure field init — construction is free. **Never `spawn()`.** |
| `MemoryManager` / `MemoryReflector` | **construct + `start()`** | `start()` is a no-op without `mempalace`; both `spawn` children only when the binary exists. Safe, but verify on the CI runner (mempalace is absent). |
| `WebhookServer` / `SlackWebhookServer` | **do not start** in the boot test | Starting them opens a **real outbound tunnel** (D-16). `bootstrapHiveServices` does not start them; `whenReady` does, gated on config. Keep it that way: the boot test's config must have `slackEnabled:false` and zero enabled webhook endpoints. |
| `cloudflared` child | **never** | Live network. Its own targeted test (§9). |
| `analytics.init` | **must not run** in `bootFloor` | It is in `whenReady`, not `bootstrapHiveServices`. Keep it in `index.ts`. |

### 2.3 What must be injectable vs. what runs for real

**Must be injected (cannot run for real under plain Node):**
- Everything in `FloorDeps` per D-03: `paths`, `version`, `packaged`, `secrets`, `notify`, `send`, `quit`.
- **`send` must return `boolean`**, not `void` — see §1.3 item 2 and §4.1.
- **`config` paths.** Because `config.ts:500` hard-codes `app.getPath('userData')` with no override, the boot test has exactly two honest routes:
  - **(a)** seed `require.cache[require.resolve('electron')]` with `{app:{getPath:()=>userData}, safeStorage:{…}}` **before** calling `loadTs`, exactly as `test/config-secrets.test.cjs:30-45` does. Zero source change; the pattern is already in the repo and already runs on all three platforms.
  - **(b)** add `setConfigRoot(dir)` to `config.ts`. Cleaner, but it is a source change inside the gate's own dependency, which makes the gate self-referential.
  - **Recommendation: (a).** It costs nothing, uses a shipped pattern, and keeps the gate's dependency surface honest.

**Must NOT happen inside `bootFloor` (each would make the boot test lie):**
1. `process.on('uncaughtException' | 'unhandledRejection')` — swallows the failure the test exists to catch.
2. `app.on(...)` of any kind — the throw D-02 measured.
3. `initFileLogging()` — writes to a shared `md-electron-stub/logs` path, cross-contaminating parallel test files.
4. `crashReporter.start()`.
5. `app.requestSingleInstanceLock()`.
6. Any un-`unref`'d `setInterval` that `Floor.shutdown()` does not clear — `node --test` will not exit. **`hive.startRouter`'s timer is not unref'd; `delivery.start`'s is (`this.timer.unref?.()`); `armAlwaysOnBeats`'s two are not.**

### 2.4 The smallest honest `test/boot-floor.test.cjs`

```js
// 1. seed require.cache['electron'] with a per-test userData + identity safeStorage
// 2. const { bootFloor } = loadTs('src/main/floor/boot.ts');
// 3. writeConfig({ harnessHome: tmp, slackEnabled: false, webhookTriggers: [] })
// 4. const sent = []; const floor = await bootFloor({
//      paths:{userData:tmp, logs:join(tmp,'logs'), appPath:process.cwd()},
//      version:'0.0.0-test', packaged:false,
//      secrets:{available:()=>true, encrypt:(s)=>Buffer.from(s), decrypt:(b)=>b.toString()},
//      notify:()=>{}, send:(c,p)=>{ sent.push([c,p]); return true; }, quit:()=>{}
//    });
// 5. assert: the hive root exists and is a git repo   (real ensureHive)
// 6. assert: floor.hive.routeOnce() drains a hand-written outbox   (real router)
// 7. assert: a net.createConnection(floor.hive.sockPath()) is accepted (real hook server)
// 8. t.after(() => floor.shutdown())  ← SHUTDOWN_STEPS, or the process hangs
```

That is four assertions, all against real subsystems, on all three platforms, with no Electron binary. **Assertion 8 is not cleanup — it is the shutdown test** (see §3.3).

---

## §3 Test-Surface Inventory for Criterion 1's Four Named Tests

> Criterion 1 says these are tests *"that could not be written before the split."* **Two of the four claims are false at `2f29d0b`.** Verified below. This changes what the split buys, and a SUMMARY that repeats the claim unqualified would be a false claim.

### 3.1 The mail router — **WRITABLE TODAY. Proven empirically.**

I wrote and ran a throwaway probe against unmodified source:

```
routed = 1 | inbox = [ '.done', '2026-08-21T12-33-15-460Z-48897a.json' ] | .sent = [ 'm1.json' ]
```

`new HiveManager(() => tmpHome)` → `ensureHive()` → `ensureAgent(michael, {isGod:true})` → `ensureAgent(dwight)` → write `agents/michael/outbox/m1.json` → **`hive.routeOnce()` returns 1**, the message lands in `agents/dwight/inbox/`, and the source file is archived to `outbox/.sent/`. No split, no Electron, no new harness. `routeOnce()` is a **public method** (`hive.ts:1711`).

**What no test asserts today:** the string `routeOnce` and `startRouter` appear in **zero** test files (`grep -l` across `test/*.test.cjs` → empty). So the *coverage gap is real* even though the *blocker is not*. The honest framing: **this test could always have been written and simply was not.** Writing it is still correct and still valuable — but it belongs in the "no test existed" bucket, not the "the split made it possible" bucket.

### 3.2 The git committer — **ALREADY EXISTS. Four tests.**

`test/hive-durability.test.cjs` lines 243, 263, 291, 305 each build a real hive in a tmpdir and call **`await hive.flushCommit(root)` — "the real debounced commit body, driven synchronously"** — then read `git log -p` via `execFileSync`. They assert secret scrubbing, per-path scrubbing, the durable log announcement, and the documented ceiling.

**`commit()` is public (`hive.ts:3074`); `flushCommit(root)` is public and takes root explicitly.** The claim that a git-committer test "could not be written before the split" is **false today**. What is *missing* is a test of the *debounce/lock-recovery* half (`scheduleCommit`, `clearStaleLock`, `gitInFlight`) — and that is also writable today.

### 3.3 Shutdown — **GENUINELY BLOCKED. This one is real.**

`SHUTDOWN_STEPS` and `runShutdown` are **module-private consts/functions inside `index.ts`**, which cannot load. `grep -l 'SHUTDOWN_STEPS\|runShutdown'` across `test/` → nothing. Three test files mention "teardown" (`main-hardening`, `office-gl-recovery`, `runtime-forget`) but none touch the shutdown list.

After the split, the honest assertion is: **`await bootFloor(fakeDeps)` then `floor.shutdown()` leaves zero live handles** — assertable because `node --test` will not exit if a timer survives, and additionally by asserting `hive.routeOnce`'s timer is cleared and the hook socket refuses a new connection. Plus a *coverage* assertion: every subsystem `bootFloor` started appears in the shutdown list (the #34 drift `SHUTDOWN_STEPS` was created to prevent).

### 3.4 Agent lifecycle — **GENUINELY BLOCKED. This one is real.**

`spawnAgentCore`, `teardownPty` (`index.ts:739`), `finalizeWorkerWorktree`, `finalizeAgentWorktree`, `archiveOrphanedAgents`, `savePreservedWorktrees`/`loadPreservedWorktrees` are all module-private in `index.ts`. `spawnRecipes`, `worktreePaths`, `worktreeOrigins`, `worktreeBases`, `preservedWorktrees`, `ptyToAgent` are all module-private `Map`s.

`test/main-hardening.test.cjs` says so in its own header — *"src/main/index.ts itself cannot be loaded here — it imports 'electron' — so each assertion targets the pure function the handler now delegates to."* — **and states the wrong reason** (D-02). Correcting that comment is part of this phase.

The honest post-split assertion, with **no PTY spawn**: drive `teardownPty(id)` against a fake `ptyManager` and a real tmpdir git repo, and assert the worktree/scratch/registry state machine — specifically that a worktree with unintegrated work is **preserved** and enters `preservedWorktrees`, and a clean one is removed. `test/main-hardening.test.cjs` already tests `worktreeHasUnintegratedWork` in isolation; this is the composed version that was unreachable.

### 3.5 What this means for the plan

| Named test | Blocked today? | Honest wording for a plan/SUMMARY |
|---|---|---|
| Mail router | **No** | "a router test that did not exist" |
| Git committer | **No — four already exist** | "extends the four existing committer tests to the debounce/lock path" |
| Shutdown | **Yes** | "could not be written before the split" ✅ |
| Agent lifecycle | **Yes** | "could not be written before the split" ✅ |

**The split's real, honest justification is therefore: (a) shutdown + agent lifecycle become testable, (b) `hive.ts`'s five seams stop being four agents editing one 4,121-line file (D-07), and (c) `bootFloor` is what DAEMON-01 is verified against.** Not "four tests that could not be written."

---

## §4 Integration Points and Risks, Per Requirement

### 4.1 DAEMON-01 — **two headless mail gaps beyond D-11's audit**

D-11's bound (5 `webContents.send` sites, 8 renderer `setInterval`s) reproduces exactly:

- `mainWindow.webContents.send` in `src/main`: **3** — `index.ts:2571` (`hire:import`), `:2588` (`hire:error`), `:5788` (`app:closeRequested`). Sites 2571 and 2588 are **already guarded** by `mainWindow && !mainWindow.isDestroyed()`. Only 5788 is unguarded and that is D-09's deadlock. The other 28 renderer emissions go through `liveWebContents()?.send(...)` and are null-safe by construction.
- Renderer `setInterval`s in `src/renderer/src/hooks/`: **8** across `useHive.ts` (5), `useHiveTasks.ts` (2), `useTypewriter.ts` (1).

**But the audit misses two non-poller, renderer-owned drivers of autonomous work.** Both are IPC-push listeners, so a poller census cannot see them.

**Gap 1 — terminal-handoff mail dies with the window. `src/main/hive.ts:1596-1620`.**

```ts
if (t !== godId && !canReceiveInbox(reg.agents[t]?.provider)) {
  if (!this.emitTerminalHandoff(msg, t)) {
    this.deliver({ ...msg, to: godId,
      subject: `[undeliverable — "${t}" runs ${…} and the terminal handoff failed (renderer unavailable); relay this to it] ${msg.subject}` }, godId);
  }
  continue;
}
```

and at `:1671`: `const delivered = this.emit?.('hive:terminalHandoff', {…}) === true;`

With no window, `index.ts:365-372`'s emitter returns **`false`** (`const wc = liveWebContents(); if (!wc) return false;`). So `emitTerminalHandoff` returns `false` and **every message to a hookless (`canReceiveInbox:false`) or proxy-tier (`inboxDelivery:'terminal'`) agent bounces to the god.** That is qwen and crush today (`bridge.inboxDelivery === 'terminal'`), plus kimi/copilot/custom, plus anything PARITY-01a adds without a hook bridge. **DAEMON-01's criterion is "mail still routes between them." This fails it.**

The receiving half is `useHive.ts:636-661` — `onHiveTerminalHandoff` → `enqueueMessage(target.id, terminalWorkOrderPrompt(msg))`. **The fix:** move `terminalWorkOrderPrompt` (a pure function at `useHive.ts:214`) to `src/shared/`, and replace the `emit` call with `delivery.enqueue(...)`. `DeliveryService` already owns the idle gate, the boot grace, the veto, the write chain and the PTY write — it is the same queue the renderer was feeding, one hop earlier. **Cross-plan contract: this is a `hive.ts` edit AND an `index.ts`/`floor` edit AND a `useHive.ts` deletion. One owner.**

**Gap 2 — Crush never gets its protocol seed headless.**

`agentProvider.ts:452` — Crush is the **only** `seedDelivery:'type-into-tui'` provider. `hive.ts:1071` returns `{args, env, seedPrompt}` instead of putting the prompt on argv, and the seed is typed **only** by the renderer: `AddAgentModal.tsx:413` stores it, `useHive.ts:341` tracks it, and the `setInterval` at `useHive.ts:694` types it once per agent after a boot grace. Headless, a Crush agent boots with no protocol. Same fix shape: `delivery.enqueue()` after `noteSpawn`'s `BOOT_GRACE_MS`.

**What is already correct headless (verified, do not re-do):**
- **Account failover.** `index.ts:411-434`: `accountPool`'s emitter intercepts `claudeAccount:failover` *before* the renderer send and calls `delivery.failover(...)` in main, with an explicit comment that the renderer executor was removed because it died with the window. DAEMON-01's failover criterion is already met.
- **The inbox wake, the Stop drain, the quiesce backstop.** All in `delivery.ts` per FLOOR-02; `useHive.ts:665` and `:679` document the move.
- **`delivery.setVeto`** is renderer-fed but expires after `VETO_TTL_MS` (5 min) and `vetoed()` fails open — headless is correct by construction.

**D-09's deadlock, re-verified verbatim (`index.ts:5783-5790`):**
```ts
app.on('before-quit', (e) => {
  if (allowQuit) return;
  const count = ptyManager.list().length;
  if (count === 0) return;
  e.preventDefault();
  if (mainWindow) { mainWindow.focus(); mainWindow.webContents.send('app:closeRequested', { ptyCount: count }); }
});
```
With no window and ≥1 PTY: quit is prevented and nothing can confirm it. `app:confirmClose` is an `ipcMain.handle` (`:4375`) so it is renderer-only. The per-window twin at `:2807` is window-scoped and therefore harmless headless.

`app.on('window-all-closed')` at `:5792` calls `ptyManager.killAll()` + `app.quit()` on non-darwin — D-10.2 is exactly right that forgetting this gate kills the floor.

`second-instance` at `:2615` focuses `mainWindow` and does nothing when there is none — `else createWindow()` is the whole re-attach.

`app:setLoginItem` at `:4655` is `app.setLoginItemSettings({openAtLogin: enabled === true})` with **no `args`**. Adding `args:['--headless']` is the D-10.4 edit. Note the handler returns `app.getLoginItemSettings().openAtLogin`, which on Linux is always false → **the toggle will lie on Linux.** Say so; do not paper over it.

### 4.2 STRUCT ordering — a **file collision** D-06 did not catch

D-06 says plan 01-21 and the extraction are disjoint because 01-21 touches `src/main/{knowledge,nodeInstall,slack}.ts` and the extraction touches `index.ts`/`hive.ts`. **That is true for the extraction and false for the phase.** `01-21-PLAN.md`'s `files_modified` is:

`eslint.config.js` · **`package.json`** · **`package-lock.json`** · **`.github/workflows/ci.yml`** · **`test/ci-config.test.cjs`** · `src/main/knowledge.ts` · `src/main/nodeInstall.ts` · **`src/main/slack.ts`** · `src/renderer/src/ide/monaco.ts` · nine named renderer files · `src/renderer/src/**/*.{ts,tsx}`

Phase 2 collides on **five** of those:

| File | 01-21 needs it for | Phase 2 needs it for |
|---|---|---|
| `src/main/slack.ts` | deleting an orphaned `eslint-disable` | **D-15's shared tunnel helper** |
| `package.json` | adding `eslint`, `@typescript-eslint/parser`, `eslint-plugin-react-hooks`, `lint` script | **removing `tunnelmole`** |
| `package-lock.json` | same | same — **and the npm-10 constraint applies to both** |
| `.github/workflows/ci.yml` | adding `npm run lint` as a hard gate | any Phase 2 CI change (e.g. a targeted tunnel job) |
| `test/ci-config.test.cjs` | pinning the new lint gate | pinning new Phase 2 repo facts |

And 01-21 introduces **`eslint . --max-warnings 0` as a hard CI gate over `src/**`**, so every file the extraction creates under `src/main/floor/**` must pass a ruleset that does not exist yet. `01-21-PLAN.md` is `wave: 8`, `depends_on: [01-15…01-20]`, so plans 19 and 20 gate it too.

**Recommendation:** treat "01-21 merged to `main`" as a hard, checkable precondition on the Phase 2 branch — not a soft ordering note — and re-verify it with `git log --oneline main -- eslint.config.js` before wave 1 starts.

### 4.3 DAEMON-02 — the `WebhookServer` routing wall

`WebhookServer` (468 lines, **no `electron` import**) has **no path-based routing at all**:

```ts
private handleRequest(req, res) {
  if (!this.allowRequest('', RATE_LIMIT)) { json(res, 429, …); return; }   // 120 / 60 s global
  const id = readEndpointId(req);
  const endpoint = id !== null ? this.endpoints.get(id) ?? null : null;
  if (!this.allowRequest(endpoint ? endpoint.id : UNKNOWN_BUCKET, PER_ENDPOINT_RATE_LIMIT)) { json(res, 429, …); return; }  // 60 / 60 s
  if (req.method === 'GET')  { this.handleStatus(req, res, endpoint); return; }
  if (req.method === 'POST') { this.handleCreate(req, res, endpoint); return; }
  res.writeHead(405); res.end();
}
```

and `readEndpointId`:

```ts
const segments = pathname.split('/').filter((s) => s.length > 0);
if (segments.length === 0) return LEGACY_ENDPOINT_ID;
if (segments.length > 1) return null;      // ← "no such endpoint"
```

**Four consequences the plan must carry:**

1. **`/phone/index.html`, `/phone/sw.js`, `/phone/api/answer` all have >1 segment → `readEndpointId` returns `null` → 401/404.** The PWA branch must be inserted **before** `readEndpointId`, or the whole thing 401s.
2. **`phone` as a first path segment collides with the endpoint-id namespace.** Endpoint ids come from operator config; `phone` is a plausible name. **Reserve it**, refuse it in `setEndpoints`, and pin it with a repo-fact test. Nobody has named this.
3. **The static shell must answer 200 with no token, which breaks the server's no-enumeration property** (today an unknown id, a wrong secret and an unknown token are all answered identically, deliberately). A public `/phone/` route makes the origin self-identifying as a Hello MarkX floor. That is unavoidable for an installable PWA and must be **stated**, not silently accepted. It also means the phone's *auth* endpoints must keep the uniform-failure discipline even though the shell does not.
4. **The static root must be INJECTED, not resolved inside `webhook.ts`.** `resources/` is not in `electron-builder.yml`'s `files:` (only `out/**` + `package.json` + `CHANGELOG.md`), so `resources/phone/` needs an `extraResources` entry alongside `kg.cjs`/`md-slack-reply.cjs`, and the runtime path is `app.isPackaged ? join(process.resourcesPath,'phone') : <repo>/resources/phone` — the pattern at `index.ts:1803-1817` and `knowledge.ts:75-86`. **Putting `app.isPackaged` into `webhook.ts` would give it its first `electron` import and destroy the property D-23 depends on** ("free of any electron import so it unit-tests as plain Node"). Add `staticRoot?: () => string | null` to `WebhookServerOptions` and resolve it in `index.ts`/`floor`. This is the same anti-pattern the whole phase exists to fix — do not commit it in the phase that fixes it.

**Rate-limit interaction, measured:** the global bucket is `RATE_LIMIT = 120` per `RATE_WINDOW_MS = 60_000`. A PWA shell is `index.html` + `sw.js` + `manifest.webmanifest` + 2 icons + polling. **One cold load plus a 5-second visibility poll burns the global budget in minutes**, and the global bucket is shared with every Telegram/Discord/webhook caller. The phone needs its own bucket (or a raised global), and `handleStatus`'s existing 401/404 discipline must not be weakened to get it. Note also **TryCloudflare returns HTTP 429 when its own 200-in-flight cap is exceeded** — the same status this server returns — so the phone UI must not report "rate limited by your floor" when it might be the tunnel.

**Vite path (D-21's upgrade trigger):** `electron.vite.config.ts`'s `main` build has a single `input: { index: src/main/index.ts }`, so the extraction into `src/main/floor/*.ts` costs nothing at build time (rollup bundles the graph). The `renderer` build has `root: resolve(__dirname,'src/renderer')` and `input: { index: src/renderer/index.html }` — so the D-21 upgrade path means an `index.html` under **`src/renderer/`**, not `resources/`, emitted to `out/renderer/` (which *is* in `files:`). Two different packaging stories; pick one and do not half-take both.

### 4.4 DAEMON-03 — the same edit as DAEMON-02, so order them

`verifySecret` is one hardcoded shape:
```ts
const provided = req.headers['x-md-webhook-secret'];
if (typeof provided !== 'string') return false;
const equal = timingSafeEqual(sha256(provided), sha256(endpoint ? endpoint.secret : this.decoySecret));
```
D-24's per-endpoint verifier replaces this single call site with a strategy dispatch. **The PWA's auth endpoints need the same dispatch point.** So DAEMON-02 and DAEMON-03 both rewrite `handleRequest`/`verifySecret`, in `src/main/webhook.ts`, which has exactly one file. **Cross-plan contract: one owner for `webhook.ts`, both requirements in the same plan or in strictly sequential plans — never parallel.**

Discord's Ed25519 verification needs the **raw body bytes**, but `handleCreate` deliberately authenticates *before* buffering ("so an unauthenticated peer can't even make us buffer"). Discord inverts that: you must buffer (under `MAX_BODY_BYTES`) to verify. That is a real, deliberate weakening of one property for one endpoint — state it, cap it tightly, and keep it endpoint-scoped.

### 4.5 DAEMON-05 — where the shared helper lives, and who owns it

The duplication is confirmed byte-identical:

| | `slack.ts` | `webhook.ts` |
|---|---|---|
| `TUNNEL_START_TIMEOUT_MS = 10_000` | `:110` | `:126` |
| `openTunnel()` | `:211-221` | `:276-286` |
| `stop(): { tunnelStillOpen }` | `:180-190` | `:245-255` |
| The "no disposer" comment | `:158-161` | `:224-227` |
| The `[slack]`/`[webhook]` orphan warning | `:186-188` | `:251-253` |

`src/main/tunnelmole.d.ts` is a hand-written ambient declaration that dies with the import.

**Where the helper belongs: a new `src/main/tunnel.ts`, and it must have no `electron` import** — both its consumers are electron-free today and that is load-bearing for their tests (`test/slack.test.cjs`, `test/webhook-endpoints.test.cjs`). Shape:

```ts
// src/main/tunnel.ts  — no electron import
export interface TunnelHandle { url: string; stop(): void; }
export async function openTunnel(port: number, opts: { bin: string; timeoutMs?: number }): Promise<TunnelHandle>;
```
`bin` is injected (the cloudflared path is resolved in `index.ts`/`floor`, same reason as §4.3 item 4). `stop()` calls `hardKillTree(child.pid)` from `src/main/procKill.ts:34`, re-read and confirmed: `taskkill /pid X /T /F` on win32, `process.kill(-pid,'SIGKILL')` with a single-pid fallback on POSIX.

**Owner:** the tunnel helper is a **prerequisite** of the phone plan (D-18 makes the tunnel mandatory for installability), so it must land before DAEMON-02 work starts, and `slack.ts` cannot be edited by any other plan in that wave.

**Return-shape breakage:** `stop()` currently returns `{ tunnelStillOpen: string | null }`. Once the tunnel genuinely closes, that field is permanently `null` and its two consumers plus the `[slack]`/`[webhook]` console warnings become dead. Deleting them is part of the honesty work; leaving them is a doc-that-lies.

### 4.6 GSD-06 — three files, one prompt-cache hazard

| Site | File:line | Change |
|---|---|---|
| The `--q` writer | `hive.ts:3458` — `merged.humanQA = (…).concat([{ q: patch.__q, askedAt: new Date().toISOString() }])` | add `askedBy: process.env.AGENT_ID \|\| 'god'` |
| The `to:` hardcode | `AskMeTab.tsx:92` — inside the `hiveSend` after `hivePatchTask` | `to: open.askedBy ?? task.assignee ?? 'god'` |
| The unblock message | `AskMeTab.tsx:90-101` | D-39: the god is still told; be explicit about which message carries the unblock |

⚠️ **The prompt-cache hazard nobody has named.** `hive.ts:1466` — the god's injected roster prompt — contains the literal sentence *"the human's answer lands in the same entry (\"a\") AND arrives as an inbox message to you — read it, act on it, and unblock the card so work continues."* GSD-06 changes that routing, so that sentence becomes false and must change. **`docs/adr/0002-prompt-cache-invariant.md` is named load-bearing by CONTEXT.md**, and `hive.ts:1390-1491` is the agent-facing-text seam. Any GSD-06 plan touching that sentence collides with any PARITY plan touching roster/capability text in the same block. **One owner for `hive.ts:1390-1491`.**

**Back-compat is free**, as D-37 says: an entry written before the change has no `askedBy` and falls through to `task.assignee`, then `'god'` — today's behaviour exactly. Worth one test.

### 4.7 PARITY-01b — D-30 independently confirmed, with one nuance

`grep -rn 'capabilityLine|providerCapabilities' src/ test/` excluding `providerAutomation.ts` returns **only `test/engine-parity.test.cjs`** (13 hits). **`src/main` 0, `src/renderer` 0, `src/preload` 0.** D-30 is exactly right.

**The nuance the plan needs:** `canReceiveInbox` *is* consumed in the renderer — but only in two **god-engine pickers**:
- `CommandCenterPanel.tsx:959` — `AGENT_PROVIDER_PRESETS.filter((p) => canReceiveInbox(p.id))` for the **agent-restart engine `<Select>`**
- `OnboardingWizard.tsx:444` — same filter for the **god provider radio list**
- `src/renderer/src/store/config.ts:372` — `preset.supportsModel && (!isGod || preset.canReceiveInbox)`

`AddAgentModal.tsx:772` maps **all** presets, unfiltered. So the worker picker is not silently filtered, and D-31's three surfaces stand.

⚠️ **Side effect of PARITY-01a that the planner must intend:** flipping `kimi.canReceiveInbox` to `true` **automatically makes kimi eligible as the god** in both pickers above. But kimi has **no interactive initial-prompt flag** (`--prompt`/`-p` explicitly *"doesn't enter interactive mode"*), so a kimi god cannot be oriented at spawn the way every other god is. Either add a `seedDelivery:'type-into-tui'` path for kimi (which §4.1 gap 2 shows is broken headless) or explicitly keep kimi out of the god pickers. **Decide this deliberately; do not let it fall out of a one-line flag flip.**

`AddAgentModal.tsx:516-520`'s existing "safe, pre-enabled" / "⚠️ needs your consent" split is inside a `hireMeta.mcpServers` preview block, not a general consent UI — it is a **pattern to copy**, not a component to reuse.

### 4.8 PARITY-02 — the extension point is one `else if`

`hive.ts:975-1065` dispatches on `bridgeOf(meta.provider)`:
- `desc.kind === 'hooks'` → `'agy'` | `'codex'` | `'pi'` | `'opencode'` | `'grok'`
- `desc.kind === 'proxy'` → `startProxyBridge(...)`, then either `env[desc.baseUrlEnv] = loopback` or, for crush, a per-agent `CRUSH_GLOBAL_CONFIG`.

Adding proxy cost to an engine is: set `bridge: { kind:'proxy', api:'openai', baseUrlEnv:'<VAR>', inboxDelivery:'terminal' }` on its preset. **Zero code**, if the engine reads a base-URL env var. `hookBridge?: 'agy'|'codex'|'grok'` is a string union — adding `'kimi'` widens it in exactly one place (`agentProvider.ts:103`) and `bridgeOf` derives the descriptor automatically.

⚠️ **`inboxDelivery:'terminal'` is what §4.1 gap 1 breaks headless.** Any engine PARITY-02 converts to a proxy bridge **inherits the headless-mail bug**. So §4.1's fix is a hard prerequisite of PARITY-02, not a parallel workstream.

⚠️ **ADR-0005 (cumulative cost ledger):** samples are cumulative. Any new proxy-api mode must not re-introduce the summing error RECORD-03/04 fixed. `hive.ts:2786-2960` is the ledger seam.

---

## §5 DAEMON-04 — the MCP channel, LIVE-VERIFIED

**This is the phase's GATE-01-shaped item and it is now settled.**

### Method

Two stdio "servers", each a `node -e` one-liner that writes a marker file on spawn and then sleeps. One declared under `mcpServers` inside a `--settings` file (the shape `hive.ts:1192` writes today), one under `mcpServers` inside a `--mcp-config` file. Then `claude --print "reply with the single word ok"`, and check which markers exist.

### Results — `claude` **2.1.236 (Claude Code)**, Windows 11, 2026-08-21

| Run | Flags | `--settings` server spawned? | `--mcp-config` server spawned? |
|---|---|---|---|
| 1 | `--settings X --mcp-config Y --strict-mcp-config` | **NO** | **YES** |
| 2 | `--settings X` only (no strict flag) | **NO** | n/a |
| 3 | `--mcp-config Y` only (no strict flag) | n/a | **YES** |

Run 2 exists specifically to rule out `--strict-mcp-config` as the suppressor. It is not: **`mcpServers` inside a `--settings` file is ignored unconditionally.**

`claude --help` on this box confirms the flags exist verbatim: `--mcp-config <configs...>`, `--settings <file-or-json>`, `--strict-mcp-config`.

### Consequences the planner must carry

1. **`hive.ts:1188-1190`'s comment — *"Claude merges this additively"* — is FALSE.** It is a claim about behaviour that does not happen. Correcting it is part of the phase's honesty work, in the same register as D-02's `main-hardening` comment and D-12's ADR-0001.
2. **Today's default MCP bundle is a complete no-op.** `buildDefaultMcpServers` computes a correct map (`sequential-thinking`, `time`, `fetch`, … from `src/shared/mcpCatalog.ts`), `hookSettings` embeds it, `writeJson` writes it, `--settings` passes it, and **no server is ever started**. Every test around it passes.
3. **The fix is one flag, exactly as D-25 predicted.** At `hive.ts:1104-1112`:
   ```ts
   const settingsPath = join(dir, 'settings.json');
   this.writeJson(settingsPath, this.hookSettings(shim, meta.cwd, opts.mcpDefaults, opts.theme));
   args.push('--settings', settingsPath);
   // + write <dir>/mcp.json  and  args.push('--mcp-config', mcpPath)
   ```
   Run 3 proves **no interactive approval prompt** is triggered by `--mcp-config` in print mode. Whether `--strict-mcp-config` should be added is a *separate* policy call: it would suppress the operator's own `~/.claude.json` servers for hive agents. Given "agents run with bypassed permissions", **suppressing the operator's personal servers is arguably correct** — but it is a behaviour change and belongs in the plan explicitly.
4. **`claude mcp list` is NOT a valid probe.** It ignores both `--settings` and `--mcp-config` and lists the user's own configured servers. Anyone verifying this later must use the marker-file method above, or `/mcp` inside a live interactive session.
5. **Do not build per-agent MCP on top of the settings channel.** Any plan that does will pass every test and do nothing.

**The tier branch D-27 relies on is confirmed unchanged** at `hive.ts:1235`:
```ts
const consented = cfg?.[e.id]?.enabled;
const enabled = consented ?? e.defaultEnabled;
if (!enabled) continue;
if (e.tier !== 'safe-readonly' && consented !== true) continue;   // fail closed
```
Per-agent consent is a change of *where `cfg` comes from*, not new logic — exactly as D-27 says.

**`agentDir` isolation confirmed:** `hive.ts:527` `agentDir(id) = <root>/agents/<id>`, and the app already writes `<dir>/settings.json`, `<dir>/.codex/config.toml` (per-agent `CODEX_HOME`, `hive.ts:2346-2411`), `<dir>/.pi-agent/extensions/`, `<dir>/.opencode/plugin/`, and a per-agent `CRUSH_GLOBAL_CONFIG`. `<agentDir>/mcp.json` joins an established pattern.

---

## §6 The Kimi Hook Bridge (PARITY-01a) — vendor-verified, and cheaper than D-33 assumed

**Kimi Code CLI is NOT installed on this machine** (`command -v kimi` → absent; only `claude` and `codex` are present). Everything below is from Moonshot's own documentation, cited, and is therefore `[CITED]`, not `[VERIFIED]`. **A kimi bridge built now cannot be live-run — see §9.**

### 6.1 Kimi's hook surface

| Property | Value | Source |
|---|---|---|
| Config file | `~/.kimi/config.toml`, `[[hooks]]` array-of-tables, **TOML** (JSON accepted, parsed by extension) | [CITED: moonshotai.github.io/kimi-cli/en/customization/hooks.html] |
| Events (13) | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, **`Stop`**, `StopFailure`, `SessionStart`, `SessionEnd`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `Notification` | same |
| Blockable events | `PreToolUse`, `Stop`, `UserPromptSubmit` — the rest are observation-only | same |
| Hook entry fields | `event`, `command`, optional `matcher` (regex), `timeout` (**seconds**, default 30) | same |
| Input | **JSON on stdin** | same |
| Payload keys | `session_id`, `cwd`, `hook_event_name` common; `tool_name`, `tool_input`, `tool_output`, `error`, `prompt`, `reason` event-specific | same |
| Output | exit `0` = permit (stdout can add context); exit `2` = block (stderr fed to the LLM); other = allow-but-log. Structured JSON with `hookSpecificOutput` / `hookEventName` / `permissionDecision` supported | same |

### 6.2 Which existing shim it resembles — **codex, not grok**

| | Payload casing | Needs a translator? | Isolation mechanism |
|---|---|---|---|
| Claude (`HOOK_SHIM`) | snake_case | — | `--settings` per session |
| **Codex** | snake_case ("already Claude-shaped", `hive.ts:2377`) | **no — reuses `HOOK_SHIM` verbatim** | per-agent `CODEX_HOME` + seeded `config.toml` **string-appended, no TOML parser** |
| Grok (`GROK_HOOK_SHIM`) | **camelCase** (`hookEventName`, `toolName`, `toolInput`, `sessionId`) | **yes — 68 lines of key mapping** | user-global `~/.grok/hooks`, scoped by `AGENT_ID` |
| Antigravity (`AGY_HOOK_SHIM`) | `conversationId`/`toolCall{name,args}`, event via **argv** | yes | user-global `~/.gemini/**`, written twice for upstream bug #49 |
| Pi (`PI_EXTENSION`) | `pi.on(event)` JS extension | yes | per-agent `PI_CODING_AGENT_DIR` |
| OpenCode (`OPENCODE_PLUGIN`) | ESM plugin, `session.idle` | yes | per-agent `OPENCODE_CONFIG_DIR` |
| **Kimi** | **snake_case, Claude-shaped** | **probably no** | see 6.3 |

**Verdict: kimi is the codex case.** Claude-shaped snake_case payload, `hookSpecificOutput`/`permissionDecision` output vocabulary, `[[hooks]]` TOML config seeded from the user's own file. `HOOK_SHIM` is provider-agnostic on the forward path — it parses stdin JSON, stamps `agent_id` from `process.env.AGENT_ID` and `sock_token` from `process.env.HIVE_SOCK_TOKEN`, writes to `HIVE_SOCK`, echoes the response to stdout, and always `process.exit(0)`.

**The one adapter delta:** `HOOK_SHIM` always exits 0 and expresses a deny via `hookSpecificOutput.permissionDecision` in **stdout**. Kimi's documented contract says a **block is exit code 2**. If kimi does not honour the stdout-JSON deny at exit 0, `HOOK_SHIM` needs a kimi wrapper that maps `{decision:'block'}` / `{permissionDecision:'deny'}` → `process.exit(2)`. **That is one `if` at the end of a 15-line wrapper, not a new 68-line translator. Unverifiable without the CLI.**

### 6.3 **The correction that changes the cost — `kimi --config-file PATH`**

D-26's engine table says kimi is *"`~/.kimi/mcp.json` user-global only; no project scope, no `KIMI_HOME` → **unsupported per-agent**"*. **Moonshot's own CLI reference documents `--config-file PATH`: "Load configuration file (default `~/.kimi/config.toml`)"**, accepting TOML or JSON at any path, mutually exclusive with `--config STRING`. Confirmed on two independent vendor pages.

**Consequences:**
1. **Kimi IS per-agent isolatable**, by the same mechanism as `CODEX_HOME` and `CRUSH_GLOBAL_CONFIG`, using a per-invocation flag rather than an env var. `hive.ts` already has a `preArgs` array for exactly this (codex pushes `--dangerously-bypass-hook-trust` into it at `:1005`; `preArgs` is spread at `:1071-1075`).
2. **The user's global `~/.kimi/config.toml` is never mutated** — which is what D-26 disqualified kimi for.
3. **Kimi MCP becomes per-agent too**, since MCP lives in the same config file (`[mcp]` section). That is a candidate correction to D-26's scoreboard: **8 clean, 1 unverified, 2 unsupported** rather than 7/1/3. `pi` (no native MCP) and `custom` (arbitrary binary) remain unsupported.
4. **Auth caveat.** `kimi login` stores OAuth credentials **in the config file**. A `--config-file` that is not seeded from `~/.kimi/config.toml` would lose the operator's credentials. So the implementation is exactly `installCodexHooks`'s: `readFileSync(~/.kimi/config.toml)` as a **string**, append `[[hooks]]` blocks, `writeFileSync(<agentDir>/kimi-config.toml)`. **No TOML parser needed** — the house pattern already does string-append TOML (`hive.ts:2403-2406`), and there is no TOML parser in Node core or in this repo's dependencies.

### 6.4 Cost estimate

| Item | Size | Risk |
|---|---|---|
| `installKimiConfig(dir): string` in `hive.ts` (provisioning seam) | ~40 lines, modelled line-for-line on `installCodexHooks` | low |
| One `else if (desc.shim === 'kimi')` at `hive.ts:1028` + `preArgs.push('--config-file', …)` | ~3 lines | low |
| Widen `hookBridge?: 'agy'\|'codex'\|'grok'` → `+ 'kimi'` (`agentProvider.ts:103`) | 1 line | low |
| Flip `kimi.canReceiveInbox: false → true`, add `hookBridge:'kimi'`, correct the stale preset comment | ~4 lines | ⚠️ **makes kimi god-eligible — §4.7** |
| Optional `KIMI_HOOK_SHIM` (only if the exit-2 deny path is needed) | ~15 lines | unknown until live-run |
| `engine-parity` + `repo-claims` assertions | ~20 lines | low |

### 6.5 Two other kimi preset facts worth checking

- **`autoModeFlag: '--auto'`** (`agentProvider.ts:289-290`). Moonshot's documented auto-approval flags are **`--yolo` / `-y`, `--yes`, `--auto-approve`, `--afk`**. `--auto` does **not** appear in the documented flag list. `[UNVERIFIED — needs `kimi --help` on a machine with the CLI]`. If `--auto` is not an accepted alias, every kimi spawn either fails or prompts, and PARITY-01a's inbox would be delivered into a terminal that is waiting on an approval. **Check this before building the bridge; it is cheaper than the bridge.**
- **`canReceiveInbox: false` comment** — *"Kimi's interactive TUI has no positional initial-prompt form."* Consistent with the docs (`--prompt`/`-p` explicitly "doesn't enter interactive mode"), so the comment is accurate about the *positional* form. Do not "fix" it into a claim that kimi has an interactive seed flag.

---

## §7 Windows-Specific Hazards

| Hazard | Detail | Evidence |
|---|---|---|
| **`cloudflared` is not installed on this machine** | `command -v cloudflared` → absent; `winget list --id Cloudflare.cloudflared` → "No installed package found"; nothing in Downloads or Temp. Any DAEMON-05 live run requires acquiring it first. | measured 2026-08-21 |
| **No `cloudflared-windows-arm64` asset** | Confirmed against the release API for `2026.8.2`. Windows assets are `windows-386.exe/.msi` and `windows-amd64.exe/.msi` only. A Windows-on-ARM operator has no binary. | GitHub releases API |
| **Asset shapes differ per platform** | `windows-amd64.exe` **52.4 MB** bare binary · `linux-amd64` **38.0 MB** bare binary · `darwin-arm64.tgz` **18.3 MB** and `darwin-amd64.tgz` **20.1 MB** are **tarballs needing extraction**. A "download the binary" path is three different code paths, not one. | GitHub releases API |
| **Kill trees** | `procKill.hardKillTree` is `taskkill /pid X /T /F` on win32 vs `process.kill(-pid,'SIGKILL')` on POSIX. Already correct; the tunnel close is a **call**, not new code. | `src/main/procKill.ts:34-44` |
| **Named pipes vs Unix sockets** | `hive.sockPath()` returns `\\.\pipe\hello-markx-<sha1(root).slice(0,12)>` on win32 and `<root>/hooks.sock` on POSIX. The socket **watchdog is POSIX-only** (`hooks.ts:497-502`, `armSocketWatchdog` returns immediately on win32) because a pipe has no filesystem entry. `test/net-binding.test.cjs` already skips two cases on win32 for the same reason and prints why. Any boot test asserting "the hook server is listening" must connect, not stat. | `hive.ts:536`, `hooks.ts:280/497` |
| **Node version drift** | `engines: node >=20 <23`, `.nvmrc` = 22, CI `NODE_VERSION: "22"` — but **this machine runs Node v24.13.0 and npm 11.6.2**. Both natives load fine under 24, but any `npm install`/`npm ci` here will either fail the engine check or write an npm-11 lockfile. **A Phase 2 plan that touches dependencies cannot be executed on this box without first pinning Node 22 + npm 10.** | measured |
| **Windows path handling in extracted modules** | `expandTilde`'s drive-letter bug (#58) and the Codex `path.join`-into-a-URI bug (#60) are the precedent: both were **real Windows source bugs found only because Windows is a hard CI gate**. Every path built inside `src/main/floor/**` must be `join`/`isAbsolute`-based, and the `realpathSync` wrap in the tests' `tempDir` helper exists for macOS `/var`→`/private/var`. | `ci.yml` comments; `TESTING.md` |
| **`setLoginItemSettings({args})`** | `args` is Windows/macOS only; the whole call is a **no-op on Linux**, and `getLoginItemSettings().openAtLogin` will always read false there — so the UI toggle lies on Linux. State it. | D-10.4, `index.ts:4655` |
| **macOS `setActivationPolicy('accessory')`** | No Mac available. `[UNVERIFIED]` and ships marked. | D-10.5 |
| **e2e is Linux-only** | `.github/workflows/e2e.yml` runs `xvfb-run` on ubuntu only, deliberately. **There is no Windows or macOS Electron-launching runner**, so headless boot on those platforms has no automated live coverage — this is Phase 1's D-08 blind spot, inherited. | `e2e.yml` |

---

## §8 Runtime State Inventory (this is a refactor phase — required)

| Category | Items found | Action required |
|---|---|---|
| **Stored data** | `<harnessHome>/hive/` — a **live git repository** with `registry.json`, `tasks.json`, `board.md`, `log.jsonl`, `cost-ledger.jsonl`, `pending-replies.json`, `agents/<id>/{inbox,outbox,memory.md,settings.json,.codex,.pi-agent,.opencode}`. `userData/harness.db` (better-sqlite3: kv + command history + FTS5). `userData/claude-account-pool.json`. `userData/config.json` (incl. `mcpDefaults`, the consent map D-27 relocates). | **Code edit only for the extraction** — nothing about the extraction changes on-disk shapes. **DAEMON-04 needs a data migration**: D-27 drops any floor-wide `enabled:true` on a `write`/`secret` MCP entry and requires per-agent re-grant (fail closed). That is a `config.json` migration, not just new code. |
| **Live service config** | Encrypted secrets in the `integrations.ts` store (`safeStorage`-wrapped, under `userData`) — keyed by `secretRefFor(...)`. Claude account OAuth tokens. Slack signing secret + per-endpoint webhook secrets in `config.json`. | **New keys only.** `secretRefFor('mcp:<agentId>:<mcpId>')` is a new namespace; nothing existing is renamed. **Revoke must call `deleteSecret`** (D-28) or withdrawn consent leaves a live encrypted credential behind. |
| **OS-registered state** | `app.setLoginItemSettings({openAtLogin})` — a real OS login item on Windows/macOS. It is **already registered without `args`**, so an operator who enabled it before this phase has a login item that starts the app **with a window**. Adding `args:['--headless']` to the setter does **not** rewrite an existing registration. | **Re-register required.** The plan must call `setLoginItemSettings` again on upgrade (or on the first headless-enable) for existing users, or the feature silently does nothing for exactly the people who already wanted it. |
| **Secrets / env vars** | `AGENT_ID`, `HIVE_SOCK`, `HIVE_SOCK_TOKEN`, `CODEX_HOME`, `PI_CODING_AGENT_DIR`, `OPENCODE_CONFIG_DIR`, `CRUSH_GLOBAL_CONFIG`, `CRUSH_GLOBAL_DATA`, `HIVE_PROXY_SESSION`, `HIVE_AUTO_APPROVE`, `MD_SLACK_REPLY_CONFIG`, `OTEL_RESOURCE_ATTRIBUTES`, `OPENAI_BASE_URL`, and the BYOK `*_API_KEY` set. | **No renames.** The kimi bridge adds **no env var** (it uses `--config-file`). GSD-06 **reads** `AGENT_ID` — already present in every PTY env (`hive.ts:936-940` → `pty.ts:731`). |
| **Build artifacts** | `out/main/index.js`, `out/preload/index.js`, `out/renderer/**` — regenerated by `npm run build`. `out/main/{slack-trigger,kg-core}.cjs` copied by the `copyMainSidecars` vite plugin (which **throws** if a copy is missing or empty). `node_modules/{node-pty,better-sqlite3}` built for whichever ABI last ran. | **Rebuild.** Removing `tunnelmole` changes `node_modules` and the lockfile. Adding `resources/phone/` requires an `extraResources` entry or the packaged app serves 404s while dev works — **the exact `docs/logo.png` failure mode #52, which `test/build-assets.test.cjs` exists to catch.** Extend that test to the phone assets. |
| **Repo hygiene (not runtime, but will bite)** | Untracked at research time: **`psl.dat` (333 KB, a Public Suffix List dump from the discuss-phase)**, `e2e/p18-diag.spec.ts`, `e2e/p18-probe.spec.ts`. | Delete or ignore before any Phase 2 commit. `psl.dat` in particular would be an accidental 333 KB binary blob in a public repo. |

---

## §9 Validation Architecture

> `.planning/config.json` → `workflow.nyquist_validation: true`. This section is consumed to build VALIDATION.md.

### Test framework

| Property | Value |
|---|---|
| Framework | **`node --test`** (Node built-in) over `test/*.test.cjs` + `node:assert/strict`. No Jest/Vitest/Mocha, no config file. |
| Loader | `test/load-ts.cjs` — `ts.transpileModule` + a `require` shim + `@shared/` resolution + an `electron` stub, with `require.cache` injection winning over the stub. |
| Quick run | `node --test test/<file>.test.cjs` (single file, ms) |
| Full suite | `npm test` → `node --test test/*.test.cjs` — **515 tests, 18.5 s** |
| ⚠️ Never a gate | `npm run test:focused` — a hand-listed 33-file subset; `CONTRIBUTING.md` forbids gating on it (#7) |
| Shell gotcha | `node --test test/` does **not** work. Use the exact `test/*.test.cjs` glob. |
| E2E | Playwright over real Electron, **separate workflow**, **Linux/xvfb only**, `workers:1 retries:0`, one flow (onboarding → first spawn, stub CLI binary). |
| Coverage | Not measured. No c8/nyc, no numeric gate. |

### Phase requirements → test map

| Req | Behaviour to prove | Type | Command | Exists? |
|---|---|---|---|---|
| STRUCT-01 | `bootFloor(fakeDeps)` boots a real floor with no Electron binary | unit | `node --test test/boot-floor.test.cjs` | ❌ **Wave 0** |
| STRUCT-01 | `floor.shutdown()` leaves zero live handles, and every started subsystem is in the list | unit | same file | ❌ **Wave 0** |
| STRUCT-01 | agent lifecycle: `teardownPty` preserves a worktree with unintegrated work, removes a clean one | unit | `node --test test/agent-lifecycle.test.cjs` | ❌ **Wave 0** |
| STRUCT-01 | no module-scope `new X(` and no `process.on(` under `src/main/floor/**` | repo-fact | `node --test test/repo-claims.test.cjs` | ⚠️ extend |
| STRUCT-01 | all 153 IPC channel names still registered | repo-fact | `test/repo-claims.test.cjs` (grep `ipcMain.handle('…'` and compare to a committed list) | ❌ **Wave 0** |
| STRUCT-02 | `routeOnce` drains an outbox into an inbox and archives the source | unit | `node --test test/hive-router.test.cjs` | ❌ (writable today — §3.1) |
| STRUCT-02 | exactly one git committer instance in `src/` (ADR-0004) | repo-fact | `test/repo-claims.test.cjs` | ❌ **Wave 0** |
| STRUCT-02 | the four existing committer tests still pass after the split | unit | `node --test test/hive-durability.test.cjs` | ✅ exists |
| DAEMON-01 | a headless floor with live PTYs **quits** | unit | boot test: fake `ptyManager.list()` non-empty, `quit()` dep is called | ❌ **Wave 0** |
| DAEMON-01 | mail to a hookless/proxy-tier agent is **enqueued in main**, not bounced to the god, with no renderer | unit | `test/hive-router.test.cjs` — `emit` returns `false`, assert `delivery.enqueue` was called and **no** `[undeliverable …]` bounce | ❌ **Wave 0 — §4.1 gap 1** |
| DAEMON-01 | a Crush agent's protocol seed is enqueued by main | unit | `test/delivery-main.test.cjs` extension | ❌ **Wave 0 — §4.1 gap 2** |
| DAEMON-01 | `window-all-closed` does not kill the floor in headless mode | repo-fact or unit | grep-pin + a unit test on the extracted predicate | ❌ Wave 0 |
| DAEMON-01 | **live**: the floor runs with no window, agents spawn, mail moves, failover completes | ⚠️ **live run only** | operator, `--headless`, no CI coverage on win/mac | — |
| DAEMON-02 | `/phone/*` is served, `phone` is a reserved endpoint id, an unknown id still 401s identically | unit | `node --test test/webhook-endpoints.test.cjs` (extend) | ⚠️ extend |
| DAEMON-02 | the enrollment token is single-use; a replayed QR fails | unit | same | ❌ Wave 0 |
| DAEMON-02 | the phone assets are committed and resolvable in dev and packaged | repo-fact | `test/build-assets.test.cjs` (extend) | ⚠️ extend |
| DAEMON-02 | **live**: installs to an Android home screen as a WebAPK, push arrives while asleep | ⚠️ **operator device only** | — | — |
| DAEMON-03 | Telegram header compare is constant-time and no-enumeration | unit | `test/webhook-endpoints.test.cjs` | ❌ Wave 0 |
| DAEMON-03 | Discord Ed25519 accepts a valid signature and rejects a tampered body | unit | same, using local `generateKeyPairSync('ed25519')` | ❌ Wave 0 |
| DAEMON-03 | **live**: a real Telegram/Discord message reaches the intended agent | ⚠️ **needs a bot token** | — | — |
| DAEMON-04 | `<agentDir>/mcp.json` is written and `--mcp-config` is on the spawn argv | unit | `node --test test/hive-hook-node.test.cjs` or a new `mcp-per-agent.test.cjs` | ❌ Wave 0 |
| DAEMON-04 | a `write`/`secret` server without explicit per-agent consent is **not** written (fail closed) | unit | same | ⚠️ the floor-wide version exists |
| DAEMON-04 | revoke calls `deleteSecret` | unit | same | ❌ Wave 0 |
| DAEMON-04 | **live**: `/mcp` inside a spawned agent lists the granted server | ⚠️ **live run** — but the **marker-file method in §5 is a valid automated substitute** and costs one tiny `--print` turn | — |
| DAEMON-05 | the shared tunnel helper is used by both servers and neither retains an `openTunnel` body | repo-fact | `test/repo-claims.test.cjs` | ❌ Wave 0 |
| DAEMON-05 | `stop()` calls `hardKillTree` with the child's pid | unit | `node --test test/tunnel.test.cjs` with an injected fake spawner | ❌ Wave 0 |
| DAEMON-05 | the tunnel is off by default and never enabled as a side effect | repo-fact + unit | grep-pin on the config default + a boot test assertion | ❌ Wave 0 |
| DAEMON-05 | **live**: the public URL 200s, then after `stop()` polls to non-200 with changed body inside 15 s | ⚠️ **live network + cloudflared binary**, a **targeted** test, NOT in `npm test` | ❌ — see below |
| GSD-06 | `--q` records `askedBy` from `AGENT_ID` | unit | `node --test test/hive-task-mutation.test.cjs` (extend) | ⚠️ extend |
| GSD-06 | an entry with no `askedBy` falls through to assignee, then god | unit | same | ❌ Wave 0 |
| GSD-06 | the god is still informed (D-39) | unit | same | ❌ Wave 0 |
| PARITY-01a | kimi resolves to `{kind:'hooks', shim:'kimi'}` and the spawn argv carries `--config-file <agentDir>/…` | unit | `node --test test/engine-parity.test.cjs` (extend) | ⚠️ extend |
| PARITY-01a | the generated kimi config **seeds from** the user's own file (auth survives) | unit | same, against a tmp `HOME` | ❌ Wave 0 |
| PARITY-01b | `capabilityLine` has ≥1 production consumer | repo-fact | `test/repo-claims.test.cjs` — grep `src/renderer` for the import | ❌ **Wave 0 — this is the honest gate for D-30** |
| PARITY-02 | each engine's `bridge`/`costTracking` matches what the spawn path actually wires | unit | `test/engine-parity.test.cjs` | ⚠️ extend |
| PARITY-03 | the `LIVE-UNVERIFIED` marker count in `src/main/hive.ts` matches a committed expected number | repo-fact | `test/repo-claims.test.cjs` — **the one-directional guard: unmarking requires editing the expected count, which forces a reviewer to ask "against which account?"** | ❌ **Wave 0** |

### Sampling rate

- **Per task commit:** the single affected `node --test test/<file>.test.cjs` (ms) + `npm run typecheck` (exit 0).
- **Per wave merge:** `npm test` (full, 515+, 18.5 s) + `npm run typecheck` + `npm run build`. After 01-21 lands, **also `npm run lint`** (`--max-warnings 0`).
- **Phase gate:** all three CI platforms green (no `continue-on-error` anywhere in the `test` matrix) + the e2e workflow green + every live-run item below either executed or explicitly recorded as unavailable.

### What can only be proven by a live run

| Item | Why | Honest outcome if not run |
|---|---|---|
| Headless floor: spawn + mail + failover with no window | Needs a real Electron process, real PTYs, real agent CLIs | **Not a pass.** DAEMON-01's criterion 2 explicitly asks for both the `node --test` case *and* a live run. |
| The cloudflared close (D-16) | Real outbound tunnel, ~7 s 502→530 transient, ~15 s poll window | A targeted test that is **skipped offline** and whose skip is announced (the `test/net-binding.test.cjs` pattern: `console.error('[…] case skipped — <reason>')`). Never a silent skip. |
| A multi-hour cloudflared soak | Cloudflare gives **no SLA or uptime guarantee**; quick tunnels are "testing and development only". Only ~30 s was ever verified. | Deferred by CONTEXT.md; record the ceiling. |
| macOS `setActivationPolicy('accessory')` | No Mac | `UNVERIFIED — needs a macOS machine`. Ships marked. |
| Linux login-item behaviour | `setLoginItemSettings` is a no-op on Linux | State it in source, docs and UI. |

### What genuinely cannot be verified without an operator-supplied device or account

| Item | What is needed | Current status |
|---|---|---|
| **DAEMON-02: WebAPK install, `display:standalone`, Web Push while asleep** | **A physical Android phone on the network.** Nothing in the phone research was tested on a real device. | The requirement itself names the fallback: *"a localhost-verified auth path is the honest fallback."* Record it as such — never as completion. |
| **DAEMON-03 live: Telegram / Discord** | A bot token and a Discord application public key | Localhost-verified verifier round trips are the automated half; the live half is operator-supplied. |
| **PARITY-03: pi, opencode, crush, qwen** | A real paid account per engine. **None of these four CLIs is installed on this machine** (`command -v` → absent for kimi, grok, agy, qwen, crush, opencode, pi, copilot; only `claude` and `codex` are present). | **All four stay `LIVE-UNVERIFIED`.** Under the zero-recurring-cost rule this is the expected outcome. A plan that schedules "verify the four bridges" without an operator-supplied account is scheduling a lie. |
| **PARITY-01a: the kimi bridge** | Kimi Code CLI + a Moonshot account | ⚠️ **A kimi bridge built now makes it FIVE `LIVE-UNVERIFIED` bridges, not three.** `LIVE-UNVERIFIED` appears **8 times** in `src/main/hive.ts` today (`:1014`, `:1024`, `:2422`, `:2449`, `:2458`, `:2483`, `:3747`, `:3788`); kimi adds more. **PARITY-01a and PARITY-03 pull in opposite directions and the plan must say so out loud.** Building the bridge is still correct — an unverified inbox beats a bounce — but the SUMMARY must not read as if parity improved without qualification. |
| **DAEMON-04 live `/mcp`** | A live interactive Claude session | **Substitutable.** The marker-file method in §5 proves server *spawn* for one tiny `--print` turn and is reproducible in CI-less form on any machine with `claude`. |

---

## Architecture Patterns

### System architecture — where a message goes, headless

```
outbox file ──► HiveManager.routeOnce()  (main, 1.5 s poll)
                      │
                      ├─ canReceiveInbox(target) && bridge.kind === 'hooks'
                      │        └─► write agents/<id>/inbox/*.json
                      │                  └─► agent's Stop hook → HIVE_SOCK (uds/pipe)
                      │                        └─► HookServer.handle → delivery.drainAtStop
                      │                              └─► ptyManager.write (THE one gate, ADR-0001)
                      │
                      ├─ !canReceiveInbox(target)  OR  bridge.inboxDelivery === 'terminal'
                      │        │
                      │        ├─ TODAY: hive.emit('hive:terminalHandoff') ──► renderer
                      │        │           └─ NO WINDOW ⇒ returns false
                      │        │                └─► BOUNCE to god  ◄── §4.1 GAP 1
                      │        │
                      │        └─ REQUIRED: delivery.enqueue({to, text: terminalWorkOrderPrompt(msg)})
                      │                     └─► idle gate + boot grace + veto + write chain
                      │                           └─► ptyManager.write
                      │
                      └─ unknown id ──► bounce to god (correct, keep)

failover:  telemetry.onApiError ─► accountPool ─► emit('claudeAccount:failover')
                                        └─ INTERCEPTED in main ─► delivery.failover()   ✅ already headless
```

### The boot/teardown pair that already exists

```
whenReady (index.ts:5679)                    SHUTDOWN_STEPS (index.ts:4340) — the exact inverse
  initFileLogging                              clearMissionTimers
  analytics.init                               clearContextTimers
  persist.open                                 stopWebhookDoneObserver
  accountPool.load                             stopWorkerWatcher
  initAutoUpdater                              broker.stop
  bootstrapHiveServices()  ◄── bootFloor       hive.stopRouter
    ensureHive                                 hookServer.stop
    loadPreservedWorktrees                     telemetry.stop
    control.replaceAutoDeliveryPauses          slack.stop
    archiveOrphanedAgents                      webhook.stop
    hive.startRouter                           memory.stop
    startEphemeralWorkerWatcher                reflector.stop
    integrationBroker.start                    delivery.stop
    ensureDefaultMissions / syncMissions        hive.stopAllProxyBridges
    syncContextTriggers                        persist.close
    startWebhookDoneObserver                   ptyManager.killAll
    hookServer.start
    telemetry.start
    memory.start / reflector.start
    delivery.start
    adoptRendererQueues
    armAlwaysOnBeats
  powerMonitor.on(...)                         ← stays in index.ts
  installAppMenu / createWindow                ← stays in index.ts
  startSlackServer / startWebhookServer        ← config-gated; NOT in bootFloor
```

**`bootFloor` = `bootstrapHiveServices()` plus the 30 constructions. `Floor.shutdown()` = `runShutdown()`.** The seam D-04 asks for is not something to design — it is already written in two places and just needs to be lifted.

### Established patterns to follow, not reinvent

- **Dependency-injection objects of plain functions.** `DeliveryDeps` (`delivery.ts:94-162`) is the model: 18 fields, every one a function, with comments that already reason about "a renderer that may not exist" and "has to work with the window closed". `FloorDeps` should look exactly like it — including `send` returning `boolean` (see §1.3).
- **Per-agent config isolation under `agentDir`.** `CODEX_HOME`, `PI_CODING_AGENT_DIR`, `OPENCODE_CONFIG_DIR`, `CRUSH_GLOBAL_CONFIG`. `<agentDir>/mcp.json` and `<agentDir>/kimi-config.toml` join it.
- **Seed-and-append config, no parser.** `installCodexHooks` reads the user's `config.toml` as a string and appends TOML blocks. Kimi is the same shape.
- **Repo-fact tests.** `test/ci-config.test.cjs` (295 lines), `test/repo-claims.test.cjs` (462 lines, an explicit accumulator with "one owner per wave"), `test/engine-parity.test.cjs` (772 lines). **`repo-claims.test.cjs` is a cross-plan write hotspot — with `use_worktrees:false` it can have exactly one owner per wave.**
- **Announced skips.** `test/net-binding.test.cjs` prints `console.error('[net-binding] … case skipped — a win32 named pipe has no file to rm')`. A silent skip is a test that does not exist.

### Anti-patterns to avoid

- **Moving 3,000 lines into new files that still construct singletons at import time.** Passes a line-count gate, buys nothing (D-02).
- **Adding `electron` to `webhook.ts`, `slack.ts`, `delivery.ts`, `hooks.ts` or `hive.ts`.** These are electron-free *on purpose* and that is why they are tested. The phone's static root and the tunnel's binary path must be **injected**.
- **Free-function git committer.** Violates ADR-0004 the moment a second caller appears.
- **`process.on('uncaughtException')` inside `src/main/floor/**`.** Makes the boot test green on a crash.
- **A `deps.send` typed `void`.** Silently inverts `emitTerminalHandoff`'s and `accountPool`'s branch logic.
- **Unmarking a `LIVE-UNVERIFIED` bridge because its tests pass.** The marker is about a real account, not a test.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Killing the tunnel child on Windows and POSIX | A per-platform kill in `tunnel.ts` | `procKill.hardKillTree(pid)` (`procKill.ts:34`) | Already handles `/T /F`, group-SIGKILL, dead-leader orphan reaping, and is unit-tested (`test/proc-kill.test.cjs`) |
| Encrypting an MCP server's API key | A second secret store | `integrations.ts` `setSecret`/`hasSecret`/`deleteSecret`/`deleteSecretsWithPrefix` + `secretRefFor` | `safeStorage`-backed, fail-closed, renderer sees only a boolean (D-28) |
| An HTTP surface for the phone | A second server | `WebhookServer` — constant-time compare, uniform 401/404, body cap, dual-bucket rate limits, 192-bit capability tokens, 127.0.0.1-only bind | D-23; a second trust boundary is a second thing to get wrong |
| Typing a message into an agent's terminal | Anything that writes to a PTY | `delivery.enqueue()` | ADR-0001: exactly one gate. `delivery` owns the idle check, boot grace, veto, write chain and Enter-retry |
| Verifying a Discord Ed25519 signature | A crypto library | `node:crypto` `verify` | D-24 measured a native round trip; zero deps |
| Web Push encryption | `web-push` | `node:crypto` (`generateKeyPairSync('ec')`, `diffieHellman`, `hkdfSync`, `createCipheriv('aes-128-gcm')`, `sign(…,{dsaEncoding:'ieee-p1363'})`) | D-22; all present on `node >=20 <23` |
| Parsing/merging the operator's kimi TOML | A TOML parser dependency | String-append, exactly as `installCodexHooks` (`hive.ts:2398-2408`) | No TOML parser in Node core or in this repo; the house pattern already works |
| A per-session bridge translator for kimi | A `KIMI_HOOK_SHIM` mirroring `GROK_HOOK_SHIM` | `HOOK_SHIM` verbatim (the codex path) | Kimi's payload is Claude-shaped snake_case; only the deny-exit-code may need a 15-line wrapper |
| An idle/quiescence backstop for a new engine | A renderer poller | `delivery.ts`'s `quiesce()` | Already reads `lastOutputAt`, honours the breaker pin and boot grace, and works with the window closed |

**Key insight:** almost everything this phase needs already exists in this repo one layer down and is already tested. The failure mode here is not "we lack a library" — it is "we built it in the renderer" (mail handoff, Crush seed, failover-before-#5) or "we wrote it twice" (`openTunnel`) or "we wired it to a channel that does nothing" (`mcpServers` in `--settings`, `capabilityLine`).

---

## Common Pitfalls

### Pitfall 1: A feature whose tests all pass and whose effect is nil
**What goes wrong:** `mcpServers` in `--settings` (proven, §5) and `capabilityLine` (proven, §4.7). Both have green tests and zero runtime effect.
**Why it happens:** the test asserts the *value produced*, never that anything *consumes* it.
**How to avoid:** for every new channel this phase adds, land a **repo-fact test that a production consumer exists** — a grep for the import in `src/main` or `src/renderer`, not just an assertion on the pure function's output.
**Warning sign:** a test file is the only importer of a `src/shared` export.

### Pitfall 2: The extraction lands, and the boot test proves less than it looks like
**What goes wrong:** `bootFloor` installs `process.on('uncaughtException')`, or a subsystem swallows its own start failure (`telemetry.start()` and `integrationBroker.start()` both log-and-continue by design), so `await bootFloor(...)` resolves with half the floor dead.
**How to avoid:** `bootFloor` returns a `Floor` whose fields are the started subsystems, and the test asserts **observable liveness** — the hook socket accepts a connection, the router drains a real file, the hive root is a git repo — not that the promise resolved.
**Warning sign:** the boot test has no `assert` beyond "did not throw".

### Pitfall 3: `node --test` hangs after the boot test
**What goes wrong:** `hive.startRouter()`'s `setInterval` is **not** `unref`'d, and neither are `armAlwaysOnBeats`'s two timers. `delivery.start()`'s is.
**How to avoid:** `t.after(() => floor.shutdown())`, and treat the hang as the shutdown test failing.
**Warning sign:** the suite passes locally and times out in CI, or vice versa.

### Pitfall 4: The phone works in dev and 404s in the packaged app
**What goes wrong:** `resources/` is not in `electron-builder.yml`'s `files:`. This is **exactly #52** (`docs/logo.png` imported but never committed, killing the renderer bundle on every fresh clone), which `test/build-assets.test.cjs` was written to catch.
**How to avoid:** add the `extraResources` entry in the same commit as the assets, and extend `test/build-assets.test.cjs`.
**Warning sign:** the plan mentions `resources/phone/` but not `electron-builder.yml`.

### Pitfall 5: The PWA route silently 401s
**What goes wrong:** `readEndpointId` returns `null` for any path with more than one segment, and `null` is answered identically to a wrong secret. `/phone/index.html` is two segments.
**How to avoid:** branch on the path **before** `readEndpointId`, and reserve `phone` in `setEndpoints`.
**Warning sign:** the diff adds a `case '/phone'` inside `handleStatus`.

### Pitfall 6: The lockfile is written by npm 11
**What goes wrong:** this machine has npm 11.6.2 and no npm 10. Removing `tunnelmole` rewrites `package-lock.json`.
**How to avoid:** make "npm 10 available" a checked precondition of any dependency-touching task, not a note.
**Warning sign:** a `package-lock.json` diff in a commit whose message does not mention the npm version used.

### Pitfall 7: Headless is declared done because the boot test is green
**What goes wrong:** the boot test proves construction. It does not prove that mail to a Crush agent moves, because that path is `emit → renderer` (§4.1).
**How to avoid:** the DAEMON-01 test list must include the two gap tests explicitly, and the live run is not optional (criterion 2 asks for both).
**Warning sign:** a SUMMARY that cites `test/boot-floor.test.cjs` as evidence for "mail moves headless".

### Pitfall 8: Parity gets *worse* in the honesty ledger while the code gets better
**What goes wrong:** PARITY-01a's kimi bridge is built without a Moonshot account, adding `LIVE-UNVERIFIED` markers. The engine count of "bridges never run against a real account" goes from 4 to 5.
**How to avoid:** say it in the plan and in the SUMMARY. The bridge is still the right build; the ledger entry is still honest.
**Warning sign:** a SUMMARY that says "kimi now has an inbox" without "and it has never been run".

### Pitfall 9: Re-running a stale ordering assumption
**What goes wrong:** D-06 says 01-21 and the extraction are disjoint. They are — but the **phase** is not: 01-21 owns `src/main/slack.ts`, `package.json`, `package-lock.json`, `ci.yml` and `test/ci-config.test.cjs` (§4.2).
**How to avoid:** verify 01-21 is merged to `main` before wave 1, with a command.

---

## Code Examples

### The measured MCP defect and its fix
```ts
// src/main/hive.ts:1104-1112 — TODAY
const settingsPath = join(dir, 'settings.json');
this.writeJson(settingsPath, this.hookSettings(shim, meta.cwd, opts.mcpDefaults, opts.theme));
args.push('--settings', settingsPath);
// hookSettings embeds  ...(Object.keys(mcpServers).length ? { mcpServers } : {})
// with the comment "Claude merges this additively"  ← FALSE, measured 2026-08-21

// THE FIX — one flag. Live-verified to spawn the server, no approval prompt.
const mcpPath = join(dir, 'mcp.json');
this.writeJson(mcpPath, { mcpServers: this.buildAgentMcpServers(meta.id, meta.cwd, cfg) });
if (Object.keys(...).length) args.push('--mcp-config', mcpPath);
```

### The headless mail bounce, verbatim from source
```ts
// src/main/hive.ts:1671
const delivered = this.emit?.('hive:terminalHandoff', {…}) === true;
// src/main/index.ts:365-372 — the emitter
const hive = new HiveManager(() => readConfig().harnessHome, (channel, payload) => {
  const wc = liveWebContents();
  if (!wc) return false;                       // ← no window ⇒ false ⇒ bounce
  try { wc.send(channel, payload); return true; } catch { return false; }
});
```

### The seed-and-append TOML pattern the kimi bridge copies
```ts
// src/main/hive.ts:2398-2408 (installCodexHooks) — no TOML parser anywhere
let config = existsSync(join(userHome, 'config.toml'))
  ? readFileSync(join(userHome, 'config.toml'), 'utf8') : '';
for (const ev of events) {
  config += `\n[[hooks.${ev}]]\n[[hooks.${ev}.hooks]]\ntype = "command"\ncommand = '${this.nodeRunUnquoted(shim)}'\ntimeout = 30\n`;
}
writeFileSync(join(home, 'config.toml'), config, 'utf8');

// kimi equivalent — flat [[hooks]] with an `event` key, per Moonshot's docs
// config += `\n[[hooks]]\nevent = "Stop"\ncommand = '${nodeRunUnquoted(shim)}'\ntimeout = 30\n`;
// then: preArgs.push('--config-file', join(dir, 'kimi-config.toml'));
```

### The require.cache injection a boot test needs (existing pattern)
```js
// test/config-secrets.test.cjs:30-45 — seed BEFORE loadTs
let userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-cfg-'));
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: {
  app: { getPath: () => userData },
  safeStorage: { isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(`enc:${s}`, 'utf8'),
    decryptString: (b) => b.toString('utf8').replace(/^enc:/, '') }
}};
```

### The real-socket assertion, on both platform families (existing pattern)
```js
// test/net-binding.test.cjs:112-144 — this is how "the hook server is listening" is proven
const sock = process.platform === 'win32'
  ? `\\\\.\\pipe\\md-net-binding-${randomBytes(6).toString('hex')}`
  : path.join(root, 'hooks.sock');
const server = new HookServer({ sockPath: () => sock, /* … */ });
const c = net.createConnection(sock, () => c.end(JSON.stringify(payload) + '\n'));
```

---

## State of the Art

| Old approach | Current approach | When changed | Impact on this phase |
|---|---|---|---|
| `mcpServers` in a Claude `--settings` file | `--mcp-config <file>` (+ optional `--strict-mcp-config`) | Claude Code ≤2.1.236 documents `mcpServers` only under `~/.claude.json` / `.mcp.json` | **The whole of DAEMON-04.** Measured, §5 |
| PWA installability requires a service worker | Chrome dropped that on mobile in **108**; the **secure-origin** rule is unchanged, and SW is still required for **push** | Chrome 108 | D-18/D-22 unchanged; note the nuance in any doc claim |
| `tunnelmole` as a library | `cloudflared` as a child process | This phase (D-14) | The OS process handle is the disposer the library never exposed |
| `better-sqlite3` blocks plain-Node tests | N-API prebuilds since 13.x — loads under Node 24 (measured) | `better-sqlite3` 13.x | ⚠️ `test/config-secrets.test.cjs:46-57`'s `FakeDatabase` comment — *"built for Electron's ABI and cannot load under plain Node"* — **is now stale**, exactly like `main-hardening.test.cjs:5-7`. A candidate for this phase's honesty sweep. |
| Renderer owns the drain, the idle backstop, the inbox wake, the failover | All in `src/main/delivery.ts` (FLOOR-02 / #5) | Phase 1 | The pattern §4.1's two gaps must follow |

**Deprecated / outdated claims this phase inherits:**
- `docs/adr/0001-one-gate-for-pty-writes.md` names `useHive.ts` effect #4 — moved to `delivery.ts:518` (D-12). Unowned by any Phase 1 plan.
- `test/main-hardening.test.cjs:5-7` — wrong reason (D-02).
- `test/config-secrets.test.cjs:46-57` — stale `better-sqlite3` ABI claim (new; not in CONTEXT.md).
- `hive.ts:1188-1190` — "Claude merges this additively" (new; now **disproven**, not merely unverified).
- `README.md:59-63` — an engine-limitation table describing a UI channel that renders nowhere (D-30).
- `agentProvider.ts:289` — `autoModeFlag: '--auto'` for kimi is not in Moonshot's documented flag list (new; `[UNVERIFIED]`).
- `.planning/codebase/TESTING.md` — says 55 test files / 423 tests; it is now **59 files / 515 tests**.

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | Kimi's hook payload is Claude-shaped enough that `HOOK_SHIM` works verbatim | §6.2 | A `KIMI_HOOK_SHIM` translator is needed (~15–70 lines). Bounded, not fatal. |
| A2 | Kimi honours a stdout `hookSpecificOutput.permissionDecision: 'deny'` at exit 0, or exit 2 is required | §6.2 | The PreToolUse gate silently allows for kimi agents — a **security-relevant** gap. Must be live-run before the bridge is described as gating anything. |
| A3 | `kimi --config-file` fully replaces (rather than merges with) `~/.kimi/config.toml` | §6.3 | If it merges, seeding is unnecessary (cheaper). If it replaces and we do not seed, **the operator's OAuth login is lost for hive agents**. Seeding is the safe assumption. |
| A4 | `kimi`'s `autoModeFlag: '--auto'` is a valid alias | §6.5 | Every kimi spawn prompts or fails. Cheap to check with the CLI. |
| A5 | A `--mcp-config` server survives beyond `--print` mode into an interactive TUI session | §5 | The whole feature works only in headless print mode. The marker test used `--print`; interactive should be spot-checked. |
| A6 | `MemoryManager.start()` / `MemoryReflector.start()` are safe no-ops on a CI runner with no `mempalace` binary | §2.2 | The boot test spawns a child or throws on Linux CI. Verify on the first CI run. |
| A7 | Antigravity's per-agent MCP (`.agents/mcp_config.json`) is read | D-26 (inherited) | Already marked `UNVERIFIED` by D-26 with an open upstream issue. Unchanged. |
| A8 | The e2e Playwright smoke test still passes after the extraction | §9 | The extraction touches the boot path the smoke test drives. Run `npm run e2e` before the gate is called green — it is **not** part of `npm test`. |

---

## Open Questions

1. **Does `--strict-mcp-config` belong on hive spawns?**
   - Known: `--mcp-config` alone works and needs no approval (measured). `--strict-mcp-config` suppresses everything except `--mcp-config`.
   - Unclear: whether suppressing the operator's own `~/.claude.json` servers for hive agents is desired.
   - Recommendation: **add it.** Agents run with bypassed permissions; inheriting the operator's personal MCP servers into an LLM-controlled shell is a capability leak nobody consented to. But make it an explicit decision in the plan, with the reasoning in the source comment.

2. **Which of the three PARITY-01b surfaces, and does `capabilityLine` need a platform parameter?**
   - Known: `AgentCard.tsx` is 433 lines, `AddAgentModal.tsx` 1,101, `CommandCenterPanel.tsx` 1,690. Phase 1's D-40 left "platform argument vs `remote` bit" to the planner and its premise (that `capabilityLine` renders) is false.
   - Recommendation: do `AgentCard.tsx` first — it is the smallest file, it is the requirement's literal wording, and it is what makes the D-30 repo-fact test go green. Then `AddAgentModal.tsx`. Leave the dispatch box for last; D-31 shows it is prose, not a picker.

3. **Bundle or download `cloudflared`?**
   - Known: win-amd64 **52.4 MB** bare `.exe`; linux-amd64 **38.0 MB** bare; darwin arm64/amd64 are **`.tgz` needing extraction**; **no windows-arm64 asset**; **no publisher checksum file**, but the GitHub API supplies `assets[].digest`.
   - Recommendation: **download on first enable, from a pinned release tag, verified against a SHA-256 committed to the repo, with the macOS tarball extraction handled explicitly.** Bundling triples the mac path's complexity (two tarballs) for a feature that is off by default, and #57's lesson is about verification, not about bundling. Either way, Windows-on-ARM must fail with a stated reason, not silently.

4. **Does making kimi god-eligible break onboarding?** — §4.7. Needs a deliberate answer before the preset flip.

5. **Where does the phone's rate-limit bucket live without weakening the uniform-failure property?** — §4.3. The global bucket is 120/60 s and shared with every webhook caller.

6. **Should `hive.startRouter`'s timer be `unref`'d?** — it is the only one of the three non-`unref`'d intervals that a headless floor genuinely needs to keep the process alive for… except a headless Electron process stays alive on `app` alone (D-08 measured it). Unref-ing all three makes the boot test simpler and changes nothing at runtime. Worth one line and a comment.

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| Node | everything | ✓ | **v24.13.0** — ⚠️ outside `engines: >=20 <23` | Install Node 22 (`.nvmrc`) before any `npm install` |
| npm | dependency changes | ✓ | **11.6.2** — ⚠️ violates the npm-10 lockfile constraint | `npm i -g npm@10` **required** before touching `package-lock.json` |
| `git` | hive committer, tests | ✓ | in PATH | — |
| `better-sqlite3` (plain Node) | boot test, `db.ts` | ✓ | `^13`, N-API prebuild, loads under v24 | — |
| `node-pty` (plain Node) | `pty.ts` tests | ✓ | `1.1.0`, loads under v24 | CI runs `npm rebuild node-pty` |
| `claude` CLI | DAEMON-04 verification | ✓ | **2.1.236** | — |
| `codex` CLI | PARITY sanity | ✓ | present | — |
| **`cloudflared`** | **DAEMON-05 live test** | **✗** | — | **Must be acquired. Blocks the live close test.** |
| **`kimi`** | **PARITY-01a live run** | **✗** | — | Bridge ships `LIVE-UNVERIFIED` |
| `grok`, `agy`, `qwen`, `crush`, `opencode`, `pi`, `copilot` | PARITY-02/03 | **✗ (all seven)** | — | All stay `LIVE-UNVERIFIED` |
| Android device | DAEMON-02 | **✗** | — | Localhost-verified auth path, recorded as such |
| macOS machine | D-10.5, mac CI reproduction | **✗** | — | `UNVERIFIED`, ships marked |
| Telegram bot token / Discord app key | DAEMON-03 live | **✗** | — | Verifier unit tests only |

**Missing with no fallback (blocks a criterion):**
- **`cloudflared`** — DAEMON-05's "`stop()` genuinely closes it — verified by a request to the public URL failing after stop" cannot be run at all without it. **Acquisition is a wave-0 task, not a wave-N detail.**

**Missing with a fallback (record, do not claim completion):**
- Android device → localhost-verified auth path (the requirement itself blesses this).
- Eight engine CLIs → `LIVE-UNVERIFIED` markers stay, and kimi's bridge adds to them.
- macOS → `setActivationPolicy` ships marked.

---

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`, so this section applies.

### Applicable ASVS categories

| ASVS category | Applies | Standard control in this repo |
|---|---|---|
| **V2 Authentication** | **yes** — the PWA puts an authenticated door on the public internet | Generated 192-bit capability tokens (`WebhookServer`); single-use enrollment token in the URL `#fragment` (never sent to the server, never in `Referer`, never in an access log); bearer in origin-scoped IndexedDB. **Never a user-chosen password** (DAEMON-05, explicit). |
| **V3 Session Management** | **yes** | Origin-scoped bearer; dies with the tunnel hostname by design (D-19). No server-side session store. |
| **V4 Access Control** | **yes** — MCP grants are capability grants | `hive.ts:1235` fail-closed tier branch; per-agent secret refs so revoking one agent does not disarm another (D-28); `deleteSecret` on revoke. |
| **V5 Input Validation** | **yes** | `validateAgainstSchema` + a mandatory `message` field; `MAX_BODY_BYTES` 1 MB cap; `readEndpointId` rejects multi-segment paths. **The phone adds the first path-sensitive routing — validate the static path against traversal explicitly** (`safeJoin`-style containment, the `src/main/fs.ts` pattern). |
| **V6 Cryptography** | **yes** | `node:crypto` only. `timingSafeEqual(sha256(a), sha256(b))` — both sides hashed to fixed width, which `test/net-binding.test.cjs` pins with a regex so a length compare can never come back. Ed25519 for Discord. VAPID/`aes-128-gcm` for Web Push. `safeStorage` for at-rest secrets, **fail closed when unavailable**. |
| **V7 Error Handling & Logging** | yes | Uniform 401/404 across unknown-id / wrong-secret / unknown-token — deliberately no enumeration signal. `redactSecrets` scrubs the hive git index (`test/hive-durability.test.cjs` pins it) and the account-pool alert path. |
| **V12 File & Resource** | **yes — new in this phase** | Serving `resources/phone/**` is the first static-file read on the trust boundary. Use an allowlist of exact filenames + a MIME map, not a directory walk. |
| **V13 API & Web Service** | yes | Rate limits: global 120/60 s + per-endpoint 60/60 s, fixed-window, applied **before** any parse or crypto. |

### Known threat patterns for this stack

| Pattern | STRIDE | Standard mitigation | Status |
|---|---|---|---|
| Path traversal via `/phone/../../config.json` | Information disclosure | Exact-filename allowlist; `safeJoin` containment; never `join(root, req.url)` | **New surface — must be built** |
| Endpoint-id shadowing (`phone` as an operator webhook id) | Spoofing / EoP | Reserve `phone`, refuse it in `setEndpoints`, pin with a repo-fact test | **New — §4.3, nobody has named it** |
| Endpoint enumeration | Information disclosure | Uniform 401/404 + a per-process `decoySecret` compared against for unknown ids | Existing; **the public `/phone/` shell weakens it — state it** |
| Remote DoS of the auth lockout | Denial of service | **Acknowledged and unfixable behind a tunnel** — `webhook.ts:156` already says the remote IP is the tunnel's, so per-IP is meaningless and a global lockout is remotely triggerable (D-23). Say it; do not claim per-client lockout. | Existing, documented |
| Prompt-injected agent reading another agent's hook token | EoP | GATE-01: per-spawn `hookServer.mintToken(agentId)` into that one PTY's env; the floor-wide `HIVE_SOCK_TOKEN` is gone | Landed (Phase 1) |
| An MCP `write`/`secret` server armed without consent | EoP | `hive.ts:1235` fail-closed; `setSecret` refuses when `safeStorage` is unavailable and the server is then **not armed** | Existing; **must survive the per-agent move** |
| Credential left behind after revoke | Information disclosure | `deleteSecret` on revoke (D-28) | **Must be built + tested** |
| Secret committed to the hive git history | Information disclosure | `redactSecrets` unstages per-path, announces on the durable log, never edits the agent's file | Existing, 4 tests; **must survive the git-committer extraction** |
| Tunnel hostname leaking the operator's WAN IP | Information disclosure | tunnelmole rejected for exactly this (D-14, measured: `bdmjlf-ip-49-36-124-85.tunnelmole.net`) | Decided |
| Unverified binary execution | Tampering | Pin a release tag + verify SHA-256. **#57 is the in-repo precedent for getting this wrong.** | **Must be built — §Package Legitimacy Audit** |
| `--mcp-config` inheriting the operator's personal MCP servers into a bypassed-permissions agent | EoP | `--strict-mcp-config` | **Open question 1 — decide explicitly** |

---

## Sources

### Primary (HIGH confidence — measured or run in this session, 2026-08-21)

- `npm test` → 515/511/0/4, 18.47 s · `npm run typecheck` → exit 0 · `npm run build` → ✓ 36.95 s, exit 0
- `node -e "require('./test/load-ts.cjs')('src/main/index.ts')"` → creates the log file, then `TypeError: electron_1.app.on is not a function` (D-02 reproduced)
- A throwaway `node --test` probe: `HiveManager` on a tmpdir → `ensureHive` → 2× `ensureAgent` → hand-written outbox file → **`routeOnce()` === 1**, message in the recipient inbox, source archived to `.sent/`
- **`claude` 2.1.236 MCP probe, three runs** with marker-writing stdio servers: `--settings`'s `mcpServers` **never spawns**; `--mcp-config` **always spawns**, with and without `--strict-mcp-config`, with no approval prompt
- `claude --help` → `--mcp-config <configs...>`, `--settings <file-or-json>`, `--strict-mcp-config`
- `require('better-sqlite3')` + `new Database(':memory:')` → OK under Node v24.13.0; `require('node-pty')` → OK
- `command -v` for 10 CLIs → only `claude`, `codex` present; `cloudflared`, `kimi`, `grok`, `agy`, `qwen`, `crush`, `opencode`, `pi`, `copilot` absent; `winget list --id Cloudflare.cloudflared` → not installed
- `node --version` v24.13.0 · `npm --version` 11.6.2 · `npx --no-install npm@10 --version` → not cached
- GitHub REST `repos/cloudflare/cloudflared/releases/latest` → tag `2026.8.2`, 2026-08-14, 26 assets, no checksum file, `assets[].digest` present, no `windows-arm64`
- Source read directly: `src/main/{index,hive,webhook,slack,delivery,hooks,pty,procKill,db,config,integrations,telemetry,knowledge}.ts`, `src/shared/{agentProvider,providerAutomation,mcpCatalog}.ts`, `src/renderer/src/{hooks/useHive.ts,components/{AskMeTab,AddAgentModal,CommandCenterPanel,OnboardingWizard}.tsx}`, `src/preload/index.ts`, `test/{load-ts,hive-durability,net-binding,main-hardening,config-secrets,repo-claims,ci-config}.*`, `package.json`, `package-lock.json`, `electron.vite.config.ts`, `electron-builder.yml`, `.github/workflows/{ci,e2e}.yml`
- Machine-generated banner→global dependency map over `src/main/index.ts` (53 banners × 39 identifiers)

### Secondary (MEDIUM — official vendor documentation, not run here)

- Cloudflare, *TryCloudflare* — "intended for testing and development only"; "hard limit … 200 in-flight requests", HTTP 429 on exceed; "Quick Tunnels do not support Server-Sent Events (SSE)"; "We don't guarantee any SLA or uptime"; `cloudflared tunnel --url http://localhost:8080`
- Moonshot AI, *Kimi Code CLI — Hooks (Beta)*: `~/.kimi/config.toml`, `[[hooks]]`, 13 events, stdin JSON with `session_id`/`cwd`/`hook_event_name`, exit 0/2 semantics, `hookSpecificOutput`/`permissionDecision`, user-global only
- Moonshot AI, *Kimi Code CLI — Config Files*: default `~/.kimi/config.toml`; `--config-file` / `--config` mutually exclusive; TOML **and** JSON, parsed by extension; `config.json` → `config.toml` auto-migration
- Moonshot AI, *`kimi` Command reference*: `--config-file PATH`, `--config STRING`, `--model/-m`, `--print`, `--quiet`, `--prompt/-p`, `--command/-c`, `--continue/-C`, `--session/--resume/-S/-r`, `--yolo/-y`, `--yes`, `--auto-approve`, `--afk`; `kimi login`/`logout` store OAuth in the config

### Tertiary (LOW — noted, not depended on)

- Chrome dropped the service-worker requirement for mobile installability in 108. Cited by D-18 and consistent with the secure-origin rule; not re-verified here.

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — nothing is added; the one removal and its lockfile hazard were measured.
- **The extraction's dependency graph:** HIGH — machine-generated from source, every count reproduced by a command.
- **Boot-test feasibility:** HIGH — every claim rests on an existing test file that already does the same thing on all three CI platforms.
- **Criterion-1 test inventory:** HIGH — the router claim was proven by running it; the committer claim by reading four existing tests.
- **DAEMON-01's two extra gaps:** HIGH — both are quoted verbatim from source, including the source's own comment describing the failure.
- **DAEMON-04 / MCP:** HIGH — live-verified three ways on the exact CLI version the repo targets.
- **DAEMON-02 routing wall:** HIGH — `readEndpointId` and `handleRequest` read directly.
- **Kimi bridge:** MEDIUM — two independent official vendor pages agree, but the CLI is not installed and nothing was run. A2 and A4 in particular are live-run items.
- **Windows hazards:** HIGH for everything measured on this box; the macOS items are explicitly `UNVERIFIED`.

**Research date:** 2026-08-21
**Valid until:** 2026-09-20 for the repo-internal findings (they are pinned to `2f29d0b`); **2026-08-28** for the `claude` CLI MCP behaviour and the `cloudflared` release metadata — both are fast-moving vendor surfaces and both must be re-checked if the phase runs more than a week from now.
