---
phase: 01-finish-the-floor
document: gap-plan check
plans_checked: ["01-24", "01-25", "01-26", "01-27", "01-28", "01-29", "01-30", "01-31"]
plans_committed_at: fd66993
tree_checked: gsd/v1.0-milestone @ fd66993
checked: 2026-08-22
verdict: issues_found
blockers: 2
high: 5
medium: 6
low: 3
method: goal-backward — start from 01-VERIFICATION.md's six gaps and 01-REVIEW.md's 16 Criticals,
  then verify each claimed fix is buildable against source at HEAD. Every source claim below was
  re-derived by a command run in this session. No plan or SUMMARY statement was accepted as evidence.
---

# Phase 01 gap-closure plans — pre-execution check

## The one-line answer

**These eight plans close the code half of the gap set and leave the phase goal untouched.** Fifteen
of sixteen Critical review findings have a real, buildable, correctly-owned task. Three of
`01-VERIFICATION.md`'s six gaps close. The headline gap — *"all 20 open floor-inspection issues are
closed"* — is 0/20 before and 0/20 after, and the plans say so plainly rather than pretending
otherwise. That honesty is the set's best property.

Two defects will stop execution or ship a regression, and both are in the same plan (01-25 / 01-24).

---

## Coverage — did each gap land somewhere

### 01-VERIFICATION.md's six gaps

| Gap | Owner | Closed by this set? |
|-----|-------|---------------------|
| SC-5 final clause — 20 non-epic issues still open, PR #77 unmerged | operator | **NO** — named out of scope, 01-31 item 1 |
| SC-3 — OTLP auth, `resolve(p)` path gate, `redactSecrets` matcher | 01-25, 01-24, 01-26 | YES (see BLOCKER-2, HIGH-1) |
| SC-4 — 1024 collapse unreachable, AUTO chip under-reports `custom` | 01-25 T3, 01-29 | YES (see HIGH-2) |
| SC-2 — D-09 unrun, no `v*` tag | operator | **NO** — named out of scope, 01-31 items 2, 3 |
| SC-1 — `window-all-closed` kills every PTY on win32 | Phase 2 / DAEMON-01 | **NO** — declined explicitly, 01-31 item 5 |
| "531 pass is an honest floor" — 2 laundered non-runs + 1 comment-satisfiable pin | 01-24 T3, 01-30 T1 | YES |

**3 of 6.** The three that do not close are correctly attributed and none is claimed as done.

### 01-REVIEW.md's 16 Criticals

| ID | Plan | ID | Plan |
|----|------|----|------|
| a/CR-01 OTLP unauthenticated | 01-25 T1 | b/CR-01 composer data loss | 01-28 T1 |
| a/CR-02 sidecar self-revoke | 01-26 T2 | b/CR-02 blocked agent idled | 01-28 T2 |
| a/CR-03 relative path gate | 01-24 T1 | b/CR-03 roster.json frozen queues | **NONE** |
| a/CR-04 budget band masks caps | 01-27 T1 | b/CR-04 model chip collapse | 01-29 T2 |
| a/CR-05 queue read wipes disk | 01-27 T2 | b/CR-05 1024 collapse unreachable | 01-25 T3 + 01-29 T3 |
| a/CR-06 cross-agent cost key | 01-25 T1 | b/CR-06 AUTO chip `custom` | 01-29 T1 |
| a/CR-07 session_id to argv | 01-25 T3 | c/CR-01 win32 non-run as pass | 01-24 T3 + 01-30 T1 |
| a/WR-01 double-handle | 01-24 T2 | c/CR-02 unattested update feed | 01-30 T2/T3 |
| | | c/CR-03 shim sock_token pin | 01-30 T1 |

**15 of 16.**

### Dependency graph

Declared waves match computed waves. No file appears in two plans' `files_modified`; under
`use_worktrees: false` sequential execution there is no lost-update path. Ownership of the shared hot
files (`hive.ts` to 26, `index.ts` to 25, `useHive.ts` to 28) is declared once and cross-referenced
correctly from the other plans' READ-ONLY notes. This part is clean.

---

## BLOCKERS

### BLOCKER-1 — the phase goal is not reachable by any sequence of these plans

