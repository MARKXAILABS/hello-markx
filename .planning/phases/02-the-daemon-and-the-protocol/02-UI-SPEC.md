---
phase: 2
slug: the-daemon-and-the-protocol
status: approved
shadcn_initialized: false
preset: none
created: 2026-08-21
reviewed_at: 2026-08-23 — gsd-ui-checker APPROVED after revision round 1 (Color/Typography/Spacing/Registry PASS, Copywriting/Visuals FLAG, 0 blocking)
revised: 2026-08-21 — checker round 1 returned BLOCKED; §Revision Log records every change
mode: auto — every open question resolved by the researcher, logged in §"Auto-Mode Decision Log"
---

# Phase 2 — UI Design Contract

> Visual and interaction contract for the five surfaces Phase 2 adds:
> the engine capability line (PARITY-01b), per-agent MCP on the agent card (DAEMON-04),
> the MCP consent modal (DAEMON-04), the tunnel indicator + QR enrolment (DAEMON-05 / D-19),
> and **the phone PWA (DAEMON-02) — a second platform, not a second screen.**

**This phase adds one genuinely new platform and four additions to an existing one.** The
existing one is governed by `DESIGN.md` + `src/renderer/src/design/tokens.css` and by
`01-UI-SPEC.md`, whose decisions are **locked**. Nothing below contradicts them; where this
contract extends a Phase 1 rule it says so explicitly and gives the reason.

**Every current-state claim carries a `file:line` read in this session.** Where a value must be
measured rather than derived, this contract says *measure it* and names the method — because
Phase 1 shipped three container regressions (`01-14` card width, `01-17` TriggerCard caret,
`01-18` IDE git rail) that every grep in every plan passed and only a live pixel probe caught.

**Requirements in scope for UI:** DAEMON-02, DAEMON-03, DAEMON-04, DAEMON-05, PARITY-01b, GSD-06.
**Out of UI scope:** DAEMON-01, PARITY-01a, PARITY-02, PARITY-03, STRUCT-01, STRUCT-02 (headless,
bridges, markers, extractions — no rendered output).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — `DESIGN.md` + `src/renderer/src/design/tokens.css` are the system |
| Preset | not applicable |
| Component library | in-house: `PixelPanel`, `PixelButton`, `PixelBadge`, `Modal`, `SpritePortrait`, `Icon`, `Select` |
| Icon library | none — Unicode BMP glyphs inline (`✎`, `⚠`, `✕`, `▾`/`▸`, `☀`/`☾`, `└`, `⇄`) |
| Font (desktop) | `--cth-font-display` Press Start 2P · `--cth-font-ui` Inter · `--cth-font-mono` JetBrains Mono (`tokens.css:55-57`), loaded from the Google Fonts CDN by `src/renderer/index.html:13` |
| Font (phone) | **system stack only — no webfont.** See §Phone Typography for why |
| New dependency | **none.** `package.json` and `package-lock.json` are frozen for this whole phase (D-06: this machine has npm 11.6.2 and the lockfile must be written by npm 10) |

### shadcn gate — executed 2026-08-21, resolved NO

`components.json`, `tailwind.config.*` and `postcss.config.*` are all absent (verified by `ls`,
this session). Stack is React + Vite + Electron, so the gate fires. **Resolved to N without
asking**, for the same reason `01-UI-SPEC.md:37-44` resolved it: introducing shadcn/Radix into a
project whose design system is an existing pixel-art token layer is scope creep the phase boundary
forbids — and it would additionally require touching `package.json`, which D-06 bans outright for
every Phase 2 plan. Registry safety gate: not applicable. No third-party registry is declared.

### Two platforms, one product

| Platform | Build | Style mechanism | Can import the design system? |
|----------|-------|-----------------|-------------------------------|
| Desktop renderer | `electron.vite.config.ts` → `out/renderer` | `tokens.css` custom properties, inline `style={{}}` | yes — this is where every existing component lives |
| **Phone PWA** | none — hand-written static files under `resources/phone/` (D-21) | **plain CSS custom properties re-declared inside the bundle** | **NO.** It is served over a tunnel to Chrome on Android; `window.cth` does not exist there and none of the renderer's build applies |

The phone re-declares a **thirteen-property subset** of the token layer (§Phone Color) — nine
structural, three semantic, one on-accent. It is a copy by necessity, not by choice, so the contract
pins the provenance of each value: an auditor can diff `resources/phone/index.html`'s `:root`
against `tokens.css` and get an exact match on every one. Twelve come from the
`:root[data-cth-theme='dark']` block; `--p-on-accent` copies `--cth-on-accent` (`tokens.css:94`),
which is deliberately theme-invariant and therefore lives in the base block.

---

## Spacing Scale — desktop

Existing, unchanged. `tokens.css:41-50`. Base unit 4px per `DESIGN.md:151-155`. Reproduced so the
checker does not have to open a second file:

| Token | Value | Usage |
|-------|-------|-------|
| `--cth-space-1` | 4px | icon gaps, chip padding |
| `--cth-space-2` | 8px | compact element spacing |
| `--cth-space-3` | 12px | row gaps |
| `--cth-space-4` | 16px | default element spacing |
| `--cth-space-5` | 24px | section padding |
| `--cth-space-6` | 32px | layout gaps |
| `--cth-space-7` | 48px | major section breaks |
| `--cth-space-8` | 64px | page-level spacing |

**Exceptions on the desktop for this phase: one, inherited not introduced.** New chips on the agent
card reuse the `BOSS`/`AUTO` chip's `padding: '1px 4px 0'` verbatim (`AgentCard.tsx:268`, `:289`).
The `1px` breaks the 4px scale and predates Phase 1, which already recorded and kept it
(`01-UI-SPEC.md:63-67`). Copying it is what keeps adjacent chips on one optical baseline;
re-specifying it to 0 or 4 would visually desync the row. **No spacing token is added, changed or
removed by this phase.**

## Spacing Scale — phone

Same base unit, expressed as its own custom properties because the phone cannot import
`tokens.css`. Five steps, not eight — a single-column phone view has no use for 48/64.

| Property | Value | Usage |
|----------|-------|-------|
| `--p-1` | 4px | inline gaps, chip padding |
| `--p-2` | 8px | between a label and its value |
| `--p-3` | 12px | inside a card |
| `--p-4` | 16px | screen gutter, between cards |
| `--p-5` | 24px | above the pinned action bar |

**The index deliberately tracks `--cth-space-N`, so nothing collides.** `--p-1`…`--p-5` are 4, 8,
12, 16, 24 — byte-identical to `--cth-space-1`…`--cth-space-5` (`tokens.css:41-46`). An earlier
draft of this contract named the 24px step `--p-6`, which reads as `--cth-space-6` (32px) to anyone
diffing the two scales. Renamed. The phone simply stops at 5; there is no `--p-6`, `--p-7` or
`--p-8`, because a single-column phone view has no use for 32/48/64.

**Exception, and it is a real one: touch targets are 48px, which is not on the 4px-step list above
but IS a multiple of 4.** Every tappable element on the phone has `min-height: 48px`; the primary
send button is `56px` and full-bleed within the gutter. Rationale: Android's own target guidance is
48dp, WCAG 2.2 AAA target-size is 44px, and this surface is used one-handed, at night, by someone
who is not at their desk. A 32px button that is fine with a mouse is a mis-tap on a phone.

---

## Typography — desktop

**Unchanged from `01-UI-SPEC.md:71-104`.** Phase 1's FLOOR-12 migration set this scale and plans
19/20/23 are still landing the last of it. Reproduced here as the binding floor:

| Role | Token | Size | Line height | Family |
|------|-------|------|-------------|--------|
| Display lg | `--cth-text-display-lg` | 16px | 24px | Press Start 2P |
| Display md | `--cth-text-display-md` | 14px | 20px | Press Start 2P |
| Body lg | `--cth-text-body-lg` | 16px | 24px | Inter |
| Body md | `--cth-text-body-md` | 14px | 20px | Inter |
| Body sm | `--cth-text-body-sm` | 14px | 18px | Inter |
| Mono md | `--cth-text-mono-md` | 14px | 20px | JetBrains Mono |
| Mono sm | `--cth-text-mono-sm` | 14px | 18px | JetBrains Mono |

