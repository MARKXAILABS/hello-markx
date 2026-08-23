---
phase: 01-finish-the-floor
plan: 17
subsystem: ui
tags: [floor-12, typography, design-tokens, accessibility, command-centre, task-board, triggers, integrations, electron, playwright]

requires:
  - phase: 01-finish-the-floor
    provides: "01-14's corrected token layer — display-md/body-md/mono-md all 14px, --cth-text-display-sm and --cth-lh-display-sm DELETED, --cth-lh-mono singular"
  - phase: 01-finish-the-floor
    provides: "01-15's viewport finding — only CDP Emulation.setDeviceMetricsOverride moves the layout viewport; a positive control before every clean scan"
  - phase: 01-finish-the-floor
    provides: "01-16's BASE-vs-HEAD differential method, its AX-tree naming rule, and its PixelButton `title` workaround"
provides:
  - "The command-centre / task-board / triggers-form / integrations cluster (4 files, 110 M1 occurrences) clears the 14px floor: M1 4 (all four aria-hidden Rule 0 glyphs), M1d 0, M1x 0"
  - "All FOUR of the phase's NOT-exempt single-character sites are resolved as CONTENT with an accessible name, plus IntegrationsRegistry.tsx:72's M1-invisible ternary and :388's two-on-one-line site"
  - "role=\"img\" is REQUIRED alongside aria-label on a bare <span> — aria-label on role=generic is NOT exposed by Chromium. Measured on the AX tree, not asserted."
  - "This sub-group's frozen Rule 0 allowlist for plan 23: 4 entries, each carrying aria-hidden=\"true\" on its own fontSize line"
  - "The two FLOOR-12 surfaces no plan owned are closed: global.css's markdown preview 3 sub-14px rules -> 0 (on tokens), OfficeFloor's WebGL fallback 2 -> 0"
  - "TWO real container regressions caused by the sweep, found by the BASE differential and fixed at source — a green grep would have shipped both"
affects: [01-18, 01-19, 01-20, 01-23]

tech-stack:
  added: []
  patterns:
    - "Object-scoped sweep applier with a mandatory dry run: resolve the ENCLOSING style-object literal by brace matching, read the family off that object, rewrite size + paired line-height, apply edits from the END of the file backwards so earlier offsets stay valid"
    - "Attribute every live sub-14px text node by (inline fontSize, aria-hidden on self-or-ancestor). Because this app styles inline, a sub-14px literal always surfaces as el.style.fontSize — so 'none of the residuals are mine' becomes mechanical instead of a judgement call"
    - "Positive control BEFORE the scan, every time: the first probe run of this plan reported sub14=0 / overflow=7 on all 30 surface-scans because the app was stuck behind the launch-time hive picker. texts=10 and every control MISSING is what caught it"
    - "BASE-vs-HEAD differential over a build of each sha — 'did the sweep break containment' answered by a diff"

key-files:
  created: []
  modified:
    - src/renderer/src/components/CommandCenterPanel.tsx
    - src/renderer/src/components/TasksKanban.tsx
    - src/renderer/src/components/triggers/ui.tsx
    - src/renderer/src/components/IntegrationsRegistry.tsx
    - src/renderer/src/design/global.css
    - src/renderer/src/scene/office/OfficeFloor.tsx

key-decisions:
  - "DECISION (operator root-cause directive): migrated onto 01-14's corrected token layer at every site, including global.css's markdown preview. No literal was hand-patched. The one exception is OfficeFloor's WebGL-failure banner, kept a literal ON PURPOSE — it is the last-resort path when the renderer is already failing and must not depend on a stylesheet having loaded. Stated, not smuggled."
  - "DECISION: the `?` chip and the `%` unit label carry role=\"img\" in addition to the aria-label UI-SPEC specifies. aria-label alone on a bare <span> (role=generic) is NOT exposed in Chromium's AX tree, so the contract's own wording would have shipped an unannounced chip that greps green. Confirmed on the live AX tree: {\"Waiting on your answer\":\"image\"} and {\"percent\":\"image\"}."
  - "DECISION: IntegrationsRegistry.tsx:388's `{st.dot}` takes NO size exemption. UI-SPEC's Rule 0 applies only to the frozen M3 candidate set, and M3 is literal-only so it never saw this variable-rendered glyph. It is swept to the token like any other site and gains aria-hidden (its sibling `{st.text}` says the same thing in words). Result: zero M1 occurrences on that physical line, so the two-on-one-line hazard is removed structurally instead of by edit ordering."
  - "DECISION: PixelButton was NOT modified (byte-pin bd286ebf… intact). Icon-only and busy-collapsed PixelButtons are named through `title`, the one accname source its closed prop set exposes. 01-16's aria-label-prop blocker stands."
  - "TWO container regressions were caused by this sweep and both were invisible to every grep in the plan. Found by the BASE differential, fixed at source, re-measured to parity."
  - "The FLOOR-13 tokens/budgetTokens/pct consumer residual is explicitly NOT absorbed into this plan. See §10."

metrics:
  duration: "~3h"
  completed: 2026-08-21
  tasks: 3
  files: 6
  commits: 3
---

# Phase 01 Plan 17: Command Centre, Task Board, Triggers Form, Integrations Summary

**FLOOR-12 sweep sub-group 3 of 6 — 110 sub-14px `fontSize` occurrences across the renderer's four
densest files brought onto 01-14's token layer, all four of the phase's NOT-exempt single-character
sites resolved as content with a real accessible name, and the two unowned FLOOR-12 surfaces closed —
with the two container regressions the sweep itself caused found by a BASE-vs-HEAD Electron
differential and fixed at source.**

---

## 1. Base sha and commits

**Base sha:** `61bcd409ef8e66f96b20d4e4e4e0e721816df190`

| Commit | Title | Files |
|---|---|---|
| `30da0bb` | `fix(01-17): sweep the four densest FLOOR-12 files to the corrected type scale` | CommandCenterPanel 116±, IntegrationsRegistry 38±, TasksKanban 58±, triggers/ui 34± |
| `a3d5b37` | `fix(01-17): raise the two FLOOR-12 surfaces no plan owned to the floor` | global.css 6±, OfficeFloor.tsx 4± |
| `feba9bb` | `fix(01-17): contain the two overflows the sweep actually caused` | TasksKanban 5±, triggers/ui 2± |

