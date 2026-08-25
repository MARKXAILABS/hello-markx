---
phase: 04-overnight-on-a-repo-that-matters
plan: 12
subsystem: ui
tags: [react, renderer, kanban, ask-me, relative-time, accessibility, vigil-04, vigil-02]

# Dependency graph
requires:
  - phase: 04-04
    provides: "card-level `updatedAt` stamped by both ledger writers (bin/task.cjs TASK_CLI and HiveManager.writeTasks at hive.ts:2304), plus the `updatedAt`/`released` fields on main's HiveTask"
  - phase: 04-08
    provides: "the two-write card release in src/main/floor/lifecycle.ts — write 1 `{by, at}` at :203, write 2 `{branch, detail}` at :300 — which is the data this plan renders"
provides:
  - "src/shared/relAge.ts — one terse relative-age formatter returning {text, unit}, so staleness needs no threshold constant"
  - "An unconditional kanban meta row carrying assignee-or-DROPPED-BY plus a four-channel age"
  - "<TaskAge>, the single age element both the kanban card and the ASK ME header render"
  - "The absolute updatedAt, the release sentence, the branch and released.detail in the TaskDetail overlay"
  - "Renderer-side parsing of `updatedAt` and `released` (parseTasks whitelist + releasedOf normalizer)"
  - "A test harness that server-renders the REAL AskMeTab board by seeding the shared task poll's module cache"
affects: [04-13, 04-14, 04-16, 04-17, 04-18, 04-19, VIGIL-01-floor-quiet-chip]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Age is derived at render from a stored timestamp, never stored (D-32)"
    - "Staleness is read off the formatter's own unit letter, not off a threshold constant — text and emphasis cannot drift apart"
    - "A shared formatter is pinned to its original by lifting the original's SOURCE and evaluating it, so a deliberate divergence stays deliberate"
    - "A component whose data arrives through an effect is exported so the server-render suite can measure it directly"

key-files:
  created:
    - src/shared/relAge.ts
  modified:
    - src/renderer/src/components/TasksKanban.tsx
    - src/renderer/src/components/AskMeTab.tsx
    - test/renderer-components.test.cjs

key-decisions:
  - "D-31 confirmed by re-measurement: humanQA.askedAt was already declared (TasksKanban.tsx:15) and parsed (:100); the gap was rendering only, and the phone needed no change."
  - "D-32 held: no elapsed value is written anywhere. relAge runs at render time on both surfaces."
  - "One deliberate divergence from WorkersTab.tsx:20 — a !Number.isFinite guard — because the shipped function returns the STRING 'NaNd' for NaN and 'Infinityd' for Infinity (both measured live)."
  - "The tooltip lives on the age element rather than on the card button, so each element's tooltip describes itself; the card button's title carries the release sentence (rule R-1/R-2) and keeps 'open task details' otherwise."
  - "TaskDetail resolves released.by through a useNameFor() hook rather than a new prop, so TaskDetailOverlay.tsx (not in this plan's file list) needed no change."
  - "An ask with no askedAt falls back to the card clock and the tooltip SAYS so — rendering 0s would disguise a nine-hour-old ask as brand new."
  - "AskMeTab's local task list is now seeded from the shared poll's already-warm cache instead of from an empty array."

patterns-established:
  - "Four-channel distinction: unit letter + colour + weight + icon, asserted as ONE test per surface, with the fresh render's absence of all four asserted in the same case."
  - "Placement rules are asserted on rendered MARKUP offsets, not on source-file line numbers."
  - "Negative assertions (no placeholder, no emphasis) always carry a positive lower bound in the same test."

requirements-completed: [VIGIL-04, VIGIL-02]

# Metrics
duration: 34min
completed: 2026-08-25
---

# Phase 04 Plan 12: Age on the Board and the Released Card — Summary

**A four-channel age (unit letter, ink ramp, weight 600, clock icon) derived at render on every kanban card and every unanswered ASK ME question, plus `DROPPED BY {name}` in coral on the meta row a released card's cleared assignee vacated — with the branch confined to the tooltip and the detail overlay and no placeholder anywhere.**

