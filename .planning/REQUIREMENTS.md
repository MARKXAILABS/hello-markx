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
      that is done is the same false claim in the other direction.)*
      *(**Anchors rewritten as SYMBOLS 2026-08-22 (plan 01-31).** The chain above read
      `index.ts:545` → `hooks.ts:663` → `delivery.ts:604` → `hive.ts:1368`, cursor at
      `hive.ts:1375`. Re-derived at wave 4, **all five point at unrelated code**: `:545` is the
      `new HookServer(` line, `:663` is `this.listenOn(sock)`, `:604` is `this.commitQueue()`,
      `:1368` is a `HIVE_SOCK_TOKEN` env key and `:1375` is a `startProxyBridge` catch. The
      previous note said the numbers "drifted twice during Phase 1"; they drifted a third time,
      inside the gap-closure wave, which is why they are now written as symbols and not as
      numbers. The live chain is: `index.ts`'s `HookServer` construction passes
      `delivery.drainAtStop`, `hooks.ts`'s Stop arm calls it, and `hive.ts drainForStop()`
      advances `cursor.lastProcessed`.)*
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
- [ ] **FLOOR-04**: a secret-shaped value an agent writes into its workspace is scrubbed out of
      the staged set between `git add -A` and `git commit`, so a KNOWN shape does not reach git
      history — #10
      *(**Restated 2026-08-22 (plan 01-31), against what plan 01-26 landed.** This read "…so it
      never reaches git history". The control is BOUNDED and its ceiling is stated in
      `scrubStagedSecrets`' JSDoc in `src/main/hive.ts`: *"never"* is not deliverable by a regex.
      What it delivers is labelled `key=value` / `key: value` pairs plus ten vendor prefixes,
      matched on ADDED lines only, on ONE line, under two size caps. A requirement whose own word
      is "never" over a best-effort matcher is unclosable by construction, which is the defect
      class this phase exists to remove.)*
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
- [x] **FLOOR-08**: "Done" is verified by someone other than the agent that claimed it, and
      an unanswered `requires_reply` is chased rather than forgotten — #18
      ⚠️ **Ship with VERDICT-01/02/03 or it means nothing.** As written this is satisfiable by
      code that never looks at a diff — `sweepTaskReviews` mails a peer the `title`,
      `description` and `result` and asks whether it "holds up". Worse, it fires only on the
      transition to done and `continue`s when `leastLoadedIdle` returns nothing, so a card that
      finishes while every other agent is busy is **never reviewed again, silently**.
- [x] **FLOOR-09**: Every engine's spend reaches the breaker, and the god is told per-engine
      capabilities in a prompt-cache-safe position — #19
- [x] **FLOOR-10**: A per-task token budget is **enforced**, not merely reported — something
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
- [x] **FLOOR-15**: The renderer has real test coverage beyond a boot smoke test — #45
- [x] **FLOOR-16**: ESLint (or a deliberate decision not to lint) replaces the 13 orphaned
      `eslint-disable` comments — #36
- [x] **FLOOR-17**: The bug template asks for logs that exist, and `docs/adr/` is the home
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
- [x] **DAEMON-04**: MCP servers are installable per agent, with consent, and visible on the
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

- [x] **PARITY-01a**: Every engine that *can* have a routed inbox has one — mail addressed to
      it arrives in its inbox and is delivered, not bounced to the god
- [x] **PARITY-01b**: For any engine that genuinely cannot receive mail, the UI says so
      **before** an operator assigns mail-dependent work — on the agent card and in the
      assignment flow, not only in documentation
      *(Split deliberately. The original "…**or** the UI states plainly…" let a skeptic be
      unable to distinguish "we routed the inbox" from "we wrote a label". Each half is now
      separately checkable, and the plan must say which engines fall under which.)*
