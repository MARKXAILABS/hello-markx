---
phase: 01-finish-the-floor
plan: 29
subsystem: renderer
tags: [auto-mode, safety-indicator, argv-tokenization, layout-containment, cross-file-pin, sidebar-persistence, gap-closure]

requires:
  - phase: 01-finish-the-floor
    provides: "01-12's FLOOR-01 AUTO chip and its one shared derivation (src/renderer/src/store/autoMode.ts), the FLOOR-13 model field on AgentCard and the 1024px sidebar collapse (src/renderer/src/store/sidebarLayout.ts)"
  - phase: 01-finish-the-floor
    provides: "01-25's landed MIN_WIN 1280 -> 960 and its two in-place DESIGN.md corrections at :169 and :677 — this plan's pin READS that file and never writes it"
provides:
  - "an AUTO chip that reports the bypass the OPERATOR typed on a custom agent's free-text command, which config.ts spawns verbatim"
  - "one tokenized flag matcher shared by every arm — whole argv tokens, each contributing both sides of its first `=`, so `--auto` stops matching `--auto-compact` and `--permission-mode=bypassPermissions` starts matching"
  - "an explicit empty-flag guard, because two presets carry `autoFlag: ''` and `[].every(...)` is vacuously true"
  - "the model chip bounded on the same three axes its sibling row is bounded on, behind a named MODEL_CHIP_MAX_W rather than a fifth anonymous literal"
  - "a three-clause cross-file pin tying src/main/index.ts's MIN_WIN, sidebarLayout.ts's SIDEBAR_COLLAPSE_WIDTH and DESIGN.md's two stated minimums together, whose acceptance clause has been SEEN failing against an inline fixture of the pre-fix declaration"
  - "splitterReachableMax — the resize re-clamp's own bound, separate from the drag clamp, so a window resize can no longer rewrite and persist the operator's chosen sidebar width across the 1024-1279 band that MIN_WIN 960 opened"
affects: [01-31 (the residual register — four items named below, including the two ceilings this plan deliberately did not close)]

tech-stack:
  added: []
  patterns:
    - "a substring is not a flag: match whole argv tokens, and let each token contribute both sides of its first `=` so the tokenizer's own false-negative is closed in the same rule"
    - "an empty needle set is never a match — `[].every(...)` is `true`, and on a safety predicate that is the difference between 'no rule' and 'always'"
    - "a safety indicator errs toward over-reporting, and the direction is written into the source comment so the next reader cannot mistake it for a bug"
    - "a cross-file pin is only a pin once its acceptance clause has been seen FAILING; the failure input is an inline fixture of the prior source text, so the demonstration needs no process, no git object and no working-tree write"
    - "assert the extraction MATCHED before comparing — a broken regex and a compliant tree must never be indistinguishable"
    - "two bounds for two requirements: a layout preference may be enforced while the operator drags, but only a reachability invariant may be enforced by an effect that writes to disk"

key-files:
  created: []
  modified:
    - src/renderer/src/store/autoMode.ts
    - src/renderer/src/components/AgentCard.tsx
    - src/renderer/src/store/sidebarLayout.ts
    - src/renderer/src/components/SidebarSplitter.tsx
    - test/renderer-runstate.test.cjs
    - test/renderer-components.test.cjs

key-decisions:
  - "The custom arm reads `autoFlag`, not `autoModeFlag`: `autoFlag` is the field buildSpawnCommand appends, so it is the spelling an operator who copied a working command line will have typed. The two agree on all eleven presets today and a new regression assertion is what keeps that true."
  - "The over-report is accepted and PINNED as a case rather than argued in prose. `mytool --auto` shows the chip because `--auto` is Kimi's bypass flag. A cosmetic false alarm costs a glance; a missed bypass costs the thing the chip exists to prevent."
  - "MODEL_CHIP_MAX_W = 96, not '52%'. The percentage was copied from FullscreenTerminal's much wider roster row and would have meant a different number in this container. 96 comes from the card's own 262px right-column arithmetic."
  - "The RED demonstration is an INLINE FIXTURE, not `git show`. Every actions/checkout@v4 in ci.yml is a depth-1 clone with no fetch-depth, so the pre-fix blob is absent on all three runners and a git call would have reddened the hard `test` gate permanently, with a failure message about the sidebar."
  - "The resize re-clamp gets its own bound instead of tightening the drag clamp. `onChange` IS the persisting setter, so the effect may only enforce an invariant (the handle must stay reachable), never a preference (leave the floor 360px). The drag handler still enforces the preference, because a drag is the operator asking for it."
  - "SPLITTER_REACHABLE_RESERVE is 48 — the same number as SIDEBAR_OVERLAY_GUTTER and for the same reason. Two magic numbers for one decision is how they drift."

