---
phase: 04-overnight-on-a-repo-that-matters
plan: 18
subsystem: desktop-approval-surface
tags: [GATE-05, VIGIL-01, a11y, containment, ipc]
requires: [04-11, 04-14, 04-15, 04-16, 04-17, 04-20]
provides:
  - "control:answerApproval — the desktop's one renderer→main route for settling a GATE-05 ask"
  - "control:approvalRequest now carries askId + expiresInMs (it carried neither)"
  - "BlockedBanner: escalating ink-ramp countdown, no-ellipsis command, outcome swap, focus retention"
  - "formatRemaining(ms) — rule G-3's table as an exported pure function"
  - "askOutcomeText / answerAskFromBanner — the shipped ask decision, shared by both banner callers"
  - "store.floorQuiet + onFloorQuiet — the QUIET chip's three-hop route"
  - "the breaker ⚠ announced under armed && blocked (T-04-BLK-10 closed)"
  - "TUNNEL_CHIP_W1/W2 re-measured with both chips; QUIET_CHIP_W added"
affects: [04-19]
tech-stack:
  added: []
  patterns:
    - "pure-function extraction as the escape hatch from a no-effect-phase render harness"
    - "cross-implementation checks that EXECUTE both sides rather than compare either to a third copy"
    - "natural-content-width measurement summed from live layout, per degradation step"
key-files:
  created: []
  modified:
    - src/main/hooks.ts
    - src/main/index.ts
    - src/preload/index.ts
    - src/renderer/src/store/store.ts
    - src/renderer/src/hooks/useHive.ts
    - src/renderer/src/components/BlockedBanner.tsx
    - src/renderer/src/components/AgentDetailPanel.tsx
    - src/renderer/src/components/CommandCenterPanel.tsx
    - src/renderer/src/App.tsx
    - test/renderer-components.test.cjs
    - test/repo-claims.test.cjs
    - test/build-assets.test.cjs
    - test/control.test.cjs
    - test/boot-floor.test.cjs
decisions:
  - "D-27: the QUIET chip opens the task board rather than growing a surface of its own — VIGIL-01 composes with VIGIL-04"
  - "Only the ASK arm of onAction is shared between the two banner callers; absorbing both whole would move writePty out of the two files T-04-ASK-21's grep gate watches"
  - "TUNNEL_CHIP_W1/W2 were CORRECTED, not supplemented — they were already stale by ~107px at base, and a third constant alongside two wrong ones would have shipped an overflow at 800px"
metrics:
  duration: ~4h
  completed: 2026-08-26
  tests_before: "1050 / 1043 pass / 0 fail / 7 skipped / 25.66s"
  tests_after: "1074 / 1067 pass / 0 fail / 7 skipped / 22.82s"
  tests_added: 24
---

# Phase 04 Plan 18: The Desktop Half of GATE-05 and VIGIL-01 Summary

An ask is now answerable on the desktop through one IPC route that never types into a PTY, with an ink-ramp countdown whose rule table is unit-tested rather than eyeballed, a command that cannot hide its dangerous half, and a titlebar `QUIET` chip whose overflow thresholds were re-measured against base and head — which is how this plan found that the shipped constants had been wrong for two phases.

## What Landed

| # | Commit | What |
|---|--------|------|
| 1 | `c6299c5` | `fix` — `control:approvalRequest` carried no ask id at all |
| 2 | `e209d25` | `feat` — the approval answer's only desktop route |
| 3 | `b0f83fb` | `test` — RED: five countdown bands, two command shapes, the outcome swap |
| 4 | `15ce07e` | `feat` — the banner: countdown, no ellipsis, outcome that keeps focus |
| 5 | `9b03802` | `feat` — the breaker `⚠` announced, line and BOTH pins in one commit |
| 6 | `37edae6` | `test` — phone↔desktop countdown cross-check, by executing both |
| 7 | `7aa8c27` | `fix` — the D-40 IPC-surface pin did not know about the new channel |
| 8 | `85e7dbc` | `feat` — the `floor:quiet` route at all three hops |
| 9 | `8c22108` | `feat` — the QUIET chip and the re-measured titlebar constants |

## The Headline Finding: GATE-05's Desktop Half Was Dead By Construction

Task 1's `<behavior>` states as fact that *"`control:approvalRequest` (which already exists) delivers `askId` and `expiresInMs` into `BlockReason`."*

