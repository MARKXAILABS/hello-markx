# Phase 4: Overnight on a Repo That Matters - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `04-CONTEXT.md` -- this log preserves the alternatives considered.

**Date:** 2026-08-24
**Phase:** 4-overnight-on-a-repo-that-matters
**Mode:** `--auto` (yolo). Advisor mode was active (`USER-PROFILE.md` present) at calibration tier
`standard` (Vendor Philosophy: `pragmatic-fast`), `NON_TECHNICAL_OWNER = false`. Under `--auto` no
`AskUserQuestion` was issued; every area was auto-selected and resolved to the recommended option.
Advisor research was performed **inline against live source by the orchestrator** rather than by
parallel subagents, per this session's operating directive.

**Areas discussed (all 11, auto-selected):** Where a tool call is judged - Which engines the gate
reaches - The third answer and its bounded wait - Where the operator is asked - Child-process env -
The sandbox that stays on - Where the durable record lives - The restore-point mechanism - Where
absence is computed - Where blocked-ness is detected - Card reassignment and card age.

---

## Where a tool call is judged (GATE-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Widen `AGENT_DENY_RULES` | Add the four shapes to the existing prefix-match deny list | |
| Build a new main-side rule engine | A fresh command-judging module with its own rule format | |
| Widen `HookServer.protectedPathDenial` | Extend the existing main-side, multi-engine, tokenizing gate's predicate | YES |

**Auto-selected:** Widen `protectedPathDenial` (recommended).
**Notes:** `AGENT_DENY_RULES` is written into exactly one engine's settings file and is prefix-matching
by its own admission. `protectedPathDenial` already runs in main, already tokenizes the command string,
already resolves by dev/ino identity, already caps candidates and already carries a written ceiling
list -- and its own header comment argues precisely this case. Building a third mechanism next to it
would be the ladder failure. `AGENT_DENY_RULES` is kept as defence in depth, not deleted.
Recorded as **D-02**, **D-03**, **D-04**, **D-05**.

---

## Which engines the gate actually reaches (GATE-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Claim all four engines | Implement and mark criterion 1 satisfied for Codex, Grok, pi, OpenCode | |
| Per-engine honesty ledger | Ship what each bridge can actually enforce; mark the rest LIVE-UNVERIFIED | YES |
| Defer pi and OpenCode entirely | Only close GATE-03 for the two engines with a response channel | |

**Auto-selected:** Per-engine honesty ledger (recommended).
**Notes:** Measured per bridge. Codex/Grok reuse `HOOK_SHIM`, which reads the server's reply -- a deny
is honoured today. `PI_EXTENSION` is fire-and-forget but pi's API exposes an approve callback, so the
veto is buildable. `OPENCODE_PLUGIN` posts fire-and-forget and its veto capability is unknown; it
already carries a LIVE-UNVERIFIED marker because verifying it needs BYOK keys this project does not
have. Deferring pi/OpenCode was rejected because pi is genuinely cheap; claiming all four was rejected
as the over-claim the project bans. Recorded as **D-06**, with the two inherited holes as **D-07**.

---

## The third answer and its bounded wait (GATE-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Flip the shim's 5 s timeout to deny | One-line change; every timeout becomes a refusal | |
| Two-phase wait | Immediate verdict; a longer deny-defaulting wait only when the answer is "ask" | YES |
| Block in main and hold the socket open | Keep the connection parked until the operator answers | |

**Auto-selected:** Two-phase wait (recommended).
**Notes:** Flipping the existing timeout would make every socket outage, app restart and
legitimately-not-running floor deny every tool call on every agent -- destroying a deliberate,
documented fail-open. Holding the socket open conflates the two failure modes the same way. The
two-phase shape keeps "the floor is not running" fail-open and makes only "the floor asked and nobody
answered" fail-closed. Recorded as **D-08**.

---

## Where the operator is asked (GATE-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Build a new approval endpoint and UI | A dedicated approval surface with its own auth | |
| Reuse the existing phone ask surface | Publish into openAsks/answerAsk, already authenticated and rate-limited | YES |
| Desktop notification only | Skip the phone; the operator approves at the machine | |

