---
phase: 04-overnight-on-a-repo-that-matters
plan: 10
subsystem: hive-bridges
tags: [gate-03, engine-parity, hooks, live-unverified, security]
requires:
  - "04-06: commandShapeDenial + commandOf, wired into hooks.ts's PreToolUse block"
  - "04-01: test/gate-harness.cjs (withHookServer + runShim's opts.shim selector)"
provides:
  - "PI_EXTENSION: request/response PreToolUse, HIVE_AUTO_APPROVE gated on main's verdict"
  - "OPENCODE_PLUGIN: a judgeable tool_input payload + the documented thrown veto"
  - "test/engine-parity.test.cjs: the GATE-03 block — 10 cases, and the honest claim in prose"
  - "MARKER_LEDGER: reconciled across all four pins, per-engine bound is now a COUNT"
affects:
  - "04-13 task 4 (wave 4): owns the live codex refusal AND the downward correction of the claim comment"
  - "04-16 (wave 5): owns hiveTemplates.ts :291-800 for GATE-05's poll loops — none added here"
  - "04-19 task 2 (wave 7): owns the honest-claim pin, when SECURITY.md first carries it"
tech-stack:
  added: []
  patterns:
    - "a shim constant driven as a real child process via runShim(ctx, payload, {shim})"
    - "an ESM plugin constant driven via dynamic import(pathToFileURL(...))"
    - "a CJS extension constant driven via require() against a stub host object"
    - "structural assertion over comment-stripped source, so a comment cannot satisfy it"
key-files:
  created: []
  modified:
    - "src/main/hiveTemplates.ts (:442-680 — PI_EXTENSION, OPENCODE_PLUGIN)"
    - "test/engine-parity.test.cjs (+10 cases, the honest claim, the GATE-03 block)"
    - "test/repo-claims.test.cjs (the four ledger pins)"
decisions:
  - "D-06's binding wording (\"refused for Codex and Grok (live-verified)\") was SUBSTITUTED, not met: grok is not installed and an xAI key is forbidden by the zero-recurring-cost rule."
  - "The live-codex-refusal clause was written as NOT YET OBSERVED. Plan 04-13 task 4 owns it in wave 4; asserting it here would have been the exact BL-11 inflation this plan exists to prevent."
  - "Tasks 1 and 3 share one commit because the plan's own truth requires the ledger reconciled in the SAME COMMIT as every marker added; any other order leaves a red commit."
  - "The planned ceiling — \"nothing in this repo executes OpenCode's payload builder\" — was measured FALSE and corrected upward: both bridges are executed against a real HookServer."
metrics:
  duration: "~50 min"
  completed: 2026-08-25
  tasks: 3
  commits: 3
  tests_added: 10
---

# Phase 04 Plan 10: GATE-03's Cross-Engine Reach Summary

pi honours a deny and OpenCode has a live veto — both driven against a real `HookServer` rather than
asserted from source — and the honest claim is written down narrower than the plan's own wording in the
one place the plan was wrong about the future.

## What Was Built

**Task 1 — pi's request/response and OpenCode's veto** (`src/main/hiveTemplates.ts`, commit `fc1ce86`,
RED gate at `515adbd`).

`PI_EXTENSION` gained `ask()`, a request/response sibling of `post()` used for **`PreToolUse` only** —
every other event keeps fire-and-forget, because waiting costs latency on a path with no verdict to wait
for. The `tool_call` handler now returns `{approve:false, reason}` on a deny, which makes the
`HIVE_AUTO_APPROVE === '1'` branch reachable **only past an allow**. Before this it ran unconditionally
and approved calls main had refused (T-04-CMD-07).

`OPENCODE_PLUGIN` changed in two ways that are **different kinds of statement**, and the markers keep
them apart:

- **A defect, fixed.** `tool.execute.before` posted `tool_name` and no `tool_input`. On the server,
  `protectedPathDenial` builds `ti` from `p.tool_input`, finds no `file_path`/`path`/`notebook_path` and
  no command, and returns null before resolving anything; `commandShapeDenial` needs a command string to
  enter at all. OpenCode's gate was not merely unverified — it was **inert**, answering allow on every
  call. It now sends `output.args`, which is where OpenCode's documented plugin API puts a tool's
  arguments (confirmed against their own docs, whose `.env`-protection example reads
  `output.args.filePath`).
