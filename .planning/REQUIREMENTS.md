# Requirements: Hello MarkX

**Defined:** 2026-08-20
**Core Value:** You can leave it running and trust it.

Every requirement below traces to a GitHub issue that carries file:line evidence. Where an
issue is *partially* landed, the requirement states only what is **still missing** — the
shipped half is recorded under "Validated" in `PROJECT.md`, not re-litigated here.

## v1 Requirements

### FLOOR — Finish what was started (the 20 open issues)

- [ ] **FLOOR-01**: Auto-mode is visible on the agent card, so an operator can see at a
      glance that an agent is running with permissions bypassed — #4
      *(the `permissions.deny` list already ships; only the surfacing is missing)*
- [ ] **FLOOR-02**: Closing or reloading the window does not stop **any** delivery path —
      the queue-drain and the idle-quiesce backstop move to main alongside the nudge, and the
      Stop-drain's own doc claims are made true — #5
      *(**Premise corrected 2026-08-21 (D-37).** This read "the **dead** Stop-drain is either
      restored under a guard or deleted with its doc claims". The drain is not dead and never
      was: `index.ts:545` → `hooks.ts:663` → `delivery.ts:604` → `hive.ts:1368`, with the cursor
      advanced at `hive.ts:1375`, all live and guarded by `stop_hook_active`. `ROADMAP.md`
      already carried this correction; this file did not, and a requirement stating undone work
      that is done is the same false claim in the other direction. Locate every anchor above by
      content — the line numbers drifted twice during Phase 1.)*
