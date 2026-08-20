# Roadmap: Hello MarkX

## Overview

The audit is the backlog, and the core value — *you can leave it running and trust it* — is
what decides the order.

Phase 1 finishes the floor: every one of the 20 open floor-inspection issues, closed against
source rather than against a claim, plus the five prerequisites that would otherwise make
Phase 1's own success criteria untrue (per-agent hook identity, correct spend arithmetic, and
the two halves of review that stop `sweepTaskReviews` passing vacuously). Phase 2 takes the
office off the window: headless, reachable from an Android phone, every one of the eleven
engines a real citizen — with the two god-file extractions landing first, as Phase 2's own
internal gate. Phase 3 makes the office scale.

Phases 4-6 extend the roadmap over the nine categories the second requirements pass added.
Phase 4 is what "leave it running overnight on a repo that matters" actually costs: bounded
blast radius, a record that survives a crash, and — the shape PROJECT.md names verbatim and
which nothing in Phases 1-3 covers — a floor that notices what is *not* happening. Phase 5 is
the floor getting better at its own job: reviews with evidence, memory that is fast, scoped,
current and human-readable, and decisions that outlive a context window. Phase 6 runs GSD on
the floor, fixes the operator's hands, and fits the floor to the operator's actual machine.

**GSD is deliberately last, not first.** It is the operator's own thesis and the instinct is to
lead with it. But every trust property that makes running a GSD phase on the floor better than
running it in one terminal comes from the earlier phases: wave gating needs VERDICT, unattended
running needs VIGIL and GATE, resume-after-crash needs RECORD. Put GSD first and it is a
wrapper around an orchestrator that cannot yet be trusted unattended.

Six phases, coarse granularity. Phases 1-3 keep the shape of GitHub issue #73.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Finish the Floor** - Close all 20 open audit issues, each verified against source, with no partially-landed fix left described as done — plus the five pulled-forward prerequisites without which Phase 1's own criteria are satisfiable by code that does nothing
- [ ] **Phase 2: The Daemon and the Protocol** - The floor runs with no window and is reachable from a phone; all eleven engines are first-class; the two god-files are split first, as this phase's internal gate
- [ ] **Phase 3: Scale and Observability** - Many isolated floors, bulk hiring, a replayable timeline, and a digest that reaches the operator without the app
- [ ] **Phase 4: Overnight on a Repo That Matters** - Blast radius bounded in main on every engine, a record that survives the crash, and a floor that reports absence as an event
- [ ] **Phase 5: The Floor Gets Better at Its Own Job** - Reviews that look at the diff and the check, memory that is fast, server-scoped, dated and hand-editable, and decisions that survive a restart
- [ ] **Phase 6: The Office Runs the Process** - A GSD phase runs on the floor unattended and gated by code; the operator's hands work; the floor fits this machine and these accounts

## Phase Details

### Phase 1: Finish the Floor
**Goal**: Every claim the project makes about itself is true — all 20 open floor-inspection
issues are closed, and each closure was checked against source and a live test run, not
against an agent's report. This comes first regardless of what is more interesting, because
every later phase builds on code whose current state is only partly what the docs say it is.

**Five requirements were pulled forward into this phase.** Each one makes an already-written
Phase 1 success criterion untrue if it lands later, so holding them for Phase 4 or 5 would
mean marking Phase 1 green against code that does not do what the criterion says:

- **RECORD-03 + RECORD-04 ship with FLOOR-10.** `taskSpend()` computes the wrong number twice
  over — it sums `AgentUsageSample` rows that are documented *cumulative*
  (`telemetry.ts:11`, `db.ts:44`), over-counting roughly quadratically, and reads them through
  a 1 MB tail (`COST_TAIL_BYTES`) so a long card's early spend falls out of the window and
  `over` reads false when it is true. Enforcing a cap against that number is worse than having
  no cap.
- **VERDICT-02 + VERDICT-03 ship with FLOOR-08.** As written, FLOOR-08 is satisfiable by
  `sweepTaskReviews` as it stands today: it fires only on the transition to done and
  `continue`s when `leastLoadedIdle` returns nothing, so a card finishing while every other
  agent is busy is never reviewed again, silently — and a reviewer that cannot receive mail
  can still be selected, routing the review into a black hole.
- **GATE-01 is new to this phase.** `hooks.ts:11-18` calls the socket the app's one local
  trust boundary. PR #76 fixed the half that was simply broken (no shim set `payload.sock_token`,
  so `authorized()` rejected every hook). What remains is the security half: one floor-wide
  secret, spread into every PTY by `pty.ts:665`, is readable by every LLM-controlled shell. It
  is not identity, and every record, review and recall written afterwards inherits its
  weakness.

