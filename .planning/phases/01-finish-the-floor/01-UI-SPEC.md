---
phase: 1
slug: finish-the-floor
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-20
revised: 2026-08-20
---

# Phase 1 — UI Design Contract

> Visual and interaction contract for FLOOR-01, FLOOR-05, FLOOR-11, FLOOR-12, FLOOR-13, FLOOR-14
> — the six requirements behind ROADMAP.md Success Criterion 4.

**This is not a new-UI phase.** `DESIGN.md` is the design system and it already exists. This
document specifies *corrections* against it, precisely enough that an executor cannot invent
anything. No new visual language, no redesign, no new components, no new palette.

**Every current-state claim carries a `file:line` read in this session, and every number carries
the command that produced it.** Anything not read is marked `UNVERIFIED`. Where a clause is already
satisfied it says so and specifies nothing — over-specifying working code is how an executor is led
to rewrite it.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — `DESIGN.md` + `src/renderer/src/design/tokens.css` are the system |
| Preset | not applicable |
| Component library | in-house: `PixelPanel`, `PixelButton`, `PixelBadge`, `SpritePortrait`, `ContextBar`, `Sparkline` |
| Icon library | none — Unicode glyphs inline (`✎`, `⚠`, `✕`, `▾`/`▸`) |
| Font | `--cth-font-display` Press Start 2P · `--cth-font-ui` Inter · `--cth-font-mono` JetBrains Mono (`tokens.css:55-57`) |

### shadcn gate — executed, resolved NO

`components.json`, `tailwind.config.*` and `postcss.config.*` are all absent (verified). Stack is
React + Vite + Electron, so the gate fires. **Resolved to N without asking**, because introducing
shadcn/Radix into a phase whose entire purpose is compliance against an existing pixel-art design
system is exactly the scope creep CONTEXT.md's phase boundary and the operator's stated preferences
forbid. Registry safety gate: not applicable. No third-party registry is declared.

---

## Spacing Scale

Existing, unchanged. `tokens.css:41-50`. Base unit 4px per `DESIGN.md:154`.

| Token | Value | Usage |
|-------|-------|-------|
| `--cth-space-0` | 0px | reset |
| `--cth-space-1` | 4px | icon gaps, chip padding |
| `--cth-space-2` | 8px | compact element spacing |
| `--cth-space-3` | 12px | row gaps |
| `--cth-space-4` | 16px | default element spacing |
| `--cth-space-5` | 24px | section padding |
| `--cth-space-6` | 32px | layout gaps |
| `--cth-space-7` | 48px | major section breaks |
| `--cth-space-8` | 64px | page-level spacing |

**Exceptions for this phase: one, inherited not introduced.** The FLOOR-01 chip reuses the `BOSS`
chip's `padding: '1px 4px 0'` verbatim from `AgentCard.tsx:230`. The `1px` breaks the 4px scale
(`DESIGN.md:154`) and predates this phase. The value is copied unchanged from working, shipped code;
re-specifying it to 0 or 4 would be the over-specification this phase forbids, and would visually
desync the two adjacent chips. No spacing token is added, changed or removed.

---

## Typography

**Target state after this phase's FLOOR-12 migration.** Every value clears the `DESIGN.md:706`
floor — *"never go below 14 px for any user-facing text"* (verified verbatim).

| Role | Token | Size | Line height | Family | Weight |
|------|-------|------|-------------|--------|--------|
| Display lg | `--cth-text-display-lg` | 16px | 24px | Press Start 2P | single weight |
| Display md | `--cth-text-display-md` | **14px** (was 12px) | 20px | Press Start 2P | single weight |
| Body lg | `--cth-text-body-lg` | 16px | 24px | Inter | 400 |
| Body md | `--cth-text-body-md` | 14px | 20px | Inter | 400 |
| Body sm | `--cth-text-body-sm` | **14px** (was 13px) | 18px | Inter | 400 |
| Mono md | `--cth-text-mono-md` | 14px | 20px | JetBrains Mono | 400 |
| Mono sm | `--cth-text-mono-sm` | **14px** (was 13px) | 18px | JetBrains Mono | 400 |
| ~~Display sm~~ | `--cth-text-display-sm` | **DELETED** (was 8px) | — | — | — |

`--cth-text-display-lg` has **zero consumers** today — verified,
`grep -rn "text-display-lg" src/renderer/src` returns only its own definition at `tokens.css:61`.
It is left unchanged: it already clears the floor, deleting an unused token is not one of the six
requirements, and after the sweep `--cth-text-display-md` becomes the app's single display-face
size, so `display-lg` is the only headroom left in that ramp.

**Weights: regular 400, plus the 600 that already ships on 13 sites.** `DESIGN.md:137` says *"All
fonts ship in a single weight. Never bold"* — that line is contradicted by 24 `fontWeight`
declarations in source and is recorded in the known-drift table below. Weight is not one of the six
requirements; this phase neither adds nor removes one. The drift entry is the citation, not `:137`.

**Hierarchy after the migration is carried by family, colour and chip treatment — not by size.**
Press Start 2P remains the display/label face, Inter the reading face, JetBrains Mono the code face
(`tokens.css:55-57`), with `ink-900`/`ink-700`/`ink-500` and chips as the secondary channels — which
is what `DESIGN.md:137` prescribes for emphasis. Sizes compress toward 14/16px; **all three families
survive fully intact**, which is exactly why Rule 1 below is size-only.

---

## Color

