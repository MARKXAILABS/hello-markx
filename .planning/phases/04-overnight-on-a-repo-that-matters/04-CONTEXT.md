# Phase 4: Overnight on a Repo That Matters - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning
**Mode:** `--auto` (yolo) + advisor calibration `standard` (USER-PROFILE `Vendor Philosophy:
pragmatic-fast`; `NON_TECHNICAL_OWNER = false`). Every gray area was auto-selected and resolved to
its recommended option.

**How the research was done, stated plainly so the audit trail is honest.** Phase 2's CONTEXT.md was
built by four parallel advisor-researcher subagents whose claims the orchestrator then re-verified
against source -- and seven of those claims did not survive that check. This session's operating
directive forbade spawning subagents, so the advisor step was executed **inline by the orchestrator
directly against live source**. That removes the re-verification round trip rather than the
verification: every load-bearing claim below cites a file and a line that was read in this session.
Nothing here is inherited from a prior SUMMARY, a prior CONTEXT, or from the requirement text itself.

**Measured baseline at `d338b66` (Windows 11, this machine, 2026-08-24):**
`npm test` -> **800 tests / 793 pass / 0 fail / 7 skipped** (24.2 s). `npm run typecheck` -> **0
errors** (both `tsconfig.node.json` and `tsconfig.web.json`). Every number in this document was
produced by a command run in this session.

> WARNING -- **MEASUREMENT CAVEAT, recorded rather than smoothed over.** The FIRST `npm test` of this
> session went red on `test/repo-claims.test.cjs:1367` (`PARITY-03: the LIVE-UNVERIFIED ledger is
> pinned...`, expected 5 markers in `src/main/hiveProvisioning.ts`, found 4). It is not a regression
> and not a flake in the ordinary sense: `ls --time-style=full-iso` shows **both**
> `src/main/hiveProvisioning.ts` and `test/repo-claims.test.cjs` were rewritten at
> `2026-08-24 17:12:26`, i.e. *between* the two runs. Another session is executing **plan 02-12** (the
> Phase 2 phase-close plan, which STATE.md lists as the single outstanding plan, and whose declared job
> is "the final PARITY-03 ledger pin" -- the test block self-identifies as `02-12 (wave 9)` at
> `test/repo-claims.test.cjs:1249`). The clean re-run is green and
> `node --test test/repo-claims.test.cjs` passed 28/28 on three consecutive runs.
> **Two consequences the planner must carry:** (1) the green baseline above was taken against a tree
> with uncommitted in-flight 02-12 work, so it must be re-measured at Phase 4 execution start rather
> than quoted from here; (2) **Phase 4 execution must not begin while 02-12 is in flight** -- a second
> writer in `test/repo-claims.test.cjs` and `src/main/hiveProvisioning.ts` breaks the disjoint
> file-ownership discipline that is this repo's proven method.

<domain>
## Phase Boundary

The floor can be left running unattended on a repository whose contents matter. Eleven requirements:
**GATE-02, GATE-03, GATE-04, GATE-05, RECORD-01, RECORD-02, RECORD-05, VIGIL-01, VIGIL-02, VIGIL-03,
VIGIL-04.**

Three properties, and they are the phase's only scope:

1. **Blast radius bounded in main, on every engine** -- not in one engine's settings file (GATE).
2. **A record that is still on disk after a crash, and a day that reads back whole** (RECORD).
3. **A floor that treats *nothing happening* as an event** (VIGIL).

