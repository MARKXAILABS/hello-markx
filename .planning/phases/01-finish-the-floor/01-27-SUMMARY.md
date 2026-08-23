---
phase: 01-finish-the-floor
plan: 27
subsystem: main
tags: [circuit-breaker, budget, delivery-queue, durability, data-loss, gap-closure]

requires:
  - phase: 01-finish-the-floor
    provides: "the FLOOR-10 budget arm in breaker.evaluate() (01-09/01-10), the main-owned MD delivery queue (FLOOR-02, 01-08)"
provides:
  - "the >= 80% budget band is ADVISORY: remembered in `softTrip` and returned last, so the per-agent cap, both floor-wide caps, velocity and no-progress all run again for a carded agent"
  - "a card in the band that also breaches a harder arm reaches that arm's level and reports that arm's reason"
  - "the no-progress arm's stateful counter advances again for a band card — a pre-FLOOR-10 arm restored, asserted, and recorded rather than discovered"
  - "loadQueue distinguishes ABSENT from UNREADABLE: a non-ENOENT read error leaves the write path DISARMED, so a transient fault cannot write `[]` over a good file"
  - "`queueReadError` carries an honest refusal to the operator instead of the false 'no harness home' claim"
  - "the row filter's silent deletion is counted and logged"
affects: [01-28 (renders main's `error` verbatim; shares src/main/delivery.ts and test/delivery-main.test.cjs)]

tech-stack:
  added: []
  patterns:
    - "advisory trip: a soft arm is held in a local and returned at the bottom, so ordering decides which REASON is read and never whether enforcement happens"
    - "a stateful arm below a soft arm is a behaviour change when the soft arm stops returning early — assert the consequence, do not suppress it"
    - "absent vs unreadable vs corrupt as three distinct load outcomes, only two of which may arm a write path"
    - "the fault fixture asserts its own mechanism at runtime (EISDIR), so a platform that answers differently fails loudly instead of turning the case into a no-op"

key-files:
  created: []
  modified:
    - src/main/breaker.ts
    - src/main/delivery.ts
    - test/breaker.test.cjs
    - test/delivery-main.test.cjs

key-decisions:
  - "The band keeps `ceiling: 'steering'` and its exact reason string. What changed is only WHERE it is returned from — the bottom of evaluate() instead of the middle."
  - "Over-100% still returns immediately. It is a hard trip and it was correct as it stood."
  - "The no-progress escalation this unmasks is LET THROUGH deliberately. Suppressing the arm below the band would have re-created the same mask one arm lower."
  - "A file that READ fine and parsed badly stays armed. The distinction drawn is readable-vs-unreadable, never valid-vs-invalid — a floor that could never overwrite a corrupt file would be wedged forever."
  - "The 'no harness home' string is kept for the case it was written for (`queuePath()` returning null) and is now unreachable during a read fault."
  - "The dropped-row count is LOGGED, not migrated. Counting does not save the rows; it stops the loss being invisible."
  - "The unreadable branch retries on the next call rather than backing off, and de-duplicates its log line by comparing the reason text — no new state."

patterns-established:
  - "A soft/advisory arm above hard arms must be a local, not a return — an early return in a first-match evaluator silently converts a warning into a shield"
  - "Every composite (soft arm AND hard arm) gets its own named case; the single-condition cases cannot see the mask"

requirements-completed: [FLOOR-10, FLOOR-02, RECORD-03]

duration: 20m
completed: 2026-08-22
---

# Phase 01 Plan 27: The budget band stops shielding, and a failed read stops arming — Summary

Two arms that each weakened the thing they were added to strengthen are now
correct: `evaluate()`'s 80–100% budget band is advisory instead of terminal, so
the five arms below it run again for a carded agent; and `loadQueue()` stays
disarmed after a read it could not complete, so a transient filesystem fault can
no longer write an empty queue over a good file.

**Commits:** `af40229` (breaker), `bda6359` (delivery). Baseline HEAD `cf3b3b8`.

---

## What was wrong, and what it is now

### 1. `src/main/breaker.ts` — the budget arm made the ceiling WEAKER (review `a/CR-04`)

`evaluate()` returns on the first matching arm. The FLOOR-10 band sat above the
per-agent token cap, the floor `costCapUsd` cap, the floor token cap, the
velocity arm and the no-progress arm, and its lower band did:

```ts
return { tripping: true, ceiling: 'steering', reason: `budget: card …` };
```

That pinned the ladder at rank 1 **and skipped every arm below it**. An agent at
85% of its card cap that was also the floor's biggest spender over `costCapUsd`
could not be constrained at all.

Now the band's result is assigned to a local `softTrip` and returned at the point
the function would otherwise return `{ tripping: false, reason: '' }`:

```ts
return softTrip ?? { tripping: false, reason: '' };
```

The over-100% branch still returns immediately. The repeated-tool-call and
api-error-storm arms above the band are untouched and still return first. The
band-only path is unchanged in every observable: same `reason` string, same
`ceiling: 'steering'`, same hold across beats.

### 2. `src/main/delivery.ts` — a failed read armed the write path (review `a/CR-05`)

`loadQueue()` ran `this.queue = items; this.queueFile = path;` on **every** path,
including after its parameterless `catch` had swallowed the error object — while
the doc comment three lines above stated the opposite invariant. One `EBUSY`/
`EPERM` (Windows AV or an indexer holding the file) or one `EMFILE` under load
replaced the queue with `[]`, and `saveQueue` then wrote that emptiness to disk
on the next mutation.

Three outcomes now, not two:

| Read outcome | Queue | Write path | Refusal text |
|---|---|---|---|
| `ENOENT` (first boot) | empty | **ARMED** | — (enqueue succeeds) |
| any other fs error | empty for this call | **DISARMED** | `queueReadError` |
| loaded, incl. parsed badly | as read / empty | ARMED | — |

`enqueue`'s refusal now reads `this.queueReadError` when it is set. The
`'no harness home — nowhere durable to park this'` string is kept for the case it
was written for (`queuePath()` returning `null`) and is unreachable during a read
fault.

---

## HANDOFF → 01-28 (`src/main/delivery.ts`, `test/delivery-main.test.cjs`)

Both files are shared with plan 01-28 (wave 2, `depends_on: ["01-27"]`). Written
here because 01-28 cannot ask.

**Nothing 01-28 owns was touched.**

- **The quiesce emit is intact.** `git diff -- src/main/delivery.ts | grep -icE 'quiesce|synthesized'` → **0** added or removed lines mention either. `quiesce()` still lives at `src/main/delivery.ts:689` and its emit is byte-unchanged; the `synthesized: true` key 01-28 adds has no conflict here.
- **`harness()` in `test/delivery-main.test.cjs` is intact.** `git diff --numstat -- test/delivery-main.test.cjs` → **`163  0`**: 163 lines added, **0 removed**. Every pre-existing case, including the `emitted[]` array 01-28's Stop-guard assertions read, is byte-for-byte what it was. The new cases were inserted immediately above the `// ─── board.md size policy (#35)` divider, so the end of the file is free for 01-28 to append to.

**The exact refusal string 01-28 will render.** `enqueue` returns this verbatim in
`error` when a non-`ENOENT` read fault is in force (`src/main/delivery.ts:412`):

```
queue temporarily unreadable (EISDIR) — holding the parked messages rather than overwriting them
```

The parenthesised token is the `errno` code (`EISDIR` in the test fixture,
`EBUSY`/`EPERM`/`EMFILE` in the field). The dash is an em dash (U+2014). The
`'no harness home — nowhere durable to park this'` string still exists and is
still what a genuinely homeless floor returns — 01-28's `statusHint` must handle
both.

---

## Evidence

Every number below came from a command run in **this** session, on this machine
(win32, node v24.13.0). None is quoted from an earlier SUMMARY.

### RED first — task 1 (source unchanged, tests added)

`node test/breaker.test.cjs` at `cf3b3b8` with the new cases and the untouched
source, verbatim:

```
FAIL  a card in the band AND the floor top spender over the cost cap still reaches constrained
      a card at 85% shielded the floor cost cap — the budget arm made the ceiling weaker (reason: budget: card t-1 at 8,500 of 10,000 tokens (85% of its cap))
FAIL  a card in the band AND over the per-agent token cap still reaches constrained
      a card at 85% shielded this agent OWN token cap (reason: budget: card t-1 at 8,500 of 10,000 tokens (85% of its cap))
FAIL  a card in the band AND a token-velocity spike still reaches constrained
      a card at 85% shielded the velocity arm (reason: budget: card t-1 at 8,500 of 10,000 tokens (85% of its cap))
FAIL  RECORDED CHANGE: a band card that also stops coordinating escalates on the no-progress arm
      the no-progress arm is still masked by the band (reason: budget: card t-1 at 8,500 of 10,000 tokens (85% of its cap))
```

Exit `1`. All four failures report the same thing: the operator read the budget
warning while a harder arm was the truth.

**Negative control, run BEFORE the source change, in that same run:**

```
  ok  NEGATIVE CONTROL: an agent under every threshold stays healthy for several beats
```

Also green before the change: the four PRESERVED cases (band-only holds at
`steering`; past-100% still reaches `constrained`; loop and storm still report
first) and all 16 pre-existing cases.

### GREEN — task 1 (after the source change)

```
  ok  a card in the band AND the floor top spender over the cost cap still reaches constrained
  ok  a card in the band AND over the per-agent token cap still reaches constrained
  ok  a card in the band AND a token-velocity spike still reaches constrained
  ok  a card in the band with every arm below it clear still warns and HOLDS at steering
  ok  a card past 100% of its cap still trips with no ceiling of its own
  ok  a looping agent in the budget band still reports the LOOP first
  ok  an api-error storm in the budget band still reports the STORM first
  ok  RECORDED CHANGE: a band card that also stops coordinating escalates on the no-progress arm
  ok  NEGATIVE CONTROL: an agent under every threshold stays healthy for several beats
```

**Negative control, run AFTER the source change:** the same `ok` line above. The
quiet agent was not collateral. It is driven for five consecutive beats with no
cost cap, no floor token cap, no per-agent cap, `progressing: true`, a flat
cumulative output (so the Δ-based block is never entered) and a card at **40%** of
its cap — below the band — and asserts `deepEqual` against five `'healthy'`.

Exit `0`, and `node --test test/breaker.test.cjs` → `tests 1 · pass 1 · fail 0`
(this file is a self-counting script; `node --test` sees it as one unit).
Case count 16 → 25, with the 16 pre-existing cases **unmodified** — the diff
adds 134 lines and removes none from the existing body.

### RED first — task 2 (source unchanged, tests added)

`node --test test/delivery-main.test.cjs` at `af40229` with the new cases and the
untouched source: `tests 34 · pass 31 · fail 3`, verbatim:

```
✖ a queue whose read FAILS leaves the write path disarmed and the persisted bytes intact
  AssertionError [ERR_ASSERTION]: an enqueue was ACCEPTED against a queue whose read had just failed. The write path was armed BY the failure, so the caller is told its message is parked and the next mutation writes an empty queue over a file that was fine
    actual: true, expected: false, operator: 'strictEqual'
✖ a transient read fault is TRANSIENT: the next good read re-arms and one enqueue reaches disk
  AssertionError [ERR_ASSERTION]: actual: true, expected: false, operator: 'strictEqual'
✖ rows dropped by the shape filter are COUNTED and logged, not deleted in silence
  AssertionError [ERR_ASSERTION]: a shape change deleted 2 parked messages leaving no trace at all: []
    actual: false, expected: true, operator: '=='
```

**Both negative controls passed BEFORE the change, in that same run:**

```
✔ ENOENT is a first boot, not a fault: an absent queue still arms and the first enqueue writes it
✔ no harness home at all still returns the harness-home refusal — that string stays right for its own case
✔ a corrupt file is still replaceable: unparseable JSON is an empty queue, and it ARMS
```

### GREEN — task 2 (after the source change)

`node --test test/delivery-main.test.cjs` → `tests 34 · pass 34 · fail 0`. The
same two negative controls and the corrupt-file case are still `✔`, so they
passed **both** before and after.

### The disk is the observable

No test reads the private path field — `grep -c 'queueFile' test/delivery-main.test.cjs`
is **0** (the PROHIBITION; see Deviations below). What the new cases read instead:

- `fs.readFileSync(queuePath, 'utf8')` captured before the fault and compared
  byte-for-byte after the fault **and** after a refused enqueue.
- `fs.readdirSync(faultPath)` is empty and `fs.readdirSync(dir)` contains no
  `.tmp-*` staging debris — nothing was written toward a path that could not be read.
- The refusal itself: `ok === false`, `error` matches `/temporarily unreadable/`,
  and `/no harness home/` explicitly does **not** match it.
- **Positive control:** the hold clears, one enqueue runs, and
  `JSON.parse(fs.readFileSync(queuePath)).items.length` is `before + 1` (2 → 3),
  still contains the pre-fault item `'one'`, contains the new `'three'`, and does
  **not** contain the message refused during the fault. A loader that never armed
  would pass every negative criterion and fail this.

### The `EISDIR` / `ENOENT` probe, re-run in this session

The plan's line was not trusted. Re-run here:

```
directory-as-file read -> EISDIR
absent path read       -> ENOENT
platform win32 node v24.13.0
```

Portability is not asserted from that single platform. The fixture helper
`unreadableQueuePath()` performs the probe **at runtime, inside the test**, and
asserts `code === 'EISDIR'` with a message naming `process.platform`. If an
ubuntu or macos runner ever answers otherwise, the case fails loudly there rather
than silently ceasing to exercise the non-`ENOENT` branch. `EISDIR` for a
directory opened as a file is POSIX-specified and is the darwin and linux
behaviour as well as win32's.

### Frontmatter gates

`node ~/.claude/get-shit-done/bin/gsd-tools.cjs verify …` against
`01-27-PLAN.md`:

| Gate | Before (`cf3b3b8`) | After |
|---|---|---|
| `verify artifacts` | `passed: 0, total: 4` | **`all_passed: true, passed: 4, total: 4`** |
| `verify key-links` | `verified: 0, total: 3` | **`all_verified: true, verified: 3, total: 3`** |

Measured grep gates, before → after:

| Gate | Required | Before | After |
|---|---|---|---|
| `grep -c 'softTrip' src/main/breaker.ts` | ≥ 3 | 0 | **4** |
| `grep -cE 'softTrip = ' src/main/breaker.ts` | ≥ 1 | 0 | **1** |
| `grep -c 'top spender' test/breaker.test.cjs` | ≥ 1 | 0 | **1** |
| `grep -c 'queueReadError' src/main/delivery.ts` | ≥ 3 | 0 | **7** |
| `grep -cE "code !== 'ENOENT'" src/main/delivery.ts` | ≥ 1 | 0 | **1** |
| `grep -c 'EISDIR' test/delivery-main.test.cjs` | ≥ 1 | 0 | **3** |
| `grep -c 'queueFile' test/delivery-main.test.cjs` | **= 0 (PROHIBITION)** | 0 | **0** |

### Suite, typecheck, lint — same-session delta

`npm test` is `node --test test/*.test.cjs`; the plan's verification command and
the package script are the same command, run once each.

| Run | tests | pass | fail | skipped |
|---|---|---|---|---|
| Baseline, `cf3b3b8`, this session | 565 | 559 | **0** | 6 |
| After both commits | 571 | 565 | **0** | 6 |
| **Delta** | **+6** | **+6** | **0** | **0** |

`+6` is the six appended `node:test` cases in `test/delivery-main.test.cjs`. The
nine cases added to `test/breaker.test.cjs` do not move the counter because that
file is a self-counting script that `node --test` sees as one unit; its own
per-case output is quoted above.

There is no pre-existing failure baseline on this machine: fail was 0 before and
is 0 after.

- `npm run typecheck` (`tsc --noEmit` for both `tsconfig.node.json` and
  `tsconfig.web.json`) — exit **0**, no diagnostics.
- `npx eslint . --max-warnings 0` on the whole tree — exit **0**.

---

## Recorded behaviour change (T-P27-02) — a decision, not a discovery

The no-progress arm is **stateful**: `s.noProgressBeats += 1`. While the band
returned early, that counter could never advance for an agent with a card in
flight, so the arm was masked outright for exactly the population FLOOR-10 was
added to watch. With the band advisory, it advances.

**Consequence, deliberately let through:** a card in the 80–100% band that also
burns rising cumulative output across `NO_PROGRESS_BEATS` consecutive beats
without coordinating now trips no-progress with **no ceiling** and escalates past
`steering` to `constrained`.

This is not a new trip. The arm predates FLOOR-10; FLOOR-10 masked it; this
restores it. Suppressing it below the band would have re-created the same mask one
arm lower. `hardStop` is off by default, so the ladder still caps at
`constrained` — paused and reported, never a kill (D-18).

It is pinned by its own named case
(`RECORDED CHANGE: a band card that also stops coordinating escalates on the
no-progress arm`), it is written into the arm's doc block in
`src/main/breaker.ts`, and it is recorded here.

Revision 1's withdrawn claim — that behaviour would be unchanged whenever the
band is the only thing holding — is **not** restored anywhere in this summary. It
was false precisely because this arm is stateful, and this section is the record.

---

## Cross-plan note: `test/engine-parity.test.cjs` (owned by no plan in this set)

Read before finishing, as the plan required. **Yes — it asserts on budget-band
reason strings and levels.** Five cases:

| Case | What it asserts |
|---|---|
| `FLOOR-10: a card at 85% of its cap steers and STAYS steering — it is a warning, not a stop` | level `steering` on beats 1, 2 and 3, and `reason` matches `/85% of its cap/` |
| `FLOOR-10: an over-cap card takes its assignee to constrained — on the SECOND beat` | levels `steering` → `constrained`, `reason` matches `/over budget/` and `/t-1/`, `action === 'constrain'` |
| `FLOOR-10 / D-18: four beats far over cap and the agent is never stopped, only constrained` | the exact ladder `['steering','constrained','constrained','constrained']` |
| `FLOOR-10: only the assignee is affected — the breaker is per-agent, never a floor-wide trip` | the carded agent reaches `constrained`, the uncarded one stays `healthy` |
| `FLOOR-10: the same spend against a generous cap is not stopped early` | `healthy` on both beats |

All five build inputs through its local `carded()` helper, which sets
`sample: null` and `progressing: true` against a `makeBreaker()` with no caps
configured. Every arm below the band is therefore structurally silent in them:
`billableTokensOf(null)` is 0, no `costCapUsd`/`costCapTokens` is set so there is
no top spender, and the velocity/no-progress block requires `input.sample`. None
of them can observe the change, which is exactly why the mask survived them and
needed the composite cases added here.

Measured, not reasoned: `node --test test/engine-parity.test.cjs` after the
breaker commit → `tests 28 · pass 28 · fail 0`. It was also green inside the
pre-change baseline run (0 failures across the whole suite). **No routing needed.**

---

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] The `queueFile` PROHIBITION was breached by my own comment prose**

- **Found during:** Task 2, gate measurement after the source change.
- **Issue:** `grep -c 'queueFile' test/delivery-main.test.cjs` read **2**, not 0.
  Both hits were in the explanatory comment block I had just written above the
  new cases — narrating the defect (`` `loadQueue` armed `this.queueFile` … ``) and
  narrating the prohibition itself (`` `queueFile` is private and no test reads it ``).
  No test code touched the field. The gate is a literal `grep`, and the plan
  labels it a constraint on how the work is done, so a comment breaches it just as
  a read would.
- **Fix:** Rephrased both comment lines — "armed the write path on EVERY path" and
  "the armed-path field is private". Meaning preserved, token gone.
- **Files modified:** `test/delivery-main.test.cjs`
- **Verified:** `grep -c 'queueFile' test/delivery-main.test.cjs` → **0**, suite
  still `34 · pass 34 · fail 0`.
- **Commit:** `bda6359` (folded into the task 2 commit, before it was made).

**2. [Rule 2 — Missing critical functionality] Log de-duplication on the unreadable branch**

- **Found during:** Task 2.
- **Issue:** `loadQueue()` no longer caches on the failure branch (by design — the
  next call must retry), so every `queueSnapshot()` / `enqueue()` during a
  sustained antivirus hold would emit a fresh log line. A guard that floods the
  log during the incident it exists to report is a guard that hides it.
- **Fix:** the branch logs only when the reason text differs from the one already
  held in `queueReadError` — one comparison, no new state.
- **Files modified:** `src/main/delivery.ts`
- **Commit:** `bda6359`

### Not deviations

- The `sample()` helper in `test/breaker.test.cjs` was **not** modified to carry a
  `usd` figure. A one-line `spending()` wrapper spreads it instead, so every
  pre-existing case keeps calling the helper it always called.
- No package installs, no `package.json` change (T-P27-SC).
- No line-range edits anywhere; every source edit was anchored on a symbol or an
  exact existing string.

### No stubs, no new threat surface

No hardcoded empty values, placeholder text or unwired components were introduced.
No new network endpoint, auth path, file-access pattern or schema change at a
trust boundary — the delivery change *narrows* an existing file-access path and
the breaker change adds no new input.

---

## Threat register outcomes

| Threat ID | Disposition | Evidence |
|---|---|---|
| T-P27-01 | mitigated | Band held in `softTrip`; three composite RED-first cases (cost cap / per-agent cap / velocity) reach `constrained` with the harder arm's reason. |
| T-P27-02 | **accepted, and asserted** | The no-progress escalation is pinned by its own case and documented in the arm's doc block. `hardStop` off → ladder still caps at `constrained`. |
| T-P27-03 | mitigated | Negative control green **before and after**, five beats, `deepEqual` on five `'healthy'`. |
| T-P27-04 | mitigated | Non-`ENOENT` read leaves the write path disarmed; on-disk bytes byte-identical after the fault plus a refused enqueue; no `.tmp-*` debris. |
| T-P27-05 | mitigated | Positive control: 2 items → fault → refusal → hold clears → one enqueue → **3 items on disk**, pre-fault item still present, refused message absent. |
| T-P27-06 | mitigated | `queueReadError` quoted verbatim above for 01-28; the test asserts `/no harness home/` does not match during a read fault. |
| T-P27-07 | mitigated | `queue load dropped 2 of 3 rows — wrong shape` logged; asserted by its own case. |
| T-P27-08 | mitigated | Both comment blocks rewritten to describe the code as it now is — the breaker arm's doc block and `loadQueue`'s three-outcome header. |
| T-P27-SC | mitigated | No installs; `package.json` untouched; four existing files modified, none created. |

---

## Success criteria

| Criterion | Verdict |
|---|---|
| A card in the 80–100% band no longer shields the per-agent cap, the floor caps, velocity or no-progress | **TRUE** — three composite cases, RED before / GREEN after |
| The band-only case is unchanged, reason string and hold at `steering` included | **TRUE** — `/^budget: card t-1 /` and four consecutive `steering` beats; the five `engine-parity` FLOOR-10 cases also still green |
| The no-progress escalation is asserted and recorded, not discovered later | **TRUE** — named case, doc block, and its own section above |
| An agent under every threshold is still healthy | **TRUE** — negative control green before AND after |
| A transient read failure leaves the persisted queue intact, and the refusal says so | **TRUE** — byte-identical on-disk compare + `/temporarily unreadable/` |
| `ENOENT` is still a first boot, and a healthy enqueue still reaches disk | **TRUE** — both negative controls plus the positive control |

## State files — the SDK clobber, measured rather than assumed

`.planning/STATE.md` carries an in-file warning that the GSD state writers wreck
it. That was not taken on trust: STATE.md was copied to a scratch backup before
each SDK call and diffed after.

**Measured, twice.** `gsd-sdk query state.update-progress` and
`gsd-sdk query state.record-metric` each re-derive the frontmatter from the body
and **both** overwrote two fields:

- `status: executing` → replaced with the first physical line of the body's
  `Status:` paragraph, `BLOCKED on the operator for the PHASE verdict. 10 of 23
  requirements close; 13 do not;` — an unquoted, truncated, multi-line-derived
  YAML scalar.
- `stopped_at:` → reverted to 01-26's text, discarding this plan's.

Both were repaired by hand after each call, against the backup. What the SDK got
RIGHT was kept: the progress bar (56% → **58%**), `completed_plans` 24 → **25**,
and the `| Phase 01 P27 | 20m | 2 tasks | 4 files |` metrics row. The phase's
**PARTIAL** verdict, the `Status:` body paragraph and the wave 24–31 progress text
are all intact — verified by reading the file back after the final repair.

**This will recur** for the next executor in this wave: the corruption is
deterministic, caused by the body's `Status:` paragraph being multi-line, and it
is not fixed here because that paragraph is 01-23's verdict text and is not this
plan's to rewrite.

**One count was corrected rather than incremented.** `gsd-sdk query
roadmap.update-plan-progress --phase 1` reported `summary_count: 25`, and
`ls .planning/phases/01-finish-the-floor/*-SUMMARY.md | wc -l` agrees: **25**.
STATE.md's "Plan: N of 31 with a SUMMARY" already read 25 when only 24 files
existed, so it was off by one **before** this plan. It now reads 25, counted off
disk, with the discrepancy noted in the file. `roadmap.update-plan-progress`
also flattened the ROADMAP progress row's wave annotation to a bare
`In Progress|` (missing space included); that was restored to
`In Progress (gap-closure wave 24-31: 01-24, 01-26 and 01-27 landed)`.

### Requirements: FLOOR-02 was NOT marked complete

The plan's `requirements: [FLOOR-10, FLOOR-02, RECORD-03]` is traceability, not a
closure claim, and `requirements mark-complete` was **not** run.

- **FLOOR-10** and **RECORD-03** were already `[x]` / Complete in
  `.planning/REQUIREMENTS.md` before this plan. Nothing to flip.
- **FLOOR-02** is `[ ]` / Pending and **stays Pending**. Its own residual line
  (`.planning/REQUIREMENTS.md:558`) states the outstanding item precisely:
  *"Nobody has run `npm run dev`, closed the window rather than quitting, and
  watched an idle agent still get woken. Needs a real hive and a live agent CLI
  session. Owner: operator."* This plan hardened the durability of the queue that
  path depends on; it did not perform that live run, and `.planning/REQUIREMENTS.md`
  is therefore untouched.

## Self-Check: PASSED