Existing, unchanged. `tokens.css:3-38`, with the dark-theme mirror at `tokens.css:120+`.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--cth-cream-100` #FFF8E7 · `--cth-paper-200` #F0EAD2 | app ground, scroll surfaces |
| Secondary (30%) | `--cth-paper-100` #FCFAF0 · `--cth-cream-200` #F4E9C7 | cards, inputs, terminals, chips, section headers |
| Accent (10%) | the six agent hues: `--cth-coral` #D96A62 · `--cth-mint` #5CA97A · `--cth-sky` #4F9FAF · `--cth-lemon` #DCAB3C · `--cth-lilac` #9482D3 · `--cth-peach` #D99168 | see reserved-for list |
| Destructive | `--cth-coral` #D96A62 (= `--cth-status-blocked`, `tokens.css:34`) | destructive actions and blocked status **only** |

**Accent reserved for:** per-agent identity — the card's selection frame, the portrait background,
the `BOSS` tag fill, the `ContextBar` fill — **plus** the FLOOR-01 auto-mode chip, in
`--cth-lilac-light` #E0DAF2 fill with a `--cth-lilac` #9482D3 1px inset hairline. Nothing else.

**Why lilac and not coral.** An earlier draft used coral. That was wrong: `tokens.css:34` defines
`--cth-status-blocked: #D96A62`, which *is* `--cth-coral`, and `PixelBadge.tsx:25` renders `blocked`
in that exact token under the label `needs you` (`PixelBadge.tsx:41`). The AUTO chip sits in the
same row as that badge (`AgentCard.tsx:216-238`), so a coral AUTO chip would be the same hue as the
one status it must never be confused with. Lilac is the only accent hue in the six not bound to a
status token — `sky`=thinking, `lemon`=working, `coral`=blocked, `mint`=success, and `peach` sits
beside `--cth-status-looping` #D6903F. Its nearest status neighbour, `--cth-status-compacting`
#8F7CC7, renders as a **solid** badge fill reading `compacting`; AUTO is a **light fill with a
hairline** reading `AUTO`, in a different position. Per `DESIGN.md:708` (*"color + icon + position
… Never color alone"*), the pair is distinguishable on fill treatment, label and position, not on
hue alone.

*(One pre-existing solid `--cth-lilac` badge exists at `TasksKanban.tsx:260` — the `?` "waiting on
your answer" chip. Different component, different surface, never in the agent card's identity row,
and AUTO is the light fill rather than the solid. No collision.)*

This is the only color added by this phase. No token is changed or removed.

---

## Copywriting Contract

Governed by `DESIGN.md:630-657` (§14 Voice & copy): use the agent's name, never "the agent";
system feedback under 12 words; no emoji; exclamation marks only on completions and notifications
(`DESIGN.md:653`).

| Element | Copy |
|---------|------|
| FLOOR-01 chip label | `AUTO` |
| FLOOR-01 accessible name | `Auto mode — {name} runs with permissions bypassed` |
| FLOOR-01 hover title | `Auto mode: {name} acts without asking for tool approval.` |
| FLOOR-05 primary CTA | `open logs` (lowercase, matching the `change...` / `on` / `off` siblings at `SettingsModal.tsx:893,915`) |
| FLOOR-05 section label | `Log folder` |
| FLOOR-05 accessible name | `Open the log folder` |
| FLOOR-05 error state | `Could not open the log folder. The path is {path} — open it yourself.` |
| FLOOR-12 empty column (Kanban) | `Nothing here yet` — replaces the bare `—` at `TasksKanban.tsx:198` (Rule 0 exclusion #1) |
| FLOOR-12 percent unit label | `percent` as the `aria-label` on the `%` at `triggers/ui.tsx:348`; the visible `%` stays (Rule 0 exclusion #2) |
| FLOOR-12 waiting-on-you chip | `aria-label="Waiting on your answer"` on the `?` at `TasksKanban.tsx:263`; the visible `?` stays (Rule 0 exclusion #3) |
| FLOOR-13 sidebar toggle label | `hide panel` when open · `show panel` when collapsed |
| FLOOR-13 sidebar toggle accessible name | the visible label is the accessible name — do **not** add `aria-label`. State is carried by `aria-expanded` |
| FLOOR-14 notification title | `{name}` (matches `hooks.ts:406` and `hooks.ts:343`) |
| FLOOR-14 notification body | `is waiting on you` (god) · `is waiting on Michael` (worker) |
| Empty state — Settings log path unknown | `—` (the existing `SettingsModal.tsx:892` convention) |

**Destructive actions in this phase: none.** No confirmation copy is required. The auto-mode chip
is an *indicator*, not a control — it must not be clickable.

---

## Per-Requirement Contracts

### FLOOR-01 — auto mode is visible on the agent card

**Current state.** `grep -c autoMode src/renderer/src/components/AgentCard.tsx` → **0** (verified).
`autoMode` appears only in `App.tsx:285`, `AddAgentModal.tsx:933`, `OnboardingWizard.tsx:100-627`,
`SettingsModal.tsx:190-1128`, `realtime/actions.ts:363`, `realtime/tools.ts:277`. The card is silent.

**What "bypassed" actually means — read this before implementing.** `config.autoMode` is a single
**global** toggle. `src/renderer/src/store/config.ts:427` appends the provider's own flag at spawn:
`if (config.autoMode && preset.autoFlag) cmd = cmd + ' ' + preset.autoFlag`. Two consequences the
indicator must not get wrong:

1. **Not every provider is bypassed when the toggle is on.** `agentProvider.ts:357` (`opencode`)
   and `:533` (`custom`) both carry `autoFlag: ''`. `opencode` *is* still bypassed, by a different
   route — `index.ts:3277-3279` writes `permission: {edit:'allow', bash:'allow', webfetch:'allow'}`
   into `OPENCODE_CONFIG_CONTENT`, gated on `cfg.autoMode`. `custom` has **no** auto path at all.
   A chip driven off `config.autoMode` alone would lie on every `custom` agent.
2. **The flag is baked at spawn.** Toggling `autoMode` off does not de-bypass an already-running
   agent. A chip driven off the live toggle would lie in the other direction.

**Locked derivation.** One shared helper, called by all three renderings — not three
re-derivations that drift:

- Source of truth is the agent's own `command` string (`store.ts:67`, *"the command being run in
  the PTY"*), tested against `autoModeFlagForProvider(provider)` (`agentProvider.ts:624`). Truthful
  per-agent and survives a toggle.
- `opencode` is the one documented exception: its bypass is env-based and is not recorded on the
  agent. Fall back to the live `config.autoMode` for that provider only, with the reason in an
  inline comment.
- `custom` is never bypassed.

**Visual contract.** Reuse the existing `BOSS` chip shape at `AgentCard.tsx:227-231` exactly —
same `padding: '1px 4px 0'`, same `flexShrink: 0`. Differences:

| Property | Value |
|----------|-------|
| Label | `AUTO` |
| Position | identity row (`AgentCard.tsx:216`), immediately after the name and after `BOSS` if present, before `<PixelBadge>` |
| Fill | `var(--cth-lilac-light)` |
| Border | `inset 0 0 0 1px var(--cth-lilac)` |
| Text color | `var(--cth-ink-900)` |
| Font | `var(--cth-font-display)` at `var(--cth-text-display-md)` / `var(--cth-lh-display-md)` — the same face and size `BOSS` lands on under Rule 1 |
| Interaction | **none.** Not focusable, not clickable, no `role="button"` |

It is filled+outlined rather than solid accent so it cannot be mistaken for the `PixelBadge` status
chip sitting beside it — `DESIGN.md:708` requires status to read from color **+** icon **+**
position, never color alone, and a second solid pill in the same row would break that.

**AUTO and BOSS land on the same face and size — intentionally.** `BOSS` (`AgentCard.tsx:227-231`)
is Press Start 2P at `fontSize: 7`. Rule 1 raises it to `--cth-text-display-md` (14px) and leaves
the family alone, so both chips are Press Start 2P at 14px, differing only in fill treatment
(`BOSS` solid accent, `AUTO` light fill + hairline) and label.

**Accessible name — the part that is easy to ship broken.** `AgentCard.tsx:155` sets
`aria-label` to the name, optional `(boss)` and the status; `FullscreenTerminal.tsx:622` sets it to
the name and project. An `aria-label` on the container **replaces** all inner text for a screen
reader. A chip added inside either one is visually present and completely inaudible.

Contract: **any rendering whose root carries an `aria-label` must fold the auto-mode state into
that label**, e.g. `Ada (boss) — working — auto mode, permissions bypassed`. The chip itself is
then `aria-hidden="true"`, because the state is already in the container's name and announcing it
twice is worse than once.

---

### FLOOR-05 — open the log folder from Settings

**Already satisfied, specify nothing:** the main-process handler. `src/main/index.ts:4461-4469`
does `mkdirSync(logsDir(), {recursive:true})` then `await shell.openPath(dir)` and returns
`{ok:true, path}` or `{ok:false, error}`. Do not touch it.

**Gap:** no preload export, no UI affordance (verified — no `openLogs` anywhere in `src/preload/`
or `src/renderer/`).

**Affordance contract.** One row in Settings → **General**, placed directly beneath the existing
`Home folder` row (`SettingsModal.tsx:880-894`) and above the divider at `:897`. Same "where your
data lives" topic; reuse that row's markup verbatim:

- Section label: `Log folder`, in the established uppercase section-header style
  (`SettingsModal.tsx:882-886` — that pattern's `fontSize: 8` is a FLOOR-12 violation fixed by
  Rule 1 in the same sweep; the new row must be written at the corrected size, not copied at 8px).
- Path: `<span>` in `var(--cth-font-mono)`, `wordBreak: 'break-all'`, color `--cth-ink-900`,
  showing the `path` the handler returns. Before first invocation there is no path — render `—`,
  matching `SettingsModal.tsx:892`.
- Action: `<PixelButton variant="secondary" size="sm">open logs</PixelButton>`. `PixelButton`
  renders real button text, so no `aria-label` is needed; adding one would override the visible
  label and is forbidden here.
- Error: on `{ok:false}`, render the error copy inline below the row in `--cth-coral`. Do not open
  a modal, do not toast — Settings errors here are inline (`SettingsModal.tsx:696` `setChangeErr`).

Cross-reference FLOOR-17 in the plan: the bug template asks for "Logs" and that ask is
unanswerable until this button ships.

---

### FLOOR-11 — a PTY byte does not re-render the roster

Performance/wiring, not visual. Short by design.

**Already satisfied, specify nothing:**
- *A PTY byte does not re-render the roster* — `store.ts:614-621` returns `s` unchanged when
  `patchChangesAgent` is false; policy extracted pure in `store/agentPatch.ts`; blocked-repaint
  early return at `usePtyParser.ts:171`.
- *The terminal pool is bounded* — `store/terminalPoolPolicy.ts`, `TERMINAL_POOL_MAX = 24`, cap at
  `terminalPool.ts:319`, orphan sweep at `terminalPool.ts:335` from `useHive.ts:1007`.

**Gap.** `useHiveTasks` and `refreshHiveTasks` are exported at `hooks/useHiveTasks.ts:43` and `:39`
and have **zero callers** — verified: `grep -rn "useHiveTasks\|refreshHiveTasks" src/ test/`
excluding the hook's own file returns nothing.

> **CORRECTION.** Issue #20, CONTEXT.md and RESEARCH.md all say **four** pollers on one file.
> Verified count of `window.cth.hiveTasks()` call sites excluding the hook's own file:
> **10 sites across 7 files.**
>
> | File | Lines | Timer? |
> |------|-------|--------|
> | `components/AgentStrip.tsx` | `:81` | yes — `setInterval` 5000 at `:93` |
> | `components/AskMeTab.tsx` | `:55` | yes — `setInterval` at `:60` |
> | `components/TaskDetailOverlay.tsx` | `:26` | yes — `setInterval` at `:32` |
> | `components/TasksKanban.tsx` | `:128` | yes — `setInterval` at `:145` |
> | `scene/office/OfficeFloor.tsx` | `:1000`, `:1362` | `:1362` is on `setInterval(pollTaskBoard, 5000)` at `:1425`; `:1000` is one-shot |
> | `hooks/useHive.ts` | `:218` | one-shot |
> | `realtime/tools.ts` | `:169`, `:579`, `:631` | one-shot (voice tool calls) |
>
> Five of the ten are on 5-second timers. The migration target is the five timers; the five
> one-shot reads are correct as they are and must not be converted.

UI-visible contract: **none.** Migrating a poller must produce **no** change in rendered output.
Any visual difference after migration is a regression, not an improvement. The hook returns
`unknown` deliberately (its own header explains why) — do not unify the parsers into a shared typed
shape.

---

### FLOOR-12 — accessible names and the 14px floor

**Already satisfied, specify nothing:**
- **The focus ring.** `global.css:93-95` — `outline: 2px solid var(--cth-ink-900); outline-offset: 2px`,
  rationale at `:85-92`. Issue #26's "1px focus ring at 3.4:1" is closed.
- **`role="button"` nested inside `<button>`.** Issue #26 cites `CommandCenterPanel.tsx:1555`.
  Verified gone — `grep -rn 'role="button"' src/renderer/src` returns exactly two hits, both
  standalone.

#### The two surviving `<div role="button">` — decision: **they stay**

`AgentCard.tsx:145` and `FullscreenTerminal.tsx:604`. Each carries an inline comment
(`AgentCard.tsx:137-143`, `FullscreenTerminal.tsx:598-601`) explaining that the element wraps
multiple independent interactive children, that interactive content inside a `<button>` is invalid
HTML — the parser closes the outer button early and screen readers flatten the group into one
unusable control — and that `role` + `tabIndex={0}` + an `Enter`/`Space` handler that bails on
`e.target !== e.currentTarget` restores the keyboard behaviour. `.planning/codebase/CONCERNS.md`
records these as resolved history, not debt.

**Contract: leave both exactly as they are.** A task converting them to native `<button>` is
regressing a deliberate, documented decision. What they *do* owe FLOOR-12 is an accessible name —
`AgentCard.tsx:155` and `FullscreenTerminal.tsx:622` already have one, and per FLOOR-01 both must be
extended to carry the auto-mode state.

#### Accessible names — the rule, not the ratio

Measured: **49** `aria-label` occurrences against **133** `<button` occurrences in
`src/renderer/src`.

That ratio is **not the bar**, and a test asserting on it would be wrong. A `<button>` with visible
text content already has an accessible name; adding `aria-label` to it *overrides* the visible label
and makes the UI worse for voice-control users.

**The rule:** every `<button>` must have an accessible name.
- Button has visible text content → **already named. Do not add `aria-label`.**
- Button's only content is an icon, glyph or symbol → **`aria-label` required**, phrased as
  verb + object naming the agent where one is in scope (`FullscreenTerminal.tsx:665` is the house
  pattern — copy it).
- Decorative glyphs that are not controls → `aria-hidden="true"` (Rule 0 below).

The repo-fact test must assert **icon-only buttons have `aria-label`**, not a count or a ratio.

---

#### The text-size sweep

##### Measurement — pinned commands, all reproducible

RESEARCH.md scopes the token half as *"four lines in one uncontended file."* True of the tokens —
and it does not close the criterion. Sub-14px sizes are set almost entirely by hardcoded literals
that bypass the token layer.

**M1 — the sweep surface.** This is the command the completeness bar and the repo-fact test both
use. Do not re-derive with a different regex.

```bash
grep -rhoE "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" \
  src/renderer/src --include=*.tsx --include=*.ts | wc -l    # → 604
grep -rlE  "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" \
  src/renderer/src --include=*.tsx --include=*.ts | wc -l    # → 61
```

| Literal | 7 | 8 | 9 | 10 | 11 | 12 | 13 | total |
|---------|---|---|---|----|----|----|----|-------|
| Sites | 5 | 57 | 20 | 49 | 133 | 264 | 76 | **604** across **61 files** |

> **Precision note.** An earlier draft reported 594/60 from a narrower `.tsx`-only regex; the UI
> checker measured 607/60 and 610/62 with two others. The count moves ±6 with regex shape (whether
> `.ts` is included, whether `fontSize={n}` and end-of-line matches count). M1 is authoritative here.

**M2 — the display-face subset (Rule 1's surface).**

```bash
# same-line only
grep -rE "cth-font-display" src/renderer/src --include=*.tsx --include=*.ts \
  | grep -cE "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])"                      # → 104
# ±2 lines (multi-line style objects), split by bucket
grep -rn -B2 -A2 "cth-font-display" src/renderer/src --include=*.tsx --include=*.ts \
  | grep -cE "fontSize *[:=] *\{?[7-9]($|[^0-9.])"                               # → 79
grep -rn -B2 -A2 "cth-font-display" src/renderer/src --include=*.tsx --include=*.ts \
  | grep -cE "fontSize *[:=] *\{?1[0-3]($|[^0-9.])"                              # → 51
```

**104** same-line, **130** (79 + 51) once multi-line style objects are included. Total
`--cth-font-display` references in the renderer: **134**. So essentially every display-face use in
the app sits below the floor.

**M3 — glyph-only elements (Rule 0's candidate set).** See Rule 0 below. → **30**.

Plus three non-literal sites: two Pixi canvas labels (`scene/office/ThoughtBubble.ts:22`,
`scene/office/ToolBubble.ts:29`, both `FONT_SIZE = 12`) and one computed floor
(`FullscreenTerminal.tsx:694`, `fontSize: Math.max(9, scale.name - 3)`).

This is the measured cost of a criterion already in the roadmap, not new scope.

##### Sweep rules — mechanical, no judgement at the site

Every site falls into exactly one rule. Rules are checked in order.

**Rule 0 — exempt decorative glyph.** On the frozen allowlist (below): size unchanged, element
gains `aria-hidden="true"`. Stop.

**Rule 1 — display face, any sub-14 size → raise the SIZE ONLY.**
Condition: the style object sets `fontFamily: 'var(--cth-font-display)'` **and** a `fontSize` of
7–13. Surface: **130 sites** (M2).
Action: `fontSize` → `var(--cth-text-display-md)`, `lineHeight` → `var(--cth-lh-display-md)`.
**`fontFamily` is unchanged. Press Start 2P stays.**

> `DESIGN.md:706` is a **size** rule — *"never go below 14 px."* Press Start 2P at 14px satisfies it.
> An earlier draft of this contract converted these 130 sites to `--cth-font-ui`, which would have
> left Press Start 2P at exactly one site in the whole renderer (`PixelPanel.tsx:67`) — a typeface
> retirement, in a document whose second paragraph reads *"no new visual language, no redesign."*
> There is no decision record for it: CONTEXT.md D-01…D-47 contain nothing on typography or fonts.
> Family conversion is discretionary; the size rule is what criterion 4 grades. Size-only it is.

**Rule 1b — the two `display-sm` consumers convert family, as a stated exception.**
Sites: **exactly two** — `AgentCard.tsx:220` (the agent NAME on the card) and `ThreadsPanel.tsx:101`
(thread title button).
Action: `fontFamily` → `var(--cth-font-ui)`, `fontSize` → `var(--cth-text-body-md)`,
`lineHeight` → `var(--cth-lh-body-md)`.
Reason, verified per site: both are at **8px**, the largest jump in the sweep, and both are
user-facing *reading* text rather than labels. Press Start 2P is monospaced at ~1em per character;
at 8px that is 8px/char, at 14px it is 14px/char — a **75% width increase** inside the 112px agent
strip (`AgentStrip.tsx:257-258`) on the card's identity line. Inter at 14px averages ~8.4px/char
uppercase, i.e. roughly flat against the current 8px Press Start 2P. These two sites convert to
avoid a 75% widening; every other Rule 1 site keeps its face. No third site qualifies.

**Rule 2 — non-display text, sub-14 size → raise the size.**
Condition: a `fontSize` of 7–13 with no `--cth-font-display` in the same style object.
Action: `fontSize` → `var(--cth-text-body-md)` (or `var(--cth-text-mono-md)` where the object sets
`fontFamily: 'var(--cth-font-mono)'`), `lineHeight` → the matching `--cth-lh-*` token.

**Rule 3 — the three non-literal sites.** `ThoughtBubble.ts:22` and `ToolBubble.ts:29` →
`FONT_SIZE = 14`. `FullscreenTerminal.tsx:694` → `Math.max(14, scale.name - 3)`.

**Out of the sweep entirely:** `components/terminalFontSize.ts` and anything xterm. Terminal sizing
is user-controlled and is not governed by `DESIGN.md:706`.

##### Rule 0 — the exempt allowlist

**Candidate predicate (decidable, pinned).** A candidate is a JSX element whose entire child
expression is a single character outside `[A-Za-z0-9/]` — either a literal or a two-branch ternary
of single such characters — **and which is immediately followed by a closing tag**. The `</`
requirement and the `/` exclusion are what remove regex artifacts: JSX self-closes (`/> : <`),
arrow-function returns (`=> (<option`), template-string contents, JSDoc comment bodies, and prose
punctuation before `</span>`.

```bash
export LC_ALL=C.UTF-8
grep -rnP ">\s*([^A-Za-z0-9\s<>{}/]|\{[a-zA-Z]+ \? '[^A-Za-z0-9]' : '[^A-Za-z0-9]'\})\s*</" \
  src/renderer/src --include=*.tsx                                        # → 30
```

> **Correction.** An earlier draft reported **38** and called them "glyph-only elements". 38 was the
> *match* count of a looser regex; **8 were not elements** — three `/` matches
> (`SettingsModal.tsx:121`, `:128`, `:1465`), a JSDoc body (`SettingsModal.tsx:306`), a multi-child
> `Σ` row (`CommandCenterPanel.tsx:1014`), two `=> (<option` returns (`CommandCenterPanel.tsx:1434`,
> `TasksKanban.tsx:420`) and a component ternary (`App.tsx:357`). The command above returns **30
> real elements**. `/` is dropped from the glyph vocabulary entirely.

**The 30 candidates.** Vocabulary: `✕`×9 · `•`×3 · `·`×3 · `✎`×2 · `{open ? '▾' : '▸'}`×2 ·
`✓` `⚠` `└` `−` `⇄` `—` `?` `.` `%` `{gitCollapsed ? '▸' : '▾'}` ×1 each.

| File | Glyph |
|------|-------|
| `AgentCard.tsx` | `✎` |
| `AgentStrip.tsx` | `✕` ×2 |
| `AskMeTab.tsx` | `✕`, `└` |
| `CommandCenterPanel.tsx` | `⚠`, `✓` |
| `FullscreenFileEditor.tsx` | `✕` |
| `FullscreenTerminal.tsx` | `✕`, `✎`, `·` ×2, `•` |
| `IntegrationsRegistry.tsx` | `.`, `✕` |
| `PtyTerminalView.tsx` | `−`, `+` |
| `ReleaseDrop.tsx` | `✕` |
| `TasksKanban.tsx` | `—`, `?`, `✕` |
| `ThreadsPanel.tsx` | `{open ? '▾' : '▸'}` |
| `triggers/ui.tsx` | `{open ? '▾' : '▸'}`, `%` |
| `UpdateBadge.tsx` | `·` |
| `UpdatesSection.tsx` | `•` |
| `UpdateToast.tsx` | `•` |
| `ide/GitPanes.tsx` | `✕`, `⇄` |
| `ide/IdePanel.tsx` | `{gitCollapsed ? '▸' : '▾'}` |

**Four candidates are NOT exempt — a single non-alphanumeric character is not proof of decoration.**
Each was read this session:

| Site | Glyph | Why it is content, not decoration | Action |
|------|-------|-----------------------------------|--------|
| `TasksKanban.tsx:198` | `—` | It is the **empty-state** body of a Kanban column. `aria-hidden` would make an empty column silent to a screen reader. | Replace with the copy `Nothing here yet` at 14px. Rule 2 applies. |
| `triggers/ui.tsx:348` | `%` | A **unit label** beside a numeric input (`:344-347`). Hiding it loses the unit. | Keep the visible `%`, raise to 14px under Rule 2, add `aria-label="percent"`. |
| `TasksKanban.tsx:263` | `?` | A **status chip** — `title="waiting on YOUR answer — see the ASK ME tab"` (`:258`), solid `--cth-lilac` fill (`:261`). It carries meaning and has no accessible name. | Keep the visible `?`, raise to 14px under Rule 1 (it sets `--cth-font-display` at `:260`), add `aria-label="Waiting on your answer"`. |
| `IntegrationsRegistry.tsx:293` | `.` | Sentence punctuation ending prose inside `<span style={hint}>`, after a `<code>` element. Not a glyph element; a residual regex artifact. | No exemption. The `hint` style is swept normally. |

**→ 26 exempt candidates.**

**Line space: the allowlist is frozen in `fontSize`-declaration-line space**, because that is what
M1 reports. It is **not** element-line space. The two differ: at `AgentStrip.tsx` the `✕` button's
`fontSize: 11` is on **line 209** and `>✕</button>` on **line 213**. An allowlist of element lines
could never filter M1's output.

**Hoisted shared style objects are NOT exempt.** Verified cases:
- `FullscreenFileEditor.tsx:59` — `const chip` (`fontSize: 12`) serves `:111` `open in IDE` (text)
  and `:112` `✕` (glyph).
- `ide/GitPanes.tsx:35` — `const smallBtn` (`fontSize: 11`) serves `:110` `load older…` and `:127`
  (both text) and `:130` `✕` (glyph, via spread).

Allowlisting the shared declaration to protect the glyph would leave real text below the floor with
the test green — a silent hole in the exact bar meant to close criterion 4. **Rule:** where a
hoisted style object serves both a glyph-only element and any text element, the shared declaration
is swept normally (Rule 1 or 2) and the glyph element gets a **local `fontSize` override**. That
override's line is what enters the allowlist. At least 14 files carry hoisted style objects with
sub-14px `fontSize`; the executor resolves each of the 26 by reading its style source.

**Consequence: the allowlist is produced by the sweep, not before it.** Some allowlisted lines do
not exist yet — they are the local overrides the executor creates. What is fixed *before* the work
is the input (the 30 candidates from M3, minus the 4 named exclusions = 26) and the mapping rule.
There is no per-site judgement: each of the 26 resolves to either "inline style → allowlist its own
`fontSize` line" or "hoisted shared style → sweep it, add a local override, allowlist the override".

The final allowlist is **≤26 entries**, pasted into the plan and frozen as a literal `file:line`
array in `test/repo-claims.test.cjs`. Each of the 26 gains `aria-hidden="true"` (the renderer
carries 12 `aria-hidden` occurrences today).

##### Containment — what happens when a bumped site breaks a fixed container

Rules 1, 1b and 2 pair the line-height token, so a 10/14 site becomes 14/20: **+6px per line**.
Verified fixed-height chrome:

| Container | Anchor | Value |
|-----------|--------|-------|
| Agent strip | `AgentStrip.tsx:257-258` | `height: 112, minHeight: 112` |
| Agent card | `AgentCard.tsx:111` | `const height = 78` |
| Card chip leading | `AgentCard.tsx:228`, `:262`, `:270` | `lineHeight: '11px'` / `'13px'` / `'13px'` |
| Strip note clamp | `AgentStrip.tsx:303` | `maxHeight: 84` |

**Width direction — stated honestly, per bucket.** With Rule 1 size-only, every display-face site
keeps a monospaced ~1em advance, so its width scales directly with the size change: a 7px label
becomes 14px (**+100% wider**), an 8px label +75%, a 12px label +17%. Rule 2's Inter and mono sites
scale similarly with size. **The sweep makes text wider almost everywhere.** The only sites that do
not are Rule 1b's two, where the family change roughly cancels the size change (8px Press Start 2P
at 8px/char → 14px Inter at ~8.4px/char). This is consistent with the `display-sm` migration row
below, which concedes that *"a wider name truncates rather than wraps"* — truncation is the
designed response, not an exception to it.

**When a bumped site overflows fixed chrome, the executor does exactly one of these, in order:**

1. **Nothing.** The card's name, info line, cost span and account chip already carry
   `whiteSpace:'nowrap'` + `overflow:'hidden'` + `textOverflow:'ellipsis'`
   (`AgentCard.tsx:223-224`, `:249-251`, strip clamp at `:303`). Horizontal growth truncates by
   design. This is the default and covers the majority.
2. **Raise the container's integer by the measured delta, and change nothing else.**
   `AgentStrip.tsx:257-258` and `AgentCard.tsx:111` are three numbers. Vertical growth is absorbed
   by editing those numbers, not by re-laying out the card.
3. **Stop and report** in the plan's task notes with the file:line and the measured overflow.

**Explicitly forbidden:** reflowing a card, moving a field, dropping a field, collapsing a row, or
holding any site below 14px to make room. If the answer looks like "redesign it," it is option 3.

*(`DESIGN.md:674` documents the strip as 80px tall; source says 112 with a 78px card. The doc is
stale. Containment uses the source values; correcting `:674` is not one of the six requirements.)*

##### Completeness bar — what makes criterion 4 TRUE

Criterion 4's clause is *"no user-facing text sits below the 14px floor DESIGN.md states."* It is
TRUE for this phase when **all four** hold:

1. `src/renderer/src/design/tokens.css` declares no `--cth-text-*` value below 14px, and
   `--cth-text-display-sm` / `--cth-lh-display-sm` are gone.
2. Command **M1** over `src/renderer/src/**/*.{ts,tsx}` returns **only** lines on the frozen
   allowlist (≤26 entries), i.e. `604 − |allowlist|` sites converted.
3. Every allowlisted line's element is one of the 26 exempt candidates (or the local override
   created for one), and carries `aria-hidden="true"`.
4. The 3 non-literal sites (`ThoughtBubble.ts:22`, `ToolBubble.ts:29`, `FullscreenTerminal.tsx:694`)
   are at or above 14.

**In scope:** every file under `src/renderer/src/`. **Out of scope:** `components/terminalFontSize.ts`,
xterm configuration, and anything outside `src/renderer/`.

**`test/repo-claims.test.cjs` asserts exactly those four**, following the repo-fact-test precedent
of `test/ci-config.test.cjs` and `test/engine-parity.test.cjs` (D-45). The allowlist is a literal
`file:line` array in the test, so a new sub-14px site fails the suite rather than silently widening
the exemption.

##### Token migration table

`tokens.css:61-68` (sizes) and `:70-77` (line heights).

| Token | Current | New | Verified consumers | Layout consequence |
|-------|---------|-----|--------------------|--------------------|
| `--cth-text-display-sm` | **8px** | **DELETE the token** | `AgentCard.tsx:220` (agent NAME on the card) · `ThreadsPanel.tsx:101` (thread title button) | Both are user-facing *reading* text and must clear 14px. Both take **Rule 1b** (family → Inter, size → `body-md`) rather than Rule 1, because Press Start 2P at 14px is 75% wider than at 8px inside the 112px strip. Both already have `nowrap` + `ellipsis`, so a wider name truncates rather than wraps. Token deleted so it cannot reappear below floor. |
| `--cth-lh-display-sm` | 12px | **DELETE** | none outside the two sites above | Deleted with its size token. |
| `--cth-text-display-md` | **12px** | **14px** | `PixelPanel.tsx:67` today; **~130 sites after Rule 1** | Becomes the app's single display-face size. `--cth-lh-display-md: 20px` stays — 14/20 is an integer px per `DESIGN.md:144-150`. Panel titles grow ~17%. |
| `--cth-text-body-sm` | **13px** | **14px** | `PixelBadge.tsx:63` · `PixelButton.tsx:102` (`sm`/`md` button label) | `--cth-lh-body-sm: 18px` stays. +1px on auto-width badges and buttons. **Restores what `DESIGN.md:132` already specifies** (`body-sm` = 14/18) — a correction, not a change. |
| `--cth-text-mono-sm` | **13px** | **14px** | **zero** (verified: `grep -rn "text-mono-sm" src/renderer/src` returns only the definition) | Zero risk. Terminal/xterm sizing is owned by `components/terminalFontSize.ts` and is not driven by this token. Restores `DESIGN.md:134` (`mono-sm` = 14/18). |

##### DESIGN.md's own internal contradiction — resolve it in this phase

`DESIGN.md:128` specifies `display-md` at **12px** and `:129` specifies `display-sm` at **8px**,
while `:706` in the same file says *"never go below 14 px for any user-facing text."* The file
contradicts itself, and the phase's premise is that every claim the project makes about itself is
true. `:706` is the clause the roadmap grades against, so it wins.

Required edits to `DESIGN.md` §4.1: set `:128` `display-md` to 14/20 and delete the `:129`
`display-sm` row. `:132` `body-sm` and `:134` `mono-sm` already read 14/18 — `tokens.css` had
drifted below the doc, not above it. No other §4.1 row changes.

---

### FLOOR-13 — the four renderings agree, cost included

#### The four renderings — named authoritatively, correcting research

RESEARCH.md marks the set `UNVERIFIED` and guesses `AgentCard`, `AgentStrip`, `AgentDetailPanel`,
`CommandCenterPanel`. **Issue #39's own text names them**, and it is the graded source:

> Where: `AgentCard.tsx`, `FullscreenTerminal.tsx:611-803`, `CommandCenterPanel.tsx:699-983`

plus "and avatar" in its body. So the four are:

| # | Rendering | Anchor |
|---|-----------|--------|
| 1 | Agent card (bottom strip) | `components/AgentCard.tsx` |
| 2 | Fullscreen roster row | `components/FullscreenTerminal.tsx:612-750` |
| 3 | Command-centre row | `components/CommandCenterPanel.tsx:699-775` |
| 4 | Floor avatar (Pixi sprite) | `scene/office/Character.ts` + `scene/office/OfficeFloor.tsx` |

`AgentStrip` and `AgentDetailPanel` are **not** in the set. `AgentStrip` is the container that
renders `AgentCard`; `AgentDetailPanel` is a detail view, not a roster rendering.

#### The avatar is the deliberate exception — do not bolt fields onto it

Verified: `Character.ts` imports only `Container`, `Graphics`, `Texture` — **no `Text` at all**. The
only Pixi `Text` in the scene is `ThoughtBubble.ts:81` and `ToolBubble.ts:75`, transient speech
bubbles, not an agent field set. The avatar communicates identity by sprite and state by status
glyph and position, exactly what `DESIGN.md:708` prescribes.

**Contract: the avatar carries no field set and gains none.** A `$0.42` readout on a 32px sprite is
not legibility, it is clutter. Record this exception in the plan so the checker reads it as
intentional. The agreement contract binds **the three text renderings**.

#### `none shows cost` is stale — verified

Issue #39 says *"None shows cost."* All three text renderings already show it:

| Rendering | Cost render |
|-----------|-------------|
| Agent card | `AgentCard.tsx:256-265` — `$` + `usd.toFixed(2)`, hidden when 0, `title="Estimated spend so far: …"` |
| Fullscreen roster row | `FullscreenTerminal.tsx:711-718` — same shape, from `useFleetTelemetry()` at `:85` via `samples[a.id]?.usd` (`:340`, `:377`) |
| Command-centre row | `CommandCenterPanel.tsx:743-747` — same shape, from `useFleetTelemetry()` at `:367` |

**Specify nothing for the cost clause.** It is satisfied. The plan's FLOOR-13 task is to *verify and
paste this*, not build it. RESEARCH.md's "hard dependency on D-22's `hive:tasks` widening" applies to
the **budget/cap meter** (FLOOR-10), not to this display, which rides `useFleetTelemetry` and is live.

#### The agreed field set

Every one of the three text renderings must show all of these. This is the contract that stops them
drifting again.

| # | Field | Card | Fullscreen row | Command-centre row |
|---|-------|------|----------------|--------------------|
| 1 | Name | ✅ `AgentCard.tsx:225` | ✅ `FullscreenTerminal.tsx:665` | ✅ `CommandCenterPanel.tsx:735` |
| 2 | Status (`<PixelBadge>`) | ✅ `:238` | ✅ `:669` | ✅ `:736` |
| 3 | **Auto mode** (FLOOR-01) | ❌ absent | ❌ absent | ❌ absent |
| 4 | Cost `$x.xx` | ✅ `:256-265` | ✅ `:711-718` | ✅ `:743-747` |
| 5 | Model | ❌ absent | ✅ `:701-705` (`shortModel`) | ✅ `:713-714` |
| 6 | Location (project / cwd) | ✅ `:243-252` (`infoLine`) | ✅ `:706-710` (`basename`) | ✅ `:751` (`<PathLine>`) |
| 7 | Context (tokens / limit) | ✅ `progress` gauge, props `:23-27` | ✅ `:720` `<ContextBar>` | ✅ `:771` cumulative-usage row |

**Gaps to close: exactly two.** Field 3 in all three (that is FLOOR-01, extended beyond the card),
and field 5 on the card.

For field 5 on the card, follow `FullscreenTerminal.tsx:704`'s established pattern:
`shortModel(agent.model) ?? 'CLI default'`, in the existing context line (`AgentCard.tsx:243-252`),
`flexShrink: 0`, before the cost span, with the full model id in the row's `title`.

**Deliberately excluded: duration.** Issue #39's *Fix* line suggests it. Verified there is no
spawn/start timestamp on the store's `Agent` shape (`store.ts:55-90`), so duration means new durable
state **plus** a per-second re-render of every roster row — a direct collision with FLOOR-11's *"a
PTY byte does not re-render the roster"* landing in the same phase. The graded clause in ROADMAP.md
criterion 4 is *"agree on what they show, cost included"* — cost, not duration. Do not build it.

**Agent-name casing stays as-is.** `AgentCard.tsx:220` renders `{name.toUpperCase()}`. Rule 1b moves
that site from Press Start 2P to Inter, and `DESIGN.md:140-141` reserves ALL-CAPS for display fonts.
The `.toUpperCase()` **stays**: casing is not one of the six requirements, changing it is a visual
change nothing asks for, and the card's identity line reads as a nameplate. `DESIGN.md:140-141`
joins the known-drift list rather than driving a code change.

#### Sidebar collapse — two of three clauses are already satisfied

> **CORRECTION — verified against source.** Both CONTEXT.md's framing and RESEARCH.md's
> *"nothing re-clamps on window resize"* are **stale**.

- *`sidebarWidth` clamped only while dragging* — **already satisfied.**
  `components/SidebarSplitter.tsx:35-37` is a `useEffect` on `[width, clampMax, onChange]` calling
  `onChange(clampMax)` whenever `width > clampMax`, where
  `clampMax = Math.min(max, Math.max(min, viewportWidth - 360))` (`:24`). Its comment at `:27-34`
  says *"Re-clamp when the WINDOW changes, not only while dragging"* and describes the exact
  stranding bug issue #38 reports. Live: `App.tsx:222-226` tracks `window.innerWidth` into
  `vpWidth`, passed as `viewportWidth` at `App.tsx:448`. The store's clamp (`store.ts:865`,
  `[320, 1200]`) is the absolute-bounds half, deliberately viewport-blind.
  **Specify nothing. Do not add a second resize listener.**
- *Long cwds wrap to four lines / truncate paths from the left* — **already satisfied.**
  `CommandCenterPanel.tsx:1581-1595` `PathLine` slices from the left with `MAX = 46`, plus `nowrap`
  + `ellipsis`; its comment explains the two work together so a path can never wrap. Used at `:751`,
  `:1038`, `:1333`. `FullscreenTerminal.tsx:865-869` clips raw `agent.cwd` with `nowrap` +
  `ellipsis` + `maxWidth: 300`. **Specify nothing.**

**The one genuine gap: responsive collapse.** `DESIGN.md:678` promises *"Right panel collapses below
1024 to bottom drawer."* Verified: `grep -rn "@media" src/renderer/src` returns exactly one hit,
`global.css:151`, and it is `prefers-reduced-motion`. There is no breakpoint, no drawer, and no
`1024` anywhere in the renderer.

Contract — the minimum that makes the claim true, and **not** a bottom-drawer build:

- Below 1024px viewport width the sidebar collapses to hidden and the floor canvas takes the full
  width. A single persistent toggle re-opens it as an overlay above the canvas at `z-index: 2`
  (`DESIGN.md:686`, the drawer/sidebar layer).
- **Toggle:** `<PixelButton variant="secondary" size="sm">`, label `hide panel` when open and
  `show panel` when collapsed, with `aria-expanded` reflecting state. The visible label is the
  accessible name — no `aria-label`. The only new control this requirement adds.
- **Toggle placement:** top-right of the floor canvas, `position: absolute`,
  `top: var(--cth-space-2)`, `right: var(--cth-space-2)`, **`z-index: 2`** — the same drawer/sidebar
  layer as the overlay, per `DESIGN.md:686` (layer 3 is reserved for toasts; putting the toggle
  there would manufacture the doc/code contradiction criterion 1 bans). It stays clickable above the
  overlay by **DOM order**: render the toggle after the overlay in the same stacking context.
  Rendered **only** below 1024px; above 1024px it is not in the tree.
- **The agent strip is unaffected.** It spans the full window width in both states
  (`AgentStrip.tsx:257-258`, fixed 112px), sits below both the canvas and the overlay, and does not
  collapse. No change.
- Driven off the `vpWidth` state **already tracked** at `App.tsx:222-226`. Do not add a `matchMedia`
  listener or a CSS breakpoint — a second source of viewport truth is how this drifts.
- `SidebarSplitter` is hidden while collapsed (nothing to drag); its clamp effect is untouched.
- Below 1024, the overlay's width is `Math.min(sidebarWidth, vpWidth - 48)`. It must **not** write
  that back through `setSidebarWidth` — persisting a small-window width would strand the user's
  chosen width on the next large-window boot, the exact bug class `SidebarSplitter.tsx:27-34` was
  written to kill.

**If the plan chooses not to build this**, then `DESIGN.md:678` is a doc promising a code path that
does not run — banned by ROADMAP.md criterion 1 — and the line must be deleted instead. Build it or
delete the claim. There is no third option.

---

### FLOOR-14 — notification on blocked or long task

**Already satisfied, specify nothing** (three of four clauses):

| Clause | Evidence |
|--------|----------|
| Clicking the toast focuses that agent | `hooks.ts:425` — `n.on('click', …)` calling `this.focus?.(agentId)`, wired at `index.ts:468` |
| A notification fires on a long task | `hooks.ts:343` — `if (turnMs >= LONG_TURN_MS) this.notify(...)`, body `finished after N min` |
| A notification fires when a **Claude** agent is blocked | `hooks.ts:405-406`, rationale at `:397-404` |

**The gap: non-Claude engines.** `status: 'blocked'` is a **renderer** determination —
`usePtyParser.ts:171-195` (BLOCK_HINTS regex on the terminal tail) and `useHive.ts:575` (an
approval-request IPC). Neither reaches main's `notify()` (`hooks.ts:420-431`). A Claude agent is
covered by its own `Notification` hook stream; a non-Claude agent on a floor with no Claude hook
stream produces no OS toast at all.

**Behaviour contract for the gap only:**

| Property | Value |
|----------|-------|
| Trigger | the **transition into** `status: 'blocked'`, once per transition |
| Not triggered by | repaints. `usePtyParser.ts:171` already early-returns when the agent is already `blocked` for exactly this reason (`#20`) — that guard is the de-dupe. Do not add a second one. |
| Not triggered for | providers whose blocked state already arrives via a hook `Notification` (Claude). Firing both is two toasts for one event. |
| Route | one IPC from the renderer's block transition to main, calling the **existing** `hooks.ts` `notify(agentId, name, reason)` |
| Do NOT build | main-side terminal parsing. That is VIGIL-03, Phase 4. `usePtyParser`'s "only the mounted terminal is parsed" limitation is out of scope here. |
| Gating | inherited from `notify()` — `getConfig().notifications` (`hooks.ts:422`). No new setting. |
| Click | inherited from `notify()` — already focuses the agent. Nothing to add. |

**Copy contract.** Match the existing toast shape exactly — title is the agent's bare name
(`hooks.ts:406`, `:343`), body a lowercase verb phrase completing it. Reuse the summaries the
renderer already computes at `usePtyParser.ts:180` / `:194`, which satisfy `DESIGN.md:646-651`
(agent's name, under 12 words, second person):

| Case | Title | Body |
|------|-------|------|
| God agent blocked | `{name}` | `is waiting on you` |
| Worker agent blocked | `{name}` | `is waiting on Michael` |

No exclamation mark — `DESIGN.md:653` reserves those for completions, and a block is not one. No
emoji (`DESIGN.md:654`).

**Platform honesty — required, not optional.** Electron 42 migrated macOS notifications from
`NSUserNotification` to `UNNotification`, which requires code signing to display. This project's
macOS signing is best-effort (`build/notarize.cjs` no-ops without `APPLE_*`). Under the Electron 43
bump landing in the same phase, an unsigned local macOS build may show **no toasts at all**.

Every FLOOR-14 sentence in docs or UI must carry a platform qualifier. Any FLOOR-14 doc sentence
without one is the defect. Use the established per-engine gap channel
(`shared/providerAutomation.ts:258-289` `providerCapabilities` / `capabilityLine`, already carrying
"NO MAIL" and "spend UNTRACKED") rather than minting a new warning surface — and watch ADR 0002's
prompt-cache invariant, flagged at `providerAutomation.ts:278`.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| — | none | not applicable — no component registry is used by this project |

No shadcn, no third-party registry, no new dependency of any kind is introduced by this UI contract.
Checked against `.planning/PROJECT.md`'s zero-recurring-cost constraint: every item above is $0 and
adds nothing to `package.json`.

---

## Known DESIGN.md Drift — NOT corrected by this phase

Real doc-vs-source contradictions, none of them one of the six requirements. Listed so the checker
reads them as scoped-out and the executor does not chase them. Only `:128`/`:129` are edited,
because they directly contradict `:706`, which criterion 4 grades against.

| Line | Doc says | Source says |
|------|----------|-------------|
| `:119-121` | UI face is Pixelify Sans, mono is VT323 | `tokens.css:56-57` — Inter and JetBrains Mono since v0.3.4 |
| `:131` | `body-md` is 16px | `tokens.css:65` — `--cth-text-body-md: 14px` |
| `:137` | *"All fonts ship in a single weight. Never bold."* | 24 `fontWeight` declarations, incl. 13× `600`, 4× `'bold'`, 2× `700` |
| `:140-141` | ALL-CAPS reserved for display fonts; UI fonts sentence case | `AgentCard.tsx:220` `.toUpperCase()` on a site Rule 1b moves to Inter |
| `:674` | Agent strip is 80px tall | `AgentStrip.tsx:257-258` — `height: 112`; `AgentCard.tsx:111` — card is 78 |

---

## What This Contract Deliberately Does NOT Specify

| Not specified | Why |
|---------------|-----|
| The focus ring | Already fixed at 2px / `ink-900` / 2px offset — `global.css:93-95` |
| Converting the two `<div role="button">` to `<button>` | Deliberate, documented, already-resolved decision — `AgentCard.tsx:137-143`, `FullscreenTerminal.tsx:598-601` |
| Retiring or replacing Press Start 2P | Rule 1 is size-only. Family conversion has no decision record in CONTEXT.md D-01…D-47 and `DESIGN.md:706` is a size rule. Rule 1b's two sites are the sole, reasoned exception. |
| Deleting the unused `--cth-text-display-lg` | Already above the floor; deleting an unused token is not one of the six requirements |
| A cost readout on the floor avatar | The avatar renders no text at all (`Character.ts` imports no `Text`); status is color + glyph + position per `DESIGN.md:708` |
| Duration on any rendering | No spawn timestamp on `Agent` (`store.ts:55-90`); a ticking value collides with FLOOR-11 |
| `sidebarWidth` resize clamp | Already live — `SidebarSplitter.tsx:35-37` + `App.tsx:222-226,448` |
| Left-truncating paths | Already live — `PathLine` at `CommandCenterPanel.tsx:1581-1595` |
| Any change to `terminalFontSize.ts` or xterm sizing | Out of the sweep by explicit carve-out |
| Changing `.toUpperCase()` on the agent name | Existing behaviour; casing is not one of the six requirements |
| Font weight anywhere | Not one of the six requirements; see the drift table |
| Any new component, color, spacing token, font or dependency beyond the one lilac chip | `DESIGN.md` is the contract; this phase corrects against it |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
