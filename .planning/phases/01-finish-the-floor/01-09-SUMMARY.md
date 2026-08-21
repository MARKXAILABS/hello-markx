---
phase: 01-finish-the-floor
plan: 09
subsystem: cost-enforcement
tags: [circuit-breaker, token-budget, cost-ledger, ipc, electron, node-test]

# Dependency graph
requires:
  - phase: 01-06
    provides: "taskSpend() over the WHOLE ledger from clamped consecutive diffs; the card-lifetime-bounded costByTask accumulator; pruneCostByTask"
  - phase: 01-08
    provides: "the FLOOR-09 production injection (recordCostSample in index.ts) — so the number this arm enforces against includes the proxy tier"
provides:
  - "src/main/breaker.ts: one budget arm in the existing evaluate() chain, between the (b) storm arms and the (a) floor-wide caps"
  - "src/main/breaker.ts: BreakerInput widened with an optional budget:{taskId,tokens,cap}"
  - "src/main/breaker.ts: an arm may now cap its OWN trip below the config ceiling (trip.ceiling) — caps an escalation, never demotes"
  - "src/main/hive.ts: budgetForAgent(agentId) — the single accessor the beat calls, so plan 01-10's index.ts edit is one line"
  - "src/main/hive.ts: hive:tasks rows widened with {tokens, budgetTokens, pct} (D-22) — no new IPC channel, no preload edit"
  - "src/main/hive.ts: writeTasks() strips the derived meter, so the widening cannot leak into tasks.json"
  - "9 new tests: 5 breaker enforcement + 4 hive meter/accessor"
