---
phase: 04-overnight-on-a-repo-that-matters
plan: 08
subsystem: agent-teardown-card-release
tags: [vigil-02, lifecycle, teardown, ledger-write, adr-0003, tdd, interface-widening]
requires:
  - "04-04 — HiveTask.released?: {by, at, branch?, detail?} and the updatedAt stamp in writeTasks"
provides:
  - "teardownPty releases every card the dead agent held, SYNCHRONOUSLY, in the tick the PTY exit was observed — no sweep, no reaper"
  - "released.branch/.detail patched from finalizeAgentWorktree's continuation, reusing the ONE worktreeHasUnintegratedWork call it already made"
  - "AgentTeardownDeps.hive widened with patchTask + tasks() — the two members boot.ts's real HiveManager always carried and the TYPE did not"
  - "finalizeAgentWorktree(id, wtPath, origCwd, baseBranch, deps, releasedCards = []) — deps as its sibling finalizeWorkerWorktree always had, plus the ids write 1 freed"
  - "8 new cases in test/agent-lifecycle.test.cjs, including two mutation-probed negatives"
affects:
  - "04-12 — the renderer reads released.{by,at,branch,detail}; both writers now exist and branch may legitimately be absent forever"
  - "04-09 — owns src/main/git.ts and hive.ts; both untouched here"
  - "04-20 — owns the composition root; boot.ts and deps.ts diffs asserted EMPTY here"
tech-stack:
  added: []
  patterns:
    - "release first, enrich later: the write that must never be lost lives OUTSIDE the git try/catch; the one that may be lost lives inside it"
    - "absence as the representation of 'not known yet' — no sentinel, so `undefined` is asserted strictly rather than falsily"
    - "widen the injected interface, not the composition root: the runtime object already carried the members, only the TYPE was narrow"
    - "narrow a deliberately-`unknown` reader structurally at the read site rather than importing the owning module's type"
    - "a negative assertion carries a positive lower bound in the same case, and the bound is mutation-probed rather than asserted by inspection"
key-files:
  created: []
  modified:
    - src/main/floor/lifecycle.ts
    - test/agent-lifecycle.test.cjs
decisions:
  - "D-27 satisfied structurally, not by timing: the release is a synchronous call on the line after setArchived, and a source-fact case extracts the window between setArchived and the void-fired finalizer and asserts it contains `released` and contains NO `await`. The behavioural case that proves same-tick release is deliberately a NON-async test function, so it cannot yield even by accident."
  - "L-09 option (a) taken as the plan directed. Write 2 sits inside finalizeAgentWorktree's existing try, whose catch swallows and logs — correct for losing a branch label, catastrophic for losing a release. Proven by the forced-git-failure case, which asserts the release survives AND that git was actually reached (reachedGit === 1) so the survival is measured, not vacuous."
  - "Write 2 addresses cards by the exact ids write 1 released, passed down as a 6th (defaulted) parameter, rather than re-scanning the ledger for `released.by === agentId`. Agent ids are REUSED (the same #14 fact that makes setArchived necessary), so a re-scan would let this teardown stamp its branch onto a card released by a PREVIOUS life of the same id. The ids are unambiguous; the re-scan is not."
  - "The write-2 no-op guard is a state predicate (still `todo`, still unassigned, still no branch) rather than a flag. A human who dragged the freed card back to `doing` or an agent who claimed it fails the predicate automatically, so T-04-CARD-04 falls out of the read instead of needing a second mechanism."
  - "Two acceptance-criterion greps initially measured 1 and 4 instead of 0 and 3 — both because a DOC COMMENT of mine named `tasks.json` and `worktreeHasUnintegratedWork`. The criteria were not relaxed; the comments were reworded to say the same thing without the literal token, so each gate keeps counting call/import sites as it claims to."
  - "AgentTeardownDeps.hive.patchTask is declared with its patch parameter spelled out to the three keys these writes use, exactly as the plan warned. `Record<string, unknown>` does not typecheck: the parameter is contravariant under strictFunctionTypes and `unknown` is not assignable to HiveTask['status']'s union."
  - "Neither write stamps updatedAt (D-30): plan 04-04 moved that into writeTasks, which patchTask routes through, so both writes are stamped for free."
metrics:
  duration: ~55m
  completed: 2026-08-25
---

# Phase 04 Plan 08: VIGIL-02 — The Dead Agent's Card Goes Back on the Board Summary

A card whose owner's PTY exits is now released back to `todo` **in the same tick the exit was
observed** — assignee cleared, `released: {by, at}` naming who dropped it — and gains
`released.branch` / `.detail` a git-shell later from the one `worktreeHasUnintegratedWork` call
`finalizeAgentWorktree` was already making. The two halves are deliberately split across the git
`try`: ADR-0003's bias says a git failure may cost the branch label and must never cost the release.