**Auto-selected:** Reuse the phone ask surface (recommended).
**Notes:** The requirement says "wherever they are, including on the phone", so desktop-only fails it.
A new endpoint would duplicate a finished trust boundary -- bearer-in-header, byte-identical auth
failures, a phone-specific rate bucket, lockout, body caps -- all shipped and tested in Phase 2. The
follow-up question (whether approvals become cards) was resolved separately: they do **not**, because
they are ephemeral and would pollute the durable ledger. Recorded as **D-09**, **D-10**.

---

## Child-process environment (GATE-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Denylist known credential variables | Strip AWS_*, *_TOKEN, *_SECRET and friends | |
| Allowlist what a shell needs | Deny by default; pass only named variables plus the hive's own | YES |

**Auto-selected:** Allowlist (recommended).
**Notes:** A denylist cannot converge -- credential variable names are chosen by other tools, and
enumerating an input space someone else controls is the reasoning the codebase already rejects for path
spellings. Everything funnels through one pty.spawn env object, so the filter is one change at one
choke point. Flagged as the phase's most likely regression source, with a mandated operator escape
hatch and a live non-Claude agent check. Recorded as **D-11**, **D-12**, **D-13**.

---

## The sandbox that stays on (GATE-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Floor-wide sandbox flip | Turn sandboxes on for every engine at once | |
| One engine, opt-in, via writable roots | Re-enable workspace-write and add the agent dir as a writable root | YES |
| Relocate the agent directory under cwd | Move hive agent folders so workspace-write already covers them | |

**Auto-selected:** One engine, opt-in, writable roots (recommended).
**Notes:** The requirement's own warning forbids a floor-wide flip -- its failure mode is "the floor
silently stops working at 3am". Relocating the agent directory was rejected as a larger blast radius
than the problem: it would change every engine's path assumptions to fix one engine's sandbox. The
source comment already diagnoses the real blocker as two path trees, which writable roots address
directly. Recorded as **D-14**, **D-15**.

---

## Where the durable record lives (RECORD-01, RECORD-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Raise SPAN_RING_CAP | Keep more spans in memory | |
| A new append-only JSONL with retention | A third log file beside log.jsonl and cost-ledger.jsonl | |
| SQLite in the already-open PersistStore | Persist tool calls and events into db.ts | YES |

**Auto-selected:** SQLite in PersistStore (recommended).
**Notes:** Raising the ring cap fails the requirement outright -- a bigger volatile buffer is still
empty after a crash, which is exactly when the record is wanted. A third JSONL was rejected because an
indexed database is already open in the process and hive.ts already documents the cost ledger's
migration into a SQLite table as the intended direction. The in-memory ring is **kept** as the hot read
path so the waterfall UI does not regress. Recorded as **D-16**, **D-17**, **D-18**, **D-19**.

---

## The restore-point mechanism (RECORD-05)

| Option | Description | Selected |
|--------|-------------|----------|
| git stash snapshots | Periodic stashes of the working tree | |
| Commits to a shadow branch | A hidden branch in the operator's repo | |
| Plain file copies under the hive root | Timestamped directory copies | |
| Separate GIT_DIR + GIT_INDEX_FILE | A second git object store over the same work-tree | YES |

**Auto-selected:** Separate GIT_DIR (recommended).
**Notes:** Scored against the requirement's literal untouched-list (index, working tree, branches,
git status, git log). Stash writes the index and modifies the tree; a shadow branch writes the index
and adds a ref that log and status both see; file copies pass but have no deduplication, so N
snapshots of a real repo is unbounded disk. A separate GIT_DIR passes all five clauses, dedups by
content hash for free, and never takes the operator repo's index.lock -- which matters because agents
do run git in that repo. Recorded as **D-20**, **D-21**, **D-22**.

---

## Where absence is computed (VIGIL-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Enable HEARTBEAT_MISSION | Turn on the existing quiet-detection beat | |
| A renderer-side idle watcher | Detect quiet in the UI where floor state is already assembled | |
| A new operator-directed watchdog in main | Reuse the quiet signal; address the operator, not the god | YES |

