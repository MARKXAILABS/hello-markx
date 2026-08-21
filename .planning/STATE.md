---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Completed 01-05-PLAN.md (FLOOR-11: five hiveTasks pollers collapsed onto useHiveTasks; the roster-re-render and bounded-pool clauses verified already-shipped and audited, not rebuilt; test/repo-claims.test.cjs created with 3 RED-proven clauses; proc-kill's win32 silent pass closed). CI green on PR #77 at 0579387, all six jobs. B-repo-claims = 3. FLOOR-11's 'looks identical' half is NOT operator-verified — see Blockers."
last_updated: "2026-08-21T02:42:24.735Z"
last_activity: 2026-08-21
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 23
  completed_plans: 4
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-20)

**Core value:** You can leave it running and trust it.
**Current focus:** Phase 01 — finish-the-floor

## Current Position

Phase: 01 (finish-the-floor) — EXECUTING
Plan: 5 of 23
Status: Ready to execute
Last activity: 2026-08-21
prerequisites pulled forward into Phases 1 and 2; traceability filled in for all 71

Progress: [██░░░░░░░░] 17%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P02 | 2h10m | 4 tasks | 10 files |
| Phase 01 P03 | 1h05m | 3 tasks | 3 files |
| Phase 01 P04 | 1h50m | 4 tasks | 13 files |
| Phase 01 P05 | 55m | 3 tasks | 10 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Six prerequisites pulled forward rather than left in their own category's phase —
  RECORD-03/04 and VERDICT-02/03 and GATE-01 into Phase 1, GSD-06 into Phase 2. Each one makes
  an already-written Phase 1 or Phase 2 success criterion satisfiable by code that does nothing.

- [Roadmap]: STRUCT-01/STRUCT-02 are Phase 2's **internal gate** (criterion 1), not a parallel
  workstream. Phase 2 is the largest risk in the roadmap — daemon + phone + public tunnel + MCP

  + eleven-engine parity + a 5,620-line and a 3,562-line extraction — and the extraction is the
  item most likely to slip and take four other requirements with it. No DAEMON-01, DAEMON-05 or
  PARITY plan starts until the extraction criterion is green.

- [Roadmap]: STRUCT-01/STRUCT-02 stay in Phase 2 rather than a phase of their own — the daemon
  and parity work opens exactly those seams anyway, and the extraction is what makes headless
  boot testable at all. Not Phase 1, so small localised fixes do not land in moving code.

- [Roadmap]: GSD is Phase 6, deliberately last. Every trust property that makes a GSD phase on
  the floor better than a GSD phase in one terminal comes from earlier phases: wave gating needs
  VERDICT, unattended running needs VIGIL and GATE, resume-after-crash needs RECORD.

- [Roadmap]: Four categories are split across phases (GATE, RECORD, VERDICT, GSD). Stated at
  both ends in ROADMAP.md so a reader never has to wonder why a category is halved.

- [Roadmap]: Phase order is fixed by FLOOR-02 → DAEMON-01. Headless boot means nothing until
  the queue-drain and idle-quiesce backstop are in main.

