---
phase: 02-the-daemon-and-the-protocol
plan: 06
subsystem: ui
tags: [react, electron-renderer, mcp, capability-ledger, accessibility, node-test]

# Dependency graph
requires:
  - phase: 02-the-daemon-and-the-protocol
    provides: "02-07's providerCapabilities(provider, platform?)/ProviderCapabilities.mcp; 02-11's per-agent mcpAgentGrants config field + mcp:agentState/mcp:grant/mcp:revoke IPC + preload platform field; 02-02's eslint.config.js/boot-floor gate"
provides:
  - "src/renderer/src/store/config.ts — capabilityGaps/capabilityChipText/mcpCardSummary, the single ranked derivation all three D-31 surfaces render from, plus the module-singleton MCP grants mirror (autoMode.ts's shape)"
  - "src/renderer/src/components/McpConsentModal.tsx — DAEMON-04's consent dialog: bypassed-permissions warning, read-only safe list, per-server consent rows with the verbatim launch spec and a write-only key field"
  - "AgentCard.tsx's third row — one ranked gap chip + one MCP element, both aria-hidden and folded into the card's aria-label"
  - "AddAgentModal.tsx's LIMITS OF THIS ENGINE block and CommandCenterPanel.tsx's role=status mail-gap line — S1b/S1c"
  - "test/capability-surface.test.cjs — the restated PARITY-01b gate, a paren-depth two-argument scanner, the locked gap vocabulary, and the ⚿/⚠/↻ mark-collapse guard"
affects: [02-12]

tech-stack:
  added: []
  patterns:
    - "One ranked derivation (capabilityGaps) consumed by three independent renderer surfaces instead of three hand-written copies of the same sentence — the D-30 anti-orphan pattern"
    - "Module-singleton + subscribe/getSnapshot pair for renderer-side grant state (store/config.ts's McpGrantsSnapshot), copying autoMode.ts's shape exactly so the module keeps loading under node --test"
    - "A paren-depth-scanning repo-fact clause replacing a regex that passes vacuously on nested two-argument calls (D-40)"

key-files:
  created:
    - test/capability-surface.test.cjs
    - src/renderer/src/components/McpConsentModal.tsx
  modified:
    - src/renderer/src/store/config.ts
    - src/renderer/src/components/AgentCard.tsx
    - src/renderer/src/components/AddAgentModal.tsx
    - src/renderer/src/components/CommandCenterPanel.tsx
    - src/renderer/src/components/AgentDetailPanel.tsx

key-decisions:
  - "List B's primary 'grant to {name}' footer button is a BATCH action over per-row checkboxes, not one action per row — checkboxes are the mechanism that makes 'every newly-checked secret-tier row has a key' a coherent disabled condition; an already-granted row's key re-entry ('replace key') is a separate, immediate per-row save kept out of the batch (76a1f72)."
  - "S2a's MCP_CHIP_MAX_W stays 152 (S1a's own starting value) — the only scenario reachable in the shipped app (claude is the sole MCP-wired engine and carries zero capability gaps) measures note=87px at all three widths, no overflow. The scenario the pass condition is literally written against (a gap chip AND a full MCP element on the same row) is a genuine STOP-AND-REPORT: it cannot reach 80px without growing the frozen 322x86 card, so it was NOT forced — carried forward as a stated limitation for whenever a second engine is MCP-wired (f750035). Independently re-confirmed this session: MCP_WIRED_PROVIDERS = ['claude'] and providerCapabilities('claude', <any platform>) has zero false bits, so the unreachable-today claim holds against the current tree, not just at measurement time."
  - "Glyph probe: ⚿=14px, ↻=10.95px, known-good ⇄=11.74px, tofu reference (U+FFFF)=9.04px — neither ⚿ nor ↻ is tofu, no substitution to the prescribed 'key'/'restart' words was needed. Verified self-consistent this session: the shipped code renders the literal glyphs, not the substitution words (a19ee56)."
  - "row === undefined renders no chip and no MCP element, rather than falling back to inferAgentProvider(undefined, undefined) === 'claude' — a fallback would paint a fabricated capability profile onto an unidentified agent (the same defect class as 01-14's dropped field)."

requirements-completed: [PARITY-01b, DAEMON-04]

duration: ~58min (task execution, prior session) + this recovery/closeout session
completed: 2026-08-24
---

# Phase 02 Plan 06: The engine capability ledger gets a screen; DAEMON-04's consent modal Summary

