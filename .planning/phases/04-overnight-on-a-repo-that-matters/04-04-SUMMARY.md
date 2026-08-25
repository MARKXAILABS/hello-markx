---
phase: 04-overnight-on-a-repo-that-matters
plan: 04
subsystem: task-ledger-card-clock
tags: [vigil-04, vigil-02, hive-task, task-cli, write-tasks, interface-first, tdd]
requires: []
provides:
  - "HiveTask.updatedAt?: string — VIGIL-04's per-card clock, stamped by BOTH ledger writers"
  - "HiveTask.released?: {by, at, branch?, detail?} — VIGIL-02's shape, declared for 04-08 (writer) and 04-12 (renderer)"
  - "bin/task.cjs stamps updatedAt on add|patch|claim|done, inside the compare-and-swap"
  - "HiveManager.writeTasks stamps updatedAt diff-driven, covering all five main-side callers including the four that bypass mutateTasks"
  - "9 new cases in test/hive-task-mutation.test.cjs — four separate per-verb, one mutateTasks, one direct-writeTasks with unchanged-sibling byte-identity, one legacy card, one read-path negative with its positive bound, one legacy round-trip"
affects:
  - "04-08 — writes released.{by,at} then released.{branch,detail}; the field exists, its writer does not"
  - "04-12 — renders the age from updatedAt (falling back to createdAt and SAYING so, 04-UI-SPEC S5 A-3) and the DROPPED BY row from released"
  - "04-09 — owns LOG_ROTATE_BYTES, the ignore seed and appendLog in hive.ts; untouched here"
  - "04-10 / 04-16 (track A) — own hiveTemplates.ts:291+ (the shims); untouched here"
tech-stack:
  added: []
  patterns:
    - "stamp at the single choke point every caller routes through, not at the helper four of five callers bypass"
    - "diff-driven stamping against the ledger the writer has already read — no second read, and an unchanged card keeps its value"
    - "fingerprint excludes the field being stamped, or the diff degenerates into stamping everything on the write after the first"
    - "one code path shared by three verbs gets ONE stamp and three separate executable test cases, never three copies of the line to satisfy a grep count"
key-files:
  created: []
  modified:
    - src/main/hive.ts
    - src/main/hiveTemplates.ts
    - test/hive-task-mutation.test.cjs
decisions:
  - "D-30 honoured and extended by measurement: bin/task.cjs is the only SANCTIONED writer, but it is not the only writer — hive.ts's writeTasks is the main-side one, and both stamp. A TASK_CLI-only stamp measures the age from the wrong clock in exactly the case a human touched the card (04-RESEARCH § Pattern 10)."
  - "The stamp is in writeTasks, NOT mutateTasks. mutateTasks is one of five callers; index.ts:1061 (webhook card creation) and index.ts:4166 → realtimeActions.ts (voice) call writeTasks directly. Verified by grep, and by a test that drives writeTasks directly."
  - "Diff-driven, not unconditional: the card fingerprint is taken after stripDerivedTaskFields on both sides with the card's own updatedAt excluded. Stamping every card on every write would make HiveTask.updatedAt a duplicate of TaskLedger.updatedAt and no card could ever look stale (T-04-AGE-10)."
  - "AC 'grep -c updatedAt in hiveTemplates.ts >= 4' MEASURES 3 and was not padded to 4. patch, claim and done share one merged-card code path in TASK_CLI, so a fourth site would be a redundant copy of an existing line. The stronger substitute — four separate executable per-verb cases driving the real generated CLI — is delivered and green."
  - "One pre-existing test ('patch refuses an unknown card without rewriting the ledger') asserted an exact card shape this plan deliberately widens. Its updatedAt was lifted OUT of the shape comparison and asserted on its own terms (byte-identical across a refused patch, plus a typeof check), rather than the field being dropped from the assertion."
  - "D-32 held: nothing in this plan computes, stores or persists an elapsed value. Two timestamps, zero ages."
metrics:
  duration: ~35m
  completed: 2026-08-25
---

# Phase 04 Plan 04: VIGIL-04's Clock and VIGIL-02's Field Summary

`HiveTask` now carries `updatedAt` — an optional ISO string stamped by **both** ledger writers,
`bin/task.cjs` (all four verbs, inside the compare-and-swap) and `HiveManager.writeTasks` (the
choke point the kanban, inbound webhooks, Slack and the voice read-layer all pass through) — plus
`released`, declared in the exact shape plans 04-08 and 04-12 consume. The main-side stamp is
diff-driven against the ledger `writeTasks` has already read, so a card that did not change keeps
its old value and the field means "when THIS card last changed", not "when tasks.json was last
written".