**Not in this phase, stated so the boundary holds:** GATE-01 (landed Phase 1), RECORD-03 and
RECORD-04 (landed Phase 1 as FLOOR-10's arithmetic prerequisites), SCALE-03's replay *UI* (Phase 3 --
Phase 4 owns only the storage that replay reads), VERDICT, RECALL, STANDING, GSD and DESK
(Phases 5-6).

**WARNING -- THE ROADMAP AND REQUIREMENTS FILE:LINE CITATIONS FOR THIS PHASE ARE SYSTEMATICALLY STALE,
AND A PLAN THAT QUOTES THEM WILL POINT AT THE WRONG CODE.** REQUIREMENTS.md's GATE/RECORD/VIGIL rows
were written before Phase 2's STRUCT-01/STRUCT-02 extractions landed. Measured this session:
`src/main/floor/` now exists (`boot.ts` 1,220 - `deps.ts` 114 - `headless.ts` 66 - `lifecycle.ts` 254),
`src/main/index.ts` is **4,967** lines (was 5,812 at Phase 2 discuss), `src/main/hive.ts` is **2,821**
lines (was 4,121), and `gitCommitter.ts`, `hiveProvisioning.ts`, `hiveTemplates.ts`, `cloudflared.ts`,
`tunnel.ts` and `push.ts` are new files carved out of the two god-files. The corrected location for
**every** seam this phase touches is in the canonical_refs section below; each was opened and read in
this session. Re-measure before quoting, per the standing evidence rule.

</domain>

<decisions>
## Implementation Decisions

### The trust boundary -- where a tool call is judged (GATE-03, GATE-05)

- **D-01:** **GATE-03 AND GATE-05 ARE THE SAME SEAM, AND THE PLAN MUST TREAT THEM AS ONE.** Measured:
  `ControlRegistry.toolDecision(id, tool)` at `src/main/control.ts:97` is the only per-tool-call
  verdict in main, it is **synchronous**, it returns `{ deny: boolean; reason?: string }`, and it
  inspects **only** `paused` and `gatedTools` -- it never sees the command string. GATE-03 needs it to
  judge the string; GATE-05 needs it to have a third answer and an await. Two plans editing that one
  function in two ways is a merge conflict by construction. Slice them as one owner, or strictly
  sequence them.

- **D-02:** **DO NOT BUILD A NEW RULE ENGINE. Widen the gate that already exists, which is
  `HookServer.protectedPathDenial` -- not `AGENT_DENY_RULES`.** Measured, and the source argues this
  case itself. `protectedPathDenial` (`src/main/hooks.ts:860`) already: runs **in main**; is reached
  by every hook-bridged engine, not just Claude; tokenizes the actual Bash command string (splitting
  on a whitespace-and-shell-metacharacter class); resolves candidates to `(dev, ino)` **identity**
  rather than matching spellings; caps candidate count at `HOOK_CANDIDATE_MAX`; and returns an
  operator-legible reason string. Its own header comment at `hooks.ts:787-800` states the reason it is
  not in `AGENT_DENY_RULES`: *"That list does not exist for the agy/codex/grok engines that reuse this
  very shim, and its Bash(...) rules are prefix matches on the command string. This gate is strictly
  wider on both axes and lives at the choke point every hook-bridged engine already routes through."*
  That is GATE-03's thesis, already written in the codebase, with the mechanism already built. GATE-03
  is **widening its predicate** from "is this target a protected hive path" to "is this command one of
  the four unrecoverable shapes", not authoring a second gate.

- **D-03:** **`AGENT_DENY_RULES` STAYS, AS DEFENCE IN DEPTH -- it is not deleted and not the answer.**
  Measured at `src/main/hiveProvisioning.ts:63` (**moved from `hive.ts`**; the requirement's "one
  engine's settings file" framing is accurate, its implied location is not). Its own comment concedes
  the ceiling: *"PREFIX matches on the command string: a model that wants past them writes a shell
  script, or varies the spacing. This stops the confident accident -- the failure that actually happens
  -- not a hostile model."* Keep it: it is the only rule surface that survives
  `--permission-mode bypassPermissions` inside Claude's own process, so it fires before a hook round
  trip. But **no success criterion may be marked green on its behaviour**, because it is written into
  exactly one engine's settings file.

- **D-04:** **THE FOUR COMMAND SHAPES ARE JUDGED SEMANTICALLY, NOT BY PREFIX, AND THE CEILING IS
  WRITTEN DOWN.** Criterion 1 names `sh -c "rm -rf ..."`, `git push origin +main`, `curl ... | sh`, and
  a fetch to a host outside an allowlist. Follow `protectedPathDenial`'s established discipline rather
  than inventing a style: judge the **tokenized** command, not a prefix; prefer identity/normalization
  over enumerating spellings; and extend the existing honest **ceiling list** (`hooks.ts:800-859`,
  items (a)-(i)) with this gate's own gaps. That list is a house pattern, not decoration --
  `hooks.ts:848` states *"A ceiling list that omits (b), (f) or (g) reads as a guarantee that does not
  hold."* At minimum the new ceiling must name: runtime-assembled command strings, `cd`-then-relative
  invocation, and a harness home containing a space (the tokenizer splits on whitespace, which turns
  the Bash arm off entirely for that operator -- pre-existing, item (b)).

- **D-05:** **THE HOST ALLOWLIST IS DENY-BY-DEFAULT WITH AN OPERATOR-EDITABLE ALLOW SET, AND ITS
  EMPTY STATE MUST BE DECIDED EXPLICITLY.** A fetch to a host "outside an allowlist" presumes an
  allowlist exists. Ship a default allow set covering what the floor's own agents already need
  (package registries, the engines' own API hosts, the git remote) and make it operator-editable.
  **An empty or unreadable allowlist must fail CLOSED and say so loudly** -- `protectedPathDenial`'s
  item (i) records the opposite disposition (`if (!root) return null;` -> allow) as an *accepted*
  fail-open, and the whole reason it is written down is that an unrecorded fail-open in a security
  gate gets re-discovered as a finding two phases later. Decide this one in the plan, in writing.

### The engines the gate actually reaches (GATE-03) -- the honesty clause

- **D-06:** **CRITERION 1'S FOUR ENGINES DO NOT HAVE FOUR EQUAL PATHS, AND THE PLAN MUST NOT PROMISE
  THEM AS ONE.** Criterion 1 requires refusal "for a Codex, a Grok, a pi and an OpenCode agent".
  Measured, per engine:
  - **Codex and Grok -- reachable today.** Both are hooks-kind bridges
    (`src/shared/agentProvider.ts:287`, `:321`) whose shims reuse `HOOK_SHIM`'s response contract:
    `src/main/hiveTemplates.ts:343-346` opens a connection, **reads the server's reply**
    (`c.on('data', ...)`), and writes it to stdout. A deny returned by main is honoured. `AGY_HOOK_SHIM`
    documents translating a `permissionDecision` of deny into agy's own contract (its header comment,
    cited again at `hooks.ts:457`).
  - **pi -- mechanically buildable, but the bridge is fire-and-forget today.** `PI_EXTENSION`
    (`hiveTemplates.ts:425`) calls `post()`, which does `c.end(JSON.stringify(payload))` and **never
    reads a reply**. But pi's own API *does* expose an approval channel -- the handler receives an
    event with `ev.approve()` and its return value is honoured (`hiveTemplates.ts:444-446`). So closing
    GATE-03 for pi is "make `post` a request/response for `PreToolUse` and return the verdict",
    not a new capability. Note the current handler **auto-approves** when `HIVE_AUTO_APPROVE` is `1`;
    that branch is precisely what GATE-03 must gate.
  - **OpenCode -- NOT live-verifiable on this machine, and this is a first-class outcome.**
    `OPENCODE_PLUGIN` (`hiveTemplates.ts:466`) posts `tool.execute.before` fire-and-forget and returns
    nothing, and whether OpenCode's plugin API lets `tool.execute.before` **veto** a call is unknown.
    The file already carries `LIVE-UNVERIFIED (plugin auto-load + session.idle firing need BYOK keys)`
    -- the same PARITY-03 constraint, the same missing paid account. Build the veto path against the
    documented API and **mark it `LIVE-UNVERIFIED`**; do not tick criterion 1's OpenCode clause.
  - **The qwen proxy tier is out of GATE-03's reach entirely** and criterion 1 does not name it --
    `hooks.ts:60-62` records that pi, opencode and the qwen proxy tier have no PreToolUse hook, and
    for the proxy tier there is no tool-call boundary to gate at all.

  **Binding:** the SUMMARY states GATE-03 as *"refused for Codex and Grok (live-verified), for pi
  (built, live-verified if a pi run is possible), and built-but-LIVE-UNVERIFIED for OpenCode"*.
  A SUMMARY claiming all four verbatim would be the exact over-claim this project bans.

- **D-07:** **TWO PRE-EXISTING HOLES ARE INHERITED, NOT OPENED, AND MUST BE RESTATED NOT SILENTLY
  CARRIED.** `hooks.ts:54-62`: (1) the **user-global engine seeds** -- `~/.codex/config.toml`,
  `~/.gemini/.../hooks.json`, `~/.grok/hooks/` -- sit outside the hive root, so an agent appending a
  PreToolUse hook block to a seed gets it executed inside another agent's hook process with that
  agent's env; (2) the shim **fails open** by design (`c.on('error', () => process.exit(0))`,
  and a Claude PreToolUse hook exiting 0 with no stdout is *allow*), bounded by `armSocketWatchdog`
  rather than removed, because a fail-closed shim would break every agent whenever the app is
  legitimately not running. Both are deliberate, both are recorded, and **neither is in Phase 4's
  scope to fix** -- but a GATE-03 SUMMARY that does not name them describes a boundary that is tighter
  than the one that exists.

### The third answer, and its bounded wait (GATE-05)

- **D-08:** **THE BOUNDED WAIT IS TWO-PHASE, AND THIS IS THE PHASE'S SUBTLEST CONSTRAINT.** Measured:
  the shim's wait today is `setTimeout(() => process.exit(0), 5000).unref()`
  (`hiveTemplates.ts:346`) -- **5 seconds, and it times out to ALLOW.** GATE-05 requires a bounded
  wait that times out to **deny**. Flipping that timeout to a deny would also make every socket
  outage, every app restart, and every legitimately-not-running floor deny every tool call on every
  agent -- destroying D-07's deliberate fail-open and, per its own rationale, breaking a normal state.
  **The resolution: the server answers immediately, and the answer selects the wait.**
  1. `PreToolUse` arrives -> main decides allow / deny / ask **synchronously** and replies at
     once. Allow and deny behave exactly as today; the 5 s budget is untouched for them.
  2. Only on ask does main emit an explicit "approval pending, deadline T" reply, and only then
     does the shim enter a **second, longer wait that defaults to DENY on expiry**.
  3. A socket that is gone, refuses, or answers nothing still exits 0 = allow. Fail-open is preserved
     for *"the floor is not running"*; fail-closed is introduced only for *"the floor asked and the
     operator did not answer"*. Those are different failures and must not share a default.

  The two deadlines must be reconciled explicitly in the plan: main's approval TTL has to be shorter
  than the shim's own ceiling, or the shim's ceiling has to be raised for the ask case only. A plan
  that changes one number without the other ships a gate that times out on the wrong side.

- **D-09:** **THE OPERATOR IS ASKED THROUGH THE PHONE SURFACE THAT ALREADY EXISTS. Build no second
  one.** This is the single largest reuse in the phase, and it is Phase 2's dividend. Measured, all
  live in `src/main/webhook.ts`: `PhoneAsk` (`:111`), the injected `openAsks` (`:149`) and
  `answerAsk` (`:152`), `GET /phone/api/asks` (`:634`) and `POST /phone/api/answer` (`:644`), wired in
  `src/main/index.ts:1321-1322`. The trust boundary around them is finished and tested --
  bearer-in-header only, byte-identical auth failures across absent / wrong / burned / expired /
  unknown-route, a phone-specific rate bucket strictly below the global cap, `PHONE_LOCKOUT_FAILURES`
  / `PHONE_LOCKOUT_MS` lockout, and a body cap far below `MAX_BODY_BYTES`. GATE-05's "the operator is
  asked wherever they are, including on the phone" is **publishing into that list**, plus the desktop
  `Notification` path already at `src/main/index.ts:4768` and `floor/deps.ts`'s injected `notify`.
  Web Push (`src/main/push.ts`, 293 lines, dependency-free VAPID) is what reaches a pocket while the
  page is closed.

- **D-10:** **PENDING TOOL APPROVALS ARE AN IN-MEMORY REGISTRY MERGED INTO `openAsks()` -- THEY DO NOT
  BECOME CARDS.** Measured: `openPhoneAsks()` (`src/main/index.ts:1221-1236`) walks the task ledger
  and yields one ask per blocked card with an open `humanQA` entry -- it is **card-derived and keyed
  on `taskId`**. A tool approval has no card, is ephemeral, and expires to deny in seconds. Writing one
  into `tasks.json` would block a real card, would survive its own timeout as a dead question, and
  would put a high-frequency transient into the durable ledger that ADR-0004 has a single committer
  for. So: a separate in-memory pending-approval registry in main, **merged into `openAsks()`'s
  output** behind a discriminator so `GET /phone/api/asks` and the PWA need no new endpoint.
  `PhoneAsk` gains a `kind` field and `answerAsk`'s first argument widens from "task id" to "ask id"
  -- both back-compatible if the card path keeps emitting the task id as its id.

### Blast radius in the child env (GATE-02)

- **D-11:** **ALLOWLIST, NOT DENYLIST, AT THE ONE `pty.spawn` CHOKE POINT.** Measured: every agent
  PTY is spawned from a single env object at `src/main/pty.ts:751`, which opens with a spread of
  `process.env` and then layers `PATH`, `TERM`, locale, the per-agent `opts.env`, and finally the
  per-agent `HIVE_SOCK_TOKEN` and OTLP tokens (deliberately last, so nothing upstream can shadow
  them). One choke point, already commented as such, already ordered -- the fix is a filter applied to
  the base spread, not a new mechanism. **Allowlist, because a denylist cannot converge:** the
  operator's credentials arrive under names this project does not choose (`AWS_*`, `GH_TOKEN`,
  `GOOGLE_*`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `NPM_TOKEN`, anything ending `_SECRET`, and
  whatever the next tool invents), and enumerating an input space someone else chooses is the exact
  reasoning `hooks.ts:815` already rejects for path spellings. Keep what a shell genuinely needs
  (`PATH`, `HOME`/`USERPROFILE`, `TMP`/`TEMP`, `SHELL`, `ComSpec`, `PATHEXT`, `LANG`/`LC_*`, `TERM`,
  `SystemRoot`, `APPDATA`/`LOCALAPPDATA`, `USERNAME`), plus the hive's own variables, and drop the rest.
