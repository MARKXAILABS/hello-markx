---
phase: 04-overnight-on-a-repo-that-matters
plan: 11
subsystem: main/floor
tags: [vigil-01, watchdog, absence, notifications, web-push, boot-seam]
requires:
  - "src/main/floor/boot.ts — the module `let` block, SHUTDOWN_STEPS, the Floor interface, the returned object (plan 04-09 held it in wave 2)"
  - "src/main/pty.ts — lastOutputAt / idleFor (read-only)"
  - "src/main/hive.ts — the ledger `rev`, registry().godId, hive/log.jsonl (read-only)"
  - "src/main/telemetry.ts — snapshot().usage[].ts (read-only)"
provides:
  - "AbsenceWatchdog + QuietSnapshot (src/main/floor/watchdog.ts) — the quiet computation, the edge latch, the transition-time in-flight snapshot"
  - "Floor.watchdog — the synchronous accessor plan 04-17 reads as floor.watchdog.current() from index.ts"
  - "the 'floor:quiet' IPC channel — QuietSnapshot on the setting edge, null on the clearing edge; plan 04-18's desktop chip listens to this literal"
  - "FLOOR_QUIET_TAG + floorQuietPushPayload (src/main/push.ts) — the sw.js wire body, with the self-sufficient title rule Q-4 requires"
affects:
  - "plan 04-17 (the phone's floorQuiet sibling field) — reads floor.watchdog.current()"
  - "plan 04-18 (the desktop QUIET chip) — listens to 'floor:quiet'"
tech-stack:
  added: []
  patterns:
    - "edge-trigger-and-clear latch, modelled on DeliveryService.quiesce"
    - "clear-then-set, unref'd setInterval in the armAlwaysOnBeats style, torn down through the one SHUTDOWN_STEPS list"
    - "injected readers over imports (floor/deps.ts house law) — the module is electron-free"
key-files:
  created:
    - src/main/floor/watchdog.ts
    - test/absence-watchdog.test.cjs
  modified:
    - src/main/floor/boot.ts
    - src/main/push.ts
    - test/boot-floor.test.cjs
decisions:
  - "D-23 honoured: the watchdog is a NEW operator-directed alarm, not HEARTBEAT_MISSION. config.ts:96-107 is untouched."
  - "D-24 honoured: publishQuiet rides the already-wired deps.send on one named channel; no second signal was added."
  - "D-25 honoured: told once is a latch, asserted by effect on a really-booted floor in both directions."
  - "D-35 honoured: index.ts is not in the diff — the Collision Map's dissolution was taken."
  - "ptyIdleMs is the MINIMUM per-PTY idle, not the maximum the <interfaces> comment said. A maximum calls a floor stopped while an agent is printing."
  - "The ledger rev's silence is TIMED (lastRevChangeAt), not compared tick-to-tick."
  - "godAlive() reports true when the registry names no god at all — a floor that never had an orchestrator cannot have lost one."
metrics:
  duration: ~55m
  completed: 2026-08-25
---

# Phase 04 Plan 11: The Absence Watchdog (VIGIL-01) Summary

An operator-directed absence watchdog in `bootFloor`'s timer seam: a four-part quiet test
(PTY silence, ledger `rev`, `appendLog`, spend), an edge-trigger latch that fires each of D-25's
three channels exactly once per quiet edge, and a transition-time in-flight snapshot reachable by
both later consumers through two accessors created here — `Floor.watchdog` and the `'floor:quiet'`
IPC channel.

## The one-line reason `HEARTBEAT_MISSION` was not reused

**It is addressed `to: 'god'` (`src/main/config.ts:100`) and its own doc says it "types into god's
PTY" (`:91-93`), so it cannot report that the god is the dead one** — which is the single case
VIGIL-01 names explicitly. A beat delivered into a dead orchestrator's terminal is not a report of
that death; it is the same silence with more steps.

## What was built

### Task 1 — `src/main/floor/watchdog.ts` (TDD)

