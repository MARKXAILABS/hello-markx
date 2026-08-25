---
phase: 02-the-daemon-and-the-protocol
plan: 12
subsystem: honesty-ledger
tags: [docs, testing, security-docs, requirements, roadmap, tunnel, phone]
dependency-graph:
  requires: ["02-01", "02-02", "02-03", "02-04", "02-05", "02-06", "02-07", "02-08", "02-09", "02-10", "02-11"]
  provides: ["PARITY-03 (marker ledger, per-engine and file-set pinned)", "corrected README/SECURITY/TESTING/CONCERNS/ROADMAP/REQUIREMENTS text", "fresh-install tunnel fix"]
  affects: ["test/repo-claims.test.cjs", "README.md", "SECURITY.md", ".planning/codebase/TESTING.md", ".planning/codebase/CONCERNS.md", ".planning/ROADMAP.md", ".planning/REQUIREMENTS.md", "src/main/index.ts"]
tech-stack:
  added: []
  patterns: ["readRaw beside readStripped for a marker clause", "structural comment-block attribution (never char-count)", "file-wide correction convention (**corrected/restated DATE (D-id): …**)"]
key-files:
  created: []
  modified:
    - src/shared/agentProvider.ts
    - test/repo-claims.test.cjs
    - test/main-hardening.test.cjs
    - HIVE.md
    - README.md
    - SECURITY.md
    - .planning/codebase/TESTING.md
    - .planning/codebase/CONCERNS.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - src/main/index.ts
    - test/webhook-endpoints.test.cjs
decisions:
  - "Fixed qwen's missing LIVE-UNVERIFIED marker as a Rule 1/2 auto-fix before pinning the per-engine ledger, since the ledger's own positive lower bound would otherwise be unsatisfiable by correct code"
  - "Fixed the fresh-install tunnel:start/phone:pairing deadlock (handed over from 02-10) rather than only documenting it — root cause was precisely traceable and the fix is small, localized, and does not violate the tunnel's off-by-default/no-side-effect invariant"
  - "10 correction markers in ROADMAP.md, not the plan's anticipated 6 — verified structurally required to satisfy every one of the plan's own per-claim UNMARKED checks"
  - "Re-measured god-file figures this session (4,967/2,822/160) rather than using the plan's own 2026-08-21 interfaces pointer (5,812/4,121/153), which nine further waves had already moved past"
  - "Self-caught and fixed a tracked-engine-count arithmetic error (six/five instead of the correct four/seven) that had been written identically into README.md, ROADMAP.md and REQUIREMENTS.md"
metrics:
  duration: "~4h"
  files_changed: 12
  commits: 12
  completed: 2026-08-24
---

# Phase 2 Plan 12: The Honesty Ledger Summary

**One-liner:** Re-measured every claim Phase 2 touched against the tree at wave 9's end — pinned PARITY-03's marker ledger per-engine and by file set, corrected six false claims across five docs plus the phase's own ROADMAP/REQUIREMENTS acceptance surface, and fixed (not just documented) the fresh-install tunnel deadlock handed over from 02-10.

## What Shipped

Twelve commits, in order:

