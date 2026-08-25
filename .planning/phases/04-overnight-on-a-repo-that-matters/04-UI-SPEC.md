---
phase: 4
slug: overnight-on-a-repo-that-matters
status: draft
shadcn_initialized: false
preset: none
created: 2026-08-25
mode: auto — every gray area resolved to its researched recommendation and logged in §Auto-Mode Decision Log
measured_at: worktree gsd-plan-phase-04, base gsd/v1.0-floor-closure, HEAD e504735
revised: 2026-08-25 — rev 2, after gsd-ui-checker returned BLOCKED. Fixes B1 (the
  `PixelBadge` enumeration was wrong and hid an override that swallows `blocked`),
  B2 (D-25's phone channel was dropped without a recorded deviation), B3 (focus
  placement on a timed destructive prompt was unspecified), plus four citation
  corrections. Every contrast figure in rev 1 was independently recomputed and
  confirmed — none changed.
---

# Phase 4 — UI Design Contract

> Visual and interaction contract for the six surfaces Phase 4 adds or changes:
> the third answer and its countdown (GATE-05), the per-engine sandbox opt-in (GATE-04),
> denial legibility (GATE-03), age on the board (VIGIL-04), blocked-is-visible (VIGIL-03),
> and the released card (VIGIL-02) plus the once-only alarm (VIGIL-01).

**This phase adds no new platform.** It extends the two that exist: the Electron renderer
(`src/renderer/src/`) and the hand-written phone PWA (`resources/phone/`). Both are governed by
`DESIGN.md`, `src/renderer/src/design/tokens.css`, `01-UI-SPEC.md` and `02-UI-SPEC.md`, whose
decisions are **locked**. Where this contract extends a prior rule it says so and gives the reason.

**Every current-state claim below cites a `file:line` opened in this session.** Where a component
does not exist, this contract says `DOES NOT EXIST` rather than naming one.

**Requirements in UI scope:** GATE-03, GATE-04, GATE-05, VIGIL-01, VIGIL-02, VIGIL-03, VIGIL-04.
**Out of UI scope entirely:** GATE-02 (env allowlist — no rendered output), RECORD-01, RECORD-02,
RECORD-05. Phase 3's SCALE-03 owns the replay surface; **Phase 4 owns only the storage it reads**
(04-CONTEXT.md D-19). This contract specifies **no** replay timeline, **no** log viewer and **no**
restore-point browser.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | **none** — `DESIGN.md` (719 lines) + `src/renderer/src/design/tokens.css` (175 lines) are the system |
| Preset | not applicable |
| Component library | in-house: `PixelPanel`, `PixelButton` (`PixelButton.tsx:3` — `primary`/`secondary`/`ghost`/`destructive`), `PixelBadge` (`PixelBadge.tsx:3-12` — ten `StatusKind`s), `Modal` (`Modal.tsx:151-153` — `role="dialog"`, `aria-modal`, focus trap, focus restore), `BlockedBanner`, `Icon`, `SpritePortrait` |
| Icon library | in-house 16×16 pixel paths — `Icon.tsx:6-10`, **22** names (union re-counted this session; rev 1 said eighteen). **`clock` and `bell` already exist**; this phase adds no icon |
| Font (desktop) | `--cth-font-display` Press Start 2P · `--cth-font-ui` Inter · `--cth-font-mono` JetBrains Mono (`tokens.css:55-57`) |
| Font (phone) | system stack only, no webfont (`resources/phone/index.html:33-34`) — 02-UI-SPEC §Typography — phone |
| Styling mechanism | **CSS custom properties + inline `style={{}}`.** No CSS modules, no Tailwind, no styled-components, no PostCSS. Only two `.css` files exist in `src/`: `design/tokens.css` and `design/global.css` (verified by `find src -name "*.css"`, this session) |
| New dependency | **none.** `package.json` / `package-lock.json` frozen (04-CONTEXT.md D-36) |

### shadcn gate — executed 2026-08-25, resolved NO

`components.json`, `tailwind.config.*` and `postcss.config.*` are all **absent** (verified by `ls`,
this session). Stack is React 18 + Vite + Electron, so the gate fires. **Resolved to N without
asking** (auto mode), for the third time on this repo, for the same reason `01-UI-SPEC.md` and
`02-UI-SPEC.md` resolved it: the project already has a complete, WCAG-measured, dark-mirrored token
layer and eight in-house primitives. Introducing shadcn/Radix would be a **parallel system**, which
the phase brief forbids outright, and it would require editing `package.json`, which D-36 bans.

**Registry safety gate: not applicable.** No registry is declared, no third-party block is used, no
`npx shadcn view` was run because there was nothing to view.

---

## Spacing Scale — desktop

Existing, unchanged. `tokens.css:41-50`. Base unit 4px (`DESIGN.md:151-155`).

| Token | Value | Usage |
|-------|-------|-------|
| `--cth-space-1` | 4px | icon gaps, chip padding |
| `--cth-space-2` | 8px | compact element spacing |
| `--cth-space-3` | 12px | row gaps. *(`BlockedBanner.tsx:15` is the numeric literal `padding: 12,` — the same 12px, **not** this token. Recorded under Known Drift; not corrected here.)* |
| `--cth-space-4` | 16px | default element spacing |
| `--cth-space-5` | 24px | section padding |
| `--cth-space-6` | 32px | layout gaps |
| `--cth-space-7` | 48px | major section breaks |
| `--cth-space-8` | 64px | page-level spacing |

**Exceptions for this phase: one, inherited not introduced.** The titlebar chip this phase adds
(§S6) copies the shipped `PUBLIC` chip's `padding: '1px 4px 0'` verbatim (`App.tsx:421`). The `1px`
breaks the 4px scale, predates Phase 1, and is what keeps the two chips on one optical baseline.
**No spacing token is added, changed or removed by this phase.**

## Spacing Scale — phone

Existing, unchanged. `resources/phone/index.html:25-29`.

| Property | Value | Usage |
|----------|-------|-------|
| `--p-1` | 4px | inline gaps, chip padding |
| `--p-2` | 8px | label→value |
| `--p-3` | 12px | inside a card |
| `--p-4` | 16px | screen gutter, between cards, **the gap between the two decision buttons (§S1b)** |
| `--p-5` | 24px | above the pinned action bar |

**Exception, inherited from 02-UI-SPEC:** touch targets are `min-height: 48px`; the pinned primary
button is `56px`. **Both decision buttons in §S1b are 56px**, matching `send answer`.

---

## Typography — desktop

Unchanged. `tokens.css:66-72` (sizes), `:75-80` (line heights).

| Role | Token | Size | Line height | Family |
|------|-------|------|-------------|--------|
| Display lg | `--cth-text-display-lg` | 16px | 24px | Press Start 2P |
| Display md | `--cth-text-display-md` | 14px | 20px | Press Start 2P |
| Body lg | `--cth-text-body-lg` | 16px | 24px | Inter |
| Body md | `--cth-text-body-md` | 14px | 20px | Inter |
| Body sm | `--cth-text-body-sm` | 14px | 18px | Inter |
| Mono md | `--cth-text-mono-md` | 14px | 20px | JetBrains Mono |
| Mono sm | `--cth-text-mono-sm` | 14px | 18px | JetBrains Mono |

**Weights: 400 regular, 600 semibold.** Two. `DESIGN.md:136` ("never bold") is known drift recorded
in `01-UI-SPEC.md`; this phase adds no third weight. It uses 600 in exactly **two** new places, both
named in §S3 and §S5, both copying `WorkersTab.tsx:157`'s existing `fontWeight: 600` row-heading
register.

> **NOTE — `DESIGN.md` §4 is stale and is NOT the authority.** `DESIGN.md:117-133` still names
> Pixelify Sans / VT323 and a scale bottoming at 14/16/18px. `tokens.css:59-72` supersedes it (the
> v0.3.4 recalibration to Inter / JetBrains Mono and the FLOOR-12 14px floor). **Cite `tokens.css`,
> never `DESIGN.md` §4.** Recorded, not corrected — correcting `DESIGN.md` is not this phase's job.

### THE HARD FLOOR — carried from Phase 1 and Phase 2, non-negotiable

> **No text this phase adds may be below 14px, on either platform, ever.**

1. **Never write a numeric `fontSize` in code this phase adds.** `var(--cth-text-*)` on the desktop,
   `var(--p-text-*)` on the phone. The countdown digits (§S1a) are `--cth-text-body-md`; the phone's
   countdown is `--p-text-sm`.
