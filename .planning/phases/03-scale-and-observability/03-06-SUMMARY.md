---
phase: 03-scale-and-observability
plan: 6
subsystem: hiring
tags: [bulk-spawn, team-import, review-sheet, agent-id, d-17, d-18, d-19, scale-02]

# Dependency graph
requires:
  - phase: 03-04
    provides: "validateTeamManifest + TEAM_MAX_MEMBERS=16, the team-member field strip (commandFlags/skills/mcpServers), readHireManifestFile's team branch, preload importHireFile widened with team?"
  - phase: pre-existing
    provides: "useRestoreTeam.ts's concurrent spawn loop (the shape extracted here), Modal.tsx, buildSpawnCommand/tokenizeCommand/inferAgentProvider, AddAgentModal's single-hire submit path"
provides:
  - "spawnBatch — the ONE bulk-spawn shape (concurrent, input-ordered, per-item failure isolation), shared by useRestoreTeam.ts and the team-import hire"
  - "batchAgentIds(names, now) — the single production agent-id generator, called by BOTH the single-hire path and the team batch"
  - "agentIdSlug(name) — the one display-name normalisation, shared by batchAgentIds and markDuplicates"
  - "hireCommandFor(manifest, config) in store/config.ts"
  - "TeamReviewModal + markDuplicates + memberFailureText + memberHirePlan"
  - "AddAgentModal's res.team import branch and the relabelled import… button"