**Depends on**: Nothing (first phase)
**Requirements**: FLOOR-01, FLOOR-02, FLOOR-03, FLOOR-04, FLOOR-05, FLOOR-06, FLOOR-07, FLOOR-08, FLOOR-09, FLOOR-10, FLOOR-11, FLOOR-12, FLOOR-13, FLOOR-14, FLOOR-15, FLOOR-16, FLOOR-17, FLOOR-18, GATE-01, RECORD-03, RECORD-04, VERDICT-02, VERDICT-03
**Success Criteria** (what must be TRUE):
  1. **Autonomy survives the window.** With the app window closed, a message composed in the
     UI still reaches its recipient's inbox and is typed into that agent's terminal, and an
     agent that goes idle mid-queue is still woken. The Stop-drain is either live under
     a guard or deleted along with the doc claims that describe it — **corrected 2026-08-20 (D-37):
     it is NOT dead. `index.ts:467` → `hooks.ts:332` → `delivery.ts:216` is live and guarded, with
     four passing tests, so this branch is already satisfied; what remains is the queue-drain, the
     idle-quiesce backstop, and HIVE.md's four stale denials** — `grep` finds no doc
     promising a code path that does not run. — FLOOR-02
  2. **What ships is on a supported runtime and its provenance is checkable.** The app runs on
     Electron 43.x — **restated 2026-08-20 (D-02): "38+" is stale, because Electron 38 is itself
     end-of-life and a literal reading would let this phase ship the exact unsupported-runtime defect
     FLOOR-03 exists to close. Read it as the latest-3 supported window as of 2026-08** — with `node-pty` and `better-sqlite3` rebuilt, and `npm test` is green on all
     three CI platforms with no `continue-on-error` added. A downloaded release artifact can be
     traced to this repo and this commit via `actions/attest-build-provenance` plus published
     checksums, and the release-link gate runs in the pipeline rather than being a documented
     intention. The docs say plainly that this does **not** suppress SmartScreen — paid signing
     is out on the zero-recurring-cost constraint, and the roadmap does not pretend otherwise.
     — FLOOR-03, FLOOR-06
  3. **Spend, secrets and agent identity are contained, not merely observed.** A secret written
     into an agent's file does not appear in `git log -p` of the hive. A task whose
     `budget-tokens` cap is exceeded is actually stopped or escalated — something consumes
     `taskSpend().over` — and the number it is enforced against is right: spend is summed over
     **all** of that card's rows rather than a 1 MB tail, and derived from the **difference**
     between cumulative usage snapshots rather than their sum. A card given a small cap and run
     long is stopped; a card given a generous cap is not stopped early by double counting.
     Spend on every engine, including the proxy-tier ones, reaches the breaker and can trip it.
     An agent cannot post a hook payload claiming to be a different agent: running `env` or
     `echo $HIVE_SOCK_TOKEN` inside agent A's terminal yields nothing that authenticates as
     agent B, because tokens are per-agent and bound to `agent_id` server-side.
     — FLOOR-04, FLOOR-09, FLOOR-10, RECORD-03, RECORD-04, GATE-01
  4. **The floor is legible to the operator watching it.** An agent card shows at a glance
     that the agent runs with permissions bypassed; the four renderings of an agent agree on
     what they show, cost included; the sidebar collapses responsively; every icon button
     has an accessible name and no user-facing text sits below the 14px floor DESIGN.md
     states; a notification fires when an agent is blocked or finishes a long task and
     clicking it focuses that agent; the log folder opens from Settings. A PTY byte does not
     re-render the roster, and the terminal pool is bounded and disposes on every drop path.
     — FLOOR-01, FLOOR-05, FLOOR-11, FLOOR-12, FLOOR-13, FLOOR-14
  5. **The protocol closes its own loops and the issue list is honest.** An unanswered
     `requires_reply` is chased rather than forgotten. A task marked done is confirmed by an
     agent other than the one that claimed it — **and** a card that flips to done while every
     other agent is busy is still reviewed later rather than never, and a reviewer that cannot
     receive mail is never selected, so on a mixed-engine floor no review is routed into a
     black hole. Memory recall returns only the asking agent's or project's notes, backed by a
     real SQLite FTS index in the already-open `PersistStore` — noting that this clause is
     enforced by an agent-supplied `--wing` flag until RECALL-02 lands in Phase 5, and the docs
     must not claim more than that. The renderer has component tests beyond the boot smoke
     spec. ESLint runs or the 13 orphaned `eslint-disable` comments are gone. Codex-on-Windows
     is either supported or its limitation is stated in source, docs and UI — never a bare
     `return false`. `gh issue list --state open --label floor-inspection` returns only the
     four epics. — FLOOR-07, FLOOR-08, FLOOR-15, FLOOR-16, FLOOR-17, FLOOR-18, VERDICT-02, VERDICT-03
**Plans**: 23 plans across 9 waves

