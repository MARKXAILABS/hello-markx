---
phase: 02-the-daemon-and-the-protocol
plan: 07
subsystem: infra
tags: [typescript, electron-main, hive-protocol, agent-providers, kimi, cost-tracking, node-test]

# Dependency graph
requires:
  - phase: 02-the-daemon-and-the-protocol
    provides: "02-01's hiveTemplates.ts/gitCommitter.ts/hiveProvisioning.ts split; 02-02's floor/boot.ts composition root; 02-03's headless.ts + main-side mail enqueueing"
provides:
  - "src/main/hiveProvisioning.ts — installKimiConfig, the kimi hook bridge (the CODEX case: per-agent --config-file, HOOK_SHIM reused verbatim, kimi's own flat [[hooks]] TOML shape)"
  - "src/shared/agentProvider.ts — the eleven-preset ledger with kimi flipped to canReceiveInbox:true, a required supportsMcp field on every preset, and BridgeDescriptor/costTracking doc comments carrying the PARITY-02 ruling"
  - "src/shared/providerAutomation.ts — ProviderCapabilities.mcp and providerCapabilities(provider, platform?), UI-SPEC Rule C-1a step 1"
  - "test/repo-claims.test.cjs — PARITY-03's exact per-file + repo-wide LIVE-UNVERIFIED marker pin, both directions"
  - "test/engine-parity.test.cjs — kimi bridge tests, the mcp capability tests, PARITY-02's four wiring-matches-declaration assertions"
affects: [02-06, 02-11, 02-12, PARITY-01a, PARITY-02, PARITY-03, PARITY-01b]

tech-stack:
  added: []
  patterns:
    - "Per-agent isolation via an explicit userHome parameter (not os.homedir()), so a unit test can seed a fake credentialed config without touching the real machine — same shape 02-01 established for installCodexHooks' dir/shimPath args"
    - "A repo-fact clause that reads RAW (non-comment-stripped) source as a documented, explained exception to the file's house style, because the thing being pinned lives inside a comment"

key-files:
  created: []
  modified:
    - src/shared/agentProvider.ts
    - src/shared/providerAutomation.ts
    - src/main/hive.ts
    - src/main/hiveProvisioning.ts
    - src/main/hiveTemplates.ts
    - test/engine-parity.test.cjs
    - test/agent-provider.test.cjs
    - test/provider-automation.test.cjs
    - test/repo-claims.test.cjs
    - test/hive-router.test.cjs
    - test/boot-floor.test.cjs
    - test/provider-config.test.cjs

key-decisions:
  - "kimi --help was run before any bridge code was written (task 1 gate). kimi is absent from this machine (ruling 3) — command -v/--version/--help all fail with 'command not found', exit 127/1. autoModeFlag/autoFlag are left byte-identical ('--auto') rather than swapped to one of Moonshot's four other documented alternates (--yolo/-y, --yes, --auto-approve, --afk); the field's comment is marked LIVE-UNVERIFIED naming all four so the next person with the CLI can settle it in one command."
  - "BridgeDescriptor's hooks-arm shim union also had to widen to include 'kimi' — not anticipated by the plan text's 'this task adds exactly two kimi occurrences' framing. Without it, bridgeOf's return type and hive.ts's `desc.shim === 'kimi'` comparison do not typecheck (TS2367: no overlap). Documented as a measured correction; the occurrence-count acceptance criterion is a floor (>= 8), not a ceiling, so this does not violate it (measured: 10)."
  - "Three tests broke because they used kimi specifically as their example of a mail-incapable/hookless provider (test/hive-router.test.cjs, test/boot-floor.test.cjs's D-11 handoff tests; test/provider-config.test.cjs's canReceiveInbox and modelProvidersForAgent(true) assertions). Repointed to copilot (still genuinely mail-incapable) or updated to the new ruled-on values, in a separate commit outside task 3's declared files_modified, per the 02-01 precedent."
  - "Zero engines converted to a proxy bridge for PARITY-02: BridgeDescriptor is mutually exclusive and hive.ts's dispatch is hooks XOR proxy, so grok/kimi/opencode would each LOSE their mail bridge to gain a cost number — D-34's 'zero new code' reading does not survive contact with the source. This plan states the ruling in BridgeDescriptor's own doc comment instead."
  - "The kimi bridge's PARITY-01a gain and PARITY-03's verification cost pull in opposite directions and both numbers are reported, in that order, per D-33/VALIDATION: engines that can receive mail 8 -> 9; live-verified bridges unchanged at zero; LIVE-UNVERIFIED bridges 4 -> 5."

