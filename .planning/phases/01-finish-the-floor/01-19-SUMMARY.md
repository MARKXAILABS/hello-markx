---
phase: 01-finish-the-floor
plan: 19
subsystem: renderer-typography
tags: [FLOOR-12, accessibility, design-tokens, containment, wave-7]
requires:
  - path: ".planning/phases/01-finish-the-floor/01-14-SUMMARY.md"
    provides: "the corrected token layer (display-md/body-md/mono-md all 14px, display-sm deleted) and this plan's file group"
  - path: ".planning/phases/01-finish-the-floor/01-UI-SPEC.md"
    provides: "the binding FLOOR-12 contract: Rules 0/1/2, the frozen glyph set, the containment ladder, the completeness bar"
  - path: ".planning/phases/01-finish-the-floor/01-15-SUMMARY.md"
    provides: "CDP Emulation.setDeviceMetricsOverride as the only route that moves an Electron layout viewport; the orphaned-lineHeight re-scan"
  - path: ".planning/phases/01-finish-the-floor/01-16-SUMMARY.md"
    provides: "classify by ENCLOSING style object, not physical line; the BASE-vs-HEAD differential"
  - path: ".planning/phases/01-finish-the-floor/01-17-SUMMARY.md"
    provides: "accessible names read off the CDP AX tree; the launch-time hive picker as a probe trap"
  - path: ".planning/phases/01-finish-the-floor/01-18-SUMMARY.md"
    provides: "the hoisted-object consumer trap and the BASE-sha differential that found the IDE rail spill"
provides:
  - "The eight highest-density renderer files clear the 14px floor: M1 85 -> 1 occurrence, M1d 1 -> 0, M1x 2 -> 2 (both now evaluate to a minimum of 14)"
  - "This sub-group's frozen Rule 0 allowlist for plan 23: ONE entry, carrying aria-hidden on its own fontSize line"
  - "The three M1-invisible sites closed: a decimal, an SVG ternary, and the composer's zoom-derived size floored on the CONSUMER"
  - "Plan 12's 1024px sidebar collapse verified LIVE at the exact 1024/1023 boundary in the shipped app, at BASE and at HEAD"
affects:
  - "src/renderer/src/components/SkillsTab.tsx: both identity-row name spans gain the house truncation triplet (measured containment fix)"
  - "src/renderer/src/components/MessageQueueComposer.tsx: composerFontSize floored at 14, so composerLineHeight 17 -> 20, minHeight 99 -> 114, maxHeight 306 -> 360"
tech-stack:
  added: []
  patterns:
    - "Classify every fontSize by its enclosing object literal using the REAL TypeScript parser; a hand-rolled string masker silently swallows sites on apostrophes inside JSX text"
    - "A shared-zoom consumer is floored on the CONSUMER, never by raising the shared store's minimum, when the store is a documented user-controlled carve-out"
    - "A glyph with no fontSize of its own takes aria-hidden and NO allowlist entry (01-14 convention 3)"
    - "Probe overflow is classified into designed truncation (nowrap+hidden+ellipsis, -webkit-line-clamp) and real spill, so a designed ellipsis is never reported as a defect and a real spill is never lost in their noise"
key-files:
  created: []
  modified:
    - src/renderer/src/components/SkillsTab.tsx
    - src/renderer/src/components/MessageQueueComposer.tsx
    - src/renderer/src/components/WorkersTab.tsx
    - src/renderer/src/components/MemoryPanel.tsx
    - src/renderer/src/components/MemoryGraphPanel.tsx
    - src/renderer/src/App.tsx
    - src/renderer/src/realtime/CostHud.tsx
    - src/renderer/src/components/AskMeTab.tsx
decisions:
  - "ELECTRON_RUN_AS_NODE=1 was present in the executing shell. Left in, every electron.launch() starts a bare Node with no `app` object and the probe measures nothing. Stripped inside the runner, and named here because a probe that cannot start is indistinguishable from a probe that found nothing."
  - "The composer is floored on the CONSUMER (Math.max(14, useTerminalFontSize())) and MIN_TERMINAL_FONT_SIZE stays 8. Raising the constant would floor a textarea by taking the user's xterm zoom range away, which contradicts UI-SPEC's terminal carve-out."
  - "SkillsTab's two identity-row name spans gain whiteSpace/overflow/textOverflow. MEASURED: at 14px the name's ink printed 7px over the provider chip at 800x600 and up to 68px over it in the catalog list. This is UI-SPEC containment step 1's own cited house pattern (AgentCard.tsx:223-224), not a reflow."
  - "The residual catalog-row spill is containment step 3 -- stop and report. At 14px the two flexShrink:0 catalog chips need 428px in a 368px row on their own; step 2's container integer is `sidebarWidth` in store/store.ts, outside this plan's declared file set, and raising it would not close the class because the chips are sized by unbounded catalog content."
  - "Zero aria-labels added. All 45 controls across the eight files are already named; five icon-only ones carried aria-label already. Proven on the CDP AX tree, unnamedButtons=0 on all 57 harness scans and all 4 shipped-app scans."
metrics:
  duration: "3h20m"
  completed: 2026-08-21
---

# Phase 01 Plan 19: The Eight Highest-Density Renderer Files Summary

Migrated the eight densest remaining renderer files (85 M1 occurrences plus the three sites M1
structurally cannot see) onto plan 14's corrected token layer — and then proved in real Electron 43,
against the BASE sha, that the sweep made a skill name print **over** its provider chip, which no grep
in the plan could see.

---

## 0. Base sha, commits, containment ledger

**Base sha (`git rev-parse HEAD` at task 1):** `86827cb68aa813ccee94d9cc3bc54ed2b121feca`

| # | sha | message |
|---|-----|---------|
| 1 | `b7c58c4` | `feat(01-19): sweep the eight densest renderer files to the 14px floor` |
| 2 | `af8f202` | `fix(01-19): stop the skill name painting over its chip at Rule 1's 14px` |

