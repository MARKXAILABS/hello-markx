---
phase: 1
slug: finish-the-floor
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-20
---

# Phase 1 — UI Design Contract

> Visual and interaction contract for FLOOR-01, FLOOR-05, FLOOR-11, FLOOR-12, FLOOR-13, FLOOR-14
> — the six requirements behind ROADMAP.md Success Criterion 4.

**This is not a new-UI phase.** `DESIGN.md` is the design system and it already exists. This
document specifies *corrections* against it, precisely enough that an executor cannot invent
anything. No new visual language, no redesign, no new components, no new palette.

**Every current-state claim below carries a `file:line` read in this session.** Anything not
read is marked `UNVERIFIED`. Where a clause is already satisfied it says so and specifies
nothing — over-specifying working code is how an executor is led to rewrite it.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — `DESIGN.md` + `src/renderer/src/design/tokens.css` are the system |
| Preset | not applicable |
| Component library | in-house: `PixelPanel`, `PixelButton`, `PixelBadge`, `SpritePortrait`, `ContextBar`, `Sparkline` |
| Icon library | none — Unicode glyphs inline (`✎`, `⚠`, `▾`/`▸`) |
| Font | `--cth-font-display` Press Start 2P · `--cth-font-ui` Inter · `--cth-font-mono` JetBrains Mono (`tokens.css:55-57`) |

### shadcn gate — executed, resolved NO

`components.json`, `tailwind.config.*` and `postcss.config.*` are all absent (verified). Stack is
React + Vite + Electron, so the gate fires. **Resolved to N without asking**, because introducing
shadcn/Radix into a phase whose entire purpose is compliance against an existing pixel-art design
system is exactly the scope creep CONTEXT.md's phase boundary and the operator's stated preferences
forbid. Registry safety gate: not applicable. No third-party registry is declared.

---

## Spacing Scale

Existing, unchanged. `tokens.css:41-50`.

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

Exceptions for this phase: **none**. No spacing token is added, changed or removed.

---

## Typography

**Target state after this phase's FLOOR-12 token migration.** Every value clears the
`DESIGN.md:706` floor — *"never go below 14 px for any user-facing text"* (verified verbatim).

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

Two weights, per `DESIGN.md:136-137`: regular 400 and — where a control already ships it — 600.
No new weight is introduced by this phase.

---

## Color

