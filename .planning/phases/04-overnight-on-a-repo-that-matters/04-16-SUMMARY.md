---
phase: 04-overnight-on-a-repo-that-matters
plan: 16
subsystem: testing
tags: [gate-05, hook-shim, approvals, poll-loop, node-net, win32, fail-closed]

requires:
  - phase: 04-15
    provides: "the dual-reading ask reply — one object that is simultaneously a valid PreToolUse deny and a `hive_ask` handle — plus `ApprovalRegistry.poll/answer/sweep` and the `ApprovalPoll` branch in `hooks.ts`"
  - phase: 04-10
    provides: "the marker ledger's state after wave 3, and the pi/OpenCode veto paths this plan must not revisit"
  - phase: 04-01
    provides: "`test/gate-harness.cjs` — a real shim child against a real `HookServer` on win32, selectable by shim constant via `opts.shim`, `HIVE_SOCK` overridable via `opts.env`"
provides:
  - "`HOOK_SHIM` (Claude, codex, kimi) waits for an operator: on seeing `hive_ask` it clears its boot timer and polls on a fresh short connection per `pollMs`, and every non-allow outcome is a WRITTEN deny"
  - "the boot 5 s `process.exit(0)` timer's handle is captured and cleared on entering the loop — without it an ask outliving 5 s exits silently, and a silent exit is ALLOW"
  - "a poll-scoped error handler that DENIES, distinct from the first connection's verbatim fail-open — the two halves of D-08 clause 3"
  - "`test/gate05-bounded-wait.test.cjs` — 8 cases, all on the real shim's real stdout, on win32, zero skipped"
  - "two `LIVE-UNVERIFIED` markers and all four ledger pins reconciled from a live grep"
affects: [04-17, 04-18, 04-19, 04-20]

tech-stack:
  added: []
  patterns:
    - "a shim that re-connects — no shim in this repo had ever done so before this plan"
    - "a test file that starts its two slow cases at module load and awaits them in their own cases, so 5 s waits overlap instead of summing"
    - "a stub floor on its own socket, substituted through the harness's `opts.env.HIVE_SOCK` seam, for the cases whose subject is the SHIM's clock rather than the server's"

key-files:
  created:
    - test/gate05-bounded-wait.test.cjs
  modified:
    - src/main/hiveTemplates.ts
    - test/repo-claims.test.cjs
    - test/gate03-roundtrip.test.cjs
    - test/engine-parity.test.cjs

key-decisions:
  - "The poll loop lands in `HOOK_SHIM` and nowhere else. `GROK_HOOK_SHIM` and `AGY_HOOK_SHIM` are byte-identical to HEAD (sha1-verified over non-empty symbol-bounded extracts) and take the ask reply's own deny, which their shipped decoders already translate."
  - "The boot timer's handle is captured and `clearTimeout`d on entering the loop. `.unref()` does not stop it firing while the poll loop keeps the process alive."
  - "The poll connection installs its OWN error handler that denies. The first connection's `c.on('error', () => process.exit(0))` survives verbatim in all three shims."
  - "The poll payload is `Object.assign`d from the original payload rather than written longhand, so `sock_token` appears exactly once in the shim and `hook-auth-roundtrip`'s mutation pin keeps biting."
  - "`grok` and `agy` are deliberately NOT added to `LIVE_UNVERIFIED_ENGINES`; the reason is written in beside the map so plan 04-19 finds a decision rather than a hole."

patterns-established:
  - "Discriminate on the deny's REASON, not on a clock: an un-upgraded shim prints main's ask reply, which is also a deny, so 'it said deny' cannot tell a shim that waited from one that left."
  - "Every wave-5 plan that changes shim behaviour must re-run the whole suite for LATENCY as well as for failures — a green case that eats 240 s is a slower failure, not a smaller one."

requirements-completed: [GATE-05]

duration: 71min
completed: 2026-08-25
---

# Phase 4 Plan 16: GATE-05's Bounded Wait Summary

**`HOOK_SHIM` now waits for an operator on a fresh short connection per poll, with its boot 5 s `process.exit(0)` captured and cleared so an ask outliving five seconds cannot exit silently into an ALLOW — proven on the real shim's real stdout by eight win32 cases in 10.9 s, two of which are deliberately slower than the thresholds they exist to observe.**

