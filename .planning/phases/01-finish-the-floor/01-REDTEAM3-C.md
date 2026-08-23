# Red-team round 3 — Lens C: ownership, ordering, coverage, goal-backward fitness

**Target:** `01-24-PLAN.md` … `01-31-PLAN.md` · **HEAD** `bd74777` · branch `gsd/v1.0-milestone`
**Execution model:** `use_worktrees: false`, `parallelization: true` (`.planning/config.json:31`)
**Round-2 input:** `01-REDTEAM2-C.md` (3 BLOCKER / 7 WARNING / 1 INFO)
**Round-3 revisions audited:** `95abc90` (orchestrator) · `6a70e05` (01-26) · `994e036` (01-28/29/30/31) · `bd74777` (01-24/01-25)

---

## VERDICT: **NOT CLEAN**

**1 BLOCKER · 9 WARNING · 2 INFO.**

Round 2's three blockers are **all genuinely closed**. Every mechanical dimension the prompt asked me
to re-derive from scratch — the ownership map, body-only writes, the wave graph, same-wave symbol
breakage, the 16-Critical map, the six-gap map, the two 01-30 to 01-31 handoffs — **passes**, and the
`hooks.ts` split introduced in round 3 is real and disjoint.

The one blocker is the **same defect class as round-2's B3, re-instantiated by round 3 itself**: the
two residuals the orchestrator explicitly escalated and accepted (`quiesce`'s `this.quiesced`
suppression, and `quiesce`'s durable `setStatus?.(id,'idle')`) appear in **no plan and no register**,
and the new SUMMARY sweep **cannot reach them** because no plan is instructed to write them into a
SUMMARY. Round 3 fixed the register's *mechanism* and then dropped two items outside the mechanism's
reach in the same commit set.

---

## Per-plan table

| Plan | Wave (decl = computed) | `depends_on` | Files decl | Body-only writes | Shared paths | Blockers | Warnings |
|---|---|---|---|---|---|---|---|
| 01-24 | 1 = 1 | `[]` OK | 2 | none | `src/main/hooks.ts` (01-25, declared both sides) | — | W2 |
| 01-25 | 2 = 2 | `["01-24"]` OK | **8** (was 7) | none | `src/main/hooks.ts` (01-24, declared both sides) | — | W2, W4, W7 |
| 01-26 | 1 = 1 | `[]` OK | 4 | none | — | — | W9 (co-cause) |
| 01-27 | 1 = 1 | `[]` OK | 4 | none | `delivery.ts`, `delivery-main.test.cjs` (01-28) | — | — |
| 01-28 | 2 = 2 | `["01-27"]` OK | 7 | none | same two (01-27) | **B3C-1** | — |
| 01-29 | 3 = 3 | `["01-25"]` OK | 6 | none | — | — | W7 |
| 01-30 | 2 = 2 | `["01-24","01-26"]` OK | 6 | none | — | — | **W3** |
| 01-31 | 4 = 4 | all seven OK | 8 | none | — | **B3C-1** (register owner) | W1, W5, W6, W7, W8, W9 |

Sequential execution order: `01-24 -> 01-26 -> 01-27 -> 01-25 -> 01-28 -> 01-30 -> 01-29 -> 01-31`.

---

## 1. File ownership — re-derived from scratch. **The number changed, as predicted.**

Parsed `files_modified` authoritatively from all eight frontmatters:

```
total declared: 45   unique: 42   SHARED: 3      (round 2: 44 / 42 / 2)
  src/main/hooks.ts            <- 01-24, 01-25   <-- NEW in round 3
  src/main/delivery.ts         <- 01-27, 01-28
  test/delivery-main.test.cjs  <- 01-27, 01-28
per plan: 24:2  25:8  26:4  27:4  28:7  29:6  30:6  31:8
```

`01-25` went 7 to 8 by taking `src/main/hooks.ts`. **Those three are the only overlaps** — no fourth
collision exists anywhere in the set.

**Body-only writes: NONE.** Every path in all 23 task `<files>` blocks appears in that plan's
`files_modified`, and every declared path is claimed by at least one task. Checked mechanically, both
directions, all eight plans. Zero orphans, zero foreign writes.

### The new `hooks.ts` split — **REAL, DISJOINT, DECLARED ON BOTH SIDES**

| Side | Location | Text |
|---|---|---|
| 01-24 | `01-24-PLAN.md:16-18` | *"this plan owns everything in the file. 01-25 (wave 2, depends_on 01-24) adds ONE statement — the `SPAWN_SAFE_SESSION_ID` guard immediately above the existing `this.hive.recordSession(agentId, p.session_id)` call — and touches nothing else."* |
| 01-25 | `01-25-PLAN.md:22-24` | *"01-24 (wave 1) owns the whole file. This plan … adds EXACTLY ONE statement … plus the one import it needs. … If 01-24's landed shape makes that statement unplaceable, STOP and report rather than restructuring 01-24's work."* |

- Regions are genuinely disjoint: 01-24 owns `denyReason` / `realResolve` / `listenOn`'s connection
  handler; 01-25 owns one guard above `hooks.ts:565` plus one import.
- `depends_on: ["01-24"]` on 01-25 serializes them (w1 to w2). Under `use_worktrees: false` they never
  hold the file concurrently.
- The no-cycle claim is **true at source**: `src/main/transcript.ts:1-4` imports only `node:fs`,
  `node:os`, `node:path` and `./pricing`; `src/main/pricing.ts` has **zero** imports. Adding
  `import { SPAWN_SAFE_SESSION_ID } from './transcript'` to `hooks.ts` creates no cycle.
- **The one asymmetry is W2** (below): 01-24's half says *"touches nothing else"*, 01-25's says
  *"plus the one import"*.

---

## 2. The five round-3 changes the prompt named — verified one by one

### 2a. `HookServer.agentForToken` — **FULLY DELETED. Nothing else references it.**

`grep -n agentForToken` across all eight plans returns **6 lines, none of them a build instruction**:
`01-24:14` (revision_reason), `01-24:161`, `:737-738`, `:754` (four separate "deleted, do not re-add"
statements) and `01-25:376` (the original prohibition). Confirmed gone from 01-24's frontmatter:
`key_links` is now 3 entries (`vouchedBases(`, `realpathSync\.native`, `conn\.on\('timeout'`), no
`contains_alt` for an accessor, no T-P24-08 row, no success criterion. `01-24-PLAN.md:754` even turns
the deletion into a done-gate: `grep -c 'agentForToken' src/main/hooks.ts` is 0. **Round-2 B1 is
closed with belt and braces.**

### 2b. `hive.recordSession` — **01-25 TAKES it. Not double-owned. Register row is stale (W1).**

01-25 task 3 sink 4 (`01-25-PLAN.md:651-660`) adds the guard above `hooks.ts:565`, with a behaviour
case at `:608` including its negative control. `must_haves.artifacts` gates `src/main/hooks.ts` on
`contains: "SPAWN_SAFE_SESSION_ID"`, and `key_links[4]` points `src/main/hooks.ts` to
`SPAWN_SAFE_SESSION_ID`. No other plan claims it. **No duplicate fix.**

**But** 01-31's seed register item 9 (`01-31-PLAN.md:570-579`, written by a different round-3 agent in
`994e036`) still asserts the pre-revision fact: *"01-25 … files the stored-state half against 'files
owned by 01-24 and 01-26'"*. See **W1**.

