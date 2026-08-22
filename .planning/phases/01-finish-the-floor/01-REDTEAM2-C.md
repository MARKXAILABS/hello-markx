# Red-team round 2 — Lens C: ownership, ordering, coverage, goal-backward fitness

**Target:** `01-24-PLAN.md` … `01-31-PLAN.md` (revised) · **HEAD** `3051a47` · branch `gsd/v1.0-milestone`
**Execution model:** `use_worktrees: false` — sequential, one tree, wave order then plan-id order.
**Round 1 input:** `01-GAP-CHECK.md`, `01-REDTEAM-4-ordering.md` (a217018) · **Revisions audited:** e513c83, 97f6a82, 197c291, 02880cf, 3051a47

---

## VERDICT: **NOT CLEAN**

**3 BLOCKER · 7 WARNING · 1 INFO.**

Round 1's four blockers in this lens are all genuinely resolved. Parallel revision introduced **one
head-on contradiction between two plans** (B1) and left **the residual register non-closed** (B2, B3).
The mechanical dimensions the prompt asked me to re-derive from scratch — file ownership, the wave
graph, the DESIGN.md handoff, the whole-suite authority, the 01-VALIDATION.md skip-title dispute,
and b/CR-03's adoption — **all pass**, and the disputed skip-title fact is adjudicated in 01-31's
favour against the live file.

---

## Per-plan table

| Plan | Wave | Deps (decl = computed) | Files decl | Body-only writes | Shared paths | Blockers | Warnings |
|---|---|---|---|---|---|---|---|
| 01-24 | 1 | `[]` OK | 2 | none OK | — | **B1** | W1 |
| 01-25 | 2 | `[01-24]` OK | 7 | none OK | — | **B2** | W3, W5 |
| 01-26 | 1 | `[]` OK | 4 | none OK | — | — | W1 (co-cause) |
| 01-27 | 1 | `[]` OK | 4 | none OK | `delivery.ts`, `delivery-main.test.cjs` (declared, coordination block present) | — | — |
| 01-28 | 2 | `[01-27]` OK | 7 | none OK | same two (declared, Coordination section present) | — | W4 |
| 01-29 | 3 | `[01-25]` OK | 6 | none OK | — | — | W5 |
| 01-30 | 2 | `[01-24, 01-26]` OK | 6 | none OK | — | **B3** (2 of 3 instances) | — |
| 01-31 | 4 | all seven OK | 8 | none OK | — | **B3** (register owner) | W2, W4b, W5, W6 |

Sequential execution order: `01-24 -> 01-26 -> 01-27 -> 01-25 -> 01-28 -> 01-30 -> 01-29 -> 01-31`.

---

## 1. File ownership — re-derived from scratch. **CLEAN.**

Parsed `files_modified` authoritatively from all eight frontmatters:

```
total declared: 44   unique: 42
SHARED:
  src/main/delivery.ts          <- 01-27, 01-28
  test/delivery-main.test.cjs   <- 01-27, 01-28
per plan: 24:2  25:7  26:4  27:4  28:7  29:6  30:6  31:8
```

**The reviser's "42 paths with 2 shared" is right** (44 declarations over 42 unique paths). **Those two
are the ONLY overlap** — no third collision exists.

Both sides declare the split and it is genuinely disjoint:

- `01-27-PLAN.md:313-326` coordination block — 01-27 owns `loadQueue()` / the arm-after-failed-read
  path and its error string; explicitly forbids restructuring the quiesce emit or delivery-main's
  `harness()` helper.
- `01-28-PLAN.md:96-113` Coordination section — mirror text, plus *"Re-derive both line numbers after
  01-27 lands — 01-27 inserts above them"* and a STOP-and-report clause if 01-27's landed shape blocks
  the edit.
- `depends_on: ["01-27"]` on 01-28 serializes them (w1 to w2). Under `use_worktrees: false` they never
  hold the file concurrently.

**Body-only writes: NONE.** Every path in every task `<files>` element appears in that plan's
`files_modified`, and every declared path is claimed by at least one task. Checked mechanically across
all 23 files-blocks in the set.

Cross-plan foreign-path mentions were enumerated and each inspected; every one is explicitly marked
read-only or handed off by name (01-25:284 "READ-ONLY; 01-24 owns it"; 01-29 "DESIGN.md (READ-ONLY
here — owned by plan 01-25)"; 01-31 "src/main/hive.ts:1455 <- plan 01-26's file. VERIFY, do not edit.").
No plan silently writes another's file.