**Measured at HEAD, it delivered neither.** `emitControl` (`hooks.ts:2226`) sent `{agentId, tool, reason, command}`, and `openApproval` called it without the entry it had just opened — even though `entry.id` and `entry.expiresAt` were in scope six lines above. So the renderer had no way to tell a GATE-05 ask (open, answerable, expiring) from a GATE-03 notice (already denied, nothing to answer). Every banner this plan was asked to build would have rendered a `dismiss` button for a question the floor was still blocking on, while the shim sat on its poll loop until the TTL denied it.

RED, recorded, before any implementation:

```
actual: undefined, expected: 'ask-723ca90ea109f29baa760208cfdd77b0'
```

This is R2-BL7's shape one layer lower, and the identical class of gap plan 04-14 found in the preload's `command?: string`. It is fixed in its own commit as a Rule 3 deviation (see Deviations).

## RED Runs Recorded

| Gate | RED evidence |
|---|---|
| Task 1, main | `sent.find(s => s.channel === 'control:approvalRequest').payload.askId` → `undefined` |
| Task 1, renderer | 4 cases failed: no `askId` through the assembly, notice-shaped `actions: []` on an ask, `was refused` headline on an open question |
| Task 1, route | `control:answerApproval` absent from both `index.ts` and the preload |
| Task 2 | 5 cases failed: `formatRemaining` not exported, no countdown span, 1 `<svg>` where 2 were needed, ellipsis in both directions, no post-resolution shape |
| Task 2, cross-check | phone `45s left` → `45s`: RED. desktop `expiring — will deny` → `expiring`: RED. Both reverted and byte-verified. |

## The Containment Measurement

A throwaway CDP probe (built per-plan, run, deleted — `01-15`/`01-18` precedent; `git status --porcelain scripts/` is empty) over the **real built renderer bundle**, using `Emulation.setDeviceMetricsOverride`, printing the true `window.innerWidth` beside every requested width, with a positive control on every read (titlebar found, mounted, chips enumerated), against the same 48-character probe host.

Run against **both** configurations with the identical probe.

### Transcript — base configuration (no QUIET chip), old constants

```
requested 1280px | true innerWidth 1280 | scroll 1280/1280 | overflow false | PUBLIC true QUIET false autoModeText true
requested 1024px | true innerWidth 1024 | scroll 1024/1024 | overflow false | PUBLIC true QUIET false autoModeText true
requested  800px | true innerWidth  800 | scroll  800/800  | overflow false | PUBLIC true QUIET false autoModeText false
natural content width @ true innerWidth 1600px (gap 12, padding 96/12)
  step0 everything visible 943px | step1 auto-mode hidden 840px | step2 + host dropped 415px
```

### Transcript — head (both chips), old constants

```
requested 1280px | true innerWidth 1280 | scroll 1280/1280 | overflow false | PUBLIC true QUIET true autoModeText true
requested 1024px | true innerWidth 1024 | scroll 1024/1024 | overflow false | PUBLIC true QUIET true autoModeText true
requested  800px | true innerWidth  800 | scroll  919/800  | overflow TRUE  | PUBLIC true QUIET true autoModeText false
natural content width @ true innerWidth 1600px (gap 12, padding 96/12)
  img 20.00 | UpdateBadge 50.04 | auto-mode span 90.92 | PUBLIC+host 517.21 | QUIET+32m 124.00 | 3 icon buttons 28.00 each
  step0 1079px | step1 976px | step2 551px | step3 505px
```

**Two findings, and running base as well as head is what separates them:**

**(a) This phase overflowed the strip at 800px.** Head measured `scrollWidth 919 > clientWidth 800`; base at the same width did not overflow. Exactly T-04-ABS-09.

**(b) The old constants were already stale before this phase, by ~107px.** Base `step0` measures **943** against a shipped `TUNNEL_CHIP_W1 = 833`; base `step1` measures **840** against a shipped `TUNNEL_CHIP_W2 = 783`. The titlebar grew two 28px icon buttons and a longer version string since those were taken. This is recorded rather than folded in silently — *"it was already broken"* and *"this phase broke it"* are different facts, and the protocol exists to tell them apart.

