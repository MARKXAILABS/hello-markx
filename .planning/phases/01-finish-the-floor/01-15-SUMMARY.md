---
phase: 01-finish-the-floor
plan: 15
subsystem: ui
tags: [floor-12, typography, design-tokens, accessibility, settings, electron, playwright]

requires:
  - phase: 01-finish-the-floor
    provides: "01-14's corrected token layer — display-md/body-md/mono-md all 14px, --cth-text-display-sm and --cth-lh-display-sm DELETED, --cth-lh-mono singular"
provides:
  - "The settings cluster (5 files, 129 M1 occurrences) clears the 14px floor entirely: M1 = 0, M1d = 0, M1x = 0"
  - "SettingsHeroCard.tsx:88's decimal `fontSize: 12.5` — a site M1's regex structurally cannot see — closed"
  - "This group's frozen Rule 0 allowlist for plan 23: EMPTY (M3 returns zero candidates across all five files)"
  - "Six container integers in SettingsModal.tsx raised by deltas measured in a running Electron 43 window"
  - "Repo-wide M1 572 -> 443 occurrences / 60 -> 55 files; the wave-7 arithmetic closes exactly"
affects: [01-16, 01-17, 01-18, 01-19, 01-20, 01-23]

tech-stack:
  added: []
  patterns:
    - "Line-number-keyed sweep applier with a per-site anchor assertion: a drifted line fails loudly instead of rewriting the wrong declaration"
    - "CDP Emulation.setDeviceMetricsOverride is the only route that moves an Electron BrowserWindow's LAYOUT viewport — setBounds/setContentSize were both measured to leave window.innerWidth pinned"
    - "Positive control before a negative one: 19 probed strings from this plan's five files must be FOUND and >= 14px, so a clean sub-14px scan cannot pass over a component that never mounted"

key-files:
  created: []
  modified:
    - src/renderer/src/components/SettingsModal.tsx
    - src/renderer/src/components/SettingsHeroCard.tsx
    - src/renderer/src/components/McpDefaultsSettings.tsx
    - src/renderer/src/components/AiEnginesSettings.tsx
    - src/renderer/src/components/ClaudeAccountsSettings.tsx

key-decisions:
  - "Migrated onto the corrected token layer rather than patching literals — the operator's standing root-cause directive, and the only form under which plan 14's token work has a consumer"
  - "The nav rail's +43 was measured, not derived: 'Prerequisites' is a single unbreakable word at 182px intrinsic, while the three LONGER labels ('Autonomy & Budgets' at 252px) do not overflow at all because they wrap on their spaces. Arithmetic on the longest label would have sized the rail for the wrong string."
  - "ZERO aria-labels added, and reported as the correct outcome rather than a miss — every button in all five files already carries visible text or an existing label"
  - "The group's Rule 0 allowlist is EMPTY and no exemption was manufactured to have something to freeze"
  - "SettingsModal.tsx:1008's notification-copy blocker STANDS — this plan's own truth 3 and its action text both forbid copy changes"

patterns-established:
  - "Orphan line-heights: a px lineHeight sitting on its own line is invisible to a same-line sweep and needs a second scan — 6 of them across this group"
  - "Unitless line-heights (1.5) are ratios that already scale and are left alone; px line-heights become their --cth-lh-* token; objects with none gain the paired token"

requirements-completed: [FLOOR-12]

duration: 2h20m
completed: 2026-08-21
---

# Phase 01 Plan 15: Settings-Cluster Floor Sweep Summary

**The settings cluster — 129 sub-14px `fontSize` occurrences across five files, the phase's largest single surface — is on the corrected token layer with M1/M1d/M1x all zero, six container integers raised by live-measured deltas, and zero overflow / zero zero-width text / zero unnamed buttons verified in a real Electron 43 window at three viewport widths.**

## Performance

- **Duration:** 2h20m
- **Tasks:** 3 of 3
- **Files modified:** 5
- **Commits:** 2 (`5b941b9`, `19d8051`)

---

## 1. Base sha, commits, and the containment proof

**Base sha (task 1):** `3b2d03e84c5ef23ee5adfdad38b63c3cdf4ae256`
**Branch:** `gsd/v1.0-milestone` (main working tree, `use_worktrees: false`, five wave-mates sharing it)

### `5b941b9` — `fix(01-15): sweep SettingsModal to the 14px floor and contain the six boxes it broke`

```
 src/renderer/src/components/SettingsModal.tsx | 202 +++++++++++++-------------
 1 file changed, 101 insertions(+), 101 deletions(-)
```

101 changed lines = 93 M1 sites + 2 orphan line-heights + 6 container integers. Line-for-line: no line added, none removed, no EOL churn.

### `19d8051` — `fix(01-15): sweep the four remaining settings files, incl. the site M1 cannot see`

```
 src/renderer/src/components/AiEnginesSettings.tsx  | 16 ++++++-------
 .../src/components/ClaudeAccountsSettings.tsx      | 26 +++++++++++-----------
 .../src/components/McpDefaultsSettings.tsx         | 22 +++++++++---------
 src/renderer/src/components/SettingsHeroCard.tsx   | 18 +++++++--------
 4 files changed, 41 insertions(+), 41 deletions(-)
```

41 = 36 M1 + 1 M1d + 4 orphan line-heights.

### Containment, asserted three ways over `3b2d03e..HEAD`

**(a) Per-commit, filtered — the check that catches a genuine cross-set edit.**

```
$ BASE=3b2d03e84c5ef23ee5adfdad38b63c3cdf4ae256
$ SHAS=$(git log --format=%H "$BASE"..HEAD -- <this plan's five paths>); echo "$SHAS"
19d8051354b4ee15bc7fa61bc20ae18915d2d95e
5b941b9db6a1967c96171d7a406aacb777c23fd6
$ echo "$SHAS" | grep -c .
2                                       # >= 1, so the loop below is not empty for the wrong reason
$ for sha in $SHAS; do git show --name-only --format= "$sha"; done | sort -u \
    | grep -vE "^(src/renderer/src/components/(SettingsModal|SettingsHeroCard|McpDefaultsSettings|AiEnginesSettings|ClaudeAccountsSettings)\.tsx)?$"
                                        # NO OUTPUT — PASS
```

**(b) Path-scoped and positive — all five declared paths actually moved.**