---

## 2. Cross-plan contradictions from parallel revision

### 2a. DESIGN.md / the 1280 pin — **CLEAN. Both halves landed.**

- `DESIGN.md` appears in **exactly one** `files_modified`: **01-25**.
- 01-31 confirms it does not take it ("DESIGN.md is NOT in this plan's files_modified — 01-25 owns and
  edits it"), and 01-29 marks it READ-ONLY.
- **01-31's pin exists** (`01-31-PLAN.md:345-347`, task 2): over the `/\.(md|html)$/` slice of
  `shippedTextFiles()` (43 files, measured), assert no shipped doc matches
  `/1280\s*[×x]\s*800|minimum:?\s*1280/i`.
- Verified live at HEAD: `DESIGN.md:169` "Main window minimum: 1280 × 800." and `:677` "Min window:
  1280 × 800." — **both match the pin regex**, and both are inside 01-25's stated scope ("the two
  window-minimum statements"). `src/main/index.ts:2516` is `MIN_WIN = { width: 1280, height: 800 }`;
  `sidebarLayout.ts:22` is `SIDEBAR_COLLAPSE_WIDTH = 1024`. The arithmetic holds.
- Ordering: 01-25 (w2) edits, 01-29 (w3) pins equality, 01-31 (w4) pins absence. Producer before both
  consumers. **The gap cannot fall between the plans.**

### 2b. Whole-suite re-derivation — **CLEAN. Exactly one authoritative owner.**

| Plan | Statement | Line |
|---|---|---|
| 01-26 | "report its delta only. The whole-suite re-derivation belongs [to 01-31]" | `:556` |
| 01-28 | "Report the delta this plan adds. Plan 01-31 owns the authoritative whole-suite figure." | `:572` |
| 01-30 | "**Report this plan's skip delta only. Do NOT re-derive the whole-suite figure here.**" | `:508` |
| 01-31 | "**This plan owns the authoritative whole-suite figure**" | `:538` |
| 01-24, 01-25, 01-27, 01-29 | no whole-suite claim at all (grep: 0 hits) | — |

**No contradictory "must be identical" sentence survives.** 01-31 goes further and pre-authorises the
divergence: *"01-30's wave-2 figure is a partial by construction (01-29 and this plan both add tests
after it), so a discrepancy is EXPECTED and must be reconciled arithmetically, not narrated away."*
That is the correct shape.

### 2c. The skip ceiling and the 01-VALIDATION.md dispute — **ADJUDICATED: 01-31 IS CORRECT.**

Measured against the live file this session:

```
grep -c "hook-auth-roundtrip"  01-VALIDATION.md  -> 0
grep -c "hive-hook-node"       01-VALIDATION.md  -> 0
grep -c "hive-runtime-path"    01-VALIDATION.md  -> 0
```

`01-VALIDATION.md:52-55` pins "The frozen skip baseline for this phase is `# skipped 4`" and the
"less-than-or-equal 4, never `>=`" rule — and **names no test by title**. **01-31 is factually right;
round 1's assertion is wrong.** The named list lives in `01-23-SUMMARY.md:181`, which is in no plan's
`files_modified`.

**Ownership of the frozen figure: exactly one plan.** `01-30-PLAN.md:523` — "**Do not edit
01-VALIDATION.md.** … the document change belongs to plan 01-31. Hand it the new figure, the four old
titles and the two new ones." 01-31's `files_modified` carries it and its artifact gate is
`contains: "hook-auth-roundtrip"` — correctly RED at HEAD (0), GREEN only after the titles are written.

**The number:** 01-30 states the win32 delta in advance — baseline **4 to 6** (+1 from 01-24's
net-binding conversion in wave 1, +1 from its own win-cmd-shim; the transcript-project-dir split runs
on win32 and skips on POSIX, so win32 is +0 there). 01-31 refuses to hardcode and mandates the TAP
measurement, with "the measurement wins" on disagreement. **The two agree in substance.** See W2 for
the one stale sentence.

### 2d. b/CR-03 — **GENUINELY TAKEN by 01-28. Not a re-deferral.**

