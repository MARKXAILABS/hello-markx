# Roadmap: Hello MarkX

## Overview

The audit is the backlog. Phase 1 finishes the floor — every one of the 20 open
floor-inspection issues, closed against source rather than against a claim, so that what the
project says about itself becomes true. Phase 2 takes the office off the window: the floor
runs headless, is reachable from a phone, and every one of the eleven engines is a real
citizen of the protocol — and because that work has to open `src/main/index.ts` and
`src/main/hive.ts` at exactly the seams the god-file extraction names, the extraction lands
in the same phase rather than as a separate refactor. Phase 3 makes the office scale: many
floors that cannot read each other, and a yesterday you can replay.

Three phases, coarse granularity. The shape matches GitHub issue #73.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Finish the Floor** - Close all 20 open audit issues, each verified against source, with no partially-landed fix left described as done
- [ ] **Phase 2: The Daemon and the Protocol** - The floor runs with no window and is reachable from a phone; all eleven engines are first-class; the two god-files are split along the seams this work opens anyway
- [ ] **Phase 3: Scale and Observability** - Many isolated floors, bulk hiring, a replayable timeline, and a digest that reaches the operator without the app

## Phase Details

### Phase 1: Finish the Floor
**Goal**: Every claim the project makes about itself is true — all 20 open floor-inspection
issues are closed, and each closure was checked against source and a live test run, not
against an agent's report. This comes first regardless of what is more interesting, because
every later phase builds on code whose current state is only partly what the docs say it is.
**Depends on**: Nothing (first phase)
**Requirements**: FLOOR-01, FLOOR-02, FLOOR-03, FLOOR-04, FLOOR-05, FLOOR-06, FLOOR-07, FLOOR-08, FLOOR-09, FLOOR-10, FLOOR-11, FLOOR-12, FLOOR-13, FLOOR-14, FLOOR-15, FLOOR-16, FLOOR-17, FLOOR-18
**Success Criteria** (what must be TRUE):
  1. **Autonomy survives the window.** With the app window closed, a message composed in the
     UI still reaches its recipient's inbox and is typed into that agent's terminal, and an
     agent that goes idle mid-queue is still woken. The dead Stop-drain is either live under
     a guard or deleted along with the doc claims that describe it — `grep` finds no doc
     promising a code path that does not run. — FLOOR-02
  2. **What ships is on a supported runtime and is signed.** The app runs on Electron 38+
     with `node-pty` and `better-sqlite3` rebuilt, and `npm test` is green on all three CI
     platforms with no `continue-on-error` added. A Windows release artifact is signed and
     carries build provenance, and the release-link gate runs in the pipeline rather than
     being a documented intention. — FLOOR-03, FLOOR-06
  3. **Spend and secrets are contained, not merely observed.** A secret written into an
     agent's file does not appear in `git log -p` of the hive. A task whose `budget-tokens`
     cap is exceeded is actually stopped or escalated — something consumes
     `taskSpend().over`. Spend on every engine, including the proxy-tier ones, reaches the
     breaker and can trip it. — FLOOR-04, FLOOR-09, FLOOR-10
  4. **The floor is legible to the operator watching it.** An agent card shows at a glance
     that the agent runs with permissions bypassed; the four renderings of an agent agree on
     what they show, cost included; the sidebar collapses responsively; every icon button
     has an accessible name and no user-facing text sits below the 14px floor DESIGN.md
     states; a notification fires when an agent is blocked or finishes a long task and
     clicking it focuses that agent; the log folder opens from Settings. A PTY byte does not
     re-render the roster, and the terminal pool is bounded and disposes on every drop path.
     — FLOOR-01, FLOOR-05, FLOOR-11, FLOOR-12, FLOOR-13, FLOOR-14
  5. **The protocol closes its own loops and the issue list is honest.** An unanswered
     `requires_reply` is chased rather than forgotten, and a task marked done is confirmed by
     an agent other than the one that claimed it. Memory recall returns only the asking
     agent's or project's notes, backed by a real SQLite FTS index in the already-open
     `PersistStore`. The renderer has component tests beyond the boot smoke spec. ESLint runs
     or the 13 orphaned `eslint-disable` comments are gone. Codex-on-Windows is either
     supported or its limitation is stated in source, docs and UI — never a bare
     `return false`. `gh issue list --state open --label floor-inspection` returns only the
     four epics. — FLOOR-07, FLOOR-08, FLOOR-15, FLOOR-16, FLOOR-17, FLOOR-18
**Plans**: TBD
**UI hint**: yes

### Phase 2: The Daemon and the Protocol
**Goal**: The office stops depending on a window and stops depending on one engine. Agents
spawn, mail moves and failover completes entirely in main; the operator reaches the floor
from a phone; all eleven engines have an inbox, cost accounting and an honest verification
status.

**Why the god-file extractions live here.** STRUCT-01 (`src/main/index.ts`, 5,620 lines,
~157 IPC handlers, 30+ mutable module globals) and STRUCT-02 (`src/main/hive.ts`, 3,562
lines) are placed in this phase rather than in one of their own, for three concrete reasons:

- **The daemon work has to open exactly these seams anyway.** DAEMON-01 means separating
  window lifecycle from agent lifecycle, scheduler and shutdown inside `index.ts` — which is
  the seam list STRUCT-01 names. PARITY-01/02 means touching the mail router and the
  per-provider installers and template literals at `hive.ts:679-820` and `:3074-3562` — which
  is the seam list STRUCT-02 names. Doing the extraction as a separate phase means opening
  the same files twice.