```
$ git diff --name-only "$BASE"..HEAD -- <the five paths> | sort -u
src/renderer/src/components/AiEnginesSettings.tsx
src/renderer/src/components/ClaudeAccountsSettings.tsx
src/renderer/src/components/McpDefaultsSettings.tsx
src/renderer/src/components/SettingsHeroCard.tsx
src/renderer/src/components/SettingsModal.tsx
$ ... | grep -c .
5                                       # exactly 5 — PASS
```

**(c) Nothing left behind.**

```
$ git status --porcelain -- <the five paths>
                                        # empty — PASS
$ git status --porcelain                # whole tree, context only
                                        # empty
```

Every commit was made with an explicit pathspec (`git add -- <paths>` then `git commit -F <msg> -- <paths>`). No `git add -A`, no `git add .`, no `git commit -a`. No `git clean` and no blanket reset at any point.

---

## 2. Measurement — task 1, pinned commands and their pasted output

### M1 — the sweep surface, BEFORE and AFTER

Command, verbatim and unmodified:
`grep -hoE "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" <file> | wc -l`

**The unit is OCCURRENCES (`grep -o`), not lines (`grep -c`)** — the same unit and the same regex plan 23 asserts in wave 9. Both units were taken at baseline and they are equal in all five files, so wave 7 and wave 9 reconcile rather than disagreeing.

| File | plan text | BASELINE occ | BASELINE lines | **AFTER occ** | allowlist |
|---|---|---|---|---|---|
| `SettingsModal.tsx` | 92 | **93** | 93 | **0** | 0 |
| `ClaudeAccountsSettings.tsx` | 12 | **12** | 12 | **0** | 0 |
| `McpDefaultsSettings.tsx` | 9 | **9** | 9 | **0** | 0 |
| `SettingsHeroCard.tsx` | 8 | **8** | 8 | **0** | 0 |
| `AiEnginesSettings.tsx` | 7 | **7** | 7 | **0** | 0 |
| **group total** | **128** | **129** | 129 | **0** | **0** |

**Delta recorded, as the plan asks.** The plan's objective and its acceptance criteria pin `SettingsModal` at **92** and the group at **128**; live source at the base sha carries **93** and **129**. The `01-14-SUMMARY.md` § 9 handoff — measured later, at `cea311e` — already says **93 / 129**, so the plan text is the stale number and the handoff is correct. The extra occurrence is real work, and it is swept.

**Positive control on the AFTER zero.** A zero from a broken regex is not a zero. The same command over the whole renderer at HEAD still returns **443 occurrences across 55 files**, and `grep -rlE …` still lists `App.tsx`, `AddAgentModal.tsx`, `AgentCard.tsx` and 52 others. The regex is alive; the five zeros are real.

### M1d — decimal and quoted sub-14 literals (blind spot #1)

```
$ grep -rnoE "fontSize *[:=] *\{?['\"]?(1[0-3]|[1-9])\.[0-9]+|fontSize *[:=] *\{?['\"](1[0-3]|[1-9])(\.[0-9]+)?px['\"]" <the five paths>
BEFORE:  src/renderer/src/components/SettingsHeroCard.tsx:88:fontSize: 12.5
AFTER :  (no output, exit 1)
```

Exactly the one hit the plan predicts, and it is closed:

```
$ grep -cE "fontSize: 12\.5" src/renderer/src/components/SettingsHeroCard.tsx
0            # was 1
```

That site is the plan blurb under the hero card — ordinary user-facing prose — and took **Rule 2** exactly as a `fontSize: 12` would. M1 never saw it, so the per-file M1 count above cannot gate it and this criterion is what does.

### M1x — expression-valued sizes (blind spot #2)

```
$ grep -rnE "fontSize *[:=] *\{?[A-Za-z_\$]" <the five paths>
BEFORE:  (no output, exit 1)
AFTER :  (no output, exit 1)
```

**Zero M1x hits before and after**, exactly as the plan predicts. There is therefore no evaluated minimum to record for this group: the set of expression-valued sizes is empty, not unexamined. (Note `AiEnginesSettings.tsx:169` carries `<ProviderLogo … size={12} />` — a component prop, not a `fontSize`, and not a text size.)

### M3 — the Rule 0 glyph predicate, scoped to this group

```
$ export LC_ALL=C.UTF-8
$ grep -rnP ">\s*([^A-Za-z0-9\s<>{}/]|\{[a-zA-Z]+ \? '[^A-Za-z0-9]' : '[^A-Za-z0-9]'\})\s*</" <the five paths>
(no output, exit 1)
```

**Zero candidates**, confirming UI-SPEC's 30-candidate table, which names no glyph-only element in any of these five files. Verified by re-run rather than assumed.

### Dangling `display-sm` references

```
$ grep -rn "cth-text-display-sm\|cth-lh-display-sm" <the five paths>
(no output, exit 1)
```

No file in this group referenced the two tokens plan 14 deleted, so there is nothing to report as a dangling `var()`.

### TAP counters

Named reporter, written through `mktemp` — never to a fixed repo-root name, because six plans share one working tree in this wave and a shared `sweep.tap` would be truncated mid-grep by a wave-mate.

```
$ TAP=$(mktemp); node --test --test-reporter=tap test/*.test.cjs > "$TAP"; echo "EXIT=$?"; grep -E "^# (tests|pass|fail|skipped|todo) " "$TAP"; rm -f "$TAP"
```

| | plan text | **task 1 BASELINE** | after task 2 | **after task 3** | gate |
|---|---|---|---|---|---|
| `EXIT` | 0 | **0** | 0 | **0** | must be 0 |
| `# tests` | 426 | **515** | 515 | **515** | — |
| `# pass` | 422 | **511** | 511 | **511** | no lower than baseline |
| `# fail` | 0 | **0** | 0 | **0** | must be 0 |
| `# skipped` | 4 | **4** | 4 | **4** | no higher than baseline |
| `# todo` | 0 | **0** | 0 | **0** | must be 0 |

The plan's `426/422` is stale — waves 5 and 6 added tests since it was written. **This plan's baseline is the 515/511 it measured itself**, and `# pass` did not fall and `# skipped` did not rise. This plan adds no tests, so any rise in `# skipped` would have been a red test hidden rather than fixed.

---

## 3. Per-file rule classification (task 1)

Every one of the 129 sites falls into exactly one rule, checked in order, with no judgement at the site. Rule 1b and Rule 3 do not apply to this group (their five sites all belong to plan 14). Rule 0 has no members here.

**Tokens used, from plan 14's corrected layer:**

