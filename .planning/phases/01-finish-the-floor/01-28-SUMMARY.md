---
phase: 01-finish-the-floor
plan: 28
subsystem: renderer
tags: [message-queue, data-loss, quiesce, escalation, roster-migration, stale-comments, gap-closure]

requires:
  - phase: 01-finish-the-floor
    provides: "the main-owned MD delivery queue and its drain (FLOOR-02, 01-08); 01-27's loadQueue arm/disarm split and its queueReadError refusal string"
provides:
  - "enqueueMessage resolves main's QueueResult, so all seven call sites can tell acceptance from refusal"
  - "a per-agent `queueError` store slice — main's refusal is STORE state, so a server render can read it"
  - "the composer clears the textarea only after main accepts, and renders the reason at ANY queue length including an empty one"
  - "`synthesized: true` on main's quiesce Stop — the only thing that distinguishes the silence backstop from Claude Code's real turn-end"
  - "stopArmDecision: an exported pure decision, so the Stop guard is asserted where it ships rather than in a copy"
  - "roster.json carries the pre-FLOOR-02 queue slice at most once, consumed only by a write that landed"
affects: [01-31 (owns the residual register — two quiesce residuals recorded below for its sweep)]

tech-stack:
  added: []
  patterns:
    - "a refusal is parked at the SHARED function, not at each caller — one guard covers all seven producers, including the next one someone adds"
    - "the operator-visible reason lives in the store, never in component state: component state is invisible to a server render and dies on the remount an agent switch causes"
    - "when two producers emit byte-equivalent payloads, the discriminator goes on the PRODUCER; a consumer-side heuristic necessarily swallows both"
    - "extract the decision out of a React effect so node --test can drive it — a test that calls updateAgent directly is green before and after the change"
    - "a one-shot is consumed by a CONFIRMED write, never by the attempt; a failed write must not destroy the only copy"
    - "a dead function and the doc block arguing for its live invariant are removed together, never half"

key-files:
  created:
    - test/renderer-queue.test.cjs
  modified:
    - src/renderer/src/store/store.ts
    - src/renderer/src/components/MessageQueueComposer.tsx
    - src/renderer/src/hooks/useHive.ts
    - src/main/delivery.ts
    - src/preload/index.ts
    - test/delivery-main.test.cjs

key-decisions:
  - "The refusal is attributed to main (`main declined: …`) rather than adopted as the app's own diagnosis, because 01-27 makes 'no harness home' reachable on a transient FS fault."
  - "The refusal line is rendered AHEAD of statusHint's `queue.length === 0` short-circuit — a refused FIRST message is exactly the empty-queue case that rendered nothing."
  - "The Stop guard keys on `e.synthesized`, never on status alone: a status-only guard would wedge a falsely-blocked agent (a bare `(y/n)` in the terminal tail) out of its own status paint forever."
  - "`clearBreaker` stays true for every REAL turn-end including the blocked case — that write is the only clearer of breakerLevel in the file."
  - "The six useHive enqueueMessage call sites were reconciled but not edited: `queueRefusal` parks the reason at the shared function, so the fix reaches every producer without six per-site edits."
  - "`blockReason` surviving an idle is NOT asserted anywhere — it is a pre-existing merge leak (R-23), and pinning it would make the eventual fix look like a regression."
  - "The roster one-shot is a one-shot, not a deletion: main cannot read localStorage, so that write is the only bridge adoptRendererQueues has to pre-migration messages."

patterns-established:
  - "A test file installs no load-time assertion that can abort the file — a missing export fails its own CASE, so one gap cannot hide fourteen others"

requirements-completed: []

duration: 1h05m
completed: 2026-08-22
---

# Phase 01 Plan 28: A refused message survives, a blocked agent keeps its escalation, and roster.json stops replaying — Summary

Three defects of one shape — a fact moved to main and the renderer kept a half of
it that no longer matched — are closed: the composer no longer throws the
operator's text away before main has accepted it, main's silence backstop no
longer erases the one cue that an agent needs a human, and `roster.json` no
longer re-publishes a frozen pre-FLOOR-02 queue slice into live terminals at
every Change Home.