1. `02779b9` — **fix**: qwen had zero `LIVE-UNVERIFIED` markers despite being exactly as unverified as pi/opencode/crush. Added one, in `src/shared/agentProvider.ts`.
2. `be1dbfb` — **test (task 1)**: PARITY-03's marker ledger, rewritten with a `readRaw` helper, a committed `LIVE_UNVERIFIED_TOTAL`, per-engine structural attribution, and a committed file-set `deepEqual`. Driven RED four ways.
3. `ba52b98` — **docs (task 2)**: `test/main-hardening.test.cjs`'s header corrected (module-scope side effects, not the `electron` import); `HIVE.md` §2's one-gate sentence corrected (`docs/message-queue.md` was already fixed by Phase 1's 01-23). One `repo-claims.test.cjs` clause across all three copies, driven RED three ways.
4. `a6ab089` — **docs (task 3)**: README's engine table re-derived from source (kimi off `NO MAIL`, a new `NO MCP` row), PARITY-02 restated, the marker paragraph updated, the 800px caveat added. One clause, driven RED three ways. **Fix folded in**: a pre-existing landmine in `stripComments()` (a literal `/*` inside a `//` comment in `agentProvider.ts:511`) was silently swallowing ~7000 chars of source on every `readStripped()` call against that file — found because it made copilot/custom's preset unreadable.
5. `7811ca2` — **docs (task 4)**: `SECURITY.md`'s network-surface table re-derived by symbol grep; tunnel section corrected to cloudflared; the tunnel-close limitation replaced (now closeable, `hardKillTree`); three new exposures named (global lockout, self-identifying `/phone/` shell, Discord's buffer-before-verify inversion). One clause, driven RED three ways.
6. `ff94b4e` — **docs (task 5)**: `TESTING.md` and `CONCERNS.md` re-measured — 73 test files, 863 cases, 803 TAP tests at that point; the engine-bridge Fragile Areas entry re-derived; six Phase 2 limitations added as tracked concerns. No repo-fact clause (deliberately — `.planning/**` is not source).
7. `d1c38cf` — **docs (task 6)**: `.planning/ROADMAP.md`'s Phase 2 section — six disproved claims corrected in place, each marked with date + D-id, no checkbox moved.
8. `abee3e4` — **docs (task 7)**: `.planning/REQUIREMENTS.md`'s PARITY-02 restated in the requirement itself, checkbox/status left exactly as found (already `[x]`/Complete from an earlier plan).
9. `a332ac4` — **fix**: the fresh-install `tunnel:start`/`phone:pairing` deadlock handed over from 02-10, root-caused and fixed.
10. `6d0003e` — **fix**: a self-caught arithmetic error (tracked-engine count) corrected across README/ROADMAP/REQUIREMENTS.
11–12. STATE.md and this SUMMARY (state-update commits, not task commits).

## Both Preconditions (Task 1)