- [PROJECT]: Land the CI/test surface before any fixes — it immediately exposed 4 defects.
- [PROJECT]: Close only genuinely-fixed issues; keep partials open with what remains.
- [Phase 01]: GATE-01 hook token minted at PtyManager (pty.ts:664), not per index.ts call site — one choke point covers every current and future spawn; a missed site is a silently dead-hooked engine
- [Phase 01]: Hook token revoked token-exact on PTY exit, not by agent — a restart is kill()+spawn() under the same id, so revokeAgent there would dead-hook the live replacement
- [Phase 01]: GATE-01 NOT marked complete at 01-02: the qwen sidecar edit and the three missing shim bodies are 01-06 task 4 (wave 3); qwen/crush is dead-hooked for one wave, deliberately
- [Phase 01]: [Phase 01-03]: owesReview is process-local and is NEVER rebuilt from the persisted board at startup — 01-RESEARCH recommended a startup rebuild; the plan overrode it and the plan is right. The rebuild IS the boot review-storm: sweep 1 returns 0 at the seed guard, sweep 2 mints nothing new, but a rebuilt set already holds every historic done card, so one query is mailed per card. Proven RED, not argued: 3 !== 0, with three [review] queries in the reviewer's inbox.
- [Phase 01]: [Phase 01-03]: defect 2 is closed by DELETING the previous-snapshot membership guard, not by the obligation set — A card created AND flipped to done inside one 60s SWEEP_INTERVAL_MS window is never observed in a non-done state by any snapshot, so an obligation set gated on previous.has(id) never mints for it and no retry recovers it. The set alone fixes 'nobody was free'; only the deletion fixes 'nobody ever looked'.
- [Phase 01]: [Phase 01-03]: issue #18 left OPEN — only 1 of its 7 Fix clauses is closed — The reviewer step is closed; spawn-requests is in no agent-facing doc, enrichTaskPrompt still has zero callers, and the work-order string's anchor has drifted. D-42 sets the bar per-acceptance-clause precisely to prevent closing on partial work, so a full per-clause evidence comment was posted instead of a close.
- [Phase 01-04]: the repo-fact pins PARSE the workflow YAML and js-yaml is now a DECLARED devDependency — proved necessary, not preferred: with the attest step commented out, grep -c attest-build-provenance still returned 1 while the parsed test went red, and ci.yml says 'continue-on-error' twice in prose including once inside the test job itself, so a text search of that job returns a hit when the true answer is zero
- [Phase 01-04]: CONTRIBUTING.md:82-101 was VERIFIED clause by clause against a parsed ci.yml and NOT rewritten — all three claims (three hard-gate platforms, no continue-on-error in the test matrix, test:focused never a gate) confirmed true, so the correct action was to pin it; deleting and replacing correct prose would have destroyed it
- [Phase 01-04]: SECURITY.md names the sidecar/pi/opencode token gap out loud rather than omitting it — plan 02's PTY half is verified landed at HEAD, D-13's hive.ts half is verified OPEN (0 hits for HIVE_SOCK_TOKEN in startProxyBridge, shims still 1 1 0 0 0 1), and a doc that runs ahead of the code is the same defect as one that lags it
- [Phase 01-04]: the hook-token ceiling is stated as D-14's two properties ONLY — no floor-wide key, payload.agent_id untrusted. 'Agent A cannot authenticate as agent B' is deliberately NOT claimed: B's token lives in B's process environment and a same-uid Linux sibling reads /proc/<B-pid>/environ
- [Phase 01-04]: FLOOR-06's live 'gh attestation verify' sample is OUTSTANDING, not claimed — the publish job is gated on refs/tags/v*, no tag has been pushed since, so provenance is verified structurally (parsed test over step/input/permissions/ordering) and NOT end-to-end. Plan 23 must not tick FLOOR-06 on structural evidence alone
- [Phase 01-05]: the hook header's 'delete the local useState' was followed in 1 of 5 files, not 5 — AskMeTab/TaskDetailOverlay/TasksKanban each write to local tasks optimistically before the disk round trip (dismiss, sendAnswer, move), so deriving straight off the shared payload would leave a dismissed card on the board for up to 5s. That is a rendered-output change and UI-SPEC's FLOOR-11 contract calls it a regression. Timers deleted, state kept. AgentStrip has no local mutation, so there the header was followed literally
- [Phase 01-05]: the durable FLOOR-11 guard in test/repo-claims.test.cjs is NOT the literal 'setInterval in the same effect as hiveTasks()' check the plan specifies — a textual same-effect test would have missed 3 of the 5 real sites, because AskMeTab/TaskDetailOverlay/TasksKanban each defined refresh in a useCallback OUTSIDE the effect and passed the identifier in. Implemented instead as a per-file rule with one reasoned allowlist entry (hooks/useHive.ts) whose hiveTasks() call-site COUNT is pinned. Proven by driving it RED against two of those exact three files