**Commits** (baseline HEAD `ed5fab4`):

| Commit | What |
|---|---|
| `021651c` | `test(01-28)` — the whole new test file, RED |
| `5878d06` | `feat(01-28)` — task 1, the composer + store (b/CR-01) |
| `16d143d` | `feat(01-28)` — task 2, the synthesized discriminator + three comments (b/CR-02, c/WR-08) |
| `0a6db9e` | `feat(01-28)` — task 3, the roster one-shot (b/CR-03) |

---

## Quiesce residuals — ACCEPTED, not fixed

Both were accepted deliberately by the orchestrator. Fixing either reverses a
negative control this plan explicitly states, and widening a gap-closure plan
into a `quiesce` redesign is what produced 49 red-team blockers on the first
pass. Recorded here **with owners** so plan 01-31's register sweep can reach
them. Neither is narrowed away, and neither is a restatement of the fix above.

**(a) A false `blocked` that lands AFTER the last real Stop is unrecoverable.**
`delivery.ts` suppresses the repeat via `this.quiesced.has(a.agentId)` and only
resets that set when the PTY produces new output, so once a quiet spell has been
announced no further synthesized Stop arrives for it. `useHive.ts`'s Stop arm is
the only clearer of `breakerLevel`. `usePtyParser.ts`'s `BLOCK_HINTS` can raise a
false block off `/\(y\/n\)/i` matched against the terminal tail. So an agent
falsely marked blocked *after* its last genuine turn-end has no event left that
would clear it. Truth #3 above says "still recovers its status on its next real
turn-end" — that assumes a next real turn-end exists, and this is the case where
it does not.
**Recovery path:** a renderer clear-on-`PostToolUse`, or change `quiesce`'s
once-per-spell arming.
**Owner:** plan 01-31's residual register.

**(b) `quiesce`'s DURABLE half still writes `idle` for an agent the floor paints
`blocked`.** The line immediately above the emit calls `this.deps.setStatus?.(id,
'idle')` unconditionally; the discriminator this plan added reaches the renderer
arm only. Main holds no blocked status to filter on — `setStatus` is wired in
`src/main/index.ts` to a hive log line and nothing else — so the hive log records
an idle transition for an agent that is waiting on a human.
**Recovery path:** pass the discriminator to both halves.
**Owner:** plan 01-31's residual register.

---

## What was wrong, and what it is now

### 1. The composer threw the message away before main answered (`b/CR-01`, SC-4)

`MessageQueueComposer.queueIt` called `enqueueMessage(...)` and then `setText('')`
unconditionally, while `store.ts`'s `queueOp` was documented "fire-and-forget on
purpose" and discarded main's reply. Main returns `{ok:false}` with **no `queues`
key** on five reachable paths (`invalid agentId`, `empty message`, `unknown
agent: …`, `no harness home — nowhere durable to park this`, `queue full for … (200)`)
plus 01-27's transient read fault. Nothing rendered, nothing was said, and the
text was already gone.

The old doc's justification — "the next push corrects the view" — is true of the
VIEW and false of the MESSAGE, and that sentence is now replaced with the
distinction.

Now: `queueOp` is `async` and returns `Promise<QueueOpResult>`. Both failure
shapes — a rejected invoke and no preload at all — are normalised into the same
`{ok:false, error}` object main's own refusals use. Success goes through
`setQueues`, restoring the single-writer claim that action's own doc comment
makes. A new per-agent `queueError` slice holds the reason; `queueOp` sets it on
refusal and clears it on acceptance. The composer awaits and clears only on `ok`.

`statusHint` renders the refusal **before** its `queue.length === 0` branch,
because a refused FIRST message is precisely the empty-queue case that rendered
no status line at all. It is rendered as `main declined: ${err}` rather than as
the app's own diagnosis — 01-27 makes `'no harness home'` reachable on a
transient FS fault, and an operator mid-virus-scan should not be told their
harness home is gone in the app's voice (`R-25`).

### 2. The "needs you" escalation vanished at 12 s (`b/CR-02`)