**Weights: 400 regular, 600 semibold.** Two, matching what already ships. `DESIGN.md:136` ("never
bold") is known drift recorded in `01-UI-SPEC.md:825-841`; this phase neither adds nor removes a
weight beyond reusing 600 for the server label in the consent modal, copying
`McpDefaultsSettings.tsx:95-104` verbatim.

### THE HARD FLOOR — carried from Phase 1, non-negotiable

> **No text this phase adds may be below 14px, on either platform, ever.**

Phase 1 spent five plans (`01-14` … `01-18`) and one deleted token (`--cth-text-display-sm`) buying
that floor. Concrete rules for Phase 2 code:

1. **Never write a numeric `fontSize` in code this phase adds.** Use `var(--cth-text-*)` on the
   desktop and `var(--p-text-*)` on the phone.

   *Correction to an earlier draft of this contract.* It claimed the only lawful numeric sizes in
   the renderer were a three-entry Rule 0 allowlist plus Monaco. **Both halves were wrong against
   the current tree.** The three-entry list is the *intended end state* of the triggers/git/IDE
   sub-group after FLOOR-12 completes — `01-18-SUMMARY.md:140-164` freezes it as `IdePanel` 1 +
   `GitPanes` 2 — and its `IdePanel` entry is
   **`ide/IdePanel.tsx:491`** (`fontSize: 10, lineHeight: '14px'` on the `aria-hidden`
   `{gitCollapsed ? '▸' : '▾'}` caret), **not `:499`**, which is `padding: '1px 8px', border:
   'none', cursor: 'pointer',` and whose `fontSize` on the following line is already
   `var(--cth-text-display-md)` — a token, not a numeric site. `GitPanes.tsx:138` and `:225`
   (`fontSize: 11` on the `aria-hidden` `✕` and `⇄`) both verify exactly.

   And the repo-wide allowlist is **not yet frozen** — that is plan 23's deliverable. Numeric
   `fontSize` sites still live in at least `AgentControlStrip.tsx:60` (9), `BlockedBanner.tsx:23`
   (8), `CodeEditor.tsx:160` (8), `AgentDetailPanel.tsx:129` and `:281` (10), and
   `AgentCard.tsx:411` (10), because Phase 1 plans 19/20/23 are still landing the sweep. **This
   phase adds none and removes none.** The binding rule is about *new* code, and it is absolute.

2. **Every `fontSize` gets a `lineHeight` on the same declaration.** `01-15` found six px
   line-heights orphaned one line below their `fontSize`, which the same-line sweep structurally
   could not see. Write them as a pair or the next sweep will not find them either.
3. **Rule 0 (decorative glyph exemption) is closed to new entrants.** A glyph below 14px is only
   lawful if it is purely decorative *and* carries `aria-hidden="true"` on its own `<span>` — and
   `01-17` ruled that a variable-rendered glyph takes no exemption at all. Every glyph this phase
   adds (`⚿`, `⚠`, `↻`, the QR) sits at or above the floor. **No new Rule 0 allowlist entries.**

   *(Noted, not resolved: `IdePanel.tsx:491` is a variable-rendered glyph that kept its exemption,
   which sits in tension with `01-17`'s ruling. That is a Phase 1 inconsistency inside plan 23's
   scope, and this phase neither relies on it nor corrects it.)*

### Glyph rendering must be VERIFIED, not assumed

This phase introduces two glyphs the repo has never rendered: `⚿` (U+26BF) and `↻` (U+21BB). Both
are BMP and both sit near glyphs the app already ships (`☀` U+2600, `☾` U+263E, `⇄` U+21C4), so
they are *expected* to resolve in Segoe UI Symbol on Windows 11 — but "expected" is not this
project's bar.

**Contract:** the plan that lands them must confirm each renders as a glyph and not as tofu, using
the live CDP probe Phase 1 established (`01-15`/`01-18`) — a rendered-width measurement against a
known-good sibling glyph is sufficient. **If either fails to render, the substitution is
prescribed, not improvised:** `⚿` → the word `key`, `↻` → the word `restart`, both in
`--cth-text-body-sm`. Do not substitute a different symbol.

## Typography — phone

Three sizes, two weights. Declared as its own properties; **no webfont is loaded.**

| Property | Size | Line height | Weight | Usage |
|----------|------|-------------|--------|-------|
| `--p-text-lg` | 20px | 28px | 600 | screen title, agent name on an ask |
| `--p-text-md` | 16px | 24px | 400 | the question, the answer textarea, button labels |
| `--p-text-sm` | 14px | 20px | 400 | meta line (task id, who asked, when), status text |

- Family: `--p-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- Mono: `--p-font-mono: ui-monospace, "Roboto Mono", monospace` — used **only** for the task id and
  the tunnel host, nothing else.

**Why no webfont — the reasoning, so nobody re-opens it.** The desktop's three faces are fetched at
runtime from `fonts.googleapis.com` (`src/renderer/index.html:13`). That is $0 and account-free, so
it does not violate the cost rule — but this bundle's binding constraint is different: it is served
from disk over an ephemeral tunnel with a **200 concurrent in-flight request cap** (D-17), to a
phone that may be on mobile data, and it must work when the operator opens it *because something is
blocked*. A render-blocking font fetch to a third-party CDN is the wrong thing to put on that path,
and vendoring a `.woff2` into `resources/phone/` for a brand cue costs 30-60 KB on a bundle whose
whole job is a list and a text box.

**Brand continuity on the phone comes from colour and geometry, not from the pixel typeface:** the
same dark surfaces, the same 1px inset hairlines, the same hard offset shadow, the same lilac for
"a human is needed". That is enough to read as the same product. Locked.

---

## Color — desktop

Existing, unchanged. `tokens.css:3-38`, dark mirror at `tokens.css:120+`.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--cth-cream-100` #FFF8E7 · `--cth-paper-200` #F0EAD2 | app ground, scroll surfaces |
| Secondary (30%) | `--cth-paper-100` #FCFAF0 · `--cth-cream-200` #F4E9C7 | cards, inputs, terminals, chips, section headers |
| Accent (10%) | the six agent hues — `--cth-coral` · `--cth-mint` · `--cth-sky` · `--cth-lemon` · `--cth-lilac` · `--cth-peach` | see reserved-for list |
| Destructive | `--cth-coral` #D96A62 (= `--cth-status-blocked`) | destructive actions and blocked status **only** |

**Accent reserved for** (Phase 1's list, plus this phase's two additions, marked):

- per-agent identity: card selection frame, portrait background, `BOSS` tag fill, `ContextBar` fill
- `--cth-lilac-light` + `--cth-lilac` hairline: the FLOOR-01 `AUTO` chip *(Phase 1)*
- **`--cth-lemon` solid + `--cth-on-accent` text: the titlebar tunnel chip** *(Phase 2 — §S4)*
- **`--cth-coral` text/hairline: the consent-tier heading and the granted-server row in the MCP
  consent modal** *(Phase 2 — §S3)*

Nothing else.

### The two additions, justified against Phase 1's locked rules

**1. Lemon for the tunnel chip does not collide with `--cth-status-working`.**
Phase 1's coral-vs-lilac analysis (`01-UI-SPEC.md:121-137`) turned on one fact: the `AUTO` chip sits
**in the same row** as a `PixelBadge` rendering a status token, so a shared hue there is a real
confusion. The tunnel chip lives in the **titlebar** (`App.tsx:326-338`), and **no agent status is
ever rendered in the titlebar** — there is no `PixelBadge` anywhere in that 36px strip. The
positional half of `DESIGN.md:707` ("color + icon + position … never color alone") is therefore
satisfied by construction. Lemon is also already the app's "live / caution" register in two shipped
places: the breaker meter at ≥60% (`CommandCenterPanel.tsx:712`) and the enabled toggle in
`McpDefaultsSettings.tsx:116`. Solid lemon in the titlebar is unmistakable at a glance, and being
unmistakable *is* DAEMON-05's security property.

**2. Coral in the consent modal IS "destructive", so it does not extend Phase 1's rule.**
Granting a `secret`-tier MCP server to an agent that runs with bypassed permissions is a capability
grant executed without a prompt, and revoking one deletes a stored credential (D-28). Both are
destructive actions in the plain sense of Phase 1's reserved-for wording. No new hue.

### The gap chips take NO accent at all — this is the important ruling

Engine capability gaps (`NO MAIL`, `NO SPEND`, `NO COMPACT`, `NO REMOTE`, `NO MCP`) and the MCP
count element render in **neutral chrome**: `--cth-cream-200` fill, `inset 0 0 0 1px --cth-ink-300`
hairline, `--cth-ink-700` text.

**Provenance, stated precisely: this is the account chip's register with two deliberate departures,
not a verbatim copy.** The account chip (`AgentCard.tsx:344-353`) is the card's existing "here is a
fact about this agent" treatment and supplies the fill (`--cth-cream-200`) and the text colour
(`--cth-ink-700`) unchanged. The two departures:

| Property | Account chip | This contract | Why |
|----------|--------------|---------------|-----|
| Hairline | `inset 0 0 0 1px var(--cth-ink-100)` (`:349`) | `inset 0 0 0 1px var(--cth-ink-300)` | `--cth-ink-100` is documented in the dark ramp as *"dividers, meant to recede"* at 1.4-1.7:1 (`tokens.css:142`); `--cth-ink-300` is the ≥3:1 **borders** token (`:141`) and the one `--cth-panel-border` uses (`:89`). A capability gap is a fact the operator must be able to *see* — it takes the visible hairline. **A deliberate visibility upgrade, on the record.** |
| Padding | `'0 4px'` (`:348`) | `'1px 4px 0'` | matches the `BOSS`/`AUTO` chips it sits beside on the same card (`:268`, `:289`) — the optical baseline §Spacing pins |

**Why neutral and not a warning colour.** `capabilityLine`'s own doc states the design intent
(`providerAutomation.ts:309-311`): *"the MISSING capabilities shout (uppercase) and the present ones
stay quiet"*. The shout is carried by **uppercase text**, not by hue — which is exactly what
`DESIGN.md:707` asks for and what stops a floor of eleven engines from turning into a wall of red.
On a floor of claude and codex agents nothing renders at all; on a kimi or copilot agent one quiet
uppercase chip appears. Colour is reserved for the two things in this phase that genuinely change
the security posture: the public tunnel, and a consent grant.

## Color — phone

Thirteen properties, re-declared. **Every value is byte-identical to the token it copies.** Twelve
come from `tokens.css`'s `:root[data-cth-theme='dark']` block; `--p-on-accent` copies
`--cth-on-accent` from the base block (`tokens.css:94`), which is deliberately theme-invariant and
therefore has no dark override to copy. The phone is **dark only** — no theme switch,
`color-scheme: dark` on `:root` so the native textarea, scrollbar and autofill chrome follow.

| Phone property | Value | Copies | Usage |
|----------------|-------|--------|-------|
| `--p-ground` | `#17171B` | `--cth-cream-50` (dark) | page ground |
| `--p-card` | `#1A1A1F` | `--cth-paper-100` (dark) | ask cards, the answer textarea |
| `--p-raise` | `#26262C` | `--cth-cream-200` (dark) | pinned action bar, chips |
| `--p-line` | `#787684` | `--cth-ink-300` (dark) | every 1px hairline — **must stay ≥ 3:1** |
| `--p-divider` | `#3E3D46` | `--cth-ink-100` (dark) | dividers that should recede |
| `--p-text` | `#DEDBD6` | `--cth-ink-900` (dark) | the question, the answer |
| `--p-text-2` | `#B3B0AC` | `--cth-ink-700` (dark) | agent name, task title |
| `--p-text-3` | `#96919F` | `--cth-ink-500` (dark) | meta line, timestamps, hints |
| `--p-accent` | `#A896E3` | `--cth-lilac` (dark) | "a human is needed" — card header rule, send button fill |
| `--p-accent-fill` | `#2B2740` | `--cth-lilac-light` (dark) | ask-card header band |
| `--p-warn` | `#DF8078` | `--cth-status-blocked` (dark) | error states only |
| `--p-ok` | `#6FB88B` | `--cth-status-success` (dark) | "sent" confirmation only |
| `--p-on-accent` | `#1A1320` | `--cth-on-accent` (**theme-invariant**, `tokens.css:94`) | **text ON an accent fill: the `send answer` button label, and any label on `--p-warn` or `--p-ok`** |

*(Thirteen rows: nine structural, three semantic, one on-accent.)*

**Why `--p-on-accent` exists, and why its absence was a blocking defect.** The desktop's §S4a chip
already uses `--cth-on-accent` for exactly this job, and `tokens.css:90-94` says why: the accents
are **light** surfaces in *both* themes, so text on them must be dark in both, and `--cth-ink-900`
would invert with the theme and paint near-white on a pale fill. The phone's palette originally
copied twelve values and dropped this one — leaving `--p-accent` (`#A896E3`) as the `send answer`
button fill with no declared label colour. The only near-white in the phone ramp is `--p-text`
(`#DEDBD6`), which measures **1.87:1** on that fill: it fails 4.5:1 for body text and fails even the
3:1 large-text floor. The phone's single most important control would have been illegible.
`--p-on-accent` on `--p-accent` measures **7.03:1**, and the same token clears the other two accent
fills in the ramp — **6.48:1** on `--p-warn` and **7.69:1** on `--p-ok`.

**Why lilac is the phone's accent.** It is already this floor's "a human is needed" hue in two
shipped places: `AskMeTab.tsx:161` renders every ask-card header on `--cth-lilac-light`, and
`TasksKanban.tsx:265` renders the `?` "waiting on your answer" chip in solid lilac. The phone
surface **is** the Ask Me board in your pocket. Reusing the hue means the operator recognises the
screen before reading a word of it.

**60/30/10 on the phone:** `--p-ground` is ~60% (the page), `--p-card` + `--p-raise` are ~30% (ask
cards, the pinned bar), `--p-accent` is ~10% (the send button fill and one 2px header rule per
card). `--p-warn` and `--p-ok` are semantic-only and never decorate. `--p-on-accent` is **text
only** — it is never a fill, so it consumes no share of the split.

**Contrast, to be measured not assumed.** Every pairing above is inherited from a ramp
`tokens.css:120+` documents as WCAG-verified (body text ≥ 4.5, structural borders ≥ 3.0) — but that
was measured against the *desktop's* surfaces. The plan that lands the phone bundle **must re-check
four pairings and record all four ratios**:

| Pairing | Where it is used | Bar | Why it is on the list |
|---------|------------------|-----|-----------------------|
| `--p-on-accent` on `--p-accent` | the `send answer` button label | ≥ 4.5:1 | **the one that fails without the new token** — `--p-text` on this fill is 1.87:1 |
| `--p-text` on `--p-card` | the question, the answer | ≥ 4.5:1 | body text on a surface it was not measured against |
| `--p-text-3` on `--p-ground` | meta line, timestamps, hints | ≥ 4.5:1 | the dimmest text in the ramp |
| `--p-line` on `--p-card` | every 1px hairline | ≥ 3.0:1 | structural border floor |

Copying a verified value onto a different surface does not inherit the verification. An earlier
draft of this contract listed only the last three — all of which pass — and omitted the only one
that did not. Recording ratios for pairings that already pass while skipping the failing one is how
a contrast section becomes decoration; the failing pairing goes first now.

---

## Copywriting Contract

Governed by `DESIGN.md:629-657` (§14 Voice & copy): use the agent's name, never "the agent"; system
feedback under 12 words; **no emoji**; exclamation marks only on completions and notifications.

*(`AskMeTab.tsx:143` ships a `🌿` in its empty state — known drift, not corrected here, and
deliberately **not** carried onto the phone.)*

### Primary CTAs

| Surface | Label | Why |
|---------|-------|-----|
| MCP consent modal — confirm | `grant to {name}` | names the grantee; a bare "confirm" hides who gets the capability |
| MCP consent modal — cancel | `cancel` | existing `Modal` convention |
| Agent card MCP element | *(not a control)* | an indicator, exactly like the `AUTO` chip |
| Tunnel panel — enable | `expose to the internet` | says the consequence, not the mechanism |
| Tunnel panel — disable | `stop tunnel` | |
| Tunnel panel — copy URL | `copy` | matches `SettingsModal.tsx:1517` |
| Tunnel panel — copy enrolment link | `copy pairing link` | |
| Titlebar tunnel chip | `PUBLIC · {host}` | see §S4 |
| **Phone** — send an answer | `send answer` | the desktop's `respond & unblock` is desk vocabulary; on a phone the operator is answering, and the unblocking is the floor's job |
| **Phone** — back to the list | `back` | |
| **Phone** — refresh the list (header, §S5 Screen 1) | `refresh` | **a text button, not an icon.** A `↻` glyph here would be the one untested-glyph risk on a surface with no CDP probe and no fallback path; the word costs nothing and always renders |

### Empty states

| Surface | Copy |
|---------|------|
| Agent card, engine with no gaps | **nothing renders.** No "all good" chip, no green tick. A card with no gap chip means no gap. |
| Agent card, engine that cannot take MCP | `NO MCP` chip — never an empty `MCP 0 safe` |
| Tunnel panel, tunnel off | `Your floor is not reachable from the internet.` |
| Tunnel panel, tunnel starting | `Opening the tunnel…` |
| MCP consent modal, no consent-tier servers in the catalog | *(unreachable today — the catalog has 4 secret-tier entries. If it ever is: `Nothing here needs your consent.`)* |
| Dispatch box, every agent can receive mail | **nothing renders** |
| **Phone**, no open asks — heading | `Nothing needs you right now.` |
| **Phone**, no open asks — body | `The floor will notify you when it blocks on your answer.` |
| **Phone**, not yet paired | `This phone is not paired with a floor. Scan the QR in Settings → Connections on the desktop.` |

### Error states — problem, then what to do next

| Surface | Copy |
|---------|------|
| Tunnel failed to open | `The tunnel did not open: {reason}. Your floor is still private — press expose to the internet to try again.` |
| Tunnel dropped while up | `The tunnel closed. Your floor is private again — and the phone is paired to an address that no longer exists. Start it and scan the new QR.` |
| MCP grant failed, no secure storage | `This machine has no secure storage, so the key cannot be saved — {server} is NOT enabled for {name}. An unkeyed server is worse than none.` |
| MCP grant saved while the agent is running | `Saved. {name} picks up {server} the next time it starts — nothing hot-reloads a server set.` |
| Copy to clipboard failed | `Could not copy. The address is above — select it and copy it yourself.` |
| **Phone**, cannot reach the floor | `Can't reach your floor. The tunnel address changes every restart — scan the QR on the desktop again.` |
| **Phone**, HTTP 429 | `Too many requests — from your floor or from the tunnel. Wait a minute and try again.` |
| **Phone**, send failed | `Not sent. Your answer is still here — try again.` |
| **Phone**, pairing token already used | `That pairing code was already used. Generate a new QR on the desktop.` |
| **Phone**, unauthorised (401) | `This phone is no longer paired. Scan the QR on the desktop.` |

The 429 copy is load-bearing and its wording is **locked**: RESEARCH §4.3 measured that
TryCloudflare returns HTTP 429 for its own 200-in-flight cap, the *same status* `WebhookServer`
returns for its rate limit. The phone cannot tell them apart, so it **must not** claim which. This
is the honesty rule applied to a status code.

### Destructive actions — all three, with confirmation copy

| Action | Confirmation | Confirm label | Cancel label |
|--------|--------------|---------------|--------------|
| **Grant a `secret`-tier MCP server to an agent** | `{name} runs with permissions bypassed, so {server}'s tools run without asking you. It will be able to {description}.` + the literal launch spec + the env var **names** | `grant to {name}` | `cancel` |
| **Revoke a granted MCP server** | `Revoke {server} from {name}? The stored key is deleted — you will have to paste it again to re-grant.` | `revoke & delete key` | `keep it` |
| **Expose the floor to the internet** | `This puts an authenticated door to a floor of agents with bypassed permissions on the public internet. The address is public; the token is what keeps it shut.` | `expose to the internet` | `keep it private` |

**`stop tunnel` takes NO confirmation.** It is the safe direction, it is reversible, and putting a
dialog in front of *closing* an internet-facing door is backwards.

**The phone has no destructive action.** No dismiss, no delete, no revoke. It shows what needs a
human, takes an answer, and sends it. Anything that removes something is desk work.

### Notification copy — one product, one voice

Web Push (D-22) reuses FLOOR-14's **shape** — bare name as the title, a lowercase verb phrase
completing it as the body, no exclamation mark — so a desktop toast and a phone notification read
as one product:

| Field | Copy | Source |
|-------|------|--------|
| title | `{name}` | `hooks.ts:800`, `01-UI-SPEC.md:161` |
| body | **`is waiting on you` — unconditionally** | the god branch of `01-UI-SPEC.md:162` |
| tag | `ask:{taskId}` | one notification per ask; a re-poll replaces rather than stacks |

**The body is unconditional, and "verbatim" was the wrong word.** `01-UI-SPEC.md:162` reads
`` `is waiting on you` (god) · `is waiting on Michael` (worker) ``, and `hooks.ts:800-801`
implements exactly that two-branch conditional
(`isGod ? 'is waiting on you' : 'is waiting on Michael'`). Reusing the *expression* verbatim would
ship "Ada is waiting on Michael" to a phone whose entire purpose is *what needs a human* — a
notification about an agent-to-agent handoff, pushed to a person, at night. **Only the god branch is
reused**, because every ask that reaches this surface is human-blocked by construction: the phone
lists open asks, and an ask is on the phone precisely because it is waiting on the operator. The
worker branch has no referent here.

---

## Accessibility Rules — carried from Phase 1, binding here

These are not aspirations. Each one was paid for by a Phase 1 defect.

**A1 — every `<button>` has an accessible name.** Visible text content *is* the name; do **not**
add `aria-label` to a button that has text (it overrides the visible label and breaks voice
control). Icon-only or glyph-only buttons **require** `aria-label`, phrased verb + object, naming
the agent where one is in scope. `FullscreenTerminal.tsx:443` is the house pattern.
*(01-14, 01-15, 01-18: three plans in a row correctly added **zero** aria-labels. Adding one to
satisfy a count is the anti-pattern, not the goal.)*

**A2 — `aria-label` on a non-interactive `<span>` needs `role="img"` too.** Chromium does not
expose `aria-label` on `role=generic`, so a bare labelled span announces **nothing** while every
grep passes. Shipped pattern, both verified this session: `TasksKanban.tsx:262`
(`role="img" aria-label="Waiting on your answer"`) and `triggers/ui.tsx:348`
(`role="img" aria-label="percent"`).
*(01-17 found this the hard way.)*

**`ProviderLogo.tsx:46` is deliberately NOT cited here** — an earlier draft listed it as a third
example and it is the *opposite* pattern: it carries `role="img"` together with `aria-hidden="true"`
and **no** `aria-label` (`:45-47`), i.e. a decorative brand mark hidden from the a11y tree. That is
correct code and a correct use of A3; it is simply not an example of A2.

**A3 — a decorative glyph takes `aria-hidden="true"` on the glyph's own `<span>`, never on the
focusable button.** `aria-hidden` on a focusable element removes it from the a11y tree while
leaving it in the tab order — a control with no name at all (axe `aria-hidden-focus`).
*(01-14.)*

**A4 — inside `AgentCard`, the container's `aria-label` REPLACES all inner text.**
`AgentCard.tsx:187` already folds the auto-mode state into the card's own label for exactly this
reason. **Everything this phase adds to the card follows the same rule: the chip is
`aria-hidden="true"`, and its full meaning is appended to the card's `aria-label`.** Announcing it
twice is worse than once. This is why the card's chips do *not* take A2's `role="img"` — they are
inside a labelled container and are silent by design.

**A5 — the focus ring is already correct and must not be touched.** `global.css:93-95`:
`outline: 2px solid var(--cth-ink-900); outline-offset: 2px`. The phone re-declares an equivalent
(`outline: 2px solid var(--p-text); outline-offset: 2px`) because it cannot import it.

**A6 — the phone's own floor.** Every interactive element ≥ 48px tall. The answer textarea is a
real `<textarea>` with a `<label>`. The ask list is an `<ol>` of `<li>`; each ask opens via a
`<button>` whose accessible name is the task title. `<html lang="en">`. One `<h1>` per screen.
No `div` with a click handler anywhere in the phone bundle — it is 200 lines of hand-written HTML
and there is no excuse.

---

## Containment Protocol — how the plan proves it did not break the layout

Phase 1's three worst regressions (`01-14` the card rendering its name at **zero width**, `01-17`
the TriggerCard caret, `01-18` the IDE git rail spilling **85px** over the editor) were all
invisible to every grep in their plans. This phase adds content to the **most space-constrained
surface in the app** — a 322×86 agent card with roughly 3px of vertical slack (`AgentCard.tsx:124`,
`:129`). It will break something unless it is measured.