## Performance

- **Duration:** 71 min
- **Tasks:** 3 planned, 3 complete (+3 deviation commits)
- **Files modified:** 5 (1 source, 1 test created, 3 tests modified)
- **Commits:** 8

## Gate results (measured in this session, on this win32 machine)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | 0 errors |
| `npm run lint` | exit 0 |
| `npm test` | **tests 1028 · pass 1021 · fail 0 · skipped 7 · 26.0 s** |
| baseline at 04d71b1 | tests 1020 · pass 1013 · fail 0 · skipped 7 · 26.3 s |
| skipped delta | **zero**, confirmed |
| `node --test test/gate05-bounded-wait.test.cjs` | **pass 8 · fail 0 · skipped 0 · duration_ms 10 866** |
| `node --test test/repo-claims.test.cjs` | 35 pass, 0 fail |
| `node --test test/suite-integrity.test.cjs` | green; `DECLARED_SKIPS` and `FROZEN` **untouched** |

The suite grew by exactly 8 tests — this plan's file — and its wall time is
within a second of baseline despite two cases that each sit above a 5 s
threshold. That is the overlap described under Task 2.

## Task 1 — the poll loop in `HOOK_SHIM`, with the boot timer cleared

`src/main/hiveTemplates.ts`, `HOOK_SHIM` only. Commit `e1a129b`, corrected by
`2cd6e72`.

Behaviour, all of it observed in Task 2 rather than asserted here:

- **No `hive_ask` → today's behaviour, byte for byte.** `resp` is written to
  stdout, exit 0, inside the untouched 5 s boot budget. That path never reaches
  the `clearTimeout`.
- **`hive_ask` present →** `clearTimeout(bootTimer)` first, `resp` discarded,
  then one `net.createConnection` per `pollMs` posting `ApprovalPoll`.
- **`{status:'pending'}` → sleep and repeat** on a ref'd timer. Deliberately not
  `.unref()`ed: the poll socket has closed by then, so an unref'd sleep would let
  the process exit between polls with nothing written — an allow.
- **A final verdict** is written verbatim, exactly as the non-ask path writes its
  reply.
- **Deadline expiry, an unknown ask id, a malformed poll reply, a poll that
  opens and never answers, and a poll connect error** all WRITE the deny then
  exit 0. Never a silent exit.
- **grok and agy are untouched** and take the ask reply's own
  `permissionDecision: 'deny'`.

### The boot timer — R2-BL2, and the before/after numbers the criterion asked for

`hiveTemplates.ts` armed `setTimeout(() => process.exit(0), 5000).unref()` and
**discarded the handle**. `.unref()` stops a timer holding the event loop open;
it does not stop it firing while the process is alive for another reason, and a
poll loop is exactly such a reason. Now `const bootTimer = setTimeout(...)`,
`bootTimer.unref()`, and `clearTimeout(bootTimer)` on the branch that enters the
loop.

| Measurement | HEAD (04d71b1) | now | criterion |
| --- | --- | --- | --- |
| `grep -c 'clearTimeout'` | **2** | 5 | ≥ 3 ✅ |
| `grep -c 'bootTimer'` | **0** | 4 | ≥ 2 ✅ |
| `grep -o 'hive_ask' \| wc -l` | 0 | 6 | ≥ 2 ✅ |
| `grep -c "on('error'"` | 13 | 14 | +1 exactly ✅ |
| `grep -c "c.on('error', () => process.exit(0))"` | 3 | 3 | unchanged ✅ |
| `grep -o '5000' \| wc -l` | 5 | 6 | +1 exactly ✅ |
| `grep -o 'createConnection' \| wc -l` | 10 | 11 | increased ✅ |
| `grep -o 'LIVE-UNVERIFIED' \| wc -l` | 5 | 7 | +2 exactly ✅ |
| `grep -ci 'grok'` | 17 | 19 | ≥ 18 ✅ |
| `grep -c 'setInterval'` | 0 | 0 | no held socket ✅ |

