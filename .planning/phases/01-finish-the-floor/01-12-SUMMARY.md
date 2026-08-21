---
phase: 01-finish-the-floor
plan: 12
subsystem: renderer-agent-renderings
tags: [floor-01, floor-13, safety-indicator, accessibility, responsive, ui-spec]
requires:
  - "autoModeFlagForProvider / inferAgentProvider (src/shared/agentProvider.ts) — the spawn-time flag table"
  - "buildSpawnCommand (src/renderer/src/store/config.ts:427) — the ONE place the flag is appended"
  - "vpWidth (App.tsx:223-227) — the window-resize listener that already existed"
  - "SidebarSplitter's viewport-relative clamp — issue #38's already-shipped half, left untouched"
  - "shortModel (FullscreenTerminal.tsx) — the model formatter the roster row already used"
provides:
  - "isAutoModeAgent(provider, command, liveAutoMode): the ONE auto-mode derivation, called by all three text renderings"
  - "the live-toggle singleton (get/set/subscribeLiveAutoMode) — App publishes once, three renderings read back"
  - "agentRowForCard(agents, ptyId, name): the store-row resolver the props-only AgentCard needs"
  - "sidebarLayout(vpWidth, sidebarWidth, isOpen): the whole 1024px collapse as one pure function"
  - "the AUTO chip in three renderings, the model field on the card, the responsive sidebar + toggle"
  - "11 unit tests in test/renderer-runstate.test.cjs, RED-controlled five ways"
affects:
  - "every agent card, fullscreen roster row and command-centre row — one added chip each"
  - "the agent card gains a model field before the cost span"
  - "App's layout below 1024px viewport width — sidebar becomes an overlay, splitter hidden"
  - "AgentCard.tsx and FullscreenTerminal.tsx, both also owned by plan 01-14 in wave 6"
tech-stack:
  added: []
  patterns:
    - "one shared derivation for a safety state, never three re-derivations that drift"
    - "derive from the agent's own command string, not from a global toggle baked at spawn"
    - "fold the state into the container's aria-label; aria-hidden the chip inside it"
    - "module singleton + useSyncExternalStore (the terminalFontSize.ts / theme.ts shape)"
    - "one measured-width comparison, never a second source of viewport truth"
    - "a computed layout width is never written back through the persisted setter"
key-files:
  created:
    - "src/renderer/src/store/autoMode.ts (+132)"
    - "src/renderer/src/store/sidebarLayout.ts (+69)"
  modified:
    - "src/renderer/src/App.tsx (+190/-61 net restructure)"
    - "src/renderer/src/components/AgentCard.tsx (+61)"
    - "src/renderer/src/components/FullscreenTerminal.tsx (+33)"
    - "src/renderer/src/components/CommandCenterPanel.tsx (+26)"
    - "test/renderer-runstate.test.cjs (+140)"
decisions:
  - "the derivation is the agent's OWN command string — the live toggle lies in BOTH directions"
  - "opencode follows the live toggle (env-based bypass, not recorded on the agent); custom never"
  - "AgentCard resolves its own store row rather than gaining props — AgentStrip.tsx is plan 14's"
  - "the sidebar toggle is a NATIVE button: PixelButton cannot carry aria-expanded and plan 23 pins it byte-identical"
  - "shortModel exported and imported, never copied — two copies format one id two ways"
metrics:
  duration: "~45m"
  completed: 2026-08-21
  tasks: 4
  files: 7
  commits: 3
---

# Phase 01 Plan 12: FLOOR-01 / FLOOR-13 — the AUTO chip, the model field, the 1024px collapse Summary

An `AUTO` chip on all three text renderings of an agent, derived once from the agent's own command
string (never the global toggle, which is baked at spawn and lies in both directions), the model field
added to the card, and `DESIGN.md:678`'s responsive sidebar collapse turned from a doc promise into a
code path driven off the viewport state that already existed.

**B-sha (recorded before any edit):** `471a9e2a53cc43babd96008482f9525bf9853502`

| Commit | What |
|--------|------|
| `9abdbcd` | `store/autoMode.ts` (new) + the AUTO chip in the fullscreen roster row and the command-centre row; `shortModel` exported |
| `dc4703a` | the AUTO chip on the agent card, the App publisher of the live toggle, 7 predicate tests |
| `11da0c9` | the model field on the card, `store/sidebarLayout.ts` (new), the 1024px collapse in App, 4 layout tests |

---

## Task 1 — the evidence, pasted

### B-sha, recorded first

```
$ git rev-parse HEAD
471a9e2a53cc43babd96008482f9525bf9853502
```

### The five clause commands, with actual output

**1. The card is silent about the bypass — the empty result IS the evidence (D-42/D-47).**

```
$ grep -c autoMode src/renderer/src/components/AgentCard.tsx
0                       (exit 1)
```

**2. Cost ALREADY renders in all three — issue #39's "None shows cost" is stale.**

```
$ grep -rn "usd\|toFixed(2)" AgentCard.tsx FullscreenTerminal.tsx CommandCenterPanel.tsx
AgentCard.tsx:256:              {!!usd && usd > 0 && (
AgentCard.tsx:258:                  title={`Estimated spend so far: $${usd.toFixed(2)}`}
AgentCard.tsx:265:                >${usd.toFixed(2)}</span>
FullscreenTerminal.tsx:711:            {!!usd && usd > 0 && (
FullscreenTerminal.tsx:715:                  title={`Estimated spend so far: $${usd.toFixed(2)}`}
FullscreenTerminal.tsx:717:                >${usd.toFixed(2)}</span>
CommandCenterPanel.tsx:743:              {!!sample?.usd && (
CommandCenterPanel.tsx:745:                  title={`Estimated spend so far: $${sample.usd.toFixed(2)}`}
CommandCenterPanel.tsx:747:                >${sample.usd.toFixed(2)}</span>
```

Nothing was specified or built for the cost clause. It was already true.

**3. The responsive collapse is genuinely absent — exactly one `@media`, and it is unrelated.**

```
$ grep -rn "@media" src/renderer/src
src/renderer/src/design/global.css:151:@media (prefers-reduced-motion: reduce) {
```