**Plan:** all eight (structural).
**Defect:** ROADMAP's Phase 1 goal is *"all 20 open floor-inspection issues are closed."*
`01-VERIFICATION.md` measured 20 non-epic issues open and 0 closed. No plan closes an issue, merges
PR #77, or moves `nyquist_compliant`. 01-31's verification block states it outright: *"This plan does
not close the phase."* After the full set lands, a re-run of `/gsd:verify-work 1` returns
`gaps_found` again — SC-5 FALSE, SC-2 PARTIAL, SC-1 PARTIAL, `01-VALIDATION.md` still
`nyquist_compliant: false` / `status: draft`.

**This is not a criticism of the plans' honesty — it is a statement of what executing them buys.**
It is recorded as a blocker because the set is a *gap-closure* set and the largest gap is untouched
by it.

**What to change:** nothing in the plans. Do not let this set be read as phase completion. The
sequence the record demands is: land 01-24..01-31, merge PR #77, run D-09 and write
`01-01-SUMMARY.md`, cut a `v*` tag and run `gh attestation verify`, close the 20 issues against
merged source, re-run `/gsd:verify-work 1` — only then consider `nyquist_compliant`.

---

### BLOCKER-2 — 01-25 Task 1 breaks at least four test files it does not own, and one of them throws

**Plan:** 01-25, Task 1.
**Defect:** The task instructs, verbatim:

> *"Pass the DERIVED `agentId` down into `ingestMetrics` and `ingestLogs` and delete the
> `str(attrs['agent.id']) || str(resAttrs['agent.id'])` reads at `:361` and `:400`. Not 'prefer the
> token and fall back' — the payload's claim must stop being read at all."*

and separately, to re-key `this.sessions` by `agentId + NUL + sessionId`.

Both methods are `private` in TypeScript, but the suite loads the module through `test/load-ts.cjs`
where `private` is erased. Measured at HEAD:

```
test/claude-account-failover.test.cjs   26 ingestMetrics/ingestLogs call sites
test/runtime-forget.test.cjs             4 ingestMetrics call sites
test/claude-accounts.test.cjs            2 ingestMetrics call sites
```

Every one of the 32 passes ONE argument with the agent id inside the OTLP attributes. Delete the
attrs read and all 32 attribute to `undefined`.

Worse, `test/runtime-forget.test.cjs` reaches into the accumulator map by RAW session id:

```
:99   collector.sessions.get('old').ts = Date.now() - DAY_MS - 1000;
:108  collector.sessions.get('live').ts = Date.now() - DAY_MS - 1000;
```

Under a composite key those return `undefined` and the test **throws a TypeError**, it does not merely
fail. `:104`'s `assert.equal(collector.sessions.has('old'), false, ...)` silently goes vacuous.

None of those three files is in 01-25's `files_modified`. `test/claude-account-failover.test.cjs`
is the account-pool / FLOOR-09 coverage — 26 call sites of it.

**What to change:**
1. Add the three files to 01-25's `files_modified` and add a task that migrates the 32 call sites and
   the three raw-key probes, with the migration as its own `<behavior>` block: the tests must still
   assert what they assert today, against the derived id.
2. 01-25 already carries a security rework plus two unrelated `index.ts` edits, so split it:
   **01-25a** = collector auth + composite key + the test migration; **01-25b** = `pty.ts` header,
   `index.ts` resolver wiring, `transcript.ts` `VALID_SESSION_ID`, `MIN_WIN`. 01-29's `depends_on`
   then points at 01-25b.
3. Correct the done-criterion grep: it counts `attrs['agent.id']` only. `resAttrs['agent.id']` at
   `:361` is a distinct, case-sensitively non-matching string the task also deletes.

---

## HIGH

### HIGH-1 — 01-24 Task 1's "deny on any candidate base" will deny ordinary agent work

**Plan:** 01-24, Task 1.
**Defect:** The task resolves a relative target against BOTH the agent's registry cwd and
`<hive>/agents/<agentId>`, then *"run[s] the existing four deny branches over EVERY candidate and
return[s] the FIRST reason any of them produces."*

But `denyReason` is not called once per tool call. At `src/main/hooks.ts:453`, `protectedPathDenial`
splits the expanded Bash command on shell separators and pushes **every shell word** as a candidate
target. Join any `../X` word onto `<hive>/agents/a-1` and you land in `<hive>/agents/X`. The last deny
branch then computes the owner segment as `X`, which is not `a-1`, and **denies with "belongs to
another agent"**. After this change:

- `cat ../README.md` DENIED
- `git diff ../src/foo.ts` DENIED
- any Bash command carrying a `../` path relative to the agent's project cwd DENIED

