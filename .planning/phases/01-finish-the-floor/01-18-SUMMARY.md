---
phase: 01-finish-the-floor
plan: 18
subsystem: renderer-typography
tags: [FLOOR-12, sweep, a11y, containment, wave-7]
requires:
  - path: ".planning/phases/01-finish-the-floor/01-14-SUMMARY.md"
    provides: "the corrected token layer (display-md 14px, body-md/sm 14px, mono-md/sm 14px, display-sm deleted) and the aria-hidden-on-a-wrapping-span convention"
  - path: ".planning/phases/01-finish-the-floor/01-15-SUMMARY.md"
    provides: "CDP Emulation.setDeviceMetricsOverride as the only route that moves an Electron layout viewport, and the positive-control discipline"
  - path: ".planning/phases/01-finish-the-floor/01-16-SUMMARY.md"
    provides: "the BASE-vs-HEAD differential method and AX-tree accessible-name reading"
  - path: ".planning/phases/01-finish-the-floor/01-17-SUMMARY.md"
    provides: "role=img on non-interactive named spans; the probe traps (hive picker, sidebar collapse)"
provides:
  - "The triggers-tab / git / IDE-chrome cluster (13 files) clears the 14px floor: M1 68 -> 3 occurrences, M1d 1 -> 0, M1x 0 -> 0"
  - "This sub-group's frozen Rule 0 allowlist for plan 23: 3 entries, each carrying aria-hidden=\"true\" on its own fontSize line"
  - "The hoisted-shared-object rule demonstrated at its worked example, with the plan's consumer map corrected from 3 to 6"
  - "Monaco's own editor font raised off the sub-floor as a numeric literal, verified on the rendered view-lines"
affects:
  - "src/renderer/src/ide/IdePanel.tsx: default treeWidth 300 -> 424 (the one container integer this plan changed)"
tech-stack:
  added: []
  patterns:
    - "Rule 0 glyph inside a focusable <button>: aria-hidden + the local fontSize override go on a wrapping <span>, never on the button (01-14's convention, copied verbatim)"
    - "A hoisted style object's consumer list is derived by grep from live source, not taken from the plan"
    - "A redundant fontSize override on top of a swept base object is DELETED, not rewritten to the token twice"
key-files:
  created: []
  modified:
    - src/renderer/src/components/GitTab.tsx
    - src/renderer/src/components/triggers/TriggerHistoryTab.tsx
    - src/renderer/src/components/triggers/WebhooksSection.tsx
    - src/renderer/src/components/triggers/JsonEditor.tsx
    - src/renderer/src/components/triggers/SchedulesSection.tsx
    - src/renderer/src/components/triggers/OrgSection.tsx
    - src/renderer/src/components/git/CommitGraph.tsx
    - src/renderer/src/ide/IdePanel.tsx
    - src/renderer/src/ide/GitPanes.tsx
    - src/renderer/src/ide/chrome.ts
    - src/renderer/src/ide/ImagePreview.tsx
    - src/renderer/src/ide/MonacoEditor.tsx
    - src/renderer/src/ide/MonacoDiff.tsx
decisions:
  - "GitPanes' hoisted `smallBtn` has SIX consumers, not the three the plan mapped. Four are text buttons and two are glyphs. The declaration is swept and BOTH glyphs take local overrides."
  - "Monaco's own `fontSize` option is raised 12 -> 14 as a NUMERIC literal in MonacoEditor and MonacoDiff. It is user-facing editor text under DESIGN.md:706 and there is no allowlist entry it could take; Monaco cannot parse a var()."
  - "TriggerHistoryTab's eight `fontSize: 11` overrides on top of uiText/muted are DELETED rather than rewritten to the token, because post-sweep the base object already carries 14/20 and the override is a no-op."
  - "treeWidth 300 -> 424 is UI-SPEC containment step 2 with a MEASURED delta, taken after a BASE-vs-HEAD Electron differential proved the sweep spilled the git rail by 85px."
metrics:
  duration: "3h05m"
  completed: 2026-08-21
---

# Phase 01 Plan 18: Triggers-tab, git and IDE-chrome sweep Summary

Migrated the triggers-tab, git and IDE-chrome cluster (13 files, 68 M1 occurrences plus one
M1-invisible quoted `'13px'`) onto plan 14's corrected token layer — and then proved with a
BASE-vs-HEAD probe in real Electron 43 that the sweep spilled the IDE git rail out of its column by
85px, which no grep in the plan could see.

---

## 0. Base sha, commits, and the containment ledger

**Base sha (`git rev-parse HEAD` at task 1):** `c46393d61cc0ef0626eda61dbfdc8e3da6780d3f`

| # | sha | message |
|---|-----|---------|
| 1 | `2f29d0b` | `feat(01-18): sweep triggers/git/IDE chrome to the 14px floor` |
| 2 | `0f424a9` | `fix(01-18): widen the IDE file-tree column by the measured 85/124px spill` |
| 3 | `5bdf6bc` | `style(01-18): inline the treeWidth rationale so the lint anchor keeps line 278` |

```
$ git show --stat --format= 2f29d0b
 src/renderer/src/components/GitTab.tsx             | 35 ++++++----
 src/renderer/src/components/git/CommitGraph.tsx    | 11 ++--
 .../src/components/triggers/JsonEditor.tsx         |  4 +-
 .../src/components/triggers/OrgSection.tsx         |  2 +-
 .../src/components/triggers/SchedulesSection.tsx   |  5 +-
 .../src/components/triggers/TriggerHistoryTab.tsx  | 31 ++++-----
 .../src/components/triggers/WebhooksSection.tsx    | 11 +++-
 src/renderer/src/ide/GitPanes.tsx                  | 33 +++++++---
 src/renderer/src/ide/IdePanel.tsx                  | 77 +++++++++++++++-------
 src/renderer/src/ide/ImagePreview.tsx              |  8 ++-
 src/renderer/src/ide/MonacoDiff.tsx                |  5 +-
 src/renderer/src/ide/MonacoEditor.tsx              |  5 +-
 src/renderer/src/ide/chrome.ts                     |  6 +-
 13 files changed, 158 insertions(+), 75 deletions(-)

$ git show --stat --format= 0f424a9
 src/renderer/src/ide/IdePanel.tsx | 10 +++++++++-
 1 file changed, 9 insertions(+), 1 deletion(-)

$ git show --stat --format= 5bdf6bc
 src/renderer/src/ide/IdePanel.tsx | 9 +--------
 1 file changed, 1 insertion(+), 8 deletions(-)
```

