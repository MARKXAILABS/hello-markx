---
phase: 04-overnight-on-a-repo-that-matters
plan: 01
subsystem: testing
tags: [codex-cli, sandbox, workspace-write, named-pipe, hook-shim, child-process, win32, node-test]

# Dependency graph
requires:
  - phase: 02-the-honesty-ledger
    provides: "02-12 at 8e85748 — MARKER_LEDGER at 18 markers and repo-claims green, the D-37 block on starting Phase 4"
  - phase: 01-finish-the-floor
    provides: "HookServer per-agent token auth, hive.sockPath(), the six shim constants in hiveTemplates.ts, test/load-ts.cjs"
provides:
  - "04-SPIKE-codex-sandbox.md — a single VERDICT: line plan 04-13 consumes without re-running anything, with two transcripts and a negative control"
  - "The measured fact that --add-dir IS admitted into codex 0.128.0's workspace-write writable-root set on win32 (banner differential), and that sandbox ENFORCEMENT remains unmeasured"
  - "The measured fact that codex auth on this machine is dead (401 refresh_token_reused) despite `codex login status` reporting a live ChatGPT session"
  - "test/gate-harness.cjs — withHookServer()/runShim(), a real shim child into a real HookServer, green on win32 named pipes"
  - "A shim-constant selector so any hiveTemplates.ts shim (grok, agy, proxy) can be driven through a real child process"