`AbsenceWatchdog` + `QuietSnapshot`, electron-free, every collaborator injected. The floor counts as
stopped only when **all four** signals are silent past the threshold; **any one** of them moving
clears the latch. `current()` returns `null` while the floor moves and a snapshot once it has
stopped, with `sinceMs` recomputed live (a duration, per 04-UI-SPEC rule G-3) and `inFlight` /
`godDead` frozen at the transition.

**RED run, recorded as required:**

```
node --test test/absence-watchdog.test.cjs
  ✖ test\absence-watchdog.test.cjs
  Error: ENOENT: no such file or directory, open
    'E:\...\src\main\floor\watchdog.ts'
  ℹ tests 1  ℹ pass 0  ℹ fail 1
```

**GREEN run:** `ℹ tests 11  ℹ pass 11  ℹ fail 0`.

One genuine RED→GREEN iteration inside the GREEN gate: the first implementation failed the
`grep -c "HEARTBEAT_MISSION" === 0` clause because the module's own header prose named the symbol.
**The source was changed, never the test** — the criterion is a source-level pin whose whole job is
to stop "reuse the heartbeat" creeping back in as an import, and weakening it to allow the mention
would have retired the pin.

### Task 2 — the boot seam and the two accessors

- `watchdogTimer` in the module `let` block, armed clear-then-set and `unref`'d in the
  `armAlwaysOnBeats` style, torn down by the `clearWatchdogTimer` step in `SHUTDOWN_STEPS`.
- `watchdog: AbsenceWatchdog` on the `Floor` interface **and** the returned object, beside
  `hookServer` — the in-file precedent, and the reason plan 04-17 needs no line of `boot.ts`.
- `publishQuiet: (s) => { deps.send('floor:quiet', s); }` — one publish site, one spelling, `null`
  on the clearing edge so the renderer mirrors the latch rather than running a second state machine.
- The toast is gated on `readConfig().notifications` — the same expression `boot.ts:448-449` uses.
- `push.ts`: `FLOOR_QUIET_TAG = 'floor-quiet'` and `floorQuietPushPayload`, which maps the alarm's
  title into `agent` because `sw.js:31` renders `data.agent` as the notification **title** and
  hard-codes the body. `sw.js` itself is untouched (rule Q-5).

The beat body skips a floor with no home and a floor where **no agent has ever existed** — "nothing
is happening" is only an event where something was supposed to. Archived agents stay in the
registry, so a floor whose entire roster died still ticks, which is the case the requirement exists
for.

### Task 3 — the blast radius

Full suite, `typecheck` and `lint`, on the composition root. Numbers below.

## Test figures, delta attributed case by case

| Run | tests | pass | fail | skipped |
|---|---|---|---|---|
| Pre-plan (measured at base `8caf9eb`) | 934 | 927 | 0 | 7 |
| Post-plan | **947** | **940** | **0** | **7** |

**Delta +13, fully attributed:**

| Cases | Where | What |
|---|---|---|
| +1 | `absence-watchdog` | once-only: 1 alarm on the edge, **0 across the next five ticks**, 1 more only after activity → silence |
| +1 | `absence-watchdog` | god-death: `godDead === true`, all three channels fired, and **no** call carries a `'god'` recipient (asserted negatively, with a positive lower bound so it is not vacuous) |
| +1 | `absence-watchdog` | in-flight captured at the transition — `doingCards()` is mutated **in place and by replacement** afterwards |
| +4 | `absence-watchdog` | one case per signal (PTY output, ledger `rev`, `appendLog`, spend), each proving that signal alone clears the latch and re-arms the edge |
| +1 | `absence-watchdog` | `current()` is `null` while moving and a **live** duration once stopped |
| +1 | `absence-watchdog` | rule Q-4: the push title is self-sufficient in both the stopped and the god-dead case, tag `floor-quiet`, and maps to `agent` on the wire |
| +1 | `absence-watchdog` | the shipped default threshold is 300 000 ms |
| +1 | `absence-watchdog` | the module is electron-free, imports no floor subsystem, and does not name the heartbeat |
| +1 | `boot-floor` | `watchdogTimer` declared in the module `let` block and cleared by `SHUTDOWN_STEPS`; one `deps.send('floor:quiet'` site, ≥ 2 mentions |
| +1 | `boot-floor` | `floor.watchdog` is a live `Floor` member on a really-booted floor, and `'floor:quiet'` fires on **both** edges |