Existing, unchanged. `tokens.css:3-38`, with the dark-theme mirror at `tokens.css:120+`.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--cth-cream-100` #FFF8E7 · `--cth-paper-200` #F0EAD2 | app ground, scroll surfaces |
| Secondary (30%) | `--cth-paper-100` #FCFAF0 · `--cth-cream-200` #F4E9C7 | cards, inputs, terminals, chips, section headers |
| Accent (10%) | the six agent hues: `--cth-coral` #D96A62 · `--cth-mint` #5CA97A · `--cth-sky` #4F9FAF · `--cth-lemon` #DCAB3C · `--cth-lilac` #9482D3 · `--cth-peach` #D99168 | see reserved-for list |
| Destructive | `--cth-coral` #D96A62 (= `--cth-status-blocked`) | destructive actions, blocked status, the auto-mode chip |

**Accent reserved for:** per-agent identity only — the card's selection frame, the portrait
background, the `BOSS` tag fill, and the `ContextBar` fill. Nothing else.

**This phase adds exactly one new accent use:** the FLOOR-01 auto-mode chip
(`--cth-coral-light` fill + `--cth-coral` 1px inset hairline). No other color is added,
changed or removed.

---

## Copywriting Contract

Governed by `DESIGN.md:630-657` (§14 Voice & copy): use the agent's name, never "the agent";
system feedback under 12 words; no emoji; exclamation marks only on completions and
notifications.

| Element | Copy |
|---------|------|
| FLOOR-01 chip label | `AUTO` |
| FLOOR-01 accessible name | `Auto mode — {name} runs with permissions bypassed` |
| FLOOR-01 hover title | `Auto mode: {name} acts without asking for tool approval.` |
| FLOOR-05 primary CTA | `open logs` (lowercase, matching the `change...` / `on` / `off` sibling buttons at `SettingsModal.tsx:893,915`) |
| FLOOR-05 section label | `Log folder` |
| FLOOR-05 accessible name | `Open the log folder` |
| FLOOR-05 error state | `Could not open the log folder. The path is {path} — open it yourself.` |
| FLOOR-14 notification title | `{name}` (matches `hooks.ts:406` and `hooks.ts:343`) |
| FLOOR-14 notification body | `is waiting on you` (god) · `is waiting on Michael` (worker) |
| Empty state — Settings log path unknown | `—` (the existing `SettingsModal.tsx:892` convention for an unknown path) |

**Destructive actions in this phase: none.** No confirmation copy is required. The auto-mode chip
is an *indicator*, not a control — it must not be clickable.

---

## Per-Requirement Contracts

### FLOOR-01 — auto mode is visible on the agent card

**Current state.** `grep -c autoMode src/renderer/src/components/AgentCard.tsx` → **0** (verified
this session). `autoMode` appears only in `App.tsx:285`, `AddAgentModal.tsx:933`,
`OnboardingWizard.tsx:100-627`, `SettingsModal.tsx:190-1128`, `realtime/actions.ts:363`,
`realtime/tools.ts:277`. The card is silent.

**What "bypassed" actually means — read this before implementing.** `config.autoMode` is a single
**global** toggle. `src/renderer/src/store/config.ts:427` appends the provider's own flag at spawn:
`if (config.autoMode && preset.autoFlag) cmd = ${cmd} ${preset.autoFlag}`. Two consequences the
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
| Fill | `var(--cth-coral-light)` |
| Border | `inset 0 0 0 1px var(--cth-coral)` |
| Text color | `var(--cth-ink-900)` |
| Font | `var(--cth-font-ui)` at `var(--cth-text-body-md)` / `var(--cth-lh-body-md)` |
| Interaction | **none.** Not focusable, not clickable, no `role="button"` |

It is filled+outlined rather than solid accent so it cannot be mistaken for the `PixelBadge`
status chip sitting beside it — `DESIGN.md:708` requires status to read from color **+** icon **+**
position, never color alone, and a second solid coral pill in the same row would break that.

It uses the UI face at 14px, **not** the display face at 7px like `BOSS`. `BOSS`
(`AgentCard.tsx:228`, `fontSize: 7`) is itself a FLOOR-12 violation and is fixed in the same sweep;
the two chips must end up on the same scale.

**Accessible name — this is the part that is easy to ship broken.** `AgentCard.tsx:155` sets
`aria-label={`${name}${isGod ? ' (boss)' : ''} — ${status}`}` on the card root, and
`FullscreenTerminal.tsx:622` sets `aria-label={`${agent.name} · ${agent.project}`}` on the roster
row. An `aria-label` on the container **replaces** all inner text for a screen reader. A chip added
inside either one is visually present and completely inaudible.

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
`Home folder` row (`SettingsModal.tsx:880-894`) and above the divider at `:897`. It is the same
"where your data lives" topic and reuses that row's markup verbatim:

- Section label: `Log folder`, in the established uppercase display-face header style
  (`SettingsModal.tsx:882-886` — note that pattern's `fontSize: 8` is a FLOOR-12 violation and is
  fixed by the same sweep; the new row must be written at the corrected size, not copied at 8px).
- Path: `<span>` in `var(--cth-font-mono)`, `wordBreak: 'break-all'`, color `--cth-ink-900`,
  showing the `path` the handler returns. Before first invocation there is no path to show — render
  `—`, matching `SettingsModal.tsx:892`.
- Action: `<PixelButton variant="secondary" size="sm">open logs</PixelButton>`. `PixelButton`
  renders real button text, so no `aria-label` is needed; adding one would override the visible
  label and is forbidden here.
- Error: on `{ok:false}`, render the error copy from the Copywriting Contract inline below the row
  in `--cth-coral`. Do not open a modal, do not toast — Settings errors in this app are inline
  (`SettingsModal.tsx:696` `setChangeErr`).

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

**Gap, with one correction to upstream research.** `useHiveTasks` / `refreshHiveTasks` have
**zero callers** — verified: `grep -rn "useHiveTasks\|refreshHiveTasks" src/ test/` excluding the
hook's own file returns nothing.

> **CORRECTION.** Issue #20, CONTEXT.md and RESEARCH.md all say **four** pollers. There are
> **five** independent 5-second `window.cth.hiveTasks()` timers, verified this session:
> `AgentStrip.tsx:81` (`setInterval` at `:93`), `AskMeTab.tsx:55` (`:60`),
> `TaskDetailOverlay.tsx:26` (`:32`), `TasksKanban.tsx:128` (`:145`), and
> **`scene/office/OfficeFloor.tsx:1362`** (`setInterval(pollTaskBoard, 5000)` at `:1425`).
> The fifth was missed because it lives under `scene/`, not `components/`.

UI-visible contract: **none.** Migrating a poller must produce **no** change in rendered output.
Any visual difference after migration is a regression, not an improvement. The hook returns
`unknown` deliberately (its own header explains why) — do not unify the four/five parsers into a
shared typed shape.

---

### FLOOR-12 — accessible names and the 14px floor

**Already satisfied, specify nothing:**
- **The focus ring.** `global.css:93-95` — `outline: 2px solid var(--cth-ink-900); outline-offset: 2px`,
  with the rationale at `:85-92`. Issue #26's "1px focus ring at 3.4:1" is closed. Do not re-specify.
- **`role="button"` nested inside `<button>`.** Issue #26 cites `CommandCenterPanel.tsx:1555`. Verified
  gone — `grep -rn 'role="button"' src/renderer/src` returns exactly two hits, both standalone.

#### The two surviving `<div role="button">` — decision: **they stay**

`AgentCard.tsx:145` and `FullscreenTerminal.tsx:604`. Each carries an inline comment
(`AgentCard.tsx:137-143`, `FullscreenTerminal.tsx:598-601`) explaining that the element wraps
multiple independent interactive children, that interactive content inside a `<button>` is invalid
HTML — the parser closes the outer button early and screen readers flatten the group into one
unusable control — and that `role` + `tabIndex={0}` + an `Enter`/`Space` handler that bails on
`e.target !== e.currentTarget` restores the keyboard behaviour. `.planning/codebase/CONCERNS.md`
records these as resolved history, not debt.

**Contract: leave both exactly as they are.** A task that converts them to native `<button>` is
regressing a deliberate, documented decision. What they *do* owe FLOOR-12 is an accessible name —
`AgentCard.tsx:155` and `FullscreenTerminal.tsx:622` already have one, and per FLOOR-01 above both
must be extended to carry the auto-mode state.

#### Accessible names — the rule, not the ratio

Measured: **49** `aria-label` occurrences against **133** `<button` occurrences in
`src/renderer/src` (verified; the audit baseline was 27/128).

That ratio is **not the bar**, and a test asserting on it would be wrong. A `<button>` with visible
text content already has an accessible name; adding `aria-label` to it *overrides* the visible label
and makes the UI worse for voice-control users.

**The rule:** every `<button>` must have an accessible name.
- Button has visible text content → **already named. Do not add `aria-label`.**
- Button's only content is an icon, glyph or symbol (`✎`, `⚠`, `▾`, `▸`, `×`, an SVG) →
  **`aria-label` is required**, phrased as verb + object naming the agent where one is in scope
  (`FullscreenTerminal.tsx:665` `aria-label={`Edit note for ${agent.name}`}` is the house pattern —
  copy it).
- Decorative glyphs that are not controls → `aria-hidden="true"`.

The repo-fact test must assert **icon-only buttons have `aria-label`**, not a count or a ratio.

#### Token migration table

Every below-floor token, its current value, its new value, its verified consumers, and what
happens to layouts relying on it. `tokens.css:61-68` and `tokens.css:70-77`.

| Token | Current | New | Verified consumers | Layout consequence |
|-------|---------|-----|--------------------|--------------------|
| `--cth-text-display-sm` | **8px** | **DELETE the token** | `AgentCard.tsx:220` (the agent NAME on the card) · `ThreadsPanel.tsx:101` (thread title button) | Both consumers are user-facing *reading* text, so both must clear 14px. Bumping the token to 14px is the wrong fix: Press Start 2P at 14px is roughly 1.75× its 8px width and would reflow every card in the 80px strip (`DESIGN.md:673`). Instead **migrate both consumers to `var(--cth-text-body-md)` / `var(--cth-lh-body-md)` (14px/20px Inter)** and delete the token so it cannot be reintroduced below floor. This is consistent with `tokens.css:52-54`'s own v0.3.4 note: *"Press Start 2P stays as the BRAND face for small caps labels; everything the user actually reads is Inter."* Both consumers already have `whiteSpace:'nowrap'` + `textOverflow:'ellipsis'`, so a wider name truncates rather than wraps. |
| `--cth-lh-display-sm` | 12px | **DELETE** | none outside the two sites above | Deleted with its size token. |
| `--cth-text-display-md` | **12px** | **14px** | `PixelPanel.tsx:67` (panel title) | Only consumer. `--cth-lh-display-md: 20px` stays — 14/20 is a 1.43 ratio, still an integer px per `DESIGN.md:144-150`. Panel titles grow ~17%; `PixelPanel` headers are auto-height. Low risk. |
| `--cth-text-body-sm` | **13px** | **14px** | `PixelBadge.tsx:63` · `PixelButton.tsx:102` (the `sm`/`md` button label) | `--cth-lh-body-sm: 18px` stays. +1px on auto-width badges and buttons. This value **restores what `DESIGN.md:131` already specifies** (`body-sm` = 14/18) — it is a correction, not a change. Low risk. |
| `--cth-text-mono-sm` | **13px** | **14px** | **zero** (verified: `grep -rn "text-mono-sm" src/renderer/src` returns only the definition) | Zero risk. Terminal/xterm sizing is owned separately by `components/terminalFontSize.ts` and is **not** driven by this token — do not touch it. Also restores `DESIGN.md:132` (`mono-sm` = 14/18). |

#### ⚠ Scope finding the planner must see: 594 hardcoded sub-14px `fontSize` literals

RESEARCH.md scopes the token half as *"four lines in one uncontended file."* That is true of the
tokens — and it does not close the criterion. Measured this session across
`src/renderer/src/**/*.tsx`:

| Literal | Occurrences |
|---------|-------------|
| `fontSize: 7` | 5 |
| `fontSize: 8` | 57 |
| `fontSize: 9` | 20 |
| `fontSize: 10` | 49 |
| `fontSize: 11` | 133 |
| `fontSize: 12` | 258 |
| `fontSize: 13` | 72 |
| **Total** | **594, across 60 files** |

Plus two Pixi canvas labels at `scene/office/ThoughtBubble.ts:22` and `ToolBubble.ts:29`
(`FONT_SIZE = 12`), and one computed floor at `FullscreenTerminal.tsx:694`
(`fontSize: Math.max(9, scale.name - 3)`).

These bypass the token layer entirely, so the four-token migration alone leaves criterion 4's
*"no user-facing text sits below the 14px floor"* false. This is the measured cost of a criterion
already in the roadmap, not new scope. Flagged here so the planner sizes FLOOR-12 against the real
surface rather than four lines.

**Sweep rule** (mechanical, bounded, so it cannot balloon into per-site redesign):

1. `fontSize: 10 | 11 | 12 | 13` on **text** → `var(--cth-text-body-md)` (14px), paired line-height
   `var(--cth-lh-body-md)`.
2. `fontSize: 7 | 8 | 9` alongside `fontFamily: 'var(--cth-font-display)'` (the uppercase
   section-header pattern, e.g. `SettingsModal.tsx:882`, `CommandCenterPanel.tsx:1607`) →
   `var(--cth-text-display-md)` (14px) / `var(--cth-lh-display-md)`.
3. `fontSize: 7 | 8 | 9` on non-display text → `var(--cth-text-body-md)`.
4. **Exemption:** `fontSize` used to size an icon or symbol glyph rather than words (`▾`, `▸`, `⚠`,
   `×`, `•`) is a graphic, not text — `DESIGN.md:706` governs text. Such glyphs are exempt **only if**
   they carry `aria-hidden="true"` or sit inside a control that already has an accessible name.
   Every exemption must be visible as one of those two markers in the diff, so the repo-fact test
   can distinguish it from an oversight.
5. **Do not** change `components/terminalFontSize.ts` — xterm sizing is out of this rule.

#### DESIGN.md's own internal contradiction — resolve it in this phase

`DESIGN.md:127` specifies `display-md` at **12px** and `:128` specifies `display-sm` at **8px**,
while `:706` in the same file says *"never go below 14 px for any user-facing text."* The file
contradicts itself, and the phase's premise is that every claim the project makes about itself is
true. `:706` is the clause the roadmap grades against, so it wins.

Required edits to `DESIGN.md` §4.1: set `display-md` to 14/20, remove the `display-sm` row, and set
`body-sm` and `mono-sm` to the 14px values §4.1 *already* states so the table matches
`tokens.css` after migration.

*(Out of scope, deliberately not specified: `DESIGN.md:117-119` still names Pixelify Sans and VT323
as the UI and mono faces, which `tokens.css:52-57` replaced with Inter and JetBrains Mono in v0.3.4;
and `DESIGN.md:137` "Never bold" is contradicted by 24 `fontWeight` sites. Both are real doc drift,
neither is one of this phase's six requirements. Noted so the checker does not flag them and the
executor does not chase them.)*

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
only Pixi `Text` in the scene is `ThoughtBubble.ts:81` and `ToolBubble.ts:75`, which are transient
speech bubbles, not an agent field set. The avatar communicates identity by sprite and state by
status glyph and position, which is exactly what `DESIGN.md:708` prescribes.

**Contract: the avatar carries no field set and gains none.** A `$0.42` readout on a 32px sprite is
not legibility, it is clutter. Record this exception in the plan so the checker reads it as
intentional.

The agreement contract therefore binds **the three text renderings**.

#### `none shows cost` is stale — verified

Issue #39 says *"None shows cost."* All three text renderings already show it:

| Rendering | Cost render |
|-----------|-------------|
| Agent card | `AgentCard.tsx:256-265` — `${usd.toFixed(2)}`, hidden when 0, `title="Estimated spend so far: …"` |
| Fullscreen roster row | `FullscreenTerminal.tsx:711-718` — same shape, fed from `useFleetTelemetry()` at `:85` via `samples[a.id]?.usd` (`:340`, `:377`) |
| Command-centre row | `CommandCenterPanel.tsx:743-747` — same shape, from `useFleetTelemetry()` at `:367` |

**Specify nothing for the cost clause.** It is satisfied. The plan's FLOOR-13 task is to *verify and
paste this*, not to build it. RESEARCH.md's "hard dependency on D-22's `hive:tasks` widening" applies
to the **budget/cap meter** (FLOOR-10), not to this `$x.xx` display, which rides `useFleetTelemetry`
and is already live.

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
`shortModel(agent.model) ?? 'CLI default'`, in the existing context line
(`AgentCard.tsx:243-252`), `flexShrink: 0`, before the cost span, with the full model id in the
row's `title`.

**Deliberately excluded: duration.** Issue #39's *Fix* line suggests adding it. Verified there is no
spawn/start timestamp on the store's `Agent` shape (`store.ts:55-90`), so duration means new durable
state **plus** a per-second re-render of every roster row — which is a direct collision with
FLOOR-11's *"a PTY byte does not re-render the roster"* landing in the same phase. The graded clause
in ROADMAP.md criterion 4 is *"agree on what they show, cost included"* — cost, not duration. Do not
build it. Recorded here so the checker reads the omission as a decision.

#### Sidebar collapse — two of three clauses are already satisfied

> **CORRECTION — verified against source.** Both CONTEXT.md's framing and RESEARCH.md's
> *"nothing re-clamps on window resize"* are **stale**.

- *`sidebarWidth` clamped only while dragging* — **already satisfied.**
  `components/SidebarSplitter.tsx:34-36` is a `useEffect` on `[width, clampMax, onChange]` that
  calls `onChange(clampMax)` whenever `width > clampMax`, where
  `clampMax = Math.min(max, Math.max(min, viewportWidth - 360))` (`:24`). Its own comment at
  `:27-33` says *"Re-clamp when the WINDOW changes, not only while dragging"* and describes the exact
  stranding bug issue #38 reports. It is live: `App.tsx:222-226` tracks `window.innerWidth` into
  `vpWidth`, passed as `viewportWidth` at `App.tsx:448`. The store's own clamp
  (`store.ts:865`, `[320, 1200]`) is the absolute-bounds half, deliberately viewport-blind.
  **Specify nothing. Do not add a second resize listener.**
- *Long cwds wrap to four lines / truncate paths from the left* — **already satisfied.**
  `CommandCenterPanel.tsx:1581-1595` `PathLine` does `…${path.slice(-(MAX-1))}` with `MAX = 46`,
  plus `whiteSpace:'nowrap'` + `textOverflow:'ellipsis'`, and its comment explains the two work
  together so a path can never wrap. Used at `:751`, `:1038`, `:1333`.
  `FullscreenTerminal.tsx:865-869` clips its raw `agent.cwd` with `nowrap` + `ellipsis` +
  `maxWidth: 300`. **Specify nothing.**

**The one genuine gap: responsive collapse.** `DESIGN.md:676` promises *"Right panel collapses below
1024 to bottom drawer."* Verified: `grep -rn "@media" src/renderer/src` returns exactly one hit,
`global.css:151`, and it is `prefers-reduced-motion`. There is no breakpoint, no drawer, no `1024`
anywhere in the renderer.

Contract — the minimum that makes the claim true, and **not** a bottom-drawer build:

- At viewport width < 1024px, the sidebar collapses to hidden and the floor canvas takes the full
  width. A single persistent toggle re-opens it as an overlay above the canvas at
  `z-index: 2` (`DESIGN.md:683`, the drawer/sidebar layer).
- Toggle: `<PixelButton variant="secondary" size="sm">` labelled `panel`, with
  `aria-expanded` reflecting state. It is the only new control this requirement adds.
- The collapse is driven off the `vpWidth` state **already tracked** at `App.tsx:222-226`.
  Do not add a `matchMedia` listener or a CSS breakpoint — a second source of viewport truth is how
  this drifts.
- `SidebarSplitter` is hidden while collapsed (there is nothing to drag) and its clamp effect is
  untouched.
- Below 1024, `sidebarWidth` for the overlay is `Math.min(sidebarWidth, vpWidth - 48)` so the
  overlay never exceeds the window. It must **not** write that value back through
  `setSidebarWidth` — persisting a small-window width would strand the user's chosen width on the
  next large-window boot, which is the exact class of bug `SidebarSplitter.tsx:27-33` was written
  to kill.

**If the plan chooses not to build this**, then `DESIGN.md:676` is a doc promising a code path that
does not run — banned by ROADMAP.md criterion 1 — and the line must be deleted instead. Build it or
delete the claim. There is no third option.

---

### FLOOR-14 — notification on blocked or long task

**Already satisfied, specify nothing** (three of four clauses):

| Clause | Evidence |
|--------|----------|
| Clicking the toast focuses that agent | `hooks.ts:425` — `n.on('click', () => this.focus?.(agentId))`, wired at `index.ts:468` |
| A notification fires on a long task | `hooks.ts:343` — `if (turnMs >= LONG_TURN_MS) this.notify(...)`, body `finished after N min` |
| A notification fires when a **Claude** agent is blocked | `hooks.ts:405-407`, with the `#42` rationale at `:397-404` |

