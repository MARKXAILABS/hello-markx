---
phase: 01-finish-the-floor
plan: 14
subsystem: design-tokens
tags: [floor-12, tokens, typography, accessibility, containment, agent-card, agent-strip, fullscreen-roster, pixi, boot-splash]

requires:
  - phase: 01-finish-the-floor
    provides: "01-12's AgentCard.tsx and FullscreenTerminal.tsx state — the AUTO chip, the model field, the folded aria-labels and the exported shortModel, all verified intact rather than assumed"
  - phase: 01-finish-the-floor
    provides: "01-UI-SPEC.md § FLOOR-12 — the binding sweep rules, the glyph predicate, the three-step containment rule and the completeness bar"
provides:
  - "A type scale with no value below 14px: display-md 12->14, body-sm 13->14, mono-sm 13->14, and --cth-text-display-sm / --cth-lh-display-sm deleted outright"
  - "DESIGN.md §4.1 made self-consistent with DESIGN.md:706 — the display-sm row deleted, display-md at 14/20, and the §4 Display row amended from 8/12/16 to 14/16"
  - "The boot-splash title at 14px in literal px — the first text any user sees, and the one sub-14px site no scan in this phase could reach"
  - "The six sites M1 structurally cannot see, all in FullscreenTerminal.tsx and AgentCard.tsx, floored at 14 (three clamps, two note sizes, one decimal)"
  - "This plan's four files swept: 38 M1 occurrences -> 5, and all 5 survivors are allowlisted decorative glyphs carrying aria-hidden"
  - "PixelButton.tsx:102 made compliant WITHOUT editing the file — its evaluated minimum is now 14px because --cth-text-body-sm is"
  - "The wave-7 handoff: six disjoint file groups covering all 60 remaining M1 files and all 567 remaining occurrences"
affects: [plans 01-15 through 01-20 (their entire sweep surface), plan 01-23's wave-9 completeness bar and repo-claims allowlist, every renderer file that reads a --cth-text-* token]

tech-stack:
  added: []
  patterns:
    - "The token layer is fixed BEFORE any call-site migration, so 604 hardcoded occurrences have something correct to migrate onto"
    - "A deleted token beats a raised one where the token's whole job was 'smallest' — display-sm cannot reappear below the floor because it no longer exists"
    - "Decorative glyph inside a focusable control: aria-hidden goes on a non-focusable <span> wrapping the glyph, never on the button, and that span's local fontSize is the allowlist entry"
    - "Containment integers are moved by a delta MEASURED in a running Electron window (getBoundingClientRect + canvas measureText), not by arithmetic on font metrics"

key-files:
  created: []
  modified:
    - src/renderer/src/design/tokens.css
    - DESIGN.md
    - src/renderer/index.html
    - src/renderer/src/components/AgentCard.tsx
    - src/renderer/src/components/AgentStrip.tsx
    - src/renderer/src/components/ThreadsPanel.tsx
    - src/renderer/src/components/FullscreenTerminal.tsx
    - src/renderer/src/scene/office/ThoughtBubble.ts
    - src/renderer/src/scene/office/ToolBubble.ts

key-decisions:
  - "Fixed the TOKEN LAYER first and in its own commit with its only two consumers, per the operator's root-cause directive — patching call sites against a scale that still declares 8px would have been the surface fix"
  - "Deleted --cth-text-display-sm rather than raising it to 14. A token named 'smallest' that sits at the floor is an invitation to write the next sub-floor value into it; deleting it makes the regression unrepresentable"
  - "aria-hidden goes on a <span> wrapping the glyph, NOT on the button UI-SPEC's Rule 0 literally names. Four of this group's five exempt glyphs ARE the entire content of a focusable <button>, and aria-hidden on a focusable element removes it from the a11y tree while leaving it in the tab order — a control with no name, which is threat T-P14-05 itself. The span carries the local fontSize override, so it is also the allowlist entry UI-SPEC's own hoisted-object rule asks for"
  - "The accessible-name pass found NOTHING to add, and nothing was manufactured to satisfy a count. Every <button> in the four files already has a name; AgentStrip's 'aria-label count must increase' criterion is unsatisfiable on correct code and is reported NOT SATISFIED rather than met by adding a redundant label to a button with visible text (the exact anti-pattern UI-SPEC forbids)"
  - "The card's width was raised 220 -> 322 because the name rendered at ZERO width at the floor — caught by npm run e2e against real Electron, invisible to every grep in this plan, and measured live before being fixed"
  - "The two Pixi labels take FONT_SIZE = 14 exactly as pinned, and the SUMMARY reports that their DESIGNED on-screen size is 14 * RENDER_SCALE = 7px. Reaching a true 14px needs the bubbles re-geometried, which is containment step 3 (stop and report), not step 2"
  - "Requirement row for FLOOR-12 left Pending in REQUIREMENTS.md, matching the 01-02/04/05/06/07/08/09/10/11/12/13 precedent: plan 23 owns the checkboxes, and FLOOR-12 is not closeable until plans 15-20 land anyway"

patterns-established:
  - "Measure containment in the running app. Three of this plan's five container changes were sized by getBoundingClientRect and canvas measureText inside a live Electron window; the one sized by arithmetic alone (the card width) was the one that was wrong"
  - "A green grep is not a green pixel. Every acceptance criterion in this plan passed while the agent card shipped with no name on it"

requirements-completed: []

duration: 1h55m
---

# Phase 01 Plan 14: The type-scale correction and its four coupled files — Summary

The token layer no longer hands out sub-14px sizes, `DESIGN.md` §4.1 stopped contradicting
`DESIGN.md:706`, the boot splash and the six expression-valued sites nobody could scan are at the
floor, this plan's four files are swept to 5 allowlisted glyphs, and wave 7's six executors have
disjoint groups covering every remaining occurrence.

**Base sha:** `ebf21388807d933bee197f3cecedd650dd549ad1`
**Branch:** `gsd/v1.0-milestone` · **CI at `cea311e`: all six jobs green** (Build, Typecheck,
Test ubuntu/macos/windows, Electron smoke).

---

## 1. Measurement — task 1, the pinned commands and their output

### M1 — the sweep surface

```bash
grep -rhoE "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" src/renderer/src --include=*.tsx --include=*.ts | wc -l
grep -rlE  "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" src/renderer/src --include=*.tsx --include=*.ts | wc -l
grep -rcE  "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" src/renderer/src --include=*.tsx --include=*.ts | awk -F: '{n+=$2} END {print n}'
```

| | UI-SPEC (recorded) | **This plan's baseline** (at base sha) | After this plan |
|---|---|---|---|
| M1 **occurrences** (`-o`) | 604 | **605** | **572** |
| M1 files (`-l`) | 61 | **61** | **60** |
| M1 lines (`-c` sum) | 603 | **604** | **571** |

**Delta against UI-SPEC: +1 occurrence.** Waves 5 and 6 (plans 10, 12, 13) edited renderer files
since UI-SPEC was written. **605/61 is this phase's baseline**, not 604/61, and every number below
is against it. The occurrence-vs-line gap is still exactly 1 and still `IntegrationsRegistry.tsx`
carrying two matches on one physical line — verified, not assumed.

### M2 — the display-face subset

```bash
grep -rE "cth-font-display" src/renderer/src --include=*.tsx --include=*.ts | grep -cE "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])"
grep -rn -B2 -A2 "cth-font-display" src/renderer/src --include=*.tsx --include=*.ts | grep -cE "fontSize *[:=] *\{?[7-9]($|[^0-9.])"
grep -rn -B2 -A2 "cth-font-display" src/renderer/src --include=*.tsx --include=*.ts | grep -cE "fontSize *[:=] *\{?1[0-3]($|[^0-9.])"
```

| Variant | UI-SPEC | Before | After |
|---|---|---|---|
| same-line | 104 | **104** | **97** |
| ±2 lines, bucket 7–9 | 79 | **79** | **74** |
| ±2 lines, bucket 10–13 | 51 | **51** | **49** |
| total `--cth-font-display` refs | 134 | **134** | **136** |

The display-face reference count *rose* by 2 while its sub-14px subset *fell* by 7: Rule 1 keeps
Press Start 2P and only moves the size, and reformatting a one-line style object onto two lines adds
a reference without adding a site. That is the shape a size-only rule should produce.

### M3 — the glyph candidate predicate

```bash
export LC_ALL=C.UTF-8
grep -rnP ">\s*([^A-Za-z0-9\s<>{}/]|\{[a-zA-Z]+ \? '[^A-Za-z0-9]' : '[^A-Za-z0-9]'\})\s*</" src/renderer/src --include=*.tsx | wc -l
```

**30 before, 30 after.** The predicate is stable across the sweep — wrapping a glyph in a span does
not create or destroy a candidate.

### M1d — decimal and quoted sub-14 literals (blind spot #1)

**Repo-wide before: 6.** Exactly one was this plan's.

```
src/renderer/src/components/AgentCard.tsx:363         fontSize: 10.5     <- THIS PLAN
src/renderer/src/components/ReleaseDrop.tsx:65        fontSize: 13.5     -> 01-20
src/renderer/src/components/ReleaseDrop.tsx:117       fontSize: 11.5     -> 01-20
src/renderer/src/components/SettingsHeroCard.tsx:88   fontSize: 12.5     -> 01-15
src/renderer/src/components/SkillsTab.tsx:254         fontSize: 10.5     -> 01-19
src/renderer/src/components/triggers/JsonEditor.tsx:19 fontSize: '13px'  -> 01-18
```

**Repo-wide after: 5.** **Over this plan's six source files: 0.** (Note the drift — UI-SPEC says
`AgentCard.tsx:308`; it was at `:363` at the base sha.)

