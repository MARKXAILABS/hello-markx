# Phase 3: Scale and Observability - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning
**Mode:** `--auto` — every gray area auto-resolved to the researched recommendation. Eight parallel
ground-truth agents measured live source, eight advisor agents produced comparison tables, and every
load-bearing claim below was then **re-verified by the orchestrator against source in this session**
before being locked. Claims that did not survive that check are marked **CORRECTED**, and the
corrected fact is what is locked. Nothing here is inherited on trust.

**Measured baseline at `f04f9ec` (Windows 11, this machine, 2026-08-24):**
`npm test` → **800 tests / 793 pass / 0 fail / 7 skipped** (21.7s). `npm run typecheck` → **0 errors**
(node + web). Every number in this document was produced by a command run in this session; nothing is
quoted from a prior SUMMARY or from ROADMAP.md.

**Corrections this discussion makes to the project's own planning documents.** Each is a fact a
downstream agent would otherwise inherit and act on:

| Document claim | Measured reality |
|---|---|
| `REQUIREMENTS.md:164` — STRUCT-02 split hive.ts including **messaging** | Messaging is still in `hive.ts` (D-01). **Orphan correction — nobody currently owns it.** |
| `REQUIREMENTS.md:145`/`:452` — PARITY-02 **Complete** | 7 of 11 engines are `costTracking:'none'` (D-03). Owned by plan 02-12, **not** by Phase 3. |
| `ROADMAP.md:293-294` — SCALE-01 needs STRUCT-02's registry/router split | Not supported by code; the isolation seam is `hive.root()` (D-02) |
| `ROADMAP.md:281`, `REQUIREMENTS.md:208` — `LOG_ROTATE_BYTES` at `hive.ts:267` | It is at `hive.ts:323`; line 267 is `seedPrompt?: string;` (D-21) |
| `REQUIREMENTS.md:206` — span ring at `telemetry.ts:126` | `SPAN_RING_CAP` is at `telemetry.ts:161` |
| `ROADMAP.md:286` — re-ordering makes **both** criteria hold | False for SCALE-01: RECALL-02 is memory-only (D-06) |
| `ROADMAP.md:283` — the 8 MB rotation is what holes a replayable day | The 8 MB rotate has **never fired**; the real cap is a 64 KB *read* (D-21) |

<domain>
## Phase Boundary

One operator runs more than one project without the projects leaking into each other, and can see
what happened yesterday without having been watching. Five requirements: SCALE-01…SCALE-05.

**In scope:** the five requirements, plus the honesty work each implies — correcting any claim this
phase makes false, and stating a limitation in source, docs *and* UI wherever a capability genuinely
cannot be built under the standing constraints.

**Out of scope:** anything belonging to a later phase — the crash-surviving record (RECORD-01/02,
Phase 4), server-enforced memory scope (RECALL-02, Phase 5), running GSD on the floor (Phase 6). Also
out of scope: re-carving `hive.ts` (STRUCT-01/02 residual debt is carried forward as declared debt,
D-01), iOS, any paid tier of anything, and **any change to `package.json` or `package-lock.json`**.

**Phase 2 dependency status — VERIFIED, AND ONE DEPENDENCY IS REFUTED.** See D-01…D-04. Summary:

| Dependency | Roadmap says | Measured at `f04f9ec` | Blocks Phase 3? |
|---|---|---|---|
| STRUCT-02 | Complete; SCALE-01 needs it | **Partial** — git/provisioning/templates out, messaging + both ledgers still in `hive.ts` | **No** (D-02) |
| PARITY-02 | Complete; SCALE-05 needs it | **Refuted** — 7 of 11 engines have no cost path | **Yes**, for SCALE-03/SCALE-05 (D-03) |
| DAEMON-05 | open | open | **No** (D-04) |
| plan 02-12 | not run | not run; owns the PARITY-02 restatement | **Soft**, on exactly one file (D-04) |

</domain>

<decisions>
## Implementation Decisions

### Phase 2 dependency status — measured, not trusted

- **D-01:** **STRUCT-02 is PARTIALLY landed, and `REQUIREMENTS.md:164` overclaims it.** Measured this
  session: `src/main/hive.ts` is **2,821** lines, with `gitCommitter.ts` (511), `hiveProvisioning.ts`
  (569) and `hiveTemplates.ts` (797) genuinely extracted. **Messaging was not extracted** —
  `routeMessage` (`hive.ts:1539`), `emitMessage` (`:1659`), `terminalHandoff` (`:1679`),
  `startRouter` (`:1708`), `stopRouter` (`:1719`) and `routeOnce` (`:1723`) are all still
  `HiveManager` methods, as are the task ledger and the cost ledger. `REQUIREMENTS.md:164` lists
  "messaging" among the split concerns; source says otherwise. **This is an ORPHAN correction** —
  plan 02-12's ownership note scopes it to the PARITY-02 requirement text and status row only, so
  nobody currently owns line 164. **Phase 3 adopts it explicitly** or it silently persists.

- **D-02:** **STRUCT-02 does NOT block Phase 3, and the roadmap's stated reason for the dependency is
  not supported by the code.** `ROADMAP.md:293-294` says "SCALE-01's per-project isolation needs the
  registry/router split from STRUCT-02". Measured: SCALE-01's isolation seam is `hive.root()`
  (`hive.ts:518-521`), which is `join(this.getHome(), 'hive')` — already a lazy closure. `agentDir`
  and every other hive path derive from it, and the *unextracted* router calls `root()` exactly like
  the extracted modules do. Splitting messaging would **move that call, not change it**. STRUCT-02's
  remaining gap is testability debt, not a Phase-3 blocker.

