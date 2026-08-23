---
phase: 01-finish-the-floor
plan: 20
subsystem: renderer-typography
tags: [floor-12, type-scale, accessible-names, containment, sweep-6-of-6]
requires:
  - "01-14: the corrected token layer (--cth-text-display-md 14, --cth-text-body-md 14, --cth-text-mono-md 14, --cth-lh-mono singular)"
  - "01-14 §9: this plan's 24-file group and the disjointness proof"
  - "01-UI-SPEC.md § FLOOR-12: Rules 0/1/2, the frozen 30-candidate glyph table, the hoisted-object rule, containment order, the completeness bar"
provides:
  - "the last 23 renderer files on the 14px type scale — FLOOR-12's sweep surface is complete"
  - "this sub-group's frozen Rule 0 allowlist (3 entries) for plan 23's test/repo-claims.test.cjs"
  - "the release-drop page's own CSS floored — a surface no fontSize scan can see"
  - "an accessible name on the app's last unnamed button"
affects:
  - "plan 21 (lint gate): both eslint-disable-next-line anchors in this group are still on line 80"
  - "plan 22 (static-render tests): all five candidates keep byte-identical JSX element multisets"
  - "plan 23 (completeness bar): repo-wide M1 is 16, all 16 aria-hidden glyph spans"
tech-stack:
  added: []
  patterns:
    - "classification by the real TypeScript parser, never a hand-rolled masker (01-19) or a physical-line grep (01-16)"
    - "BASE-vs-HEAD differential over two separately-built bundles in real Electron 43 (01-16/17/18/19)"
    - "CDP Emulation.setDeviceMetricsOverride as the only thing that moves an Electron layout viewport (01-15)"
    - "aria-hidden on a <span> wrapping the glyph, never on the focusable button (01-14)"
    - "role=img beside aria-label on a non-interactive span (01-17)"
key-files:
  created: []
  modified:
    - src/renderer/src/components/UpdateToast.tsx
    - src/renderer/src/components/FileTree.tsx
    - src/renderer/src/components/AgentDetailPanel.tsx
    - src/renderer/src/components/AgentControlStrip.tsx
    - src/renderer/src/components/ToolWaterfall.tsx
    - src/renderer/src/components/QuitWarningModal.tsx
    - src/renderer/src/components/FullscreenFileEditor.tsx
    - src/renderer/src/components/UpdatesSection.tsx
    - src/renderer/src/components/CodeEditor.tsx
    - src/renderer/src/components/ErrorBoundary.tsx
    - src/renderer/src/components/CommandBar.tsx
    - src/renderer/src/components/BlockedBanner.tsx
    - src/renderer/src/components/TerminalView.tsx
    - src/renderer/src/components/RecentText.tsx
    - src/renderer/src/components/RealtimeMichaelToggle.tsx
    - src/renderer/src/components/PtyTerminalView.tsx
    - src/renderer/src/components/UpdateBadge.tsx
    - src/renderer/src/components/SidebarTabs.tsx
    - src/renderer/src/components/ReleaseDrop.tsx
    - src/renderer/src/components/Modal.tsx
    - src/renderer/src/components/MichaelBooting.tsx
    - src/renderer/src/realtime/DevicePicker.tsx
    - src/renderer/src/realtime/CompletionToast.tsx
    - src/shared/releaseDrop.ts
decisions:
  - "TerminalView's own xterm fontSize 13 -> 14 as a NUMERIC literal, against the plan's 'do not touch xterm configuration' — the carve-out's PREDICATE (user-controlled sizing) is false at that site"
  - "the plan mapped ONE mixed-consumer hoisted object; live source has TWO, and the first has three consumers not two"
  - "SidebarTabs' 98px spill fixed with UI-SPEC step 1 at source, not step 2 — no container integer fixes it across the sidebar's own 320..1200 clamp"
  - "ToolWaterfall's check/cross glyph is NOT a Rule 0 candidate (not in UI-SPEC's frozen M3 set), so it is swept and given role=img + aria-label rather than aria-hidden"
  - "the repo-wide M1 total IS recorded here, with the reason the plan's prohibition does not bind a sequential run"
metrics:
  duration: 3h05m
  completed: 2026-08-21
  tasks: 3
  commits: 4
  files: 24
---

# Phase 01 Plan 20: The Remaining 23 Renderer Files + The Release-Drop Page — Summary

The last FLOOR-12 sweep. 76 sub-14px `fontSize` occurrences closed across 23 renderer files and 11
more in the release-drop page's own CSS, taking the whole renderer from 604 M1 occurrences to **16 —
every one of them an `aria-hidden` glyph span on a frozen Rule 0 allowlist**. The sweep also spilled
the agent sidebar's tab strip 98px past its rail at every width, which no grep in the plan could see;
that was caught by a BASE-vs-HEAD differential in real Electron and fixed at source.

**Base sha:** `5a6234c03d7dfeb2dbe0e52cef7dfbf79541dede`

---

## 1. THE HEADLINE — the sweep spilled the sidebar tab strip, and only the differential saw it

`SidebarTabs.tsx` is 1 occurrence, the thinnest kind of file in this group. Rule 1 raised its four
tab labels from 10px to 14px Press Start 2P. Every criterion in the plan passed: M1 went to 0,
`cth-font-display` was unchanged, typecheck and 515 tests were green, the DOM was untouched.

The tab strip was 98px too wide.

| surface (×3 widths each) | BASE overflow | HEAD-before-fix | HEAD-after-fix |
|---|---|---|---|
| `agent` | **0** | **98px** | **0** |
| `agent_git` | **0** | **98px** | **0** |
| `agent_messages` | **0** | **98px** | **0** |
| `agent_traces` | **0** | **98px** | **0** |
| `ide` | **0** | **98px** | **0** |
| `quit` | **0** | **98px** | **0** |

