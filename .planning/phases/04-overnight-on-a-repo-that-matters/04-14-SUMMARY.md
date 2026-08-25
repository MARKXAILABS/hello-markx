---
phase: 04-overnight-on-a-repo-that-matters
plan: 14
subsystem: ui
tags: [react, wcag-contrast, design-tokens, accessibility, ipc, zustand, node-test]

# Dependency graph
requires:
  - phase: 04-06
    provides: "`emitControl(agentId, tool, reason, command)` — main sends the refused command verbatim on `control:approvalRequest` (`hooks.ts:1829-1834`), truncated to 2000 chars"
  - phase: 04-07
    provides: "the single shared BLOCK_HINTS list (`src/shared/blockHints.ts`); read but not modified here"
provides:
  - "`PixelButton variant=\"destructive\"` reads at 7.12:1 in dark mode instead of 1.85:1 — every shipped destructive button, not just this phase's"
  - "`blockReasonFromApproval()` exported from `useHive.ts` — the GATE-03 refusal assembly, testable because it no longer hides inside a `useEffect`"
  - "`BlockReason.command` is finally populated, so the banner names WHICH command was refused"
  - "`rosterBadgeStatus()` exported from `CommandCenterPanel.tsx` — `blocked` outranks the circuit breaker's `looping` on the roster"
  - "`onApprovalRequest`'s bridge type carries `command`, so the payload main already sent is reachable in the renderer"
