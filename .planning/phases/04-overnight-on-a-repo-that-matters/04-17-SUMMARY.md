---
phase: 04-overnight-on-a-repo-that-matters
plan: 17
subsystem: api
tags: [phone-pwa, web-push, service-worker, approvals, csp, watchdog, gate-05, vigil-01]

# Dependency graph
requires:
  - phase: 04-11
    provides: "AbsenceWatchdog + the `watchdog` Floor member (`boot.ts:112`) whose `current()` this plan reads; `floorQuietPushPayload` / `FLOOR_QUIET_TAG` in push.ts"
  - phase: 04-15
    provides: "ApprovalRegistry, and HookServer's `openApprovals()` / `answerApproval()` named accessors on the already-declared `hookServer` Floor member"
  - phase: 02-09
    provides: "the finished phone trust boundary — bearer-in-header, byte-identical 401s, phone rate bucket, PHONE_LOCKOUT_*, the body cap, PHONE_TASK_ID_RE, and the hash-pinned PWA bundle"
provides:
  - "GATE-05's operator surface: a tool approval is served by `GET /phone/api/asks` behind `kind:'tool'` and settled by `POST /phone/api/answer` — no new endpoint, no new trust boundary"
  - "VIGIL-01's phone half: `floorQuiet` as a SIBLING field on the asks response, rendered as a pinned non-interactive `p-quiet-bar` strip"
  - "`PhoneAsk.kind` / `PhoneAsk.expiresInMs`, `PhoneFloorQuiet`, `PhoneAnswerOutcome`, `PHONE_TOOL_ANSWERS` — the wire contract for both"
  - "A skew-immune countdown on the phone: server-measured duration, re-derived every 1000ms from an anchor, `expiring` below 10s, `expired` at zero, no optimistic UI"
  - "`askPushPayload` in push.ts (COMPOSITION ONLY — see Known Stubs) and the one-line `sw.js` body fallback that makes it compatible in both directions"
affects: [04-18, 04-19, 04-20, any plan that adds a PushSubscription intake route]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Publish into a finished trust boundary rather than building a second one: a new payload kind rides an existing authenticated endpoint behind a discriminator"
    - "A wire value the client counts against is always a DURATION measured at response time, never a deadline timestamp"
    - "Two-literal allowlist at a transport boundary, refused with the boundary's own existing error path so the failure is byte-identical to ones already tested"
    - "Lift a pure helper out of a non-executed hand-written bundle and run it in the test, so a text-only assertion becomes a behavioural one"

key-files:
  created: []
  modified:
    - src/main/webhook.ts
    - src/main/index.ts
    - src/main/push.ts
    - resources/phone/index.html
    - resources/phone/sw.js
    - test/webhook-endpoints.test.cjs
    - test/build-assets.test.cjs
    - .planning/phases/04-overnight-on-a-repo-that-matters/deferred-items.md

key-decisions:
  - "D-09 honoured literally: the operator is asked through the phone surface Phase 2 already finished. The auth block of test/webhook-endpoints.test.cjs has ZERO diff — the file is append-only — and boot.ts has zero diff."
  - "D-10 honoured: approvals merge into openAsks() behind kind:'tool' and nothing is written to tasks.json."
  - "The two accepted answer literals are `approve` and `deny` (04-UI-SPEC §S1b's locked send semantics), not the plan text's illustrative `yes`/`no`. The phone sends no literals today — the card path posts free text — so the spec's pair is the only real source."
  - "T-04-ASK-34 overrides §S1b's 'any other string is treated as a deny': anything outside the two literals is a 400 in webhook.ts BEFORE answerAsk runs, leaving the ask pending to expire into its own deny. Fail-closed either way, but the operator gets an error instead of a silent verdict."
  - "The allowlist is asserted TWICE — in webhook.ts (the honest 400) and again in index.ts's answerToolAsk (the security guarantee). If the transport's classification ever misses, the worst outcome is 'nothing happened', never an accidental YES."
  - "`PhoneFloorQuiet` is declared IN webhook.ts rather than importing QuietSnapshot, keeping that file's rule that no floor/hive type enters the transport. index.ts maps snapshot → wire (inFlight becomes a count, per the locked wire shape)."
  - "expired-vs-settled is derived from a bounded id→expiresAt memo in index.ts, because HookServer.answerApproval returns a bare boolean and hooks.ts belongs to plan 04-15. An unknown id answers exactly what a settled id answers, so the response leaks nothing about whether the id exists."
  - "The `reason` sentence from §S1b's screen-2 sketch is NOT on the wire: PhoneAsk was locked to gain exactly two fields, and `question` carries the command. Stated as a gap, not shipped as a third field."