**Skipped count unchanged at 7** — nothing here is platform-gated.

## Gates

| Gate | Result |
|---|---|
| `npm test` | 947 tests, 940 pass, **0 fail**, 7 skipped |
| `npm run typecheck` | exit 0, 0 errors (node + web) |
| `npm run lint` | exit 0, `--max-warnings 0` |
| `node --test test/repo-claims.test.cjs` | 33/33 — `floor/watchdog.ts` passes the module-scope sweep unchanged |
| `node --test test/boot-floor.test.cjs` | 22/22 |
| `node --test test/absence-watchdog.test.cjs` | 11/11 |

## Grep criteria, measured

```
grep -c "from 'electron'"                    src/main/floor/watchdog.ts  → 0
grep -cE "from '\.\./(pty|hive|telemetry|config)'" src/main/floor/watchdog.ts  → 0
grep -c "HEARTBEAT_MISSION"                  src/main/floor/watchdog.ts  → 0
grep -o 'watchdog' src/main/floor/boot.ts | wc -l                        → 23  (≥ 6)
grep -c "deps.send('floor:quiet'"            src/main/floor/boot.ts      → 1
grep -c "'floor:quiet'"                      src/main/floor/boot.ts      → 2   (≥ 2)
grep -c "'floor-quiet'"                      src/main/push.ts            → 1
```

## The threshold, and its `[ASSUMED]` marking

`QUIET_THRESHOLD_MS = 300_000` (5 minutes), exported from `src/main/floor/watchdog.ts` and
overridable per instance through the constructor's `opts`. It is **marked `[ASSUMED]` in a comment
on the constant itself**: nothing in the research session measured the right value and D-25 leaves
it open. 300 000 is the number the floor has already reasoned about — the built-in heartbeat's own
`quietThresholdMs` at `src/main/config.ts:107` — so this reuses it rather than introducing a second
quiet window that would eventually disagree with the first. The beat runs every 30 000 ms
(`WATCHDOG_CADENCE_MS`), a sixth of the threshold and the same cadence the breaker beat already
uses.

## Files NOT touched — verified, not asserted

```
git diff --stat src/main/index.ts resources/phone/sw.js src/main/config.ts test/repo-claims.test.cjs
  → (empty)
```

- **`src/main/index.ts`** — the Collision Map's dissolution was taken: the watchdog stays entirely
  inside `boot.ts` and reuses the already-wired `deps.notify` / `deps.send`.
- **`src/main/config.ts`** — `HEARTBEAT_MISSION` is read-only to this plan. Not enabled, not
  re-addressed, not extended.
- **`resources/phone/sw.js`** — rule Q-5. Its one-line `body` fallback is plan 04-17's; the title
  rule is what makes the old-worker case truthful without touching it.
- **`test/repo-claims.test.cjs`** — plan 04-10's in wave 3. The module-scope sweep is satisfied by
  writing `watchdog.ts` correctly, not by editing the pin.

## Re-measured line numbers (every figure the plan cited had moved)

Plan 04-09 edited `boot.ts` in wave 2, so all of the plan's `boot.ts` figures were stale. Measured
at wave start, **before** any edit of mine (i.e. at base `8caf9eb`):

