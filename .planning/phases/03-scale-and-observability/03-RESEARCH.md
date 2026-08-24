# Phase 3: Scale and Observability - Research

**Researched:** 2026-08-24
**Domain:** Electron main-process default-path relocation, SQLite migrations, a JSON team-manifest
format, a native day-band timeline UI, a wall-clock scheduler, and a single shared derivation module
for a Pixi/React consolidated agent card.
**Confidence:** HIGH — every claim below with a file:line citation was re-measured against source in
this session (`grep -n` / `sed -n` against `E:/munder-difflin/.claude/worktrees/phase-03`, `npm test`,
`npm run typecheck`), not inherited from CONTEXT.md, ROADMAP.md or any prior SUMMARY.

<user_constraints>
## User Constraints (from CONTEXT.md)

**Gathered 2026-08-24, `--auto` mode: every gray area auto-resolved to the researched recommendation.**
Copied verbatim below because the planner MUST honor these — they are not open for re-litigation. The
planner's job is HOW to implement them, never WHETHER.

**Corrections CONTEXT.md makes to the project's own planning documents** (each is a fact a downstream
agent would otherwise inherit and act on wrongly):

| Document claim | Measured reality |
|---|---|
| `REQUIREMENTS.md:164` — STRUCT-02 split hive.ts including **messaging** | Messaging is still in `hive.ts` (D-01). Orphan correction — nobody currently owns it. |
| `REQUIREMENTS.md:145`/`:452` — PARITY-02 **Complete** | 7 of 11 engines are `costTracking:'none'` (D-03). Owned by plan 02-12, **not** by Phase 3. |
| `ROADMAP.md:293-294` — SCALE-01 needs STRUCT-02's registry/router split | Not supported by code; the isolation seam is `hive.root()` (D-02) |
| `ROADMAP.md:281`, `REQUIREMENTS.md:208` — `LOG_ROTATE_BYTES` at `hive.ts:267` | It is at `hive.ts:323`; line 267 is `seedPrompt?: string;` (D-21) |
| `REQUIREMENTS.md:206` — span ring at `telemetry.ts:126` | `SPAN_RING_CAP` is at `telemetry.ts:161` |
| `ROADMAP.md:286` — re-ordering makes **both** criteria hold | False for SCALE-01: RECALL-02 is memory-only (D-06) |
| `ROADMAP.md:283` — the 8 MB rotation is what holes a replayable day | The 8 MB rotate has **never fired**; the real cap is a 64 KB *read* (D-21) |

### Locked Decisions

**Phase 2 dependency status — measured, not trusted**

- **D-01:** STRUCT-02 is PARTIALLY landed, and `REQUIREMENTS.md:164` overclaims it. Measured this
  session: `src/main/hive.ts` is **2,821** lines, with `gitCommitter.ts` (511), `hiveProvisioning.ts`
  (569) and `hiveTemplates.ts` (797) genuinely extracted. Messaging was NOT extracted — `routeMessage`
  (`hive.ts:1539`), `emitMessage` (`:1659`), `terminalHandoff` (`:1679`), `startRouter` (`:1708`),
  `stopRouter` (`:1719`) and `routeOnce` (`:1723`) are all still `HiveManager` methods, as are the task
  ledger and the cost ledger. This is an ORPHAN correction — plan 02-12's ownership note scopes it to
  the PARITY-02 requirement text and status row only, so nobody currently owns line 164. **Phase 3
  adopts it explicitly** or it silently persists.

- **D-02:** STRUCT-02 does NOT block Phase 3, and the roadmap's stated reason for the dependency is not
  supported by the code. `ROADMAP.md:293-294` says "SCALE-01's per-project isolation needs the
  registry/router split from STRUCT-02". Measured: SCALE-01's isolation seam is `hive.root()`
  (`hive.ts:518-521`), which is `join(this.getHome(), 'hive')` — already a lazy closure. `agentDir` and
  every other hive path derive from it, and the *unextracted* router calls `root()` exactly like the
  extracted modules do. Splitting messaging would move that call, not change it. STRUCT-02's remaining
  gap is testability debt, not a Phase-3 blocker.

- **D-03:** PARITY-02 IS REFUTED AND DOES BLOCK SCALE-03 AND SCALE-05 — but Phase 3 does not own the
  correction. Measured in `src/shared/agentProvider.ts`: **7 of 11** presets are `costTracking:'none'`,
  1 `'otel'`, 2 `'proxy'`, 1 `'transcript'`. "All eleven engines report cost to the ledger and to the
  breaker" is false, and it is not buildable: copilot's spend sits on the operator's own Copilot plan
  and never reaches the app, `custom` is an unknown binary, and converting a hooks-bridged engine (grok,
  kimi, opencode) to a proxy bridge would delete its mail bridge, because `ensureAgent` dispatches hooks
  XOR proxy. `test/engine-parity.test.cjs:826` exists to turn exactly that mistake red. Plan 02-12 owns
  the restatement of `REQUIREMENTS.md:145` and `:452`. **Phase 3 MUST NOT edit those two lines** — a
  duplicated correction conflicts with the plan that owns it.

- **D-04:** DAEMON-05 blocks nothing; 02-12 is a soft block on exactly one file. SCALE-01…05
  (`REQUIREMENTS.md:150-158`) contain no reference to the tunnel or the phone PWA, and SCALE-04's
  digest has four non-tunnel rails already in main (`push.ts`, `slack.ts`, `webhook.ts`, `delivery.ts`).
  Plan 02-12 is unrun (no `02-12-SUMMARY.md` on disk) and its `files_modified` is docs plus two test
  files with zero `src/` entries. **Run 02-12 first** and the only collision disappears.

**Execution order and the two forward dependencies**

- **D-05:** LOCKED: numeric order (1 → 2 → 3 → 4 → 5 → 6), and the post-Phase-5 re-verification gets a
  real phase id instead of a prose line. Insert a phase after Phase 5 — "Close the forward
  dependencies" — carrying exactly the two skeptic tests already written at `ROADMAP.md:297-310`; GSD
  becomes Phase 7, a doc-only renumber since no phase directory exists past `02-*`. Rationale from this
  repo's own evidence: unowned prose residuals measurably rot here. **Do not land this roadmap edit
  until 02-12 lands** — nothing blocks on the ordering today.

- **D-06:** CORRECTED — the roadmap frames this as a symmetric choice and it is not. `RECALL-02` is
  memory-only, so re-ordering does NOT make SCALE-01 hold. `REQUIREMENTS.md:270-272` is "an agent in
  project X gets nothing from project Y even when it asks for everything" — recall, memory, the hook
  socket. `grep -n "task ledger" .planning/REQUIREMENTS.md` returns exactly one hit, line 153, which is
  SCALE-01 itself. No Phase 4 or Phase 5 requirement gives `HiveTask` a project field or splits
  `tasks.json`. `ROADMAP.md:286`'s "Both criteria then hold" is therefore measurably overstated: the
  ledger half is Phase 3's own net-new work under *both* orderings.

- **D-07:** SCALE-01 and SCALE-03 are NOT ticked in Phase 3. They stay Pending in `REQUIREMENTS.md`
  with the owner column naming the new phase — never "later". This is the standing rule (a
  partially-landed fix is an open concern) applied as written.

**SCALE-01 — the project boundary is `harnessHome`, enforced by PATH**

- **D-08:** LOCKED: the project boundary IS `harnessHome`, and Phase 3's job is to make the two stores
  that escaped it follow it. This repo already made this decision and left it 90% finished —
  `config:changeHome`'s own comment states the architecture out loud: "every derived path (hive root,
  palace, sock, agent dirs) resolves lazily through `getHome()`". Verified: `hive.root()` is
  `join(home,'hive')` (`hive.ts:518-521`), so `tasks.json`, `registry.json`, `board.md`, `log.jsonl`,
  every agent dir and every mailbox are already per-project, and `ledger()` / `writeTasks()` /
  `mutateTasks()` are the only three ways the ledger is ever touched — all call `root()`. "An agent in
  project X cannot see project Y's task ledger" is TRUE TODAY, for free, by path.

- **D-09:** Exactly two stores escaped the boundary, and closing them is the whole SCALE-01 code
  change. Measured: `harness.db` is `join(app.getPath('userData'), 'harness.db')` (`db.ts:121`) —
  app-global, outside `harnessHome`, so it survives every `changeHome` *and* `app:resetAll`; and
  `KG_ROOT` is `join(app.getPath('userData'), 'knowledge')` (`knowledge.ts:71`), which is the more
  serious of the two because it is injected into every agent's spawn. Both already have an override
  seam (`PersistStore(dbPath)`, `knowledgeGraph.rootPath`), so this is a default-path change at ~6 call
  sites, not an architecture. No new abstraction, no migration, no `user_version` bump, no new
  dependency.

- **D-10:** NO scope column, and the reason is a hard one: `autoMode` ships ON. Measured:
  `config.ts:464` → `autoMode: true`, which strips the tool-approval prompt, so every agent holds an
  unsandboxed Read. A `WHERE workspace = ?` predicate that an agent walks around with `cat
  <home>/hive/agents/*/memory.md` is not isolation — it is a comment with SQL syntax. It also would not
  cover `mempalace`, which is the recall path agents actually run. Path separation is the only kind of
  isolation that survives `autoMode`.

- **D-11:** The task-ledger half of SCALE-01 requires ZERO code — it falls out of D-08. Plans must not
  budget for it, and must not describe it as delivered work.

- **D-12:** A `repoint()` at the first-run `harnessHome: null → set` transition is mandatory, and it is
  a known trap, not a hypothetical. `PersistStore` is constructed at `floor/boot.ts:1148` while
  `harnessHome` is still null on a fresh install, so without a repoint the entire first session
  silently writes to userData and the leak survives the fix. `index.ts:2694-2707` is a comment block
  documenting that this exact transition already shipped one silent-dead-services bug, and the
  `!hiveWasEnabled && hive.enabled()` hook added to fix it is precisely where `persist.repoint()`
  belongs. Two live handles must repoint together — `floor/boot.ts:1148` and a second `PersistStore` at
  `config.ts:684` opened deliberately to avoid an import cycle; miss it and missions fire off the
  previous project's `missionLastFiredAt`.

- **D-13:** HONEST LIMITATION, to be stated in UI and docs rather than reinterpreted: this does NOT
  deliver simultaneous side-by-side floors. `app.requestSingleInstanceLock()` (`index.ts:1511`) still
  quits a second process and switching still relaunches. If "runs more than one floor" is read as *two
  floors live at once*, Phase 3 does not deliver it and must say so. The upgrade path is additive but
  carries a real correctness problem that must be solved first: a per-userData split forks
  `claudeAccounts` (`config.ts:342`) into one pool per project, so two live projects would rotate and
  fail over the same subscription account with neither pool aware of the other.

- **D-14:** The dead `MemoryScope 'agent'` branch is NOT resurrected — and the docs that advertise it
  are corrected. Measured: `HarnessConfig` has zero `scope` fields, and `floor/boot.ts:1137` constructs
  `{ enabled, model }` only — so `scope()` returns `'shared'` unconditionally in the shipped app and the
  whole `'agent'` branch is unreachable. `README.md:122-123` and `MemoryPanel.tsx:126` currently
  instruct the operator to use a control that does not exist; fixing that text is part of this work.
  Wiring the branch belongs with Phase 5, not here.

**SCALE-02 — a populated floor in one action**

- **D-15:** LOCKED: a `hello-markx/team@1` JSON document that is BOTH imported and exported. The format
  question is settled by who *produces* the file, and this repo has already run the experiment:
  `src/shared/hire.ts` is a finished, security-reviewed single-agent format with a deep link, a file
  picker and a modal — and it has no content and no producer, so `OnboardingWizard.tsx:77` still
  advertises a one-click "Agent Gallery" that exists nowhere, and `AddAgentModal.tsx:84`'s `HIRE_PROMPT`
  (the LLM-authoring workaround) has already drifted out of sync with the schema it restates. Shipping
  team@1 with presets or hand-authoring as the only producers repeats that failure one size larger.
  Export is the only producer that cannot drift, because it reads the same `PersistedAgent` records
  `slimAgents` (`store.ts:444`) already writes.