patterns-established:
  - "Pattern: a gate anchored on the element's OWN title, never on a document-wide property count — AgentCard emits four other elements already carrying all three guards, so a count could not tell the chip from its siblings and stayed green with the chip unbounded"
  - "Pattern: a fixture value asserted to be REAL — the test asserts 'Gemini 3.1 Pro (High)' is still a preset's recommendedOrchestratorModel, so the worst case can never quietly become a hypothetical"
  - "Pattern: label a green clause as a REGRESSION GUARD in the test's own comment when it was already true before the plan, so no reader mistakes its tick for evidence the phase changed something"

requirements-completed: [FLOOR-01, FLOOR-13]

duration: 21min
completed: 2026-08-22
---

# Phase 01 Plan 29: The AUTO chip's custom arm, the model chip's bound, the window/breakpoint pin and the splitter's persisting resize — Summary

**The AUTO chip now reports the bypass the operator typed into Add Agent's free-text field instead of unconditionally denying one, matches whole argv tokens on both sides of an `=` so `--auto` stops painting `--auto-compact` as a bypass, the model chip carries the three guards its sibling row uses so 21 unshrinkable characters cannot drop the card's project line, three constants in two processes and one document are tied together by a pin that has been seen failing against the declaration the tree actually shipped, and a window resize can no longer rewrite and persist the operator's sidebar width across the 1024–1279 band that lowering the window floor opened.**

## Performance

- **Duration:** ~21 min, one session
- **Started:** 2026-08-22T17:27Z (first tool call; the earliest artifact this session wrote is timestamped 17:31:01Z, the first commit `ef8fcfa` 17:32:25Z)
- **Completed:** 2026-08-22T17:41:56Z (last code commit, `bbd1fe6`); full-suite, build, e2e and gate sweep to 17:48Z
- **Tasks:** 3 of 3, each RED then GREEN
- **Files modified:** 6 — exactly the plan's `files_modified`, nothing else

## Task Commits

| # | Task | Gate | Commit |
|---|---|---|---|
| 1 | The AUTO chip reads the operator's own command, tokenized | RED | `ef8fcfa` |
| 1 | " | GREEN | `83ed8dd` |
| 2 | Bound the model chip the way its sibling row bounds it | RED | `4c31e55` |
| 2 | " | GREEN | `59381d8` |
| 3 | Pin the floor to the breakpoint and the doc; stop the band persisting a shrunken sidebar | RED | `149feed` |
| 3 | " | GREEN | `bbd1fe6` |

No REFACTOR commit: none of the three GREENs left duplication worth a fourth commit. Task 1 removed the duplicate idiom (`includes(flag)` inline beside a second matcher) as part of its GREEN rather than after it, which is where it belonged.

## What actually shipped, per task

### Task 1 — `src/renderer/src/store/autoMode.ts` (+64 / −8)

`hasBypassFlag(command, flag)` is one local helper used by **both** arms. It splits the flag on
whitespace and returns `false` immediately when no tokens remain; it builds the command's token set
by splitting on whitespace and adding, for any token containing `=`, the token itself plus the
substring before the first `=` and the substring after it; then it requires every flag token to be
present. That single rule closes three things at once — the substring false positive, the
tokenization false negative it would otherwise have created, and Copilot's three-token flag.

The custom arm's `if (p === 'custom') return false;` became
`AGENT_PROVIDER_PRESETS.some((preset) => hasBypassFlag(command, preset.autoFlag ?? ''))`. The
per-provider arm's `const flag = …; if (!flag) return false; return (command ?? '').includes(flag);`
became `return hasBypassFlag(command, autoModeFlagForProvider(p));` — the empty-flag guard now has
one home instead of two.