| Region | Plan said | Measured at wave start |
|---|---|---|
| `Floor` interface | `:97-146` | **`:99-142`** |
| module `let` block | `:150-180` | **`:144-190`** |
| `SHUTDOWN_STEPS` | `:928-956` | **`:992-1040`** |
| returned `Floor` object | (unnumbered) | **`:1280-1289`** |
| `armAlwaysOnBeats` | `:506-518` | `:520-530` |
| the notifications gate | `:411-413` | `:422-426` |
| `pty.ts` `idleFor` | `:940-945` | `:954-957` |
| `pty.ts` `outputTail` | `:930` | `:937` |
| `hive.ts` ledger `rev` | `:2118-2123` | `:2242-2250` (read) / `:2305` (bumped) |
| `config.ts` `HEARTBEAT_MISSION` | `:95-107` | `:96-107` (`to:'god'` `:100`, `enabled:false` `:105`, `quietThresholdMs` `:107`) |

**`boot.ts` diff scope.** Seven hunks, all inside this plan's declared regions plus the two
mechanical consequences of adding a module:

1. `:57-62` — the `import` of `./watchdog` and `../push`. **A fifth region the plan did not name**,
   and unavoidable: a new module has to be imported somewhere. Two lines.
2. `:100-115` — the `Floor` interface member.
3. `:163-189` and `:173-205` — the module `let` block (`watchdogTimer`, `WATCHDOG_CADENCE_MS`,
   `watchdog`).
4. `:1026-1068` — the `clearWatchdogTimer` step in `SHUTDOWN_STEPS`.
5. `:1137` — `watchdogTimer = null;` in `bootFloor`'s timer-reset block, immediately beside plan
   04-09's own `restorePointTimer = null;`. Same class, same block.
6. `:1276-1424` — the construction, the arming, and `watchdog` in the returned object.

It does **not** touch the `DeliveryService` dep object (plan 04-03's, wave 1) or the
`new HookServer(...)` argument list (plan 04-20's, wave 5) — verified by grepping the diff body for
`DeliveryService`, `liveAgents` and `HookServer`: the only `hookServer` hits are my own comment
text and the one returned-object line where `watchdog` was inserted into the list.

## Deviations from Plan

### 1. [Rule 1 — Bug] `ptyIdleMs` is the MINIMUM per-PTY idle, not the maximum

- **Found during:** Task 1, writing the dep against the `<interfaces>` block.
- **Issue:** The plan's interface comment reads *"Max `idleFor` across live agent PTYs"*.
  Implemented literally, one long-idle agent would make the floor read as stopped **while another
  agent was actively printing** — a false alarm on a busy floor, and it directly contradicts this
  plan's own truth criterion that *"any one of the four signals moving clears the latch"*.
- **Fix:** `ptyIdleMs()` is the time since the most recent output by **any** live PTY — the minimum
  of `idleFor`, which is exactly `boot.ts`'s existing `isFloorQuiet`
  (`Date.now() - Math.max(...lastOutputAt)`) written as a duration. `Infinity` with no live PTY at
  all, which is the god-death shape and must read as silence rather than as "no data". Documented
  on the dep with the reason.
- **Side effect, recorded:** `delivery.ts`'s `painted` guard (a never-printed TUI reads as idle
  because `pty.ts` seeds `lastOutputAt` to the spawn instant) is deliberately **not** copied, and
  the minimum is why — an unpainted PTY can only make the floor look busier than it is, which
  suppresses a false alarm and can never manufacture one. A `ponytail:` comment names the ceiling
  and says to add the guard the day this becomes a max.
- **Files:** `src/main/floor/watchdog.ts`, `src/main/floor/boot.ts`
- **Commit:** `edbbcea`, `6542b4a`

### 2. [Rule 2 — Missing critical functionality] the ledger `rev`'s silence is TIMED

- **Found during:** Task 1.
- **Issue:** The plan's action says `ledgerRev()` *"unchanged since the last tick"*. With a 30 s
  beat against a 300 s threshold, "unchanged since the last tick" is true 30 seconds after any
  mutation — it contributes nothing to a five-minute quiet test and, on a shorter beat, is
  effectively always true.
- **Fix:** the watchdog tracks `lastRevChangeAt` and requires `now - lastRevChangeAt > threshold`,
  the same shape as the other three signals. This is strictly stronger than the plan's clause (it
  implies it for any beat shorter than the threshold) and it matches the requirement's own wording,
  *"for longer than a threshold"*. `lastRevChangeAt` is seeded in the constructor, which also means
  a freshly booted floor cannot report quiet until a full threshold has actually elapsed since boot
  — asserted in `boot-floor`.