The QUIET chip costs a flat **136px** at every step (124px measured chip + the strip's 12px gap). That is the delta and the only delta. Nothing was derived by arithmetic on font metrics.

### Constants changed

| Constant | Was | Now | Meaning |
|---|---|---|---|
| `TUNNEL_CHIP_W1` | 833 | **1079** | below it the auto-mode text hides |
| `TUNNEL_CHIP_W2` | 783 | **976** | below it PUBLIC drops its host |
| `QUIET_CHIP_W` | — | **551** | below it QUIET drops its duration (step 3, new) |

Each is the natural width of the state *above* it, because a state must yield as soon as it stops fitting. **They were corrected, not merely supplemented:** adding a third constant beside two that were 107px too low would have shipped the 800px overflow.

### Verification after re-building with the new constants

```
head, both chips: 1280 no overflow | 1024 no overflow | 800 no overflow,
  chips ["v0.4.4","PUBLIC","QUIET 32m","☾"] — PUBLIC correctly degraded
full 1600→400 downward scan: ONE flip, between 448px and 440px
base configuration, same constants: ZERO flips in 400..1600
```

All four chip combinations were exercised: both chips (head runs), PUBLIC alone (base runs), QUIET alone (the first head run before the tunnel stub was corrected — recorded there as `PUBLIC false QUIET true`), and neither (pre-latch initial render).

**Bisection was tried and rejected on evidence, not taste.** Overflow is *not monotonic* in width, because the ladder itself changes as each constant fires — a bisection converges on a step boundary rather than a threshold. It reported `929 no overflow / 928 overflow` while the same run measured `scrollWidth 969` at 929px. A full scan replaced it.

## Stated Limitations (not paraphrased away)

1. **The thresholds are natural-content-width bounds**, so they are conservative by however much flex-shrink the row has left — measured **57px** in the step-1 state. The strip therefore degrades slightly earlier than it strictly must. That is the safe direction, and it is stated rather than tuned away. The 448px scan flip corroborates it independently: `505 − 57 = 448`.
2. **Below ~448px the strip overflows**, with nothing left to drop, because **neither chip is ever dropped entirely** — presence is the signal for both. 448px is 352px below the protocol's narrowest probe width.
3. **The announced `⚠` inherits ~14px** instead of rendering at 12px. The only compliant alternatives were a numeric override (a new M1 hit whose owning tag has no literal `aria-hidden`, so FLOOR-12 clause 3 would fail on it and no allowlist entry could rescue it) or a token — and the nearest, `--cth-text-body-sm`, is 14px in `tokens.css:71`, not 12. A test asserts the absence of that override so it cannot creep back.
4. **`blockReason` is singular per agent** (`store.ts:56`), so a second ask for the same agent overwrites the first. 04-UI-SPEC accepts this explicitly (T-04-CMD-15); a queue would be a new surface this contract does not specify.
5. **`control:answerApproval`'s `expired` flag is best-effort.** `toolAskExpiry` is filled by `openPhoneAsks()`, so on a floor whose phone has never polled it reads `expired: false` for a genuinely expired ask. **The renderer does not rely on it** — it holds `receivedAt + expiresInMs` from the push and derives expiry from its own anchor (rule G-3), which is skew-immune by construction, and `askOutcomeText` takes either source saying "expired" as enough. Asserted in both directions.

## FLOOR-12, re-measured rather than asserted from memory

| Quantity | Before | After |
|---|---|---|
| repo-wide M1 occurrences | 16 | **16** |
| `FLOOR12_ALLOWLIST.length` | 16 | **16** |

The announced `⚠` branch carries no inline numeric `fontSize`, so it produces no M1 hit, needs no entry, and clause 3 never walks to it. The list was neither widened nor shortened. All four FLOOR-12 clauses pass.

## The Three Coordination Requirements Handed To This Plan

1. **`title={command}`** — done, folded into the rule-3 truncation rewrite as 04-14 instructed. Present on the GATE-03 arm, absent on the ask arm (which never truncates), both directions asserted.
2. **The `⚠` aria swap moved with its pin in ONE commit** — `9b03802` carries `CommandCenterPanel.tsx`, the `FLOOR12_ALLOWLIST` entry text, **and** the now-obsolete "byte-identical, deferred to 04-18" test in `renderer-components.test.cjs`, which was a **third** pin nobody had named. Split across commits, any pair would have been red.
3. **`command?: string` in the preload** — verified present, not re-added. `grep -c 'control:approvalRequest' src/preload/index.ts` is still **2**.

## Verification Numbers

| Check | Required | Measured |
|---|---|---|
| `grep -c 'control:approvalRequest' src/main/hooks.ts` | 1, unchanged | **1** |
| `grep -c 'control:approvalRequest' src/preload/index.ts` | 2, unchanged | **2** |
| `grep -c "'control:answerApproval'"` main / preload | 1 / 1 | **1 / 1** |
| `grep -c "ipcMain.handle('control:" src/main/index.ts` | 9 (was 8) | **9** |
| `control:` in useHive, comment-stripped | 0 | **0** (paired with `window.cth` ≥ 30 → 30) |
| `writePty` — useHive / AgentDetailPanel / CommandCenterPanel | unchanged | **2 / 1 / 1** (comment-stripped) |
| `git diff --stat src/preload/index.d.ts` | empty | **empty** |
| `deps.send('floor:quiet'` in boot.ts | 1 | **1** |
| `'floor:quiet'` in preload / useHive | 2 / 0 | **2 / 0** |
| `as unknown as` in useHive | unchanged at 2 | **2** |
| decremented counter in BlockedBanner | 0 | **0** (paired with `receivedAt` ≥ 2 → 3) |
| `expiresAt` in BlockedBanner | 0 | **0** |
| `awk "/case 'destructive':/,…" PixelButton \| grep -c cth-on-accent` | 1 | **1** |
| `git status --porcelain scripts/` | empty | **empty** |
| `npm run typecheck` | 0 errors, both projects | **0 / 0** |
| `npm run lint` | exit 0 | **exit 0** |
| `npm test` | 0 fail, ~27.6s | **1074 tests, 1067 pass, 0 fail, 7 skipped, 22.82s** |

**Suite duration watched, not just the pass count.** Baseline at `c0bddae` was 25.66s over 1050 tests; after 24 added tests it is **22.82s** — no regression, and nothing in this plan waits on an operator. The 04-16 failure mode (a test that passed while taking 240s because an ask-shaped command sat until its TTL) does not apply: no test here opens an ask through a path that waits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `control:approvalRequest` carried no ask id**
- **Found during:** Task 1
- **Issue:** `emitControl` sent `{agentId, tool, reason, command}` and `openApproval` passed no ask identity. GATE-05's desktop half could not be built at all: `askId` present is the plan's stated discriminator and nothing ever set it.
- **Fix:** two optional trailing params on `emitControl`; `openApproval` passes `entry.id` and `entry.expiresAt - Date.now()` (a duration, rule G-3), read off the entry so the operator's countdown and `hive_ask.deadlineMs` are the same number.
- **Scope note:** `src/main/hooks.ts` is outside this plan's `files_modified` (D-35 scopes main to `index.ts`'s handler), but no wave-6 plan owns it and task 1 could not complete without it. The diff is two parameters and one call site; `grep -c 'control:approvalRequest' src/main/hooks.ts` is still 1, which task 1's own criterion requires.
- **Commit:** `c6299c5`

