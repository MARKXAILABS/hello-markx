---
phase: 01-finish-the-floor
plan: 23
subsystem: testing
tags: [node-test, repo-facts, floor-12, accessibility, phase-gate, doc-claims, adjudication]

requires:
  - phase: 01-finish-the-floor
    provides: "all 22 prior plans' landed code and their 21 SUMMARYs — the evidence this plan adjudicates"
provides:
  - "the D-45 repo-fact accumulator asserted whole: 10 new tests, every negative grep the phase relied on now runs in npm test on three platforms"
  - "the FLOOR-12 completeness bar as four separately-named clauses against a content-keyed frozen allowlist, proven both ways by mutation"
  - "the D-47 re-verify of #4, #5, #10 and #34 with per-clause evidence posted to each"
  - "the bounded doc-claim sweep: 12 documents corrected, including two that described a code path 01-08 deleted"
  - "a per-clause adjudication of all 23 Phase-1 requirement rows — 10 closed, 13 open with named owners"
  - "the single explicit verdict: Phase 01 is PARTIAL"
affects: [phase-02, phase-04, phase-05, roadmap, requirements, codebase-map]

tech-stack:
  added: []
  patterns:
    - "content-keyed multiset allowlists — a frozen {file, text, count} map compared for exact equality, so a new offender fails and a line shift does not"
    - "the two-plan line-anchor contract: one plan keeps matched TEXT stable, the next keys on content, and each half is proven by mutation rather than inspection"
    - "negative scans assert they matched SOMETHING before asserting they matched nothing wrong"

key-files:
  created:
    - .planning/phases/01-finish-the-floor/01-23-SUMMARY.md
  modified:
    - test/repo-claims.test.cjs
    - .planning/REQUIREMENTS.md
    - .planning/phases/01-finish-the-floor/01-VALIDATION.md
    - .planning/phases/01-finish-the-floor/deferred-items.md
    - .planning/PROJECT.md
    - .planning/codebase/STACK.md
    - .planning/codebase/CONCERNS.md
    - .planning/codebase/INTEGRATIONS.md
    - .planning/codebase/CONVENTIONS.md
    - .planning/codebase/ARCHITECTURE.md
    - .planning/codebase/STRUCTURE.md
    - .planning/codebase/TESTING.md
    - docs/message-queue.md
    - docs/adr/0001-one-gate-for-pty-writes.md
    - HIVE.md
    - src/renderer/src/components/SettingsModal.tsx

key-decisions:
  - "Phase 01 is reported PARTIAL. 10 of 23 requirements close; 13 do not; zero GitHub issues were closed. A truthful partial is the successful outcome here."
  - "Requirement checkboxes and issue closure are two DIFFERENT bars. A checkbox says the clauses are met on the milestone branch; closing an issue is a public statement about the shipped product, and main is still at 19dbdfb with electron ^32.2.0."
  - "The FLOOR-12 allowlist is keyed on {file, text, count}, never on file:line, and both halves of that choice are proven by mutation rather than argued."
  - "title counts as an accessible-name source in the icon-only rule, because PixelButton's closed prop set exposes no other and 01-16/01-20 measured it live on Chromium's AX tree."
  - "PixelButton.tsx's byte pin was HELD and the aria-label prop carried forward, because three plans' recorded reasoning rests on that pin and FLOOR-12's accessible-name clause is already satisfied via title."
  - "D-47's fresh-context subagent re-verify could NOT be run — this executor has no subagent tool. Recorded as MEASUREMENT UNAVAILABLE rather than substituted with a self-report dressed as one."
  - "ADR-0001 was AMENDED, not rewritten: the decision (one gate, never ad hoc) is unchanged; only where the gate lives moved."
  - "CONCERNS.md's Electron entry was rewritten as resolved history rather than deleted, and the criterion demanding grep→0 is reported as a criterion defect rather than satisfied by destroying the record."

patterns-established:
  - "Mutation-proof over inspection-proof: every anti-widening guarantee in this plan was demonstrated by breaking the tree and watching the suite go red, then restoring it."
  - "A negative scan must first prove it can match: M1d asserts seen.length > 0 before asserting under.length === 0, because an empty result and a broken regex are indistinguishable."
  - "Two bars, stated so they cannot drift: 'clauses met on the branch' for a requirement, 'landed on main' for an issue closure."

requirements-completed: [FLOOR-17]

duration: 3h10m
completed: 2026-08-21
---

# Phase 01 Plan 23: The Phase Close-Out Summary

**The end-of-phase sweep is now `npm test` plus one `gh` query — and run honestly, it says Phase 01 is PARTIAL: 10 of 23 requirements close, 13 do not, and zero of the 20 open floor-inspection issues could be closed because not one commit of this phase is on `main`.**

## Performance

- **Duration:** 3h 10m
- **Tasks:** 4 of 4 (task 4 is a checkpoint — see § Checkpoint)
- **Files modified:** 16
- **Commits:** 7

---

## THE HEADLINE, BEFORE ANY EVIDENCE

This plan exists because on 2026-08-20 four issues with real landed code and exactly **one unmet clause each** were closed against a bar of *"some code exists"*. Applying a per-clause bar honestly produces three findings the phase did not expect:

1. **`main` is at `19dbdfb` and still pins `"electron": "^32.2.0"`.** All 152 commits of Phase 1 sit on `gsd/v1.0-milestone` behind draft PR #77 (`MERGEABLE`, `CLEAN`, all seven checks green). Closing any issue today records "fixed" against a default branch that still carries the defect — the same class of false record this phase was created to remove. **So zero issues were closed, including four whose every Fix clause is met.**
2. **D-46's mechanical gate returns `20`, not `0`.** ROADMAP criterion 5's final clause is therefore **FALSE**.
3. **Plan 01-01 has no SUMMARY** — 21 SUMMARYs for 22 completed plans — because its D-09 gate has never been run. `01-VALIDATION.md` states outright that CI cannot substitute: all 535 unit tests run with `electron` **stubbed** and are structurally incapable of failing on an Electron-version regression. **FLOOR-03 does not close.**

Everything below is the evidence.

---

## D-46 — the mechanical phase gate

```
$ gh issue list --state open --label floor-inspection --json labels \
    --jq '[.[]|select(.labels|map(.name)|index("epic")|not)]|length'
20
```

**Required: `0`. Actual: `20`.** The four epics are #47, #48, #49, #73. The twenty non-epic issues still open: #4, #5, #10, #13, #15, #16, #18, #19, #20, #26, #31, #32, #34, #36, #38, #39, #41, #42, #45, #61.

Full listing (`--limit 200`; the flag is load-bearing — `gh issue list` defaults to 30):

```
73  PLAN — three phases to finish everything                                    epic
61  N9 — Codex remote control silently disabled on Windows                      severity:medium
49  EPIC — Horizon 3: the best office                                           epic
48  EPIC — Horizon 2: make the office run itself                                epic
47  EPIC — Horizon 1: stop the bleeding                                         epic
45  L9 — The renderer has no component tests and there is no e2e at all         severity:low
42  L6 — Hook-fired OS notification never fires for 'blocked on a prompt'       severity:low
41  L5 — Bug template is macOS-only and asks for logs that are never written    severity:low
39  L3 — Four renderings of the same agent show four different field sets       severity:low
38  L2 — Long cwds wrap to four lines; no responsive collapse                   severity:low
36  M16 — No dependency automation, no npm audit, no ESLint/Prettier            severity:medium
34  M14 — No per-task cost attribution or cap                                   severity:medium
32  M12 — Memory: condensation assumes append order, no agent isolation         severity:medium
31  M11 — Knowledge graph: re-ingest duplicates, and it is not a graph          severity:medium
26  M6 — Accessibility: aria-labels, 8-12px text, focus ring, nested role       severity:medium
20  H12 — Renderer performance: PTY chunk re-renders, unbounded xterm pool      severity:high
19  H11 — Only one of eleven engines gets the whole protocol                    severity:high
18  H10 — The protocol has no ack, reply deadline, retry, dead-letter           severity:high
16  H8 — Memory layer: index never shrinks, 'READY' is not true                 severity:high
15  H7 — Release pipeline: Windows/Linux ship unsigned                          severity:high
13  H5 — Production has no logs, no crash reporting, no PTY output replay       severity:high
10  H2 — Network and secret hygiene                                             severity:high
 5  C5 — Autonomy lives in the UI process                                       severity:critical
 4  C4 — The human-in-the-loop gate is instruction text, not enforcement        severity:critical
```