- **D-03:** **PARITY-02 IS REFUTED AND DOES BLOCK SCALE-03 AND SCALE-05 — but Phase 3 does not own
  the correction.** Measured in `src/shared/agentProvider.ts`: **7 of 11** presets are
  `costTracking:'none'`, 1 `'otel'`, 2 `'proxy'`, 1 `'transcript'`. "All eleven engines report cost
  to the ledger and to the breaker" is false, and it is **not buildable**: copilot's spend sits on
  the operator's own Copilot plan and never reaches the app, `custom` is an unknown binary, and
  converting a hooks-bridged engine (grok, kimi, opencode) to a proxy bridge would **delete its mail
  bridge**, because `ensureAgent` dispatches hooks XOR proxy. `test/engine-parity.test.cjs:826`
  exists to turn exactly that mistake red. **Plan 02-12 owns the restatement of
  `REQUIREMENTS.md:145` and `:452`. Phase 3 MUST NOT edit those two lines** — a duplicated correction
  conflicts with the plan that owns it.

- **D-04:** **DAEMON-05 blocks nothing; 02-12 is a soft block on exactly one file.** SCALE-01…05
  (`REQUIREMENTS.md:150-158`) contain no reference to the tunnel or the phone PWA, and SCALE-04's
  digest has four non-tunnel rails already in main (`push.ts`, `slack.ts`, `webhook.ts`,
  `delivery.ts`). Plan 02-12 is unrun (no `02-12-SUMMARY.md` on disk) and its `files_modified` is
  docs plus two test files with **zero `src/` entries**. **Run 02-12 first** and the only collision
  disappears.

### Execution order and the two forward dependencies

- **D-05:** **LOCKED: numeric order (1 → 2 → 3 → 4 → 5 → 6), and the post-Phase-5 re-verification
  gets a real phase id instead of a prose line.** This matches the default already recorded in
  `ROADMAP.md` and in STATE.md's Pending Todos. Insert a phase after Phase 5 — "Close the forward
  dependencies" — carrying exactly the two skeptic tests already written at `ROADMAP.md:297-310`;
  GSD becomes Phase 7, a doc-only renumber since no phase directory exists past `02-*`. **Rationale
  from this repo's own evidence, not principle:** unowned prose residuals measurably rot here —
  STATE.md still carries FLOOR-06's never-run `gh attestation verify`, FLOOR-02's and FLOOR-05's
  unobserved manual clauses, and issue #18's three unmet Fix clauses, every one recorded as "owner:
  operator" and every one still open. The counter-example is instructive: #18 was caught being
  wrongly treated as closed **because it had an id**. **Do not land this roadmap edit until 02-12
  lands** — nothing blocks on the ordering today.

- **D-06:** **CORRECTED — the roadmap frames this as a symmetric choice and it is not. `RECALL-02` is
  memory-only, so re-ordering does NOT make SCALE-01 hold.** `REQUIREMENTS.md:270-272` is "an agent
  in project X gets nothing from project Y even when it asks for everything" — recall, memory, the
  hook socket. `grep -n "task ledger" .planning/REQUIREMENTS.md` returns **exactly one hit**, line
  153, which is SCALE-01 itself. No Phase 4 or Phase 5 requirement gives `HiveTask` a project field
  or splits `tasks.json`. `ROADMAP.md:286`'s "Both criteria then hold" is therefore **measurably
  overstated**: the ledger half is Phase 3's own net-new work under *both* orderings.

- **D-07:** **SCALE-01 and SCALE-03 are NOT ticked in Phase 3.** They stay Pending in
  `REQUIREMENTS.md` with the owner column naming the new phase — never "later". This is the standing
  rule (a partially-landed fix is an open concern) applied as written.

### SCALE-01 — the project boundary is `harnessHome`, enforced by PATH

- **D-08:** **LOCKED: the project boundary IS `harnessHome`, and Phase 3's job is to make the two
  stores that escaped it follow it.** This repo already made this decision and left it 90% finished
  — `config:changeHome`'s own comment states the architecture out loud: "every derived path (hive
  root, palace, sock, agent dirs) resolves lazily through `getHome()`". Verified: `hive.root()` is
  `join(home,'hive')` (`hive.ts:518-521`), so `tasks.json`, `registry.json`, `board.md`,
  `log.jsonl`, every agent dir and every mailbox are **already per-project**, and `ledger()` /
  `writeTasks()` / `mutateTasks()` are the only three ways the ledger is ever touched — all call
  `root()`. **"An agent in project X cannot see project Y's task ledger" is TRUE TODAY, for free, by
  path.**

- **D-09:** **Exactly two stores escaped the boundary, and closing them is the whole SCALE-01 code
  change.** Measured: `harness.db` is `join(app.getPath('userData'), 'harness.db')` (`db.ts:121`) —
  app-global, **outside** `harnessHome`, so it survives every `changeHome` *and* `app:resetAll`; and
  `KG_ROOT` is `join(app.getPath('userData'), 'knowledge')` (`knowledge.ts:71`), which is the more
  serious of the two because it is injected into **every agent's spawn**. Both already have an
  override seam (`PersistStore(dbPath)`, `knowledgeGraph.rootPath`), so this is a **default-path
  change at ~6 call sites, not an architecture**. No new abstraction, no migration, no
  `user_version` bump, no new dependency.

- **D-10:** **NO scope column, and the reason is a hard one: `autoMode` ships ON.** Measured:
  `config.ts:464` → `autoMode: true`, which strips the tool-approval prompt, so **every agent holds
  an unsandboxed Read**. A `WHERE workspace = ?` predicate that an agent walks around with
  `cat <home>/hive/agents/*/memory.md` is not isolation — it is a comment with SQL syntax. It also
  would not cover `mempalace`, which is the recall path agents actually run. **Path separation is
  the only kind of isolation that survives `autoMode`.**

- **D-11:** **The task-ledger half of SCALE-01 requires ZERO code** — it falls out of D-08. Plans
  must not budget for it, and must not describe it as delivered work.