- **Files:** `src/main/floor/watchdog.ts`
- **Commit:** `edbbcea`

### 3. [Rule 2 — Missing critical functionality] `godDead` is "the god died", not "there is no god"

- **Found during:** Task 2, wiring `godAlive`.
- **Issue:** The obvious wiring — `registry().godId` has a live PTY — reports `godDead: true` on a
  floor whose registry names no god at all. The alarm would then tell an operator *"The orchestrator
  is gone"* about a floor that never had one.
- **Fix:** `godAlive()` returns `true` when `godId` is absent. `godDead` therefore means the
  registry names a god and no PTY is bound to it — a death, which is what the copy claims.
- **Files:** `src/main/floor/boot.ts`
- **Commit:** `6542b4a`

### 4. [Rule 3 — Blocking] `AbsenceWatchdog` had to be exempted in `boot-floor`'s #34 coverage loop

- **Found during:** Task 2 — `boot-floor` went red the moment `watchdog` joined the returned object.
- **Issue:** that test walks `Object.keys(floor)` and requires the string `` `${key}.` `` to appear
  in the joined `SHUTDOWN_STEPS` source. `clearInterval(watchdogTimer)` does not contain
  `watchdog.`.
- **Fix:** `'watchdog'` joins `resourceFreeFields` **with its reason written out**, beside
  `breaker`, `accountPool` and `roster` — the set's own doc invites exactly this and asks for the
  why. It is honest: the object is a latch plus four injected readers and owns no timer, socket or
  file handle; a `watchdog.stop()` would be a method with nothing to stop. The resource it is driven
  by, `watchdogTimer`, **is** in `SHUTDOWN_STEPS` and is pinned by name in a new case — which is the
  shape plan 04-09's `restorePointTimer` pin already established and which the plan's `read_first`
  anticipated.
- **Files:** `test/boot-floor.test.cjs`
- **Commit:** `6542b4a`

### 5. [Rule 3 — Blocking] the copy says "The orchestrator is gone", not "Michael is gone"

- **Found during:** Task 1.
- **Issue:** 04-UI-SPEC §S6a's third case is worded *"Michael is gone."* There is no god **name**
  available on this plan's dependency surface — `registry().godId` is an id, the name would need a
  further read, and the god is not always `michael`.
- **Fix:** the title is `The orchestrator is gone` and the body is
  `The floor has no orchestrator, and nothing has moved for 32m.` This satisfies rule Q-4's actual
  constraint verbatim (self-sufficient, contains `gone`, is not `Floor` or `Alert`) and is true for
  any god name. The named variant is the phone strip's, and the strip formats its own copy
  client-side from `floorQuiet`'s fields — so plan 04-17 can still render "Michael is gone" without
  main having authored the sentence, which §S6a explicitly requires it to do.
- **Files:** `src/main/floor/watchdog.ts`
- **Commit:** `edbbcea`

## Known Stubs

**One, and it is a delivery gap, not a seam gap — the two accessors R2-BL7 named are both real.**

| Stub | File | Reason |
|---|---|---|
| D-25 channel ③ (Web Push) composes its payload and logs it instead of sending | `src/main/floor/boot.ts` (the `push:` dep) | **There is nothing to send to, and this is measured, not assumed:** `push.ts` persists the VAPID keypair and nothing else, and `webhook.ts` has no subscription-intake route — `index.ts:614-625` states this in the repo's own words (*"no VAPID-public-key route and no subscription-intake callback exist in `WebhookServerOptions`, so there is nothing that could ever capture a `PushSubscription` to call `sendPush()` against"*). No `PushSubscription` has ever existed in this process. Adding the intake requires `index.ts`, which D-35 places outside this plan. |

