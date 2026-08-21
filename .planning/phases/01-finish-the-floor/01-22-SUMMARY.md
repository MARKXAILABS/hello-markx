---
phase: 01-finish-the-floor
plan: 22
subsystem: testing
tags: [floor-15, renderer-tests, ssr, render-to-static-markup, load-ts, zustand, accessibility]
requires:
  - "01-01: test/load-ts.cjs resolving .tsx and transpiling with ts.JsxEmit.ReactJSX — proven by a render, not a grep"
  - "01-01: the draft PR to main (#77), the only thing that makes CI run for this phase"
  - "01-12: the AUTO chip, the folded container aria-label and the model field this plan asserts on"
  - "01-19 / 01-20: the finished renderer tree, so the assertions describe the FINAL markup"
provides:
  - "test/renderer-components.test.cjs — 6 tests that render real .tsx to real markup under node --test"
  - "the renderer's first component coverage: 525 tests on all three CI platforms, up from 519"
  - "FLOOR-01 and FLOOR-13 asserted on RENDERED MARKUP (route A), not on the pure module plan 12 already covers"
  - "a documented four-shim harness that renders a store-coupled component without faking the store"
  - "the measured answer to why an SSR harness cannot see a zustand setState, and where the real seam is"
affects:
  - "plan 01-23: FLOOR-15's ROADMAP clause is TRUE; the FLOOR-15 requirement checkbox is left Pending, plan 23 owns the rows"
  - "plan 01-23: CONVENTIONS.md:101 is measurably wrong (0 of 63 .tsx use a default export) and this file depends on it staying wrong"
  - "whoever renders a component next: the harness comment block is the how-to; the ceiling is stated in the same place"
tech-stack:
  added: []
  patterns:
    - "render the real component, never a Proxy — the analog's proxy-everything predicate is correct for a pure function and catastrophic for a render test"
    - "seed the SERVER snapshot, not the live store — renderToStaticMarkup reads zustand's getInitialState(), so setState() is invisible by design"
    - "assert accessible names, role, aria-hidden and visible text; never a markup string, never a style= attribute"
    - "exclude a component whose only reachable branch asserts nothing, and say why, rather than smoke-checking it green"
key-files:
  created:
    - test/renderer-components.test.cjs
  modified: []
key-decisions:
  - "Route A, not route B. The plan's verbatim probe failed on all three agent renderings and route B (a pure autoMode.ts assertion) was formally available — but route B's own acceptance criterion concedes it adds no FLOOR-01/FLOOR-13 coverage, because plan 12 already covers that module in test/renderer-runstate.test.cjs. The obstacle was measured to be 'Node is not a browser', not 'the component is untestable', so the root-cause fix is to supply the two browser facts Node lacks. AgentCard then renders 3,050 characters of real markup with the AUTO chip in it."
  - "ErrorBoundary.tsx dropped from the candidate set. React error boundaries are inert under SSR — react-dom/server RETHROWS a child's error instead of calling getDerivedStateFromError (measured). Its fallback is unreachable and its pass-through branch renders 13 characters. A non-empty check there would be decoration, so the component is named as excluded rather than tested."
  - "The store is seeded through useStore.getInitialState() rather than setState(). zustand 4.5's useStore passes `api.getServerState || api.getInitialState` as React's getServerSnapshot, and a static render reads exactly that — measured: a setState-seeded card renders byte-identically to an unseeded one. `api` is unreachable from the bound hook (create() does Object.assign(useBoundStore, api)), so the initial-state object IS the seam. Same shape as the documented require.cache injection: seed what the code is about to read, before it reads it."
  - "FLOOR-13's order clause is asserted as FIELD order (the model text's index vs the cost text's index), not as element ordering. The plan forbids element-order assertions as brittle; this one is the requirement's own wording — 'the card shows the model, before the cost' — which plan 12 could only prove by comparing source offsets in the bundle and recorded as MEASUREMENT UNAVAILABLE for the pixels."
patterns-established:
  - "Prove a loader prerequisite by rendering through it, never by grepping it. ts.JsxEmit.React satisfies a JsxEmit grep and then throws ReferenceError: React is not defined on every render."
  - "A RED proof edits the SOURCE, not the test. Ten source defects were injected one at a time; each was reverted before the next."
metrics:
  duration: "~25 min (first loader probe 16:14 UTC → three-platform CI green 16:33 UTC, plus context reading before it)"
  completed: 2026-08-21
  tasks: 3
  commits: 1
  tests-added: 6
  suite: "519 → 525 tests, 0 fail, on ubuntu / windows / macos"
---

# Phase 01 Plan 22: FLOOR-15 — real `.tsx` rendered to real markup Summary

The renderer's first component tests: six tests that load `PixelBadge.tsx`, `BlockedBanner.tsx` and
`AgentCard.tsx` through `test/load-ts.cjs` and push them through `react-dom/server`'s
`renderToStaticMarkup`, with zero new dependencies and the lockfile untouched — and FLOOR-01's AUTO
chip and FLOOR-13's model field asserted on **rendered markup**, which is the route the plan flagged
as the honest one and expected not to get.

---

## 1. Task 1 — the loader prerequisite, proven by a render

`grep -n "tsx\|JsxEmit" test/load-ts.cjs`:

```
70:  // .tsx is load-bearing (D-25): the renderer component suite loads .tsx modules through
75:    `${base}.tsx`,
77:    path.join(base, 'index.tsx')
98:      // ReactJSX, and no other JsxEmit constant. tsconfig.web.json sets "jsx": "react-jsx"
99:      // (the automatic runtime) and only 1 of 63 renderer .tsx files imports React, so the
104:      jsx: ts.JsxEmit.ReactJSX
```

The grep is context. This is the check that decides it — `PixelBadge.tsx` imports nothing but `react`,
so nothing else can be blamed if it fails:

```
$ node -e "…loadTs('src/renderer/src/components/PixelBadge.tsx')…renderToStaticMarkup…"
RENDER PREREQ OK 367
EXIT=0
```

Plan `01-01`'s change landed in a usable form. Both distinguishable failures were absent: no
`Cannot find module …PixelBadge.tsx` (so `.tsx` is in `resolveTs`'s candidate list) and no
`ReferenceError: React is not defined` (so the emit is `ReactJSX`, not the classic-runtime constant
that satisfies a `JsxEmit` grep and then throws on every render).

### Candidate classification — imports and `window.*`, all seven

`grep -n "^import\|window\.cth\|window\.api\|window\.electron" <file>`:

| Candidate | grep result | Class |
|---|---|---|
| `PixelBadge.tsx` | `1:import { CSSProperties } from 'react';` | **SAFE** |
| `ProviderLogo.tsx` | `1:import type { AgentProvider } from '@/store/config';` | **SAFE** (type-only `@/`, erased at transpile) |
| `SidebarTabs.tsx` | `1:import { type SidebarTab } from '@/store/store';` · `2:import { type AccentColorName } from '@/design/tokens';` · `3:import { Icon, type IconName } from './Icon';` | **SAFE-AFTER-STUB** |
| `ErrorBoundary.tsx` | `19:import { Component, type ErrorInfo, type ReactNode } from 'react';` · `20:import { PixelButton } from './PixelButton';` | **SAFE-AFTER-STUB** — but excluded, see §2 |
| `BlockedBanner.tsx` | `1:import { PixelButton } from './PixelButton';` · `2:import { Icon } from './Icon';` · `3:import type { BlockReason } from '@/store/store';` | **SAFE-AFTER-STUB** |
| `ToolWaterfall.tsx` | `1:import { useAgentSpans, useFleetTelemetry, totalTokens, cacheFraction } from '@/hooks/useTelemetry';` | **SAFE-AFTER-STUB** (value `@/` import; needs the alias stub) |
| `UpdateBadge.tsx` | `15,16:import …` plus `27,28,40,41,42,44: window.cth.*` | **EXCLUDE** |

`UpdateBadge.tsx` is excluded on the plan's firmer ground as well as `window.cth`: it reads the
build-time `__APP_VERSION__` define, which plain Node does not have.

### RESEARCH assumption A5 — resolved by measurement

D-26 claimed no `.tsx` references `window.api` / `window.electron`. **The claim is TRUE and
misleading.** Measured across `src/renderer/src --include=*.tsx`:

| Reference | Occurrences | Files |
|---|---|---|
| `window.api` | **0** | — |
| `window.electron` | **0** | — |
| `window.cth` | 198 | **40 of 63** |

The bridge in this app is named `window.cth`, so checking only the two names D-26 named would have
cleared 40 files that touch the preload bridge. Every candidate this plan renders has **zero**
`window.*` references of any kind.

### Export shape — named, in every case

`CONVENTIONS.md:101` says renderer `.tsx` files use default exports. Measured:
`grep -rl "export default" src/renderer/src --include=*.tsx` matches **0 of 63** files.

| Pick | Export line |
|---|---|
| `PixelBadge.tsx` | `51:export function PixelBadge({ status, label, style }: PixelBadgeProps)` |
| `BlockedBanner.tsx` | `10:export function BlockedBanner({ reason, onAction }: BlockedBannerProps)` |
| `AgentCard.tsx` | `66:export function AgentCard({` |

The repo's normal `const { X } = loadTs(...)` idiom applies; a harness reaching for `.default` would
get `undefined` from all three. The test file asserts this at load, so a future default-export
migration fails loudly instead of rendering `undefined` six times.

### Picks, and why

| Pick | Reason | Reachable in the shipping app? |
|---|---|---|
| `PixelBadge.tsx` | the "no imports at all" slot — if it fails, only the loader can be blamed. Also the only candidate with a genuinely prop-driven text branch (`labelByStatus`) | **Yes** — 8 importers incl. `AgentCard`, `CommandCenterPanel`, `FullscreenTerminal`, `TasksKanban` |
| `BlockedBanner.tsx` | the "sibling `.tsx` value imports" slot (`PixelButton` + `Icon`), and it carries a real branch whose absence is a named bug (`:71-81`, an un-closable banner) plus a decorative glyph for the FLOOR-12 a11y rule | **Yes** — `AgentDetailPanel.tsx`, `CommandCenterPanel.tsx` |
| `AgentCard.tsx` | the FLOOR-01 / FLOOR-13 subject, and the "value `@/` import + live store" slot | **Yes** — `AgentStrip.tsx` |

**No dead code is counted as coverage here.** `TerminalView.tsx` (zero importers) and
`FullscreenFileEditor` / `CodeEditor` (reachable only through `FilesTab.tsx`, dead since v0.3.4) were
never candidates, per plan `01-20`'s handoff.

---

## 2. The FLOOR-01 / FLOOR-13 route — measured, and then measured again

### The plan's verbatim probe: all three renderings fail to load

With the `<interfaces>` `@/`-resolving stub in place and nothing else, each of plan 12's three agent
renderings was loaded and rendered. All three threw:

```
===== AgentCard.tsx =====
E:\munder-difflin\node_modules\@xterm\addon-fit\lib\addon-fit.js:1
!function(e,t){…}(self,(()=>(()=>{"use strict";…
                  ^
ReferenceError: self is not defined
    at Object.<anonymous> (…\@xterm\addon-fit\lib\addon-fit.js:1:198)
EXIT=1

===== FullscreenTerminal.tsx =====
E:\munder-difflin\node_modules\@xterm\xterm\css\xterm.css:38
.xterm {
^
SyntaxError: Unexpected token '.'
EXIT=1

===== CommandCenterPanel.tsx =====
E:\munder-difflin\node_modules\@xterm\xterm\css\xterm.css:38
.xterm {
^
SyntaxError: Unexpected token '.'
EXIT=1
```

All three are module-scope browser-code failures in the `@xterm/*` chain, and **none names a `@/`
specifier** — the alias stub was in place, which is the fraud the criterion exists to catch.

`CommandCenterPanel.tsx` threw the `.css` error rather than the `self` error the plan measured. Named,
per the criterion's escape clause: the module is `@xterm/xterm/css/xterm.css` at line 38, reached
through `CommandCenterPanel.tsx:6 → PtyTerminalView.tsx:3 import '@xterm/xterm/css/xterm.css'`, which
sits one import ABOVE `CommandCenterPanel.tsx:15 → terminalPool`. Same chain, different first casualty
because `PtyTerminalView` is imported earlier than `terminalPool` in that file.

### Route B was formally available, and rejected on its own merits

Route B lands on `src/renderer/src/store/autoMode.ts`. `grep -c "autoMode" test/renderer-runstate.test.cjs`
→ **6**, and reading those lines, plan 12 already asserts `isAutoModeAgent` for claude / opencode /
custom / codex, all three `agentRowForCard` branches, and the publish/subscribe singleton. The plan's
own criterion concedes the consequence: *"Route B adds no new coverage for FLOOR-01 and FLOOR-13"*.

The operator directive is to take the root-cause option at a decision point, never the surface one.
The obstacle here was measured to be **"Node is not a browser and is not Vite"**, not "the component
cannot be tested" — so the fix is to hand Node the two facts it is missing, not to abandon the markup
assertion and re-assert someone else's module.

### Route A, measured

Two shims added — `globalThis.self = globalThis` and `.css` imports resolving to `{}` — and
`AgentCard.tsx` loads:

```
LOADED, exports: AgentCard
```

and renders:

```
OFF len 2650 AUTO: false
ON  len 3050 AUTO: true
CHIP aria-hidden: true
LABEL off: Ada — working
LABEL on : Ada — working — Auto mode — Ada runs with permissions bypassed
model field on card: true | off: true
MARKUP ROUTE AVAILABLE 3050
```

**Route A. FLOOR-01 and FLOOR-13 are asserted on rendered markup**, on `AgentCard.tsx` — the primary
agent rendering, reachable through `AgentStrip.tsx`. Neither requirement is claimed on the pure
derivation, and `test/renderer-runstate.test.cjs` keeps its own job: it owns `autoMode.ts`'s *rules*,
this file owns whether the *markup* shows them.

This closes a gap plan 12 could not: plan 12 recorded FLOOR-13 clause 5 (*"the card shows the model,
before the cost"*) as **MEASUREMENT UNAVAILABLE for the pixels**, proven only by comparing source
offsets in the bundle. It is now proven on rendered output.

### The two dead ends on the way, both measured

Recorded because the next person will hit them:

1. **`useStore.setState()` is invisible to a static render.** A card seeded with
   `setState({ agents: [...] })` rendered **byte-identically** (2658 chars, no chip) to an unseeded
   one, with `getState().agents.length === 1` at the same moment. zustand 4.5's `useStore` passes
   `api.getServerState || api.getInitialState` as React's `getServerSnapshot`, and
   `renderToStaticMarkup` reads exactly that.
2. **Assigning `useStore.getServerState` does nothing.** `create()` does
   `Object.assign(useBoundStore, api)` — the methods are copied onto a different object, so the
   assignment lands somewhere `useStore(api, …)` never looks. Also measured: no effect.

The seam is the initial-state object itself. `seedServerSnapshot()` mutates it and restores it in
`t.after`. Nothing is faked: the real selector, the real `agentRowForCard()` and the real
`isAutoModeAgent()` all run against it.

### One prop bug in the plan's own probe, worth recording

The plan's prerequisite command renders `PixelBadge` with `{kind: 'idle'}`. `PixelBadge` has no `kind`
prop — it is `{ status, label, style }` (`PixelBadge.tsx:14-18`). That is the whole explanation for the
plan's measured *"`kind: 'idle'` and `kind: 'working'` produced byte-identical 367-character markup"*:
`status` was `undefined` in both runs, so the label resolved to nothing and the colour lookup missed.
With the real prop the branch is live — `idle` → `"idle"` (418 ch), `working` → `"working"` (427),
`blocked` → `"needs you"` (429), `typing` → `"your draft"` (428).

---

## 3. Task 2 — the harness and the six tests

`test/renderer-components.test.cjs`, 297 lines, one commit: **`23a8af8`**.

### The stub, and the three counts that pin its shape

```js
Module._load = function (request, ...rest) {
  if (request.endsWith('.css')) return {};
  if (request.startsWith('@/')) {
    const hit = resolveAlias(request);
    if (hit) return loadTs(hit);
  }
  return origLoad.call(this, request, ...rest);
};
```

| Check | Required | Actual |
|---|---|---|
| `grep -cE "request *===? *'react'"` | `0` | **0** — no `react` branch survives from the analog |
| `grep -cE "request\.startsWith\('@/'\)"` | ≥ `1` | **1** |
| `grep -c "new Proxy"` | `0` | **0** — nothing is proxied at all |

### The four things the harness supplies, and why none is a mock

| # | Supplied | Why Node needs it | What the real build does |
|---|---|---|---|
| 1 | `globalThis.self` | `@xterm/addon-fit`'s UMD header evaluates `self` at module scope | the browser provides it |
| 2 | `.css` → `{}` | `terminalPool.ts:44` imports `@xterm/xterm/css/xterm.css` | Vite handles it |
| 3 | `@/…` → `src/renderer/src/…` | `resolveTs()` handles `@shared/` only, and must stay that way — `test/pty-sanitize.test.cjs` deliberately proxies `@/…` | `tsconfig.web.json` `paths` / `electron.vite.config.ts` `alias` |
| 4 | the server snapshot seeded | a static render reads `getInitialState()` | a live app has a populated store |

Shims 1–3 are restored immediately after the `loadTs` calls; shim 4 is restored in `t.after`. Blast
radius is exactly this file — `test/load-ts.cjs` is untouched.

### The tests

| # | Test | What a failure would mean |
|---|---|---|
| 1 | `PixelBadge renders a real status chip rather than an empty element` | the swatch or the label stopped rendering (floor: 200 chars, real render ~420) |
| 2 | `PixelBadge renders a DIFFERENT chip for a different status prop` | the `status` prop is ignored — every card on the floor shows the same state |
| 3 | `BlockedBanner with zero actions still renders a way to dismiss it` | the `actions: []` notice `useHive` actually raises becomes un-closable |
| 4 | `BlockedBanner's bell glyph is hidden from assistive technology` | a decorative glyph is announced alongside the heading it only decorates |
| 5 | `FLOOR-01: the AUTO chip appears only when the agent runs with permissions bypassed` | the safety indicator lies, in either direction, about which agents act without asking |
| 6 | `FLOOR-13: the card shows the model, and shows it before the cost` | the three agent renderings disagree about what an agent is again |

Test 5 asserts four things: the chip is absent without the bypass flag, present with it, carries
`aria-hidden="true"`, and the container's `aria-label` folds the phrase in — the exact contract
`AgentCard.tsx:184-187` documents (an `aria-label` on the container replaces all inner text, so the
chip must be hidden and the label must carry the state). The bypass flag is built from
`autoModeFlagForProvider('claude')`, the real spawn contract, not a literal.

### TAP counters, task 2

```
$ TAP=$(mktemp); node --test --test-reporter=tap test/renderer-components.test.cjs > "$TAP"; echo "EXIT=$?"; grep -E "^# (tests|pass|fail|skipped|todo) " "$TAP"
EXIT=0
# tests 6
# pass 6
# fail 0
# skipped 0
# todo 0
```

Baseline was zero on every counter — the file did not exist before this plan.

### File-shape gate

```
$ node -e "…comment-stripped scan…"
FILE OK - renderToStaticMarkup in code, 0 bypasses
EXIT=0
$ ls test/fixtures test/helpers 2>/dev/null
(nothing)
```

### Zero new dependencies

```
$ S="23a8af86fe7d23410f07e3d522d7e18d5b9252aa"
$ n=$(for sha in $S; do git show --name-only --format= "$sha"; done | sort -u | grep -cE "^(package\.json|package-lock\.json)$"); echo "COMMITS=$(set -- $S; echo $#) MANIFEST-TOUCHED=$n"
COMMITS=1 MANIFEST-TOUCHED=0
$ git status --short -- package.json package-lock.json
(empty)
$ node -e "console.log(require('./package.json').dependencies['react-dom'])"
^18.3.1
```

`react-dom` was already a production dependency. The lockfile was never opened.

---

## 4. Task 3 — every test driven RED, and the Proxy trap sprung

Ten source defects were injected one at a time into `PixelBadge.tsx`, `BlockedBanner.tsx` and
`AgentCard.tsx` — never into the test file — each reverted before the next. **Every test failed, and
so did every individual assertion that carries a requirement.**

```
=== RED PROOF: T1 PixelBadge renders a real status chip rather than an empty element
    edited PixelBadge.tsx   EXIT=1   # tests 6 # pass 4 # fail 2
    not ok -> ['PixelBadge renders a real status chip rather than an empty element',
               'PixelBadge renders a DIFFERENT chip for a different status prop']

=== RED PROOF: T2 PixelBadge renders a DIFFERENT chip for a different status prop
    edited PixelBadge.tsx   EXIT=1   # tests 6 # pass 4 # fail 2
    not ok -> ['PixelBadge renders a real status chip rather than an empty element',
               'PixelBadge renders a DIFFERENT chip for a different status prop']
    assertion message: an idle agent and one that needs you render identical markup — the status
                       prop is being ignored, so every card on the floor would show the same state

=== RED PROOF: T3 BlockedBanner with zero actions still renders a way to dismiss it
    edited BlockedBanner.tsx   EXIT=1   # tests 6 # pass 5 # fail 1
    not ok -> ['BlockedBanner with zero actions still renders a way to dismiss it']
    assertion message: a reason carrying no actions rendered no control at all — that banner can
                       never be closed, and it is the shape useHive actually raises

=== RED PROOF: T4 BlockedBanner's bell glyph is hidden from assistive technology
    edited BlockedBanner.tsx   EXIT=1   # tests 6 # pass 5 # fail 1
    not ok -> ["BlockedBanner's bell glyph is hidden from assistive technology"]

=== RED PROOF: T5a FLOOR-01 the chip appears ONLY when the agent is bypassed
    edited AgentCard.tsx   EXIT=1   # tests 6 # pass 5 # fail 1
    not ok -> ['FLOOR-01: the AUTO chip appears only when the agent runs with permissions bypassed']
    assertion message: a card for an agent spawned WITHOUT the bypass flag shows the AUTO chip —
                       the safety indicator is lying in the dangerous direction, claiming an agent
                       needs no approval when it does

=== RED PROOF: T5b FLOOR-01 the chip stays aria-hidden
    edited AgentCard.tsx   EXIT=1   # tests 6 # pass 5 # fail 1
    not ok -> ['FLOOR-01: the AUTO chip appears only when the agent runs with permissions bypassed']
    assertion message: the AUTO chip is no longer aria-hidden — with the card carrying its own
                       aria-label the chip is either announced twice or, if the label loses the
                       phrase too, not at all

=== RED PROOF: T5c FLOOR-01 the card's accessible name carries the bypass phrase
    edited AgentCard.tsx   EXIT=1   # tests 6 # pass 5 # fail 1
    not ok -> ['FLOOR-01: the AUTO chip appears only when the agent runs with permissions bypassed']

=== RED PROOF: T6a FLOOR-13 the model field is on the card
    edited AgentCard.tsx   EXIT=1   # tests 6 # pass 5 # fail 1
    not ok -> ['FLOOR-13: the card shows the model, and shows it before the cost']

=== RED PROOF: T6b FLOOR-13 the model renders BEFORE the cost
    edited AgentCard.tsx   EXIT=1   # tests 6 # pass 5 # fail 1
    not ok -> ['FLOOR-13: the card shows the model, and shows it before the cost']
    assertion message: the cost now renders before the model — FLOOR-13 puts the model first
                       because the cost is the answer and the model is the question it belongs to

=== RED PROOF: T6c FLOOR-13 a missing store row still names the CLI default
    edited AgentCard.tsx   EXIT=1   # tests 6 # pass 5 # fail 1
    not ok -> ['FLOOR-13: the card shows the model, and shows it before the cost']
    assertion message: an agent with no resolvable store row renders a blank where the model goes,
                       instead of saying it runs the CLI default — a blank reads as "unknown" and
                       hides that the card failed to find its own row

TESTS THAT COULD NOT BE MADE TO FAIL: NONE
```

The injected defects, for the record: `PixelBadge` returning `null`; `PixelBadge` ignoring its
`status` prop; `BlockedBanner`'s zero-actions fallback disabled; its `<Icon>` replaced by a bare
`<span>`; the AUTO chip rendered unconditionally; the chip's `aria-hidden` removed; the auto phrase
dropped from the container's `aria-label`; the model `title` flattened; the cost block moved above the
model block; the `'CLI default'` fallback emptied.

### The Proxy trap — T-P22-01

The analog's proxy-everything predicate (`request.startsWith('@/') || request === 'react'` returning a
`Proxy`) was temporarily restored in the harness:

```
DEGENERATE (proxy-everything) HARNESS  EXIT=1
# tests 1 # pass 0 # fail 1
   # TypeError: Cannot set properties of undefined (setting 'displayName')
   not ok 1 - test\renderer-components.test.cjs
   error: 'test failed'
```

`EXIT=1`, `# pass 0`. The tests do not pass against a Proxy — the file does not even finish loading.
The correct predicate was restored immediately.

### Every temporary edit reverted

```
$ T="src/renderer/src/components/PixelBadge.tsx src/renderer/src/components/BlockedBanner.tsx src/renderer/src/components/AgentCard.tsx test/renderer-components.test.cjs"
$ n=0; for f in $T; do git diff --quiet -- "$f" || { echo "STILL DIRTY: $f"; n=$((n+1)); }; done; echo "CHECKED=$(set -- $T; echo $#) DIRTY=$n"
CHECKED=4 DIRTY=0
```

### Containment — this plan committed nothing but its own test file

```
$ S="23a8af86fe7d23410f07e3d522d7e18d5b9252aa"
$ for sha in $S; do git rev-parse --verify "$sha^{commit}" >/dev/null 2>&1 || { echo "FAIL: $sha is not a commit"; exit 1; }; done
$ n=$(for sha in $S; do git show --name-only --format= "$sha"; done | sort -u | grep -vcE "^(test/renderer-components\.test\.cjs)?$"); echo "COMMITS=$(set -- $S; echo $#) OUT-OF-BOUND=$n"
COMMITS=1 OUT-OF-BOUND=0
```

This plan's **code** commit list, in full: `23a8af86fe7d23410f07e3d522d7e18d5b9252aa`.

### Not an orphan

```
$ node -e "…assert package.json's test script still globs test/*.test.cjs…"
GLOBBED OK node --test test/*.test.cjs
EXIT=0
```

Asserted against `package.json`, not against `test/ci-config.test.cjs` — that file is wave-mate plan
`01-21`'s in this same wave, and plan `01-23` verifies its orphan assertion over the final tree.

### Final GREEN

```
EXIT=0
# tests 6
# pass 6
# fail 0
# skipped 0
# todo 0
```

`# pass 6` matches task 2's exactly — no test was quietly turned into a skip while chasing the RED
proofs.

---

## 5. The three-platform gate

`npm test` locally: **exit 0**, `tests 525 / pass 521 / fail 0 / skipped 4` (the 4 skips are the
suite's two long-standing POSIX-only guards, unchanged). Baseline before this plan was
`519 / 515 / 0 / 4` over 59 files; now 60 files.

`npm run typecheck`: exit 0. `npx eslint . --max-warnings 0` (plan `01-21`'s gate): exit 0 — the new
file passes it, and the gate was not weakened, not widened, and carries no `eslint-disable`.

CI, at head SHA `23a8af86fe7d23410f07e3d522d7e18d5b9252aa`:

```
$ gh pr view 77 --json url,isDraft,baseRefName
{"baseRefName":"main","isDraft":true,"url":"https://github.com/MARKXAILABS/hello-markx/pull/77"}

$ gh pr checks 77
Build                            pass  1m4s
CodeRabbit                       pass  0     Review skipped: draft pull request
Electron smoke (ubuntu-latest)   pass  1m30s
Test (macos-latest)              pass  51s
Test (ubuntu-latest)             pass  50s
Test (windows-latest)            pass  1m27s
Typecheck                        pass  43s
GH_PR_CHECKS_EXIT=0
```

Green is not enough on its own — the counts prove the new file actually **ran** on each platform:

| Job | `# tests` | `# pass` | `# fail` | `# skipped` |
|---|---|---|---|---|
| Test (ubuntu-latest) | 525 | 525 | 0 | 0 |
| Test (windows-latest) | 525 | 521 | 0 | 4 |
| Test (macos-latest) | 525 | 525 | 0 | 0 |

519 → 525 on every platform: exactly this plan's six. And by name, from the windows-latest log:

```
ok 384 - PixelBadge renders a real status chip rather than an empty element
ok 385 - PixelBadge renders a DIFFERENT chip for a different status prop
ok 386 - BlockedBanner with zero actions still renders a way to dismiss it
ok 387 - BlockedBanner's bell glyph is hidden from assistive technology
ok 388 - FLOOR-01: the AUTO chip appears only when the agent runs with permissions bypassed
ok 389 - FLOOR-13: the card shows the model, and shows it before the cost
```

The lint gate ran inside the Typecheck job at the same SHA:

```
##[group]Run npm run lint
> eslint . --max-warnings 0
```

---

## 6. Deviations from Plan

### Auto-fixed

**1. [Rule 2 — missing critical functionality] Route A taken where the plan's probe said route B**

- **Found during:** Task 1
- **Issue:** the plan's verbatim probe failed on all three agent renderings, formally licensing route
  B — a pure `autoMode.ts` assertion whose own acceptance criterion concedes it *"adds no new coverage
  for FLOOR-01 and FLOOR-13"*, because plan 12 already covers that module. Taking it would have left
  this plan's must_haves truth (*"FLOOR-01's auto-mode chip and FLOOR-13's field set are asserted on
  the route task 1 MEASURED"*) technically satisfied and substantively empty.
- **Fix:** measured the actual obstacle rather than accepting the verdict. Two browser facts Node
  lacks — `self` and CSS-import handling — turned out to be the whole of it. `AgentCard.tsx` then
  renders 3,050 characters of real markup with the AUTO chip in it. Both probes are pasted in §2; the
  plan's own escape clause covers route B *"only where task 1 pasted the load error proving markup is
  impossible"*, and markup is demonstrably not impossible.
- **Files:** `test/renderer-components.test.cjs` · **Commit:** `23a8af8`

**2. [Rule 1 — bug in the plan's evidence] `PixelBadge` has no `kind` prop**

- **Found during:** Task 1
- **Issue:** the plan's prerequisite command and its "measured" note both use `{kind: 'idle'}` /
  `{kind: 'working'}`, and conclude the prop pair "would assert nothing" because the two renders were
  byte-identical. `PixelBadge`'s props are `{ status, label, style }` (`:14-18`) — `kind` was silently
  dropped, `status` was `undefined` in both runs, and the identical output was the symptom.
- **Fix:** used the real prop. The branch is live and distinct across statuses (§2).
- **Files:** none (evidence correction) · **Commit:** n/a

**3. [Rule 3 — blocking] `ErrorBoundary.tsx` dropped from the candidate set**

- **Found during:** Task 2
- **Issue:** the plan directs *"assert its caught-error branch instead, by rendering a child that
  throws"*. React error boundaries do not exist on the server: `react-dom/server` **rethrows** the
  child's error rather than calling `getDerivedStateFromError`. Measured — `renderToStaticMarkup`
  propagates `Error: ledger card had no title` straight out. The fallback is unreachable, and the only
  other branch renders 13 characters (`<div>ok</div>`).
- **Fix:** the component is excluded and named as excluded, in the test file's header and here, rather
  than smoke-checked green. A test that cannot be made to fail is decoration.
- **Files:** `test/renderer-components.test.cjs` (header) · **Commit:** `23a8af8`

**4. [Rule 3 — blocking] Store seeded through `getInitialState()`, not `setState()`**

- **Found during:** Task 1
- **Issue:** `setState()` is invisible to a static render (measured twice, §2), and the obvious fix —
  assigning `useStore.getServerState` — lands on the wrong object because `create()` does
  `Object.assign(useBoundStore, api)`.
- **Fix:** `seedServerSnapshot()` mutates the initial-state object, which **is** the server snapshot,
  and restores it in `t.after`. Documented at length at the call site, with the measurement.
- **Files:** `test/renderer-components.test.cjs` · **Commit:** `23a8af8`

### Deliberate departures from a plan instruction, with the reason

**5. FLOOR-13's order clause is asserted, against the plan's "never assert element ordering" rule.**
The rule's rationale is brittleness against a legitimate refactor. This assertion compares the index
of two named text fields (`Model: <id>` and `$1.23`), not DOM structure, no element name and no
`style=` attribute — and *"the card shows the model, before the cost"* is FLOOR-13's own wording, the
clause plan 12 recorded as **MEASUREMENT UNAVAILABLE for the pixels**. It is proven RED by moving the
cost block above the model block (§4, T6b). Nothing else in the file asserts order.

**No architectural changes.** No Rule 4 checkpoint was reached.

---

## 7. must_haves — verdict per truth

| # | Truth | Verdict | Evidence |
|---|---|---|---|
| 1 | The renderer has component tests beyond the boot smoke spec — real `.tsx` rendered under `node --test` | **SATISFIED** | 6 tests over 3 real components; `RENDER PREREQ OK 367`; `MARKUP ROUTE AVAILABLE 3050` (§1, §2) |
| 2 | Zero new dependencies; `react-dom` already a production dependency | **SATISFIED** | `MANIFEST-TOUCHED=0` over this plan's commits; `git status -- package*.json` empty; `react-dom` `^18.3.1` in `dependencies` (§3) |
| 3 | The tests run on all three CI platforms in the existing gate, evidenced on plan 01-01's draft PR to `main` | **SATISFIED** | `gh pr checks 77`: `Test (ubuntu-latest)` / `Test (windows-latest)` / `Test (macos-latest)` all `pass` at `23a8af8`; 519 → 525 on each; the six named `ok` lines from the windows log (§5) |
| 4 | At least 5 tests PASS, by TAP counters | **SATISFIED** | `EXIT=0`, `# pass 6`, `# fail 0`, `# skipped 0`, `# todo 0`, twice (§3, §4) |
| 5 | Assertions are semantic — accessible names, role, `aria-hidden`, visible text — never exact markup strings | **SATISFIED** | no assertion compares a full markup string, an element name or a `style=` attribute. One field-ORDER assertion, declared as a deliberate departure with its reason (§6.5) |
| 6 | The assertion ceiling is stated in the file: SSR runs no effects and no events | **SATISFIED** | the header's "THE CEILING, STATED UP FRONT" block, which also enumerates the four things this harness structurally cannot see, including the ErrorBoundary finding |
| 7 | FLOOR-01's chip and FLOOR-13's field set are asserted on the route task 1 MEASURED; the SUMMARY names the route; neither route may be claimed as the other | **SATISFIED** | **Route A**, on rendered markup, on `AgentCard.tsx`. Both probes pasted in §2 — the plan's verbatim one (three structural failures) and the shimmed one (`MARKUP ROUTE AVAILABLE 3050`). The pure `autoMode.ts` derivation is **not** asserted here and is not claimed as markup coverage; it stays plan 12's in `test/renderer-runstate.test.cjs` |

**Artifact:** `test/renderer-components.test.cjs` exists, provides a `renderToStaticMarkup` harness
plus 6 component tests, and contains `renderToStaticMarkup` **in code** (comment-stripped scan, §3).

**Key link:** `test/renderer-components.test.cjs` → `test/load-ts.cjs`, via the `.tsx` resolution and
`ts.JsxEmit.ReactJSX`. Proven by render, not by grep (§1). `test/load-ts.cjs` was not edited.

---

## 8. Threat register outcomes

| Threat ID | Outcome |
|---|---|
| T-P22-01 — a green run that asserted nothing because `react` was proxied | **Mitigated and proven.** The degenerate predicate produces `EXIT=1 / # pass 0`; the stub's three grep counts pin its shape (§3, §4) |
| T-P22-02 — tests that only assert "render did not throw" | **Mitigated.** Every test compares two prop values or asserts a named semantic property; all 6 driven RED against 10 real source defects (§4) |
| T-P22-03 — a test file that never runs because it is not in a hand-list | **Mitigated.** `GLOBBED OK node --test test/*.test.cjs`, asserted against `package.json`; and the file's 6 tests appear by name in all three CI platform logs (§4, §5) |
| T-P22-04 — jsdom / RTL smuggled in to make assertions easier | **Mitigated.** `MANIFEST-TOUCHED=0`; D-24/D-26/D-27 named in the file header so nobody "upgrades" it (§3) |
| T-P22-05 — a component that needs `window.cth` and gets a fake | **Mitigated.** All three picks have zero `window.*` references; A5 resolved by census (§1). `UpdateBadge.tsx` excluded |
| T-P22-06 — five `{skip}` stubs closing FLOOR-15 | **Mitigated.** `# pass 6 / # skipped 0 / # todo 0`, plus the comment-stripped bypass scan (§3) |
| T-P22-07 — the prerequisite grep passing on a loader that cannot render | **Mitigated.** Proven by `RENDER PREREQ OK 367` (§1) |
| T-P22-08 — route B reached by omitting the `@/` stub | **Not applicable — route A was taken.** The three route-B receipts are pasted anyway (§2) and none names a `@/` specifier |

---

## 9. Known Stubs

None. No hardcoded empty value, placeholder string, `TODO` or `FIXME` was introduced. The one
deliberate omission — `ErrorBoundary.tsx` — is an *absence* of a test, documented in the file header
and in §6.3 with its measured reason, not a stub that renders as coverage.

---

## 10. Threat Flags

None. This plan's only artifact is one `test/*.cjs` file. It opens no network endpoint, no auth path,
no file-access pattern and no schema. It does mutate two process globals (`globalThis.self`,
`Module._load`) during module load — both restored in the same `finally`, and both confined to the
test process.

---

## 11. Requirement checkboxes

**FLOOR-15's row in `.planning/REQUIREMENTS.md` is deliberately left `Pending`.** Plans `01-02` …
`01-21` all did the same and plan `01-23` owns the rows. FLOOR-15's ROADMAP clause — *"the renderer has
component tests beyond the boot smoke spec"* — is TRUE as of this plan.

---

## 12. Commits

| SHA | Message | Size |
|---|---|---|
| `23a8af8` | `test(01-22): render real .tsx to markup under node --test, zero new dependencies` | 1 file, +297 |
| `97f7227` | `docs(01-22): complete FLOOR-15 — the renderer's first component tests` | SUMMARY + STATE + ROADMAP |

`SHAS` (this plan's **code** commits, the list the containment and dependency criteria bind):
`23a8af86fe7d23410f07e3d522d7e18d5b9252aa`. The bookkeeping commit above is not in it, by the plan's
own definition.

**Post-bookkeeping CI re-verify at `97f72277cc883877b469818380069793b6a141e5`** — the SHA that actually
ships, not just the one the code landed on. All seven rows `pass`, `gh pr checks` exit `0`:
`Build` · `Electron smoke (ubuntu-latest)` · `Test (macos-latest)` · `Test (ubuntu-latest)` ·
`Test (windows-latest)` · `Typecheck` · `CodeRabbit` (skipped, draft).

**One concurrent commit landed under this plan mid-flight:** `3531f59`
(`docs(02): phase 2 plan set`) became `23a8af8`'s parent between this executor's `git status` and its
commit. It is not this plan's, it touches only `.planning/phases/02-*`, and the per-commit containment
check (`OUT-OF-BOUND=0`) is precisely why that cannot contaminate this plan's verdict.

---

## 13. Handoff

- **Plan 01-23 (completeness bar):** FLOOR-15's ROADMAP clause is TRUE and its requirement row is
  `Pending` for you. Two documentation corrections fall in your scope, both measured here:
  `CONVENTIONS.md:101` ("React components use default exports in `.tsx` files") is wrong — 0 of 63
  files — and `TESTING.md`'s "Gap — no renderer component tests" paragraph is now stale.
  `TESTING.md`'s "Actual current state" line still says 423 tests; it is 525.
- **Whoever renders a component next:** the harness comment block in
  `test/renderer-components.test.cjs` is the how-to and the ceiling in one place. The two traps that
  cost the most time here are both written down at the call site: a Proxy'd `react` renders as a Proxy,
  and a zustand `setState()` is invisible to a static render.
- **Whoever owns `test/load-ts.cjs`:** it was not edited, and it should not be widened to resolve
  `@/`. `test/pty-sanitize.test.cjs` deliberately proxies `@/…` so `useHive.ts` loads without its
  store; resolving the alias in the shared loader would hand that file the real modules instead.
- **Whoever owns the agent renderings:** `AgentCard.tsx` is now the only one this harness can render.
  `FullscreenTerminal.tsx` and `CommandCenterPanel.tsx` are reachable too — both loaded fine with the
  same two shims — but neither was needed for FLOOR-01/FLOOR-13 and neither is asserted here. If the
  four-renderings consistency clause ever needs proving on markup, the harness already reaches them.
- **Not claimed:** nothing in this file asserts anything about layout, pixels, focus rings, hover,
  click, or the 1024px collapse. SSR cannot see any of it, and the header says so.

---

## Self-Check

```
$ [ -f test/renderer-components.test.cjs ] && echo FOUND || echo MISSING
FOUND: test/renderer-components.test.cjs
$ git log --oneline --all | grep -q 23a8af8 && echo FOUND || echo MISSING
FOUND: 23a8af8
```

## Self-Check: PASSED