**The measured table. The "HEAD" column was produced by loading `autoMode.ts` through
`test/load-ts.cjs` BEFORE the edit; "after" was produced by the same script after it.**

| call | HEAD | after | required |
|---|---|---|---|
| `isAutoModeAgent('custom', 'my-agent --yolo --dangerously-skip-permissions', true)` | **false** | true | true |
| `isAutoModeAgent('custom', 'claude --dangerously-skip-permissions', false)` | **false** | true | true |
| `isAutoModeAgent('custom', 'mytool --dangerously-skip-permissions=true', false)` | **false** | true | true |
| `isAutoModeAgent('kimi', 'kimi --model x --auto-compact', false)` | **true** | false | false |
| `isAutoModeAgent('claude', 'claude --permission-mode=bypassPermissions', false)` | **false** | true | true |
| `isAutoModeAgent('custom', 'mytool --auto', false)` | **false** | true | true (deliberate over-report) |
| `isAutoModeAgent('custom', 'my-agent', true)` | false | false | false |
| `isAutoModeAgent('custom', '', true)` | false | false | false |
| `isAutoModeAgent('kimi', 'kimi --auto', false)` | true | true | true |
| `isAutoModeAgent('claude', 'claude --permission-mode bypassPermissions', false)` | true | true | true |
| `isAutoModeAgent('copilot', 'copilot -s --allow-all-tools --no-ask-user', false)` | true | true | true |
| `isAutoModeAgent('opencode', 'opencode', true)` | true | true | true |

`6 of 12 rows FAIL against current source` before; `0 of 12 rows FAIL` after.

**RED, from the test file itself** (`node --test test/renderer-runstate.test.cjs`, 21 tests, 19 pass,
**2 fail**):

```
✖ a custom agent shows AUTO when the OPERATOR typed a bypass flag, and only then
✖ the AUTO chip matches whole argv tokens, on both sides of an `=`
  AssertionError: isAutoModeAgent('custom', 'my-agent --yolo --dangerously-skip-permissions', true)
  !== true — a custom agent carrying two real bypass flags shows no chip
```

The other two assertions inside the inverted test are unchanged, as the plan requires:
`autoModeFlagForProvider('custom') === ''` and `isAutoModeAgent('custom', '', true) === false`. All
three `opencode` cases pass unmodified. The `opencode` arm was not touched and
`autoModeFlagForProvider` was **not** repointed at `autoFlag`.

**The regression guard was green at HEAD and is labelled as such in the test:** for all eleven
presets, `autoFlag === autoModeFlag`. It passed in the RED run (19 pass included it) — it is what
makes `b/WR-01`'s "correct by coincidence" a coincidence someone has to break loudly, not evidence
this plan changed anything.

### Task 2 — `src/renderer/src/components/AgentCard.tsx` (+32 / −2)

`const MODEL_CHIP_MAX_W = 96;` at module scope, beside `fmtK`, with the subtraction in its docstring:
the right column is `322 − 16 (panel padding) − 36 (portrait) − 8 (gap) ≈ 262px`; worst case with an
account pinned, `262 − 76 (account chip) − 15 (three gaps) = 171px` shared by the flexible `infoLine`
and this chip, so 96 leaves `infoLine` ~75px — a truncated project name, which the card's own comment
calls the designed response to horizontal growth. Not `'52%'`: that value was copied from
`FullscreenTerminal.tsx`'s roster row, where 52% is 52% of a much wider box.

The chip's style gained `maxWidth: MODEL_CHIP_MAX_W`, `overflow: 'hidden'` and
`textOverflow: 'ellipsis'`, keeping `flexShrink: 0`, the token-driven `fontSize`/`lineHeight` and the
`title`. `shortModel`, the chip's position and the `'CLI default'` fallback text are unchanged.

**RED, with the pre-fix style pasted by the failure message itself:**

