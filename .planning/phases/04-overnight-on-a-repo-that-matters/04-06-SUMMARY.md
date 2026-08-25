---
phase: 04-overnight-on-a-repo-that-matters
plan: 06
subsystem: security
tags: [gate-03, hooks, command-judging, allowlist, tokenizer, win32, node-test]

# Dependency graph
requires:
  - phase: 04-01
    provides: "test/gate-harness.cjs — a real shim child against a real HookServer, win32-green"
  - phase: 01-finish-the-floor
    provides: "HookServer, protectedPathDenial, GATE-01 per-agent token identity"
provides:
  - "src/main/commandShape.ts — a pure, electron-free four-shape command judge returning ShapeVerdict | null"
  - "the PreToolUse shape arm in hooks.ts, running BEFORE protectedPathDenial"
  - "HookServer.commandOf(ti) — ONE entry condition for both judging arms, string OR argv array"
  - "protectedPathDenial reaches every engine that sends a command string, not only Claude"
  - "`restore` as the fifth protected literal in rootTailVerdict"
  - "emitControl carries the raw command, so BlockReason.command can be populated"
  - "two optional trailing HookServer constructor args: hostAllowlist getter + openAsk seam"
  - "config.hostAllowlist, defaulted to DEFAULT_HOST_ALLOWLIST"
  - "ceiling items (j)-(v) plus D-07's two inherited holes, restated"
affects: [04-09, 04-10, 04-13, 04-14, 04-15, 04-19, 04-20]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "a pure predicate module beside the impure gate that calls it (procKill.ts / ftsMatchTerms discipline)"
    - "one `commandOf` helper as THE entry condition for every command-judging arm"
    - "verdict objects ({kind, reason}) rather than bare deny strings, so `ask` has a producer"
    - "operator config reaches a service as an injected getter, never as an import of config.ts"

key-files:
  created:
    - src/main/commandShape.ts
    - test/command-shape.test.cjs
    - test/gate03-roundtrip.test.cjs
  modified:
    - src/main/hooks.ts
    - src/main/config.ts

key-decisions:
  - "D-04 settled: rm+recursive, force-push, downloader-into-interpreter and an unlisted host all ASK; only an operator-EMPTIED allowlist DENIES. Four ask, one deny, so neither arm is dead code."
  - "The rm shape is `rm` + ANY recursive flag (with or without -f), anchored to one command segment's HEAD — measured false positives (`cp -R a b; rm c`, `grep -r rm .`) are asserted null in both directions."
  - "The host arm is scoped to a DOWNLOADER's first non-flag argument, for both the scheme-ful and the scheme-less half. Judging every scheme-ful token refused `cat > README.md` — measured, not hypothetical."
  - "A here-doc BODY is cut off before judging. This repo's own README contains '`rm -rf`, reading credential files' in prose, and judging it refused writing the file that documents the gate."
  - "A single-label host (`http://a/b`, `http://internal/x`) is not judged — net-binding's false-positive sweep pins that spelling as ordinary work."
  - "ControlRegistry.toolDecision is untouched: `ask` is a commandShapeDenial verdict kind, not a third answer from the operator's race-free tool gate."
  - "An ABSENT hostAllowlist getter takes the non-empty default; an EMPTIED list denies. Different facts, different answers."

patterns-established:
  - "Mutation-verified tests: where plan ordering makes a RED unproducible, the discriminating power is proven by disabling the source arm and recording which cases die."
  - "Ceiling items are counted by SYMBOL (`* (x)`), so a wrapped prose reference at line start is a real defect rather than a cosmetic one."

requirements-completed: [GATE-03]

# Metrics
duration: 39min
completed: 2026-08-25
---

# Phase 04 Plan 06: GATE-03 — judging the command string in main Summary