patterns-established:
  - "Discriminator-plus-optional-fields for wire evolution: absent === the old kind, so every pre-existing producer and consumer stays valid untouched in both directions"
  - "Paired gates: every absence assertion ships beside a positive lower bound, so an empty or unwritten file cannot satisfy either half alone"
  - "Mutation-verified source-shape clauses: new grep-style tests are run against the pre-change file and must FAIL there before they are trusted"

requirements-completed: [GATE-05, VIGIL-01]

# Metrics
duration: 24min
completed: 2026-08-25
---

# Phase 04 Plan 17: The Phone Channel Summary

**A tool approval and the floor-quiet alarm both ride `GET /phone/api/asks` + `POST /phone/api/answer` behind a `kind` discriminator and a sibling field — no new endpoint, no new trust boundary, no identifier renamed, and a skew-immune countdown that refuses to show a number in the last ten seconds.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-08-25T16:27:05Z
- **Completed:** 2026-08-25T16:51:30Z
- **Tasks:** 3
- **Files modified:** 8 (7 source/test + deferred-items.md)

## Accomplishments

- GATE-05's operator surface published into Phase 2's finished boundary: `PhoneAsk` gained two optional fields, `answerAsk`'s return widened, `openPhoneAsks()` merges `HookServer.openApprovals()`. Zero new routes, zero auth changes, zero renames.
- VIGIL-01's phone half: `floorQuiet` is a sibling of `asks`, read through plan 04-11's `floor.watchdog.current()`, rendered as a pinned `role="status"` strip with no button, no handler, no cursor and no dismissal — and `asks.length` is provably unchanged when it fires.
- The countdown is a server-measured duration re-derived every 1000 ms from an anchor: no deadline is stored or sent (`expiresAt` appears zero times in the phone bundle), nothing is decremented, `expiring` below 10 s, `expired` at zero with the decision controls disabled and focus moved off the button being disabled.
- `sw.js` changed by **exactly 1 insertion and 1 deletion**, and both compatibility directions are executed against the shipped expression rather than restated.
- Test count 1020 → **1035** (+15), **0 failures**, skipped unchanged at 7. `npm run typecheck` and `npm run lint` both clean.

## Task Commits

1. **Task 1: the wire — two optional fields, a widened return, the registry merge** — `762d5ef` (feat, TDD)
2. **Task 2: the phone — a tool ask, a skew-immune countdown, the pinned quiet strip** — `35023b9` (feat)
3. **Task 3: one line of sw.js, and the push payload true on an old worker** — `effd9cc` (feat)

## Files Created/Modified

- `src/main/webhook.ts` — `PhoneAsk.kind` / `.expiresInMs`; new `PhoneFloorQuiet`, `PhoneAnswerOutcome`, `PHONE_TOOL_ANSWERS`; the injected `floorQuiet` getter; `handlePhoneAsks` emits the sibling field; `handlePhoneAnswer` gained the two-literal gate and normalizes `{ok, state}`; new private `isToolAsk`.
- `src/main/index.ts` — `openPhoneAsks` merges the approval registry behind the discriminator and computes `expiresInMs` at response time; new `phoneFloorQuiet` (the single `floor.watchdog.current()` read), `answerToolAsk`, and the bounded `toolAskExpiry` memo; `answerPhoneAsk` routes and widens; one line added to the webhook wiring block.
- `src/main/push.ts` — `askPushPayload` (composition only; see Known Stubs).
- `resources/phone/index.html` — `--p-warn-fill`, `.p-quiet-bar`, `.p-ask-tool`, `.p-ask-cmd`, `.p-countdown`, `.p-command`, `.p-decide*`; `formatRemaining`, `humanDuration`, `remainingFor`, `isTool`, `askById`, `tickCountdowns`, `sendDecision`, `screenToolHtml`; `state.floorQuiet` / `state.receivedAt` / `state.verdict`; **both CSP hashes regenerated in the same commit**.
- `resources/phone/sw.js` — one line: the body fallback.
- `test/webhook-endpoints.test.cjs` — **append-only**, +8 cases (+252 lines).
- `test/build-assets.test.cjs` — +7 cases (+201 lines).
- `.planning/phases/.../deferred-items.md` — the stale `sw.js` security comment.

## Measurements (recorded, not asserted from memory)