---

## CI — the draft PR's checks, at the exact SHA

```
$ gh pr view 77 --json url,isDraft,baseRefName,headRefOid
{"baseRefName":"main","isDraft":true,
 "url":"https://github.com/MARKXAILABS/hello-markx/pull/77",
 "headRefOid":"74b3d056f0a7a8962817d7e5cbfaac6f97671658"}

$ gh pr checks 77                                                   # exit 0
Build                            pass  1m2s   .../job/96851483169
CodeRabbit                       pass  0      Review skipped: draft pull request
Electron smoke (ubuntu-latest)   pass  1m32s  .../job/96851483271
Test (macos-latest)              pass  1m4s   .../job/96851483418
Test (ubuntu-latest)             pass  49s    .../job/96851483289
Test (windows-latest)            pass  1m18s  .../job/96851483203
Typecheck                        pass  33s    .../job/96851482776
```

Every required row present and `pass`. The table is **not empty** and the exit is `0` — both explicit FAIL conditions in this plan's threat register (T-P23-11) are clear.

**And the counters resolve per platform in the CI logs**, not only locally — this is what proves the phase's ~40 new tests actually *ran* on three platforms rather than being skipped into a green exit:

| Platform | tests | pass | fail | skipped | todo |
|---|---|---|---|---|---|
| ubuntu-latest | 535 | 535 | 0 | 0 | 0 |
| windows-latest | 535 | 531 | 0 | **4** | 0 |
| macos-latest | 535 | 535 | 0 | 0 | 0 |

The 4 skips are win32-only and are exactly the frozen `{ skip: !POSIX }` set.

---

## The exit-code hole, closed locally too

```
$ TAP=$(mktemp); node --test --test-reporter=tap test/*.test.cjs > "$TAP"; echo "EXIT=$?"; \
  grep -E "^# (tests|pass|fail|skipped|todo) " "$TAP"; rm -f "$TAP"
EXIT=0
# tests 535
# pass 531
# fail 0
# skipped 4
# todo 0
```

Platform: **win32**. Against the floor: `# fail 0` ✅ · `# todo 0` ✅ · `# skipped 4` = the win32 baseline, **not** greater ✅ · `# pass 531` > 422 ✅.

The four skips by name, so they cannot grow unnoticed:

```
ok 189 - a hook fires with NO node on PATH, and its payload reaches HIVE_SOCK  # SKIP
ok 221 - `node` resolves and RUNS with no node on PATH — the whole point        # SKIP
ok 234 - the real shim authenticates to the real hook server                    # SKIP
ok 235 - a shim with no token is still rejected                                 # SKIP
```

Local gates:

```
$ npm run typecheck   →  TYPECHECK_EXIT=0
$ npm run lint        →  LINT_EXIT=0     # `eslint . --max-warnings 0`, the local install
```

`npm run lint` was used literally, never bare `npx eslint`. `npm run e2e` was **not attempted** and is not this task's gate — Playwright is in the lockfile and has never been installed. The E2E evidence is the `Electron smoke (ubuntu-latest)` row above.

---

## The phase's four fake-coverage guards, re-run at wave 9

Each ran once, in the wave that introduced it, and never again. A guard that ran in wave 2 does not hold a phase closed in wave 9.

**1 — plan 05's poisoned-assert probe.** Poison `assert` so every assertion throws, load each hand-rolled harness, and print any that still exits `0`.

```
(empty)
```

Empty on win32 too. The plan predicted one line here (`test/proc-kill.test.cjs`, whose win32 branch used to exit before any assertion); plan 05's task 3 fixed that file, so empty is now correct on every platform.

**2 — plan 06's hand-rolled harness enumeration.** Exactly 8, and the same 8:

```
test/agent-provider.test.cjs      test/breaker.test.cjs
test/kg-core.test.cjs             test/proc-kill.test.cjs
test/realtime-findcard.test.cjs   test/slack.test.cjs
test/transcript-usage.test.cjs    test/voice-messages.test.cjs
```

Fewer would mean a harness was converted; more would mean a new one was added whose registrations may be shadowed. Neither.

**3 and 4 — per-file counters for the two files where a skip would turn a missing runtime into a green gate.**

```
test/delivery-main.test.cjs   EXIT=0  # pass 28  # fail 0  # skipped 0  # todo 0
test/db-fts.test.cjs          EXIT=0  # pass 6   # fail 0  # skipped 0  # todo 0
$ grep -cE "\.skip\(|\.todo\(|skip:|todo:" test/db-fts.test.cjs
0
```

---

## Task 1 — the accumulator asserted whole

Ten tests appended to `test/repo-claims.test.cjs` (11 → 21 in that file; suite 525 → 535).

```
✔ FLOOR-12 clause 1 — tokens.css declares no text size below the 14px floor (#26)
✔ FLOOR-12 clause 2 — every sub-14px site left in the renderer is on the frozen allowlist (#26)
✔ FLOOR-12 clause 3 — every allowlisted site is a decorative glyph hidden from the a11y tree (#26)
✔ FLOOR-12 clause 4 — the three non-literal sizes are at or above the floor (#26)
✔ FLOOR-12 — no sub-14px size hides in a decimal or quoted literal, where M1 cannot see it (#26)
✔ FLOOR-12 — every expression-valued size carries its own 14px floor (#26)
✔ FLOOR-12 — an icon-only button carries an accessible name; a text button is left alone (#26)
✔ FLOOR-12 — PixelButton still renders {children}, so its text-bearing classification holds (#26)
✔ the two deliberate <div role="button"> keep their accessible names (#26)
✔ both composition-root seams are still fed — FLOOR-09 and FLOOR-10 are not dead code (#19, #34)

ℹ tests 21  ℹ pass 21  ℹ fail 0  ℹ skipped 0  ℹ todo 0
```

### The line-anchor contract, half 1 — confirmed before the allowlist was trusted

Pasted from `01-21-SUMMARY.md` § *CONTAINMENT AND THE LINE-ANCHOR CONTRACT*:

```
B=e183a93…; echo "FONTSIZE-TOUCHED=$(git diff -U0 "$B" -- src/renderer/src | grep -E "^[-+]" | grep -cE "fontSize *[:=]")"
FONTSIZE-TOUCHED=0

S="37790d3… 4a392bd… 34dbe78…"; …
COMMITS=3 OUT-OF-BOUND=0
```

Both containment filters recorded **empty**. Plan 21 moved no `fontSize` text, so the allowlist is derivable from content. It *did* shift line numbers below eight edited suppression sites by 2–4 lines, which is precisely what half 2 absorbs.

### The line-anchor contract, half 2 — proven by mutation, not inspection

Probe file: `src/renderer/src/ide/GitPanes.tsx`.

```
(a) $ sed -i '1i // anchor-shift probe' "$f" && node --test test/repo-claims.test.cjs
    PROBE_A_EXIT=0                      ← a line-keyed allowlist FAILS this
    $ git checkout -- "$f"; git status --porcelain "$f"   →  '' (empty)

(b) $ { echo ''; echo 'const probe = { fontSize: 9 };'; } >> "$f" && node --test test/repo-claims.test.cjs
    PROBE_B_EXIT=1
    ✖ FLOOR-12 clause 2 — every sub-14px site left in the renderer is on the frozen allowlist (#26)
      PRESENT IN SOURCE BUT NOT ALLOWLISTED — a new sub-14px site, or an existing one whose
            const probe = { fontSize: 9 };          ← the failure NAMES the new site
    $ git checkout -- "$f"; git status --porcelain "$f"   →  '' (empty)
```