**A pure four-shape command judge (`commandShape.ts`) wired into `hooks.ts`'s PreToolUse block ahead of the path gate, with BOTH judging arms re-keyed off Claude's tool name onto a `commandOf(ti)` that accepts a string or a codex argv array — proven by a real shim child process on win32.**

## Performance

- **Duration:** ~39 min
- **Started:** 2026-08-25T14:38:00Z (approx; first commit 20:15:51 +0530)
- **Completed:** 2026-08-25T15:05:48Z (2026-08-25 20:35:48 +0530)
- **Tasks:** 3 of 3
- **Files created:** 3 · **Files modified:** 2

## Accomplishments

- **Four shapes judged on tokens, in main, on every hook-bridged engine.** `rm` + any recursive flag, `git push` + force, a downloader piped into an interpreter, and a host outside the allowlist. Every benign form asserted null in the same case.
- **The gate stopped being Claude-only, in BOTH directions.** `grep -c "p.tool_name === 'Bash'" src/main/hooks.ts` is now **0**. Before this plan, `protectedPathDenial` collected targets from a command string only when the tool was literally named `Bash`, so `mv <hive>/bin/... /tmp` was **allowed** on codex, grok, pi, opencode, kimi and agy. That is asserted behaviourally, not by grep: a `tool_name: 'shell'` payload naming `<hive>/bin/evil.cjs` is denied, and a `<hive>/scratch/` payload under the same tool name still allows.
- **`tool_input.command` is accepted as an argv array**, proven end to end through a real shim child process with `['bash','-lc','rm -rf ./x']` and a `['bash','-lc','ls -la']` control.
- **`restore` is the fifth protected literal**, landed in the same wave plan 04-09 creates the store, with the prose count moved from four to five and both directions tested.
- **The deny is now legible.** `emitControl` carries the raw command, so `BlockReason.command` — a field the renderer store has always had and `BlockedBanner` has always rendered, which nothing ever set — can be populated by plan 04-14.
- **A ceiling list that names 13 new gaps** (j)-(v) and restates D-07's two inherited holes, rather than reading as a guarantee it does not give.

## Task Commits

1. **Task 1 (RED): the failing judge test** — `e4beb36` (test)
2. **Task 1 (GREEN): commandShape.ts** — `92240df` (feat)
3. **Task 2: wire it into hooks.ts, widen both arms, extend the ceiling** — `8468132` (feat)
4. **Task 3: the real-shim roundtrip** — `6ec95b6` (test)
5. **Ceiling countability fix** — `2c2a3ce` (docs)

## Gate results (all measured this session, at `2c2a3ce`)

| Gate | Result |
|---|---|
| `npm test` | **907 tests, 900 pass, 0 fail, 7 skipped**, 23.2 s |
| baseline at `99b61fc` | 885 / 878 / 0 / **7** |
| test delta | **+22** (17 in `command-shape.test.cjs`, 5 in `gate03-roundtrip.test.cjs`) |
| **skipped delta** | **ZERO — still 7.** Nothing was platform-gated, so `test/suite-integrity.test.cjs` and `01-VALIDATION.md` are both **untouched** (`git diff --stat` on both: empty) |
| `npm run typecheck` | 0 errors, both projects |
| `npm run lint` | exit 0 |
| `node --test test/gate03-roundtrip.test.cjs` | **pass 5 / skipped 0**, five real shim round trips in **836 ms**, file `duration_ms 1585` — the ≤10 s budget holds with 6x headroom |
| `node --test test/suite-integrity.test.cjs` | 4/4 green, `DECLARED_SKIPS` and `FROZEN` unchanged |

### The RED runs (recorded, per the plan)

