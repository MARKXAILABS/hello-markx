---
phase: 01-finish-the-floor
plan: 25
subsystem: main
tags: [otel, telemetry, capability-token, argv-injection, session-id, circuit-breaker, account-pool, responsive-layout, gap-closure]

requires:
  - phase: 01-finish-the-floor
    provides: "GATE-01's per-agent hook token and its throttled reject idiom (src/main/hooks.ts), the FLOOR-09 OTLP collector and account pool (src/main/telemetry.ts, src/main/accountPool.ts), the FLOOR-13 sidebar collapse (src/renderer/src/store/sidebarLayout.ts)"
  - phase: 01-finish-the-floor
    provides: "01-24's landed rewrite of src/main/hooks.ts — (dev, ino) socket identity in place of string canonicalisation"
provides:
  - "a telemetry-only per-agent capability on the OTLP collector: mintAgentToken / revokeAgentToken, an x-hive-otel-token gate that fails CLOSED, and a throttled 401 that diagnoses a telemetry blackout instead of announcing one"
  - "attribution DERIVED from the token — the payload's `agent.id` claim is unreadable on every network-reachable path, on both the scope-attribute and resource-attribute reads"
  - "session accumulators keyed by the (agentId, sessionId) PAIR, with a separator-independent injectivity control"
  - "every Claude PTY exports its own telemetry credential on the two PER-SIGNAL OTLP header vars, minted and revoked at the same choke point as the hook token, and never on the generic var"
  - "SPAWN_SAFE_SESSION_ID — an argv-safe session-id shape, strictly narrower than the path-component rule, with the subset relation pinned by test"
  - "four guarded sinks: both spawn branches, the breaker beat's recordSession write, and the hook WRITER — so a flag-shaped id neither reaches argv nor becomes durable state"
  - "MIN_WIN 1280 -> 960, making the FLOOR-13 collapse below 1024 reachable in the shipped app, with DESIGN.md's two statements corrected in place"