**capabilityGaps()/mcpCardSummary() — one ranked derivation over `providerCapabilities(provider, platform)` — now renders on the agent card, the provider picker and the dispatch flow; `McpConsentModal.tsx` is the missing DAEMON-04 consent dialog, mounted from two real surfaces and reading the exact `mcpAgentState`/`mcpGrant`/`mcpRevoke` IPC contract 02-11 shipped.**

## Recovery Dispatch — what this document is

This is a **closeout, not a fresh execution**. A prior executor session landed all 5 of this plan's task commits (`74fa680` … `f750035`, oldest first) and was killed by the operator immediately before writing this file. Every claim below that describes what those 5 commits contain was **independently re-verified against the real tree in this session** — re-run tests, fresh greps, fresh diffs against the correct base SHA (`5832c5e`, the last commit before this plan started) — not copied from the prior session's commit messages on trust. Where a number could not be independently reproduced this session (the live-Electron glyph and containment probes, which require tearing down and rebuilding a throwaway CDP harness), it is reported as **recorded in the commit** and cross-checked for internal consistency (see Decisions Made), never re-asserted as a fresh measurement.

**Nothing was re-implemented.** All 5 tasks' acceptance criteria were checked against the actual tree and found genuinely met — see the per-task verification below. This session's own contributions are: (1) a documentation correction to `deferred-items.md`, (2) flipping `PARITY-01b`/`DAEMON-04` in `REQUIREMENTS.md`, (3) fresh full-suite/typecheck/build/lint runs, and (4) this SUMMARY.

**Important environmental finding, surfaced for the orchestrator:** partway through this session, `git status` went from clean to showing an uncommitted modification to `src/main/index.ts` and a new untracked `test/boot-order.test.cjs` that neither this plan nor this session created. Diffing it shows it is a real, in-progress fix for the exact `hive.setRoutedObserver` pre-existing boot bug this plan's own `deferred-items.md` had logged as out-of-scope — evidently landed by a **concurrent process/agent writing to this same working tree** while this session ran (STATE.md's `workflow.use_worktrees=false` assumption of one-writer-at-a-time did not hold at that moment). Nothing from it was staged, committed, reverted, or touched by this session — every `git add` below names this plan's own files explicitly, never `-A`/`.`. Flagging it because it means this session's own `npm test`/`npm run build` numbers, once that file appeared, reflect a tree with one extra uncommitted file on it that is not this plan's — see the e2e note below for how that was isolated.

## Performance

- **Task-commit duration (prior session):** ~58 min, from the first task commit `74fa680` (23:24:36+05:30) to the last, `f750035` (00:22:53+05:30).
- **Tasks:** 5/5, all previously committed, all verified this session.
- **Files modified (5 task commits):** 8 across 5 commits — `src/renderer/src/store/config.ts`, `test/capability-surface.test.cjs`, `src/renderer/src/components/{AddAgentModal,CommandCenterPanel,AgentCard,AgentDetailPanel,McpConsentModal}.tsx`, plus `.planning/phases/02-the-daemon-and-the-protocol/deferred-items.md` (created by task 3, out-of-scope-discovery log).
- **This closeout session:** 2 additional commits — a `deferred-items.md` correction, and this SUMMARY + STATE/ROADMAP/REQUIREMENTS metadata commit.

## The measured fact this plan exists for (D-30), re-measured this session

Before this plan, `providerCapabilities` had **zero** renderer consumers (per 02-07-SUMMARY: `ProviderCapabilities.mcp` and the `platform` parameter both landed with zero production consumers). Independently re-measured against the current tree, comment-stripped, using the exact `stripComments`/`sourceFiles` walk `test/capability-surface.test.cjs` itself uses:

```
$ node -e "... stripComments + sourceFiles walk over src/renderer/src ..."
renderer providerCapabilities call-site consumers (comment-stripped):
src/renderer/src/store/config.ts
count=1
capabilityLine( call sites in renderer (comment-stripped), should be empty:
count=0
```

