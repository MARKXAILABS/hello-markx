# Round 4 — whole-set integrity red team

**Target:** `01-24-PLAN.md` … `01-31-PLAN.md`
**HEAD:** `bc94644` (`gsd/v1.0-milestone`)
**Round-4 commits under review:** `473d961` (01-26 architecture reversal) · `f43d62e` (`.gitattributes`) · `bc94644` (01-24 revision 4)

**Verdict: NOT CLEAN — 1 BLOCKER, 4 WARNINGs, 4 INFO.**

Everything else in the set survives a hostile pass. The blocker is one bullet in one plan, and it is a
false claim about what a *different* plan delivers after round 4 reversed that plan's architecture.

---

## Baseline re-measured in this session (not inherited)

```
node --test --test-reporter=tap test/*.test.cjs
# tests 535 · # pass 531 · # fail 0 · # skipped 4 · # todo 0
npm run typecheck             -> exit 0
npx eslint . --max-warnings 0 -> exit 0
```

Matches the figure every plan keys its deltas to.

## Orchestrator's pre-verified table — confirmed, cheaply

All eight plans re-run through the SHIPPED verifier at HEAD:

| plan | artifacts | key-links | frontmatter parses | CR bytes | NUL bytes |
|---|---|---|---|---|---|
| 01-24 | 0/7 | 0/4 | yes | none | none |
| 01-25 | 0/6 | 0/4 | yes | none | none |
| 01-26 | 0/5 | 0/3 | yes | none | none |
| 01-27 | 0/4 | 0/3 | yes | none | none |
| 01-28 | 0/7 | 0/3 | yes | none | none |
| 01-29 | 0/5 | 0/4 | yes | none | none |
| 01-30 | 0/6 | 0/2 | yes | none | none |
| 01-31 | 0/5 | 0/2 | yes | none | none |

Zero "Source file not found", zero "Invalid regex pattern", zero `"error":` responses. Confirmed.

---

# BLOCKER

## B4-01 — `01-31` task 3 writes a FLOOR-04 claim that `01-26` revision 4 deliberately does not deliver

**Where:** `01-31-PLAN.md:413-419`, task 3 `<action>`.

```
- **FLOOR-04** — the matcher now covers underscore prefixes and JSON value position (01-26). Restate
  the ceiling to the shapes that STILL pass: bare high-entropy strings with no prefix and no
  labelled key, and the two size escapes (`SECRET_SCAN_MAX_LINES` / `SECRET_SCAN_MAX_BYTES` …)
```

**What 01-26 revision 4 (`473d961`) actually does.** Its objective, first line:

> **This revision does NOT widen the value matcher. That is the deliverable.**
> … **The JSON arm is DROPPED, and here is the measurement that killed it.** … **+2 detections is not
> worth re-opening that door.** It is recorded in the ceiling as a named residual with its
> measurement, not shipped as a fix.

And 01-26 task 1 ships a *live green arm* asserting the opposite of 01-31's sentence:

> **the JSON pair `"token": "abcdef123456789"` is STILL PRESENT** — it stays a documented miss

**Four consequences, each independently disqualifying:**

1. **A false claim lands in `.planning/REQUIREMENTS.md`.** "JSON value position" is not covered and will
   not be, and 01-26 ships a passing test in `test/hive-durability.test.cjs` proving it is not. This is
   ROADMAP criterion 1's exact defect class — *"grep finds no doc promising a code path that does not
   run"* — manufactured by the plan whose job is to close it.

2. **The restated ceiling omits two ACTIVE bypasses 01-26 mandates naming.** 01-31's "shapes that STILL
   pass" list is `bare high-entropy strings` plus the two size caps. 01-26 requires the `hive.ts` ceiling
   to name **four** ACTIVE bypasses — line-chunking, `seq 20001 > pad.txt`, the 4 MiB truncation, and
   quoted-key JSON — plus the measured false-positive rate. Executed literally, `src/main/hive.ts`'s
   ceiling and `.planning/REQUIREMENTS.md`'s ceiling contradict each other inside the same wave.