**Commits:** `72f327c` (RED gate) · `8c041f9` (task 1, write 1 + the interface widening) ·
`399c8c2` (task 2, write 2).

## Task ordering: RED before GREEN, deliberately

Tasks 1 and 2 are both `tdd="true"` and task 3 is the test task, so the executable order is
task 3 (RED) → task 1 (GREEN, write 1) → task 2 (GREEN, write 2). This is the gate sequence the
plan mandates, not a reordering of the work — the same shape plan 04-04 used.

## The RED run, verbatim

`node --test test/agent-lifecycle.test.cjs` at `72f327c`, before one line of `lifecycle.ts` changed
(ANSI stripped, pre-existing cases elided):

```
✔ finalizeWorkerWorktree PRESERVES a worker worktree holding unintegrated work (374.0195ms)
... 11 more pre-existing cases, all ✔ ...
✖ VIGIL-02: teardownPty releases the dead agent's in-flight card in the SAME TICK, naming who dropped it (1.8519ms)
✔ VIGIL-02: an agent holding no card writes NOTHING to the ledger (0.3124ms)
✔ VIGIL-02: a ledger write failure is logged, not fatal — the rest of teardown still runs (0.6253ms)
✖ VIGIL-02: the released card gains branch and detail from the ONE git call that already ran (366.6291ms)
✖ VIGIL-02: a forced git failure costs the branch enrichment and NEVER the release (305.0923ms)
✖ VIGIL-02: a card held by a DIFFERENT agent is byte-identical across both writes (20343.3433ms)
✖ VIGIL-02: a card re-taken between the two writes is NOT re-stamped by the dead agent's continuation (322.6312ms)
✖ VIGIL-02: the release is written between setArchived and the void-fired worktree finalizer, with no await in between (0.8954ms)
```

Representative failure messages from that run:

```
✖ VIGIL-02: teardownPty releases the dead agent's in-flight card in the SAME TICK
  AssertionError: the dead agent's card still reads as in progress — the VIGIL-02 failure verbatim
    + actual - expected
    + 'doing'
    - 'todo'

✖ VIGIL-02: a card held by a DIFFERENT agent is byte-identical across both writes (20343.3433ms)
  AssertionError: write 2 never ran, so this case proves nothing about it

✖ VIGIL-02: the release is written between setArchived and the void-fired worktree finalizer
  AssertionError: nothing between setArchived and the worktree finalizer releases the card —
  VIGIL-02's write 1 is missing or misplaced
```

**Two of the eight passed at RED, and that is reported rather than hidden.** Both are negative
cases (*"an agent holding no card writes NOTHING"*, *"a ledger write failure is not fatal"*) which
are trivially true when no ledger write exists at all. A green-at-RED negative proves nothing, so
each was **mutation-probed against the finished implementation** — see below — rather than being
accepted on the strength of its name.

## Intermediate run after task 1 (write 1 only)

5 of 8 green, `fail 3`. The three still red were exactly write 2's: the branch enrichment, the
neighbour byte-identity (whose positive bound requires write 2 to have run) and the re-taken-card
no-op. Write 1's own cases went green with no change to any of them.

## Mutation probes — the two green-at-RED negatives are real gates

Neither probe was left in the tree; both were reverted with
`git checkout -- src/main/floor/lifecycle.ts` and the working tree confirmed clean afterwards.

| Probe | Mutation | Result |
|---|---|---|
| A | `releaseCardsHeldBy`'s `catch` rethrows instead of logging | `✖ VIGIL-02: a ledger write failure is logged, not fatal` — `pass 19 / fail 1` |
| B | write 1's ownership guard reduced to `if (!card?.id) continue` | `✖ ... an agent holding no card writes NOTHING to the ledger` **and** `✖ ... a card held by a DIFFERENT agent is byte-identical` — `pass 18 / fail 2` |

Probe B is the more useful of the two: it shows the no-card case and the neighbour case fail for
*different reasons* under the same mutation, so neither is a restatement of the other.

## Acceptance criteria, measured

Task 1:

| Criterion | Measured |
|---|---|
| `released` written strictly between `setArchived` and the `void`-fired finalizer | `setArchived` at `:321`, release at `:326`, finalizer at `:341` — and asserted executably, not just by grep |
| no `await` between them | zero, asserted over the extracted window with a non-empty-window bound beside it |
| `grep -c "tasks.json" lifecycle.ts` | `0` |
| `grep -cE "from '\.\./hive'\|require\('\.\./hive'\)"` | `0` — including type-only; `ReleasableCard` is structural |
| `AgentTeardownDeps` extract: `patchTask` / `tasks:` / `stopProxyBridge` | `1 / 1 / 1` over a 91-line extract — **`0 / 0 / 1` over the 69-line extract at base `99b61fc`**, so the pair is falsifiable in both directions and the extraction is provably non-empty |
| `git diff --stat src/main/floor/boot.ts src/main/floor/deps.ts` | **empty** |
| no sentinel in `released.branch` | none written; the tests assert `=== undefined`, strictly |
| `npm run typecheck` | 0 errors |

Task 2:

| Criterion | Measured |
|---|---|
| `grep -c 'worktreeHasUnintegratedWork'` | `3` — identical to base `99b61fc`. Not "fixed" to 1; the worker path's call is untouched |
| same symbol inside `finalizeAgentWorktree` (awk symbol-bounded) | `1` — the branch patch reuses that one result, no second git shell |
| signature widened (`grep -A3` on the declaration) | `1` |
| `grep -c 'finalizeAgentWorktree('` | `2` — declaration and its one call site; no third caller |
| branch patch inside the `try`, after the git call, before the `catch` | line 6 = `await worktreeHasUnintegratedWork`, line 13 = `patchReleasedBranch`, line 24 = `} catch` within the function extract |
| forced git failure keeps `by`/`at`, adds no branch | asserted, with `reachedGit === 1` as the positive bound |
| card changed between the writes is not overwritten | asserted, with a second untouched card as the witness that write 2 ran |
| `npm run typecheck` | 0 errors |

Task 3:

| Criterion | Measured |
|---|---|
| `node --test test/agent-lifecycle.test.cjs` exits 0 with ≥ 5 new cases | **8** new cases, `tests 20 / pass 20 / fail 0` |
| synchronicity case contains no `await` between teardown and assertion | the case is a **non-async function** — it cannot yield even by accident |
| git-failure case asserts `=== undefined` strictly | yes, `assert.equal(..., undefined)`, not a falsy check |
| no-card case asserts writer call count is exactly `0` | yes, plus `hiveSetArchived` as the positive bound that the teardown ran |
| RED run recorded verbatim | above |
| whole-suite skipped count unchanged | `7` → `7` |

## Wave gate

| Gate | Base `99b61fc` | Now |
|---|---|---|
| `npm test` | tests 885 / pass 878 / **fail 0** / skipped 7 | tests **893** / pass **886** / **fail 0** / skipped **7** |
| `npm run typecheck` | — | 0 errors (node + web) |
| `npm run lint` | — | exit 0, `--max-warnings 0` |
| `git diff --stat` | — | `src/main/floor/lifecycle.ts` + `test/agent-lifecycle.test.cjs` only; `boot.ts` and `deps.ts` **empty** |

`+8` tests, `+8` passing, skipped unchanged — the delta is exactly this plan's new cases and nothing
regressed.

## Success criteria, against the plan's own wording

- **"A dead agent's card is on the board, naming who dropped it, in the same tick as the teardown."**
  Yes — behaviourally (a non-async test observes `status: 'todo'`, `assignee: undefined`,
  `released.by`) and structurally (no `await` in the window).
- **"The branch arrives from the git call that already ran, as a patch, and its failure costs the
  enrichment and never the release."** Yes — one `worktreeHasUnintegratedWork` call inside
  `finalizeAgentWorktree`, patched not rewritten, and the forced-failure case proves the release
  outlives it.
- **"No placeholder is ever written for `branch`."** Yes — `released.branch` is written only from a
  real `work.branch`, and both the write-1 case and the git-failure case assert `=== undefined`.
- **"The SUMMARY states the RED run, the test-count delta, and confirms that no composition-root
  line was touched."** Above; and `git diff --stat src/main/floor/boot.ts src/main/floor/deps.ts`
  is empty — `deps.hive` was already the real `HiveManager` at runtime, and
  `finalizeAgentWorktree`'s widening stayed inside `lifecycle.ts` because its only caller is nine
  lines below it.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Gate integrity] Two acceptance-criterion greps were inflated by my own doc comments**

- **Found during:** task 1 (`tasks.json`) and task 2 (`worktreeHasUnintegratedWork`).
- **Issue:** `grep -c "tasks.json" src/main/floor/lifecycle.ts` measured `1` against a required `0`,
  and `grep -c 'worktreeHasUnintegratedWork'` measured `4` against a required `3`. In both cases the
  extra hit was a **doc comment I had just written**, not a call site — the code was correct and the
  gate was reading a comment.