## Performance

- **Duration:** ~34 min
- **Started:** 2026-08-25T15:05:00Z (approx., first tool call)
- **Completed:** 2026-08-25T15:39:07Z
- **Tasks:** 3
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- **VIGIL-04 on the board.** `TasksKanban.tsx`'s conditional assignee line is now an unconditional flex meta row carrying `[label flex:1 ellipsis][age flexShrink:0 marginLeft:auto]`. A nine-hour card and a four-minute card differ on all four channels rule A-2 names, and `done` cards are exempt while `todo` deliberately is not.
- **VIGIL-04 on the ask board.** Every unanswered ASK ME question renders its age in the header's existing `gap: 8`, inserted immediately before the recipient badge's wrapper span.
- **VIGIL-02 on one existing row.** `DROPPED BY ADA` in `--cth-coral` occupies the slot releasing the card cleared, beside the age — *who* and *how long ago*, which is the whole requirement. The branch goes to the `title` attribute and the detail overlay (`wordBreak: break-all`, copying `WorkersTab.tsx:161`), never to the card body, and there is no placeholder while write 2 is outstanding.
- **One shared formatter, four existing copies untouched.** `src/shared/relAge.ts` returns `{text, unit}`, so rule A-2's stale test is literally "the unit is `h` or `d`" — the letter on screen and the emphasis behind it are read off the same value and cannot disagree.
- **13 new tests**, including two four-channel acceptance tests (one per surface) that each assert all four channels present on the stale render and all four absent on the fresh one.

## Task Commits

1. **Task 1: One shared terse age formatter** — `97466ef` (test, RED) → `a83f0b4` (feat, GREEN)
2. **Task 2: The kanban meta row — age, staleness, and DROPPED BY** — `5b21a97` (feat)
3. **Task 3: The ASK ME age, and the four-channel acceptance test** — `498af77` (test, RED) → `e22993f` (feat, GREEN)

## TDD Gate Compliance

Both `tdd="true"` tasks ran the full RED→GREEN cycle with the RED committed separately.

| Task | RED gate | Measured RED outcome | GREEN gate |
|---|---|---|---|
| 1 | `97466ef` | `ENOENT ... src/shared/relAge.ts` at load — 1 test, 0 pass, **1 fail** | `a83f0b4` — 10 tests, 10 pass |
| 3 | `498af77` | 20 tests, 17 pass, **3 fail**; the failure message printed the board's empty state (`Nothing needs you right now.`), i.e. red for the intended reason and not for a missing import | `e22993f` — 20 tests, 20 pass |

No REFACTOR commit was needed on either.

## Files Created/Modified

- **`src/shared/relAge.ts`** *(created, 64 lines)* — `relAge(ms) -> {text, unit}` and `isStaleUnit(unit)`. Electron-free, DOM-free, no node builtins; visible to both tsconfig projects. Carries the one documented divergence from the shipped function, with the measurement beside it.
- **`src/renderer/src/components/TasksKanban.tsx`** — `updatedAt` and `released` added to the local `HiveTask` and to `parseTasks`' whitelist; `releasedOf()` normalizer; exported `localStamp()`, `TaskAge` and `TaskCard`; `useNameFor()` hook replacing the inline resolver; the unconditional meta row; the card `title`; the overlay's absolute `UPDATED` stamp and its release block.
- **`src/renderer/src/components/AskMeTab.tsx`** — imports `TaskAge`/`localStamp`; `askAge()` builds rule A-3's tooltip with the no-`askedAt` fallback; `<TaskAge>` inserted before the badge wrapper; the local task list seeded from the shared poll's cache.
- **`test/renderer-components.test.cjs`** — +13 tests and the `renderAskBoard()` / `ageElement()` / `shippedRelAge()` / `CLOCK_PATH` harness additions.

## Decisions Made

