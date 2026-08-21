<!-- refreshed: 2026-08-20 -->
# Architecture

**Analysis Date:** 2026-08-20

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                        RENDERER (Chromium, React 18)                      │
│  `src/renderer/src/`                                                      │
│  App.tsx → OfficeFloor (Pixi.js) + sidebar panels + terminal pool         │
│  zustand store (store.ts) · useHive.ts (hook-driven avatar state,      │
│  delivery VETO up to main) · terminalPool.ts (one xterm per PTY)       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                 │ window.cth.* (contextBridge)
┌───────────────────────────────▼─────────────────────────────────────────┐
│                    PRELOAD BRIDGE (isolated context)                     │
│  `src/preload/index.ts` — ~160 ipcRenderer.invoke/on/send wrappers,      │
│  exposed as a single `cth` object (`contextBridge.exposeInMainWorld`)    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                 │ ipcMain.handle / .on  (~157 channels)
┌───────────────────────────────▼─────────────────────────────────────────┐
│                         MAIN PROCESS (Node, Electron)                    │
│  `src/main/index.ts` (~5.6k lines) — window/app lifecycle, IPC surface,  │
│  scheduler, Slack/webhook servers, ephemeral-worker watcher              │
│  ┌───────────────┐ ┌───────────────┐ ┌──────────────┐ ┌───────────────┐ │
│  │ HiveManager   │ │ DeliveryService│ │ PtyManager   │ │ HookServer    │ │
│  │ `hive.ts`     │ │ `delivery.ts`  │ │ `pty.ts`     │ │ `hooks.ts`    │ │
│  │ msg bus, git  │ │ autonomy loop  │ │ node-pty     │ │ Unix socket / │ │
│  │ committer,    │ │ (inbox wake,   │ │ sessions,    │ │ named pipe,   │ │
│  │ provisioning  │ │ failover)      │ │ Windows shim │ │ token-authed  │ │
│  └───────┬───────┘ └────────┬──────┘ └──────┬───────┘ └───────┬───────┘ │
└──────────┼──────────────────┼───────────────┼─────────────────┼─────────┘
           │                  │               │                 │
           ▼                  ▼               ▼                 ▼
