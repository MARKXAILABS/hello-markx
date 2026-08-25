---
phase: 04-overnight-on-a-repo-that-matters
plan: 13
subsystem: agent-spawn / sandbox
tags: [GATE-04, sandbox, codex, L-08, live-unverified]
requires: ["04-01", "04-10"]
provides:
  - "codex preset sandbox variant (sandboxFlags / sandboxDirFlag)"
  - "sandboxFlagsForProvider() — single author of the sandbox flag text"
  - "sandboxCapableProviders() — the derived supported-engine list"
  - "providerSandbox config key (main + renderer)"
  - "test/spawn-command-parity.test.cjs — the one test that calls both assemblers"
  - "LIVE GATE-03 REFUSAL: no  (read by plan 04-19 task 2's pin)"
  - "LIVE VIGIL-03 BLOCKED: no (read by plan 04-19 task 2's pin)"
affects:
  - "04-19 (SECURITY.md wording must match the two machine-readable lines above)"
  - "04-06 (ceiling item (s): codex PreToolUse payload shape remains UNMEASURED)"
tech-stack:
  added: []
  patterns:
    - "per-agent, path-valued preset flag — the first in agentProvider.ts"
    - "one shared flag-text author called from two independent assemblers (L-08)"
key-files:
  created:
    - test/spawn-command-parity.test.cjs
  modified:
    - src/shared/agentProvider.ts
    - src/main/config.ts
    - src/renderer/src/store/config.ts
    - src/renderer/src/components/SettingsModal.tsx
    - src/renderer/src/components/AddAgentModal.tsx
    - test/agent-provider.test.cjs
    - test/repo-claims.test.cjs
    - test/engine-parity.test.cjs
decisions:
  - "D-14 implemented as writable roots: -s workspace-write --add-dir <agentDir>, never dropping the sandbox"
  - "D-15 honoured: exactly one engine, opt-in, default off, fallback pinned to a captured baseline"
  - "GATE-04 ships LIVE-UNVERIFIED citing openai/codex#23552 — codex auth is dead on this machine"
  - "LIVE_UNVERIFIED_ENGINES deliberately NOT extended with codex: it is a bridge ledger, and codex's bridge is not the unverified thing"
metrics:
  tasks: 4
  commits: 6
  tests_before: "970 total / 963 pass / 0 fail / 7 skipped"
  tests_after: "975 total / 968 pass / 0 fail / 7 skipped"
  completed: 2026-08-25
---

# Phase 04 Plan 13: GATE-04 — one engine's sandbox on, and the argv that proves it

Codex gains a per-agent writable root (`-s workspace-write --add-dir <agentDir>`) behind an
opt-in that defaults off, spliced identically at both independent command assemblers and
proven by one test that calls both — but the live claim is **not** made: codex auth on this
machine is revoked, so the run that would have earned it never happened.

---

## THE THREE MACHINE-READABLE LINES

```
LIVE GATE-03 REFUSAL: no
```

```
LIVE VIGIL-03 BLOCKED: no
```

**Read the sense of both `no`s carefully.** They record that **no live observation was
obtained**, because no live agent ever started. Neither records that a live agent attempted a
denied shape and sailed through, nor that the floor watched an agent sit on a prompt and failed
to mark it `blocked`. Those experiments did not run. This is *absence of evidence about live
behaviour*, not *evidence of absent enforcement* — and nothing downstream (SECURITY.md
included) may be upgraded **or** downgraded on the strength of it beyond "unmeasured".

---

## Handoff 1 — GATE-04 live verification: ATTEMPTED, BLOCKED, fallback shipped

**Outcome: codex auth is still dead. The operator had not run `codex login`.**

`codex login status` still reports `Logged in using ChatGPT` — and, exactly as 04-01 found, it
lies: it reads the on-disk auth record without exercising it. Two live probes in this session:

| # | What ran | Result |
|---|----------|--------|
| 1 | Bare auth probe — `codex exec … "reply with the single word: pong"` | exit 1, **35** auth-failure lines |
| 2 | The spike's **Run A re-run, argv verbatim** | exit 1, **29** auth-failure lines, `agents/a1` still empty |