The task's behavior list carries exactly one allow case (`file_path: notes.md`) and no negative
control at all on the Bash word-split path, which is where the explosion happens. A gate that denies
`cat ../README.md` with "that belongs to another agent" is the outage the task's own text warns
against two bullets earlier: *"A gate that blocks an agent's own relative writes is an outage."*

**What to change:** add negative controls to the behavior list — a Bash command carrying `../file`,
and one carrying ordinary non-path words such as npm / run / -la, must be ALLOWED — and constrain the
design so the other-agent branch fires only for candidates that genuinely address that tree. Either
apply the second base only to the explicit file_path / path / notebook_path keys, or discard any
candidate whose join escapes the base it was joined to (relative(base, joined) starting with `..`).
Absolute targets and HIVE_ROOT/AGENT_DIR-expanded targets are unaffected either way.

---

### HIGH-2 — DESIGN.md keeps claiming a 1280 minimum after 01-25 lowers it to 960, and no plan owns DESIGN.md

**Plans:** 01-25 T3 (cause), 01-29 T3 (pin), 01-31 (doc sweep that omits it).
**Defect:** Measured at HEAD:

```
DESIGN.md:169  - Main window minimum: 1280 x 800.
DESIGN.md:677  Min window: 1280 x 800. Right panel collapses below 1024 to bottom drawer.
```

`DESIGN.md` is the document `sidebarLayout.ts`'s own header cites as the source of the 1024
breakpoint, and `test/repo-claims.test.cjs:570` and `:655` already pin other `DESIGN.md` claims. After
01-25 sets `MIN_WIN.width = 960`, both lines are false. `DESIGN.md` is in **no** plan's
`files_modified` — not 01-25's, not 01-29's, not 01-31's, the doc-residual sweep.

ROADMAP success criterion 1 is *"grep finds no doc promising a code path that does not run."* This set
would create a fresh instance of the exact defect it exists to remove, in the design document that is
the authority for the constant being changed. 01-25 T3 already argues the resolution correctly — *"the
window minimum was the accident; the breakpoint is the designed behaviour"* — it just never writes
that conclusion into the document that states the accident.

**What to change:** add `DESIGN.md` to 01-31's `files_modified` and to its Task 1 anchor sweep, with
`:169` and `:677` restated to 960 x 800 plus the reason. Extend 01-29 T3's failure message to name
`DESIGN.md` as the third place the number lives. No test reads either line today (grepped), so this is
a doc fix, not a red test.

---

### HIGH-3 — the suite-figure reconciliation is impossible in the declared wave order

**Plans:** 01-30 verification block, 01-31 verification block.
**Defect:** 01-30 runs in wave 2. Its verification block says:

> *"Reconcile them against 01-VERIFICATION.md's measured 535 / 531 / 0 / 4: state exactly how many
> tests plans **01-24 through 01-29** added..."*

01-29 runs in **wave 3**, after 01-30. At 01-30's execution time none of 01-29's tests exist — it adds
the inverted custom-arm cases, the prefix-flag case, the model-chip style assertion and the cross-file
window pin. 01-30 cannot count them.

01-31 compounds it:

> *"paste the TAP counters and confirm they match plan 01-30's re-derived figure (this plan adds no
> tests and converts none, so **the numbers must be identical** — if they moved, say why)."*

They will have moved, by 01-29's additions, and the "say why" escape turns a hard reconciliation into
a narrative one — in the plan set whose entire subject is figures that were not honestly derived.

**What to change:** pick one. Move the whole-suite re-derivation out of 01-30 into 01-31, which
already runs last and already re-runs `npm test`, leaving 01-30 to report only its own two files; or
move 01-30 to wave 4 alongside 01-31. The first is smaller. Then fix 01-30's sentence to "01-24
through 01-28" and rewrite 01-31's to state the expected arithmetic: 535 plus the tests added by
24..30, with the skipped counter up by exactly 2 on win32.

---

### HIGH-4 — b/CR-03 is an unowned Critical with no entry in any register

**Plans:** 01-28 (mentions it), 01-31 (out-of-scope register that omits it).
**Defect:** b/CR-03 — *"roster.json still carries a frozen queues slice the renderer no longer owns —
re-delivers pre-migration messages after a Change Home"* — is a Critical with a duplicate-delivery
outcome. 01-28's interfaces block mentions it only to disclaim it:

> *"Its removal is bound up with rosterMirror.queues (review b/CR-03), which is NOT in this gap set;
> ripping out half of that pair here would be worse than leaving both."*