- **Without the extraction, DAEMON-01 is unverifiable.** `index.ts` imports `electron`, so it
  cannot be loaded under `node --test`; a headless boot path added in place would be
  untestable by construction. The extraction is what turns "runs headless" from a claim into
  a test — which is the whole point of the project's verification-honesty rule.
- **It must not go in Phase 1.** Phase 1 is 18 small, localised fixes. Landing a 5,620-line
  refactor underneath them would put every fix into moving code and put the "finish the
  floor" goal at risk. Extract *after* the suite is green and the issue list is honest, then
  build the daemon on the extracted seams.

**Depends on**: Phase 1 — specifically FLOOR-02 (the rest of the autonomy move must be in
main before headless boot means anything) and FLOOR-03 (do not build the daemon boot path
twice against two Electron majors).
**Requirements**: DAEMON-01, DAEMON-02, DAEMON-03, DAEMON-04, DAEMON-05, PARITY-01, PARITY-02, PARITY-03, STRUCT-01, STRUCT-02
**Success Criteria** (what must be TRUE):
  1. **The floor runs with no window.** Started headless — or with the window quit — agents
     still spawn, mail still routes between them, and an account failover still completes end
     to end. Verifiable two ways: a live run with no window, and a `node --test` case that
     drives the boot path without an Electron binary. — DAEMON-01
  2. **The operator reaches the floor from a phone.** From a phone over an authenticated
     connection, the operator sees what needs a human and answers it, and the answer arrives
     in the agent's terminal. A Telegram or Discord message routes onto the existing
     webhook/Slack rails and reaches the intended agent. — DAEMON-02, DAEMON-03
  3. **MCP servers are per-agent, consented and visible.** Installing an MCP server for an
     agent requires an explicit consent step, and that agent's card afterwards shows which
     servers it has. — DAEMON-04
  4. **Every engine is a first-class citizen, or the UI says it is not.** All eleven engines
     have a routed inbox, or the UI states plainly which ones cannot receive mail *before* an
     operator assigns mail-dependent work to them. All eleven report cost to the ledger and
     to the breaker. The four `live-unverified` bridges (pi, opencode, crush, qwen) are
     unmarked only after a real session against a real account, and otherwise remain marked —
     never silently unmarked. — PARITY-01, PARITY-02, PARITY-03
  5. **The god-files no longer block tests.** `src/main/index.ts` and `src/main/hive.ts` are
     split along the seams their own file headers name, `index.ts` is left as thin
     `ipcMain.handle(name, wrapper)` registration, and `npm test` contains tests for headless
     boot, agent lifecycle, shutdown, the mail router and the git committer that could not be
     written before the split. `npm run build` still works from a clean clone and the suite
     is green on all three platforms. — STRUCT-01, STRUCT-02
**Plans**: TBD
**UI hint**: yes

### Phase 3: Scale and Observability
**Goal**: One operator runs more than one floor without the floors leaking into each other,
and can see what happened yesterday without having been watching.
**Depends on**: Phase 2 — SCALE-01's per-project isolation needs the registry/router split
from STRUCT-02, and SCALE-05's single card needs PARITY-02's all-engine cost.
**Requirements**: SCALE-01, SCALE-02, SCALE-03, SCALE-04, SCALE-05
**Success Criteria** (what must be TRUE):
  1. **Two floors do not leak.** With two projects running side by side, an agent in project
     X cannot recall anything an agent in project Y wrote to memory, and neither project's
     task ledger is visible from the other. — SCALE-01
  2. **A floor comes up in one action.** A team template or bulk import creates a populated
     floor without hiring agents one at a time. — SCALE-02
  3. **Yesterday is replayable.** For a day that has already happened, every hive event,
     envelope and cost appears on one scrubbable timeline. — SCALE-03
  4. **The operator learns what happened without opening the app.** A daily digest reaches
     the operator through an existing channel, and a single agent card shows cost, duration,
     context, account and block state together. — SCALE-04, SCALE-05
**Plans**: TBD
**UI hint**: yes

## External Dependencies

Two requirements have a last mile no phase can force. Named here so the roadmap does not
pretend otherwise, per the project's verification-honesty rule:

| Requirement | Needs | Phase |
|-------------|-------|-------|
| PARITY-03 | pi, opencode, crush and qwen CLIs installed with real accounts — operator-supplied | 2 |
| DAEMON-02 | A real phone on the network for the last mile of the authenticated connection | 2 |

If the operator cannot supply these at plan time, the honest outcome is that the bridges stay
marked `live-unverified` and DAEMON-02 lands with a localhost-verified auth path — not that
either is claimed complete.

## Standing Constraints

Carried from PROJECT.md; every phase inherits them:

- Node 22 for anything native — Node 24 has no `better-sqlite3` prebuild and breaks
  `node-pty`'s winpty gyp.
- `package-lock.json` is written by npm 10, never npm 11.
- All three CI platforms are hard gates. No `continue-on-error` may be added to the matrix.
- A partially-landed fix is an open concern, not a closed one. "Fixed" is a claim until
  re-verified against source and a live test run.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Finish the Floor | 0/TBD | Not started | - |
| 2. The Daemon and the Protocol | 0/TBD | Not started | - |
| 3. Scale and Observability | 0/TBD | Not started | - |

---
*Roadmap created: 2026-08-20*
