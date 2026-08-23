---
phase: 01-finish-the-floor
plan: 03
subsystem: hive-review-sweep
tags: [verdict-02, verdict-03, floor-08, review, obligation-set, anti-storm]
requires:
  - "01-01 (Electron 43 runtime + the load-ts loader the tests run on)"
provides:
  - "HiveManager.owesReview — a process-local obligation Set that survives 'no reviewer free'"
  - "a mint rule that no longer requires the card to have existed in the previous snapshot"
  - "applyReviewVerdict refuse → re-mint, so a refused-then-fixed card is reviewable again"
  - "a per-sweep prune of owesReview against the live board (T-P03-05)"
  - "T-P03-07 named in source: the sweep is a 60 s poll and says so"
  - "five named tests, three of them RED-proved against pre-fix source"
affects:
  - "01-11 (wave 5) — reads flushCommit/untrackIgnored/gitAsync far below the edited region; hive.ts grew +91 lines, so re-derive anchors by content match"
  - "01-23 (wave 9) — owns the FLOOR-08 / VERDICT-02 / VERDICT-03 checkboxes and the phase gate"
  - "whoever takes #18 clauses 3, 4 and 5 — still OPEN, evidenced in the issue comment"
tech-stack:
  added: []
  patterns:
    - "obligation Set minted by an observed transition, cleared only by a completed side effect"
    - "process-local obligation, never rebuilt from persisted state at boot (the rebuild IS the storm)"
    - "prune the obligation against the live snapshot every tick instead of persisting it"
    - "a preserved-invariant test proven able to fail, not merely observed passing"
key-files:
  created: []
  modified:
    - src/main/hive.ts
    - test/hive-protocol-v2.test.cjs
    - .planning/REQUIREMENTS.md
decisions:
  - "Mint from the card's DURABLE state (previous.get(id) !== 'done'), not from snapshot membership — deleting the membership clause is the whole of defect 2's fix and needs no second minting path"
  - "NO startup rebuild of owesReview from the persisted board, against 01-RESEARCH's recommendation: the rebuild is the boot review-storm, proven RED here (3 !== 0)"
  - "Express the review guard as 'has an OPEN review' (review && review.ok === undefined), not 'has ever had a review object' — that is what makes refuse→redo reviewable without weakening the storm guard"
  - "Issue #18 NOT closed: 3 of its 7 Fix clauses are unmet. Plan success criterion 5 said close it; D-42 and PROJECT.md say do not. Root-cause option taken."
  - "REQUIREMENTS.md VERDICT-03 cites hive.ts:1786 (current) and records the old :1746 as drifted — citing a stale line would be the same class of false claim this phase exists to delete"
metrics:
  duration: ~1h05m
  completed: 2026-08-21
---

# Phase 01 Plan 03: The Review Sweep Loses No Card Summary

Replaced `sweepTaskReviews`'s snapshot diffing with an `owesReview` obligation set and deleted the
snapshot-membership guard, closing three mechanisms that lost reviews silently — a busy floor, a card
born and finished inside one 60 s window, and a refusal — without trading any of them for the boot
review-storm the file's own comment forbids, and corrected the two comments in that region that
claimed more than the code delivered.

**Issue #18 is NOT closed.** Its reviewer clause is; three of its seven Fix clauses are not. See
"Deviations" — this is the plan's one unsatisfied success criterion and it is deliberate.

---

## Task 1 — evidence (no files, no commit)

Task 1 is `<files>(none — evidence only)</files>`, so it produced no commit. Everything below was
measured at `ad42dc4` before any edit.

### Acceptance text, verbatim

Issue **#18** (`gh issue view 18`), Fix list:

