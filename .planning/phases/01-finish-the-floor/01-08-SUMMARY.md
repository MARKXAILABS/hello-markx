---
phase: 01-finish-the-floor
plan: 08
subsystem: delivery
tags: [FLOOR-02, FLOOR-09, queue, ipc, durability, adr-0001]
requires:
  - "01-06 — the `recordCost?` parameter on HookServer and the TelemetryCollector sink (task 6 applies its handoff)"
  - "01-07 — main's delivery tick, the quiesce backstop and the `hasOutput` fix the queue drain rides beside"
provides:
  - "a MAIN-owned, file-durable MD queue drained from delivery.ts's existing tick"
  - "one IPC channel (`hive:queue`) through which the renderer touches that queue"
  - "src/shared/queueDelivery.ts — the pure drain policy both processes import"
  - "FLOOR-09's production injection at the sole `new HookServer(` call"
affects:
  - "01-09 (wave 4) — the breaker's budget arm now reads a getAgentUsage that the proxy tier actually reaches"
  - "01-10 (wave 5) — task 5 hard-gates on this plan having applied 01-06's FLOOR-09 handoff; it has"
  - "01-11 (wave 5) — B-durability moved 5 -> 6; plan 11 asserts B-durability + 4 against the same file"
  - "01-23 (wave 9) — owns the FLOOR-02 / FLOOR-09 checkboxes; both left Pending here"
tech-stack:
  added: []
  patterns:
    - "a data-ownership migration, not a code move: the loop could not move until the queue did"
    - "durability as bytes-before-return (writeFileSync to a temp file + renameSync), proven across a real spawnSync(process.execPath) boundary"
    - "an injected path THUNK rather than a captured string, because the composition root builds the service before the path exists"
    - "one discriminated-op IPC channel instead of four, so remove/release/clear cannot drift from enqueue"
    - "repointing the store ACTION rather than the producer call sites — the action is the renderer's one gate"
    - "a source-assertion pin SLICED to its call's argument list, driven red three ways"
key-files:
  created:
    - src/shared/queueDelivery.ts
  modified:
    - src/main/delivery.ts
    - src/main/index.ts
    - src/preload/index.ts
    - src/renderer/src/hooks/useHive.ts
    - src/renderer/src/store/store.ts
    - test/delivery-main.test.cjs
    - test/queue-delivery.test.cjs
    - test/hive-durability.test.cjs
    - test/hive-task-mutation.test.cjs
decisions:
  - "The queue is one plain JSON file (delivery-queue.json), NOT jsonl and NOT PersistStore — but the plan's stated reason for ruling out SQLite is factually stale on this machine and was not used"
  - "queuePath is a `() => string | null` thunk, not the `string` the plan drafted: a string captured at module scope is a RELATIVE path before onboarding"
  - "The queue's dedup is the persisted file itself, deliberately NOT the wake's seenSet — that set is pruned against the live hive inbox every tick and would erase a queue id within four seconds"
  - "ONE ipcMain.handle taking a discriminated op, because enqueue is not the only mutation the renderer performs"
  - "The store ACTION was repointed, not the seven producer call sites — the action is the renderer's one gate, which is the argument its own one-compact invariant already made"
  - "The one-pending-compact invariant moved to main WITH the queue; left in the renderer it would have been advisory"
  - "The Slack-origin kanban promotion moved to main's onQueueDelivered — a card minted by the renderer is a card not minted with the window closed"
metrics:
  duration: "~3h05m"
  completed: 2026-08-21
---

# Phase 01 Plan 08: FLOOR-02's Queue-Drain Half + FLOOR-09's Production Injection — Summary

The MD queue and its drain are MAIN's. `useHive.ts` effect #4 — ~150 lines that died with every
window — is deleted, the queue is a file main owns and writes through before every mutator returns,
and the drain rides the tick `delivery.ts` already runs, through the same `submit()` PTY gate.
The renderer keeps exactly one job on this path: reporting the human's draft up as a veto.
FLOOR-09's one production line landed too, closing the window plan 06's SUMMARY opened.

**FLOOR-09 PRODUCTION INJECTION LANDED (from 01-06 handoff).**

**FLOOR-02 IS NOT CLOSED HERE EITHER** — see the blocker section. Its manual clause is still open.

---

## Task 1 — the producer inventory and the written minimum contract

### The pasted producer grep, classified

`grep -rn "messageQueues\|removeQueuedMessage\|enqueueMessage" src/renderer/src --include=*.ts --include=*.tsx`

| Hit | Class | Disposition |
|---|---|---|
| `MessageQueueComposer.tsx:31` `useStore((s) => s.messageQueues[agent.id])` | DISPLAY | reads the mirrored view; untouched |
| `MessageQueueComposer.tsx:32,139` `enqueueMessage(agent.id, body)` | PRODUCER (the composer) | call site untouched; the ACTION now forwards over IPC |
| `MessageQueueComposer.tsx:33,278` `removeQueuedMessage` | MUTATOR (UI) | forwards over IPC |
| `MessageQueueComposer.tsx` `releaseQueuedMessage` / `clearQueue` | MUTATOR (UI) | forward over IPC |
| `useHive.ts:661,665,667,671` terminal work order + its fallback to god | PRODUCER (terminal work orders) | call sites untouched |
| `useHive.ts:803,804,854,878,891,896` | CONSUMER (the drain) | **DELETED** |
| `useHive.ts:1002` Slack ingress | PRODUCER (Slack) | call site untouched |
| `useHive.ts:1021` `onHiveEnqueue` (main routing to a non-Claude agent) | PRODUCER | call site untouched |
| `useHive.ts:1077,1079` `onRealtimeEnqueue` | PRODUCER (voice bridge) | call site untouched |
| `useHive.ts:1104,1116,1140` context triggers | PRODUCER (compact/clear) | call site untouched |
| `store.ts:201,283,285,608,772-827` the slice + its mutators | OWNER | **the migration point** |
| `store.ts:687-691, 710-715` `removeAgent` / `archiveAgent` dropping a queue | MUTATOR | now `{op:'clear'}` to main |