- [x] **PARITY-02**: Every engine that can be pointed at a base URL reports cost through the
      proxy bridge that already exists (`claude` and `codex` through their own native
      telemetry, `qwen` and `crush` through the loopback proxy sidecar); the rest —
      `grok`, `kimi`, `antigravity`, `opencode`, `pi`, `copilot` and custom commands —
      **declare** the absence through the capability channel instead, so the operator meets the
      fact in the UI rather than in a doc
      *(Restated 2026-08-24, D-34. The original "all eleven … report cost" is unachievable by
      construction for `copilot` (spend sits on the user's Copilot plan; nothing per-agent
      reaches this app) and for a custom command (an unknown binary with nothing to read) — no
      amount of engineering makes either emit a number it does not have, and inventing one
      locally would be fabrication. What a skeptic can no longer do is confuse "we delivered
      cost for the engines that can report it" with "all eleven report cost": four engines are
      tracked (`claude`, `codex`, `qwen`, `crush`), seven are not — the other five untracked
      engines (`grok`, `kimi`, `antigravity`, `opencode`, `pi`) have neither telemetry nor a
      proxy route either. Same restatement, same words, as
      `README.md`'s cost paragraph and `.planning/ROADMAP.md`'s Success Criterion 5. This
      requirement's checkbox and status row were already Complete before this restatement
      landed — set by an earlier plan, against the original unachievable wording; left exactly
      as found, per this plan's own scope: correcting the text this checkbox rests on is this
      plan's job, flipping the checkbox is the rollup's.)*
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
- [x] **STRUCT-02**: `src/main/hive.ts` is split (git committer, messaging, provider
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
- [x] **RECORD-03**: `taskSpend()` on a long, expensive card reports `over` true when it is
      true — spend is computed over all of that card's rows, not a 1 MB tail
      *(`COST_TAIL_BYTES`)* — **prerequisite of FLOOR-10**
- [x] **RECORD-04**: A card's spend is not double-counted — cost is derived from the
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
- [x] **VERDICT-02**: No card reaches `done` unreviewed because nobody happened to be free at
      that instant — a card that flips to done while every other agent is busy is still
      reviewed later — **prerequisite of FLOOR-08**
- [x] **VERDICT-03**: ALREADY LIVE IN SOURCE — the `canReceiveInbox` filter inside
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
- [x] **GSD-06**: A human answer can be addressed to **any** agent, not only the god *(today
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
| FLOOR-08 | Phase 1 | Complete |
| FLOOR-09 | Phase 1 | Complete |
| FLOOR-10 | Phase 1 | Complete |
| FLOOR-11 | Phase 1 | Pending |
| FLOOR-12 | Phase 1 | Pending |
| FLOOR-13 | Phase 1 | Pending |
| FLOOR-14 | Phase 1 | Pending |
| FLOOR-15 | Phase 1 | Complete |
| FLOOR-16 | Phase 1 | Complete |
| FLOOR-17 | Phase 1 | Complete |
| FLOOR-18 | Phase 1 | Pending |
| DAEMON-01 | Phase 2 | Pending |
| DAEMON-02 | Phase 2 | Pending |
| DAEMON-03 | Phase 2 | Pending |
| DAEMON-04 | Phase 2 | Complete |
| DAEMON-05 | Phase 2 | Pending |
| PARITY-01a | Phase 2 | Complete |
| PARITY-01b | Phase 2 | Complete |
| PARITY-02 | Phase 2 | Complete |
| PARITY-03 | Phase 2 | Pending |
| SCALE-01 | Phase 3 | Pending |
| SCALE-02 | Phase 3 | Pending |
| SCALE-03 | Phase 3 | Pending |
| SCALE-04 | Phase 3 | Pending |
| SCALE-05 | Phase 3 | Pending |
| STRUCT-01 | Phase 2 | Pending |
| STRUCT-02 | Phase 2 | Complete |
| GATE-01 | Phase 1 | Pending |
| GATE-02 | Phase 4 | Pending |
| GATE-03 | Phase 4 | Pending |
| GATE-04 | Phase 4 | Pending |
| GATE-05 | Phase 4 | Pending |
| RECORD-01 | Phase 4 | Pending |
| RECORD-02 | Phase 4 | Pending |
| RECORD-03 | Phase 1 | Complete |
| RECORD-04 | Phase 1 | Complete |
| RECORD-05 | Phase 4 | Pending |
| VIGIL-01 | Phase 4 | Pending |
| VIGIL-02 | Phase 4 | Pending |
| VIGIL-03 | Phase 4 | Pending |
| VIGIL-04 | Phase 4 | Pending |
| VERDICT-01 | Phase 5 | Pending |
| VERDICT-02 | Phase 1 | Complete |
| VERDICT-03 | Phase 1 | Complete |
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
| GSD-06 | Phase 2 | Complete |
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

---

## Phase 1 adjudication — all 23 rows, per clause (2026-08-21, plan 01-23)

Every Phase-1 row was deliberately left `Pending` by its own plan so that one adjudicator
would grade them all against one bar, at the end, with the evidence on the page. This is
that pass. **10 of 23 close. 13 stay open, each for a named reason.**

The bar, stated so it cannot drift: **a box is ticked only when every clause of the
requirement's own text has real, named evidence.** One unmet clause is not closed. A
`MEASUREMENT UNAVAILABLE` is not evidence. An operator check nobody ran is not evidence.
"CI is green" is not evidence for a clause CI is structurally incapable of testing.

**Requirement checkboxes and GitHub issue closure are two different bars, deliberately.**
A checkbox says "this requirement's clauses are met in the milestone branch". Closing an
issue is a public statement about the shipped product, and **none of Phase 1 is on `main`**
— `main` is at `19dbdfb` with `electron: ^32.2.0`, and all 152 commits sit behind draft
PR #77. So **zero issues were closed by this plan**, including four whose every Fix clause
is met. Per-clause evidence was posted to #4, #5, #10 and #34 instead.

### Closed — 10

| Req | Clauses, each with its evidence |
|-----|--------------------------------|
| **FLOOR-08** | (a) *done verified by someone other than the claimer* — `owesReview` obligation set (`hive.ts:1890`), `leastLoadedIdle([task.assignee])` (`:1974`) excludes the claimer; the previous-snapshot membership guard was **deleted**, not patched, because a card created and flipped to done inside one 60 s sweep window is never observed non-done by any snapshot. Proven RED (`3 !== 0`, three `[review]` queries in the reviewer's inbox). (b) *an unanswered `requires_reply` is chased* — `pending-replies.json` persists the obligation across restarts (`hive.ts:229`, `:1742`) and a deadline sweep acts on it (`:256`). **Both clauses met. Note two things this does NOT claim:** #18 itself stays open on five other clauses that are not FLOOR-08's, and the reviewer still does not read a diff — that is VERDICT-01, Phase 5, and FLOOR-08's own ⚠️ names it. |
| **FLOOR-09** | (a) *every engine's spend reaches the breaker* — `telemetry.recordCostSample` is fed from the hook socket where `index.ts` constructs `HookServer`, which is the proxy tier's only sink; pinned by `test/repo-claims.test.cjs` *"both composition-root seams are still fed"* and by `test/engine-parity.test.cjs`. That grep read **0** for a whole wave while the sink existed and was unit-tested, which is why it is pinned. (b) *the god is told per-engine capabilities in a prompt-cache-safe position* — `hive.ts rosterContext()`, explicitly NOT `injectedPrompt()`, whose prefix rides `--append-system-prompt` and is kept volatile-free so Anthropic's prompt cache holds across turns (ADR-0002). *(Anchors rewritten as symbols 2026-08-22: this cell cited `index.ts:547` and `hive.ts:2596`; re-derived at wave 4 the sink is `index.ts:549` and `rosterContext` is `hive.ts:2667`, so both numbers had already expired.)* |
| **FLOOR-10** | *something consumes `taskSpend().over`* — `hive.ts budgetForAgent()` → the breaker beat in `index.ts` → `breaker.ts evaluate()` trips on `budget.tokens > budget.cap` and warns at `BUDGET_STEER_FRACTION`. Pinned in the same commit as the wiring, RED-controlled against a comment-shaped fake under which a bare `grep -c budgetForAgent` still returns 1. **Stated precisely:** the `.over` boolean has no direct caller; its two inputs do, and the comparison is made one layer down — which is what lets the arm distinguish "over" from "approaching". *(Anchors rewritten as symbols 2026-08-22: this cell cited `hive.ts:2953` → `index.ts:1635` → `breaker.ts:361`; all three had expired — `budgetForAgent` is `hive.ts:3024` and its caller `index.ts:1669`.)* **Corrected 2026-08-22 (plan 01-27), because the shipped arm made the ceiling WEAKER than this cell implied:** `evaluate()` returns on the first matching arm, and the 80–100% budget band sat ABOVE the per-agent token cap, both floor caps, velocity and no-progress — so an agent at 85% of its card cap that was also the floor's biggest spender over `costCapUsd` **could not be constrained at all**. The band is now ADVISORY: held in a local `softTrip` and returned at the bottom (`return softTrip ?? { tripping: false, reason: '' };`), so every arm below it runs again. Over-100% still returns immediately. The band-only path is unchanged in every observable. **A stateful consequence is deliberately let through and pinned by its own named case:** the no-progress counter can advance again for a carded agent, so a band card that also stops coordinating now escalates past `steering` to `constrained`. That arm predates FLOOR-10 and FLOOR-10 was masking it. |
| **FLOOR-15** | *real renderer coverage beyond the boot smoke test* — `test/renderer-components.test.cjs`, 6 tests, `# fail 0 # skipped 0 # todo 0`, rendering real `.tsx` to real markup through `react-dom/server` under `node --test` with **zero new dependencies**. All 6 driven RED against 10 injected SOURCE defects, never a test edit. Green by name in the Windows CI log. |
| **FLOOR-16** | *ESLint (or a deliberate decision not to lint) replaces the 13 orphaned `eslint-disable` comments* — `eslint.config.js` + `npm run lint` = `eslint . --max-warnings 0`, wired into CI's `typecheck` job, asserted by three tests in `test/ci-config.test.cjs` (`:314`, `:344`, `:400`) including one that resolves the rule surface through **ESLint's own resolver** rather than grepping the config. All 13 orphans decided by the resolver: 4 `@typescript-eslint/*` deleted (that plugin is not installed, so each was itself an ERROR), 1 dead directive deleted, the rest live with a reviewed reason each. **#36 itself stays open on its clause 4** — `slack.ts:191/210` and `webhook.ts:257/276` still each carry a private `listen()`/`openTunnel()` — which is a clause of the issue, not of this requirement. |
| **FLOOR-17** | (a) *the bug template asks for logs that exist* — `.github/ISSUE_TEMPLATE/bug_report.yml` asks for `main.log` (which #13's file sink now writes) and routes the reporter through **Settings → General → Log folder → `open logs`** rather than spelling per-platform paths. (b) *`docs/adr/` is the home for rationale* — six numbered records, `docs/adr/README.md` names each, and `grep -rhoE "adr/[0-9]{4}[0-9a-z-]*" src/` resolves to all four contracted call sites (`db.ts`, `telemetry.ts`, `terminalPool.ts`, `terminalPoolPolicy.ts`). Both clauses asserted in `test/ci-config.test.cjs` (`:216`, `:236`). |
| **RECORD-03** | *`taskSpend()` on a long, expensive card reports `over` true when it is true* — the 1 MB `COST_TAIL_BYTES` window is **deleted**; spend is summed over all of the card's rows through the `costByTask` accumulator, bounded by CARD LIFETIME (`pruneCostByTask`) rather than by a byte count. Runtime-proven over whole-ledger arithmetic. |
| **RECORD-04** | *cost derived from the difference between cumulative snapshots, not their sum* — `hooks.ts:574` onward; a clamped **consecutive** diff, `max(0, now − previous)`, deliberately not a high-water mark, because after `telemetry.forget()` the collector genuinely restarts at zero and the re-climb IS new spend. The first row of an `(agent_id, session_id)` series bills its own value, not zero. Proven across a real `spawnSync(process.execPath)` restart boundary with a negative control. |
| **VERDICT-02** | *no card reaches `done` unreviewed because nobody happened to be free at that instant* — the obligation set holds across sweeps (`hive.ts:1972-1973`), so a card that flips while every peer is busy is picked up later instead of silently never. The startup rebuild `01-RESEARCH` recommended was **overridden and the override is the right call**: a set rebuilt from the persisted board holds every historic done card, so one query is mailed per card at boot — the review storm. Proven RED, not argued. |
| **VERDICT-03** | *a reviewer that cannot receive mail is never selected* — `canReceiveInbox` is enforced at `hive.ts:1908` (inside `leastLoadedIdle`), `:1573` and `:1596`. Pulled forward to be **pinned**, not built: pinned by the named test *"a reviewer whose engine cannot receive mail is never selected"*. |

### Open — 13, with exactly what remains and who owns it

| Req | What is met | What is NOT, and whose |
|-----|-------------|----------------------|
| **FLOOR-01** | AUTO chip in all three renderings, derived from the agent's own command string; asserted on **rendered markup** by `test/renderer-components.test.cjs`. **Extended 2026-08-22 (plan 01-29):** the `custom` arm no longer returns `false` unconditionally — it reads the free-text command the OPERATOR typed, which `config.ts` spawns verbatim, via one shared `hasBypassFlag(command, flag)` that matches WHOLE argv tokens and lets each token contribute both sides of its first `=`. So `--auto` stops painting `--auto-compact` as a bypass and `--permission-mode=bypassPermissions` starts matching. 6 of 12 measured rows failed at HEAD; 0 of 12 after. An explicit empty-flag guard is included because two presets carry `autoFlag: ''` and `[].every(...)` is vacuously true. | 01-12's seven-step operator checkpoint was never run — nobody launched the dev app, toggled auto mode without restarting, or tabbed at the chip. **Two source-verified ceilings survive, both named 2026-08-22:** **(a) `opencode`'s chip can lie in BOTH directions** — its bypass is written into `OPENCODE_CONFIG_CONTENT` at spawn (`src/main/index.ts`) and never reaches the command string the chip reads, so a toggle flipped after spawn moves the chip without moving the agent. Closing it needs the spawn-time value on the `Agent` shape, a store widening. **(b) `autoModeFlagForProvider` reads `autoModeFlag` while `buildSpawnCommand` writes `autoFlag`** (review `b/WR-01`) — correct today only by coincidence, now guarded by an assertion pinning all eleven presets to agree, but the reader was NOT repointed. **The custom arm also deliberately OVER-reports** (`mytool --auto` shows the chip, because `--auto` is Kimi's bypass): a cosmetic false alarm costs a glance, a missed bypass costs the thing the chip exists to prevent. **Owner: operator for the checkpoint; a follow-up plan holding `src/renderer/src/store/autoMode.ts` and the agent store for (a) and (b).** |
| **FLOOR-02** | Queue-drain and idle-quiesce backstop both in main's tick; twelve stale HIVE.md denials deleted and pinned; the Stop-drain premise corrected. **Hardened in the gap-closure wave, and the evidence sentence is corrected with it (2026-08-22):** `loadQueue` now distinguishes ABSENT from UNREADABLE, so a non-`ENOENT` read error leaves the write path DISARMED (`queueReadError`, 7 refs in `src/main/delivery.ts`) instead of writing `[]` over a good file on one `EBUSY`/`EPERM`/`EMFILE` — proven by a byte-identical on-disk compare across a fault plus a refused enqueue, with `ENOENT`-is-a-first-boot and corrupt-file-is-still-replaceable as negative controls green BEFORE and after (01-27). The renderer half followed: `enqueueMessage` resolves main's `QueueResult` to all seven call sites, the composer clears the textarea only after main ACCEPTS, and main's refusal renders at any queue length including an empty one — a refused FIRST message was precisely the case that rendered nothing (01-28). Rows dropped by the shape filter are now counted and logged rather than deleted in silence. | Nobody has run `npm run dev`, **closed the window rather than quitting**, and watched an idle agent still get woken. Needs a real hive and a live agent CLI session. **Owner: operator.** Also unrun: filling a queue to `MAX_QUEUED_PER_AGENT = 200`, typing, pressing Enter and seeing the text survive with the reason on screen — `renderToStaticMarkup` fires no events, so `queueIt`'s own await-then-clear composition runs only in the app. **Two `quiesce` residuals were ACCEPTED rather than fixed** and are in the residual register with a named owner. |
| **FLOOR-03** | `electron: ^43.4.1` (Chromium 150, Node 24.18.1), native rebuild, three-platform suite green, `e2e/smoke.spec.ts:188` asserts major ≥ 43. | **D-09's live Windows run has never happened and plan 01-01 has no SUMMARY at all** — 21 SUMMARYs for 22 completed plans. `01-VALIDATION.md` states outright that CI is not acceptable closure evidence here: all 535 unit tests run with `electron` stubbed and are structurally incapable of failing on an Electron-version regression. **Owner: operator** — launch `dist\win-unpacked\Hello MarkX.exe`, confirm a real PTY echo, a persisted setting surviving a relaunch, and a clean visual pass. |
| **FLOOR-04** | `scrubStagedSecrets` inside `flushCommit`'s retry loop, added lines only, bounded twice, asymmetric failure polarity. Proven over a real temp git repo with a RED control. Verified by `test/hive-durability.test.cjs` (real git, real temp repo) and `test/voice-messages.test.cjs` (a 38-row exact-output battery, a frozen pattern 5 and a two-armed LOCKSTEP guard). **What shipped in plan 01-26: pattern 5 — the generic `key=value` arm — is BYTE-FROZEN and pinned**; pattern 3's `sk-` arm was SPLIT FOUR WAYS (`sk-ant-`, `sk-proj-` and `sk-svcacct-` UNBOUNDED, only the bare `sk-` residue carrying a `\b`, and the other six alternatives untouched with NO boundary); and two `sk_`/`rk_` arms were added as their own statements AFTER pattern 5, never appended inside pattern 3's alternation. Measured against the shipped bytes: **0 detections lost over 38 rows, 0 new false positives, 5 gained, and 3 identifier families (`desk-`, `task-`, `risk-`) fixed, rescuing 4 tracked files.** | **Restated 2026-08-22 (plan 01-31). The previous cell named the ceiling as `sk_live_`/`sk_ant_`/JSON; that is now wrong in both directions** — the underscore prefixes are DETECTED (5 gained), and **01-26 deliberately did NOT widen the value matcher**: it ships a *passing* durability assertion that `"token": "abcdef123456789"` is **still present** in `git log -p`. **FIVE ACTIVE bypasses, each an action an agent takes:** (1) **line-chunking**, and the cut position decides it — `const KEY = "sk_live_EX_Hxxxxxxxxxxxxyyyyzzzzwwww";` is 1 hit, `const A = "sk_live_" + "51Hxxxxxxxxxxxx";` is 0, because a cut INSIDE the vendor prefix is never scanned at any size; (2) **`SECRET_SCAN_MAX_LINES`** — `seq 20001 > pad.txt` in the same debounce window commits the whole diff UNSCANNED; (3) **`SECRET_SCAN_MAX_BYTES`** — past the cap the diff is `slice()`d and the remainder is never scanned; (4) **quoted-key JSON** (`{"token": "…"}`, `obj["token"] = "…"`) — an arm was built, measured and REJECTED ON ITS COST (+2 detections against 2 permanent false positives, `"api_key": "$OPENAI_API_KEY"` and `"secret": "REPLACE_ME"`), not on any hazard about value-shape predicates; (5) **`printf '* -diff' > .gitattributes`** — one line, PERSISTENT, and the ONLY one that logs nothing at all: `--numstat` returns `-`/`-` so `changed` is 0, the diff carries no `+` lines, and the scrub returns true having scanned nothing. Cite `SECRET_SCAN_MAX_LINES` and `SECRET_SCAN_MAX_BYTES` **by NAME, never by line** — 01-26 inserted above both. **Two further recorded facts.** `AGENT_DENY_RULES` has **no** `git add`, `git commit` or `git -C` rule (`grep -Fc "Bash(git commit" src/main/hive.ts` → **0**, `"Bash(git add"` → **0**), so the *"single committer"* premise the control rests on does not hold. And the control's measured precision against LIVE credentials on this tree is **zero**, at a measured cost of **65 distinct paths over 400 commits** — the false-positive direction is a permanent data-loss channel, because `unstagePath` drops the file from the commit and the `secret-scrubbed` log line is indistinguishable from a real catch. **DECLARED LOSS:** a LEGACY bare `sk-<alnum>` key immediately preceded by a word character stops being redacted — 5 measured shapes, pinned as `C1_DECLARED_LOSS` in `test/voice-messages.test.cjs`. **The live clause remains UNRUN:** dropping a fake key into a *live* agent's workspace and letting the running hive commit it needs an operator; the temp-repo tests do not satisfy it. **Owner re-homed 2026-08-22:** the previous owner read *"a plan that widens the matcher"* and **no plan widens it any more**, so that owner resolved to nobody — which this register's own preamble forbids. **Owner: a follow-up plan holding `src/main/hive.ts` + `test/voice-messages.test.cjs`** (its measured upgrade path is recorded in 01-26's R3), **plus the operator for the live clause.** |
| **FLOOR-05** | `app:openLogs` live in main, exposed in preload, and reached from `SettingsModal.tsx:945` — present in the shipped bundle. Pinned by `test/repo-claims.test.cjs`. | Nobody has clicked it. The untested link is the click itself: `npm run dev` → Settings → General → `open logs` → the OS file manager opens the folder. **Owner: operator.** |
| **FLOOR-06** | `actions/attest-build-provenance@v4` on the merged checksums subject with correct permissions and `merge < attest < upload` ordering, all **parsed** rather than grepped; the release-link gate runs as `release.yml`'s `links` job with `build` declaring `needs: links`. | **The attested SUBJECT is now correct (plan 01-30):** `Generate checksums` hashed 4 globs while `Upload build artifacts` shipped 7, so `*.blockmap` and `latest*.yml` were outside `SHA256SUMS.txt` — and `SHA256SUMS.txt` is the attestation's whole subject. `latest*.yml` is the electron-updater feed carrying the sha512 the updater validates a download against, so **the automatic update path was the one path with no provenance at all**. It is now inside, with a parsed pin that every uploaded glob is hashed and a restored `installers=` tripwire that fails the job loudly rather than publishing an attested feed with nothing to install. But the **live sample has still never run**. `gh attestation verify <artifact> --repo MARKXAILABS/hello-markx` needs a published artifact, and the publish job is gated on `refs/tags/v*` with no tag pushed since. Provenance is verified **structurally only**, and the parsed pin is a pin on the workflow, not a verification of an attestation. **Owner: whoever cuts the next `v*` tag.** Separately, `c/WR-02` is only PARTLY closed: three failure-swallowing settings remain untouched — see the residual register. |
| **FLOOR-07** | FTS5 `memory_fts` in the already-open `PersistStore` (`db.ts:100`), `search()` falls back to `keywordSearch()` so recall survives a missing mempalace CLI, dead exports deleted, README honest. | **The naming-honesty half is CLOSED as of 2026-08-22.** All seven sites are renamed to `src/main/kg-core.cjs`'s own words — keyword scoring over text chunks, term frequency plus a title boost, no entities and no edges: `src/main/hive.ts` by plan 01-26, and `resources/skills/capabilities/SKILL.md`, `src/main/config.ts` ×3 and `src/renderer/src/store/config.ts` ×2 by plan 01-31. `git grep -l "Enterprise Knowledge Graph" -- src resources docs test scripts e2e '*.md' ':!.planning'` now names **exactly two files**: `docs/floor-inspection.html` (the audit RECORD quoting the defect — erasing the quotation would delete the finding) and `test/repo-claims.test.cjs` (the pin's own needle). Both are the two explicit exclusions in the pin's walker, so the gate and the pin agree by construction. The pin was widened from a two-file loop to `shippedTextFiles()` — an explicit-root walker with an extension allow-list over **315 files** — and DEMONSTRATED RED against `SKILL.md` specifically, the one file the previous `.ts`-only walker could never have read. `SKILL.md` mattered most: it is installed into every agent's skills directory, so until now the agents themselves were told a RETIRED capability (V2-05) was available. **Two things remain, neither a naming residual:** *"scoped per agent/project"* is enforced by an agent-supplied `--wing` flag until **RECALL-02** (Phase 5) makes the server enforce it — the requirement's own ⚠️ says so; and `src/main/hive.ts`'s `knowledgeLine` prompt string still tells agents the organisation *"has a private Knowledge Graph of its own documents"* — it does **not** contain the scanned phrase, so no pin can discover it. **Owner: RECALL-02 (Phase 5) for the scope clause; a follow-up plan holding `src/main/hive.ts` for `knowledgeLine`.** |
| **FLOOR-11** | Shared `useHiveTasks` poller adopted at all five sites; pool bounded with disposal on every drop path; both pinned by `test/repo-claims.test.cjs`, the poller rule proven RED against two real files. | The *"no visual change"* clause on the migration has never been observed: nobody opened the Tasks board, the detail overlay or the kanban with a live ledger. **Owner: operator.** |
| **FLOOR-12** | Repo-wide M1 **604 → 16 occurrences**, and all 16 are `<span aria-hidden="true">` decorative glyphs — asserted as a content-keyed multiset that fails on a new site and survives wave 8's line shifts, proven both ways by mutation. Token layer declares nothing below 14px. M1d clean. Every expression-valued size floored at 14. Zero unnamed icon-only controls across 128 `<button>` and 155 `<PixelButton>`. | Three things, none of them claimed: **(a)** the Pixi labels take `FONT_SIZE = 14` but render inside a container held at `RENDER_SCALE = 0.5`, so the designed on-screen size is **7px** — reaching a true 14 needs re-geometrying `MAX_WIDTH`/`MAX_CHARS`/the overlap pass, which is UI-SPEC containment step 3. **(b)** two residual layout clips reported and not fixed: SkillsTab's catalog row (content-sized chips exceed the column on their own) and SidebarTabs' TERMINAL/MESSAGES labels (−17px each at the default 420 rail). Both need `sidebarWidth` in `store/store.ts`, outside every wave-7 plan's file set. **(c)** no human has looked at the swept surfaces. **Owner: a follow-up plan holding `store.ts`, plus the operator.** |
| **FLOOR-13** | The four renderings agree; the model renders before the cost; the 1024px collapse verified at its exact boundary (absent at 1024, present at 1023). **Restated 2026-08-22 (plan 01-31) — this cell said the opposite.** It read *"NOT in the shipped app, which cannot reach that width: `MIN_WIN.width = 1280` … so the collapsed branch is unreachable for a real operator"*. **The collapse is now REACHABLE.** `const MIN_WIN = { width: 960, height: 800 };` (`src/main/index.ts`, plan 01-25) against `export const SIDEBAR_COLLAPSE_WIDTH = 1024;` (`src/renderer/src/store/sidebarLayout.ts`), tied together by a three-clause cross-file pin in `test/renderer-runstate.test.cjs` (01-29) whose acceptance clause has been SEEN failing against an inline fixture of the pre-fix `MIN_WIN` declaration; and `DESIGN.md` states `960 × 800` in both places (`grep -c 1280 DESIGN.md` → **0**, cross-pinned from `test/repo-claims.test.cjs` by plan 01-31 so the correction could not fall between the two plans). **The resolution was to lower the window floor, not to delete the feature** — the alternative was deleting a built, tested and documented responsive behaviour to resolve a one-constant contradiction, and it would also have left the app unusable below 1280 on 1366×768 laptops. `DEFAULT_WIN` is unchanged at 1440×900: this changes what an operator may drag to, not what the app opens as. 01-29 additionally added `splitterReachableMax` so a resize across the newly reachable 1024–1279 band can no longer rewrite and persist the operator's sidebar width (236 persisting writes → 0, measured). Asserted on rendered markup. | 01-12's operator checkpoint unrun. **Whether the collapsed layout actually reads correctly at a 960px window has never been observed** — arithmetic and source pins only; `renderToStaticMarkup` performs no layout and `npm run e2e` boots at 1440×900. **Owner: operator.** **And the D-22 residual is adjudicated here rather than left unowned:** `hive.ts:2049-2073` widens every `hive:tasks` row with `{tokens, budgetTokens, pct}` and `grep -rn budgetTokens src/renderer/` returns **nothing** — zero consumers, unchanged since 01-09 minted them. **Verdict: these are NOT a FLOOR-13 clause.** FLOOR-13's text is the sidebar collapse and the four renderings agreeing on cost; the cost clause already ships and rides `useFleetTelemetry`. The fields' real consumer is a per-card budget **meter**, which is FLOOR-10's subject — and FLOOR-10's enforcement landed in **main**, where a renderer meter is not required for the cap to bite. So they are live on the channel with no consumer: carried forward as *either wire a meter or revert the widening*, not as a Phase-1 gap. **Owner: a Phase 2+ plan holding `TasksKanban.tsx`.** |
| **FLOOR-14** | The blocked→notify path is gated on **provider in main** off the live registry, never in the renderer, RED-controlled 5/5; the OS layer proven live on this win32 host (Electron 43.4.1, `Notification.isSupported()` true, toast constructed and shown, click handler registered). `SettingsModal`'s copy now carries the macOS qualifier (this plan). | Nobody has blocked a real non-Claude agent, seen exactly one Windows toast, and clicked it to confirm the agent is focused. No test can reach "Windows actually DREW it" — Focus Assist and per-app settings can suppress it. macOS delivery is **structurally unverifiable on this project**: `UNNotification` requires a code-signed app and paid signing is out of scope. **Owner: operator for Windows; macOS is stated, never claimed.** |
| **FLOOR-18** | `capabilityLine('codex')` returns `REMOTE CONTROL unavailable on Windows` on this host; the limitation is in source (`providerAutomation.ts:344`), docs (`README.md:57`) and the UI roster line. The win32 early return is the first statement of `enableCodexRemoteForSpawn`, ahead of both awaited subprocesses. | **No Codex subscription on this machine**, so no live Windows spawn has confirmed the no-subprocess-timeout half end to end. Proven structurally only. **Owner: operator with a Codex account, or accept the structural proof and say so.** |
| **GATE-01** | Per-agent tokens minted at `PtyManager` — one choke point covering every current and future spawn — bound to `agent_id` server-side and revoked token-exact on PTY exit. The floor-wide assignment is gone (`grep -c "process.env.HIVE_SOCK_TOKEN *=" src/main/index.ts` → `0`). All six shim templates carry the token. **Three things landed in the gap-closure wave.** (a) **The SECOND identity channel is closed** (01-25): the OTLP collector any agent's Bash tool could `curl` now demands its own per-agent capability — `mintAgentToken` / `revokeAgentToken`, an `x-hive-otel-token` gate resolved BEFORE the body is consumed, failing CLOSED on an absent header, an unknown token and an empty registry — and attribution is DERIVED from the token, so the payload's `agent.id` claim is unreadable on every network-reachable path. It is a DIFFERENT secret from the hook token, so a leaked telemetry credential never buys the hook socket. (b) **The PreToolUse path gate decides containment by `(dev, ino)` IDENTITY, not by path strings** (01-24): `pathIdentity` (11 refs) plus `vouchedBases` frame relative targets against ABSOLUTE registry-vouched bases with deny-wins over `payload.cwd`; 18 win32 spellings measured ALLOWED at the pre-plan HEAD — plus a hard link into `bin/runtime` (arbitrary code execution in every agent PTY), a `subst` alias, a `net use` drive, a Volume GUID and a GLOBALROOT device path — are all DENIED, and the shipped fix contains no host set, prefix table or spelling list. (c) A flag-shaped `session_id` is refused at all four sinks including the hook WRITER (01-25). | **NOT TICKED, and this is an adjudication rather than an oversight.** GATE-01 has TWO clauses and its second reads *"…**and** the token that authenticates the socket is not readable from any agent's shell."* That clause is **still false on Linux**: both credentials live in the agent's own process environment and a same-uid sibling reads `/proc/<B-pid>/environ`. The ceiling is written in the source itself (`src/main/hooks.ts:29`, `src/main/telemetry.ts:40`) rather than papered over. **Plan 01-24 named GATE-01 in its `requirements` and deliberately left `requirements-completed` EMPTY for exactly this reason; plan 01-25 listed GATE-01 in its `requirements-completed`, and this adjudication declines it** — 01-25 closed the second identity CHANNEL, which is not the same as making the token unreadable. One unmet clause is not closed. **Owner: GATE-02 (Phase 4), which is the child-env requirement.** Two further ceilings are unchanged and named rather than argued away: the number of concurrent hook connections is unbounded (`N × HOOK_LINE_MAX`, ≈384 MiB at the 24-agent floor the app models, buffered BEFORE authentication), and a hard link into `<hive>/.git` or another agent's tree is still allowed — see the residual register. |

### The one-line answer

**Phase 01 is PARTIAL.** Ten requirements close. Thirteen do not, and the pattern is not
random: **eight of the thirteen are blocked on an operator sitting in front of the running
app**, one is blocked on a git tag, and four are blocked on work with a named owner. No
GitHub issue was closed, because none of this is on `main` yet.

### Re-adjudicated 2026-08-22 after the gap-closure wave (plans 01-24 … 01-31)

**The verdict is unchanged: Phase 01 is still PARTIAL, and the count is still 10 closed / 13
open. No box was ticked by this wave.** The rows above are restated so they describe the tree
that now exists rather than the pre-gap one, and every restatement was verified at source with
its command and output pasted in `01-31-SUMMARY.md`. What changed is how much is left inside
each open row, not how many rows are open.

Three plans in the wave named requirements in their `requirements-completed` frontmatter. Each
was **adjudicated per clause, not rubber-stamped**:

| Claimed by | Requirement | Adjudication |
|---|---|---|
| 01-25 | **GATE-01** | **DECLINED.** Clause 2 — *"the token that authenticates the socket is not readable from any agent's shell"* — is still false on Linux via `/proc/<pid>/environ`, and the source says so at `hooks.ts:29` and `telemetry.ts:40`. 01-24 named GATE-01 and deliberately left `requirements-completed` empty for this exact reason. One unmet clause is not closed. |
| 01-25 / 01-26 | **FLOOR-09** | Already `[x]` before the wave. Nothing to flip; its anchors were corrected from numbers to symbols. |
| 01-25 / 01-29 | **FLOOR-13** | **DECLINED as a tick, upgraded as a row.** The collapse is now genuinely reachable (`MIN_WIN.width` 960 vs `SIDEBAR_COLLAPSE_WIDTH` 1024) — the row previously recorded the opposite and is corrected. But 01-12's operator checkpoint is still unrun and nobody has looked at the app at 960px. |
| 01-26 | **FLOOR-04** | **DECLINED.** The ceiling is restated honestly with five ACTIVE bypasses; the live clause is unrun; the requirement's own word was *"never"* and is now restated to what a bounded matcher can deliver. |
| 01-26 / 01-31 | **FLOOR-07** | **DECLINED.** The naming half is genuinely closed; the `--wing` scope clause is RECALL-02's (Phase 5) and remains open, so the row stays open. |
| 01-29 | **FLOOR-01** | **DECLINED.** The custom arm now works; the operator checkpoint is unrun and two source-verified ceilings survive. |
| 01-27 | **FLOOR-02 / FLOOR-10 / RECORD-03** | 01-27 did **not** run `mark-complete` and said so. FLOOR-10 and RECORD-03 were already `[x]`; FLOOR-02 stays Pending on its live operator run. |

---

## The residual register — everything the gap-closure wave does NOT close, with a named owner

**Derived 2026-08-22 by plan 01-31 by SWEEPING all seven landed SUMMARYs (01-24 … 01-30),** not
by copying a fixed list; the per-SUMMARY audit trail is in `01-31-SUMMARY.md`. **Nothing here is
filed against a plan that has already landed.** Six rows arrived owned by *"01-31's residual
register"* or by a role rather than a plan, and are re-homed below with a note saying so —
01-24 and 01-26 are wave 1 and 01-31 is wave 4, so a residual filed at them has no owner at all.

**Added 2026-08-23 by the security audit (`01-SECURITY.md`), which found it recorded NOWHERE —
not in `protectedPathDenial`'s ceiling list, not in 01-24's `## Accepted residuals`, not here.**

- **T-P24-10 — `protectedPathDenial` fails OPEN when there is no hive root.**
  `src/main/hooks.ts` — the function opens `if (!root) return null;`, which is ALLOW.
  Disposition **accept**. The behaviour is benign on its face: with no hive root there are no
  protected paths, so there is nothing to deny. It is registered because its accept disposition's
  entire obligation was *"named so it is a recorded ceiling and not an unspoken assumption"* — and
  01-24's own SUMMARY states the rule it broke: *a residual recorded only in a source comment or
  only in the plan's threat table is invisible to the register sweep.* Now recorded in both places:
  ceiling item `(i)` in `hooks.ts` and this row.
  **Owner: hive maintainer. NOT the operator.**


*"Operator"* is a legitimate owner. *"A follow-up plan holding `<these files>`"* is a legitimate
owner. An issue number is a legitimate owner. ***"An operator has to look at it"* is NOT an owner
for anything measurable from source.**

### A — code residuals, measurable now, not fixed by this wave

| # | Residual | Source | Owner |
|---|---|---|---|
| A1 | **The Pixi bubbles render at 7px on screen.** `ThoughtBubble.ts` `FONT_SIZE = 14` inside `this.inner.scale.set(RENDER_SCALE)` with `RENDER_SCALE = 0.5`; `ToolBubble.ts` the same. Against `DESIGN.md`'s 14px floor that is a **factor of two**, and it is arithmetic, not an observation. Not a two-line fix: `WRAP_WIDTH = MAX_WIDTH / RENDER_SCALE - PADDING_X * 2` shows the inner space is deliberately a 2× space, so `PADDING_X = 6`, `PADDING_Y = 3` and `CORNER_RADIUS = 5` are all half-size on screen too. `test/repo-claims.test.cjs` reads the LITERAL and passes; its failure message already carries the caveat verbatim, so the ceiling is FILED and the arithmetic is NOT fixed. | seed, re-verified at source | **issue #26 (FLOOR-12) + a follow-up plan holding `src/renderer/src/scene/office/*.ts`. NOT the operator.** |
| A2 | **Two source-verified layout clips** — SkillsTab's catalog row (content-sized chips exceed the column) and SidebarTabs' TERMINAL/MESSAGES labels (−17px each at the default 420 rail). `b/WR-06`. Both need `sidebarWidth` in `store/store.ts`. | seed | **a follow-up plan holding those components + `store.ts`. NOT the operator.** |
| A3 | **FLOOR-10's ladder is advisory, not enforced.** `hardStop: false` is the default (`src/main/breaker.ts`), capping the ladder at `constrained`, whose entire action is a mail and a toast. 01-27 correctly DECLINES to finish it into a kill — D-18 forbids that. | seed, corroborated by 01-27 | **issue #4.** |
| A4 | **`.planning/codebase/CONCERNS.md:46`** still says README calls the store an "Enterprise Knowledge Graph". `grep -c` on README is **0** and has been since 01-10. Outside the naming pin's corpus by construction (`.planning/` is not a walker root). | seed, re-verified | **the next codebase-map regeneration.** |
| A5 | **`test/net-binding.test.cjs:295`'s acceptance-case-3 comment cites `hive.ts:1366`.** Re-derived twice: the seed measured `:1366` as `const dir = this.agentDir(agentId);`; at wave-4 HEAD it is a `process.env` spread comment. Doubly stale. This plan's anchor sweep covers `HIVE.md` and `docs/adr/` and does not reach `test/`. **Re-homed:** the seed said *"01-24 if it is still in flight, otherwise a follow-up"* — 01-24 is wave 1 and this is wave 4, so that condition can never hold and the owner silently resolved to the null branch (`grep -c 1366 01-24-PLAN.md` → **0**). | seed, re-verified | **a follow-up plan holding `test/net-binding.test.cjs`. NOT the operator.** |
| A6 | **`docs/adr/0001-one-gate-for-pty-writes.md:20` cites `delivery.ts:518`, which is now `queue.push(item);`** — `drainQueue` is `delivery.ts:564`. 01-27 and 01-28 both shifted the file. **NEW — found by this plan's thirteen-anchor sweep.** That ADR is not in 01-31's `files_modified`, so it is reported rather than edited. | **sweep finding** | **a follow-up plan holding `docs/adr/0001-one-gate-for-pty-writes.md`.** |
| A7 | **`test/proc-kill.test.cjs` — FIVE cases invisible to the TAP counters on EVERY platform.** A module-scope `if (process.platform === 'win32') { … process.exit(0); }` means they never run on win32; and because the file defines its own `test()` and does not `require('node:test')`, they land in **neither `# pass` nor `# skipped` on any platform**. Same defect class as `c/CR-01` — the class the *"the published 531 pass figure is an honest floor"* gap exists to close — and **five more silent non-runs than that gap enumerated**. 01-30 declines the conversion for a real reason: rewriting onto `node:test` also removes the file from `test/repo-claims.test.cjs`'s poisoned-assert loop, a different guarantee. | 01-30 §1, by name | **a follow-up plan holding `test/proc-kill.test.cjs` AND `test/repo-claims.test.cjs` — the two halves cannot be done separately. NOT the operator.** |
| A8 | **Byte-level drive for the five shims that have only a source-text pin.** `test/engine-parity.test.cjs` drives `PROXY_BRIDGE_SHIM` end to end — writes the generated shim, runs it, asserts the bytes on the wire. The other five (`HOOK_SHIM`, `AGY_HOOK_SHIM`, `PI_EXTENSION`, `OPENCODE_PLUGIN`, `GROK_HOOK_SHIM`) rest entirely on 01-30's comment-stripped, assignment-shaped pin — a large improvement on the bare grep it replaces, and still source text: it proves the template *says* the right thing, never that the shim *sends* it. | 01-30 §2, by name | **a follow-up plan holding `test/engine-parity.test.cjs`. NOT the operator.** |
| A9 | **`test/win-cmd-shim.test.cjs`'s converted case pins the OUTCOME, not the REASON its title claims.** *'the win32 branch is genuinely platform-gated'* runs on POSIX and its assertions execute, but deleting the guard it names does not turn it red: `SHIM` is a fabricated path that exists on no host, so `resolveWindowsShimSpawn` returns `null` from its `statSync` catch either way. Strengthening it needs a real on-disk `.cmd` fixture and a POSIX runner; building it blind risks a false RED on the ubuntu and macOS rows. | 01-30 §3 (found while executing) | **a follow-up plan holding `test/win-cmd-shim.test.cjs` and `src/main/pty.ts`, with a POSIX runner. NOT the operator.** |
| A10 | **`hive.recordSession` still validates only `!root || !sessionId`** before writing `registry.json`, appending the log and `commit()`ing. **Defence in depth, not an open hole:** after 01-25's sinks 3 and 4 it has no caller that can hand it a flag-shaped id. **The seed's version of this row is RESOLVED and deleted:** it was written when the stored-state half was filed against two already-landed plans; 01-25 was revised to TAKE it and the fourth sink SHIPPED — `grep -c "SPAWN_SAFE_SESSION_ID" src/main/hooks.ts` → **2**, and `hooks.ts:467` names sink 4. What survives is only the one-line guard at the top of `recordSession` itself. | 01-25 R1; seed row RESOLVED | **re-homed from *"01-31's residual register"* (which cannot edit `hive.ts`) to a follow-up plan holding `src/main/hive.ts`.** |
| A11 | **`src/main/hive.ts`'s `knowledgeLine` prompt string** still tells agents *"this organisation has a private Knowledge Graph of its own documents"* — a false capability claim **the agents themselves consume**. It does **not** contain the scanned phrase, so the FLOOR-07 pin cannot discover it, early or late. | 01-26 R1 | **re-homed from *"01-31 (FLOOR-07 naming sweep)"* — 01-31 does not hold `src/main/hive.ts` and may not edit it — to a follow-up plan holding `src/main/hive.ts`.** |
| A12 | **The 65-path false-positive channel in `scrubStagedSecrets`.** Pattern 5 fires on `token: string):`, `secret: string`, `botToken: string` and `sock_token = process.env.HIVE_SOCK_TOKEN` across the whole tree: **65 distinct paths over 400 commits** after 01-26 (66 before), and **not one of the 184 distinct spans it fires on across 481 tracked text files is a LIVE credential**. Not fixed because the only fix is a value-shape predicate on the frozen arm — the mechanism that turned 4 credential classes into plaintext in one revision and 11 more in the next, both times under an all-green battery. | 01-26 R2 | **a follow-up plan holding `src/main/hive.ts` + `test/voice-messages.test.cjs`.** |
| A13 | **The declared C-1 loss, with its upgrade path already measured.** A LEGACY bare `sk-<alnum>` key immediately preceded by a word character is no longer redacted — 5 measured shapes, pinned as `C1_DECLARED_LOSS`. Replacing `\bsk-[A-Za-z0-9_-]{16,}` with `(?<![a-z])sk-…` recovers 2 of the 5 with **0 newly unstaged paths** over 481 files and 400 commits; it was not shipped only because it drops the literal `\bsk` that 01-26's own `<done>` required twice. | 01-26 R3 | **a follow-up plan holding `src/main/hive.ts` + `test/voice-messages.test.cjs`.** |
| A14 | **`AGENT_DENY_RULES` has no `git add` / `git commit` / `git -C` rule** (`grep -Fc "Bash(git commit" src/main/hive.ts` → **0**; `"Bash(git add"` → **0**), so an agent can run `git -C "$HIVE_ROOT" add -A && git -C "$HIVE_ROOT" commit -m x` and never reach `flushCommit` or the scrub — the *"single committer"* premise FLOOR-04 rests on does not hold. Recorded, not closed: agents legitimately commit in their OWN worktrees, so a deny rule has a blast radius nobody has measured, and an unmeasured deny rule that wedges every agent's git is worse than what it prevents. | 01-26 R4 | **a follow-up plan holding `src/main/hive.ts` deny rules.** |
| A15 | **The NUMBER of concurrent hook connections is unbounded** (`T-P24-12`). Contained by `HOOK_LINE_MAX` + the idle timeout, which close the loop between them, but the product is `N × 16 MiB` buffered **before** authentication — **≈384 MiB** at the 24-agent floor the app models, and there is no enforced agent limit anywhere in the app. `HOOK_LINE_MAX` is not the lever; its floor is set by the largest payload the app legitimately produces. The real fix is to stop holding the payload as one JS string. | 01-24, owner was *"hive maintainer"* | **re-homed to a follow-up plan holding `src/main/hooks.ts`** — a role is not an owner for something measurable from source. |
| A16 | **One blocking syscall against storage that does not answer** (`T-P24-14`). `HOOK_RESOLVE_BUDGET_MS` is checked BETWEEN candidate resolutions and cannot interrupt the one call in flight, so the true worst case is `budget + one resolve`. **Pre-existing** — a single absolute `Z:\x` does this today with no plan applied — and neither introduced nor multiplied by 01-24. | 01-24, owner was *"hive maintainer"* | **re-homed to a follow-up plan holding `src/main/hooks.ts`.** |
| A17 | **The hard-link residual, NARROWED** (`T-P24-15`). **Closed:** a hard link to any file beneath `<hive>/bin`, recursively, including `bin/runtime`, which is on every agent PTY's PATH — measured ALLOWED before, DENIED after. **Remains:** a hard link to a file under `<hive>/.git` or under **another agent's tree**, because identifying every file beneath them per payload is not a cost this gate can pay; and a local non-admin SMB share whose host answers but whose backing directory main has no identity for. | 01-24 `T-P24-15` | **a follow-up plan holding `src/main/hooks.ts`** (already correctly owned). |
| A18 | **The framing rule's false positives** (`T-P24-16`). `driveRelative` falsely denies `x:1/2`, `D:pkg/file.ts` and a bare rooted regex word such as `/^a$/`. Measured NOT classified: `s:foo:bar:g`, `http://a/b`, `-c:v`, `9:30`, `./rel`, `../up`, `C:\abs\x` and all 22 bare-`/` words in this repo's README. A false deny is the right failure mode for a shape main cannot frame. | 01-24, owner was *"hive maintainer"* | **re-homed to a follow-up plan holding `src/main/hooks.ts`.** |
| A19 | **A volume with no stable file ids denies everything** (`T-P24-17(ii)`). A volume reporting `ino === 0` (exFAT, some network filesystems) has no identity to compare, so if the hive ROOT has none, **every** candidate denies with a reason naming the volume rather than degrading to the string comparison all of 01-24's measured bypasses live in. That is an outage for that operator; it is loud, and it is the correct direction. | 01-24, owner was *"hive maintainer"* | **re-homed to a follow-up plan holding `src/main/hooks.ts`.** |
| A20 | **The leaf-symlink dereference is UNPINNED on Windows.** `fs.symlinkSync` throws `EPERM` on this host in both the `'file'` and `'dir'` forms, so the case is a runner-counted skip here (skip-ceiling member 5). It runs on `ubuntu-latest`, and the ancestor-junction case is the Windows-reachable half of the same clause — but **a reviewer on Windows must read the diff for the leaf step.** | 01-24 Issues Encountered | **a reviewer on the phase PR, and `ubuntu-latest` CI.** |
| A21 | **A poisoned session id already stored in `registry.json` before 01-25 landed is now refused forever.** `hive.lastSession(id)` returns it and sinks 1/2 reject it, so that agent's `--resume` silently stops working. Sink 4 stops new poisoning; it does not clean existing state. **Recovery:** run the agent once without resume, or clear its `sessionId` in `registry.json`. Not introduced by 01-25; surfaced by it. | 01-25 R2 | **operator, with the recovery path above** — it is a data-state condition, not a code defect. |
| A22 | **The account-pool blast radius is unchanged.** Deriving `agentId` from the token stops agent A naming `victim` in an `api_error`. It does NOT stop A forging a 401 **for itself**, which `accountPool.ts` turns into `markDead` + `failover` for every sibling on the same Claude account. Named `reduce`, not `mitigate`, in 01-25's own threat model. | 01-25 R3 | **a follow-up plan holding `src/main/accountPool.ts`.** |
| A23 | **Two `quiesce` residuals, ACCEPTED by the orchestrator — recorded, not re-opened.** Fixing either reverses a negative control 01-28 explicitly states (*"the once-per-spell arming untouched"*). **(a)** A false `blocked` landing AFTER the last real Stop is unrecoverable: `delivery.ts` suppresses the repeat via `this.quiesced.has()`, resets that set only on new PTY output, and `useHive.ts`'s Stop arm is the sole clearer of `breakerLevel` — so an agent falsely marked blocked after its last genuine turn-end has no event left that would clear it. **(b)** `quiesce`'s durable half calls `setStatus?.(id, 'idle')` **unconditionally** for an agent the floor paints `blocked`; the `synthesized` discriminator reaches the renderer arm only, so the hive log records an idle transition for an agent waiting on a human. Verified at source; 01-28's SUMMARY carries the required `## Quiesce residuals — ACCEPTED, not fixed` heading. | 01-28, owner was *"plan 01-31's residual register"* | **re-homed to a follow-up plan holding `src/main/delivery.ts` and `src/renderer/src/hooks/useHive.ts`. NOT the operator.** |
| A24 | **`R-21`, at its true size.** A stuck-`blocked` agent keeps RECEIVING mail — main's `drainQueue` gates on `switching`/`vetoed`/`bootGrace`/`idleMs` and checks no status. What it loses is the `reading inbox` paint, the `!` clearing and the seed-prompt retry. Still a real defect; `R-21`'s stronger claim (that mail stops) is false and is not restated anywhere. | 01-28 | **a follow-up plan holding `src/renderer/src/hooks/useHive.ts`.** |
| A25 | **`blockReason` surviving an idle is asserted nowhere** (`R-23`) — a pre-existing merge leak. Deliberately unpinned, because pinning it would make the eventual fix look like a regression. | 01-28 | **a follow-up plan holding `src/renderer/src/hooks/useHive.ts`.** |
| A26 | **`b/CR-03`'s ceiling.** The roster one-shot is CLOSED (`grep -rn persistQueues src/` → **0**; `adoptRendererQueues` live). It does not repair a home whose `roster.json` was copied BEFORE 01-28 landed — but those messages were already adopted at the source home, so `adoptRendererQueues`' `existsSync` guard is that home's protection. Recorded so the closure is visible. | 01-28, re-verified at source | **closed — no owner needed.** |
| A27 | **`opencode`'s AUTO chip can lie in BOTH directions.** Its bypass is written into `OPENCODE_CONFIG_CONTENT` at spawn (`src/main/index.ts:3456`) and never reaches the command string the chip reads. Closing it needs the spawn-time value on the `Agent` shape — a store widening. | 01-29 R1, owner was *"01-31's residual register"* | **re-homed to a follow-up plan holding `src/renderer/src/store/autoMode.ts` and the agent store.** |
| A28 | **`autoModeFlagForProvider` reads `autoModeFlag` while `buildSpawnCommand` writes `autoFlag`** (`b/WR-01`). Correct today only by coincidence; now guarded by an assertion pinning all eleven presets to agree, but the reader was not repointed — a shared-module change. | 01-29 R2, owner was *"01-31's register"* | **re-homed to a follow-up plan holding `src/renderer/src/store/autoMode.ts` and `agentProvider.ts`.** |
| A29 | **The splitter's rescue path still persists.** A width genuinely wider than `viewportWidth − 48` is still reduced and written to `localStorage` — the issue-#38 trade. 01-29 removed the newly opened 1024–1279 band from the damage surface entirely (236 persisting writes → 0) and shrank the pre-existing one at every viewport. The complete fix is a non-persisting ephemeral setter, which lives in `store.ts`. **01-29 filed this at *"plan 01-28's file"* and said outright that 01-28 has landed, so it needs an owner naming that file in a LATER plan.** | 01-29 R3 | **re-homed to a follow-up plan holding `src/renderer/src/store/store.ts`.** |
| A30 | **`b/WR-08` — the model chip's `'CLI default'` fallback asserts a fact about an agent whose row could not be resolved.** A real finding, not in this gap set. `AgentCard.tsx`, the model chip's `title` ternary. | 01-29 R4, owner was *"01-31's register"* | **re-homed to a follow-up plan holding `src/renderer/src/components/AgentCard.tsx`.** |
| A31 | **The window/breakpoint pin is a RENDERER test parsing a MAIN-process source file** (`R-29`). Renaming `MIN_WIN`, inlining it or moving it to `src/shared/` makes `test/renderer-runstate.test.cjs` fail with a message about the sidebar. Mitigated — the extractor asserts it matched and the failure names both files and all three constants — not closed. The durable fix is one exported constant both processes import. | 01-29 R5 | **a follow-up plan holding `src/main/index.ts` and `src/renderer/src/store/sidebarLayout.ts` (a cross-process refactor).** |
| A32 | **`DESIGN.md:686` is stale by one line, and two live source comments cite it.** `src/renderer/src/App.tsx:513` and `src/renderer/src/store/sidebarLayout.ts:63` both cite `DESIGN.md:686` for the *"z-index: 2 drawer/sidebar"* claim; `:686` is `\| 3 \| toasts \|` and the drawer/sidebar row is `:685`. 01-29 deliberately left it alone because it had not checked it and *"an unverified correction is worse than a stale one"* — **this plan checked it, and it is off by one. NEW — the sweep working.** | **sweep finding** | **a follow-up plan holding `src/renderer/src/App.tsx` and `src/renderer/src/store/sidebarLayout.ts`.** |
| A33 | **`c/WR-02` is only PARTLY closed.** 01-30 restored ONE of four failure-swallowing settings — the built-nothing tripwire (`installers=` + `::error::` + `exit 1`). Still open and untouched: `Upload build artifacts`' `if-no-files-found: warn` (`release.yml:189`), `Publish to GitHub Release`'s `fail_on_unmatched_files: false` (`:255`), and `Flatten + merge checksums`' `cat … 2>/dev/null \|\| true` (`:218`), which still lets an EMPTY `SHA256SUMS.txt` reach the attest step from the publish side. The build-side hole is closed; the publish-side one is not. All three re-verified at source (their line numbers moved from 01-30's SUMMARY, which is why they are named by key). | 01-30 "Also for 01-31" | **a follow-up plan holding `.github/workflows/release.yml`.** |
| A34 | **The checksum-coverage pin regex-matches a shell line inside a `run:` block scalar** (`T-P30-07`). A legitimate reformat — a `for` loop, a `PATTERNS=` variable, a heredoc — breaks the extraction and turns the test red on a correct change. The extraction assertion makes that LOUD rather than silent, which is the right trade, but it is a ceiling, not durability against refactors. | 01-30 threat table | **a follow-up plan holding `test/ci-config.test.cjs`.** |
| A35 | **The GSD state verbs deterministically CLOBBER `STATE.md`,** and the corruption is reproducible: `state.update-progress` and `state.record-metric` each re-derive the frontmatter from the body and overwrite `status:` with the first physical line of the body's multi-line `Status:` paragraph — an unquoted, truncated YAML scalar — and revert `stopped_at:`. 01-27 measured this twice with a backup-and-diff; **every executor from 01-25 onward has edited `STATE.md` by hand instead.** Not fixed inside the wave because the offending paragraph is 01-23's verdict text and was in no plan's `files_modified`. | 01-27, 01-25, 01-29 (all three) | **a follow-up plan holding `.planning/STATE.md`, or an upstream `gsd-sdk` fix.** |

### B — recorded behaviour changes, so no reviewer reads them as regressions

| # | Change | Where |
|---|---|---|
| B1 | **One measured ALLOW → DENY** (`T-P24-17(i)`). A candidate whose ENTIRE ancestor chain fails to `stat` is now DENIED; it was ALLOWED before. Unreachable on a local volume — the volume root always stats — so it fires for exactly two classes: an unmapped drive letter and an unreachable UNC host (`\\nas.invalid\…`). The failure mode is a false deny, with a reason naming identification, on storage that could not have accepted the write anyway. **A gate that allows what it cannot identify has a spelling-shaped hole in it.** | 01-24 |
| B2 | **A second, narrower deny:** an agent whose cwd is the harness home now has its **relative** reach into another agent's tree denied, exactly as the absolute spelling already was. | 01-24 |
| B3 | **The no-progress arm can escalate a carded agent past `steering` to `constrained`** (`T-P27-02`). The arm is stateful and predates FLOOR-10; FLOOR-10's early return masked it for exactly the population FLOOR-10 was added to watch. Making the band advisory restores it. Not a new trip. `hardStop` is off by default, so the ladder still caps at `constrained` — paused and reported, never a kill (D-18). Pinned by its own named case. | 01-27 |
| B4 | **A persisted 1000×800 window bounds was silently widened to 1280 and is now restored at 1000.** The first launch after this update restores a geometry the app used to override. Intentional. | 01-25 |
| B5 | **The AUTO chip deliberately OVER-reports on the custom arm.** `mytool --auto` and `deploy --approve` now show it, because `--auto` is Kimi's bypass and `--approve` is pi's. A cosmetic false alarm costs a glance; a missed bypass costs the thing the chip exists to prevent. Pinned as a case, not argued in prose. | 01-29 |

### C — operator-blocked

| # | Item | Owner |
|---|---|---|
| C1 | **Merging PR #77 and closing the 20 non-epic `floor-inspection` issues** — the phase's headline deliverable, **0 of 20**. `origin/main` still pins `"electron": "^32.2.0"` and the whole phase sits behind a draft PR, so closing an issue today would record "fixed" against a shipped product that still carries the defect. Merge first, then close each against merged source. | **operator** |
| C2 | **D-09.** Launch `dist\win-unpacked\Hello MarkX.exe` on this Windows host; confirm a real PTY echo, a persisted setting surviving a relaunch, a clean visual pass; write `01-01-SUMMARY.md` — the only plan of 23 with no SUMMARY. `01-VALIDATION.md`'s Nyquist section states outright that no number of unit runs can reconstruct an Electron-version regression, because `test/load-ts.cjs` stubs `electron` for the whole suite. | **operator** |
| C3 | **Cutting a `v*` tag and running `gh attestation verify <artifact> --repo MARKXAILABS/hello-markx`.** 01-30 makes the attested SUBJECT correct; only a published artifact makes the sample run. | **whoever cuts the next tag** |
| C4 | **The remaining `human_verification` items in `01-VERIFICATION.md`** — the log-folder click, the Windows blocked-agent toast, the Tasks-board visual after the poller migration, the auto-mode chip checkpoint, the ~600 swept FLOOR-12 surfaces, and FLOOR-04's live fake-key drop. **The Pixi label ARITHMETIC is A1 and is NOT part of this bundle.** | **operator** |
| C5 | **Whether a real `claude` child forwards `OTEL_EXPORTER_OTLP_METRICS_HEADERS` / `_LOGS_HEADERS`.** The round-trip test proves the collector accepts the header the app exports; it cannot prove the SDK sends it. If it does not, telemetry goes dark floor-wide — cost ledger, resume key, every breaker cost arm, account failover. **What to look for:** the throttled line `[hive] OTLP batch REJECTED (missing or unknown x-hive-otel-token)` in the main log within a minute of the first Claude agent spawning. | **operator** |
| C6 | **Whether a well-formed `sid` still yields byte-identical argv on all three resume forms.** `spawnAgentCore` imports `electron` at module scope and is not reachable from the test harness, so sinks 1–3 are pinned STRUCTURALLY (guard placement between the `const sid` statement and the argv push) rather than behaviourally. | **operator, or a follow-up plan that makes `spawnAgentCore` importable (STRUCT-01)** |
| C7 | **Whether the app is usable at a 960px window,** and whether a 900px sidebar at a 1024px viewport — 60px of floor once the resize stops re-clamping — is a trade the operator accepts. Arithmetic only. Accepted consequences measured but not observed: `IdePanel`'s default `treeWidth = 424` leaves Monaco 532px (266px/pane side-by-side); `Camera.getMinZoom`'s minimum zoom falls 25%; `AddAgentModal`'s `width={940}` crosses its `95vw` clamp for the first time. | **operator** |
| C8 | **SC-1's restatement.** *"Autonomy survives the window"* is not observable on win32 while `src/main/index.ts` kills every PTY and quits on `window-all-closed`. Running with no window is **Phase 2's DAEMON-01**, not FLOOR-02. ROADMAP criterion 1's first sentence therefore stays untrue on the operator's own platform after this wave lands; a one-line pointer to Phase 2 belongs in the criterion. | **the ROADMAP's owner** |
