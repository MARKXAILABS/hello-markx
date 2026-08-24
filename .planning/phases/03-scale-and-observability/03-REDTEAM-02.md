# Phase 3 — Red-Team Round 2 (consolidated findings)

**Date:** 2026-08-24 · **Run:** `wf_1f8ffcbb-156` · 100 raised → 53 refuted → **47 confirmed**

**Confirmed:** 1 BLOCKER · 20 HIGH · 22 MED · 4 LOW

---

## #1 — [BLOCKER] Widening the ledger gate to ALL engines double-bills every OTel agent: the same spend is credited once under (agentId, sessionId) and again under (agentId, '') whenever the agent falls back

**Plan:** 03-02-PLAN.md Task 2 <action> (the `if (sample) hive.appendC

**Fix:** Do not append a fallback row for an engine whose `costTracking` is not `'transcript'`. Gate the widened append on the registry's recorded provider: `const tier = providerPreset(reg.agents[id]?.provider)?.costTracking; if (sample && (sample.sessionId || tier === 'transcript')) hive.appendCostLedger(sample);`. For `'otel

---

## #2 — [HIGH] 03-01's new `persist.close()` in config:changeHome strands a dead PersistStore for the rest of the session on the copy-failure path — the plan's premise that changeHome always relaunches is false

**Plan:** 03-01-PLAN.md Task 2 ("wire the one repoint call site, both 

**Fix:** Either move the `persist.close()` to immediately before the `cpSync` loop and add `try { persist.repoint(); } catch {}` (or `persist.open()`) to the copy-failure recovery branch beside the existing `startHiveServices()` at index.ts:2782, or state the recovery-path reopen explicitly in Task 2's `<action>` and add an acc

---

## #3 — [HIGH] 03-09 Task 1's owner-column example names Phase 7, but Task 2's insertion makes the new phase Phase 6 and Phase 7 the GSD phase

**Plan:** 03-09-PLAN.md Task 1 `<action>` vs Task 2 `<action>`

**Fix:** Change Task 1's example to "Phase 6 — Close the forward dependencies", or (better) have Task 1 read the inserted phase's number back out of ROADMAP.md rather than hard-coding an example, and add an acceptance criterion asserting the owner string in REQUIREMENTS.md matches the `### Phase N: Close the forward dependencie

---

## #4 — [HIGH] 03-02's applyCostRow rewrite (the money path) has ZERO test anywhere in the phase — both verify files contain no cost arithmetic, and the file that does is unowned and unmentioned

**Plan:** 03-02-PLAN.md Task 2 (`<acceptance_criteria>`, `<verify>`, `

**Fix:** Add `test/hive-protocol-v2.test.cjs` to 03-02's `files_modified` and to Task 2's `<files>`, and make Task 2's `<action>` explicitly write three cases against `appendCostLedger` with `sessionId: ''`: (a) first row credits 0, (b) second row credits the genuine increment, (c) X → X−a → X credits X total, not X+a. Point th

---

## #5 — [HIGH] 03-04's export stripper — D-16's seven-field security control — has no test, and its only "criterion" is a grep that returns 0 matches today

**Plan:** 03-04-PLAN.md Task 2 (`<files>`, `<acceptance_criteria>`), t

**Fix:** Add `test/hire-manifest.test.cjs` to Task 2's `<files>` and require an assertion that feeds a `PersistedAgent`-shaped fixture carrying all seven fields through `stripAgentForExport` and asserts `Object.keys(out)` contains none of them (key ABSENCE, not `undefined`), plus a round-trip: `validateHireManifest(JSON.parse(w

---

## #6 — [HIGH] 03-03 Task 2 repeats 03-02's gap: the D-22 mid-day session-rollover fixture is specified in `<behavior>` but created by no action and run by no test that touches cost arithmetic

**Plan:** 03-03-PLAN.md Task 2 `<behavior>` bullet 5, `<acceptance_cri

**Fix:** Add `test/hive-protocol-v2.test.cjs` (the real owner of the cost-arithmetic style 03-VALIDATION.md misattributes to hive-durability) to 03-03's `files_modified` and Task 2's `<files>` and `<verify>`; instruct the mid-rollover fixture explicitly; correct 03-VALIDATION.md's "following hive-durability.test.cjs's cost-arit

---

## #7 — [HIGH] 03-05 adds config fields + a Settings toggle but owns none of the two mirrored HarnessConfig declarations it must edit — and one of them is 03-04's file in the SAME wave

**Plan:** 03-05-PLAN.md frontmatter files_modified (:7-14) and Task 3 

**Fix:** Either (a) move the digest's Settings UI out of 03-05 into a wave-5 plan that owns both mirrors, or (b) add `src/preload/index.ts` and `src/renderer/src/store/config.ts` to 03-05's files_modified AND move 03-05 to its own wave after 03-04, or (c) drop the SettingsModal task from 03-05 and have the toggle land in 03-06 

---

## #8 — [HIGH] 03-09's two tasks assign contradictory numbers to the inserted phase, and Task 1's own acceptance criterion mechanically forbids the correct one

**Plan:** 03-09-PLAN.md Task 1 (:153, :170) vs Task 2 (:196)

**Fix:** Pin the numbering once, in <interfaces>: new phase = Phase 6 "Close the forward dependencies"; GSD = Phase 7. Change Task 1's example to "Phase 6 — Close the forward dependencies". Replace the blanket `grep -c "Phase 6" == 0` criteria in both tasks with a targeted check that the 12 GSD/DESK/REACH status rows plus :501/

---

## #9 — [HIGH] 03-05's deps.send grep-pin cannot detect the defect it exists to detect — the second grep filters on a word the offending call site would not contain

**Plan:** 03-05-PLAN.md Task 2 acceptance_criteria, and threat T-03-05

**Fix:** Replace with a criterion that reads the digest callback specifically and cannot be satisfied by absence of a keyword — e.g. a node one-liner that slices boot.ts from `armDigestTimer` to the next top-level `function`/`const` declaration, squeezes whitespace, and asserts the slice contains `deps.notify` (>= 1, positive l

---

## #10 — [HIGH] 03-05's threat register claims two mitigations that no task action or acceptance criterion implements

**Plan:** 03-05-PLAN.md threat register T-03-05a and T-03-05b, vs Task

**Fix:** Either implement both — add a Task 3 criterion asserting no new `console.*` line in slack.ts references `botToken`/`opts` wholesale, and add `if (digestTimer) { clearTimeout(...); clearInterval(...); }` at the top of armDigestTimer with a matching grep — or downgrade both register rows to `accept` with the real residua

---

## #11 — [HIGH] control:breakerSnapshot is a callerless handler — nothing in any plan ever invokes the pull, so D-36's fail-unsafe window stays open while the threat register claims it closed

**Plan:** 03-02-PLAN.md Task 1 ("CircuitBreaker.snapshotAll() and the 

**Fix:** Add an explicit task step in 03-08 Task 1: inside `useTelemetry.ts`'s new module-singleton first-subscriber initialization, call `window.cth.getBreakerSnapshot?.().then(snap => publish({...state, breakers: {...snap, ...state.breakers}}))` alongside the existing `telemetrySnapshot()` backfill, and add an acceptance crit

---

## #12 — [HIGH] Widening the cost-ledger gate bills the SAME cwd-wide transcript total to every non-isolated Claude agent and to god — resolveCodexHome does not touch this, and it is the default configuration

**Plan:** 03-02-PLAN.md Task 2 (the `if (sample) hive.appendCostLedger

**Fix:** Either keep the ledger gate narrow for cwd-derived (non-codex) fallback samples, or make the claude fallback per-agent before widening: `transcriptFallback` must pass a session filter (`readAgentUsage(cwd, { sessionId })` already exists as `ReadUsageOptions` in transcript.ts:299) using the registry's recorded session i

---

## #13 — [HIGH] The digest's central safety criterion ("never routes through deps.send") is vacuous — it returns 0 today, before any work is done

**Plan:** 03-05-PLAN.md Task 2 acceptance criteria

**Fix:** Replace with a structural check that can actually fail: extract the fire callback as a named exported function (e.g. `export function fireDigest()`) and assert over its `.toString()` in test/digest-scheduler.test.cjs that it contains no `deps.send`, paired with a positive lower bound that it DOES contain `deps.notify` 

---

## #14 — [HIGH] Cost is written into the events table AND passed separately as costRows — summarizeDay double-counts and bucketDetail double-renders, and cost beats swamp the 200-row cap

**Plan:** 03-03-PLAN.md Task 2 <behavior> (appendCostLedger "invokes t

**Fix:** Pick one source. Either (a) do NOT emit `kind: 'cost'` rows from the events sink and let `dailyCostRows` be the sole cost source, or (b) drop `costRows` from the timeline handlers and read cost from the events table only. Whichever is chosen, exclude `kind === 'cost'` from the bucket 'events' count and add a timeline.t

---

## #15 — [HIGH] The monotonic floor is unconditional, not transient-only: a genuine transcript deletion or rotation pins the fallback baseline at the old high-water mark forever, so all subsequent spend is credited ZERO and the under-count is undetectable

**Plan:** 03-02-PLAN.md Task 2 <action> lines 361-365 + threat registe

**Fix:** Bound the floor. Treat a dip as transient only while it stays within a plausible tail-window miss and within a small number of consecutive beats; on a persistent or large drop (e.g. the same lower total observed on N consecutive beats, or a drop exceeding some fraction of the baseline), RE-SEED the baseline to the new 

---

## #16 — [HIGH] 03-02's cost-correctness acceptance criteria are all greps plus already-green test files — inverting the monotonic comparison or the isFallback test keeps every gate green

**Plan:** 03-02-PLAN.md Task 2 <acceptance_criteria> line 400 and the 

**Fix:** Add `test/hive-protocol-v2.test.cjs` to 03-02's `files_modified` and add acceptance criteria that name the assertions, not the identifiers: (a) a three-sample fallback fixture X, X-a, X asserting `taskSpend(card).tokens === X_tokens`; (b) a fixture whose first fallback row is 40,000,000 tokens asserting `taskSpend(card

---

## #17 — [HIGH] resolveCodexHome fixes only the codex-reads-Claude direction; two non-codex agents sharing one cwd still each open their own fallback series against the SAME whole-directory total, so identical spend is credited N times — while T-03-02d claims the boundary is mitigated

**Plan:** 03-02-PLAN.md threat register T-03-02d (line 433) + Task 2 <

**Fix:** Key the transcript-fallback series on its SOURCE, not on the consuming agent: emit `session_id: 'cwd:' + cwd` (or `'codexhome:' + home`) instead of `''` so N agents sharing a directory share ONE series with one baseline and one delta, and attribute that delta to at most one card (or split it explicitly and say so). If 

---

## #18 — [HIGH] 03-03 pipes ~2,880 `kind:'cost'` beat rows per agent per day into the same events table whose ALL-KINDS count drives the day band's ground-truth track — the metronome buries real activity and cost is double-represented

**Plan:** 03-03-PLAN.md Task 2 <behavior> line 271 + <action> line 299

**Fix:** Do not write `kind:'cost'` beat rows into the events table at all — track 3 already sources cost from the ledger, and 03-07's detail list can merge the cost deltas it needs from `dailyCostRows`. If they must be stored, exclude `kind:'cost'` from track 1's count (state the exclusion in the UI-SPEC table beside D-26's fi

---

## #19 — [HIGH] The day band's cost track renders unmeasured spend as zero — D-35's exact forbidden reading, on a new surface where every other surface in the app already declares the gap

**Plan:** 03-07-PLAN.md Task 1/2 (the band and its aria-label); 03-UI-

**Fix:** Add a third gap cause to §S1e and to 03-07 Task 1: when any agent active in the displayed day has `costTracking:'none'`, the cost track carries the `--cth-ink-100` treatment (or a declared marker) and the DOM sentence beneath the band names it, reusing config.ts:491-492's existing vocabulary — e.g. `{n} agents on this 

---

## #20 — [HIGH] The export stripper — the plan's central security property (D-16's seven fields) — has zero test coverage and zero acceptance criteria

**Plan:** 03-04-PLAN.md Task 2 (team:export stripper), must_have truth

**Fix:** Add `test/team-export.test.cjs` (or fold into test/hire-manifest.test.cjs, which Task 1 already owns) that `loadTs('src/main/hire.ts')` and asserts, for a fixture PersistedAgent carrying all seven fields plus `note` and `lastPrompt`, that `Object.keys(stripAgentForExport(a))` contains NONE of cwd/account/accountPolicy/

---

## #21 — [HIGH] 03-02 Task 2 is marked tdd=true but names no test file, and the logic it adds is private and unreachable from any test in this wave

**Plan:** 03-02-PLAN.md Task 2 (<files>, <behavior>, <acceptance_crite

**Fix:** Add `test/hive-durability.test.cjs` to Task 2's `<files>` and to `files_modified`, and either move 03-03 Task 2's applyCostRow export forward into this task, or specify the indirect drive path exactly (construct HiveManager on a temp home, call `taskSpend()` once to build `costByTask`, then `appendCostLedger` twice and

---

## #22 — [MED] 03-07 has no `firstTs === null` branch — a fresh install renders "was quiet" for every day, and round-1 #7's prescribed fix was not applied

**Plan:** 03-07-PLAN.md Task 1 `<behavior>` / `<acceptance_criteria>`;

**Fix:** Add a fourth branch to 03-07 Task 1's `<behavior>`: when `firstTs` is null/undefined, or when the day is entirely before `firstTs`, render the UI-SPEC's own copy (`No timeline yet — the record starts the first time the floor logs an event.` / `Nothing was recorded on {date}. The stored record starts {firstDate}.`) and 

---

## #23 — [MED] 03-02 publishes the transcript fallback's ALL-TIME cumulative spend as the card's `cost`, beside `up` = time since THIS spawn — the same falsehood the plan closes for the ledger

**Plan:** 03-02-PLAN.md Task 2 `<action>` (the usageById → getAgentUsa

**Fix:** Either keep `usd`/`tokens` from `telemetry.snapshot()` (live-session semantics) and add a separate, distinctly-named lifetime field for fallback agents, or carry the fallback discriminator through to the join and have 03-08's `deriveCost` return a third kind (e.g. `{kind:'lifetime', usd}`) rendered with its own label a

---

## #24 — [MED] 03-01 Task 2 permits `repointFiredStore()` to run AFTER `startHiveServices()`, which reproduces the exact mission-stamp bug D-12 mandates the fix for

**Plan:** 03-01-PLAN.md Task 2 `<action>`

**Fix:** Change the `<action>` to mandate the order: `persist.repoint(); repointFiredStore();` BEFORE `startHiveServices()`, and drop the "(or after)" license. Add an acceptance criterion that pins the order (e.g. a `node -e` check over `index.ts` asserting the index of `repointFiredStore()` is less than the index of `startHive

---

## #25 — [MED] 03-09 Task 2's phase-insertion acceptance criterion is a shell pipeline that always exits 0 — a forgotten insertion passes

**Plan:** 03-09-PLAN.md Task 2 `<acceptance_criteria>`, third bullet

**Fix:** Replace with a single `node -e` check that reads the gate file's existence and the ROADMAP content together and exits 1 on disagreement, e.g. assert `fs.existsSync(gate) === /### Phase \d+: Close the forward dependencies/.test(roadmap)` and that when the gate is open ROADMAP contains no second `### Phase 6: The Office 

---

## #26 — [MED] 03-06 Task 2's only automated verification is a test file the plan neither owns nor modifies — green before and after the task

**Plan:** 03-06-PLAN.md Task 2 `<acceptance_criteria>` and `<verify>`

**Fix:** Change Task 2's `<verify><automated>` to `node --test test/hire-manifest.test.cjs` (the file the action actually extends and the plan owns), and add an acceptance criterion naming the two cases by test title so their absence is detectable.

---

## #27 — [MED] 03-05's digest content builder is specified as PRIVATE and non-pure, yet its identity-stamp and never-implies-completion assertions are required from a test that can only reach exports

**Plan:** 03-05-PLAN.md Task 1 `<behavior>` bullet 6, `<action>`, `<ac

**Fix:** Pick the pure form the `<behavior>` block already specifies: export `buildDigestContent(costRows, tasks, board, projectLabel)` taking its inputs as arguments, and have the fire callback do the `hive.*` reads. Delete "private" from the action.

---

## #28 — [MED] 03-03's "SQLite survives what the 64KB tail read does not" claim is verified by feeding rows into a pure function and asserting they come back — and is in no acceptance criterion at all

**Plan:** 03-03-PLAN.md Task 3 `<behavior>` final bullet; 03-VALIDATIO

**Fix:** Put the driver where it can run: extend `test/db-fts.test.cjs` (already 03-03's file, already loads real SQLite) with a case that writes >8 MB of events through `recordEvent`, then asserts `eventsInRange(dayStart, dayStart+3600000).length >= 1`. Add it as an acceptance criterion; drop the vacuous phrasing from Task 3.

---

## #29 — [MED] 03-08's `spawnedAt` consumer has no typed producer anywhere in the plan set — 03-02 only widens the raw IPC payload, and neither AgentDirectoryEntry nor the renderer Agent type is owned by any Phase 3 plan

**Plan:** 03-02-PLAN.md Task 3 (:312 <files>, action's closing sentenc

**Fix:** Add `src/preload/index.ts` (widen `AgentDirectoryEntry` with `spawnedAt: number | null`) to 03-02's Task 3 <files>, and add `src/renderer/src/store/store.ts` (add `spawnedAt?: number` to `Agent`, populated wherever the store hydrates from the registry/directory) to 03-08's files_modified — after confirming no same-wave

---

## #30 — [MED] 03-02's new applyCostRow money logic (fallback baseline seed + monotonic floor) has zero test coverage in the plan set, and 03-VALIDATION.md's row for it is owned by no plan

**Plan:** 03-02-PLAN.md frontmatter files_modified (:13) and Task 3 ac

**Fix:** Add `test/transcript-usage.test.cjs` (or `test/telemetry-auth.test.cjs`) to 03-02's files_modified after confirming no wave-2 sibling owns it, and add a Task 3 acceptance criterion that drives applyCostRow directly with the three-step fixture from <behavior> (`X`, then `a < X`, then `X` again) asserting total credited 

---

## #31 — [MED] SCALE-05 and SCALE-02 are auto-marked Complete in waves 2 and 4 by plans that deliver only half of each requirement

**Plan:** 03-02-PLAN.md frontmatter `requirements: [SCALE-05]` (wave 2

**Fix:** Change 03-02's key to `requirements_addressed: [SCALE-05]` and 03-04's to `requirements_addressed: [SCALE-02]`, leaving the literal `requirements:` key only on the last plan that closes each (03-08 for SCALE-05, 03-06 for SCALE-02), mirroring the pattern 03-01 already documents. Add a 03-09 criterion asserting SCALE-05

---

## #32 — [MED] spawnedAt never reaches the renderer — hive:agentDirectory has zero renderer callers and no plan adds one, so the card's 'up' cell renders 'not recorded' forever

**Plan:** 03-02-PLAN.md Task 2 <action> ("surface `spawnedAt` in `hive

**Fix:** Add an explicit step to 03-08 Task 1: fetch `window.cth.hiveAgentDirectory()` (poll or on-agent-change) inside `agentView.ts`'s singleton and publish `spawnedAt` per agent, with an acceptance criterion `grep -n "hiveAgentDirectory" src/renderer/src/store/agentView.ts` matches >= 1 and a test/repo-claims.test.cjs produc

---

## #33 — [MED] The 'No record before {HH:mm}' gap sentence formats a whole-store firstTs as a time-of-day on the day being viewed

**Plan:** 03-07-PLAN.md Task 1 <behavior> (the two gap-cause sentences

**Fix:** Have `summarizeDay` compare `firstTs` against `dayStartMs`: when `firstTs >= dayStartMs + 86400000` render a whole-day sentence ("No record for this day — it is older than what is stored."), when `firstTs < dayStartMs` render no gap at all, and only use the `{HH:mm}` form when `firstTs` falls inside the viewed day. Add

---

## #34 — [MED] dailyCostRows is a second, untested implementation of ADR-0005's arithmetic, and its only acceptance criterion is a grep for its own name — yet it is the sole cost source for both the day band and the Slack digest

**Plan:** 03-03-PLAN.md Task 2 <action> lines 301-303 and <acceptance_

**Fix:** Have `applyCostRow` return its delta (see the sink finding) and implement `dailyCostRows` as a thin loop over the SAME exported function so there is exactly one diff implementation, explicitly including rows with `task_id: null` in the day total. Replace criterion 318 with a real test in test/hive-protocol-v2.test.cjs:

---

## #35 — [MED] The digest's mandated "honest limitation" sentence names a control that does not exist under that name and is unreachable from the app after onboarding — and an acceptance grep freezes the wrong wording in place

**Plan:** 03-05-PLAN.md Task 3 (behavior + acceptance_criteria); 03-UI

**Fix:** Change the sentence in both 03-UI-SPEC.md:841 and 03-05-PLAN.md:314/:353 to name the real, reachable state, e.g. `Requires Open at login, which is set during onboarding and is not yet changeable here. Closing the window on Windows ends the process, and a closed process sends nothing.` — or add the `openAtLogin` toggle 

---

## #36 — [MED] 03-07 has no copy and no criterion for a day entirely before the record begins — the sentence it does mandate renders as nonsense for the most likely operator action

**Plan:** 03-07-PLAN.md Task 1 (behavior + acceptance_criteria); 03-UI

**Fix:** Add a fourth `<behavior>` bullet and a fourth grep to 03-07 Task 1 for `Nothing was recorded on {date}. The stored record starts {firstDate}.` (UI-SPEC:228), branched when `firstTs > dayEndMs`; and pull UI-SPEC:230-231's two remaining day-band empty states (`Nothing in this fifteen minutes.` for the selected-bucket cas

---

## #37 — [MED] The team-import path spawns members without ever showing the final command or its commandFlags, falsifying src/shared/hire.ts's stated security model

**Plan:** 03-06-PLAN.md Task 2 (TeamReviewModal) and its threat regist

**Fix:** Either render each member's built command string (or at minimum its commandFlags) on the row per UI-SPEC §S3a, or make the team branch drop `commandFlags` entirely (team@1 v1 already drops skills/mcpServers per D-19 — same treatment, one line in validateTeamManifest). Whichever is chosen, amend src/shared/hire.ts:11-14

---

## #38 — [MED] Plan 5's threat register claims an acceptance criterion checks the Slack bot token is never logged; no such criterion exists

**Plan:** 03-05-PLAN.md threat register T-03-05a, Task 3

**Fix:** Add a real criterion, e.g. `node -e` over whitespace-squeezed src/main/slack.ts asserting no `console.*` call in postSlackDigest's body references `botToken`/`opts`/`headers`, paired with a positive lower bound (`grep -c "opts.botToken" src/main/slack.ts >= 1` for the Authorization header itself), or delete the claim f

---

## #39 — [MED] Plan 5's deps.send pin is vacuous — the grep requires 'deps.send' and 'digest' on the SAME line, and T-03-05d cites it as the mitigation

**Plan:** 03-05-PLAN.md Task 2 acceptance criteria; threat register T-

**Fix:** Replace with a structural check: `node -e` that loads boot.ts's source, extracts the armDigestTimer function body by brace-matching, asserts it contains `deps.notify` (positive lower bound >= 1) and zero occurrences of `deps.send`. Same treatment for T-03-05d's claim.

---

## #40 — [MED] 03-02's new monotonic floor permanently strands a transcript-fallback baseline, silently zeroing all later spend for that agent

**Plan:** 03-02-PLAN.md Task 2 <action> (the branch added for round-1 

**Fix:** Bound the floor: suppress only a small, short-lived decrease — re-seed the baseline to `now` after N consecutive beats below it, or when the drop exceeds a fraction of the baseline — and log once on re-seed. Add a fourth fixture case (X, then X-a sustained for three samples, then X+b) asserting b is credited.

---

## #41 — [MED] 03-06 Task 2's acceptance criteria and <verify> run a test file the plan does not modify and that cannot see the component under test

**Plan:** 03-06-PLAN.md Task 2 (<acceptance_criteria> final bullet, <v

**Fix:** Change the criterion and verify to `node --test test/hire-manifest.test.cjs` (or a new `test/team-review.test.cjs` this plan owns) and specify the pure function to extract — e.g. `export function markDuplicates(members): Array<{member; checked; note}>` — so the default-unchecked rule is assertable without React.

---

## #42 — [MED] 03-03's headline SCALE-03 proof — SQL survives what the 64KB tail read does not — has no acceptance criterion and no test file that can run it

**Plan:** 03-03-PLAN.md must_haves truth #2 and Task 3 <behavior> fina

**Fix:** Move this bullet into Task 1 (whose file, test/db-fts.test.cjs, already loads real SQLite via PersistStore) as a concrete case: insert N events spanning a day, plus write >64KB into a temp `log.jsonl`, then assert `eventsInRange(dayStart, dayStart+3600000).length >= 1` while a `tailLines`-equivalent read of the same fi

---

## #43 — [MED] 03-09's Phase 6→7 sweep omits ROADMAP.md's own four 'Phase 6' mentions, shipping the half-renumber the plan exists to prevent

**Plan:** 03-09-PLAN.md <interfaces> "The Phase 6 -> 7 sweep", Task 1 

**Fix:** Add ROADMAP.md's four mentions to the enumerated sweep list (16 → 20) and add the symmetric criterion: IF inserted, `grep -c "Phase 6" .planning/ROADMAP.md` equals 0 AND `grep -c "Phase 7" .planning/ROADMAP.md` >= 4; IF withheld, unchanged from the pre-edit baseline of 4.

---

## #44 — [LOW] 03-03's timeline.ts purity guard uses an import path this repo never writes — the db/hive half of the grep can never match

**Plan:** 03-03-PLAN.md Task 3 acceptance criterion 2

**Fix:** Change the pattern to `from '\./` (any relative sibling import) plus `electron`, or assert positively in test/timeline.test.cjs that `loadTs('src/main/timeline.ts')` succeeds with no stub setup and that the source contains zero `^import ` lines.

---

## #45 — [LOW] D-17's same-commit IPC-pin rule is undercut in 03-02 and 03-03: the action mandates editing test/boot-floor.test.cjs but the task's <files> omits it — 03-04 gets it right, proving the omission is a defect not a convention

**Plan:** 03-02-PLAN.md Task 1 (:265 <files>, :290 action) and 03-03-P

**Fix:** Add `test/boot-floor.test.cjs` to 03-02 Task 1's <files> and 03-03 Task 3's <files>, matching 03-04 Task 1. Both plans already carry it in frontmatter files_modified (03-02:13, 03-03:16), so this is a one-token edit per task.

---

## #46 — [LOW] Plan 3's negative grep protecting timeline.ts's import-free property cannot match the imports it targets — wrong relative path

**Plan:** 03-03-PLAN.md Task 3 acceptance criteria

**Fix:** Change the pattern to `from '\./db'\|from '\./hive'\|from 'electron'` (and keep a positive lower bound alongside, e.g. `grep -c "^import" src/main/timeline.ts` is 0 while `grep -c "export function" src/main/timeline.ts >= 4`).

---

## #47 — [LOW] 03-03 Task 2 tells the executor to update 'appendCostLedger's one call site' when applyCostRow has two callers

**Plan:** 03-03-PLAN.md Task 2 <action>

**Fix:** Say "both call sites (hive.ts:2554 in appendCostLedger and hive.ts:2642 in rescanCostLedger)" and add the acceptance criterion `grep -c 'this.applyCostRow' src/main/hive.ts` equals exactly 0, alongside the existing `private applyCostRow` == 0 check.

---
