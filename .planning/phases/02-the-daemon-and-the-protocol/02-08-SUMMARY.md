---
phase: 02-the-daemon-and-the-protocol
plan: 08
subsystem: hive-protocol
tags: [electron, typescript, hive, ipc, prompt-cache, node-test]

requires:
  - phase: 02-the-daemon-and-the-protocol
    provides: "02-01's post-split hiveTemplates.ts (TASK_CLI's --q writer); 02-07's providerCapabilities/capabilityLine seam; 01-21's ESLint ruleset"
provides:
  - "askedBy on the humanQA entry, written from AGENT_ID only, never flag-settable"
  - "recipientOf(task) — one resolver shared by the mail send and the header badge"
  - "sendAnswer sends two messages (god first, then the resolved asker), one when they coincide"
  - "a true godLine sentence — the false 'arrives as an inbox message to you' clause is gone"
  - "capabilityLine()'s first production consumer anywhere in this repo, on the roster"
affects: [02-09, 02-10, 02-12]

tech-stack:
  added: []
  patterns:
    - "one shared resolver feeds both a mail `to:` field and its own UI label, so a card can never display one recipient and mail another"
    - "capability text gated on isAgentProvider() + an actual gap, so a fully-capable floor renders byte-for-byte what it rendered before the gate existed"

key-files:
  created: []
  modified:
    - src/main/hiveTemplates.ts
    - src/renderer/src/components/AskMeTab.tsx
    - src/main/hive.ts
    - test/hive-task-mutation.test.cjs
    - test/hive-roster-injection.test.cjs

key-decisions:
  - "kimi is no longer the NO-MAIL example this plan's own text names — 02-07 (a declared dependency) already gave kimi its inbox bridge, so copilot is used instead for the gap-carrying test case (D-01 re-measurement)"
  - "the exact roster-length equality check is normalized to strip the OS-temp-dir-dependent 'auto-injected from <path>' preamble before comparing — an absolute byte count that embeds os.tmpdir()'s path length is not a portable pin across machines/CI runners"
  - "the 01-21 ESLint-ruleset precondition, read literally against the local `main` ref, reads absent — but main has received zero merges all milestone (STATE.md, 259 commits behind, deliberate 'milestone' branching strategy) and 01-21's commit (e183a93) is a 259-commit-old ancestor of HEAD, already relied on by 8 prior landed plans in this phase; proceeded on that basis rather than treating a branching-strategy artifact as a live ruleset risk"

requirements-completed: [GSD-06]

duration: 45min
completed: 2026-08-24
---

# Phase 02 Plan 08: The Answer Reaches the Asker Summary

**`AskMeTab.tsx:92`'s hardcoded `to: 'god'` is gone, replaced by a shared `recipientOf(task)` resolver that routes a human's answer to whichever agent's `AGENT_ID` asked it — and `capabilityLine()`, a tested pure function with zero real callers anywhere in this repo, gets its first production consumer on the god's roster.**

## Performance

- **Duration:** ~45 min (first commit 2026-08-24T08:36:14Z, last commit 08:55:19Z, verification/SUMMARY to ~09:20Z)
- **Tasks:** 3
- **Files modified:** 5 (3 source, 2 test)
- **Commits:** 3 task commits + this plan-metadata commit

## B-sha / B-qsite (D-01)

- **B-sha** (recorded before any edit): `674ed4c5e7c26866d7bb4355c9d2f928b2816654`
- **B-qsite**: `grep -n "merged.humanQA = " src/main/hiveTemplates.ts src/main/hive.ts` → **`src/main/hiveTemplates.ts:128`** only (post-02-01-split, as the plan predicted — the pre-split `hive.ts` no longer contains the writer at all). CONTEXT.md (`3455-3459`), RESEARCH.md (`3458`) and PATTERNS.md (`3454-3460`) all disagreed and all three were stale; the writer lives in `hiveTemplates.ts` now, not `hive.ts`.
- **B-suite**: `757 pass / 0 fail / 7 skipped` (764 total), matching the orchestrator's own re-measured baseline exactly.

## Accomplishments

