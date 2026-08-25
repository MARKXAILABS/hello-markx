# Phase 4 — Adversarial Red-Team, Round 3 (final review round)

**Plans reviewed:** 20 plans / 7 waves / 59 tasks @ `4d6842b`
**Reviewers:** 2 hostile lenses, parallel direct Agent calls (verify-the-fixes · self-check audit + unswept sweep)
**Verdict:** **All 9 round-2 blockers CLOSED** and independently re-verified against live source.
**5 new BLOCKERs, 7 HIGH — every one a 1–5 line fix in plan *text*, not plan architecture.**

> Both reviewers, independently: *"Nothing else here needs a fourth adversarial round; the MEDs are
> executor-visible corrections that belong in a revision pass, not another review cycle."*

---

## Round-2 blockers: all nine closed, verified at source

| R2 | Verified how |
|---|---|
| BL1 Claude timeout | `hookSettings` is exported and pure (`hiveProvisioning.ts:452`), so the criterion can actually call it. `MIN_PRETOOLUSE_SEC` + the three-part assertion (`≥60`, `≥30_000`, `≤ MIN*1000`) kills **both** degenerate values R2-H7 named |
| BL2 the 5 s timer | `var bootTimer` captured, `clearTimeout` on the ask branch, and **case 6 exists with the elapsed > 5 000 ms assertion** — the thing that stops a future TTL cut re-blinding the test |
| BL3 honesty pin | Relocated to 04-19 (wave 7, owns SECURITY.md **and** `repo-claims.test.cjs` in one commit); live-refusal clause now in the pinned positive set; correction path legal |
| BL4 codex `tool_input` | `commandOf` spec implementable verbatim; "name does not matter" holds — `grep -n tool_name hooks.ts` shows the remaining hits are audit/`emitControl`/breaker paths, none a gate |
| BL5 `tool_name === 'Bash'` | Criterion inverted to `0`; behavioural half present (`tool_name:'shell'` on a `<hive>/bin/` path denies, `<hive>/scratch/` control allows) |
| BL6 `rm -rf` | 4/4: routed to ask, widened to any recursive flag ±`-f`, bypass sentence deleted **with its absence asserted**, ceiling (t) enumerates the other spellings |
| BL7 `QuietSnapshot` | Producer real — `Floor` has one producer (`bootFloor`) so adding `watchdog` breaks nothing; `deps.send` exists. Phone consumer sound. **Desktop consumer is not → BL-2 below** |
| BL8 FLOOR-12 | Traced mechanically through clause 2's multiset and clause 3's tag walk; `FLOOR12_ALLOWLIST` counted at exactly 16. The named JSX works |
| BL9 `ASK_TTL_MS` | No import cycle; effect assertion reachable (`floor.hookServer` is a `Floor` member) |

**R2-H1 (line windows) closed:** no acceptance criterion anywhere uses a fixed line window. The three
remaining `head`/`tail` uses are self-measuring relative comparisons.

---

## The four self-checks, re-run independently

| Check | Planner | Independent result |
|---|---|---|
| `sed -n` in criteria | 0/20 | **0/20 confirmed** — then *executed* all 18 `awk` replacements: **16 correct, 2 return zero lines** → BL-2 |
| prose write-targets ⊆ `files_modified` | 0 violations | **0 confirmed, exhaustively** (every `<files>`, `artifacts.path`, `key_links`, and path token in `<action>`/`<behavior>`/`<acceptance_criteria>` across 20 plans) |
| 21 seams have accessor + consumer criterion | walked | **`Floor.watchdog` + `'floor:quiet'` and `ASK_TTL_MS` genuinely closed.** Fourth instance found — type-level, not routing → HIGH-2 |
| wave→file matrix | 0 collisions | **0 same-wave collisions, DAG acyclic, every edge strictly lower wave.** `autonomous: false` on exactly the 4 plans with blocking checkpoints |

**Counts, all recounted:** 38/38 decisions (D-01…D-37, D-40) · 11/11 requirement IDs · 20/20
`<threat_model>` · **59 tasks ↔ 59 VALIDATION rows, exact bijection** (0 orphans, 0 dupes, 0 `_tbd_`) ·
59/59 tasks with name + `<read_first>` + `<action>` + `<acceptance_criteria>` · 199 STRIDE rows
(171 mitigate / 23 accept). Baseline re-measured: **805 / 798 / 0 / 7** — exact.

### The decision-coverage gate is a FALSE NEGATIVE — resolved

