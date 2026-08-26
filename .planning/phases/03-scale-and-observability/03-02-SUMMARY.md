---
phase: 03-scale-and-observability
plan: 2
subsystem: observability
tags: [telemetry, circuit-breaker, ipc, cost-attribution, codex, preload-types]

# Dependency graph
requires:
  - phase: 03-01
    provides: "harnessHome-aware PersistStore/KnowledgeManager — untouched by this plan; only its baseline-drift discipline was reused"
  - phase: 04 (GATE/RECORD/VIGIL)
    provides: "boot.ts's absence watchdog + SHUTDOWN_STEPS and the four HookServer composition-root seams — present at the base commit and left untouched"
provides:
  - "CircuitBreaker.snapshotAll(): Record<string, BreakerState> — the PULL side of breaker state"
  - "control:breakerSnapshot IPC + preload getBreakerSnapshot() (caller deferred to 03-08 by design)"
  - "HiveManager.codexHomeFor(id) — the public mirror of installCodexHooks' join(agentDir, '.codex')"
  - "hive.ts's exported pure predicate hasOwnCostSource(agents, id)"
  - "RegistryAgent.spawnedAt, re-stamped per (re)spawn"
  - "resolveCodexHome WIRED at the one production TelemetryCollector construction site"
  - "A gated DISPLAY join in writeFleetSnapshot + hive:agentDirectory: costLifetime, costUnattributed, corrected lastActiveSecAgo, spawnedAt"
  - "AgentDirectoryEntry.spawnedAt / .costLifetime / .costUnattributed — TYPED on the preload interface"
affects: [03-08, SCALE-05, PARITY-02]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composition-root wiring is verified against a REALLY BOOTED floor (bootFloor + armAlwaysOnBeats), never against a grep over the argument list — extends 04-20's four-HookServer-seam precedent to the TelemetryCollector"
    - "A declared-but-never-passed optional option is indistinguishable from an absent feature; the test must remove the wiring and observe the wrong number"
    - "sessionId === '' is the load-bearing discriminator separating a live OTel sample from a transcript-derived one (freshness, costLifetime)"

key-files:
  created: []
  modified:
    - src/main/breaker.ts
    - src/main/hive.ts
    - src/main/floor/boot.ts
    - src/main/index.ts
    - src/preload/index.ts
    - test/breaker.test.cjs
    - test/boot-floor.test.cjs
    - test/telemetry-auth.test.cjs
    - test/hive-durability.test.cjs
    - test/repo-claims.test.cjs

key-decisions:
  - "The control:breakerSnapshot handler calls breaker.snapshotAll() ONCE outside the registry loop, not once per agent as the plan's literal code spelled it. Same result, O(n) instead of O(n squared) — in a phase named 'scale'."
  - "snapshotAll() OMITS an agent the breaker never ticked rather than defaulting it to 'healthy'. 'Not seen' and 'seen and fine' are different claims; the IPC handler fills the registry roster itself, so the default lives at exactly one layer."
  - "A THIRD control:-channel count baseline exists that the plan's D-17 'two-place edit' rule never named: test/repo-claims.test.cjs's GATE-05 count (9). Bumped to 10 with the reason recorded; the equality was NOT weakened and GATE-05's own two security counts are untouched."
  - "spawnedAt is guarded BEHAVIOURALLY (two real ensureAgent calls) instead of by the source regex first written. The regex asserts the weaker claim and reddens on a behaviour-preserving refactor."
  - "The cost-ledger append gate and applyCostRow's arithmetic verified byte-unchanged by DIFF, not by the plan's positive-presence grep — a grep proves the line still exists, not that nothing else in that function moved."

patterns-established:
  - "Every new capability in this plan was negative-controlled: the implementation was replaced by the plausible wrong version and the test observed going red, before the result was trusted"

requirements-completed: []

# Metrics
duration: 71min
completed: 2026-08-26
---

# Phase 3 Plan 2: main-process fixes for SCALE-05's card Summary

**`resolveCodexHome` shipped declared-but-passed-nowhere, so every codex worker's DISPLAYED spend was
its cwd-neighbour's Claude transcripts — now wired, gated by an exported `hasOwnCostSource` that
refuses any figure it cannot prove is that agent's money, alongside a breaker pull-IPC and a
per-respawn `spawnedAt`.**

## Performance