affects: [04-18, 04-13, GATE-05, VIGIL-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Decision-out-of-effect: a rule that lives inside a `useEffect` is exported as a pure function so the SHIPPED rule is asserted rather than a copy — the harness has no effect phase (`test/renderer-components.test.cjs:23-38`). Same seam as `stopArmDecision`."
    - "Symbol-bounded source assertions: slice a `case 'x':` arm from its label to its closing `};` instead of a line window, with a positive control on a sibling arm proving the boundary is real."

key-files:
  created: []
  modified:
    - src/renderer/src/components/PixelButton.tsx
    - src/renderer/src/hooks/useHive.ts
    - src/renderer/src/components/CommandCenterPanel.tsx
    - src/preload/index.ts
    - test/renderer-components.test.cjs

key-decisions:
  - "D-33: the destructive case is asserted by symbol boundary in both directions (`cth-on-accent` present, `cth-ink-900` absent), with a positive control on the `secondary` arm so an empty slice fails instead of passing; plan 04-18 reuses the identical boundary three waves later."
  - "D-35: this plan owns its renderer files for wave 4; the `⚠` aria rider is left to plan 04-18 rather than reaching into `repo-claims.test.cjs`, which plan 04-13 owns this wave."
  - "`store.ts` was NOT modified — `BlockReason.command` already existed at `:22`; the missing piece was the bridge type, not the store shape."
  - "Both new rules are named exports rather than inline expressions, because `armed` and the approval effect are both unreachable in a server render — inline, the plan's own 'four rendered cases' criterion could only be met by asserting a copy that stays green through a revert."

patterns-established:
  - "Revert-probe before claiming a test protects anything: flip the source back, confirm red, restore, confirm green. Done for both Task 1 and Task 3."
  - "Fallback strings at a trust boundary name no mechanism the operator may not have (rule D-1) — the renderer renders main's sentence or says nothing specific."

requirements-completed: [GATE-03, VIGIL-03]

# Metrics
duration: 51min
completed: 2026-08-25
---

# Phase 04 Plan 14: Three Renderer Corrections Summary

**The deny button's label went from 1.85:1 to 7.12:1 in dark mode, a GATE-03 refusal now names what/for whom/why in main's own words, and a blocked agent stops reading `looping` under a tripped breaker.**

## Performance

- **Duration:** ~51 min
- **Started:** 2026-08-25T15:11Z
- **Completed:** 2026-08-25T16:02Z
- **Tasks:** 3 (2 of them TDD)
- **Files modified:** 5

## Accomplishments

- **The deny button is on the screen again.** `PixelButton`'s `destructive` variant painted its label with `--cth-ink-900`, which inverts with the theme. Blast radius is wider than this phase: every shipped `destructive` button, including the deny buttons `BlockedBanner.tsx:64` renders today.
- **A refusal is legible without opening a terminal.** `BlockReason.command` is populated for the first time, the summary names the agent, and the renderer's invented fallback sentence is deleted.
- **A blocked agent is visibly blocked on the roster.** The one broken `PixelBadge` site of nine now lets `blocked` outrank the breaker's `looping`.
- **Test count 970 → 982**, 0 failures throughout, skipped unchanged at 7.

## Measurements re-derived this session

Computed from `tokens.css` hex values with WCAG 2.x relative luminance, **not quoted from 04-UI-SPEC**:

| Pairing | Ratio | Verdict |
|---|---|---|
| light `--cth-ink-900` #1A1320 on `--cth-coral` #D96A62 | **5.34:1** | PASS |
| dark `--cth-ink-900` #DEDBD6 on `--cth-coral` #E08C82 | **1.85:1** | **FAIL** |
| dark `--cth-on-accent` #1A1320 on `--cth-coral` #E08C82 | **7.12:1** | PASS |
| light `--cth-on-accent` #1A1320 on `--cth-coral` #D96A62 | **5.34:1** | PASS (unchanged) |

All four match the UI-SPEC's table. **Light mode is provably byte-identical**, and the proof is structural rather than numeric: `--cth-on-accent` is defined exactly once, at `tokens.css:94`, inside `:root` and **not** inside the dark block that opens at `:127` (`grep -rn 'cth-on-accent:' src/` returns one line). It is theme-invariant `#1A1320` — the same value light-mode `--cth-ink-900` already had.

## Task Commits

1. **Task 1: PixelButton's destructive variant** — `943e631` (fix, **single file**, measurements in the message) + `479f9fe` (test)
2. **Task 2: Denial legibility** — `2ea06c2` (test, RED) → `5ef9bf3` (feat, GREEN)
3. **Task 3: blocked outranks armed on the roster** — `46dae4a` (test, RED) → `f8ff410` (feat, GREEN)

### RED runs, as measured

| Gate | Result | Failures |
|---|---|---|
| Task 2 RED (`2ea06c2`) | 28 tests, 23 pass, **5 fail** | 4 × `TypeError: blockReasonFromApproval is not a function`, 1 × the invented sentence still present in source |
| Task 2 GREEN (`5ef9bf3`) | 28 tests, **28 pass**, 0 fail | — |
| Task 3 RED (`46dae4a`) | 32 tests, 30 pass, **2 fail** | 2 × `TypeError: rosterBadgeStatus is not a function` |
| Task 3 GREEN (`f8ff410`) | 32 tests, **32 pass**, 0 fail | — |

Two tests in each RED run were green at RED **on purpose** — they are regression guards on behaviour that must not change (the `⛔` feed push, the `⚠` pin, the armed row's fill, the `paused` count). A guard that only goes green after the change would not be guarding anything.

### Revert-probes — proving the tests can actually fail

A passing test proves nothing until it has been made to fail.

- **Task 1:** reverting `PixelButton.tsx:74` to `--cth-ink-900` → pass 20 / **fail 2**; restored → pass 22 / fail 0.
- **Task 3:** restoring the old rule `armed ? 'looping' : status` → the four-case test fails with its real message, *"a blocked agent reads `looping` under a tripped breaker"*. This is the direct demonstration that the shipped defect was real and not merely a missing function; restored → 32/32.

## Test-count delta

| | Baseline (`0ab5346`) | After | Delta |
|---|---|---|---|
| tests | 970 | **982** | +12 |
| pass | 963 | **975** | +12 |
| fail | **0** | **0** | 0 |
| skipped | 7 | **7** | 0 |

Baseline was re-measured live in this session before any edit, not taken from the brief.

## Files Created/Modified

- `src/renderer/src/components/PixelButton.tsx` — one line: the `destructive` arm's text token → `--cth-on-accent`.
- `src/renderer/src/hooks/useHive.ts` — new exported `blockReasonFromApproval()`; the approval effect now passes `command` through, resolves the agent name via the same `agents.find((a) => a.id === …)` the surrounding effects use (`:514`), and the invented fallback is gone.
- `src/renderer/src/components/CommandCenterPanel.tsx` — new exported `rosterBadgeStatus()`; the roster badge site routes through it. `:796`'s `⚠` span untouched.
- `src/preload/index.ts` — `command?: string` added to both type positions of `onApprovalRequest` (deviation, below).
- `test/renderer-components.test.cjs` — 12 new tests; `PixelButton`, `blockReasonFromApproval` and `rosterBadgeStatus` added to the load block.

**Not modified, deliberately:** `store.ts` (the field already existed), `PixelBadge.tsx`, `BlockedBanner.tsx`, `AgentDetailPanel.tsx`, `App.tsx`, `AgentCard.tsx`, `test/repo-claims.test.cjs`, `package.json`. All verified by `git diff --name-only` against the base.

## Decisions Made

- **`store.ts` needed no change.** `BlockReason.command` has been at `:22` and `BlockedBanner.tsx:44-59` has rendered it all along. The actual gap was one layer down, in the bridge type. No `askId`/`expiresInMs` added — those are plan 04-18's.
- **Both new rules are named exports, not inline expressions.** See deviations 2 and 3; the reason is measured, not stylistic.
- **The `⚠` span was left strictly alone.** Read all three FLOOR-12 clauses first, then did not touch the line.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The IPC bridge type omitted the field main was already sending**

- **Found during:** Task 2
- **Issue:** `hooks.ts:1832` sends `{ agentId, tool, reason, command }` on `control:approvalRequest` (plan 04-06's work), but `preload/index.ts:1149-1150` typed the payload as `{ agentId, tool?, reason? }`. `command` could not be destructured in the renderer without a type error, so the field main had been sending was unreachable by construction — Task 2's entire first requirement was blocked.
- **Fix:** Added `command?: string` to both type positions. No new channel, no new bridge method: `grep -c 'control:approvalRequest' src/preload/index.ts` is still `2`, which is exactly what plan 04-18 asserts must be unchanged from HEAD.
- **Files modified:** `src/preload/index.ts`
- **Ownership check:** `src/preload/index.ts` appears in plan **04-18**'s `files_modified` — wave **6**, not this wave. Grepped all wave-4 plans (04-13, 04-14, 04-15): no concurrent owner. No merge collision.
- **Verification:** `npm run typecheck` 0 errors; the refused command renders in the banner.
- **Committed in:** `5ef9bf3`

**2. [Rule 3 - Blocking] `rosterBadgeStatus` is an export, not the inline expression the plan mandates**

- **Found during:** Task 3
- **Issue:** The plan mandates the inline expression at the badge site *and* requires "four rendered cases assert the badge text", explicitly noting that two cases would be insufficient. Those two requirements are **mutually unsatisfiable**, and the reason is measurable: `armed` derives from `breakers`, which is `useState({})` inside `useFleetTelemetry` (`useTelemetry.ts:96`) populated only by an effect. `renderToStaticMarkup` runs no effects at all — the harness says so at `:23-38` — so a rendered `CommandCenterPanel` has `armed === false` on **every** row and both armed cases are structurally unreachable through the panel. Inline, the only way to render four cases is to duplicate the expression in the test, which asserts a copy and stays green through a revert of the real thing.
- **Fix:** Exported `rosterBadgeStatus(status, armed)` carrying the mandated rule verbatim; the badge site calls it. A test asserts the site calls it, so the four cases cannot drift into testing an orphan.
- **Precedent:** identical seam and identical reason as `useHive.ts:156`'s `stopArmDecision`, and as plan 04-18's own instruction to extract `formatRemaining` from `BlockedBanner`.
- **Verification:** revert-probe above — with the old rule restored the four-case test fails naming the real defect.
- **Committed in:** `f8ff410`

**3. [Rule 3 - Blocking] `blockReasonFromApproval` is an export for the same reason**

- **Found during:** Task 2
- **Issue:** The refusal assembly lives inside a `useEffect`. Task 2's criterion is that a test "drives a GATE-03 refusal through the hook", which the harness cannot do — no effect phase.
- **Fix:** Exported the assembly; the effect calls it. Same precedent as above.
- **Committed in:** `5ef9bf3`

**4. [D-35 ownership — instruction NOT executed] `title={command}` on the banner's command row**

- **Found during:** Task 2
- **Issue:** Task 2's action says to add `title={command}` to the command row (rule D-3). That row is `BlockedBanner.tsx:44-59` — a file this plan is **forbidden** to touch by D-35, stated three times (frontmatter `files_modified`, `must_haves.decisions` D-35, and `standing_constraints`), and owned by plan 04-18 in wave 6. The instruction and the ownership constraint contradict each other.
- **Resolution:** Honoured the ownership constraint; the `title` was **not** added. Confirmed the row today has `textOverflow: 'ellipsis'` and no `title`, so the full command is still one hover away only via the feed. **Plan 04-18 owns `BlockedBanner.tsx` and is already rewriting `:53-55`'s truncation for rule 3 — this rider belongs in the same edit.**
- **Files modified:** none

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking), 1 plan instruction deliberately not executed on ownership grounds.
**Impact on plan:** No scope creep. One extra file (`src/preload/index.ts`, four characters of type), owned by a later wave. Every plan objective met; one deferred rider is named and assigned.

## Known Limitations (recorded, not solved)

- **`blockReason` is singular per agent** (`store.ts:56`). A burst of refusals shows only the most recent, and there is **no floor-wide list of everything that was ever refused**. GATE-03's criterion is met by the per-agent banner plus the toast; this contract does not specify a denial log. `RECORD-01`'s `tool_calls` table is where such a log would read from, in a later phase. Threat register entry `T-04-CMD-15`, disposition **accept**.
- **The `⚠` is announced to nobody.** The badge now says `needs you` under a tripped breaker, but `CommandCenterPanel.tsx:796`'s `⚠` span remains `aria-hidden="true"` with its reason in a `title`, so for an AT operator the breaker is silent until plan 04-18 lands the `role="img"` + `aria-label` swap in wave 6. **This is a known, owned, two-wave interval inside one phase, not a discovery** — `T-04-BLK-10`, deferred by name in both plans. It could not be closed here: `test/repo-claims.test.cjs:717` pins that line verbatim with `count: 1`, clause 2 (`:782`) is an exact-text multiset in both directions, and clause 3 (`:815-838`) requires a *literal* `aria-hidden=("true"|{true})` that a conditional would not match — so the line and the pin must move in one commit, and the pin file is plan 04-13's this wave.
- **Narrower than the threat model states (inherited from 04-06):** GATE-03's host arm was narrowed to a downloader's own argument, so `git clone https://evil.example/x` is not reached by it. Unchanged by this plan; restated only so the wider claim is not accidentally re-asserted.

## Issues Encountered

- **The plan's Task 2/Task 3 acceptance criteria were internally unsatisfiable as written** (see deviations 2–4). Resolved by measuring *why* rather than picking a side: in both cases the blocking fact is the harness's documented absence of an effect phase, and in the `title={command}` case it is an ownership rule stated three times. Nothing was worked around silently.
- No test was modified to accommodate a source path. No `--no-verify`, no skips added, no allowlist widened.

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. The one trust-boundary touch — an agent-authored command string reaching rendered text — is inside the existing register (`T-04-CMD-*`): React escapes text children, nothing uses `dangerouslySetInnerHTML`, and the string is capped at 2000 chars by main before it is sent (`hooks.ts:1833`).

## Known Stubs

None.

## Verification

| Gate | Command | Result |
|---|---|---|
| Plan test file | `node --test test/renderer-components.test.cjs` | **32/32 pass** |
| Pinned claims | `node --test test/repo-claims.test.cjs` | **33/33 pass**, `git diff --stat` on that file **empty** |
| Full suite | `npm test` | **982 tests, 975 pass, 0 fail, 7 skipped** |
| Types | `npm run typecheck` | **0 errors**, both projects |
| Lint | `npm run lint` (`eslint . --max-warnings 0`) | **exit 0** |
| Blast radius | `git diff --stat 0ab5346..HEAD` | **5 files**; `BlockedBanner` / `AgentDetailPanel` / `App.tsx` / `PixelBadge` / `AgentCard` / `repo-claims` / `store.ts` / `package*.json` all untouched |
| Atomic fix commit | `git show --stat 943e631` | **exactly 1 file**, all three ratios in the message |

Lint, typecheck and the full suite were run **locally before each commit**, not left to CI.

## User Setup Required

None.

## Next Phase Readiness

- **Plan 04-18 (wave 6) is unblocked and inherits three named riders:**
  1. the `⚠` a11y swap at `CommandCenterPanel.tsx:796` **plus** the matching `test/repo-claims.test.cjs:717` allowlist update, in **one** commit (widening the allowlist instead is explicitly forbidden by `repo-claims.test.cjs:800-802`);
  2. `title={command}` on `BlockedBanner`'s command row — fold into the rule-3 truncation rewrite of `:53-55`;
  3. its rule 2 prerequisite is satisfied: `deny` on `variant="destructive"` now measures 7.12:1 in dark mode.
- **Note for 04-18:** it reads `:795` expecting the inline expression. The site now reads `<PixelBadge status={rosterBadgeStatus(a.status, armed)} />` with the identical rule in `rosterBadgeStatus` near the top of the file. The behaviour it depends on is unchanged and its rider targets `:796`, which is byte-identical.
- **Note for the orchestrator:** this plan also touched `src/preload/index.ts` (plan 04-18's file, wave 6) by four characters of type widening. No wave-4 conflict; 04-18 should expect `command?: string` already present.
- STATE.md and ROADMAP.md deliberately **not** modified — the orchestrator owns those.

## TDD Gate Compliance

Both TDD tasks show the full gate sequence in `git log`, RED before GREEN:

- Task 2: `2ea06c2` `test(...)` → `5ef9bf3` `feat(...)`
- Task 3: `46dae4a` `test(...)` → `f8ff410` `feat(...)`

No REFACTOR commit for either — neither implementation had anything to clean up (three lines and one expression respectively), and an empty refactor commit would be ceremony.

Task 1 is not a TDD task; its `fix(...)` (`943e631`) is a deliberate single-file atomic commit per its acceptance criteria, with the test following in `479f9fe`.

## Self-Check: PASSED

- All 6 claimed files exist on disk (verified with `ls -1`).
- All 6 claimed commit hashes exist in `git log 0ab5346..HEAD`: `943e631`, `479f9fe`, `2ea06c2`, `5ef9bf3`, `46dae4a`, `f8ff410`.
- No commit in this range deletes a tracked file (`git diff --diff-filter=D` empty at each).
- Working tree clean; no untracked or generated files left behind.
- STATE.md and ROADMAP.md unmodified, as required for a worktree executor.

---
*Phase: 04-overnight-on-a-repo-that-matters*
*Completed: 2026-08-25*