```
-- af8f202
 src/renderer/src/components/SkillsTab.tsx | 26 ++++++++++++++++++++++++--
 1 file changed, 24 insertions(+), 2 deletions(-)
-- b7c58c4
 src/renderer/src/App.tsx                           | 19 +++++-----
 src/renderer/src/components/AskMeTab.tsx           | 27 ++++++++-----
 src/renderer/src/components/MemoryGraphPanel.tsx   | 22 ++++++-----
 src/renderer/src/components/MemoryPanel.tsx        | 19 +++++-----
 .../src/components/MessageQueueComposer.tsx        | 44 +++++++++++++---------
 src/renderer/src/components/SkillsTab.tsx          | 34 ++++++++---------
 src/renderer/src/components/WorkersTab.tsx         | 20 +++++-----
 src/renderer/src/realtime/CostHud.tsx              | 21 ++++++-----
 8 files changed, 114 insertions(+), 92 deletions(-)
```

**Containment, all three clauses, path-scoped so they survive five concurrent wave-mates:**

**(a) per-commit allowlist filter — the one that catches a genuine cross-set edit.**
```
BASE=86827cb...; SHAS=$(git log --format=%H "$BASE"..HEAD -- <the eight paths>)
  -> af8f202fe875058448f54944f3a6308c6578f561
     b7c58c4db0085591b3fb9d5469228c184e53e2be
echo "$SHAS" | grep -c .   -> 2          (floor is 1; an executor that committed nothing cannot pass)
for sha in $SHAS; do git show --name-only --format= "$sha"; done | sort -u | grep -vE "<the eight>?$"
  -> (no output)                          PASS
```

**(b) path-scoped and positive — the declared set actually moved.**
```
git diff --name-only "$BASE"..HEAD -- <the eight paths> | sort -u | grep -c .   -> 8
src/renderer/src/App.tsx
src/renderer/src/components/AskMeTab.tsx
src/renderer/src/components/MemoryGraphPanel.tsx
src/renderer/src/components/MemoryPanel.tsx
src/renderer/src/components/MessageQueueComposer.tsx
src/renderer/src/components/SkillsTab.tsx
src/renderer/src/components/WorkersTab.tsx
src/renderer/src/realtime/CostHud.tsx
```

**(c) nothing left behind.** `git status --porcelain -- <the eight paths>` → empty.

No repo-wide M1 total is recorded anywhere in this document. The repo-wide bar is plan 23's.

---

## 1. The counts — occurrences, the unit named

Measured with the pinned M1, counted with `grep -hoE … | wc -l` (**occurrences**, the unit plan 23
asserts in wave 9). For these eight files occurrences and lines were equal both before and after.

| File | M1 before (occ) | M1 after (occ) | allowlist size | Δ |
|---|---|---|---|---|
| `components/SkillsTab.tsx` | 16 | **0** | 0 | −16 |
| `components/MessageQueueComposer.tsx` | 16 | **0** | 0 | −16 |
| `components/WorkersTab.tsx` | 10 | **0** | 0 | −10 |
| `components/MemoryPanel.tsx` | 9 | **0** | 0 | −9 |
| `components/MemoryGraphPanel.tsx` | 9 | **0** | 0 | −9 |
| `App.tsx` | 9 | **0** | 0 | −9 |
| `realtime/CostHud.tsx` | 8 | **0** | 0 | −8 |
| `components/AskMeTab.tsx` | 8 | **1** | **1** | −7 |
| **total** | **85** | **1** | **1** | **−84** |

The plan's baseline of 85 (16/16/10/9/9/9/8/8) was re-measured against live source at task 1 and was
**exact** — plans 10 and 12 had edited `MemoryPanel.tsx` and `App.tsx` after the 01-14 measurement,
and neither changed the count. **Delta from the plan's baseline: zero.**

For every file `post-sweep M1 == allowlist size`, which is the completeness bar's clause 2 restricted
to this sub-group.

### This sub-group's FROZEN Rule 0 allowlist — for plan 23

```
[
  'src/renderer/src/components/AskMeTab.tsx:195'
]
```

**One entry.** It is `<span aria-hidden="true" style={{ fontSize: 13 }}>✕</span>` — the dismiss glyph
inside the ASK-ME card header. The `aria-hidden` and the local `fontSize` override are on **one line**,
on a **span inside** the button, never on the focusable button, which keeps its
`aria-label="dismiss this ask"` (01-14's convention, copied verbatim — `aria-hidden` on a focusable
element strips its accessible name while leaving it tabbable, which is axe `aria-hidden-focus`).

**AskMeTab's second exempt glyph, the tree elbow `└` (:258), gets `aria-hidden="true"` and NO
allowlist entry.** It has no `fontSize` of its own — it rides its swept row, now 14px — and 01-14's
handoff item 3 is explicit: do not invent a sub-14px override just to have something to allowlist.

M3, scoped to these eight files with `LC_ALL=C.UTF-8`, returned exactly **2** candidates:
```
src/renderer/src/components/AskMeTab.tsx:192:              >✕</button>
src/renderer/src/components/AskMeTab.tsx:251:                      <span style={{ color: 'var(--cth-ink-300)' }}>└</span>
```
Both are on UI-SPEC's 30-candidate table under `AskMeTab.tsx` (`✕`, `└`) — the confirmed exempt list
for this group. **None of the four NOT-exempt cases has moved into it**: all four remain in plan 17's
files (`TasksKanban.tsx:198` `—`, `triggers/ui.tsx:348` `%`, `TasksKanban.tsx:263` `?`,
`IntegrationsRegistry.tsx:293` `.`).

---

## 2. The three sites M1 cannot see, and their evaluated minimums

**M1d before:** 1 hit. **M1d after: 0.**
```
BEFORE  src/renderer/src/components/SkillsTab.tsx:254:fontSize: 10.5
AFTER   (no output)
```

**M1x before:** 2 hits. **M1x after: 2** — and that is correct, not a miss. This plan's own prescribed
fixes leave M1x hits *by construction* (a ternary of tokens is still `fontSize: isTopic`; a
`Math.max(14, …)` is still an identifier). The bar is per-hit: every surviving hit's **evaluated
minimum** is at least 14.