- **Duration:** ~71 min
- **Tasks:** 2 of 2
- **Files modified:** 10 (5 source, 5 test); 0 created
- **Commits:** 4

## Commits

| Commit | Type | What |
|---|---|---|
| `9eb450b` | test | Task 1 RED — `b.snapshotAll is not a function` x2, both D-40 IPC pins failing |
| `e01881a` | feat | Task 1 GREEN — `snapshotAll()`, `control:breakerSnapshot`, `getBreakerSnapshot()` |
| `0e47ddf` | feat | Task 2 — `resolveCodexHome` wired, `hasOwnCostSource`, `spawnedAt`, the gated display join, preload types |
| `d70e955` | test | `spawnedAt` moved from a source regex to a real double-`ensureAgent` drive |

## Accomplishments

### Task 1 — the PULL side of breaker state

`levelFor()` answers one agent and drops `reason`. A card that mounts with a fresh window would render
`healthy` for every agent until the next ~30s beat — a **stopped** agent reading as fine, which is the
fail-unsafe direction. `snapshotAll()` maps the private `agents` map to the already-public
`BreakerState` shape; `control:breakerSnapshot` fills the registry's full roster on top of it.

An agent the breaker has never ticked is **absent** from `snapshotAll()`, not `healthy`. The IPC
handler supplies the `healthy` default from `reg.agents`, so the default exists at one layer only and
`snapshotAll()` never fabricates a row for an agent it has not seen.

Per the plan, this channel has **no production caller** — 03-08 wires `agentView.ts`'s
first-subscriber init. That is a declared deferral, not an omission.

### Task 2 — whose money is on the card?

Two symmetric information-disclosure bugs in one read path:

- **The codex direction.** `TelemetryCollectorOptions.resolveCodexHome` carried a doc comment saying
  *"Wired in index.ts, next to `resolveCwd`"*. It was wired nowhere. An optional option nobody passes
  is indistinguishable from an absent feature: `transcriptFallback` dropped to `resolveCwd` and read
  whatever Claude transcripts happened to live in the repo the codex worker shared. Now passed at the
  one production construction site, gated on the registry's own recorded `provider`.
- **Every other direction.** `hasOwnCostSource` is TRUE for codex and nothing else. A cwd is not a
  per-agent transcript root — that directory can hold another *project's* agent, a deleted agent, or
  the operator's own Claude Code CLI sessions, none of which this registry can see. Every other agent
  renders the declared gap (`costUnattributed: true`, `usd: 0`), never a neighbour's dollars.

Also landed: `spawnedAt` (unconditional, so "up" resets per PTY), the freshness fix
(`u?.sessionId ? …` — a fallback sample's `ts` is the READ time, so the old expression rendered a
dormant agent as permanently "0s ago"), `costLifetime`, and all three fields **typed** on
`AgentDirectoryEntry` rather than left as a raw IPC widening.

`usageById` deliberately **survives** in both joins: it is what still delivers live-OTel spend to an
agent the predicate refuses. Deleting it would have swapped a fabricated neighbour figure for a
fabricated zero.

## Live verification (executed, not grepped)

Every capability was **negative-controlled** — the implementation replaced by the plausible wrong
version, the test observed going red, then restored. This is the whole reason the plan's own
acceptance criteria were not treated as sufficient.

| Check | Result |
|---|---|
| Task 1 RED gate before any source change | 2 fail (`b.snapshotAll is not a function`) + both D-40 IPC pins red |
| `snapshotAll()` replaced with `return {}` | **RED** — "snapshotAll() dropped a ticked agent entirely" |
| `snapshotAll()` replaced with a permanently-`healthy`/no-`reason` row | **RED** — "reports healthy while the same tick decided constrained" |
| `resolveCodexHome` removed from `boot.ts`, booted floor re-driven | **RED** — "the booted floor billed the codex agent 222 output tokens; its own rollout says 700" |
| display join reverted to `usageById.get(id)`, `fleet.json` re-read | **RED** — "shows 0 tokens for a codex agent whose rollout totals 5700" |
| `spawnedAt` changed to `prev?.spawnedAt ?? Date.now()` | **RED** — "did not advance on respawn (…205 -> …205)" |
| `codexHomeFor('cx')` vs `installCodexHooks`' derivation | equal — `<hiveRoot>/agents/cx/.codex` |
| cost-ledger gate + `applyCostRow` byte-unchanged | verified by `git diff` filtered on those symbols: **no matching lines** |
| `hive.writeFleetSnapshot(snapshot: unknown)` | `JSON.stringify` of the whole object — no whitelist, both new fields reach `fleet.json` (confirmed by reading the file back) |
| `hiveAgentDirectory` preload bridge | a bare `ipcRenderer.invoke`, no re-mapping — the three new fields reach the renderer typed |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 warnings (`--max-warnings 0`) |
| All 24 plan acceptance-criteria greps | all satisfied (measured individually, `-F` where the plan required it) |