- **An unverifiable mechanism.** The veto form used — `throw` from `tool.execute.before` — is the one
  OpenCode's docs demonstrate. Whether the plugin **auto-loads** and whether a throw is **honoured at
  runtime under Bun** cannot be settled without an installed OpenCode and a key.

Both preserve D-08 clause 3's connect-error fail-open **verbatim in behaviour**: no socket, connect
error, 5 s timeout and unparseable reply all resolve *allow*. `hooks.ts:44-53` records why — an agent PTY
outlives a quit, so a bridge that failed closed would stop every agent whenever the app is legitimately
not running.

**Task 2 — the translators, the shapes and the reach** (`test/engine-parity.test.cjs`, commit `0a91b6e`).
Ten GATE-03 cases, **zero skipped, on win32**:

| Case | What it drives | Direction |
|---|---|---|
| `OPENCODE_PLUGIN` structural | comment-stripped constant must carry a `tool_input:` **property** | + lower bound on the same stripped text |
| `PI_EXTENSION` structural | the verdict must be read **before** `AUTO` in the `tool_call` handler | order, not presence |
| fail-open guard | both constants keep `on('error'` | regression guard |
| pi executed | `require()`d extension vs a real `HookServer`, **with `HIVE_AUTO_APPROVE=1`** | deny + allow control |
| OpenCode executed | dynamically `import()`ed ESM plugin vs a real `HookServer` | throws + allow control |
| grok executed | real `GROK_HOOK_SHIM` as a child process via `runShim(..., {shim})` | deny + allow control |
| agy executed | real `AGY_HOOK_SHIM` as a child process | deny + **silence** on allow |
| codex-shaped | `command` **string** and **argv array**, `tool_name: 'shell'` | 2 denies + 2 benign controls |
| path arm | `cat >> <hive>/bin/cth-hook.cjs` on a non-`Bash` tool name | deny + `<hive>/scratch/` allows |
| reach | derived from the preset table | named exclusions |

**Task 3 — the marker ledger** (landed inside `fc1ce86`, see Deviations). All four pins reconciled.

## The Honest Claim

Verbatim, as it is written into `test/engine-parity.test.cjs` beside the assertions that support it:

> GATE-03 is refused **THROUGH THE REAL `HookServer`** for Claude-shaped and Codex-shaped `PreToolUse`
> payloads, driven by the real shim as a child process (`test/gate03-roundtrip.test.cjs` and
> `test/engine-parity.test.cjs`), in **BOTH command shapes** — a `command` string and an argv array —
> with a tool name that is not Claude's `Bash`. **NO LIVE AGENT HAS BEEN OBSERVED REFUSED YET:** plan
> 04-13 task 4 owns that measurement, in wave 4, and until it writes its machine-readable
> `LIVE GATE-03 REFUSAL: yes|no` line this claim must not say otherwise. Codex is the only one of
> criterion 1's four engines installed here (`codex-cli 0.128.0`).
>
> It is **BUILT for grok, kimi and agy**, and all three are **LIVE-UNVERIFIED** for want of an installed
> CLI and an account. grok's and agy's reply **translators** are each exercised through a real child
> process; kimi reuses `HOOK_SHIM` verbatim, which `test/gate03-roundtrip.test.cjs` drives. kimi's open
> question is unchanged: Moonshot documents a hook BLOCK as exit code 2, where this shim expresses a deny
> as stdout JSON at exit 0.
>
> For **pi and OpenCode** it is **BUILT**, and their bridge **LOGIC is executed** against a real
> `HookServer`: pi's `require()`d extension returns `{approve:false}` carrying main's own reason even
> with `HIVE_AUTO_APPROVE=1`, and OpenCode's dynamically imported ESM plugin throws its documented veto.
> Both remain **LIVE-UNVERIFIED** for the RUNTIME question, which no test here can settle — whether pi
> awaits an async return (A6), and whether OpenCode auto-loads the plugin and honours a thrown veto under
> Bun (A7). OpenCode was additionally **INERT AS SHIPPED**: it posted no `tool_input`, so main answered
> allow on every call. That was a **defect, fixed** in this plan, and it is not laundered into the marker
> as if it were an unverifiable.
>
> The **qwen and crush** proxy tiers have no tool-call boundary to gate at (`hooks.ts:60-62`) and are out
> of scope. **copilot** has no bridge at all.