affects: [01-29 (splitter persistence + the DESIGN.md line citations this makes load-bearing), 01-31 (residual register — the hive.recordSession defence-in-depth item below), 01-26 (src/main/hive.ts, which owns that residual's file)]

tech-stack:
  added: []
  patterns:
    - "two capabilities, two secrets: a credential carried on an OpenTelemetry-spec'd env var is inherited by every grandchild, so it must never be the same secret as the hook socket's"
    - "fail CLOSED on an empty registry — an optional gate whose absence opens the door is not a gate"
    - "attribution as an explicit ARGUMENT from the transport, with the payload's claim surviving only as a `??` fallback that the network path can never reach"
    - "an injectivity control that never names the separator: every test that imports the key builder agrees with it by construction, so only a separator-blind assertion can fail for a wrong separator"
    - "two constants for two sinks — a path-component charset and an argv shape — with a subset control asserted over the whole measured table so they cannot invert"
    - "the WRITER validates what the READER will refuse: a value that is refused at use but accepted at storage severs its own continuity"

key-files:
  created:
    - test/telemetry-auth.test.cjs
  modified:
    - src/main/telemetry.ts
    - src/main/pty.ts
    - src/main/index.ts
    - src/main/transcript.ts
    - src/main/hooks.ts
    - DESIGN.md
    - test/runtime-forget.test.cjs

key-decisions:
  - "The collector owns its own token registry rather than borrowing HookServer.agentForToken: no TDZ, no startup window in which a legitimate batch is refused, and a leaked telemetry token never buys the hook socket."
  - "The per-signal OTLP header vars only, never the generic OTEL_EXPORTER_OTLP_HEADERS — the generic one is read by every SDK for every signal and inherited by every grandchild."
  - "ingestMetrics/ingestLogs take `agentId?: string`: optional in the type, required in practice. handleRequest is the only network-reachable caller and 401s before it can call either, so the legacy attrs read survives ONLY for the 28 in-process test call sites and is unreachable from the network."
  - "The session key separator is `\\u0000`, spelled as the six-character escape exactly as hive.ts's applyCostRow spells it, so the two halves of the cost path agree and no raw NUL byte enters the source."
  - "VALID_SESSION_ID's pattern is untouched. SPAWN_SAFE_SESSION_ID is a SECOND constant, because narrowing the shared one would silently break seedSessionTranscript/resolveSessionCwd for the long and leading-underscore ids that resolve today."
  - "The leading-character anchor is the fix, not the charset: `-` is a member of [A-Za-z0-9_-], which is why round 0's candidate accepted all seven flag shapes."
  - "Sink 4 lands HERE rather than being filed as a residual against two wave-1 plans that had already landed. A residual owned by finished work has no owner."
  - "MIN_WIN moves and the collapse stays. The alternative — deleting a built, tested, documented feature to resolve a one-constant contradiction — was rejected; it also leaves the app unusable below 1280 on 1366x768 laptops."

patterns-established:
  - "Pattern: a per-spawn capability is minted at the PTY choke point and released from releaseHookToken, which every teardown path already calls — a second release method is a second thing to forget at a fourth teardown path added later"
  - "Pattern: a reject log is a DIAGNOSIS, not a status line — it names the likely cause first and never echoes the identity the payload claimed"
  - "Pattern: a guard on a polled loop carries its own throttle timestamp rather than sharing another subsystem's counter, so neither rejection's rate hides the other"

requirements-completed: [GATE-01, FLOOR-09, FLOOR-13]

duration: 27min
completed: 2026-08-22
---

# Phase 01 Plan 25: The OTLP collector's identity model, the argv-safe session id, and the reachable window floor — Summary

**The telemetry endpoint that any agent's Bash tool could `curl` now demands a per-agent capability it cannot forge, attributes every batch to the token rather than the payload, keys spend by the (agent, session) pair, refuses a flag-shaped resume id at all four sinks including the hook writer that git-commits it, and drops the window floor to 960 so the sidebar collapse the app already shipped is finally reachable.**

## Performance

- **Duration:** 27 min across two sessions (the first died to an API connection drop after task 2)
- **Started:** 2026-08-22T15:52:45Z (first commit, `a85298a`)
- **Completed:** 2026-08-22T16:18:42Z (last code commit, `e7efc3f`)
- **Tasks:** 3 of 3, each RED then GREEN
- **Files modified:** 8 (1 created, 7 modified) — exactly the plan's `files_modified`, nothing else

## Task Commits

| # | Task | Gate | Commit |
|---|---|---|---|
| 1 | The collector issues its own credential, derives who is calling, keys by the pair | RED | `a85298a` |
| 1 | " | GREEN | `e37833e` |
| 2 | Every Claude PTY exports its own telemetry credential on the per-signal header vars | RED | `7a6a3b2` |
| 2 | " | GREEN | `1b006b2` |
| 3 | Refuse a flag-shaped resume id at all four sinks; lower the window floor and correct the docs | RED | `f2c831a` |
| 3 | " | GREEN | `e7efc3f` |

No REFACTOR commit: none of the three GREENs left duplication or a shape worth changing, and a refactor commit that changes nothing is noise.

## What actually shipped, per task

Tasks 1 and 2 landed in an earlier session. Everything below was re-derived from `git show` and
re-measured in THIS session — including both RED states, re-executed live from their own commit
trees (`git archive <red-commit> | tar -x` into a scratch tree, run with `NODE_PATH` pointed at this
repo's `node_modules`). Nothing here is copied from the plan's intent or from a prior claim.

### Task 1 — `src/main/telemetry.ts` (+138 / -13), `test/runtime-forget.test.cjs` (+7 / -4)

- **The credential.** A private `otelTokens: Map<token, agentId>` on `TelemetryCollector`, with
  `mintAgentToken(agentId)` (`randomBytes(32).toString('hex')`) and a token-exact
  `revokeAgentToken(token)`. Not the hook token, and no injected `HookServer` resolver.
- **The gate.** `handleRequest` resolves `x-hive-otel-token` **before the body is consumed and before
  anything is parsed**, and `refuse(res)` answers 401. `agentForToken` returns null on an absent
  header, on an unknown/stale token, and on an **empty registry** — fail closed, stated in the
  comment. `refuse` increments `rejected`, logs at most once per 10 s, never prints the payload's
  claimed identity, and leads with the diagnosis that matters (*the Claude Code SDK is not forwarding
  the per-signal OTLP header vars … this floor has NO live cost telemetry at all*). `rejectedCount`
  is exposed read-only.
- **The attribution.** `ingestMetrics(body, authAgentId?)` / `ingestLogs(body, authAgentId?)`, both
  called with the token-derived id. Inside, `authAgentId ?? (str(attrs['agent.id']) || str(resAttrs['agent.id']))`
  — both claim reads are behind the fallback, and the comment names `handleRequest` as the only
  caller that matters.
- **The key.** Exported `sessionKey(agentId, sessionId)` joining with the six-character escape
  `\u0000`. All **five** `this.sessions` sites route through it: `forget()`, both sites in
  `session()`, and both in `aggregateLive()`. `agentSessions` still holds **raw** session ids and the
  emitted sample still carries the raw `sessionId` — it is the `--resume` key and the ledger's dedup
  key.
- **The header.** The `Transport posture mirrors slack.ts` sentence is replaced by the capability
  model plus the two ceilings it does not close (no replay window, no body signature; the token lives
  in the agent's own environment — `REQUIREMENTS.md:569`, GATE-01's own recorded residual). The two
  following sentences survive verbatim, including *"deliberately free of any `electron` import so it
  can be smoke-tested as a plain Node module"*.
- **`test/runtime-forget.test.cjs`** was migrated in the same RED commit: its three raw-key probes go
  through the exported `sessionKey('jim', 'old' | 'live')`, so the separator has one definition. Every
  assertion the file made, it still makes.

**RED, re-executed live this session from `a85298a`'s tree:** 15 tests, **0 pass, 15 fail** —
`9 × TypeError: collector.mintAgentToken is not a function`, `1 × TypeError: sessionKey is not a
function`, `1 × AssertionError: an untokened peer must be refused`, `1 × AssertionError: deleting the
false sentence is not a passing implementation — the header must state what IS true`, and 3 strict
equality failures (the forged-spend and forged-`api_error` attributions landing on `victim`).

**The injectivity control, quoted from `test/telemetry-auth.test.cjs:250-259`** — it does not name the
separator, and it is the only assertion in the file that can fail for a wrong one:

```js
assert.notStrictEqual(sessionKey('a', 'b c'), sessionKey('a b', 'c'));
assert.notStrictEqual(sessionKey('a', 'bc'), sessionKey('ab', 'c'));
```

### Task 2 — `src/main/pty.ts` (+72 / -5), `src/main/index.ts` (the wiring)

The telemetry token is an exact sibling of the hook token at all six sites: the `otelToken?: string`
field on `PtySession`; the `mintOtelToken` / `revokeOtelToken` thunks; `setOtelTokenSource(mint,
revoke)`; the release; the mint; and the never-started teardown revoke. It is minted only when the
spawn has **both** an `AGENT_ID` and an `OTEL_EXPORTER_OTLP_ENDPOINT` — a credential with no consumer
is not minted.

The env spread sets, **last**, `OTEL_EXPORTER_OTLP_METRICS_HEADERS` and
`OTEL_EXPORTER_OTLP_LOGS_HEADERS`, both `x-hive-otel-token=<token>`. The generic
`OTEL_EXPORTER_OTLP_HEADERS` is never assigned; the reasoning (every SDK, every signal, every
grandchild → an agent's own OTel→vendor config would post our header off-box) is written into the
comment, and the comment is why that task's gate strips comment lines before testing the negative.

`index.ts` wires `ptyManager.setOtelTokenSource((agentId) => telemetry.mintAgentToken(agentId),
(token) => telemetry.revokeAgentToken(token))` immediately after `setHookTokenSource`, where both
objects are already constructed.

**RED, re-executed live this session from `7a6a3b2`'s tree:** 22 tests, **16 pass, 6 fail** — the six
new PTY-env cases. The seventh (*"a PtyManager with no otel-token source spawns cleanly and exports
neither key"*) passed at RED and is expected to: with no source wired there is no header either way.
It is a negative control, not evidence of work.

### Task 3 — `src/main/transcript.ts` (+31 / -2), `src/main/index.ts`, `src/main/hooks.ts` (+23 / -1), `DESIGN.md` (2 / 2)

`SPAWN_SAFE_SESSION_ID = /^(?![-_])[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/` — exported from
`transcript.ts` with both jobs written into its docstring. `VALID_SESSION_ID`'s **pattern is
byte-identical**; only the `export` keyword is new (see Deviations).

**The measured table, asserted row for row in `test/telemetry-auth.test.cjs` and passing:**

| input | B: `SPAWN_SAFE_SESSION_ID` | A: `/^[A-Za-z0-9_-]{1,128}$/` (round 0) | C: `VALID_SESSION_ID` |
|---|---|---|---|
| `--dangerously-skip-permissions` | false | **true** | true |
| `--print` | false | **true** | true |
| `--permission-mode` | false | **true** | true |
| `--continue` | false | **true** | true |
| `--strict-mcp-config` | false | **true** | true |
| `-c` | false | **true** | true |
| `-` | false | **true** | true |
| `_leading` | false | true | true |
| `x" & whoami & "` | false | false | false |
| `550e8400-e29b-41d4-a716-446655440000` | true | true | true |
| 128 × `a` | true | true | true |
| 129 × `a` | false | false | true |
| 200 × `a` | false | false | true |
| `sess_01-ABC` | true | true | true |
| `` (empty) | false | false | false |
| `a-b` | true | true | true |

Candidate A is kept in the suite as a **live control**, not as prose: the test asserts it accepts all
seven flag shapes, so the fix can never become vacuous. The subset control asserts that every input
passing B also passes C, plus that at least one input passes C and fails B — the narrowing is real,
not nominal.

**The four sinks:**

| # | Site | Form |
|---|---|---|
| 1 | `index.ts`, Claude branch, after `const sid = explicitSid \|\| …` | `if (sid && !SPAWN_SAFE_SESSION_ID.test(sid)) { warn; if (explicitSid) resumeNotFound = true; } else if (sid && !args.includes('--resume')) {` |
| 2 | `index.ts`, generic branch, after `const sid = typedSid \|\| …` | same shape, placed above `if (sid && rf)` so it also fronts the `else if (sid && rsub)` Codex arm |
| 3 | `index.ts`, breaker beat, before `hive.recordSession(id, sample.sessionId)` | guard + a 60 s-throttled warn (the beat runs every ~30 s) |
| 4 | `hooks.ts`, at `this.hive.recordSession(agentId, p.session_id)` | guard + a warn throttled by `REJECT_LOG_INTERVAL_MS` |

Every edit is anchored on a **statement**, never on a line range. No warning echoes the id: each
prints its length and, at the spawn sinks, its first two characters.

**Sink 4 is driven for real** — a `HookServer` built with a hive whose `recordSession` records its
calls, then `handle()`d with each of the seven flag shapes. RED output, this session:

```
✖ sink 4: a forged hook payload cannot STORE a flag-shaped session id
  AssertionError: nothing flag-shaped reached hive.recordSession
  + [ [ 'a-1', '--dangerously-skip-permissions' ], [ 'a-1', '--print' ], … ]
  - []
```

All seven were being git-committed into `registry.json`, the hive log and the cost ledger. After the
guard: none are, and the negative control (a UUID **is** still stored) passes — sink 4 does not break
ordinary session capture, which is what `--resume` is built on.

**`transcript.ts`'s own behaviour is asserted unchanged, on disk:** with `$HOME`/`$USERPROFILE`
pointed at a temp tree, a 200-character id and a `_leading` id both still `seedSessionTranscript()`
to `true` and still `resolveSessionCwd()` to their cwd — while the argv guard refuses both. Round 0's
"just bound the shared regex at {1,128}" would have broken both.

**The window floor.** `MIN_WIN = { width: 960, height: 800 }`, with the reasoning in the comment
above it. `DEFAULT_WIN` unchanged at 1440×900 — this changes what the operator may drag to, not what
the app opens as. `:2670-2671` and `clampBounds` untouched: `minWidth:\s*\d` is still **0 hits** and
`minWidth: MIN_WIN.width` still **1**. `DESIGN.md`'s two sentences were edited **in place** —
`git diff --numstat DESIGN.md` → `2  2  DESIGN.md`, so the line numbers three live sites cite are
undisturbed for plan 01-29. The second sentence's stale second clause was corrected in the same edit:
`App.tsx:519-528` renders a right-edge overlay at `z-index: 2`, not a bottom drawer.

## Verification — every command executed in THIS session

| Check | Result |
|---|---|
| `gsd-tools verify artifacts .../01-25-PLAN.md` | `all_passed: true`, **6 / 6** (was 0/6 at HEAD) |
| `gsd-tools verify key-links .../01-25-PLAN.md` | `all_verified: true`, **4 / 4** (was 0/4 at HEAD) |
| `node --test test/*.test.cjs` (full suite) | **603 tests / 597 pass / 0 fail / 6 skipped** |
| Delta vs the stated live baseline 593 / 587 / 0 / 6 | **+10 tests, +10 pass, 0 fail, skipped unchanged** — all ten are task 3's |
| `npm run typecheck` (node + web) | clean, 0 errors |
| `npx eslint . --max-warnings 0` | exit 0 |
| Task 1 verify: `node --test telemetry-auth + runtime-forget + claude-account-failover + claude-accounts` | 66 / 66 pass |
| Task 3 verify: `node --test telemetry-auth + transcript-project-dir + net-binding` | 86 tests / 84 pass / 0 fail / 2 skipped |
| Task 1 `<done>` predicate (`this.sessions` ≥ 5, `sessionKey(`, `writeHead(401)`) | exit **0** |
| Task 2 `<done>` predicate (both per-signal vars, generic var never assigned) | exit **0** |
| Task 3 `<done>` predicate on `index.ts` (≥ 4 refs, `width: 960`, no `minWidth:\s*\d`) | exit **0** |
| Task 3 `<done>` predicate on `hooks.ts` (≥ 2 refs in CODE) | exit **0** |
| `grep -c setOtelTokenSource src/main/index.ts` | **1** |
| `grep -c 1280 DESIGN.md` / `grep -c 960 DESIGN.md` | **0** / **2** |
| `git diff --numstat DESIGN.md` | `2  2` — equal, line count unchanged |
| 01-24's three prohibitions in `hooks.ts` (`canonicalSpelling`, `server.maxConnections`, `conn.destroy(`) | **0 / 0 / 0** |
| `git diff --name-only 2f3533e..HEAD` | exactly the 8 declared files; `claude-account-failover.test.cjs` and `claude-accounts.test.cjs` are **not** named |
| `git diff --diff-filter=D --name-only HEAD~1 HEAD` | empty — no file deleted |

**The `hooks.ts` diff, in full, because this plan is a guest in 01-24's file** — `+23 / -1`, confined
to one import, one throttle timestamp beside the existing `REJECT_LOG_INTERVAL_MS`, and the
`recordSession` call site:

```
+import { SPAWN_SAFE_SESSION_ID } from './transcript';
...
 const REJECT_LOG_INTERVAL_MS = 10_000;
+/** Last time sink 4 … refused to STORE an id that is not argv-safe. Its own
+ *  timestamp rather than `authorized()`'s counters … */
+let lastSessionRejectLog = 0;
...
-    if (agentId && p.session_id) this.hive.recordSession(agentId, p.session_id);
+    // Sink 4 of 4 (plan 01-25) — the WRITER validates as well as the reader. …
+    if (agentId && p.session_id) {
+      if (SPAWN_SAFE_SESSION_ID.test(p.session_id)) this.hive.recordSession(agentId, p.session_id);
+      else if (Date.now() - lastSessionRejectLog >= REJECT_LOG_INTERVAL_MS) { … }
+    }
```

`node --test test/net-binding.test.cjs` passes with 01-24's counters unmoved — the new rejection
carries its own timestamp precisely so neither rate can hide the other.

**Read by hand, as the plan's `<verification>` requires:** the collector's reject path cannot throw
out of `req.on('end')`. `refuse()` is called from `handleRequest`'s synchronous prologue, before any
listener is attached, and its `res.writeHead(401); res.end()` is inside a `try`. A test drives it:
*"the listener survives a reject — a 401 does not throw out of the socket"*, which posts an
authenticated batch on the same collector afterwards and gets 200.

## Deviations from Plan

### Auto-fixed / argued

**1. [Rule 3 — Blocking] `VALID_SESSION_ID` gained the `export` keyword**
- **Found during:** Task 3
- **Issue:** The plan mandates a subset control asserting every `SPAWN_SAFE_SESSION_ID` pass also
  passes `VALID_SESSION_ID`, and forbids touching the latter. It was module-private, so the control
  was unsatisfiable without re-declaring a copy of the regex in the test — which is the "two
  definitions" failure the plan spends a paragraph banning for the session-key separator.
- **Fix:** Added `export`. **The pattern is byte-identical** (`/^[A-Za-z0-9_-]+$/`) and every
  behaviour of `seedSessionTranscript` / `resolveSessionCwd` is unchanged, asserted on disk.
- **Files:** `src/main/transcript.ts` — **Commit:** `e7efc3f`

**2. [Argued] Sinks 1-3 are pinned STRUCTURALLY, not behaviourally**
- **Found during:** Task 3
- **Issue:** The plan asks for behavioural assertions on the two spawn branches. They live inside
  `spawnAgentCore` in `src/main/index.ts`, which imports `electron` at module scope, runs
  `initFileLogging()` and `crashReporter.start()` at load, and cannot be required by the test
  harness. `test/main-hardening.test.cjs:5-8` states the same limit for the same file.
- **Fix:** The decision those sinks make — the shape test — is asserted exhaustively and
  behaviourally (16-row table, 7 flag shapes, subset control, both `transcript.ts` controls on real
  disk). Their PLACEMENT is asserted against the comment-stripped source **with ordering**: the guard
  must appear between the `const sid` statement and the argv push, per branch, using the
  `readStripped` idiom `test/repo-claims.test.cjs` already applies to this file. This is weaker than
  a behavioural assertion and is labelled as such in the test file's own header.
- **What it does NOT prove:** that a well-formed `sid` still produces byte-identical argv on all
  three forms. The guard is a pure prefix `if`/`else if` over the untouched original branches, and
  typecheck plus the full suite are green, but no test executes `spawnAgentCore`. Recorded below as
  an open measurement.
- **Files:** `test/telemetry-auth.test.cjs` — **Commit:** `f2c831a`

**3. [Argued] Sink 3's refusal log is throttled at 60 s; sink 4's shares `REJECT_LOG_INTERVAL_MS`**
- **Found during:** Task 3
- **Issue:** The plan says "warn on every refusal". Sink 3 sits in the ~30 s breaker beat: one
  poisoned id would print two lines a minute forever. The plan itself mandates throttle discipline
  for the `hooks.ts` warning.
- **Fix:** Sink 3 carries `UNSAFE_SID_LOG_INTERVAL_MS = 60_000` + `lastUnsafeSidWarn` at module scope
  in `index.ts`; sink 4 carries `lastSessionRejectLog` beside `hooks.ts`'s existing interval
  constant. Deliberately NOT `authorized()`'s `rejected` / `lastRejectLog`, because the plan's own
  `<done>` requires 01-24's counters to stay unmoved and the two rejections have different causes.
  This is one line more in `hooks.ts` than the plan's "one guard statement, one import, one comment".
- **Files:** `src/main/index.ts`, `src/main/hooks.ts` — **Commit:** `e7efc3f`

**4. [Rule 2 — Missing critical] A refused EXPLICIT session id sets `resumeNotFound`**
- **Found during:** Task 3
- **Issue:** When a user types a session id into the Add Agent dialog and it is refused, the spawn
  falls back to a fresh session. Without the flag the dialog would claim it resumed.
- **Fix:** `if (explicitSid) resumeNotFound = true;` (Claude branch) / `if (typedSid)` (generic),
  mirroring the existing "not found in any Claude project dir" arm exactly.
- **Files:** `src/main/index.ts` — **Commit:** `e7efc3f`

**5. [Plan-permitted choice] The telemetry release lives inside `releaseHookToken`**
- The plan allowed either a twin method or a release inside that body. Inside was chosen because
  `releaseHookToken` is already called from every path that drops a session; a twin is a second thing
  to forget at a fourth teardown path added later. The method name is unchanged — `hive.ts` cites it
  by name in two comments. **Commit:** `1b006b2`

**6. [Plan-anticipated] `test/pty-env.test.cjs` does not exist**
- The plan's task-2 `<verify>` names it and instructs us to say which route was taken. It does not
  exist in this repo (`ls` confirms). The env-shape cases live in `test/telemetry-auth.test.cjs`, and
  the verify command drops the second file.

---

**Total deviations:** 6 (1 blocking, 1 missing-critical, 2 argued, 2 plan-permitted choices).
**Impact:** No scope creep. Deviation 2 is the only one that lowers evidence strength, and it is
named as an open measurement rather than absorbed.

## Residuals — named, with anchors

1. **`hive.recordSession` still validates only `!root || !sessionId`** (`src/main/hive.ts:1143-1156`)
   before writing `registry.json`, appending the log and `commit()`ing. After sinks 3 and 4 it has
   **no caller that can hand it a flag-shaped id** — `grep -rn recordSession src/` returns exactly
   those two call sites, both now guarded — so this is **defence in depth, not an open hole**. The
   one-line fix is `SPAWN_SAFE_SESSION_ID.test()` at the top of `recordSession`; `hive.ts` is plan
   01-26's file and a second editor under `use_worktrees: false` is a lost update. **Owner: 01-31's
   residual register.**
2. **A poisoned id already stored in `registry.json` before this landed is now refused forever.**
   `hive.lastSession(id)` returns it and sinks 1/2 reject it, so that agent's `--resume` silently
   stops working. Sink 4 stops new poisoning; it does not clean existing state. **Recovery path:**
   run the agent once without resume (or clear its `sessionId` in `registry.json`) — the next hook
   payload records a fresh, well-formed id. Not introduced here; surfaced here.
3. **The account-pool blast radius is unchanged.** Deriving `agentId` from the token stops agent A
   naming `victim` in an `api_error`. It does **not** stop A forging a 401 for **itself**, which
   `accountPool.ts:257` turns into `markDead` + `failover` for every sibling on the same Claude
   account. Named in the plan's threat model as `reduce`, not `mitigate`.
4. **Same-uid environment read.** Both credentials live in the agent's own environment; a same-uid
   sibling reads `/proc/<pid>/environ` on Linux. This is GATE-01's own recorded ceiling
   (`REQUIREMENTS.md:569`), restated in `telemetry.ts`'s header rather than papered over.

## MEASUREMENT UNAVAILABLE — not verified, must not be read as verified

1. **Whether a real `claude` child forwards `OTEL_EXPORTER_OTLP_METRICS_HEADERS` /
   `OTEL_EXPORTER_OTLP_LOGS_HEADERS`.** The round-trip test proves the collector accepts the header
   the app *exports*; it cannot prove the Claude Code SDK *sends* it. If it does not, telemetry goes
   dark floor-wide — cost ledger, resume key, all breaker cost arms and account failover. **What the
   operator should look for:** the throttled line `[hive] OTLP batch REJECTED (missing or unknown
   x-hive-otel-token) — N refused so far…` in the main log within a minute of the first Claude agent
   spawning. If it appears for every batch, the SDK is not forwarding the per-signal vars.
2. **Whether the app is usable at a 960-wide window.** Arithmetic only; see below. No operator has
   dragged the shipped window there.
3. **Whether a well-formed `sid` still yields byte-identical argv on all three resume forms.** See
   deviation 2 — `spawnAgentCore` is not reachable from the test harness.

## Accepted consequences of MIN_WIN 1280 → 960, restated

None is a defect introduced here; each is a previously unreachable geometry becoming reachable **only
when the operator deliberately drags the window there**. The app still opens at 1440×900.

| Site | At 960 | Disposition |
|---|---|---|
| `IdePanel.tsx:108` `treeWidth = 424`, `flexShrink: 0` | Monaco gets 960 − 424 − 4 = **532 px**; side-by-side diff **266 px/pane** | Accept. The drag clamp is 200..520, so one drag recovers it. No plan owns the file; re-measuring the default at 960 is a follow-up. |
| `scene/office/Camera.ts:44-47` `getMinZoom` | width is the binding term → minimum zoom falls **25 %**; `ThoughtBubble` is already a designed 7 px inside `RENDER_SCALE = 0.5`, so the extreme floor renders ~5.25 px | Accept, **against FLOOR-12**. `REQUIREMENTS.md:565` already records the RENDER_SCALE halving as an open FLOOR-12 residual; this widens one end of the range without changing the default. `test/repo-claims.test.cjs:646-665` asserts the source constant and stays green — that green tick does **not** mean the text is legible. |
| `AddAgentModal.tsx:451-452` `width={940}`, `maxWidth="95vw"` | 95vw = 912 < 940 → crosses its clamp for the first time; content pane ≈ 712 around a fixed 168 px nav | Accept. Degraded, not broken. No plan owns the file. |
| `SettingsModal.tsx:746` 840 / 92vw = 883 | unchanged | No action. |
| `OnboardingWizard.tsx:245` 640 / 94vw = 902 | unchanged | No action. |
| `store.ts:579/:872` sidebar 420, clamp 320..1200 | overlay renders at `min(420, 960 − 48)` = 420 | No action. |
| `SidebarTabs.tsx:63-66`, `SkillsTab.tsx:242-252/:320-331` | sidebar width unchanged; all three already carry `minWidth: 0, overflow: hidden` | No new clipping. |
| `index.ts` `clampBounds` | a persisted 1000×800 bounds was silently widened to 1280 and is now restored at 1000 | **Intentional.** The first launch after this update restores a geometry the app used to override. |
| Splitter re-clamp persisting a shrunken width across the newly reachable 1024-1279 band | not fixed here | **Delegated to plan 01-29 task 3** (renderer files + renderer test file). Cross-referenced in both plans so neither assumes the other did it. |

Four `1280` comments outside `DESIGN.md` (`SidebarSplitter.tsx:31`, `SidebarTabs.tsx:55`,
`SkillsTab.tsx:245/:323`, `IdePanel.tsx:108`) record measurements taken at 1280/1024/800. They remain
true statements about what was measured and are deliberately not rewritten.

## Threat Flags

None. Every surface this plan adds — the 401 path, the token registry, the two header vars, the four
guards — is inside the plan's own `<threat_model>`. No new network endpoint, auth path, file access
pattern or schema change at a trust boundary was introduced outside it.

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired component was introduced.

## Issues Encountered

- The first executor session died to an API connection drop after task 2's GREEN. The working tree
  was clean and the suite green, so this session resumed at task 3 without redoing anything — and
  re-executed both earlier RED states from their own commit trees rather than trusting the record.
- `perl -i -pe 's/…$/…/'` did not match either `DESIGN.md` sentence: the working copy is CRLF, so `$`
  sits before the `\r`. The file was left byte-identical by the failed attempt (`git diff --numstat`
  empty) and the two edits were made with an exact-string editor instead.
- **`STATE.md` and `ROADMAP.md` were updated BY HAND, deliberately, without the SDK's state-writing
  verbs.** `gsd-tools state advance-plan` counts SUMMARY files against a plan total it does not know
  (23 vs 31), increments blindly in a wave that does not run in plan order, and has already
  overwritten this phase's PARTIAL verdict once — STATE.md's own Current Position block records that
  revert. Running a verb known to clobber and then repairing by hand is strictly worse than editing
  by hand, so: `completed_plans` 25 → 26 (`ls …/*-SUMMARY.md | wc -l` = 26, counted off disk),
  `stopped_at` rewritten, the metrics row added in plan order, three decisions appended, the ROADMAP
  checkbox ticked and its progress row moved to 26/31. **The PARTIAL verdict line is untouched.**
  `.planning/REQUIREMENTS.md` was NOT touched — plan 01-31 owns it, so GATE-01 / FLOOR-09 / FLOOR-13
  are recorded in this SUMMARY's `requirements-completed` for 01-31 to close there.

## Next Phase Readiness

- Wave 2 of the gap-closure set: **01-25 is done.** Its shared file `src/main/hooks.ts` is left with
  01-24's `(dev, ino)` identity work untouched and all three of its prohibitions still at 0.
- **01-29 must not be skipped:** it owns the splitter-persistence fix that MIN_WIN 960 makes
  reachable, and the `DESIGN.md` line-number citations in `sidebarLayout.ts:21/:34` and
  `test/renderer-runstate.test.cjs:183` — this plan kept the file's line count identical precisely so
  that work stays valid.
- **01-31 must add residual 1** (`hive.recordSession` defence in depth) to its register; it was
  previously filed against two already-landed plans and had no owner.
- Phase 01 remains **PARTIAL**. Nothing here changes the operator-blocked phase verdict recorded in
  `01-23-SUMMARY.md`.

---
*Phase: 01-finish-the-floor*
*Completed: 2026-08-22*

## Self-Check: PASSED

All nine declared files exist on disk; all six task commits exist in `git log --oneline --all`
(`a85298a`, `e37833e`, `7a6a3b2`, `1b006b2`, `f2c831a`, `e7efc3f`). No claim in this SUMMARY rests on
a command that was not executed in this session.