**D-31, re-measured and confirmed.** `TasksKanban.tsx:15` declares `askedAt?: string` and `:100` parses it. `openPhoneAsks` (`index.ts:1229-1235`) already emits and sorts on it, and the phone already renders relative time. The gap was rendering only. **`resources/phone/` and `src/main/index.ts` are byte-identical to the base commit.**

**D-32 held.** Nothing in this plan writes an elapsed value. `TaskAge` calls `relAge(Date.now() - Date.parse(iso))` inside the render.

**The one intentional divergence, with its measurement.** `WorkersTab.tsx:20` guards with `if (ms < 1000) return '0s'`. `NaN < 1000` is **false**, so a NaN falls through to `Math.round(NaN / 1000)` and reaches the last branch intact. Measured live at the base commit:

```
relAge(NaN)      -> 'NaNd'
relAge(Infinity) -> 'Infinityd'
relAge(-1)       -> '0s'     (already correct, needs nothing)
```

`src/shared/relAge.ts` guards with `!Number.isFinite(ms) || ms < 1000` instead (threat T-04-AGE-06 — a malformed `updatedAt` reaches this as NaN through `Date.parse`, and a card reading `NaNd` looks like a crash rather than a missing timestamp). **`WorkersTab.tsx` is NOT changed to match** (rule A-1). The divergence is pinned by a test that lifts WorkersTab's real source, evaluates it, asserts it still produces `'NaNd'` as a positive control, and compares every finite boundary against the new module — so the day somebody "restores parity" the suite says so.

**Where the tooltips live.** Rule A-3's `updated …` / `created … — never updated` sits on the **age element**, and rule R-1/R-2's release sentence sits on the **card button**. Each element's tooltip describes itself, the card keeps its `open task details` affordance hint when nothing was released, and both required strings are present.

**`useNameFor()` instead of a new prop.** `TaskDetail` needs `released.by` resolved to a display name, and its only host is `TaskDetailOverlay.tsx` — a file this plan's `files_modified` does not list. A hook keeps that file untouched and collapses `TasksKanban`'s inline resolver into the same three lines.

**Re-measured insertion point: the UI-SPEC was right.** `04-UI-SPEC.md` § S5 rule A-4 gives the ASK ME insertion point as "immediately before `:230`", with the badge wrapper at `:230-232` and the `PixelBadge` at `:231`. Measured at the base commit: `:230` is `<span title={\`your answer will be sent to ${recipient}\`}>` and `:231` is the `PixelBadge`. **Rev 2's line numbers matched exactly; no correction was needed.** (The inherited leaf glyph is at `:193` and the coral `BLOCKING N DOWNSTREAM TASKS` at `:305`, both as documented, both untouched.)

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 2 — Missing critical] `parseTasks` is a whitelist, so `updatedAt` and `released` had to be added to it or the render would never see them**
- **Found during:** Task 2
- **Issue:** The plan says "plan 04-04 added `updatedAt` and `released` to `HiveTask`" — but that is main's `HiveTask` (`hive.ts:161`, `:167`). The renderer **re-declares** its own (`TasksKanban.tsx:23`, deliberately, so the renderer never reaches into the preload package) and normalizes through `parseTasks`, which enumerates every field it keeps. Both new fields would have arrived at every card as `undefined` however correctly the writers stamp them.
- **Fix:** Both fields added to the interface and to `parseTasks`. `updatedAt` is **not** defaulted to `createdAt` or to `now` — "this card has never been touched" is a fact the tooltip renders and defaulting would erase it silently.
- **Verification:** `VIGIL-04: parseTasks carries updatedAt and released through its whitelist…` asserts the pass-through, the write-1 shape, and that `updatedAt` is not invented.
- **Committed in:** `5b21a97`

**2. [Rule 2 — Missing critical] `releasedOf()` normalizer, because a half-written `released` reaches a render as `undefined.toUpperCase()`**
- **Found during:** Task 2
- **Issue:** The ledger is a hand-written file — `parseTasks`' own header says so — and every other field it touches is type-checked before it is kept. A `released` block with no `by`, or with a numeric `branch`, would render `DROPPED BY ` + a throw.
- **Fix:** `releasedOf(raw)` requires `by` and `at` to be non-empty strings for the block to exist at all, and coerces `branch`/`detail` to `string | undefined`. The write-1 shape (no `branch` yet) is preserved intact, because it is a legitimate renderable state under rule R-1.
- **Verification:** asserted in the same test — a block with no `by` normalizes to `undefined`.
- **Committed in:** `5b21a97`