┌───────────────────┐ ┌───────────────┐ ┌─────────────┐ ┌───────────────────┐
│ <harnessHome>/hive/│ │ live PTYs     │ │ real CLI    │ │ CLI hook shims     │
│ one git repo:      │ │ (child procs) │ │ processes   │ │ (cth-hook.cjs etc) │
│ agents/, tasks.json,│ │ owned by main │ │ claude/codex│ │ callback over the  │
│ board.md, log.jsonl│ │               │ │ /grok/...   │ │ hook socket        │
└───────────────────┘ └───────────────┘ └─────────────┘ └───────────────────┘
```

`src/shared/` (types + pure logic, e.g. `agentProvider.ts`, `claudeAccounts.ts`,
`triggers.ts`, `providerAutomation.ts`) is imported by both main and renderer — it
has no Electron dependency and is the only code that legally crosses the process
boundary as source (everything else crosses as serialized IPC payloads).

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Main entry / IPC surface | App lifecycle, window management, ~157 `ipcMain` handlers, scheduler, Slack/webhook ingress, ephemeral-worker watcher | `src/main/index.ts` |
| HiveManager | On-disk multi-agent message bus: workspace provisioning, inbox/outbox routing, task ledger, single-committer git, per-provider hook/template installers | `src/main/hive.ts` |
| DeliveryService | The autonomy loop: idle-agent inbox wake nudge, guarded Stop-hook drain, account-failover kill→respawn→continue | `src/main/delivery.ts` |
| PtyManager | node-pty session lifecycle: spawn, write, resize, kill, output tail buffer, session-identity race guard, Windows npm-shim decoding | `src/main/pty.ts` |
| HookServer | Local socket server the agent CLIs' lifecycle hooks call back into; token-authenticated | `src/main/hooks.ts` |
| AccountPoolManager | Claude account rotation/health/cooldown, feeds `DeliveryService.failover` | `src/main/accountPool.ts` |
| CircuitBreaker | Per-agent token-burn rate limiting (constrain/stop) | `src/main/breaker.ts` |
| ControlRegistry | Operator pause/steering signals reaching agents at hook boundaries (used by closing-time) | `src/main/control.ts` |
| ClosingTimeController | Graceful shutdown protocol (god broadcasts, workers ACK, then teardown) | `src/main/closingTime.ts` |
| TelemetryCollector | Per-agent usage/cost/tool-span tracking | `src/main/telemetry.ts` |
| MemoryReflector | Background memory-condensation TUI pass | `src/main/reflect.ts` |
| PersistStore | SQLite-backed durable app state (better-sqlite3) | `src/main/db.ts` |
| Preload bridge | Renders ~160 IPC channels into a single `window.cth` object; the only file both processes' types flow through | `src/preload/index.ts` |
| zustand store | Renderer's single source of truth: agents, MD message queues, UI state | `src/renderer/src/store/store.ts` |
| useHive hook | Renderer-side glue: god-agent bootstrap, hook-driven avatar state, veto reporting to main. **It no longer owns the MD-queue drain** — effect #4 was deleted in Phase 1 plan 01-08 and `DeliveryService.drainQueue()` (`src/main/delivery.ts:518`) owns it, so the queue survives the window closing | `src/renderer/src/hooks/useHive.ts` |
| terminalPool | Pooled xterm instances (one per live PTY), WebGL context leasing, LRU eviction, draft/picker automation guards | `src/renderer/src/components/terminalPool.ts` |
| OfficeFloor | Pixi.js isometric scene: agents as characters at desks, message envelopes, thought/tool bubbles | `src/renderer/src/scene/office/OfficeFloor.tsx` |

## Pattern Overview

**Overall:** Electron three-process desktop app (main / preload / renderer) wrapping
a filesystem-based multi-agent coordination layer (the "hive"). There is no
client-server split beyond IPC — the entire runtime is one machine, one process
tree. Agent-to-agent messaging is not in-memory pub/sub; it is a single git repo
with per-agent `inbox/`/`outbox/` directories that a router drains on a timer
(`HiveManager.routeOnce`, `src/main/hive.ts:1589`).

**Key Characteristics:**
- **God file, not layered services.** `src/main/index.ts` is a single 5.6k-line
  module holding both the IPC surface and most orchestration logic (scheduler,
  Slack/webhook servers, ephemeral-worker watcher). Business logic is split out
  into focused classes/modules (`hive.ts`, `pty.ts`, `delivery.ts`, `hooks.ts`,
  `accountPool.ts`, `breaker.ts`, …) that `index.ts` wires together and exposes
  over IPC — but the wiring itself, plus a large amount of standalone logic
  (worktree teardown, mission scheduling, Slack/webhook plumbing), lives directly
  in the entry-point file rather than in owned modules. See **Anti-Patterns**
  below for the extraction seams a future split would follow.
- **Filesystem as the source of truth for cross-agent state.** The hive
  (`<harnessHome>/hive/`) is a git repo; agents (real CLI subprocesses) only ever
  write plain files into their own directory. Main is the sole git committer
  (ADR-0004, `docs/adr/0004-single-committer-git.md`) and the sole router.
- **One writer per PTY.** Automatic text is typed into a live agent's terminal
  from exactly one place — `DeliveryService` in main, for BOTH the renderer's MD
  queue (composer/Slack-ingress messages, enqueued over IPC) and main's inbox-wake
  nudge and failover continuation. `useHive.ts` effect #4 was DELETED in Phase 1
  plan 01-08. Both paths funnel through the same idle/draft/picker
  gate described in `docs/message-queue.md` and ADR-0001
  (`docs/adr/0001-one-gate-for-pty-writes.md`).
- **Main outlives the renderer for autonomy-critical state.** `DeliveryService`
  (`src/main/delivery.ts`) intentionally holds re-entrancy guards (`switching`)
  and timers as instance state constructed once at boot, so a renderer reload or
  crashed panel cannot lose an in-flight account failover or silently stop inbox
  delivery — this was moved out of the renderer specifically to fix that failure
  mode (see file-header comment, `src/main/delivery.ts:1-27`).
- **Provider-agnostic agent shell.** Agents can run on different CLI engines
  (Claude, Codex, Grok, OpenCode, Crush, …); `src/shared/agentProvider.ts` and
  per-provider installers in `hive.ts` (`installCodexHooks`, `installPiHooks`,
  `installOpenCodePlugin`, `installCrushConfig`, `installGrokHooks`) adapt the
  hive protocol to each CLI's own hook/plugin mechanism.

## Layers

**Main process — entry/orchestration:**
- Purpose: app + window lifecycle, IPC surface, cross-cutting schedulers (missions,
  context triggers, heartbeat, circuit-breaker beat), Slack/webhook ingress,
  ephemeral-worker watcher, shutdown sequencing
- Location: `src/main/index.ts`
- Contains: `ipcMain.handle`/`.on` registrations, module-level mutable state
  (30+ `let` bindings — PTY↔agent maps, timers, server handles, caches), the
  `SHUTDOWN_STEPS` registry (`src/main/index.ts:4157`)
- Depends on: every other `src/main/*` module, `src/shared/*`
- Used by: nothing (it is the root); wires everything the preload bridge exposes

**Main process — domain services:**
- Purpose: focused, mostly-independent subsystems main constructs once at boot
- Location: `src/main/*.ts` (`hive.ts`, `pty.ts`, `delivery.ts`, `hooks.ts`,
  `accountPool.ts`, `breaker.ts`, `control.ts`, `closingTime.ts`, `telemetry.ts`,
  `reflect.ts`, `db.ts`, `git.ts`, `slack.ts`, `webhook.ts`, `integrationBroker.ts`, …)
- Contains: classes/functions with their own state, most independently
  unit-testable via `node --test` (notably `delivery.ts`, deliberately
  electron-free — see its file header)
- Depends on: `src/shared/*`, node builtins, `node-pty`, `better-sqlite3`
- Used by: `src/main/index.ts` (wiring), each other in a few places (e.g.
  `closingTime.ts` takes a `HiveManager` + `ControlRegistry`)

**Preload bridge:**
- Purpose: the only code allowed to call `ipcRenderer`/`contextBridge`; converts
  ~160 raw IPC channels into a typed `window.cth` API surface
- Location: `src/preload/index.ts`
- Contains: the `api` object (`src/preload/index.ts:601`) and its exported
  `CthApi` type, which the renderer imports for typing `window.cth`
- Depends on: `electron`, `src/shared/*` (types only)
- Used by: every renderer module that talks to main

**Renderer — state + glue:**
- Purpose: single client-side source of truth (zustand) and the effects that keep
  it synced with main-process reality
- Location: `src/renderer/src/store/`, `src/renderer/src/hooks/`
- Contains: `store.ts` (agents, a READ-ONLY view of the MD queues, UI state), `useHive.ts` (god
  bootstrap, hook-driven avatar state, veto reporting — the drain moved to main), other
  hooks (`usePtyParser.ts`, `useRestoreTeam.ts`)
- Depends on: `window.cth` (preload), `src/shared/*`
- Used by: `App.tsx` and nearly every component

**Renderer — presentation:**
- Purpose: React components (panels, modals, terminal views) and the Pixi.js
  office scene
- Location: `src/renderer/src/components/`, `src/renderer/src/scene/office/`,
  `src/renderer/src/ide/`, `src/renderer/src/realtime/`, `src/renderer/src/freeflow/`
- Contains: presentational + stateful components reading the zustand store and
  calling `window.cth.*` directly (no separate API-client layer)
- Depends on: zustand store, `window.cth`, `@xterm/xterm`, `pixi.js`
- Used by: `App.tsx`

## Data Flow

### Primary request path — spawning an agent

1. User submits **Add Agent** in the renderer (`src/renderer/src/components/AddAgentModal.tsx`)
   → calls `window.cth.spawnPty(opts)` (preload-exposed `pty:spawn` invoke,
   `src/preload/index.ts:617`). **There is no `window.cth.spawnAgent`** — this
   line named a method that has never existed on the bridge.
2. Main's `ipcMain.handle('pty:spawn', …)` (`src/main/index.ts:2971`) calls
   `spawnAgentCore()` (`src/main/index.ts:2987`), which resolves the CLI command,
   optionally allocates a git worktree (`git.ts`), provisions the agent's hive
   workspace via `HiveManager.ensureAgent()` (`src/main/hive.ts:734`) — writing
   `identity.md`, hook settings, MCP config, per-provider bridge files — then
   spawns the real PTY via `PtyManager.spawn()` (`src/main/pty.ts:552`).
3. `DeliveryService.noteSpawn(ptyId)` (`src/main/delivery.ts:173`) opens a
   boot-grace window so nothing types into the terminal before its TUI paints.
4. The CLI's own lifecycle hooks (SessionStart/PreToolUse/PostToolUse/Stop) fire
   against `HookServer` over the token-authenticated local socket
   (`src/main/hooks.ts`), driving avatar/status state that main forwards to the
   renderer.
5. The renderer's `useHive.ts` hook-event listeners update `useStore` (agent
   status, current tool, recent text), which re-renders `AgentStrip`,
   `OfficeFloor` and the terminal view.

### Agent-to-agent messaging (the hive)

1. An agent writes a JSON message file into its own `outbox/` (agents never call
   git or touch another agent's directory).
2. `HiveManager.routeOnce()` (`src/main/hive.ts:1589`, ticked by `startRouter`,
   `src/main/hive.ts:1574`) drains outboxes into recipients' `inbox/` directories
   and archives the sent copy.
3. `HiveManager`'s single-committer git path (`commit`/`scheduleCommit`/
   `flushCommit`, `src/main/hive.ts:2698-2762`) debounces and commits the change —
   see ADR-0004 (`docs/adr/0004-single-committer-git.md`).
4. Delivery to a *live, idle* agent's terminal goes through `DeliveryService.tick()`
   (`src/main/delivery.ts:678`) — the inbox wake nudge — or, if the agent is
   mid-turn, through the guarded Stop-hook drain (`drainAtStop`,
   `src/main/delivery.ts:604`, called from `hooks.ts:663`), which advances
   `cursor.json` (`hive.ts:1375`) and hands back a
   continuation prompt with no PTY write at all.
5. Both paths emit `hive:delivered` to the renderer so the UI reflects what moved;
   see **Entry Points → main↔renderer delivery contract** below.

### The MD queue (human/composer-authored messages)

Full contract: `docs/message-queue.md`; summarized decision: ADR-0001
(`docs/adr/0001-one-gate-for-pty-writes.md`).

1. Composer input, Slack ingress, or a scheduled `/compact` calls
   `enqueueMessage(agentId, text)` on the zustand store
   (`src/renderer/src/store/store.ts`).
2. `useHive.ts` effect #4 (the drain loop, `src/renderer/src/hooks/useHive.ts:801`)
   is the **one place** that types automatic text into a live agent's PTY. It
   delivers the queue head only when the agent is idle, auto-delivery isn't
   paused, the boot grace window has passed, `isTerminalAutomationSafe(ptyId)`
   (`src/renderer/src/components/terminalPool.ts:343`) says the human doesn't own
   the prompt, and 4.5 s have passed since the last delivery.
3. `useHive.ts` effect #4b (`src/renderer/src/hooks/useHive.ts:968`) reports the
   renderer's draft/picker state UP to main as a veto over `hive:deliveryVeto`
   IPC — the renderer's only remaining say in delivery timing (see next section).

**State Management:** zustand (`useStore`) is the only renderer-side state
container; there is no separate cache/query layer. Main-process state is split
across module-level globals in `index.ts` and instance state inside each domain
class (`HiveManager`, `DeliveryService`, `PtyManager`, `AccountPoolManager`, …).
Durable state is either plain files under `<harnessHome>/hive/` (hive) or a
SQLite database via `PersistStore` (`src/main/db.ts`, app-level settings/usage).

## Key Abstractions

**HiveManager (`src/main/hive.ts`):**
- Purpose: owns the on-disk hive — workspace provisioning, message routing, task
  ledger, single-committer git, per-provider hook/template installation
- Examples: `src/main/hive.ts` (class `HiveManager`, ~2.8k lines, lines 491-3313 at wave 9 of Phase 1)
- Pattern: one large stateful class with clearly separable method clusters (see
  **Anti-Patterns**); template strings for on-disk shim files
  (`cth-hook.cjs`, `agy-hook.cjs`, the pi/opencode bridges, `hive-proxy.cjs`,
  `grok-hook.cjs`) are generated as JS source literals inside the same file
  (`src/main/hive.ts:3074-3562`)

**DeliveryService (`src/main/delivery.ts`):**
- Purpose: the autonomy loop — inbox wake, guarded Stop drain, account failover
- Examples: `src/main/delivery.ts` (class `DeliveryService`)
- Pattern: dependency-injected (`DeliveryDeps`), deliberately free of any
  `electron` import so `node --test` can drive it with fakes
  (`test/delivery-main.test.cjs`); all Electron/hive/PTY specifics are wired in
  from `src/main/index.ts`

**PtyManager (`src/main/pty.ts`):**
- Purpose: node-pty session lifecycle, output tail buffering for renderer
  reattach, Windows npm-shim decoding
- Examples: `src/main/pty.ts` (class `PtyManager`, `parseNpmCmdShim`)
- Pattern: session-identity capture (`src/main/pty.ts:696-742`) — `onData`/`onExit`
  callbacks compare the live map entry by object identity before acting, so a
  dying process from a kill()+respawn reusing the same id can never corrupt the
  replacement session or emit a false exit

**Agent (renderer domain model):**
- Purpose: the UI's view of one hive agent — status, current tool, message
  queues, breaker/context telemetry
- Examples: `interface Agent` in `src/renderer/src/store/store.ts`
- Pattern: plain data object held in zustand, mutated only through store actions;
  ephemeral/derived fields (e.g. `waitingOnGod`, `store.ts:61`) are commented as
  never persisted

**IPC channel (`namespace:action`):**
- Purpose: the entire main↔renderer contract
- Examples: `pty:spawn`, `hive:agentUsage`, `claudeAccount:add`, `git:status`
  (all registered in `src/main/index.ts`, all wrapped in `src/preload/index.ts`)
- Pattern: colon-delimited namespace prefix per subsystem; handlers validate
  `unknown`-typed arguments at the boundary rather than trusting the renderer

## Entry Points

**Main process boot (`src/main/index.ts:5495`, `app.whenReady()`):**
- Triggers: Electron app ready
- Responsibilities, in order: file logging, mic-gate reset, analytics init,
  cold-start deep-link handling, hook-socket token + Slack-reply-config env vars,
  `persist.open()`, `accountPool.load()`, `initAutoUpdater()`,
  `bootstrapHiveServices()` (`src/main/index.ts:5356` — starts the hive router,
  `DeliveryService`, ephemeral-worker watcher), power-monitor listeners,
  `createWindow()`, optional Slack/webhook server auto-start

**Shutdown (`runShutdown` / `SHUTDOWN_STEPS`, `src/main/index.ts:4157-4190`):**
- Triggers: `app:confirmClose` IPC, `app:resetAll` IPC, `before-quit`
- Responsibilities: a single ordered list of `{name, stop()}` steps (timers,
  routers, servers, `persist.close()`, `ptyManager.killAll()`) run best-effort so
  one throwing step never blocks quit; the same list backs both the quit path and
  the full-reset path so they cannot drift (see comment at
  `src/main/index.ts:4151-4156` referencing issue #34)

**Renderer boot (`src/renderer/src/main.tsx`):**
- Triggers: index.html load
- Responsibilities: mounts `<App />` into the DOM under `StrictMode`

**App.tsx (`src/renderer/src/App.tsx`):**
- Triggers: renderer mount
- Responsibilities: loads config over IPC, gates on onboarding/hive-picker,
  starts `useHive()`, renders the title bar, `OfficeFloor`, sidebar
  (`AgentDetailPanel`/`CommandCenterPanel`), `AgentStrip`, and all modals
  (Settings, Add Agent, Quit Warning, Fullscreen Terminal)

**Main↔renderer delivery contract (recent architectural change):**
The autonomy loop (inbox wake, Stop-hook drain, account failover) moved from the
renderer into main (`src/main/delivery.ts`) so it survives window reload/crash —
see the file's header comment for the concrete failure it fixes (issue #5,
upstream #151: a failover caught mid-switch left an agent killed and never
respawned). The renderer keeps exactly one input into that loop: a draft/picker
**veto**.
- `hive:delivered` (main → renderer event): a message was just delivered to an
  agent (either delivery path); renderer marks it seen. Emitted from
  `DeliveryService.tick()`/`drainAtStop()`, forwarded over IPC in `src/main/index.ts`.
- `hive:failover` (main → renderer event): account-switch phase (`start`/`done`/
  `failed`) for one or more agents; renderer reflects it in the UI.
- `hive:deliveryVeto` (renderer → main, `ipcMain.on`, `src/main/index.ts:3365`):
  the renderer's draft/picker state for one agent, re-asserted on a cadence
  because a standing veto expires after `VETO_TTL_MS` (5 min,
  `src/main/delivery.ts:101`) so a dead renderer can never wedge autonomy.
- `pty:idleFor` (renderer → main, `ipcMain.handle`, `src/main/index.ts:3355`):
  how long a PTY has been silent — the cheapest available draft guard, since the
  child echoes the human's own keystrokes.

## Architectural Constraints

- **Threading:** Single-threaded Node event loop in main; node-pty spawns real OS
  child processes (the agent CLIs) but the harness itself does no worker-thread
  parallelism. Async work (git calls, spawn, network) is `Promise`-based with
  explicit re-entrancy guards (`gitInFlight`, `workerTickRunning`, `committing`,
  `ticking` in `DeliveryService`) rather than actual concurrency control.
- **Global state:** `src/main/index.ts` holds 30+ module-level mutable bindings
  (PTY↔agent maps, timer handles, server instances, caches — see the `let`
  declarations from `src/main/index.ts:115` onward, e.g. `mainWindow`,
  `slackServer`, `webhookServer`, `workerWatchTimer`, `fleetTimer`). Each
  long-lived subsystem (`HiveManager`, `PtyManager`, `DeliveryService`,
  `AccountPoolManager`) is otherwise a class instance constructed once at boot
  and closed over by the IPC handlers that use it.
- **Circular imports: there is at least one, and this entry used to deny it.**
  `src/main/config.ts:15` imports from `./integrations` and
  `src/main/integrations.ts:28` imports back from `./config` — a real runtime
  cycle. Measured 2026-08-21.
- **`index.ts` is not the only file importing the domain modules either.**
  `grep -rhoE "from '\./[a-zA-Z0-9_-]+'" src/main/*.ts --exclude=index.ts | wc -l`
  returns **45** cross-module imports among `src/main/*.ts` with `index.ts`
  excluded. Dependencies do *mostly* flow one way from `index.ts`, and callbacks
  are still the main sideways seam (`ClosingTimeController` takes `hive`,
  `control`, and closures for teardown) — but "none observed" was a claim about
  something nobody had run a command against, in the document downstream agents
  read as canonical. Re-measure before restating it.
- **Process boundary is IPC-only.** Nothing outside `src/shared/*` may be
  imported by both main and renderer; everything else crosses as a serialized IPC
  payload through `src/preload/index.ts`.
- **PTY writes are single-gated per writer.** See ADR-0001
  (`docs/adr/0001-one-gate-for-pty-writes.md`) — automatic text reaches a live
  terminal through exactly ONE gate — main's `DeliveryService`, which serializes
  per PTY on `writeChains`. The renderer's own drain is DELETED, not left as a
  fallback (Phase 1 plan 01-08), so there is no second writer.
- **Git is single-committer.** See ADR-0004
  (`docs/adr/0004-single-committer-git.md`) — only `HiveManager` in the main
  process ever runs `git commit` against the hive repo.
- **The injected system prompt is volatile-free.** See ADR-0002
  (`docs/adr/0002-prompt-cache-invariant.md`) — `HiveManager.injectedPrompt()`
  interpolates only lifetime-stable values so Anthropic's prompt cache prefix
  never re-primes on every turn.
- **Worktree GC fails safe.** See ADR-0003
  (`docs/adr/0003-fail-safe-worktree-gc.md`) — reclamation only deletes a
  worktree when it can *prove* the work is integrated; an unreadable git query
  counts as "keep".

## Anti-Patterns

### The main-process god file

**What happens:** `src/main/index.ts` is ~5.6k lines and registers ~157
`ipcMain` handlers directly inline, alongside large standalone subsystems that
have no owning module: the ephemeral-worker watcher + `spawn-requests/` queue
(`src/main/index.ts:4942-5356`), the mission/context-trigger scheduler
(`src/main/index.ts:871-1080`), Slack ingestion (`:1650-2050`), generic webhook
ingestion (`:2050-2420`), window/floor management (`:2420-2814`), and
`spawnAgentCore` (`:2987-3444`, ~460 lines).

**Why it's wrong:** Every one of those clusters is independently testable logic
trapped behind Electron-only module load (unlike `delivery.ts`, which was
deliberately extracted electron-free). Finding "where does X happen" requires
grepping a 5.6k-line file; two unrelated features touching nearby line ranges is
a standing merge-conflict risk.

**Do this instead — the extraction seams this file already implies:**
- **Agent lifecycle/spawn:** `spawnAgentCore` (`:2987`), `teardownPty` (`:739`),
  `finalizeWorkerWorktree`/`finalizeAgentWorktree` (`:720`, `:770`) → a
  `spawnLifecycle.ts` module, following the same electron-free-where-possible
  pattern as `delivery.ts`.
- **Shutdown:** already has a clean seam — `SHUTDOWN_STEPS` (`:4157`) and
  `runShutdown`/`teardownAndQuit` (`:4179-4191`) are a self-contained registry;
  extracting just needs the closures it references to move with it.
- **Scheduler/heartbeat:** mission timers, context triggers, the heartbeat beat,
  and the breaker beat (`:871-1650`) share the same "arm/clear a
  `setInterval`/`setTimeout` from persisted config" shape and could become one
  `scheduler.ts`.
- **Ephemeral workers + `spawn-requests/`:** `processSpawnRequest`,
  `ephemeralWorkerTick`, `startEphemeralWorkerWatcher` (`:4942-5356`) are already
  a cohesive, well-commented unit (see the block comment at `:4942`) — the
  clearest candidate for extraction as-is into a `spawnQueue.ts`.
- **IPC surface:** the ~157 handler registrations could move to per-domain
  registration functions (`registerPtyIpc(ipcMain, ptyManager)`, etc.) called
  from a slimmed-down `index.ts`, mirroring the pattern already used for
  `registerRealtimeIpc`/`registerRealtimeActionIpc` (`src/main/realtime.ts`,
  `src/main/realtimeActions.ts`).

### HiveManager mixes four concerns in one class

**What happens:** `src/main/hive.ts`'s `HiveManager` (lines 491-3313, ~2.8k
lines) combines workspace provisioning (`ensureAgent`, per-provider hook
installers), message routing (`send`/`routeMessage`/`routeOnce`), the task ledger
(`writeTasks`/`mutateTasks`), and the git committer (`commit`/`scheduleCommit`/
`flushCommit`/`clearStaleLock`) as methods on one object, plus ~800 lines of
on-disk template strings (`cth-hook.cjs`, `agy-hook.cjs`, bridge plugins,
`hive-proxy.cjs`) appended after the class (`:3074-3562`).

**Why it's wrong:** The git committer and the message router have no shared
state with the template generators; testing the git retry/backoff logic requires
constructing a full `HiveManager` with a real hive directory. The class-internal
seams are already visible by method name clustering (see grep in this analysis
session): git (`:2615-2772`), provisioning (`:734-1010`, `:2049-2316`), routing
(`:1373-1811`), tasks (`:1822-1923`).

**Do this instead:** Split along the existing method clusters into
`hiveGit.ts` (commit/retry/lock recovery — ADR-0004's implementation), `hiveRouter.ts`
(send/route/sweep), `hiveProvisioning.ts` (`ensureAgent` + per-provider
installers), and `hiveTasks.ts` (ledger), with `HiveManager` composing them. The
template-string shim generators (`:3074-3562`) are pure string builders with zero
`HiveManager` state dependency and can move to a `hiveShims.ts` module today with
no behavior risk.

## Error Handling

**Strategy:** Defensive, best-effort, fail-toward-safety at every boundary that
touches a live process or external state (PTY, git, filesystem). Main-process
code favors "guarded, logged, continue" over throwing — see `runShutdown`
(`src/main/index.ts:4176-4183`, a throw in one step must never abort the rest)
and the git worktree gates (ADR-0003: an unreadable git query counts as "unsafe
to delete").

**Patterns:**
- IPC handlers validate `unknown`-typed arguments before use (e.g.
  `ipcMain.handle('fs:readFile', (_evt, root: unknown, rel: unknown) => {...})`,
  `src/main/index.ts:3764`) rather than trusting renderer-supplied types.
- `PtyManager` methods return `{ ok: boolean; error?: string }` rather than
  throwing (`src/main/pty.ts:750-799`), so a caller (an IPC handler, the
  `DeliveryService` write chain) always gets a typed failure it can react to.
  `DeliveryDeps.write` in `delivery.ts` documents this explicitly: "Never
  throws; reports `ok:false`."
- Async re-entrancy guards (booleans/sets checked before starting work, cleared
  in a `finally`) protect every polling loop: `DeliveryService.ticking`,
  `HiveManager.committing`/`gitInFlight`, `workerTickRunning`,
  `godSpawning` (renderer).
- `ErrorBoundary` (`src/renderer/src/components/ErrorBoundary.tsx`) scopes React
  render failures to "the floor" or "this panel" rather than the whole window
  (see the comment at `App.tsx:369-372` about a single bad agent-driven render
  value previously unmounting the entire app).

## Cross-Cutting Concerns

**Logging:** All `console.*` calls in main are tee'd into a rotating file sink
under `app.getPath('logs')` (`initFileLogging`, `src/main/index.ts:156`) —
installed because a packaged Electron main process has no attached stdout, so
diagnostic output was silently going nowhere (`src/main/index.ts:105-114`).
Renderer logging is plain `console.*` with no forwarding.

**Validation:** Per-IPC-handler manual validation of `unknown`-typed arguments
(no shared schema library); shared shape/contract types live in `src/shared/*`
and are used for compile-time agreement between main and preload/renderer, not
runtime validation.

**Authentication:** The hook socket (`src/main/hooks.ts`) is the one local trust
boundary in the app — any local process could otherwise connect and impersonate
an agent's hook payloads. Every payload must carry a `sock_token` that is
**per-agent and per-spawn**: `mintToken` mints one at each PTY spawn, `pty.ts`
injects it into that agent's child environment as `HIVE_SOCK_TOKEN`, the shim
echoes it back, and `authorized` looks it up in a `Map<token, agentId>` to
**derive** the sender's identity. The payload's own `agent_id` is discarded, and
tokens are revoked when the PTY exits. There is no other authentication layer —
the app is local-first, single-user, and the hive git repo is
filesystem-permission-only.

The ceiling is exactly two properties: there is no floor-wide key, and
`payload.agent_id` is not trusted for identity. It is not secrecy — an agent's own
shell reads whatever its own shim reads — and it is not "agent A cannot
authenticate as agent B", which is false on Linux, where a same-uid sibling reads
B's token out of `/proc/<B-pid>/environ`. The qwen proxy sidecar does **not** yet
carry a token of its own; it is dead-hooked until its spawn site in `hive.ts` is
given one.

---

*Architecture analysis: 2026-08-20*
