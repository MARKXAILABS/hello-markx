---
phase: 01-finish-the-floor
plan: 16
subsystem: ui
tags: [floor-12, typography, design-tokens, accessibility, onboarding, pickers, electron, playwright]

requires:
  - phase: 01-finish-the-floor
    provides: "01-14's corrected token layer — display-md/body-md/mono-md all 14px, --cth-text-display-sm and --cth-lh-display-sm DELETED, --cth-lh-mono singular"
  - phase: 01-finish-the-floor
    provides: "01-15's measurement method — CDP setDeviceMetricsOverride for the layout viewport, positive control before a clean scan"
provides:
  - "The onboarding and picker cluster (5 files, 100 M1 occurrences) clears the 14px floor entirely: M1 = 0, M1d = 0, M1x = 0"
  - "OnboardingWizard.tsx:582's remove-repo button had NO accessible name at all and now has one — proven against Chromium's AX tree, empty string -> 'Remove <path>'"
  - "This group's frozen Rule 0 allowlist for plan 23: EMPTY (M3 returns zero candidates across all five files)"
  - "ZERO container integers changed, and that is a MEASURED result: overflow counts are byte-identical between the base sha and HEAD on every surface"
  - "Repo-wide M1 443 -> 343 occurrences / 55 -> 50 files; the wave-7 arithmetic closes exactly"
affects: [01-17, 01-18, 01-19, 01-20, 01-23]

tech-stack:
  added: []
  patterns:
    - "Object-scoped sweep applier: resolve the ENCLOSING style-object literal by string-aware brace matching, read the font family off that object, then rewrite size + line-height — a multi-line style object is classified by what it actually contains, not by what shares the fontSize's physical line"
    - "BASE-vs-HEAD differential layout measurement: run the identical probe against a build of the base sha and a build of HEAD, so 'did the sweep break containment' is answered by a diff instead of by a judgement call"
    - "Read accessible names off the CDP accessibility tree (Accessibility.getFullAXTree), never off aria-label/textContent — a name delivered via `title` is invisible to the DOM heuristic and real to the AX tree"

key-files:
  created: []
  modified:
    - src/renderer/src/components/AddAgentModal.tsx
    - src/renderer/src/components/OnboardingWizard.tsx
    - src/renderer/src/components/SetupPanel.tsx
    - src/renderer/src/components/HivePicker.tsx
    - src/renderer/src/components/OfficeThemePicker.tsx

key-decisions:
  - "DECISION (operator root-cause directive): migrated onto 01-14's corrected token layer, never patched a literal. All 100 sites now read var(--cth-text-*) / var(--cth-lh-*); the five files carry 100 `cth-text-` references where they carried 0."
  - "DECISION: the ROOT-CAUSE fix for OnboardingWizard.tsx:582 is an aria-label prop on PixelButton. It was NOT taken, because PixelButton.tsx is pinned byte-identical by plan 23 and is outside this plan's declared set — two hard contracts. The name ships via `title`, the one accname source PixelButton's closed prop set exposes, and the root-cause fix is filed as a blocker with a named owner. Truth 2 is reported PARTIAL, not green."
  - "The sweep applier's own ordering bug was caught by its dry run, not by the diff: at OnboardingWizard.tsx:645 the lineHeight sits BEFORE the fontSize, so tokenising it first invalidated the size offset. Fixed at source in the applier before a single file was written."
  - "ZERO container integers changed — and that is measured, not assumed. HivePicker's first run showed 7 overflows; they were a PRE-EXISTING folderName() Windows bug, reproduced identically at the base sha."
  - "The group's Rule 0 allowlist is EMPTY and no exemption was manufactured to have something to freeze."

patterns-established:
  - "A dry run that reports display/mono/body per site is a cheap cross-check: this plan's display count (27) had to equal the sum of the five files' `grep -c cth-font-display` (3+13+4+3+4), and it did"
  - "<option> elements inside a closed <select> have no box by construction — a zero-width scanner must exclude them or it reports 8 phantom defects"

requirements-completed: []

duration: 2h05m
completed: 2026-08-21
---

# Phase 01 Plan 16: Onboarding & Picker Floor Sweep Summary

**The first surface a new operator ever sees — 100 sub-14px `fontSize` occurrences across the onboarding wizard, the add-agent modal, the prerequisites panel and the two pickers — is on the corrected token layer with M1/M1d/M1x all zero, zero container integers changed (proven by a base-sha differential, not asserted), and one genuinely unnamed button given a real accessible name verified against Chromium's own accessibility tree.**

## Performance

- **Duration:** 2h05m
- **Tasks:** 3 of 3
- **Files modified:** 5
- **Commits:** 2 (`3c16ce8`, `d523a06`)

---

## 1. Base sha, commits, and the containment proof

**Base sha:** `6e1316208ff70153da784a62b9922651bfc8c63b`

### `3c16ce8` — `fix(01-16): sweep the add-agent modal and onboarding wizard to the 14px floor`

```
 src/renderer/src/components/AddAgentModal.tsx    | 70 +++++++++++------------
 src/renderer/src/components/OnboardingWizard.tsx | 73 +++++++++++++-----------
 2 files changed, 75 insertions(+), 68 deletions(-)
```

### `d523a06` — `fix(01-16): sweep the setup panel and the two pickers to the 14px floor`

```
 src/renderer/src/components/HivePicker.tsx        | 20 ++++++++---------
 src/renderer/src/components/OfficeThemePicker.tsx | 20 ++++++++---------
 src/renderer/src/components/SetupPanel.tsx        | 26 +++++++++++------------
 3 files changed, 33 insertions(+), 33 deletions(-)
```

**Per-file `git diff --numstat 6e13162..HEAD` — four of five are line-for-line:**

| File | + | − | note |
|---|---|---|---|
| `AddAgentModal.tsx` | 35 | 35 | line-for-line |
| `OnboardingWizard.tsx` | **40** | **33** | +7 = the explanatory comment on the accessible-name fix (§ 4) |
| `SetupPanel.tsx` | 13 | 13 | line-for-line |
| `HivePicker.tsx` | 10 | 10 | line-for-line |
| `OfficeThemePicker.tsx` | 10 | 10 | line-for-line |

Stated precisely rather than claimed as "line-for-line" across the board: only `OnboardingWizard.tsx`
adds lines, and every added line is comment.

### Containment, asserted three ways over `6e13162..HEAD`

```bash
BASE=6e1316208ff70153da784a62b9922651bfc8c63b
PATHS="src/renderer/src/components/{AddAgentModal,OnboardingWizard,SetupPanel,HivePicker,OfficeThemePicker}.tsx"
SHAS=$(git log --format=%H "$BASE"..HEAD -- $PATHS)
```

- **(a) per-commit, filtered.** `echo "$SHAS" | grep -c .` → **2** (the floor is load-bearing: with
  no commits the loop body never runs and the filter is empty for the wrong reason). The allowlist
  filter over `git show --name-only --format=` of both commits → **no output**. No wave-mate's path
  entered this plan's commits, and neither of this plan's commits touched a wave-mate's path.
- **(b) path-scoped and positive.** `git diff --name-only "$BASE"..HEAD -- $PATHS | sort -u | grep -c .`
  → **5**. All five declared paths moved.