- **D-12:** **A `repoint()` at the first-run `harnessHome: null → set` transition is mandatory, and
  it is a known trap, not a hypothetical.** `PersistStore` is constructed at `floor/boot.ts:1148`
  while `harnessHome` is still null on a fresh install, so without a repoint the entire first session
  silently writes to userData and the leak survives the fix. `index.ts:2694-2707` is a comment block
  documenting that **this exact transition already shipped one silent-dead-services bug**, and the
  `!hiveWasEnabled && hive.enabled()` hook added to fix it is precisely where `persist.repoint()`
  belongs. **Two live handles must repoint together** — `floor/boot.ts:1148` and a second
  `PersistStore` at `config.ts:684` opened deliberately to avoid an import cycle; miss it and
  missions fire off the previous project's `missionLastFiredAt`.

- **D-13:** **HONEST LIMITATION, to be stated in UI and docs rather than reinterpreted: this does NOT
  deliver simultaneous side-by-side floors.** `app.requestSingleInstanceLock()` (`index.ts:1511`)
  still quits a second process and switching still relaunches. If "runs more than one floor" is read
  as *two floors live at once*, Phase 3 does not deliver it and must say so. The upgrade path is
  additive but carries a real correctness problem that must be solved first: a per-userData split
  forks `claudeAccounts` (`config.ts:342`) into one pool per project, so **two live projects would
  rotate and fail over the same subscription account with neither pool aware of the other**.

- **D-14:** **The dead `MemoryScope 'agent'` branch is NOT resurrected — and the docs that advertise
  it are corrected.** Measured: `HarnessConfig` has **zero** `scope` fields, and `floor/boot.ts:1137`
  constructs `{ enabled, model }` only — so `scope()` returns `'shared'` unconditionally in the
  shipped app and the whole `'agent'` branch is unreachable. `README.md:122-123` and
  `MemoryPanel.tsx:126` currently instruct the operator to use a control that does not exist; fixing
  that text is part of this work. Wiring the branch belongs with Phase 5, not here.

### SCALE-02 — a populated floor in one action

- **D-15:** **LOCKED: a `hello-markx/team@1` JSON document that is BOTH imported and exported.** The
  format question is settled by who *produces* the file, and this repo has already run the
  experiment: `src/shared/hire.ts` is a finished, security-reviewed single-agent format with a deep
  link, a file picker and a modal — and it has **no content and no producer**, so
  `OnboardingWizard.tsx:77` still advertises a one-click "Agent Gallery" that exists nowhere, and
  `AddAgentModal.tsx:84`'s `HIRE_PROMPT` (the LLM-authoring workaround) has already drifted out of
  sync with the schema it restates. Shipping team@1 with presets or hand-authoring as the only
  producers repeats that failure one size larger. **Export is the only producer that cannot drift**,
  because it reads the same `PersistedAgent` records `slimAgents` (`store.ts:444`) already writes.

- **D-16:** **Export is deliberately LOSSY, and the loss is declared in the UI and in the file
  itself.** It drops `cwd`, `account`, `accountPolicy`, `worktreePath`, `ptyId`, the raw `command`
  **and** `commandFlags`. It must **never** try to recover `commandFlags` by diffing the live command
  against `buildSpawnCommand` — that diff is exactly how a binary path smuggles itself back into a
  file the format exists to keep binary-free. Put that reasoning in a comment **at the stripper**,
  not only in the plan.

- **D-17:** **Import rides the existing `hire:openFile` channel; only export adds one.** Branch on
  the parsed `spec` field inside the existing handler (which already returns a discriminated
  `{ok, manifest|error}` and already owns the 64 KB cap and the `JSON.parse`). Only `team:export`
  is new, so `test/boot-floor.test.cjs`'s IPC-name pin needs a **two-place edit in the same commit**
  (count 159→160 plus the sorted-name insertion).

- **D-18:** **The bulk-spawn loop is EXTRACTED from `useRestoreTeam.ts:92-205` and shared, never
  re-implemented.** That loop's comments record three real defects it already paid for: serial cost
  ~6× for six agents, completion-order overwriting the persisted roster order, and one rejected IPC
  call silently aborting every subsequent agent. Re-implementing is how all three come back.
  Spawning stays **renderer-driven**: `hive.spawnAgent`'s descriptor carries no model, goal,
  character, accent, tokenCap or capabilities, so a main-driven bulk hire would silently drop half of
  every template while looking like it worked.

- **D-19:** **`skills` and `mcpServers` are NOT in team@1 v1.** Nothing in the app applies them today
  even for a single hire (`McpConsentModal.tsx:14` says so in-source), so a team template cannot
  grant them either. Declare it in the format's doc comment rather than shipping N × 2 more dead
  fields.

### SCALE-03 — what a replayable day is read FROM

- **D-20:** **LOCKED: an `events` table as MIGRATION #3 in the existing `PersistStore`, fed by an
  OPTIONAL INJECTED SINK beside `appendLog` (`hive.ts:2485`) and `appendCostLedger` (`:2550`), wired
  at `floor/boot.ts:1148`.** Schema: `events(id INTEGER PRIMARY KEY AUTOINCREMENT, floor_id TEXT NOT
  NULL, ts INTEGER NOT NULL, kind TEXT NOT NULL, agent_id TEXT, task_id TEXT, session_id TEXT,
  payload TEXT)` with indexes on `(ts)` and `(floor_id, ts)`. `log.jsonl` is **kept** and explicitly
  demoted in its own doc comment to the agent-readable tail; **SQLite is the declared authority for
  replay**, so the two are one funnel with two sinks, not two sources of truth. The `floor_id` column
  lands **now** even though its only value is a constant until SCALE-01's key exists — adding it
  later costs a migration plus a backfill of rows that are permanently unattributable. Measured:
  `floorId|floor_id|windowId` returns **0 hits** across `src/main` and `src/shared` today.