**Binding method, copied from `01-18`:**

1. Build the **base sha** and the **head sha** and run the *identical* CDP probe against both.
   A head-only measurement cannot distinguish "this phase caused it" from "it was already broken".
2. Probe at **1280, 1024 and 800** logical widths, using
   `Emulation.setDeviceMetricsOverride` — `page.setViewportSize`, `win.setBounds` and
   `win.setContentSize` all leave `window.innerWidth` pinned at 1280 in Electron (`01-15`).
3. The probe must print the **true `window.innerWidth`** beside the requested one, and must report
   a positive control (element found + mounted). A clean scan of an unmounted component is worth
   nothing (`01-15`, `01-17`).
4. Any container integer that changes, changes by the **measured delta**, in its own atomic commit,
   with the measurement in the commit message. Never by arithmetic on font metrics — `01-14`'s one
   arithmetic-derived integer was the one that was wrong.

**Surfaces that must be in the probe set:** `AgentCard` (all three variants: god, worker with a
note, worker with gaps + MCP), `AgentStrip`, the titlebar with and without the tunnel chip, the MCP
consent modal, and Settings → Connections with the tunnel panel open.

**The card's height is not to be changed.** 86px is the Phase-1-measured value and it propagates to
`AgentStrip`'s `height: 120` (`AgentStrip.tsx:270-271`), which is space taken from the Pixi office
scene. Everything this phase adds to the card rides **existing rows** (§S1, §S2). If the executor
concludes the card must grow, that is a stop-and-report, not a decision to make in flight.

---

## Per-Surface Contracts

### S1 — the engine capability line (PARITY-01b, D-30/D-31)