- **D-12:** **THE ACCEPTANCE TEST IS `env` INSIDE A REAL AGENT TERMINAL, AND IT MUST ASSERT BOTH
  DIRECTIONS.** Per the standing rule inherited as D-33 (a gate that passes because it parsed nothing
  is not a gate): assert the hive's own variables **are present** (a positive lower bound) alongside
  asserting the operator's credentials are absent. A test that only asserts absence passes vacuously
  against a PTY that failed to spawn.
- **D-13:** **WARNING -- REGRESSION HAZARD, NAMED SO IT IS NOT DISCOVERED AT 3AM.** Stripping the env
  is the single most likely way this phase breaks a working floor: the engine CLIs authenticate from
  env vars, `src/main/shellEnv.ts` exists precisely because Electron does not inherit the login-shell
  `PATH`, and `pty.ts:751`'s block already documents locale variables that must survive. Ship the
  allowlist with an operator-visible escape (an additive "also pass through these names" list) and
  verify at least one live agent of a non-Claude engine still authenticates and completes a task
  before this is called done.

### The sandbox that stays on (GATE-04)

- **D-14:** **THE BLOCKER IS A PATH-TREE PROBLEM, SO THE FIX IS WRITABLE ROOTS -- NOT DROPPING THE
  SANDBOX.** Measured at `src/shared/agentProvider.ts:262-272` (**the requirement's `:216-226` is
  stale**): codex ships `autoModeFlag: '--dangerously-bypass-approvals-and-sandbox'`, and the comment
  above it states the whole reason -- *"The earlier `-a never -s workspace-write` confined writes to
  the PTY cwd (the user's project), but a hive worker must also write to its agent folder at
  hive/agents/<id>/ ... a DIFFERENT path tree from cwd, which workspace-write blocked, so codex
  workers couldn't do HIVE PROTOCOL housekeeping."* That is not a security judgement, it is two
  directories. Re-enable `-s workspace-write` and add the agent directory as an additional writable
  root; codex exposes exactly this via its workspace-write writable-roots configuration, and the
  per-agent `CODEX_HOME` this floor already provisions (`hive.ts:999`) is where it goes.
- **D-15:** **PER-ENGINE, OPT-IN, WITH A VERIFIED FALLBACK -- the requirement's own warning is binding
  and is not negotiable down.** Eleven engines, three OSes, different sandbox semantics; the failure
  mode of a floor-wide flip is "the floor silently stops working at 3am", which is worse than the
  failure it prevents. **Deliver exactly one engine (codex is the recommended one -- it is the engine
  whose sandbox was demonstrably dropped for a known, fixable reason, and the comment above names the
  fix).** Criterion 2 asks for "at least one engine". Shipping one engine that provably finishes a
  task, mails, and writes memory with **no write refused** satisfies it; shipping five half-verified
  ones does not.

### The record that survives the crash (RECORD-01, RECORD-02)

- **D-16:** **BOTH REQUIREMENTS RESOLVE TO ONE STORAGE DECISION: SQLite, in the `PersistStore` that is
  already open. The codebase already planned this.** Measured: `src/main/db.ts` (320 lines) already
  owns a better-sqlite3 handle with `kv`, `command_history` and `memory_fts` tables -- and
  `command_history` already carries the exact `(agent_id, ts DESC)` index (`db.ts:77`) that "who wrote
  this file, and what did the floor run overnight" queries need. Decisively,
  `src/main/hive.ts:2512-2516` says of the cost ledger: *"its row is exactly the shape Kevin (#4)
  reserves for the cost_ledger SQLite table, so migration is a mechanical INSERT...SELECT."* The
  migration target is already chosen in the source. Adding a third JSONL file with a bespoke retention
  policy, next to an open database that already indexes by `(agent_id, ts DESC)`, would be the ladder
  failure this project names by name.
- **D-17:** **RECORD-01 IS A NEW WRITER, NOT A BIGGER RING.** Measured: `SPAN_RING_CAP = 200`
  (`src/main/telemetry.ts:161`; **the requirement's `:126` is stale**) and `telemetry.ts:96` states the
  spans live *"only in the in-memory ring buffer, never persisted."* Raising the cap is not the fix --
  a bigger volatile ring is still empty after a crash, which is exactly when the record is wanted.
  Persist every tool call with agent, timestamp, tool and target at the point the span is recorded;
  **keep the ring** as the hot read path for the waterfall UI so nothing on screen regresses.
- **D-18:** **RECORD-02 IS A RETENTION DECISION, AND THE CURRENT BEHAVIOUR IS ONE GENERATION.**
  Measured: `LOG_ROTATE_BYTES = 8 * 1024 * 1024` at `src/main/hive.ts:323` (**the requirement's `:267`
  is stale**), applied at `:2498` by renaming `log.jsonl` over `log.jsonl.1` -- the comment concedes it
  *"keeps recent history without a retention policy."* A day that crosses 16 MB loses its start.
  Move the event log into the same SQLite store so retention becomes a query bound (by day, by
  requirement) rather than a byte window, and keep the `log.jsonl` append as the crash-safe path if the
  plan wants belt-and-braces. **Coordinate with `UNTRACK_PATHS`** (see D-21): `log.jsonl` and
  `log.jsonl.1` are named there and a storage change must keep the hive repo from swallowing the store.
- **D-19:** **RECORD-02 IS SCALE-03'S STORAGE AND MUST BE BUILT AS SUCH -- but Phase 4 does not build
  the replay UI.** The requirement says so verbatim (*"this is the storage SCALE-03's replay reads"*).
  Schema decisions here are load-bearing for a Phase 3 surface; design the table so a day is a range
  scan, and stop at the storage boundary.

### One file back to 02:00 (RECORD-05)

- **D-20:** **A SEPARATE `GIT_DIR` PLUS `GIT_INDEX_FILE` OVER THE OPERATOR'S WORKING TREE. It is the
  only candidate that satisfies the requirement's literal untouched-list.** The requirement forbids
  disturbing the operator's **index, working tree, branches, `git status` and `git log`**. Scored
  against exactly that list:

  | Option | Index | Worktree | Branches | status / log | Verdict |
  |---|---|---|---|---|---|
  | `git stash` | **written** | **modified** | ok | log ok, status churns | Fails two clauses outright |
  | Commit to a shadow branch in the operator's repo | **written** | ok | **new ref** | **both change** | Fails three |
  | Plain file copies under the hive root | ok | ok | ok | ok | Passes, but no dedup -- N snapshots of a real repo is unbounded disk |
  | **Separate GIT_DIR + GIT_INDEX_FILE, same work-tree** | ok | ok | ok | ok | **Passes all five, and content-addressed storage dedups snapshots for free** |

  `git --git-dir=<hive>/restore.git --work-tree=<repo>` with `GIT_INDEX_FILE` pointed inside
  `restore.git` writes objects into a repository the operator's `.git` knows nothing about. Their
  `status` and `log` are byte-identical before and after. It also never touches the operator repo's
  `.git/index.lock`, which matters because **ADR-0004's single-committer rule governs the hive repo,
  not the operator's project repo** -- agents *do* run git there, on their own branches, so a
  restore-point mechanism that took that repo's index lock would contend with live agent work. This is
  the "dotfiles bare repo" technique; it is boring, and boring is the point.

- **D-21:** **THE `UNTRACK_PATHS` DISCIPLINE IS REUSED LITERALLY, AND THE RESTORE STORE IS ADDED TO
  IT.** Measured: `UNTRACK_PATHS = ['cost-ledger.jsonl', 'log.jsonl', 'log.jsonl.1', 'backups']` at
  `src/main/gitCommitter.ts:82` (**moved out of `hive.ts`**), enforced at `:161-163` by
  `git ls-files` plus `git rm --cached -r --ignore-unmatch`, with the matching ignore seed written at
  `src/main/hive.ts:788`. **Note the collision hazard:** `backups` is already taken -- `reflect.ts:263`
  uses `hive/backups/<stamp>/` for memory-condensation generations with its own `pruneBackups`
  retention (`reflect.ts:549`). RECORD-05's restore points need a **different** directory name, added
  to both `UNTRACK_PATHS` and the ignore seed, or they will be pruned by a mechanism that was never
  meant to see them.
- **D-22:** **RESTORING IS PER-FILE AND MUST BE PROVEN NOT TO TOUCH NEIGHBOURS.** The criterion is
  "restoring one file to its 02:00 state leaves ... the other agents' work in place". The test that
  proves it: snapshot, have two other files change, restore one, then assert the other two are
  byte-identical **and** that `git status --porcelain` and `git rev-parse HEAD` in the operator's repo
  are unchanged across the whole sequence.

### Nothing happening is an event (VIGIL-01)

- **D-23:** **THE WATCHDOG IS A NEW, OPERATOR-DIRECTED ALARM IN MAIN. IT IS NOT `HEARTBEAT_MISSION`,
  AND CONFLATING THEM FAILS THE REQUIREMENT'S HARDEST CLAUSE.** Measured: `HEARTBEAT_MISSION`
  (`src/main/config.ts:95`) has `enabled: false`, `intervalMs: 120_000`, `quietThresholdMs: 300_000`,
  and `to: 'god'`. Its documented job (`config.ts:85-95`) is to *"drop a digest into god's inbox and
  (if god's PTY is genuinely idle) nudge it to re-engage anyone stalled"*, and it ships disabled
  precisely because *"the heartbeat types into god's PTY"*. **A beat addressed to the god cannot report
  that the god died** -- which is the one case VIGIL-01 names explicitly. So VIGIL-01 is a distinct,
  **operator-directed** watchdog. It may reuse the heartbeat's quiet computation and its scheduler
  slot; it may not be the same message.
- **D-24:** **THE QUIET SIGNAL ALREADY EXISTS IN MAIN -- DO NOT ADD A SECOND ONE.**
  `PtySession.lastOutputAt` (`src/main/pty.ts:58`) is *"Epoch ms of the most recent byte this PTY
  emitted (bumped in onData)"*, and its own doc comment records that the heartbeat already reads it for
  *"floor-quiet detection (an agent printing/thinking counts as activity even before it writes a hive
  file)"*. Combine it with the ledger's last mutation and the router's last delivery for the
  requirement's three-part test (no card advances, no mail routes, no spend lands).
- **D-25:** **"TOLD ONCE" IS A LATCH, AND IT MUST SURVIVE THE THING IT IS WATCHING.** Edge-trigger on
  the transition into quiet, latch until real activity resumes, and carry *what was in flight when it
  stopped*. The god-died case means the watchdog cannot live anywhere that dies with the god: it
  belongs in the floor scheduler seam in **main** (Phase 2's STRUCT-01 dividend --
  `src/main/floor/boot.ts` and the `SHUTDOWN_STEPS` inverse), never in a mission dispatched to an agent
  and never in the renderer. Route the alarm through the same three channels as D-09 (desktop
  `Notification`, the phone ask list, Web Push) so "the operator is told" does not mean "a window was
  open".

### A dead agent's card, and a blocked agent nobody can see (VIGIL-02, VIGIL-03)

- **D-26:** **VIGIL-02'S INSERTION POINT IS EXACT, AND EVERYTHING IT NEEDS IS ALREADY IN SCOPE THERE.**
  Measured: `teardownPty` is now `src/main/floor/lifecycle.ts:222` (moved from `index.ts` by Phase 2).
  It calls `integrationBroker.revoke`, `breaker.forget`, `control.forget`, `telemetry.forget`,
  `hive.stopProxyBridge`, and `hive.setArchived(agentId, true)` -- and, exactly as the requirement says,
  **touches the ledger not at all.** Release the card immediately after `setArchived`. The two facts
  VIGIL-02 must name are both already computed within a few lines: the dropping agent is `agentId`,
  and *where their branch is* comes from `worktreeHasUnintegratedWork(wtPath, baseBranch)` in
  `finalizeAgentWorktree` (`lifecycle.ts:200`), which already returns keep/branch/detail and already
  logs a preservation path for the operator. Reuse that result; do not re-shell git.
- **D-27:** **"WITHIN A MINUTE" IS SATISFIED SYNCHRONOUSLY, NOT BY A SWEEP.** `teardownPty` runs on
  node-pty's `onExit`, so the card can be released in the same tick the agent dies -- well inside the
  minute. A periodic reaper is still worth having as a backstop for the case where main missed the
  exit, but the primary path is the teardown itself, and the plan should say which one it is testing.
- **D-28:** **VIGIL-03 IS HALF-SHIPPED ALREADY, AND THE SHIPPED HALF IS UNREACHABLE WITHOUT THE OTHER
  HALF. THIS IS THE MOST MISREADABLE ITEM IN THE PHASE.** Measured: the clause *"is never flipped to
  idle by the quiesce backstop"* is **already implemented** -- `stopArmDecision`
  (`src/renderer/src/hooks/useHive.ts:169`) returns a null patch when the event is `synthesized` and
  the agent's status is already `blocked`, with a 30-line rationale above it naming
  `DeliveryService.quiesce` and `QUIESCE_IDLE_MS`. **But that guard keys on the agent already being
  blocked,** and blocked-ness is set from `usePtyParser`'s `BLOCK_HINTS`
  (`src/renderer/src/hooks/usePtyParser.ts:31`, `:158`), which only sees the **mounted** terminal. An
  off-screen agent is therefore never marked blocked, so the guard never fires for it, so the backstop
  idles it and the floor mails it more work. Fixing detection is what makes the existing guard real.
  **A plan that marks VIGIL-03 green by pointing at `stopArmDecision` has marked an unreachable branch
  green.**
- **D-29:** **BLOCKED-DETECTION MOVES TO MAIN. That is one change that closes three problems.**
  (1) Off-screen coverage: `terminalPool.ts:59` has a single `onData` slot *"set by whichever view is
  mounted"* (**the requirement's `terminalPool.ts:57` is off by two**), so renderer detection is
  mount-scoped by construction. (2) **Headless correctness -- the decisive argument, and one the
  requirement text predates:** Phase 2 delivered a floor that runs with no window
  (`src/main/floor/headless.ts`), and a renderer-resident parser does not exist at all on a headless
  floor, so *every* agent would be undetectable, not merely the unmounted ones. (3) Main already sees
  every byte first -- `proc.onData` at `src/main/pty.ts:826` is upstream of the IPC that feeds the
  renderer. Move the `BLOCK_HINTS` evaluation to that tap and let the renderer render a state main owns.
  Two things to carry: `terminalPool.ts:171` notes the pooled buffer *"keeps filling even while this
  terminal isn't mounted in any view"*, and `:412` shows the house precedent of **polling a buffer
  nothing subscribes to** -- so a renderer-side stopgap is available if main-side parsing slips. And
  `BLOCK_HINTS`' known false positive (an agent that merely **echoes** a yes/no prompt is marked
  blocked, documented at `useHive.ts:140-144`) moves with the code; it is inherited, not introduced,
  and the recovery path (*"its next real turn-end"*) must be preserved.

### Age on the board (VIGIL-04)

- **D-30:** **`updatedAt` IS ADDED TO `HiveTask` AND FOLLOWS THE ISO-STRING CONVENTION ALREADY IN THE
  INTERFACE.** Measured: `HiveTask` (`src/main/hive.ts:119-149`) has `createdAt: string` and **no
  `updatedAt`** -- confirmed exactly as the requirement states. The convention to match is already
  present three times over: `HumanQA` carries `askedAt` / `answeredAt` / `dismissedAt`
  (`hive.ts:111-117`) and `HiveTask.review` carries `askedAt` (`:149`), all optional ISO strings.
  Every ledger mutation path must stamp it, or "nine hours in doing" is measured from the wrong
  clock -- `bin/task.cjs {add|patch|claim|done}` is the ledger's only sanctioned writer
  (`hive.ts:2810`), which makes it the one place to stamp.
- **D-31:** **CORRECTION TO THE REQUIREMENT TEXT: `humanQA.askedAt` IS PARSED. It is not rendered.**
  REQUIREMENTS.md says *"humanQA.askedAt is parsed and rendered nowhere"*. Measured:
  `src/renderer/src/components/TasksKanban.tsx:15` declares `askedAt?: string` and `:100` parses it.
  The gap is **rendering only**, which makes VIGIL-04's ASK-ME half smaller than written. The phone
  path is further along still -- `openPhoneAsks()` (`index.ts:1229-1234`) already emits `askedAt` and
  already sorts newest-first.
- **D-32:** **AGE IS DERIVED AT RENDER, NEVER STORED.** Store timestamps, compute elapsed in the view.
  A stored "age" is wrong the moment nothing re-writes it -- which, for a card nobody is touching, is
  exactly the case VIGIL-04 exists to make visible.

### Phase-wide rules (carried forward, binding)

- **D-33:** **PHASE 2'S D-40 IS INHERITED VERBATIM: no gate may pass because it parsed nothing.**
  Every repo-fact or grep-based assertion must (a) assert over joined/parsed text rather than single
  lines where a formatter could wrap the construct, and (b) assert a **positive lower bound**
  alongside the negative, so deleting the feature fails the test instead of satisfying it.
  `test/repo-claims.test.cjs` demonstrates the both-directions pattern and is the model. This bites
  hardest on GATE-02 (D-12) and on any "the deny list contains X" assertion.
- **D-34:** **A SECURITY GATE'S CEILING IS PART OF THE DELIVERABLE.** `hooks.ts:800-859` is the house
  standard: an explicit, itemized list of what the control does **not** reach, including accepted
  fail-opens with a named owner. GATE-02, GATE-03 and GATE-05 each ship one. `hooks.ts:848` states the
  rule -- *"A ceiling list that omits (b), (f) or (g) reads as a guarantee that does not hold."*
- **D-35:** **`use_worktrees: false` -- disjoint file ownership is the method, and this phase makes it
  harder than usual.** `.planning/config.json` sets it, PROJECT.md records why (tests require
  `typescript` and a `node-pty` native binding, so every worktree would need its own `node_modules`),
  and three multi-agent runs have landed on this repo that way. Phase 4's concentration risk is real
  and must drive slicing: `src/main/hooks.ts` is wanted by GATE-03 and GATE-05; `src/main/control.ts`
  by both (D-01); `src/main/floor/lifecycle.ts` by VIGIL-02; `src/main/hive.ts` by RECORD-02, RECORD-05
  and VIGIL-04; `src/main/db.ts` by RECORD-01 and RECORD-02; `src/main/index.ts` by nearly everything.
  Give each file exactly one owner per wave.
- **D-36:** **DO NOT TOUCH `package.json` OR `package-lock.json`.** Phase 2's D-06 constraint stands
  and was re-confirmed: the lockfile must be written by npm 10, this machine has npm 11, and rewriting
  it with the wrong major is a CI-breaking change on three hard-gated platforms. Everything this phase
  needs (`node:crypto`, `node:child_process`, the already-installed `better-sqlite3`) is present. **If
  a plan believes it needs a dependency, that is a signal to re-read the ladder, not to edit the
  lockfile.**
- **D-37:** **PHASE 4 STARTS AFTER 02-12 LANDS.** See the measurement caveat at the top of this file:
  plan 02-12 was actively rewriting `test/repo-claims.test.cjs` and `src/main/hiveProvisioning.ts`
  during this session. Both are files Phase 4 will touch (the repo-fact tests of D-33; the
  `AGENT_DENY_RULES` of D-03). Starting before 02-12 merges breaks disjoint ownership against a writer
  that is not even in this phase.

### Claude's Discretion

Auto-mode resolved every gray area to its researched recommendation. These are left to the planner:

- Plan slicing and wave assignment across the eleven requirements -- subject to D-01 (GATE-03 and
  GATE-05 share `control.ts`), D-35 (one owner per file per wave) and D-37 (after 02-12).
- The exact SQLite schema for the tool-call record and the event log (D-16/D-18), and whether they are
  one table with a kind discriminator or two -- subject only to D-19's range-scan-by-day requirement.
- Retention policy numbers for RECORD-02 -- the decision locked here is "a query bound, not a byte
  window"; the actual bound is the planner's.
- The default host allowlist membership for D-05 (the fail-closed-when-empty question is **not**
  discretionary -- decide it in writing).
- Snapshot cadence and pruning policy for RECORD-05 restore points, and the directory name that avoids
  the `backups` collision (D-21).
- Which single engine takes GATE-04's sandbox (codex is recommended and reasoned in D-15, but the
  planner may substitute one with better live-verification odds on this machine).