| Site | Before | Evaluated min before | After | Evaluated min after |
|---|---|---|---|---|
| `SkillsTab.tsx:254` | `fontSize: 10.5` | **10.5** | `fontSize: 'var(--cth-text-mono-md)'` + `lineHeight: 'var(--cth-lh-mono)'` | **14** |
| `MemoryGraphPanel.tsx:335` | `fontSize: isTopic ? 12 : 11` | **11** | `fontSize: isTopic ? 'var(--cth-text-mono-md)' : 'var(--cth-text-body-md)'` | **14** (both branches) |
| `MessageQueueComposer.tsx:363` | `fontSize: composerFontSize` | **8** | `const composerFontSize = Math.max(14, useTerminalFontSize())` (`:71`) | **14** |

Each closed and asserted on its own, because no M1 count can gate any of them:
```
grep -cE "fontSize: 10\.5"                     SkillsTab.tsx           -> 0   (was 1)
grep -cE "fontSize: isTopic \? 12 : 11"        MemoryGraphPanel.tsx    -> 0   (was 1)
grep -cE "const composerFontSize = useTerminalFontSize\(\);"  MQComposer.tsx -> 0   (was 1)
grep -nE "const composerFontSize = "           MQComposer.tsx
  -> 71:  const composerFontSize = Math.max(14, useTerminalFontSize());
grep -c "MIN_TERMINAL_FONT_SIZE = 8"           terminalFontSize.ts     -> 1   (UNCHANGED)
```

**The MemoryGraphPanel ternary deliberately gained no `lineHeight`.** It sizes an SVG `<text>`, where
`lineHeight` does nothing; adding one would be decoration in a file the lint gate is about to cover.
The line below it, `truncate(n.label, isTopic ? 20 : 16)`, was checked against UI-SPEC's ladder in
order: SVG node labels are `textAnchor="middle"` inside a `pointerEvents="none"` layer with no
clipping box, and the live probe reports **overflow 0** on `memorygraph` and `memorygraph_topics` at
all three viewports, at BASE and at HEAD. Step 1 applies — nothing.

**The composer floor is on the consumer, and the carve-out kept its meaning.** `MIN_TERMINAL_FONT_SIZE`
is still `8` (asserted above). Raising it to 14 would have floored a **textarea** by removing two zoom
steps from **xterm**, which is precisely what UI-SPEC's carve-out protects. `composerLineHeight`,
`minHeight` and `maxHeight` all derive from the floored value — their deltas are in §5.

---

## 3. What each rule touched, and the cross-check that proves the classification

Every `fontSize` was classified by its **enclosing object literal**, resolved with the real TypeScript
parser (`ts.createSourceFile` → nearest `ObjectLiteralExpression`), not by its physical line.

> **A hand-rolled masker is not good enough, and this is how that was caught.** The first classifier
> blanked strings and comments with a character scanner. It reported **5 sites in `MemoryPanel.tsx`
> and 8 in `App.tsx`** — against M1's 9 and 9. The missing seven were swallowed when an apostrophe in
> JSX text (`isn't`, `agent&rsquo;s`, `Michael is clocking in… he's`) opened a "string" that ran for
> hundreds of lines. Cross-checking the classifier's site count against M1's per-file count is what
> exposed it; the TS parser then agreed with M1 exactly, file for file.

| Rule | Sites | Token pair |
|---|---|---|
| **Rule 0** (exempt glyph) | 1 (+1 glyph with no size of its own) | size unchanged, `aria-hidden="true"` |
| **Rule 1** (display face, SIZE ONLY) | **12** | `--cth-text-display-md` + `--cth-lh-display-md` |
| **Rule 2** (body) | 55 | `--cth-text-body-md` + `--cth-lh-body-md` |
| **Rule 2 mono** (object sets `--cth-font-mono`) | 18 | `--cth-text-mono-md` + `--cth-lh-mono` |