**Current state, verified.** `capabilityLine()` at `src/shared/providerAutomation.ts:332` has
**zero production consumers** — `src/main` 0, `src/renderer` 0, `src/preload` 0. Its only caller is
`test/engine-parity.test.cjs`, which asserts its strings. `README.md:59-63` documents a UI channel
that does not render.

#### Rule C-1 — the renderer NEVER renders `capabilityLine()`'s joined string

`capabilityLine()` returns e.g.
`claude: mail ok, spend tracked (otel), compacts /compact, remote control ok` — a **prompt line**,
written for "a model skimming a roster" (its own doc, `:309-311`), one clause per capability,
including the *present* capabilities. Rendering that on a 322px card would put five clauses of
mostly-good-news on every agent. **That is the wall of warnings the surface must not become.**

**The renderer consumes `providerCapabilities(provider, platform)`** — the structured record
`capabilityLine` itself is built from (`providerAutomation.ts:293-302`) — and renders **only the
false bits.** `capabilityLine`'s string keeps its one intended job (the god's roster injection,
which `hive.ts` owns per the function's own doc). Whether that injection lands in this phase is a
plan decision outside this contract; **it is not a UI surface and this document does not specify
it.**

This resolves D-30 honestly: PARITY-01b's UI is built on the same source of truth the tested
function uses, so the two can never disagree, and no second derivation of "what can this engine do"
enters the codebase.

#### Rule C-1a — how the renderer obtains the platform, named exactly

**This is the correction the first checker round blocked on, and it is load-bearing: as originally
written, Rule C-1 made the agent card evaluate `process.platform` on first paint.**

Verified this session: `providerCapabilities` calls `remoteControlAvailability(provider)` with the
platform argument **omitted** (`providerAutomation.ts:300`), and that function's signature is
`remoteControlAvailability(provider: AgentProvider, platform: string = process.platform)`
(`:284-287`). A default parameter is evaluated on **every** call where the argument is omitted,
before any body short-circuit — so `providerCapabilities(provider)` reads `process.platform`
unconditionally.

The renderer has never taken that path, confirmed three independent ways:

- `useHive.ts:12-16` imports exactly four symbols from `providerAutomation` —
  `clearCommandForProvider`, `compactionCommandForProvider`, `remoteControlCommandForProvider`,
  `terminalReadyToReceive`. None of the four reads `process`.
- `OnboardingWizard.tsx:166` records in a comment that `window.process.env.HOME` *"is ALWAYS
  undefined here"* — this codebase has already paid for assuming Node globals in the renderer.
- `src/main/index.ts:289` keeps its own `process.platform === 'win32'` literal *"rather than calling
  `remoteControlAvailability`"* (`:289-291`). Even **main** deliberately avoids the coupling.

**The mechanism, prescribed — the executor makes no call here:**

1. **`providerCapabilities` gains an optional `platform` and forwards it.**
   Signature becomes `providerCapabilities(provider: AgentProvider, platform?: string)`, and the
   `remote` bit becomes
   `remoteControlAvailability(provider, platform ?? process.platform) === 'ok'`.
   The `??` is the point: when a platform **is** passed, the right-hand operand is never evaluated,
   so no renderer call touches `process`. Every existing main-side and test-side caller keeps
   working unchanged. The file is already inside PARITY-01b's blast radius, and
   `engine-parity.test.cjs:568-590` already drives `remoteControlAvailability` with an explicit
   platform on both Codex branches, so the parity test extends to the new parameter without a new
   harness.
2. **The platform reaches the renderer over the preload bridge, as a plain string.**
   `src/preload/index.ts` adds `platform: process.platform` to the `api` object it already hands to
   `contextBridge.exposeInMainWorld('cth', api)` (`:1533`). Preload runs with Node globals, so this
   is a synchronous primitive available on first paint — **no IPC round trip, no `useEffect`, no
   loading state**. `CthApi` is `typeof api` (`:1535`), so the renderer's type comes for free.
3. **Every renderer call site passes `window.cth.platform`.** No renderer file may call
   `providerCapabilities` with a single argument. The plan carries a repo-fact test asserting that
   `grep -rn "providerCapabilities(" src/renderer` returns **only** two-argument calls, so a future
   edit that drops the argument goes red instead of throwing at paint time.

**Why the bridge and not an IPC `invoke`:** the card must render immediately, and a capability line
that flickers from "no gaps" to `NO REMOTE` one tick later is a worse surface than no surface.
**Why the bridge and not a literal in the renderer:** that would create a second declaration of
"what platform is this", which is exactly the drift `main/index.ts:271-292`'s JSDoc exists to
prevent.

#### Rule C-1b — where `NO MCP` gets its bit

`ProviderCapabilities` today is `{ provider, mail, spend, compact, remote }`
(`providerAutomation.ts:248-260`) — **there is no `mcp` bit**, and no field on
`AgentProviderPreset` answers "can this engine take MCP servers" either (verified this session).
Rule C-2's `NO MCP` row and S1a's `mail > mcp > spend > compact > remote` ranking therefore had no
data source. Named now:

**A new required `supportsMcp: boolean` on `AgentProviderPreset`, surfaced as a new `mcp: boolean`
on `ProviderCapabilities` (`mcp: preset.supportsMcp`).** Required rather than optional, following
the house pattern `costTracking`'s own doc states — *"Required, deliberately: a new provider must
state its answer instead of inheriting a flattering default"* (`agentProvider.ts:127-129`). One
source of truth, and `engine-parity.test.cjs` covers it with the same per-provider loop it already
runs over `mail`, `spend`, `compact` and `remote`.

**Rejected:** a preset field the renderer reads directly. That gives the card a second derivation
path for "what can this engine do", which is the thing Rule C-1 exists to forbid.

`capabilityLine`'s **string** is not extended with an MCP clause by this contract. It is a prompt
line governed by ADR-0002 and changing it is PARITY-01b engineering, not a visual contract.

#### Rule C-2 — the gap vocabulary, locked

One row per false bit. `{Engine}` is the preset's display name; `{Name}` is the agent's.

| Capability | Chip text | Full sentence (card `aria-label`, chip `title`) |
|---|---|---|
| `mail === false` | `NO MAIL` | `{Engine} cannot receive mail — work routed to {Name} bounces back to you.` |
| MCP unsupported (pi, custom) | `NO MCP` | `{Engine} cannot take MCP servers.` |
| `spend === 'none'` | `NO SPEND` | `{Engine} reports no cost — {Name}'s spend is invisible to every budget and to the breaker.` |
| `compact === false` | `NO COMPACT` | `{Engine} cannot reclaim context — {Name} has to be restarted when it fills up.` |
| `remote === false`, availability `'windows'` | `NO REMOTE` | `{Engine} has remote control, but not on Windows.` |
| `remote === false`, availability `'none'` | `NO REMOTE` | `{Engine} has no remote control.` |

The two `NO REMOTE` rows share a chip and differ in the sentence — Phase 1's D-40 ruling
(`01-13`): *"one shouted string for both would have blamed Windows for a gap that exists on every
platform."* Kept.

#### S1a — on the agent card

**Location: the card's third row** — the worker note row at `AgentCard.tsx:376-378`, the god's
`RealtimeMichaelToggle` + `CostHud` row at `:365-373`. **Not the identity row.** The identity row
already carries NAME + `BOSS` + `AUTO` + `PixelBadge`, and `01-14` proved that at the 14px floor
adding a fourth item there drives the name to zero width.

**Exactly ONE gap chip renders, ever.** Ranked `mail > mcp > spend > compact > remote`; the
highest-ranked false bit supplies the chip text, and if more than one bit is false the chip gets a
`+N` suffix inside the same element: `NO MAIL +2`.

**Why one and not all.** Ranked because the order *is* the operational cost: an engine that cannot
receive mail cannot be given work at all, one that cannot take MCP cannot be given tools, one whose
spend is invisible defeats the breaker, and remote control is a convenience. Never more than one
because the row also holds the note (which the operator wrote) and the ✎ control, and because the
full list is one hover away and already in the accessible name.

