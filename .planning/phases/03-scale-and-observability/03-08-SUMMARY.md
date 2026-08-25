---
phase: 03-scale-and-observability
plan: 8
subsystem: renderer
tags: [scale-05, derivation-module, useSyncExternalStore, declared-gaps, context-threshold]
status: BLOCKED — Task 4's blocking operator gate has NOT been run
requires:
  - "03-02: control:breakerSnapshot, hive:agentDirectory's spawnedAt/costLifetime/costUnattributed, the corrected per-agent cost join"
  - "03-07: the day band's 'none' vs 'transcript' cost-tier split, whose vocabulary this plan's cost cell follows"
provides:
  - "src/renderer/src/store/agentView.ts — the ONE derivation for cost / uptime / context / account / block state"
  - "CONTEXT_PRESSURE_HIGH=85 / CONTEXT_PRESSURE_WARN=65 — the single context-pressure pair, replacing three drifted ones"
  - "deriveCost's THREE-kind gap discriminant: 'no-meter' | 'unattributed' | 'unresolved'"
  - "the first production caller of control:breakerSnapshot and of hive:agentDirectory"
  - "useFleetTelemetry as ONE shared subscription (module singleton), public signature unchanged"
  - "AgentStatCard — the consolidated five-field card, exported and server-renderable"
affects:
  - "src/renderer/src/components/AgentCard.tsx (colour source only; box untouched)"
  - "src/renderer/src/components/FullscreenTerminal.tsx (colour source only; zero visible change)"
  - "src/renderer/src/components/CommandCenterPanel.tsx (88/75 -> 85/65)"
  - "src/renderer/src/components/AgentDetailPanel.tsx (new card + god residual)"
tech-stack:
  added: []
  patterns:
    - "module-singleton + useSyncExternalStore(sub, get, get) — autoMode.ts's shape, now used by agentView.ts and useTelemetry.ts"
    - "discriminated {kind:'measured'|'unmeasured'} derivations so every cell has a declared-gap branch"
    - "reference-counted first-subscriber pull: ONE IPC round trip per beat regardless of mount count"
key-files:
  created:
    - src/renderer/src/store/agentView.ts
  modified:
    - src/renderer/src/hooks/useTelemetry.ts
    - src/renderer/src/components/AgentCard.tsx
    - src/renderer/src/components/FullscreenTerminal.tsx
    - src/renderer/src/components/CommandCenterPanel.tsx
    - src/renderer/src/components/AgentDetailPanel.tsx
    - test/renderer-runstate.test.cjs
    - test/renderer-components.test.cjs
    - test/repo-claims.test.cjs
decisions:
  - "deriveCost carries a THIRD gap kind, 'unresolved', beyond the plan's named two — hive:agentDirectory returns REGISTRY agents, so a store agent absent from the registry has no row for the life of the process and the two-kind union would have rendered it a measured $0.00 forever"
  - "The gap sentence is REPRODUCED in agentView.ts rather than imported from store/config.ts (which is not @shared, and the module is @shared-only by design so it loads with no DOM) — and pinned byte-identical against capabilityGaps for all 7 'none'-tier presets so the copy cannot drift"
  - "The breaker PUSH folds into agentView's cache; cost deliberately does not. A dollar figure 30s stale is fine; a block state 30s stale is D-36's fail-unsafe window"
  - "The god does NOT receive this card (UI-SPEC S2d residual, declared in code and here)"
metrics:
  duration: ~3h
  completed: 2026-08-26
  tests_before: 1184 (1177 pass / 0 fail / 7 skipped, 25118.7ms)
  tests_after: 1213 (1206 pass / 0 fail / 7 skipped, 25237.7ms)
  tests_added: 29
  mutants_killed: 34
---

# Phase 3 Plan 8: SCALE-05 — one derivation for the five agent stats Summary