- **D-16:** Export is deliberately LOSSY, and the loss is declared in the UI and in the file itself. It
  drops `cwd`, `account`, `accountPolicy`, `worktreePath`, `ptyId`, the raw `command` **and**
  `commandFlags`. It must never try to recover `commandFlags` by diffing the live command against
  `buildSpawnCommand` — that diff is exactly how a binary path smuggles itself back into a file the
  format exists to keep binary-free. Put that reasoning in a comment at the stripper, not only in the
  plan.

- **D-17:** Import rides the existing `hire:openFile` channel; only export adds one. Branch on the
  parsed `spec` field inside the existing handler (which already returns a discriminated `{ok,
  manifest|error}` and already owns the 64 KB cap and the `JSON.parse`). Only `team:export` is new, so
  `test/boot-floor.test.cjs`'s IPC-name pin needs a two-place edit in the same commit (count 159→160
  plus the sorted-name insertion).

- **D-18:** The bulk-spawn loop is EXTRACTED from `useRestoreTeam.ts:92-205` and shared, never
  re-implemented. That loop's comments record three real defects it already paid for: serial cost ~6×
  for six agents, completion-order overwriting the persisted roster order, and one rejected IPC call
  silently aborting every subsequent agent. Re-implementing is how all three come back. Spawning stays
  renderer-driven: `hive.spawnAgent`'s descriptor carries no model, goal, character, accent, tokenCap or
  capabilities, so a main-driven bulk hire would silently drop half of every template while looking
  like it worked.

- **D-19:** `skills` and `mcpServers` are NOT in team@1 v1. Nothing in the app applies them today even
  for a single hire (`McpConsentModal.tsx:14` says so in-source), so a team template cannot grant them
  either. Declare it in the format's doc comment rather than shipping N × 2 more dead fields.

**SCALE-03 — what a replayable day is read FROM**

- **D-20:** LOCKED: an `events` table as MIGRATION #3 in the existing `PersistStore`, fed by an
  OPTIONAL INJECTED SINK beside `appendLog` (`hive.ts:2485`) and `appendCostLedger` (`:2550`), wired at
  `floor/boot.ts:1148`. Schema: `events(id INTEGER PRIMARY KEY AUTOINCREMENT, floor_id TEXT NOT NULL,
  ts INTEGER NOT NULL, kind TEXT NOT NULL, agent_id TEXT, task_id TEXT, session_id TEXT, payload TEXT)`
  with indexes on `(ts)` and `(floor_id, ts)`. `log.jsonl` is kept and explicitly demoted in its own doc
  comment to the agent-readable tail; SQLite is the declared authority for replay, so the two are one
  funnel with two sinks, not two sources of truth. The `floor_id` column lands now even though its only
  value is a constant until SCALE-01's key exists — adding it later costs a migration plus a backfill
  of rows that are permanently unattributable. Measured: `floorId|floor_id|windowId` returns 0 hits
  across `src/main` and `src/shared` today.

- **D-21:** CORRECTED, AND THIS CHANGES THE JUSTIFICATION: the roadmap's premise about the 8 MB
  rotation is wrong on the mechanism. `LOG_ROTATE_BYTES` is at `hive.ts:323`, not `hive.ts:267` as both
  `ROADMAP.md:281` and `REQUIREMENTS.md:208` claim (line 267 is `seedPrompt?: string;`), and
  `test/repo-claims.test.cjs:91` excludes `.planning/` by construction so this will never go red on its
  own. More importantly the 8 MB rotate has never fired — the only real floor measured wrote 4,521
  bytes of `log.jsonl` over ~2.75 days. What actually truncates replay is `LOG_TAIL_BYTES = 64 * 1024`
  at `hive.ts:326`, a *read* cap in `logTail()` (`hive.ts:2443`), and all renderer consumers already sit
  behind it. Fixing rotation alone changes nothing an operator can see. The honest case for a store is
  the other one: nothing in this app can ask for a time range, and nothing joins the five time-ordered
  stores. Beware the decoy — a second, unrelated `LOG_ROTATE_BYTES` (5 MB, the console tee) lives at
  `index.ts:136`.

- **D-22:** Any cost lane MUST diff, never SUM. ADR-0005 records that ledger rows are cumulative
  snapshots per `(agent_id, session_id)` and that this contract has already been broken once. Use
  `applyCostRow`'s clamped consecutive diff (`hive.ts:2611`). A session's counter restarts at zero on a
  new `session_id`, so a naive last-minus-first across a bucket goes negative or double-counts; the
  check needs a fixture with a mid-day session rollover.

- **D-23:** Retention is chosen in the same plan that creates the table — a single `DELETE FROM events
  WHERE ts < ?` on open, N days. Without it this becomes the app's second unbounded store beside
  `cost-ledger.jsonl`, which is already never rotated.

- **D-24:** DO NOT import `PersistStore` into `hive.ts`. `hive.ts` has zero `from 'electron'` imports
  today and `db.ts` imports `app` from electron; a direct import drags Electron into an Electron-free
  module and breaks the property that makes it `node --test`-able. Use a constructor-injected sink — the
  established pattern is already there (`hive.ts:497` takes `log: (event) => this.appendLog(event)`;
  `boot.ts:1146` already injects a log sink).

**SCALE-03 — the shape of the timeline surface**

- **D-25:** LOCKED: a two-tier "day band" as a new CCTab — fixed-height density band over a wall-clock
  24h axis, a native `<input type="range">` scrubber over bucket index, and ONE merged detail list of
  the selected bucket's rows. Three of this repo's hardest walls all point at this shape. (1) The
  lockfile is frozen and there is no windowing library — re-confirmed:
  `react-window|virtuoso|tanstack|IntersectionObserver` returns zero hits across `src/` and
  `package.json` — so "virtualized list" is not an option that exists, it is a request to hand-roll
  windowing. A 96-column band is a fixed, tiny DOM and the detail list is one bucket deep, so neither
  list is ever long enough to need windowing. (2) The 14px floor is enforced mechanically over
  comment-stripped source against a frozen 16-entry allowlist (`repo-claims.test.cjs:684-729`), and it
  also binds Pixi `Text` — a density band carries no text at all, so the floor simply does not apply to
  the dense part. (3) A native range input renders `min`/`max`/`step`/`aria-label`/`aria-valuetext` into
  first-pass static markup, so it is assertable under `renderToStaticMarkup`, which a hand-rolled drag
  playhead structurally is not. Arrow keys are the step control, so there are no icon-only buttons to
  trip `Icon.tsx:147`'s unconditional `aria-hidden`.

- **D-26:** Envelopes are a FILTER of the event track, not a second source. `hive.ts:1641` writes
  envelopes into `log.jsonl` as `kind:'message'` rows. Only `cost-ledger.jsonl` is a genuinely second
  read. The merged detail list is where "one timeline" is literal.

- **D-27:** The band renders an explicit GAP MARKER naming the first timestamp it actually has — it
  never draws an empty morning as if the morning were quiet, and it never silently `slice()`s a busy
  bucket the way `ToolWaterfall.tsx:16` and the activity tab do today. A truncated bucket returns
  `truncated: true` and the UI prints the real count it could not show.

- **D-28:** Pixi.js is REFUSED for this surface, on a measured bug rather than taste. `glRecovery.ts:9-
  18` records that Chromium caps a renderer at ~16 WebGL contexts and evicts the oldest, that the
  floor's context is created at startup so it is always first out, and that Pixi reports nothing when it
  happens — the floor just goes blank. `OfficeFloor.tsx:238` is deliberately the only `new
  Application()` in the entire renderer, and every xterm already takes a context.

**SCALE-04 — a digest that reaches the operator**

- **D-29:** LOCKED: build ONE digest string per day and deliver it three ways, in this order of
  guaranteedness — WRITE it, TOAST it, PUSH it. (1) `digest-YYYY-MM-DD.md` in the floor root, cloning
  `writeFleetSnapshot`'s best-effort never-throws-from-a-timer shape (`boot.ts:470`); always happens,
  needs no config. (2) `deps.notify({title, body})` (`floor/deps.ts:48`), which works with no window
  today, gated on a new `dailyDigest` field — not on `notifications`, which is documented as "agent
  lifecycle events" and defaults false. (3) When `slackBotToken` and a new `slackDigestChannelId` are
  both set, POST via a new sibling `postSlackDigest(...)` in `slack.ts` — never an edit to
  `postSlackReply`, whose CLAUSE-1 guard against an implicit destination must keep holding for its two
  live callers. Send-only Slack needs only a bot token: `slackEnabled`/`slackSigningSecret` gate the
  *inbound* server, so a digest needs no tunnel, no signing secret and no stable public origin.

- **D-30:** The scheduler is a NEW wall-clock daily timer keyed off a `PersistStore` KV holding the
  last-sent LOCAL DATE STRING — and it must NOT route through `deps.send`. Copy the *timer shape* of
  `syncContextTriggers` (`setTimeout(remaining)` then `setInterval`) but not its delivery:
  `emitContextTrigger` routes through `deps.send`, which returns false with no window and would make
  the entire feature a silent headless no-op — passing every test that runs with a fake window while
  delivering nothing in the exact scenario SCALE-04 exists for. Extract `msUntilNextLocalHour(hour,
  now)` as a pure exported function so `node --test` can drive before/after/exactly-at/next-day and a
  DST transition against a fixed injected clock. Catch-up on arm (`lastSentDate !== todayLocal && now >=
  hour` → fire immediately) is what makes a slept or restarted machine still deliver. Register the timer
  in `SHUTDOWN_STEPS` in the same commit — a missed entry keeps the process alive and makes
  `test/boot-floor.test.cjs` fail by hanging, which reads as a flaky CI run rather than a bug.

- **D-31:** Digest content is LOCKED to what is actually computable, and it may not imply per-day
  completions. `HiveTask` records `createdAt` and nothing else timestamped — there is no `doneAt`. So
  the digest honestly reports per-day spend and tokens (from `cost-ledger.jsonl`, which is append-only
  and never rotated), which `task_id`s were worked, current board counts, and questions asked yesterday
  still unanswered (`humanQA[].askedAt/answeredAt` are ISO-stamped). Adding `doneAt` is a ledger schema
  change with several concurrent writers — a separate explicit decision, never smuggled inside a digest
  plan. Stamp the floor identity into all three outputs, or N instances firing at the same hour into one
  Slack channel are indistinguishable.

- **D-32:** HONEST LIMITATION: "with the app closed" holds ONLY for a floor started `--headless`.
  Measured: `shouldQuitOnLastWindowClose` is `platform !== 'darwin' && !headless`
  (`floor/headless.ts:64`), so on this operator's Windows machine closing the window kills the process
  and no timer survives. The only path producing a `--headless` process is
  `app.setLoginItemSettings({openAtLogin, args:['--headless']})`. This must appear in the Settings UI
  next to the digest toggle — "requires Start at login" — not buried in docs.

**SCALE-05 — one consolidated agent card**

- **D-33:** LOCKED: one pure, React-free derivation module `src/renderer/src/store/agentView.ts`,
  following the `autoMode.ts` pattern (module singleton + `useSyncExternalStore`, `@shared`-only
  imports). This repo already answered this question once and wrote the answer down: `autoMode.ts`
  opens with *"three copies of a safety rule are three chances for one of them to drift and start
  lying"* and is deliberately pure so it runs under plain `node --test`. The proof of what happens
  without it is measured in the same tree: FLOOR-13 unified the AUTO chip via that module and unified
  cost by *copying* the expression into three files — and the copied half has drifted, while the
  shared-module half has not. Verified this session: `FullscreenTerminal.tsx:533` escalates context at
  85/65 and `CommandCenterPanel.tsx:853` at 88/75, with `AgentCard` using a different derivation again
  (the 0..8 `progress` integer). The defect is in derivation, not markup — which is why a shared
  *component* cannot fix it.

- **D-34:** The 322×86 `AgentCard` box does NOT grow, and two of the six renderings are not React at
  all. `AgentCard.tsx:193` is a pixel-measured `const width = 322` whose own comment says the box is not
  grown, with a STOP-AND-REPORT clause and a recorded failure where one unshrinkable sibling drove the
  agent NAME to zero width. `OfficeFloor.tsx` `applyState` is a Pixi scene graph and cannot mount a
  component. Each rendering keeps its geometry and renders the subset it has room for; the consolidated
  five-field card lands in `AgentDetailPanel.tsx`, which today shows none of them.