The renderer's own quiesce filtered `status !== 'working'`. Main's replacement has
no filter, so a permission-prompted agent got a synthesized Stop and the renderer
flipped it to idle — the `!` gone, the escalation gone.

The fix is on the **producer**, not the consumer. Measured at HEAD, `hooks.ts`'s
real Stop and `delivery.ts`'s quiesce Stop send the same three populated keys with
everything else `undefined`; the payloads are byte-equivalent, so a
renderer-side heuristic on shape — or on `blocked === false` plus the agent's
status — would swallow Claude Code's genuine turn-end too. `quiesce` now emits
`synthesized: true`, and `src/preload/index.ts` carries `synthesized?: boolean` in
**both** the callback signature and the listener signature (checked and confirmed
— widening only the callback would satisfy the frontmatter gate while leaving the
boundary half-typed).

`useHive.ts` now exports `stopArmDecision(self, e, breakerArmed)`, a pure decision
returning `{ patch, clearBreaker }`, called from the arm. The extraction is the
point: the guard lived inside a React effect that `node --test` cannot drive, so a
test calling `updateAgent` directly would have been green before and after the
change. It reads `self`, the store row the effect already had — no second
subscription, no second copy of the status.

**`R-21` is stated at its true size and its stronger claim is not repeated.** The
`onHiveDelivered` `status === 'blocked'` guard sits in the SUBSCRIBER, so it only
skips the renderer's status paint after main has already delivered. Mail delivery
is main's `drainQueue`, whose gate list is `switching` / `vetoed` / `bootGrace` /
`idleMs` — **no status check anywhere**. A stuck-`blocked` agent keeps receiving
mail; what it loses is the `reading inbox` paint, the `!` clearing and the
seed-prompt retry. Still a real defect, still the reason the guard keys on the
event SOURCE.

### 3. `roster.json` replayed the pre-FLOOR-02 queue forever (`b/CR-03`)

`rosterMirror.queues` was seeded from localStorage at boot and re-published by
`flushRosterNow` on every 500 ms debounce. The slice was **frozen**, because its
localStorage writer had been dead since FLOOR-02 and nothing ever pruned a
delivered message out of it. `changeHome` copies `roster.json` but not
`delivery-queue.json` (which lives at the home ROOT), so at the new home
`adoptRendererQueues`' `existsSync` guard passes and the frozen slice is
re-enqueued into live terminals — every Change Home, forever.

It could not simply be dropped from the write (`RosterSnapshot.queues` is
required, and on a machine upgrading from a pre-FLOOR-02 build that slice is the
ONLY bridge main has to those messages — main cannot read localStorage), and it
could not stay. It is now a genuine one-shot: after a write carrying a non-empty
`queues` **resolves successfully**, the mirror slice is cleared and the
`cth.messageQueues` key removed, so every later write carries `{}`.

**Only `ok` and not `skipped` consumes it.** A rejected, failed or skipped write
leaves the slice armed — until main has the file, that copy is the only one that
exists, and dropping it on a failure would destroy the messages rather than
migrate them.

The dead writer was deleted **with its doc block**, not half-removed. The block's
stated reason for existing was about the SEED, not about itself, and a dead
function whose comment argues for a live invariant is exactly how `b/CR-03`
stayed invisible through a whole phase. Located by symbol, which mattered: task 1
of this same plan pushed that function from `:535` to `:584`, so the plan's HEAD
line range `:529-544` would have deleted live code.

**CEILING, stated rather than claimed away:** this closes the RE-delivery. It does
not repair a home whose `roster.json` was copied before this landed — those
messages were already adopted at the source home, so main's `delivery-queue.json`
there holds them and the `existsSync` guard is that home's protection.

### 4. Three comments naming a deleted path as live (`c/WR-08`)

All three named "effect #4" — the renderer drain deleted at FLOOR-02 — as the
thing that types into a PTY. They now name `DeliveryService.drainQueue`
(`src/main/delivery.ts`) and reference the tombstone by its TEXT
(`"4) THE QUEUE AND ITS DRAIN ARE MAIN'S NOW"`), never by a line number: 01-27
and task 1 of this plan both shift this file, and a fresh numeric anchor would be
stale on arrival in the phase whose criterion 1 is about exactly that. **Line 766
does not contain the string** — the round-1 demand for "only the tombstone at
:766" was unsatisfiable; the count after the fix is zero.

