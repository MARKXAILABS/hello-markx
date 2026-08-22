---
lens: 4 of 5 - file ownership, wave ordering, cross-plan handoffs
scope: 01-24-PLAN.md through 01-31-PLAN.md (eight gap-closure plans)
execution_model: use_worktrees false - sequential, one working tree, wave order then plan-id order
waves_verified: w1 = 24,26,27,28 | w2 = 25,30 | w3 = 29 | w4 = 31
derived_at: HEAD 47a48cd, 2026-08-22
verdict: ISSUES FOUND - 2 blockers, 11 warnings, 3 info
---

# Red-team lens 4 - ownership, ordering, handoffs

Method: `files_modified` frontmatter extracted mechanically from all eight plans and diffed;
per-task `<files>` extracted and diffed against frontmatter; every path token in every plan body
diffed against that plan's declared set; every cross-plan claim ("owned by plan NN", "READ-ONLY
here", "STOP and report") checked against the other plans' actual `files_modified`; every
behavioural change traced to the existing tests that assert it, and each of those tests traced to
an owning plan. All source claims re-derived at 47a48cd, not read from a SUMMARY.

---

## 1. File collisions - the zero-collision claim HOLDS

36 declared paths, 36 unique, **zero duplicates**. Verified mechanically:

    awk over files_modified x 8 plans -> 36 lines
    sort | uniq -d                    -> (empty)
    sort -u | wc -l                   -> 36

Stronger result: the union of every task's `<files>` element equals that plan's `files_modified`
**exactly, for all eight plans**. There is no frontmatter/body drift anywhere in the set. That is
better than the usual state of a plan set and it deserves to be said.

Every path mentioned in a plan body but absent from its declared set was checked. All are
explicitly marked read-only, reference-only, or hand-off-to-another-plan - **except two**
(BLOCKER-2, WARNING-4).

**Un-owned files that the set writes to, or reads as a contract, with no owner anywhere:**

| File | Read by | Written by | Consequence |
|---|---|---|---|
| `src/renderer/src/store/sidebarLayout.ts` | 01-25, 01-29 | nobody | Both plans claim the other owns it (WARNING-3) |
| `src/renderer/src/App.tsx` | 01-25 (names it as 01-29's) | nobody | 01-29 does not declare it |
| `README.md`, `RELEASE.md` | 01-30, 01-31 | nobody | 01-30's STOP-and-report hatch has no receiver (WARNING-4) |
| `test/engine-parity.test.cjs` | 01-26, 01-27, 01-30 (as precedent) | nobody | Carries live coverage of two paths this set changes (WARNING-6) |
| `01-23-SUMMARY.md` | 01-30 (names its stale pin) | nobody | Keeps claiming `# skipped 4` forever (INFO-2) |

---

## 2. Ordering - the graph is acyclic and every real handoff is correctly ordered, but the graph is both under- and over-specified

Wave arithmetic re-derived from `depends_on`: 24->w1, 26->w1, 27->w1, 28->w1, 25->w2, 30->w2,
29->w3, 31->w4. **Matches the declared `wave:` field on all eight.** No cycles, no forward
references, no reference to a non-existent plan.

Answering the four named handoffs:

**(a) MIN_WIN 1280->960 (01-25, w2) -> the collapse pin (01-29, w3).** Order correct. 01-29's pin
needs nothing else from 01-25 - Tasks 1 and 2 of 01-29 (`autoMode.ts`, `AgentCard.tsx`) have zero
dependency on 01-25, so `depends_on: ["01-25"]` serialises three tasks to satisfy one. Harmless
under sequential execution. **But the RED-demonstration instruction in Task 3 is a live hazard -
see BLOCKER-2.**

**(b) redactSecrets widened (01-26, w1) -> FLOOR-04 restated (01-31, w4).** Order correct, and
01-31 Task 3 is correctly instructed to "verify each claim at source before you write it" rather
than trusting 01-26's SUMMARY. Two defects in the handoff, both WARNING: 01-31's `<context>`
loads only `01-30-SUMMARY.md` while Task 3 requires reading 01-24 through 01-30 (WARNING-5); and
01-31 Task 3 hands the executor two raw line anchors into a file 01-26 has just edited above them
(WARNING-7).

**(c) realResolve + net-binding (01-24, w1) -> win-cmd-shim + shim pin (01-30, w2).** Order correct
and the dependency is real, not decorative: 01-30 Task 1 must confirm "this is the second and last
instance" by a sweep whose result only becomes true after 01-24 lands. Hidden coupling found:
01-30's `shimTemplates()` reads `src/main/hive.ts`, which **01-26 edits in w1**, and 01-30 does not
declare `01-26` in `depends_on` (WARNING-2). Incidentally satisfied by wave math. Contained by
design - `shimTemplates()` slices by regex, not by line - and 01-26's four edit sites (:402-417,
:726-728, :1285-1339, :1455) are all above the shim templates at :3635+, so the derivation
survives. Verified at source, not assumed.

