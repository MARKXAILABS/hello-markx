---
phase: 01-finish-the-floor
plan: 13
subsystem: notifications
tags: [electron, notification, ipc, provider-capabilities, codex, windows, prompt-cache, floor-14, floor-18]

requires:
  - phase: 01-finish-the-floor
    provides: "01-09's breaker-enforcement tests and 01-06's cost assertions in test/engine-parity.test.cjs (appended to, never restructured)"
  - phase: 01-finish-the-floor
    provides: "01-10's index.ts state (FLOOR-10 budget arm, log-folder IPC, and the two deleted memory handlers that set B-ipcmain to 156)"
  - phase: 01-finish-the-floor
    provides: "01-02's hooks.ts per-agent token identity and 01-06's recordCost sink — both preserved"
  - phase: 01-finish-the-floor
    provides: "01-05/01-07/01-08's useHive.ts and usePtyParser.ts state — read live, not from a planning excerpt"
provides:
  - "A `remote` bit on ProviderCapabilities and a fourth clause in capabilityLine, so every engine's remote-control gap is declared in the roster the god reads"
  - "remoteControlAvailability(provider, platform) — one predicate distinguishing 'ok' / 'windows' (has it, this host cannot use it) / 'none' (never had it)"
  - "The Codex-on-Windows limitation stated in source, docs and prompt-UI with a VERIFIED upstream citation, replacing a bare unexplained return false"
  - "FLOOR-14's fourth clause: a blocked non-Claude agent produces exactly one OS toast, and clicking it focuses that agent"
  - "HookServer.notifyBlocked(agentId) — one narrow public method; notify() stays private, no new setting, no new click handler"
  - "test/hooks-notify.test.cjs — a real HookServer over a real socket with a recording Notification, RED-controlled 5/5"