---

## Evidence

Every number below came from a command run in **this** session on this machine
(win32, node v24.13.0). None is quoted from an earlier SUMMARY.

### RED first — the whole file, re-derived against untouched source

The task-1 source edits were backed up to a scratch dir, reverted with a targeted
`git checkout -- <file>` on exactly the two files, and the committed test file was
re-run against HEAD `ed5fab4`. Verbatim:

```
not ok 1 - a refused enqueue resolves main refusal verbatim and parks the reason for that agent
not ok 2 - 01-27 own refusal string reaches the caller unaltered
not ok 3 - NEGATIVE CONTROL: an accepted enqueue resolves ok, applies main snapshot, and CLEARS the reason
not ok 4 - a REJECTED hiveQueue resolves a refusal instead of throwing out of a click handler
not ok 5 - NEGATIVE CONTROL: window.cth absent, and window absent, both stay non-fatal
not ok 6 - a whitespace-only message resolves main own empty-message wording, never undefined
not ok 7 - the refusal renders in the markup with one message queued, and the draft survives
not ok 8 - the refusal renders on an EMPTY queue — a refused FIRST message is exactly that case
ok 9 - NEGATIVE CONTROL: with no refusal seeded the existing statusHint is not displaced
not ok 10 - a SYNTHESIZED turn-end does nothing to an agent the floor already calls blocked
not ok 11 - NEGATIVE CONTROL: a REAL turn-end still idles a blocked agent AND still clears the breaker
not ok 12 - NEGATIVE CONTROL: a synthesized turn-end still idles a WORKING agent — the backstop survives
not ok 13 - a synthesized turn-end on an already-idle agent is idempotent
not ok 14 - NEGATIVE CONTROL: breaker precedence on a blocked Stop is unchanged
not ok 15 - STRUCTURAL: no comment in useHive.ts presents a renderer-side drain as the live path
ok 16 - NEGATIVE CONTROL: a write that FAILS or is SKIPPED does not consume the one-shot
not ok 17 - the pre-FLOOR-02 queue reaches roster.json on the first SUCCESSFUL write, and never again
ok 18 - NEGATIVE CONTROL: the roster mirror four other slices are byte-identical across the one-shot
ok 19 - with NO pre-migration queue every write carries an empty slice from the very first flush
```

**15 fail, 4 pass — and all four that pass are NEGATIVE CONTROLS**, which is what
a negative control is for. They were green before the change and are green after.

The five RED failures the plan named, each observed:

| RED claim | What the run reported |
|---|---|
| `enqueueMessage`'s return value | `res.ok` on `undefined` — cases 1-6 |
| the seeded refusal is in no markup | cases 7-8, `queueError` did not exist as a slice |
| the four `stopArmDecision` cases | `useHive.ts does not export stopArmDecision — the Stop arm is still buried in a React effect, where node --test cannot reach it` (cases 10-14) |
| the `synthesized` payload key | `test/delivery-main.test.cjs`'s new case, added at task 2 |
| the claim-shaped comment regex | case 15, offenders `:873` and `:908` |

### GREEN, per task

| After | tests | pass | fail |
|---|---|---|---|
| task 1 (`5878d06`) | 19 | 12 | 7 |
| task 2 (`16d143d`), incl. `test/delivery-main.test.cjs` | 54 | 53 | 1 |
| task 3 (`0a6db9e`) | 19 | 19 | **0** |

At task 2, **all 34 of 01-27's pre-existing `delivery-main` cases were still `ok`**,
including its own `a queue whose read FAILS leaves the write path disarmed…`,
`a transient read fault is TRANSIENT…` and `rows dropped by the shape filter are
COUNTED…`. So were the four negative controls of this plan and 01-27's quiesce
control (`a silent PTY is flipped idle with NO window attached, once per quiet
spell`) — the once-per-spell arming and the durable `setStatus` half are untouched.

### The roster one-shot, both payloads