3. **The row's owner becomes unownable and 01-31 gives no instruction to re-home it.** Live at HEAD,
   `.planning/REQUIREMENTS.md:560` ends with
   `**Owner: a plan that widens the matcher, plus the operator.**`
   No plan in this set widens the matcher any more. 01-31's own register preamble forbids exactly this
   shape — an owner that resolves to nobody — yet its FLOOR-04 bullet leaves it standing.

4. **No gate catches it.** 01-31's `.planning/REQUIREMENTS.md` artifact gate is
   `contains: "SECRET_SCAN_MAX_BYTES"` (measured 0 at HEAD, correctly RED), which goes green whether the
   restated row is honest or not.

**The handoff is real on 01-26's side and broken on 01-31's side.** 01-26 task 3 residual (2) supplies
the anchors, and both verify live at HEAD:

```
.planning/REQUIREMENTS.md:39-40   - [ ] **FLOOR-04**: … so it never reaches git history — #10
.planning/REQUIREMENTS.md:560     … underscore-separated prefixes (`sk_live_`, `sk_ant_`), bare
                                   high-entropy strings, and JSON `"token": "..."` all get through
```

01-26 says *"this plan supplies the measured replacement text"* → via its SUMMARY. 01-31 says *"read
every SUMMARY … then verify each claim AT SOURCE"* → and then hands the executor a hard-coded,
contradictory bullet. **Two instructions, opposite content, and the plan text wins by default.** That is
not an unambiguous handoff.

**Required fix (01-31 task 3, FLOOR-04 bullet):**
- Delete "and JSON value position".
- State what 01-26 delivers: the five unlabelled underscore vendor shapes (`sk_live_`, `sk_test_`,
  `sk_proj_`, `sk_ant_`, `rk_live_`) and two live false positives removed — nothing else.
- State the ceiling as 01-26 measured it: line-chunking, `seq 20001 > pad.txt`, the 4 MiB truncation,
  quoted-key JSON and `obj["token"]`, bare high-entropy strings, and the 173-span / 66-path
  false-positive channel that is NOT closable by tightening pattern 5.
- Record that a quoted-key arm was built, measured and **rejected** (+2 detections against 2 permanent
  false positives), so a later reader does not re-propose it.
- Re-home the row's owner off *"a plan that widens the matcher."*
- Add: **take the replacement text from 01-26's SUMMARY, not from this bullet.**

**Nothing else in the set depends on the withdrawn widening.** Swept `JSON value position`,
`quoted-key`, `JSON arm`, `value position` and `FLOOR-04` across the other seven plans: exactly one hit,
this bullet.

---

# WARNINGS

## W4-01 — Two of 01-24's three accepted residuals have no SUMMARY gate, so 01-31's sweep can miss them

01-31 truth #5: *"Every code residual this gap-closure set does not fix has a named owner in one
register, and that register is DERIVED by sweeping the seven SUMMARYs."* The sweep reads SUMMARYs only.

| residual | required in a SUMMARY? | gated by a `<done>` clause? |
|---|---|---|
| **T-P24-12** unbounded connection count | yes | **yes** — 01-24 task 2 `<done>` |
| **T-P24-14** blocking resolve on operator-configured dead storage | objective prose only | **no** |
| **T-P24-15** hard link to a protected file (live, measured, ALLOWED) | **not required at all** — ceiling comment only | **no** |
| 01-26's 66-path false-positive channel | yes | **yes** — 01-26 task 3 `<done>` |
| 01-28 quiesce (a) and (b) | yes, under `## Quiesce residuals — ACCEPTED, not fixed` | yes — `<verification>` REQUIRED, and seeded as 01-31 item 10 |

T-P24-15 is a *live measured elevation of privilege* — `fs.linkSync` succeeded with no elevation on the
operator's host and the verdict through the link is ALLOWED under the fixed resolver — that no
canonicalisation can ever close. If 01-24's SUMMARY does not name it, it falls outside the register and
01-31's truth #5 is false as shipped. That is the exact defect that blocked round 1's fixed
eleven-item list.

**Fix:** add to 01-24 task 1's `<done>`: *"The SUMMARY names T-P24-14 and T-P24-15 with their owners,
under the heading plan 01-31's task-3 sweep reads."* 01-26 and 01-30 already carry that wording verbatim.