- **D-21:** **CORRECTED, AND THIS CHANGES THE JUSTIFICATION: the roadmap's premise about the 8 MB
  rotation is wrong on the mechanism.** `LOG_ROTATE_BYTES` is at `hive.ts:323`, **not** `hive.ts:267`
  as both `ROADMAP.md:281` and `REQUIREMENTS.md:208` claim (line 267 is `seedPrompt?: string;`), and
  `test/repo-claims.test.cjs:91` excludes `.planning/` by construction so this will never go red on
  its own. More importantly the **8 MB rotate has never fired** — the only real floor measured wrote
  4,521 bytes of `log.jsonl` over ~2.75 days. What actually truncates replay is
  **`LOG_TAIL_BYTES = 64 * 1024` at `hive.ts:326`**, a *read* cap in `logTail()` (`hive.ts:2443`),
  and all renderer consumers already sit behind it. **Fixing rotation alone changes nothing an
  operator can see.** The honest case for a store is the other one: nothing in this app can ask for a
  time range, and nothing joins the five time-ordered stores. Beware the decoy — a second, unrelated
  `LOG_ROTATE_BYTES` (5 MB, the console tee) lives at `index.ts:136`.

- **D-22:** **Any cost lane MUST diff, never SUM.** ADR-0005 records that ledger rows are
  **cumulative** snapshots per `(agent_id, session_id)` and that this contract has already been
  broken once. Use `applyCostRow`'s clamped consecutive diff (`hive.ts:2611`). A session's counter
  restarts at zero on a new `session_id`, so a naive last-minus-first across a bucket goes negative
  or double-counts; the check needs a fixture with a mid-day session rollover.

- **D-23:** **Retention is chosen in the same plan that creates the table** — a single
  `DELETE FROM events WHERE ts < ?` on open, N days. Without it this becomes the app's *second*
  unbounded store beside `cost-ledger.jsonl`, which is already never rotated.

- **D-24:** **DO NOT import `PersistStore` into `hive.ts`.** `hive.ts` has zero `from 'electron'`
  imports today and `db.ts` imports `app` from electron; a direct import drags Electron into an
  Electron-free module and breaks the property that makes it `node --test`-able. Use a
  constructor-injected sink — the established pattern is already there (`hive.ts:497` takes
  `log: (event) => this.appendLog(event)`; `boot.ts:1146` already injects a log sink).

### SCALE-03 — the shape of the timeline surface

- **D-25:** **LOCKED: a two-tier "day band" as a new CCTab — fixed-height density band over a
  wall-clock 24h axis, a native `<input type="range">` scrubber over bucket index, and ONE merged
  detail list of the selected bucket's rows.** Three of this repo's hardest walls all point at this
  shape. (1) **The lockfile is frozen and there is no windowing library** — re-confirmed:
  `react-window|virtuoso|tanstack|IntersectionObserver` returns zero hits across `src/` and
  `package.json` — so "virtualized list" is not an option that exists, it is a request to hand-roll
  windowing. A 96-column band is a fixed, tiny DOM and the detail list is one bucket deep, so
  **neither list is ever long enough to need windowing**. (2) **The 14px floor is enforced
  mechanically** over comment-stripped source against a frozen 16-entry allowlist
  (`repo-claims.test.cjs:684-729`), and it also binds Pixi `Text` — a density band **carries no text
  at all**, so the floor simply does not apply to the dense part. (3) A native range input renders
  `min`/`max`/`step`/`aria-label`/`aria-valuetext` into first-pass static markup, so it is
  **assertable under `renderToStaticMarkup`**, which a hand-rolled drag playhead structurally is not.
  Arrow keys are the step control, so there are no icon-only buttons to trip `Icon.tsx:147`'s
  unconditional `aria-hidden`.

- **D-26:** **Envelopes are a FILTER of the event track, not a second source.** `hive.ts:1641` writes
  envelopes into `log.jsonl` as `kind:'message'` rows. Only `cost-ledger.jsonl` is a genuinely second
  read. The merged detail list is where "one timeline" is literal.

- **D-27:** **The band renders an explicit GAP MARKER naming the first timestamp it actually has** —
  it never draws an empty morning as if the morning were quiet, and it never silently `slice()`s a
  busy bucket the way `ToolWaterfall.tsx:16` and the activity tab do today. A truncated bucket
  returns `truncated: true` and the UI prints the real count it could not show.

- **D-28:** **Pixi.js is REFUSED for this surface, on a measured bug rather than taste.**
  `glRecovery.ts:9-18` records that Chromium caps a renderer at ~16 WebGL contexts and evicts the
  **oldest**, that the floor's context is created at startup so it is always first out, and that Pixi
  reports nothing when it happens — the floor just goes blank. `OfficeFloor.tsx:238` is deliberately
  the only `new Application()` in the entire renderer, and every xterm already takes a context.

### SCALE-04 — a digest that reaches the operator

- **D-29:** **LOCKED: build ONE digest string per day and deliver it three ways, in this order of
  guaranteedness — WRITE it, TOAST it, PUSH it.** (1) `digest-YYYY-MM-DD.md` in the floor root,
  cloning `writeFleetSnapshot`'s best-effort never-throws-from-a-timer shape (`boot.ts:470`); always
  happens, needs no config. (2) `deps.notify({title, body})` (`floor/deps.ts:48`), which works with
  no window today, gated on a **new** `dailyDigest` field — **not** on `notifications`, which is
  documented as "agent lifecycle events" and defaults false. (3) When `slackBotToken` **and** a
  **new** `slackDigestChannelId` are both set, POST via a **new sibling** `postSlackDigest(...)` in
  `slack.ts` — never an edit to `postSlackReply`, whose CLAUSE-1 guard against an implicit
  destination must keep holding for its two live callers. **Send-only Slack needs only a bot token**:
  `slackEnabled`/`slackSigningSecret` gate the *inbound* server, so a digest needs no tunnel, no
  signing secret and no stable public origin.