| Rule | size token | line-height token |
|---|---|---|
| 1 — object sets `--cth-font-display` | `var(--cth-text-display-md)` (14px) | `var(--cth-lh-display-md)` (20px) |
| 2 — object sets `--cth-font-mono` | `var(--cth-text-mono-md)` (14px) | `var(--cth-lh-mono)` (20px, **singular** — there is no `-md`/`-sm` pair) |
| 2 — everything else | `var(--cth-text-body-md)` (14px) | `var(--cth-lh-body-md)` (20px) |

**`fontFamily` is UNCHANGED at every Rule 1 site.** `grep -c "cth-font-display"` is byte-for-byte identical before and after in all five files — 22 / 3 / 3 / 2 / 2 — so no display face was retired. Press Start 2P stays; `DESIGN.md:706` is a size rule.

### `SettingsModal.tsx` — 93 M1, 0 M1d, 0 M1x

| Rule | count | sites (declaration lines at the base sha) |
|---|---|---|
| **1** (display) | **21** | 76 (`slackLabelStyle`, hoisted), 869 (nav button), 912, 961, 997, 1026, 1106, 1147, 1172, 1197, 1279, 1302, 1359, 1380, 1540, 1560, 1744, 1834, 1915, 1944, 2031 |
| **2** (mono) | **5** | 760, 1413, 1515, 1587, 1657 |
| **2** (body) | **67** | 69 (`slackInputStyle`, hoisted), 758, 786, 791, 798, 917, 940, 969, 970, 980, 981, 1004, 1007, 1033, 1036, 1053, 1056, 1072, 1075, 1112, 1123, 1130, 1153, 1161, 1179, 1182, 1204, 1221, 1255, 1256, 1267, 1286, 1287, 1309, 1312, 1329, 1332, 1366, 1384, 1391, 1496, 1522, 1547, 1564, 1571, 1593, 1599, 1716, 1726, 1734, 1751, 1754, 1790, 1806, 1815, 1819, 1841, 1844, 1895, 1899, 1921, 1924, 1949, 1955, 1981, 2018, 2034 |

**Hoisted objects and every element that consumes them** — the enumeration that decides whether a local override is needed:

| Hoisted object | Rule | consumers | glyph consumer? |
|---|---|---|---|
| `slackInputStyle` (`:62`, `fontSize: 13`, `--cth-font-ui`) | 2 body | 20 sites: `:1159 :1219 :1231 :1240 :1249 :1429 :1440 :1452 :1462 :1515 :1626 :1657 :1679 :1710 :1777 :1799 :1869 :1883 :1968 :2008` — every one an `<input>` or a `<select>` | **none** |
| `slackLabelStyle` (`:74`, `fontSize: 8`, `--cth-font-display`) | 1 display | 18 sites: `:1213 :1225 :1234 :1243 :1423 :1434 :1447 :1456 :1472 :1505 :1651 :1673 :1706 :1769 :1795 :1862 :1879 :2000` — every one a `<label>` or a text `<span>` | **none** |

Neither hoisted object serves a glyph-only element, so **no local `fontSize` override was created and no allowlist entry exists** — exactly the outcome UI-SPEC's hoisted-object rule is designed to produce when the object is text-only. Two spread consumers carry their own `fontSize` and were classified independently: `:1515` and `:1657` (both `{...slackInputStyle, fontFamily: mono, fontSize: 12}` → Rule 2 mono), and each inherits the swept base's line-height rather than gaining a redundant one.

**Deliberately NOT swept in `SettingsModal.tsx`:**

| Site | Value | Why |
|---|---|---|
| `:824` | `fontSize: 15, lineHeight: '22px'` | Already above the floor. Out of the sweep's 7–13 range entirely. |
| `:935` | `fontSize: 'var(--cth-text-display-md, 14px)', lineHeight: '20px'` | Plan 10's Log folder header (FLOOR-05), written at the corrected size on purpose. Not an M1 site. The plan says do not re-touch it. `20px` is already the token's value. |
| `:951` | `fontSize: 'var(--cth-text-body-md, 14px)', lineHeight: '20px'` | Same — plan 10's Log folder error line. |

Its neighbouring section-header style **was** in scope and is swept: the plan names it as `:882-886`; anchor drift puts it at **`:911-913`** (`fontSize: 8`, Rule 1). The `fontSize: 13` row div at `:940` **inside** the Log folder block is also an M1 site and is swept — sweeping it UP is the sweep, not the "normalise back down" the plan forbids, and the per-file count could not reach 0 otherwise. `grep -c openLogs` is **2**, unchanged.

### `SettingsHeroCard.tsx` — 8 M1 + 1 M1d

| Line | value | family in object | rule |
|---|---|---|---|
| 70 | 13, `lineHeight: '20px'` | display | 1 |
| 75 | 12, no lh | mono | 2 mono |
| 80 | 9, no lh | display | 1 |
| **88** | **12.5**, `lineHeight: 1.5` | none | **2 body (M1d)** |
| 104 | 12, `lineHeight: 1.5` | none | 2 body |
| 120 | 9, no lh | display | 1 |
| 123 | 13, no lh | none | 2 body |
| 124 | 12, no lh | none | 2 body |
| 153 | 12, no lh | none | 2 body |

All inline; no hoisted objects.

### `McpDefaultsSettings.tsx` — 9 M1

`:23` `labelStyle` (hoisted, `fontSize: 8`, display) → Rule 1; **one consumer**, `:54` `{...labelStyle, marginBottom: 6}` on the "Default MCP servers" text `<div>`. No glyph consumer. Then `:55` (12, body), `:70` (8, display), `:76` (11, body), `:95` (12, body), `:100` (11, **mono** — the `<code>` server id), `:105` (12, body), `:121` (8, display — the on/off toggle button), `:139` (12, body).

### `AiEnginesSettings.tsx` — 7 M1

Three hoisted objects, all text-only consumers: `:43` `inputStyle` (13, `--cth-font-ui` → Rule 2 body; consumers `:151 :176 :182`, all `<input>`), `:49` `labelStyle` (8, display → Rule 1; consumers `:141 :168`, both `<label>`), `:55` `headStyle` (8, display → Rule 1; consumers `:128 :138 :165`, all text `<div>`). Then `:129`, `:158`, `:187`, `:195` — all Rule 2 body.

### `ClaudeAccountsSettings.tsx` — 12 M1