**Commits:** `aa07642` (task 1) · `05f14c9` (task 3, RED gate) · `3cbe336` (task 2, GREEN).

**Task ordering deviation, deliberate:** task 3's own `<action>` says *"Write it RED first — assert
before the stamps land, watch it fail naming the missing field."* That is only executable with the
test commit landing **before** the implementation commit, so the commit order is task 1 → task 3
(RED) → task 2 (GREEN). This is the TDD gate sequence the plan mandates, not a reordering of the
work.

---

## The four things the plan told this SUMMARY to record

### 1. Open Question 5 — the shape-validation grep. Answer: **none.**

The question was whether any exact-shape validation over parsed `tasks.json` would reject an
additive optional card field. It was settled by grep before the field was added, not assumed.

```
$ sed -n '24,290p' src/main/hiveTemplates.ts | grep -n "JSON.parse\|Object.keys\|hasOwn\|allowlist\|schema\|delete \|for (const k of\|instanceof"
15:  try { raw = JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch (e) { raw = {}; }
92:    for (const k of ['title', 'description', 'assignee', 'result']) if (f[k]) patch[k] = f[k];
104:      delete merged.__q;
```

Read in context, all three are benign:

| Hit | What it actually is |
|-----|---------------------|
| `JSON.parse` in `read()` | Guards the **ledger envelope** only: `Array.isArray(raw.tasks)` and `typeof raw.rev === 'number' && raw.rev >= 0`. Nothing inspects a card. |
| `for (const k of ['title', …])` | An allowlist over **CLI flags**, deciding what a `patch` may set. Not a validation of the card read from disk. |
| `delete merged.__q` | Removes the CLI's own internal `--q` marker before the write. |

On the main side, `hive.ts`'s `ledger()` (`:2216-2226`) reads `Partial<TaskLedger>` through
`readJson` with a `{}` fallback and applies the same two envelope guards; `stripDerivedTaskFields`
(`:186-194`) deletes `tokens`, `pct` and a non-number `budgetTokens` and **nothing else**, so a
card-level `updatedAt` survives it — confirmed by reading it, and then by the legacy round-trip
case.

**There is no exact-shape check, no key allowlist and no `Object.keys(...).length` comparison over
a parsed card anywhere in either writer.** Additive optional fields pass through both untouched.
Proved as well as grepped, before the stamps existed:

```
$ node <legacy round-trip probe>
parsed rev: 7
round-trip identical: true
has own updatedAt: false
serialized: {"id":"legacy-1","title":"legacy","status":"todo","dependsOn":[],"priority":3,"createdAt":"2026-08-15T08:00:00.000Z"}
```

That probe is now a permanent test case (`a legacy tasks.json round-trips through writeTasks
byte-identically`), which additionally asserts `Object.hasOwn(card, 'updatedAt') === false` — the
assertion that tells "the key was never written" apart from "the key was written as undefined".

### 2. The RED run, verbatim

At commit `05f14c9`, with the interface fields present but no stamping anywhere:

```
ℹ tests 25
ℹ suites 0
ℹ pass 17
ℹ fail 8
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2057.8934

✖ failing tests:

test at test\hive-task-mutation.test.cjs:443:1
✖ bin/task.cjs add stamps updatedAt, exactly equal to createdAt (101.9283ms)
  AssertionError [ERR_ASSERTION]: add: updatedAt must be an ISO string, got undefined
      at assertIsoAtOrAfter (…\test\hive-task-mutation.test.cjs:436:10)
      at TestContext.<anonymous> (…\test\hive-task-mutation.test.cjs:447:3)
```

The eight that failed:

```
✖ bin/task.cjs add stamps updatedAt, exactly equal to createdAt
✖ bin/task.cjs patch stamps updatedAt at or after createdAt
✖ bin/task.cjs claim stamps updatedAt at or after createdAt
✖ bin/task.cjs done stamps updatedAt at or after createdAt
✖ a main-side patchTask (the mutateTasks path) stamps updatedAt too
✖ a direct writeTasks stamps only the card that changed — an unchanged sibling keeps its updatedAt byte-for-byte
✖ a legacy card — createdAt present, updatedAt absent — survives a patch and gains one
✖ reading the ledger without mutating leaves updatedAt byte-identical
```