**Precondition A** — 01-23 landed: `git log --oneline -- .planning/codebase/TESTING.md .planning/codebase/CONCERNS.md test/repo-claims.test.cjs` shows commits `74b3d05`/`503f856` (01-23's own commits) in the tree's history, and `.planning/phases/01-finish-the-floor/01-23-SUMMARY.md` exists. **One deviation from the plan's literal command, recorded rather than silently worked around**: this project runs the whole milestone on one long-lived branch (`gsd/v1.0-floor-closure`) rather than merging each phase to `main` immediately — a PR (#78) already merged an earlier slice of this branch to `main`, and Phase 1's later plans (including 01-23) plus all of Phase 2 landed on this branch afterward, not yet merged again. `git log --oneline main -- <files>` therefore shows nothing; `git merge-base --is-ancestor 74b3d05 HEAD` returns true. Interpreted "on main" as "landed in the branch history that will become main," consistent with how every other Phase 2 plan operated on this same branch — not a fabrication, a documented interpretation of an ambiguous literal command against this project's actual branching model.

**Precondition B** — every wave landed: `ls .planning/phases/02-the-daemon-and-the-protocol/02-*-SUMMARY.md` lists 03 through 11, all present, confirmed before any edit.

## The Marker Ledger (PARITY-03)

**B-sha** (recorded before any edit): `f04f9ecc6e744b47b5e91592b6a01f9bd2d27b2c`.

**B-markers-by-file, measured this session before the qwen fix:**
```
src/main/hive.ts:3
src/main/hiveProvisioning.ts:5
src/main/hiveTemplates.ts:3
src/main/index.ts:1
src/main/webhook.ts:3
src/shared/agentProvider.ts:2
```
**B-markers-total: 17.**

**The chain of prior measurements, reconciled, not assumed:**
- 02-01 (commit `90a6cc9`, phase start): `B-markers = 8` (`hive.ts`:6, `hiveTemplates.ts`:2).
- 02-07: found `C-markers = 9` (reconciled the +1 to plan 02-03's `index.ts:4508` addition, outside 02-01's scope), then added kimi's markers and the `agentProvider.ts` presets, pinning `MARKER_LEDGER` at **14** across 5 files.
- 02-05 (fix commit `07889df`): updated the ledger for webhook.ts's 3 new markers, **14 → 17**.
- This session (before any edit): **17**, matching 02-05's ledger exactly. No disagreement found between the tree and the last-recorded ledger value.

**A genuine gap found and fixed, not just re-measured**: `qwen` had **zero** raw `LIVE-UNVERIFIED` markers anywhere in source, despite `02-VALIDATION.md`'s own operator-account table listing it alongside pi/opencode/crush as needing a real paid account this machine does not have. Every other unverified engine (pi, opencode, crush, kimi) had at least one marker; qwen had none. This would have made the per-engine `>= 1` assertion this task's whole action requires unsatisfiable by correct code — not a test bug, a source gap. Added one marker to `src/shared/agentProvider.ts`'s qwen preset, in the same register as kimi's and crush's. **B-markers-total after the fix: 18**, across 6 files (`agentProvider.ts` 2 → 3).

**Whether 02-07's wave-4 pin routed through `readStripped`**: No. Read at execution time, it already called `fs.readFileSync` directly. It was never the vacuous "collapses to zero" case D-40 warns about — RED run 4 below re-proves that rather than finding a bug. What it did not have: a named `readRaw` counterpart to `readStripped`, a per-engine lower bound, or a committed file-set assertion. All three added this task.

**The rewritten clause** (`test/repo-claims.test.cjs`): a `readRaw(rel)` helper beside `readStripped`; a committed `LIVE_UNVERIFIED_TOTAL = 18`; a committed `LIVE_UNVERIFIED_ENGINES` array (`['pi', 'opencode', 'crush', 'qwen', 'kimi']`); `markerBlocks(rel)`, which for every raw marker occurrence finds its enclosing comment block — the smallest `/* … */` range containing it, or, failing that, the maximal contiguous run of `//` lines touching it — never a character count; per-engine attribution by testing each block against `\b<engine>\b` (case-insensitive); a committed file-set `deepEqual`, checked *before* the total-equality assertion so a marker moved into an unlisted file fails on its own, not only as a side effect of the total drifting.

## All Thirteen RED Runs

**Task 1 (4 runs), all pasted live and reverted:**
1. Deleted crush's marker (`hiveProvisioning.ts:377`) → the per-file check fails immediately (`expected exactly 5, found 4`). Isolated further: with the per-file/total checks defeated by adjusting `MARKER_LEDGER`/`LIVE_UNVERIFIED_TOTAL` to hide the deletion, the per-engine bound independently fires (`crush has 0 attributed marker(s), expected >= 1`).
2. Added a marker to `src/main/delivery.ts` (a file `MARKER_LEDGER` does not list) → the file-set `deepEqual` fails first (reordered the clause specifically so this is reachable, not shadowed by the total check); isolated further to show the total-equality check independently fires too.
3. Renamed `qwen` → `xwen` inside its own marker's *entire* comment block (all five contiguous `//` lines, not just the marker's own three — the first attempt renamed only 3 of 5 lines and the test stayed green, because the block's true boundary extends into the `SPIKE/TODO-verify` continuation lines that follow with no code line between them) → `qwen has 0 attributed marker(s)` while total/ledger/file-set all still pass.
4. Routed `readRaw` through `stripComments` (simulating the D-40 landmine) → every per-file count collapses to 0 (`expected exactly 3, found 0`), reproducing the landmine on demand.

**Task 2 (3 runs):**
5. Restored `HIVE.md`'s original stale sentence (precisely, via a scripted swap of the whole corrected block back to the exact original text, not an approximate edit) → negative half fails (`HIVE.md still hands the one-gate title to useHive.ts's effect #4`).
6. Deleted `docs/adr/0001-one-gate-for-pty-writes.md` → fails on existence (`deleting the ADR must FAIL this clause, not satisfy the negative half`).
7. Renamed `drainQueue(` out of `src/main/delivery.ts` → fails (`no longer contains drainQueue(`).

**Task 3 (3 runs):**
8. Deleted the README engine table → `0 data row(s), expected >= 5`.
9. Renamed the only renderer consumer's identifiers (`providerCapabilities`/`capabilityLine` in `store/config.ts`) → `no file under src/renderer imports` fails.
10. Flipped copilot's `costTracking` off `'none'` → the deliberately-fails-on-improvement negative half fires.

**Task 4 (3 runs):**
11. Restored `SECURITY.md`'s original tunnel-close paragraph → `SECURITY.md still claims the tunnel cannot be closed`.
12. Deleted `hardKillTree` from `src/main/tunnel.ts` → fails on the positive half.
13. Stripped all `TunnelHandle`/`TunnelOpener` references from `src/main/webhook.ts` → fails (first attempt only removed the import line, 3 references remained elsewhere in the file and the test stayed green — the real RED needed all references gone).

Every run was reverted via a scratchpad backup (`cp`, never `git checkout` after one accidental full-file revert on the first attempt at task 1 wiped an uncommitted rewrite — recovered by re-applying the same edit, recorded honestly rather than silently redone).

## The Three-Places-One-Number Check

```
README=18 CONCERNS=18 TEST(LIVE_UNVERIFIED_TOTAL)=18  →  SAME=18
```
All three agree, verified by command in this session.

## Six Stated Limitations (02-VALIDATION.md's wording, now tracked in CONCERNS.md)

1. No stable public URL at $0 (DAEMON-05) — Quick Tunnels mint a fresh hostname on every open.
2. `setLoginItemSettings` is a no-op on Linux (D-10.4).
3. `setActivationPolicy('accessory')` is UNVERIFIED — needs a macOS machine (D-10.5).
4. DAEMON-02 is a localhost-verified auth path, never a device-verified install.
5. Five `LIVE-UNVERIFIED` bridges (PARITY-03, D-33/D-35) — pi, opencode, crush, qwen, kimi.
6. DAEMON-05's "always visible" is met in purpose, not literally at 800px (D-41).

**PARITY-01a's sign, stated plainly**: it moved the count of engines that can receive mail from **8 to 9**, and moved the count of live-verified bridges by **zero**. Kimi's bridge is real and built correctly; it is also unverified, exactly like the four it joins.

## The Acceptance-Surface Corrections (ROADMAP.md, task 6)

Six claims corrected in place, each marked `**corrected/restated 2026-08-24 (D-id): …**` in the file's own existing convention (used twice already at `:83`/`:89`, reused exactly, never a new marker shape):

| # | Claim | D-id | Before → After |
|---|---|---|---|
| 1 | God-file figures (3 separate records: risk paragraph, "why the god-files live here" intro, "must not go in Phase 1" bullet) | D-02 | "5,620 lines… 3,562 lines… ~157 IPC handlers" → pre-split baselines (index.ts 5,877 / hive.ts 4,275, from 02-02's and 02-01's own D-01 measurements) **and** this session's re-measurement (index.ts 4,967 lines / 160 IPC handlers, hive.ts 2,822 lines) |
| 2 | `electron`-import mechanism | D-02 | "imports electron, so it cannot be loaded" → module-scope side effects; stub resolved since #55; `boot-floor.test.cjs` is the proof |
| 3 | Success Criterion 1 | D-05 | "could not be written before the split" (all four) → only shutdown and agent lifecycle; the git committer and mail router already had tests/a public entry point |
| 4 | Success Criterion 3 | D-38 | "arrives in that worker's terminal" → arrives in that worker's inbox, via main's drain, like any other mail; ADR-0001 intact |
| 5 | Success Criterion 4 | D-41 | "visible whenever the tunnel is up" → met in purpose, not literally at ~800px |
| 6 | Success Criterion 5 | D-34/D-33 | "All eleven report cost… four live-unverified bridges" → unachievable for copilot/custom by construction; five bridges now, kimi joined |

The closing **Note** paragraph, which separately quoted two of these claims as its own record (D-05's and D-38's phrases), was corrected too — verified via this session's own record-bounded simulation that a single mark on Criterion 1/3 alone does NOT cover the Note's separate copy.

**Finding, recorded rather than reconciled**: the plan's own acceptance criterion expected the marker count to grow by exactly 6 (delta from a baseline of 2, to exactly 8). Satisfying every one of the plan's own per-claim `UNMARKED` checks required **10** markers, not 6 — the god-file figures alone span three separate blank-line/bullet-bounded records (not one), and D-05 and D-38 each span two (their Success Criterion copy and the Note's separate copy). Verified directly: stopping at 8 would leave at least two records genuinely uncorrected, which is the exact failure this plan exists to prevent. The plan's own criterion undercounted; the individual per-claim checks (the substantive test) are what was honored.

**Finding, recorded rather than silently substituted**: the plan's own `<interfaces>` pointer for the god-file figures was "measured 2026-08-21 on main: 5,812 / 4,121 / 153" — itself already nine waves stale by execution time, exactly as the plan's own text warned it would be ("at least four of them move these lines"). Two further extractions landed after that measurement (plan 02-03's `floor/lifecycle.ts` and `headless.ts`), pulling more code out of `index.ts` than the plan anticipated. This session's own re-measurement (4,967 / 2,822 / 160) is what the ROADMAP now states — not the plan's own stale pointer, per D-01.

## PARITY-02's Restatement — Three Places, Shown to Agree

README.md's cost paragraph, `.planning/ROADMAP.md`'s Success Criterion 5, and `.planning/REQUIREMENTS.md`'s PARITY-02 entry all now say, in the same words: `claude`/`codex` report through native telemetry, `qwen`/`crush` through the proxy-bridge sidecar — **four** engines tracked, **seven** not (`grok`, `kimi`, `antigravity`, `opencode`, `pi`, `copilot`, `custom`), naming copilot and custom's own preset comments as the reason the last two are structurally unfixable. Verified definitively via `AGENT_PROVIDER_PRESETS`'s own `costTracking` field for all eleven presets, twice (once during task 3, once again while writing this SUMMARY as a cross-check — the second pass is what caught the arithmetic error below).

**A self-caught error, worth stating plainly**: the first pass through tasks 3, 6 and 7 wrote "six engines tracked, five not" in all three files — consistently wrong, and consistent precisely because each was copied from the same wrong first derivation rather than independently re-measured. The correct count, re-derived cleanly from source (`costTracking !== 'none'` for exactly `claude`, `codex`, `qwen`, `crush` — four; the other seven all declare `'none'`), is four tracked, seven not. Fixed in a dedicated `fix(02-12)` commit across all three files, with the D-34 marker-scoped check and the full suite re-verified green after.

## Ownership Note 4

`grep -c 'PARITY' .planning/phases/01-finish-the-floor/01-23-PLAN.md` → **`0`**. No collision; task 7 proceeded.

## No Checkbox or Status Value Flipped by This Plan's Own Editorial Work

Every task-level edit to `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` left every checkbox and status cell exactly as found — verified by `git diff` over the whole plan's commit range showing zero `- [ ]` → `- [x]` transitions and zero changed status cells, with the single exception below (a deliberate, separate step, not part of any task's correction work).

**PARITY-03 was flipped `[x]`/Complete by this plan**, via the standard `requirements mark-complete` step at the state-update stage — this is squarely the plan's own declared requirement (frontmatter: `requirements: [PARITY-03]`), delivered by this plan's own task 1, and is a different situation from PARITY-02 (delivered piecemeal by other plans, whose checkbox task 7 explicitly left for the rollup). **PARITY-02's checkbox and status row were found already `[x]`/Complete before this plan touched anything** — set by an earlier plan (most likely 02-07, which first restated PARITY-02 in source) against the original, unachievable "all eleven" wording. This plan's task 7 corrected the *text* only, per its own explicit scope, and left the pre-existing state exactly as found; the discrepancy (Complete, ticked against text that was false until this plan's correction landed) is recorded in the requirement's own restatement note rather than silently inherited.

## Refusing to Inherit Is Not Correcting

Every other Phase-2 plan was right to refuse to *inherit* the stale ROADMAP/TESTING/REQUIREMENTS claims into its own SUMMARY — 02-01 explicitly recorded that it "never quoted from ROADMAP.md," 02-02 and 02-08 did the same. That discipline is correct and necessary, but it is not the same as *correcting* the claim at its source. This plan is the last one in the phase and the only one that could close that gap — which is why the correction is here, in wave 9, and nowhere else.

## The Fresh-Install Tunnel Fix (handed over from 02-10, fixed rather than only documented)

**Root cause, traced precisely rather than re-guessed**: `ipcMain.handle('tunnel:start')` is the only control the shipped UI exposes for opening the public tunnel — confirmed by reading every renderer call site of `tunnelStart`/`phonePairing` in `SettingsModal.tsx`. On a fresh install (zero enabled webhook endpoints), it called `startWebhookServer()` with no `forPhone` option, which returned `{ok:false, error:'no enabled webhook endpoints'}` *before ever constructing a `WebhookServer` instance* — so retrying was identical to the first attempt, forever. The only thing that can arm the phone route (`mintEnrollment()`, called from `phone:pairing`) is never invoked by the renderer as an operator-initiated first action — only automatically, after the tunnel is already reported running. No sequence reachable through the shipped UI could ever arm the phone before the tunnel refused to open.

**The stale premise**: `index.ts:3986-3988`'s comment said a floor with no enabled webhook endpoint "genuinely has nothing to expose yet (a phone route family becomes servable in plan 02-05)" — true when written, false by the time this plan ran, because 02-05 landed and the route exists; nothing had wired the arming step into the one path an operator can actually reach.

**The fix**: `tunnel:start`, when it finds zero enabled endpoints, now mints a phone enrollment (the exact same mint-then-start order `phone:pairing` already used) before calling `startWebhookServer({forPhone: true})`. A real webhook endpoint still takes the unarmed path unchanged. This does not violate the tunnel's off-by-default/no-side-effect invariant — `tunnel:start` *is* the operator's explicit control, and the renderer's existing `useEffect` re-mints a fresh, real pairing token the instant the tunnel is confirmed running anyway, so the token minted inside `tunnel:start` is a throwaway superseded within one render cycle.

**Verification**: `index.ts`'s IPC handler itself cannot be loaded under `node --test` (module-scope side effects, D-02) — so two tests were added to `test/webhook-endpoints.test.cjs` exercising the real `WebhookServer.start()` bind directly, proving the exact mechanism the handler now relies on: zero endpoints + unarmed refuses (unchanged, the stone-cold-default case); zero endpoints + `mintEnrollment()` then `start()` succeeds and still opens no tunnel by itself. Drove the second test RED by removing the mint call — fails for the right reason — then restored. `npm run typecheck`, `npm run build` and the full suite (805/798/0/7, +2 from this fix) all verified green.

## Explicitly NOT Claimed

- PARITY-03 is **not** closed by verifying bridges — it is closed by pinning a ledger that fails on drift. pi, opencode, crush and qwen remain `LIVE-UNVERIFIED`; kimi joins them as the fifth. None of those five CLIs is installed on this machine and no operator account was supplied.
- PARITY-01a raised the unverified count from four to five while raising the can-receive-mail count from 8 to 9 — stated as a sign, not implied as a pure win.
- PARITY-02 delivers four of eleven tracked, never "all eleven" — the requirement as originally written is unachievable.
- DAEMON-02 remains a **localhost-verified** auth path — the tunnel-deadlock fix above removes a blocker to reaching a real device test, it is not itself a device-verified install.
- DAEMON-05's "always visible" is met in purpose, not literally at 800px.
- `setActivationPolicy('accessory')` is **UNVERIFIED — needs a macOS machine**; `setLoginItemSettings` is a **no-op on Linux**.
- The tunnel-close verification (~30s) is not a multi-hour soak; Cloudflare documents Quick Tunnels as testing-and-development only.

## Known Stubs

None. This plan's own output is entirely docs/tests plus one small, fully-tested production fix (`src/main/index.ts`'s `tunnel:start` handler) — no UI surface renders a stub value as a result of this plan's work.

## Threat Flags

None beyond what the plan's own threat model already names and mitigates — this plan's new production surface (`tunnel:start`'s phone-arming path) is a narrowing of an existing gap, not a new trust boundary; it uses the same `mintEnrollment()`/`phoneArmed()` primitives 02-05 already built and tested.

## Verification

```
npm run typecheck   → exit 0 (both tsconfig.node.json and tsconfig.web.json)
npm run build       → exit 0 (built in 1m 17s)
npm test            → 805 tests, 798 pass, 0 fail, 7 skipped, 0 todo
node --test test/repo-claims.test.cjs (whole file) → 31 tests, 31 pass, 0 fail
```

**Cross-platform CI**: `MEASUREMENT UNAVAILABLE — this branch is not pushed to a remote that would trigger `ci.yml`/`e2e.yml` (both are `branches: [main]` only), and no PR is open against this branch's current HEAD.** `gh pr checks` was not run against a stale/unrelated PR head to fabricate a green table.

## Self-Check

```
FOUND: test/repo-claims.test.cjs
FOUND: src/shared/agentProvider.ts
FOUND: test/main-hardening.test.cjs
FOUND: HIVE.md
FOUND: README.md
FOUND: SECURITY.md
FOUND: .planning/codebase/TESTING.md
FOUND: .planning/codebase/CONCERNS.md
FOUND: .planning/ROADMAP.md
FOUND: .planning/REQUIREMENTS.md
FOUND: src/main/index.ts
FOUND: test/webhook-endpoints.test.cjs
FOUND: 02779b9 (fix: qwen marker)
FOUND: be1dbfb (test: task 1)
FOUND: ba52b98 (docs: task 2)
FOUND: a6ab089 (docs: task 3)
FOUND: 7811ca2 (docs: task 4)
FOUND: ff94b4e (docs: task 5)
FOUND: d1c38cf (docs: task 6)
FOUND: abee3e4 (docs: task 7)
FOUND: a332ac4 (fix: tunnel deadlock)
FOUND: 6d0003e (fix: tracked-count arithmetic)
```

## Self-Check: PASSED