affects: [FLOOR-12 sweep plans that hold SettingsModal.tsx, plan 01-23's wave-9 doc-claim sweep and repo-claims pins, VIGIL-03 in Phase 4]

tech-stack:
  added: []
  patterns:
    - "Platform-dependent capability expressed as a BIT on the capability record, with the platform read once behind a defaulted parameter — keeps capabilityLine's signature stable and the value prompt-cache-constant"
    - "Renderer→main notification edge where main re-resolves the agent against the live registry and owns every abusable decision (title, body, click target, whether it fires)"
    - "A recording electron Notification injected through require.cache, letting a private method be asserted end-to-end without widening the class's public API"

key-files:
  created:
    - test/hooks-notify.test.cjs
  modified:
    - src/shared/providerAutomation.ts
    - src/main/index.ts
    - src/main/hooks.ts
    - src/preload/index.ts
    - src/renderer/src/hooks/usePtyParser.ts
    - src/renderer/src/hooks/useHive.ts
    - test/engine-parity.test.cjs
    - README.md

key-decisions:
  - "Took the `remote` BIT, not a platform argument on capabilityLine (D-40 left this to the executor) — ADR-0002 bans values that change BETWEEN TURNS, and process.platform read once behind a defaulted parameter is a process-lifetime constant, so the roster line is byte-identical on every turn on a given host"
  - "The clause names WHICH gap it is: 'REMOTE CONTROL unavailable on Windows' only where the engine has remote control and this host cannot use it; 'NO REMOTE CONTROL' for the nine engines that never had it. A single shouted string would have blamed Windows for a gap that exists on every platform"
  - "Kept the bare `return false` verbatim per D-41 and added the comment around it, rather than deleting it — deleting buys two awaited codex subprocess timeouts on every Windows spawn and still surfaces nothing"
  - "Duplicated the win32 literal in index.ts rather than calling remoteControlAvailability there — the acceptance criterion pins the literal, and the JSDoc names both sites so they cannot drift silently"
  - "Gated the new toast path on PROVIDER IN MAIN, off the live registry, not in the renderer — the renderer names an agent and gets no say in anything else (T-P13-03, T-P13-06)"
  - "Did NOT touch SettingsModal.tsx's notification copy despite must_haves truth #5 requiring it — the file is outside this plan's declared set and both containment criteria fail on any file outside it. Reported as PARTIAL with a blocker and a deferred item, never papered over"
  - "Posted D-43 evidence on #61/#42 and added `Closes` to PR #77 rather than closing either issue now — the fix is on a draft branch, not on main"

patterns-established:
  - "Platform-parameterised capability predicate: every branch is asserted on EVERY CI runner, so an ubuntu job still proves the Windows string and a Windows job still proves the POSIX one"
  - "RED-control every new test before trusting it — 5/5 for hooks-notify, 2/2 for engine-parity, each breaking a different production guarantee"

requirements-completed: [FLOOR-18, FLOOR-14]

duration: 43min
completed: 2026-08-21
---

# Phase 01 Plan 13: FLOOR-18 + FLOOR-14 Summary

**Codex-on-Windows' remote-control gap is now declared in source, README and the god's roster line with a verified upstream citation instead of a bare `return false`, and a blocked non-Claude agent finally produces exactly one OS toast that focuses it on click — with macOS delivery stated as an unverifiable limitation rather than claimed.**

## Performance

- **Duration:** 43 min
- **Started:** 2026-08-21T07:35Z (B-sha `1267285`)
- **Completed:** 2026-08-21T08:10Z + issue/PR evidence
- **Tasks:** 3 of 3
- **Files modified:** 8 modified + 1 created

## Task 1 — the baselines and evidence, recorded BEFORE any edit

**B-sha:** `1267285296e4b2f10c7a6d10dd0a7fc548df224a` (working tree clean).

### The six greps, actual output

```
$ grep -n "process.platform === 'win32'" src/main/index.ts
270:  if (process.platform === 'win32') return false;
4163:  const win = process.platform === 'win32';
```

The plan predicted `:269`; five prior plans had moved it to **`:270`**. Confirmed verbatim, no
explanatory comment.

```
$ grep -rn "REMOTE\|remote" src/shared/providerAutomation.ts
206:/** Claude exposes remote control as a slash command; Codex uses its daemon and
208:export function remoteControlCommandForProvider(
214:  return name ? `/remote-control ${name}` : '/remote-control';
```

No remote **capability** today — only the Claude slash-command helper.

```
$ grep -n "notify(" src/main/hooks.ts
673:        this.notify(agentId, this.agentName(agentId), `finished after ${…} min`);
755:      this.notify(agentId, this.agentName(agentId), p.message ?? 'needs your attention');
769:  private notify(agentId: string | undefined, title: string, body: string): void {
```

```
$ grep -rn "'blocked'" src/renderer/src/hooks/usePtyParser.ts src/renderer/src/hooks/useHive.ts
usePtyParser.ts:171:      if (self?.status === 'blocked') return;      ← the de-dupe
usePtyParser.ts:175:          status: 'blocked',                        ← god branch
usePtyParser.ts:190:          status: 'blocked',                        ← worker branch
useHive.ts:539:          updateAgent(e.agentId, { status: 'blocked', waitingOnGod: !self.isGod });
useHive.ts:706 / :734  (reads, not writes)
```

```
$ grep -rn "notify\|Notification" src/renderer/src/hooks/usePtyParser.ts
$
```

**Empty. That is the whole FLOOR-14 residual** — the renderer decides an agent is blocked and main
never hears about it.

```
$ grep -rn "capabilityLine" src/ test/
src/shared/providerAutomation.ts:281        (definition — NO production caller)
test/engine-parity.test.cjs:33,522,529,537,541
```

Every lockstep site: **three `assert.equal` exact-string assertions** (`claude` `:522`, `kimi`
`:529`, `crush` `:537`), one `assert.match` (`copilot` `:541`), and the total-coverage loop at
`:544-552`. `test/provider-config.test.cjs` exists but does **not** assert on this surface — checked,
nothing to update there.

### The three ALREADY-SATISFIED FLOOR-14 clauses

| Clause | Line | Status |
|---|---|---|
| long task finished → toast | `hooks.ts:673` | already shipped — do not rebuild |
| blocked **Claude** agent → toast | `hooks.ts:755` (rationale `:746-753`) | already shipped |
| clicking the toast focuses the agent | `hooks.ts:774`, inside `notify()` at `:769` | already shipped |
| blocked **non-Claude** agent → toast | — | **OPEN** |

FLOOR-18: **OPEN** (bare return, no comment, no capability clause, nothing in README).

### Upstream reference — VERIFIED, not assumed

RESEARCH carried this as unchecked assumption A6. Command and actual output:

```
$ gh issue view 30372 --repo openai/codex --json number,title,state,labels
{"number":30372,"state":"OPEN",
 "title":"Codex remote control cannot start on Windows, CLI reports daemon lifecycle is Unix-only",
 "labels":[bug, windows-os, CLI, app, app-server, remote]}
```

The number is correct, the issue is open, and its title states the Unix-only daemon lifecycle
directly. A6 is now **verified**.

### The seven labelled baselines

| Label | Command | Measured | Plan expected |
|---|---|---|---|
| **B-remote** | `grep -c "remote" src/shared/providerAutomation.ts` | `3` | 3 ✓ |
| **B-preload** | `grep -c "notify\|Notification" src/preload/index.ts` | `4` | 4 ✓ |
| **B-readme-win** | `grep -c "unavailable on Windows" README.md` | `0` | 0 ✓ |
| **B-readme-mac** | `grep -c "unsigned macOS build" README.md` | `0` | 0 ✓ |
| **B-ipcmain** | `grep -c "ipcMain.handle\|ipcMain.on" src/main/index.ts` | **`156`** | 156 ✓ → target `157` |
| **B-blockguard** | `grep -c "status === 'blocked') return" usePtyParser.ts` | `1` | 1 ✓ |
| **B-parity** | `# pass` on `test/engine-parity.test.cjs` | **`26`** | ≥25 ✓ → target ≥28 |

`grep -c "hive:memoryWakeUp\|memory:reflectNow" src/main/index.ts` returned **`0`** — plan 10's two
deletions landed, which is what makes B-ipcmain `156` rather than `158`. No discrepancy to report.

```
$ TAP=$(mktemp); node --test --test-reporter=tap test/engine-parity.test.cjs > "$TAP"; echo "EXIT=$?"
EXIT=0
# tests 26   # pass 26   # fail 0   # skipped 0   # todo 0
$ grep -c "'constrained'" test/engine-parity.test.cjs
3
```

Plan 09's breaker tests are present by content (`3` ≥ `2`), so nothing upstream was lost.

**No commit for task 1** — its `<files>` block is `(none — evidence only)`.

## Task 2 — the limitation, declared in three places · commit `433a33d`

`src/shared/providerAutomation.ts`:

- `ProviderCapabilities` gains `remote: boolean`.
- New `remoteControlAvailability(provider, platform = process.platform)` returning
  `'ok' | 'windows' | 'none'`. Claude → `'ok'` (a typed slash command works anywhere); Codex →
  `'windows'` on win32 else `'ok'`; everything else → `'none'`.
- `capabilityLine` gains a fourth clause following the shout-for-gaps convention:
  `remote control ok` / `REMOTE CONTROL unavailable on Windows` / `NO REMOTE CONTROL`.

Live on this Windows host:

```
claude:  mail ok, spend tracked (otel), compacts /compact, remote control ok
codex:   mail ok, spend tracked (transcript), compacts /compact, REMOTE CONTROL unavailable on Windows
kimi:    NO MAIL (bounces to you), spend UNTRACKED (…), compacts /compact, NO REMOTE CONTROL
```

### How the `remote` bit stays inside ADR-0002's rules

ADR-0002's invariant is *"interpolate only values stable for an agent's whole lifetime"* — it is not
*"never vary by machine"*. The ADR in fact **requires** per-OS text (*"every path and command is
written the way the agent will actually type it on the platform it is running on"*), and a prompt
cache is per-account-per-machine anyway. What breaks it is a value that can change **between turns**.
`process.platform` is a constant for the life of the process, read once through
`remoteControlAvailability`'s defaulted argument, so the capability line is byte-identical on every
turn of every agent on a given host — zero extra cache re-primes.

That is also exactly why the **bit** was taken and not a platform parameter on `capabilityLine`
(D-40 left the shape to the planner/executor): a caller free to pass a *varying* platform is how a
stable prefix turns volatile. `capabilityLine(provider)`'s signature is unchanged, so nothing
rippled into `test/provider-config.test.cjs` or any caller. The reasoning lives in the
`capabilityLine` JSDoc, in the file the next person will already be editing.

`src/main/index.ts`: the early return survives **verbatim** (D-41) and is now wrapped by a comment
naming what specifically is Unix-only (pidfile + Unix process/file-locking primitives), the verified
issue, and why deleting the return would be worse. The JSDoc says the Windows case is a declared
limitation. `grep -c "process.platform === 'win32') return false"` → **`1`**.

### The three lockstep assertions, updated

| Test | Before | After |
|---|---|---|
| `capabilityLine('claude')` `:522` | `…compacts /compact` | `…compacts /compact, remote control ok` |
| `capabilityLine('kimi')` `:529` | `…compacts /compact` | `…compacts /compact, NO REMOTE CONTROL` |
| `capabilityLine('crush')` `:537` | `…NO COMPACT (…)` | `…NO COMPACT (…), NO REMOTE CONTROL` |

Plus: the coverage loop gained `assert.equal(typeof c.remote, 'boolean', p)` (a missing field reads
`undefined`, which is falsy, which would silently shout the Windows gap at every engine), and two new
tests — one asserting both Codex branches with an explicit platform argument **so an ubuntu runner
still proves the Windows string**, one asserting the uppercase/lowercase copy contract.

```
$ TAP=$(mktemp); node --test --test-reporter=tap test/engine-parity.test.cjs > "$TAP"; echo "EXIT=$?"
EXIT=0
# tests 28   # pass 28   # fail 0   # skipped 0   # todo 0      B-parity 26 → 28  (+2, ≥27 absolute)
```

**RED controls (2/2)** — the tests are not vacuous:

| Break | Result |
|---|---|
| clause text swapped to `NO REMOTE CONTROL` | EXIT=1, **1 fail** |
| `remote` hardcoded `true` | EXIT=1, **4 fail** |

`README.md` gained an engine-limitations table using the capability line's exact wording, so source,
prompt and docs cannot drift. Every row was derived by running `capabilityLine` over all eleven
engines, not written from memory — and a draft sentence claiming *"four bridges are marked
live-unverified"* was **corrected before commit** because `grep -rn "live-unverified" src/` returned
`0` (the real marker is uppercase `LIVE-UNVERIFIED`, 8 occurrences in `hive.ts`). Adding an
unverified claim inside the phase that removes unverified claims would have been the defect.

### Task 2 criteria

| Criterion | Result |
|---|---|
| `grep -c "remote" providerAutomation.ts` > B-remote | `3` → **`20`** ✓ |
| `grep -c "REMOTE CONTROL" providerAutomation.ts` ≥ 1 | `2` ✓ |
| `win32` return preceded by a comment naming the upstream ref | pasted above ✓ |
| `grep -c "process.platform === 'win32') return false"` = 1 | `1` ✓ |
| `grep -c "unavailable on Windows" README.md` ≥ 1 | `0` → `1` ✓ |
| TAP: EXIT=0, pass ≥ B-parity+2 and ≥27, fail 0, skipped 0 | 0 / 28 / 0 / 0 ✓ |
| `grep -c "'constrained'" engine-parity` ≥ 2 | `3` ✓ |
| Containment (per-commit, range-bound) | ✓ — see below |
| `npm run typecheck` = 0, `npm test` = 0 | ✓ (509/505/0/4 at this point) |

## Task 3 — the blocked non-Claude toast · commit `f1d477f`

One edge, no new machinery:

- **`src/main/hooks.ts`** gains exactly one public method, `notifyBlocked(agentId)`. `notify()` stays
  `private`; its `getConfig().notifications` gate and its click-to-focus are reused unchanged — **no
  new setting, no new click handler**. Every abusable decision is made in main off the **live
  registry**: an id naming nobody is dropped (T-P13-06), a Claude provider is dropped (T-P13-03,
  and `provider` unset means Claude on legacy records, so the default is the SKIP side), and
  god-vs-worker comes from the registry, which picks the UI-SPEC-locked body.
- **`src/main/index.ts`**: one `ipcMain.handle('hive:notifyBlocked', …)`. `handle` rather than `on`
  because every renderer→main call in this file is `invoke`/`handle` and the preload surface is
  uniformly promise-shaped; a lone `send` channel would need its own preload idiom to buy nothing.
- **`src/preload/index.ts`**: one line, `hiveNotifyBlocked`.
- **`src/renderer/src/hooks/usePtyParser.ts`**: one call, placed **below** `:171`'s early return,
  which *is* the de-dupe. No second guard added.
- **`src/renderer/src/hooks/useHive.ts`**: a comment at the `Notification` branch recording why
  there is deliberately **no** call there — main already toasted that exact event, so adding one
  would be the two-toasts bug one line over.

Copy is exactly UI-SPEC's: title `{name}`, body `is waiting on you` (god) / `is waiting on Michael`
(worker). No exclamation mark, no emoji.

### The test — real server, real socket, RED-controlled

`test/hooks-notify.test.cjs` stands up a **real** `HookServer` over a real socket following
`net-binding.test.cjs`'s `hookFloor` shape, but passes `{ notifications: true }` (the sibling
harness passes `false`, which is the first thing `notify()` returns on — a copy-paste would have made
every assertion vacuous). A recording `Notification` with `isSupported() → true` is injected through
`require.cache['electron']`, which makes title, body, `show()` and the click handler all observable
without touching `notify()`'s `private` modifier.

The two-toasts test is the strongest one: it sends a **real authenticated hook payload** over the
socket for a Claude agent (asserting the shipped path fires exactly 1), then calls `notifyBlocked`
for the same agent and asserts the count is **still** 1.

```
$ TAP=$(mktemp); node --test --test-reporter=tap test/hooks-notify.test.cjs > "$TAP"; echo "EXIT=$?"
EXIT=0
# tests 6   # pass 6   # fail 0   # skipped 0   # todo 0
```

**RED controls (5/5)** — every test fails when its own guarantee is removed, so none is decorative:

| Break | EXIT | fail | which |
|---|---|---|---|
| `notifyBlocked` made a no-op (**the pre-fix world**) | 1 | 3 | worker toast, god toast, click-to-focus |
| Claude provider gate removed | 1 | 1 | the two-toasts test |
| live-roster resolution removed | 1 | 1 | the phantom-id test |
| god/worker copy swapped | 1 | 2 | worker toast, god toast |
| `notifications` gate removed from `notify()` | 1 | 1 | the notifications-off test |

### Task 3 criteria

| Criterion | Result |
|---|---|
| `grep -c "notify" usePtyParser.ts` ≥ 1 | `0` → **`1`** ✓ |
| `grep -c "ipcMain.handle\|ipcMain.on" index.ts` = **B-ipcmain + 1** | `156` → **`157`** ✓ (exactly +1) |
| `grep -c "notify\|Notification" preload/index.ts` = **B-preload + 1** | `4` → **`5`** ✓ (exactly +1) |
| hooks-notify TAP: EXIT 0, pass ≥4, fail 0, skipped 0 | 0 / **6** / 0 / 0 ✓ |
| `grep -c "notifications: true" hooks-notify` ≥ 1 | `2` ✓ |
| `grep -c "isSupported" hooks-notify` ≥ 1 | `1` ✓ |
| `grep -c "unsigned macOS build" README.md` ≥ 1 | `0` → `1` ✓ |
| `grep -c "status === 'blocked') return"` = **B-blockguard** | `1` → **`1`** ✓ (no second guard) |
| Containment (per-commit, range-bound) | ✓ with a caveat — see below |
| `npm run typecheck` = 0, `npm test` = 0 | ✓ |

The added preload line, for the record:

```ts
hiveNotifyBlocked: (agentId: string): Promise<void> => ipcRenderer.invoke('hive:notifyBlocked', agentId),
```

The README macOS sentence, for the record (`README.md:139-147`):

> …**This one is platform-dependent, and the limitation is on macOS.** Electron 42 moved macOS
> toasts from `NSUserNotification` to `UNNotification`, which the system will only display for a
> **code-signed** app — and as the downloads section says, paid signing is out of scope here, so an
> **unsigned macOS build** may show no toasts at all. The app still fires them; macOS decides
> whether to draw them. The code-signing requirement is Apple's and applies to macOS only.

## Containment

Both task commits are **individually** clean against their own declared sets:

```
$ git show --name-only --format= 433a33d | grep -vE "^(providerAutomation|index.ts|engine-parity|README)$"   → nothing
$ git show --name-only --format= f1d477f | grep -vE "^(index|hooks|preload|usePtyParser|useHive|hooks-notify|README)$"  → nothing
```

Plan-wide, range-bound, per-commit — **PASSES, prints nothing**:

```
BASE=1267285…; SHAS=$(git log --format=%H "$BASE"..HEAD -- <all 9 plan paths>)
SHAS = f1d477f 433a33d
for sha in $SHAS; do git show --name-only --format= "$sha"; done | sort -u \
  | grep -vE "^(<the 9 plan paths>)$"        → nothing
```

**Honest caveat on the criteria as literally written.** Task 3's containment command walks
`BASE..HEAD` for commits touching *task 3's* paths and then lists **every** file in those commits.
`src/main/index.ts` and `README.md` are declared by **both** task 2 and task 3 (the plan mandates
that), so the walk also pulls in task 2's commit `433a33d`, and that commit's other two files —
`src/shared/providerAutomation.ts` and `test/engine-parity.test.cjs` — print. Both are this plan's
own files. The criterion is unsatisfiable as literally written for any two tasks that share a file
unless both land in one commit, which would break the one-commit-per-task rule. Reported here rather
than worked around by squashing; the per-commit and plan-wide forms above are both clean, which is
the check's actual intent (same resolution 01-12 recorded).

## Verification

### Local, Node 22.23.2 (the exact CI pairing)

| Gate | Result |
|---|---|
| `npm run typecheck` | **0** |
| `npm test` | **0** — 515 tests / 511 pass / **0 fail** / 4 skipped |
| `npm run build` | **0** |
| `npm run e2e` | **2 passed** against real Electron 43 |

515 = 507 baseline **+8** exactly: 2 engine-parity + 6 hooks-notify. The 4 skips are the
phase's pre-existing Windows-only skips, unchanged.

### CI, read off draft PR #77 (base `main`) at `f1d477f` — `gh pr checks 77`

| Check | Result | tests / pass / fail / skipped |
|---|---|---|
| `Typecheck` | **pass** | — |
| `Test (ubuntu-latest)` | **pass** | 515 / 515 / **0** / 0 |
| `Test (windows-latest)` | **pass** | 515 / 511 / **0** / 4 |
| `Test (macos-latest)` | **pass** | 515 / 515 / **0** / 0 |
| `Build` | **pass** | — |
| `Electron smoke (ubuntu-latest)` | **pass** | — |

ubuntu and macOS going green is itself the proof that the platform-parameterised Codex assertions
cover **both** branches on a runner that is not Windows.

### Live measurement on the Windows host (this machine IS the FLOOR-18 box)

`capabilityLine('codex')` on win32 returns the clause — pasted above. And rather than reasoning about
whether Electron can toast here, it was measured with a real Electron 43 main process:

```
$ electron ./probe.js
PROBE {"platform":"win32","electron":"43.4.1","isSupported":true,
       "constructed":true,"shown":true,"clickHandlerRegistered":true}
```

`Notification.isSupported()` is **true** on this host, a toast carrying the locked copy constructs
and shows without throwing, and the click handler registers. (Note for the next person:
`ELECTRON_RUN_AS_NODE=1` is set in this environment — `npx electron script.js` silently runs under
plain Node and `require('electron')` yields a path string. Use `env -u ELECTRON_RUN_AS_NODE`.)

D-41's "no subprocess timeout noise on a Windows Codex spawn" is proven **structurally**: the win32
early return is the **first statement** of `enableCodexRemoteForSpawn` (`:292`), ahead of both
awaited `codex` subprocesses.

## MEASUREMENT UNAVAILABLE

Recorded as gaps, not converted into passed checks.

1. **MEASUREMENT UNAVAILABLE — an operator must block a real non-Claude agent on an approval prompt,
   confirm exactly one Windows toast appears on screen, and click it to confirm the agent is
   focused.** Automated as far as automation reaches: the main-side path is proven by
   `test/hooks-notify.test.cjs` (6 pass, RED-controlled 5/5) and the OS layer is proven live above.
   What no test can reach is that Windows actually **drew** it (Focus Assist and per-app
   notification settings can suppress it) and that the click focused the agent in the running app.
2. **MEASUREMENT UNAVAILABLE — a live Codex spawn on Windows.** There is no Codex subscription on
   this machine. The capability-clause half is measured live; the no-timeout-noise half is proven
   structurally.
3. **macOS notification delivery is unverifiable on this project — stated, not tested.** Electron
   42+ routes macOS toasts through `UNNotification`, which only displays for a code-signed app;
   `build/notarize.cjs` no-ops without `APPLE_*` and paid signing is out of scope. An unsigned local
   macOS build may show **no toasts at all**. The `Test (macos-latest)` green above proves the toast
   is *constructed with the right contents* on macOS — it does **not** prove macOS renders it, and
   the test file's header says so in the file.

Both operator gates are filed as STATE blockers (`grep` confirmed they landed, not just that the
command exited 0).

## must_haves — every truth, adjudicated

| # | Truth | Verdict |
|---|---|---|
| 1 | Codex-on-Windows' limitation is stated in source, docs and UI — never a bare unexplained `return false` | **SATISFIED** — `index.ts` comment + verified citation, README engine table, capability line clause |
| 2 | `capabilityLine` keeps its signature and its ADR-0002 cache-safe position; the platform decision is made in main | **SATISFIED, with a stated nuance.** Signature unchanged; ADR-0002 respected and the reasoning is in the JSDoc. The nuance: `capabilityLine` has **no production caller** today (`grep -rn` finds only the definition and the tests), so there is no "call site in main" to place the decision at. It is read once behind a defaulted parameter instead, which gives the same guarantee the plan's phrasing was protecting — a value that cannot vary between turns. Whoever wires the roster injection can pass an explicit platform without any signature change |
| 3 | A blocked non-Claude agent produces an OS notification, and clicking it focuses that agent | **SATISFIED in code and unit-proven**; the on-screen half is item 1 under MEASUREMENT UNAVAILABLE |
| 4 | A blocked Claude agent does not produce two toasts for one event | **SATISFIED** — asserted by a named test that sends a real hook payload first, RED-controlled |
| 5 | Every FLOOR-14 sentence in docs or UI carries a platform qualifier | **PARTIAL — NOT fully satisfied.** README: done. **UI: not done.** `SettingsModal.tsx:1008` still reads *"Native toasts when an agent finishes or needs your input."* with no qualifier. That file is **outside this plan's declared set** and both containment criteria fail on any file outside it; its owners are 01-10 (landed) and 01-15 (wave 7, a `fontSize`/a11y sweep whose own truth forbids changing copy), so nobody currently picks it up. Blocker filed, deferred item written with the exact one-sentence fix and a named owner. Flagged loudly rather than quietly skipped |

## Artifacts and key_links

| Declared | Verdict |
|---|---|
| `providerAutomation.ts` provides a `remote` bit + a REMOTE CONTROL clause, contains `remote` | ✓ (`remote` × 20, `REMOTE CONTROL` × 2) |
| `index.ts`: the bare return replaced by a comment naming the upstream issue, contains `win32` | ✓ |
| `test/hooks-notify.test.cjs`: a DI notify fake proving the blocked transition reaches main | ✓ — 6 pass, real `HookServer`, recording `Notification` |
| renderer block transition → `hooks.ts` `notify()` via one IPC reusing its config gate and click-to-focus, pattern `notify` | ✓ |
| `providerCapabilities` remote bit → `capabilityLine` via a new clause in the existing bits array, pattern `REMOTE CONTROL` | ✓ |

## Threat model

| ID | Disposition | Evidence |
|---|---|---|
| T-P13-01 repudiation — an arbitrary-looking `return false` | mitigated | early return kept + comment + verified citation; declared in README and the capability line (D-40's three places) |
| T-P13-02 DoS — notification spam from a repaint loop | mitigated | fires below `usePtyParser:171`'s existing early return; `B-blockguard` still `1`; main validates the id against the live roster |
| T-P13-03 DoS — two toasts for one blocked Claude agent | mitigated | provider gate in main; named test, RED-controlled |
| T-P13-04 tampering — prompt-cache invalidation differing per OS | mitigated | the bit, not a platform argument; process-lifetime constant; reasoning in the JSDoc |
| T-P13-05 repudiation — claiming notifications work on macOS | mitigated | README qualifier + the test file's header. **Residual: the Settings UI sentence** (truth #5, PARTIAL) |
| T-P13-06 spoofing — a renderer-supplied id toasting as another agent | mitigated | main re-resolves against the live registry, drops unknown ids, and focuses the **resolved** id; named test, RED-controlled |

## Issues

Per **D-43**, full evidence comments posted with the acceptance text quoted verbatim, one command
per clause with actual output (including the empty `usePtyParser` grep), the named tests, and the
`npm test` exit lines on all three platforms:

- **#61** — https://github.com/MARKXAILABS/hello-markx/issues/61#issuecomment-5367152656
- **#42** — https://github.com/MARKXAILABS/hello-markx/issues/42#issuecomment-5367160304

**Neither issue was closed.** Per D-44 they close *in the PR that fixes them* — so `Closes #42` and
`Closes #61` were added to PR #77's body, which closes them on merge and not a moment earlier. The
fix is on a draft branch, not on `main`; closing now would be the exact over-claim this phase exists
to remove.

**#61 carries an explicit reviewer warning in the PR body:** its own wording asks for *"a visible
badge or warning on the agent card"*. That badge was **not** built — D-40 deliberately substituted
the existing per-engine capability channel. Per D-42 the bar is per-acceptance-clause, so the
substitution is surfaced at the merge point rather than buried in a summary.

## Deviations from Plan

### 1. [Rule 1 — Bug] A draft README sentence made an unverified claim

- **Found during:** Task 2, writing the engine table.
- **Issue:** The draft carried *"Four of the bridges are marked `live-unverified` in source"*, lifted
  from PROJECT.md. `grep -rn "live-unverified" src/` returns **`0`** — the marker is uppercase
  `LIVE-UNVERIFIED`, with 8 occurrences in `src/main/hive.ts`, and "four bridges" is not derivable
  from that grep.
- **Fix:** Rewritten to a claim that is checkable: the marker is named in its real spelling, the file
  is named, and the count is not asserted. Caught **before** commit.
- **Files:** `README.md` · **Commit:** `433a33d`

### 2. [Rule 2 — Missing critical functionality] The test's config gate was shorthanded

- **Found during:** Task 3 criteria check — `grep -c "notifications: true"` returned `0` because the
  harness used object shorthand.
- **Fix:** The config object is now spelled out literally. This is not cosmetic: `{ notifications: true }`
  is the exact shape `notify()` reads and the exact thing the sibling harness gets wrong for this
  file's purposes, so it must be greppable. Amended into `f1d477f` (unpushed at the time).

### 3. [Rule 3 — Blocking] `ELECTRON_RUN_AS_NODE=1` in the environment

- **Found during:** the live Electron notification probe. `npx electron probe.js` ran under plain
  Node, so `require('electron')` returned a path string and `app` was `undefined`.
- **Fix:** invoked `node_modules/electron/dist/electron.exe` under `env -u ELECTRON_RUN_AS_NODE`.
  Recorded here because it will bite the next person who tries to measure anything in real Electron
  from an agent session.

### 4. [Reported, NOT fixed] The Settings UI notification sentence

Covered under truth #5 above. Blocker filed, deferred item written. **Not** fixed, because fixing it
means editing a file outside this plan's declared set, which both containment criteria forbid — and
silently breaking a mechanical acceptance criterion to satisfy a prose truth is the wrong trade.

### 5. Line numbers had moved

`index.ts:269` → `:270`; `hooks.ts:420-431` → `:769-780`; `hooks.ts:343`/`:405-406` → `:673`/`:755`;
`useHive.ts:575` → `:539`. All re-derived from live source per the handoff instruction; no planning
excerpt was trusted.

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired component was introduced.

## Threat Flags

None. No new network endpoint, auth path or schema change. The one new IPC channel is inside the
plan's declared threat model (T-P13-02 / T-P13-06) and is mitigated there.

## Requirement checkboxes

`.planning/REQUIREMENTS.md` rows for **FLOOR-18** and **FLOOR-14** are deliberately left `Pending` —
plan 23 owns the checkboxes, following the precedent set by plans 01-02 through 01-12.
`requirements.mark-complete` was **not** run. FLOOR-14 additionally should not be checked until
truth #5's UI half has an owner.

## Handoff

1. **`SettingsModal.tsx:1008` needs one sentence** and nobody currently owns it. Exact wording and
   the "do not add a `fontSize` while you are in there" warning (01-15 pins a measured count) are in
   `deferred-items.md`. Until then ROADMAP criterion 4's FLOOR-14 clause is **not** fully true.
2. **`capabilityLine` has no production caller.** FLOOR-09/#44's roster injection is what makes the
   declaration reach the god at runtime; today it reaches only the tests, the README and the source.
   Anyone wiring it should read the ADR-0002 note in the JSDoc first.
3. **`test/engine-parity.test.cjs` is now 28 tests.** Plan 09's `'constrained'` breaker tests are
   intact (3 occurrences). Append; do not restructure.
4. **`test/hooks-notify.test.cjs` is new** and injects a recording `Notification` through
   `require.cache['electron']` at module scope. Anything added to it must keep that seed above the
   `loadTs('src/main/hooks.ts')` line.
5. **`B-ipcmain` is now 157** for whoever measures next.
6. `src/main/config.ts:277`'s JSDoc for the `notifications` flag now under-describes its reach —
   logged in `deferred-items.md`.

## Self-Check: PASSED

Files verified present, commits verified in `git log` — output pasted in the plan run above.