One pure React-free module (`agentView.ts`) now owns cost, uptime, context, account and
block state; the three renderings that had drifted to 85/65, 88/75 and 87.5/75 all read
one threshold; `useFleetTelemetry`'s four independent mounts collapse to one
subscription; and the consolidated five-field card lands in `AgentDetailPanel.tsx` with
a declared-gap branch on every cell — but **Task 4's blocking operator gate has not been
run, so this plan is NOT closed.**

## ⛔ STATUS: BLOCKED — Task 4 was not run, and was not auto-approved

Tasks 1-3 are complete, committed and verified. **Task 4 is a `checkpoint:human-verify`
with `gate="blocking"` and it remains OPEN.**

Auto mode was active for this run. GSD's auto-mode rule would auto-approve a
`human-verify` checkpoint. It was **not** applied here, because the global
PRODUCTION-STRESS MANDATE overrides it in as many words: *"Skip a plan-mandated live-run
/ live-bench / operator sign-off → STOP."* Task 4 requires the running Electron app, an
operator dragging the real sidebar splitter, `localStorage` read back at each stop, and
the same probe at base sha and head sha. A parallel worktree executor cannot produce any
of that, and auto-approving it would have written "approved" into this SUMMARY with no
operator behind it. See "What the gate still needs" below.

## What was built

| # | Task | Commit | Result |
|---|------|--------|--------|
| 1 | RED — derivations + collapse | `ec1d7166` | fails at load: `agentView.ts` absent |
| 1 | GREEN — `agentView.ts`, telemetry singleton | `ee813133` | 39/39 runstate; 19 mutants killed |
| 2 | RED — three-file threshold pin | `9d17de2a` | pin red; regression guard green (by design) |
| 2 | GREEN — the three renderings rewired | `dbd760f3` | 1202 tests, 0 fail; 3 mutants killed |
| 3 | The consolidated card + god residual | `d20bfecb` | 12 SCALE-05 cases on real markup; 13 mutants killed |
| 4 | Blocking operator gate | — | **NOT RUN** |

### `agentView.ts` — the one derivation

Five exported derivations (`deriveCost`, `deriveDuration`, `deriveContext`,
`deriveContextColor`, `deriveState`) plus `deriveAccount`, all pure, `@shared`-only, and
loadable under plain `node --test`. `deriveContextColor(pct, accent)` has ONE signature
and it is percentage-based — a `(tokens, limit)` signature would have been unusable at
`AgentCard.tsx`, which has no measured limit in its colour path at all, and would have
silently deleted the compaction warning for every agent whose limit was never reported.

The module singleton is the **first production caller** of both
`control:breakerSnapshot` (built in 03-02 and deliberately left caller-less) and
`hive:agentDirectory` (which had zero renderer callers, so 03-02's `spawnedAt`,
`costLifetime` and `costUnattributed` were typed all the way to the preload and reached
nothing). It is reference-counted: N mounted cards produce ONE pull per 30s beat, not N.
**03-02's O(n²) fix is preserved — nothing in this plan calls `snapshotAll()`, per-agent
or otherwise; the renderer consumes the already-built map through the IPC.**

### The threshold, and what actually changed on screen

| Site | Before | After | Visible change |
|------|--------|-------|----------------|
| `FullscreenTerminal.tsx` | 85 / 65 | shared 85 / 65 | **none** — source moved, every colour byte-identical |
| `CommandCenterPanel.tsx` | 88 / 75 | shared 85 / 65 | pct 86 now coral (was lemon); pct 80 lemon under both (control) |
| `AgentCard.tsx` | `progress >= 7`/`>= 6` over 0..8 (87.5 / 75) | shared, fed the pct the card already computes | **none at any integer bucket** — 7→87.5→coral, 6→75→lemon |

`AgentCard`'s 0..8 gauge geometry and its 322×86 box are untouched (`const width = 322`
still reads 2 occurrences, `const height = 86` reads 1).

### The card

`AgentStatCard`, mounted between the `openTerminalError` strip and `BlockedBanner` —
the banner keeps its deliberate position directly above the tabs. All five values come
from `agentView.ts`; the component computes nothing but its own `k()` formatter.