**3. [Rule 2 — Missing critical] An ask with no `askedAt` would have rendered `0s` forever**
- **Found during:** Task 3
- **Issue:** `askedAt` is optional on the shared `HumanQA` shape. The task CLI stamps it (`hiveTemplates.ts:139`) but a hand-written god edit need not, and `openPhoneAsks` already guards for its absence (`index.ts:1232`). `relAge(Date.now() - Date.parse(undefined))` is `NaN` → `0s`, so a nine-hour-old ask would have rendered as brand new — *the exact failure VIGIL-04 exists to prevent*, in the dangerous direction.
- **Fix:** `askAge()` falls back to the card's `createdAt` and the tooltip says which clock it read (`asked at or after {ISO}, when the card was created — the ask carries no timestamp`), mirroring rule A-3's treatment of the missing `updatedAt`. The fallback over-estimates the ask's age, which is the safe direction — it can only make you look sooner.
- **Verification:** `VIGIL-04: an ask with no askedAt falls back to the card clock and SAYS which one it read` asserts `notEqual('0s')` **and** `equal('9h')` **and** the tooltip phrase.
- **Committed in:** `e22993f`

**4. [Rule 1 — Bug] `AskMeTab` flashed "Nothing needs you right now" and then contradicted itself**
- **Found during:** Task 3
- **Issue:** `tasks` initialized to `[]` and was filled by an effect. The shared poll's cache (`useHiveTasks.ts:20`) is module-level and already warm whenever anything else in the renderer is mounted, so the first paint of this tab showed the empty state — *"Nothing needs you right now"* — and replaced it one tick later. The empty state is the one that must never be wrong.
- **Fix:** the `useState` initializer seeds from the already-fetched payload (`useState(() => { try { return parse(rawTasks); } catch { return []; } })`), which required moving the `useHiveTasks()` call above it. The effect still owns every subsequent sync, and the optimistic `setTasks` writes `sendAnswer`/`dismiss` depend on are untouched.
- **Second effect, stated plainly:** this is also what makes the board renderable under `renderToStaticMarkup`, so Task 3's four-channel test measures the **real** ASK ME header — the real `PixelBadge` beside it, in the real DOM order — instead of a stand-in. Both reasons are real; neither is offered as cover for the other.
- **Verification:** `npm test` full suite 0 fail; the RED run before this change printed the empty state, the GREEN run after it prints the question.
- **Committed in:** `e22993f`

### Scope kept out (deliberate)

- **Rule A-1's four existing relative-time implementations are byte-identical.** `git diff --stat` against the base for `WorkersTab.tsx`, `git/CommitGraph.tsx`, `triggers/SchedulesSection.tsx` and `triggers/TriggerHistoryTab.tsx` is **empty**.
- **Known Drift left alone:** `AskMeTab.tsx:193`'s leaf glyph and `:305`'s coral `BLOCKING` line are outside every hunk of this plan's diff; `openPhoneAsks` sending a raw agent id is untouched.
- **`AgentCard.tsx` diff is empty** and its `width = 322` / `height = 86` constants are unchanged (3 matches, as before).
- **`test/repo-claims.test.cjs` diff is empty** — the FLOOR-12 pins are satisfied by writing the components correctly (every new size is a `--cth-text-*` token, no numeric `fontSize` was added).

---

**Total deviations:** 4 auto-fixed (3 missing-critical, 1 bug).
**Impact on plan:** every one is required for the plan's own acceptance criteria to be true rather than merely green. No scope creep — the diff touches exactly the four files in `files_modified` and nothing else.

## Verification — measured, this session