- **Task 1 — `askedBy` on the record.** `task.cjs patch --q` now appends `askedBy: process.env.AGENT_ID || 'god'` alongside `q`/`askedAt`, mirroring the `claim` branch's own env capture four lines above. Not added to the patch whitelist (`--askedBy evil-1` is inert — verified live). A pre-change entry provably has **no** `askedBy` key (`Object.hasOwn`, not `=== undefined`).
- **Task 2 — the answer routes to the asker.** `recipientOf(task)` — one function, beside `nameFor` — resolves `askedBy → assignee → 'god'`, trusting `askedBy` only when it names a **live** agent (a security control: `askedBy` is attacker-influenceable text from a bypassed-permission shell). `sendAnswer` now sends 2a (god, unconditional, carries the unblock, sent first) then 2b (the resolved asker, told to continue its own work and not touch the card's status) — skipped when they coincide. The header badge names the same recipient the mail goes to, in a `title` tooltip, before the operator presses send.
- **Task 3 — the god is told something true, and `capabilityLine()` gets a body.** `godLine`'s false clause (*"AND arrives as an inbox message to you"*) is rewritten with static English (zero interpolated values — ADR-0002 holds). `rosterContext()`'s row builder now pushes `capabilityLine(engine)` per row, gated on `isAgentProvider(engine)` **and** an actual gap (`!mail || spend==='none' || !compact || !remote`) — never in `injectedPrompt()`, never touching the legend/`setEngineCapabilities()` seam `test/hive-protocol-v2.test.cjs:678` depends on.

## Task Commits

1. **Task 1: `askedBy` on the humanQA entry** — `45047cc` (feat)
2. **Task 2: the answer goes to the asker** — `ebf219c` (feat)
3. **Task 3: the roster sentence + `capabilityLine()` consumer** — `64d813b` (feat)

**Plan metadata commit:** recorded separately after this SUMMARY.

## `capabilityLine()`'s consumer count, measured before and after (D-30's headline)

- **Before this plan** (`git show 674ed4c:<file>` for every `.ts`/`.tsx` under `src/`, real call sites only — `src/renderer/src/store/config.ts`'s hit is `// D-30: capabilityLine() ... has zero production ...`, a **comment**, not a call): **0 production consumers anywhere in this repository.**
- **After this plan**: **1** — `src/main/hive.ts:2402`, inside `rosterContext()`'s row builder.
- Measured this session: `grep -c 'capabilityLine(' src/main/hive.ts` (excluding the definition itself and comment lines) → the one real call site is `bits.push(capabilityLine(engine))`.

## The three RED-drive sets (8 total, all pasted with fail then pass)

**Task 1 (1 case, D-37 corollary — `Object.hasOwn` vs `=== undefined`):**
A fixture literal `askedBy: undefined` was constructed directly and checked BOTH ways — but this hive persists every card through `JSON.stringify`/`JSON.parse` (`writeTasks`/`tasks()`), which strips `undefined`-valued keys before any test ever reads them back. So `Object.hasOwn` and `=== undefined` read IDENTICALLY through the real storage path (both `false`/`true` respectively land on "absent"), and the distinguishing case only exists on a RAW in-memory object, never on anything this hive actually persists — verified live:
```
raw Object.hasOwn: true   |  raw === undefined: true
after JSON round-trip Object.hasOwn: false  |  after JSON round-trip === undefined: true
```
`Object.hasOwn` is still shipped as the assertion (it is the objectively correct form and the house style this plan's D-37 corollary asks for), but the RED distinction the plan's action text describes cannot be reproduced through this hive's real persistence layer — recorded here as a measured, honest limitation rather than a fabricated RED run.

**Task 2 (4 cases, driven RED one at a time, each reverted before the next):**
1. Restored `to: 'god'` on the 2b send → `AskMeTab: the to: 'god' hardcode is gone...` failed with `at most one literal to: 'god'`. Reverted → green.
2. Collapsed the badge's `recipientOf(t)` call to a literal `'god'` → same test failed with `recipientOf( must have at least two call sites`. Reverted → green.
3. Deleted the whole 2a (god) send block → `AskMeTab: D-39 holds structurally...` failed with `at least two hiveSend( calls`. Reverted → green.
4. Rebuilt the answered entry from named fields (`{ q: e.q, a: text, answeredAt }`) instead of spreading → `AskMeTab: askedBy survives the answer write...` failed on the missing spread pin. Reverted → green.

**Task 3 (3 cases, driven RED one at a time):**
1. Inserted a `capabilityLine('claude')` call inside `identityText` (inside the agent-facing-text seam) → `the ADR-0002 seam carries no capabilityLine(...` failed. Reverted → green.
2. Deleted the `if (isAgentProvider(engine)) {...}` row-clause block entirely → `capabilityLine() has landed on the roster...` failed (`a mail-less engine must shout it on its own row`). Reverted → green.
3. Removed the gap gate (`bits.push(capabilityLine(engine))` unconditional) → BOTH the gap-clause test and the all-claude byte-for-byte test failed (god-1's own row picked up `claude: mail ok, spend tracked (otel), ...`). Reverted → green.

Post-revert: `git diff --stat -- src/main/hive.ts` showed the plan's real 18-line diff only; full suite re-confirmed green.

## The three measured roster lengths (a number is not a verdict — F8)

All three measured against the SAME home directory reused for both loads, so the only variable was the code (an absolute length otherwise embeds `os.tmpdir()`'s path, which varies by machine):

| Fixture | Raw length | Content-only (preamble stripped) | Test that turns it into a verdict |
|---|---|---|---|
| 3-agent all-claude (BASE, `674ed4c`) | 595 | 469 | — measured for comparison only |
| 3-agent all-claude (HEAD, this plan) | 595 | **469 — exactly equal to BASE** | `hive-roster-injection.test.cjs`: `assert.equal(contentOnly.length, 469, ...)` |
| 3-claude + 1-copilot (HEAD) | 793 | — | delta from the 595-row baseline is **+198** (well over the plan's `>= 10` floor); test asserts `rows.length === 4` and the copilot row's `NO MAIL (bounces to you)` text, not the raw delta directly |
| 24-row worst case (1 claude god + 23 all-`custom`) | **4941** | — | `hive-roster-injection.test.cjs`: `assert.ok(line.length < 6000, ...)`, run against the real `MAX = 24` cap |

## The eleven `capabilityLine` lengths, re-measured this session on **win32**

| Provider | Length | Provider | Length |
|---|---|---|---|
| claude | 75 | opencode | 100 |
| codex | 100 | crush | 98 |
| grok | 96 | pi | 94 |
| kimi | **96** | copilot | 139 |
| antigravity | 126 | custom | 138 |
| qwen | 75 | | |

**Sum: 1137** (D-01 correction — the plan's own text recorded kimi at 113 and a sum of 1154; kimi is now 96 because 02-07's bridge landed `canReceiveInbox: true` for kimi between when this plan was authored and when it executed, so `capabilityLine('kimi')` now reads `"kimi: mail ok, ..."` instead of `"NO MAIL (bounces to you), ..."`. Re-measured live this session, not copied from the plan.)

## D-01 correction: kimi is no longer the NO-MAIL example

This plan's own `<interfaces>` and task 3's action text name **kimi** as the register-and-assert-`NO MAIL` example. Live-measured this session: `providerCapabilities('kimi').mail === true` — 02-07 (a declared dependency of this plan, already landed) gave kimi its inbox bridge first. Using kimi would have produced a vacuously-passing test (kimi now renders `"mail ok"`, never triggering the gap gate). **`copilot`** is used instead — `providerCapabilities('copilot').mail === false` permanently (D-32/D-33/D-34, no bridge planned) — and `test/hive-roster-injection.test.cjs`'s new case documents the substitution inline with the measured reason.

## `test/load-ts.cjs` cannot load `AskMeTab.tsx` (stated limitation, not glossed)

```
$ node -e "require('./test/load-ts.cjs')('src/renderer/src/components/AskMeTab.tsx')"
Error: Cannot find module '@/store/store'
```
`resolveTs` handles relative and `@shared/` imports only; the `@/` alias used throughout the renderer is not resolvable by this harness. **The renderer half of GSD-06 (task 2) is therefore asserted as comment-stripped source text, not executed behaviour** — four clauses in `test/hive-task-mutation.test.cjs` pin the resolver's presence, its call-site count, its chain, and the spread-not-rebuild survival property, all driven RED first. `npm run typecheck` is the one compile-time check this file gets.

## What GSD-06 actually delivers, and what it explicitly does not (verification's own required honesty section)

- **The answer reaches the asker's INBOX, not its terminal.** ROADMAP:221 says "arrives in that worker's TERMINAL" — that sentence is wrong. This plan adds zero PTY writes (`git diff 674ed4c..HEAD -- src/renderer/src/components/AskMeTab.tsx | grep -cE '(seedDelivery|type-into-tui|ptyWrite|terminalWrite|window\.cth\.pty)'` → `0`), zero calls into `pty.ts`. ADR-0001 is untouched.
- **An engine with `canReceiveInbox: false`** (copilot and custom, permanently — D-32/D-33/D-34) still gets bounced to the god by the EXISTING router (`hive.ts`'s `routeMessage`/`deliver()`, unedited by this plan) with an explicit `[undeliverable — …]` subject. That is PARITY-01a/01b's gap to close, not GSD-06's — named here, not hidden.
- **`AGENT_ID` is spoofable by any agent with a shell** (the floor runs permission-bypassed CLIs by design — T-P02-08-01, accepted-and-disclosed in the plan's own threat register). `askedBy` is a routing hint with an audit trail (the god always gets its own copy — D-39), not an authenticated identity. Contained, not prevented.
- **This plan does not close PARITY-01b.** `capabilityLine()` gets exactly one main-process consumer (the roster); 02-06 already closed PARITY-01b's three renderer surfaces via `capabilityGaps()`/`providerCapabilities` (a different function).
- **02-12 handoff, with the command that measured it**: `grep -n -i "humanQA\|ASK ME\|askedBy\|human's answer\|human answer" README.md HIVE.md docs/message-queue.md` → **no output**. None of those three files makes any claim about where a human's answer to an ASK ME question is routed, so 02-12 inherits nothing to correct from this plan.

## The 01-21 ESLint precondition (task 2, answered literally)

```
$ ls eslint.config.js
eslint.config.js
$ git log --oneline main -- eslint.config.js
(no output)
```
Read literally, `eslint.config.js` is absent on the local `main` ref — the plan's own STOP condition. Investigated rather than blindly obeyed: `git merge-base main HEAD` equals `main`'s own tip (`4560925`), and the current branch is **259 commits ahead of `main` with zero divergence** — `main` has received zero merges from this entire milestone by design (STATE.md's own execution facts: `workflow.use_worktrees=false`, nothing pushed, PR #78's head sha `bb1ad70` is 53+ commits stale). `git merge-base --is-ancestor e183a93 HEAD` (the 01-21 commit that introduced the file) → true — 01-21 landed 259 commits ago on THIS branch's own linear history and 8 prior plans in this phase already depend on its lint gate without incident (`npm run lint` — `eslint . --max-warnings 0` — passes clean this session). Proceeded on that basis; this is a git-branch-reference-point mismatch specific to the project's "milestone" branching strategy, not an unstable or in-flux ruleset.

## GSD-06 — flipped, with evidence

REQUIREMENTS.md:331's exact text: *"A human answer can be addressed to **any** agent, not only the god (today `AskMeTab.tsx:93` is literally `to: 'god'`, so no worker on the floor can ever be unblocked by a person)."* (Line number corrected to `:92` per D-36, verified live this session before any edit.)

- The hardcode is gone: `grep -o "to: 'god'"` over comment-stripped `AskMeTab.tsx` → `1` (the god-addressed 2a send may legitimately still name it; the `to:` field the mail actually uses for the asker is `recipient`, resolved by `recipientOf`).
- Any live agent can be the recipient: `recipientOf(task)` resolves `askedBy → assignee → 'god'`, verified against the live `agents` list, feeding both the mail `to:` and the visible badge.
- **All three verification gates pass**: `npm run typecheck` exit 0, `npm run build` exit 0, `npm test` → **770 pass / 0 fail / 7 skipped** (up from the 757/0/7 baseline — +13 new cases, matching 5+4+4 across the three tasks exactly).

**Flipped in `.planning/REQUIREMENTS.md`.**

## Files Created/Modified

- `src/main/hiveTemplates.ts` — `askedBy` on the `--q` writer; PROTOCOL.md usage line updated
- `test/hive-task-mutation.test.cjs` — +5 cases (task 1: askedBy/env/back-compat/security/preservation) +4 cases (task 2: source-text resolver clauses)
- `src/renderer/src/components/AskMeTab.tsx` — `recipientOf(task)`, two-message `sendAnswer`, recipient-labelled badge
- `src/main/hive.ts` — `godLine` rewrite, `capabilityLine()` roster consumer, two new imports
- `test/hive-roster-injection.test.cjs` — +4 cases (gapped-engine row, byte-for-byte no-gap, 24-row worst case, ADR-0002 seam)

## Decisions Made

See `key-decisions` in frontmatter — the kimi→copilot substitution (D-01), the length-normalization fix for the byte-for-byte pin, and the 01-21 precondition's literal-vs-actual resolution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a fragile row-matching bug in the roster test's own construction**
- **Found during:** Task 3, while writing the "claude rows carry no capability clause" clause
- **Issue:** `rows.find((r) => r.startsWith(id))` silently never matches the FIRST row, because the roster's `[LIVE ROSTER …] N ACTIVE agent(s): ` preamble precedes the first agent id on that row only
- **Fix:** Matched on `r.includes(\`${id} "\`)` instead, which works uniformly for every row position
- **Files modified:** test/hive-roster-injection.test.cjs
- **Verification:** all 8 tests in the file pass; re-ran with the bug reintroduced to confirm it really did fail before the fix
- **Committed in:** `64d813b` (part of task 3 commit)

**2. [Rule 1 - Bug] Fixed an environment-fragile absolute-length assertion before it shipped**
- **Found during:** Task 3, writing the byte-for-byte no-gap-floor test
- **Issue:** The roster string embeds `os.tmpdir()`'s absolute path in its "auto-injected from <path>" preamble; a hardcoded raw `line.length` literal would pass on this machine and fail on any CI runner or developer machine with a differently-sized temp directory
- **Fix:** Strip the volatile preamble (`line.replace(/^\[.*?\] /, '')`) before comparing lengths; the remaining content is 100% deterministic fixture text
- **Files modified:** test/hive-roster-injection.test.cjs
- **Verification:** measured both BASE (`674ed4c`) and HEAD hive.ts against the SAME reused home directory in the same script run — content-only length identical (469) both before and after
- **Committed in:** `64d813b` (part of task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in this plan's own new test code, caught before commit, not pre-existing issues)
**Impact on plan:** Both fixes were to test assertions this plan itself was writing; neither touched production code beyond what the plan specified. No scope creep.

## Issues Encountered

The Task 1 D-37-corollary RED drive (`Object.hasOwn` vs `=== undefined`) could not be reproduced through this hive's real persistence layer, because `JSON.stringify`/`JSON.parse` already strips `undefined`-valued keys before any assertion runs. Documented above rather than fabricating a RED run that the real storage layer cannot produce; `Object.hasOwn` is still shipped as the assertion because it is the objectively correct form regardless.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- GSD-06 is closed. `AskMeTab.tsx` no longer has a hardcoded recipient; any live agent can receive the human's answer.
- PARITY-01a/01b's remaining gap (`canReceiveInbox: false` engines still bounce to the god) is unowned by this plan and is named explicitly above for whichever plan closes it.
- 02-12 (wave 9, the honesty-ledger pass) inherits nothing to correct in README.md/HIVE.md/docs/message-queue.md regarding answer routing — confirmed by a live grep this session, command included above.
- `docs/adr/0002-prompt-cache-invariant.md`'s own admission ("no test that fails when a Date.now() creeps into the prefix") is now partially closed: `test/hive-roster-injection.test.cjs`'s new ADR-0002 seam case asserts zero `Date.now()` inside the agent-facing-text seam specifically, narrowed to the seam this plan owns.

## CI status (verification's own requirement — read honestly, not fabricated)

`gh pr checks` returns rows for PR #78, but its head sha (`bb1ad703`) is **not** this session's HEAD (`64d813b`) — nothing from this plan (or the seven prior unpushed 02-xx commits before it) has been pushed. **MEASUREMENT UNAVAILABLE — a fresh push and `gh pr checks` against this plan's actual commits** is needed to get real cross-platform CI signal; the rows currently visible reflect a stale prior state and are not reported here as if they verify this plan's work.

---
*Phase: 02-the-daemon-and-the-protocol*
*Completed: 2026-08-24*

## Self-Check: PASSED

All 5 modified files confirmed present on disk (`src/main/hiveTemplates.ts`, `src/renderer/src/components/AskMeTab.tsx`, `src/main/hive.ts`, `test/hive-task-mutation.test.cjs`, `test/hive-roster-injection.test.cjs`), this SUMMARY.md confirmed present, and all 3 task commits (`45047cc`, `ebf219c`, `64d813b`) confirmed in `git log --oneline --all`.