| Cell | Measured | Declared gap |
|------|----------|--------------|
| cost | `$1.23`, or `$1.23 (lifetime)` with a title naming the all-time window | `no cost meter` / `spend not attributable` / `no reading yet` — **no `$` character anywhere** |
| up | `2h 14m` / `4m` / `41s` | `not recorded`, never `0s` |
| context | `50k / 200k (25%)` + a 4px rail | `not reported`, never `0%` and no empty rail |
| account | the pinned label | `Login account`, never blank |
| state | `healthy` · `steering` · `constrained` · `stopped` | `unknown`, never `healthy` |

`$0.00` still renders for a metered engine that genuinely spent nothing — the control
that stops the three no-`$` assertions from passing vacuously.

## Deviations from Plan

### 1. [Rule 2 — missing critical functionality] `deriveCost` needed a THIRD gap kind

- **Found during:** Task 1.
- **Issue:** The plan fixed the discriminant at `'no-meter' | 'unattributed'`. With only
  those two, an agent whose `view.usd` is `undefined` falls through to the measured
  branch and renders `$0.00`. That is not a transient mount-window problem:
  `hive:agentDirectory` enumerates **registry** agents, so a store agent that never
  reached the hive registry has no row for the life of the process and would render a
  measured `$0.00` forever — precisely the faked zero D-35 exists to forbid.
- **Fix:** `CostGapKind` is `'no-meter' | 'unattributed' | 'unresolved'`. The cell renders
  `no reading yet` for the third. The plan's `reasonKind` pins are unaffected (the union
  is wider, not different).
- **Files:** `src/renderer/src/store/agentView.ts`, `AgentDetailPanel.tsx`.
- **Commit:** `ee813133`, `d20bfecb`.

### 2. [Rule 3 — blocking] The gap sentence could not be imported, so it is pinned instead

- **Found during:** Task 1.
- **Issue:** The plan requires the EXACT `capabilityGaps` spend sentence and, in the same
  breath, requires `agentView.ts` to be `@shared`-only so it loads without a DOM.
  `capabilityGaps` lives in `store/config.ts`, which is not `@shared`. The two
  requirements cannot both be met by an import.
- **Fix:** The sentence is reproduced once, and a test asserts it byte-identical to
  `capabilityGaps(...).find(g => g.key === 'spend').sentence` **for all 7
  `costTracking:'none'` presets**. Reword either side and the suite reddens. Mutant
  `cost: gap sentence reworded` confirms it.
- **Commit:** `ee813133`.

### 3. [Rule 1 — my own test was wrong] A label check that a mutant walked straight past

- **Found during:** Task 3's mutation sweep.
- **Issue:** My "all five labels render" case asserted `visibleText(markup).includes('account')`.
  A mutant that renamed the `account` **label** to `acct-DROPPED` **SURVIVED**, because the
  account cell's **value** is `Login account` — the substring was satisfied by the value, not
  the label. The test would not have noticed a dropped or renamed cell.
- **Fix:** Replaced with an exact, ordered read of the five label elements via their own
  `--cth-text-body-sm` token. Mutant now killed.
- **Commit:** `d20bfecb`.

## Stale plan baselines, re-measured

The plan's warning held: several stated baselines had moved.

