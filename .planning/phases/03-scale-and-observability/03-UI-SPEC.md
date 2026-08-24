---
phase: 3
slug: scale-and-observability
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-24
mode: auto — every open design question resolved by the researcher, logged in §"Auto-Mode Decision Log"
measured_at: 0c90d38 (Windows 11, this machine, 2026-08-24)
---

# Phase 3 — UI Design Contract

> Visual and interaction contract for the three surfaces Phase 3 adds:
> **the day band** (SCALE-03), **the consolidated agent card** (SCALE-05), and
> **the team import review sheet + export affordance** (SCALE-02).

**Nothing here re-opens a locked decision.** `03-CONTEXT.md` D-25, D-26, D-27, D-28, D-33, D-34
and D-35 are LOCKED; this contract's job is to specify them precisely enough that an executor can
build them without a second design conversation. Where CONTEXT explicitly delegated a choice to the
planner (bucket granularity, detail-row cap, duplicate-name defaulting, export button location),
this contract makes the choice and records the alternative that lost.

**Every current-state claim below carries a `file:line` read with a command run in THIS session at
`0c90d38`.** Planning documents in this repo have measurably rotted anchors — three were corrected
by `03-CONTEXT.md` itself and two more are corrected in §"Corrections to upstream documents" below.
Nothing is quoted on trust.

**Requirements in UI scope:** SCALE-02, SCALE-03, SCALE-05.
**Out of UI scope:** SCALE-01 (a default-path change plus a `repoint()` — no rendered output beyond
the honest limitation text D-13 requires, which is docs/settings copy, not a new surface) and
SCALE-04's scheduler/delivery mechanics (its one UI obligation — the *"requires Start at login"*
line beside the digest toggle, D-32 — is specified in §S4 and is a single sentence, not a surface).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none** — `DESIGN.md` + `src/renderer/src/design/tokens.css` are the system |
| Preset | not applicable |
| Component library | in-house: `PixelPanel`, `PixelButton` (`PixelButton.tsx:20`), `PixelBadge` (`PixelBadge.tsx:49`), `Modal` (`Modal.tsx:65`), `Icon` (`Icon.tsx:136`), `SpritePortrait`, `Select` (`components/triggers/ui.tsx:113`) |
| Icon library | none — a hand-drawn 16×16 pixel path set in `Icon.tsx` (`IconName` at `Icon.tsx:6-10`) plus inline Unicode BMP glyphs |
| Font | `--cth-font-display` Press Start 2P · `--cth-font-ui` Inter · `--cth-font-mono` JetBrains Mono (`tokens.css:55-57`) |
| New dependency | **none.** `package.json` and `package-lock.json` are frozen for the whole phase (D-37) |

### shadcn gate — executed 2026-08-24, resolved NO

`components.json`, `tailwind.config.*` and `postcss.config.*` are all absent (verified by `ls` at the
repo root, this session — the command returned nothing). Stack is React 18 + Vite + Electron, so the
gate fires. **Resolved to N without asking**, on the same grounds `01-UI-SPEC.md` and
`02-UI-SPEC.md:48-56` resolved it: shadcn/Radix would displace an existing pixel-art token layer, and
initialising it requires writing `package.json`, which D-37 bans outright for every plan in this
phase. **Registry safety gate: not applicable.** No third-party registry is declared, and no source
file is vendored by this phase.

---

## Spacing Scale

Existing, unchanged. `tokens.css:42-50`. Base unit 4px (`DESIGN.md:151-155`). Reproduced so the
checker does not have to open a second file:

| Token | Value | Usage |
|-------|-------|-------|
| `--cth-space-1` | 4px | icon gaps, chip padding, band track gap |
| `--cth-space-2` | 8px | compact element spacing, stat-grid gap |
| `--cth-space-3` | 12px | panel internal padding (`DESIGN.md:159`) |
| `--cth-space-4` | 16px | default element spacing, standard gutter |
| `--cth-space-5` | 24px | section padding, one band track's height |
| `--cth-space-6` | 32px | layout gaps |
| `--cth-space-7` | 48px | major section breaks |
| `--cth-space-8` | 64px | page-level spacing |

**Exceptions for this phase: one, and it is a target-size floor rather than a rhythm break.**

