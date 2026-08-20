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

Two weights, per `DESIGN.md:137`: regular 400 and — where a control already ships it — 600. No new
weight is introduced by this phase.

**Decision: the effective scale collapses to two sizes, 16px and 14px.** Post-migration, hierarchy
is carried by family (Press Start 2P vs Inter vs JetBrains Mono), colour (`ink-900` / `ink-700` /
`ink-500`) and chip treatment — not by size. That is not an accident of the floor; it is what
`DESIGN.md:137` already prescribes (*"use color … or a chip/badge"* for emphasis) and it is
recorded here as a deliberate outcome rather than left to be discovered mid-sweep.

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

**Why lilac and not coral.** The first draft of this contract used coral. That was wrong:
`tokens.css:34` defines `--cth-status-blocked: #D96A62`, which *is* `--cth-coral`, and
`PixelBadge.tsx:25` renders `blocked` in that exact token under the label `needs you`
(`PixelBadge.tsx:41`). The AUTO chip sits in the same row as that badge (`AgentCard.tsx:216-238`),
so a coral AUTO chip would be the same hue as the one status it must never be confused with.
Lilac is the only accent hue in the six not bound to a status token — `sky`=thinking, `lemon`=working,
`coral`=blocked, `mint`=success, and `peach` sits beside `--cth-status-looping` #D6903F. Its
nearest status neighbour, `--cth-status-compacting` #8F7CC7, renders as a **solid** badge fill
reading `compacting`; AUTO is a **light fill with a hairline** reading `AUTO`, in a different
position. Per `DESIGN.md:708` (*"color + icon + position … Never color alone"*), the pair is
distinguishable on fill treatment, label and position, not on hue alone.

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
| FLOOR-13 sidebar toggle label | `hide panel` when the panel is open · `show panel` when collapsed |
| FLOOR-13 sidebar toggle accessible name | the visible label is the accessible name — do **not** add `aria-label`. State is carried by `aria-expanded` |
| FLOOR-14 notification title | `{name}` (matches `hooks.ts:406` and `hooks.ts:343`) |
| FLOOR-14 notification body | `is waiting on you` (god) · `is waiting on Michael` (worker) |
| Empty state — Settings log path unknown | `—` (the existing `SettingsModal.tsx:892` convention) |

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
| Fill | `var(--cth-lilac-light)` |
| Border | `inset 0 0 0 1px var(--cth-lilac)` |
| Text color | `var(--cth-ink-900)` |
| Font | `var(--cth-font-ui)` at `var(--cth-text-body-md)` / `var(--cth-lh-body-md)` |
| Interaction | **none.** Not focusable, not clickable, no `role="button"` |

It is filled+outlined rather than solid accent so it cannot be mistaken for the `PixelBadge` status
chip sitting beside it — `DESIGN.md:708` requires status to read from color **+** icon **+**
position, never color alone, and a second solid pill in the same row would break that.

**AUTO and BOSS land on the same face and the same size — intentionally.** `BOSS`
(`AgentCard.tsx:227-231`) is currently Press Start 2P at `fontSize: 7`. Under FLOOR-12 sweep rule 2
below, every sub-14px display-face site converts to `var(--cth-font-ui)` at
`var(--cth-text-body-md)`. `BOSS` is one of them. So both chips end up Inter 14px, differing only
in fill treatment (`BOSS` solid accent, `AUTO` light fill + hairline) and label. Two adjacent chips
on one face is the intent, not an oversight.

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

- Section label: `Log folder`, in the established uppercase section-header style
  (`SettingsModal.tsx:882-886` — note that pattern's display face at `fontSize: 8` is a FLOOR-12
  violation fixed by the same sweep; the new row must be written at the corrected face and size,
  not copied at 8px).
- Path: `<span>` in `var(--cth-font-mono)`, `wordBreak: 'break-all'`, color `--cth-ink-900`,
  showing the `path` the handler returns. Before first invocation there is no path — render `—`,
  matching `SettingsModal.tsx:892`.