Hoisted: `:26` `inputStyle` (13, `--cth-font-ui` → Rule 2 body; four `<input>` consumers), `:32` `labelStyle` (8, display → Rule 1; consumers `:167 :218`), `:38` `headStyle` (8, display → Rule 1; consumer `:136`). `:41` `mono` sets `fontFamily` only and carries no size. Inline: `:137` `:151` `:168` `:175` `:183` `:211` `:236` (body), `:180` (**mono** — the account-id chip, because `...mono` spreads *after* `fontSize` in that object), and `:167` `{...labelStyle, fontSize: 9}` — a local override on a display-family spread, so Rule 1, converted to the display token rather than deleted.

### The line-height convention, applied uniformly (copied from 01-14 § 5)

- a **px** line-height becomes its matching `--cth-lh-*` token — **86** of them (74 SettingsModal + 12 in the four);
- a **unitless** one (`1.5` at `SettingsHeroCard.tsx:88` and `:104`) is a ratio that already scales and is **left alone**;
- an object with **no** line-height gains the paired token — **33** of them (15 SettingsModal + 18 in the four), so its box is deterministic at the floor rather than dependent on Press Start 2P's unusual `normal` metrics.

**A defect the same-line pass could not see, found and fixed.** Six px line-heights sit on their **own** line, one below their `fontSize` — `SettingsModal.tsx:77` and `:870`, `McpDefaultsSettings.tsx:24` and `:122`, `AiEnginesSettings.tsx:50`, `ClaudeAccountsSettings.tsx:33`. A same-line sweep raises the text to 14px and leaves a **12px line box** underneath it. Caught by re-scanning for `lineHeight: '\d+px'` after the sweep and fixed in the same commits. Only the three deliberate exclusions above survive that scan.

---

## 4. Button inventory (task 1) and the accessible-name pass

Every `<button>` and `<PixelButton>` in the group, classified NAMED (visible text content) or ICON-ONLY (needs `aria-label`):

| File | native `<button>` | PixelButton | ICON-ONLY | already-labelled |
|---|---|---|---|---|
| `SettingsModal.tsx` | 5 | 40 | **0** | 2 |
| `SettingsHeroCard.tsx` | 0 | 5 | **0** | 0 |
| `McpDefaultsSettings.tsx` | 1 | 0 | **0** | 0 |
| `AiEnginesSettings.tsx` | 0 | 2 | **0** | 0 |
| `ClaudeAccountsSettings.tsx` | 0 | 4 | **0** | 0 |
| **total** | **6** | **51** | **0** | **2** |

The six native buttons: `SettingsModal.tsx:773` (option row — renders a title span and a description span), `:857` (nav — renders `{section}`), `:1118` (model chip — renders `{m.label}`), `:1369` and `:1549` (the two `i` help toggles — **already** carry `aria-label="Show Slack connect steps"` and `aria-label="Show webhook API format"`, plus `aria-expanded`), and `McpDefaultsSettings.tsx:109` (renders `{on ? 'on' : 'off'}`). All 51 PixelButtons were enumerated by parsing their element bodies; every one renders visible text.

### Zero `aria-label`s were added, and that is the finding

**Nothing was manufactured to satisfy a count.** Zero icon-only buttons lack an accessible name across all five files, so there was nothing to add. The only way to raise `grep -c aria-label` here would be to put a label on a button with visible text — which *overrides* the visible label and degrades voice control, the exact anti-pattern UI-SPEC bans and threat **T-P15-04** in this plan's own register. Same call as 01-14's `AgentStrip` non-addition, 01-10's README non-rename and 01-04's `CONTRIBUTING.md` pin.

**Proven, not asserted.** The live run walked all seven Settings tabs at three viewport widths and counted buttons whose accessible name (`aria-label` ?? `textContent`) is empty: **`unnamedButtons=0` on 7/7 tabs at 1280x900, 1024x768 and 800x600** — 21 independent measurements.

The two `i` buttons deserve a note: their content is the literal character `i`, which is alphanumeric, so M3's predicate correctly excludes them from the Rule 0 glyph set. They are icon-*like* controls that were **already** correctly labelled before this plan ran.

---

## 5. Rule 0 — this group's frozen allowlist for plan 23

```js
[]
```

**EMPTY. Zero entries across all five files.**

The M3 predicate returns zero candidates here (§ 2), UI-SPEC's 30-candidate table names no element in any of these files, and neither hoisted style object serves a glyph. Per 01-14's rule 3 — *"glyphs with no `fontSize` of their own take `aria-hidden` and no allowlist entry; do not invent a sub-14px override just to have something to allowlist"* — nothing was manufactured.

Consequence for plan 23's completeness bar: for this group, **allowlist size (0) == M1 occurrences after (0)** in every file. `test/repo-claims.test.cjs` was **not** edited here — it is not this wave's to hold.

| File | M1 occ before | M1 occ after | allowlist entries | equal? |
|---|---|---|---|---|
| `SettingsModal.tsx` | 93 | **0** | **0** | ✓ |
| `ClaudeAccountsSettings.tsx` | 12 | **0** | **0** | ✓ |
| `McpDefaultsSettings.tsx` | 9 | **0** | **0** | ✓ |
| `SettingsHeroCard.tsx` | 8 | **0** | **0** | ✓ |
| `AiEnginesSettings.tsx` | 7 | **0** | **0** | ✓ |
| **total** | **129** | **0** | **0** | ✓ |

### Repo-wide arithmetic, so wave 9 reconciles

| | occurrences | files |
|---|---|---|
| after 01-14 (`cea311e`), per its SUMMARY | 572 | 60 |
| this plan's group | −129 | −5 |
| **measured at HEAD (`19d8051`)** | **443** | **55** |

`572 − 129 = 443` and `60 − 5 = 55`. Both close exactly. Remaining wave-7 groups: 01-16 100, 01-17 110, 01-18 68, 01-19 85, 01-20 75 = 438, plus 01-14's 5 allowlisted = **443**. ✓

---

## 6. Containment — every container integer changed, with its measured delta

UI-SPEC's three steps applied in order. **Nothing was reflowed, moved, dropped, collapsed, or held below 14px to make room.** Every delta below was read off `getBoundingClientRect` / `scrollWidth` / `scrollHeight` in a **running Electron 43 window**, never computed from font metrics — the 01-14 lesson, whose one arithmetic-only container was the one that was wrong.