```
### 30da0bb
 src/renderer/src/components/CommandCenterPanel.tsx | 116 +++++++++++----------
 .../src/components/IntegrationsRegistry.tsx        |  38 +++----
 src/renderer/src/components/TasksKanban.tsx        |  58 ++++++-----
 src/renderer/src/components/triggers/ui.tsx        |  34 +++---
 4 files changed, 128 insertions(+), 118 deletions(-)
### a3d5b37
 src/renderer/src/design/global.css            | 6 +++---
 src/renderer/src/scene/office/OfficeFloor.tsx | 4 ++--
 2 files changed, 5 insertions(+), 5 deletions(-)
### feba9bb
 src/renderer/src/components/TasksKanban.tsx | 5 ++++-
 src/renderer/src/components/triggers/ui.tsx | 2 +-
 2 files changed, 5 insertions(+), 2 deletions(-)
```

---

## 2. M1 — the sub-group's counts, as OCCURRENCES, with the unit named

Counted with `grep -hoE "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" <file> | wc -l` — **occurrences
(`-o`), not lines (`-c`)**, the unit plan 23's wave-9 bar asserts in.

| File | Plan baseline | Measured at base sha | **After** | Allowlist size |
|---|---|---|---|---|
| `CommandCenterPanel.tsx` | 53 | **53** | **2** | 2 |
| `TasksKanban.tsx` | 25 | **25** | **1** | 1 |
| `triggers/ui.tsx` | 17 | **17** | **1** | 1 |
| `IntegrationsRegistry.tsx` | **15** | **15** | **0** | 0 |
| **Total** | **110** | **110** | **4** | **4** |

**Every per-file count equals that file's allowlist size.** The plan's baseline was exact — no
re-baselining was needed, unlike 01-15.

### The unit reconciliation, on the record

`IntegrationsRegistry.tsx` is the one file in the renderer where the units diverge:

```
grep -hoE … IntegrationsRegistry.tsx | wc -l   ->  15    (occurrences — the unit this plan pins)
grep -cE  … IntegrationsRegistry.tsx           ->  14    (lines)
```

The divergence was `:388`, which carried `fontSize: 12` on real text and `fontSize: 10` on the status
dot on one physical line. **Both are now tokens**, so after this plan the file returns `0` for both
commands and the divergence is gone from the tree entirely.

### Blind-spot scans — M1d and M1x, before and after

Run over this plan's four paths only.

| Scan | Before | After |
|---|---|---|
| **M1d** (decimal / quoted-px sub-14 literals) | **0 hits** | **0 hits** |
| **M1x** (expression-valued sizes) | **1 hit** | **0 hits** |

The one M1x hit, pasted as found:

```
src/renderer/src/components/IntegrationsRegistry.tsx:72:    <div style={{ width: size, height: size,
  … fontFamily: 'var(--cth-font-display)', fontSize: lg ? 13 : 11 }}>{mono}</div>
```

**Evaluated minimum: 11** (`lg` false). Both branches were sub-14, so the ternary was dead weight once
the token landed. `grep -cE "fontSize: lg \? 13 : 11" IntegrationsRegistry.tsx` → **0** (was `1`);
`grep -c "cth-text-display-md"` → **2** (was `0`).

M1 could never see this site, so no per-file count gates it. **It is proven closed twice over:** by the
grep above, and by the live probe reading the rendered `Glyph` at `14px/20px` in a `40x40` box,
`clip=fits`, at all three viewport widths (§7).

### Arithmetic (derivation, not a measured bar)

This plan's `<interfaces>` forbids recording a whole-renderer M1 total — the repo-wide bar is
**plan 23's**, asserted once after every sweep lands. The arithmetic it hands forward:

> 01-16 left the tree at **343 occurrences / 50 files**. This plan converted **106** and retained
> **4**, so plan 23 should expect **343 − 106 = 237 occurrences across 49 files** before 01-18, 01-19
> and 01-20 run — `IntegrationsRegistry.tsx` drops out of the file list entirely.

*(Reconciled against the tree before writing this line, because asserting an unverified number is the
exact failure class this phase exists to remove. It agreed exactly: 237 / 49. The number is stated as
a derivation and as plan 23's to assert, not as this plan's bar.)*

---

## 3. M3 — the glyph predicate, scoped to these four files

```
$ export LC_ALL=C.UTF-8
$ grep -rnP ">\s*([^A-Za-z0-9\s<>{}/]|\{[a-zA-Z]+ \? '[^A-Za-z0-9]' : '[^A-Za-z0-9]'\})\s*</" <the 4 files>
CommandCenterPanel.tsx:761   {armed && <span title={breaker?.reason} … fontSize: 12 }}>⚠</span>}
CommandCenterPanel.tsx:1539  >✓</button>
TasksKanban.tsx:199          <div style={{ fontSize: 12, … padding: '8px 0' }}>—</div>
TasksKanban.tsx:264          }}>?</span>
TasksKanban.tsx:280          >✕</button>
triggers/ui.tsx:215          <span style={{ … fontSize: 11, … }}>{open ? '▾' : '▸'}</span>
triggers/ui.tsx:348          <span style={{ fontSize: 11, … }}>%</span>
IntegrationsRegistry.tsx:293 <span style={hint}>The secret is sent as <code …>…</code>.</span>
IntegrationsRegistry.tsx:392 <PixelButton variant="ghost" size="sm" …>✕</PixelButton>
```

**9 candidates — exactly UI-SPEC's file table** (`CommandCenterPanel` ⚠ ✓ · `IntegrationsRegistry` . ✕ ·
`TasksKanban` — ? ✕ · `triggers/ui` ▾/▸ %). **No delta.**

**Anchor drift vs the plan's stated line numbers, for plan 23's greps:**