Run against the shipped `store.ts`, `savedAt` elided:

```
FIRST  flush payload:
{ "version": 1, "savedAt": "<iso>", "agents": [], "archived": [], "restorable": [],
  "queues": { "a1": [ { "id": "old-1", "text": "typed before the migration", "ts": 1 } ] },
  "selectedId": null }

SECOND flush payload:
{ "version": 1, "savedAt": "<iso>", "agents": [], "archived": [], "restorable": [],
  "queues": {},
  "selectedId": null }

localStorage["cth.messageQueues"] after: null
```

### 01-27's work — verified, not assumed

| Check | Result |
|---|---|
| `harness()` in `test/delivery-main.test.cjs` | present at `:29`, `emitted[]` at `:50` |
| `node --test test/delivery-main.test.cjs` before my edit | `tests 34 · pass 34 · fail 0` |
| `loadQueue` / `queueReadError` / `code !== 'ENOENT'` in `src/main/delivery.ts` | all present (`:391`, `:291`, `:411`) |
| 01-27's refusal string rendered by this plan | asserted verbatim in case 2, em dash included |

`src/main/delivery.ts` and `test/delivery-main.test.cjs` were edited **after
01-27 landed** — 01-27's `bda6359` is an ancestor of every commit here, and its
`loadQueue` block is present in the file I edited. **Re-derived line numbers for
`quiesce`'s emit:** `private quiesce(` at **`:689`** and the
`this.deps.emit('hive:hookEvent', …)` call at **`:717`**. The plan's `<interfaces>`
cited `:671` from pre-01-27 HEAD; 01-27 shifted it by +46, which is why the edit
was anchored on the symbol and the exact call text rather than a number. The new
test case was appended immediately after 01-27's quiesce case, inside the region
01-27 left free.

### Frontmatter gates

`node ~/.claude/get-shit-done/bin/gsd-tools.cjs verify … 01-28-PLAN.md`:

| Gate | Before (`ed5fab4`) | After |
|---|---|---|
| `verify artifacts` | `passed: 0, total: 7` | **`all_passed: true, passed: 7, total: 7`** |
| `verify key-links` | `verified: 0, total: 3` | **`all_verified: true, verified: 3, total: 3`** |

### Measured grep gates, before → after

Every "before" was run at `ed5fab4` in this session and re-run after.

| Gate | Before | After |
|---|---|---|
| `grep -c "await enqueueMessage" .../MessageQueueComposer.tsx` | 0 | **1** |
| `grep -c "queueError" .../store/store.ts` | 0 | **3** |
| `grep -c "queueError" .../MessageQueueComposer.tsx` | 0 | **3** |
| `ls test/renderer-queue.test.cjs` | *No such file* | **present** |
| `grep -c "synthesized: true" src/main/delivery.ts` | 0 | **1** |
| `grep -c "synthesized" src/main/delivery.ts` | 1 (prose comment) | 2 |
| `grep -c "synthesized" src/preload/index.ts` | 0 | **3** (doc + both signatures) |
| `grep -c "synthesized" test/delivery-main.test.cjs` | 0 | **2** |
| `grep -c "stopArmDecision" .../useHive.ts` | 0 | **3** |
| `grep -c "e\.synthesized" .../useHive.ts` | 0 | **1** |
| `grep -c "effect #4" .../useHive.ts` | **3** (`:752`, `:873`, `:908`) | **0** |
| the claim-shaped regex on `useHive.ts` | **2** | **0** |
| `grep -rn "persistQueues" src/` | 1 (the dead definition) | **0** |

Both preload signatures were checked individually:
`grep -c "cb: (e: {.*synthesized?: boolean }) => void"` → 1, and
`grep -c "const listener = (_e: IpcRendererEvent, payload: {.*synthesized?: boolean })"` → 1.

### Suite, typecheck, lint — same-session delta

`npm test` is `node --test test/*.test.cjs`.

| Run | tests | pass | fail | skipped |
|---|---|---|---|---|
| Baseline, `ed5fab4`, this session | 603 | 597 | **0** | 6 |
| After all four commits | 623 | 617 | **0** | 6 |
| **Delta** | **+20** | **+20** | **0** | **0** |