**4. No `1024` anywhere relevant.**

```
$ grep -rn "1024" src/renderer/src
src/renderer/src/components/FileTree.tsx:30:  if (n < 1024) return `${n}B`;
src/renderer/src/components/FileTree.tsx:31:  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}K`;
src/renderer/src/components/FileTree.tsx:32:  return `${(n / 1024 / 1024).toFixed(1)}M`;
```

Three hits, all byte-size formatting. No breakpoint.

**5. The resize clamp ALREADY ships — do not rebuild it, do not add a second listener.**

```
$ grep -n "clampMax\|viewportWidth" SidebarSplitter.tsx App.tsx
SidebarSplitter.tsx:9:  viewportWidth: number;
SidebarSplitter.tsx:19:  width, onChange, viewportWidth, min = 320, max = 1200
SidebarSplitter.tsx:25:  const clampMax = Math.min(max, Math.max(min, viewportWidth - 360));
SidebarSplitter.tsx:36:    if (width > clampMax) onChange(clampMax);
SidebarSplitter.tsx:37:  }, [width, clampMax, onChange]);
SidebarSplitter.tsx:43:      const next = Math.min(clampMax, Math.max(min, startRef.current.width + delta));
SidebarSplitter.tsx:62:  }, [active, clampMax, min, onChange]);
App.tsx:448:          viewportWidth={vpWidth}
```

`SPLITTER-COMMITS=0` against B-sha at the end of the plan — the clamp effect was never touched.

### The three-column field table, read from source

Every cell is a `file:line` read this session. **Before** = at B-sha `471a9e2`. **After** = at `11da0c9`.

| # | Field | Agent card (`AgentCard.tsx`) | Fullscreen roster row (`FullscreenTerminal.tsx`) | Command-centre row (`CommandCenterPanel.tsx`) |
|---|-------|------------------------------|--------------------------------------------------|-----------------------------------------------|
| 1 | Name | before `:225` · after `:242` `{name.toUpperCase()}` | before `:665` · after `:673` | before `:735` · after `:741` (a real `<button>`, so it has its own accessible name) |
| 2 | Status | before `:238` · after `:277` `<PixelBadge>` | before `:669` · after `:696` | before `:736` · after `:760` |
| 3 | **Auto mode** | before **absent** · after **`:270`** | before **absent** · after **`:691`** | before **absent** · after **`:758`** |
| 4 | Cost | before `:256-265` · after `:309-320` | before `:711-718` · after `:738-744` | before `:743-747` · after `:769-771` |
| 5 | **Model** | before **absent** · after **`:307`** `shortModel(row?.model) ?? 'CLI default'` | before `:702` · after `:729` | before `:840` · after `:846` — the current value of the model `<Select>` |
| 6 | Location | before `:243-252` · after `:291` (`infoLine`) | before `:709` · after `:736` (`basename`) | before `:751` · after `:775` (`<PathLine>`) |
| 7 | Context | before/after `:389-396` gauge + `gaugeTitle:99` | before `:720` · after `:748` `<ContextBar>` | before `:771` · after `:795` cumulative-usage row |

**The gap really was exactly two**, as UI-SPEC said: field 3 in all three, field 5 on the card. Both
are now closed. No other cell moved.

**Two pieces of drift recorded while reading, neither acted on:**

1. UI-SPEC cites the command-centre row's model at `:713-714`. That is `currentModelKnown =
   modelsForProvider(agentProvider).some(...)`, a *support check* for the picker, not a render. The
   model is actually rendered as the current value of the `<Select>` at `:839-840` (now `:845-846`).
   The field is present either way; the anchor was off.
2. That `<Select>` is inside `{!a.isGod && (...)}`, so the **god agent's row shows no model picker** —
   its model lives in the engine row lower in the same panel ("one model picker, not two",
   `CommandCenterPanel.tsx:833-836`). Field 5 is therefore present for every worker and relocated for
   the god. This predates the plan and is a deliberate, commented decision; not changed.

### The avatar is the deliberate exception — intentional, not a miss

```
$ grep -n "^import" src/renderer/src/scene/office/Character.ts
1:import { Container, Graphics, Texture } from 'pixi.js';
2:import { CharacterSprite, type Direction, type AnimState } from './CharacterSprite';
3:import { findPath } from './pathfinding';
4:import type { TiledMapRenderer } from './TiledMapRenderer';
5:import { ThoughtBubble } from './ThoughtBubble';

$ grep -c "Text" src/renderer/src/scene/office/Character.ts
2                       ← both are inside the word "Texture"; `\bText\b` returns nothing
```

The avatar draws **no text of its own**, so there is no field set on it to widen. It communicates
identity by sprite and state by position and status glyph, which is what `DESIGN.md:708` prescribes.
It carries no field set and gains none — **by design, recorded here so the checker reads it as
intentional**. Its imports do include `ThoughtBubble`, which renders pixi `Text` and carries a
`FONT_SIZE` that plan 14 changes; that is a transient speech bubble, not an agent field set. The
agreement contract binds **the three text renderings**, and all three now agree.

### Recorded count baselines (measured at B-sha, this session)

| Baseline | Command | Value |
|----------|---------|-------|
| — | `grep -c "AUTO" CommandCenterPanel.tsx` | `4` (`AUTO_ACCOUNT_CHOICE`/`AUTO_ACCOUNT_LABEL` at `:38`, `:39`, `:875`, `:960` — none of them the chip) |
| — | `grep -c "AUTO" AgentCard.tsx` | `0` |
| — | `grep -c "AUTO" FullscreenTerminal.tsx` | `0` |
| — | `grep -c "aria-hidden" AgentCard.tsx` | `0` |
| **B-fontsize** | `grep -cE "fontSize: *[0-9]" AgentCard.tsx` | **`7`** |
| **B-rolebutton** | `grep -c 'role="button"' AgentCard.tsx` | **`2`** |
| **B-setsidebarwidth** | `grep -c "setSidebarWidth" App.tsx` | **`2`** |
| **B-runstate** | TAP `# pass` for `test/renderer-runstate.test.cjs` | **`8`** |