(a) proves the re-keying is real. (b) proves the anti-widening guarantee survived it and was not traded away for anchor-independence.

### Ten RED controls, all against injected SOURCE defects, all reverted

| Injected defect | Test that fired |
|---|---|
| `--cth-text-body-sm: 14px` → `13px` | clause 1 |
| `--cth-text-display-sm` resurrected | clause 1 |
| `aria-hidden` stripped from `GitPanes.tsx`'s `⇄` glyph | clause 3 |
| `ThoughtBubble.ts` `FONT_SIZE = 14` → `12` | clause 4 |
| `MessageQueueComposer` `Math.max(14, …)` → `Math.max(8, …)` | expression floors |
| `CodeEditor.tsx` `fontSize: '16px'` → `'13px'` | M1d |
| `CompletionToast.tsx` `aria-label="Dismiss"` → `data-label` | icon-only rule |
| `AgentCard.tsx` `aria-label` → `data-label` on the `role="button"` div | role=button guard |
| a line inserted above an allowlisted site | *stayed green* (probe a) |
| a new `fontSize: 9` | clause 2 (probe b) |

`git status --porcelain src/` → empty after every one.

### The FLOOR-12 allowlist, and its reconciliation with wave 7

```
$ grep -rhoE "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])" src/renderer/src \
    --include=*.tsx --include=*.ts | wc -l
16
```

**16 occurrences · 16 allowlist entries · summed `count` = 16.** They match exactly. The unit is **occurrences** (`grep -rhoE … | wc -l`), not lines — the file that made those two numbers differ (`IntegrationsRegistry.tsx:388`, two hits on one line) was removed structurally by 01-17 rather than by edit ordering, so today they happen to coincide; the test still counts occurrences.

The frozen list, every entry a `<span aria-hidden="true">` decorative glyph with its own local override, and **no entry carrying a line number**:

| file | text | count |
|---|---|---|
| `components/AgentCard.tsx` | `<span aria-hidden="true" style={{ fontSize: 10 }}>✎</span>` | 1 |
| `components/AgentStrip.tsx` | `<span aria-hidden="true" style={{ fontSize: 11 }}>✕</span>` | 1 |
| `components/AgentStrip.tsx` | `<span aria-hidden="true" style={{ fontSize: 12 }}>✕</span>` | 1 |
| `components/AskMeTab.tsx` | `<span aria-hidden="true" style={{ fontSize: 13 }}>✕</span>` | 1 |
| `components/CommandCenterPanel.tsx` | `{armed && <span aria-hidden="true" title={breaker?.reason} style={{ color: 'var(--cth-coral)', fontSize: 12 }}>⚠</span>}` | 1 |
| `components/CommandCenterPanel.tsx` | `<span aria-hidden="true" style={{ fontSize: 11 }}>✓</span>` | 1 |
| `components/FullscreenFileEditor.tsx` | `<span aria-hidden="true" style={{ fontSize: 12 }}>✕</span>` | 1 |
| `components/FullscreenTerminal.tsx` | `<span aria-hidden="true" style={{ fontSize: 11 }}>✕</span>` | 1 |
| `components/FullscreenTerminal.tsx` | `<span aria-hidden="true" style={{ fontSize: 12 }}>✎</span>` | 1 |
| `components/PtyTerminalView.tsx` | `<span aria-hidden="true" style={{ fontSize: 12 }}>−</span>` | 1 |
| `components/PtyTerminalView.tsx` | `<span aria-hidden="true" style={{ fontSize: 12 }}>+</span>` | 1 |
| `components/TasksKanban.tsx` | `<span aria-hidden="true" style={{ fontSize: 12 }}>✕</span>` | 1 |
| `components/triggers/ui.tsx` | `<span aria-hidden="true" style={{ flexShrink: 0, width: 8, fontSize: 11, color: 'var(--cth-ink-500)' }}>{open ? '▾' : '▸'}</span>` | 1 |
| `ide/GitPanes.tsx` | `<span aria-hidden="true" style={{ fontSize: 11 }}>✕</span>` | 1 |
| `ide/GitPanes.tsx` | `<span aria-hidden="true" style={{ fontSize: 11 }}>⇄</span>` | 1 |
| `ide/IdePanel.tsx` | `<span aria-hidden="true" style={{ fontSize: 10, lineHeight: '14px' }}>{gitCollapsed ? '▸' : '▾'}</span>` | 1 |

```
$ grep -c "line:" test/repo-claims.test.cjs       →  0
$ grep -c "aria-hidden" test/repo-claims.test.cjs →  20
```

**Reconciliation against the seven wave-7 SUMMARYs.** 01-20 records the attribution as 01-14 five, 01-17 four, 01-18 three, 01-20 three, 01-19 one, 01-15 zero, 01-16 zero — which sums to 16 and reconciles with 01-14's handoff arithmetic (567 handed out + 5 kept = 572; wave 7 kept 11; 5 + 11 = 16). **Every one of the sixteen texts still resolves in its own file at wave 9.** No SUMMARY's *text* went missing, so half 1 of the contract was never broken. Line numbers did move; that is the contract working.

### The two blind-spot classes

**M1d — decimal and quoted literals.** Exactly one hit in the whole renderer, and it is above the floor:

```
src/renderer/src/components/CodeEditor.tsx:23:    fontSize: '16px'
```

Sub-14 count: **0**. The test asserts `seen.length > 0` *before* asserting `under.length === 0`, because a negative scan that matches nothing is indistinguishable from a broken regex — and a broken regex here signs FLOOR-12 off with `fontSize: 12.5` re-introduced.

**M1x — expression-valued.** **17 hits, not the 18 the plan predicted.** Every one classified, per-hit, never by count:

| # | Site | Class | Evaluated minimum |
|---|---|---|---|
| 1 | `FullscreenTerminal.tsx:357` `scale.group` | (b) | `clamp(zoom*0.45, 14, 18)` → **14** |
| 2 | `FullscreenTerminal.tsx:686` `scale.name` | (b) | `clamp(zoom*0.48, 14, 20)` → **14** |
| 3 | `FullscreenTerminal.tsx:740` `Math.max(14, scale.name - 3)` | (b) | **14** |
| 4 | `FullscreenTerminal.tsx:776` `scale.note` | (b) | `clamp(zoom*0.68, 14, 20)` → **14** |
| 5 | `FullscreenTerminal.tsx:791` `scale.note` | (b) | **14** |
| 6 | `FullscreenTerminal.tsx:823` `noteLabelSize` | (b) | `Math.max(14, round(noteFontSize*0.6))` → **14** |
| 7 | `FullscreenTerminal.tsx:854` `noteFontSize` | (b) | `Math.min(20, Math.max(14, zoom))` → **14** |
| 8 | `MemoryGraphPanel.tsx:335` ternary over two tokens | (b) | `--cth-text-mono-md` / `--cth-text-body-md` → **14** |
| 9 | `MessageQueueComposer.tsx:363` `composerFontSize` | (b) | `Math.max(14, zoom)` → **14** |
| 10 | `PixelButton.tsx:102` ternary over two tokens | (b) | `--cth-text-body-md` / `--cth-text-body-sm` → **14** |
| 11 | `PtyTerminalView.tsx:133` `const fontSize = useTerminalFontSize()` | (a) carve-out | feeds `term.options.fontSize` at `:303` |
| 12 | `PtyTerminalView.tsx:148` `term.options.fontSize` | (a) carve-out | — |
| 13 | `PtyTerminalView.tsx:244` `term.options.fontSize` | (a) carve-out | — |
| 14 | `PtyTerminalView.tsx:303` `term.options.fontSize` | (a) carve-out | — |
| 15 | `terminalPool.ts:648` `term.options.fontSize` | (a) carve-out | — |
| 16 | `ThoughtBubble.ts:84` `fontSize: FONT_SIZE` | (b) | **14** — *but see the RENDER_SCALE caveat below* |
| 17 | `ToolBubble.ts:78` `fontSize: FONT_SIZE` | (b) | **14** — *same caveat* |