- [ ] **FLOOR-03**: Electron is on a supported major — **Electron 43.x**, with `node-pty` and
      `better-sqlite3` rebuilt and the three-platform suite still green — #10 (see the pointer
      note below)
      *(**Restated 2026-08-21 (D-02).** This read "a supported major (**38+**)". Electron 38 is
      itself end-of-life, so a literal reading would let this requirement ship the exact
      unsupported-runtime defect it exists to close. Read it as the latest-3 supported window as
      of 2026-08. `PROJECT.md` carried the same stale "38+" and is corrected with it.)*
      *(**Issue pointer is wrong and has no correct replacement.** #10 is "H2 — Network and
      secret hygiene" and its body carries **no** Electron clause; the end-of-life-Electron issue
      is **#8**, which is CLOSED. So FLOOR-03 currently traces to no open issue. Filed by plan
      01-11, recorded here rather than silently repointed — inventing a trace is worse than
      naming a missing one. FLOOR-04 is the clause of #10 that is genuinely FLOOR-04's.)*
- [ ] **FLOOR-04**: A secret written into an agent's files is scrubbed before the hive
      commits it, so it never reaches git history — #10
- [ ] **FLOOR-05**: An operator can open the log folder from Settings without knowing where
      Electron puts it — #13
- [ ] **FLOOR-06**: A downloaded release can be proven to come from this repo and this
      commit, and the release-link gate runs in the pipeline — #15
      *(**Scope changed deliberately.** #15 asked for Windows code signing. Every route to
      that is paid — Azure Trusted Signing $9.99/mo, EV certs $400–900/yr, Apple Developer
      $99/yr — and this project's zero-recurring-cost constraint forbids it. The free path
      that delivers most of the actual value is `actions/attest-build-provenance` (Sigstore,
      free on public repos) plus published checksums: a user can verify the artifact came
      from this commit. What it does **not** buy is SmartScreen suppression, so the docs must
      say so plainly. Revisit only if the operator chooses to pay.)*
- [ ] **FLOOR-07**: Memory recall is scoped per agent/project, and the SQLite FTS index the
      docs promise actually exists in the already-open `PersistStore` — #16, #31, #32
      ⚠️ **Three subsystems wearing one line**, and one clause is only honest server-side:
      "scoped per agent/project" is enforced today by a `--wing` flag the agent supplies and
      could simply omit. **RECALL-02 is the real version of this clause**, and the same applies
      to SCALE-01's isolation criterion.
- [ ] **FLOOR-08**: "Done" is verified by someone other than the agent that claimed it, and
      an unanswered `requires_reply` is chased rather than forgotten — #18
      ⚠️ **Ship with VERDICT-01/02/03 or it means nothing.** As written this is satisfiable by
      code that never looks at a diff — `sweepTaskReviews` mails a peer the `title`,
      `description` and `result` and asks whether it "holds up". Worse, it fires only on the
      transition to done and `continue`s when `leastLoadedIdle` returns nothing, so a card that
      finishes while every other agent is busy is **never reviewed again, silently**.
- [ ] **FLOOR-09**: Every engine's spend reaches the breaker, and the god is told per-engine
      capabilities in a prompt-cache-safe position — #19
- [ ] **FLOOR-10**: A per-task token budget is **enforced**, not merely reported — something
      consumes `taskSpend().over` — #34
      ⚠️ **Blocked on RECORD-03 + RECORD-04, which must land with it.** `taskSpend()` currently
      computes the wrong number twice over: it sums `AgentUsageSample` rows that are documented
      *cumulative* (`telemetry.ts:11`, `db.ts:44`), over-counting roughly quadratically, and it
      reads them through a 1 MB tail (`COST_TAIL_BYTES`) so a long card's early spend falls out
      of the window and `over` reads false when it is true. Enforcing a cap against that number
      is worse than having no cap.
- [ ] **FLOOR-11**: A PTY byte does not re-render the roster; the terminal pool is bounded
      and disposes on every drop path — #20
- [ ] **FLOOR-12**: Icon buttons have accessible names and text meets the DESIGN.md floor of
      14px — #26
- [ ] **FLOOR-13**: The sidebar collapses responsively and the four renderings of an agent
      agree on what they show, including cost — #38, #39
- [ ] **FLOOR-14**: A notification fires when an agent is blocked or finishes a long task,
      and clicking it focuses that agent — #42
- [ ] **FLOOR-15**: The renderer has real test coverage beyond a boot smoke test — #45
- [ ] **FLOOR-16**: ESLint (or a deliberate decision not to lint) replaces the 13 orphaned
      `eslint-disable` comments — #36
- [ ] **FLOOR-17**: The bug template asks for logs that exist, and `docs/adr/` is the home
      for rationale currently buried in long source comments — #41
- [ ] **FLOOR-18**: Codex-on-Windows is either supported or its limitation is stated in
      source, docs and UI — never a bare unexplained `return false` — #61

### DAEMON — Run without a window

- [ ] **DAEMON-01**: The floor runs with no window open — agents spawn, mail moves, failover
      happens, entirely in the main process
- [ ] **DAEMON-02**: An operator can reach their floor from an **Android** phone over an
      authenticated connection, and see and act on what needs them. Delivered as a **PWA**
      served by the daemon — added to the home screen, no app store, no cost. Verification
      needs a real device on the network (operator-supplied); a localhost-verified auth path
      is the honest fallback if that is unavailable at plan time.
      *(iOS is out of scope, which removes Apple's $99/yr entirely. A Play Store build is a
      $25 one-time option later and gates nothing.)*
- [ ] **DAEMON-03**: Inbound Telegram/Discord messages route onto the existing webhook/Slack
      rails so an operator can answer an agent from their phone
- [ ] **DAEMON-04**: MCP servers are installable per agent, with consent, and visible on the
      agent card
- [ ] **DAEMON-05**: The same PWA is reachable **over the public tunnel**, not only the LAN —
      operator's explicit decision. Because this puts an authenticated door to a floor of
      agents with bypassed permissions on the public internet, it must hold a higher bar than
      the LAN path:
      - off by default, and never enabled as a side effect of anything else
      - a strong **generated** token, never a user-chosen password
      - rate limiting and lockout on the auth endpoint
      - the live public URL always visible in the UI, so the tunnel can never be up without
        the operator seeing it
      - `stop()` genuinely closes it — today it cannot, and `slack.ts` carries a comment
        admitting so. That is a prerequisite, not a nice-to-have.

### PARITY — Every engine a first-class citizen

- [ ] **PARITY-01a**: Every engine that *can* have a routed inbox has one — mail addressed to
      it arrives in its inbox and is delivered, not bounced to the god
- [ ] **PARITY-01b**: For any engine that genuinely cannot receive mail, the UI says so
      **before** an operator assigns mail-dependent work — on the agent card and in the
      assignment flow, not only in documentation
      *(Split deliberately. The original "…**or** the UI states plainly…" let a skeptic be
      unable to distinguish "we routed the inbox" from "we wrote a label". Each half is now
      separately checkable, and the plan must say which engines fall under which.)*
- [ ] **PARITY-02**: All eleven engines report cost to the ledger and to the breaker
- [ ] **PARITY-03**: The four `live-unverified` bridges (pi, opencode, crush, qwen) are
      either verified against a real session and unmarked, or still marked — never silently
      unmarked

### SCALE — Many floors, and a visible yesterday

- [ ] **SCALE-01**: Two projects run side by side without reading each other's memory or
      task ledger
- [ ] **SCALE-02**: A team template or bulk import creates a floor without hiring agents
      one at a time
- [ ] **SCALE-03**: Every hive event, envelope and cost is replayable on one timeline
- [ ] **SCALE-04**: A daily digest reaches the operator without opening the app
- [ ] **SCALE-05**: One agent card shows cost, duration, context, account and block state

### STRUCT — Structural debt that blocks testing

- [ ] **STRUCT-01**: `src/main/index.ts` is split along its seams (agent lifecycle, shutdown,
      scheduler, workers, IPC), each extraction landing tests that cannot exist today
- [ ] **STRUCT-02**: `src/main/hive.ts` is split (git committer, messaging, provider
      provisioning, templates)

### GATE — the trust boundary: what an agent may do, and who says yes

- [ ] **GATE-01**: An agent cannot post a hook payload claiming to be a **different** agent,
      and the token that authenticates the socket is not readable from any agent's shell.
      *Status: half done.* PR #76 fixed the half that was simply broken — no shim set
      `payload.sock_token`, so `authorized()` rejected every hook and the whole floor was
      silent. What remains is the security half: the token is a **single floor-wide secret**
      and `pty.ts:665` spreads `process.env` into every PTY, so every LLM-controlled shell can
      read it. Against a prompt-injected agent the check buys nothing. The fix is **per-agent
      tokens bound to `agent_id` server-side** — exactly the threat `hooks.ts:11-18` names.
- [ ] **GATE-02**: `env` inside any agent terminal shows the hive's own variables and not the
      operator's cloud, git or API credentials — *distinct from FLOOR-04, which protects the
      hive's git history, not the child env of a shell an agent controls*
- [ ] **GATE-03**: A tool call is judged in main against the actual command string, on every
      engine — `sh -c "rm -rf …"`, `git push origin +main`, `curl … | sh` and a fetch to a host
      outside an allowlist are each refused for a Codex, Grok, pi or OpenCode agent, not only
      for Claude Code *(today `AGENT_DENY_RULES` is prefix matching written into one engine's
      settings file; the other ten take no settings file at all)*
- [ ] **GATE-04**: An agent runs with its engine's own sandbox **on** and still completes hive
      housekeeping — it finishes a task, mails, and writes memory with no write refused
      *(disabled at `agentProvider.ts:216-226` because `workspace-write` blocked
      `<harnessHome>/hive/agents/<id>/` — a path-tree problem, not a security judgement)*
      ⚠️ Ship **per-engine and opt-in**, with a verified fallback to today's behaviour. Eleven
      engines with different sandbox semantics across three OSes; the failure mode of a
      floor-wide flip is "the floor silently stops working at 3am", which is worse than the
      failure it prevents.
- [ ] **GATE-05**: There is a third answer between allow and deny — an agent about to run
      something unrecoverable stops, the operator is asked wherever they are, and the call
      proceeds only on an explicit yes, with a bounded wait that times out to deny *(today
      `control.ts:97` returns `{deny}` synchronously and human approval "rides Claude's native
      prompt", which `autoMode: true` suppresses — the floor has deny and bypass, nothing
      between)*

### RECORD — what happened is still on disk tomorrow

- [ ] **RECORD-01**: "Who wrote this file, and what did the floor run overnight" is answerable
      after a restart — every agent tool call is persisted with agent, timestamp, tool and
      target *(today spans are an in-memory ring of 200 per agent, `telemetry.ts:126`, so the
      record is thinnest exactly after a crash)*
- [ ] **RECORD-02**: A day that has already happened is still fully readable — a busy day's
      events and cost have not been discarded by an 8 MB rotate-keeping-one-generation window
      *(`LOG_ROTATE_BYTES`, `hive.ts:267` — this is the storage SCALE-03's replay reads)*
- [ ] **RECORD-03**: `taskSpend()` on a long, expensive card reports `over` true when it is
      true — spend is computed over all of that card's rows, not a 1 MB tail
      *(`COST_TAIL_BYTES`)* — **prerequisite of FLOOR-10**
- [ ] **RECORD-04**: A card's spend is not double-counted — cost is derived from the
      **difference** between cumulative usage snapshots, not their sum *(`AgentUsageSample`
      rows are documented cumulative at `telemetry.ts:11` and `db.ts:44`; `taskSpend()` sums
      them, over-counting roughly quadratically)* — **prerequisite of FLOOR-10**
- [ ] **RECORD-05**: The operator can put one file back to how it was at 02:00 without losing
      three other agents' work — the floor writes periodic restore points that leave the
      operator's index, working tree, branches, `git status` and `git log` untouched
      *(`isolate` defaults to false, so the ordinary floor is N agents sharing one working tree
      with no restore point)*
      ⚠️ Must reuse the hive repo's existing `UNTRACK_PATHS` ignore discipline — a bare
      `add -A` over a tree with a fat untracked build directory produces enormous commits.

### VIGIL — the floor notices what is *not* happening

- [ ] **VIGIL-01**: Nothing happening is itself an event — when no card advances, no mail
      routes and no spend lands for longer than a threshold, the operator is told once, with
      what was in flight when it stopped, **including the case where the god itself died**
      *(every escalation today is edge-triggered; `HEARTBEAT_MISSION` ships disabled)*
- [ ] **VIGIL-02**: A card whose owner died goes back on the board within a minute, naming who
      dropped it and where their branch is, rather than reading as in-progress forever
      *(`teardownPty` clears breaker/control/telemetry and touches the ledger not at all)*
- [ ] **VIGIL-03**: An agent blocked on a prompt is visibly blocked even when its terminal is
      not on screen, and is never flipped to idle by the quiesce backstop and then mailed more
      work *(only the mounted terminal is parsed today — `terminalPool.ts:57` has a single
      `onData` slot, and `useHive.ts:697-726` says so in its own comment)*
- [ ] **VIGIL-04**: The board shows how long something has been waiting — every card and every
      unanswered ASK ME question renders its age, so a card nine hours in `doing` is
      distinguishable at a glance from one four minutes in *(`HiveTask` has `createdAt` and no
      `updatedAt`; `humanQA.askedAt` is parsed and rendered nowhere)*

### VERDICT — "done" means someone else checked, with evidence

- [ ] **VERDICT-01**: A review looks at what changed — the reviewer receives the diff between
      base and the claimant's branch plus the result of the repo's own check command, and the
      card afterwards records the check outcome, not only an opinion
- [ ] **VERDICT-02**: No card reaches `done` unreviewed because nobody happened to be free at
      that instant — a card that flips to done while every other agent is busy is still
      reviewed later — **prerequisite of FLOOR-08**
- [ ] **VERDICT-03**: ALREADY LIVE IN SOURCE — the `canReceiveInbox` filter inside
      `leastLoadedIdle` (`src/main/hive.ts:1908` at wave 9; it sat at `:1746`, then `:1786`, as
      Phase 1 grew the file — re-derive it by content match, never by line number) means a reviewer that
      cannot receive mail is never selected, so on a mixed-engine floor a review is not routed
      into a black hole. The old parenthetical *(filter on `canReceiveInbox`)* read as undone
      work and was itself a false claim this project made about itself. Plan 01-03 PINS the
      shipped behaviour with the named test *"a reviewer whose engine cannot receive mail is
      never selected"* in `test/hive-protocol-v2.test.cjs` instead of rebuilding working code.
      The box stays unchecked only because the phase gate (plan 23) owns checking it —
      **prerequisite of FLOOR-08**

### RECALL — memory an agent can actually use

- [ ] **RECALL-01**: One retrieval command works identically on all eleven engines and answers
      in milliseconds, from an FTS index in the already-open SQLite store — with no dependency
      on an optional CLI that is a silent no-op when absent and a cold model load behind a
      120 s timeout when present
      ⚠️ `kg-core.cjs` is deliberately pure JS so it loads under a plain `node` from an agent's
      shell, and `better-sqlite3` is built for Electron's ABI. FTS5 must therefore be **served
      to** agents over the already-authenticated hook socket, not linked into the agent CLI.
- [ ] **RECALL-02**: Scope is enforced by the **server**, not by a flag the agent could omit —
      an agent in project X gets nothing from project Y even when it asks for everything
      *(the only honest form of FLOOR-07's and SCALE-01's isolation claims)*
- [ ] **RECALL-03**: Every hit says where it came from and whether it is still true — agent,
      date, and whether the passage is still present in its source memory or was superseded and
      when. An agent acting confidently on a reversed decision is worse than one with no memory.
- [ ] **RECALL-04**: The two questions people want a graph for are answerable **without** one —
      "is this decision still current?" from RECALL-03's supersession flag, and "what depends on
      this card?" from `HiveTask.dependsOn`, which the UI already reads. No second store is
      built. *(This **retires** V2-05 rather than deferring it.)*
- [ ] **RECALL-05**: `<harnessHome>` is a plain-markdown, **Obsidian-compatible vault** — agents
      write `[[wikilinks]]` between notes, the office parses those links itself, and opening the
      folder in Obsidian, Logseq, VS Code or `grep` shows the whole team's knowledge with no
      extra tooling and no cost. The operator can hand-edit a wrong memory and the change is
      picked up.
      *(Operator's idea. Distinct from RECALL-04, which answers the two machine queries: this is
      about the knowledge being legible and editable by a **human**. Deliberately a file
      convention, never a dependency — Obsidian is free for personal use but licensed for a 2+
      person business, so nothing may require it.)*

### STANDING — decisions that survive a context window

- [ ] **STANDING-01**: The god still knows what the week is for after a restart wipes its
      transcript — one ledger card can be marked the standing objective, and its live state
      rides the roster line the god receives every turn, in the prompt-cache-safe position
      ADR-0002 requires
- [ ] **STANDING-02**: An answer the operator gives once binds every agent, including agents
      hired next week — a decision marked standing is injected at every agent's next prompt
      boundary until the operator deletes it, without retyping it into eleven terminals and
      without invalidating the prompt cache

### GSD — the office runs GSD workflows natively

- [ ] **GSD-01**: The operator mails the god "run phase 2" and the phase runs on the floor —
      each plan in the current wave becomes a card and an isolated worker with its own cost
      line, token cap, breaker and inbox; closing the window does not stop it, and quitting and
      reopening the app resumes the wave rather than leaving half-done worktrees
      ⚠️ Reads `gsd-sdk`, which is operator-owned and versioned independently via
      `/gsd-update`. The frontmatter read goes behind **one adapter with a golden fixture** and
      must fail loudly on a schema change — silently degrading to a one-plan wave would be
      worse than not having the feature.
      **Architecture, decided:** the office **imports** from `.planning/` one-way with a
      back-reference and **never writes to it**. `hive/tasks.json` is already the generic seam
      with five writers; a "planned work source" interface with one implementation is the
      abstraction this codebase does not need.
- [ ] **GSD-02**: A wave whose plans overlap on files does not start — the pre-flight check
      compares each plan's declared `files_modified` and refuses, naming the plans and the files
      that collide *(this is the disjoint-ownership discipline that ran three multi-agent runs
      here with zero conflicts — and whose one gap caused #75 — enforced by code instead of by
      the orchestrator's care)*
- [ ] **GSD-03**: A wave does not advance on the executor's own say-so — the next wave opens
      only after a reviewer other than the executor has checked each plan against that plan's
      written acceptance criteria, and a refusal returns the card to `doing` without involving
      the operator
- [ ] **GSD-04**: A GSD gate reaches a human instead of a terminal nobody is watching — a plan
      that hits a checkpoint blocks its card with the question on the ASK ME board showing what
      is stuck behind it, and the operator's answer types into that worker's terminal *(today
      the only way to run a GSD phase unattended is to turn the gates off)*
- [ ] **GSD-05**: A worker waiting on a human is not reaped for being quiet — the idle reaper is
      aware of card state *(today the reap measures PTY output silence only, so a worker blocked
      on a question dies in twenty minutes by construction)*
- [ ] **GSD-06**: A human answer can be addressed to **any** agent, not only the god *(today
      `AskMeTab.tsx:93` is literally `to: 'god'`, so no worker on the floor can ever be unblocked
      by a person)* — **prerequisite of DAEMON-02**: the phone's "answer from anywhere" has
      nowhere to land without it

### DESK — the operator's hands

- [ ] **DESK-01**: "Kill all & quit" is a decision rather than a gamble — the quit dialog lists,
      per agent, dirty file count, commits ahead of base, queued-undelivered messages and
      unanswered questions, and still paints within a frame when git is slow
- [ ] **DESK-02**: A prompt typed once can be recalled — Up/Down and a fuzzy search over prompt
      history work in the composer, reading the SQLite history table that three call sites write
      and nothing reads. Recall lands in the **draft box**, never straight into a PTY, so
      ADR-0001 stays intact
- [ ] **DESK-03**: Floor-wide auto-delivery pause is visible without selecting the god, and
      reports the whole floor rather than one agent's state *(the entire floor can be paused
      while the agent you are watching merely looks quiet)*
- [ ] **DESK-04**: An agent can be renamed after hiring and stays reachable — mail addressed to
      the new name arrives, the old name appears nowhere in the UI, and existing memory and
      ledger rows still attribute to the same agent — upstream #188

### REACH — which provider, which account, which machine

- [ ] **REACH-01**: Two Claude Code agents on one floor run under different Claude Code profiles
      — different settings, MCP servers and permissions — and neither inherits the other's —
      upstream #105
- [ ] **REACH-02**: A Claude agent can be pointed at Amazon Bedrock instead of the Anthropic
      API, and its spend reaches the same ledger and the same breaker as a direct-API agent —
      upstream #68 · *verification needs an operator-supplied AWS account with Bedrock model
      access; without one the bridge ships marked unverified, under PARITY-03's rule*
- [ ] **REACH-03**: On Windows, an agent's CLI runs inside a WSL2 distro with its worktree path,
      PTY and hook socket all resolving across the boundary, and the same hive housekeeping that
      works natively works there — upstream #146 · *verification needs a real WSL2 install*

## v2 Requirements

Tracked, deliberately not in this roadmap.

### Deferred

*(none — the five previously-deferred items are now v1 requirements or retired)*

| Was | Now |
|-----|-----|
| V2-01 Editable agent names (#188) | **DESK-04** |
| V2-02 Claude Code profiles (#105) | **REACH-01** |
| V2-03 Amazon Bedrock (#68) | **REACH-02** |
| V2-04 WSL2 support (#146) | **REACH-03** |
| V2-05 A real knowledge **graph** | **Retired** — see below |

#### Why the knowledge graph is retired, not deferred

The operator asked for the entity/edge graph to be *covered* rather than deferred. The honest
finding is that **there is no entity graph worth building here**, and RECALL-01…05 is what
covering it actually looks like.

The memory lens went looking for a query an entity/edge graph answers that FTS5 cannot, and
that an agent on this floor would actually issue. It could not name one. The two capabilities
people mean by "graph" here are:

- **Currency** — *"is this decision still current?"* — is one `superseded_at` column, not a
  traversal. That is RECALL-03, and the failure it fixes is documented in the source: until a
  wing is re-mined, search keeps returning decisions that no longer exist in the memory they
  came from.
- **Blast radius** — *"what depends on this card?"* — is `HiveTask.dependsOn`, already
  persisted **and already read** by `AskMeTab.tsx` and `TasksKanban.tsx`. Building a graph
  store to answer it would be building the answer next to the answer.

What is left is multi-hop *"facts related to facts related to X"* — what graph databases exist
for, and what no single operator reads twice.

Two related claims were checked and found **false**, so nothing else is owed: `README.md:101`
does not overclaim, and `kg-core.cjs:2-8` already carries an honest description. "Enterprise
Knowledge Graph" survives only as a doc title and one comment.

**RECALL-05 covers the half a graph was really wanted for** — a human being able to *see* and
*edit* the team's knowledge — and does it with a file convention rather than a database.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Training or fine-tuning models | This orchestrates agent CLIs; it never owns weights |
| Becoming an IDE | The file/diff pane exists for context, not to live in |
| Hosted multi-tenant service | Single-operator, local-first by design |
| Replacing the agent CLIs | The value is orchestration and visibility |
| Marking an unrun engine bridge as verified | Would be a lie in the source; see PARITY-03 |
| Fixing the 11 "known Windows failures" | Done — 7 were real source bugs, all closed |

## Traceability

Every v1 requirement maps to exactly one phase. See `.planning/ROADMAP.md` for the phase
goals and success criteria each requirement rolls up into.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FLOOR-01 | Phase 1 | Pending |
| FLOOR-02 | Phase 1 | Pending |
| FLOOR-03 | Phase 1 | Pending |
| FLOOR-04 | Phase 1 | Pending |
| FLOOR-05 | Phase 1 | Pending |
| FLOOR-06 | Phase 1 | Pending |
| FLOOR-07 | Phase 1 | Pending |
| FLOOR-08 | Phase 1 | Pending |
| FLOOR-09 | Phase 1 | Pending |
| FLOOR-10 | Phase 1 | Pending |
| FLOOR-11 | Phase 1 | Pending |
| FLOOR-12 | Phase 1 | Pending |
| FLOOR-13 | Phase 1 | Pending |
| FLOOR-14 | Phase 1 | Pending |
| FLOOR-15 | Phase 1 | Pending |
| FLOOR-16 | Phase 1 | Pending |
| FLOOR-17 | Phase 1 | Pending |
| FLOOR-18 | Phase 1 | Pending |
| DAEMON-01 | Phase 2 | Pending |
| DAEMON-02 | Phase 2 | Pending |
| DAEMON-03 | Phase 2 | Pending |
| DAEMON-04 | Phase 2 | Pending |
| DAEMON-05 | Phase 2 | Pending |
| PARITY-01a | Phase 2 | Pending |
| PARITY-01b | Phase 2 | Pending |
| PARITY-02 | Phase 2 | Pending |
| PARITY-03 | Phase 2 | Pending |
| SCALE-01 | Phase 3 | Pending |
| SCALE-02 | Phase 3 | Pending |
| SCALE-03 | Phase 3 | Pending |
| SCALE-04 | Phase 3 | Pending |
| SCALE-05 | Phase 3 | Pending |
| STRUCT-01 | Phase 2 | Pending |
| STRUCT-02 | Phase 2 | Pending |
| GATE-01 | Phase 1 | Pending |
| GATE-02 | Phase 4 | Pending |
| GATE-03 | Phase 4 | Pending |
| GATE-04 | Phase 4 | Pending |
| GATE-05 | Phase 4 | Pending |
| RECORD-01 | Phase 4 | Pending |
| RECORD-02 | Phase 4 | Pending |
| RECORD-03 | Phase 1 | Pending |
| RECORD-04 | Phase 1 | Pending |
| RECORD-05 | Phase 4 | Pending |
| VIGIL-01 | Phase 4 | Pending |
| VIGIL-02 | Phase 4 | Pending |
| VIGIL-03 | Phase 4 | Pending |
| VIGIL-04 | Phase 4 | Pending |
| VERDICT-01 | Phase 5 | Pending |
| VERDICT-02 | Phase 1 | Pending |
| VERDICT-03 | Phase 1 | Pending |
| RECALL-01 | Phase 5 | Pending |
| RECALL-02 | Phase 5 | Pending |
| RECALL-03 | Phase 5 | Pending |
| RECALL-04 | Phase 5 | Pending |
| RECALL-05 | Phase 5 | Pending |
| STANDING-01 | Phase 5 | Pending |
| STANDING-02 | Phase 5 | Pending |
| GSD-01 | Phase 6 | Pending |
| GSD-02 | Phase 6 | Pending |
| GSD-03 | Phase 6 | Pending |
| GSD-04 | Phase 6 | Pending |
| GSD-05 | Phase 6 | Pending |
| GSD-06 | Phase 2 | Pending |
| DESK-01 | Phase 6 | Pending |
| DESK-02 | Phase 6 | Pending |
| DESK-03 | Phase 6 | Pending |
| DESK-04 | Phase 6 | Pending |
| REACH-01 | Phase 6 | Pending |
| REACH-02 | Phase 6 | Pending |
| REACH-03 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: **71 total**
- Mapped to phases: **71** (Phase 1: 23 · Phase 2: 12 · Phase 3: 5 · Phase 4: 11 · Phase 5: 8 · Phase 6: 12)
- **Unmapped: 0** — verified programmatically against `ROADMAP.md`'s `**Requirements**:` lines:
  71 mapped, no orphans, no duplicates, no ids mapped that are not requirements. Every
  requirement is also cited by at least one success criterion inside its own phase.

**The six pull-forward prerequisites are applied.** Each makes an already-written success
criterion untrue if it lands after, so none is held for a later phase:

| Pulled into | Requirement | Because |
|---|---|---|
| Phase 1 - FLOOR-10 | RECORD-03, RECORD-04 | the cap would be enforced against a truncated, quadratically over-counted number |
| Phase 1 - FLOOR-08 | VERDICT-02, VERDICT-03 | FLOOR-08 passes today while cards go silently unreviewed. VERDICT-03's `canReceiveInbox` filter already ships, so it is pulled forward to be PINNED by a named test before FLOOR-08 may be called done, not to be built |
| Phase 1 - new | GATE-01 | `hooks.ts` calls the socket "the one local trust boundary"; PR #76 restored it, but one shared secret readable by every agent shell is not identity |
| Phase 2 - DAEMON-02 | GSD-06 | the phone's "answer from anywhere" has nowhere to land while `AskMeTab` is hardcoded `to: 'god'` |

Consequently four categories are **split across phases**, deliberately, and stated in the
roadmap at both ends: GATE (01 in Phase 1, 02-05 in Phase 4), RECORD (03/04 in Phase 1,
01/02/05 in Phase 4), VERDICT (02/03 in Phase 1, 01 in Phase 5) and GSD (06 in Phase 2,
01-05 in Phase 6).

**Two further forward dependencies were found and are NOT resolved by moving requirements** —
they are recorded in ROADMAP.md's Phase 3 block instead, because resolving them by pull-forward
cascades (RECALL-02 cannot be built without RECALL-01's server, which would hollow out Phase 5):

| Criterion | Depends forward on | Resolution |
|---|---|---|
| SCALE-01 (Phase 3) | RECALL-02 (Phase 5) | isolation is `--wing`-flag deep until RECALL-02; re-verify after Phase 5 rather than close it in Phase 3 - or run Phase 3 after Phases 4-5 |
| SCALE-03 (Phase 3) | RECORD-02 (Phase 4) | replay reads an 8 MB window, not a day, until RECORD-02; same resolution |

---
*Requirements defined: 2026-08-20*
*Last updated: 2026-08-20 after the roadmap extension - Phases 4-6 added, six prerequisites
pulled forward, traceability filled in for all 71*