**2. [Rule 3 — Blocking] The D-40 IPC-surface pin did not know about the new channel**
- **Found during:** the full-suite run after task 2
- **Issue:** `test/boot-floor.test.cjs` pins `index.ts`'s whole `ipcMain.handle` surface by count **and** by sorted channel-name list. Adding the answer handler moved the count 159 → 160 and left the list short; two cases red (`actual: 160, expected: 159`).
- **Fix:** `B_IPC_JOINED` 159 → 160, `'control:answerApproval'` inserted in sorted position — which the baseline's own failure message instructs.
- **Honest note:** this should have ridden commit `e209d25`. It did not, because this plan's criteria pin `ipcMain.handle('control:` at 8 → 9 in a *different* file, and this second whole-surface pin was not read first. Amending history to hide the miss would have been the worse trade. **The verification gap is real and generalises: a per-plan criterion measured a SUBSET of a surface another plan pins WHOLE.**
- **Commit:** `7aa8c27`

### Deliberate Departures From The Plan Text

**3. `BlockReason` gained FOUR optional fields, not two.** `<interfaces>` names `askId` and `expiresInMs`. The action text then requires `receivedAt` by name (*"Record `receivedAt` in the renderer… the countdown anchors on it"*, and a `grep -c 'receivedAt' BlockedBanner.tsx ≥ 2` criterion) and an outcome by name (*"set `actions: []` and set the outcome"*). Both were added as optional fields; nothing else carries them.

**4. Only the ASK arm of `onAction` is shared between the two callers.** The first implementation absorbed both `onAction`s into one exported function — which moved `window.cth.writePty` out of `AgentDetailPanel` and `CommandCenterPanel` and took their `grep -c 'writePty'` to 1 and **0**. T-04-ASK-21's mitigation is a grep gate on exactly those two files. Restructured so `answerAskFromBanner` returns `true` when it took the click and the PTY lines stay where the gate can see them. Both files are additionally asserted to *still carry* the `writePty` call, so "the ask does not type" cannot be satisfied by deleting the typer.

**5. The plan's `grep -v '^\s*//' … | grep -c 'control:'` baseline is mis-stated.** It says the raw count is 1 and the filtered count 0. Measured: raw **2**, filtered **1** — `useHive.ts:345` is a JSDoc ` * ` line that `^\s*//` does not match. The claim is instead asserted over **comment-stripped** source (`repo-claims.test.cjs`'s own `stripComments`, which removes block comments too), where the honest value is **0**, paired with a `window.cth ≥ 30` lower bound.