The two boot-level negative controls are the important ones. `test/telemetry-auth.test.cjs`'s
T-03-02d case **passed on first run, before any source change** — correctly, because it exercises the
*collector*, which already honoured the option. That is precisely the "feature exists and does
nothing" trap: the collector half was never broken, the **wiring** was, and only a really-booted floor
can tell the two apart.

## Deviations from Plan

### 1. [Rule 3 — Blocking] A THIRD `control:`-channel baseline the plan never named

- **Found during:** the full-suite run after Task 2 (not by any acceptance criterion).
- **Issue:** the plan's D-17 rule names a **two**-place edit — `B_IPC_JOINED` and `B_IPC_NAMES` in
  `test/boot-floor.test.cjs`. There is a third: `test/repo-claims.test.cjs:1902` pins
  `ipcMain.handle('control:` at exactly 9. `control:breakerSnapshot` made it 10.
- **Symptom (measured):** `GATE-05: the ANSWER is exactly one new renderer→main invoke channel` —
  `10 !== 9`.
- **Fix:** bumped the baseline to 10 with the provenance recorded in a comment (8 → 9 by 04-18,
  9 → 10 by this plan). The assertion **remains an exact equality** — it was not relaxed to a `>=`,
  and GATE-05's two actual security counts (`control:answerApproval` === 1 on each side of the
  bridge) are untouched. This is the same maintenance contract `B_IPC_JOINED` carries, and the
  assertion's own message demands it: *"update this baseline in the same commit that changes the
  channel."*
- **Files:** `test/repo-claims.test.cjs` · **Commit:** `0e47ddf`

### 2. [Rule 2 — Missing critical verification] The plan's criteria could not detect an unwired option

- **Found during:** reviewing Task 2's acceptance criteria against T-03-02d's first (green) run.
- **Issue:** the plan verifies the wiring with `grep -n "resolveCodexHome" src/main/floor/boot.ts >= 1`.
  A grep over an argument list proves the TEXT is present, not that the closure reaches the collector
  — and the fixture case the plan mandates lives in `test/telemetry-auth.test.cjs`, which builds its
  **own** collectors and therefore cannot observe `boot.ts` at all. Both were green before a single
  line of Task 2 was written.
- **Fix:** added `03-02: a really-booted floor reads a codex agent OWN rollout…` to
  `test/boot-floor.test.cjs`, following 04-20's precedent for the four `HookServer` seams: a real
  `bootFloor(deps)`, a real registry with two agents sharing one cwd, the codex rollout written at
  the path `hive.codexHomeFor()` actually derives, and the assertion taken from `floor.telemetry`.
  It then calls the exported `armAlwaysOnBeats()` (which writes the snapshot synchronously) and reads
  the new fields back out of the real `fleet.json`.
- **Verified red** twice, as recorded in the table above.
- **Files:** `test/boot-floor.test.cjs` · **Commit:** `0e47ddf`

### 3. [Rule 1 — Bug] The plan's literal IPC-handler body is O(n²)

- **Issue:** the plan spells the handler as `for (const id of …) { const s = breaker.snapshotAll()[id]; }`
  — rebuilding the entire per-agent map once **per agent**, then discarding all but one row. On a
  40-agent floor that is 1,600 object constructions per invoke, in the phase named *scale and
  observability*.
- **Fix:** `const seen = breaker.snapshotAll();` hoisted above the loop. Behaviour is identical and
  every acceptance criterion still passes.
- **Files:** `src/main/index.ts` · **Commit:** `e01881a`

### 4. [Rule 1 — self-inflicted] A `spawnedAt` guard that asserted the weaker claim