- **(c) nothing left behind.** `git status --porcelain -- $PATHS` → **empty**.

### `OfficeThemePicker`'s dispose path — asserted, not assumed

```bash
git diff "$BASE"..HEAD -- src/renderer/src/components/OfficeThemePicker.tsx \
  | grep -E "^[-+].*(disposeTerminal|killPty|applyTheme|victims|archiveAgent)"
```
→ **no output**. The `disposeTerminal` call site plan 05 audited (`:73`) and the whole
kill-PTY → dispose → archive lifecycle are byte-identical.

### `PixelButton.tsx` — unmodified, pin intact

`git hash-object src/renderer/src/components/PixelButton.tsx` →
**`bd286ebf5654a2647c93546dc135f608aeb5d0f0`**, exactly plan 23's pin. Last commit touching it is
still `1947cf0`, from before this phase. This matters more here than in any other wave-7 plan — see
§ 4.

---

## 2. Measurement — task 1, pinned commands and their pasted output

### M1 — the sweep surface, BEFORE and AFTER. **Occurrences (`grep -hoE … | wc -l`), not lines.**

```
                         BEFORE            AFTER
AddAgentModal.tsx        35 occ (35 lines)   0
OnboardingWizard.tsx     32 occ (32 lines)   0
SetupPanel.tsx           13 occ (13 lines)   0
HivePicker.tsx           10 occ (10 lines)   0
OfficeThemePicker.tsx    10 occ (10 lines)   0
TOTAL                   100 occ            **0**
```

The plan's baseline (35 / 32 / 13 / 10 / 10 = 100) is **exact** against live source — unlike 01-15,
this group needed no re-baselining. Occurrences and lines are equal in all five files, measured both
ways above, so wave 9's occurrence-unit bar and any line-unit reading agree here.

### M1d — decimal and quoted sub-14 literals (blind spot #1)

```bash
grep -rnoE "fontSize *[:=] *\{?['\"]?(1[0-3]|[1-9])\.[0-9]+|fontSize *[:=] *\{?['\"](1[0-3]|[1-9])(\.[0-9]+)?px['\"]" <five paths>
```
**BEFORE: no output (exit 1). AFTER: no output (exit 1).** Zero hits, as the plan predicted.

### M1x — expression-valued sizes (blind spot #2)

```bash
grep -rnE "fontSize *[:=] *\{?[A-Za-z_\$]" <five paths>
```
**BEFORE: no output (exit 1). AFTER: no output (exit 1).** Zero hits.

**Evaluated minimums: n/a — there is no M1x hit in this group to evaluate.** The plan requires an
evaluated minimum beside every M1x hit; the set is empty, so the requirement is satisfied vacuously
and is recorded as such rather than left silently unaddressed.

### M3 — the Rule 0 glyph predicate, scoped to this group

```bash
export LC_ALL=C.UTF-8
grep -rnP ">\s*([^A-Za-z0-9\s<>{}/]|\{[a-zA-Z]+ \? '[^A-Za-z0-9]' : '[^A-Za-z0-9]'\})\s*</" <five paths>
```
**BEFORE and AFTER: no output (exit 1). Zero candidates**, matching UI-SPEC's 30-candidate table,
which names no element in any of these five files. Verified rather than assumed, as task 1 required.

`OfficeThemePicker.tsx:230`'s `⚠` is **not** an M3 candidate and was correctly not exempted: it sits
inside `<span>⚠ {working} agent…</span>` beside real text, so it is not a glyph-only element.

### Dangling `display-sm` references

`grep -n "display-sm" <five paths>` → **no output**. No file in this group referenced the deleted
token, so there was nothing to report back to 01-14.

### TAP counters — baseline and after

```bash
TAP=$(mktemp); node --test --test-reporter=tap test/*.test.cjs > "$TAP"; echo "EXIT=$?"
grep -E "^# (tests|pass|fail|skipped|todo) " "$TAP"; rm -f "$TAP"
```

| | EXIT | tests | pass | fail | skipped | todo |
|---|---|---|---|---|---|---|
| Task 1 baseline | 0 | 515 | 511 | **0** | 4 | 0 |
| After task 2 | 0 | 515 | 511 | **0** | 4 | 0 |
| After task 3 | 0 | 515 | 511 | **0** | 4 | 0 |
| Final (post-harness-removal) | 0 | 515 | 511 | **0** | 4 | 0 |

**`# skipped` never rose and `# pass` never fell.** No red test was converted to a skip.

**The plan's TAP baseline is stale and was re-measured rather than trusted.** The plan pins
`# tests 426 / # pass 422`; live is **515 / 511**. Identical staleness to the one 01-15 recorded — the
number predates the tests added since. The live figure was used as the gate, and the delta is
recorded here rather than papered over. The 4 Windows skips are the platform's own (CI: ubuntu and
macOS report `skipped 0`).

Written through `mktemp` on every run, never to a repo-root `sweep.tap` — five wave-mates share this
working tree and a fixed filename would let one plan grade another's half-written counters.

---

## 3. Per-file rule classification (task 1), and how it was cross-checked

The applier resolves each site's **enclosing style-object literal** by string/template-aware brace
matching and classifies on what that object actually contains, so a `fontFamily` three lines above
its `fontSize` is still seen. Its dry run printed every site with its rule:

**Totals: 100 sites — Rule 1 display 27 · Rule 2 mono 13 · Rule 2 body 60.**

The classification has an independent check that had to hold and did: **every display-family style
object in these files carries exactly one sub-14 `fontSize`**, so the Rule 1 count must equal the sum
of the per-file `grep -c "cth-font-display"` baselines.

| File | M1 occ | Rule 1 display | Rule 2 mono | Rule 2 body | `grep -c cth-font-display` |
|---|---|---|---|---|---|
| `AddAgentModal.tsx` | 35 | 3 | 7 | 25 | **3** ✓ |
| `OnboardingWizard.tsx` | 32 | 13 | 2 | 17 | **13** ✓ |
| `SetupPanel.tsx` | 13 | 4 | 2 | 7 | **4** ✓ |
| `HivePicker.tsx` | 10 | 3 | 2 | 5 | **3** ✓ |
| `OfficeThemePicker.tsx` | 10 | 4 | 0 | 6 | **4** ✓ |
| **total** | **100** | **27** | **13** | **60** | **27** ✓ |

`grep -c "cth-font-display"` is **unchanged in all five files** after the sweep (3 / 13 / 4 / 3 / 4).
**Press Start 2P was not retired at a single site.**

### Hoisted style objects and their consumers (task 1 required each enumerated)

| Hoisted object | Rule | Consumers | Any glyph consumer? |
|---|---|---|---|
| `AddAgentModal.tsx:37` `ossChip()` (`--cth-font-ui`, 12) | Rule 2 body | `:895`, `:913` — both render `{p.label}` | **No** |
| `AddAgentModal.tsx:44` `ossGroupHead` (`--cth-font-display`, 8/12px) | Rule 1 | `:885`, `:904` — both text `<div>` | **No** |
| `AddAgentModal.tsx:1077` `inputStyle` (**16px**) | *not an M1 site* | 6 consumers; two override to 13 (`:708`, `:752`) and take Rule 2 mono | **No** |
| `OnboardingWizard.tsx:913` `inputStyle` (`--cth-font-mono`, 13) | Rule 2 mono | `:387` `<input>`, `:512` `<select>` | **No** |