**The gap: non-Claude engines.** `status: 'blocked'` is a **renderer** determination —
`usePtyParser.ts:171-195` (BLOCK_HINTS regex on the terminal tail) and `useHive.ts:575` (an
approval-request IPC). Neither reaches main's `notify()` (`hooks.ts:420-431`). A Claude agent is
covered by its own `Notification` hook stream; a non-Claude agent on a floor with no Claude hook
stream produces no OS toast at all.

**Behaviour contract for the gap only:**

| Property | Value |
|----------|-------|
| Trigger | the **transition into** `status: 'blocked'`, once per transition |
| Not triggered by | repaints. `usePtyParser.ts:171` already early-returns when `self?.status === 'blocked'` for exactly this reason (`#20`) — that guard is the de-dupe. Do not add a second one. |
| Not triggered for | providers whose blocked state already arrives via a hook `Notification` (Claude). Firing both is two toasts for one event. |
| Route | one IPC from the renderer's block transition to main, calling the **existing** `hooks.ts` `notify(agentId, name, reason)` |
| Do NOT build | main-side terminal parsing. That is VIGIL-03, Phase 4. `usePtyParser`'s "only the mounted terminal is parsed" limitation is out of scope here. |
| Gating | inherited from `notify()` — `getConfig().notifications` (`hooks.ts:422`). No new setting. |
| Click | inherited from `notify()` — already focuses the agent. Nothing to add. |