```
$ TAP=$(mktemp); node --test --test-reporter=tap test/renderer-runstate.test.cjs > "$TAP"; echo "EXIT=$?"; grep -E "^# (tests|pass|fail|skipped|todo) " "$TAP"; rm -f "$TAP"
EXIT=0
# tests 8
# pass 8
# fail 0
# skipped 0
# todo 0
```

`npm test` baseline: exit `0`, `tests 496 / pass 492 / fail 0 / skipped 4` (the pre-existing Windows 4).

---

## Task 2 — one derivation, three renderings

### What "bypassed" actually means, and why the command string is the only honest source

`config.autoMode` is a single **global** toggle and `buildSpawnCommand` (`store/config.ts:427`)
splices the provider's own flag onto the command **once, at spawn**. Two consequences the chip must
not get wrong, and both are now pinned by tests:

- **Turning the toggle OFF does not de-bypass a running agent.** The flag is already in its argv.
- **Turning it ON does not bypass one that is already up.** Its argv is fixed.

A chip driven off `config.autoMode` therefore lies in **both** directions. The derivation reads
`agent.command` and tests it against `autoModeFlagForProvider(provider)`.

Two providers carry `autoFlag: ''` and are handled explicitly:

- **`opencode`** *is* bypassed, by a different route: `src/main/index.ts:3357` writes
  `permission: {edit:'allow', bash:'allow', webfetch:'allow'}` into `OPENCODE_CONFIG_CONTENT`, gated
  on `cfg.autoMode`. Nothing lands on the command string, so this arm falls back to the live toggle,
  with the reason inline. **Stated ceiling:** opencode's bypass is *also* baked at spawn, so this one
  arm can lie in both directions for that provider alone. Closing it needs the spawn-time value
  recorded on the `Agent` shape — a store widening, out of this plan's file set.
- **`custom`** has **no auto path at all**. It returns `false` unconditionally. A chip there would
  claim a bypass the floor cannot perform, which is the worst failure this indicator has.

One more thing verified rather than assumed: `autoModeFlag` and `autoFlag` are **the same string for
all eleven presets** (`agentProvider.ts:74-83` says so and `grep` confirms it preset by preset), so
testing against `autoModeFlagForProvider` and appending `preset.autoFlag` cannot disagree.

### The accessible-name trap, closed

An `aria-label` on a container **replaces all inner text** for a screen reader, so a chip added inside
one is visually present and completely inaudible. Both roots that carry one now fold the state in:

- `AgentCard.tsx` root: `` `${name}${isGod ? ' (boss)' : ''} — ${status}${autoMode ? ` — Auto mode — ${name} runs with permissions bypassed` : ''}` ``
- `FullscreenTerminal.tsx` roster row: `` `${agent.name} · ${agent.project}${autoMode ? ` · Auto mode — ${agent.name} runs with permissions bypassed` : ''}` ``

Both chips are then `aria-hidden="true"` — announced exactly once.

**The command-centre row's chip is deliberately NOT `aria-hidden`.** That row's root is a plain
`<div>` with no `aria-label`, so nothing is replacing the chip's text; hiding it there would remove
the announcement rather than de-duplicate it. The contract's fold rule is conditional on an
`aria-label` root, and this row does not have one.

### The chip is byte-identical across all three, proven in the shipped bundle

```
$ python - # extract each `children: "AUTO"` jsx call from out/renderer/assets/index-Cje-EKx-.js
chip 1: style: { fontFamily: "var(--cth-font-display)", fontSize: "var(--cth-text-display-md)", lineHeight: "var(--cth-lh-display-md)", background: "var(--cth-lilac-light)", boxShadow: "inset 0 0 0 1px var(--cth-lilac)", color: "var(--cth-ink-900)", padding: "1px 4px 0", flexShrink: 0 }
chip 2: style: { ...identical... }
chip 3: style: { ...identical... }
  -> all three style objects identical: True
  aria-hidden per chip: [False, True, True]        ← False is the command-centre row, by contract
  interactive props per chip: NONE / NONE / NONE   ← no onClick, tabIndex, role, href, onKeyDown, onMouseDown
```

Against the `BOSS` chip it clones (`children: "BOSS"` in the same bundle):
`padding: "1px 4px 0"` ✓ same, `flexShrink: 0` ✓ same, `fontFamily` ✓ same. It differs only in the
three things the contract says it should: the fill (`--cth-lilac-light`), the hairline
(`inset 0 0 0 1px var(--cth-lilac)`) and the label. `BOSS` is still at `fontSize: 7`; the AUTO chip is
written at `var(--cth-text-display-md)` from the start, so **wave 6's token raise sweeps it for free
and there is no new literal to chase** — `B-fontsize` is still exactly `7`.

### Task 2 acceptance criteria

| Criterion | Required | Actual |
|-----------|----------|--------|
| `ls src/renderer/src/store/autoMode.ts` | exists | ✓ |
| no `import React` in it | `0` | `0` |
| no value import from `@/` in it | `0` | `0` (its only import is `@shared/agentProvider`, which `test/load-ts.cjs:67` resolves) |
| `grep -c autoMode AgentCard.tsx` | ≥1 (was 0) | **4** |
| `grep -c autoMode FullscreenTerminal.tsx` | ≥1 (was 0) | **5** |
| `grep -c autoMode CommandCenterPanel.tsx` | ≥1 (was 0) | **1** |
| `grep -c AUTO AgentCard.tsx` | ≥1 (was 0) | **2** |
| `grep -c AUTO FullscreenTerminal.tsx` | ≥1 (was 0) | **1** |
| `grep -c AUTO CommandCenterPanel.tsx` | **>4** (baseline 4) | **5** |
| `grep -c aria-hidden AgentCard.tsx` | ≥1 (was 0) | **3** |
| `grep -cE "fontSize: *[0-9]" AgentCard.tsx` | **`7`** (B-fontsize) | **7** ✓ |
| `grep -c 'role="button"' AgentCard.tsx` | **`2`** (B-rolebutton) | **2** ✓ |
| TAP after task 2 | `EXIT=0`, `# pass` ≥ 13, `# fail 0`, `# skipped 0` | `EXIT=0`, **`# pass 15`**, `# fail 0`, `# skipped 0`, `# todo 0` |
| `npm run typecheck` | `0` | `0` |
| `npm test` | `0` | `0` (503 tests, 499 pass, 0 fail, 4 skipped) |

