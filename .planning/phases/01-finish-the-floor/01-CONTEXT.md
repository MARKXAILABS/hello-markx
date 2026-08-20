# Phase 1: Finish the Floor - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning
**Mode:** `--auto` (yolo) — every gray area auto-resolved to the researched recommendation. Six
parallel advisor-researcher agents ran; every load-bearing claim below was then re-verified by the
orchestrator against live source before being locked. Claims that did not survive that check are
marked **CORRECTED** and the corrected fact is what is locked.

<domain>
## Phase Boundary

Close all 20 open `floor-inspection` GitHub issues against **source**, plus the five requirements
pulled forward (GATE-01, RECORD-03, RECORD-04, VERDICT-02, VERDICT-03) without which Phase 1's own
success criteria are satisfiable by code that does nothing.

Verified live at discussion time: `gh issue list --state open --label floor-inspection` returns 24 —
the 4 epics (#47, #48, #49, #73) plus exactly the 20 issues the roadmap names (#4, #5, #10, #13,
#15, #16, #18, #19, #20, #26, #31, #32, #34, #36, #38, #39, #41, #42, #45, #61).

**23 requirements:** FLOOR-01…FLOOR-18, GATE-01, RECORD-03, RECORD-04, VERDICT-02, VERDICT-03.

**In scope:** the 23 requirements and the honesty work each one implies (deleting doc claims that
describe code that does not run; stating limitations in source, docs and UI where a capability is
genuinely unavailable).

**Out of scope:** anything that belongs to a later phase. Specifically — server-side enforcement of
memory scope (RECALL-02, Phase 5), the god-file extractions STRUCT-01/02 (Phase 2), the daemon and
PWA (Phase 2), and any engine verification that needs a paid account this project does not have.

</domain>

<decisions>
## Implementation Decisions

### Runtime — Electron bump (FLOOR-03)

- **D-01 — Target Electron 43.x, pin `"electron": "^43.4.1"`.** Chromium 150 / Node 24.17,
  end-of-support 2027-01-05. Verified independently by the orchestrator: `npm view electron
  dist-tags` gives `latest: 43.4.1`, `beta: 44.0.0-beta.5`, so the supported latest-3 window is
  **41 / 42 / 43**. Electron 44 goes stable ~2026-08-25 and 41 EOLs the same day; 43 is the newest
  *seasoned* major that stays supported past the end of this roadmap. Do not target 44 — a `.0.0`
  release with unlanded native prebuilds is the wrong place to be behind a no-`continue-on-error`
  CI wall.
- **D-02 — ROADMAP.md Success Criterion 2 must be restated. "Electron 38+" is a stale bar.**
  Electron 38 is itself already end-of-life, so a literal reading of "38+" would let this phase ship
  the exact unsupported-runtime defect FLOOR-03 exists to close. The criterion is to read
  **"Electron 43.x (inside the latest-3 supported window as of 2026-08)"**. The planner must carry
  this restatement into the plan; it is not a licence to widen scope.
- **D-03 — The bump lands FIRST, as its own atomic, revertable plan, and it gates the other 22
  requirements.** Phase 1's premise is that every closure is checked against a live test run. Closing
  19 issues against Electron 32 and swapping the runtime at the end converts 19 verified closures
  into 19 unverified ones. Runtime risk is discovered on day one with 22 requirements of runway,
  not on the last day with none. The counter-risk (a destabilised runtime blocking everything) is
  answered by making the bump one revertable commit with a clean rollback pin.
- **D-04 — `electron-builder` 25.1.8 → `^26.15.3` in the SAME plan.** Verified: `npm view
  electron-builder version` = **26.15.3**. Builder 25 predates Electron 40+ and pairs with a stale
  `app-builder-bin` / `electron-updater` contract; splitting it means two packaging-layer
  disturbances and two rounds of 3-platform CI. Builder 26 dropped Node 18, tightened the config
  schema (unknown keys now **error**, not warn), and moved several `mac`/`win` signing options —
  `electron-builder.yml` needs a read-through, not a version-number edit. Bump `@electron/rebuild`
  from `^3.7.0` too (3.7 predates the Electron 40+ ABI tables).
- **D-05 — `node-pty` stays exact-pinned at 1.1.0, and the byte-exact conpty patch is NOT at risk
  from this bump.** `tools/patch-node-pty-conpty.cjs` matches against
  `node_modules/node-pty/lib/conpty_console_list_agent.js`, whose contents are a function of the
  **node-pty version**, which is not changing. Read its `process.exit(1)` as "node-pty version
  changed", never as "Electron version changed". `electron-rebuild -f` compiles it from source
  against Electron's headers, so the absence of a Node 24 prebuild is irrelevant.
- **D-06 — `better-sqlite3` 11.10.0 is the real compile risk; plan the contingency inside the same
  plan.** 11.x predates Node 24 / V8 13.x; `latest` is 13.0.3. If 11.10.0 will not compile against
  Electron 43's Node 24 headers on all three platforms, bump to 12.x/13.x **in this plan** — do not
  discover it on the third CI platform. A 12/13 bump drags `@types/better-sqlite3` with it. If it
  compiles clean, leave it.
- **D-07 — Host Node stays 22.** Electron's bundled Node 24 is internal to the Electron binary and
  does not relax the host pin. `engines: ">=20 <23"`, `.nvmrc`, and `NODE_VERSION` in all three
  workflows stay on 22. `package-lock.json` regenerated on a clean tree, never hand-edited — the
  Electron 43 dep tree re-resolves broadly, so this rule gets *more* load-bearing here, not less.
  **Amended by red-team round 2 (2026-08-20): the "regenerated with npm 10" clause is withdrawn.**
  npm 9, 10 and 11 all write `lockfileVersion: 3`, so the rule had no check that could tell them
  apart, and this host is node v24.13.0 / npm 11.6.2 with **no Node 22 installed** — the instruction
  was unfollowable here. What replaces it is checks that actually discriminate: `lockfileVersion` is
  3 (ruling out a v1/v2 downgrade), `npm ci --ignore-scripts && git diff --exit-code
  package-lock.json` proves the lock matches `package.json`, the locked `better-sqlite3` entry has no
  install script, and the writer's `node --version && npm --version` is recorded in the SUMMARY. CI's
  `setup-node` Node 22 *consuming* this lockfile is the direction that matters, and that is the
  enforcing gate. Plan 01 owns this; no other plan may re-order regeneration "the way plan 01 did it
  with npm 10" — plan 01 did not. Wipe `node_modules` before the first install: a stale `.node` plus `-f` is the
  classic works-locally/red-on-CI split.

### Verification — the Electron blind spot

- **D-08 — "CI green" is NOT acceptable closure evidence for FLOOR-03.** `npm test` runs under plain
  Node with `electron` stubbed by `test/load-ts.cjs`, so all 423 unit tests are *structurally
  incapable* of failing on an Electron-version regression. The only job that launches real Electron
  is the Playwright smoke on `.github/workflows/e2e.yml`, which is **Linux/xvfb only** — so Windows
  and macOS get zero runtime coverage of Electron 43, and the Windows-only conpty path is exercised
  by no Electron-launching job on any platform.
- **D-09 — FLOOR-03's closure evidence is a live operator run on the Windows machine:** launch the
  built app, open a terminal pane, confirm a real PTY spawns and a real `better-sqlite3` write
  lands. Recorded alongside CI, not replaced by it.
- **D-10 — Add one assertion to the e2e smoke** reading `process.versions.electron` /
  `process.versions.modules` from the launched app and asserting the major. One line, and the only
  automated thing that would catch a silent revert to 32.

### Agent identity — the hook socket (GATE-01)

- **D-11 — Per-agent random token, minted per spawn, injected into that PTY's env; the server keeps
  a `Map<token, agentId>`, derives the agent id **server-side**, and DISCARDS `payload.agent_id`
  entirely.** This removes the mismatch-check branch rather than adding one, and the same Map handles
  revocation on PTY exit. Identical on Windows/macOS/Linux (env vars have no platform surface), and
  the six shim templates need **no body change** — they already read
  `process.env.HIVE_SOCK_TOKEN`; only what main puts in each PTY's `opts.env` changes.
- **D-12 — Deleting `process.env.HIVE_SOCK_TOKEN = hookSockToken()` at `src/main/index.ts:5534` is
  MANDATORY, not optional.** Verified present at that exact line. `src/main/pty.ts:665` spreads
  `process.env` into every PTY, so leaving that line makes every other part of D-11 cosmetic — every
  PTY would still inherit the old floor-wide master key.
- **D-13 — The qwen proxy sidecar's own spawn site must pass the per-agent token explicitly**, since
  it is spawned with `...process.env` and would otherwise be dead-hooked by D-12.
  **Ownership set by red-team round 2 (2026-08-20):** the edit is in `src/main/hive.ts`, which plan 02
  may not touch (plan 03 owns it in wave 2) and which cannot compile against plan 02's mint until the
  wave after. It is carried by **plan 06 task 4, wave 3**, and asserted whole by plan 23 in wave 9.
  The qwen/crush tier is dead-hooked for that one wave — accepted deliberately, because the
  alternative is keeping the floor-wide secret alive through wave 3, which is the vulnerability
  GATE-01 exists to remove. A dead hook is inert; a live shared secret is exploitable.
- **D-14 — Document the honest ceiling in the `hooks.ts` header.** An agent's own shell can always
  read whatever its own shim can read, so the property is not secrecy.
  **Narrowed by red-team round 2 (2026-08-20):** it is not "A cannot authenticate as B" either. The
  token lives in B's process environment (`src/main/pty.ts:664-693`); on Linux a same-uid sibling
  reads `/proc/<B-pid>/environ`, `AGENT_DENY_RULES` covers no `/proc` path, and B's pid is one
  `pgrep -f` away. The achievable, testable properties are exactly two: **there is no floor-wide
  key**, and **`payload.agent_id` is no longer trusted** for identity. Docs, UI and the `hooks.ts`
  header state those two and name the same-uid limitation. Do not let anything claim more.
- **D-15 — Rejected, with reasons recorded:** a perms-restricted token *file* buys nothing against a
  same-uid shell and `chmod 0o600` is effectively a no-op on NTFS (false assurance);
  HMAC/nonce rotation adds freshness but not impersonation resistance, and `PI_EXTENSION` /
  `OPENCODE_PLUGIN` are fire-and-forget so they cannot do challenge-response without restructuring;
  socket peer-credential binding has **no supported Node API** for the socket fd or pipe handle
  (nodejs/node#7627), so it would mean authoring and ABI-rebuilding a native addon on three CI gates.
- **D-16 — Test:** extend `test/net-binding.test.cjs` (which already drives a **real**
  `net.createConnection` over a real socket/named pipe) with a case that posts agent A's token
  carrying `agent_id: 'B'` and asserts the event surfaces as A, or is dropped.

### Spend — enforcement and arithmetic (FLOOR-09, FLOOR-10, RECORD-03, RECORD-04)

- **D-17 — Enforcement is a new arm in the EXISTING breaker ladder, not a second state machine.**
  Add `budget: {taskId, tokens, cap}` to `BreakerInput` and one arm to `evaluate()`. ≥80% →
  `steering` (mail to assignee, no work interruption). >100% → `constrained` (stop active work, get
  god sign-off) plus the operator toast. The breaker is already per-agent, so this affects only the
  assignee — it is **not** a floor-wide trip.
- **D-18 — `hardStop` stays `false` by default. Nothing gets silently killed.** An agent killed
  mid-edit with unsaved work is precisely the trust failure this product exists to prevent; a card
  that burns the subscription quota overnight is the other. The default outcome for an over-budget
  card is **paused and reported** — which is both halves of "leave it running and trust it". A hard
  kill remains available only behind explicit opt-in (`circuitBreaker.hardStop: true`).
- **D-19 — RECORD-04 is WORSE than the roadmap documents, and the plan must fix the real defect.**
  **CORRECTED / verified against source.** The ledger holds **mixed row semantics**:
  `src/main/index.ts:1513` appends *cumulative* per-beat snapshots, while `src/main/hooks.ts:272`
  appends *per-response deltas* for the proxy tier — and `taskSpend()` (`hive.ts:2566-2582`) sums
  both. `src/main/db.ts:44` states the contract verbatim: *"Rows are CUMULATIVE snapshots (one per
  agent per heartbeat beat) — diff consecutive rows for velocity."* Fix: make **every** row
  cumulative-per-agent and derive spend from **clamped consecutive diffs** (clamp negatives to 0 —
  `telemetry.forget()` on respawn resets the accumulator).
- **D-20 — RECORD-03: `COST_TAIL_BYTES` must go from the `taskSpend` path.** Verified:
  `hive.ts:244` defines the 1 MB tail and `hive.ts:2571` reads through it. Spend must be summed over
  **all** of that card's rows. Cheapest correct shape, given the beat already computes each agent's
  per-beat delta: an in-memory `Map<taskId, tokens>` accumulated in the beat, rebuilt by **one full
  ledger scan at startup** so a card in flight across an app restart does not silently reset to zero.
- **D-21 — FLOOR-09 closes almost for free, via a gap the audit did not name.**
  `telemetry.recordCostSample()` (`telemetry.ts:251`) exists, is documented as exactly this wiring,
  and has **zero production callers** — verified: the only references outside its own definition are
  two doc comments in `agentProvider.ts` and six calls in `test/engine-parity.test.cjs`. Point
  `hooks.ts`'s `CostSample` branch at it instead of at `hive.appendCostLedger`, and qwen/crush spend
  reaches `getAgentUsage` and therefore the breaker's cost, token and velocity arms — a one-call edit.
- **D-22 — Surfacing needs no new IPC channel.** `control:breakerState` already carries `reason` to
  the renderer. Widen the existing `hive:tasks` row (`index.ts:3894` / `preload:779`) with
  `{tokens, budgetTokens, pct}` to give the card a meter through a channel the renderer already polls.
- **D-23 — `test/hive-protocol-v2.test.cjs:276-284` currently asserts the WRONG (summing) behaviour
  and must change with the arithmetic fix.** This is a deliberate, documented contract change — the
  test encodes a defect. It is **not** licence to bend a test so a buggy source path passes: the
  source fix (D-19, D-20) lands first in its own `fix(...)` commit, and the test is rewritten to
  assert the corrected arithmetic, with the old expectation recorded in the commit message.

### Tests and lint (FLOOR-15, FLOOR-16)

- **D-24 — Renderer component tests via `react-dom/server`'s `renderToStaticMarkup`, under
  `node --test`. Zero new dependencies** — `react-dom` is already a production dependency. This
  satisfies "component tests beyond the boot smoke spec" *literally* (real `.tsx` is rendered) while
  honouring the repo's documented anti-framework stance, and it runs on all three platforms in the
  existing gate.
- **D-25 — Cost is one small change to `test/load-ts.cjs`:** add `.tsx` to `resolveTs()` and set
  `ts.JsxEmit.React` in the transpile options.
- **D-26 — Scope: 3–5 static-render tests on sub-100-line presentational components** (candidates:
  `ErrorBoundary`, `BlockedBanner`, `UpdateBadge`, `PixelBadge`, `SidebarTabs`, `ToolWaterfall`,
  `ProviderLogo`). No `.tsx` file references `window.api`/`window.electron` directly — all IPC goes
  through hooks and the store — so these are genuinely renderable in isolation. Store-coupled
  components need the store injected via the existing `require.cache` technique. Accept the
  limits: SSR runs no effects and no events, so assertions are on rendered markup only.
- **D-27 — Rejected:** React Testing Library + jsdom (4 permanent devDeps, a second test idiom, and
  a directly contradicted house rule, bought for interaction coverage a one-operator tool exercises
  manually every session). More Playwright specs are a fine *complement* for flows, but each one
  loads the phase's flakiest job and is Linux-only — not the answer to "component tests". Further
  logic extraction stays the default for *new* code, but as the answer to FLOOR-15 it means
  refactoring 2000-line components inside a 23-requirement phase.
- **D-28 — ESLint flat config with `eslint-plugin-react-hooks` ONLY.** 2 devDeps, ~10-line
  `eslint.config.js`, wired into CI as a hard gate. The rule surface is two rules
  (`rules-of-hooks`, `exhaustive-deps`), so the finding count is bounded and small.
  `rules-of-hooks` catches genuine runtime bugs `tsc --strict` structurally cannot model.
- **D-29 — The 13 orphaned comments resolve 9 + 4. CORRECTED** (research said 10 + 3; verified
  count is 9 + 4). The **9** `react-hooks/exhaustive-deps` disables become **live, honoured
  suppressions with zero rewriting** — they stop being orphans by becoming real, and the intent they
  record is preserved in place. The **4** `@typescript-eslint/*` disables (2 `no-var-requires`,
  1 `no-require-imports`, 1 `no-explicit-any`) reference rules that will not be configured and are
  **deleted**.
- **D-30 — The CI step MUST use `--max-warnings 0`.** Both `exhaustive-deps` and unused-directive
  reporting default to *warnings*, which a hard gate would otherwise wave straight through.
- **D-31 — Explicitly NOT adopting the full `typescript-eslint` ruleset** — ~100 stylistic and
  type-aware rules across 63.7k lines is the finding-explosion that would eat the phase. Explicitly
  NOT adopting oxlint or Biome: neither honours the existing comment syntax, so all 13 would need
  rewriting — the cost of deletion *plus* the cost of a dependency.

### Memory and the FTS index (FLOOR-07)

- **D-32 — The FTS5 index goes in the already-open `PersistStore` (`src/main/db.ts`) as an
  append-only migration; the `kg-core.cjs` sidecar is NOT touched.** The sidecar constraint is real
  but not load-bearing here, because two subsystems were conflated: `kg-core.cjs` is the thing that
  must stay native-free (it runs as plain `node` outside Electron, shipped as `resources/kg.cjs`),
  whereas the clause Phase 1 is graded on is **memory** recall, which lives entirely in main
  (`memory.ts`) where `better-sqlite3` already loads. Verified: `SQLITE_ENABLE_FTS5` is present in
  `node_modules/better-sqlite3/deps/defines.gypi:24`, so this needs **zero new dependencies**.
- **D-33 — Schema: `memory_fts(text, agent_id UNINDEXED, project UNINDEXED)`.** Scoping becomes a
  `WHERE agent_id = ?` predicate — the exact shape RECALL-02 later binds server-side instead of
  trusting `--wing`. Also gives a free keyword recall path for the common case where `mempalace`
  is not on PATH and `MemoryManager` degrades to a silent no-op.
- **D-34 — `knowledgeGraph.enabled` stays `false`** (`config.ts:497`). FTS5 landing changes the
  index, not the reasons the toggle is dark: there is no renderer panel, and the graph was formally
  **retired** on 2026-08-20. Flipping the default would ship a subsystem with no UI under a name the
  docs are simultaneously disowning.
- **D-35 — Take the honesty work; it is the cheaper half and fully in scope.** Add `scope` to
  `MemoryPanel.tsx`'s local `MemoryStatus` interface and render the `'shared'` default as a plain
  warning line — the exposure is already spelled out verbatim at `memory.ts:14-16`. **Delete** the
  two dead preload exports `memoryWakeUp` / `reflectNow` (`preload/index.ts:828-835`) and their
  now-unreferenced `ipcMain.handle` registrations (`index.ts:4041,4046`) — `reflect.ts`'s own timer
  calls the class method directly, so nothing breaks. Rename the "Enterprise Knowledge Graph" claim
  in `README.md` and `preload/index.ts:838` to what `kg-core.cjs:3-8` already honestly calls itself:
  a keyword knowledge store.
- **D-36 — Docs must state the `--wing` limit plainly:** scope is agent-supplied until RECALL-02
  lands in Phase 5. No server-side enforcement in Phase 1 — that is Phase 5's job and building it
  now hollows out RECALL-02.

### The build-or-declare forks

- **D-37 — FLOOR-02 / Fork A: THE ROADMAP'S PREMISE IS WRONG. The Stop-drain is not dead.**
  **CORRECTED — verified directly by the orchestrator against source.** It is live and guarded:
  `src/main/index.ts:467` passes `(agentId) => delivery.drainAtStop(agentId)` into `HookServer`,
  `src/main/hooks.ts:332` calls it at the `Stop` boundary, and `src/main/delivery.ts:216` guards on
  `paused()` + `vetoed()`. `test/delivery-main.test.cjs:117-142` already covers four guard paths.
  So criterion 1's **"live under a guard" branch is already satisfied** — no restore, and no
  deletion of a working, tested feature.
- **D-38 — What FLOOR-02 actually still needs, therefore, is two things:** (a) move the
  **queue-drain** (`src/renderer/src/hooks/useHive.ts` effect #4, via `queueDelivery.ts`) and the
  **idle-quiesce backstop** into main — that is the requirement's real body and is not optional
  either way; and (b) delete `HIVE.md`'s four surviving stale denials (`:126` "nothing calls that
  today", `:229` the `⚠️ shipped, but not as planned` phase note, `:269` "Moot today", `:272`
  "`cursor.json` is seeded but never advanced"), which now contradict `ARCHITECTURE.md:56,201,307`
  inside the same repo. That contradiction *is* the "doc promising a code path that does not run"
  the criterion bans — it just points the opposite way from what the roadmap assumed.
- **D-39 — FLOOR-18 / Fork B: declare the limitation. "Supported" is not buildable here.** Upstream
  `openai/codex#30372` records the Codex app-server daemon lifecycle as **Unix-only** (pidfile plus
  Unix process/file-locking primitives). Building it would mean owning a Rust daemon fork or a
  WSL/named-pipe shim forever, on a one-machine zero-recurring-cost project.
- **D-40 — Declare it in the three places the criterion names, using the channel that already
  exists.** (1) Source: replace the bare `if (process.platform === 'win32') return false;` at
  `src/main/index.ts:269` with a comment naming the upstream issue, so the line stops looking
  arbitrary. (2) UI: `providerCapabilities` / `capabilityLine` (`src/shared/providerAutomation.ts:258-289`)
  is the established per-engine gap channel — it already carries "NO MAIL" and "spend UNTRACKED".
  This makes the capability shape platform-aware, so `capabilityLine` gains a platform argument or a
  `remote` bit. **Watch the prompt-cache invariant**: a platform-dependent capability line changes
  roster-prompt text per OS, and `providerAutomation.ts:278` flags the cache-safe roster position —
  see ADR 0002. (3) Docs: the engine table in README/docs. Extend `test/engine-parity.test.cjs`,
  which already asserts on `capabilityLine`.
- **D-41 — FLOOR-18 is NOT closed by a bare `return false` removal.** Letting the existing
  best-effort ladder fail loudly trades a silent no-op for guaranteed noise plus two subprocess
  timeouts on every Windows Codex spawn, and still surfaces nothing in UI or docs.

### Evidence bar and issue closing (Fork C)

- **D-42 — The bar is per-ACCEPTANCE-CLAUSE, not per issue.** This is the resolution at which the
  recorded 2026-08-20 error happened: all four mis-assessed issues had real landed code and exactly
  **one unmet clause each** — #4 (`grep autoMode src/renderer/src/components/AgentCard.tsx` → empty;
  re-verified empty at discussion time), #5 (queue-drain and quiesce still renderer-only), #10
  (`electron` still `^32.2.0`), #34 (no consumer of `taskSpend().over`). A per-issue bar of "some
  code exists" passes all four; a per-clause bar fails all four.