### 2c. 01-31 task 3's SUMMARY sweep — **the mechanism is right; its reach is not closed. See B3C-1.**

`01-31-PLAN.md:459-483` is a four-step sweep with a pasted audit trail, seeded rather than fixed, with
an explicit rule *"neither is a plan that has already landed. 01-24 and 01-26 are wave 1 and this plan
is wave 4, so nothing may be filed against them from here"*. It `@`-loads exactly seven SUMMARYs
(`:93-99`). **That is the correct shape and it closes round-2 B3's three named instances.**

**The already-landed rule is respected by every plan that files something:**

| Filer | Filed item | Target | Direction | OK |
|---|---|---|---|---|
| 01-24 (w1) | `win-cmd-shim.test.cjs:167` second laundered instance | plan 01-30 (w2) | forward | yes |
| 01-26 (w1) | `knowledgeLine` prompt string | 01-31 (w4), via SUMMARY | forward | yes (but W9) |
| 01-27 (w1) | quiesce backstop status filter | 01-28 (w2) | forward | yes |
| 01-30 (w2) | proc-kill 5 cases, engine-parity byte drive | 01-31 (w4), by name | forward | yes |
| 01-25 (w2) | `hive.recordSession` internal guard | unowned residual, to the sweep | n/a | yes (but W4) |
| 01-31 (w4) | item 5 net-binding anchor | "a follow-up plan holding `test/net-binding.test.cjs`" | re-homed | **round-2 W4b FIXED** |