- Action: `<PixelButton variant="secondary" size="sm">open logs</PixelButton>`. `PixelButton`
  renders real button text, so no `aria-label` is needed; adding one would override the visible
  label and is forbidden here.
- Error: on `{ok:false}`, render the error copy inline below the row in `--cth-coral`. Do not open
  a modal, do not toast — Settings errors in this app are inline (`SettingsModal.tsx:696`
  `setChangeErr`).

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

**Gap, with a correction to upstream research.** `useHiveTasks` and `refreshHiveTasks` are exported
at `hooks/useHiveTasks.ts:43` and `:39` and have **zero callers** — verified:
`grep -rn "useHiveTasks\|refreshHiveTasks" src/ test/` excluding the hook's own file returns
nothing.

> **CORRECTION (revised).** Issue #20, CONTEXT.md and RESEARCH.md all say **four** pollers on one
> file. The first draft of this spec corrected that to five and was still short. Verified count of
> `window.cth.hiveTasks()` call sites excluding the hook's own file: **10 sites across 7 files.**
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
  with the rationale at `:85-92`. Issue #26's "1px focus ring at 3.4:1" is closed.
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
`src/renderer/src` (verified; the audit baseline was 27/128).

That ratio is **not the bar**, and a test asserting on it would be wrong. A `<button>` with visible
text content already has an accessible name; adding `aria-label` to it *overrides* the visible label
and makes the UI worse for voice-control users.

**The rule:** every `<button>` must have an accessible name.
- Button has visible text content → **already named. Do not add `aria-label`.**
- Button's only content is an icon, glyph or symbol → **`aria-label` is required**, phrased as
  verb + object naming the agent where one is in scope (`FullscreenTerminal.tsx:665`
  `aria-label={`Edit note for ${agent.name}`}` is the house pattern — copy it).
- Decorative glyphs that are not controls → `aria-hidden="true"` (see the exempt set below).

The repo-fact test must assert **icon-only buttons have `aria-label`**, not a count or a ratio.

---

#### The text-size sweep

##### Measurement — pinned command, reproducible

RESEARCH.md scopes the token half as *"four lines in one uncontended file."* True of the tokens —
and it does not close the criterion. Sub-14px sizes are set almost entirely by hardcoded literals
that bypass the token layer.

```bash
grep -rhoE "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" \
  src/renderer/src --include=*.tsx --include=*.ts | wc -l    # → 604
grep -rlE  "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" \
  src/renderer/src --include=*.tsx --include=*.ts | wc -l    # → 61
```

| Literal | 7 | 8 | 9 | 10 | 11 | 12 | 13 | total |
|---------|---|---|---|----|----|----|----|-------|
| Sites | 5 | 57 | 20 | 49 | 133 | 264 | 76 | **604** across **61 files** |

> **Precision note.** The first draft of this spec reported 594/60 from a narrower `.tsx`-only
> regex. The UI checker measured 607/60 and 610/62 with two other regexes. The count moves ±6 with
> regex shape (whether `.ts` is included, whether `fontSize={n}` and end-of-line matches count).
> The command above is the one this contract and the repo-fact test both use; where a number
> appears below, it came from that command. Do not re-derive with a different regex.

Plus three non-literal sites: two Pixi canvas labels (`scene/office/ThoughtBubble.ts:22`,
`scene/office/ToolBubble.ts:29`, both `FONT_SIZE = 12`) and one computed floor
(`FullscreenTerminal.tsx:694`, `fontSize: Math.max(9, scale.name - 3)`).

This is the measured cost of a criterion already in the roadmap, not new scope. Stated so the
planner sizes FLOOR-12 against the real surface rather than four lines.

##### Sweep rules — mechanical, no judgement at the site

Every site falls into exactly one rule. Rules are checked in order.