affects: [SCALE-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A rule two callers must AGREE about becomes one exported function, not two copies — the copy that drifts is the one nobody is looking at (agentIdSlug)"
    - "Logic behind an untestable boundary (a React click handler) gets pulled into a pure export — otherwise it is only ever pinned by a grep that the wrong assignment also satisfies (memberHirePlan)"
    - "A render assertion must pin the field as a TEXT NODE, not merely present in the markup: `html.includes(x)` passes for a value hidden in a title= tooltip"
    - "Negative-control every capability by mutation before trusting it; record which case went red, and check that the OTHER cases stayed green"
    - "When a plan's acceptance grep and the correct code disagree, prefer the change that removes a real duplication over contorting the code to match a string"

key-files:
  created:
    - src/renderer/src/hooks/bulkSpawn.ts
    - src/renderer/src/components/TeamReviewModal.tsx
    - test/bulk-spawn.test.cjs
    - test/team-review.test.cjs
  modified:
    - src/renderer/src/hooks/useRestoreTeam.ts
    - src/renderer/src/store/config.ts
    - src/renderer/src/components/AddAgentModal.tsx
    - test/add-agent-export.test.cjs

key-decisions:
  - "The plan's own render criterion (html.includes(sentinel)) was measured to PASS a sheet that hides the goal in a title= attribute — which the plan's own Task-3 checkpoint forbids. Replaced with a text-node regex, and the weaker form demonstrated failing to detect the mutant."
  - "markDuplicates and batchAgentIds carried the same slug regex. Extracted agentIdSlug so the operator's 'name taken' warning cannot drift from the ids actually minted — this also satisfied the plan's 'zero slug arithmetic in the sheet' criterion, which the duplicate rule would otherwise have violated for a legitimate reason."
  - "character/accent are validated against the cast/accent lists on the team path (Rule 2). validateHireManifest only length-caps and lowercases `character`; both fields ARE in the exporter's allowlist, so neither dropping them nor passing them raw was correct."
  - "memberHirePlan pulled out of the hire click handler so role<-description (never goal), goal->roster agent, and the single D-19 cwd are real assertions rather than greps."
  - "test/add-agent-export.test.cjs is outside this plan's files_modified but had to change: it pinned the OLD `import hire…` label in 3 places, which UI-SPEC:944/D-17 supersedes. Owned by neither wave-5 plan; verified before editing."
  - "Every number in this document was measured in this session. Nothing was inherited from the plan's prose."

requirements-completed: [SCALE-02]

# Metrics
duration: 78min
completed: 2026-08-26
---

# Phase 3 Plan 6: SCALE-02 Bulk Spawn and the Team Import Review Sheet Summary

`useRestoreTeam.ts`'s three-defects-already-paid-for spawn loop extracted into a shared
`spawnBatch` that finally has tests, agent-id generation moved out of a module-private
component helper into an exported generator both hire paths call, and a review sheet that
shows every untrusted field it is about to hand a spawned agent — proven by a render, not
a grep.

## Test baseline

| | Tests | Pass | Fail | Skipped | Duration |
|---|---|---|---|---|---|
| Base `f6b60dd6` | 1184 | 1177 | **0** | 7 | 25,730.7 ms |
| Head `a9889c5b` | 1208 | 1201 | **0** | 7 | 24,125.3 ms |
| Delta | **+24** | +24 | 0 | 0 | **−1,605 ms** |

24 new tests: 8 in `test/bulk-spawn.test.cjs`, 16 in `test/team-review.test.cjs`.
The base measurement matches the figure the execution brief supplied (1184/1177/0/7, ~25.6s)
exactly. **Duration went DOWN**, so no test added here is a slow one hiding behind a green
tick — the Phase-4 case of a test that passed while taking 240,728 ms does not recur.
`npm run typecheck` → 0 errors. `npm run lint --max-warnings 0` → clean.

## 03-04's field strip: verified still holding, and not re-introduced

The brief flagged this as the second MCP-consent hole found in this phase. Checked by
DRIVING the real validator, not by reading the source:

```
validateHireManifest({... mcpServers:['github-token'], skills:[], commandFlags:[...]})
  -> ok: true, consentRequired: ["github-token"]        <- the gate still fires
validateTeamManifest({ members:[that same object] })
  -> member keys: spec,name,description,goal,character,accent,
                  provider,model,capabilities,isolate,tokenCap,author,homepage
  -> 'commandFlags' in member = false
  -> 'skills'       in member = false
  -> 'mcpServers'   in member = false
TEAM_MAX_MEMBERS = 16
```

`TEAM_MEMBER_OMITTED = ['commandFlags','skills','mcpServers']` is deleted from the
validator's own output object at `src/shared/hire.ts:436`. **None of the three is
re-introduced anywhere in the bulk-spawn path.** `TeamReviewModal` renders neither, and
`memberHirePlan` reads neither — its doc comment names the reason (the team validator has
no consent channel) so a future editor cannot re-add them by accident.

`hireCommandFor` does contain a `m.commandFlags?.length` branch. That is the SHARED
single-hire/team implementation moved out of `AddAgentModal`; on the team path the field is
always absent, so the branch is dead there by construction. Kept rather than asserted away,
and commented as such, because deleting it would have changed the single-hire path.

## The plan's own render criterion did not detect the thing it exists to detect

The plan required, as the one assertion that "can tell 'the goal is on screen' from 'the
goal was silently dropped'", that a sentinel goal appear in `renderToStaticMarkup` output.
Its Task-3 checkpoint separately requires that "no part of the goal is reachable only by
hovering a tooltip."

Those two are not the same check, and the first does not imply the second. Measured against
a deliberate mutant that moved the goal into a `title=` attribute:

```
mutant: <span title={goal}><span>goal: </span></span>

plan-required   html.includes(sentinel) : true     <- criterion GREEN
stricter        />[^<]*SENTINEL/        : false    <- the sheet is hiding the field
markup: ...>role: </span>d</span><span title="ZZ-GOAL-SENTINEL-ZZ"><span sty...
```

So a sheet that hid all 4,000 characters behind a tooltip would have satisfied the plan's
acceptance criterion while failing its checkpoint. The test asserts the text-node form; the
criterion's literal form is also satisfied (the sentinel appears 3 times in the test file,
against a required ≥ 2), so nothing was traded away.

## Nothing here is trusted because a grep was green — 11 mutants, all killed

