# Phase 3 — Red-Team Round 3 (consolidated findings)

**Date:** 2026-08-24 · **Run:** `wf_ee6b581b-621` · 94 raised → 53 refuted → **41 confirmed**

**Confirmed:** 0 BLOCKER · 11 HIGH · 24 MED · 6 LOW

**Trend:** R1 = 3 BLOCKER / 19 HIGH · R2 = 1 / 20 · R3 = **0 / 11**. Blockers eliminated; HIGH nearly halved.

**Iteration budget:** the plan-phase workflow caps the red-team at 3 rounds. This is round 3 and HIGHs remain open, so `RED_TEAM_CLEAN` stays **false** and the phase does NOT advance to execution without an explicit operator decision.

---

## #1 — [HIGH] 03-02's display-join swap fabricates a NEIGHBOUR agent's spend for every non-codex fallback agent — a measured dollar figure shown on the fleet snapshot and the agent card that is not that agent's money

**Plan:** 03-02-PLAN.md, Task 2 ("wire resolveCodexHome, spawnedAt (+ 

**Fix:** Do not source the display join from `getAgentUsage` for an agent whose transcript fallback is a whole-cwd read that is not provably scoped to that agent. Either (a) gate the cwd branch of `transcriptFallback` on `provider === 'claude'` AND the agent being the only registry agent with that cwd (`Object.values(reg.agents

---

## #2 — [HIGH] 03-07's day-band cost-track gap declaration counts only costTracking:'none' agents, so the Accepted Residual's transcript-tier engines render as a silent zero on the cost track

**Plan:** 03-07-PLAN.md, Task 1 <behavior> and acceptance criteria (th

**Fix:** Widen 03-07's declaration to every provider whose spend cannot reach the ledger: count agents whose `costTracking` is `'none'` OR `'transcript'` (and add the sentence variant naming the ledger, not the meter, for the transcript case), and add the transcript-tier case to the plan's `renderToStaticMarkup` test seeding. A

---

## #3 — [HIGH] 03-02 Task 1 is tdd=true but snapshotAll()'s three specified behaviours have no test anywhere — a `return {}` stub passes every criterion, and 03-08 consumes it to close D-36's fail-unsafe window

**Plan:** 03-02-PLAN.md Task 1 (<behavior>, <files>, <acceptance_crite

**Fix:** Add `test/breaker.test.cjs` to 03-02's files_modified and Task 1 <files>; add to <action>: write two cases against a real `CircuitBreaker` — (a) fresh instance, `snapshotAll()` deep-equals `{}`; (b) after one `tick()` escalating `a1` to `'constrained'`/`'cost cap'`, `snapshotAll().a1` has `level === 'constrained'`, `re

---

## #4 — [HIGH] 03-02's T-03-02d claims a same-cwd codex fixture as its mitigation; the fixture is specified in <behavior> but written by no <action> step and detectable by no criterion — the only test command is an already-green file

**Plan:** 03-02-PLAN.md Task 2 <behavior> bullet 3, <action>, <accepta

**Fix:** Move the fixture into Task 2's <action> as an explicit instruction, and add a criterion that cannot pass without it, e.g. `node -e` asserting `test/telemetry-auth.test.cjs` contains both `resolveCodexHome` and two agents sharing one cwd (`grep -c "resolveCodexHome" test/telemetry-auth.test.cjs` is `>= 1`, currently 0 —

---

## #5 — [HIGH] 03-09 Task 1's Phase-6 sweep criterion mechanically forbids the owner-column value the same task's action mandates — round-2 #8's fix was applied to Task 2 only

**Plan:** 03-09-PLAN.md Task 1 (action :169, acceptance_criteria :187)

**Fix:** Replace 03-09-PLAN.md:187's blanket count with the targeted form already used in Task 2, e.g. `grep -c "Phase 6:" .planning/REQUIREMENTS.md` == 0 plus `grep -c "Phase 6 — Close the forward dependencies" .planning/REQUIREMENTS.md` == 2 and `grep -c "Phase 7" .planning/REQUIREMENTS.md` >= 14 — i.e. assert the 14 GSD/DESK

---

## #6 — [HIGH] 03-09 Task 1's own action writes "Phase 6" into REQUIREMENTS.md while its acceptance criterion demands zero occurrences — the plan cannot pass on the gate-open path

**Plan:** 03-09-PLAN.md Task 1 (<action> owner-column edit vs. its las

**Fix:** Replace the blanket count with a targeted check, as round-2 #8 actually prescribed: assert the 12 GSD/DESK/REACH rows plus `:501`'s mapped-count line and `:519`'s split-category line all read "Phase 7" (`>= 14` "Phase 7" occurrences), and assert `grep -c "Phase 6" REQUIREMENTS.md` equals exactly `2` (the two SCALE owne

---

## #7 — [HIGH] 03-06's uniqueId collision test cannot reach the production id path — uniqueId is module-private in AddAgentModal.tsx and the plan's test file loads only bulkSpawn.ts

**Plan:** 03-06-PLAN.md Task 1 <behavior> (three same-named members ge

**Fix:** Move the batch id generation out of the component into an exported, loadable function (e.g. `batchAgentIds(names: string[], now: number): string[]` in `bulkSpawn.ts` or `store/config.ts`), have `AddAgentModal`'s single-hire path call it too, and drive it directly from `test/bulk-spawn.test.cjs` with a fixed clock. Repl

---

## #8 — [HIGH] hive:timeline's success and failure shapes are different discriminants and 03-07 specifies no error branch — a rejected day silently renders as an empty timeline

**Plan:** 03-03-PLAN.md Task 3 <action> (thin handlers) vs 03-07-PLAN.

**Fix:** Pin one return shape in 03-03 (`{ok:true, buckets, firstTs}` / `{ok:false, error}`), restate it in 03-07's <interfaces>, and add a 03-07 behavior case + acceptance criterion: an injected `summary` of `{ok:false, error}` (or `null`) renders a distinct "could not read the record" sentence, never the quiet-day or fresh-in

---

## #9 — [HIGH] Events retention (30d) plus a never-rotated cost-ledger.jsonl makes the day band assert "Nothing was recorded on {date}" while drawing real cost bars for that same day

**Plan:** 03-03-PLAN.md Task 1 (EVENTS_RETENTION_DAYS, line 245) + mus

**Fix:** Make the record's start cover BOTH stores or neither: either have hive:timeline compute firstTs as `min(earliestEventTs(), earliest ledger ts)`, or suppress/mark the cost track for any day earlier than `earliestEventTs()` with its own declared sentence ("events for this day have aged out of the {N}-day record; cost is 

---

## #10 — [HIGH] bucketDetail's 200-row cap is applied BEFORE the renderer drops zero-delta cost rows, so idle beats crowd real events out of the bucket and the truncation count misreports what is shown

**Plan:** 03-03-PLAN.md Task 3 <behavior> (line 399) vs 03-07-PLAN.md 

**Fix:** Filter zero-delta cost rows inside `dailyCostRows` (or at the top of `bucketDetail`) BEFORE the cap, and define `total` as the count of DISPLAYABLE rows. Add a timeline.test.cjs case: one bucket of 150 zero-delta cost rows + 60 events must return all 60 events and truncated:false.

---

## #11 — [HIGH] 03-09 Task 1's acceptance criterion mechanically forbids the edit its own <action> mandates — round-2 finding #8 was fixed in Task 2 but not in Task 1

**Plan:** 03-09-PLAN.md Task 1 <action> vs Task 1 <acceptance_criteria

**Fix:** Change Task 1's criterion to the targeted form Task 2 already uses: assert `grep -c "### Phase 6:" ...`-style GSD-specific absence instead of a blanket count — e.g. `node -e` asserting REQUIREMENTS.md contains zero of the 14 GSD/DESK/REACH `Phase 6` rows (match `| GSD-0`/`| DESK-0`/`| REACH-0` lines followed by `Phase 

---

## #12 — [MED] The mandated regression pins in 03-05 and 03-08 (D-38 anti-push.ts call-site pin; the three-file shared-derivation pin) live only in <action>/<behavior> prose — their sole criterion is `node --test test/repo-claims.test.cjs`, green before any work

**Plan:** 03-05-PLAN.md Task 3 <action> (:386-389) + <acceptance_crite

**Fix:** For each, add a criterion the pin's absence fails: `grep -n "postSlackDigest" test/repo-claims.test.cjs` matches `>= 1` (currently 0) and `grep -n "deriveContextColor" test/repo-claims.test.cjs` matches `>= 1` (currently 0). A grep for the pin's own subject inside the test file is the cheapest non-vacuous form.

---

## #13 — [MED] 03-VALIDATION.md's map still requires two behaviours the revision deliberately removed or narrowed — the contract will read as satisfied for work no plan does

**Plan:** 03-VALIDATION.md Per-Requirement Verification Map (SCALE-05 

**Fix:** Retire the SCALE-05 ledger row (or restate it as the declared Accepted Residual owned by PARITY-02) and restate the SCALE-03 row to whatever 03-03 actually drives (64KB tail-cap) or extend 03-03's driver past LOG_ROTATE_BYTES so `log.jsonl.1` is genuinely exercised. Do it in the same 03-09 task that de-drafts 03-VALIDA

---

## #14 — [MED] 03-03's new appendCostLedger `node -e` guard prints PASS vacuously if its anchor misses — no positive lower bound asserts the anchor was found or the sliced body is non-empty

**Plan:** 03-03-PLAN.md Task 2 <acceptance_criteria>, bullet 2

**Fix:** Prepend the positive half: `if(i<0||j<0||j<=i){console.error('FAIL: anchor not found — the guard is vacuous');process.exit(1);}` and add `if(!/costByTask|costCumulative/.test(body)){console.error('FAIL: sliced body is not appendCostLedger');process.exit(1);}` before the negative test. Apply the same anchor-found guard 

---

## #15 — [MED] 03-03 claims 03-VALIDATION.md's test-file misattribution 'is corrected by this plan' while owning no edit to that file

**Plan:** 03-03-PLAN.md Task 2 <action> (:350-352) vs 03-03-PLAN.md fr

**Fix:** Either add 03-VALIDATION.md to a plan's files_modified with an explicit one-line edit to that row, or delete the 'is corrected by this plan' clause and fold the doc fix into the 03-09 task that de-drafts 03-VALIDATION.md (see the unowned-validation-doc finding).

---

## #16 — [MED] 03-06 misattributes ownership of test/renderer-components.test.cjs to 03-04, and its own criterion + verification block run two test files its actual same-wave sibling 03-08 is rewriting

**Plan:** 03-06-PLAN.md Task 2 acceptance (:282-:284) and <verificatio

**Fix:** Delete test/renderer-components.test.cjs and test/renderer-runstate.test.cjs from 03-06's acceptance criteria and <verification> block — 03-06 owns neither — and correct the parenthetical at 03-06-PLAN.md:283 to name 03-07 (wave 4) and 03-08 (wave 5) as the actual owners.

---

## #17 — [MED] 03-04's acceptance criterion runs 03-07's test file green as a gate while 03-07 is rewriting it in the same wave

**Plan:** 03-04-PLAN.md Task 3 acceptance (:439-:440) and <verificatio

**Fix:** Replace the criterion with one 03-04 actually controls: `git diff --name-only` shows no change to test/renderer-components.test.cjs from this plan's commits. Drop test/renderer-components.test.cjs from 03-04-PLAN.md:470's <verification> command.

---

## #18 — [MED] 03-01's persist.repoint() at config:update sits outside the existing try/catch; PersistStore.open() throws on any non-corruption failure and would skip startHiveServices(), reintroducing the D-12 dead-services bug

**Plan:** 03-01-PLAN.md Task 2 <action> (the config:update wiring)

**Fix:** Wrap the new calls in their own guard, mirroring `boot.ts:1155`: `try { persist.repoint(); repointFiredStore(); } catch (e) { console.error('[hive] repoint at first-run transition:', e); }`, placed before `startHiveServices()`. Add an acceptance criterion asserting the repoint calls are inside a try/catch (a `node -e` 

---

## #19 — [MED] codexHomeFor(id) is wrong for a resumed codex agent whose CODEX_HOME was repointed to the owning sibling's home — the display join silently reads an empty home and reports zero

**Plan:** 03-02-PLAN.md Task 2 <behavior> ("reads its OWN isolated hom

**Fix:** Record the effective CODEX_HOME on the registry entry at spawn (the value in `opts.env.CODEX_HOME` after the resume branch has run) and have `codexHomeFor(id)` return that recorded value, falling back to `join(agentDir(id),'.codex')` only when absent. Add a behavior case: a codex agent whose registry entry records a si

---

## #20 — [MED] 03-02's "hive:agentDirectory has zero renderer callers today" is false — four live callers in realtime/tools.ts will silently narrate lifetime cumulative totals

**Plan:** 03-02-PLAN.md <interfaces> (AgentDirectoryEntry note) and th

**Fix:** Correct the <interfaces> claim (four callers at `src/renderer/src/realtime/tools.ts:481,526,578,630`), and either widen T-03-02f's mitigation to require `realtime/tools.ts` to phrase a `costLifetime: true` row as an all-time total, or record it as an explicit accepted residual naming those four call sites.

---

## #21 — [MED] 03-04 Task 2 contradicts itself on the hire@1 byte cap: <behavior> says byte-identical, <action> raises the pre-parse gate to 256KB with a vague escape clause and no criterion

**Plan:** 03-04-PLAN.md Task 2 <behavior> vs <action>, and threat T-03

**Fix:** Replace the escape clause with a definite rule: gate at `TEAM_MAX_BYTES` for the read, then immediately after the spec is known reject a `hire@1` document whose file size exceeded `HIRE_MAX_BYTES`. Add an acceptance criterion / test case: a 100KB well-formed `hire@1` file returns `{ok:false, error:'manifest too large'}

---

## #22 — [MED] team:export on an unreadable or absent roster writes a valid empty-members file with ok:true, skipped:0 — indistinguishable from a genuinely empty floor

**Plan:** 03-04-PLAN.md Task 2 <behavior> (last bullet) and Task 3 <ac

**Fix:** Distinguish the two cases in the handler: return `{ok:false, error:'no roster to export'}` when `roster.read()` returns null (as opposed to returning a snapshot with an empty `agents` array), and surface a `members.length === 0` result in the UI the same way `skipped > 0` is surfaced. Add a behavior case and an accepta

---

## #23 — [MED] `return delta;` as "the function's final statement" cannot compile or cannot satisfy the plan's own null-task_id requirement — applyCostRow has an EARLY return at hive.ts:2621

**Plan:** 03-03-PLAN.md Task 2 <action> (lines 330-345) and <behavior>

**Fix:** State the required change explicitly: `if (!taskId) return delta;` at hive.ts:2621 plus `return delta;` at the end — TWO edits, not one — and say so in the action text, or leave applyCostRow `void` and have dailyCostRows compute its per-row delta from a returned `{delta}`-style object. Add an acceptance criterion that 

---

## #24 — [MED] The daily digest ships a "total spend" figure with no capability-gap declaration, though 7 of 11 engines never reach cost-ledger.jsonl (D-35 applied to 03-07 and 03-08 but not 03-05)

**Plan:** 03-05-PLAN.md Task 1 <behavior> (line 197) and <action> (lin

**Fix:** Give buildDigestContent the same declaration: pass in the roster's providers (or a precomputed count) and append the existing 'no cost meter' vocabulary — `{n} agent(s) report no cost meter; their spend is not in this total.` — with a digest-scheduler.test.cjs assertion that a fixture containing a costTracking:'none' a

---

## #25 — [MED] The retention DELETE runs on every open with no guard, turning a transient BUSY / read-only / full disk into a store that never opens — the failure class db.ts's own migration comment warns about

**Plan:** 03-03-PLAN.md Task 1 <action> (lines 244-250)

**Fix:** Specify the retention call as best-effort — `try { stmt.run(cutoff); } catch { /* retention is not worth failing an open over */ }` — placed after `this.db` is assigned in `open()` (covering the quarantine retry path too), and add the assertion that a store still opens when the DELETE fails.

---

## #26 — [MED] 03-07's declared hiveTimeline contract has no `ok` discriminator while 03-03's handler returns `{ok:false, error}` (and a zeroed result when the store is closed) — an error path renders as $0.00 spend

**Plan:** 03-07-PLAN.md <interfaces> (line 134) vs 03-03-PLAN.md Task 

**Fix:** Settle one shape in 03-03 and copy it verbatim into 03-07's <interfaces>: `{ok: true, buckets, firstTs} | {ok: false, error}`, and require DayBandTab to render a distinct declared-error state (never the quiet-day or fresh-install copy) for `ok:false`, with a renderer-components case that injects an `ok:false` summary a

---

## #27 — [MED] The consolidated card's `context` cell has no declared-gap branch anywhere in 03-08 — UI-SPEC's `not reported` (never `0%`) is mandated in the contract and implemented by no task, no action and no criterion

**Plan:** 03-08-PLAN.md Task 1 <behavior>/<action>/<acceptance_criteri

**Fix:** Add a fifth derivation to Task 1 — `deriveContext(contextTokens, contextLimit)` returning `{kind:'measured', tokens, limit, pct}` or `{kind:'unmeasured'}` — bump Task 1's export-count criterion from `>= 4` to `>= 5`, and add to Task 3: `grep -n "not reported" src/renderer/src/components/AgentDetailPanel.tsx` matches `>

---

## #28 — [MED] Rewiring AgentCard's gauge colour to `deriveContextColor(tokens, limit)` silently deletes the compaction warning for every agent whose limit was inferred — and the plan states two incompatible signatures for that function

**Plan:** 03-08-PLAN.md Task 2 <behavior>:236-239 and <action>:246-249

**Fix:** Fix the signature to one shape and state it once. For AgentCard specify the call explicitly — `deriveContextColor` fed the card's existing `pct` (`Math.min(8, Math.max(0, progress))/8*100`), not `(contextTokens, contextLimit)` — and add a Task 2 criterion asserting the rendered colour for `{progress: 7, contextLimit: u

---

## #29 — [MED] 03-08's blocking containment checkpoint measures one container width three times: AgentDetailPanel's width is `sidebarWidth`, not the viewport, so 1280/1024/800 all render the card identically and the gate cannot fail

**Plan:** 03-08-PLAN.md Task 4 <how-to-verify> steps 2-3 (`:336-341`);

**Fix:** Replace the viewport widths with the variable that actually drives this container: have the operator drag the splitter to `sidebarWidth` = 320 (clamp floor), 420 (default) and 900, and record the observed column count at each. Add the base-sha/head-sha + `Emulation.setDeviceMetricsOverride` method from 03-UI-SPEC.md:32

---

## #30 — [MED] 03-07's new cost-meter gap declaration is computed from TODAY's live roster, so it is absent on exactly the historical days where the cost track really is missing spend

**Plan:** 03-07-PLAN.md Task 1 <behavior>:198-206 and <acceptance_crit

**Fix:** Derive the declaration from the agents that produced the VIEWED day's rows, not from the live roster — e.g. have 03-03's `hive:timeline` return the distinct `agent_id`s (or a `costGapAgents: number`) for the day and render the sentence from that; failing that, restate the sentence so it is true of what it measures ("ag

---

## #31 — [MED] UI-SPEC:230's `Nothing in this fifteen minutes.` — the selected-bucket empty state — is in no plan, so round-1 #36's prescribed fix was only half applied

**Plan:** 03-07-PLAN.md Task 2 (detail list, S1f) — no behaviour bulle

**Fix:** Add a Task 2 behaviour bullet and criterion: `grep -n "Nothing in this fifteen minutes" src/renderer/src/components/DayBandTab.tsx` matches `>= 1`, asserted through the injected `bucket` prop with `rows: []` so it is first-pass markup.

---

## #32 — [MED] The per-member bulk-hire failure copy — the one error string UI-SPEC calls non-fatal by contract — has no acceptance criterion and no test in 03-06

**Plan:** 03-06-PLAN.md Task 2 <behavior> ("renders that row's OWN err

**Fix:** Quote the copy in Task 2's `<behavior>`, add `grep -n "did not start" src/renderer/src/components/TeamReviewModal.tsx` matches `>= 1` to the criteria, and add a step to the Task 3 checkpoint that forces one member's spawn to fail (e.g. a member with an unspawnable engine) and confirms the row shows it while the rest co

---

## #33 — [MED] Team import spawns N agents with no cwd surface anywhere — the single-hire path's hard folder guard has no analogue

**Plan:** 03-06-PLAN.md, Task 2 (TeamReviewModal) and 03-UI-SPEC.md §S

**Fix:** Add a folder row to §S3a and a Task-2 <behavior> bullet + acceptance criterion: TeamReviewModal renders the single shared root (reusing AddAgentModal's registeredRepos quick-pick), `hire {n}` is disabled while it is empty, and the chosen path is passed into every member's spawn descriptor. Cite 03-CONTEXT.md:633 (not D

---

## #34 — [MED] The D-38 anti-push.ts caller pin for postSlackDigest is satisfied by the function's own definition, so a callerless sender goes green

**Plan:** 03-05-PLAN.md, Task 3 <action> (line 386-388) and must_haves

**Fix:** Write the pin as a call-site count that excludes the declaration — e.g. count matches of `postSlackDigest(` across comment-stripped src/main/**, minus matches of `function postSlackDigest(`, and assert `>= 1`; or pin the call directly: the comment-stripped body of boot.ts contains `postSlackDigest({` at least once. Add

---

## #35 — [MED] 03-06 Task 1 mandates the uniqueId collision fix and its test, but uniqueId is module-private inside AddAgentModal.tsx, that file is absent from the task's <files>, and no instruction says to export or relocate it — the mandated test cannot be written

**Plan:** 03-06-PLAN.md Task 1 <files>, <action> ("Fix the `uniqueId` 

**Fix:** Name the mechanism concretely: move the id generation into `bulkSpawn.ts` as `export function batchIds(names: readonly string[], now: number): string[]` (running per-slug counter, `now` injected), have AddAgentModal.tsx's `uniqueId` delegate to `batchIds([name], Date.now())[0]`, add `src/renderer/src/components/AddAgen

---

## #36 — [LOW] Four criteria across the phase state no pass/fail threshold at all — they cannot be executed as gates

**Plan:** 03-04-PLAN.md Task 1; 03-01-PLAN.md Task 2; 03-08-PLAN.md Ta

**Fix:** 03-04: `node -e` slicing `validateTeamManifest`'s body and asserting it contains `validateHireManifest(` `>= 1` AND that `src/shared/hire.ts` contains exactly one `FLAG_RE`/`MODEL_RE`/`SAFE_FLAG_NAMES` declaration each. 03-01: state the measured baseline number inline (as 03-09's criteria already do — 'baseline (4, ver

---

## #37 — [LOW] Wave-label prose in 03-09 and 03-06 contradicts the frontmatter, and 03-09 miscounts which plans carry requirements_addressed

**Plan:** 03-09-PLAN.md Task 1 acceptance (:185); 03-06-PLAN.md <inter

**Fix:** Change 03-09-PLAN.md:185 to "this task is wave 7, last", change 03-06-PLAN.md:135 to "From 03-04 (wave 4, landed before this plan)", and correct the requirements_addressed plan list at :185 to (01, 02, 03, 04, 07).

---

## #38 — [LOW] UI-SPEC S4 still mandates the copy `Requires Start at login.` that round-1 #35 established names a control the app does not have — only 03-05 was corrected, leaving two conflicting binding contracts

**Plan:** 03-UI-SPEC.md:841 vs 03-05-PLAN.md Task 3 <behavior>:345-350

**Fix:** Edit 03-UI-SPEC.md:841 to the corrected sentence and add a one-line note that the control's real, onboarding-only name is `OPEN AT LOGIN` (OnboardingWizard.tsx:683), so the two contracts agree.

---

## #39 — [LOW] 03-06's gate on `test/renderer-components.test.cjs` rests on a false ownership claim and points at a file its own same-wave sibling is editing

**Plan:** 03-06-PLAN.md Task 2 <acceptance_criteria> final bullet; cro

**Fix:** Delete the criterion, or repoint it at the file 03-06 actually owns (`test/team-review.test.cjs`) and correct the rationale to name 03-08 as the wave-5 owner of `test/renderer-components.test.cjs`.

---

## #40 — [LOW] 03-03 Task 2's applyCostRow instruction is self-contradictory and does not typecheck: the body's early `return;` cannot coexist with the widened `{tokens,usd}` return type, and it silently zeroes the `task_id: null` day total the same task mandates

**Plan:** 03-03-PLAN.md Task 2 <action> + <behavior> ("applyCostRow no

**Fix:** Say explicitly that the early `if (!taskId) return;` becomes `if (!taskId) return delta;` — i.e. the hoist has TWO edits, not one — and drop "BYTE-IDENTICAL"/"VERBATIM" from <behavior>, the artifacts line ("applyCostRow hoisted byte-unchanged") and the success criteria. Add an acceptance criterion that actually detects

---

## #41 — [LOW] 03-08 Task 2's <behavior> carries a worked example that is arithmetically wrong and self-contradicting in the same sentence — an executor writing the mandated boundary test from the first half writes a test that fails

**Plan:** 03-08-PLAN.md Task 2 <behavior> bullet 2

**Fix:** Delete the leading clause. Keep only: "pct = 86 now renders coral where it used to render lemon; pct = 80 renders lemon under both thresholds and is the control case."

---