- **D-35:** Cost is a DISCRIMINATED value — `{kind:'measured', usd}` vs `{kind:'unmeasured', reason}` —
  and NEVER `$0.00` for a `costTracking:'none'` engine. Seven of eleven engines render a declared "no
  cost meter" gap (D-03). A zero that reads as "cheap" is exactly the faked capability this project's
  rules forbid.

- **D-36:** Three main-process fixes are IN SCOPE because the renderer cannot make them, and two of them
  are live bugs. (1) A `control:breakerSnapshot` IPC — `breakers` is push-only today (preload exposes
  only `onBreakerState`/`setBreakerState`, no getter), so a card sourcing block state shows "healthy"
  for a stopped agent for a full breaker beat after every window reload, failing safe in the wrong
  direction. (2) Switch `publishUsage`/`snapshot()` to `getAgentUsage()` — verified: `transcriptFallback`
  returns `sessionId: ''` (`telemetry.ts:636`) and `floor/boot.ts:429` gates `appendCostLedger` on
  `if (sample?.sessionId)`, while the breaker inputs at `boot.ts:441` are pushed ungated. So codex spend
  reaches the circuit breaker but never reaches `cost-ledger.jsonl` — the file SCALE-03 replays and
  `taskSpend`/`budgetForAgent` read. The breaker and the per-card budget already disagree today. (3) Add
  `spawnedAt` to the registry write for duration. Collapse the four `useFleetTelemetry` mounts
  (`AgentStrip.tsx:34`, `CommandCenterPanel.tsx:370`, `FullscreenTerminal.tsx:88`,
  `ToolWaterfall.tsx:12`) into one singleton — four independent rate accumulators is the "scale" half of
  this phase.

**Phase-wide rules (binding on every plan)**

- **D-37:** ZERO new npm dependencies. `package.json` and `package-lock.json` are not touched by any
  plan in this phase. The lockfile requires npm 10, this machine has npm 11, and that mismatch has
  already caused one fully-red CI round. Every decision above was chosen to hold under this rule; all
  eight advisor tracks returned an empty `new_dependencies` list. YAML for team@1 is refused on this
  ground alone.

- **D-38:** Every repo-fact or grep-based assertion asserts a POSITIVE LOWER BOUND (`count >= 1`)
  alongside any negative, so deleting the feature fails the test instead of satisfying it. This is Phase
  2's D-40 carried forward, and it has teeth here: this phase's ground pass found four
  built-tested-rendered-nowhere features already in the tree — `log.jsonl.1` (written, gitignored, read
  by nothing), `db.ts`'s `project = ?` predicate (written and tested, zero live callers), the entire
  `'agent'` memory-scope branch (unreachable, D-14), and `capabilityLine()`. `push.ts` is a fifth: 293
  lines of RFC-vector-tested crypto with zero production consumers. Any new sender or sink lands with
  its caller in the same commit.

- **D-39:** Correct the stale anchors in the same edit that locks the order — `ROADMAP.md:281`/
  `REQUIREMENTS.md:208` (`hive.ts:267` → `:323`) and `REQUIREMENTS.md:206` (`telemetry.ts:126` →
  `:161`). The facts are right; the coordinates rotted, and `test/repo-claims.test.cjs:91` excludes
  `.planning/` so nothing catches them.

- **D-40:** "Floor" means five different things in this repo (a multiWindow window, `bootFloor`'s
  composition root, `realtimeFloorWatcher`, floor-wide MCP consent, and the Pixi office floor). Every
  plan in this phase uses "project" or "home" for the new boundary and never "floor", or reviewers will
  read it five ways.

### Claude's Discretion

Auto-mode resolved every gray area to its researched recommendation. The following are left to the
planner rather than pre-locked:

- Plan slicing and wave assignment across the five requirements — subject to the hard constraint that
  02-12 runs first (D-04) and that the two source fixes in D-36 land before SCALE-03/SCALE-05 build on
  them.
- Exact disjoint file-ownership lists per agent (the proven method on this repo; `use_worktrees: false`).
- The bucket granularity and detail-row cap for the day band (D-25) — 15 min is a reasoned default,
  explicitly not a measured one; both must be constants with a comment saying so.
- Whether the `events` sink batches inside one `db.transaction()` — decide from the synthetic driver, do
  not add a worker thread speculatively.
- The team@1 member cap (16 suggested, a safety guess rather than a measured ceiling) and whether the
  review sheet defaults duplicate-name rows unchecked.
- Whether existing installs' `command_history`/`kv` are copied forward on the first per-home open or the
  one-time loss is declared in release notes (D-09) — one of the two, never silently.
- The digest hour and whether the file/toast/Slack arms ship in one plan or three.

### Deferred Ideas (OUT OF SCOPE)

- Simultaneous side-by-side floors (per-userData launcher, per-floor port bindings for
  hookServer/slack/webhook/OTel, re-keying `requestSingleInstanceLock`). Additive on top of D-08's
  boundary, but it must first solve the `claudeAccounts` forking problem — two live projects rotating
  the same subscription account with neither pool aware of the other (D-13).
- Per-floor roster partitioning. One `RosterStore` serves the whole app and `RosterStore`'s empty-guard
  is per-process, so a second multiWindow floor can flatten the live `roster.json`. Orthogonal to memory
  isolation and still open — a plan claiming "floors are isolated" without this will be wrong for an
  unrelated reason.
- `doneAt` on `HiveTask` — needed for "tasks completed yesterday" in the digest (D-31). A ledger schema
  change with several concurrent writers; its own decision.
- Collapsing the two duplicate main-process joins (`hive:agentDirectory` and `writeFleetSnapshot`). D-36
  removes their cost disagreement but leaves them two builders of one row; they will drift again.
- Cumulative-across-respawn cost. `telemetry.forget(id)` drops the accumulator on teardown and there is
  no read API for the durable ledger, so the card's cost means "since this spawn" (D-33). A ledger-read
  IPC is future work.
- Deleting or declaring dead `usage.ts`'s `UsageProvider`/`StubUsageProvider` — zero instantiations
  anywhere; new cost work routes through `telemetry.getAgentUsage`.
- Tool spans on the timeline. `telemetry.ts` persists nothing and spans are a 200-deep in-memory ring, so
  yesterday's spans do not exist on disk. Belongs with RECORD-02.
- Bundled preset teams in `resources/teams/` — content, not mechanism, once team@1 exists (D-15).
- Per-member cwd in team@1 — v1 is one operator-picked root for the whole team.
- Wiring the `'agent'` memory scope (D-14) — ~5 lines, but it belongs with Phase 5's RECALL-02, which
  replaces the mechanism anyway.
- **Reviewed Todos (not folded):** `gsd-sdk query todo.match-phase 3` returned `todo_count: 0` — no
  todos to fold or defer.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCALE-01 | Two projects run side by side without reading each other's memory or task ledger | Pattern 1 (lazy vs. cached-connection repoint), the `PersistStore.repoint()` sketch in Code Examples, the exact `config:update` hook site, and the Runtime State Inventory section for existing-install data. Task-ledger half needs zero code (already free via `hive.root()`). |
| SCALE-02 | A team template or bulk import creates a floor without hiring agents one at a time | Pattern 2 (discriminated-format branching on `readHireManifestFile`), the `hireCommand()` extraction note, the `slimAgents()` insufficiency warning (Pitfall 4 / Anti-Patterns), and Open Question 1 (byte-cap sizing) |
| SCALE-03 | Every hive event, envelope and cost is replayable on one timeline | Pattern 3 (injected sink, never import), the `events` migration Code Example, Pattern for the day-band UI (windowing-library absence, 14px floor exemption, native range input testability), Open Question 2 (bucket aggregation boundary) |
| SCALE-04 | A daily digest reaches the operator without opening the app | Pattern 4 (`setTimeout`/`setInterval` clone + `SHUTDOWN_STEPS` registration), the `postSlackDigest` Code Example, Pitfall 2 (`deps.send` dead end) and Pitfall 3 (missing-shutdown-entry hang) |
| SCALE-05 | One agent card shows cost, duration, context, account and block state | Pattern 5 (module-singleton `useSyncExternalStore`, the `agentView.ts` template), the three verified-drifted thresholds, the 3 main-process gaps (`control:breakerSnapshot`, `getAgentUsage()` gating fix, `spawnedAt`), the 4-mount `useFleetTelemetry` collapse |
</phase_requirements>

## Summary

Phase 3 is five requirements, and this session's measurement confirms every one of 03-CONTEXT.md's 40
locked decisions holds against the live tree at this commit. There is no framework gap, no missing
library, no schema conflict — the whole phase is wiring five things that are 80-95% already built
onto seams that already exist, under the standing zero-new-dependency rule. `npm test` at this
session's start: **800 tests / 793 pass / 0 fail / 7 skipped** (23.9s). `npm run typecheck`: **0
errors** (`typecheck:node` + `typecheck:web`, both exit 0). Node `v24.13.0`, npm `11.6.2` on this
machine — npm 11 cannot regenerate `package-lock.json` (needs npm 10), so `package.json` and the
lockfile stay untouched by every plan in this phase, matching D-37.

**Primary recommendation:** Treat this phase as five independent wiring jobs, not five features to
design from scratch. SCALE-01 is a 2-call-site default-path change plus one `repoint()` method on
`PersistStore` (SCALE-01's task-ledger half needs *zero* code — `hive.root()` is already lazy).
SCALE-02 is one new discriminated-union branch inside an existing IPC handler plus one new IPC channel,
built on an already-hardened validator. SCALE-03 is migration #3 in an existing append-only array plus
a new CCTab that deliberately carries no windowing library and no small text. SCALE-04 is a clone of an
existing best-effort timer shape, routed around one known dead end (`deps.send` returns `false` with no
window). SCALE-05 is one new pure derivation module copying a pattern (`autoMode.ts`) this repo has
already proven holds, plus three main-process getters that do not exist yet.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Project (home) isolation — SCALE-01 | Main process (filesystem/DB path resolution) | — | `harnessHome` is a main-process config value; `hive.root()`, `PersistStore`, `KnowledgeManager` all resolve paths in main. Renderer has no isolation role. |
| Team template import/export — SCALE-02 | Main process (file I/O, dialog, validation) | Renderer (bulk-spawn orchestration, review UI) | Reading/writing untrusted JSON and the native save/open dialog must be main (Electron security model); the actual spawn loop is renderer-driven today (`useRestoreTeam.ts`) because `hive.spawnAgent`'s IPC payload carries no model/goal/character/accent — main-driven bulk hire would silently drop fields (D-18). |
| Event/cost timeline storage — SCALE-03 | Main process (SQLite via `PersistStore`) | Renderer (CCTab presentation) | `better-sqlite3` only loads in main (native, Electron ABI); `hive.ts` must stay Electron-free (D-24), so the sink is *injected*, never imported. |
| Timeline UI — SCALE-03 | Renderer (CCTab) | Main (new `hive:timeline`/`hive:timelineBucket` IPC) | Presentation and the native `<input type="range">` scrubber are renderer-only; bucket aggregation could go either side — recommend main, since it can join `events` + `cost-ledger.jsonl` in one read without shipping raw rows over IPC. |
| Daily digest — SCALE-04 | Main process (timer, file write, notify, Slack POST) | — | All three delivery rails (`writeFileSync`, `deps.notify`, `node:https` POST) are main-only; a renderer-owned timer dies with the window, which is exactly the D-32 limitation this phase must state rather than hide. |
| Consolidated agent card — SCALE-05 | Renderer (pure derivation + presentation) | Main (3 new getters: breaker snapshot, gated usage, spawnedAt) | The derivation itself must be React-free/pure (autoMode.ts precedent); the three data gaps (breaker is push-only, codex spend ungated to the ledger, no spawn timestamp) can only be closed in main, where the data lives. |

## Package Legitimacy Audit

**Zero new npm dependencies in this phase.** Verified: `git status --short` shows only
`.planning/config.json` modified in this worktree; no `package.json`/`package-lock.json` edits are
proposed by any of the 40 locked decisions, and D-37 states all eight of the discussion's advisor
tracks returned an empty `new_dependencies` list. `npm -v` on this machine is **11.6.2**;
`package-lock.json`'s lockfile format requires npm 10 — any accidental `npm install` here would
regenerate the lockfile in the wrong format and re-trigger the fully-red CI round D-37 references.

No `slopcheck`/registry verification was run because there is nothing to verify — every mechanism
below (`better-sqlite3` migrations, `node:https`, `node:crypto`, `dialog`, `<input type="range">`,
`useSyncExternalStore`) is either Node/Electron/DOM builtin or an already-installed, already-imported
package (`better-sqlite3` `^11.10.0`, resolved `11.10.0`, confirmed via `src/main/db.ts:19`
`import Database from 'better-sqlite3'` — already a production dependency, not new).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none)* | — | — | — | — | — | N/A — zero new packages this phase |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