GSD's blocking gate `check.decision-coverage-plan` returns `passed: false, covered: 5, total: 37`. It
matches a stricter citation form than the bare `D-NN` the plans use.

**Substance checked, not assumed:** all 18 decisions cited by only one plan were walked. **None is
merely name-dropped.** The two likeliest candidates hold up — D-12's both-directions `env` test is
04-05 T3, and that plan *says out loud that its authentication half cannot fail for L-04's reason*
(codex reads `auth.json`, not env), which is the honest version rather than the flattering one; D-19 is
an index criterion; D-20's `GIT_INDEX_FILE` is explicitly downgraded to belt-and-braces with the reason
recorded.

**Disposition:** citation-form artefact. Fix by adding `D-NN:` form citations so the gate passes
honestly — do **not** override it.

---

## BLOCKERS (all 1–5 line fixes)

### BL-1 — 04-19 instructs SECURITY.md to carry half the security ceiling, and the omitted half is almost exactly round 2's remedies
`04-19:110`/`:150` say *"plan 04-06's **(j)-(o)**"*; `:151` says *"GATE-05's **(a)-(d)**"*.
Measured: 04-06's GATE-03 ceiling is **(j)-(u)** — 12 items (its own `04-06:559` asserts 12). 04-15's
GATE-05 ceiling is **(a)-(h)** — 8 items.

So the close omits **10 of 20 ceiling items**, and the omitted set is: (s) the argv-array residual
(R2-BL4), (t) the unjudged deletion spellings (R2-BL6), (u) the incomplete host allowlist (R2-H8),
(e) grok/agy's unchanged timeouts (R2-H4), (g) Claude's PreToolUse budget (R2-BL1), (h) the 150 s
hazard (R2-H3). **D-34 makes the ceiling part of the deliverable**, and no criterion counts items.
Same stale range at `04-06:275` and `04-15:486`.
**Fix:** `(j)-(u)` / `(a)-(h)`, plus a criterion counting SECURITY.md's items against the source.

### BL-2 — the only guard that agy and grok stay byte-identical matches nothing
**Cross-confirmed by both lenses and by the orchestrator.**
`04-16:302` uses `awk '/^const AGY_HOOK_SHIM = /,/^\`;$/'`; source declares **`export const`**
(`hiveTemplates.ts:364`, `:730`).