Plans:
- [ ] 01-01-PLAN.md — Electron 32 → 43.x runtime bump (gates every other plan) + the load-ts.cjs wave-0 loader fixes
- [ ] 01-02-PLAN.md — GATE-01 — per-agent hook tokens bound to agent_id server-side; the floor-wide secret deleted
- [ ] 01-03-PLAN.md — FLOOR-08 / VERDICT-02 / VERDICT-03 — the review obligation set; the refuse→redo hole; canReceiveInbox pinned
- [ ] 01-04-PLAN.md — FLOOR-06 / FLOOR-17 — Sigstore attestation, the SmartScreen honesty sentence, bug template, two ADRs
- [ ] 01-05-PLAN.md — FLOOR-11 — adopt the shared hiveTasks poller; pool drop-path audit; create test/repo-claims.test.cjs
- [ ] 01-06-PLAN.md — RECORD-03 / RECORD-04 / FLOOR-09 — one ledger row semantics, clamped-diff spend over all rows, proxy-tier cost to the breaker
- [ ] 01-07-PLAN.md — FLOOR-02a — the idle-quiesce backstop into main's delivery tick; HIVE.md's four stale denials deleted
- [ ] 01-08-PLAN.md — FLOOR-02b — main owns the delivery queue and its drain; producers enqueue over IPC
- [ ] 01-09-PLAN.md — FLOOR-10 — one budget arm in the existing breaker ladder; hive:tasks widened with the meter
- [ ] 01-10-PLAN.md — FLOOR-07 / FLOOR-05 — the FTS5 memory index, the scope honesty pass, and the Settings log-folder button
- [ ] 01-11-PLAN.md — FLOOR-04 — scrub the staged diff with redactSecrets at the single commit choke point
- [ ] 01-12-PLAN.md — FLOOR-01 / FLOOR-13 — the AUTO chip in three renderings, the model field, the 1024px responsive collapse
- [ ] 01-13-PLAN.md — FLOOR-18 / FLOOR-14 — declare the Codex-on-Windows limitation; route the non-Claude blocked transition to notify()
- [ ] 01-14-PLAN.md — FLOOR-12 — the token migration, DESIGN.md §4.1, Rule 1b's two sites, and the four token-coupled files
- [ ] 01-15-PLAN.md — FLOOR-12 sweep — the settings cluster (5 files, ~128 sites)
- [ ] 01-16-PLAN.md — FLOOR-12 sweep — onboarding and pickers (5 files, ~100 sites)
- [ ] 01-17-PLAN.md — FLOOR-12 sweep — command centre, tasks, triggers form, integrations registry (4 files, 109 sites) + all four NOT-exempt glyph cases
- [ ] 01-18-PLAN.md — FLOOR-12 sweep — triggers tabs, git and IDE chrome (12 files, 68 sites), incl. the GitPanes hoisted-object case
- [ ] 01-19-PLAN.md — FLOOR-12 sweep — the eight densest remaining renderer files (8 files, ~85 sites)
- [ ] 01-20-PLAN.md — FLOOR-12 sweep — the rest of the renderer (23 files, ~75 sites), incl. the FullscreenFileEditor hoisted-object case
- [ ] 01-21-PLAN.md — FLOOR-16 — ESLint flat config, two named rules, 9 suppressions made live, 4 dead disables deleted, CI gate at zero warnings
- [ ] 01-22-PLAN.md — FLOOR-15 — renderToStaticMarkup component tests under node --test, zero new dependencies
- [ ] 01-23-PLAN.md — D-45 / D-46 — the repo-fact accumulator asserted whole, the adversarial re-verify, and the mechanical phase gate
**UI hint**: yes

### Phase 2: The Daemon and the Protocol
**Goal**: The office stops depending on a window and stops depending on one engine. Agents
spawn, mail moves and failover completes entirely in main; the operator reaches the floor
from an Android phone; all eleven engines have an inbox, cost accounting and an honest
verification status.

⚠️ **This is the largest risk in the roadmap.** Daemon + phone + public tunnel + MCP +
eleven-engine parity + a 5,620-line extraction + a 3,562-line extraction, in one coarse phase.
The extraction is the item most likely to slip, and if it slips late it takes four other
requirements with it. So it is not a parallel workstream here — it is **criterion 1, and a
gate**: green before any DAEMON-01 work starts.

**Why the god-file extractions live here.** STRUCT-01 (`src/main/index.ts`, 5,620 lines,
~157 IPC handlers, 30+ mutable module globals) and STRUCT-02 (`src/main/hive.ts`, 3,562
lines) are placed in this phase rather than in one of their own, for three concrete reasons:

- **The daemon work has to open exactly these seams anyway.** DAEMON-01 means separating
  window lifecycle from agent lifecycle, scheduler and shutdown inside `index.ts` — which is
  the seam list STRUCT-01 names. PARITY-01a/02 means touching the mail router and the
  per-provider installers and template literals at `hive.ts:679-820` and `:3074-3562` — which
  is the seam list STRUCT-02 names. Doing the extraction as a separate phase means opening
  the same files twice.
- **Without the extraction, DAEMON-01 is unverifiable.** `index.ts` imports `electron`, so it
  cannot be loaded under `node --test`; a headless boot path added in place would be
  untestable by construction. The extraction is what turns "runs headless" from a claim into
  a test — which is the whole point of the project's verification-honesty rule.
- **It must not go in Phase 1.** Phase 1 is small, localised fixes. Landing a 5,620-line
  refactor underneath them would put every fix into moving code and put the "finish the
  floor" goal at risk. Extract *after* the suite is green and the issue list is honest, then
  build the daemon on the extracted seams.