### The written minimum contract (decided before any code moved)

- **Storage.** `<harnessHome>/delivery-queue.json`, beside `log.jsonl`, `cost-ledger.jsonl`,
  `fleet.json` and `roster.json`. **Justification vs the jsonl files beside it, in one sentence:**
  those are records of things that *happened* and are append-only, whereas the queue is a *mutable*
  list — items leave it on delivery and move within it on "send now" — so an append-only log of
  enqueue/remove events would need its own compactor, which is precisely the unbounded-growth
  failure (T-P08-04) pruning is supposed to close.
- **IPC channel.** `hive:queue`, one `ipcMain.handle`, a discriminated op
  (`enqueue | remove | release | clear | list`), payload validated at the handler, recipient resolved
  against main's own roster, never throws across IPC.
- **The veto stays in the renderer.** `hive:deliveryVeto` was NOT migrated and NOT touched.
- **Dedup.** See the deviation below — routing through `seenSet` literally would have been a bug.
- **Drain.** In `delivery.ts`'s existing tick, reusing the relocated pure policy, behind the same
  `paused()` / `vetoed()` / boot-grace / idle guards, through the same single `submit()` PTY gate.

### NOT MOVING, with a reason each

| Not moved | Reason |
|---|---|
| The **veto** (`hive:deliveryVeto`, useHive effect 4b) | It is the one fact only the renderer can see — the xterm buffer and the human's keystrokes. Main owns the decision; the renderer reports an opinion up. |
| The **seven producer call sites** | The store action is the renderer's ONE gate onto this path — the reason its own one-pending-compact invariant lived there rather than at the producers. Repointing the gate repoints every producer, including the next one added. A per-call-site rewrite would leave the slice writable again. |
| The **DISPLAY reads** (`MessageQueueComposer`) | They render a mirrored view, fed by main's push. No IPC path needed for a read. |
| `persistQueues` / `loadPersistedQueues` in store.ts | Left in place but off the delivery path, so `rosterMirror.queues` still seeds from the persisted copy and `roster.json` keeps pre-migration messages until main adopts them once. |
| The **Stop-drain** (`drainAtStop`) | Explicitly out of scope; untouched. Its four guard tests still pass unchanged (named below). |
| `terminalAutomation.ts` / `terminalPool.ts` | The veto's implementation. Stays with the veto. |

### The failure mode designed against

Two writers to one queue with no single owner is how a message is delivered twice or dropped. The
renderer's drain is **deleted, not left as a fallback**; the store slice is a read-only view; and the
only mutation path is `hive:queue`. Delivery removes the item from the file before the acknowledge
returns, so a second tick finds nothing to send.

### The SQLite probe — A FINDING, the plan's premise is stale

```
$ node -e "const D=require('better-sqlite3'); new D(':memory:'); console.log('SQLITE USABLE UNDER NODE')"; echo "EXIT=$?"
SQLITE USABLE UNDER NODE
EXIT=0
```

The plan states this was measured at plan time as `Could not locate the bindings file`, with "no
`.node` binary in `node_modules/better-sqlite3` at all". **That is no longer true here**, and it
corroborates the ANCHOR DRIFT note 01-07 filed. The cause:

```
$ node -p "require('./node_modules/better-sqlite3/package.json').version"       -> 13.0.3
$ node -p "JSON.stringify(require('./node_modules/better-sqlite3/package.json').files)"
["binding.gyp","src/**/*.[ch]pp","lib/**","deps/**","prebuilds/**"]
$ ls node_modules/better-sqlite3/prebuilds
darwin-arm64.node darwin-x64.node linux-arm64.node linux-x64.node
linuxmusl-arm64.node linuxmusl-x64.node win32-arm64.node win32-x64.node
```