2. **Every `fontSize` gets a `lineHeight` on the same declaration.** (`01-15`'s finding.)
3. **Rule 0 (decorative glyph exemption) is closed to new entrants.** This phase adds **zero**
   glyphs. Every mark it needs — `clock`, `bell` — is an existing `Icon` at 16×16, which is a
   `<svg>`, not text, and therefore takes no exemption and needs no tofu probe.

## Typography — phone

Unchanged. `resources/phone/index.html:30-32`.

| Property | Size | Line height | Weight | Usage |
|----------|------|-------------|--------|-------|
| `--p-text-lg` | 20px | 28px | 600 | screen title, agent name on an ask |
| `--p-text-md` | 16px | 24px | 400 | the question, button labels |
| `--p-text-sm` | 14px | 20px | 400 | meta line, **the countdown**, status text |

---

## Color — desktop

Existing, unchanged. `tokens.css:3-38`; dark mirror `tokens.css:120-175`.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--cth-cream-100` #FFF8E7 · `--cth-paper-200` #F0EAD2 | app ground, scroll surfaces |
| Secondary (30%) | `--cth-paper-100` #FCFAF0 · `--cth-cream-200` #F4E9C7 | cards, inputs, terminals, chips, section headers |
| Accent (10%) | the six agent hues — `--cth-coral` · `--cth-mint` · `--cth-sky` · `--cth-lemon` · `--cth-lilac` · `--cth-peach` | see reserved-for list |
| Destructive | `--cth-coral` #D96A62 (= `--cth-status-blocked`) | destructive actions and blocked status **only** |

**Accent reserved for** (Phase 1's list + Phase 2's two + this phase's **one**):

- per-agent identity: card selection frame, portrait background, `BOSS` tag fill, `ContextBar` fill
- `--cth-lilac-light` + `--cth-lilac` hairline: the FLOOR-01 `AUTO` chip *(Phase 1)*
- `--cth-lemon` solid + `--cth-on-accent`: the titlebar tunnel chip *(Phase 2, §S4a)*
- `--cth-coral` text/hairline: the MCP consent-tier heading and granted-server row *(Phase 2, §S3)*
- **`--cth-coral` solid + `--cth-on-accent`: the titlebar `QUIET` chip** *(Phase 4 — §S6)*

Nothing else. **This phase adds no new hue and no new token.**

### The one addition, justified

**Coral for the `QUIET` chip is "destructive" in Phase 1's plain sense, and it cannot collide with a
status badge.** Phase 2's §S4a argument transfers verbatim, but rev 1's evidence for it was wrong
and is replaced. **Re-measured this session: there are nine `PixelBadge` render sites, and none of
them is in the titlebar.** `App.tsx:411-440` — the entire titlebar chip strip — renders no
`PixelBadge` at all. Full enumeration in §S4 rule V-1. The positional half of
`DESIGN.md:707` ("colour + icon + position … never colour alone") is therefore satisfied by
construction, and the chip additionally carries a word (`QUIET`) and, at the wide step, a duration.

Measured this session (WCAG relative luminance, both themes):

| Pairing | Light | Dark | Bar | Verdict |
|---|---|---|---|---|
| `--cth-on-accent` #1A1320 on `--cth-coral` (#D96A62 / #E08C82) | **5.34:1** | **7.12:1** | ≥ 4.5 | PASS |

### ⚠ MEASURED FAILURE — coral text may NOT sit on the coral-light banner fill

`BlockedBanner.tsx:13` fills with `--cth-coral-light`. Measured this session:

| Pairing | Light | Dark | Bar | Verdict |
|---|---|---|---|---|
| `--cth-coral` on `--cth-coral-light` | **2.43:1** | 5.49:1 | ≥ 4.5 | **FAILS in light mode** |
| `--cth-ink-900` on `--cth-coral-light` | **12.96:1** | **10.13:1** | ≥ 4.5 | PASS |
| `--cth-ink-700` on `--cth-coral-light` | **8.89:1** | **6.47:1** | ≥ 4.5 | PASS |

**Binding rule.** The GATE-05 countdown's urgent state (§S1a) escalates on the **ink ramp**
(`--cth-ink-700` → `--cth-ink-900` at weight 600) plus an icon plus a word change — **never** to
`--cth-coral` text. A countdown that becomes unreadable exactly when it matters is the defect this
measurement exists to prevent.

*(`AskMeTab.tsx:305` already renders `BLOCKING N DOWNSTREAM TASKS` in `--cth-coral` on
`--cth-paper-100`, a different and passing pairing. Not affected, not changed.)*

### ⚠ MEASURED DEFECT, PRE-EXISTING — `PixelButton variant="destructive"` is 1.85:1 in dark mode

`PixelButton.tsx:71-76` renders the `destructive` variant as a `--cth-coral` fill with
`text: 'var(--cth-ink-900)'`. Measured this session:

| Theme | Pairing | Ratio | Bar | Verdict |
|---|---|---|---|---|
| light | `--cth-ink-900` #1A1320 on `--cth-coral` #D96A62 | **5.34:1** | ≥ 4.5 | PASS |
| dark | `--cth-ink-900` #DEDBD6 on `--cth-coral` #E08C82 | **1.85:1** | ≥ 4.5 | **FAIL — the label is effectively invisible** |
| dark | `--cth-on-accent` #1A1320 on `--cth-coral` #E08C82 | **7.12:1** | ≥ 4.5 | PASS |

This is **exactly the failure `tokens.css:90-94` was written to prevent**, quoted verbatim there:
*"The accents are LIGHT surfaces in BOTH themes, so this is dark in both — using ink-900 here inverts
with the theme and paints near-white on a pale accent, which is the one place the theme switch
actively hurts legibility."* `--cth-on-accent` exists for this and `PixelButton` does not use it.

**Binding: the plan fixes `PixelButton.tsx:74` — `var(--cth-ink-900)` → `var(--cth-on-accent)` — in
its own atomic `fix(...)` commit, before the GATE-05 banner lands.**

- **Light mode is byte-identical.** `--cth-on-accent` is `#1A1320` (`tokens.css:94`) and is
  theme-invariant; light-mode `--cth-ink-900` is the same `#1A1320`. Zero visual diff in light mode.
- **Dark mode goes 1.85:1 → 7.12:1**, fixing every `destructive` button already shipped — including
  the deny buttons `BlockedBanner.tsx:64` renders today.
- **Why this is not the opportunistic fix decision #30 forbids.** #30 refuses a *cosmetic* token
  swap (`fontSize: 16` → `var(--cth-text-body-lg)`) inside a security-surface diff. This is a
  **1.85:1 label on the deny button of the approval gate this phase exists to build**. Shipping the
  third answer on top of an invisible `deny` is not a contract this project can sign. One line, one
  commit, one measurement in the commit message.


## Color — phone

Thirteen existing properties (`resources/phone/index.html:12-24`), **plus exactly one new one.**

| New phone property | Value | Copies | Usage |
|---|---|---|---|
| `--p-warn-fill` | `#3B2724` | `--cth-coral-light` (dark, `tokens.css:152`) | **two surfaces, both in the warn register, and nothing else:** the `kind:'tool'` ask card's header band (§S1b) and the floor-quiet strip (§S6a rule Q-1b) |

**Why it exists.** `--p-accent-fill` (#2B2740 = `--cth-lilac-light` dark) is the header band under
`--p-accent`. A tool-approval card needs the *same construction* in the warn register, and
`--p-warn` (#DF8078) had no fill partner. Declaring one keeps the two card kinds structurally
identical and only hue-different — which is what makes them scannable and what makes the diff
against `tokens.css` still exact. **Fourteen properties: nine structural, four semantic, one
on-accent.**

**`--p-warn`'s reserved-for is extended, on the record.** 02-UI-SPEC declared it "error states
only". It now also carries **the tool-approval card's 2px header rule and its `approve` button
fill**. Justification: a tool approval *is* the phone's destructive action — it is the one control
on this surface that can cause an unrecoverable command to run — and Phase 1's rule reserves coral
for exactly that. No new hue enters the phone.

Measured this session, all four new pairings:

| Pairing | Ratio | Bar | Verdict |
|---|---|---|---|
| `--p-text` #DEDBD6 on `--p-warn-fill` #3B2724 | **10.13:1** | ≥ 4.5 | PASS |
| `--p-text-2` #B3B0AC on `--p-warn-fill` | **6.47:1** | ≥ 4.5 | PASS |
| `--p-text-3` #96919F on `--p-warn-fill` | **4.56:1** | ≥ 4.5 | PASS (thin — do not dim further) |
| `--p-on-accent` #1A1320 on `--p-warn` #DF8078 | **6.47:1** | ≥ 4.5 | PASS |
| `--p-warn` #DF8078 on `--p-warn-fill` (2px rule) | **4.99:1** | ≥ 3.0 | PASS |
| `--p-line` #787684 on `--p-warn-fill` (1px hairline) | **3.15:1** | ≥ 3.0 | PASS |

**60/30/10 on the phone is unchanged.** `--p-warn-fill` is a *card header band*, the same ~10%
share `--p-accent-fill` already occupies; it does not enlarge the accent share, it splits it by kind.

### ⚠ The phone's CSP is hash-pinned — this is a build contract, not a style note

`resources/phone/index.html:6` pins the inline `<script>` and `<style>` by sha256:
`script-src 'sha256-EtyV4iwjHDyNCCr1Hm+KnT4nQXdYDHo/DsYAJH53NwQ='` and
`style-src 'sha256-NLGNADNkRikjoVfjWqk8uOuc4YI/OiS94hXK806cBwg='`.

**Any edit to either block — including adding `--p-warn-fill` — ships a phone that renders nothing
unless both digests are recomputed in the same commit.** This is already enforced:
`test/build-assets.test.cjs:149-170` recomputes both from the committed content and asserts the CSP
matches. **The plan must run that test after every phone edit, not only at the end.**

---

## Copywriting Contract

Governed by `DESIGN.md:629-657`: use the agent's name, never "the agent"; system feedback under 12
words; **no emoji**; exclamation marks only on completions and notifications.

*(`AskMeTab.tsx:193` ships a `🌿` in its empty state — known drift, inherited, **not** corrected
here and **not** carried onto anything this phase adds.)*

### Primary CTAs

| Surface | Label | Why |
|---|---|---|
| GATE-05 desktop banner — allow | `approve` | Matches `BlockReason.actions[].kind` (`store.ts:25`, `'approve' \| 'deny' \| 'neutral'`) and GATE-05's own requirement language. **The noun is the command rendered immediately above it** — repeating it in the button would truncate at `size="sm"` |
| GATE-05 desktop banner — refuse | `deny` | same |
| GATE-05 phone — refuse | `deny` | full-width 56px, **bottom** position |
| GATE-05 phone — allow | `approve` | full-width 56px, **above** deny |
| GATE-03 notice — close | `dismiss` | already shipped (`BlockedBanner.tsx:78-79`) |
| VIGIL-01 titlebar chip | `QUIET 32m` | display font, uppercase, matching the shipped `PUBLIC` chip (`App.tsx:425`) |

### Ask copy — the four shapes, in the `DENY_*` register

GATE-05 fires only for unrecoverable shapes. Main supplies the sentence, exactly as
`hooks.ts:251-292` already supplies `DENY_BIN` / `DENY_GIT` / `DENY_SOCK` / `DENY_FRAME`. **The plan
ships four `ASK_*` constants in the same file, same style, same voice.** Prescribed text:

| Shape | `summary` (banner headline) | `detail` (the `ASK_*` string) |
|---|---|---|
| `rm -rf` and friends | `Ada wants to run this` | `This deletes a directory tree recursively. Nothing here can put it back.` |
| `git push origin +main` | `Ada wants to run this` | `This force-updates a remote branch. Commits only on the remote are gone.` |
| `curl … \| sh` | `Ada wants to run this` | `This pipes a downloaded script straight into a shell. Nothing reads it first.` |
| fetch to a host outside the allowlist | `Ada wants to reach {host}` | `{host} is not on this floor's allowlist. Approving lets this agent talk to it.` |

Rules: the summary is **five words or fewer** and always names the agent; the detail is **one or two
sentences, ≤ 20 words**, states the consequence, and never says "are you sure". `DESIGN.md:637`'s
"Confirm operation → Sure?" mapping does not apply here — the command string *is* the question.

### Denial copy (GATE-03)

| Field | Value |
|---|---|
| `summary` | `Ada's Bash call was refused` — five words, names **who** and **what**. Replaces the shipped `` `${tool ?? 'A tool'} was blocked` `` at `useHive.ts:619`, which names neither |
| `detail` | **the verbatim `DENY_*` string main already returns** (`hooks.ts:251-292`). Do not paraphrase, do not shorten, do not write a second copy of it in the renderer |
| `command` | the refused command string, **newly populated** — see §S2 |

### Release copy (VIGIL-02)

| Field | Value |
|---|---|
| Card meta line | `DROPPED BY ADA` — display font, uppercase, in the slot the cleared assignee just vacated |
| Detail overlay, write 1 | `Ada's terminal exited. The card is back on the board.` (9 words) |
| Detail overlay, write 2 | `Their work is on branch {branch}.` — **absent** until write 2 lands. Never a placeholder |

### Alarm copy (VIGIL-01) — one product, one voice

The desktop convention is title = subject, body = a phrase completing it
(`hooks.ts:1484-1485`: `"Ada"` / `"is waiting on you"`). The phone service worker uses the identical
shape (`resources/phone/sw.js:33-37`). Both cases:

| Case | Title | Body |
|---|---|---|
| Floor quiet | `The floor has stopped` | `Nothing has moved for 30 minutes. Ada was on "fix auth redirect".` |
| Floor quiet, nothing in flight | `The floor has stopped` | `Nothing has moved for 30 minutes. No cards were in flight.` |
| **The god died** | `Michael is gone` | `The floor has no orchestrator. Nothing has moved for 30 minutes.` |

**Binding rule — the title must be self-sufficient.** Under an **already-installed** `sw.js` the
body is the hard-coded string `'is waiting on you'` (`sw.js:36`) and any new `body` field is
ignored. `The floor has stopped / is waiting on you` and `Michael is gone / is waiting on you` are
both still truthful under that reading. A title like `Floor` or `Alert` would not be. See §S6 for
the forward/backward-compatible push payload.

**The phone's persistent strip** (§S6a rule Q-1b) uses the same three cases in one sentence, since
it has no title/body split:

| Case | Strip copy |
|---|---|
| Floor quiet | `The floor has stopped. Nothing has moved for 32m. 2 cards were in flight.` |
| Floor quiet, nothing in flight | `The floor has stopped. Nothing has moved for 32m. No cards were in flight.` |
| The god died | `Michael is gone. The floor has no orchestrator, and nothing has moved for 32m.` |

**No exclamation mark.** `DESIGN.md:652` reserves them for completions; a stall is not one.

### Error / race states

| Where | Copy |
|---|---|
| Phone — ask expired before the tap landed | `Too late — nobody answered, so the floor denied it.` |
| Phone — already answered on the other surface | `Already answered somewhere else. Nothing to do here.` |
| Phone — POST failed for any other reason | `Not sent — the floor did not answer. Try again.` |
| Desktop — ask expired while the banner was open | `Denied — no answer in time.` |
| Desktop — answered from the phone while the banner was open | `Approved from your phone.` / `Denied from your phone.` |

The three existing phone strings (`index.html:301-308`) are **unchanged**; the three above are new
keys on the same `COPY` object. `sendFailed` is **not reused** for a tool ask — it says *"Your
answer is still here"* and a tool ask has no draft.

### Empty states

**This phase adds none.** The phone's `emptyHeading` / `emptyBody` (`index.html:301-302`) already
cover an empty ask list and are correct for a list that now contains two kinds. `TasksKanban.tsx:199`
already renders `Nothing here yet` per column. The `QUIET` chip's empty state is its **absence** —
a chip that says "everything is fine" is the alarm-fatigue failure this phase exists to avoid.

### Destructive actions in this phase

| Action | Confirmation approach |
|---|---|
| **Approve a gated tool call** (desktop + phone) | **The ask *is* the confirmation.** One click/tap, no second dialog. The verbatim command is rendered above the button, un-truncated (§S1a rule 3), and the `ASK_*` sentence states the consequence. A double-confirm on a 120-second timer is user-hostile and would push more asks into the auto-deny |
| Deny | No confirmation — deny is the safe direction and is also the timeout default |
| Dismiss a GATE-03 notice | No confirmation — the command already did not run |

---

## Accessibility Rules

A1–A6 carry from `02-UI-SPEC.md:450-495` **verbatim and binding**. Restated in one line each, plus
two new rules this phase pays for.

- **A1** — every `<button>` has an accessible name; visible text *is* the name; do not add
  `aria-label` to a button that already has text. Glyph-only buttons require one.
- **A2** — `aria-label` on a non-interactive `<span>` needs `role="img"` too
  (`TasksKanban.tsx:262` is the shipped pattern).
- **A3** — a decorative glyph takes `aria-hidden="true"` on the glyph's own `<span>`, never on the
  focusable button.
- **A4** — inside `AgentCard`, the container's `aria-label` (`AgentCard.tsx:335`) **replaces** all
  inner text. Anything this phase adds to the card is `aria-hidden` and its meaning is appended to
  that label.
- **A5** — the focus ring is `global.css:93-95` (`outline: 2px solid var(--cth-ink-900);
  outline-offset: 2px`) and must not be touched. The phone re-declares an equivalent at
  `index.html:52`.
- **A6** — the phone's floor: every interactive element ≥ 48px, real `<label>`s, `<ol>`/`<li>`,
  no `div` with a click handler.

### A7 — the countdown is announced at thresholds, never per second *(new, this phase)*

A per-second live region is a screen-reader denial-of-service. **The rule:**

1. The ticking digits carry **`aria-hidden="true"`**. They are a visual affordance only.
2. A **separate visually-hidden `aria-live="polite"`** node emits **four** announcements over the
   life of an ask, and nothing else: at **120s**, **60s**, **30s** and **10s** remaining, phrased
   `2 minutes left`, `1 minute left`, `30 seconds left`, `10 seconds left`. Thresholds already
   passed at first render are skipped (an ask surfaced with 45s left announces at 30 and 10 only).
3. The **outcome** is announced once, in the same polite region: `Approved.` / `Denied.` /
   `Denied — no answer in time.`
4. The ask's arrival is announced by a **separate `aria-live="assertive"`** node carrying the
   `summary` **only** — never the whole banner, never the command string, never the countdown.
   Assertive interrupts; it gets five words, once.

Applies identically on both platforms. The phone uses the same two-node construction with
`class="p-visually-hidden"` (`index.html:54-60`).

### A8 — PTY-derived text is untrusted display data *(new, this phase)*

VIGIL-03 moves block detection into main (`pty.ts:826`) and, per §S4, sends the **matched prompt
line** to the renderer as the agent's `action`. That string is raw terminal output from a
model-controlled process.

1. **Strip control bytes in main, before IPC.** The existing stripper `usePtyParser.ts:5`
   (`ANSI_RE = /\x1b\[[0-9;]*m/g`) removes **SGR only**. When `BLOCK_HINTS` moves to a shared
   electron-free module (RESEARCH §Pattern 9 step 4) the stripper moves with it and **must be
   widened** to full CSI plus C0/C1 control characters, because the string now feeds a *rendered
   row* rather than only a regex test. A bare SGR strip leaves cursor-movement and OSC sequences in
   a string that React will happily insert into the DOM as text.
2. **Cap in main, ellipsise in CSS.** Hard cap at **120 characters** before the IPC send; the row
   applies `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. Never send an
   unbounded model-controlled string into a fixed-width row.
3. Same rule for the GATE-03/GATE-05 `command` field: **cap at 512 characters in main**.

### A9 — focus survives resolution *(new, this phase)*

A1–A8 cover accessible **names**, roles, the focus **ring** (`global.css:93-95`) and target size.
**None of them covers where focus goes.** Two rules in this contract destroy the element the
operator is standing on, so this rule is not optional and is not a nicety: §S1a rule 4 **replaces**
the desktop action row on resolution, and §S1b **disables** both phone decision buttons at
`expired`. In both cases the node holding focus is overwhelmingly `approve` or `deny` — the
operator just pressed one — and losing it drops focus to `<body>`, stranding a keyboard or AT
operator at the top of the document at the exact moment they answered a destructive prompt.

**A9.1 — the banner does NOT take focus on arrival.** §S1a rule 5 and decision #29 stand: no
autofocus, no `.focus()` on mount, no `Modal`-style trap. An ask that arrives while the operator is
mid-sentence in another agent's terminal moves nothing. Arrival is announced by A7 clause 4's
assertive region and by nothing else. *(Stated explicitly so an executor reading rule 5 does not
read A9 as a licence to focus the banner.)*

**A9.2 — when the focused control unmounts or disables, focus moves in the SAME render.** Guarded,
in both cases, on focus having been inside the surface that is changing:

```ts
// desktop — in the same effect/render that swaps the action row
if (bannerRef.current?.contains(document.activeElement)) dismissRef.current?.focus();
```

- Focus was elsewhere (a terminal, another panel) → **nothing moves.** A9.1 holds; the guard is what
  makes A9 and rule 5 compatible rather than contradictory.
- Focus was on `approve` / `deny` → it lands on `dismiss`, one key from done, at the point in
  document order the operator already occupied.

**A9.3 — the target, named per surface. Never `<body>`, never implicit.**

| Surface | Trigger | Focus moves to |
|---|---|---|
| Desktop banner | §S1a rule 4 replaces the action row | the `dismiss` button (`BlockedBanner.tsx:78-80`) |
| Desktop banner, no dismissable control rendered | any | the banner container itself, `tabIndex={-1}` |
| Phone screen 2 | countdown hits `expired`, both buttons `disabled` | the existing `‹ back` button (`index.html:379`, `.p-back` at `:154`) — the only interactive element left on the screen once the two decision buttons disable, and the operator's way out |

> **This costs almost no code.** `BlockedBanner.tsx:78-80` **already** renders a `dismiss` button
> whenever `reason.actions.length === 0`. §S1a rule 4's "replace the action row" is therefore
> literally *set `actions: []` and set the outcome line* — the dismiss button appears with no new
> JSX, and A9 only has to add a `ref` and one guarded `.focus()`.

**A9.4 — focus moves BEFORE A7 clause 3 announces.** `Approved.` / `Denied.` spoken into a polite
region while focus sits on `<body>` tells the AT operator the outcome and simultaneously loses them
their place. Move first, announce second; a polite region will not interrupt the focus move.

**Why not reuse `Modal`'s machinery.** `Modal.tsx:104` restores focus to the opener and `:126-132`
traps it inside. Both are correct for a consent dialog the operator opened deliberately and both are
wrong for a timed interrupt that arrives unbidden (§S1a, decision #2). A9 takes `Modal`'s *restore*
instinct without its *trap* and without its *seize-on-open*.

---

## Containment Protocol — how the plan proves it did not break the layout

Carried from `02-UI-SPEC.md:497-528`, binding, with one addition specific to this phase.

1. Build the **base sha** and the **head sha** and run the *identical* probe against both. A
   head-only measurement cannot distinguish "this phase caused it" from "it was already broken".
2. Probe at **1280, 1024 and 800** logical widths using CDP `Emulation.setDeviceMetricsOverride` —
   `page.setViewportSize`, `win.setBounds` and `win.setContentSize` all leave `window.innerWidth`
   pinned at 1280 in Electron (`01-15`).
3. The probe prints the **true `window.innerWidth`** beside the requested one and reports a positive
   control (element found + mounted).
4. Any container integer that changes, changes by the **measured delta**, in its own atomic commit,
   with the measurement in the commit message. Never by arithmetic on font metrics.

**Probe infrastructure status: DOES NOT EXIST as a committed script.** `scripts/` holds
`mcp-live-probe.cjs`, `phone-curl-check.cjs`, `tunnel-live-check.cjs`,
`verify-keepalive-catchup.mjs` and `verify-worker-gc.mjs` — none is a CDP layout probe. `e2e/smoke.spec.ts`
is the only committed live-window harness. The probe is built per-plan and thrown away, as in
`01-15`/`01-18`.

### ⚠ THE TITLEBAR CONSTANTS ARE MEASURED AND THIS PHASE INVALIDATES THEM

`App.tsx:55-56` pins `TUNNEL_CHIP_W1 = 833` and `TUNNEL_CHIP_W2 = 783` — two **live-measured,
pinpointed-to-the-pixel** titlebar overflow thresholds, derived with the `PUBLIC` chip present and
**no second chip**. §S6 adds a second chip to that same 36px strip.

**Binding:** the plan that lands the `QUIET` chip **must re-measure both constants with both chips
present**, by the same method, and either correct them or add a third. Deriving the new value by
adding an estimated chip width to 833 is exactly the arithmetic that produced `01-14`'s
zero-width-name defect.

**Degradation order, declared not improvised.** Neither chip may be dropped entirely — presence is
the signal for both. When the strip cannot hold both at full width:

| Step | `PUBLIC` | `QUIET` |
|---|---|---|
| widest | `PUBLIC · host` | `QUIET 32m` |
| step 1 | `PUBLIC · host` | `QUIET 32m` (the `auto mode on/off` text hides first — existing behaviour) |
| step 2 | `PUBLIC` (host dropped — existing `TUNNEL_CHIP_W2` behaviour) | `QUIET 32m` |
| step 3 *(new)* | `PUBLIC` | `QUIET` (duration dropped) |

**Surfaces that must be in the probe set:** the titlebar with **all four** combinations of the two
chips; `AgentCard` (god, worker with a note, worker with gaps + MCP); `AgentStrip`; `TasksKanban`
at its 170px minimum column width with an aged card *and* a `DROPPED BY` card; `AskMeTab` with a
countdown row; `CommandCenterPanel` and `AgentDetailPanel` with a GATE-05 banner open.

### The agent card's geometry is frozen

`AgentCard.tsx:193` `width = 322`, `:198` `height = 86`. 02-UI-SPEC records a real STOP on this
surface: a capability chip and a fully-populated MCP element cannot both hold `maxWidth ≥ 80px` on
the same row. **This phase adds nothing to the agent card.** VIGIL-03 changes only *where the status
comes from*, not what is drawn (§S4). If an executor concludes the card must grow, that is a
stop-and-report.

---

## Per-Surface Contracts

### S1 — GATE-05: the third answer and its countdown

Three delivery surfaces, one ask. **The wire schema is fixed first because L-12 binds it.**

#### Rule G-1 — the wire field stays `taskId`. Locked.

`resources/phone/index.html` contains `taskId` **21 times** and `resources/phone/sw.js` **10 times**
(RESEARCH L-12, re-confirmed this session: `index.html:289-292, 341, 372, 381, 434-436, 481-502`;
`sw.js:31, 37-38, 45, 51`). `sw.js` is installed on the operator's phone and updates on its own
schedule.

**`PhoneAsk` (`webhook.ts:111-117`) gains exactly one field and renames nothing:**

```ts
export interface PhoneAsk {
  taskId: string;          // UNCHANGED NAME. For kind:'tool' this carries the ASK id.
  title: string;
  question: string;
  agent?: string;
  askedAt?: string;
  kind?: 'card' | 'tool';  // NEW. Absent === 'card' — every existing producer stays valid.
  expiresInMs?: number;    // NEW, kind:'tool' only. A DURATION, never a deadline. See G-3.
  // NO THIRD KIND. The floor-quiet alarm reaches the phone on the SAME response
  // as a sibling field, not as an ask — §S6a rule Q-1b states the reason.
}
```

The ask id must satisfy `PHONE_TASK_ID_RE` (`webhook.ts:231`, `/^[A-Za-z0-9._-]{1,128}$/`) because
`handlePhoneAnswer` validates against it at `:670` **before** `answerAsk` is called. An id of the
shape `ask-<hex>` from `node:crypto` satisfies it. **Verify this in a test, not by inspection** — an
ask id that fails the regex produces a 400 the operator reads as "the floor is broken".

#### Rule G-2 — `answerAsk` widens its RETURN, back-compatible both ways

Today: `answerAsk?: (taskId: string, answer: string) => boolean` (`webhook.ts:152`), and
`handlePhoneAnswer` emits `json(res, 200, { ok })` (`:675`).

The phone cannot tell "expired" from "answered on the desktop" from "server error" — and those have
**opposite outcomes** (expired ⇒ the command was denied; answered elsewhere ⇒ it may have run). At
3am that difference is the whole point. Minimal widening:

```ts
type AnswerOutcome = boolean | { ok: boolean; state?: 'expired' | 'settled' };
```

`handlePhoneAnswer` normalizes to `json(res, 200, { ok, state })`. An **old phone** reads `ok` and
ignores `state`. A **new phone** reads both. The card path may keep returning a bare `boolean`.
Zero break in either direction, one optional field on the response — the same discipline as `kind`.

#### Rule G-3 — the countdown is a DURATION, and it is never optimistic

**Never send a deadline timestamp to a client.** The phone's clock is not the floor's clock, and a
countdown that is optimistic by even a few seconds tells the operator they have time to answer a
question that has already auto-denied. `expiresInMs` is a **duration measured by the server at
response time**; the client records `receivedAt = Date.now()` and counts down from there. Duration
is skew-immune; the only error is one-way transit latency, which makes the client *later* than the
server by tens of milliseconds. That is the wrong sign, so:

1. **Below 10 seconds the client stops showing a number.** It renders the word `expiring` (desktop:
   `expiring — will deny`). The last ten seconds are the window where skew and latency could lie,
   so no number is shown in it.
2. **At or below zero it renders `expired`, and every decision control is disabled.**
3. **The client never decides the outcome.** `sending…` on tap; the screen says `approved` or
   `denied` only when the server's response says so. There is **no optimistic UI** on a tool
   approval — this is the explicit "must not imply an answer was accepted after the deadline
   passed" rule, and optimistic UI is precisely how that lie gets told.
4. The countdown re-derives every **1000ms** from `receivedAt + expiresInMs - Date.now()`. Never by
   decrementing a counter — a backgrounded tab or a throttled interval makes a decremented counter
   drift arbitrarily far in the optimistic direction.
5. **A refresh re-anchors.** The phone's existing 10s poll (`index.html:249`, `:518`) returns a
   fresh `expiresInMs`; the client replaces `receivedAt` and the duration together, atomically.

**Format** (both platforms, `--cth-text-body-md` / `--p-text-sm`):

| Remaining | Rendered |
|---|---|
| ≥ 60s | `2m 04s left` |
| 10–59s | `45s left` |
| < 10s | `expiring` (desktop banner: `expiring — will deny`) |
| ≤ 0 | `expired` |

#### S1a — the desktop banner

**Component:** `BlockedBanner` (`BlockedBanner.tsx:10`), **reused, not replaced.** It is already the
app's "needs you" surface, already coral-framed, already renders a `command` line (`:44-58`), already renders
`approve`/`deny`/`neutral` buttons from `reason.actions`. It is rendered at
`AgentDetailPanel.tsx:221` and `CommandCenterPanel.tsx:236`.

**Not a modal.** An ask that arrives at 3am, auto-resolves in ~two minutes, and can arrive while the
operator is mid-sentence in another agent's terminal must not seize the application. `Modal.tsx`
traps focus (`:126-132`) and restores it on close (`:104`) — correct for the MCP consent flow, wrong
for a timed interrupt.

**`BlockReason` (`store.ts:19-29`) gains two optional fields:**

```ts
askId?: string;        // present === this is a GATE-05 ask, not a GATE-03 notice
expiresInMs?: number;  // duration at the moment the renderer received it
```

`BlockedBanner`'s `onAction` callers (`AgentDetailPanel.tsx:221`, `CommandCenterPanel.tsx:236`)
branch on `reason.askId`:

- **`askId` present** → call the approval IPC with `(askId, approved)`. **Never `writePty`.**
  ADR-0001 (`docs/adr/0001-one-gate-for-pty-writes.md`) says exactly one place types into a live
  PTY; the answer rides the hook return. The existing `if (send && agent.ptyId) writePty(...)` path
  stays for the PTY-parser-derived reasons it was written for.
- **`askId` absent** → today's behaviour, unchanged.

**Layout — three rows added to the existing banner, in this order:**

| Row | Content | Style |
|---|---|---|
| existing header | `<Icon name="bell" />` + `needs you` | unchanged (`BlockedBanner.tsx:20-30`, the `bell` + `needs you` row at `:27`) |
| existing summary | `Ada wants to run this` | unchanged |
| existing detail | the `ASK_*` sentence | unchanged |
| existing command | `$ {command}` | **modified — see rule 3 below** |
| **new: countdown** | `<Icon name="clock" />` + `2m 04s left` | `--cth-text-body-md` / `--cth-lh-body-md`, colour `--cth-ink-700` (8.89:1 / 6.47:1). Right-aligned in the button row, `marginLeft: 'auto'` |
| existing actions | `approve` `deny` | `PixelButton` `variant="primary"` / `variant="destructive"`, `size="sm"` |

**Rule 1 — the countdown escalates on the ink ramp, never to coral.** At **≤ 30s**: colour
`--cth-ink-900` (12.96:1 / 10.13:1), `fontWeight: 600`, and the text changes to `30s left`, then
`expiring — will deny` below 10s. Three channels — weight, ink level, wording — plus the `clock`
icon that was there all along. Measured rationale in §Color.

**Rule 2 — `approve` is `variant="primary"`, `deny` is `variant="destructive"`.** This looks
inverted and is not. `PixelButton.tsx:49-53` renders `primary` as an ink-900 fill — the app's
"this is the action you came here to take" treatment. The operator opened this banner to make a
decision; `approve` is the decision that requires the ink. `destructive` is the app's **coral**
register (`PixelButton.tsx:71-76`), which correctly marks `deny` as the terminating action. Both are
deliberate, one click each, no second dialog.

> **Prerequisite:** `deny` may not ship until `PixelButton.tsx:74` is fixed — see §Color's measured
> defect. At 1.85:1 in dark mode the word `deny` is not on the screen.

**Rule 3 — ⚠ A COMMAND UNDER APPROVAL MAY NEVER BE ELLIPSISED.** `BlockedBanner.tsx:53-55` currently
renders the command with `whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'`. For
an **ask** that is a defect with teeth: `git push origin +main --force` truncated to
`git push origin +ma…` hides the dangerous half, and the dangerous half is frequently at the end.

- `askId` present → `whiteSpace: 'pre-wrap'`, `wordBreak: 'break-all'`, `maxHeight: 96px`,
  `overflowY: 'auto'`. It wraps and scrolls. It never ellipsises.
- `askId` absent (a GATE-03 notice) → today's ellipsis is retained. That command already did not run.

**Rule 4 — resolution never makes the banner vanish, and it never drops focus.** When the ask
resolves (answered here, answered on the phone, or expired) the action row (`BlockedBanner.tsx:60-82`)
is **replaced** by a one-line outcome from the Copywriting Contract plus a `dismiss` button. A banner
that silently disappears leaves the operator unable to tell whether they approved something. It
persists until dismissed; the next ask for that agent overwrites it (`blockReason` is singular per
agent, `store.ts:56`).

Mechanically this is *set `actions: []` and set the outcome* — `BlockedBanner.tsx:77-80` already
renders the `dismiss` button on exactly that condition, so the swap needs no new JSX.

> **⚠ This rule unmounts the node the operator is standing on.** They just clicked `approve` or
> `deny`; that button is gone in the next render and focus falls to `<body>`. **Rule A9.2 is
> mandatory here, not optional** — focus moves to `dismiss` in the same render, guarded on focus
> having been inside the banner.

**Rule 5 — an ask never steals selection.** The banner only renders for the selected agent. For an
unselected agent the roster signal is the existing `PixelBadge status="blocked"` → `needs you`
(`PixelBadge.tsx:41`), and the fast path is the desktop notification, which **already**
click-to-focuses the agent (`hooks.ts:1499`: `n.on('click', () => this.focus?.(agentId))`).
Auto-selecting an agent out from under an operator who is mid-task is worse than the delay.

#### S1b — the phone

**Both screens change; the file inventory does not.** No new file, no framework, no router.

**Screen 1 — the ask list.** A `kind:'tool'` item is structurally identical to a `kind:'card'` item
and hue-different, so the list stays one scannable column:

```
┌─────────────────────────────────┐
│ NEEDS YOU                    3  │
├─────────────────────────────────┤
│ ▌ Ada · 4m ago                  │  2px --p-accent rule, --p-accent-fill band
│   Fix the auth redirect loop    │  a CARD ask — unchanged
│   Should I drop the legacy…     │
├─────────────────────────────────┤
│ ▌ Ada · 1m 48s left             │  2px --p-warn rule, --p-warn-fill band
│   wants to run a command        │  a TOOL ask
│   rm -rf ./build/vendor         │  the command, --p-font-mono, 2 lines clamped
└─────────────────────────────────┘
```

| Slot | `kind:'card'` (unchanged) | `kind:'tool'` (new) |
|---|---|---|
| 2px header rule | `--p-accent` | `--p-warn` |
| header band | `--p-accent-fill` | `--p-warn-fill` |
| meta line | `{agent} · {timeAgo(askedAt)}` | `{agent} · {countdown}` |
| title line | task title, `--p-text-2` | `wants to run a command`, `--p-text-2` |
| body line | question, `--p-text`, 2-line clamp | **the command**, `--p-font-mono`, `--p-text-sm`, 2-line clamp |
| accessible name | `{agent} asks: {title}` (`index.html:339`) | `{agent} wants to run: {command}` |

The existing `timeAgo` helper (`index.html:326-336`) is reused unchanged for `kind:'card'`. The
countdown is a second, separate function — **do not overload `timeAgo`**; it takes an ISO string and
counts *up*, and the countdown takes a duration and counts *down*.

**Screen 2 — the tool ask.** Same frame as the answer screen, with the textarea **removed**:

```
┌─────────────────────────────────┐
│ ‹ back                          │  min-height 48
├─────────────────────────────────┤
│ Ada · 1m 48s left               │  --p-text-sm, --p-text-3; countdown in --p-warn
│ wants to run a command          │  --p-text-lg
│                                 │
│ rm -rf ./build/vendor           │  --p-font-mono, pre-wrap, NEVER truncated
│                                 │
│ This deletes a directory tree   │  the ASK_* sentence, --p-text-md
│ recursively. Nothing here can   │
│ put it back.                    │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │          approve            │ │  56px, --p-warn fill, --p-on-accent (6.47:1)
│ └─────────────────────────────┘ │
│              (16px)             │
│ ┌─────────────────────────────┐ │
│ │           deny              │ │  56px, --p-raise fill, --p-text, --p-line hairline
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

- **`deny` is at the bottom, `approve` above it, with `--p-4` (16px) between them.** The bottom
  button is the thumb-reachable one on a one-handed phone at night; the thumb-reachable one must be
  the safe one. The 16px gap means a fat-finger slip off `deny` lands in dead space, not on
  `approve`.
- **`approve` is the coloured button, and that is not a recommendation.** `--p-warn` marks it as
  the consequential choice — the same reason Phase 1 reserves coral for destructive actions. `deny`
  is `--p-raise` (#26262C) with a `--p-line` hairline: quiet, but a full 56px target.
- **No textarea, no draft persistence.** There is nothing to type and nothing to lose. The
  `localStorage` draft machinery (`index.html:289-292`) is **not** engaged for `kind:'tool'` — a
  persisted "draft" for a question that expired in 120 seconds is garbage that outlives its ask.
- **The command is never truncated on screen 2** (`white-space: pre-wrap; word-break: break-all`),
  same rule and same reason as §S1a rule 3.
- Both buttons `disabled` while a POST is in flight and once the countdown reaches `expired`.
  **A9.2/A9.3 apply at `expired`**: disabling the focused button strands focus on `<body>`, so focus
  moves to the `‹ back` button (`index.html:379`) in the same render, guarded on focus having been
  on one of the two decision buttons. *(The in-flight case needs no move — `sending…` resolves in
  under a second and the button remounts enabled or replaced.)*

**Send semantics.** POST `/phone/api/answer` with `{ taskId: <askId>, answer: 'approve' | 'deny' }`.
`answer` must be non-empty to pass `webhook.ts:670`; these two literals do. Main maps them to the
verdict; **any other string for a `kind:'tool'` ask is treated as a deny**, because an ambiguous
answer to "may I run rm -rf" is a no.

**Race states, all four, all rendered:**

| State | Rendering |
|---|---|
| in flight | both buttons disabled, tapped button's label → `sending…`, fill → `--p-raise` |
| server says `{ok:true}` | button area → `approved` / `denied` in `--p-ok`, 1.5s, then back to the list with that ask gone |
| server says `{ok:false, state:'expired'}` | the expired copy in `--p-warn` above the buttons; both stay disabled; the ask is removed from the list on the next poll |
| server says `{ok:false, state:'settled'}` | the settled copy in `--p-warn`; both disabled |
| server says `{ok:false}` with no state, or the fetch throws | the send-failed copy in `--p-warn`; **buttons re-enable** if the countdown has not expired |

#### S1c — the desktop OS notification and the renderer channel

`emitControl` (`hooks.ts:1521-1522`) sends `control:approvalRequest` with `{ agentId, tool, reason }`.
**The channel already exists and is already named for this.** Its listeners, traced end to end this
session:

| Layer | Location | State |
|---|---|---|
| main emit | `hooks.ts:1522` | exists |
| preload bridge | `src/preload/index.ts:1149-1153` (`onApprovalRequest`) | exists |
| renderer consumer | `src/renderer/src/hooks/useHive.ts:614` | **exists** — writes a `BlockReason` with `actions: []` |

So GATE-05 needs **no new channel**. The payload widens additively to
`{ agentId, tool, reason, command?, askId?, expiresInMs? }`; `useHive.ts:614`'s handler branches on
`askId` to build either today's notice (`actions: []`) or an ask (`actions: [approve, deny]`).

The OS toast rides `deps.notify` (`index.ts:4780-4783`) with the existing title/body convention.
**Do not add a second toast** — `useHive.ts:571-579` already records, in a comment, that main fires
the OS toast for the hook event and that a renderer-side toast would double it.

---

### S2 — GATE-03: denial legibility

**No new component.** The path already runs end to end; three things are missing from it.

| Missing | Fix | Location |
|---|---|---|
| **what** was refused | populate `BlockReason.command` — the field exists (`store.ts:22`) and `BlockedBanner` already renders it (`:44-58`), but nothing sets it | `emitControl` (`hooks.ts:1521`) gains a `command` argument; `useHive.ts:617-621` passes it through |
| **for whom** | the summary names the agent: `Ada's Bash call was refused`, replacing `` `${tool ?? 'A tool'} was blocked` `` | `useHive.ts:619` |
| **why** | the verbatim `DENY_*` string, already returned by main (`hooks.ts:251-292`), already passed as `reason`, already rendered as `detail` | already correct at `useHive.ts:620` — **only the fallback string changes**, see below |

**Rule D-1 — never write a second copy of a reason string in the renderer.** The current fallback
(`useHive.ts:620`: *"Denied by operator policy — ungate it from the Command Center to let this agent
continue."*) is a renderer-authored sentence that can drift from main's. Keep a fallback for the
`reason === undefined` case, but it must be a bare `Refused by the floor.` — the specific *why* is
main's to author, in `hooks.ts`, beside the gate that decided it. `hooks.ts:849` already states the
house rule that a ceiling list which omits an item reads as a guarantee that does not hold; a
renderer sentence that invents a reason is the same failure one layer up.

**Rule D-2 — the terminal is not the surface, but it is not removed either.** `useHive.ts:624`
already pushes `⛔ {tool} blocked` into the agent's feed. That stays — it is the audit trail. The
requirement is that the operator does **not have to** read a terminal, and the banner satisfies that.

**Rule D-3 — a refused command keeps its ellipsis.** §S1a rule 3's no-truncation rule applies to
**asks only**. A GATE-03 notice describes a command that already did not run; the full string is in
the feed and the tooltip. Add `title={command}` to the command row so the full text is one hover
away.

**Known limitation, stated not papered over.** `blockReason` is singular per agent (`store.ts:56`),
so a burst of refusals shows only the most recent, and there is **no floor-wide list of everything
that was ever refused**. `DOES NOT EXIST — a floor-wide denial log surface would need a new panel
and a durable store.` RECORD-01's `tool_calls` table is exactly where that would read from, in a
later phase. This contract does **not** specify it, and GATE-03's criterion is met by the per-agent
banner plus the toast.

---

### S3 — GATE-04: the per-engine sandbox opt-in

#### Rule S-1 — one source of truth, spliced in two places, or the preview lies

Landmine L-08, re-verified this session. The auto-mode flag is appended **twice, independently**:

| Splice | File:line | Function |
|---|---|---|
| main | `src/main/config.ts:1067-1068` | `commandForAutoMode` (declared `:1058`) |
| renderer | `src/renderer/src/store/config.ts:430` | `buildSpawnCommand` (declared `:405`) |

They sit in **different tsconfig projects** (`tsconfig.node.json` / `tsconfig.web.json`), so
`npm run typecheck` **will not** catch a drift between them. A sandbox opt-in that edits only one
produces a command the operator reads at `AddAgentModal.tsx:971` that is not the command that
spawns — which is the precise shape of the failure GATE-04's own warning names.

**Binding: both files, one wave, one owner, and a test that asserts the two functions return the
same string for the same config.** Not two tests — one test that calls both.

#### Rule S-2 — the toggle lives in Settings → Autonomy & Budgets

`SettingsModal.tsx:1288` is literally commented *"AUTONOMY & BUDGETS — the safety tab"*. The
floor-wide `autoMode` toggle already lives there (`:1297-1310`) with an established row shape:

```
label (--cth-text-body-md, --cth-ink-900)          [PixelButton size="sm"]
sub-label (--cth-text-body-md, --cth-ink-500)
```

groups separated by `<div style={{ height: 1, background: 'var(--cth-ink-300)' }} />`
(`SettingsModal.tsx:1313`).

The sandbox opt-in is a **new group directly below Autonomy**, headed `SANDBOX` in the same
uppercase display-font section head (`SettingsModal.tsx:1291-1296`), with **one row per engine that
supports a sandbox**.

**Storage follows the house per-engine convention exactly:** `providerBaseUrls?:
Partial<Record<AgentProvider, string>>` (`store/config.ts:154`) and `providerDefaultModels`
(`:156`). Add `providerSandbox?: Partial<Record<AgentProvider, boolean>>`. Absent === off, which is
today's behaviour and therefore the verified fallback D-15 requires.

**AddAgentModal is a read-only reflection, not a second control.** `AddAgentModal.tsx:971` already
relabels its `Row` to `Command (auto mode on)` when `config.autoMode && preset.autoFlag`. Extend the
same pattern: `Command (auto mode on · sandbox on)`. **No toggle is added to that modal** — a
per-engine setting with two controls in two places is how the two splice sites drift in the UI as
well as in the code.

#### Rule S-3 — engines without a sandbox are named once, not listed ten times

Today exactly **one** engine ships the opt-in (codex, D-15). Rendering eleven rows with ten of them
disabled is a wall of "no" that teaches nothing.

**The ruling:** render **one row per supported engine**, then **one quiet line** naming the rest:

> `The other ten engines have no sandbox the floor can turn on.` — `--cth-text-body-md`,
> `--cth-ink-500`, no chip, no colour.

The count is **derived from the preset table, never hard-coded** — when a second engine gains
support the row appears and the number drops by itself. This is the same ruling 02-UI-SPEC §S1 made
for capability gaps: *declare, do not fake, and do not shout.* Hiding the unsupported engines would
be faking; a disabled row each would be shouting.

**Not `disabled`, not hidden — absent, with a sentence.** A `disabled` control implies the operator
could enable it if they did something; they cannot.

#### Rule S-4 — the row's copy names the failure mode

| Element | Copy |
|---|---|
| Section head | `SANDBOX` |
| Row label, off | `Codex — sandbox off (today's behaviour)` |
| Row label, on | `Codex — sandbox on, agent folder writable` |
| Sub-label | `Applies to newly spawned agents. Turn it off if this engine stops writing.` |
| Button, off | `off` (`variant="secondary"`) |
| Button, on | `on` (`variant="primary"`) |

The sub-label names the escape hatch on purpose. The requirement's own warning is that the failure
mode is *"the floor silently stops working at 3am"*; the operator must be able to read the way back
out at the moment they are reading the way in.

---

### S4 — VIGIL-03: blocked is a visible state

#### Rule V-1 — nine badge sites, seven of them agent-status, and exactly one of them is broken

> **⚠ REV 2 — this rule replaces a false claim.** Rev 1 said "all three roster surfaces" and named
> three sites. There are **nine** `PixelBadge` render sites. The miscount hid a real VIGIL-03
> defect, so the full enumeration is now part of the contract rather than a sample of it.

`grep -rn "<PixelBadge" src/`, this session — **nine sites, all nine listed**:

| # | Site | `status` expression | Agent status? | `blocked` reaches the badge? |
|---|---|---|---|---|
| 1 | `AgentCard.tsx:446` | `typing ? 'typing' : status` | yes | **yes** |
| 2 | `AgentDetailPanel.tsx:139` | `agent.status` | yes | **yes** |
| 3 | `CommandCenterPanel.tsx:190` | `agent.status` | yes | **yes** |
| 4 | **`CommandCenterPanel.tsx:795`** | **`armed ? 'looping' : a.status`** | yes | **NO — see rule V-1b** |
| 5 | `FullscreenTerminal.tsx:710` | `typing ? 'typing' : agent.status` | yes | **yes** |
| 6 | `FullscreenTerminal.tsx:956` | `typing ? 'typing' : agent.status` | yes | **yes** |
| 7 | `MemoryGraphPanel.tsx:378` | `node.status` — `AgentNode.status: StatusKind` (`memoryGraph/buildGraph.ts:18`) | yes | yes — but it is a **hover tooltip** (`NodeTip`, `:370`), not a persistent surface |
| 8 | `AskMeTab.tsx:231` | `status="blocked"` **literal**, `label={recipient}` | no | n/a — the badge is a coloured label chip, the status is decoration |
| 9 | `TasksKanban.tsx:342` | `status="working"` **literal**, `label={assigneeName}` | no | n/a — same, a label chip |

**Seven carry an agent status** (1–7); two (8, 9) are the badge used as a label chip with a
hard-coded status and are irrelevant to VIGIL-03. *(The checker's report counted six; the seventh is
`MemoryGraphPanel.tsx:378`, confirmed agent-status-typed at `buildGraph.ts:18` this session. It is
listed for completeness — it maps `blocked` correctly and needs no change.)*

`PixelBadge.tsx` maps the state on **two** channels: colour (`:20-31` — `blocked` →
`--cth-status-blocked`) **plus** a word (`:36-49` — `blocked` → `needs you`, `idle` → `idle`). So on
sites 1, 2, 3, 5, 6 and 7 the blocked/idle distinction is already non-colour-only and already
correct, and VIGIL-03 needs **zero component changes and zero new tokens** on them. Its fix there is
entirely in *where the state comes from* — `delivery.ts:740`'s unguarded `setStatus(…, 'idle')` and
main-side `BLOCK_HINTS` (RESEARCH §Pattern 9).

**Site 4 is the exception, and it is a real defect, not a note.**

#### Rule V-1b — the `armed` override may NOT swallow `blocked`. Binding.

`CommandCenterPanel.tsx:795` renders:

```tsx
<PixelBadge status={armed ? 'looping' : a.status} />
```

`armed` is the Lane-A circuit breaker (`:742`: `!!breaker && (breaker.level === 'constrained' ||
breaker.level === 'stopped')`). While it is set, **a blocked agent reads `looping` on this roster.**
VIGIL-03's requirement is *"an agent blocked on a prompt is visibly blocked"*; on this surface,
under a tripped breaker, it is not — the badge is that row's only blocked signal and the override
takes it.

**Mandated shape:**

```tsx
<PixelBadge status={a.status === 'blocked' ? 'blocked' : armed ? 'looping' : a.status} />
```

**Why `blocked` wins, and why this is not a coin-toss.** `blocked` means *a human must act*;
`looping` means *the breaker tripped and the floor is already handling it*. At 3am the operator can
only act on the first. But the deciding evidence is that **the armed state loses nothing**, because
it already has two other channels on this exact row:

| Armed channel | Location | Survives the fix |
|---|---|---|
| row fill → `--cth-coral-light` | `CommandCenterPanel.tsx:760` | yes, untouched |
| `⚠` glyph with `title={breaker?.reason}` | `CommandCenterPanel.tsx:796` | yes, untouched |
| the badge reading `looping` | `:795` | surrendered **only** when the agent is `blocked` |

So the fix costs `armed` one of three signals in one narrow case, and gives `blocked` its only
signal back. That is not a trade, it is a strict improvement. `DESIGN.md:707` ("colour + icon +
position … never colour alone") stays satisfied for both states.

**One accessibility clause rides with it.** `:796`'s `⚠` is `aria-hidden="true"`, and a `title` on
an `aria-hidden` span is not announced — so for an AT operator the badge is *also* that row's only
armed signal. When both conditions are true the badge says `needs you`, which would leave the
breaker silent. **Therefore: when `armed && a.status === 'blocked'`, the `⚠` span drops
`aria-hidden` and takes `role="img"` + ``aria-label={`circuit breaker: ${breaker?.reason}`}``** —
A2's shipped pattern (`TasksKanban.tsx:262`), applied where it is now load-bearing. Both truths
reach both kinds of operator; neither state is silent.

**Scope.** This is one expression and one conditional `aria` swap in a file this phase already
touches. It is not an opportunistic fix (decision #30): it is the literal text of VIGIL-03's
acceptance criterion failing on a shipped surface.

| State | Swatch | Label | Distinguished by |
|---|---|---|---|
| `idle` | `--cth-status-idle` | `idle` | colour + word |
| `working` / `thinking` | `--cth-status-working` / `-thinking` | `working` | colour + word |
| `waiting` | `--cth-status-waiting` | `waiting` | colour + word |
| `blocked` | `--cth-status-blocked` | `needs you` | colour + word |

**`paused` is not a `StatusKind`.** `PixelBadge.tsx:3-12` declares ten kinds and `paused` is not
among them; pause is a `ControlRegistry` flag surfaced elsewhere. **Do not invent a paused badge.**

#### Rule V-2 — the context line carries the prompt, and that is the whole new affordance

`AgentCard.tsx:220`: `const infoLine = (status !== 'idle' && action) ? action : project;` — the card
already has a row that shows `action` whenever the agent is not idle. When main marks an agent
blocked it **also** sets `action` to the matched prompt line. The card then reads
`Ada · needs you · Do you want to proceed?` with the terminal nowhere on screen, which is exactly
what VIGIL-03 asks for, at **zero geometry cost** on a card that has ~3px of slack.

Subject to **A8**: stripped of control bytes in main, capped at 120 characters in main, ellipsised
by CSS.

#### Rule V-3 — carry the known false positive with the code

`BLOCK_HINTS` (`usePtyParser.ts:31-37`) has a documented false positive: an agent that merely
**echoes** a yes/no prompt reads as blocked (`useHive.ts:140-144`), recovering on its next real
turn-end. That behaviour **moves with the list** into the shared module. It is inherited, not
introduced. The UI consequence is that `needs you` can be briefly wrong; the recovery path must be
preserved, and the contract does **not** add a confirmation step or a delay to hide it — a
half-second of a wrong badge is cheaper than a missed block.

---

### S5 — VIGIL-04: age on the board

#### Rule A-1 — one shared formatter, four existing copies left alone

Four independent relative-time implementations exist:

| Location | Shape |
|---|---|
| `WorkersTab.tsx:20` `relAge(ms)` | `0s` / `47s` / `4m` / `9h` / `3d` |
| `git/CommitGraph.tsx:57` `relTime(ms)` | `…s` / `…m` / `…h` / `…d` / `…mo` |
| `triggers/SchedulesSection.tsx:36` `relTime(ms)` | `just now` / `4m ago` / `in 3h` |
| `triggers/TriggerHistoryTab.tsx:106` `relTime(ms)` | same as above |
| `resources/phone/index.html:326` `timeAgo(iso)` | `just now` / `4m ago` / `9h ago` / `3d ago` |

**The new surfaces use `WorkersTab.tsx:20`'s shape**, extracted to a shared electron-free module the
kanban and the ask board both import. It is the terse one, and the kanban column is 170px minimum
(`TasksKanban.tsx:186`).

**The four existing call sites are NOT refactored.** Rewriting them is churn with a regression
surface and no requirement behind it. `resources/phone/index.html:326`'s `timeAgo` is likewise
untouched — it is inside a hash-pinned CSP block and it is already correct.

#### Rule A-2 — stale is "the age stopped being minutes", i.e. ≥ 60 minutes

The requirement's own test is *"nine hours in `doing` vs four minutes in"*. Rather than invent a
threshold constant, **tie staleness to the unit boundary the format already crosses**: an age that
renders in `h` or `d` is stale; an age that renders in `s` or `m` is not.

One rule, no magic number to remember, and — the point — the **unit letter and the emphasis change
together**, which is what makes the two cases distinguishable at 14px at a glance.

| | fresh (`4m`) | stale (`9h`) |
|---|---|---|
| colour | `--cth-ink-500` (6.10:1 light / 5.65:1 dark on `--cth-paper-100`) | `--cth-ink-900` |
| weight | 400 | **600** |
| icon | none | `<Icon name="clock" />`, 16×16, `aria-hidden` |
| text | `4m` | `9h` |

**Four channels: unit, colour, weight, icon.** `DESIGN.md:707` ("never colour alone") is satisfied
three times over. This is the exact acceptance test for VIGIL-04 and the plan should assert it as
one: render a card at `updatedAt = now - 4min` and one at `now - 9h`, assert the second carries the
clock icon and `fontWeight: 600` and the first carries neither.

**`done` cards never take the stale treatment.** A card finished three days ago is not a problem;
lighting it up is noise. Staleness emphasis applies in `todo`, `doing` and `blocked` only. (`todo`
is included deliberately: a card nobody picked up for nine hours is the same failure as one nobody
finished.)

#### Rule A-3 — relative on the card, absolute in the tooltip and the overlay

| Surface | Format |
|---|---|
| Kanban card | relative (`9h`) |
| Kanban card `title` | `updated {local ISO}` — or, when `updatedAt` is absent, `created {local ISO} — never updated` |
| `TaskDetail` overlay | absolute, beside the existing `const created = new Date(task.createdAt)` at `TasksKanban.tsx:315` |
| ASK ME card | relative (`9h`), `title` = `asked {local ISO}` |
| Phone | relative — **already shipped**, `index.html:344` (list) and `:382` (detail) |

**The `updatedAt`-absent case must be visible, not silently substituted.** Every card on disk today
has `createdAt` and no `updatedAt` (`hive.ts:119-152`, D-30). Falling back to `createdAt` is right —
a card never updated *has* been sitting that long — but the tooltip must say which clock it read, or
the operator cannot tell "nine hours since the last change" from "nine hours since it was created
and nothing has ever touched it".

#### Rule A-4 — where the age goes, exactly

**Kanban card (`TasksKanban.tsx:252-259`).** The card is `title` (2-line clamp) + an assignee line
that only renders when `task.assignee` exists. Convert that second line into a **meta row** that
always renders:

```
[ASSIGNEE NAME ────────── flex:1, ellipsis]  [age ── flexShrink:0]
```

- assignee: unchanged style (`--cth-text-display-md`, `--cth-ink-500`, uppercase, ellipsis)
- age: `--cth-text-body-md` / `--cth-lh-body-md`, `--cth-font-ui`, `flexShrink: 0`, `marginLeft: auto`
- when there is no assignee the row still renders, with the age alone

**No new row, no height change.** The row already exists; it becomes unconditional.

**ASK ME card (`AskMeTab.tsx:210-234`).** Re-read this session — rev 1's `212-222` did not contain
the insertion point. The header `<div>` opens at **`:210`** (`display: 'flex', alignItems: 'center',
gap: 8, padding: '6px 9px'` at `:211`) and holds, in order: the title `<button>` (`:214-224`,
`flex: 1`), the recipient badge wrapped in a `title` span (`:230-232`, the `PixelBadge` itself at
**`:231`**), and the dismiss `<button>` (from `:234`).

**Insert the age immediately before the badge's wrapper span — that is, before `:230`** —
`flexShrink: 0`, same treatment as the kanban card. The header's existing `gap: 8` absorbs it and
the title button's `flex: 1, minWidth: 0` gives up the width.

**Per A4, the agent card is untouched** — it carries no task age.

---

### S6 — VIGIL-01 and VIGIL-02: the alarm and the released card

#### S6a — the once-only alarm (VIGIL-01)

**D-25's three channels, plus one persistent surface on each platform. One edge, no repeats.**

`04-CONTEXT.md:351-353` locks the channel set verbatim: *"Route the alarm through the same three
channels as D-09 (desktop `Notification`, the phone ask list, Web Push) so 'the operator is told'
does not mean 'a window was open'."* All three are here. **Rev 1 substituted the titlebar chip for
the phone ask list; that was a silent deviation from a locked decision and is corrected below** —
the chip is an *addition*, not a replacement, and the phone gets its own persistent surface.

| # | Channel | Mechanism | Fires |
|---|---|---|---|
| D-25 ① | Desktop `Notification` | `deps.notify({title, body})` (`index.ts:4780`), gated on `readConfig().notifications` like every other toast (`boot.ts:411-413`) | **once** per quiet edge |
| D-25 ② | **Phone ask list** | a `floorQuiet` **sibling field** on `GET /phone/api/asks` (`webhook.ts:640`), rendered as a pinned strip above the list — **rule Q-1b** | persists while the latch is set |
| D-25 ③ | Web Push | `src/main/push.ts` → `sw.js` | **once** per quiet edge |
| *(added)* | Desktop in-app | **titlebar `QUIET` chip** — rule Q-1 | persists while the latch is set |

Channels ① and ③ are **transient**; ② and the chip are **persistent**. Each platform now has exactly
one of each, which is the whole point of Q-1's argument — applied to both platforms instead of one.

**Rule Q-1 — the chip is the desktop in-app affordance, and there is no panel.** A notification is transient:
an operator who was away comes back to an app that shows nothing. The alarm must be findable after
the fact. The titlebar is the app's established always-visible slot (`App.tsx:411-440`, the `PUBLIC`
chip), so the alarm goes there. **No new panel, no new modal, no toast centre.**

Geometry copies the shipped chip **verbatim** (`App.tsx:417-426`):

```
background: var(--cth-coral)          // was --cth-lemon
color: var(--cth-on-accent)           // 5.34:1 light / 7.12:1 dark — measured
boxShadow: inset 0 0 0 1px var(--cth-ink-900)
padding: '1px 4px 0'
font: var(--cth-font-display) / var(--cth-text-display-md) / var(--cth-lh-display-md)
```

**Rule Q-1b — the phone's persistent surface is a pinned strip, NOT a third ask kind.**

The same argument, on the surface the operator actually has at 3am. Miss or swipe the push and an
alarm with no persistent surface leaves the phone showing nothing — the exact failure Q-1 names.

**Wire shape — additive, and it does not touch `PhoneAsk`:**

```ts
// webhook.ts:640, today:            json(res, 200, { ok: true, asks });
// with the alarm:                   json(res, 200, { ok: true, asks, floorQuiet });
//   floorQuiet?: { sinceMs: number; inFlight: number; agent?: string; card?: string }
```

`floorQuiet` is a **duration** (`sinceMs`), never a timestamp — §S1 rule G-3's reason applies
unchanged. Absent === the floor is moving.

**Rendering.** The list screen already has this exact slot: `screenListHtml` renders
`state.banner` as `<p class="p-offline-bar">` **above** the `<ol>` (`index.html:356-357`, CSS at
`:86-94`). The alarm is a second strip in that slot, in the warn register:

```
┌─────────────────────────────────┐
│ ▌ The floor has stopped.        │  --p-warn-fill band, 2px --p-warn left rule
│   Nothing has moved for 32m.    │  --p-text, --p-text-sm
│   2 cards were in flight.       │  --p-text-2
├─────────────────────────────────┤
│ Nothing needs you right now.    │  the EXISTING empty state, still correct
└─────────────────────────────────┘
```

| Property | Value |
|---|---|
| container | `<p class="p-quiet-bar" role="status">` — a **new class copying `.p-offline-bar`** (`:86-94`) with `background: var(--p-warn-fill)`, `color: var(--p-text)`, `box-shadow: inset 2px 0 0 var(--p-warn)` |
| **not** `state.banner` | a **new** `state.floorQuiet`. The offline banner and the quiet alarm are different facts and can co-occur; overloading one slot would make one of them invisible |
| position | directly **below** the offline banner, **above** the `<ol>` — a floor-wide condition outranks any single ask |
| accessible name | the visible text is the name (A1). `role="status"` is polite: it is announced when it appears and never interrupts |
| contrast | **no new measurement needed.** All three pairings are already in §Color — phone: `--p-text` on `--p-warn-fill` **10.13:1**, `--p-text-2` on `--p-warn-fill` **6.47:1**, `--p-warn` 2px rule on `--p-warn-fill` **4.99:1** (bar 3.0). No new property, no new hue |
| **tap** | **none. It is not interactive and it does not pretend to be.** No `<button>`, no `data-action`, no cursor change. There is nothing to answer and, unlike the desktop, no task board to open — A6's "no `div` with a click handler" is satisfied by there being no handler at all |
| dismissal | **none, by design.** It is server state, not client state: it appears when the latch sets and disappears when the poll (`index.html:249`, `:465`) stops returning `floorQuiet`. Identical lifecycle to the desktop chip (Q-3), and it cannot be swiped away while the floor is still stopped |

**Copy** — one new `COPY` entry with three cases, formatted client-side from `floorQuiet`'s fields
(the strip never renders a server-authored sentence — same discipline as §S2 rule D-1 in reverse:
the *data* is main's, the *wording* is the surface's):

> `The floor has stopped. Nothing has moved for 32m. 2 cards were in flight.`
> *(nothing in flight)* `The floor has stopped. Nothing has moved for 32m. No cards were in flight.`
> *(the god died)* `Michael is gone. The floor has no orchestrator, and nothing has moved for 32m.`

**Why not a third `kind: 'alarm'` on `PhoneAsk`** — the shape the checker suggested first, rejected
for three measured reasons, not for effort:

1. **It would lie in the heading.** `screenListHtml:352-354` computes `count = state.asks.length`
   and picks `count > 0 ? 'NEEDS YOU' : COPY.emptyHeading`. An alarm in the array renders
   **`NEEDS YOU 1`** and suppresses the empty state — when in fact *nothing* is asking. "The floor
   has stopped" and "one agent needs an answer" are opposite facts; the count badge would report the
   second while the first is true.
2. **It would force a tappable item to be un-answerable.** Every `<li>` in that list is a
   `<button class="p-ask" data-task-id=…>` (`askItemHtml:338-350`) whose tap opens the answer
   screen. An entry that opens a textarea for a question nobody asked is worse than no entry.
3. **It needs three special cases on the answerable path** (count, heading, tap) versus **one new
   CSS class and one `if`** in a slot that already exists. Rung 2 of the ladder: the pattern is
   already in the file.

D-25 says *"the phone ask list"*, and this is on the ask-list screen, delivered on the ask-list
response, persistent across a missed push. What it is **not** is an *ask* — because it is not one.

**L-12 re-verified against this shape, and it is untouched by it.** `PhoneAsk` gains **no** field
here, `taskId` is neither renamed nor reused, and `PHONE_TASK_ID_RE` (`webhook.ts:231`, enforced at
`:670`) is not in the path at all — the strip has no id and posts nothing. The 21 `taskId`
occurrences in `index.html` and the 10 in `sw.js` are all still valid. *(The push channel's
`taskId: 'floor-quiet'` in rule Q-4 is unchanged and does satisfy the regex — that is the push tag,
a separate thing.)*

**Two build contracts ride this, both already stated, both binding here:** the new CSS class lives
inside the hash-pinned `<style>` block, so `test/build-assets.test.cjs:149-170` must be re-run in
the **same** commit (§Color — phone); and `index.html` is served fresh off disk on every GET
(`webhook.ts:710`), so unlike `sw.js` there is **no installed-old-client case** for the renderer —
the strip and the server that emits it always ship together.

**Rule Q-2 — the chip is a `<button>` and it opens the task board.** "What was in flight when it
stopped" is exactly the `DOING` column, and with §S5's age on every card the operator sees at a
glance that all of them have been sitting for thirty-two minutes. VIGIL-01 composes with VIGIL-04
and needs no surface of its own.

Accessible name: `Floor quiet for 32 minutes — 2 cards in flight. Open the task board.` (A1: the
chip's visible text is `QUIET 32m`, which is not a sufficient name, so this one **does** take an
`aria-label`.)

> **Open — planner's discretion.** The exact store action that switches the sidebar to the task
> board was **not** read in this session. `useStore` exposes `openTaskDetail` (`TasksKanban.tsx:119`)
> and `setIdeOpen` (`CommandCenterPanel.tsx:221`), so a tab-switching action plausibly exists in
> `store/store.ts` or `SidebarTabs.tsx` — **do not assume it; read it.** If none exists, the lazy
> fallback is to reuse whatever `SidebarTabs` already calls, not to add a new store slice.

**Rule Q-3 — told once means told once.** One toast and one push per quiet **edge** (D-25's latch).
No repeats, no escalation ladder, no re-fire on a timer. The chip is a *state*, not a repeat
notification, and states do not fatigue. The latch clears on the first real activity and the chip
disappears with it.

**Rule Q-4 — the push payload is compatible in both directions.** `sw.js:26-42` reads
`data.agent` (→ title) and hard-codes `body: 'is waiting on you'`, and `sw.js` is installed on the
operator's phone.

```js
// sw.js, the ONE line that changes:
body: (typeof data.body === 'string' && data.body) ? data.body : 'is waiting on you',
```

- **New server + old SW** → `body` ignored, title renders. Truthful because of the title rule below.
- **Old server + new SW** → `body` absent, falls back. Identical to today.
- **The title must be self-sufficient** — `The floor has stopped`, `Michael is gone`. Never `Floor`,
  never `Alert`.
- `tag: 'ask:' + taskId` (`sw.js:38`) replaces rather than stacks. A floor alarm uses a **distinct,
  stable tag** so it replaces its own previous notification and never collides with a real ask.
  Send `taskId: 'floor-quiet'` — it satisfies `PHONE_TASK_ID_RE` and it means the alarm can never
  stack on itself.
- **The security property holds unchanged:** the notification body never carries a question, a path
  or a command (`sw.js:33-35` states why). The floor alarm's body carries a duration, an agent name
  and a card title — the card title is already exposed in the ask list, so this adds no new leak.

**Rule Q-5 — `sw.js` changes are a live-device risk with no local reproduction.** It does
`skipWaiting()` (`:19`) and `clients.claim()` (`:23`), so it updates aggressively — but only once
the phone fetches it. Q-4's fallback is what makes that safe. **The plan must not change any other
line of `sw.js`, and must not change `taskId`'s name anywhere** (Rule G-1).

#### S6b — the released card (VIGIL-02)

**Two writes. The card must be correct after the first and merely richer after the second.**

`HiveTask` gains one optional field, following the `HumanQA` / `review` convention of optional ISO
strings already present at `hive.ts:111-117` (`HumanQA`) and `hive.ts:149` (`review?`) — both
re-opened this session; rev 1 cited `:147` for `review?`, which is a comment line:

```ts
released?: {
  by: string;       // write 1 — the agent id that dropped it
  at: string;       // write 1 — ISO
  branch?: string;  // write 2 — from worktreeHasUnintegratedWork (git.ts:334)
  detail?: string;  // write 2
};
```

| | Write 1 (synchronous, `floor/lifecycle.ts` after `setArchived` at `:232`) | Write 2 (`finalizeAgentWorktree`'s continuation, `:196-214`) |
|---|---|---|
| ledger | `status: 'todo'`, `assignee` cleared, `released: {by, at}` | patch `released.branch`, `released.detail` |
| kanban card | column moves to `TODO`; meta row reads `DROPPED BY ADA` in `--cth-coral` | unchanged on the card |
| card `title` attr | `Ada's terminal exited at {local ISO}` | `… Their work is on branch {branch}.` appended |
| detail overlay | `Ada's terminal exited. The card is back on the board.` | `+ Their work is on branch {branch}.` |

**Rule R-1 — never render a placeholder for the branch.** No `…`, no `loading`, no `unknown`, no
skeleton. **Absence is the correct rendering of "not known yet"**, and a moment later the row
appears. If write 2 never lands — git failed, ADR-0003 keeps the work anyway — the card permanently
shows who dropped it and no branch, which is honest. A placeholder is the only way this state can
"look broken in between", so the contract forbids the placeholder rather than trying to time the
two writes.

**Rule R-2 — the card moves to `TODO`, and the meta row is free because the assignee was cleared.**
`TasksKanban.tsx:252-259` renders the assignee line only when `assigneeName` resolves; releasing the
card clears it, so `DROPPED BY ADA` occupies a slot that just became empty. Same display font, same
uppercase, same ellipsis — only the colour changes, from `--cth-ink-500` to `--cth-coral`. **Zero
new geometry.**

Per §S5 rule A-4 that row is now a flex meta row carrying the age too, so a released card reads:

```
[DROPPED BY ADA ─────────]  [4m]
```

Which is the whole VIGIL-02 requirement — *who*, and *how long ago* — on one existing row.

**Rule R-3 — the branch lives in the detail overlay and the tooltip, not on the card.**
`TasksKanban.tsx:223` states the board's own design law verbatim: *"a kanban card can carry a
title at most."* A worktree path is long, and truncating it would produce the same
looks-verifiable-but-is-not failure §S1a rule 3 and 02-UI-SPEC §S4a both forbid. Full text in the
overlay, full text in the `title` attribute, `wordBreak: 'break-all'` — copying
`WorkersTab.tsx:161`'s shipped treatment of `p.wtPath`.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | **none** — shadcn is not initialized (§Design System) | not applicable |
| third-party | **none declared** | not applicable — **no `npx shadcn view` was run because no block was proposed** |

**No package is installed by this phase.** `package.json` and `package-lock.json` are frozen
(04-CONTEXT.md D-36). Every mechanism in this contract resolves to an existing in-house component,
an existing CSS custom property, or a Node builtin. If any plan reaches for `npm install`, that is
the signal to re-read the ladder.

---

## Known Drift — recorded, NOT corrected by this phase

| Drift | Evidence | Why not here |
|---|---|---|
| `DESIGN.md` §4 names Pixelify Sans / VT323 and a scale `tokens.css` superseded in v0.3.4 | `DESIGN.md:117-133` vs `tokens.css:59-72` | Doc correction, its own change |
| `DESIGN.md:136` "never bold" vs two shipped weights | `WorkersTab.tsx:157` `fontWeight: 600` | Recorded in `01-UI-SPEC.md`; unchanged here |
| `AskMeTab.tsx:193` ships `🌿` against `DESIGN.md:651` "no emoji" | read this session | Inherited; nothing this phase adds carries one |
| `PixelBadge.tsx:33-35` comments that `blocked` is "reserved for the god", but `useHive.ts:581` sets `blocked` for sub-agents too | both read this session | Real inconsistency; VIGIL-03 does not depend on resolving it, and resolving it would change shipped roster copy |
| `openPhoneAsks` sends `ask.agent = t.assignee` — the raw **agent id**, not the display name (`index.ts:1230`) | read this session | The phone renders an id where a name belongs. Out of Phase 4's requirement list; a one-line `nameFor` lookup whenever someone owns that file |
| Numeric `fontSize` sites still below the 14px floor (`AgentControlStrip.tsx:60`, `CodeEditor.tsx:160` and others) | 02-UI-SPEC §Typography rule 1 | Phase 1 plan 23's sweep. **This phase adds none and removes none** |
| `BlockedBanner.tsx:31` writes `fontSize: 16` as a numeric rather than `var(--cth-text-body-lg)` | read this session | Pre-existing in a file this phase edits. **Do not opportunistically fix it** — an unrelated token swap inside a security-surface diff is noise in the review |
| `BlockedBanner.tsx:15` writes `padding: 12` as a numeric rather than `var(--cth-space-3)` | read this session | Same file, same reason, same ruling as the row above. The value is on-scale; only the spelling drifts |
| `CommandCenterPanel.tsx:796`'s `⚠` is `aria-hidden="true"` with a `title`, so the breaker reason is announced to nobody | read this session | Pre-existing. §S4 rule V-1b fixes it **only** for the `armed && blocked` case, where VIGIL-03 makes it load-bearing. The general case is not this phase's |

---

## What This Contract Deliberately Does NOT Specify

| Not specified | Why |
|---|---|
| A replay timeline, a log viewer, a restore-point browser | Phase 3's SCALE-03 owns the replay surface. Phase 4 owns only the storage it reads (D-19). Explicitly out of the phase brief |
| Any UI for GATE-02, RECORD-01, RECORD-02, RECORD-05 | No rendered output. RECORD-05's restore is a main-process mechanism this phase does not surface |
| A floor-wide "everything that was ever refused" list | `DOES NOT EXIST` — needs a new panel and a durable read of RECORD-01's table. §S2 states the limitation instead of inventing the surface |
| An approval **modal** | §S1a rule: a timed interrupt must not seize the app |
| An iOS phone surface | Standing constraint, carried from 02-UI-SPEC §S5 |
| A light theme for the phone | Carried from 02-UI-SPEC — dark-first, a phone at night is the use case |
| Optimistic UI on a tool approval | §S1 rule G-3 clause 3 — it is exactly how "an answer was accepted" gets lied about |
| A second toast for a gated tool call | `useHive.ts:571-579` already records that main fires it |
| The exact ask TTL | 04-CONTEXT.md leaves the number to the planner. **Every rule in §S1 works for any TTL** — the countdown reads a duration off the wire and the thresholds are in A7 |

---

## Open — planner's discretion

Three items could not be closed from the repo in this session, and are named rather than guessed:

1. **The store action the `QUIET` chip clicks through to** (§S6a rule Q-2). `SidebarTabs.tsx` and
   `store/store.ts` were **not** read. Read them; reuse what exists; do not add a store slice.
2. **The re-measured titlebar constants with two chips present** (§Containment Protocol). These are
   measured values by definition — `TUNNEL_CHIP_W1 = 833` and `TUNNEL_CHIP_W2 = 783` were
   pinpointed to the pixel and this phase invalidates both. They cannot be derived.
3. **The ask TTL** — deliberately left open by 04-CONTEXT.md. The contract is TTL-agnostic; the only
   UI constraint it imposes is that A7's four announcement thresholds (120/60/30/10s) degrade
   gracefully for a TTL below 120s by skipping the thresholds already passed.

---

## Auto-Mode Decision Log

Every gray area, the option taken, and why.

| # | Question | Decision | Reason |
|---|---|---|---|
| 1 | Initialize shadcn? | **No** | Complete in-house token layer + eight primitives already exist; would be a parallel system and would touch a frozen `package.json` |
| 2 | Modal or banner for the GATE-05 ask? | **Banner** (`BlockedBanner`, reused) | A ~120s timed interrupt that arrives at 3am must not seize the app; `Modal` traps and restores focus, which is correct for consent and wrong here |
| 3 | Countdown as a deadline or a duration on the wire? | **Duration** (`expiresInMs`) | Clock skew between phone and floor makes a deadline optimistic, and optimistic is the one direction that lies |
| 4 | Show a number in the last seconds? | **No** — `expiring` below 10s | Transit latency and skew are only bounded above; the last ten seconds are where a number could be wrong in the dangerous direction |
| 5 | Optimistic UI on approve/deny? | **Banned** | The requirement is literally "must not imply an answer was accepted after the deadline"; optimistic UI is how that happens |
| 6 | Countdown colour at urgency? | **Ink ramp + weight + word + icon, never coral** | Measured: `--cth-coral` on `--cth-coral-light` is **2.43:1** in light mode. A countdown that fails contrast when it matters is the defect |
| 7 | Distinguish the phone's two ask kinds how? | **Same construction, `--p-warn` / new `--p-warn-fill` instead of `--p-accent` / `--p-accent-fill`** | Structural identity keeps the list scannable; hue carries the kind. One new property, byte-identical to `--cth-coral-light` dark (`tokens.css:152`) |
| 8 | Rename `taskId` for tool asks? | **Never** (L-12) | 21 occurrences in `index.html`, 10 in `sw.js`, and `sw.js` is installed on the operator's phone. `kind` discriminates; `taskId` carries the id |
| 9 | Phone button order for approve/deny? | **`deny` at the bottom, `approve` above, 16px apart** | The thumb-reachable button on a one-handed phone at night must be the safe one; the gap catches a slip |
| 10 | Which button is coloured on the phone? | **`approve`, in `--p-warn`** | It is the consequential choice, and Phase 1 reserves coral for destructive actions. Colour marks weight, not recommendation |
| 11 | Widen `answerAsk`'s return? | **Yes, minimally** (`boolean \| {ok, state?}`) | "Expired" and "answered elsewhere" have opposite outcomes; a boolean cannot say which, and the operator must know whether the command ran |
| 12 | Sandbox toggle location? | **Settings → Autonomy & Budgets** | It is literally commented "the safety tab" and already hosts the `autoMode` sibling with an established row shape |
| 13 | Unsupported engines: hidden, disabled, or labelled? | **Absent, with one derived sentence naming the count** | Ten disabled rows is a wall of "no"; hiding them is faking. Matches 02-UI-SPEC §S1's capability-gap ruling |
| 14 | Toggle in `AddAgentModal` too? | **No — read-only reflection in the `Row` label** | Two controls for one per-engine setting is how the two splice sites (L-08) drift in the UI as well as the code |
| 15 | VIGIL-04 age: relative or absolute? | **Both, at different densities** | Relative on the 170px card, absolute in the tooltip and the detail overlay |
| 16 | VIGIL-04 stale threshold? | **The unit boundary — `h` or `d` is stale, ≥ 60 min** | One rule instead of a magic constant, and it makes the unit letter and the emphasis change together, which is what makes 9h and 4m separable at 14px |
| 17 | Stale emphasis on `done` cards? | **No** | A card finished three days ago is not a problem; lighting it up is alarm fatigue on the board |
| 18 | Extract a shared age formatter, or refactor all four copies? | **Extract one; leave the four alone** | Rewriting four working call sites is churn with a regression surface and no requirement behind it |
| 19 | VIGIL-03: new blocked affordance? | **No new component, but one shipped surface IS broken** *(rev 2 — rev 1's answer was "none, all three surfaces are already correct", built on a wrong enumeration)* | `PixelBadge` maps `blocked` → coral **+ the words "needs you"** on two channels, so no new pixels are needed. But there are **nine** render sites, **seven** agent-status, and `CommandCenterPanel.tsx:795` overrides `blocked` → `looping` whenever the breaker is armed. On that roster VIGIL-03's criterion fails today. §S4 rules V-1 and V-1b |
| 20 | How does an off-screen blocked agent show *what* it is blocked on? | **`action` carries the matched prompt line into the existing `infoLine` row** | Zero geometry cost on a card frozen at 322×86 with ~3px of slack |
| 21 | VIGIL-01 in-app affordance? | **A titlebar `QUIET` chip; no panel** | A toast is transient; the titlebar is the app's established always-visible slot and already hosts `PUBLIC` |
| 22 | What does the `QUIET` chip do on click? | **Opens the task board** | "What was in flight" *is* the `DOING` column, and §S5's age makes the stall self-evident. VIGIL-01 composes with VIGIL-04 |
| 23 | Repeat the alarm? | **Never. One toast, one push, per quiet edge** | D-25's latch. The chip is a state; states do not fatigue |
| 24 | Push payload vs the installed `sw.js`? | **Optional `body`, with the existing string as the fallback; the title must be self-sufficient** | Forward- and backward-compatible in both directions with a one-line SW change |
| 25 | VIGIL-02 between the two writes? | **Render nothing for the branch — no placeholder of any kind** | Absence is the correct rendering of "not known yet"; a placeholder is the only way this state can look broken |
| 26 | Where does `DROPPED BY ADA` go? | **The meta row the cleared assignee just vacated** | Zero new geometry; the row already exists and is already uppercase display font |
| 27 | Truncate a command under approval? | **Never** — wrap and scroll | `git push origin +main --force` truncated hides the dangerous half, and the dangerous half is often at the end |
| 28 | Announce the countdown per second? | **No — four polite thresholds + one outcome; digits `aria-hidden`** | A per-second assertive region is a screen-reader denial-of-service |
| 29 | Steal focus when an ask arrives? | **No** | The desktop toast already click-to-focuses (`hooks.ts:1499`); stealing an operator's caret mid-task is worse than the delay |
| 30 | Fix `BlockedBanner.tsx:31`'s numeric `fontSize: 16` while editing the file? | **No** | An unrelated token swap inside a security-surface diff is noise in the review |
| 31 | Fix `PixelButton.tsx:74`'s `destructive` label colour? | **Yes — mandated, own atomic commit** | Measured **1.85:1** in dark mode on the very button `deny` uses. Unlike #30 this is not cosmetic: it is an invisible label on the approval gate's refuse control. `--cth-on-accent` makes light mode byte-identical and dark mode 7.12:1 |
| 32 *(rev 2)* | `CommandCenterPanel.tsx:795`'s `armed ? 'looping' : a.status` — in VIGIL-03's scope, or out? | **In scope. `blocked` wins the badge:** `status={a.status === 'blocked' ? 'blocked' : armed ? 'looping' : a.status}` | `blocked` means *a human must act*; `looping` means *the breaker tripped and the floor is handling it*. Only the first is actionable at 3am. Decisive evidence: `armed` **keeps two other channels on the same row** (`:760` coral row fill, `:796` `⚠` glyph) while `blocked` has only the badge — so the fix costs `armed` one of three signals in one narrow case and gives `blocked` its only signal back. Not a trade, a strict improvement. §S4 rule V-1b |
| 33 *(rev 2)* | When `armed && blocked`, the `⚠` is `aria-hidden` — does AT lose the breaker? | **Yes, so the `⚠` conditionally takes `role="img"` + `aria-label`** | A `title` on an `aria-hidden` span is announced to nobody. Once the badge is surrendered to `blocked`, the badge was AT's only armed signal too. A2's shipped pattern (`TasksKanban.tsx:262`) applied exactly where it becomes load-bearing — narrowest possible scope, not a general `aria-hidden` sweep |
| 34 *(rev 2)* | D-25's phone channel: a third `PhoneAsk.kind: 'alarm'`, or a deviation? | **Neither — a `floorQuiet` sibling field on the asks response, rendered as a non-interactive pinned strip.** D-25's three channels are all present | Rev 1 silently substituted the titlebar chip for the phone ask list, leaving the phone **push-only** — miss the push and it shows nothing, the exact failure Q-1 identifies for the desktop. A third `kind` was rejected on measured grounds, not effort: it renders **`NEEDS YOU 1`** and suppresses the empty state (`screenListHtml:352-354` counts `state.asks.length`) when in fact *nothing* is asking, and it forces a tappable `<button class="p-ask">` (`askItemHtml:338-350`) to be un-answerable. The sibling field reuses the `p-offline-bar` slot that is already in the file, touches `PhoneAsk` not at all, and keeps L-12 untouched. §S6a rule Q-1b |
| 35 *(rev 2)* | Can the phone alarm strip be dismissed? | **No — it is server state, not client state** | It appears when the latch sets and disappears when the 10s poll (`POLL_MS`, `index.html:249`) stops returning `floorQuiet`. Same lifecycle as the desktop chip (Q-3). A dismiss control would let the operator clear an alarm while the floor is still stopped, which is the one thing it must not be able to say |
| 36 *(rev 2)* | Where does focus go when a timed prompt resolves? | **A9: to `dismiss` (desktop) / `‹ back` (phone), in the same render, guarded on focus having been inside the surface** | Rev 1 specified the ring (A5) and never specified placement, while rule 4 unmounts the action row and §S1b disables both buttons — dropping focus to `<body>` at the exact moment the operator answered a destructive prompt, with A7 then politely announcing `Approved.` into the void. The guard is what keeps A9 compatible with rule 5 / #29: focus elsewhere → nothing moves. Accessibility is on this project's never-simplify list |
| 37 *(rev 2)* | Does the banner take focus when an ask arrives? | **No — stated explicitly as A9.1** | Unchanged from #29; written down because A9.2 moves focus and an executor reading only A9 could reasonably infer autofocus on arrival. The rule now says both halves out loud |

---

## Checker Sign-Off

Rev 1 was returned **BLOCKED** with three blocking issues and four citation corrections. Dimensions
1, 3, 4 and 6 passed and are untouched by rev 2; every contrast figure was independently recomputed
by the checker and confirmed, including the **1.845:1** dark-mode `destructive` defect and the
**2.4254:1** coral pairing. Dimension 5 was FLAG-only and accepted as declared.

| Dimension | Rev 1 | Rev 2 |
|---|---|---|
| 1 Copywriting | PASS | unchanged, + the phone strip's three cases (§Copywriting, alarm copy) |
| 2 Visuals | **BLOCKED** ×3 | B1 → §S4 V-1/V-1b · B2 → §S6a Q-1b · B3 → §Accessibility A9 |
| 3 Color | PASS | unchanged; `--p-warn-fill`'s reserved-for widened to two named surfaces |
| 4 Typography | PASS | unchanged |
| 5 Spacing | FLAG, accepted | unchanged; `BlockedBanner.tsx:15`'s numeric now cited correctly and recorded as drift |
| 6 Registry Safety | PASS | unchanged — no registry, no block, nothing to view |

**Rev 2 changes, in full:**

| Issue | Resolution |
|---|---|
| **B1** — "all three roster surfaces" was false | §S4 rule V-1 now enumerates **all nine** `PixelBadge` sites with their `status` expressions and marks the **seven** that are agent-status. §Color's repeat of the false evidence is restated as "nine sites, none in the titlebar (`App.tsx:411-440`)" — the *conclusion* survives |
| **B1.2** — `CommandCenterPanel.tsx:795` swallows `blocked` | New rule **V-1b**, binding: `blocked` wins the badge; `armed` keeps its row fill and `⚠`; the `⚠` gains an accessible name in the one case where AT would otherwise lose the breaker. Decisions #32, #33 |
| **B2** — D-25's phone channel dropped | New rule **Q-1b**: a `floorQuiet` sibling field on `GET /phone/api/asks`, rendered as a non-interactive pinned strip in the existing `p-offline-bar` slot. Third `kind` rejected on measured grounds (count badge lies, tap is un-answerable). L-12 re-verified: `PhoneAsk` unchanged, `PHONE_TASK_ID_RE` not in the path. Decisions #34, #35 |
| **B3** — focus placement unspecified | New rule **A9** (.1–.4): the banner never takes focus on arrival; when the focused control unmounts or disables, focus moves in the same render, guarded on containment; targets named per surface; move precedes the A7 announcement. Hooked into §S1a rule 4 and §S1b. Decisions #36, #37 |
| **C1** | `Icon.tsx:6-10` — eighteen → **22** names. The `clock`/`bell` point is unaffected |
| **C2** | `hive.ts` `review?` — `:147` → **`:149`**. `HumanQA` at `:111-117` confirmed |
| **C3** | ASK ME card — `AskMeTab.tsx:212-222` → **`:210-234`**, with the insertion point named as "before `:230`", the badge being at `:231` |
| **C4** | `--cth-space-3` no longer claims `BlockedBanner.tsx:15`; that line is the numeric literal `padding: 12,` and is now recorded under Known Drift |

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: re-verify B1 / B2 / B3
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending re-check

---

*Phase: 4 — Overnight on a Repo That Matters*
*Contract written: 2026-08-25, against HEAD `e504735` in worktree `gsd-plan-phase-04`*
*Rev 2: 2026-08-25, against HEAD `7969c58`. Every line number newly written in rev 2 was opened in
the same session; nothing was adjusted to fit.*