The error, verbatim and unchanged from the spike ~90 minutes earlier:

```
ERROR: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
```
```
"code": "refresh_token_reused"
```

No `OPENAI_API_KEY` / `CODEX_API_KEY` exists in this environment (measured: `env | grep -ci` → `0`),
so `codex login --with-api-key` is unavailable and the only route is an operator browser sign-in.

**What Run A DID independently reproduce** — the flag-plumbing premise, from codex's own banner:

```
sandbox: workspace-write [workdir, /tmp, C:\Users\Alienware\AppData\Local\Temp\codex-spike-13\agents\a1, C:\Users\Alienware\.codex\memories]
```

The sibling agent dir **is admitted** into the writable-root set on codex-cli 0.128.0/win32.
That is the *configuration* layer, and it now holds in two independent sessions. **Enforcement
remains unmeasured**: no model turn, no shell tool call, no write attempted.

**Spike verdict beside this run's outcome, as the plan requires:**

| | Verdict | Scope | What it licenses |
|---|---------|-------|------------------|
| 04-01 spike (`codex exec`) | **INCONCLUSIVE** | writable-root list only; auth died pre-model-turn | BUILD, never CLAIM |
| **This plan, task 4 (interactive)** | **DID NOT RUN** — auth dead | — | nothing |

**The claim rests on neither**, and GATE-04 therefore ships **built + `LIVE-UNVERIFIED`**, citing
[openai/codex#23552](https://github.com/openai/codex/issues/23552) (OPEN — *"workspace-write
writable_roots still prompts for approval on listed Windows directories"*), **neither reproduced
nor ruled out**. Criterion 2's sandbox clause is **not ticked**. This is the plan's own prescribed
fallback, not a failure of it.

## Handoff 2 — the live GATE-03 refusal: NOT OBTAINED, and 04-10's claim corrected downward

04-10 wrote `NO LIVE AGENT HAS BEEN OBSERVED REFUSED YET`, named this plan as owner, and left an
explicit correction path for a `no`. It is a `no`, for the single reason above: the phase's only
live non-Claude agent is codex, and codex cannot authenticate, so **no agent ran and therefore no
agent was refused**. Every rider (1–4) rode on that same agent and fell with it.

The correction was made **in the same commit as the finding** (`20392bd`), in
`test/engine-parity.test.cjs` — which is in this plan's `files_modified` for exactly this, so the
edit is legal rather than a D-35 violation. `git diff --stat test/engine-parity.test.cjs` shows
**the claim comment only** (+32/−5), no assertion touched, 52/52 still green.

The corrected comment now (a) states the measurement is **closed, not pending**, (b) names the
auth wall and both probes, and (c) spells out which *kind* of `no` it is, so a later reader cannot
mistake an unrun experiment for a failed enforcement test.

## Handoff 3 — the stale `hiveProvisioning.ts` comment: RE-MEASURED, and it IS too strong

The comment (now at **`src/main/hiveProvisioning.ts:230-231`**, not `:207` — line numbers moved
when waves 1–3 merged) reads: *"hooks fire in INTERACTIVE codex sessions (how hive workers run),
not in headless `codex exec`."*

Re-measured in **this** session rather than inherited from either 04-01 or the comment. From my
own `codex exec` probe's stderr:

```
      3 hook: SessionStart
      2 hook: SessionStart Completed
      1 hook: SessionStart Failed
      1 hook: UserPromptSubmit
      1 hook: UserPromptSubmit Completed
```

**Finding: "codex exec fires no hooks at all" is measurably false** — `SessionStart` and
`UserPromptSubmit` both fire in headless `codex exec`. This independently reproduces 04-01's
incidental observation.

**But the comment is not simply wrong, and the correction must not overshoot.** `PreToolUse` —
the hook GATE-03 actually depends on — showed **0 occurrences**, and that is *not* evidence it
does not fire: no model turn ever happened, so no tool call was ever made, so `PreToolUse` had
nothing to fire for. The honest state is: **session-lifecycle hooks fire in `codex exec`;
`PreToolUse` in `codex exec` remains unmeasured.**

**Not fixed here** — `src/main/hiveProvisioning.ts` is not in this plan's `files_modified` and has
no wave-4 owner (it belonged to plans 04-04/04-09 in waves 1–2). Same call 04-01 made. Recorded
for whoever owns it next; the correct rewrite is the two-clause sentence above, not a flat
negation.

## Handoff 4 (rider 4) — codex's PreToolUse payload shape: UNMEASURED

Tool name, command key, and JSON type of the command value are **all unobserved**. The spike page
already says `CODEX SHELL TOOL NAME: unobserved` and directs plan 04-10 to take it from this
plan's task 4 — which could not run. **The residual stands**, and it belongs to plan 04-06's
ceiling item (s), unchanged. No guess is recorded in its place.

Mitigating, and unchanged by this: 04-06's `commandOf` already accepts a `command` **string or an
argv array**, so a string/array answer needs no code either way. The open risk is a different
**key**, which stays open.

**Host-denial interference:** none. No agent ran, so no host verdict was ever reached.

---

## Tasks and commits

| Task | Gate | Commit | What |
|------|------|--------|------|
| 1 | RED | `a8b95dc` | 3 failing preset assertions (`sandboxFlags` undefined, both helpers absent) |
| 1 | GREEN | `2af8889` | codex sandbox variant + `sandboxFlagsForProvider` + `sandboxCapableProviders` |
| 2 | RED | `f29b521` | the one case calling BOTH assemblers — 3 tests, 1 pass, **2 fail** |
| 2 | GREEN | `7ac8805` | both splices + `providerSandbox` in both config types |
| 3 | — | `a7c76a8` | SANDBOX settings group, derived count, AddAgentModal label, the marker, ledger reconciled |
| 4 | — | `20392bd` | 04-10's claim corrected downward (the live run's finding) |