No hoisted object serves a glyph-only element, so **no local `fontSize` override was created** and
nothing entered the allowlist. Per 01-14's rule 3, no exemption was invented to have something to
freeze.

### The line-height convention, applied uniformly (copied from 01-14 § 5 / 01-15 § 3)

- a **px** line-height becomes its matching `--cth-lh-*` token — **35** of them;
- a **unitless** one is a ratio that already scales and is **left alone** — **2**
  (`SetupPanel.tsx:68` and `:170`, both `lineHeight: 1.5`);
- an object with **no** line-height gains the paired token — **63** of them.

35 + 2 + 63 = 100. ✓

**The orphaned-line-height trap 01-15 hit does not fire in this group — verified, not assumed.**
A post-sweep scan for `lineHeight: '\d+px'` across all five files returns exactly five survivors, and
every one is correct:

| Survivor | Why it is correct |
|---|---|
| `OnboardingWizard.tsx:363`, `:373`, `:405`, `:541` | `<p style={{ margin: 0, lineHeight: '22px' }}>` — **no `fontSize` at all.** Not M1 sites; they inherit the body size, measured live at **16px/22px**. Sweeping them would be a layout change this plan has no rule for. |
| `OfficeThemePicker.tsx:226` | `fontSize: 15` — **above the floor**, so not an M1 site and correctly untouched. |

Every other px line-height in the group sat on the same physical line as its `fontSize` and was
converted with it.

### Lint-suppression anchors (task 1 required every line number recorded)

`grep -n "eslint-disable" <five paths>` → exactly **one** hit in the whole group:

```
src/renderer/src/components/OnboardingWizard.tsx:179:    // eslint-disable-next-line react-hooks/exhaustive-deps
```

**At HEAD it is still line 179, still immediately above its target:**

```
178      if (!home) setHome('~/HarnessAgents');
179      // eslint-disable-next-line react-hooks/exhaustive-deps
180    }, []);
```

`grep -c "eslint-disable-next-line" OnboardingWizard.tsx` → **1**, unchanged. Plan 21's live
suppression will land on a real one. (The +7 comment lines added in § 4 sit at `:582`, four hundred
lines below the anchor, so they cannot move it.)

### Fixed container integers recorded before editing

`nav width: 168` (`AddAgentModal.tsx:564`), character-button `width: 56` (`:624`), colour swatch
`32×32` (`:643`), `minHeight: 260` (`:597`), panel `width: 640` (`OnboardingWizard.tsx:242`), repos
`maxHeight: 200` (`:554`), panel `width: 560` (`HivePicker.tsx:76`), recents `maxHeight: 220`
(`:119`), confirm panel `width: 480` (`OfficeThemePicker.tsx:207`), swatch `28×28` (`:137`).
**None of them changed** — see § 6.

---

## 4. Button inventory (task 1) and the accessible-name pass

| File | native `<button>` | PixelButton | ICON-ONLY | already named | **needed a name** |
|---|---|---|---|---|---|
| `AddAgentModal.tsx` | 13 | 5 | 1 | 1 (`:651` `aria-label={a}`) | 0 |
| `OnboardingWizard.tsx` | 1 | 8 | **1** | 0 | **1** |
| `SetupPanel.tsx` | 1 | 2 | 0 | 0 | 0 |
| `HivePicker.tsx` | 1 | 3 | 0 | 0 | 0 |
| `OfficeThemePicker.tsx` | 1 | 3 | 0 | 0 | 0 |
| **total** | **17** | **21** | **2** | **1** | **1** |

The two ICON-ONLY entries: `AddAgentModal.tsx:639` (the six colour swatches — empty content, already
carrying `aria-label={a}` before this plan) and `OnboardingWizard.tsx:582`.

### `OnboardingWizard.tsx:582` — a real, live defect this plan found and closed

```jsx
<PixelButton variant="ghost" size="sm" onClick={() => removeRepo(r)}>
  <Icon name="x" />
</PixelButton>
```

`Icon.tsx` hardcodes `aria-hidden` on its `<svg>`. So this button — the only way to remove a project
on the wizard's repos step — had **an empty accessible name**. Not "a weak name": empty.

**Measured, not inferred.** The harness read Chromium's own accessibility tree
(`Accessibility.getFullAXTree`) on the repos step at the base sha and at HEAD:

```
P16[BASE] AX BUTTON NAMES (repos step): ["","add a repo","back","next"]     unnamed=1
P16[HEAD] AX BUTTON NAMES (repos step): ["Remove /tmp/p16-probe-repo","add a repo","back","next"]   unnamed=0
```

**The decision, and why it is not the root-cause fix — recorded per the operator directive.**

The root-cause fix is an `aria-label` prop on `PixelButton`: its props are a closed set
(`variant · size · children · onClick · disabled · fullWidth · style · title`) and any extra prop is
dropped, so **no caller anywhere in the repo can name a PixelButton with `aria-label` today**. That
fix was **not** taken here, because `PixelButton.tsx` is (1) pinned byte-identical by plan 23 and
(2) outside this plan's `files_modified`, so editing it would break plan 23's pin *and* this plan's
containment criterion (a). Two hard contracts, not a preference.

What shipped instead is the strongest name available inside PixelButton's existing API: `title`,
which **is** an accessible-name source (accname § 2I, tooltip fallback) and is already the house
pattern for PixelButton elsewhere in this same file group (`AddAgentModal.tsx:1063`). It is verified
against the AX tree above, so this is a measured name and not a hopeful one.

**This is why truth 2 is reported PARTIAL rather than green (§ 8), and the root-cause fix is filed as
a blocker with a named owner (§ 9).**

### Zero `aria-label`s were added