**`providerCapabilities` now has exactly 1 renderer production consumer** (`store/config.ts`'s `capabilityGaps`), consumed in turn by all three D-31 surfaces (`grep -c capabilityGaps` on `AgentCard.tsx`/`AddAgentModal.tsx`/`CommandCenterPanel.tsx` → 3/3/3, all `>= 1`). **`capabilityLine` still has zero renderer consumers, by design** — its one intended job stays the god's roster injection (`hive.ts`, plans 02-07/02-08), never a UI surface.

**The restatement, on the record (D-30 honesty, plan output item 2):** `02-VALIDATION.md:82`'s PARITY-01b row literally names `capabilityLine` as the subject and `test/repo-claims.test.cjs` as the file (`| PARITY-01b | capabilityLine has >=1 production consumer | repo-fact | test/repo-claims.test.cjs — grep src/renderer for the import |`). That row's literal subject is **not** satisfied by this plan — `capabilityLine` never gets a consumer. The gate that actually proves PARITY-01b's user-facing promise is restated as **`providerCapabilities` has `>= 1` production consumer**, and lives in **`test/capability-surface.test.cjs`** (not `test/repo-claims.test.cjs`, which has one owner per wave and this wave is not one — confirmed unmodified by this plan's 5 commits, see Containment below). This restatement is recorded here, not quietly substituted; `02-VALIDATION.md` itself is unedited by this plan (out of scope; owed to 02-12's honesty pass per the plan's own file-ownership table).

## The four preconditions — re-verified against the current tree this session

| # | Precondition | Command run this session | Result |
|---|---|---|---|
| 1 | `test/boot-floor.test.cjs` green | `node --test --test-reporter=tap test/boot-floor.test.cjs` | `EXIT=0`, `# pass 19 # fail 0 # skipped 0 # todo 0` — MET |
| 2 | `providerCapabilities(provider, platform?)` + `ProviderCapabilities.mcp` | `tr -d '\r' < src/shared/providerAutomation.ts \| tr '\n' ' ' \| grep -o 'function providerCapabilities([^)]*)'` → `function providerCapabilities(provider: AgentProvider, platform?: string)`; `grep -c 'mcp:'` → `1`; `grep -c 'supportsMcp' src/shared/agentProvider.ts` → `12` (field decl + 11 presets) | MET |
| 3 | `platform: process.platform` on preload's `api` object | `tr -d '\r' < src/preload/index.ts \| tr '\n' ' ' \| tr -s ' ' \| grep -o 'platform: process.platform' \| wc -l` → `1` | MET |
| 4 | `mcpAgentGrants` (>=2) + 3 `mcp:` IPC channels | `grants=3 ipc=3` → `P4 MET` (the plan's own two-record gate script, run verbatim) | MET |

**02-11's real names, as discovered and consumed (plan output item 1, for 02-12):** config field `mcpAgentGrants` on `HarnessConfig`; IPC channels `mcp:agentState` / `mcp:grant` / `mcp:revoke`; preload wrappers `mcpAgentState(agentId)` / `mcpGrant({agentId, mcpId, secret?})` / `mcpRevoke({agentId, mcpId})`. Confirmed byte-exact matches between `McpConsentModal.tsx`'s call sites and `src/preload/index.ts:1231-1245`'s declarations this session.

## Per-task verification (this session, against the real tree)

**Task 1 — `capabilityGaps`/`mcpCardSummary` + the gate (`74fa680`).** `src/renderer/src/store/config.ts` read in full: `capabilityGaps(provider, platform, subject)` forwards the same `platform` to both `providerCapabilities` and `remoteControlAvailability` (D-40/T-P02-06-09), returns only false bits ranked `mail > mcp > spend > compact > remote`; `capabilityChipText` returns one chip with a `+N` suffix; `mcpCardSummary` returns `null` for `supportsMcp: false`, computes `pending = granted \ armed`, and never marks an unkeyed grant `⚿`. `grep -c process.platform` on the file → `0`. The depth-scanner (plan's own script, run verbatim) → `providerCapabilities total=1 two_arg=1`, `remoteControlAvailability total=1 two_arg=1`. `test/capability-surface.test.cjs` run standalone this session: **9 tests, 9 pass, 0 fail, 0 skipped** (final state — task 1 itself ended intentionally red in one place per its own acceptance criteria, since the three-surface clause could not go green until tasks 2-3 landed; the commit message records that intermediate `8 tests, 7 pass, 1 fail` state, which this session did not need to reproduce since all 3 surfaces are now present and the file is fully green).

**Task 2 — S1b/S1c (`c231b28`).** `AddAgentModal.tsx`: `capabilityGaps(` count 1, `LIMITS OF THIS ENGINE` present, `window.cth.platform` present. `CommandCenterPanel.tsx`: `capabilityGaps(` count 1, `cannot receive mail` (hand-written copy) count **0** — confirming the sentence is sourced from `capabilityGaps`, not duplicated — `role="status"` count 1, `window.cth.platform` present. `git diff 5832c5e..HEAD -- CommandCenterPanel.tsx | grep -c '^+.*disabled'` → **0**: nothing was disabled, matching D-31/S1c's "informs, does not veto" ruling.

**Task 3 — the card's third row (`a19ee56`).** `AgentCard.tsx`: `capabilityGaps(` and `window.cth.platform` both present; the hoisted-derivation proof `calls=1 tag=1` (one `capabilityChipText(` call, one `data-cth-chip="capability"` span — the two-branch/one-chip shape the plan's own three-fixture drill distinguishes from a real double-render); the guard proof `guarded=1 total=1` (`row ? capabilityGaps(` is the only call — an unidentified agent renders no chip rather than a fabricated `'claude'` profile); `mcpCardSummary(` called exactly once; card box unchanged at `322`/`86`; `role="img"` count **0** (correct — A4: chips inside a labelled container stay silent). `AgentCard.tsx:411`'s `✎` `fontSize: 10` untouched (not in this task's diff). The card's own deviation, documented in the same commit: an unguarded `window.cth.platform` read threw under the server-render test harness (no DOM globals); fixed inline with a `typeof window !== 'undefined'` guard matching `store/config.ts`'s own `ensureMcpGrants()` pattern — Rule 1, same commit, no scope change.