Line numbers **re-measured at wave start**, as the plan required, because plans 04-05 and 04-18 also edit this 4 900-line file and the plan's quoted `:1219-1260` / `:1315-1323` are wave-0 coordinates:

| Symbol in `src/main/index.ts` | At wave start | After this plan |
|---|---|---|
| `function openPhoneAsks` | **1222** | 1250 |
| `function answerPhoneAsk` | **1249** | 1343 |
| `openAsks:` wiring line | **1322** | 1421 |

Occurrence counts (`grep -o … | wc -l`, never `grep -c`):

| Gate | Before | After | Verdict |
|---|---|---|---|
| `taskId` in `src/main/webhook.ts` | 14 | **16** | did not fall — nothing renamed |
| `taskId` in `resources/phone/index.html` | 21 | **34** | ≥ 21 ✓ |
| `taskId` in `resources/phone/sw.js` | 10 | **10** | unchanged ✓ |
| `'ask:'` in `sw.js` | 1 | **1** | tag scheme untouched ✓ |
| `git diff --numstat sw.js` | — | **1 / 1** | exactly one line ✓ |
| `p-quiet-bar` | 0 | **2** | ≥ 2 ✓ |
| `receivedAt` | 0 | **4** | ≥ 2 ✓ |
| `expiresInMs` in the phone bundle | 0 | **4** | ≥ 2 ✓ |
| `expiresAt` in the phone bundle (`-i`) | 0 | **0** | ✓, paired with the positive above |
| `setInterval` in the phone bundle | 1 | **2** | +1 exactly ✓ |
| `remaining--` / `-=` / `--remaining` | 0 | **0** | ✓, paired with the `setInterval` positive |
| `floor.watchdog.current()` in `index.ts` | 0 | **1** | exactly 1 ✓ |
| `git diff --stat src/main/floor/boot.ts` | — | **empty** | the accessor was created by 04-11 ✓ |

**D-35 boundary held.** `git diff 04d71b1..HEAD` touches none of `hooks.ts`, `control.ts`, `approvals.ts`, `hiveTemplates.ts`, `boot.ts` or `src/renderer/**`.

### RED runs

- **Task 1 (tdd):** `node --test test/webhook-endpoints.test.cjs` → **42 pass / 4 fail** before implementation. The four reds were the three-outcome answer case, the two-literal allowlist case, the `floorQuiet` sibling case, and the named-accessor case. GREEN after: **46 / 46**.
- Two of the six new task-1 cases passed on first write and that is expected, stated rather than hidden: the ask-id-regex case asserts a property of plan 04-15's already-shipped `ApprovalRegistry` (the plan asked for it to be verified by test rather than by inspection), and the `kind:'tool'` GET case injects the shape through `openAsks`, which the `.cjs` test does not typecheck — its real teeth are `npm run typecheck` against `index.ts`'s producer, which is where a missing `PhoneAsk` field fails.
- **Task 2** is not a TDD task, so its clauses were **mutation-verified instead**: the phone file was swapped to its pre-change content and the suite re-run. Three of the four new source-shape clauses **failed** there; the fourth is the no-rename gate, which correctly passes in both states. The file was restored and re-verified green.

## Decisions Made

Recorded in the frontmatter `key-decisions` block. The two that most change the shipped behaviour:

1. **The accepted literals are `approve` / `deny`.** The plan's text offered `yes`/`no` "or whatever two the phone already sends — read `resources/phone/index.html`'s POST body". Reading it showed the phone sends **free text** from a textarea today: there are no existing literals. 04-UI-SPEC §S1b's send semantics lock the pair as `'approve' | 'deny'`, and the phone half of this plan is what first sends them, so the spec's pair is authoritative.
2. **A malformed tool answer is a 400 with the ask left pending**, not a deny. §S1b says "any other string for a `kind:'tool'` ask is treated as a deny"; the plan's threat register (T-04-ASK-34) and its acceptance criteria require the 400 and require the entry to be **re-read and found still pending**. Both are fail-closed — a pending ask expires into a deny anyway — but the 400 tells the operator their tap failed instead of silently converting it into a verdict. The plan wins over the spec sketch here because the plan is the executable contract and it names the threat.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing Critical] The `data-action` gate could not pass on correct code; replaced with the property it names**