| # | Container | Before | After | Δ | How the delta was MEASURED | Step |
|---|---|---|---|---|---|---|
| 1 | `SettingsModal.tsx:848` nav rail `width` | **160** | **203** | **+43** | `"Prerequisites"` button reported `scrollW=198 clientW=155 overflowX=43`; the rail div itself `scroll=201 vs client=158`. Canvas `measureText` at the computed 14px Press Start 2P: 182px intrinsic. | 2 |
| 2 | `SettingsModal.tsx:1376` Slack `i` button | `16 × 16` | `18 × 18` | **+2** | `dy=2` (scrollH 18 in clientH 16) — the 20px `--cth-lh-display-md` box in a 16px button. Width tracks height so the `borderRadius: 50%` circle stays circular. | 2 |
| 3 | `SettingsModal.tsx:1556` webhook `i` button | `16 × 16` | `18 × 18` | **+2** | Identical measurement. | 2 |
| 4 | `SettingsModal.tsx:1673` webhook `Secret` label | `width: 56` | `width: 84` | **+28** | `SPAN dx=28 box=56x20` — the only one of the three that overflowed. | 2 |
| 5 | `SettingsModal.tsx:1651` webhook `URL` label | `width: 56` | `width: 84` | **+28** | Same fixed column as #4; `URL` fits at 56 but the three form one visual column and must align. Tracks #4's measured delta. | 2 |
| 6 | `SettingsModal.tsx:1706` webhook `Mode` label | `width: 56` | `width: 84` | **+28** | Same column as #4/#5. | 2 |

**Zero container integers changed in the other four files.**

### The nav rail is why measurement beats arithmetic

The three **longest** nav labels do not overflow at all. `"Autonomy & Budgets"` and `"Memory & Knowledge"` measure **252px** intrinsic and `"Agents & Models"` **210px** — all far wider than the 155px of clientW — but every one of them contains a space, so it wraps to two lines inside a rail with no fixed height (measured `box=158x58` and `158x78`). The two that broke are the **unbreakable single words**: `"Prerequisites"` (182px, `overflowX=43`) and `"Connections"` (154px, `overflowX=15`). Sizing the rail by arithmetic on the longest label would have produced 284px — 81px of dead rail, for the wrong string. `160 + 43 = 203` is the measured answer, and at 203 every one of the seven buttons reports `overflowX=0`.

### Containers CHECKED and deliberately left alone (step 1)

| Container | Why nothing changed |
|---|---|
| `SettingsModal.tsx:1159/:1219/:1231/:1240/:1249/:1710` fixed-width inputs (120/180/180/140/140/160) | `--cth-font-ui` 13 → 14px is +1px per character on a value the user types; every one measured `dx=0`. |
| `SettingsModal.tsx:1455/:1794/:1878/:1999` fixed-width labels (100/200/280/280) | Column flex with no fixed height; the display-face label wraps inside its own column. All measured `dx=0, dy=0`. |
| `SettingsModal.tsx:816` `32 × 32` reset-confirm icon box | Holds an `<Icon>`, no text. Untouched by the sweep. |
| `SettingsModal.tsx:844` content row `overflow: hidden` + `:885` pane `overflowY: auto` | The pane is the designed scroll container. Vertical growth from 20px line boxes is absorbed by scrolling, which is what it is for. |
| `SettingsHeroCard.tsx:124` sponsor blurb `flex: 1, minWidth: 120` between two `flexShrink: 0` siblings | **The exact 01-14 zero-width trap** — and it does not fire here, because `minWidth: 120` floors the flexible item and the row is `flexWrap: 'wrap'`. Verified live: `zeroWidth=0`. |
| `ClaudeAccountsSettings.tsx:166` account identity row | Four children, none `flexShrink: 0` and none `flex: 1`, so the squeeze is shared and no child can be clamped to zero. Parent is a column with no fixed height. |
| `McpDefaultsSettings.tsx:85` server row | Left column is `flex: 1, minWidth: 0` against a single `flexShrink: 0` toggle (~62px at 14px). Measured `dx=0` at all three viewport widths. |

### Step 3 — stop and report

**No site in this group reached step 3.** Nothing here required a redesign.

---

## 7. Live verification — because a green grep is not a green pixel

01-14's standing blocker: every acceptance criterion passed, typecheck was 0 and the suite was green, while the agent card shipped **with no name on it**. So this plan measured the rendered result rather than inferring it.

**Method.** A throwaway Playwright spec drove the real `out/main/index.js` bundle in a real Electron 43 BrowserWindow — the same launch shape as `e2e/smoke.spec.ts`, with `--user-data-dir` and `HOME`/`USERPROFILE` redirected into a temp sandbox and a seeded Claude account and webhook so `ClaudeAccountsSettings` and the webhook rows actually have data to render. It opened Settings, walked all seven tabs, and per tab counted: elements whose `scrollWidth/scrollHeight` exceeds their client box with `overflow: visible`; text-bearing elements whose `getBoundingClientRect().width < 1`; text nodes whose computed `fontSize < 14`; and buttons with an empty accessible name. **The spec was deleted before either commit** — `git status --porcelain` is empty and `ls e2e/` is `smoke.spec.ts` alone — because adding a file would have broken this plan's own containment criterion (b).

**Viewport control.** `page.setViewportSize`, `win.setBounds` and `win.setContentSize` were each measured to leave `window.innerWidth` pinned at 1280 on this host. Only CDP `Emulation.setDeviceMetricsOverride` actually moved the layout viewport — recorded here because the first two runs would otherwise have reported a "1024px pass" that was really a third 1280px run.

### Result — 7 tabs × 3 widths