**Reconciliation of the count:** the plan says 18 live. 17 is what the pinned M1x shape returns at wave 9. The carve-out is exactly `terminalPool.ts` plus the three `term.options.fontSize` assignments in `PtyTerminalView.tsx` — **three, not four**, exactly as the plan's own correction states — plus `:133`, which is an M1x hit that is not a `term.options` assignment but feeds one. `terminalFontSize.ts` is correctly **not** a carve-out entry: `grep -cE "fontSize" src/renderer/src/components/terminalFontSize.ts` → `0`.

`rosterScale` and `composerFontSize` both floor at **≥ 14** (rows 1-9 above). Baselines were 7, 7, 10, 8, 8. `MIN_TERMINAL_FONT_SIZE` stays **8**, deliberately: the composer is floored on its *consumer*, because raising the shared constant would take two zoom steps away from xterm — which is what the terminal carve-out exists to protect.

### The accessible-name rule — the rule, never a ratio

The test contains **no** count or ratio comparison against the number of `<button>` occurrences. It classifies each control and asserts per-element. Live result:

```
<button>       : total 128, icon-only 34, unnamed 0
<PixelButton>  : total 155, icon-only  4, unnamed 0
```

Name sources accepted: `aria-label`, `aria-labelledby`, and **`title`** — on the control or on a non-`aria-hidden` element inside it. `title` is not a stylistic allowance: it is the only name source `PixelButton`'s closed prop set exposes, and 01-16/01-20 measured it live on Chromium's `Accessibility.getFullAXTree` (which reported `"Remove <path>"`, not `""`). Excluding it would fail this test against code that is demonstrably named.

**PixelButton's classification is EXPLICIT, and it is option (b) of the two the plan offered:** the predicate already treats a `{children}` body as **text-bearing**, so `PixelButton.tsx`'s own `<button>` is never reported as icon-only and needs no exclusion by name. That is a general rule, not a carve-out — a ReactNode prop's accessible name is supplied by the *caller* and is not statically knowable here, and demanding `aria-label` on the primitive would override every caller's visible text. A separate test pins the `{children}` body so the reasoning cannot silently outlive itself:

```
✔ FLOOR-12 — PixelButton still renders {children}, so its text-bearing classification holds (#26)
```

### The PixelButton byte pin — held, and the audit trail is empty

```
$ git hash-object src/renderer/src/components/PixelButton.tsx
bd286ebf5654a2647c93546dc135f608aeb5d0f0        ← exactly the pinned value

$ git log --oneline 1947cf0..HEAD -- src/renderer/src/components/PixelButton.tsx
(empty)
```

**The two-line `aria-label` prop fix that 01-16/01-17/01-20 filed against this plan was NOT taken, and this is the reasoning rather than an omission.** This plan's own acceptance criteria pin the file byte-identical; plan 01-12's decision to use a native `<button>` for the sidebar toggle rests on that pin; every wave-7 `title`-based naming call rests on it too. Breaking it in the last plan of the phase, with no operator present to approve it, would invalidate three plans' recorded reasoning in exchange for an ergonomics upgrade on a clause that is **already satisfied** — `unnamedButtons` is 0 on the live AX tree. Carried forward with the exact fix in `deferred-items.md` § 2.

### FLOOR-17's clauses were NOT duplicated

Both already live in `test/ci-config.test.cjs` and were verified rather than re-added:

```
:216  test('docs/adr/ holds the numbered records and README.md indexes every one')
:236  test('the bug template asks only for things a reporter can actually produce')
```

---

## Task 2 — the four previously mis-assessed issues

### D-47's fresh-context adversarial re-verify — MEASUREMENT UNAVAILABLE

**This executor has no subagent-dispatch tool in its toolset**, so the fresh-context per-issue subagents D-47 specifies could not be dispatched. Recorded as unavailable rather than substituted: a self-authored "adversarial" pass by the same agent that wrote the report is not a fresh-context verdict, and dressing one as the other is the exact defect this phase exists to remove.