Executed:
```
awk '/^const AGY_HOOK_SHIM = /,/^`;$/'         → 0 lines   (sha1 = da39a3ee… = sha1(""))
awk '/^export const AGY_HOOK_SHIM = /,/^`;$/'  → 52 lines
```
Both sides of the comparison hash the empty string, so the criterion **passes for any edit to either
shim, including deleting them**. These are the two LIVE-UNVERIFIED engines nobody can test, this is
their whole protection, and threat row `T-04-ASK-46` cites it verbatim as the mitigation that removes
R2-H4's fail-open. A silent vacuous pass inside the criterion written to eliminate silent vacuous
passes. (`04-15:641`'s sibling `awk` has `export` and works — 35/34 lines.)
**Fix:** one word — `^export const`.

### BL-3 — 04-18's `'floor:quiet'` route has no preload hop, and its criterion fails on every correct implementation
`04-18:469`/`:531` require `grep -c "'floor:quiet'" useHive.ts` → `1`. Measured against this codebase:
`contextIsolation: true` (`index.ts:1590`), `contextBridge.exposeInMainWorld('cth', api)`
(`preload/index.ts:1603`), **`useHive.ts` contains 0 `ipcRenderer` references and 0 channel literals** —
it subscribes 28 times through `window.cth.…`. The preload exposes one named method per channel and
holds the literal itself (`onApprovalRequest`, `preload/index.ts:1149-1153`).

Correct implementation → boot.ts 1, **preload 2, useHive 0**. The criterion returns 0. To make it
return 1 the executor must plant a dead literal, or add a generic channel passthrough on the
contextBridge — widening the IPC surface in the wave of a security phase. The hop is also unassigned:
task 3's `<files>` has no preload, and task 1's *"no new channel name appears"* pin exempts
`floor:quiet` **without assigning it to anyone**.
**Fix:** name `onFloorQuiet`, add `src/preload/index.ts` to task 3's `<files>`, restate as boot.ts 1 /
preload 2 / `grep -c 'onFloorQuiet' useHive.ts` 1.

### BL-4 — 04-18's phone↔desktop countdown cross-check is red by design
`04-18:419`/`:655` require the four `formatRemaining` literals be **byte-identical** to the phone's, and
even instruct *"temporarily change one literal, confirm red, revert."* But `04-UI-SPEC.md:623-624`,
`:643` make them **deliberately different**: phone `<10s` renders `expiring`; desktop renders
`expiring — will deny`. The likely resolution — "fix" the desktop copy — **deletes the only half of the
string that tells the operator what the timeout does.**
**Fix:** scope the cross-check to the shared tokens (`m `, `s left`, `expired`) plus an assertion that
the desktop literal *starts with* the phone's and adds `— will deny`.

### BL-5 — decision-coverage gate (see above)
Blocking per workflow §13a. Substance verified sound; fix the citation form.

---

## HIGH

| # | Finding |
|---|---|
| **H-1** | **`hiddenClaude.ts`'s `envPassThrough` can never be set, and ceiling (h) states the opposite.** `runHiddenClaude`'s only caller is `reflect.ts:344`, and 04-05 asserts *"`git diff --stat src/main/reflect.ts` is empty."* So the field is never populated and it ships filtering with `[]` — while ceiling (h) claims *"two of them can reach the operator's list."* Only `pty.ts` does. Matters because ceiling (f) names the hazard: a BYOK operator on `ANTHROPIC_API_KEY` loses reflection silently at 3am with the documented escape hatch structurally unreachable. |
| **H-2** | **The fourth seam instance — type-level.** `AgentTeardownDeps.hive` (`lifecycle.ts:75-80`) is exactly `{stopProxyBridge, enabled, setArchived, root}` — **no `patchTask`, no ledger reader**, and `hive.ts:2077` is `tasks(): unknown`. 04-08 asserts four times that it *"ALREADY carries"* what both VIGIL-02 writes need — true of the runtime object (`boot.ts:255` passes the real `HiveManager`), **false of the type**. `npm run typecheck` is an acceptance criterion in both tasks and fails until the interface is widened, which the plan never says to do while repeatedly saying *"no new wiring."* Fix stays inside 04-08's own file; `boot.ts` still needs no edit — but the plan must say so or the executor stop-and-reports. |
| **H-3** | **04-19 carries both the strict and the soft `nyquist_compliant` rule, two bullets apart.** `:307` says a `false` close **fails the phase**; `:308` licenses *"either flipped or explicitly explained"* — exactly what R2-M7 and the operator's standing mandate forbid. `:308` is the acceptance criterion, so it is what gets checked. |
| **H-4** | **04-19's row-count instructions say 29/30; the map has 59.** `:197`, `:274-275`, `:433` all say 29 behaviour rows + a marker row, *"with `Task ID`/`Plan`/`Wave` still `_tbd_`"*. Measured: **59 rows, exact bijection, already filled, 0 `_tbd_` in the file**, and no marker row exists. An executor following read_first + action + success_criteria fills 30 of 59 and closes. Compounding: `:307`'s *"a non-⬜ `Status`"* is **vacuous** — every cell reads `pending`; `⬜` appears only in the legend, so all 59 pass unchanged. Also `:36` says *"wave-8 evidence"* (there are 7 waves). |
| **H-5** | **04-16's `clearTimeout` criterion states a wrong baseline and cannot fail.** `:296` says *"returns ≥ 1 (it was `0` before this plan)"*. Measured at HEAD: **2** (`hiveTemplates.ts:545`, `:552`, `stopTimer`). So it passes before any edit, and the SUMMARY will read "2 → 3" while narrating that it closed R2-BL2. The paired `bootTimer ≥ 2` (HEAD 0) and case 6 do bite, so not fatal — but the criterion R2-BL2's fix rests on is the one that cannot fail. |
| **H-6** | **04-18 T1's channel criterion has no expected value and contradicts its own action.** `:241` greps two files with `grep -c` and no number — and with two file arguments `grep -c` prints `file:count` per file, so there is nothing to compare. Measured: `control:approvalRequest` is at `hooks.ts:1522` and `preload/index.ts:1151-1152` — **0 in both files greped**. Meanwhile `:123-125` says *"nothing new is added"* while `:216-219` requires *"add one IPC handler in `index.ts`"*. This is the phase's only desktop route for answering a GATE-05 ask. |
| **H-7** | **04-07's artifact contract requires the token its own criterion forbids.** `:21-24` declares `contains: "LIVE-UNVERIFIED"` for `blockHints.ts`; `:167` asserts `grep -c 'LIVE-UNVERIFIED' blockHints.ts` returns **`0`** (well-reasoned — the four-way marker pin is owned by other plans in other waves). Whichever the executor obeys, one declared contract is red. |

---

## MED (fix in the revision, no further review)

- **M-1** `04-06:566`'s negative half is already satisfied at HEAD — *"FOUR protected literals"* wraps a
  line break (`hooks.ts:1144-1145`), so the `grep -ci` returns 0 today and can never be 1.
  `grep -ci 'FOUR protected'` does the job.
- **M-2** Two 04-15 ceiling criteria pass at HEAD: `grep -ci 'OpenCode' hooks.ts` ≥ 1 measures **2**
  (grok 4, agy 3) — cannot fail. `degrades to` is called *"one of three phrases that occur only in this
  block"*; it is **2** at HEAD.
- **M-3** `04-03:267`'s positive lower bound is already wrong: `grep -c 'idleMs'` over the
  `LiveAgentPty` block returns **2** (field + doc-comment mention), criterion says 1.
- **M-4** `04-16:303` is not a check — a whole-file `grep -ci 'grok'` (17 at HEAD) says nothing about
  location, and no number is stated. `04-16:528` still says *"five cases"* where the task demands seven.
- **M-5** `04-12 T1` forbids the fix it requires — copy `WorkersTab.tsx:20` *"verbatim, do not improve"*,
  but that function returns `'NaNd'` for `NaN` while the criterion requires `'0s'`.
- **M-6** The `rm` shape's conjunction is unanchored: `cp -R a b; rm c` and `grep -r rm .` reach `ask`
  → a 3am push plus agent stall. No ceiling item records the false positives for the shape most likely
  to fire on an overnight run. Related: the waves-2-to-4 hard-deny enumeration (`04-06:229-230`) omits
  the `rm` shape round 3 just added to it.
- **M-7** An ask on a non-polling engine (pi/OpenCode/grok/agy) still pages the operator, and their
  answer is inert — the decision was already made. Zero practical impact here (all four uninstalled).
- **M-8** The per-poll timeout path has no test case — case 5 covers socket *death*, not a poll that
  opens and never replies. "Silent exit is ALLOW" one level down, specified but unproven.
- **M-9** `04-18 T4` is the only blocking checkpoint with **no stated negative path** (04-05 T3, 04-13 T4
  and 04-19 T3 each name one), while `04-19:349` presupposes its success.
- **M-10** `04-20 T1` leans on `test/hive-durability.test.cjs`, whose `indexOf('\n);')` returns **-1**
  against `boot.ts`'s indented `  );`, so its "argument list" is the last 101 lines of the file.
  Pre-existing; 04-20's own criteria use the correct `awk` boundary, but it cannot tighten a file it
  does not own.

## LOW

- `04-06:559` says *"nine new items"* beside a correct asserted `12`.
- `04-11`'s `grep -c "'floor:quiet'" boot.ts` → `1` while the same task requires a comment quoting the
  literal; `grep -c` counts lines → 2.
- `04-18` (w6) `depends_on: ["04-14","04-17"]` but T4 needs 04-20's wiring and 04-16's shim (both w5).
  Wave ordering makes it safe; under-declared edges are a defect by 04-19's own constraint.
- The 35 s baseline is optimistic: quiet re-measure **42 377 ms** (+21%) before the phase adds eleven
  test files with two 10 s sub-budgets. Headroom under the 90 s budget is ~48 s, not ~55 s.
- `04-06`'s `T-04-CMD-04` mitigation still reads *"this arm judges Bash commands only"* — stale after
  the arm stopped keying on `tool_name`.
- `memory.ts`'s `[]` filter is well-reasoned, but `HTTP_PROXY`/`HTTPS_PROXY`/`NODE_EXTRA_CA_CERTS` are
  in neither `ENV_ALLOW` nor reachable via the pass-through, so corporate-proxy operators lose
  first-run model download silently.

---

## Trajectory

| Round | Unique BLOCKERs | Character |
|---|---|---|
| 1 | 11 | **Architectural** — unowned composition root, no ask producer, gate keyed to one engine |
| 2 | 9 | **Structural** — fixes that moved defects; unreconciled engine, uncleared timer, unrouted seam |
| 3 | 5 | **Textual** — a missing `export ` in an awk anchor, a stale ceiling range, a criterion greping the wrong file |

Each round's findings are strictly smaller in blast radius than the last, and round 3's are all
1–5 line corrections in plan text. Both reviewers independently concluded no fourth *review* round is
warranted — only a revision pass.

*Round 3. `RED_TEAM_CLEAN=false` pending the revision. Three red-team iterations have now elapsed.*