```
✖ FLOOR-13: the model chip is bounded, so it cannot drop the card's project line
  AssertionError: the model chip has no max-width (style: flex-shrink:0;font-size:var(--cth-text-body-sm);
  line-height:var(--cth-lh-body-sm);color:var(--cth-ink-500);white-space:nowrap) — 21 unshrinkable
  characters take the width out of infoLine, the row's only flexible item, and the card drops its
  project/action line
```

The assertion locates the chip by its own `title` (`Model: Gemini 3.1 Pro (High)`, and
`Runs the CLI default model` for the fallback), never by counting `text-overflow` in the document —
the card emits four other elements that already carry all three properties, which is exactly why the
plan's round-0 gate was satisfiable by `git checkout .`. The fixture value is asserted to be REAL:
the test fails if no preset still offers `'Gemini 3.1 Pro (High)'` as a
`recommendedOrchestratorModel`, so the worst case cannot quietly become a hypothetical.

Both pre-existing AgentCard tests (FLOOR-01 and FLOOR-13) pass **unmodified**, and `infoLine`'s own
`title` and `flex: 1, minWidth: 0` are untouched.

**Removed from the plan's round 0, deliberately:** the anti-vacuity control *"the same render still
emits `infoLine` as a non-empty element."* `renderToStaticMarkup` performs no layout and the JSX
emits `infoLine` unconditionally, so that assertion is green before the fix, after it, and after a
revert. A decorative assertion is how a reviewer counts four checks where there are three. It was not
written.

**CEILING, stated in the test's own comment and here:** `renderToStaticMarkup` is a server render
with no layout. This proves the GUARDS ARE PRESENT. Whether the row actually composes without
clipping at 322px is an operator observation and is **not** claimed.

### Task 3 — `src/renderer/src/store/sidebarLayout.ts` (+38 / −7), `src/renderer/src/components/SidebarSplitter.tsx` (+24 / −3)

**The pin** lives in `test/renderer-runstate.test.cjs`, following `test/ci-config.test.cjs`'s
`const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')` precedent.
`minWinFromSource(src)` is a **pure function of source text**, bounded by the `const MIN_WIN = { … }`
declaration as a structural delimiter rather than by any line number, and it asserts it matched
before returning; `minWinWidthFromSource` / `minWinHeightFromSource` are its two projections.

| clause | against the pre-fix text | against the working tree | role |
|---|---|---|---|
| `minWinWidthFromSource(src) < SIDEBAR_COLLAPSE_WIDTH` | `1280 < 1024` → **FALSE** | `960 < 1024` → TRUE | **acceptance gate** |
| `/min(Width\|Height):\s*\d/` finds nothing in `src/main/index.ts` | 0 matches → TRUE | 0 matches → TRUE | regression guard, already true — labelled as such in the test |
| `DESIGN.md`'s stated minimums equal the constant | — | `[[169,960,800],[677,960,800]]` → TRUE | drift guard, green in both states by design |

The `DESIGN.md` extractor asserts it found **exactly two** `NNN × NNN` pairs on lines naming a window
minimum before comparing either, so a reworded sentence fails loudly instead of passing vacuously.
The failure messages name `src/main/index.ts`'s `MIN_WIN`, `sidebarLayout.ts`'s
`SIDEBAR_COLLAPSE_WIDTH`, the `DESIGN.md` line, and what breaks — the collapsed branch becomes dead
code in the shipped app while four tests here keep it green.

**The RED demonstration is a permanent second test case.** `PRE_FIX_MIN_WIN_SOURCE` is an inline
fixture string in the test file holding `const MIN_WIN = { width: 1280, height: 800 };` — the
declaration the tree shipped before 01-25. The test asserts the extractor returns 1280 and 800 from
it, asserts clause 1 evaluates **false** on it, and asserts the working tree is strictly narrower
than the fixture (so a revert of 01-25 fails here too).

Evidence that nothing was spawned and nothing was written:

```
$ git status --porcelain src/main/index.ts DESIGN.md
(empty, before and after)
$ grep -cE "child_process|execFileSync|spawnSync" test/renderer-runstate.test.cjs
0
```

Both were also 0/empty at the start — stated as regression guards, not as achievements. The point is
that this plan does not introduce one. `src/main/index.ts` and `DESIGN.md` are 01-25's files and were
never opened for writing; `git diff --name-only` names neither.

