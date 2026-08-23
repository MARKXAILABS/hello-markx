# Phase 2: The Daemon and the Protocol - Context

**Gathered:** 2026-08-21
**Status:** Ready for planning
**Mode:** `--auto` (yolo) — every gray area auto-resolved to the researched recommendation. Four
parallel advisor-researcher agents ran; every load-bearing claim below was then re-verified by the
orchestrator against live source before being locked. Claims that did not survive that check are
marked **CORRECTED**, and the corrected fact is what is locked.

**Amended 2026-08-21 after `02-RESEARCH.md`.** The phase researcher ran live probes that corrected
seven decisions in this file, and each amendment below was itself re-verified by the orchestrator
against source before being written in: D-05 (only two of criterion 1's four tests are actually
blocked by the split), D-06 (the Phase 1 overlap is five files, and the npm-10 lockfile constraint
forbids touching `package.json`), D-11 (the headless audit misses two IPC-*push* paths that break
mail routing outright), D-14 (cloudflared has no publisher checksum), D-23 (`WebhookServer` has no
path routing, so the PWA cannot simply be dropped into it), D-25 (the MCP no-op is now
**live-verified**, not suspected), D-26/D-33 (kimi is per-agent-isolatable and its bridge is cheap —
but building it adds a fifth unverified bridge). Nothing here is inherited on trust.

**Measured baseline at `2f29d0b` (Windows 11, this machine, 2026-08-21):**
`npm test` → **515 tests / 511 pass / 0 fail / 4 skipped**. `npm run typecheck` → **0 errors**.
`npm run build` → **✓ built in 41.17s**. Every number in this document was produced by a command run
in this session; nothing here is quoted from a prior SUMMARY.

<domain>
## Phase Boundary

The office stops depending on a window and stops depending on one engine. Twelve requirements:
DAEMON-01…05, GSD-06, PARITY-01a, PARITY-01b, PARITY-02, PARITY-03, STRUCT-01, STRUCT-02.

**The internal gate is real and comes first.** STRUCT-01 + STRUCT-02 are criterion 1, and no plan
for DAEMON-01, DAEMON-05 or PARITY may start until it is verified green.

**In scope:** the twelve requirements, plus the honesty work each one implies — deleting or
correcting any claim this phase makes false, and stating a limitation in source, docs *and* UI
wherever a capability genuinely cannot be built under the standing constraints.

**Out of scope:** anything belonging to a later phase — many-floor isolation (SCALE-01, Phase 3), the
replayable timeline (SCALE-03, Phase 3), the crash-surviving record (RECORD-01/02, Phase 4),
server-enforced memory scope (RECALL-02, Phase 5), running GSD on the floor (Phase 6). Also out of
scope: iOS, an app-store build, and any paid tier of anything.

**Phase 1 dependency status — VERIFIED SATISFIED, 2026-08-21.** The roadmap makes Phase 2 depend on
exactly three Phase 1 items. All three are landed at `2f29d0b`, which is why this phase is plannable
now even though Phase 1 is 18/23 plans complete:

| Dependency | Verified how | State |
|---|---|---|
| FLOOR-02 | `src/main/delivery.ts:518` `drainQueue`, `:643` `quiesce`; `useHive.ts:746` reads "THE QUEUE AND ITS DRAIN ARE MAIN'S NOW" | **landed** |
| FLOOR-03 | `package.json` → `electron ^43.4.1`, `electron-builder ^26.15.3` | **landed** |
| GATE-01 | `index.ts:556-557` `ptyManager.setHookTokenSource((agentId) => hookServer.mintToken(agentId))`; zero `process.env.HIVE_SOCK_TOKEN` assignments remain in `index.ts`/`pty.ts` | **landed** |

The five open Phase 1 plans (19, 20, 21, 22, 23) touch renderer accessibility, eslint, renderer
component tests and doc claims. **Plan 21 is the only one that touches `src/main` at all**
(`knowledge.ts`, `nodeInstall.ts`, `slack.ts`) — and it does not touch `index.ts` or `hive.ts`, so it
cannot collide with the extraction. See D-06 for the one ordering constraint that follows.

</domain>

<decisions>
## Implementation Decisions

### The god-file extractions — the internal gate (STRUCT-01, STRUCT-02)

- **D-01:** **CORRECTED: the roadmap's line counts are stale, and the plan must re-measure rather than
  quote them.** Measured 2026-08-21: `src/main/index.ts` is **5,812** lines (roadmap says 5,620) with
  **153** `ipcMain.handle` registrations (roadmap says ~157), **35** top-level `let`/`var` module
  globals and ~30 top-level `const x = new X(...)` constructions. `src/main/hive.ts` is **4,121**
  lines (roadmap says 3,562 — it grew 559 lines during Phase 1). Every count in a plan must come
  from a command run in the same session, per the standing evidence rule.