**What a human must do:** dispatch one agent per issue (#4, #5, #10, #34) with **no** access to Phase 1's SUMMARYs, given only the issue's acceptance text and the repository, asked to find the clause that is NOT satisfied — then compare each verdict against the mechanical evidence below. Where a verdict and a grep disagree, **the grep wins and the disagreement is recorded**.

D-47 is explicitly an **addition** to D-43's mechanical bar, never a substitute — so its absence does not weaken the per-clause evidence below, which was run against live source and is what actually decides. It does mean the phase's extra layer of skepticism on these four was not applied.

### The four re-checks, mechanically

| Issue | Original single unmet clause | Command | Output | Verdict |
|---|---|---|---|---|
| **#4** | `grep autoMode src/renderer/src/components/AgentCard.tsx` was empty | `grep -c autoMode …/AgentCard.tsx` | **`4`** | now met — chip at `:291`, `aria-label` folds the state in at `:187`, onboarding at `OnboardingWizard.tsx:608-618` |
| **#5** | queue-drain and quiesce renderer-only | `grep -n "drainQueue\|quiesce" src/main/delivery.ts` | `:518 drainQueue()`, `:643 quiesce()`, `:270 quiesced` | both now in **main**, on the existing tick |
| **#10** | `electron` was `^32.2.0` | `grep -n '"electron"' package.json` | `78:    "electron": "^43.4.1",` | now met (though `#10` carries **no** Electron clause — see the mapping error below) |
| **#34** | nothing consumed `taskSpend().over` | `grep -n budgetForAgent src/main/index.ts` · `grep -n "budget.tokens > budget.cap" src/main/breaker.ts` | `1635: budget: hive.budgetForAgent(id)` · `361: if (budget.tokens > budget.cap) {` | now met, **stated precisely**: `.over` itself has no direct caller; its two inputs do, and the same comparison is made one layer down |

### Per-clause status posted, nothing closed

| Issue | Fix clauses met | Comment posted |
|---|---|---|
| **#4** | 2 of 2 | [issuecomment-5372935785](https://github.com/MARKXAILABS/hello-markx/issues/4#issuecomment-5372935785) |
| **#5** | 4 of 4 | [issuecomment-5372936024](https://github.com/MARKXAILABS/hello-markx/issues/5#issuecomment-5372936024) |
| **#34** | 2 of 2 | [issuecomment-5372936237](https://github.com/MARKXAILABS/hello-markx/issues/34#issuecomment-5372936237) |
| **#10** | **4 of 5** | [issuecomment-5372936437](https://github.com/MARKXAILABS/hello-markx/issues/10#issuecomment-5372936437) |

Each comment carries the issue's acceptance text verbatim, one command per clause with its real output, the named test, and the `npm test` exit line.

### A correction to an earlier per-clause reading — recorded, not carried forward

`STATE.md`'s ledger, from 01-11, records **#10 defects 1, 2 and 3 as all still open**. That was true when measured and **two of the three have since landed**. Re-derived at wave 9:

- **defect 1 — CLOSED.** `webhook.ts:268` and `slack.ts:202` both `server.listen(this.port, '127.0.0.1', …)`.
- **defect 3 — CLOSED.** `redactedConfig()` exported at `config.ts:622` and imported at `index.ts:18`.
- **defect 2 — PARTIAL, and it is the single clause holding #10 open.** The clause is *"capture the handle, **or** document + **surface** that stop is not complete"*. Capturing is impossible (`tunnelmole()` resolves with a URL string, no disposer). Documented: yes, at length. **Surfaced: no** — `grep -rn tunnelStillOpen src/` returns four hits, **all four inside the two `stop()` methods, with no caller consuming the return value.**

This is exactly why the ANCHOR-DRIFT discipline exists: a stale per-clause reading is the same defect as a wrong one.

### Fixed-but-open issues, and the plan that should have closed each

**Under D-44's rule ("issues close in the PR that fixes them"), three issues are fixed-but-open.** They are named here as a process record — but they could not have been closed by their fixing plan either, because **that plan's PR has not merged to `main`**. The process failure is therefore not "the fixing plan forgot"; it is that the phase ran entirely on an unmerged branch and D-44 has no way to fire until PR #77 lands.

| Issue | Every Fix clause met since | Would have closed in |
|---|---|---|
| #4 | plan 01-12 (wave 6) | 01-12's PR |
| #5 | plan 01-08 (wave 4) | 01-08's PR |
| #34 | plan 01-10 (wave 5) | 01-10's PR |

**The real recommendation for the next phase:** either merge to `main` per wave, or state up front that a milestone branch defers all issue closure to the merge — and put that in `01-CONTEXT.md`'s decision list rather than discovering it in wave 9.

### Issue-mapping errors, recorded rather than silently repaired

- `REQUIREMENTS.md` mapped **FLOOR-03** (Electron) to **#10**, which is *"H2 — Network and secret hygiene"* and carries **no Electron clause**. The end-of-life-Electron issue is **#8**, which is **CLOSED**. FLOOR-03 therefore traces to no open issue. Corrected in `REQUIREMENTS.md` by **naming the gap**, not by inventing a trace.
- `CONCERNS.md`'s `#10` row inherited the same mis-mapping and is corrected with it.

---

## Task 3 — the verification sweep

### `continue-on-error`, counted in both units

```
$ grep -cE "^[^#]*continue-on-error: *true" .github/workflows/ci.yml   →  2   (effective — the gate)
$ grep -c "continue-on-error" .github/workflows/ci.yml                 →  4   (raw, incl. 2 prose mentions)
```

Effective is exactly **2**; raw does not exceed **4**. **No `continue-on-error` was added anywhere, for any reason.**

```
$ grep -c "npm rebuild better-sqlite3" .github/workflows/ci.yml        →  0
```

### The ADR pointer sweep — non-empty, and every hit resolves

```
$ grep -rhoE "adr/[0-9]{4}[0-9a-z-]*" src/ | sort -u
adr/0005-cumulative-cost-ledger
adr/0006-terminal-pool-lifetime

$ ls docs/adr/0005*.md docs/adr/0006*.md
docs/adr/0005-cumulative-cost-ledger.md   docs/adr/0006-terminal-pool-lifetime.md

$ grep -rlE "adr/000[56]" src/ | sort
src/main/db.ts
src/main/telemetry.ts
src/renderer/src/components/terminalPool.ts
src/renderer/src/store/terminalPoolPolicy.ts
```

All four contracted files present. The sweep was keyed on the bare `adr/NNNN` substring plans 04 and 05 actually mandate — a `docs/adr/….md` pattern returns **empty** on this tree and would have passed vacuously over nothing.

### GATE-01's shape, asserted as a backstop

```
src/main/hooks.ts:   grep -c "'\.git'"    → 1      (baseline 0)
                     grep -c "'agents'"   → 2      (baseline 0)
                     grep -c "realpath"   → 3      (baseline 0)
                     grep -c "HIVE_ROOT"  → 7      (baseline 0)
                     grep -c "sockPath()" → 6      (baseline 2)
```

All four protected entrances covered, `realpath` included — so a symlink hop (`ln -s "$HIVE_ROOT/bin" /tmp/b`) cannot defeat a resolve-only gate.

```
$ grep -c "process.env.HIVE_SOCK_TOKEN *=" src/main/index.ts     →  0   (baseline 1 — the floor-wide secret is gone)
$ sed -n '/private startProxyBridge/,/^  }$/p' src/main/hive.ts | grep -c "HIVE_SOCK_TOKEN"
  1  →  "            HIVE_SOCK_TOKEN: token"   ← a per-agent token, NOT process.env
```

**All six shim templates carry the token** (both loops, `HIVE_SOCK_TOKEN` and `sock_token`):

```
HOOK_SHIM  AGY_HOOK_SHIM  PI_EXTENSION  OPENCODE_PLUGIN  PROXY_BRIDGE_SHIM  GROK_HOOK_SHIM
    1            1              1              1                 1                 1
```

**Attribution, stated so it is not misread:** `PI_EXTENSION`, `OPENCODE_PLUGIN` and `PROXY_BRIDGE_SHIM` read `0 0 0` **at HEAD before this phase began**. Those three engines were **already dead-hooked** — a pre-existing defect this phase's plan 01-06 closed, **not** one GATE-01 introduced.

### Both composition-root seams are fed

```
$ grep -c "recordCostSample" src/main/index.ts   →  1   (baseline 0)   FLOOR-09: plan 06 minted, plan 08 injected
$ grep -c "budgetForAgent"   src/main/index.ts   →  1   (baseline 0)   FLOOR-10: plan 09 minted, plan 10 fed
```

Both now pinned in `test/repo-claims.test.cjs` with messages naming the consequence, so a later refactor cannot quietly unfeed either seam behind a green suite.

### ROADMAP's five success criteria, one at a time

| # | Criterion | Evidence | Verdict |
|---|---|---|---|
| **1** | Autonomy survives the window; no doc promises a code path that does not run | Queue-drain: `delivery.ts:518 drainQueue()`. Quiesce: `delivery.ts:643`. Both on main's existing tick — `test/delivery-main.test.cjs`, 28 pass / **0 skipped**, incl. a test that stubs `global.setInterval` and asserts `start()` actually schedules the tick. Twelve HIVE.md denials deleted and pinned by `test/repo-claims.test.cjs` *"HIVE.md no longer promises the Stop-drain does not run"*. **Premise corrected (D-37): the Stop-drain was never dead** — `index.ts:545 → hooks.ts:663 → delivery.ts:604 → hive.ts:1368`, cursor advanced at `hive.ts:1375`. **The dead-doc clause was FALSE until this plan**: `docs/message-queue.md` §1/§6 and `docs/adr/0001` both still named the deleted `useHive.ts` effect #4 as the sole PTY writer; both corrected here. | **PARTIAL** — every automatable half is TRUE and pinned; the *"close the window and watch an idle agent get woken"* half has never been observed by a human |
| **2** | Supported runtime, provenance checkable, three-platform green, no `continue-on-error` added | `"electron": "^43.4.1"` → Electron 43.4.1 / Chromium 150 / Node 24.18.1, read from the installed binary. `node-pty` + `better-sqlite3` rebuilt. Three `Test (os)` rows `pass` at `74b3d05` with per-platform counters 535/535/0/0, 535/531/0/4, 535/535/0/0. `e2e/smoke.spec.ts:188` asserts major ≥ 43, green as `Electron smoke (ubuntu-latest)`. `attest-build-provenance@v4` at `release.yml:220` over the merged-checksums subject, ordering and permissions **parsed** not grepped. Release-link gate is `release.yml`'s `links` job with `build` declaring `needs: links`. `continue-on-error` effective **2**, raw **4**, unchanged. **Read as D-02 restates it: Electron 43.x, not a literal "38+"** — 38 is itself EOL and a literal reading would license shipping the exact defect FLOOR-03 exists to close. | **PARTIAL** — **D-09's live Windows run has never happened and 01-01 has no SUMMARY**, and `gh attestation verify` has never run because no `v*` tag has been pushed |
| **3** | Spend, secrets and identity contained, not merely observed | Secret scrub: `scrubStagedSecrets` inside `flushCommit`'s retry loop, added lines only, bounded twice (20,000 changed lines via `--numstat` before buffering, then 4 MB), asymmetric failure polarity. Cap enforced: `hive.budgetForAgent()` → `index.ts:1635` → `breaker.ts:361`. Number corrected: the 1 MB tail **deleted**, spend is a clamped consecutive **diff** not a sum, bounded by card lifetime. Proxy-tier spend reaches the breaker: `telemetry.recordCostSample` at `index.ts:547`. Per-agent tokens minted at `PtyManager`, revoked token-exact on PTY exit; floor-wide assignment gone; all six shims carry it. | **PARTIAL** — the identity clause is **not unconditionally true**: agent B's token lives in B's process environment and a same-uid Linux sibling reads `/proc/<B-pid>/environ`. Plan 01-04 deliberately declined to claim it. `redactSecrets` also has a measured, pinned ceiling. |
| **4** | The floor is legible to the operator watching it | AUTO chip in all three renderings, asserted on **rendered markup** (`test/renderer-components.test.cjs`). Model renders before cost. 1024px collapse verified in the shipped app at its exact boundary (absent at 1024, present at 1023). M1 **604 → 16**, all 16 `aria-hidden` glyphs, allowlist multiset-equal, mutation-proven both ways. Zero unnamed icon-only controls across 128 `<button>` + 155 `<PixelButton>`. Notification path gated on provider **in main**, RED-controlled 5/5; OS layer proven live on this win32 host. `openLogs` live in main, exposed in preload, reached from `SettingsModal.tsx:945`. PTY byte does not re-render the roster; pool bounded and disposes on every drop path. **`SettingsModal`'s notification copy now carries the macOS qualifier** — it over-claimed until this plan. | **PARTIAL** — the Pixi labels render at **7px** on screen despite `FONT_SIZE = 14` (`RENDER_SCALE = 0.5`); two residual layout clips need `store.ts`; and **no human has looked at any of it** |
| **5** | The protocol closes its own loops and the issue list is honest | `owesReview` obligation set (proven RED, `3 !== 0`); the previous-snapshot membership guard **deleted**, because a card created and finished inside one sweep window is never observed non-done. `canReceiveInbox` enforced at `hive.ts:1908/:1573/:1596`, pinned by a named test. FTS5 `memory_fts` in the already-open `PersistStore`, with `keywordSearch()` fallback so recall survives a missing CLI — `test/db-fts.test.cjs`, 6 pass / **0 skipped**, bypass grep `0`. `test/renderer-components.test.cjs`, 6 tests on real markup. ESLint 9 flat config at `--max-warnings 0`, asserted through ESLint's **own resolver**. Codex-on-Windows stated in source, docs and UI. | **FALSE on its final clause.** `gh issue list --state open --label floor-inspection` returns **20 non-epic issues**, not only the four epics. Also open: FLOOR-07's 7-site *"Enterprise Knowledge Graph"* rename residual, and the `--wing` scope caveat the requirement's own ⚠️ names (RECALL-02, Phase 5) |

**Two roadmap corrections stated plainly, as the plan requires:**
- **Criterion 2 reads as Electron 43.x (D-02)**, not a literal "38+". Electron 38 is itself end-of-life; a literal reading would let this phase ship the exact unsupported-runtime defect FLOOR-03 exists to close.
- **Criterion 1's "dead Stop-drain" premise was factually wrong (D-37).** The drain is live and guarded. Correcting a roadmap claim IS doing this phase, not deviating from it.

### D-09 — confirmed NOT recorded

```
$ ls .planning/phases/01-finish-the-floor/01-01-SUMMARY.md
ls: cannot access '…/01-01-SUMMARY.md': No such file or directory

$ ls .planning/phases/01-finish-the-floor/*-SUMMARY.md | wc -l
21          ← for 22 completed plans
```

**FLOOR-03 does not close.** `01-VALIDATION.md` is explicit that CI is not acceptable closure evidence: all 535 unit tests run with `electron` **stubbed** and are structurally incapable of failing on an Electron-version regression.

### The two outstanding live samples — recorded as outstanding, not claimed

1. **FLOOR-06's `gh attestation verify`.** `release.yml`'s publish job is gated on `refs/tags/v*` and no tag has been pushed since 01-04 landed the step. Provenance is verified **structurally only**. Run `gh attestation verify <artifact> --repo MARKXAILABS/hello-markx` after the next `v*` tag and paste the output.
2. **macOS notification delivery.** Structurally unverifiable on this project: Electron 42 moved macOS toasts to `UNNotification`, which the system draws only for a **code-signed** app, and paid signing is out of scope. Plan 01-13 states the limitation rather than claiming the capability, and as of this plan the Settings UI says so too.

### The bounded doc-claim sweep — six surfaces, every hit with a verdict

| Surface | Hits | Verdicts and action |
|---|---|---|
| **Stop-drain / drain / quiesce** | 9 | `HIVE.md:90` **TRUE**, anchors stale → corrected (`hooks.ts` 662→663, 645→646; `delivery.ts` 262→604; `index.ts` 480→545). `ARCHITECTURE.md` ×5, `STRUCTURE.md:151`, `CONCERNS.md:11` all **FALSE** (describe the MD-queue drain as renderer-only) → corrected. |
| **`cursor.json`** | 4 | `HIVE.md:115/:137` **TRUE**. `HIVE.md:295` **TRUE but stale anchor** (`hive.ts:1338` → `:1375`) → corrected. `ARCHITECTURE.md:202` **stale** (`delivery.ts:216` → `:604`) → corrected. |
| **responsive / `@media` / breakpoint** | **0** | No doc in the set makes a responsive claim. Nothing to falsify. |
| **`openLogs` / "open logs"** | **0** | No doc in the set claims it (the bug template does, and lives outside the doc set — verified separately and asserted in `test/ci-config.test.cjs:236`). |
| **FTS5 / full-text** | 6 | `README.md:117` **TRUE** (`memory_fts`, `db.ts:100`). `docs/design/knowledge-graph.md:43/:45/:51/:191`, `CONCERNS.md:43/:46`, `INTEGRATIONS.md:70` **all TRUE** — they describe the **KG corpus** (`kg-core.cjs`, still a keyword scorer over `index.jsonl`), a different subsystem from the memory index 01-10 landed. No change; the distinction is why they read as stale and are not. |
| **notification / toast / REMOTE CONTROL** | 15 | `README.md:57/:58/:139-147` **TRUE** (and `:139-147` already carried the macOS qualifier). `DESIGN.md` ×8 are design-system entries, not behaviour claims. `docs/claude-accounts.md`, `docs/release-drops.md` **TRUE**. `CONVENTIONS.md:35` **FALSE** ("Seven" then lists nine) → corrected. **Out of the doc set but the same claim: `SettingsModal.tsx:1008` over-claimed** → fixed in its own commit. |

**Hits outside the six surfaces, named as carried forward rather than swept:** the seven `"Enterprise Knowledge Graph"` sites (`resources/skills/capabilities/SKILL.md:96`, `config.ts:159/:275/:493`, `hive.ts:1455`, `store/config.ts:74/:142`). See `deferred-items.md` § 5.

### The five unowned doc surfaces — before and after

`node -e "…devDependencies.electron"` → **`^43.4.1`**; the installed binary reports `node=24.18.1 chrome=150.0.7871.224 electron=43.4.1`. Every rewritten version string was checked against those, not against each other.

| File | Command | Before | After |
|---|---|---|---|
| `.planning/codebase/STACK.md` | `grep -cE "Electron 32\|\^32\.2\.0"` | 2 | **0** |
| `.planning/PROJECT.md` | `grep -c "Electron 32"` | 1 | **0** |
| `.planning/codebase/INTEGRATIONS.md` | `grep -c "Electron 32"` | 1 | **0** |
| `.planning/codebase/CONVENTIONS.md` | `grep -c "No linter configured"` | 1 | **0** |
| `.planning/codebase/CONVENTIONS.md` | ``grep -c "Seven `react-hooks/exhaustive-deps`"`` | 1 | **0** |
| `.planning/codebase/CONVENTIONS.md` | `grep -c "React components use default exports"` | 1 | **0** |
| `.planning/codebase/CONCERNS.md` | `grep -cE "Electron 32\|\^32\.2\.0\|bump never happened"` | 3 | **2 — NOT 0, see below** |

**`INTEGRATIONS.md` changed exactly one line, and it is not `:116`** (plan 02 owns that one):

```
$ git diff --stat .planning/codebase/INTEGRATIONS.md
 .planning/codebase/INTEGRATIONS.md | 2 +-
 1 file changed, 1 insertion(+), 1 deletion(-)
$ git diff -U0 … | grep -E "^@@"
@@ -51 +51 @@
```

**The `CONCERNS.md` criterion is reported NOT SATISFIED, and the reason is a defect in the criterion, not in the document.** The plan requires both *"rewrite them as resolved history naming the plan and the landed version"* and *"`grep -cE "Electron 32|\^32\.2\.0|…"` returns `0`"*. Those two instructions are mutually exclusive: a resolved-history entry that cannot name the version it resolved is not auditable, and `CONCERNS.md` is explicitly *"what the phase's own premise is audited against"*. The two remaining hits are:

```
36:**RESOLVED — Electron 32.2.0's end-of-life runtime (kept as history, not deleted):**
37:- Was: `package.json` pinned `"electron": "^32.2.0"` (Chromium 128) — outside …
```

Both are inside the resolution record; **neither is a live claim**. The positive check the criterion should have used passes: every version string in every rewritten document equals `^43.4.1` / Electron 43.4.1 / Node 24.18.1. Reported rather than satisfied by deleting the record the same criterion mandates keeping.

### The three codebase-map documents

| Claim | Measured | Action |
|---|---|---|
| `ARCHITECTURE.md`: *"Circular imports: None observed"* | `config.ts:15` ↔ `integrations.ts:28` is a real runtime cycle | corrected |
| `ARCHITECTURE.md`: *"`index.ts` is the only file that imports the domain modules"* | **45** cross-module imports among `src/main/*.ts` excluding `index.ts` | corrected |
| `ARCHITECTURE.md`: `window.cth.spawnAgent(opts)` | **no such method** — the wrapper is `spawnPty` (`src/preload/index.ts:617`) | corrected |
| `ARCHITECTURE.md` + `STRUCTURE.md`: `Agent.blockedOnGod` | **0 hits** in `src/` or `test/`; the real field is `waitingOnGod` (`store.ts:61`) | corrected |
| `ARCHITECTURE.md`: `HiveManager` *"lines 424-2772, ~2.3k"* vs `CONCERNS.md`: *"opens at 424, runs to end of file, ~3,100 lines"* | class opens at **491**, closes at **3313**, ~2.8k lines | **both** corrected; the two documents now agree, and neither was right |
| `STRUCTURE.md`: main *"45 files, ~24.1k lines"* | **46** `.ts` files, **~24.5k** lines | re-derived, not nudged |
| `STRUCTURE.md`: components *"64 files"* · shared *"19 files"* | **61** top-level (75 with subdirs) · **21** | re-derived |
| `TESTING.md`: *"55 test files, ~466 cases"* | **60** files, **592** cases | re-derived |
| `TESTING.md`: *"423 tests, 421 pass, 0 fail, 2 skipped"* · *"the suite's only 2 skips"* | **535 / 531 / 0 / 4** on win32, **0 skips** on POSIX | re-derived, with the four named and a warning that the number is a **ceiling, not a floor** |
| `CONVENTIONS.md:101`: *"React components use default exports"* | **0 of 75** `.tsx` use one — never true, inferred from tooling rather than measured | corrected |
| `CONVENTIONS.md` Linting counts | `exhaustive-deps` **11**, `@typescript-eslint` **0**, `eslint-disable` **11** | re-derived from the post-plan-21 tree; note the direction, 9 → 11, because three suppressions were *added* where the rule's own remedy introduces a defect |

### `01-VALIDATION.md`

The three "stale wave rows" the plan requires corrected were **already correct** — this was a preservation check and it passed: repo-claims reads *"plan 05 (wave 2) → plan 07 (wave 3) → plan 10 (wave 5), asserted whole by plan 23 (wave 9)"*, renderer-components reads *"Plan 22, wave 8"*, db-fts reads *"Plan 10, wave 5"*, hooks-notify reads *"Plan 13, wave 6"*.

All four round-2 preservation greps re-run and still at their values:

```
grep -c "ratio assertion"          → 0     (the row reads "icon-only rule assertion")
grep -c "After wave 6, add"        → 0     (the gate reads "After wave 8")
grep -cE "npx eslint"              → 3     — and all three are PROHIBITION prose:
    :28   "…never bare `npx eslint`, which fetches an unpinned ESLint from the registry."
    :115  "`npm run lint` (local install — never bare `npx eslint`)"
    :186  "…bare `npx eslint` would fetch an unpinned ESLint from the registry"
grep -c "rebuild step is budgeted" → 1     (the round-2 prohibition sentence, still there)
grep -c "npm rebuild better-sqlite3" .github/workflows/ci.yml → 0
```

**Checkbox state: `13` unticked → `2`.** The four Wave-0 items are ticked with their counters; the twelve `❌ W0` cells in the Per-Requirement Verification Map are flipped. Five of the seven Sign-Off items are ticked with the command that produced each. **Two are labelled GAP:**

- **D-09's live Windows run is NOT recorded** — `01-01-SUMMARY.md` does not exist.
- **`nyquist_compliant` stays `false` and `status` stays `draft`**, conditional on the item above. Setting either while D-09 is unrun would be exactly the "green checklist that overstates reality" this phase exists to remove.

`grep -c "^- \[ \]"` → **2**, both named gaps.

---

## Requirement adjudication — all 23 rows

**10 close. 13 do not.** Full per-clause reasoning is appended to `.planning/REQUIREMENTS.md` § *Phase 1 adjudication*.

**Closed:** FLOOR-08, FLOOR-09, FLOOR-10, FLOOR-15, FLOOR-16, FLOOR-17, RECORD-03, RECORD-04, VERDICT-02, VERDICT-03.

**Open, and what blocks each:**

| Blocked on | Requirements |
|---|---|
| **An operator in front of the running app** (8) | FLOOR-01, FLOOR-02, **FLOOR-03**, FLOOR-05, FLOOR-11, FLOOR-12, FLOOR-13, FLOOR-14 |
| **A `v*` tag** (1) | FLOOR-06 |
| **Named follow-up work** (4) | FLOOR-04 (`redactSecrets` ceiling), FLOOR-07 (7-site rename residual), FLOOR-18 (no Codex subscription), GATE-01 (`/proc` ceiling → GATE-02, Phase 4) |

**Two bars, stated so they cannot drift.** A checkbox says *"this requirement's clauses are met on the milestone branch"*. Closing an issue is a public statement about the **shipped** product. `main` is at `19dbdfb` with `electron: ^32.2.0`, so no issue was closed.

**The D-22 residual is adjudicated, not left unowned.** `hive.ts:2049-2073` widens every `hive:tasks` row with `{tokens, budgetTokens, pct}` and `grep -rn budgetTokens src/renderer/` returns nothing. **Verdict: these are NOT a FLOOR-13 clause.** FLOOR-13's text is the sidebar collapse and the four renderings agreeing on cost; the cost clause already ships on `useFleetTelemetry`. The fields' real consumer is a per-card budget **meter**, which is FLOOR-10's subject — and FLOOR-10's enforcement landed in **main**, where no renderer meter is needed for the cap to bite. Carried forward as *wire a meter or revert the widening*, with an owner.

---

## Deviations from Plan

### Auto-fixed and reported

**1. [Rule 2 — missing critical functionality] `SettingsModal`'s notification row promised a capability macOS refuses**
- **Found during:** Task 3's doc-claim sweep, surface 6
- **Issue:** `SettingsModal.tsx:1008` read *"Native toasts when an agent finishes or needs your input."* with no platform qualifier. On an unsigned macOS build the switch can be on, the app can fire, and nothing appears — `UNNotification` requires code signing and paid signing is out of scope.
- **Fix:** one sentence appended, copy only. **No `fontSize` added** — the file's M1 occurrence count is pinned at 0 by plan 01-15 and asserted at wave 9; re-measured **0** after the edit.
- **Why here:** 01-13 named it as FLOOR-14 truth 5 and correctly refused to break its own containment criteria; 01-15 held the file and refused on the same grounds. The accumulated ledger assigns it to *"plan 23's wave-9 doc-claim sweep"*, whose surface 6 is exactly "notifications".
- **Commit:** `71a4016`

**2. [Rule 1 — bug in this plan's own test] the `role="button"` guard reported a false failure**
- The first version located the open tag with `indexOf('>')`. Both divs carry `onKeyDown={(e) => …}`, so the scan ended inside the fat arrow and reported *"no aria-label"* against a div that plainly has one. That failure looks **exactly** like the real regression the test exists to catch, which makes it worse than no test. Fixed to use the brace-aware scanner before the commit landed.

**3. [Rule 1 — encoding] four raw NUL bytes in the generated test source**
- The multiset key separator was written as a raw `\x00` byte rather than the two-character escape. Caught by an explicit NUL scan before staging (the environment brief warns about exactly this). Replaced with `'\u0000'`, which is the **better** design anyway: a NUL can never appear in source text, whereas a space — the obvious separator — appears in both file paths and JSX.

### Deliberately NOT done, each with its reasoning

- **`PixelButton.tsx`'s `aria-label` prop.** Byte pin held. See § *The PixelButton byte pin* above and `deferred-items.md` § 2.
- **The seven `"Enterprise Knowledge Graph"` sites.** Outside the six declared sweep surfaces; the plan says such hits are *"named as carried forward rather than silently swept"*.
- **The two residual layout clips.** Both need `store/store.ts`, outside every plan's file set; UI-SPEC containment step 3 is *stop and report*.
- **Closing any GitHub issue.** Not on `main`.

### Criteria reported NOT SATISFIED rather than met

- **`CONCERNS.md`'s `grep → 0`** — mutually exclusive with the same task's instruction to keep resolved history naming the version. Reported with both remaining hits pasted and classified.
- **D-47's fresh-context subagent re-verify** — no subagent tool in this executor's toolset. MEASUREMENT UNAVAILABLE, with exactly what a human must do.
- **D-46's gate returning `0`** — it returns `20`.
- **ROADMAP criterion 5's final clause** — FALSE.

---

## Checkpoint — Task 4 (operator sign-off)

**Auto-approved under the operator's standing session policy** (checkpoints auto-approved; operator not available this session). The five answers, derived from the mechanical evidence above rather than from a human reading it:

| # | Question | Answer |
|---|---|---|
| 1 | Evidence table sound — every criterion cites a test name or pasted output, not a sentence? | **YES** for all five criteria. Every cell above names a file, a test, or a command with its output. |
| 2 | D-46 gate at zero? | **NO.** It returns **20**. Only #47/#48/#49/#73 are epics; twenty non-epic issues remain open. |
| 3 | TAP counters inside their floor on a **non-empty** draft-PR checks table? | **YES.** `# fail 0`, `# todo 0`, `# skipped 4` (= the win32 baseline, not greater), `# pass 531 > 422`; and the counters resolve per platform in the CI logs at `74b3d05`, with a seven-row non-empty checks table and `gh pr checks` exit `0`. |
| 4 | D-09 recorded? | **NO.** `01-01-SUMMARY.md` does not exist. FLOOR-03 does not close. |
| 5 | Spot-checked issue comment passes? | **YES** — **#10**, [issuecomment-5372936437](https://github.com/MARKXAILABS/hello-markx/issues/10#issuecomment-5372936437). It carries the acceptance text verbatim for all five defects, a command with real output per clause, named tests (`net-binding`, `hook-auth-roundtrip`, `hive-durability`), and the `npm test` exit line — and it **corrects** an earlier stale reading rather than repeating it. |

**Criteria whose cited evidence is a sentence rather than a command, named as gaps:** none in the evidence table. The gaps are elsewhere and are named above — the eight operator observations, the `v*` tag, and D-47's absent subagent dispatch.

**What auto-approval did NOT buy, stated plainly:** this checkpoint exists precisely so *"a human reads the evidence rather than the report"*. No human has read it. The five answers above are an agent's answers to an agent's evidence, and that is the one thing this checkpoint was designed to prevent. **MEASUREMENT UNAVAILABLE — an operator must read § *ROADMAP's five success criteria* and § *D-46* and confirm or dispute these five answers.**

---

## THE VERDICT

# Phase 01 is **PARTIAL**, not COMPLETE.

**What is genuinely done:** 152 commits, 22 of 23 plans executed, the suite grown 423 → 535 with **0 failures on all three platforms**, a hard lint gate at zero warnings, Electron 43.4.1 on a supported runtime, per-agent hook tokens replacing a floor-wide secret, the delivery queue and its drain moved into main, a real FTS5 index, a secret scrub at the single commit choke point, 604 sub-14px sites reduced to 16 aria-hidden glyphs, the renderer's first component tests, and **10 of 23 requirements closed against a per-clause bar**.

**What remains, exactly, and who owns it:**

| # | Outstanding | Owner |
|---|---|---|
| 1 | **Merge PR #77 to `main`.** Nothing else can close until this happens. | **Operator** |
| 2 | **D-09's live Windows run**, and plan 01-01's missing SUMMARY | **Operator** |
| 3 | Seven more operator observations — window-closed delivery, the log-folder click, the Tasks board, the auto-mode checkpoint, the toast-and-click, the swept surfaces, the optional secret-scrub run | **Operator** |
| 4 | `gh attestation verify` after the next `v*` tag | **Operator** |
| 5 | D-47's fresh-context subagent re-verify of #4, #5, #10, #34 | **Operator** |
| 6 | `#10` defect 2 — give `tunnelStillOpen` a consumer that tells the operator | **A Phase 2+ plan** |
| 7 | `#18` × 3 clauses; `#36` × 1 clause | **A Phase 2+ plan** |
| 8 | FLOOR-07's 7-site `"Enterprise Knowledge Graph"` rename | **A plan holding `config.ts` / `hive.ts` / `store/config.ts`** |
| 9 | Two layout clips + the Pixi `RENDER_SCALE` geometry + `PixelButton`'s `aria-label` prop | **A Phase 2+ plan holding `store.ts` / the office scene / `PixelButton.tsx`** |
| 10 | `redactSecrets`' measured ceiling; GATE-01's `/proc` ceiling | **A widening plan; GATE-02, Phase 4** |

**Would I bet my pager on this?** On the ten closed requirements and the mechanical gate: yes — each has a command that produced it in this session and a test that will catch its regression on every future PR. On calling the phase complete: **no**, and that is the finding. The phase set out to make "every claim the project makes about itself true". The truest claim available at its end is that it is not finished — and it now has a mechanical gate that will say so on every PR until it is.

---

## Commits

| Hash | Message |
|---|---|
| `503f856` | `test(01-23): assert the repo-fact accumulator whole, with the four-clause FLOOR-12 bar` |
| `26511b3` | `docs(01-23): correct three requirement definitions that were false about source` |
| `71a4016` | `fix(01-23): the notifications settings row promised a capability macOS refuses` |
| `74b3d05` | `docs(01-23): the bounded doc-claim sweep, and the sign-off held honest` |
| `b8e3c05` | `docs(01-23): adjudicate all 23 Phase-1 requirement rows, per clause` |
| `cde51b9` | `docs(01-23): carry nine items out of Phase 1, each with a named owner` |

---

## Known Stubs

None introduced by this plan. Every stub-shaped residual in the tree is inherited, named in `deferred-items.md` with an owner, and is why 13 requirements are open rather than closed.

## Threat Flags

None. This plan added no network endpoint, auth path, file-access pattern or schema change. `src/renderer/src/components/SettingsModal.tsx` is the only source file touched and the change is display copy.

---

## Self-Check: PASSED

All 17 files claimed above exist on disk. All 6 task commits resolve in `git log`. The full suite
re-run after every edit: `EXIT=0`, `# tests 535 # pass 531 # fail 0 # skipped 4 # todo 0` locally on
win32, and green on all three platforms on PR #77 at `74b3d05`. `npm run typecheck` → `0`.
`npm run lint` → `0`. No NUL bytes and no mixed line endings in any edited file. `git status
--porcelain src/` empty after all ten RED controls and both mutation probes.