**Copy contract.** Match the existing toast shape exactly — title is the agent's bare name
(`hooks.ts:406`, `:343`), body is a lowercase verb phrase completing it. Reuse the summaries the
renderer already computes at `usePtyParser.ts:180` / `:194`, which `DESIGN.md:646-651` already
satisfies (agent's name, under 12 words, second person):

| Case | Title | Body |
|------|-------|------|
| God agent blocked | `{name}` | `is waiting on you` |
| Worker agent blocked | `{name}` | `is waiting on Michael` |

No exclamation mark — `DESIGN.md:655` reserves those for completions, and a block is not one. No
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
This is checked against `.planning/PROJECT.md`'s zero-recurring-cost constraint: every item above is
$0 and adds nothing to `package.json`.

---

## What This Contract Deliberately Does NOT Specify

Recorded so the checker reads these as decisions and the executor does not chase them.

| Not specified | Why |
|---------------|-----|
| The focus ring | Already fixed at 2px / `ink-900` / 2px offset — `global.css:93-95` |
| Converting the two `<div role="button">` to `<button>` | Deliberate, documented, already-resolved decision — `AgentCard.tsx:137-143`, `FullscreenTerminal.tsx:598-601` |
| A cost readout on the floor avatar | The avatar renders no text at all (`Character.ts` imports no `Text`); status is color + glyph + position per `DESIGN.md:708` |
| Duration on any rendering | No spawn timestamp exists on `Agent` (`store.ts:55-90`); a ticking value collides with FLOOR-11 |
| `sidebarWidth` resize clamp | Already live — `SidebarSplitter.tsx:34-36` + `App.tsx:222-226,448` |
| Left-truncating paths | Already live — `PathLine` at `CommandCenterPanel.tsx:1581-1595` |
| Any change to `terminalFontSize.ts` or xterm sizing | Out of the FLOOR-12 rule by explicit carve-out |
| The Pixelify Sans / VT323 and "never bold" drift in DESIGN.md | Real doc drift, not one of this phase's six requirements |
| Any new component, color, spacing token, font or dependency | `DESIGN.md` is the contract; this phase corrects against it |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
