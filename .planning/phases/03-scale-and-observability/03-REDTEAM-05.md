# Phase 3 — Red-Team Round 8 (final gate round)

**Date:** 2026-08-25 · **Run:** `wf_7f2a8e98-75d` · **79 agents, 0 errors**

71 raised → 39 refuted → **32 confirmed**

**0 BLOCKER · 6 HIGH · 16 MED · 10 LOW**

> **Root cause of the HIGH cluster: planning-document anchor rot after the main merge.** The orchestrator re-verified 28 SOURCE anchors after merging PR #80 but did NOT re-check the PLANNING-document anchors — and 03-09 is the plan that edits REQUIREMENTS.md and ROADMAP.md *by line number*. Seven findings trace to that single miss. All are now fixed, and 03-09 carries a content-first ANCHOR RULE so the same rot cannot silently recur on the next merge.

---

## #1 — [HIGH] 03-09 Task 2 tells the executor to copy ROADMAP.md:298-309 verbatim into the new phase — those lines are now Phase 2's plan list, not the skeptic tests, and no criterion checks the inserted content

**Plan:** 03-09-PLAN.md, Task 2 <action> (and the corrections table at

**Fix:** Re-measure the ranges to ROADMAP.md:346-351 and :354-357 (SCALE-02 at :352-353 is the one to exclude), and add a content criterion, not only a heading one: after insertion, require the new phase section to contain the literal fragments `RECALL-02 is what makes it enforced rather than cooperative` and `pick a day whose`

---

## #2 — [HIGH] Every planning-document anchor in 03-09 has rotted post-merge while the plan asserts each was 're-measured this session' — the plan's <read_first> and <action> steps point an executor at unrelated lines

**Plan:** 03-09-PLAN.md, corrections table (:114-123), Task 1 <action>

**Fix:** Re-measure every planning-doc anchor in 03-09 against the post-merge tree and restate them, or drop line numbers from this plan entirely and address every edit by a quoted content fragment (the criteria are already content-based; only the prose and <read_first> still carry line numbers). Note the offsets are uniform — 

---

## #3 — [HIGH] The events sink's ONE production wiring is gated by a non-runnable criterion, and the durability test wires the sink itself so it passes with boot.ts untouched

**Plan:** 03-03-PLAN.md Task 2 (<action> ~:439, <behavior> :396-401, a

**Fix:** Replace :484 with a runnable pair: `grep -c -F "persist.recordEvent(" src/main/floor/boot.ts` is `>= 1` (baseline 0) AND a node -e that slices from `s.indexOf('hive = new HiveManager(')` to the matching `);` and fails unless the slice contains `recordEvent`.

---

## #4 — [HIGH] 03-09 Task 2's ROADMAP.md anchors are wholesale rotted (~48 lines off); its verbatim-relocation instruction points at Phase 2 prose, and no acceptance criterion can detect it

**Plan:** 03-09-PLAN.md Task 2 ("ROADMAP.md corrections and the gated 

**Fix:** Re-measure every ROADMAP.md anchor in 03-09 Task 2 against the post-merge tree (:320 section start, :329 table row, :333-334, :341-342, :346-351, :352-353, :354-357, :345 heading, :331 blank, :504 GSD heading, :518 forward-dependency prose) OR — better, given this repo's anchor-rot history — replace every line-range in

---

## #5 — [HIGH] 03-09 Task 1 directs the STRUCT-02 edit at REQUIREMENTS.md:164, which is inside 02-12's D-03-protected PARITY-02 block (STRUCT-02 is actually at :183)

**Plan:** 03-09-PLAN.md Task 1, <read_first> and <action>

**Fix:** Change the <action> and <read_first> to name STRUCT-02 by content, not by line: "the requirement entry beginning `- [x] **STRUCT-02**:` (measured at :183 in the post-merge tree)". Widen the D-03 guard from two line numbers to a content pin over the whole PARITY-02 entry, e.g. assert the byte range from the line matchin

---

## #6 — [HIGH] 03-02's `?? 'claude'` repo-fact is wrong in count and in every line number — and the plan explicitly rejects the one anchor that is actually live

**Plan:** 03-02-PLAN.md <interfaces> (the `RegistryAgent`/`provider` p

**Fix:** Re-run `grep -n "provider ?? 'claude'" src/main/hive.ts` and write FIVE / :991, :1009, :1180, :1211, :2430 (and delete the "an earlier draft said five and cited :1009" retraction, which is itself the error). Correct recordSession to :1244, and 03-06's identityText/identity.md anchors to :1424 and :917. Then sweep every

---

## #7 — [MED] 03-09's MUST-NOT-EDIT guard for 02-12's owned lines is pointed at the wrong line — REQUIREMENTS.md:452 is FLOOR-07's row; PARITY-02's status row is :471, inside the table Task 1 rewrites

**Plan:** 03-09-PLAN.md, <interfaces> 'MUST NOT edit' block and Task 1

**Fix:** Change the protected anchors to the measured ones — REQUIREMENTS.md:145 and :471 — or, better, make the guard content-based and line-independent: require `grep -cF '| PARITY-02 | Phase 2 | Complete |' .planning/REQUIREMENTS.md` to equal exactly 1 and `git diff -- .planning/REQUIREMENTS.md` to show no hunk touching the 

---

## #8 — [MED] 03-01's CHANGELOG entry and threat T-03-01c tell the operator that config:changeHome's 'move' mode recovers the abandoned data — it cannot, because 'move' copies from oldHome and the abandoned data is at userData

**Plan:** 03-01-PLAN.md, Task 3 <action> (the CHANGELOG entry) and thr

**Fix:** Drop the parenthetical from the CHANGELOG entry and T-03-01c. State the actual recovery: the abandoned files sit at the app-data path and must be copied by hand into the project home (name the path). 'move' mode's widened sub-list only helps for data that was already under a harnessHome, i.e. from the second changeHome

---

## #9 — [MED] 03-08 Task 3 mandates five declared-gap render cases and pins none of them — its only test criteria are 'read the added test code' and a run that is green today

**Plan:** 03-08-PLAN.md Task 3 (line 375) acceptance_criteria, final t

**Fix:** Add mechanical existence pins to Task 3: `grep -c -F "AgentDetailPanel" test/renderer-components.test.cjs` is `>= 1` (baseline 0), `grep -c -F "not reported" test/renderer-components.test.cjs` is `>= 1`, `grep -c -F "not recorded" test/renderer-components.test.cjs` is `>= 1`, and `grep -c -F "costTracking: 'none'" test

---

## #10 — [MED] Threat T-03-08b claims a mitigation ('no $ character in the unmeasured render') that no acceptance criterion in the plan implements

**Plan:** 03-08-PLAN.md <threat_model> row T-03-08b

**Fix:** Either add the criterion the row claims — a renderToStaticMarkup case asserting the unmeasured cost cell's markup contains no `$` — or rewrite the row's disposition to 'accept' with the honest residual, matching 03-05's T-03-05d correction pattern.

---

## #11 — [MED] 03-06's round-7 #7 blocker (hire disabled until a folder is chosen) is pinned only by three token-presence greps, each satisfiable without the gate existing

**Plan:** 03-06-PLAN.md Task 2 acceptance_criteria, the 'folder region

**Fix:** Add: `grep -c -F "Pick a folder first" src/renderer/src/components/TeamReviewModal.tsx` is `>= 1` (baseline 0 across the whole tree except AddAgentModal.tsx:333), AND a renderToStaticMarkup case in test/team-review.test.cjs rendering with `cwd: undefined` and asserting the markup matches /disabled/ near the hire contro

---

## #12 — [MED] 03-09 Task 1's D-03 protection criterion pins the wrong second line (:452 is FLOOR-08's row; PARITY-02's status row is :471) and is unstable under the task's own edits — T-03-09a is a false claim

**Plan:** 03-09-PLAN.md Task 1, <acceptance_criteria> and threat regis

**Fix:** Replace the line-number pin with a content pin that survives shifts and actually covers the protected block: assert `git diff -U0 -- .planning/REQUIREMENTS.md` contains no hunk whose context includes `**PARITY-02**` or `| PARITY-02 |`, and add `grep -cF "| PARITY-02 | Phase 2 | Complete |" .planning/REQUIREMENTS.md` eq

---

## #13 — [MED] 03-09's remaining REQUIREMENTS.md and STATE.md anchors are rotted despite the plan repeatedly asserting they were 're-measured this session'

**Plan:** 03-09-PLAN.md must_haves truths, Task 1 <read_first>/<action

**Fix:** Either re-measure all of 03-09's line anchors against the post-merge tree in one pass and record the measurement command in the plan, or — consistent with the plan's own stated purpose — strip line numbers from 03-09 entirely and navigate by quoted content only (`the entry beginning '- [ ] **RECORD-01**'`, `the line co

---

## #14 — [MED] BucketSummary — the type carrying the per-bucket cost figure — is never defined in the producer plan, and the "restated verbatim" claim is false

**Plan:** 03-03-PLAN.md <interfaces> RETURN-SHAPE CONTRACT; 03-07-PLAN

**Fix:** Define `BucketSummary` explicitly in 03-03's RETURN-SHAPE CONTRACT as `{events: number; envelopes: number; usd: number}` (and `DetailRow` likewise), and add one acceptance criterion to 03-03 Task 3 pinning it — e.g. via the existing `loadTs('src/main/timeline.ts')` success-discriminant check, extended to fail unless `r

---

## #15 — [MED] 03-08 Task 1 mandates a renderToStaticMarkup case in test/renderer-runstate.test.cjs, which has no React harness — and no acceptance criterion pins it, so it silently drops

**Plan:** 03-08-PLAN.md Task 1 <behavior> final bullet and <action>

**Fix:** Move the seeding-seam server-render case to Task 3 / test/renderer-components.test.cjs (which already has the shim and where AgentDetailPanel lands), and give it an existence pin there. Leave Task 1's renderer-runstate.test.cjs scope to the pure derivations plus a non-React assertion that seed → get* round-trips.

---

## #16 — [MED] 03-07's transcript-tier existence pin greps for a literal the correct fixture cannot contain, and the 'none' tier fixture has no pin at all

**Plan:** 03-07-PLAN.md Task 1 <acceptance_criteria>, final bullet

**Fix:** Replace the criterion with pins on what the fixture actually contains: `grep -cE "provider: *['\"]codex['\"]" test/renderer-components.test.cjs` is >= 1 (transcript tier) and `grep -cE "provider: *['\"](qwen|crush|copilot|gemini)['\"]" test/renderer-components.test.cjs` is >= 1 (the 'none' tier, currently unpinned). Ad

---

## #17 — [MED] 03-07's five-gap-sentence criterion is a BRE alternation counted by matching LINES — the trap 03-08's own criteria call out — so it does not establish that all five strings are present

**Plan:** 03-07-PLAN.md Task 1 <acceptance_criteria>

**Fix:** Split into five separate `grep -c -F` commands over DayBandTab.tsx, each `>= 1`, exactly as 03-08-PLAN.md:247-252 does for its five derivations.

---

## #18 — [MED] Team-import path has no error/skip channel: invalid members vanish silently and the review sheet misstates the file's contents

**Plan:** 03-04-PLAN.md Task 1 + Task 2 (validateTeamManifest / readHi

**Fix:** Give the team branch an error channel: return `{ok:true, team:{members, skipped: number, errors: string[]}}` from `readHireManifestFile` (or keep `errors` on the widened HireResult) and thread it through preload. In 03-06 render it above the rows — e.g. `{n} of {n+skipped} agents in this file could be imported; {skippe

---

## #19 — [MED] A REJECTED team@1 file (bad spec tag or over TEAM_MAX_MEMBERS) has no defined return shape and reaches the operator as a silent no-op

**Plan:** 03-04-PLAN.md Task 2 <behavior>/<action> (readHireManifestFi

**Fix:** State the mapping explicitly in Task 2's <action>: `const v = validateTeamManifest(parsed); if (!v.ok || !v.team) return { ok: false, error: `invalid team manifest: ${v.errors.join('; ')}` }; return { ok: true, team: v.team };` (mirroring the existing `finish()` helper at src/main/hire.ts:21-24). Add an acceptance crit

---

## #20 — [MED] Widening HireResult so `manifest` is optional breaks the deep-link caller under strict TS; the plan asserts the opposite

**Plan:** 03-04-PLAN.md Task 2 <action> (HireResult widening) and <int

**Fix:** Prescribe a third union arm instead of loosening the existing one: `export type HireResult = { ok: true; manifest: HireManifest } | { ok: true; team: { members: HireManifest[] } } | { ok: false; error: string };` and add `src/main/index.ts:1483-1495 (handleHireLink/deliverHire)` to Task 2's <read_first>, with a one-lin

---

## #21 — [MED] 03-03 never pins the shapes 03-07 renders — event display fields land nested under `payload`, and the mandated `cost` row needs an agent name `dailyCostRows` does not return

**Plan:** 03-03-PLAN.md Task 1 <behavior> (eventsInRange row shape) + 

**Fix:** Pin the row contract in 03-03 the way the TimelineResult/BucketDetailResult envelope is already pinned: state that `bucketDetail` returns event rows FLATTENED (`{...payload, ts, kind, agentId, taskId, sessionId}`) so ActivityTab's `fmt` works unchanged, and that cost rows carry `{ts, kind:'cost', agentId, name, usd, to

---

## #22 — [MED] 03-08 Task 3 carries a "read the added test code to confirm" criterion — the exact non-mechanical form 03-04 Task 2 explicitly bans in this same phase

**Plan:** 03-08-PLAN.md Task 3 <acceptance_criteria>, the honest-cover

**Fix:** Replace with a two-branch mechanical pin, e.g. `node -e` requiring that test/renderer-components.test.cjs contains EITHER `AgentDetailPanel.tsx` inside the shim's try block (real load) OR the literal marker comment `// COVERAGE: string-presence only — this case does not prove AgentDetailPanel renders`, and fail if neit

---

## #23 — [LOW] 03-08 Task 1 names two derivation cases 'not optional' and pins neither; renderer-runstate.test.cjs is green today so the run bullet cannot fail

**Plan:** 03-08-PLAN.md Task 1 <action> (:235-239) and acceptance_crit

**Fix:** Add two existence pins: `grep -c -F "deriveContextColor(87" test/renderer-runstate.test.cjs` is `>= 1` and `grep -c -F "kind: 'unmeasured'" test/renderer-runstate.test.cjs` is `>= 1` (both baseline 0).

---

## #24 — [LOW] 03-02's hasOwnCostSource test pin is satisfied by the loadTs destructure line alone — the six claimed predicate cases have no detector, and two threat rows cite this grep as mechanical proof

**Plan:** 03-02-PLAN.md Task 2 acceptance_criteria; <threat_model> row

**Fix:** Raise the bound and anchor it to call sites: `grep -c -F "hasOwnCostSource(" test/telemetry-auth.test.cjs` is `>= 6` (one per declared case), or pin two literal fixtures — e.g. `grep -c -F "provider: 'codex'" test/telemetry-auth.test.cjs` is `>= 1` AND `grep -c -F "provider: 'claude'" test/telemetry-auth.test.cjs` is `

---

## #25 — [LOW] 03-05 Task 3 carries a criterion with no runnable command or threshold — the round-3 #36 class the rest of the phase eliminated

**Plan:** 03-05-PLAN.md Task 3 acceptance_criteria, second bullet

**Fix:** Convert to the anchor-guarded slice form already used one bullet below: node -e that finds `function postSlackDigest`, slices to the next `\nexport `, guards `if (i<0) FAIL`, and fails if the slice contains `thread_ts`.

---

## #26 — [LOW] Stale file:line anchors in 03-03's applyCostRow action — both are ~45 lines off the post-merge tree

**Plan:** 03-03-PLAN.md Task 2 <action> and the 'return delta' accepta

**Fix:** Update to hive.ts:2652 and hive.ts:2666, or drop the line numbers and cite the symbols only (the criteria already do).

---

## #27 — [LOW] 03-03's money-path line anchors are stale post-merge, including the "do NOT touch these two guards" safety instruction, in text claiming "verified live this session"

**Plan:** 03-03-PLAN.md <interfaces> (the applyCostRow quotation) and 

**Fix:** Re-measure and correct all seven anchors against the merged tree, or drop the line numbers entirely and cite symbols only (`applyCostRow`'s `if (!taskId) return;`, `applyReviewVerdict`'s, `budgetForAgent`'s) — the plan's own criteria are symbol-based already, so the numbers carry risk without carrying value. Remove "ve

---

## #28 — [LOW] 03-07 Task 3's date-input criterion is not machine-checkable — Task 2 mandates min="0" on the range input in the same file, so the grep always matches

**Plan:** 03-07-PLAN.md Task 2 <acceptance_criteria> (S1d, the no-min 

**Fix:** Replace with a scoped check: a `node -e` that isolates the `<input` element whose attributes include `type="date"` (slice from that `<input` to its closing `>`) and fails if that slice contains `min=`, paired with the existing `type="date"` >= 1 positive so the check cannot pass on a missing input.

---

## #29 — [LOW] T-03-03c's IPC-argument-validation mitigation is pinned by a BRE alternation that two parseDayParam calls satisfy alone

**Plan:** 03-03-PLAN.md Task 3 <acceptance_criteria> + threat register

**Fix:** Split into two literal commands, each with its own threshold: `grep -c -F "parseDayParam(" src/main/index.ts` is `>= 2` AND `grep -c -F "validateBucketIndex(" src/main/index.ts` is `>= 1`. Apply the same split to 03-05-PLAN.md:518-520 and :519-521 (three/two separate `grep -c -F` commands). Additionally require the `te

---

## #30 — [LOW] 03-03 Task 2 names three `if (!taskId) return` guards by line number and every one of the six hive.ts anchors is rotted — the cited lines are a comment, an unrelated `continue`, and a blank line

**Plan:** 03-03-PLAN.md — <interfaces> ("private applyCostRow // hive.

**Fix:** Re-measure every hive.ts anchor in 03-03 against the post-merge tree and replace them: applyCostRow :2652, its guard :2665, call sites :2598 and :2686, applyReviewVerdict :2040/:2043, budgetForAgent :2768/:2770, renameSync :2547, cost-ledger.jsonl :801/:2557/:2594/:2683. Better: drop the line numbers from the fenced in

---

## #31 — [LOW] 03-07 Task 2's date-input criterion is not a source assertion — it resolves to "look at the file", and the same task mandates a `min=` on the range input beside it

**Plan:** 03-07-PLAN.md Task 2 <acceptance_criteria>, third bullet

**Fix:** Replace with a mechanical check anchored on the date input, e.g. `node -e "const s=require('fs').readFileSync('src/renderer/src/components/DayBandTab.tsx','utf8');const i=s.indexOf('type=\"date\"');if(i<0){console.error('FAIL: date input not found');process.exit(1);}const start=s.lastIndexOf('<input',i);const end=s.ind

---

## #32 — [LOW] 03-05's "the scheduler's fallback and the persisted default can never silently disagree" is unenforced — the action permits re-stating the literal and no criterion pins the value

**Plan:** 03-05-PLAN.md Task 1 <behavior> (DIGEST_DEFAULT_HOUR bullet)

**Fix:** Resolve the direction now rather than deferring it — put `DIGEST_DEFAULT_HOUR` in `src/shared/` (or in config.ts itself and import it into boot.ts, which already imports from config.ts) so a single definition serves both, and add the criterion `node -e "const b=require('fs').readFileSync('src/main/floor/boot.ts','utf8'

---