`+20` = 19 new cases in `test/renderer-queue.test.cjs` plus 1 appended to
`test/delivery-main.test.cjs`. There is no pre-existing failure baseline on this
machine: fail was 0 before and is 0 after.

- `npm run typecheck` (`tsc --noEmit` for both `tsconfig.node.json` and
  `tsconfig.web.json`) — exit **0**, no diagnostics. This crosses all **seven**
  `enqueueMessage` call sites, re-derived with `grep -rn "enqueueMessage" src/`
  after every edit: 1 in `MessageQueueComposer.tsx`, 6 in `useHive.ts`
  (`:668`, `:672`, `:895`, `:914`, `:972`, `:1033` at HEAD).
- `npx eslint . --max-warnings 0` on the whole tree — exit **0**.

Diff sizes, `ed5fab4..HEAD`:

```
 12   1  src/main/delivery.ts
  7   2  src/preload/index.ts
 21   4  src/renderer/src/components/MessageQueueComposer.tsx
 80  23  src/renderer/src/hooks/useHive.ts
119  30  src/renderer/src/store/store.ts
 19   0  test/delivery-main.test.cjs
462   0  test/renderer-queue.test.cjs
```

`git diff --diff-filter=D --name-only` across all four commits: **empty**. No file
was deleted.

---

## Behavioural vs structural, stated plainly

**Exactly one structural assertion exists in this plan**, and it is labelled
STRUCTURAL in its own test name and in a comment at its site:

- `STRUCTURAL: no comment in useHive.ts presents a renderer-side drain as the live
  path` reads `useHive.ts` as text. **What it cannot see:** whether the code is
  correct. It only sees whether a comment still routes the next maintainer into a
  deleted file. It is written against the CLAIM rather than the label `effect #4`,
  so rewording cannot defeat it — the regex also matches the cheapest evasions
  ("the renderer then drains it to his PTY", "the composer effect types it into
  the REPL"). Measured at HEAD it matched two lines.

Everything else is BEHAVIOURAL: it calls the shipped function and reads what it
returns, or renders the shipped component and reads the markup. That includes the
markup assertions — they push the real `MessageQueueComposer` through
`renderToStaticMarkup` and assert on visible text, not on a source pin.

### The harness, honestly

The `Module._load` interceptor (`.css` → `{}`, `@/…` → `loadTs`) plus
`globalThis.self = globalThis`, and `seedServerSnapshot`'s shape, are copied from
`test/renderer-components.test.cjs:96-122` and `:155-161`.

**The `globalThis.window` stub is not copied from anything, because nothing to
copy exists.** Measured before writing the file:
`grep -rn "global.window\|globalThis.window\|global\.localStorage" test/` matched
nothing. `store.ts` needs no window to LOAD — every `window` access in it is
inside a `try/catch` — but a test that has to SCRIPT `window.cth.hiveQueue` and
`window.cth.rosterWrite` has to install one. This file is the first, and it says
so in its own header. It is safe because `node --test` runs each test FILE in its
own child process, verified by the sibling suites staying green
(`renderer-components` + `renderer-runstate` + `pty-sanitize` → `29 · pass 29 · fail 0`).

The seam that drives a synchronous roster write is `store.ts`'s own
`window.addEventListener('beforeunload', flushRosterNow)` registration — the stub
captures listeners and the test calls the registered function, rather than waiting
out the 500 ms debounce or reaching into module internals.

### MEASUREMENT UNAVAILABLE — recorded as unrun, not implied

- **Filling a queue to `MAX_QUEUED_PER_AGENT = 200`, typing a message, pressing
  Enter, and seeing the text survive with the reason on screen.** No test here
  presses a key: `renderToStaticMarkup` runs no effects and fires no events.
  Needs an operator on the real floor.
- **Watching a permission-prompted agent hold its `!` through a quiesce interval
  on the real floor.** Needs a live agent CLI session at a permission prompt.
- **`queueIt`'s own await-then-clear branch is not executed by any test.** Both
  halves it is built from ARE driven — `enqueueMessage`'s resolve value (cases
  1-6) and `statusHint`'s rendering of `queueError` (cases 7-9) — but the
  composition of the two runs only in the app. Stated rather than implied by the
  green ticks above.