TDD gate sequence for tasks 1 and 2: `test(...)` → `feat(...)`, both RED states measured and
recorded in the commit bodies. No REFACTOR commit was needed.

## What was built

**Task 1 — the preset.** `sandboxFlags: '-s workspace-write'` and `sandboxDirFlag: '--add-dir'` on
the codex preset. Two static strings, so **no concrete path is baked into the preset** — a preset
carrying a path is wrong for every agent but one (T-04-SBX-07). `autoModeFlag` / `autoFlag` are
**untouched**: `grep -c 'dangerously-bypass-approvals-and-sandbox'` is **2 before and 2 after**.
The `:262-270` comment now states both halves (why the sandbox was dropped, and what `--add-dir`
makes possible) and cites the spike verdict.

**Task 2 — both splices, one author.** The flag *text* has a single author
(`sandboxFlagsForProvider`), called from `commandForAutoMode` and `buildSpawnCommand`. One author
is not the same as one result, which is why the test compares the two **live return values**:

- codex/opt-in-on → `codex -s workspace-write --add-dir <dir>`, and the blanket bypass is **gone**
- codex/opt-in-**absent** and codex/opt-in-**explicit-false** → both equal the captured baseline
- claude, grok, opencode with the opt-in on → byte-identical to baseline, **no** `--add-dir`
- auto-mode-off → `codex`, no sandbox flag
- opt-in-on with **no** agent dir → `codex -s workspace-write`, never a dangling `--add-dir`

**`npm run typecheck` passes 0 errors in both projects — and that proves nothing about the two
splices agreeing**, because `tsconfig.node.json` and `tsconfig.web.json` cannot see each other.
That is the entire reason `test/spawn-command-parity.test.cjs` exists.

**The captured baseline** was measured by *calling both functions at `0ab5346` before any edit*,
and committed as a fixture constant rather than re-derived:

```
codex   auto-on : codex --dangerously-bypass-approvals-and-sandbox
codex   auto-off: codex
claude  auto-on : claude --permission-mode bypassPermissions
grok    auto-on : grok --permission-mode bypassPermissions
opencode auto-on: opencode
```