**The persistence fix.** `sidebarLayout.ts` gained `SPLITTER_REACHABLE_RESERVE = 48` and
`splitterReachableMax(viewportWidth, min)`. `SidebarSplitter` imports it and uses it in the resize
effect **only**; the drag handler still clamps to `clampMax`. Measured this session:

```
TODAY (drag clamp as the resize bound), stored 900:
  persisting writes across 1024-1279: 236
  first six (viewport -> persisted width): [[1024,664],[1025,665],[1026,666],[1027,667],[1028,668],[1029,669]]
  last one: [1259,899]
AFTER (splitterReachableMax), stored 900:
  persisting writes across 1024-1279: 0 []
NEGATIVE CONTROLS:
  stored 1100 @ vp1024 -> rescued to 976
  drag bound @ vp1024 still 664
  vp1100 -> 1052 | vp1279 -> 1231 | vp1280 -> 1232 | vp1920 -> 1872
```

Every number matches the plan's table. The RED for this half was structural rather than numeric —
`TypeError: splitterReachableMax is not a function`, 1 failing test of 24 — because the bound did not
exist yet.

`splitterReachableMax(300, 320) === 320` (never below `min`) and
`SPLITTER_REACHABLE_RESERVE === SIDEBAR_OVERLAY_GUTTER` are both asserted, the second so the two
cannot drift into being two magic numbers for one decision.

**Stale anchors repointed, as the plan requires** — this phase's criterion 1 is stale anchors and
completing this task without them would have manufactured a fresh one:

| site | was | now |
|---|---|---|
| `sidebarLayout.ts` module docstring | `DESIGN.md:678` + the "bottom drawer" quote | `DESIGN.md:677` + the right-edge-overlay quote as 01-25 rewrote it |
| `sidebarLayout.ts` `SIDEBAR_COLLAPSE_WIDTH` docstring | `DESIGN.md:678` | `DESIGN.md:677` |
| `sidebarLayout.ts` `overlayWidth` docstring | `SidebarSplitter.tsx:27-34` | `SidebarSplitter`'s resize `useEffect` (symbol, no new number) |
| `test/renderer-runstate.test.cjs` FLOOR-13 header | `DESIGN.md:678` (blank line) | `DESIGN.md:677` |
| `test/renderer-runstate.test.cjs` crossing-boundary test | `SidebarSplitter.tsx:27-34` | `SidebarSplitter`'s resize `useEffect` |

`grep -c "DESIGN.md:678" src/renderer/src/store/sidebarLayout.ts` → **0**. The `DESIGN.md:686`
citation at `SidebarLayout.showOverlay` was left alone: it was not checked in this session and an
unverified "correction" is worse than a stale one.

**What the resize fix does NOT close**, written into the source comment and repeated here: the
genuine rescue path still writes through the persisting setter, so a width really wider than
`viewportWidth − 48` is still reduced and stored. That is the issue-#38 trade and it is the right
one — the alternative is an unreachable handle. The change removes the newly opened 1024–1279 band
from the damage surface entirely and shrinks the pre-existing one at every viewport (at a 1280
viewport the effect fired above 920 before, above 1232 now). The complete fix is a non-persisting
ephemeral setter, which lives in `store.ts` — plan 01-28's file.

## Verification — every command executed in THIS session