`grep -c "aria-label"` across the group: **1 before, 1 after** — the pre-existing colour-swatch
label. Nothing was manufactured to move a count, and no button with visible text gained a label
(which would override the visible label and degrade voice control — UI-SPEC's stated anti-pattern and
threat T-P16-02's own failure mode). All 21 PixelButtons and 17 native buttons were enumerated by
reading their element bodies; every one except `:582` renders visible text.

**`unnamedButtons = 0` measured live on 16 surface-scans × 3 viewport widths = 48 independent
readings**, all from the AX tree.

---

## 5. Rule 0 — this group's frozen allowlist for plan 23

```js
[]
```

**EMPTY. Zero entries across all five files.**

M3 returns zero candidates (§ 2), UI-SPEC's 30-candidate table names no element in any of these
files, and no hoisted style object serves a glyph consumer (§ 3). Nothing was manufactured.

Consequence for plan 23's completeness bar: for this group, **allowlist size (0) == M1 occurrences
after (0)** in every file. `test/repo-claims.test.cjs` was **not** edited here.

| File | M1 occ before | M1 occ after | allowlist entries | equal? |
|---|---|---|---|---|
| `AddAgentModal.tsx` | 35 | **0** | **0** | ✓ |
| `OnboardingWizard.tsx` | 32 | **0** | **0** | ✓ |
| `SetupPanel.tsx` | 13 | **0** | **0** | ✓ |
| `HivePicker.tsx` | 10 | **0** | **0** | ✓ |
| `OfficeThemePicker.tsx` | 10 | **0** | **0** | ✓ |
| **total** | **100** | **0** | **0** | ✓ |

### Repo-wide arithmetic, so wave 9 reconciles

| | occurrences | files |
|---|---|---|
| after 01-15 (`19d8051`), per its SUMMARY | 443 | 55 |
| this plan's group | −100 | −5 |
| **measured at HEAD (`d523a06`)** | **343** | **50** |

`443 − 100 = 343` and `55 − 5 = 50`. Both close exactly, measured with the pinned M1 commands:

```bash
grep -rhoE "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" src/renderer/src --include=*.tsx --include=*.ts | wc -l   # 343
grep -rlE  "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" src/renderer/src --include=*.tsx --include=*.ts | wc -l   # 50
```

Remaining wave-7 groups: 01-17 110, 01-18 68, 01-19 85, 01-20 75 = 338, plus 01-14's 5 allowlisted =
**343**. ✓

### The token layer actually has consumers now

`grep -c "cth-text-"` in this group: **0 → 100** (35 / 32 / 13 / 10 / 10), exactly one per swept site.
Key link `swept fontSize sites → src/renderer/src/design/tokens.css` via `var(--cth-text-*)`,
pattern `cth-text-`: **satisfied, 100 references.**

---

## 6. Containment — **zero container integers changed, and that is a measurement**

UI-SPEC's three steps applied in order. **Nothing was reflowed, moved, dropped, collapsed, or held
below 14px to make room.** Every number below was read off `getBoundingClientRect` / `scrollWidth` /
`scrollHeight` in a **running Electron 43 window**.

The question "did the sweep break a fixed container" was answered by a **differential**, not a
judgement: the identical probe was run against a build of the base sha and a build of HEAD.

**Overflow lines are byte-identical between BASE and HEAD, across every surface and every width:**

```
--- BASE ---                                                    --- HEAD ---
  1  dy=104 box=404x236 DIV[14px] all=""                          1  dy=104 box=404x236 DIV[14px] all=""
  1  dy=119 box=392x221 DIV[14px] all=""                          1  dy=119 box=392x221 DIV[14px] all=""
  1  dy=119 box=404x221 DIV[14px] all=""                          1  dy=119 box=404x221 DIV[14px] all=""
  1  dy=96  box=420x244 DIV[14px] all=""                          1  dy=96  box=420x244 DIV[14px] all=""
  2  dy=96  box=420x279 DIV[14px] all="live · pty pty-god−12px+"  2  dy=96  box=420x279 DIV[14px] all="live · pty pty-god−12px+"
```

All six are the floor's terminal column behind the Settings modal at 1024px
(`live · pty pty-god` / `−` / `12px` / `+` identifies `PtyTerminalView.tsx`, **01-20's file**), they
occur at BASE and HEAD alike, and **none is attributable to this plan.** Recorded in § 10 as a
cross-plan observation.

**This plan's own surfaces report `overflow = 0` at 1280×900, 1024×768 and 800×600, at BASE and at
HEAD.** Step 2 was never reached; step 3 was never reached.

### Containers CHECKED and deliberately left alone (UI-SPEC step 1), with the numbers

| Container | Measured | Why nothing changed |
|---|---|---|
| `AddAgentModal.tsx:564` nav rail `width: 168` — **the top suspect** | all four buttons `scrollW=168 clientW=168 **overflowX=0**`, label `14px/20px`, `btn=168x72 / 168x72 / 168x72 / 168x52` | The prediction was that `WORKSPACE` at 14px Press Start 2P (9 chars ≈ 126px) would break a 168px rail. **It does not**: 126px fits the 150px content box, and the growth lands vertically in a column-flex button with **no fixed height** (52 → 72px). This is 01-15's nav-rail lesson restated in the opposite direction — arithmetic said "raise it", measurement said "it absorbs". |
| `SetupPanel.tsx:59` tool label `flex: 1, minWidth: 0` between two `flexShrink: 0` siblings | `overflow=0`, `zeroWidth=0`; `UV` / `GIT` / `NODE.JS` / `CLAUDE CODE` all `box=465x20` | **The exact 01-14 zero-width trap** — and it does not fire: the chips are `85–157px` and the row is 577px wide, so the flexible label keeps 465px. |
| `SetupPanel.tsx:84` `<code flex:1 minWidth:0>` vs `:92` copy button `flexShrink: 0` | `copy = box=49x28` (and `49x40` where the command wraps) | The row is `alignItems: 'stretch'`, so the button tracks the code block's height. Growth, not clipping; `overflow=0`. |
| `HivePicker.tsx:97 / :134` `flex: 1, minWidth: 0` vs `:143` `flexShrink: 0` | `p16-hive = box=403x20`, `p16-other-hive = box=401x20`, `overflow=0` | The flexible column keeps 400px+ at all three widths. |
| `AddAgentModal.tsx:624` character button `width: 56` | `overflow=0` at all widths | The name span has no `nowrap`, so a long display name wraps inside a column button with no fixed height. |
| `OnboardingWizard.tsx:485/:496` `RECOMMENDED` / `INSTALLED` chips, `flexShrink: 0`, beside a `flex:1 minWidth:0` label | `overflow=0`, `zeroWidth=0` at 1280/1024/800 | The panel is `width: 640` and stops shrinking below ~680px viewport, so the row never gets tight enough to squeeze the label. |
| `OnboardingWizard.tsx:554` repos `maxHeight: 200, overflowY: auto` · `AddAgentModal.tsx:461` `maxHeight: '86vh', overflowY: auto` | — | Designed scroll containers; vertical growth from 20px line boxes is what they are for. The 10-row mono textarea (`AddAgentModal.tsx:1046`, `16px → 20px` line box, ≈ +40px) is absorbed here. |

### Step 3 — stop and report

**No site in this group reached step 3.** Nothing here required a redesign.

---

## 7. Live verification — because a green grep is not a green pixel

01-14's standing blocker: every acceptance criterion passed while the agent card shipped with no name
on it. So this plan measured the rendered result, and measured the **base sha the same way** so
"unchanged" is a diff rather than a claim.

**Method.** A throwaway Playwright spec drove the real `out/main/index.js` bundle in a real
Electron 43 BrowserWindow — the launch shape of `e2e/smoke.spec.ts`, with `--user-data-dir` and
`HOME`/`USERPROFILE` redirected into a temp sandbox. Two sandboxes: a first-run one (the wizard) and
a seeded one (`onboardingComplete`, `harnessHome`, `recentHives`, `registeredRepos`, `tvShowOffices`)
so the pickers and Settings render with real data. `AddAgentModal` was opened with its **hire-import
banner mounted** by pushing a manifest down the real `hire:import` channel from the main process —
without it, 10 of AddAgentModal's 35 sites never render and the scan would have been vacuous over
them. **The spec was deleted before this SUMMARY was written**: `ls e2e/` is `smoke.spec.ts` alone
and `git status --porcelain` is empty.

**Viewport control.** CDP `Emulation.setDeviceMetricsOverride`, per 01-15's finding that
`setViewportSize` / `setBounds` / `setContentSize` all leave `window.innerWidth` pinned at 1280. Every
line of output prints the **true** `window.innerWidth × innerHeight` beside the requested size, so a
silent third 1280px run is visible on the page:

```
P16[HEAD] wizard/6-permissions  800x600 inner 800x600 | ...
P16[HEAD] settings/Prerequisites 1024x768 inner 1024x768 | ...
```

### Result — 16 surfaces × 3 widths, BASE vs HEAD

| Surface | BASE sub14 | **HEAD sub14** | BASE overflow | HEAD overflow | BASE unnamed | HEAD unnamed |
|---|---|---|---|---|---|---|
| `wizard/1-persona` | 8 | **0** | 0 | 0 | 0 | 0 |
| `wizard/2-welcome` | 14 | **0** | 0 | 0 | 0 | 0 |
| `wizard/3-home` | 1 | **0** | 0 | 0 | 0 | 0 |
| `wizard/4-orchestrator` | 26 | **0** | 0 | 0 | 0 | 0 |
| `wizard/5-repos-empty` | 1 | **0** | 0 | 0 | 0 | 0 |
| `wizard/5-repos-filled` | 1 | **0** | 0 | 0 | **1** | **0** |
| `wizard/6-permissions` | 16 | **0** | 0 | 0 | 0 | 0 |
| `hivepicker` | 9 | **0** | 0 | 0 | 0 | 0 |
| `settings/General+Theme` | 32 / 40 / 29 | 11 / 25 / 8 | 0 | 0 | 0 | 0 |
| `settings/Prerequisites` | 40 / 40 / 40 | 22 / 22 / 5 | 0 / **6** / 0 | 0 / **6** / 0 | 0 | 0 |
| `addagent/identity+banner` | 40 / 40 / 40 | 22 / 22 / 5 | 0 | 0 | 0 | 0 |
| `addagent/WORKSPACE` | 40 / 40 / 39 | 22 / 22 / 5 | 0 | 0 | 0 | 0 |
| `addagent/ENGINE` | 40 / 40 / 40 | 22 / 22 / 5 | 0 | 0 | 0 | 0 |
| `addagent/BRIEFING` | 40 / 40 / 40 | 22 / 22 / 5 | 0 | 0 | 0 | 0 |
| `addagent/hire-prompt` | — | 22 / 22 / 5 | 0 | 0 | 0 | 0 |

*(Where one number is given it was identical at all three widths. The `sub14` list is capped at 40
entries by the probe, so a BASE value of exactly 40 is a floor, not a count — stated so the "40 → 22"
rows are not read as an exact delta.)*

**Every wizard surface and the hive picker are at sub14 = 0.** The residual 22 / 5 on the Settings
and Add-Agent surfaces is **entirely other plans' chrome rendered behind or around the modal** — all
28 distinct strings attributed:

| Rendered sub-14px text at HEAD | File | Owner |
|---|---|---|
| `13px "v 0.4.4"`, `13px "auto mode on"`, `13px "☾"`, `12px "🧠 memory"`, `10px "WAKING THE FLOOR"`, `13px "Michael is settling into the corner office…"`, `13px "Michael is clocking in…"` | `App.tsx` | 01-19 |
| `10px "COMMAND CENTER"`, `12px "Michael runs the floor"` | `CommandCenterPanel.tsx` | 01-17 |
| `13px` × 10 tab labels (`terminal`, `monitor`, `tasks`, `ask me`, `triggers`, `memory`, `graph`, `activity`, `skills`, `workers`) | `SidebarTabs.tsx` / `CommandCenterPanel.tsx` | 01-20 / 01-17 |
| `12px "live · pty pty-god"`, `12px "−"`, `12px "12 px"`, `12px "+"` | `PtyTerminalView.tsx` | 01-20 (terminal carve-out) |
| `9px "QUEUE"` | `MessageQueueComposer.tsx` | 01-19 |
| `10px "✕"` | `Modal.tsx` | 01-20 |
| `8px "Updates"`, `13px "You're on v0.4.4"`, `12px "Updates are checked automatically…"` | `UpdatesSection.tsx` | 01-20 |

**Zero of the 28 belongs to any of this plan's five files.**

### Positive control — so the clean scans are not vacuous

**`SetupPanel` — 29/29 probes, every one mounted and ≥ 14px.** This is the surface 01-15 flagged as
the densest sub-14px in the app (79 nodes, including 9px `READY` verdict chips):

```
P16[HEAD] POSITIVE CONTROL setuppanel:
  "PREREQUISITES  = 14px/20px box=485x20"      "READY      = 14px/20px box=85x24"   (×4)
  "Prerequisites  = 14px/20px box=577x20"      "MISSING    = 14px/20px box=114x24"
  "Memory layer   = 14px/20px box=577x20"      "NOT SET UP = 14px/20px box=157x24"  (×8)
  "Agent engines  = 14px/20px box=577x20"      "recommended= 14px/20px box=96x20"
  "UV / GIT / NODE.JS / CLAUDE CODE = 14px/20px box=465x20"   "copy = 14px/20px box=49x28"  (×4)
```

**The 9px `READY` chips now render at 14px/20px in an 85×24 box.** So do `MISSING`, `NOT SET UP` and
the 11px resolved binary paths.

**`OfficeThemePicker` — 6/6**, including the two 7px tags, the smallest text in the phase:

```
"Office Theme = 14px/20px box=577x20"   "current = 14px/20px box=98x20"   "soon = 14px/20px box=56x20"
"The Office = 14px/20px box=69x20"      "Central Perk coffee house = 14px/20px box=172x20"
"Re-skin the pixel office as a TV show. Switching starts a fresh cast. = 14px/20px box=443x20"
```

**`HivePicker` — 4/4**: `CURRENT` and `RECENT` (were 9px) `= 14px/20px box=520x20`;
`p16-hive = box=403x20`; `p16-other-hive = box=401x20`.

**`OnboardingWizard` permissions step — 6/6**, every one `14px/20px`:
`HOW MUCH CAN AGENTS DO ON THEIR OWN?` (600×20), `KEEP WORKING WHILE AWAY`, `DESKTOP NOTIFICATIONS`,
`STAY AWAKE ON POWER (MANUAL)`, `SHARE ANONYMOUS USAGE STATS`, `OPEN AT LOGIN`.

**`AddAgentModal` — 10/10**, including the hire banner and the Row labels:
`Identity = 14px/20px box=150x20`, `Name` / `Character` / `Color = 14px/20px box=692x20`,
`name · character · color = 14px/20px box=150x40`, `⚠️ flags this hire appends to the command:`,
`--verbose`, `code-review`, `skills this hire activates:`,
`review every field — especially the command — before spawning. = 14px/20px box=856x20`.

**The control caught its own vacuity once, and was fixed rather than accepted.** The first
Add-Agent run reported `IDENTITY = MISSING` and `NAME = MISSING`. That was a **probe-casing artifact**
— the labels are `Identity` / `Name` in the DOM with `textTransform: uppercase` — not an unmounted
component. It was re-run with the correct casing and returned 10/10 rather than being written up as
"probably fine". Same failure mode 01-15 hit with `McpDefaultsSettings`, different cause.

### What `npm run e2e` does and does NOT cover for these five files

`npm run e2e` is **2 tests, both green at HEAD** (`the launched app really is Electron 43 or newer`;
`the wizard counts its steps honestly and Michael clocks in on the floor`).

- **Covers, and this is more than 01-15 had:** the second test **walks the whole onboarding wizard**
  — all six steps, the persona gate, the home-field validation, the engine probe chips, the
  back/next counter — so `OnboardingWizard.tsx` **is** exercised end to end after this diff by a
  committed test, and it passed. It also proves the app still boots and reaches the floor.
- **Does NOT cover:** anything inside Settings (`SetupPanel`, `OfficeThemePicker`), the
  `AddAgentModal`, or the `HivePicker` — the committed smoke test never opens any of them. And it
  asserts nothing about **pixel size** anywhere: it matches text, not computed `fontSize`. **A
  sub-14px regression in any of these five files cannot turn `npm run e2e` red.** Every geometry
  number in this SUMMARY comes from the throwaway harness described above and is **not** protected by
  any committed test. Plan 23's `test/repo-claims.test.cjs` is the durable guard, and it is
  source-level (M1), not pixel-level.

### MEASUREMENT UNAVAILABLE — the one sub-surface that did not mount

**`OfficeThemePicker.tsx`'s `ThemeSwitchConfirmModal` (`:186-253`) was never rendered.** It only
mounts when `nonGodAgents().length > 0`, i.e. when at least one non-god, non-assistant worker exists;
the harness's sandbox has only the orchestrator. Its **3 swept sites** — `:221` (Rule 1 display,
`STARTS A FRESH CAST`), `:234` (Rule 2 body, `This can't be undone.`) — plus the untouched 15px block
at `:226` therefore carry **source-level evidence only** (M1 = 0, the same applier, the reviewed
diff), not pixel evidence.

**Exactly what a human must do:** run `npm run dev`, spawn one worker agent, open
Settings → General → Office Theme with the experimental flag on, click a theme other than the current
one, and confirm the confirm-dialog's heading and footnote are not clipped inside its `width: 480`
panel. **Owner: operator, before plan 23.** Not claimed, not quietly dropped.

### MEASUREMENT UNAVAILABLE — operator-only visual judgement

Nobody ran `npm run dev` and **looked** at these five surfaces with human eyes. Automated as far as it
goes: a real Electron 43 window, real `getBoundingClientRect`, Chromium's real AX tree, three
viewport widths, 48 surface-scans, 55 positive-control probes, and a full base-sha differential. What
no automation here reaches is aesthetic judgement — whether the wizard still reads as a wizard with
every label a step larger, and whether the 72px-tall Add-Agent nav buttons still read as a rail.
**Plan 23 must not tick FLOOR-12's visual clause for this group on measured-geometry evidence alone.**

---

## 8. `must_haves` — every truth, with its verdict

| # | Truth | Verdict | Evidence |
|---|---|---|---|
| 1 | "No user-facing text in the onboarding and picker cluster sits below the 14px floor except allowlisted decorative glyphs" | **SATISFIED** | M1 = 0, M1d = 0, M1x = 0 across all five files (§ 2); allowlist empty (§ 5); live: **0** sub-14px rendered text nodes attributable to any of these five files across 48 surface-scans, with all 28 residual strings attributed to other plans' files (§ 7), and 55/55 positive-control probes mounted at ≥ 14px. |
| 2 | "Every icon-only button in these five files has an accessible name; no button with visible text gained an aria-label" | **PARTIAL — stated, not glossed** | **Second clause: fully satisfied** — 0 `aria-label`s added, `grep -c aria-label` 1 → 1, no text-bearing button touched. **First clause: satisfied in effect, not by the prescribed mechanism.** Both ICON-ONLY buttons now have a non-empty accessible name in Chromium's AX tree (`unnamed` 1 → 0, measured at BASE and HEAD), but `OnboardingWizard.tsx:582`'s name is delivered by `title`, not `aria-label`, because `PixelButton` exposes no `aria-label` prop and is byte-pinned by plan 23. The root-cause fix is filed as a blocker (§ 9). |
| 3 | "Nothing was reflowed, moved, dropped, or held below 14px to make room" | **SATISFIED** | **Zero** container integers changed, zero fields moved or dropped, zero sites held below 14px. Proven by a base-sha differential: the overflow lines are byte-identical at BASE and HEAD on every surface at every width (§ 6). Four of five diffs are line-for-line; the fifth adds only comment (§ 1). |
| 4 | "The M1d and M1x blind-spot scans over this group are clean, so no decimal, quoted, ternary or computed sub-14px size ships unexamined" | **SATISFIED** | M1d and M1x both return no output over all five paths, **before and after** (§ 2). Zero M1x hits, so the evaluated-minimum requirement is vacuous and is recorded as such rather than skipped. |

**Artifact:** `src/renderer/src/components/OnboardingWizard.tsx` — "the first-run surface converted to
tokens": 32 → 0 M1 occurrences, `grep -c "cth-text-"` **0 → 32**.

**Key link:** swept sites → `src/renderer/src/design/tokens.css` via `var(--cth-text-*)`, pattern
`cth-text-`. Counts at HEAD: AddAgentModal **35**, OnboardingWizard **32**, SetupPanel **13**,
HivePicker **10**, OfficeThemePicker **10** — **100 total, one per swept site.**

### Acceptance criteria — every numeric gate

| Criterion | Required | Measured | |
|---|---|---|---|
| M1 `AddAgentModal.tsx` (task 2) | 0 (== allowlist) | **0** (was 35) | ✓ |
| M1 `OnboardingWizard.tsx` (task 2) | 0 | **0** (was 32) | ✓ |
| M1d / M1x over both task-2 files | 0 each | **0 / 0** | ✓ |
| `grep -c "cth-font-display"` unchanged (task 2) | unchanged | 3→3, 13→13 | ✓ |
| `grep -c "eslint-disable-next-line"` OnboardingWizard | unchanged, still anchored | 1 → **1**, still `:179` above `:180` | ✓ |
| Every `aria-label` added maps to ICON-ONLY | — | **0 added**; the one name added is `title`, on an ICON-ONLY button (§ 4) | ✓ |
| M1 `SetupPanel` / `HivePicker` / `OfficeThemePicker` (task 3) | 0 each | **0 / 0 / 0** (was 13 / 10 / 10) | ✓ |
| M1d / M1x over all five after the sweep | 0 each | **0 / 0** | ✓ |
| `grep -c "cth-font-display"` unchanged (task 3) | unchanged each | 4→4, 3→3, 4→4 | ✓ |
| `disposeTerminal` region unchanged | no diff | **no output** from the scoped grep | ✓ |
| Frozen allowlist in task notes | literal array or explicit empty | **`[]`, explicitly empty** (§ 5) | ✓ |
| Re-run M1 all five in task notes | present | § 5 table | ✓ |
| `npm run typecheck` | exit 0 | **0** (after task 2, after task 3, final) | ✓ |
| `npm test` TAP | EXIT 0, fail 0, todo 0, skipped ≤ baseline, pass ≥ baseline | **0 / 0 / 0 / 4 / 511** at every checkpoint | ✓ |
| Containment (a) filter empty, `grep -c .` ≥ 1 | empty, ≥ 1 | **empty, 2** | ✓ |
| Containment (b) `grep -c .` | exactly 5 | **5** | ✓ |
| Containment (c) porcelain | empty | **empty** | ✓ |

Every acceptance criterion is satisfied with a real measurement. **None is reported NOT MET.** One
criterion cites a stale baseline — the `426 / 422` TAP counters — and was graded against this plan's
own re-measured `515 / 511`, with the delta recorded in § 2 rather than papered over. The plan's M1
baselines (35/32/13/10/10) were **exact**.

---

## 9. Blockers filed

### NEW — `PixelButton` cannot be given an accessible name by any caller

**Severity: real, repo-wide, and currently invisible.** `PixelButton`'s props are a closed set with no
`aria-label`, and React drops unknown props, so **no call site anywhere in `src/renderer/src` can name
an icon-only PixelButton.** `Icon` hardcodes `aria-hidden`, so any `<PixelButton><Icon/></PixelButton>`
is an unnamed control. This plan found one such button (`OnboardingWizard.tsx:582`) and named it via
`title`; other wave-7 groups may hold more.

**Why it was not fixed here:** `PixelButton.tsx` is pinned byte-identical by plan 23
(`bd286ebf5654a2647c93546dc135f608aeb5d0f0`, asserted intact in § 1) and is outside this plan's
`files_modified`. Editing it would break plan 23's pin and this plan's containment criterion (a).

**The fix, when someone owns that file:** add `'aria-label'?: string` to `PixelButtonProps` and
forward it onto the `<button>`. Two lines. Then convert `OnboardingWizard.tsx:582` from `title` to
`aria-label` and delete the explanatory comment that rides with it.

**Owner: plan 23** (which holds the pin), or any plan that legitimately holds `PixelButton.tsx`.

### CARRIED FORWARD — `SettingsModal.tsx:1008`'s notification copy

Not this plan's file (01-15's group). Recorded here only to confirm it is **still standing** and was
not silently absorbed. Owner remains plan 23's wave-9 doc-claim sweep.