- **Found during:** Task 2.
- **Issue:** The criterion reads *"`grep -o 'data-action' resources/phone/index.html | wc -l` is unchanged — the strip added no handler"* (before: 7). Task 2 also adds the `approve` and `deny` decision buttons, which legitimately require handlers, so the literal gate is unsatisfiable by a correct implementation. This is exactly the T-04-ASK-37 shape the plan itself catalogues, one layer up.
- **Fix:** The gate was **not loosened**. It was replaced with a strictly stronger assertion of the property the criterion names: the `p-quiet-bar` render line contains no `data-action` and no `<button`, it carries `role="status"`, and its CSS block contains no `cursor`. Plus `state.floorQuiet` is asserted to be its own state slot and `kind: 'alarm'` asserted absent.
- **Measured:** `data-action` 7 → 16. The nine additions are: one comment stating the strip has none, the tool screen's `back` button, `approve`, `deny`, the two `wireEvents` queries, two in the focus guard, and the focus-restore query. **None is inside the strip.**
- **Committed in:** `35023b9`.

**2. [Rule 2 — Missing Critical] Nothing in this repo parsed the phone bundle**

- **Found during:** Task 2, after adding ~300 lines of hand-written JS to it.
- **Issue:** The CSP clause digests **bytes, not syntax**. A typo in this framework-free bundle ships a phone that boots to a blank screen, with no local reproduction and no test that would catch it.
- **Fix:** A `node:vm` parse gate over the extracted `<script>` block, with a length guard so an empty extraction cannot pass.
- **Committed in:** `35023b9`.

**3. [Rule 2 — Missing Critical] The plan's own "accepted residual" was made smaller rather than merely restated**

- **Found during:** Task 2.
- **Issue:** The plan accepts that the countdown's behaviour has no automated coverage because nothing executes the phone's JS. But `formatRemaining`, `humanDuration` and the floor-quiet copy function are **pure** — they are liftable and runnable.
- **Fix:** They are lifted out of the *committed* bundle and executed, giving rule G-3's full format table and rule Q-1b's three copy cases real behavioural coverage (including the 10 s boundary, negative and undefined durations, and `1 card was` vs `2 cards were` grammar). The same technique covers `escapeHtml` for T-04-ASK-35 and the `sw.js` fallback for rule Q-4.
- **Committed in:** `35023b9`, `effd9cc`.

**4. [Rule 2 — Missing Critical] The two-literal allowlist is enforced in two places, not one**

- **Found during:** Task 1.
- **Issue:** The plan puts the allowlist at the transport (so the 400 is byte-identical to the tested malformed-body path). But `webhook.ts` classifies a tool ask by calling `openAsks()`, and a throwing thunk would route the answer down the free-text card path.
- **Fix:** `index.ts`'s `answerToolAsk` re-checks the two literals and returns `{ok:false}` for anything else, so a classification miss can never become an accidental approve. Both layers are commented with the reason.
- **Committed in:** `762d5ef`.

---

**Total deviations:** 4 auto-fixed (all Rule 2 — missing critical correctness/security or unenforceable-gate repair).
**Impact on plan:** No scope creep. Nothing was loosened: the one unsatisfiable gate was replaced with a stronger assertion of its own stated property, and every other measured gate was met as written.

## Interface / spec divergences, stated

