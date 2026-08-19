# Codebase Structure

**Analysis Date:** 2026-08-20

## Directory Layout

```
munder-difflin/  (npm package "hello-markx")
├── src/
│   ├── main/                    # Electron main process (Node) — 45 files, ~24.1k lines
│   │   ├── index.ts             # entry point: app lifecycle, ~157 IPC handlers, scheduler
│   │   ├── hive.ts              # HiveManager — the agent-to-agent message bus + git committer
│   │   ├── delivery.ts          # DeliveryService — the autonomy loop (inbox wake, failover)
│   │   ├── pty.ts               # PtyManager — node-pty session lifecycle
│   │   ├── hooks.ts             # HookServer — local socket the CLI hooks call back into
│   │   ├── config.ts            # HarnessConfig read/write, defaults, scheduled missions
│   │   ├── accountPool.ts       # Claude account rotation/health
│   │   ├── breaker.ts           # per-agent token-burn circuit breaker
│   │   ├── control.ts           # ControlRegistry — pause/steering signals
│   │   ├── closingTime.ts       # graceful-shutdown protocol
│   │   ├── telemetry.ts         # usage/cost/tool-span tracking
│   │   ├── reflect.ts           # background memory-condensation pass
│   │   ├── db.ts                # PersistStore (better-sqlite3)
│   │   ├── git.ts               # git plumbing + worktree safety gates
│   │   ├── slack.ts / webhook.ts # inbound integration servers
│   │   ├── realtime*.ts         # OpenAI Realtime (voice) IPC + completion watcher
│   │   ├── skills.ts / hire.ts / roster.ts / memory.ts / knowledge.ts / …
│   │   └── *.cjs                # sidecars required at runtime, not bundled (slack-trigger.cjs, kg-core.cjs)
│   ├── preload/
│   │   ├── index.ts             # ~160 IPC wrappers exposed as `window.cth` (contextBridge)
│   │   └── index.d.ts           # ambient `window.cth: CthApi` declaration for the renderer
│   ├── renderer/
│   │   ├── index.html           # Vite entry HTML (electron-vite renderer root)
│   │   └── src/
│   │       ├── main.tsx         # ReactDOM root
│   │       ├── App.tsx          # top-level layout: title bar, OfficeFloor, sidebar, modals
│   │       ├── components/      # 64 files — modals, panels, terminal pool/automation
│   │       ├── store/           # zustand store, config types, terminalPoolPolicy
│   │       ├── hooks/           # useHive (autonomy glue), usePtyParser, useRestoreTeam
│   │       ├── scene/office/    # Pixi.js isometric office floor
│   │       ├── ide/             # embedded CodeMirror/Monaco file editor panel
│   │       ├── realtime/        # OpenAI Realtime (voice) UI
│   │       ├── freeflow/        # push-to-talk / Groq transcription
│   │       ├── integrations/    # integration-registry UI
│   │       ├── markdown/        # markdown rendering helpers
│   │       ├── design/          # tokens, theme, global.css
│   │       └── assets/          # images/fonts bundled into the renderer
│   └── shared/                  # 19 files — types/logic imported by 2+ processes
│       ├── agentProvider.ts     # provider (claude/codex/grok/…) capability table
│       ├── claudeAccounts.ts / claudeAccountPool.ts
│       ├── triggers.ts          # scheduled/webhook/context trigger config shapes
│       ├── providerAutomation.ts # cross-process PTY-readiness/compaction helpers
│       ├── integrations.ts / mcpCatalog.ts / toolCatalog.ts / hire.ts / …
├── test/                        # 56 files — node:test .cjs, no Electron, mirrors src/main + src/shared logic
├── e2e/
│   └── smoke.spec.ts            # Playwright smoke test
├── docs/
│   ├── adr/                     # 4 architecture decision records + README index
│   └── message-queue.md         # full MD-queue delivery contract
├── hive/                        # SEED template docs bundled into a freshly created hive (not runtime state)
├── resources/                   # bundled skills + sidecar scripts shipped in the packaged app
├── scripts/                     # one-off verification scripts (verify-keepalive-catchup.mjs, verify-worker-gc.mjs)
├── tools/                       # build/dev tooling (postinstall patches, logo/map generators)
├── build/                       # electron-builder assets (icons, entitlements, notarize script)
├── out/                         # electron-vite build output — GENERATED, not committed
├── .planning/                   # GSD planning docs (this file's home) — not shipped
├── HIVE.md, SPEC.md, SECURITY.md, DESIGN.md, MEMORY_GRAPH_SPEC.md, TELEMETRY.md,
│   README.md, CHANGELOG.md, RELEASE.md, CONTRIBUTING.md   # root-level design/process docs
├── electron.vite.config.ts      # build config: main/preload/renderer entries, `@`/`@shared`/`@brand` aliases
├── electron-builder.yml         # packaging config
├── playwright.config.ts
├── tsconfig.json / tsconfig.node.json / tsconfig.web.json
└── package.json
```