- **D-30:** **The scheduler is a NEW wall-clock daily timer keyed off a `PersistStore` KV holding the
  last-sent LOCAL DATE STRING — and it must NOT route through `deps.send`.** Copy the *timer shape*
  of `syncContextTriggers` (`setTimeout(remaining)` then `setInterval`) but not its delivery:
  `emitContextTrigger` routes through `deps.send`, which **returns false with no window** and would
  make the entire feature a silent headless no-op — passing every test that runs with a fake window
  while delivering nothing in the exact scenario SCALE-04 exists for. Extract
  `msUntilNextLocalHour(hour, now)` as a pure exported function so `node --test` can drive
  before/after/exactly-at/next-day and a DST transition against a fixed injected clock. Catch-up on
  arm (`lastSentDate !== todayLocal && now >= hour` → fire immediately) is what makes a slept or
  restarted machine still deliver. **Register the timer in `SHUTDOWN_STEPS` in the same commit** — a
  missed entry keeps the process alive and makes `test/boot-floor.test.cjs` fail by **hanging**,
  which reads as a flaky CI run rather than a bug.

- **D-31:** **Digest content is LOCKED to what is actually computable, and it may not imply
  per-day completions.** `HiveTask` records `createdAt` and **nothing else timestamped** — there is
  no `doneAt`. So the digest honestly reports per-day spend and tokens (from `cost-ledger.jsonl`,
  which is append-only and never rotated), which `task_id`s were worked, **current** board counts,
  and questions asked yesterday still unanswered (`humanQA[].askedAt/answeredAt` are ISO-stamped).
  Adding `doneAt` is a ledger schema change with several concurrent writers — a separate explicit
  decision, never smuggled inside a digest plan. Stamp the floor identity into all three outputs, or
  N instances firing at the same hour into one Slack channel are indistinguishable.

- **D-32:** **HONEST LIMITATION: "with the app closed" holds ONLY for a floor started
  `--headless`.** Measured: `shouldQuitOnLastWindowClose` is `platform !== 'darwin' && !headless`
  (`floor/headless.ts:64`), so on this operator's Windows machine closing the window **kills the
  process** and no timer survives. The only path producing a `--headless` process is
  `app.setLoginItemSettings({openAtLogin, args:['--headless']})`. This must appear in the Settings UI
  next to the digest toggle — "requires Start at login" — not buried in docs.

### SCALE-05 — one consolidated agent card

- **D-33:** **LOCKED: one pure, React-free derivation module `src/renderer/src/store/agentView.ts`,
  following the `autoMode.ts` pattern (module singleton + `useSyncExternalStore`, `@shared`-only
  imports).** This repo already answered this question once and wrote the answer down: `autoMode.ts`
  opens with *"three copies of a safety rule are three chances for one of them to drift and start
  lying"* and is deliberately pure so it runs under plain `node --test`. **The proof of what happens
  without it is measured in the same tree:** FLOOR-13 unified the AUTO chip via that module and
  unified cost by *copying* the expression into three files — and the copied half has drifted, while
  the shared-module half has not. Verified this session: `FullscreenTerminal.tsx:533` escalates
  context at **85/65** and `CommandCenterPanel.tsx:853` at **88/75**, with `AgentCard` using a
  different derivation again (the 0..8 `progress` integer). The defect is in **derivation**, not
  markup — which is why a shared *component* cannot fix it.

- **D-34:** **The 322×86 `AgentCard` box does NOT grow, and two of the six renderings are not React
  at all.** `AgentCard.tsx:193` is a pixel-measured `const width = 322` whose own comment says the
  box is not grown, with a STOP-AND-REPORT clause and a recorded failure where one unshrinkable
  sibling drove the agent NAME to zero width. `OfficeFloor.tsx` `applyState` is a **Pixi scene
  graph** and cannot mount a component. Each rendering keeps its geometry and renders the subset it
  has room for; the consolidated five-field card lands in `AgentDetailPanel.tsx`, which today shows
  none of them.

- **D-35:** **Cost is a DISCRIMINATED value — `{kind:'measured', usd}` vs `{kind:'unmeasured',
  reason}` — and NEVER `$0.00` for a `costTracking:'none'` engine.** Seven of eleven engines render a
  declared "no cost meter" gap (D-03). A zero that reads as "cheap" is exactly the faked capability
  this project's rules forbid.

- **D-36:** **Three main-process fixes are IN SCOPE because the renderer cannot make them, and two of
  them are live bugs.** (1) A `control:breakerSnapshot` IPC — `breakers` is push-only today (preload
  exposes only `onBreakerState`/`setBreakerState`, no getter), so a card sourcing block state shows
  **"healthy" for a stopped agent for a full breaker beat after every window reload**, failing safe
  in the wrong direction. (2) Switch `publishUsage`/`snapshot()` to `getAgentUsage()` — verified:
  `transcriptFallback` returns `sessionId: ''` (`telemetry.ts:636`) and `floor/boot.ts:429` gates
  `appendCostLedger` on `if (sample?.sessionId)`, while the breaker inputs at `boot.ts:441` are
  pushed **ungated**. So **codex spend reaches the circuit breaker but never reaches
  `cost-ledger.jsonl`** — the file SCALE-03 replays and `taskSpend`/`budgetForAgent` read. The
  breaker and the per-card budget already disagree today. (3) Add `spawnedAt` to the registry write
  for duration. **Collapse the four `useFleetTelemetry` mounts** (`AgentStrip.tsx:34`,
  `CommandCenterPanel.tsx:370`, `FullscreenTerminal.tsx:88`, `ToolWaterfall.tsx:12`) into one
  singleton — four independent rate accumulators is the "scale" half of this phase.

### Phase-wide rules (binding on every plan)

- **D-37:** **ZERO new npm dependencies. `package.json` and `package-lock.json` are not touched by any
  plan in this phase.** The lockfile requires npm 10, this machine has npm 11, and that mismatch has
  already caused one fully-red CI round. Every decision above was chosen to hold under this rule; all
  eight advisor tracks returned an empty `new_dependencies` list. YAML for team@1 is refused on this
  ground alone.

