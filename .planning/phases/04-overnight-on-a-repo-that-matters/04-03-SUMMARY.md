---
phase: 04-overnight-on-a-repo-that-matters
plan: 03
subsystem: main-autonomy-loop
tags: [typescript, electron-main, delivery-service, pty, block-detection, node-test, tdd]

# Dependency graph
requires: []
provides:
  - "src/shared/blockHints.ts — BLOCK_HINTS (moved verbatim from usePtyParser.ts:31-37) + matchBlockHint(recent): string | null, electron/node/DOM-free, visible to both tsconfig projects"
  - "DeliveryDeps.blocked: (agentId: string) => boolean — REQUIRED, not optional (src/main/delivery.ts:103-119)"
  - "The quiesce blocked guard at src/main/delivery.ts:766, textually before setStatus at :769, delete-and-continue"
  - "The wake-nudge blocked filter at src/main/delivery.ts:807"
  - "The production wiring at src/main/floor/boot.ts — blocked: (agentId) => !!ptyForAgent(agentId) && matchBlockHint(ptyManager.outputTail(ptyId)) !== null"
  - "test/delivery-main.test.cjs — eight VIGIL-03 cases (four durable-path, four matcher-bound), harness gains state.blocked"
affects: [04-07, 04-12, 04-13, 04-14]

tech-stack:
  added: []
  patterns:
    - "A required dep on a dep object the same plan owns the wiring for, so the declaration and its supplier land together — typecheck names the one production call site if the supplier is skipped (T-04-BLK-02)"
    - "Derived read of an existing bounded ring (PtyManager.outputTail) instead of a cached flag: no new state, no invalidation, and the recovery path falls out of the window bound for free"
    - "Negative assertions paired with a positive control over the same fixture (D-33/D-40) — every 'is not idled/emitted/nudged' has an 'and the identical control agent IS'"

key-files:
  created:
    - src/shared/blockHints.ts
  modified:
    - src/main/delivery.ts
    - src/main/floor/boot.ts
    - test/delivery-main.test.cjs

key-decisions:
  - "blocked is a DeliveryDeps member, not a field on LiveAgentPty — 04-RESEARCH Pattern 9 step 1 proposed the field; the plan overrode it and the plan is right. A required field breaks boot.ts's six-field liveAgents() literal in a region this plan did not own; an optional one deletes the only pressure that would ever produce a producer. The dep is the seam, wired exactly like `paused`."
  - "The RED commit does NOT touch src/main/delivery.ts at all. The plan allowed adding the dep 'as far as the type needs to compile', but test/delivery-main.test.cjs is .cjs loaded through test/load-ts.cjs (transpile-only, no typecheck), so nothing was needed — and keeping the source untouched makes the red/green boundary exactly one commit wide."
  - "The quiesce guard sits AFTER the `!quiet` branch and BEFORE `if (this.quiesced.has(...)) continue`. Placed after the membership check instead, a blocked agent already in `quiesced` would hit that continue first and never reach the delete, which is precisely the stale membership T-04-BLK-03 is about."
  - "matchBlockHint strips the whole window once (OSC, then full CSI, then C0/C1 keeping \\n and \\t) and matches BLOCK_HINTS against the stripped lines. The renderer matches raw text with an SGR-only stripper; matching the cleaned line is strictly more likely to catch a real prompt and is not a change to the patterns, which moved byte-for-byte."
  - "Newest matching line wins. A TUI repaints its whole frame, so a 4 KiB window can hold several matching lines from successive paints and the one the agent is sitting on is the last printed."
  - "RECENT_WINDOW_BYTES = 4096, honestly documented as UTF-16 code units rather than bytes — String.slice counts units, so for non-ASCII output this examines a little MORE than the name says, never less. Rounding the cost ceiling up is the safe direction."

requirements-completed: [VIGIL-03]

metrics:
  tasks: 3
  commits: 3
  files-created: 1
  files-modified: 3
  tests-before: 843
  tests-after: 851
  tests-failing: 0
  tests-skipped: 7

duration: ~35min
completed: 2026-08-25
---

# Phase 4 Plan 03: VIGIL-03's Durable Half, With Its Producer Summary

An agent parked on a permission prompt is no longer flipped to `idle` by main's quiesce backstop nor
mailed more work by the wake nudge — and the `blocked` dep that decides it is supplied at the
production composition root from `matchBlockHint(ptyManager.outputTail(ptyId))`, not from a fixture.