requirements-completed: [PARITY-01a, PARITY-02, PARITY-03]

duration: ~50min
completed: 2026-08-23
---

# Phase 02 Plan 07: The kimi bridge, the MCP capability bit, and the PARITY-02/03 rulings Summary

**Kimi gets a per-agent `--config-file` hook bridge (the codex case, HOOK_SHIM reused verbatim, kimi's own flat `[[hooks]]` TOML shape) shipped LIVE-UNVERIFIED; `AgentProviderPreset` gains a required `supportsMcp` bit surfaced as `ProviderCapabilities.mcp` with zero production consumers by design; PARITY-02 is restated in source as unachievable-as-written with zero engines converted; and PARITY-03's `LIVE-UNVERIFIED` ledger is pinned exactly (14 markers across 5 files) and driven red four ways.**

## Performance

- **Duration:** ~50 min (PLAN_START_TIME not captured at dispatch; estimated from the first task-2 commit `5adca54` at 18:51:09+05:30 to the final task-4 commit `34ad46a` at 19:09:47+05:30, plus the reading/measurement time before the first commit)
- **Completed:** 2026-08-23T13:41:14Z
- **Tasks:** 4/4 (task 1 is measurement-only — no files edited, no commit)
- **Files modified:** 12 across 5 commits (2 feature commits carry a companion deviation-fix commit each is not the case here — 1 deviation commit total)

## Task 1 — `kimi --help`, the ruling, and the measured baseline

```
$ command -v kimi
EXIT=1
$ kimi --version
/usr/bin/bash: line 1: kimi: command not found
EXIT=127
$ kimi --help
/usr/bin/bash: line 1: kimi: command not found
EXIT=127
```

**Ruling 3 fired**: kimi is absent from this machine — the state RESEARCH measured and the expected one. `autoModeFlag`/`autoFlag` left byte-identical (`--auto`); the field's comment is marked `LIVE-UNVERIFIED`, naming `--yolo`/`-y`, `--yes`, `--auto-approve` and `--afk` as the four documented alternates. Proceeded with the bridge — an unverified inbox beats a bounce (D-33).

**Baselines** (all measured this session at `12f8aa6`, the wave-4 dependency HEAD):
- `B-sha` = `12f8aa6e2114bbee712c768e3655e343c17b2b3f`
- `C-marker-map`: `2 src/main/hive.ts`, `4 src/main/hiveProvisioning.ts`, `2 src/main/hiveTemplates.ts`, `1 src/main/index.ts` — **four files, not three**, and matching neither of 02-01's two mid-plan numbers alone.
- `C-markers` = **9** (occurrence-counted: `grep -ro 'LIVE-UNVERIFIED' src/ | wc -l`)
- `C-suite` = `693 / 686 / 0 fail / 7 skipped` (matches the dispatch's stated baseline)
- `C-agentprov` = **5** (`node test/agent-provider.test.cjs | grep -c '✓'`, exit 0)
- `eslint.config.js` present — 02-02's STOP-check was honoured; proceeded.

**LANDMINE 1 reconciliation**: 02-01's `B-markers-hive(6) + B-markers-templates(2) = 8` does **not** agree with `C-markers = 9`, by exactly 1. Confirmed via `git log --oneline -S "hive.ts's LIVE-UNVERIFIED markers"` that the extra site (`src/main/index.ts:4508`) was added by **plan 02-03** (`b6095f9`), not by 02-01's own split — LANDMINE 1 explains the split (02-01's 8 = hive.ts(2)+hiveProvisioning.ts(4)+hiveTemplates.ts(2) after task 3's installer move, which its own SUMMARY records as a mid-plan snapshot), and the 9th site is a genuinely separate, later addition outside 02-01's scope.

- `grep -rn 'costTracking' src/ | grep -v agentProvider.ts` → **one line**: `src/shared/providerAutomation.ts:298: spend: preset.costTracking,`. LANDMINE 3's claim of exactly one consumer holds.
- `grep -n 'preset.bridge' src/shared/agentProvider.ts` and `grep -n "desc.kind === 'proxy'" src/main/hive.ts` → both return matches (line 613's `if (preset.bridge) return preset.bridge;`, and hive.ts's `else if (desc.kind === 'proxy')` at the ensureAgent dispatch). LANDMINE 2's precedence and XOR dispatch survived waves 1–3, confirmed before acting on it in task 4.

## Accomplishments

- **PARITY-01a — kimi's bridge.** `installKimiConfig` (`hiveProvisioning.ts`) is the CODEX case: seeds `~/.kimi/config.toml` as a string (no TOML parser exists or is added — D-06), appends kimi's own **flat** `[[hooks]]` array-of-tables (LANDMINE 4 — never codex's nested `[[hooks.<Event>]]`), reuses `HOOK_SHIM` **verbatim**, writes `0o600` (the seed carries the operator's `kimi login` OAuth credential), and returns the per-agent **file** path for `--config-file`. `hive.ts` dispatches it in `ensureAgent`'s hooks arm; `'kimi-config.toml'` joins `MINE_IGNORE_LINES` so the credential is fail-closed by ordering (written into `.gitignore` at agent birth, before any spawn writes the config) rather than by `scrubStagedSecrets` detection. The previously-silent bare-spawn fall-through (no flag, no positional, no type-into-tui) now logs `protocol-not-seeded` — the exact gap that matters now that kimi is god-eligible.
- **Rule C-1b — the `mcp` bit.** A required `supportsMcp: boolean` lands on all eleven presets (D-26 scoreboard: `false` for pi/custom, `true` for the other nine), surfaced as `ProviderCapabilities.mcp`. Zero production consumers by design — D-25 already proved the `--settings` MCP channel is a no-op; plan 02-11 owns the real channel.
- **Rule C-1a step 1 — the platform parameter.** `providerCapabilities(provider, platform?)` forwards `platform ?? process.platform` to `remoteControlAvailability`; a mechanical drill (a throwing `process.platform` getter) proves a passed platform never touches `process` while an omitted one still reads it. `capabilityLine` stays exactly one argument, byte-unextended — both arities pinned by test.
- **PARITY-02's ruling, in source.** `BridgeDescriptor`'s and `costTracking`'s doc comments now carry the measured constraint (one descriptor per engine, `hooks` XOR `proxy` dispatch) and name every engine PARITY-02 cannot reach and why. Zero engines converted; `qwen,crush` remain the only two proxy-bridged engines, verified via a runnable `bridgeOf` probe.
- **PARITY-03's marker pin.** `MARKER_LEDGER` in `test/repo-claims.test.cjs` pins all 14 `LIVE-UNVERIFIED` sites across 5 files exactly, plus a repo-wide total — driven red four ways (below) before being trusted.

## Task Commits

1. **Task 2: Land the mcp capability ledger + providerCapabilities platform param** — `5adca54` (feat)
2. **Task 3: Build kimi's bridge** — `7c20a47` (feat)
   - **Deviation fix (Rule 1):** `a13f952` (fix) — repointed three tests that used kimi as their mail-incapable example
3. **Task 4: Rule PARITY-02 in source, pin PARITY-03's markers** — `34ad46a` (feat)

_Task 1 makes no file edits and has no commit — its entire product is the ruling and the measured baseline above. Each deviation fix is its own commit, deliberately outside its triggering task's declared `files_modified` set, so every task's per-commit containment criterion still passes exactly (verified for tasks 2, 3 and 4 against their respective base SHAs)._

## Files Created/Modified

- `src/shared/agentProvider.ts` — `supportsMcp` field + all 11 presets; `BridgeDescriptor`'s hooks-arm `shim` union widened to include `'kimi'`; `hookBridge` union widened to include `'kimi'`; kimi preset flipped (`canReceiveInbox: true`, `hookBridge: 'kimi'`), its stale "does not yet install" comment replaced; `BridgeDescriptor`/`costTracking` doc comments carry the PARITY-02 ruling
- `src/shared/providerAutomation.ts` — `ProviderCapabilities.mcp`; `providerCapabilities(provider, platform?)`; ADR-0002 JSDoc amended
- `src/main/hive.ts` — kimi dispatch arm in `ensureAgent`; `MINE_IGNORE_LINES` gains `'kimi-config.toml'`; the bare-spawn fall-through logs `protocol-not-seeded`
- `src/main/hiveProvisioning.ts` — `installKimiConfig`, the kimi hook-bridge installer
- `src/main/hiveTemplates.ts` — `HOOK_SHIM`'s header comment names kimi as a second consumer (comment-only diff; template bodies byte-identical)
- `test/engine-parity.test.cjs` — mcp capability tests, arity tests, kimi bridge tests (bridgeOf, installKimiConfig's TOML shape + untouched-operator-file proof, win32 mode skip, spawn argv, protocol-not-seeded, the real hive-commit credential proof), PARITY-02's four wiring assertions, SHOUTS case re-pointed to copilot
- `test/agent-provider.test.cjs` — preset-completeness case for `supportsMcp`
- `test/provider-automation.test.cjs` — the `??` short-circuit drill, forwarding proof, `mcp` mirrors `supportsMcp` for every preset
- `test/repo-claims.test.cjs` — `MARKER_LEDGER` + the PARITY-03 clause
- `test/hive-router.test.cjs`, `test/boot-floor.test.cjs` — D-11 handoff tests repointed from `kimi` to `copilot`
- `test/provider-config.test.cjs` — `canReceiveInbox`/`modelProvidersForAgent(true)` assertions updated to kimi's new, ruled-on values

## Marker Arithmetic (for plan 02-12)

**C-markers** (task 1 baseline, pre-task-3) = 9, split `hive.ts:2, hiveProvisioning.ts:4, hiveTemplates.ts:2, index.ts:1`.

Task 3 added exactly **5** new sites, named by file:
- `src/shared/agentProvider.ts`: **+2** (the kimi preset's flag comment, and its bridge-consequence comment)
- `src/main/hive.ts`: **+1** (the kimi dispatch arm's comment)
- `src/main/hiveProvisioning.ts`: **+1** (`installKimiConfig`'s JSDoc)
- `src/main/hiveTemplates.ts`: **+1** (`HOOK_SHIM`'s header, naming kimi as a second consumer)

**Final `MARKER_LEDGER`** (measured this session, committed in `test/repo-claims.test.cjs`):

| File | Count |
|---|---|
| `src/main/hive.ts` | 3 |
| `src/main/hiveProvisioning.ts` | 5 |
| `src/main/hiveTemplates.ts` | 3 |
| `src/main/index.ts` | 1 |
| `src/shared/agentProvider.ts` | 2 |
| **Sum** | **14** |

`9 + 5 = 14` — reconciles exactly. Cross-checked live: `grep -ro 'LIVE-UNVERIFIED' src/ | cut -d: -f1 | sort | uniq -c | awk '{s+=$1; print} END {print "SUM="s}'` reproduces this table and sum byte-for-byte.

## The sign the right way round (D-33)

- **Engines that can receive mail: 8 -> 9.** Kimi joins claude, codex, grok, antigravity, qwen, opencode, crush, pi.
- **Live-verified bridges: unchanged, at zero.** Nothing in this plan turned an unverified bridge into a live-verified one.
- **`LIVE-UNVERIFIED` bridges: 4 -> 5.** pi, opencode, crush, qwen stay marked (no operator account for any of the four — VALIDATION's own table); kimi joins them, marked from the moment it ships, because no Moonshot account exists on this machine either.

**The capability gap closed. The verification gap widened.** Building the bridge was still the correct call — D-33 and `02-VALIDATION.md` both rule that an unverified inbox beats a bounce — but PARITY-03's honest ledger reports the cost plainly rather than letting PARITY-01a's gain read as if it also improved verification.

## PARITY-02's delivered scope, as a number

**4 of 11 engines report cost**: claude (`otel`), codex (`transcript`), qwen (`proxy`), crush (`proxy`). **Zero engines were converted by this plan** — verified via a runnable probe:

```
$ node -e "const a=require('./test/load-ts.cjs')('src/shared/agentProvider.ts'); console.log(a.AGENT_PROVIDER_PRESETS.filter(p=>a.bridgeOf(p.id)&&a.bridgeOf(p.id).kind==='proxy').map(p=>p.id).join(','))"
qwen,crush
```

The reason, named per engine, is now in `BridgeDescriptor`'s own doc comment: **grok, kimi, opencode** are already hooks-bridged, and `bridgeOf` returns exactly one descriptor per engine (`preset.bridge` wins over `hookBridge`) with `hive.ts`'s dispatch being `hooks` XOR `proxy` — converting any of the three to a proxy bridge for cost would **delete its mail bridge**, trading PARITY-01a for PARITY-02. **antigravity** would additionally need a `gemini` api mode in the proxy sidecar, which this phase does not deliver. **copilot** (spend sits on the user's Copilot plan) and **custom** (unknown binary) have no number to report under *any* bridge — no amount of engineering invents one.

## The live credential proof

Built a real hive on a tmpdir, seeded a sentinel OAuth token into a fake `~/.kimi/config.toml`, spawned a real kimi worker (`hive.ensureAgent`), drove the hive's own commit path (`hive.flushCommit(root)`), then inspected the real git history:

```
✔ T-P02-07-01: a real hive commit never carries the seeded kimi credential (457.145ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
```

The test asserts, in order: (i) the sentinel is present in `<agentDir>/kimi-config.toml` on disk (the copy really happened); (ii) `git log --oneline` in the hive root has at least one commit (the commit path really ran); (iii) `git ls-files` never lists `kimi-config.toml`; (iv) `git log -p` never contains the sentinel string; plus a direct read of `<agentDir>/.gitignore` confirming the `kimi-config.toml` line is present.

## All RED runs (PARITY-03's marker pin, driven four ways)

**(a) Deleted one marker in `src/main/hive.ts` (fails low):**
```
AssertionError: src/main/hive.ts: expected exactly 3 LIVE-UNVERIFIED marker(s), found 2. ...
2 !== 3
```

**(b) Added one marker in the same already-listed file (fails high):**
```
AssertionError: src/main/hive.ts: expected exactly 3 LIVE-UNVERIFIED marker(s), found 4. ...
4 !== 3
```

**(c) Added a marker to `src/main/memory.ts`, a file `MARKER_LEDGER` does not list — every per-file entry still balances, only the repo-wide total fails:**
```
AssertionError: src/ carries 15 LIVE-UNVERIFIED marker(s) total (every .ts/.tsx file), but
MARKER_LEDGER's per-file entries sum to 14. ...
15 !== 14
```

**(d) Every marker removed (a scratch `src/` tree with zero markers) — fails the `>= 1` lower bound rather than passing on `0 == 0`:**
```
EXPECTED FAILURE: zero LIVE-UNVERIFIED markers anywhere in src/ — either every bridge this
project ships is now genuinely live-verified (in which case replace this whole clause with the
real evidence) or the markers were silently deleted. An empty ledger must not read as "clean".
```

Each of (a)–(c) was reverted and re-verified: `git status --porcelain -- src/ test/` showed nothing beyond this plan's declared files, `grep -ro 'LIVE-UNVERIFIED' src/ | cut -d: -f1 | sort | uniq -c` reproduced the committed `MARKER_LEDGER` and its sum of 14 exactly, and the `bridgeOf` zero-conversions probe still printed `qwen,crush`. The green run: `# pass 1, # fail 0` on the marker-pin test alone, and `# pass 703, # fail 0` on the full suite.

## Assertion 2's RED run (mutual exclusivity, PARITY-02)

Planted `bridge: { kind: 'proxy', api: 'openai', baseUrlEnv: 'X', inboxDelivery: 'terminal' }` onto the grok preset:
```
AssertionError: grok sets BOTH bridge ({"kind":"proxy","api":"openai","baseUrlEnv":"X",
"inboxDelivery":"terminal"}) and hookBridge (grok) — bridgeOf returns preset.bridge only, so
the hookBridge is dead weight and whoever added it believes it still wires the hooks path
```
Reverted; `git status --porcelain -- src/` clean; the assertion passes green again.

## What was handed forward, by plan number

- **To 02-04:** nothing — no `src/preload/index.ts` edit was made in this plan (Rule C-1a step 2 stays with 02-04's wave).
- **To 02-06:** the two `canReceiveInbox` god pickers (`CommandCenterPanel.tsx`, `OnboardingWizard.tsx`) that now include kimi; the `NO MCP` / `NO SPEND` chips (Rule C-2, no data source consumer written here); the renderer call sites for `providerCapabilities(provider, platform)` sourced from `window.cth.platform`; and the ≥1-production-consumer repo-fact clause for `capabilityLine`/`mcp`, which would have passed vacuously at wave 4 (D-40) — not written here.
- **To 02-11:** `supportsMcp`'s explicit non-claim about the MCP channel (D-25's no-op finding stands; this field only declares CLI capability, never delivery).
- **To 02-12:** the marker ledger arithmetic above, and the `README.md` per-engine limitation table's claims — this plan states which are now true (kimi has a bridge) and leaves the doc edit itself for 02-12's honesty pass.

## Known divergence: `hive.ts` vs `memory.ts`'s two copies of `MINE_IGNORE_LINES`

`src/main/memory.ts` holds a second, larger, append-only copy of `MINE_IGNORE_LINES` (`settings.json`, `cursor.json`, `inbox/`, `outbox/`, `.claude/`, `.codex/`, `.pi-agent/`, `.opencode/`, `.crush-data/`, `crush.json`), refreshed by the mine loop. Only `hive.ts`'s copy gained `'kimi-config.toml'` — deliberately: `hive.ts`'s `ensureMineIgnore(dir)` runs at **agent birth**, before any spawn writes the credentialed config, so it is the write that has to exist first. `memory.ts`'s append-only refresh does not remove the line hive.ts already wrote, so no operational gap exists today, but the two lists have now drifted by one more entry. Not this plan's file to edit (no owner named in this phase); recorded here rather than silently left for someone to discover.

## Rejected: a `canSeedInitialPrompt(provider)` predicate

Considered and rejected. The condition already exists as the `ensureAgent` branch it would wrap; its only consumer would be that one call site; and UI-SPEC Rule C-2's gap vocabulary has no row for it — exporting it would ship a second `capabilityLine`: a tested pure function nothing renders (D-30). Add it when a UI surface actually needs it.

## PARITY-01b is NOT delivered by this plan

One plain sentence, so no reader mistakes the `mcp` bit for the UI that renders it: **`ProviderCapabilities.mcp` and the `platform` parameter both land with zero production consumers**, exactly like `capabilityLine` does today. This plan does not count PARITY-01b as delivered — plan 02-06 lands the consumer and the clause that proves it.

## Decisions Made

See `key-decisions` in frontmatter. Summarized:
1. Task 1's gate ran before any bridge code — ruling 3 fired (kimi absent), flags left byte-identical and marked, per D-33/VALIDATION.
2. `BridgeDescriptor`'s shim union needed widening too, beyond what the plan's occurrence-count language anticipated — a compile necessity, not a choice; documented as a measured correction.
3. Three tests that hard-coded kimi as "the mail-incapable example" were repointed to copilot, as a separate deviation commit.
4. Zero engines converted for PARITY-02 — the ruling is written into `BridgeDescriptor`'s own doc comment so the next planner reads it before attempting the same conversion.
5. Both PARITY-01a's gain and PARITY-03's cost are reported together, in the sign D-33 mandates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `BridgeDescriptor`'s hooks-arm `shim` union also needed widening**
- **Found during:** Task 3, immediately after adding the kimi dispatch arm in `hive.ts`
- **Issue:** `npx tsc --noEmit` failed with `TS2367: This comparison appears to be unintentional because the types '"grok" | "opencode" | "pi"' and '"kimi"' have no overlap` at the `else if (desc.shim === 'kimi')` comparison. Widening only `hookBridge`'s union (as the plan's action text literally describes) leaves `BridgeDescriptor`'s separately-declared `shim: 'agy' | 'codex' | 'pi' | 'opencode' | 'grok'` type unable to accept `'kimi'` — `bridgeOf`'s own return statement (`{ kind: 'hooks', shim: preset.hookBridge }`) would also fail to typecheck once `hookBridge` includes `'kimi'`.
- **Fix:** Added `'kimi'` to `BridgeDescriptor`'s hooks-arm `shim` union alongside `hookBridge`'s union.
- **Files modified:** `src/shared/agentProvider.ts` (already in task 3's declared `files_modified`)
- **Verification:** `npx tsc --noEmit -p tsconfig.node.json` exits 0
- **Committed in:** `7c20a47` (task 3's own commit — no separate commit needed, the file was already declared)

**2. [Rule 1 - Bug] Three tests broke because they used kimi as their mail-incapable example**
- **Found during:** Task 3, whole-suite verification after committing the bridge
- **Issue:** `test/hive-router.test.cjs` and `test/boot-floor.test.cjs`'s D-11 handoff tests spawned `provider: 'kimi'` specifically to exercise the terminal-handoff BOUNCE path (`!canReceiveInbox`); `test/provider-config.test.cjs` asserted `preset.canReceiveInbox === false` for kimi directly and asserted kimi was excluded from `modelProvidersForAgent(true)` (the god-eligible list). All four assertions became false once kimi flipped to `canReceiveInbox: true`.
- **Fix:** Repointed the D-11 handoff tests to `provider: 'copilot'` (still genuinely mail-incapable — print mode exits per turn, no hook bridge). Updated `provider-config.test.cjs`'s two assertions to the new, deliberately-ruled-on values (kimi is `true` and now appears in the god-eligible list, exactly D-33's consequence).
- **Files modified:** `test/hive-router.test.cjs`, `test/boot-floor.test.cjs`, `test/provider-config.test.cjs`
- **Verification:** `node --test --test-reporter=tap test/*.test.cjs` → `EXIT=0`, `# fail 0`, `# pass 703` (was 686 at baseline)
- **Committed in:** `a13f952` (separate commit, outside task 3's declared `files_modified`, per the 02-01 precedent)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — one a compile-necessity the plan's own text undercounted, one a regression this plan's own flip caused in tests that hard-coded kimi's old behaviour)
**Impact on plan:** Both fixes are pure correctness/location repointing. No scope creep. Every task's per-commit containment criterion still passes exactly (re-verified against each task's own base SHA after each commit).

## Issues Encountered

None beyond the two deviations documented above.

## User Setup Required

None — no external service configuration required. (A Moonshot account + the `kimi` CLI would let a future session flip the bridge's markers from `LIVE-UNVERIFIED` to verified, but the zero-recurring-cost rule makes that explicitly out of scope here.)

## Next Phase Readiness

- `src/shared/agentProvider.ts` and `src/shared/providerAutomation.ts` have one owner for this whole phase — no other 02-* plan edits either file, verified by re-reading each plan's `files_modified` frontmatter before landing anything here.
- Whole suite: `693 / 686 / 0 fail / 7 skipped` (dispatch baseline) -> `710 / 703 / 0 fail / 7 skipped` (this plan's end) — `# fail 0` throughout, `# skipped` unchanged at 7.
- `npm run typecheck`, `npm run build`, `npx eslint <every touched src/ file> --max-warnings 0` all exit 0.
- `test/agent-provider.test.cjs` direct run: exit 0, `6` `✓` lines (was 5).
- **Not run this session:** `gh pr checks` on draft PR #78 — this branch is now well ahead of `origin/gsd/v1.0-floor-closure` and none of this plan's 5 commits have been pushed. Running it now would report stale CI results predating this plan's changes. `MEASUREMENT UNAVAILABLE — needs a push to origin/gsd/v1.0-floor-closure first`, matching 02-01's precedent for the same reason.
- Plan 02-06 can now build the two `canReceiveInbox` god pickers and the `NO MCP`/`NO SPEND` chips against a stable, fully-typed capability surface; plan 02-11 can build the real `--mcp-config` channel against `supportsMcp`'s explicit non-claim; plan 02-12 has the marker arithmetic and README claims to close out.

---
*Phase: 02-the-daemon-and-the-protocol*
*Completed: 2026-08-23*

## Self-Check: PASSED

All 4 claimed commit hashes (`5adca54`, `7c20a47`, `a13f952`, `34ad46a`) found in `git log --oneline --all`, and the SUMMARY file itself found on disk at `.planning/phases/02-the-daemon-and-the-protocol/02-07-SUMMARY.md`.
