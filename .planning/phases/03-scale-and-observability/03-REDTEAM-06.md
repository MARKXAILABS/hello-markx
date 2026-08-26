# Phase 3 — Red-Team Round 9

**Date:** 2026-08-25 · **Run:** `wf_1f3195ab-218` · **85 agents, 0 errors**

77 raised → 29 refuted → **48 confirmed**

**0 BLOCKER · 10 HIGH · 21 MED · 17 LOW**

> **HIGH went UP, 6 to 10. This round is the evidence that hand-patching anchors was the wrong strategy.**
> Seven of the ten trace to line numbers in plan PROSE: 03-03's hive.ts anchors were ~44 lines rotted while
> the text claimed "verified live this session", and 03-09's D-03 guard still fired on `:452` in three more
> places because the previous fix touched only `<interfaces>`. One (#1/#7) was a NEW defect introduced by the
> round-7 fix: the `costUnattributed` branch reused the engine-level copy `no cost meter` for agents that DO
> have a meter — a false claim on screen, on the common path.

**Response: fix the CLASS, not the instances.**
- A mechanical auditor now resolves every `file:line` citation across all nine plans and opens the cited file.
  It found **52 of 534 resolvable citations pointing at a blank or unrelated line**.
- The **ANCHOR RULE** — quoted content is authoritative, the line number is a hint — was broadcast to all nine
  plans, not just 03-09. Every acceptance criterion was already symbol- or content-based; only prose rots.

---

## #1 — [HIGH] 03-08's new costUnattributed branch renders UI-SPEC's engine-level copy `no cost meter` for Claude agents that DO have a cost meter — a false claim on screen, on the common path

**Plan:** 03-08-PLAN.md Task 1 <behavior> ("THIRD BRANCH, and it is lo

**Fix:** Give the attribution gap its own visible copy, distinct from the engine gap, in 03-UI-SPEC.md §S2b and §Copywriting (e.g. `spend not attributable` vs `no cost meter`), make deriveCost return a discriminant the cell can switch on (`reasonKind: 'no-meter' | 'unattributed'`), and add a Task 3 existence pin for the new str

---

## #2 — [HIGH] 03-07 never pins DayBandTab's production hiveTimeline call — 03-03's entire timeline IPC can ship with ZERO renderer callers and every criterion in both plans still passes

**Plan:** 03-07-PLAN.md Tasks 1/2/3 <acceptance_criteria>; 03-03-PLAN.

**Fix:** Add to 03-07 Task 1 <acceptance_criteria>: `grep -c -F "window.cth.hiveTimeline(" src/renderer/src/components/DayBandTab.tsx` is `>= 1` (baseline 0 — the file does not exist) and to Task 2: `grep -c -F "window.cth.hiveTimelineBucket(" src/renderer/src/components/DayBandTab.tsx` is `>= 1`. Both with the trailing `(` so 

---

## #3 — [HIGH] 03-09 Task 2's insertion is pinned by a heading regex only — round-8 #1's mandated CONTENT criterion was never added, so an empty section with the right title scores green

**Plan:** 03-09-PLAN.md Task 2 <acceptance_criteria>, the "Non-vacuous

**Fix:** Add to Task 2 <acceptance_criteria>, on the gate-open path: a node -e that slices ROADMAP.md from `### Phase 6: Close the forward dependencies` to the next `\n### ` (guarding `if (i<0) FAIL`) and fails unless the slice contains BOTH `RECALL-02 is what makes it enforced rather than cooperative` and `pick a day whose`, A

---

## #4 — [HIGH] 03-03's money-path line anchors are ~44 lines rotted post-merge inside text claiming 'verified live this session', including the do-NOT-touch safety instruction for applyCostRow's siblings

**Plan:** 03-03-PLAN.md Task 2 <action> and <interfaces> (round-8 find

**Fix:** Re-measure and correct all seven hive.ts anchors (applyCostRow :2652, its guard :2665, call sites :2598/:2686, applyReviewVerdict :2043, budgetForAgent :2770, renameSync :2547, cost-ledger.jsonl :801/:2557/:2594/:2683) — or drop the numbers and cite symbols only, as the criteria already do. Delete the 'verified live th

---

## #5 — [HIGH] 03-09's D-03 "must not edit" gate still fires on REQUIREMENTS.md:452 (FLOOR-07) — PARITY-02's status row is :471; the threat register claims a mitigation the criteria do not implement

**Plan:** 03-09-PLAN.md — Task 1 <action>/<acceptance_criteria>, threa

**Fix:** Delete the line-number gate entirely and promote 03-09-PLAN.md:154's own content assertion into Task 1's <acceptance_criteria>: `grep -c -F "| PARITY-02 | Phase 2 | Complete |" .planning/REQUIREMENTS.md` equals exactly 1 AND `grep -c -F "- [x] **PARITY-02**: Every engine that can be pointed at a base URL reports cost t

---

## #6 — [HIGH] Every hive.ts line anchor in 03-03's cost section is ~44-46 lines stale despite "verified live this session" — the load-bearing edit target hive.ts:2621 is a comment line, and both "do NOT touch" guards point at unrelated code

**Plan:** 03-03-PLAN.md, <interfaces> :158-176 and :200-201 and :270-2

**Fix:** Re-measure every hive.ts anchor in 03-03 against the post-merge tree (2608→2652, 2621→2665, 2016→2043, 2726→2770, 2554→2598, 2642→2686, 2079/2695→2106/2739, 2503→2547, 783/2513/2550/2639→801/2557/2594/2683) and add 03-09's ANCHOR RULE note verbatim to 03-03 (and 03-02, whose `recordSession at hive.ts:1217` is really hi

---

## #7 — [HIGH] 03-08's costUnattributed branch renders `no cost meter` for claude/qwen/crush — a false capability claim, and it is the common case

**Plan:** 03-08-PLAN.md Task 1 <behavior> (:152-161) + Task 3 <behavio

**Fix:** Give `costUnattributed` its own visible sentence, the way 03-07 was forced to split the day band's cost gap into a 'none' tier and a 'transcript' tier (round-3 #2). Add a fourth row to 03-UI-SPEC.md's §S2b field table for the unattributed case with copy that does NOT claim the engine has no meter (e.g. `spend not attri

---

## #8 — [HIGH] 03-09's D-03 MUST-NOT-EDIT guard still protects REQUIREMENTS.md:452 (FLOOR-07's row) in the <action>, the acceptance criterion and <verification>, while PARITY-02's actual row at :471 sits inside the table Task 1 rewrites — T-03-09a claims a mitigation the criteria do not implement

**Plan:** 03-09-PLAN.md Task 1 <action>, <acceptance_criteria>, <verif

**Fix:** Replace the two line-number pins in <action>, <acceptance_criteria> and <verification> with the content pin the plan's own <interfaces> already prescribes: `grep -c -F "| PARITY-02 | Phase 2 | Complete |" .planning/REQUIREMENTS.md` equals exactly 1 before and after, AND `git diff -U0 -- .planning/REQUIREMENTS.md` conta

---

## #9 — [HIGH] 03-09 Task 2's relocation range `ROADMAP.md:346-357` contains the SCALE-02 criterion the same sentence orders excluded, the exclusion is still named by its pre-merge range, and no acceptance criterion checks the inserted phase's content at all

**Plan:** 03-09-PLAN.md Task 2 <action> and <acceptance_criteria>

**Fix:** Correct the action to `:346-351` and `:354-357`, restate the exclusion as `:352-353` (the SCALE-02 criterion), drop the dead `:301-303`/`:304-305`/`:307-309` clause ranges, and add the content criterion round-8 #1 prescribed: after insertion, require the new phase section to contain the literal fragments `RECALL-02 is 

---

## #10 — [HIGH] 03-09's corrections table — the plan's stated authority for "the exact target lines" — is rotted in 5 of 8 rows, contradicts the plan's own re-measured <interfaces> block, and makes two false in-plan verification claims

**Plan:** 03-09-PLAN.md <interfaces>, "Corrections table"

**Fix:** Re-measure every row of the corrections table on the post-merge tree (REQUIREMENTS.md :183, :223, :227; ROADMAP.md :329, :334, :341, :346-351/:352-353/:354-357), give each row a quoted content fragment beside the number per this plan's own ANCHOR RULE, and delete the two false parentheticals ("it is :204", ":283 is a B

---

## #11 — [MED] 03-09's Corrections table, Phase-6 sweep list and Task 1 read_first still carry pre-merge anchors that its own ANCHOR RULE header names as wrong — the round-8 fix corrected only the two skeptic-test ranges and the PARITY-02 guards

**Plan:** 03-09-PLAN.md — "ANCHOR RULE" block, the Corrections table, 

**Fix:** Re-measure and correct every remaining number in 03-09's Corrections table, sweep paragraph and Task 1/2 read_first blocks against the post-merge tree, and extend the ANCHOR RULE's content-anchor list to cover all four edits plus the sweep (quote `| SCALE-01 | Phase 3 | Pending |`, `- [ ] **SCALE-01**:`, `LOG_ROTATE_BY

---

## #12 — [MED] 03-08's "EXISTENCE PINS for the five declared-gap render cases" pins only three of the five gap strings — the `state` cell's `unknown` and the `account` cell's `Login account` have no test-side pin

**Plan:** 03-08-PLAN.md Task 3 <acceptance_criteria>, first bullet

**Fix:** Add `grep -c -F "unknown" test/renderer-components.test.cjs` >= 1 and `grep -c -F "Login account" test/renderer-components.test.cjs` >= 1 to the same bullet (both measured 0 today), and require the state case to assert the rendered markup contains `unknown` and NOT `healthy` for an agent with no resolved breaker snapsh

---

## #13 — [MED] 03-09's T-03-09a claims a mitigation the tasks do not implement — the D-03 guard still diffs REQUIREMENTS.md:452 (FLOOR-07's row), leaving PARITY-02's real row at :471 unguarded by any acceptance criterion

**Plan:** 03-09-PLAN.md <threat_model> row T-03-09a (:359), Task 1 <ac

**Fix:** Replace :224/:239/:367/:372's `452` with the content pin already written at :154: add to Task 1's <acceptance_criteria> `grep -c -F "| PARITY-02 | Phase 2 | Complete |" .planning/REQUIREMENTS.md` equals exactly `1` AND `grep -c -F "- [x] **PARITY-02**:" .planning/REQUIREMENTS.md` equals exactly `1`, plus a `git diff -U

---

## #14 — [MED] 03-09 Task 2 <action> tells the executor to copy ROADMAP.md:346-357 verbatim for SCALE-01 — a range that swallows the SCALE-02 criterion the same sentence orders excluded

**Plan:** 03-09-PLAN.md Task 2 <action> and <interfaces> corrections t

**Fix:** Change the <action> to `:346-351` and `:354-357`, delete the `:301-303`/`:307-309`/`:304-305` skeptic-clause and exclusion numbers (they are all pre-merge), and restate the exclusion by content: "NOT the criterion containing `A floor comes up in one action` (SCALE-02, measured at :352-353), which sits between them."

---

## #15 — [MED] 03-07's five-gap-sentence criterion is a BRE alternation counted by matching LINES — four of the five strings can be missing and it still reports >= 5

**Plan:** 03-07-PLAN.md Task 1 <acceptance_criteria>, 4th bullet (roun

**Fix:** Split into five separate `grep -c -F` commands over DayBandTab.tsx, each `>= 1`, exactly as 03-08-PLAN.md does for its five derivations.

---

## #16 — [MED] BucketSummary and DetailRow are named in the producer contract and defined nowhere; no criterion in 03-03 pins the bucket's cost field, and every 03-07 test uses a hand-made fixture — the producer/consumer shapes can diverge undetected

**Plan:** 03-03-PLAN.md <interfaces> RETURN-SHAPE CONTRACT (:244, :249

**Fix:** Define `BucketSummary = {events:number; envelopes:number; usd:number}` and `DetailRow` explicitly in 03-03's RETURN-SHAPE CONTRACT, and add a 03-03 Task 3 criterion driving it: extend the existing `loadTs('src/main/timeline.ts')` success-discriminant node -e to call `summarizeDay(<one event>, [{ts, agentId, taskId, usd

---

## #17 — [MED] 03-08 Task 2's <acceptance_criteria> block is unterminated — 3 opening tags, 2 closing tags — so <verify> and <done> nest inside the criteria list

**Plan:** 03-08-PLAN.md Task 2, <acceptance_criteria> opened at :343

**Fix:** Insert `  </acceptance_criteria>` immediately before `  <verify>` in Task 2 of 03-08-PLAN.md.

---

## #18 — [MED] 03-08 Task 1 mandates a renderToStaticMarkup case in test/renderer-runstate.test.cjs, which has no React harness at all, and no criterion pins it — the case silently drops

**Plan:** 03-08-PLAN.md Task 1 <behavior> final bullet and <action> (r

**Fix:** Move the seeding-seam server-render case to Task 3 / test/renderer-components.test.cjs (which already carries the Module._load shim) and give it an existence pin there: `grep -c -F "setAgentView" test/renderer-components.test.cjs` (or whatever seam name lands) is `>= 1`. Leave Task 1's scope to the pure derivations.

---

## #19 — [MED] 03-08 Task 3's 'EXISTENCE PINS for the five declared-gap render cases' pins three gap strings and says 'all four' — the `unknown` state cell and the `lifetime` qualifier have no test-side pin, and the banned 'read the added test code' criterion is still present two bullets below

**Plan:** 03-08-PLAN.md Task 3 <acceptance_criteria> (the bullet added

**Fix:** Fix the count word, and add `grep -c -F "'unknown'" test/renderer-components.test.cjs` `>= 1` and `grep -c -F "lifetime: true" test/renderer-components.test.cjs` `>= 1` (both baseline 0). Replace the honest-coverage bullet with the two-branch node -e round-8 #22 prescribed: require the test file to contain EITHER `Agen

---

## #20 — [MED] 03-09's <interfaces> corrections table and Task 1 <read_first> still carry pre-merge REQUIREMENTS.md anchors that contradict the plan's own ANCHOR RULE and must_haves, in a plan whose stated purpose is removing rotted anchors

**Plan:** 03-09-PLAN.md <interfaces> corrections table, Task 1 <read_f

**Fix:** Re-measure the corrections table in one pass: STRUCT-02 :183, telemetry.ts:126 at :223, hive.ts:267 at :227, ROADMAP.md hive.ts:267 at :329. Update Task 1's <read_first> to :183. Fix the :148 sentence to say the earlier draft pinned :452, which is FLOOR-07's row.

---

## #21 — [MED] 03-05's fireDigest structural gate slices the wrong region — it terminates on `\nfunction ` while mandating `export function fireDigest`, and boot.ts's last plain top-level `function` is at :960

**Plan:** 03-05-PLAN.md Task 2 <acceptance_criteria> — the "EXISTENCE 

**Fix:** Change 03-05-PLAN.md:417 to the same form its own :527 check uses: `let j=s.indexOf('\nexport ',i+1);if(j<0)j=s.length;const body=s.slice(i,j);`, and anchor with `s.indexOf('export function fireDigest')` rather than `s.indexOf('function fireDigest')` so the anchor and the terminator agree on the declaration form.

---

## #22 — [MED] Round-8's anchor re-measurement never reached 03-02, 03-03 or 03-06 — their source and cross-document anchors are still ~20-45 lines stale on the post-merge tree, and none of the three carries 03-09's content-first ANCHOR RULE

**Plan:** 03-03-PLAN.md <interfaces> and the eventsAgedOut rationale; 

**Fix:** Re-measure the seven anchors above against the post-merge tree and correct them (2608->2652, 2079/2695/2642->2106/2739/2686, 2503->2547, 783/2513/2550/2639->801/2557/2594/2683, CONTEXT 360-372->376-..., 438-441->460, hive 1217->1244, 1397->1424, 899->916, 03-04-PLAN 496-499->517-519). Then copy 03-09-PLAN.md:40-45's AN

---

## #23 — [MED] 03-05's digest timer uses setTimeout→setInterval with no re-anchor, and this repo's own source records that such timers freeze across system sleep — the fire hour drifts permanently off the configured local hour

**Plan:** 03-05-PLAN.md Task 2 <behavior> and <action> (armDigestTimer

**Fix:** Drop `setInterval` entirely: after each fire, re-arm with `setTimeout(msUntilNextLocalHour(hour, Date.now()))`. That single change makes sleep drift, restart and DST all self-correcting and removes the need for the powerMonitor wiring T-03-05e declines. Add a same-local-date guard at the top of `fireDigest` (`if (persi

---

## #24 — [MED] dailyCostRows' diff-vs-cumulative semantics have no test — the only mandated case is a single task_id:null row, which passes identically whether you return the delta or the raw cumulative snapshot

**Plan:** 03-03-PLAN.md, Task 2 ("the injected events sink … applyCost

**Fix:** Add an acceptance criterion that drives `dailyCostRows` over a MULTI-row same-(agent_id, session_id) series and asserts the diff: e.g. seed three cumulative rows 15 / 60 / 75 in one day and assert the returned rows' `tokens` are 15, 45, 15 (never 15, 60, 75), plus a clamped case where the third row is SMALLER (respawn 

---

## #25 — [MED] The day band's per-bucket cost total is the one money number in SCALE-03, and it is neither field-name-pinned by the producer nor asserted by any required test case

**Plan:** 03-03-PLAN.md Task 3 <behavior> :516-522 and <acceptance_cri

**Fix:** Name the field in 03-03: pin `BucketSummary = {events: number; envelopes: number; usd: number}` verbatim in 03-03's RETURN-SHAPE CONTRACT (the same block that already pins TimelineResult at :224-233), and add a required `test/timeline.test.cjs` case: two cost rows with known deltas at 00:07 and 00:22 of the day land in

---

## #26 — [MED] 03-07 Task 4's blocking containment gate probes viewport widths that cannot change the tab strip's container — the identical defect round-3 #29 fixed in 03-08 and never applied here

**Plan:** 03-07-PLAN.md Task 4 <how-to-verify> :641-651 and <verify><h

**Fix:** Rewrite Task 4 in the form 03-08 Task 4 already uses: drag the splitter to `sidebarWidth` = 320 / 420 / 900, read the value back from `window.localStorage.getItem('cth.sidebarWidth')` at each stop and record it beside the observed row count, and require the recorded widths to differ. Keep the base-sha/head-sha pair and

---

## #27 — [MED] 03-08's `account` cell has no acceptance criterion at all, while the criterion heading claims existence pins for "the five declared-gap render cases"

**Plan:** 03-08-PLAN.md Task 3 <acceptance_criteria> :435-447, and suc

**Fix:** Add two criteria to Task 3: a test-side existence pin `grep -c -F "Login account" test/renderer-components.test.cjs` is `>= 1` (measured 0 today), and a source-side pin that cannot be satisfied by the pre-existing `<option>` at `AgentDetailPanel.tsx:158` — e.g. `grep -c -F "deriveAccountLabel(" src/renderer/src/compone

---

## #28 — [MED] Widening `HireResult` as specified breaks `npm run typecheck` at src/main/index.ts:1494, and the plan misquotes the current type as already optional

**Plan:** 03-04-PLAN.md Task 2 <action>: "calls `validateTeamManifest`

**Fix:** Correct the plan text to quote src/main/hire.ts:19 accurately (`manifest: HireManifest`, required), and add to Task 2's <action> and <read_first> the explicit instruction to update `deliverHire`'s call site at src/main/index.ts:1494 — e.g. narrow with `if (res.ok && res.manifest) deliverHire(res.manifest);` and state t

---

## #29 — [MED] The "two-cap pin" is satisfiable by a comment, and the 100 KB single-manifest test case that would really prove it has no existence pin

**Plan:** 03-04-PLAN.md Task 2 acceptance, "**Two-cap pin** (round-3 f

**Fix:** Replace the substring check with a behavioral one driven through `loadTs`: write a ~100 KB well-formed hire@1 document to a tmpdir, call `readHireManifestFile`, and fail unless the result is `{ok:false, error:'manifest too large'}`; write the same payload wrapped as team@1 and fail unless it is NOT rejected for size. A

---

## #30 — [MED] 03-04 Task 2 tells the executor to widen a field that does not exist (`manifest?: HireManifest`) — the real type has `manifest` REQUIRED, and the prescribed widening breaks src/main/index.ts:1494 under strict TS

**Plan:** 03-04-PLAN.md Task 2 <action> (the HireResult widening) and 

**Fix:** Prescribe the third union arm outright: `export type HireResult = { ok: true; manifest: HireManifest } | { ok: true; team: { members: HireManifest[] } } | { ok: false; error: string };`, delete the `manifest?` phrasing, and add `src/main/index.ts:1483-1495 (handleHireLink/deliverHire)` to Task 2's <read_first> with a o

---

## #31 — [MED] 03-08 Task 1 mandates a renderToStaticMarkup seeding-seam case in test/renderer-runstate.test.cjs — a file with no React, no react-dom/server and no Module._load shim — and pins it with nothing

**Plan:** 03-08-PLAN.md Task 1 <behavior> final bullet, <action>, and 

**Fix:** Move the seeding-seam server-render case to Task 3 / test/renderer-components.test.cjs (which already has the shim and where AgentDetailPanel lands) and give it an existence pin there; name the seeding export explicitly in Task 1 (e.g. `export function seedAgentView(...)`) and pin it: `grep -c -F "seedAgentView(" src/r

---

## #32 — [LOW] Every hive.ts anchor in 03-03 is rotted ~+44 lines and each is labelled "verified live this session" — including the two "do NOT touch" guards that protect ADR-0005's diff arithmetic

**Plan:** 03-03-PLAN.md <interfaces> (the applyCostRow block) and Task

**Fix:** Re-measure every hive.ts anchor in 03-03 against the post-merge tree (2652 / 2665 / 2043 / 2770 / 2598 / 2686 / 2106 / 2739 / 2547) and add the same content-first ANCHOR RULE header 03-09 carries, so the quoted text is authoritative and the numbers advisory.

---

## #33 — [LOW] 03-01's index.ts anchors for config:changeHome are rotted ~15 lines while each is stated as "verified this session"

**Plan:** 03-01-PLAN.md <interfaces> and Task 2 <read_first>/<action>/

**Fix:** Re-measure 03-01's index.ts anchors (2767-2778 teardown, 2780-2799 move block, 2786 sub array, 2795-2802 catch, 2810 relaunch, 2708-2723 D-12 comment) and add the content-first ANCHOR RULE header to this plan as well.

---

## #34 — [LOW] 03-07 Task 2's date-input criterion is unrunnable and self-contradicting — the same task mandates min="0" on the range input in the same file, so `grep -n "min="` always matches

**Plan:** 03-07-PLAN.md Task 2 <acceptance_criteria>, 3rd bullet (:556

**Fix:** Replace with a scoped node -e: find `s.indexOf('type="date"')`, guard `if (i<0) FAIL`, slice from `s.lastIndexOf('<input', i)` to the next `>`, and fail if that slice contains `min=`. Keep the `type="date"` `>= 1` positive so it cannot pass on a missing input.

---

## #35 — [LOW] 03-05 Task 3 and 03-08 Task 1 each still carry criteria with no runnable command or threshold

**Plan:** 03-05-PLAN.md Task 3 <acceptance_criteria> 2nd bullet; 03-08

**Fix:** 03-05: convert to the anchor-guarded slice node -e already used one bullet below — find `function postSlackDigest`, slice to the next `\nexport `, guard `if (i<0) FAIL`, fail if the slice contains `thread_ts`. 03-08: add `grep -c -F "deriveContextColor(87" test/renderer-runstate.test.cjs` `>= 1` and `grep -c -F "kind: 

---

## #36 — [LOW] 03-08's costUnattributed branch hard-codes a directory-sharing REASON that is false for most agents it fires for, and its ordering against the costTracking:'none' branch is unspecified

**Plan:** 03-08-PLAN.md Task 1 <behavior>, the "THIRD BRANCH" block at

**Fix:** Split the reason by cause instead of hard-coding one sentence: emit the transcript-sharing wording ONLY where it is true (a non-codex agent whose engine actually reads transcripts), and use a cause-neutral sentence for the rest (e.g. "<engine> has reported no spend this session — this app cannot attribute per-agent spe

---

## #37 — [LOW] Day boundaries are computed as local-midnight + 86400000, so on DST-transition days an hour of spend is either double-counted into the adjacent day or silently dropped from the day total

**Plan:** 03-03-PLAN.md Task 3 (parseDayParam / summarizeDay / the two

**Fix:** Derive `dayEndMs` as the next local midnight (`new Date(y, m, d+1).getTime()`) rather than `dayStartMs + 86400000`, return it from `parseDayParam` alongside `dayStartMs`, and size the bucket array from `(dayEndMs - dayStartMs) / (BUCKET_MINUTES * 60000)` — or, if 96 fixed buckets are required by the UI, document the DS

---

## #38 — [LOW] 03-01 Task 3's README read_first anchor points at the ASCII architecture diagram, not the sentence it quotes

**Plan:** 03-01-PLAN.md Task 3 <read_first> :388

**Fix:** Re-measure the anchor to `README.md:142` (the "Memory & coordination" heading) and `:152-153` (the wrapped `For real isolation today, set memory scope to\nper-agent, which puts each agent in its own index rather than trusting a flag.`). Given 03-09 now carries an ANCHOR RULE making quoted content authoritative and line

---

## #39 — [LOW] 03-07's "no `min` on the date input" criterion cannot fail — the range input the same file must render always supplies a `min=` hit

**Plan:** 03-07-PLAN.md Task 2 <acceptance_criteria> :555-556

**Fix:** Replace with a mechanical pair over the date element only, e.g. a `node -e` that slices `DayBandTab.tsx` from the `type="date"` index to the next `/>` and fails if that slice matches `/\bmin\s*=/` (with a not-found guard so a missing date input fails loudly rather than slicing empty), plus the existing `grep -n "type=\

---

## #40 — [LOW] 03-06's hive.ts anchors for the review-region security rationale are stale by ~25 lines; the cited lines contain unrelated code

**Plan:** 03-06-PLAN.md must_haves truth #4 and Task 2 <behavior>: "`d

**Fix:** Update both citations in 03-06-PLAN.md (must_haves truth #4 and Task 2 <behavior>) to src/main/hive.ts:1424 and src/main/hive.ts:917, and src/shared/agentProvider.ts:664 for `inferAgentProvider`. Then add the same content-first ANCHOR RULE 03-09 now carries to 03-06's header, so the quoted text stays authoritative when

---

## #41 — [LOW] 03-03's money-path line anchors are all ~44 lines rotted post-merge, and the "do NOT touch these two guards" safety instruction points at a method signature and a doc comment — in text claiming "verified live this session"

**Plan:** 03-03-PLAN.md — <interfaces> (the applyCostRow fenced block)

**Fix:** Re-measure and restate every hive.ts anchor in 03-03 against the post-merge tree (applyCostRow :2652, its guard :2665, call sites :2598/:2686, applyReviewVerdict :2043, budgetForAgent :2770, renameSync :2547, cost-ledger.jsonl :801/:2557/:2594/:2683), or drop line numbers entirely and cite symbols only. Add 03-09's con

---

## #42 — [LOW] 03-08 Task 3 still carries the exact non-mechanical criterion this phase bans elsewhere — "read the added test code to confirm — this is not a pure grep-count criterion"

**Plan:** 03-08-PLAN.md Task 3 <acceptance_criteria>, the honest-cover

**Fix:** Replace with the mechanical two-branch pin: a `node -e` that requires test/renderer-components.test.cjs to contain EITHER `AgentDetailPanel.tsx` inside the shim's try block (real load) OR the literal marker comment `// COVERAGE: string-presence only — this case does not prove AgentDetailPanel renders`, failing if neith

---

## #43 — [LOW] 03-05 Task 3's thread_ts criterion still has no runnable command or threshold — it resolves to a human judgement about which matches "are attributable to" a function body

**Plan:** 03-05-PLAN.md Task 3 <acceptance_criteria>, second bullet

**Fix:** Convert to the anchor-guarded slice already used one bullet below: node -e that finds `function postSlackDigest`, slices to the next `\nexport `, guards `if (i<0) FAIL`, asserts the slice contains `httpsRequest` (so it is the right body), and fails if the slice contains `thread_ts`.

---

## #44 — [LOW] 03-07 Task 2's date-input criterion cannot be evaluated and, as written, its grep always matches — the same task mandates min="0" on the range input in the same file

**Plan:** 03-07-PLAN.md Task 2 <acceptance_criteria>, third bullet (an

**Fix:** Replace with a scoped mechanical check: a node -e that locates `type="date"`, slices from the preceding `<input` to the following `>`, fails if that slice contains `min=`, and fails first if `type="date"` is absent — so it can never pass on a missing input.

---

## #45 — [LOW] 03-05's DIGEST_DEFAULT_HOUR reconciliation resolves to "restate the literal 9" because the import direction it offers is a proven cycle — and no criterion pins the two values agreeing

**Plan:** 03-05-PLAN.md Task 3 <action> (the config.ts DEFAULTS entry)

**Fix:** Put `DIGEST_DEFAULT_HOUR` in `src/shared/` (or in config.ts itself and import it into boot.ts, which already imports from config.ts) so one definition serves both, delete the conditional-import prose, and add the criterion: node -e reading both files and failing unless the numeric literal beside `digestHour:` in config

---

## #46 — [LOW] 03-06's identityText / identity.md anchors are ~20 lines rotted post-merge, in the paragraph justifying the review sheet's confirmation obligation

**Plan:** 03-06-PLAN.md Task 2 <behavior> (the goal/description review

**Fix:** Restate as `src/main/hive.ts:1419` (identityText) -> `src/main/hive.ts:917` (the identity.md write), or drop the numbers and cite the symbols `identityText`/`join(dir, 'identity.md')`.

---

## #47 — [LOW] 03-03's T-03-03c mitigation is pinned by a BRE alternation counted by matching LINES — two parseDayParam calls satisfy it alone, leaving validateBucketIndex unchecked

**Plan:** 03-03-PLAN.md Task 3 <acceptance_criteria> and threat row T-

**Fix:** Split into two literal commands with their own thresholds: `grep -c -F "parseDayParam(" src/main/index.ts` >= 2 AND `grep -c -F "validateBucketIndex(" src/main/index.ts` >= 1. Apply the same split to 03-05-PLAN.md's `grep -n "dailyDigest\|slackDigestChannelId\|digestHour" src/main/config.ts` >= 3 and its preload/render

---

## #48 — [LOW] 03-09's <interfaces> sweep inventory disagrees with its own Task 1/Task 2 actions on every anchor, and both are wrong about ROADMAP.md's forward-dependency line

**Plan:** 03-09-PLAN.md <interfaces> ("The Phase 6 -> 7 sweep, if the 

**Fix:** Delete the duplicated inventory from <interfaces> and keep one measured list, or re-measure both: REQUIREMENTS.md :504-516/:520/:538 and checkboxes :171/:175; STATE.md :416/:616 (3 occurrences, 2 lines); ROADMAP.md :21/:45/:504/:518.

---