## Standard Stack

No new libraries. The "stack" for this phase is entirely internal seams, verified present at these
exact locations this session:

### Core (existing, reused)
| Module | Location | Purpose in this phase | Why it's the standard here |
|--------|----------|------------------------|------------------------------|
| `better-sqlite3` 11.10.0 | `src/main/db.ts:19` | SCALE-03's `events` table lands as `MIGRATIONS[2]` in the array at `db.ts:61-107` | Already open, already WAL-mode, already has the append-only migration contract this project enforces (D-20) |
| `node:https` | `src/main/slack.ts` (raw `httpsRequest`) | SCALE-04's `postSlackDigest` sibling function | `postSlackReply` (`slack.ts:373-411`) is the exact zero-SDK pattern to clone — no `@slack/*` dep exists or is needed |
| `node:fs` (`writeFileSync`) | `src/main/floor/boot.ts:470` `writeFleetSnapshot` | SCALE-04's `digest-YYYY-MM-DD.md` writer | Best-effort, never-throws-from-a-timer shape already proven at 8s cadence |
| DOM `<input type="range">` | none yet — genuinely new UI | SCALE-03's bucket scrubber | Zero hits for `type="range"` anywhere in `src/renderer/src` today — this is new markup, not a new dependency |
| `useSyncExternalStore` (React 18 builtin) | `src/renderer/src/store/autoMode.ts:155` + 4 `.tsx` consumers | SCALE-05's `agentView.ts` singleton | Already the established module-singleton pattern for exactly this kind of "one derivation, many renderings" problem |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `<input type="range">` scrubber | A hand-rolled drag playhead div | Rejected (D-25): a native range renders `min`/`max`/`step`/`aria-valuetext` into static markup and is therefore assertable under `renderToStaticMarkup` (the project's only renderer test ceiling, `test/renderer-components.test.cjs`); a hand-rolled drag target has no first-paint state to assert and needs pointer events, which that harness structurally cannot fire. |
| A new virtualized list library for the timeline | `react-window` / `virtuoso` / TanStack virtual | Rejected (D-25): zero hits for any of the three in `src/` or `package.json`, and the lockfile-freeze rule (D-37) forbids adding one. Not needed anyway — a 96-column density band and a one-bucket-deep detail list are both bounded by construction. |
| Pixi.js for the timeline surface | A second `new Application()` | Rejected (D-28): Chromium evicts the OLDEST of ~16 WebGL contexts silently (`src/renderer/src/scene/office/glRecovery.ts:9-18`); the office floor's context is created at startup and is always first-evicted. A second Pixi canvas competes for the same budget with the same failure mode (blank canvas, no error). |
| `PersistStore` importable directly into `hive.ts` | A constructor-injected sink | Rejected (D-24): `hive.ts` has **zero** `from 'electron'` imports (`grep -n "from 'electron'" src/main/hive.ts` returns nothing, confirmed this session) and `db.ts` imports `app` from `electron` — a direct import would make `hive.ts` untestable under plain `node --test`. |

**Installation:** none — no `npm install` for this phase.

## Architecture Patterns

### System Architecture Diagram — where each requirement's data actually flows

```text
SCALE-01 (isolation)                    SCALE-03 (replay)
┌─────────────┐                         ┌──────────────────────┐
│ readConfig()│──harnessHome────┐       │ hive.appendLog()      │──kind:'message'──┐
│ .harnessHome│                 │       │ (hive.ts:2485, single │                   │
└─────────────┘                 │       │  funnel, 24 sites)    │                   ▼
       │                        ▼       └───────────┬──────────┘        ┌──────────────────┐
       │              ┌──────────────────┐          │ injected sink     │ events (SQLite,   │
       │   (already)  │ hive.root()      │          ▼ (NEW, D-20/D-24)  │ PersistStore,     │
       │   lazy       │ = join(home,     │  ┌─────────────────┐        │ MIGRATIONS[2])    │
       │              │  'hive')         │  │ appendCostLedger│───────▶│ floor_id, ts, kind,│
       │              └──────────────────┘  │ (hive.ts:2527)  │        │ agent_id, task_id, │
       │                                    └─────────────────┘        │ session_id, payload│
       ▼ (NEW default-path change)                                     └─────────┬─────────┘
┌──────────────────┐   ┌──────────────────┐                                      │
│ PersistStore      │   │ KnowledgeManager  │                          new IPC:  ▼
│ db.ts:121          │   │ .root() (already  │                    hive:timeline / hive:timelineBucket
│ (needs repoint())  │   │ lazy — knowledge  │                                      │
│ 2 live handles:    │   │ .ts:68-71)        │                                      ▼
│ boot.ts:1148,      │   │ 0 code changes    │                          CCTab 'timeline' (day band +
│ config.ts:684      │   │ needed beyond the │                          <input type="range"> scrubber +
└──────────────────┘   │ default-path swap │                          merged detail list)
                        └──────────────────┘

SCALE-02 (bulk hire)                              SCALE-04 (digest)                    SCALE-05 (one card)
┌────────────────┐                                ┌───────────────────┐               ┌──────────────────────┐
│ hire:openFile   │  spec:'hello-markx/hire@1'     │ new wall-clock     │               │ 4x useFleetTelemetry  │
│ (index.ts:1545) │──────────▶ existing path        │ timer, PersistStore│               │ mounts → 1 singleton  │
│                 │  spec:'hello-markx/team@1'     │ KV last-sent date  │               │ (agentView.ts pattern,│
│                 │──────────▶ NEW branch inside    │ (clone of          │               │  D-33)                │
└────────┬────────┘  readHireManifestFile           │ syncContextTriggers│               └───────────┬──────────┘
         │           (main/hire.ts:243)              │ boot.ts:669-688)  │                           │
         ▼                                           └─────────┬─────────┘             3 new main getters:
AddAgentModal.tsx:323 importHire() branches                     │ never routes through   control:breakerSnapshot,
  on res.team vs res.manifest → NEW review UI                   │ deps.send (D-30)       getAgentUsage() gate fix,
         │                                                      ▼                       spawnedAt on registry
         ▼                                          ┌──────────────────────┐                       │
extracted bulk-spawn loop (useRestoreTeam.ts:92-205  │ 1. digest-YYYY-MM-DD │                       ▼
 pattern: Promise.all + roster-order re-assembly)    │    .md (writeFileSync)│           AgentDetailPanel,
         │                                           │ 2. deps.notify()      │           AgentCard, AgentStrip,
         ▼                                           │ 3. postSlackDigest()  │           FullscreenTerminal,
window.cth.spawnPty() x N (existing channel)         │    (slack.ts sibling) │           CommandCenterPanel
                                                      └──────────────────────┘
```

### Recommended Project Structure (files touched, none new except where noted)

```
src/main/
├── db.ts                    # SCALE-01: default path off harnessHome + repoint(); SCALE-03: MIGRATIONS[2]
├── knowledge.ts              # SCALE-01: default path off harnessHome (root() already lazy, no repoint needed)
├── hive.ts                   # SCALE-03: constructor-injected events sink (no PersistStore import, D-24)
├── hire.ts                   # SCALE-02: readHireManifestFile() branches on parsed.spec
├── slack.ts                  # SCALE-04: NEW sibling postSlackDigest() beside postSlackReply
├── floor/
│   ├── boot.ts                # SCALE-01: persist = new PersistStore() repoint hook site; SCALE-03: sink wiring;
│   │                           # SCALE-04: new timer (clone syncContextTriggers shape) + SHUTDOWN_STEPS entry;
│   │                           # SCALE-05: control:breakerSnapshot handler, getAgentUsage() gate fix, spawnedAt
│   └── deps.ts                 # (read-only reference: notify/send contracts, no changes)
├── config.ts                  # SCALE-01: 2nd PersistStore handle (firedStore(), :684) repoint; new dailyDigest/
│                               # slackDigestChannelId config fields
├── index.ts                   # SCALE-01: repoint hook at the null→set config:update transition (~:2709-2712);
│                               # SCALE-02: NEW ipcMain.handle('team:export', ...); SCALE-05: control:breakerSnapshot
├── roster.ts                  # SCALE-02: RosterStore.read() is team:export's data source (already main-owned)
└── db.ts's kv                 # SCALE-04: last-sent-date KV key (same pattern as CONTEXT_LAST_RUN_KV_KEY)

src/shared/
└── hire.ts                    # SCALE-02: NEW HIRE_TEAM_SPEC_V1 const + TeamManifest type + per-member validation
                                 # delegating to the EXISTING validateHireManifest (no reimplementation)

src/renderer/src/
├── store/
│   ├── autoMode.ts             # (pattern reference only, unmodified)
│   └── agentView.ts            # SCALE-05: NEW — pure, React-free, module-singleton + useSyncExternalStore
├── hooks/
│   ├── useRestoreTeam.ts       # SCALE-02: bulk-spawn loop (92-205) extracted to a shared function
│   └── useTelemetry.ts         # SCALE-05: useFleetTelemetry's 4 independent accumulators collapse to 1
└── components/
    ├── AddAgentModal.tsx       # SCALE-02: importHire() (~:321-325) branches on team result; hireCommand()
    │                            # (~:156-159) extracted so the bulk path builds commands identically
    ├── CommandCenterPanel.tsx  # SCALE-03: new 'timeline' CCTab entry in the TABS array (~:79-90)
    ├── AgentDetailPanel.tsx    # SCALE-05: the consolidated 5-field card lands here
    ├── AgentCard.tsx           # SCALE-05: reads agentView.ts instead of re-deriving progress/cost locally
    ├── FullscreenTerminal.tsx  # SCALE-05: reads agentView.ts instead of its own 85/65 threshold (:533)
    └── CommandCenterPanel.tsx  # SCALE-05: reads agentView.ts instead of its own 88/75 threshold (:853)
```

### Pattern 1: Lazy path resolution vs. cached-connection repoint (SCALE-01's real distinction)

**What:** Two different fixes are needed for two different kinds of "escaped" state, and conflating
them wastes effort.

- `KnowledgeManager.root()` (`src/main/knowledge.ts:68-71`) computes its path **fresh on every call**
  — there is no cached connection, no `open()`/`close()` lifecycle. Once the fallback branch reads
  `harnessHome` instead of `userData` unconditionally, `KnowledgeManager` "repoints for free" on the
  very next call — exactly the same free-by-construction property `hive.root()` already has (D-08,
  D-11). **No repoint plumbing is needed for `KnowledgeManager`.**
- `PersistStore` (`src/main/db.ts:112-121`) resolves its path **once**, inside `open()`, and `open()`
  short-circuits (`if (this.db) return;`) on every call after the first. Changing only the default-path
  expression is not sufficient — a `repoint()` method must exist that closes the cached `this.db`
  handle and reopens against the freshly-resolved path. `close()` already exists (`db.ts`, checkpoints
  WAL) and is safe to call twice.

**When to use which:** Any per-call path resolver (`root()`-shaped) needs only the default-path
expression changed. Any cached-connection resource (`open()`/`this.db`-shaped) needs both the
default-path expression AND an explicit repoint call site.