- Whether VIGIL-03's main-side parser replaces `usePtyParser` outright or runs alongside it during a
  transition (D-29).
- The exact ask TTL and the reconciled shim ceiling for D-08 -- the two-phase shape is locked, the
  numbers are not.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

**Every path below was opened in this session.** Where a requirement or the roadmap cites a different
location, the citation here is the corrected one -- see the warning in the domain section.

### Phase and requirement sources
- `.planning/ROADMAP.md` "Phase 4: Overnight on a Repo That Matters" (lines 316-380) -- goal, the five
  success criteria, the GATE/RECORD split rationale, the Phase 1 and Phase 2 dependency list
- `.planning/REQUIREMENTS.md` GATE (167-199), RECORD (200-223), VIGIL (224-241) -- the eleven
  requirement rows, each with its warning constraints. **Their parenthetical file:line evidence is
  stale; the decisions above carry the corrected locations.**
- `.planning/PROJECT.md` -- core value (*"you can leave it running and trust it"*), the zero-recurring-
  cost constraint, `use_worktrees: false` and the disjoint-ownership method, the verification-honesty
  rule
- `.planning/phases/01-finish-the-floor/01-CONTEXT.md` -- GATE-01 and the RECORD-03/04 arithmetic this
  phase builds on
- `.planning/phases/02-the-daemon-and-the-protocol/02-CONTEXT.md` -- **read D-40 (gates must be able to
  fail, inherited here as D-33), D-06 (the npm-10 lockfile freeze, inherited as D-36), D-03/D-04 (the
  floor/ seam and SHUTDOWN_STEPS), D-22 (Web Push), D-23 (the WebhookServer trust boundary)**