| Plan says | Actual at base sha |
|---|---|
| `TasksKanban.tsx:198` (the `—`) | **`:199`** |
| `TasksKanban.tsx:263` (the `?`) | **`:264`** (its style object opens at `:259`, `--cth-font-display` at `:261`) |
| `TasksKanban.tsx:388` … *(sic — plan means IntegrationsRegistry)* | — |
| `IntegrationsRegistry.tsx:388` (`{st.dot}`) | **`:388`** ✓ exact |
| `IntegrationsRegistry.tsx:293` (the `.`) | **`:293`** ✓ exact |
| `IntegrationsRegistry.tsx:72` (the M1x ternary) | **`:72`** ✓ exact |
| `triggers/ui.tsx:348` (the `%`) | **`:348`** ✓ exact |
| `CommandCenterPanel.tsx:1581-1595` (`PathLine`) | **`:1608-1622`**, `const MAX = 46` at **`:1612`** |
| `CommandCenterPanel.tsx:501` (`disposeTerminal`) | not on `:501`; the call survives, count unchanged at **2** |

**Every edit in this plan matched on TEXT, never on a line number.**

---

## 4. The five special sites, each resolved individually

### 4.1 `TasksKanban.tsx:199` — the bare `—` → **content**

```diff
- …padding: '8px 0' }}>—</div>
+ …padding: '8px 0' }}>Nothing here yet</div>
```

Rule 2, swept to `var(--cth-text-body-md)` / `var(--cth-lh-body-md)`. **Not** `aria-hidden` — an empty
column must not read as silence. `grep -c "Nothing here yet"` → **1** (was `0`).
**Live: `"Nothing here yet" x1`, MOUNTED at 1280×900, 1024×768 and 800×600.**

### 4.2 `TasksKanban.tsx:264` — the waiting-on-you `?` chip → **content, named**

```jsx
<span title="waiting on YOUR answer — see the ASK ME tab" role="img" aria-label="Waiting on your answer" style={{
  alignSelf: 'center', marginRight: 18, flexShrink: 0,
  fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', padding: '2px 5px 1px',
  background: 'var(--cth-lilac)', color: 'var(--cth-ink-900)',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
}}>?</span>
```

The visible `?`, the lilac fill and the `title` are all untouched. Rule 1 — family unchanged.
`grep -c 'aria-label="Waiting on your answer"'` → **1** (was `0`).

**`role="img"` is a deviation from the contract's literal wording and it is load-bearing.** See §6.1.
**Live AX tree: `{"Waiting on your answer":"image"}`; the element measures `14px role=img
aria=Waiting on your answer`.**

### 4.3 `triggers/ui.tsx:348` — the `%` unit label → **content, named**

```jsx
<span role="img" aria-label="percent" style={{ fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-500)' }}>%</span>
```

`grep -c 'aria-label="percent"'` → **1** (was `0`). **Live: four `%` labels rendered (two `PctField`s
per `RuleCard` × two rule cards), every one `14px role=img aria=percent`; AX tree
`{"percent":"image"}`.**

### 4.4 `IntegrationsRegistry.tsx:72` — the `Glyph` monogram (M1x) → **Rule 1, token**

```diff
- fontFamily: 'var(--cth-font-display)', fontSize: lg ? 13 : 11 }}>{mono}</div>
+ fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)' }}>{mono}</div>
```

Family unchanged. Live at all three widths, 9 glyph elements per surface:
`14px/20px "Gh" box=40x40 clip=fits`, `14px/20px "{}" box=40x40 clip=fits`.

### 4.5 `IntegrationsRegistry.tsx:293` and `:388` — no exemption

- **`:293`** — the `.` is sentence punctuation ending prose inside `<span style={hint}>`, not an
  element. The hoisted `hint` object was swept normally (`fontSize: 11` → `var(--cth-text-body-md)`,
  `lineHeight: '15px'` → `var(--cth-lh-body-md)`).
- **`:388`** — `{st.dot}` (`●`/`○`/`▲`). **No exemption taken.** UI-SPEC's Rule 0 applies only to the
  frozen M3 candidate set, and M3's predicate is literal-only, so it never saw a variable-rendered
  glyph. Both spans on the line are now tokens, and the inner one gains `aria-hidden="true"` because
  `{st.text}` immediately after it says the same thing in words. **Result: that physical line now
  returns 0 M1 occurrences**, so the "line-granular allowlist masks the text span on the same line"
  hazard is removed structurally rather than by getting the edit order right.

---

## 5. The frozen Rule 0 allowlist — 4 entries, for plan 23

Pinned in **`fontSize`-declaration-line space at `feba9bb`**. Every entry carries `aria-hidden="true"`
**on the line itself**.

```
[
  "src/renderer/src/components/CommandCenterPanel.tsx:761",   //  ⚠  circuit-breaker warning, fontSize: 12
  "src/renderer/src/components/CommandCenterPanel.tsx:1542",  //  ✓  save-token-limit button, fontSize: 11
  "src/renderer/src/components/TasksKanban.tsx:286",          //  ✕  dismiss-task button,      fontSize: 12
  "src/renderer/src/components/triggers/ui.tsx:215"           //  ▾/▸ SubHeader disclosure,    fontSize: 11
]
```

Each line pasted with the two lines following it:

```
--- CommandCenterPanel.tsx:761
              {armed && <span aria-hidden="true" title={breaker?.reason} style={{ color: 'var(--cth-coral)', fontSize: 12 }}>⚠</span>}
              <span style={{ marginLeft: 'auto', fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-500)' }}>
                {(toolCounts[a.id] ?? 0)} tool calls
--- CommandCenterPanel.tsx:1542
        <span aria-hidden="true" style={{ fontSize: 11 }}>✓</span>
      </button>
    </span>
--- TasksKanban.tsx:286
        <span aria-hidden="true" style={{ fontSize: 12 }}>✕</span>
      </button>
    </div>
--- triggers/ui.tsx:215
        <span aria-hidden="true" style={{ flexShrink: 0, width: 8, fontSize: 11, color: 'var(--cth-ink-500)' }}>{open ? '▾' : '▸'}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
```

**Two of the four are local overrides this plan created**, following 01-14's convention #2: the
glyph-only `<button>`s at `CommandCenterPanel.tsx` (the `✓`) and `TasksKanban.tsx` (the `✕`) had their
own `fontSize` on the button element. That declaration was removed from the button and moved onto a
wrapping `<span aria-hidden="true">`, so the allowlist entry and the `aria-hidden` sit on one line and
the button keeps its accessible name and its focusability.