**Rule 0 — exempt (decidable, enumerated below).** If the site is on the frozen exempt list, size
is unchanged and the element gains `aria-hidden="true"`. Stop.

**Rule 1 — display face, any sub-14 size → convert the family.**
Condition: the style object sets `fontFamily: 'var(--cth-font-display)'` **and** a `fontSize` of
7–13.
Action: `fontFamily` → `var(--cth-font-ui)`, `fontSize` → `var(--cth-text-body-md)`,
`lineHeight` → `var(--cth-lh-body-md)`.

Measured surface: **130 of the 134** `--cth-font-display` references in the renderer sit below the
floor — 79 at 7–9px, 51 at 10–13px. The 51 at 10–13px are the hole the first draft left: the old
rule 1 changed size but not family, which would have produced Press Start 2P at 14px — the exact
outcome the `display-sm` row of the migration table rejects. Verified example,
`src/renderer/src/App.tsx:469`:
`fontFamily: 'var(--cth-font-display)', fontSize: 10, lineHeight: '14px',`.

**Press Start 2P is therefore retired from every sub-14px slot.** It survives only where it is
already at or above the floor: `--cth-text-display-lg` (16px) and `--cth-text-display-md` (14px
after migration, sole consumer `PixelPanel.tsx:67`). This is the same reasoning the `display-sm`
row applies, extended to every display-face site instead of two, and it is consistent with
`tokens.css:52-54`'s own v0.3.4 note: *"Press Start 2P stays as the BRAND face for small caps
labels; everything the user actually reads is Inter."*

**Rule 2 — non-display text, sub-14 size → raise the size.**
Condition: a `fontSize` of 7–13 with no `--cth-font-display` in the same style object.
Action: `fontSize` → `var(--cth-text-body-md)` (or `var(--cth-text-mono-md)` where the object sets
`fontFamily: 'var(--cth-font-mono)'`), `lineHeight` → the matching `--cth-lh-*` token.

**Rule 3 — the three non-literal sites.** `ThoughtBubble.ts:22` and `ToolBubble.ts:29` →
`FONT_SIZE = 14`. `FullscreenTerminal.tsx:694` → `Math.max(14, scale.name - 3)`.

**Out of the sweep entirely:** `components/terminalFontSize.ts` and anything xterm. Terminal
sizing is user-controlled and is not governed by `DESIGN.md:706`.

##### Rule 0's exempt set — decidable predicate, fully enumerated

The first draft's exempt rule (*"an icon or symbol glyph rather than words"*, five illustrative
examples) was a fuzzy judgement applied 600 times. Replaced with a predicate that is decidable
without reading intent:

> **Exempt iff the styled element's entire JSX child expression is a single character outside
> `[A-Za-z0-9]`** — either a literal (`>✕<`) or a two-branch ternary of single such characters
> (`{open ? '▾' : '▸'}`). Anything else, including a glyph followed by a space or a word, is text.

Enumerate with:

```bash
export LC_ALL=C.UTF-8
grep -rnP ">\s*([^A-Za-z0-9\s<>{}]|\{[a-zA-Z]+ \? '[^A-Za-z0-9]' : '[^A-Za-z0-9]'\})\s*<" \
  src/renderer/src --include=*.tsx
```

Measured: **38** glyph-only elements exist in the renderer. **21** of them sit inside a style block
that sets a sub-14px `fontSize`. **Those 21 are the entire exempt set.** The other 17 carry no
sub-14px size and need no action. The glyph vocabulary is `✕`(9) `•`(3) `·`(3) `/`(3) `✎`(2)
`✓` `⚠` `└` `−` `⇄` `—` `?` `.` `+` `%`, plus 6 ternary chevron/check expressions.

The executor pastes the 21-line enumeration into the plan and the repo-fact test freezes it as an
allowlist. **A site not on that list is not exempt.** There is no per-site judgement.