| Check | Result |
|---|---|
| `gsd-tools verify artifacts .../01-29-PLAN.md` | `all_passed: true`, **5 / 5** (was 0/5 at session start) |
| `gsd-tools verify key-links .../01-29-PLAN.md` | `all_verified: true`, **4 / 4** (was 0/4 at session start) |
| `node --test test/*.test.cjs` (full suite) | **632 tests / 625 pass / 0 fail / 7 skipped** |
| Delta vs the live baseline measured at session start (626 / 619 / 0 / 7) | **+6 tests, +6 pass, 0 fail, skipped unchanged** — 5 in `renderer-runstate`, 1 in `renderer-components` |
| `npm run typecheck` (node + web) | clean, 0 errors |
| `npx eslint . --max-warnings 0` | exit **0** |
| `npm run build` (electron-vite, Node 22 on PATH) | `✓ built in 39.80s` |
| `npm run e2e` (playwright against real Electron 43) | **2 passed** (16.8s) |
| `node --test test/renderer-runstate.test.cjs` | 24 / 24 |
| `node --test test/renderer-components.test.cjs` | 7 / 7 |
| Task 1 `<done>` predicate (no `includes(flag)`, has `AGENT_PROVIDER_PRESETS`, has `hasBypassFlag`) | exit **0** (exit 1 before the edit) |
| Task 2 `<done>` predicate (three guards anchored on the chip's title) | exit **0** (exit 1 before the edit) |
| Task 3 `<done>` predicate (`minWinWidthFromSource`, `width: 1280`, `splitterReachableMax`, no `DESIGN.md:678`, no spawn API) | exit **0** (exit 1 before the edit) |
| `grep -c "MODEL_CHIP_MAX_W" src/renderer/src/components/AgentCard.tsx` | **2** (was 0 repo-wide) |
| `git status --porcelain src/main/index.ts DESIGN.md` | **empty** |
| `git diff --name-only acd9e97..HEAD` | exactly the six declared files, nothing else |
| `git rev-parse HEAD:src/renderer/src/components/PixelButton.tsx` | `bd286ebf5654a2647c93546dc135f608aeb5d0f0` — the byte pin survives |
| `git diff --diff-filter=D --name-only` across all six commits | empty — no file deleted |

**What `npm run e2e` does and does not cover.** It launches the real Electron 43 binary, runs the
onboarding wizard and spawns Michael onto the floor, with this plan's `AgentCard`, `SidebarSplitter`
and `autoMode` changes in the bundle. That is real evidence the renderer still boots and composes at
the default 1440×900 geometry. It does **not** exercise a 21-character model name, a 1024px viewport,
or a window resize — none of the three visual claims below is covered by it, and none is claimed.

## Deviations from Plan

### Auto-fixed / argued

**1. [Rule 1 — Bug in my own test] `splitterReachableMax(400, 320)` is 352, not 320**
- **Found during:** Task 3 GREEN
- **Issue:** The "never returns below `min`" assertion I wrote in the RED commit used viewport 400,
  where `400 − 48 = 352` already clears `min` — so the assertion was arithmetically wrong and failed
  against a correct implementation.
- **Fix:** The degenerate case is a viewport narrower than `min + reserve`. The assertion now uses
  300 (`→ 320`) and a second one pins 400 (`→ 352`), so the test covers both sides of the `Math.max`
  instead of one wrong point. **The source was not changed to satisfy a test.**
- **Files:** `test/renderer-runstate.test.cjs` — **Commit:** `bbd1fe6`

**2. [Rule 3 — Blocking] The word `child_process` in a comment tripped this plan's own gate**
- **Found during:** Task 3 GREEN
- **Issue:** The plan's `<done>` requires
  `grep -cE "child_process|execFileSync|spawnSync" test/renderer-runstate.test.cjs` → 0. My comment
  explaining that the RED demo spawns nothing used the literal word, so the gate read 1. This is the
  identical trap 01-27, 01-28 and 01-30 hit with `queueFile` / `persistQueues` / `skip: true`.
- **Fix:** The comment now says "Nothing spawned, no git object read" and states explicitly that the
  literal API names are absent *because* the gate is a substring search. No assertion changed.
- **Files:** `test/renderer-runstate.test.cjs` — **Commit:** `bbd1fe6`

**3. [Argued] The per-provider arm's `if (!flag) return false;` was folded into `hasBypassFlag`**
- **Found during:** Task 1
- **Issue:** The plan says to use one helper for both arms and to state the empty-flag guard in the
  code. Keeping the arm's inline guard as well would have left the module with two places that decide
  what an empty flag means — the exact "two idioms in one safety module" the plan spends a paragraph
  banning.
- **Fix:** The guard lives in `hasBypassFlag` alone, with the reasoning (`opencode` and `custom` carry
  `autoFlag: ''`; `[].every(...)` is vacuously true) in its docstring. Both call sites are one line.
- **Files:** `src/renderer/src/store/autoMode.ts` — **Commit:** `83ed8dd`

**4. [Rule 1 — Doc lying about the repo] `ROADMAP.md`'s 01-28 checkbox was unticked**
- **Found during:** State updates
- **Issue:** `01-28-SUMMARY.md` is on disk, `STATE.md`'s Current Position names 01-28 among the landed
  wave-2 plans, and `git log` carries five `(01-28)` commits plus its `docs(01-28)` close-out — but its
  ROADMAP row was still `- [ ]`. Its executor updated STATE and missed ROADMAP.
- **Fix:** Ticked, on the line directly above the one this plan had to edit anyway. No other row and no
  other file touched.
- **Files:** `.planning/ROADMAP.md` — **Commit:** the final metadata commit

**5. [Plan-anticipated] The plan's `<verification>` names `git diff --name-only` with no base**
- On a branch with prior commits that lists nothing. The check was run as
  `git diff --name-only acd9e97..HEAD`, where `acd9e97` is the HEAD this plan started from, which is
  what the clause is asking for. It names exactly the six declared files.

---

**Total deviations:** 5 (1 bug in my own test, 1 blocking, 1 argued, 1 doc correction, 1
plan-anticipated). **Impact:** No scope creep. Deviation 1 is the only one that touched an assertion,
and it strengthened the case rather than weakening it — the wrong expectation was replaced by two
correct ones.

## Residuals — named, with anchors and owners

1. **`opencode`'s chip can still lie in both directions.** Its bypass is written into
   `OPENCODE_CONFIG_CONTENT` at spawn and never reaches the command string, so a toggle flipped after
   spawn moves the chip without moving the agent. The arm was not touched. Ceiling already stated in
   source at `autoMode.ts`'s `opencode` comment. Closing it needs the spawn-time value on the `Agent`
   shape — a store widening. **Owner: 01-31's residual register.**
2. **`autoModeFlagForProvider` reads `autoModeFlag` while `buildSpawnCommand` writes `autoFlag`**
   (`b/WR-01`). Still true, but no longer unguarded: a new assertion pins all eleven presets to agree.
   Repointing the reader is a shared-module change outside this gap set. **Owner: 01-31's register.**
3. **The splitter's rescue path still persists.** A width genuinely wider than `viewportWidth − 48` is
   still reduced and written to `localStorage`. The complete fix is a non-persisting ephemeral setter
   in `store.ts` — **owner: plan 01-28's file**, which has landed, so this needs an owner naming that
   file in a later plan. **Recorded for 01-31's register.**
4. **`b/WR-08` — the model chip's `'CLI default'` fallback asserts a fact about an agent whose row
   could not be resolved.** A real finding, not in this gap set and not fixed here. `AgentCard.tsx`,
   the model chip's `title` ternary. **Owner: 01-31's register.**
5. **The pin is a renderer test parsing a main-process source file** (R-29). Renaming `MIN_WIN`,
   inlining it, or moving it to `src/shared/` makes `test/renderer-runstate.test.cjs` fail with a
   message about the sidebar. Mitigated — the extractor asserts it matched, and the failure message
   names both files and all three constants — but not closed. The durable fix is one exported constant
   both processes import, a cross-process refactor outside this gap set. Stated in the test's own
   comment.

## MEASUREMENT UNAVAILABLE — not verified, must not be read as verified

1. **Whether the card actually composes without clipping at 322px with a 21-character model name.**
   `renderToStaticMarkup` is a server render with no layout; it proves the three guards are present on
   the chip, nothing more. `npm run e2e` boots the real app but never renders that model name.
2. **Whether the collapsed layout reads correctly at a 960px window, and whether a 900px sidebar at a
   1024px viewport — 60px of floor once the resize stops re-clamping it — is a layout the operator
   finds acceptable.** The fix trades an unwanted persistent write for a temporarily cramped floor.
   Only the operator can say that is the right trade for their setup. Inherited from 01-25's open item 2.
3. **Whether the drag path still behaves correctly in a live window.** `SidebarSplitter` is a `.tsx`
   with no DOM in this suite, so the drag clamp's survival is asserted STRUCTURALLY (three source-text
   matches: the `clampMax` formula, its use in the move handler, and `reachableMax` in the effect).
   Weaker than a behavioural assertion and labelled as such in the test file.