---

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] `lastFlush` was a write-only ref that one of the three false comments described**

- **Found during:** Task 2, repointing the third comment.
- **Issue:** The comment claimed the `hive:delivered` effect stamps "the queue
  drain's per-agent cooldown so effect #4 does not type on top of it".
  `grep -n "lastFlush" src/renderer/src/hooks/useHive.ts` returned exactly two
  lines: the `useRef` declaration and the write. **Nothing reads it.** It is dead
  state left behind by the deleted renderer drain, and the comment could not be
  made true without touching the code — the only accurate comment would have said
  "we stamp a ref nothing reads", which is the exact `persistQueues` shape task 3
  of this same plan exists to end.
- **Fix:** the ref and its write are removed together with the comment that
  described them; the comment now states the effect's one remaining job and names
  `DeliveryService.drainQueue`'s own `FLUSH_COOLDOWN_MS` as the live pacer.
  Behaviour-identical — nothing read the value.
- **Files modified:** `src/renderer/src/hooks/useHive.ts`
- **Verified:** `grep -n "lastFlush" …` → no output. Full suite 0 failures,
  typecheck 0, eslint 0.
- **Commit:** `16d143d`

**2. [Rule 1 — Bug] The `persistQueues` prohibition was breached by my own comment prose**

- **Found during:** Task 3, gate measurement after the source change.
- **Issue:** `grep -rn "persistQueues" src/` read **2**, not 0 — the plan's `done`
  criterion requires nothing. Both hits were in comments I had just written, one
  narrating the defect and one marking where the function had stood. No code
  referenced it. The gate is a literal `grep`, so a comment breaches it exactly as
  a call would. This is the same trap 01-27 hit with `queueFile`.