Each of the 21 gains `aria-hidden="true"`. The renderer carries 12 `aria-hidden` occurrences today,
so this adds roughly 21 markers.

**Sites to convert: 604 − 21 = 583**, plus the 3 non-literal sites, plus the 4 tokens.

##### Containment — what happens when a bumped site breaks a fixed container

Rules 1 and 2 pair the line-height token, so a 10/14 site becomes 14/20: **+6px per line**. The
verified fixed-height chrome:

| Container | Anchor | Value |
|-----------|--------|-------|
| Agent strip | `AgentStrip.tsx:257-258` | `height: 112, minHeight: 112` |
| Agent card | `AgentCard.tsx:111` | `const height = 78` |
| Card chip leading | `AgentCard.tsx:228`, `:262`, `:270` | `lineHeight: '11px'` / `'13px'` / `'13px'` |
| Strip note clamp | `AgentStrip.tsx:303` | `maxHeight: 84` |

**Width first — most sites get narrower, not wider.** Press Start 2P is monospaced at ~1em per
character; Inter uppercase averages ~0.6em. A 10px display-face label (10px/char) becomes 14px
Inter (~8.4px/char) — roughly 16% **narrower**. At 12px display-face the saving is ~30%. All 130
rule-1 sites shrink horizontally. Only rule-2 sites grow (10→14px is +40% width), and those are
predominantly in `SettingsModal`, `AddAgentModal`, `OnboardingWizard` and `CommandCenterPanel` —
scrolling, auto-height panels, not fixed chrome.

**When a bumped site overflows fixed chrome, the executor does exactly one of these, in order:**

1. **Nothing.** The card's name, info line, cost span and account chip already carry
   `whiteSpace:'nowrap'` + `overflow:'hidden'` + `textOverflow:'ellipsis'`
   (`AgentCard.tsx:223-224`, `:249-251`, and the strip clamp at `:303`). Horizontal growth
   truncates by design. This is the default and covers the majority.
2. **Raise the container's integer by the measured delta, and change nothing else.**
   `AgentStrip.tsx:257-258` and `AgentCard.tsx:111` are three numbers. Vertical growth is absorbed
   by editing those numbers, not by re-laying out the card.
3. **Stop and report** in the plan's task notes with the file:line and the measured overflow.

**Explicitly forbidden:** reflowing a card, moving a field, dropping a field, collapsing a row, or
holding any site below 14px to make room. If the answer looks like "redesign it," it is option 3.

*(Note: `DESIGN.md:674` documents the strip as 80px tall. Source says 112 with a 78px card. The
doc is stale. Containment uses the source values; correcting `DESIGN.md:674` is not one of the six
requirements and is not specified here.)*

##### Completeness bar — what makes criterion 4 TRUE

Criterion 4's clause is *"no user-facing text sits below the 14px floor DESIGN.md states."* It is
TRUE for this phase when **all four** hold:

1. `src/renderer/src/design/tokens.css` declares no `--cth-text-*` value below 14px, and
   `--cth-text-display-sm` / `--cth-lh-display-sm` are gone.
2. The pinned measurement command over `src/renderer/src/**/*.{ts,tsx}` returns **only** sites on
   the frozen 21-item exempt allowlist.
3. Each of the 21 allowlisted sites carries `aria-hidden="true"`.
4. The 3 non-literal sites (`ThoughtBubble.ts:22`, `ToolBubble.ts:29`, `FullscreenTerminal.tsx:694`)
   are at or above 14.

**In scope:** every file under `src/renderer/src/`. **Out of scope:** `components/terminalFontSize.ts`,
xterm configuration, and anything outside `src/renderer/`.

**`test/repo-claims.test.cjs` asserts exactly those four**, following the repo-fact-test precedent
of `test/ci-config.test.cjs` and `test/engine-parity.test.cjs` (D-45). The exempt allowlist is a
literal `file:line` array in the test file, so adding a new sub-14px site fails the suite rather
than silently widening the exemption.