- **The scrubber thumb is 24 × 24px.** 24 is on the 4-grid (`--cth-space-5`), so it does not break
  the scale — it is called out because it is *larger* than a slider thumb would normally be drawn.
  Reason: WCAG 2.2 SC 2.5.8 (Target Size, Minimum) is 24 × 24 CSS px, and the moment we style
  `::-webkit-slider-thumb` we forfeit the "user agent control" exception. `DESIGN.md:11` ("Chunky
  over slick") makes the accessible size also the correct-looking one here.

**No spacing token is added, changed or removed by this phase.** Every new surface composes from
`--cth-space-*`.

**Inherited exception, not introduced:** any chip this phase places on an agent card reuses
`padding: '1px 4px 0'` verbatim from the existing `BOSS`/`AUTO` chips so the optical baseline holds —
recorded and kept in `01-UI-SPEC.md` and `02-UI-SPEC.md:88-93`. This phase adds no card chip, so the
exception is listed only to confirm it is not re-litigated.

---

## Typography

**Unchanged.** Every value below read from `tokens.css:67-81` this session:

| Role | Token | Size | Line height | Family |
|------|-------|------|-------------|--------|
| Display lg | `--cth-text-display-lg` | 16px | 24px | Press Start 2P |
| Display md | `--cth-text-display-md` | 14px | 20px | Press Start 2P |
| Body lg | `--cth-text-body-lg` | 16px | 24px | Inter |
| Body md | `--cth-text-body-md` | 14px | 20px | Inter |
| Body sm | `--cth-text-body-sm` | 14px | 18px | Inter |
| Mono md | `--cth-text-mono-md` | 14px | 20px | JetBrains Mono |
| Mono sm | `--cth-text-mono-sm` | 14px | 18px | JetBrains Mono |

**Weights: 400 regular, 600 semibold.** Two. This phase adds neither. (`DESIGN.md:136`'s "never
bold" is known drift recorded in `01-UI-SPEC.md`; unchanged here.)

### THE HARD FLOOR — mechanically enforced, verified this session

> **No text this phase adds may be below 14px. Ever.**

This is not a guideline in this repo; it is an equality assertion against a frozen list. Verified at
`0c90d38`:

| Clause | Location | What it does |
|--------|----------|--------------|
| M1 regex | `test/repo-claims.test.cjs:684` | `/fontSize *[:=] *\{?(1[0-3]\|[1-9])($\|[^0-9.])/g`, occurrence-counting, over comment-stripped renderer sources |
| The frozen allowlist | `test/repo-claims.test.cjs:712-729` | **16 entries**, counted this session (`grep -c "^  { file:"` → 16). Keyed on `{file, text, count}` — content, never line number |
| Clause 1 | `:752` | no `--cth-text-*` token below 14px; `--cth-text-display-sm` / `--cth-lh-display-sm` must stay **deleted**, not merely raised |
| Clause 2 | `:782` | **exact multiset equality** between the tree and the allowlist. A new sub-14px literal fails whether it is a new key or a bumped count |
| Clause 3 | `:815` | every allowlisted site must sit on an element carrying `aria-hidden` |
| Clause 4 | `:840` | binds the two **Pixi** `FONT_SIZE` constants and `FullscreenTerminal`'s `Math.max` floor |
| Decimal/quoted escape hatch | `:865` | `M1d` catches `fontSize: 12.5` and `fontSize: '13px'`, which M1 is structurally blind to. **Not eligible for the allowlist** — that list is literal-only |
| Expression floor | `:900` | every `clamp`/`Math.max`-valued size carries its own ≥14 floor |

**Binding consequences for this phase, stated so the executor cannot trip them by accident:**

1. **Do not widen the allowlist.** Every one of the 16 entries is a decorative glyph inside an
   `aria-hidden` span. This phase introduces **zero** new sub-14px sites and **zero** allowlist
   entries. If a design pressure appears to require one, that is a stop-and-report.
2. **The density band carries no text at all** (D-25). That is not a convenience — it is why the
   floor does not constrain the dense part of the timeline. Every label on the day band surface is a
   normal DOM element **outside** the `<svg>`, at a token size. There is **no `<text>` element inside
   the band SVG**, and there must not be one: an SVG `<text>` inside a `viewBox` scaled by
   `preserveAspectRatio="none"` has no stable px size at all, which makes the floor unassertable
   rather than merely violated.
3. **`tokens.css` offers nothing below 14px with a 20px line-height** — verified: the smallest text
   token is 14px (`tokens.css:68-73`) and the smallest line height is `--cth-lh-body-sm: 18px`
   (`:80`). Every size in this contract is a token reference, never a numeric literal.

---

## Color

Existing, unchanged. Light values `tokens.css:3-39`; the dark mirror re-declares the same names from
`tokens.css:129`.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--cth-cream-100` #FFF8E7 · `--cth-paper-200` #F0EAD2 | app ground, panel fills, tab-body scroll surfaces |
| Secondary (30%) | `--cth-paper-100` #FCFAF0 · `--cth-cream-200` #F4E9C7 | cards, inputs, chips, section headers, the band's plate |
| Accent (10%) | the six agent hues — `--cth-coral` · `--cth-mint` · `--cth-sky` · `--cth-lemon` · `--cth-lilac` · `--cth-peach` | see reserved-for list |
| Destructive | `--cth-coral` #D96A62 (= `--cth-status-blocked`) | destructive actions and blocked/stopped state **only** |

**Accent reserved for** (Phase 1's and Phase 2's list, plus this phase's two additions, marked):

- per-agent identity: card selection frame, portrait background, `BOSS` tag fill, `ContextBar` fill
- `--cth-lilac-light` + `--cth-lilac` hairline: the FLOOR-01 `AUTO` chip *(Phase 1)*
- `--cth-lemon` solid + `--cth-on-accent` text: the titlebar tunnel chip *(Phase 2)*
- `--cth-coral` text/hairline: the MCP consent-tier heading and granted-server row *(Phase 2)*
- **`--cth-sky` fill: the day band's ENVELOPE track** *(Phase 3 — §S1b)*
- **`--cth-lemon` fill: the day band's COST track, and the context-pressure mid step in §S2** *(Phase 3)*

Nothing else. **The day band's EVENT track takes no accent** — it is `--cth-ink-700`.

### The two additions, justified against the standing rules

**1. Neither collides with a status token, because no status token renders in this region.**
Phase 1's coral-vs-lilac ruling and Phase 2's lemon-in-the-titlebar ruling both turned on one
question: does a `PixelBadge` render in the same visual region? The day band is a new tab body. It
contains **no `PixelBadge`, no `SpritePortrait`, and no per-agent accent** — agent identity does not
appear on the band at all, only in the detail list as plain text. `DESIGN.md:707`'s "color + icon +
position — never color alone" is satisfied by **position**: the three tracks are stacked at fixed
vertical offsets and each carries a text legend beneath the band.

**2. Both hues already mean this in shipped code.** Verified this session:

| Hue | Existing meaning | Anchor |
|-----|------------------|--------|
| `--cth-sky` | data volume / message-and-cache readout | `ToolWaterfall.tsx:33` — the cache-fraction figure in the cost header band |
| `--cth-lemon` | spend and pressure, the caution step below coral | `CommandCenterPanel.tsx:747` — the budget meter's `pct >= 60` step; `:1559` — the token-cap-is-set fill |

No new hue is introduced. No token is added, changed or removed.

### The "no record" fill takes no accent and no status colour

The band's gap treatment (§S1e) is `--cth-ink-100` — the token whose own comment in the dark ramp
reads *"dividers, meant to recede"* (`tokens.css:142`). **This is deliberate and is the opposite of
Phase 2's ruling for gap chips.** A capability gap on an agent card is a fact the operator must be
able to *find*, so Phase 2 upgraded its hairline to the ≥3:1 `--cth-ink-300`. A band gap is a region
that must read as **absent**, not as data — colouring it would make missing hours look like quiet
hours, which is precisely what D-27 forbids. The *shout* is carried by the DOM sentence under the
band (§S1e), which is 14px `--cth-ink-700` body text, not by hue.

---

## Copywriting Contract

Governed by `DESIGN.md:629-657` (§14): use the agent's name, never "the agent"; system feedback
under 12 words; **no emoji**; exclamation marks only on completions and notifications; proper
punctuation.

**House empty-state shape, measured across the tree this session and followed verbatim below:**
`No {thing} yet` + an em-dash clause naming *what makes it appear*. Live examples:
`ThreadsPanel.tsx:87`, `ToolWaterfall.tsx:40` and `:48`, `SkillsTab.tsx:234`,
`ClaudeAccountsSettings.tsx:152`, `IntegrationsRegistry.tsx:364`.

### Primary CTAs

| Surface | Label | Why |
|---------|-------|-----|
| Team review sheet — confirm | `hire {n}` (n = checked rows) | names the count, so the operator confirms a number rather than a verb. Matches `AddAgentModal.tsx:1106`'s `spawn` register |
| Team review sheet — while running | `hiring {done}/{n}…` | mirrors `{busy ? 'spawning...' : 'spawn'}` (`AddAgentModal.tsx:1107`) with the progress the bulk loop can actually report |
| Team review sheet — cancel | `cancel` | existing `Modal` convention (`AddAgentModal.tsx:1105`) |
| AddAgentModal footer — import | `import…` **(label change)** | today reads `import hire…` (`AddAgentModal.tsx:1102`). D-17 routes team files through the **same** `hire:openFile` channel, so a label naming only "hire" would be a lie about what the button accepts. `title="Import a hire or a team file (.json)"` |
| AddAgentModal footer — export | `export team…` | new sibling. The ellipsis marks "opens a file dialog", matching the import button's convention |
| Day band — day picker | *(not a button)* | a native `<input type="date">`, `aria-label="Day to replay"` |
| Day band — scrubber | *(not a button)* | a native `<input type="range">`. **Arrow keys are the step control** (D-25). No play, pause or step glyph button exists on this surface |
| Consolidated agent card | *(not a control)* | five read-only fields. The account `<select>` already in the header row (`AgentDetailPanel.tsx:146`) stays the only account control |

### Empty states

| Surface | Copy |
|---------|------|
| Day band — day is entirely before the record begins | `Nothing was recorded on {date}. The stored record starts {firstDate}.` |
| Day band — day is inside the record and genuinely had no rows | `{date} was quiet. The floor recorded nothing that day.` |
| Day band — selected bucket has no rows | `Nothing in this fifteen minutes.` |
| Day band — no `events` rows at all yet (fresh install / pre-migration) | `No timeline yet — the record starts the first time the floor logs an event.` |
| Team review sheet — file parsed, zero members | `That team file has no members.` |
| Consolidated card — engine reports no cost | `no cost meter` *(see §S2b — never `$0.00`)* |
| Consolidated card — no `spawnedAt` on the registry row | `not recorded` *(never `0s`)* |
| Consolidated card — engine reports no context | `not reported` *(never `0%`)* |
| Consolidated card — breaker snapshot has not resolved | `unknown` *(never `healthy`)* |

**The two day-empty branches are load-bearing and must not be collapsed into one string.** "Quiet"
is a claim about the floor. "Not recorded" is a claim about the store. Saying the first when the
second is true is the exact failure D-27 exists to prevent, and it is indistinguishable to the
operator.

### Error states — problem, then what to do next

| Surface | Copy |
|---------|------|
| Timeline query failed | `Could not read the timeline: {reason}. Pick the day again to retry.` |
| Team file rejected by the validator | `That file is not a team: {reason}. Export one from this floor to see the shape.` |
| Team file too large | `That team file is too large. The limit is {n} KB — export writes far less than that.` |
| One member fails to spawn during a bulk hire | `{name} did not start: {reason}. The rest of the team is hired — you can add {name} on their own.` |
| Export failed | `Could not write the team file: {reason}. Pick another folder and try again.` |
| Breaker snapshot unavailable | *(no error copy — the field reads `unknown`; a failed snapshot is a state, not an error the operator can act on)* |

The bulk-hire error copy is **per member and non-fatal by contract**. `useRestoreTeam.ts:92-205`
records that one rejected IPC call once silently aborted every subsequent agent (D-18); the review
sheet must report the failed member and keep the rest, never surface a single sheet-level error that
hides which member failed.

### Destructive actions

| Action | Confirmation | Confirm label | Cancel label |
|--------|--------------|---------------|--------------|
| **Bulk hire from a team file** | **None.** Hiring is additive and reversible by archiving an agent. The review sheet **is** the confirmation — it lists every member, every checkbox is inspectable, and the button names the count | `hire {n}` | `cancel` |
| **Export the team** | **None.** Export is a read of the roster plus a file write to an operator-chosen path. It is not destructive | `export team…` | *(the OS file dialog's own cancel)* |

**This phase has no destructive action.** That is a finding, not an omission: nothing in SCALE-02,
SCALE-03 or SCALE-05 deletes, revokes or overwrites operator state. The one thing that looks
destructive — export dropping seven fields (D-16) — is a *lossy read*, and its honesty obligation is
a **declaration in the sheet and in the file**, specified in §S3b, not a confirmation dialog.

---

## Accessibility Rules — carried forward, binding here

Each was paid for by a real defect in this repo. Re-verified against source this session.

**A1 — every `<button>` has an accessible name.** Visible text content *is* the name; do **not** add
`aria-label` to a button that already has text. `test/repo-claims.test.cjs:930` asserts this per
element, never as a ratio, and accepts `aria-label`, `aria-labelledby` or `title` on the control or
on a non-hidden descendant (`:957-961`).

*(The orchestrator's brief cited this test at `:985`. **Corrected:** the icon-only accessible-name
test starts at `test/repo-claims.test.cjs:930`; `:988` is the `PixelButton` `{children}` pin and
`:1005` is the `<div role="button">` test. The rule is unchanged; the anchor was stale.)*

**A2 — `Icon` is unconditionally hidden, so an icon can never supply a name.** Verified:
`Icon.tsx:147` applies a bare `aria-hidden` to the `<svg>` with no prop to switch it off. **This is
why D-25 chose arrow keys on a native range over play/pause/step glyph buttons.** No control on any
surface in this phase is icon-only. The `day` tab button carries `<Icon>` **and** the text `day`
(§S1a), exactly like the eleven tabs beside it.

**A3 — `aria-label` on a non-interactive element needs `role` too.** Chromium does not expose
`aria-label` on `role=generic`. The band SVG therefore carries **`role="img"` + `aria-label`**
together — the shipped pattern at `QrCode.tsx:55-56`, which is this repo's only existing
"data matrix as one accessible SVG" and the direct precedent for §S1b.

**A4 — the focus ring is already correct and must not be touched.** `global.css:93-95`:
`outline: 2px solid var(--cth-ink-900); outline-offset: 2px`. It applies to the range input, the
date input and the review-sheet checkboxes for free. This phase adds no focus styling.

**A5 — the scrubber's value is announced through `aria-valuetext`, not through a label.**
`<input type="range">` has an implicit `role="slider"`; `aria-valuetext` overrides the raw numeric
announcement with the bucket's real meaning. Contract in §S1c. This is also **the whole reason
D-25 chose a native range**: `min`, `max`, `step`, `aria-label` and `aria-valuetext` are all plain
attributes present in first-pass static markup, which `test/renderer-components.test.cjs:24-40`
(`renderToStaticMarkup`, no effects, no events) can assert. A hand-rolled drag playhead has no
first-paint state to assert at all.

**A6 — the detail list is an `<ol>` of `<li>`.** It is a genuine time-ordered sequence, and a list
role lets a screen-reader user hear its length before walking it — which is how the truncation
declaration in §S1e becomes discoverable rather than decorative.

**A7 — the review sheet is a real form.** Each member row is a `<label>` wrapping an
`<input type="checkbox">`, so the member's name is the checkbox's accessible name with no
`aria-label` needed. The sheet is a `Modal` (`Modal.tsx:65`), which already owns `role="dialog"`,
`aria-modal`, the focus trap, focus restore and Escape-closes-the-top-dialog-only.

---

## Containment Protocol — how the plan proves it did not break the layout

Phase 1's three worst regressions (`01-14`'s card rendering its name at **zero width**, `01-17`'s
TriggerCard caret, `01-18`'s IDE git rail spilling 85px) were invisible to every grep in their
plans. Two of this phase's three surfaces add content to constrained containers. **Binding method,
carried verbatim from `02-UI-SPEC.md:497-528`:**

1. Build the **base sha** and the **head sha** and run the *identical* CDP probe against both. A
   head-only measurement cannot distinguish "this phase caused it" from "it was already broken".
2. Probe at **1280, 1024 and 800** logical widths using `Emulation.setDeviceMetricsOverride` —
   `page.setViewportSize`, `win.setBounds` and `win.setContentSize` all leave `window.innerWidth`
   pinned at 1280 in Electron (`01-15`).
3. The probe prints the **true `window.innerWidth`** beside the requested one and reports a positive
   control (element found + mounted). A clean scan of an unmounted component is worth nothing.
4. Any container integer that changes, changes by the **measured delta**, in its own atomic commit,
   with the measurement in the commit message. Never by arithmetic on font metrics.

**Surfaces that must be in the probe set:** the `CommandCenterPanel` tab strip **docked and
fullscreen**, the `day` tab body at its narrowest, `AgentDetailPanel` with the consolidated card
mounted, and the team review sheet at 3, 8 and 16 members.

### The 12th tab — what is measured, and what is not

**Measured, in source, this session.** `CommandCenterPanel.tsx:266-278` is the tab strip.
`flexWrap: fullscreen ? 'nowrap' : 'wrap'` and `overflowX: fullscreen ? 'auto' : 'visible'`
(`:274-275`) — so the docked rail **already wraps** and fullscreen **already scrolls** with the
scrollbar hidden by `.cth-tabbar` (`global.css:72-73`). Each tab is `flex: '1 0 auto'` with
`padding: '4px 8px 3px'` at `--cth-text-body-md` / `--cth-lh-body-md` (`:288`, `:292`, `:300`), so
one wrapped row costs **27px + a 4px gap = 31px**.

`TABS` currently holds **11** entries (`CommandCenterPanel.tsx:79-90`). The comment block above the
strip records a **live measurement of a twelve-tab set**: *"the tabs need ~1320px of content and had
~1610px"* (`:251-255`), taken when a now-removed `setup` tab was present. Returning to twelve with a
**three-character** label is strictly cheaper than that measured state, so the fullscreen case has
recorded headroom.

**Unmeasured. `MEASUREMENT UNAVAILABLE — the docked strip's rendered row count at a 420px rail with
12 tabs, at 1280 / 1024 / 800.** Requires the live CDP probe above; it cannot be derived from source
and must not be estimated. The `~420px` rail figure itself is a source claim
(`SidebarTabs.tsx:53-66`, which records four 14px display-face labels needing 518px in that rail) and
governs a *different* component — `SidebarTabs`, not the Command Center strip.

**Acceptance, stated as a delta so it is checkable:**

- the strip's rendered height at head is **at most one 31px row taller** than at base, at all three
  widths, docked; and
- **no tab label is clipped** — `scrollWidth === clientWidth` on every tab `<button>`; and
- fullscreen stays **one row** at 1280.

If the 12th tab adds more than one row, or clips a label: **stop and report.** Do not shorten another
tab's label to make room, and do not shrink the tab font — `flex: '1 0 auto'` exists precisely so a
tab never shrinks below its label (`:287-290`), and the font floor is not negotiable.

### The agent card does not grow

`AgentCard.tsx:193` is `const width = 322` and `:198` is `const height = 86`, both pixel-measured,
with a STOP-AND-REPORT clause at `:112-125` and a recorded failure at `:186-192` where one
unshrinkable sibling drove the agent **name to zero width**. The 86px propagates to `AgentStrip`'s
`height: 120` (`AgentStrip.tsx:270`), which is space taken from the Pixi office scene.

**This phase changes neither integer.** SCALE-05's consolidated card is a *different* component in a
*different* container (`AgentDetailPanel.tsx`, D-34). `AgentCard`'s only change in this phase is that
it **reads `agentView.ts` instead of re-deriving** its 0..8 gauge locally (`AgentCard.tsx:164-167`) —
a derivation swap with no markup change and therefore no geometry change. If an executor concludes
otherwise, that is a stop-and-report.

---

## Per-Surface Contracts

### S1 — the day band (SCALE-03; D-25, D-26, D-27, D-28)

Two tiers over a wall-clock 24h axis, one native scrubber, one merged detail list. **Pixi.js is
REFUSED for this surface** (D-28) on a measured bug: `glRecovery.ts:9-18` records Chromium's ~16
WebGL context cap with the oldest evicted first, the office floor's context created at startup and
therefore always first out, and Pixi reporting nothing when it happens. `OfficeFloor.tsx:238` is
deliberately the only `new Application()` in the renderer, and every xterm already takes a context.
**No plan in this phase may construct a second Pixi `Application`, and no `<canvas>` is added.**

#### S1a — the tab

| Property | Value |
|----------|-------|
| `CCTab` key | `'timeline'` |
| Position in `TABS` | **last**, after `'workers'` (`CommandCenterPanel.tsx:89`) — the canonical order is append-only, and appending is the only change that cannot reorder a tab the operator has muscle memory for |
| Label | **`day`** |
| Icon | **`clock`** |
| Gating | **none.** Unlike `'trigger-history'` (`:110`), the day band needs no config to have something to say |

**Why `day` and not `timeline`.** Three characters against eight, in the one container this phase is
measurably at risk of overflowing, and the existing labels are terse lowercase nouns (`monitor`,
`tasks`, `history`, `graph`) rather than feature names. `day` beside a clock icon reads correctly and
is the cheapest honest label available.

**Icon reuse is the established pattern in this exact array, not a compromise.** Verified at
`CommandCenterPanel.tsx:79-90`: `bell` already serves both `'human'` and `'activity'`, and `sparkle`
serves both `'memory'` and `'skills'`. Reusing `clock` (also on `'triggers'`) adds **no** new 16×16
path to `Icon.tsx` and matches what ships. The text label carries the distinction, which is what
`DESIGN.md:707` asks for.

#### S1b — the band

One `<svg>`. **No `<canvas>`, no Pixi, no `<text>`.**

| Property | Value |
|----------|-------|
| Element | `<svg role="img" aria-label={…} viewBox="0 0 96 26" preserveAspectRatio="none" shapeRendering="crispEdges">` |
| Rendered size | `width: '100%'`, `height: 104` |
| Precedent | `QrCode.tsx:50-67` — a matrix as one accessible SVG of `<rect>`s, `role="img"` + `aria-label`, no upstream SVG helper. `shapeRendering="crispEdges"` copies `Icon.tsx:144` |
| Plate | one `<rect>` at `var(--cth-cream-200)` filling the viewBox |
| Tracks | three, stacked, **8 viewBox units tall each with a 1-unit gap** → 8·3 + 2 = 26 units. At `height: 104` that is 32px per track and 4px per gap — every one a multiple of 4 |
| Columns | **96**, one viewBox unit wide each, one per 15-minute bucket |

**`preserveAspectRatio="none"` is deliberate.** x is time and y is magnitude; they are unrelated
quantities and must not be locked to one ratio. `shapeRendering="crispEdges"` is what keeps rect
edges on the device pixel grid under that scaling, which is what `DESIGN.md:9` ("no half-pixels")
actually requires — it is the same mechanism `Icon.tsx` uses to scale a 16-unit viewBox to any size.

**Track order, colour and source:**

| # | Track | Fill | Source | Note |
|---|-------|------|--------|------|
| 1 | events | `--cth-ink-700` | `events` table, all `kind`s | the ground-truth track; takes no accent |
| 2 | envelopes | `--cth-sky` | **the same `events` rows filtered to `kind='message'`** | **D-26: a FILTER, not a second source.** `hive.ts:1641` writes envelopes into the same funnel |
| 3 | cost | `--cth-lemon` | `cost-ledger.jsonl` | **D-22: the clamped consecutive diff per `(agent_id, session_id)` via `applyCostRow` (`hive.ts:2611`) — never a SUM** |

**Density encoding: quantised bar height, never opacity.** Each bucket draws a `<rect>` whose height
is an **integer 1..8 viewBox units**, `Math.ceil(8 * value / trackMax)`, anchored to the track's
bottom edge. Zero draws nothing. Rationale: `DESIGN.md:71` bans gradients on every surface but the
title bar, and an opacity ramp is a gradient by another name; integer bar heights are the pixel-art
correct encoding and they reuse the 0..8 quantisation the agent card's own context gauge already uses
(`AgentCard.tsx:164`).

**The selected bucket** draws a full-height 1-unit `<rect>` outline in `--cth-ink-900` spanning all
three tracks. This is load-bearing: the 24px thumb (§S1c) covers roughly six buckets on a ~400px
track, so the thumb alone cannot show which bucket is selected.

**The band's `aria-label`** is the day's summary, built as one string so it is assertable in static
markup:

> `Activity for {date}: {n} events, {m} envelopes, ${cost} across 96 fifteen-minute buckets.`

…with the gap sentence from §S1e **appended verbatim** when a gap exists. A screen-reader user gets
the same declaration a sighted user gets, from the same string.

**Axis labels** are DOM, not SVG: one row directly beneath the band, `--cth-text-body-sm` /
`--cth-lh-body-sm`, `--cth-ink-500`, reading `00 · 06 · 12 · 18 · 24`, `justify-content:
space-between`. **Track legend** is a second DOM row: three `--cth-text-body-sm` items, each a 8×8
`--cth-space-2` swatch in the track's fill followed by `events` / `envelopes` / `cost`.

#### S1c — the scrubber

One `<input type="range">`. Verified this session: **zero** occurrences of `type="range"` anywhere in
`src/renderer/src` today — this is new markup, not a new dependency.

| Attribute | Value |
|-----------|-------|
| `type` | `range` |
| `min` | `0` |
| `max` | `95` |
| `step` | `1` |
| `value` | the selected bucket index |
| `aria-label` | `Time of day` |
| `aria-valuetext` | `{HH:mm}–{HH:mm} · {n} events · {m} envelopes · ${cost}` |
| `className` | `cth-scrub` |

Every one of those is a plain attribute in first-pass static markup, which is the whole point (D-25,
A5). **`aria-valuetext` is what makes the slider honest**: without it a screen reader announces
"47", which means nothing.

**Arrow keys are the step control.** Left/Right step one bucket, Home/End jump to the first/last —
all native, all free, and none of it requires a glyph button that `Icon.tsx:147` would strip the name
from.

**Styling — the one CSS addition this phase makes to `global.css`:**

```css
/* Day-band scrubber (SCALE-03). Chromium-only by construction: this is an
   Electron renderer, so the -webkit- pseudo-elements are the complete set —
   a -moz- twin here would be dead code. */
.cth-scrub { -webkit-appearance: none; appearance: none; width: 100%; height: 24px; background: transparent; }
.cth-scrub::-webkit-slider-runnable-track { height: 4px; border: 0; background: var(--cth-ink-300); }
.cth-scrub::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 24px; height: 24px;          /* WCAG 2.2 SC 2.5.8 minimum target */
  margin-top: -10px;                  /* centres a 24px thumb on a 4px track */
  border: 0; border-radius: 0;        /* DESIGN.md §6: no border-radius */
  background: var(--cth-ink-900);
  box-shadow: inset 0 0 0 1px var(--cth-cream-100);
}
.cth-scrub:disabled::-webkit-slider-thumb { background: var(--cth-ink-300); }
```

`--cth-ink-300` is the ≥3:1 borders token (`tokens.css:141`), so the track is perceivable in both
themes. The focus ring comes free from `global.css:93-95` (A4). Nothing animates, so
`prefers-reduced-motion` (`global.css:151-153`) has nothing to disable here.

#### S1d — the day picker

One `<input type="date">`, above the band, `aria-label="Day to replay"`.

- `max` = today, local. `value` defaults to **today** — a live floor filling in is the common case,
  and yesterday is one Down-arrow away.
- **No `min`.** Picking a day before the record begins must show the honest empty state (§S1e)
  rather than being silently unreachable. A disabled range hides *when* the record starts; the copy
  states it.
- Segment stepping is native (Up/Down on the focused segment), so **no prev/next glyph buttons**.
- The UA calendar-picker affordance lives in shadow DOM and is not a source `<button>`, so it is
  outside `repo-claims.test.cjs:930`'s scan and needs no name from us. `:root { color-scheme }`
  (`global.css:8`, `:15`) already makes the native picker follow the theme.

Rung 4 of the ladder: a native date input, zero dependencies, assertable in static markup.

#### S1e — the declarations (D-27, and this is the requirement, not the polish)

The band renders **one** "no record" treatment, used for two causes, each named in DOM text beneath
the band. The fill is `--cth-ink-100` across all three tracks for the affected columns.

| Cause | Band | DOM sentence beneath the band |
|-------|------|-------------------------------|
| Buckets before the first timestamp the store actually has | ink-100 fill | `No record before {HH:mm} — missing, not quiet.` |
| Buckets after the current time, on today only | ink-100 fill | `The rest of today has not happened yet.` |

The first sentence's `title` carries the full explanation, following the house terse-visible /
full-`title` pattern used by `ContextBar` (`FullscreenTerminal.tsx:537`) and the account chip:

> `The stored record for {date} starts at {HH:mm}. Hours before that were never written or have since been rotated out — the floor cannot tell you which.`

**That last clause is load-bearing.** The band genuinely cannot distinguish "never written" from
"rotated out", and D-21 measured that the 8 MB rotation **has never fired** while the real truncation
is a 64 KB *read* cap (`hive.ts:326`, `LOG_TAIL_BYTES`, consumed by `logTail()` at `:2443`). Claiming
either cause would be a fabrication.

**Bucket truncation.** A bucket returns `truncated: true` plus the real total. The detail list then
renders, as its **last** `<li>`:

> `Showing {shown} of {total} rows in this bucket.`

**It never silently slices.** Two shipped precedents for the sin being corrected, both verified this
session: `ToolWaterfall.tsx:16` — `const recent = spans.slice(-60); // keep the view legible`, with
no count shown; and `CommandCenterPanel.tsx:1608` — `hiveLog(60)`, whose empty state is a bare
`Nothing yet.` (`:1630`) with no indication that a cap exists at all.

#### S1f — the detail list

One merged list of the **selected bucket's** rows — the whole day's rows are never in the renderer at
once. `<ol>` of `<li>`, three columns per row, all mono at token sizes:

| Column | Token | Colour | Content |
|--------|-------|--------|---------|
| time | `--cth-text-mono-sm` | `--cth-ink-500` | `HH:mm:ss` |
| kind | `--cth-text-mono-sm` | `--cth-ink-300` | `spawn` · `message` · `drain` · `escalate` · `approval` · `cost` |
| text | `--cth-text-body-md` | `--cth-ink-700` | see below |

The kind and text colours are `ActivityTab`'s existing two-column treatment verbatim
(`CommandCenterPanel.tsx:1632-1634`), and the text strings reuse `ActivityTab`'s `fmt` vocabulary
verbatim (`:1616-1625`) so a second event vocabulary cannot drift away from the first:

- `spawn` → `spawned {name}`
- `message` → `{from} → {to}: {subject}`
- `drain` → `{agentId} drained {n} msg(s)`
- `escalate` → `escalated to human: {subject}`
- `approval` → `approval granted` / `approval denied`
- `cost` → `{name} +$0.0123` — **the clamped diff (D-22), never the cumulative snapshot.** A
  zero-delta cost row is **not emitted**: there is nothing to report, and a `+$0.0000` row would
  imply a beat happened that cost nothing rather than a beat that moved no counter.

**Declared limitation, in the UI and not only in a comment.** An envelope row shows the **subject
only**, because the subject is all that was ever recorded — verified at `hive.ts:1641`:
`this.appendLog({ kind: 'message', from, to, act, subject, id })`, with **no body field**. The list
therefore offers **no** "open message" or "read body" affordance, and the day tab's section header
carries the standing note:

> `Envelopes show their subject. The body was never recorded.`

Row cap and bucket size are **constants with a comment saying they are reasoned, not measured** —
required by CONTEXT's discretion clause:

```ts
/** 15 minutes → 96 buckets a day. A REASONED default, explicitly not a measured
 *  one: it is the coarsest bucket that still separates two adjacent tool calls
 *  in a busy hour, and 96 columns is a fixed, tiny DOM. Re-derive it from a real
 *  day's row distribution before treating it as tuned. */
const BUCKET_MINUTES = 15;

/** Detail rows returned for ONE bucket. A REASONED default, not measured: it
 *  matches the existing bound on the same data path (preload/index.ts:787's
 *  `hiveLog` defaults to 200). Exceeding it sets `truncated: true` and the UI
 *  prints the real total — it is never a silent slice (D-27). */
const BUCKET_DETAIL_ROW_CAP = 200;
```

**No windowing, and none is possible.** Re-confirmed this session:
`react-window|virtuoso|tanstack|IntersectionObserver` returns **zero** hits across `src/` and
`package.json`. D-37 freezes the lockfile, so "virtualise it" is a request to hand-roll windowing.
Neither list here is ever long enough to need it: the band is a fixed 96 columns × 3 tracks and the
detail list is one bucket deep, capped at 200.

---

### S2 — the consolidated agent card (SCALE-05; D-33, D-34, D-35)

#### S2a — location and layout

**Lands in `AgentDetailPanel.tsx`** (D-34), which today shows none of the five fields.

Insertion point, in render order: the existing header row (portrait, name, `PixelBadge`, project,
account `<select>`, IDE / open / MCP / kill) → the existing `openTerminalError` strip
(`AgentDetailPanel.tsx:206-214`) → **the stat card** → the existing `BlockedBanner`
(`:222-234`) → `SidebarTabs`. The error strip stays adjacent to the button that raises it, and the
banner stays adjacent to the tabs — `:216-221` records that the banner sits above the tabs on purpose
because "a prompt waiting on a human outranks whichever tab happens to be open".

| Property | Value |
|----------|-------|
| Container | `display: grid; gridTemplateColumns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--cth-space-2); padding: var(--cth-space-3)` |
| Surface | `var(--cth-paper-100)` with `box-shadow: var(--cth-panel-border-inset)` (`tokens.css:97`) |
| Cell | label over value, two lines |
| Label | `--cth-text-body-sm` / `--cth-lh-body-sm`, `--cth-ink-500`, lowercase |
| Value | `--cth-text-mono-md` / `--cth-lh-mono`, `--cth-ink-900` unless a field's own rule says otherwise |

**`auto-fit` + `minmax` is chosen specifically to make this measurement-free.** It reflows to five
across when the panel is wide and to three-then-two in the docked rail, with no fixed width to get
wrong. `120px` is on the 4-grid (4 × 30). A fixed five-column row would be exactly the
"one unshrinkable sibling" shape that drove the agent name to zero width at `AgentCard.tsx:186-192`.

Labels, in order: **`cost` · `up` · `context` · `account` · `state`**. All lowercase, all ≤ 7
characters, matching the terse register already used in the same app (`ctx`, `fresh`, `cache` at
`ToolWaterfall.tsx:31-37` and `CommandCenterPanel.tsx:850`).

**All five values come from ONE derivation, `src/renderer/src/store/agentView.ts`** (D-33) — a pure,
React-free module singleton read through `useSyncExternalStore`, following `autoMode.ts`. The card is
markup over that derivation and computes nothing itself. This is not a style preference: D-33 records
that FLOOR-13 unified the AUTO chip *through a shared module* and unified cost *by copying an
expression into three files*, and only the copied half drifted.

#### S2b — the five fields

| Field | Measured branch | Declared-gap branch |
|-------|-----------------|---------------------|
| **cost** | `{kind:'measured', usd}` → `$1.23`, `--cth-ink-900` | `{kind:'unmeasured', reason}` → **`no cost meter`** in `--cth-ink-500`, `title={reason}` |
| **up** | `spawnedAt` present → `2h 14m` / `4m` / `41s` | absent → **`not recorded`**, `--cth-ink-500` |
| **context** | `contextTokens` and `contextLimit` both present → `{k} / {k} ({pct}%)` + a 4px rail | either absent → **`not reported`**, `--cth-ink-500` |
| **account** | a resolved Claude account → its label | no pool for this engine → **`login`** (`LOGIN_ACCOUNT_LABEL`, `src/shared/claudeAccounts.ts:28`) |
| **state** | breaker snapshot resolved → `healthy` · `steering` · `constrained` · `stopped` | not yet resolved → **`unknown`**, `--cth-ink-500` |

**cost — `$0.00` is forbidden for an unmeasured engine, and the rule needs stating precisely.**
D-35 makes cost a discriminated value. Verified this session in `src/shared/agentProvider.ts`:
`costTracking` tallies **7 `'none'`, 1 `'otel'`, 2 `'proxy'`, 1 `'transcript'`** — so seven of eleven
engines render the gap. The exact contract:

- under `kind:'unmeasured'` the rendered text contains **no `$` character at all**;
- `$0.00` **is** legitimate under `kind:'measured'` — an engine that reports and has spent nothing;
- the `title` reuses the **existing** gap sentence rather than inventing a second wording. Verified at
  `src/renderer/src/store/config.ts:495-499`:
  `` `${engine} reports no cost — ${subject}'s spend is invisible to every budget and to the breaker.` ``
  The chip vocabulary (`NO SPEND`) and its ranking already exist at `config.ts:447-514`; this field is
  a second **rendering** of that one derivation, never a second derivation.

A zero that reads as "cheap" is the faked capability this project's rules forbid, and the same rule
is why `up`, `context` and `state` each get a named gap string instead of a plausible-looking zero.

**state — `unknown` is required and `healthy` is the wrong default.** D-36 measured that `breakers`
is push-only today (preload exposes `onBreakerState` at `preload/index.ts:1117` and `setBreakerState`
at `:1123`, and **no getter**), so a card sourcing block state from the push alone shows "healthy" for
a stopped agent for a full breaker beat after every window reload — failing safe in the wrong
direction. The field therefore reads `unknown` until `control:breakerSnapshot` resolves. The four
level names are rendered verbatim from `BreakerState['level']` (`preload/index.ts:541`), lowercase,
matching `PixelBadge`'s label register.

**state colours:** `healthy` → `--cth-ink-700` (the quiet case takes no colour, per Phase 2's gap-chip
ruling); `steering` and `constrained` → `--cth-lemon`; `stopped` → `--cth-coral`; `unknown` →
`--cth-ink-500`. When armed, `title` carries `BreakerState.reason` (`preload/index.ts:542`).

#### S2c — ONE context threshold pair, locked

Three derivations ship today with three different thresholds. Verified this session:

| Site | Thresholds | Written rationale in source? |
|------|-----------|------------------------------|
| `FullscreenTerminal.tsx:533` | `pct >= 85` coral, `pct >= 65` lemon | **yes** — `:531-532`: *"an agent at 85% is about to compact, and that matters more than its accent"* |
| `CommandCenterPanel.tsx:853` | `cpct >= 88` coral, `cpct >= 75` lemon | no |
| `AgentCard.tsx:165-166` | `progress >= 7` coral, `>= 6` lemon over a 0..8 integer — i.e. **87.5 / 75** | no |

**LOCKED: 85 / 65.** It is the only pair with a written reason in source, and the reason is a real
mechanism (the compaction boundary) rather than a taste. `agentView.ts` owns the pair; all three
sites above read it and none re-derives it. `AgentCard` keeps its 0..8 gauge *geometry* — the integer
bucket is a rendering detail of a 322px card — but derives the **colour step** from the shared
threshold, so the card and the panel can no longer disagree about whether an agent is in trouble.

#### S2d — the god is not covered by this card, and that is stated rather than assumed

`AgentDetailPanel.tsx:69` returns `<CommandCenterPanel>` for `agent.isGod`, so **the god never
renders `AgentDetailPanel`'s body** and therefore never renders this card. `CommandCenterPanel`'s
floor tab already shows the god cost, context and breaker state per roster row (`:370` reads
`samples, spark, rate, lastTool, breakers`); it shows **neither duration nor account**.

**Named residual, for the planner's explicit decision — not a silent omission.** Mounting the same
component above the tab strip closes it in one line but costs roughly 62px of vertical space in the
god's docked rail, which is the most contended column in the app. This contract does **not** decide
it; it requires that the plan decide it out loud and, if it declines, records the gap where the
requirement is ticked.

---

### S3 — the team import review sheet and the export affordance (SCALE-02)

#### S3a — the review sheet

A `Modal` (`Modal.tsx:65`), title **`Import team`**. It inherits `role="dialog"`, `aria-modal`, the
focus trap, focus restore, Escape-closes-top-only and the unsaved guard — all of it already owned by
the primitive (`Modal.tsx:5-24`).

| Region | Contract |
|--------|----------|
| Header line | `{n} agents in this file. Uncheck anyone you do not want.` |
| Member row | a `<label>` wrapping `<input type="checkbox">`, then name, engine, model, description |
| Name | `--cth-text-display-md` / `--cth-lh-display-md`, uppercased — matching the agent name treatment at `AgentDetailPanel.tsx:132-134` |
| Engine · model | `--cth-text-body-sm`, `--cth-ink-500`, one line |
| Description | `--cth-text-body-md`, `--cth-ink-700`, `whiteSpace: nowrap; overflow: hidden; textOverflow: ellipsis` |
| Row gap | `--cth-space-2` |
| Footer | `cancel` (ghost) · spacer · `hire {n}` (primary) |

**Duplicate-name rows default UNCHECKED**, with a `--cth-ink-500` note on the row reading
`name taken`. CONTEXT left this to the planner; this contract closes it, for a mechanical reason
rather than tidiness: agent identity in this app is derived from the display name.
`AddAgentModal.tsx:131-133` is
`` `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}` `` — **two members
with the same name hired in the same millisecond produce the same id.** A bulk hire is exactly a
same-millisecond batch (D-18's loop is `Promise.all`-shaped), so this is reachable, not theoretical.

> **Flagged for the planner, not solvable in the UI:** `uniqueId`'s millisecond suffix is not
> collision-safe under a bulk spawn even for *distinct* names, if two slugs happen to match. The
> review sheet's unchecked default reduces the exposure; it does not remove it. **STOP-AND-REPORT if
> the bulk path reuses `uniqueId` unchanged.**

**No confirmation dialog.** The sheet is the confirmation (§Copywriting). Checking a `name taken` row
back on is allowed — the operator may genuinely want two Jims — and nothing further is asked.

**Failure is per member.** A member that fails to spawn renders its row in place with the error copy
from §Copywriting and the rest of the hire proceeds. `useRestoreTeam.ts:92-205` records three defects
already paid for in that loop — serial cost ~6× for six agents, completion-order overwriting the
persisted roster order, and one rejected IPC call silently aborting every subsequent agent — which is
why D-18 requires the loop be **extracted and shared, never re-implemented**.

**The sheet is reached through the existing import button**, because D-17 routes both formats through
the one `hire:openFile` channel and branches on the parsed `spec`. A `hire@1` file continues to fill
the Add Agent form directly (`AddAgentModal.tsx:308-326`); a `team@1` file opens this sheet.

#### S3b — the export affordance

**Location: the `AddAgentModal` footer, beside the import button** (`AddAgentModal.tsx:1100-1109`).
Label `export team…`, `variant="secondary"`, `size="md"`, sitting immediately left of the existing
import button so the two file actions read as a pair.

RESEARCH open question 3 recommended Settings, "given the file-system/whole-roster scope". **That
alternative loses on discoverability, against this repo's own recorded failure.**
`OnboardingWizard.tsx:75-76` still advertises *"Grab a pre-configured agent from the Agent Gallery
and spawn it in one click"* for a gallery that exists nowhere — this project's documented failure mode
is a hiring affordance that lives where nobody looks. Burying export three sections deep in
`SettingsModal` beside `resetAll` repeats that shape. Pairing it with import means an operator who
imports a team learns, in the same glance, that they can produce one — and D-15 makes export the only
producer that cannot drift.

**The lossiness is declared in the UI, not only in the file** (D-16). Directly beneath the two
buttons, `--cth-text-body-sm` / `--cth-ink-500`:

> `A team file carries names, engines, models and goals. Folders, accounts and command flags stay on this machine.`

That sentence is the operator-facing half of D-16's contract; the file's own doc comment and the
comment **at the stripper** are the other half. The stripper must never attempt to recover
`commandFlags` by diffing a live command against `buildSpawnCommand` — that diff is exactly how a
binary path smuggles itself back into a format whose purpose is to stay binary-free.

**No confirmation.** Export reads the roster and writes a file the operator names. Nothing is lost or
changed on this machine.

---

### S4 — SCALE-04's single UI obligation

Not a surface. D-32 measured that `shouldQuitOnLastWindowClose` is
`platform !== 'darwin' && !headless` (`src/main/floor/headless.ts:64`), so on this operator's Windows
machine **closing the window kills the process** and no timer survives. The only path that produces a
surviving process is `app.setLoginItemSettings({ openAtLogin, args: ['--headless'] })`.

**Contract:** the digest toggle in Settings carries, immediately beneath it, at
`--cth-text-body-sm` / `--cth-ink-500`:

> `Requires Start at login. Closing the window on Windows ends the process, and a closed process sends nothing.`

**This must be in the UI beside the toggle** — not in `README.md`, not in a tooltip. A toggle that
silently does nothing on the operator's own platform is the "built, tested, rendered nowhere" failure
D-38 names, wearing a checkbox.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| — | none | **not applicable** — no component registry is used by this project |

No shadcn, no third-party registry, **no vendored source file**, and **no npm dependency of any
kind**. `package.json` and `package-lock.json` are frozen for the whole phase (D-37: the lockfile
requires npm 10, this machine runs npm 11.6.2, and that mismatch has already caused one fully-red CI
round). Verified this session: no `components.json`, no `tailwind.config.*`, no `postcss.config.*`.

Every primitive this contract uses is already installed or already written:

| Need | Solved by | Rung |
|------|-----------|------|
| bucket scrubber | native `<input type="range">` | native platform |
| day selection | native `<input type="date">` | native platform |
| density band | one `<svg>` of `<rect>`s, `QrCode.tsx:50-67`'s shape | already in this codebase |
| dialog, focus trap, Escape | `Modal.tsx:65` | already in this codebase |
| buttons, badges, panels, icons | `PixelButton`, `PixelBadge`, `PixelPanel`, `Icon` | already in this codebase |
| shared derivation with many renderings | `useSyncExternalStore` + the `autoMode.ts` pattern | React 18 builtin |
| list windowing | **not needed** — 96 fixed columns, one bucket deep, capped at 200 | n/a |

Cost check against the $0 rule: every item is $0.

---

## Corrections to upstream documents

Facts a downstream agent would otherwise inherit and act on. Each was re-derived against source this
session.

| Document claim | Measured reality |
|---|---|
| Orchestrator brief — the accessible-name test is at `repo-claims.test.cjs:985` | It starts at **`:930`**. `:988` is the `PixelButton` `{children}` pin; `:1005` is the `<div role="button">` test. The rule is unchanged |
| Orchestrator brief — the 14px allowlist is `repo-claims.test.cjs:684-729` | `:684` is the **M1 regex**; the allowlist array is **`:712-729`**, and holds exactly **16** entries |
| Orchestrator brief — `SidebarTabs.tsx:53-66` describes the CommandCenterPanel rail | Those lines are real and correct, but they govern **`SidebarTabs`**, a different component. The Command Center strip is `CommandCenterPanel.tsx:266-278` and already wraps when docked |
| `02-UI-SPEC.md:255` — the lemon breaker meter is at `CommandCenterPanel.tsx:712` | The breaker meter's lemon step is at **`:747`**. `:712` is now the mail-gap notice. Anchor rot; the fact is unchanged |
| `03-CONTEXT.md` D-15 — export reads the same records `slimAgents` writes | Refined by `03-VALIDATION.md`: `slimAgents` (`store.ts:444`) drops only 6 ephemeral UI fields, **not** D-16's seven security/portability fields. Export needs its own stripper. Recorded here because the UI sentence in §S3b promises the seven |

`03-CONTEXT.md`'s own anchors were spot-checked and **hold**: `LOG_ROTATE_BYTES` at `hive.ts:323`,
`LOG_TAIL_BYTES` at `:326`, `SPAN_RING_CAP` at `telemetry.ts:161`, `Icon.tsx:147`,
`AgentCard.tsx:193`, `ToolWaterfall.tsx:16`, `hive.ts:1641`, `preload/index.ts:787`.

---

## Known Drift — NOT corrected by this phase

| Where | What | Ruling |
|-------|------|--------|
| `CommandCenterPanel.tsx:261-265` | the comment's "Trade-off, deliberate: in the NARROW docked panel the far-right tabs now scroll out of view instead of wrapping" **contradicts the code 9 lines below it** — `:274-275` wraps when docked and scrolls only in fullscreen | Not corrected. Flagged so the executor trusts `:274-275` and the inner comment at `:268-273`, not the outer block. A plan touching this strip **may** delete the stale paragraph in the same commit; it must not act on it |
| `DESIGN.md:118-121` (§4) | names `Pixelify Sans` and `VT323` as the UI and mono faces; `tokens.css:55-57` ships **Inter** and **JetBrains Mono** | Not corrected — a v0.3.4 recalibration the token layer already records in its own comment (`tokens.css:52-54`). `tokens.css` is authoritative |
| `DESIGN.md:64-79` (§3.3) | the accent hexes (`#FF6B6B`, `#FFD93D`, …) are the pre-v0.3.4 arcade tones; `tokens.css:22-27` ships the desaturated set | Same ruling. Every value in this contract is a **token reference**, never a hex |
| `DESIGN.md:136` | *"All fonts ship in a single weight. Never bold"* against the tree's `fontWeight` declarations | Recorded in `01-UI-SPEC.md`; unchanged |
| `CommandCenterPanel.tsx:1608`, `:1630` | `ActivityTab` requests 60 rows and its empty state is a bare `Nothing yet.` — a silent cap with no declaration | Not corrected. It is the *precedent for the sin* §S1e forbids on the new surface; rewriting a working tab is not one of this phase's requirements |
| `ToolWaterfall.tsx:16` | `spans.slice(-60)` with no count shown | Same ruling |
| `OnboardingWizard.tsx:75-76` | advertises an "Agent Gallery" that exists nowhere | Not corrected here. **Becomes partially true when SCALE-02 lands**; the plan should re-read it afterwards rather than edit it now |

---

## What This Contract Deliberately Does NOT Specify

| Not specified | Why |
|---------------|-----|
| Whether bucket aggregation runs in main or the renderer | RESEARCH open question 2. It is an IPC payload-boundary decision, not a visual one. This contract only requires that the renderer never holds a whole day's raw rows |
| The `team@1` byte cap | RESEARCH open question 1. A security/parse limit, decided at the validator, surfaced by the §Copywriting error string |
| The `team@1` member cap | CONTEXT leaves it at 16 as an explicit guess. The review sheet's grid reflows at any N; the cap belongs to the validator |
| The digest hour, and whether the three arms ship in one plan or three | CONTEXT discretion. Neither is a rendered surface — §S4 specifies the only UI obligation |
| Whether the `events` sink batches inside one `db.transaction()` | Storage, not visual |
| Any change to `AgentCard`'s 322 × 86 box | D-34 forbids it and `AgentCard.tsx:112-125` is a standing STOP-AND-REPORT |
| Any change to `terminalFontSize.ts`, xterm, Monaco or CodeMirror sizing | Out of scope by explicit carve-out, as in Phases 1 and 2 |
| A second Pixi `Application`, or any `<canvas>` | D-28 refuses it on a measured bug (`glRecovery.ts:9-18`) |
| Retiring Press Start 2P, or changing any existing colour, spacing or type token | `DESIGN.md` + `tokens.css` are the contract; this phase adds against them |
| Simultaneous side-by-side floors, and any UI implying them | D-13 — `app.requestSingleInstanceLock()` (`index.ts:1511`) still quits a second process. The honest limitation is docs + settings copy, and no surface in this phase may suggest otherwise |

---

## Auto-Mode Decision Log

`--auto` was in force: no `AskUserQuestion` was issued. Each resolution is auditable — the
alternative and why it lost are recorded so a reviewer can overturn one without re-deriving the whole
contract.

| # | Question | Resolved to | Alternative rejected, and why |
|---|----------|-------------|-------------------------------|
| 1 | shadcn gate | **NO** | Displaces an existing token system *and* requires writing the frozen `package.json` (D-37) |
| 2 | Bucket granularity (CONTEXT discretion) | **15 min → 96 buckets** | 5 min (288 columns, ~1.4px each at a 420px rail — sub-pixel columns break `DESIGN.md:9`) and 30 min (48 buckets, merges an hour's distinct activity). Shipped as a **commented constant declaring itself unmeasured** |
| 3 | Detail-row cap (CONTEXT discretion) | **200** | An uncapped list — refused, since no windowing library exists and D-37 forbids adding one. 200 matches the existing bound on the same data path (`preload/index.ts:787`) |
| 4 | Tab label | **`day`** | `timeline` — 8 characters against 3 in the one container this phase risks overflowing, and off-register beside `monitor` / `tasks` / `graph` |
| 5 | Tab icon | **`clock`, reused** | A new 16×16 path in `Icon.tsx`. Reuse is already the pattern in this exact array (`bell` ×2, `sparkle` ×2) and costs nothing |
| 6 | Density encoding | **Integer 1..8 bar heights** | An opacity ramp — a gradient by another name, banned by `DESIGN.md:71`, and unreadable at 1-unit column width |
| 7 | Band technology | **One `<svg>` of `<rect>`s** | Pixi (D-28, refused on a measured bug) and 288 CSS `<div>`s (one DOM node per cell against one `<svg>` carrying a single `role="img"` name) |
| 8 | Context threshold pair | **85 / 65** | 88/75 (`CommandCenterPanel.tsx:853`) and 87.5/75 (`AgentCard.tsx:165`) — neither carries a written reason. 85 does, and it names a real mechanism (`FullscreenTerminal.tsx:531`) |
| 9 | Duplicate-name rows in the review sheet (CONTEXT discretion) | **Default UNCHECKED** | Default checked — `AddAgentModal.tsx:131-133` derives the agent id from the name plus a millisecond, so a same-name same-batch pair collides |
| 10 | Export button location (RESEARCH Q3) | **AddAgentModal footer, beside import** | Settings, next to `changeHome`/`resetAll` — repeats the `OnboardingWizard.tsx:75-76` failure of a hiring affordance nobody finds |
| 11 | Import button label | **`import…`** | Leaving `import hire…` — after D-17 the same button accepts a team file, so the old label would be false |
| 12 | Slider thumb size | **24 × 24** | 12 or 16 wide — styling the thumb forfeits WCAG 2.2 SC 2.5.8's user-agent-control exception, and 24 is on the 4-grid anyway |
| 13 | Day picker bounds | **`max` = today, no `min`** | A `min` at the record's first day — it would make a pre-record day unreachable and thereby hide *when* the record starts, which §S1e's copy exists to state |
| 14 | The god's coverage for SCALE-05 | **Named residual, planner decides** | Silently mounting the card above the god's tab strip (~62px of the most contended column) or silently omitting it |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

---

*Phase: 03-scale-and-observability*
*Contract written: 2026-08-24, against `0c90d38`*