What that stub is **not**: it is not the `QuietSnapshot`-with-no-accessor shape this plan exists to
close. `floor.watchdog.current()` and `deps.send('floor:quiet', …)` are both live and both asserted
**by effect on a really-booted floor, in both directions** — `current()` returns `null` while the
floor moves and an object with a positive `sinceMs` once it stops; the channel fires exactly once
with a snapshot on the setting edge and exactly once with `null` on the clearing edge. A getter
wired to a store that is never filled fails both.

What the push half **does** ship, completely: `FLOOR_QUIET_TAG` and `floorQuietPushPayload` — the
`sw.js` wire mapping, unit-tested in both the stopped and the god-dead case, with the rule Q-4 title
contract exercised on **every real alarm** (the boot-floor run prints
`[watchdog] no push subscription intake exists yet; this alarm reached the desktop only: The floor
has stopped`, which is that contract running against the real wiring). When the intake lands, the
only change is where that payload goes.

**Which plan resolves it:** 04-17 owns the phone surface, including `sw.js`'s one-line `body`
fallback. The subscription-intake route is `index.ts`'s and is not in this plan's `files_modified`.

## Authentication Gates

None.

## Threat Flags

None. Every mitigation in the plan's register is implemented and asserted:

| Threat ID | Where it is proven |
|---|---|
| T-04-ABS-01 | the four-part quiet test + the three D-25 channels (`absence-watchdog`, all cases) |
| T-04-ABS-02 | electron-free module, boot-seam timer, and the god-death case with `godAlive() === false` |
| T-04-ABS-03 | **0 alarms across the next five ticks**, not merely "one fired" |
| T-04-ABS-04 | the body carries a duration, an agent name and a card title only; the `console.warn` on the push path logs the **title** only |
| T-04-ABS-05 | the self-sufficient-title case, run for both the stopped and the god-dead copy |
| T-04-ABS-06 | `taskId: 'floor-quiet'`, one spelling, one definition, asserted |
| T-04-ABS-07 | `doingCards()` mutated in place **and** by replacement after the transition |
| T-04-ABS-10 | both accessors created here and asserted by effect in both directions |
| T-04-SC | no `package.json` / `package-lock.json` change; no install step |

No new network endpoint, no new auth path, no new file-access pattern, no schema change.

## Commits

| Task | Commit | What |
|---|---|---|
| 1 (RED) | `79ee031` | `test(04-11)` — 11 failing cases: the once-only latch, the god-death case, the four signals |
| 1 (GREEN) | `edbbcea` | `feat(04-11)` — `src/main/floor/watchdog.ts` + `push.ts`'s tag and wire payload |
| 2 | `6542b4a` | `feat(04-11)` — the boot seam, `SHUTDOWN_STEPS`, the `Floor` member, the `'floor:quiet'` channel, the boot-floor cases |
| 3 | *(this SUMMARY)* | the full-suite figures, the delta case by case, and the design's load-bearing reasoning |

## TDD Gate Compliance

`test(04-11)` → `feat(04-11)` → `feat(04-11)`. RED is recorded above verbatim (ENOENT on the module
under test). No REFACTOR commit — there was nothing to clean up that the GREEN commit had not
already written straight.

## Self-Check: PASSED

- `src/main/floor/watchdog.ts` — FOUND
- `test/absence-watchdog.test.cjs` — FOUND
- `src/main/floor/boot.ts` — FOUND (modified)
- `src/main/push.ts` — FOUND (modified)
- `test/boot-floor.test.cjs` — FOUND (modified)
- `79ee031` — FOUND
- `edbbcea` — FOUND
- `6542b4a` — FOUND
- `STATE.md` / `ROADMAP.md` — not modified (orchestrator owns those writes)
