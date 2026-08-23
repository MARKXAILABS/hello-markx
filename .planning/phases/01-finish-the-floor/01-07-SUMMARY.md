---
phase: 01-finish-the-floor
plan: 07
subsystem: main-process-autonomy
tags: [electron-main, delivery, quiesce, node-test, fake-clock, repo-facts, docs]

requires:
  - phase: 01-01
    provides: Electron 43.4.1 + the green three-platform CI (PR #77) this plan's evidence resolves against
  - phase: 01-02
    provides: HIVE.md §5's hook-socket paragraph (per-spawn HIVE_SOCK_TOKEN) — shared file, preserved
  - phase: 01-05
    provides: test/repo-claims.test.cjs, the repo-fact accumulator this plan appends two clauses to
provides:
  - The idle-quiesce backstop running in MAIN's delivery tick, so it survives a closed window
  - DeliveryDeps.breakerLevel + DeliveryDeps.setStatus, and LiveAgentPty.lastOutputAt
  - HIVE.md with all twelve stale Stop-drain denials deleted — §2 decision 5 un-struck and rewritten
  - Two repo-fact clauses pinning both directions (the docs stay corrected; the feature stays live)
affects: [01-08, 01-23, FLOOR-02, D-38]

tech-stack:
  added: []
  patterns:
    - "A renderer effect moved into main as a BRANCH of an existing tick, never a second timer"
    - "Edge-triggered announcement: a Set of already-announced ids, cleared when the signal reverses"
    - "Durable half / live half split — setStatus writes the hive log, emit is a documented no-op with no window"
    - "A synthesized Stop-shaped hive:hookEvent instead of a new IPC channel, matching hive.ts's agent_end→Stop bridges"
    - "Every new guard driven RED individually before being committed green"

key-files:
  created: []
  modified:
    - src/main/delivery.ts
    - src/main/index.ts
    - src/renderer/src/hooks/useHive.ts
    - test/delivery-main.test.cjs
    - test/repo-claims.test.cjs
    - HIVE.md

decisions:
  - "The backstop rides the EXISTING tick (Math.min(TICK_MS, QUIESCE_POLL_MS)); index.ts gains no timer — B-setinterval stayed 20"
  - "Main has NO live working/idle store (registry.status is write-once 'idle', index.ts:1210 says so), so `setStatus` writes the hive log — the durable sink T-P07-05 already names — rather than a field nothing advances"
  - "The live announcement reuses hive:hookEvent {event:'Stop'}, which useHive effect 2 already maps to idle: no new IPC channel, no preload change, identical UI behaviour"
  - "Boot grace is the bootGraceUntil map DeliveryService ALREADY owns (fed by noteSpawn at index.ts:3341), not a fourth injected dep — one concept, one owner"
  - "The renderer's `lastOutputAt > 0` never meant 'never painted' (pty.ts:752 seeds it at spawn). Replaced with hasOutput; porting it verbatim would have shipped the hole into main"
  - "Requirement checkboxes left Pending in REQUIREMENTS.md — plan 23 owns them, matching 01-02/01-04/01-05/01-06"

metrics:
  duration: "~2h05m"
  completed: 2026-08-21

requirements-completed: []
requirements-worked: [FLOOR-02]
---

# Phase 01 Plan 07: FLOOR-02 — the idle-quiesce backstop moves to main, and HIVE.md stops denying the Stop-drain Summary

**The provider-agnostic PTY-quiescence backstop is now a branch of `DeliveryService`'s existing tick instead of a React effect that died with the window, and all twelve of `HIVE.md`'s claims that the Stop-drain does not run are deleted and pinned by a repo-fact test that fails in both directions.**

## Performance

- **Duration:** ~2h05m
- **Tasks:** 3 of 3 (plus one Rule-1 fix commit)
- **Files modified:** 6 · **Files created:** 0
- **Commits:** `834a86c`, `80e1f69`, `152d008`, `c291e76`

## Which FLOOR-02 clauses this plan closes — and which it does NOT

| Clause | Owner | State |
|---|---|---|
| The Stop-drain is live under a guard | **already satisfied before this plan** | Verified with pasted greps, task 1. **Not restored, not deleted.** |
| The idle-quiesce backstop runs in main | **this plan** | CLOSED — `delivery.ts` `quiesce()`, 4 fake-clock tests, 6 RED controls |
| `grep` finds no doc promising a code path that does not run | **this plan** | CLOSED for the Stop-drain — twelve denials deleted, pinned in `test/repo-claims.test.cjs` |
| The **queue-drain** half (`useHive.ts` effect #4, `:819-968`) | **plan 08, wave 4** | OPEN. Untouched here, as instructed. |

**FLOOR-02 is NOT complete.** A checker reading a partial requirement must not read this as a partial fix: two of three clauses close here, the queue-drain is plan 08's.

## Task 1 — evidence (no files changed, nothing to commit)

### The Stop-drain is LIVE — criterion 1's first branch is ALREADY SATISFIED

```
$ grep -n "drainAtStop\|drainForStop" src/main/*.ts
src/main/delivery.ts:216:  drainAtStop(agentId: string): { block: boolean; reason?: string } {
src/main/hive.ts:1328:  drainForStop(agentId: string): { block: boolean; reason?: string } {
src/main/hooks.ts:211:    private drainAtStop?: (agentId: string) => { block: boolean; reason?: string },
src/main/hooks.ts:662:      const drain = this.drainAtStop?.(agentId);
src/main/index.ts:455:    const res = hive.drainForStop(agentId);
src/main/index.ts:467:  (agentId) => delivery.drainAtStop(agentId),
```

The roadmap's premise for FLOOR-02 — that the Stop-drain is dead — is **factually wrong**, and the plan was right to forbid acting on it. Not restored, not deleted.

**Anchor drift from the plan's table, recorded rather than acted on blind:** the plan cites `hooks.ts:332` for the drain call; it is at **`:662`**. It cites `hive.ts:1253` for the cursor advance; it is at **`:1338`**. It cites `delivery.ts:216`, which was correct pre-edit and is **`:262`** after task 2. `index.ts:467` is **`:480`** after task 2. HIVE.md's rewritten prose cites the post-edit numbers.

### The cursor advances

```
$ grep -n "cursor.json\|lastProcessed" src/main/hive.ts
856:    const cursor = join(dir, 'cursor.json');
857:    if (!existsSync(cursor)) this.writeJson(cursor, { lastProcessed: null });
1331:    const cursorPath = join(dir, 'cursor.json');
1332:    const cursor = this.readJson<{ lastProcessed: string | null }>(cursorPath, { lastProcessed: null });
1334:      .filter((m) => !cursor.lastProcessed || m.id > cursor.lastProcessed)
1338:    cursor.lastProcessed = fresh[fresh.length - 1].id;
```

### The open clause — the backstop was still in the renderer

```
$ grep -n "QUIESCE" src/renderer/src/hooks/useHive.ts
44:// PreToolUse/Stop refreshes status on the next event. Checked on QUIESCE_POLL_MS.
45:const QUIESCE_IDLE_MS = 12000;
46:const QUIESCE_POLL_MS = 4000;
692:  // 2e) PROVIDER-AGNOSTIC PTY-QUIESCENCE IDLE FALLBACK (the linchpin that makes
701:  //     flips any 'working' agent quiet for QUIESCE_IDLE_MS to idle so the nudge can
721:        if (typeof last === 'number' && last > 0 && now - last > QUIESCE_IDLE_MS) {
725:    }, QUIESCE_POLL_MS);
```

### Sections, measured

```
$ grep -n "^## " HIVE.md
16:  ## 1. What we're building (and what it's called)
36:  ## 2. Locked design decisions
107: ## 3. On-disk layout — the "hive"
140: ## 4. Message schema (FIPA-lite)
169: ## 5. Control flow
202: ## 6. The god agent (orchestrator)
221: ## 7. Phased plan
268: ## 8. Key risks & mitigations
281: ## 9. References
```

**Drift from the plan's recorded section table: §6/§7/§8/§9 are each +4** (plan recorded `:198`/`:217`/`:264`/`:277`). §1-§5 are unchanged. The cause is plan 02's wave-2 edit, which added four lines to §5 — expected, not drift to be reverted.

### The twelve denials, pre-edit — every one measured `1`

```
$ for s in ...; do printf '%-48s %s\n' "$s" "$(grep -cF -- "$s" HIVE.md)"; grep -nF -- "$s" HIVE.md; done
nothing calls that                               1   :125
shipped, but not as planned                      1   :227
Moot today                                       1   :273
never advanced                                   1   :275
**Reversed                                       1   :88
answers **every**                                1   :90
never forces a continuation                      1   :91
nothing in the app calls it                      1   :94
per-renderer-session                             1   :101
`Stop` returns `{}`                              1   :232
always answers `{}`                              1   :273
main answers {} — never a forced continue        1   :184
```

| # | Literal | Line (measured) | Plan said | Section (derived from the `^## ` output above) |
|---|---|---|---|---|
| 5 | `**Reversed` | `:88` | `:88` | **§2** decision 5 (`:36`-`:106`) |
| 6 | `answers **every**` | `:90` | `:90` | **§2** |
| 7 | `never forces a continuation` | `:91` | `:91` | **§2** |
| 8 | `nothing in the app calls it` | `:94` | `:94` | **§2** |
| 9 | `per-renderer-session` | `:101` | `:101` | **§2** |
| 1 | `nothing calls that` | `:125` | `:125` | **§3** on-disk layout (`:107`-`:139`) |
| 12 | `main answers {} — never a forced continue` | `:184` | `:184` | **§5** diagram (fence `:171`-`:189`) |
| 2 | `shipped, but not as planned` | `:227` | `:223` (+4) | **§7** phased plan (`:221`-`:267`) |
| 10 | `` `Stop` returns `{}` `` | `:232` | `:228` (+4) | **§7** |
| 3 | `Moot today` | `:273` | `:269` (+4) | **§8** risk table (`:268`-`:280`) |
| 11 | `` always answers `{}` `` | `:273` | `:269` (+4) | **§8**, second half of the same row |
| 4 | `never advanced` | `:275` | `:271` (+4) | **§8** |

**Section tally: five §2 / one §3 / one §5 / two §7 / three §8.** Matches the plan's corrected attribution. Denials **5-9 live in `HIVE.md:85-103` (§2 decision 5)** and denial **12 at `HIVE.md:184` lives inside §5's fenced diagram**; both are in this plan's scope and both were edited.

### Plan 02's landed edit — expected, and preserved

```
$ grep -c "per-spawn" HIVE.md
1
```

Non-zero before this plan started, so plan 02's wave-2 edit had landed. Still `1` after task 3 (see below). §5's `:191-194` (now `:208-215`) hook-socket paragraph was not touched.

### Recorded count baselines (task 2's criteria are deltas against these)

| Baseline | Value |
|---|---|
| `grep -cE "setInterval" src/main/index.ts` on `main` this session | `20` |
| **B-setinterval** (measured in task 1, the number task 2 asserts against) | **`20`** — identical, so plan 02's `index.ts` edit added no timer |
| **B-delivery** (`# pass`, `test/delivery-main.test.cjs`) | **`16`** (`EXIT=0`, `# tests 16 / # pass 16 / # fail 0 / # skipped 0 / # todo 0`) |
| **B-repo-claims** (from `01-05-SUMMARY.md`) | **`3`** |
| `grep -c "recordCostSample" src/main/index.ts` | `0` — plan 08's FLOOR-09 line, NOT taken |

### The four pre-existing guard tests (plan's `:117-142`), named

1. `a veto blocks the Stop drain too — and expires so a dead renderer cannot wedge the floor` (`:112`)
2. `the Stop drain reports what moved and hands back the continuation prompt` (`:123`)
3. `an operator auto-delivery pause blocks the Stop drain` (`:137`)
4. `a veto from the renderer blocks a delivery, and clearing it lets it through` (`:100`)

All four still pass at HEAD.

## Task 2 — the backstop moves into main (`834a86c`, plus fix `c291e76`)

### The architectural finding that shaped the design

The plan says to inject "a way to write the agent's status back to `working`/`idle`". **Main has no such store.** `hive.ts:883` writes `status: 'idle'` once at spawn and nothing ever transitions it — `index.ts:1210` says so in its own comment ("*NOT `registry.status`, which is written 'idle' once at spawn and never transitions in main — reading it would see the floor quiet forever*"), there is no registry-status mutator on `HiveManager`, and `fleet.json` does not even carry the field. The live working/idle state is the renderer's zustand store, which is exactly what dies with the window.

**Decision (root-cause, not surface):** the transition is announced in two halves, mirroring the split the Stop drain already uses in this very file (`deps.drain` does the durable cursor advance; `deps.emit('hive:delivered')` is the live notification):

- **Durable half** — `deps.setStatus(agentId, 'idle')`, wired in `index.ts` to `hive.appendLog({ kind: 'agent_quiesced', … })`. `T-P07-05` in the plan's own threat register already names the hive log as the durable sink ("*the flip is still recorded in the hive log*"). Writing `registry.json` instead was rejected: it would be a no-op against a field nothing advances.
- **Live half** — `deps.emit('hive:hookEvent', { agentId, event: 'Stop', blocked: false })`. `useHive.ts` effect 2 (`:541`) already maps exactly that to `status: 'idle', action: 'idle'`, and the preload already exposes the channel. A **synthesized Stop-shaped event is the established pattern in this codebase** for keeping harness status in step (`hive.ts:3481` `agent_end→Stop`, `hive.ts:3522` `session.idle→Stop`). So the UI behaves identically with no new IPC channel, no preload change, and no renderer code.

### `DeliveryDeps` fields added

| Field | Type | Wired in `index.ts` to | Why |
|---|---|---|---|
| `breakerLevel?` | `(agentId: string) => string` | `breaker.levelFor(agentId)` | The renderer refused to flip a `constrained`/`stopped` agent (it is deliberately pinned `looping`). Optional, so a floor without a breaker reads healthy — same shape as `control`/`breaker` on `HookServer`. |
| `setStatus?` | `(agentId, status: 'idle') => void` | `hive.appendLog({ kind: 'agent_quiesced', … })` | The durable half. Optional, so the existing test harness and a hive-less run are unaffected. |

`LiveAgentPty` also gains **`lastOutputAt: number`** (raw epoch stamp), fed from `p.lastOutputAt` at `index.ts`'s `liveAgents()`. `idleMs` is kept — nothing had to move.

**Boot grace was deliberately NOT added as a dep.** `DeliveryService` already owns `bootGraceUntil` (per `ptyId`, fed by `noteSpawn` at `index.ts:3341`), which is the same concept the renderer kept in a ref. One concept, one owner.

### `src/main/delivery.ts`

- `QUIESCE_IDLE_MS = 12_000` and `QUIESCE_POLL_MS = 4_000` ported as module constants, carrying `useHive.ts:693`'s reasoning verbatim (`usePtyParser` only parses the MOUNTED terminal, so an unmounted agent's transition is otherwise never observed) plus the `#5` citation and an explicit **ADR-0001 note: the backstop writes ZERO terminal bytes**, so the wake nudge stays the single writer (`T-P07-02`).
- `QUIESCE_POLL_MS` is load-bearing, not decorative: `start()` arms `setInterval(…, Math.min(TICK_MS, QUIESCE_POLL_MS))`, so raising `TICK_MS` alone cannot silently stretch the backstop's latency.
- `private quiesce(live, now)` runs at the top of `tick()`, before the wake loop. Guards in order: breaker pin → boot grace → painted (`hasOutput && lastOutputAt > 0`) → quiet past `QUIESCE_IDLE_MS`.
- `private readonly quiesced = new Set<string>()` makes it **edge-triggered** — one announcement per quiet spell, re-armed when the PTY speaks again, and pruned against the live roster (main outlives every renderer, so an append-only set would grow for the life of the app; same reason the wake's seen-set is pruned).
- One incidental rename: the wake loop's local `live` (a Set of unread ids) became `stillUnread`, because `live` is now the roster array in the enclosing scope.

### `src/renderer/src/hooks/useHive.ts`

Effect 2e deleted entirely — the `setInterval`, the `window.cth.listPtys()` call, and both constants — replaced by a tombstone comment pointing at `delivery.ts` `quiesce()`. **The 30 s terminal reap and the five other `setInterval`s are untouched**, as is the one `hiveTasks()` inside `ensureSlackCard()` that 01-05's repo-claims allowlist pins at exactly 1 (that clause is still green). **The queue-drain effect #4 was not touched** — plan 08's, wave 4.

### The Rule-1 fix (`c291e76`) — a real defect in this plan's own new code

The guard ported from the renderer was `lastOutputAt > 0`, which the renderer used to mean "has this PTY ever emitted". **It never meant that.** `pty.ts:752` *seeds* `lastOutputAt` to the spawn instant, so a child whose TUI never paints a single byte still carries a stamp — and the moment its 35 s boot grace lapses it reads as "quiet for 35 s" and gets flipped idle, un-gating the delivery paths against a terminal that cannot receive. The renderer had the identical hole; porting it verbatim would have shipped it into main. `hasOutput` (`pty.ts:753`/`:764`) is the flag that actually answers the question and was already on `LiveAgentPty`. Fixed at source in its own atomic `fix(...)` commit, test extended, driven RED against the old guard.

### Acceptance criteria

| Criterion | Required | Measured |
|---|---|---|
| `grep -c "QUIESCE" src/renderer/src/hooks/useHive.ts` | `0` | **`0`** |
| `grep -c "QUIESCE" src/main/delivery.ts` | ≥ `2` | **`7`** |
| `grep -cE "setInterval" src/main/index.ts` | == B-setinterval (`20`) | **`20`** — task 1's number pasted alongside: `20`. Equal. |
| `test/delivery-main.test.cjs` TAP | `EXIT=0`, `# pass ≥ 19`, `# fail 0`, `# skipped 0`, `# todo 0` | **`EXIT=0`, `# tests 20 / # pass 20 / # fail 0 / # skipped 0 / # todo 0`** (B-delivery `16` + 4) |
| Four pre-existing guard tests | still passing | yes — all four named above are green |
| `npm run typecheck` | `0` | **`0`** (both projects) |
| `npm test` | `0` | **`0`** |

### The four new tests, each proven RED first

| Test | RED control | Result |
|---|---|---|
| `a silent PTY is flipped idle with NO window attached, once per quiet spell` | `quiesce()` never called | `not ok 8` |
| ″ | edge-trigger removed (announce every tick) | `not ok 8` |
| `silence that is not a finished turn does not flip: a booting TUI, and a PTY that never painted` | boot-grace guard removed from `quiesce()` | `not ok 9` |
| ″ | `hasOutput` dropped from the painted guard | `not ok 9` |
| ″ | never-painted guard removed entirely | `not ok 9` |
| `the backstop never fights the breaker pin` | breaker pin ignored | `not ok 10` |
| `the backstop is on the timer start() arms — not a method nobody schedules` | `start()`'s callback made a no-op | `not ok 11` |

The first test's `emit` is a **real no-op** (`{ emit: () => {} }` — exactly what `liveWebContents()?.send` does with no webContents), so the only thing that can carry the flip is the durable half. If it passed on `emit` alone it would not be testing the property the move exists for.

The fourth test is **not in the plan**; it was added because the other three call `svc.tick()` by hand and would all stay green if `start()` stopped scheduling the tick — at which point the backstop would not run at all, which is the entire property `T-P07-01` names. It stubs `global.setInterval`, asserts `start()` arms exactly one timer at ≤ 4 s, fires the captured callback, and asserts the flip. Zero wall-clock.

## Task 3 — twelve denials deleted, pinned both ways (`80e1f69`)

### The twelve, after

```
$ for s in ...; do printf '%-48s %s\n' "$s" "$(grep -cF -- "$s" HIVE.md)"; done
nothing calls that                               0
shipped, but not as planned                      0
Moot today                                       0
never advanced                                   0
**Reversed                                       0
answers **every**                                0
never forces a continuation                      0
nothing in the app calls it                      0
per-renderer-session                             0
`Stop` returns `{}`                              0
always answers `{}`                              0
main answers {} — never a forced continue        0
```

### §2 decision 5 — before and after

**Before** (`:85-103`) — struck through and closed with `**Reversed — see below.**`, then a block-quote asserting that `hooks.ts` *"now answers **every** `Stop`/`SubagentStop` with `{}`"*, *"never forces a continuation"*, that `drainForStop()` *"still exists and still works, but nothing in the app calls it"*, and that dedup is *"a per-renderer-session set of message ids, **not** the durable `cursor.json`"*.

**After** — the decision is un-struck and reads *"**Ships, and it ships GUARDED** — the guards are the decision, not a reversal of it."* The block-quote now states: the Stop boundary calls the drain (`hooks.ts:662` → `delivery.ts:262`, wired `index.ts:480`) and returns `{decision:'block', reason}` when the agent has unread mail, `{}` otherwise or when a guard stands, with `stop_hook_active` screened first (`hooks.ts:645`). The **historical note is kept and is true**: the version removed was the UNGUARDED one, because a forced continuation bypassed the terminal-draft/HITL gate; both gates are now checked in main (`paused()`, `vetoed()` with a TTL), neither needs a window. The renderer nudge is described as *a* path, no longer the only one. The dedup sentence is corrected to main's `seenSet` plus `cursor.json` (`hive.ts:1338`).

### §5's diagram row `:184` — before and after

**Before:**
```
        │ hook POSTs to the hive socket; main answers {} — never a forced continue
```
**After** (box-drawing and the `        │ ` column preserved; the fenced box at `:189-194` untouched):
```
        │ hook POSTs to the hive socket; main runs the GUARDED drain: unread mail
        │ comes back as {decision:'block', reason} — a forced continue carried by
        │ C's OWN turn, so nothing is typed. An empty drain, an operator pause or
        │ a renderer veto answers {} instead and the turn really ends
```
The following row (*"C goes idle; the renderer sees idle + unread inbox → enqueues a nudge"*) was kept, as instructed — the renderer nudge is still a real path.

### The other five

- **§3 `:125`** — the `cursor.json` comment block now says it is *ADVANCED by drainForStop() (hive.ts:1338), which the Stop boundary calls (hooks.ts:662)*, and is the durable exactly-once record.
- **§7 `:227`** — `⚠️ *shipped, but not as planned*` → `✅`.
- **§7 `:232`** — *"The **`Stop`-loop did not**…"* → *"The **`Stop`-loop ships too, guarded**"*, with the guards, their location in MAIN, and the note that the renderer's idle nudge is a second path.
- **§8 `:273`** — both halves of one row: *"Moot today — `Stop` always answers `{}`"* → *"Live risk, actively guarded … `stop_hook_active` is screened first (`hooks.ts:645`) … the `hops` cap bounds the chain"*.
- **§8 `:275`** — *"`cursor.json` is seeded but never advanced; the live dedup is the renderer's per-session set … lost on reload"* → advanced by the drain, plus main's `seenSet` pruned against the live inbox, *"neither dies with the window"*.

Nothing else in `HIVE.md` was "improved". Diff: **47 insertions, 27 deletions, one file.**

### `test/repo-claims.test.cjs` — APPENDED, not restructured

Plan 05's shape contract was followed exactly: the `Clauses so far` header list gained two lines, and two `test(...)` blocks were appended after the existing three. `stripComments`, `sourceFiles`, `readStripped`, `POLLER`, `ONE_SHOT_READERS` and all three existing tests are byte-identical. **Clause count: 3 → 5.**

- **Clause 4** — `HIVE.md` (comment-stripped) contains none of the twelve, driven from a single array, compared with `String.prototype.includes` (never a `RegExp`: two literals contain `*`, three contain `{}`). Denial 12's em dash (U+2014) was copied from `HIVE.md:184` rather than retyped. A companion `assert.equal(STALE_STOP_DRAIN_DENIALS.length, 12, …)` means trimming the list to pass the loop fails the suite instead.
- **Clause 5** — the positive direction: `index.ts` still wires `drainForStop` *and* `delivery.drainAtStop`; `hooks.ts` still calls the drain *and* returns `{decision:'block'}`; `delivery.ts`'s `drainAtStop` still checks `paused(agentId)` *and* `vetoed(agentId)`. Without it, deleting the feature would satisfy clause 4 and make every removed denial retroactively true.

### Acceptance criteria

| Criterion | Required | Measured |
|---|---|---|
| All twelve `grep -cF` in `HIVE.md` | `0` each | **`0` ×12** (table above) |
| `grep -cF -- "main answers {} — never a forced continue" test/repo-claims.test.cjs` | `1` | **`1`** |
| `grep -cF -- "'main answers {}'" test/repo-claims.test.cjs` | `0` | **`0`** |
| `grep -cF -- '~~' HIVE.md` | `0` (baseline `2`) | **`0`** |
| `grep -c "drainAtStop" src/main/hooks.ts` | ≥ `1` | **`3`** |
| `grep -cF "STALE_STOP_DRAIN_DENIALS" test/repo-claims.test.cjs` | ≥ `3` | **`3`** |
| `grep -cF "STALE_STOP_DRAIN_DENIALS.length, 12" …` | `1` | **`1`** |
| `grep -cF "STALE_STOP_DRAIN_DENIALS.length, 11" …` | `0` | **`0`** |
| `grep -c "per-spawn" HIVE.md` | ≥ `1`, same as task 1 | **`1`** — task 1 recorded `1`. Plan 02's paragraph survived. |
| `test/repo-claims.test.cjs` TAP | `EXIT=0`, `# pass ≥ B-repo-claims+2` and `≥ 5`, `# fail 0`, `# skipped 0`, `# todo 0` | **`EXIT=0`, `# tests 5 / # pass 5 / # fail 0 / # skipped 0 / # todo 0`**. Plan 05's recorded B-repo-claims = **`3`**; new = **`5`**. |
| `git diff --name-only -- HIVE.md test/repo-claims.test.cjs` | exactly those two | **`HIVE.md`, `test/repo-claims.test.cjs`** |
| `git diff --name-only -- .planning/codebase/ARCHITECTURE.md docs/message-queue.md` | empty | **empty** |
| `npm test` | `0` | **`0`** |

### Five RED controls on the two new clauses

| Control | Result |
|---|---|
| §8's `Moot today` restored to `HIVE.md` | `not ok 4` |
| §5's diagram clause `main answers {} — never a forced continue` restored | `not ok 4` |
| Freeze list trimmed to eleven (`**Reversed` dropped) | `not ok 4` (the length assertion fires) |
| `hooks.ts` no longer calls the drain | `not ok 5` |
| `delivery.ts` `drainAtStop` loses the `vetoed()` guard | `not ok 5` |

## Verification

### CI on the phase's draft PR to `main` — **PR #77 @ `c291e76`, all six jobs green**

```
$ gh pr checks 77
Build                            pass  59s
CodeRabbit                       pass  0     Review skipped: draft pull request
Electron smoke (ubuntu-latest)   pass  1m22s
Test (macos-latest)              pass  46s
Test (ubuntu-latest)             pass  46s
Test (windows-latest)            pass  1m22s
Typecheck                        pass  29s
```

Per-platform counters pulled from the run logs (`gh run view 32445216690 --log --job …`):

| Job | `# tests` | `# pass` | `# fail` | `# skipped` |
|---|---|---|---|---|
| `Test (ubuntu-latest)` | 460 | 460 | **0** | 0 |
| `Test (macos-latest)` | 460 | 460 | **0** | 0 |
| `Test (windows-latest)` | 460 | 456 | **0** | 4 |

454 → **460** (+6: four delivery, two repo-claims). Zero failures on all three platforms; the four Windows skips are the pre-existing platform-gated set, unchanged. All six new tests were confirmed by name in the Windows log (`ok 92`, `ok 94`, `ok 95`, `ok 353`, …).

`Electron smoke (ubuntu-latest)` — the real check-run name from `e2e.yml:30`, **`pass`**. Per `01-VALIDATION.md` the boot-time delivery path is one of the two waves that warrant the e2e run; it is green on this PR, not claimed from a local run (`npm run e2e` still requires `npm run build` first and `e2e.yml` triggers only on `main`).

`npm run typecheck` green locally (both projects, exit 0) and the `Typecheck` check run is `pass` on the same PR.

### Manual verification — **NOT DONE. `MEASUREMENT UNAVAILABLE`.**

> *"with the dev app running, close the window (not quit) and confirm an agent that goes idle is still woken."*

This was **not performed** and is **not claimed**. It needs `npm run dev`, a real hive, a real agent CLI session with a live subscription, an inbox message, and a human closing the window and watching — an interactive operator observation that cannot be automated from here and must not be fabricated. Filed as a blocker for plan 23 (same precedent as 01-05's FLOOR-11 "no visual change" clause).

**What IS proven instead, and its exact ceiling:** the flip happens on the tick with `emit` a genuine no-op — the durable half carries it alone — and `start()` demonstrably schedules that tick. That is the property in code. It is **not** a live observation of a closed window on a real floor.

*(Recorded drift, for whoever runs it: the plan states `node_modules/@playwright` does not exist and that `node-pty/build/Release` and `better-sqlite3/build` are absent. **All three are present at HEAD** — `@playwright/test`, `node-pty/build/Release`, `better-sqlite3/build`. The e2e blocker may be softer than the plan assumed; the manual gate is unaffected, since it needs a live agent account either way.)*

## Handoffs

### `T-INDEX` — plan 08's FLOOR-09 line was NOT taken

```
$ grep -c "recordCostSample" src/main/index.ts
0
```

`0` at task 1, `0` at HEAD. `01-08 TASK 6` (wave 4) owns that injection, verbatim per `01-06-SUMMARY.md` § `T-INDEX HANDOFF → 01-08 (FLOOR-09)`. This plan's own `index.ts` edits are confined to the `DeliveryService` deps object (`liveAgents`'s `lastOutputAt`, `breakerLevel`, `setStatus`) and do not touch the `new HookServer(…)` call at `:465`, so there is no collision.

### To plan 08 (wave 4), on the queue-drain half

The queue-drain effect (`useHive.ts` #4) is untouched. When it moves to main it will want the same live status the quiesce backstop now announces. **Main still has no working/idle store**; this plan announced the transition rather than storing it (see the decision above). If plan 08's drain needs to *read* "is this agent idle", the cheapest correct source is `LiveAgentPty.idleMs`/`hasOutput`, which the wake loop already gates on — not `registry.status`, which never transitions.

### To plan 23, on FLOOR-02's checkbox

**Do not tick FLOOR-02 on this plan alone.** Two of three clauses close here; the queue-drain is plan 08's. The requirement row was deliberately left `Pending` in `REQUIREMENTS.md`, matching the 01-02 / 01-04 / 01-05 / 01-06 precedent — plan 23 owns the checkboxes.

## Deviations from Plan

### Auto-fixed

**1. [Rule 1 - Bug] The never-painted guard could not do its job**
- **Found during:** post-task-2 production trace of `pty.ts`
- **Issue:** `lastOutputAt > 0`, ported verbatim from the renderer, cannot detect a TUI that never painted — `pty.ts:752` seeds the stamp at spawn. A hung child would be flipped idle the moment its boot grace lapsed.
- **Fix:** guard on `hasOutput && lastOutputAt > 0`; test extended; driven RED against the old guard.
- **Files:** `src/main/delivery.ts`, `test/delivery-main.test.cjs`
- **Commit:** `c291e76`

**2. [Rule 2 - Missing critical coverage] Nothing proved the backstop was scheduled**
- **Found during:** task 2 self-review
- **Issue:** all three planned tests call `svc.tick()` by hand; `start()` could stop scheduling the tick and every one would stay green while `T-P07-01` silently regressed.
- **Fix:** a fourth test stubbing `global.setInterval`, asserting exactly one timer at ≤ 4 s and firing its callback. Zero wall-clock. Driven RED.
- **Files:** `test/delivery-main.test.cjs`
- **Commit:** `152d008`

### Design decision recorded rather than followed literally

**`setStatus` writes the hive log, not an agent status field.** The plan asks for "a way to write the agent's status back to `working`/`idle`". Main owns no such field: `registry.status` is write-once `'idle'` (`hive.ts:883`) with no mutator and no transition anywhere in `src/main/`, which `index.ts:1210` states outright. Writing to it would have been a vacuous no-op against a field nothing advances — the surface-level fix. The durable sink chosen is the hive log, which the plan's own `T-P07-05` already names, plus a synthesized Stop-shaped `hive:hookEvent` for the live half so the renderer's existing mapping does the UI work unchanged.

### Anchor drift recorded, not acted on blind

`hooks.ts:332` → `:662`; `hive.ts:1253` → `:1338`; §6-§9's section starts +4 (plan 02's wave-2 §5 edit); §7/§8's four denial lines +4. Every literal still measured exactly `1`, so no replacement literal was needed. The plan's instruction — *"current source and current HIVE.md win"* — was followed; HIVE.md's new prose cites the measured numbers.

## Threat register — dispositions

| Threat | Disposition | Evidence |
|---|---|---|
| `T-P07-01` stuck `working` with the window closed | **mitigated** | `quiesce()` in main's tick; test asserts the flip with `emit` a no-op; `start()` proven to schedule it |
| `T-P07-02` backstop becoming a second PTY writer | **mitigated** | It writes zero terminal bytes; stated in the constant's comment and again on `quiesce()`. `submit()` remains the only writer |
| `T-P07-03` docs asserting a live path is dead | **mitigated** | Twelve denials deleted; both directions pinned in `test/repo-claims.test.cjs` |
| `T-P07-06` partial doc fix (§5 or §2 left standing) | **mitigated** | Twelve-literal gate + `~~` gate + a length assertion; §5 and §2 both rewritten, verified `0` |
| `T-P07-07` clobbering plan 02's `:191-194` | **mitigated** | `grep -c "per-spawn" HIVE.md` = `1` before and after; the paragraph is byte-identical |
| `T-P07-04` deleting the working Stop-drain | **mitigated** | Pasted grep before any edit; not touched; now pinned positively by clause 5 |
| `T-P07-05` a flip the operator cannot see | **accepted** | `emit` is a no-op with no webContents; the flip is written to the hive log (`agent_quiesced`). Surfacing it to a closed window is DAEMON-01's problem |

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema at a trust boundary. `setStatus` appends one record to the hive log, which `hive.appendLog` already owns and gitignores.

## Known Stubs

None.

## Self-Check: PASSED

Files claimed, verified present:

```
FOUND: src/main/delivery.ts
FOUND: src/main/index.ts
FOUND: src/renderer/src/hooks/useHive.ts
FOUND: test/delivery-main.test.cjs
FOUND: test/repo-claims.test.cjs
FOUND: HIVE.md
FOUND: .planning/phases/01-finish-the-floor/01-07-SUMMARY.md
```

Commits claimed, verified in `git log`:

```
FOUND: 834a86c  feat(01-07): move the idle-quiesce backstop out of the renderer into main's delivery tick
FOUND: 80e1f69  docs(01-07): delete all twelve of HIVE.md's stale Stop-drain denials and pin them
FOUND: 152d008  test(01-07): pin that start() actually schedules the quiesce backstop
FOUND: c291e76  fix(01-07): the quiesce backstop read a clock that cannot see a never-painted TUI
```

## Would I bet my pager on this?

**On the code: yes.** Six new tests, every guard driven RED individually, green on three platforms in CI, and the one property that could have been vacuous — "the backstop is actually scheduled" — has its own test with its own RED control.

**On the manual gate: no, and it is reported as unmet rather than papered over.** Nobody has closed a real window on a real floor and watched a real agent get woken. That observation is outstanding and is named as such in the blockers.
