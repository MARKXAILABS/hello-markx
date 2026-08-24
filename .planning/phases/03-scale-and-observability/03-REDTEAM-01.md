# Phase 3 — Red-Team Round 1 (consolidated findings)

**Date:** 2026-08-24  ·  **Run:** `wf_b925850b-d70`  ·  8 hostile lenses → 109 findings raised → adversarial verification by independent skeptics → **41 confirmed**, 68 refuted.

**Confirmed:** 3 BLOCKER · 19 HIGH · 18 MED · 1 LOW

Each finding below survived a skeptic agent that was prompted to REFUTE it and to default to `refuted=true` when it could not confirm. The three BLOCKERs were then re-verified a third time by the orchestrator against live source.

> **Systemic finding — read this before fixing anything individually.** Roughly a dozen of the confirmed items (#5, #10, #11, #12, #13, #20, #21, #23, #26, #27, #32, #39) are the SAME defect class: an acceptance criterion whose grep already returns 0 *before any work is done*, so skipping the edit produces identical green output. `03-CONTEXT.md` D-38 already requires a POSITIVE lower bound (`count >= 1`) beside every negative, precisely to stop this. Fix the class, not just the instances: every criterion in every plan must be re-read with the question *"if the executor did nothing, would this go red?"*

---

## #1 — [BLOCKER] Three plans' frontmatter mechanically ticks SCALE-01 and SCALE-03, which D-07 forbids

**Plan:** 03-01-PLAN.md frontmatter, 03-03-PLAN.md frontmatter, 03-09-PLAN.md frontmatter

**Evidence:** 03-01-PLAN.md: `requirements: [SCALE-01]`. 03-03-PLAN.md: `requirements: [SCALE-03]`. 03-09-PLAN.md: `requirements: [SCALE-01, SCALE-03]` — in the very plan whose must_have reads "SCALE-01 and SCALE-03 remain Pending in REQUIREMENTS.md". 03-CONTEXT.md:118 D-07: "SCALE-01 and SCALE-03 are NOT ticked in Phase 3." The tick is not advisory: C:\Users\Alienware\.claude\get-shit-done\workflows\execute-pl

**Failure scenario:** 03-01 completes (wave 1) → SCALE-01 flips to `[x]` / `Complete`. 03-03 completes (wave 3) → SCALE-03 flips. By the time 03-09 runs (wave 6) its own acceptance criterion `grep -n "SCALE-01" .planning/REQUIREMENTS.md | grep -i "pending"` matches 0 and the plan fails — or the executor 'fixes' it by hand and 03-09's own frontmatter re-ticks both at its completion step. Either way the phase ships REQUI

**Fix:** Delete the `requirements:` field from 03-01, 03-03 and 03-09's frontmatter entirely (the workflow step says "If no requirements field, skip"). Record the SCALE-01/SCALE-03 association in prose inside the plan body only. Add an explicit acceptance criterion to 03-09 asserting `grep -c '^- \[ \] \*\*SCALE-01\*\*' .planning/REQUIREMENTS.md` is 1 and the same for SCALE-03, run AFTER every other plan in the phase.

**Why it survived refutation:** Could not refute — every link in the chain re-verified in this session, and the reviewer actually undercounted the affected plans.

1) D-07 is where claimed. `03-CONTEXT.md:118`: "**D-07:** **SCALE-01 and SCALE-03 are NOT ticked in Phase 3.** They stay Pending in `REQUIREMENTS.md` with the owner column naming the new phase — never 'later'."

2) The frontmatter ticks are real. Grep across all nine plans:
- 03-01-PLAN.md:19 `requirements: [SCALE-01]`
- 03-03-PLAN.md:16 `requirements: [SCALE-03]`
- **03-07-PLAN.md:13 `requirements: [SCALE-03]`** — a FOURTH offender the reviewer missed
- 03-09-PLA

---

## #2 — [BLOCKER] 03-07 consumes a `firstTs` field that its producer 03-03 never creates — and 03-07 cannot add it without violating file ownership

**Plan:** 03-07-PLAN.md (wave 4, depends_on 03-03) <interfaces> + must_haves truth #4; 03-03-PLAN.md (wave 3) Task 3