**(d) 01-31 depends on all six - real, and simultaneously MISSING one.** Every one of the six is
load-bearing: 25 (index.ts anchors), 26 (hive.ts anchors plus the hive.ts:1455 rename it must
verify), 27+28 (FLOOR-02/10/RECORD-03 evidence sentences), 29 (FLOOR-01/13 rows), 30 (the
re-derived skip figure). Not needless serialisation. **But `01-24` is absent from `depends_on`
while Task 3 demands "Read every SUMMARY from plans 01-24 to 01-30", restates GATE-01 against
01-24's path-gate fix, and counts 01-24's skip conversion into the frozen set of 6.** WARNING-1.

---

## 3. Same-wave writes to src/main/ - no compile coupling found

`use_worktrees: false` makes w1's four plans sequential (24 -> 26 -> 27 -> 28), so "same wave" is
not concurrency. The real question is symbol coupling. Checked at source:

- **01-24 -> HiveManager.** `denyReason` is told to read `this.hive.registry().agents[agentId]?.cwd`
  and `this.hive.root()`. Both exist and are public: `hive.ts:2035 registry(): Registry`,
  `hive.ts:520 root(): string | null`. `RegistryAgent extends AgentMeta` and `AgentMeta.cwd: string`
  is required. **01-26 changes neither.** The API is available. *But see BLOCKER-1 for what the
  field actually contains.*
- **01-27 -> breaker.ts / delivery.ts.** Both changes are to private methods (`evaluate`,
  `loadQueue`); no exported signature moves. `hooks.ts` (01-24) calls `breaker.recordToolUse` -
  untouched.
