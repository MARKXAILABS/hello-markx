# Phase 3 — Red-Team Round 7 (the honest verification round)

**Date:** 2026-08-25 · **Run:** `wf_acbb75f3-9cf` · **72 agents, 0 errors**

64 raised → 35 refuted → **29 confirmed**

**0 BLOCKER · 8 HIGH · 15 MED · 6 LOW**

> **Why this round exists.** Two earlier runs reported `clean: true`. Both were false. Run B's deciding round raised 0 findings because ALL EIGHT lens agents died on a session limit — a gate that passed because it parsed nothing (this repo recorded that class as D-40). Run A lost most of its verifiers the same way, silently converting real findings into refuted ones. This round ran with zero agent errors and is the first trustworthy verdict since round 5.

---

## #1 — [HIGH] hasOwnCostSource judges cwd-uniqueness against ONE project's registry, so a cwd shared with another PROJECT's agent renders both projects' transcript spend as this agent's measured money

**Plan:** 03-02-PLAN.md — must_haves truth 4 and <interfaces> "New in 

**Fix:** hasOwnCostSource cannot be decided from one registry. Either (a) restrict the claude arm to an agent whose transcripts are provably its own by SESSION (filter with the `ReadUsageOptions.sessionId` filter the plan itself notes exists at transcript.ts:299, using the registry's recorded `sessionId`), or (b) drop the claud

---

## #2 — [HIGH] hasOwnCostSource cannot exclude non-agent sessions in the same cwd (the operator's own Claude Code CLI, and deleted agents), so 'provably ITS OWN money' renders foreign spend as kind:'measured'

**Plan:** 03-02-PLAN.md — <interfaces> "New in this plan, and the fix 

**Fix:** Filter the transcript read to the agent's own sessions — pass `{ sessionId: reg.agents[id].sessionId }` through to `readAgentUsage` (ReadUsageOptions already supports it, transcript.ts:299) — or drop the claude arm of hasOwnCostSource and render costUnattributed for it. Do not describe a whole-directory sum as 'provabl

---

## #3 — [HIGH] 03-03's three load-bearing red-first test cases (proven retention, mid-day session rollover, SQL-survives-tail-cap) land in test files that are green before the work and carry no existence pin

**Plan:** 03-03-PLAN.md Task 1 (:329) and Task 2 (:478)

**Fix:** Add existence-half pins measured at 0 today, in the same shape 03-01/03-02/03-05/03-08 already use: `grep -c "EVENTS_RETENTION_DAYS" test/db-fts.test.cjs` is `>= 1`; `grep -c "eventsInRange" test/db-fts.test.cjs` is `>= 1`; `grep -cF "session_id" test/hive-protocol-v2.test.cjs` rises above its measured baseline of 1 (o

---

## #4 — [HIGH] 03-02 produces `costUnattributed` and names 03-08 as its consumer; 03-08 never mentions the field, so every cwd-sharing agent renders a measured $0.00

**Plan:** 03-02-PLAN.md Task 2 (producer) -> 03-08-PLAN.md Tasks 1 & 3

**Fix:** Add a third deriveCost branch in 03-08 Task 1 — `{kind:'unmeasured', reason: <cannot-be-attributed sentence>}` when the agent's directory entry carries `costUnattributed: true` — with a Task 3 card branch and a `grep -c "costUnattributed" src/renderer/src/store/agentView.ts >= 1` acceptance criterion (measured 0 today)

---

## #5 — [HIGH] costUnattributed is a producer-only field: no plan in the phase consumes it, so the card renders a faked $0.00 for a real-spend agent (D-35) while 03-02's threat register claims the gap is declared

**Plan:** 03-02-PLAN.md Task 2 (`costUnattributed: !u && !own`); 03-08

**Fix:** Add `costUnattributed` to 03-08's derivation contract and criteria in the same phase: widen the pinned signature to `deriveCost(agent, sample, costTracking, costUnattributed)` (or read `sample.costUnattributed`), and make it return `{kind:'unmeasured', reason: ...}` — reusing the existing gap vocabulary at `src/rendere

---

## #6 — [HIGH] hasOwnCostSource cannot see transcripts that belong to no registry entry — a "sole holder" claude agent is billed the operator's own Claude Code spend, falsifying 03-02's "never ... not that agent's money" truth

**Plan:** 03-02-PLAN.md must_haves truth :24, action :504-509, threat 

**Fix:** Either pass the agent's own session filter through the display join (`readAgentUsage(cwd, {sessionId})` via a `ReadUsageOptions` hop on `getAgentUsage`), or narrow the truth and T-03-02g to state the real property — "never another REGISTERED agent's dollars; a sole-holder claude agent's fallback total still includes ev

---

## #7 — [HIGH] 03-06's team review sheet never picks, shows, or passes a `cwd` — the one field that decides what 16 untrusted-manifest agents can read and write

**Plan:** 03-06-PLAN.md Task 2 (TeamReviewModal) — <behavior>/<action>

**Fix:** Add a folder region to Task 2's <behavior>/<action> and to 03-UI-SPEC.md §S3a: one operator-picked root, rendered as literal text in the sheet above the member rows, `hire {n}` disabled until it is set (mirroring AddAgentModal's `if (!cwd) { setError('Pick a folder first'); }` guard at submit). Add an acceptance criter

---

## #8 — [HIGH] 03-03 Task 1's acceptance criteria cannot detect that the mandated db-fts test cases were never written

**Plan:** 03-03-PLAN.md Task 1 ("migration #3 — the events table, its 

**Fix:** Add positive lower bounds over the test file, measured at 0 today: `grep -c "eventsInRange" test/db-fts.test.cjs` is `>= 1`, `grep -c "earliestEventTs" test/db-fts.test.cjs` is `>= 1`, and `grep -cF "EVENTS_RETENTION_DAYS" test/db-fts.test.cjs` is `>= 1` (the retention case must compute its expired timestamp from the c

---

## #9 — [MED] 03-03 hoists `applyCostRow` out of `private`, making 03-VALIDATION's "stays byte-unchanged" Accepted Residual a false claim and destroying 03-02's regression pin one wave later

**Plan:** 03-VALIDATION.md:70 and :110 (Accepted Residuals); 03-02-PLA

**Fix:** Reword 03-VALIDATION.md:70/:110 and 03-CONTEXT.md's first Accepted Residual to say what is actually true: the ledger APPEND GATE (`boot.ts`'s `if (sample?.sessionId) ...`) is byte-unchanged, and `applyCostRow`'s DIFF LOGIC is unchanged while the function is relocated and its return channel widened by 03-03. Replace 03-

---

## #10 — [MED] 03-08 Task 3 pre-authorizes source-grep-only coverage for the consolidated card's declared-gap branches, so 03-VALIDATION's two ❌ W0 renderer rows can be reported satisfied with nothing rendered and no negative assertion anywhere

**Plan:** 03-08-PLAN.md Task 3 (:352-:455), acceptance criteria at :43

**Fix:** Make the render half non-optional and add the negatives. Require `grep -c "AgentDetailPanel" test/renderer-components.test.cjs` `>= 1` (measured 0) AND that the load happens inside the existing shimmed `try` block at :97-124 (the `finally` restores `Module._load`, `globalThis.self` and the `.css` interception, so a lat

---

## #11 — [MED] 03-05 Task 3 assigns the `slackEnabled: false` non-dispatch case to `test/slack.test.cjs`, which cannot observe the gate, and pins none of its mandated cases — the file is green today

**Plan:** 03-05-PLAN.md Task 3, acceptance criteria at :524-:526 and :

**Fix:** Move the non-dispatch case to `test/digest-scheduler.test.cjs` (which already loads `boot.ts` via `loadTs` for Task 2's `fireDigest.toString()` check) and drive `fireDigest` with a stub `postSlackDigest` / config permutation, asserting zero calls when `slackEnabled: false`. Add existence pins measured at 0 today: `grep

---

## #12 — [MED] SCALE-01's two-home leak test — 03-VALIDATION's headline verification row and a Wave 0 item — is owned by no task in any plan, and `KnowledgeManager`'s half has no test at all

**Plan:** 03-VALIDATION.md row 1 of the Per-Requirement Verification M

**Fix:** Add the missing case to 03-01 Task 1's `<action>` and gate it: open a PersistStore under tmpdir A, write a `memory_fts` row, close; open a second store under tmpdir B and assert the same query returns 0 hits, then reopen A and assert `hits >= 1` (positive control FIRST, per D-38). Pin it with `grep -c "homeB\|home-b" t

---

## #13 — [MED] 03-05 Task 1's four digest gap-declaration cases are unpinned, and an implementation that emits both sentences UNCONDITIONALLY passes every acceptance criterion

**Plan:** 03-05-PLAN.md Task 1, acceptance criteria at :300-:322

**Fix:** Add per-case existence pins over the new file, all measured 0 at creation: `grep -c "costGapTranscript" test/digest-scheduler.test.cjs` `>= 2` (case (b) and case (c)), `grep -c "costGapNone: 0" test/digest-scheduler.test.cjs` `>= 1` (the codex-only case), and a `node -e` that calls the exported `buildDigestContent` wit

---

## #14 — [MED] 03-05 Task 3 gates three multi-token config mirrors with BRE alternation greps that the same plan's Task 1 explicitly forbids

**Plan:** 03-05-PLAN.md Task 3 acceptance criteria (the config/preload

**Fix:** Split each into per-identifier commands with `-F`: `grep -cF "dailyDigest" src/main/config.ts` `>= 1`, `grep -cF "slackDigestChannelId" src/main/config.ts` `>= 1`, `grep -cF "digestHour" src/main/config.ts` `>= 1`, and the same two-command split for `src/preload/index.ts` and `src/renderer/src/store/config.ts`. All six

---

## #15 — [MED] `team:export` applies no TEAM_MAX_MEMBERS bound, so a floor of more than 16 agents exports a team@1 file that 03-04's own `validateTeamManifest` rejects wholesale

**Plan:** 03-04-PLAN.md Task 1 (validator) vs Task 2 (exporter) — same

**Fix:** In 03-04 Task 2, cap the export at `TEAM_MAX_MEMBERS` (or reject with an explicit error naming the count) and report the truncation through the same status line as `skipped`; add an acceptance criterion `grep -cF "TEAM_MAX_MEMBERS" src/main/index.ts >= 1` plus a test case exporting a 20-member fixture roster and assert

---

## #16 — [MED] 03-09's REQUIREMENTS.md Phase 6->7 sweep creates a fresh self-contradiction at :501, and its own exactly-2 criterion mechanically forbids the honest fix

**Plan:** 03-09-PLAN.md Task 1 (gate-open path)

**Fix:** Either (a) keep the SCALE-01/SCALE-03 owner cells as "Phase 3 (re-verified in Phase 6)" so the mapping stays Phase-3-owned and :501 stays true, or (b) mandate the :501 rewrite to include "Phase 6: 2" and change the criterion from `== 2` to a targeted pair: `grep -cE '^\| SCALE-0[13] \| Phase 6' == 2` AND `grep -c "Phas

---

## #17 — [MED] 03-09 inserts a new '### Phase 6: Close the forward dependencies' section but never adds it to ROADMAP.md's top-level phase checkbox list or narrative — the criteria pass with a numbering hole

**Plan:** 03-09-PLAN.md Task 2 (gate-open path)

**Fix:** Add to Task 2's <action> an explicit instruction to insert `- [ ] **Phase 6: Close the forward dependencies** - <one-line goal>` into the checkbox list between Phase 5 and the renumbered Phase 7, and to add one clause to the :18-22 narrative; pin it with `grep -cF "- [ ] **Phase 6: Close the forward dependencies**" .pl

---

## #18 — [MED] costUnattributed is produced by 03-02 and consumed by nothing — 03-08's deriveCost still renders the unattributable case as a measured $0.00

**Plan:** 03-02-PLAN.md Task 2 (action, :521 and threat T-03-02g :658)

**Fix:** Either (a) add `costUnattributed` to 03-08 Task 1: `deriveCost` returns `{kind:'unmeasured', reason: '<subject>'s spend cannot be attributed from here — it shares a working directory with another agent.'}` whenever `sample.costUnattributed === true`, regardless of costTracking tier, with a renderer-component assertion 

---

## #19 — [MED] 03-02, 03-03 and 03-VALIDATION.md contradict each other on whether `private applyCostRow` survives the phase — the exact pin the ledger descope rests on

**Plan:** 03-02-PLAN.md Task 2 acceptance :607-608 vs 03-03-PLAN.md Ta

**Fix:** Reword 03-02:607-608 to pin the DIFF LOGIC rather than the `private` keyword (e.g. `grep -cF "Math.max(0, now.tokens - previous.tokens)" src/main/hive.ts` >= 1 AND `grep -cF "cumulative.set(key, now)" src/main/hive.ts` >= 1, both of which survive the hoist), and correct 03-VALIDATION.md:70 to say "`applyCostRow`'s diff

---

## #20 — [MED] The events retention DELETE is placed on PersistStore.open()'s throw path with no best-effort guard — a failure either bricks the store or quarantines the whole harness.db

**Plan:** 03-03-PLAN.md Task 1 action :310-322, threat T-03-03b

**Fix:** Require the retention call to sit in its own `try { ... } catch { /* best-effort: a failed sweep must never make the store unopenable */ }`, placed inside `openOnce()` after `this.migrate(db)` (the action's "inside `open()` right after `migrate()` runs" describes a call site that does not exist — migrate is called from

---

## #21 — [MED] 03-07's blocking containment gate softens three binding clauses of the Containment Protocol — CDP is made optional, the true innerWidth is never read back, and there is no positive control — so it can be signed 'approved' on unverified widths

**Plan:** 03-07-PLAN.md Task 4 (checkpoint:human-verify, gate="blockin

**Fix:** Mirror 03-08 Task 4's steps 6 and 7 into 03-07 Task 4: require `Emulation.setDeviceMetricsOverride` (drop "if available"), require printing the true `window.innerWidth` beside each requested width, add a positive control (the tab strip element and the DayBandTab root were found and mounted at every stop), and add 03-08

---

## #22 — [MED] 03-04's stripAgentForExport is verified by a 7-key denylist test, so an allowlist→spread regression ships the operator's private notes and last prompts in a file meant to be shared

**Plan:** 03-04-PLAN.md Task 2 <action> (the stripAgentForExport test)

**Fix:** Change the mandated assertion from denylist to allowlist: `assert.deepStrictEqual(Object.keys(result).sort(), ['accent','character','description','goal','model','name','provider','spec'])` (or assert `Object.keys(result)` is a subset of that set). Build the fixture from a realistic PersistedAgent including `note` and `

---

## #23 — [MED] 03-03 hoists `private applyCostRow` away, making three phase-level "byte-unchanged" claims false and directly inverting 03-02's pinned assertion

**Plan:** 03-03-PLAN.md Task 2 ("the injected events sink … applyCostR

**Fix:** Pick one and make all four documents agree. Either (a) keep the hoist and rewrite 03-02-PLAN.md:607's criterion to be scoped-in-time (e.g. "the DIFF LOGIC of applyCostRow is untouched by THIS plan", asserted as a body-slice `node -e` rather than the `private` keyword) and correct 03-VALIDATION.md:70 and :110 plus 03-CO

---

## #24 — [LOW] 03-07 Task 2's `min=` criterion has no pass condition and always matches, because the range input the same task mandates carries `min="0"`

**Plan:** 03-07-PLAN.md:548 (Task 2 acceptance criteria)

**Fix:** Replace with an anchor-guarded `node -e`: locate `type="date"` in the source, slice to the end of that JSX element, fail if the guard anchor is absent (vacuity check) and fail if the slice contains `min=`. Pair it with the existing `grep -n "type=\"date\"" ... >= 1` positive so it can never be the vacuous 0 of a missin

---

## #25 — [LOW] 03-07's `costTracking: 'transcript'` test-file grep cannot be satisfied by an honest fixture — the criterion forces a decorative literal that proves nothing

**Plan:** 03-07-PLAN.md Task 1, <acceptance_criteria> (the seeded-case

**Fix:** Replace with a criterion anchored to what the fixture actually contains and what the render actually shows: `grep -cE "provider: *'codex'" test/renderer-components.test.cjs` is `>= 1` AND a `node -e` slice anchored on that case's mandated title asserting the slice contains `never reaches the cost ledger` and NOT `no co

---

## #26 — [LOW] 03-07 Task 2's `min=` criterion is non-zero for every correct implementation and states no mechanical pass/fail rule

**Plan:** 03-07-PLAN.md Task 2, <acceptance_criteria>

**Fix:** Make it slice-scoped and runnable, e.g. a `node -e` that reads DayBandTab.tsx, locates `type="date"`, takes the enclosing tag (last `<` before it to the next `>`), and fails if that substring matches `/\bmin\s*=/` — with a vacuity guard that fails loudly when `type="date"` is absent.

---

## #27 — [LOW] 03-05 Task 3 leaves the config.ts ↔ boot.ts import direction to the executor when the cycle is provable, and the escape hatch reintroduces the drift Task 1 forbids

**Plan:** 03-05-PLAN.md Task 3 (`config.ts` DEFAULTS) vs Task 1 `<beha

**Fix:** Settle it in the plan: the cycle is real, so put `DIGEST_DEFAULT_HOUR` in a leaf module both can import (e.g. export it from `src/shared/` or from `config.ts` itself and have boot.ts import it), and add an acceptance criterion pinning the single definition — e.g. `grep -c "DIGEST_DEFAULT_HOUR = " src/main/` across src/

---

## #28 — [LOW] 03-05 Task 3's thread_ts acceptance criterion is not a runnable check

**Plan:** 03-05-PLAN.md Task 3 acceptance criteria

**Fix:** Replace with the body-slice form already used in the same task: `node -e` that finds `function postSlackDigest`, slices to the next `\nexport `, fails loudly if the anchor is missing or the slice contains no `httpsRequest`, and then fails if the slice contains `thread_ts` at all.

---

## #29 — [LOW] 03-04 Task 2 tells the executor to reuse index.ts imports that do not exist there

**Plan:** 03-04-PLAN.md Task 2 `<action>` (the `team:export` handler)

**Fix:** Correct the sentence to name what actually exists (`roster`, `writeFileSync`, `dialog`) and add an explicit instruction: add `validateHireManifest` and `HIRE_TEAM_SPEC_V1` to index.ts's existing `'../shared/hire'` import at :79, and `stripAgentForExport` to its `'./hire'` import at :78.

---
