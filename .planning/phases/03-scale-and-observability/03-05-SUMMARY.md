---
phase: 03-scale-and-observability
plan: 5
subsystem: observability
tags: [daily-digest, scheduler, dst, slack, notifications, d-30, d-31, d-35, d-38, scale-04]

# Dependency graph
requires:
  - phase: 03-03
    provides: "hive.dailyCostRows(dayStartMs, dayEndMs) — the already-diffed per-row cost deltas the digest's spend total is summed from, and applyCostRow's D-22 arithmetic behind it"
  - phase: 03-04
    provides: "the validated-team-member field strip (commandFlags/skills/mcpServers) this plan does not re-introduce"
  - phase: 03-06
    provides: "the wave ordering that let this plan own BOTH mirrored HarnessConfig declarations (preload + renderer store) without a same-wave collision"
  - phase: pre-existing
    provides: "syncContextTriggers' two-stage timer shape, writeFleetSnapshot's never-throws-from-a-timer shape, SHUTDOWN_STEPS, postSlackReply's raw-https POST + CLAUSE-1 guard, deps.notify vs deps.send, AGENT_PROVIDER_PRESETS.costTracking, DayBandTab's two D-35 gap sentences"
provides:
  - "DIGEST_DEFAULT_HOUR — the single source of the fire hour (config.ts's DEFAULTS.digestHour is deliberately absent, not a second copy)"
  - "msUntilNextLocalHour(hour, now) — pure, injected clock, DST-correct via setDate(+1)"
  - "buildDigestContent(costRows, tasks, day, projectLabel, costGapNone, costGapTranscript) — pure, exported, two independently-gated D-35 declarations"
  - "fireDigest() — the three-arm delivery, non-async so the file and toast arms complete for a caller that never awaits"
  - "armDigestTimer + clearDigestTimer + the SHUTDOWN_STEPS entry, all in one commit"
  - "digestSlackTarget(config) — the four-clause Slack gate, exported and testable without a floor"
  - "postSlackDigest — a sibling of postSlackReply with no thread_ts, in src/main/slack.ts"
  - "config fields dailyDigest / slackDigestChannelId / digestHour, mirrored into both preload and renderer HarnessConfig"
  - "The Settings digest toggle with its honest headless limitation"
