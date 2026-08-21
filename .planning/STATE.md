---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Completed 01-11-PLAN.md (FLOOR-04: secret scrub at the single commit choke point). CI green on all six jobs at a9db6b9: ubuntu/macos 496/496/0 fail/0 skipped, windows 496/492/0 fail/4 skipped (the pre-existing 4) - exactly +4 on every platform. Local typecheck 0, npm test 0. B-durability 6 -> 10 with skipped 0, RED-controlled 4/4 against pre-fix hive.ts. redactSecrets 5 -> 9, --staged 0 -> 3, diff --cached 0 -> 2. LOCKSTEP verdict (a) NO WIDENING: REDACT-BODY c9c1cf47 unchanged, voice-messages.test.cjs untouched. gitAsync's pre-commit-hook hole CONFIRMED already fixed by 840c36e (core.hooksPath on both wrappers) - no fix needed here. OUTSTANDING: FLOOR-04's optional manual dev-app check (operator) and the FLOOR-03/#10 issue-mapping errors filed as a blocker."
last_updated: "2026-08-21T06:34:37.895Z"
last_activity: 2026-08-21
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 23
  completed_plans: 10
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-20)

**Core value:** You can leave it running and trust it.
**Current focus:** Phase 01 — finish-the-floor

## Current Position

Phase: 01 (finish-the-floor) — EXECUTING
Plan: 11 of 23 complete
Status: Ready to execute
Last activity: 2026-08-21
prerequisites pulled forward into Phases 1 and 2; traceability filled in for all 71