- **Task 1 RED:** `node --test test/command-shape.test.cjs` → `pass 0 / fail 1`, ENOENT on `src/main/commandShape.ts`. Committed as `e4beb36` before a line of the module existed.
- **Task 3 had no producible RED** — by the plan's own ordering its subject (the judge and its wiring) landed in tasks 1-2, and the fail-fast rule says a test that passes in the RED phase must be investigated rather than waved through. It was investigated: the cause is plan ordering, not a pre-existing feature. **Substituted with two mutation runs**, both restored afterwards with `git checkout -- src/main/hooks.ts`:
  - disabling the shape arm (`if (false && shapeCmd)`) → `gate03-roundtrip` drops to **pass 2 / fail 3**; the positive control and the budget case correctly survive.
  - re-narrowing the path arm to `p.tool_name === 'Bash' && cmd` → `command-shape.test.cjs` drops to **pass 16 / fail 1**, and the failing case is exactly *"path protection reaches a NON-CLAUDE payload"*.

  Those two runs are what "this test would have been RED" actually means here, and they are reported instead of a RED that could not honestly be produced.

## Files Created/Modified

- `src/main/commandShape.ts` (**new**, 351 lines) — `commandShapeDenial`, `ShapeVerdict`, `DEFAULT_HOST_ALLOWLIST` (31 hosts, marked `[ASSUMED]` on a non-`*` line), `HOST_ALLOWLIST_KEY`. Electron-free (`grep -c "from 'electron'"` → 0) and syscall-free.
- `src/main/hooks.ts` — the shape arm at `:1607` (before the path call at `:1643`), `private commandOf`, the widened path-arm entry condition, `DENY_RESTORE` + the fifth literal, `emitControl`'s `command` argument, two optional trailing constructor args, ceiling items (j)-(v).
- `src/main/config.ts` — `hostAllowlist?: string[]`, defaulted to `DEFAULT_HOST_ALLOWLIST`, with the "emptying it is a decision, deleting the key is not" rule written on the field.
- `test/command-shape.test.cjs` (**new**, 17 cases) — the pure judge in both directions, plus four call-site cases driven through a real `HookServer.handle`.
- `test/gate03-roundtrip.test.cjs` (**new**, 5 cases) — the real shim as a child process, no platform gate, no `skip`, no `existsSync`.

## Decisions Made

Beyond the plan's own `<planner_decisions>` (all honoured):

1. **The host arm judges a DOWNLOADER's arguments only — both halves, not just the scheme-less one.** The plan scoped only the scheme-less half and kept "every scheme-ful token" from RESEARCH's table. That was implemented first and it **denied `cat > README.md <<'EOF' … EOF`**, because this repo's README links to ten hosts in ordinary prose. The plan's own reasoning for scoping the scheme-less half ("the false-positive storm that gets a gate turned off") applies verbatim to a URL inside a file being written. Ceiling item (p) now carries the wider scope and names `git clone` / `npm` / `pip` against an unlisted host as unreached.
2. **A here-doc body is cut off before judging.** Ceiling item (m) has always said this gate cannot see into a here-doc body; the first implementation nevertheless *judged* it, and this repo's README contains the line ``` `rm -rf`, reading credential files ``` — so writing the file that documents the gate was refused by the gate. The cut makes the stated ceiling true and moves the error into the direction a false positive does not cost an overnight run.
3. **A single-label host is not judged.** `http://a/b` and `http://internal/x` name nothing on the public internet without a search domain or a hosts entry, and `test/net-binding.test.cjs`'s false-positive sweep pins `curl http://a/b -c:v 9:30 a:b` as ordinary work that must stay ALLOW — a file this plan is forbidden to diff.
4. **The `openAsk` seam is declared and deliberately unwired.** An `ask` with no handler is answered as a deny carrying the same reason. Plan 04-15 supplies the handler, plan 04-20 wires it at the composition root and re-checks these shapes; `git diff --stat src/main/floor/boot.ts` is empty here.
5. **`src/preload/index.ts` was NOT touched.** `emitControl`'s payload gains `command`; the preload's `onApprovalRequest` callback type declares a subset and is structurally satisfied. Widening that type is plan 04-14's half (the renderer), and it is not this plan's file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The host arm refused ordinary file writes**
- **Found during:** Task 2 (full-suite gate)
- **Issue:** Judging every scheme-ful token anywhere in the command meant `cat > README.md <<'EOF' … EOF` was refused, because the README's prose links to ten hosts. `test/net-binding.test.cjs:842` ("the ordinary work this gate runs in front of is untouched") caught it. A gate that refuses writing a file that mentions a URL is an outage.
- **Fix:** The whole host arm is scoped to a downloader's first non-flag argument. Reasoning written beside the arm and into ceiling item (p).
- **Files modified:** `src/main/commandShape.ts`, `src/main/hooks.ts` (item (p))
- **Verification:** `npm test` — the net-binding control passes; `test/command-shape.test.cjs` still asserts both directions of the host arm through `curl`.
- **Committed in:** `8468132`