| Viewport | tabs | `overflow` | `zeroWidth` | `unnamedButtons` |
|---|---|---|---|---|
| 1280 × 900 | 7 | **0** | **0** | **0** |
| 1024 × 768 (the app's own collapse floor) | 7 | **0** | **0** | **0** |
| 800 × 600 (ceiling probe) | 7 | **0** | **0** | **0** |

Before the containment fixes the same scan reported `overflow=3` on every tab (the nav rail + two nav buttons) and `overflow=6` on Connections (adding the two `i` buttons and the `Secret` label). That is what the six integers in § 6 close.

### Positive control — 19/19, so the clean scan is not vacuous

A clean sub-14px scan over a component that never mounted is worth nothing. **This control caught exactly that**: the first run reported `missing=2` because `McpDefaultsSettings` renders under **Connections**, not "Memory & Knowledge", so its tab had been scanned without it on screen.

```
=====P15 POSITIVE CONTROL=====
probes=19 missing=0 sub14=0
  OK   14px/20px box=577x20  "Home folder"                                    (SettingsModal.tsx:915)
  OK   14px/20px box=577x20  "Log folder"                                     (SettingsModal.tsx:938, plan 10's row)
  OK   14px/20px box=380x20  "Desktop notifications"                          (SettingsModal.tsx:1005)
  OK   14px/20px box=380x20  "Native toasts when an agent finishes or need…"  (SettingsModal.tsx:1008)
  OK   14px/20px box=154x20  "HELLO MARKX"                                    (SettingsHeroCard.tsx:72)
  OK   14px/normal box=126x24 "report a problem"                              (SettingsHeroCard.tsx:148)
  OK   14px/20px box=110x20  "full changelog"                                 (SettingsHeroCard.tsx:154)
  OK   14px/20px box=577x20  "CLAUDE ACCOUNTS (SUBSCRIPTION POOL)"            (ClaudeAccountsSettings.tsx:136)
  OK   14px/20px box=140x20  "Work · Max"                                     (ClaudeAccountsSettings.tsx:167, seeded row)
  OK   14px/20px box=577x20  "Add account"                                    (ClaudeAccountsSettings.tsx:218)
  OK   14px/20px box=577x20  "AI ENGINE PROVIDERS (BYOK)"                     (AiEnginesSettings.tsx:128)
  OK   14px/20px box=577x20  "API KEYS"                                       (AiEnginesSettings.tsx:138)
  OK   14px/20px box=266x14  "ANTHROPIC_API_KEY"                              (AiEnginesSettings.tsx:142)
  OK   14px/20px box=577x20  "Default MCP servers"                            (McpDefaultsSettings.tsx:54)
  OK   14px/20px box=577x20  "Safe & Read-Only (on by default)"               (McpDefaultsSettings.tsx:74)
  OK   14px/20px box=577x20  "Webhook triggers"                               (SettingsModal.tsx:1543)
  OK   14px/20px box=577x40  "Secret"                                         (SettingsModal.tsx:1673, widened column)
  OK   14px/20px box=589x20  "Circuit breaker"                                (SettingsModal.tsx:1200)
  OK   14px/20px box=406x78  "floor token budget"                             (SettingsModal.tsx:1214)
```

All five of this plan's files are represented, every probe rendered, every probe measures **≥ 14px**, and the boxes are non-zero.

### What `npm run e2e` does and does NOT cover for these five files

`npm run e2e` is **2 tests**, both green at HEAD (`the launched app really is Electron 43 or newer`; `the wizard counts its steps honestly and Michael clocks in on the floor`).

- **Covers:** that the shipped bundle boots a real Electron 43 BrowserWindow, that the renderer mounts and the wizard→floor path still works after this diff, and that the app is not broken by the sweep. `page.getByLabel('Settings')` is asserted visible, so the Settings *entry point* is exercised.
- **Does NOT cover:** anything inside the Settings modal. The committed smoke test never opens Settings, so it asserts nothing about any of this plan's five files. **It cannot regress on a sub-14px site here.** The overflow / zero-width / sub-14px / unnamed-button numbers above come from the throwaway harness described in this section, not from `npm run e2e`, and they are **not** protected by any committed test. Plan 23's `test/repo-claims.test.cjs` bar is the durable guard, and it is source-level (M1), not pixel-level.

### MEASUREMENT UNAVAILABLE — operator-only

Nobody ran `npm run dev` and **looked** at the swept Settings tabs with human eyes. Automated as far as it goes: a real Electron window, real `getBoundingClientRect`, real canvas `measureText`, three viewport widths, 21 tab-scans, 19 positive-control probes. What no automation here reaches is aesthetic judgement — whether the 203px nav rail still reads as a rail, whether the 18px `i` circles still look like the same control, and whether the 84px webhook label column still reads as a column. **Owner: operator, before plan 23.** Plan 23 must not tick FLOOR-12's visual clause for this group on measured-geometry evidence alone.

---

## 8. `must_haves` — every truth, with its verdict

| # | Truth | Verdict | Evidence |
|---|---|---|---|
| 1 | "No user-facing text in the settings cluster sits below the 14px floor except allowlisted decorative glyphs" | **SATISFIED** | M1 = 0, M1d = 0, M1x = 0 across all five files (§ 2), allowlist empty (§ 5), and live: 0 sub-14px rendered text nodes attributable to any of these five files across 21 tab-scans, with a 19/19 positive control (§ 7). |
| 2 | "Every icon-only button in these five files has an accessible name; no button with visible text gained an aria-label" | **SATISFIED** | 0 ICON-ONLY buttons exist; 0 `aria-label`s added; the two `i` controls were already labelled. `unnamedButtons=0` measured live on 7 tabs × 3 widths (§ 4). |
| 3 | "Nothing was reflowed, moved, dropped, or held below 14px to make room" | **SATISFIED** | Six container integers raised (UI-SPEC step 2), zero step-3 sites, zero fields moved or dropped. Both diffs are line-for-line (101+101, 41+41) — no line added, none removed (§ 1, § 6). |
| 4 | "The one site M1 cannot see — `SettingsHeroCard.tsx:88`'s decimal `fontSize: 12.5` — is swept too, and the M1d/M1x scans over this group are clean" | **SATISFIED** | `grep -cE "fontSize: 12\.5"` = **0**, was 1. M1d and M1x both return no output over all five paths (§ 2). |

**Artifact:** `src/renderer/src/components/SettingsModal.tsx` — "the largest single sweep surface in the phase, converted to tokens": 93 → 0, `grep -c "cth-text-"` **2 → 95**.

**Key link:** swept sites → `src/renderer/src/design/tokens.css` via `var(--cth-text-*)`, pattern `cth-text-`. Counts at HEAD: SettingsModal **95**, ClaudeAccountsSettings **12**, SettingsHeroCard **9**, McpDefaultsSettings **9**, AiEnginesSettings **7**.

### Acceptance criteria — every numeric gate

| Criterion | Required | Measured | |
|---|---|---|---|
| M1 `SettingsModal.tsx` | 0 (== allowlist) | **0** | ✓ |
| M1d / M1x `SettingsModal.tsx` | 0 each | **0 / 0** | ✓ |
| `grep -c "cth-text-"` SettingsModal | ≥ 80 higher | 2 → **95** (**+93**) | ✓ |
| `grep -c "cth-font-display"` SettingsModal | unchanged | 22 → **22** | ✓ |
| `grep -c "openLogs"` SettingsModal | ≥ 1 | **2** | ✓ |
| M1 the four files | 0 each | **0 / 0 / 0 / 0** | ✓ |
| `grep -cE "fontSize: 12\.5"` HeroCard | 0 | **0** (was 1) | ✓ |
| M1d / M1x over all five | 0 each | **0 / 0** | ✓ |
| `grep -c "cth-font-display"` the four | unchanged each | 3→3, 3→3, 2→2, 2→2 | ✓ |
| Frozen allowlist in task notes | literal array or explicit empty | **`[]`, explicitly empty** (§ 5) | ✓ |
| Re-run M1 all five in task notes | present | § 5 table | ✓ |
| `npm run typecheck` | exit 0 | **0** | ✓ |
| `npm test` TAP | EXIT 0, fail 0, todo 0, skipped ≤ 4, pass ≥ 511 | **0 / 0 / 0 / 4 / 511** | ✓ |
| Containment (a) filter empty, `grep -c .` ≥ 1 | empty, ≥ 1 | **empty, 2** | ✓ |
| Containment (b) `grep -c .` | exactly 5 | **5** | ✓ |
| Containment (c) porcelain | empty | **empty** | ✓ |

Every acceptance criterion in this plan is satisfied with a real measurement. **None is reported NOT MET.** (Two criteria cite stale baselines — `SettingsModal 92` and the `426/422` TAP counters — and were graded against this plan's own re-measured 93 and 515/511, with both deltas recorded above rather than papered over.)

---

## 9. The `SettingsModal.tsx:1008` copy blocker — **STANDING, not resolved**

Stated explicitly, as the orchestrator requires.

`src/renderer/src/components/SettingsModal.tsx:1008` still reads:

> *"Native toasts when an agent finishes or needs your input."*

with **no platform qualifier**. That is 01-13's FLOOR-14 `must_haves` truth 5, which 01-13 reported PARTIAL because the file was outside its declared set, and which 01-14 confirmed falls inside **this plan's** group.

**It was NOT taken, and it was NOT quietly dropped. The blocker stands.**

Why, per this plan's own contract:

1. `must_haves` truth 3 — *"Nothing was reflowed, moved, dropped, or held below 14px to make room"* — and task 2's action text: **"Change no copy, no layout, no colour, no spacing token. This is a size and accessible-name sweep."** Editing that sentence is a copy change this plan has no authority to make.
2. 01-14's handoff § 9 says exactly this: *"The blocker still stands and is NOT transferred to 01-15."*

What this plan **did** verify about it, so the next owner starts from fact rather than from a line number:

- The line is at **`:1008`** at HEAD (unchanged; the sweep touched `:1007`, the `fontSize` on its enclosing `<span>`, and nothing else on `:1008`).
- It **renders at 14px** now — measured live, `box=380x20`, so it is legible; it is still inaccurate.
- The fix remains one sentence appended to the existing description span, wording already in `README.md:139-147`, and it must add **no** `fontSize` — this plan pins that file's M1 occurrence count at 0 and plan 23 asserts it.

**Owner: plan 23's wave-9 doc-claim sweep**, which already holds `test/repo-claims.test.cjs`, or any earlier plan that legitimately holds `SettingsModal.tsx`. Re-filed in STATE.md.

---

## 10. Cross-plan observations — FOUND, NOT FIXED (out of scope, filed for the owner)

The live scan sees the whole Settings modal, not just this plan's five files, so it incidentally measured five wave-mates' surfaces. **None was touched** — that would have broken containment criterion (a) and is not this plan's to hold. Recorded because it is free, already-measured evidence for their runs:

| Rendered sub-14px text | File | Owner | Group count |
|---|---|---|---|
| `10px "✕"` (modal close, all 7 tabs) | `components/Modal.tsx` | **01-20** | 1 |
| `8px "Updates"`, `13px "You're on v0.4.4"`, `12px "Updates are checked automatically…"` | `components/UpdatesSection.tsx` | **01-20** | 4 |
| `8px "Office Theme"`, `13px "TV-show office themes"`, `13px "(experimental)"`, `12px "Re-skin the pixel office…"` | `components/OfficeThemePicker.tsx` | **01-16** | 10 |
| 79 distinct sub-14px nodes on the Prerequisites tab — `12px "PREREQUISITES"`, `11px "UV"/"GIT"/"NODE.JS"`, `9px "READY"`, resolved binary paths at 11px | `components/SetupPanel.tsx` | **01-16** | 13 |
| `8px "Integrations"`, `12px "Connect outside tools…"`, `12px "No integrations yet…"` | `components/IntegrationsRegistry.tsx` | **01-17** | 15 |
| `8px "Microphone"/"Speaker"`, `12px "System default"`, `12px` device names | `realtime/DevicePicker.tsx` | **01-20** | 3 |
| `8px "Spend cap"`, `12px "USD (off)"`, `11px "No active voice session."` | `realtime/CostHud.tsx` | **01-19** | 8 |

The `9px "READY"` chips in `SetupPanel.tsx` are the smallest text measured anywhere in Settings and the most legible-critical (they are the pass/fail verdict on a prerequisite). **01-16 should measure the Prerequisites tab live — it is the densest sub-14px surface in the app.**

Also for 01-16/01-20: `SettingsHeroCard.tsx:141` renders `⭐ star on GitHub` inside a `PixelButton`. The `⭐` is decorative and sits beside visible text, so it is **not** an M3 candidate and not a Rule 0 site, and it was deliberately left alone rather than given an `aria-hidden` this plan has no rule for. A screen reader announces it as "star star on GitHub". Not a defect this plan's contract names; recorded, not fixed.

---

## 11. Deviations from plan

### Auto-fixed

**1. [Rule 1 — Bug] Six px line-heights orphaned onto their own line survived the same-line sweep**
- **Found during:** Task 2, immediately after the first sweep pass.
- **Issue:** `SettingsModal.tsx:77` and `:870`, `McpDefaultsSettings.tsx:24` and `:122`, `AiEnginesSettings.tsx:50`, `ClaudeAccountsSettings.tsx:33` each carry `lineHeight: '12px'` (or `'14px'`) on the line *below* their `fontSize`. A same-line transformation raises the text to 14px and leaves a 12px line box under it — text taller than its own line box, in `slackLabelStyle` and the nav button among others.
- **Fix:** A second scan for `lineHeight: '\d+px'` after the sweep, with a per-line anchor assertion. Converted to `var(--cth-lh-display-md)`.
- **Files modified:** all four affected files.
- **Commits:** `5b941b9`, `19d8051`.

**2. [Rule 3 — Blocking] The Electron layout viewport would not resize, so the "1024px floor" pass was silently a third 1280px pass**
- **Found during:** Task 2's live verification.
- **Issue:** `page.setViewportSize`, `win.setBounds` and `win.setContentSize` all left `window.innerWidth` at 1280 on this host. The harness printed `VIEWPORT 1024x768 (inner 1280x900)` — a narrow-viewport claim with no narrow viewport behind it.
- **Fix:** CDP `Emulation.setDeviceMetricsOverride`, which does move the layout viewport (`inner 1024x768` confirmed). The instrumentation printed the true inner size beside the requested one specifically so this could not pass unnoticed.
- **Files modified:** none in the repo (throwaway harness).

**3. [Rule 1 — Bug] The positive control was itself wrong, and caught it**
- **Found during:** Task 3's verification.
- **Issue:** Two probes reported `MISSING` because `McpDefaultsSettings` renders under **Connections** (`SettingsModal.tsx:1342`), not "Memory & Knowledge". Its tab had been scanned clean with the component not on screen — a vacuous negative of exactly the kind the control exists to prevent.
- **Fix:** Probe section mapping corrected; re-run returned `missing=0`.

### Reported, not "fixed"

**4. The plan's baselines are stale in two places, and were re-measured rather than assumed.**
`SettingsModal` is pinned at 92 occurrences (live: **93**) and the TAP counters at `426 tests / 422 pass` (live: **515 / 511**). Both deltas are recorded in § 2 with the live number used as the gate. `01-14-SUMMARY.md` § 9's 93/129 is the correct figure; the plan's objective text is the stale one.

**5. `SettingsModal.tsx:1008`'s copy blocker STANDS** — see § 9. Not taken, not dropped, re-filed in STATE.md.

**6. `SettingsHeroCard.tsx` is LF-terminated while the other four are CRLF.** That is how it was at the base sha (verified with `git show 3b2d03e:… | file -`), and the sweep preserved it byte-for-byte. `git diff` emits a `LF will be replaced by CRLF` advisory on it; that is `core.autocrlf` normalisation, not a change this plan made. All five files carry **0** raw NUL bytes (checked with `tr -d -c '\000' | wc -c`, positive-controlled against a file containing one).

### Anchor drift, for later plans and plan 23's greps

| Plan text | Actual at base sha `3b2d03e` |
|---|---|
| `SettingsModal.tsx:882-886` — "the neighbouring section-header style, `fontSize: 8`" | **`:911-913`** (+29) |
| `SettingsModal.tsx` = 92 M1 occurrences | **93** |
| Group = 128 M1 occurrences | **129** |

Anchors **after** this plan's commits are unchanged — both diffs are line-for-line, so every line number in this SUMMARY is valid at `19d8051` as well as at `3b2d03e`.

---

## 12. Verification

| Gate | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | **exit 0** |
| Unit suite | `node --test --test-reporter=tap test/*.test.cjs` | **exit 0** · tests 515 · pass 511 · **fail 0** · skipped 4 · todo 0 |
| Bundle | `npm run build` (Node 22.23.2 / npm 10.9.8) | **exit 0** |
| End-to-end | `npm run e2e` (real Electron 43) | **2 passed** |
| Live layout | throwaway Playwright harness, 7 tabs × 3 widths | overflow **0**, zeroWidth **0**, unnamedButtons **0**, positive control **19/19** |
| Containment | (a) filtered per-commit · (b) path-scoped `-c .` · (c) porcelain | **empty · 5 · empty** |
| Hygiene | `tr -d -c '\000'` per file; `git diff --stat` | **0 NUL bytes** in all five; line-for-line diffs |

There is no lint/format/secret-scan tooling in this repo (no `lint` script, no `.husky`, no `.git/hooks`, no `.pre-commit-config.yaml`) — typecheck, the unit suite, the build and the e2e suite ARE the gate, and all four are green locally at `19d8051`.

**Requirement row:** `FLOOR-12` deliberately left **Pending** in `.planning/REQUIREMENTS.md`, matching the 01-02/04/05/06/07/08/09/10/11/12/13/14 precedent — **plan 23 owns the checkboxes**. FLOOR-12 is not closeable here in any case: 443 of the original 605 M1 occurrences remain and belong to plans 16–20.

---

## 13. Handoff

**To plans 01-16 … 01-20 (same wave):** repo-wide M1 at `19d8051` is **443 occurrences / 55 files**. Four things worth copying: (1) sweep with a **line-number-keyed applier that asserts the anchor** — a drifted line then fails loudly instead of rewriting a neighbour; (2) **re-scan for orphaned px line-heights** after the sweep, six of them hid from the same-line pass in this group alone; (3) **only CDP moves an Electron layout viewport** — `setBounds`/`setContentSize` silently do not; (4) **run a positive control before trusting a clean scan** — it caught an unmounted component here on the first try.

**To plan 01-23 (wave 9):** this group's Rule 0 allowlist is `[]` — **empty, explicitly**. Do not look for entries. M1 over all five files is 0, so for this group allowlist size == post-sweep count == 0. `test/repo-claims.test.cjs` was **not** edited here. `FLOOR-12` is still `Pending` in REQUIREMENTS.md by design. Two live items remain: the `SettingsModal.tsx:1008` copy blocker (§ 9) and the operator visual check (§ 7).

---

## Self-Check: PASSED

```
FOUND: src/renderer/src/components/SettingsModal.tsx
FOUND: src/renderer/src/components/SettingsHeroCard.tsx
FOUND: src/renderer/src/components/McpDefaultsSettings.tsx
FOUND: src/renderer/src/components/AiEnginesSettings.tsx
FOUND: src/renderer/src/components/ClaudeAccountsSettings.tsx
FOUND: .planning/phases/01-finish-the-floor/01-15-SUMMARY.md
FOUND commit: 5b941b9  fix(01-15): sweep SettingsModal to the 14px floor and contain the six boxes it broke
FOUND commit: 19d8051  fix(01-15): sweep the four remaining settings files, incl. the site M1 cannot see
REMOVED (as intended): e2e/zz-floor12-p15-measure.spec.ts — ls e2e/ is `smoke.spec.ts` alone
```