**The ninth new case passed in RED, by construction and on purpose.** `a legacy tasks.json
round-trips through writeTasks byte-identically` is the back-compat guard: it asserts that an
unmodified legacy card is **not** rewritten, which was trivially true before the stamp existed and
is the non-trivial claim afterwards. It is stated here rather than dressed up as a RED failure.

The read-path negative (`reading the ledger without mutating…`) would also have passed vacuously —
`undefined === undefined` across two reads. It carries a positive lower bound per D-33/D-40 (after
the two reads it performs a real mutation and asserts the clock **did** move), which is what put it
in the failing eight.

### 3. Test-count delta

| Measurement | Base `8749a2b` | HEAD `3cbe336` | Δ |
|---|---|---|---|
| `test/hive-task-mutation.test.cjs` — `test(` declarations | 16 | 25 | **+9** |
| `test/hive-task-mutation.test.cjs` — pass / fail | 16 / 0 | 25 / 0 | +9 / 0 |
| Full suite — tests | 843 | 852 | **+9** |
| Full suite — pass | 836 | 845 | +9 |
| Full suite — **fail** | 0 | **0** | 0 |
| Full suite — **skipped** | 7 | **7** | **0 — unchanged, as required** |

No POSIX gate was added; all nine cases run on all three platforms.

### 4. `bin/task.cjs` is NOT in `gitCommitter.harnessAuthored`'s byte-identity map — confirmed

Read at `src/main/gitCommitter.ts:238-248`:

```ts
private async harnessAuthored(root: string, rel: string): Promise<boolean> {
  const generated: Record<string, string | undefined> = {
    'bin/cth-hook.cjs': HOOK_SHIM,
    'bin/hive-proxy.cjs': PROXY_BRIDGE_SHIM
  };
```

Two entries, `HOOK_SHIM` and `PROXY_BRIDGE_SHIM`. `TASK_CLI` is absent, so editing it carries **no
same-commit constraint** — plan 04-16's `HOOK_SHIM` edit does, this one does not, and the
constraint was not copied here by pattern-matching.

---

## What was built

### Task 1 — `src/main/hive.ts`, the two fields (`aa07642`)

Both added inside `HiveTask`, matching the three in-file optional-ISO-string precedents
(`HumanQA.askedAt/answeredAt/dismissedAt`, `HiveTask.review.askedAt`). Both optional: every card on
disk today lacks both, and a required field would invalidate the entire existing ledger.

`updatedAt`'s doc comment names the collision out loud — `TaskLedger.updatedAt` is "when tasks.json
was last written", `HiveTask.updatedAt` is "when THIS card last changed" — because a reader who
conflates two facts wearing one name at two nesting levels will simplify one away.

`released` was taken verbatim from the plan's `<interfaces>` block, cross-checked against
04-UI-SPEC § S6b. `branch` and `detail` are optional because write 2 may never land (git failed;
ADR-0003 keeps the work anyway) and **absence is the correct rendering of "not known yet"**, never
a placeholder (rule R-1).

### Task 2 — both writers stamp (`3cbe336`)

**`TASK_CLI` (`src/main/hiveTemplates.ts`), two sites, both inside the CAS:**

- The `add` branch's stamp moved **into** the `mutate()` callback, which is the function the retry
  loop re-runs and the CAS guards. `createdAt` and `updatedAt` are both taken from one clock read
  there, so `updatedAt === createdAt` by construction — a brand-new card reads `0s`, not a
  millisecond of jitter. Side effect, deliberate: `createdAt` is now the time the card actually
  landed rather than the time the process composed it, which is strictly more accurate on a retry.
- The shared `patch | claim | done` branch stamps `merged.updatedAt` inside the same `mutate()`
  callback, after the `--q`/`humanQA` handling and before `next[i] = merged`.

**`HiveManager.writeTasks` (`src/main/hive.ts`), one site:**

Placed in `writeTasks`, not `mutateTasks`. Verified by grep that `mutateTasks` is one of five
callers — `src/main/index.ts:1061` (webhook card creation) and `index.ts:4166`'s `hiveWriteTasks`
bridge, which `src/main/realtimeActions.ts` reaches at `:360`, `:427`, `:446` and `:497` (voice) —
call `writeTasks` **directly**. A stamp one level down would have missed all four voice paths and
the webhook path: precisely the human-touched cards VIGIL-04 exists to surface (T-04-AGE-09).