### Decision records (load-bearing -- do not contradict)
- `docs/adr/0001-one-gate-for-pty-writes.md` -- exactly one place types into a live PTY. **GATE-05's
  approval must not become a second typer**; the answer rides the hook return, as `control.ts`'s header
  already describes. Its named location is `src/main/delivery.ts` (amended in Phase 2, see 02 D-12).
- `docs/adr/0003-fail-safe-worktree-gc.md` -- when we cannot prove work is safe to discard, we keep it.
  The bias VIGIL-02's card release and RECORD-05's pruning must both inherit.
- `docs/adr/0004-single-committer-git.md` -- only main commits **to the hive repo**; debounced,
  serialized, stale-lock recovery. RECORD-05 operates on the **operator's** repo, where agents do run
  git -- which is the argument for a separate GIT_DIR (D-20).
- `docs/adr/0005-cumulative-cost-ledger.md` -- samples are cumulative, diff never sum. RECORD-01/02's
  storage move must not re-introduce the RECORD-03/04 error.
- `docs/adr/0006-terminal-pool-lifetime.md` -- VIGIL-03's pool constraints.
- `docs/adr/0002-prompt-cache-invariant.md` -- GATE-04's per-engine flag changes touch roster text.

### Subsystem docs
- `docs/message-queue.md` -- the MD-queue delivery contract (ADR-0001 is its section 1)
- `HIVE.md` 2.1 and 2.3 -- the hive protocol and the permission-prompt contract AGENT_DENY_RULES backs
- `PROTOCOL.md` -- `bin/task.cjs {add|patch|claim|done}` as the ledger's only sanctioned writer (D-30)
- `SECURITY.md` -- must be updated by GATE-02/03/05; `TELEMETRY.md` -- by RECORD-01
- `docs/floor-inspection.html` -- the audit that is the backlog