### CARRIED FORWARD — two MEASUREMENT UNAVAILABLE items

`ThemeSwitchConfirmModal` never mounted (§ 7), and the operator visual check (§ 7). Both owner:
operator, before plan 23.

---

## 10. Cross-plan observations — FOUND, NOT FIXED (out of scope, filed for the owner)

The live scan sees whole surfaces, not just this plan's files, so it incidentally measured wave-mates'
work. **None was touched** — that would have broken containment criterion (a).

| Finding | File | Owner |
|---|---|---|
| **`folderName()` does not split Windows paths.** `HivePicker.tsx:18` splits on `/` only, so on Windows `C:\Users\…\Temp\p16-hive` renders as the single 45-character token `C:UsersATempp16-hive`. Measured: with a Windows-shaped path the picker reports **7 overflows** at every width; with a POSIX path, **0**. This is a **pre-existing bug** (it overflows at the old 11px too) that the floor sweep makes ~27% worse, and it is a *logic* fix, not a size fix — outside a `fontSize` sweep's authority under this plan's truth 3. | `HivePicker.tsx:18` | **this file is 01-16's, but the fix is out of this plan's scope** — filed for plan 23 or a follow-up |
| 6 vertical overflows on the floor's terminal column at 1024px, identical at BASE and HEAD | `PtyTerminalView.tsx` | 01-20 |
| `9px "QUEUE"` | `MessageQueueComposer.tsx` | 01-19 |
| `10px "✕"` modal close | `Modal.tsx` | 01-20 |
| `8px "Updates"`, `13px "You're on v0.4.4"`, `12px "Updates are checked automatically…"` | `UpdatesSection.tsx` | 01-20 |
| `10px "COMMAND CENTER"`, `12px "Michael runs the floor"` | `CommandCenterPanel.tsx` | 01-17 |
| `13px` × 10 sidebar tab labels | `SidebarTabs.tsx` / `CommandCenterPanel.tsx` | 01-20 / 01-17 |
| `10px "WAKING THE FLOOR"`, `13px "auto mode on"`, `13px "v 0.4.4"`, `13px "☾"`, `12px "🧠 memory"` | `App.tsx` | 01-19 |