The stamp is diff-driven against `current`, the ledger the call has already read at the top for its
compare-and-swap — no second read. Both sides are fingerprinted **after** `stripDerivedTaskFields`,
so a transient `tokens`/`pct` value from a `tasks()` row cannot look like a change, and the
fingerprint **excludes the card's own `updatedAt`** — include it and every card differs from its
predecessor on the write after its first stamp, collapsing the diff back into stamping everything
(T-04-AGE-10). A card byte-identical to its previous self keeps its old value.

A comment at each of the three sites points at the others.

**No age is computed or stored anywhere.** Two timestamps, zero elapsed values (D-32).

### Task 3 — nine cases through both writers (`05f14c9`, RED)

Four **separate** named cases per verb, each driving the **real generated `bin/task.cjs`** against
its own isolated temp ledger via the existing `floorWithCli` harness — never one parameterised
loop, which is the shape that stays green with three verbs unstamped and the fourth carrying the
assertion. Each asserts the CLI's stdout **and** the value that reached `tasks.json`.

One new helper, `floorWithLedger(t, cards, rev)`, seeds `tasks.json` **directly**: `writeTasks` now
stamps everything it writes, so a card in the legacy shape (or carrying a known-old stamp that a
firing stamp can be told apart from) can only be put on disk behind the writer's back.

| # | Case | What it pins |
|---|---|---|
| 1 | `bin/task.cjs add stamps updatedAt, exactly equal to createdAt` | string equality, ISO validity, and that it reached disk |
| 2 | `bin/task.cjs patch stamps updatedAt at or after createdAt` | `Date.parse(updatedAt) >= Date.parse(createdAt)` |
| 3 | `bin/task.cjs claim stamps updatedAt at or after createdAt` | same, plus `status: 'doing'` |
| 4 | `bin/task.cjs done stamps updatedAt at or after createdAt` | same, plus `status: 'done'` |
| 5 | `a main-side patchTask (the mutateTasks path) stamps updatedAt too` | the clock moves off a seeded old value |
| 6 | `a direct writeTasks stamps only the card that changed — an unchanged sibling keeps its updatedAt byte-for-byte` | the T-04-AGE-09 path AND the T-04-AGE-10 negative |
| 7 | `a legacy card — createdAt present, updatedAt absent — survives a patch and gains one` | patch succeeds, `createdAt` byte-identical, `updatedAt` now present |
| 8 | `reading the ledger without mutating leaves updatedAt byte-identical` | no stamp on the read path, with its positive lower bound |
| 9 | `a legacy tasks.json round-trips through writeTasks byte-identically` | an unmodified legacy card is not rewritten, and is not given the key as `undefined` |

Case 6 drives `writeTasks` with rows taken straight out of `hive.tasks()` — the exact objects,
derived meter and all, that `index.ts:1061` and `realtimeActions.ts` hand back.

---

## Verification — every gate run live at HEAD `3cbe336`

| Gate | Command | Result |
|---|---|---|
| Plan's own | `node --test test/hive-task-mutation.test.cjs` | **25 tests, 25 pass, 0 fail, 0 skipped** |
| Full suite | `npm test` | **852 tests, 845 pass, 0 fail, 7 skipped, 0 todo** |
| Types | `npm run typecheck` | **0 errors**, both `tsconfig.node.json` and `tsconfig.web.json` |
| Lint | `npm run lint` (`eslint . --max-warnings 0`) | **exit 0** |

### Acceptance-criteria greps, measured

| Criterion | Required | Measured | |
|---|---|---|---|
| `grep -c "updatedAt?: string" src/main/hive.ts` | `1` | **1** | ✅ |
| `grep -c "released?: {" src/main/hive.ts` | `1` | **1** | ✅ |
| `grep -v '^\s*//' src/main/hive.ts \| grep -c "updatedAt"` | ≥ 3 | **8** | ✅ |
| `awk '/^  writeTasks\(tasks: HiveTask\[\]/,/^  \}$/' … \| grep -c 'updatedAt'` | ≥ 2 | **3** | ✅ |
| `awk '/^  private mutateTasks\(/,/^  \}$/' … \| grep -c 'updatedAt'` | `0` | **0** | ✅ |
| `grep -v '^\s*//' src/main/hiveTemplates.ts \| grep -c "updatedAt"` | ≥ 4 | **3** | ⚠️ **see below** |
| four distinct per-verb `test(` declarations | 4 | **4** (`:455`, `:466`, `:476`, `:486`) | ✅ |
| one case name containing `writeTasks` | 1 | **1** (`:507`) | ✅ |
| new cases in the file | ≥ 8 | **9** | ✅ |
| whole-suite skipped count | 7 | **7** | ✅ |