Progress: [████░░░░░░] 43%

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
| Phase 01 P10 | 35m | 4 tasks | 11 files |
| Phase 01 P11 | 1h55m | 3 tasks | 2 files |

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
- [Phase 01-10]: FLOOR-10 CLOSES HERE — budget: hive.budgetForAgent(id) is applied in runBreakerBeat (index.ts:1613; anchor re-derived by content to :1570, not 01-09's :1560) and its wiring pin landed in the SAME commit 94d6653 (index=1 test=1). The pin is bounded by STRUCTURE (declaration -> inputs.push -> the closing brace-paren), overriding BOTH the plan's slice-then-strip form (01-09 measured it stops 3 lines short of the literal, so it would be red regardless of the code) AND 01-09's strip-then-bound form (still a fixed byte count on a file that grows every wave). Carries a positive control on its own window, and was proven RED against a comment-shaped fake under which grep -c budgetForAgent src/main/index.ts still returns 1.
- [Phase 01-10]: the mine loop no longer requires the mempalace CLI. start()/mineNow() gated on active(), so on the COMMON machine (no mempalace on PATH) the loop never started and the whole memory subsystem was a silent no-op. memory.md is now indexed into memory_fts whenever the harness DB is open, and search() falls back to keywordSearch() — the FTS5 index is the recall path that survives a missing CLI, which is the reason it exists. MemoryManager is wired to the open PersistStore + the registry cwd in index.ts (Rule 2): task 2's file list omitted the wire, and without it the index is never populated and the must-have truth is false.
- [Phase 01-10]: CREATE VIRTUAL TABLE IF NOT EXISTS is KEPT, not silently dropped — probed against the binary that actually loads (better-sqlite3 13.0.3 / SQLite 3.53.4) and run TWICE, because accepting the syntax once proves the parser and running it twice proves the guard. Eight prebuilds are present and new Database(':memory:') opens under plain node here, so test/db-fts.test.cjs RAN LOCALLY and in CI on all three platforms with NO rebuild step: grep -c 'npm rebuild better-sqlite3' ci.yml stays 0 and WORKFLOW-COMMITS=0 against B-sha efb367d.
- [Phase 01-10]: README's 'Enterprise Knowledge Graph' rename was ALREADY-SATISFIED (0 hits) and deliberately NOT performed — README:101 already says 'keyword scoring over text chunks, not entities or a graph', which is exactly what kg-core.cjs:7 means by 'the README says the same thing; keep it that way'; deleting correct prose to satisfy a clause is the 01-04 CONTRIBUTING.md call. The preload carried THREE instances, not the one at :838 the plan names, and index.ts:552/:4201 carried two more which were also renamed, because leaving the claim in the file being renamed recreates the defect one line over.
- [Phase 01-10]: a repo-claims pin that will not go RED is decoration: the first top-level-load assertion for test/db-fts.test.cjs was /^(const|let|var) .*require('better-sqlite3')/m, and 'let Database; try { Database = require(...); } catch { return; }' SATISFIES it — the control stayed green. Fixed at source to match the WHOLE load line against an exact top-level-binding shape plus 'no try opens before the load'; three guard shapes now go red. All 11 repo-claims clauses and both db-fts controls were driven RED before being trusted.
- [Phase 01-11]: FLOOR-04's issue IS #10 (H2 network+secret hygiene, defect 5) — the plan's 'confirm it is NOT #10, #10 is the Electron issue' criterion is FACTUALLY WRONG and was reported rather than satisfied. A body search of all 24 open floor-inspection issues returns #10 as the ONLY match for the scrub clause. #10 is NOT closed: 5 defects, only defect 5 is FLOOR-04, so a per-clause evidence comment was posted per D-42/D-44 (the 01-03 #18 call). Consequent upstream errors FILED not fixed: REQUIREMENTS.md:20-23 maps FLOOR-03 (Electron 38+) to #10 which has no Electron clause (the EOL-Electron issue is #8, CLOSED), and D-42 in 01-CONTEXT.md inherited the same mis-mapping.
- [Phase 01-11]: the scrub sits INSIDE flushCommit's retry loop, and harnessAuthored() exists because a naive version unstages the hive's OWN bootstrap forever — measured, not predicted. GIT_ATTEMPTS is 2 and every attempt re-runs add -A, so a scrub hoisted above the loop is undone by the retry (which fires on index.lock, common on Windows behind AV). Both generated hook shims carry 'payload.sock_token = process.env.HIVE_SOCK_TOKEN' (put there by 01-06's GATE-01 work), which pattern 5 matches on sight; an unstaged file stays untracked so the next add -A re-stages it and the warning fires on every commit forever. Suppressed by BYTE-IDENTITY against the compiled-in constant read from the INDEX blob (git show :path), not a path allowlist and not readFileSync: an agent editing a shim changes the bytes and the scrub fires, and core.autocrlf is true by default on Git for Windows (measured true in a fresh hive) so a disk comparison would silently never match there.
- [Phase 01-11]: failure polarity is deliberately ASYMMETRIC — fail-OPEN when the scrub cannot look, fail-CLOSED when it found something it cannot fix. A failing git diff or an over-bound diff commits anyway and logs loudly (halting every commit would take the hive's whole durability path down, and commit()'s own doc says git here is history not storage); a found secret whose path cannot be resolved or unstaged blocks the commit. Bounded TWICE and both bounds named in the comment: 20,000 changed lines checked via --numstat BEFORE the content diff is ever buffered (a cap applied after buffering is not a bound), then 4 MB on the scanned text because a line count does not bound bytes. Scans ADDED lines only — flagging a removed line would unstage a DELETION, which unpublishes nothing and would wedge the committer permanently on any repo that once held a secret.
- [Phase 01-11]: git restore --staged does NOT work on an unborn HEAD — measured (exit 128 'could not resolve HEAD', unstaged NOTHING), so unstagePath() falls back to git rm --cached --ignore-unmatch. The hive's FIRST commit stages the entire bootstrap, which is precisely the highest-risk window a planted secret rides in on; without the fallback the graded clause fails on exactly that commit while looking fine everywhere else. Also: GitHub Push Protection REJECTED the first ceiling fixture (GH013, Stripe API Key) and the unblock URL was deliberately NOT used — allowing a secret-shaped fixture past push protection weakens the repo's scanning posture permanently. Fixture changed to CAUGHT_SECRET's own material with _ for -, which isolates one character and is a better test. That GitHub catches a shape redactSecrets misses is itself a data point on the ceiling.

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
- ANCHOR DRIFT recorded by 01-07, for later plans and 01-23's greps: hooks.ts's drainAtStop call is at :662 (plans say :332); hive.ts's cursor advance is at :1338 (plans say :1253); after 01-07 delivery.ts drainAtStop is :262 and index.ts's HookServer drain wiring is :480. HIVE.md sections 6-9 are +4 from 01-07-PLAN's table because of plan 02's wave-2 edit. Also drift vs 01-07-PLAN's environment claims: node_modules/@playwright, node-pty/build/Release and better-sqlite3/build ALL EXIST at HEAD — the plan states do, so the e2e blocker may be softer than assumed.
- FLOOR-05's MANUAL clause is OUTSTANDING and 01-10 does NOT claim it: nobody has run 'npm run dev', opened Settings -> General, clicked 'open logs' and watched the OS file manager open the folder; nor opened the Memory panel and seen the shared-scope warning render. MEASUREMENT UNAVAILABLE - it is an interactive GUI observation on a live Electron window. What IS proven: app:openLogs is untouched and live (grep -c 1, present in out/main/index.js), out/preload/index.js carries openLogs and 0 memoryWakeUp/reflectNow, and out/renderer/assets/index-*.js carries 'open logs', 'Log folder' and the warning's first sentence - plus typecheck 0, CI green on 3 platforms and the Electron smoke E2E green at 94d6653. The untested link is the click itself. Owner: operator, before plan 23. Plan 23 must not tick FLOOR-05 on built-bundle evidence alone.
- FLOOR-07 (#31) is only PARTLY closed at 01-10. Renamed: src/preload/index.ts (3 instances), src/main/index.ts:552 and :4201. README needed no rename (0 hits - already honest). STILL carrying 'Enterprise Knowledge Graph' at 94d6653: resources/skills/capabilities/SKILL.md:96 (AGENT-FACING, highest-value one left), src/main/config.ts:159/:275/:493, src/main/hive.ts:1444, src/renderer/src/store/config.ts:74/:142. docs/floor-inspection.html:710 is deliberately excluded - it is the audit record QUOTING the defect. of those files is in 01-10's files_modified and hive.ts/config.ts have owners in other waves (use_worktrees:false), so editing them here risks a lost update. The repo-claims pin covers README.md + src/preload/index.ts only. Owner: a plan holding those files, before 01-23's wave-9 sweep. Also in deferred-items.md.
- FLOOR-05/FLOOR-07/FLOOR-10 rows deliberately left Pending in REQUIREMENTS.md by 01-10, matching the 01-02/04/05/06/07/08/09 precedent: plan 23 owns the checkboxes. FLOOR-10's code half is genuinely complete and proven at runtime (budget: hive.budgetForAgent(id) in runBreakerBeat at index.ts:1613, pinned in the same commit 94d6653, RED-controlled against a comment fake that still satisfies a bare grep) and #34 can close on it. FLOOR-05's code half is complete with the manual clause outstanding. FLOOR-07's index/predicate/honesty halves are complete and pinned; its rename half has the 7-site residual above. FLOOR-09 was HARD-GATED here, not assumed: recordCostSample present at index.ts:525, and it is now PINNED by a test in test/engine-parity.test.cjs so it cannot silently regress before plan 23.

- FLOOR-04's OPTIONAL manual clause is OUTSTANDING and 01-11 does NOT claim it: nobody has run 'npm run dev', dropped a fake key into a live agent's workspace, waited out the 5s COMMIT_DEBOUNCE_MS and confirmed 'git log -p' in the real hive lacks it while the hive log records the scrub. MEASUREMENT UNAVAILABLE - it needs a live Electron window and a real agent CLI session. What IS proven: the identical code path (flushCommit -> scrubStagedSecrets, driven synchronously) against a REAL temp git repo, RED-controlled against pre-fix hive.ts (4/4 new tests fail, the graded one on 'true !== false' for the secret being in git log -p), green on ubuntu/windows/macos in CI at a9db6b9. The plan marks this clause optional, so it does not block FLOOR-04's code half. Owner: operator, before plan 23.
- FLOOR-04 (#10 defect 5) is CLOSED by 01-11, evidenced per-clause at https://github.com/MARKXAILABS/hello-markx/issues/10#issuecomment-5366096362 - but #10 ITSELF IS NOT CLOSED and plan 23 must not treat it as closed. It carries FIVE defects: defect 4 (the hook socket trusts its caller) was closed separately by 840c36e in 01-06; defect 5 closes here; defects 1, 2 and 3 REMAIN OPEN - server.listen(port) with no host in webhook.ts/slack.ts, the uncloseable tunnel, and plaintext slackSigningSecret/slackBotToken/webhookSecret in config.json returned unredacted by config:get. Note also the SCOPE SPLIT inside defect 5 itself: 01-11 closes the 'git add -A commits a token forever' half ONLY; the child-env half (CLAUDE_CODE_OAUTH_TOKEN living in an LLM-controlled shell's environment) is GATE-02 in a later phase and is NOT closed.
- ISSUE-MAPPING ERRORS found by 01-11, FILED not fixed (neither file is in 01-11's files_modified): (a) .planning/REQUIREMENTS.md:20-23 maps FLOOR-03 (Electron 38+) to #10, but #10 is 'H2 - Network and secret hygiene' and its body has NO Electron clause; the EOL-Electron issue is #8, which is CLOSED - so FLOOR-03 currently points at no correct open issue. (b) D-42 in 01-CONTEXT.md:293-298 records #10's unmet clause as 'electron still ^32.2.0', inheriting the same mis-mapping; D-42's reasoning is unaffected, only that parenthetical is wrong. (c) 01-11-PLAN.md task 1 asserts '#10 is the Electron issue' and requires confirming FLOOR-04 is NOT #10 - unsatisfiable, because #10 IS FLOOR-04's issue. A body search of all 24 open floor-inspection issues returns #10 as the ONLY match for the scrub clause. Plan 23 must resolve FLOOR-03's issue pointer before reading any Electron verdict off #10.
- FLOOR-04's row deliberately left Pending in REQUIREMENTS.md by 01-11, matching the 01-02/04/05/06/07/08/09/10 precedent: plan 23 owns the checkboxes. The code half is complete and proven over a real temp git repo with a RED control, but the requirement's truth is bounded by redactSecrets' MEASURED ceiling and plan 23 must not tick it as unconditional: underscore-separated credential prefixes (sk_live_/sk_ant_ - pattern 3 anchors on a literal 'sk-'), bare high-entropy strings with no prefix and no label, and JSON '"token": "..."' (pattern 5 needs the ':' directly after the key name and the closing quote is in the way) all get through, and the hive commits registry.json, tasks.json and every per-agent settings.json. That ceiling is pinned by a named test, not promised. GitHub Push Protection independently caught a Stripe-shaped fixture redactSecrets missed - the hive's matcher is the weaker of the two.
- ANCHOR DRIFT recorded by 01-11 for later plans and 01-23's greps, measured at 1687ed6 against 01-11-PLAN's numbers: UNTRACK_PATHS :274 -> :330, redactSecrets :324 -> :380 (both +56), and everything on the commit path +365 - gitAsync :2627 -> :2992, untrackIgnored :2665 -> :3030, commit(message) :2698 -> :3063, scheduleCommit :2705 -> :3070, flushCommit :2730 -> :3095. After 01-11's own edit (+178 lines in hive.ts) flushCommit is :3266, scrubStagedSecrets :3186, redactSecrets :391. Re-derive by content match, never by line number.
- REDACT-BODY LOCKSTEP HASH, for any later plan that touches redactSecrets: the whole function body hashes to c9c1cf47f0eb87da8d706662e80fdefbaef82c75 (sed -n '/^export function redactSecrets/,/^}/p' src/main/hive.ts | git hash-object --stdin), unchanged by 01-11. The regex battery is mirrored character-identically in test/voice-messages.test.cjs because a .cjs test cannot import the TS module, so ANY widening must land in that file in the SAME commit or it goes red. 01-11 deliberately did NOT widen it: the commit-path false positive and the documented ceiling were both handled without touching the battery, because pattern 5 is what redacts aws_secret_access_key=... on the mail path.
- The hive's generated hook shims are a STANDING false positive for the commit-path scrub, and harnessAuthored() (src/main/hive.ts) is what suppresses it. bin/cth-hook.cjs and bin/hive-proxy.cjs both carry 'payload.sock_token = process.env.HIVE_SOCK_TOKEN' (put there by 01-06's GATE-01 work), which redactSecrets pattern 5 matches on sight. Suppression is BYTE-IDENTITY against the compiled-in HOOK_SHIM/PROXY_BRIDGE_SHIM constants, read from the INDEX blob via 'git show :path' - NOT a path allowlist and NOT readFileSync, because core.autocrlf is true by default on Git for Windows (measured true in a fresh hive repo) so a disk comparison would silently never match there and quietly restore the false positive. Anyone editing those two constants or that method must keep test 2 in test/hive-durability.test.cjs green - it asserts both shims are still versioned, which is the only thing standing between the operator and a scrub warning on every commit forever.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Memory | V2-05 knowledge **graph** | **Retired**, not deferred — RECALL-01…05 covers it; no query was found that an entity graph answers and FTS5 cannot | 2026-08-20 |

## Session Continuity

Last session: 2026-08-21T06:34:37.874Z
Stopped at: Completed 01-11-PLAN.md (FLOOR-04: secret scrub at the single commit choke point). CI green on all six jobs at a9db6b9: ubuntu/macos 496/496/0 fail/0 skipped, windows 496/492/0 fail/4 skipped (the pre-existing 4) - exactly +4 on every platform. Local typecheck 0, npm test 0. B-durability 6 -> 10 with skipped 0, RED-controlled 4/4 against pre-fix hive.ts. redactSecrets 5 -> 9, --staged 0 -> 3, diff --cached 0 -> 2. LOCKSTEP verdict (a) NO WIDENING: REDACT-BODY c9c1cf47 unchanged, voice-messages.test.cjs untouched. gitAsync's pre-commit-hook hole CONFIRMED already fixed by 840c36e (core.hooksPath on both wrappers) - no fix needed here. OUTSTANDING: FLOOR-04's optional manual dev-app check (operator) and the FLOOR-03/#10 issue-mapping errors filed as a blocker.
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