**2. [Rule 1 - Bug] A here-doc body was judged as a command**
- **Found during:** Task 2 (same gate, after fix 1)
- **Issue:** The README heredoc was STILL refused: the README contains the line ``` `rm -rf`, reading credential files ```, and the segmenter splits on newline, so that prose line became a segment headed by `rm` with a recursive flag. Ceiling item (m) already claimed here-doc bodies were unreachable; the implementation contradicted its own ceiling.
- **Fix:** `withoutHeredocBody()` cuts everything after the introducer's newline, and every arm judges the cut string (the caller's expanded tokens are re-derived from it only in that case).
- **Files modified:** `src/main/commandShape.ts`
- **Verification:** `npm test` 0 fail; a dedicated case in `test/command-shape.test.cjs` pins the body-vs-command distinction in both directions.
- **Committed in:** `8468132`

**3. [Rule 1 - Bug] A single-label host was judged**
- **Found during:** Task 2 (full-suite gate)
- **Issue:** `test/net-binding.test.cjs:480`'s negative control `curl http://a/b -c:v 9:30 a:b` — asserted ALLOW as a false-positive sweep for the FRAMING predicate — was denied, because `http://a/b`'s hostname `a` is not on the allowlist. That file is one this plan may not diff.
- **Fix:** `hostOf` returns null for a host with neither a dot nor a colon. Recorded in ceiling item (p).
- **Files modified:** `src/main/commandShape.ts`, `src/main/hooks.ts` (item (p))
- **Verification:** `npm test` 0 fail; a case asserts `curl http://a.example/b` still asks, so the narrowing is not a judge that gave up.
- **Committed in:** `8468132`

### Plan-defect corrections (criteria that could not pass on correct code)

**4. `grep -c "emitControl('control:approvalRequest', agentId, tool, reason, command"` → measured `0`, and it is unsatisfiable.**
`emitControl` has never taken a channel argument — the channel literal lives in its body (`this.getWebContents()?.send('control:approvalRequest', …)`). The criterion merged the channel into the call signature, so no sensible implementation can match it. The criterion's stated INTENT — "the four-argument shape is asserted by command rather than by reading" — is met and re-measured with an equivalent that does bite:
- `grep -c 'emitControl(' src/main/hooks.ts` → **4** (declaration + 3 call sites; HEAD was 3) ✅ the plan's own paired half.
- `grep -cE "this\.emitControl\(agentId, p\.tool_name, [a-zA-Z.]+(\.reason)?, " src/main/hooks.ts` → **2** — both PreToolUse deny arms pass a fourth argument.
- Behavioural half (stronger than either grep): a test asserts the `control:approvalRequest` payload's `command` is exactly `rm -rf ./x`.

**5. `grep -c "from './config'" src/main/hooks.ts` → `1`, and it was `1` at HEAD too.**
`hooks.ts` has always carried `import type { HarnessConfig } from './config';` for its `getConfig` constructor argument. The criterion's intent — the allowlist arrives injected rather than imported — holds: `hostAllowlist` is a constructor getter, and nothing in `hooks.ts` reads `config.ts` at runtime. Removing a pre-existing type-only import would be an unrelated refactor of a file this plan is told not to reorder. **Not fixed, reported.**