---

## 11. Deviations from plan

### Auto-fixed

**1. [Rule 1 — Bug] The sweep applier corrupted a site whose line-height precedes its font-size**
- **Found during:** Task 1/2, by the applier's own **dry run** — before a single file was written.
- **Issue:** `OnboardingWizard.tsx:645` is `<p style={{ margin: 0, lineHeight: '20px', fontSize: 12, … }}>`,
  the only site in the group where `lineHeight` sits *before* `fontSize` on the same line. The applier
  tokenised the line-height first, growing the string by 17 characters, which invalidated the cached
  byte offset of the `fontSize` — so the size replacement landed 17 characters early, inside a
  neighbouring property, and left the real `fontSize: 12` behind. The dry run made it visible as a
  **101-site total with `:645` listed twice**, against a pinned baseline of 100.
- **Fix:** Reordered the applier so the size is rewritten at its known offset **first**, then the
  line-height. Fixed at source with a comment naming the failure; re-run returned exactly 100.
- **Files modified:** none in the repo (throwaway applier). **This is why the dry run existed.**

**2. [Rule 2 — Accessibility correctness] `OnboardingWizard.tsx:582` had no accessible name at all**
- **Found during:** Task 1's button inventory; **confirmed live** at the base sha (`unnamed=1`,
  AX name `""`).