| Property | Value |
|----------|-------|
| Element | `<span>`, `aria-hidden="true"` (A4) |
| Text | `NO MAIL` / `NO MCP` / `NO SPEND` / `NO COMPACT` / `NO REMOTE`, optionally ` +N` |
| Font | `var(--cth-font-ui)` at `var(--cth-text-body-sm)` / `var(--cth-lh-body-sm)` |
| Fill | `var(--cth-cream-200)` |
| Border | `inset 0 0 0 1px var(--cth-ink-300)` |
| Text colour | `var(--cth-ink-700)` |
| Padding | `1px 4px 0` (the `BOSS`/`AUTO` chip's, `AgentCard.tsx:268`/`:289`) |
| Flex | `flexShrink: 0` — the note truncates, never the capability |
| `title` | every false bit's full sentence, newline-joined |
| Interaction | **none.** Not focusable, not clickable, no `role` |

**Font face is Inter, not Press Start 2P — deliberate and measured.** Press Start 2P is effectively
monospace at ~1em per character: `BOSS` measures 64px for four characters (`01-14`, measured in a
running Electron window). `NO MAIL` at that face is ~106px, `NO SPEND` ~120px — against ~266px of
usable row width. Inter at 14px puts the same chip near 64px. The display face stays the *identity*
face (identity row); the UI face carries *facts about* the agent (third row), which is already how
the model / cost / account chips on row two are set.

**The card's `aria-label` gains the gap sentences.** `AgentCard.tsx:187` currently reads
`${name}${isGod ? ' (boss)' : ''} — ${status}${autoMode ? …}`. Append, in rank order, each false
bit's full sentence. This is the **only** channel by which a screen-reader user learns the gap, per
A4, so it is not optional.

#### S1b — in the provider picker (`AddAgentModal.tsx`)

The operator picks an engine here and inherits its limits **before any work exists** — D-31's
surface (2), and the cheapest place to prevent the problem instead of labelling it.
`AddAgentModal.tsx:772` maps **all** presets unfiltered (RESEARCH §4.7), so this is genuinely the
decision point.

**Contract:** under the provider control, a `LIMITS` block rendered only when the selected preset
has ≥1 false bit. It lists **every** false bit — one line each, full sentence, not the chip text.
This is the one surface with room, and it is the one where completeness beats compression.

| Property | Value |
|----------|-------|
| Heading | `LIMITS OF THIS ENGINE` — `var(--cth-font-display)` at `var(--cth-text-display-md)` / `var(--cth-lh-display-md)`, `var(--cth-ink-500)`, uppercase (copies `McpDefaultsSettings.tsx:21-26`'s `labelStyle`) |
| Lines | `var(--cth-text-body-md)` / `var(--cth-lh-body-md)`, `var(--cth-ink-700)` |
| Marker | `⚠` in a `<span aria-hidden="true">` at `var(--cth-text-body-md)` — decorative; the sentence carries the meaning (A3) |
| Fill | `var(--cth-paper-100)`, `inset 0 0 0 1px var(--cth-ink-300)`, padding `var(--cth-space-2)` |
| When every bit is true | **renders nothing.** No "no limits" block. |

**Copy, second person, present tense, no hedging:** `{Engine} cannot receive mail — work you route
to a {Engine} worker bounces back to you.` (etc., per Rule C-2, with `{Name}` replaced by "a
{Engine} worker" since no agent exists yet).

#### S1c — in the dispatch flow (`CommandCenterPanel.tsx`)

D-31 states "the operator never assigns to a worker" — **that is true of the final assignment and
not true of the flow.** Verified this session: `CommandCenterPanel.tsx:679` renders a
`SUGGESTED OWNER` `<Select>` over `agents.filter((a) => !a.isGod)`, and `:603-607` forwards the
choice to the god as a suggestion. So there **is** an operator-facing agent picker, and it is
exactly the moment PARITY-01b's "before an operator assigns mail-dependent work" describes.

**Contract:** one line, directly below the `<Select>` (`:679-685`), rendered **only** when the
currently selected agent's engine has `mail === false`.

- Copy: `{Name} runs on {Engine}, which cannot receive mail. Michael cannot hand this to them.`
- Style: `var(--cth-text-body-md)` / `var(--cth-lh-body-md)`, `var(--cth-ink-700)`, with a leading
  `⚠` in an `aria-hidden` span.
- It does **not** disable the `<Select>` or the `dispatch` button. The operator may still send the
  suggestion; the god may still decide. This surface informs, it does not veto — consistent with
  the comment at `:595-599` that a picked worker is *"a SUGGESTION the god may follow."*
- `role="status"` on the line, so the message is announced when the selection changes rather than
  appearing silently.

**All three surfaces are in scope for this phase.** D-31 leaves the choice to the planner; auto-mode
resolves it to all three, because S1b and S1c are three-line conditional renders against data that
is already in hand, and covering only the card would satisfy the requirement's letter while leaving
the two moments where the operator actually chooses untouched.

---

### S2 — per-agent MCP on the agent card (DAEMON-04, D-29)

**Location: the same third row as S1**, immediately after the gap chip when both are present.
Same reasoning; same "the note truncates first" rule.

**One element, one deterministic shape, one pinned maximum width:**

```
MCP {safeCount} safe · {short}{mark} · {short}{mark}
```

| Piece | Rule |
|-------|------|
| `MCP {n} safe` | always first. `{n}` = count of safe-readonly servers active for this agent. Collapsed to a count, never named — D-29 |
| `· {short}{mark}` | one per **consent-granted** server, in catalog order |
| `{short}` | the catalog id up to its first `-`: `github-token`→`github`, `search-with-key`→`search`, `email-calendar`→`email`, `db`→`db`. Deterministic, ≤ 6 chars |
| `{mark}` | `⚿` key stored · `⚠` granted but **no key stored, not armed** · `↻` granted, agent is running, **not yet in effect** |
| Engine cannot take MCP | the whole element is replaced by the `NO MCP` gap chip. **Never `MCP 0 safe`.** |

| Property | Value |
|----------|-------|
| Element | `<span>`, `aria-hidden="true"` (A4) |
| Font | `var(--cth-font-ui)` at `var(--cth-text-body-sm)` / `var(--cth-lh-body-sm)` |
| Fill / border / colour | identical to the gap chip — `--cth-cream-200` / `inset 0 0 0 1px --cth-ink-300` / `--cth-ink-700` |
| **Containment** | `maxWidth: 152px; overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap; flexShrink: 0` — 152 is a multiple of 4 and a **starting** value; §S2a is the condition it must satisfy |
| `title` | the full, unabbreviated truth — every granted server's **full catalog id**, its tier, and for a pending entry the literal string `pending · restart` |

**The pinned `maxWidth` is the whole containment story and it is not negotiable.** It makes overflow
structurally impossible regardless of how many servers are granted, which is the property the card
needs after `01-14`.

#### S2a — the acceptance criterion for `maxWidth`, declared not delegated

An earlier draft said only *"measure it and adjust by the measured delta"*. That names a method and
no pass condition, which leaves the executor making a design call in flight — and the arithmetic
says the starting value does not pass. **The budget, computed from source this session:**

| Term | Value | Source |
|------|-------|--------|
| Card width | 322 | `AgentCard.tsx:124` |
| − inner surface padding | 16 (`'6px 8px'`) | `AgentCard.tsx:231` |
| − portrait tile | 36 | `AgentCard.tsx:237` |
| − portrait/content gap | 8 | `AgentCard.tsx:234` |
| **= content column** | **262** | |
| Worker third-row gap | 4 per gap | `AgentCard.tsx:378` |

Third row, worst realistic case: gap chip ≈ 64 + MCP element 152 + `✎` button 15 + three 4px gaps
= 243 → the note, the only flexible item in the row, lands at **≈ 19px**. That is one character and
an ellipsis: `01-14`'s dropped-field defect relocated from the name to the note.

**Pass condition, binding:**

> With a gap chip present **and** a fully-populated MCP element present, the note must retain
> **≥ 80px** of rendered width — roughly ten characters at Inter 14px. If it does not, **the MCP
> element's `maxWidth` is the value that comes down** until it does. The note's `flex: 1, minWidth: 0`
> (`AgentCard.tsx:384`) is never changed, the card's 322px is never changed, and the row never wraps.

Measured, not derived: the probe set already includes "worker with gaps + MCP" (§Containment
Protocol), so this is a read off the same run, and the final `maxWidth` lands in its own atomic
commit with the measurement in the message.

**Known ordering dependency — `AgentCard.tsx:411`.** The `✎` glyph in the exact row this phase edits
is still `fontSize: 10` inside a `width: 15, height: 14` button, owed to an unlanded Phase 1
FLOOR-12 plan (19/20/23). Raising it to the 14px floor widens that button and therefore changes the
budget above. **The measurement must be taken against whichever state of `AgentCard.tsx:411` is on
`main` when the plan runs, and the plan must record which state that was.** If the raise lands after
this phase, the `maxWidth` is re-measured then — it is a number with a recorded derivation, not a
constant.

**D-29's `pending · restart` is honoured in full, in the place it can be read.** The card is 322px
wide; the phrase plus a server name does not fit beside a note and a gap chip. So the card carries
the `↻` mark (which means "not in effect") and the `title` + the card's `aria-label` carry the
literal `pending · restart`. **What the contract forbids is the dishonest alternative:** rendering a
granted server with a `⚿` while it is not in the running session's server set. No engine is
confirmed to hot-reload (D-29), so a card that implies a live connection is describing something
that does not exist.

**`⚠` (granted, no key) is a distinct state and must not collapse into `⚿`.** D-28's contract is
fail-closed: if `safeStorage.isEncryptionAvailable()` is false, no secret is written **and the
server is not armed**. A card showing `github⚿` for a server that will never start is the exact
class of lie this project bans.

**Never rendered anywhere, on any surface:** the secret value, the `secretRefFor()` ref, or the env
var's value. Env var **names** appear only in the consent modal (§S3).

**The card's `aria-label` gains one MCP clause**, after the gap sentences:
`MCP: {n} safe servers{, and github-token with a stored key}{, and db pending · restart}.`

---

### S3 — the MCP consent modal (DAEMON-04, D-29)

**Component:** a new `McpConsentModal.tsx` built on the existing `Modal` (`Modal.tsx:66`) —
`role="dialog"`, `aria-modal`, title as accessible name, all already correct. `width: 560`.

**Not a reuse — a copy of a pattern.** `AddAgentModal.tsx:516-556`'s two-list split is inside a
`hireMeta.mcpServers` preview block, not a general consent UI (RESEARCH §4.7 says so explicitly).
Copy its **shape**, not its code.

**Title:** `MCP servers for {name}`

**Structure, top to bottom:**

1. **The standing warning — first, before any list.** One line, `var(--cth-text-body-md)` /
   `var(--cth-lh-body-md)`, `var(--cth-coral)`:
   > `{name} runs with permissions bypassed. A server you grant here runs its tools without asking you.`

   This is D-29's required sentence and it goes **above** the lists, not beneath a fold. It is the
   single most important thing on the surface.

2. **List A — `Safe, pre-enabled`.** Heading in `labelStyle` (display face, 14px, `--cth-ink-500`,
   uppercase), copied from `McpDefaultsSettings.tsx:21-26`. Rows are read-only: label + `<code>` id
   + description. **No toggle** — D-27 keeps the safe tier floor-wide, and a per-agent control here
   would imply an override that does not exist. One line under the heading:
   > `Read-only, no secrets, scoped to {name}'s workspace. Managed for the whole floor in Settings → Connections.`

3. **List B — `⚠ Needs your consent — NOT auto-enabled`.** Heading in the same `labelStyle` but
   `var(--cth-coral)`. One row per `write`/`secret` catalog entry. **Each row shows, always, not
   behind a disclosure:**

   | Field | Rendering |
   |-------|-----------|
   | Label + id | `var(--cth-text-body-md)` weight 600 + `<code>` at `var(--cth-text-mono-md)` in `--cth-ink-500` (copies `McpDefaultsSettings.tsx:95-104`) |
   | Description | `var(--cth-text-body-md)`, `--cth-ink-500` |
   | Tier | a chip: `SECRET` or `WRITE`, display face at `--cth-text-display-md`, `--cth-cream-200` fill, `inset 0 0 0 1px --cth-coral` |
   | **Launch spec — verbatim** | `<code>` block, `var(--cth-font-mono)` at `var(--cth-text-mono-md)` / `var(--cth-lh-mono)`, `--cth-paper-100` fill, `inset 0 0 0 1px --cth-ink-300`, `wordBreak: break-all`. Content is `{spec.command} {spec.args.join(' ')}` **exactly as it will be executed** — no truncation, no ellipsis, no prettifying |
   | **Env var names only** | `<code>` chips of `Object.keys(spec.env)`. **The value is never rendered, not even masked as dots** |
   | Key field | a `type="password"` input, `autoComplete="off"`, with a `<label>`. Placeholder: `paste the key — stored encrypted, never shown again` |
   | Key already stored | the input is replaced by the text `key stored` + a `replace key` button. The stored value is **never** re-rendered |
   | State when granted | row border `inset 0 0 0 1px var(--cth-coral)` (copies `McpDefaultsSettings.tsx:91`'s treatment, using the token rather than that file's hardcoded `#6E1423` at `:71`/`:91`) |

4. **The running-agent notice**, rendered only when the agent has a live PTY:
   > `{name} is running. Anything you change here takes effect the next time it starts — no engine reloads its server set.`

   Beside it, a secondary `PixelButton`: `restart {name} now`. This is D-29's "explicit respawn"
   option, offered rather than assumed.

5. **Footer:** `PixelButton variant="primary"` → `grant to {name}` (disabled until every
   newly-checked `secret`-tier row has a key, per D-28's fail-closed rule) and
   `PixelButton variant="ghost"` → `cancel`.

**Revoke** is a per-row `revoke` button on an already-granted row, with the confirmation from the
Copywriting Contract. It is the only destructive control in the modal and it is the only place the
word "delete" appears.

**Accessibility:** every row is a `<fieldset>` with a `<legend>` naming the server, so a screen
reader announces which server a key input belongs to. The `⚠` in the List B heading is
`aria-hidden` (A3) — "Needs your consent" already says it.

---

### S4 — the tunnel indicator and QR enrolment (DAEMON-05, D-17/D-19)

DAEMON-05 requires *"the live public URL always visible in the UI, so the tunnel can never be up
without the operator seeing it."* **That is a security property expressed as a UI one, so it gets a
persistent indicator, not a toast.** A toast is dismissible, auto-expires, and is absent on every
subsequent launch — it satisfies the words and not the property.

#### S4a — the titlebar chip (this is the DAEMON-05 clause)

**Location: the app titlebar**, `App.tsx:326-338` — 36px tall, always rendered, already carrying a
plain-text status (`auto mode on` / `auto mode off` at `:347-355`). Insert the chip immediately
after that text, before the `marginLeft: 'auto'` on the theme button.

| Property | Value |
|----------|-------|
| Rendered | **only while the tunnel is up.** When down, nothing — the absence is the signal |
| Element | a real `<button>`, `className="cth-titlebar-nodrag"` |
| Content | `PUBLIC` in `var(--cth-font-display)` at `var(--cth-text-display-md)` / `var(--cth-lh-display-md)`, then `·`, then `{host}` in `var(--cth-font-mono)` at `var(--cth-text-mono-md)` / `var(--cth-lh-mono)` |
| `{host}` | the tunnel URL's hostname. The scheme is constant and adds 8 characters of nothing. **Worked example, and the binding probe value: `adams-medical-meeting-enormous.trycloudflare.com` — D-14's live-measured random-word label (`02-CONTEXT.md:306`) on cloudflared's fixed suffix. 48 characters, `printf '%s' … | wc -c`** |
| Fill | `var(--cth-lemon)` |
| Text colour | `var(--cth-on-accent)` — the token that exists precisely for text on an accent fill and does **not** invert with the theme (`tokens.css:88-94`) |
| Border | `inset 0 0 0 1px var(--cth-ink-900)` |
| Padding | `1px 4px 0` — the `BOSS`/`AUTO` chip's exact value (`AgentCard.tsx:268`, `:289`), inherited not introduced |
| Flex | `flexShrink: 0` |
| Action | opens Settings at the Connections section (`setSettingsSection` + `setSettingsOpen`, the existing `App.tsx:386-387` pattern) |
| Accessible name | **the visible text.** No `aria-label` (A1) |
| `title` | `Your floor is reachable at this public address. Click to open the tunnel panel.` |

**Containment, and the two degradation steps — because one is not enough and the arithmetic says so.**

**The census, from source this session.** The titlebar (`App.tsx:326-338`) is `paddingLeft: 96`,
`paddingRight: 12`, `gap: 12`, and today carries **six** children: the logo (`:341`), `UpdateBadge`
(`:347`), the `auto mode on/off` span (`:348-355`), and three 28px buttons — theme (`:359`),
settings (`:388`) and fullscreen (`:405`). At an 800px logical width the content box is
`800 − 96 − 12 =` **692px**; five gaps take 60 and the buttons take 84, leaving **548** for logo +
`UpdateBadge` + auto-mode text.

Adding the chip makes **seven** children — six gaps (72) and the same 84 of buttons, leaving
**536**. The host this must survive is
`adams-medical-meeting-enormous.trycloudflare.com` — D-14's live-measured label
(`02-CONTEXT.md:306`) on cloudflared's fixed suffix, **48 characters** (`printf '%s' … | wc -c`,
this session). At `--cth-text-mono-md` that host alone is ≈ 403px; with `PUBLIC` in Press Start 2P
(6 chars × ~14px = 84), the `·`, and the padding, the chip is **≈ 508px**. That leaves **≈ 28px**
for the logo, `UpdateBadge` and the auto-mode text combined. Hiding the auto-mode text recovers only
~103px. **One degradation step is a dead end**, and this contract forbids truncating the host — so
as originally written the executor had no lawful move. Two steps now:

| # | Trigger | What changes | What is preserved |
|---|---------|--------------|-------------------|
| 0 | default | full chip: `PUBLIC · {host}` | everything |
| 1 | below the **measured** width at which the row first overflows | the `auto mode on/off` text is **hidden** (`display: none`), not ellipsised | the full host, the logo, `UpdateBadge` |
| 2 | below the **measured** width at which step 1 still overflows | the chip renders **`PUBLIC` alone** — same lemon fill, same border, same click target, same `title` | the chip is still *always visible*; the never-truncated URL is one click away in the panel the chip already opens |

The chip keeps `flexShrink: 0` at every step. Step 1 hides rather than ellipsises because
`auto mode of…` is noise: the same state is on every agent card as the `AUTO` chip after FLOOR-01,
so the titlebar copy is already redundant.

**Step 2 keeps DAEMON-05's security property intact, and that is why it is the lawful fallback.**
The requirement is that *the tunnel can never be up without the operator seeing it*. A solid-lemon
`PUBLIC` in the titlebar satisfies that completely — presence is the signal — and §S4b
contractually guarantees the full, never-truncated URL in the tunnel panel, which is exactly where
this chip navigates. Step 2 gives up convenience, not the property.

**Truncating the host is still forbidden.** An ellipsised public address (`adams-medical-…com`) is worse
than no address: it *looks* like the URL is visible while being unusable and unverifiable. The chip
shows the whole host or it shows none of it.

**Probe requirement.** Measure the titlebar at 1280/1024/800 per the Containment Protocol using the
literal 48-character host above — **not** a shorter invented one. An earlier draft of this contract
specified a 33-character probe host, fifteen characters shorter than the phase's own research
measured, which would have passed a probe that the real value fails. The plan records the two widths
at which steps 1 and 2 fire.

#### S4b — the tunnel panel (Settings → Connections)

The full block. Lives beside the existing Slack tunnel UI (`SettingsModal.tsx:1503-1528`), reusing
its exact readOnly-input + `copy` shape so the operator meets one pattern, not two.

**When the tunnel is off:**
- Body: `Your floor is not reachable from the internet.`
- The consequence sentence (Copywriting Contract, destructive table) in `--cth-ink-700`.
- `PixelButton variant="primary"` → `expose to the internet`.
- **It is a button, not a toggle switch.** A toggle invites a stray click; DAEMON-05 says the tunnel
  is off by default and never enabled as a side effect of anything else, and a control that arms an
  internet-facing door should require a deliberate press, not a flick.

**When the tunnel is up:**

| Element | Contract |
|---------|----------|
| Public URL | readOnly `<input>` with `onFocus={e => e.currentTarget.select()}`, `var(--cth-font-mono)` at `var(--cth-text-mono-md)`, + `copy` button — the `SettingsModal.tsx:1511-1517` pattern verbatim |
| Ephemerality notice | `This address is new every time the tunnel starts. Re-scan the QR after each restart.` — matches the honesty `slack.ts` already ships |
| **QR** | see below — **always rendered while the tunnel is up.** Never behind a "show QR" toggle, never a modal |
| `copy pairing link` | secondary `PixelButton`. The pairing link is **never rendered as text** |
| `stop tunnel` | secondary `PixelButton`. No confirmation |

**The QR is not a modal, and that is the answer to "how does it not get dismissed and then lost".**
It is a permanent region of the tunnel panel, present for as long as the tunnel is up, reachable in
two clicks from the titlebar chip that is itself always visible while the tunnel is up. There is no
dismissal to recover from.

| QR property | Value |
|-------------|-------|
| Encodes | `https://{host}/phone/#{enrollment-token}` (D-19) |
| Renderer | a single inline `<svg>` of module rects — crisp at any size, one element, no canvas, and `global.css:82` already sets `image-rendering: pixelated` on `svg` |
| Encoder | **vendored single-file MIT implementation** committed into the repo — **not an npm dependency.** `package.json` is frozen (D-06). Candidate named and its vetting bar set in §Registry Safety |
| Error correction | level **M** — a phone camera in a dim room at arm's length, which is the actual use |
| Size | **180 × 180 CSS px**, quiet zone of 4 modules included inside the SVG viewBox |
| Fill | modules `var(--cth-ink-900)` on a `#FFFFFF` plate. **A literal white, not `--cth-paper-100`** — in dark mode every surface token goes near-black and the code stops scanning. The plate gets `padding: var(--cth-space-2)` so the quiet zone survives against a dark panel |
| Accessibility | `role="img"` + `aria-label="Pairing QR code for the phone"` on the `<svg>` (A2). Beneath it, visible text: `Scan with the phone's camera to pair it with this floor.` |
| On rotation | the QR re-renders with the new host and a **fresh** token the moment the tunnel URL changes. No stale QR is ever left on screen |

**The pairing token is shown only as a QR, never as text.** It mints a bearer. Rendering a live
credential as selectable on-screen text invites it into a screenshot; a `copy pairing link` button
covers the case where the operator wants it in a password manager. The token is burned on first use
(D-19), so a photographed QR is worthless — but "worthless after use" is not "safe to print".

#### S4c — what this contract does NOT specify for DAEMON-03

Telegram/Discord (DAEMON-03) ride the existing webhook rails (D-24). The only rendered change is a
**per-endpoint verifier label** on the existing endpoint row in
`src/renderer/src/components/triggers/WebhooksSection.tsx` — reading `shared secret`, `telegram` or
`discord`. Same row, same styles, one extra `<code>` chip at `var(--cth-text-mono-md)`. No new
surface, no new colour, no new component. Anything more is out of scope.

---

### S5 — the phone PWA (DAEMON-02)

**A new platform.** Hand-written static files under `resources/phone/` (D-21), served by
`WebhookServer` over the tunnel, opened in Chrome on Android and added to the home screen.
**iOS is out of scope entirely** (standing constraint). It shares none of the renderer's build and
imports none of its components.

#### File inventory — locked

| File | Purpose | Notes |
|------|---------|-------|
| `index.html` | the whole app: markup, `<style>`, `<script>` | one file. No framework, no bundler, no CDN |
| `sw.js` | service worker | must be a real top-level file for scope (D-21). Job: Web Push receipt + notification click routing. **Not** an offline cache of floor data |
| `manifest.webmanifest` | installability | |
| `icon-512.png` | 512×512 | a copy of `docs/logo.png` (verified 512×512, 7.6 KB this session) |
| `icon-192.png` | 192×192 | generated **once** by downscaling `docs/logo.png` and committed as a binary. No image dependency: Electron's own `nativeImage.resize` does it in a throwaway script, and `electron` is already a devDependency — **`package.json` is not touched** |

`manifest.webmanifest`: `name: "Hello MarkX"`, `short_name: "MarkX"`, `display: "standalone"`,
`start_url: "/phone/"`, `background_color` and `theme_color` both `#17171B` (= `--p-ground`, so the
splash and the Android status bar match the app instead of flashing white), `icons` = the two files
above at `purpose: "any"`. **Not `maskable`** — the logo has no maskable safe-zone padding, and
declaring `maskable` on an unpadded icon produces a cropped launcher icon. Add a padded maskable
variant when the launcher icon actually looks wrong.

#### Screens — two, no router

The pairing token arrives in the URL `#fragment`. **`history.replaceState` clears the fragment
immediately after reading it**, before anything renders, so the credential does not sit in the
address bar, in the app-switcher thumbnail, or in a screenshot.

**Screen 1 — the ask list.**

```
┌─────────────────────────────────┐
│ NEEDS YOU                    3  │  <h1>, --p-text-lg
├─────────────────────────────────┤
│ ▌ Ada · 4m ago                  │  2px --p-accent rule + --p-accent-fill band
│   Fix the auth redirect loop    │  task title, --p-text-2
│   Should I drop the legacy…     │  question, 2 lines clamped, --p-text
├─────────────────────────────────┤
│ ▌ Michael · 1h ago              │
│   …                             │
└─────────────────────────────────┘
```

- `<ol>` of `<li>`; each ask is a full-width `<button>` (min-height 48px, real padding) whose
  accessible name is `{agent} asks: {task title}`.
- Newest ask first. The question is clamped to two lines with `-webkit-line-clamp: 2` — the full
  text is one tap away and a phone list of full questions is unscannable.
- The count in the `<h1>` is the number of open asks. Zero → the empty state from the Copywriting
  Contract, and **no list element at all**.
- Refresh: a `setInterval` gated on `document.visibilityState === 'visible'` (D-22 — SSE is
  excluded on two independent grounds). **Poll interval: 10s.** RESEARCH §4.3 measured the global
  bucket at 120 requests / 60s shared with every webhook caller; 5s doubles the burn for latency
  nobody feels on a surface that is already push-notified.
- A pull-to-refresh is **not** built. `overscroll-behavior-y: contain` plus a `refresh` button in
  the header — a custom pull gesture is a lot of code to reimplement a button.

**Screen 2 — the answer.**

```
┌─────────────────────────────────┐
│ ‹ back                          │  min-height 48
├─────────────────────────────────┤
│ Ada · task 4f2a · 4m ago        │  --p-text-sm, --p-text-3, id in mono
│ Fix the auth redirect loop      │  --p-text-lg
│                                 │
│ Should I drop the legacy /login │  the full question, --p-text-md,
│ route, or keep it redirecting?  │  white-space: pre-wrap, scrolls
│                                 │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ Your answer…                │ │  <textarea>, min 5 rows, --p-card
│ └─────────────────────────────┘ │
│ ┌─────────────────────────────┐ │
│ │        send answer          │ │  56px, full-bleed, --p-accent fill,
│ └─────────────────────────────┘ │  --p-on-accent label (7.03:1)
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

- **The action bar is pinned to the bottom** and stays above the on-screen keyboard. Use
  `position: sticky; bottom: 0` inside a `100dvh` flex column — `dvh`, not `vh`, because `vh` on
  Android Chrome does not account for the retracting URL bar and puts the send button under the
  fold at exactly the wrong moment.
- The textarea is a real `<textarea>` with a visually-hidden `<label>` reading `Your answer`.
  It auto-grows to a maximum of 40% of the viewport, then scrolls internally.
- The draft is persisted to `localStorage` keyed by task id on every input. The tunnel drops, the
  phone sleeps, Chrome evicts the tab — the answer survives all three. A half-typed answer lost to
  a dropped tunnel is the single most annoying failure this surface can have.
- `send answer`: fill `--p-accent`, **label `--p-on-accent`** — never `--p-text`, which measures
  1.87:1 on that fill. Height 56px, full-bleed within the `--p-4` gutter, `--p-text-md` at weight
  600. Disabled while the draft is empty and while a send is in flight.
- After a successful send: the button area is replaced by `sent` in `--p-ok` for 1.5s, then the app
  returns to the list with that ask gone. No modal, no toast.

#### Interaction states — all six, all specified

| State | Rendering |
|-------|-----------|
| Loading (first paint, paired) | `Loading…` in `--p-text-3`, centred. **No skeleton screens** — one operator, one request, a skeleton is animation for its own sake |
| Sending | button label → `sending…`, disabled, `--p-raise` fill |
| Sent | button area → `sent` in `--p-ok`, 1.5s |
| Send failed | the error line from the Copywriting Contract above the button, `--p-warn`; **the draft stays and the button re-enables** |
| Offline / unreachable | a persistent bar under the `<h1>`: `Can't reach your floor.` in `--p-warn` on `--p-card`. The list keeps showing the last data it had, greyed to `--p-text-3`, because a stale ask is more useful than an empty screen |
| Not paired | the whole app is replaced by the pairing message. No list, no textbox |

#### What the phone deliberately does not have

| Not built | Why |
|-----------|-----|
| Dismiss an ask | it removes something without answering it. Desk work |
| The task board / kanban | the phone's job is "what needs a human", not "browse the floor" |
| Terminal output, logs, agent cards | none of it is actionable one-handed |
| A light theme | dark-first is the requirement; a phone at night is the use case |
| Offline caching of floor data in `sw.js` | a cached ask is a stale ask, and answering a stale ask is worse than not answering |
| A settings screen | the only setting is which floor it is paired to, and that is the QR |
| Any framework | it is a list, a textarea and a POST |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| — | none | not applicable — no component registry is used by this project |

No shadcn, no third-party registry. **No npm dependency of any kind is added by this contract** —
`package.json` and `package-lock.json` are frozen for the whole phase (D-06: this machine has npm
11.6.2, the lockfile must be written by npm 10, and rewriting it with the wrong major is a
CI-breaking change on three hard-gated platforms).

**One vendored source file is introduced: the QR encoder.** It is committed source, not a
dependency, and it is the only executable code in this phase that this repo did not write.

#### The candidate, named

| Field | Value |
|-------|-------|
| Upstream | **Project Nayuki — QR Code generator library**, `github.com/nayuki/QR-Code-generator` |
| File | `typescript-javascript/qrcodegen.ts` — one file, zero dependencies |
| Licence | **MIT**, header retained verbatim |
| Purity | **verified against the live file this session**: no `fetch`, no `XMLHttpRequest`, no `navigator.sendBeacon`, no `process.env`, no `eval`, no `new Function`, no dynamic import, **no `document`/`window`** |
| Shape | exports `qrcodegen.QrCode` / `QrSegment`; `QrCode.encodeText(text, Ecc.MEDIUM)` then `getModule(x, y)` — it returns a **module matrix** and nothing else. **Our code builds the `<svg>`.** The upstream has no `toSvgString` in this file, which is exactly the boundary this contract wants |
| Vendored path | `src/renderer/src/vendor/qrcodegen.ts` |

**Required file header, asserted by the plan's own repo-fact test:** upstream URL, the **pinned
commit or release tag**, the retrieval date, the MIT text, and the **SHA-256 of the exact retrieved
file**.

**Why the digest is required and not optional.** CONTEXT D-14 already requires cloudflared to *"pin
a release tag and verify against a SHA-256 committed into this repo, not against a vendor
checksum"* (`02-CONTEXT.md:319`). Vendoring **executable source that runs inside the renderer** on a
weaker bar than a downloaded binary is inconsistent, and the earlier draft of this contract named no
upstream at all. Same bar, both artefacts.

**Standing purity gate**, in the same register the registry gate would apply to a third-party block:

- MIT or equally permissive licence, header retained verbatim
- **pure computation only** — no `fetch`, no `XMLHttpRequest`, no `navigator.sendBeacon`, no
  `process.env`, no `eval`/`new Function`, no dynamic import, no DOM access. It takes a string and
  returns a module matrix; the SVG is built by our code
- provenance recorded in the file header: upstream project, pinned version/commit, retrieval date,
  **SHA-256 of the file as retrieved**
- the plan's own repo-fact test asserts (a) the absence of every pattern above and (b) that the
  header's digest matches `sha256sum` of the committed file, so both a hostile edit and a silent
  drift go red

**One sanctioned adaptation, and only one.** `tsconfig.web.json:12` sets `isolatedModules: true`,
and the upstream file is a TypeScript `namespace`. If that combination fails to build, the lawful
change is to append an `export` at the bottom of the file — **no logic edit, no reformatting** —
recorded as a one-line `LOCAL CHANGE:` note in the header immediately below the digest, with the
digest still naming the *unmodified* retrieved file. Any other edit voids the vetting and the file
is re-fetched.

Cost check against the $0 rule: every item in this contract is $0 — system fonts, an existing
512×512 logo, a vendored MIT source file, and the Google Fonts CDN that the desktop already uses.
The phone bundle deliberately depends on **no** network resource other than the floor itself.

---

## Known Drift — NOT corrected by this phase

Real doc-vs-source and token-vs-literal contradictions found while writing this contract. Listed so
the checker reads them as scoped-out and the executor does not chase them.

| Where | What | Ruling |
|-------|------|--------|
| `AddAgentModal.tsx:486-487, :507, :532, :544-545` | `--cth-paprika-light`, `--cth-paprika-700`, `--cth-sky-700`, `--cth-mint-700` — **none of these tokens exist**; every one renders its inline fallback | Not corrected. New code in this phase uses real tokens; rewriting working code is not one of this phase's requirements |
| `McpDefaultsSettings.tsx:71, :76, :91` | hardcoded `#6E1423` for the consent tier, and `--cth-ink-400` (undefined) | Not corrected. **New** consent UI uses `var(--cth-coral)` and `var(--cth-ink-500)` |
| `AskMeTab.tsx:143` | `🌿` in the empty state, against `DESIGN.md`'s no-emoji rule | Not corrected on the desktop. **Deliberately not carried onto the phone** |
| `AskMeTab.tsx:168, :201, :216` | numeric `fontSize: 15` and `lineHeight: '19px'` — below-token literals above the 14px floor | Not this phase's sweep. Phase 1 plans 19/20/23 own the remaining FLOOR-12 surface |
| `AgentCard.tsx:411` | the `✎` glyph is `fontSize: 10` in a `width: 15, height: 14` button — in the exact row §S1a and §S2 edit | Not corrected here (it belongs to an unlanded Phase 1 plan) but **carried as a named ordering dependency** — raising it to the floor widens the button and changes §S2a's row budget. See §S2a |
| `AgentControlStrip.tsx:60` (9) · `BlockedBanner.tsx:23` (8) · `CodeEditor.tsx:160` (8) · `AgentDetailPanel.tsx:129`, `:281` (10) | numeric sub-14 `fontSize` sites still in the tree | Not corrected. Phase 1 plans 19/20/23 own them; the repo-wide Rule 0 allowlist is plan 23's deliverable, not this contract's. Listed so the checker does not read §Typography's three-entry list as a whole-renderer claim |
| `README.md:59-63` | documents a per-engine limitation table describing a UI channel that renders nowhere | **Becomes true when S1 lands.** The plan should re-read it afterwards rather than edit it now |
| `DESIGN.md:136` | *"All fonts ship in a single weight. Never bold"* vs 24 `fontWeight` declarations | Recorded in `01-UI-SPEC.md:835`; unchanged |

---

## What This Contract Deliberately Does NOT Specify

| Not specified | Why |
|---------------|-----|
| Where `capabilityLine()`'s **string** is consumed in `src/main` | It is a prompt line, not a rendered surface. Rule C-1 forbids the renderer from using it; where the god's roster injects it is `hive.ts`'s call and a plan decision |
| A new agent-card row, or any change to the card's 86px height | It propagates to `AgentStrip`'s 120px, which is space taken from the office scene. If the executor concludes it is unavoidable: stop and report |
| Per-agent control of the safe-readonly MCP tier | D-27 keeps that tier floor-wide, deliberately. The card shows a **count** for it, never a toggle |
| A "phone paired / un-pair" management screen on the desktop | Stopping the tunnel kills the origin, which invalidates the bearer, the service worker, the push subscription and the install (D-19). `stop tunnel` **is** the revoke, for free |
| The tunnel's stop/close mechanics, rate limiting, lockout, or token generation | DAEMON-05 engineering, not visual contract |
| Whether kimi appears in the god pickers after PARITY-01a | RESEARCH §4.7 flags it as a decision that must be made deliberately; it is a data question, not a design one |
| The `AddAgentModal` provider list's filtering | It is deliberately unfiltered (`:772`), and S1b informs rather than filters |
| Any change to `terminalFontSize.ts`, xterm, Monaco or CodeMirror sizing | Out of scope by explicit carve-out, as in Phase 1 |
| A phone light theme, offline cache, dismiss action or settings screen | See §S5's "deliberately does not have" table |
| Retiring Press Start 2P, changing any existing colour, spacing or type token | `DESIGN.md` + `tokens.css` are the contract; this phase adds against them |

---

## Auto-Mode Decision Log

`--auto` was in force: no `AskUserQuestion` was issued and every open design question was resolved
by the researcher. Each resolution below is auditable — the alternative and the reason it lost are
recorded so a reviewer can overturn one without re-deriving the whole contract.

| # | Question | Resolved to | Alternative rejected, and why |
|---|----------|-------------|-------------------------------|
| 1 | shadcn gate | **NO** | Initialising shadcn contradicts an existing token-based design system *and* requires touching the frozen `package.json` |
| 2 | Does the UI render `capabilityLine()`'s string? | **No — it renders the false bits of `providerCapabilities(provider, platform)`** (see Rule C-1a for how the renderer gets the platform) | Rendering the string puts five clauses of mostly-good-news on every card; the string is documented as a prompt line for a model skimming a roster |
| 3 | How many gap chips on a card? | **Exactly one, ranked, with `+N`** | All-of-them turns a kimi/copilot card into a wall; ranking by operational cost puts the blocking gap first and the rest one hover away |
| 4 | Gap chip colour | **Neutral chrome, no accent** | A warning hue on a chip that appears on most non-claude engines makes the floor read as broken; `capabilityLine`'s own design intent puts the shout in the uppercase text |
| 5 | Gap chip font face | **Inter (`--cth-text-body-sm`)** | Press Start 2P measures ~14px/char (`BOSS` = 64px for 4 chars, measured `01-14`); `NO SPEND` would be ~120px of a ~266px row |
| 6 | Which of D-31's three PARITY-01b surfaces? | **All three** | Card-only satisfies the requirement's letter and leaves both moments where the operator actually chooses untouched. S1b and S1c are conditional three-line renders over data already in hand |
| 7 | Is there really no assignment flow? | **There is: `CommandCenterPanel.tsx:679`'s `SUGGESTED OWNER` `<Select>`** | D-31 said the operator never assigns to a worker — true of the final assignment, not of the flow. Verified live this session |
| 8 | Does the dispatch box block a no-mail target? | **No — it informs, `role="status"`** | The picker is explicitly a suggestion the god may follow (`:595-599`); vetoing it would overrule the orchestrator from the UI |
| 9 | Where does per-agent MCP live on the card? | **The third row, one element, `maxWidth: 152px` starting value with a declared pass condition (§S2a)** | A fourth row means card 86→106 and strip 120→140, taken from the office scene |
| 10 | D-29 says "each granted server named" — on a 322px card? | **Named, with a pinned max-width and ellipsis; the `title` + `aria-label` carry the unabbreviated truth including `pending · restart`** | Collapsing to a bare count contradicts a locked decision; letting names run free is `01-14` again |
| 11 | Marks for MCP state | **`⚿` keyed · `⚠` granted-but-unkeyed · `↻` pending** | One mark for all three would hide D-28's fail-closed state, in which the server never starts |
| 12 | Untested glyphs (`⚿`, `↻`) | **Must be verified rendering live; substitutions (`key`, `restart`) prescribed in advance** | "It is BMP so it will render" is exactly the assumption this project's rules exist to stop |
| 13 | Where does the persistent tunnel indicator live? | **The titlebar** — always rendered, already carries a text status | A toast is dismissible and absent next launch; a Settings-only indicator is invisible while the tunnel is up |
| 14 | Tunnel chip colour | **Solid `--cth-lemon` + `--cth-on-accent`** | No `PixelBadge` exists anywhere in the titlebar, so the `status-working` collision Phase 1 guarded against on the card cannot occur; being unmistakable *is* the security property |
| 15 | Full URL or host in the titlebar? | **Host, never truncated; auto-mode text truncates instead** | The scheme is 8 constant characters; an ellipsised address does not satisfy "the URL is visible" |
| 16 | Where does the QR live so it cannot be lost? | **A permanent region of the tunnel panel, rendered while the tunnel is up** | A modal is dismissible and then unfindable — the failure mode the brief names |
| 17 | QR encoder | **Vendored MIT single file, with a purity vetting gate** | An npm dependency is impossible (frozen lockfile); typing a 32-char token on a phone defeats D-19's one-action design |
| 18 | QR plate colour | **Literal `#FFFFFF`** | Every surface token goes near-black in dark mode and the code stops scanning |
| 19 | Is the pairing token rendered as text? | **No — QR + `copy pairing link` only** | It mints a bearer; on-screen text invites it into a screenshot |
| 20 | Enable-tunnel control shape | **A button, not a toggle** | DAEMON-05 requires it never be enabled as a side effect; a toggle invites a stray flick |
| 21 | Does `stop tunnel` confirm? | **No** | It is the safe direction and reversible |
| 22 | Phone webfont | **None — system stack** | The bundle must be self-contained over a tunnel with a 200-in-flight cap, opened precisely when something is blocked |
| 23 | Phone theme | **Dark only, `color-scheme: dark`** | A theme switch is a setting on a surface whose whole job is one list and one textbox |
| 24 | Phone accent | **Lilac** | Already this floor's "a human is needed" hue in two shipped places (`AskMeTab.tsx:161`, `TasksKanban.tsx:265`) |
| 25 | Phone layout | **List → detail, two screens** | Inline textareas in a scrolling list is thumb-hell one-handed |
| 26 | Phone poll interval | **10s, visibility-gated** | The global rate bucket is 120/60s shared with every webhook caller; 5s doubles the burn for latency nobody feels behind a push notification |
| 27 | Phone 429 copy | **Must not name the cause** | The floor and TryCloudflare return the same status; claiming which is a fabrication |
| 28 | Phone draft persistence | **`localStorage` per task id, on every input** | The tunnel is ephemeral by design; losing a typed answer to it is this surface's worst failure |
| 29 | `100dvh` vs `100vh` | **`dvh`** | `vh` on Android Chrome ignores the retracting URL bar and hides the send button |
| 30 | Manifest icon purpose | **`any`, not `maskable`** | The logo has no maskable safe zone; declaring it produces a cropped launcher icon |
| 31 | Does the phone get a dismiss action? | **No** | It removes something without answering it — desk work, and the desk has it |
| 32 | Notification copy | **Reuses FLOOR-14's shape; the body is the god branch, `is waiting on you`, unconditionally** | Reusing the two-branch *expression* would push "Ada is waiting on Michael" to a phone whose whole purpose is what needs a human |
| 33 | How does the renderer get the platform, given `providerCapabilities` evaluates `process.platform`? | **Optional `platform` param forwarded with `??`, sourced from a new `window.cth.platform` on the preload bridge (Rule C-1a)** | An IPC `invoke` makes the card flicker from "no gaps" to `NO REMOTE` a tick later; a renderer-side literal creates a second declaration of the platform, which `main/index.ts:271-292` exists to prevent |
| 34 | Where does `NO MCP`'s bit come from? | **New required `supportsMcp` on the preset → new `mcp` bit on `ProviderCapabilities` (Rule C-1b)** | A preset field the renderer reads directly gives the card a second derivation path — the thing Rule C-1 forbids |
| 35 | The phone's label colour on an accent fill | **New `--p-on-accent` `#1A1320`, copying the theme-invariant `--cth-on-accent`** | `--p-text` on `--p-accent` is 1.87:1 — the phone's primary CTA would have been illegible. There was no other near-dark in the ramp |
| 36 | The titlebar chip at 800px, where one degradation step does not close the gap | **A second step: the chip renders `PUBLIC` alone below a measured width** | Truncating the host defeats DAEMON-05's "the URL is visible"; hiding the chip defeats "the tunnel can never be up unseen". `PUBLIC` alone keeps the security property and moves the address one click away, into the panel that already guarantees it untruncated |
| 37 | Which QR encoder, specifically | **Project Nayuki `typescript-javascript/qrcodegen.ts` (MIT), pinned by commit + SHA-256 in its header** | An unnamed "some MIT single-file implementation" is not a vetting gate; and D-14 already sets the SHA-256 bar for a downloaded *binary*, so vendored source cannot ship on a weaker one |
| 38 | The titlebar chip's padding | **`1px 4px 0`, inherited from `BOSS`/`AUTO`** | An earlier draft wrote `1px 6px 0`; 6 is not a multiple of 4 and is inherited from nothing, which contradicts this contract's own one-exception spacing clause |

---

## Revision Log

Round 1 of `gsd-ui-checker` returned **BLOCKED**. Every finding was independently re-verified against
live source before it was applied; each fix below carries the `file:line` that proves it. Nothing
outside these items was redesigned.

| Severity | Finding | Fix, and where it landed |
|----------|---------|--------------------------|
| **BLOCKING** | Rule C-1 made the renderer evaluate `process.platform` — `providerCapabilities` omits the platform argument (`providerAutomation.ts:300`) and the callee defaults it (`:284-287`), so the default is evaluated on every card render | **§S1 Rule C-1a** names the mechanism end to end: optional `platform` param + `??` short-circuit, sourced from `window.cth.platform` on the preload bridge (`src/preload/index.ts:1533`), with a repo-fact test forbidding one-argument calls from `src/renderer` |
| **BLOCKING** | The phone palette dropped the on-accent token; `--p-text` on `--p-accent` is **1.87:1**, so `send answer` was illegible. The contrast section named three passing pairings and omitted the failing one | **§Color — phone** adds `--p-on-accent` `#1A1320` (**7.03:1**; 6.48:1 on `--p-warn`, 7.69:1 on `--p-ok`), **§S5 Screen 2** declares it as the button label, and the contrast table now leads with that pairing |
| **BLOCKING** | §S4a specified `1px 6px 0` — off-grid and inherited from nothing, against this contract's own one-exception spacing clause | **§S4a** is now `1px 4px 0`, the `BOSS`/`AUTO` value (`AgentCard.tsx:268`, `:289`). No second exception was declared |
| **MUST RESOLVE** | `maxWidth: 150px` had a method and no pass condition; the budget puts the note at ~19px of 262 | **§S2a** declares the criterion (note ≥ 80px with a gap chip and a full MCP element present; the MCP element is what shrinks), moves the start to **152**, and carries `AgentCard.tsx:411` as a named ordering dependency |
| **MUST RESOLVE** | The titlebar at 800px was a dead end: one degradation step recovers ~103px against a ~508px chip, and the probe host was 33 characters where research measured 48 | **§S4a** publishes the census, sets the probe host to the literal `adams-medical-meeting-enormous.trycloudflare.com`, and adds step 2 — `PUBLIC` alone, security property intact |
| Factual | `NO MCP` had no data source (`ProviderCapabilities` is `{provider, mail, spend, compact, remote}`) | **Rule C-1b** — new required `supportsMcp` preset field → new `mcp` bit, same parity test |
| Factual | The Rule 0 allowlist claim was false: `IdePanel.tsx:499` is a padding/border line, and six numeric sites remain repo-wide | **§Typography** corrects the entry to `IdePanel.tsx:491`, restates the three-entry list as the sub-group's intended end state after FLOOR-12, names the six survivors, and drops "the only lawful sizes" |
| Factual | The notification "verbatim" claim contradicted its source — `hooks.ts:800-801` is a two-branch conditional | **§Notification copy** states the body is *unconditionally* the god branch, and says why the worker branch has no referent on this surface |
| Factual | The gap chip was described as copied from the account chip but changes its hairline and padding | **§Color — desktop** publishes the two departures as a table and calls `--cth-ink-300` a deliberate visibility upgrade (`tokens.css:141` vs `:142`) |
| Factual | `ProviderLogo.tsx:46` was cited as an A2 example but is `role="img"` + `aria-hidden` with no label | **§A2** drops it and says why; the other two citations were re-verified exact |
| Factual | The vendored QR encoder had no named upstream and no digest, on a phase whose D-14 requires a SHA-256 for a binary | **§Registry Safety** names Project Nayuki `qrcodegen.ts` (MIT, purity re-verified against the live file), requires commit pin + SHA-256 in the header asserted by a repo-fact test, and sanctions exactly one adaptation |
| Factual | `--p-6` (24px) collided with `--cth-space-6` (32px) | **§Spacing — phone** renames it `--p-5`, so `--p-1`…`--p-5` are index-identical to `--cth-space-1`…`--cth-space-5` |
| Factual | The expose-tunnel cancel was a bare `cancel`; `refresh` was missing from the CTA table; the tunnel-failed row had no next step | **§Copywriting** — `keep it private` (matching the `keep it` pattern set on revoke), a `refresh` row marked as a text button, and a retry clause on the tunnel-failed error |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