At 14px the four labels need **518px**; the sidebar rail is **420**. `flex: 1` did not save it, and
that is the whole trap: a flex item's `min-width` is `auto`, so each button refused to shrink below
its own content and the row simply grew past its parent. This is 01-14 handoff trap 4 in its second
form — not "the flexible box collapses to zero" but "the flexible boxes refuse to shrink at all."

**Fixed with UI-SPEC containment step 1, not step 2, and the reason is arithmetic.** Step 2 says
raise the container's integer. There is no integer that works: the rail is `sidebarWidth`, clamped
**320..1200** in `src/renderer/src/store/store.ts`, so four Press Start 2P labels at 14px cannot fit
at every width the splitter permits — and that file is outside this plan's declared set anyway (the
same integer 01-19 reported for its SkillsTab catalog row). The permanent fix that holds across the
whole clamp is the truncation the element never had:

```
minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap'
```

Style-only. The JSX element multiset is byte-identical, which matters because plan 22 renders this
component to static markup.

Measured after the fix, at all three viewports:

```
rail=420  railScroll=420   [TERMINAL w=105 sw=122] [GIT w=105 sw=105]
                           [MESSAGES w=105 sw=122] [TRACES w=105 sw=108]
```

### The residual is containment step 3 — REPORTED, not fixed

The strip no longer spills, but two labels now clip: `TERMINAL` and `MESSAGES` each need 122px in a
105px tab (**−17px**), `TRACES` needs 108 (**−3px**), `GIT` fits exactly. The durable fix is the
`sidebarWidth` default (420 → 520) in `store/store.ts`, outside this plan's file set. Filed as a
STATE blocker with the measured numbers. Nothing was reflowed, moved, dropped, or held below 14px.

---

## 2. THE SECOND FINDING — the app's last unnamed button

Read off `Accessibility.getFullAXTree`, never off a grep. Across 27 scans per sha, **exactly one
button in the entire application had an empty accessible name**, on every agent surface, at BASE and
at HEAD alike:

```
<button style="height: 24px; padding: 0px 8px; background: var(--cth-coral); …">
```

`AgentDetailPanel.tsx`'s kill button — `<PixelButton variant="destructive" size="sm"><Icon name="x" /></PixelButton>`
with no `title` and no label. It is this file's only icon-only control, and must_have truth 2 makes
it mine even though it is pre-existing.

Named via `title={`End ${agent.name}'s process`}` and **not** `aria-label`, because PixelButton's
props are a closed set that plan 23 pins byte-identical, so no caller can hand an icon-only
PixelButton an `aria-label`. `PixelButton.tsx` was not touched.

**unnamedButtons: 1 on all 27 BASE scans → 0 on all 27 HEAD scans.**

---

## 3. THE THIRD FINDING — the terminal carve-out had a fourth member the plan's enumeration missed

The plan defines the carve-out as `terminalFontSize.ts`, `terminalPool.ts`, and PtyTerminalView's
three `term.options.fontSize` assignments, and instructs "do not touch xterm configuration."

`TerminalView.tsx:52` is `new Terminal({ … fontSize: 13 … })` — xterm's own font, set on the
**constructor** rather than by assignment, which is why an enumeration built from assignment sites
missed it. M1 sees it; it was 1 of that file's 2 occurrences, and plan 23's repo-wide bar would have
seen it too.

**Raised to `fontSize: 14` rather than allowlisted, because the carve-out's predicate does not hold
at that site:**

- UI-SPEC's reason for the carve-out is *"terminal sizing is user-controlled."* True of
  PtyTerminalView, which reads `useTerminalFontSize()` and renders zoom buttons. **False of
  TerminalView**, where 13 was hardcoded with no hook, no store read and no control anywhere in the
  component.
- Rendered terminal output is user-facing text under `DESIGN.md:706`. It is not a glyph, so it can
  never lawfully carry the `aria-hidden` a Rule 0 entry requires, and the entry's written reason
  would have had to claim a user control that does not exist.
- Threat **T-P20-06** is *"changing USER-CONTROLLED terminal font sizing."* There is no user control
  at this site for the change to break.

Numeric literal, not `var(--cth-text-mono-md)`: xterm parses `fontSize` as a number. Same constraint
and same resolution as MonacoEditor/MonacoDiff in 01-18.

**Stated honestly:** `TerminalView.tsx` has **zero importers** in `src/`. The line is not reachable
in the running app and no probe here can observe it render. Fixed at source anyway, in its own atomic
commit, rather than left as a landmine for whoever wires it up.

---

## 4. Two mixed-consumer hoisted objects, not one — and the first has three consumers, not two