### Pending Todos

- **Operator decision, Phase 3 ordering.** Either run `1 → 2 → 4 → 5 → 3 → 6`, or run numeric
  order and re-verify SCALE-01 and SCALE-03 after Phase 5 instead of closing them in Phase 3.
  Default recorded in ROADMAP.md is numeric order with re-verification. See "Blockers" below.

### Blockers/Concerns

- **Phase 3 has two forward dependencies** (found while extending the roadmap; not resolved by
  moving requirements, because the pull-forward cascades):

  - SCALE-03's replayable timeline reads storage that RECORD-02 (Phase 4) fixes — until then,
    `LOG_ROTATE_BYTES` at `hive.ts:267` rotates at 8 MB keeping one generation, so a busy day
    replays as a window rather than a day.

  - SCALE-01's isolation is enforced by a `--wing` flag the agent supplies and could omit until
    RECALL-02 (Phase 5) makes the server enforce it. REQUIREMENTS.md says as much itself.
  Neither may be checked off in Phase 3 without re-verification after Phase 5.

- **Phase 2 is the largest single-phase risk.** Mitigated by making STRUCT-01/02 the phase's
  internal gate, but the mitigation only works if it is honoured at plan time.

- **PARITY-03 (Phase 2) and GATE-04 (Phase 4)** both need the pi/opencode/crush/qwen CLIs with
  real accounts. Operator-supplied; each engine needs its own subscription, which this project
  does not have. Bridges stay marked `live-unverified` otherwise, and GATE-04 ships enabled only
  for the engines actually exercised.

- **DAEMON-02 (Phase 2)** needs a real Android device on the network for its last mile;
  otherwise a localhost-verified auth path, recorded as such.

- **REACH-02 (Phase 6)** needs an AWS account with Bedrock model access; **REACH-03 (Phase 6)**
  needs a real WSL2 install. Without them, both ship with the limitation stated in source, docs
  and UI — never claimed.

- **Electron 32 is EOL** (Chromium 128, no CVE backports). FLOOR-03 is the bump; it carries a
  native rebuild of `node-pty` and `better-sqlite3`, not just a version string.

- **Node 22 only** for anything native; `package-lock.json` must be written by npm 10.
- **Zero recurring cost, total roadmap $0.** No paid certificate, notarization, hosted
  embeddings or metered API on a required path. FLOOR-06 delivers Sigstore provenance and
  checksums instead of Authenticode, and the docs must say plainly that SmartScreen still fires.