### The three containment checks (wave 7, `use_worktrees: false`, one shared tree)

**(a) per-commit, filtered — the one that catches a genuine cross-set edit.**

```
$ BASE=c46393d61cc0ef0626eda61dbfdc8e3da6780d3f
$ SHAS=$(git log --format=%H "$BASE"..HEAD -- <this plan's thirteen paths>)
$ echo "$SHAS" | grep -c .
2                       # (later 3, after 5bdf6bc)
$ for sha in $SHAS; do git show --name-only --format= "$sha"; done | sort -u | grep -vE "<the thirteen>?$"
                        # NO OUTPUT
```

Every path in every one of this plan's commits is inside `files_modified`. `src/renderer/src/ide/monaco.ts`
(plan 21's) and `src/renderer/src/components/terminalFontSize.ts` appear in none of them — checked
explicitly, output `(neither present — correct)`.

**(b) path-scoped and positive — all 13 declared paths moved.**

```
$ git diff --name-only c46393d..HEAD -- <the thirteen> | sort -u | grep -c .
13
```

All thirteen listed, none missing.

**(c) nothing left behind.** `git status --porcelain -- <the thirteen>` → **empty**.

Wave-mates committed into this same tree during the run (`33fa577 docs(02)`, `87d977e docs(state)`
landed between commit 2 and commit 3). None of them touched this plan's paths, and this plan touched
none of theirs. A bare whole-tree `git diff --stat` would have shown their work and could never have
passed — which is exactly why the plan forbids one here.

---

## 1. M1 / M1d / M1x — before and after, as OCCURRENCES

Unit: **occurrences**, `grep -hoE "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" <file> | wc -l`,
the same regex and unit plan 23 asserts with in wave 9. Baseline re-derived against live source at
`c46393d` and it matched the plan's table exactly — no re-baselining was needed.

| File | plan baseline | measured at base | after | = allowlist size |
|---|---|---|---|---|
| `ide/IdePanel.tsx` | 20 | 20 | **1** | 1 |
| `components/triggers/TriggerHistoryTab.tsx` | 14 | 14 | **0** | 0 |
| `components/GitTab.tsx` | 12 | 12 | **0** | 0 |
| `ide/GitPanes.tsx` | 6 | 6 | **2** | 2 |
| `components/git/CommitGraph.tsx` | 4 | 4 | **0** | 0 |
| `components/triggers/WebhooksSection.tsx` | 3 | 3 | **0** | 0 |
| `ide/chrome.ts` | 2 | 2 | **0** | 0 |
| `ide/ImagePreview.tsx` | 2 | 2 | **0** | 0 |
| `components/triggers/SchedulesSection.tsx` | 2 | 2 | **0** | 0 |
| `components/triggers/OrgSection.tsx` | 1 | 1 | **0** | 0 |
| `ide/MonacoEditor.tsx` | 1 | 1 | **0** | 0 |
| `ide/MonacoDiff.tsx` | 1 | 1 | **0** | 0 |
| `components/triggers/JsonEditor.tsx` | 0 | 0 | **0** | 0 |
| **total** | **68** | **68** | **3** | **3** |

For these thirteen files occurrences and lines were equal at the base (`grep -c` returned the same
13 numbers), so the wave-7 / wave-9 unit divergence does not arise here.

**No whole-renderer M1 total is recorded, by the plan's explicit instruction** — five wave-mates are
editing the renderer in this same tree, so any absolute taken here is stale before it is written and
the repo-wide bar is plan 23's. What this plan contributes to that bar, as arithmetic rather than
measurement: **−65 occurrences**, and **10 of the 12 M1-carrying files in this group drop to zero**
(`IdePanel` keeps 1 and `GitPanes` keeps 2, and those three ARE the allowlist).

### M1d — decimal and quoted sub-14 literals

**Before (1 hit):**
```
src/renderer/src/components/triggers/JsonEditor.tsx:19:fontSize: '13px'
```
**After: 0 hits.**

### M1x — expression-valued sizes

**Before: 0 hits. After: 0 hits.** Nothing to record an evaluated minimum for.

---

## 2. `triggers/JsonEditor.tsx:19` — the site no plan owned and M1 cannot see

Its `editorTheme` sets `fontFamily: 'var(--cth-font-mono)'` in the same block, so it is a **Rule 2
mono** site. CodeMirror takes CSS values as strings, so the token goes in as a string.

```diff
 const editorTheme = EditorView.theme({
   '&': {
     background: 'var(--cth-paper-100)',
     color: 'var(--cth-ink-900)',
     fontFamily: 'var(--cth-font-mono)',
-    fontSize: '13px'
+    fontSize: 'var(--cth-text-mono-md)'
   },
   '&.cm-focused': { outline: 'none' },
   '.cm-content': { padding: '6px 8px' },
   '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--cth-coral)', borderLeftWidth: '2px' },
-  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '17px' },
+  '.cm-scroller': { fontFamily: 'inherit', lineHeight: 'var(--cth-lh-mono)' },
```

The plan asked whether `.cm-scroller`'s `lineHeight: '17px'` still suits a 14px face. 17/14 = 1.21 is
tight and, more to the point, it is a literal sitting beside a token — so it moved onto
`--cth-lh-mono` (20px), the token's own pair. The `height="180px"` at `:44` is a **scroller**, not a
clipped box, so containment step 1 applies (nothing) — and that was measured, not assumed:

```
CODEMIRROR @1280 {"present":true,"font":"14px","lh":"20px","edH":180,"scScrollH":180,"scClientH":180}
CODEMIRROR @1024 {"present":true,"font":"14px","lh":"20px","edH":180,"scScrollH":180,"scClientH":180}
CODEMIRROR @800  {"present":true,"font":"14px","lh":"20px","edH":180,"scScrollH":180,"scClientH":180}
```

The gating greps the plan named:

```
$ grep -cE "fontSize: '13px'" src/renderer/src/components/triggers/JsonEditor.tsx
0                                    # was 1
$ grep -c "cth-text-mono-md" src/renderer/src/components/triggers/JsonEditor.tsx
1                                    # was 0
```

---

## 3. The hoisted-shared-object rule at its worked example — and the plan's map was wrong

**The plan says `smallBtn` serves three consumers (`:110`, `:127`, `:130`). Live source says SIX.**
Two of them are glyphs, not one:

| line (after) | consumer | kind |
|---|---|---|
| `:113` | `load older…` | **text** |
| `:130` | `<Icon/> jump here` | **text** |
| `:133` | `✕` (spread + `width: 20`) | **glyph** |
| `:221` | `⇄` (spread + `width: 22`) | **glyph** |
| `:241` | `since common ancestor` / `literal difference` (spread + background) | **text** |
| `:248` | `<Icon/> switch to {branch}` | **text** |

Had the map been taken on trust, `⇄` would have been swept to 14px as ordinary text (a wrong but
harmless outcome) — but the more dangerous half is the inverse: **allowlisting the shared declaration
to protect either glyph would have held FOUR text buttons below the floor with every grep green.**
That is threat T-P18-02 and it is exactly what the rule exists to prevent.

**The swept declaration** (`grep -n "smallBtn"` + the block):

```
36:const smallBtn: React.CSSProperties = {
  padding: '0 6px', height: 20, fontFamily: 'var(--cth-font-ui)',
  fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)',
  color: 'var(--cth-ink-900)', background: 'var(--cth-cream-100)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0
};
```

**`load older…`, proven to ride the swept object and therefore to be at 14px:**

```
113:            <button style={smallBtn} onClick={() => setPage((p) => p + 1)}>load older…</button>
```

**The two local glyph overrides** (each carrying `aria-hidden="true"` on the same physical line):

```
133:            <button style={{ ...smallBtn, width: 20, justifyContent: 'center' }} onClick={() => setSelected(null)} title="Close" aria-label="Close commit details">
134:              {/* Rule 0 exempt glyph. The size override lives on this SPAN, not on
135:                  smallBtn (which also dresses `load older…` and `jump here`) and
136:                  not on the button (aria-hidden on a focusable element leaves it
137:                  in the tab order with no accessible name — axe aria-hidden-focus). */}
138:              <span aria-hidden="true" style={{ fontSize: 11 }}>✕</span>
139:            </button>

221:          <button style={{ ...smallBtn, width: 22, justifyContent: 'center' }} title="Swap base ↔ compare" aria-label="Swap base and compare branches"
...
225:            <span aria-hidden="true" style={{ fontSize: 11 }}>⇄</span>
226:          </button>
```

`aria-hidden` sits on the wrapping span and **not** on the `<button>` UI-SPEC's Rule 0 literally
names, because both glyphs ARE the entire content of a focusable button — `aria-hidden` there strips
the control from the a11y tree while leaving it in the tab order (axe `aria-hidden-focus`). That is
01-14's convention, copied verbatim, and the span doubles as the allowlist entry the hoisted-object
rule asks for.

---

## 4. This sub-group's FROZEN Rule 0 allowlist (for plan 23)

Pinned in **`fontSize`-declaration-line space at `5bdf6bc`**. Three entries. Every one carries
`aria-hidden="true"` on its own line — pasted below with the two lines that follow it, as the plan
requires:

```js
[
  'src/renderer/src/ide/IdePanel.tsx:499',   // {gitCollapsed ? '▸' : '▾'}  fontSize: 10
  'src/renderer/src/ide/GitPanes.tsx:138',   // ✕                          fontSize: 11
  'src/renderer/src/ide/GitPanes.tsx:225'    // ⇄                          fontSize: 11
]
```

```
src/renderer/src/ide/IdePanel.tsx:499:                <span aria-hidden="true" style={{ fontSize: 10, lineHeight: '14px' }}>{gitCollapsed ? '▸' : '▾'}</span>
src/renderer/src/ide/IdePanel.tsx-500-              </button>
src/renderer/src/ide/IdePanel.tsx-501-              {(['changes', 'history', 'compare'] as const).map((k) => (
--
src/renderer/src/ide/GitPanes.tsx:138:              <span aria-hidden="true" style={{ fontSize: 11 }}>✕</span>
src/renderer/src/ide/GitPanes.tsx-139-            </button>
src/renderer/src/ide/GitPanes.tsx-140-          </div>
--
src/renderer/src/ide/GitPanes.tsx:225:            <span aria-hidden="true" style={{ fontSize: 11 }}>⇄</span>
src/renderer/src/ide/GitPanes.tsx-226-          </button>
src/renderer/src/ide/GitPanes.tsx-227-          <select value={head} onChange={(e) => setHead(e.target.value)} style={sel} title="Compare — the branch whose changes you're viewing">
```

**Allowlist size == post-sweep M1, per file: `IdePanel` 1 == 1, `GitPanes` 2 == 2, every other file
0 == 0.** No file in this group has a residual that is not an allowlist entry.

**M3 confirmed the exempt set against current line numbers before the sweep** (`LC_ALL=C.UTF-8`,
scoped to these files): exactly three candidates, all three on UI-SPEC's exempt list, none NOT-exempt
(all four of the phase's NOT-exempt single-character sites are plan 17's).

```
src/renderer/src/ide/IdePanel.tsx:478:              >{gitCollapsed ? '▸' : '▾'}</button>
src/renderer/src/ide/GitPanes.tsx:130:            <button style={{ ...smallBtn, width: 20, justifyContent: 'center' }} ... aria-label="Close commit details">✕</button>
src/renderer/src/ide/GitPanes.tsx:212:            onClick={() => { setBase(head); setHead(base); }}>⇄</button>
```

---

## 5. Rule classification — and the cross-check that caught it being right

Rules were assigned by the **enclosing style object's family**, never by the physical line. The
falsifiable cross-check: the number of Rule 1 sites must equal the sum of the per-file
`grep -c cth-font-display` counts. Predicted 12, measured 12 (GitTab 2, TriggerHistoryTab 3,
SchedulesSection 1, IdePanel 6).

| Rule | count | destination |
|---|---|---|
| Rule 0 (exempt glyph) | 3 | size unchanged + `aria-hidden="true"` on a wrapping span |
| Rule 1 (display face) | 12 | `var(--cth-text-display-md)` + `var(--cth-lh-display-md)`, **`fontFamily` untouched** |
| Rule 2 (body) | 39 | `var(--cth-text-body-md)` + `var(--cth-lh-body-md)` |
| Rule 2 (mono) | 6 | `var(--cth-text-mono-md)` + `var(--cth-lh-mono)` |
| deleted as redundant | 8 | see below |
| Monaco option (numeric) | 2 | `fontSize: 14` — see §6 |
| **total** | **69** | 68 M1 + 1 M1d |

**Press Start 2P was NOT retired anywhere.** `grep -c cth-font-display` is byte-for-byte unchanged in
all thirteen files:

```
GitTab.tsx              before=2  after=2   TriggerHistoryTab.tsx   before=3  after=3
SchedulesSection.tsx    before=1  after=1   IdePanel.tsx            before=6  after=6
WebhooksSection.tsx     before=0  after=0   JsonEditor.tsx          before=0  after=0
OrgSection.tsx          before=0  after=0   CommitGraph.tsx         before=0  after=0
GitPanes.tsx            before=0  after=0   chrome.ts               before=0  after=0
ImagePreview.tsx        before=0  after=0   MonacoEditor.tsx        before=0  after=0
MonacoDiff.tsx          before=0  after=0
```

### The eight deleted overrides

`TriggerHistoryTab.tsx` carried eight sites of the shape `{ ...uiText, fontSize: 11, lineHeight: '16px' }`
and `{ ...muted, fontSize: 11 }` (`:273 :300 :328 :343 :483 :488 :499 :536`). Once `uiText` and
`muted` are swept to 14/20, an 11/16 override on top of them is not a smaller size — it is a value
that has to be rewritten to the *same* token twice. They were **deleted**, leaving `style={muted}`
and `style={uiText}`. Rendered output is identical to writing the token twice; the diff is smaller
and there is one fewer place for the next drift to start.

### One structural `lineHeight` deliberately NOT tokenised

`CommitGraph.tsx:171` keeps `lineHeight: \`${ROW_H}px\`` (24px). It is not typography — it is what
vertically centres the row inside its `height: ROW_H` box. ROW_H (24) already exceeds
`--cth-lh-body-md` (20), so the 14px face has room; replacing it with the token would have
mis-centred every commit row. Recorded as a deliberate exception with the reason in the source.

### The orphaned-lineHeight re-scan (01-15's finding)

Every `lineHeight` in these thirteen files was enumerated **before** the sweep: 24 sites, and not one
was orphaned onto its own line below its `fontSize`. Re-scanned after: no `lineHeight: 'NNpx'` is
left paired with a tokenised `fontSize` anywhere in the set except the three allowlist entries and
`CommitGraph`'s structural one, both accounted for above.

---

## 6. Monaco: the decision, and what actually renders

**Decision — `MonacoEditor.tsx` and `MonacoDiff.tsx` raise Monaco's own `fontSize` option 12 → 14 as
a NUMERIC literal.** The plan says "do not route Monaco's `fontSize` option through a CSS token", and
that constraint is kept — Monaco takes a number and cannot parse `var()`. But leaving it at 12 was
not an option either: it is the text of every file the operator reads and every diff they review,
squarely inside DESIGN.md:706, and there is no allowlist entry it could take (it is not a decorative
glyph, so it can never carry `aria-hidden`). Under the plan's own criterion — per-file M1 must equal
that file's allowlist size — 12 would have failed both files. `lineHeight: 20` was already the mono
token's pair, so 14/20 is the token's value written as literals.

```diff
         fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
+        // DESIGN.md:706 floor. Monaco takes a NUMBER here, not a CSS length, so
+        // this is the token's own value (--cth-text-mono-md 14 / --cth-lh-mono 20)
+        // written as a literal rather than a var() the editor cannot parse.
-        fontSize: 12,
+        fontSize: 14,
         lineHeight: 20,
```

**Verified on the rendered view-lines, not assumed from the source change.** Read off
`.monaco-editor .view-line` computed style in real Electron 43:

```
MONACO monaco@1280     {"monacoLines":45,"lineFont":"14px","lineLH":"20px","lineText":"const line0 = \"a sample so"}
MONACO monaco@1024     {"monacoLines":38,"lineFont":"14px","lineLH":"20px","lineText":"const line0 = \"a sample so"}
MONACO monaco@800      {"monacoLines":30,"lineFont":"14px","lineLH":"20px","lineText":"const line0 = \"a sample so"}
MONACO monacodiff@1280 {"monacoLines":90,"lineFont":"14px","lineLH":"20px","lineText":"const line0 = \"a sample so"}
MONACO monacodiff@1024 {"monacoLines":78,"lineFont":"14px","lineLH":"20px","lineText":"const line0 = \"a sample so"}
MONACO monacodiff@800  {"monacoLines":59,"lineFont":"14px","lineLH":"20px","lineText":"const line0 = \"a sample so"}
```

Real line count, real text content, real 14px/20px. At the BASE sha the same probe reported
`sub14=315(hidden 315)` / `sub14=630(hidden 630)` on the same two surfaces — i.e. **every rendered
line of source and every rendered line of diff was below the floor before this change** — and 0
after. `ide/chrome.ts` and the IDE's own style objects were swept normally;
`components/terminalFontSize.ts` and everything xterm were not touched (proven in §0's containment
filter).

---

## 7. A GREEN GREP IS NOT A GREEN PIXEL — the live probe and the BASE differential

A throwaway harness mounted the **real components** from `src/renderer/src` with the **real**
`tokens.css` / `global.css` and the **real** three-font stack (`document.fonts.check` confirmed
`Press Start 2P`, `Inter` and `JetBrains Mono` all loaded on every scan), inside **real Electron
43.4.1**, at three viewports moved with **CDP `Emulation.setDeviceMetricsOverride`** — the only route
that moves an Electron layout viewport (01-15). `window.innerWidth` was read back on every scan and
tracked the request (`inner=1024x768`, `inner=800x600`), so no narrow-viewport claim rides a 1280px
layout. The harness was **deleted before committing**; `git status --porcelain | grep -i p18` returns
nothing and `e2e/` contains only `smoke.spec.ts`.

**Eleven surfaces × three widths = 33 scans, and 33/33 mounted at BOTH shas.**

**The positive control earned its keep three times.** Run 1: `triggers` reported `texts=0` and every
marker MISSING — TriggersTab was throwing on an unstubbed `webhooksStatus.endpoints`. A clean
sub-14px scan over a component that never rendered is worth nothing. Run 2: `trigger-history` mounted
with `texts=5` (empty state only) — its rich card, badge, mono body-box and link-button states
weren't on screen at all; seeding the ledger took it to `texts=32`. Run 3: `gitpanes_history` never
showed its `✕` because that lives in the commit-detail pane, which only exists once a commit row is
picked — a click was added, and `load older…` needed 220 commits (the button is gated on
`commits.length >= page * 200`) before it would render at all.

**The differential: the identical probe against BASE `c46393d`**, built from a copy of
`src/renderer/src` with only this plan's thirteen files reverted (M1 over that copy returned exactly
`68`, confirming the right bytes were under test).