> - A reply-deadline sweep in the heartbeat beat: re-deliver once, then bounce to god as `[unanswered]`
> - An `undeliverable` log kind (shared with #6)
> - Document `spawn-requests` in `PROTOCOL.md` / `COMMANDS.md`
> - Change the work-order string to *"write your reply as JSON into `$AGENT_DIR/outbox/`"*
> - Wire or delete `enrichTaskPrompt`
> - A reviewer step on card→done: mail the least-loaded idle non-assignee a `query`; refuse sends it back to `doing`
> - One `integrate <agentId>` IPC/helper that merges `agent/<id>` and mails god the conflict list

`.planning/REQUIREMENTS.md` (pre-edit text):

> **VERDICT-02**: No card reaches `done` unreviewed because nobody happened to be free at
> that instant — a card that flips to done while every other agent is busy is still
> reviewed later — **prerequisite of FLOOR-08**
>
> **VERDICT-03**: A reviewer that cannot receive mail is never selected as a reviewer, so
> on a mixed-engine floor a review is not routed into a black hole *(filter on
> `canReceiveInbox`)* — **prerequisite of FLOOR-08**

`.planning/REQUIREMENTS.md` **FLOOR-08**:

> **FLOOR-08**: "Done" is verified by someone other than the agent that claimed it, and
> an unanswered `requires_reply` is chased rather than forgotten — #18

### VERDICT-03 — ALREADY SATISFIED, verify-and-pin, not implement

```
$ grep -n "canReceiveInbox" src/main/hive.ts
34:  canReceiveInbox,
1394:   *  guards all pass for an unknown id (canReceiveInbox(undefined) falls back to
1451:          && canReceiveInbox(reg.agents[a]?.provider))
1474:      if (t !== godId && !canReceiveInbox(reg.agents[t]?.provider)) {
1746:        && !a?.isGod && a?.status === 'idle' && canReceiveInbox(a?.provider))
```

`:1746` is the `leastLoadedIdle` filter — the reviewer-selection half. `:1451` and `:1474` are the
routing-side halves. All three present at baseline. **Not implemented; pinned by test 4.**

### Defect 2 — the missed transition

```
$ grep -n "previous.has\|lastTaskStatus\|SWEEP_INTERVAL_MS" src/main/hive.ts
238:const SWEEP_INTERVAL_MS = 60_000;
1581:      // deadline. Self-throttled to SWEEP_INTERVAL_MS.
1736:  private lastTaskStatus: Map<string, string> | null = null;
1765:    const previous = this.lastTaskStatus;
1766:    this.lastTaskStatus = seen;
1772:      if (previous.get(task.id) === 'done' || !previous.has(task.id)) continue;
1809:  /** Run both protocol sweeps. Throttled to SWEEP_INTERVAL_MS so the 1.5 s router
1813:    if (now - this.lastSweep < SWEEP_INTERVAL_MS) return;

$ grep -c "previous.has" src/main/hive.ts
1
```

Non-empty on `previous.has`, and the count is `1` — the plan's stated baseline, so the guard had not
moved. Recorded, as the plan demands:

- (a) the `!previous.has(task.id)` guard sat on **`:1772`**, verbatim
  `      if (previous.get(task.id) === 'done' || !previous.has(task.id)) continue;`
- (b) `this.lastTaskStatus = seen` sat on **`:1766`** — above the loop
- (c) `SWEEP_INTERVAL_MS = 60_000` at **`:238`**, throttled in `sweep()` at **`:1813`**

**Why those three facts together drop a card permanently:** the sweep only runs once a minute and
only ever compares two snapshots, so a card created and flipped to `done` between two ticks is never
observed in a non-done state by ANY snapshot — `previous.has(id)` is therefore false on every future
sweep, the loop `continue`s before a reviewer is even looked up, no obligation is ever minted for the
card, and no retry mechanism can recover a review that was never scheduled.

### Per-clause classification

| Clause | Verdict at `ad42dc4` | Evidence |
|---|---|---|
| FLOOR-08 — "done" verified by someone else | **OPEN** — code existed but lost reviews three ways | `hive.ts:1766` above the loop; `:1772`; `:1771`'s `task.review` |
| FLOOR-08 — unanswered `requires_reply` is chased | **ALREADY SATISFIED** | `sweepUnansweredReplies` at `hive.ts:1694`, driven at `:1814`, pinned by `test/hive-protocol-v2.test.cjs:148` and `:173` |
| VERDICT-02 — consumed transition edge (defect 1) | **OPEN** | `if (!reviewer) continue` at `:1774` after `:1766` |
| VERDICT-02 — missed transition (defect 2) | **OPEN** | `:1772` quoted verbatim above |
| VERDICT-02 — refusal is terminal (defect 3) | **OPEN** | `:1771`'s `\|\| task.review`; `applyReviewVerdict` leaves `review` set |
| VERDICT-03 — reviewer must be able to receive mail | **ALREADY SATISFIED** | `hive.ts:1746` |

### The `requires_reply` chase — SHIPS, nothing built

```
$ grep -n "requires_reply" src/main/delivery.ts
(no output — delivery.ts exists and contains none)

$ grep -n "sweepUnansweredReplies" src/main/hive.ts
1694:  sweepUnansweredReplies(now = Date.now()): number {
1814:    try { this.sweepUnansweredReplies(now); } catch (e) { console.error('[hive] reply sweep failed:', e); }
```

`REPLY_DEADLINE_MS = 15 * 60_000` (`:236`), obligations persisted in `pending-replies.json`
(`pendingPath()` `:1623`), opened/closed in `trackReplies` (`:1647`), first expiry re-delivers and
the second bounces to god as `[unanswered]`. Already pinned by two named tests
(`test/hive-protocol-v2.test.cjs:148`, `:173`). **Not in scope for task 2 — nothing was built.**

### Comment audit — both classified

```
$ grep -n "mass-reviewed at boot" src/main/hive.ts
1732:   *  mass-reviewed at boot — only a card that reaches 'done' while we are watching

$ grep -n "hand-edits tasks.json" src/main/hive.ts
1760:   * catches every writer including a god that hand-edits tasks.json.
```

Each returned exactly `1` line, as measured by the plan.

**`hive.ts:1730-1735` (`lastTaskStatus`) — TRUE.** Verbatim:

> `/** Card statuses as of the previous review sweep. Seeded (acting on nothing) on`
> `*  the first sweep so a ledger full of historic 'done' cards is never`
> `*  mass-reviewed at boot — only a card that reaches 'done' while we are watching`
> `*  gets a reviewer. A restart re-seeds; a card finished while the app was closed`
> `*  is not reviewed, which is the right trade against mailing the floor a hundred`
> `*  stale queries. */`

Two different guards deliver it on two different sweeps: `if (!previous) return 0;` (`:1767`)
suppresses **sweep 1 only**, and `previous.get(task.id) === 'done'` (`:1772`) is what keeps
**sweep 2 onward** quiet against the seeded backlog. **Recorded explicitly: a startup rebuild of any
obligation set from the persisted board would make this comment FALSE on the second sweep** — sweep 1
returns 0 at the seed guard, sweep 2 mints nothing new, but a rebuilt set already holds every historic
card, so the obligation guard passes and one `query` is mailed per historic card. That is why task 2
forbids one. Proven, not asserted — see the counter-run under task 3.

**`hive.ts:1755-1760` (`sweepTaskReviews`) — OVERCLAIM.** Verbatim:

> `* Detects the transition from the LEDGER rather than from writeTasks, so it`
> `* catches every writer including a god that hand-edits tasks.json.`

The half about reading the LEDGER is true — no writer is privileged. The claim that it therefore
*catches every writer* does not survive the **intra-window re-completion case**: a card `done` at
sweep N, reopened outside `applyReviewVerdict` (a god editing `tasks.json` by hand), and `done` again
before sweep N+1 presents identical durable state at both observations. `SWEEP_INTERVAL_MS = 60_000`
means the observation gap is a minute wide. The comment as written does **not** survive it, whoever
did the writing — the ceiling is the poll, not the writer's privilege.

### Baseline TAP — B-hpv2

```
$ TAP=$(mktemp); node --test --test-reporter=tap test/hive-protocol-v2.test.cjs > "$TAP"; echo "EXIT=$?"; grep -E "^# (tests|pass|fail|skipped|todo) " "$TAP"; rm -f "$TAP"
EXIT=0
# tests 12
# pass 12
# fail 0
# skipped 0
# todo 0
```

**B-hpv2 = 12.** Matches the plan's stated baseline exactly. Written to `mktemp`, never into the repo.

Full-suite baseline, same session, before any edit: `ℹ tests 433 / pass 429 / fail 0 / skipped 4 /
todo 0`, `FULL_EXIT=0` — which matches the orchestrator's independently-measured figure, so there is
no "pre-existing Windows failures" allowance in play and every red below is a real signal.

---

## Task 2 — the obligation set (`1ddabbc`)

`src/main/hive.ts` only.

### What landed

- `private owesReview = new Set<string>()` beside `lastTaskStatus`, documented as an obligation set
  rather than a second status field: the transition MINTS, only a successful `send` **and**
  `patchTask` clears.
- First guard dropped to `if (task.status !== 'done' || !task.assignee) continue;`.
- The `task.review` guard re-expressed as **"already has an OPEN review"**:
  `if (task.review && task.review.ok === undefined) continue;` — a refusal leaves `ok: false`, which
  is history, not an open review. This is what makes defect 3 fixable without weakening the storm guard.
- Mint: `if (previous.get(task.id) !== 'done') this.owesReview.add(task.id);`
- **`!previous.has(task.id)` deleted outright**, not carried into the mint in any form.
  `previous.get(missingId)` is `undefined`, which is `!== 'done'`, so the absent-from-snapshot case
  mints with no extra branch and no second minting path was added.
- `if (!this.owesReview.has(task.id)) continue;` — the sweep now iterates the obligation, not only
  fresh transitions.
- `if (!reviewer) continue;` deletes nothing; the obligation survives.
- `this.owesReview.delete(task.id)` moved **after** both the `send` and the `patchTask`.
- Per-sweep prune (T-P03-05), placed deliberately **above** the first-sweep return so an obligation
  re-added by a refuse cannot outlive its card:
  `for (const id of this.owesReview) if (!seen.has(id)) this.owesReview.delete(id);`
- `applyReviewVerdict`: `if (!ok) this.owesReview.add(taskId);` on the refuse branch. `task.review`
  is **not** deleted — the refusal record is history.

### Acceptance criteria, measured

| Criterion | Required | Measured |
|---|---|---|
| `grep -c "owesReview" src/main/hive.ts` | ≥ 4 | **8** |
| `grep -c "previous.has" src/main/hive.ts` | `0` (baseline `1`) | **0** |
| `grep -cF "previous.get(task.id) !== 'done'" src/main/hive.ts` | ≥ 1 (baseline `0`) | **1** |
| `grep -c "mass-reviewed at boot" src/main/hive.ts` | `1` (baseline `1`) | **1** |
| `grep -c "hand-edits tasks.json" src/main/hive.ts` | `0` (baseline `1`) | **0** |
| `npm run typecheck` | exit `0` | **`TYPECHECK_EXIT=0`** |

TAP after task 2, before any new test existed:

```
EXIT=0
# tests 12
# pass 12
# fail 0
# skipped 0
# todo 0
```

`# pass` ≥ B-hpv2, `# fail 0`, `# skipped 0` — in particular the two storm-guard tests at `:220` and
`:233` still pass, so no review storm was introduced by the rewrite itself.

### No startup rebuild — annotated grep

Every `owesReview` site with its enclosing member, derived programmatically:

```
1744  [comment] in lastTaskStatus doc | *  `owesReview` shares this lifetime deliberately. It is process-local and is
1768  [WRITE  ] field initializer     | private owesReview = new Set<string>();
1779  [comment] in leastLoadedIdle doc| *  true now, and true ONLY because `owesReview` holds the obligation across
1819  [WRITE  ] in sweepTaskReviews   | for (const id of this.owesReview) if (!seen.has(id)) this.owesReview.delete(id);
1850  [WRITE  ] in sweepTaskReviews   | if (previous.get(task.id) !== 'done') this.owesReview.add(task.id);
1851  [READ   ] in sweepTaskReviews   | if (!this.owesReview.has(task.id)) continue;
1871  [WRITE  ] in sweepTaskReviews   | this.owesReview.delete(task.id);
1896  [WRITE  ] in applyReviewVerdict | if (!ok) this.owesReview.add(taskId);
```

Every runtime write is inside `sweepTaskReviews` or `applyReviewVerdict`. The only other write is the
field initializer, which creates an **empty** set. Nothing in a constructor, an `init`/`start` path, or
any method that reads the ledger at boot — the constructor is verbatim unchanged:

```
  constructor(
    private getHome: () => string | null,
    private emit?: (channel: string, payload: unknown) => boolean | void
  ) {}
```

### VERDICT-03 untouched

```
$ grep -n "canReceiveInbox" src/main/hive.ts
34:  canReceiveInbox,
1394:   *  guards all pass for an unknown id (canReceiveInbox(undefined) falls back to
1451:          && canReceiveInbox(reg.agents[a]?.provider))
1474:      if (t !== godId && !canReceiveInbox(reg.agents[t]?.provider)) {
1771:   *  (the assignee) and god. `canReceiveInbox` is the VERDICT-03 filter: a
1786:        && !a?.isGod && a?.status === 'idle' && canReceiveInbox(a?.provider))
```

The filter is still in `leastLoadedIdle`, moved only by the comment delta (`:1746` → `:1786`). The new
`:1771` hit is the doc comment naming it.

### Net line delta on `src/main/hive.ts`

`3570` → `3661` lines. **Net +91.** Deleting `:1772` and adding the field, the prune and six explanatory
comment blocks shifted every anchor below the edit region down by roughly that much. Current anchors:

| Member | Was | Now |
|---|---|---|
| `private lastTaskStatus` | `:1736` | `:1752` |
| `private owesReview` | — | `:1768` |
| `private leastLoadedIdle` | `:1741` | `:1781` |
| `sweepTaskReviews()` | `:1762` | `:1812` |
| `private applyReviewVerdict` | `:1795` | `:1879` |

Plan 11 (wave 5) reads `flushCommit`, `untrackIgnored` and `gitAsync` far below this point — they moved
by +91 too. As the plan states, line numbers are informational pointers; re-derive by content match.

`src/main/index.ts`, `src/main/hooks.ts` and the cost-ledger region of `hive.ts` (`COST_TAIL_BYTES`,
`appendCostLedger`, `taskSpend`) were **not touched** — `git diff --stat` for this plan shows exactly
three files.

---

## Task 3 — five tests + the REQUIREMENTS correction (`b09fd74`)

`test/hive-protocol-v2.test.cjs` (+123 lines, 12 → 17 tests), `.planning/REQUIREMENTS.md`.

Added under a section banner citing #18, flat `test(...)`, `t.after` cleanup via the existing
`floor(t)` harness, no `describe`/`beforeEach`, no fixtures, and every assertion message says what a
failure would MEAN.

### RED against pre-fix source — the whole transcript

Path-scoped, with the baseline SHA bound in the same command so `$BASE` is never unbound:

```
$ BASE=$(git rev-parse HEAD~1); echo "BASE=$BASE"; git checkout "$BASE" -- src/main/hive.ts
BASE=ad42dc437915a359468de8b2940080e14eaa9402
$ grep -c "previous.has" src/main/hive.ts     # pre-fix source confirmed restored
1
$ grep -c "owesReview" src/main/hive.ts
0
$ node --test test/hive-protocol-v2.test.cjs
✖ a card that flips to done while every other agent is busy is reviewed on a later sweep (122.4053ms)
✖ a card created AND finished inside one sweep window is still reviewed (189.9156ms)
✖ a card refused by its reviewer and then re-done is reviewed again (235.2405ms)
✔ a reviewer whose engine cannot receive mail is never selected (122.0402ms)
✔ a restart against a board full of historic done cards mails nothing, on the first sweep or the second (152.3485ms)
ℹ tests 17
ℹ pass 14
ℹ fail 3
ℹ skipped 0
PRE_FIX_EXIT=1
```

`BASE=` non-empty, `EXIT` non-zero, test 2 among the failures. The stash/checkout was scoped to that
one path, so no wave-mate's working tree was touched (`use_worktrees: false`).

**Test 1 — VERDICT-02 retry (RED, behavioural):**

```
AssertionError [ERR_ASSERTION]: a 0 here means the busy sweep CONSUMED the done transition — the card
is now never reviewed again, silently, which is the whole of VERDICT-02 (#18)

  0 !== 1
  actual: 0, expected: 1, operator: 'strictEqual'
  at test\hive-protocol-v2.test.cjs:278:10
```

**Test 2 — intra-window create-and-finish (RED, behavioural). This is the one that proves the
obligation set ALONE would not have been enough:**

```
AssertionError [ERR_ASSERTION]: a 0 here means the sweep still requires the card to have existed in
the PREVIOUS snapshot, so a fast card is dropped permanently — no obligation is ever minted for it
and no retry can recover it (#18)

  0 !== 1
  actual: 0, expected: 1, operator: 'strictEqual'
  at test\hive-protocol-v2.test.cjs:299:10
```

The RED is `sweepTaskReviews()` returning `0` where the assertion demands `1` — the behavioural
failure, not a missing helper or a typo. The test asserts on the returned count **and** on
`hive.inbox('pam-1')[0]` plus its `conversation`, so a future change that increments the counter
without mailing anything still fails.

**Test 3 — refuse → redo (RED, behavioural):**

```
AssertionError [ERR_ASSERTION]: a 0 here means `task.review` stayed truthy after the refusal, so the
refused-then-fixed path — the one where a second look matters most — is silently unreviewable (#18)

  0 !== 1
  actual: 0, expected: 1, operator: 'strictEqual'
  at test\hive-protocol-v2.test.cjs:323:10
```

**Tests 4 and 5 passed in the same pre-fix window** (`✔` above) — exactly as the plan predicts. Test 4
pins already-shipped `canReceiveInbox` behaviour; test 5 is a preserved invariant, and pre-fix source
has no storm.

### GREEN after the fix

```
$ git checkout HEAD -- src/main/hive.ts
$ TAP=$(mktemp); node --test --test-reporter=tap test/hive-protocol-v2.test.cjs > "$TAP"; echo "EXIT=$?"; grep -E "^# (tests|pass|fail|skipped|todo) " "$TAP"; rm -f "$TAP"
EXIT=0
# tests 17
# pass 17
# fail 0
# skipped 0
# todo 0
```

`# pass 17` ≥ the required floor of `17` (B-hpv2 = 12 plus five), `# fail 0`, `# skipped 0`,
`# todo 0`. The TAP reporter is named explicitly — the default spec reporter prints `ℹ skipped 0`,
which no `^# ` grep matches, so a criterion written against it would pass on no output at all.

### Test 5 — the deliberate counter-run, and it really can fail

Test 5 is reported as a **preserved invariant**, not RED-then-GREEN. Both directions plus the
counter-run:

| Direction | Result |
|---|---|
| pre-fix source (`ad42dc4`) | **PASS** (`✔` in the transcript above) |
| post-fix source (`1ddabbc`) | **PASS** (17/17) |
| with a deliberate `owesReview` rebuild-at-startup | **RED** |

The rejected implementation, injected into the previously-empty `HiveManager` constructor body:

```ts
for (const t of this.ledger().tasks) {
  if (t.status === 'done' && !t.review && t.assignee) this.owesReview.add(t.id);
}
```

```
$ node --test test/hive-protocol-v2.test.cjs
✖ a restart against a board full of historic done cards mails nothing, on the first sweep or the second
  AssertionError [ERR_ASSERTION]: the SECOND sweep is what nothing else covers: a failure here means
  the boot backlog was MASS-REVIEWED, which the lastTaskStatus comment in src/main/hive.ts promises
  cannot happen

    3 !== 0
    actual: 3, expected: 0, operator: 'strictEqual'
# tests 17
# pass 16
# fail 1
not ok 13 - a restart against a board full of historic done cards mails nothing, on the first sweep or the second
```

The count assertion fires first, so the inbox assertion never runs inside the test. A standalone probe
over the same arrangement (run from the scratchpad, never committed) shows the mail itself:

```
                                 rebuild-at-startup      shipped fix
sweep1                           0                       0
sweep2                           3                       0
pam-1 inbox length               3                       0
pam-1 inbox subjects             ["[review] old-1",      []
                                  "[review] old-2",
                                  "[review] old-3"]
```

The storm is real, it is mailable, and the reviewer's inbox is non-empty under the rebuild. Experiment
reverted:

```
$ git checkout HEAD -- src/main/hive.ts
$ git diff --name-only -- src/main/hive.ts
(empty — back to task 2's version)
```

### The five tests

1. **`a card that flips to done while every other agent is busy is reviewed on a later sweep`** —
   `kevin-1` seeded `working`, card flipped done, sweep returns `0` and mails nothing; `kevin-1` set
   `idle`, sweep returns `1` and the `review-t1` query lands in his inbox.
2. **`a card created AND finished inside one sweep window is still reviewed`** — seed sweep over an
   empty board, then the card is created AND set `done` in one `writeTasks`, with no intervening
   sweep. Asserts the returned count is `1` **and** that `review-fast-1` reached `pam-1`.
3. **`a card refused by its reviewer and then re-done is reviewed again`** — done → reviewed →
   `applyReviewVerdict` refuse → assignee re-dones → a second `review-t1` query is mailed. Asserts on
   the conversation-scoped inbox count (1 → 2), not just the return value.
4. **`a reviewer whose engine cannot receive mail is never selected`** — the only idle non-assignee
   runs provider `custom` (`canReceiveInbox: false`, *"no inbox-drain path → mail bounces to the
   god"*). Sweep returns `0`, the inbox is empty, and the card is **not** stamped with a `review` by a
   reviewer that never got the query. Labelled in its own comment as pinning behaviour that already
   shipped, so no future reader mistakes it for new work.
5. **`a restart against a board full of historic done cards mails nothing, on the first sweep or the
   second`** — three historic `done` cards with an `assignee` and no `review`, an idle non-assignee
   seated so a storm would be mailable, and a genuinely **fresh** `HiveManager` constructed over the
   already-populated floor. Asserts `0` on the seed sweep, `0` on the **second** sweep (the new
   assertion — `:220` is green purely from the seed guard and says nothing about it), and that the
   candidate reviewer's inbox is still empty.

```
$ grep -c "canReceiveInbox" test/hive-protocol-v2.test.cjs
1
```

### REQUIREMENTS.md correction

```
$ grep -n "VERDICT-03" .planning/REQUIREMENTS.md
216:- [ ] **VERDICT-03**: ALREADY LIVE IN SOURCE — the `canReceiveInbox` filter inside
443:| VERDICT-03 | Phase 1 | Pending |
478:| Phase 1 - FLOOR-08 | VERDICT-02, VERDICT-03 | FLOOR-08 passes today while cards go silently unreviewed. VERDICT-03's `canReceiveInbox` filter already ships, so it is pulled forward to be PINNED by a named test before FLOOR-08 may be called done, not to be built |
```

Before:

> - [ ] **VERDICT-03**: A reviewer that cannot receive mail is never selected as a reviewer, so
>       on a mixed-engine floor a review is not routed into a black hole *(filter on
>       `canReceiveInbox`)* — **prerequisite of FLOOR-08**

After:

> - [ ] **VERDICT-03**: ALREADY LIVE IN SOURCE — the `canReceiveInbox` filter inside
>       `leastLoadedIdle` (`src/main/hive.ts:1786`; it sat at `hive.ts:1746` before plan 01-03's
>       comment delta — re-derive it by content match, never by line number) means a reviewer that
>       cannot receive mail is never selected, so on a mixed-engine floor a review is not routed
>       into a black hole. The old parenthetical *(filter on `canReceiveInbox`)* read as undone
>       work and was itself a false claim this project made about itself. Plan 01-03 PINS the
>       shipped behaviour with the named test *"a reviewer whose engine cannot receive mail is
>       never selected"* in `test/hive-protocol-v2.test.cjs` instead of rebuilding working code.
>       The box stays unchecked only because the phase gate (plan 23) owns checking it —
>       **prerequisite of FLOOR-08**

The checkbox is **not** marked and the traceability row still reads `Pending` — plan 23 owns the phase
gate.

---

## The two corrected source comments — before and after

### `leastLoadedIdle` — a claim that was FALSE of the old code

**Before** (`hive.ts:1738-1740`):

> `/** The least-loaded idle agent that can actually take mail, excluding \`skip\``
> `*  (the assignee) and god. Null when nobody qualifies — the sweep then simply`
> `*  leaves the card alone and tries again next minute. */`

**After** (`hive.ts:1770-1780`):

> `/** The least-loaded idle agent that can actually take mail, excluding \`skip\``
> `*  (the assignee) and god. \`canReceiveInbox\` is the VERDICT-03 filter: a`
> `*  provider with no inbox-drain path (kimi, copilot, custom) is never selected,`
> `*  so on a mixed-engine floor a review is not routed into a black hole.`
> `*`
> `*  Null when nobody qualifies, and the sweep then leaves the card alone and tries`
> `*  again on a later sweep. That sentence was a FALSE claim in this comment until`
> `*  #18: the sweep recorded the card as 'done' before the loop ran, so a null`
> `*  reviewer consumed the transition and the card was never looked at again. It is`
> `*  true now, and true ONLY because \`owesReview\` holds the obligation across`
> `*  sweeps — do not remove the set and leave this comment standing. */`

### `sweepTaskReviews` — the overclaim, replaced by the named residual

**Before** (`hive.ts:1759-1760`):

> `* Detects the transition from the LEDGER rather than from writeTasks, so it`
> `* catches every writer including a god that hand-edits tasks.json.`

**After** (`hive.ts:1801-1811`) — the true half kept, the overclaim gone:

> `* Reads the LEDGER rather than hooking writeTasks, so no writer is privileged:`
> `* whoever moved the card, the sweep sees the same durable state.`
> `*`
> `* ACCEPTED RESIDUAL (T-P03-07) — this is a SWEEP_INTERVAL_MS poll, not a change`
> `* feed. A card that is 'done' at one snapshot, reopened by a writer that does not`
> `* go through applyReviewVerdict (a god editing the board by hand), and 'done'`
> `* again before the next snapshot presents IDENTICAL durable state at both`
> `* observations, so it mints nothing and is not reviewed. No snapshot rule can see`
> `* a change that is undone before the next observation, and the alternative —`
> `* minting on "done with no open review" with no transition test — IS the boot`
> `* review-storm that lastTaskStatus forbids. The supported reopen path is`
> `* applyReviewVerdict's refuse branch, which re-mints the obligation directly.`

### T-P03-07, stated in the same words the source now uses

> This is a `SWEEP_INTERVAL_MS` poll, not a change feed. A card that is `done` at one snapshot,
> reopened by a writer that does not go through `applyReviewVerdict` (a god editing the board by
> hand), and `done` again before the next snapshot presents IDENTICAL durable state at both
> observations, so it mints nothing and is not reviewed. No snapshot rule can see a change that is
> undone before the next observation, and the alternative — minting on "done with no open review"
> with no transition test — IS the boot review-storm that `lastTaskStatus` forbids. The supported
> reopen path is `applyReviewVerdict`'s refuse branch, which re-mints the obligation directly.

`lastTaskStatus`'s comment also gained the obligation set's process-local lifetime, naming BOTH guards
and stating in source why no startup rebuild exists.

---

## Verification

### Local

```
$ npm test
ℹ tests 438
ℹ suites 0
ℹ pass 434
ℹ fail 0
ℹ cancelled 0
ℹ skipped 4
ℹ todo 0
FULL_EXIT=0

$ npm run typecheck
TYPECHECK_EXIT=0
```

Baseline was `433 / 429 / 0 / 4`. Exactly `+5` tests and `+5` passes, `fail 0` unchanged, `skipped 4`
unchanged — no test was skipped, disabled or weakened to get here, and no existing test was modified.

### Three-platform CI on the phase's draft PR

`gh pr checks 77` — PR #77, head `gsd/v1.0-milestone`, base `main`, at `b09fd74`:

| Check | Result | Duration |
|---|---|---|
| `Test (ubuntu-latest)` | **pass** | 44s |
| `Test (windows-latest)` | **pass** | 1m5s |
| `Test (macos-latest)` | **pass** | 35s |
| `Typecheck` | **pass** | 31s |
| `Build` | **pass** | 1m6s |
| `Electron smoke (ubuntu-latest)` | **pass** | 1m33s |

Confirmed against the SHA rather than the branch tip alone:

```
$ gh api repos/MARKXAILABS/hello-markx/commits/b09fd74/check-runs --jq '.check_runs[] | "\(.name)\t\(.conclusion)"' | sort
Build	success
Electron smoke (ubuntu-latest)	success
Test (macos-latest)	success
Test (ubuntu-latest)	success
Test (windows-latest)	success
Typecheck	success
```

### Plan `<verification>` block, item by item

| Item | Required | Result |
|---|---|---|
| `npm test` green on the draft PR to `main` | `pass` on the three `Test (...)` runs | **met**, rows pasted above |
| `npm run typecheck` green locally + `Typecheck` on the PR | both | **met** |
| `:220` and `:233` still pass | both | **met** — 17/17, neither touched |
| test 5 (quiet second sweep) green | yes | **met**, and proven able to fail |
| `grep -c "previous.has"` = `0` **and** `grep -cF "previous.get(task.id) !== 'done'"` ≥ `1` | both | **`0`** and **`1`** |
| `grep -c "hand-edits tasks.json"` = `0`, `grep -c "mass-reviewed at boot"` = `1` | both | **`0`** and **`1`** |

---

## must_haves — every truth, adjudicated

| Truth | Status | Evidence |
|---|---|---|
| A card that flips to done while every other agent is busy is still reviewed on a later sweep | **SATISFIED** | test 1, RED pre-fix `0 !== 1`, green post-fix |
| A card created AND finished between two sweep ticks is still reviewed | **SATISFIED** | test 2, RED pre-fix `0 !== 1`; `grep -c "previous.has"` → `0` |
| A card refused by its reviewer and then re-done is reviewed again | **SATISFIED** | test 3, RED pre-fix `0 !== 1` |
| A restart against a ledger full of historic done cards mails nothing, first sweep or second; the set is never rebuilt from the persisted board | **SATISFIED** | test 5 green both directions; annotated grep shows no boot write; rebuild counter-run RED `3 !== 0` |
| The sweep is a poll, and the plan and the source say so | **SATISFIED** | T-P03-07 in `sweepTaskReviews`'s doc; `grep -c "hand-edits tasks.json"` → `0` |
| A reviewer that cannot receive mail is never selected (already true — pinned, not rebuilt) | **SATISFIED** | test 4, green pre-fix; `hive.ts:1786` unchanged |
| An unanswered `requires_reply` is chased rather than forgotten | **SATISFIED (pre-existing)** | `sweepUnansweredReplies` `:1694`, driven at `:1814`, pinned by `:148` and `:173`. Nothing built |
| `leastLoadedIdle`'s doc comment no longer claims behaviour the code does not have | **SATISFIED** | before/after above |

Artifacts: `src/main/hive.ts` contains `owesReview` (8 hits); `test/hive-protocol-v2.test.cjs` contains
`canReceiveInbox` (1 hit) and all five named tests. Key links: the done-transition mints and only
`send`+`patchTask` clears (`:1850`, `:1871`); the `previous.has` guard is deleted (`grep` → `0`);
`owesReview.add` on refuse (`:1896`).

**Plan success criterion 5 — "Issue #18 closes in this PR" — is NOT satisfied. Deliberately.** See below.

---

## Deviations from Plan

### 1. [Rule 4 / operator directive — root-cause over surface] Issue #18 left OPEN

- **Found during:** task 3 wrap-up, auditing #18's full acceptance text per D-43.
- **Issue:** the plan's success criterion 5 orders #18 closed in this PR. #18's Fix list has **seven**
  clauses; this plan closes one (the reviewer step). Three are still unmet at `b09fd74`:

  ```
  $ ls PROTOCOL.md COMMANDS.md
  ls: cannot access 'PROTOCOL.md': No such file or directory
  ls: cannot access 'COMMANDS.md': No such file or directory

  $ grep -rln "spawn-requests" --include=*.md --include=*.ts --include=*.cjs . | grep -v node_modules
  ./.planning/codebase/ARCHITECTURE.md
  ./src/main/config.ts
  ./src/main/hive.ts
  ./src/main/index.ts

  $ grep -rn "enrichTaskPrompt" src/ test/
  src/renderer/src/hooks/useHive.ts:241:function enrichTaskPrompt(text: string): string {
  ```

  `spawn-requests` is in no agent-facing doc. `enrichTaskPrompt` still has **zero** callers — neither
  wired nor deleted. The work-order string's audit anchor (`useHive.ts:137`) has drifted and the clause
  cannot be adjudicated from source without its own pass.
- **Decision:** do NOT close #18. D-42 sets the bar at per-ACCEPTANCE-CLAUSE precisely because the
  recorded 2026-08-20 error was four issues with real landed code and one unmet clause each, closed
  anyway. PROJECT.md's standing decision is *"close only genuinely-fixed issues; keep partials open
  with what remains."* Closing it would have satisfied the plan's checkbox by making the repo's issue
  tracker lie — the exact failure mode this phase exists to remove.
- **Instead:** posted the full D-43 evidence comment on #18 — acceptance text verbatim, one command
  per clause with actual output pasted, the named tests, the `npm test` exit line, the three-platform
  CI table, and an explicit list of what remains:
  https://github.com/MARKXAILABS/hello-markx/issues/18#issuecomment-5364189116
- **Impact:** phase gate D-46 (`gh issue list --state open --label floor-inspection` excluding epics
  returns `0`) cannot pass until #18's clauses 3, 4 and 5 are done by whichever plan owns them. **Plan
  23 must not treat #18 as closed.** Flagged as a blocker in STATE.md.
- **Commit:** n/a (issue comment, no repo change).

### 2. [Rule 1 - Bug] `.planning/REQUIREMENTS.md` cites `hive.ts:1786`, not the plan's `:1746`

- **Found during:** task 3, writing the VERDICT-03 correction.
- **Issue:** the plan's acceptance criterion says the corrected text must cite `hive.ts:1746`. Task 2's
  comment delta moved that filter to `:1786`. Writing `:1746` would have shipped a stale pointer into
  a requirements document one commit after this plan corrected a stale pointer in the same document.
- **Fix:** cite the live line `src/main/hive.ts:1786`, record that it sat at `hive.ts:1746` before this
  plan's delta, and tell the reader to re-derive by content match — which is the plan's own stated rule
  for line numbers. The literal string `hive.ts:1746` is present, so the criterion's mechanical form is
  also satisfied.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Commit:** `b09fd74`

### 3. [Rule 2 - Correctness] The pull-forward table's VERDICT-03 rationale was a false claim

- **Found during:** task 3, editing `.planning/REQUIREMENTS.md`.
- **Issue:** the pull-forward table read *"FLOOR-08 passes today while cards go silently unreviewed and
  reviews route to engines that cannot receive mail."* The second half is false against source — the
  `canReceiveInbox` filter has shipped all along. Same class of defect as the VERDICT-03 line the plan
  sent me to fix, in the same file, three sections down.
- **Fix:** rewritten to say VERDICT-03's filter already ships and is pulled forward to be **pinned** by
  a named test, not built.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Commit:** `b09fd74`

### 4. [Plan-over-RESEARCH] Two `01-RESEARCH.md` recommendations deliberately not followed

- `01-RESEARCH.md` § "Cheapest correct fix" proposes minting with
  `if (!wasDone && previous.has(task.id))`, which carries defect 2 intact, and *"Rebuild from the
  ledger at startup so an in-flight obligation survives a restart (same reasoning as D-20's ledger
  rescan)."* The plan overrides both, and it is right to: D-20's rescan is over an **append-only cost
  ledger** where rescanning is idempotent; the task board is not, and rebuilding an obligation set from
  it mints one review query per historic `done` card. Proven, not argued — the counter-run above mails
  three.
- No deviation from the **plan**; recorded so a later reader comparing plan to research does not think
  the research was simply missed.

### Not deviations

- The `requires_reply` chase already shipped and was **not** rebuilt (task 1 decided this from source,
  as instructed). No auth gates occurred. No architectural change was needed. `src/main/index.ts`,
  `src/main/hooks.ts` and the cost-ledger region were not touched.

---

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired components were introduced. The one
temporary construct — the rebuild-at-startup counter-experiment — lived in the working tree for a
single test run and was reverted, with `git diff --name-only -- src/main/hive.ts` empty afterwards.

## Threat Flags

None. This plan adds no network endpoint, auth path, file-access pattern or schema change. The one
trust boundary it touches — *claimant agent asserts its own work is done* — is the boundary the plan's
own threat register already covers, and the change strengthens it. `T-P03-07` is an accepted residual
already named in both the register and the source.

---

## Commits

| Task | Commit | What |
|---|---|---|
| 1 | — | evidence only, no files by design |
| 2 | `1ddabbc` | `fix(01-03): make the review sweep an obligation, not a consumed edge` |
| 3 | `b09fd74` | `test(01-03): pin the review sweep against all three loss paths and the storm` |

---

## Self-Check: PASSED

```
FOUND: src/main/hive.ts
FOUND: test/hive-protocol-v2.test.cjs
FOUND: .planning/REQUIREMENTS.md
FOUND: .planning/phases/01-finish-the-floor/01-03-SUMMARY.md
FOUND: 1ddabbc
FOUND: b09fd74
```

Every file this SUMMARY claims to have created or modified exists on disk, and both commit hashes
resolve in `git log`. The CI rows were additionally re-fetched by SHA (`b09fd74`) rather than by
branch tip, so the six `success` conclusions are bound to the exact tree described here.

---

## State updates — one handler deliberately not run

`state.advance-plan`, `state.update-progress`, `state.record-metric`, three `state.add-decision`
calls, `state.add-blocker` and `state.record-session` all ran, plus
`roadmap.update-plan-progress --phase 01`.

**`requirements.mark-complete FLOOR-08 VERDICT-02 VERDICT-03` was NOT run.** The plan's frontmatter
lists those three requirements, but task 3 states in as many words: *"Do not mark the checkbox — plan
23 owns the phase gate."* Marking them here would also be false on the merits: FLOOR-08 is tied to
#18, and three of #18's seven Fix clauses are unmet. All three requirement rows therefore still read
`Pending` in `.planning/REQUIREMENTS.md`, and plan 23 owns flipping them once the phase gate is
genuinely green.

The `Current Position` counter now reads `Plan: 3 of 23` and progress `9%` (2 SUMMARYs on disk out of
23 PLANs). That undercount is 01-01's open D-09 operator gate, whose SUMMARY is intentionally not
written yet — not a miscount by this plan.