**Task 3 — the UI.** SANDBOX group directly below Autonomy, one row per sandbox-capable engine
(exactly one today), rule S-4's three copy strings **verbatim** including the escape-hatch
sub-label. The "other ten engines" count is `AGENT_PROVIDER_PRESETS.length - sandboxEngines.length`
— **derived, asserted non-literal**. `AddAgentModal` gained a label branch only: no `PixelButton`,
no `<input>` (measured: 0 added), and it reads `providerSandbox` without ever writing it.

## Why `test/agent-provider.test.cjs` was NOT the home for the parity test

Structural, not stylistic. That harness `ts.transpileModule`s four `src/shared/*.ts` files into a
tmp dir with **no alias resolution and no electron stub**. `src/main/config.ts` imports `electron`
at line 1 and `src/renderer/src/store/config.ts` imports `@shared/…`, so **neither subject can
load there**. Co-opting it would have produced a test that passes because it never ran. It did get
the **preset-level** assertions, which is all it can reach. `test/load-ts.cjs` supplies both halves
(electron stub `:46-64`, `@shared/` resolver `:66-68`), so the new file is plain `node:test`.

## The marker ledger — re-measured, never arithmetic

Spike verdict was INCONCLUSIVE, so **one** `LIVE-UNVERIFIED` marker was added on the codex sandbox
path, naming openai/codex#23552 and what would settle it. All four pins reconciled with the file's
**own prescribed commands**, run live in this session:

```
$ grep -ro 'LIVE-UNVERIFIED' src/ | cut -d: -f1 | sort | uniq -c
      3 src/main/hive.ts
      5 src/main/hiveProvisioning.ts
      5 src/main/hiveTemplates.ts
      1 src/main/index.ts
      3 src/main/webhook.ts
      4 src/shared/agentProvider.ts      ← 3 → 4

$ grep -rc 'LIVE-UNVERIFIED' src --include=*.ts | grep -v ':0' | awk -F: '{s+=$2} END {print s}'
21                                        ← 20 → 21
```

| Pin | Before | After | Note |
|-----|--------|-------|------|
| `MARKER_LEDGER['src/shared/agentProvider.ts']` | 3 | **4** | re-measured |
| `LIVE_UNVERIFIED_TOTAL` | 20 | **21** | re-measured, not 20+1 |
| file set | 6 files | **unchanged** | no file gained/lost its first marker |
| `LIVE_UNVERIFIED_ENGINES` | — | **deliberately unchanged** | see below |

**Why the per-engine map was left alone, as a decision rather than an oversight.** It is a ledger
of **bridges** never live-verified; codex's *bridge* is not the unverified thing (codex is
installed, its hook bridge runs). Adding `codex` would conflate an unverified sandbox with an
unverified bridge — and it would pin almost nothing, because the floor would be met by
pre-existing blocks that merely cross-reference codex (kimi's says *"the CODEX case, not the grok
case"*). **Measured, not assumed: 6 blocks name codex with the new marker, 5 without.** The
repo-wide total is what holds the new marker in place. The reasoning is committed in the file.

## Known ceiling — the per-agent path is not yet threaded by any production caller

**Stated plainly because it bounds what shipped.** Both assemblers accept `agentDir` and splice it
correctly, and that is proven. **No production caller passes one yet**, so with the opt-in on today
a spawned codex agent would receive `codex -s workspace-write` — sandbox up, agent folder **not**
added — which is the pre-D-14 failure the whole plan exists to fix.

Why it stops here: the renderer's `buildSpawnCommand` is the real spawn path
(`useHive.ts:1089` → `tokenizeCommand`), and the renderer **has no hive-root knowledge** — the
agent dir is `<hiveRoot>/agents/<id>`, computed by `hive.ts`'s private `agentDir(id)` (`:588`),
and no preload IPC exposes it (checked). The one place the value exists at spawn time is
`hive.ts`'s `spawnAgentCore` (`dir`, the same value `env.AGENT_DIR` and `CODEX_HOME` come from at
`:1085`) — and **`src/main/hive.ts` is not in this plan's `files_modified`**. It is deliberately
scoped out: the plan's `read_first` cites `hive.ts:1017` yet the plan names only the two
`config.ts` splices, and D-35 makes the file list the scope.