**6. Two acceptance criteria are structurally unreachable in the named harness, and are asserted at the closest reachable level with the reason named in the test.** This is the T-04-ASK-38 shape the plan itself flags — the sweep caught two more instances of it:
- *"`armed && blocked` renders the `⚠` … both directions, both in static markup."* `armed` derives from `breakers`, a `useState({})` filled only by an effect, so a rendered `CommandCenterPanel` has `armed === false` on every row and **both branches are unreachable through it**. The `rosterBadgeStatus` escape hatch is unavailable because the glyph's `fontSize: 12` is what FLOOR-12 pins verbatim — extracting it would redden two clauses. Asserted on source: both branches byte-exact, exactly two guards of the form `{armed && a.status (!==|===) 'blocked' &&`, no `aria-hidden` and no `fontSize` on the announced branch.
- *"rendering with `floorQuiet: null` produces markup containing no `QUIET` chip; rendering with a snapshot produces one…"* `App.tsx:292` reads `import.meta.env.DEV`; `loadTs('src/renderer/src/App.tsx')` throws `Cannot use 'import.meta' outside a module` under the CommonJS transpile every loader here uses. **Measured, not assumed.** Asserted instead: the store mirror behaviourally on **both edges** including the clearing one (which is precisely what the chip's `{floorQuiet && …}` guard reads), plus the guard, the `<button>`, the task-board action name, and a field-for-field geometry equality against the PUBLIC chip.

**7. One deliberate widening of `renderer-components.test.cjs`'s house rule.** That file states *"no assertion here compares a full markup string or a `style=` attribute."* The countdown's contrast requirement has no accessible name, role or visible text to be asserted through — the token **is** the property (T-04-ASK-23: `--cth-coral` on `--cth-coral-light` is 2.43:1 in light mode). One helper locates the countdown span by `margin-left:auto` (the only element in the banner carrying it) and asserts tokens *within* its style, never a full-attribute equality. Argued in place, in the file.

### Not Fixed — Out Of Scope

`resources/phone/sw.js:33-35`'s known-false security comment (04-17's, already in `deferred-items.md`) was **left alone**: `resources/phone/**` is excluded from this plan by D-35, and rule Q-5 caps that file at exactly one changed line. Saying so explicitly, as the handoff asked.

## Task 4 — The Blocking Checkpoint: NOT DEMONSTRATED LIVE

`.planning/config.json` has `workflow.auto_advance: true`, so this `checkpoint:human-verify` auto-approved and execution continued.

**⚡ Auto-approved: the approval banner, the countdown, the wrapped command, the outcome swap, and the QUIET chip.**

**Auto-approval resolved the blocking question. It did not perform the seven live demonstrations, and none of them were performed.** Per the plan's own `<negative-path>` — *"record it as a first-class outcome… Do NOT hand-construct a `BlockReason` in the store to make the banner appear and call it a live ask"* — here is the honest list, which **plan 04-19 task 3 should read instead of assuming this checkpoint was green.** `04-19-PLAN:349` presupposes it succeeded; it did not.