- **Fix:** both lines rephrased ("the slice's old localStorage writer", "the queue
  slice's localStorage writer stood here"). Meaning preserved, token gone.
- **Files modified:** `src/renderer/src/store/store.ts`
- **Verified:** `grep -rn "persistQueues" src/` → no output; 19/19 still green.
- **Commit:** `0a6db9e` (folded in before the commit was made).

**3. [Rule 3 — Blocking] A load-time assertion in the test file aborted the whole file**

- **Found during:** the first RED run.
- **Issue:** `assert.equal(typeof stopArmDecision, 'function')` at module scope
  threw before `node:test` registered anything, so the RED run reported
  `tests 1 · fail 1` and **hid the other 18 cases**. A missing export is exactly
  the condition a RED run exists to show, and it made every other gap invisible.
- **Fix:** that check moved into a `decide()` wrapper the task-2 cases call, so a
  missing export fails its own CASE. The other three load-time checks stay — they
  guard modules that exist at HEAD.
- **Files modified:** `test/renderer-queue.test.cjs` (before the RED commit)
- **Commit:** `021651c`

### Not deviations, but worth recording

- **The six `useHive.ts` `enqueueMessage` call sites were reconciled, not edited.**
  All seven were re-derived with `grep -rn "enqueueMessage" src/` after each edit
  and all seven typecheck clean. They are not edited because the refusal is parked
  at the SHARED function: `queueRefusal` writes `queueError` for the target agent
  on every path, so a refused Slack ingress or work order leaves a visible trace on
  that agent's composer without six per-site edits — and the next producer someone
  adds is covered too. Truth #2's claim is that every call site *can* tell
  acceptance from refusal, and the returned `Promise<QueueOpResult>` is what makes
  that true.
- No package installs, no `package.json` change (T-P28-SC). `react` /
  `react-dom` were already production dependencies.
- No line-range edits anywhere. Every source edit was anchored on a symbol or an
  exact existing string, which mattered concretely: task 1 moved the dead queue
  writer from `:535` to `:584`, so the plan's HEAD range `:529-544` would have
  deleted live code, and 01-27 moved `quiesce`'s emit from `:671` to `:717`.
- `blockReason` surviving an idle is asserted nowhere (`R-23`).
- `R-21`'s stronger claim (that mail STOPS for a stuck-`blocked` agent) is not
  repeated anywhere in this summary or in any comment written by it.

### No stubs, no new threat surface

No hardcoded empty values, placeholder text or unwired components were
introduced. No new network endpoint, auth path, file-access pattern or schema
change at a trust boundary: the roster change *narrows* an existing write, the
delivery change adds one boolean to an existing payload, and the store change adds
a renderer-memory-only slice that is never persisted.

---

## Threat register outcomes

| Threat ID | Disposition | Evidence |
|---|---|---|
| T-P28-01 | mitigated | `queueOp` returns main's result; the composer clears only on `ok`; the refusal renders at queue length 0 and 1 (cases 7-8, RED before). |
| T-P28-02 | mitigated | Five refusal reasons surfaced through `queueError`; 01-27's transient-fault string asserted verbatim (case 2) and rendered as `main declined: …`, attributed rather than adopted. |
| T-P28-03 | mitigated | `stopArmDecision({status:'blocked'}, {blocked:false, synthesized:true})` returns no patch and no breaker clear (case 45/10). |
| T-P28-04 | mitigated | A REAL Stop still idles a blocked agent (case 46/11). `R-21`'s stronger claim is false and is not restated. |
| T-P28-05 | mitigated | `clearBreaker` is true for every real turn-end including the blocked case (case 46/11) — the only clear there is (`R-22`). |
| T-P28-06 | **accepted + documented** | Recorded above as residual **(b)**, with its recovery path and owner. Main holds no blocked status to filter on; no blocked-status channel was built here. |
| T-P28-07 | mitigated | One-shot consumed only by a landed write; both flush payloads pasted; failed/skipped writes leave the slice armed (case 51/16). The dead writer is gone with its doc block. |
| T-P28-08 | mitigated | The op-reply path routes through `setQueues`, restoring the single-writer claim in that action's own doc. |
| T-P28-SC | mitigated | No installs; `package.json` untouched; one file created, six modified, none deleted. |

An extra residual not in the register: **(a)** above, a false `blocked` landing
after the last real Stop. Owner: plan 01-31.

---

## Success criteria

| Criterion | Verdict |
|---|---|
| A refused message stays in the draft with main's reason rendered, at any queue length | **TRUE** — cases 1-8, RED before / GREEN after, including the empty-queue case that rendered nothing at HEAD. The end-to-end keypress is MEASUREMENT UNAVAILABLE and recorded as such. |
| `enqueueMessage` reports acceptance to all seven of its callers | **TRUE** — signature returns `Promise<QueueOpResult>`; all seven re-derived and typecheck clean; refusals parked at the shared function so every producer leaves a trace. |
| A permission-prompted agent keeps its `needs you` state through the quiesce interval, and a falsely-blocked one still recovers on its next real turn-end | **TRUE for the renderer arm** — cases 10-14 plus the producer-side `synthesized: true` asserted where the emit lives. **Two residuals accepted and recorded above**, including the case where no next real turn-end arrives. |
| No comment in `useHive.ts` presents any renderer-side drain as live | **TRUE** — `grep -c "effect #4"` 3 → 0, claim regex 2 → 0, and the dead ref one of them described is gone. |
| `roster.json` carries the pre-FLOOR-02 queue at most once | **TRUE** — both flush payloads pasted; a failed or skipped write does not consume the one-shot; the normal no-queue boot writes `{}` from the first flush. |

---

## Self-Check: PASSED

Files claimed created/modified, checked on disk:

```
FOUND: test/renderer-queue.test.cjs
FOUND: src/renderer/src/store/store.ts
FOUND: src/renderer/src/components/MessageQueueComposer.tsx
FOUND: src/renderer/src/hooks/useHive.ts
FOUND: src/main/delivery.ts
FOUND: src/preload/index.ts
FOUND: test/delivery-main.test.cjs
```

Commits claimed, checked in `git log`:

```
FOUND: 021651c   FOUND: 5878d06   FOUND: 16d143d   FOUND: 0a6db9e
```