| Gate | Result |
|---|---|
| `node --test test/renderer-components.test.cjs` | **20 tests, 20 pass, 0 fail** (was 7 before this plan) |
| `node --test test/repo-claims.test.cjs` | **33 pass, 0 fail** — re-run after each of tasks 2 and 3 |
| `npm test` (full suite) | **947 tests, 940 pass, 0 fail, 7 skipped** — baseline at `8caf9eb` was 934 / 927 / 0 / 7, so **+13 tests and the skipped count is unchanged** |
| `npm run typecheck` | 0 errors, **both** projects (`tsconfig.node.json`, `tsconfig.web.json`) |
| `npm run lint` | `eslint . --max-warnings 0` — exit 0 |
| `git diff --stat 8caf9eb..HEAD` | exactly the 4 files in `files_modified` |
| `grep -c "from 'electron'" src/shared/relAge.ts` | `0`; no DOM global, no node builtin |

### Mutation check (the tests are not vacuous)

A green tick was not taken on trust. `TaskAge`'s `const stale = emphasize && isStaleUnit(unit)` was temporarily forced to `false` and the suite re-run:

```
tests 20 · pass 16 · fail 4
```

The four that reddened are exactly the four that assert the stale treatment (the card's four-channel test, the `todo` half of the `done` exemption test, the never-updated test's clock assertion, and the ask's four-channel test). The mutation was reverted with `git checkout -- src/renderer/src/components/TasksKanban.tsx` and the suite re-confirmed at 20/20 before the SUMMARY was written.

## Stated ceilings — what a green tick here does NOT claim

1. **`renderToStaticMarkup` is a server render with no layout.** Every assertion in this plan is on the first rendered markup. That the meta row actually composes without clipping inside a 170px column, and that the ASK ME header absorbs the age in its existing `gap: 8`, are **operator observations and are not claimed here.** What is proven is that the guards are present: `flex: 1, minWidth: 0, textOverflow: ellipsis` on the label slot and `flexShrink: 0` on the age.
2. **"No height change" is true per card type, and needs stating precisely.** Both `--cth-text-display-md` and `--cth-text-body-md` are `14px` with a `20px` line height (`tokens.css:68,70,77,79`), and the clock icon is 16px inside a 20px line box — so the meta row's height is identical to the old assignee line's, and a card **with** an assignee is unchanged. A card **without** one now renders a row it previously omitted entirely, and is therefore ~22px taller. That is rule A-4's explicit instruction ("when there is no assignee the row still renders, with the age alone"), not a regression — but it is a height change on those cards and is recorded as one rather than papered over.
3. **04-08's known residual is not closed by this plan.** The two-write release in `floor/lifecycle.ts` still reads-filters-then-patches on write 2, so a sub-millisecond race can cost a branch label on an already-released card. This plan renders `released`; it does not touch either writer, and no claim is made about that race.
4. **The clock icon's contrast on `--cth-paper-100` was not re-measured this session.** It inherits `currentColor` from the age span, which is `--cth-ink-900` when stale — the pairing 04-UI-SPEC already measures at 12.96:1 for text on the coral-light banner and which is the darkest end of the ink ramp, so it is not a plausible failure. It was not independently re-measured.

## Known Stubs

None. Both fields this plan renders are written by live code, verified this session rather than assumed:

- `updatedAt` — `hive.ts:2304` stamps it on every card whose fingerprint changed; the fingerprint deliberately excludes `updatedAt` itself (`:2295`) so a no-op write does not bump it.
- `released` — `floor/lifecycle.ts:203` writes `{by, at}` synchronously, `:300` patches `{branch, detail}` from `finalizeAgentWorktree`'s continuation.
- The transport is a clean pass-through: `index.ts:4201` → `hive.tasks()`, which spreads each row (`hive.ts:2235`) with no whitelist, and `preload/index.ts:786` forwards it verbatim.

## Threat Flags

None. Every trust boundary this plan touches is in the plan's own register, and no new network endpoint, auth path, file access or schema change at a trust boundary was introduced. All agent-authored strings (`title`, `assignee`, `released.by`, `released.branch`, `humanQA.q`) reach the DOM as React text children or as inert `title` attributes; `dangerouslySetInnerHTML` appears nowhere in the diff.

Register dispositions discharged: **T-04-AGE-05** (React text children only; `wordBreak: break-all` on the branch), **T-04-AGE-06** (`relAge` degrades non-finite input to `0s`, asserted), **T-04-AGE-07** (the tooltip names its clock, asserted on both surfaces), **T-04-CARD-06** (placeholder absence asserted against eight literal tokens), **T-04-AGE-08** (`AgentCard.tsx` diff empty, geometry constants unchanged), **T-04-SC** (no install step, no new dependency, no new icon — `clock` was already among `Icon.tsx`'s 22 names).

## Issues Encountered

**`AskMeTab` could not be server-rendered at all, which would have reduced Task 3's acceptance test to a source-grep.** The board's cards come from a `useState([])` filled by an effect, and `renderToStaticMarkup` runs no effect phase — so the first attempt rendered the empty state and the four-channel assertion would have had to be made against `TaskAge` in isolation plus source-order greps. Resolved by seeding the shared poll's module-level cache through `window.cth` (the preload bridge, i.e. something the real build provides — the same category as the harness's existing `globalThis.self` shim) **and** by deviation 4 above. The result is that rule A-4's placement is asserted on **markup offsets** — title button before age, age before the badge's wrapper span — rather than on line numbers in a file that has already moved once between UI-SPEC revisions.

## Deferred (out of scope, not fixed)

- **`TasksKanban` and `TaskDetailOverlay` have the same first-paint flash deviation 4 fixed in `AskMeTab`** — both start their local task list at `[]` and fill it from an effect, so the board flashes four "Nothing here yet" columns on mount. It is pre-existing, it is not caused by this plan's changes, and `TaskDetailOverlay.tsx` is not in this plan's file list. One line each if a later plan wants it. Recorded here rather than in a `deferred-items.md` because a new file in the phase directory would collide at merge with the other wave-3 worktrees.

## User Setup Required

None — no external service configuration, no install step, no new dependency (D-36 honoured: `package.json` and `package-lock.json` are untouched).

## Next Phase Readiness

- **VIGIL-01's floor-quiet chip (04-UI-SPEC § S6a rule Q-2) composes with this and needs no surface of its own** — "what was in flight when it stopped" is the `DOING` column, and every card in it now states its age.
- **`<TaskAge>` and `localStamp` are exported from `TasksKanban.tsx`** for any later surface that needs the same treatment. `relAge`/`isStaleUnit` are in `src/shared/`, so main-process consumers can use them too.
- **`TaskCard` is exported** so the renderer suite can measure a card without the board around it; `renderAskBoard()` in the test file is the pattern for any component whose data arrives through the shared poll.
- **Wave-3 file ownership respected:** `useHive.ts`, `store.ts`, `BlockedBanner.tsx`, `CommandCenterPanel.tsx`, `App.tsx`, `PixelButton.tsx`, `AgentCard.tsx`, `resources/phone/**`, `src/main/index.ts` and `test/repo-claims.test.cjs` are all untouched.

## Self-Check: PASSED

Every artifact and commit hash claimed above was verified on disk and in `git log --oneline --all` after this SUMMARY was written.

- **Files, all FOUND:** `src/shared/relAge.ts`, `src/renderer/src/components/TasksKanban.tsx`, `src/renderer/src/components/AskMeTab.tsx`, `test/renderer-components.test.cjs`, `.planning/phases/04-overnight-on-a-repo-that-matters/04-12-SUMMARY.md`
- **Commits, all FOUND:** `97466ef`, `a83f0b4`, `5b21a97`, `498af77`, `e22993f`, `03a385f`
- **Not modified, as required by the parallel-execution contract:** `.planning/STATE.md`, `.planning/ROADMAP.md` — both absent from every commit in `8caf9eb..HEAD`.

Missing items: none.

---
*Phase: 04-overnight-on-a-repo-that-matters*
*Completed: 2026-08-25*