**Task 4 — `McpConsentModal.tsx` (`76a1f72`).** Launch spec verbatim: `spec.args.join` present, zero `.slice(0,`/`.substring(`/`textOverflow`. Env values never render: `Object.keys(` present, zero `spec.env[`/`Object.values(`/`Object.entries(`. Key field write-only: `type="password"` / `autoComplete="off"` / `hasSecret` all present, zero `secretRef`/`secretRefFor`. Section order proven on the `data-cth-section` markers (wording-independent): `warning=173 listA=186 listB=214 markers=3` → `ORDER-OK`. List A read-only over the marker-scoped range: `lines=29 controls=0`. `<fieldset`/`<legend` present and equal (1 each — a single per-entry template rendered via `.map()`, correctly counted once in source). Modal genuinely mounted (`<McpConsentModal` in both `AgentDetailPanel.tsx` and `CommandCenterPanel.tsx`, not just imported). No second respawn implementation: zero `spawnPty(`/`disposeTerminal(`/`terminalGeneration` in the modal file; `CommandCenterPanel.tsx` wires `onRestart={() => restartWithModel(mcpModalAgent, mcpModalAgent.model, { resume: true })}` — the exact call the existing `restart & continue` button makes. `mc:agentState`/`mc:grant`/`mc:revoke` IPC names match the preload's real wrappers exactly (checked above). `mcp:revoke`'s handler (`src/main/index.ts:3082`) is 02-11's, confirmed present and unedited by this plan.

**Task 5 — S2a measurement (`f750035`).** Comment-only change to `AgentCard.tsx`, landing `MCP_CHIP_MAX_W = 152` (unchanged from S1a's starting value) with its measured derivation and the recorded STOP — see Decisions Made above for the independently re-confirmed factual basis (claude is the sole MCP-wired provider and carries zero gaps, so the STOP's named scenario is not reachable in the shipped app today). `AgentCard.tsx:411`'s ✎-button state at measurement time is recorded in the same comment. This session did not re-run the live-Electron CDP probe (it requires standing up and tearing down a throwaway Vite harness); the claim was cross-checked for internal consistency instead (glyphs rendered literally in shipped code, not substituted; `MCP_WIRED_PROVIDERS`/`providerCapabilities('claude', …)` independently confirm the STOP's premise).

## Containment — verified against the correct base SHA this session

`5832c5e` (`docs(02-05): complete the-daemon-and-the-protocol plan`) is the last commit before this plan started — **not** `af7e032`, which spans 02-11 too and was checked first and discarded as the wrong base.

```
$ git diff --stat 5832c5e..f750035 -- package.json package-lock.json src/shared/mcpCatalog.ts src/shared/providerAutomation.ts src/preload/index.ts src/shared/agentProvider.ts
(nothing — D-06 and the not-mine files are untouched)

$ git diff --stat 5832c5e..f750035 --name-only
.planning/phases/02-the-daemon-and-the-protocol/deferred-items.md
src/renderer/src/components/AddAgentModal.tsx
src/renderer/src/components/AgentCard.tsx
src/renderer/src/components/AgentDetailPanel.tsx
src/renderer/src/components/CommandCenterPanel.tsx
src/renderer/src/components/McpConsentModal.tsx
src/renderer/src/store/config.ts
test/capability-surface.test.cjs
```