**Why GSD-06 was pulled forward into this phase.** DAEMON-02's whole promise is "answer from
anywhere", and `AskMeTab.tsx:93` is literally `to: 'god'` — so today a human answer has nowhere
to land except the god, and no worker on the floor can ever be unblocked by a person. Without
GSD-06, DAEMON-02's success criterion is satisfiable by a phone screen that can only talk to
one agent.

**Depends on**: Phase 1 — specifically FLOOR-02 (the rest of the autonomy move must be in
main before headless boot means anything), FLOOR-03 (do not build the daemon boot path
twice against two Electron majors), and GATE-01 (the tunnel and the phone put an
authenticated door in front of a floor whose internal identity must already be real).
**Requirements**: DAEMON-01, DAEMON-02, DAEMON-03, DAEMON-04, DAEMON-05, GSD-06, PARITY-01a, PARITY-01b, PARITY-02, PARITY-03, STRUCT-01, STRUCT-02
**Success Criteria** (what must be TRUE):
  1. **[INTERNAL GATE — must be green before DAEMON-01 work starts] The god-files no longer
     block tests.** `src/main/index.ts` and `src/main/hive.ts` are split along the seams their
     own file headers name (agent lifecycle, shutdown, scheduler, ephemeral workers, IPC
     registration; git committer, router, provisioning, ledger, shim templates), `index.ts` is
     left as thin `ipcMain.handle(name, wrapper)` registration, and `npm test` contains tests
     for agent lifecycle, shutdown, the mail router and the git committer that could not be
     written before the split. `npm run build` still works from a clean clone and the suite is
     green on all three platforms. No plan for DAEMON-01, DAEMON-05 or PARITY may start until
     this criterion is verified green — the extraction is the schedule risk, and running it
     underneath the daemon work is how four requirements slip together.
     — STRUCT-01, STRUCT-02
  2. **The floor runs with no window.** Started headless — or with the window quit — agents
     still spawn, mail still routes between them, and an account failover still completes end
     to end. Verifiable two ways: a live run with no window, and a `node --test` case that
     drives the boot path without an Electron binary (which criterion 1 is what makes
     possible). — DAEMON-01
  3. **The operator reaches the floor from a phone, and the answer reaches the right agent.**
     From an Android phone, using the PWA served by the daemon and added to the home screen,
     over an authenticated connection, the operator sees what needs a human and answers it —
     and the answer arrives in **that worker's** terminal, not only the god's, because
     `AskMeTab`'s hardcoded `to: 'god'` is gone and a question can be addressed to any agent.
     A Telegram or Discord message routes onto the existing webhook/Slack rails and reaches the
     intended agent. If no real device is available at plan time, the honest outcome is a
     localhost-verified auth path recorded as such — never a claim of completion.
     — DAEMON-02, DAEMON-03, GSD-06
  4. **What is exposed is exposed on purpose.** Installing an MCP server for an agent requires
     an explicit consent step, and that agent's card afterwards shows which servers it has.
     The public tunnel is off by default and is never enabled as a side effect of anything
     else; it authenticates with a strong **generated** token, never a user-chosen password;
     the auth endpoint rate-limits and locks out; the live public URL is visible in the UI
     whenever the tunnel is up, so it can never be up without the operator seeing it; and
     `stop()` genuinely closes it — verified by a request to the public URL failing after stop,
     not by the absence of an error. — DAEMON-04, DAEMON-05
  5. **Every engine is a first-class citizen, or the UI says so before it matters.** Every
     engine that can have a routed inbox has one — mail addressed to it arrives in its inbox
     and is delivered, not bounced to the god. For any engine that genuinely cannot receive
     mail, the UI says so on the agent card **and** in the assignment flow, before an operator
     assigns mail-dependent work — not only in documentation. All eleven report cost to the
     ledger and to the breaker. The four `live-unverified` bridges (pi, opencode, crush, qwen)
     are unmarked only after a real session against a real account, and otherwise remain
     marked — never silently unmarked.
     — PARITY-01a, PARITY-01b, PARITY-02, PARITY-03
**Plans**: TBD
**UI hint**: yes

### Phase 3: Scale and Observability
**Goal**: One operator runs more than one floor without the floors leaking into each other,
and can see what happened yesterday without having been watching.

⚠️ **Two of this phase's criteria have a forward dependency — read before planning.** Both are
named in REQUIREMENTS.md's own text, and both are recorded here rather than quietly absorbed:

| Criterion | Depends forward on | What a skeptic finds if Phase 3 runs first |
|---|---|---|
| SCALE-03 (replayable timeline) | **RECORD-02** (Phase 4) | The timeline is real, but on a busy day it has holes — `LOG_ROTATE_BYTES` at `hive.ts:267` rotates at 8 MB keeping one generation, so replay reads a window, not the day |
| SCALE-01 (floors do not leak) | **RECALL-02** (Phase 5) | Isolation is enforced by a `--wing` flag the agent supplies and could simply omit. Cooperative, not enforced |