**`IntegrationsRegistry.tsx` contributes ZERO entries.** Its `✕` is inside a `<PixelButton>` and has no
`fontSize` of its own — 01-14's convention #3 says such a glyph takes `aria-hidden` and **no** allowlist
entry, and no sub-14px override was invented just to have something to allowlist.

**Warning for plan 23:** these are line numbers, and line numbers drift. Every entry is uniquely
identifiable by the text pasted above; re-derive rather than trusting the integer.

---

## 6. Accessible names — the rule, not the ratio

### Inventory at base sha vs after

| File | `<button>` | `<PixelButton>` | `aria-label` occurrences before | after |
|---|---|---|---|---|
| `CommandCenterPanel.tsx` | 7 | 12 | 4 | 4 |
| `TasksKanban.tsx` | 2 | 2 | 1 | **2** |
| `triggers/ui.tsx` | 4 | 0 | 0 | 0 |
| `IntegrationsRegistry.tsx` | 3 | 13 | 0 | 0 |
| **Total** | **16** | **27** | **5** | **6** |

**Delta against the plan's baseline: the plan says "16 `<button>` and 4 existing `aria-label`". The
`<button>` count is exact; the `aria-label` count is 5, not 4** (`CommandCenterPanel` 4 +
`TasksKanban` 1). Recorded rather than rounded to the plan's number.

**43 buttons classified. ICON-ONLY: 6. All 6 named. No button with visible text gained an
`aria-label`.**

| Button | State | Name source |
|---|---|---|
| `CommandCenterPanel` open-terminal-at | icon-only | pre-existing `aria-label` |
| `CommandCenterPanel` forget-archived-agent | icon-only | pre-existing `aria-label` |
| `CommandCenterPanel` restart-agent | icon-only | pre-existing `aria-label` |
| `CommandCenterPanel` save-token-limit `✓` | icon-only | pre-existing `aria-label="Save token limit"`, glyph now `aria-hidden` |
| `TasksKanban` dismiss `✕` | icon-only | pre-existing `aria-label="dismiss task"`, glyph now `aria-hidden` |
| `IntegrationsRegistry` remove `✕` | icon-only | **added `title={`Remove the ${r.label} integration`}`** |

**Four more buttons collapse to a bare `…` while they run** — icon-only in exactly that state, and
exactly when the operator most wants to know what is happening. Each gained a `title`; `title` is
ignored while the visible label is present (accname precedence puts a button's text content above
`title`), so no visible label was overridden:

```
IntegrationsRegistry.tsx:390  test         -> title={`Test the ${r.label} integration`}
IntegrationsRegistry.tsx:344  Save …       -> title={draft.isNew ? 'Save the new integration' : 'Save changes to this integration'}
CommandCenterPanel.tsx        text search  -> title="Search the hive text log"
CommandCenterPanel.tsx        mem search   -> title="Search the memory palace"
```

**`PixelButton.tsx` was not modified.** `git hash-object` → `bd286ebf5654a2647c93546dc135f608aeb5d0f0`,
exactly plan 23's pin. Its props remain a closed set with no `aria-label`, so `title` is the only
accname source a caller has — **01-16's root-cause blocker stands unchanged**.

**Live, at every surface × width: `unnamedBtns = 0` at BASE and `0` at HEAD.** Read off Chromium's AX
tree via `Accessibility.getFullAXTree`, not from an `aria-label ?? textContent` grep.

### 6.1 The deviation that matters: `aria-label` alone was not enough

UI-SPEC and this plan both specify `aria-label="percent"` on the `%` `<span>` and
`aria-label="Waiting on your answer"` on the `?` `<span>`. **Both would have shipped silent.**
`aria-label` on an element whose computed role is `generic` is not exposed by Chromium — the contract's
literal wording produces a green grep and an unannounced chip. Adding `role="img"` makes the label
authoritative. This is the same class of failure 01-16 caught on `OnboardingWizard.tsx:582`, and it was
found the same way: by reading the AX tree instead of the markup.

Evidence, from the live run:

```
P17[HEAD2] AX names on the task board: {"dismiss task":"button","Waiting on your answer":"image"}
P17[HEAD2] tasks: "Nothing here yet" x1 | "?" chip -> ["14px role=img aria=Waiting on your answer"]
P17[HEAD2] triggers: "%" -> ["14px role=img aria=percent" x4] | AX {"percent":"image"}
```

---

## 7. Live verification — because a green grep is not a green pixel

**Method.** A throwaway Playwright spec drove the shipped `out/main/index.js` in a real Electron 43
BrowserWindow, launch shape copied from `e2e/smoke.spec.ts` with `--user-data-dir`, `HOME` and
`USERPROFILE` redirected into a temp sandbox seeded past onboarding. The task ledger was seeded through
the **real `hive:addTask` IPC** with a `todo`, a `doing` and a `blocked` card carrying an unanswered
`humanQA` entry — `waitsOnHuman` is `blocked && an unanswered question`, and it is the `?` chip's only
trigger. `done` was left empty, which is the `Nothing here yet` copy's only trigger.
**The spec was deleted before this SUMMARY was written:** `ls e2e/` is `smoke.spec.ts` alone and
`git status --porcelain` is empty.

**Viewport control.** CDP `Emulation.setDeviceMetricsOverride`, per 01-15. Every line prints the true
`innerWidth × innerHeight` beside the requested size — all 36 scans report `inner` equal to the request,
so no run was a silent third 1280px run.

### THE POSITIVE CONTROL EARNED ITS KEEP — the first run measured nothing

The first probe run reported `sub14=0`, `zeroWidth=0`, `unnamedBtns=0` on **all 30** surface-scans.
It looked perfect. It was worthless: `texts=10` on every surface and **every positive control
`MISSING`**. The app was sitting behind the launch-time **hive picker** (`SELECT A HARNESS CONFIG`),
which the seeded config does not bypass. Without the control this run would have been reported as a
clean sweep of four files that never mounted. Fixed by clicking the picker's `open` button; `texts`
went 10 → 38–224 per surface and the real numbers appeared.