## What Shipped

| Task | What | Commit |
| ---- | ---- | ------ |
| 1 | The RED test: four VIGIL-03 cases that fail against `delivery.ts:740` as shipped | `93bad0f` |
| 2 | `blocked` on `DeliveryDeps` (required), the quiesce guard, the wake-nudge filter | `c1df69f` |
| 3 | `src/shared/blockHints.ts` + the `boot.ts` wiring + four matcher-bound cases | `6aef413` |

### The bug, as it stood at the base commit

`quiesce` checked the breaker level (`:727`) and the boot grace (`:730`) and nothing else before
calling `this.deps.setStatus?.(a.agentId, 'idle')` at `:740` — the half documented at `:117-120` as
*"the DURABLE half … this one has to work with the window closed"*. `stopArmDecision`
(`useHive.ts:169`) guards only the renderer's reaction to the synthesized Stop emitted on the next
line, so on `floor/headless.ts` there was no guard at all and on a windowed floor the durable status
was already wrong before the renderer got a say. Then `tick()`'s wake nudge filtered on `switching`,
`paused`, `vetoed`, boot grace and `idleMs` — five facts about the *floor*, none about the *agent* —
and typed `WAKE_NUDGE` into that same terminal, where it lands in the prompt's input box.

## RED Output, Verbatim (task 1, at commit `93bad0f`)

`node --test test/delivery-main.test.cjs` — 43 tests, 39 pass, **4 fail**. All four are behavioural
`AssertionError`s, not `TypeError`s and not module-resolution errors: `blocked` is supplied by the
harness and simply not read by the source.

```
✖ VIGIL-03: a blocked agent is not flipped idle by the quiesce backstop, with NO window attached (0.9074ms)
  AssertionError [ERR_ASSERTION]: setStatus(blockedAgent, idle): an agent sitting on a prompt was flipped idle by the durable backstop

  1 !== 0

      at TestContext.<anonymous> (test\delivery-main.test.cjs:348:10)
    actual: 1, expected: 0, operator: 'strictEqual'

✖ VIGIL-03: no synthesized Stop is emitted for a blocked agent, and one IS for the control (0.4173ms)
  AssertionError [ERR_ASSERTION]: a synthesized turn-end was announced for an agent that has not finished its turn — it is waiting for a human

  1 !== 0

      at TestContext.<anonymous> (test\delivery-main.test.cjs:363:10)
    actual: 1, expected: 0, operator: 'strictEqual'

✖ VIGIL-03: the wake nudge does not mail a blocked agent more work, and does mail the control (0.3697ms)
  AssertionError [ERR_ASSERTION]: WAKE_NUDGE was typed into a terminal parked on a prompt — that text lands in the prompt box, not in a turn

  1 !== 0

      at TestContext.<anonymous> (test\delivery-main.test.cjs:380:10)
    actual: 1, expected: 0, operator: 'strictEqual'

✖ VIGIL-03: a blocked agent LEAVES the quiesced set, so it re-announces when it unblocks (0.299ms)
  AssertionError [ERR_ASSERTION]: the unblocked agent never re-announced: a stale `quiesced` membership swallowed its real turn-end

  1 !== 2

      at TestContext.<anonymous> (test\delivery-main.test.cjs:408:10)
    actual: 1, expected: 2, operator: 'strictEqual'
```

The failure messages name `setStatus` and `WAKE_NUDGE`, as the VALIDATION row 04-03-T1 requires.

**The controls were live at RED, not merely written.** In the fourth case the *positive* assertion
(`idledCount(dev1) === 1` after the first tick) passed before the negative failed — so the backstop
demonstrably ran. In the first three the negative fires first and short-circuits the control; both
halves are asserted green at task 3's commit (all eight VIGIL-03 cases pass, controls included).

## The Intentional One-Error Typecheck (task 2, at commit `c1df69f`)

`blocked` is **required**, so the composition root cannot silently ship without a producer. At task
2's commit `npm run typecheck` reported exactly one error, in exactly the file task 3 closes:

```
src/main/floor/boot.ts(1057,34): error TS2345: Argument of type '{ liveAgents: () => LiveAgentPty[];
  inbox: (agentId: string) => { id: string; from: string; }[]; write: ...; paused: (agentId: string)
  => boolean; ... 7 more ...; emit: (channel: string, payload: unknown) => void; }' is not assignable
  to parameter of type 'DeliveryDeps'.
  Property 'blocked' is missing in type '{ ... }' but required in type 'DeliveryDeps'.
```