| Plan's claim | Measured at base `f6b60dd6` | Consequence |
|---|---|---|
| `CommandCenterPanel.tsx:853` holds `cpct >= 88` | it is at **`:914`** | content-matched, not line-matched |
| `AgentDetailPanel.tsx` header ends ~`:203`, error strip `:205-212`, banner `:220-232` | ends `:204`, strip `:206-213`, banner `:221-237` | insertion point found by content |
| `useTelemetry.ts`: 7 `useState`, **"5 in `useFleetTelemetry` and 2 in `useAgentSpans`"** | 5 in `useFleetTelemetry`, **1** in `useAgentSpans`, **1 in the import statement** | the "file total 2 after" target is still right, but for a different reason than the plan states |
| `grep -c -F "AgentDetailPanel" test/renderer-components.test.cjs` is **0** | **1** (a GATE-05 case reads the file as a source path, `:1118`) | **the pin was already satisfied before any work — it could never have gated anything** |
| `grep -c -F "no cost meter" test/renderer-components.test.cjs` is **0** | **3** (03-07's day-band cost-tier cases, `:1525/:1552/:1563`) | **same: an existence pin that was green before the plan started** |
| `test/repo-claims.test.cjs:1902`, `control:` handler count pinned at 10 | still **10**, unchanged | this plan adds NO `control:` channel; it only calls an existing one |

Two of Task 3's five "measured **0** right now" existence pins were **already non-zero**,
so neither could have failed before the work. They are recorded here rather than quietly
passed: the real coverage for those branches is the twelve `renderToStaticMarkup` cases
and the thirteen mutants, not the greps.

`FullscreenTerminal.tsx:533` was the one cited line that had **not** moved.

## Flagged, unowned — not fixed here

**`useSyncExternalStore` is called with TWO arguments in three shipped files.** UI-SPEC
S2a states *"Every shipped call site already does this correctly"* and lists five. That
claim is measurably false. These three pass two arguments and therefore throw
*"Missing getServerSnapshot"* under `renderToStaticMarkup`:

- `src/renderer/src/design/theme.ts:57` (`useAppTheme`)
- `src/renderer/src/realtime/costStore.ts:117`
- `src/renderer/src/realtime/session.ts:536`

This is not academic. It is the **sole** reason the whole `AgentDetailPanel` cannot be
server-rendered: the component **loads** cleanly under the test shim (measured — the plan
expected the import graph might be intractable; it is not), and the render then dies in
`useAppTheme` by way of `PtyTerminalView`. None of those three files is in this plan's
`files_modified`, so the defect is reported, not patched.

03-07's flagged `preload/index.ts:826` (`hiveTimelineBucket.rows` typed `unknown[]`,
erasing `timeline.ts`'s `DetailRow` union) is likewise **not** in this plan's
`files_modified` and was **left untouched**.

## Test-coverage honesty statement (Task 3's explicit requirement)

The twelve SCALE-05 card cases are **real `renderToStaticMarkup` renders of the shipped
`AgentStatCard`** — the component is loaded through the suite's existing `Module._load`
shim, mounted, and rendered; every gap-branch assertion is on real markup. This is
stated in a code comment at the loader and again above the test block.

What is **not** render-proven, and is asserted structurally with that label attached in
the test itself: that `AgentDetailPanel` mounts the card, that it sits above
`BlockedBanner`, and that the god residual comment exists — because the panel cannot be
server-rendered for the reason above. No `renderToStaticMarkup` coverage is claimed for
`AgentDetailPanel` as a whole.

## Named residual — the god is not covered (UI-SPEC S2d)

`AgentDetailPanel.tsx`'s `if (agent.isGod) return <CommandCenterPanel agent={agent} />`
means the god never renders this component's body and therefore **never renders this
card**. `CommandCenterPanel`'s floor tab already shows cost, context and breaker state
per roster row; it shows **neither duration nor account**, so those two fields are
genuinely absent for the god alone. The decision was to leave it rather than mount the
card above the command centre's tab strip, which would cost roughly 62px of vertical
space in the most contended column in the app. Declared in a code comment at the
early return that causes it, and pinned by a test.

## UI-SPEC edit owed (not made — file not in `files_modified`)

`03-UI-SPEC.md` §S2b's field table and §Copywriting need a **fourth** cost row for the
`unattributed` gap (`spend not attributable`), and now a **fifth** for `unresolved`
(`no reading yet`). The spec currently documents only `no cost meter`. This plan does not
own `03-UI-SPEC.md`, so the edit is recorded here as owed.

## Verification

| Gate | Result |
|------|--------|
| `npm test` | **1213 tests, 1206 pass, 0 fail, 7 skipped, 25237.7ms** |
| baseline at `f6b60dd6` | 1184 tests, 1177 pass, 0 fail, 7 skipped, 25118.7ms |
| delta | +29 tests, +119ms (+0.5%) — no measurable clock regression |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 0 warnings |
| mutation | **34 mutants applied, 34 killed** (1 survived first pass and found a real defect in my own test — see Deviation 3) |

Commit-scoped acceptance pins:

- `git log --grep="03-08" -- store/agentView.ts` → **1** (≥1 required)
- `git log --grep="03-08" -- AgentStrip.tsx ToolWaterfall.tsx` → **0** (0 required)
- `git log --grep="03-08" dbd760f3..HEAD -- AgentDetailPanel.tsx` → **1** (≥1 required)
- `git log --grep="03-08" dbd760f3..HEAD -- AgentCard.tsx` → **0** (0 required)

## Task 4 — the blocking gate, and what it still needs

### Supporting measurement already taken (this is NOT the gate)

The shipped card's markup was measured in a real layout engine (Playwright/Chromium
151.0.7922.34, already a devDependency) inside a container of each requested width, with
the real `tokens.css`, at head sha `d20bfecb`:

| requested width | measured container | **column count** | column widths | 5 cells present | any cell clipped | grid overflows |
|---|---|---|---|---|---|---|
| 320 | 320px | **2** | 143, 143 | yes (5/5) | no | no |
| 420 | 420px | **3** | 126 ×3 | yes (5/5) | no | no |
| 900 | 900px | **5 occupied** (auto-fit emits a 6th track at 0px) | 168 ×5, then 0 | yes (5/5) | no | no |

Positive control held at every stop: the card element was FOUND and MOUNTED
(height > 0). The column count **changes** across the three widths (2 → 3 → 5), which is
the property the gate exists to establish, and 320→2 / 900→5 match the plan's stated
expectation.

### Why that is not the gate, and what remains

This measurement is of the CARD in a synthetic container. It does **not** discharge Task
4, which additionally requires:

1. The **dev Electron app running**, with a non-god agent that has a **live PTY**.
2. The **real sidebar splitter dragged** to `sidebarWidth` 320 / 420 / 900, with the value
   **read back from `window.localStorage.getItem('cth.sidebarWidth')`** at each stop and
   recorded beside the observed result.
3. The **`BlockedBanner`** (triggered if possible) confirmed still directly above
   `SidebarTabs`, unmoved by the card's insertion.
4. The **base-sha run** as the control — recording the container's pre-existing behaviour
   at each `sidebarWidth`, and that `BlockedBanner` already sat directly above
   `SidebarTabs`. The card does not exist at base `f6b60dd6`, so only the container half
   is measurable there.
5. `Emulation.setDeviceMetricsOverride` for the window size, printing the true
   `window.innerWidth` beside the requested one (per 01-15: `page.setViewportSize`,
   `win.setBounds` and `win.setContentSize` all leave `window.innerWidth` pinned at 1280
   in Electron).

**MEASUREMENT UNAVAILABLE for items 1-5 — requires an operator at the running app.**

**Resume signal:** type `approved` plus the three width/column-count pairs, or report the
exact width and cell that broke.

## Self-Check: PASSED

Files verified present on disk: `src/renderer/src/store/agentView.ts`,
`src/renderer/src/hooks/useTelemetry.ts`, `src/renderer/src/components/AgentCard.tsx`,
`src/renderer/src/components/FullscreenTerminal.tsx`,
`src/renderer/src/components/CommandCenterPanel.tsx`,
`src/renderer/src/components/AgentDetailPanel.tsx`, `test/renderer-runstate.test.cjs`,
`test/renderer-components.test.cjs`, `test/repo-claims.test.cjs`.

Commits verified in `git log`: `ec1d7166`, `ee813133`, `9d17de2a`, `dbd760f3`,
`d20bfecb`.

No file outside this plan's `files_modified` was touched. `STATE.md` and `ROADMAP.md`
were not modified.