Two ways to resolve, operator's call — the roadmap does not hide the choice:
1. **Run Phase 3 after Phases 4 and 5** (execution order `1 → 2 → 4 → 5 → 3 → 6`). Both
   criteria then hold under a skeptic's test on the day they are marked green.
2. **Run in numeric order and mark the residual gap.** Phase 3 ships the timeline UI and the
   per-project split; SCALE-03 and SCALE-01 stay open concerns until Phase 4's RECORD-02 and
   Phase 5's RECALL-02 land, and are **re-verified after Phase 5** rather than closed in
   Phase 3. Under this project's standing rule — a partially-landed fix is an open concern —
   they may not be checked off before that re-verification.

**Depends on**: Phase 2 — SCALE-01's per-project isolation needs the registry/router split
from STRUCT-02, and SCALE-05's single card needs PARITY-02's all-engine cost. **Forward:**
SCALE-03 on RECORD-02 (Phase 4), SCALE-01 on RECALL-02 (Phase 5), per the table above.
**Requirements**: SCALE-01, SCALE-02, SCALE-03, SCALE-04, SCALE-05
**Success Criteria** (what must be TRUE):
  1. **Two floors do not leak.** With two projects running side by side, an agent in project
     X cannot recall anything an agent in project Y wrote to memory, and neither project's
     task ledger is visible from the other. *Skeptic's check, and the reason for the forward
     dependency above: the agent must be made to ask for everything with no scope flag. If it
     still gets project Y's notes, this criterion is not met — RECALL-02 is what makes it
     enforced rather than cooperative.* — SCALE-01
  2. **A floor comes up in one action.** A team template or bulk import creates a populated
     floor without hiring agents one at a time. — SCALE-02
  3. **Yesterday is replayable.** For a day that has already happened, every hive event,
     envelope and cost appears on one scrubbable timeline. *Skeptic's check: pick a day whose
     log passed 8 MB. If the early hours are missing, this criterion is not met — RECORD-02 is
     the storage this replay reads.* — SCALE-03
  4. **The operator learns what happened without opening the app.** A daily digest reaches
     the operator through an existing channel, and a single agent card shows cost, duration,
     context, account and block state together. — SCALE-04, SCALE-05
**Plans**: TBD
**UI hint**: yes

### Phase 4: Overnight on a Repo That Matters
**Goal**: The floor can be left running unattended on a repository whose contents matter. That
costs three things it does not have: an agent's blast radius bounded in main rather than in one
engine's settings file, a record of what happened that is still on disk after a crash, and a
floor that treats **nothing happening** as an event.

**Why this phase is substrate, and why it reads forward as a dependency.** GATE gives every
later record a trustworthy actor; RECORD gives VIGIL its counters and VERDICT its evidence
store; and VIGIL is the only category in the whole roadmap about *absence* — the failure shape
PROJECT.md names verbatim ("stalls without telling you"), which nothing in Phases 1-3 covers.
Every escalation on the floor today is edge-triggered and `HEARTBEAT_MISSION` ships disabled,
so a floor where the god itself died looks exactly like a floor that is thinking.