`01-28-PLAN.md` Task 3 (files: `src/renderer/src/store/store.ts`, `test/renderer-queue.test.cjs`) is a
real one-shot: keep the boot seed, and once a `rosterWrite` carrying a non-empty `queues` resolves
ok-and-not-skipped, clear `rosterMirror.queues` and remove the `LS_QUEUES` key so every later write
carries `{}`. Plus **deletion of the dead `persistQueues`** (`:529-544`) with the reasoning stated. Four
behaviour cases including **two named negative controls** (a failed write must not consume the one-shot;
the migration must still work because main cannot read localStorage). Done-gate:
`grep -rn "persistQueues" src/` returns nothing (returned exactly one line at a217018). A ceiling is
stated rather than claimed away (a home whose roster.json was copied before this lands). It is also
recorded as **closed, not deferred** in 01-31's register item 6.

Round 1's WARNING-9 orphan is closed. **15/16 -> 16/16 Criticals owned.**

---

## 3. Goal-backward fitness

### The 16 Criticals — all owned

| ID | Finding | Owner | Real? |
|---|---|---|---|
| a/CR-01 | OTLP collector unauthenticated | 01-25 | yes — token registry + 401 gate, fail-closed |
| a/CR-02 | proxy restart revokes the token it just minted | 01-26 | yes — token-exact identity compare |
| a/CR-03 | PreToolUse relative-path bypass | 01-24 | yes — `vouchedBases()`, absolute-only, empty implies DENY |
| a/CR-04 | budget band masks the floor cost cap | 01-27 | yes — `softTrip` local |
| a/CR-05 | transient read empties the durable queue | 01-27 | yes — ENOENT/other split + `queueReadError` |
| a/CR-06 | hook token writes another agent's accumulator | 01-25 | yes — sessions keyed (agentId, sessionId), id token-derived |
| a/CR-07 | `session_id` reaches argv unvalidated | 01-25 | **partial** — argv half fixed; **stored-state half orphaned, see B2** |
| b/CR-01 | composer wipes the message before main accepts | 01-28 | yes |
| b/CR-02 | quiet agent at a permission prompt reset to idle | 01-28 | yes — `stopArmDecision` + `synthesized` |
| b/CR-03 | roster.json frozen queue slice | 01-28 | yes — round-1 orphan, now closed |
| b/CR-04 | model chip collapse-to-zero | 01-29 | yes |
| b/CR-05 | 1024 collapse unreachable under a 1280 minimum | 01-25 + 01-29 | yes — MIN_WIN to 960 + `splitterReachableMax` |
| b/CR-06 | `isAutoModeAgent` under-reports custom | 01-29 | yes — tokenized preset-flag scan |
| c/CR-01 | win32 non-run laundered as a pass | 01-24 + 01-30 | yes — both instances |
| c/CR-02 | provenance misses the update path | 01-30 | yes — blockmap + latest*.yml in the hashed set, installers tripwire, SECURITY.md scope |
| c/CR-03 | sock_token pin a comment satisfies | 01-30 | yes — comment-stripped assignment pin + 6-way mutation loop |

### The six 01-VERIFICATION.md gaps — **3 closable, same as round 1**

| Gap | Status after this set | Owner |
|---|---|---|
| SC-3 — spend / secrets / identity CONTAINED | **CLOSABLE** | 01-24 + 01-25 + 01-26 |
| SC-4 — legible to the operator | **CLOSABLE** | 01-25 (MIN_WIN) + 01-29 |
| "531 pass is an honest floor" | **CLOSABLE as written** — but proc-kill's five silent non-runs are a newly-surfaced instance of the same defect, declined and unregistered (**B3**) | 01-24 + 01-30 + 01-31 |
| SC-2 — provenance LIVE half | **NOT closable** — `gh attestation verify` needs a published tag. 01-30 correctly prints MEASUREMENT UNAVAILABLE; register item 9. | operator |
| SC-5 — close 20 floor-inspection issues | **NOT closable** — PR #77 unmerged; register item 7. | operator |
| SC-1 — autonomy survives the window | **NOT closable** — needs a ROADMAP restatement no plan owns (**W6**) | unassigned |

---

## 4. Wave ordering — **CLEAN**

Declared waves match computed waves for all eight plans; graph acyclic; every `depends_on` target
exists. Every producer/consumer handoff runs producer-first:

| Handoff | Producer | Consumer | OK |
|---|---|---|---|
| delivery.ts loadQueue then synthesized emit | 01-27 (w1) | 01-28 (w2) | yes |
| MIN_WIN / DESIGN.md 960 then equality pin | 01-25 (w2) | 01-29 (w3) | yes |
| MIN_WIN / DESIGN.md 960 then 1280-absence pin | 01-25 (w2) | 01-31 (w4) | yes |
| hive.ts:1455 rename then EKG corpus pin | 01-26 (w1) | 01-31 (w4) | yes |
| skip conversions then frozen ceiling in VALIDATION | 01-24 (w1), 01-30 (w2) | 01-31 (w4) | yes |
| all test additions then authoritative TAP figure | 01-24..01-30 | 01-31 (w4) | yes |
| **a/CR-07 stored-state residual** | 01-25 (w2) | **01-24, 01-26 (both w1)** | **NO — backwards, B2** |
| **net-binding comment anchor residual** | 01-31 (w4) | **01-24 (w1)** | **NO — backwards, W4b** |

**01-31's seven dependencies are REAL, not needless serialization.** It measures the whole-suite TAP
figure (needs every test-adding plan including 01-29 in w3), re-derives thirteen doc anchors into files
that 01-24 / 01-25 / 01-26 / 01-27 / 01-28 all shift, and owns two pins that are RED until 01-25 and
01-26 land. Every one of the seven is load-bearing.

---

## 5. Same-wave shared-module breakage — **NONE FOUND**

Verified at source, not from plan prose:

- **Wave 1** (hooks.ts / hive.ts / breaker.ts + delivery.ts): `hooks.ts` imports only
  `type CircuitBreaker` from `breaker.ts`; 01-27's `softTrip` is a function-local inside `levelFor`, so
  no exported signature moves. `redactSecrets` is confined to `hive.ts` (grep across `src/` and `test/`
  returns only hive.ts definitions/uses plus one comment in accountPool.ts) — 01-26's regex rewrite
  reaches no other module. **No compile coupling.**
- **Wave 2** (telemetry/pty/index/transcript · renderer + delivery.ts + preload · tests + CI):
  01-28's new `synthesized` key crosses main-to-renderer through
  `DeliveryDeps.emit: (channel: string, payload: unknown) => void` (`delivery.ts:153`) — **untyped, so
  no index.ts widening is needed**, which is why 01-28 correctly does not declare 01-25's file. The
  renderer-facing type is declared inline at `src/preload/index.ts:888-891` — 01-28's own file. The
  second `hive:hookEvent` producer (`hooks.ts:841-849`) omits the key, which is exactly the
  discriminator 01-28 wants. **Sound.**
  01-25 edits `src/main/transcript.ts` while 01-30 edits `test/transcript-project-dir.test.cjs` — but
  01-25 runs first in the wave and already names that suite in its own verify command, so a break is
  caught by its author. 01-30's line anchors into that file are untouched by 01-25.
- **Waves 3 and 4** are single-plan.

---

## BLOCKERS

### B1 — 01-24 and 01-25 contradict each other head-on over HookServer.agentForToken

**Dimension:** cross-plan contradiction / key-link validity · **Plans:** 01-24 Task 3, 01-25 Task 1 ·
**Severity: BLOCKER**

01-24 (revision **2**) builds a public identity lookup and justifies it entirely by naming 01-25 as its
consumer:

- `01-24-PLAN.md:44-47` — must_haves key_link:
  `from: "HookServer.agentForToken"` / `to: "TelemetryCollector (plan 01-25)"`
- `01-24-PLAN.md:428-431` (action) — "**Document in its doc comment WHY it is public: plan 01-25
  authenticates the OTLP collector … and the only acceptable way for it to learn who is calling is to
  derive the answer from THIS registry.**"
- `01-24-PLAN.md:489` (T-P24-08) — "Plan **01-25's tests** pin the fail-closed branch."

01-25 (revision **1**) forbids exactly that:

- `01-25-PLAN.md:334-338` — "Do **NOT** reuse the hook token and do **NOT** inject
  `HookServer.agentForToken`. Round 0 did the latter and the red-team found two independent problems
  with it" — a TDZ/startup-window hazard (collector at `index.ts:379`, HookServer at `:543`;
  REDTEAM-5 R-13) and off-box exfiltration of the **hook** credential through an OTel-spec'd env var
  (REDTEAM-3 H1). 01-25 mints its own registry instead. `grep -c agentForToken 01-25-PLAN.md` is
  **1**, and it is the prohibition.