affects: [SCALE-04, 03-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A scheduler's next-day step must use setDate(+1), never +86_400_000 — and the test has to pin process.env.TZ to a DST zone, because on Asia/Calcutta and on UTC CI the wrong implementation passes every other case"
    - "A once-a-day KV stamp is what makes catch-up-on-arm safe: it collapses the double-fire, the tight re-schedule loop, and the re-arm duplicate into one guard"
    - "Function.prototype.toString() returns COMMENTS — an unstripped structural pin is satisfiable by a comment that merely names the symbol, and is failed by a comment that merely names the forbidden one"
    - "A grep for a writer anywhere in a file cannot prove the button calls it: read the handler NAME off the element's own onClick, then require THAT handler's body to write"
    - "A textual call-site count cannot distinguish a live caller from a call inside dead code — the D-38 grep is a tripwire, the end-to-end fire-path test is the promise"
    - "Wiring tests prove the arms exist; only a seeded ledger + registry + task file proves what travels through them"

key-files:
  created:
    - test/digest-scheduler.test.cjs
  modified:
    - src/main/floor/boot.ts
    - src/main/slack.ts
    - src/main/config.ts
    - src/preload/index.ts
    - src/renderer/src/store/config.ts
    - src/renderer/src/components/SettingsModal.tsx
    - test/slack.test.cjs
    - test/repo-claims.test.cjs

key-decisions:
  - "buildDigestContent's third parameter is the DAY RANGE, not hive.board(). The plan's own <behavior> requires 'any humanQA entry with askedAt inside yesterday's range' — and the range was absent from the six-arg signature while `board` had no consumer anywhere in that same spec. A 32 KB string passed in and never read. Same arity, same positions for every pinned parameter."
  - "Both D-35 gap counts come from hive.registry(), not roster.read(). roster.json is a mirror the RENDERER writes, typed unknown[]; on a machine that booted headless it is stale or absent, which reports both counts as 0 and ships the bare undeclared total D-35 forbids — on the one artefact SCALE-04 delivers to an operator who is not watching."
  - "config.ts's DEFAULTS.digestHour is left undefined rather than set to 9. The plan asked for `digestHour: DIGEST_DEFAULT_HOUR`, which cannot be imported without closing a require cycle, leaving a restated literal — exactly the silent disagreement the plan's own must_have forbids. One value, one place."
  - "fireDigest is NON-async and returns dispatchDigestToSlack(...). The plan's Task-2 criterion greps `export function fireDigest` while its Task-3 action writes `await postSlackDigest(...)`; async breaks the grep and the plan forbids an inline closure. Keeping the await in a named helper satisfies both, and is better: the two synchronous arms have provably completed for a caller (the timer) that never awaits."
  - "The digest toggle renders OUTSIDE the slackEnabled block. Two of its three arms never touch Slack, so a floor with Slack off must still be able to turn the digest on; the channel-id input stays inside."
  - "Every number in this document was measured in this session. Nothing was inherited from the plan's prose."

requirements-completed: [SCALE-04]

# Metrics
duration: 36min
completed: 2026-08-26
---

# Phase 3 Plan 5: SCALE-04 The Daily Digest Summary

One digest delivered three ways in decreasing order of guaranteedness — an unconditional file
under the hive root, an OS toast, a Slack post behind four switches — driven by a wall-clock
timer that catches up after sleep, survives a 23-hour DST day, and lands its `SHUTDOWN_STEPS`
teardown in the same commit as the timer, which was measured to be the difference between a red
assertion and a `node --test` that never exits.

## Test baseline

| | Tests | Pass | Fail | Skipped | Duration |
|---|---|---|---|---|---|
| Base `12635271` | 1237 | 1230 | **0** | 7 | 24,935.2 ms |
| Head `9175fc67` | 1262 | 1255 | **0** | 7 | 25,286.3 ms |
| Delta | **+25** | +25 | 0 | 0 | **+351 ms** |

The `+25` counts only what `node --test` sees: 23 in the new `test/digest-scheduler.test.cjs`
and 2 in `test/repo-claims.test.cjs`. `test/slack.test.cjs` uses its own `test()` harness and
`process.exit`, so it reports as ONE node:test entry however many cases it holds — its internal
count went **33 → 41** (8 new cases: 4 for `postSlackDigest` / `postSlackReply`, 4 for the
four-switch gate), all 41 green. **34 new assertions-bearing cases in total.** Per-file duration,
measured individually this session: `digest-scheduler.test.cjs` 1,808.8 ms / 23 pass,
`slack.test.cjs` 1,053.9 ms / 41 internal cases, `repo-claims.test.cjs` 3,694.4 ms / 48 pass,
`boot-floor.test.cjs` 4,887.9 ms / 30 pass. Nothing approaches the 240-second class of slow-pass
this project has hit before.

`npm run typecheck` — 0 errors. `npm run lint` (`eslint . --max-warnings 0`) — clean.

## Accomplishments

**Task 1 — the scheduler and the content builder.** `DIGEST_DEFAULT_HOUR = 9`;
`msUntilNextLocalHour(hour, now)` pure with an injected clock, returning `0` exactly at the hour
and stepping to the next day with `setDate(+1)`; `buildDigestContent` exported and pure, stamping
the project label in the first three lines, summing only the already-diffed rows handed to it,
reporting CURRENT board counts with an in-text declaration that a card carries no `doneAt`, and
listing only unanswered `humanQA` asked inside the day. The two D-35 sentences are separate
constants on separate gates; `digestTranscriptGap` is `DayBandTab.tsx`'s `transcriptOnlyGap`
with the single word `track` changed to `total`, so the day band and the digest cannot drift
into two explanations of one gap.

**Task 2 — the timer and the file + toast arms.** `armDigestTimer` clears before it sets, fires
a catch-up when armed past the hour on a day nothing has gone out, and re-schedules itself with
`setTimeout` rather than settling into a 24-hour `setInterval` (a local day is 23 or 25 hours
twice a year). A once-a-day KV stamp collapses three separate hazards into one guard: the
double-fire when armed exactly on the hour, the tight re-schedule loop at the fire instant, and
the duplicate on a second `startHiveServices()`. The file arm is the only arm with no config
gate. `SHUTDOWN_STEPS` gained a step named `clearDigestTimer` in the same commit.

**Task 3 — Slack, config and Settings.** `postSlackDigest` is a new sibling of `postSlackReply`
with no `thread_ts` key in the body at all and a fail-closed guard on a missing token or blank
channel; `postSlackReply` and its CLAUSE-1 guard are byte-unchanged and are now pinned by two
regression cases in the same file. `digestSlackTarget(config)` is the four-clause gate, exported
so every off-state is drivable without a floor. The three config fields are mirrored into both
separately-declared `HarnessConfig` interfaces. Settings gained the toggle, the channel input,
and the limitation sentence — verified character-for-character against the plan's literal.

## Deviations from Plan

### Auto-fixed / re-scoped

**1. [Rule 3 - Blocking] `buildDigestContent`'s third parameter is the day range, not `hive.board()`**
- **Found during:** Task 1
- **Issue:** the plan's `<behavior>` requires "any `humanQA` entry with `askedAt` inside
  yesterday's range and no `answeredAt` yet" from a PURE function, but the range was nowhere in
  the six-argument signature it also specified. Meanwhile `board: string` had no consumer in that
  same behavior spec — the board counts are explicitly derived from `tasks`, not from the board
  markdown — so it would have been up to 32 KB passed in and never read.
- **Fix:** the third slot carries `{ startMs, endMs }`. Same arity, same positions for every
  parameter any acceptance criterion pins. `hive.board()` is simply not read, because nothing
  consumes it.
- **Files:** `src/main/floor/boot.ts`
- **Commit:** `4e050f75`

**2. [Rule 1 - Correctness] Both D-35 gap counts read `hive.registry()`, not `roster.read()`**
- **Found during:** Task 2
- **Issue:** the plan mandates walking `roster.read()?.agents`. `roster.json` is a mirror the
  RENDERER writes, typed `unknown[]`. On a machine that has booted headless — the exact scenario
  SCALE-04 exists for — it is stale or absent, which reports BOTH counts as `0` and ships the
  bare, undeclared spend total that round 4's two HIGH findings are about, one level removed.
- **Fix:** `digestCostGaps()` walks `hive.registry().agents`, skipping archived entries. That is
  main's own typed record, it is what `writeFleetSnapshot` already uses, and it is the source
  that agrees with the total being declared (cost samples reach `cost-ledger.jsonl` keyed on
  registry agents). The archived-skip is mutation-tested.
- **Files:** `src/main/floor/boot.ts`
- **Commit:** `61c916e3`

**3. [Rule 1 - Correctness] `DEFAULTS.digestHour` is absent, not `9`**
- **Found during:** Task 2
- **Issue:** the plan asks for `digestHour: DIGEST_DEFAULT_HOUR` in `DEFAULTS`, then concedes
  the import may cycle and offers "re-state the same literal `9`". `config.ts` is imported BY
  `boot.ts`, so the import does cycle (and would hit a TDZ error on `DEFAULTS`'s evaluation).
  The offered fallback is a second copy of a number — precisely the "can never silently
  disagree" property the plan's own must_have demands.
- **Fix:** `DEFAULTS.digestHour` is left `undefined`, matching this file's existing
  `slackSigningSecret: undefined` style, with a comment naming `DIGEST_DEFAULT_HOUR` as the one
  place the number lives. `digestHour()` in boot.ts falls back to it, and additionally rejects a
  non-integer or out-of-range hand-edited value rather than handing it to `Date` arithmetic.
- **Files:** `src/main/config.ts`, `src/main/floor/boot.ts`
- **Commit:** `61c916e3`

**4. [Rule 3 - Blocking] The three config fields landed in Task 2, not Task 3**
- **Found during:** Task 2
- **Issue:** `boot.ts` does not typecheck without `HarnessConfig.dailyDigest` and
  `.digestHour` declared.
- **Fix:** the field declarations + `DEFAULTS` entries were pulled forward into Task 2's commit;
  the preload/renderer mirrors and the Settings UI stayed in Task 3's.
- **Commit:** `61c916e3`

**5. [Rule 3 - Blocking] `fireDigest` kept non-async**
- **Found during:** Task 2/3 — see "Criteria that do not bite" below for why this was a genuine
  contradiction rather than a preference.
- **Fix:** `fireDigest(): Promise<void>` returns `dispatchDigestToSlack(cfg, text)`, a named
  top-level helper that owns the one `await`.
- **Commit:** `61c916e3`, `8fabfb5f`

## Criteria that do not bite, and what replaced them

The plan is unusually well-pinned and most of its criteria are real. These four are not, and are
named rather than quietly satisfied.

**1. `grep -n "export function fireDigest"` (Task 2) is UNSATISFIABLE together with Task 3's own
`<action>`.** Task 3 instructs `const res = await postSlackDigest({...})` inside the fire
callback. `await` requires `async`; `export async function fireDigest` does not match the literal
`export function fireDigest`; and Task 2 explicitly forbids the inline-closure workaround. The
resolution was to keep `fireDigest` non-async and move the single `await` into
`dispatchDigestToSlack`. This turned out to be the better shape independently: the timer calls
`fire()` without awaiting, and a non-async `fireDigest` guarantees the file and toast arms have
already run by the time it returns.

**2. The plan's `node -e` harness proof for `deps.send` cannot tell a comment from a call.** It
slices `fireDigest`'s RAW source and rejects any occurrence of `deps.send`. A comment explaining
*why* the function avoids `deps.send` turns it red; a comment merely mentioning `deps.notify`
with no call turns its positive half green. Both halves were observed live. The shipped code
keeps that token out of the function's comments (with a note saying why), and the test-side
version strips comments before asserting, in both directions. The plan's literal command passes:
`PASS (slice length 2285 chars)`.

**3. The D-38 call-site pin cannot distinguish a live caller from dead code.** Mutating
`fireDigest` to `return Promise.resolve()` — never dispatching the Slack arm at all — left
`postSlackDigest(` still present inside the now-unreachable `dispatchDigestToSlack`, and the pin
stayed GREEN. It goes red only when the call site is textually removed (verified). The pin is
kept as the cheap tripwire it is; the promise it claims to hold is actually held by the
end-to-end fire-path test, which caught that mutant.

**4. `grep -n "projectLabel" >= 2` and `grep -n "doneAt" >= 1` are satisfiable by comments
alone.** Replaced in substance by assertions on real first-pass output: the label must appear
within the first three lines of the rendered digest, the rendered text must carry the no-`doneAt`
declaration, and three separate regexes assert the content never claims a per-day completion.

## Pin holes found and fixed while mutating

Two pins were written, driven RED by mutation, found GREEN, and rewritten. Both are the vacuity
class this phase keeps paying for.

1. **The Settings write-through pin.** As first written it grepped the whole file for
   `updateConfig({ dailyDigest`. Rewiring the button's `onClick` to a bare `setDailyDigest((v) => !v)`
   left the writer in the file, merely orphaned, and the pin stayed green — a toggle that flips a
   pixel and persists nothing. It now reads the handler NAME off the digest button's own
   `onClick` and requires THAT handler's body to be the thing that writes. Both mutants (rewired
   onClick, and handler-kept-but-write-removed) now go red.
2. **The `fireDigest` structural pin.** `Function.prototype.toString()` returns comments, so the
   first version failed on a comment and could have passed on one. Now comment-stripped.

## Mutation log

Every capability was negative-controlled. 22 mutants, each caught by the case that owns it and
by no more than the cases that should own it.

| # | Mutant | Caught by |
|---|---|---|
| 1 | `target.getTime() < now` → `<=` | exactly-at-the-hour returns 0 |
| 2 | `setDate(+1)` → `+86_400_000` | BOTH DST cases (23h and 25h) |
| 3 | project label dropped from the header | D-31 identity stamp |
| 4 | transcript gate re-pointed at `costGapNone` | D-35 cases (a) and (b) |
| 5 | `answeredAt` guard deleted | humanQA in-range/answered filter |
| 6 | no-`doneAt` declaration → "Cards completed on this day" | board-counts case |
| 7 | `SHUTDOWN_STEPS` entry removed | named pin RED **and** `node --test` hangs (exit 124) |
| 8 | catch-up branch removed | D-30 catch-up |
| 9 | catch-up made unconditional | "armed BEFORE its fire hour" |
| 10 | once-a-day stamp guard removed | the re-arm half of D-30 |
| 11 | file arm gated on config | file-arm case |
| 12 | toast gated on `notifications` | toast-gating case |
| 13 | toast rerouted through `deps.send` | structural pin **and** the runtime sink read-back |
| 14 | `thread_ts` reintroduced into the digest body | channel-root case |
| 15 | fail-closed channel guard removed | fail-closed case |
| 16 | `console.error(..., opts)` added to `postSlackDigest` | T-03-05a pin **and** the plan's `node -e` |
| 17 | gate narrowed to token+channel | pure predicate **and** end-to-end |
| 18 | Slack arm never dispatched | end-to-end (NOT the D-38 grep — see above) |
| 19 | the only `postSlackDigest` call site removed | D-38 grep |
| 20 | toggle `onClick` → bare setState | rewritten Settings pin |
| 21 | toggle handler kept, its write removed | rewritten Settings pin |
| 22 | ledger + task reads replaced with `[]`; archived-agent guard removed | real-ledger end-to-end |

## Stale citations re-measured

The plan's ANCHOR RULE was right to warn. Measured at the base commit `12635271`:

| Plan citation | Actual | Drift |
|---|---|---|
| `boot.ts:429` — `if (sample?.sessionId) hive.appendCostLedger(sample)` | `:467` | +38 |
| `boot.ts:165` — `roster` module binding | `:206` | +41 |
| `boot.ts:1153` — `roster = new RosterStore(...)` | `:1407` | **+254** |
| `agentProvider.ts:229`/`:230` — claude / `'otel'` | `:240`/`:241` | +11 |
| `agentProvider.ts:256`/`:257` — codex / `'transcript'` | `:267`/`:268` | +11 |
| `agentProvider.ts:387`/`:388` — qwen / `'proxy'` | `:434`/`:435` | +47 |
| `agentProvider.ts:486`/`:487` — crush / `'proxy'` | `:536`/`:537` | +50 |
| `telemetry.ts:636` — transcript fallback `sessionId: ''` | `:636` | **0 — exact** |
| `slack.ts:360-414` — `postSlackReply` | `:373-413` | +13 |
| `SettingsModal.tsx ~1637-1680` — Slack config UI | `:1704-1834` | +67 |
| `OnboardingWizard.tsx:683` — `label="OPEN AT LOGIN"` | `:683` | **0 — exact** |
| `repo-claims.test.cjs:63` — `stripComments` | `:63` | **0 — exact** |
| `repo-claims.test.cjs:1228-1233` — the `new X(...)` pin | `:1233-1240` | +5 |
| `03-UI-SPEC.md:841` — `Requires Start at login.` | `:841` | **0 — exact** |

The plan's *content* claims all held. Re-measured live in `src/shared/agentProvider.ts`: eleven
presets, `costTracking: 'none'` × 7, `'transcript'` × 1 (codex), `'proxy'` × 2, `'otel'` × 1 —
exactly as the plan states. `grep -c "costGap" src/main/floor/boot.ts` was `0` before this plan,
as claimed; `grep -cF "no cost meter"` and `grep -cF "never reaches the cost ledger"` were both
`0`; `grep -c "postSlackDigest" test/repo-claims.test.cjs` was `0`; `grep -cF "slackEnabled: false"
test/slack.test.cjs` was `0`.

## Standing facts re-verified (not trusted)

- `src/main/db.ts`: exactly ONE `CREATE TABLE IF NOT EXISTS events`, ZERO `floor_id`. Untouched.
- `EVENT_RETENTION_MS` exported and unchanged. Untouched.
- `grep -c "commandFlags\|mcpServers" src/main/floor/boot.ts` → `0`. 03-04's strip still holds;
  nothing here re-introduces those fields.
- `boot.ts`'s `openAsk` positional `undefined` — untouched.
- `git diff 12635271 --diff-filter=D --name-only` → empty. No file was deleted.
- The diff touches exactly the nine paths in the plan's `files_modified` and nothing else.

## Accepted residuals

- **T-03-05e (the plan's own).** `armDigestTimer()` is wired only from `startHiveServices()` in
  `boot.ts`. `index.ts`'s `triggers:setContext` IPC handler and its `powerMonitor` resume handler
  also call `syncContextTriggers()` and are NOT wired here — deliberately, since `index.ts` is
  outside this plan's `files_modified`. A sleep/resume WITHOUT a process restart therefore
  re-evaluates catch-up only at the next natural fire. Note that `startHiveServices()` IS
  re-called by `index.ts` after onboarding, and the once-a-day stamp makes that safe. A follow-up
  plan can wire the two `index.ts` call sites; the residual is one `armDigestTimer()` call beside
  each existing `syncContextTriggers()`.
- **Round-3 #38 (the plan's own, LOW).** `03-UI-SPEC.md:841` — verified still present and still
  exactly `Requires Start at login.` — mandates copy that names a control this app does not have.
  The shipped string names `Open at login`, per Task 3's `<behavior>` resolution rule.
  `03-UI-SPEC.md` is in no plan's `files_modified` in this phase, so it is left for whichever
  later plan owns that file. A `repo-claims` clause now asserts the *shipped* string and asserts
  the old copy has NOT come back, and cross-pins `OPEN AT LOGIN` in `OnboardingWizard.tsx` so a
  rename there cannot silently leave Settings pointing at nothing.
- **D-38's grep pin is weaker than it reads** (see "Criteria that do not bite", item 3). Recorded
  here so the next plan that leans on that pattern knows what it does and does not prove.

## Known Stubs

None. Every field the digest renders is read from a real source and was proven so by a seeded
`cost-ledger.jsonl` / `tasks.json` / `registry.json` under a booted floor, with the ledger and
task reads mutated to `[]` to confirm the check fails.

## Threat Flags

None. The only new outbound surface is `postSlackDigest`, which the plan's own threat register
already covers (T-03-05a/f), and the only new file written is `digest-YYYY-MM-DD.md` under the
operator's own hive root. No new network listener, no new IPC channel, no new schema.

## Commits

| Commit | Type | Message |
|---|---|---|
| `22911297` | test | SCALE-04's scheduler and digest content, RED |
| `4e050f75` | feat | DIGEST_DEFAULT_HOUR, msUntilNextLocalHour and the digest content builder |
| `fed0aea9` | test | the digest timer, its shutdown entry and the three arms, RED |
| `61c916e3` | feat | the digest timer, its shutdown entry, and the file + toast arms |
| `c77fe44e` | test | postSlackDigest, its four-switch gate and the Settings toggle, RED |
| `8fabfb5f` | feat | postSlackDigest, its four-switch gate, and the Settings toggle |
| `9175fc67` | test | prove the digest reports REAL ledger data, not an empty shell |

## TDD Gate Compliance

All three tasks carry `tdd="true"` and all three ran RED → GREEN with the RED commit made and
the failure recorded in its message. Verified in `git log`: `test(...)` precedes `feat(...)` in
each pair. No REFACTOR commit was needed — no mutant required restructuring shipped code.

## Verification run at HEAD `9175fc67`

```
node --test test/digest-scheduler.test.cjs test/boot-floor.test.cjs \
            test/slack.test.cjs test/repo-claims.test.cjs
  -> 101 tests, 101 pass, 0 fail, 0 skipped, 5,498.98 ms

npm run typecheck  -> 0 errors
npm run lint       -> clean (--max-warnings 0)
npm test           -> 1262 tests, 1255 pass, 0 fail, 7 skipped, 25,286.25 ms
```

The plan's two harness-side `node -e` proofs, run literally as written:

```
fireDigest: deps.notify present, deps.send absent   -> PASS  (slice length 2285 chars)
postSlackDigest: no console.* touching opts/botToken -> PASS
```

And the one criterion that needed a slice rather than a file-wide count:
`thread_ts` occurrences inside `postSlackDigest`'s body = **0**; inside `postSlackReply`'s = 7;
file-wide in `slack.ts` = 19 (all pre-existing, in the reply path and the inbound event types).

## Self-Check: PASSED

All ten claimed files exist on disk. All seven claimed commit hashes resolve in `git log`. Every
line number in the "Stale citations" table was read out of `git show 12635271:<file>` in this
session, not copied from the plan. Every test count and duration in this document came from a
command run in this session; none was inherited.