**Two categories are split, deliberately.** GATE-01 landed in Phase 1 (per-agent hook identity
must be real before anything records who did what); RECORD-03 and RECORD-04 landed in Phase 1
(they are the arithmetic FLOOR-10's cap is enforced against). Phase 4 carries the remainder of
both: GATE-02..05 and RECORD-01, RECORD-02, RECORD-05.

**Depends on**: Phase 1 — GATE-01, without which a persisted tool-call record attributes to an
agent id any shell could forge. Phase 2 — DAEMON-01 (absence detection and the approval wait
must run in main with no window, or the watchdog dies with the window it was watching for),
DAEMON-02 + GSD-06 (GATE-05's "the operator is asked wherever they are" lands on the phone and
must be addressable to the blocked worker), and STRUCT-01 (the scheduler/heartbeat seam this
phase's watchdog lives in).
**Requirements**: GATE-02, GATE-03, GATE-04, GATE-05, RECORD-01, RECORD-02, RECORD-05, VIGIL-01, VIGIL-02, VIGIL-03, VIGIL-04
**Success Criteria** (what must be TRUE):
  1. **Blast radius is bounded in main, on every engine — not in one engine's settings file.**
     Running `env` inside any agent's terminal shows the hive's own variables and none of the
     operator's cloud, git or API credentials. And `sh -c "rm -rf …"`, `git push origin +main`,
     `curl … | sh`, and a fetch to a host outside the allowlist are each **refused** for a
     Codex, a Grok, a pi and an OpenCode agent — judged in main against the actual command
     string, not by prefix matching in a settings file that only Claude Code reads.
     — GATE-02, GATE-03
  2. **There is a third answer between allow and deny, and sandboxes are opt-in per engine.**
     An agent about to run something unrecoverable stops; the operator is asked wherever they
     are, including on the phone; the call proceeds only on an explicit yes; and the wait is
     bounded and times out to **deny**, so an unanswered prompt fails safe rather than hanging
     a worker forever. Separately, at least one engine runs with its own sandbox **on** and
     still finishes a task, mails and writes memory with no write refused — shipped per-engine
     and opt-in with a verified fallback to today's behaviour, never as a floor-wide flip whose
     failure mode is "the floor silently stops working at 3am".
     — GATE-04, GATE-05
  3. **The record survives the crash, and yesterday reads back whole.** Kill the app mid-run
     and restart it: "who wrote this file, and what did the floor run overnight" is answerable
     from disk, with agent, timestamp, tool and target for every tool call — not from an
     in-memory ring of 200 per agent that is thinnest exactly after a crash. And on a day whose
     hive log passed 8 MB, that day's events and cost are all still readable, so replay reads a
     day rather than a window. — RECORD-01, RECORD-02
  4. **One file can go back to 02:00 without taking three agents' work with it.** The floor
     writes periodic restore points; restoring one file to its 02:00 state leaves the
     operator's index, working tree, branches, `git status` and `git log` untouched, and the
     other agents' work in place. The restore points honour the hive repo's existing
     `UNTRACK_PATHS` discipline, so a fat untracked build directory never lands inside one.
     — RECORD-05
  5. **Nothing happening is itself an event, and waiting is visible.** With every agent quiet
     past the threshold — **including the case where the god itself died** — the operator is
     told **once**, with what was in flight when it stopped. A card whose owner died is back on
     the board within a minute, naming who dropped it and where their branch is, rather than
     reading as in-progress forever. An agent blocked on a prompt reads as blocked with its
     terminal off screen, and is never flipped to idle by the quiesce backstop and then mailed
     more work. Every card and every unanswered ASK ME question renders its age, so a card nine
     hours in `doing` is distinguishable at a glance from one four minutes in.
     — VIGIL-01, VIGIL-02, VIGIL-03, VIGIL-04
**Plans**: TBD
**UI hint**: yes

### Phase 5: The Floor Gets Better at Its Own Job
**Goal**: The floor stops depending on the operator to be its memory and its judgement. A
review looks at what actually changed and records the check outcome; memory answers in
milliseconds, is scoped by the server, says how old it is and whether it is still true, and is
a folder a human can open and edit; and a decision the operator gives once outlives the context
window that heard it.

**VERDICT is split, deliberately.** VERDICT-02 and VERDICT-03 — the "does anyone review, and
can the reviewer even receive mail" half — landed in Phase 1, because without them FLOOR-08 is
satisfiable by code that already exists and silently skips reviews. Phase 5 carries VERDICT-01,
the "with what evidence" half: today `sweepTaskReviews` mails a peer the `title`, `description`
and `result` and asks whether it "holds up" — a review that never looks at a diff.

**RECALL replaces the knowledge graph rather than deferring it.** V2-05 is retired: currency is
one `superseded_at` column, blast radius is `HiveTask.dependsOn` which the UI already reads, and
no query was found that an entity graph answers and FTS5 cannot. RECALL-05 covers the half a
graph was actually wanted for — a human being able to *see* and *edit* the team's knowledge —
with a file convention and no dependency, because Obsidian is free for personal use but licensed
for a 2+ person business and nothing here may require it.

**Depends on**: Phase 1 — GATE-01, which is load-bearing for RECALL-02: "the server enforces
scope" is meaningless while one floor-wide token, readable from every agent's shell, is what
identifies the caller. Phase 2 — PARITY-01a/b for "identically on all eleven engines", and
STRUCT-02 for the router/memory seams. Phase 4 — RECORD-01, which is where a review's check
outcome and a memory's provenance are durably written; on an in-memory ring, RECALL-03's
"agent, date, still-true" is gone after the restart that most needs it.
**Requirements**: VERDICT-01, RECALL-01, RECALL-02, RECALL-03, RECALL-04, RECALL-05, STANDING-01, STANDING-02
**Success Criteria** (what must be TRUE):
  1. **A review looks at what changed, and the card records the check, not just an opinion.**
     The reviewer receives the diff between base and the claimant's branch **and** the result of
     the repo's own check command; the card afterwards carries the check outcome. A card whose
     branch fails the repo's checks cannot be approved on prose alone, and reading the card
     afterwards distinguishes "the checks failed" from "the reviewer disliked the approach".
     — VERDICT-01
  2. **One recall command, milliseconds, all eleven engines, no optional CLI.** The same
     retrieval command issued from a Claude, a Codex, a Grok and a qwen terminal returns the
     same shape and answers in milliseconds, from a real FTS index in the already-open SQLite
     store, served **to** the agent over the already-authenticated hook socket. It is never a
     silent no-op because an optional CLI is absent, and never a cold model load behind a 120 s
     timeout when one is present. — RECALL-01
  3. **Scope is the server's judgement, and every hit is dated and current-or-not.** An agent in
     project X that asks for everything, omitting every scope flag it could omit, gets nothing
     from project Y — this is what makes FLOOR-07's and SCALE-01's isolation claims checkable
     rather than cooperative. Every hit names the agent and date it came from and says whether
     the passage is still present in its source memory or was superseded and when. "Is this
     decision still current?" is answered from that flag and "what depends on this card?" from
     `HiveTask.dependsOn` — with no second store built.
     — RECALL-02, RECALL-03, RECALL-04
  4. **The team's knowledge is a folder a human can read and edit.** `<harnessHome>` opens in
     Obsidian, Logseq, VS Code or plain `grep` as ordinary markdown with `[[wikilinks]]` the
     office parses itself; nothing is installed and nothing is paid for to read it. The
     operator hand-edits a wrong memory in a text editor and the floor picks up the change.
     — RECALL-05
  5. **Decisions survive the context window that heard them.** After a restart wipes the god's
     transcript, the god still knows what the week is for: one ledger card is marked the
     standing objective and its live state rides the roster line the god receives every turn.
     An answer the operator gives once binds every agent — including one hired next week —
     until the operator deletes it, without being retyped into eleven terminals. Both ride the
     prompt-cache-safe position ADR-0002 requires, verified by the cache prefix not re-priming
     each turn. — STANDING-01, STANDING-02
**Plans**: TBD
**UI hint**: yes

### Phase 6: The Office Runs the Process
**Goal**: A GSD phase runs on this floor, unattended, and is genuinely better than running it in
one terminal. Plus the two things that make that liveable: the operator's hands work, and the
floor fits the operator's actual machine and accounts.

**Why GSD is last rather than first.** It is the operator's own thesis and the instinct is to
lead with it. But every property that makes running a GSD phase on the floor better than running
it in one terminal is built earlier: the wave gate needs VERDICT (Phases 1 and 5), unattended
running needs VIGIL and GATE (Phases 1 and 4), resume-after-crash needs RECORD (Phases 1 and 4),
and a checkpoint that reaches a human needs GSD-06 and the phone (Phase 2). Put GSD first and it
is a wrapper around an orchestrator that cannot yet be trusted unattended — which is precisely
the failure it exists to fix.

**GSD is split, deliberately.** GSD-06 landed in Phase 2, because DAEMON-02's "answer from
anywhere" has nowhere to land while `AskMeTab.tsx:93` is hardcoded `to: 'god'`. Phase 6 carries
GSD-01..05.

**Architecture, already decided:** the office **imports** from `.planning/` one-way with a
back-reference and never writes to it. `hive/tasks.json` is already the generic seam with five
writers; a "planned work source" interface with one implementation is the abstraction this
codebase does not need.

**Depends on**: Phases 1-5, concretely rather than decoratively — GSD-01's resume-after-quit
needs RECORD (Phase 1's arithmetic, Phase 4's durability) and its per-worker cap needs FLOOR-10;
GSD-03's non-self-approving wave needs VERDICT-02/03 (Phase 1) and VERDICT-01 (Phase 5);
GSD-04's checkpoint needs GSD-06 and the phone (Phase 2) and GATE-05's approval channel
(Phase 4); GSD-05's card-state-aware reaper needs VIGIL-03 (Phase 4).
**Requirements**: GSD-01, GSD-02, GSD-03, GSD-04, GSD-05, DESK-01, DESK-02, DESK-03, DESK-04, REACH-01, REACH-02, REACH-03
**Success Criteria** (what must be TRUE):
  1. **A GSD phase runs on the floor and survives both the window and the app.** The operator
     mails the god "run phase 2" and the phase runs: each plan in the current wave becomes a
     card and an isolated worker with its own cost line, token cap, breaker and inbox. Closing
     the window does not stop it, and quitting and reopening the app resumes the wave rather
     than leaving half-done worktrees. The `gsd-sdk` frontmatter read goes through **one
     adapter with a golden fixture** — feed it a changed schema and it fails loudly with a
     named error; it never degrades silently to a one-plan wave. `.planning/` is read one-way
     with a back-reference and is not written to — `git status` in `.planning/` is clean after
     a full wave. — GSD-01
  2. **The wave gate is code, not the orchestrator's care.** A wave whose plans declare
     overlapping `files_modified` **refuses to start**, naming the plans and the colliding
     files — the disjoint-ownership discipline that ran three multi-agent runs here with zero
     conflicts, and whose one gap caused #75, now enforced by the machine. The next wave opens
     only after a reviewer other than the executor has checked each plan against that plan's
     own written acceptance criteria, and a refusal returns the card to `doing` without
     involving the operator. — GSD-02, GSD-03
  3. **A gate reaches a human, and waiting for one is not fatal.** A plan that hits a
     checkpoint blocks its card, with the question on the ASK ME board showing what is stuck
     behind it; the operator answers from the desk or the phone and the answer types into that
     worker's terminal. A worker blocked on a question is still alive well past the idle-reap
     window, because the reaper reads card state rather than PTY silence. Running a GSD phase
     unattended no longer requires turning the gates off. — GSD-04, GSD-05
  4. **The operator's hands work.** "Kill all & quit" lists, per agent, dirty file count,
     commits ahead of base, queued-undelivered messages and unanswered questions — and still
     paints within a frame when git is slow. Up/Down and a fuzzy search recall a past prompt
     from the SQLite history table into the **draft box**, never straight into a PTY, so
     ADR-0001 stays intact. Floor-wide auto-delivery pause is visible without selecting the god
     and reports the whole floor, so a paused floor never reads as one quiet agent. An agent
     renamed after hiring receives mail at its new name, shows the old name nowhere in the UI,
     and keeps its existing memory and ledger rows attributed to the same agent.
     — DESK-01, DESK-02, DESK-03, DESK-04
  5. **The floor fits this machine and these accounts, or says plainly that it does not.** Two
     Claude Code agents on one floor run under different Claude Code profiles — settings, MCP
     servers, permissions — and neither inherits the other's. A Claude agent pointed at Amazon
     Bedrock reports spend to the same ledger and trips the same breaker as a direct-API agent;
     without an operator-supplied AWS account it ships **marked unverified** under PARITY-03's
     rule, never claimed. On Windows an agent's CLI runs inside a WSL2 distro with worktree
     path, PTY and hook socket all resolving across the boundary and the same hive housekeeping
     working there; without a real WSL2 install the limitation is stated in source, docs and UI
     — never a bare unexplained `return false`. — REACH-01, REACH-02, REACH-03
**Plans**: TBD
**UI hint**: yes

## External Dependencies

Five requirements have a last mile no phase can force. Named here so the roadmap does not
pretend otherwise, per the project's verification-honesty rule:

| Requirement | Needs | Phase |
|-------------|-------|-------|
| PARITY-03 | pi, opencode, crush and qwen CLIs installed with real accounts — operator-supplied. Each engine needs its own subscription, which this project does not have | 2 |
| DAEMON-02 | A real Android device on the network for the last mile of the authenticated connection | 2 |
| GATE-04 | The same four engine CLIs — an engine's own sandbox cannot be verified on an engine that has never been run | 4 |
| REACH-02 | An AWS account with Bedrock model access | 6 |
| REACH-03 | A real WSL2 install on the Windows machine | 6 |

If the operator cannot supply these at plan time, the honest outcomes are: the bridges stay
marked `live-unverified`; DAEMON-02 lands with a localhost-verified auth path; GATE-04 ships
enabled only for the engines actually exercised, with the rest on today's behaviour; REACH-02
ships marked unverified; REACH-03 ships with its limitation stated in source, docs and UI. Not
that any of them is claimed complete.

## Standing Constraints

Carried from PROJECT.md; every phase inherits them:

- **Zero recurring cost. Total roadmap cost: $0.** One-time purchases are allowed; a
  subscription, an annual renewal or a metered API on a required path is not. No paid
  certificate, no paid notarization, no hosted embeddings, no metered tunnel. A capability that
  cannot be built under this rule ships with its limitation stated out loud — never quietly
  reinterpreted into something cheaper.
- **Local-only personal tool, not a published product.** One operator, one machine, no
  distribution. Android-only for mobile — the phone surface is a PWA served by the daemon; iOS
  is out of scope entirely.
- Node 22 for anything native — Node 24 has no `better-sqlite3` prebuild and breaks
  `node-pty`'s winpty gyp.
- `package-lock.json` is written by npm 10, never npm 11.
- All three CI platforms are hard gates. No `continue-on-error` may be added to the matrix.
- **A partially-landed fix is an open concern, not a closed one.** "Fixed" is a claim until
  re-verified against source and a live test run. Four issues were over-claimed and had to be
  reopened, and a Critical (#75) shipped because a three-file contract had no owner for its
  third file. Every success criterion above is written so a skeptic can check it by running or
  clicking something.
- The repo stays public — GitHub Actions is unmetered on public repositories and CI is
  load-bearing here.
- Accessibility stays in scope regardless of the personal-tool constraint: the sub-14px text and
  unlabelled icon buttons are a daily annoyance for the one person using this.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6.

⚠️ **One documented alternative:** running `1 → 2 → 4 → 5 → 3 → 6` closes SCALE-03's forward
dependency on RECORD-02 and SCALE-01's on RECALL-02 before those criteria are ever marked green.
See the table under Phase 3. Under numeric order, SCALE-01 and SCALE-03 must be re-verified
after Phase 5 rather than closed in Phase 3.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Finish the Floor | 0/TBD | Not started | - |
| 2. The Daemon and the Protocol | 0/TBD | Not started | - |
| 3. Scale and Observability | 0/TBD | Not started | - |
| 4. Overnight on a Repo That Matters | 0/TBD | Not started | - |
| 5. The Floor Gets Better at Its Own Job | 0/TBD | Not started | - |
| 6. The Office Runs the Process | 0/TBD | Not started | - |

---
*Roadmap created: 2026-08-20*
*Extended 2026-08-20: Phases 4-6 added over the nine new requirement categories; six
prerequisites pulled forward into Phases 1 and 2; STRUCT-01/02 made Phase 2's internal gate.*