**Where the repoint call site is, precisely:** `src/main/index.ts`'s `config:update` handler
(`ipcMain.handle('config:update', ...)`, handler body starts ~line 2692) contains the ONLY
non-relaunching `harnessHome: null → set` transition, gated at:
```typescript
// src/main/index.ts, inside ipcMain.handle('config:update', ...) — verified this session
const hiveWasEnabled = hive.enabled();
const next = writeConfig(patch);
if (typeof patch?.telemetryEnabled === 'boolean') analytics.setEnabled(patch.telemetryEnabled);
if (!hiveWasEnabled && hive.enabled()) {
  console.log('[hive] harnessHome configured — bootstrapping hive services');
  try { startHiveServices(); } catch (e) { console.error('[hive] bootstrap after onboarding:', e); }
}
```
This is where `persist.repoint()` (and the second handle's repoint, `config.ts:684`'s `firedStore()`
closure) belong — inside the same `if (!hiveWasEnabled && hive.enabled())` block, alongside
`startHiveServices()`.

**Why `config:changeHome` (`index.ts:2729`) and `app:resetAll` (`index.ts:3398`) need NO explicit
repoint call:** both paths end in `app.relaunch(); app.exit(0)` — verified this session (`changeHome`
at the line following its copy-list loop; `resetAll` at the line following `roster.archive()`). A
process relaunch destroys and reconstructs every module-level variable, including `persist`
(`floor/boot.ts:1148`, `let persist: PersistStore` reassigned on the next `bootFloor()` call) and the
second handle's memoized `firedDb` (`config.ts`, module-level `let firedDb`). By the time the new
process's `bootFloor()` runs, `writeConfig({ harnessHome: newHome })` has already landed on disk (both
paths write it before relaunching), so a home-aware default-path expression resolves correctly with
zero extra code on this path. **Only the first-run (onboarding) transition, which does not relaunch,
needs the explicit `repoint()` call.**

**Verified production call sites (exactly 2, matching D-09's "~6 call sites" estimate on the low end —
2 production + 1 test override):**
```
src/main/floor/boot.ts:1148:  persist = new PersistStore();
src/main/config.ts:684:       const s = new PersistStore();
test/db-fts.test.cjs:78:      const store = new PersistStore(dbPath);   # test override seam, unaffected
```

### Pattern 2: Discriminated-format branching on an existing IPC handler (SCALE-02)

**What:** `main/hire.ts:243`'s `readHireManifestFile(path)` currently does:
```typescript
export function readHireManifestFile(path: string): HireResult {
  try {
    if (statSync(path).size > HIRE_MAX_BYTES) return { ok: false, error: 'manifest too large' };
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return finish(validateHireManifest(parsed));   // <-- validateHireManifest rejects any spec !== HIRE_SPEC_V1
  } catch (e) { return { ok: false, error: `could not read manifest: ${String(e)}` }; }
}
```
`validateHireManifest` (`src/shared/hire.ts`) hard-rejects on `o.spec !== HIRE_SPEC_V1` before any
other field is even read. **This means a team@1 file fails validation today with "unsupported spec"
— the branch point must happen BEFORE `validateHireManifest` is called, on the raw parsed JSON's
`spec` field**, not inside the validator.

**When to use this pattern:** Any time an existing, hardened, single-purpose validator needs to accept
a second document shape that is structurally a *collection* of the first shape. Do not widen
`validateHireManifest` itself to accept both — that reintroduces the exact "one validator does two
things" ambiguity the spec-tag check exists to prevent. Instead, peek at `raw.spec` in
`readHireManifestFile`, and delegate each member of a team@1 file's `members` array back through the
UNMODIFIED `validateHireManifest` one at a time (each member IS still spec `hello-markx/hire@1` — a
team file is a `{ spec: 'hello-markx/team@1', members: HireManifest[] }` wrapper, so per-member
`FLAG_RE`/`MODEL_RE`/`SAFE_FLAG_NAMES` protection is inherited for free, with zero duplicated security
logic).

**Byte-cap consideration for the planner:** `HIRE_MAX_BYTES = 64 * 1024` (`src/shared/hire.ts:94`) is
shared today by both the deep-link fetcher and the file importer. A single `HireManifest` at
worst-case field lengths (`goal` alone is capped at 4000 chars, `description` 200, `commandFlags` up to
16 entries × 100 chars) can approach several KB; **16 members at worst-case size could exceed 64KB.**
Real-world team files will be far smaller (goals are rarely maximal), but the planner should either (a)
raise the byte cap specifically for `team@1` documents to a separate, still-hard constant (e.g. 256KB —
still a trivial read, still DoS-bounded), or (b) accept 64KB as a soft real-world limit and let
oversized files fail loudly with the existing "manifest too large" message. **This is a genuine sizing
question CONTEXT.md does not resolve** — flagged in Open Questions below.

**Where the renderer branches:** `src/renderer/src/components/AddAgentModal.tsx`'s `importHire()`
(around line 321-325) currently does:
```typescript
const importHire = async () => {
  setError(undefined);
  const res = await window.cth.importHireFile();
  if (res.ok && res.manifest) applyManifest(res.manifest);   // single-agent form prefill
  else if (res.error && res.error !== 'cancelled') setError(res.error);
};
```
A team result needs a THIRD branch here (`res.ok && res.team`) that does NOT call `applyManifest`
(which prefills the single-agent form) — it must open a new review surface instead. This is a new UI
component/modal, not an extension of the existing single-hire form.

**`hireCommand()` needs extraction, not duplication:** `AddAgentModal.tsx:156-159`'s `hireCommand(m)`
closure (provider inference + `buildSpawnCommand` + flag-join) is the exact logic a bulk-spawn-from-team
path needs per member, but it currently closes over the component's local `config` prop and is not
exported. Extract it to a shared location (`src/shared/hire.ts` is the natural home, since it is already
main+renderer-shared and dependency-free) so both the single-hire path and the new bulk path build
identical commands — reimplementing it in a second place is exactly the drift class D-18 warns against.

### Pattern 3: Injected sink, never an import (SCALE-03)

**What:** `hive.ts` already demonstrates the pattern the events sink must follow. Its constructor:
```typescript
// src/main/hive.ts:483-486 — verified this session
constructor(
  private getHome: () => string | null,
  private emit?: (channel: string, payload: unknown) => boolean | void,
  private handoff?: (order: TerminalWorkOrder) => boolean
) {}
```
and its committer is composed with an injected `log` callback:
```typescript
// src/main/hive.ts:495-499
private committer = new GitCommitter({
  root: () => this.root(),
  log: (event) => this.appendLog(event),
  redactSecrets: (text) => redactSecrets(text)
});
```
The events sink for SCALE-03 is a **fourth constructor parameter** (or a setter, matching how
`boot.ts:1146`'s `hookServer` already injects `(s) => telemetry.recordCostSample(s)` into a
constructed object) — never a `import { PersistStore } from './db'` inside `hive.ts`. `appendLog`
(`hive.ts:2485`) and `appendCostLedger` (`hive.ts:2527`) are the two call sites that need to ALSO
call the injected sink, keeping `log.jsonl`/`cost-ledger.jsonl` as the two on-disk sinks and `events`
as the third, SQL-queryable one — "one funnel, [now three] sinks, not [three] sources of truth" per
D-20.

**When to use this pattern:** Any time a module that must stay `node --test`-loadable without a real
Electron binary needs to reach a resource (SQLite, `app.getPath`, `Notification`) that only exists
inside Electron. `hive.ts` has **zero** `from 'electron'` imports today (`grep -n "from 'electron'"
src/main/hive.ts` returns nothing, confirmed this session) — this property is load-bearing for the
whole `node --test`/`test/load-ts.cjs` strategy and must not regress.

### Pattern 4: `setTimeout(remaining)` then `setInterval`, registered for teardown (SCALE-04)