**Where this differs from the plan's `<the_honest_claim>`, and why.** The plan's wording was written
before the work; three of its clauses were measured false during it, in both directions.

| Plan's clause | What was measured | Direction |
|---|---|---|
| "a live codex agent **had** a command refused on this machine (plan 04-13 task 4)" | **Plan 04-13 has not run.** It is wave 4; this is wave 3. Stating it as past tense here would be exactly the BL-11 inflation. Written as **not yet observed**, with 04-13 task 4 named as owner. | corrected **down** |
| "built and LIVE-UNVERIFIED for pi… built for OpenCode… nothing in this repo executes OpenCode's payload builder" | **False.** `PI_EXTENSION` is CJS (`require()` takes it) and `OPENCODE_PLUGIN` is ESM that Node's dynamic `import()` loads. Both are now executed against a real `HookServer`. `runShim` genuinely cannot drive them; that is not the same as nothing can. | corrected **up** |
| "built for agy and **exercised by no test at all**" | The plan itself offered the fix and required the claim to move with it: `runShim`'s `opts.shim` selector already existed for grok, so agy cost six lines. Now exercised. | corrected **up** |

**D-06's binding wording was substituted, and the substitution is stated rather than performed silently.**
D-06 bound this phase to *"refused for Codex and Grok (live-verified)"*. **grok is not installed on this
machine and an xAI key is a recurring cost PROJECT.md forbids.** No engine was installed to make a clause
tickable. "Verification needs an account we do not have" is the outcome, recorded as one.

**Criterion 1's OpenCode, grok and pi clauses are NOT ticked.**

**The pin for this claim lands in WAVE 7 — plan 04-19 task 2 owns it**, in the commit where SECURITY.md
first carries the claim and `test/repo-claims.test.cjs` is free in the same commit. A wave-3 pin over
SECURITY.md would be red for four waves; a wave-3 pin over the comment task 2 just wrote would be
self-certifying. **The correction path is open:** `test/engine-parity.test.cjs` is in plan 04-13's
`files_modified` for wave 4, so if 04-13 records `LIVE GATE-03 REFUSAL: no` the comment is corrected
downward in the same commit as the finding.

**D-03 stands and no criterion is green on it.** `AGENT_DENY_RULES` (`hiveProvisioning.ts:63`) is
untouched. It is the only rule surface that survives `--permission-mode bypassPermissions` inside
Claude's own process, so it fires before a hook round trip — real defence in depth — but it is written
into exactly **one** engine's settings file, and nothing in this plan is asserted on its behaviour.

## Reach: seven, and it is a measurement

`bridgeOf` plus the preset table gives **seven** engines main-side judging reaches, not four:

- **hook-bridged (6 shims, one preset each):** `codex`, `grok`, `kimi`, `antigravity` (agy), `pi`,
  `opencode`
- **plus Claude's native `--settings` PreToolUse path** (`hiveAware: true`, no `BridgeDescriptor`)
- **excluded, named individually:** `qwen` and `crush` (proxy tier — `hooks.ts:60-62` records they have
  **no tool-call boundary at all**, so there is nothing to gate at), `copilot` (no bridge)

**`kimi` and `antigravity` are two engines 04-CONTEXT.md never mentions.** The count is derived (one
engine per distinct shim, plus one) with named membership, so a preset change moves it rather than
leaving a stale literal — `grep -c '=== 7' test/engine-parity.test.cjs` returns `0`.

## The New Behaviour This Turns On

**Named, not left as a category.** Adding `tool_input` to OpenCode and a verdict read to pi makes
`commandShapeDenial` fire on both engines for the **first time**, and **four of its five shapes return
`{kind:'ask'}`** — which on a shim that cannot poll for an answer is answered as a **DENY**. So:

- every recursive `rm`
- every forced `git push`
- every `curl … | sh`
- every fetch to a host outside the 30-entry `[ASSUMED]` allowlist