**Sub-note:** 01-26 and 01-30 both say *"the heading 01-31's task-3 sweep reads"*, but 01-31 names no
heading — its sweep reads the whole SUMMARY. Only 01-28's heading is concrete. Harmless (any heading is
read) but it is a dangling cross-plan reference in three places.

**Register hygiene otherwise passes.** No seed row is filed against an already-landed plan: row 5 is
explicitly re-homed off 01-24, row 9 is a verify-then-delete against 01-25's landed SUMMARY, rows 7/8/10
name follow-up plans. Confirmed live: `grep -c 1366 01-24-PLAN.md` is 0 and `hive.ts:1366` is
`const dir = this.agentDir(agentId);` — 01-31's stated reason for re-homing row 5 is accurate.

## W4-02 — 01-31's whole-suite arithmetic template has no term for the two pass decrements

01-31 `<verification>`: *"State the arithmetic: the `01-VERIFICATION.md` baseline (535 / 531 / 0 / 4)
plus the tests added by 01-24 through 01-30, with the skipped counter up by the measured amount on
win32."*

Both conversions turn a case that currently **passes** into a **skip**, so each costs one `# pass`.
Verified live at HEAD:

```
test/net-binding.test.cjs:319-326   if (process.platform === 'win32') { console.error(…); return; }   -> 01-24 task 3
test/win-cmd-shim.test.cjs:162-167  if (process.platform === 'win32') return;                          -> 01-30 task 1
```

The true identity on win32 is `pass = 531 − 2 + N_run`, not `531 + added`. 01-24 states its own drop
explicitly and forbids absolute counts; 01-30 states `# skipped +1` but never `# pass −1`; 01-31 owns
"the authoritative whole-suite figure" and its template omits the term entirely.

**Not a blocker** because 01-31 also says *"the measurement wins and the discrepancy is reported."* But
the plan that owns the *honest-pass-count* deliverable should not hand its executor arithmetic that is
wrong by exactly the quantity the phase's headline gap is about.

**Fix:** append to that sentence — *"minus one `# pass` per skip conversion (01-24's socket-watchdog
case, 01-30's `win-cmd-shim` case = −2 on win32)."*