## Accepted consequences, restated

| Consequence | Disposition |
|---|---|
| **The custom arm over-reports.** `mytool --auto` and `deploy --approve` now show the AUTO chip, because `--auto` is Kimi's bypass flag and `--approve` is **pi's** (`agentProvider.ts:472-473`, inside the `id: 'pi'` preset at `:463`). Crush carries `--yolo` (`:426-427`) and pi has no yolo flag at all. | **Accepted, deliberately, and pinned as a case.** The module's own docstring names the direction that matters: a missing chip on a bypassed agent is "the worst failure this chip can have". Over-reporting on an unrelated binary is a cosmetic false alarm. Narrowing it needs a per-preset ambiguity annotation on the shared module. |
| `renderToStaticMarkup` proves presence, not layout. | Accepted; stated in the test comment and above. |
| The pin couples two processes through text. | Accepted; ceiling stated, extraction asserts it matched. |
| The rescue path still persists. | Accepted; it is the #38 trade, and the band this plan opened is gone from the damage surface. |

## Threat Flags

None. Every surface this plan touches — the AUTO predicate, the chip's style, the cross-file pin and
the resize bound — is inside the plan's own `<threat_model>` (T-P29-01 … T-P29-09). No new network
endpoint, auth path, file access pattern or schema change at a trust boundary was introduced. No
package was installed; `package.json` is untouched.

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired component was introduced.