becomes an **unconditional refusal with no path through**, on two engines nobody here can run to see it.
Safe direction, substantial new behaviour. Plan 04-15's GATE-05 ceiling item (a) carries the same sentence
for all four non-polling engines.

## Marker Ledger — Live Measurement, Never Arithmetic

Re-measured with the file's own prescribed command, in this session, in the **same commit** as the markers
(the plan's own truth, and the only ordering that leaves no red commit):

```
grep -ro 'LIVE-UNVERIFIED' src/ | cut -d: -f1 | sort | uniq -c
```

| File | Before | After |
|---|---|---|
| `src/main/hive.ts` | 3 | 3 |
| `src/main/hiveProvisioning.ts` | 5 | 5 |
| **`src/main/hiveTemplates.ts`** | **3** | **5** |
| `src/main/index.ts` | 1 | 1 |
| `src/main/webhook.ts` | 3 | 3 |
| `src/shared/agentProvider.ts` | 3 | 3 |
| **`LIVE_UNVERIFIED_TOTAL`** | **18** | **20** |

All four pins reconciled:

1. `MARKER_LEDGER` per-file counts — `hiveTemplates.ts` 3 → 5
2. `LIVE_UNVERIFIED_TOTAL` — 18 → 20
3. committed file set — **unchanged**, since no file gained its *first* marker
4. per-engine bound — **now a COUNT, not presence**: `{pi: 4, opencode: 5, crush: 1, qwen: 1, kimi: 5}`.
   `>= 1` could not see an engine unmarked in one place while a second, unrelated marker still named it.
   **Mutation-checked in session:** setting `pi: 5` went red with the intended message; restored.

No honest-claim clause was added to `test/repo-claims.test.cjs` — its diff touches the four ledger pins
and nothing else.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tasks 1 and 3 landed in one commit**
- **Found during:** Task 1
- **Issue:** The plan's own binding truth says `MARKER_LEDGER` is reconciled *"in the SAME COMMIT as every
  marker added"*, but tasks 1 and 3 are separate tasks with separate commits. Committing the two markers
  without the ledger leaves a commit at which `npm test` is **red** — and task 1's own `<verify>` block is
  `npm run typecheck && npm test`.
- **Fix:** `src/main/hiveTemplates.ts` and the four ledger pins committed together as `fc1ce86`. Task 3's
  work is present and complete; only its commit boundary moved.
- **Commit:** `fc1ce86`

**2. [Rule 2 - Missing verification on a security path] Both bridges are EXECUTED, not only read**
- **Found during:** Task 1
- **Issue:** The plan prescribed structural source assertions and stated a ceiling — *"`OPENCODE_PLUGIN`
  is ESM, so `runShim` cannot drive it… Nothing in this repo executes OpenCode's payload builder."* The
  first half is true; the conclusion is not. Node's dynamic `import()` loads the written plugin, and
  `PI_EXTENSION` is plain CJS that `require()` takes. Shipping a marker and a SUMMARY asserting a ceiling
  that a six-line test disproves is the mirror of over-claiming, and this plan exists to prevent both.
- **Fix:** two new cases execute the real constants against a real `HookServer` on a real socket — pi's
  deny is honoured **with `HIVE_AUTO_APPROVE=1` set** (T-04-CMD-07 driven rather than inferred), and
  OpenCode's plugin throws `hive: <main's own reason>`. The structural assertions were **kept**, because
  they catch what a round trip does not: a "fix" that is only a comment. Marker text and the honest claim
  were corrected in the same commits.
- **Files modified:** `src/main/hiveTemplates.ts`, `test/engine-parity.test.cjs`
- **Commits:** `fc1ce86`, `0a91b6e`

**3. [Rule 2 - Missing critical coverage] agy's translator is exercised**
- **Found during:** Task 2
- **Issue:** The honest claim would otherwise have had to read *"built for agy and exercised by no test at
  all"* — a translator on a security path with zero coverage, while the mechanism to cover it (`runShim`'s
  `opts.shim` selector) already existed for grok.
- **Fix:** an agy case, six lines. Its **allow control matters more than its deny**: agy treats any object
  on stdout as a decision and **fail-closes**, so a shim writing `{}` would deny every benign tool call on
  the floor. The honest claim was changed in the same commit, as the plan's task 2 explicitly required.
- **Commit:** `0a91b6e`

**4. [Rule 1 - Correctness of a claim] The live-codex clause was written as not-yet-observed**
- **Found during:** Task 3 / SUMMARY
- **Issue:** The plan's `<the_honest_claim>` states *"a live codex agent **had** a command refused on this
  machine (plan 04-13 task 4)"* in the past tense. Plan 04-13 is **wave 4**; this is wave 3. Copying that
  sentence verbatim would have asserted a measurement that has not been taken — precisely the round-1
  BL-11 failure the plan's own T-04-CMD-23 is about.
- **Fix:** the clause reads **NO LIVE AGENT HAS BEEN OBSERVED REFUSED YET**, names plan 04-13 task 4 as
  its owner, and names the `LIVE GATE-03 REFUSAL: yes|no` line as the artefact that will settle it.
- **Commit:** `0a91b6e`

### Constraints Honoured

- **04-01's ceiling respected.** `04-SPIKE-codex-sandbox.md` records `CODEX SHELL TOOL NAME: unobserved`
  because no tool call ever happened. **No shell tool name is cited from that page.** The codex-shaped
  cases use `'shell'` with an in-file comment stating the assertion is about the **entry condition** (a
  `tool_name` that is not `Bash`) and not about a spelling, and naming 04-13 task 4 as the measurement.
- **04-06's narrowing respected.** The command-shape judge's host arm was narrowed to a downloader's own
  argument, so `git clone https://evil.example/x` is **not** reached by that arm. The wider claim is not
  restated anywhere in this plan's output.
- **D-35 line ranges.** `git diff src/main/hiveTemplates.ts` hunks span `:442`–`:641`, inside this plan's
  `:291-800` window. `TASK_CLI` (`:24-290`) untouched.
- **D-36.** No `package.json` / `package-lock.json` edit, no install step, **no engine CLI installed** to
  make a clause tickable.
- **No poll loop added** — `grep -ciE 'ApprovalPoll|hive_ask' src/main/hiveTemplates.ts` → `0`. That is
  GATE-05's, plan 04-16, wave 5.
- **`src/main/hooks.ts` untouched** (plan 04-06's in wave 2, plan 04-15's in wave 4).
- **STATE.md and ROADMAP.md untouched** (orchestrator owns those writes).

## Inherited Fail-Opens, Restated Rather Than Silently Carried

- **T-04-CMD-11 / D-07 hole 2 — the shim's connect-error `exit(0)` is allow.** Deliberate and Deferred:
  an agent PTY outlives a quit, and a fail-closed shim would break every agent whenever the app is
  legitimately not running. `armSocketWatchdog` bounds the outage instead of removing it. Both new paths
  preserve this **verbatim in behaviour**.
- **T-04-CMD-12 / D-07 hole 1 — the user-global engine seeds sit outside the hive root.**
  `~/.codex/config.toml`, `~/.gemini/…/hooks.json` and `~/.grok/hooks/` are not reached by the PreToolUse
  path gate at all. Restated in plan 04-06's ceiling list; restated here.
- **T-04-CMD-10 — kimi may express BLOCK as exit code 2**, where `HOOK_SHIM` expresses a deny as stdout
  JSON at exit 0. Open, recorded at `hiveTemplates.ts:293-297`, unsettleable without a live kimi session.

## Measured Residual (new, from this plan)

**OpenCode's `read` tool names its target `output.args.filePath`**, while `protectedPathDenial` collects
`file_path` / `path` / `notebook_path`. So the **PATH arm still does not see an OpenCode file read**; the
command arm does, because OpenCode's `bash` tool uses `output.args.command`. This is plan 04-06's ceiling
item (s) — *an engine that uses a different KEY* — measured concretely for opencode, and it is recorded in
the plugin's own marker text rather than only here.

## Verification

All run live in this session on win32, Node v24:

| Gate | Command | Result |
|---|---|---|
| Full suite | `npm test` | **944 tests, 937 pass, 0 fail, 7 skipped** (baseline 934/927/0/7 — +10, skipped unchanged) |
| Plan's own files | `node --test test/engine-parity.test.cjs` | 52 pass, 0 fail, **0 skipped** |
| Ledger | `node --test test/repo-claims.test.cjs` | 33 pass, 0 fail |
| Types | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | exit 0 |
| Ledger match | `grep -ro 'LIVE-UNVERIFIED' src/ \| cut -d: -f1 \| sort \| uniq -c` | matches `MARKER_LEDGER` exactly |
| Fail-open | `grep -c "on('error'" src/main/hiveTemplates.ts` | **13** (was 10 — never lower) |
| Auto-approve | `grep -c 'HIVE_AUTO_APPROVE' src/main/hiveTemplates.ts` | **5** (≥ 1, branch gated on the verdict) |
| No poll | `grep -ciE 'ApprovalPoll\|hive_ask' src/main/hiveTemplates.ts` | **0** |
| No eval | `grep -ci 'eval(' test/engine-parity.test.cjs` | **0** |
| No magic 7 | `grep -c '=== 7' test/engine-parity.test.cjs` | **0** |
| Emitted shims | `node --check` on `PI_EXTENSION`, ESM `import()` on `OPENCODE_PLUGIN` | both load |

**Environment limits confirmed, not worked around:** codex auth is dead here
(`401 refresh_token_reused`) and gemini returns `IneligibleTierError`. Nothing was widened to make them
pass. grok, pi, opencode, crush, kimi, agy and qwen are all absent from this machine.

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired component was introduced.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change at a trust boundary was
introduced. The two shim changes are **narrowing** — they add a refusal path where allow was
unconditional — and both are covered by the existing register (T-04-CMD-07, T-04-CMD-24).

## Handoffs

| To | What |
|---|---|
| **04-13 task 4** (wave 4) | Owns the live codex refusal and the `LIVE GATE-03 REFUSAL: yes\|no` line. Also owns the **downward correction** of the claim comment in `test/engine-parity.test.cjs` if the refusal does not appear — that file is in its `files_modified` for exactly this. Rider 4's measurement of codex's real payload (name, **key**, JSON type) is what closes 04-06 ceiling item (s). |
| **04-15** (wave 4) | GATE-05 ceiling item (a) carries the same "four of five shapes ask → deny on a non-polling shim" sentence for all four non-polling engines. |
| **04-16** (wave 5) | Owns `hiveTemplates.ts:291-800` for the poll loops. `ask()` in both bridges is the natural seam; neither has a retry today, deliberately. |
| **04-19 task 2** (wave 7) | **Owns the honest-claim pin.** Writes whichever wording survives 04-13 into SECURITY.md and pins it in both directions in `test/repo-claims.test.cjs` — including the live-refusal sentence, which the previous draft's three positive phrases did not cover. |

## Self-Check: PASSED

- `.planning/phases/04-overnight-on-a-repo-that-matters/04-10-SUMMARY.md` — FOUND
- `src/main/hiveTemplates.ts` — FOUND (modified, hunks `:442`–`:641`)
- `test/engine-parity.test.cjs` — FOUND (modified, +10 cases)
- `test/repo-claims.test.cjs` — FOUND (modified, four ledger pins)
- `515adbd` — FOUND (`test(04-10)`: RED gate)
- `fc1ce86` — FOUND (`feat(04-10)`: GREEN gate + ledger)
- `0a91b6e` — FOUND (`test(04-10)`: translators, shapes, reach)

## TDD Gate Compliance

RED → GREEN observed for task 1 in the required order:

- **RED** `515adbd` `test(04-10)` — both structural cases failed with their intended messages
  (`OPENCODE_PLUGIN posts no tool_input property…` / `PI_EXTENSION never decodes main's permission
  verdict…`), captured in the run before the source changed.
- **GREEN** `fc1ce86` `feat(04-10)` — same cases pass, full suite 0 fail.
- **REFACTOR** — none needed, so none committed.

One honest note on the RED gate's extent: the **fail-open guard** case in `515adbd` was green from the
start. It is a regression guard, not a RED assertion, and it is labelled as one rather than counted toward
the gate. The two cases the gate rests on both failed first.