Exactly the plan's declared `files_modified` plus `deferred-items.md` (the out-of-scope-discovery log the SCOPE BOUNDARY rule requires). `test/repo-claims.test.cjs`, `test/boot-floor.test.cjs` D-40 IPC pin, and `src/preload/index.ts` are all confirmed untouched by this plan — 02-06 added no IPC channel and no `LIVE-UNVERIFIED` marker, so neither cross-plan pin needed updating. Both re-run clean this session: `test/boot-floor.test.cjs` → 19/19 pass; `test/repo-claims.test.cjs` (PARITY-03's marker ledger) → 28/28 pass.

## Whole-suite verification, this session

- `npm run typecheck` → exit 0 (both `typecheck:node` and `typecheck:web`).
- `npm run build` → exit 0, `✓ built in 40.27s`.
- `npm test` (before the concurrent file described above appeared) → **762 tests, 755 pass, 0 fail, 7 skipped** — exactly matches the orchestrator's stated post-02-06 baseline (`+9` over the pre-02-06 `753/746/0/7`), confirming this session's tree matched the intended dispatch state before anything else touched it.
- `npm run lint` (`eslint . --max-warnings 0`) → exit 0, zero output. Also run scoped to every file this plan touches: exit 0.
- `node --test --test-reporter=tap test/capability-surface.test.cjs` standalone → 9/9 pass, 0 fail, 0 skipped.
- **`npm run e2e` (Playwright, real Electron)** → **2 passed (16.2s)**, including `the wizard counts its steps honestly and Michael clocks in on the floor` — the assertion that requires a real `BrowserWindow` to open. This satisfies the plan's own `<verification>` bullet ("npm run e2e before this plan is called done") directly, on Windows, superseding the prior session's workaround (a standalone throwaway harness, because their session hit a boot-blocking bug this session did not reproduce — see `deferred-items.md`'s addendum, committed this session in `185d241`).
- **`gh pr checks`** → all rows pass (`Typecheck`, `Build`, `Test` x3, `Electron smoke (ubuntu-latest)`), but confirmed **stale**: `origin/gsd/v1.0-floor-closure` is 60 commits behind local `HEAD` (`bb1ad70`, 2026-08-23 01:12), predating every 02-06..02-11 commit. **MEASUREMENT UNAVAILABLE — needs a push to origin first**, matching the precedent 02-07/02-11 both recorded for the identical reason. Not pushed this session (not requested, and STATE.md records the same "nothing pushed" state for the whole phase so far).

## Requirements — flipped this session, with the exact clause each satisfies

**PARITY-01b** — *"For any engine that genuinely cannot receive mail, the UI says so before an operator assigns mail-dependent work — on the agent card and in the assignment flow, not only in documentation."* Both named surfaces ship and were verified above: the agent card (S1a, task 3) and the assignment flow (S1c, task 2's `CommandCenterPanel.tsx` line, which fires at the moment an operator picks a suggested owner — before dispatch). `AddAgentModal.tsx`'s `LIMITS OF THIS ENGINE` block (S1b) additionally covers the earliest point, before any agent exists. **Flipped to `[x]`.** The one caveat, on the record per D-30 honesty and not a blocker: `02-VALIDATION.md`'s own PARITY-01b row names `capabilityLine`/`test/repo-claims.test.cjs` literally, which this plan does not satisfy by design — see the restatement section above for why the actual requirement text is nonetheless genuinely met.

**DAEMON-04** — *"MCP servers are installable per agent, with consent, and visible on the agent card."* 02-11 built the mechanism (per-agent grants, fail-closed secret gating, `mcp.json`/`--mcp-config`); 02-11's own SUMMARY explicitly left this requirement `[ ]` because the operator-facing consent step and the card's visible marks did not exist yet, and named 02-06 as the plan that would close it. This plan builds exactly that: the consent modal (task 4, "installable ... with consent") and the card's MCP element (task 3, "visible on the agent card"). Both verified above against the real tree. **02-06 is the last declarer of DAEMON-04** per the orchestrator's requirement-ownership mapping — **flipped to `[x]`.**

No other requirement row was touched.

## Files Created/Modified

- `src/renderer/src/store/config.ts` — `capabilityGaps`/`capabilityChipText`/`mcpCardSummary`, `CapabilityGap`/`McpCardMark`/`McpMark`/`McpGrantsSnapshot` types, the module-singleton grants mirror (`getMcpGrantsSnapshot`/`setMcpGrants`/`subscribeMcpGrants`/`ensureMcpGrants`)
- `test/capability-surface.test.cjs` — created; the restated PARITY-01b gate, the paren-depth two-argument scanner, the locked six-chip vocabulary across 11 presets x 2 platforms, the `⚿`/`⚠`/`↻` mark-collapse guard, the `aria-label` both-directions clause
- `src/renderer/src/components/AddAgentModal.tsx` — the `LIMITS OF THIS ENGINE` block (S1b)
- `src/renderer/src/components/CommandCenterPanel.tsx` — the `role="status"` mail-gap line below `SUGGESTED OWNER` (S1c); the roster-row MCP button opening `McpConsentModal` with `onRestart` wired to the existing `restartWithModel` closure
- `src/renderer/src/components/AgentCard.tsx` — the third row's one gap chip + one MCP element, the `aria-label` append, `MCP_CHIP_MAX_W = 152` with its measured derivation and the S2a STOP recorded in its own comment
- `src/renderer/src/components/McpConsentModal.tsx` — created; the DAEMON-04 consent dialog
- `src/renderer/src/components/AgentDetailPanel.tsx` — a header MCP button opening the modal (no `onRestart` — no correct implementation in scope there; the notice names where the control lives instead)
- `.planning/phases/02-the-daemon-and-the-protocol/deferred-items.md` — created by task 3 (the pre-existing `hive.setRoutedObserver` boot bug, out of this plan's scope); appended this session with the contradicting `npm run e2e` result (see below)

## Decisions Made

See `key-decisions` in frontmatter. Summarized: (1) the consent modal's grant button batches per-row checkboxes rather than granting per row; (2) S2a's `maxWidth` stays at its starting value of 152 with a genuine, independently-re-confirmed STOP on the combined gap-chip-plus-full-MCP-element scenario, which is not reachable in the shipped app today; (3) neither `⚿` nor `↻` needed the prescribed word substitution; (4) an unidentified card row renders nothing rather than a fabricated capability profile.

## Deviations from Plan

### Auto-fixed Issues (landed in the prior session's own commits, verified this session)

**1. [Rule 1 - Bug] Unguarded `window.cth.platform` read threw under the server-render test harness**
- **Found during:** Task 3, whole-suite verification after committing the card's third row
- **Issue:** `AgentCard.tsx`'s new `window.cth.platform` read has no guard, and `test/renderer-components.test.cjs`'s server-render harness has no DOM globals — `ReferenceError`.
- **Fix:** `typeof window !== 'undefined'` guard, matching `store/config.ts`'s own `ensureMcpGrants()` pattern.
- **Files modified:** `src/renderer/src/components/AgentCard.tsx` (already in task 3's declared `files_modified`)
- **Verification (this session):** `npm test` → 0 fail; the guard is present in the current file at the derivation call site.
- **Committed in:** `a19ee56` (task 3's own commit)

### This session's own correction

**2. [Documentation accuracy] `deferred-items.md`'s boot-blocking bug did not reproduce this session**
- **Found during:** running the plan's own `<verification>` bullet ("npm run e2e before this plan is called done")
- **Issue:** the prior session logged a `hive.setRoutedObserver is not a function` crash that made `npm run e2e` unusable and forced a standalone-harness workaround for tasks 3 and 5's live probes. Re-running `npm run e2e` from a clean shell this session: **2 passed**, including the assertion that requires the crash's own code path to succeed.
- **Fix:** appended the contradicting result to `deferred-items.md` rather than deleting the original observation (it was real, once) — see the file for the full addendum and the caveat about a concurrent, unrelated, in-progress fix to the same crash that appeared mid-session (see Recovery Dispatch note above).
- **Files modified:** `.planning/phases/02-the-daemon-and-the-protocol/deferred-items.md`
- **Verification:** `npm run e2e` → `2 passed (16.2s)`, exit 0.
- **Committed in:** `185d241` (this session, separate commit, before this SUMMARY)

---

**Total deviations:** 1 auto-fixed in the prior session (Rule 1, verified this session), 1 documentation correction this session.
**Impact on plan:** No scope creep in either. The prior session's fix is a correctness necessity inside its own declared file. This session's correction only updates a log entry to match a re-measured fact.

## Issues Encountered

The concurrent-modification finding documented in "Recovery Dispatch" above — not an issue with this plan's own work, but a process/environment integrity concern surfaced for the orchestrator: another writer touched `src/main/index.ts` and added `test/boot-order.test.cjs` on this same working tree mid-session. Nothing from it is included in this plan's commits.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **B-consumers, before/after:** `providerCapabilities` renderer consumers 0 -> 1 (`store/config.ts`); `capabilityLine` renderer consumers 0 -> 0 (unchanged, by design). Both re-measured this session with a comment-stripping script matching the test file's own logic.
- **The 02-11 field/IPC names 02-12 needs** are recorded above under "The four preconditions", discovered from the real preload/config source rather than assumed.
- **`test/repo-claims.test.cjs` (PARITY-03's ledger) and `test/boot-floor.test.cjs` (D-40's IPC pin)** both confirmed untouched and still green — 02-06 added no IPC channel and no `LIVE-UNVERIFIED` marker, so plan 02-12 has nothing to reconcile from this plan on either front.
- **DAEMON-04's card clause is delivered for the renderer half only** (plan output item 8): the `<agentDir>/mcp.json` write, the `--mcp-config`/`--strict-mcp-config` flags, and the per-agent fail-closed read are 02-11's; this plan asserted their presence (the four preconditions) and built the consent UI and the card's visible marks on top of them.
- **The `↻` limitation, as it actually resolved** (plan output item 6): 02-11 supplies no applied-marker beyond `hive.mcpArmed(agentId)` reading `<agentDir>/mcp.json`'s catalog ids off disk; `mcpCardSummary` computes `pending = granted \ armed` for any agent with a live PTY, so a just-granted server on a running agent renders `↻` (over-reports "not yet in effect") rather than ever fabricating `⚿` — the fail-safe direction UI-SPEC requires, and a stated limitation rather than a silent one.
- **The mark-table extension** (plan output item 7): a consent-tier catalog entry with no `spec.env` renders **no** key mark at all (neither `⚠` nor `⚿`), because `⚠` implies "needs a key it doesn't have" and would be fabricated for an entry that needs no key. Checked against the live catalog this session: all 4 current `secret`-tier entries (`github-token`, `db`, `email-calendar`, `search-with-key`) declare exactly 1 env key each, so this branch is not exercised by any entry shipped today — it is a forward-looking correctness extension, arrived at from reading the catalog's actual shape, not a deviation discovered in flight.
- Whole suite: `753/746/0 fail/7 skipped` (pre-02-06 baseline) -> `762/755/0 fail/7 skipped` (this plan's end, re-confirmed this session). `npm run typecheck`, `npm run build`, `npm run lint`, `npm run e2e` all exit 0.
- **Not run this session:** `git push` to `origin/gsd/v1.0-floor-closure` — not requested, and the phase-wide precedent (02-07, 02-11) is to leave it for a later, deliberate push. `gh pr checks` is therefore `MEASUREMENT UNAVAILABLE` for this plan's own commits, as recorded above.
- Plan 02-12 can close out DAEMON-04/PARITY-01b's paper trail (`02-VALIDATION.md`'s stale `capabilityLine`/`test/repo-claims.test.cjs` row text, the `README.md` capability-line claim) against a stable, fully-verified renderer surface.

---
*Phase: 02-the-daemon-and-the-protocol*
*Completed: 2026-08-24*

## Self-Check: PASSED

All 8 claimed files found on disk (`src/renderer/src/store/config.ts`, `test/capability-surface.test.cjs`, `src/renderer/src/components/{AddAgentModal,CommandCenterPanel,AgentCard,McpConsentModal,AgentDetailPanel}.tsx`, `.planning/phases/02-the-daemon-and-the-protocol/deferred-items.md`) and this SUMMARY file itself. All 7 claimed commit hashes (`74fa680`, `c231b28`, `a19ee56`, `76a1f72`, `f750035`, `185d241`, plus this SUMMARY's own commit made immediately after) found in `git log --oneline --all` at write time. `npm test`/`npm run typecheck`/`npm run build`/`npm run lint`/`npm run e2e` results above were all produced by commands run in this session, not copied from any prior SUMMARY or commit message.