- **D-38:** **Every repo-fact or grep-based assertion asserts a POSITIVE LOWER BOUND (`count >= 1`)
  alongside any negative**, so deleting the feature fails the test instead of satisfying it. This is
  Phase 2's D-40 carried forward, and it has teeth here: this phase's ground pass found **four**
  built-tested-rendered-nowhere features already in the tree — `log.jsonl.1` (written, gitignored,
  read by nothing), `db.ts`'s `project = ?` predicate (written and tested, zero live callers), the
  entire `'agent'` memory-scope branch (unreachable, D-14), and `capabilityLine()`. `push.ts` is a
  fifth: 293 lines of RFC-vector-tested crypto with zero production consumers. **Any new sender or
  sink lands with its caller in the same commit.**

- **D-39:** **Correct the stale anchors in the same edit that locks the order** —
  `ROADMAP.md:281`/`REQUIREMENTS.md:208` (`hive.ts:267` → `:323`) and `REQUIREMENTS.md:206`
  (`telemetry.ts:126` → `:161`). The facts are right; the coordinates rotted, and
  `test/repo-claims.test.cjs:91` excludes `.planning/` so nothing catches them.

- **D-40:** **"Floor" means five different things in this repo** (a multiWindow window, `bootFloor`'s
  composition root, `realtimeFloorWatcher`, floor-wide MCP consent, and the Pixi office floor). Every
  plan in this phase uses **"project"** or **"home"** for the new boundary and never "floor", or
  reviewers will read it five ways.

### Claude's Discretion

Auto-mode resolved every gray area to its researched recommendation. The following are left to the
planner rather than pre-locked:

- Plan slicing and wave assignment across the five requirements — subject to the hard constraint that
  02-12 runs first (D-04) and that the two source fixes in D-36 land before SCALE-03/SCALE-05 build
  on them.
- Exact disjoint file-ownership lists per agent (the proven method on this repo; `use_worktrees:
  false`).
- The bucket granularity and detail-row cap for the day band (D-25) — 15 min is a reasoned default,
  explicitly **not** a measured one; both must be constants with a comment saying so.
- Whether the `events` sink batches inside one `db.transaction()` — decide from the synthetic driver,
  do not add a worker thread speculatively.
- The team@1 member cap (16 suggested, a safety guess rather than a measured ceiling) and whether the
  review sheet defaults duplicate-name rows unchecked.
- Whether existing installs' `command_history`/`kv` are copied forward on the first per-home open or
  the one-time loss is declared in release notes (D-09) — **one of the two, never silently**.
- The digest hour and whether the file/toast/Slack arms ship in one plan or three.

</decisions>

<accepted_residuals>
## Accepted Residuals

Added during PLAN REVISION ROUND 2, after two red-team rounds. These are stated gaps, not silent
ones — each has an owner and a reason it is not closed in Phase 3.

- **Transcript-tier spend does not reach `cost-ledger.jsonl`.** `boot.ts`'s cost-ledger append gate
  (`if (sample?.sessionId) hive.appendCostLedger(sample)`) stays exactly as it is today. An earlier
  draft of 03-02 widened it to `if (sample) hive.appendCostLedger(sample)` so a transcript-fallback
  sample (`sessionId: ''`, from codex/other transcript-tier engines) would also be credited. Across
  two red-team rounds that single-line change produced **thirteen confirmed findings** (round 1 #3,
  #4, #15, #35; round 2 #1, #12, #15, #16, #17, #21, #23, #30, #40) — every attempted fix (a
  fallback-baseline seed, a monotonic floor, `resolveCodexHome` wiring) spawned two more defects of
  the same class, and the money path it touches had zero test coverage the whole time. **Decision:
  revert the widening rather than patch it a third time.** `applyCostRow` in `hive.ts` is unchanged.
  The breaker's inputs and the fleet/agent-directory DISPLAY join (`writeFleetSnapshot`,
  `hive:agentDirectory`) DO show transcript-tier cost as of 03-02 (`telemetry.getAgentUsage(id)`,
  with a `costLifetime` discriminator) — D-36's "invisible to every UI" requirement is satisfied by
  the display half. Only the durable ledger, and anything reading `taskSpend`/`budgetForAgent` off
  it, still sees zero for these engines. **Owner: PARITY-02** (D-03) — that plan already owns
  correcting `REQUIREMENTS.md:145`/`:452`'s "all eleven engines" overclaim, and closing this ledger
  gap is the natural extension of that correction. The per-agent session filter it will need
  (`ReadUsageOptions`) already exists at `transcript.ts:299` — a future plan can pass a real session
  id into `readAgentUsage`/`readCodexUsage` per agent instead of the whole-cwd/whole-CODEX_HOME total,
  which removes the double-billing hazard the widening attempt kept re-introducing.
- **SCALE-05's agent card renders a DECLARED GAP for the ledger-sourced budget/spend-cap fields it
  cannot trust for a transcript-tier engine**, per D-35 (never a faked `$0.00`). This is satisfied
  fully by 03-02/03-08's discriminated display join — it does not depend on the ledger gap above
  closing.

</accepted_residuals>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and requirement sources
- `.planning/ROADMAP.md` §"Phase 3: Scale and Observability" — goal, the four success criteria, and
  the forward-dependency table. **Read D-06 and D-21 first: two of its claims are corrected here.**
- `.planning/ROADMAP.md` §"Standing Constraints" — zero recurring cost, Node 22, npm 10 lockfile,
  three hard CI platforms, accessibility in scope
- `.planning/REQUIREMENTS.md` — SCALE-01…05 at lines 150-158. **Lines 145, 164, 206, 208 and 452 each
  carry a measured-false claim; see the corrections table at the top of this file. Phase 3 owns 164,
  206, 208; plan 02-12 owns 145 and 452.**
- `.planning/PROJECT.md` — core value, the $0 constraint, the disjoint-file-ownership method
- `.planning/phases/02-the-daemon-and-the-protocol/02-12-PLAN.md` — **runs before Phase 3** (D-04)

### Decision records (load-bearing — do not contradict)
- `docs/adr/0001-one-gate-for-pty-writes.md` — automatic text reaches a terminal through exactly one
  gate