**Its reach, however, is bounded by what each plan's SUMMARY is instructed to record** — and two
accepted residuals are instructed nowhere. **B3C-1.**

### 2d. 01-30 to 01-31 handoffs — **BOTH RECEIVED.**

| Item | Handed at | Received at | Owner named | Not-the-operator |
|---|---|---|---|---|
| `test/proc-kill.test.cjs` five TAP-invisible cases | `01-30:326-345`, and in `<done>` `:409` | `01-31:552-563` register item 7 | *"a follow-up plan holding `test/proc-kill.test.cjs` AND `test/repo-claims.test.cjs` — the two halves cannot be done separately"* | stated explicitly |
| `test/engine-parity.test.cjs` byte-level drive for the other five shims | `01-30:396-403`, and in `<done>` `:409` | `01-31:564-569` register item 8 | *"a follow-up plan holding `test/engine-parity.test.cjs`"* | stated explicitly |

01-30's `<done>` gate makes the handoff mechanically checkable: *"`test/proc-kill.test.cjs` and
`test/engine-parity.test.cjs` are BOTH written into the SUMMARY under the heading plan 01-31's task-3
sweep reads, each with an owner that is a follow-up plan and not the operator."* **Round-2 B3
instances 1 and 2 are closed properly.**

### 2e. Round-2 W1 (symbol-not-line in 01-24) — **FIXED and rode along as recommended.**

`01-24-PLAN.md:231-234`: *"**do NOT copy those two numbers into the source.** Plan 01-26 edits
`hive.ts` later in the SAME wave … citation with the SYMBOL names, which is the only spelling that
survives 01-26."* `:555` repeats it for `AGENT_DENY_RULES`.

---

## 3. Wave ordering — **re-derived. CLEAN, acyclic, declared = computed.**

```
01-24  decl 1  deps []                          computed 1   OK
01-26  decl 1  deps []                          computed 1   OK
01-27  decl 1  deps []                          computed 1   OK
01-25  decl 2  deps [01-24]                     computed 2   OK   <- hooks.ts take did not move it
01-28  decl 2  deps [01-27]                     computed 2   OK
01-30  decl 2  deps [01-24, 01-26]              computed 2   OK
01-29  decl 3  deps [01-25]                     computed 3   OK
01-31  decl 4  deps [24,25,26,27,28,29,30]      computed 4   OK
```

Graph is acyclic (wave strictly increases along every edge); every `depends_on` target exists; no
forward references. **01-25 taking `hooks.ts` did NOT change the graph** — the `["01-24"]` edge that
round 2 called a fossil (W3) is now load-bearing again, which is exactly the right outcome.

Producer-before-consumer, re-verified at source:

| Handoff | Producer | Consumer | OK |
|---|---|---|---|
| `loadQueue` then the `synthesized` emit (`delivery.ts`) | 01-27 (w1) | 01-28 (w2) | yes |
| `hooks.ts` whole file then one guard statement | 01-24 (w1) | 01-25 (w2) | yes |
| `MIN_WIN`=960 / `DESIGN.md` then the equality pin | 01-25 (w2) | 01-29 (w3) | yes |
| `MIN_WIN` / `DESIGN.md` then the 1280-absence pin | 01-25 (w2) | 01-31 (w4) | yes |
| `hive.ts:1455` rename then the retired-name `<done>` file-set gate | 01-26 (w1) | 01-31 (w4) | yes |
| skip conversions then the frozen ceiling in VALIDATION | 01-24 (w1), 01-30 (w2) | 01-31 (w4) | yes |
| all test additions then the authoritative TAP figure | 01-24..01-30 | 01-31 (w4) | yes |
| **`hooks.ts` / `transcript.ts` then 01-30's two test files** | **01-25 (w2)** | **01-30 (w2)** | **undeclared, W3** |

---

## 4. Same-wave shared-symbol breakage — **NONE FOUND. Verified at source, not from plan prose.**

**Wave 1** (`hooks.ts` · `hive.ts` · `breaker.ts`+`delivery.ts`): `src/main/hooks.ts:71-79` imports
`hive`, `config`, `control`, `breaker`, `telemetry` **type-only**; 01-26 changes `redactSecrets`
bodies and `startProxyBridge`'s exit handler — no exported signature moves. 01-27's `softTrip` is
function-local in `levelFor`. `test/hive-durability.test.cjs` loads only `hive.ts`. **No compile
coupling.**