A second control gap was caught the same way: below `SIDEBAR_COLLAPSE_WIDTH = 1024` the sidebar
collapses by design, so the 800×600 scans initially measured the floor with the command centre off
screen (`texts=14`, every control `MISSING`). The probe now clicks `show panel` first.

**27 positive-control probes, all MOUNTED:**

```
3  control COMMAND CENTER=MOUNTED
15 control TODO=MOUNTED DOING=MOUNTED BLOCKED=MOUNTED DONE=MOUNTED Nothing here yet=MOUNTED
3  control Glyph=MOUNTED   (9 monogram elements each, 14px/20px, 40x40, clip=fits)
6  control add-integration=MOUNTED
```

### BASE vs HEAD — 12 surfaces × 3 widths × 2 builds

The base sha was checked out for **this plan's six paths only** (M1 back to 110 — verified), rebuilt,
probed, then restored (M1 back to 4 — verified, `git status --porcelain` empty).

| Surface | sub14 BASE → HEAD | overflow BASE → HEAD | unnamed |
|---|---|---|---|
| `cc/terminal` | 24 → 12 | 1 / 7 / 8 → **1 / 7 / 8** | 0 → 0 |
| `cc/monitor` | 45 → 5 | 1 → **1** | 0 → 0 |
| `cc/tasks` | 34 → 6 | 0 → **0** | 0 → 0 |
| `cc/askme` | 18 → 6 | 0 → 0 | 0 → 0 |
| `cc/triggers` | 45 → 8 | 0 → **0** | 0 → 0 |
| `cc/memory` | 21 → 5 | 0 → 0 | 0 → 0 |
| `cc/graph` | 27 → 15 | 0 → 0 | 0 → 0 |
| `cc/activity` | 30 → 5 | 0 → 0 | 0 → 0 |
| `cc/skills` | 21 → 9 | 0 → 0 | 0 → 0 |
| `cc/workers` | 23 → 11 | 0 → 0 | 0 → 0 |
| `settings/integrations` | 49 / 49 / 28 → 11 / 11 / 13 | 0 / 0 / 1 → **0 / 0 / 1** | 0 → 0 |
| `integrations/editor` | 60 / 60 / 49 → 11 / 11 / 13 | 0 / 0 / 1 → **0 / 0 / 1** | 0 → 0 |