## Directory Purposes

**`src/main/`:**
- Purpose: everything that runs with Node/Electron main-process privileges —
  filesystem, git, child processes, network servers
- Contains: one file per subsystem (see table above); `index.ts` is the only file
  that imports and wires the rest together
- Key files: `index.ts` (entry + IPC), `hive.ts` (message bus), `delivery.ts`
  (autonomy loop), `pty.ts` (terminal sessions), `hooks.ts` (CLI callback socket)

**`src/preload/`:**
- Purpose: the sandboxed bridge — the only code allowed to touch
  `ipcRenderer`/`contextBridge`
- Contains: `index.ts` (the `api` object + its `CthApi` type export)
- Key files: `index.ts`

**`src/renderer/src/`:**
- Purpose: the Chromium-side React app
- Contains: components, the zustand store, hooks, the Pixi.js office scene, an
  embedded IDE panel, voice/freeflow features
- Key files: `App.tsx` (root layout), `store/store.ts` (state), `hooks/useHive.ts`
  (autonomy glue)

**`src/shared/`:**
- Purpose: the only source shared between main and renderer builds (imported by
  both `tsconfig.node.json` and `tsconfig.web.json`); must stay Electron-free and
  side-effect-free
- Contains: provider/account/integration/trigger type shapes and pure helper
  functions consumed on both sides of the IPC boundary

**`test/`:**
- Purpose: fast, Electron-free unit/integration tests using Node's built-in
  `node:test` — no Jest/Vitest
- Contains: 56 `*.test.cjs` files, one per feature area, largely mirroring
  `src/main/*` and `src/shared/*` module names (`delivery-main.test.cjs`,
  `hive-cwd.test.cjs`, `terminal-automation.test.cjs`, …)
- Key files: `package.json`'s `test:focused` script lists the fast subset run
  most often during development

**`docs/adr/`:**
- Purpose: standing architecture decisions, one file per decision, never
  renumbered — a reversal gets a new record, not an edit
- Contains: 4 ADRs (PTY-write gating, prompt-cache invariant, worktree GC,
  single-committer git) + `README.md` index

**`hive/` (repo root):**
- Purpose: template/seed documentation copied into a freshly created hive
  (`ensureHive()` in `src/main/hive.ts`) — **not** the runtime hive. The runtime
  hive lives at `<harnessHome>/hive/` on the user's machine, outside this repo.
- Contains: `docs/integration-templates.md`

**`resources/`:**
- Purpose: assets bundled into the packaged app and available at runtime
  (electron-builder `extraResources` / referenced by main at runtime)
- Contains: `kg.cjs`, `md-slack-reply.cjs` sidecars, and the `skills/` catalog
  copied into new agent workspaces (`copyBundledSkills`, `src/main/hive.ts:1144`)

## Key File Locations

**Entry Points:**
- `src/main/index.ts`: main-process boot (`app.whenReady()`), IPC surface, shutdown
- `src/preload/index.ts`: IPC bridge exposed as `window.cth`
- `src/renderer/src/main.tsx`: renderer DOM root
- `src/renderer/src/App.tsx`: renderer top-level component/layout

**Configuration:**
- `electron.vite.config.ts`: build entries + renderer path aliases (`@`, `@shared`, `@brand`)
- `electron-builder.yml`: packaging/signing/notarization config
- `src/main/config.ts`: `HarnessConfig` schema, defaults, scheduled-mission constants
- `tsconfig.node.json` / `tsconfig.web.json`: separate TS configs for main+preload vs. renderer

**Core Logic:**
- `src/main/hive.ts`: agent messaging, task ledger, git committer, provisioning
- `src/main/delivery.ts`: autonomy loop (inbox wake, failover)
- `src/main/pty.ts`: terminal session management
- `src/renderer/src/hooks/useHive.ts`: renderer-side MD-queue drain + hook-driven state
- `src/renderer/src/store/store.ts`: zustand state shape + actions