affects: [04-06 GATE-03 roundtrip, 04-16 GATE-05 bounded wait, 04-13 GATE-04 codex sandbox, 04-10 grok translator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ask hive.sockPath() for the socket value instead of hand-building it — the one line that makes a real-shim-child test run on win32"
    - "A test helper named *.cjs (not *.test.cjs) is invisible to `npm test`'s glob and to all three test-dir censuses, so it adds zero cases without touching package.json"
    - "A self-check must assert an authorization observable, never the shim's exit code: the shim fails open, so exit-code-only is vacuous"

key-files:
  created:
    - .planning/phases/04-overnight-on-a-repo-that-matters/04-SPIKE-codex-sandbox.md
    - test/gate-harness.cjs
  modified: []

key-decisions:
  - "The codex spike verdict is INCONCLUSIVE, not WORKS and not REFUSED — codex auth is revoked on this machine so neither run reached a model turn or attempted a write. Recorded with the exact stderr rather than inventing a result."
  - "Recorded the one thing the runs DID settle — the writable-root banner differential — as a configuration-layer fact explicitly separated from the enforcement question openai/codex#23552 is about."
  - "`-C <dir>` and `--skip-git-repo-check` were applied identically to Run A and Run B so the negative control stays symmetric; no approval- or sandbox-bypass flag was used anywhere."
  - "The harness uses hive.sockPath() rather than a hand-built socket path, which removes the only reason hook-auth-roundtrip.test.cjs is POSIX-gated. No platform gate exists in the new file."
  - "runShim looks the shim constant up by name against the hiveTemplates module rather than against a list in the harness, so a shim added later is selectable with no edit here."
  - "The self-check asserts server.transcriptPath() (HOOK_SHIM) and the hive:hookEvent renderer channel (GROK_HOOK_SHIM), after measuring that a tokenless shim also exits 0."

patterns-established:
  - "Fixture limitation vs platform limitation: before POSIX-gating a socket test, check whether the fixture hand-builds the path the app asks an API for"
  - "Negative control in a spike: Run B's job is to be able to invalidate Run A, and when both fail for the same upstream reason the pair carries no signal — say so rather than reading Run A alone"

requirements-completed: [GATE-04, GATE-03, GATE-05]

# Metrics
duration: 41min
completed: 2026-08-25
---

# Phase 04 Plan 01: Wave-0 spike and shared GATE harness Summary

**The codex `--add-dir` question could not be settled — codex auth on this machine is revoked, so the verdict is INCONCLUSIVE with the exact 401 recorded — but the writable-root banner differential was measured, and `test/gate-harness.cjs` now drives the real hook shim as a child process into a real HookServer over a real `\\.\pipe\` name, green on win32 with zero new test cases and zero platform gates.**

## Performance

- **Duration:** 41 min
- **Started:** 2026-08-25T14:11Z
- **Completed:** 2026-08-25T14:52Z
- **Tasks:** 2 of 2
- **Files created:** 2

## Re-measured baseline (standing constraint — never quoted)

`npm test` at the base commit `8749a2b`, run in this session before any edit:

```
tests 843
pass 836
fail 0
skipped 7
```

The plan's `<standing_constraints>` carried **805 / 798 / 0 / 7 at `ad3d2f7`**. The tree has moved since;
the number above is the live one and it is what the wave gate below is compared against.

## D-37 is resolved, not carried — and re-checked live

CONTEXT.md D-37 blocked Phase 4 on plan 02-12 being in flight. RESEARCH's Drift Report row 0 lifted it.
Rather than quote that, it was re-verified in this session:

| Claim | Source | Measured here |
|---|---|---|
| 02-12 merged at `8e85748` | RESEARCH Drift row 0 | `git merge-base --is-ancestor 8e85748 HEAD` → exit 0; subject is *"docs(02-12): complete the-honesty-ledger plan"* |
| `MARKER_LEDGER` matches reality at 18 markers | RESEARCH Drift row 0 | `MARKER_LEDGER` at `test/repo-claims.test.cjs:1290-1297` sums to 3+5+3+1+3+3 = **18**, and its clause asserts that against the tree |
| `node --test test/repo-claims.test.cjs` → 31/31 | RESEARCH Drift row 0 | **33/33, 0 fail** — the file has gained two cases since RESEARCH measured it. Green, but the count is not 31 any more |

**The block is lifted.** Phase 4 may proceed.

## Accomplishments

- **The one open question that changes what a later plan may claim now has a written answer on disk** —
  and the answer is honestly "not settled here", with the machine-level reason attached, rather than a
  fabricated verdict. `04-SPIKE-codex-sandbox.md` carries exactly one `VERDICT:` line for plan 04-13 to read.
- **A real, useful measurement fell out anyway.** codex 0.128.0's startup banner enumerates its
  writable-root set, and the A/B pair differs exactly as the flag intends — so the *plumbing* premise
  GATE-04 rests on (D-14's path-tree problem) is confirmed, while enforcement stays open.
- **`test/gate-harness.cjs` runs the loop, not a half of it, on the machine the phase actually runs on.**
  Real shim constant → real child process → real `\\.\pipe\` → real `HookServer` → real reply, both for
  `HOOK_SHIM` and `GROK_HOOK_SHIM`, with no platform gate anywhere in the file.

## Task Commits

1. **Task 1: Run the codex --add-dir spike and record the verdict** — `96ef151` (docs)
2. **Task 2: Extract the real-shim-child → real-HookServer harness** — `32e34df` (test)

## Files Created

- `.planning/phases/04-overnight-on-a-repo-that-matters/04-SPIKE-codex-sandbox.md` — the verdict page.
  `codex --version` and `codex login status` as run in this session, both transcripts with full argv, exit
  code, stderr and a stated `memory.md exists: no`, the scope bound, the `CODEX SHELL TOOL NAME:` line, and
  a single `VERDICT:` line.
- `test/gate-harness.cjs` — `withHookServer(opts, fn)` and `runShim(ctx, payload, opts)`. Not a
  `*.test.cjs` file, deliberately and by name.

## The spike, in one paragraph

Two probe directories under `%TEMP%` — a `proj` standing in for the operator's repo and a **sibling**
`agents/a1` standing in for `<harnessHome>/hive/agents/<id>/`, i.e. a different tree from cwd, which is the
actual shape of the GATE-04 problem. Run A: `codex exec --skip-git-repo-check -s workspace-write --add-dir
<agentDir> -C <proj> "<write ok into agentDir/memory.md>"`. Run B: identical minus `--add-dir`. Both exited
`1`. **Both died before any model turn**, with:

```
"message": "Your refresh token has already been used to generate a new access token. Please try signing in again.",
"code": "refresh_token_reused"
```

`codex login status` nevertheless reports *"Logged in using ChatGPT"* — it reads the on-disk auth record
without exercising it, which is why the plan's premise ("codex is installed and authenticated here") looked
true right up until a run was attempted. Neither run attempted a write, so `agents\a1` being empty
afterwards is uninformative: "empty because refused" and "empty because nothing ever ran" are
indistinguishable here. Hence INCONCLUSIVE.

What the pair **did** settle is the banner:

| Run | `--add-dir` | banner `sandbox:` |
|---|---|---|
| A | present | `workspace-write [workdir, /tmp, …\codex-spike-01\agents\a1, …\.codex\memories]` |
| B | absent | `workspace-write [workdir, /tmp, …\.codex\memories]` |

`--add-dir` is parsed, accepted for a path outside the workdir tree, and admitted into the writable-root
set, and the negative control confirms the dir is not in that set without it. That is not the enforcement
answer — openai/codex#23552's whole claim is that a directory which *appears* in `writable_roots` still
prompts on write — but it does retire the "does the flag even reach a non-cwd tree" half of the risk.

**openai/codex#23552 neither reproduced nor was ruled out.** It is a *prompt* defect; `codex exec` runs
`approval: never` and cannot prompt at all, so this run shape could not have reproduced it even with
working auth. That bound was in the plan and is written into the spike page above the verdict line, so
plan 04-13 reads it at the same moment it reads the result.

`CODEX SHELL TOOL NAME: unobserved` — not guessed. No tool call ever happened. Plan 04-10 must take the
name from plan 04-13 task 4 rider 4's live interactive transcript.

## The harness, in one paragraph

`withHookServer` builds an isolated `(userData, harnessHome)` tmp pair in the `boot-floor.test.cjs:71-85`
style, constructs a real `HiveManager` + `HookServer` through `test/load-ts.cjs`, calls `server.start()`,
mints a per-agent token, hands the callback
`{ sock, token, agentId, server, hive, harnessHome, userData, sent }` and tears everything down in a
`finally`. **`sock` is `hive.sockPath()`.** `runShim` writes a verbatim shim constant from
`hiveTemplates.ts` to a tmp `.cjs`, spawns `process.execPath` on it with `HIVE_SOCK` / `HIVE_SOCK_TOKEN` /
`AGENT_ID`, pipes `JSON.stringify(payload)` to its stdin — the shim builds the wire bytes, never the test
(Pitfall 2) — and resolves `{ code, stdout, stderr, elapsedMs }`. `opts.shim` names the constant, looked up
by name against the module so every shim there is selectable, `HOOK_SHIM` by default.

Self-check, on this machine:

```
$ node test/gate-harness.cjs
selfcheck ok — platform=win32 sock=\\.\pipe\hello-markx-09ac370bc5c0 HOOK_SHIM exit=0 (810ms) GROK_HOOK_SHIM exit=0 (330ms)
```

## Verification — every acceptance criterion, measured

| Check | Command | Result |
|---|---|---|
| One verdict line | `grep -c '^VERDICT: ' 04-SPIKE-codex-sandbox.md` | `1` |
| One shell-tool line | `grep -c '^CODEX SHELL TOOL NAME: ' …` | `1` |
| Issue named | `grep -c 'openai/codex#23552' …` | `6` |
| Task 1 touched no source | `git status --porcelain src/` | empty |
| Self-check green on win32 | `node test/gate-harness.cjs` | exit 0, prints `selfcheck ok` and the `\\.\pipe\` name |
| Both exports present | `node -e "…typeof h.withHookServer/h.runShim…"` | exit 0, `withHookServer,runShim` |
| Pitfall 3 | `grep -c 'existsSync' test/gate-harness.cjs` | `0` |
| Socket asked for | `grep -c 'sockPath' test/gate-harness.cjs` | `6` |
| Socket never hand-built | `grep -c 'hooks.sock' test/gate-harness.cjs` | `0` |
| Shim bytes from source | `grep -c 'HOOK_SHIM' test/gate-harness.cjs` | `11` |
| No platform gate | `grep -c 'skip' test/gate-harness.cjs` | `0` |
| Census + floor unchanged | `node --test test/suite-integrity.test.cjs` | 4/4 pass, 0 fail |
| Test-count delta | `npm test` | `843 / 836 pass / 0 fail / 7` — **identical to baseline, delta 0 on both counts** |
| Typecheck | `npm run typecheck` | node + web, 0 errors |
| Lint | `npm run lint` | `--max-warnings 0`, exit 0 |
| D-36 | `git diff --stat -- package.json package-lock.json` | empty |

**The self-check's assertions were proven load-bearing, not assumed.** A tokenless round trip was run
through the harness in this session:

```
[hive] hook payload REJECTED (missing sock_token) — event=PreToolUse, 1 rejected so far. …
tokenless exit= 0 transcriptPath= undefined sent= 0
```

The shim still exits **0** — that is `HOOK_SHIM`'s fail-open contract (D-08 clause 3) working correctly —
while both observables stay empty. So a self-check that asserted only `code === 0` would pass on a
completely dead loop. That is exactly the vacuity this harness exists to make impossible, and it is why
the checks assert `server.transcriptPath()` and the `hive:hookEvent` channel instead.

## Decisions Made

- **INCONCLUSIVE over a manufactured verdict.** The plan offers `WORKS` / `REFUSED` / `INCONCLUSIVE — <exact
  reason>`. Auth death is an exact reason. Reading Run A's banner as `WORKS` would have handed plan 04-13 a
  live-verified-looking claim built on a session that never ran a single tool call.
- **The banner differential is reported as a separate, weaker fact.** It is on the page under "what the two
  runs did and did not settle", not folded into the verdict, so nobody can quote it as the enforcement answer.
- **No approval-bypass flag.** The plan is explicit: adding one would be measuring the thing GATE-04 exists
  to turn off. `--skip-git-repo-check` (permits running outside a git repo) and `-C` (codex's own working-root
  flag, used because this executor's shell is worktree-isolated) were the only mechanical additions, applied
  identically to both runs.
- **`ctx.sent` was added to the harness contract** beyond the plan's stated minimum. The plan's `ctx` list
  ends "at minimum"; a renderer-channel recorder is the only cross-shim authorization observable (grok's
  translated payload carries no `transcript_path`), and GATE-03's "the deny reaches an engine" assertion will
  want it. Six lines, no new dependency.
- **Shim lookup by name against the module**, not against a list of six constants copied into the harness —
  a list here would be a second thing to keep in sync with `hiveTemplates.ts`.

## Deviations from Plan

### Blocked measurement, recorded rather than fabricated

**1. [Auth gate — recorded as the measurement outcome, per the execution directive] codex is authenticated on paper and dead in practice**
- **Found during:** Task 1
- **Issue:** The plan's premise — *"This machine runs `codex-cli 0.128.0`, logged in via ChatGPT"* — is what
  `codex login status` reports and is not true of the stored credential. Every model turn 401s with
  `refresh_token_reused`. The spike therefore cannot answer the question it was written to answer.
- **Handling:** Not treated as a stop-and-return checkpoint, because the executor's environment note is
  explicit: *"If codex is not installed/authenticated, record that fact explicitly as the measurement outcome
  with the exact error — never invent a VERDICT."* The plan's own `INCONCLUSIVE` branch exists for this. Both
  runs were completed and recorded in full; the verdict states the cause; the page carries an
  **"Operator action required"** line naming the one manual step (`codex login`, browser sign-in) that
  converts it into a real verdict.
- **Non-interactive re-auth was checked before giving up:** no `OPENAI_API_KEY` is present in this
  environment, so `codex login --with-api-key` was not available. Interactive browser sign-in is a human action.
- **Committed in:** `96ef151`

### Mechanical adjustments to the spike argv

**2. [Rule 3 - Blocking] `--skip-git-repo-check` and `-C` added to both runs**
- **Found during:** Task 1
- **Issue:** The plan's argv as written died at `Not inside a trusted directory and --skip-git-repo-check was
  not specified.` (exit 1) — the `%TEMP%` probe dir is not a git repo. Separately, the plan says "executed
  with `cwd` as the working directory"; this executor's shell is worktree-isolated and cannot `cd` out of the
  worktree.
- **Fix:** `--skip-git-repo-check` (permits running outside a repo — not an approval or sandbox bypass) and
  `-C <proj>` (codex's own documented working-root flag; both banners confirm `workdir:` landed on the probe
  dir). Applied **identically to Run A and Run B**, so the negative control stays symmetric. The failed first
  attempt is on the page as "Preliminary attempt" rather than being quietly discarded.
- **Committed in:** `96ef151`

### Incidental finding, recorded not acted on

**3. [Out of scope — logged, not fixed] `hiveProvisioning.ts:207` is measurably too strong**
- **Found during:** Task 1
- **Issue:** That comment says hooks fire in interactive codex sessions, *"not in headless `codex exec`."*
  Both transcripts show `codex exec` firing `hook: SessionStart` (×3, one `Failed`) and
  `hook: UserPromptSubmit … Completed`.
- **Why not fixed here:** D-35 gives this plan two files and neither is `src/`. It does not overturn the
  claim for `PreToolUse` (never reached — no tool call happened), so it is not a GATE-03 correctness issue
  today. Recorded on the spike page so plan 04-13 re-checks rather than inherits it.

---

**Total deviations:** 1 blocked measurement recorded as its own outcome, 1 Rule 3 mechanical unblock,
1 out-of-scope observation logged.
**Impact on plan:** Task 2 delivered exactly as specified. Task 1's artifact and all seven of its acceptance
criteria are satisfied; what is **not** delivered is a decisive answer, and that is a property of this
machine's codex credential, not of the work. Plan 04-13's fallback path (`LIVE-UNVERIFIED` citing
openai/codex#23552) is the one this outcome points at, and 04-13 task 4 was always the deciding measurement.

## Issues Encountered

- **The worktree base needed correcting at startup.** HEAD was at `95f1cb8` (a merge of PR #80) whose
  merge-base with the assigned base `8749a2b` was `5ee846e`. The startup check reset the worktree to
  `8749a2b` as specified. Branch was `worktree-agent-aff482eb4e3241a7b` throughout; no protected ref was
  touched and no `git clean` was run.
- **`ctx.sent` needed a real emit site.** `HookServer.handle`'s generic
  `this.emit(agentId, event, p)` tail fires for an allowed `PreToolUse`; confirmed by running the self-check
  rather than by reading, because several earlier returns in `handle` could have pre-empted it.

## User Setup Required

**One manual step, and it is the only thing standing between this phase and a real GATE-04 verdict.**

> Run `codex login` and complete the browser sign-in, then re-run the two argv lines recorded in
> `04-SPIKE-codex-sandbox.md`. Everything else on that page stays valid.

Until then, plan 04-13 must plan for the `LIVE-UNVERIFIED` path.

## Next Phase Readiness

**Ready:**
- Plan **04-06** (GATE-03 roundtrip) and plan **04-16** (GATE-05 bounded wait) can both
  `require('./gate-harness.cjs')` and write a real-shim-child integration test that **runs on this machine**.
  Neither may be handed a platform gate: `grep -c 'skip'` on the harness is 0 and a case that does not run
  has no RED (T-04-CMD-16).
- Plan **04-10** can drive `GROK_HOOK_SHIM`'s real reply translator through a real child process today —
  `runShim(ctx, payload, { shim: 'GROK_HOOK_SHIM' })` is measured working — instead of re-implementing its
  decoder in a test.

**Carried forward as a blocker:**
- **Plan 04-13 (GATE-04) has no live-verified premise.** The flag plumbing is confirmed; sandbox enforcement
  and the #23552 prompt behaviour are both unmeasured on this machine. 04-13 should build against the
  `--add-dir` shape and ship the `LIVE-UNVERIFIED` marker citing openai/codex#23552 unless operator re-auth
  lands first and its task 4 live interactive agent produces a real write.
- **Plan 04-10 must not cite a shell tool name from this page.** It is `unobserved`.

## Self-Check: PASSED

Every artifact and commit this SUMMARY claims, verified on disk after writing it:

| Claim | Verified |
|---|---|
| `.planning/phases/04-overnight-on-a-repo-that-matters/04-SPIKE-codex-sandbox.md` | FOUND |
| `test/gate-harness.cjs` | FOUND |
| `.planning/phases/04-overnight-on-a-repo-that-matters/04-01-SUMMARY.md` | FOUND |
| commit `96ef151` (Task 1) | FOUND in `git log` |
| commit `32e34df` (Task 2) | FOUND in `git log` |
| commit `bb0d351` (SUMMARY) | FOUND in `git log` |
| `git diff --name-only 8749a2b HEAD` | exactly the three files above — no `STATE.md`, no `ROADMAP.md`, no `package.json` |
| `git status --short` | clean |

No stubs. No placeholder values. No `TODO`/`FIXME` introduced. The one thing this plan does **not**
deliver — a decisive codex sandbox verdict — is stated as such in both the artifact and the deviations
section rather than being papered over.

## Threat Flags

None. Task 1 executed a CLI against `%TEMP%` directories only (T-04-SBX-01 asserted: `git status
--porcelain src/` empty). Task 2 opens a socket that the app already opens, in a tmp `harnessHome`, with a
token minted and torn down inside a single `finally`; nothing is written under the repo and no token
reaches a committed file (T-04-ASK-01). No new network endpoint, auth path or schema was introduced.

---
*Phase: 04-overnight-on-a-repo-that-matters*
*Completed: 2026-08-25*
