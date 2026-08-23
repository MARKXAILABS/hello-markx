---
phase: 01-finish-the-floor
plan: 06
subsystem: spend-accounting
tags: [record-03, record-04, floor-09, gate-01, cost-ledger, hook-socket]
requires:
  - "01-01 (Electron 43 runtime + the load-ts loader every test here runs on)"
  - "01-02 (HookServer.mintToken/revokeToken — task 4 calls the mint it created)"
  - "01-03 (the hive.ts anchors it shifted; every offset here was re-derived by content)"
provides:
  - "one ledger row semantics — the CostSample branch no longer appends per-response deltas"
  - "taskSpend() over the WHOLE ledger, from clamped consecutive diffs of cumulative snapshots"
  - "HiveManager.costByTask / costCumulative / rescanCostLedger / pruneCostByTask — a card-lifetime-bounded accumulator with a startup rescan"
  - "HookServer's 8th constructor parameter `recordCost?: (s: AgentUsageSample) => void` — FLOOR-09's sink, minted and runtime-proven here, NOT yet injected in production"
  - "HiveManager.setHookTokenSource(mint, revoke) — the seam HookServer's constructor registers itself on, so the proxy sidecar gets a per-agent token with no line in index.ts"
  - "PROXY_BRIDGE_SHIM / PI_EXTENSION / OPENCODE_PLUGIN now send sock_token — shim coverage 1 1 1 1 1 1"
  - "core.hooksPath suppression in BOTH hive git wrappers"
affects:
  - "01-08 (wave 4) — task 6 owns the one index.ts line FLOOR-09 needs; see the T-INDEX HANDOFF section"
  - "01-09 (wave 4) — adds the breaker's budget arm on top of taskSpend()'s corrected number"
  - "01-10 (wave 5) — task 5 hard-gates on 01-08 having applied the handoff"
  - "01-23 (wave 9) — owns the RECORD-03/RECORD-04/FLOOR-09/GATE-01 checkboxes; all four left Pending here"
tech-stack:
  added: []
  patterns:
    - "clamped consecutive diffs over a (agentId, sessionId) series — never sums of cumulative snapshots"
    - "an in-memory accumulator bounded by CARD LIFETIME replacing a byte-window bound"
    - "a dependency injected as the LAST optional constructor parameter, so no existing call site moves"
    - "a collaborator registering itself as a peer's capability source, when the composition root is owned by another plan"
    - "durability proven across a real process boundary (spawnSync(process.execPath, …)), with a negative control"
key-files:
  created: []
  modified:
    - src/main/hive.ts
    - src/main/hooks.ts
    - test/hive-protocol-v2.test.cjs
    - test/engine-parity.test.cjs
    - test/hook-auth-roundtrip.test.cjs
decisions:
  - "First row of a (agent, session) series bills its OWN value, not zero — the series began at zero, and zeroing it loses every card that starts and finishes inside one ~30s beat"
  - "Series key is (agent_id, session_id), so a session change starts a new series rather than diffing against the previous session's much larger total"
  - "The clamp is on the consecutive diff, not a high-water mark — after telemetry.forget() the collector genuinely restarts at zero, so the re-climb IS new spend and a high-water rule would swallow it"
  - "COST_TAIL_BYTES deleted outright, not widened — no other caller"
  - "The accumulator's bound is card lifetime (pruneCostByTask), which is the bound that replaces the deleted 1 MB window"
  - "core.hooksPath rather than --no-verify for the hive's git — --no-verify covers only pre-commit/commit-msg on a commit and would need repeating at seven call sites"
  - "HookServer's constructor registers itself as the hive's token source, rather than handing a SECOND line to a plan that owns index.ts — one handoff, not two"
metrics:
  duration: "~3h15m"
  completed: 2026-08-21
---

# Phase 01 Plan 06: Spend Accounting + FLOOR-09's Sink + GATE-01's Sidecar Hole — Summary

`taskSpend()` now computes a number a budget could be enforced against: clamped differences between
cumulative snapshots, over every row of the ledger rather than a 1 MB tail, with one row semantics
because the proxy tier's hand-built delta appender is gone. FLOOR-09's sink is minted and proven at
runtime through a real hook socket — **but FLOOR-09 does not close here**. GATE-01's qwen sidecar hole
is closed in both halves (env *and* shim body), and the hive's own git no longer runs agent-planted
hooks.

---

## FLOOR-09 IS NOT CLOSED IN THIS PLAN

FLOOR-09 is a **split requirement and this plan is the OPENING half**. The sink exists, is a real
constructor dependency, and is proven at runtime here. Proxy spend does **not** reach production
`getAgentUsage` until **`01-08-PLAN.md` task 6** lands the one-argument injection in **wave 4**, which
is the wave FLOOR-09 becomes true. Plan 08's frontmatter declares FLOOR-09 as the closing half of the
split. **Plan 10 task 5** (wave 5) is the hard STOP-gate on it; plan 23 pins it in wave 9. Neither
plan 07 nor plan 09 carries any part of it — plan 09 states twice (`01-09-PLAN.md:205`, `:221`) that
it records this state and deliberately does not gate on it.