### Source seams named by the decisions above (all re-measured this session)
- **GATE-02:** `src/main/pty.ts:751` (the single `process.env` spawn spread), `:826` (`proc.onData`),
  `src/main/shellEnv.ts` (112 lines -- why PATH cannot simply be dropped)
- **GATE-03:** `src/main/hooks.ts:860` (`protectedPathDenial`), `:787-800` (why it is not in
  `AGENT_DENY_RULES`), `:800-859` (the ceiling list -- the house standard for D-34), `:54-62` (the two
  inherited holes, D-07), `:1368-1398` (the PreToolUse branch and the `toolDecision` call),
  `src/main/hiveProvisioning.ts:63` (`AGENT_DENY_RULES`), `:461-466` (where it is written)
- **GATE-05:** `src/main/control.ts:97` (`toolDecision`, synchronous),
  `src/main/hiveTemplates.ts:298-347` (`HOOK_SHIM` -- the response read at `:343-346` and the 5 s
  fail-open at `:346`), `:364` (`AGY_HOOK_SHIM`), `:425` (`PI_EXTENSION` -- fire-and-forget post,
  `ev.approve()` at `:444-446`), `:466` (`OPENCODE_PLUGIN` -- LIVE-UNVERIFIED)
- **GATE-05 operator surface:** `src/main/webhook.ts:111` (`PhoneAsk`), `:149-152`
  (`openAsks`/`answerAsk`), `:634` (`GET /phone/api/asks`), `:644-676` (`POST /phone/api/answer`),
  `src/main/index.ts:1221-1236` (`openPhoneAsks`), `:1321-1322` (the wiring), `:4768` (desktop
  Notification), `src/main/floor/deps.ts` (the injected notify), `src/main/push.ts` (Web Push / VAPID)