- **01-28 -> renderer.** `enqueueMessage` widens from `=> void` to a promise type. Checked
  `eslint.config.js`: two rules only (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`),
  **no `project` option, so no type-aware linting and no `no-floating-promises`**. Unawaited callers
  cannot fail lint, and TypeScript does not error on a discarded return. No compile break.
- **01-29 (w3) -> AgentCard.tsx / autoMode.ts.** Reads `src/renderer/src/store/config.ts` (owned by
  01-31, w4 - reads precede the write, correct) and `src/shared/agentProvider.ts` (un-owned,
  read-only, unchanged by anyone). No collision.

**No two plans in the set modify a shared symbol, type or exported signature.**

---

## 4. Test-file contention - none

Thirteen existing test files plus three new ones, **each claimed by exactly one plan**:

    24: net-binding                  27: breaker, delivery-main
    25: telemetry-auth (new)         28: renderer-queue (new)
    26: hive-durability,             29: renderer-runstate, renderer-components
        voice-messages,              30: win-cmd-shim, hook-auth-roundtrip, ci-config
        hive-proxy-token (new)       31: repo-claims

All three "new" files confirmed absent from the tree - no accidental overwrite.

`test/repo-claims.test.cjs` - the shared accumulator six prior plans appended to - is claimed by
01-31 alone, and no other plan is told to append to it. Correct. Its pins were read in full: they
pin `src/main/index.ts`, `hooks.ts`, `delivery.ts`, `MessageQueueComposer.tsx`, `AgentCard.tsx`,
`useHive.ts` and `HIVE.md` - all files this set edits. Every one of those pins is **located by
content or by identifier, never by line number** (`m1Multiset` keys on trimmed line TEXT;
FLOOR12_ALLOWLIST clause 3 walks back from `indexOf(entry.text)`; the Stop-drain pin is
`/drainForStop\(/` and siblings). Traced each against the planned edits: **none of the eight plans'
changes trips a repo-claims pin.** The ONE_SHOT_READERS count pin on `useHive.ts` (exactly one
`hiveTasks(` read) survives 01-28's comment-and-guard edit.

---

## 5. The pass-count contract - SOUND. The arithmetic is right and nothing asserts an absolute.

This was the highest-suspicion item and it survives scrutiny.

- **No test anywhere asserts an absolute pass/skip/total count.** grep for `# pass`, `# skipped`,
  515, 511, 531, 535, `testCount` across `test/*.cjs` returns nothing. The two `t.skip()`
  conversions cannot falsify a test.
- **I ran the sweep 01-30 Task 1 asks for, in BOTH polarities** (the plan prescribes only
  `platform === 'win32'`, which is a half-grep - WARNING-8). Full result, 18 hits:
  - **Laundered passes (bare `return` in a test callback, whole test vacuous): exactly 2** -
    `net-binding.test.cjs:322` (01-24) and `win-cmd-shim.test.cjs:167` (01-30). **The set's claim
    is correct.**
  - `net-binding.test.cjs:282` and `transcript-project-dir.test.cjs:122` - partial-body guards
    inside tests that assert unconditionally elsewhere. 01-24 explicitly rules this shape out of
    scope with the right reason ("cannot go vacuous"). Correctly left alone.
  - `hive-hook-node.test.cjs:153`, `hive-runtime-path.test.cjs:83`, `hook-auth-roundtrip.test.cjs:95`
    and `:128` - all four already use the runner's `{ skip: !POSIX }` options form. **These are
    exactly the frozen `# skipped 4`.** 4 + 2 = 6. **01-31's "the honest count is 6" is
    arithmetically correct.**
  - `proc-kill.test.cjs:29` - a third shape neither plan names: a module-level `process.exit(0)` on
    win32 after two real assertions. It reports no false pass, but it **de-registers** every test
    below it, so those contribute neither a pass nor a skip on win32. 01-30's re-derivation
    instruction does not account for a file that registers zero tests on the operator's platform
    (INFO-1).

---

## 6. Orphaned gaps - 15 of 16 Criticals owned; one is dropped without a register entry

Extracted every Critical ID from the three review slices: a/CR-01..07 (7), b/CR-01..06 (6),
c/CR-01..03 (3) = 16. Cross-referenced against every ID cited in the eight plans.

| Critical | Owner |
|---|---|
| a/CR-01, a/CR-06, a/CR-07 | 01-25 |
| a/CR-02 | 01-26 |
| a/CR-03 | 01-24 |
| a/CR-04, a/CR-05 | 01-27 |
| b/CR-01, b/CR-02 | 01-28 |
| **b/CR-03** | **nobody** |
| b/CR-04, b/CR-06 | 01-29 |
| b/CR-05 | 01-25 (the constant) + 01-29 (the pin) |
| c/CR-01 | 01-24 + 01-30 |
| c/CR-02, c/CR-03 | 01-30 |

01-VERIFICATION.md's six numbered gaps: 1 and 4 -> operator, both named in 01-31's out-of-scope
list; 2 -> 01-24 + 01-25; 3 -> 01-25 + 01-29; 5 -> 01-24 + 01-30; 6 -> 01-31 correctly refuses to
flip `nyquist_compliant` / `status`. **All six accounted for.** SC-1's restatement is explicitly
excluded with a Phase-2 owner. Clean.

**b/CR-03 is the single orphan** - `rosterMirror.queues = initialQueues` at `store.ts:600`
re-delivering pre-migration messages after a Change Home. 01-28 declines it in prose ("NOT in this
gap set") **while owning the file it lives in**, and it appears in neither `deferred-items.md` nor
01-31's "Out of scope" section - the section whose own stated purpose is "Named here once, in the
last plan of the set, so nothing in this gap-closure work is mistaken for closing them."
WARNING-9.

---

# Findings

## BLOCKER-1 - 01-24 elevates a registry field the codebase explicitly permits to be relative

**Dimension:** cross-plan data contract | **Plan:** 01-24, Task 1 | **Severity: BLOCKER (goal)**

01-24's `<interfaces>` block asserts the two bases are ones "main can vouch for", and calls
`this.hive.registry().agents[agentId]?.cwd` "the agent's project cwd, the value index.ts itself
spawns the engine in". Read at source, that is not what the field guarantees:

- `hive.ts:825-838` `cwdValidity()` returns `{ valid: false, issue: 'not-absolute' }` for a
  non-absolute cwd. The issue string exists because the case is real.
- `hive.ts:907-921` `ensureAgent` stores `meta.cwd` **verbatim** (tilde-expanded only) into
  registry.json regardless of validity, and merely records the flag as `cwdValid`. `hive.ts:932`
  then logs `kind: 'cwd_invalid'`.
- `RegistryAgent.cwdValid`'s own JSDoc names the failure: *"A non-absolute fragment (e.g.
  'ClaudeTerminalHarness') spawns into a nonexistent dir and fails; this flag makes that visible."*
- Two writers feed it from adapter data: `hive.ts:3708` `agy.workspacePaths[0]`, `hive.ts:4087`
  `grok.cwd || grok.workspaceRoot`.

Consequences for the plan as written:

1. **The deny branch never fires when it must.** The plan's rule is "if the candidate set is empty
   -> deny". A relative registry cwd produces a **non-empty** candidate set of one garbage entry,
   so the deny is skipped. `hive.root()` is typed `string | null` (`hive.ts:520`); when it is null
   the garbage entry is the *only* candidate, `realResolve` falls back to the Electron main process
   cwd - and **a/CR-03's bypass survives verbatim in the configuration the plan claims to close.**
2. **False denials of an agent's own writes.** The plan's own behaviour list requires
   `{ file_path: 'notes.md' }` -> ALLOWED, calling a gate that blocks an agent's own relative writes
   "an outage". With a relative registry cwd, whether that case allows or denies depends on the
   `process.cwd()` of the Electron main process. The gate becomes non-deterministic.

Neither the behaviour list nor the `<interfaces>` block mentions `cwdValid` or `'not-absolute'`.

**Why this is lens 4:** the contract belongs to `src/main/hive.ts`, owned by **01-26, same wave**.
01-24 has no authority to normalise or reject the field at its source.

**Fix (contained inside 01-24's own files_modified, no ownership change needed):** filter the
candidate set with `isAbsolute()` before use - a registry cwd that is not absolute is not a base
main can vouch for and must be dropped, which then correctly routes to the empty-set deny. Add the
case to Task 1's behaviour list: *"an agent whose registry cwd is a relative fragment, relative
target, hive.root() null -> DENIED."* State in the plan that `cwdValid` exists and why it is not
sufficient on its own (it is a report, not a gate).

---

## BLOCKER-2 - 01-29 Task 3's RED demonstration invites an undeclared write to src/main/index.ts in wave 3, silently reverting 01-25

**Dimension:** ownership / wave ordering | **Plan:** 01-29, Task 3 | **Severity: BLOCKER (execution)**

`src/main/index.ts` is declared by **01-25 only** (wave 2). 01-29 (wave 3) declares it READ-ONLY
and its files_modified is autoMode.ts, AgentCard.tsx, renderer-runstate.test.cjs,
renderer-components.test.cjs.

01-29 Task 3's `<done>` **requires** the pin to have been "demonstrated RED against width: 1280".
Its `<action>` says:

> Write the test FIRST and confirm it would have been RED at 47a48cd (MIN_WIN.width was 1280) -
> **run it against the pre-01-25 value if the tree already carries the fix**, and paste the output.

Under `use_worktrees: false` the tree by wave 3 **does** already carry the fix (01-25 Task 3 set it
to 960 in wave 2). "Run it against the pre-01-25 value" on a single shared working tree has one
obvious mechanical reading: **edit src/main/index.ts:2516 back to 1280, run, edit forward.**

That is (a) a write to a file 01-29 does not own, (b) in a later wave than the plan that owns it,
(c) to the exact constant that is the phase's headline b/CR-05 fix - and if the revert step is
missed, or a later command re-reads the file mid-edit, MIN_WIN.width ships at 1280, 01-25 Task 3 is
silently undone, and 01-29's own new pin then goes RED with no plan owning the file to fix it.

**The set already knows the right idiom and uses it one plan over.** 01-30 Task 2 says: *"mutate
the parsed step's run to npm test || true **in memory** and confirm the new assertion fires."*
01-29 Task 3 omits the two words that make the difference.

**Fix:** mandate an in-memory demonstration - extract the constant from a string the test builds,
or from `git show 47a48cd:src/main/index.ts` (read-only, no working-tree mutation), assert the
extractor finds a number, then compare against 1280 in memory. Add the explicit prohibition 01-25
Task 2 already uses about hive.ts: *"Do NOT edit src/main/index.ts; it is owned by plan 01-25 and a
second editor under use_worktrees: false is a lost update."*

---

## WARNING-1 - 01-31's depends_on omits 01-24, which three of its clauses require

**Plan:** 01-31, frontmatter. `depends_on: ["01-25","01-26","01-27","01-28","01-29","01-30"]`.
Task 3 requires "Read every SUMMARY from plans **01-24** to 01-30"; restates GATE-01 as *"the path
gate now resolves relative targets (plan 01-24)"*; and counts *"Plans **01-24** and 01-30 each
converted a bare return"* to reach the frozen set of 6. Incidentally satisfied (01-24 is w1, 01-31
is w4), so execution holds - but the declared graph does not describe the real one. Add "01-24".

## WARNING-2 - 01-30's depends_on omits 01-26, whose edits to hive.ts it reads through

**Plan:** 01-30, frontmatter. `depends_on: ["01-24"]`. Task 1's `shimTemplates()` derivation reads
`src/main/hive.ts`, owned by 01-26 (w1). Incidentally satisfied by wave math, and contained by the
regex-based slicing (verified: 01-26's four edit sites are all above the shim templates at :3635+).
Declare "01-26" so the containment is a property of the graph rather than of luck.

## WARNING-3 - 01-25 asserts ownership of three files and is wrong about two

**Plan:** 01-25, Task 3.

> "sidebarLayout.ts, App.tsx and test/renderer-runstate.test.cjs are owned by plan 01-29."

01-29's files_modified contains **only** renderer-runstate.test.cjs of those three.
`src/renderer/src/store/sidebarLayout.ts` and `src/renderer/src/App.tsx` are owned by **no plan in
the set** - and 01-29 in turn marks sidebarLayout.ts "READ-ONLY here", so each plan defers to the
other. Nobody writes them, so nothing breaks; but the STOP-and-defer instruction points at a plan
that cannot receive it. Correct to "owned by nobody in this set - do not edit; STOP and report."

## WARNING-4 - 01-30's README.md / RELEASE.md handoff points at a plan with no write authority

**Plan:** 01-30, Task 3.

> "If either needs a change after yours, STOP and report it; **plan 01-31 carries the doc-residual
> sweep**."

01-31's files_modified contains neither file. No plan in the set owns either. Verified the handoff
will probably not fire - README.md:172-176's claim ("with a SHA256SUMS.txt beside them and a
Sigstore build-provenance attestation ... Together those prove an artifact was built from this
repository") becomes *more* accurate after 01-30 widens the hashed set, and RELEASE.md:42-44's
"every artifact named in it" was already accurate. So the escape hatch is unlikely to be taken.
The broken contract stands regardless: either add both files to 01-31, or name the operator.

## WARNING-5 - 01-31's @-context loads one SUMMARY where Task 3 requires seven

**Plan:** 01-31, `<context>`. It loads `01-30-SUMMARY.md` only. Task 3 opens: "Read every SUMMARY
from plans 01-24 to 01-30." Six of the seven are not loaded. The executor can Read them, but a task
whose first instruction is unmet by its own context block is a task that will be done from the
plan's prose instead - which is precisely the SUMMARY-trust failure 01-31 exists to correct.

## WARNING-6 - test/engine-parity.test.cjs carries live coverage of two paths this set changes, and no plan owns it or runs it

**Plans:** 01-26 Task 2, 01-27 Task 1. The file is owned by nobody (01-30 says so explicitly). It
carries:

- **:405-520 - five FLOOR-10 budget-arm tests**, including :464 *"a card at 85% of its cap steers
  and STAYS steering"* driving `carded('jim-1','t-1', 8_500, 10_000)` - **exactly the 80-100% soft
  band 01-27 Task 1 converts from terminal to advisory** - and asserting `/85% of its cap/` on the
  reason string. 01-27's `<interfaces>` names only test/breaker.test.cjs and its `<verify>` runs
  only that file.
- **:243-287 - a real two-call drive of startProxyBridge / stopProxyBridge** ending in
  `assert.deepEqual(revoked, ['token-for-qwen-1'])`, an exact-multiset assertion on **the exact
  revocation path 01-26 Task 2 rewrites**. 01-26's `<verify>` runs only the new
  test/hive-proxy-token.test.cjs.

**I traced both and neither breaks:** makeBreaker() (engine-parity :53-58) configures no
costCapUsd, no costCapTokens and no agentTokenCaps, so tick()'s topSpender/topTokenSpender
(breaker.ts:252-274) stay null and every arm below the band is silent for a `sample: null` input -
01-27's change is invisible to those five tests. And revokeProxyToken (hive.ts:729-734) deletes
from the map before calling the revoke hook, so it is idempotent and a token-exact variant still
records exactly one entry.

The risk is that **neither plan knows this.** Add engine-parity.test.cjs:405-520 to 01-27's
`<interfaces>` and :243-287 to 01-26's, each with the reason it survives, and add the file to both
plans' `<verify>` command. If either turns red at execution time there is no owner to fix it.

## WARNING-7 - 01-31 Task 3 copies line anchors into REQUIREMENTS.md that 01-26 has just shifted

**Plan:** 01-31, Task 3. It instructs: restate FLOOR-04's ceiling naming *"the two size escapes at
src/main/hive.ts:3196-3226"*. 01-26 (w1) inserts into hive.ts at :402-417 and :1285-1339 - both
above :3196 - so those anchors are stale by the time 01-31 runs in w4. This contradicts Task 1 of
the same plan, whose thesis is *"Prefer the symbol to the number ... a line number is a claim that
expires on the next edit."* Rewrite Task 3 to name SECRET_SCAN_MAX_LINES / SECRET_SCAN_MAX_BYTES
and drop the range.

## WARNING-8 - 01-30's prescribed sweep is a half-grep against a whole-suite success criterion

**Plan:** 01-30, Task 1. Success criterion: *"No test in the suite reports a pass for a platform it
did not run on."* Prescribed method: `grep -rn "platform === 'win32'" test/*.test.cjs`. That
pattern cannot see the inverse polarity (`platform !== 'win32'`), which occurs at four sites
including transcript-project-dir.test.cjs:122. A criterion about *the suite* cannot be discharged
by a grep that reads half of it. I ran both polarities (18 hits, section 5) and **the "exactly 2
instances" claim is correct** - so the executor should record that sweep rather than re-derive with
the half-grep. Fix the command to also match the `!==` form and require the enumeration in the
SUMMARY.

## WARNING-9 - b/CR-03 is the one Critical with no owner and no register entry

**Plans:** 01-28 (declines it), 01-31 (does not list it). `rosterMirror.queues = initialQueues`
(store.ts:600) re-delivering pre-migration messages after a Change Home. 01-28 declines it in prose
while **owning store.ts**, and it appears in neither deferred-items.md nor 01-31's "Out of scope -
operator-blocked" list, whose stated purpose is to name residuals once so nothing is mistaken for
closed. Scoping it out is defensible; losing it is not. Add it with an owner.

## WARNING-10 - 01-28 will write two source comments whose anchors an earlier-in-wave plan has already moved

**Plan:** 01-28, Task 2. Its `<interfaces>` is derived at 47a48cd and it is instructed to write
these anchors into useHive.ts comments: `src/main/index.ts:533-536` and `src/main/delivery.ts:518`
/ `:684-688`.

- delivery.ts is edited by **01-27, same wave, earlier plan-id** - 01-27 Task 2 adds branches to
  loadQueue at :371-384, shifting :518, :643-673 and :684-688 downward before 01-28 runs.
- index.ts is edited by **01-25 in w2** - insertions at :379 and :543 shift :533-536.

So 01-28 writes freshly-stale anchors into source, in the phase whose ROADMAP criterion 1 is about
docs pointing at code that does not run, and whose last plan exists to fix exactly this defect -
but 01-31's anchor sweep is scoped to HIVE.md and docs/adr/*.md only, so nothing catches source
comments. Instruct 01-28 to name symbols (quiesce(), drainQueue, setStatus's wiring in index.ts)
instead of line numbers, per the phase's own conclusion.

## WARNING-11 - 01-28's "check every other caller" names 2 of 6, with both anchors off

**Plan:** 01-28, Task 1.

> "Check every other caller of enqueueMessage ... useHive.ts:891 (Slack ingress) and useHive.ts:~915
> (the non-Claude enqueue) both call it."

Actual call sites in useHive.ts: **:668, :672, :895, :914, :972, :1033 - six**, plus three
destructures. The two named anchors are off by 4 and 1. Not a compile risk (verified: no type-aware
linting, no no-floating-promises, and TS does not error on a discarded return), and all six live in
a file 01-28 owns - so this is an audit-completeness defect, not a break. Replace the two anchors
with "all six call sites; enumerate them in the SUMMARY."

---

## INFO

1. **test/proc-kill.test.cjs:29** - a third platform-honesty shape neither 01-30 nor 01-31 names: a
   module-level `process.exit(0)` on win32 after two real assertions. It reports no false pass (so
   it does not violate 01-30's criterion), but it **de-registers** every test below line 40 on
   win32 - those appear as neither a pass nor a skip. 01-30's "re-derive the whole-suite figure and
   publish the arithmetic" should note the file, or the arithmetic will not reconcile.
2. **01-23-SUMMARY.md** keeps its `# skipped 4` pin forever - 01-30 names it as now-wrong, 01-31
   updates only 01-VALIDATION.md, nobody owns the SUMMARY. Defensible (a SUMMARY is a point-in-time
   record) but it should be said out loud in 01-31's SUMMARY rather than left ambiguous.
3. **test/net-binding.test.cjs:401-436 asserts on HIVE.md** (four negative patterns plus a positive
   `/per-spawn/` whole-file match). 01-31 (w4) edits HIVE.md; net-binding.test.cjs is owned by
   01-24 (w1, frozen by then) and 01-31's `<verify>` runs only repo-claims and ci-config. The four
   anchor corrections are in the drain sections and will not trip it - but 01-31 should run
   net-binding.test.cjs too. Note that this same test's comment already encodes the set's ordering
   discipline: *"a test that stays red until someone else's work lands turns a parallel wave into a
   deadlock."*

---

## What the set got right

Recorded because a red-team report that lists only defects is not a measurement.

- Zero declared collisions across 36 files, and zero frontmatter/task-`<files>` drift in eight plans.
- The wave graph is acyclic, correctly computed, and every *declared* dependency is load-bearing.
- Every test file has exactly one owner; the shared repo-claims.test.cjs accumulator is claimed by
  the last plan and by nobody else.
- The `# skipped 4 -> 6` arithmetic is correct, verified independently against all four existing
  `{ skip: !POSIX }` sites.
- 15 of 16 review Criticals and all six VERIFICATION gaps are owned or explicitly assigned to the
  operator.
- The one handoff that could have broken quietly - 01-30 editing SECURITY.md, which
  test/ci-config.test.cjs:258-291 pins - is correctly contained: **01-30 owns both files and its
  Task 3 `<verify>` runs the pinning test.** That is what the other handoffs should look like.