- **Issue:** `<PixelButton><Icon name="x" /></PixelButton>` — `Icon` hardcodes `aria-hidden`, so the
  remove-project control announced as a bare "button".
- **Fix:** `title={`Remove ${r}`}` — verified against the AX tree as
  `"Remove /tmp/p16-probe-repo"`. Root-cause fix (an `aria-label` prop on `PixelButton`) blocked by
  plan 23's byte pin and filed as a blocker (§ 9).
- **Files modified:** `src/renderer/src/components/OnboardingWizard.tsx`. **Commit:** `3c16ce8`.

**3. [Rule 3 — Blocking] The first harness run measured a bug instead of the sweep**
- **Found during:** Task 3's live verification.
- **Issue:** Seeding the sandbox with Windows-shaped hive paths made `HivePicker` report **7
  overflows**, which read as a containment failure caused by the sweep.
- **Fix:** Re-measured with POSIX paths (**0 overflows**) *and* built the base sha and ran the
  identical probe against it, proving the overflow is pre-existing and unrelated. The root cause —
  `folderName()` not splitting `\` — is recorded in § 10, **not** silently absorbed.

**4. [Rule 1 — Bug] The zero-width probe reported 8 phantom defects**
- **Found during:** Task 3's first harness run.
- **Issue:** `<option>` elements inside a closed `<select>` have no layout box, so every model name on
  the orchestrator step scored as "zero-width text".
- **Fix:** `OPTION` excluded and counted separately (`opts=8`), so the exclusion is visible on the page
  rather than silent.

### Reported, not "fixed"

**5. The plan's TAP baseline is stale** — `426 / 422` pinned, live **515 / 511**. Re-measured, the live
figure used as the gate, the delta recorded (§ 2). Identical to the staleness 01-15 found. The plan's
M1 baselines were exact.

**6. `must_haves` truth 2 is PARTIAL, not green** (§ 8). The name is real and measured, but it is not
`aria-label`, and the reason is a pin this plan may not break. Reported rather than rounded up.

**7. `ThemeSwitchConfirmModal` was never mounted** (§ 7) — 3 swept sites carry source-level evidence
only. Named, with the exact operator steps, rather than folded into the clean scan.

**8. `HivePicker.tsx`'s `folderName()` Windows bug is in one of THIS plan's own files and was still
not fixed** (§ 10). It is a logic change, not a size change; this plan's truth 3 and its action text
("change no copy, no layout") do not authorise it, and 01-15 set the precedent by refusing
`SettingsModal.tsx:1008` on the same grounds.

### Anchor drift

**None.** Every line number the plan cites was exact at the base sha: `OnboardingWizard.tsx:179`'s
eslint-disable, `OnboardingWizard.tsx:100-627`'s `autoMode` references, and
`OfficeThemePicker.tsx:73`'s `disposeTerminal` call. Four of five files have line-for-line diffs, so
every line number in this SUMMARY is valid at `6e13162` and at `d523a06` alike; in
`OnboardingWizard.tsx` only, anchors **below `:582`** shift by +7 at HEAD.

---

## 12. Verification

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | **exit 0** (after task 2, after task 3, final) |
| Unit suite | `node --test --test-reporter=tap test/*.test.cjs` | **exit 0** · tests 515 · pass 511 · **fail 0** · skipped 4 · todo 0 — identical at every checkpoint |
| Bundle | `npm run build` (Node 22.23.2 / npm 10.9.8) | **exit 0** (×3: HEAD, base-sha, HEAD again) |
| End-to-end | `npm run e2e` (real Electron 43) | **2 passed** — and one of them walks the whole wizard |
| Live layout | throwaway Playwright harness, 16 surfaces × 3 widths, BASE **and** HEAD | overflow **identical to base**, zeroWidth **0**, sub14 **0** in this plan's files, unnamed **1 → 0**, positive control **55/55** |
| Containment | (a) filtered per-commit · (b) path-scoped `-c .` · (c) porcelain | **empty · 5 · empty** |
| Hygiene | `tr -d -c '\000'` per file; `file` per file | **0 NUL bytes** in all five; `OfficeThemePicker.tsx` still **LF**, the other four still **CRLF**, exactly as at the base sha |

There is no lint/format/secret-scan tooling in this repo (no `lint` script, no `.husky`, no
`.git/hooks`, no `.pre-commit-config.yaml` — verified this session) — typecheck, the unit suite, the
build and the e2e suite ARE the gate, and all four are green locally at `d523a06`.

### CI — green on the remote, all six jobs, at `d523a06`

Pushed to `origin/gsd/v1.0-milestone` (`6e13162..d523a06`), PR #77's CI pointer.

| Workflow | Job | Result | TAP |
|---|---|---|---|
| CI | Typecheck | **success** | — |
| CI | Build | **success** | — |
| CI | Test (ubuntu-latest) | **success** | tests 515 · pass **515** · fail **0** · skipped 0 · todo 0 |
| CI | Test (macos-latest) | **success** | tests 515 · pass **515** · fail **0** · skipped 0 · todo 0 |
| CI | Test (windows-latest) | **success** | tests 515 · pass **511** · fail **0** · skipped 4 · todo 0 |
| E2E | Electron smoke (ubuntu-latest) | **success** | 2 passed against real Electron 43 |

Runs `32472447573` (CI) and `32472447586` (E2E). Byte-identical to the `6e13162` baseline and to
01-15's `0030a14`: the four Windows skips are the platform's own, not a red test hidden by this sweep.

**Requirement row:** `FLOOR-12` deliberately left **Pending** in `.planning/REQUIREMENTS.md`, matching
the 01-02 … 01-15 precedent — **plan 23 owns the checkboxes**. FLOOR-12 is not closeable here in any
case: 343 of the original 604 M1 occurrences remain and belong to plans 17–20.

---

## 13. Handoff

**To plans 01-17 … 01-20 (same wave):** repo-wide M1 at `d523a06` is **343 occurrences / 50 files**.
Four things worth copying:

1. **Classify by the enclosing style OBJECT, not by the fontSize's line.** 27 of this group's 100
   sites take Rule 1 because of a `fontFamily` that is not on the same line. A same-line classifier
   would have converted a quarter of the display face to body tokens.
2. **Run your applier dry first and cross-check its totals against something independent.** The dry
   run caught a real offset bug here, and the display count had to equal the sum of
   `grep -c cth-font-display` — it did, which is how the classification was trusted before any write.
3. **Measure the BASE SHA with the identical probe.** "Did the sweep break containment" becomes a
   diff instead of a judgement. It is one extra `git checkout <base> -- <paths>` + `npm run build`,
   and here it converted 7 alarming overflows into a proven pre-existing bug.
4. **Read accessible names off `Accessibility.getFullAXTree`, not off `aria-label ?? textContent`.**
   The DOM heuristic would have scored `OnboardingWizard.tsx:582` as "named" after the fix and as
   "named" before it — it was neither. **And check your own group for
   `<PixelButton><Icon/></PixelButton>`: every one of them is an unnamed control today** (§ 9).

**To plan 01-23 (wave 9):** this group's Rule 0 allowlist is `[]` — **empty, explicitly**. Do not look
for entries. M1 over all five files is 0, so allowlist size == post-sweep count == 0.
`test/repo-claims.test.cjs` was **not** edited here. `FLOOR-12` is still `Pending` in REQUIREMENTS.md
by design. Four live items: the `PixelButton` `aria-label` blocker (§ 9, **yours — you hold the
pin**), `HivePicker.tsx:18`'s Windows `folderName()` bug (§ 10), the unmounted
`ThemeSwitchConfirmModal` (§ 7), and the operator visual check (§ 7).

---

## Self-Check: PASSED

```
FOUND: src/renderer/src/components/AddAgentModal.tsx
FOUND: src/renderer/src/components/OnboardingWizard.tsx
FOUND: src/renderer/src/components/SetupPanel.tsx
FOUND: src/renderer/src/components/HivePicker.tsx
FOUND: src/renderer/src/components/OfficeThemePicker.tsx
FOUND: .planning/phases/01-finish-the-floor/01-16-SUMMARY.md
FOUND commit: 3c16ce8  fix(01-16): sweep the add-agent modal and onboarding wizard to the 14px floor
FOUND commit: d523a06  fix(01-16): sweep the setup panel and the two pickers to the 14px floor
REMOVED (as intended): e2e/zz-floor12-p16-measure.spec.ts — `ls e2e/` is `smoke.spec.ts` alone,
                       `git status --porcelain` is empty
PIN INTACT: src/renderer/src/components/PixelButton.tsx = bd286ebf5654a2647c93546dc135f608aeb5d0f0
```

Both commits are on `origin/gsd/v1.0-milestone` and all six CI jobs are green at `d523a06`.