**Consequences, all three verifiable from the plans as written:**

1. 01-24 ships an **unconsumed public token-to-identity accessor on HookServer** — widening the exact
   trust surface GATE-01 exists to narrow — for a consumer that has, on security grounds, refused it.
2. 01-24 writes into `src/main/hooks.ts` a doc comment that **states a false architectural rationale**
   (one shared registry serving both listeners) which the very next plan overturns. This is the same
   defect as a/CR-01's "transport posture mirrors slack.ts" — a false claim in a security-critical
   header — inside the plan set built to remove it.
3. `must_haves.key_links[3]` declares a wiring that **will never exist**, and T-P24-08's mitigation
   cites tests **01-25 will not write**. A pattern-only check (`agentForToken\(`) passes vacuously in
   hooks.ts; the semantic claim does not.

**Root cause:** parallel revision. 01-25 was revised away from the consumer; 01-24 was revised to
rev 2 without dropping the producer.

**Fix:** 01-25's reasoning is sound (capability separation). Therefore **01-24 should drop Task 3's
agentForToken half entirely** — the accessor, the must_haves artifact `contains_alt`, the
`key_links[3]` entry, T-P24-08, success-criterion `:516`, and the done-gate grep at `:456`. Task 3's
win32 skip conversion (c/CR-01) is independent and stays. If the accessor is kept instead, 01-24 must
name a consumer that exists and must not name 01-25.

---

### B2 — a/CR-07's stored-state half is deferred BACKWARDS in the wave order, to plans with no such task

**Dimension:** wave ordering / residual ownership · **Plans:** 01-25 (filer), 01-24 + 01-26 (named
owners), 01-31 (register) · **Severity: BLOCKER**

`01-25-PLAN.md:685` (T-P25-05), echoed at `:90`, `:185`, `:583`:

> **Residual:** `hooks.ts:565` calls `hive.recordSession` (`hive.ts:1143`), which still STORES and
> git-commits an unvalidated id into registry.json, the hive log and the ledger. It can no longer reach
> argv; it can still poison stored state. **Files owned by 01-24 and 01-26.**

Measured:

```
grep -c "recordSession"                 01-26-PLAN.md -> 0
grep -c "recordSession|hooks.ts:565"    01-31-PLAN.md -> 0
grep -c "session_id|registry.json"      01-31-PLAN.md -> 0
01-24-PLAN.md: one hit, at :201 — describing a TEST STUB's dep shape, not a validation task
```

1. **The named owners run earlier.** 01-24 and 01-26 are wave 1; 01-25 is wave 2. Under
   `use_worktrees: false` the order is `01-24 -> 01-26 -> 01-27 -> 01-25 -> …`. By the time this
   residual is *filed*, both named owners have already landed. Neither plan contains any instruction
   to validate `p.session_id` before `recordSession`.
2. **It is absent from the one register that claims completeness.** 01-31's residual register (items
   1 through 11) has no entry for it.
3. 01-31's must_haves truth 5 — "Every code residual this gap-closure set does not fix has a named
   owner in one register" — is therefore **FALSE as planned**, and this is a Critical's remainder, not
   a cosmetic one: an agent-supplied string reaching registry.json, the hive log and the cost ledger.

**Fix:** either add a one-line SPAWN_SAFE_SESSION_ID (or path-component) guard to 01-24's hooks.ts
scope — it is the same file 01-24 already opens — or add the residual to 01-31's register with a real
owner (a GitHub issue number, or a follow-up plan holding hooks.ts + hive.ts). It may not stay filed
against two already-landed plans.

---

### B3 — the residual register is not closed over the set: three known residuals fall outside it

**Dimension:** requirement coverage / goal-backward fitness · **Plans:** 01-30 (2 instances),
01-31 (register) · **Severity: BLOCKER**

01-31's register is a **fixed 11-item list**. Task 3's action says "See the section below for its
required contents" — there is **no instruction to sweep the seven SUMMARYs it @-loads** for newly-named
next steps. So anything a wave-1/2/3 plan defers into its own SUMMARY never reaches the register. Three
items are currently outside it:

1. **test/proc-kill.test.cjs:29-39.** `01-30-PLAN.md:311` — a module-scope exit means its **five cases
   at :65-103 appear in neither `# pass` nor `# skipped`**. 01-30 explicitly declines ("name it, do not
   convert it") and files it "in the SUMMARY with its arithmetic". This is the **same defect class as
   c/CR-01** — the finding gap 6 ("the published 531 pass figure is an honest floor") exists to close —
   surfacing five more silent non-runs than the two the gap enumerated. Register: absent.
2. **test/engine-parity.test.cjs-shaped byte-level drive for the other five shims.**
   `01-30-PLAN.md:347-351` — the only assertion shape source text cannot satisfy, declined because
   "test/engine-parity.test.cjs has no owner in this gap set", and "Record it in the SUMMARY". This is
   round 1's WARNING-6 unchanged: it asked for an owner and got a SUMMARY line. Register: absent.
3. **hooks.ts:565 to recordSession** — see B2. Register: absent.

**Fix:** either add all three to 01-31's register with real owners, or add an explicit instruction to
01-31 Task 3: "read the seven loaded SUMMARYs; every item any of them names as a next step, a declined
conversion or a residual gets a register row with an owner." The second is the durable fix and costs
one sentence.

---

## WARNINGS

### W1 — 01-24 replaces a stale hive.ts anchor with a freshly stale one; 01-26 shifts it later in the same wave, and no plan sweeps src/

`01-24-PLAN.md:303-304` correctly fixes hooks.ts:419's stale citation, writing **hive.ts:1108** (the
settings write) and **hive.ts:1183** (`permissions: { deny: AGENT_DENY_RULES }`) into a hooks.ts
comment. But 01-24 runs **first** in wave 1 and 01-26 runs **second**, and 01-26 edits hive.ts:401-416
(redactSecrets patterns 3 and 5, including a new value-adjudicating replacement callback) — **above
both anchors**. Any net line insertion there makes both freshly-written numbers wrong before wave 1
ends.

01-31 is the anchor-sweep plan and already carries the right instinct ("Write SYMBOLS; that is the
whole point"), but its sweep corpus is `HIVE.md docs/adr/*.md` only and its success criterion is scoped
to those files. `src/main/hooks.ts` is swept by nobody.

**Fix:** 01-24 should write `hive.ts writeSettingsJson()` / `hive.ts AGENT_DENY_RULES` by symbol
instead of by line, exactly as 01-28 and 01-31 were already told to do.

### W2 — 01-31's "7 or 8" skip-count hedge is stale against revised 01-30

`01-31-PLAN.md:254-256`: "01-30 converts at least one, and 01-30 **may take two more**
(test/proc-kill.test.cjs:29 … and test/transcript-project-dir.test.cjs), which would make it **7 or
8**." Revised 01-30 settles both: transcript-project-dir **is** converted but skips on POSIX (win32
`# skipped` +0), and proc-kill is **explicitly declined**. The win32 figure is **6**, matching 01-30's
stated delta. Harmless in practice because 01-31 mandates the TAP measurement and says the measurement
wins — but it is stale prose an executor could carry forward as a target.

### W3 — 01-25's depends_on ["01-24"] is now vestigial

Its only substantive tie to 01-24 was agentForToken, which it refuses (B1). What remains is a reporting
tie (`:696` "reconcile them against plan 01-24's recorded figure") and read-only context. Zero cost
under sequential execution. Listed as **corroboration for B1**: the dependency edge is the fossil of a
handoff one side deleted.

### W4 — 01-28's stopArmDecision rests on an undeclared contract with 01-24's file

stopArmDecision keys on `e.synthesized` being **absent** on real Stops. Verified at source: the real
producer is `hooks.ts:841-849`, which does not set the key. hooks.ts is **01-24's** file, and 01-28 does
not list 01-24 in depends_on. Wave order (1 before 2) makes it safe under `use_worktrees: false`, but
the contract is undeclared and would break under any parallel model. One line in 01-28's coordination
block, or `depends_on: ["01-24", "01-27"]`, closes it.

### W4b — 01-31 register item 5 defers to a plan that can never be "in flight"

"test/net-binding.test.cjs's acceptance-case-3 comment cites hive.ts:1366 … **Owner: 01-24 if it is
still in flight, otherwise a follow-up.**" 01-24 is wave 1, 01-31 is wave 4 — the condition is never
true, so the owner resolves to the null branch. `grep -c 1366 01-24-PLAN.md` is **0**: 01-24 has no such
task, although it does own the file. Cosmetic in impact (a stale comment anchor), but it violates
01-31's own stated rule that "an operator has to look at it" is not an owner for something measurable
from source.