**Auto-selected:** New operator-directed watchdog in main (recommended).
**Notes:** HEARTBEAT_MISSION is addressed to the god and its documented job is nudging god's PTY --
so it cannot report the one case VIGIL-01 names explicitly, that the god itself died. A renderer-side
watcher dies with the window, which Phase 2 made optional. The quiet signal itself is reused rather
than rebuilt: PtySession.lastOutputAt already exists and the heartbeat already reads it. Recorded as
**D-23**, **D-24**, **D-25**.

---

## Where blocked-ness is detected (VIGIL-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Fan out the renderer's onData slot | Let more than one consumer subscribe per terminal | |
| Poll the pooled xterm buffer | Read the buffer that keeps filling while unmounted | |
| Move BLOCK_HINTS parsing into main | Evaluate at proc.onData, upstream of the renderer | YES |

**Auto-selected:** Move parsing into main (recommended).
**Notes:** Both renderer-side options fix off-screen coverage but neither survives headless mode, which
Phase 2 shipped -- with no window there is no parser at all, so *every* agent becomes undetectable, not
just unmounted ones. Main already sees every byte first. Buffer polling is retained as a named fallback
if main-side parsing slips. The discussion also surfaced that the requirement's "never flipped to idle
by the quiesce backstop" clause is **already implemented** but unreachable without this fix -- the most
misreadable item in the phase. Recorded as **D-28**, **D-29**.

---

## Card reassignment and card age (VIGIL-02, VIGIL-04)

| Option | Description | Selected |
|--------|-------------|----------|
| A periodic reaper sweep | Scan the ledger for cards owned by dead agents | |
| Release synchronously in teardownPty, reaper as backstop | Release in the same tick the PTY exits | YES |

**Auto-selected:** Synchronous release with a reaper backstop (recommended).
**Notes:** teardownPty runs on node-pty's onExit, so a synchronous release is well inside the
requirement's one-minute bound, and both facts the requirement demands -- who dropped it and where their
branch is -- are already computed a few lines away. For card age, updatedAt follows the ISO-string
convention HumanQA and review already use, and age is derived at render rather than stored. A
correction was recorded: the requirement says humanQA.askedAt is "parsed and rendered nowhere", but it
**is** parsed -- the gap is rendering only. Recorded as **D-26**, **D-27**, **D-30**, **D-31**, **D-32**.

---

## Claude's Discretion

Auto-mode resolved every gray area to its recommended option. Explicitly left to the planner
(full list in `04-CONTEXT.md`): plan slicing and wave assignment; the exact SQLite schema; RECORD-02's
retention numbers; the default host-allowlist membership (though the fail-closed-when-empty question is
**not** discretionary); restore-point cadence, pruning and directory name; which single engine takes
GATE-04's sandbox; whether the main-side parser replaces usePtyParser or runs alongside it; and the
exact ask TTL with its reconciled shim ceiling.

## Deferred Ideas

Ten items were raised and pushed out of scope rather than lost -- closing the user-global engine-seed
hole, making the hook shim fail closed, a quote-aware tokenizer, GATE-03 for the qwen proxy tier,
extending the sandbox to the other ten engines, SCALE-03's replay UI, migrating cost-ledger.jsonl into
SQLite, removing the unused tunnelmole dependency, restore points for the hive repo itself, and a
physical-device pass over the phone approval flow. Each is recorded with its reason in
`04-CONTEXT.md`'s deferred section.

## Process note

No scope creep was introduced: every area above clarifies *how* one of the eleven scoped requirements
is implemented. The one boundary pressure encountered was RECORD-02's overlap with SCALE-03's replay
surface, which was resolved by scoping Phase 4 to the storage and leaving the UI to Phase 3 (**D-19**).

Three phase-wide rules were carried forward rather than rediscovered (**D-33** gates must be able to
fail, **D-36** the npm-10 lockfile freeze, **D-35** disjoint file ownership), and one new sequencing
constraint was found during the baseline measurement and recorded as **D-37**: Phase 4 execution must
wait for plan 02-12, which was rewriting two files Phase 4 will touch while this session ran.