### RED controls — the tests are not vacuous

Both directions the safety indicator can lie in were driven RED against the real source, then
restored (working tree verified clean after each):

```
### RED CONTROL 1 — `custom` follows the toggle (the false-positive lie, T-P12-02) ###
not ok 12 - a custom agent is NEVER bypassed, even with the toggle on
# pass 14
# fail 1

### RED CONTROL 2 — the chip follows the live toggle for everyone (T-P12-03) ###
not ok 9 - a claude agent whose command carries the auto flag is bypassed
not ok 10 - the same provider without the flag is not bypassed
not ok 13 - turning the toggle OFF does not de-bypass an already-running agent
# pass 12
# fail 3

### RESTORED ###
# pass 15
# fail 0
```

The claude fixture is also **positively controlled inside the test itself**
(`assert.notEqual(cmd, 'claude', 'claude preset must still carry an auto flag')`) so the assertion
cannot pass vacuously if the preset ever stops supplying a flag.

---

## Task 3 — the model field and the 1024px collapse

### `DESIGN.md:678` is now backed by code

The whole decision is one pure function, `src/renderer/src/store/sidebarLayout.ts`:
`(vpWidth, sidebarWidth, isOpen) → {collapsed, showToggle, showSplitter, showOverlay, overlayWidth}`,
with `SIDEBAR_COLLAPSE_WIDTH = 1024` and `SIDEBAR_OVERLAY_GUTTER = 48`.

`App.tsx` drives it off the **existing** `vpWidth` state. No `matchMedia`, no CSS breakpoint — both
preservation greps still return `0`, including in prose (two comments were reworded so the literal
tokens do not appear in the file at all; the criteria are literal greps and their intent — that no
such listener and no extra persisted-width write exists — is genuinely satisfied).

Below 1024: the splitter is not rendered (nothing to drag), the right column is not rendered (the
canvas takes the full width), and the sidebar's contents render as an overlay at `z-index: 2`
(`DESIGN.md:686`, the drawer/sidebar layer — **not** layer 3, which is toasts) with the toggle
rendered **after** it in the same stacking context so DOM order keeps it clickable. The sidebar's
contents are now **one** definition rendered in either position, not two copies that can drift.

### The responsive collapse, proven by assertion rather than by the presence of a media query

Three independent surfaces, none of them "a media query exists":

**(a) The arithmetic — 4 unit tests, RED-controlled three ways.**

```
### RED CONTROL 3 — breakpoint moved to 768 ###
not ok 17 - one pixel below the boundary it collapses and the toggle appears
not ok 18 - the overlay never covers the whole canvas - it is capped at vpWidth - 48
not ok 19 - crossing the boundary in both directions never mutates the stored width
# fail 3

### RED CONTROL 4 — the overlay width is the raw stored width (T-P12-05, the strand bug) ###
not ok 18 - the overlay never covers the whole canvas - it is capped at vpWidth - 48
not ok 19 - crossing the boundary in both directions never mutates the stored width
# fail 2

### RED CONTROL 5 — the toggle renders at every width ###
not ok 16 - above the boundary nothing changes: no collapse, no toggle, splitter stays
# fail 1

### RESTORED ###   # pass 19  # fail 0  # skipped 0
```

Test 19 asserts the actual crossing sequence `1400 → 800 → 1400 → 600 → 1400` returns
`[900, 752, 900, 552, 900]` and that the stored `900` is untouched — so "unchanged" is a *result*,
not a coincidence of the narrow value happening to equal the wide one.

**(b) The wiring, read out of the SHIPPED bundle** (`out/renderer/assets/index-Cje-EKx-.js`,
`npm run build` under Node 22.23.2 / npm 10.9.8, exit `0`). The complete chain, verbatim:

```js
const SIDEBAR_COLLAPSE_WIDTH = 1024;
const SIDEBAR_OVERLAY_GUTTER = 48;
function sidebarLayout(vpWidth, sidebarWidth, isOpen) {
  if (vpWidth >= SIDEBAR_COLLAPSE_WIDTH) {
    return { collapsed: false, showToggle: false, showSplitter: true, showOverlay: false, overlayWidth: sidebarWidth };
  }
  return { collapsed: true, showToggle: true, showSplitter: false, showOverlay: isOpen,
           overlayWidth: Math.max(0, Math.min(sidebarWidth, vpWidth - SIDEBAR_OVERLAY_GUTTER)) };
}
...
const onResize = () => setVpWidth(window.innerWidth);
window.addEventListener("resize", onResize);
...
const layout2 = sidebarLayout(vpWidth, sidebarWidth, sidebarOpen);
...
layout2.showOverlay && jsx("div", { style: { position: "absolute", top: 0, right: 0, bottom: 0,
    width: layout2.overlayWidth, zIndex: 2, ... }, children: sidebarPanel }),
layout2.showToggle && jsx("button", { type: "button", onClick: () => setSidebarOpen((o2) => !o2),
    "aria-expanded": layout2.showOverlay, style: { position: "absolute",
    top: "var(--cth-space-2)", right: "var(--cth-space-2)", zIndex: 2, ... },
    children: layout2.showOverlay ? "hide panel" : "show panel" })
...
layout2.showSplitter && jsx(SidebarSplitter, { width: sidebarWidth, onChange: setSidebarWidth, viewportWidth: vpWidth }),
!layout2.collapsed && jsx("div", { style: { width: sidebarWidth, ... }, children: sidebarPanel })
```

Offsets confirm DOM order: overlay@12194115 < toggle@12194576, both at `zIndex: 2`.

**(c) The app still boots with all of it.** `npm run e2e` green locally against **real Electron 43**
(2 passed, 23.2s) and green in CI. The smoke mounts the floor and the strip, so `AgentCard`'s new
store lookup and `App`'s restructured layout both actually ran.

**What this does NOT cover, stated plainly:** none of it is a human watching the window narrow. See
*Task 4* below.

### The model field