Every capability was replaced with the plausible wrong version before being believed. The
column that matters is the third: a mutation that reddens *everything* proves the tests are
coupled, not that they discriminate.

### `bulkSpawn.ts`

| Mutation | Cases red | Cases that correctly stayed GREEN |
|---|---|---|
| `spawnBatch` made SERIAL (await each in turn) | concurrency + input-order | isolation, all 3 id cases |
| Assemble on COMPLETION (push from inside each spawn) | input-order only | concurrency stayed green |
| Per-item `try/catch` deleted | failure-isolation only | concurrency + order stayed green |
| Counter keyed on `name` instead of slug | slug-collision case only | **the same-name case stayed green** |
| Counter removed entirely (the pre-fix `uniqueId` rule) | both id cases | the 3 spawnBatch cases stayed green |

The fourth row is the one worth reading: UI-SPEC S3a flags two *different* halves of the id
hazard (same names, and distinct names whose slugs match), and a name-keyed counter closes
only the first. The two cases discriminate them.

### `TeamReviewModal.tsx`

| Mutation | Cases red | Note |
|---|---|---|
| `goal` moved into a `title=` attribute | the review-region case | the plan's own weaker criterion passed this — see above |
| Hire gate `!canHire` → `busy` (folder gate removed) | the no-cwd case | the with-cwd negative control stayed green |
| Duplicates default CHECKED, `name taken` note kept | 3 cases incl. the `hire {n}` count | the subtle one: looks right, defaults wrong |
| `role: m.goal` instead of `m.description` | the role/goal case only | both are strings; nothing else notices |
| `character`/`accent` cast raw instead of guarded | the fallback case | the "legitimate value round-trips" half stayed green |
| `?? 'no goal'` → `?? ''` | the declared-gap case | empty vs dropped stays distinguishable |

All 11 reverted; suite re-run to 0 fail before each commit.

## The extraction was driven end to end, not asserted structurally

The plan's claim that extracting `spawnBatch` is "behaviour-preserving" is exactly the kind
of structural claim this project has been burned by, so the REAL `restoreTeam()` was driven
against a fake preload bridge with four restorable agents, INVERTED completion timing, and
the second agent's IPC call rejecting outright:

```
spawn calls entered   : Alpha, Bravo, Charlie, Delta
peak concurrent spawns: 4         (4 = concurrent, 1 = serial)
completion order      : Delta, Charlie, Bravo, Alpha
roster order after    : Alpha, Charlie, Delta
hive.role carried     : ["role-Alpha","role-Charlie","role-Delta"]
PASS — concurrent, input-ordered, Bravo isolated
```

All three of the loop's already-paid-for defects are still fixed after the refactor. This
harness was scratch and is not committed; `test/bulk-spawn.test.cjs` is the durable coverage.

The prior coverage claim was also re-checked with the plan's own warning honoured (`-E`, or
the `|`s are BRE literals and the command returns zero for the wrong reason):
`grep -rEn "restoreTeam|RestoreTeam|useRestoreTeam|spawnBatch|batchAgentIds" test/` returned
**0** at base. There genuinely was none.

## Containment at 3, 8 and 16 members — driven through the real validator

Task 3's operator check could not be run (see **Checkpoint** below), so the structural half
was measured instead, feeding real files through `validateTeamManifest` into the component.
One member carries a deliberate 3,000-character goal; one name is a deliberate duplicate:

```
n= 3  members= 3  rows= 3  scroll-regions= 4  markup= 8541  footerAfterLastScroller=true  longGoalPresent=true  nameTaken=1  noGoal=0
n= 8  members= 8  rows= 8  scroll-regions= 9  markup=13848  footerAfterLastScroller=true  longGoalPresent=true  nameTaken=1  noGoal=2
n=16  members=16  rows=16  scroll-regions=17  markup=22363  footerAfterLastScroller=true  longGoalPresent=true  nameTaken=1  noGoal=5
n=17  REJECTED by validator: "members" exceeds 16 — a team file may carry at most 16 members
```