### ⚠️ The one criterion that does not meet its stated number, and why it was not padded

`grep -v '^\s*//' src/main/hiveTemplates.ts | grep -c "updatedAt"` **measures 3, not the ≥ 4 the
plan asked for.** The three are the pre-existing ledger-level stamp inside `write()`, the `add`
branch's card stamp, and the shared verb branch's card stamp.

The criterion's parenthetical is "one per verb", and in `TASK_CLI` `patch`, `claim` and `done` are
**not four branches — they are one**: a single `if (cmd === 'patch' || cmd === 'claim' || cmd ===
'done')` block whose three verbs differ only in how they populate the `patch` object, then converge
on one `merged` card built inside one `mutate()` callback. Reaching 4 would mean writing the same
line three times on one code path, purely to move a grep count. That is the definition of vacuous
compliance, and it would also drag the stamp **outside** the CAS for two of the three verbs (the
per-verb `patch` object is composed before `mutate()` is entered), directly contradicting
T-04-AGE-01.

What the count is proxying for — *every verb is stamped, not just one* — is instead proven
executably and more strongly: **four separate named test cases, each spawning the real generated
`bin/task.cjs` and asserting the value that reached `tasks.json`**, all green, plus the RED run
above showing all four failing before the stamp existed. Restructuring `TASK_CLI` into three
duplicated stamp sites was considered and rejected; the gap is recorded here rather than closed by
padding.

### Diff confinement (D-35)

```
$ git diff 8749a2b -U0 -- src/main/hive.ts | grep -E '^@@'
@@ -153,0 +154,19 @@ export interface HiveTask {
@@ -2247 +2266,35 @@ export class HiveManager {

$ git diff 8749a2b -U0 -- src/main/hiveTemplates.ts | grep -E '^@@'
@@ -96 +96,12 @@ if (cmd === 'add') {
@@ -130,0 +142,6 @@ if (cmd === 'patch' || cmd === 'claim' || cmd === 'done') {
```

Both `hive.ts` hunks land inside the two owned symbols — `HiveTask` and `writeTasks`. Both
`hiveTemplates.ts` hunks land inside `TASK_CLI`; `HOOK_SHIM`, `AGY_HOOK_SHIM`, `GROK_HOOK_SHIM`,
`PI_EXTENSION` and `OPENCODE_PLUGIN` are untouched. `LOG_ROTATE_BYTES`, the ignore seed and
`appendLog` (plan 04-09's) are untouched. `package.json` / `package-lock.json` untouched (D-36) —
three files changed, exactly the plan's `files_modified`.

**Line-number drift, recorded not hidden:** the plan names the owned ranges as `hive.ts:110-152`
and `:2105-2180`. At this base commit `HiveTask` actually spans `:119-153` and `writeTasks` spans
`:2238-2251`. The plan's own acceptance criteria are symbol-bounded `awk` ranges for exactly this
reason (R3 rule 1), and symbol ownership is what was honoured. Both hunks are inside the named
symbols; neither is inside the literal line numbers as written.

---

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — stale assertion against a deliberately widened shape] `patch refuses an unknown card without rewriting the ledger`**

- **Found during:** Task 2 (GREEN run). 24/25 green, this pre-existing case red.
- **Issue:** verbatim failure —
  ```
  AssertionError [ERR_ASSERTION]: a refused patch changed the card that WAS there
    {
      createdAt: '2026-08-15T08:00:00.000Z',
      … 
  +   updatedAt: '2026-08-25T14:22:43.086Z'
    }
  ```
  The test `deepEqual`s the persisted card against a bare `card('existing')` literal. The seeding
  `writeTasks` now stamps that card — which is the feature, not a bug. The source path is correct;
  the assertion was written when cards had no `updatedAt`.
- **Fix:** `updatedAt` was **not** dropped from the assertion. It is real card data (unlike the
  derived meter the same line already destructures away), so it was lifted out and asserted on its
  own terms: byte-identical across a **refused** patch — a strictly stronger statement than the
  shape comparison it came from — plus a `typeof === 'string'` bound so a never-written clock
  cannot satisfy the byte-identity check vacuously. The contract the test exists for (#17: a
  refused patch must not rewrite the ledger) is untouched, and its `rev === 1` assertion still
  stands unmodified.