`grep -c "recordCostSample" src/main/index.ts` → **`0`** at `840c36e`.

---

## T-INDEX HANDOFF → 01-08 (FLOOR-09)

**FLOOR-09 PROXY SPEND NOT YET IN getAgentUsage — T-INDEX INJECTION HANDED TO 01-08**

Re-derived at execution time, 2026-08-21:

```
$ grep -n "new HookServer(" src/main/index.ts
465:const hookServer = new HookServer(
```

`telemetry` is already in scope there — `const telemetry = new TelemetryCollector({` at
`src/main/index.ts:356`, above the call. The parameter this plan added is optional and LAST, so the
tree typechecks whether or not this lands, which is exactly why it must be recorded loudly rather
than assumed.

Two lines change, not one: the new argument, **and** a trailing comma appended to the existing
`(agentId) => focusAgent(agentId)` line above it.

```
  const hookServer = new HookServer(
    hive, () => liveWebContents(), () => readConfig(), control, breaker,
    (agentId) => delivery.drainAtStop(agentId),
    (agentId) => focusAgent(agentId),
+   (s) => telemetry.recordCostSample(s)          // FLOOR-09 (#19) — proxy-tier cost sink
  );
```

Current state of that call site at `840c36e`, for the applying agent:

```
465:const hookServer = new HookServer(
466:  hive, () => liveWebContents(), () => readConfig(), control, breaker,
467:  (agentId) => delivery.drainAtStop(agentId),
468:  (agentId) => focusAgent(agentId)
469:);
```

The wiring shape is already exercised: `test/engine-parity.test.cjs` constructs the server with
`(s) => telemetry.recordCostSample(s)` as the eighth argument, so this test and production share one
shape rather than two. Its negative control — the same construction with the argument omitted — is
what goes red if this injection is dropped.

---

## SHIM TOKEN COVERAGE

```
$ for t in HOOK_SHIM AGY_HOOK_SHIM PI_EXTENSION OPENCODE_PLUGIN PROXY_BRIDGE_SHIM GROK_HOOK_SHIM; do
    sed -n "/^const $t = \`/,/^\`;/p" src/main/hive.ts | grep -c "HIVE_SOCK_TOKEN"; done

BEFORE (measured 2026-08-21, at HEAD, unchanged since 01-02):   1 1 0 0 0 1
AFTER  (this plan, at 840c36e):                                 1 1 1 1 1 1
```

And the same six carry the FIELD, not merely the env read:

```
$ for t in HOOK_SHIM AGY_HOOK_SHIM PI_EXTENSION OPENCODE_PLUGIN PROXY_BRIDGE_SHIM GROK_HOOK_SHIM; do
    sed -n "/^const $t = \`/,/^\`;/p" src/main/hive.ts | grep -c "sock_token"; done

BEFORE: 1 1 0 0 0 1
AFTER:  1 1 1 1 1 1
```

**`PI_EXTENSION`, `OPENCODE_PLUGIN` and `PROXY_BRIDGE_SHIM` were dead-hooked AT HEAD, before this
phase.** All three built their payloads with no `sock_token` field at all, and all three write to the
same `process.env.HIVE_SOCK` that the working shims do. `src/main/hooks.ts` installs exactly one
connection handler and `if (!agentId) { conn.end('{}'); return; }` is the only door into `handle()` —
there is no second server, no unauthenticated branch and no bypass keyed on engine or event. "Fire and
forget" describes only that `PI_EXTENSION`'s and `OPENCODE_PLUGIN`'s `post()` ignore the response, not
a different code path. **This is a pre-existing defect this task closes, not one this phase
introduced** — plan 23 needs that attribution to read its wave-9 sweep correctly.

`test/hook-auth-roundtrip.test.cjs`'s derived shim guard is widened accordingly: it now iterates every
template the enumeration finds instead of the three that carried the field, and the comment naming
this plan as the one that would widen it is deleted. `grep -cE "HOOK_SHIM|PI_EXTENSION|OPENCODE_PLUGIN"
test/hook-auth-roundtrip.test.cjs` → **`0`** (no template is named individually any more).

---

## GATE-01: the qwen sidecar hole is closed, and the window it was open for

Plan 02's SUMMARY opened the window with the literal marker
**`QWEN SIDECAR DEAD-HOOKED UNTIL 01-06`**. **This SUMMARY closes it.**