**6. Line citations in the plan were stale and were re-measured, as the plan itself instructs.**
`boundDeny` is at `:498`, not `:467` (`:466` is `HOOK_LINE_MAX`); `protectedPathDenial` spans `:891-994` at HEAD, not `:860-985`; the PreToolUse block began at `:1429`, not `:1364`. `commandOf` is declared immediately above `protectedPathDenial` (a `private` method cannot live beside a module-level `const`), and it cites `boundDeny`'s "so the exits cannot drift apart" reason in its own header.

**7. `<success_criteria>` line "An empty host allowlist ASKS and names the config key" contradicts D-05, `<planner_decisions>` and task 1's acceptance criteria, which all require a DENY.** Implemented as **deny** — the majority reading, the one with the written rationale, and the only one that keeps `kind:'deny'` a live verdict with a real producer.

---

**Total deviations:** 3 auto-fixed (all Rule 1 — false positives that would have been outages), 4 plan-defect corrections reported.
**Impact on plan:** No scope creep. Every auto-fix narrows a gate that was refusing ordinary work; each is paired with a test asserting the gate still fires on the real shape. Three of the four plan defects are measurement errors in acceptance criteria, not in the design.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: narrowed-mitigation | `src/main/commandShape.ts` | **T-04-NET-01's mitigation is narrower than the plan's register describes.** The host arm judges a downloader's own argument only, skips single-label hosts, and does not read here-doc bodies. `git clone https://evil.example/x`, `npm --registry https://evil.example`, `nc`, `ssh`, and a `node -e` fetch are **not** reached. This is written into ceiling item (p) and item (t)'s neighbourhood, and it is a real reduction in coverage relative to "every scheme-ful token", adopted because the wider form denied ordinary work (measured, twice). Plan 04-19 should carry the narrower wording into SECURITY.md rather than the register's. |
| threat_flag: config-writable | `src/main/config.ts` | `hostAllowlist` lives in `userData/config.json`, which agents can write (GATE-02 keeps `APPDATA`/`USERPROFILE` on the env allowlist). An agent can append its own host and defeat the arm without a restart. ACCEPTED and inherited — ceiling item (q), owner: the hive maintainer. |

## Known Stubs

**One declared seam, plan-assigned, not a stub of convenience:**

- `HookServer`'s `openAsk` constructor argument is declared and never supplied in this plan (`grep` will show no producer). That is the plan's explicit instruction — *"this plan declares the seam and nothing more"*, S-1 and the wave-4 ownership of `hooks.ts` both forbid building the ask branch here. Until plan 04-20 wires it, an `ask` verdict is answered as a **hard deny with no operator recourse**, which is stated in ceiling item (u), in the module header, in the constructor comment, and in `gate03-roundtrip.test.cjs`'s file header and test titles.
- `hostAllowlist`'s getter is likewise unwired at the production composition root (`src/main/floor/boot.ts` is plan 04-20's file in wave 5; `git diff --stat` on it is empty here). Until then the arm reads the non-empty `DEFAULT_HOST_ALLOWLIST`, which is the correct rather than the over-restrictive answer.

No placeholder data, no hardcoded empties reaching a UI, no TODO/FIXME added.

## Issues Encountered

- **Worktree base correction.** The worktree opened at `95f1cb8` (a merge of `gsd/v1.0-floor-closure`), whose merge-base with the assigned base `99b61fc` was `5ee846e` — i.e. wave 1's work was absent. HEAD was on `worktree-agent-a5d2d6a947122b333` (asserted before any reset; not a protected ref), the tree was clean, and it was `git reset --hard` onto `99b61fc` per the branch-check protocol.
- **The full suite is the only gate that catches this gate's false positives.** Both Rule-1 bugs were invisible to `test/command-shape.test.cjs` and to `node --test` on the touched files; only `npm test` found them, both in `test/net-binding.test.cjs`'s own false-positive controls. Those controls are the most valuable tests in this area and should not be weakened by a later plan.