better-sqlite3 13 ships per-platform prebuilds **inside the published tarball**, so `npm ci
--ignore-scripts` (what CI's test job runs) gets them too. A SQLite-backed queue would therefore have
been runnable under `node --test`, on this host and on all three CI platforms.

**The plain file was still the right call, and the decision does NOT rest on the stale premise.**
The reason that does hold: `src/main/delivery.ts` is deliberately the cluster's only Electron-free
module — its own header says so, and that is what lets `node --test` drive the whole loop with fakes.
Pulling a native binding into it would end that property for every test in
`test/delivery-main.test.cjs`, not just the new ones. Plus the queue is a few dozen items bounded by
human typing speed; a whole SQL engine for it is not the smaller thing.

### Baselines recorded (task 1)

```
$ node --test test/queue-delivery.test.cjs test/delivery-main.test.cjs ; echo EXIT=$?
EXIT=0     ℹ tests 22  ℹ pass 22  ℹ fail 0
```

| Baseline | Value |
|---|---|
| **B-delivery-main** (`test/delivery-main.test.cjs` `# pass`) | **20** |
| `test/queue-delivery.test.cjs` `# pass` | 2 |
| `grep -c queueDelivery src/main/delivery.ts` | 0 |
| `grep -cE setInterval src/main/delivery.ts` | 2 |
| `grep -c queuePath src/main/delivery.ts` / `src/main/index.ts` | 0 / 0 |
| `grep -cE "writeFileSync|appendFileSync|fsyncSync" src/main/delivery.ts` | 0 |
| `grep -c ipcMain.handle src/main/index.ts` | 153 |
| `grep -cE "spawnSync|execFileSync" test/delivery-main.test.cjs` | 0 |
| `grep -c process.execPath test/delivery-main.test.cjs` | 0 |
| `grep -c recordCostSample src/main/index.ts` | 0 |

---

## Task 2 — the relocation, the durable queue, the one channel

Commit `d7cb04e`.

`src/renderer/src/hooks/queueDelivery.ts` → `src/shared/queueDelivery.ts` via `git mv`, behaviour
unchanged. The cooldown and attempt rules moved there **with** the drain (`FLUSH_COOLDOWN_MS`,
`MAX_SEND_ATTEMPTS`, `nextForDelivery`, `noteAttempt`) rather than being retyped in main — the plan
forbids reimplementing them by hand, and the module as it stood carried only
`deliverWithAcknowledgement`, so moving them there is what "reuse the pure policy" can mean.

### Acceptance criteria

| Criterion | Result |
|---|---|
| `test/queue-delivery.test.cjs` exit 0, same count as baseline | `EXIT=0`, `# tests 2  # pass 2  # fail 0  # skipped 0  # todo 0` — unchanged from 2 |
| `ls src/shared/queueDelivery.ts` | succeeds |
| `grep -c queueDelivery src/main/delivery.ts` >= 1 | **1** |
| `grep -cE setInterval src/main/delivery.ts` unchanged | **2**, and `git show HEAD:src/main/delivery.ts \| grep -cE setInterval` = **2** — the drain rides the existing tick |
| `grep -c queuePath src/main/delivery.ts` >= 1 | **3** |
| `grep -c queuePath src/main/index.ts` >= 1 | **1** |
| `grep -cE "writeFileSync\|appendFileSync\|fsyncSync" src/main/delivery.ts` >= 1 | **2** |
| `grep -c ipcMain.handle src/main/index.ts` exactly +1 | **154** (was 153) |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0 — 460 tests, 456 pass, 0 fail, 4 skipped |

---

## Task 3 — the drain deleted, the producers repointed, delivery proven with no window

Commit `1a30333`.

### Acceptance criteria

| Criterion | Result |
|---|---|
| `grep -c "FLUSH_COOLDOWN_MS\|MAX_SEND_ATTEMPTS" src/renderer/src/hooks/useHive.ts` == 0 | **0** |
| `grep -c hiveDeliveryVeto src/renderer/src/hooks/useHive.ts` >= 1 | **3** (unchanged from the stated baseline of 3) |
| `node --test test/delivery-main.test.cjs` exit 0, >= B-delivery-main + 5 | exit 0, **27** at this task (20 + 7); **28** after the follow-up fix below |
| TAP counters | `EXIT=0`, `# tests 27  # pass 27  # fail 0  # skipped 0  # todo 0` |
| the four Stop-drain guard tests still named | `ok 4 - a veto from the renderer blocks a delivery, and clearing it lets it through` · `ok 5 - a veto blocks the Stop drain too — and expires so a dead renderer cannot wedge the floor` · `ok 6 - the Stop drain reports what moved and hands back the continuation prompt` · `ok 7 - an operator auto-delivery pause blocks the Stop drain` |
| `grep -cE "spawnSync\|execFileSync" test/delivery-main.test.cjs` >= 1 | **3** |
| `grep -c process.execPath test/delivery-main.test.cjs` >= 1 | **3** |
| `grep -cE "existsSync\|readFileSync" test/delivery-main.test.cjs` >= 1 | **4** |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0 — 467/463/0 fail/4 skipped |
| `Electron smoke (ubuntu-latest)` green on the phase PR | **pass, 1m37s** (see CI section) |

`npm run e2e` was **not** run locally. **E2E: CI only — no local Playwright run on this host.**
(`node_modules/@playwright` does exist here now, contradicting the plan's environment note, but the
job also needs a full-scripts install, browsers, and a build; the PR check is the evidence.)

### The durability evidence

`test/delivery-main.test.cjs`, `'a message enqueued and not yet delivered survives a REAL process restart'`.

**1. Pre-restart, on the filesystem.** The queue file is `<tmpdir>/md-delivery-queue-XXXX/delivery-queue.json`.
The assertion, pasted:

```js
assert.equal(fs.existsSync(queuePath), true, 'the queue wrote no bytes to disk at all');
const onDisk = fs.readFileSync(queuePath, 'utf8');
assert.ok(onDisk.includes(id), `the queue file does not contain ${id}: ${onDisk}`);
```

**2. The restart.** `spawnSync(process.execPath, [child, queuePath], { encoding: 'utf8' })`, where
`child` is written into the temp dir at runtime and builds a **fresh** `DeliveryService` over the same
`queuePath` with its own fakes, printing the pending ids as JSON. Not a `fork()`, not a `vm`, not
`delete require.cache`. Asserted `res.status === 0` and then the **specific** id:

```js
assert.deepEqual(JSON.parse(res.stdout), [id],
  `a fresh process did not read back the parked message (stdout: ${res.stdout})`);
```

**3. The in-file negative control.** `fs.rmSync(queuePath)` and the same child again:
`assert.deepEqual(JSON.parse(gone.stdout), [], 'the queue survived deletion of its own file — it is not reading the disk')`.

### Negative controls, run and pasted

**B — the plan's control: `rmSync(queuePath)` moved BEFORE step 2's spawn.**

```
===== NEGATIVE CONTROL B: rmSync(queuePath) moved BEFORE step 2's spawn =====
ℹ pass 26
ℹ fail 1
  AssertionError [ERR_ASSERTION]: a fresh process did not read back the parked message (stdout: [])
EXIT=1
RESTORED EXIT=0
```

**C — the exact fake the plan names: `saveQueue()` made a no-op, i.e. an in-process-only store.**

```
===== NEGATIVE CONTROL C: saveQueue() a no-op — the module-level-Map fake =====
ℹ pass 25
ℹ fail 2
  AssertionError [ERR_ASSERTION]: the queue wrote no bytes to disk at all
EXIT=1
```

It fails at the *earliest* point, before any restart, which is what that assertion is placed for.

**A — the drain unhooked from the tick**, to show the four delivery tests are not vacuous:

```
===== NEGATIVE CONTROL A: drainQueue unhooked from the tick =====
ℹ pass 23
ℹ fail 4
  AssertionError: the queued message never reached the PTY
  AssertionError: clearing the veto did not release the queued message
  AssertionError: nothing was delivered at all
  AssertionError: "send now" did not bypass the pause
EXIT=1
```

All three controls restored and re-run green.

---

## Task 4 — the operator gate: PARTIAL, and the remainder is NOT claimed

This is a `checkpoint:human-verify` and **the operator was not available in this session.** Per the
precedent 01-05 and 01-07 set, everything provable headlessly was automated and the rest is recorded
as unavailable rather than inferred.

| Question | Answer |
|---|---|
| delivered-with-window-closed | **MEASUREMENT UNAVAILABLE** — see below |
| veto suppressed | **MEASUREMENT UNAVAILABLE** — see below |
| survived-restart | **MEASUREMENT UNAVAILABLE** — see below |
| window CLOSED vs app quit | **neither was performed** |
| any message delivered twice or lost | **not observed either way** — nothing was run in a live app |

### What IS proven, headlessly

- **Delivery with no window attached.** `'a message enqueued through main is typed into the recipient
  PTY with NO window attached'` runs with `emit: () => {}` — a genuine no-op, which is exactly what
  main's emit *is* with no webContents (`try { liveWebContents()?.send(...) } catch {}`). The message
  reaches the PTY and is submitted. Proven red by unhooking the drain (control A above).
- **The drain runs on main's own timer.** `drainQueue` is unconditionally the first job inside
  `tick()`, and `'the backstop is on the timer start() arms — not a method nobody schedules'`
  (pre-existing, still green) stubs `setInterval`, asserts exactly one timer at <= 4 s and fires its
  callback. The drain-on-timer claim is compositional off that test, not separately asserted.
- **The veto still suppresses delivery.** `"the human's draft still vetoes a queued delivery"`.
- **Restart survival.** The `spawnSync(process.execPath, ...)` evidence above, with two controls.
- **Exactly-once.** `'enqueue-and-tick twice writes ONCE'`, with the clock bumped past the cooldown so
  the second tick is genuinely un-gated.

### MEASUREMENT UNAVAILABLE — exactly what a human must do

> Needs a real hive, two real agent CLI sessions on a live subscription, and a person at the machine.
> 1. `npm run dev`, spawn two agents.
> 2. Compose a message to agent B from the UI; do not wait for it to deliver.
> 3. **Close the window (close, not quit — the app stays in the tray/dock).**
> 4. Confirm the message reaches B's inbox and is typed into B's terminal. Reopen and check.
> 5. Repeat with a veto: start typing a draft reply, confirm delivery is suppressed while it is live.
> 6. Enqueue a message, **quit the app entirely** before it delivers, relaunch, confirm it still lands.
>
> Report: delivered-with-window-closed yes/no, veto suppressed yes/no, survived-restart yes/no, and
> state for step 4 whether the window was CLOSED or the app was QUIT.

A blocker naming this run is filed in STATE.md. Issue #5 was **not** closed and **must not be** until
it comes back.

---

## Task 6 — FLOOR-09's production injection (plan 06's T-INDEX handoff)

Commit `583f515`.

### FLOOR-09 PRODUCTION INJECTION LANDED (from 01-06 handoff)

**B-durability, measured on the UNEDITED file before any change:**

```
$ TAP=$(mktemp); node --test --test-reporter=tap test/hive-durability.test.cjs > "$TAP"; echo "EXIT=$?"; grep -E "^# (tests|pass|fail|skipped|todo) " "$TAP"
EXIT=0
# tests 5
# pass 5
# fail 0
# skipped 0
# todo 0
```

**B-durability = 5**, matching the 2026-08-20 figure plan 11 uses. No discrepancy.

The handoff heading `T-INDEX HANDOFF → 01-08 (FLOOR-09)` is present in `01-06-SUMMARY.md` and its diff
was applied verbatim, re-derived by content:

```
$ grep -n "new HookServer(" src/main/index.ts
521:const hookServer = new HookServer(
```

(01-06 recorded `:465`; three waves have edited above it. The location was re-derived, not trusted.)

```
const hookServer = new HookServer(
  hive, () => liveWebContents(), () => readConfig(), control, breaker,
  (agentId) => delivery.drainAtStop(agentId),
  (agentId) => focusAgent(agentId),
  (s) => telemetry.recordCostSample(s)          // FLOOR-09 (#19) — proxy-tier cost sink
);
```

The argument line, verbatim, is `  (s) => telemetry.recordCostSample(s)          // FLOOR-09 (#19) — proxy-tier cost sink`
— not commented out, not `() => {}`, not `undefined`, not `null`.

### Acceptance criteria

| Criterion | Baseline | Now |
|---|---|---|
| `grep -c recordCostSample src/main/index.ts` >= 1 | **0** | **1** |
| `grep -c "src/main/index.ts" test/hive-durability.test.cjs` >= 1 | **0** | **1** |
| `grep -c recordCostSample test/hive-durability.test.cjs` >= 1 | **0** | **3** |
| `npm run typecheck` exit 0 | — | exit 0 (the parameter 01-06 added accepts this argument) |

**TAP after the edit**, against **B-durability = 5**:

```
EXIT=0
# tests 6
# pass 6
# fail 0
# skipped 0
# todo 0
```

`# pass 6` satisfies **both** bounds: `>= B-durability + 1` (6 >= 6) and `>= 6` absolute. Neither was
relaxed.

### The pin has been seen red — three ways

```
===== NEGATIVE CONTROL 1: FLOOR-09 argument removed =====
recordCostSample in src/main/index.ts: 0
ℹ pass 5   ℹ fail 1
  AssertionError: proxy-tier spend never reaches getAgentUsage — FLOOR-09 (#19) is open, and the budget cap that reads it is a false cap
EXIT=1

===== NEGATIVE CONTROL 2: the sink replaced by an empty-arrow stub =====
ℹ pass 5   ℹ fail 1
  AssertionError: proxy-tier spend never reaches getAgentUsage — FLOOR-09 (#19) is open, and the budget cap that reads it is a false cap
EXIT=1

===== NEGATIVE CONTROL 2b: the sink present but COMMENTED OUT =====
grep -c recordCostSample: 1
ℹ pass 5   ℹ fail 1
  AssertionError: the cost sink is commented out — FLOOR-09 (#19) is open
EXIT=1
```

**Control 2b is a finding worth keeping:** it holds `grep -c recordCostSample` at **1** while the
wiring is dead. The plan's own `grep -c >= 1` criterion passes there. The sliced, comment-rejecting
pin is what catches it, which is why the pin is not redundant with the grep.

### FLOOR-09 at RUNTIME, not merely present in source

The plan's success criterion demands runtime proof, and this closes in two halves that share one
byte-identical expression:

```
$ grep -o "(s) => telemetry.recordCostSample(s)" test/engine-parity.test.cjs src/main/index.ts
test/engine-parity.test.cjs:(s) => telemetry.recordCostSample(s)
src/main/index.ts:(s) => telemetry.recordCostSample(s)
```

- **Runtime:** `test/engine-parity.test.cjs` `'FLOOR-09: a CostSample posted at the hook socket reaches
  getAgentUsage and arms the breaker'` posts to a **real hook socket** with that expression as the
  sink, then asserts `telemetry.getAgentUsage('qwen-1')` carries `input 9000 / output 5000 /
  sessionId 'proxy-session-1'` and that the breaker moves to `steering` on `/token limit/`. It ships
  with its own negative control (`'with no cost sink injected, the same payload never reaches
  getAgentUsage'`). Both green: `✔ FLOOR-09: ...` / `✔ FLOOR-09 negative control: ...`, 19/19 in that file.
- **Production:** the new pin proves `src/main/index.ts` passes that same expression at the sole
  `new HookServer(` call.

Together: the sink demonstrably works at runtime, and production demonstrably passes it. The only
thing not exercised is `index.ts` itself under a live Electron main — it cannot be loaded by
`node --test` (that is why `test/load-ts.cjs`'s electron stub exists), and no criterion in this plan
asked for it.

---

## Deviations from Plan

### Auto-fixed / decided

**1. [Rule 1 - Bug] `queuePath` is a thunk, not the `string` the plan drafted**
- **Found during:** Task 2
- **Issue:** `index.ts` constructs `DeliveryService` at module scope, where `readConfig().harnessHome`
  is legitimately `null` before onboarding. A `string` captured there is `join(null-ish, …)` — a
  RELATIVE path, so the queue would be written into whatever the process CWD is, and would then stay
  pointed at the old hive after the operator changes their home in Settings.
- **Fix:** `queuePath: () => string | null`. `null` means "no durable home", which disables the queue
  rather than scattering it. Both of the plan's greps still pass (3 in delivery.ts, 1 in index.ts) and
  a test still points it at a temp dir in one line.
- **Pinned by:** `'the queue is durable across a changed harness home, and bounded per agent'`.
- **Commit:** `d7cb04e`

**2. [Rule 1 - Bug] the queue's dedup is the FILE, deliberately not the wake's `seenSet`**
- **Found during:** Task 2
- **Issue:** The plan says "route through the existing `seenSet` dedup, not beside it". Doing that
  literally is a defect: `tick()` prunes that set against the live hive inbox on every sweep
  (`for (const id of seen) if (!stillUnread.has(id)) seen.delete(id);`), so a queue id parked in it
  would be erased within four seconds and the message re-typed.
- **Fix:** a delivered message is removed from the persisted queue inside the acknowledge, before the
  file is rewritten — narrower than the seen set *and* stronger, because it survives the restart an
  in-memory set cannot. The claim-before-await half of the renderer's `inFlight` idiom is kept as
  `queueInFlight`, released in a `finally`.
- **Pinned by:** `'enqueue-and-tick twice writes ONCE — a delivered message leaves the queue'`, with
  the clock bumped past the cooldown so the second tick is genuinely un-gated.
- **Commit:** `d7cb04e`

**3. [Rule 2 - Missing functionality] one `ipcMain.handle` carrying a discriminated op**
- **Found during:** Task 2
- **Issue:** The plan says "one enqueue channel" and gates on exactly one new `ipcMain.handle`. But
  enqueue is not the only mutation the renderer performs — the composer removes a row, releases one
  with "send now" and clears the lot, and dropping an agent drops its queue. Shipping only the enqueue
  half leaves those four editing a VIEW while main keeps delivering from the file behind it: the exact
  two-writers-no-owner failure the plan names.
- **Fix:** `hive:queue` takes `{op: 'enqueue'|'remove'|'release'|'clear'|'list'}`. Exactly one new
  `ipcMain.handle` (153 → 154), and strictly stronger than "one enqueue channel" — it is the one
  channel through which the renderer touches the queue at all.
- **Commit:** `d7cb04e`

**4. [Rule 2 - Missing functionality] the one-pending-compact invariant moved to main**
- **Found during:** Task 2
- **Issue:** It lived in the store's `enqueueMessage`. Left there it becomes advisory — two producers
  can both read a stale view in the window between their enqueue and main's push back.
- **Fix:** moved into `DeliveryService.enqueue`, the queue's new one gate, for the reason the store's
  own comment gives ("there are several [producers] … each one that grew its own check could still be
  bypassed by the next path someone adds").
- **Commit:** `d7cb04e`

**5. [Rule 2 - Missing functionality] one-shot adoption of pre-migration queues**
- **Found during:** Task 2
- **Issue:** The renderer mirrored its queues into `roster.json`. Anyone upgrading across this change
  has real messages there, and dropping them makes "the queue survives a restart" false on the one
  restart that matters.
- **Fix:** `adoptRendererQueues()` in index.ts, guarded on `!existsSync(delivery-queue.json)` so it
  runs at most once per hive and can never resurrect a message deleted afterwards. The renderer stops
  writing `rosterMirror.queues` but still *seeds* it at boot, so `roster.json` is not blanked before
  main can read it.
- **Commit:** `d7cb04e`

**6. [Rule 2 - Missing functionality] the Slack-origin kanban promotion moved to main**
- **Found during:** Task 3
- **Issue:** `ensureSlackCard` ran in the renderer drain's `.then()`. With the drain in main and the
  window closed, a Slack request would land in the terminal with **no card behind it** and nothing for
  the main-process done-observer to reply into — a hole this migration would have opened.
- **Fix:** `DeliveryDeps.onQueueDelivered`, wired in index.ts where the hive lives. `hive.addTask` is
  already a no-op on a colliding id, which is the only thing `ensureSlackCard`'s `hiveTasks()` read was
  ever checking, so that read went away with it. 01-05's `ONE_SHOT_READERS` pin in
  `test/repo-claims.test.cjs` is unaffected: it asserts only when a file HAS a `hiveTasks(` read, and
  `useHive.ts` now has zero. Its 30 s terminal reap (`TERMINAL_REAP_MS`, `:829`) is intact.
- **Commit:** `1a30333`

**7. [Rule 1 - Bug] `test/hive-task-mutation.test.cjs`'s anchor re-pointed, and proven red**
- **Found during:** Task 3 — the full suite went red on
  `'renderer task actions never send a whole stale ledger back to main'`.
- **Issue:** That test's four `doesNotMatch` **contract** assertions were all still satisfied. What
  broke was one location **anchor**, `assert.match(sources[3], /hiveAddTask\s*\(/)`, which pinned
  useHive.ts as the file that promotes Slack cards — a fact deviation 6 deliberately and correctly
  changed. No wave-4 plan declares this file (09 and 10 only cite its idiom).
- **Fix:** the contract assertions are untouched. The anchor now asserts useHive.ts does NOT mint the
  card and that **main** does, **sliced to `onQueueDelivered`'s own block** — index.ts already calls
  `hive.addTask` in the `hive:addTask` IPC handler, so an unsliced match would have stayed green with
  the promotion deleted.
- **Proven red:** replacing `hive.addTask({` with `void ({` gives
  `AssertionError: main's Slack-origin promotion must go through the atomic addTask, never a whole-ledger rewrite`,
  `EXIT=1`; restored `EXIT=0`.
- **This is NOT a test bent to fit a buggy source path.** The source is correct; the assertion that
  moved is a pointer, and it moved to where the behaviour went rather than being deleted.
- **Commit:** `1a30333`

**8. [Rule 1 - Bug] the deleted drain took the `/clear` context-gauge reset with it**
- **Found during:** post-task-3 audit of every behaviour inside the deleted effect (not caught by any
  criterion in this plan).
- **Issue:** The drain zeroed `contextTokens` / `contextLimit` / `progress` when it delivered a
  `/clear`, with a comment explaining why: the new session's size is unknown until statusLine fires
  after the first post-clear response, so the old value renders a stale-FULL bar against a session that
  no longer holds that context. Deleting the effect silently deleted that.
- **Fix:** `hive:queueDelivered` now carries `text` (the acknowledge removes the item first, so the
  renderer cannot look it up afterwards), preload exposes `onHiveQueueDelivered`, and useHive applies
  **exactly the old rule** — literal `/clear`, not "improved" into a provider-aware match the old code
  never did.
- **Pinned by:** `'the delivered event names the message AND its text — the /clear gauge depends on it'`.
- **Commit:** `e77ac98` (its own atomic `fix(...)`)

**9. [Rule 3 - Blocking] the harness in `test/delivery-main.test.cjs` gained `queuePath` in task 2**
- The plan lists that file under task 3, but a required dep makes 20 tests throw the moment it lands.
  It defaults to `() => null` — the queue disabled — so every pre-existing test drives exactly the loop
  it always drove. Commit `d7cb04e`.

**10. [Deviation - documented] two preload exports for the queue channel, plus a third for the delivered event**
- The plan says "add exactly one export for that channel". `hiveQueue` is that one export. `onHiveQueue`
  (the push that keeps the composer's pending list from going stale the moment main owns the list) and
  `onHiveQueueDelivered` (deviation 8) are listeners on different channels. A view that never updates
  is a rendered-output regression, which is the class UI-SPEC's FLOOR-11 contract calls out.

### Rejected

- **Porting the 150 lines.** The graded criterion is satisfied by a persisted main-side queue the
  renderer appends to. The drain in main is ~70 lines including comments.
- **Repointing the seven producer call sites.** See NOT-MOVING.
- **A SQLite-backed queue**, despite the probe now succeeding — see the finding in task 1.

---

## Verification

| Gate | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm test` (local, Windows, Node 24) | 469 tests / 465 pass / **0 fail** / 4 skipped |
| `npm run build` (Node 22.23.2, the CI pairing) | `✓ built in 51.52s` |
| PR #77 `Typecheck` | **pass** 31s |
| PR #77 `Test (ubuntu-latest)` | **pass** 46s — `# tests 469  # pass 469  # fail 0  # skipped 0` |
| PR #77 `Test (windows-latest)` | **pass** 1m14s — `# tests 469  # pass 465  # fail 0  # skipped 4` |
| PR #77 `Test (macos-latest)` | **pass** 48s — `# tests 469  # pass 469  # fail 0  # skipped 0` |
| PR #77 `Build` | **pass** 1m6s |
| PR #77 `Electron smoke (ubuntu-latest)` | **pass** 1m37s |
| The operator checkpoint's three answers | **MEASUREMENT UNAVAILABLE** — task 4 above |

All six jobs green at `e77ac98`. The 4 Windows skips are the pre-existing platform-gated tests, the
same count 01-07 recorded; the suite grew 460 → 469 and every added test passes on all three platforms.

---

## must_haves — truth by truth

| Truth | Status |
|---|---|
| "With the app window closed, a message composed in the UI still reaches its recipient's inbox and is typed into that agent's terminal" | **PARTIAL.** Proven with `emit` a genuine no-op and with a real second process for the restart half; NOT observed with a real window closed. Task 4's gate is open. |
| "Main owns the queue and its drain; the renderer's producers enqueue over IPC" | **TRUE.** The drain is `drainQueue` inside `tick()`; the store's four mutators forward over `hive:queue`; the renderer's slice is written only by `setQueues`. |
| "The queue survives an app restart — a message enqueued and not yet delivered is not lost" | **TRUE**, across a real `spawnSync(process.execPath)` boundary, with a pre-restart bytes assertion and two negative controls. |
| "The human's draft still vetoes delivery — the renderer keeps exactly that one job" | **TRUE.** `hive:deliveryVeto` untouched (3 hits), and the queue drain checks `vetoed()` before anything else it can act on. |
| "One gate for PTY writes is preserved: the main-side drain is not a second writer beside the existing one" | **TRUE.** The drain writes through `submit()`, which serializes per PTY on `writeChains`, and the renderer's drain is deleted rather than left as a fallback. ADR-0001's `Where it lives` section still names `useHive.ts` effect #4 — see Known Stubs. |

## must_haves — artifacts and key_links

| Item | Status |
|---|---|
| `src/shared/queueDelivery.ts` — the relocated pure policy | present |
| `src/main/delivery.ts` contains "queue" | present (main-owned persisted queue drained from the existing tick) |
| `src/preload/index.ts` — the enqueue channel | `hiveQueue` |
| renderer producers → main-owned queue, via one IPC channel, pattern "queue" | `hive:queue`, reached through the store action every producer already calls |
| `src/main/delivery.ts` tick → `src/shared/queueDelivery.ts`, pattern "queueDelivery" | `deliverWithAcknowledgement`, `nextForDelivery`, `noteAttempt`, `MAX_QUEUED_PER_AGENT` all imported, none reimplemented |

---

## Threat register — dispositions

| Threat ID | Disposition |
|---|---|
| T-P08-01 (tampering, the enqueue handler) | Mitigated. Every field type-checked at the handler; `{ok:false, error}` returned, never thrown. Pinned by `'the enqueue boundary refuses what it cannot trust'`. |
| T-P08-02 (two writers to one terminal) | Mitigated. One `submit()` gate; the renderer drain deleted. |
| T-P08-03 (delivered twice / dropped) | Mitigated. Removal from the persisted file inside the acknowledge + `queueInFlight` claim-before-await. Pinned by the exactly-once test. **NOT** routed through `seenSet` — see deviation 2. |
| T-P08-04 (queue growing unbounded) | Mitigated. Delivered entries are pruned; `MAX_QUEUED_PER_AGENT = 200` refuses (rather than evicts — silently dropping the human's oldest message is the worse failure). Pinned. |
| T-P08-05 (enqueuing to an agent it should not address) | Mitigated. `knownAgent` resolves the recipient against main's hive registry, excluding archived agents. Pinned. |
| T-P08-06 (the veto silently lost) | Mitigated in code and asserted; the operator re-check is **still outstanding** (task 4). |

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-ipc-endpoint | `src/main/index.ts` | `hive:queue` is a new IPC surface that causes text to be typed into a live agent's terminal. It IS in the plan's threat model (T-P08-01/05) and is validated, but it is the plan's largest new attack surface and a later reviewer should read it as such. |
| threat_flag: new-file-write | `src/main/delivery.ts` | `<harnessHome>/delivery-queue.json` is a new file written by main on every queue mutation, plus `*.tmp-*` staging files. The hive's `.gitignore` already carries `*.tmp-*`; **`delivery-queue.json` itself is NOT in that seed list and is not in `UNTRACK_PATHS`** — see Known Stubs. |

## Known Stubs

| Stub | File / line | Reason |
|---|---|---|
| `delivery-queue.json` is not in the hive's `.gitignore` seed or `UNTRACK_PATHS` | `src/main/hive.ts:304`, `:738-740` | `src/main/hive.ts` belongs to other plans this wave and the next, and the plan forbids touching it. The file will therefore be versioned by the hive's auto-commit — churny, the same pathology `cost-ledger.jsonl` was untracked for. Not a correctness defect; logged to `deferred-items.md`. |
| `docs/message-queue.md` §1/§6 and `docs/adr/0001-one-gate-for-pty-writes.md` still name `useHive.ts` effect #4 as the one writer | both docs | Neither file is in this plan's `files_modified`, and 01-07's twelve-denial sweep is the precedent for doc corrections landing in their own plan. **These docs now promise a code path that does not run** — which is a clause of ROADMAP criterion 1 — so a blocker is filed and it is logged to `deferred-items.md`. |

---

## Blockers filed

1. **FLOOR-02's operator run is OUTSTANDING and this plan does NOT claim it.** Three answers required:
   delivered-with-window-closed, veto suppressed, survived-restart, plus whether the window was CLOSED
   or the app QUIT for step 4. Full steps in task 4 above. Issue #5 was deliberately NOT closed.
2. **ROADMAP criterion 1's "grep finds no doc promising a code path that does not run" clause is now
   FALSE**, because this plan made it false: `docs/message-queue.md` and `docs/adr/0001-...` still name
   the deleted `useHive.ts` effect #4 as the sole PTY writer. Owner: a plan that holds those two files.
3. **`delivery-queue.json` needs a `.gitignore` seed + `UNTRACK_PATHS` entry in `src/main/hive.ts`.**
4. **The plan's premise that better-sqlite3 cannot load under plain `node` is stale** (prebuilds ship in
   the tarball, v13.0.3). Any later plan reasoning from it should re-measure. The plain-file decision
   here does not depend on it.
5. **FLOOR-02 and FLOOR-09 left `Pending` in REQUIREMENTS.md**, matching the 01-02/01-04/01-05/01-06/01-07
   precedent — plan 23 owns the checkboxes. FLOOR-09 now has full evidence and may be ticked. FLOOR-02
   must NOT be ticked until blocker 1 comes back.

---

## Anchor drift, for later plans

- `new HookServer(` is at `src/main/index.ts:521` (01-06 recorded `:465`).
- `useHive.ts` lost ~150 lines: effect 4b (the veto) and 4c (the 30 s reap) moved up. `TERMINAL_REAP_MS`
  is at `:53`, its `setInterval` at `:829`.
- `test/delivery-main.test.cjs`: **B-delivery 20 → 28.** The four Stop-drain guard tests are now at
  `:123-148`, not `:117-142`.
- `test/hive-durability.test.cjs`: **B-durability 5 → 6.** Plan 11 asserts B-durability + 4 = **10**.
- `delivery.ts`: `drainAtStop` is at `:463`; `quiesce`'s `hasOutput` guard (01-07's fix, intact) at `:661`.

---

## Commits

| Commit | Message |
|---|---|
| `d7cb04e` | `feat(01-08): main owns the delivery queue, drained from its existing tick` |
| `1a30333` | `feat(01-08): delete the renderer drain; the store asks main instead of writing` |
| `583f515` | `feat(01-08): apply plan 06's T-INDEX handoff -- FLOOR-09's proxy cost sink` |
| `e77ac98` | `fix(01-08): the deleted drain took the /clear context-gauge reset with it` |