### W5 — five declared files carry no must_haves.artifacts entry, so the verifier has no gate on them

| Plan | Ungated file |
|---|---|
| 01-25 | `test/runtime-forget.test.cjs` |
| 01-29 | `test/renderer-components.test.cjs` |
| 01-31 | `src/main/config.ts`, `src/renderer/src/store/config.ts`, `resources/skills/capabilities/SKILL.md` |

Each is covered indirectly (01-31's three by the widened repo-claims pin; the two test files by their
plans' done-gate greps), so the risk is low — but a file with no `contains` gate is a file the phase
verifier will pass on existence alone.

### W6 — SC-1's restatement has no plan-level or issue-level owner

Register item 11 files it to "the ROADMAP's owner, not this plan's". `.planning/ROADMAP.md` is in **no
plan's files_modified**, and "the ROADMAP's owner" is a role, not an owner — the exact shape item 11's
own preamble forbids. The measurable consequence: **ROADMAP criterion 1's first sentence stays untrue on
win32 after this set lands**, with no artifact recording who fixes it. Give it an issue number or an
explicit "the verifier restates this at /gsd:verify-work time" clause.

---

## INFO

- **I1 — 01-31 mis-attributes the skip-title claim.** It writes "round 1 (and 01-30) both claim it
  'names all four by title'". grep for that claim in `01-30-PLAN.md` returns **0 hits**; 01-30 only says
  VALIDATION "pins `# skipped 4` and forbids a `>=` clause", which is true. 01-31's **substantive claim
  is correct and important** (VALIDATION names zero titles — verified); only the attribution is loose.

---

## What round 1's blockers look like now — all resolved

| Round 1 | Status |
|---|---|
| BLOCKER-1 — 01-24 elevates a registry cwd the codebase permits to be relative | RESOLVED. `vouchedBases()` filters on `isAbsolute()`; an empty candidate set returns a DENY naming `cwdValid`; the blast radius is stated in the SUMMARY requirement |
| BLOCKER-2 — 01-29 Task 3's RED demo invites an undeclared write to index.ts, reverting 01-25 | RESOLVED. "**Do not edit src/main/index.ts, not even temporarily.**" — the demo now runs against `git show a217018:src/main/index.ts` |
| WARNING-1 / WARNING-2 — 01-31 and 01-30 depends_on gaps | RESOLVED. 01-31 takes all seven; 01-30 takes `[01-24, 01-26]` |
| WARNING-3 / 5 / 8 / 10 / 11 | RESOLVED. Ownership corrected, seven SUMMARYs loaded, both-polarity sweep with a four-bucket adjudication, symbols-not-lines, seven call sites |
| WARNING-9 — b/CR-03 orphan | RESOLVED. Taken by 01-28 Task 3 with a real fix |
| WARNING-4 | RESOLVED by dropping the need — 01-30 argues README/RELEASE become MORE accurate and forbids editing them |
| WARNING-6 — test/engine-parity.test.cjs has no owner | **NOT resolved — became B3 instance 2** |
| WARNING-7 — 01-31 copies anchors 01-26 has shifted | RESOLVED by the symbol-first mandate and the re-derive-before-editing note at `01-31-PLAN.md:108-111` |

---

## Recommendation

**3 blockers require revision before execution.** All three are single-plan edits and none requires
re-scoping:

1. **01-24** — delete the agentForToken half of Task 3 and its four supporting claims (B1).
2. **01-24 or 01-31** — give hooks.ts:565 / recordSession a reachable owner (B2).
3. **01-31** — make Task 3's register a sweep over the seven loaded SUMMARYs rather than a fixed list,
   and seed it with proc-kill, engine-parity and recordSession (B3).

W1 (symbol-not-line in 01-24) is a one-word change and should ride along.

Everything the prompt asked me to re-derive independently — the 42/2 ownership map, zero body-only
writes, the acyclic declared-equals-computed wave graph, the single DESIGN.md owner with 01-31's pin in
place, the single whole-suite authority, the single 01-VALIDATION.md owner, and b/CR-03's genuine
adoption — **holds**. The disputed 01-VALIDATION.md skip-title fact is settled **in 01-31's favour**
against the live file.