### M1x — expression-valued sizes (blind spot #2), with EVALUATED MINIMA

**Repo-wide before: 18.** Nine were this plan's. Line numbers had drifted from UI-SPEC's by up to
+41 (plans 12/13 edited `FullscreenTerminal.tsx`); every site was matched on text, never on number.

| Site (before) | Expression | **Evaluated minimum** | Rule |
|---|---|---|---|
| `FullscreenTerminal.tsx:354` | `fontSize: scale.group` | **7** | 3b |
| `FullscreenTerminal.tsx:672` | `fontSize: scale.name` | **7** | 3b |
| `FullscreenTerminal.tsx:722` | `Math.max(9, scale.name - 3)` | **9** | 3 |
| `FullscreenTerminal.tsx:758` | `fontSize: scale.note` | **10** | 3b |
| `FullscreenTerminal.tsx:773` | `fontSize: scale.note` | **10** | 3b |
| `FullscreenTerminal.tsx:805` | `fontSize: noteLabelSize` | **8** | 3b |
| `FullscreenTerminal.tsx:836` | `fontSize: noteFontSize` | **8** | 3b |
| `ThoughtBubble.ts:84` | `fontSize: FONT_SIZE` | **12** | 3 |
| `ToolBubble.ts:78` | `fontSize: FONT_SIZE` | **12** | 3 |

All nine minima match the plan's expected set exactly (7, 7, 9, 10, 10, 8, 8, 12, 12).

**After — over this plan's six source files, every minimum at or above 14:**

| Site (after) | Expression | **Evaluated minimum** |
|---|---|---|
| `FullscreenTerminal.tsx:357` | `fontSize: scale.group` → `clamp(zoom * 0.45, 14, 18)` | **14** |
| `FullscreenTerminal.tsx:686` | `fontSize: scale.name` → `clamp(zoom * 0.48, 14, 20)` | **14** |
| `FullscreenTerminal.tsx:740` | `Math.max(14, scale.name - 3)` | **14** |
| `FullscreenTerminal.tsx:776` | `fontSize: scale.note` → `clamp(zoom * 0.68, 14, 20)` | **14** |
| `FullscreenTerminal.tsx:791` | `fontSize: scale.note` | **14** |
| `FullscreenTerminal.tsx:823` | `noteLabelSize = Math.max(14, Math.round(noteFontSize * 0.6))` | **14** |
| `FullscreenTerminal.tsx:854` | `noteFontSize = Math.min(20, Math.max(14, useTerminalFontSize()))` | **14** |
| `ThoughtBubble.ts:84` | `fontSize: FONT_SIZE` (= 14) | **14** — but see §8, truth 3 |
| `ToolBubble.ts:78` | `fontSize: FONT_SIZE` (= 14) | **14** — but see §8, truth 3 |

The zoom's own domain is `[8, 40]` (`terminalFontSize.ts:14-15`), so every clamp is still a **real
range**: `name` 14→19, `group` 14→18, `note` 14→20, `noteFontSize` 14→20. Cmd +/- still moves the
roster; it no longer moves it below the floor.

### Recorded count baselines (task 1), verbatim

```
grep -c "cth-font-ui" src/renderer/src/components/ThreadsPanel.tsx      -> 5   (expected 5) ✓
grep -c "cth-font-ui" src/renderer/src/components/AgentCard.tsx         -> 0   (expected 0) ✓
grep -c "cth-text-display-sm" src/renderer/src/components/ThreadsPanel.tsx -> 1 (expected 1) ✓
grep -rc "cth-text-display-sm\|cth-lh-display-sm" src/renderer/src --include=*.tsx --include=*.ts --include=*.css | awk -F: '{n+=$2} END {print n}'
                                                                        -> 5   (expected 5) ✓
grep -cE "font-size: *(1[0-3]|[0-9])(\.[0-9]+)?px" src/renderer/index.html -> 1 (expected 1) ✓
grep -c 'font-family: "Press Start 2P"' src/renderer/index.html         -> 2   (expected 2) ✓
grep -c "Press Start 2P" src/renderer/index.html                        -> 3   (expected 3) ✓
grep -c "cth-text" src/renderer/index.html                              -> 0   (expected 0) ✓
grep -c "display-sm" DESIGN.md                                          -> 2   (expected 2) ✓
```

Every single pinned baseline in the plan matched live source. Nothing had drifted except the
**line numbers**, which is why every edit matched on text.

### TAP counters

```bash
TAP=$(mktemp); node --test --test-reporter=tap test/*.test.cjs > "$TAP"; echo "EXIT=$?"; grep -E "^# (tests|pass|fail|skipped|todo) " "$TAP"; rm -f "$TAP"
```

| | Task 1 (baseline) | After task 2 | After task 3 | After the width fix |
|---|---|---|---|---|
| EXIT | 0 | 0 | 0 | 0 |
| `# tests` | 515 | 515 | 515 | 515 |
| `# pass` | 511 | 511 | 511 | 511 |
| `# fail` | **0** | **0** | **0** | **0** |
| `# skipped` | 4 | 4 | 4 | 4 |
| `# todo` | 0 | 0 | 0 | 0 |

`# skipped` never rose and `# pass` never fell. (The plan's pinned baseline of 426/422 predates
plans 12 and 13; 515/511 is the number CI reports on this branch and is the honest baseline. The
4 skips are the Windows-only skips; ubuntu and macos report 515/515/0/0.)

---

## 2. Per-file rule classification (task 1) — all six source files

**Legend.** Object = the enclosing style object. `hoisted` = declared once and shared; every object
in this group turned out to be **inline**, so no shared-declaration override was needed except at
the five glyph buttons (which got one anyway — see §5).