- **GATE-04:** `src/shared/agentProvider.ts:262-272` (codex's bypass flag plus the path-tree comment),
  `:500` (opencode's `--yolo`), `:684-691` (`bridgeOf`), `src/main/hive.ts:999` (per-agent CODEX_HOME)
- **RECORD-01:** `src/main/telemetry.ts:161` (`SPAN_RING_CAP = 200`), `:96` (never persisted),
  `src/main/db.ts:64-77` (the schema and the `(agent_id, ts DESC)` index)
- **RECORD-02:** `src/main/hive.ts:323` (`LOG_ROTATE_BYTES`), `:2488-2509` (the one-generation rotate),
  `:2512-2516` (the cost-ledger-to-SQLite migration note that decides D-16)
- **RECORD-05:** `src/main/gitCommitter.ts:82` (`UNTRACK_PATHS`), `:144`, `:161-163` (enforcement),
  `src/main/hive.ts:788` (the ignore seed), `src/main/reflect.ts:263` and `:549` (the **backups name
  collision**, D-21), `src/main/git.ts` (the whole read surface: `getStatus`, `getLog`,
  `worktreeHasUnintegratedWork:334`, `listWorktrees:518`)
- **VIGIL-01:** `src/main/config.ts:85-108` (`HEARTBEAT_MISSION`, enabled false, to god),
  `src/main/pty.ts:54-58` (`lastOutputAt`), `src/main/floor/boot.ts` plus SHUTDOWN_STEPS (the scheduler
  seam the watchdog lives in)
- **VIGIL-02:** `src/main/floor/lifecycle.ts:222-254` (`teardownPty`), `:180-213`
  (`finalizeAgentWorktree` / `worktreeHasUnintegratedWork` -- the branch VIGIL-02 must name)
- **VIGIL-03:** `src/renderer/src/hooks/useHive.ts:122-172` (`stopArmDecision` -- the already-shipped
  half and its full rationale), `src/renderer/src/hooks/usePtyParser.ts:31` and `:158` (`BLOCK_HINTS`),
  `src/renderer/src/components/terminalPool.ts:59` (the single onData slot), `:171` (the buffer fills
  unmounted), `:412` (the polling precedent), `src/main/delivery.ts` (quiesce, QUIESCE_IDLE_MS)
- **VIGIL-04:** `src/main/hive.ts:111-117` (`HumanQA`), `:119-149` (`HiveTask` -- createdAt, no
  updatedAt), `:2810` (`bin/task.cjs` as the only sanctioned ledger writer),
  `src/renderer/src/components/TasksKanban.tsx:15` and `:100` (**askedAt IS parsed** -- D-31)

### Build, CI and test surface
- `package.json` -- test is `node --test test/*.test.cjs`; plus typecheck, build, e2e.
  **Do not modify this file or `package-lock.json` (D-36).**
- `.github/workflows/ci.yml`, `e2e.yml` -- three hard platforms, no continue-on-error
- `test/load-ts.cjs` -- the electron stub plus TS loader every main-process test uses
- `test/repo-claims.test.cjs` -- the both-directions repo-fact pattern D-33 mandates. **Being rewritten
  by plan 02-12 as of 2026-08-24 17:12 (D-37).**
- `test/boot-floor.test.cjs` -- Phase 2's gate; the model for testing anything under `src/main/floor/`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`HookServer.protectedPathDenial` (`hooks.ts:860`)** -- a main-side, multi-engine, command-string
  gate with identity resolution, a candidate cap, operator-legible reasons and a written ceiling.
  **GATE-03 is a wider predicate on this, not a new gate.** The single biggest reuse in the phase.
- **The phone ask surface (`webhook.ts:111-152`, `:634-676` plus `index.ts:1321`)** -- a finished,
  tested, authenticated, rate-limited, lockout-protected question/answer channel reachable from the
  operator's pocket. **GATE-05's "asked wherever they are" needs no new endpoint and no new trust
  boundary.** Phase 2's dividend, collected here.
- **`PersistStore` (`db.ts`, 320 lines)** -- an already-open better-sqlite3 handle whose
  `command_history` table already carries the `(agent_id, ts DESC)` index shape RECORD-01 needs, and
  whose cost_ledger migration `hive.ts:2512` already anticipates. RECORD-01 and RECORD-02's home.
- **`PtySession.lastOutputAt` (`pty.ts:58`)** -- per-PTY last-byte epoch, already read for floor-quiet
  detection. VIGIL-01's silence signal, already computed, already in main.
- **`worktreeHasUnintegratedWork` (`git.ts:334`, called at `lifecycle.ts:200`)** -- already returns
  keep/branch/detail next to `teardownPty`. VIGIL-02's "where their branch is", already in hand.
- **`stopArmDecision` (`useHive.ts:158`)** -- VIGIL-03's quiesce guard, already shipped and asserted.
  Needs D-29's detection fix to become reachable.
- **`UNTRACK_PATHS` plus the ignore seed (`gitCommitter.ts:82`, `hive.ts:788`)** -- the exact
  discipline RECORD-05's warning requires reusing. Mind the backups name collision (D-21).
- **`src/main/push.ts` (293 lines)** -- dependency-free VAPID/Web Push from `node:crypto`, with an
  **injected** transport so it unit-tests with no network. The pocket channel for D-09 and D-25.
- **`src/main/procKill.ts:34 hardKillTree`** and the floor/ boot-shutdown seam -- where a watchdog
  that must outlive its subjects belongs.

### Established Patterns
- **The gate lives in main; the shim only relays.** Every hook-bridged engine posts to one Unix
  socket / named pipe and honours the reply. That is why GATE-03 is one function and not eleven.
- **Ceilings are written down, with accepted fail-opens named and owned** (`hooks.ts:800-859`).
  Copy this for every gate this phase ships (D-34).
- **Capability gaps are declared, not faked** -- LIVE-UNVERIFIED, NO MAIL, spend UNTRACKED. The
  pattern D-06 applies to OpenCode. Note `test/repo-claims.test.cjs` now **pins the marker count per
  file**, so adding or removing a LIVE-UNVERIFIED marker requires updating that ledger in the same
  commit.
- **Electron-free main modules are the testable ones** -- `control.ts`, `delivery.ts`, `webhook.ts`,
  `hooks.ts`, `push.ts` and `db.ts` all avoid electron imports and all have tests. **Every new module
  this phase adds must keep that property**, or it cannot be tested on the three CI platforms.
- **Injected dependencies over imports** (`FloorDeps`, `DeliveryDeps`, `WebhookServerOptions`,
  push.ts's transport). New collaborators arrive as injected thunks.
- **Repo-fact tests assert in both directions** (D-33) -- `test/repo-claims.test.cjs` is the model.
- **Per-agent isolation is house style** -- CODEX_HOME, CRUSH_GLOBAL_CONFIG, per-agent opencode plugin
  and pi extension dirs, all under the agent dir. GATE-04's writable root goes there.

### Integration Points
- `toolDecision` is called from `HookServer`'s PreToolUse branch (`hooks.ts:1387`), whose reply the
  shim relays to the engine. **The one seam GATE-03 and GATE-05 both edit (D-01).**
- The pending-approval registry feeds `openAsks()`, which feeds `GET /phone/api/asks` and the PWA;
  and separately the desktop Notification and Web Push (D-09, D-10)
- The tool-call writer hangs off telemetry span recording into PersistStore (D-17); the event log
  hangs off the hive.ts append into PersistStore (D-18), which Phase 3's SCALE-03 replay then reads
- The restore-point writer drives a separate GIT_DIR over the operator's work-tree from main's
  scheduler seam (D-20)
- The absence watchdog combines `pty.lastOutputAt`, the ledger's last mutation and the router's last
  delivery, then fires the three alarm channels (D-23, D-24, D-25)
- Card release hooks into `teardownPty` (`floor/lifecycle.ts:222`) and writes the ledger through the
  sanctioned writer, updating the board (D-26)
- Main-side BLOCK_HINTS taps `proc.onData` (`pty.ts:826`) and sets agent status for the renderer and
  the headless floor alike (D-29)
- `updatedAt` is stamped by every task.cjs mutation and rendered as card age in TasksKanban and on the
  phone (D-30)

</code_context>

<specifics>
## Specific Ideas

- **This phase's own acceptance test is the project's honesty rule.** Claims that did not survive this
  session's verification pass, each corrected above: the requirement file:line citations for GATE-02
  (`pty.ts:665` is now `:751`), GATE-04 (`agentProvider.ts:216-226` is now `:262-272`), RECORD-01
  (`telemetry.ts:126` is now `:161`), RECORD-02 (`hive.ts:267` is now `:323`), VIGIL-03
  (`terminalPool.ts:57` is now `:59`) and AGENT_DENY_RULES' file (`hive.ts` is now
  `hiveProvisioning.ts:63`); the claim that `humanQA.askedAt` is *"parsed and rendered nowhere"*
  (D-31 -- it is parsed); and the implicit claim that criterion 1's four engines have four equal paths
  (D-06). Expect to find more, and treat correcting a claim as *doing* the phase, not as deviating
  from it.
- **Three items are GATE-01-shaped -- a feature whose tests could pass while its effect is nil.**
  (1) VIGIL-03's `stopArmDecision` guard, already green and currently unreachable for the case it
  exists to serve (D-28). (2) GATE-03 for pi and OpenCode, where a built veto path that the engine
  never consults would look identical to a working one from the test side (D-06). (3) AGENT_DENY_RULES,
  which is real for exactly one engine (D-03). Each must be verified **live**, not by unit test alone.
- **The phase's two hardest clauses are both about absence.** *"including the case where the god itself
  died"* (VIGIL-01) and *"an unanswered prompt fails safe rather than hanging a worker forever"*
  (GATE-05). Both fail in the same way if built naively: by living inside the thing they are watching.
  D-23 and D-08 are the two decisions that keep them outside it.
- **Criterion 2's second half is deliberately modest and should stay that way.** "At least one engine"
  with a **verified fallback** -- the requirement's own warning says a floor-wide sandbox flip's failure
  mode is *"the floor silently stops working at 3am"*. Resist scope-widening here; one proven engine is
  the requirement.
- **Zero recurring cost is absolute and unthreatened by this phase.** Every decision above uses
  `node:crypto`, `node:child_process`, git, or the already-installed better-sqlite3. No decision
  here costs a dollar, and none needs a new dependency (D-36).

</specifics>

<deferred>
## Deferred Ideas

- **Closing the user-global engine-seed hole** (`~/.codex/config.toml`, `~/.gemini/.../hooks.json`,
  `~/.grok/hooks/` outside the hive root -- D-07 hole 1). A real trust-boundary gap, inherited from
  before this phase and named in `hooks.ts:54-59`. It needs per-agent seed isolation across three
  engines, which is its own piece of work; GATE-03 is not the place to smuggle it in.
- **Making the hook shim fail closed** (D-07 hole 2). Deliberately rejected today because an agent PTY
  outlives a quit and a fail-closed shim would break every agent whenever the app is legitimately not
  running. Revisit only with a way to distinguish "app is down" from "socket was removed".
- **A quote-aware tokenizer for the Bash arm of `protectedPathDenial`** -- ceiling item (b): a harness
  home containing a space turns the whole Bash arm off for that operator. Pre-existing, its own change,
  and it would widen GATE-03's reach for the operators it currently fails.
- **GATE-03 for the qwen proxy tier** -- there is no tool-call boundary in a proxy bridge to gate at.
  Would need request-body inspection in PROXY_BRIDGE_SHIM, which is a different mechanism with a
  different threat model.
- **Extending the sandbox (GATE-04) to the remaining ten engines** -- explicitly out by the
  requirement's own per-engine, opt-in warning (D-15). One engine at a time, each with its own live
  verification.
- **SCALE-03's replay UI** -- Phase 3 owns the surface; Phase 4 owns only the storage it reads (D-19).
- **Migrating the existing cost-ledger.jsonl into SQLite** -- `hive.ts:2512` says the migration is a
  mechanical INSERT...SELECT, but the cost ledger is RECORD-03/04 territory that already shipped and
  is not in Phase 4's requirement list. Do it when RECALL or SCALE needs it, not opportunistically.
- **Removing the now-unused tunnelmole dependency** -- still blocked by the npm-10 lockfile
  constraint (D-36), inherited from Phase 2's D-06. Needs a session with npm 10 available.
- **Restore points for the hive repo itself** -- RECORD-05 is scoped to the operator's project repo.
  The hive repo already has git history and a single committer, so it is a different (smaller) problem.
- **A physical-device pass over the GATE-05 phone approval flow** -- the endpoints are tested, but
  nothing in the phone surface has been exercised on a real Android device (Phase 2 recorded the same
  gap). "Verification needs a real device" is a first-class outcome here, not a failure.

</deferred>

---

## Red-Team Log

> The durable `RED_TEAM_CLEAN` record for Phase 4, written by `/gsd:plan-phase` step 11.5.
> `execute-phase`, step 15's auto-advance gate, and any resumed session read **this block**.

**Status: `RED_TEAM_CLEAN = true` — the gate is closed. Auto-advance was still NOT taken; the operator
runs `execute-phase` deliberately.**

Basis: **round 5 returned ZERO BLOCKERs.** Its single HIGH (`04-16`'s `<done>` and `<success_criteria>`
still saying "ten seconds" where the operative criteria say fifteen) is fixed and mechanically
re-verified — `grep -cE "ten seconds|10 s budget" 04-16-PLAN.md` now returns **0**. Round 5's six MEDs
are fixed too, including two wrong numbers the orchestrator itself had introduced in round 4.

**The honest caveat, stated rather than buried:** round 5's fixes are orchestrator-authored and have
not themselves faced a hostile lens. They are six mechanical edits — two word changes, two corrected
measurements, one citation, one grep threshold — and **every one was re-measured at source after the
edit** (see the verification table below). That is a materially smaller residual than round 4's, which
included a reverted import with a measured 3-test blast radius.

Five adversarial rounds ran, dispatched as **parallel direct `Agent` calls** (never the Workflow tool —
Windows stdio-deadlocks at fan-out, per the operator's standing mandate and their explicit instruction
this session).

| Round | Date | Lenses | BLOCKER | HIGH | Character of the findings |
|---|---|---|---|---|---|
| 1 | 2026-08-25 | 6 — `gsd-plan-checker` + 5 hostile (vacuous-gates · waves/contracts · security-direction · test-quality · honesty) | **11** | 18 | **Architectural** — unowned composition root; nothing produced an `ask`; the gate keyed to one engine's tool name |
| 2 | 2026-08-25 | 3 consolidated hostile | **9** | 10 | **Structural** — fixes that *moved* defects; Claude's timeout left "unreconciled"; an uncleared 5 s timer; a seam routed nowhere |
| 3 | 2026-08-25 | 2 hostile (verify-the-fixes · self-check audit) | **5** | 7 | **Textual** — a missing `export ` in an `awk` anchor; a stale ceiling range; a criterion greping the wrong file |
| 4 | 2026-08-25 | 1 hostile (clean-round check) | **1** | 1 | **Textual** — a measured 3-test regression; a criterion red on every correct implementation |
| 5 | 2026-08-25 | 1 hostile (gate-close, scoped to round 4's six edits) | **0** | 1 | **Narration** — a 15 s budget sweep that missed two of four sites, one of them operative |

**Round 5 reviewed round 4's fixes** — the gap that kept this record at `false`. It confirmed five of
six sound, including an explicit ruling that reverting the `./config` import is correct and does **not**
leave GATE-02 unsatisfied (SC-1 measures *blast radius*, and all three spawn sites remain filtered;
what is lost is D-13's operator *escape* at one site, which is a functional-regression risk recorded in
ceiling (h), not a gate failure). It also independently checked both alternative closures and found
both blocked — threading via `reflect.ts` hits the identical `better-sqlite3` cache hazard, and the
constructor-thunk route dies at `boot.ts:1141`, plan 04-03's file in wave 1.

Round 5's own findings — the HIGH plus six MEDs — are fixed and re-measured. Two of those MEDs were
numbers the orchestrator asserted without measuring in round 4 (`4` bridge methods, not 6; `28`
`window.cth.*` calls, not 30); the arguments they supported were unaffected, but the evidence was
wrong and is now corrected to the measured values.

### Round 5 fixes, each re-measured after the edit

| Fix | Verified |
|---|---|
| `04-16:452` + `:567` — 10 s → 15 s | `grep -cE "ten seconds\|10 s budget"` → **0** |
| `04-18` — corrected 6→**4**, 30→**28** | measured at source |
| `04-18` — new anti-cast clause (`useHive.ts:1033-1039` is the precedent that would have defeated the typecheck argument) | `window.cth.onFloorQuiet(` → **0** at HEAD, asserts 1; `as unknown as` pinned unchanged at **2** |
| `04-05:26` — D-13 cited "(h) and (i)"; both sites are (h) | corrected |
| `04-06:602` — `emitControl(` `≥ 3` passed at HEAD | measured **3**, now asserts **≥ 4** plus a four-argument shape assertion |
| `04-VALIDATION.md:132` — last stale `(j)-(s)` | → `(j)-(v)`; zero stale ranges remain phase-wide |

### What every round verified rather than trusted

The orchestrator re-ran the load-bearing claims at source instead of accepting reviewer or planner
reports. Independently confirmed on this machine:

- **The win32 named-pipe round trip works** — a real child process → `\\.\pipe\` → real `HookServer`,
  exit 0, deny on the child's stdout. Reproduced **three times** (orchestrator + two lenses), one of
  which also exercised the repeated-connect path the poll loop needs and that no plan had measured.
  This retired round 1's most-confirmed blocker and restored criterion 2's evidence **locally** rather
  than deferring it to CI. *(The first orchestrator probe failed with `EPIPE` because it used
  `c.end(payload)` — a half-close a named pipe does not support. The real shim writes
  `c.write(payload + '\n')` and keeps the connection open, which is exactly why it works.)*
- **`hooks.ts:871` is `p.tool_name === 'Bash'`**, a Claude tool name, with **no normalization anywhere**
  (repo-wide grep: 2 hits, one unrelated). GATE-03 as first planned refused nothing on six engines.
- **Engine hook timeouts** — grok 5 s (default, no key written), codex 30 s, kimi 30 s, agy `timeout: 0`,
  Claude no key at all — every one shorter than the planned 120 s ask TTL. A killed hook writes no
  stdout, and no stdout is **allow**.
- **`04-16`'s byte-identity guard extracted zero lines** (`^const` vs the source's `export const`), so it
  hashed empty against empty and passed for any edit to grok's or agy's shim, including deleting them.
- **`hiddenClaude.ts:148`** is a second unfiltered `pty.spawn` running `--permission-mode
  bypassPermissions` over — in its own header's words — often-web-scraped text, and appeared in **zero**
  phase-4 documents.
- **The final `readConfig()` fix broke three tests**, measured: `memory-hygiene.test.cjs:16` loads
  `reflect.ts` → `hiddenClaude.ts` → (proposed) `./config` → `./db` → `better-sqlite3`, **36 lines
  before** the test injects its sqlite fake at `:52-53`. 805 / 795 / 3 against a 0-failure baseline.

### Gates at close (all re-run by the orchestrator after its own edits)

| Gate | Result |
|---|---|
| `check.decision-coverage-plan` (**blocking**, §13a) | **`passed: true`, 37/37, 0 uncovered** |
| Requirements coverage (§13) | **11/11** — confirmed by `gsd-tools gap-analysis` |
| Every `awk` range executed against live source | **12/12 non-zero** — zero vacuous |
| `sed -n` line-windows in acceptance criteria | **0** across all 20 plans |
| Plans / tasks / VALIDATION rows | 20 / 59 / **59 — exact bijection** |
| `<threat_model>` per plan | **20/20** |
| Suite baseline | 805 / 798 / 0 / 7 (re-measured independently) |

### Accepted residuals — the operator's call

These are recorded, not closed. None is architectural.

1. **Round 5's six fixes are orchestrator-authored and not adversarially re-reviewed.** Each was
   re-measured at source after the edit (table above). Round 4's fixes — the larger residual this
   entry used to name — **were** reviewed, by round 5, and confirmed.
2. **Reflection's escape hatch is unreachable this phase.** `hiddenClaude.ts` filters with a permanent
   `[]` because its only caller is `reflect.ts:344`, which no plan edits. A BYOK operator whose
   `ANTHROPIC_API_KEY` comes from their own shell loses memory condensation with no way to re-admit it.
   Round 5 confirmed both alternative closures are blocked (the `better-sqlite3` cache hazard, and a
   D-35 conflict at `boot.ts:1141`) and ruled ACCEPT the right disposition. Owner: hive maintainer.
   Settled by a later phase owning both `reflect.ts` and `test/memory-hygiene.test.cjs`.
   **~~3. `04-09:312`'s vacuous `'restore'` grep~~ — CLOSED.** It measured `1` at HEAD against the
   `git restore --staged` subcommand at `:256` rather than the `UNTRACK_PATHS` entry at `:82`, so
   D-21's "the restore store never lands in the hive repo" half had no gate that could fail. Now
   array-scoped and biting in both directions: `awk '/^const UNTRACK_PATHS = /' … | grep -c "'restore'"`
   → **0 at HEAD**, asserts 1; entry count → **4 at HEAD**, asserts 5. Round 5 ran both and confirmed
   the `awk` anchor matches, and checked the repo has no formatter that could reflow the array.
3. **Three citations that misdescribe their own plan** while the decision is genuinely acted on
   elsewhere (`04-12:20`, `04-10:19`, `04-18:28`).
4. **Suite-budget headroom is thinner than stated** — 42.4 s worst-case baseline measured under
   concurrency (24.3 s quiet), plus gate05's 15 s and gate03's 10 s, leaves ~23 s for the other nine new
   files against a 90 s budget. Round 5 independently put `test/gate05-bounded-wait.test.cjs` at
   ~13–14 s against its 15 s ceiling — **~1–2 s of margin, and it can flake on a cold or AV-scanned
   run.** 04-19 re-measures at close and reports the delta, which is the correct mitigation.
5. **`04-02:254`** names a `grep -c 'db.prepare'` command and then asserts no value ("assert by
   reading") — a criterion with no verdict. LOW; noted for the executor.

### Round documents

`04-REDTEAM.md` (round 1) · `04-REDTEAM-R2.md` (round 2) · `04-REDTEAM-R3.md` (round 3) — each carries
the full finding list, the cross-confirmation map, and a "what survived the attack" section so later
rounds did not churn settled work.

---

*Phase: 4-Overnight on a Repo That Matters*
*Context gathered: 2026-08-24*
*Planned + red-teamed: 2026-08-25 — 20 plans, 7 waves, 59 tasks*