- every member becomes a row at every size (`rows == members`);
- `scroll-regions == members + 1` — one bounded scroller per row's review region, plus the
  list scroller, so a long goal is contained twice over;
- the footer renders AFTER the last scroller in DOM order at every size, so `cancel` /
  `hire {n}` sit outside the scrolling list;
- the full 3,000-character goal is present in the markup at every size;
- **17 members never reaches the sheet at all** — T-03-06b's `mitigate` disposition is real,
  and it is the validator's `TEAM_MAX_MEMBERS`, not the byte cap, that enforces it.

Styles confirmed rendering: `max-height:132px;overflow:auto` (per-row region),
`white-space:pre-wrap` (it wraps), `max-height:46vh;overflow:auto` (the list), and
`text-overflow:ellipsis` exactly once — S3a's summary line, kept as specified.

**What this is not:** none of it is a visual check. It shows the containment mechanism is
present and scales; it cannot show that text is legible or that nothing is clipped.

## Checkpoint — Task 3, auto-approved, NOT operator-verified

`.planning/config.json` has `workflow.auto_advance: true`, so the blocking
`checkpoint:human-verify` auto-approved rather than halting.

⚡ **Auto-approved: the review sheet at 3, 8 and 16 members.**

Stated plainly, because an auto-approval is not a verification: **no human exercised the
running app.** The plan asked the operator to run `npm run dev`, import three team files and
confirm no clipped text, internal scroll, a reachable footer, correct duplicate handling, and
a readable ~3,000-character goal. That was not done, and could not be from this worktree —
it has no `node_modules` of its own and no operator is present.

**Still owed:** the visual containment pass at 3/8/16 members, and specifically step 5 (the
long goal is genuinely READABLE in its row, not tooltip-only). The structural evidence above
covers the mechanism; the legibility judgement is the operator's and remains outstanding.

## Deviations from Plan

### 1. [Rule 3 — Blocking] `test/add-agent-export.test.cjs` pinned the OLD import label

The plan mandates relabelling the import button to `import…` (UI-SPEC:944, D-17). That file —
created by 03-04 in wave 4, and in **neither** wave-5 plan's `files_modified` (checked before
editing: 03-08 owns `renderer-runstate` / `repo-claims` / `renderer-components`) — asserts
the literal `'import hire'` three times. Two went red immediately:

```
✖ AddAgentModal renders — and this file is not silently asserting against an empty string
✖ the export button is IN THE RENDERED MARKUP, next to import
```

Updated to the current contract, with each assertion's intent preserved. The third occurrence
(`indexOf('import hire') < indexOf('A team file carries names')`) would have passed
**vacuously** — a renamed label makes it `-1 < n`, which is true — so an explicit
`notEqual(..., -1)` was added there and at the ordering check. This is a superseded literal,
not a test bent to fit a buggy source: the source matches the spec, the test pinned the old
spec.

### 2. [Rule 2 — Missing critical functionality] `character`/`accent` were unvalidated on the team path

`validateHireManifest` only length-caps and lowercases `character` (`src/shared/hire.ts:195`
region) — it does **not** constrain it to the cast. The single-hire form guards this with
`knownCharacter`/`knownAccent`; the new team path had no equivalent, so an untrusted team
file could put an unknown character on the roster and into the scene renderer.

Both fields are in the exporter's allowlist
(`EXPORTABLE = ['description','goal','character','accent','provider','model']`,
`src/main/hire.ts:293`), so hardcoding a default would ALSO have broken export→import
round-tripping. Honoured and validated, mirroring the single-hire guard. Mutation-checked
both ways (bad value falls back; legitimate value survives).

### 3. [Plan-internal contradiction] `export function spawnBatch` vs. an async function

The criterion greps the literal `export function spawnBatch`; `export async function
spawnBatch` does not contain it. Resolved by writing the function as a non-`async` one that
returns the `Promise.all(...).then(...)` chain — the `async` wrapper bought nothing here, so
both the criterion and readability are satisfied rather than one traded for the other.
Measured after: **1**.