## Verification against the plan's `<success_criteria>`

| Criterion | Result |
|---|---|
| four shapes judged on tokens, kinds match `<planner_decisions>` | ✅ asserted individually; 4 ask, 1 deny |
| BOTH arms key on a command string; `grep -c "p.tool_name === 'Bash'"` → 0 | ✅ 0, plus the behavioural `tool_name: 'shell'` case |
| string OR argv array, proven through a real child process | ✅ `gate03-roundtrip` case 4, both directions |
| `rm` + any recursive flag asks; the reason names no bypass | ✅ asserted against `/rm\s+(?!-)/` and `without` |
| shape judge before `protectedPathDenial`, textually and behaviourally | ✅ call `:1607` < call `:1643`, one `this.protectedPathDenial(`; `curl \| sh` denies through the real shim |
| a scheme-less host is judged, both directions | ✅ `curl evil.example/x` asks, `curl registry.npmjs.org/x` null |
| empty allowlist names the key; absent getter takes the default; `[ASSUMED]` carried | ✅ **deny**, not ask (see deviation 7); `grep -v '^\s*\*' \| grep -c ASSUMED` → 1 |
| `restore` is the fifth literal and the prose count moved | ✅ `grep -ci 'five'` → 3, `grep -ci 'four protected'` → 0 over the `awk` range |
| ceiling gains (j)-(v), 13 by symbol; (a)-(i) still 9 | ✅ 13 / 9 |
| `emitControl` carries the command | ✅ 4 call/decl sites, both deny arms pass it, asserted behaviourally |
| two optional trailing constructor args, no call site moved | ✅ all six named test files pass with **no diff** |
| SUMMARY states RED runs, test delta, skipped unchanged at 7 | ✅ above |

## Next Phase Readiness

- **Plan 04-09** can create `<hive>/restore/` knowing it is protected from every engine that sends a command string, not only from Claude.
- **Plan 04-10** owns GATE-03's cross-engine `LIVE-UNVERIFIED` markers. Its honest claim should read: judged for **claude** (measured) and for any engine sending `tool_input.command` as a string or argv array; **unmeasured** for grok, pi, opencode, kimi, agy (ceiling item (s)).
- **Plan 04-13 task 4** must record whether a host denial interfered with its live codex run — the wave-2-to-5 hard-deny window is live from this commit, and it now also covers `rm -rf node_modules`.
- **Plan 04-14** can populate `BlockReason.command` — main sets it on `control:approvalRequest`; the preload's `onApprovalRequest` type needs the field added there.
- **Plan 04-15** inherits the binding decision: `ControlRegistry.toolDecision` keeps `{deny, reason}`; `ask` is a `commandShapeDenial` verdict kind. `openAsk`'s signature is already declared.
- **Plan 04-19** should copy the NARROWER host-arm wording (see Threat Flags) into SECURITY.md, not the register's.
- **Plan 04-20** wires `hostAllowlist` and `openAsk` at `boot.ts` and must re-check that a denied host comes back as an ask rather than the bare deny it is today.

## Self-Check: PASSED

All four created files exist on disk (`src/main/commandShape.ts`, `test/command-shape.test.cjs`,
`test/gate03-roundtrip.test.cjs`, this SUMMARY) and all five task commits plus this metadata commit
are in `git log`: `e4beb36`, `92240df`, `8468132`, `6ec95b6`, `2c2a3ce`, `0dc15b3`. Working tree clean.
`STATE.md` and `ROADMAP.md` were not modified — the orchestrator owns those writes.

---
*Phase: 04-overnight-on-a-repo-that-matters*
*Completed: 2026-08-25*