**Wave 2** — the one new hazard, and it is benign at source. `test/hook-auth-roundtrip.test.cjs:37-38`
loads **both** `hive.ts` *and* `hooks.ts`; `test/transcript-project-dir.test.cjs:19` loads
`transcript.ts`. Both test files are 01-30's; both modules gain a wave-2 co-editor in 01-25. Measured
every `session_id` literal that reaches a `HookServer` under test — `net-binding:165` `'s1'`,
`net-binding:204` `'s-forged'`, `hive-hook-node:83` `'s1'`, `hive-roster-injection:53` `'s1'`,
`engine-parity:151` `'proxy-session-1'` — **all five satisfy**
`/^(?![-_])[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/`, so 01-25's sink-4 guard reddens nothing. The exposure
is ordering-model-only: **W3**.

**Waves 3 and 4** are single-plan.

---

## 5. Goal-backward fitness

### The 16 Criticals — **16/16 still owned. Nothing dropped, nothing double-claimed.**

Re-derived by grepping each ID across the eight plans:

| ID | Owner(s) | Note |
|---|---|---|
| a/CR-01 | **01-25** | 01-24's hit is the deletion rationale quoting it, not a claim |
| a/CR-02 | 01-26 | |
| a/CR-03 | 01-24 | |
| a/CR-04, a/CR-05 | 01-27 | |
| a/CR-06 | 01-25 | |
| a/CR-07 | **01-25 (now both halves)** | argv sinks 1-3 plus stored-state sink 4 |
| b/CR-01, b/CR-02, b/CR-03 | 01-28 | 01-31's b/CR-03 hit is register item 6 recording it CLOSED |
| b/CR-04, b/CR-06 | 01-29 | |
| b/CR-05 | 01-25 (MIN_WIN + DESIGN.md) + 01-29 (`splitterReachableMax` pin) | complementary, declared |
| c/CR-01 | 01-24 (net-binding) + 01-30 (win-cmd-shim) + 01-31 (VALIDATION ceiling) | three disjoint instances |
| c/CR-02, c/CR-03 | 01-30 | |

### The six 01-VERIFICATION.md gaps — **3 closable; the other 3 correctly operator-owned and registered**