**The Rule 1 cross-check (01-16's).** The Rule 1 count must equal the sum of the eight files'
`grep -c cth-font-display`, and every one of those counts must be unchanged from BASE — Rule 1 is
size-only and Press Start 2P stays everywhere.

| File | `cth-font-display` at BASE | now | Rule 1 sites here |
|---|---|---|---|
| `SkillsTab.tsx` | 3 | **3** | :27 Chip, :243 name, :321 catalog name |
| `MessageQueueComposer.tsx` | 3 | **3** | :196 DROP TO ATTACH, :204 QUEUE, :668 Set up dictation |
| `WorkersTab.tsx` | 0 | **0** | — |
| `MemoryPanel.tsx` | 1 | **1** | :186 Search language |
| `MemoryGraphPanel.tsx` | 0 | **0** | — |
| `App.tsx` | 2 | **2** | :281 WAKING THE FLOOR, :296 NO AGENT SELECTED |
| `CostHud.tsx` | 1 | **1** | :36 Spend cap label |
| `AskMeTab.tsx` | 2 | **2** | :230 VIEW N EARLIER ANSWERS, :242 BLOCKING N DOWNSTREAM |
| **total** | **12** | **12** | **12** |

12 = 12. **Rule 1b and Rule 3 did not apply to this group**, as the plan states.

**Line-height convention** (01-14 §5, applied uniformly): a `px` line-height became its token; a
**unitless** one was left alone (`1.45` ×2 in SkillsTab, `1.5` and `1.6` in MemoryPanel, `1` on App's
theme button — five sites); an absent one gained the paired token.

**The orphaned-lineHeight re-scan (01-15's finding), run AFTER the sweep.** Three `lineHeight: 'NNpx'`
survive in these eight files, and all three belong to sites that were already **at or above** 14 and
so were never swept: `MemoryPanel.tsx:116` `'20px'` (plan 10's scope warning, already
`var(--cth-text-body-md, 14px)`, and 20px *is* `--cth-lh-body-md`), and `AskMeTab.tsx:201` `'19px'` /
`:216` `'18px'` on the two 15px question/answer boxes. No 14px text sits in a sub-14px line box.

**Hoisted style objects — the consumer map, derived by grep from live source, never from the plan.**

| Object | Consumers | Any glyph consumer? |
|---|---|---|
| `WorkersTab.tsx:40` `metaRow` (mono 11) | `:131`, `:160` | no — both are text rows |
| `WorkersTab.tsx:44` `sectionHead` (ui 12) | `:93`, `:150` | no |
| `SkillsTab.tsx:143` `actionBtn()` (ui 11) | `:258` open folder, `:270` delete X?, `:273` cancel, `:279` uninstall, `:322` install, `:328` learn more — **six** | no — all six are text buttons |
| `SkillsTab.tsx:156` `tabBtn()` (ui 12) | `:171`, `:174` | no |
| `MemoryGraphPanel.tsx:524` `iconBtn` (ui 12) | `:190` (`<Icon/> refresh`) | no — the icon is an SVG, the label is text |
| `MemoryGraphPanel.tsx:530` `tipTitle` (ui 12) | `:374`, `:386`, `:393`, `:408` | no |
| `MemoryGraphPanel.tsx:533` `tipBody` (11) | `:379`, `:387`, `:394`, `:403`, `:412` | no |
| `CostHud.tsx:26` `wrap` (mono 12) | `:105` | no |
| `CostHud.tsx:34` `labelStyle` (display 8) | `:107` Spend cap | no |
| `CostHud.tsx:41` `capInputStyle` (mono 12) | `:120` the number input | no |

**Explicit answer: NO hoisted object in these eight files serves both a text consumer and a glyph
consumer.** Every declaration was swept normally and no local override was created for a hoisted
object. (`SkillsTab.tsx:346` `rowStyle` and `WorkersTab.tsx:36` `card` carry no `fontSize` at all and
are not sweep targets; `card` is spread at `:103` under an inline `fontSize` which *is* a target and
was swept.) The plan predicted this and the prediction held — the mixed case in this pair is
`FullscreenFileEditor.tsx:59`, in plan 20's set.

**`eslint-disable-next-line`:** `MemoryGraphPanel.tsx` carries exactly **one**, recorded at task 1 on
line **108**, immediately above its target on **109**. After the sweep it is still on **108/109**:
```
108:    // eslint-disable-next-line react-hooks/exhaustive-deps
109:  }, [structKey, pinnedKey, dims.w, dims.h, godId]);
```
`src/renderer/src/ide/monaco.ts` was not touched (it is not in this group).

---

## 4. Accessible names — the rule, not the ratio. Zero added, and that is the correct outcome.

**Inventory across the eight files: 30 native `<button>` + 15 `<PixelButton>` = 45 controls.**

| File | native | Pixel | ICON-ONLY | already named |
|---|---|---|---|---|
| `SkillsTab.tsx` | 8 | 1 | 0 | all 9 have visible text |
| `MessageQueueComposer.tsx` | 9 | 3 | **3** (`<Icon name="x"/>` ×2, `<Icon name="info"/>`) | `:325`, `:526`, `:647` aria-label ✓ |
| `WorkersTab.tsx` | 0 | 1 | 0 | `stop` / `stopping…` |
| `MemoryPanel.tsx` | 2 | 4 | 0 | all 6 have visible text |
| `MemoryGraphPanel.tsx` | 2 | 0 | 0 | `refresh`, `topics` |
| `App.tsx` | 6 | 5 | **2** (`☀`/`☾`, the wrench) + 1 (`ExpandGlyph`) | `:370`, `:389`, `:416` aria-label ✓ |
| `CostHud.tsx` | 0 | 0 | 0 | — |
| `AskMeTab.tsx` | 3 | 1 | **1** (`✕`) | `:182` aria-label ✓ |

Every icon-only control already carried an `aria-label`; every other control has visible text. Adding
one to a button with visible text **overrides** the visible label and is the anti-pattern UI-SPEC bans
— so **nothing was added, and nothing was manufactured to raise a count.** Same call as 01-14's
AgentStrip, 01-15, 01-18, 01-10's README and 01-04's CONTRIBUTING.md.

**Proven live on the AX tree, never by grep.** `Accessibility.getFullAXTree` over every scan:
`unnamedButtons = 0` on **all 57** harness scans (up to **27 buttons** visible at once on
`skills/browse`) and on **all 4** shipped-app scans. The shipped app's live button-name list at 800×600:
```
["Version 0.4.4 — check for updates", "Toggle dark mode", "Settings",
 "Toggle fullscreen terminal", "add agent", "show panel",
 "Michael (boss) — idle — Auto mode — Michael runs with permissions bypassed",
 "🧠 memory", "talk", "Why is Talk disabled?"]
```

**`App.tsx`'s sidebar toggle deliberately has no `aria-label`** — its visible `hide panel` /
`show panel` IS its accessible name, and the AX tree confirms it (`toggleAriaLabel: null`,
`toggleLabel: "show panel"`). `grep -c aria-expanded src/renderer/src/App.tsx` is **3**, unchanged
from BASE.

---

## 5. Container integers — one changed, and it is derived, not hand-set

| Site | Integer | Before | After | Δ | Why |
|---|---|---|---|---|---|
| `MessageQueueComposer.tsx:72` | `composerLineHeight = round(fontSize × 1.4)` | 17 | **20** | +3 | derives from the 14px floor; 20 is exactly `--cth-lh-mono` |
| `MessageQueueComposer.tsx:356` | `minHeight = lineHeight × 5 + 14` | 99 | **114** | +15 | derived, five visible lines preserved |
| `MessageQueueComposer.tsx:357` | `maxHeight = lineHeight × 18` | 306 | **360** | +54 | derived, eighteen visible lines preserved |

All three are **derived** from `composerFontSize`; no literal was hand-edited, and the box still holds
the same number of visible lines it was designed to hold. Every other fixed integer in the group was
inspected and deliberately left alone: `MessageQueueComposer.tsx:277` `maxHeight: 280` (the queue
scroller, `overflowY:'auto'`), `:484` `maxHeight: 220` (expanded-body cap, `overflowY:'auto'`), `:567`
`HINT_W = 244`, `:320` `maxWidth: 180`; `MemoryGraphPanel.tsx:444` `W = 240` (tooltip),
`:432` `maxWidth: 280` (legend); `MemoryPanel.tsx:81` `width: 380`, `:244` `maxHeight: '40vh'`;
`App.tsx:453` `width: 400`, `:496` `width: 360`, `:374` `28×28` (theme button). **Twelve inspected,
one family of three moved, and all three move because the floor moved them.**

---

## 6. A GREEN GREP IS NOT A GREEN PIXEL — the live probe and the BASE differential

A throwaway harness mounted the **real components** from `src/renderer/src` with the **real**
`global.css`/`tokens.css` and the **real** three-font stack, inside **real Electron 43.4.1**, driven by
Playwright `_electron`. Viewports were moved with **CDP `Emulation.setDeviceMetricsOverride`** — the
only route that moves an Electron layout viewport (01-15) — and `window.innerWidth` was read back on
every single scan, so **no narrow claim here rides a 1280px layout**: `inner` equals `req` on all 57.
The harness was **deleted before the SUMMARY commit**; `git status --porcelain | grep -iE "probe|results-"`
returns nothing and `e2e/` contains only `smoke.spec.ts`.

> **The trap that would have made every number in this section a fiction.**
> `ELECTRON_RUN_AS_NODE=1` is exported in this executor's shell. With it set, `electron.launch()`
> starts a **bare Node** — no `app`, no window — and the run dies with
> `TypeError: Cannot read properties of undefined (reading 'commandLine')`. It is the same variable
> `e2e/smoke.spec.ts` deletes in `sandboxEnv()` for the same reason. Stripped explicitly inside both
> runners. Recorded because "the probe would not start" and "the probe found nothing" look identical
> in a SUMMARY.

**19 states × 3 real viewports × 2 shas = 114 component scans, and `missing: []` on all 114.** Every
state asserts a list of marker strings that must be in `document.body.innerText`; a non-empty
`missing` invalidates the scan.

### Sub-14px rendered text nodes, BASE → HEAD

| surface / state | scans | texts | buttons | sub14 BASE→HEAD | overflow BASE→HEAD | unnamed |
|---|---|---|---|---|---|---|
| `skills/installed` | 3 | 25 | 8 | 72 → **0** | 0 → 0 | 0 |
| `skills/confirm-delete` | 3 | 28 | 9 | 81 → **0** | 0 → 0 | 0 |
| `skills/browse` | 3 | 84 | 27 | 249 → **0** | 3 → 18 | 0 |
| `skills/browse-error` | 3 | 85 | 27 | 252 → **0** | 3 → 18 | 0 |
| `workers/live+preserved` | 3 | 40 | 2 | 114 → **0** | 0 → 0 | 0 |
| `askme/waiting` | 3 | 45 | 4 | 123 → **3** | 0 → 0 | 0 |
| `askme_empty/empty` | 3 | 2 | 0 | 6 → **0** | 0 → 0 | 0 |
| `composer/queued` | 3 | 12 | 8 | 27 → **0** | 0 → 0 | 0 |
| `composer/expanded` | 3 | 12 | 8 | 27 → **0** | 0 → 0 | 0 |
| `composer_paused/paused+attach` | 3 | 16 | 11 | 39 → **0** | 0 → 0 | 0 |
| `composer_paused/dictation-hint` | 3 | 30 | 12 | 81 → **0** | 0 → 0 | 0 |
| `costhud/idle` | 3 | 4 | 0 | 12 → **0** | 0 → 0 | 0 |
| `costhud_live/over-cap` | 3 | 10 | 0 | 30 → **0** | 0 → 0 | 0 |
| `memorypanel/open` | 3 | 13 | 5 | 21 → **0** | 0 → 0 | 0 |
| `memorypanel/searched` | 3 | 14 | 5 | 24 → **0** | 0 → 0 | 0 |
| `memorypanel_absent/not-installed` | 3 | 9 | 2 | 12 → **0** | 0 → 0 | 0 |
| `memorygraph/graph` | 3 | 14 | 2 | 42 → **0** | 0 → 0 | 0 |
| `memorygraph/node-tooltip` | 3 | 20 | 2 | 57 → **0** | 0 → 0 | 0 |
| `memorygraph_topics/topics-on` | 3 | 19 | 2 | 57 → **0** | 0 → 0 | 0 |
| **TOTAL** | **57** | — | — | **1326 → 3** | **6 → 36** | **0** |

**All 3 HEAD residuals are the same node**, once per viewport:
`{"px":13,"lh":"13px","text":"✕","tag":"span","hidden":true}` — the allowlist entry, and
`hidden: true` is read from `closest('[aria-hidden="true"]')` on the live DOM, not from source.

### The positive control earned its keep — five times

A clean sub-14px scan over a branch that never rendered is worth nothing. Five states came back
vacuous on the first run and were fixed until they mounted:

1. **`memorypanel` scanned the collapsed PILL** — `texts: 1`, every marker missing. `MemoryPanel`
   renders a button until it is opened. One click → `texts: 13`, five buttons, the scope warning, the
   model chooser and `Search language` all on screen.
2. **`memorypanel/searched` never rendered the `<pre>` result box** — `run()` bails on an empty query,
   so one of this file's swept sites (`:246`, mono) was never measured. Typing first fixed it.
   The stub also had to return `{ ok, output }`, not a bare string: the wrong shape rendered
   `Couldn't search: undefined`, which is 1 text node and would have counted as "mounted".
3. **`composer_paused` never showed `held — delivery paused floor-wide`** — that branch needs an
   **idle** agent; a busy one shows the busy hint instead. Attachments needed `attachFiles()` to
   return `{ ok: true, files: [...] }`.
4. **`skills/confirm-delete` and `skills/browse-error` never fired** — `text=uninstall` matched two
   rows and `text=install` also matched the `installed` tab, so both clicks silently no-op'd.
5. **`memorygraph/node-tooltip` never mounted `tipTitle`/`tipBody`/NodeTip** — the nodes are
   `<g><rect>`, not `<circle>`. With one agent the graph had no topic layer at all; five agents with
   shared `**bold**` terms took `topics-on` from `showing 0 of 0` to a real topic layer.

Markers were also compared **case-insensitively** after `Live workers` and `working` came back
"missing": both carry `textTransform: uppercase`, and `innerText` returns the *transformed* text.

### Overflow — classified, not counted

Raw `scrollWidth > clientWidth` flags UI-SPEC containment **step 1** (a designed ellipsis) as loudly
as a real spill, so the probe separates them: an element with `nowrap + overflow:hidden + ellipsis`,
or a `-webkit-line-clamp`, is recorded as `byDesign`. SVG elements are skipped entirely — Chromium's
`clientWidth`/`scrollWidth` on an SVG `<text>` produced a phantom `dx=5` on a node label that has no
box at all.

**Every one of the 36 HEAD overflow records is the SkillsTab catalog row, and they are §7.** Every
other surface is 0 → 0 at all three widths.

---

## 7. THE FINDING — the sweep made a skill name print over its provider chip

No grep in this plan could see it. It was found by building the BASE sha into a second bundle
(M1 over that copy returned exactly **85**, confirming the right bytes were under test) and running
the identical CDP probe against both.

**`SkillsTab.tsx:243` / `:321` — the identity-row name span** (the `fontSize` lines; the three containment properties land at `:252` and `:330`). MEASURED, row width 368px:

| | BASE 11px | HEAD 14px (before the fix) |
|---|---|---|
| `COMMIT HELPER` box | 153px | **81px** (1280/1024), **69px** (800) |
| its ink | 153px — fits | 84px — `dx 3` / **`dx 15`** |
| ink vs the `Claude Code` chip | −8px (clear) | −5px … **+7px INTO the chip at 800×600** |
| `CATALOG SKILL 5` (browse) | `dx 30` — already spilling | `dx 98`, name box **0px** |

The cause is 01-14 handoff trap #4 exactly: the name is `flex: 1` + `minWidth: 0` while **every**
sibling chip is `flexShrink: 0`. Press Start 2P is ~1em per character, so Rule 1's 11→14px widens the
chips by 27% and squeezes the name's box below its own longest word — and with no overflow control the
ink simply paints across.

**Fixed at source, in its own atomic commit `af8f202`**, with UI-SPEC containment step 1's own cited
house pattern — `whiteSpace:'nowrap' + overflow:'hidden' + textOverflow:'ellipsis'`, the three
properties the containment section names at `AgentCard.tsx:223-224` ("horizontal growth truncates by
design"). Nothing was reflowed, moved, dropped or held below 14px, and no container integer changed.

**After, over the same probe:** `skills/installed` and `skills/confirm-delete` report **overflow 0** at
all three widths (was 1 each), and the **pre-existing** BASE spill — `CATALOG SKILL 5` already printed
30px over its chip at 11px, before this plan ran — is closed by the same three properties. Reported,
not claimed as mine.

### The residual, and it is containment step 3 — STOP AND REPORT, not fixed

**`SkillsTab.tsx:319-336`, the BROWSE identity row.** The catalog's two chips are `flexShrink: 0` and
sized by **unbounded catalog content**, and at 14px they no longer fit the column on their own:

| row | chip 1 | chip 2 | + gap | vs row 368px | row spill |
|---|---|---|---|---|---|
| `CATALOG SKILL 5` | `engineering` 170 | `abubakarsiddik31` 242 | 428 | **−60** | **`dx 61`** |
| `CATALOG SKILL 1` | `engineering` 170 | `anthropics` 156 | 342 | +26 | `dx 51` (card) |
| `CATALOG SKILL 2` | `writing` 113 | `abubakarsiddik31` 242 | 371 | −3 | `dx 3` |
| `CATALOG SKILL 11` | `research` 127 | `abubakarsiddik31` 242 | 385 | −17 | `dx 8` / `dx 18` |

On the two negative rows the name box collapses to **0px** — the field disappears, which is 01-14's
warning in full. At BASE the worst chip pair was 304+16=320 against 368, so this is new.

**Why the ladder stops here.** Step 1 does not apply (nothing on that row truncates, and the ellipsis
now on the name cannot make room that the chips have already taken). **Step 2 is not available:** the
only container integer in play is `sidebarWidth`, whose default lives in
`src/renderer/src/store/store.ts` — **outside this plan's declared `files_modified`**, so editing it is
exactly the cross-set edit threat T-P19-06 exists to prevent, and 01-18's `treeWidth` precedent worked
only because that integer was in its own file. It would not close the class either: the chips are
content-sized, so any fixed column can be overrun by a longer publisher handle. That is
"if the answer looks like redesign it, it is option 3".

**Filed as a blocker in STATE.md and in `deferred-items.md`.** The one-line evaluation for whoever
takes it: give `SkillsTab.tsx`'s `Chip` the same truncation contract the name now has
(`flexShrink: 1, minWidth: 0` + the triplet), or cap `PROVIDER_LABEL`/category/owner at render — both
are content decisions this plan has no authority to take.

### App.tsx is the SHELL, so it was measured in the SHIPPED APP

The component harness cannot render the titlebar, the empty-floor dialog or plan 12's collapse. So
`App.tsx` was driven in the **real built app** (`out/main/index.js`, `npm run build` exit 0), in a
sandbox copied from `e2e/smoke.spec.ts`, at **1280×900 / 1024×768 / 1023×768 / 800×600** — the last two
straddling plan 12's boundary — at BASE and at HEAD (8 runs).

**The positive control caught this one too.** The first run reported `sub14: []`, `overflow: []`,
`texts: 6` and a perfectly clean shell — while the window was showing **`SELECT A HARNESS CONFIG`**,
the launch-time hive picker (plan 16's file). The seeded config had no `harnessHome`, so the picker had
no *open this config* button at all and the "click" matched *open existing config…*, which opens an OS
dialog. Seeding a hive and asserting `stillPicker === false` on every run fixed it. This is 01-17's
exact failure, reproduced and caught.

| | BASE | HEAD | closed here |
|---|---|---|---|
| 1280×900 | sub14 **12** | **8** | `auto mode on` 13px, `☾` 13px, `🧠 memory` 12px, `QUEUE` 9px |
| 1024×768 | sub14 **12** | **8** | same four |
| 1023×768 | sub14 **5** | **2** | `auto mode on`, `☾`, `🧠 memory` |
| 800×600 | sub14 **5** | **2** | same three |

**Every HEAD residual is attributed mechanically, and not one is in this plan's files:**
`v` + `0.4.4` at 13px → `UpdateBadge.tsx:76` (**plan 20's**, 1 occurrence in 01-14's handoff);
`live · pty` + `pty-god` at 12px → `PtyTerminalView.tsx:388` (**plan 20's**, and the terminal
carve-out); `−` / `12` / `px` / `+` at 12px → `PtyTerminalView.tsx:34`, the xterm zoom control (same).

**Shell overflow is BYTE-IDENTICAL at BASE and HEAD** — the same three records at the same paths:
the Pixi office-floor `<canvas>` wrapper (`dy 5`), xterm's own zero-sized helper container
(`dx 7`, `dy` tracking terminal rows), and the titlebar sprite `<canvas>` (`dy 6`). **Zero container
regressions in the shell.** `unnamedButtons` = 0 at both shas, all four widths, with 28 buttons visible
at 1280.

### Plan 12's collapse, verified at the exact boundary — live, both shas

Read off the DOM, not asserted from source:

| viewport | toggle present | label | `aria-label` | `aria-expanded` | toggle fontSize | texts / buttons |
|---|---|---|---|---|---|---|
| 1280×900 | **no** (sidebar is the right column) | — | — | — | — | 38 / 28 |
| **1024×768** | **no** — sidebar still docked | — | — | — | — | 38 / 28 |
| **1023×768** | **yes** — collapsed to overlay | `show panel` | **null** | `false` | **14px** | 14 / 10 |
| 800×600 | **yes** | `show panel` | **null** | `false` | **14px** | 14 / 10 |

Identical at BASE and at HEAD. The boundary flips between 1024 and 1023, exactly as
`sidebarLayout(vpWidth, …)` intends. `aria-label: null` is the live proof that **the visible label is
the accessible name** — no `aria-label` was added to that toggle, and the AX tree names it
`"show panel"`.

### What the probe does and does not cover

**Covers:** the real components, the real stylesheets, the real fonts (`document.fonts.check` returned
`true` for every family a given surface actually uses), real Chromium layout, computed `fontSize` on
real text nodes, real `scrollWidth`/`clientWidth` overflow, real accessible names off the CDP AX tree —
in the same Electron the app ships; plus the **whole shipped app** for `App.tsx`.

**Does not cover:** the main process and IPC on the component surfaces (stubbed), and real on-disk
hive/skill/worker state. The sidebar column width (420px) was reproduced from 01-18's live measurement
of the shipped app rather than inherited from it. **A human eye on finished pixels is NOT claimed** —
see §10.

---

## 8. The landed work this sweep had to leave alone — verified intact

| Owner | What | Evidence |
|---|---|---|
| **plan 10** | `MemoryPanel.tsx`'s FTS5 recall UI and the `scope` sharing-model warning | `:114` still `fontSize: 'var(--cth-text-body-md, 14px)'` with `lineHeight: '20px'` — **not** normalised back down and **not** re-tokenised; the classifier skipped it as non-numeric. Both the warning and the search box render live: `memorypanel/open` finds `Memory is shared`, `memorypanel/searched` finds the result box. |
| **plan 12** | `App.tsx`'s 1024px collapse, the overlay and the `aria-expanded` toggle | `grep -c aria-expanded App.tsx` = **3**, unchanged; `:557` still `fontSize: 'var(--cth-text-body-sm)'`, untouched; no `aria-label` added; the live boundary table above. |
| **plan 05** | `AskMeTab.tsx`'s `useHiveTasks` call and its deliberate local optimistic `useState` in `dismiss` | `grep -c useHiveTasks AskMeTab.tsx` = **3** (import, comment, call at `:58`). The `dismiss` `useState` was not touched — the sweep changed only `fontSize`/`lineHeight` and the two `aria-hidden` spans. |
| **plan 21** | `MemoryGraphPanel.tsx`'s `react-hooks/exhaustive-deps` suppression | still on **108**, target on **109**. |
| **plan 23** | `PixelButton.tsx` byte pin | not touched; no caller tries to pass it an `aria-label`. |
| **UI-SPEC** | the terminal carve-out | `MIN_TERMINAL_FONT_SIZE = 8` count is **1**, unchanged. `terminalFontSize.ts` was never in the working tree diff. |

---

## 9. Verification

| Check | Before | After |
|---|---|---|
| `npm run typecheck` | 0 | **0** |
| `npm test` exit | 0 | **0** |
| TAP `# tests` | 515 | **515** |
| TAP `# pass` | 511 | **511** (not lower) |
| TAP `# fail` | 0 | **0** |
| TAP `# skipped` | 4 | **4** (not higher) |
| TAP `# todo` | 0 | **0** |
| `npm run build` | — | **0** (`✓ built in 32.70s`) |
| `npm run e2e` (real Electron 43) | — | **2 passed** |

TAP was written through `mktemp`, never a fixed repo-root name — six plans run concurrently in wave 7
against one working tree and a shared `sweep.tap` would be truncated under the others' feet.

> **The plan's stated baseline of `426/422/0/4/0` is stale.** Measured live at task 1 the suite is
> `515/511/0 fail/4 skipped/0 todo`, which matches the CI pointer in this wave's prior state. The gate
> was applied against the **measured** baseline, not the written one: `# fail` and `# todo` at 0,
> `# skipped` not above 4, `# pass` not below 511. This plan adds no tests, so any rise in `# skipped`
> would be a red test being hidden.

`npm run e2e` boots the real app and drives onboarding to a first PTY spawn. It does **not** cover any
of this plan's eight surfaces — that is what §6 and §7 are for.

---

## 10. Deviations from plan

### Auto-fixed

**1. [Rule 1 — Bug] The skill name printed over its provider chip at Rule 1's 14px**
- **Found during:** task 2, by the BASE-vs-HEAD Electron differential
- **Issue:** measured `dx 15` and **7px of ink inside the chip** at 800×600 (installed), up to 68px
  and a 0px name box (catalog)
- **Fix:** UI-SPEC containment step 1's cited house pattern on both name spans
- **Files:** `src/renderer/src/components/SkillsTab.tsx` (`:242-253` installed, `:320-331` catalog)
- **Commit:** `af8f202`

**2. [Rule 3 — Blocking] `ELECTRON_RUN_AS_NODE=1` in the executor's shell**
- Every `electron.launch()` started a bare Node. Stripped inside both probe runners, the same fix
  `e2e/smoke.spec.ts` already carries. No repo file changed.

**3. [Rule 1 — Bug, in the executor's own tooling] the first classifier lost 7 sites**
- A hand-rolled string masker swallowed sites on apostrophes in JSX text. Replaced with the real
  TypeScript parser and cross-checked against M1 per file. No repo file changed. Recorded because the
  sweep would otherwise have been silently incomplete in `MemoryPanel.tsx` and `App.tsx` with every
  grep green.

### Reported, NOT fixed — containment step 3

**The SkillsTab catalog identity row spills 3–61px at 14px** (`SkillsTab.tsx:319-336`). Full
measurement in §7. Step 2's container integer is outside this plan's file set and would not close the
class. Filed as a STATE blocker and a deferred item.

### must_haves truths

| # | Truth | Verdict |
|---|---|---|
| 1 | No user-facing text below 14px except allowlisted decorative glyphs | **SATISFIED** — M1 85→1, the 1 IS the allowlist; live sub14 1326→3 across 57 scans, all 3 the same `aria-hidden` `✕`; the shipped-app shell's residuals all attributed to plan 20's files |
| 2 | Every icon-only button named; no button with visible text gained an `aria-label` | **SATISFIED** — `unnamedButtons=0` on 61 AX-tree scans; zero labels added |
| 3 | Plan 12's collapse, plan 10's scope warning and plan 05's `useHiveTasks` all survive | **SATISFIED** — §8, with the collapse proven live at the 1024/1023 boundary |
| 4 | Nothing reflowed, moved, dropped, or held below 14px to make room | **SATISFIED** — no field moved or dropped, no row collapsed, no site held below 14; the one containment change is an ellipsis, and the residual is reported rather than reflowed |
| 5 | The three M1-invisible sites are at or above 14, and M1d/M1x are clean over this group | **SATISFIED** — §2; M1d 1→0, and both surviving M1x hits carry an evaluated minimum of 14 |

### MEASUREMENT UNAVAILABLE

**The operator visual check.** A human must open the skills tab (both *installed* and *browse*), the
workers tab, the memory panel, the memory graph, the message-queue composer, the ask-me tab and the
cost HUD in the dev app, and confirm nothing is clipped and the sidebar collapse still works either
side of 1024. Everything a machine can measure **was** measured — 57 mounted component scans plus 8
shipped-app scans, three real CDP viewports, two shas, per-node computed font sizes, real overflow
deltas and AX-tree names. Truths 1–5 are satisfied on that evidence; **the human eye on finished
pixels is not claimed.**

---

## 11. Handoff

- **Plan 23 (wave 9):** this sub-group's frozen allowlist is the one-element array in §1. Its file is
  `AskMeTab.tsx` and the entry is in **`fontSize`-declaration-line space**, which is what M1 reports.
  This plan contributes **−84 occurrences** and **seven files to zero**. No whole-renderer total is
  recorded here.
- **Plan 20:** the shipped-app shell scan attributes `UpdateBadge.tsx:76` (13px) and
  `PtyTerminalView.tsx:34` / `:388` (12px) to your set — they are the only sub-14px text left on the
  floor with the sidebar open.
- **Whoever takes the deferred item:** §7's residual table has the measured deltas.

---

## Self-Check: PASSED

Every claim in this document re-verified against disk after it was written.

**Files** — all 10 claimed present: the 8 modified sources, this SUMMARY, `deferred-items.md`.
**Commits** — `b7c58c4`, `af8f202`, `f126aa6` all found in `git log --oneline --all`.
**The allowlist entry resolves:**
```
sed -n '195p' src/renderer/src/components/AskMeTab.tsx
  ->                 <span aria-hidden="true" style={{ fontSize: 13 }}>✕</span>
```
**Final per-file M1 re-run against live source:** `0 0 0 0 0 0 0 1` — total **1**, equal to the
allowlist size.
**Every other line reference re-resolved** (`MessageQueueComposer.tsx:71/:72/:356/:357/:363`,
`MemoryGraphPanel.tsx:108/:109/:335`, `AskMeTab.tsx:182/:195/:258`, `MemoryPanel.tsx:114-116`,
`App.tsx:370/:389/:416/:557`, `SkillsTab.tsx:243/:252/:321/:330`).

**Corrected during the self-check rather than left wrong** — eight line references drifted because
the sweep and the containment fix moved lines under them: the tree-elbow glyph (`:255` → **`:258`**),
both name spans (`:242`/`:309` → **`:243`/`:321`**, with the containment properties at `:252`/`:330`),
the browse identity row (`:308-313` → **`:319-336`**, corrected in this SUMMARY, in `deferred-items.md`
AND in the STATE blocker), App's plan-12 toggle (`:564` → **`:557`**), the composer's three
`aria-label`s (`:317`/`:518`/`:639` → **`:325`/`:526`/`:647`**), App's three (`:369`/`:388`/`:415` →
**`:370`/`:389`/`:416`**), and four inspected container integers. A `file:line` nobody re-resolved is
a claim, not evidence.