- QWEN SIDECAR DEAD-HOOKED UNTIL 01-06: hive.ts startProxyBridge carries no HIVE_SOCK_TOKEN, and PI_EXTENSION/OPENCODE_PLUGIN/PROXY_BRIDGE_SHIM send no sock_token at all (dead-hooked at HEAD, pre-existing). Owner: 01-06 task 4, wave 3. Also hand it --no-verify on gitAsync.
- #18 IS NOT CLOSED and plan 23 must not treat it as closed. Plan 01-03 closed its reviewer clause only. Three Fix clauses remain unmet at b09fd74: (a) spawn-requests is documented in no agent-facing doc — PROTOCOL.md and COMMANDS.md do not exist; (b) the hookless-engine work-order string's audit anchor (useHive.ts:137) has drifted and the clause cannot be adjudicated from source without its own pass; (c) enrichTaskPrompt (src/renderer/src/hooks/useHive.ts:241) still has zero callers, neither wired nor deleted. D-46's phase gate (open floor-inspection issues excluding epics == 0) cannot pass until these land. Per-clause evidence: https://github.com/MARKXAILABS/hello-markx/issues/18#issuecomment-5364189116
- FLOOR-06's live sample is OUTSTANDING: 'gh attestation verify <artifact> --repo MARKXAILABS/hello-markx' has never been run, because release.yml's publish job is gated on refs/tags/v* and no tag has been pushed since 01-04 landed the step. Provenance is verified STRUCTURALLY only (parsed assertions over the step, subject-checksums, the three job permissions and merge<attest<upload ordering). Plan 23 must not tick FLOOR-06 on that evidence alone — run it against a published artifact after the next v* tag and paste the output.
- ADR-0006 exists (docs/adr/0006-terminal-pool-lifetime.md) but its TWO source pointers are NOT added: terminalPool.ts and terminalPoolPolicy.ts are plan 01-05's files in this same wave. Until 01-05 adds them, neither source comment links to the record, so FLOOR-17's 'source comments linked rather than deleted' clause is only half true. The ADR-0005 pair (db.ts, telemetry.ts) IS added by 01-04 — plans 06 and 10 own those files in later waves and must not revert the one-line comments.
- FLOOR-11's 'no visual change' clause is verified by SOURCE REASONING plus a green E2E Electron smoke (which mounts AgentStrip and asserts the MICHAEL card renders) — NOT by watching the app. Nobody opened the Tasks board, the detail overlay or the kanban with a live ledger. Plan 23 must not tick FLOOR-11 on that alone: run 'npm run dev', open the Tasks board and the office floor, and confirm task data still updates and looks identical. Owner: operator, before plan 23.
- ADR-0006 pointer blocker filed by 01-04 is CLOSED: both source comments landed in 01-05 (terminalPool.ts header, terminalPoolPolicy.ts header). terminalPoolPolicy.ts received EXACTLY one line and nothing else. Later owners of these two files must not revert either comment.
- FLOOR-11 deliberately left PENDING in REQUIREMENTS.md, not Complete — matching 01-02 (GATE-01) and 01-04 (FLOOR-06/17): plan 23 owns the checkboxes. All three of its clauses have real evidence (roster-re-render and bounded-pool verified already-shipped + audited + pinned by test/renderer-runstate.test.cjs; the N-pollers clause closed by adoption and pinned by test/repo-claims.test.cjs, green on three platforms at 0579387). The one thing NOT observed is the 'no visual change' contract on the migration. Tick it after the operator run named in the blocker above.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Memory | V2-05 knowledge **graph** | **Retired**, not deferred — RECALL-01…05 covers it; no query was found that an entity graph answers and FTS5 cannot | 2026-08-20 |

## Session Continuity

Last session: 2026-08-21T02:41:27.218Z
Stopped at: Completed 01-05-PLAN.md (FLOOR-11: five hiveTasks pollers collapsed onto useHiveTasks; the roster-re-render and bounded-pool clauses verified already-shipped and audited, not rebuilt; test/repo-claims.test.cjs created with 3 RED-proven clauses; proc-kill's win32 silent pass closed). CI green on PR #77 at 0579387, all six jobs. B-repo-claims = 3. FLOOR-11's 'looks identical' half is NOT operator-verified — see Blockers.
(16, then ~35, then 40+ findings; 15 BLOCKER in round 3). The step-11.5 iteration budget is
exhausted, so RED_TEAM_CLEAN stays false and auto-advance to execute-phase is blocked. The defect
rate did not converge and each round's fixes introduced new defects of the same class, so the
recommendation recorded in 01-CONTEXT.md's Red-Team Log is to RE-PLAN, not to patch a fourth time.
Decisive finding: GATE-01's qwen-sidecar fix is a no-op — PROXY_BRIDGE_SHIM never reads
HIVE_SOCK_TOKEN (3 of 6 shim templates do not), so the fix, its criterion and the wave-9 wholeness
assertion all pass while the tier stays dead-hooked.
filled in for all 71 v1 requirements and verified programmatically (71 mapped, 0 orphans,
0 duplicates)
Resume file: None