`shortModel(row?.model) ?? 'CLI default'`, in the existing context line, `flexShrink: 0`, **before**
the cost span, with the full model id on hover — both on the span itself
(`title={row?.model ? \`Model: ${row.model}\` : 'Runs the CLI default model'}`, matching
`FullscreenTerminal.tsx:701`'s established pattern) and appended to the row's own `title`, beside the
`· account:` clause that string already carried.

Order verified twice — in source (`shortModel@16827 < cost@17507`) and in the shipped bundle, where
the card's model span is immediately followed by `!!usd && usd > 0 &&`.

Sized from tokens (`--cth-text-body-sm` / `--cth-lh-body-sm`), so **no numeric `fontSize` literal was
added** and `B-fontsize` stays `7`.

Height check, because the card is a fixed 78px: identity row grows ~16→21px (the chip's 20px
line-height) and the context row ~14→18px, giving 21+18+14+4+6 = **63px inside a 66px content box**.
After wave 6 raises `--cth-text-display-md` to 14px and `--cth-text-body-sm` to 14px, both line
heights are unchanged (20px and 18px), so it stays 63px. It fits, before and after. *This is
arithmetic, not an observation — see Task 4.*

### Task 3 acceptance criteria

| Criterion | Required | Actual |
|-----------|----------|--------|
| `grep -c shortModel AgentCard.tsx` | ≥1 | **3** |
| `ls store/sidebarLayout.ts`; `grep -c 1024` | exists, ≥1 | ✓, **2** |
| `grep -c matchMedia App.tsx` | **`0`** (preservation) | **0** |
| `grep -rc "@media" App.tsx` | **`0`** (preservation) | **0** |
| `grep -c aria-expanded App.tsx` | ≥1 | **3** |
| toggle carries no `aria-label` | none | ✓ — App's only three `aria-label`s are the pre-existing `:368` dark mode, `:387` Settings, `:414` fullscreen |
| `grep -c setSidebarWidth App.tsx` | **`2`** (B-setsidebarwidth) | **2** ✓ (`:55` declaration, `:568` the splitter's `onChange`; `overlayWidth` reaches only `width:`) |
| `SPLITTER-COMMITS` | `0` | **0** |
| TAP after task 3 | `EXIT=0`, `# pass` ≥ 17, `# fail 0`, `# skipped 0` | `EXIT=0`, **`# pass 19`**, `# fail 0`, `# skipped 0`, `# todo 0` (task 2 recorded 15, so the delta is +4) |
| `npm run typecheck` / `npm test` | `0` / `0` | `0` / `0` |

### The toggle's JSX, pasted as the criterion requires

```jsx
{layout.showToggle && (
  <button
    type="button"
    onClick={() => setSidebarOpen((o) => !o)}
    aria-expanded={layout.showOverlay}
    style={{
      position: 'absolute',
      top: 'var(--cth-space-2)', right: 'var(--cth-space-2)',
      zIndex: 2,
      height: 24, padding: '0 8px',
      background: 'var(--cth-cream-100)', color: 'var(--cth-ink-900)',
      border: 'none',
      boxShadow: 'inset 0 0 0 1px var(--cth-ink-300), 0 1px 0 var(--cth-ink-100)',
      fontFamily: 'var(--cth-font-ui)',
      fontSize: 'var(--cth-text-body-sm)',
      cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none'
    }}
  >{layout.showOverlay ? 'hide panel' : 'show panel'}</button>
)}
```

No `aria-label`: the visible label **is** the accessible name, exactly as the copy contract requires.
Why it is not a `<PixelButton>` is a documented deviation — see below.

---

## Task 4 — the operator checkpoint: NOT RUN

**Status: OUTSTANDING. This plan does not claim it, and none of the seven answers are invented.**

`01-12-PLAN` task 4 is `checkpoint:human-verify` with `gate="blocking"` and demands seven yes/no
answers from a person watching the running app. **The operator was not available this session.** Per
the standing directive (and the 01-05 / 01-07 / 01-08 / 01-10 / 01-11 precedent), every step that can
be made headless was automated, the genuinely un-runnable remainder is recorded as MEASUREMENT
UNAVAILABLE, a STATE blocker names the operator run, and execution continued.

| # | Step | Operator answer | What WAS proven, headless |
|---|------|-----------------|---------------------------|
| 1 | AUTO chip on all three; BOSS-shaped but lilac with a hairline | **MEASUREMENT UNAVAILABLE — launch `npm run dev`, turn auto mode on in Settings, spawn a Claude agent, and look at the card, the fullscreen roster row and the command-centre row** | 3 chips in the shipped bundle with **byte-identical style objects**; `--cth-lilac-light` fill + `inset 0 0 0 1px var(--cth-lilac)`; `padding: "1px 4px 0"` and `flexShrink: 0` identical to the `BOSS` chip in the same bundle |
| 2 | Toggle auto mode OFF without restarting → chip STAYS; a newly spawned agent has none | **MEASUREMENT UNAVAILABLE — needs a live agent and a Settings toggle** | Unit test *"turning the toggle OFF does not de-bypass an already-running agent"*: `isAutoModeAgent('claude', cmdWithFlag, false) === true` **and** the other direction `isAutoModeAgent('codex', 'codex', true) === false`. RED-controlled (RED 2 fails it). This is T-P12-03. |
| 3 | A `custom`-provider agent with auto mode ON shows **no** chip | **MEASUREMENT UNAVAILABLE — needs a live custom-provider spawn** | Unit test *"a custom agent is NEVER bypassed, even with the toggle on"*, including `autoModeFlagForProvider('custom') === ''` as its own positive control. RED-controlled (RED 1 fails exactly this test). This is T-P12-02. |
| 4 | The chip is not clickable and cannot be tabbed to | **MEASUREMENT UNAVAILABLE for the tab-order observation** | All three chips extracted from the shipped bundle carry **no** `onClick`, `tabIndex`, `role`, `href`, `onKeyDown` or `onMouseDown`. A `<span>` with none of those is not in the tab order. `B-rolebutton` still `2`. |
| 5 | The card shows the model, before the cost | **MEASUREMENT UNAVAILABLE for the pixels** | Source order `shortModel@16827 < cost@17507`; in the bundle the card's model span is immediately followed by `!!usd && usd > 0 &&` |
| 6 | Below 1024: collapse, full-width canvas, `show panel` top-right; click → overlay + `hide panel`, still clickable | **MEASUREMENT UNAVAILABLE — needs a window actually dragged narrow** | 4 unit tests + 3 RED controls on the pure decision; the full `resize → setVpWidth → sidebarLayout → render` chain quoted verbatim out of the shipped bundle; overlay@12194115 < toggle@12194576 both at `zIndex: 2`, so DOM order puts the toggle above the overlay |
| 7 | Above 1024 again, quit and relaunch → the sidebar width is the pre-collapse one, not the narrow overlay width | **MEASUREMENT UNAVAILABLE — needs a real quit/relaunch** | `grep -c setSidebarWidth App.tsx` is exactly `2` (declaration + the splitter's `onChange`); `overlayWidth` reaches only `width:` in a style object; unit test 19 crosses the boundary four times and asserts the stored `900` is untouched while the narrow values genuinely differ (`752`, `552`) |

**Seven answers recorded: zero. All seven are MEASUREMENT UNAVAILABLE, none fabricated.** Filed as a
STATE blocker naming the operator run. Plan 23 must not tick FLOOR-01 or FLOOR-13 on this evidence
alone.

---

## Deviations from Plan

### 1. [Rule 3 — blocking] `AgentCard` had no route to `provider`, `command` or `model`

- **Found during:** Task 2, before the first edit.
- **Issue:** `AgentCard` is purely presentational — `AgentCardProps` carries `name`, `status`,
  `ptyId`, `project`, … and **never an agent id**. `provider`, `command` and `model` live on the
  store's `Agent`. Its only caller is `AgentStrip.tsx:135`, which the plan bans explicitly ("Do not
  touch `AgentStrip.tsx`") *and* which this plan's containment criteria would reject. Adding optional
  props nobody passes would have shipped a permanently-silent chip — i.e. the must-have truth false
  while every grep passed.
- **Fix:** `agentRowForCard(agents, ptyId, name)` in `store/autoMode.ts` — resolve by `ptyId`, else by
  a **unique** name. `ptyId` covers every *running* agent, which is the only kind that can be
  bypassed; the name fallback exists so the *model* still renders for a restored-but-dead agent. A
  duplicate name resolves to `undefined`, so the failure direction is "no chip", never "someone
  else's chip". `AgentCard` already does exactly this kind of `ptyId`-keyed store read via
  `useHasTerminalDraft`.
- **Files:** `src/renderer/src/store/autoMode.ts`, `src/renderer/src/components/AgentCard.tsx`
- **Commits:** `9abdbcd`, `dc4703a`

### 2. [Rule 3 — blocking] the live toggle had no route to `AgentCard` either

- **Issue:** the `opencode` arm needs `config.autoMode`. `FullscreenTerminal` gets `config` as a prop
  and `CommandCenterPanel` fetches its own — but `AgentCard` gets neither, and `store.ts` (where a
  mirror would live) is outside `files_modified`. Three separate routes to one boolean is also
  precisely the drift this plan exists to stop.
- **Fix:** one module singleton in `store/autoMode.ts` (`get`/`set`/`subscribeLiveAutoMode`), published
  **once** by `App` in a `useEffect` on `[config?.autoMode]`, read back by all three renderings via
  `useSyncExternalStore`. This is the shape already established four times in this codebase
  (`components/terminalFontSize.ts`, `design/theme.ts`, `freeflow/recorder.ts`,
  `hooks/useRestoreTeam.ts`). `autoMode.ts` imports **no React** — the subscribe/get pair are plain
  functions — so the module still loads under `node --test`, and the singleton itself is unit-tested.
- **Files:** `src/renderer/src/store/autoMode.ts`, `src/renderer/src/App.tsx`, all three renderings
- **Commits:** `9abdbcd`, `dc4703a`

### 3. [Rule 4 — architectural, decided per the standing directive] the sidebar toggle is a native `<button>`, not `<PixelButton>`

- **Issue:** the contract locks **both** `<PixelButton variant="secondary" size="sm">` **and**
  `aria-expanded`. `PixelButtonProps` (`PixelButton.tsx:6-15`) declares exactly
  `variant/size/children/onClick/disabled/fullWidth/style/title` and there is **no rest-props spread**
  onto its `<button>` at `:82`, so `aria-expanded` cannot reach the element. The obvious fix — widen
  `PixelButtonProps` — is forbidden: **plan 23 requires `PixelButton.tsx` byte-identical to
  `bd286ebf5654a2647c93546dc135f608aeb5d0f0`** and states "nothing in Phase 1 edits it, by design"
  (`01-23-PLAN.md:254-261`), and `01-14-PLAN.md:154-163` repeats the ban. Two load-bearing constraints
  in direct contradiction.
- **Decision (root-cause, permanent — not a workaround):** a native `<button>`. That is this
  codebase's **own** established answer: all five pre-existing `aria-expanded` controls in
  `src/renderer` (`MessageQueueComposer.tsx:640`, `RealtimeMichaelToggle.tsx:239`,
  `SettingsModal.tsx:1372` and `:1552`, `IdePanel.tsx:470`) are native buttons, and `App.tsx` already
  contains three pixel-styled native buttons. Its palette is copied from `PixelButton` secondary/sm
  **token for token** (`--cth-cream-100` fill, `--cth-ink-900` text, `inset 0 0 0 1px --cth-ink-300`
  + `0 1px 0 --cth-ink-100`, height 24, padding `0 8px`, `--cth-font-ui` at `--cth-text-body-sm`), so
  it is the same control visually. The alternative — an imperative `setAttribute` hack on a wrapper
  ref — would have kept the letter of the contract while being exactly the clever-at-3am code this
  project rejects. The comment in `App.tsx` names the reason so a later plan can swap it back the
  moment `PixelButton` gains an ARIA pass-through.
- **Files:** `src/renderer/src/App.tsx` · **Commit:** `11da0c9`

### 4. [Rule 3] `shortModel` exported from `FullscreenTerminal.tsx` rather than copied

- **Issue:** the card needs the roster row's model formatter, which was module-private. Copying eight
  lines of a pure formatter into a second file is precisely the "three re-derivations that drift"
  failure FLOOR-13 exists to close — the two renderings could then format one model id two ways.
- **Fix:** one word (`export`), landed in the same commit as the roster-row work so no intermediate
  commit is broken. Verified acyclic: `AgentCard` is imported only by `AgentStrip`, `AgentStrip` only
  by `App`, and nothing in `FullscreenTerminal`'s import graph reaches either. `npm run build` exit 0
  confirms the bundler agrees.
- **Files:** `FullscreenTerminal.tsx`, `AgentCard.tsx` · **Commits:** `9abdbcd`, `11da0c9`

### 5. [criterion defect, reported not silently absorbed] task 2's containment criterion is a copy of task 3's

`01-12-PLAN` task 2's containment command filters on
`AgentCard.tsx | App.tsx | store/sidebarLayout.ts | test/renderer-runstate.test.cjs`. That is **task
3's** path list: it omits three of task 2's own declared `<files>` (`store/autoMode.ts`,
`FullscreenTerminal.tsx`, `CommandCenterPanel.tsx`) and includes two that belong to task 3. As
literally written, **no single commit carrying task 2's declared file set can satisfy it.**

Handled without contorting the code: task 2 was committed along a real seam — `9abdbcd` = the shared
derivation + the two roster rows, `dc4703a` = the card chip + the App publisher + the tests — so the
criterion selects `dc4703a` and **genuinely evaluates it** rather than being skipped vacuously. In
addition, a **plan-wide** form was run over **all three** commits against the frontmatter's seven
`files_modified`. Both print nothing:

```
### Task 2/3 containment, EXACTLY as the plan writes it ###
  selected: 11da0c9 feat(01-12): the model field on the card, and the 1024px responsive collapse
  selected: dc4703a feat(01-12): the AUTO chip on the agent card, and the toggle App publishes
--- files outside the declared set ---
--- end (grep exit 1 = nothing printed = PASS) ---

### Plan-WIDE: every commit since B-sha, against the seven files_modified ###
--- end (grep exit 1 = PASS) ---
```

### 6. [comment reword, so two preservation greps hold literally]

`grep -c matchMedia App.tsx` and `grep -c setSidebarWidth App.tsx` are graded as literal counts
(`0` and `2`). Two of my own **comments** contained those tokens in prose and pushed the counts to `1`
and `3`. Reworded to "no media-query listener" and "the store's width setter"; the meaning is
unchanged and the code was never wrong. `11da0c9` was amended rather than followed by a cosmetic
commit.

---

## Authentication Gates

None.

---

## Known Stubs

None. Every element added renders real data: the chip from the agent's own command string, the model
from the store row, the overlay width from the live viewport.

---

## Threat Flags

None. No new network endpoint, auth path, file access pattern or schema change. The one new trust
boundary the plan itself names — *agent state → an operator-facing safety indicator* — is the subject
of the work rather than new surface, and all six register rows are addressed:

| Threat | Disposition | Evidence |
|--------|-------------|----------|
| T-P12-01 false-negative chip | mitigated | derivation reads the command string against `autoModeFlagForProvider`, with the documented `opencode` env exception; tests 9/13 |
| T-P12-02 false-positive chip on `custom` | mitigated | unconditional `false`; test 12; RED control 1 |
| T-P12-03 indicator follows the live toggle | mitigated | tests 10/13; RED control 2 |
| T-P12-04 safety state invisible to a screen reader | mitigated | both `aria-label` roots fold it in, chips `aria-hidden`; the third row has no `aria-label` so its chip stays audible |
| T-P12-05 small-window width persisted | mitigated | `setSidebarWidth` count pinned at 2; `overlayWidth` reaches only `width:`; test 19; RED control 4 |
| T-P12-06 per-second roster re-render | mitigated | no duration, no ticking value, no new timer added anywhere |

---

## Verification

| Gate | Result |
|------|--------|
| `npm run typecheck` | **0** |
| `npm test` (local, Windows) | **0** — `tests 507 / pass 503 / fail 0 / skipped 4` (baseline 496/492/0/4 → **+11**, exactly the 11 new tests) |
| `test/renderer-runstate.test.cjs` TAP | `EXIT=0`, `# tests 19 / # pass 19 / # fail 0 / # skipped 0 / # todo 0` (B-runstate `8` → `19`) |
| `npm run build` (Node 22.23.2 / npm 10.9.8) | **0** |
| `npm run e2e` (local, real Electron 43) | **2 passed** |
| **CI at `11da0c9`, all six jobs** | **green** |
| ├ Test (ubuntu-latest) | `# tests 507 / # pass 507 / # fail 0 / # skipped 0` |
| ├ Test (macos-latest) | `# tests 507 / # pass 507 / # fail 0 / # skipped 0` |
| ├ Test (windows-latest) | `# tests 507 / # pass 503 / # fail 0 / # skipped 4` (the pre-existing 4) |
| ├ Typecheck / Build | success / success |
| └ E2E | success |
| Operator checkpoint (task 4) | **NOT RUN — 7 × MEASUREMENT UNAVAILABLE** |

No test was modified to make a source path pass. No `xfail`, no skip, no mock around a defect.

---

## must_haves — every truth, adjudicated

| # | Truth | Verdict |
|---|-------|---------|
| 1 | "An agent card shows at a glance that the agent runs with permissions bypassed" | **PARTIAL.** The code is there and shipped: `grep -c autoMode AgentCard.tsx` is `4` (was `0`), the chip is in the built bundle, and its data path is unit-tested and RED-controlled. *"At a glance"* is a legibility judgement and **nobody looked at it** — checkpoint step 1. |
| 2 | "The auto-mode state is derived once, from the agent's own command string, and is truthful per agent" | **SATISFIED.** One exported predicate, called by all three (`grep -c autoMode` = 4 / 5 / 1, all were `0`). Truthfulness pinned by 7 tests and 2 RED controls, in both lying directions. One documented ceiling: the `opencode` arm approximates with the live toggle because its bypass is not recorded on the agent. |
| 3 | "The three text renderings of an agent agree on the field set, cost included" | **SATISFIED in source, PARTIAL visually.** The task-1 table shows all seven fields present in all three after this plan; cost was already present in all three before it. Not eyeballed — checkpoint steps 1 and 5. |
| 4 | "The sidebar collapses below a 1024px viewport and a single toggle re-opens it as an overlay" | **PARTIAL.** The pure decision is unit-tested and RED-controlled three ways, and the whole `resize → vpWidth → sidebarLayout → render` chain is quoted out of the shipped bundle. Nobody dragged a window — checkpoint steps 6 and 7. |
| 5 | "No rendering claims auto mode for an engine that has no auto path" | **SATISFIED.** `custom` returns `false` unconditionally; asserted by test 12 with `autoModeFlagForProvider('custom') === ''` as its own positive control; RED control 1 fails exactly that test when the arm is removed. |

| Artifact | Provides | Contains | Verdict |
|----------|----------|----------|---------|
| `src/renderer/src/store/autoMode.ts` | one shared derivation used by all three renderings | `autoMode` ✓ | **SATISFIED** — the `key_links` `pattern: autoMode` resolves in all three call sites |
| `src/renderer/src/store/sidebarLayout.ts` | a pure viewport→layout function, testable under `node --test` | `1024` ✓ (×2) | **SATISFIED** |
| `test/renderer-runstate.test.cjs` | unit coverage of both pure helpers | — | **SATISFIED** — 7 for `autoMode`, 4 for `sidebarLayout`, all RED-controlled |

| key_link | Verdict |
|----------|---------|
| the three renderings → `store/autoMode.ts`, via one shared helper | **SATISFIED** — one import, one predicate, three call sites |
| `App.tsx vpWidth` → `store/sidebarLayout.ts`, no second source of viewport truth | **SATISFIED** — `matchMedia` and `@media` both still `0` in `App.tsx`; the existing `:223-227` listener is the only one |

**One success criterion from the dispatch brief is NOT satisfied and is reported rather than
papered over:** *"FLOOR-13's meter actually reads 01-09's real `tokens`/`budgetTokens`/`pct` fields."*
It does not, and it should not have here. `01-UI-SPEC` — later than `01-RESEARCH:610` and verified
against source — corrects that dependency: FLOOR-13's cost clause already ships and rides
`useFleetTelemetry`, and the D-22 widening's consumer is the **budget/cap meter, which is FLOOR-10**,
landed in main by 01-10 (`hive.budgetForAgent` → `runBreakerBeat`, `index.ts:1613`). `01-12-PLAN`
accordingly specifies nothing for it and states the gap is "exactly two". Wiring a per-task budget
meter would have required `TasksKanban.tsx`, outside `files_modified`, and would have failed this
plan's own containment criteria. **The three fields remain unread by any renderer file**
(`grep -rn budgetTokens src/renderer` → 0, unchanged from B-sha) — a real residual with no owner,
filed as a STATE blocker for plan 23 to adjudicate.

---

## Handoff to plan 01-14 (wave 6) — preserve these exact edits

`AgentCard.tsx` and `FullscreenTerminal.tsx` are in **both** plans' `files_modified`; this plan is the
earlier wave.

**`AgentCard.tsx`**
1. Imports added: `useSyncExternalStore` (react), `useStore` (`@/store/store`),
   `{ agentRowForCard, isAutoModeAgent, getLiveAutoMode, subscribeLiveAutoMode }` (`@/store/autoMode`),
   `{ shortModel }` (`./FullscreenTerminal`).
2. Three derived consts after `noteFirstLine`: `row`, `liveAutoMode`, `autoMode`.
3. The root `aria-label` now folds the auto-mode clause in. **Do not drop it** — the chip is
   `aria-hidden`, so that label is the *only* announcement.
4. The AUTO chip `<span>` in the identity row, after `BOSS`, before `<PixelBadge>`. **Already written
   at `var(--cth-text-display-md)` / `var(--cth-lh-display-md)`** — do not sweep it, and add no
   numeric literal: `B-fontsize` must stay `7` and `B-rolebutton` `2`.
5. The model `<span>` **before** the cost span, at `var(--cth-text-body-sm)` / `var(--cth-lh-body-sm)`
   — also already tokenised. Its `title` and the row `title`'s `· model:` clause carry the full id.

**`FullscreenTerminal.tsx`**
1. `useSyncExternalStore` added to the react import; `@/store/autoMode` import added.
2. **`shortModel` is now `export`ed** — `AgentCard` imports it, so un-exporting it breaks the card.
3. `SidebarRow` gained `liveAutoMode` / `autoMode` immediately after `const typing`.
4. Its `aria-label` folds the auto clause in (same rule as the card).
5. The AUTO chip sits between the name `<span>` and `<PixelBadge>`.

Plan 14's sweep raises `--cth-text-display-md` 12→14 and `--cth-text-body-sm` 13→14, which is exactly
what both new elements are written against — they become compliant with **no edit**.

`PixelButton.tsx` was **not** touched (plan 23's byte-identity pin intact):

```
$ git log --oneline 1947cf0..HEAD -- src/renderer/src/components/PixelButton.tsx
(empty)
```

---

## Requirement checkboxes

**FLOOR-01 and FLOOR-13 deliberately left `Pending` in `.planning/REQUIREMENTS.md`**, matching the
01-02 / 04 / 05 / 06 / 07 / 08 / 09 / 10 / 11 precedent: **plan 23 owns the checkboxes.** Both
requirements' *code* halves are complete, shipped and CI-green on three platforms; both have an
outstanding operator-verification clause (task 4) and FLOOR-13 additionally carries the unowned D-22
residual above. Neither may be ticked on headless evidence alone.

---

## Self-Check: PASSED

```
FOUND: src/renderer/src/store/autoMode.ts
FOUND: src/renderer/src/store/sidebarLayout.ts
FOUND: src/renderer/src/components/AgentCard.tsx
FOUND: src/renderer/src/components/FullscreenTerminal.tsx
FOUND: src/renderer/src/components/CommandCenterPanel.tsx
FOUND: src/renderer/src/App.tsx
FOUND: test/renderer-runstate.test.cjs
FOUND commit: 9abdbcd
FOUND commit: dc4703a
FOUND commit: 11da0c9
```