- **Found during:** re-reading my own Task 2 tests against the mandate to drive real code paths.
- **Issue:** I first guarded `spawnedAt` with two source regexes over `hive.ts`
  (`/spawnedAt: Date\.now\(\)/`). That asserts the field is *spelled* in the upsert — not that it
  **advances on a respawn**, which is the behaviour and the exact thing the plan warns can be got
  wrong (by letting `...prev` carry it forward the way it deliberately carries `sessionId`). Worse,
  the regex reddens on a behaviour-preserving refactor (hoisting `Date.now()` into a local): a gate
  that cries wolf.
- **Fix:** replaced by two real `ensureAgent` calls on one id in `test/hive-durability.test.cjs`,
  asserting the stamp advances **and** that `sessionId` survives the same upsert. Verified red
  against `prev?.spawnedAt ?? Date.now()`. The removal is documented in place, naming the new guard.
- **Files:** `test/telemetry-auth.test.cjs`, `test/hive-durability.test.cjs` · **Commit:** `d70e955`

## Baseline drift (plan written before Phase 4 and 03-01 landed)

The plan's ANCHOR RULE was correct to anticipate this. **Every quoted CONTENT was accurate; the line
numbers moved substantially.** Source anchors were measured at the base commit `c0980a4` before any
edit; unchanged-file anchors are equivalent at HEAD.