**What:** `syncContextTriggers` (`src/main/floor/boot.ts:669-688`) is the exact shape to clone:
```typescript
// src/main/floor/boot.ts — verified this session, full function
function syncContextTriggers(): void {
  clearContextTimers();
  for (const action of ['compact', 'clear'] as const) {
    const rule = contextRule(action);
    if (!rule.enabled || !(rule.everyMs > 0)) continue;
    const fire = (): void => {
      try { stampContextRun(action); emitContextTrigger(action, contextRule(action)); }
      catch (e) { console.error('[triggers] context', action, e); }
    };
    const remaining = Math.max(0, rule.everyMs - (Date.now() - contextLastRunAt(action)));
    const entry: MissionTimer = {};
    entry.timeout = setTimeout(() => { fire(); entry.interval = setInterval(fire, rule.everyMs); }, remaining);
    contextTimers.set(action, entry);
  }
}
```
`contextLastRunAt`/`stampContextRun` read/write a `PersistStore` KV key (`CONTEXT_LAST_RUN_KV_KEY =
'triggers.context.lastRun'`, `boot.ts:178`) — this is the exact "last-sent LOCAL DATE STRING in a
PersistStore KV" shape D-30 specifies for the digest, via `persist.getKv<T>(key)`/`persist.setKv(key,
value)` (`db.ts:172`, `db.ts:180`).

**The one thing to copy the SHAPE of, not the DELIVERY of:** `emitContextTrigger` (`boot.ts:661-666`)
routes through `deps.send('trigger:context', ...)`, and `FloorDeps.send` (`src/main/floor/deps.ts:65`)
is documented to **return `false` with no window attached** — never throwing, but also never
delivering. A digest timer that reused `deps.send` for its payload would pass every test that runs with
a fake window while silently delivering nothing in exactly the unattended/headless scenario SCALE-04
exists for (D-30's core warning). The digest's three delivery rails (file write, `deps.notify`,
`postSlackDigest`) are all chosen specifically because none of them route through `deps.send`.

**Extract the pure clock function for testability, matching D-30's own instruction:**
`msUntilNextLocalHour(hour: number, now: number): number` should be a standalone exported pure
function (no closures over `Date.now()`), so `node --test` can drive before/after/exactly-at/next-day/
DST-transition cases against an injected fixed clock — the same testability discipline
`test/delivery-main.test.cjs`'s fake-clock harness already uses for `DeliveryService`.

**Registration is not optional — it changes a test's failure mode:** `SHUTDOWN_STEPS`
(`boot.ts:928-960`) is a flat array of `{ name, stop }` — the digest timer's `clearTimeout`/
`clearInterval` needs its OWN entry here, following the `clearAlwaysOnBeats` precedent (`boot.ts:936-
941`) which was added specifically because two uncleared `setInterval`s kept the process alive after
shutdown, and `test/boot-floor.test.cjs`'s `'every subsystem bootFloor started appears in the shutdown
list (#34 coverage)'` test (line 227) fails by **hanging** rather than by a red assertion when an entry
is missed — this reads as flaky CI, not a bug, unless caught early.

### Pattern 5: Module-singleton pure derivation, `useSyncExternalStore` (SCALE-05)

**What:** `src/renderer/src/store/autoMode.ts` (188 lines) is the exact template. Its shape:
1. Pure functions with zero React/store/`@/` imports (`isAutoModeAgent`, `hasBypassFlag`) — loadable
   via `test/load-ts.cjs` under plain `node --test` (confirmed: `test/renderer-runstate.test.cjs:19`
   does `loadTs('src/renderer/src/store/autoMode.ts')`).
2. A module-level mutable singleton + listener set, published from exactly ONE place:
   ```typescript
   // autoMode.ts:139-155 — verified this session
   let liveToggle = false;
   const listeners = new Set<() => void>();
   export function getLiveAutoMode(): boolean { return liveToggle; }
   export function setLiveAutoMode(on: boolean): void {
     if (on === liveToggle) return;
     liveToggle = on;
     for (const l of [...listeners]) l();
   }
   export function subscribeLiveAutoMode(listener: () => void): () => void {
     listeners.add(listener); return () => { listeners.delete(listener); };
   }
   ```
3. Consumed identically in all 3 renderings via `useSyncExternalStore` — verified 3 real call sites
   this session: `AgentCard.tsx:231`, `CommandCenterPanel.tsx:425`, `FullscreenTerminal.tsx:597`, all
   `useSyncExternalStore(subscribeLiveAutoMode, getLiveAutoMode, getLiveAutoMode)`.
4. Published from exactly one place: `App.tsx:288`, `useEffect(() => { setLiveAutoMode(!!config?.
   autoMode); }, [config?.autoMode]);`.

`agentView.ts` should follow this shape exactly for the cost/context/duration/account/block-state
derivation. The three thresholds that have already drifted (measured this session, exact matches to
CONTEXT.md's claim):
```
src/renderer/src/components/FullscreenTerminal.tsx:533:
  const color = pct >= 85 ? 'var(--cth-coral)' : pct >= 65 ? 'var(--cth-lemon)' : ...
src/renderer/src/components/CommandCenterPanel.tsx:853:
  const ccolor = cpct >= 88 ? 'var(--cth-coral)' : cpct >= 75 ? 'var(--cth-lemon)' : ...
src/renderer/src/components/AgentCard.tsx:164-166:
  const pct = Math.min(8, Math.max(0, progress)) / 8 * 100;
  const gaugeColor = progress >= 7 ? 'var(--cth-coral)' : progress >= 6 ? 'var(--cth-lemon)' : ...
```
All three must collapse to calling `agentView.ts`'s one context-pressure derivation.

**The 4 independent telemetry accumulators to collapse (D-36's "scale" half):** `useFleetTelemetry`
(`src/renderer/src/hooks/useTelemetry.ts:91`) is a plain hook — each mount runs its OWN `useEffect`,
OWN `rates.current` ref, OWN `telemetrySnapshot()` backfill call, and OWN `onTelemetryEvent`/
`onBreakerState` IPC subscription. Verified 4 real mounts this session:
```
src/renderer/src/components/AgentStrip.tsx:34
src/renderer/src/components/CommandCenterPanel.tsx:370
src/renderer/src/components/FullscreenTerminal.tsx:88
src/renderer/src/components/ToolWaterfall.tsx:12
```
Collapsing to one singleton (same autoMode.ts pattern: one subscription, one accumulator, N readers
via `useSyncExternalStore`) removes 3 of 4 redundant IPC listener registrations and 3 of 4 redundant
`telemetrySnapshot()` cold-start calls.

### Anti-Patterns to Avoid
- **Widening `validateHireManifest` to accept both hire@1 and team@1 shapes in one function.** Branch
  BEFORE the validator on the raw `spec` field; delegate to the unmodified validator per member.
- **Reusing `slimAgents()` (`store.ts:444`) as team@1's export stripper.** `slimAgents` only drops 6
  ephemeral UI fields (`recentAssistantText`, `recentTextTs`, `blockReason`, `contextTokens`,
  `contextLimit`, `seedPrompt`) — the resulting `PersistedAgent` STILL carries `cwd`, `account`,
  `accountPolicy`, `worktreePath`, `ptyId`, the raw `command` and `commandFlags`. D-16 requires ALL
  seven of those additionally stripped for export. Verified: `type PersistedAgent = Omit<Agent,
  'recentAssistantText' | 'recentTextTs' | 'blockReason' | 'contextTokens' | 'contextLimit' |
  'seedPrompt'>` (`store.ts:334`) — none of D-16's seven fields are in that omit list. Team@1's
  exporter needs its OWN, additional stripper function, not a reuse of `slimAgents`.
- **Reading `deps.send` result and treating `false` as "delivered, but nobody was listening."** It
  means "no window at all" — for the digest, this is the expected common case (headless), and treating
  it as a soft failure rather than routing around it defeats the whole feature.
- **A card sourcing breaker state only from `onBreakerState`'s push.** On every window reload the card
  reads no state until the next ~30s breaker beat, showing "healthy" for a potentially-stopped agent —
  fails safe in the WRONG direction (D-36). A `control:breakerSnapshot` pull-on-mount is required
  alongside the existing push.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cumulative→incremental cost diffing | A new diff algorithm for the `events`/timeline cost lane | `applyCostRow` (`hive.ts:2608-2632`) — the exact clamped-consecutive-diff-by-`(agent_id, session_id)` logic, already correct per ADR-0005 | Ledger rows are cumulative snapshots; summing over-counts quadratically (this was FLOOR-10's own historical bug, RECORD-03/04). A second, independently-written diff for the timeline is a second chance to reintroduce the same defect. |
| Bounded tail reads over an append-only file | A new "read the last N bytes" helper for any new file | `tailLines(path, maxBytes)` (`hive.ts:2453-2467`) — already shared by `logTail` and (formerly) `taskSpend` | Handles the "a window that starts mid-file starts mid-record" edge case correctly (drops the leading fragment) — a naive re-implementation would re-introduce that bug. |
| Windowing a long list in the renderer | A hand-rolled virtualization scheme | Don't — keep both lists structurally bounded (96-column band, one-bucket-deep detail list) | No windowing library exists in this lockfile and none may be added (D-37); a hand-rolled version is exactly the "deceptively complex problem" this row exists to name. |
| Per-manifest field validation for team members | A second, parallel set of length/regex checks for team@1 members | `validateHireManifest` (`src/shared/hire.ts`), called once per member, unmodified | It already has three rounds of red-team-hardened flag-allowlisting (`SAFE_FLAG_NAMES`), SSRF-safe URL checks, and byte caps. A parallel implementation is a second surface to keep in sync and a second place a future flag-allowlist gap can slip through. |
| A daily-digest scheduler | A bespoke cron-like abstraction | Clone `syncContextTriggers`'s `setTimeout(remaining)` → `setInterval` shape (`boot.ts:669-688`), with its own `MissionTimer`-shaped entry and its own `SHUTDOWN_STEPS` registration | This shape already correctly handles "arm on boot, catch up if the process was asleep past the fire time" — re-deriving it risks losing the catch-up semantics D-30 explicitly requires (a slept/restarted machine must still deliver). |

**Key insight:** every "hard part" of this phase (cumulative-cost diffing, bounded tail reads, a
catch-up-safe wall-clock timer, an untrusted-manifest validator) was already built and hardened for a
DIFFERENT feature earlier in this codebase. The actual net-new logic in this phase is small: one SQL
table, one JSON wrapper format, one derivation module, one native range input, and the wiring between
them.

## Runtime State Inventory

> This phase is not a rename/refactor, but SCALE-01 relocates two DEFAULT storage paths
> (`harness.db`, `KG_ROOT`) that existing installs may already have data under. The same "what still
> points at the old location after the code changes" discipline applies, so this section is included.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (SQLite) | `harness.db` under `app.getPath('userData')` today holds `kv` (window bounds, `missionLastFiredAt`, `triggers.context.lastRun`, held OAuth tokens), `command_history`, and `memory_fts` (FTS5 index) — verified via `MIGRATIONS[0]`/`MIGRATIONS[1]` at `db.ts:63-77` and `db.ts:96-104`. On this developer machine specifically: **not measured — this session's dev `userData` path was not inspected for existing row counts; MEASUREMENT UNAVAILABLE for "how much data would move".** For any real install with `harnessHome` already set, switching the default path leaves this data stranded at the OLD `userData/harness.db` location the moment the code ships. | **Decision required, not a code default** (this is explicitly listed under CONTEXT.md's "Claude's Discretion" — D-09's discretion item): either (a) copy `command_history`/`kv` rows forward into the new per-home DB on the FIRST post-upgrade open (one-time, since there is exactly one home before this phase — no "which home" ambiguity yet), or (b) declare the one-time loss in release notes. **Never silently drop it with no user-visible statement either way.** |
| Stored data (knowledge graph) | `KG_ROOT` under `userData/knowledge` — verified `knowledge.ts:71`. `KnowledgeManager.active()` gates on `config.knowledgeGraph?.enabled === true`, default `false` (`config.ts:526`), so most installs have nothing here. Installs with it enabled have ingested documents that would similarly be stranded at the old path. | Same decision as above applies; likely lower-stakes given the feature defaults off, but the plan should state the same policy for both stores rather than two different answers for two sibling "escaped stores." |
| Live service config | None found. Slack/webhook/tunnel config lives in `config.json`/`integration-secrets.json`, both already under `harnessHome`-independent `userData`-adjacent locations unaffected by this phase (unchanged by SCALE-01). | None. |
| OS-registered state | None found. No Task Scheduler/launchd/systemd/pm2 registration touches `harness.db` or `KG_ROOT` paths by name. | None. |
| Secrets / env vars | None found. Neither `harness.db` nor `KG_ROOT` names appear in any secret key or env var name (`integration-secrets.json`'s keys are Slack/webhook/BYOK tokens, unrelated). `KG_ROOT` IS injected as an env var into every spawned agent's process (`knowledge.ts:92`, `env(): ... KG_ROOT: this.root()`) — this is a LIVE consumer, not a stored secret: once the default-path fallback changes, every NEWLY spawned agent picks up the new `KG_ROOT` value automatically (no migration needed, since it's read fresh at spawn time), but an agent that was ALREADY spawned before the config change keeps the OLD `KG_ROOT` in its process env until respawned. | Document as a known limitation for a running session mid-upgrade — not a code defect, since `env()` is inherently spawn-time-only already (true today regardless of this phase). |
| Build artifacts | None found. This phase makes no build/packaging changes. | None. |

**Nothing found in category "OS-registered state," "Live service config," "Secrets/env vars"
(structural), and "Build artifacts"** — verified by grep against `harness.db`/`KG_ROOT`/`userData`
naming across `src/main/*.ts`, `.github/workflows/*.yml`, and `electron-builder.yml` this session; no
hits outside the files already cited above.

## Common Pitfalls

### Pitfall 1: Treating `PersistStore`'s `open()` idempotency as free repointability
**What goes wrong:** Changing only the default-path expression (`app.getPath('userData')` →
`harnessHome ?? userData`) and assuming the fix is complete. `open()`'s `if (this.db) return;` guard
means a `PersistStore` constructed BEFORE `harnessHome` was set stays bound to its first-resolved path
forever, even after `harnessHome` changes.
**Why it happens:** `KnowledgeManager.root()` (the sibling "escaped store") genuinely IS free by
construction, so it is easy to assume the pattern generalizes.
**How to avoid:** Add an explicit `repoint()` method that calls `close()` then re-derives and re-opens.
Call it ONLY at the one non-relaunching transition (`config:update`'s `!hiveWasEnabled &&
hive.enabled()` branch, `index.ts` ~2709-2712).
**Warning signs:** A test that constructs `PersistStore()` before writing `harnessHome`, then writes
config, then expects the DB to be under the new home — passes with a stale path unless `repoint()` is
actually wired in, and the test would need to assert the FILE location on disk, not just that `open()`
didn't throw.

### Pitfall 2: `deps.send` silently eating the digest in the headless case
**What goes wrong:** Routing the digest's delivery through `deps.send('trigger:...', payload)` because
it's the pattern nearby scheduler code (`emitContextTrigger`) already uses. `deps.send` returns `false`
with no window (`floor/deps.ts` documented contract) — a headless-started floor (the exact scenario
D-32 names as the ONLY case where "digest reaches the operator with the app closed" is even true) would
silently produce nothing, while every test using a fake `window` in `test/boot-floor.test.cjs`'s harness
would report success.
**Why it happens:** Copy-pasting the nearest existing scheduler's delivery call along with its timer
shape, without noticing the delivery half is a different concern.
**How to avoid:** Digest delivery is file write + `deps.notify` + `postSlackDigest` — NONE of the three
touch `deps.send`.
**Warning signs:** A digest test that passes with a fake window that has no listeners attached is not
proof of headless delivery; assert on the file write and on the (fake) Slack POST body instead.

### Pitfall 3: A missing `SHUTDOWN_STEPS` entry reads as flaky CI, not a red assertion
**What goes wrong:** Adding the digest's `setTimeout`/`setInterval` without a matching
`SHUTDOWN_STEPS` entry. `test/boot-floor.test.cjs:227`'s coverage test (`'every subsystem bootFloor
started appears in the shutdown list'`) is designed to catch this, but the FAILURE MODE for an
uncleared timer is the test process **hanging** (Node keeps the event loop alive), not a clean
assertion failure — this reads as CI flakiness on a first pass, costing debugging time.
**Why it happens:** `SHUTDOWN_STEPS` (`boot.ts:928-960`) is a flat, easy-to-forget array; the pattern is
declarative but nothing enforces "every `setInterval` call site has a matching entry" at the type level.
**How to avoid:** Add the `SHUTDOWN_STEPS` entry in the SAME COMMIT as the timer, following the
`clearAlwaysOnBeats` precedent (`boot.ts:936-941`) which exists for exactly this class of bug (#34).
**Warning signs:** `npm test` runs noticeably slower or appears to stall specifically on
`test/boot-floor.test.cjs` after adding a new timer.

### Pitfall 4: Reusing `slimAgents()` and assuming it's sufficient for team@1 export
**What goes wrong:** `slimAgents()` (`store.ts:444`) is the obvious-looking existing stripper, but it
only drops 6 EPHEMERAL UI fields, not the 7 SECURITY/PORTABILITY fields (`cwd`, `account`,
`accountPolicy`, `worktreePath`, `ptyId`, raw `command`, `commandFlags`) D-16 requires stripped. Using
it alone would leak an operator's absolute filesystem paths and possibly an account identifier into a
file explicitly designed to be shared.
**Why it happens:** The name suggests "the stripper for export," and it's the only stripper currently
in the file.
**How to avoid:** Write a SEPARATE, additional mapping function for team@1 export that goes from
`PersistedAgent` (or the raw `Agent`/`RosterSnapshot` entry) to the public `HireManifest`-shaped fields
only — never attempt to recover `commandFlags` by diffing the live `command` against
`buildSpawnCommand` (D-16's explicit warning: that diff is exactly how a binary path smuggles back in).
**Warning signs:** An exported team@1 file containing an absolute path, a Claude account id, or a raw
executable path string anywhere in its JSON.

## Code Examples

### `PersistStore.repoint()` — sketch, following the existing `close()`/`open()` contract
```typescript
// Source: src/main/db.ts — pattern derived from existing close()/open() this session
// (open() at db.ts:118-130, close() shortly after — both verified present)
repoint(): void {
  this.close();          // safe to call when already closed (existing contract)
  this.dbPath = undefined; // clear any test override so the default-path branch re-evaluates
  this.open();            // resolves the NEW default path (home-aware) and re-migrates
}
```
Note: if `dbPath` was a genuine test override (not the default), `repoint()` should not blindly clear
it — the planner should decide whether `repoint()` takes an explicit path argument or always re-derives
the default. Either is viable; document the choice at the call site.

### `postSlackDigest` — sibling of `postSlackReply`, no thread required
```typescript
// Source: src/main/slack.ts:373-411 pattern (postSlackReply), verified this session.
// postSlackDigest differs only in NOT requiring channel+thread_ts (CLAUSE-1's guard is
// specific to postSlackReply's two live callers and must not be edited — D-29).
export function postSlackDigest(opts: {
  botToken: string;
  channel: string;   // slackDigestChannelId — a channel id, not a thread
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  // Same node:https POST to chat.postMessage, omitting thread_ts entirely
  // (posting to channel root is the INTENDED behavior for a digest, unlike
  // postSlackReply where an implicit channel-root post is the bug CLAUSE-1 guards against).
}
```

### `events` migration — following the existing append-only contract
```typescript
// Source: src/main/db.ts:61-107 pattern (MIGRATIONS array), verified this session.
// Appended as MIGRATIONS[2] — never edit MIGRATIONS[0] or MIGRATIONS[1].
(db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      floor_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,
      agent_id TEXT,
      task_id TEXT,
      session_id TEXT,
      payload TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
    CREATE INDEX IF NOT EXISTS idx_events_floor_ts ON events(floor_id, ts);
  `);
}
```
`floor_id` is a constant (e.g. `'default'`) until SCALE-01's project key exists elsewhere — landing the
column now avoids a future migration + unattributable-row backfill (D-20's explicit reasoning).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `log.jsonl` + a 64KB tail read (`LOG_TAIL_BYTES`, `hive.ts:326`) as the only replay source | `events` SQLite table, queryable by time range, with `log.jsonl` demoted to "agent-readable tail" | This phase (SCALE-03) | Enables "pick a day and see everything" — impossible today because nothing in the app can ask for a time range, and nothing joins the 5 time-ordered stores (log, cost-ledger, spans-in-memory-only, breaker states, humanQA) (D-21's real justification, corrected from the roadmap's original 8MB-rotation framing which never actually fires) |
| Cumulative-snapshot cost rows read via 1MB tail + summed | Diffed via `applyCostRow`'s clamped-consecutive-diff, already fixed for the breaker (RECORD-03/04, Phase 1) | Phase 1, plan 01-06 | Any NEW cost lane (the events/timeline cost view) must reuse this same diff, never re-sum |
| 4 independent `useFleetTelemetry` mounts, 4 independent rate accumulators | 1 singleton (agentView.ts pattern) | This phase (SCALE-05) | Removes 3 of 4 redundant `telemetrySnapshot()` calls and 3 of 4 redundant IPC listener registrations on every fleet-visible view |
| Breaker state is push-only (`control:breakerState` event) | + a pull getter (`control:breakerSnapshot`) | This phase (SCALE-05) | Closes the "healthy for a full beat after reload" fail-unsafe window |

**Deprecated/outdated:**
- The roadmap's own stated justification for SCALE-03 ("the 8MB `LOG_ROTATE_BYTES` rotation is what
  holes a replayable day") is itself corrected by D-21 — the rotation has **never fired** (largest
  measured `log.jsonl` was 4,521 bytes over ~2.75 days); the real justification is the absence of any
  time-range query mechanism, not rotation loss. Do not cite the rotation as the motivating bug in any
  new doc/comment.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A 256KB (or similar raised) byte cap is the right answer for team@1 files, vs. keeping 64KB and accepting real-world size constraints | Pattern 2 (SCALE-02) | If wrong direction chosen, either a legitimate large team import fails with "manifest too large," or the cap is raised further than necessary for a DoS-relevant untrusted-input surface. This is genuinely undecided in CONTEXT.md and needs the planner's explicit call, not a silent default. |
| A2 | `repoint()` should re-derive the default path rather than accept an explicit path argument | Code Examples (SCALE-01) | Low risk either way — an implementation detail; wrong choice costs a small refactor, not a behavior bug, as long as SOME repoint mechanism exists at the one required call site. |
| A3 | Existing installs' `command_history`/`kv` data volume is small enough that a one-time copy-forward is cheap | Runtime State Inventory | Not independently measured this session (MEASUREMENT UNAVAILABLE — no existing populated `harness.db` was inspected). If a real install has an unexpectedly large `command_history` table, a copy-forward could be slower than expected on first repoint; still almost certainly sub-second for a SQLite table on local disk, but not measured. |

**If this table is empty:** N/A — three items above need explicit confirmation from the planner/operator
before being treated as locked.

## Open Questions

1. **What byte cap applies to a `team@1` file?**
   - What we know: the existing `HIRE_MAX_BYTES = 64 * 1024` constant is shared by the deep-link
     fetcher and file importer for single manifests; a worst-case 16-member team of maximal-length
     manifests could exceed it.
   - What's unclear: CONTEXT.md leaves the member cap (16, "a safety guess rather than a measured
     ceiling") to the planner, but does not address the byte-cap interaction at all.
   - Recommendation: introduce a SEPARATE constant for team files (e.g. `TEAM_MAX_BYTES = 256 * 1024`),
     still hard-capped and still a trivial synchronous read, rather than silently reusing
     `HIRE_MAX_BYTES` and hoping real-world teams stay under it.

2. **Where does bucket-boundary aggregation for the timeline live — main (new IPC) or renderer (raw
   row fetch + client-side bucketing)?**
   - What we know: `events` + `cost-ledger.jsonl` are both main-process-resident; shipping raw
     unaggregated rows over IPC for an entire day is unbounded in the renderer's hands, while
     aggregating in main keeps the IPC payload bounded to bucket count (96 buckets/day at the
     suggested 15-min granularity).
   - What's unclear: CONTEXT.md's Integration Points section names `hive:timeline` /
     `hive:timelineBucket` as "new handlers beside `index.ts:2983`" without specifying the aggregation
     boundary.
   - Recommendation: aggregate in main (one handler returns the day's 96 bucket summaries; a second
     handler returns one bucket's full merged detail-row list on demand, matching D-25's "ONE merged
     detail list of the SELECTED bucket's rows" — never the whole day's rows at once).

3. **Does the team@1 export button live in Settings, in a new "Team" panel, or inline on the roster
   strip?**
   - What we know: `team:export` is a new IPC channel only; CONTEXT.md does not name a UI location.
   - What's unclear: no existing "export" affordance exists anywhere in the renderer to pattern-match
     against (only import affordances: `hire:openFile`'s file picker, the deep-link flow).
   - Recommendation: planner's discretion — likely Settings (where `config:changeHome`/`resetAll`
     already live) is the most consistent placement given the file-system/whole-roster scope of the
     action.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | build/test toolchain | ✓ | v24.13.0 (this session; `.nvmrc` pins 22, both work per project memory) | — |
| npm | package management (NOT touched this phase) | ✓ | 11.6.2 | N/A — no npm operations planned |
| `better-sqlite3` native binding | SCALE-03's `events` migration | ✓ (already loaded — `test/db-fts.test.cjs` opens a real handle successfully as part of this repo's existing suite) | 11.10.0 resolved | — |
| A real Slack bot token + `slackDigestChannelId` | SCALE-04's Slack digest arm (arm 3 of 3) | Not verified this session — operator-supplied, optional | — | The digest's other two arms (file write, native toast) function with zero Slack config; Slack POST is additive per D-29, never a blocking dependency |
| A `--headless`-started process | SCALE-04's "digest reaches the operator with the app closed" claim (D-32) | Not exercised this session | — | None — this is a genuine, stated limitation (closing the WINDOW on this Windows machine kills the process; only `--headless`-launched processes survive, per `shouldQuitOnLastWindowClose` at `floor/headless.ts:64`) |

**Missing dependencies with no fallback:** none block implementation; the Slack arm and the
headless-survival claim are both correctly scoped as optional/limited in the locked decisions rather
than as blockers.

**Missing dependencies with fallback:** Slack digest delivery (falls back to file + toast, which is
D-29's designed "guaranteedness ordering" — write always happens, toast is config-gated, Slack is the
least-guaranteed rail).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node's built-in `node --test` (no Jest/Vitest/Mocha) — confirmed via `package.json` scripts and `TESTING.md` |
| Config file | none — behavior is entirely `package.json` `scripts` |
| Quick run command | `node --test test/db-fts.test.cjs test/boot-floor.test.cjs test/renderer-runstate.test.cjs` (or the specific new/touched files per task) |
| Full suite command | `npm test` (= `node --test test/*.test.cjs`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCALE-01 | `PersistStore`/`KnowledgeManager` default under `harnessHome`; `repoint()` fires at the null→set transition | integration (real SQLite, real tmpdir) | `node --test test/db-fts.test.cjs` (extend) or a new `test/db-repoint.test.cjs` | Extend ✅ `test/db-fts.test.cjs` (real-driver pattern already established) — ❌ Wave 0 for the repoint-specific case |
| SCALE-01 | Task ledger isolation is free by construction (`hive.root()` already lazy) | none — no new code, so no new test; existing `test/hive-runtime-path.test.cjs`/`test/hive-cwd.test.cjs` coverage of `root()`-derived paths already proves this | `node --test test/hive-runtime-path.test.cjs test/hive-cwd.test.cjs` | ✅ existing |
| SCALE-02 | `readHireManifestFile` branches correctly on `spec: 'hello-markx/team@1'` vs `hello-markx/hire@1` vs unknown | unit | `node --test test/hire-manifest.test.cjs` (new) or extend an existing hire-related file | ❌ Wave 0 — no existing `hire`-specific `.test.cjs` found in the 68-file listing this session |
| SCALE-02 | `hire:openFile` IPC name-count pin moves from 159→160 with `team:export` added | structural/regression pin | `node --test test/boot-floor.test.cjs` (extend the `B_IPC_JOINED`/`B_IPC_NAMES` constants, D-17's "two-place edit in the same commit") | ✅ `test/boot-floor.test.cjs:427-491` (extend, do not create new) |
| SCALE-02 | Bulk-spawn loop (extracted from `useRestoreTeam.ts`) preserves concurrency + roster-order re-assembly + per-agent failure isolation | unit/integration | New renderer-logic test via `test/load-ts.cjs` + `Module._load` stub trick (pattern: `test/pty-sanitize.test.cjs`) | ❌ Wave 0 |
| SCALE-03 | `events` table lands as `MIGRATIONS[2]`, real FTS-adjacent-pattern schema verification via a second independent handle | integration (real SQLite) | Extend `node --test test/db-fts.test.cjs` following its own "second independent handle reads the schema back" discipline | Extend ✅ `test/db-fts.test.cjs` |
| SCALE-03 | `applyCostRow`-style diffing applied correctly to the new cost lane, incl. a mid-day session rollover fixture (D-22) | unit | New test, following `hive-durability.test.cjs`'s cost-arithmetic testing style | ❌ Wave 0 |
| SCALE-03 | Day-band range input renders `min`/`max`/`step`/`aria-label`/`aria-valuetext` in first-pass static markup | renderer component (`renderToStaticMarkup`) | Extend `node --test test/renderer-components.test.cjs` | Extend ✅ `test/renderer-components.test.cjs` |
| SCALE-03 | Gap marker renders the real truncated count rather than silently slicing (D-27) | renderer component | Extend `test/renderer-components.test.cjs` | Extend ✅ |
| SCALE-04 | `msUntilNextLocalHour` pure function: before/after/exactly-at/next-day/DST cases | unit | New test file, fixed injected clock (pattern: `test/delivery-main.test.cjs`'s fake-clock harness) | ❌ Wave 0 |
| SCALE-04 | Digest timer is registered in `SHUTDOWN_STEPS`; a missing entry hangs `boot-floor` rather than passing | structural + integration | `node --test test/boot-floor.test.cjs` (the existing `'every subsystem bootFloor started appears in the shutdown list'` test at line 227 already covers this IF the new timer participates in the same registration list) | ✅ existing test extends automatically once wired |
| SCALE-04 | `postSlackDigest` posts without a thread_ts, unlike `postSlackReply`'s CLAUSE-1 guard | unit | Extend `node --test test/slack.test.cjs` | Extend ✅ `test/slack.test.cjs` |
| SCALE-04 | Digest content never implies per-day completions (no `doneAt` field exists) | unit (content-shape assertion) | New/extended digest-content test | ❌ Wave 0 |
| SCALE-05 | `agentView.ts`'s pure derivation (cost/context/duration/account/block-state) matches the intended single source of truth | unit | `node --test test/renderer-runstate.test.cjs` (extend — already the file that owns `autoMode.ts`'s sibling rules) | Extend ✅ |
| SCALE-05 | `control:breakerSnapshot` returns current per-agent levels on demand | unit/integration | Extend `node --test test/breaker.test.cjs` or `test/boot-floor.test.cjs` | Extend ✅ (one of the two) |
| SCALE-05 | `getAgentUsage()` gate fix: codex/transcript-fallback spend reaches `cost-ledger.jsonl`, not just the breaker | integration | Extend `node --test test/transcript-usage.test.cjs` or `test/telemetry-auth.test.cjs` | Extend ✅ (one of the two — verify exact ownership before editing) |
| SCALE-05 | Cost never renders as `$0.00` for a `costTracking:'none'` engine — discriminated value renders correctly | renderer component | Extend `node --test test/renderer-components.test.cjs` | Extend ✅ |

### Sampling Rate
- **Per task commit:** the specific extended/new test file(s) for that task, e.g. `node --test
  test/db-fts.test.cjs` after a SCALE-01 task.
- **Per wave merge:** `npm test` (full 68-file suite).
- **Phase gate:** Full suite green (0 fail, skip count ≤ 7, matching this session's measured ceiling)
  before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `test/hire-manifest.test.cjs` — new file, covers SCALE-02's team@1 spec-branching + per-member
      validation delegation + byte-cap decision (Open Question 1)
- [ ] A digest-scheduler test file (name TBD by planner, e.g. `test/digest-scheduler.test.cjs`) — covers
      SCALE-04's `msUntilNextLocalHour` pure-function cases and the file/toast/Slack three-arm dispatch
- [ ] A bulk-spawn-from-team test — covers SCALE-02's extracted loop against `HireManifest[]` input
      (distinct from the existing `useRestoreTeam.ts` roster-restore case it's extracted from)
- [ ] A cost-lane diffing test with a mid-day session rollover fixture — covers SCALE-03's D-22
      requirement specifically (the existing `applyCostRow` tests may already cover the general case;
      confirm before assuming Wave 0 needs a NEW fixture vs. reusing an existing one)
- [ ] Framework install: none — `node --test` is already fully wired; no new test runner config needed

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase adds no new authentication surface — the hook-socket per-agent token model (Phase 1, GATE-01) is unchanged. |
| V3 Session Management | No | No session concept is introduced. |
| V4 Access Control | Partial | SCALE-01's whole purpose IS access control (project isolation), but it is explicitly PATH-based, not permission-based — D-10 states this is deliberate because `autoMode` ships on and strips tool-approval, so any predicate-based (e.g. `WHERE project = ?`) isolation is walkable by an agent with unsandboxed shell access. The standard control here is **filesystem/process boundary**, not an authz check. |
| V5 Input Validation | Yes | `team@1` import is untrusted JSON from disk (or, transitively, from a shared file a human downloaded) — `validateHireManifest`'s existing allowlist-based validation (`SAFE_FLAG_NAMES`, `FLAG_RE`, `MODEL_RE`, byte caps) is the standard control, reused per-member rather than reimplemented (see Pattern 2 / Don't Hand-Roll). |
| V6 Cryptography | No | No new cryptographic operation. `postSlackDigest` reuses the existing bot-token-bearer-auth pattern (`postSlackReply`'s `Authorization: Bearer` header) — never hand-rolled. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A shared `team@1` file smuggling a raw binary path or shell-metacharacter flag into a spawn command | Elevation of Privilege | Already mitigated by `src/shared/hire.ts`'s existing `SAFE_FLAG_NAMES` allowlist (default-deny) + `FLAG_RE`/`MODEL_RE` character allowlists — reused unmodified per team member, never re-derived |
| A `team@1` export leaking an operator's absolute filesystem paths, Claude account id, or raw executable command | Information Disclosure | D-16's mandatory strip list (7 fields) — see Anti-Patterns / Pitfall 4 above; must NOT reuse `slimAgents()` alone |
| An oversized/malicious `team@1` file as a light DoS vector (memory pressure from `JSON.parse` on an enormous file) | Denial of Service | A hard byte cap BEFORE `readFileSync`/`JSON.parse` — `statSync(path).size > MAX_BYTES` check already exists in `readHireManifestFile` (`main/hire.ts:243-251`) for single manifests; the team@1 cap decision (Open Question 1) must apply the same pre-read size check |
| A digest Slack POST leaking the bot token via logging | Information Disclosure | `postSlackReply`'s existing doc comment states the token "is NEVER logged" — `postSlackDigest` must preserve that property; do not add a debug `console.log` that includes `opts.botToken` or the request headers |
| SSRF via a team@1 member's `homepage` field or any future remote-fetch path | Tampering / SSRF | Not applicable to file-based team@1 import (no network fetch of member content) — but if a future team@1 deep-link/URL import is added, it must reuse `isAllowedManifestUrl`'s existing SSRF blocklist (`main/hire.ts:26-52`, `BlockList`-based, already covers RFC1918/link-local/cloud-metadata), never a hand-rolled URL check |

## Sources

### Primary (HIGH confidence — verified by direct grep/sed/npm command in this session)
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/db.ts` — `PersistStore`, `MIGRATIONS` array, `harness.db` default path, `getKv`/`setKv`
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/knowledge.ts` — `KnowledgeManager.root()`, `KG_ROOT` default path
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/hive.ts` — `root()`, `appendLog`, `appendCostLedger`, `applyCostRow`, `logTail`/`tailLines`, `LOG_ROTATE_BYTES`/`LOG_TAIL_BYTES`, `routeMessage`/`emitMessage`/`terminalHandoff`/`startRouter`/`stopRouter`/`routeOnce`, no electron import (verified via grep, zero hits)
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/floor/boot.ts` — `persist = new PersistStore()` (:1148), `syncContextTriggers`/`syncMissions`/`armHeartbeat` timer shapes, `SHUTDOWN_STEPS`, `writeFleetSnapshot`, `runBreakerBeat`'s `sample?.sessionId` gate
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/config.ts` — `firedStore()`'s second `PersistStore` handle (:684), `autoMode: true` default, `notifications: false` default, `knowledgeGraph` field
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/index.ts` — `config:update`'s null→set hook (~:2692-2712), `config:changeHome` (:2729)/`app:resetAll` (:3398) relaunch paths, `requestSingleInstanceLock` (:1511), `hire:openFile` (:1545)
- `E:/munder-difflin/.claude/worktrees/phase-03/src/shared/hire.ts` — `HireManifest`, `validateHireManifest`, `SAFE_FLAG_NAMES`, `HIRE_MAX_BYTES`, `isAllowedManifestUrl`
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/hire.ts` — `readHireManifestFile`, SSRF `BlockList`
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/roster.ts` — `RosterStore`, `PersistedAgent` (via `store.ts` cross-reference)
- `E:/munder-difflin/.claude/worktrees/phase-03/src/renderer/src/store/store.ts` — `slimAgents` (:444), `PersistedAgent` type (:334)
- `E:/munder-difflin/.claude/worktrees/phase-03/src/renderer/src/hooks/useRestoreTeam.ts` — the bulk-spawn `Promise.all` loop, roster-order re-assembly
- `E:/munder-difflin/.claude/worktrees/phase-03/src/renderer/src/components/AddAgentModal.tsx` — `hireCommand`, `importHire`, `applyManifest`
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/slack.ts` — `postSlackReply`, CLAUSE-1 guard
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/floor/deps.ts` — `FloorDeps.notify`/`.send` contracts
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/floor/headless.ts` — `shouldQuitOnLastWindowClose`
- `E:/munder-difflin/.claude/worktrees/phase-03/src/renderer/src/store/autoMode.ts` — the whole module-singleton pattern
- `E:/munder-difflin/.claude/worktrees/phase-03/src/renderer/src/components/{AgentCard,FullscreenTerminal,CommandCenterPanel}.tsx` — context-threshold drift, `useFleetTelemetry` mount sites
- `E:/munder-difflin/.claude/worktrees/phase-03/src/renderer/src/hooks/useTelemetry.ts` — `useFleetTelemetry`'s per-mount accumulator
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/breaker.ts` — `CircuitBreaker.levelFor`, no snapshot getter/IPC
- `E:/munder-difflin/.claude/worktrees/phase-03/src/main/telemetry.ts` — `getAgentUsage`, `aggregateLive`, `transcriptFallback` (`sessionId: ''`), `SPAN_RING_CAP`
- `E:/munder-difflin/.claude/worktrees/phase-03/src/renderer/src/scene/office/glRecovery.ts` — WebGL context eviction
- `E:/munder-difflin/.claude/worktrees/phase-03/test/repo-claims.test.cjs` — the 14px floor's frozen allowlist
- `E:/munder-difflin/.claude/worktrees/phase-03/test/renderer-components.test.cjs`, `test/db-fts.test.cjs`, `test/boot-floor.test.cjs`, `test/hive-durability.test.cjs` — test patterns
- `npm test` run this session (800/793/0/7, 23.9s) and `npm run typecheck` run this session (0 errors)
- `.planning/codebase/{ARCHITECTURE,STACK,CONVENTIONS,TESTING}.md`, `.planning/STATE.md`, `.planning/config.json`, `.planning/phases/03-scale-and-observability/03-CONTEXT.md` — read in full this session

### Secondary (MEDIUM confidence)
- None used — all substantive claims were directly verified against source in this session rather than
  relayed from web search or training knowledge, since this is entirely an internal-codebase research
  task with no external library surface.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, every internal pattern cited was read directly this
  session.
- Architecture: HIGH — every file:line citation re-derived via `grep -n`/`sed -n` against the live tree
  this session; no line number was carried forward from CONTEXT.md/ROADMAP.md without independent
  re-verification.
- Pitfalls: HIGH — each pitfall traces to a specific, currently-true code property (e.g. `open()`'s
  idempotency guard, `deps.send`'s no-window return value) verified this session, not a general pattern.

**Research date:** 2026-08-24
**Valid until:** This is an internal-only research pass against a fast-moving local branch (`gsd/v1.0-
floor-closure`) — re-verify all file:line citations if this phase is planned more than a few commits
after `4dcab90` (this session's HEAD at research time), since several of the phase's own target files
(`index.ts`, `hive.ts`, `boot.ts`) are large and under active edit elsewhere in the milestone.