| Gap | Status | Owner | Change vs round 2 |
|---|---|---|---|
| Two security controls do not hold | **CLOSABLE** | 01-24 (a/CR-03) + 01-25 (a/CR-01) | unchanged |
| A shipped feature is unreachable (1280 vs 1024) | **CLOSABLE** | 01-25 + 01-29 + 01-31 | unchanged |
| The suite figure is inflated | **CLOSABLE**, and proc-kill's five extra silent non-runs are now **registered** (item 7) | 01-24 + 01-30 + 01-31 | **round-2 B3 instance 1 closed** |
| Zero issues closed (PR #77) | not closable | operator, register item 10 | unchanged |
| The two mandatory live gates never ran | not closable | operator, register items 11 and 12 | unchanged |
| `nyquist_compliant: false` / `status: draft` | correctly stays | 01-31 forbids flipping both (`:456-458`) | unchanged |

**Requirement coverage note.** The eight plans declare 13 of the phase's 23 ROADMAP requirement IDs
(FLOOR-01/02/04/06/07/09/10/13/14/16/17, GATE-01, RECORD-03). This is **not** a gap: all eight carry
`gap_closure: true` and layer on plans 01-01 through 01-23, which hold the other ten. Coverage is
correctly evaluated against the six verification gaps and sixteen review Criticals, both re-derived
above.

### Cross-plan pins re-measured live at HEAD (not taken from plan prose)

| Pin | Measurement | Verdict |
|---|---|---|
| 01-31's `shippedTextFiles()` corpus | 312 files pre-exclusion / **310** post — plan asserts `> 200` and cites 312 | agrees |
| 01-31's `.md`/`.html` slice | **42** post-exclusion (43 pre, minus `floor-inspection.html`) — plan cites 43 | agrees |
| 01-31's 1280 cross-check over that slice | exactly **2** hits, `DESIGN.md:169` and `:677`, **both owned by 01-25 (w2), both inside its stated scope** | closable |
| 01-31's retired-name `<done>` file-set gate | `Enterprise Knowledge Graph` at 7 shipped sites: `config.ts` x3 + `store/config.ts` x2 + `SKILL.md` x1 (**01-31**) and `hive.ts:1455` (**01-26**, w1, `depends_on` declared) | every site owned; gate satisfiable |

---

## BLOCKER

### B3C-1 — the two residuals the orchestrator deliberately ACCEPTED are recorded in no register, and the new sweep cannot reach them

**Dimension:** requirement coverage / residual ownership · **Plans:** 01-28 (source), 01-31 (register)
· **Severity: BLOCKER**

Both were raised as round-2 lens-B findings (`01-REDTEAM2-B.md:328` and `:334`) and both were
escalated and accepted rather than fixed, because fixing either reverses a negative control 01-28
states in writing. **Acceptance without a register row is indistinguishable from a silent drop.**

**Both are real at source, re-measured this session:**

```
src/main/delivery.ts:667   if (!quiet) { this.quiesced.delete(a.agentId); continue; }
src/main/delivery.ts:668   if (this.quiesced.has(a.agentId)) continue;   // already announced this spell
src/main/delivery.ts:669   this.quiesced.add(a.agentId);
src/main/delivery.ts:670   this.deps.setStatus?.(a.agentId, 'idle');
```

**(a) Unrecoverable false-`blocked`.** After 01-28's guard, a synthesized Stop no longer clears a
`blocked` agent. If the false block lands *after* the agent's last real Stop — `usePtyParser.ts:31-37`
`BLOCK_HINTS` matches `(y/n)` on the terminal tail, and the statusLine shim writes to stdout *after*
the hook Stop — there is no next real Stop, `:668` suppresses every repeat inside the spell, and
`:667` only resets the spell on new output that would itself have to be followed by a real Stop. The
agent stays `blocked` until respawn, and `useHive.ts:533` — the only `breakerLevel` clear — never
runs.

**(b) Durable status divergence.** `:670` runs unconditionally and 01-28 explicitly preserves it
(`01-28-PLAN.md:437-438`, *"the durable `setStatus` half and the once-per-spell arming are
untouched"*, framed as a **negative control**). After the fix, main's hive log records `idle` for an
agent the floor paints `blocked` with a red `!`.

**Measured absence — every register and every plan:**

```
grep -rn  "quiesced"                                01-24..01-31-PLAN.md  -> 0
grep -rniE "last real stop|unrecover|never recovers" 01-24..01-31-PLAN.md -> 2 hits, neither about this
01-31 residual register, items 1-14                                       -> no quiesce row, no status-divergence row
```

01-28's only residual paragraph (`:477-479`) is a **third, different** item — *"Main still EMITS for a
blocked agent and the renderer drops it"* — and it names no owner either. Its STRIDE row T-P28-06
disposes that same item `accept + document`. Neither (a) nor (b) appears in it.

**Why the sweep cannot rescue this.** 01-31 task 3 sweeps *"the seven SUMMARYs this plan `@`-loads"*.
The sweep's reach is exactly the union of what each plan is **instructed to write** into its SUMMARY.
01-28 is instructed to record: the delta TAP counters, the re-derived `quiesce` line numbers, the two
`MEASUREMENT UNAVAILABLE` operator items, and the behavioural/structural split. It is instructed to
record **neither (a) nor (b)**. They are outside the mechanism by construction.

**Consequence, verifiable from the plans as written:**

1. 01-31 `must_haves.truths[5]` — *"Every code residual this gap-closure set does not fix has a named
   owner in one register"* — is **FALSE as planned**, for the second round running.
2. 01-28 `must_haves.truths[3]` was softened in `994e036` from *"still recovers and still receives
   mail"* to *"still recovers its status on its next real turn-end"*. That new wording is true in the
   four cases 01-28 tests and silently assumes a next real turn-end exists. Engineering a truth
   sentence around a known unrecoverable state without naming it is the "narrated away" shape the
   standing mandate forbids — inside the plan set built to remove exactly that.
3. This set ships a **new** unrecoverable agent state and a **new** durable status divergence, both
   deliberate, both undocumented in any artifact a reader can check.

**Fix — one of:**

- Add both to 01-31's seed register with owners, e.g. *"Owner: a follow-up plan holding
  `src/main/delivery.ts`, `src/renderer/src/hooks/useHive.ts` and `src/main/index.ts` — a main-side
  blocked-status source closes both at once. NOT the operator."*; **or**
- Add one sentence to 01-28's `<verification>`: *"Record in the SUMMARY, under the heading plan
  01-31's task-3 sweep reads: (a) a false `blocked` that lands after the last real Stop is now
  unrecoverable, because `delivery.ts:668`'s `this.quiesced` suppresses the repeat; (b) `:670`'s
  durable `setStatus?.(id,'idle')` still writes `idle` for an agent the floor paints `blocked`. Both
  accepted deliberately; neither is fixed here."*

The second is the durable fix, costs one sentence, and routes through the mechanism round 3 just
built.

---

## WARNINGS

### W1 — 01-31 register item 9 is stale against revised 01-25, and its two-branch disposition matches neither outcome

`01-31-PLAN.md:570-579` still asserts 01-25 **revision 1**'s behaviour: *"01-25 … files the
stored-state half against 'files owned by 01-24 and 01-26' — both wave 1, both already landed"*.
Revision 2 (`bd74777`) **takes** it: sink 4, `01-25-PLAN.md:651-660`.

The row's escape hatch is binary — *"if it files this residual here, keep this row … if it validated
at `recordSession` after all, delete the row"* — and the landed reality is **neither**: 01-25
validates at the **`hooks.ts` call site**, and files two *different, smaller* residuals (the
`hive.recordSession` internal guard; a pre-existing poisoned `registry.json` id whose `--resume` now
fails forever, `01-25:678-690`).

Mitigated by sweep step 3 (*"If a seeded row is not corroborated by any SUMMARY, re-verify it at
source before restating it"*) and by task 3 naming `recordSession` among the three seeds — so the
correct rows will be built. But the seed states a false fact about a sibling plan and offers an
ambiguous disposition. **Fix:** rewrite item 9's first sentence against 01-25 revision 2, and make its
third branch explicit — *"01-25 guards at the call site; carry forward the two residuals its SUMMARY
files, not this one."*

### W2 — the `hooks.ts` split is declared asymmetrically, and 01-24 mandates a SUMMARY sentence that will be false

01-24's half says 01-25 *"adds ONE statement … **and touches nothing else**"*. 01-25's half says
*"EXACTLY ONE statement … **plus the one import it needs**"*. 01-25 unambiguously adds
`import { SPAWN_SAFE_SESSION_ID } from './transcript'` (`01-25:659`). Worse, `01-24-PLAN.md:808-809`
puts the wrong version into a mandated SUMMARY assertion: *"The SUMMARY records that
`src/main/hooks.ts` is shared with plan 01-25 (wave 2), **which adds exactly one statement to it**"*.

Harmless to execution (01-24 lands first; 01-25's executor follows 01-25's split, which is the
accurate one), but it mandates writing a false claim into a durable artifact. **Fix:** append *"plus
the one import it needs"* to `01-24:18` and `01-24:809`. Two words.

### W3 — 01-30 is a wave-2 consumer of two modules 01-25 edits in the same wave, and declares neither

Verified at source: `test/hook-auth-roundtrip.test.cjs:37-38` loads `src/main/hive.ts` **and
`src/main/hooks.ts`**; `test/transcript-project-dir.test.cjs:19` loads `src/main/transcript.ts`. Both
test files are 01-30's. `hooks.ts` and `transcript.ts` are both 01-25's — **wave 2, same wave as
01-30**. `01-30-PLAN.md` contains **zero** references to 01-25 (`grep -c "01-25"` is 0);
`depends_on: ["01-24","01-26"]` names only the two wave-1 owners.

Safe under strictly sequential in-wave ordering (01-25 has the lower plan id and runs first), and I
measured that every `session_id` literal reaching a `HookServer` under test satisfies 01-25's new
regex, so nothing reddens. But `.planning/config.json` sets `parallelization: true`, and the plans
nowhere state that in-wave order is sequential. This is round-2 W4 in a new place, created by round 3.
**Fix:** `depends_on: ["01-24","01-25","01-26"]` on 01-30 — zero cost under sequential execution — or
one coordination sentence.

### W4 — 01-25 declines the `recordSession` internal guard on a justification its own `hooks.ts` handling proves false

`01-25-PLAN.md:683-685`: *"`hive.ts` is plan 01-26's file in this wave and **a second editor under
`use_worktrees: false` is a lost update**."* 01-26 is **wave 1**; 01-25 is wave 2; under
`use_worktrees: false` 01-26 has already landed, so there is no concurrency and no lost update —
which is precisely the reasoning 01-25 uses, correctly, three paragraphs earlier to justify its
`hooks.ts` guest edit against wave-1 01-24. The same plan applies two contradictory models of the same
execution mode. The declined work is genuine defence in depth (one `SPAWN_SAFE_SESSION_ID.test()` at
`hive.ts:1143`) and it does reach the sweep — but the stated reason is wrong. **Fix:** either add a
second `shares_files_with` entry for `src/main/hive.ts` and close it, or replace the justification
with the honest one (scope, not concurrency).

### W5 — the residual register has no `<done>` predicate, no artifact gate, and no named destination

The sweep is mandated in `<action>` (`:459-483`), in `<verification>` (`:645`) and in
`<success_criteria>` (`:662-663`) — but **not in `<done>`**, whose four predicates are all about
`REQUIREMENTS.md` / `01-VALIDATION.md` greps and `nyquist_compliant` byte-identity. There is no
`must_haves.artifacts` entry for the register, and the only write instruction is *"Copy the finished
register into the SUMMARY's residual list **too**"* — a dangling "too" with no primary destination
named. Net: the artifact carrying every unfixed residual's owner — the thing round-2 B3 demanded — is
invisible to every machine-checkable gate in the plan and is verifiable only by a human reading
`01-31-SUMMARY.md`. **Fix:** one `<done>` line — *"the register names N rows and the pasted sweep
trail names all seven SUMMARYs, each with the lines it contributed"* — and delete "too".

### W6 — 01-31's mandatory context load is ~750 KB before task 1 begins

Measured this session:

```
PROJECT 13.7K · ROADMAP 44.6K · STATE 107.1K · REQUIREMENTS 49.8K · VERIFICATION 34.3K
REVIEW-c 44.2K · GAP-CHECK 26.3K · deferred-items 23.8K · HIVE.md 18.8K · repo-claims.test.cjs 48.0K
                                                                      = 410.6 KB
+ seven SUMMARYs (peers run 28-60 KB; 01-23-SUMMARY is 60 KB)         ~ 294   KB
+ the plan itself                                                       47.0 KB
                                                                      ~ 750   KB  ~ 190K tokens
```

The sweep — round 3's entire B3 remediation — is the **last** step of the **most context-starved plan
in the set**. On a 200K-context executor this crosses the blocker threshold outright; on a
1M-context executor it is ~19% and merely a quality risk. **Fix:** drop `STATE.md` (107 KB, the
largest, and nothing in the three tasks reads it) or split task 3's register sweep into its own plan.

### W7 — five declared files still carry no `must_haves.artifacts` gate (round-2 W5, unresolved)

| Plan | Ungated file | Indirect cover |
|---|---|---|
| 01-25 | `test/runtime-forget.test.cjs` | done-gate greps only |
| 01-29 | `test/renderer-components.test.cjs` | done-gate greps only |
| 01-31 | `src/main/config.ts`, `src/renderer/src/store/config.ts`, `resources/skills/capabilities/SKILL.md` | the widened repo-claims pin plus the file-set `<done>` gate |

`src/main/index.ts` (01-25) has no artifact entry either but **is** covered by `key_links[3]`
(`pattern: SPAWN_SAFE_SESSION_ID`), so it is gated. The five above are files the phase verifier will
pass on existence alone.

### W8 — register item 14 (SC-1) still files to a role, against the register's own rule (round-2 W6, unresolved)

`01-31-PLAN.md:594-599`: *"a one-line pointer to Phase 2 belongs in the criterion, and that is **the
ROADMAP's owner**, not this plan's."* `.planning/ROADMAP.md` is in no plan's `files_modified`, and
"the ROADMAP's owner" is a role, not an owner — the exact shape the register's own preamble at
`:504-507` forbids. Measurable consequence unchanged: **ROADMAP criterion 1's first sentence stays
untrue on win32 after this set lands**, with no artifact recording who fixes it. **Fix:** an issue
number, or an explicit "the verifier restates this at `/gsd:verify-work` time" clause.

### W9 — `hive.ts:1462` ships a retired-capability claim to every agent; declined by its owner, handed to a plan that cannot edit the file

`src/main/hive.ts:1462` (`knowledgeLine`): *"**Enterprise knowledge: this organisation has a private
Knowledge Graph** of its own documents, policies, and business context…"* — injected into every
agent's system prompt. `01-26-PLAN.md:683-687` declines it (*"Note for the SUMMARY, do not fix"*) and
hands it to 01-31 *"so its tree-wide pin does not discover it late"*. But **`src/main/hive.ts` is not
in 01-31's `files_modified`** — 01-31 cannot fix it, and 01-31's own rule forbids re-filing it at
wave-1 01-26.

Measured: the string does **not** match `/Enterprise Knowledge Graph/i` (my node run over the full
310-file corpus returns 7 hits, none of them `:1462`), so no pin breaks and 01-31's `<done>` file-set
gate stays satisfiable. Its real disposition is an unowned register row reachable only via the sweep
of 01-26's SUMMARY. Low blast radius, but it is the **highest-value instance of FLOOR-07 that
survives this set** — an agent-facing false capability claim, in the phase whose goal is "every claim
the project makes about itself is true". **Fix:** name it in 01-26's SUMMARY instruction as a residual
with a proposed owner, so the sweep produces a row rather than having to invent one.

---

## INFO

- **I1 — 01-25 task 3 is over-packed.** Five files (`transcript.ts`, `index.ts`, `hooks.ts`,
  `DESIGN.md`, `telemetry-auth.test.cjs`) and four independent fixes (the id shape plus four sinks;
  `MIN_WIN` to 960; two `DESIGN.md` statements; the `telemetry.ts` header restatement). Plan-level
  scope is fine (3 tasks / 8 files, inside the 5-8 target); the task-level concentration is the risk.
  Not worth a re-split on its own.
- **I2 — `994e036`'s "No `contains_alt` present" is scoped to the four plans it touched.** 01-27 still
  carries `contains_alt: "ENOENT"` on `src/main/delivery.ts`. Valid schema, and 01-27 was not in that
  commit — noted only so the claim is not read as set-wide.

---

## Round-2 findings — status at `bd74777`

| Round 2 | Status |
|---|---|
| **B1** — 01-24/01-25 contradict over `HookServer.agentForToken` | **RESOLVED.** Accessor, `contains_alt`, `key_links[3]`, T-P24-08, success criterion and `<done>` grep all deleted; four separate "do not re-add" statements; a `grep -c … is 0` done-gate. No plan references it as a build instruction. |
| **B2** — a/CR-07's stored-state half deferred backwards | **RESOLVED.** 01-25 takes it as sink 4, with a declared `shares_files_with` split and a load-bearing `depends_on: ["01-24"]`. |
| **B3** — the residual register is not closed over the set | **RESOLVED for its three named instances** (proc-kill to item 7, engine-parity to item 8, recordSession to 01-25 + item 9) **and for its mechanism** (fixed list to seeded four-step SUMMARY sweep). **Re-instantiated by two new items — B3C-1.** |
| W1 — 01-24 writes freshly stale `hive.ts` line anchors | **RESOLVED.** Symbols mandated at `:231-234` and `:555`. |
| W2 — 01-31's "7 or 8" skip hedge stale | **RESOLVED.** Measurement mandated; TAP wins on disagreement. |
| W3 — 01-25's `depends_on ["01-24"]` vestigial | **RESOLVED.** Load-bearing again via the `hooks.ts` split. |
| W4 — 01-28's undeclared contract with 01-24's `hooks.ts` | **partially resolved** — the same shape now applies to 01-30 consuming 01-25 (**W3** above). |
| W4b — register item 5's unreachable condition | **RESOLVED.** Re-homed to "a follow-up plan holding `test/net-binding.test.cjs`". |
| W5 — five ungated declared files | **NOT resolved** — carried as **W7** (same five). |
| W6 — SC-1 has no owner | **NOT resolved** — carried as **W8**. |
| I1 — 01-31 mis-attributes the skip-title claim | **RESOLVED.** `01-31:439` now reads "(Round 1 also attributes that claim to 01-30; 01-30 makes it nowhere.)" |

---

## Recommendation

**One blocker requires revision before execution, and it is a one-sentence fix.**

1. **01-28 `<verification>`** (preferred) or **01-31's seed register** — give the two accepted quiesce
   residuals a SUMMARY line under the heading the sweep reads, with a named owner (B3C-1).

Three warnings are one- or two-line changes and should ride along: **W2** (append "plus the one import
it needs" to 01-24's split and its SUMMARY clause), **W3** (`depends_on: ["01-24","01-25","01-26"]` on
01-30), **W5** (one `<done>` predicate for the register sweep). **W1** costs one paragraph and should
ride along too, since it states a false fact about a sibling plan.

Everything the prompt asked me to re-derive independently — the **45/42/3** ownership map, zero
body-only writes, the acyclic declared-equals-computed wave graph, the genuinely disjoint and
bilaterally declared `hooks.ts` split, the complete deletion of `agentForToken`, 01-25's clean
single-ownership of `recordSession`, both 01-30-to-01-31 handoffs received with non-operator owners,
16/16 Criticals owned, 3/6 gaps closable, no same-wave symbol breakage, and every cross-plan pin
re-measured live (43/42-file corpus, 2 x 1280 hits both owned by 01-25, 7 retired-name sites all
owned) — **holds**.