### Sub-14px rendered text nodes, BASE → HEAD

| surface | BASE sub14 | HEAD sub14 | of which `aria-hidden` |
|---|---|---|---|
| `gittab` (×3 widths) | 108 | **0** | — |
| `history` (×3) | 29 | **0** | — |
| `jsoneditor` (×3) | 15 | **0** | — |
| `commitgraph` (×3) | 664 | **0** | — |
| `gitpanes_history` (×3) | 679 | **1** | 1 (`✕`) |
| `gitpanes_compare` (×3) | 18 | **1** | 1 (`⇄`) |
| `imagepreview` (×3) | 6 | **0** | — |
| `monaco` (×3) | 315 / 266 / 210 | **0** | — |
| `monacodiff` (×3) | 630 / 546 / 412 | **0** | — |
| `ide` (×3) | 34 | **7** | 1 (`▾`) + **6 not this plan's** |
| `triggers` (×3) | 4 | **2** | 2 (`▸`, plan 17's, already hidden) |

**Every `hidden=false` residual is attributed mechanically, not by judgement.** All six on `ide` are
`FileTree.tsx` (`copy` at 10px, `src` / `README.md` / `logo.png` at 12px) — **plan 20's file**, which
IdePanel renders inside its column. This plan's own IdePanel M1 is 1 and it is the aria-hidden caret.
The two on `triggers` are `triggers/ui.tsx`'s TriggerCard caret — **plan 17's**, already carrying
`aria-hidden`.

**All three allowlist entries were observed RENDERING, at their pinned sizes, `hidden=true`, at every
width:**

```
sub14 gitpanes_history@1280|1024|800  11px hidden=true <SPAN> inline="11px" "✕"
sub14 gitpanes_compare@1280|1024|800  11px hidden=true <SPAN> inline="11px" "⇄"
sub14 ide@1280|1024|800               10px hidden=true <SPAN> inline="10px" "▾"
```

### THE FINDING: the sweep spilled the IDE git rail, and no grep in the plan could see it

| element | BASE | HEAD (before fix) | after fix |
|---|---|---|---|
| IDE git rail `▾ CHANGES HISTORY COMPARE` | **overflow 0** | `<DIV> 299x32 dx=85` | **0** |
| IdePanel left column (same spill, outer) | **0** | `<DIV> 299xH dx=85` | **0** |
| ComparePane header block | `<DIV> 300x78 dx=39` | `<DIV> 300x78 dx=112` | **0** |
| ComparePane action row | `<DIV> 276x40 dx=51` | `<DIV> 276x40 dx=124` | **0** |
| ComparePane branch `<select>` | — | `<SELECT> 123x22 dx=32` | **0** |

Identical at 1280×900, 1024×768 and 800×600.

The git rail carries three Press Start 2P labels which FLOOR-12 Rule 1 puts at 14px. Press Start 2P
advances ~1em per character, so `CHANGES` + `HISTORY` + `COMPARE` alone is 21 × 14 = 294px, and with
padding, gaps and the caret button the rail needs ~386px inside a 300px column. It does not truncate
— nothing on that row sets `nowrap`/`ellipsis` — it paints out over the editor. **The ComparePane
rows were ALREADY spilling before this plan (39px and 51px) and the sweep made them worse.**

**Fix, at source, in its own commit (`0f424a9`): UI-SPEC containment step 2 — raise the container
integer by the measured delta and change nothing else.** Step 1 does not apply (nothing truncates);
reflowing the row, wrapping it, shrinking the buttons or holding a site below 14px are all
explicitly forbidden. The container is `IdePanel.tsx:108`'s `treeWidth`:

```diff
-  const [treeWidth, setTreeWidth] = useState(300);
+  const [treeWidth, setTreeWidth] = useState(424); // 424 = 300 + the 124px spill MEASURED in real Electron 43 at 1280/1024/800; inside the 200..520 drag clamp.
```

424 is the larger of the two measured requirements (386 for the rail, 424 for ComparePane's action
row), and it sits inside the splitter's **pre-existing** `Math.min(520, Math.max(200, …))` clamp — so
no clamp changed and the operator can still drag the column back.

**After the fix, `overflow=0` on `ide`, `gitpanes_history` and `gitpanes_compare` at all three
widths.** The pre-existing ComparePane spill is closed as a side effect and is called out here rather
than claimed as this plan's bug.

### Overflow residuals, honestly

Three overflow rows survive at HEAD. None is app chrome and none is text a user cannot read:

- `commitgraph <DIV> 424xH dy=4380/4512/4680` — **byte-identical to BASE** (4380/4512/4680). It is
  220 commit rows at a fixed `ROW_H` 24 being taller than the window; in the app that list lives
  inside `overflow: 'auto'`, and the harness wrapper deliberately did not scroll so the number would
  be comparable across shas. Unchanged by the sweep, as the row height is a constant.
- `monacodiff@800 <DIV> 706x20 dx=999294` — present at BASE too (`718x20 dx=999282`). Monaco's own
  virtual line width.
- `monacodiff@1280 <DIV> 52x1200 / 72x1200 dx=1 dy=12` — **HEAD only, and reported as such.** These
  are Monaco's own line-number and glyph-margin overlays, sized by Monaco from the 20px line height
  inside its own scroller; `dx=1` is sub-pixel rounding and `dy=12` is under two thirds of one line
  on a 1200px internally-scrolled column. It did not reproduce at 1024 or 800. Not app chrome, not
  clipped prose — but it is a HEAD-only delta and it is not being hidden.

### What the probe does and does not cover

**Covers:** the real components, the real stylesheets, the real fonts, real Chromium layout,
computed `fontSize`/`lineHeight` on real text nodes, real `scrollWidth`/`clientWidth` overflow, and
real accessible names from CDP `Accessibility.getFullAXTree` — in the same Electron the app ships.

**Does not cover:** the main process and IPC (stubbed), and real on-disk git/webhook state. Container
widths were reproduced from the shipped app rather than inherited from it — and **the shipped app was
driven separately as the control for that**: booted from `out/main/index.js`, through the hive picker
onto the floor, into the command centre's `triggers` tab and into the IDE, where the live button
inventory came back `["Close IDE","Collapse the git panel","changes","history","compare","Refresh git
status","copy","copy"]` and the live sidebar measured 420px wide. That run is what the 420 / 424
harness containers are taken from. Where the two disagree, the shipped app wins.

---

## 8. Accessible names — the rule, not the ratio

Baseline confirmed against live source: **22 `<button>` and 8 `aria-label`** across the thirteen
files, exactly the plan's numbers (plus 13 `<PixelButton>`).

| | before | after |
|---|---|---|
| `<button>` | 22 | 22 |
| `<PixelButton>` | 13 | 13 |
| `aria-label` attributes | 8 | 8 |
| `aria-hidden="true"` attributes | 1 | 4 |

**ZERO `aria-label`s were added, and that is the correct outcome, not a miss.** Every one of the 35
controls in this set already has an accessible name: the icon-only ones (`Close IDE`, the git-rail
caret, `Refresh git status`, `Close {file}`, `Refresh diff`, `Copy path {path}`, `Close commit
details`, `Swap base and compare branches`) all carried `aria-label` before this plan; every other
control has visible text. Adding `aria-label` to a button with visible text overrides that visible
label and is the anti-pattern UI-SPEC bans — the same call as 01-14's AgentStrip, 01-15's settings
cluster, 01-10's README and 01-04's CONTRIBUTING.md.

**Proven live, not by grep:** `unnamedButtons=0` on all 33 surface-scans at HEAD, read off the CDP AX
tree with ignored nodes excluded (5 buttons on `gittab`, 9 on `triggers`, 5 on `history`, 3 on each
`gitpanes` pane, 9 on `ide`, 4 on `imagepreview`). The same probe at BASE also reported 0, so this
plan neither gained nor lost a name.

**One case examined and deliberately left alone:** `GitTab.tsx:130`'s refresh `PixelButton` renders
`{loading ? '...' : 'refresh'}`, so during a refresh its accessible name collapses to `...`. It is
`disabled` in exactly that state — out of the tab order and not operable — and in its operable state
it reads `refresh`. A `title` would not help (text content beats `title` in the accname computation)
and an `aria-label` would override the visible label on the button voice users actually click.
Recorded rather than papered over.

**The `role="img"` finding from 01-17 did not apply here.** All three of this group's glyphs are
`aria-hidden` decorations inside already-named buttons, not named non-interactive spans, so there is
no bare-`aria-label`-on-a-`<span>` case in this file set.

---

## 9. The four `eslint-disable-next-line` anchors — on their exact recorded lines

Baseline recorded in task 1: exactly four, one each, and zero in the other nine files.
`grep -c` returns `1` for each. Pasted with the line each targets:

```
src/renderer/src/components/GitTab.tsx:84:    // eslint-disable-next-line react-hooks/exhaustive-deps
src/renderer/src/components/GitTab.tsx-85-  }, [cwd]);
--
src/renderer/src/components/triggers/WebhooksSection.tsx:149:    // eslint-disable-next-line react-hooks/exhaustive-deps
src/renderer/src/components/triggers/WebhooksSection.tsx-150-  }, [schemaOpen]);
--
src/renderer/src/components/triggers/SchedulesSection.tsx:184:    // eslint-disable-next-line react-hooks/exhaustive-deps
src/renderer/src/components/triggers/SchedulesSection.tsx-185-  }, [open]);
--
src/renderer/src/ide/IdePanel.tsx:278:    // eslint-disable-next-line react-hooks/exhaustive-deps
src/renderer/src/ide/IdePanel.tsx-279-  }, [root]);
```

**All four are on the exact line numbers task 1 recorded (84 / 149 / 184 / 278), each immediately
above a byte-identical target line.** Two of them had to be actively defended:

- `SchedulesSection.tsx` — the first pass expanded its `NEW SCHEDULE` div from one line to four,
  pushing the anchor 184 → 187. Collapsed back to one line, restoring 184.
- `IdePanel.tsx` — the containment fix's eight-line rationale block sits above the anchor and pushed
  it 278 → 286. The suppression binds by adjacency so it was never *detached*, but a criterion that
  has to be argued is not a criterion: the rationale moved into commit `0f424a9`'s message and the
  code kept a one-line trailing comment (`5bdf6bc`), zero net lines, anchor back on 278.

`src/renderer/src/ide/monaco.ts` (plan 21's `no-explicit-any` disable, which plan 21 **deletes**) was
not touched — proven by §0's per-commit filter, not asserted.

---

## 10. Container integers changed

**Exactly one, and its delta was measured in a running Electron window, never derived from font
metrics.**

| file:line | integer | before | after | delta | how it was measured |
|---|---|---|---|---|---|
| `src/renderer/src/ide/IdePanel.tsx:108` | `treeWidth` initial state | 300 | **424** | **+124** | BASE-vs-HEAD CDP probe at 1280/1024/800: git rail `dx=85`, ComparePane action row `dx=124` (of which 51 pre-existing) |

**Checked and deliberately left alone:** `smallBtn`'s `height: 20` and `ideTextBtn`'s `height: 20`
(14px text in a 20px inline-flex box — measured `overflow=0` on `gitpanes_*` and `imagepreview` at
all three widths); `sel`'s `height: 22`; `CommitGraph`'s `ROW_H = 24`; `IdePanel`'s titlebar
`height: 36`, tab strip `height: 30` and tab `maxWidth: 240`; `TriggerHistoryTab`'s source-tab
`height: 32`; `JsonEditor`'s `height="180px"`; the splitter's `200..520` clamp. Nine containers
inspected, one moved. The one raised is the one the probe said was broken.

---

## 11. Gates

| gate | task 1 baseline | after the sweep | after the containment fix |
|---|---|---|---|
| `npm run typecheck` | — | **0** | **0** |
| `node --test --test-reporter=tap test/*.test.cjs` EXIT | `0` | `0` | `0` |
| `# tests` | 515 | 515 | 515 |
| `# pass` | 511 | 511 | 511 |
| `# fail` | **0** | **0** | **0** |
| `# skipped` | 4 | 4 | **4** |
| `# todo` | 0 | 0 | 0 |
| `npm run build` | — | 0 (`✓ built in 51.92s`) | — |

`# skipped` did not rise and `# pass` did not fall, so no red test was converted into a skip
(T-P18-92). The TAP file was written through `mktemp` every time, never to a repo-root name, so no
wave-mate could truncate it mid-grep.

> **Note on the plan's TAP baseline.** The plan pins `# tests 426 / # pass 422 / # skipped 4`. Live
> at `c46393d` the suite is **515 / 511 / 0 fail / 4 skipped** — wave-mates added 89 tests between
> plan time and now. The baseline was re-taken against live source and the *invariants* (`fail 0`,
> `todo 0`, skipped not rising, pass not falling) are what this plan gated on.

**CI:** pushed to `origin/gsd/v1.0-milestone` at `5bdf6bc` — see §13.

---

## 12. Deviations from plan

### Auto-fixed

**1. [Rule 1 — Bug] The IDE git rail spilled its column by 85px after the sweep**
- **Found during:** task 2 live verification (BASE-vs-HEAD differential).
- **Issue:** three Press Start 2P labels at 14px need ~386px inside a 300px file-tree column; nothing
  on that row truncates, so it painted over the editor at all three widths.
- **Fix:** `treeWidth` 300 → 424, the measured delta, inside the existing drag clamp.
- **Files:** `src/renderer/src/ide/IdePanel.tsx` · **Commit:** `0f424a9`

**2. [Rule 1 — Bug] Monaco's own editor font was below the floor and had no lawful allowlist entry**
- **Found during:** task 1 classification.
- **Issue:** the plan's "don't route Monaco's `fontSize` through a token" was read by an earlier draft
  as "leave it at 12", which would have left `MonacoEditor`/`MonacoDiff` at M1 1 with an allowlist
  size of 0 (a glyph exemption they cannot take) — and shipped every line of source and diff below
  DESIGN.md:706.
- **Fix:** `fontSize: 12 → 14` as a numeric literal in both, with the reason in the source.
- **Files:** `MonacoEditor.tsx`, `MonacoDiff.tsx` · **Commit:** `2f29d0b`

**3. [Rule 3 — Blocking] The plan's `smallBtn` consumer map was incomplete**
- **Found during:** task 1.
- **Issue:** the plan lists three consumers; live source has six, and **two** are glyphs, not one.
  Acting on the plan's map would have left `⇄` un-handled.
- **Fix:** map re-derived by grep; both glyphs took local overrides.
- **Files:** `GitPanes.tsx` · **Commit:** `2f29d0b`

**4. [Rule 3 — Blocking] Two lint anchors were displaced by the plan's own edits**
- **Fix:** both restored to their exact recorded line numbers (§9).
- **Commits:** `2f29d0b`, `5bdf6bc`

### Reported, not silently satisfied

- **`ComparePane`'s pre-existing overflow.** BASE already spilled by 39px and 51px at 300px. This
  plan closed it because the same integer fixes both, but the pre-existing half is **not** claimed as
  this plan's regression.
- **The whole-renderer M1 total is deliberately absent.** The plan forbids it; the executor brief
  asks for "repo-wide arithmetic closed". Resolved by recording this plan's **contribution**
  (−65 occurrences, 10 files to zero) rather than an absolute that five concurrent wave-mates
  invalidate. §1.
- **`monacodiff@1280`'s HEAD-only `dy=12` inside Monaco's own margin overlay.** §7.
- **`GitTab.tsx:130`'s busy-state `...` label.** §8.

### Not required, not performed

- **`test/repo-claims.test.cjs` was not edited.** Plan 23 assembles all seven arrays.
- **Requirement checkboxes (`FLOOR-12`) were not ticked.** Plan 23 owns them, per the wave-7 handoff.

---

## 13. Truths — measured, not asserted

| # | must_have truth | verdict | evidence |
|---|---|---|---|
| 1 | No user-facing text in the triggers-tab, git and IDE-chrome files sits below the 14px floor except allowlisted decorative glyphs | **SATISFIED** | M1 68 → 3, M1d 1 → 0, M1x 0 → 0 (§1); all 3 residuals are the allowlist and each carries `aria-hidden` on its own line (§4); live at 1280/1024/800 the only `hidden=true` sub-14px nodes rendering from these files are those 3, and every `hidden=false` residual is mechanically attributed to `FileTree.tsx` (plan 20) or `triggers/ui.tsx` (plan 17) (§7) |
| 2 | The hoisted-shared-object rule is applied at its one verified worked example — the shared declaration is swept and only the glyph gets a local override | **SATISFIED, and the plan's map corrected** | `smallBtn` swept to `--cth-text-body-md`; `load older…`, `jump here`, the mode toggle and `switch to` all ride it at 14px; **both** glyph consumers (`✕` :138, `⇄` :225) carry local overrides; declaration NOT allowlisted (§3) |
| 3 | Every icon-only button in these twelve files has an accessible name; no button with visible text gained an `aria-label` | **SATISFIED** | 22 `<button>` / 8 `aria-label` before and after — zero added, zero removed; `unnamedButtons=0` on all 33 live AX-tree scans; the one busy-state edge case examined and recorded (§8) |
| 4 | All four `eslint-disable-next-line` suppressions in this set are still on their exact target lines | **SATISFIED** | 84 / 149 / 184 / 278, each with a byte-identical target line below it; two displacements found and actively reversed (§9) |
| 5 | `triggers/JsonEditor.tsx:19`'s quoted `fontSize: '13px'` is swept to the mono token, and the M1d/M1x scans over this group are clean | **SATISFIED** | `grep -cE "fontSize: '13px'"` → 0 (was 1); `grep -c cth-text-mono-md` → 1 (was 0); M1d 0, M1x 0 over all thirteen paths; live CodeMirror measures `font 14px / lh 20px` with no scroller spill (§2) |

**Artifacts:** `GitPanes.tsx` provides the swept `smallBtn` plus its glyph overrides (§3);
`IdePanel.tsx` provides the swept chrome with its `▸`/`▾` ternary allowlisted and its suppression
anchor intact (§4, §9); `JsonEditor.tsx` contains `cth-text-mono-md` (§2). **Key link:** every swept
site resolves through `var(--cth-text-*)` / `var(--cth-lh-*)` into
`src/renderer/src/design/tokens.css`; no numeric literal survives outside the 3-entry allowlist and
Monaco's two documented options.

---

## 14. CI

Pushed to `origin/gsd/v1.0-milestone`:

```
$ git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin gsd/v1.0-milestone
   c46393d..5bdf6bc  gsd/v1.0-milestone -> gsd/v1.0-milestone
```

**All six jobs GREEN at `5bdf6bc`**, run ids `32482022316` (CI) and `32482022366` (E2E):

| job | conclusion |
|---|---|
| Typecheck | **success** |
| Build | **success** |
| Test (ubuntu-latest) | **success** |
| Test (macos-latest) | **success** |
| Test (windows-latest) | **success** |
| Electron smoke (ubuntu-latest) | **success** |

The same six were green at the base sha `c46393d`, so this plan neither introduced nor inherited a
red job. No "pre-existing failures" baseline is being claimed anywhere in this summary.

---

## 15. Outstanding

- **The operator visual check.** `MEASUREMENT UNAVAILABLE — a human must open the git tab, the
  triggers tabs and the IDE panel (with a diff open) in the dev app and confirm nothing is clipped,
  `load older…` is legible, and Monaco's own font looks right.** Everything a machine can measure was
  measured (33 mounted surface-scans at three real viewports, at two shas, with per-node computed
  font sizes, overflow deltas and AX-tree names); a human eye on the finished pixels is the one thing
  automation cannot substitute for, and it is not being claimed.
- **The 424px default file tree is a visible product change.** At 800×600 the IDE editor drops to
  376px. It is the smallest value that satisfies UI-SPEC's containment ladder without a forbidden
  reflow, and the operator can drag it back — but it deserves a look.
- **Inherited and untouched:** the FLOOR-13 `tokens/budgetTokens/pct` consumer blocker; the
  `PixelButton` `aria-label`-prop root-cause blocker (byte pin `bd286ebf…` intact, and this plan
  modified no `PixelButton`); `CommandCenterPanel`'s WARNING/TICK allowlist glyphs never rendered
  live.
- **Requirement `FLOOR-12` stays `Pending`** — plan 23 owns every sweep plan's checkbox.

---

## Self-Check: PASSED

- All 13 modified files and this SUMMARY exist on disk (`[ -f ]` per path).
- All three commit shas resolve in `git log --oneline --all`: `2f29d0b`, `0f424a9`, `5bdf6bc`.
- No hobby-mode phrase ("manual-equivalent", "single-PR adaptation", "collapsed ceremony",
  "deferred to follow-up", "pre-existing failures baseline") appears anywhere in this file.
- No whole-renderer M1 total is recorded, as the plan's `<output>` requires.