The plan flagged that the previous draft asserted `clearTimeout >= 1` and claimed
it was `0` before the plan. It was **2** — `stopTimer` twice inside
`PROXY_BRIDGE_SHIM`, nothing to do with any hook shim — so that form would have
passed before a line was written. `bootTimer` is the pin that actually bites, and
it did measure `0`.

### grok and agy are byte-identical, and the extraction is non-vacuous

```
awk '/^export const AGY_HOOK_SHIM = /,/^`;$/'   HEAD: 52 lines  b20bebb2…   now: 52 lines  b20bebb2…
awk '/^export const GROK_HOOK_SHIM = /,/^`;$/'  HEAD: 69 lines  af7c0a17…   now: 69 lines  af7c0a17…
```

Both extractions were confirmed **non-empty first** — 52 and 69 lines, matching
the plan's own measurement — precisely because the `^const` form the earlier
draft used extracts 0 lines and hashes `sha1("")`, which passes for any edit
including deleting the shims.

`grok` and `agy` are each named **twice inside `HOOK_SHIM`'s own extract**
(HEAD: 0 and 0), at the comment that says why the poll must never become a
stream.

### Diff containment

`git diff -U0` produces three hunks, all inside `HOOK_SHIM` (`:315-366` at HEAD).
`TASK_CLI`, `PROTOCOL_MD`, `PI_EXTENSION`, `OPENCODE_PLUGIN`, `PROXY_BRIDGE_SHIM`,
`AGY_HOOK_SHIM` and `GROK_HOOK_SHIM` are untouched.

### S-2, the commit hazard — what the executor found

`gitCommitter.ts`'s `harnessAuthored` byte-compares `bin/cth-hook.cjs` against the
`HOOK_SHIM` constant, against the **index blob**. The plan required checking
whether a generated shim is committed anywhere in this repo before committing.

**Nothing is.** `git ls-files | grep -i 'cth-hook\|hive-proxy\|agy-hook\|grok-hook'`
returns only `test/hive-proxy-token.test.cjs`; `git ls-files 'bin/*'` is empty; the
only tracked path under `hive/` is `hive/docs/integration-templates.md`. That map
addresses an agent's own hive root, which is generated at bootstrap
(`hive.ts:801` rewrites the file every boot) and is not tracked here. So the
constant change had no in-repo companion file to move in the same commit, and the
secret-scrub's false-positive suppression is unaffected.

## Task 2 — `gate05-bounded-wait`, eight outcomes on real stdout

`test/gate05-bounded-wait.test.cjs`, created. Commits `cb662fe` (RED),
`759f18f`, `7ae8384`.

### The RED run, recorded

Against the unchanged `HOOK_SHIM`, on win32:
**tests 8 · pass 3 · fail 5 · skipped 0 · 2.5 s.**

| # | Case | RED? |
| --- | --- | --- |
| 1 | an unanswered ask denies at the deadline | **RED** |
| 2 | an explicit yes allows | **RED** |
| 3 | a PRE-ask dead socket allows, empty stdout, zero polls | green — **preservation** |
| 4 | a cross-agent poll is refused, owner as control | green — **preservation** |
| 5 | a MID-ask dead socket denies | **RED** |
| 6 | a TTL outliving the 5 s boot timer denies (R2-BL2) | **RED** |
| 7 | the unchanged `GROK_HOOK_SHIM` denies on an ask reply | green — **preservation** |
| 8 | a poll that opens and is never answered denies (T-04-ASK-47) | **RED** |

Three cases were green at RED and that is the point of them: 3, 4 and 7 assert
behaviour this plan must NOT change (the fail-open, the registry's ownership
check, byte-identical grok). Stating which is which is more honest than claiming
eight REDs.

### The measured numbers the plan asked for

Printed by the file itself (`t.diagnostic`), not hand-copied:

```
case 6: TTL=6000ms shim elapsed=6148ms (both must exceed 5000ms)
case 8: shim elapsed=5126ms after 1 unanswered poll(s)
test bodies: 6785ms; the runner's duration_ms is the figure to hold against 15000ms
```

- **Case 6's TTL is 6 000 ms and its measured elapsed is 6 148 ms** — both above
  the 5 000 ms boot timer, both asserted.
- **Case 8's measured elapsed is 5 126 ms**, asserted `> 4 500 ms`.
- **File runtime: `duration_ms` 10 866 ms against the 15 000 ms ceiling.** The
  in-body figure (6 785 ms) is labelled bodies-only in the file, because the
  runner's number is ~4 s larger (module load plus the tmpdir teardown every
  `withHookServer` does) and a reader who took 6.8 s for the file's cost would
  think there was twice the headroom there is.

### How 8 cases with two 5 s waits fit in 10.9 s

Cases 6 and 8 are **started at module load and awaited in their own cases**, so
the two waits overlap each other and the six fast cases instead of summing. Run
sequentially they alone floor the file at ~11 s before anything else runs. Each
case still RUNS and still asserts, and every elapsed assertion reads that shim's
own `runShim` wall clock, never the file's — so neither case can be satisfied by
another's waiting.

### The remaining grep criteria

| Criterion | Result |
| --- | --- |
| `pass 8 / skipped 0` on win32 | ✅ |
| `grep -c 'existsSync'` | **0** ✅ |
| `grep -c 'registry.poll'` | **0** ✅ |
| `grep -c 'GROK_HOOK_SHIM'` | **3** (≥ 1) ✅ |
| `DECLARED_SKIPS` / `FROZEN` unchanged | ✅ — neither `suite-integrity.test.cjs` nor `01-VALIDATION.md` needed touching |

**`grep -c 'skip'` returns 3, not 0 — stated rather than engineered away.** All
three are prose in the file's own docstring explaining why there is no gate:
```
15: * NO `{ skip: … }` OF ANY KIND, and that is load-bearing rather than tidy.
21: * evidence pass vacuously, with all eight cases skipped, on the only machine
22: * this phase runs on; and a skipped case has no RED, so the RED run this task
```
Zero are runner options. The measurement that actually gates is
`suite-integrity.test.cjs`'s `declaredSkipCount`, which strips comments and
literals first — that file's own comment says why: *"prose about the option is
not the option, exactly as a commented-out line is not code."* Its census clause
passes with `DECLARED_SKIPS` unchanged, and `node --test` reports `skipped 0`.
Rewording the docstring to make a literal grep read 0 would have removed the
explanation and left the pin exactly as strong, so it was not done.

### Why three cases use a stub floor, and what that does not weaken

Production's TTL is `ASK_TTL_MS = (MIN_PRETOOLUSE_SEC - 30) * 1000` — two
minutes — and `HookServer` builds its own `ApprovalRegistry` with that constant,
with no seam a test may shorten (and `hooks.ts` is 04-15's file in wave 4). So the
three cases whose subject is **the shim's own clock** (1, 6, 8) face a floor whose
replies this file writes, on its own socket, substituted through the harness's own
documented `opts.env.HIVE_SOCK` seam. The shim is the real shim, the child process
is real, the socket is real; only the floor's clock is the test's.

Cases 2, 4, 5 and 7 — an operator's yes, a cross-agent poll, a mid-ask death,
grok's translator — all run against the **real `HookServer`** through
`withHookServer`.

### Discriminators, after a wrong assumption was caught

Two RED assertions were timing heuristics resting on a premise the shim does not
owe them (that it sleeps `pollMs` before its FIRST poll — it polls immediately,
which is how an already-answered ask resolves fast). Case 2 then returned the
correct `allow` in 161 ms and failed its own guard. The source was not changed to
suit the assertion; the assertion was replaced with structural discriminators:

- case 2 asserts stdout carries a poll-shaped `status`, a field only
  `approvalPoll` writes and the ask reply has none of;
- cases 1, 5, 6 and 8 each assert the shim wrote **its own sentence** — window
  closed / became unreachable / never answered it — and **not** the judge's
  `FORCE-pushes` reason echoed out of the first reply. An un-upgraded shim prints
  that first reply, which is also a deny, so "it said deny" alone cannot tell a
  shim that waited from one that left;
- cases 5 and 8 additionally **refuse each other's reason**, so the socket-death
  path (an `error` event) and the live-but-silent path (a timeout) cannot satisfy
  one another.

## Task 3 — two markers, four pins, one live grep

`test/repo-claims.test.cjs`. Commit `b97be78`.

### The two markers say different things

1. **kimi.** `HOOK_SHIM`'s poll loop is real new code and kimi is one of the three
   engines that runs it. It is exercised end to end by `gate05-bounded-wait` as a
   real child process — but on Claude's and codex's contract, not kimi's, and no
   kimi CLI is installed here. `hiveTemplates.ts`'s own pre-existing note that
   Moonshot documents a BLOCK as **exit code 2**, where this shim expresses deny
   via stdout JSON at exit 0, remains open. **What would settle it:** an installed
   kimi plus one hook fire.
2. **grok and agy.** Their shims are **unchanged** and deliberately do not poll.
   An ask degrades to a deny through decoders they already ship, and that
   translation runs **on this machine** as a real child process
   (`gate05-bounded-wait` case 7 for grok; `engine-parity.test.cjs` already does
   it for agy). So the **mechanism is verified locally; what is unverified is the
   ENGINE honouring the deny**, and the marker says exactly that rather than
   reading as though nothing were known. **What would settle it:** an installed
   CLI plus one hook fire.

Neither marker is worded as covering a poll loop on grok or agy. There is none,
deliberately.

### All four pins, re-measured — never arithmetic

`grep -ro 'LIVE-UNVERIFIED' src/ | cut -d: -f1 | sort | uniq -c`, run in this
session:

```
      3 src/main/hive.ts
      5 src/main/hiveProvisioning.ts
      7 src/main/hiveTemplates.ts      ← 5 → 7
      1 src/main/index.ts
      3 src/main/webhook.ts
      4 src/shared/agentProvider.ts