### 4. [Plan-internal contradiction] "zero slug arithmetic in the sheet" vs. the duplicate rule

The criterion requires `grep -c -F "replace(/[^a-z0-9]+/g" TeamReviewModal.tsx` to be
**exactly 0**. But `markDuplicates` legitimately needs the slug — its whole job is flagging
rows that would collide on it. Measured **1** after a correct implementation.

Resolved by making the criterion true for the right reason: `agentIdSlug` is now exported
from `bulkSpawn.ts` and called by both `batchAgentIds` and `markDuplicates`. This removes a
genuine second copy of the rule. Had they drifted, the operator's `name taken` warning would
have stopped matching the collisions that actually occur — firing on pairs that get distinct
ids and staying silent on pairs that do not. A test asserts the two agree; now they agree by
construction. Measured after: **0**.

### 5. [Plan-internal contradiction] `import hire…` must be 0, but the change deserves a comment

A comment explaining the relabel naturally quotes the old label, which kept
`grep -c -F "import hire…"` at **1** against a correct implementation — the same shape 03-04
hit with `buildSpawnCommand`. Reworded to describe the old wording without the literal.
Measured after: **0**, with the comment intact.

### 6. [Plan expectation corrected] `capabilities` is not a field on `Agent`

The plan's spawn-descriptor sketch implied carrying manifest fields onto the roster agent.
`capabilities` is not on `Agent` (TS2353) — the single-hire path passes it on the **hive**
descriptor. Moved there, matching that path.

### 7. [Test fixture corrected — not a source change] the punctuation slug case

A first-draft case asserted `'JIM  B!'` should be flagged as a duplicate of `'Jim B'`. It
should not: `'JIM  B!'` slugs to `jim-b-` (trailing dash from the `!`), a genuinely different
id. The **source was right and the expectation was wrong**, so the fixture was corrected —
and the case rewritten to assert the stronger property: `markDuplicates` flags exactly the
pairs `batchAgentIds` actually collides, checked by calling both. No assertion was relaxed to
accommodate a source path.

## Stale-anchor audit — 10 of 17 resolvable citations had moved

Measured at base `f6b60dd6`, per the ANCHOR RULE. Line numbers only; quoted content was
authoritative and correct in every case.

| Citation | Plan says | Measured at base | Moved |
|---|---|---|---|
| `AddAgentModal.tsx` `uniqueId` definition | :131-133 | **:131-133** | no |
| `AddAgentModal.tsx` `toString(36)` | :132 | **:132** | no |
| `AddAgentModal.tsx` `hireCommand` closure | :156-160 | **:194** | **yes (+38)** |
| `AddAgentModal.tsx` `uniqueId` call site | :337 | **:389** | **yes (+52)** |
| `AddAgentModal.tsx` `role: description.trim()` | :363 | **:415** | **yes (+52)** |
| `AddAgentModal.tsx` import button | :1102 | **:1182** | **yes (+80)** |
| `useRestoreTeam.ts` `hive:` payload | :152 | **:152** | no |
| `store/config.ts` `buildSpawnCommand` | :405 | **:412** | **yes (+7)** |
| `store/config.ts` `tokenizeCommand` | :347 | **:354** | **yes (+7)** |
| `store/config.ts` `inferAgentProvider` re-export | :33 | **:34** | **yes (+1)** |
| `agentProvider.ts` `inferAgentProvider` | :661 | **:711** | **yes (+50)** |
| `shared/hire.ts` `capped(o.goal, 4000, …)` | :182 | **:195** | **yes (+13)** |
| `main/hive.ts` `- Role: ${meta.role …}` | :1397 | **:1600** | **yes (+203)** |
| `main/hive.ts` `writeFileSync(identity, …)` | :917 | **:1075** | **yes (+158)** |
| `Modal.tsx` `export function Modal` | :65 | **:66** | **yes (+1)** |
| `test/roster.test.cjs` `a roster round-trips…` | :40 | **:40** | no |
| `03-08-PLAN.md` `:5` / `:14` / `:16` | wave 5 / runstate / components | **exact** | no |