affects: [01-10, 01-13, 01-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "a breaker arm may declare its own escalation ceiling (trip.ceiling), turning a boolean ladder into a two-band arm"
    - "derived read-surface fields are stripped at the single persist choke point, not guarded at each caller"

key-files:
  created: []
  modified:
    - src/main/breaker.ts
    - src/main/hive.ts
    - test/engine-parity.test.cjs
    - test/hive-protocol-v2.test.cjs
    - test/hive-task-mutation.test.cjs

key-decisions:
  - "The >= 80% band trips with ceiling:'steering' rather than not tripping at all — a boolean arm on a one-rank-per-beat ladder can otherwise only oscillate healthy<->steering, re-sending the steer mail every other beat"
  - "budgetForAgent resolves through activeTaskId(), the SAME resolver appendCostLedger stamps task_id with, so the rows a card was billed on and the card its cap is read from can never disagree"
  - "budgetForAgent returns null for a card that has LEFT the board — 01-06 prunes by card lifetime so taskSpend() answers 0 there, and {tokens:0, cap:N} would read as 'comfortably under budget' and recover an agent that had just been constrained"
  - "writeTasks() strips the derived meter at the choke point: index.ts's webhook path and realtimeActions' voice actions BOTH read rows out of tasks() and hand those same objects back"
  - "The D-22 row-shape test landed in test/hive-protocol-v2.test.cjs, where taskSpend and the #34 cost tests already live and where this plan's own B-nan criterion points"
  - "The wiring test's window is ANCHOR -> STRIP -> BOUND, not slice-then-strip: the plan's literal 2,000 raw characters end three lines short of inputs.push"
  - "FLOOR-10 is NOT closed here and issue #34 stays open — the production beat still does not populate BreakerInput.budget"

patterns-established:
  - "Two-band breaker arm: warn-and-hold at a fraction of cap, escalate past 100%, ceiling inherited from config"
  - "Handoff artifacts get their own positive AND negative control runs before being handed on"

requirements-completed: []  # FLOOR-10 is SPLIT. 01-09 ships the arm, the accessor and the handoff; 01-10 is the closer. Requirement row left Pending — plan 23 owns the checkboxes (01-02/04/05/06/07/08 precedent).

# Metrics
duration: 55m
completed: 2026-08-21
---

# Phase 01 Plan 09: Per-Task Token Budget, Enforced Summary

**`taskSpend().over` gained its first consumer: a two-band budget arm in the existing breaker ladder that takes an over-cap card's assignee — and only its assignee — to `constrained` across two beats, never to `stopped`; plus the `hive:tasks` meter and the one accessor that makes plan 01-10's production edit a single line.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-08-21T04:52Z
- **Completed:** 2026-08-21T05:20Z (CI green at 05:17Z)
- **Tasks:** 3 of 3
- **Files modified:** 5

## Accomplishments

- The budget arm is **proven enforced**, not asserted: the five breaker tests were written FIRST and run RED against the unenforced source (4 of 5 failing), then green after the arm landed.
- `hive.budgetForAgent()` exists and is null-safe in the three ways that matter — no card, no cap, and **card off the board** (the 01-06 prune hazard this plan was explicitly told to design against).
- The D-22 meter rides `hive:tasks`; a real row-shape assertion pins it by key AND by value, and a null-cap card reads `null`/`null`, never `NaN`/`Infinity`.
- **A defect in the handed-off wiring test was found and fixed before handing it on** — the plan's prescribed slice-then-strip window ends three lines short of `inputs.push`, so as written it would have been red in wave 5 no matter what plan 10 did.
- **A defect this plan would otherwise have introduced was found and fixed at source**: two production paths round-trip `tasks()` rows back into `writeTasks`, so the widening would have written a stale meter into `tasks.json`.
- Full suite green on three platforms at `17bf26d`: 478 tests, 0 fail (469 before).

## Task Commits

1. **Task 1: Verify every FLOOR-10 clause against current source** — *no commit (evidence only; the task declares `<files>(none — evidence only)</files>`)*. Full pasted output below.
2. **Task 2: Add the budget arm and widen the hive:tasks row** — `c68f229` (feat)
3. **Task 3: Prove enforcement with a two-beat test in a file that actually runs** — `17bf26d` (test)

## Files Created/Modified

- `src/main/breaker.ts` — `BreakerInput.budget`, `BUDGET_STEER_FRACTION`, the budget arm, and `trip.ceiling` in `tick()`. +51 / -1.
- `src/main/hive.ts` — `budgetForAgent()`, the widened `tasks()` row, `stripDerivedTaskFields` + its use in `writeTasks()`. +90 / -3.
- `test/engine-parity.test.cjs` — 5 breaker enforcement tests (section 2b). +117.
- `test/hive-protocol-v2.test.cjs` — 4 tests: D-22 row shape, the writeback strip, `budgetForAgent`, the off-board card. +132.
- `test/hive-task-mutation.test.cjs` — **deviation**, see below. +19 / -1.

---

## T-INDEX HANDOFF → 01-10 (FLOOR-10)

### Status

```
FLOOR-10 BUDGET ARM NOT FED IN PRODUCTION — T-INDEX INJECTION HANDED TO 01-10
```

Measured at `17bf26d`:

```
$ grep -c "budgetForAgent" src/main/index.ts
0
```

`src/main/index.ts` is T-INDEX; plan 08 held it in wave 4 (this wave) and plan 10 holds it in wave 5. `use_worktrees` is `false`, so two plans writing one file in one wave is a lost update. It could not go to plan 08 either: the property calls `hive.budgetForAgent(...)`, a method **this plan mints in wave 4**, so a same-wave sibling applying it would break `npm run typecheck` whichever landed first. Wave 5 is the earliest wave in which the method is guaranteed to exist.

### The re-derived anchor

```
$ grep -n "const inputs: BreakerInput\[\]" src/main/index.ts
1560:  const inputs: BreakerInput[] = [];
```

**B-beat = 1560.** (The plan's informational pointer said `1492-1537`; re-derived at execution it is `1560`, and `inputs.push({` is at `1600`.) Verified this session that this is still the **sole** production constructor:

```
$ grep -rn "BreakerInput" src/main/*.ts
src/main/breaker.ts:51:export interface BreakerInput {
src/main/breaker.ts:228:  tick(inputs: BreakerInput[], nowMs: number): BreakerDecision[] {
src/main/breaker.ts:300:    input: BreakerInput,
src/main/index.ts:38:import { CircuitBreaker, type BreakerInput } from './breaker';
src/main/index.ts:1560:  const inputs: BreakerInput[] = [];
```

Five hits, one production constructor. No second constructor exists, so this handoff names one site and one site only.

### The one-property diff, verbatim

```
    inputs.push({
      agentId: id,
      sample,
+     budget: hive.budgetForAgent(id) ?? undefined,   // FLOOR-10 (#34) — per-card token cap
      progressing: now - lastCoordinationAt(id) < progressWindowMs || now - lastSpanAt < progressWindowMs
    });
```

`hive` is already in scope there. `budget` is optional, so the tree typechecks whether or not this lands — which is exactly why the wiring test below exists and why this status is recorded literally rather than assumed.

### The wiring test, verbatim — land it in the SAME commit as the line above

Put it in `test/engine-parity.test.cjs` (a real `node:test` file). It is deliberately **not** in this plan's commits: `grep -c "budgetForAgent" test/engine-parity.test.cjs` returns `0` at `17bf26d`, so the suite is never red between waves.

```js
test('FLOOR-10: the breaker beat actually populates BreakerInput.budget in production', () => {
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');

  // ANCHOR, then STRIP, then BOUND — in that order, and the order is load-bearing.
  // index.ts is ~5,800 lines, so an unbounded match is satisfied by any mention
  // anywhere, including a comment reading `// budget: hive.budgetForAgent(id) —
  // pulled in wave 6`. But runBreakerBeat's body is mostly prose: measured at
  // plan time, the raw 2,000 characters after the anchor end THREE LINES SHORT
  // of `inputs.push({`, so a slice-then-strip window can never see the property
  // and the test is red no matter what index.ts says. Strip first, bound after.
  const at = main.indexOf('const inputs: BreakerInput[]');
  assert.ok(at > 0,
    'runBreakerBeat no longer builds a BreakerInput[] — re-derive the anchor with: '
    + 'grep -n "const inputs: BreakerInput\\[\\]" src/main/index.ts');
  const beat = main.slice(at, at + 6000)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .slice(0, 2000);

  // Harness self-check: if this ever fails, the window moved and the assertion
  // below would be red for the wrong reason.
  assert.match(beat, /inputs\.push\(\{/,
    'the anchored window no longer reaches the inputs.push literal, so the real assertion '
    + 'below cannot see the property it is looking for — widen the raw slice');

  assert.match(beat, /budget:\s*hive\.budgetForAgent\(/,
    'the breaker beat must populate BreakerInput.budget, or the budget arm is an optional '
    + 'field nothing ever sets: every unit test above builds its own input and stays green '
    + 'while the cap goes unenforced in production. FLOOR-10 (#34) is not closed until this '
    + 'line exists in runBreakerBeat.');
});
```

**⚠ The plan's prescribed window was BROKEN and this version is the correction.** The plan says *"Anchor on `const inputs: BreakerInput[]`, take the following ~2000 characters, strip `//` and `/* */` comments from that slice, and match inside it."* Measured against the real file:

```
$ node -e "…; const raw = main.slice(at, at+2000); console.log(/inputs\.push\(/.test(raw))"
raw 2000-char window ENDS with: " (it was already being written to the cost ledger one line above). Same id,\r\n    // same l"
raw window contains inputs.push? false
```

`runBreakerBeat`'s body is ~70% comment prose, so the raw 2,000-character window stops **three lines before** `inputs.push({`. Slice-then-strip is red no matter what `index.ts` contains. Strip-then-bound (6,000 raw → strip → first 2,000) reaches the literal with room to spare and keeps the anti-vacuity property intact. **The sibling FLOOR-09 pin in plan 08 makes the same slice-then-strip requirement for the same reason — plan 23 should check whether it has the same defect.**

### Controls run on the handed-off test (all four, this session, `src/main/index.ts` never touched)

| Run | What the regex pointed at | Expected | Observed |
|-----|---------------------------|----------|----------|
| A2 | the real `/budget:\s*hive\.budgetForAgent\(/` vs the real `index.ts` | RED (the arm is unfed) | `EXIT=1`, `# fail 1`, failing on the budget assertion — **not** the harness self-check |
| B2 | `/budget:\s*hive\.budgetForAgentXX\(/` — a token known to be absent | RED | `EXIT=1`, `# pass 24`, `# fail 1` |
| C2 | `/agentId:\s*id,/` — a token that IS inside the window | GREEN | `EXIT=0`, `# pass 25`, `# fail 0` |
| D | the real regex, with the handoff line injected into the **in-memory string only** | GREEN | `EXIT=0`, `# pass 25`, `# fail 0` — the handoff DIFF and the handoff TEST agree |

Run C2 is what exposed the broken window (it was red before the fix, which is impossible for a token that is genuinely present). Run D proves the exact diff above satisfies the exact regex above. `git status --short src/main/index.ts` was empty after every run.

### The FLOOR-09 gate result (task 1)

The number this arm enforces against must include the proxy tier, or a budget silently excludes every qwen/crush agent's spend.

```
$ grep -n "recordCostSample" src/main/index.ts
525:  (s) => telemetry.recordCostSample(s)          // FLOOR-09 (#19) — proxy-tier cost sink
$ grep -c "recordCostSample" src/main/index.ts
1
$ grep -c "T-INDEX HANDOFF → 01-08 (FLOOR-09)" .planning/phases/01-finish-the-floor/01-06-SUMMARY.md
1
```

```
FLOOR-09 INJECTION: PRESENT
```

Plan 08 landed it earlier in this same wave. Recorded, not gated, exactly as task 1 requires. Plan 10 task 5 turns it into a hard STOP-gate in wave 5; plan 23 pins it in wave 9.

### TAP counters at handoff (`# skipped 0` is the point)

```
$ node --test --test-reporter=tap test/engine-parity.test.cjs
EXIT=0   # tests 24   # pass 24   # fail 0   # skipped 0   # todo 0
$ node --test --test-reporter=tap test/hive-protocol-v2.test.cjs
EXIT=0   # tests 23   # pass 23   # fail 0   # skipped 0   # todo 0
```

**FLOOR-10 is not closed at the end of this plan.** Plan 10 lands the line and its wiring test together; plan 23 pins it in wave 9.

---

## Task 1 — evidence, pasted

### Issue #34's acceptance text, verbatim

> **Fix**
> `task_id` on ledger rows; `budget_tokens` on a dispatch becomes that card's cap.

Clause 1 (`task_id` on ledger rows) closed before this plan — `appendCostLedger` stamps `task_id: this.activeTaskId(sample.agentId)`.
Clause 2 (`budget_tokens` **becomes that card's cap**) — a cap is only a cap if it stops something. That is the production enforcement path, which plan 01-10 lands. **#34 remains OPEN pending 01-10.**

### The clause is open: `.over` had no consumer

```
$ grep -rn "taskSpend" src/ --include=*.ts
src/main/hive.ts:134:   *  so spend against ONE card is attributable — see taskSpend(), which is the
src/main/hive.ts:239:// RECORD-03 (#34): the 1 MB `COST_TAIL_BYTES` window that `taskSpend()` used to
src/main/hive.ts:2613:   *  logTail and taskSpend: both read a file with a dozen writers that only ever
src/main/hive.ts:2702:      // row shape breaker.ts enforces caps against; see taskSpend().
src/main/hive.ts:2714:    // when it has already been built — otherwise the first taskSpend() call
src/main/hive.ts:2791:   *  the first `taskSpend()` — which after an app restart is what stops a card
src/main/hive.ts:2856:  taskSpend(taskId: string): { tokens: number; usd: number; budgetTokens: number | null; over: boolean } {
src/main/hooks.ts:573:    // One append-only file, two row semantics — and `taskSpend()` summed both,

$ grep -rn "\.over\b" src/ --include=*.ts
(no output; exit 1)
```

**Nothing consumed `.over` anywhere in `src/`.** That absence IS the evidence FLOOR-10 was open — D-42's four mis-assessed issues included exactly this one.

### `BreakerInput` — five hits, one production constructor

Pasted in the handoff section above. **B-beat = 1560.**

### Where a per-task cap is configured today

```
$ grep -n "budget\|budgetTokens\|budget-tokens" src/main/*.ts src/shared/*.ts   (cap-relevant hits only)
src/main/hive.ts:136:  budgetTokens?: number;
src/main/hive.ts:2859:    const cap = this.ledger().tasks.find((t) => t.id === taskId)?.budgetTokens;
src/main/hive.ts:3150:  if (!title) die('usage: task.cjs add "<title>" [--assignee id] … [--budget-tokens N] …');
src/main/hive.ts:3161:  if (num(f['budget-tokens']) !== undefined) card.budgetTokens = num(f['budget-tokens']);
src/main/hive.ts:3183:  if (num(f['budget-tokens']) !== undefined) patch.budgetTokens = num(f['budget-tokens']);
```

**A per-task cap field ALREADY EXISTS** — `HiveTask.budgetTokens?: number` at `hive.ts:136`, settable from `bin/task.cjs` with `--budget-tokens N` on both `add` and `patch`. **No cap field had to be created**, so that conditional branch of task 2 did not fire.

### The hand-rolled harnesses — the whole set of eight

```
$ for f in test/*.test.cjs; do grep -qE "require\('node:test'\)" "$f" || echo "$f"; done
test/agent-provider.test.cjs
test/breaker.test.cjs
test/kg-core.test.cjs
test/proc-kill.test.cjs
test/realtime-findcard.test.cjs
test/slack.test.cjs
test/transcript-usage.test.cjs
test/voice-messages.test.cjs
```

**B-handrolled = 8** — a hard equality, and it holds. The set is unchanged and was not added to.

```
$ git ls-files | grep -cE '\.test\.(c|m)?[jt]s$'
57
```

**B-testfiles = 57**, re-measured rather than asserted as `56` — plan 05 added `test/repo-claims.test.cjs` and plan 08 added `test/queue-delivery.test.cjs`. Not lower than 56. ✓

### The recorded baselines task 2's criteria are deltas against

```
$ git rev-parse HEAD
7bcbf067ba6c1ae906f766abce706b48f5745b79        ← B-sha
$ grep -c "budget" src/main/breaker.ts
2                                               ← B-breaker (both are prose comments, :65 and :255 — neither is code)
$ grep -c "budgetTokens" src/main/hive.ts
8                                               ← B-hive (card field, taskSpend signature+body, two CLI parsers — none is the tasks() row)
$ grep -c "hardStop" src/main/breaker.ts
4                                               ← B-hardstop
$ grep -c "NaN\|Infinity" test/hive-protocol-v2.test.cjs
1                                               ← B-nan
```

### Plan 06's arithmetic is in place, and `COST_TAIL_BYTES` is out of the `taskSpend` path

```ts
    const previous = cumulative.get(key);
    const delta = previous
      ? { tokens: Math.max(0, now.tokens - previous.tokens), usd: Math.max(0, now.usd - previous.usd) }
      : now;
```

```ts
  taskSpend(taskId: string): { tokens: number; usd: number; budgetTokens: number | null; over: boolean } {
    const byTask = this.costByTask ?? this.rescanCostLedger();
    const { tokens, usd } = byTask.get(taskId) ?? { tokens: 0, usd: 0 };
    const cap = this.ledger().tasks.find((t) => t.id === taskId)?.budgetTokens;
```

Clamped consecutive diffs over the whole ledger; `taskSpend` reads the accumulator, never a tail.

```
$ grep -n "COST_TAIL_BYTES" src/main/hive.ts
265:// RECORD-03 (#34): the 1 MB `COST_TAIL_BYTES` window that `taskSpend()` used to
```

One hit, a comment explaining the deletion. No code use. ✓ The prerequisite holds, so this plan is not enforcing a cap against the pre-plan-06 number.

### Pre-change TAP baselines

```
$ node --test --test-reporter=tap test/engine-parity.test.cjs
EXIT=0   # tests 19   # pass 19   # fail 0   # skipped 0   # todo 0     ← B-pass-ep = 19
$ node --test --test-reporter=tap test/hive-protocol-v2.test.cjs
EXIT=0   # tests 19   # pass 19   # fail 0   # skipped 0   # todo 0     ← B-pass-hp = 19
```

(Both higher than the plan's pre-plan-06 measurements of 14 and 12, as the plan warned — re-measured, not reused.)

---

## Task 2 — the arm, the accessor, the row

### Arm placement — all four line numbers re-derived in ONE command run

```
$ grep -n "repeatedToolLimit\|errorStormLimit\|agentTokenCaps\|input.budget" src/main/breaker.ts
92:  repeatedToolLimit: 8,
93:  errorStormLimit: 5,
139:  constructor(private getConfig: () => CircuitBreakerConfig & { costCapUsd?: number; costCapTokens?: number; agentTokenCaps?: Record<string, number> }) {}
146:      repeatedToolLimit: c.repeatedToolLimit ?? DEFAULTS.repeatedToolLimit,
147:      errorStormLimit: c.errorStormLimit ?? DEFAULTS.errorStormLimit,
151:      agentTokenCaps: c.agentTokenCaps
328:    if (s.repeatCount >= cfg.repeatedToolLimit) {
332:    if (s.errorCount >= cfg.errorStormLimit) {
336:    // its dispatch set. `input.budget` is `hive.budgetForAgent(agentId)`, which
358:    const budget = input.budget;
367:    const perAgentCap = cfg.agentTokenCaps?.[input.agentId];
```

**The four ARM lines (the config lines at 92/93/139/146/147/151 are not arms):**

| Arm | Line |
|-----|------|
| (b) repeated-tool-call | **328** |
| (b) error storm | **332** |
| **(FLOOR-10) budget** | **358** |
| (a) per-agent token cap | **367** |

`328 < 332 < 358 < 367`. After both `(b)` storm arms, before the `(a)` caps. ✓ Ordering conclusion: a looping agent is a more urgent diagnosis than an expensive one, and a per-card cap is more specific than a floor total.

### Count criteria

| Criterion | Required | Observed |
|---|---|---|
| `grep -c "budget" src/main/breaker.ts` | **> B-breaker + 2** = > 4 | **15** ✓ |
| `grep -cE "^[^*/]*\bbudget\b" src/main/breaker.ts` | ≥ 3 | **7** ✓ |
| `grep -c "hardStop" src/main/breaker.ts` | **exactly B-hardstop = 4** | **4** ✓ |
| `grep -c "budgetTokens" src/main/hive.ts` | **> B-hive** = > 8 | **18** ✓ |
| `grep -c "budgetForAgent" src/main/hive.ts` | ≥ 1 | **2** ✓ |

The `hardStop` equality is why the budget arm's comment says "the config's hard-stop flag" rather than the token — the count is the proof the default was not touched, so no new line may contain it.

### `hardStop` is still off

```
$ grep -n "hardStop" src/main/config.ts
143: *  are deliberately conservative and steer-first — `hardStop` is OFF unless the
150:  hardStop?: boolean;
$ grep -n "hardStop" src/main/breaker.ts
22: * de-escalates a level per healthy beat (recovery), and `hardStop` is OFF by
91:  hardStop: false,
145:      hardStop: c.hardStop ?? DEFAULTS.hardStop,
287:      const ceiling: BreakerLevel = cfg.hardStop ? 'stopped' : 'constrained';
```

**Honest note:** `src/main/config.ts` declares the field optional and *documents* the default (`:147-149` — "Default false = the breaker may steer/constrain but never hard-stops until the user opts in"); the literal `false` lives in `breaker.ts:91`'s `DEFAULTS`. Both are pasted rather than claiming config.ts holds a literal it does not.

### The accessor returns `null` rather than a zero-cap object

```ts
  budgetForAgent(agentId: string): { taskId: string; tokens: number; cap: number } | null {
    const taskId = this.activeTaskId(agentId);
    if (!taskId) return null;
    const { tokens, budgetTokens } = this.taskSpend(taskId);
    if (budgetTokens === null) return null;
    return { taskId, tokens, cap: budgetTokens };
  }
```

Covered by `'FLOOR-10: budgetForAgent hands the beat the assignee's card — and null when there is no cap to enforce'` (`test/hive-protocol-v2.test.cjs`), which asserts `null` for a capless card, a not-yet-started card and an unknown agent.

### The `tasks()` row literal — before and after

**Before** (`7bcbf06`):

```ts
  tasks(): unknown {
    return this.ledger();
  }
```

**After** (`c68f229`):

```ts
  tasks(): unknown {
    const ledger = this.ledger();
    const byTask = this.costByTask ?? this.rescanCostLedger();
    return {
      ...ledger,
      tasks: ledger.tasks.map((t) => {
        const tokens = byTask.get(t.id)?.tokens ?? 0;
        const cap = typeof t.budgetTokens === 'number' && t.budgetTokens > 0 ? t.budgetTokens : null;
        return { ...t, tokens, budgetTokens: cap, pct: cap === null ? null : tokens / cap };
      })
    };
  }
```

All three of `tokens`, `budgetTokens` and `pct` are present. `rev` / `updatedAt` pass through via `...ledger` and are asserted. The accumulator is read **directly** rather than through `taskSpend()` per card — `taskSpend` re-reads `tasks.json` for the cap on every call, which on a 5-second-poll channel would be one file read per card per poll. No second cache; the same card-lifetime bound 01-06 established.

**Which test file carries the row-shape assertion:** `test/hive-protocol-v2.test.cjs`. `engine-parity` *could* host it (`tmpHive` there builds a `HiveManager` cheaply), so this is not the plan's "cannot construct a hive" branch — the reason is that `hive-protocol-v2` is where `taskSpend` and the whole `#34 — per-card cost attribution` section already live (7 `taskSpend` references), and it is the file this plan's own **B-nan** criterion points at. Recording it here as the task requires.

### Containment — per-commit and path-scoped

```
$ BASE=7bcbf067ba6c1ae906f766abce706b48f5745b79; test -n "$BASE" && git rev-parse --verify "$BASE^{commit}" >/dev/null && SHAS=$(git log --format=%H "$BASE"..HEAD) && test -n "$SHAS" || { echo "UNBOUND OR EMPTY RANGE — CRITERION FAILS"; false; }
GUARD OK — range is bound and non-empty
SHAS:
17bf26d2c381803bf8f470a4ec92ec4e62b09c86
c68f22969b782d35bdc804487143b6c75389674a

$ for s in $SHAS; do echo "== $s"; git show --stat "$s" -- src/main/index.ts src/preload/ src/main/delivery.ts; done
== 17bf26d2c381803bf8f470a4ec92ec4e62b09c86
== c68f22969b782d35bdc804487143b6c75389674a
```

**Both blocks show no files.** Neither `src/main/index.ts`, nor anything under `src/preload/`, nor `src/main/delivery.ts` was touched by either commit — the guard line's output is pasted above it, so a fatal-and-empty run cannot be mistaken for a clean one.

```
$ git diff --name-only "$BASE"..HEAD -- src/main/breaker.ts src/main/hive.ts test/engine-parity.test.cjs test/hive-protocol-v2.test.cjs
src/main/breaker.ts
src/main/hive.ts
test/engine-parity.test.cjs
test/hive-protocol-v2.test.cjs
```

Only files from `files_modified`. The one file outside that list, `test/hive-task-mutation.test.cjs`, is the documented deviation below.

---

## Task 3 — the tests

### TAP counters (the reporter is named explicitly; the spec reporter prints `ℹ skipped 0` and would match nothing)

```
$ TAP=$(mktemp); node --test --test-reporter=tap test/engine-parity.test.cjs > "$TAP"; echo "EXIT=$?"; grep -E "^# (pass|fail|skipped|todo) " "$TAP"
EXIT=0
# pass 24
# fail 0
# skipped 0
# todo 0
```

**B-pass-ep 19 → 24 = +5.** The row-shape test landed in the hive-protocol file, so this file's floor is `B-pass-ep + 5` and that file's is `B-pass-hp + 1`:

```
$ TAP=$(mktemp); node --test --test-reporter=tap test/hive-protocol-v2.test.cjs > "$TAP"; echo "EXIT=$?"; grep -E "^# (pass|fail|skipped|todo) " "$TAP"
EXIT=0
# pass 23
# fail 0
# skipped 0
# todo 0
```

**B-pass-hp 19 → 23 = +4** (floor +1; the extra three are `budgetForAgent`, the off-board card and the writeback strip).

### The other mechanical criteria

| Criterion | Required | Observed |
|---|---|---|
| `grep -cE "\.skip\(\|\.todo\(\|skip:\|todo:" test/engine-parity.test.cjs` | `0` | **0** ✓ |
| same, `test/hive-protocol-v2.test.cjs` | `0` | **0** ✓ |
| `grep -c "budgetForAgent" test/engine-parity.test.cjs` | `0` (wiring test not here) | **0** ✓ |
| `grep -c "'constrained'" test/engine-parity.test.cjs` | ≥ 2 | **3** ✓ |
| `grep -c "NaN\|Infinity" test/hive-protocol-v2.test.cjs` | **> B-nan = 1** | **5** ✓ |
| `grep -c "require('node:test')" test/breaker.test.cjs` | still `0` | **0** ✓ |
| `grep -c "process.exit" test/breaker.test.cjs` | still `1` | **1** ✓ |
| `git status --short test/breaker.test.cjs` | untouched | *(empty)* ✓ |
| `tick(` calls in the over-cap test | ≥ 2 | **2** ✓ |

`grep -c "budgetForAgent" test/engine-parity.test.cjs` reads `0` because three explanatory comments that mentioned the token were **reworded** rather than left in. That is deliberate: plan 10 and plan 23 will grep this exact file for this exact token to confirm the wiring test landed, and three comment hits would have made that check pass vacuously.

### RED before GREEN — the tests were written first and run against the unenforced source

```
######## RED: engine-parity (budget arm absent) ########
EXIT=1
# tests 24   # pass 20   # fail 4   # skipped 0   # todo 0
not ok 13 - FLOOR-10: an over-cap card takes its assignee to constrained — on the SECOND beat
not ok 15 - FLOOR-10: a card at 85% of its cap steers and STAYS steering — it is a warning, not a stop
not ok 16 - FLOOR-10: only the assignee is affected — the breaker is per-agent, never a floor-wide trip
not ok 17 - FLOOR-10 / D-18: four beats far over cap and the agent is never stopped, only constrained

######## RED: hive-protocol-v2 (widening absent) ########
EXIT=1
# tests 23   # pass 20   # fail 3   # skipped 0   # todo 0
not ok 17 - D-22: the hive:tasks row carries the card's meter, and a capless card reads null rather than NaN
not ok 19 - FLOOR-10: budgetForAgent hands the beat the assignee's card — and null when there is no cap to enforce
not ok 20 - FLOOR-10: a card that has LEFT the board yields no budget rather than a zero-spend cap
```

**Stated plainly rather than glossed:** 2 of the 9 new tests are green both before and after — `'the same spend against a generous cap is not stopped early'` (a card under an unenforced cap is trivially not stopped) and `'the derived meter never leaks back into tasks.json'` (nothing was derived yet). Both are negative controls whose job is to stay green; neither is offered as evidence that the arm works. The other 7 all went RED first.

### D-22 row-shape negative control — delete one key, watch it fail

`pct` removed from the `tasks()` row literal:

```
$ grep -n "return { ...t, tokens" src/main/hive.ts
2062:        return { ...t, tokens, budgetTokens: cap };
### NEGATIVE CONTROL: pct removed from the tasks() row ###
EXIT=1
# pass 22
# fail 1
not ok 17 - D-22: the hive:tasks row carries the card's meter, and a capless card reads null rather than NaN
  error: 'the row has no "pct", so the card can render no meter and FLOOR-13 has nothing to consume — D-22 was skipped and every count-based criterion in this plan still passed'
```

Restored with `git checkout -- src/main/hive.ts` (a single named path, never a blanket reset); `git status --short src/main/hive.ts` empty afterwards.

### Wiring-test controls

Four runs, tabulated in the handoff section above. `src/main/index.ts` was never edited, even temporarily — verified with `git status --short src/main/index.ts` (empty) after each.

---

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 2 — missing critical functionality] The D-22 widening would have leaked a derived meter into `tasks.json`. Fixed at the choke point.**

- **Found during:** Task 2, while tracing every `hive.tasks()` consumer before widening the row.
- **Issue:** Two production paths **read rows out of `tasks()` and hand those same objects back to `writeTasks()`**:
  - `src/main/index.ts` webhook card creation — `const ledger = hive.tasks()` … `hive.writeTasks([...existing, card])`
  - `src/main/realtimeActions.ts` — `findTasks()` reads `deps.hiveTasks()` (wired to `hive.tasks()`), and `execAssignTask` / `execUpdateTask` / `execDeleteTask` call `deps.hiveWriteTasks(tasks)` with those same objects.

  With the row widened and no guard, the first webhook card or voice task command after this plan would have written `tokens`, `pct` and `budgetTokens: null` into `tasks.json` as if they were card data — a snapshot of a number that keeps moving, persisted into the ledger every writer compare-and-swaps on.
- **Fix:** `stripDerivedTaskFields()` applied inside `writeTasks()` — the single choke point every persist (including `mutateTasks` → `addTask`/`patchTask`/`deleteTask`) funnels through. One guard where all callers route, not a guard per caller. `budgetTokens` is a real card field and survives; only the `null` `tasks()` uses for "no cap" is dropped back to absent.
- **Neither `index.ts` nor `realtimeActions.ts` was edited** — the fix is entirely in `hive.ts`, this plan's own file.
- **Test:** `'D-22: the derived meter never leaks back into tasks.json'`.
- **Files modified:** `src/main/hive.ts` · **Commit:** `c68f229`

**2. [Rule 3 — blocking issue] `test/hive-task-mutation.test.cjs` pinned the pre-widening read shape.**

- **Found during:** Task 2's first full `npm test`.
- **Issue:** `'patch refuses an unknown card without rewriting the ledger'` did `assert.deepEqual(hive.tasks().tasks, [card('existing')])` — comparing the whole widened read row to a bare card literal. It failed with `+ tokens: 0, + budgetTokens: null, + pct: null`.
- **This is D-23's situation, not "bend a test so a buggy source path passes."** The property the test defends is *"a refused patch did not rewrite the ledger"*; the read-row shape was incidental to it, and the widening is this plan's deliberate deliverable. The replacement is **strictly stronger**: it now asserts `after.rev === 1` — that the ledger revision did **not** advance, which is the actual #17 clobber signal and which the original test never checked at all — plus the card content on its own, plus the derived meter's values beside it.
- **Files modified:** `test/hive-task-mutation.test.cjs` · **Commit:** `c68f229` (same commit as the source change, so no commit in the range is red)

**3. [Rule 1 — bug in the handed-off artifact] The plan's prescribed wiring-test window can never see `inputs.push`.**

- **Found during:** Task 3's positive control (run C), which was red for a token that is unquestionably present.
- **Issue:** the plan specifies *slice 2,000 → strip comments → match*. `runBreakerBeat`'s body is mostly comment prose, so the raw 2,000-character window ends three lines short of `inputs.push({`. As written the test is red regardless of what `index.ts` contains — it would have failed in wave 5 no matter what plan 10 did, and "fixing" it there would most likely have meant weakening the anti-vacuity slice.
- **Fix:** *anchor → strip → bound* (6,000 raw → strip → first 2,000), plus a harness self-check asserting the window still reaches `inputs.push({`. Proven by controls B2/C2/D above.
- **Not landed in this plan's tree** (the test ships in the handoff), but corrected in the artifact handed to 01-10.
- **Flagged for plan 23:** the sibling FLOOR-09 source pin in plan 08 was written against the same slice-then-strip instruction and may carry the same defect.

**4. [documentation] Three comments in `test/engine-parity.test.cjs` mentioned `budgetForAgent` and were reworded.** Left alone they would have made `grep -c "budgetForAgent" test/engine-parity.test.cjs` return `2`, which is the exact check plan 10/23 will use to confirm the wiring test landed — a gate that passes on comment prose is a gate that never fires.

### Not deviations, recorded so they are not later read as omissions

- **No per-task cap field had to be created.** `HiveTask.budgetTokens?: number` already existed (`hive.ts:136`), with `--budget-tokens N` on both `task.cjs add` and `task.cjs patch`. Task 2's conditional branch did not fire.
- **No preload edit was needed.** `src/preload/index.ts:781` is `hiveTasks: (): Promise<unknown> => ipcRenderer.invoke('hive:tasks')` — the return type is already `unknown`. (Anchor drift: the plan says `:779`.) The file was not opened for editing.

---

## Anchor drift recorded for later plans and 01-23's greps

| What | Plan/PATTERNS says | Measured at execution |
|---|---|---|
| `const inputs: BreakerInput[]` in `index.ts` | `1492-1537` | **1560** (push literal at **1600**) |
| `ipcMain.handle('hive:tasks', …)` | `3894` | **4036** |
| `hiveTasks` in `src/preload/index.ts` | `779` | **781** |
| `hive.tasks()` | `1831` | **2007** before, **2026** after |
| `taskSpend` | `2566` | **2856** before, **2941** after |
| `COST_TAIL_BYTES` deletion comment | `239` | **265** |
| breaker arm chain | `309-330` | **328-372** |

---

## Verification

### Local

```
$ npm run typecheck        → EXIT 0
$ npm test                 → EXIT 0 · tests 478 · pass 474 · fail 0 · skipped 4 · todo 0
```

(The 4 skips are the pre-existing Windows-only skips; both files this plan touched report `# skipped 0` under TAP.)

### Cross-platform CI, read off the draft PR

`ci.yml` and `e2e.yml` are `branches: [main]` only, so pushing the phase branch triggers nothing — resolved against PR **#77** (draft, base `main`), head `17bf26d`:

| Check run | Result |
|---|---|
| `Typecheck` | **pass** (31s) |
| `Test (ubuntu-latest)` | **pass** (50s) — `# tests 478 # pass 478 # fail 0 # skipped 0 # todo 0` |
| `Test (macos-latest)` | **pass** (31s) — `# tests 478 # pass 478 # fail 0 # skipped 0 # todo 0` |
| `Test (windows-latest)` | **pass** (1m28s) — `# tests 478 # pass 474 # fail 0 # skipped 4 # todo 0` |
| `Build` | **pass** (59s) |
| `Electron smoke (ubuntu-latest)` | **pass** |

Baseline at `7bcbf06` was 469/469/0/0 and 469/465/0/4 — **+9 tests on every platform, 0 new failures.** There is no check run named `E2E`; `E2E` is the workflow name and the job is `Electron smoke (ubuntu-latest)`.

### Manual (operator) — NOT done, and not claimed

```
MEASUREMENT UNAVAILABLE — set a small `--budget-tokens` cap on a card in the dev app,
let the assignee actually run, and confirm (a) the native operator toast fires on the
constrain escalation and (b) the agent's avatar meter reflects the constrained level.
```

This needs `npm run dev`, a real hive, a real agent CLI session and a live subscription — an interactive observation that cannot be produced from a headless session. **It would also be premature:** the arm is not fed in production until plan 01-10 lands the `runBreakerBeat` line, so there is nothing for an operator to observe yet. The right time is after 01-10, before plan 23 ticks anything. A STATE blocker is filed. Nothing in this SUMMARY claims the toast or the meter was seen.

---

## must_haves — truth by truth

| # | Truth | Status |
|---|---|---|
| 1 | The ladder gained an arm consuming `taskSpend().over`; an over-cap `BreakerInput` escalates the assignee to `constrained` across two beats. FLOOR-10 NOT closed here | **SATISFIED** — arm at `breaker.ts:358`; test 1 asserts `steering` then `constrained`; FLOOR-10 explicitly not claimed |
| 2 | `hive.budgetForAgent(agentId)` exists as the single accessor, so 01-10's edit is one line | **SATISFIED** — `hive.ts`, and run D proves the one-line diff satisfies the wiring regex |
| 3 | The injection AND the wiring test are recorded verbatim under the required handoff heading, carrying the literal status line | **SATISFIED** — heading occurs exactly once (`grep -c` = 1, so this row deliberately does not repeat the literal string), diff and test verbatim, status line literal |
| 4 | Small cap + long run → `constrained`; generous cap → not stopped early | **SATISFIED** — tests 1 and 2, both proven RED/GREEN or green-as-control |
| 5 | Enforcement is per-agent, not floor-wide | **SATISFIED** — test 4; the second agent stays `healthy` in the same tick |
| 6 | Nothing silently killed: `hardStop` stays false, ceiling is `constrained` | **SATISFIED** — test 5 (four beats, never `stopped`); `grep -c hardStop` still exactly 4 |
| 7 | The card's meter data reaches the renderer through the channel it already polls | **SATISFIED for the channel, PARTIAL end-to-end.** `hive.tasks()` carries `{tokens, budgetTokens, pct}` and `preload:781` already returns `unknown`, so the data is on `hive:tasks` and every existing poller receives it. **No renderer component reads the three fields yet** — that is FLOOR-13's job (RESEARCH `:610`: "FLOOR-13 in wave 5 consumes it"). No pixel was watched. |

`key_links` — `taskSpend() → budget arm` via `budgetForAgent → BreakerInput.budget`: **the accessor and the arm exist; the `via` clause's last hop (`populated in runBreakerBeat`) is exactly the handoff and is NOT in place.** `hive.tasks() row → the renderer's hive:tasks poll`: **in place**, widened row, no new channel.

## Known limitations, stated rather than implied

1. **The arm is not fed in production.** Stated in full above. This plan is complete with the arm unfed; what would make it incomplete is failing to record it, or populating `budget` from somewhere other than the production beat so the gap stopped being visible. Neither was done.
2. **`hive.tasks()` now triggers the ledger rescan on first call.** `tasks()` is polled every ~5 s, so on a floor whose first `taskSpend()` has not yet happened, the first poll pays for one whole-file read of `cost-ledger.jsonl`. That is 01-06's intended startup rescan, once per process — but it now also fires from a *read* path rather than only from a spend path. **`cost-ledger.jsonl` is still not rotated** (`LOG_ROTATE_BYTES` applies only to `log.jsonl`); RECORD-02 in Phase 4 owns ledger retention. Recorded, not silently inherited.
3. **`pct` is a ratio (0..n), not a percentage.** `tokens / budgetTokens`, per D-22's literal wording and the plan's test requirement. FLOOR-13 must multiply by 100 for display.
4. **The off-board case has a bounded window, by design.** `activeTaskId()` caches the assignee→card map for 5 s, so for up to 5 s after a card leaves the board the beat still enforces against that card's real (not-yet-pruned) spend. The cache rebuild and the accumulator prune happen in the *same* block, so the two can never disagree; after the rebuild `budgetForAgent` returns `null`. Proven with a fresh `HiveManager` over the same home rather than a five-second sleep.
5. **No live qwen/crush or multi-agent run.** The enforcement is proven at the unit boundary with real `CircuitBreaker` and real `HiveManager` instances over real temp hives, not with a real agent CLI on a live subscription (PROJECT.md's standing constraint).

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or trust-boundary schema change. The one new persisted-data interaction (`writeTasks`) *narrows* what can be written rather than widening it. T-P09-01 through T-P09-09 are all addressed as planned, with T-P09-07 (dead code behind a green suite) mitigated by the handoff rather than by an unfed field plus a green test — and additionally hardened by the four controls, which found the handed-off test's own defect.

## Requirements

**FLOOR-10 deliberately left `Pending` in `.planning/REQUIREMENTS.md`** — matching the 01-02 / 01-04 / 01-05 / 01-06 / 01-07 / 01-08 precedent that **plan 23 owns the checkboxes**, and doubly so here because FLOOR-10 is a split whose closing half is plan 01-10. `requirements-completed: []`. **Issue #34 remains OPEN**, with the empty `.over`-consumer grep above as the evidence its clause was genuinely open when this plan started. Per D-47 it also gets a fresh-context adversarial re-verify before it may be closed — an addition to the mechanical bar, never a substitute.

---

## Self-Check: PASSED

```
FOUND: src/main/breaker.ts                  FOUND: src/main/hive.ts
FOUND: test/engine-parity.test.cjs          FOUND: test/hive-protocol-v2.test.cjs
FOUND: test/hive-task-mutation.test.cjs
FOUND: .planning/phases/01-finish-the-floor/01-09-SUMMARY.md

FOUND: c68f229  feat(01-09): enforce the per-card token budget as one arm in the breaker ladder
FOUND: 17bf26d  test(01-09): prove the budget is ENFORCED across two beats, and that the card's meter is real

FOUND(2): input.budget in src/main/breaker.ts
FOUND(2): BUDGET_STEER_FRACTION in src/main/breaker.ts
FOUND(1): trip.ceiling in src/main/breaker.ts
FOUND(2): budgetForAgent in src/main/hive.ts
FOUND(2): stripDerivedTaskFields in src/main/hive.ts
FOUND(1): pct: in src/main/hive.ts
```

Every file, commit and symbol this SUMMARY claims exists on disk and in the log. The one thing it
does NOT claim — `budget: hive.budgetForAgent(id)` in `src/main/index.ts` — is verified ABSENT
(`grep -c` = `0`), which is the expected and recorded state.