- **D-02:** **CORRECTED, AND THIS CHANGES WHAT THE EXTRACTION IS FOR. The roadmap's stated reason that
  `index.ts` cannot be tested is the wrong mechanism.** The roadmap says: "`index.ts` imports
  `electron`, so it cannot be loaded under `node --test`; a headless boot path added in place would
  be untestable by construction." Measured directly —
  `node -e "require('./test/load-ts.cjs')('src/main/index.ts')"` gets **past** the `electron` import
  (`test/load-ts.cjs` has shipped an electron stub for exactly this reason since issue #55), then
  **executes `initFileLogging()` for real** (it created `…\Temp\md-electron-stub\logs\main.log`) and
  dies at `TypeError: electron_1.app.on is not a function` — the module-scope
  `app.on('render-process-gone')` at `index.ts:188`.
  The blocker is **module-scope side effects, not the import**. `src/main/hive.ts` — 4,121 lines — is
  already loaded and tested under `node --test` by five test files today (`engine-parity`,
  `hive-cwd`, `hive-durability`, `hive-hook-node`, `hive-protocol-v2`).
  **Two consequences the planner must carry:**
  1. The extraction's success test is **not** "fewer lines". It is **no module-scope side effects
     plus an injectable boot function**. A split that moves 3,000 lines into new files that still
     construct singletons at import time buys nothing and would pass a line-count gate.
  2. `test/main-hardening.test.cjs:5-7` states the wrong reason in source ("src/main/index.ts itself
     cannot be loaded here — it imports 'electron'"). That is a false claim in a test file and is
     corrected as part of this phase.

- **D-03:** **The extraction target: `src/main/floor/` with an injectable `bootFloor(deps)`, and
  `index.ts` reduced to Electron wiring.** Researched against the twelve electron-importing main
  modules: the Electron surface they actually use is small and injectable — `app.getPath`,
  `app.getAppPath`, `app.isPackaged`, `app.getVersion`, `app.quit`,
  `safeStorage.{isEncryptionAvailable,encryptString,decryptString}`, `Notification`, `dialog.*`,
  `shell.openExternal`, plus `ipcMain.handle` and `WebContents`. The dependency object is ~7 fields,
  not an abstraction tax:

  ```ts
  // src/main/floor/deps.ts
  export type FloorDeps = {
    paths: { userData: string; logs: string; appPath: string };
    version: string;
    packaged: boolean;
    secrets: { available(): boolean; encrypt(s: string): Buffer; decrypt(b: Buffer): string };
    notify(o: { title: string; body: string }): void;
    // ⚠ MUST return boolean — see the landmine note below. NOT `void`.
    send(channel: string, payload: unknown): boolean;  // replaces every liveWebContents().send
    quit(): void;
  };
  // src/main/floor/boot.ts
  export async function bootFloor(deps: FloorDeps): Promise<Floor>;  // constructs everything INSIDE
  ```

  Three rules make it hold, each separately checkable:
  1. **No module-scope `new X()` anywhere under `src/main/floor/**`.** Construction moves inside
     `bootFloor`. This is the single thing that blocks `loadTs` today.
  2. `src/main/index.ts` keeps every `app.on`, `ipcMain.handle(name, wrapper)`, `BrowserWindow`,
     `powerMonitor` and `dialog` call. It is never `node --test`-ed and does not need to be. Its
     whole `whenReady` body becomes `bootFloor(electronDeps()).then(registerIpc)`.
  3. Precedent: VS Code's `src/vs/code/electron-main/main.ts` is exactly this split — a `CodeMain`
     class whose `main()` → `startup()` runs `createServices()` / `initServices()` /
     `claimInstance()`, with the entry file reduced to `const code = new CodeMain(); code.main();`.

  **⚠ LANDMINE, found by pattern mapping and verified in source — copying the house pattern here
  silently breaks D-11.** `DeliveryDeps` (`src/main/delivery.ts:94-162`) is otherwise the exact model
  for `FloorDeps`, and the obvious move is to copy its `emit` signature. Do not: `delivery.ts:153`
  declares `emit: (channel: string, payload: unknown) => void`, while `hive.ts:1671` branches on
  `this.emit?.(…) === true`. A `void`-returning `send` makes that comparison **permanently false**,
  which is exactly the "all terminal-handoff mail bounces to the god" bug D-11 exists to fix — so a
  faithful copy of the local convention would re-introduce the defect while looking idiomatic.
  `FloorDeps.send` returns `boolean`. Also note the in-repo forward order is already written twice:
  `bootstrapHiveServices()` (`index.ts:5537-5577`) is `bootFloor`'s sequence and `SHUTDOWN_STEPS`
  (`:4340-4357`) is `Floor.shutdown()`'s.

- **D-04:** **The seams are already written down in the source; do not invent a new taxonomy.**
  `index.ts:4340-4357` declares `SHUTDOWN_STEPS`, a 16-entry declarative list of every subsystem that
  owns a timer, server or handle: `clearMissionTimers`, `clearContextTimers`,
  `stopWebhookDoneObserver`, `stopWorkerWatcher`, `broker.stop`, `stopRouter`, `hookServer.stop`,
  `telemetry.stop`, `slack.stop`, `webhook.stop`, `memory.stop`, `reflector.stop`, `delivery.stop`,
  `stopAllProxyBridges`, `persist.close`, `killAll`. That list **is** the inverse of `bootFloor`, and
  the `whenReady` block (`index.ts:5679-5790`) is the forward order. `index.ts` additionally carries
  ~50 `// ─── … ───` section banners (`IPC: pty lifecycle`, `IPC: hive`, `IPC: git`, …) which are the
  author's own module boundaries. Extract along those, not along a new scheme.

- **D-05:** **The gate is a test, not a metric.** Criterion 1 is verified green by
  `test/boot-floor.test.cjs`: `loadTs('src/main/floor/boot.ts')`, build `fakeDeps` from `os.tmpdir()`
  + an identity encrypt + a `send` that pushes into an array, `await bootFloor(fakeDeps)`, then
  assert the router started and the hook server is listening on a temp socket. No Electron binary —
  and CI already installs with `npm ci --ignore-scripts`, so it runs on all three platforms
  unchanged. Plus `npm run build` from a clean clone. A green `test/boot-floor.test.cjs` is what
  flips the gate; a line count never is.
  **CORRECTED by research (2026-08-21): only TWO of the four tests criterion 1 names are actually
  blocked by the split.** Measured: the **git committer** already has four tests driving
  `hive.flushCommit(root)` against real git (`hive-durability.test.cjs:250,270,295,323` plus
  `engine-parity.test.cjs:359`), and the **mail router** is writable today — `routeOnce()` is a
  public method (`hive.ts:1711`) and returns 1 against a tmpdir hive with no split at all. Only
  **shutdown** and **agent lifecycle** are genuinely blocked by module-scope construction. A plan or
  SUMMARY claiming all four "could not be written before the split" would be a false claim of exactly
  the kind this phase exists to remove. Write all four, but describe only two as newly-possible.

- **D-06:** **Ordering against Phase 1: the extraction lands AFTER plan 01-21 (the eslint pass).** Not a
  file collision — plan 21 touches `src/main/{knowledge,nodeInstall,slack}.ts` and the extraction
  touches `index.ts`/`hive.ts`, which are disjoint. The reason is the lint config: plan 21 introduces
  the eslint ruleset and fixes the repo against it, and landing ~9,900 lines of moved code first means
  either linting it twice or shipping the extraction under a ruleset that changes underneath it. If
  plan 21 has not landed when Phase 2 execution starts, the extraction plan waits; nothing else in
  Phase 2 does.
  **CORRECTED by research — the overlap is five files, not zero, and one of them is the lockfile.**
  Plan 01-21's `files_modified` is `eslint.config.js`, `package.json`, `package-lock.json`,
  `.github/workflows/ci.yml`, `test/ci-config.test.cjs`, `src/main/{knowledge,nodeInstall,slack}.ts`,
  and the wildcard `src/renderer/src/**/*.{ts,tsx}`. Phase 2 needs four of those: `slack.ts` (D-15's
  shared tunnel helper), `ci.yml` and `test/ci-config.test.cjs` (any new CI surface), and the
  renderer wildcard (D-31's capability line). **`index.ts` and `hive.ts` are still disjoint**, so the
  extraction itself remains safe — but every non-extraction Phase 2 plan that touches those four must
  either wait for 01-21 or declare the conflict.
  **And a standing constraint bites here: `package-lock.json` is written by npm 10, never npm 11 —
  but this machine has npm 11.6.2 and no npm 10** (measured: `npm --version` → `11.6.2`). Therefore
  **no Phase 2 plan may modify `package.json` or `package-lock.json`.** Concretely: do **not** remove
  the now-unused `tunnelmole` dependency as part of D-14. Leaving an unused dep is a cosmetic debt;
  rewriting the lockfile with the wrong npm major is a CI-breaking one on three hard-gated platforms.
  Removal is deferred to a session with npm 10 available.

- **D-07:** **`hive.ts` is split for the seam, not for testability — and the plan must say so.** The
  roadmap's rationale ("the extraction is what turns 'runs headless' from a claim into a test") is
  true of `index.ts` and **false of `hive.ts`**, which five test files already load under
  `node --test`. STRUCT-02's real justification is the other one the roadmap gives, which does
  survive: PARITY-01a/02 has to touch the mail router and the per-provider installers and templates
  (`hive.ts:679-820`, `:2422-2500`, `:3747-3788`), so this phase opens that seam regardless. Splitting
  it into git committer / router / provisioning / ledger / shim templates is what keeps that work from
  being four agents editing one 4,121-line file. Do not repeat the testability claim for `hive.ts` in
  any plan or SUMMARY.

### Headless — the floor with no window (DAEMON-01)

- **D-08:** **Windowless Electron, one process. NOT a separate plain-Node daemon.** Measured on this
  machine (Electron 43.4.1, Windows 11): a windowless Electron main reaches `whenReady` in 36-47 ms
  with `BrowserWindow.getAllWindows().length === 0` and stays alive — nothing auto-quits when a
  window was never opened.
  The decisive argument against a plain-Node daemon is not the wire protocol, it is **`safeStorage`**:
  `src/main/integrations.ts:19` imports it from `electron` and `:122-125` gates every secret write on
  `safeStorage.isEncryptionAvailable()` / `encryptString`. There is no plain-Node equivalent, so a
  Node daemon either cannot own integrations or the at-rest encryption scheme changes — and the tunnel
  and MCP work in this same phase depend on those secrets.
  **CORRECTED against my own initial assumption:** native-module ABI is *not* an argument either way.
  Measured — `better-sqlite3@^13` resolves an N-API prebuild (`prebuilds/win32-x64.node`) and both it
  and `node-pty@1.1.0` load successfully under plain Node v24. The ABI would not have blocked a Node
  daemon; `safeStorage` does.
  Accepted cost, stated out loud: **~290 MB resident for a floor with no windows** (measured: three OS
  processes — Browser 103,612 KB + GPU 112,376 KB + Utility 82,224 KB) versus 39.0 MB for the same two
  native modules under plain Node. `app.disableHardwareAcceleration()` does **not** remove the GPU
  process (91,956 KB with it off). On a single-operator machine already running Electron plus N PTYs
  this is the cheapest thing in the process table — but it is a real number and no plan may describe
  headless mode as "free".

- **D-09:** **DAEMON-01 IS A DEADLOCK FIX, NOT ONLY A BOOT FLAG. Measured hazard.**
  `index.ts:5783-5790`: `before-quit` calls `e.preventDefault()` whenever
  `ptyManager.list().length > 0`, and only *then* sends `app:closeRequested` **inside an
  `if (mainWindow)` guard**. With no window and live PTYs, quit is prevented and nothing can ever
  confirm it — **the headless floor is unquittable**. A second copy of the same shape sits at
  `index.ts:2805-2811` (per-window). `app:confirmClose` is an `ipcMain.handle` (`index.ts:4375`), so
  the confirmation is renderer-only by construction.
  Every plan that claims DAEMON-01 must close this: with no window, `before-quit` takes the
  `teardownAndQuit()` path directly (or an equivalent non-interactive confirmation), and there must be
  a test that a headless floor with live PTYs actually quits.

- **D-10:** **The flag, the login item and the re-attach are four small, named edits.**
  1. `process.argv.includes('--headless')`, read where `whenReady` already scans argv for the
     `hellomarkx://` cold-start deep link (`index.ts:5703`). It gates `createWindow()`.
  2. `app.on('window-all-closed')` at `index.ts:5792` currently calls `ptyManager.killAll()` +
     `app.quit()` on non-darwin. In headless mode this must not fire — **forgetting this gate silently
     kills the floor the moment a window closes**, the exact opposite of the requirement.
  3. Re-attach: `app.requestSingleInstanceLock()` at `index.ts:2610` and the `second-instance` handler
     at `:2615` already exist; the handler focuses `mainWindow` and does nothing when there is none.
     Adding `else createWindow()` is the whole re-attach story — relaunch the binary with no flag and
     a window opens onto the running floor.
  4. Start at login: `index.ts:4657` already calls `app.setLoginItemSettings`; it gains
     `args: ['--headless']`. `args` is Windows/macOS only and `setLoginItemSettings` is a **no-op on
     Linux** — state that, do not paper over it.
  5. macOS background presence uses `app.setActivationPolicy('accessory')`, not `app.dock.hide()` (the
     v43 `Dock` docs carry a "calling hide within one second of a previous call has no effect"
     limitation, and `app.dock` is `undefined` off macOS). **Unverified — no Mac available.** Ships
     marked, per the standing rule.

- **D-11:** **What headless actually risks is small and was measured, so the audit is bounded.**
  `src/main` contains exactly **5** `webContents.send` call sites (3 in `index.ts` —
  `app:closeRequested`, `hire:error`, `hire:import` — 1 in `telemetry.ts`, 1 in `hive.ts`), and main
  owns its own timers (`delivery.ts` tick, `hive.ts` router, `hooks.ts` socket watchdog, the
  scheduler, the Slack done-poll, the breaker beat). The renderer has 8 `setInterval`s in
  `src/renderer/src/hooks/` and they are UI pollers. So the poller-and-sender census is: those 5 send
  sites (each must degrade, not throw, with no window) and those 8 pollers (none may be the only
  driver of autonomous work).
  **CORRECTED by research — THAT CENSUS IS NOT THE WHOLE AUDIT, AND THE TWO IT MISSES ARE THE ONES
  THAT BREAK THE FLOOR.** Both are IPC-*push* listeners, which a `webContents.send` / `setInterval`
  census cannot see, and both were verified in source:
  1. **`hive.ts:1670-1680` `emitTerminalHandoff`** computes
     `const delivered = this.emit?.('hive:terminalHandoff', {…}) === true;`. With no renderer the
     emitter does not return `true`, so `delivered` is `false` and **every piece of mail addressed to
     a terminal-handoff engine — qwen, crush, opencode, pi (and kimi, if it gains a bridge) — bounces
     to the god** with an `[undeliverable — … renderer unavailable]` subject. The source documents
     its own failure mode in the comment directly above it ("hand direct mail to the renderer so it
     can queue a terminal work order"). A headless floor would look healthy while silently routing a
     whole tier's mail to one agent.
  2. **Crush's protocol seed never arrives headless.** Crush is the only provider with
     `seedDelivery: 'type-into-tui'` (`agentProvider.ts:452`), and `hive.ts:1071` returns the seed as
     `seedPrompt` for the **renderer** to type (`useHive.ts:341`, `AddAgentModal.tsx:413`). With no
     window a crush agent spawns and never learns the hive protocol at all.
  Both have the same fix — route through `delivery.enqueue()` in main, which already owns the one
  PTY-write gate (D-12) — and both are load-bearing for criterion 2's "mail still routes between
  them". Any DAEMON-01 plan that ships without closing these two has not delivered the requirement.
  **And the fix has an exact in-repo precedent, so it does not need inventing.** `index.ts:411-434`:
  `accountPool`'s injected `emit` intercepts one renderer-bound channel and runs it in main instead —
  `if (channel === 'claudeAccount:failover') { delivery.failover(...); return; }` — with a comment
  recording why ("MAIN owns the kill→respawn now… two executors would respawn the same agent twice",
  upstream #151). `emitTerminalHandoff` needs the same move, comment discipline included. Copy that
  shape rather than inventing a parallel one.

- **D-12:** **ADR-0001 IS NOW FALSE AND NO PHASE 1 PLAN OWNS IT.**
  `docs/adr/0001-one-gate-for-pty-writes.md` states: "Exactly one place types automatic text into a
  live agent's PTY: **the drain loop, `useHive.ts` effect #4**." FLOOR-02 moved that drain into main
  (`src/main/delivery.ts:518 drainQueue`), and `useHive.ts:746` now reads "THE QUEUE AND ITS DRAIN ARE
  MAIN'S NOW (#5 / FLOOR-02)". Checked plan 01-23's `files_modified`: the doc-claim sweep covers
  STACK / CONCERNS / PROJECT / INTEGRATIONS / CONVENTIONS / ARCHITECTURE / STRUCTURE / REQUIREMENTS
  and **not** `docs/adr/`. So this is an unowned stale claim that Phase 2 inherits. It belongs to
  DAEMON-01, because ADR-0001 defines where PTY writes come from and a windowless floor makes "main is
  the only typer" load-bearing. Amend it — the decision holds, its named location moved. While there,
  clear the residue: `useHive.ts:26` still imports `deliverWithAcknowledgement`, which the file no
  longer uses, and comments at `:853` and `:888` still say "effect #4 above then drains it to his PTY".

### The tunnel that actually closes (DAEMON-05)

- **D-13:** **CORRECTED: DAEMON-05's stop-criterion is NOT impossible. The blocker is library mode, not
  the vendor.** `src/main/slack.ts:158-161` and `src/main/webhook.ts:224-227` both state "tunnelmole()
  resolves with a URL STRING and nothing else — no websocket, no disposer… There is genuinely no
  handle to capture." That is accurate **about the library call**: `dist/src/index.js` exports only
  `tunnelmole` and the websocket created in `connect()` never escapes to the caller. But the CLI is a
  thin wrapper over the same function, so **running the tunnel as a child process makes the OS process
  handle the missing disposer**. Both candidates were live-tested on this Windows 11 machine today and
  both pass the gating property.

- **D-14:** **Spawn `cloudflared tunnel --url http://127.0.0.1:PORT` as a child process. Drop the
  `tunnelmole` library call.** Live-verified close on Win11: `200` → kill (12 ms) → `502` → `530`
  steady, and never `200` again. No account, no card, no expiry; a single static Go binary with no
  Node dep tree, so it needs neither `asarUnpack` nor an `ELECTRON_RUN_AS_NODE` wrapper; hostname is
  random words (`adams-medical-meeting-enormous`) that leak nothing.
  **Why not tunnelmole-as-child, which is a smaller diff and zero new dependencies:** its public
  hostname **embeds the operator's WAN IP** — measured live: `bdmjlf-ip-49-36-124-85.tunnelmole.net`.
  Anyone handed that URL learns the home IP, on a door fronting agent CLIs running with bypassed
  permissions. It also phones home on install and on every CLI start. Under this project's security
  bar that is not a quiet trade, so the smaller diff loses.
  **`bore.pub` is disqualified outright:** plain TCP with no TLS, which breaks the PWA (service
  workers need a secure context, D-18) and would put the generated auth token on the wire in
  cleartext.
  **Acquisition facts, verified against cloudflared `2026.8.2`:** win-amd64 is **52.4 MB**, there is
  **no `cloudflared-windows-arm64` asset**, macOS ships as tarballs rather than bare binaries, and —
  the one that matters for supply chain — **Cloudflare publishes no checksum file**; GitHub's
  `assets[].digest` field is the only digest available. So "download on first enable" must pin a
  release tag and verify against a SHA-256 committed into this repo, not against a vendor checksum
  that does not exist. **And per D-06, this must not add an npm dependency** — the lockfile is
  untouchable this phase.
  **The acquisition pattern already exists in this repo:** `src/main/nodeInstall.ts:114-170` does
  download → refuse-without-digest → per-platform artifact returning `null` when unsupported, which is
  exactly the shape cloudflared needs (including the `null` for `windows-arm64`). Its one divergence:
  `nodeInstall`'s `shaFor()` reads Node's published `SHASUMS256.txt`, and Cloudflare publishes no
  equivalent — so the digest is a committed repo constant instead of a fetched file, and the plan must
  say that out loud rather than leaving a reader to assume a vendor checksum was verified.

- **D-15:** **The kill is already written; the duplication is not.** `src/main/procKill.ts:34`
  `hardKillTree(pid)` already does `taskkill /pid X /T /F` on win32 and group-SIGKILL on POSIX, so the
  cross-platform close is a call, not new code. And `openTunnel()` in `slack.ts:211-221` and
  `webhook.ts:276-286` are **byte-identical** (same TODO comment, same timeout, same dynamic import),
  as are their `stop()` bodies (byte-identity `diff`-proven, not eyeballed). The change belongs in
  **one shared helper** that both servers use — landing it twice is how the two copies drifted into
  two identical bugs in the first place.
  **Design consequence from pattern mapping, not a preference: the helper must accept its spawner as
  an injected option.** No existing test in this repo fakes a spawner — `hive.ts:1302` calls `spawn`
  directly — so if `tunnel.ts` calls `spawn` at module or method scope, `test/tunnel.test.cjs` cannot
  exist and D-16's `stop()` → `hardKillTree` assertion has no home. Inject the spawner and the binary
  path both, following the same electron-free-by-injection rule `delivery.ts`, `webhook.ts` and
  `slack.ts` all state in their headers.

- **D-16:** **The close test polls; it does not assert a thrown error or a single status.** Discovered
  empirically, not assumed: after the child is killed, cloudflared's public URL answers with an **HTTP
  error response, not a network-level error**, and there is a ~7 s transient (502 first, then 530
  steady). A test that awaits a rejected `fetch`, or pins one status code with no poll window, will be
  flaky. The correct assertion is: **poll until the response is non-200 and the body is no longer the
  app's content, within ~15 s.** This costs one real outbound tunnel per run — a live-network
  dependency — so it belongs in a targeted test, not in the default `npm test` gate that must stay
  green offline on three platforms.

- **D-17:** **THE LIMITATION THAT MUST SHIP STATED: no $0, no-account tunnel gives a stable URL.** Both
  viable options mint a fresh random hostname per open. At $0 the genuine choice is *stable URL*
  (Tailscale Funnel — free Personal plan, `device.tailnet.ts.net`, but it needs an account and a
  system-level daemon, and **its close semantics could not be live-verified**, so nothing may let it
  through DAEMON-05 without a live run) **or** *zero-setup ephemeral URL* (cloudflared). Not both.
  DAEMON-05's "the live public URL is always visible in the UI" is well matched to the ephemeral
  option. DAEMON-02's "added to the home screen" is not — see D-19.
  Two further cloudflared limits, from Cloudflare's docs rather than measured here, that the plan must
  carry rather than discover: **200 concurrent in-flight requests**, and **no SSE** (which independently
  confirms D-22). Cloudflare's own docs describe quick tunnels as "testing and development only", and
  long-run stability was verified only for ~30 s — a multi-hour soak is worth one run before this
  fronts anything.

### The phone (DAEMON-02)

- **D-18:** **THE TUNNEL IS MANDATORY FOR THE PHONE. This is a browser rule, not a preference.**
  Android Chrome will not install a PWA (no WebAPK, no `display: standalone`, no service worker, no
  push) from a non-secure origin, and **`http://192.168.x.x` is not a secure context** — only loopback
  and `localhost` get the exemption. The `unsafely-treat-insecure-origin-as-secure` escape hatch needs
  command-line flags Android only accepts on a rooted/dev device. Chromium's own position: "WebAPKs
  cannot be generated for URLs not accessible to the wider internet." A tunnel host is an ordinary
  secure origin with a valid public cert, so the tunnel path is installable with **zero HTTPS code in
  the daemon**.
  Consequence: DAEMON-02 cannot be delivered LAN-only. A LAN-only fallback is a browser-branded
  home-screen shortcut, and calling that "a PWA added to the home screen" would be the exact
  over-claim this project bans. (A service worker is no longer required for *installability* — Chrome
  dropped that in 108 on mobile — but it is still required for push, and the secure-origin rule is
  unchanged.)

- **D-19:** **Origin churn is the dominant failure mode; the answer is QR re-onboarding.** A new tunnel
  hostname is a *different app* to the browser: the installed WebAPK's `start_url`, the service worker
  registration, Cache Storage / IndexedDB / localStorage, cookies and the Web Push subscription all
  die together. `slack.ts` already tells the operator the URL "is ephemeral and changes per restart".
  So the phone surface is designed so re-onboarding is **one operator action**: the desktop UI renders
  a QR encoding `https://<new-host>/phone/#<enrollment-token>`; the phone scans it; the token is
  exchanged once for a long-lived bearer held in origin-scoped IndexedDB and sent as an
  `Authorization` header.
  Why this shape: the QR carries the origin **and** the credential together, which is the only way one
  action fixes both halves; the token rides in the URL `#fragment`, so it never reaches the server,
  never enters `Referer` and never lands in an access log; and the enrollment token is burned on first
  use, so a photographed or stale QR is worthless.

- **D-20:** **Rejected, with reasons recorded.**
  - *Signed `HttpOnly; Secure; SameSite` session cookie instead of a bearer* — genuinely safe on these
    hosts (`tunnelmole.net`, `trycloudflare.com` and `ngrok-free.app` are all on the Public Suffix
    List, so a co-tenant cannot cookie-toss onto our origin), but it is origin-scoped and dies with
    the hostname exactly like the bearer, so it buys nothing against the actual failure mode while
    adding `Cookie`/`Set-Cookie` parsing to the trust boundary. Revisit if the phone bundle ever loads
    third-party script and XSS becomes live.
  - *WebAuthn / passkey* — **structurally broken here.** The RP ID must be the origin's registrable
    domain, and `tunnelmole.net` is a public suffix, so the credential binds to the exact random
    hostname and dies every session. Re-evaluate only on a permanently stable origin.
  - *ngrok free static domain* — free HTML traffic gets an interstitial a browser navigation cannot
    bypass, plus 20k requests / 1 GB per month; removing it costs $8-10/mo → violates the $0 rule.
  - *Serving the phone shell from a free stable static host and pointing it at the tunnel* — the
    cleanest fix for install/SW/push churn, but it contradicts DAEMON-02's "served by the daemon" and
    adds CORS to the trust boundary. On the record, not adopted.

- **D-21:** **The phone bundle is hand-written static files under `resources/phone/`, served by the
  existing `WebhookServer`. It is NOT a route in the renderer.** Measured: the renderer's main chunk is
  **12,228.98 kB** (`out/renderer/assets/index-BUj21S7k.js`) and its entry pulls Pixi, Monaco and
  xterm. Worse than size, the renderer is written against the preload `window.cth` IPC bridge, which
  does not exist in a phone browser — so "a route in the renderer" is not a cheaper phone surface, it
  is a rewrite of the renderer's data layer. The phone needs a question list, a text box and a POST:
  `index.html` + `sw.js` + `manifest.webmanifest` + two icons (192px and 512px, per the manifest
  requirements), plus a static handler (`createReadStream` + MIME map + `Cache-Control`) in
  `webhook.ts`. `sw.js` has to be a real top-level file for scope regardless. If it outgrows a few
  hundred lines, promote it to a second entry in `electron.vite.config.ts`'s existing input map — a
  one-key addition, deliberately the upgrade path rather than paid for now.

- **D-22:** **Notification shape: visibility-gated polling for the foreground, Web Push (VAPID) for the
  pocket. Do NOT build on SSE.** Web Push is genuinely free on Android Chrome with no Firebase project
  and no `gcm_sender_id` — standard Web Push Protocol with VAPID auth — and everything server-side is
  reachable from Node core `crypto` on the pinned `node >=20 <23` (`generateKeyPairSync('ec')`,
  `diffieHellman`, `hkdfSync`, `createCipheriv('aes-128-gcm')`,
  `sign(…, {dsaEncoding:'ieee-p1363'})`). It is the only option that works while the tunnel is down
  and the phone is asleep, because the daemon POSTs *outbound* to the push endpoint. Its subscription
  dies with the origin, like everything else in D-19.
  SSE is excluded on two independent grounds: TryCloudflare quick tunnels **explicitly do not support
  Server-Sent Events** (D-17), and SSE only delivers while the page is foregrounded — exactly the
  window where a `setInterval` gated on `document.visibilityState === 'visible'` is already adequate.

- **D-23:** **Reuse `WebhookServer`'s trust boundary verbatim; do not write a second one.** Verified:
  `src/main/webhook.ts` is 468 lines, free of any `electron` import so it unit-tests as plain Node,
  binds `127.0.0.1` **only** (`:268`), and already implements many-endpoints-one-server-one-tunnel,
  constant-time secret comparison with both sides hashed to fixed width, an unknown-endpoint id
  answered identically to a wrong secret (no enumeration signal), a request body cap, and fixed-window
  rate limits both global and per-endpoint (`allowRequest` at `:289`, called at `:302` and `:306`).
  The PWA's auth endpoint gets its rate-limit and lockout from that machinery.
  **One honest caveat already noted in the source at `webhook.ts:156`:** behind a tunnel every client
  presents the tunnel's IP, so per-IP limiting is meaningless and a global lockout is remotely
  DoS-able. Say that in the plan; do not claim per-client lockout.
  **CORRECTED by research — "reuse it" is not "drop files in it". Three concrete obstacles, all
  verified in source:**
  1. **`WebhookServer` has no path routing at all.** `readEndpointId` (`webhook.ts:422-430`) returns
     `LEGACY_ENDPOINT_ID` for `/`, the single segment for `/x`, and **`null` for anything with more
     than one segment** — and `null` is answered identically to a wrong secret (that uniformity is
     the no-enumeration property, deliberately). So `/phone/index.html` **401s**. Serving a static
     bundle requires adding real path routing to a file whose current design says every path is one
     endpoint id.
  2. **`phone` would collide with the operator-controlled endpoint-id namespace.** Endpoint ids come
     from user-configured webhook triggers; nothing reserves `phone`. The plan must either reserve a
     prefix that cannot be a valid endpoint id or route the PWA before the endpoint lookup.
  3. **Do not reach for `app.isPackaged` to locate the static root.** `webhook.ts` has **no
     `electron` import today**, and that is the exact property D-23 is reusing — it is why the file
     unit-tests as plain Node on three platforms. Resolving the bundle path must be injected by the
     caller, never imported.

### Telegram and Discord (DAEMON-03)

- **D-24:** **They ride the existing webhook rails, with one honest extension: a per-endpoint
  verification strategy.** Today every endpoint is gated by one shape — a constant-time compare of
  `x-md-webhook-secret`. Telegram fits directly (its `setWebhook` `secret_token` arrives as
  `X-Telegram-Bot-Api-Secret-Token`, a header compare). Discord does not: interactions are verified by
  Ed25519 over `timestamp + body`. **Measured: `node:crypto` verifies Ed25519 natively** — a local
  `generateKeyPairSync('ed25519')` / `sign` / `verify` round trip returns `true` — so this costs
  **zero new dependencies**, but it does mean `WebhookServer` grows a per-endpoint verifier instead of
  one hardcoded compare. That is the real shape of "route onto the existing rails"; a plan that says
  "just add two endpoints" has not read the gate.

### MCP per agent, with consent (DAEMON-04)

- **D-25:** **CONFIRMED PREREQUISITE DEFECT — LIVE-VERIFIED, THREE RUNS. Today's default MCP bundle
  is a complete no-op.** `hive.ts:1176` computes `buildDefaultMcpServers(cwd, cfg)` and `:1192` writes
  the result as an `mcpServers` key inside the **per-session settings file** that `:1110` passes as
  `args.push('--settings', settingsPath)`.
  **Measured against `claude 2.1.236` — the exact CLI version this repo targets — using
  marker-writing stdio MCP servers driven by `claude --print`:** `mcpServers` inside a `--settings`
  file is **silently ignored**; the server process is never spawned, and no marker is written.
  `--mcp-config <file>` **does** spawn it, with and without `--strict-mcp-config`, and with no
  interactive approval prompt. So the in-source comment at `:1188-1190` ("Claude merges this
  additively") is false, and every agent on this floor has been running with zero MCP servers.
  This is Phase 2's GATE-01-shaped item, and it is now settled rather than suspected: **the fix is
  one flag** — write `<agentDir>/mcp.json` and append `--mcp-config <path>` next to the `--settings`
  already on the spawn command. Per-agent MCP built on the old channel would have been a feature
  whose every test passed and whose effect was nil.
  **One method note the plan must carry: `claude mcp list` is NOT a valid probe** — it ignores both
  `--settings` and `--mcp-config`, so it reports the user's own servers regardless and would have
  produced a false green. Verify with a marker-writing server under `claude --print`, or by the
  server process actually existing.

- **D-26:** **Per-agent is structurally free, because every agent already owns its directory.**
  `agentDir(id) = <root>/agents/<id>` (`hive.ts:527`) is the agent's cwd, and the app already writes
  `<agentDir>/.codex/config.toml` (`hive.ts:998` sets a per-agent `CODEX_HOME`),
  `<agentDir>/.opencode/plugin/` and `<agentDir>/.pi-agent/extensions/`. So any engine with a
  project-scoped config file, a home-relocating env var, or a per-invocation flag gets "per agent" for
  free. Researched per-engine support:

  | Engine | MCP | Per-agent surface | Verdict |
  |---|---|---|---|
  | claude | yes | `--mcp-config <file>` (+ `--strict-mcp-config`), live-verified on this box (v2.1.236) | supported |
  | codex | yes | per-agent `CODEX_HOME`/`config.toml` — **already wired** at `hive.ts:998` | supported, free |
  | opencode | yes | `opencode.json` in agentDir, key `mcp` | supported |
  | qwen | yes | `.qwen/settings.json` in agentDir, key `mcpServers` | supported |
  | crush | yes | `.crush.json` in agentDir, key `mcp` | supported |
  | copilot | yes | `COPILOT_HOME` or `--additional-mcp-config <file>` | supported |
  | grok | yes | project `.grok/config.toml` | supported — **single vendor source, not live-verified** |
  | antigravity | yes | workspace `.agents/mcp_config.json` | **UNVERIFIED** — documented, but an open upstream issue reports project-local config read and silently ignored |
  | kimi | yes | **CORRECTED: `kimi --config-file PATH` exists** (two official vendor pages), so a per-agent config file is expressible after all | **supported per-agent** — was wrongly listed unsupported |
  | pi | no native MCP | needs a third-party adapter | **unsupported** |
  | custom | unknowable | arbitrary binary | **unsupported** |

  Scoreboard, **corrected: 8 clean, 1 unverified (antigravity), 2 unsupported (pi, custom).** The
  card needs a literal `MCP: not supported on this engine` line for pi / custom — the same register
  as the existing `NO MAIL` and `spend UNTRACKED` declarations, and subject to D-30 (that register
  currently renders nowhere).

- **D-27:** **The consent model: floor-wide for the safe tier, per-agent grant for `write`/`secret` only.**
  Rejected: (a) a full per-agent override map over the floor default, and (b) per-agent-only with the
  floor becoming a hire-time seed. Reasons: agents here run with bypassed permissions, so an MCP grant
  is a capability grant and belongs to a grantee — but a read-only, no-secret, cwd-scoped server
  (`sequential-thinking`, `filesystem`, `git`) is not a capability grant and does not deserve
  per-agent bookkeeping on eleven cards. (a) also actively weakens the card: you cannot see which
  servers were consented *to this agent* versus inherited from a floor default, which is the exact
  signal consent exists to carry. (b) forces a config migration plus N repeated grants on a
  single-operator floor.
  It is also by far the shortest diff, because the branch it needs is **already written and already
  fail-closed**: `hive.ts:1235` reads
  `if (e.tier !== 'safe-readonly' && consented !== true) continue;` — so per-agent consent is a change
  of *where that boolean is read from*, not new logic.
  Honest cost, which must appear in the UI rather than be engineered around: a safe-readonly server is
  all-or-nothing across the floor, and any existing floor-wide `enabled:true` on a write/secret entry
  is dropped and must be re-granted per agent (fail closed).

- **D-28:** **Secrets reuse `integrations.ts`; a second store is not built.** Verified present:
  `setSecret` (`integrations.ts:118`), `hasSecret` (`:150`), `deleteSecret` (`:156`),
  `deleteSecretsWithPrefix` (`:173`), `listRecordsRedacted` (`:78-79`, which hands the renderer only a
  `hasSecret` boolean), and `secretRefFor` (`src/shared/integrations.ts:91`). Key each grant as
  `secretRefFor('mcp:<agentId>:<mcpId>')` so two agents holding the same server hold distinct keys and
  revoking one does not disarm the other. Config stores the ref, never the value; the value is
  materialised into the server's `env` main-side at spawn, exactly as the integration broker already
  does. Keep the existing fail-closed contract: if `safeStorage.isEncryptionAvailable()` is false, no
  secret is written **and the server is not armed** — an unkeyed write server is worse than an absent
  one. **Revoke must call `deleteSecret`**, or withdrawn consent leaves a live encrypted credential
  behind.

- **D-29:** **Nothing hot-reloads, so the card must say `pending · restart` rather than lie.** Claude
  Code resolves its server set at session start (verified `claude --help` v2.1.236 on this machine:
  `--mcp-config <configs...>`, `--settings <file-or-json>`, `--strict-mcp-config`); `/mcp` only
  toggles or reconnects servers *already configured for that session*, and replacing the list is an
  Agent SDK affordance with no CLI equivalent. Codex and Crush also read config at startup.
  Qwen, Antigravity, OpenCode, Copilot, Grok and Kimi reload semantics are **unverified** — do not
  claim hot-reload for any of them. Since no engine is confirmed to hot-reload, this constrains every
  option equally: granting or revoking for a **running** agent either applies at next spawn (the card
  shows `pending · restart` on that entry) or offers an explicit respawn. Silently writing the file
  while the card claims the server is active would be the dishonest option — the card would be
  describing a connection that does not exist.
  The consent step itself reuses `AddAgentModal.tsx:516-520`'s existing two-list split ("safe,
  pre-enabled" / "⚠️ needs your consent — NOT auto-enabled") plus a confirm, and must show: the
  literal launch spec (`command` + `args` verbatim), the env var **names** only, the tier, and one
  line stating this agent runs with bypassed permissions so the server's tools execute without a
  prompt. The card shows enabled + tier + secret-bound — safe tier collapsed to a count
  (`MCP: 3 safe`), each granted server named with a tier marker and a key glyph when a secret is
  bound. Never render the secret, the ref, or the env value.

### Every engine a first-class citizen (PARITY-01a, PARITY-01b, PARITY-02, PARITY-03)

- **D-30:** **THE HEADLINE, MEASURED: `capabilityLine()` HAS ZERO PRODUCTION CONSUMERS. PARITY-01b is
  100% unbuilt, and Phase 1's D-40 rests on the same false assumption.** `capabilityLine` is defined
  at `src/shared/providerAutomation.ts:332` and calls `providerCapabilities` at `:333`. Consumer count
  outside its own file: **`src/main` 0, `src/renderer` 0, `src/preload` 0.** Its only other caller
  anywhere is `test/engine-parity.test.cjs`, which asserts its *strings*
  (`/NO MAIL .*spend UNTRACKED.*NO COMPACT/`). So the app has a tested pure function whose output is
  displayed nowhere, and `README.md:59-63` documents a per-engine limitation table describing a UI
  channel that does not render. That is exactly the "a doc promising a code path that does not run"
  pattern this project bans — and Phase 1's D-40 called `capabilityLine` "the established per-engine
  gap channel — it already carries 'NO MAIL' and 'spend UNTRACKED'". It carries those strings; nothing
  shows them. **Any Phase 1 FLOOR-18 UI clause claimed as closed via `capabilityLine` must be
  re-checked.**

- **D-31:** **Where PARITY-01b's surfaces actually are, because the requirement's wording does not match
  the app.** The requirement says the UI must say so "on the agent card **and** in the assignment
  flow, before an operator assigns mail-dependent work". Verified: **the operator never assigns to a
  worker.** `TaskDetailOverlay.tsx:51-60`'s `assign` routes through the Command Center's dispatch box,
  which mails the god (`CommandCenterPanel.tsx:608` → `{ to: 'god', act: 'request' }`), and the god
  does the actual assignment via `task.cjs patch --assignee`.
  **CORRECTED by the UI contract — I had this half wrong, and the correction makes PARITY-01b's
  literal wording achievable rather than aspirational.** The *final* assignment is the god's, but the
  *flow* absolutely has an operator-facing agent picker: `CommandCenterPanel.tsx:673-682` renders a
  `SUGGESTED OWNER` `<Select>` — `agents.filter((a) => !a.isGod)`, i.e. **every non-god agent,
  unfiltered by capability** — above the dispatch textarea, defaulting to "Michael decides". So an
  operator can and does point mail-dependent work at an engine that cannot receive mail, today, from a
  dropdown. That is precisely the moment PARITY-01b names.
  **All three surfaces are therefore in scope:** **(1) `AgentCard.tsx`** (the card, as written);
  **(2) `AddAgentModal.tsx`**, where the operator picks the provider and inherits its limits before
  any work exists; and **(3) the Command Center dispatch picker** at `CommandCenterPanel.tsx:679`.
  The dispatch surface **informs, it does not veto** (`role="status"`), because the picker is
  explicitly a suggestion the god may decline — disabling the option would misrepresent how routing
  actually works.

- **D-32:** **The engine ledger, measured per engine. This is the table the plans work from.**
  `src/shared/agentProvider.ts` declares eleven presets:

  | Engine | `canReceiveInbox` | `costTracking` | Bridge |
  |---|---|---|---|
  | claude | true | `otel` | hooks |
  | codex | true | `transcript` | hooks |
  | grok | true | `none` | hooks |
  | kimi | **false** | `none` | — |
  | antigravity | true | `none` | agy-hook |
  | qwen | true | `proxy` | proxy (`OPENAI_BASE_URL`) |
  | opencode | true | `none` | plugin |
  | crush | true | `proxy` | proxy (`CRUSH_PROXY_BASE_URL`, via `CRUSH_GLOBAL_CONFIG`) |
  | pi | true | `none` | extension |
  | copilot | **false** | `none` | — |
  | custom | **false** | `none` | — |

  So: **8 of 11 can receive mail; 4 of 11 have any cost path at all.**

- **D-33:** **PARITY-01a's real work is KIMI, and it is a bridge, not a label.** The kimi preset's own
  comment reads: "It supports lifecycle hooks, but Hello MarkX does not yet install a Kimi hook
  bridge, so mail must bounce rather than being delivered with no drain path." Kimi therefore **can**
  have a routed inbox and does not have one — which is exactly what PARITY-01a covers ("every engine
  that *can* have a routed inbox has one"). Labelling kimi instead of building its bridge would be
  reading the requirement backwards. The two that fall to PARITY-01b's label are **copilot** (print
  mode exits per turn, no hook bridge captures idle, so there is no drain point) and **custom**
  (unknown binary, nothing to install into).
  **Costed by research: the kimi bridge is the CODEX case, ~50 lines.** Kimi's hook payload is
  Claude-shaped snake_case and it takes `kimi --config-file PATH`, so the bridge is a string-append
  into a per-agent TOML plus `HOOK_SHIM` **verbatim** — not a translator like `GROK_HOOK_SHIM`. That
  is the cheap end of the six existing shim templates.
  **But the honest consequence must be planned for, not discovered: building it without a Moonshot
  account makes kimi the FIFTH `LIVE-UNVERIFIED` bridge, not one fewer.** Under D-35's
  one-directional rule it ships marked. So PARITY-01a's kimi work moves the count of engines that
  *can* receive mail from 8 to 9 while moving the count of *live-verified* bridges not at all. A plan
  that presents the kimi bridge as closing a verification gap has the sign backwards; it closes a
  capability gap and opens a verification one. Both facts belong in the SUMMARY.

- **D-34:** **PARITY-02 AS WRITTEN IS UNACHIEVABLE AND MUST BE RESTATED — the same correction shape as
  Phase 1's D-02.** "All eleven engines report cost to the ledger and to the breaker" cannot be true
  for **copilot** (its own preset comment: "spend sits on the user's Copilot plan; nothing per-agent
  reaches us") or **custom** ("unknown binary — nothing to read"). No amount of work makes an engine
  emit a number it does not have, and inventing one locally would be fabrication.
  The buildable reading, which the plan must adopt explicitly: **every engine that can be pointed at a
  base URL gets cost through the proxy bridge that already exists; the rest are declared through the
  channel D-30/D-31 makes real.** The mechanism is already generic — `hive.ts:1039-1062` reads
  `bridge: {kind:'proxy', api, baseUrlEnv}`, starts a sidecar (`startProxyBridge`, `:1281`, which also
  mints that agent's GATE-01 token) and rewrites `env[desc.baseUrlEnv]` to the loopback proxy, with
  crush handled by a per-agent config file because it has no base-URL env. Candidates to extend it to:
  grok, kimi, opencode (OpenAI-compatible endpoints); antigravity would additionally need a `gemini`
  api mode in the sidecar. The plan must state which it actually delivers and mark the rest, never
  silently.

- **D-35:** **PARITY-03's marker set is eight sites in one file, and the rule is one-directional.**
  Measured: `LIVE-UNVERIFIED` appears **8 times in `src/main/hive.ts`** (`:1014`, `:1024`, `:2422`,
  `:2449`, `:2458`, `:2483`, `:3747`, `:3788`) and is described in `README.md:63` — "they have never
  been run against a live account, because doing so needs a paid subscription this project does not
  have. They stay marked until someone runs them." There is **no `live-unverified` field in the
  provider table** — the marking is comment-and-doc only, which is worth knowing before a plan
  proposes to "unmark" anything. A bridge is unmarked only after a real session against a real
  account, and otherwise stays marked. Under the zero-recurring-cost rule the honest default outcome
  for pi / opencode / crush / qwen is **still marked**, and a plan that schedules "verify the four
  bridges" without an operator-supplied account is scheduling a lie.

### The human's answer reaches the right agent (GSD-06)

- **D-36:** **The protocol already supports it; the defect is one hardcoded UI field plus one missing
  record field.** `HiveMessage.to` is documented at `hive.ts:57` as "an agentId, `'god'`, or
  `'broadcast'`", and `HiveMessage` already carries `conversation` and `in_reply_to`. The hardcode is
  at **`AskMeTab.tsx:92`** — `to: 'god'` — **CORRECTED from the roadmap's `:93`**.

- **D-37:** **Add `askedBy` to the `humanQA` entry, captured exactly the way `claim` already captures
  identity.** Today `task.cjs patch <id> --q "…"` appends `{ q, askedAt }` and blocks the card
  (`hive.ts:3458`) — there is **no record of who asked**, so the UI has nothing to answer *to*. The
  identity is already in hand: `task.cjs`'s own `claim` branch reads `process.env.AGENT_ID`, and
  `AGENT_ID` is put in every agent's PTY environment (`hive.ts:936-940` → `pty.ts:731`). So the fix is
  the same one-line pattern the file already uses:
  `humanQA.concat([{ q, askedAt, askedBy: process.env.AGENT_ID || 'god' }])`. `AskMeTab` then
  addresses `open.askedBy ?? task.assignee ?? 'god'`. Back-compatible by construction: an entry
  written before this change has no `askedBy` and falls through to the assignee, then to the god —
  exactly today's behaviour.

- **D-38:** **The answer goes to that agent's INBOX, never into its PTY, and ADR-0001 stays intact.**
  `TaskDetailOverlay.tsx:51` records the current convention — "the human never writes into a worker's
  inbox directly" — as a UI routing choice (everything goes via the god). GSD-06 deliberately changes
  that convention **for answers to questions that worker itself asked**, and only for those. It does
  not touch ADR-0001's decision: the answer is enqueued as hive mail and delivered by main's drain
  when that agent is idle, like every other automatic message. Nothing new types into a PTY.

- **D-39:** **The god still gets told.** Today's `hiveSend` to the god is what unblocks the card and
  resumes the work. Addressing the worker must be an **addition**, not a replacement: the answer goes
  to the asker, and the god is informed, or the card is left blocked with no one moving it. The plan
  must be explicit about which message carries the unblock.

### Gates must be able to fail (phase-wide rule)

- **D-40:** **NO GATE MAY PASS BECAUSE IT PARSED NOTHING. This run produced three separate instances,
  so it is a rule rather than an observation.** (1) GSD's `check.decision-coverage-plan` returned
  `"no trackable decisions"` and passed green against **both** this file and Phase 1's, because its
  parser wants `- **D-NN:** text` and both files used `- **D-NN — text**` — Phase 1 was planned with
  that gate silently disabled. (2) The workflow's validation-strategy step greps for the literal
  `## Validation Architecture`; RESEARCH.md shipped it as `## §9 Validation Architecture`, so
  VALIDATION.md would never have been created. (3) The UI checker found the proposed Rule C-1a
  repo-fact test — a line-oriented `grep -rn "providerCapabilities(" src/renderer` asserting
  two-argument calls — is defeated by ordinary formatter line-wrapping **and passes vacuously if every
  call site is deleted**; and because `platform?` is *optional* rather than defaulted, TypeScript will
  not backstop a one-argument renderer call either.
  **Binding on every plan in this phase:** any repo-fact or grep-based assertion must (a) assert over
  joined/parsed text rather than single lines where a formatter could wrap the construct, and (b)
  assert a **positive lower bound** (`count >= 1`) alongside the negative, so deleting the feature
  fails the test instead of satisfying it. `test/repo-claims.test.cjs:245-269` already demonstrates the
  both-directions pattern — follow it. A test that cannot fail is not coverage, and this phase exists
  to remove exactly that class of claim.

- **D-41:** **DAEMON-05's literal wording is not fully met at the narrowest width, and the SUMMARY must
  say so rather than tick it.** The requirement reads "the live public URL **always visible** in the
  UI". The approved UI contract's degradation step 2 (forced at 800px, where the census leaves ~28px
  after the chip and truncating a 48-character host is forbidden) renders `PUBLIC` alone, with the
  untruncated URL one click away in the panel the chip already opens. The requirement's *purpose* —
  the tunnel can never be up without the operator seeing it — survives intact, because presence is the
  signal. Its literal clause does not, at that one width. Record it as a stated limitation in the
  SUMMARY; do not claim the clause verbatim and do not quietly widen the wording.
  Also carried from the UI review, binding on the DAEMON-05 and DAEMON-02 plans: the vendored QR
  encoder's purity was verified against Project Nayuki's moving `master`, so the plan must **record the
  retrieved commit SHA at the time it vendors**, alongside the file's SHA-256 — the same bar D-14 sets
  for the cloudflared binary, applied to executable source.

### Claude's Discretion

Auto-mode resolved every gray area to its researched recommendation. The following are left to the
planner rather than pre-locked:

- Plan slicing and wave assignment across the twelve requirements — subject to the hard constraint
  that the extraction (D-03/D-05) is the gate and no DAEMON-01/DAEMON-05/PARITY plan starts before
  `test/boot-floor.test.cjs` is green.
- The exact module boundaries inside `src/main/floor/` beyond the `SHUTDOWN_STEPS` seam list (D-04).
- Exact disjoint file-ownership lists per agent (the proven method on this repo; `use_worktrees:
  false`).
- How the `cloudflared` binary is acquired — bundled per platform (~55 MB each) or downloaded on first
  enable. Both satisfy the $0 rule; the trade is installer size against a first-enable network
  dependency. Note there is **no `cloudflared-windows-arm64` asset**.
- Which of the three PARITY-01b surfaces in D-31 the phase covers, and in what order.
- Which additional engines actually get proxy-bridge cost under D-34 (grok / kimi / opencode are
  candidates; antigravity needs a sidecar api mode).
- Whether the phone bundle stays hand-written or is promoted to a Vite entry (D-21 sets the trigger,
  not the timing).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement sources
- `.planning/ROADMAP.md` §"Phase 2: The Daemon and the Protocol" (lines 159-246) — goal, the five
  success criteria, the internal gate, the three-item Phase 1 dependency
- `.planning/ROADMAP.md` §"Standing Constraints" (lines 511-536) — zero recurring cost, Android-only
  PWA, Node 22 for natives, npm 10 lockfile, three hard CI platforms, accessibility in scope
- `.planning/REQUIREMENTS.md` §DAEMON (74-99), §PARITY (101-114), §STRUCT (126-131), GSD-06 (297-300)
- `.planning/PROJECT.md` — core value ("you can leave it running and trust it") and constraints
- `.planning/phases/01-finish-the-floor/01-CONTEXT.md` — Phase 1's locked decisions. **Its D-40 is
  contradicted by D-30 here** (`capabilityLine` has no consumer); read both.

### Decision records (load-bearing — do not contradict)
- `docs/adr/0001-one-gate-for-pty-writes.md` — the one-gate rule. **Its named location is now stale;
  see D-12.** The decision holds, the gate moved to `src/main/delivery.ts`.
- `docs/adr/0002-prompt-cache-invariant.md` — any change to per-engine roster text is cache-relevant,
  and PARITY work touches roster/capability text
- `docs/adr/0004-single-committer-git.md` — only main commits to the hive; the STRUCT-02 git-committer
  extraction must not create a second committer
- `docs/adr/0005-cumulative-cost-ledger.md` — samples are cumulative; PARITY-02 must not re-introduce
  the summing error RECORD-03/04 fixed
- `docs/adr/0006-terminal-pool-lifetime.md`

### Subsystem docs touched by this phase
- `docs/message-queue.md` — the full MD-queue delivery contract (ADR-0001 is its §1)
- `HIVE.md` — Phase 1 deleted twelve stale Stop-drain denials from it; do not reintroduce claims about
  who drains
- `README.md` lines 55-65 — the engine-limitation table and the `LIVE-UNVERIFIED` paragraph. **The
  table describes a UI that does not render (D-30).**
- `SECURITY.md`, `TELEMETRY.md`

### Source seams named by the decisions above
- `src/main/index.ts:4340-4357` (`SHUTDOWN_STEPS`), `:5679-5790` (`whenReady` boot order),
  `:5783-5790` (the headless quit deadlock, D-09), `:2610-2620` (single-instance lock / re-attach),
  `:4657` (login item)
- `src/main/hive.ts:1039-1062` + `:1281` (the proxy bridge, D-34), `:1110` (`--settings`), `:1176-1192`
  (the MCP write, D-25), `:1235` (the fail-closed tier branch, D-27), `:527` (`agentDir`), `:998`
  (per-agent `CODEX_HOME`), `:3454-3460` (`task.cjs --q`, D-37), `:936-940` (`AGENT_ID` into PTY env)
- `src/main/webhook.ts` (the trust boundary reused by the PWA, D-23), `:276-286` (`openTunnel`),
  `src/main/slack.ts:211-221` (its byte-identical twin, D-15), `src/main/procKill.ts:34`
  (`hardKillTree`, D-15)
- `src/main/integrations.ts:19,78,118,150,156,173` + `src/shared/integrations.ts:91` (the secret store
  reused by D-28)
- `src/shared/agentProvider.ts` (the eleven presets, D-32),
  `src/shared/providerAutomation.ts:293-345` (`providerCapabilities` / `capabilityLine`, D-30)
- `src/renderer/src/components/AskMeTab.tsx:92` (D-36), `TaskDetailOverlay.tsx:51-60` +
  `CommandCenterPanel.tsx:608` (the real assignment flow, D-31), `AddAgentModal.tsx:516-520` (the
  consent-split pattern, D-29)
- `test/load-ts.cjs` (the electron stub that makes D-02 true), `test/main-hardening.test.cjs:5-7` (the
  false comment D-02 corrects), `test/engine-parity.test.cjs` (the only `capabilityLine` caller)

### Build, CI and test surface
- `package.json` — `test`, `typecheck`, `build`, `e2e`; `engines: node >=20 <23`
- `.github/workflows/ci.yml`, `e2e.yml` — three hard platforms, no `continue-on-error`; e2e is
  Linux/xvfb only
- `electron.vite.config.ts` — the renderer input map (the D-21 upgrade path)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/main/webhook.ts` (468 lines)** — many-endpoints-one-server-one-tunnel, constant-time secret
  compare, no-enumeration 401s, body cap, global + per-endpoint rate limits, 192-bit capability
  tokens, and **no electron import** so it unit-tests as plain Node. This is the PWA's server and
  DAEMON-03's rails. Reuse it; do not write a second HTTP surface.
- **`SHUTDOWN_STEPS` (`index.ts:4340`)** — a 16-entry declarative teardown list that is already the
  inverse of the `bootFloor` this phase needs.
- **`src/main/procKill.ts:34 hardKillTree`** — `taskkill /T /F` on win32, group-SIGKILL on POSIX. The
  tunnel's close is a call to this, not new code.
- **`test/load-ts.cjs`** — the electron stub plus TS loader that 49+ test files use; it is what makes a
  plain-Node boot test possible without a new harness.
- **The proxy-bridge sidecar (`hive.ts:1281 startProxyBridge`)** — already generic over
  `{kind:'proxy', api, baseUrlEnv}`, already mints a per-agent GATE-01 token, already synthesizes hive
  events and cost samples. PARITY-02's extension mechanism.
- **`integrations.ts`'s secret store** — `setSecret`/`hasSecret`/`deleteSecret`/`deleteSecretsWithPrefix`
  + `secretRefFor`, `safeStorage`-encrypted, renderer sees only a `hasSecret` boolean. DAEMON-04's
  secret lifecycle, already built.
- **`AddAgentModal.tsx:516-520`** — already splits hire-manifest MCP servers into "safe" and "needs
  consent" lists. The consent-UI pattern to follow, not invent.
- **`process.env.AGENT_ID`** — already in every agent's PTY env and already read by `task.cjs claim`.
  GSD-06's `askedBy` is the same pattern.
- **Per-agent config isolation is already the house style** — per-agent `CODEX_HOME`,
  `CRUSH_GLOBAL_CONFIG`, `.opencode/plugin/`, `.pi-agent/extensions/` all live under `agentDir`.

### Established Patterns
- **Electron-free main modules are the testable ones.** `delivery.ts`, `webhook.ts`, `hooks.ts` and
  `hive.ts` all avoid `electron` imports and are all tested. That is the pattern the extraction
  generalises — and D-02 shows the real constraint is side-effect-free module scope, not the import.
- **Capability gaps are declared, not faked** (`NO MAIL`, `spend UNTRACKED`, `REMOTE CONTROL
  unavailable on Windows`). D-30 is the discovery that this pattern was never wired to a screen.
- **`namespace:action` IPC channels**, every one registered in `index.ts` and wrapped in
  `preload/index.ts` — the extraction must preserve all 153 names exactly.
- **Repo-fact tests** (`ci-config`, `engine-parity`, `main-hardening`, `repo-claims`) are how this
  project pins a claim mechanically. The gate (D-05) and the PARITY declarations both belong there.
- **Fail closed on secrets** — `buildDefaultMcpServers` already refuses a non-safe server without
  explicit consent (`hive.ts:1235`), and `setSecret` refuses to write when encryption is unavailable.
  Both behaviours are kept, not re-litigated.

### Integration Points
- `bootFloor(deps)` ← `whenReady` in `index.ts`, and ← `test/boot-floor.test.cjs`
- The PWA static handler + auth endpoints ← `WebhookServer`; the tunnel child ← one shared helper used
  by both `slack.ts` and `webhook.ts`
- Telegram/Discord verifiers ← `WebhookServer`'s per-endpoint gate (D-24)
- Per-engine cost ← `startProxyBridge` → `telemetry.recordCostSample` → `CircuitBreaker`
- Per-agent MCP ← `<agentDir>/mcp.json` + `--mcp-config` (D-25) ← consent state in config ← secret refs
  in `integrations.ts`
- `capabilityLine()` → `AgentCard.tsx` / `AddAgentModal.tsx` / the dispatch box (D-31) — the wiring
  that does not exist today
- `humanQA.askedBy` ← `task.cjs patch --q`; → `AskMeTab.sendAnswer`'s `to:`

</code_context>

<specifics>
## Specific Ideas

- **The phase's own acceptance test is the project's honesty rule.** Claims that did not survive this
  discussion's verification pass: the two god-file line counts (D-01), the reason `index.ts` is
  untestable (D-02), `hive.ts`'s testability rationale (D-07), the impossibility of closing the tunnel
  (D-13), PARITY-02's "all eleven" (D-34), and — outside the roadmap — `capabilityLine` having any
  consumer (D-30) and ADR-0001's named gate (D-12). The planner should expect to find more, and should
  treat correcting a claim as *doing* the phase, not as deviating from it.
- **Two items are GATE-01-shaped: a feature whose tests could pass while its effect is nil.** D-25 (the
  MCP bundle may never reach Claude) and D-30 (`capabilityLine` renders nowhere). Both must be verified
  live before anything is built on top of them.
- **The internal gate is the schedule.** The roadmap calls this the largest risk in the roadmap and the
  extraction the item most likely to slip. Everything above is arranged so the gate is one green test
  file rather than a judgement call.
- **Zero recurring cost is absolute** — every option in D-13 through D-24 was checked against it, and
  three otherwise-attractive routes (ngrok static domains, a paid tunnelmole subdomain, any hosted push
  service) were rejected on that rule alone.
- **"Verification needs a real device" is a first-class outcome, not a failure.** DAEMON-02's own
  requirement text and PARITY-03's rule both say so. A localhost-verified auth path recorded as such is
  a pass; a claim of completion without the device is not. Nothing in the phone research was tested on
  a physical Android device.

</specifics>

<deferred>
## Deferred Ideas

- **Tailscale Funnel for a stable phone origin** — free Personal plan, real Let's Encrypt cert, stable
  `device.tailnet.ts.net` name, network-layer auth, and it would kill the origin-churn problem outright
  (D-19). Not this phase: it needs an account plus a system-level daemon, DAEMON-05 explicitly asks for
  a public tunnel, and **its close semantics were not live-verified** so it cannot satisfy DAEMON-05
  today. Revisit if re-scanning the QR each session becomes the operator's main complaint — and
  live-verify the close first.
- **A local CA + `https://<static-LAN-IP>`** — Chrome on Android does trust user-store CAs, so this is a
  genuine $0 stable origin. Rejected here: Node core cannot mint X.509 (needs mkcert/node-forge/
  OpenSSL), it needs a one-time CA install on the phone plus a DHCP reservation, and it is LAN-only so
  it cannot satisfy DAEMON-05.
- **A second entry in `electron.vite.config.ts` for the phone bundle** — the upgrade path from D-21's
  hand-written static files, taken when the surface outgrows a few hundred lines.
- **Serving the phone shell from a free stable static host** — cleanest fix for install/SW/push churn,
  but contradicts "served by the daemon" and adds CORS to the trust boundary.
- **WebAuthn / passkeys for the phone** — re-evaluate only on a permanently stable origin (D-20).
- **A plain-Node daemon** — not blocked by native-module ABI (both natives are N-API and load under
  plain Node v24), only by `safeStorage`. Revisit if the floor ever has to run on a headless Linux box
  with no X, and price the at-rest secret scheme change into it.
- **Per-agent control of the safe-readonly MCP tier** — D-27 deliberately keeps that tier floor-wide.
  Build the general case only when a real need appears.
- **Antigravity cost via a `gemini` api mode in the proxy sidecar** — a real extension of D-34, out of
  scope unless the phase's own PARITY-02 slice reaches it.
- **Windows/macOS Electron-launching e2e runners** — inherited from Phase 1's D-08 blind spot; headless
  mode adds a second reason to want them.
- **A multi-hour cloudflared soak** — quick-tunnel stability was verified for ~30 s only, and
  Cloudflare's docs describe them as "testing and development only". One long run before this fronts
  anything real.

</deferred>

---

*Phase: 2-The Daemon and the Protocol*
*Context gathered: 2026-08-21*
