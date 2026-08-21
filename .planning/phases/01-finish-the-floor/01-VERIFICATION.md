---
phase: 01-finish-the-floor
verified: 2026-08-21T18:15:56Z
status: gaps_found
score: 0/5 ROADMAP success criteria fully TRUE (2 PARTIAL, 3 FALSE) · 10/23 requirement rows closed
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: none
  note: "Initial verification. No prior 01-VERIFICATION.md existed."
gaps:
  - truth: "SC-5 final clause — `gh issue list --state open --label floor-inspection` returns only the four epics"
    status: failed
    reason: >-
      Measured live at 2026-08-21T18:15Z: 24 open issues carry the label, of which
      4 are epics (#73, #49, #48, #47). 20 non-epic floor-inspection issues remain
      OPEN. Zero were closed. This is the phase's headline deliverable — "close all
      20 open floor-inspection issues" — and it is 0/20. The cause is recorded and
      correct: origin/main still pins `"electron": "^32.2.0"` and all 158+ phase
      commits sit unmerged on `gsd/v1.0-milestone` behind draft PR #77, so closing
      an issue today would record "fixed" against a shipped product that still
      carries the defect.
    artifacts:
      - path: "(github) MARKXAILABS/hello-markx issues"
        issue: "20 non-epic floor-inspection issues open; 0 closed"
      - path: "(github) PR #77"
        issue: "Still a DRAFT. 7/7 checks green, MERGEABLE/CLEAN, but unmerged."
    missing:
      - "Merge PR #77 to main (operator) — the precondition for every issue closure"
      - "Then close the 20 non-epic issues, each against the merged source"
  - truth: "SC-3 — Spend, secrets and agent identity are CONTAINED, not merely observed"
    status: failed
    reason: >-
      GATE-01's hook-socket half is genuinely closed and was re-derived at source.
      Two other doors on the same trust surface are open, and both were added or
      left standing by this phase.
    artifacts:
      - path: "src/main/telemetry.ts:314-345"
        issue: >-
          `handleRequest` applies a body-size cap and NOTHING else — no token, no
          HMAC, no origin check — before `ingestMetrics`/`ingestLogs`. Those read
          `agent.id` and `session.id` straight off the payload (`:361`, `:400`).
          Any local process, including any LLM-controlled agent shell, can post
          fabricated spend for ANY agent. The file header at `:28` claims the
          "transport posture mirrors slack.ts"; slack.ts:309-322 does HMAC + a
          replay window + a timing-safe compare. The claim is false.
      - path: "src/main/hooks.ts:126-138, :485-510"
        issue: >-
          `realResolve(p)` calls `resolve(p)` with ONE argument, so a RELATIVE
          PreToolUse target resolves against main's `process.cwd()`, not the hive
          root. Every `within(...)` deny branch protecting `<hive>/bin`,
          `<hive>/.git`, the hook socket and other agents' directories then
          compares the wrong path. `payload.cwd` is declared on the payload type
          and read ZERO times in this file.
      - path: "src/main/hive.ts:391-417 (redactSecrets)"
        issue: >-
          FLOOR-04's requirement reads "so it never reaches git history". Read
          directly from the regexes: pattern 3 anchors on `sk-`/`sk-ant-` with a
          HYPHEN, so `sk_live_…` passes; pattern 5 requires the key to be
          immediately followed by `\s*[:=]\s*`, so JSON `"token": "…"` (closing
          quote between key and colon) passes. Bare high-entropy strings match
          nothing. The scrub itself is correctly placed (`hive.ts:3283`, inside
          `flushCommit`'s retry loop) — the MATCHER is the ceiling.
    missing:
      - "Authenticate the OTLP collector, or bind agent.id server-side the way the hook socket does"
      - "Pass the hive root as resolve()'s base in realResolve(), or use payload.cwd"
      - "Widen redactSecrets for underscore prefixes and JSON value position, or restate FLOOR-04 as bounded"
  - truth: "SC-4 — The floor is legible to the operator watching it (sidebar collapses responsively; the AUTO chip shows an agent running bypassed)"
    status: failed
    reason: >-
      Two of the six sub-clauses do not hold in the shipped app. The 14px floor,
      accessible names, log-folder button, notifications and the poller/pool work
      DO hold and were verified at source.
    artifacts:
      - path: "src/main/index.ts:2516, :2670 + src/renderer/src/store/sidebarLayout.ts:22 + src/renderer/src/App.tsx:79"
        issue: >-
          `MIN_WIN = { width: 1280 }` is applied as `minWidth` to BOTH the primary
          and every floor window. `SIDEBAR_COLLAPSE_WIDTH = 1024`. `vpWidth` is
          `window.innerWidth`. The collapsed branch of `sidebarLayout()` is
          UNREACHABLE in the shipped app, and `renderer-runstate.test.cjs` is green
          at widths (1023/1000/800/20) the window cannot produce.
      - path: "src/renderer/src/store/autoMode.ts:42, :57"
        issue: >-
          `isAutoModeAgent` returns false for `custom` unconditionally and never
          inspects the raw command string for a bypass flag, so an operator who
          types `--dangerously-skip-permissions` into a custom command gets NO
          chip. `opencode` is documented in-source as able to lie in both
          directions. FLOOR-01 asks whether the AGENT is running bypassed.
    missing:
      - "Lower MIN_WIN.width below 1024, or delete the collapse branch and its tests, or restate FLOOR-13"
      - "Inspect the raw command string for a bypass flag on the `custom` arm"
  - truth: "SC-2 — What ships is on a supported runtime and its provenance is checkable (the LIVE half)"
    status: partial
    reason: >-
      Every structural half is TRUE and was re-derived here. Both LIVE gates that
      this phase's own 01-VALIDATION.md declares non-optional and
      non-substitutable-by-CI are UNRUN.
    artifacts:
      - path: ".planning/phases/01-finish-the-floor/01-01-PLAN.md"
        issue: >-
          The only plan of 23 with NO SUMMARY. Its D-09 gate — launch
          `dist\win-unpacked\Hello MarkX.exe`, confirm a real PTY echo, a persisted
          setting surviving a relaunch, a clean visual pass — has never been run.
          01-VALIDATION.md:60-83 states outright that no number of unit runs can
          reconstruct an Electron-version regression, because test/load-ts.cjs
          stubs `electron` for all 535 tests, and that the Windows-only ConPTY path
          is exercised by no Electron-launching job on any platform.
      - path: ".github/workflows/release.yml:220-222"
        issue: >-
          `actions/attest-build-provenance@v4` on `subject-checksums:
          release/SHA256SUMS.txt` is correctly ordered and permissioned, but
          `gh attestation verify` has never been run against a published artifact —
          the publish job is gated on `refs/tags/v*` and no tag has been pushed.
          Provenance is verified STRUCTURALLY ONLY.
    missing:
      - "Operator runs D-09 on this Windows host and writes 01-01-SUMMARY.md"
      - "Cut a v* tag and run `gh attestation verify <artifact> --repo MARKXAILABS/hello-markx`"
  - truth: "SC-1 — Autonomy survives the window (the OBSERVABLE half)"
    status: partial
    reason: >-
      The code-move half is fully TRUE and was re-derived at source. The clause as
      literally written cannot be observed on the operator's own platform today.
    artifacts:
      - path: "src/main/index.ts:5792-5798"
        issue: >-
          `app.on('window-all-closed')` calls `ptyManager.killAll()` then
          `app.quit()` on every non-darwin platform. On Windows and Linux, closing
          the last window KILLS EVERY PTY AND QUITS THE APP — so "with the app
          window closed, a message ... is typed into that agent's terminal" is not
          observable. Running with no window is DAEMON-01 (Phase 2), not FLOOR-02.
      - path: "(unrun) operator observation"
        issue: >-
          Nobody has run `npm run dev`, closed the window rather than quitting, and
          watched an idle agent still get woken.
    missing:
      - "Either restate SC-1 to the reload/renderer-crash boundary FLOOR-02 actually covers, or hold it open until DAEMON-01"
  - truth: "The published `531 pass` figure is an honest floor"
    status: failed
    reason: >-
      Reproduced independently this session (535 tests / 531 pass / 0 fail / 4
      skipped, 19.4s) — and the figure counts at least TWO Windows non-runs as
      passes. A `node:test` callback that returns normally is a PASS, not a skip.
    artifacts:
      - path: "test/net-binding.test.cjs:319-325"
        issue: >-
          `if (process.platform === 'win32') { console.error(...); return; }` inside
          an `async (t) =>` callback. This is the GATE-01 socket-watchdog test —
          "deleting the hook socket no longer opens the gate until the app
          restarts" — and it never runs on the operator's own platform while
          reporting green.
      - path: "test/win-cmd-shim.test.cjs:167"
        issue: "`if (process.platform === 'win32') return;` — same shape, second instance."
      - path: "test/hook-auth-roundtrip.test.cjs:163-198"
        issue: >-
          `shimTemplates()` reads hive.ts raw and guards with
          `assert.match(body, /sock_token/)`. A commented-out
          `// payload.sock_token = …` satisfies it. Five of six shims have no other
          pin. (All six ARE live assignments at source today — hive.ts:3635, :3705,
          :3758, :3797, :3859, :4085 — so this is a pin defect, not a source
          defect.)
    missing:
      - "Convert both platform early-returns to `t.skip(...)` so the counters tell the truth"
      - "Pin each shim's sock_token assignment against a non-comment match"
deferred:
  - truth: "Memory recall scope is enforced by the server rather than by an agent-supplied `--wing` flag"
    addressed_in: "Phase 5"
    evidence: "RECALL-02: 'Scope is enforced by the server, not by a flag the agent could omit' — and FLOOR-07's own ⚠️ names RECALL-02 as the real version of this clause."
  - truth: "A review looks at the diff and the repo's own check outcome"
    addressed_in: "Phase 5"
    evidence: "VERDICT-01. FLOOR-08's own ⚠️ states the reviewer does not read a diff and names VERDICT-01 as the owner."
  - truth: "The floor runs with no window open at all"
    addressed_in: "Phase 2"
    evidence: "Phase 2 goal: 'The floor runs with no window and is reachable from a phone' — DAEMON-01."
  - truth: "The `{tokens, budgetTokens, pct}` fields widened onto `hive:tasks` reach a renderer consumer"
    addressed_in: "Phase 2+"
    evidence: "REQUIREMENTS.md:566 adjudicates these as a per-card budget METER, not a FLOOR-13 clause, owned by a later plan holding TasksKanban.tsx. `grep -rn budgetTokens src/renderer/` returns nothing — confirmed."
human_verification:
  - test: "D-09 — launch `dist\\win-unpacked\\Hello MarkX.exe` on this Windows host; open a terminal pane; type a command; change a setting; relaunch."
    expected: "A real PTY spawns and echoes; a real better-sqlite3 write lands and the setting survives the relaunch; a clean visual pass."
    why_human: "All 535 unit tests run with `electron` stubbed by test/load-ts.cjs and are structurally incapable of failing on an Electron-version or native-ABI regression. The only real-Electron job is Linux/xvfb. This is FLOOR-03's declared closure evidence and 01-VALIDATION.md forbids substituting a CI link for it."
  - test: "Cut a v* tag, then run `gh attestation verify <artifact> --repo MARKXAILABS/hello-markx`."
    expected: "The downloaded artifact verifies against this repo and this commit."
    why_human: "Needs a published release artifact; the publish job is gated on refs/tags/v* and no tag has been pushed. FLOOR-06's live sample."
  - test: "`npm run dev`, CLOSE the window (do not quit), then send a message from a producer and watch an idle agent get woken."
    expected: "The message reaches the inbox and is typed into the agent's terminal."
    why_human: "Needs a real hive and a live agent CLI session. NOTE: on win32 this is currently blocked by index.ts:5792 — see the SC-1 gap."
  - test: "Open Settings → General → `open logs` and click it."
    expected: "The OS file manager opens the log folder."
    why_human: "The chain is verified at source end to end (index.ts:4644 → preload:840 → SettingsModal:693); the untested link is the click and the OS handoff."
  - test: "Block a real non-Claude agent on Windows; confirm exactly ONE toast; click it."
    expected: "One toast fires and clicking it focuses that agent."
    why_human: "No test can reach 'Windows actually DREW it' — Focus Assist and per-app settings can suppress it. macOS delivery is structurally unverifiable: UNNotification needs a code-signed app and paid signing is out of scope."
  - test: "Open the Tasks board, the detail overlay and the kanban with a live ledger after the useHiveTasks poller migration."
    expected: "No visual change from before the migration."
    why_human: "FLOOR-11's 'no visual change' clause has never been observed by a human."
  - test: "Launch the dev app, toggle auto mode WITHOUT restarting, and tab to the AUTO chip."
    expected: "The chip reflects what the running agent is actually doing, and is reachable and announced."
    why_human: "01-12's seven-step operator checkpoint was never run."
  - test: "Look at the ~600 swept FLOOR-12 surfaces and the Pixi labels."
    expected: "No user-facing text reads smaller than 14px on screen; no layout clips."
    why_human: "No human has looked at any swept surface. Pixi labels take FONT_SIZE = 14 inside a container held at RENDER_SCALE = 0.5, so the designed on-screen size is 7px; two layout clips (SkillsTab catalog row, SidebarTabs TERMINAL/MESSAGES labels at the default 420 rail) are reported and unfixed."
  - test: "Drop a fake API key into a live agent's workspace and let the hive commit."
    expected: "The key does not appear in `git log -p` of the hive."
    why_human: "FLOOR-04's optional live clause, unrun. Note the matcher ceiling above — choose the fake key's SHAPE deliberately."
---

# Phase 1: Finish the Floor — Verification Report

**Phase Goal:** Every claim the project makes about itself is true — all 20 open
floor-inspection issues are closed, and each closure was checked against source and a live
test run, not against an agent's report.

**Verified:** 2026-08-21T18:15:56Z
**Status:** `gaps_found`
**Re-verification:** No — initial verification.
**Tree verified:** `gsd/v1.0-milestone` @ `37c0bd3`, working tree clean.

---

## The one-line answer

**The floor was largely fixed. The floor was not finished.** 132 source files of real,
substantive, mostly-correct work landed and 10 of 23 requirement rows close honestly against
source. But the phase goal is a statement about *closed issues on a shipped product*, and
**zero of the twenty are closed**, because the work is unmerged. Three of five ROADMAP success
criteria are FALSE at source, not merely unobserved — and two of those three are security
controls this phase itself added.

I would not bet a pager on this phase being complete. I would bet one on the code being better
than it was.

---

## Goal Achievement — ROADMAP Success Criteria

Each criterion verified individually against source. No SUMMARY claim was accepted as evidence.

| # | Criterion | Verdict | Named evidence |
|---|-----------|---------|----------------|
| 1 | **Autonomy survives the window** — FLOOR-02 | ⚠️ **PARTIAL** | Code-move TRUE: `delivery.ts:518` `drainQueue` + `delivery.ts:643` `quiesce`, both riding the single tick at `:684-688`; Stop-drain live and guarded (`index.ts:545` → `hooks.ts:663` → `delivery.ts:604`, `stop_hook_active` screened at `hooks.ts:646`); renderer drain deleted, `useHive.ts:770-807` is a VIEW only; `delivery.start()` at `index.ts:5572`. Doc clause TRUE: `docs/message-queue.md:30` and ADR-0001 now describe the live path. **Observable clause FALSE:** `index.ts:5792` `window-all-closed` → `ptyManager.killAll(); app.quit()` on non-darwin. Never live-run. |
| 2 | **Supported runtime + checkable provenance** — FLOOR-03, FLOOR-06 | ⚠️ **PARTIAL** | Structural TRUE: `electron ^43.4.1` pinned AND installed (43.4.1); `node-pty` rebuilt (`build/Release/pty.node`, `conpty.node`); `better-sqlite3 13.x` is N-API and ships all 8 prebuilds — correctly NOT rebuilt, and `ci.yml:9-13` says exactly that; **no `continue-on-error` added** — 2 effective sites, byte-identical to `origin/main`'s 2, verified by diff; PR #77 7/7 green; suite reproduced here 535/531/0/4; `e2e/smoke.spec.ts:188-202` asserts major ≥ 43 (D-10 landed); `release.yml:23`+`:37` = the `links` gate really is in the pipeline (`build` declares `needs: links`); `release.yml:220-222` attests the merged checksums; `README.md:182` states plainly the installers are unsigned and SmartScreen fires. **Live TRUE: neither.** D-09 unrun, no `v*` tag. |
| 3 | **Spend, secrets and identity CONTAINED** — FLOOR-04, 09, 10, RECORD-03/04, GATE-01 | ❌ **FALSE** | Spend arithmetic TRUE: `COST_TAIL_BYTES` deleted (only a tombstone comment at `hive.ts:265` and a test at `hive-protocol-v2.test.cjs:465`); `applyCostRow` (`hive.ts:2837-2855`) is a clamped CONSECUTIVE diff `max(0, now − previous)` keyed `(agent_id, session_id)`; `rescanCostLedger` scans the WHOLE ledger, bounded by card lifetime via `pruneCostByTask`. Consumption TRUE: `index.ts:1635` → `breaker.ts:358-365`. Proxy sink TRUE: `index.ts:547`. Hook identity TRUE: `mintToken` = `randomBytes(32)` per spawn, `Map`-bound to agentId, `authorized()` a plain `Map.get`, floor-wide constant deleted (`index.ts:5710`), all six shims live. **Containment FALSE on three counts** — the unauthenticated OTLP collector, the `resolve(p)`-with-one-arg path gate, and the `redactSecrets` matcher ceiling. See gaps. |
| 4 | **Legible to the operator** — FLOOR-01, 05, 11, 12, 13, 14 | ❌ **FALSE** | TRUE: `app:openLogs` end-to-end (`index.ts:4644` → `preload:840` → `SettingsModal:693`); `useHiveTasks` adopted at all 5 sites; pool disposal on every drop path (`terminalPool.ts:322`, `:337`, `:701-706`); **0 `fontSize:` literals below 14px in the entire renderer — measured here, not read from a SUMMARY**; lint green with `reportUnusedDisableDirectives: 'error'`; `notifyBlocked` (`hooks.ts:780`) gated on provider in MAIN at `index.ts:4084`. **FALSE:** the 1024px collapse is dead code behind `minWidth: 1280`; the AUTO chip under-reports `custom`. No human has looked at anything. |
| 5 | **Protocol closes its loops and the issue list is honest** — FLOOR-07, 08, 15, 16, 17, 18, VERDICT-02/03 | ❌ **FALSE** | Protocol TRUE: `owesReview` obligation set (`hive.ts:1890`) minted at `:1972`, guarded at `:1973`, cleared only on a mailed query at `:1993`; `canReceiveInbox` enforced at `hive.ts:1908` inside `leastLoadedIdle`, plus `:1573` and `:1596`. FTS5 `memory_fts` real in the already-open `PersistStore` (`db.ts:100`, `:239-270`) with a `keywordSearch()` fallback (`memory.ts:524`). `renderer-components.test.cjs` present and green. `eslint . --max-warnings 0` **exit 0, run here**. Six ADRs + README in `docs/adr/`. `providerAutomation.ts:344` + `README.md:57` declare the Codex-on-Windows limitation. **Final clause FALSE, measured live: 24 open floor-inspection issues, 4 epics, 20 non-epic still OPEN.** Plus FLOOR-07's 7-site "Enterprise Knowledge Graph" residual survives, including the agent-facing `resources/skills/capabilities/SKILL.md:96`. |

**Score: 0/5 fully TRUE — 2 PARTIAL, 3 FALSE.**

---

## Requirements Coverage — all 23 rows

Every ID in ROADMAP's `**Requirements**:` line was matched against the union of all 23 plans'
`requirements:` frontmatter. **Union = exactly 23. Zero orphaned, zero unclaimed.**

| Req | Row | Verified at source | Verdict |
|-----|-----|--------------------|---------|
| FLOOR-01 | `[ ]` | `store/autoMode.ts` — one shared derivation, three renderings | ⚠️ **PARTIAL** — `custom` arm returns false unconditionally (`:42`); `opencode` documented as lying both ways (`:57`) |
| FLOOR-02 | `[ ]` | `delivery.ts:518` + `:643`, both on the tick at `:684-688` | ⚠️ **PARTIAL** — code TRUE, `window-all-closed` kills PTYs on win32, never live-run |
| FLOOR-03 | `[ ]` | `electron ^43.4.1` installed; `e2e/smoke.spec.ts:188` asserts ≥43 | ❌ **BLOCKED** — D-09 unrun, 01-01 has no SUMMARY |
| FLOOR-04 | `[ ]` | `hive.ts:3283` scrub inside `flushCommit`'s retry loop | ⚠️ **PARTIAL** — matcher ceiling read directly from `hive.ts:391-417` |
| FLOOR-05 | `[ ]` | `index.ts:4644` → `preload:840` → `SettingsModal:693` | ✅ **SATISFIED** (source) · needs a click |
| FLOOR-06 | `[ ]` | `release.yml:23`/`:37`/`:220-222`; `README.md:182` | ⚠️ **PARTIAL** — structural only, no `v*` tag |
| FLOOR-07 | `[ ]` | `db.ts:100` FTS5; `memory.ts:524` fallback | ⚠️ **PARTIAL** — 7 "Enterprise Knowledge Graph" sites survive; `--wing` scope deferred to RECALL-02 |
| FLOOR-08 | `[x]` | `hive.ts:1890`/`:1972`/`:1974`/`:1993`; `pending-replies.json` | ✅ **SATISFIED** |
| FLOOR-09 | `[x]` | `index.ts:547` `recordCostSample` sink; `hive.ts:2596` `rosterContext()` | ✅ **SATISFIED** |
| FLOOR-10 | `[x]` | `index.ts:1635` → `breaker.ts:358-365` | ⚠️ **SATISFIED WITH A CEILING** — see below |
| FLOOR-11 | `[ ]` | `useHiveTasks` at 5 sites; `terminalPool.ts:322/337/701` | ✅ **SATISFIED** (source) · "no visual change" unobserved |
| FLOOR-12 | `[ ]` | 0 sub-14px `fontSize` literals repo-wide (measured); lint green | ⚠️ **PARTIAL** — Pixi 7px effective size, two layout clips, no human look |
| FLOOR-13 | `[ ]` | Four renderings agree; cost rides `useFleetTelemetry` | ❌ **BLOCKED** — collapse is dead code |
| FLOOR-14 | `[x]`(evidence) `[ ]`(row) | `hooks.ts:780`, `index.ts:4084`, provider-gated in main | ✅ **SATISFIED** (source) · Windows toast unobserved |
| FLOOR-15 | `[x]` | `test/renderer-components.test.cjs`, 6 tests, green | ✅ **SATISFIED** |
| FLOOR-16 | `[x]` | `eslint.config.js:65` `reportUnusedDisableDirectives: 'error'`; **`npx eslint . --max-warnings 0` exit 0 run here**; `ci.yml` lint step is a hard gate | ✅ **SATISFIED** |
| FLOOR-17 | `[x]` | 6 ADRs + `docs/adr/README.md`; bug template asks for `main.log` | ✅ **SATISFIED** |
| FLOOR-18 | `[ ]` | `providerAutomation.ts:344`, `README.md:57`, UI roster line | ✅ **SATISFIED** (structural) · no Codex account for a live spawn |
| GATE-01 | `[ ]` | `hooks.ts:340` `mintToken`, `:395` `authorized`, `index.ts:5710` | ⚠️ **PARTIAL** — the hook socket is closed; the OTLP collector and the path gate are not |
| RECORD-03 | `[x]` | `hive.ts:2857-2877` whole-ledger scan; `pruneCostByTask:2883` | ✅ **SATISFIED** |
| RECORD-04 | `[x]` | `hive.ts:2843-2851` clamped consecutive diff; `hooks.ts:597` | ✅ **SATISFIED** |
| VERDICT-02 | `[x]` | `hive.ts:1972-1973`, `:1993` | ⚠️ **SATISFIED WITH A CEILING** — see below |
| VERDICT-03 | `[x]` | `hive.ts:1908` `canReceiveInbox` inside `leastLoadedIdle` | ✅ **SATISFIED** |

**10 ticked rows. 13 open.** This matches REQUIREMENTS.md exactly — the ledger is honest.

---

## Ticked rows whose evidence a finding qualifies

The mandate asks specifically for this. Three answers, stated precisely.

**No Critical review finding *falsifies* a ticked row's stated evidence.** I checked each of the
16 against the 10 ticked rows and every Critical lands on an OPEN row (GATE-01, FLOOR-13,
FLOOR-01) or on test quality. That is the honest result and I am not going to manufacture a
falsification that is not there.

Three things do **qualify** ticked rows, and they belong in the record:

1. **FLOOR-10 `[x]` — "enforced" is delivered as instruction text by default.** The wiring is
   real (`index.ts:1635` → `breaker.ts:358`). But `hardStop: false` is the default
   (`breaker.ts:91`), which caps the ladder at `constrained` (`:287`), and `constrain`'s entire
   action at `index.ts:1647-1650` is **a mail asking the agent to "Stop active work now"** plus
   a toast. Only `d.action === 'stop'` kills the PTY, and that needs the opt-in. The single
   other consumer of the level is `delivery.ts:654`, which suppresses the quiesce backstop.
   FLOOR-10's literal clause — "something consumes `taskSpend().over`" — is met. The
   requirement's own word, **"enforced, not merely reported"**, is met by a polite request on
   the default configuration. The ceiling is documented in-source (D-18, `breaker.ts:350-357`),
   which is why this is a qualification and not a falsification — but it is the same
   instruction-text-not-enforcement shape that issue **#4** exists to close.

2. **VERDICT-02 `[x]` — the obligation does not survive a restart.** `owesReview` is
   process-local by design and is never rebuilt from the persisted board
   (`hive.ts:1866-1873`, `:1888`). A card that flips to done in a session that ends before any
   peer frees up is never reviewed. The trade is argued in-source (a startup rebuild would mail
   one query per historic done card — the review storm) and 01-23 adjudicated the override as
   correct. **I agree the override is right.** VERDICT-02 is nevertheless true only within a
   process lifetime, and the row does not say so.

3. **Every ticked row leans on a suite figure that is inflated.** `531 pass` counts at least two
   Windows non-runs as passes (`net-binding.test.cjs:319-325`, `win-cmd-shim.test.cjs:167`).
   One of them is GATE-01's socket-watchdog test.

**One FALSE evidence sentence in an OPEN row, named as required.**
`REQUIREMENTS.md:566` (FLOOR-13) states: *"the 1024px collapse verified in the shipped app at
its exact boundary (absent at 1024, present at 1023)."* **That sentence is false.** The shipped
app's `minWidth` is 1280 on both window kinds (`index.ts:2516`, `:2670`); it cannot be 1023
wide. Whatever produced "absent at 1024, present at 1023" was the pure function under test, not
the shipped app.

---

## Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `SettingsModal.tsx:693` | `app:openLogs` | `window.cth.openLogs()` → `preload:840` → `index.ts:4644` → `shell.openPath` | ✅ WIRED |
| `index.ts:1635` | `breaker.ts:358` | `budget: hive.budgetForAgent(id)` | ✅ WIRED |
| `hooks.ts:597` | `telemetry.recordCostSample` | `this.recordCost?.(…)`, injected at `index.ts:547` | ✅ WIRED |
| `delivery.tick():688` | `drainQueue` / `quiesce` | one tick, no second timer | ✅ WIRED |
| `pty.ts:734` | `hooks.mintToken` | `HIVE_SOCK_TOKEN` per spawn only | ✅ WIRED |
| `hive.ts:1974` | `leastLoadedIdle` | `canReceiveInbox` filter at `:1908` | ✅ WIRED |
| `App.tsx:263` | `sidebarLayout()` collapsed branch | `vpWidth` from `window.innerWidth` | ❌ **UNREACHABLE** — `minWidth: 1280` |
| `hive:tasks` `{tokens,budgetTokens,pct}` | any renderer consumer | — | ⚠️ **ORPHANED** — `grep -rn budgetTokens src/renderer/` = 0 hits (deferred) |
| `slack.ts:188` / `webhook.ts:254` `tunnelStillOpen` | any consumer | — | ⚠️ **ORPHANED** — 4 hits, all inside the two `stop()` methods |
| `hooks.ts` `payload.cwd` | `realResolve` | — | ❌ **NOT WIRED** — declared, read zero times |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite | `node --test test/*.test.cjs` | 535 tests / 531 pass / **0 fail** / 4 skipped, 19.4s | ✅ PASS (figure inflated — see gaps) |
| Lint is a real zero-warning gate | `npx eslint . --max-warnings 0` | exit 0 | ✅ PASS |
| Electron actually installed at 43 | `require('electron/package.json').version` | `43.4.1` | ✅ PASS |
| node-pty native binary present | `ls node_modules/node-pty/build/Release/*.node` | `pty.node`, `conpty.node`, `conpty_console_list.node` | ✅ PASS |
| No `continue-on-error` added | diff `ci.yml` vs `origin/main` | 2 effective sites before, 2 after, same lines | ✅ PASS |
| Three-platform CI | `gh pr checks 77` | 7/7 green (Build, Typecheck, Test ×3, Electron smoke, CodeRabbit) | ✅ PASS |
| **The phase's headline deliverable** | `gh issue list --state open --label floor-inspection` | **24 open, 4 epics, 20 non-epic** | ❌ **FAIL** |
| Sub-14px text in the renderer | `grep -rnoE "fontSize: *'?(1[0-3]\|[0-9])px" src/renderer/src` | 0 | ✅ PASS |
| D-09 live Windows run | — | **MEASUREMENT UNAVAILABLE** — requires an operator | ? SKIP → human |
| `gh attestation verify` | — | **MEASUREMENT UNAVAILABLE** — requires a published `v*` artifact | ? SKIP → human |

---

## Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/*/tests/probe-*.sh` | `find scripts -path '*/tests/probe-*.sh'` | none — this project has no probe convention; its gate is `node --test` + `eslint`, both run above | N/A |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/main/telemetry.ts` | 314-345 | Auth-free handler feeding identity off the payload | 🛑 Blocker | Any local process posts spend as any agent |
| `src/main/hooks.ts` | 126 | `resolve(p)` with one argument in a security gate | 🛑 Blocker | Relative path defeats every `within()` deny branch |
| `src/main/index.ts` | 2670 vs `sidebarLayout.ts:22` | Shipped feature behind an unreachable threshold | 🛑 Blocker | Tested, documented, dead |
| `test/net-binding.test.cjs` | 319-325 | Bare `return` on win32 in an `async (t)` callback | 🛑 Blocker | Non-run laundered as a pass, on GATE-01's own test |
| `test/win-cmd-shim.test.cjs` | 167 | Same shape | 🛑 Blocker | Second inflated pass |
| `test/hook-auth-roundtrip.test.cjs` | 163-198 | `assert.match(body, /sock_token/)` on raw source | ⚠️ Warning | A comment satisfies it on 5 of 6 shims |
| `src/main/index.ts` | 1647-1650 | Enforcement delivered as a request mail | ⚠️ Warning | FLOOR-10's cap is advisory by default |
| `src/main/hive.ts` | 391-417 | Matcher narrower than the "never" it backs | ⚠️ Warning | FLOOR-04's unconditional clause |
| `resources/skills/capabilities/SKILL.md` | 96 | "Enterprise Knowledge Graph" over a keyword scorer | ⚠️ Warning | Agent-facing false capability claim |
| `src/main/config.ts` · `hive.ts` · `renderer/store/config.ts` | 159/275/493 · 1455 · 74/142 | same | ⚠️ Warning | 6 more sites |
| `src/main/slack.ts` · `webhook.ts` | 188 · 254 | `tunnelStillOpen` returned, no consumer | ℹ️ Info | #10 defect 2's open half |
| `.planning/.../01-VALIDATION.md` | 5 | `nyquist_compliant: false`, `status: draft` | 🛑 Blocker | The phase's own validation contract declares itself unsatisfied. Per the standing mandate, a phase must not close with this flag false. **It is correctly false** — 01-23 refused to flip it, which is the right call. |

No `TBD` / `FIXME` / `XXX` debt markers were found in phase-modified source.

---

## Gaps Summary

The 22 SUMMARY files are, on the evidence, unusually honest — I spot-checked their central claims
at source and they held far more often than they failed. Plan 01-23 reached PARTIAL on its own
and STATE.md records it in plain language. **This verification does not overturn that self-
assessment. It confirms it, and adds three things the phase's own close-out did not say.**

**What is actually done.** The spend arithmetic is correct — the 1 MB tail is gone, the
quadratic double-count is gone, replaced by a clamped consecutive diff over the whole ledger.
The review obligation set really does survive a sweep. The hook socket really does mint a fresh
32-byte token per spawn and bind it to one agent server-side. The delivery queue and the
idle-quiesce backstop really do live in main on one tick. ESLint really is a hard zero-warning
gate with unused directives as errors — I ran it. There are zero sub-14px font literals in the
renderer — I measured it. This is real work and it should not be discounted.

**What is not done, in order of consequence.**

1. **Zero issues closed.** The phase goal is "close all 20 open floor-inspection issues". The
   live count is 20 non-epic issues open. The reason is correct and well-reasoned — main still
   pins Electron 32 and everything is behind draft PR #77 — but a correct reason for an unmet
   goal is still an unmet goal. **Owner: operator.** Merge #77, then close against merged source.

2. **Two security controls this phase touched do not hold.** GATE-01 hardened the hook socket
   and one file over, the OTLP collector accepts `agent.id` off an unauthenticated body. The
   PreToolUse path gate that protects `<hive>/bin` resolves relative targets against main's cwd.
   Both re-derived at source here. **Owner: gap-closure plan.**

3. **A shipped, tested, documented feature is unreachable.** `minWidth: 1280` vs a 1024
   breakpoint. And REQUIREMENTS.md:566 claims it was "verified in the shipped app at its exact
   boundary". **Owner: gap-closure plan.**

4. **The phase's own two mandatory live gates never ran.** D-09 (01-01 has no SUMMARY at all —
   the only plan of 23 without one) and `gh attestation verify`. 01-VALIDATION.md states in its
   most emphatic section that neither is optional and neither may be replaced by a CI link.
   **Owner: operator.**

5. **The suite figure is inflated.** Two Windows non-runs counted as passes, one of them on
   GATE-01's own socket-watchdog test. **Owner: gap-closure plan.** Two `t.skip()` calls.

6. **`nyquist_compliant: false` and `status: draft`** are still in 01-VALIDATION.md's
   frontmatter, correctly. The standing mandate forbids closing a phase in that state.

**The verdict this phase deserves:** `gaps_found`. Not because the work was poor — it mostly
was not — but because "Finish the Floor" is a claim about a finished floor, and the floor is
merged nowhere, has two open doors, and has never once been launched by a human on the machine
it ships to.

---

_Verified: 2026-08-21T18:15:56Z_
_Verifier: Claude (gsd-verifier) — goal-backward, FORCE stance_
_Every measurement in this report was produced by a command run in this session on `37c0bd3`._