**Rendered sub-14px text nodes across all 36 surface-scans: 1159 → 316.**
**Surfaces whose overflow count changed: 0.** The two pre-existing overflows (`cc/terminal`'s xterm
DIVs, `cc/monitor`'s `<select>` holding a long temp path) are identical at BASE and HEAD.
`zeroWidth = 0` everywhere — 01-14's `flex: 1` next to `flexShrink: 0` trap did not fire here.

### The 316 residual nodes — attributed mechanically, not by eye

The probe records, per sub-14px node, its own inline `fontSize` and whether `aria-hidden="true"` sits
on it or any ancestor. This app styles inline, so a sub-14px literal **always** surfaces as
`el.style.fontSize`. **This plan's four files contain exactly four numeric `fontSize` declarations and
all four carry `aria-hidden="true"` on the same line** (§5). Therefore no `hidden=false` node can
originate from them — that is arithmetic, not a judgement.

**Exactly three distinct `hidden=true` nodes rendered, and they are exactly this plan's allowlist:**

```
11px "▸" inline=11px hidden=true      triggers/ui.tsx:215
11px "▾" inline=11px hidden=true      triggers/ui.tsx:215
12px "✕" inline=12px hidden=true      TasksKanban.tsx:286
```

**MEASUREMENT UNAVAILABLE — the other two allowlist entries did not render in this session.**
`CommandCenterPanel.tsx:761`'s `⚠` requires an **armed circuit breaker** and `:1542`'s `✓` requires the
per-agent token-limit editor to be **open**; neither state was reachable from a stub-engine sandbox.
Their evidence is source-level only: the pasted lines in §5 show `aria-hidden="true"` and the retained
size. **Not claimed as visually verified.**

All 37 distinct `hidden=false` residuals belong to other plans. Attributed by grep:

| Rendered sub-14px text | File | Owner |
|---|---|---|
| `10px` `agree/done` `inform/topic` `propose` `query` `refuse` `request`, `12px topics`, `12px "No messages logged yet…"` | `MemoryGraphPanel.tsx` | 01-19 |
| `11px "Isolated workers…"`, `12px "Live workers"`, `12px "No workers running right now."` | `WorkersTab.tsx` | 01-19 |
| `12px "No skills installed yet…"`, `12px browse`, `12px installed` | `SkillsTab.tsx` | 01-19 |
| `9px "QUEUE"` | `MessageQueueComposer.tsx` | 01-19 |
| `13px "v"` `13px "0.4.4"` `13px "auto mode on"` `13px "☾"` `12px "🧠 memory"` | `App.tsx` | 01-19 |
| `12px "live · pty"` `12px pty-god` `12px −` `12px +` `12px 12` `12px px` | `PtyTerminalView.tsx` | 01-20 (terminal carve-out) |
| `10px "✕"` | `Modal.tsx` | 01-20 |
| `12px "Accept messages from your organisation"` | `triggers/OrgSection.tsx` | 01-18 |
| `11px "Floor heartbeat…"`, `11px "Hourly ops standup…"` | `triggers/SchedulesSection.tsx` | 01-18 |
| `11px "Michael"` `11px 0` `11px 4` `11px /`, `12px "(0)"`, `12px refresh`, `13px "✕"` | other plans' panels — all `hidden=false`, none can be this plan's | 01-18 / 01-19 / 01-20 |

**Zero of the 37 belongs to any of this plan's six files.**

---

## 8. Containment — two REAL regressions, found by the differential and fixed at source

The plan's grep criteria all passed before this was measured. **Both defects below would have shipped
behind a fully green criteria list.**

### 8.1 `triggers/ui.tsx` — the `TriggerCard` caret spilled its fixed box

```
SPAN 12x20 > 8x20 "▾" ; SPAN 12x20 > 8x20 "▸" ; SPAN 12x20 > 8x20 "▸" ; SPAN 12x20 > 8x20 "▸"
```

Four hits per surface (one per trigger card), at **1280×900, 1024×768 and 800×600**, and again on both
Settings surfaces where the triggers panel stays mounted behind the modal — 4 surfaces × 3 widths that
BASE reported as `0`. The caret sat in a `width: 8` box sized for an 11px glyph; at the token it
measures 12px.

**Containment step 2 — raise the container integer by the MEASURED delta, change nothing else.**

| Container | Before | After | Measured delta |
|---|---|---|---|
| `triggers/ui.tsx` `TriggerCard` caret `width` | **8** | **12** | **+4** (`scrollWidth` 12 vs `clientWidth` 8) |

*(The `SubHeader` caret directly below it keeps `width: 8` — it is Rule 0 exempt, stays at 11px, and
measures no overflow. Two carets, two different correct answers.)*

**This is the only container integer this plan changed.**

### 8.2 `TasksKanban.tsx` — the assignee chip spilled past the card edge

```
SPAN 98x20 > 87x20 "MICHAEL"
```

`"MICHAEL"` was 70px at 10px Press Start 2P and is **98px at 14px**, inside an 87px kanban column. The
span was the **only** one in the card's text stack without the truncation trio — its sibling title
already clips with `-webkit-box` + `overflow: hidden`. Adding
`whiteSpace: 'nowrap'; overflow: 'hidden'; textOverflow: 'ellipsis'` puts it in the state UI-SPEC names
as *"the designed response"* to width growth.

**Nothing was reflowed, moved, dropped, collapsed, or held below 14px.** The field keeps its place, its
14px size and its font; it truncates instead of spilling.

**After both fixes, re-measured: overflow identical to BASE on all 36 surface-scans.**

### Step 3 — "stop and report"

**No site in this group reached step 3.** Nothing here required a redesign.

---

## 9. Task 3 — the two FLOOR-12 surfaces no plan owned

### `global.css` — the rendered-markdown preview (the surface agent output is displayed in)

Line numbers re-derived by content, never `sed`-ed by the plan's numbers.

| Rule | Before | After |
|---|---|---|
| `.cth-md-preview code` | `font-size: 12.5px` | `font-size: var(--cth-text-mono-md)` |
| `.cth-md-preview th, td` | `font-size: 13px` | `font-size: var(--cth-text-body-md)` |
| `.cth-md-preview .cth-md-img` | `font-size: 12px` | `font-size: var(--cth-text-body-md)` |

```
grep -cE "font-size: *(1[0-3]|[0-9])(\.[0-9]+)?px" src/renderer/src/design/global.css
  before: 3      after: 0
```

**No exemption was taken for the inline-code face.** The plan permits recording one with a reason;
inline code the operator reads is user-facing text under `DESIGN.md:706` like any other, and the
operator's standing directive is the root-cause option — **migrate onto the corrected token layer**, so
it cannot drift the next time the scale moves.

**Verified in the SHIPPED artifact, not just in source** (`out/renderer/assets/index-*.css`):

```
.cth-md-preview code { font-family: var(--cth-font-mono); font-size: var(--cth-text-mono-md); … }
.cth-md-preview th, .cth-md-preview td { … font-size: var(--cth-text-body-md); }
.cth-md-preview .cth-md-img { display: inline-block; padding: 2px 8px; font-size: var(--cth-text-body-md); … }
--cth-text-mono-md: 14px;
```

Sub-14px literals surviving anywhere in `global.css`'s region of the shipped bundle: **0**. The 36
sub-14px rules that remain in that bundle are all **vendor** stylesheets — xterm.js and monaco — which
UI-SPEC puts out of the sweep entirely.

### `OfficeFloor.tsx` — the WebGL-failure fallback

Two `font-size:13px` in style strings, at the "lost its GPU context" note and the "OfficeFloor failed to
start" banner. Both → `14px`.

```
grep -c "font-size:13px" src/renderer/src/scene/office/OfficeFloor.tsx
  before: 2      after: 0
git diff --numstat 61bcd40..HEAD -- …/OfficeFloor.tsx   ->   2  2   (fence: at most 2 changed lines)
```

**Kept a LITERAL, deliberately, and it is the one place in this plan that did not migrate to a token.**
This banner is the last-resort path when the renderer is already failing; making legible error text
depend on a stylesheet having loaded is a worse failure mode than a hardcoded 14. Stated out loud
rather than quietly done.

---

## 10. The FLOOR-13 `tokens` / `budgetTokens` / `pct` residual — explicitly answered

**It is NOT in this plan's declared scope, and it was not silently absorbed.**

Verified at HEAD: `src/main/hive.ts:2049-2072` widens each `hive:tasks` row with `{tokens,
budgetTokens, pct}`, and `grep -rn "budgetTokens" src/renderer/` returns **nothing** — still zero
renderer consumers, exactly as plan 01-12 reported.

Why this plan did not take it, stated as reasons rather than as reluctance:

1. This plan's `requirements` field is **`[FLOOR-12]`**. Wiring a task-cost consumer is FLOOR-13 work.
2. This plan's must_haves truth 5 is *"Nothing was reflowed, moved, dropped, or held below 14px to make
   room."* Rendering three new fields onto a `TaskCard` adds content to a card this plan simultaneously
   pins for overflow — the two obligations are in direct conflict.
3. Its per-file M1 occurrence count is pinned at 1 and asserted by plan 23. New markup risks that count.

**The blocker stands for plan 23**, with `TasksKanban.tsx` named as the file that has to hold it. Filed
in STATE.md.

---

## 11. Guards — the regions this plan was told not to disturb

| Guard | Before | After |
|---|---|---|
| `grep -c "useHiveTasks" TasksKanban.tsx` (plan 05's migration) | 3 | **3** |
| `grep -c "disposeTerminal" CommandCenterPanel.tsx` (plan 05's audited drop path) | 2 | **2** |
| `PathLine` truncation, `const MAX = 46` | present | **present**, `:1612`, untouched |
| `dismissTask`'s local optimistic `useState` (plan 01-05) | present | **untouched** |
| `grep -c "cth-font-display"` CCP / TK / ui / IR | 5 / 12 / 3 / 2 | **5 / 12 / 3 / 2** — identical |
| `git hash-object PixelButton.tsx` | `bd286ebf…` | **`bd286ebf…`** |
| `eslint-disable-next-line` in the four files | 0 / 0 / 0 / 0 | **0 / 0 / 0 / 0** (the plan's expectation held) |

---

## 12. Containment across the wave

`BASE=61bcd409ef8e66f96b20d4e4e4e0e721816df190`, pathspec = this plan's six declared paths.

**(a) Per-commit allowlist filter — the one that catches a genuine cross-set edit.**

```
$ SHAS=$(git log --format=%H "$BASE"..HEAD -- <the six paths>)
feba9bbc85b770eac7513a8d07b9176665c864c1
a3d5b375456799a4f98bbd10a9cbcc95e8c21fa1
30da0bb4c0973e348ae78a42f0d8ddf8bed8aee3
$ echo "$SHAS" | grep -c .            ->  3          (floor is 1; an executor that committed nothing cannot pass)
$ for sha in $SHAS; do git show --name-only --format= "$sha"; done | sort -u | grep -vE "<the six paths>"
                                       ->  (no output)
```

**(b) Path-scoped and positive — the declared set actually moved.**

```
src/renderer/src/components/CommandCenterPanel.tsx
src/renderer/src/components/IntegrationsRegistry.tsx
src/renderer/src/components/TasksKanban.tsx
src/renderer/src/components/triggers/ui.tsx
src/renderer/src/design/global.css
src/renderer/src/scene/office/OfficeFloor.tsx
count = 6      (exactly the 6 declared paths)
```

**(c) Nothing left behind.** `git status --porcelain -- <the six paths>` → **empty**. Whole-tree
`git status --porcelain` → **empty** (the throwaway probe is deleted).

Every commit used an explicit pathspec on both `git add` and `git commit`. No `git add -A`, no
`git add .`, no `git commit -a`. Line endings verified CRLF-clean after every edit (an early edit
introduced 2 LF-only lines into `IntegrationsRegistry.tsx` and was repaired before the commit); NUL
bytes: 0 in every file.

---

## 13. Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | **0** — after the applier, after the hand edits, after task 3, after the containment fix |
| `node --test --test-reporter=tap test/*.test.cjs` | **EXIT 0** · `# tests 515` · `# pass 511` · `# fail 0` · `# skipped 4` · `# todo 0` — identical before and after |
| `npm run build` (Node 22.23.2) | **0** |
| `npm run e2e` (real Electron 43, local) | **2 passed** |
| **CI at `feba9bb`, all six jobs** | **green** |

```
Typecheck: success   Build: success   Electron smoke (ubuntu-latest): success
Test (ubuntu-latest): success   # tests 515  # pass 515  # fail 0  # skipped 0
Test (macos-latest):  success   # tests 515  # pass 515  # fail 0  # skipped 0
Test (windows-latest):success   # tests 515  # pass 511  # fail 0  # skipped 4
```

### TAP baseline drift, recorded

The plan's stated baseline is `# tests 426 / # pass 422`. **Measured live at the base sha:
`515 / 511 / 0 fail / 4 skipped / 0 todo`.** The plan's number is stale — 01-16 recorded the identical
drift. This plan graded against the **live** baseline. `# skipped` did not rise and `# pass` did not
fall at any checkpoint; this plan adds no tests, so a rise in `# skipped` would have been a red test
being hidden rather than fixed.

---

## 14. must_haves — every truth, with its evidence or its gap

| # | Truth | Verdict | Evidence |
|---|---|---|---|
| 1 | "No user-facing text in the command-centre, task-board, triggers-form and integrations-registry files sits below the 14px floor except allowlisted decorative glyphs" | **SATISFIED** | M1 4 / M1d 0 / M1x 0 across the four files (§2); all four residuals are the allowlist and each carries `aria-hidden` (§5); live, across 36 surface-scans, exactly three distinct `hidden=true` sub-14px nodes rendered and all three are allowlist entries, with all 37 `hidden=false` residuals attributed to other plans' files (§7). |
| 2 | "All four of the phase's NOT-exempt single-character sites are handled as content, not hidden as decoration" | **SATISFIED** | §4. Copy `Nothing here yet` live-MOUNTED at all three widths; `%` and `?` both visible, both 14px, both announcing on the AX tree; `.` swept as prose. None of the four is `aria-hidden`. |
| 3 | "IntegrationsRegistry.tsx:72's ternary fontSize, which M1 cannot see and no per-file count gates, is swept to the display token under Rule 1" | **SATISFIED** | `grep -cE "fontSize: lg \? 13 : 11"` → 0 (was 1); `cth-text-display-md` 0 → 2; family unchanged; live `14px/20px "Gh" box=40x40 clip=fits` × 3 widths (§4.4). |
| 4 | "Every icon-only button in these four files has an accessible name; no button with visible text gained an aria-label" | **SATISFIED** | 43 buttons classified, 6 icon-only, all 6 named; 4 busy-collapsed buttons additionally named via `title`; zero `aria-label` added to a text button; `unnamedBtns = 0` on Chromium's AX tree at BASE **and** HEAD across all surfaces (§6). |
| 5 | "Nothing was reflowed, moved, dropped, or held below 14px to make room" | **SATISFIED** | One container integer raised by its measured delta (8 → 12) and one span brought into the truncation contract its sibling already had. No field moved, none dropped, no row collapsed, no site held below 14px. Overflow identical to BASE on all 36 surface-scans (§8). |

**Artifacts:** `TasksKanban.tsx` provides the empty-column copy and the chip's accessible name ✓;
`triggers/ui.tsx` provides the percent unit label, kept visible and named ✓.
**Key link:** swept sites → `tokens.css` via `var(--cth-text-*)`, pattern `cth-text-` — the four files
carried **1** `cth-text-` reference between them at base sha and carry **108** now
(52 / 24 / 16 / 16). The arithmetic closes: 106 M1 sites converted **+** the one M1x site at
`IntegrationsRegistry.tsx:72` that M1 cannot see **+** the 1 pre-existing reference = 108.

---

## 15. Deviations from plan

### Auto-fixed

**1. [Rule 1 — Bug] `aria-label` alone on a bare `<span>` announces nothing.** UI-SPEC and this plan
both specify `aria-label` on the `%` and `?` glyph spans. Chromium does not expose `aria-label` on a
`role=generic` element, so both would have shipped silent with every grep green. Added `role="img"` to
both. Found by reading the AX tree, not the markup. Landed in `30da0bb`. §6.1.

**2. [Rule 1 — Bug] The `TriggerCard` caret spilled its fixed 8px box at every width.** Caused by this
sweep. Containment step 2, `width: 8` → `12`, the measured delta. Landed in `feba9bb`. §8.1.

**3. [Rule 1 — Bug] The `TasksKanban` assignee chip spilled past the card edge.** Caused by this sweep
("MICHAEL" 70px → 98px in an 87px column). Brought into the truncation contract its sibling title
already had. Landed in `feba9bb`. §8.2.

**4. [Rule 2 — Accessibility correctness] The `TriggerCard` caret was announced while its `SubHeader`
sibling was hidden.** The two are the identical decorative `▾`/`▸` disclosure glyph in the same file;
one is on UI-SPEC's frozen candidate set and one is not, only because M3's regex is single-line and
this one's ternary sits on its own line. Leaving one announced and its twin hidden is indefensible, so
the `TriggerCard` caret gained `aria-hidden="true"`. **It takes NO size exemption** — it is not on the
frozen set, so it stays on the token and contributes **no** allowlist entry. Landed in `30da0bb`.

**5. [Rule 3 — Blocking] The first probe run measured nothing.** `sub14=0` on all 30 scans, with the
app stuck behind the hive picker. Caught by the positive control, not by inspection. §7.

**6. [Rule 3 — Blocking] The 800px scans measured the floor with the command centre off screen.**
Below `SIDEBAR_COLLAPSE_WIDTH = 1024` the sidebar collapses by design. Probe now clicks `show panel`
first. §7.

**7. [Rule 3 — Blocking] Two CRLF violations.** An early edit wrote 2 LF-only lines into a CRLF file;
repaired before any commit, and every subsequent edit asserts `LF-only == 0` after writing.

### Reported, not "fixed"

**8. The plan's `aria-label` baseline is 4; the measured count is 5.** Recorded rather than rounded.

**9. The plan's TAP baseline (426/422) is stale.** Live is 515/511. Graded against live. §13.

**10. Anchor drift in four of the plan's stated line numbers.** §3.

**11. `CommandCenterPanel.tsx:761`'s `⚠` and `:1542`'s `✓` were never rendered live.** Their states
(armed circuit breaker; open token-limit editor) were unreachable from a stub-engine sandbox.
**MEASUREMENT UNAVAILABLE**, source-level evidence only. §7.

**12. The FLOOR-13 `tokens`/`budgetTokens`/`pct` consumer is out of scope and the blocker stands.** §10.

**13. `PixelButton` still takes no `aria-label`.** 01-16's root-cause blocker is unchanged; this plan
hit the same shape at `IntegrationsRegistry.tsx:392` and used the same `title` workaround.

### Requirement checkboxes

`FLOOR-12` is deliberately left **Pending** in `REQUIREMENTS.md`, matching plans 01-02 … 01-16.
**Plan 23 owns the checkboxes**, and FLOOR-12 cannot honestly be ticked until 01-18, 01-19 and 01-20
land and plan 23 asserts the repo-wide bar.

---

## 16. MEASUREMENT UNAVAILABLE — what a human still has to do

**The dev app was not opened by a human.** Everything above was measured headlessly against the shipped
bundle in a real Electron 43 BrowserWindow at three real viewport widths, with a positive control per
surface and a base-sha differential. What no automation here reached:

1. **A human looking at the swept surfaces.** Run `npm run dev`, open the command centre, the task
   board with at least one empty column, the triggers form and Settings → Connections. Confirm nothing
   reads as clipped, the empty column says `Nothing here yet`, and the `%` is still beside its input.
   The probe proves geometry and announcement; it cannot judge whether 14px Press Start 2P *looks*
   right in a 40×40 monogram box.
2. **The `⚠` circuit-breaker glyph and the `✓` save-limit glyph**, neither of which mounts without an
   armed breaker or an open token-limit editor.
3. **The rendered-markdown preview at the new sizes** — the `.cth-md-preview` surface needs real agent
   markdown on screen. Token values are proven in the shipped CSS; the rendered result is not.
4. **The WebGL-failure banners**, which by construction only appear when the GPU context is lost.

**Owner: operator, before plan 23.** Plan 23 must not tick FLOOR-12's visual clause on bundle evidence
alone.

---

## 17. Handoff

- **Plan 23** takes the 4-entry allowlist in §5 into `test/repo-claims.test.cjs` (this plan did **not**
  edit that file), plus the arithmetic in §2: after 01-17 the tree should read **237 occurrences /
  49 files** before 01-18/19/20 run.
- **Plans 18, 19, 20:** the residual-attribution table in §7 lists rendered sub-14px text that is
  yours, with its file — a free head start on which of your sites actually reach a screen.
- **Everyone: `role="img"` is required with `aria-label` on a non-interactive `<span>`.** If your plan
  specifies a bare `aria-label` on a glyph span, it specifies something that does not work.
- **`triggers/ui.tsx`'s two carets now differ on purpose** — `SubHeader`'s keeps `width: 8` / 11px
  (Rule 0 exempt), `TriggerCard`'s is `width: 12` / token. Do not "harmonise" them.

---

## Self-Check: PASSED

**Files (all six of `files_modified` exist and are committed):**

```
FOUND: src/renderer/src/components/CommandCenterPanel.tsx
FOUND: src/renderer/src/components/TasksKanban.tsx
FOUND: src/renderer/src/components/triggers/ui.tsx
FOUND: src/renderer/src/components/IntegrationsRegistry.tsx
FOUND: src/renderer/src/design/global.css
FOUND: src/renderer/src/scene/office/OfficeFloor.tsx
```

**Commits:**

```
FOUND: 30da0bb   fix(01-17): sweep the four densest FLOOR-12 files to the corrected type scale
FOUND: a3d5b37   fix(01-17): raise the two FLOOR-12 surfaces no plan owned to the floor
FOUND: feba9bb   fix(01-17): contain the two overflows the sweep actually caused
```

All three are on `origin/gsd/v1.0-milestone` and all six CI jobs are green at `feba9bb`.