Plus **six** `03-UI-SPEC.md` citations (`:759` S3a, `:263` destructive row, `:768-772` row
table, `:250` failure copy, `:944` label change, `:215` `hire {n}`) — **all exact**. The
pattern from 03-04 holds: planning documents nobody edits keep their anchors; the source
files every plan touches do not. `main/hive.ts` moved by 158–203 lines.

**Grep-count baselines the plan pins, all re-measured at base:**

| Baseline | Plan says | Measured | Verdict |
|---|---|---|---|
| `grep -c "^test(" test/breaker.test.cjs` | 25 | **27** | **stale** — the brief predicted this |
| `grep -c "^test(" test/roster.test.cjs` | 11 | **11** | correct |
| `grep -c "uniqueId"` in `AddAgentModal.tsx` | 2 | **2** | correct |
| `grep -c "toString(36)"` in `AddAgentModal.tsx` | 1 | **1** | correct |
| `grep -rEn "…spawnBatch\|batchAgentIds" test/` | 0 | **0** | correct |
| `grep -n "uniqueId"` in `useRestoreTeam.ts` | 0 | **0** | correct |
| `TEAM_MAX_MEMBERS` | 16 | **16** | correct |

## Acceptance criteria — measured

**Task 1** — all 12 green.
`export function spawnBatch` **1** (see deviation 3) · `spawnBatch(` in `useRestoreTeam.ts` **1** ·
`export function hireCommandFor` **1** · `export function batchAgentIds` **1** ·
`batchAgentIds(` in `AddAgentModal.tsx` **1** (baseline 0) ·
`toString(36)` in `AddAgentModal.tsx` **0** (baseline 1) ·
`uniqueId` in `useRestoreTeam.ts` **0** · `^test(` in `test/bulk-spawn.test.cjs` **8** (≥4) ·
`concurrent` **1** · `input order` **1** · `failure isolation` **1** ·
`^test(.*batchAgentIds` **3** (≥1).
The plan's verbatim node one-liner printed
`PASS jim-loyw3v28,jim-loyw3v28-2,pam-loyw3v28 jim-b-loyw3v28,jim-b-loyw3v28-2`, exit 0.

**Task 2** — all 18 green.
`export function TeamReviewModal` **1** · `export function markDuplicates` **1** ·
`res.team` **1** · `cwd` in the component **18** (baseline 0) · `disabled` **3** ·
`cwd` in the test **10** (baseline 0) · `Pick a folder first` in the component **1** (baseline 0) ·
`import hire…` **0** (baseline 1) · `import…` **1** (baseline 0) ·
`batchAgentIds(` **1** · `spawnBatch(` **1** · `toString(36)` **0** ·
`replace(/[^a-z0-9]+/g` **0** (see deviation 4) · `name taken` **1** · `did not start` **1** ·
`renderToStaticMarkup` **2** · `ZZ-GOAL-SENTINEL-ZZ` **3** (≥2) · `no goal` **1** ·
`test/team-review.test.cjs` exists and passes 16/16 ·
both required titles present (**1** each).

**Ownership pins** (plan-id scoped, never a sha range — 03-08 lands on this branch in the
same wave): `git log --grep="03-06" -- test/team-review.test.cjs` = **2** (≥1) and
`git log --grep="03-06" -- test/renderer-components.test.cjs test/renderer-runstate.test.cjs`
= **0** (exactly 0).

**Plan verification** — `node --test test/bulk-spawn.test.cjs test/team-review.test.cjs
test/hire-manifest.test.cjs` → **0 failures**. `npm run typecheck` → 0 errors.
Task 3 auto-approved, not operator-verified (above).

## Files

