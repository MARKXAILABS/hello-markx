---
phase: 04-overnight-on-a-repo-that-matters
plan: 20
subsystem: infra
tags: [composition-root, dependency-injection, hooks, approvals, audit-log, boot]

# Dependency graph
requires:
  - phase: 04-06
    provides: "the `hostAllowlist` and `openAsk` optional trailing constructor parameters on `HookServer`, and `commandShapeDenial`'s host arm"
  - phase: 04-15
    provides: "`recordToolCall` and `publishApproval` parameters, `openApproval`/`ApprovalRegistry` inside `HookServer`, and `ASK_TTL_MS`"
  - phase: 04-02
    provides: "`PersistStore.recordToolCall` / `toolCalls`, the `tool_calls` table"
provides:
  - "the four wave-2/wave-4 `HookServer` seams supplied at the SOLE production construction site in `bootFloor`"
  - "`test/boot-floor.test.cjs`'s `composition root` block — 7 cases, each observing a seam's EFFECT on a really-booted floor"
  - "a measured demonstration that an eagerly-bound `recordToolCall` throws at boot (T-04-LOG-11 is real, and loud rather than silent)"
  - "the corrected reading of the wave-2-to-4 hard-deny window: it closed at 04-15, not here"
affects: [04-17, 04-18, 04-19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "composition-root wiring asserted by EFFECT on a really-booted floor, never by grepping the argument list"
    - "a positional `undefined` for a seam production must deliberately NOT supply, with the reason in a comment beside it"
    - "an IIFE-captured `Set` inside an argument list, so per-call dedupe state needs no module-scope `let` (contextual typing survives the IIFE — proven, see below)"

key-files:
  created:
    - .planning/phases/04-overnight-on-a-repo-that-matters/04-20-SUMMARY.md
  modified:
    - src/main/floor/boot.ts
    - test/boot-floor.test.cjs

key-decisions:
  - "`openAsk` is passed a positional `undefined`, not a handler — 04-15's handoff and the parameter's own doc block both forbid an override at the composition root"
  - "`hostAllowlist`'s fallback is `?? []`, not `?? DEFAULT_HOST_ALLOWLIST`, because importing the default would have put the diff outside the argument list — and the two are behaviourally identical on every reachable config state"
  - "the ask registry's TTL is asserted by EFFECT (`expiresAt - openedAt`), opened through a CONFIG-DRIVEN host refusal so the case is red when the host getter is missing too"
  - "`publishApproval` de-duplicates by ask id: the registry publishes the whole open list on every change, so answering one of two open asks would re-toast the other"
  - "the test drives the REAL socket of a really-booted floor rather than `test/gate-harness.cjs`, which builds its own `HookServer` — the one thing that cannot answer this plan's question"

patterns-established:
  - "Per-seam mutation probes: drop exactly one argument, confirm exactly the cases that name it go red"
  - "Register the driving agent in the hive before asserting a host verdict — an unregistered agent's `cwdValid: false` makes GATE-01's PATH arm answer first and every host assertion pass vacuously"

requirements-completed: [GATE-03, GATE-05, RECORD-01]

# Metrics
duration: 25min
completed: 2026-08-25
---

# Phase 04 Plan 20: The Composition Root — Summary

**The four `HookServer` seams waves 2 and 4 declared and nobody supplied are now supplied at the one production construction site, and each is proven by its effect on a really-booted floor: a verdict that changes with the operator's config, a real `hive_ask`, a real `tool_calls` row with a token-derived agent id, and a toast that honours the notifications setting.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-25T16:27:26Z (worktree base reset onto `04d71b1`, per `git reflog`)
- **RED commit:** 2026-08-25T16:41:26Z
- **GREEN commit:** 2026-08-25T16:48:59Z
- **Tasks:** 2/2
- **Files modified:** 2

## Task Commits

| Task | Commit | What |
|---|---|---|
| 2 (RED gate, `tdd="true"`) | `fb7795c` | `test(04-20)` — the composition block, 6 of 7 cases red against the un-wired tree |
| 1 (GREEN gate) | `8db591f` | `feat(04-20)` — the four arguments at the sole `new HookServer(...)` |

**Task order was inverted deliberately.** Task 2 carries `tdd="true"` and its own action says *"run it before task 1's edit"*. Committing the wiring first would have made the RED unobservable in git history, so the RED gate is the first commit and the GREEN gate the second — the sequence `<tdd_execution>` prescribes. `fb7795c` is intentionally a red tree; `8db591f` is green and every commit after it is green.

## The two measurements the whole plan rests on

Re-measured at wave start, **before** any edit, because plans 04-03, 04-09 and 04-11 all insert above this site (the plan's wave-0 figures were `:1120` / `:1149`, drifted by +134):

```
$ grep -n 'new HookServer(' src/main/floor/boot.ts
1254:  hookServer = new HookServer(

$ grep -n 'new PersistStore()\|persist.open()' src/main/floor/boot.ts
1282:  persist = new PersistStore();
1296:  try { persist.open(); } catch (e) { console.error('[db] open failed:', e); }
```

**28 lines** between the construction and the store's assignment; 42 to `persist.open()`. Both are AFTER. That is why `recordToolCall` had to be a closure — and it is now measured rather than argued (below). Post-edit the same symbols sit at `:1280`, `:1359` and `:1373`.

## What was wired, and what was deliberately not

Twelve positional arguments now. The four appended, in `hooks.ts` declaration order:

| # | Seam | Supplied | Why |
|---|---|---|---|
| 9 | `hostAllowlist` | `() => readConfig().hostAllowlist ?? []` | read at CALL time, so a Settings edit takes effect without a restart |
| 10 | `openAsk` | **`undefined`** | positional placeholder only — see below |
| 11 | `recordToolCall` | a closure over the module-scope `persist` | boot ordering (28 lines) |
| 12 | `publishApproval` | the toast half, gated + de-duplicated | the data half needs no line here |

### `openAsk` — did it need a constructor argument at all? **No.**

The plan's action told me to read the shipped signature before writing a line, and the answer is in the parameter's own doc block at `src/main/hooks.ts:663-671`:

> *"PRODUCTION PASSES NOTHING HERE, and the composition root must not start: an override replaces the registry entry, the poll handle and the operator page all at once, which is GATE-05 switched off by a constructor argument."*

`04-15-SUMMARY.md`'s downstream contract says the same in its own words (*"Do NOT wire `openAsk`"*). `HookServer.openApproval` supplies the handler itself and only falls back to the parameter when one is present. So this plan appended **four** arguments and wired **three** seams; the fourth position carries a `undefined` with the reason beside it, because the parameters are positional and 11 and 12 cannot be reached past it. `awk`-bounded assertion on `openAsk` was therefore not written — the acceptance criterion made it conditional on 04-15 leaving it as a constructor argument, and 04-15 did not.

### `ttlMs` — nowhere to pass it

`grep -c 'ttlMs' src/main/floor/boot.ts` → **0**, as required. The registry is constructed inside `HookServer` (`hooks.ts:615-618`, `ttlMs: ASK_TTL_MS`), so there is no composition-root argument and none was invented.

**One criterion could not be met literally and was resolved in the direction that keeps the mechanical assertion true.** The action says to *"Say in that comment that `ttlMs` is deliberately NOT among them"*, and the criterion says `grep -c 'ttlMs'` must return `0`. Writing the token would have broken the grep. The comment therefore says it without the literal — *"the ask TTL is not passed either, and there is nowhere here to pass it: plan 04-15 gives it at the `new ApprovalRegistry(...)` site inside `HookServer`"*. The reader is told; the counter still reads 0.

### `hostAllowlist` — `?? []`, and why not `?? DEFAULT_HOST_ALLOWLIST`

The action's literal was `() => readConfig().hostAllowlist ?? DEFAULT_HOST_ALLOWLIST`. That constant is **not** imported in `boot.ts` (measured: the `../config` import block carries `readConfig, writeConfig, OPS_STANDUP_MISSION, HEARTBEAT_MISSION, COMPACT_MAINTENANCE_MISSION, ScheduledMission` and nothing from `commandShape`), so writing it would have added an import line — outside the argument list, against D-35 and against the plan's own *"`git diff` touches only lines between the start and end of the call"*.

`?? []` is behaviourally identical on every reachable config state, and that is measured rather than asserted:

- `readConfig()` merges `{ ...DEFAULTS, ...parsed }` (`config.ts:934`) and `DEFAULTS.hostAllowlist` is `[...DEFAULT_HOST_ALLOWLIST]`, so a **deleted key** already arrives as the shipped default list. The `??` branch is unreachable for it.
- The only way to reach `??` is an explicit `"hostAllowlist": null` in `config.json` — a malformed value, neither "deleted" nor "emptied". `commandShapeDenial`'s own contract covers it: *"absent, empty or not an array of strings all DENY"*, and `Array.isArray(null)` is false, so passing `null` through and passing `[]` produce the **same verdict**. `[]` is the judge's own answer for a malformed list, and it is the fail-closed direction.

The `awk`-bounded count is still exactly 1.

### `publishApproval` — the data half needed no line

Plan 04-17 does not receive a push; it **pulls** through `floor.hookServer.openApprovals()` (`04-15-SUMMARY.md`'s contract, `approvals.ts:81-84`, `hooks.ts:871-878`), and `webhook.ts`'s `openAsks` getter is wired in `index.ts`, not here. So there is no data sink at the composition root to hand the list to, and inventing a renderer channel would have been plan 04-18's decision taken in plan 04-20's file. What only this file can add is the operator's attention — the toast — and it is gated on `readConfig().notifications`, the same expression `breakerToast` and the watchdog's `notify` use.

It **de-duplicates by ask id**, which the plan did not ask for and which is a Rule-2 addition (below).

## RED runs, recorded

### RED run 1 — against the tree at `04d71b1`, before any `boot.ts` edit

```
✔ 04-20 composition: the floor is live enough for the negatives below to mean anything
✖ 04-20 GATE-03: the host allowlist is the OPERATOR's — two configs, two verdicts
✖ 04-20 GATE-03/GATE-05: an operator list that EXCLUDES a default host refuses it, and ASKS
✖ 04-20 GATE-05: the production registry's TTL is the derived ASK_TTL_MS, by effect
✔ 04-20 GATE-05: ask, bare deny and neither — three legs, because two do not discriminate
✖ 04-20 RECORD-01: a real row in the floor's OWN store, with a derived agent id
✖ 04-20 GATE-05: the publisher fires, and honours the operator's notifications setting
ℹ tests 29  ℹ pass 24  ℹ fail 5  ℹ skipped 0
```

**RED run 1 was not trusted, and it was right not to be** — see the vacuous pass found below. The three-way case passed, and it should not have.

### RED run 2 — the same tree, after removing the confound

```
✖ 04-20 GATE-03: the host allowlist is the OPERATOR's — two configs, two verdicts
  AssertionError: curl at inside.example was refused on a floor whose config LISTS it — the
  production HookServer is answering from DEFAULT_HOST_ALLOWLIST, i.e. the hostAllowlist getter
  never reached the composition root (T-04-NET-02)

✖ 04-20 GATE-03/GATE-05: an operator list that EXCLUDES a default host refuses it, and ASKS
  AssertionError: github.com was allowed on a floor whose operator list excludes it — the judge
  is reading DEFAULT_HOST_ALLOWLIST, not the config

✖ 04-20 GATE-05: the production registry's TTL is the derived ASK_TTL_MS, by effect
  AssertionError: no ask was opened, so there is no TTL to read

✖ 04-20 GATE-05: ask, bare deny and neither — three legs, because two do not discriminate
  AssertionError: an EMPTIED host allowlist allowed an outbound host — the judge is answering
  from the shipped default, so the operator's "no hosts" was never heard

✖ 04-20 RECORD-01: a real row in the floor's OWN store, with a derived agent id
  AssertionError: no tool_calls row reached floor.persist. `persist` is a module-scope `let`
  assigned AFTER the new HookServer(...) call, so an EAGERLY bound `persist.recordToolCall`
  captures undefined and every tool call is silently unrecorded (T-04-LOG-11) — the argument
  has to be a closure read at CALL time

✖ 04-20 GATE-05: the publisher fires, and honours the operator's notifications setting
  AssertionError: opening an ask raised no toast — publishApproval never reached the production
  HookServer, so an overnight floor waits on a question nobody is told about

ℹ tests 29  ℹ pass 23  ℹ fail 6  ℹ skipped 0
```

Six of seven red, each naming its own missing seam. The seventh is the liveness lower bound and passes deliberately — it is what stops a `bootFloor` that threw halfway from satisfying the negatives.

### GREEN, after `8db591f`

```
ℹ tests 29  ℹ pass 29  ℹ fail 0  ℹ skipped 0
```

## Mutation probes — every argument, one at a time

The criterion *"every one of the four assertions fails if its argument is removed"* was verified per-argument, not inferred from the all-four-absent RED:

| Mutation | Result |
|---|---|
| `hostAllowlist` → `undefined` | **4 red** — both host cases, the TTL case, the emptied-allowlist deny |
| `persist.recordToolCall(row)` → `void row` | **1 red** — RECORD-01 only |
| `deps.notify(...)` → `void a` | **1 red** — the publisher only |
| `if (!readConfig().notifications) return;` removed | **1 red** — *"an operator who turned notifications off was toasted anyway"* |
| `(row) => {…}` → `persist.recordToolCall.bind(persist)` | **20 of 29 red**, all `TypeError: Cannot read properties of undefined (reading 'recordToolCall')` |

The last row is T-04-LOG-11 **measured**. It also corrects the threat register's wording in one respect worth recording: the eager binding does not fail *silently*. `persist` is a bare `let` with no initializer, so an eager reference throws inside `bootFloor` and the floor does not boot at all. The hazard is real and the closure is load-bearing; the failure mode is a loud boot crash, not a quiet empty ledger. (A quiet empty ledger is what the **absent** argument produces, which is what RED run 2 shows.)

## Acceptance measurements

All symbol-bounded, none by a line window (R3 rule 1):

```
grep -c 'new HookServer(' src/main/floor/boot.ts                                        = 1
grep -c 'ttlMs' src/main/floor/boot.ts                                                  = 0
awk '/hookServer = new HookServer\(/,/^  \);$/' … | grep -c 'hostAllowlist'             = 1
                                                    grep -c 'recordToolCall'            = 1
                                                    grep -c 'publishApproval'           = 1
                                                    grep -c 'persist.recordToolCall'    = 1
                                                    grep -c 'readConfig().notifications'= 1
git diff --stat  (task 1)                          = src/main/floor/boot.ts only, 78+/1-
git diff -U0 … | grep '@@'                         = @@ -1253,0 +1254,26 @@  and  @@ -1258 +1284,52 @@
```

`git diff --stat src/main/hooks.ts src/main/approvals.ts src/main/config.ts src/main/hiveProvisioning.ts src/main/floor/deps.ts` — **empty**. No file outside `boot.ts` and `test/boot-floor.test.cjs` was touched.

**One boundary note, stated rather than glossed.** The criterion says the diff touches only lines *between* the start and end of the call; the action says to add a comment *above* the argument list. Both were followed, so the diff is two hunks: a 26-line header comment immediately above `hookServer = new HookServer(`, and the argument list itself. Nothing else in the 1 400-line file moved — the timer block, `SHUTDOWN_STEPS`, the `DeliveryService` dep object and the `Floor` return are all untouched, which the four green pins in `test/boot-floor.test.cjs` (`restorePointTimer`, `watchdogTimer`, the shutdown-coverage loop, the `floor:quiet` publisher count) confirm behaviourally.

## Gates

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors, both projects |
| `npm run lint` | exit 0 |
| `node --test test/boot-floor.test.cjs` | 29/29, 0 skipped |
| `node --test test/hive-durability.test.cjs test/suite-integrity.test.cjs` | 14/14 |
| `npm test` (full) | **1027 tests, 1020 pass, 0 fail, 7 skipped** |

Baseline at `04d71b1`, measured in this session before any edit: **1020 tests, 1013 pass, 0 fail, 7 skipped**. Delta is +7 tests, +7 passes, **skipped unchanged**. `grep -c 'skip' test/boot-floor.test.cjs` unchanged; `suite-integrity`'s `FROZEN = { win32: 6, other: 1 }` untouched.

## Deviations from Plan

### 1. [Rule 1 — bug in this plan's own test] a vacuous pass, caught by probing instead of trusting RED run 1

- **Found during:** Task 2, between RED run 1 and RED run 2.
- **Issue:** RED run 1 showed the three-way ask/deny/neither case **passing** against an un-wired tree, and the "operator list excludes a default host" case failing on its *second* assertion rather than its first. Both are impossible if the case is measuring what it claims, so a probe was written against a really-booted floor instead of reasoning about it. Measured output:

  ```
  [hive] PreToolUse DENIED agent=a1 tool=Bash: Denied: main cannot LOCATE this relative
  target. Your agent record has no ABSOLUTE working directory (its registry cwdValid is
  false)… | target: curl https://github.com/x
  ```

  The driving agent `a1` was not registered in the hive, so `cwdValid` was false and **GATE-01's protected-PATH arm** answered `deny` for a command the host arm had allowed. Two host cases were asserting a deny from an arm they were not testing, and would have passed pre-wiring and post-wiring alike — 04-VALIDATION.md's Anti-Vacuous-Pass class, in this plan's own new tests.
- **Fix:** `bootedFloor` now calls `floor.hive.ensureAgent({ id: 'a1', … cwd: env.harnessHome })`. Re-probed: the same payload returns `{}`. RED run 2 is the honest one, and the failure count went **up**, 5 → 6.
- **Files:** `test/boot-floor.test.cjs` (the `bootedFloor` helper and its comment).
- **Commit:** `fb7795c`.

### 2. [Rule 2 — correctness] `publishApproval` de-duplicates by ask id

- **Plan said:** *"a function that (a) hands the open list to whatever plan 04-17 reads and (b) raises the operator's attention through the already-wired `deps.notify`."*
- **Shipped:** the same, plus an IIFE-captured `Set<string>` of already-paged ids, pruned to the currently-open set on every call.
- **Why:** `ApprovalRegistry.publish` is called with the **whole open list** on every change — `open()`, `answer()`, and any `sweep()` that settled something (`approvals.ts:126-138, 160-175, 198-224`). A bare publisher would re-toast every still-open ask each time one was answered or expired. The file's own `#42` comment states the standard being applied: *"a toast for every turn-end trains the human to ignore all of them."* Four lines, no module-scope state, inside the argument list.
- **Ladder check (skipped, and when to add):** no `Map` of timestamps, no coalescing window, no per-agent throttle — a `Set` of ids is enough because ids are `randomBytes(16)` and never reused. Add a window only if a measurement shows burst asks.

### 3. [Rule 1 — the plan's literal would have broken its own criterion] `?? []` instead of `?? DEFAULT_HOST_ALLOWLIST`

Documented in full above. Behaviour-identical on every reachable config state; keeps the diff inside the argument list.

### 4. [Rule 1 — same class] the header comment names the ask TTL without the literal `ttlMs`

Documented in full above. `grep -c 'ttlMs'` → 0 holds.

### 5. [scope] `test/hive-durability.test.cjs` was NOT edited

The plan required the M-10 defect there to be reported, not fixed. It is reported below. No plan in this phase owns that file.

## Findings for plan 04-19's close

### F1 — `test/hive-durability.test.cjs:197`'s argument slice is inert (M-10, confirmed by measurement)

The pin's **single-call** clause is real and does bite:

```js
const at = src.indexOf('new HookServer(');
assert.equal(src.indexOf('new HookServer(', at + 1), -1);   // ← correct, and it held
```

The clause built on the slice does not:

```js
const args = src.slice(at, src.indexOf('\n);', at));
```

`boot.ts`'s closing paren is indented (`  );`), so `indexOf('\n);', at)` returns **-1** and `slice(at, -1)` runs to the end of the file. Measured on the current tree: `at = 57144`, `end = -1`, slice length **14 315** of a **71 460**-character file — about 20% of `boot.ts`, not one argument list. `recordCostSample` happens to occur exactly once in that range today, so the assertion is sound by luck rather than by construction, and it would be satisfied by the token appearing anywhere below the call.

This plan's own criteria used `awk '/hookServer = new HookServer\(/,/^  \);$/'`, which is the correct boundary and which is what the numbers in "Acceptance measurements" were taken with.

**Also worth recording for whoever fixes it:** a header comment above the construction that contains the literal text `new HookServer(` breaks the single-call clause outright (it becomes the `at` match, and the real call becomes the "second construction"). This was hit and corrected during task 1 — the comment now says "construction sites" instead. Any future comment near this call has the same trap.

### F2 — the "hard deny with no operator recourse" window closed at **04-15**, not here

`04-06-SUMMARY.md` § Known Stubs states that until plan 04-20 wires `openAsk`, *"an `ask` verdict is answered as a hard deny with no operator recourse"*, and this plan's `<threat_model>` restates it as T-04-NET-04. **Measured against the tree at `04d71b1`, before this plan's wiring:** `curl https://inside.example/x` under the default allowlist came back with a full `hive_ask` handle, and `git push origin +main` did too. 04-15 made `openApproval` a **method** on `HookServer` with its own registry, so the ask path reached production the moment 04-15 landed in wave 4 — `openAsk` is only an override.

Both statements were written before 04-15 shipped and are now stale. The accurate window is **04-06 (wave 2) → 04-15 (wave 4)**, and plan 04-13 task 4's live codex run sits inside it, unchanged.

What this plan actually changes for that threat is narrower and was tested in the discriminating direction: the host the judge asks *about* is now the **operator's** list. The shipped case boots a floor whose `hostAllowlist` is `['inside.example']` and drives `curl https://github.com/x` — a host `DEFAULT_HOST_ALLOWLIST` **allows** — and asserts both the refusal and the `hive_ask`. That case was red before the wiring (*"github.com was allowed on a floor whose operator list excludes it"*), which the plan's originally-specified shape would not have been.

### F3 — case 2b was made red-able by re-rooting it, and the plan's own claim needed it

The plan's `<truths>` acknowledge that `ASK_TTL_MS` reaches the registry inside `HookServer` and that `boot.ts` passes no TTL. That makes the TTL assertion green pre-wiring if the ask it reads is opened by a force-push, which needs no seam. It is therefore opened here through the **config-driven host refusal** instead, so the case is red when the host getter is absent (*"no ask was opened, so there is no TTL to read"*) and green only on a floor that read the operator's list. Both halves the criterion asks for are asserted: `expiresAt - openedAt === ASK_TTL_MS` (imported from `hiveProvisioning.ts`, never written as a literal) and `hive_ask.deadlineMs === entry.expiresAt`.

### F4 — `boot.ts`'s `new PersistStore()` now matches twice on a naive `grep -c`

The `recordToolCall` comment quotes `persist = new PersistStore()` to name the ordering hazard. No test pins that count today (checked: only `test/db-fts`, `test/record-persist` and `test/record-retention` construct one, each in their own file). Named here in case a future census clause counts it.

## Threat Flags

None. This plan added no network endpoint, no auth path, no file-access pattern and no schema change. It supplied arguments at an existing construction site; every trust boundary it touches was already in the plan's `<threat_model>`.

## Known Stubs

None. `openAsk`'s `undefined` is not a stub — it is the production value 04-15's design requires, stated in that parameter's own doc block, and its absence is the wired behaviour rather than a placeholder. The `publishApproval` data half is not a stub either: the registry IS the data source and plan 04-17 pulls it, which the shipped test asserts (`openApprovals()` still returns the entry with `notifications: false`).

## Verification against the plan's `<success_criteria>`

| Criterion | Result |
|---|---|
| all four seams supplied at the sole construction, located by symbol; still exactly one | ✅ `grep -c` = 1; three seams wired, `openAsk` deliberately `undefined` (§ above) |
| the production registry's TTL is `ASK_TTL_MS`, proven by effect | ✅ `expiresAt - openedAt === ASK_TTL_MS` **and** `deadlineMs === expiresAt`, on a floor booted through `bootFloor` |
| a denied host asks rather than denying | ✅ and re-rooted so the case discriminates — see F2 |
| each seam proven by an effect: config-driven verdict change, real `hive_ask`, real row with non-null target + derived agent id, gate honoured both ways | ✅ all four, plus the forged-`agent_id` negative |
| every case seen RED before the wiring, output in the SUMMARY | ✅ 6 of 7 red (RED run 2, above); the 7th is the deliberate positive lower bound |
| `hooks.ts`, `approvals.ts`, `config.ts`, `hiveProvisioning.ts`, `deps.ts` untouched | ✅ `git diff --stat` empty on all five |
| the SUMMARY states whether `openAsk` needed an argument, and the boot-ordering reason for the closure | ✅ both, with the closure's reason measured (`TypeError` at boot) rather than asserted |

## Self-Check

- `src/main/floor/boot.ts` — FOUND, modified, 12 positional arguments at the sole construction.
- `test/boot-floor.test.cjs` — FOUND, modified, 29 cases, 0 skipped.
- `.planning/phases/04-overnight-on-a-repo-that-matters/04-20-SUMMARY.md` — FOUND (this file).
- Commit `fb7795c` — FOUND in `git log`.
- Commit `8db591f` — FOUND in `git log`.
- `STATE.md` / `ROADMAP.md` — deliberately NOT modified (parallel-worktree rule; the orchestrator owns those writes).

## Self-Check: PASSED