Sound for 01-28. But 01-31's "Out of scope — operator-blocked" section — the set's one register,
written explicitly *"so nothing in this gap-closure work is mistaken for closing them"* — lists five
items, all operator-blocked, and does not include b/CR-03. A code defect that is neither fixed nor
registered is a defect that disappears at phase close.

**What to change:** add a sixth entry to 01-31's out-of-scope section for b/CR-03 with its
`store.ts:529-544` and `adoptRendererQueues` anchors and a named owner. Give HIGH-5 and MEDIUM-6 the
same treatment. Rename the heading: it currently reads "operator-blocked", which is precisely why the
code residuals had nowhere to go.

---

### HIGH-5 — FLOOR-12's Pixi 7px defect is a source defect filed as an operator observation, and the test that should catch it is green

**Plans:** 01-31 item 4 (misfiling); no plan fixes it.
**Defect:** Re-derived at source:

```
src/renderer/src/scene/office/ThoughtBubble.ts:22   const FONT_SIZE = 14;
src/renderer/src/scene/office/ThoughtBubble.ts:23   const RENDER_SCALE = 0.5;
src/renderer/src/scene/office/ThoughtBubble.ts:76   this.inner.scale.set(RENDER_SCALE);
src/renderer/src/scene/office/ToolBubble.ts:29      const FONT_SIZE = 14;
```

Designed on-screen size is 7px, against a 14px floor that `DESIGN.md:706`, FLOOR-12 and
`test/repo-claims.test.cjs:655` all assert. And `test/repo-claims.test.cjs:655` reads the **literal**
14 rather than the effective size, so it reports green over the defect it names — c/CR-01's and
c/CR-03's shape a third time, and this one nobody in the set is fixing.

01-31's out-of-scope item 4 folds this into *"the remaining human_verification items ... the ~600
swept FLOOR-12 surfaces and the Pixi labels. **Owner: operator.**"* Looking at it is an operator task.
The 7px arithmetic is not: it is measurable from source, `01-VERIFICATION.md` already measured it, and
calling it an observation makes a known defect look merely unobserved.

The same misfiling covers the two named, source-verified layout clips — the SkillsTab catalog row and
SidebarTabs' TERMINAL/MESSAGES labels at the default 420 rail (b/WR-06). Neither has an owner.

**What to change:** either add a task — set the two FONT_SIZE constants to `14 / RENDER_SCALE` and
strengthen `test/repo-claims.test.cjs`'s Pixi scan to multiply by the container scale; neither file
has another owner in the set, so it is a clean add — or move all three items into 01-31's register as
**code** residuals with named owners, worded so nobody reads them as "an operator just needs to look."

---

## MEDIUM

### MEDIUM-1 — 01-31 Task 2's own done criterion is unsatisfiable as written

Its done criterion is a tree-wide grep for the retired name excluding node_modules, .git and
.planning, expected to return only `docs/floor-inspection.html:710`. Run at HEAD it also returns:

```
./test/repo-claims.test.cjs:28, :338, :346   <- the pin itself, which must contain the string
./dist/win-unpacked/resources/skills/capabilities/SKILL.md:96
./dist/win-unpacked/resources/app.asar        (binary match)
./out/main/index.js:2335
```

`dist/` and `out/` are gitignored build output, and `test/repo-claims.test.cjs` cannot avoid carrying
the string it tests for. **What to change:** add `--exclude-dir=dist --exclude-dir=out` and exclude
`test/repo-claims.test.cjs` by path, in both the done criterion and the widened tree scan, with the
self-exclusion reason written into the exclusion the way the plan already requires for
`docs/floor-inspection.html`.

### MEDIUM-2 — 01-25 is over budget even before BLOCKER-2's additions

3 tasks / 5 declared files, but the content is: a security rework of one listener, a re-key of an
accumulator with four access sites, an env-injection change in `pty.ts`, a composition-root wiring
with a temporal-dead-zone hazard, a new regex export, an argv sink guard, and a window constant. The
window constant and the resume guard are in this plan only because *"src/main/index.ts has exactly one
owner in this gap-closure set"* — a scheduling reason, not a cohesion one. Split per BLOCKER-2 step 2.

### MEDIUM-3 — 01-29 Task 1's tokenized matcher is vacuously true on empty-flag presets