```

1. **`MARKER_LEDGER` per-file** — `hiveTemplates.ts` 5 → 7, all others unchanged.
2. **`LIVE_UNVERIFIED_TOTAL`** — 21 → **23**, confirmed two ways in the same
   session: the occurrence grep totals 23, and the per-file line-count sum
   (`grep -rc … | awk`) also reads 23.
3. **The committed file-set assertion** — unchanged; no file gained or lost its
   first marker.
4. **The per-engine lower bound** — measured with this file's **own
   `markerBlocks` algorithm**, run against a HEAD copy of `src/` and against the
   working tree:

   | | blocks | pi | opencode | crush | qwen | kimi | grok | agy | codex |
   | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
   | HEAD (04d71b1) | 21 | 4 | 5 | 1 | 1 | **5** | 3 | 1 | 6 |
   | now | 23 | 4 | 5 | 1 | 1 | **6** | 4 | 2 | 7 |

   `LIVE_UNVERIFIED_ENGINES.kimi` is raised 5 → **6**, to the measured value, so
   the new marker cannot be quietly dropped later while the total still balances
   — the exact drift the per-engine half exists to catch.

**`grok` and `agy` are deliberately NOT added to that map, and the reason is
written in beside it.** Both gained a block (3 → 4, 1 → 2) and neither CLI is
installed here. But that map is the set plans 04-10 and 04-13 scoped to *bridges
never live-verified*, and adding two engines is a claim about THEIR bridges that
this plan neither made nor measured — what was observed is that their unchanged
decoders translate an ask reply into their own deny, driven as real child
processes here. Widening the map on that basis would conflate an unverified
engine with an unverified bridge, the same conflation 04-13 refused for codex.
The repo-wide total holds the grok/agy marker in place instead.

**This is also the answer to plan 04-19's zero-marker sweep for GATE-05** — said
in the ledger comment itself, so the closing plan finds a decision rather than a
hole.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The poll payload blunted `hook-auth-roundtrip`'s `sock_token` mutation pin**

- **Found during:** Task 1, by `test/hook-auth-roundtrip.test.cjs`'s mutation case
  going red in the full suite.
- **Issue:** That file comments out each shim's `payload.sock_token = ...` line in
  turn and requires the assignment pin to go RED. Writing the poll payload out
  longhand put a **second `sock_token:` literal** in `HOOK_SHIM`, which satisfies
  `ASSIGNS_SOCK_TOKEN` on its own — so the mutant stayed green while the shim
  would have been dead-hooked, every hook dropped by `authorized()`. That pin
  exists because three shims once stayed unwired with nothing noticing.
- **Fix in the SOURCE, not the assertion:** the poll payload is now
  `Object.assign`ed from the original payload, so `sock_token` is written exactly
  once and a poll authenticates with the exact bytes the first payload carried.
  `tool_input` is dropped — it is the one field that can approach
  `HOOK_LINE_MAX`, and a poll that grew past it would be answered with the
  oversize deny.
- **Files modified:** `src/main/hiveTemplates.ts`
- **Commit:** `2cd6e72`

**2. [Rule 1 - Bug] `test/gate03-roundtrip.test.cjs` asserted wave-2 behaviour this plan deliberately changes**

- **Found during:** the post-Task-1 full-suite run.
- **Issue:** `HOOK_SHIM` no longer prints main's ask reply — it waits out
  `ASK_TTL_MS`. The three ask-shaped cases measured **120 316 / 120 201 /
  121 187 ms** each and then failed on *"the reason on the wire must be the one
  main authored, byte for byte"* (the shim now writes 04-15's expiry sentence).
  The file's own 10 s budget clause failed too, by 36×.
- **Fix:** the three cases now drive `GROK_HOOK_SHIM`, which cannot poll and whose
  shipped decoder turns main's `permissionDecision:'deny'` into
  `{decision:'deny', reason}` carrying the judge's own sentence. Nothing is
  weakened: the byte-for-byte reason is still observed on a real shim's real
  stdout, over the real socket, as a real child process — and the file now also
  proves GATE-05 ceiling item (a)'s ask-to-deny degradation. `HOOK_SHIM`'s ask
  path is `gate05-bounded-wait`'s eight cases. **This file's wave-2 docstring
  named the fix in advance:** *"a later plan wires `openAsk` and re-checks these
  same shapes; a reader who finds this file after that should find the reason
  here rather than a contradiction."*
- **One assertion was STRENGTHENED rather than ported (Rule 2):** grok expresses
  an allow as *silence*, which is also what a shim that never reached the socket
  produces, so R2-BL4's benign half now additionally requires an authorized
  `hive:hookEvent`.
- **Result:** 5 pass, 0 fail, **1 618 ms** (was 362 936 ms).
- **Files modified:** `test/gate03-roundtrip.test.cjs`
- **Commit:** `a24f672`

**3. [Rule 1 - Bug] `test/engine-parity.test.cjs`'s codex case waited out the real TTL twice — 240 s in one case**

- **Found during:** a latency scan of the full suite (which had risen from 26 s to
  **257 s**).
- **Issue:** *"GATE-03: a codex-shaped payload is refused in BOTH command shapes"*
  ran **240 728 ms**. It still **PASSED** — the ask expires to a deny after 120 s
  — which is why it needed finding rather than reporting: a green case that eats
  240 s of a 90 s full-suite budget (`04-VALIDATION.md` § Sampling Rate) is a
  slower failure, not a smaller one.
- **Fix:** codex runs `HOOK_SHIM`, so unlike gate03-roundtrip this case cannot
  move to a non-polling shim without ceasing to test codex. It now refuses the ask
  the way an operator would and reads the verdict off the shim's stdout exactly as
  before. The claim is unchanged in both directions, and both benign controls
  still assert a well-formed `{}` rather than the silence a shim that never
  reached the server would produce.
- **Result:** 52 pass, 0 fail, **11.8 s** (was ~252 s).
- **Files modified:** `test/engine-parity.test.cjs`
- **Commit:** `7bdd154`

### Planned files not touched

`test/suite-integrity.test.cjs` and
`.planning/phases/01-finish-the-floor/01-VALIDATION.md` were in the plan's
`files_modified` as a **named escape hatch** for the contingency where the harness
could not be made to work on win32. It works: eight cases ran, zero skipped, no
gate of any kind. `DECLARED_SKIPS`, `FROZEN` and the published `# skipped <= 7`
ceiling are all untouched, and the skipped-count delta from 7 is confirmed zero.