- **Fix:** the comments were reworded to say the same thing without the literal token ("a hand-rolled
  whole-ledger rewrite", "the unintegrated-work check in `../git`"). The criteria themselves were
  **not** relaxed, and both now measure exactly what they claim to count. Re-measured: `0` and `3`,
  the latter identical to base `99b61fc`.
- **Files modified:** `src/main/floor/lifecycle.ts`
- **Commits:** `8c041f9`, `399c8c2`

### Deliberate departures from the plan's letter

**1. `finalizeAgentWorktree` gained a SIXTH parameter, not only the fifth the plan named.**

The plan says *"Add `deps: AgentTeardownDeps` as a fifth parameter"* and is silent on how write 2
finds the cards write 1 released. It cannot re-derive them: `finalizeAgentWorktree` receives the
**ptyId**, and `teardownPty` has already deleted the `ptyToAgent` entry that maps it to an agent id.
The signature is therefore `(id, wtPath, origCwd, baseBranch, deps, releasedCards: string[] = [])`.

The alternative — re-scanning the ledger for `released.by === agentId` — was rejected on a repo fact,
not on taste: **agent ids are REUSED** (the same `#14` fact whose comment sits three lines above the
insertion point and is the entire reason `setArchived` exists). A re-scan would let this teardown
stamp its branch onto a card released by a *previous* life of the same id.

The parameter is defaulted, so every pre-existing caller and every pre-VIGIL-02 test is unchanged.
All four criteria that measure this signature still pass (`finalizeAgentWorktree(` count `2`,
`AgentTeardownDeps` in the `-A3` window `1`).

**2. Eight test cases, not five.** The plan's floor is five and names five behaviours. Three of the
extra cases are the ledger-write-failure path (task 1's own fourth behaviour bullet, which the task-3
list omits), the re-taken-card no-op (task 2's criterion, likewise not in task 3's list) and the
source-fact no-`await` case that carries D-27 structurally. None is a duplicate.

## Authentication gates

None. No credential, network call or login was involved at any point in this plan.

## Known Stubs

None. Both writes are wired to real data end to end: write 1 reads `deps.hive.tasks()` and writes
through `deps.hive.patchTask`, both of which are the real `HiveManager`'s methods at runtime
(`boot.ts:257` passes the instance by shorthand); write 2's branch and detail come from a real
`git` shell, exercised against a real repo and a real worktree in the tests.

`released.branch` being absent is **not** a stub — it is the specified representation of "not known
yet", and rule R-1 forbids filling it with anything.

## Threat Flags

None. This plan adds no network endpoint, no auth path, no new file access pattern and no schema
change at a trust boundary. Both new writes cross the one boundary the plan's own threat model
already registers (`main (teardownPty) → the task ledger`) and do so through the
compare-and-swap mutator that register names as the mitigation:

- **T-04-CARD-01** (card in-progress forever) — mitigated: synchronous release, asserted with no
  intervening `await`.
- **T-04-CARD-02** (direct ledger rewrite racing `bin/task.cjs`) — mitigated: both writes route
  through `deps.hive.patchTask`; the module names no ledger file and imports no ledger module,
  both asserted at `0`.
- **T-04-CARD-03** (git failure swallowing the release) — mitigated: write 1 is outside the git
  `try`; proven by the forced-failure case with a positive bound.
- **T-04-CARD-04** (dead agent's continuation re-stamping a re-assigned card) — mitigated: write 2's
  state predicate; asserted with a witness card proving write 2 ran.
- **T-04-CARD-05** (placeholder branch) — mitigated: nothing is written for `branch` until it is
  real; asserted `=== undefined`, strictly.
- **T-04-CARD-07 / T-04-CARD-11** (out-of-scope edits; the runtime-vs-type gap the plan predicted) —
  mitigated: the widening stayed inside `lifecycle.ts` and `boot.ts`/`deps.ts` diffs are empty. The
  plan's prediction was exactly right: the base extract measured `patchTask 0 / tasks: 0`.
- **T-04-SC** (package installs) — none; `package.json` and `package-lock.json` untouched (D-36).

## Residual risk, stated rather than buried

Write 2 reads the ledger, filters, then patches — so there is a sub-millisecond window between the
read and the `patchTask` in which another writer could take the card. Losing that race costs a
branch *label* on a card already safely back on the board, and `patchTask`'s own `expectedRev`
compare-and-swap still prevents the write from clobbering anything. This is the same window every
main-side card mutation in this codebase has, and closing it needs the `tasks.lock` upgrade path
`hive.ts`'s `mutateTasks` already documents for itself. Not opened here, and not claimed as closed.