`src/shared/agentProvider.ts:356` and `:531` carry `autoModeFlag: ''` (opencode and custom). The task
says *"split the flag on whitespace, and require every flag token to be present."* Implemented with a
`filter(Boolean)` before `.every(...)`, an empty flag yields an empty token list and `.every()` on an
empty array is `true` — so **every custom agent gets the AUTO chip**. The task's own behavior list
(`isAutoModeAgent('custom','my-agent',true)` false) catches it, but the plan should state the guard
rather than leave it to a test. Also name which field the custom scan reads: the operator types the
real CLI flag, so `autoFlag` is the semantically right one — identical to `autoModeFlag` in all eleven
presets today, which is b/WR-01's named residual.

### MEDIUM-4 — 01-28 Task 1 under-counts enqueueMessage's callers and misses its early return

The task names *"useHive.ts:891 (Slack ingress) and useHive.ts:~915"*. Measured at HEAD there are six
call sites in that file — `:668`, `:672`, `:895`, `:914`, `:972`, `:1033` — plus
`MessageQueueComposer.tsx:146`. The generic instruction *"Check every other caller before changing the
type"* covers it, but this phase's own conclusion is that a wrong anchor routes the next change into
the wrong place.

Separately, `store.ts:822-823` is `const trimmed = text.trim(); if (!trimmed) return;` — a bare
`return` that becomes a type error the moment the signature widens to a promise. Name it and say what
it resolves to; `{ ok: false, error: ... }` is the shape every other refusal already uses.

Confirmed harmless on lint: `eslint.config.js` runs exactly two rules with no `project` option, so
`no-floating-promises` is not in play at any of the six sites.

### MEDIUM-5 — 01-31 raises a frozen skip ceiling the document it edits forbids raising

`01-VALIDATION.md:52-55` reads:

> *"The frozen skip baseline for this phase is `# skipped 4` ... `# skipped` **<= 4** — not `>=`, never
> `>=` — are the standing floor. A `>=` skip clause permits skip growth by construction and is the
> exact shape that lets a phase close green on skipped work."*

01-31 Task 3 raises it to 6. That is correct here — both new skips were previously **false passes**,
so 6 is the honest count and 4 was the fiction. But the plan instructs only *"record the new count,
name both new members by their test titles."* **What to change:** require the edit to state, in
`01-VALIDATION.md` itself, that the ceiling moved 4 to 6 because two non-runs were relabelled rather
than because work was skipped, and that the `<=` semantics is re-frozen at 6. Otherwise the next
reader sees a skip ceiling that moved, which is the pattern that paragraph exists to forbid.

No CI or test enforces the number (grepped: no hit in `test/`, `scripts/`, `.github/workflows/`,
`package.json`), so nothing goes red — this is record integrity, not an execution blocker.

### MEDIUM-6 — FLOOR-10's "enforced, not merely reported" ceiling has no owner and no register entry

`01-VERIFICATION.md` records it as a qualification on a **ticked** row: `hardStop: false` is the
default (`breaker.ts:91`), capping the ladder at `constrained`, whose entire action at
`index.ts:1647-1650` is a mail asking the agent to "Stop active work now" plus a toast. The
verification's anti-pattern table lists it as a Warning and names issue **#4** as its closer.

01-27 correctly declines to touch it — D-18 forbids finishing it into a kill — and 01-27's verification
block does register the *quiesce* residual it defers. But FLOOR-10's advisory ceiling appears in no
plan's residual list and in no entry of 01-31's register. Same fix as HIGH-4: register it with its
anchors and #4 as owner.

---

## LOW

### LOW-1 — 01-30 Task 2's "parse the YAML, do not grep" is self-contradictory for the checksum globs

The hashed set lives inside a shell string at `release.yml:143-155` (an `ls` over four globs inside a
`run:` body), not in YAML structure, so deriving it requires a regex over that string. Also
unmentioned: the upload globs carry a `dist/` prefix while the hash globs do not, so the comparison
needs normalisation before it can mean anything. State both, so nobody reports a green pin over a set
comparison that never matched.

### LOW-2 — 01-25's agent.id grep misses its sibling

`grep -c "attrs\['agent.id'\]"` is case-sensitive and does not match `resAttrs['agent.id']`, which the
same task deletes at `:361`. Name both strings in the done criterion, or make the pattern
case-insensitive on the prefix.

### LOW-3 — SC-1 stays literally false on win32 and the set records that only as "not restated"

01-31 item 5 declines to restate SC-1, correctly: `index.ts:5792`'s `window-all-closed` calling
`ptyManager.killAll()` then `app.quit()` on non-darwin is DAEMON-01's territory, not FLOOR-02's. The
consequence is that ROADMAP criterion 1's first sentence — *"With the app window closed, a message
composed in the UI still reaches its recipient's inbox"* — remains an untrue claim in the ROADMAP
after this set lands, on the operator's own platform. Worth a one-line pointer in the criterion itself
to Phase 2, so the next reader does not have to find `01-VERIFICATION.md` to learn it is knowingly
deferred.