**Evidence:** 03-07-PLAN.md:105-107 states verbatim: "Preload contract (landed in 03-03):" / `hiveTimeline: (day: string) => Promise<{ buckets: Array<{events:number; envelopes:number; usd:number; truncated?:boolean}>; firstTs: number | null }>`. Verified this session: `grep -n "firstTs\|first timestamp\|earliest" .planning/phases/03-scale-and-observability/03-03-PLAN.md` returns exactly ONE hit, line 21 ("still

**Failure scenario:** Wave 3 lands `hive:timeline` without `firstTs`. Wave 4's 03-07 executor reaches its own behavior clause at 03-07-PLAN.md:125-134 — "Given a 96-bucket day summary with a `firstTs` later than midnight, ... the DOM sentence beneath the band reads exactly `No record before {HH:mm} — missing, not quiet.`" and "Given a day with genuinely zero events ... AND `firstTs` before the day started ... the two m

**Fix:** Add `firstTs: number | null` to 03-03's `hive:timeline` response contract explicitly — it is a one-line `SELECT MIN(ts) FROM events` and must be stated in 03-03 Task 3's <behavior> and <action>, with an acceptance criterion `grep -n "firstTs" src/main/index.ts` matching `>= 1`. Note 03-03's own retention delete (must_haves truth #5) makes MIN(ts) move over time, so the semantic must be 'earliest ts still stored', not 'first event ever'.

**Why it survived refutation:** Independently confirmed; could not refute. (1) `grep -rn "firstTs"` across the whole phase-03 planning dir returns hits ONLY in 03-07-PLAN.md (106, 125, 126, 132) — 03-03, 03-CONTEXT, 03-UI-SPEC, 03-VALIDATION, 03-RESEARCH have zero. (2) 03-03's only "earliest" hit is line 21, a must_haves truth about the >8MB driver test, exactly as the reviewer said. (3) 03-03 Task 3 <behavior> (:267-270) defines the summary as events count + envelopes count + diffed cost per bucket, "never raw rows"; its <action> (:281-292) and all five acceptance criteria (:294-298) never mention a first/earliest timestamp

---

## #3 — [BLOCKER] The transcript-fallback cost fix writes the NEIGHBOUR's Claude spend into cost-ledger.jsonl, because resolveCodexHome is never injected in production

**Plan:** 03-02-PLAN.md Task 2 — "change `if (sample?.sessionId) hive.appendCostLedger(sample);` to `if (sample) hive.appendCostLedger(sample);` — append whenever ANY sample exists, transcript-fallback included"; must_have "A transcript-tier engine's cost sample reaches cost-ledger.jsonl"

**Evidence:** `grep -rn resolveCodexHome src/main/index.ts src/main/floor/boot.ts` returns NOTHING (exit 1). The only production construction is src/main/floor/boot.ts:1010-1013, which passes `emit` and `resolveCwd` ONLY. src/main/telemetry.ts:184 documents it as "Wired in index.ts, next to `resolveCwd`" — it is not. src/main/telemetry.ts:625-630: "Codex first: its rollouts live under the agent's own CODEX_HOME

**Failure scenario:** A codex agent shares a cwd with a claude agent (the normal case — both work the same repo). `resolveCodexHome?.()` is undefined → `codexHome` is null → `readAgentUsage(cwd)` reads the CLAUDE transcripts in that directory and returns them as the codex agent's usage with `sessionId: ''`. Today `if (sample?.sessionId)` blocks the write, so the bad number never lands. After this plan's widened gate, t

**Fix:** Add a task that wires `resolveCodexHome` at src/main/floor/boot.ts:1010 (the codex-home resolver the registry/spawn path already computes) BEFORE widening the gate, and add an acceptance criterion `grep -c resolveCodexHome src/main/floor/boot.ts >= 1`. Gate the widened append on `sample && (sample.sessionId || telemetry.hasOwnUsageSource(id))` rather than on `sample` alone, and add a test that constructs a real TelemetryCollector with two agents sharing one cwd and asserts the codex agent's ledg

**Why it survived refutation:** Independently confirmed, and the defect is broader than claimed. (1) `resolveCodexHome` is genuinely unwired: `src/main/floor/boot.ts:1010-1012` is the only `new TelemetryCollector(...)` in the tree and passes only `emit` and `resolveCwd`; `src/main/index.ts:70` imports the class but never constructs it; `grep -rn resolveCodexHome src/ test/` hits only telemetry.ts (interface/field/assign/use) and `test/engine-parity.test.cjs:931`. The doc comment at `telemetry.ts:184` ("Wired in index.ts, next to resolveCwd") is false. (2) `telemetry.ts:629-631` therefore always takes the `readAgentUsage(cwd)

---

## #4 — [HIGH] 03-02's widened cost-ledger gate charges a card the entire historical cwd spend and can double-count across agents

**Plan:** 03-02-PLAN.md Task 2 ("the getAgentUsage gate fix so transcript-tier spend reaches the ledger")

**Evidence:** Plan asserts: "Two consecutive transcript-fallback samples for the same agent, both `sessionId: ''`, diff correctly via `applyCostRow`'s existing `(agent_id, session_id)` keying ... and the clamped diff still holds (never a negative, never a double-count)." Refuted at src/main/hive.ts:2613-2618: `const previous = cumulative.get(key); const delta = previous ? {…} : now;` — the FIRST row for a key c

**Failure scenario:** A codex/transcript-tier agent is dispatched a card with `budgetTokens` set, in a repo cwd that already holds 40M tokens of prior Claude transcripts. On the first ~30s breaker beat after this change, `appendCostLedger` fires for a `sessionId: ''` sample; `applyCostRow` sees no predecessor for key `agent\0` and credits the WHOLE 40M-token / $N historical total to the card that is in flight right now

**Fix:** Do not widen the gate unconditionally. Either (a) keep transcript-fallback samples out of `cost-ledger.jsonl` and fix the display join only, or (b) seed the cumulative baseline before the first ledger append for a fallback series — write one `task_id: null` baseline row (applyCostRow already returns early on a null task_id after advancing the baseline, hive.ts:2620-2621) so the first task-attributed row is a real diff, and key the series on the cwd rather than the agent so two agents sharing a c

**Why it survived refutation:** CONFIRMED in mechanism, DOWNGRADED in severity. applyCostRow's first-row-is-its-own-value rule (hive.ts:2613-2618) is correct for an OTel session accumulator that truly starts at zero, but the transcript series does not: readAgentUsage(cwd) (transcript.ts:299-320) returns the all-time, all-session sum of every .jsonl under the cwd's project dir, and transcriptFallback hands it over as sessionId: '' (telemetry.ts:625-645). Once 03-02 Task 2 removes the `sample?.sessionId` gate at boot.ts:429, the first such row for an agent opens a brand-new `agentId\0''` key with no predecessor, so the entire 

---

## #5 — [HIGH] 03-01 Task 3's HivePicker criterion is satisfied by the false sentence it is supposed to replace

**Plan:** 03-01-PLAN.md Task 3 acceptance criteria

**Evidence:** Criterion as written: "`grep -n "one project runs at a time\|does not run.*simultaneously\|side by side" src/renderer/src/components/HivePicker.tsx` matches `>= 1`". Verified this session, src/renderer/src/components/HivePicker.tsx:82 already reads: "Each config is separate and self-contained, so you can run different setups side by side." That line already matches the `side by side` alternative, 

**Failure scenario:** The executor runs the acceptance greps, sees green, and ships. HivePicker still tells the operator, in the dialog they use to pick a project, that they can "run different setups side by side" — the exact claim D-13 says is false and that 03-01's own must_have ("HivePicker.tsx both say so") was written to kill. The phase's honesty test passes while the UI lies, which is the cardinal invariant inver

**Fix:** Rewrite HivePicker.tsx:82 to drop "side by side" (e.g. "Each config is separate and self-contained. Only one runs at a time — switching relaunches the app into it."), and replace the criterion with one that cannot be satisfied by the old text: `grep -c "side by side" src/renderer/src/components/HivePicker.tsx` == 0 AND `grep -c "Only one runs at a time" src/renderer/src/components/HivePicker.tsx` >= 1.

**Why it survived refutation:** Independently confirmed all cited evidence this session. (1) HivePicker.tsx:82 reads verbatim "Each config is separate and self-contained, so you can run different setups side by side." — grep -n "side by side" src/renderer/src/components/HivePicker.tsx returns exactly that one hit. (2) 03-01-PLAN.md:264 acceptance criterion is `grep -n "one project runs at a time\|does not run.*simultaneously\|side by side" src/renderer/src/components/HivePicker.tsx` matches `>= 1` — the third alternative matches line 82 today, so the gate is green before any edit and would stay green if the new honest senten

---

## #6 — [HIGH] 03-02's per-agent usage swap makes every transcript-fallback agent read 'active 0s ago' forever

**Plan:** 03-02-PLAN.md Task 2 ("replace the `usageById.get(id)` lookup ... with a direct `telemetry.getAgentUsage(id)` call per agent")

**Evidence:** Verified src/main/telemetry.ts:634-644: `transcriptFallback` returns `{ agentId, sessionId: '', ts: Date.now(), ... }` — its `ts` is the time of the READ, not of any activity. Verified the two consumers the plan rewires: src/main/floor/boot.ts:496 `lastActiveSecAgo: u ? Math.round((now - u.ts) / 1000) : null` and src/main/index.ts:3480 `lastActiveSecAgo: u ? Math.round((now - u.ts) / 1000) : null`

**Failure scenario:** A codex agent finishes its work at 09:00 and idles. At 17:00 the operator opens the fleet view: `getAgentUsage` falls back to the transcript reader, which stamps `ts: Date.now()`, so `lastActiveSecAgo` computes to 0. Michael's fleet snapshot and the agent directory both report the agent as active this second, for the rest of the process's life — and this is the same file the god reads to decide wh

**Fix:** Keep the `telemetry.snapshot()`-sourced map for the freshness-derived fields and use `getAgentUsage(id)` only for `tokens`/`usd`; or add an explicit `fromFallback` discriminator to `AgentUsageSample` and have both joins emit `lastActiveSecAgo: null` when it is set. Add a test asserting a fallback-only agent reports `lastActiveSecAgo === null`, not 0.

**Why it survived refutation:** Independently confirmed; could not refute. (1) src/main/telemetry.ts:624 transcriptFallback stamps `ts: Date.now()` (line 637), and src/main/transcript.ts:161-170 shows AgentUsage carries NO timestamp — so there is genuinely no activity time available, the ts is purely read-time. (2) Both consumers the plan rewires compute freshness from that ts: src/main/floor/boot.ts:493 and src/main/index.ts:3480 are both exactly `lastActiveSecAgo: u ? Math.round((now - u.ts) / 1000) : null`, with `now` captured before the loop, so post-swap the value is -0 and renders "0s ago". (3) The consumer is dispatch

---

## #7 — [HIGH] 03-07's 'missing, not quiet' honesty declaration reads a `firstTs` field 03-03 never specifies

**Plan:** 03-07-PLAN.md `<interfaces>` preload contract vs 03-03-PLAN.md Task 3

**Evidence:** 03-07 `<interfaces>` states the contract it depends on: "`hiveTimeline: (day: string) => Promise<{ buckets: Array<{events:number; envelopes:number; usd:number; truncated?:boolean}>; firstTs: number | null }>`". 03-03 Task 3 — the plan that builds `hive:timeline` — never mentions `firstTs` in its `<behavior>`, `<action>` or `<acceptance_criteria>`; its only stated contract is "returns exactly 96 bu

**Failure scenario:** 03-03 lands and passes every acceptance criterion without emitting `firstTs`. 03-07 (wave 4, same wave, `depends_on: ["03-03"]`) reads `res.firstTs`, gets `undefined`, and the gap logic falls through: a day that predates the events table's first row — every day before this phase shipped, and every day older than `EVENTS_RETENTION_DAYS` — renders the "was quiet" empty state instead of "No record be

**Fix:** Add `firstTs` (and `retentionCutoffTs`) to 03-03 Task 3's `<behavior>`, `<action>` and acceptance criteria — e.g. `grep -n "firstTs" src/main/index.ts` >= 1 plus a db-fts test asserting `hive:timeline` on an empty events table returns `firstTs: null`. Also make 03-07 render the missing-not-quiet copy when `firstTs` is null or absent, never the quiet-day copy, so a contract miss fails loud.

**Why it survived refutation:** I tried to refute it and could not. Verified in this session:

1. 03-03-PLAN.md Task 3 is the only place `hive:timeline` is built. Its `<behavior>` (line 267) reads "`hive:timeline` given a day range returns exactly 96 bucket summaries (15-minute buckets ...), each with an events count, an envelopes count ... and a diffed cost total for that bucket — never raw rows." Its `<action>` (lines ~283-292) and acceptance criteria (lines 294-298: `ipcMain.handle('hive:timeline'` >= 1, `ipcMain.handle('hive:timelineBucket'` >= 1, `hiveTimeline\|hiveTimelineBucket` in preload >= 2, `truncated` >= 1, `nod

---

## #8 — [HIGH] 03-04 ships export as "the only safe producer" with no export→import round-trip verification

**Plan:** 03-04-PLAN.md objective and Task 2

**Evidence:** Objective: "team@1's only safe producer is export, because export reads the same `PersistedAgent` records the roster already writes and cannot drift out of sync the way a hand-authored or LLM-authored file would." `stripAgentForExport` is specified to "pick ONLY `name, description, goal, character, accent, provider, model`" straight off the roster record with no validation. Verified the import sid

**Failure scenario:** An operator hires an agent with a long free-text description or a model label containing a character outside MODEL_RE (a comma, a quote), exports the team, and re-imports it. `validateHireManifest` rejects that member with `"model" contains disallowed characters` or `"description" exceeds N chars` — a file the app itself produced, rejected by the app itself, with the plan's own objective asserting

**Fix:** Have `stripAgentForExport` run each stripped member through `validateHireManifest` before writing, and either drop or truncate/normalize a member that fails, reporting the count to the operator rather than writing an unimportable file. Add an acceptance criterion: a fixture roster containing an over-cap description and an out-of-MODEL_RE model exports, and the exported bytes re-validate `ok: true` for every member.

**Why it survived refutation:** Verified every cited anchor in this session and the finding holds — the reviewer actually understated it by picking the weakest vector.

WHAT I CONFIRMED

1. The caps the reviewer cited are real. `src/shared/hire.ts:181` `capped(o.description, 200, 'description', errors)`; `:186-187` model capped at 80 then `MODEL_RE.test(model)` against `/^[A-Za-z0-9 ._()[\]\/:@+-]{1,80}$/` (`:109`); `capped()`'s length rejection at `:164` (`"${field}" exceeds ${max} chars`). The UI producing those values is uncapped free text — `AddAgentModal.tsx:1013-1019` renders Description as a bare `<input value={descri

---

## #9 — [HIGH] 03-03 Task 3: the entire timeline aggregation contract lives in index.ts, which NO test in this repo can load — every acceptance criterion is a grep an empty implementation satisfies

**Plan:** 03-03-PLAN.md Task 3 ("hive:timeline and hive:timelineBucket — bucket aggregation in main")

**Evidence:** Plan text: files are `src/main/index.ts, src/preload/index.ts, test/db-fts.test.cjs`; acceptance is 4 greps (`ipcMain.handle('hive:timeline'` >=1, `hive:timelineBucket` >=1, `hiveTimeline\|hiveTimelineBucket` >=2, `truncated` >=1) plus `node --test test/boot-floor.test.cjs`. Verified this session: `grep -rn "loadTs('src/main/index.ts')" test/` returns ZERO hits — no test file in the repo loads ind

**Failure scenario:** Executor writes `ipcMain.handle('hive:timeline', () => ({ buckets: [], firstTs: null }))` and `ipcMain.handle('hive:timelineBucket', () => ({ rows: [], truncated: false, total: 0 }))`, adds the preload entries and the two IPC names to B_IPC_NAMES. All four greps pass, boot-floor's name pin passes, db-fts passes. The plan's stated behaviours — exactly 96 buckets, envelopes = events filtered to kind

**Fix:** Put the bucket aggregation and the detail-cap logic in a loadable module (e.g. `src/main/timeline.ts`, or methods on PersistStore/HiveManager which test/db-fts.test.cjs and test/hive-durability.test.cjs already load) and make the index.ts handlers thin passthroughs. Add acceptance criteria that call the pure function directly: 96 buckets for a day fixture, an envelope-only bucket counting envelopes>0/events>0, a bucket of 312 rows returning `truncated:true, total:312, rows.length===200`, and the

**Why it survived refutation:** I tried to refute this and could not. Every cited fact checks out, and I added a stronger proof than the reviewer had.

VERIFIED THIS SESSION:
1. index.ts is genuinely unloadable — not just "no test does it", it CANNOT be done. I wrote a throwaway `loadTs('src/main/index.ts')` driver in the worktree and ran it: it fails with `electron_1.app.on is not a function` (the load-ts.cjs electron stub exposes a plain `app` object with only getPath/getName/getVersion/isPackaged, load-ts.cjs:48-53). Three separate test files record the same limit in prose: test/main-hardening.test.cjs:5-8, test/mcp-per-a

---

## #10 — [HIGH] 03-09 Task 2: the `Both criteria then hold` acceptance grep already returns 0 today — the phrase is line-wrapped in ROADMAP.md, so the criterion passes before any work is done

**Plan:** 03-09-PLAN.md Task 2, acceptance criterion: "`grep -n \"Both criteria then hold\" .planning/ROADMAP.md` matches exactly `0`"

**Evidence:** Measured this session: `grep -c "Both criteria then hold" .planning/ROADMAP.md` → **0**, with no edit made. The source text is wrapped across two lines (.planning/ROADMAP.md:284-285): line 284 ends `...(execution order \`1 → 2 → 4 → 5 → 3 → 6\`). Both` and line 285 begins `   criteria then hold under a skeptic's test on the day they are marked green.` This is the exact recorded failure class in 03

**Failure scenario:** Executor runs the acceptance criterion, sees 0, marks D-06's correction done, and writes it into 03-09-SUMMARY.md. The overstatement at ROADMAP.md:284-285 is still on disk, unedited, and the phase closes claiming an honesty correction it never made.

**Fix:** Replace with a whitespace-squeezed match over the joined file (the idiom test/boot-floor.test.cjs:418-420 `joinedStripped()` already uses: `.replace(/\s+/g,' ')`) and pair it with a positive lower bound — assert the REPLACEMENT sentence (the 'RECALL-02 is memory-only, so re-ordering does not make SCALE-01 hold' wording) is present `>= 1`, so deleting the paragraph outright fails instead of satisfying the criterion.

**Why it survived refutation:** Independently confirmed. In E:\munder-difflin\.claude\worktrees\phase-03, `grep -c "Both criteria then hold" .planning/ROADMAP.md` returns 0 with no edit made — the phrase is wrapped, line 285 ending with "Both" and line 286 beginning "criteria then hold under a skeptic's test on the day they are marked green." (reviewer said 284-285; actual 285-286 — the plan's own corrections table at 03-09-PLAN.md:79 says 286, which is where the fragment lives). So 03-09-PLAN.md:158's acceptance criterion 'matches exactly 0' is satisfied before any work, and :162's <verify><automated> folds the same dead ph

---

## #11 — [HIGH] 03-09's two headline ROADMAP acceptance criteria are already satisfied today — the greps can never fail because the target text is line-wrapped

**Plan:** 03-09-PLAN.md Task 2 <acceptance_criteria>

**Evidence:** 03-09-PLAN.md Task 2 asserts: "`grep -n \"registry/router split from STRUCT-02\" .planning/ROADMAP.md` matches exactly `0`" and "`grep -n \"Both criteria then hold\" .planning/ROADMAP.md` matches exactly `0`". Run this session against the unmodified file: `grep -c "Both criteria then hold" .planning/ROADMAP.md` → 0; `grep -c "registry/router split from STRUCT-02" .planning/ROADMAP.md` → 0. Cause v

**Failure scenario:** 03-09's executor makes zero edits to ROADMAP.md:285-286 and :293-294, runs the acceptance criteria, sees 0/0, and reports the D-02 and D-06 corrections green. The two false claims the entire plan exists to remove — 'SCALE-01 needs the registry/router split from STRUCT-02' and 'Both criteria then hold' — ship unchanged in the roadmap, and the phase closes claiming they were corrected. This also vio

**Fix:** Replace with multiline-safe checks plus a positive lower bound each, e.g. `node -e "const s=require('fs').readFileSync('.planning/ROADMAP.md','utf8').replace(/\\s+/g,' '); ..."` asserting the old phrase count is 0 AND the new corrected phrase (e.g. `hive.root()` as the isolation seam, and the 'does NOT make SCALE-01 hold' wording) matches `>= 1`. Do the same for the ROADMAP.md:283 8MB-rotation correction, which currently has no acceptance criterion at all.

**Why it survived refutation:** I re-ran both cited greps against the unmodified .planning/ROADMAP.md in this worktree and both return 0, exactly as claimed. I confirmed the cause at the byte level: "Both" ends line 285 and "criteria then hold" begins line 286; "registry/router split" ends line 293 and "from STRUCT-02" begins line 294. Single-line grep can never match either phrase, so 03-09-PLAN.md Task 2's two headline acceptance criteria are satisfied before any edit is made.

I tried to refute on four fronts and all four failed. (1) Covered elsewhere: grepping the whole phase directory for these phrases finds them only i

---

## #12 — [HIGH] Two of plan 09's four ROADMAP corrections are verified by greps that already return 0 at baseline — skipping the edits produces identical green output

**Plan:** 03-09-PLAN.md Task 2 acceptance_criteria: "`grep -n \"registry/router split from STRUCT-02\" .planning/ROADMAP.md` matches exactly `0`" and "`grep -n \"Both criteria then hold\" .planning/ROADMAP.md` matches exactly `0`"; <verify> `grep -c "hive.ts:267\|registry/router split from STRUCT-02\|Both criteria then hold" .planning/ROADMAP.md`

**Evidence:** Run this session in the worktree: `grep -c "Both criteria then hold" .planning/ROADMAP.md` → 0 (exit 1). `grep -c "registry/router split from STRUCT-02" .planning/ROADMAP.md` → 0 (exit 1). Both strings are line-wrapped in the file: ROADMAP.md:285-286 reads "...(execution order `1 → 2 → 4 → 5 → 3 → 6`). Both\n   criteria then hold under a skeptic's test...", and ROADMAP.md:293-294 reads "...needs t

**Failure scenario:** An executor edits only the `hive.ts:267 → :323` anchor, skips the D-02 and D-06 prose corrections entirely, and every acceptance criterion plus the <verify> command returns green. ROADMAP.md keeps telling every future planner that SCALE-01 needs STRUCT-02's registry/router split (refuted by D-02) and that running Phases 4/5 first makes both criteria hold (refuted by D-06) — the two claims this pla

**Fix:** Replace both with anchored positive+negative pairs against the wrapped text, e.g. assert `grep -c "hive.root()" .planning/ROADMAP.md >= 1` AND `grep -zc "registry/router split\nfrom STRUCT-02" == 0`; likewise assert the new D-06 sentence exists (`grep -c "RECALL-02 is memory-only" >= 1`) alongside `grep -zc "Both\n   criteria then hold" == 0`. Verify every plan-09 grep against the live file before locking it.

**Why it survived refutation:** Independently confirmed, and the defect is slightly worse than claimed. Both cited greps return 0 at baseline in this worktree (verified this session, exit 1 each), because both target strings are line-wrapped in ROADMAP.md: :285 ends "...`1 → 2 → 4 → 5 → 3 → 6`). Both" / :286 begins "   criteria then hold...", and :293 ends "...needs the registry/router split" / :294 begins "from STRUCT-02, and SCALE-05's...". The plan text is quoted accurately: 03-09-PLAN.md Task 2 carries both "matches exactly `0`" criteria and a <verify> of grep -c "hive.ts:267\|registry/router split from STRUCT-02\|Both c

---

## #13 — [HIGH] Plan 01's no-simultaneous-projects honesty gate is satisfied TODAY by the exact false sentence it is supposed to remove

**Plan:** 03-01-PLAN.md Task 3 acceptance_criteria: "`grep -n \"one project runs at a time\\|does not run.*simultaneously\\|side by side\" src/renderer/src/components/HivePicker.tsx` matches `>= 1`"; must_have "This plan does NOT deliver simultaneous side-by-side projects, and README.md and HivePicker.tsx both say so"

**Evidence:** src/renderer/src/components/HivePicker.tsx:82 (read this session): "Each config is separate and self-contained, so you can run different setups side by side." — `grep -n "...side by side" src/renderer/src/components/HivePicker.tsx` already matches (exit 0) with zero edits.

**Failure scenario:** The executor makes no edit to HivePicker.tsx, the criterion passes, and the shipped dialog keeps telling the operator they can "run different setups side by side" — the precise claim D-13 declares false (`app.requestSingleInstanceLock()` at index.ts:1511 quits the second process; switching relaunches). The honesty task's gate is green because of the lie. The same task's second criterion, `grep -n 

**Fix:** Make the criterion a paired assertion anchored to the NEW text and to the removal of the old: `grep -c "you can run different setups side by side" src/renderer/src/components/HivePicker.tsx` == 0 AND `grep -c "one project at a time" src/renderer/src/components/HivePicker.tsx` >= 1. Re-derive the RECALL-02 criterion the same way (assert the replacement sentence, not a token that already exists).

**Why it survived refutation:** CONFIRMED for the HivePicker half; REFUTED for the RECALL-02 half.

HivePicker (real defect): I ran the criterion's exact command at HEAD 32947de with zero edits — `grep -n "one project runs at a time\|does not run.*simultaneously\|side by side" src/renderer/src/components/HivePicker.tsx` returns exit 0 with one match, HivePicker.tsx:82 "Each config is separate and self-contained, so you can run different setups side by side." The third alternation branch is satisfied by the exact false sentence D-13 exists to remove. I verified D-13's own anchor holds: src/main/index.ts:1511 is literally `con

---

## #14 — [HIGH] team@1 export produces files that fail re-import for 8 of the 11 engines — HireProvider is a 3-value allowlist and validateHireManifest hard-rejects the rest

**Plan:** 03-04-PLAN.md Task 2 — "a new function in this same file — `stripAgentForExport(...)` — that picks ONLY `name, description, goal, character, accent, provider, model` off the input"; must_have "A team@1 file is validated by delegating each member back through the UNMODIFIED validateHireManifest"; 03-04 Task 3 UI copy "A team file carries names, engines, models and goals."

**Evidence:** src/shared/hire.ts:40 `export type HireProvider = 'claude' | 'antigravity' | 'codex';` and :93 `const PROVIDERS: readonly string[] = ['claude', 'antigravity', 'codex'];`. src/shared/hire.ts:192-196: `if (str(p) && PROVIDERS.includes(p)) provider = p as HireProvider; else errors.push(\`"provider" must be one of ${PROVIDERS.join(', ')} (or "agy")\`);` — a hard validation error, not a silent drop. sr

**Failure scenario:** Operator hires a realistic floor — say a grok, a qwen and an opencode agent — clicks `export team…`, hands the file to a teammate (or re-imports it). `validateTeamManifest` delegates each member to `validateHireManifest`, which rejects every non-claude/antigravity/codex member with `"provider" must be one of claude, antigravity, codex`. The export button silently produced a file that the app itsel

**Fix:** Either (a) widen `PROVIDERS`/`HireProvider` to the full `AgentProvider` union in the same plan (with the flag/model allowlists unchanged), or (b) have `stripAgentForExport` omit `provider` for any engine outside the hire@1 allowlist AND surface a per-member "engine not carried" note in the export result plus the UI lossiness sentence. Add a round-trip test that exports one agent per AgentProvider value and asserts `validateTeamManifest` returns ok for every member. The same stripper also silentl

**Why it survived refutation:** Independently confirmed. Source: src/shared/hire.ts:40 `export type HireProvider = 'claude' | 'antigravity' | 'codex';`, :93 `const PROVIDERS: readonly string[] = ['claude', 'antigravity', 'codex'];`, :195-196 `if (str(p) && PROVIDERS.includes(p)) provider = p as HireProvider; else errors.push(`"provider" must be one of ${PROVIDERS.join(', ')} (or "agy")`)` — a hard rejection, not a silent drop. src/shared/agentProvider.ts:24-35 declares 11 AgentProvider values, AGENT_PROVIDER_PRESETS (:227) contains all 11 ids, and AddAgentModal.tsx:773 renders every preset as a pickable Provider button — so 

---

## #15 — [HIGH] 03-02's removal of the sessionId gate bills each agent's entire pre-existing transcript history to whatever card is 'doing' on the first beat

**Plan:** 03-02-PLAN.md, Task 2 ("spawnedAt on the registry, and the getAgentUsage gate fix so transcript-tier spend reaches the ledger")

**Evidence:** Plan text: "change `if (sample?.sessionId) hive.appendCostLedger(sample);` to `if (sample) hive.appendCostLedger(sample);`" and the behavior claim "Two consecutive transcript-fallback samples for the same agent, both `sessionId: ''`, diff correctly via `applyCostRow`'s existing `(agent_id, session_id)` keying — ... the clamped diff still holds (never a negative, never a double-count)." Source, ver

**Failure scenario:** A codex agent has been running for two weeks under its per-agent CODEX_HOME and has 4M tokens of rollout history. 03-02 lands. On the very first breaker beat after upgrade, `getAgentUsage` returns the transcript fallback, `appendCostLedger` writes the first-ever row for key `a1\0''`, and applyCostRow has no predecessor for it — so the entire 4M-token lifetime total is credited as one delta to whic

**Fix:** Before the first transcript-fallback row for an agent is credited, seed `costCumulative` for key `(agentId, '')` with that sample's value and credit zero — i.e. treat the first fallback observation as a BASELINE, not as spend. Add a behavior bullet and a test asserting that the first fallback row for an agent with pre-existing history credits 0 to the active card, and that the SECOND one credits only the increment. Also state explicitly how the OTel-keyed series and the ''-keyed series avoid dou

**Why it survived refutation:** CONFIRMED, with two corrections to the reviewer's evidence.

What I verified this session:

1. The gate is real and the plan really removes it. `src/main/floor/boot.ts:429` — `if (sample?.sessionId) hive.appendCostLedger(sample);`. 03-02-PLAN.md:233-235 action text: "change `if (sample?.sessionId) hive.appendCostLedger(sample);` to `if (sample) hive.appendCostLedger(sample);`". This is the sole `appendCostLedger` call site in `src/` (grep: only boot.ts:429 outside hive.ts itself).

2. The fallback really carries an ALL-TIME total with `sessionId: ''`. `src/main/telemetry.ts:624-643` `transcrip

---

## #16 — [HIGH] The retention test as specified passes even if the retention delete removes nothing — the only bound on the second unbounded store is unfalsifiable

**Plan:** 03-03-PLAN.md Task 1 ("migration #3 — the events table, its indexes, and retention"); 03-CONTEXT.md D-23

**Evidence:** Plan behavior, in full: "A retention delete (`DELETE FROM events WHERE ts < ?`, N days) runs once on `open()` ... and does not delete a row inserted one millisecond ago." That is the ONLY retention assertion. The acceptance criterion is a presence grep: "`grep -n \"DELETE FROM events WHERE ts\" src/main/db.ts` matches `>= 1`". D-23 (03-CONTEXT.md:247-249): "Without it this becomes the app's *secon

**Failure scenario:** The executor writes `DELETE FROM events WHERE ts < ?` with a seconds-vs-milliseconds unit mismatch (bind `Date.now()/1000 - N*86400` against a column written as `Date.now()` ms), or binds the cutoff with the comparison inverted, or the statement is created but never `.run()`. Every specified assertion still passes: the grep matches, and the just-inserted row is not deleted (nothing is deleted). Th

**Fix:** Add the positive half: insert a row with `ts = Date.now() - (EVENTS_RETENTION_DAYS + 1) * 86400000`, close, reopen, and assert that row is GONE while a fresh one survives — count `>= 1` surviving and exactly `0` expired. Per the standing positive-lower-bound rule, the retention assertion needs a case that fails when retention is deleted, and 'a fresh row survives' is satisfied by a no-op.

**Why it survived refutation:** Verified every cited anchor in this session; the finding holds, and is slightly worse than stated.

1. The quoted evidence is accurate. 03-03-PLAN.md:174-176 is the ONLY behavioral retention assertion: "A retention delete (`DELETE FROM events WHERE ts < ?`, N days) runs once on `open()` (or as part of the same migration's transaction — the executor's call, documented with a comment either way) and does not delete a row inserted one millisecond ago." 03-03-PLAN.md:194 is the only structural one: "`grep -n \"DELETE FROM events WHERE ts\" src/main/db.ts` matches `>= 1`". Line 24 is the must_have 

---

## #17 — [HIGH] 03-07 writes the scrubber CSS to a path that does not exist — the file is src/renderer/src/design/global.css, and every acceptance check still passes

**Plan:** 03-07-PLAN.md frontmatter files_modified:10, Task 3 <files>:213, <read_first>:214, acceptance_criteria:224

**Evidence:** 03-07-PLAN.md:10 lists `- src/renderer/src/global.css`; :213 `<files>src/renderer/src/components/CommandCenterPanel.tsx, src/renderer/src/global.css</files>`; :224 `- \`grep -n "\.cth-scrub" src/renderer/src/global.css\` matches \`>= 1\``. Verified this session: `find src -name "*.css"` returns ONLY `src/renderer/src/design/global.css` and `src/renderer/src/design/tokens.css`. `src/renderer/src/gl

**Failure scenario:** The executor follows Task 3 literally and creates a NEW `src/renderer/src/global.css` containing the `.cth-scrub` block. Nothing imports that file (only `design/global.css` is in the bundle), so the scrubber ships with Chromium's default range styling: no 24px thumb, so the WCAG 2.2 SC 2.5.8 minimum-target guarantee UI-SPEC S1c claims (`width: 24px; height: 24px; /* WCAG 2.2 SC 2.5.8 minimum targe

**Fix:** Replace all four occurrences of `src/renderer/src/global.css` in 03-07-PLAN.md with `src/renderer/src/design/global.css`, and add a positive lower-bound acceptance check that the file the app actually imports is the one edited — e.g. `grep -c "design/global.css" src/renderer/src/main.tsx` (or wherever the import lives) `>= 1` alongside the `.cth-scrub` grep.

**Why it survived refutation:** Tried to refute; the evidence holds on every point I re-checked this session.

CONFIRMED FACTS:
1. The path in the plan is wrong. `E:\munder-difflin\.claude\worktrees\phase-03\.planning\phases\03-scale-and-observability\03-07-PLAN.md` names `src/renderer/src/global.css` in exactly the four places claimed — frontmatter `files_modified` :10, Task 3 `<files>` :213, `<read_first>` :214, and acceptance criterion :224 (`grep -n "\.cth-scrub" src/renderer/src/global.css` matches `>= 1`). Line :219 also says "to `global.css`".
2. That file does not exist. `git ls-files "*.css"` returns exactly two pat

---

## #18 — [HIGH] 03-07 Tasks 1 and 2 route data-dependent assertions through renderToStaticMarkup, which structurally cannot produce them, and specify no injection seam

**Plan:** 03-07-PLAN.md Task 1 <action> and Task 2 <behavior>/<action>; 03-VALIDATION.md SCALE-03 row "Gap marker renders the real truncated count"

**Evidence:** 03-07-PLAN.md Task 1 <action>: "Extend `test/renderer-components.test.cjs` with `renderToStaticMarkup` assertions for the `aria-label` string shape, the two distinct gap-cause sentences, and the absence of any `<text>` element inside the SVG." Task 2 <behavior>: "Selecting a bucket (via `window.cth.hiveTimelineBucket`) that returns `truncated: true, total: 312` renders a LAST `<li>` reading `Showi

**Failure scenario:** Executor writes DayBandTab fetching in `useEffect`. Under `renderToStaticMarkup` the summary and bucket state are still null, so the markup contains no counts, no `firstTs`, no gap sentence and no truncation `<li>`. Every assertion Task 1 and Task 2 mandate fails to find its string. The executor's cheapest escape is to downgrade the tests to greps over the source file (which the acceptance criteri

**Fix:** Give DayBandTab an explicit optional data prop (e.g. `summary?: DaySummary; bucket?: BucketDetail`) that the production mount leaves undefined and the test supplies, mirroring 03-08's seeding-seam requirement; state it in <interfaces> and in both tasks' <action>. Then the aria-label, both gap sentences and the truncation `<li>` are genuinely first-pass markup.

**Why it survived refutation:** CONFIRMED, but narrower than claimed. Verified this session: 03-07-PLAN.md Task 2 <behavior> (:176-177) routes the truncation case explicitly through `window.cth.hiveTimelineBucket` returning `truncated: true, total: 312`, and Task 2 <action> (:194-195) then mandates "the truncation-`<li>` assertion from <behavior>" be added to test/renderer-components.test.cjs. That file's stated ceiling (:24-40, re-read) is a server render with no effect phase and no state commits, and the file contains ZERO occurrences of `window` or `cth` — its only seam, `seedServerSnapshot` (:137-159), seeds the zustand 

---

## #19 — [HIGH] team@1 has NO member-count cap anywhere; 03-06's T-03-06b claims one exists, and spawnBatch turns that gap into an unbounded concurrent PTY spawn from an untrusted file

**Plan:** 03-04-PLAN.md Task 1 (validateTeamManifest / TEAM_MAX_BYTES) + 03-06-PLAN.md Task 2 + threat register T-03-06b

**Evidence:** 03-06-PLAN.md:266 asserts: "T-03-06b | Denial of Service | a large team file rendering hundreds of rows | mitigate | The member cap lives in the validator (03-04, 256KB byte cap bounds worst-case member count)". 03-04-PLAN.md specifies no member cap at all — its validator signature is `validateTeamManifest(raw: unknown): { ok: boolean; team?: { members: HireManifest[] }; errors: string[] }` that "

**Failure scenario:** A shared team.json of 256KB filled with minimal members — `{"spec":"hello-markx/hire@1","name":"a1"},` is ~42 bytes, so ~6,200 members fit under TEAM_MAX_BYTES. Every one passes validateHireManifest (name is the only required field). validateTeamManifest returns ok with 6,200 members. TeamReviewModal renders 6,200 rows all checked by default (distinct names ⇒ no `name taken` flag), freezing the re

**Fix:** Resolve the open decision in 03-04 Task 1: add `TEAM_MAX_MEMBERS = 16` (or the chosen number) beside TEAM_MAX_BYTES and make validateTeamManifest reject `members.length > TEAM_MAX_MEMBERS` with an explicit error, mirroring validateHireManifest's `"commandFlags" must be an array of at most 16 items` wording; add an acceptance criterion `grep -n "TEAM_MAX_MEMBERS" src/shared/hire.ts` >= 1 plus a test case at the cap boundary. Then rewrite 03-06's T-03-06b to cite that constant instead of the byte 

**Why it survived refutation:** Independently confirmed. (1) 03-06-PLAN.md:266 T-03-06b disposes a DoS threat as `mitigate` on the strength of "The member cap lives in the validator (03-04, 256KB byte cap bounds worst-case member count)". (2) 03-04-PLAN.md, which owns the validator, specifies NO member-count cap: grep for `members.length|member cap|MAX_MEMBERS` returns 0 hits; its only bound is `TEAM_MAX_BYTES = 256 * 1024` (03-04-PLAN.md:183), and its own threat row T-03-04c scopes that cap to JSON.parse memory pressure. Its <behavior> block even says "no parallel flag-allowlist or length-cap logic exists anywhere in this f

---

## #20 — [HIGH] 03-01 Task 3 leaves HivePicker's existing "run different setups side by side" claim in place, and its acceptance grep is satisfied by that very false sentence

**Plan:** 03-01-PLAN.md, Task 3 <action> and <acceptance_criteria>

**Evidence:** Plan action: "D-13: add one sentence to `HivePicker.tsx`'s dialog body ... stating that only one project runs at a time". Plan criterion: "`grep -n \"one project runs at a time\\|does not run.*simultaneously\\|side by side\" src/renderer/src/components/HivePicker.tsx` matches `>= 1`". Verified in source: src/renderer/src/components/HivePicker.tsx:82 already reads "Each config is separate and self-

**Failure scenario:** The executor adds nothing (the criterion is already green) or adds the honesty sentence next to the contradicting one. Either way the shipped dialog keeps telling the operator they can run setups side by side, which this plan's own must_have declares false ("This plan does NOT deliver simultaneous side-by-side projects, and README.md and HivePicker.tsx both say so"). The phase's central honesty de

**Fix:** Change the action to EDIT line 82: replace "so you can run different setups side by side" with the honest statement, and change the criterion to a paired assertion — `grep -c "side by side" src/renderer/src/components/HivePicker.tsx` == 0 AND `grep -c "one project runs at a time" src/renderer/src/components/HivePicker.tsx` >= 1.

**Why it survived refutation:** I verified every cited fact in this session and the finding holds.

1. Source: `src/renderer/src/components/HivePicker.tsx:82` reads verbatim "Each config is separate and self-contained, so you can run different setups side by side." (line 82 is inside the dialog body `<p>` at lines 79-84, immediately above the "Open the one you were working in, switch to another, or start a new one." line the plan names as the insertion anchor).

2. The acceptance criterion is pre-satisfied. `.planning/phases/03-scale-and-observability/03-01-PLAN.md:264` reads: "- `grep -n \"one project runs at a time\\|does 

---

## #21 — [HIGH] 03-09 Task 2: two of the three correction criteria already return 0 before any edit — the honesty plan's own gate is vacuous

**Plan:** 03-09-PLAN.md, Task 2 <acceptance_criteria>

**Evidence:** Plan criteria: "`grep -n \"registry/router split from STRUCT-02\" .planning/ROADMAP.md` matches exactly `0`" and "`grep -n \"Both criteria then hold\" .planning/ROADMAP.md` matches exactly `0`". Verified this session: `grep -c "registry/router split from STRUCT-02" .planning/ROADMAP.md` → 0 and `grep -c "Both criteria then hold" .planning/ROADMAP.md` → 0, because both phrases straddle a line break

**Failure scenario:** The executor runs the criteria, sees 0/0, marks the corrections landed, and writes a SUMMARY claiming D-02 and D-06 are closed — while ROADMAP.md:285-286 and :293-294 still carry both refuted claims verbatim. This is exactly the 'green tick that overstates reality' the phase exists to remove, shipped by the plan whose sole purpose is honesty.

**Fix:** Make both criteria multiline-aware and non-vacuous: `grep -Pzo "registry/router split\\s+from STRUCT-02" .planning/ROADMAP.md` == 0, `grep -Pzo "Both\\s+criteria then hold" .planning/ROADMAP.md` == 0, each paired with a positive lower bound on the replacement text (e.g. `grep -c "hive.root()" .planning/ROADMAP.md` >= 1, `grep -c "does not make SCALE-01 hold" .planning/ROADMAP.md` >= 1).

**Why it survived refutation:** Independently reproduced. `grep -c "registry/router split from STRUCT-02" .planning/ROADMAP.md` -> 0 and `grep -c "Both criteria then hold" .planning/ROADMAP.md` -> 0 before any edit, because both phrases straddle hard line wraps at ROADMAP.md:293-294 and :285-286 respectively. The third negative criterion (`hive.ts:267` == 0) is non-vacuous: it returns 1 today at ROADMAP.md:281. So two of Task 2's three `matches exactly 0` criteria are satisfied by the pre-edit file, exactly as claimed. The plan's `<verify><automated>` combined grep is vacuous the same way: it returns 1 now and drops to 0 onc

---

## #22 — [HIGH] 03-02's usageById→getAgentUsage swap silently breaks lastActiveSecAgo for every transcript-tier agent

**Plan:** 03-02-PLAN.md, Task 2 <action> and <behavior>

**Evidence:** Plan action: "replace the `usageById.get(id)` lookup ... with a direct `telemetry.getAgentUsage(id)` call per agent inside the existing `Object.entries(reg.agents)` loop — both handlers already loop over the full registry, so this is a mechanical swap". Verified in source: the value `u` feeds more than cost — src/main/floor/boot.ts:492 `lastActiveSecAgo: u ? Math.round((now - u.ts) / 1000) : null`

**Failure scenario:** After the swap, a codex agent that last did work six hours ago reports `lastActiveSecAgo: 0` on every fleet snapshot and every `hive:agentDirectory` call, forever, because transcriptFallback stamps Date.now(). Michael's fleet snapshot and the workers tab then show a permanently-fresh 'active 0s ago' for idle transcript-tier agents — a new false claim introduced by a change whose stated purpose was

**Fix:** Name the collateral fields in the action: keep `telemetry.snapshot()`-sourced `u` for `lastActiveSecAgo`/`model`, or have `transcriptFallback` carry the transcript's own last-entry timestamp instead of Date.now() and assert it. Add a <behavior> case: an agent with a transcript last written 1h ago reports `lastActiveSecAgo >= 3500`, not 0.

**Why it survived refutation:** Independently confirmed. 03-02-PLAN.md Task 2 <action> instructs: "replace the `usageById.get(id)` lookup (sourced from `telemetry.snapshot()`, which only iterates live-OTel agent ids) with a direct `telemetry.getAgentUsage(id)` call per agent inside the existing `Object.entries(reg.agents)` loop ... this is a mechanical swap". It is not mechanical: `u` feeds three fields, not one.

Source verified this session:
- src/main/floor/boot.ts:493 `lastActiveSecAgo: u ? Math.round((now - u.ts) / 1000) : null` (reviewer's "492" is off by one; the expression is real).
- src/main/index.ts:3480 identical

---

## #23 — [MED] 03-01 Task 3's README criterion is vacuous — the README half can be skipped with every check green

**Plan:** 03-01-PLAN.md Task 3 acceptance criteria

**Evidence:** Criterion: "`grep -n "switch memory scope to per-agent" README.md src/renderer/src/components/MemoryPanel.tsx` matches exactly `0`". Verified this session: README.md:122-123 reads "For real isolation today, **set** memory scope to\n  per-agent" — the literal string `switch memory scope to per-agent` does not appear in README.md today, only in MemoryPanel.tsx:126. The only positive lower bound in t

**Failure scenario:** The executor edits MemoryPanel.tsx only. All four acceptance criteria pass. README.md:122-123 still tells every reader "For real isolation today, set memory scope to per-agent, which puts each agent in its own index rather than trusting a flag" — a control D-14 establishes is unreachable (HarnessConfig has zero `scope` fields; boot.ts:1135-1138 passes `{ enabled, model }` only). The shipped README

**Fix:** Add a README-specific pair: `grep -c "memory scope to" README.md` == 0 (catches both "set" and "switch" phrasings) AND `grep -c "RECALL-02" README.md` >= 1. Quote README.md:122's actual current wording in the task's `<read_first>` instead of the paraphrase.

**Why it survived refutation:** Independently verified — the mechanical core of the finding is true, but its severity is overstated and one of its sub-claims is wrong.

CONFIRMED:
1. 03-01-PLAN.md:262 — criterion is exactly `grep -n "switch memory scope to per-agent" README.md src/renderer/src/components/MemoryPanel.tsx` matches exactly `0` "(the dead-control instruction is gone from **both**)".
2. README.md today does NOT contain that string. README.md:122-123 reads "enforcement lands with RECALL-02 in Phase 5. For real isolation today, set memory scope to / per-agent, which puts each agent in its own index rather than trus

---

## #24 — [MED] 03-01 leaves config:changeHome's 'move' silently abandoning harness.db and the knowledge store it just made project-local

**Plan:** 03-01-PLAN.md Task 2 ("Do NOT add any repoint call to `config:changeHome` or `app:resetAll`")

**Evidence:** Plan reasons only about repointing: "both already end in `app.relaunch(); app.exit(0)`, which destroys and reconstructs `persist`/`firedDb` for free." That much is verified (src/main/index.ts:2795, :3420). But the move-the-data half is not considered. Verified src/main/index.ts:2770-2778: `if (mode === 'move' && oldHome) { ... for (const sub of ['hive', 'palace', 'roster.json', 'roster-backups']) 

**Failure scenario:** An operator relocates their project home and picks 'move' — the mode whose whole promise is that the data comes along. `hive/`, `palace/` and the roster move; `command_history`, the `kv` store (including `missionLastFiredAt`, so every mission re-fires), the FTS memory index and the entire knowledge graph do not. The new home boots with an empty harness.db and an empty KG_ROOT and the operator is s

**Fix:** Add `'harness.db'` (plus its `-wal`/`-shm` siblings) and `'knowledge'` to the `sub` array at index.ts:2775, and close the live `persist` handle before the copy (it is not in the teardown block at :2752-2763, so a WAL is open across `cpSync`). Add an acceptance criterion asserting the move list contains at least 6 entries and includes `harness.db`.

**Why it survived refutation:** Independently confirmed, not refuted. (1) index.ts:2771 is verbatim `for (const sub of ['hive', 'palace', 'roster.json', 'roster-backups'])` — a fixed four-entry list; the handler comment at :2726-2727 does promise "'move' copies the data (old kept as a safety net)". (2) 03-01-PLAN.md Task 1 moves `harness.db` to `<home>/harness.db` (via `new PersistStore(undefined, () => readConfig().harnessHome)` in boot.ts and config.ts) and `KG_ROOT` to `<home>/knowledge` (`join(readConfig().harnessHome ?? app.getPath('userData'), 'knowledge')`). Neither is in the copy list. (3) Task 2 explicitly says "Do 

---

## #25 — [MED] 03-06's uniqueId fix targets a call site that does not exist, and no member-count cap bounds the bulk spawn

**Plan:** 03-06-PLAN.md Task 1 `<action>` and threat T-03-06b

**Evidence:** `<action>`: "Wire whichever choice into BOTH `useRestoreTeam.ts` (if it ever restores two same-named agents, which is already latent) and the new team-hire path". Verified: `grep -n "uniqueId" src/renderer/src/hooks/useRestoreTeam.ts` returns zero hits; the file reuses the persisted id throughout (`id: ptyId` at :132 where `const ptyId = a.ptyId ?? \`pty-${a.id}\`` at :111, and `hive: { id: a.id, 

**Failure scenario:** (a) The executor spends the task hunting a latent collision in useRestoreTeam.ts that cannot occur, then either invents a change there or silently drops the 'BOTH' half — leaving the STOP-AND-REPORT hazard closed in only one place while the SUMMARY claims both. (b) A team@1 file with 2,000 minimal members validates, every row defaults CHECKED, and one click on `hire 2000` fires `spawnBatch`'s `Pro

**Fix:** Drop the useRestoreTeam.ts half of the uniqueId instruction (or state plainly that it is a no-op and why). Add an explicit `TEAM_MAX_MEMBERS` cap to 03-04's `validateTeamManifest` — matching the style of the existing `commandFlags` (16) and `capabilities` (12) caps in src/shared/hire.ts — and rewrite T-03-06b's mitigation to cite that constant instead of the byte cap.

**Why it survived refutation:** Split verdict — half the finding is refuted, half survives.

REFUTED — the uniqueId/useRestoreTeam half (the finding's headline). The factual observation is right but the alleged harm is not. Verified in this session: `grep -n "uniqueId" src/renderer/src/hooks/useRestoreTeam.ts` → zero hits; the restore path reuses persisted ids (`const ptyId = a.ptyId ?? \`pty-${a.id}\`` at useRestoreTeam.ts:111, `id: ptyId` at :132, `hive: { id: a.id, ... }` at :152), so a collision there is structurally impossible. `uniqueId` exists only at AddAgentModal.tsx:131, called at :337 — as claimed. But the plan te

---

## #26 — [MED] 03-09: both tasks' `<automated>` verify commands are inverted — `grep -c` exits 1 when the correction succeeded and 0 when it did not

**Plan:** 03-09-PLAN.md Task 1 `<verify><automated>grep -c "hive.ts:267\|telemetry.ts:126" .planning/REQUIREMENTS.md</automated>`; Task 2 `<verify><automated>grep -c "hive.ts:267\|registry/router split from STRUCT-02\|Both criteria then hold" .planning/ROADMAP.md</automated>`; and `<verification>` line 185

**Evidence:** Measured this session: `grep -c "ZZZNOPE" .planning/STATE.md` → prints `0`, `exit=1`. `grep -c "hive.ts:267\|telemetry.ts:126" .planning/STATE.md` → prints `1`, `exit=0`. The desired post-edit state (zero matches) is a non-zero exit; the undesired state (stale anchor still present) is exit 0.

**Failure scenario:** The executor's harness treats non-zero exit as task failure. Task 1 lands correctly, the verify command 'fails', and the executor either reverts the correct edit or re-adds the stale anchor to make the command exit 0 — restoring `hive.ts:267` and shipping the phase's own anti-rot plan with the rot back in place. The mirror case is worse: a harness that ignores exit codes reads `0` printed on the S

**Fix:** Use an assertion that is true-on-success: `! grep -q "hive.ts:267\|telemetry.ts:126" .planning/REQUIREMENTS.md && grep -q "hive.ts:323" .planning/REQUIREMENTS.md` — negative plus the positive lower bound D-38 requires, with exit 0 meaning the correction landed.

**Why it survived refutation:** Confirmed, but the reviewer's severity and one evidence claim are overstated.

CONFIRMED (verified this session, not taken on trust):
1. The quoted plan text is verbatim accurate. 03-09-PLAN.md:122 is `<automated>grep -c "hive.ts:267\|telemetry.ts:126" .planning/REQUIREMENTS.md</automated>`; 03-09-PLAN.md:162 is `<automated>grep -c "hive.ts:267\|registry/router split from STRUCT-02\|Both criteria then hold" .planning/ROADMAP.md</automated>`. The `<verification>` block (03-09-PLAN.md:185) repeats the same `grep -c` form across both files.
2. The exit-code inversion is real, measured in the work

---

## #27 — [MED] 03-01 Task 3: the dead-memory-scope grep uses the wrong verb for README — README.md says "set memory scope to per-agent", so the criterion is already 0 and the doc can ship uncorrected

**Plan:** 03-01-PLAN.md Task 3, acceptance criterion: "`grep -n \"switch memory scope to per-agent\" README.md src/renderer/src/components/MemoryPanel.tsx` matches exactly `0` (the dead-control instruction is gone from both)"

**Evidence:** Measured this session: `grep -c "switch memory scope to per-agent" README.md` → **0** (already). `grep -c "switch memory scope to per-agent" src/renderer/src/components/MemoryPanel.tsx` → 1 (MemoryPanel.tsx:126 `in Phase 5. For real isolation today, switch memory scope to per-agent.`). README.md:122-123 reads `... For real isolation today, set memory scope to per-agent, which puts each agent in it

**Failure scenario:** Executor edits MemoryPanel.tsx only, runs the criterion, gets 0, ticks the task. README.md:122-123 still tells the operator to reach a per-agent memory-scope control that D-14 establishes is unreachable in the shipped app — the plan's must_have "README.md and MemoryPanel.tsx no longer instruct the operator to switch to a per-agent memory scope control that does not exist" ships false with a green 

**Fix:** Grep the shared substring that actually exists in both files — `memory scope to per-agent` — asserted at exactly 0, AND add the positive lower bound (`grep -c "RECALL-02" README.md` >= 1, matching the criterion already written for MemoryPanel.tsx) so deleting the paragraph does not satisfy the check.

**Why it survived refutation:** Independently confirmed, with one correction to the reviewer's own evidence. 03-01-PLAN.md:262 gates Task 3 on `grep -n "switch memory scope to per-agent" README.md src/renderer/src/components/MemoryPanel.tsx` matching exactly 0. Measured this session: MemoryPanel.tsx:126 contains that exact string on one line (grep -c = 1); README.md contains ZERO matches for it. Note README's phrase is BOTH a different verb AND line-wrapped — README.md:122-123 reads "...For real isolation today, set memory scope to\nper-agent, which puts each agent in its own index rather than trusting a flag." — so grep -c 

---

## #28 — [MED] 03-06 Task 1: the "behavior-preserving refactor, existing coverage still passes" premise is false — no test in the repo touches useRestoreTeam — and the uniqueId collision fix has no test file anywhere in the task

**Plan:** 03-06-PLAN.md Task 1 `<behavior>`: "`useRestoreTeam.ts`'s `restoreTeam()` calls `spawnBatch(restorableAgents, ...)` and its existing test coverage (concurrency, roster order, per-agent failure isolation) still passes unmodified — this is a behavior-preserving refactor, not a rewrite."

**Evidence:** Measured this session: `grep -rln "useRestoreTeam\|restoreTeam" test/` returns ZERO files; `grep -rn "spawnBatch" src/ test/` returns zero. Task 1's `<files>` are `bulkSpawn.ts, useRestoreTeam.ts, store/config.ts` — no test file. Its `<verify>` is `node --test test/hire-manifest.test.cjs`, a file 03-04 creates for team@1 manifest VALIDATION, with nothing to say about concurrency or id generation. 

**Failure scenario:** The executor lifts the Promise.all/input-order loop, reintroduces one of the three defects the loop's own comments record (serial cost, completion-order roster corruption, one rejected IPC aborting the rest), runs `node --test test/hire-manifest.test.cjs`, gets green, and ships. Separately: two 'Jim' rows hired in one batch collide on `${slug}-${Date.now().toString(36)}` and the second silently ov

**Fix:** Add a real test file to Task 1's `<files>` (e.g. `test/bulk-spawn.test.cjs`, loading `src/renderer/src/hooks/bulkSpawn.ts` via test/load-ts.cjs the way test/renderer-runstate.test.cjs:15-22 loads pure store modules) with three assertions: all spawnOne calls start before any resolves (concurrency), successes returned in INPUT order given deliberately inverted completion order, one throwing item leaves the other N-1 in `ok`. Add the fixed-clock same-name id test there and point `<verify>` at it. D

**Why it survived refutation:** I could not refute the core claim; it holds on independent verification, though the finding overstates one half of it.

CONFIRMED (verified this session):
1. The `<behavior>` sentence is factually false. `03-06-PLAN.md:136-138` reads "`useRestoreTeam.ts`'s `restoreTeam()` calls `spawnBatch(restorableAgents, ...)` and its existing test coverage (concurrency, roster order, per-agent failure isolation) still passes unmodified". No test in the repo touches it: `grep -rn "restoreTeam\|RestoreTeam\|useRestoreTeam" test/` returns zero hits, and the only renderer hook any test loads is `useHive.ts` (t

---

## #29 — [MED] 03-03's "verified this session" interface block misquotes applyCostRow's series-key separator, and two `<behavior>` blocks are closed with `</action>`

**Plan:** 03-03-PLAN.md `<interfaces>`: "const key = `${row.agent_id ?? ''} ${row.session_id ?? ''}`;" and Task 2 `<action>`: "Change the PRIVATE `applyCostRow` method to a module-level EXPORTED function ... with the identical body"

**Evidence:** Actual source, src/main/hive.ts:2613: ``const key = `${row.agent_id ?? ''} ${row.session_id ?? ''}`;`` — a NUL separator, not a space. The plan's reproduction uses a space. Separately, 03-03-PLAN.md:225 closes a block opened as `<behavior>` at :207 with `</action>`, and :279 does the same for the block opened at :266 — two malformed task bodies in the plan the executor parses.

**Failure scenario:** An executor hoisting from the plan's quoted text rather than the file changes the series key from `agent\0session` to `agent session`. Agent id `a` + session `b c` and agent id `a b` + session `c` collide onto one cumulative baseline — the first row of the colliding series diffs against a foreign total and clamps to 0 (silent under-report) instead of crediting its own value, which is precisely the

**Fix:** Correct the quoted key expression to ` `, add an acceptance criterion that the hoisted function's body is byte-identical to the removed method (or a unit assertion that two agent/session pairs which would collide under a space separator produce independent deltas), and repair the two `</action>` mis-closures to `</behavior>`.

**Why it survived refutation:** Confirmed on the substantive leg; the second leg is real but mischaracterized and near-cosmetic.

LEG 1 (real, load-bearing). Source verified this session: src/main/hive.ts:2613 is `const key = `${row.agent_id ?? ''} ${row.session_id ?? ''}`;` (cat -A confirms the   escape); `private applyCostRow` is at :2608. 03-03-PLAN.md:120, inside a block headed "From `src/main/hive.ts` (current, verified this session)", reproduces it with a plain SPACE (cat -A confirms). The separator is security-load-bearing, not stylistic: src/main/telemetry.ts:148-159 documents it — "A printable separator would NOT be

---

## #30 — [MED] 03-09 Task 1 unconditionally writes an owner column naming a phase that Task 2's own gate guarantees will not be created

**Plan:** 03-09-PLAN.md Task 1 <action> vs Task 2 <action> gate check; D-07

**Evidence:** Task 1 <action>: "In the status table, update the `SCALE-01` and `SCALE-03` rows' owner column from \"Phase 3\" to name the new post-Phase-5 phase Task 2 of this plan creates (use the exact phase name/number Task 2 assigns ...)" — with no gate of its own. Task 2 <action>: "**Gate check, run BEFORE making this one insertion**: verify `.planning/phases/02-the-daemon-and-the-protocol/02-12-SUMMARY.md

**Failure scenario:** 03-09 runs (wave 6, last). Task 1 rewrites REQUIREMENTS.md:454/:456 owner column to e.g. 'Phase 6 — Close the forward dependencies'. Task 2's gate then fires, withholds the ROADMAP insertion, and leaves ROADMAP.md's phase list at 1-6 with Phase 6 = 'The Office Runs the Process' (verified at .planning/ROADMAP.md:456). Result: REQUIREMENTS.md now points SCALE-01 and SCALE-03 at a phase id that exist

**Fix:** Make Task 1's owner-column edit share Task 2's gate: run the 02-12-SUMMARY.md existence check ONCE at the top of the plan, and if absent, leave both rows as 'Phase 3' with an explicit inline note that the re-verification phase id is pending 02-12 — recorded in the SUMMARY, per the same 'never silent' rule Task 2 already applies. Alternatively, reorder so Task 2 runs first and Task 1 reads its actual outcome.

**Why it survived refutation:** Independently confirmed. 03-09-PLAN.md Task 1's <action> unconditionally rewrites REQUIREMENTS.md's SCALE-01/SCALE-03 owner column to "name the new post-Phase-5 phase Task 2 of this plan creates", while Task 2's <action> gates that creation: "Gate check, run BEFORE making this one insertion: verify .planning/phases/02-the-daemon-and-the-protocol/02-12-SUMMARY.md exists on disk. If it does NOT exist, do NOT insert the new phase or renumber GSD — leave ROADMAP.md's phase list and numbering exactly as they are today." The must_haves block mirrors the asymmetry (owner-column truth unconditional; i

---

## #31 — [MED] 03-09's GSD renumber (Phase 6 → 7) desyncs 12 status-table rows in REQUIREMENTS.md that the same plan is forbidden from touching

**Plan:** 03-09-PLAN.md Task 2 <action>; Task 1 <action>

**Evidence:** 03-09-PLAN.md Task 2 <action>: "insert a new phase entry after Phase 5 ... and renumber GSD to Phase 7 (a doc-only renumber, since no `07-*`/GSD phase directory exists yet)". Task 1's action scope is limited to STRUCT-02's line, the two anchors, and "the `SCALE-01` and `SCALE-03` rows' owner column". Verified this session: `grep -c "| Phase 6 |" .planning/REQUIREMENTS.md` → 12, at .planning/REQUIR

**Failure scenario:** If 02-12 lands before wave 6 and the gate opens, 03-09 renumbers GSD to Phase 7 in ROADMAP.md. REQUIREMENTS.md's 12 GSD status rows and 2 further mentions still say 'Phase 6', which after the renumber points at 'Close the forward dependencies'. The plan that exists to remove rotted cross-document anchors ships 14 fresh ones, and every GSD requirement is now mis-attributed to the wrong phase.

**Fix:** Either drop the renumber (insert the new phase as Phase 5.5 / a lettered id, leaving GSD at 6), or add to Task 1 an explicit sweep: `sed`-replace `| Phase 6 |` → `| Phase 7 |` across REQUIREMENTS.md's status table plus STATE.md's two mentions, gated on the same 02-12 check, with acceptance criteria asserting `grep -c "| Phase 6 |" .planning/REQUIREMENTS.md` is 0 AND `grep -c "| Phase 7 |"` is `>= 12` (positive lower bound).

**Why it survived refutation:** Independently confirmed. `grep -n "Phase 6" .planning/REQUIREMENTS.md` returns 14 hits: the 12 status-table rows at :485-497 (GSD-01..05, DESK-01..04, REACH-01..03), the mapped-count line at :501, and the split-category line at :519. `.planning/ROADMAP.md:456` is `### Phase 6: The Office Runs the Process`, and the :44-45 checkbox list confirms Phase 6 is the GSD phase — so REQUIREMENTS.md's owner column is ROADMAP phase numbering. 03-09-PLAN.md:144 instructs the renumber (GSD -> Phase 7), and D-05 at 03-CONTEXT.md:98-104 LOCKS it, so "drop the renumber" is not an option available to the plan. 

---

## #32 — [MED] 03-01's README half of its dead-control acceptance criterion is vacuous — the README uses different wording and already returns 0

**Plan:** 03-01-PLAN.md Task acceptance criterion at :262; must_haves truth #6

**Evidence:** 03-01-PLAN.md:262: "`grep -n \"switch memory scope to per-agent\" README.md src/renderer/src/components/MemoryPanel.tsx` matches exactly `0` (the dead-control instruction is gone from both)". Verified this session: `grep -c "switch memory scope to per-agent" README.md src/renderer/src/components/MemoryPanel.tsx` → `README.md:0`, `MemoryPanel.tsx:1`. The README's actual wording is at README.md:122-

**Failure scenario:** The executor fixes MemoryPanel.tsx:126 only, runs the grep, sees 0 for both files, and reports must_have #6 ('README.md and MemoryPanel.tsx no longer instruct the operator to switch to a per-agent memory scope control that does not exist in the shipped app') satisfied. README.md:122-123 keeps telling the operator to use a control the app does not have — a faked capability shipping in the docs half

**Fix:** Split into two criteria with the real README string: `grep -c "set memory scope to" README.md` matches exactly 0 AND `grep -c "switch memory scope to per-agent" src/renderer/src/components/MemoryPanel.tsx` matches exactly 0, each paired with a positive lower bound asserting the replacement sentence exists in each file.

**Why it survived refutation:** Could not refute — the cited evidence is exact and reproduces. The criterion at 03-01-PLAN.md:262 greps the MemoryPanel wording ("switch memory scope to per-agent") against both files, but README.md uses "set memory scope to / per-agent" split across a line break, so the README half returns 0 before the work and 0 after: it is unfalsifiable, and its parenthetical ("gone from both") asserts a conclusion the grep cannot support. It also carries no positive lower bound for README, unlike the MemoryPanel half which gets one at :263 (RECALL-02 >= 1) — a direct violation of the phase's own positive-

---

## #33 — [MED] Plan 05 declines D-31's locked floor-identity stamp on a rationale that config.json's global location refutes

**Plan:** 03-05-PLAN.md threat register T-03-05c: "accept | Out of scope for this plan's single-project shipped state (SCALE-01 stays Pending); D-31's floor-identity stamp is deferred to when multiple simultaneous projects exist, which this phase does not deliver (D-13)"

**Evidence:** 03-CONTEXT.md D-31 (LOCKED): "Stamp the floor identity into all three outputs, or N instances firing at the same hour into one Slack channel are indistinguishable." src/main/config.ts:530 `return join(app.getPath('userData'), 'config.json');` — the config file, and therefore `slackDigestChannelId`/`digestHour`, is APP-GLOBAL, not per-harnessHome. 03-01-PLAN.md's own scope is only `harness.db` and 

**Failure scenario:** The operator switches between two projects on different days (which D-13 says is the supported workflow — switching relaunches). Both runs read the same global `slackDigestChannelId` and post an unlabelled digest. Yesterday's Slack digest and today's are indistinguishable, and a stale one cannot be told from a fresh one. The same applies to the `deps.notify` toast. Plan 05's acceptance criteria ne

**Fix:** Honour D-31: include the active `harnessHome` basename (or the resolved project name) in the digest heading, the toast title, and the Slack text; add acceptance criteria asserting the identity string is present in all three arms. If the decision is genuinely to defer, it must be raised as a deviation from a LOCKED decision, not settled inside a threat-register 'accept' row.

**Why it survived refutation:** Independently confirmed. (1) config.ts:530 is verbatim `return join(app.getPath('userData'), 'config.json');` inside `configPath()` — config.json is app-global, and `harnessHome` is a single-valued field in it (config.ts:184, 461, 982-984), so the Plan-05-added `slackDigestChannelId`/`digestHour` are shared across every project the operator switches to. (2) 03-CONTEXT.md:317-324 D-31 (LOCKED) ends verbatim with "Stamp the floor identity into all three outputs, or N instances firing at the same hour into one Slack channel are indistinguishable." (3) 03-05-PLAN.md:324 T-03-05c is verbatim as quo

---

## #34 — [MED] dailyCostRows does a full synchronous read of the never-rotated cost-ledger.jsonl on every renderer-triggered hive:timeline call

**Plan:** 03-03-PLAN.md Task 2 action and Task 3 action; 03-05-PLAN.md line 145-146

**Evidence:** 03-03 Task 2: "seeded by scanning the WHOLE `cost-ledger.jsonl` (mirroring `rescanCostLedger`'s existing whole-file scan, never `tailLines`)". Task 3 action wires it into the `hive:timeline` handler, and 03-07 Task 2 calls `window.cth.hiveTimeline` from the day picker on every day change. Source, verified this session: src/main/hive.ts:2637-2639 — `readFileSync(join(root, 'cost-ledger.jsonl'), 'ut

**Failure scenario:** On a long-lived floor the ledger reaches hundreds of MB (one row per agent per ~30s beat, forever). Each arrow-key press on 03-07's day picker fires `hive:timeline`, which readFileSync's and JSON.parse-per-line's the whole file synchronously on the main process — freezing the UI thread for seconds per keystroke, and the same scan runs again in 03-05's daily digest. The events table gets a 30-day r

**Fix:** Memoize the diffed day rows per (day, ledger size+mtime) the way usage.ts:138-139 already memoizes rollout reads, or move the ledger to the reserved `cost_ledger` SQLite table (db.ts:49-58) as part of this migration and answer the range from SQL. At minimum, add retention/rotation for cost-ledger.jsonl in the same plan that adds it for events, so the two stores' horizons match.

**Why it survived refutation:** Every cited anchor re-verified this session and all hold verbatim; nothing in the plan set handles it. The plan explicitly mandates a whole-file synchronous read of a file the same plan's own threat register calls unbounded, and explicitly wires that read into a renderer-triggered IPC handler that 03-07's native date input fires on every day change (arrow-key stepping fires change per keypress). This is a real change in cost profile, not a pre-existing condition: today rescanCostLedger runs at most once per process behind the `this.costByTask` memo (hive.ts:2695); the plan converts it into a p

---

## #35 — [MED] readCodexUsage's tail window can make the total transiently DECREASE, which under the clamped diff converts to a one-time over-count — the source comment's 'never a WRONG number' claim is false once the value feeds a diff ledger

**Plan:** 03-02-PLAN.md Task 2 ("the clamped diff still holds (never a negative, never a double-count)")

**Evidence:** Source, verified this session: src/main/usage.ts:201-203 — "// A single record larger than the tail window would hide the totals for that beat; they reappear on the next // turn's record, so this never reports a WRONG number, only a late one." with `CODEX_TAIL_BYTES = 256 * 1024` at usage.ts:135. usage.ts:147-156 — `readCodexUsage` sums per-file totals and does `if (!t) continue;`, so a file whose

**Failure scenario:** Beat 1 reads total X (file A contributes a). Beat 2 hits a rollout record larger than 256KB, `rolloutUsage` finds no token_count in the tail, file A contributes 0, total = X-a. The clamped diff yields 0 (correct so far) BUT the baseline is overwritten with X-a. Beat 3 the record reappears: delta = X-(X-a) = a, credited a SECOND time on top of what was already billed when file A first grew. The 'on

**Fix:** Make the transcript baseline monotone: when a fallback sample's total is LOWER than the stored cumulative for that key, keep the stored (higher) baseline rather than overwriting it, so a transient tail-window miss cannot manufacture a later re-credit. One clamp on the `cumulative.set` side, mirroring the clamp already on the delta side. Add a three-sample fixture (X, X-a, X) asserting total credited spend is X, not X+a.

**Why it survived refutation:** Confirmed, including empirically. (1) Anchors all verified this session: usage.ts:135 `CODEX_TAIL_BYTES = 256 * 1024`; usage.ts:202 the "never reports a WRONG number, only a late one" comment; hive.ts:2613-2619 the clamped delta plus the UNCONDITIONAL `cumulative.set(key, now)`; telemetry.ts:625-644 `transcriptFallback` returning `sessionId: ''`; boot.ts:429 the current `if (sample?.sessionId) hive.appendCostLedger(sample)` gate. (2) The plan really does create the exposure: 03-02-PLAN.md Task 2 mandates replacing that gate with `if (sample) hive.appendCostLedger(sample)` (acceptance criteria 

---

## #36 — [MED] The Slack digest arm bypasses BOTH `slackEnabled` and `dailyDigest` — daily egress of fleet spend and open human questions to slack.com while every operator-facing toggle reads OFF

**Plan:** 03-05-PLAN.md Task 3 <action> + Task 3 <behavior> bullet 3 + Task 2 <behavior> bullet 4

**Evidence:** 03-05-PLAN.md Task 3 <action> specifies the arm verbatim: "In `boot.ts`'s digest fire callback (Task 2), add the Slack arm: `if (config.slackBotToken && config.slackDigestChannelId) { const res = await postSlackDigest({...}); ... }`", and Task 3 <behavior> confirms "`postSlackDigest` is gated in the digest dispatch on BOTH `slackBotToken` AND the new `slackDigestChannelId` being set". Neither cond

**Failure scenario:** An operator configures Slack, later flips `slackEnabled` off (or never turns `dailyDigest` on — it defaults false), and reasonably believes nothing goes to Slack: the reply server is stopped at index.ts:3705, the Settings toggle reads off. The digest timer still arms at boot, and every day at the digest hour a channel-root post lands in the workspace carrying that day's spend, task ids, and the un

**Fix:** Change the gate in 03-05 Task 3 to `if (config.dailyDigest && config.slackEnabled && config.slackBotToken && config.slackDigestChannelId)`, add it to Task 3 <behavior> and to the must_haves, and add an acceptance criterion/test asserting the Slack arm is skipped when `slackEnabled` is false with a token and channel id both present. State the same gating next to the Settings toggle so the UI copy matches the code.

**Why it survived refutation:** I could not refute the core of this, though the finding overstates it in two ways.

WHAT IS TRUE (verified in this session):
- 03-05-PLAN.md Task 3 <action> is quoted correctly: `if (config.slackBotToken && config.slackDigestChannelId) { const res = await postSlackDigest({...}) }`. Task 3 <behavior> bullet 3 confirms the gate is "BOTH `slackBotToken` AND the new `slackDigestChannelId`". Neither `slackEnabled` nor `dailyDigest` appears. Task 2 <behavior> bullet 4 scopes `dailyDigest` to the toast arm only.
- The timer really does arm unconditionally. Task 2 <behavior> bullet 3 says the file arm

---

## #37 — [MED] 03-03's T-03-03c claims both new timeline IPC handlers bounds-check their renderer-supplied arguments; neither the task action, the acceptance criteria, nor any test specifies validation

**Plan:** 03-03-PLAN.md Task 3 (hive:timeline / hive:timelineBucket) + Trust Boundaries row + T-03-03c

**Evidence:** 03-03-PLAN.md:314 (Trust Boundaries) says "day/bucket parameters are renderer-supplied and must be bounds-checked in main before use in any range calculation", and :322 T-03-03c dispositions the threat as "mitigate | Both handlers validate the day string and bucket index (0-95) before use, returning a discriminated error rather than throwing or returning an unbounded result". The task that would i

**Failure scenario:** The executor implements the handlers exactly as instructed and the phase closes with a threat register asserting a mitigation that does not exist in the code. A renderer (or any compromised renderer context) invokes `hive:timelineBucket` with a bucket index of -1, 1e9, NaN, or a day of `{}` — the handler indexes an array out of range or binds a non-finite value into the range-bounded SELECT, eithe

**Fix:** Add explicit <behavior> bullets and acceptance criteria to 03-03 Task 3: both handlers take `(_evt, arg: unknown)`, coerce/validate — day must parse to a finite epoch-ms within a stated window, bucket index must be `Number.isInteger(i) && i >= 0 && i < 96` — and return `{ok:false, error}` otherwise, never throw. Add a test case per handler with NaN / -1 / 96 / non-object args asserting the discriminated error and that no query runs.

**Why it survived refutation:** The textual gap is real and I confirmed every citation independently. 03-03-PLAN.md:314 and :322 do assert bounds-checking of day/bucket-index as a mitigated threat, and 03-07-PLAN.md:265 repeats the claim ("both already bounds-checked in main per 03-03"). Task 3's action (03-03-PLAN.md:280-292) names only hive.enabled()/persist.isOpen guards and leaves the day param ambiguous ("local-date-string or epoch range"), never typed unknown; the five acceptance criteria (:294-298) are four greps plus boot-floor, none asserting validation; no <behavior> bullet (:266-279) covers a malformed argument; a

---

## #38 — [MED] 03-04 Task 3 and 03-08 Task 3 verify against a test file that never loads the components they change — every acceptance criterion is a bare string grep

**Plan:** 03-04-PLAN.md Task 3; 03-08-PLAN.md Task 3

**Evidence:** 03-08 Task 3 <verify>: `node --test test/renderer-components.test.cjs`; criteria are `grep -n "no cost meter" ...AgentDetailPanel.tsx >= 1`, `grep -n "not recorded" ... >= 1`, `grep -n "'unknown'" ... >= 1`. 03-04 Task 3 <verify>: same command, criteria are three greps on AddAgentModal.tsx. Verified in source: test/renderer-components.test.cjs:110-114 loads exactly four modules — PixelBadge.tsx, B

**Failure scenario:** An executor satisfies 03-08 Task 3 entirely by adding a single line containing the strings 'no cost meter', 'not recorded' and 'unknown' anywhere in AgentDetailPanel.tsx — no 5-cell grid, no agentView.ts sourcing, no discriminated cost branch — and the verify command goes green because it renders AgentCard, not AgentDetailPanel. This also leaves 03-VALIDATION.md's row "SCALE-05 | Cost renders a de

**Fix:** In each task's <action>, name the test extension explicitly: add a `loadTs('src/renderer/src/components/AgentDetailPanel.tsx')` case (with the required Module._load stubs for its import graph, following the pattern at test/renderer-components.test.cjs:103) and assert on `renderToStaticMarkup` output — 5 cells present, no `$` in the unmeasured cost cell, `not recorded` for absent spawnedAt, `unknown` before the breaker snapshot resolves. If the import graph proves unloadable, say so and move the 

**Why it survived refutation:** Core evidence verified independently. test/renderer-components.test.cjs:110-114 loads exactly PixelBadge.tsx, BlockedBanner.tsx, AgentCard.tsx, store/store.ts and src/shared/agentProvider.ts; grep for AgentDetailPanel/AddAgentModal in that file returns 0 hits, and the Module._load shim (:97-105) is torn down in the finally at :117-124, so neither component is loadable there as written. 03-08-PLAN.md:256-264 gates Task 3 on three bare greps plus `node --test test/renderer-components.test.cjs`, and its <action> (:243-254) never instructs extending that file despite listing it in <files> (:229) a

---

## #39 — [MED] 03-01 Task 3's README criterion is vacuous — README's wording is "set memory scope to\nper-agent", not "switch memory scope to per-agent"

**Plan:** 03-01-PLAN.md, Task 3 <acceptance_criteria>

**Evidence:** Plan criterion: "`grep -n \"switch memory scope to per-agent\" README.md src/renderer/src/components/MemoryPanel.tsx` matches exactly `0` (the dead-control instruction is gone from both)". Verified: `grep -c "switch memory scope to per-agent" README.md` → 0 TODAY; `grep -c "switch memory scope to per-agent" src/renderer/src/components/MemoryPanel.tsx` → 1. The README text is at README.md:122-123: 

**Failure scenario:** The executor edits MemoryPanel.tsx:126 only, the criterion goes green, and README.md keeps instructing the operator to set a memory scope control that D-14 establishes does not exist in the shipped app — the exact dead-control claim this task was created to remove, surviving in the more public of the two surfaces.

**Fix:** Use two criteria with the real wording: `grep -Pzoc "memory scope to\\s+per-agent" README.md` == 0 and `grep -c "switch memory scope to per-agent" src/renderer/src/components/MemoryPanel.tsx` == 0, each paired with a positive lower bound (`grep -c "RECALL-02" README.md` >= 1).

**Why it survived refutation:** Independently confirmed. In this worktree, README.md:122-123 reads "...For real isolation today, set memory scope to\n  per-agent, which puts each agent in its own index rather than trusting a flag." — verb "set", and line-wrapped between "to" and "per-agent". MemoryPanel.tsx:126 reads "...For real isolation today, switch memory scope to per-agent." — verb "switch", single line. 03-01-PLAN.md:262 is the ONLY acceptance criterion touching README and it greps the literal string "switch memory scope to per-agent" across both files, requiring exactly 0. That string is already 0 in README today, so

---

## #40 — [MED] 03-05 leaves the digest hour and the arming call site as executor guesses

**Plan:** 03-05-PLAN.md, Task 2 and Task 3 <action>

**Evidence:** Task 2: "using `msUntilNextLocalHour(config.digestHour ?? <a reasoned default hour, commented as such>, Date.now())`" and "Call `armDigestTimer()` from wherever `syncContextTriggers()` is already invoked at boot". Task 3: "`digestHour: <the reasoned default hour Task 2 used>`". Verified: `syncContextTriggers()` has three call sites — src/main/floor/boot.ts:1198, src/main/index.ts:3721, and src/mai

**Failure scenario:** '<a reasoned default hour>' is a literal placeholder — the executor invents a value and Task 3's criterion (`grep -n "dailyDigest\\|slackDigestChannelId\\|digestHour" src/main/config.ts >= 3`) passes for any number, so DEFAULTS and the boot fallback can silently disagree. On the call site, 'at boot' points at boot.ts:1198, but the power-RESUME site (index.ts:4718) is precisely where the plan's own

**Fix:** Name the constant (e.g. `const DIGEST_DEFAULT_HOUR = 9;`) in both places and add `grep -c "DIGEST_DEFAULT_HOUR" src/main/floor/boot.ts src/main/config.ts` >= 2. Enumerate the arming sites explicitly: boot.ts:1198 and the powerMonitor resume path at index.ts:4718, with an acceptance criterion pinning both, since catch-up-on-arm is only reachable if arm runs on resume.

**Why it survived refutation:** Confirmed the substantive half. (1) Arming site: 03-05-PLAN.md frontmatter files_modified (lines 7-14) and every task's <files> omit src/main/index.ts (Task 2 is boot.ts only), and the plan never exports armDigestTimer — so the power-resume site is structurally out of reach. Task 2's action says "Call armDigestTimer() from wherever syncContextTriggers() is already invoked at boot", and the three real call sites are src/main/floor/boot.ts:1198 (bootFloor), src/main/index.ts:3721 (triggers:setContext IPC), src/main/index.ts:4718 (onSystemResume) — all verified this session. The repo documents ex

---

## #41 — [LOW] 03-06 Task 1 tells the executor to wire the uniqueId collision fix into useRestoreTeam.ts, which never generates an id

**Plan:** 03-06-PLAN.md, Task 1 <action>

**Evidence:** Plan action: "Wire whichever choice into BOTH `useRestoreTeam.ts` (if it ever restores two same-named agents, which is already latent) and the new team-hire path (Task 2) so the fix is not team-only." Verified in source: src/renderer/src/hooks/useRestoreTeam.ts contains no reference to `uniqueId` at all; every restored agent reuses its persisted identity — `const ptyId = a.ptyId ?? \`pty-${a.id}\`

**Failure scenario:** The executor searches useRestoreTeam.ts for an id-generation site, finds none, and either (a) invents one — regenerating ids on restore, which breaks the hive registry/memory/inbox reattachment the file's own comment at useRestoreTeam.ts:66-68 depends on — or (b) skips it and writes a SUMMARY claiming the collision fix is not team-only when it is. The acceptance criterion is an OR over two impleme

**Fix:** Delete the useRestoreTeam.ts half — the restore path is not latent, it reuses persisted ids by design. Scope the fix to the one path that generates ids: export `uniqueId(name: string, salt?: string|number)` from AddAgentModal.tsx (or move it to store/config.ts beside hireCommandFor), and give Task 1 a concrete test file plus an assertion that `['Jim','Jim','Pam']` under a frozen Date.now() yields three distinct ids. Task 1's <files> currently lists no test file at all while its criteria referenc

**Why it survived refutation:** The factual premise checks out, but the severity is inflated.

CONFIRMED (verified in this session):
- 03-06-PLAN.md:160 does say "Wire whichever choice into BOTH `useRestoreTeam.ts` (if it ever restores two same-named agents, which is already latent) and the new team-hire path (Task 2) so the fix is not team-only."
- `grep -rn uniqueId src/ test/` returns exactly two hits, both in AddAgentModal.tsx (:131 definition, :337 the single call site). It is module-private and never referenced from useRestoreTeam.ts.
- useRestoreTeam.ts generates no id: :111 `const ptyId = a.ptyId ?? \`pty-${a.id}\`` 

---