The residual is **contained** rather than dangerous: the opt-in is **default off**, so no shipped
behaviour changes, and it is un-exercisable anyway while codex auth is dead — the live run that
would have caught it could not start. **A follow-up plan owning `hive.ts` must thread `dir` into
the command, and must do so through `sandboxFlagsForProvider` rather than assembling the flag a
third time**, or L-08 reappears with three assemblers instead of two. The no-dir path is pinned by
a test so it degrades to workspace-only and never to a dangling `--add-dir`.

## Deviations from Plan

**1. [Rule 1 — Bug] My own over-broad assertion in the AddAgentModal pin**
- **Found during:** Task 3
- **Issue:** I asserted `!/updateConfig/` on `AddAgentModal.tsx`. It failed — the file
  legitimately writes `registeredRepos` (`:286`, `:425`) and `agentTokenCaps` (`:433`). The
  assertion was a false claim about the file, not a real defect in it.
- **Fix:** narrowed to the actual invariant — it must never write `providerSandbox`, and it must
  **read** it (a positive bound beside the negative, D-33/D-40, so the negative is not vacuous).
- **Note:** the *test* was wrong here, not the source. No source behaviour was bent to make a test
  pass.
- **Commit:** `a7c76a8`

**2. [Rule 3 — Blocking] Plan cites `hiveProvisioning.ts:207`; the comment is at `:230-231`**
- Line numbers moved when waves 1–3 merged. Located by content (`grep 'INTERACTIVE codex'`), not
  by line number. Same class of drift the plan itself warns about for `--yolo` (Drift row 15).

**3. [Scope] `sandboxFlagsForProvider` / `sandboxCapableProviders` added to `agentProvider.ts`**
- The plan describes two independent splices. Both call one shared text author instead. This is
  **stricter** than the plan, not looser: it removes wording drift as a failure mode while leaving
  the two *results* independently computed — which is what the parity test measures. No third
  assembler was created.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change at a trust
boundary. The one security-relevant surface — `providerSandbox` as operator-editable security
config — is already in the plan's own register (ASVS V14) and **narrows** the sandbox boundary
when enabled.

## Verification

| Gate | Result |
|------|--------|
| `npm test` | **975 tests / 968 pass / 0 fail / 7 skipped** (baseline 970/963/0/7) |
| `npm run typecheck` | 0 errors, **both** projects |
| `npm run lint` | exit 0 (`--max-warnings 0`) |
| `node --test test/spawn-command-parity.test.cjs` | 3/3 |
| `node --test test/repo-claims.test.cjs` | 35/35 |
| `node --test test/engine-parity.test.cjs` | 52/52 |
| `node --test test/suite-integrity.test.cjs` | 4/4, `FROZEN` unchanged |
| `node test/agent-provider.test.cjs` | all pass |

**Test delta attribution: +5.** 3 from `spawn-command-parity.test.cjs`, 2 from `repo-claims.test.cjs`
(the two GATE-04 UI pins). The 3 new `agent-provider.test.cjs` cases run in that file's own
hand-rolled harness and do not register in the `node:test` census. **Skipped count unchanged at 7**;
the new file carries no `{ skip: … }` (`grep -c 'skip'` → 0).

**Live measurements in this session:** codex auth probe (35 auth failures), spike Run A re-run
(29 auth failures, banner captured, `agents/a1` empty), hook census from `codex exec` stderr,
marker ledger re-grep, `env` key check. Every number above came from a command run in this session.

## Self-Check: PASSED

- `test/spawn-command-parity.test.cjs` — FOUND
- `.planning/phases/04-overnight-on-a-repo-that-matters/04-13-SUMMARY.md` — FOUND
- Commits `a8b95dc`, `2af8889`, `f29b521`, `7ac8805`, `a7c76a8`, `20392bd` — all FOUND in `git log`
- `STATE.md` / `ROADMAP.md` — **not modified** (orchestrator owns those writes)