| Plan citation | Actual | Moved |
|---|---|---|
| `boot.ts` `writeFleetSnapshot` :470-499 | **:508-537** | +38 |
| `boot.ts` `appendCostLedger` gate :428-429 | **:466-467** | +38 |
| `boot.ts` `new TelemetryCollector` ~:1010 | **:1130** | +120 |
| `boot.ts` archived filter :478 | **:515** | +37 |
| `index.ts` `hive:agentDirectory` ~:3450 | **:3625** | +175 |
| `index.ts` `breaker.levelFor(id)` :3476 | **:3658** | +182 |
| `index.ts` codex resume `CODEX_HOME` repoint :2234-2245 | **:2346-2353** | +112 (T-03-02h's own citation) |
| `index.ts` hive named import :30 | **:31** | +1 |
| `hive.ts` `RegistryAgent` :221-239 | **:240-262** | +19 |
| `hive.ts` `AgentMeta.provider` :200 | **:219** | +19 |
| `hive.ts` `provider ?? 'claude'` :991,1009,1180,1211,2430 | **:1093,1111,1297,1328,2639** (pre-edit) | all 5 moved |
| `hive.ts` `recordSession` :1244 | **:1361** | +117 |

**Unmoved** (verified, not assumed): `boot.ts:31` hive import · `breaker.ts:287-290` ladder ·
`breaker.ts:394` cost-cap reason · `test/breaker.test.cjs:248-258` cost-cap case, `:239-246` helpers,
`:358` final `process.exit` · `preload/index.ts:135-162` `AgentDirectoryEntry` ·
`test/telemetry-auth.test.cjs:622-643` temp-HOME pattern and `:560` `projectDir` import ·
`transcript.ts:299` `readAgentUsage` · `usage.ts:140-161` `readCodexUsage` ·
`src/renderer/src/realtime/tools.ts:481,:526,:578,:630` (the four voice callers).

**Grep-count baselines the plan asserts — all re-measured at `c0980a4` and all correct as stated:**
every new symbol 0/0 · `usageById` 2/2 · `telemetry.getAgentUsage(id)` boot 1 / index 0 ·
`provider ?? 'claude'` **5** (the plan's own retraction-of-a-retraction is right; it is five) ·
`spawnedAt` in index.ts **7** (the unrelated worker feature) · `grep -c '^test(' test/breaker.test.cjs`
**25** → now **27** · `cumulative.get(key)` 1 · the `appendCostLedger` gate 1.

One stale-parenthetical note for the orchestrator, exactly as the plan predicted:
`grep -c "^test(" test/breaker.test.cjs` is now **27**, and `03-06-PLAN.md` quotes the 25 as an
example of the repo's test-title convention. Nothing goes red; the parenthetical is now stale.

## Test suite

| | Baseline @`c0980a4` | After this plan | Delta |
|---|---|---|---|
| tests | 1084 | **1088** | +4 |
| pass | 1077 | **1081** | +4 |
| **fail** | 0 | **0** | — |
| skipped | 7 | **7** | unchanged |
| duration | ~24.1 s | **24.0 s** | −0.1 s |

**No clock blowout.** The +4 is 3 new `node:test` cases (1 in `boot-floor`, 1 in `hive-durability`,
2 in `telemetry-auth` net of the one removed in deviation 4) — `test/breaker.test.cjs`'s two new cases
run inside that file's own harness and are counted as part of its single file-level result, so the
per-file title count rose 25 → 27 without changing the aggregate. The two costliest additions
(a real `bootFloor` + a real double `ensureAgent`) total ~220 ms.

## Requirements

**SCALE-05 was NOT ticked.** This plan's frontmatter key is `requirements_addressed`, not
`requirements`, and deliberately so — SCALE-05 is delivered by this plan (wave 2) *and* 03-08
(wave 5, the renderer consumer). Only 03-08 carries the literal `requirements:` key. Verified after
all work: `.planning/REQUIREMENTS.md` was not modified.

`.planning/STATE.md` and `.planning/ROADMAP.md` were **not modified** — the orchestrator owns those.

## What this plan does NOT deliver

- **Any change to `cost-ledger.jsonl`.** The `if (sample?.sessionId) hive.appendCostLedger(sample)`
  gate is byte-unchanged and `applyCostRow`'s arithmetic is untouched — verified by diff. Transcript-
  tier spend still does not reach the durable ledger, `taskSpend` or `budgetForAgent`. That is
  T-03-02e, a declared Accepted Residual belonging to PARITY-02 (D-03), not a silent gap.
- **A caller for `control:breakerSnapshot`.** 03-08 wires it. Declared, not missing.
- **Correct spend for a RESUMED codex agent** (T-03-02h). `codexHomeFor` is a pure join and does not
  know that `index.ts:2346-2353` repointed that spawn's `CODEX_HOME` to the sibling home owning its
  rollout. Such an agent reads an empty home and shows `$0` — an **under**-report of its own spend,
  never another agent's dollars. Closing it needs a public per-agent registry writer `hive.ts` does
  not have (`recordSession` is the only one).
- **New phrasing for the four existing voice callers** of `hive:agentDirectory`
  (`tools.ts:481,:526,:578,:630`). They still speak `usd`/`tokens` as plain numbers and do not read
  `costLifetime`/`costUnattributed` (T-03-02f). This plan makes them **more** honest, not less — the
  gated join removed the neighbour's dollars they would otherwise have narrated.

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired data source was introduced. The two
"empty" returns added are both deliberate and load-bearing, not stubs: `snapshotAll()` on a fresh
breaker returns `{}` (asserted with `deepEqual`, and a stub returning `{}` for a *ticked* agent fails
the suite), and `control:breakerSnapshot` returns `{}` when the hive is disabled, matching every other
handler in that file.

## Threat Flags

None beyond the plan's own register. `control:breakerSnapshot` is the one new trust-boundary crossing
and it is **read-only**, accepting no renderer input beyond the invoke itself and returning only the
four fields `control:setBreakerState` already pushes to every window (T-03-02a).

The plan's register was honoured and, where it relied on prose or a grep, upgraded to a behavioural
check: **T-03-02d** and **T-03-02g** are both mitigated *and* negative-controlled against a really-
booted floor rather than only against hand-built collectors; **T-03-02c** (`spawnedAt` is server-
derived, never renderer-supplied) holds — the only writer is `ensureAgent`'s `Date.now()`;
**T-03-02e**, **T-03-02f** and **T-03-02h** are accepted residuals, each recorded above with its
error direction stated (all three under-report; none can surface another agent's money).

One security-relevant observation worth recording: the mitigation for T-03-02d **already existed in
the codebase and did nothing**, guarded by a doc comment that asserted it was wired. Neither the
collector's own test coverage nor the plan's grep criterion could distinguish that state from a
working one.

## Self-Check: PASSED

- All 4 commits verified present in `git log`: `9eb450b`, `e01881a`, `0e47ddf`, `d70e955`.
- All 10 modified files verified present and carrying the expected symbols (24 acceptance greps).
- No files created (none were specified); no files deleted (`git diff --diff-filter=D` empty).
- `.planning/STATE.md` and `.planning/ROADMAP.md` verified unmodified.
- Full suite re-run at completion: **1088 tests, 1081 pass, 0 fail, 7 skipped, 24.0 s.**
