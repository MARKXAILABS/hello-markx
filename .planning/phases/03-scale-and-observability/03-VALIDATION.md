---
phase: 3
slug: scale-and-observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-24
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `03-RESEARCH.md` §"Validation Architecture" (line 1091).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node's built-in `node --test` — **no** Jest/Vitest/Mocha. `test/load-ts.cjs` transpiles TypeScript on demand and stubs Electron. |
| **Config file** | none — behavior lives entirely in `package.json` `scripts`. **`package.json` must not be modified this phase** (D-37). |
| **Quick run command** | `node --test test/<the specific file(s) this task touches>.test.cjs` |
| **Full suite command** | `npm test` (= `node --test test/*.test.cjs`) |
| **Estimated runtime** | ~22s full suite (measured this session: 21.7s) |
| **Measured baseline** | **830 tests / 823 pass / 0 fail / 7 skipped** — re-measured 2026-08-25 on the tree AFTER merging `origin/main` (PR #80, Phase 2). The earlier figure of 800/793/0/7 at `f04f9ec` is superseded: PR #80 added 23 tests. Re-measure again before Wave 0 if further commits land on main. |

**Baseline rule:** 0 failures is the standing bar. Any red test is a real regression, never an
expected cost of the change. The skip count may not rise above 7 without an explicit, named reason.

---

## Sampling Rate

- **After every task commit:** run that task's specific test file(s)
- **After every plan wave:** run `npm test` (full suite)
- **Before `/gsd:verify-work`:** full suite green — 0 fail, skips ≤ 7
- **Max feedback latency:** ~22 seconds (full suite); a few seconds for a single file

---

## Per-Requirement Verification Map

Task IDs are filled in after the planner runs; the requirement → test mapping below is fixed now so
the planner must attach every task to a row.

| Req | Behavior | Test Type | Automated Command | File Status |
|-----|----------|-----------|-------------------|-------------|
| SCALE-01 | `PersistStore` + `KnowledgeManager` default under `harnessHome`; a note indexed under home A is returned for home A (**positive lower bound, hits >= 1**) and returns 0 against home B | integration (real SQLite, real tmpdir) | `node --test test/db-fts.test.cjs` (extend) or new `test/db-repoint.test.cjs` | Extend ✅ / ❌ W0 for the repoint case |
| SCALE-01 | `repoint()` fires at the one non-relaunching `harnessHome: null→set` transition; **both** live handles (`floor/boot.ts:1148`, `config.ts:684`) repoint together | integration | same file as above | ❌ W0 |
| SCALE-01 | Task-ledger isolation is free by construction (`hive.root()` already lazy) — **no new code, therefore no new test** | existing | `node --test test/hive-runtime-path.test.cjs test/hive-cwd.test.cjs` | ✅ existing |
| SCALE-02 | `readHireManifestFile` branches on raw `spec` **before** `validateHireManifest` (which hard-rejects non-`hire@1` today) | unit | `test/hire-manifest.test.cjs` (new) | ❌ W0 |
| SCALE-02 | IPC name pin moves 159→160 with `team:export`; `B_IPC_JOINED` **and** sorted `B_IPC_NAMES` edited in the same commit (D-17) | structural pin | `node --test test/boot-floor.test.cjs` | Extend ✅ |
| SCALE-02 | Export stripper drops all 7 security/portability fields — **`slimAgents()` alone is insufficient** (see Correction below) | unit | `test/hire-manifest.test.cjs` | ❌ W0 |
| SCALE-02 | Bulk-spawn loop preserves concurrency, original roster order, and per-agent failure isolation | unit/integration | new renderer-logic test via `test/load-ts.cjs` | ❌ W0 |
| SCALE-03 | `events` lands as `MIGRATIONS[2]`; schema read back through a **second independent handle** | integration (real SQLite) | `node --test test/db-fts.test.cjs` (extend) | Extend ✅ |
| SCALE-03 | Cost lane uses `applyCostRow`'s clamped consecutive diff, **never SUM** — fixture includes a mid-day `session_id` rollover (D-22) | unit | extend `test/hive-protocol-v2.test.cjs` — **corrected here** (round-3 finding #15): this repo's cost-arithmetic test style lives in that file (`#34 — per-card cost attribution`), not in `hive-durability.test.cjs`, which this row previously named. 03-03 relied on that correction while owning no edit to this file; this file's owner makes it. | ❌ W0 |
| SCALE-03 | Synthetic driver pushes `log.jsonl` past the **64 KB `LOG_TAIL_BYTES`** cap, then the events table still returns the earliest hour (**rows >= 1**) while `logTail()` no longer sees that same early data (**restated, round-3 finding #13** — the row previously required driving past `LOG_ROTATE_BYTES` so `log.jsonl.1` is renamed over. No plan does that: 03-03 Task 2's driver is explicitly scoped to `LOG_TAIL_BYTES`, and the claim SCALE-03 makes is "SQL answers a time range the tail read cannot", which the 64 KB cap already proves. Rotation-boundary behaviour is **not** a Phase-3 verification.) | integration | new | ❌ W0 |
| SCALE-03 | Day-band range input renders `min`/`max`/`step`/`aria-label`/`aria-valuetext` in first-pass static markup | renderer component | `node --test test/renderer-components.test.cjs` (extend) | Extend ✅ |
| SCALE-03 | Gap marker renders the real truncated count rather than silently slicing (D-27) | renderer component | same | Extend ✅ |
| SCALE-04 | `msUntilNextLocalHour` pure fn: before / after / exactly-at / next-day / **DST transition**, against a fixed injected clock | unit | new digest-scheduler test | ❌ W0 |
| SCALE-04 | Digest timer appears in `SHUTDOWN_STEPS` — a missing entry **hangs** `boot-floor` rather than failing red | structural + integration | `node --test test/boot-floor.test.cjs` (the existing "every subsystem bootFloor started appears in the shutdown list" test covers this once the timer is registered) | ✅ existing |
| SCALE-04 | `postSlackDigest` requires an explicit channel and refuses a blank one; token is never logged | unit | `node --test test/slack.test.cjs` (extend) | Extend ✅ |
| SCALE-04 | `postSlackDigest` has **at least one production call site** under `src/main/` (`count >= 1`) — the anti-`push.ts` pin (D-38), written as a call-site count that SUBTRACTS the declaration so the function's own `export function postSlackDigest(` cannot satisfy it (round-3 finding #34) | repo-fact | `node --test test/repo-claims.test.cjs` (extend) — **plus the existence half** (round-3 finding #12): `test/repo-claims.test.cjs` is green today, before any work, so the test run alone can never go red if the pin is never written. `grep -c "postSlackDigest" test/repo-claims.test.cjs` must be `>= 1` (measured `0` this session) and `grep -c "function postSlackDigest" test/repo-claims.test.cjs` must be `>= 1` (the subtrahend, also `0` today). Both live in 03-05 Task 3's acceptance criteria. | Extend ✅ |
| SCALE-04 | Digest content never phrases current board counts as per-day completions (no `doneAt` exists) | unit | new/extended digest-content test | ❌ W0 |
| SCALE-04 | The digest's spend total carries **TWO independently-gated** capability-gap sentences — `no cost meter` for `costTracking:'none'` and, separately, `never reaches the cost ledger` for `costTracking:'transcript'`. The load-bearing case is `costGapNone: 0, costGapTranscript: 1` (a codex-only floor): the second sentence still renders. Measured this session in `src/shared/agentProvider.ts`: 7 presets are `'none'`, 1 (`codex`, `:257`) is `'transcript'`, so **8 of 11 engines never reach `cost-ledger.jsonl`** — the digest's own source — and counting only `'none'` would leave the transcript tier a silent zero | unit | new digest-scheduler test (03-05 Task 1) | ❌ W0 |
| SCALE-05 | `agentView.ts` derivation is fed a fixture and the derived row asserted — **not** a literal `usd` prop | unit | `node --test test/renderer-runstate.test.cjs` (extend) | Extend ✅ |
| SCALE-05 | ONE context threshold pair — the 85/65 and 88/75 drift is gone; each rendering calls the selector (`count >= 1` per rendering) | unit + repo-fact | same, plus `test/repo-claims.test.cjs` — **with the existence half** (round-3 finding #12): that file is green before any work, so `grep -c "deriveContextColor" test/repo-claims.test.cjs` must be `>= 1` (measured `0` this session). Lives in 03-08 Task 2's acceptance criteria alongside the negative pins `grep -c "cpct >= 88" CommandCenterPanel.tsx` == `0` (measured `1` today) and `grep -c "progress >= 7 ? 'var(--cth-coral)'" AgentCard.tsx` == `0` (measured `1` today). | Extend ✅ |
| SCALE-05 | `control:breakerSnapshot` returns current per-agent levels on demand | unit/integration | `node --test test/breaker.test.cjs` or `test/boot-floor.test.cjs` | Extend ✅ |
| SCALE-05 | ~~Transcript-tier spend reaches `cost-ledger.jsonl`~~ — **RETIRED as a Phase-3 verification (round-3 finding #13).** Widening the ledger to transcript-tier engines was DESCOPED: `floor/boot.ts`'s `if (sample?.sessionId) hive.appendCostLedger(sample)` append gate stays byte-unchanged, and `applyCostRow`'s DIFF LOGIC is unchanged (03-03 relocates the function out of `private` and widens its return channel, so it is the arithmetic — not the signature — that is pinned; round-7 finding #9), and only the DISPLAY join changed (03-02 carries positive assertions pinning both). Nothing in Phase 3 makes this behaviour true, so requiring it here would report the contract satisfied for work no plan does. It is the **declared Accepted Residual owned by PARITY-02** (D-03: 7 of 11 engines are `costTracking:'none'`; plan 02-12 owns the `REQUIREMENTS.md:145`/`:452` restatement, and **Phase 3 must not edit those two lines**). What Phase 3 verifies instead is the row below. | — | none — retired, not deferred | n/a |
| SCALE-05 | Transcript-tier spend that DOES reach the ledger is displayed as a lifetime total, never as this session's spend: `deriveCost` returns `{kind:'measured', usd, lifetime:true}` for a `costLifetime` sample and the card renders a distinct qualifier — and ADR-0005's cumulative contract is honoured by diffing through `applyCostRow`, **never `SUM`** | unit | `node --test test/renderer-runstate.test.cjs test/renderer-components.test.cjs` | Extend ✅ |
| SCALE-05 | The `context` cell renders a declared gap (`not reported`, never `0%`) when `contextTokens` or `contextLimit` is absent — `deriveContext`'s `{kind:'unmeasured'}` branch (UI-SPEC §S2b:694) | renderer component | `node --test test/renderer-components.test.cjs` (extend) | ❌ W0 |
| SCALE-05 | Cost renders a declared gap, never `$0.00`, for a `costTracking:'none'` engine | renderer component | `node --test test/renderer-components.test.cjs` (extend) | Extend ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/hire-manifest.test.cjs` — team@1 spec-branching, per-member validation delegation, the
      export stripper's 7 fields, and the byte-cap decision (Open Question 1)
- [ ] A digest-scheduler test file — `msUntilNextLocalHour` cases + the three-arm dispatch, plus the
      FOUR `buildDigestContent` gap cases (`none` only / `transcript` only / both / neither). The
      `costGapNone: 0, costGapTranscript: 1` case is the non-optional one: it is the codex-only floor,
      and it is the case a single merged count fails. Both sentences measure `0` in
      `src/main/floor/boot.ts` today (`grep -cF "no cost meter"` → `0`, `grep -cF "never reaches the
      cost ledger"` → `0`, this session), so both are genuinely red-first.
- [ ] A bulk-spawn-from-team test — the extracted loop against `HireManifest[]`
- [ ] A cost-lane diffing test with a mid-day session rollover fixture (D-22) — **confirm whether the
      existing `applyCostRow` tests already cover the general case before writing a new fixture**
- [ ] A SCALE-01 two-home leak test — positive control first (`hits >= 1` for home A), then the
      negative (0 for home B)
- [ ] The consolidated card's two DECLARED-GAP renderer cases in `test/renderer-components.test.cjs`
      — `not reported` for an absent `contextTokens`/`contextLimit` (round-3 finding #27, the ❌ W0
      row added to the map above) and `no cost meter` (never `$0.00`) for a `costTracking:'none'`
      engine. Both strings measure `0` in `AgentDetailPanel.tsx` today, so both are real red-first
      cases, not restatements of coverage that already exists.
- [ ] A `deriveContext` declared-gap case in `test/renderer-components.test.cjs` — `not reported`
      (never `0%`) when `contextTokens` or `contextLimit` is absent (round-3 finding #27; the row was
      missing from this map entirely, so the one field of the five with no gap branch had no gate)
- [ ] Framework install: **none** — `node --test` is already wired; no new runner, no `package.json` edit

---

## Accepted Residuals (recorded, never silently dropped)

| Residual | Owner | Why it is not a Phase-3 verification |
|---|---|---|
| **Transcript-tier spend reaching `cost-ledger.jsonl`** — **8 of 11** engines never write a ledger row (the SEVEN `costTracking:'none'` presets plus the ONE `'transcript'` preset, `codex`, whose transcript-fallback sample carries `sessionId: ''` and so never passes `boot.ts:429`'s append gate — all re-measured this session in `src/shared/agentProvider.ts` and `src/main/telemetry.ts:636`), so a "total spend" figure is a partial figure on every surface that shows one | **PARITY-02** (D-03; plan 02-12 owns the `REQUIREMENTS.md:145`/`:452` restatement — **Phase 3 must not edit those two lines**) | The ledger widening was DESCOPED in this revision round: `floor/boot.ts`'s `if (sample?.sessionId) hive.appendCostLedger(sample)` append gate stays byte-unchanged, and `applyCostRow`'s DIFF LOGIC is unchanged (03-03 relocates the function out of `private` and widens its return channel, so it is the arithmetic — not the signature — that is pinned; round-7 finding #9) (03-02 carries positive assertions pinning both), and only the DISPLAY join changed. Phase 3 instead makes the gap VISIBLE everywhere a total is shown, in **both tiers** on every surface: the consolidated card's `no cost meter` cell and its `lifetime` qualifier (03-08), the day band's two cost-track declarations (03-07), and the digest's two sentences — `{n} agent(s) report no cost meter; their spend is not in this total.` and `{n} agent(s) report spend only from their own transcripts — that spend never reaches the cost ledger this total is drawn from.` (03-05). A surface that declares only the `'none'` tier still renders the transcript tier as the silent zero D-35 forbids; that is why each sentence is gated on its own count. |
| **`log.jsonl.1` rotation-boundary behaviour** | a later phase, if it is ever needed | No plan drives past `LOG_ROTATE_BYTES`; 03-03's driver is scoped to the 64 KB `LOG_TAIL_BYTES` cap, which is what SCALE-03's actual claim ("SQL answers a time range the tail read cannot") turns on. Requiring the rotation case here would mark the contract satisfied for work no plan does. |
| **The god's non-coverage by the consolidated card** | 03-08's own SUMMARY (stated, not implied) | UI-SPEC §S2d: mounting the card above `CommandCenterPanel`'s tab strip costs ~62px of the docked rail. `CommandCenterPanel`'s floor tab already shows cost/context/breaker per roster row, but neither duration nor account. |
| **This file itself is not in any plan's `files_modified`** — so nothing in Phase 3 flips `status: draft` → final or `nyquist_compliant: false` → `true`, and the Validation Sign-Off checklist below has no owner (round-3 finding #15's second half; #13's own fix text assumed "the 03-09 task that de-drafts 03-VALIDATION.md", and 03-09's `files_modified` is `REQUIREMENTS.md`/`ROADMAP.md`/`STATE.md` only — verified this session) | **the phase's closing step**, not a plan | Adding this file to a plan's `files_modified` in this revision round would create a cross-plan ownership collision while nine plans are being revised concurrently, for a frontmatter flip that must happen AFTER every plan lands anyway. Recorded here rather than silently left as a checklist nobody runs. The standing constraint applies: a phase must not close with `nyquist_compliant: false` still in its own frontmatter, so whoever closes the phase owns this flip and the sign-off boxes below. |

---

## Manual-Only Verifications

| Behavior | Req | Why Manual | Test Instructions |
|---|---|---|---|
| Moving the scrubber changes the detail list | SCALE-03 | `renderToStaticMarkup` runs no effects and fires no events — first-render assertions are the harness ceiling | Open the day band in the dev app, step the range input with arrow keys, confirm the detail list re-renders for the new bucket |
| A `chat.postMessage` to a channel root actually succeeds | SCALE-04 | Needs a real bot token with `chat:write` in a live workspace; nothing in the repo fakes slack.com | Configure a token + digest channel, trigger the digest, observe the post. **SCALE-04 cannot be marked green without one real observed post.** |
| An Electron `Notification` surfaces with no window open | SCALE-04 | Requires launching packaged with `--headless` and watching the Action Center | Enable **`OPEN AT LOGIN`** — the app's real control, `OnboardingWizard.tsx:683`, reachable only during onboarding; there is no "Start at login" toggle anywhere in this app (round-1 #35 / round-3 #38) — then close all windows and wait for the digest hour |
| The consolidated card's width behaviour at **`sidebarWidth` 320 / 420 / 900** | SCALE-05 | Needs live Electron measurement; the recorded failure at `AgentCard.tsx:222` was a dropped field, not truncation. **The probe widths are `sidebarWidth`, not viewport widths** (round-3 finding #29): `AgentDetailPanel` renders inside the sidebar container, whose width is `sidebarWidth` (`App.tsx:662`, `:670`), clamped to `[320, 1200]` with a `420` default (`store.ts:653-659`, `:960-964`) and independent of the viewport — so 1280/1024/800 would measure one container width three times and could not fail. | Drag the splitter to each width, read it back from `localStorage['cth.sidebarWidth']`, and record the observed column count at each stop; run the identical probe at base sha and head sha per 03-UI-SPEC.md:327-335, with a positive control (element found + mounted) at every stop |

---

## Correction carried from research

`03-CONTEXT.md` D-15 describes export as "a field pick" reading the same `PersistedAgent` records
`slimAgents` already writes. Research refined this: **`slimAgents()` is insufficient as the export
stripper** — it drops only 6 ephemeral UI fields, not the 7 security/portability fields D-16 requires
(`cwd`, `account`, `accountPolicy`, `worktreePath`, `ptyId`, raw `command`, `commandFlags`). The
export path needs its own explicit stripper. D-16's field list stands; the *mechanism* named in D-15
does not. Plans must not reuse `slimAgents()` alone.

**Open questions — all three DECIDED by the plans; recorded here so no executor re-opens them:**
1. ~~Byte cap for `team@1`~~ — **decided in 03-04:** a separate `TEAM_MAX_BYTES = 256 * 1024`, not a
   reuse of `HIRE_MAX_BYTES`. The pre-parse `statSync` gate reads the LARGER cap (the spec tag is not
   knowable before the parse); the non-team branch then re-applies `HIRE_MAX_BYTES` explicitly, so
   adding the team branch does not silently raise the single-manifest ceiling from 64 KB to 256 KB.
2. ~~Where timeline bucket aggregation lives~~ — **decided in 03-03:** main, in a plain module
   `test/timeline.test.cjs` can load and call directly (research's recommendation, taken).
3. ~~UI location for the `team:export` button~~ — **decided in 03-04 Task 3 / UI-SPEC §S3b:**
   `AddAgentModal`'s footer, immediately left of the existing import button, with the lossiness
   sentence beneath the row.

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all ❌ references above
- [ ] No watch-mode flags
- [ ] Every repo-fact assertion carries a positive lower bound (`count >= 1`) alongside its negative
- [ ] Every plan-mandated regression pin has a criterion that fails when the pin is ABSENT — never
      only a run of a test file that is already green before the work starts (round-3 finding #12).
      The cheapest non-vacuous form is a `grep -c` for the pin's own subject inside the test file it
      is supposed to land in, with the measured `0` baseline stated beside it.
- [ ] No criterion is scoped by `git show ... HEAD` or a bare `$BASE..HEAD` range while
      `use_worktrees: false` and a sibling shares the wave — a concurrent sibling's commits land in
      that range and make the criterion pass or fail for the wrong reason. The correct form is the
      plan-id-scoped `git log --oneline --grep="03-0N" -- <path> | wc -l`, with a positive half
      (`>= 1` over a path the plan DOES own) beside the negative (`== 0` over the sibling's path).
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