1. **`AnswerOutcome`'s locked type has no 400 channel**, so the malformed-literal refusal had to live in `webhook.ts` rather than being returned by `answerAsk`. This is also what makes the 400 byte-identical to the already-tested malformed-body failure, so the constraint and the requirement agree.
2. **`PhoneFloorQuiet` is declared in `webhook.ts`**, not imported as `QuietSnapshot` (as the plan's prose suggested). The spec's wire shape has `inFlight: number` while `QuietSnapshot.inFlight` is an array of card objects, and `webhook.ts`'s own house rule is that no floor type enters it. `index.ts` maps between them.
3. **`floorQuiet.card` is emitted but not rendered.** It is in the locked wire shape; it is set only when exactly one card is in flight. None of §S6a's three copy cases uses it, so the phone ignores it. Kept rather than dropped so the shipped shape matches the contract byte-for-byte.
4. **`floorQuiet.agent` carries the god's display name and is present only when `godDead` AND the registry names a god.** A god-death with no resolvable name degrades to the generic "The floor has stopped" sentence, which is still true.
5. **The `reason` sentence is not on the wire.** §S1b's screen-2 sketch shows the `ASK_*` sentence below the command; `PhoneAsk` was locked to gain exactly two fields, so `question` carries the command and the reason is not shown. The operator sees *what* would run but not *why it was flagged*. Not shipped as a third field, and named here rather than left to be discovered.

## Known Stubs

| Stub | File | Reason |
|---|---|---|
| `askPushPayload` is never called | `src/main/push.ts` | **COMPOSITION ONLY.** This process has never held a `PushSubscription`: `webhook.ts` has no subscription-intake route, so nothing has ever captured one. Identical standing to plan 04-11's `floorQuietPushPayload`, which is also uncalled. **GATE-05's push leg (D-25 channel ③) is NOT delivered by this plan.** What *is* delivered and asserted is the payload's shape and its lock-screen safety property. Whoever adds the intake route wires both composers to it. |

## Threat Flags

None. Every surface this plan touches was already in the plan's `<threat_model>`: the boundary is Phase 2's, unchanged; the ask id is 04-15's capability; the notification body's rule is preserved and asserted; `sw.js`'s live-device risk is capped at one line.

## Issues Encountered

- **The plan's `grep -c 'floor.watchdog.current()' … returns 1` gate counted 2** on first GREEN, because the doc comment above the call repeated the literal. Resolved by rewording the comment, not by loosening the gate to `>= 1`. The gate's intent — one call site, no second copy of the state — is preserved exactly.
- **`sw.js:33-35`'s security comment is now false** and could not be corrected here: rule Q-5 caps that file at one changed line and the plan's `git diff --numstat` = 1/1 gate enforces it mechanically. The security property still holds (both payload composers are asserted to carry no command, path or question) but the *guarantee moved from the worker to the sender* while the comment still claims the worker enforces it. **Logged to `deferred-items.md`** with the one-comment fix named, for the next plan permitted to touch `sw.js`. Loosening the gate to fit the fix was refused.

## Accepted residuals, stated rather than implied

1. **The phone's render path and its interval have no executable coverage in this repo.** The pure rules (`formatRemaining`, `humanDuration`, the floor-quiet copy, `escapeHtml`, the `sw.js` fallback) are now executed against the committed source; the DOM path, `tickCountdowns`, `sendDecision` and the re-anchor are covered by structure and literals only. Bounded by: **plan 04-18** unit-testing the identical rule table through the desktop's `formatRemaining` in wave 6, **plan 04-18** owning the phone-vs-desktop literal cross-check in `test/build-assets.test.cjs` (named here so the closing sweep finds a handoff, not a hole), and **plan 04-19 task 3**'s physical-device attempt.
2. **No physical device exists in this wave.** The claim this plan makes is *"a tool approval is answerable through the phone's own endpoints, device-unverified"* — **not** "answerable on the phone". The device attempt is plan 04-19 task 3, in wave 7.
3. **Inherited drift left alone, as instructed:** `openPhoneAsks` still sends `ask.agent = t.assignee`, the raw agent id rather than the display name, on the card path. The tool path does the same for consistency. Out of Phase 4's requirement list.

## User Setup Required

None — no external service configuration required. No dependency was added (D-36 held: `package.json` and `package-lock.json` are untouched).

## Next Phase Readiness

- **Plan 04-18 (wave 6, renderer)** owns the desktop `formatRemaining` and must add the phone-vs-desktop literal cross-check to `test/build-assets.test.cjs`. The phone's four literals are `'m '`, `'s left'`, `'expiring'`, `'expired'`, already pinned there against §S1 rule G-3's table copied in as a literal array with its source named.
- **The renderer re-declares its own `HiveTask` and `parseTasks` is a whitelist** — this plan added no card field, so nothing new is needed there.
- **Whoever adds the `PushSubscription` intake route** inherits two ready composers (`askPushPayload`, `floorQuietPushPayload`) and the `sw.js` fallback that makes them safe on an installed old worker. That route is the one thing standing between the composed payloads and a working D-25 channel ③.
- **Blocker on nothing.** Full suite 1035 tests / 0 failures / 7 skipped, typecheck clean, lint clean, at `effd9cc`.

## Self-Check: PASSED

- All 8 claimed files exist on disk (`ls -l`, run at SUMMARY time).
- All 3 claimed commits resolve in `git log --oneline --all`: `762d5ef`, `35023b9`, `effd9cc`.
- Every number in the Measurements table was produced by a command in this session, not recalled. `npm test` → 1035 / 1028 pass / **0 fail** / 7 skipped; `npm run typecheck` and `npm run lint` both exit clean, all three re-run at `effd9cc`.

---
*Phase: 04-overnight-on-a-repo-that-matters*
*Completed: 2026-08-25*