- **Files modified:** `test/hive-task-mutation.test.cjs`
- **Commit:** `3cbe336` (committed with the source change, so the tree is green at every commit)

**2. [Rule 3 — TDD gate ordering] task 3's tests committed before task 2's implementation**

- **Found during:** planning the commit sequence.
- **Issue:** task 3's `<action>` mandates *"Write it RED first — assert before the stamps land."*
  That is not executable if task 3's commit follows task 2's.
- **Fix:** commit order is task 1 → task 3 (RED, `05f14c9`) → task 2 (GREEN, `3cbe336`). This is
  the `test(...)` → `feat(...)` gate sequence, satisfied in both commits.
- **Files modified:** none beyond the plan's own set.

**3. [Rule 3 — helper placement] `taskFingerprint` declared inside `writeTasks`**

- **Found during:** Task 2.
- **Issue:** the natural home for a card-serialization helper is module scope beside
  `stripDerivedTaskFields` (`hive.ts:186-194`) — which is **outside** both line ranges D-35 assigns
  to this plan, and a drive-by edit there is a stop-and-report.
- **Fix:** declared as a local `const` inside `writeTasks`, the symbol this plan owns. It closes
  over nothing and is re-created per write; writes are rare enough that this is free.
- **Files modified:** `src/main/hive.ts`
- **Commit:** `3cbe336`

### Nothing else

No architectural change was needed (no Rule 4 checkpoint), no authentication gate was hit, no
dependency was added or touched (D-36), no age was computed or stored (D-32), and no test was
weakened to accommodate a source path.

---

## Threat register — dispositions as built

| Threat ID | Disposition | As built |
|---|---|---|
| T-04-AGE-01 | mitigated | Both TASK_CLI stamps are inside the `mutate()` callback the CAS retry loop re-runs; nothing is written unless the CAS succeeds. |
| T-04-AGE-02 | mitigated | Both writers stamp. Case 5 (`patchTask`) and case 6 (direct `writeTasks`) cover the main side; cases 1-4 cover the CLI. Cross-referencing comments at all three sites. |
| T-04-AGE-09 | mitigated | Stamp is in `writeTasks`, asserted absent from `mutateTasks` by a symbol-bounded `awk` (measured `0`). Case 6 drives `writeTasks` directly. |
| T-04-AGE-10 | mitigated | Diff-driven fingerprint, post-`stripDerivedTaskFields`, `updatedAt` excluded. Case 6's unchanged-sibling assertion and case 9's round-trip both fail if it regresses. |
| T-04-AGE-03 | mitigated | Both fields optional; case 7 (legacy patch) and case 9 (legacy round-trip) pin it, the latter with `Object.hasOwn`. |
| T-04-AGE-04 | accepted | Unchanged and out of scope, as planned. Nothing here adds a second sanctioned writer or touches `protectedPathDenial`. |
| T-04-SC | mitigated | Zero packages proposed, zero installed; `package.json` and `package-lock.json` untouched. |

## Known Stubs

None. Every field declared here is either written by this plan (`updatedAt`, both writers) or is a
declared-only interface field whose writer and renderer are explicitly assigned elsewhere
(`released` → plan 04-08 writes, plan 04-12 renders). The latter is the interface-first ordering
the plan exists to establish, not an unwired stub: nothing in this plan or any shipped surface
reads `released` yet, so there is no path that renders an empty value to a user.

## Threat Flags

None. No network endpoint, auth path, file-access pattern or trust-boundary schema change was
introduced. The two new fields are additive optional card data behind the same `tasks.lock` /
`rev` compare-and-swap boundary that already governed every write in both writers.

## Self-Check: PASSED

```
FOUND: src/main/hive.ts
FOUND: src/main/hiveTemplates.ts
FOUND: test/hive-task-mutation.test.cjs
FOUND: aa07642  feat(04-04): declare HiveTask.updatedAt and HiveTask.released
FOUND: 05f14c9  test(04-04): VIGIL-04 RED — no ledger writer stamps a card-level updatedAt
FOUND: 3cbe336  feat(04-04): stamp a card-level updatedAt in BOTH ledger writers
```

## TDD Gate Compliance

RED gate `05f14c9` (`test(04-04): …`) precedes GREEN gate `3cbe336` (`feat(04-04): …`) in
`git log`. No REFACTOR commit — the GREEN implementation needed no cleanup pass, and an empty
refactor commit would be ceremony.