- **D-43 — Per issue, the closing comment carries:** the issue's own acceptance text quoted
  verbatim; one command per clause with its **actual output pasted** (an empty grep is the evidence);
  a **named test** added in the same PR; and the `npm test` exit line — run on Windows too when the
  fix is platform-touching. Repeating the 2026-08-20 mistake then requires actively pasting a
  passing grep for a false claim.
- **D-44 — Close incrementally, in the PR that fixes it** — not in one end-of-phase sweep. A batch
  pass under time pressure is exactly the shape that produced the recorded error, and a
  fixed-but-open issue is invisible to the phase's own progress.
- **D-45 — Accumulate the negative greps in one repo-fact test file**, following the existing
  precedent of `test/ci-config.test.cjs`, `test/engine-parity.test.cjs` and
  `test/main-hardening.test.cjs`. This turns the end-of-phase sweep into `npm test` on three
  platforms plus one `gh` query — a live test run rather than an agent's report.
- **D-46 — Phase gate (mechanical):**
  `gh issue list --state open --label floor-inspection --json labels --jq '[.[]|select(.labels|map(.name)|index("epic")|not)]|length'`
  returns `0` — i.e. only #47, #48, #49, #73 remain, all `epic`-labelled.
- **D-47 — The four previously-mis-assessed issues (#4, #5, #10, #34) additionally get a
  fresh-context adversarial re-verify** before closing. A subagent verdict is still an agent's
  report, so this is an *addition* to D-43's mechanical bar, never a substitute for it.

### Claude's Discretion

Auto-mode resolved every gray area to its researched recommendation, so the following are left to
the planner rather than pre-locked here:

- Plan slicing and wave assignment across the 23 requirements — subject to the hard constraint that
  the Electron bump (D-03) is plan 1 and gates everything else.
- Exact disjoint file-ownership lists per agent (the proven method; `use_worktrees: false`).
- Which specific presentational components get static-render tests (D-26 gives candidates).
- Whether `better-sqlite3` is bumped, which is contingent on the D-06 compile result.
- The exact shape of the `capabilityLine` platform argument vs `remote` bit (D-40).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement sources
- `.planning/ROADMAP.md` § "Phase 1: Finish the Floor" — the goal, the five pulled-forward
  requirements and their rationale, and the five success criteria. **Note D-02: criterion 2's
  "Electron 38+" is stale and reads as "Electron 43.x".** **Note D-37: criterion 1's "dead
  Stop-drain" premise is factually wrong — the drain is live and guarded.**
- `.planning/REQUIREMENTS.md` — FLOOR-01…18 (lines ~13-73), GATE-01 (135-141), RECORD-03/04
  (175-181), VERDICT-02/03 (213-218). Each requirement states only what is **still missing**; the
  shipped half is in PROJECT.md under "Validated" and must not be re-litigated.
- `.planning/PROJECT.md` — core value, the zero-recurring-cost constraint, the "Verification
  honesty" constraint, the personal-tool scope constraint, and the Key Decisions table.
- `.planning/STATE.md` — accumulated decisions, blockers and the Phase 3 ordering todo.

### The audit that is the backlog
- `docs/floor-inspection.html` — the full code audit of `1ad9638`; 8 Critical / 12 High / 27
  Medium-Low with file:line evidence. Every finding became issue #1–#61.
- `.planning/codebase/CONCERNS.md` — **read the "Method" paragraph first.** It records the
  2026-08-20 correction verbatim: four issues (#4, #5, #10, #34) were wrongly called "stale
  trackers" because the bar applied was "some code exists" rather than "the issue's stated done".
  D-42 exists to make that error mechanically impossible.

### Decision records (load-bearing — do not contradict)
- `docs/adr/0001-one-gate-for-pty-writes.md` — the one-gate PTY writer. Governs anything that types
  into a terminal.
- `docs/adr/0002-prompt-cache-invariant.md` — **directly constrains D-40**: a platform-dependent
  capability line changes roster-prompt text per OS; `src/shared/providerAutomation.ts:278` flags
  the cache-safe roster position.
- `docs/adr/0003-fail-safe-worktree-gc.md` — fail-safe worktree GC.
- `docs/adr/0004-single-committer-git.md` — the single-committer git model.
- `docs/message-queue.md` — who may type into a terminal.

### Subsystem docs touched by this phase
- `DESIGN.md` §706 — states the 14px floor for user-facing text that FLOOR-12 enforces against
  `src/renderer/src/design/tokens.css:61-68`.
- `HIVE.md` — **carries the four stale denials D-38(b) deletes** (`:126`, `:229`, `:269`, `:272`).
- `.planning/codebase/ARCHITECTURE.md` §§56, 201, 307 — describes the Stop-drain **correctly**; it
  is HIVE.md that contradicts it.
- `docs/design/knowledge-graph.md` §§45, 191 — names SQLite FTS5 as the documented next step, and
  §191 names the loopback query endpoint that is RECALL-02's job, not Phase 1's.
- `CONTRIBUTING.md` — note its "11 tests fail on Windows, non-blocking" paragraph is **stale**;
  `.github/workflows/ci.yml` is the source of truth on the gate.

### Build, CI and test surface
- `.github/workflows/ci.yml` — the hard 3-platform gate. No `continue-on-error`, and none may be
  added. `:31-36` runs `npm audit --audit-level=high`.
- `.github/workflows/e2e.yml` — the only job that launches real Electron; Linux/xvfb only. Central
  to D-08/D-09/D-10.
- `.github/workflows/release.yml` — where FLOOR-06's provenance and release-link gate land.
- `.planning/codebase/TESTING.md` — the full testing doctrine: `node --test`, `test/load-ts.cjs`,
  the `require.cache` injection pattern, "no mocking the thing under test". D-24/D-25 extend this
  file's own escape hatch; read it before touching the loader.
- `.planning/codebase/STACK.md` — versions, pins, and *why* each exact pin exists (node-pty 1.1.0
  and the byte-exact conpty patch; typescript 5.9.3).
- `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONVENTIONS.md`,
  `.planning/codebase/INTEGRATIONS.md` — remaining maps, read as needed per plan.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/main/breaker.ts`** — the steer → constrain → stop ladder, already per-agent, already wired
  to `control:breakerState` → `preload:1081` → avatar/meter, already emits a native operator toast,
  already calls `forget()` on teardown, and already ships `hardStop: false`. D-17 adds one arm to a
  path that is otherwise complete. `evaluate()` is pure, so it tests under the existing fake-clock DI
  style.
- **`src/main/telemetry.ts:251` `recordCostSample()`** — exists, documented as exactly the FLOOR-09
  wiring, and has **zero production callers**. D-21 is a one-call edit.
- **`src/shared/providerAutomation.ts:258-289` `providerCapabilities` / `capabilityLine`** — the
  established per-engine gap channel, already carrying "NO MAIL" and "spend UNTRACKED", already
  asserted on by `test/engine-parity.test.cjs`. D-40 rides it rather than inventing a warning surface.
- **`react-dom`** — already a production dependency, so `renderToStaticMarkup` (D-24) costs nothing.
- **`better-sqlite3` with `SQLITE_ENABLE_FTS5`** — verified compiled in
  (`deps/defines.gypi:24`), so D-32 needs no new dependency.
- **`hive:tasks` IPC row** (`index.ts:3894` / `preload:779`) — already polled by the renderer;
  widening it (D-22) avoids a new channel.
- **`test/net-binding.test.cjs`** — already drives a real socket/named pipe and already greps source
  to pin the constant-time compare. D-16 extends it.
- **`test/ci-config.test.cjs`, `test/main-hardening.test.cjs`, `test/engine-parity.test.cjs`** — the
  repo-fact-test precedent D-45 follows.

### Established Patterns
- **Extraction-to-pure-function** is the proven testability seam (`safeJoin`/`isWithinRoots`/
  `isAllowedExternalUrl` → `src/main/fs.ts`; `worktreeHasUnintegratedWork` → `src/main/git.ts`).
  `src/main/index.ts` cannot be loaded under plain Node because it imports `electron`.
- **Dependency-injected config objects of plain functions** (`write`, `emit`, `log`, `now`, `sleep`,
  `respawn`) let `DeliveryService`, `AccountPoolManager` and `HookServer` be driven with a fake clock
  and zero real elapsed time.
- **`require.cache` injection** is how Electron and native modules are faked. Note the consequence
  for D-32: `test/config-secrets.test.cjs`'s in-memory `FakeDatabase` has no FTS5, so the migration
  needs a real SQLite handle in its test or it ships unverified.
- **Cumulative-snapshot ledger rows, diffed for velocity** (`db.ts:44`) — the contract D-19 restores.
- **No `git add .` / `git add -A`; stage specific files only.** Disjoint file ownership per agent,
  no worktrees.

### Integration Points
- `src/main/index.ts:467` → `src/main/hooks.ts:332` → `src/main/delivery.ts:216` — the live guarded
  Stop-drain (D-37).
- `src/main/index.ts:1513` and `src/main/hooks.ts:272` — the two cost-ledger appenders whose mixed
  semantics D-19 unifies.
- `src/main/index.ts:5534` — the floor-wide token line D-12 deletes; `src/main/pty.ts:665` is why it
  matters.
- `src/renderer/src/hooks/useHive.ts` effect #4 → `queueDelivery.ts` — the queue-drain D-38(a) moves
  to main, plus the idle-quiesce backstop in the same file.
- `src/main/index.ts:269` `enableCodexRemoteForSpawn` — the bare `return false` D-40 replaces.
- `src/main/db.ts` `PRAGMA user_version` migration rail — where D-32's append-only migration lands.
- `src/renderer/src/components/AgentCard.tsx` — FLOOR-01's `autoMode` surfacing (verified absent:
  `grep -c autoMode` returns 0) and FLOOR-13's cost field.

</code_context>

<specifics>
## Specific Ideas

- **"Every claim the project makes about itself is true"** is the phase's actual acceptance test.
  Two roadmap claims did not survive the discussion's own verification pass (D-02 Electron 38+;
  D-37 the "dead" Stop-drain). The planner should expect to find more, and should treat correcting a
  roadmap claim as *doing* the phase, not as deviating from it.
- **The operator's standing bar:** an agent reporting "fixed" is a claim, not evidence. This already
  caught four over-claims on this repo. D-42 through D-47 are that bar made mechanical.
- **The zero-recurring-cost constraint is absolute** — total roadmap cost $0. Nothing in Phase 1
  should introduce a metered or subscription dependency; every decision above was checked against it
  (the FTS5 index, the provenance path, and the lint/test choices are all $0).

</specifics>

<deferred>
## Deferred Ideas

- **`node:sqlite` FTS5 in the `kg-core.cjs` sidecar** (one index instead of two) — FTS5 only reached
  `node:sqlite` in Node 22.16 and the project declares `engines: ">=20 <23"`, so a probe-and-fallback
  branch would keep `index.jsonl` alive anyway. Revisit when the roadmap can pin the agent-side Node.
- **Server-enforced memory scope** — RECALL-02, Phase 5. Building the loopback query verb now
  hollows out that requirement (`docs/design/knowledge-graph.md:191`).
- **Socket peer-credential binding** (SO_PEERCRED / `GetNamedPipeClientProcessId`) as defence in
  depth — needs a native addon with no supported Node API today (nodejs/node#7627). Revisit only if
  a threat model with non-descendant local attackers appears.
- **HMAC / nonce replay protection on hook payloads** — an increment on top of D-11, worth doing if
  hook payloads ever gain a replay-sensitive effect (spend, irreversible writes).
- **Windows and macOS Electron-launching e2e runners** — the D-08 blind spot. Add when a second
  Electron-version incident actually happens; D-10's one-line version assertion is the cheap interim.
- **Full `typescript-eslint` ruleset** — deliberately rejected for Phase 1 (D-31), not forever.
- **React Testing Library + jsdom** — deliberately rejected for Phase 1 (D-27), not forever.
- **A knowledge-graph renderer panel** — the graph was formally **retired** 2026-08-20, not
  deferred; RECALL-01…05 covers the need. Do not resurrect it as a Phase 1 nicety.
- **`better-sqlite3` 12/13 bump as planned work** — only a contingency here (D-06). If 11.10.0
  compiles clean against Electron 43, this stays deferred.

</deferred>

---

*Phase: 1-Finish the Floor*
*Context gathered: 2026-08-20*

---

## Red-Team Log

**Round 1 — NOT CLEAN — 2026-08-20** — lenses: (a) correctness/cardinal-invariant · (b) executability ·
(c) security/trust-boundary · (d) scope/context-budget/runtime-gate · (e) test-quality/fake-coverage ·
(f) cross-plan-contracts/wave-ordering. Six hostile source-grounded lenses, dispatched as parallel
direct Agent calls.

`RED_TEAM_CLEAN = false`. Auto-advance to execute-phase is **blocked** per the step-11.5 gate.

### Root cause found, and fixed: the whole plan set was measured against a stale branch

Branch `docs/codebase-map` was **19 ahead / 2 behind `origin/main`**. The two missing commits were
PR #76 (`332ce01` + merge `19dbdfb`) — the fix that makes the six shim templates send
`payload.sock_token`. Verified at the time: `grep -c "sock_token" src/main/hive.ts` returned **0**,
while `hooks.ts authorized()` rejects any payload without it — i.e. on this branch the hook socket
was fail-closed dead, and **D-11's premise ("the six shims already send it — no body change") was
false here while true on main.**

`origin/main` merged into the branch. Post-merge: `sock_token` in `hive.ts` = 3, test files 55 → 56,
`npm test` = **426 tests / 422 pass / 0 fail / 4 skipped** (was 423/421/2). D-11's premise now holds.

**Consequence the remaining work must absorb:** every baseline count, line anchor and site total in
`01-RESEARCH.md`, `01-UI-SPEC.md`, `01-PATTERNS.md`, `01-VALIDATION.md` and all 23 plans was measured
**pre-merge**. `hive.ts` gained 8 lines at `:3086`, so anchors below that point shift; test-count and
`sock_token` baselines changed. A re-measure pass is required before execution.

### Round 1 findings — ALL CLOSED in commit `2fc9ef1` (2026-08-20)

Every row below was closed against live source, not against a report. Three of them were closed by
changing something other than what round 1 named, because the fix pass found the real cause:

| Lens | Finding | Closed by |
|---|---|---|
| (c) security | Shims did not send `sock_token`; GATE-01 premise false on this branch | the `origin/main` merge (PR #76) |
| (c) security | D-13's qwen sidecar spawn has no owning plan | **plan 06 task 4, wave 3** — see D-13 above for why no wave-2 plan can carry it |
| (c) security | Shared shim `<hiveRoot>/bin/cth-hook.cjs` unprotected | plan 02 task 2's PreToolUse gate (wider than `AGENT_DENY_RULES`, which is Claude-only) |
| (b) executability | `&amp;&amp;` HTML-escaped in three `<automated>` tags | literal `&&` in plans 01, 17, 18 |
| (b) executability | `npx eslint --format compact` removed in ESLint 9 | built-in `json` formatter; the compact republish fails the plan's own publisher bar |
| (b) executability | Nine `exhaustive-deps` suppressions vs `--max-warnings 0` unreachable | `--no-inline-config` resolver decides keep/delete per file, mechanically |
| (a) correctness | `HIVE.md:85-103` stale Stop-drain denials | **nine** stale claims, not three — all gated by plan 07 |
| (a) correctness | GATE-01's doc surface has no owning plan | **four** surfaces, not three — split across plans 02 and 04 |
| (a) correctness | `sweepTaskReviews`' `!previous.has(task.id)` | clause deleted by plan 03, with a test that fails against today's source |
| (f) cross-plan | Plan 21 (w8) shifts `file:line` anchors plan 23 (w9) asserts | allowlist re-keyed to a `{file,text,count}` multiset + mutation proof |
| (f) cross-plan | Plan 21 task 2's real file set is 60, not 13 | whole-renderer glob declared + `git diff --name-only` containment |
| (d) scope/gate | `npm rebuild better-sqlite3` in three hard-gate CI jobs | removed — 13.0.3 is N-API, ships 8 prebuilds, no install script (verified in a clean dir) |
| (d) scope/gate | npm-10 lockfile rule has no working check | rule deleted; replaced with checks that discriminate |
| (d) scope/gate | "Revert to 11.10.0" is the failure mode, not a recovery | real §Recovery block that ends honestly in "phase blocked" |
| (e) fake-coverage | Plan 10's FTS5 test could skip-as-green | no skip constructs, TAP `# skipped 0`, load at column 0 outside any `try` |
| (e) fake-coverage | Plan 08's restart test satisfiable by a `Map` | real `spawnSync` process boundary + a negative control |
| (e) fake-coverage | 8 of 56 test files are hand-rolled, only 1 flagged | all eight enumerated; also caught `proc-kill` exiting 0 on win32 before asserting |

**Three defects the fix pass found that round 1 had not:** plans 01 and 10 asserted opposite values
for the same `ci.yml` grep (wave 5 would have broken wave 1's gate); `test/proc-kill.test.cjs:28-32`
is green-forever on Windows; and the GATE-01 sidecar fix cannot compile in wave 2 at all.

Full lens reports are in the session transcript. Nothing here is a wording nit; each entry either
lets an executor do wrong work, ships a false claim, or produces coverage that cannot fail.