### `AgentCard.tsx` — 6 M1 occurrences + 1 M1d + 2 already-tokenised

| Line (base) | Value | Display? | Rule | Site |
|---|---|---|---|---|
| 202 | `8` | yes | **1** | task sticky note (`{doingCount > 1 ? doingCount : '✎'}` — a COUNT, not a bare glyph, so not a Rule 0 candidate) |
| 237–238 | `var(--cth-text-display-sm)` | yes | **1b** | the agent NAME |
| 245 | `7` | yes | **1** | BOSS chip |
| 263 | `var(--cth-text-display-md)` | yes | — | AUTO chip (01-12's; already at the token, untouched) |
| 287 | `11` | no | **2** | context/info line |
| 302 | `var(--cth-text-body-sm)` | no | — | model span (01-12's; already at the token, untouched) |
| 317 | `10` | mono | **2** (mono) | cost span |
| 327 | `9` | no | **2** | account chip |
| 363 | `10.5` | no | **2** (via 3b) | note first line — M1d, invisible to M1 |
| 379 | `10` | no | **0** | the `✎` note-edit button |

### `AgentStrip.tsx` — 12 M1 occurrences

| Line (base) | Value | Display? | Rule | Site |
|---|---|---|---|---|
| 196 | `8` | yes | **1** | `PRIVATE NOTE · <NAME>` popover header |
| 206 | `11` | no | **0** | note-editor `✕` |
| 228 | `12` | mono | **2** (mono) | note textarea |
| 232 | `10` | no | **2** | `one line = one bullet · esc to close` |
| 273 | `13` | no | **2** | agent filter input |
| 277 | `11` | no | **2** | `N agents` count |
| 298 | `8` | yes | **1** | vertical repo label |
| 312 | `13` | no | **2** | `no agent matches "…"` |
| 368 | `8` | yes | **1** | `previous session` restore-menu header |
| 383 | `12` | no | **2** | restorable-agent row |
| 391 | `11` | no | **2** | restorable-agent description |
| 401 | `12` | no | **0** | restorable dismiss `✕` |

### `ThreadsPanel.tsx` — 8 M1 occurrences + 1 token

| Line (base) | Value | Display? | Rule | Site |
|---|---|---|---|---|
| 82 | `13` | no | **2** | empty-state copy |
| 101 | `var(--cth-text-display-sm)` | yes | **1b** | thread title button |
| 105 | *(none — inherits)* | — | **0** | `{open ? '▾' : '▸'}` disclosure caret |
| 109 | `12` | no | **2** | message-count badge |
| 121 | `13` | no | **2** | sender name |
| 123 | `12` | no | **2** | act chip |
| 127 | `12` | no | **2** | timestamp |
| 131 | `13` | no | **2** | message body |
| 136 | `12` | no | **2** | more/less toggle |
| 152 | `13` | no | **2** | reply textarea |

### `FullscreenTerminal.tsx` — 12 M1 occurrences + 7 M1x + 1 token

| Line (base) | Value | Display? | Rule | Site |
|---|---|---|---|---|
| 49/50/51 | `clamp(…,7,14)` / `(…,7,13)` / `(…,10,20)` | — | **3b** | `rosterScale` name / group / note |
| 204 | `12` | yes | **1** | `HELLO MARKX · FULLSCREEN` title |
| 241 | `13` | no | **2** | theme toggle `☀`/`☾` (NOT Rule 0 — its child is a ternary over an expression, which the glyph predicate excludes; it already carries `aria-label="Toggle dark mode"`) |
| 319 | `'clamp(14px, 0.7vw, 15px)'` | no | — | already ≥14, no action |
| 354 | `scale.group` | yes | **3b** | repo header |
| 398 | `11` | no | **2** | `restoring your team…` banner |
| 429 | `11` | no | **2** | restorable chip (fixed `height: 20`) |
| 442 | `11` | no | **0** | restorable dismiss `✕` |
| 537 | `9` | no | **2** | `{pct}%` in `ContextBar` |
| 566/567 | `Math.min(zoom,14)` / `Math.max(8,…)` | — | **3b** | `noteFontSize` / `noteLabelSize` |
| 648 | `13` | no | **2** | `SidebarRow` root (the row's inherited size) |
| 664 | `scale.name` | yes | **3b** | roster agent NAME |
| 684 | `var(--cth-text-display-md)` | yes | — | AUTO chip (01-12's; untouched) |
| 695 | `Math.max(9, scale.name - 3)` | no | **3** | subordinate model/cwd/cost line |
| 708 | `12` | no | **0** | roster `✎` |
| 731 / 740 | *(none — inherits `:695`)* | — | **0** | `·` separators ×2 |
| 746 / 762 | `scale.note` / *(none)* | — | **3b** / **0** | note bullets / `•` bullet glyph |
| 778 / 809 | `noteLabelSize` / `noteFontSize` | — | **3b** | note popover label / textarea |
| 842 | `10` | no | **2** | note popover hint |
| 889 | `10` | yes | **1** | `Header` agent name |
| 893 / 898 | `12` / `12` | no | **2** | `Header` cwd / description |

### `ThoughtBubble.ts` / `ToolBubble.ts`

| Line | Value | Rule |
|---|---|---|
| `ThoughtBubble.ts:22` | `FONT_SIZE = 12` | **3** |
| `ToolBubble.ts:29` | `FONT_SIZE = 12` | **3** |

---

## 3. Rule 0 — the frozen allowlist for plan 23

**Nine candidates in this group, five allowlist entries.** (The plan's prose says "All 8 are exempt";
the list it gives is nine items and UI-SPEC's own file table agrees on nine. Arithmetic slip in the
plan, recorded here so plan 23 does not chase a missing tenth.)

The four candidates with **no `fontSize` declaration of their own** — ThreadsPanel's `▾`/`▸` and
FullscreenTerminal's `·`, `·`, `•` — inherit a size that this plan already floored at 14. They take
`aria-hidden="true"` and **no allowlist entry**, because inventing a local sub-14px override for
them would *add* a site to the very count plan 23 grades. Rule 0's purpose is to exempt, not to
manufacture exemptions.

### THE ALLOWLIST — literal `file:line` array, at `cea311e`

```js
[
  'src/renderer/src/components/AgentCard.tsx:411',
  'src/renderer/src/components/AgentStrip.tsx:218',
  'src/renderer/src/components/AgentStrip.tsx:440',
  'src/renderer/src/components/FullscreenTerminal.tsx:454',
  'src/renderer/src/components/FullscreenTerminal.tsx:730'
]
```

Each line, with the two lines following it — every one carries `aria-hidden="true"` on the
**declaration line itself**:

```
AgentCard.tsx:411            <span aria-hidden="true" style={{ fontSize: 10 }}>✎</span>
AgentCard.tsx:412          </button>
AgentCard.tsx:413        )}

AgentStrip.tsx:218           <span aria-hidden="true" style={{ fontSize: 11 }}>✕</span>
AgentStrip.tsx:219         </button>
AgentStrip.tsx:220       </div>

AgentStrip.tsx:440           <span aria-hidden="true" style={{ fontSize: 12 }}>✕</span>
AgentStrip.tsx:441         </button>
AgentStrip.tsx:442       </span>

FullscreenTerminal.tsx:454           <span aria-hidden="true" style={{ fontSize: 11 }}>✕</span>
FullscreenTerminal.tsx:455         </button>
FullscreenTerminal.tsx:456       </span>

FullscreenTerminal.tsx:730       <span aria-hidden="true" style={{ fontSize: 12 }}>✎</span>
FullscreenTerminal.tsx:731     </button>
FullscreenTerminal.tsx:732   </div>
```

### Per-file count, allowlist size vs M1 occurrences

| File | M1 occ before | M1 occ after | Allowlist entries | Equal? |
|---|---|---|---|---|
| `AgentCard.tsx` | 6 | **1** | **1** | ✓ |
| `AgentStrip.tsx` | 12 | **2** | **2** | ✓ |
| `ThreadsPanel.tsx` | 8 | **0** | **0** | ✓ |
| `FullscreenTerminal.tsx` | 12 | **2** | **2** | ✓ |
| **total** | **38** | **5** | **5** | ✓ |

Occurrences (`-o`) and lines (`-c`) are equal in all four files, before and after.

---

## 4. Containment — every container integer changed, with its measured delta

UI-SPEC's three steps applied in order. **Nothing was reflowed, moved, dropped or held below 14px.**

| # | Container | Before | After | Δ | How the delta was measured | Step |
|---|---|---|---|---|---|---|
| 1 | `AgentCard.tsx` `const height` | **78** | **86** | **+8** | Row heights, arithmetic then confirmed live: identity 21→21, context 18→**20**, note 14→**20**, gauge 4→4, 3 gaps ×2 = 6. Content **63 → 71**. Container moved by the same +8 so the original 3px of slack survives. Live `scrollHeight` after: **74** in **74** of space. | 2 |
| 2 | `AgentCard.tsx` `const width` | **220** | **322** | **+102** | **Measured in a running Electron window.** `MICHAEL` intrinsic **64px** (canvas `measureText` at the computed Inter 14px), BOSS chip **64**, AUTO chip **64**, `idle` badge **54**, gaps 5+5+6 → **262px** of content against **160px** of column. See §6 — this one was a live defect. | 2 |
| 3 | `AgentCard.tsx` task sticky note | `20 × 18` | `30 × 20` | +10 / +2 | A two-digit count at 14px Press Start 2P measures **28px** against **16px** at the old 8px size; height tracks the 20px `--cth-lh-display-md` line box. | 2 |
| 4 | `AgentStrip.tsx` `height` / `minHeight` | **112** | **120** | **+8** | Tracks the card's measured +8 exactly, so the god card's `translateY(-2)` lift plus the hover/selection lift keeps the identical headroom it had at 112/78. | 2 |
| 5 | `AgentStrip.tsx` vertical repo label `maxHeight` | **84** | **92** | **+8** | The strip's content box is `height − 28px` of padding: 112−28 = 84, 120−28 = **92**. The label still truncates with an ellipsis rather than wrapping. | 2 |
| 6 | `AgentStrip.tsx` note popover `const width` | **280** | **340** | **+60** | `PRIVATE NOTE · <NAME>` is ~22 characters, and Press Start 2P at 14px advances ~1em/char → **308px** against the **260px** of content the popover offered. Without this the display-face header wraps to two lines. | 2 |

### Containers CHECKED and deliberately left alone (step 1)

| Container | Why nothing changed |
|---|---|
| `AgentCard.tsx` name / info / cost / account chip | All four already carry `whiteSpace:'nowrap'` + `overflow:'hidden'` + `textOverflow:'ellipsis'`. Horizontal growth truncates by design. |
| `AgentCard.tsx` chip line-heights (`'11px'`, `'13px'`, `'13px'`) | Not raised as integers — **replaced by their `--cth-lh-*` tokens**, which is what makes each box deterministic at the floor. |
| `AgentStrip.tsx` restorable row `height: 26` | 20px line box in a 26px box. Fits. |
| `AgentStrip.tsx` restore menu `minWidth: 240` | A **min**-width, not a fixed width — `previous session` at 14px display measures 224px against 224px of content, and the menu grows if it ever needs to. |
| `FullscreenTerminal.tsx` title bar `height: 36` | The title's line box is `--cth-lh-display-md` = **20px**, exactly what its old literal `'20px'` was. Unchanged. Its horizontal minimum grows ~504→552px, well inside any fullscreen viewport. |
| `FullscreenTerminal.tsx` restorable chip `height: 20` | 20px line box in a 20px box with zero vertical padding. Fits exactly. |
| `FullscreenTerminal.tsx` note popover | No fixed height. `popoverHeight = noteHeight + noteLabelSize*2 + 40` recomputes from the floored parts: **164 → 194**, and the real rendered height is **194**. The formula went from over-estimating by 5px to exact. |
| `FullscreenTerminal.tsx` roster rail `clamp(232px, 14vw, 340px)` | The roster name is Press Start 2P at `scale.name` = 14, so it truncates harder on a narrow rail (~25px of name at 232px, ~62px at a 1920px viewport). It truncates with an ellipsis and **never reaches zero** — `PixelBadge` there is not `flexShrink: 0`, so the squeeze is shared. This is UI-SPEC's designed response to width, recorded rather than "fixed". |
| The five glyph buttons (`15×14`, `18×18` ×2, `14×14`, `20×20`) | Rule 0 — the glyph size is unchanged, so the boxes are unchanged. |

### Step 3 — stop and report

One site. See §8, truth 3: the two Pixi canvas labels.

---

## 5. The one design deviation, and why

**UI-SPEC Rule 0 says the exempt element "gains `aria-hidden="true"`". Four of this group's five
exempt glyphs ARE the entire content of a focusable `<button>`.**

Putting `aria-hidden="true"` on a `<button>` removes it from the accessibility tree while leaving it
in the tab order. A screen-reader user then tabs onto a control that announces **nothing** — which is
threat **T-P14-05** ("a control with no accessible name"), the exact thing this plan's threat model
says it mitigates. It is also `axe-core`'s `aria-hidden-focus` rule, a WCAG failure.

UI-SPEC itself scopes the attribute correctly two sections earlier: *"Decorative glyphs **that are
not controls** → `aria-hidden="true"`"*, and *"Button's only content is an icon, glyph or symbol →
`aria-label` required"*. Both rules hold simultaneously only if the `aria-hidden` lands on the
**glyph**, not on the button.

So each glyph button became:

```jsx
<button aria-label="Edit note for MICHAEL" style={{ …, lineHeight: 1 }}>
  <span aria-hidden="true" style={{ fontSize: 10 }}>✎</span>
</button>
```

The `fontSize` moved from the button onto the span, unchanged. This is also exactly UI-SPEC's own
hoisted-object treatment ("the glyph element gets a **local `fontSize` override**; that override's
line is what enters the allowlist") applied to an inline object, so the allowlist stays in
`fontSize`-declaration-line space and every entry's element genuinely carries `aria-hidden`.
`lineHeight: 1` stays on the button and is inherited as a ratio, so every box is pixel-identical.

**Line-height convention, applied uniformly and stated once:** a **px** line-height becomes its
matching `--cth-lh-*` token; a **unitless** one (`1`, `1.35`, `1.4`, `1.5`) is a ratio that already
scales and is left alone; an object with **no** line-height gains the paired token, so its box is
deterministic at the floor rather than dependent on Press Start 2P's unusual `normal` metrics.

---

## 6. The defect no grep in this plan could see

Every acceptance criterion in tasks 2 and 3 passed. `npm run typecheck` was 0. `node --test` was
515/511/0/4/0. And the agent card shipped **with no name on it**.

`npm run e2e` against real Electron 43 failed:

```
Error: expect(locator).toBeVisible() failed
Locator:  getByText('MICHAEL', { exact: true })
Expected: visible
Received: hidden
  174 × locator resolved to <span>MICHAEL</span>
      - unexpected value "hidden"
```

The span existed, was in the a11y tree (`- text: MICHAEL BOSS idle hive opus 4 8 1m`), and had a
**zero-width bounding box**.

**Root cause, measured live rather than reasoned about.** The identity row gives the name
`flex: 1, minWidth: 0` while every sibling is `flexShrink: 0`. A `flex: 1 1 0%` item has a
hypothetical main size of 0, so negative free space is distributed entirely to the *siblings* — and
when the siblings refuse to shrink, the name absorbs the whole deficit down to zero. At the 14px
floor a four-character Press Start 2P chip is **64px** wide (56 + 8 of padding) and the god card
carries **two** of them:

```
MEASURE {"nameW":0,"innerW":100,
         "innerKids":[{"t":"MICHAEL","w":0,"h":20},{"t":"BOSS","w":64,"h":21},{"t":"AUTO","w":64,"h":21}],
         "rowW":160,"rowKids":[{"t":"MICHAELBOSSAUTO","w":100,"h":21},{"t":"idle","w":54,"h":20}],
         "cardW":220,"cardH":86,"colW":160,"colH":74,"nameScrollW":63,
         "measured":{"MICHAEL":64,"DWIGHT":58,"LONGNAME":81,"badgeIdle":24,"badgeCompacting":79}}
```

64 + 5 + 64 + 5 + 64 + 6 + 54 = **262px** of content against **160px** of column.

**Fix — containment step 2, by the measured delta:** `const width` 220 → **322** (+102). Re-measured
in the same running window afterwards:

```
MEASURE {"nameW":63,"innerW":201,
         "innerKids":[{"t":"MICHAEL","w":63,...},{"t":"BOSS","w":64,...},{"t":"AUTO","w":64,...}],
         "rowW":262,"cardW":322,"cardH":86,"colW":262,"colH":74}
2 passed (1.0m)
```

Nothing was reflowed, moved or dropped, and no site was held below 14px to make room. A longer
status label (`compacting`, 109px) still truncates the name with an ellipsis — that is the designed
response to horizontal growth, and it is not the same thing as the field disappearing.

The measurement was taken by a **temporary** probe inserted into `e2e/smoke.spec.ts`, which was
restored byte-identically afterwards (`git diff -- e2e/smoke.spec.ts` is empty; that file is not in
this plan's `files_modified` and is not in any of its commits).

**The lesson, for plans 15–20 and for plan 23:** a green grep is not a green pixel. Six criteria,
a clean typecheck and a green unit suite all passed over a card with no name on it. Wave 7's
executors sweep files with fixed-width chrome too — run the app, or at minimum reason about
`flex: 1` next to `flexShrink: 0` before assuming step 1 covers a width.

---

## 7. `PixelButton.tsx` — an M1x hit this plan fixed WITHOUT touching the file

`PixelButton.tsx:102` reads:

```js
fontSize: size === 'lg' ? 'var(--cth-text-body-md)' : 'var(--cth-text-body-sm)',
```

Both branches are already tokens, so its **evaluated minimum is whatever `--cth-text-body-sm` says**.

| | `--cth-text-body-sm` | `PixelButton.tsx:102` evaluated minimum |
|---|---|---|
| Before | 13px | **13** — a real sub-14px site |
| After | 14px | **14** — compliant |

**No edit to `PixelButton.tsx` was made or needed.** Its hash is still
`bd286ebf5654a2647c93546dc135f608aeb5d0f0`, exactly what plan 23 pins. Plan 23's M1x criterion admits
only the terminal carve-out hits, and this is the one M1x line that is neither carve-out nor defect —
the token migration is what makes it compliant, and this is where that evidence lives.

---

## 8. must_haves — every truth, with its verdict

| # | Truth | Verdict |
|---|---|---|
| 1 | *No `--cth-text-*` token declares a value below 14px, and `display-sm`/`lh-display-sm` are gone* | **SATISFIED.** `grep -c "cth-text-display-sm\|cth-lh-display-sm" tokens.css` → **0**. Repo-wide `awk` sum **5 → 0**. Shipped `out/renderer/assets/index-*.css` carries exactly seven type tokens, every one ≥14px, and zero `display-sm`. |
| 2 | *The two display-sm consumers convert family and size in the SAME commit as the token deletion* | **SATISFIED, counted not eyeballed.** `SHA=a172d39; git show --name-only --format= "$SHA" \| sort -u \| grep -cE "^(…tokens\.css\|…(AgentCard\|ThreadsPanel)\.tsx)$"` → **3**. |
| 3 | *Every non-literal fontSize in this group evaluates to 14 or above at every input* | **PARTIAL — 7 of 9 sites satisfied, 2 reported.** The seven `FullscreenTerminal.tsx` sites are at 14 at every input (§1). The **two Pixi labels are NOT**: `FONT_SIZE = 14` is landed exactly as pinned, but both bubbles render their `Text` inside a container held at `RENDER_SCALE = 0.5` and every on-screen dimension is computed as `bgW * RENDER_SCALE`, so the **designed on-screen size is `14 * 0.5 = 7px`** (it was 6px before). Reaching a true 14px means authoring at 28 in inner space, which at the current `WRAP_WIDTH` (288) takes the cloud from ~40 to ~17 characters per line and turns `MAX_CHARS = 160` into a ten-line balloon over an 18×28 sprite — re-geometrying `MAX_WIDTH`/`MAX_CHARS`/the overlap pass, i.e. **containment step 3, "stop and report"**, and a redesign the phase contract forbids. Blocker filed, deferred item written. **Plan 23 must not read clause 4 as unconditionally true off `grep -c "FONT_SIZE = 14"`.** |
| 4 | *`DESIGN.md` §4.1 no longer contradicts `DESIGN.md:706`* | **SATISFIED.** `:119` → `14/16 px`; `:128` `display-md` → `14 / Press Start 2P / 20`; the `display-sm` row deleted. `grep -c "display-sm" DESIGN.md` → **1**, and `grep -n` shows the survivor is `:350`, the §7.8 `<RoomLabel>` prose this plan was not authorised to touch. `grep -n "14/16" DESIGN.md` → `:119`. |
| 5 | *The boot-splash title is at or above 14px* | **SATISFIED.** `grep -cE "font-size: *(1[0-3]\|[0-9])(\.[0-9]+)?px" src/renderer/index.html` **1 → 0**; still exactly three declarations (`.mk` 16px, `.title` **14px**, `.hint` 15px), so the count was cleared by raising a size, not by deleting a rule. `grep -c 'font-family: "Press Start 2P"'` still **2** — a size fix, not a typeface retirement. `grep -c "cth-text"` still **0** — the splash paints before `tokens.css` loads, so a `var()` here would resolve to nothing on the one screen with no fallback. Confirmed in the BUILT artifact: `out/renderer/index.html:27` carries `font-size: 14px`. |
| 6 | *No fixed-height container silently clips text after the bump* | **SATISFIED, and one failure was caught and fixed.** Six containers moved by measured deltas, nine were checked and left alone (§4). The one real overflow — the agent name at zero width — was found by the live E2E, not by a grep, and fixed at source in its own atomic commit (§6). `npm run e2e` **2 passed**, locally and on the remote runner. |

### Acceptance criteria NOT satisfied, reported rather than met

**Task 3:** *"`grep -c "aria-label" src/renderer/src/components/AgentStrip.tsx` is greater than
before this task."*

**NOT SATISFIED — 4 before, 4 after — and deliberately so.** `AgentStrip.tsx` has five controls:
two `✕` buttons (`:199` `aria-label="Close note editor"`, `:394` ``aria-label={`Dismiss ${a.name}`}``)
and three `PixelButton`s whose content is visible text (`add agent`, `restore team (N)`,
`restore all (N)`), plus an input and a textarea that already carry labels. **Zero icon-only buttons
lack an accessible name.** The only way to raise the count is to put an `aria-label` on a button
with visible text — which *overrides* the visible label and is the exact anti-pattern UI-SPEC bans
(*"a test asserting on it would be wrong… adding `aria-label` to it makes the UI worse for
voice-control users"*). Correct code cannot satisfy this criterion, so it was reported, following the
01-04 `CONTRIBUTING.md` and 01-10 README precedent: verify and pin, never damage correct prose or
correct markup to make a number agree.

The same holds for all four files — the accessible-name pass found **nothing to add** anywhere:

| File | `aria-label` before | after | `aria-hidden` before | after | `role="button"` before | after |
|---|---|---|---|---|---|---|
| `AgentCard.tsx` | 5 | **5** | 3 | **5** | 2 | **2** ✓ |
| `AgentStrip.tsx` | 4 | **4** | 0 | **4** | 0 | **0** ✓ |
| `ThreadsPanel.tsx` | 0 | **0** | 0 | **1** | 0 | **0** ✓ |
| `FullscreenTerminal.tsx` | 9 | **9** | 3 | **10** | 2 | **2** ✓ |

Both `<div role="button">` (`AgentCard.tsx`, `FullscreenTerminal.tsx`) are untouched — counts
unchanged at 2 and 2, comment and attribute both intact, per `.planning/codebase/CONCERNS.md`.

---

## 9. HANDOFF TO WAVE 7 — the file groups for plans 01-15 … 01-20

> **This is the section plans 01-15 through 01-20 are looking for.**

**Six groups, one per plan, verified DISJOINT and verified COMPLETE against live source at
`cea311e`.** The plan's objective says "four disjoint file groups"; there are **six** wave-7 plans
and each declares its own `files_modified`, so six groups is what is handed out. The check that
matters was run programmatically, not asserted:

- **Zero overlaps** between the `files_modified` sets of 01-14…01-20. (Every path appears in exactly
  one plan.)
- **All 60 remaining M1 files are owned.** `M1_files − owned_files = ∅`.
- **Arithmetic closes:** 567 occurrences handed out + **5** kept by 01-14 (the allowlist) =
  **572**, which is exactly the repo-wide M1 occurrence count after this plan.

**Take your own group and nothing else.** `use_worktrees: false` — you are committing into the same
working tree as your wave-mates, so stage and commit with an **explicit pathspec** and never
`git add -A`, `git add .` or `git commit -a`.

### 01-15 — settings cluster · 5 files · **129** M1 occurrences

```
src/renderer/src/components/SettingsModal.tsx              93
src/renderer/src/components/SettingsHeroCard.tsx            8   (+ M1d: :88 fontSize: 12.5)
src/renderer/src/components/McpDefaultsSettings.tsx         9
src/renderer/src/components/AiEnginesSettings.tsx           7
src/renderer/src/components/ClaudeAccountsSettings.tsx     12
```

### 01-16 — onboarding and pickers · 5 files · **100** M1 occurrences

```
src/renderer/src/components/AddAgentModal.tsx              35
src/renderer/src/components/OnboardingWizard.tsx           32
src/renderer/src/components/SetupPanel.tsx                 13
src/renderer/src/components/HivePicker.tsx                 10
src/renderer/src/components/OfficeThemePicker.tsx          10
```

### 01-17 — command centre, task board, triggers form, integrations · 6 files · **110** M1 occurrences

```
src/renderer/src/components/CommandCenterPanel.tsx         53
src/renderer/src/components/TasksKanban.tsx                25
src/renderer/src/components/triggers/ui.tsx                17
src/renderer/src/components/IntegrationsRegistry.tsx       15   (M1x: :72 ternary fontSize)
src/renderer/src/design/global.css                          0   (task 3 only — CSS, invisible to M1)
src/renderer/src/scene/office/OfficeFloor.tsx               0   (task 3 only — two font-size strings)
```

All four of the phase's **NOT-exempt** single-character sites live in this group.

### 01-18 — triggers tab, git, IDE chrome · 13 files · **68** M1 occurrences

```
src/renderer/src/components/GitTab.tsx                     12
src/renderer/src/components/triggers/TriggerHistoryTab.tsx 14
src/renderer/src/components/triggers/WebhooksSection.tsx    3
src/renderer/src/components/triggers/JsonEditor.tsx         0   (M1d only: :19 fontSize: '13px')
src/renderer/src/components/triggers/SchedulesSection.tsx   2
src/renderer/src/components/triggers/OrgSection.tsx         1
src/renderer/src/components/git/CommitGraph.tsx             4
src/renderer/src/ide/IdePanel.tsx                          20
src/renderer/src/ide/GitPanes.tsx                           6   (hoisted `smallBtn`, mixed consumers)
src/renderer/src/ide/chrome.ts                              2
src/renderer/src/ide/ImagePreview.tsx                       2
src/renderer/src/ide/MonacoEditor.tsx                       1
src/renderer/src/ide/MonacoDiff.tsx                         1
```

### 01-19 — the eight highest-density files · 8 files · **85** M1 occurrences

```
src/renderer/src/components/SkillsTab.tsx                  16   (+ M1d: :254 fontSize: 10.5)
src/renderer/src/components/MessageQueueComposer.tsx       16   (M1x: :355 zoom-derived)
src/renderer/src/components/WorkersTab.tsx                 10
src/renderer/src/components/MemoryPanel.tsx                 9
src/renderer/src/components/MemoryGraphPanel.tsx            9   (M1x: :333 ternary)
src/renderer/src/App.tsx                                    9
src/renderer/src/realtime/CostHud.tsx                       8
src/renderer/src/components/AskMeTab.tsx                    8
```

### 01-20 — the remaining 23 renderer files + the release-drop page · 24 files · **75** M1 occurrences

```
src/renderer/src/components/UpdateToast.tsx                 6
src/renderer/src/components/FileTree.tsx                    6
src/renderer/src/components/AgentDetailPanel.tsx            6
src/renderer/src/components/AgentControlStrip.tsx           6
src/renderer/src/components/ToolWaterfall.tsx               5
src/renderer/src/components/QuitWarningModal.tsx            5
src/renderer/src/components/FullscreenFileEditor.tsx        5   (hoisted `chip`, mixed consumers)
src/renderer/src/components/UpdatesSection.tsx              4
src/renderer/src/components/CodeEditor.tsx                  4
src/renderer/src/components/ErrorBoundary.tsx               3
src/renderer/src/components/CommandBar.tsx                  3
src/renderer/src/components/BlockedBanner.tsx               3
src/renderer/src/realtime/DevicePicker.tsx                  3
src/renderer/src/realtime/CompletionToast.tsx               3
src/renderer/src/components/TerminalView.tsx                2
src/renderer/src/components/RecentText.tsx                  2
src/renderer/src/components/RealtimeMichaelToggle.tsx       2
src/renderer/src/components/PtyTerminalView.tsx             2   (terminal carve-out — xterm only)
src/renderer/src/components/UpdateBadge.tsx                 1
src/renderer/src/components/SidebarTabs.tsx                 1
src/renderer/src/components/ReleaseDrop.tsx                 1   (+ M1d: :65 13.5, :117 11.5)
src/renderer/src/components/Modal.tsx                       1
src/renderer/src/components/MichaelBooting.tsx              1
src/shared/releaseDrop.ts                                   0   (task 3 only — 11 CSS declarations)
```

### What the token layer now guarantees you

| Token | Value | Line height token | Pair with |
|---|---|---|---|
| `--cth-text-display-lg` | 16px | `--cth-lh-display-lg` 24px | headline display face |
| `--cth-text-display-md` | **14px** | `--cth-lh-display-md` 20px | **every Rule 1 site** — the app's single display-face size |
| `--cth-text-body-lg` | 16px | `--cth-lh-body-lg` 24px | |
| `--cth-text-body-md` | 14px | `--cth-lh-body-md` 20px | **every Rule 2 site** |
| `--cth-text-body-sm` | **14px** | `--cth-lh-body-sm` 18px | already-tokenised sites only |
| `--cth-text-mono-md` | 14px | `--cth-lh-mono` **20px** | Rule 2 where the object sets `--cth-font-mono`. **Note: the mono line-height token is `--cth-lh-mono`, singular — there is no `-md`/`-sm` pair.** |
| `--cth-text-mono-sm` | **14px** | `--cth-lh-mono` 20px | |

`--cth-text-display-sm` and `--cth-lh-display-sm` **no longer exist**. A `var()` reference to either
resolves to nothing. Repo-wide references: **0**.

### Four things wave 7 should copy from this plan

1. **Line-height convention** (§5): px → its token; unitless → leave it; absent → add the paired
   token. Uniform across all four files here.
2. **Rule 0 on a focusable button** (§5): the `aria-hidden` goes on a `<span>` wrapping the glyph,
   never on the button. The span's `fontSize` line is the allowlist entry.
3. **Glyphs with no `fontSize` of their own** take `aria-hidden` and **no allowlist entry** — do not
   invent a sub-14px override just to have something to allowlist.
4. **`flex: 1` next to `flexShrink: 0` is a trap** (§6). Step 1 ("nothing — it truncates") is only
   true when the flexible item can actually reach an ellipsis. If every sibling is `flexShrink: 0`,
   the flexible item goes to **zero** and the field disappears. Check it in the running app.

### The unowned `SettingsModal.tsx:1008` residual (01-13's FLOOR-14 truth 5)

**It falls inside 01-15's group** — `src/renderer/src/components/SettingsModal.tsx` is 01-15's
largest file (93 occurrences). Stated explicitly, as asked.

**The blocker still stands and is NOT transferred to 01-15.** 01-15's own must_haves truth 3 is
*"Nothing was reflowed, moved, dropped, or held below 14px to make room"* and its plan is a
`fontSize`/accessible-name sweep — 01-13 recorded that its truth forbids changing copy, and this plan
has no authority to widen another plan's scope. If 01-15 chooses to take it, the fix is one sentence
appended to the existing description span (wording already in `README.md:139-147`), and it must add
**no** `fontSize` — 01-15 pins a measured occurrence count for that file. Otherwise the blocker
carries forward to plan 23's wave-9 doc-claim sweep, which already owns `test/repo-claims.test.cjs`.

---

## 10. Commits

**Base sha:** `ebf21388807d933bee197f3cecedd650dd549ad1`

### `a172d39` — `fix(01-14): raise the type scale above the 14px floor and convert its consumers`

```
 DESIGN.md                                          |  5 ++---
 src/renderer/index.html                            |  2 +-
 src/renderer/src/components/AgentCard.tsx          |  9 +++++----
 src/renderer/src/components/FullscreenTerminal.tsx | 22 ++++++++++++----------
 src/renderer/src/components/ThreadsPanel.tsx       |  4 ++--
 src/renderer/src/design/tokens.css                 | 18 +++++++++++-------
 src/renderer/src/scene/office/ThoughtBubble.ts     |  2 +-
 src/renderer/src/scene/office/ToolBubble.ts        |  2 +-
 8 files changed, 35 insertions(+), 29 deletions(-)
```

### `d7fde8c` — `fix(01-14): sweep the agent card, strip, threads panel and fullscreen roster to the floor`

```
 src/renderer/src/components/AgentCard.tsx          | 35 +++++++---
 src/renderer/src/components/AgentStrip.tsx         | 77 ++++++++++++++++------
 src/renderer/src/components/FullscreenTerminal.tsx | 55 +++++++++++-----
 src/renderer/src/components/ThreadsPanel.tsx       | 51 +++++++++++---
 4 files changed, 163 insertions(+), 55 deletions(-)
```

### `cea311e` — `fix(01-14): the agent card rendered with NO NAME at the 14px floor`

```
 src/renderer/src/components/AgentCard.tsx | 13 ++++++++++++-
 1 file changed, 12 insertions(+), 1 deletion(-)
```

### Containment, asserted three ways over `ebf2138..HEAD`

```bash
BASE=ebf21388807d933bee197f3cecedd650dd549ad1
PATHS="DESIGN.md src/renderer/index.html src/renderer/src/design/tokens.css \
       src/renderer/src/components/{AgentCard,AgentStrip,ThreadsPanel,FullscreenTerminal}.tsx \
       src/renderer/src/scene/office/{ThoughtBubble,ToolBubble}.ts"
SHAS=$(git log --format=%H "$BASE"..HEAD -- $PATHS)
```

- **(a)** `echo "$SHAS" | grep -c .` → **3** (the floor is load-bearing: with no commits the loop
  body never runs and the filter is empty for the wrong reason). The allowlist filter over
  `git show --name-only --format=` of all three → **no output**.
- **(a2)** `git diff --name-only "$BASE"..HEAD -- $PATHS | sort -u | grep -c .` → **9**. All nine
  declared paths moved, including `src/renderer/index.html`, the one outside `src/renderer/src`.
- **(b)** `git status --porcelain -- $PATHS` → **empty**.
- **Bonus, because `use_worktrees: false` and no wave-mate ran concurrently:** the *unfiltered*
  whole-tree `git diff --name-only "$BASE"..HEAD` lists **exactly those same nine paths and nothing
  else**. No stray file, no `.tap`, no wave-mate's work absorbed.

---

## 11. Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | **0** (before, after task 2, after task 3, after the width fix) |
| `node --test --test-reporter=tap test/*.test.cjs` | **EXIT 0** · 515 / 511 pass / **0 fail** / 4 skipped / 0 todo — identical to baseline at every step |
| `npm run build` (Node 22.23.2 / npm 10.9.8) | **0** |
| `npm run e2e` (real Electron 43, local) | **2 passed** — after the width fix; **1 failed** before it |
| **CI at `cea311e`, all six jobs** | **green** — Build ✓ · Typecheck ✓ · Test ubuntu **515/515/0/0** ✓ · Test macos **515/515/0/0** ✓ · Test windows **515/511/0/4** ✓ · Electron smoke (ubuntu) ✓ |

### Evidence from the SHIPPED artifact, not just from source

```
out/renderer/assets/index-BNaCnHy6.css
  --cth-text-body-lg:    16px      --cth-text-display-lg: 16px
  --cth-text-body-md:    14px      --cth-text-display-md: 14px
  --cth-text-body-sm:    14px      --cth-text-mono-md:    14px
                                   --cth-text-mono-sm:    14px
  grep -c "cth-text-display-sm|cth-lh-display-sm"  -> 0

out/renderer/index.html:27
  #cth-splash .title { font-family: "Press Start 2P", monospace; font-size: 14px; }

out/renderer/assets/index-Ccx0oyAS.js
  const height = 86                                    1
  minHeight: 120                                       1
  maxHeight: 92                                        1
  const width2 = 340                                   1   (the note popover)
  width: 30, height: 20                                1   (the task sticky note)
  clamp2(zoom * 0.48, 14, 20) / (… 0.45, 14, 18) / (… 0.68, 14, 20)
  Math.max(14, scale.name - 3)                         1
  Math.min(20, Math.max(14, …))                        1
  Math.max(14, Math.round(noteFontSize * 0.6))         1
  const FONT_SIZE = 14                                 1
  fontSize: 10 }, children: "✎"                        1
  fontSize: 11 }, children: "✕"                        2
  fontSize: 12 }, children: "✕"                        1
  fontSize: 12 }, children: "✎"                        1
```

### Plan 01-12's edits — VERIFIED intact, not assumed

| 01-12 artefact | Check | Result |
|---|---|---|
| `AgentCard.tsx` auto-mode wiring | `grep -c autoMode` | **4** (01-12 recorded 0 → 4) ✓ |
| AUTO chip on the card | present at `:273`, `var(--cth-text-display-md)` / `var(--cth-lh-display-md)`, `aria-hidden` | ✓ untouched, no numeric literal added |
| Card root `aria-label` folds the auto clause | `:176` | ✓ intact |
| Model field on the card | `:317` `shortModel(row?.model)`, `var(--cth-text-body-sm)` | ✓ intact |
| `shortModel` still **exported** from `FullscreenTerminal.tsx` | `:517` | ✓ (un-exporting it breaks the card) |
| `SidebarRow`'s `liveAutoMode` / AUTO chip / folded label | `:597-598`, `:705` | ✓ intact |
| 1024px responsive collapse | `SIDEBAR_COLLAPSE_WIDTH = 1024` in `store/sidebarLayout.ts` | ✓ untouched (not this plan's file) |

### `PixelButton.tsx` — unmodified

`git hash-object src/renderer/src/components/PixelButton.tsx` → **`bd286ebf5654a2647c93546dc135f608aeb5d0f0`**, exactly plan 23's pin. Last commit touching it is still `1947cf0`, from before this phase.

### MEASUREMENT UNAVAILABLE — operator-only, not claimed

**The dev app was not opened by a human.** The plan's manual verification ("launch the dev app and
look at the agent strip, an agent card, the fullscreen roster and the threads panel") requires an
interactive GUI observation this session could not perform.

What IS proven headlessly, and it is more than usual: the Electron **E2E smoke drives a real
BrowserWindow**, mounts the real agent strip and card, and its assertions were used to *find and fix*
a real layout defect (§6) — including live `getBoundingClientRect` and canvas `measureText` readings
from the running renderer. The built bundle carries every container integer and every token. What no
automation here reached: a human looking at the **fullscreen roster**, the **threads panel**, the
**Pixi thought/tool bubbles** and the **note popovers** at the new sizes.

**Owner: operator, before plan 23.** Run `npm run dev` and confirm (a) the agent strip at 120px with
322px cards still reads as a dock and does not scroll unpleasantly, (b) the fullscreen roster's names
truncate legibly at a narrow rail, (c) the note popover at 340px, (d) the thought/tool bubbles still
fit their balloons. **Plan 23 must not tick FLOOR-12's visual clause on bundle evidence alone.**

---

## 12. Deviations from plan

### Auto-fixed

**1. [Rule 1 — Bug] The agent card rendered with no name.** Found during task 3's verification, by
`npm run e2e`. Full write-up at §6. Fixed at SOURCE in its own atomic `fix(...)` commit `cea311e`;
no test was touched, and the temporary measurement probe in `e2e/smoke.spec.ts` was restored
byte-identically. Files modified: `src/renderer/src/components/AgentCard.tsx`.

**2. [Rule 1 — Bug] The folder-icon step was keyed to the old `group` clamp cap.**
`FullscreenTerminal.tsx` read `<Icon name="folder" size={scale.group >= 13 ? 2 : 1} />` — a threshold
tied to the pre-sweep cap of 13, reached only at maximum zoom. Flooring `group` at 14 would have made
it **unconditionally true**, pinning a 32px folder icon beside a 14px label at every zoom. Re-keyed
to the new cap (`>= 18`), preserving the original behaviour ("2× only at the top of the range").
Landed in `a172d39` with the change that caused it. Files modified:
`src/renderer/src/components/FullscreenTerminal.tsx`.

**3. [Rule 2 — Accessibility correctness] `aria-hidden` moved off the focusable buttons.** Full
rationale at §5. Applied at all five glyph-button sites. Landed in `d7fde8c`.

### Reported, not "fixed"

**4. The two Pixi labels render at 7px on screen** (must_haves truth 3). Containment step 3, "stop
and report". §8 and the deferred item. Not silently absorbed, not papered over.

**5. `ToolBubble`'s exported class has zero consumers and is tree-shaken out of the bundle.** Found
while checking whether any layout constant derives from `FONT_SIZE`. `grep -rn "ToolBubble" src`
outside the file itself returns only `ThoughtBubble.ts:3`, which imports `toolIcon` alone; `class
ToolBubble` does not appear in the built renderer. Its sweep is correct-but-inert. Deleting it is not
one of the six requirements, so it was swept as specified and recorded in `deferred-items.md`.

**6. The `grep -c "aria-label" AgentStrip.tsx` criterion is unsatisfiable on correct code.** §8.
Reported rather than met by damaging correct markup.

**7. Two arithmetic slips in the plan's own prose, recorded so plan 23 does not chase them.**
The plan says *"All 8 are exempt"* while listing nine Rule 0 glyphs (UI-SPEC's file table also gives
nine); and it says *"hand four disjoint file groups to plans 15-20"* while six wave-7 plans each
declare their own set. Six groups are handed out (§9).

### Anchor drift, for later plans and plan 23's greps

Measured at base sha `ebf2138` against the plan's and UI-SPEC's stated line numbers:

| Reference | Plan/UI-SPEC says | Actual at base sha | Actual at `cea311e` |
|---|---|---|---|
| `FullscreenTerminal.tsx` computed floor | `:694` / `:695` | `:722` | `:740` |
| `FullscreenTerminal.tsx` `rosterScale` clamps | `:49`–`:51` | `:49`–`:51` | `:52`–`:54` |
| `FullscreenTerminal.tsx` `noteFontSize`/`noteLabelSize` | `:566`/`:567` | `:566`/`:567` | `:569`/`:570` |
| `FullscreenTerminal.tsx` M1x consumers | `:353,664,731,746,778,809` | `:354,672,758,773,805,836` | `:357,686,776,791,823,854` |
| `AgentCard.tsx` decimal `fontSize: 10.5` | `:308` | `:363` | *(swept)* |
| `AgentCard.tsx` `const height` | `:111` | `:114` | `:118` |
| `AgentStrip.tsx` strip height | `:257-258` | `:254-255` | `:270-271` |
| `AgentStrip.tsx` note clamp `maxHeight` | `:303` | `:300` | `:324` |
| `DESIGN.md` §4.1 rows | `:119`, `:128`, `:129` | **exact** ✓ | `:119`, `:128` (`:129` deleted) |
| `src/renderer/index.html` splash title | `:27` | **exact** ✓ | `:27` |

**Every edit in this plan matched on TEXT, never on a line number.**

---

## Self-Check: PASSED

**Files (all nine of `files_modified` exist and are committed):**

```
FOUND: src/renderer/src/design/tokens.css
FOUND: DESIGN.md
FOUND: src/renderer/index.html
FOUND: src/renderer/src/components/AgentCard.tsx
FOUND: src/renderer/src/components/AgentStrip.tsx
FOUND: src/renderer/src/components/ThreadsPanel.tsx
FOUND: src/renderer/src/components/FullscreenTerminal.tsx
FOUND: src/renderer/src/scene/office/ThoughtBubble.ts
FOUND: src/renderer/src/scene/office/ToolBubble.ts
```

**Commits:**

```
FOUND: a172d39   fix(01-14): raise the type scale above the 14px floor and convert its consumers
FOUND: d7fde8c   fix(01-14): sweep the agent card, strip, threads panel and fullscreen roster to the floor
FOUND: cea311e   fix(01-14): the agent card rendered with NO NAME at the 14px floor
```

All three are on `origin/gsd/v1.0-milestone` and all six CI jobs are green at `cea311e`.