## Ceiling / what is NOT proven

- **kimi's poll path is `LIVE-UNVERIFIED`.** The loop is exercised on Claude's and
  codex's contract; kimi is not installed and its exit-code-2 BLOCK contract
  remains open.
- **grok's and agy's ENGINES honouring the deny is `LIVE-UNVERIFIED`.** Their
  decoders are exercised here as real child processes; neither CLI is installed.
- **The four non-polling engines (pi, OpenCode, grok, agy) still take GATE-05
  ceiling item (a)'s unconditional degradation** — an ask becomes a deny with no
  path through. This plan did not change that and does not claim to.
- **No live operator approval happened.** Every "yes" in this plan came from
  `server.answerApproval(...)` in a test, not from a phone. Plan 04-17 owns the
  phone half; `04-VALIDATION.md` already records that a physical-device
  verification has no local reproduction in wave 5.
- **This plan wired nothing at the composition root.** `openAsk` was not
  overridden anywhere; plan 04-20 owns the production `new HookServer(...)`.

## Threat Flags

None. Every file this plan touched is in the plan's `<threat_model>` or is a test
file, and no new network endpoint, auth path, file-access pattern or schema
change was introduced. The one new wire message (`ApprovalPoll`) was declared and
built by plan 04-15; this plan only sends it, carrying the same per-agent token
the first payload carried.