- `docs/adr/0004-single-committer-git.md` — the two-writers hazard a dual-write must not repeat (D-20)
- `docs/adr/0005-cumulative-cost-ledger.md` — **why cost rows are diffed, never summed** (D-22)

### SCALE-01 — the project boundary
- `src/main/hive.ts:518-521` — `root()`, the seam the whole boundary rests on
- `src/main/db.ts:121` — `harness.db` in userData, escaped store #1
- `src/main/knowledge.ts:71` — `KG_ROOT` in userData, escaped store #2
- `src/main/db.ts:98-106` — `memory_fts` schema (no floor column); `:41-43` — the append-only
  migration contract
- `src/main/memory.ts:235-241`, `:277-280`, `:445-450` — palace paths and the in-source honesty about
  agent-supplied scope
- `src/main/floor/boot.ts:1137` — where `scope` is never passed (D-14); `:1148` — where `persist` is
  constructed (D-12)
- `src/main/config.ts:684` — the second `PersistStore` handle; `:464` — `autoMode: true` (D-10);
  `:316-317` — "floors share the on-disk hive"
- `src/main/index.ts:2694-2707` — the documented first-run-transition bug; `:2738` — the nested-home
  refusal; `:2769` — the `changeHome` copy list; `:3406` — the `resetAll` rm list
- `src/renderer/src/components/HivePicker.tsx`, `MemoryPanel.tsx:126`, `README.md:122-123`

### SCALE-03 — storage and surface
- `src/main/hive.ts:323` — `LOG_ROTATE_BYTES` (**the real line**); `:326` — `LOG_TAIL_BYTES`, the cap
  that actually truncates replay; `:2443` `logTail`; `:2451` `tailLines` (the bounded-read idiom that
  must not be copied into a total); `:2485` `appendLog` (the single funnel, 24 call sites); `:2498`
  the one-generation rotate; `:2550` `appendCostLedger`; `:2611` `applyCostRow`; `:1641` the
  `message` event that records subject but never the body
- `src/main/index.ts:136` — the **decoy** second `LOG_ROTATE_BYTES` (console tee)
- `src/main/db.ts:44-59` — the reserved `cost_ledger` column list; `:60` — the append-only
  `MIGRATIONS` array where migration #3 lands; `:138-159` — pragmas and the transactional loop
- `src/main/telemetry.ts:161` — `SPAN_RING_CAP` (**the real line**); `:96` — spans are never persisted
- `src/renderer/src/components/CommandCenterPanel.tsx` — the CCTab host; `ToolWaterfall.tsx`;
  `git/CommitGraph.tsx`; `Icon.tsx:147`; `design/tokens.css`
- `src/renderer/src/scene/office/glRecovery.ts:9-18` — the WebGL context cap (D-28)
- `test/repo-claims.test.cjs:684-729` — the 14px floor and its frozen allowlist; `:91` — the
  `.planning/` exclusion that leaves stale anchors unguarded
- `test/renderer-components.test.cjs:24-40` — the `renderToStaticMarkup` ceiling (no effects, no
  events)

### SCALE-02, SCALE-04, SCALE-05
- `src/shared/hire.ts` (`:138` the SAFE_FLAG_NAMES escape history), `src/main/hire.ts`,
  `src/renderer/src/components/AddAgentModal.tsx`, `hooks/useRestoreTeam.ts:92-205`,
  `store/store.ts:444` `slimAgents`, `src/main/roster.ts:79`
- `src/main/slack.ts:373` `postSlackReply` (CLAUSE-1), `src/main/floor/deps.ts:48` `notify` / `:70`
  `send`, `src/main/floor/headless.ts:64`, `src/main/floor/boot.ts:470` `writeFleetSnapshot` / `:929`
  `SHUTDOWN_STEPS`, `src/main/push.ts` (the zero-consumer precedent), `src/main/tunnel.ts:73`
- `src/renderer/src/store/autoMode.ts` — **the pattern D-33 follows**;
  `src/renderer/src/hooks/useTelemetry.ts:91`; `components/AgentCard.tsx` (`:112`, `:193`, `:222`);
  `FullscreenTerminal.tsx:533` and `CommandCenterPanel.tsx:853` — **the measured threshold drift**
- `src/shared/agentProvider.ts` — the eleven presets and their `costTracking` (D-03)

### Build, CI and test surface
- `test/boot-floor.test.cjs` — the IPC-name pin (D-17) and the hang-on-missing-SHUTDOWN_STEPS failure
  mode (D-30)
- `test/db-fts.test.cjs` — the no-bypass real-driver SQLite test and the two-store template
- `test/engine-parity.test.cjs:826` — the test that turns a hooks→proxy conversion red (D-03)
- `test/hive-durability.test.cjs:148` — the existing real rotation test; a contract change, never
  relaxed