## Issues Encountered

- A quoted bash heredoc used to append the pin block to the test file died with
  `unexpected EOF while looking for matching '` under Git Bash on this host. The file was left
  byte-unchanged (`wc -l` unmoved, nothing appended) and the block was written to the session
  scratchpad and `cat`-appended instead. No scratch file was left in the repo.
- **`STATE.md` and `ROADMAP.md` were updated BY HAND, deliberately, without the SDK's state-writing
  verbs.** `gsd-tools state advance-plan` counts SUMMARY files against a plan total it does not know
  and increments blindly in a wave that does not run in plan order; STATE.md's own Current Position
  block records that it already flipped this phase's PARTIAL verdict once and was reverted. Running a
  verb known to clobber and then repairing by hand is strictly worse than editing by hand. So:
  `completed_plans` 28 → 29 (`ls …/*-SUMMARY.md | wc -l` = 29, counted off disk), the wave lines in
  Current Position rewritten, `stopped_at` rewritten, the metrics row appended, three decisions
  appended, and both the 01-29 and the stale 01-28 ROADMAP checkboxes ticked with the progress row
  moved to 29/31. **The PARTIAL verdict line is untouched.**
- **`.planning/REQUIREMENTS.md` was NOT touched** — plan 01-31 owns it. FLOOR-01 and FLOOR-13 are
  recorded in this SUMMARY's `requirements-completed` for 01-31 to close there.

## Next Phase Readiness

- Wave 3 of the gap-closure set: **01-29 is done.** Only **01-31 (wave 4)** remains outstanding.
- **01-31 must add the four residuals above to its register** (opencode's env-based bypass,
  `autoModeFlag` vs `autoFlag`, the splitter's still-persisting rescue with `store.ts` as its site,
  and `b/WR-08`), on top of the residuals 01-25, 01-28 and 01-30 already handed it.
- 01-25's two hand-offs are both discharged: the splitter-persistence fix landed here, and the
  `DESIGN.md` line citations 01-25 preserved (numstat 2/2) were used and corrected while still valid.
- Phase 01 remains **PARTIAL**. Nothing here changes the operator-blocked phase verdict recorded in
  `01-23-SUMMARY.md`.

---
*Phase: 01-finish-the-floor*
*Completed: 2026-08-22*

## Self-Check: PASSED

All six declared files plus this SUMMARY exist on disk; all six task commits exist in
`git log --oneline --all` (`ef8fcfa`, `83ed8dd`, `4c31e55`, `59381d8`, `149feed`, `bbd1fe6`). No
claim in this SUMMARY rests on a command that was not executed in this session.