##### Token migration table

`tokens.css:61-68` (sizes) and `:70-77` (line heights).

| Token | Current | New | Verified consumers | Layout consequence |
|-------|---------|-----|--------------------|--------------------|
| `--cth-text-display-sm` | **8px** | **DELETE the token** | `AgentCard.tsx:220` (the agent NAME on the card) · `ThreadsPanel.tsx:101` (thread title button) | Both are user-facing *reading* text and must clear 14px. Bumping to 14px is the wrong fix: Press Start 2P at 14px is ~1.75× its 8px width and would reflow every card in the 112px strip. Both consumers migrate to `var(--cth-text-body-md)` / `var(--cth-lh-body-md)` under sweep rule 1; the token is deleted so it cannot reappear below floor. Both sites already have `nowrap` + `ellipsis`, so a wider name truncates rather than wraps. |
| `--cth-lh-display-sm` | 12px | **DELETE** | none outside the two sites above | Deleted with its size token. |
| `--cth-text-display-md` | **12px** | **14px** | `PixelPanel.tsx:67` (panel title) | Only consumer, and the only surviving Press Start 2P slot below 16px. `--cth-lh-display-md: 20px` stays — 14/20 is an integer px per `DESIGN.md:144-150`. Panel titles grow ~17%; `PixelPanel` headers are auto-height. Low risk. |
| `--cth-text-body-sm` | **13px** | **14px** | `PixelBadge.tsx:63` · `PixelButton.tsx:102` (`sm`/`md` button label) | `--cth-lh-body-sm: 18px` stays. +1px on auto-width badges and buttons. **Restores what `DESIGN.md:132` already specifies** (`body-sm` = 14/18) — a correction, not a change. Low risk. |
| `--cth-text-mono-sm` | **13px** | **14px** | **zero** (verified: `grep -rn "text-mono-sm" src/renderer/src` returns only the definition) | Zero risk. Terminal/xterm sizing is owned by `components/terminalFontSize.ts` and is not driven by this token — do not touch it. Restores `DESIGN.md:134` (`mono-sm` = 14/18). |

##### DESIGN.md's own internal contradiction — resolve it in this phase

`DESIGN.md:128` specifies `display-md` at **12px** and `:129` specifies `display-sm` at **8px**,
while `:706` in the same file says *"never go below 14 px for any user-facing text."* The file
contradicts itself, and the phase's premise is that every claim the project makes about itself is
true. `:706` is the clause the roadmap grades against, so it wins.

Required edits to `DESIGN.md` §4.1: set `:128` `display-md` to 14/20, delete the `:129`
`display-sm` row, and confirm `:132` `body-sm` and `:134` `mono-sm` already read 14/18 (they do —
`tokens.css` had drifted below the doc, not above it).

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
glyph and position, which is exactly what `DESIGN.md:708` prescribes.

**Contract: the avatar carries no field set and gains none.** A `$0.42` readout on a 32px sprite is
not legibility, it is clutter. Record this exception in the plan so the checker reads it as
intentional. The agreement contract binds **the three text renderings**.

#### `none shows cost` is stale — verified

Issue #39 says *"None shows cost."* All three text renderings already show it:

| Rendering | Cost render |
|-----------|-------------|
| Agent card | `AgentCard.tsx:256-265` — `${usd.toFixed(2)}`, hidden when 0, `title="Estimated spend so far: …"` |
| Fullscreen roster row | `FullscreenTerminal.tsx:711-718` — same shape, from `useFleetTelemetry()` at `:85` via `samples[a.id]?.usd` (`:340`, `:377`) |
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
`shortModel(agent.model) ?? 'CLI default'`, in the existing context line (`AgentCard.tsx:243-252`),
`flexShrink: 0`, before the cost span, with the full model id in the row's `title`.