- `.github/workflows/ci.yml` — better-sqlite3 is N-API with prebuilds for every matrix platform;
  `npm ci --ignore-scripts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`hive.root()` (`hive.ts:518-521`)** — the per-project boundary, already lazy. SCALE-01's ledger
  half is free because of it (D-11).
- **`PersistStore`'s append-only `MIGRATIONS` array (`db.ts:60`)** — each entry runs with its version
  bump inside one transaction, so a third entry is zero-risk to shipped DBs. This is SCALE-03's store
  and RECORD-02's, without a new dependency.
- **`autoMode.ts`** — the pure, React-free, `node --test`-loadable selector pattern. The only
  anti-drift mechanism in this codebase that has actually held (D-33).
- **`useRestoreTeam.ts:92-205`** — a working bulk-spawn loop with three real defects already fixed in
  it. Extract, never re-implement (D-18).
- **`src/shared/hire.ts`** — a finished, security-reviewed manifest format with a validator, a flag
  allowlist and a size cap. team@1 delegates per-member to it verbatim.
- **`writeFleetSnapshot` (`boot.ts:470`)** — the best-effort, never-throws-from-a-timer shape the
  digest writer clones.
- **`postSlackReply` (`slack.ts:373`)** — a raw `node:https` POST needing only a bot token. Send-only
  Slack needs no tunnel and no signing secret (D-29).
- **`deps.notify` (`floor/deps.ts:48`)** — already works with no window.
- **`test/load-ts.cjs`** — resolves `@shared/` and stubs Electron, which is what makes both the
  selector (D-33) and the boundary test (D-09) plain-Node testable.

### Established Patterns
- **Injection, not import, is how main modules stay testable.** `hive.ts` has zero `from 'electron'`
  imports and must keep that property (D-24); `hive.ts:497` and `boot.ts:1146` already show the sink
  shape.
- **Capability gaps are declared, not faked** (`NO MAIL`, `spend UNTRACKED`). D-35 extends this to the
  agent card's cost field.
- **Discriminated `{ok, ...} | {ok:false, error}` returns** at every IPC boundary; never throw across
  it.
- **`namespace:action` IPC channels**, pinned by name in `test/boot-floor.test.cjs` (D-17).
- **Named exports only** — measured zero `export default` across 75 renderer `.tsx` files.
- **Comments explain WHY at length**, citing the issue and the failure they prevent. Several
  decisions above (D-12, D-16, D-22) exist *because* a prior comment recorded a real incident.

### Integration Points
- `events` table ← injected sink at `boot.ts:1148` ← `appendLog`/`appendCostLedger` (D-20)
- `hive:timeline` / `hive:timelineBucket` ← new handlers beside `index.ts:2983` → `preload:787` → the
  new CCTab
- `PersistStore` + `KnowledgeManager` default paths ← `harnessHome`, with `repoint()` at
  `index.ts:2712-2715` (D-09, D-12)
- `team:export` ← the one new IPC channel; team import ← the existing `hire:openFile` (D-17)
- daily timer ← new entry in `SHUTDOWN_STEPS` (`boot.ts:929`); digest → file + `deps.notify` +
  `postSlackDigest` (D-29, D-30)
- `agentView.ts` ← one `useFleetTelemetry` singleton + `control:breakerSnapshot` + `spawnedAt`; →
  `AgentDetailPanel`, `AgentCard`, `AgentStrip`, `FullscreenTerminal`, `CommandCenterPanel` (D-33,
  D-36)

</code_context>

<specifics>
## Specific Ideas

- **The phase's own acceptance test is the project's honesty rule.** Claims that did not survive this
  discussion's verification pass: STRUCT-02's "messaging" (D-01), the roadmap's reason for the
  SCALE-01 dependency (D-02), PARITY-02's "all eleven" (D-03), `ROADMAP.md:286`'s "both criteria then
  hold" (D-06), the 8 MB rotation as the thing that holes a day (D-21), and three stale file:line
  anchors (D-39). The planner should expect to find more, and should treat correcting a claim as
  **doing** the phase, not as deviating from it.
- **The dominant failure mode in this repo is "built, tested, rendered nowhere."** This pass found
  four existing instances plus `push.ts` as a fifth (D-38). Every new sink or sender in this phase
  ships with its caller in the same commit, and every assertion carries a positive lower bound.
- **Two of the five requirements cannot be closed in this phase, and that is a designed outcome, not
  a failure** (D-05, D-07). The phase's job is to make the residual *owned* rather than *prose*.
- **Three decisions are load-bearing against the same trap** — a feature whose tests pass while its
  effect is nil: the breaker snapshot (D-36), the digest routed through `deps.send` (D-30), and the
  `'agent'` memory scope (D-14). All three fail *silently* and in the safe-looking direction.
- **The $0 rule held without strain.** All eight advisor tracks returned an empty `new_dependencies`
  list; every recommendation uses better-sqlite3, `node:https`, `dialog`, and DOM primitives that are
  already installed.

</specifics>

<deferred>
## Deferred Ideas

- **Simultaneous side-by-side floors** (per-userData launcher, per-floor port bindings for
  hookServer/slack/webhook/OTel, re-keying `requestSingleInstanceLock`). Additive on top of D-08's
  boundary, but it must first solve the `claudeAccounts` forking problem — two live projects rotating
  the same subscription account with neither pool aware of the other (D-13).
- **Per-floor roster partitioning.** One `RosterStore` serves the whole app and `RosterStore`'s
  empty-guard is per-process, so a second multiWindow floor can flatten the live `roster.json`.
  Orthogonal to memory isolation and still open — a plan claiming "floors are isolated" without this
  will be wrong for an unrelated reason.
- **`doneAt` on `HiveTask`** — needed for "tasks completed yesterday" in the digest (D-31). A ledger
  schema change with several concurrent writers; its own decision.
- **Collapsing the two duplicate main-process joins** (`hive:agentDirectory` and
  `writeFleetSnapshot`). D-36 removes their cost disagreement but leaves them two builders of one
  row; they will drift again.
- **Cumulative-across-respawn cost.** `telemetry.forget(id)` drops the accumulator on teardown and
  there is no read API for the durable ledger, so the card's cost means "since this spawn" (D-33).
  A ledger-read IPC is future work.
- **Deleting or declaring dead `usage.ts`'s `UsageProvider`/`StubUsageProvider`** — zero
  instantiations anywhere; new cost work routes through `telemetry.getAgentUsage`.
- **Tool spans on the timeline.** `telemetry.ts` persists nothing and spans are a 200-deep in-memory
  ring, so yesterday's spans do not exist on disk. Belongs with RECORD-02.
- **Bundled preset teams in `resources/teams/`** — content, not mechanism, once team@1 exists (D-15).
- **Per-member cwd in team@1** — v1 is one operator-picked root for the whole team.
- **Wiring the `'agent'` memory scope** (D-14) — ~5 lines, but it belongs with Phase 5's RECALL-02,
  which replaces the mechanism anyway.

### Reviewed Todos (not folded)
- `gsd-sdk query todo.match-phase 3` returned `todo_count: 0` — no todos to fold or defer.

</deferred>

---

*Phase: 03-scale-and-observability*
*Context gathered: 2026-08-24*