## Known Stubs

None.

## TDD Gate Compliance

RED → GREEN → REFACTOR, in commit order:

| Gate | Commit | Evidence |
| --- | --- | --- |
| RED | `cb662fe` `test(04-16)` | 8 cases ran, **5 failed** against the unchanged shim; the run is transcribed above |
| GREEN | `e1a129b` `feat(04-16)` | the poll loop; gate05 went to 7/8, then 8/8 after the assertion correction |
| REFACTOR | `759f18f`, `7ae8384` `test(04-16)` | timing heuristics replaced with structural discriminators; diagnostics added |

No test was modified to make a buggy source path pass. The one case that was
changed after GREEN (case 2's `elapsed >= 500`) encoded an assumption the shim
never owed — an immediate first poll is correct — and it was replaced with a
*stronger* structural assertion, not a weaker one. The two genuine source defects
this plan's own work surfaced (the `sock_token` pin, the poll payload's oversize
risk) were fixed in the source, in their own `fix(...)` commit.

## Commits

| Hash | Message |
| --- | --- |
| `cb662fe` | `test(04-16)`: GATE-05's bounded wait — 8 cases on the real shim's real stdout, 5 RED |
| `e1a129b` | `feat(04-16)`: HOOK_SHIM waits for an operator — a poll loop with its boot timer cleared |
| `a24f672` | `fix(04-16)`: gate03-roundtrip asserted wave-2 behaviour the poll loop deliberately changes |
| `2cd6e72` | `fix(04-16)`: the poll payload blunted the sock_token pin — derive it, do not rebuild it |
| `7bdd154` | `fix(04-16)`: engine-parity's codex case waited out the real TTL twice — 240s in one case |
| `b97be78` | `chore(04-16)`: reconcile all four marker-ledger pins from a live grep |
| `759f18f` | `test(04-16)`: gate05 discriminates on the deny's REASON, not on a clock |
| `7ae8384` | `test(04-16)`: print case 6's and case 8's measured elapsed, and the file's wall time |

## Self-Check: PASSED

All six claimed files exist on disk (`src/main/hiveTemplates.ts`,
`test/gate05-bounded-wait.test.cjs`, `test/repo-claims.test.cjs`,
`test/gate03-roundtrip.test.cjs`, `test/engine-parity.test.cjs`, this SUMMARY).
All eight claimed commit hashes resolve in `git log`. Every number in this
document came from a command run in this session; none was carried over from a
plan file or a prior SUMMARY. `STATE.md` and `ROADMAP.md` were not modified —
the orchestrator owns those.

## Notes for the wave merge

Three files outside this plan's `files_modified` were changed
(`gate03-roundtrip.test.cjs`, `engine-parity.test.cjs`, and — as planned —
`repo-claims.test.cjs`). None is another wave-5 plan's declared file, but
**04-20 re-checks the same post-wiring behaviour on `boot-floor.test.cjs`**, and
whoever merges should expect the same class of finding there: any test that
drives a real shim at an ask-shaped command through a real `HookServer` now waits
`ASK_TTL_MS` unless it answers the ask. A latency scan of the merged suite, not
just a pass/fail read, is the check that catches it.