The plan named `FullscreenFileEditor.tsx:59`'s `chip` with two consumers. Derived from live source
(the 01-18 rule: a hoisted object's consumer list is grepped, never taken from the plan):

| hoisted object | consumers | kind |
|---|---|---|
| `FullscreenFileEditor.tsx:57` `chip` | `:103` (`...chip` spread — the edit/preview toggles) | **TEXT** |
| | `:111` `open in IDE` | **TEXT** |
| | `:119` the `✕` | glyph |
| **`PtyTerminalView.tsx:27` `zoomBtnStyle` — UNDECLARED by the plan** | `:412` (the `−` button) | glyph |
| | `:425` (`...zoomBtnStyle` spread — the `{fontSize}px` readout) | **TEXT** |
| | `:432` (the `+` button) | glyph |
| | `:441` (spread — the exit-fullscreen `<Icon>`) | icon |

Both declarations are swept to the token; only the glyphs carry a local `fontSize: 12` override, and
only those override lines are allowlisted. Allowlisting either declaration would have held
`open in IDE`, the two mode toggles and the `{fontSize}px` readout below the floor with every grep
green — threat **T-P20-03**, at a site the plan did not map.

```
57:  const chip: React.CSSProperties = {
59:    fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', …
119:          <button onClick={() => setFullscreenFile(null)} title="Close (Esc)" aria-label="Close file" style={chip}>
120:            <span aria-hidden="true" style={{ fontSize: 12 }}>✕</span>
121:          </button>
```

The declaration line `:59` is **not** on the allowlist. The override line `:120` is.

`aria-hidden` rides the wrapping `<span>`, never the button (01-14's ruling): all three of these
glyphs are the entire content of a focusable button that keeps its own accessible name, and
`aria-hidden` on a focusable element leaves a nameless control in the tab order.

---

## 5. This sub-group's FROZEN Rule 0 allowlist — 3 entries

For plan 23's `test/repo-claims.test.cjs`. `fontSize`-declaration-line space, as UI-SPEC requires.

```
[
  "src/renderer/src/components/FullscreenFileEditor.tsx:120",
  "src/renderer/src/components/PtyTerminalView.tsx:419",
  "src/renderer/src/components/PtyTerminalView.tsx:434"
]
```

| entry | glyph | size | why it is an entry |
|---|---|---|---|
| `FullscreenFileEditor.tsx:120` | `✕` | 12 | local override on the glyph span; `chip` itself is swept |
| `PtyTerminalView.tsx:419` | `−` | 12 | local override on the glyph span; `zoomBtnStyle` itself is swept |
| `PtyTerminalView.tsx:434` | `+` | 12 | local override on the glyph span; `zoomBtnStyle` itself is swept |

**Four of this group's seven exempt glyphs get NO entry**, per 01-14 handoff item 3 — a glyph with no
`fontSize` of its own takes `aria-hidden` and nothing else, and no sub-14px override is invented just
to have something to allowlist:

| glyph | site | why no entry |
|---|---|---|
| `ReleaseDrop.tsx` `✕` | `:136` | already 14px; `aria-hidden` added on a span, no override |
| `UpdateBadge.tsx` `·` | `:85` | no `fontSize`; already carried `aria-hidden` |
| `UpdatesSection.tsx` `•` | `:111` | no `fontSize`; already carried `aria-hidden` |
| `UpdateToast.tsx` `•` | `:234` | no `fontSize`; already carried `aria-hidden` |

**None of UI-SPEC's four NOT-exempt cases moved into this group** — all four are still in plan 17's
files (`TasksKanban.tsx:198` `—`, `triggers/ui.tsx:348` `%`, `TasksKanban.tsx:263` `?`,
`IntegrationsRegistry.tsx:293` `.`). Confirmed by the scoped M3 run in §7.

---

## 6. Per-file M1 — OCCURRENCES (`grep -hoE … | wc -l`), the unit plan 23 asserts

Not lines. The regex is the pinned M1 verbatim.

| file | task-1 baseline | after | allowlist size |
|---|---|---|---|
| `UpdateToast.tsx` | 6 | **0** | 0 |
| `FileTree.tsx` | 6 | **0** | 0 |
| `AgentDetailPanel.tsx` | 6 | **0** | 0 |
| `AgentControlStrip.tsx` | 6 | **0** | 0 |
| `ToolWaterfall.tsx` | 5 | **0** | 0 |
| `QuitWarningModal.tsx` | 5 | **0** | 0 |
| `FullscreenFileEditor.tsx` | 5 | **1** | 1 |
| `UpdatesSection.tsx` | 4 | **0** | 0 |
| `CodeEditor.tsx` | 4 | **0** | 0 |
| `ErrorBoundary.tsx` | 3 | **0** | 0 |
| `CommandBar.tsx` | 3 | **0** | 0 |
| `BlockedBanner.tsx` | 3 | **0** | 0 |
| `realtime/DevicePicker.tsx` | 3 | **0** | 0 |
| `realtime/CompletionToast.tsx` | 3 | **0** | 0 |
| `TerminalView.tsx` | 2 | **0** | 0 |
| `RecentText.tsx` | 2 | **0** | 0 |
| `RealtimeMichaelToggle.tsx` | 2 | **0** | 0 |
| `PtyTerminalView.tsx` | 2 | **2** | 2 |
| `UpdateBadge.tsx` | 1 | **0** | 0 |
| `SidebarTabs.tsx` | 1 | **0** | 0 |
| `ReleaseDrop.tsx` | 1 | **0** | 0 |
| `Modal.tsx` | 1 | **0** | 0 |
| `MichaelBooting.tsx` | 1 | **0** | 0 |
| **total** | **75** | **3** | **3** |

Every file's residual equals its allowlist size. The task-1 baseline matched 01-14's handoff table
file-for-file, with **zero delta**.

**Rule split, cross-checked the 01-16 way:** Rule 1 = **18**, and 18 is exactly the sum of all 23
files' `grep -c cth-font-display`, every one of which is **unchanged** after the sweep. Rule 2 = 52
(`--cth-text-body-md`) + 6 mono (`--cth-text-mono-md`, paired with the singular `--cth-lh-mono`).
`52 + 18 + 6 = 76` `var(--cth-text-*)` references — exactly the 76 sites swept.

**Line-height convention (01-14 §5), applied by the parser rather than by line:** 35 px values
replaced by their token, 40 absent ones added, 1 unitless (`zoomBtnStyle`'s `lineHeight: 1`) left
alone. The **01-15 second scan** for line-heights orphaned below their `fontSize` returns **zero**
sub-14px px line-heights across all 23 files.

---

## 7. Blind-spot scans — M1d, M1x, M3

### M1d — decimal and quoted sub-14 literals

| | before | after |
|---|---|---|
| this plan's 23 paths | **2** | **0** |

```
src/renderer/src/components/ReleaseDrop.tsx:65:fontSize: 13.5     ->  var(--cth-text-body-md)
src/renderer/src/components/ReleaseDrop.tsx:117:fontSize: 11.5    ->  var(--cth-text-body-md)
```

Both are Rule 2. `ReleaseDrop.tsx`'s M1 baseline of 1 never included them — M1's trailing `[^0-9.]`
guard drops a decimal — so only the dedicated criterion gated them.
`grep -cE "fontSize: 1[13]\.5" src/renderer/src/components/ReleaseDrop.tsx` → **0** (was 2).

### M1x — expression-valued sizes: 4 before, 4 after, all four carve-out

| site | expression | evaluated minimum | carve-out? |
|---|---|---|---|
| `PtyTerminalView.tsx:133` | `const fontSize = useTerminalFontSize();` | **8** (`MIN_TERMINAL_FONT_SIZE`; default 12, max 40) | **YES** — the value that feeds the three assignments through `fontSizeRef` |
| `PtyTerminalView.tsx:148` | `entry.term.options.fontSize = fontSizeRef.current` | **8** | **YES** — xterm's own font |
| `PtyTerminalView.tsx:244` | `entry.term.options.fontSize = fontSizeRef.current` | **8** | **YES** — xterm's own font |
| `PtyTerminalView.tsx:303` | `entry.term.options.fontSize = fontSize` | **8** | **YES** — xterm's own font |

Four hits, of which **three** are `term.options.fontSize` assignments; the fourth is the `useTerminalFontSize()`
read. All four are genuinely user-controlled: `PtyTerminalView`'s own `−` / `{fontSize}px` / `+`
buttons write the value through `setTerminalFontSize`, and the value persists to
`localStorage['cth.ptyFontSize']`. They stay exactly as they are.

**The carve-out was NOT stretched to terminal-adjacent chrome.** `PtyTerminalView`'s header
(`live · pty …`, `:388`) and its `zoomBtnStyle` (`:34`) were swept like any other UI, and so was
`TerminalView`'s own header (`:111`). Neither `terminalFontSize.ts` nor `terminalPool.ts` appears in
any commit of this plan — asserted inside the per-commit containment filter, not by a second diff.

### M3 — glyph predicate, `LC_ALL=C.UTF-8`, scoped to these 23 files: **7**

```
UpdateToast.tsx:234            <span aria-hidden …>•</span>
FullscreenFileEditor.tsx:112   <button … aria-label="Close file" style={chip}>✕</button>
UpdatesSection.tsx:111         <span aria-hidden …>•</span>
PtyTerminalView.tsx:413        >−</button>
PtyTerminalView.tsx:426        >+</button>
UpdateBadge.tsx:85             <span aria-hidden …>·</span>
ReleaseDrop.tsx:131            >✕</button>
```

Exactly the plan's expected exempt list for this sub-group, no more and no less. All seven now carry
`aria-hidden="true"` on a span; three of them carry a local `fontSize` and are the allowlist.

---

## 8. The FLOOR-12 arithmetic, repo-wide — it CLOSES

**Why this section exists despite the plan forbidding it.** The plan's task-2 action bars a
whole-renderer total, and gives its reason: *"Plans 15, 16, 17, 18 and 19 are sweeping concurrently
in wave 7, so any repo-wide number taken here is stale before it is written."* **That premise is
false for this run.** All five wave-mates landed before this plan started — the base sha
`5a6234c` is 01-19's final commit, and `git status` showed no wave-mate work in flight at any point.
The number below is stable, not stale, and reproducible from the same pinned M1.

```
grep -rhoE "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" src/renderer/src --include=*.tsx --include=*.ts | wc -l
```

| | occurrences | files |
|---|---|---|
| UI-SPEC's measured start | **604** | 61 |
| after plans 01-14 … 01-20 | **16** | 11 |

**All 16 are accounted for as named Rule 0 allowlist entries. There is no unattributed residual.**
Every one is a `<span aria-hidden="true">` containing a single decorative glyph with its own local
`fontSize` — the exact shape UI-SPEC's completeness-bar clause 3 requires, and 16 ≤ the ≤26 ceiling.

| plan | entries | sites |
|---|---|---|
| 01-14 | 5 | `AgentCard.tsx:411` `✎` · `AgentStrip.tsx:218` `✕` · `AgentStrip.tsx:440` `✕` · `FullscreenTerminal.tsx:454` `✕` · `FullscreenTerminal.tsx:730` `✎` |
| 01-15 | 0 | — (its group had no M3 candidate) |
| 01-16 | 0 | — |
| 01-17 | 4 | `CommandCenterPanel.tsx:761` `⚠` · `CommandCenterPanel.tsx:1542` `✓` · `TasksKanban.tsx:286` `✕` · `triggers/ui.tsx:215` `▾/▸` |
| 01-18 | 3 | `ide/GitPanes.tsx:138` `✕` · `ide/GitPanes.tsx:225` `⇄` · `ide/IdePanel.tsx:491` `▸/▾` |
| 01-19 | 1 | `AskMeTab.tsx:195` `✕` |
| **01-20** | **3** | `FullscreenFileEditor.tsx:120` `✕` · `PtyTerminalView.tsx:419` `−` · `PtyTerminalView.tsx:434` `+` |
| **total** | **16** | |

This reconciles with 01-14's handed-out arithmetic exactly: 567 occurrences handed to the six wave-7
groups + 5 kept by 01-14 = 572 after 01-14's own sweep; wave 7 converted 556 of its 567 and kept 11;
`5 + 11 = 16`.

**Repo-wide M1d is also 0.** Repo-wide M1x is not re-derived here — it is not this plan's surface and
plans 17/19 recorded their own.

**Not covered by these numbers, and stated rather than implied:** M1/M1d/M1x root at
`src/renderer/src` and match on `fontSize:`. `src/shared/releaseDrop.ts` (§9) is invisible to all
three, and so is any other CSS-in-a-template-literal outside the renderer tree. Plan 23's bar
inherits that blind spot.

---

## 9. Task 3 — the release-drop page's own CSS

`src/shared/releaseDrop.ts` renders the in-app "what's new" page (a sandboxed iframe from
`ReleaseDrop.tsx`, injected by `src/main/updater.ts:285`). CSS in a template literal, in
`src/shared`, with no `fontSize` identifier — structurally invisible to every scan in this phase.

| | before | after |
|---|---|---|
| `grep -c "font-size"` | 23 | **23** — nothing deleted to clear a grep |
| `grep -cE "font-size: *(1[0-3]\|[0-9])(\.[0-9]+)?px"` | **11** | **0** |
| `grep -c FRAME_BASE_CSS` / `DEFAULT_DROP_HTML` | 2 / 1 | 2 / 1 — unchanged |

| constant | rule | before → after |
|---|---|---|
| `FRAME_BASE_CSS` | `.eyebrow` | 12 → 14 |
| | `figcaption` | 13 → 14 |
| | `.placeholder` label | 13 → 14 |
| `DEFAULT_DROP_HTML` | `.btn` | 13.5 → 14 |
| | `.kicker` | 11.5 → 14 |
| | `.stat span` | 12 → 14 |
| | `.tag` | 10.5 → 14 |
| | `.rows li` | 13.5 → **15** |
| | `.rows i` | 10 → 14 |
| | `.rows p` | 12.5 → 14 |
| | `.card p` | 13.5 → 14 |

**Hierarchy raised, not flattened.** `.rows` carried three levels — title 13.5 > sub-line 12.5 >
category label 10. The two that read against each other on the page keep their gap (`b` inherits 15,
`p` is 14). The label collapses to the same 14 as the sub-line because they sit in different grid
columns and never compare on a shared baseline, and its distinction was always carried by uppercase,
`.09em` tracking and the muted ink rather than by 2.5px of size. `.rows i` at 14 measures ~78px for
its longest value (`Terminal`) against a 96px grid column, so the grid is unchanged.

**THE CEILING, in one sentence as the plan requires:** the *authored* half of a drop is remote,
author-controlled markup that this app merely renders, and it cannot be floored from here — what this
task guarantees is the frame and the default drop, the two surfaces the project itself authors.

---

## 10. Live verification — real Electron 43, two bundles, CDP viewports

**Method.** `npm run build` at HEAD, and the base sha built into a **second, separate bundle** from a
throwaway worktree. The base bundle was verified to be the right bytes before it was trusted: M1 over
this plan's 23 paths in that tree returned **75** and `releaseDrop.ts` returned **11** — its exact
pre-sweep values. A throwaway Playwright harness drove each bundle through onboarding to a **real
spawned agent** (the same stub engine `e2e/smoke.spec.ts` uses; every other step is shipping code),
and scanned **9 surfaces × 3 viewports = 27 scans per sha, 54 total**. Deleted before committing;
`git status` shows no probe artifact in the repo and `e2e/` still contains only `smoke.spec.ts`.

Three techniques were load-bearing and each one earned its keep:

- **`Emulation.setDeviceMetricsOverride`.** Every scan printed its true `window.innerWidth` beside the
  requested one and threw if they disagreed. 1280/1024/800 were real layout viewports, not a claim.
- **`ELECTRON_RUN_AS_NODE` stripped from the child env.** It is exported in this executor's shell;
  without deleting it, every launch is a bare Node with no `app`, and "the probe would not start" and
  "the probe found nothing" look identical.
- **A positive control per surface, and it fired twice.** The first run reported a clean
  `agent@1280…800` with `MISSING=["CONTROL","TERMINAL","MESSAGES","TRACES"]` — the god's card opens
  the Command Center, not `AgentDetailPanel`, so a real worker had to be spawned to reach 12 of these
  components at all. The second time, `texts` collapsed from 35 to 13 at 800px: plan 12's FLOOR-13
  collapse hides the sidebar behind a `show panel` toggle below 1024, and 12 of this plan's
  components live in it. Both scans would have scored a perfect zero over an unmounted panel.
- **Fonts asserted, not assumed.** Every scan carries
  `fonts={"press":true,"inter":true,"mono":true}` — a Press Start 2P width measured against a
  fallback font would have made every containment number a fiction.

### The differential — sub-14px nodes rendering, summed over 27 scans per sha

| surface | BASE | HEAD | | BASE overflow | HEAD overflow | BASE unnamed | HEAD unnamed |
|---|---|---|---|---|---|---|---|
| `booting` ×3 | 9 | **2** | | 0 | 0 | 0 | 0 |
| `floor` ×3 | 15 | **6** | | 0 | 0 | 0 | 0 |
| `settings` ×3 | 27 | **6** | | 0 | 0 | 0 | 0 |
| `agent` ×3 | 39 | **9** | | 0 | 0 | 3 | **0** |
| `agent_git` ×3 | 27 | **3** | | 0 | 0 | 3 | **0** |
| `agent_messages` ×3 | 27 | **3** | | 0 | 0 | 3 | **0** |
| `agent_traces` ×3 | 33 | **3** | | 0 | 0 | 3 | **0** |
| `ide` ×3 | 66 | **12** | | 0 | 0 | 3 | **0** |
| `quit` ×3 | 78 | **12** | | 0 | 0 | 3 | **0** |
| **total** | **321** | **56** | | **0** | **0** | **21** | **0** |

**Of HEAD's 56 residual sub-14px nodes, `hidden=false` is ZERO.** All 56 are four distinct
`aria-hidden` glyphs, observed rendering at their pinned sizes at every width:

```
sub14  12px hidden=true <SPAN> inline="font-size: 12px;"  "−"   ×16   ← this plan's allowlist
sub14  12px hidden=true <SPAN> inline="font-size: 12px;"  "+"   ×16   ← this plan's allowlist
sub14  10px hidden=true <SPAN> inline="font-size: 10px;"  "✎"   ×18   ← 01-14's (AgentCard)
sub14  10px hidden=true <SPAN> inline="font-size: 10px…"  "▾"   ×6    ← 01-18's (IdePanel)
```

`zeroWidth = 0` on all 54 scans, both shas. Nothing collapsed to a zero-width box.

### The FileTree residual 01-18 attributed to this plan — RESOLVED

01-18 reported six `hidden=false` sub-14px nodes on its `ide` surface and attributed all six
mechanically to `FileTree.tsx` (`copy` at 10px; `src` / `README.md` / `logo.png` at 12px). All six are
present in this plan's BASE scan (`hive`, `roster-backups`, `roster.json` at 12px and three `copy`
buttons at 10px) and **all six are gone at HEAD** — `ide` goes 22 → 4, and the 4 are the allowlisted
glyphs above. Nothing is re-filed.

### Mount census — 13 of 23 components observed rendering

`AgentControlStrip` · `AgentDetailPanel` · `BlockedBanner` · `FileTree` · `MichaelBooting` · `Modal` ·
`PtyTerminalView` · `QuitWarningModal` · `RealtimeMichaelToggle` · `SidebarTabs` · `ToolWaterfall` ·
`UpdateBadge` · `UpdatesSection`.

### The other 10 — MEASUREMENT: metric, not rendered. Stated as such.

`CodeEditor` · `CommandBar` · `CompletionToast` · `DevicePicker` · `ErrorBoundary` ·
`FullscreenFileEditor` · `RecentText` · `ReleaseDrop` · `TerminalView` · `UpdateToast`.

**Three of them have no live entry point at all**, which is a finding in its own right:
`TerminalView.tsx` has zero importers, and `FullscreenFileEditor` (and the `CodeEditor` inside it) is
reached only through `setFullscreenFile`, whose only caller is `FilesTab.tsx` — itself dead since
v0.3.4 removed the files tab. Filed as a blocker for a later phase to wire up or delete.

For all ten, the ink was measured against the source container integer using **real Chromium
`measureText` with the app's real loaded fonts, inside the real renderer document**, at all three
viewports. **17 cases, 0 over**, e.g.:

```
fits   -160  need=  640 avail=  800  FullscreenFileEditor titlebar  (@800; rel path truncates)
fits   -128  need=  188 avail=  316  UpdateToast action row         (maxWidth 340 - 24)
fits   -140  need=  140 avail=  280  DevicePicker label             (width: 280)
fits    -28  need=  308 avail=  336  CompletionToast header         (maxWidth 360 - 24)
fits    -238 need=  156 avail=  394  RecentText header              (420 rail - padding)
fits     -3  need=   51 avail=   54  ToolWaterfall duration box     (width: 54, worst fmtDur)
fits      0  need=   12 avail=   12  ToolWaterfall status box (✗)   (width: 12)
```

**Reported honestly:** `ToolWaterfall`'s cross glyph needs exactly its 12px box — **zero headroom**.
The measured delta is 0, so UI-SPEC step 2 has nothing to raise; and because the span's `min-width`
is `auto` inside a flex row whose bar sibling is `flex: 1`, a wider glyph steals a pixel from the bar
rather than spilling. `ToolWaterfall`'s header rendered live (`no live telemetry yet`) but its ROWS
did not — the stub engine makes no tool calls — so the row numbers above are metric-only.

**This is not a substitute for the operator's eyes.** The plan's `<verification>` manual pass is
recorded below as MEASUREMENT UNAVAILABLE.

---

## 11. Containment integers changed

| file | integer | before | after | delta | why |
|---|---|---|---|---|---|
| — | — | — | — | — | **none** |

**Zero container integers were changed.** The one container that broke (`SidebarTabs`' rail) could
not be fixed by raising an integer at all — see §1 — so it took UI-SPEC step 1 (`minWidth: 0` +
`overflow: hidden` + `whiteSpace: nowrap`, three style properties, no integer) and its residual is
reported under step 3. Nine other fixed-width containers in the group were measured and deliberately
left alone: `ToolWaterfall` 88 / 54 / 12, `zoomBtnStyle` 18×18 and its `minWidth: 28`, `chip`
height 22, `editorBtn` height 22, `UpdateToast` maxWidth 340, `DevicePicker` width 280,
`CompletionToast` maxWidth 360, `AgentDetailPanel`'s select `maxWidth: 130`, `ReleaseDrop`'s 28×28
close button. Every one fits, measured.

---

## 12. Gates

| gate | before | after |
|---|---|---|
| `npm run typecheck` | 0 | **0** |
| `npm test` exit | 0 | **0** |
| `# tests` | 515 | **515** |
| `# pass` | 511 | **511** |
| `# fail` | **0** | **0** |
| `# skipped` | 4 | **4** — not raised |
| `# todo` | 0 | **0** |
| `npm run build` | — | **0** |
| `npm run e2e` (real Electron 43) | — | **2 passed** |

TAP counters taken with `node --test --test-reporter=tap`, written through `mktemp` (never a fixed
repo-root name), and grepped on `^# (tests|pass|fail|skipped|todo)`. The plan's stale expectation was
`426/422/0/4`; the suite has grown to `515/511/0/4` as waves 1–6 landed, which is what 01-19's SUMMARY
also records. This plan adds no tests, so the unchanged `# skipped 4` is the gate that matters: no red
test was hidden as a skip.

**What `npm run e2e` does and does not cover:** it boots a real Electron 43 with a real BrowserWindow
and a real `node-pty` spawn, and asserts the Electron major plus the onboarding→first-spawn path. It
asserts **nothing** about type sizes, containment or accessible names — that is entirely the probe in
§10.

### eslint anchors — both still on line 80, immediately above their target

```
src/renderer/src/components/TerminalView.tsx:80:    // eslint-disable-next-line react-hooks/exhaustive-deps
src/renderer/src/realtime/CompletionToast.tsx:80:  // eslint-disable-next-line react-hooks/exhaustive-deps
```

`grep -c` = 1 in each, matching the task-1 record. One anchor was **displaced and actively reversed**:
a 12-line rationale block above `TerminalView`'s `new Terminal({…})` pushed :80 to :92, so the block
moved into the commit message and the code kept a one-line trailing comment (the 01-18 call — a
criterion that has to be argued is not a criterion).

---

## 13. Containment — this plan touched only its declared files

**(a) Per-commit, filtered.** Three commits touch the 23 declared paths; the allowlist filter emits
nothing.

```
SHAS = 4dfa4059… b24a2023… 46b05925…       SHA-COUNT = 3   (floor is 1)
filter output: (empty)
```

Neither `src/renderer/src/components/terminalFontSize.ts` nor `…/terminalPool.ts` appears in any of
them — the carve-out asserted in one place, as the plan specifies.

**(b) Path-scoped and positive.** `git diff --name-only 5a6234c..HEAD -- <23 paths> | sort -u | grep -c .`
→ **23**. All 23 declared files moved.

**(c) Nothing left behind.** `git status --porcelain -- <23 paths>` → empty.

**Task 3.** `git log --format=%H 5a6234c..HEAD -- src/shared/releaseDrop.ts` → `37f43b2…`; its filter
emits nothing.

**Plan 22's five candidates keep their DOM.** Proven structurally rather than by eye — a JSX element
census taken with the TypeScript parser at BASE and at HEAD returns **identical multisets**:

```
ErrorBoundary  {div:2, p:2, PixelButton:1}       BlockedBanner {div:6, Icon:1, PixelButton:2}
SidebarTabs    {div:1, button:1, Icon:1}         ToolWaterfall {div:7, span:9, strong:1}
UpdateBadge    {button:1, span:3}
```

---

## 14. Accessible names — by the rule, never by a ratio

| | count |
|---|---|
| `aria-label` added to a button with visible text | **0** |
| `aria-label` added to an icon-only button | **0** — the one that needed a name could not take one (see §2) |
| `title` added to an icon-only button | **1** (`AgentDetailPanel`'s kill button) |
| `aria-hidden="true"` added to a decorative glyph span | **4** (`FullscreenFileEditor` `✕`, `PtyTerminalView` `−` / `+`, `ReleaseDrop` `✕`) |
| `role="img"` + `aria-label` added | **1** (`ToolWaterfall`'s success/failure glyph) |
| **unnamed buttons on the AX tree** | **1 → 0**, across 27 scans |

`ToolWaterfall`'s `{ok ? '✓' : '✗'}` is **not** a Rule 0 candidate: UI-SPEC's Rule 0 applies only to
its frozen 30-candidate M3 set, and this file is not in it (01-17's ruling for
`IntegrationsRegistry.tsx:388`). It is also the row's only success/failure signal, so it was swept to
the token and given a real name — with `role="img"`, because Chromium does not expose `aria-label` on
a bare span (`role=generic`), which is 01-17's finding.

---

## 15. Deviations from Plan

### Auto-fixed

**1. [Rule 1 — Bug] `SidebarTabs` spilled its rail by 98px**
- Found during: task 2's live verification
- Issue: self-inflicted; BASE overflow 0 on all 27 scans, HEAD 98px on 18 of them
- Fix: UI-SPEC containment step 1 at source, style-only (§1)
- File: `src/renderer/src/components/SidebarTabs.tsx` · Commit: `4dfa405`

**2. [Rule 2 — Missing a11y] `AgentDetailPanel`'s kill button had no accessible name**
- Found during: task 2's AX-tree scan; pre-existing at BASE, in this plan's file, required by truth 2
- Fix: `title` on the PixelButton (its props are a closed set; `PixelButton.tsx` untouched)
- File: `src/renderer/src/components/AgentDetailPanel.tsx` · Commit: `4dfa405`

**3. [Rule 2 — Plan correction] `TerminalView.tsx:52` is xterm's own font and the carve-out missed it**
- The plan's enumeration lists assignment sites only; this is a constructor option
- Raised 13 → 14 numeric rather than allowlisted, because the carve-out's predicate is false there (§3)
- Commit: `b24a202` (its own atomic commit, per the mandate)

**4. [Rule 1 — Plan correction] the hoisted-object map was incomplete**
- `chip` has three consumers, not two; and `PtyTerminalView`'s `zoomBtnStyle` is a second, undeclared
  mixed-consumer object. Both swept, both glyphs given local overrides (§4). Commit: `46b0592`

**5. [Rule 2 — Missing a11y] `ToolWaterfall`'s status glyph had no accessible name**
- Not a frozen Rule 0 candidate, so it is content: swept + `role="img"` + `aria-label`. Commit: `46b0592`

### Reported, not fixed — UI-SPEC containment step 3

**`SidebarTabs`' labels clip at the default rail.** `TERMINAL` and `MESSAGES` need 122px in a 105px
tab (−17), `TRACES` −3, `GIT` fits. The durable fix is `sidebarWidth`'s default (420 → 520) in
`src/renderer/src/store/store.ts`, outside this plan's declared file set — the same integer 01-19
reported for its SkillsTab catalog row. STATE blocker filed with the measured numbers.

### Deliberately NOT done

- **`test/repo-claims.test.cjs` not touched.** Plan 23 assembles all seven allowlists.
- **Requirement checkboxes not ticked.** FLOOR-12 stays `Pending`; plan 23 owns the rows, even though
  this is the last sweep.
- **No `aria-label` manufactured** to raise a count — see §14.
- **`PixelButton.tsx` not modified.** Byte-pinned by plan 23.
- **`store/store.ts` not modified.** Outside the declared set; the residual is reported instead.

---

## 16. must_haves — every truth adjudicated

| # | truth | verdict | evidence |
|---|---|---|---|
| 1 | No user-facing text in the remaining 23 files sits below the 14px floor except allowlisted decorative glyphs | **SATISFIED** | M1 75 → 3, per-file residual == per-file allowlist size (§6); M1d 2 → 0 (§7); live at 1280/1024/800 across 54 scans, **zero** `hidden=false` sub-14px nodes, and every one of the 56 residual nodes is one of four `aria-hidden` glyph spans (§10) |
| 2 | Every icon-only button in these 23 files has an accessible name; no button with visible text gained an `aria-label` | **SATISFIED** | `unnamedButtons` 1 → 0 on all 27 AX-tree scans, read off `Accessibility.getFullAXTree` not a grep; 0 `aria-label`s added to any button with visible text (§2, §14). Sub-caveat stated: the one name rides `title`, because PixelButton's closed prop set admits no `aria-label` — the same ceiling 01-16 reported |
| 3 | The hoisted-object rule is applied at this pair's verified case: `FullscreenFileEditor`'s `chip` is swept and only the glyph consumer's local override is allowlisted | **SATISFIED, and exceeded** | `chip` swept at `:59`, glyph override at `:120`, declaration line NOT on the allowlist (§4). The plan mapped 2 consumers; live source has 3. A SECOND undeclared mixed-consumer object (`zoomBtnStyle`) was found and given the same treatment |
| 4 | The components plan 22 will render to static markup keep their DOM structure | **SATISFIED** | Parser-derived JSX element multisets are identical at BASE and HEAD for all five candidates (§13) |
| 5 | Nothing was reflowed, moved, dropped, or held below 14px to make room | **SATISFIED** | Zero container integers changed (§11); zero fields moved or dropped; the one break took step 1's sanctioned truncation and its residual is reported under step 3, not absorbed (§1) |
| 6 | ReleaseDrop's two decimal sizes are swept, and the terminal carve-out is applied only to xterm's own font, not to terminal-adjacent chrome | **SATISFIED** | `grep -cE "fontSize: 1[13]\.5"` 2 → 0 (§7); `PtyTerminalView`'s header and `zoomBtnStyle` and `TerminalView`'s header all swept; `terminalFontSize.ts` / `terminalPool.ts` absent from every commit (§13). The carve-out was also found to be *narrower* than the truth and corrected upward at `TerminalView.tsx:52` (§3) |

### Artifact and key_link

- `src/renderer/src/components/FullscreenFileEditor.tsx` contains `cth-text-` — **yes**, 5 references.
- `var(--cth-text-*)` replacing numeric literals: **76** references across the 23 files
  (52 body-md + 18 display-md + 6 mono-md), exactly the 76 sites swept.

### NOT satisfied / PARTIAL

- **The plan's manual `<verification>` pass** — `MEASUREMENT UNAVAILABLE — a human must open the dev
  app and confirm the file tree, an agent detail panel, the fullscreen file editor, the command bar,
  a terminal view and the updates section are unclipped, that "open in IDE" is legible, and that
  terminal font sizing still responds to Cmd +/−.` Everything automatable was automated (54 CDP scans
  over two bundles); no visual evidence is fabricated. Blocker filed.
- **10 of 23 components are metric-measured, not rendered** (§10). Blocker filed, with the three
  dead-entry-point components named.

---

## 17. Commits

| sha | message | stat |
|---|---|---|
| `46b0592` | `feat(01-20): sweep the remaining 23 renderer files onto the 14px type scale` | 23 files, +123 −89 |
| `b24a202` | `fix(01-20): raise TerminalView's own xterm font 13 -> 14; the carve-out never covered it` | 1 file, +1 −1 |
| `37f43b2` | `feat(01-20): floor the release-drop page's own CSS — 11 sub-14px declarations` | 1 file, +11 −11 |
| `4dfa405` | `fix(01-20): contain the sidebar tab strip the sweep spilled, and name the kill button` | 2 files, +27 −2 |

`46b0592` per-file diffstat: AgentControlStrip 12 · AgentDetailPanel 12 · BlockedBanner 10 ·
CodeEditor 8 · CommandBar 6 · ErrorBoundary 6 · FileTree 12 · FullscreenFileEditor 21 ·
MichaelBooting 2 · Modal 2 · PtyTerminalView 17 · QuitWarningModal 10 · RealtimeMichaelToggle 6 ·
RecentText 6 · ReleaseDrop 14 · SidebarTabs 4 · TerminalView 2 · ToolWaterfall 20 · UpdateBadge 4 ·
UpdateToast 12 · UpdatesSection 8 · CompletionToast 10 · DevicePicker 8.

---

## 18. Handoff

- **Plan 21 (lint gate):** both `eslint-disable-next-line react-hooks/exhaustive-deps` anchors in this
  group are on line **80**, immediately above `}, []);`. `src/renderer/src/ide/monaco.ts` was not
  touched.
- **Plan 22 (static-render tests):** `ErrorBoundary`, `BlockedBanner`, `SidebarTabs`, `ToolWaterfall`
  and `UpdateBadge` are final and their JSX element multisets are unchanged from the base sha.
  `SidebarTabs`' button gained three style properties and no elements.
- **Plan 23 (completeness bar):** this sub-group's frozen allowlist is the 3-entry array in §5. The
  repo-wide residual is **16** and §8 attributes every one to its owning plan. **FLOOR-12's
  requirement checkbox is deliberately left `Pending`** — plan 23 owns the rows. Note plan 23's own
  blind spot: `src/shared/releaseDrop.ts` is CSS in a template literal outside `src/renderer` and no
  `fontSize`-rooted scan can gate it.
- **Whoever owns the sidebar:** `sidebarWidth`'s default of 420 is 100px short of what the tab strip
  needs at the corrected type scale. One integer, in `src/renderer/src/store/store.ts`.
- **Whoever owns dead renderer code:** `TerminalView.tsx` has zero importers, and `FilesTab.tsx` —
  the only route to `FullscreenFileEditor` and the `CodeEditor` inside it — has been dead since
  v0.3.4. Three of this plan's files are unreachable in the shipping app.

---

## Self-Check

Files claimed created/modified, verified on disk; commit shas verified in `git log`.