**No plan asserts a falsified absolute count.** 01-24 and 01-27 both explicitly forbid one (*"never an
absolute pass count"*); 01-26, 01-28 and 01-29 report deltas only; 01-30 forbids re-deriving the
whole-suite figure at all.

## W4-03 — 01-27 carries an unlabelled prohibition gate

`01-27-PLAN.md` task 2 `<done>`:
`grep -c 'queueFile' test/delivery-main.test.cjs` is 0 — measured **0 at HEAD this session**.

Every sibling clause in that block carries "— measured 0 at a217018 this session" as evidence that it is
RED. This one carries only a reason and no HEAD measurement, so a reader cannot distinguish a
prohibition from a vacuous gate — the precise distinction 01-24 spells out for its own two:

> **Both are PROHIBITION gates, not evidence of work: both measure 0 at HEAD and must still measure 0 after.**

**Fix:** copy that label onto the `queueFile` clause.

## W4-04 — 01-24's gate-evidence footer counts two prohibitions; there are three

Measured at HEAD this session, all three are 0 and all three must stay 0:

```
grep -c  'maxConnections'   src/main/hooks.ts   -> 0
grep -cE 'conn\.destroy\('  src/main/hooks.ts   -> 0
grep -c  'agentForToken'    src/main/hooks.ts   -> 0
```

The third **is** labelled inline (*"— this plan does not add it"*), so it is not vacuous. But the closing
paragraph says *"Two `<done>` predicates in this plan are PROHIBITIONS"*, undercounting by one in the
plan whose whole argument is that the census of 0-at-HEAD gates is what matters.

---

# INFO

- **I4-01 — `01-31` `<interfaces>` claims `index.ts:545` moves because of 01-25. It does not.**
  01-25's `index.ts` edits are at ~`:556` (`setOtelTokenSource`), `:1621`, `:2516`, `:3257`, `:3290` —
  all below `:545`. Verified at HEAD: `index.ts:545` is `(agentId) => delivery.drainAtStop(agentId),`.
  Inert, because task 1 mandates re-deriving all thirteen anchors with pasted `sed -n '<n>p'` output —
  but it is a stale claim inside the plan that exists to delete stale claims.

- **I4-02 — `01-27` still carries a `contains_alt:` the shipped verifier never reads.**
  Its `src/main/delivery.ts` artifact has `contains_alt: "ENOENT"`. `verify.cjs` reads only `contains`
  (`String.includes`) and `key_links[].pattern` (`new RegExp`). Confirmed inert — the verifier reports
  that artifact solely on `contains: "queueReadError"`. 01-24 and 01-26 both state this; 01-26 deleted
  its own. Harmless, but it is a non-gate occupying a gate slot.

- **I4-03 — `01-25` task 2's `<automated>` names a file that does not exist and no plan creates.**
  `node --test test/telemetry-auth.test.cjs test/pty-env.test.cjs`; `test/pty-env.test.cjs` is absent at
  HEAD. 01-25's `<done>` resolves it explicitly (*"the `<verify>` command drops the second file — say
  which in the SUMMARY"*), so it is a documented conditional, not a break. `npm test` is unaffected — it
  globs `test/*.test.cjs` and the file is never created.

- **I4-04 — `01-VALIDATION.md`'s `# skipped ≤ 4` freeze is violated from wave 1 to wave 4 by design.**
  01-24 (wave 1) adds a skip; only 01-31 (wave 4) may edit the document. No plan's `<automated>` enforces
  the ceiling during execution, so this breaks nothing — the phase's own validation doc is simply stale
  for three waves, deliberately, and 01-30 says so in writing.

---

# What was attacked and held

## 1. File ownership, re-derived from scratch

45 declared entries · 42 unique files · 3 shared. Identical to round 3, despite two plans changing.

| shared file | owners | split declared |
|---|---|---|
| `src/main/hooks.ts` | 01-24 (w1, whole file) then 01-25 (w2, one statement + one import) | both directions, `shares_files_with` on both plans |
| `src/main/delivery.ts` | 01-27 (w1, `loadQueue`/`enqueue`) then 01-28 (w2, `quiesce`'s emit) | `<coordination>` in 01-27, `## Coordination` in 01-28 |
| `test/delivery-main.test.cjs` | 01-27 (EISDIR cases) then 01-28 (appended `synthesized` assertion) | 01-27 forbids restructuring the `harness()` helper 01-28 reads |

Every task `<files>` list is a subset of its plan's `files_modified`, and every `files_modified` entry is
claimed by at least one task. **Zero drift in either direction, all eight plans.**

Wave graph re-derived: `w1 = {24, 26, 27}` · `w2 = {25, 28, 30}` · `w3 = {29}` · `w4 = {31}`.
Declared equals computed. No cycles, no missing references, no forward references.

`this.hive.registry()` — the call 01-24 adds to `denyReason` — **already exists** at
`src/main/hooks.ts:786` and `:823`, and `HiveManager.registry()` is public (`hive.ts:2035`), so it
typechecks. And 01-24's premise is exactly right: `hookFloor`'s stub is
`{ root, sockPath, recordSession, isGod, rosterContext }` with **no `registry`**
(`test/net-binding.test.cjs:123-129`), and the two existing call sites survive only because they are
individually try/catch'd. The stub extension is genuinely load-bearing, not defensive padding.

## 2. Round-4 deletions — nothing references a deleted control as though it will exist

Swept `maxConnections`, `agentForToken`, aggregate-byte-budget phrasings and `realpathSync` across all
eight plans:

- Every `maxConnections` and aggregate-budget hit is inside 01-24, and every one is a **retraction, a
  prohibition, or a row in the three-round history table**. Zero forward references.
- `agentForToken` appears once outside 01-24's own deletion text: 01-25's *"do NOT inject
  HookServer.agentForToken"* — a prohibition that **agrees** with 01-24's deletion, carrying its own
  independent TDZ / exfiltration argument. Consistent from both sides.
- `realpathSync` appears in no plan but 01-24. The deleted JS fallback has no external consumer.
- **`HOOK_RESOLVE_BUDGET_MS` correctly replaces revision 3's `contains: "maxConnections"` gate**, which
  would otherwise have pinned a fail-open mechanism into the source file permanently.

## 3. Every `<done>` predicate, executed at HEAD

**53 predicates run. Zero already pass. Zero unlabelled 0-at-HEAD evidence gates.**

| plan | evidence gates (all RED at HEAD) | prohibition gates (0 at HEAD, must stay 0) |
|---|---|---|
| 01-24 | 19 — vouchedBases( 0 · canonicalSpelling( 0 · realpathSync.native 0 · HOOK_CANDIDATE_MAX 0 · HOOK_RESOLVE_BUDGET_MS 0 · expandTilde 0 · HOOK_LINE_MAX 0/0 · conn.on(timeout 0 · allowHalfOpen 0 · ../../bin 0 · node_modules 0 · registry: 0 · subst 0 · .invalid 0 · symlinkSync-file 0 · hive.ts:1072 **1 to 0** · skipped **0 to at least 1** | 3 (see W4-04) |
| 01-26 | 10 — hvs.CAESIJ 0 · LOCKSTEP drift 0 · desk-backend-engineer 0 · task_scheduler_interval_ms 0 · the word-boundary literal 0 · the underscore-alternation literal 0 · seq 20001 pad.txt 0 · proxyTokens.get(agentId) === 0 · new file absent · Enterprise Knowledge Graph **1 to 0** | 0 |
| 01-27 | 6 — softTrip 0 · softTrip-assignment 0 · top spender 0 · queueReadError 0 · code-not-ENOENT 0 · EISDIR 0 | 1 (**unlabelled — W4-03**) |
| 01-28 | 10 — await enqueueMessage 0 · queueError 0/0 · new file absent · synthesized-colon-true 0 while bare synthesized is 1 (correctly disambiguated in the plan) · synthesized 0/0 · stopArmDecision 0 · e.synthesized 0 · effect #4 **3 to 0** · persistQueues **1 to 0** | 0 |
| 01-29 | 3 node -e predicates, all exit **1** at HEAD; the anchor "Runs the CLI default model" is present (1), so each gate is red for the *missing guard*, not a missing anchor; MODEL_CHIP_MAX_W 0; DESIGN.md:678 **1 to 0** | 1 (child_process/execFileSync 0, **labelled** *"a regression guard, stated as such"*) |
| 01-30 | 9 — skip: 0/0 · stripLineComments 0 · the literal quoted sock_token form 0 · the npm-test equality literal 0 · hashedGlobs 0 · the widened glob literal 0 · installers= 0 · pre-change releases 0 | 1 (skip-colon-true 0, **labelled** *"and neither is skip: true"*) |
| 01-31 | 12 — three symbol anchors 0 · stale trio **4 to 0** · index.ts:1524 **1 to 0** · shippedTextFiles 0 · STALE_ANCHORS 0 · 1280 0 · SECRET_SCAN_MAX_BYTES 0 · 960 0 · SIDEBAR_COLLAPSE_WIDTH 0 · hook-auth-roundtrip 0 | 0 |

01-31's task-2 file-set gate, re-run live, returns 6 files today: `docs/floor-inspection.html`,
`resources/skills/capabilities/SKILL.md`, `src/main/config.ts`, `src/main/hive.ts`,
`src/renderer/src/store/config.ts`, `test/repo-claims.test.cjs`. One is 01-26's, three are 01-31's, two
are the declared exclusions. **The gate resolves to exactly the two exclusions and is satisfiable.**

## 4. Source anchors re-derived live

Every anchor these plans lean on verifies byte-exact at HEAD:

```
hive.ts:1338     this.revokeProxyToken(agentId);
hive.ts:1365     drainForStop(agentId: string): { block: boolean; reason?: string } {
hive.ts:1375     cursor.lastProcessed = fresh[fresh.length - 1].id;
hive.ts:1455     // Enterprise Knowledge Graph (opt-in). Volatile-free: …
hive.ts:1366     const dir = this.agentDir(agentId);
hooks.ts:662     // drain keeps working headless — which is the whole point of issue #5.
hooks.ts:663     const drain = this.drainAtStop?.(agentId);
hooks.ts:565     if (agentId && p.session_id) this.hive.recordSession(agentId, p.session_id);
delivery.ts:262   *  was asserted so a dead renderer's veto expires (VETO_TTL_MS). */
index.ts:545     (agentId) => delivery.drainAtStop(agentId),
index.ts:1524    const log = hive.logTail(8).map(…)
index.ts:1613    if (sample?.sessionId) hive.appendCostLedger(sample);
index.ts:1621    if (sample?.sessionId) hive.recordSession(id, sample.sessionId);
index.ts:2516    const MIN_WIN = { width: 1280, height: 800 };
DESIGN.md:169 / :677            the file's only two 1280 hits
repo-claims.test.cjs:231/:233   "eleven fails here" against an assertion of 12
the four live POSIX-only skip cases, exactly as enumerated (the frozen baseline)
```

`test/net-binding.test.cjs:279` — the fail-open sentence three plans quote — is verbatim in source.

## 5. Execution readiness — sequential, `use_worktrees: false`

Traced each plan for "could an executor following this literally produce a tree that fails `npm test`,
`npm run typecheck` or `npx eslint . --max-warnings 0`":

- **Skip polarities are all correct.** 01-24's group B runs on win32 and skips on POSIX; 01-30's
  `win-cmd-shim` conversion skips on win32 and runs on POSIX; 01-30's `transcript-project-dir` split runs
  on win32 and skips on POSIX. No unconditional `skip: true` anywhere, and 01-30 gates its absence.
- **The `enqueueMessage` widening crosses seven call sites, all inside 01-28's own `files_modified`** —
  1 in `MessageQueueComposer.tsx`, 6 in `useHive.ts`. `store.ts`'s bare early return is named as the type
  error it becomes, and `typecheck` is the declared backstop.
- **`splitterReachableMax` is exported from `sidebarLayout.ts` and imported into `SidebarSplitter.tsx`**
  — both 01-29's. `stopArmDecision` is a third export from `useHive.ts` — 01-28's. The optional
  `synthesized` field is widened in **both** preload signatures. No cross-process type import is added.
- **The dead-network-host cost assertion is network-state dependent only in the safe direction**, and
  01-24 forbids resting on the timing alone. The `.invalid` negative control is RFC 2606-guaranteed
  non-resolving, and group B is win32-guarded, so POSIX CI never evaluates a UNC string.
- **Two conversions drop `# pass` by one each on win32** — accounted for by 01-24, incompletely by 01-30,
  and missing a term in 01-31 (W4-02). Nothing *asserts* a count they falsify.

## 6. Goal-backward fitness — unchanged by round 4

**16/16 Criticals still owned.** a/CR-01…07 (7) + b/CR-01…06 (6) + c/CR-01…03 (3), and the union of CR
ids referenced across the eight plans is exactly those sixteen.

| Critical | owner |
|---|---|
| a/CR-01 transport posture · a/CR-06 argv session id · a/CR-07 stored session id | 01-25 |
| a/CR-02 redactSecrets | 01-26 |
| a/CR-03 relative path gate | 01-24 |
| a/CR-04 budget arm · a/CR-05 loadQueue | 01-27 |
| b/CR-01 composer · b/CR-02 quiesce · b/CR-03 roster queues | 01-28 |
| b/CR-04 model chip · b/CR-06 AUTO chip | 01-29 |
| b/CR-05 collapse unreachable | 01-25 (MIN_WIN) + 01-29 (cross-file pin) |
| c/CR-01 win32 non-run | 01-24 + 01-30 |
| c/CR-02 update-feed provenance · c/CR-03 shim token grep | 01-30 |

**3 of 6 verification gaps still closable**, and round 4's deletions dropped none of them:

| gap | closable | why |
|---|---|---|
| SC-3 containment (three counts) | YES | OTLP to 01-25, path gate to 01-24, matcher to 01-26 |
| SC-4 legibility | YES | 01-25 + 01-28 + 01-29 |
| "the published 531 pass figure is an honest floor" | YES | 01-24 + 01-30 + 01-31 |
| SC-5 issues / PR #77 | no | operator-blocked, register item |
| SC-2 provenance, LIVE half | no | needs a published tag |
| SC-1 autonomy survives the window | no | 01-31 explicitly declines to restate; Phase 2 DAEMON-01 |

**01-24's four round-4 deletions cost no Critical** — every one removed a mechanism *its own revision 3*
introduced, not a review finding. **01-26's reversal costs no Critical either** — a/CR-02 is the matcher,
and 01-26 still fixes pattern 3, still removes two live false positives, and still restates FLOOR-04 as
bounded. The JSON arm was never a Critical. The only casualty is 01-31's stale sentence about it, which
is B4-01.

## 7. Other dimensions

- **Architectural tier compliance** — `01-RESEARCH.md:97`'s responsibility map assigns hook identity and
  budget enforcement to Electron main, autonomy to `delivery.ts`, provenance to CI, and render-cost
  policy to the renderer. Every plan lands its work in the mapped tier. **No security-sensitive
  capability is pushed to a less-trusted tier**: 01-25's 401 gate is server-side in `telemetry.ts` with
  the id derived from the token and never from the payload, 01-24's path gate is entirely in main, and
  01-28's renderer guard is a *status paint* keyed on a discriminator minted in main. PASS.
- **Research resolution** — `01-RESEARCH.md:1129` is `## Open Questions (RESOLVED)`. PASS.
- **Cross-plan data contracts** — the one real shared pipeline is `enqueue`'s refusal string: 01-27
  produces `queueReadError`, 01-28 renders it attributed to main. 01-27's `<done>` requires quoting the
  exact string *"so plan 01-28 can be checked against it"*, and 01-28 requires attributing it to main
  rather than adopting it as the app's own diagnosis. Contract closed in both directions. PASS.
- **Pattern compliance** — every new file names a live in-repo analog (`net-binding` for the telemetry
  harness, `renderer-components:96-122` for the queue harness, `hive-durability` for the proxy-token
  harness, `ci-config:44-46` for the cross-file pin, the lint test at `:314-334` for the CI pin,
  `STALE_STOP_DRAIN_DENIALS` for the denial table). PASS.
- **CLAUDE.md compliance** — no `./CLAUDE.md`, no `.claude/skills/`, no `.agents/skills/`. SKIPPED.

---

# Per-plan verdict

| plan | wave | files | tasks | done gates run | already-passing | verdict |
|---|---|---|---|---|---|---|
| 01-24 | 1 | 2 | 3 | 22 | 0 | CLEAN (W4-04 cosmetic) |
| 01-25 | 2 | 8 | 3 | 9 | 0 | CLEAN (I4-03) |
| 01-26 | 1 | 4 | 3 | 10 | 0 | CLEAN |
| 01-27 | 1 | 4 | 2 | 7 | 0 | WARN — W4-03, I4-02 |
| 01-28 | 2 | 7 | 3 | 10 | 0 | CLEAN |
| 01-29 | 3 | 6 | 3 | 7 | 0 | CLEAN |
| 01-30 | 2 | 6 | 3 | 10 | 0 | CLEAN |
| 01-31 | 4 | 8 | 3 | 12 | 0 | **BLOCKED — B4-01**, W4-01, W4-02, I4-01 |

---

# Verdict: NOT CLEAN

One blocker, in one plan, in one bullet — and it is the highest-leverage kind. A plan whose entire job is
to make the project's claims about itself true would, executed literally, write a *new false claim* into
`.planning/REQUIREMENTS.md`, contradicting a passing test a sibling plan ships in the same phase, with no
automated gate able to see it.

Everything else survives the pass. The round-4 changes to 01-24 and 01-26 are internally sound, their
deletions are cleanly retracted with no dangling forward references, all 45 file claims reconcile, the
wave graph is correct, all 53 `<done>` predicates are RED at HEAD, every prohibition but one is labelled,
the live baseline matches to the test, and 16/16 Criticals are still owned.

**Fix B4-01 — ideally W4-01 and W4-02 in the same edit — and re-verify 01-31 only. The other seven plans
need nothing.**
