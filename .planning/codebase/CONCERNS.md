# Codebase Concerns

**Analysis Date:** 2026-08-20

**Method:** Cross-referenced `docs/floor-inspection.html` (the full audit of `1ad9638`, published as `#1`–`#61` on GitHub) against `gh issue list` and current source. Most Critical/High items from that audit are closed and merged (PRs #51, #56, #72 — worktree force-removal, PTY input sanitisation, atomic writes, mail-loss, window hardening, fs/git IPC confinement, loopback binds, hook-socket auth, logging + crash reporter, atomic ledger writes, the permissions deny list, non-blocking commits, delivery/failover-in-main, ledger revisions, the `integrate` primitive, KG dedupe, and 7 real Windows bugs). **Correction (2026-08-20, orchestrator).** An earlier draft of this paragraph called `#4`, `#5`, `#10` and `#34` "stale trackers" whose code was already fixed. That was checked against source and is **wrong on all four** — the bar applied was "some code exists" rather than "the issue's stated done". Each is genuinely **partial** and correctly still open:

| Issue | Landed | Actually remaining |
| --- | --- | --- |
| `#4` | the `permissions.deny` list in the per-agent settings | **RESOLVED in Phase 1 plan 01-12.** `grep -c autoMode src/renderer/src/components/AgentCard.tsx` → `4`; the AUTO chip renders at `:291` and the card's `aria-label` folds the state in at `:187`. Was empty. |
| `#5` | inbox-wake nudge and account failover moved to `src/main/delivery.ts` | **RESOLVED in Phase 1 plans 01-07 and 01-08.** The idle-quiesce backstop is `DeliveryService.quiesce()` (`delivery.ts:643`) on main's existing tick, and the queue-drain is `DeliveryService.drainQueue()` (`delivery.ts:518`) — `useHive.ts` effect #4 is deleted, and the pure policy moved to `src/shared/queueDelivery.ts` where both processes read it. |
| `#10` | loopback binds, safeStorage secrets, hook-socket token, `localtunnel` deleted, secret scrub | **RESOLVED in Phase 1 plan 01-01** — `package.json` pins `"electron": "^43.4.1"` (Chromium 150, Node 24.18.1). But note the mapping error recorded in `REQUIREMENTS.md`: #10 carries **no** Electron clause at all; the end-of-life-Electron issue was #8, now closed. This row was itself a mis-mapping. |
| `#34` | `task_id` on ledger rows, `taskSpend()` | **RESOLVED in Phase 1 plans 01-09 and 01-10.** `hive.budgetForAgent()` feeds the breaker beat at `index.ts:1635` and `breaker.ts:361` trips on `budget.tokens > budget.cap`. Stated precisely: `taskSpend().over` itself still has no direct caller — its two inputs do, and the same comparison is made one layer down, which is what lets the arm warn at a fraction of the cap instead of only firing at the cliff. |

Take this as the standing rule for this document: a partially-landed fix is an open concern, not a closed one. Everything else below was independently re-verified against current source.

## Tech Debt

**`src/main/index.ts` — the whole app funnels through one 5,620-line file:**
- Issue: 157 `ipcMain.handle`/`ipcMain.on` registrations and 27 module-level mutable `let` bindings (`logStream`, `mainWindow`, `slackServer`, `webhookServer`, `heldWebhookTokens`, `managedRootsCache`, `workerTickRunning`, `keepAwakeId`, …) live in one file with no internal module boundary.
- Files: `src/main/index.ts`
- Impact: the file cannot be unit-tested as a whole — it imports `electron`, which requires the Electron binary CI never installs for plain Node runs. `test/main-hardening.test.cjs` documents this explicitly: *"src/main/index.ts itself cannot be loaded here — it imports 'electron' — so each assertion targets the pure function the handler now delegates to. That is deliberate: index.ts was untestable precisely because every guard used to be inline in a handler."* The extraction pattern is proven (`safeJoin`/`isWithinRoots`/`isAllowedExternalUrl` → `src/main/fs.ts`, `worktreeHasUnintegratedWork` → `src/main/git.ts`) but applied to only a handful of guards; the other ~150 handlers and their inline logic remain untested and untestable in place.
- Fix approach: continue the extraction-to-pure-function pattern already established by the hardening pass — pull handler bodies into named functions in topic files (`fs.ts`, `git.ts`, `slack.ts`, `webhook.ts`, etc.) and leave `index.ts` as thin `ipcMain.handle(name, wrapper)` registration.

**`src/main/hive.ts` — a single 3,562-line god class:**
- Issue: `export class HiveManager` opens at line 491 and closes at 3313 (~2.8k lines in one class; it does NOT run to end of file, and `ARCHITECTURE.md` was the one of the two that had the extent right) — registry, board, task ledger, cost ledger, mail router, single-committer git, memory-mine ignore rules, and task-budget accounting are all methods on one object.
- Files: `src/main/hive.ts:424` (class start)
- Impact: same testability problem as `index.ts` — `test/hive-task-mutation.test.cjs` has to instantiate the entire `HiveManager` (with a real temp-dir git repo) to exercise one narrow task-mutation regression, because there is no smaller seam to load independently.
- Fix approach: split along the responsibilities already named in the class's own header comment (`src/main/hive.ts:1-18`) — registry/workspace, board/ledger, router, git-commit — into cooperating modules the way `fs.ts`/`git.ts` were split out of `index.ts`.

**No ESLint/Prettier, 13 orphaned `eslint-disable` comments (issue #36, partially fixed):**
- Issue: no `.eslintrc*`/`eslint.config.*`/`.prettierrc*` anywhere in the repo, and 13 `eslint-disable` comments in `src/` reference a linter that is not configured.
- Files: repo root (no config file); `grep -rn eslint-disable src/` → 13 hits
- Impact: style drift has no automated check; the disable comments are inert documentation with no linter to suppress.
- Fix approach: adopt ESLint (flat config) or delete the 13 orphaned comments. Note: the rest of `#36`'s original claim — "no dependency automation, no npm audit" — is **already fixed**: `.github/dependabot.yml` exists and `.github/workflows/ci.yml:31-36` runs `npm audit --audit-level=high`. The `tools/copy-main-assets.cjs` duplication `#36` flagged is also gone (file no longer exists). The remaining minor duplication is `slack.ts`/`webhook.ts` each implementing their own `listen()` (`src/main/slack.ts:192`, `src/main/webhook.ts:257`) — both now correctly bind `127.0.0.1`, just not through a shared helper.

**RESOLVED — Electron 32.2.0's end-of-life runtime (kept as history, not deleted):**
- Was: `package.json` pinned `"electron": "^32.2.0"` (Chromium 128) — outside Electron's latest-3 support window, no CVE backports, so security patches for the runtime under the app had stopped arriving.
- Now: `"electron": "^43.4.1"`, resolving to Electron 43.4.1 / Chromium 150 / Node 24.18.1. Landed by **Phase 1 plan 01-01**, with the native rebuild of `node-pty` and `better-sqlite3` and `electron-builder@26` that the bump actually required. Three-platform suite green.
- Kept here deliberately: this file is what Phase 1's own premise is audited against, and a resolved concern deleted is a concern nobody can check was ever real.
- The lesson worth keeping: `#8`'s text tracked the bump as *"38+"*, and 38 was itself end-of-life by the time anyone ran it. A supported-major bar written as a frozen number licenses shipping the exact defect it exists to stop. Read it as the latest-3 window as of the current date.
- Still open, and NOT closed by the bump: `#8` said the bump was *"tracked separately"* and no separate issue was ever filed, so `FLOOR-03` traces to no open issue at all (`#10`, which `REQUIREMENTS.md` pointed at, carries no Electron clause). Recorded rather than repointed.

**Knowledge graph is a TF keyword index, not a graph; still default-off; still no UI panel (issue #31, partially fixed):**
- Issue: re-ingest duplication is fixed (`src/main/kg-core.cjs:317-341` — `findByFingerprint`/`contentHash` now makes re-ingest a no-op `{duplicate: true}` instead of minting a new `docId`), but the design doc's own roadmap items remain undone: it is still a plain keyword scorer over `index.jsonl` (`docs/design/knowledge-graph.md:45,191` names SQLite FTS5 as "the documented next step," not yet taken), `knowledgeGraph: { enabled: false }` is still the default (`src/main/config.ts:497`), and there is no renderer panel for it (`find src/renderer -iname "*knowledge*" -o -iname "*kg*"` → no results).
- Files: `src/main/kg-core.cjs`, `src/main/config.ts:497`, `docs/design/knowledge-graph.md`
- Impact: `README.md` calls this feature an "Enterprise Knowledge Graph," which overstates a TF keyword index that most users never turn on and have no UI to inspect.
- Fix approach: the FTS5 step the design doc already specifies; a minimal read-only panel; consider renaming the feature in docs until the graph/embedding step lands.

**Per-task cost cap is tracked but not enforced or surfaced (issue #34, mostly fixed, feature inert):**
- Issue: the original defect — "ledger rows carry no task id" — is fixed: `src/main/hive.ts:2527` tags every cost-ledger row with `task_id`, and a card can carry `budgetTokens` (`hive.ts:136`, set via a `budget-tokens` frontmatter field at `hive.ts:2882`/`2904`). `taskSpend(taskId)` (`hive.ts:2566-2582`) computes tokens/usd spent and whether the card is `over` its cap. But this data has no consumer: `grep -rn "taskSpend\|budgetTokens" src/main/breaker.ts` is empty (the breaker never enforces it), and `grep -rn "taskSpend\|budgetTokens" src/renderer/ src/preload/` is empty (no IPC exposure, no UI shows it).
- Files: `src/main/hive.ts:2527`, `:2566-2582`, `:2882`; `src/main/breaker.ts` (no reference)
- Impact: a card can carry a stated budget cap that is silently never checked — an operator who sets `budget-tokens` on a task gets no enforcement and no "over budget" indicator anywhere in the UI, which is worse than not having the field at all if anyone relies on it.
- Fix approach: thread `taskSpend()` into `breaker.ts`'s escalation decision for the assignee, and expose it through preload for a per-card cost line in the UI (the comment at `hive.ts:2561` already calls this "the read side of the per-task cap" — the write/enforcement side is the remaining half).

**Memory sharing model is computed but never shown in the UI (issue #32, partially fixed):**
- Issue: `reflect.ts`'s condensation now sorts by date (fixed — see `reflect.ts:550-557`, "Stamps are `20260606T110912Z`, so lexicographic sort IS chronological" then `.sort()`), and `resources/skills/md-hive-sync/SKILL.md` now documents bash/PowerShell/cmd.exe variants (fixed — no longer POSIX-only). What remains: `MemoryManager` computes and returns `status().scope` (`src/main/memory.ts:220-233`) — whether the palace is `'shared'` (default, one palace for the whole hive, every agent can recall every sibling's notes) or `'agent'` (isolated per agent) — but `src/renderer/src/components/MemoryPanel.tsx` never reads it (`grep -n scope MemoryPanel.tsx` → no hits). `reflectNow`/`memoryWakeUp` are also still exposed in preload (`src/preload/index.ts:828-835`) and called from nowhere in the renderer.
- Files: `src/main/memory.ts:10-21` (the sharing-model doc comment), `:220-233`; `src/renderer/src/components/MemoryPanel.tsx`; `src/preload/index.ts:828-835`
- Impact: the default `'shared'` scope is a deliberate, well-documented tradeoff (the comment at `memory.ts:10-21` names exactly the exposure it accepts: "An agent handed a credential, a customer name, or a private instruction writes it to memory.md, the miner indexes it, and any sibling can surface it") — but a user has no way to learn which mode is active without reading source, because the panel that should say so doesn't.
- Fix approach: render `status().scope` in `MemoryPanel.tsx` as the issue's original fix note specifies; delete or wire up the two dead preload exports.

## Known Bugs

**Codex remote control silently disabled on Windows, with no comment or user-visible warning (issue #61):**
- Symptoms: a Windows user assigned a Codex agent gets an agent whose remote-control channel silently never activates — it looks like a working agent that ignores remote-control commands.
- Files: `src/main/index.ts:269` — `enableCodexRemoteForSpawn` opens with a bare `if (process.platform === 'win32') return false;`. The JSDoc above the function (`index.ts:262-264`) explains that failure is non-fatal in general, but nothing on the Windows-specific line explains *why* Windows is excluded, and nothing surfaces the limitation in the UI, docs, or logs.
- Trigger: hire a Codex agent on Windows and attempt `/remote-control`.
- Workaround: none surfaced to the user; the agent silently falls back to a normal local TUI session.

## Fragile Areas

**Engine bridge coverage: re-derived from source after Phase 2 (issue #19, largely closed, re-measured 2026-08-24):**
- Files: `src/shared/agentProvider.ts` (per-engine preset table), `src/shared/providerAutomation.ts:305-315` (`providerCapabilities`), `src/main/hive.ts:1009-1187` (the bridge dispatch; this entry's earlier line pointer named a range that plan 02-01's split moved out of `hive.ts` entirely), `src/main/hiveProvisioning.ts`/`hiveTemplates.ts` (the per-engine installer functions and shim templates), `src/main/telemetry.ts:326` (`recordCostSample`)
- Re-derived this session by reading `providerCapabilities(id, 'linux')` for all eleven presets: **9 of 11 engines can now receive hive mail** (only `copilot` and `custom` bounce — no bridge of any kind, hooks or proxy). `claude`, `codex`, `grok`, `kimi`, `antigravity`, `opencode`, `pi` have a real hooks-tier bridge (a config-file shim or bundled extension/plugin); `qwen` and `crush` are proxy-tier (a loopback reverse-proxy sidecar that synthesizes the same hive events). **`kimi` no longer belongs in the "no lifecycle hooks" set** — PARITY-01a (plan 02-07) gave it a hooks bridge reusing `HOOK_SHIM` verbatim (Claude-shaped payload), unverified against a live account but structurally identical to codex's. `copilot` and `custom` are the only two with genuinely no lifecycle hooks and no cost accounting, by construction (no hook surface to bridge, no per-agent signal to read).
- **`CostSample` from the proxy tier now reaches the breaker, not only the ledger** — this is a real fix, not a stale claim. `telemetry.ts`'s `recordCostSample` (added under PARITY-02) routes a proxy-tier sample into the SAME accumulator the OTel path fills, so `getAgentUsage` — and therefore the breaker's cost/token caps and velocity arms — now sees `qwen`/`crush` spend identically to a Claude agent's. The old "reaches the ledger but not the breaker" gap is closed for those two engines.
- Six of the eleven still cannot report cost at all (`spend: 'none'`): `grok`, `kimi`, `antigravity`, `opencode`, `pi`, and the two mail-bounced engines `copilot`/`custom` — five of those six for the same reason (no telemetry, no hook-surface cost signal, no proxy route), and `copilot`/`custom` because nothing per-agent reaches this app at all. This is PARITY-02's own restated ceiling (`.planning/REQUIREMENTS.md`), not a new gap.
- Safe modification: changes to `agentProvider.ts`'s per-engine tables need manual verification against a live session of that engine — there is no automated protocol-conformance test across the eleven engines. Five bridges (`pi`, `opencode`, `crush`, `qwen`, `kimi`) are marked `LIVE-UNVERIFIED` in source (18 raw markers spread across six files, pinned by `test/repo-claims.test.cjs`'s PARITY-03 clause) — none has ever run against a real paid account.
- Test coverage: `test/engine-parity.test.cjs`, `test/provider-automation.test.cjs` and `test/capability-surface.test.cjs` exist but exercise the pure capability tables and the renderer-facing derivation, not live engine sessions.

## Phase 2 limitations (tracked, not SUMMARY prose)

Six limitations Phase 2 could not close, each already stated in source/docs/UI by the plan that owns the surface. Tracked here per `02-VALIDATION.md`'s own wording so they stay findable outside a plan SUMMARY.

**No stable public URL at $0 (DAEMON-05):**
- What's not done: the tunnel is a Cloudflare Quick Tunnel (`cloudflared … --url`), which mints a fresh `trycloudflare.com` hostname on every open — there is no way to reserve or pin a hostname without a paid Cloudflare account (a named tunnel).
- Files: `src/main/tunnel.ts`, `src/main/cloudflared.ts`, `SECURITY.md`
- Risk: an installed phone PWA cannot hardcode an origin; every pairing needs a fresh QR scan, and a long-lived bookmark to a previous session's URL goes dead the moment the tunnel is reopened.
- Priority: Low — accepted under the zero-recurring-cost rule; a paid named-tunnel path is a future upgrade, not a defect.

**`setLoginItemSettings` is a no-op on Linux (DAEMON-01):**
- What's not done: Electron's `app.setLoginItemSettings` has no Linux implementation, so the headless "start at login" toggle silently does nothing there — no error, no UI feedback.
- Files: `src/main/index.ts:3645-3650` (states it in a source comment), `:4811-4818`
- Risk: a Linux operator who enables "start at login" reasonably believes it worked; nothing tells them otherwise on that platform.
- Priority: Low — stated in source; a UI-level "unsupported on Linux" affordance is the natural next step, not shipped this phase.

**`setActivationPolicy('accessory')` is UNVERIFIED — needs a macOS machine (DAEMON-01):**
- What's not done: the headless-floor Dock-icon suppression on macOS (`app.setActivationPolicy('accessory')`) has never been confirmed against a real Mac. No Mac was available to this project during Phase 2.
- Files: `src/main/index.ts:4820-4826` (the source comment states the same thing, in the same register as the LIVE-UNVERIFIED engine markers)
- Risk: low if it works as Apple's docs describe; a macOS user could see an unwanted Dock icon in headless mode if it does not.
- Priority: Low — stated, not claimed working; needs a macOS live-verify pass whenever a Mac is available.

**DAEMON-02 is a localhost-verified auth path, not a device-verified install:**
- What's not done: WebAPK installation, `display:standalone` PWA behaviour, and Web Push while the phone is asleep have never been tested against a physical Android device — the requirement's own fallback ("a localhost-verified auth path is the honest fallback") is what actually shipped and is recorded as exactly that, never as completion.
- Files: `SECURITY.md`, `resources/phone/`, `src/main/push.ts`, `02-09-SUMMARY.md`
- Risk: an operator who installs the PWA on a real phone may hit an untested code path; the auth round-trip itself is verified, everything device-specific is not.
- Priority: Medium — blocks calling DAEMON-02 complete; needs an operator-supplied Android device.

**Five `LIVE-UNVERIFIED` bridges (PARITY-03, D-33/D-35):**
- What's not done: `pi`, `opencode`, `crush`, `qwen` and `kimi`'s bridges have never run against a real paid account for that engine. The first four because the CLI is not installed on this machine; `kimi` because its bridge is new (PARITY-01a) and no Moonshot account exists here either.
- Files: 18 raw `LIVE-UNVERIFIED` markers across `src/main/hive.ts`, `hiveProvisioning.ts`, `hiveTemplates.ts`, `index.ts`, `webhook.ts` and `agentProvider.ts` — pinned exactly, per-file, per-engine and by file set in `test/repo-claims.test.cjs`'s PARITY-03 clause.
- Risk: none of the five bridges is battle-tested against a real session; a wrong guess in any of them (wrong hook payload shape, wrong config path) fails silently, with the renderer's idle inbox-wake nudge as the stated fallback drain.
- Priority: Low under the zero-recurring-cost rule — this is the expected outcome, not a failure a future plan is scheduled to close without an operator account.

**DAEMON-05's "always visible" is met in purpose, not literally at 800px (D-41):**
- What's not done: at the narrowest supported width (~800px) the titlebar's `PUBLIC` chip degrades to the word alone; the untruncated tunnel URL is one click away in the panel the chip opens, not inline in the titlebar.
- Files: `src/renderer/src/components/` (the titlebar chip, plan 02-10), `README.md`, `.planning/ROADMAP.md`
- Risk: none functionally — presence of the chip is the signal, and the tunnel can never be up without the operator seeing it — but a literal reading of "URL always visible" would be false at that width, which is why it is stated as met-in-purpose here rather than ticked verbatim.
- Priority: Low — a documentation-precision item, not a functional gap.

## Test Coverage Gaps

**No renderer component RENDER tests; source-level coverage widened this phase (issue #45, partially fixed, re-measured 2026-08-24):**
- What's not tested: of 134 files under `src/renderer/src/**/*.ts(x)`, tests now touch 17 (`agentPatch.ts`, `terminalPoolPolicy.ts`, `terminalSelection.ts`, `terminalAutomation.ts`, `terminalRecovery.ts`, `mdLinks.ts`, `config.ts`, `store.ts`, `autoMode.ts`, `sidebarLayout.ts`, `AgentCard.tsx`, `BlockedBanner.tsx`, `MessageQueueComposer.tsx`, `PixelBadge.tsx`, `QrCode.tsx`, `components/git/graph.ts`, `hooks/useHive.ts`) — up from 8 before Phase 2. Two Phase 2 plans widened this: 02-06 added `AgentCard.tsx` and `store/config.ts`'s `capabilityGaps`/`mcpCardSummary` derivation (source-level assertions — `aria-label` text, call counts, structural shape — never a mounted DOM), and 02-10 added `QrCode.tsx` (the SVG module-matrix renderer). Zero React components are still rendered through an actual DOM/testing-library pass anywhere in `test/` — every renderer assertion is source-level (`loadTs()` + string/structural checks) or e2e (real Electron, one flow).
- Files: `test/renderer-runstate.test.cjs`, `test/terminal-selection.test.cjs`, `test/terminal-automation.test.cjs`, `test/ide-image.test.cjs`, `test/provider-config.test.cjs`, `test/queue-delivery.test.cjs`, `test/terminal-recovery.test.cjs`, `test/commit-graph.test.cjs`, `test/capability-surface.test.cjs`, `test/qr-vendor.test.cjs`
- Risk: a change to any of the ~117 still-untested renderer files (component logic, layout, state wiring inside components) can regress silently. `e2e/smoke.spec.ts` still covers exactly one flow (boot → onboarding → first spawn); component-level gaps in every other flow are narrower in blast radius but still real.
- Priority: Low (per the issue's own severity) — the e2e smoke test catches full-flow regressions; component-level gaps are narrower in blast radius, and the trend this phase is toward more source-level coverage, not less.

**Accessibility coverage is improved but incomplete (issue #26, partially fixed):**
- What's not tested/fixed: `aria-label` coverage is now 49 across 133 `<button>` elements in `src/renderer/src` (up from the audit's 27/128, but still well under half of all buttons). Text-size tokens in `src/renderer/src/design/tokens.css:61-68` still include `--cth-text-display-sm: 8px`, `--cth-text-display-md: 12px`, and `--cth-text-body-sm`/`--cth-text-mono-sm: 13px`, all below the floor `DESIGN.md:706` itself states: *"never go below 14 px for any user-facing text."* Two already-fixed items worth noting as history, not debt: the focus ring is now 2px (`src/renderer/src/design/global.css:93-95`, `:focus-visible { outline: 2px solid ...; outline-offset: 2px; }`, up from the audited 1px), and the `role="button"` nested inside a `<button>` in `CommandCenterPanel.tsx` is gone — the two remaining `role="button"` usages (`AgentCard.tsx:145`, `FullscreenTerminal.tsx:604`) are `<div role="button">`, each with a comment explaining why a native `<button>` doesn't fit (the element carries multiple independent interactive children).
- Files: `src/renderer/src/design/tokens.css:61-68`, `src/renderer/src/design/global.css:93-95`, `src/renderer/src/components/AgentCard.tsx`
- Risk: keyboard/screen-reader users still hit unlabeled icon buttons on the majority of controls, and small text sizes remain below the project's own documented floor.
- Priority: Medium (per the issue's own severity).

---

*Concerns audit: 2026-08-20*