**Deliberately excluded: duration.** Issue #39's *Fix* line suggests it. Verified there is no
spawn/start timestamp on the store's `Agent` shape (`store.ts:55-90`), so duration means new durable
state **plus** a per-second re-render of every roster row — a direct collision with FLOOR-11's *"a
PTY byte does not re-render the roster"* landing in the same phase. The graded clause in ROADMAP.md
criterion 4 is *"agree on what they show, cost included"* — cost, not duration. Do not build it.

**Agent-name casing stays as-is.** `AgentCard.tsx:220` renders `{name.toUpperCase()}`. Sweep rule 1
moves that site from Press Start 2P to Inter, and `DESIGN.md:140-141` reserves ALL-CAPS for display
fonts. The `.toUpperCase()` **stays**: casing is not one of the six requirements, changing it is a
visual change nothing asks for, and the card's identity line reads as a nameplate. `DESIGN.md:140-141`
joins the known-drift list below rather than driving a code change.

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
  `CommandCenterPanel.tsx:1581-1595` `PathLine` does `…${path.slice(-(MAX-1))}` with `MAX = 46`,
  plus `nowrap` + `ellipsis`; its comment explains the two work together so a path can never wrap.
  Used at `:751`, `:1038`, `:1333`. `FullscreenTerminal.tsx:865-869` clips raw `agent.cwd` with
  `nowrap` + `ellipsis` + `maxWidth: 300`. **Specify nothing.**

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
  accessible name — no `aria-label`. It is the only new control this requirement adds.
- **Toggle placement:** top-right of the floor canvas, `position: absolute`, `top: var(--cth-space-2)`,
  `right: var(--cth-space-2)`, `z-index: 3`. It sits one layer above the overlay
  (`DESIGN.md:686` reserves 3 for toasts, and the toggle must stay reachable while the overlay is
  up) and renders **only** below 1024px. Above 1024px it is not in the tree.
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
| Clicking the toast focuses that agent | `hooks.ts:425` — `n.on('click', () => this.focus?.(agentId))`, wired at `index.ts:468` |
| A notification fires on a long task | `hooks.ts:343` — `if (turnMs >= LONG_TURN_MS) this.notify(...)`, body `finished after N min` |
| A notification fires when a **Claude** agent is blocked | `hooks.ts:405-406`, with the `#42` rationale at `:397-404` |

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

## What This Contract Deliberately Does NOT Specify

Recorded so the checker reads these as decisions and the executor does not chase them.

| Not specified | Why |
|---------------|-----|
| The focus ring | Already fixed at 2px / `ink-900` / 2px offset — `global.css:93-95` |
| Converting the two `<div role="button">` to `<button>` | Deliberate, documented, already-resolved decision — `AgentCard.tsx:137-143`, `FullscreenTerminal.tsx:598-601` |
| A cost readout on the floor avatar | The avatar renders no text at all (`Character.ts` imports no `Text`); status is color + glyph + position per `DESIGN.md:708` |
| Duration on any rendering | No spawn timestamp on `Agent` (`store.ts:55-90`); a ticking value collides with FLOOR-11 |
| `sidebarWidth` resize clamp | Already live — `SidebarSplitter.tsx:35-37` + `App.tsx:222-226,448` |
| Left-truncating paths | Already live — `PathLine` at `CommandCenterPanel.tsx:1581-1595` |
| Any change to `terminalFontSize.ts` or xterm sizing | Out of the FLOOR-12 sweep by explicit carve-out |
| Changing `.toUpperCase()` on the agent name | Existing behaviour; casing is not one of the six requirements |
| `DESIGN.md:119-121` (Pixelify Sans / VT323), `:137` ("Never bold", contradicted by 24 `fontWeight` sites), `:140-141` (ALL-CAPS reserved for display fonts), `:674` (80px strip vs source's 112px) | Real doc drift, none of it one of this phase's six requirements. Only `:128`/`:129` are edited, because they directly contradict `:706` which criterion 4 grades against. |
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