The plan's 7 `files_modified`, plus `test/add-agent-export.test.cjs` (deviation 1 — owned by
neither wave-5 plan). **8 files, no deletions, nothing untracked.** Neither of 03-08's two
test files was touched, pinned two ways. `STATE.md` and `ROADMAP.md` were not modified — the
orchestrator owns those.

## Residuals — stated, not papered over

1. **`batchAgentIds` disambiguates WITHIN one call only.** Two *separate* hires landing in
   the same millisecond can still collide, exactly as they always could, and the live roster
   is not consulted. Unchanged from the pre-existing behaviour and commented as such in
   source (`ponytail:` note naming the upgrade path). The bulk case UI-SPEC S3a flagged —
   which is the reachable one, since a batch is by definition same-millisecond — is closed.
2. **Task 3's visual containment check is outstanding** (see Checkpoint). The mechanism is
   measured; legibility is not.
3. **`spawnBatch`'s failure channel is a net, not the primary path, for `useRestoreTeam`.**
   That closure catches its own errors so it can name the agent in the message; anything
   `spawnBatch` catches there escaped the closure entirely. The two lists are merged rather
   than one being dropped, but in normal operation `batch.failures` is empty for restore.
4. **`TeamReviewModal` imports `../scene/office/cast`, which pulls `pixi.js`** into its module
   graph for the sole purpose of validating `character` against the cast. Free at runtime (the
   office scene already loads it) and it loads fine under `loadTs`, but it is a heavy
   dependency for a review sheet. A shared cast-name list with no texture dependency would be
   the cleaner fix; out of scope here.
5. **`preload/index.ts` types `hiveTimelineBucket.rows` as `unknown[]`** (flagged by 03-07,
   unowned). Re-measured this session: `hiveTimelineBucket` is at **:824**, not :826 as the
   brief states. Still unowned; not touched.

## TDD Gate Compliance

Both tasks carry `tdd="true"` and both gates are in the log, in order:

| Task | RED | GREEN |
|---|---|---|
| 1 | `c3efdfa3` — module fails to load (`bulkSpawn.ts` absent) | `fa7c5646` — 8/8 pass |
| 2 | `9236e063` — module fails to load (`TeamReviewModal.tsx` absent) | `a9889c5b` — 16/16 pass |

**No test passed unexpectedly at RED.** In both cases the RED was total — the module under
test did not exist, so `loadTs` threw and the file reported a single failure rather than a
per-case tally. That is the correct red for the right reason, and it is why the GREEN counts
(8 and 16) are the first real per-case measurements.

No test was modified to make a buggy source path pass. The one fixture that changed
(deviation 7) was corrected because the fixture's expectation was wrong about the slug rule,
not because the source misbehaved — and it was replaced with a strictly stronger assertion
that calls both functions. All 11 mutations were reverted and the suite re-run to 0 fail.

## Self-Check: PASSED

All 8 files claimed above exist on disk. All 5 commit hashes resolve in `git log`
(`c3efdfa3`, `fa7c5646`, `9236e063`, `a9889c5b`, plus this SUMMARY's own commit). No file
outside the 8 was touched, no tracked file was deleted, nothing is untracked. Full suite
re-run at head: **1208 tests, 1201 pass, 0 fail, 7 skipped, 24,125.3 ms**.

## Threat Flags

None. Every surface this plan adds is in its own STRIDE register (T-03-06a–d), and all three
`mitigate` dispositions are implemented and negative-controlled:

- **T-03-06b** (large team file) — enforced upstream by `TEAM_MAX_MEMBERS`, demonstrated by a
  17-member file being rejected before the sheet renders.
- **T-03-06c** (a failed member's error being lost) — per-row copy, mutation-checked.
- **T-03-06d** (instructions smuggled behind a benign row) — both untrusted fields render in
  full as text nodes, proven by a render and by the tooltip mutant that the plan's own weaker
  criterion missed.

One surface was ADDED beyond the register and is noted rather than flagged: `character` and
`accent` also cross the trust boundary and reach the roster/scene. They are now validated
(deviation 2). This is a narrowing, not a new exposure.