| # | Item | Live? | What DOES cover it | What is still unproven |
|---|---|---|---|---|
| 1 | Banner + live countdown in **dark mode**, `deny` legible | **NO** | 04-14's `cth-on-accent` fix asserted by symbol boundary; re-verified here at 1 | that the label is legible on a real dark-mode screen |
| 2 | Countdown at ≥60s / 30s / <10s / expired | **NO** | `formatRemaining` asserted on all five bands + both escalation edges; the ink-700→ink-900 and weight-400→600 swap asserted in rendered markup at 31s and 30s | that it actually **ticks** — no effect phase in the harness |
| 3 | Long command wrapped and scrollable | **NO** | `pre-wrap` + `break-all` + `max-height:96px` + `overflow-y:auto` present and `text-overflow` absent on the ask arm; the opposite on the notice arm | that 96px of scroll behaves on a real heredoc |
| 4 | **A9.2 — `approve` clicked, row swaps, focus lands on `dismiss`** | **NO** | the post-resolution *shape* asserted from props (banner still mounted, outcome line, `dismiss`, action row gone, countdown gone) | **the click, the transition, and `document.activeElement`.** `renderToStaticMarkup` has no `document`, fires no events and runs no effects. **This is GATE-05's headline desktop safety behaviour and it is unproven.** |
| 5 | An ask left to expire auto-denies end to end | **NO** | `ApprovalRegistry` expiry covered by 04-15/04-16; `askOutcomeText`'s expired arm asserted from both sources | that the expiry reaches the banner and the agent on a live floor |
| 6 | QUIET chip at three widths, degradation table, **click opens the task board** | **PARTLY** | the chip **was** rendered live at 1280/1024/800 in both configurations by the containment probe, with transcripts above; the action name is asserted present in `App.tsx` | the **click**, both themes, and a **real quiet latch** (the probe pushed the snapshot through the stubbed bridge, which is the renderer's real path but not a real `AbsenceWatchdog` transition) |
| 7 | Base-vs-head probe transcripts | **YES** | both transcripts are in this SUMMARY | — |
| 8 | The `⚠` on an `armed && blocked` row at ~14px | **NO** | absence of a numeric `fontSize` asserted | the visible size on a real row |

**Why not:** items 1–5 require a real GATE-05 ask, which requires a booted floor with an authenticated agent CLI attempting one of the four command shapes — a token-spending, credentialed operation that cannot be driven unattended, plus an operator's eye on screenshots and a Tab keypress. Nothing was substituted for it: no `BlockReason` was hand-constructed to make a banner appear, and no screenshot was taken of a fabricated ask.

**Recommended:** the operator runs items 1–5 and the item-6 click before this phase closes. Item 4 in particular has **no automated proof anywhere in this repo and cannot acquire one** without jsdom/RTL/Playwright, all of which D-27 and this phase's scope exclude.

## Known Stubs

None. No hardcoded empty collection, placeholder string or unwired data source was introduced. `floorQuiet` defaults to `null` by design — that is the absence-is-the-signal contract, not a stub, and both edges are asserted.

## Threat Flags

None. The one new surface (`control:answerApproval`) is in the plan's `<threat_model>` as T-04-ASK-21's mitigation and is implemented as specified: argument types checked rather than coerced, the settle routed through `HookServer.answerApproval` (never a second registry), no agent id asked for because the unguessable single-use ask id is the capability (ceiling item (f)), and no `writePty` on the path.

## Self-Check: PASSED

Files claimed as modified, verified present and containing the claimed symbols:

- `src/main/hooks.ts` — `askId`/`expiresInMs` on `emitControl` ✓
- `src/main/index.ts` — `ipcMain.handle('control:answerApproval'` ✓
- `src/preload/index.ts` — `answerApproval` ✓, `onFloorQuiet` ✓
- `src/renderer/src/store/store.ts` — `askId` ✓, `floorQuiet` ✓
- `src/renderer/src/hooks/useHive.ts` — `askOutcomeText` ✓, `answerAskFromBanner` ✓, `onFloorQuiet` ✓
- `src/renderer/src/components/BlockedBanner.tsx` — `formatRemaining` ✓, `askId` ✓
- `src/renderer/src/App.tsx` — `QUIET` ✓, `floorQuiet` ✓, `QUIET_CHIP_W` ✓
- `test/renderer-components.test.cjs`, `test/repo-claims.test.cjs`, `test/build-assets.test.cjs`, `test/control.test.cjs`, `test/boot-floor.test.cjs` ✓

Commits verified present in `git log`: `c6299c5`, `e209d25`, `b0f83fb`, `15ce07e`, `9b03802`, `37edae6`, `7aa8c27`, `85e7dbc`, `8c22108`.

`.planning/STATE.md` and `.planning/ROADMAP.md`: **not modified** (`git diff --stat c0bddae..HEAD --` on both is empty) — the orchestrator owns those writes.