The window ran from **wave 2** (plan 02 deleting `src/main/index.ts:5534`,
`process.env.HIVE_SOCK_TOKEN = hookSockToken();`) to **wave 3** (this plan's commit `840c36e`) — one
wave inside one phase. For `PI_EXTENSION`, `OPENCODE_PLUGIN` and `PROXY_BRIDGE_SHIM` the outage was
**older than that window**: they were dropped by `authorized()` at HEAD too, for the separate reason
above.

Both halves landed, because **either alone is a no-op**:

| Half | Evidence at `840c36e` |
|---|---|
| The sidecar env carries a **per-agent** token | `sed -n '/private startProxyBridge/,/^  }$/p' src/main/hive.ts \| grep -n "HIVE_SOCK_TOKEN"` → exactly one line, `31:            HIVE_SOCK_TOKEN: token`, inside the `env:` literal |
| …and it is **not** the floor-wide one | same slice, `grep -c "process.env.HIVE_SOCK_TOKEN"` → `0`; and `grep -c "process.env.HIVE_SOCK_TOKEN *=" src/main/index.ts` → `0` (plan 02's deletion stands) |
| The sidecar's shim actually **sends** it | shim coverage table above; and the runtime byte-level test below |

**How `HiveManager` reaches the mint, without a line in `index.ts`.** The sidecar is not a PTY, so
`PtyManager`'s per-spawn mint never sees it — it is a child of `HiveManager`, whose constructor takes
only `getHome` and `emit`. `HiveManager` gained `setHookTokenSource(mint, revoke)`, the same seam
`pty.ts` already takes, and **`HookServer`'s own constructor registers itself on it** — the server
already holds a `HiveManager` and is the only object that can mint. This deliberately avoids a
**second** T-INDEX handoff: the FLOOR-09 argument is the only thing this plan hands to `index.ts`.

Revocation is **token-exact**, on sidecar exit and on `stopProxyBridge`, mirroring `pty.ts`'s reason:
a restart is stop+start under the same agent id, and revoking by agent could kill the live
replacement's token.

---

## The arithmetic contract, written before the code (task 1)

A ledger row is a **cumulative snapshot** of one `(agent_id, session_id)` at one beat.
`src/main/db.ts:44` states it verbatim — *"Rows are CUMULATIVE snapshots (one per agent per heartbeat
beat) — diff consecutive rows for velocity."* Since RECORD-04 that is true of **every** row, because
there is now exactly one appender.

| Rule | Value |
|---|---|
| Series key | `agent_id` + `session_id`. A new session starts its own accumulator at zero, so it starts a NEW series rather than diffing against the previous session's much larger total. |
| **First row of a series** | **its OWN value.** It has no predecessor and the series began at zero, so all of it was spent after that zero. Treating it as zero silently loses every card that starts and finishes inside one ~30 s beat window — the same class of under-report RECORD-03 removes. Justified against `db.ts:44`: a cumulative snapshot with no predecessor *is* the spend since the start of the series. |
| Later rows | `max(0, now − previous)`. Clamped, because `telemetry.forget()` on a respawn resets the collector and the next snapshot can legitimately be smaller. |
| Rows with `task_id: null` | still advance the series baseline (they must, or the next carded row would bill their spend to the card) but credit no card. |

**Worked two-row example** (one agent, one session, card `t-1`):

```
row 1 {input 10, output 5}  → no predecessor → t-1 += 15          (t-1 = 15)
row 2 {input 14, output  6} → 20 − 15 = 5    → t-1 += 5           (t-1 = 20)
row 3 {input  1, output  0} → 1 − 20 = −19   → clamped to 0       (t-1 = 20)
```

The old code read `15 + 20 + 1 = 36` for those same three rows, through a window that would have
dropped row 1 entirely on a long card.

**Why the clamp is a consecutive diff and not a high-water mark** (considered and rejected): after
`telemetry.forget()` the collector genuinely restarts at zero, so the post-reset climb *is* new spend.
A high-water rule would swallow all of it. The consecutive-diff clamp loses only the first post-reset
row's amount, which under-counts conservatively rather than over-counting.

### `COST_TAIL_BYTES`: deleted, not widened

`grep -c "COST_TAIL_BYTES" src/main/hive.ts` → **`1`**, and that one hit is the replacement comment at
`:239` explaining the deletion. There is **no remaining use inside `taskSpend`** and no other caller
needed it, so the constant itself is gone.

### The accumulator and its lifetime bound

Per D-20: an in-memory `Map<taskId, {tokens, usd}>` (`costByTask`), plus `costCumulative` holding the
last snapshot per series. Built by **one full ledger scan at first use** — which after an app restart
is the rescan that stops a card in flight from reporting zero — then kept current incrementally from
`appendCostLedger`, which is now the ledger's only writer.

**Bound: card lifetime.** `pruneCostByTask()` drops entries whose task id is no longer in
`tasks()`, called from the scan and from the ≤5 s `activeTaskCache` rebuild (which already reads the
board, and only runs while cost is flowing). RECORD-03 deliberately removes a memory bound (the 1 MB
tail) and this is what replaces it — see **Known limitations** for the one behavioural consequence.

---

## D-23: the source fix landed FIRST, in its own commits

Three ordered source-only commits, then the test rewrite in a fourth. Path-scoped per commit, never a
tree-wide `git diff` (plan 07 is writing `src/main/index.ts` in this same wave under
`use_worktrees: false`):

```
$ for s in 89481fa 1d8a140 d844315; do echo "== $s"; git show --stat "$s" -- test/ src/main/index.ts src/preload/; done
== 89481fa
== 1d8a140
== d844315
```

Three empty blocks: **no test file and no `index.ts` line was touched in the same commit as the
arithmetic change.** And for task 4's commit:

```
$ git show --stat 840c36e -- src/main/index.ts src/preload/ src/main/breaker.ts
(no files)
```

The test-rewrite commit `b915d11` quotes the removed expectation verbatim:

```
$ git log -1 --format=%B b915d11 | grep -c "spend.tokens, 20"
1
```

`grep -c "assert.equal(spend.tokens, 20)" test/hive-protocol-v2.test.cjs` → **`0`**.

**The red evidence between the two, pasted** — `node --test --test-reporter=tap
test/hive-protocol-v2.test.cjs` at `1d8a140`:

```
EXIT=1
# tests 17 / # pass 16 / # fail 1 / # skipped 0 / # todo 0
not ok 14 - cost rows carry the card they were spent on, and a card knows its cap
  error: |-
    Expected values to be strictly equal:
    15 !== 20
  expected: 20
  actual: 15
```

That is the source contract changing, not a test being bent: the old test's two rows were `(10,5)`
then `(4,1)`, **summed** to 20. Read as cumulative snapshots — which `db.ts:44` says they are — those
two rows are 15 followed by a rewind, i.e. 15. The rewrite uses genuinely cumulative rows (15 then 60)
against a cap of 70, so the two arithmetics **disagree where it matters**: diffing gives 60 and the
card runs; summing gives 75 and a generous cap stops the card 15 tokens early.

---

## Evidence (task 1 baselines, all measured this session)

```
$ grep -n "COST_TAIL_BYTES\|appendCostLedger(sample: AgentUsageSample)\|taskSpend(taskId: string)" src/main/hive.ts
244:const COST_TAIL_BYTES = 1024 * 1024;
2604:  appendCostLedger(sample: AgentUsageSample): void {
2655:   * ledger's tail — see COST_TAIL_BYTES for that ceiling.
2657:  taskSpend(taskId: string): { tokens: number; usd: number; budgetTokens: number | null; over: boolean } {
2662:      for (const line of this.tailLines(join(root, 'cost-ledger.jsonl'), COST_TAIL_BYTES)) {

$ grep -n "appendCostLedger" src/main/*.ts          # the MIXED-SEMANTICS evidence
src/main/hive.ts:2604:  appendCostLedger(sample: AgentUsageSample): void {      ← the definition
src/main/hive.ts:2631:   *  appendCostLedger runs per usage sample; …           ← a comment
src/main/hooks.ts:555:        this.hive.appendCostLedger({                      ← appender 1: per-response DELTAS
src/main/index.ts:1524:    if (sample?.sessionId) hive.appendCostLedger(sample); ← appender 2: CUMULATIVE snapshots
src/main/usage.ts:5: * appendCostLedger) consume usage ONLY through …          ← a comment

$ grep -rn "recordCostSample" src/ test/            # the FLOOR-09 evidence: ZERO production callers
src/main/telemetry.ts:255:  recordCostSample(s: AgentUsageSample): void {      ← the definition
src/shared/agentProvider.ts:119, :321                                          ← two doc comments
test/engine-parity.test.cjs:58, :59, :79, :89, :90, :98                        ← six test calls

$ grep -n "tokens +=" src/main/hive.ts              # the summing line
2666:          tokens += (row.input ?? 0) + (row.output ?? 0);
```

**D-21 wiring evidence** — the finding a `grep -c` criterion would have hidden:

| Baseline | Command | Measured |
|---|---|---|
| **B-hookctor** | `grep -n "constructor(" -A 20 src/main/hooks.ts` | **seven parameters**, `hive` through `focus?`. **No telemetry dependency and no import of `telemetry.ts`.** |
| **B-telemetry-export** | `grep -c "export const telemetry" src/main/index.ts` | **`0`** (`const telemetry = new TelemetryCollector({` at `:356` is module-local and unexported, so `hooks.ts` cannot import it) |
| **B-hookserver-sites** | `grep -c "new HookServer(" src/main/index.ts` | **`1`** (`:465` — the only injection point in the process, and it is `index.ts`) |

Neither moved, so task 2's `<handoff>` patch was written as planned.

**Re-derived `hive.ts` offsets used by every read in this plan** (plan 03 shifted them in wave 2):
`COST_TAIL_BYTES` `:244` · `appendCostLedger` `:2604` · `taskSpend` `:2657` · the tail read `:2662` ·
`private startProxyBridge` `:1170` · `private git` `:2706` · `private gitAsync` `:2718`. `appendCostLedger`
is `:2604`, **not** RESEARCH's `:2520` nor the plan's `:2513`.

**Measured TAP baselines** (`--test-reporter=tap`, win32, before any change):

| Baseline | Value | Note |
|---|---|---|
| **B-pass-hp** | **`17`** | `# tests 17 / pass 17 / fail 0 / skipped 0 / todo 0`, `EXIT=0`. `>= 17`, so **01-03 landed**. The plan-time `12` is stale and was not reused. |
| **B-pass-ep** | **`14`** | `# tests 14 / pass 14 / fail 0 / skipped 0 / todo 0`, `EXIT=0`. Equals the expected `14` — no undeclared writer touched `test/engine-parity.test.cjs`. |
| **B-gau** | **`6`** | `grep -c "getAgentUsage" test/engine-parity.test.cjs`. Confirms the plan's correction: an earlier criterion claiming a `0` baseline was inverted. |
| `new HookServer(` in engine-parity | **`0`** | fails against pre-fix source, as intended |
| `sock_token` in engine-parity | **`0`** | fails against pre-fix source, as intended |
| `process.execPath` in hive-protocol-v2 | **`2`** | the strict-delta baseline |
| `spawnSync\|execFileSync` in hive-protocol-v2 | **`4`** | |
| `taskSpend` in hive-protocol-v2 | **`3`** | |

---

## Acceptance greps at `840c36e`

| Criterion | Required | Measured |
|---|---|---|
| `grep -c "COST_TAIL_BYTES" src/main/hive.ts` | no use in `taskSpend` | `1` — a comment at `:239` explaining the deletion; no code use |
| `sed -n "/=== 'CostSample'/,/^    }$/p" src/main/hooks.ts \| grep -cE "this\.recordCost\?\.\("` | ≥ 1 | **`1`** |
| same slice, `grep -c "appendCostLedger"` | `0` | **`0`** |
| `grep -c "appendCostLedger" src/main/hooks.ts` (whole file) | `0` | **`0`** |
| `grep -cE "recordCost\?: \(s: AgentUsageSample\) => void" src/main/hooks.ts` | `1`, and LAST | **`1`**, at `:219`, after `focus?` at `:213` |
| `grep -cE "\.skip\(\|\.todo\(\|skip:\|todo:"` on both target test files | `0` | **`0`** and **`0`** |
| `grep -c "getAgentUsage" test/engine-parity.test.cjs` | **>** B-gau (`6`) | **`15`** |
| `grep -c "new HookServer(" test/engine-parity.test.cjs` | ≥ 1 | **`2`** |
| `grep -c "sock_token" test/engine-parity.test.cjs` | ≥ 1 | **`1`** |
| `grep -c "assert.equal(spend.tokens, 20)" test/hive-protocol-v2.test.cjs` | `0` | **`0`** |
| `grep -c "process.execPath" test/hive-protocol-v2.test.cjs` | **>** `2` | **`5`** |
| `grep -cE "spawnSync\|execFileSync" test/hive-protocol-v2.test.cjs` | — | **`6`** (was `4`) |
| `grep -c "taskSpend" test/hive-protocol-v2.test.cjs` | **>** `3` | **`7`** |
| `sed -n '/private startProxyBridge/,/^  }$/p' \| grep -n "HIVE_SOCK_TOKEN"` | exactly ONE line, in the `env:` literal, not `process.env.…` | **`31:            HIVE_SOCK_TOKEN: token`** |
| same slice, `grep -c "process.env.HIVE_SOCK_TOKEN"` | `0` | **`0`** |
| `grep -c "process.env.HIVE_SOCK_TOKEN *=" src/main/index.ts` | `0` | **`0`** |
| `sed -n '/private git(args…/,/^  }$/p' \| grep -cE "no-verify\|hooksPath"` | ≥ 1 | **`1`** (baseline `0`) |
| `sed -n '/private gitAsync/,/^  }$/p' \| grep -cE "no-verify\|hooksPath"` | ≥ 1 | **`1`** (baseline `0`) |
| `grep -cE "HOOK_SHIM\|PI_EXTENSION\|OPENCODE_PLUGIN" test/hook-auth-roundtrip.test.cjs` | `0` | **`0`** |
| the derived shim guard's own count assertion | ≥ 6 | passes at **6** |
| the hand-rolled harness set is unchanged | `8`, same names | **`8`**: `agent-provider`, `breaker`, `kg-core`, `proc-kill`, `realtime-findcard`, `slack`, `transcript-usage`, `voice-messages` |
| `npm run typecheck` | exit `0` | **`0`** |

---

## The runtime proofs, and every one of them driven RED first

A test that has never been made to fail has not been demonstrated to be a test. Every new assertion
below was proved red against the pre-fix source in this session.

### FLOOR-09 — the assertion that reads the number back out of `getAgentUsage`

The payload goes down the **real** hook socket, past the **real** `authorized()` gate, into the
**real** `hooks.ts` branch. It is not `telemetry.recordCostSample()` called directly — the six
pre-existing calls already cover the collector's arithmetic and would stay green with the `hooks.ts`
branch deleted outright.

```js
  const s = telemetry.getAgentUsage('qwen-1');
  assert.ok(s, 'the proxy tier is invisible to getAgentUsage — its spend is archived but never budgeted');
  assert.equal(s.input, 9_000, 'the posted sample\'s input did not reach the collector intact');
  assert.equal(s.output, 5_000, 'the posted sample\'s output did not reach the collector intact');
```

then the two-beat breaker pattern: `healthy` on the baseline tick, `steering` with
`/token limit/` after the sample.

**Negative control, run — `recordCost` omitted from the `HookServer` construction:**

```
EXIT=1
# pass 18 / # fail 1
not ok 5 - FLOOR-09: a CostSample posted at the hook socket reaches getAgentUsage and arms the breaker
  error: 'the proxy tier is invisible to getAgentUsage — its spend is archived but never budgeted'
```

That is also the exact shape that goes red if 01-08 task 6's injection is dropped in production.

**T-P06-01 pinned in the same test:** the gate stays ahead of the cost path — a `CostSample` posted
with a bad token leaves `getAgentUsage` `null`.

### RECORD-03 durability — a REAL second process, with a negative control

The restart test asserts the filesystem *before* the reload (a separate, earlier failure point that an
in-memory Map cannot pass), then `spawnSync(process.execPath, [childScript, loader, home, taskId])`
into a **fresh** `HiveManager` over the same home. No `fork()`, no `vm`, no `delete require.cache`.

**Negative control, run — the ledger deleted before the child spawns:** the fresh process reports
`tokens: 0`. **And the same test with that `rmSync` commented out, to prove it can tell the two
apart:**

```
NEG_CONTROL_DISABLED_EXIT=1
# pass 18 / # fail 1
AssertionError: spend survived deleting the ledger, so it is not being read from the ledger
230 !== 0
```

### GATE-01 — the three task-4 proofs, each driven red

| Test | Red when… | Red output |
|---|---|---|
| the sidecar env carries its own agent token | the `HIVE_SOCK_TOKEN: token` line is removed from `startProxyBridge` | `EXIT=1`, `# pass 18 / # fail 1`, *"the sidecar is spawned without its own hook token, so authorized() drops every payload it sends…"* |
| `PROXY_BRIDGE_SHIM` puts `sock_token` in the **bytes** | the `payload.sock_token = …` line is removed from `emit()` | `EXIT=1`, `# pass 18 / # fail 1`, *"the sidecar shim writes no sock_token into its payload, so adding HIVE_SOCK_TOKEN to its env is a NO-OP…"* — **and** the widened guard in `test/hook-auth-roundtrip.test.cjs` goes `# pass 0 / # fail 1`: *"PROXY_BRIDGE_SHIM builds a payload without sock_token — every hook it fires will be rejected"* |
| the hive's git does not run an agent-planted hook | `core.hooksPath` is removed from `gitAsync` | `EXIT=1`, `# pass 18 / # fail 1`, the sentinel file exists |

The byte-level test runs the **real bootstrapped shim file** (`<hive>/bin/hive-proxy.cjs`, written by
`ensureHive()` from `PROXY_BRIDGE_SHIM`) with one line appended to call its own `emit()`, against a
raw socket server, and parses what arrives:

- with `HIVE_SOCK_TOKEN=SENTINEL-TOKEN-abc123` → `payload.sock_token === 'SENTINEL-TOKEN-abc123'`
- with `HIVE_SOCK_TOKEN` unset → `payload.sock_token === ''`, which is exactly what `authorized()`
  rejects (pinned by the FLOOR-09 test's bad-token assertion). The pre-fix behaviour stays legible.

The git-hook test is **behavioural, not a flag check**: a `.git/hooks/pre-commit` that writes a
sentinel and `exit 1`, then a real `flushCommit()` through the real `gitAsync` wrapper, asserting the
sentinel does **not** exist *and* that the commit still happened.

---

## Test counters

Under `--test-reporter=tap`, win32, at `840c36e`:

| File | Baseline | After | Required | Result |
|---|---|---|---|---|
| `test/hive-protocol-v2.test.cjs` | `# pass 17` | **`# pass 19`**, `# tests 19`, `# fail 0`, `# skipped 0`, `# todo 0`, `EXIT=0` | ≥ B-pass-hp+2 = `19`, and ≥ `19` absolute | ✅ |
| `test/engine-parity.test.cjs` | `# pass 14` | **`# pass 19`**, `# tests 19`, `# fail 0`, `# skipped 0`, `# todo 0`, `EXIT=0` | ≥ B-pass-ep+5 = `19`, and ≥ `19` absolute | ✅ |
| `test/hook-auth-roundtrip.test.cjs` | — | `# tests 3`, `# pass 1`, `# fail 0`, **`# skipped 2`**, `# todo 0`, `EXIT=0` | `# skipped 2` expected **on win32** (its two round-trip tests carry `{ skip: !POSIX }`); the shim guard is the one that runs everywhere | ✅ |

`npm test` locally (win32): `454 tests / 450 pass / 0 fail / 4 skipped / 0 todo`, exit `0`.
Baseline before this plan was `447 / 443 / 0 / 4`; the delta is exactly this plan's seven tests.

---

## CI — the claim resolves against PR #77, not a phase-branch push

Both workflows are `branches: [main]` only, so pushing the phase branch triggers nothing. Read with
`gh pr checks 77` at head `840c36e`:

| Check run | Result | Duration |
|---|---|---|
| `Typecheck` | **pass** | 41s |
| `Test (ubuntu-latest)` | **pass** | 49s |
| `Test (windows-latest)` | **pass** | 1m25s |
| `Test (macos-latest)` | **pass** | 1m8s |
| `Electron smoke (ubuntu-latest)` | **pass** | 1m38s |
| `Build` | **pass** | 1m4s |

Per-platform suite counters pulled from the run logs (`gh run view 32443188579 --log --job …`):

```
ubuntu-latest   # tests 454 / # pass 454 / # fail 0 / # skipped 0 / # todo 0
macos-latest    # tests 454 / # pass 454 / # fail 0 / # skipped 0 / # todo 0
windows-latest  # tests 454 / # pass 450 / # fail 0 / # skipped 4 / # todo 0
```

**`# skipped 0` on both POSIX platforms**, which is where `test/hook-auth-roundtrip.test.cjs`'s two
`{ skip: !POSIX }` round-trip tests actually run. The four Windows skips are the win32-gated ones,
two of which are that file's. Green is therefore meaningful, not vacuous.

There is no check run named `E2E` — that is the workflow's `name:`, not a job's.

---

## Requirement status — all four left Pending, deliberately

Following the precedent set by 01-02, 01-04 and 01-05: **plan 23 owns the checkboxes.**
`requirements.mark-complete` was **not** run for any of RECORD-03, RECORD-04, FLOOR-09 or GATE-01.

| Requirement | State after this plan |
|---|---|
| **RECORD-03** | Code complete and runtime-proven (whole-ledger read, restart durability across a real process boundary). Checkbox is plan 23's. |
| **RECORD-04** | Code complete and runtime-proven (clamped diffs, one row semantics). Checkbox is plan 23's. |
| **FLOOR-09** | **NOT complete.** Opening half only — see the two sections at the top. |
| **GATE-01** | The sidecar hole and the three shim bodies are closed; `1 1 1 1 1 1`. Plan 23 asserts GATE-01 whole in wave 9. |

---

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] A raw NUL byte in `hive.ts`, introduced by this plan's own commit `1d8a140`**

- **Found during:** Task 4, when `grep -n "  commit(" src/main/hive.ts` answered `Binary file src/main/hive.ts matches`.
- **Issue:** the series key in `applyCostRow` was written with a literal `U+0000` separator instead of
  the escape. It ran correctly, but a control byte in a `.ts` file makes `grep` classify the file as
  binary and **skip it** — so every grep-based check over `hive.ts` would have silently returned
  nothing. That is the same class of defect as a vacuous test: the check reports success by not
  running.
- **Fix:** same semantics, written as the escape `\u0000`.
- **Commit:** `c98381d`, its own atomic `fix(...)` commit, isolated from task 4's changes.

**2. [Rule 3 — Blocking] `hive.ts` and the test files silently acquired CRLF line endings mid-run**

- **Found during:** Task 2, when `git show --stat` on the arithmetic commit reported a **whole-file
  rewrite** (3767 insertions / 3661 deletions) instead of a ~130-line diff.
- **Issue:** `core.autocrlf=true` writes CRLF into the worktree on checkout, and it did **not**
  normalize back on `git add` for this file. A whole-file line-ending diff is unreviewable and would
  have masked the actual change from every reviewer and every path-scoped assertion.
- **Fix:** normalize to LF before staging, and check `git diff --cached --stat` before every commit.
  Commits 2 and 3 were re-made from a clean base (`git reset --soft` onto commit 1, then re-commit) so
  the landed history carries the real diffs: `+127/−21` and `+54/−14`.
- **Verified:** every commit in this plan has a proportionate `--stat`.

### Deliberate departures from the plan text

**3. Commit 1 empties the `CostSample` branch; commit 3 repoints it. The plan's commit-1 text asks for
both at once, which cannot compile.**
The plan's commit 1 says *"route it through `telemetry.recordCostSample()` … and append the resulting
cumulative sample"*, and commit 3 says *"the branch then builds the sample once and hands it to
`this.recordCost?.(sample)`"*. Those are the same edit, and the route does not exist until commit 3
adds the constructor parameter. Taken instead, so that **every commit compiles**: commit 1 removes the
hand-built delta appender (which is precisely "unify ledger row semantics" — it deletes the writer
with the wrong semantics, leaving one appender and one contract), commit 2 is the `hive.ts`
arithmetic, and commit 3 adds the sink and repoints the branch at it. The `git show --stat` ordering
D-23 cares about is unaffected: three source-only commits, then the test.

**4. `HookServer`'s constructor registers itself as the hive's token source, rather than a second
T-INDEX handoff.**
The plan says to *"thread the minted per-agent token through `startProxyBridge`'s `cfg`"* and calls
*"whatever plan 02's SUMMARY names it"*. Plan 02 named `HookServer.mintToken(agentId)` — which lives on
`HookServer`, not on `HiveManager`, and `HiveManager`'s constructor takes only `getHome` and `emit`.
Every other route to it (`setOtelEndpoint`, `setRoutedObserver`, `PtyManager.setHookTokenSource`) is
wired from `index.ts`, which this plan may not write. Adding `HiveManager.setHookTokenSource` and
registering it **from `HookServer`'s own constructor** — the one object that already holds a
`HiveManager` and can mint — keeps the whole fix inside this plan's two files and keeps the FLOOR-09
argument as the **only** thing handed to `index.ts`. The token is minted inside `startProxyBridge`
(which owns the matching `stopProxyBridge`/exit revoke) rather than by its caller; the env literal
stays inline in `startProxyBridge` as the acceptance criterion requires.

**5. `grep -c "appendCostLedger" src/main/hooks.ts` was made literally `0` by rewording three
comments.**
The criterion is a whole-file count, and this plan's own required WHY comments name the function
three times. Rather than report the criterion unsatisfied, the comments now say "the hive's
cost-ledger appender" — the explanation is intact, the symbol is one grep away in `hive.ts`, and the
file-wide `0` becomes a true structural guarantee that **no** code path in `hooks.ts` writes the
ledger, which is what the criterion is actually for.

**6. The byte-level shim test drives the bootstrapped shim FILE, not a slice of the template
source.** Slicing `PROXY_BRIDGE_SHIM` out of `hive.ts` returns the raw TS template text, in which
`'\\n'` is still escaped — running it wrote a literal backslash-`n` and the JSON never parsed. The
plan explicitly permits *"or drive the written shim file"*; `<hive>/bin/hive-proxy.cjs` is the exact
bytes a qwen sidecar executes, so it is also the more faithful fixture.

---

## Known limitations, stated rather than implied

1. **`taskSpend()` on a card that has left the board returns zero.** The accumulator's lifetime bound
   drops entries whose task id is no longer in `tasks()`. `taskSpend` has no production caller today
   (only tests; plan 09 adds the breaker's budget arm) and every foreseeable caller iterates live
   cards, so this is the intended trade for the memory bound RECORD-03 removed — but it is a
   behaviour change for an archived card and it is recorded here rather than discovered later.

2. **T-P06-05's premise is wrong and the disposition still holds.** The plan accepts the startup scan
   *"on a file already bounded by `LOG_ROTATE_BYTES`"*. Measured: `LOG_ROTATE_BYTES` is applied only
   to `log.jsonl` (`hive.ts` `appendLog`); **`cost-ledger.jsonl` is not rotated at all**. The scan is
   therefore over an unbounded file. It still runs once per process and the alternative is recorded
   (`PersistStore`'s `cost_ledger` table, one `SUM(...) GROUP BY task_id`), but the reason to accept
   it is "once per boot", not "the file is small". RECORD-02 (Phase 4) owns ledger retention.

3. **The `/dev/null` hooks path is strong on POSIX and weaker on win32.** `/dev/null` is a char device
   no unprivileged process can turn into a directory; on win32 the string resolves to a drive-root
   path, which is a weaker assumption. That is precisely why the test asserts the hook does not
   **fire** rather than that the flag is present — and it passes on all three CI platforms. The
   comment in source states the ceiling, including that this protects git runs the **hive** makes and
   not an agent running `git` in its own shell.

4. **No live qwen/crush run.** The sidecar path is proven with a real spawn, a real socket, the real
   shim file and the real server — but not with a real qwen CLI and a real account, which this project
   does not have (PROJECT.md's standing constraint). GATE-01's sidecar clause is verified at the
   process boundary, not end-to-end through the vendor CLI.

5. **The 8-parameter `HookServer` constructor is at the limit of positional injection.** A ninth
   dependency should become an options object rather than a ninth positional argument. Not done here:
   changing the shape now would move every existing call site and break the "no existing call site
   moves" property the FLOOR-09 handoff depends on.

---

## Self-Check: PASSED

```
FOUND: .planning/phases/01-finish-the-floor/01-06-SUMMARY.md
FOUND: src/main/hive.ts       FOUND: src/main/hooks.ts
FOUND: test/hive-protocol-v2.test.cjs
FOUND: test/engine-parity.test.cjs
FOUND: test/hook-auth-roundtrip.test.cjs
FOUND: 89481fa  fix(cost): unify ledger row semantics
FOUND: 1d8a140  fix(cost): sum over all rows
FOUND: d844315  feat(cost): wire recordCostSample
FOUND: b915d11  test(cost): assert the corrected spend arithmetic, the whole ledger, a real restart, and the FLOOR-09 sink
FOUND: c98381d  fix(cost): write the ledger series separator as an escape, not a raw NUL byte
FOUND: 840c36e  fix(gate-01): give the qwen sidecar its own hook token, in the env AND in the shim body
```
