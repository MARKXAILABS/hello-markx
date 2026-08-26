# Phase 3: Scale and Observability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `03-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-08-24
**Phase:** 03-scale-and-observability
**Mode:** `--auto` (no `AskUserQuestion`; every area auto-resolved to the researched recommendation)
**Areas discussed:** execution order, Phase-2 dependency status, SCALE-01 isolation, SCALE-02 team
template, SCALE-03 storage, SCALE-03 surface, SCALE-04 digest, SCALE-05 agent card

**Method.** Eight ground-truth agents measured live source at `f04f9ec` (file:line evidence only, no
quoting from ROADMAP/REQUIREMENTS/SUMMARY), then eight advisor agents produced comparison tables from
that ground truth. 16 agents, 0 errors, ~1.68M subagent tokens, 587 tool calls, 11 min wall-clock.
The orchestrator then **re-verified every load-bearing claim against source** before locking — see
"Orchestrator verification" at the end.

---

## Phase execution order vs. two forward dependencies

| Option | Description | Selected |
|---|---|---|
| A | Numeric order, residual tracked as prose (ROADMAP's option 2, verbatim) | |
| B | Re-order to 1→2→4→5→3→6 (ROADMAP's option 1) | |
| C | Numeric order, and the re-verification gets a phase id instead of a prose line | ✓ |
| D | Split Phase 3 into 3a (no forward deps) and 3b (after Phase 5) | |

**Auto-selected:** C — recommended, and consistent with the default already recorded in ROADMAP.md
and STATE.md's Pending Todos.
**Notes:** B was rejected on a measurement, not a preference: `RECALL-02` is memory-only
(`grep "task ledger" REQUIREMENTS.md` → exactly one hit, SCALE-01 itself), so re-ordering does not
make SCALE-01 hold — `ROADMAP.md:286` is overstated. A was rejected on this repo's own track record
with unowned prose residuals (FLOOR-06, FLOOR-02, FLOOR-05, issue #18 — all still open). D is C with
a phase split, for the same ownership guarantee at higher cost.

---

## Phase 2 dependency status (STRUCT-02, PARITY-02, DAEMON-05, plan 02-12)

| Option | Description | Selected |
|---|---|---|
| A | Checkbox baseline: plan Phase 3 against REQUIREMENTS.md as written | |
| B | Measured baseline: run 02-12 first, then a plan-00 closing the two real source holes | ✓ |
| C | Finish the dependencies first — extract messaging + wire all eleven engines to cost | |
| D | Narrow SCALE-01 to the floor switcher that already ships | |

**Auto-selected:** B.
**Notes:** C is not merely expensive, it is **not buildable** — converting a hooks-bridged engine to
a proxy bridge deletes its mail bridge (`ensureAgent` dispatches hooks XOR proxy), which
`test/engine-parity.test.cjs:826` exists to catch. D fails the honesty rule and does not fix the leak
anyway, because `harness.db` is app-global and survives every `changeHome`. A would close three of
five criteria against surfaces that do not hold.

---

## SCALE-01 — what separates two projects

| Option | Description | Selected |
|---|---|---|
| A | Home-scoped data root — finish the `harnessHome` boundary that already exists | ✓ |
| B | `workspace` column in `memory_fts`, scope bound server-side at the IPC boundary | |
| C | Separate userData directory per project (`--user-data-dir` / `app.setPath`) | |
| D | Separate daemon/main process per floor, one shell UI | |

**Auto-selected:** A.
**Notes:** B is the trap — `autoMode` ships ON (`config.ts:464`), so every agent has an unsandboxed
Read and can `cat` past any `WHERE` clause; it also misses `mempalace`, the path agents actually use.
C is the only option buying simultaneity, and it buys it by forking `claudeAccounts` into one pool
per project — a correctness regression under the one-subscription constraint. D pays with every port
and socket in the app to reach the isolation a folder path already provides.

---

## SCALE-02 — creating a populated floor in one action

| Option | Description | Selected |
|---|---|---|
| A | Import-only `team@1` JSON through the existing `hire:openFile` channel | |
| B | Round-trip: import + "Export this floor as a team", deliberately lossy | ✓ |
| C | Built-in preset team shapes bundled in `resources/teams/*.json` | |
| D | Bulk CSV / clipboard paste | |

**Auto-selected:** B.
**Notes:** A ships a format with no producer — precisely the failure already in the tree
(`OnboardingWizard.tsx:77` advertises an "Agent Gallery" that exists nowhere). Export is the only
producer that cannot drift. D would put a second, weaker parser next to a security-critical one with
three recorded prior escapes; YAML was disqualified outright as a new npm dependency.

---

## SCALE-03 — what the timeline replays FROM

| Option | Description | Selected |
|---|---|---|
| A | Range-query reader over the files that already exist (no new store) | |
| B | `events` table as MIGRATION #3 in PersistStore, fed by an injected sink | ✓ |
| C | New day-partitioned append-only event log (`events/YYYY-MM-DD.jsonl`) | |

**Auto-selected:** B.
**Notes:** A is genuinely tempting under the laziness ladder and its *read* fix should ship anyway,
but it cannot carry a floor column or a cost join. C would be a sixth time-ordered store in an app
that already has five with no join key. B needs zero new dependencies — better-sqlite3 is installed,
N-API, with prebuilds on all three CI platforms.

---

## SCALE-03 — the shape of the timeline surface

| Option | Description | Selected |
|---|---|---|
| A | Day band + native range scrubber + per-bucket detail list | ✓ |
| B | Hand-rolled virtualized DOM event list, scrubber drives scroll | |
| C | Lane-per-agent SVG-rail Gantt, extending the CommitGraph pattern | |
| D | Pixi.js canvas track reusing the floor renderer | |

**Auto-selected:** A.
**Notes:** B does not exist as an option — there is no windowing library and the lockfile is frozen,
so it is a request to hand-roll windowing whose core behaviour `renderToStaticMarkup` structurally
cannot assert. C breaks the 14px floor's vertical budget at 11+ agents and its overflow answer
(clamp-into-last-lane) silently merges distinct agents. D reintroduces a **measured** bug —
`glRecovery.ts:9-18` records the ~16 WebGL context cap with the floor's context evicted first and
Pixi reporting nothing.

---

## SCALE-04 — the daily digest channel and scheduler

| Option | Description | Selected |
|---|---|---|
| A | Digest file + OS toast only (no network) | |
| B | Digest file + OS toast + optional Slack post via a new sibling sender | ✓ |
| C | Telegram bot `sendMessage` or a Discord incoming webhook | |
| D | Finish the PWA web-push path (`push.ts` is already written and vector-tested) | |

**Auto-selected:** B — a superset of A whose delta is one sibling function and two config fields.
**Notes:** D is not "more work", it is work that is **still broken after it ships**: subscriptions
are origin-bound and the tunnel mints a new hostname every restart; phone pairing is in-memory and
404s until a human presses pair; and the service worker hardcodes its body, so the push could never
carry the digest anyway. C is not an "existing channel" — grep for `api.telegram.org` / `discord.com/api`
returns zero hits.

---

## SCALE-05 — the single consolidated agent card

| Option | Description | Selected |
|---|---|---|
| A | One shared `<AgentCard>` component rendered by all renderings | |
| B | One pure selector module `store/agentView.ts` (the `autoMode.ts` pattern) | ✓ |
| C | Normalized view-model in `src/shared/`, built in main and pushed to the renderer | |
| D | Build the consolidated card in `AgentDetailPanel` only, pin the rest with a drift test | |

**Auto-selected:** B.
**Notes:** A is physically impossible for two of the six renderings (`OfficeFloor` is a Pixi scene
graph) and cannot fix the actual defect, which is in **derivation**, not markup. C is pull-only and
structurally cannot carry what main does not own (`blockReason`, operator control state, the account
*label*), so the renderer would still join — two sources, the very ambiguity SCALE-05 exists to
delete. D satisfies the requirement's wording by adding a **sixth** derivation, which this project
calls quiet narrowing.

---

## Claude's Discretion

Auto-mode resolved every gray area to its researched recommendation. Left to the planner: plan
slicing and wave assignment; disjoint file-ownership lists; the day band's bucket granularity and
detail-row cap (explicitly unmeasured); whether the events sink batches in one transaction; the
team@1 member cap and duplicate-name defaulting; whether existing installs' `command_history`/`kv`
are copied forward or the one-time loss is declared; the digest hour and arm-splitting. See
CONTEXT.md §"Claude's Discretion".

## Deferred Ideas

Simultaneous side-by-side floors; per-floor roster partitioning; `doneAt` on `HiveTask`; collapsing
the two duplicate main-process joins; cumulative-across-respawn cost; deleting the dead
`UsageProvider`; tool spans on the timeline; bundled preset teams; per-member cwd in team@1; wiring
the `'agent'` memory scope. See CONTEXT.md §"Deferred Ideas" for the reasoning on each.

## Orchestrator verification

Re-run against source in this session rather than trusted from the agent reports. All confirmed:
`hive.ts` = 2,821 lines with `gitCommitter.ts`/`hiveProvisioning.ts`/`hiveTemplates.ts` extracted but
`routeMessage`/`emitMessage`/`terminalHandoff`/`startRouter`/`stopRouter`/`routeOnce` still in
`hive.ts`; `costTracking` = 7 `none` / 1 `otel` / 2 `proxy` / 1 `transcript`; `LOG_ROTATE_BYTES` at
`hive.ts:323` with `hive.ts:267` being `seedPrompt?: string;`; `LOG_TAIL_BYTES` at `hive.ts:326`;
`harness.db` at `db.ts:121`; `memory_fts` with no floor column; `floorId|floor_id|windowId` = 0 hits;
`autoMode: true` at `config.ts:464`; zero `scope` fields in `HarnessConfig` and `boot.ts:1137`
passing only `{enabled, model}`; `KG_ROOT` at `knowledge.ts:71`; context thresholds 85/65 at
`FullscreenTerminal.tsx:533` vs 88/75 at `CommandCenterPanel.tsx:853`;
`shouldQuitOnLastWindowClose = platform !== 'darwin' && !headless`.

**One agent claim corrected by the orchestrator:** the `deps` advisor described the breaker inputs at
`boot.ts:437-446` as "unguarded" while implying `:430` also gated the ledger write. Read directly:
`:429` gates `appendCostLedger` on `sample?.sessionId`, `:430` opens a separate `sessionId`-gated
block for session recording, and the breaker's `inputs.push({...})` at `:441` is genuinely
**outside** both. The net effect the advisor asserted is correct — codex spend reaches the breaker
but never the ledger — but the line attribution needed fixing before it was locked into D-36.

**Two agent claims corrected on detail:** `LOG_TAIL_BYTES` is at `hive.ts:326`, not `:325`; and
`useFleetTelemetry` has **four** call sites, not five (the fifth grep hit is the definition at
`useTelemetry.ts:91`).

**One agent claim refuted by the orchestrator:** the `deps` advisor recorded "Whole-suite pass/fail
was not measured this session; STATE.md's figures are doc claims." It was measured, before the
fan-out launched — `npm test` → 800/793/0 fail/7 skipped, `npm run typecheck` → 0 errors.