---

## What is right, and should not be re-litigated

Stated so the revisions above are not read as a rewrite request.

- **Ownership is clean.** Zero `files_modified` collisions across eight plans under
  `use_worktrees: false`. Every shared hot file — `hive.ts`, `index.ts`, `useHive.ts`, `hooks.ts` —
  has exactly one owner, and the other plans carry READ-ONLY notes naming it. Declared waves match
  computed waves. Two plans explicitly instruct STOP-and-report rather than editing a file they do not
  own (01-25 on `hive.ts:1087`, 01-30 on `README.md` / `RELEASE.md`).
- **Every source anchor I spot-checked was accurate.** `hooks.ts:126` one-arg `resolve`; the un-sliced
  `buf` with no cap, no timeout and no done-flag in `listenOn`; `breaker.ts:358-365`'s terminal band
  sitting above five arms with a single `{tripping:false}` exit; `delivery.ts:371-384`'s unconditional
  `this.queueFile = path`; `telemetry.ts:314`'s cap-and-nothing-else handler; `hive.ts:2841`'s
  `agent_id + U+0000 + session_id` convention; `transcript.ts:73`; `autoMode.ts:42`; both win32 bare
  returns; `ThoughtBubble.ts`'s FONT_SIZE / RENDER_SCALE pair. The interfaces blocks were re-derived,
  not inherited — which is why the two miscounts in MEDIUM-4 stand out rather than blend in.
- **The regex widenings in 01-26 are correct.** Traced by hand: `sk[-_](?:ant[-_])?[A-Za-z0-9_-]{16,}`
  picks up `sk_live_...` without losing `sk-ant-...`; making the separator group absorb an optional
  closing quote matches the JSON shape, because the key's closing quote is exactly what blocks group 2
  today; and it leaves *"The token cap is 1.2 million tokens this session."* untouched, since the
  delimiter class cannot match a space followed by `c`. Group numbering is preserved so the group-3
  backreference survives. The LOCKSTEP mirror requirement is real and load-bearing.
- **The fail-closed decisions are argued, not assumed.** 01-25 refusing when `resolveAgentForToken` is
  absent; 01-24 denying a relative target with no known base; 01-27 staying disarmed on a non-ENOENT
  read failure. Each names why the permissive alternative is the defect.
- **`useHive.ts` already has what 01-28 T2 needs.** `useStore.getState()` is called inside the event
  callback at `:495` and `self` is resolved at `:496`, so the blocked guard is a one-line read of a
  fresh value — no new subscription, no second copy of the status, exactly as the plan requires.
- **RED-first is demanded with pasted output on every behavioural task**, and 01-29 T3, 01-30 T1, 01-30
  T2 and 01-31 T2 each require the *pin itself* to be seen failing. That is the discipline whose
  absence produced c/CR-01 and c/CR-03.
- **The scope discipline is real.** The opencode chip, the autoFlag/autoModeFlag drift, stripComments'
  string truncation, c/WR-02's four failure-swallowing release settings, the quiesce status filter's
  main-side mirror — each named in-plan as a residual with its reason rather than silently absorbed or
  silently dropped. HIGH-4, HIGH-5 and MEDIUM-6 are gaps in that register, not in the habit.

---

## Verdict

`issues_found` — **2 blockers, 5 high, 6 medium, 3 low.**

BLOCKER-2 and HIGH-1 must be fixed before execution: the first stops the suite (and throws, not
merely fails), the second ships a security gate that denies ordinary work. HIGH-2, HIGH-3, HIGH-4 and
HIGH-5 are cheap plan edits — one file added to a `files_modified`, one paragraph moved between two
plans, four entries added to a register — and should land in the same revision.

Answering the question as asked: **executing these eight plans closes 3 of the 6 gaps in
`01-VERIFICATION.md` and 15 of the 16 Critical review findings. It does not close the phase.** The
three uncovered gaps are correctly attributed to the operator or to Phase 2, and no plan claims
otherwise.

I would not bet a pager on this set finishing the floor. I would bet one on it closing the three code
gaps it claims — after 01-25 is split and 01-24's deny surface is bounded.

---

_Checked: 2026-08-22 against `gsd/v1.0-milestone` @ `fd66993`._
_Every measurement in this document was produced by a command run in this session._
