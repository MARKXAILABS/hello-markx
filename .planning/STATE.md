---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Completed 01-09-PLAN.md (FLOOR-10 MINTING half: the breaker budget arm, hive.budgetForAgent(), the D-22 hive:tasks meter). CI green on PR #77 at 17bf26d, all six jobs incl. Electron smoke; ubuntu/macos 478 tests 478 pass 0 fail 0 skipped, windows 478/474/0 fail/4 skipped (469 before). B-breaker 2->15, B-hive 8->18, B-nan 1->5, hardStop still exactly 4, budgetForAgent in index.ts still 0. FLOOR-10 NOT closed and #34 stays open - the production injection is 01-10's, wave 5, recorded verbatim under 'T-INDEX HANDOFF -> 01-10 (FLOOR-10)'."
last_updated: "2026-08-21T05:23:44.248Z"
last_activity: 2026-08-21
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 23
  completed_plans: 8
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-20)

**Core value:** You can leave it running and trust it.
**Current focus:** Phase 01 — finish-the-floor

## Current Position

Phase: 01 (finish-the-floor) — EXECUTING
Plan: 9 of 23 complete
Status: Ready to execute
Last activity: 2026-08-21
prerequisites pulled forward into Phases 1 and 2; traceability filled in for all 71

Progress: [████░░░░░░] 35%

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
| Phase 01 P06 | 3h15m | 4 tasks | 5 files |
| Phase 01 P07 | 2h05m | 3 tasks | 6 files |
| Phase 01 P08 | 3h05m | 5 tasks | 9 files |
| Phase 01 P09 | 55m | 3 tasks | 5 files |

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
- [Phase 01-06]: FLOOR-09 is a SPLIT and 01-06 is the OPENING half only — the recordCost sink is minted on HookServer and proven at runtime through a real hook socket, but grep -c recordCostSample src/main/index.ts is still 0. The one-argument injection is 01-08 TASK 6's, in wave 4, recorded verbatim in 01-06-SUMMARY.md under the heading 'T-INDEX HANDOFF → 01-08 (FLOOR-09)'. Not plan 07, not plan 09.
- [Phase 01-06]: the first ledger row of an (agent_id, session_id) series bills its OWN value, not zero — the series began at zero so all of it was spent after that zero, and zeroing it silently loses every card that starts and finishes inside one ~30s beat. Later rows are max(0, now - previous); the clamp is a consecutive diff and NOT a high-water mark, because after telemetry.forget() the collector genuinely restarts at zero and the re-climb IS new spend.
- [Phase 01-06]: HookServer's own constructor registers itself as HiveManager's hook-token source (setHookTokenSource), rather than handing a SECOND line to whoever owns index.ts — the sidecar is not a PTY so PtyManager's mint never sees it, and HiveManager's constructor takes only getHome and emit. This keeps the FLOOR-09 argument as the only T-INDEX handoff from this plan.
- [Phase 01-06]: the hive's git suppression is core.hooksPath on BOTH wrappers, not --no-verify on commit — --no-verify covers only pre-commit/commit-msg, leaves post-commit running, and would need repeating at seven call sites. Proven behaviourally (a sentinel-writing .git/hooks/pre-commit must not fire) rather than by asserting the flag, because /dev/null is airtight on POSIX and weaker on win32.
- [Phase 01-07]: main has NO live working/idle store — registry.status is write-once 'idle' (hive.ts:883), no mutator anywhere in src/main, and index.ts:1210 says so outright. So the quiesce flip is ANNOUNCED in two halves rather than stored: setStatus writes the hive log (the durable sink T-P07-05 already names) and emit sends a synthesized Stop-shaped hive:hookEvent, which useHive effect 2 (:541) already maps to idle. No new IPC channel, no preload change, identical UI. Writing registry.status would have been a no-op against a field nothing advances.
- [Phase 01-07]: the backstop rides delivery.ts's EXISTING tick (Math.min(TICK_MS, QUIESCE_POLL_MS)); index.ts gained NO timer — B-setinterval 20 before and after. Boot grace is the bootGraceUntil map DeliveryService already owns (fed by noteSpawn at index.ts:3341), not a fourth injected dep — one concept, one owner.
- [Phase 01-07]: the renderer's 'lastOutputAt > 0' never meant 'never painted' — pty.ts:752 SEEDS the stamp at spawn, so a hung TUI reads as quiet-for-ages the moment its 35s boot grace lapses and would be flipped idle, un-gating delivery against a terminal that cannot receive. Porting it verbatim would have shipped the hole into main. Fixed at SOURCE with hasOutput (pty.ts:753/764) in its own atomic fix commit c291e76, proven RED against the old guard.
- [Phase 01-07]: FLOOR-02 is a THREE-clause requirement and only two close here. The Stop-drain-live clause was ALREADY satisfied before the plan ran (drainAtStop at hooks.ts:662, guarded at delivery.ts:262, wired index.ts:480) — the roadmap's premise that it was dead is factually wrong and was deliberately NOT acted on. The quiesce backstop and the twelve-denial doc clause close here; the queue-drain half (useHive.ts effect #4, :819-968) is plan 08's, wave 4.
- [Phase 01-07]: a fourth test beyond the plan's three: the other three call svc.tick() by hand and would all stay green if start() stopped scheduling the tick — at which point the backstop does not run at all, which IS T-P07-01. It stubs global.setInterval, asserts exactly one timer at <=4s, fires the callback and asserts the flip. Zero wall-clock, proven RED.

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
- FLOOR-09 IS NOT CLOSED. 01-06 minted the recordCost sink on HookServer and proved it at runtime (a CostSample posted at the real hook socket read back out of a real TelemetryCollector's getAgentUsage, with a red negative control), but grep -c recordCostSample src/main/index.ts is 0 at 840c36e. The one-line production injection is 01-08 TASK 6's, wave 4 — reproduced verbatim in 01-06-SUMMARY.md under the exact heading 'T-INDEX HANDOFF → 01-08 (FLOOR-09)'. Plan 10 task 5 hard-gates it in wave 5; plan 23 pins it in wave 9. It is NOT plan 07's and NOT plan 09's.
- RECORD-03/RECORD-04/FLOOR-09/GATE-01 deliberately left Pending in REQUIREMENTS.md by 01-06, matching the 01-02/01-04/01-05 precedent: plan 23 owns the checkboxes. RECORD-03 and RECORD-04 have full runtime evidence (whole-ledger clamped-diff arithmetic; a restart proven across a real spawnSync(process.execPath) boundary with a negative control). GATE-01's sidecar hole is closed and shim coverage is 1 1 1 1 1 1. FLOOR-09 must NOT be ticked until 01-08 task 6 lands.
- QWEN SIDECAR DEAD-HOOKED UNTIL 01-06 is CLOSED at 840c36e: startProxyBridge carries a per-agent token minted through HookServer's registry (not process.env), and PROXY_BRIDGE_SHIM/PI_EXTENSION/OPENCODE_PLUGIN now send sock_token — coverage 1 1 0 0 0 1 -> 1 1 1 1 1 1, proven in the BYTES by running the bootstrapped shim file against a socket. Those three were dead-hooked AT HEAD, before this phase: a pre-existing defect this task closed, not one the phase introduced. Plan 23 needs that attribution.
- cost-ledger.jsonl is NOT rotated. 01-06-PLAN's T-P06-05 accepts the startup rescan on the premise the file is 'already bounded by LOG_ROTATE_BYTES' — measured false: LOG_ROTATE_BYTES applies only to log.jsonl. The scan is over an unbounded file, once per process. Recorded alternative: PersistStore's cost_ledger table, one SUM(...) GROUP BY task_id. RECORD-02 (Phase 4) owns ledger retention. Also: taskSpend() on a card no longer on the board now returns 0, because pruneCostByTask bounds the accumulator by card lifetime.
- FLOOR-02's MANUAL clause is OUTSTANDING and 01-07 does NOT claim it: nobody has run 'npm run dev', closed the window (not quit) and watched an agent that goes idle still get woken. It needs a real hive + a real agent CLI session with a live subscription — an interactive operator observation that cannot be automated from a headless session. What IS proven: the flip happens on main's tick with emit a genuine no-op (only the durable hive-log half can carry it), and start() demonstrably schedules that tick. Plan 23 must not tick FLOOR-02 on that alone. Owner: operator, before plan 23.
- FLOOR-02 IS NOT COMPLETE at 01-07. Two of three clauses close: the idle-quiesce backstop now runs in main's delivery tick, and all twelve of HIVE.md's stale Stop-drain denials are deleted and pinned in test/repo-claims.test.cjs (B-repo-claims 3 -> 5). The THIRD clause — the queue-drain half, useHive.ts effect #4 at :819-968 — is untouched and is plan 08's, wave 4. The Stop-drain-live clause was ALREADY satisfied before 01-07 ran and was neither restored nor deleted. Requirement row left Pending in REQUIREMENTS.md matching the 01-02/01-04/01-05/01-06 precedent: plan 23 owns the checkboxes.
- ANCHOR DRIFT recorded by 01-07, for later plans and 01-23's greps: hooks.ts's drainAtStop call is at :662 (plans say :332); hive.ts's cursor advance is at :1338 (plans say :1253); after 01-07 delivery.ts drainAtStop is :262 and index.ts's HookServer drain wiring is :480. HIVE.md sections 6-9 are +4 from 01-07-PLAN's table because of plan 02's wave-2 edit. Also drift vs 01-07-PLAN's environment claims: node_modules/@playwright, node-pty/build/Release and better-sqlite3/build ALL EXIST at HEAD — the plan states none do, so the e2e blocker may be softer than assumed.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Memory | V2-05 knowledge **graph** | **Retired**, not deferred — RECALL-01…05 covers it; no query was found that an entity graph answers and FTS5 cannot | 2026-08-20 |

## Session Continuity

Last session: 2026-08-21T05:23:44.230Z
Stopped at: Completed 01-09-PLAN.md (FLOOR-10 MINTING half: the breaker budget arm, hive.budgetForAgent(), the D-22 hive:tasks meter). CI green on PR #77 at 17bf26d, all six jobs incl. Electron smoke; ubuntu/macos 478 tests 478 pass 0 fail 0 skipped, windows 478/474/0 fail/4 skipped (469 before). B-breaker 2->15, B-hive 8->18, B-nan 1->5, hardStop still exactly 4, budgetForAgent in index.ts still 0. FLOOR-10 NOT closed and #34 stays open - the production injection is 01-10's, wave 5, recorded verbatim under 'T-INDEX HANDOFF -> 01-10 (FLOOR-10)'.
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
