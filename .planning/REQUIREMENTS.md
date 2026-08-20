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
      the queue-drain and the idle-quiesce backstop move to main alongside the nudge, and
      the dead Stop-drain is either restored under a guard or deleted with its doc claims — #5
- [ ] **FLOOR-03**: Electron is on a supported major (38+), with `node-pty` and
      `better-sqlite3` rebuilt and the three-platform suite still green — #10
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
- [ ] **FLOOR-08**: "Done" is verified by someone other than the agent that claimed it, and
      an unanswered `requires_reply` is chased rather than forgotten — #18
- [ ] **FLOOR-09**: Every engine's spend reaches the breaker, and the god is told per-engine
      capabilities in a prompt-cache-safe position — #19
- [ ] **FLOOR-10**: A per-task token budget is **enforced**, not merely reported — something
      consumes `taskSpend().over` — #34
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

### PARITY — Every engine a first-class citizen

- [ ] **PARITY-01**: All eleven engines have a routed inbox, or the UI states plainly that
      they cannot receive mail before an operator assigns mail-dependent work
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

## v2 Requirements

Tracked, deliberately not in this roadmap.

### Deferred

- **V2-01**: Editable agent names (upstream #188)
- **V2-02**: Claude Code profiles (upstream #105)
- **V2-03**: Amazon Bedrock as a provider (upstream #68)
- **V2-04**: WSL2 support (upstream #146)
- **V2-05**: A real knowledge **graph** — entities and edges — rather than today's TF
  keyword index (#31 delivers dedupe + FTS5, not a graph)

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
| PARITY-01 | Phase 2 | Pending |
| PARITY-02 | Phase 2 | Pending |
| PARITY-03 | Phase 2 | Pending |
| STRUCT-01 | Phase 2 | Pending |
| STRUCT-02 | Phase 2 | Pending |
| SCALE-01 | Phase 3 | Pending |
| SCALE-02 | Phase 3 | Pending |
| SCALE-03 | Phase 3 | Pending |
| SCALE-04 | Phase 3 | Pending |
| SCALE-05 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32 (Phase 1: 18 · Phase 2: 9 · Phase 3: 5)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-20*
*Last updated: 2026-08-20 after the GSD roadmap — traceability filled in*