That error **is** the T-04-BLK-02 mitigation: an optional dep would have compiled clean and shipped a
guard reading `undefined` forever, which is D-28's defect rebuilt in a new file. At task 3's commit
typecheck is 0 errors in **both** projects, which is the proof that the required dep is genuinely
supplied at the production call site.

## Acceptance Criteria — Measured

Every number below was produced by a command run in this session.

| Criterion | Command | Result |
| --------- | ------- | ------ |
| Guard textually before `setStatus` | `grep -n 'deps.blocked(' \| head -1` vs `grep -n "setStatus?.(a.agentId, 'idle')"` | **766 < 769** ✅ |
| Guard is delete-and-continue | `delivery.ts:766` | `if (this.deps.blocked(a.agentId)) { this.quiesced.delete(a.agentId); continue; }` ✅ |
| Code-only `blocked` count ≥ 3 | `grep -v '^\s*\*' \| grep -v '^\s*//' \| grep -c 'blocked'` | **4** (dep, guard, nudge filter, + the pre-existing `blocked: false` in the Stop payload) ✅ |
| No `blocked` on `LiveAgentPty` (symbol-bounded) | `awk '/^export interface LiveAgentPty \{/,/^\}$/' \| grep -c 'blocked'` | **0** ✅ |
| Positive lower bound over the same range | same `awk` \| `grep -c 'idleMs'` | **2** (≥ 1, and exactly the plan's measured value) ✅ |
| `delivery.ts` diff is small, no reformat | `git diff --stat src/main/delivery.ts` | **35 insertions, 0 deletions** ✅ |
| No electron in the shared module | `grep -c "from 'electron'" src/shared/blockHints.ts` | **0** ✅ |
| No node builtins | `grep -cE "require\('node:\|from 'node:" src/shared/blockHints.ts` | **0** ✅ |
| Wired at the PRODUCTION composition root (symbol-bounded) | `awk '/delivery = new DeliveryService\(\{/,/^  \}\);$/' boot.ts \| grep -c 'matchBlockHint'` | **1** ✅ |
| Positive lower bound over the same extraction | same `awk` \| `grep -c 'setStatus'` | **1** (≥ 1 — the extraction found the object) ✅ |
| Exactly one `new HookServer(` (pinned by `hive-durability.test.cjs:186-193`) | `grep -c 'new HookServer(' boot.ts` | **1**, unchanged ✅ |
| `matchBlockHint` cap + strip | test case, 500-char noisy prompt | returns ≤ 120 chars, contains no `\x1b`, matches `/^Do you want to proceed\? x+$/` ✅ |
| `matchBlockHint('nothing interesting here')` | test case | **`null`** ✅ |
| Window bound, 300 KiB with the prompt at the front | test case (fixture is 320,029 chars) | **`null`**; the same string with a prompt appended returns the prompt ✅ |
| Module header carries the inherited false positive | `src/shared/blockHints.ts:20-26` | contains "KNOWN FALSE POSITIVE, INHERITED — NOT INTRODUCED HERE" and "Its recovery is its next real turn-end" ✅ |
| `npm run typecheck` | both projects | **0 errors** ✅ |
| `npm run lint` | `eslint . --max-warnings 0` | **exit 0** ✅ |
| `npm test` | full suite | **851 tests, 844 pass, 0 fail, 7 skipped** ✅ |
| `node --test test/queue-delivery.test.cjs` | — | 4/4 pass ✅ |
| `node --test test/boot-floor.test.cjs` | — | 19/19 pass ✅ |
| `node --test test/hive-durability.test.cjs` | — | 10/10 pass ✅ |
| `git diff --stat` touches only `files_modified` | vs base `8749a2b` | 4 files, **354 insertions, 0 deletions** ✅ |

**Test-count delta:** 843 → 851 (**+8**: four durable-path cases, four matcher-bound cases).
**Skipped:** 7 → 7, unchanged — nothing in this plan is POSIX-only.
**Failures:** 0 before, 0 after. **No pre-existing assertion was flipped, xfailed, or mocked around.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `boot.ts` needed an import line outside the plan's `:1056-1117` region**

- **Found during:** Task 3
- **Issue:** The plan's acceptance criterion reads *"`git diff src/main/floor/boot.ts` touches only
  lines between `:1056` and `:1117`"*, but its own `<action>` mandates calling `matchBlockHint` inside
  that region. TypeScript cannot resolve the symbol without an import statement, which necessarily
  lives at the top of the file. The criterion did not budget for it.
- **Fix:** One line — `import { matchBlockHint } from '../../shared/blockHints';` — placed beside the
  existing `../../shared/claudeAccounts` import. `git diff -U0` confirms the file has exactly **two**
  hunks: `@@ -55,0 +56 @@` (the import) and `@@ -1080,0 +1082,12 @@` (the dep, inside the region,
  offset by the import line). The timer block, `SHUTDOWN_STEPS` and the `new HookServer(...)`
  argument list — plans 04-09 / 04-11 / 04-20's regions — are all untouched.
- **Files modified:** `src/main/floor/boot.ts`
- **Commit:** `6aef413`

**2. [Rule 3 - Blocking] The harness needed a default `blocked` supplier before the dep became required**

- **Found during:** Task 1
- **Issue:** Task 2 calls `this.deps.blocked(a.agentId)` unconditionally. `test/delivery-main.test.cjs`
  is CommonJS loaded through `test/load-ts.cjs` (transpile-only), so a missing property is a runtime
  `TypeError`, not a type error — it would have broken the other 39 tests in the file.
- **Fix:** `state.blocked = new Set()` plus `blocked: (id) => state.blocked.has(id)` in the shared
  harness, landed in the RED commit. A Set rather than a flag on the agent literal, because production
  derives the answer per call from the PTY ring, so a test must be able to flip it *between* ticks —
  which is what the delete-and-continue case needs.
- **Files modified:** `test/delivery-main.test.cjs`
- **Commit:** `93bad0f`

**3. [Rule 3 - Blocking] A `boot.ts` comment's own use of the word `matchBlockHint` broke an exact-count grep**

- **Found during:** Task 3
- **Issue:** The criterion is `awk '…' | grep -c 'matchBlockHint'` **returns `1`**. The first draft of
  the explanatory comment contained the phrase "the prompt leaves matchBlockHint's window", making the
  grep return `2`.
- **Fix:** Reworded to "the prompt leaves the matcher's bounded window" — the criterion now measures
  `1` literally, rather than being reinterpreted to accommodate the code. No behaviour change.
- **Files modified:** `src/main/floor/boot.ts`
- **Commit:** `6aef413`

### Deliberate Divergences From the Written Plan

**4. Task 1 did not touch `src/main/delivery.ts` at all.**
The plan's task-1 `<action>` permits adding the dep *"only as far as the type needs to compile"*.
Nothing needed it: the test file is `.cjs` and `load-ts.cjs` transpiles without typechecking. Leaving
the source untouched makes the RED commit purely a test commit and the red→green boundary exactly one
commit wide. Recorded rather than silently done, since it narrows a plan instruction.

**5. `04-RESEARCH.md` § Pattern 9 step 1 was NOT followed — the plan's override was.**
Research proposed `blocked: boolean` on `LiveAgentPty`. The plan overrode it with the dep shape and
that override is correct: `boot.ts`'s `liveAgents()` literal supplies exactly six fields with no
spread, so a required field breaks a region this plan does not own, and an optional one removes all
pressure to ever build a producer. `awk`-bounded grep confirms `LiveAgentPty` gained nothing.

**6. `matchBlockHint` matches the STRIPPED line, where the renderer matches raw text.**
`usePtyParser.ts:158` runs `BLOCK_HINTS.some(re => re.test(recent))` against raw output with an
SGR-only stripper (`:5`). Here the window is stripped of OSC + full CSI + C0/C1 first, then split into
lines, then matched. The **patterns moved byte-for-byte** — this is the evaluation site, which differs
anyway (line-based, returns a line, bounded window). Matching cleaned text is strictly more likely to
catch a real prompt: `/❯\s*\d+\.\s*Yes/` cannot match `❯\x1b[0m 1. Yes` because `\s*` does not match
an escape sequence. Flagged here because "verbatim" was a plan constraint and this is the one place
the move is not literally byte-for-byte at the call site. Plan 04-07 owns reconciling the two readers.

### No Architectural Changes (Rule 4)

None encountered. No new tables, services, libraries or infrastructure; no `package.json` /
`package-lock.json` edit (D-36); no install step; no PTY writer added (ADR-0001 untouched — the guard
only *suppresses* a write).

## Authentication Gates

None. Nothing in this plan touches an authenticated surface.

## Known Stubs

None. Every value in this plan's chain has a real producer at the production composition root as of
this commit — that requirement is the plan's whole reason for existing (T-04-BLK-02), and the
`awk`-bounded grep over `new DeliveryService({…})` is the evidence.

## Threat Register — Dispositions Discharged

| Threat ID | Disposition | Where it landed |
| --------- | ----------- | --------------- |
| T-04-BLK-01 (DoS: idled then mailed) | mitigate | Guard at `delivery.ts:766` + nudge filter at `:807`; three tests, each with a control |
| T-04-BLK-02 (Repudiation: fixture-only `blocked`) | mitigate | Required dep → the one-error typecheck at `c1df69f`; wiring greped at the production call site, not the fixture |
| T-04-BLK-03 (DoS: stale `quiesced` membership) | mitigate | Delete-and-continue, placed **before** the membership check so it is reachable; asserted by the four-tick re-announce case |
| T-04-BLK-04 (Spoofing: echoed prompt false positive) | accept | Copied into `blockHints.ts`'s header as inherited-not-introduced, with its recovery path; the bounded window preserves that recovery mechanically |
| T-04-BLK-05 (Spoofing/Tampering: ANSI or a 100 KB line into a rendered row) | mitigate | Strip-then-cap in main, asserted with a 500-char noisy input (`≤ 120`, no `\x1b`, order verified by the shape of the result) |
| T-04-BLK-06 (DoS: sweeping a 256 KiB ring per agent per 4 s) | mitigate | `RECENT_WINDOW_BYTES = 4096`, asserted by a 320 KB fixture with the prompt at the front returning `null` |
| T-04-BLK-11 (EoP: Claude-TUI-shaped patterns miss other engines) | accept — named | Ceiling written into `blockHints.ts`'s header naming codex/grok/kimi/agy/pi/OpenCode; list not widened on a guess; live observation is 04-13-T4's |
| T-04-SC (Tampering: installs) | mitigate | Zero packages added; `package.json` and `package-lock.json` untouched |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access pattern and no schema change.
`src/shared/blockHints.ts` is a pure function over a string; the one new trust-boundary crossing —
PTY bytes becoming a value main may hand a renderer — is T-04-BLK-05, already in the register above
and mitigated at this boundary.

## Ceilings and Honest Limits

- **No live observation was made.** Every measurement here is unit-level and static. That a real
  agent sitting on a real prompt is marked blocked on this machine's floor is **not** verified by this
  plan; 04-13-T4 owns the one live observation available.
- **`BLOCK_HINTS` remains Claude-Code-shaped.** On the six other engines the guard may simply never
  fire. Correct behaviour, zero coverage — written into the module header, not discovered later.
- **The false positive is live.** An agent that quotes a yes/no prompt back in its own output reads as
  blocked for as long as that text stays inside the 4 KiB window. Inherited from `useHive.ts:140-144`,
  carried deliberately per 04-UI-SPEC rule V-3.
- **Two `BLOCK_HINTS` declarations exist right now** — the new shared one and `usePtyParser.ts:31`'s
  local copy, which this plan is forbidden to touch. Safe only because the copy is verbatim; plan
  04-07 (wave 2) deletes the renderer's and proves one-list-two-readers.

## Self-Check: PASSED

Files claimed as created/modified, verified on disk:

```
FOUND: src/shared/blockHints.ts
FOUND: src/main/delivery.ts
FOUND: src/main/floor/boot.ts
FOUND: test/delivery-main.test.cjs
FOUND: .planning/phases/04-overnight-on-a-repo-that-matters/04-03-SUMMARY.md
```

Commits claimed, verified in `git log`:

```
FOUND: 93bad0f  test(04-03): VIGIL-03 goes RED — main idles a blocked agent, then mails it work
FOUND: c1df69f  fix(04-03): main stops idling a blocked agent, and stops mailing it work
FOUND: 6aef413  feat(04-03): the blocked guard gets a real producer at the production composition root
```

TDD gate sequence present and in order: `test(...)` → `fix(...)` → `feat(...)`. The GREEN gate is a
`fix(` rather than a `feat(` because the commit closes a shipped defect on the durable path; the
`feat(` is task 3's new module and wiring. RED before GREEN is satisfied and the RED output is
recorded verbatim above.

STATE.md and ROADMAP.md were **not** modified — the orchestrator owns those writes.