**Testing:**
- `test/*.test.cjs`: `node --test test/*.test.cjs` (full suite) or `npm run test:focused` (curated fast subset)
- `e2e/smoke.spec.ts`: `npm run e2e` (Playwright)

## Naming Conventions

**Files:**
- Main-process modules: `camelCase.ts`, one subsystem per file (`hive.ts`,
  `accountPool.ts`, `closingTime.ts`)
- React components: `PascalCase.tsx` (`AgentCard.tsx`, `SettingsModal.tsx`)
- Hooks: `camelCase.ts` prefixed `use` (`useHive.ts`, `usePtyParser.ts`)
- Shared type/logic modules: `camelCase.ts` (`agentProvider.ts`, `providerAutomation.ts`)
- Tests: `test/<feature-kebab-case>.test.cjs`, one file per feature area, named
  after the module or behavior under test (`claude-account-failover.test.cjs`,
  `win-cmd-shim.test.cjs`) rather than mirroring `src/` paths exactly

**Directories:**
- Lowercase, singular-or-plural-by-convention-of-contents (`components/`,
  `hooks/`, `store/`, `scene/office/`)
- Feature clusters get their own subdirectory once they exceed a couple of files
  (`scene/office/`, `ide/`, `realtime/`, `freeflow/`)

**IPC channels (cross-cutting, not a filesystem convention but load-bearing):**
- `namespace:action` — e.g. `pty:spawn`, `hive:agentUsage`, `claudeAccount:add`,
  `git:status`, `config:update`. The namespace groups by owning subsystem; every
  channel is registered in `src/main/index.ts` and wrapped in `src/preload/index.ts`.

## Where to Add New Code

**New IPC-backed feature:**
- Handler: add to `src/main/index.ts` (or a new `src/main/<feature>.ts` module if
  it owns real state/background work — wire its start/stop into `SHUTDOWN_STEPS`,
  `src/main/index.ts:4157`, if it starts a timer/server)
- Bridge: add the wrapper to the `api` object in `src/preload/index.ts` and its
  return type to the exported `CthApi`
- Renderer call site: `window.cth.<method>(...)` from a component or `useHive.ts`

**New hive message type / agent behavior:**
- `src/main/hive.ts` (`HiveManager`) for anything touching inbox/outbox/task
  ledger/provisioning; add shared shapes to `src/shared/` if the renderer also
  needs the type

**New renderer panel/modal:**
- `src/renderer/src/components/<Name>.tsx`; wire into `App.tsx` (top-level modal)
  or into `SettingsModal.tsx`'s tab list (settings-scoped) or
  `CommandCenterPanel.tsx` (god-agent-scoped)

**New store slice/state:**
- `src/renderer/src/store/store.ts` — extend the `State` interface and the
  `create<State>((set) => ({...}))` initializer; keep derived/ephemeral fields
  commented as such (existing convention, see `Agent.blockedOnGod`)

**New office visual (character, sprite, tile behavior):**
- `src/renderer/src/scene/office/` — follow the existing split (`Character.ts`
  for logic, `CharacterSprite.ts`/`SpriteAdapter.ts` for rendering,
  `cast.ts`/`themeRegistry.ts` for data tables)

**New provider/CLI engine support:**
- `src/shared/agentProvider.ts` (capability table) + a hook/plugin installer
  method on `HiveManager` in `src/main/hive.ts` (follow the pattern of
  `installCodexHooks`/`installPiHooks`/`installOpenCodePlugin`/`installGrokHooks`)

**New test:**
- `test/<feature>.test.cjs` using `node:test` + `node:assert`; no Electron import
  — if the module under test needs Electron, extract the electron-free logic
  first (the pattern `delivery.ts` and `terminalAutomation.ts` already follow)

## Special Directories

**`out/`:**
- Purpose: electron-vite build output (`out/main`, `out/preload`, `out/renderer`)
- Generated: Yes
- Committed: No

**`hive/` (repo root):**
- Purpose: seed template copied into a NEW hive on first run
- Generated: No (hand-authored template)
- Committed: Yes — but distinct from the runtime hive at `<harnessHome>/hive/`,
  which is user data on the installed machine and never part of this repo

**`node_modules/`, `.git/`:**
- Standard; not analyzed further

**`.planning/`:**
- Purpose: GSD planning artifacts (this document's home)
- Generated: partially (command-generated docs like this one)
- Committed: per repo convention — check `.gitignore` before assuming

---

*Structure analysis: 2026-08-20*
