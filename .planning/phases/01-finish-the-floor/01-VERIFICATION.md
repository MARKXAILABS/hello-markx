---
phase: 01-finish-the-floor
verified: 2026-08-22T19:08:22Z
status: gaps_found
score: 0/5 ROADMAP success criteria fully TRUE (4 PARTIAL, 1 FALSE) · 10/23 requirement rows closed
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "0/5 ROADMAP success criteria fully TRUE (2 PARTIAL, 3 FALSE) · 10/23 requirement rows closed"
  previous_head: 37c0bd3
  this_head: 251b4aa
  note: >-
    Re-verified after the gap-closure wave (plans 01-24 … 01-31, 69 commits).
    The stale report was written at 37c0bd3, before any of them executed. Every
    claim in the eight new SUMMARYs was re-tested at source in this session; none
    was accepted on its own word.
  gaps_closed:
    - "The OTLP collector is no longer unauthenticated — `telemetry.ts` resolves `x-hive-otel-token` to an agent BEFORE the body is consumed and derives attribution from the token (01-25)."
    - "The PreToolUse path gate no longer compares path SPELLINGS — `pathIdentity()` compares `(dev, ino)` via `statSync(p, {bigint:true})`, and `vouchedBases()` frames relative targets against absolute registry-vouched bases with deny-wins over `payload.cwd` (01-24)."
    - "`redactSecrets` no longer reads `desk-`/`task-`/`risk-` as vendor keys, and now catches unlabelled `sk_`/`rk_` underscore prefixes (01-26)."
    - "`MIN_WIN.width` lowered 1280 → 960, so the 1024px sidebar collapse is REACHABLE in the shipped app; DESIGN.md corrected in both places (01-25/01-29)."
    - "The AUTO chip's `custom` arm no longer returns false unconditionally — it reads the operator's own command through one tokenized `hasBypassFlag` matcher (01-29)."
    - "The budget breaker's 80–100% band no longer masks every arm below it (01-27)."
    - "A queue that cannot be READ is no longer treated as EMPTY — `queueReadError` keeps the write path disarmed (01-27)."
    - "The composer clears only when main accepts, so a refused message is no longer silently lost (01-28)."
    - "Two win32 non-runs laundered as passes are now runner-counted `t.skip()`, and `test/suite-integrity.test.cjs` guards the whole defect class plus the skip census (01-30 / cfdbb8b)."
    - "The attested subject now covers `*.blockmap` and `latest*.yml` — the electron-updater feed was the one path with no provenance at all (01-30)."
    - "The last shipped-surface \"Enterprise Knowledge Graph\" sites are renamed; `git grep` over src/resources/docs/test/scripts/e2e/*.md returns only a historical audit page and the pin's own assertion strings (01-31)."
  gaps_remaining:
    - "SC-5 final clause — 20 non-epic floor-inspection issues still open, 0 closed. Measured live this session."
    - "SC-1 observable clause — `index.ts:5857` still kills every PTY and quits on `window-all-closed` for non-darwin."
    - "SC-2 live half — D-09 unrun, no published release artifact, so `gh attestation verify` has never run."
    - "SC-3 FLOOR-04 clause — five named ACTIVE `redactSecrets` bypasses survive against an unconditional \"does not appear in git log -p\"."
    - "SC-4 14px clause — the Pixi bubbles render at 7px effective (register row A1), and no human has looked at any swept surface."
    - "`nyquist_compliant: false` and `status: draft` still stand in 01-VALIDATION.md's own frontmatter."
    - "30 SUMMARYs for 31 plans — 01-01-SUMMARY.md still does not exist."
  regressions:
    - >-
      NEW, and it is the most serious finding in this report. At 37c0bd3 the branch
      was pushed and PR #77's three-platform CI green covered HEAD. It no longer
      does. `origin/gsd/v1.0-milestone` is at `47a48cd`; HEAD is `251b4aa`; the 69
      gap-closure commits are UNPUSHED and `gh pr view 77 --json headRefOid` returns
      `47a48cd`. Every green tick on that PR belongs to the PRE-gap tree. The gap
      wave's own 01-VALIDATION.md contract — "Before /gsd:verify-work: full suite
      green on all three Test (os) rows of the draft PR" — is therefore UNSATISFIED
      for every line of code the wave landed.
gaps:
  - truth: "SC-5 final clause — `gh issue list --state open --label floor-inspection` returns only the four epics"
    status: failed
    reason: >-
      Measured live at 2026-08-22T19:00Z, unchanged from the previous verification:
      24 open issues carry the label, of which 4 are epics (#73, #49, #48, #47). 20
      non-epic floor-inspection issues remain OPEN. Zero closed. This is the phase's
      headline deliverable and it is 0/20. The gap wave moved nothing here and could
      not: `origin/main` still pins `"electron": "^32.2.0"` (verified by
      `git show origin/main:package.json`) and the whole phase sits unmerged behind
      draft PR #77, so closing an issue today would record "fixed" against a shipped
      product that still carries the defect.
    artifacts:
      - path: "(github) MARKXAILABS/hello-markx issues"
        issue: "24 open with the label; 4 epics; 20 non-epic still OPEN — #61, #45, #42, #41, #39, #38, #36, #34, #32, #31, #26, #20, #19, #18, #16, #15, #13, #10, #5, #4"
      - path: "(github) PR #77"
        issue: "Still a DRAFT, head `47a48cd`, MERGEABLE/CLEAN, but unmerged."
    missing:
      - "Push the 69 gap-closure commits and get CI green on the REAL head (operator)"
      - "Merge PR #77 to main (operator) — the precondition for every issue closure"
      - "Then close the 20 non-epic issues, each against the merged source"
  - truth: "The gap-closure wave's own code is green on all three CI platforms"
    status: failed
    reason: >-
      NEW GAP, introduced by the wave itself and not present at the previous
      verification. `git rev-parse origin/gsd/v1.0-milestone` = `47a48cd`;
      `git rev-parse HEAD` = `251b4aa`; `git rev-list --count
      origin/gsd/v1.0-milestone..HEAD` = **69**. `gh pr view 77 --json headRefOid`
      returns `47a48cd`. So PR #77's 7/7 green — Build, Typecheck, Test
      (ubuntu/windows/macos), Electron smoke, CodeRabbit — is evidence about the
      PRE-gap tree and says nothing about `hooks.ts`, `telemetry.ts`, `delivery.ts`,
      `breaker.ts`, `autoMode.ts`, `sidebarLayout.ts` or the ~103 new tests. This is
      not a formality. `hooks.ts`'s new gate is the most platform-sensitive code in
      the phase: `statSync(p, {bigint:true})` `dev`/`ino` semantics, an `ino === 0n`
      branch for filesystems with no stable ids, `realpathSync.native`, a win32-only
      `win32Components` normaliser and a POSIX-only socket-identity branch
      (`sockFile = sock && process.platform !== 'win32' ? sock : null`). None of it
      has ever executed on Linux or macOS. All four gates ARE green on this win32
      host — re-run in this session, not read from a SUMMARY: typecheck exit 0,
      `npx eslint . --max-warnings 0` exit 0, `npm run build` exit 0, and
      `node --test test/*.test.cjs` = 638 tests / 631 pass / 0 fail / 7 skipped.
      One host is not three.
    artifacts:
      - path: "(git) origin/gsd/v1.0-milestone"
        issue: "69 commits behind HEAD; the entire gap-closure wave is unpushed"
      - path: ".planning/phases/01-finish-the-floor/01-VALIDATION.md:45"
        issue: >-
          The phase's own contract reads "Before `/gsd:verify-work`: full suite green
          on all three `Test (os)` rows of the draft PR, `Electron smoke
          (ubuntu-latest)` green, lint green." Unsatisfied for every line the wave
          landed.
      - path: "src/main/hooks.ts:148-153, :983, :1025"
        issue: "Platform-divergent identity code (bigint dev/ino, ino===0n, realpathSync.native) with zero non-win32 execution"
    missing:
      - "Resolve the GitHub Push Protection block and push the 69 commits (operator)"
      - "Re-read `gh pr checks 77` against the real head and confirm all three `Test (os)` rows green"
  - truth: "SC-3 — Spend, secrets and agent identity are CONTAINED, not merely observed"
    status: partial
    reason: >-
      MOVED, materially. Two of the three counts the previous verification named
      FALSE are genuinely closed at source and the third is bounded and restated
      rather than papered over. What is left is not a wiring hole; it is two
      ceilings the criterion's own wording does not admit.
    artifacts:
      - path: "src/main/hive.ts:391-465 (redactSecrets)"
        issue: >-
          FLOOR-04's clause is unconditional — "a secret written into an agent's file
          does not appear in `git log -p`". Pattern 5 is byte-frozen and still
          requires the key to be immediately followed by `\s*[:=]\s*`, so JSON
          `"token": "…"` (closing quote between key and colon) passes untouched. Five
          ACTIVE bypasses are named in the requirement row. The scrub PLACEMENT is
          correct (`hive.ts:3283`, inside `flushCommit`'s retry loop); the MATCHER is
          the ceiling, now honestly declared.
      - path: "src/main/breaker.ts:91, :287 + src/main/index.ts:1647-1650"
        issue: >-
          `hardStop: false` is still the default, which caps the ladder at
          `constrained`, whose entire action is a mail asking the agent to "Stop
          active work now" plus a toast. 01-27 fixed the 80–100% band masking the
          arms below it — real work — but "actually stopped or escalated" is still a
          polite request on the default configuration.
      - path: "src/main/hooks.ts:29 + src/main/telemetry.ts:40"
        issue: >-
          GATE-01 clause 2 — "the token that authenticates the socket is not readable
          from any agent's shell" — remains false on Linux: both credentials live in
          the agent's own process environment and a same-uid sibling reads
          `/proc/<pid>/environ`. DECLINED for the third time (01-24, 01-25 adjudicated
          down by 01-31, and the security audit). Owner: GATE-02, Phase 4. Note the
          ROADMAP SC's own literal sentence — "`echo $HIVE_SOCK_TOKEN` inside agent
          A's terminal yields nothing that authenticates as agent B" — IS satisfied by
          the per-agent mint; it is GATE-01's second clause, not the SC's, that fails.
    missing:
      - "Either widen redactSecrets for JSON value position, or accept the five bypasses as a permanent, register-owned ceiling"
      - "Decide whether FLOOR-10's default should be `hardStop: true`, or restate the criterion to match what ships"
      - "GATE-02 (Phase 4) for the child-env clause"
  - truth: "SC-4 — The floor is legible to the operator watching it"
    status: partial
    reason: >-
      MOVED from FALSE. Both source falsifiers the previous verification named are
      closed and re-derived here. What remains is the half no automated check can
      reach — and one piece of arithmetic that is FALSE, not merely unobserved.
    artifacts:
      - path: "src/renderer/src/scene/office/ThoughtBubble.ts:22-23, :76 (+ ToolBubble.ts:78)"
        issue: >-
          `FONT_SIZE = 14` rendered inside `this.inner.scale.set(RENDER_SCALE)` with
          `RENDER_SCALE = 0.5` — 7px effective against DESIGN.md's 14px floor. This is
          arithmetic, not an observation, and `test/repo-claims.test.cjs` passes
          because it reads the LITERAL. Filed as register row A1; not fixed.
      - path: "(unrun) operator observation"
        issue: >-
          No human has looked at the ~600 swept FLOOR-12 surfaces, at the app at a
          960px window (register row C7 — `IdePanel`'s 424px tree leaves Monaco 532px;
          `AddAgentModal` `width={940}` crosses its `95vw` clamp for the first time),
          at the AUTO chip live, at a Windows blocked-agent toast, or at the Tasks
          board after the poller migration.
      - path: "src/renderer/src/store/autoMode.ts:105"
        issue: "`opencode`'s chip can still lie in BOTH directions — its bypass is written into OPENCODE_CONFIG_CONTENT at spawn and never reaches the command string the chip reads. Register row A27."
    missing:
      - "Fix or formally accept the Pixi 7px arithmetic (follow-up plan holding ThoughtBubble.ts/ToolBubble.ts)"
      - "Operator runs the FLOOR-12/FLOOR-01/FLOOR-13 visual passes"
  - truth: "SC-2 — What ships is on a supported runtime and its provenance is checkable (the LIVE half)"
    status: partial
    reason: >-
      The structural half improved again — 01-30 pulled `*.blockmap` and
      `latest*.yml` inside `SHA256SUMS.txt`, which is the attestation's whole
      subject, so the electron-updater feed is no longer the one shipped path with no
      provenance. Both live gates are still unrun, and the three-platform clause is
      now WEAKER than at the previous verification (see the unpushed-commits gap).
    artifacts:
      - path: ".planning/phases/01-finish-the-floor/01-01-PLAN.md"
        issue: >-
          Still the only plan of 31 with NO SUMMARY — 30 SUMMARYs for 31 plans. Its
          D-09 gate (launch `dist\win-unpacked\Hello MarkX.exe`, confirm a real PTY
          echo, a persisted setting surviving relaunch, a clean visual pass) has never
          been run. 01-VALIDATION.md states outright that no number of unit runs can
          reconstruct an Electron-version regression, because `test/load-ts.cjs` stubs
          `electron` for all 638 tests.
      - path: ".github/workflows/release.yml:236-239"
        issue: >-
          `actions/attest-build-provenance@v4` on `subject-checksums:
          release/SHA256SUMS.txt` is correctly ordered and scoped, but `gh attestation
          verify` has never run. `gh release list` returns EMPTY — there are no
          published releases at all. Tags v0.1.1…v0.4.4-rc.1 exist but predate the
          attestation: `git show v0.4.4-rc.1:.github/workflows/release.yml | grep -c
          attest-build-provenance` → 0. Provenance is verified STRUCTURALLY ONLY.
    missing:
      - "Operator runs D-09 on this Windows host and writes 01-01-SUMMARY.md"
      - "Cut a `v*` tag from the merged tree and run `gh attestation verify <artifact> --repo MARKXAILABS/hello-markx`"
  - truth: "SC-1 — Autonomy survives the window (the OBSERVABLE half)"
    status: partial
    reason: >-
      NOT MOVED by the gap wave. The wave hardened FLOOR-02's durability — 01-27's
      `queueReadError` stops one `EBUSY` writing `[]` over a good queue file, and
      01-28 stopped the composer clearing a message main refused — but the
      criterion's first sentence is still not observable on the operator's platform.
    artifacts:
      - path: "src/main/index.ts:5857-5862"
        issue: >-
          `app.on('window-all-closed')` still calls `ptyManager.killAll()` then
          `app.quit()` on every non-darwin platform, byte-identical to the previous
          verification. On Windows and Linux, closing the last window KILLS EVERY PTY
          AND QUITS THE APP, so "with the app window closed, a message ... is typed
          into that agent's terminal" cannot be observed. Running with no window is
          DAEMON-01 (Phase 2), not FLOOR-02. Register row C8 says exactly this and
          assigns it to the ROADMAP's owner.
      - path: "(unrun) operator observation"
        issue: "Nobody has run `npm run dev`, closed the window rather than quitting, and watched an idle agent still get woken."
    missing:
      - "Restate SC-1 to the reload/renderer-crash boundary FLOOR-02 actually covers, with a pointer to DAEMON-01 — or hold it open until Phase 2 (ROADMAP owner, register row C8)"
  - truth: "The phase's own validation contract is satisfied"
    status: failed
    reason: >-
      `01-VALIDATION.md` still carries `nyquist_compliant: false` and `status: draft`
      in its own frontmatter. The standing production-stress mandate states plainly
      that a phase must not close with this flag false. It is CORRECTLY false — the
      document's own Nyquist section says no unit run can reconstruct an
      Electron-version regression, and D-09 is unrun — so this is an honest flag, not
      an oversight. It is nevertheless an open gate. The document's headline mandate
      (a `<=` skip ceiling read from the TAP) is now genuinely enforced by
      `test/suite-integrity.test.cjs` clause 3, which is real and platform-parameterised
      (`FROZEN = { win32: 6, other: 1 }`) — that half of the finding is closed.
    artifacts:
      - path: ".planning/phases/01-finish-the-floor/01-VALIDATION.md:4-5"
        issue: "`status: draft`, `nyquist_compliant: false`"
      - path: ".planning/phases/01-finish-the-floor/01-SECURITY.md:8-10"
        issue: >-
          `threats_open: 1`, `threats_unverified: 184`, `status: gaps_found`, `head:
          1a2bf7e`. The one OPEN threat (T-P24-10) WAS closed at `251b4aa` — verified
          here: ceiling item (i) exists at `hooks.ts:829` and the register row exists
          at `REQUIREMENTS.md:629` — but 184 of 289 threat IDs are explicitly recorded
          as NOT individually re-verified, and the audit's own frontmatter is one
          commit stale relative to its own closure.
    missing:
      - "Flip `nyquist_compliant` only after D-09 runs — not before"
      - "Refresh 01-SECURITY.md's frontmatter to `threats_open: 0` at the real head, or state why it stays at 1a2bf7e"
deferred:
  - truth: "Memory recall scope is enforced by the server rather than by an agent-supplied `--wing` flag"
    addressed_in: "Phase 5"
    evidence: "RECALL-02: 'Scope is enforced by the server, not by a flag the agent could omit' — FLOOR-07's own warning names RECALL-02 as the real version of this clause."
  - truth: "A review looks at the diff and the repo's own check outcome"
    addressed_in: "Phase 5"
    evidence: "VERDICT-01. FLOOR-08's own warning states the reviewer does not read a diff and names VERDICT-01 as the owner."
  - truth: "The floor runs with no window open at all"
    addressed_in: "Phase 2"
    evidence: "Phase 2 goal: 'The floor runs with no window and is reachable from a phone' — DAEMON-01. Register row C8."
  - truth: "The hook/telemetry tokens are unreadable from the agent's own process environment (GATE-01 clause 2)"
    addressed_in: "Phase 4"
    evidence: "GATE-02 is the child-env requirement. Declined three times in Phase 1 (01-24, 01-31's adjudication of 01-25, and 01-SECURITY.md) with the ceiling written in source at hooks.ts:29 and telemetry.ts:40."
  - truth: "The `{tokens, budgetTokens, pct}` fields widened onto `hive:tasks` reach a renderer consumer"
    addressed_in: "Phase 2+"
    evidence: "REQUIREMENTS.md FLOOR-13 row adjudicates these as a per-card budget METER, not a FLOOR-13 clause, owned by a later plan holding TasksKanban.tsx. `grep -rn budgetTokens src/renderer/` returns nothing — re-confirmed."
human_verification:
  - test: "D-09 — launch `dist\\win-unpacked\\Hello MarkX.exe` on this Windows host; open a terminal pane; type a command; change a setting; relaunch."
    expected: "A real PTY spawns and echoes; a real better-sqlite3 write lands and the setting survives the relaunch; a clean visual pass."
    why_human: "All 638 unit tests run with `electron` stubbed by test/load-ts.cjs and are structurally incapable of failing on an Electron-version or native-ABI regression. The only real-Electron job is Linux/xvfb. This is FLOOR-03's declared closure evidence and 01-VALIDATION.md forbids substituting a CI link for it. Register row C2."
  - test: "Cut a `v*` tag from the MERGED tree, then run `gh attestation verify <artifact> --repo MARKXAILABS/hello-markx`."
    expected: "The downloaded artifact verifies against this repo and this commit; the `latest*.yml` update feed is inside the attested checksum set."
    why_human: "`gh release list` is empty — there are no published artifacts, and the publish job is gated on `refs/tags/v*`. FLOOR-06's live sample. Register row C3."
  - test: "`npm run dev`, CLOSE the window (do not quit), then send a message from a producer and watch an idle agent get woken."
    expected: "The message reaches the inbox and is typed into the agent's terminal."
    why_human: "Needs a real hive and a live agent CLI session. NOTE: on win32 this is currently blocked by index.ts:5857 — see the SC-1 gap and register row C8."
  - test: "Spawn a real `claude` agent and watch the main log for one minute."
    expected: "The throttled line `[hive] OTLP batch REJECTED (missing or unknown x-hive-otel-token)` does NOT appear."
    why_human: "The round-trip test proves the collector accepts the header the app exports; it cannot prove the Claude Code SDK actually forwards `OTEL_EXPORTER_OTLP_METRICS_HEADERS`/`_LOGS_HEADERS`. If it does not, 01-25 took telemetry dark floor-wide — cost ledger, resume key, every breaker cost arm and account failover. Register row C5. This is NEW with the gap wave and is the single highest-consequence unrun check in it."
  - test: "Run the app at a 960px window and look at it."
    expected: "The sidebar collapses to the right-edge overlay, nothing clips, and the app is usable."
    why_human: "01-25 lowered MIN_WIN.width to 960 to make the collapse reachable. Arithmetic and source pins only — `renderToStaticMarkup` performs no layout and `npm run e2e` boots at 1440x900. Register row C7 names three measured consequences (IdePanel leaves Monaco 532px; Camera.getMinZoom falls 25%; AddAgentModal crosses its 95vw clamp)."
  - test: "Open Settings, General, `open logs` and click it."
    expected: "The OS file manager opens the log folder."
    why_human: "The chain is verified at source end to end (index.ts:4644 → preload:840 → SettingsModal:693); the untested link is the click and the OS handoff."
  - test: "Block a real non-Claude agent on Windows; confirm exactly ONE toast; click it."
    expected: "One toast fires and clicking it focuses that agent."
    why_human: "No test can reach 'Windows actually DREW it' — Focus Assist and per-app settings can suppress it. macOS delivery is structurally unverifiable: UNNotification needs a code-signed app and paid signing is out of scope."
  - test: "Launch the dev app, toggle auto mode WITHOUT restarting, tab to the AUTO chip, and try a custom agent whose command carries `--dangerously-skip-permissions`."
    expected: "The chip reflects what the running agent is actually doing, is reachable and announced, and the custom agent shows the chip."
    why_human: "01-12's seven-step operator checkpoint was never run, and 01-29's custom arm has never been seen in the app."
  - test: "Look at the ~600 swept FLOOR-12 surfaces and the Pixi bubbles."
    expected: "No user-facing text reads smaller than 14px on screen; no layout clips."
    why_human: "No human has looked at any swept surface. The Pixi arithmetic is already known FALSE (7px effective, register row A1) — this check is for the other ~600."
  - test: "Drop a fake API key into a live agent's workspace and let the hive commit."
    expected: "The key does not appear in `git log -p` of the hive."
    why_human: "FLOOR-04's optional live clause, unrun. Choose the fake key's SHAPE deliberately — five ACTIVE bypasses are documented, including JSON `\"token\": \"…\"` value position."
  - test: "Open the Tasks board, the detail overlay and the kanban with a live ledger after the useHiveTasks poller migration."
    expected: "No visual change from before the migration."
    why_human: "FLOOR-11's 'no visual change' clause has never been observed by a human."
---

# Phase 1: Finish the Floor — Verification Report (re-verification)

**Phase Goal:** Every claim the project makes about itself is true — all 20 open
floor-inspection issues are closed, and each closure was checked against source and a live
test run, not against an agent's report.

**Verified:** 2026-08-22T19:08:22Z
**Status:** `gaps_found`
**Re-verification:** Yes — after the gap-closure wave (plans 01-24 … 01-31, 69 commits).
**Tree verified:** `gsd/v1.0-milestone` @ `251b4aa`, working tree clean.
**Previous report:** written at `37c0bd3`, `gaps_found`, 0/5 (2 PARTIAL, 3 FALSE).

---

## The one-line answer

**The gap wave did real work and moved two criteria off FALSE. The phase is still not
finished, and it acquired one new gap on the way.**

Every one of the eight new SUMMARYs was tested at source in this session rather than
believed, and they held — the identity gate, the OTLP credential, the queue-read disarm,
the AUTO chip's custom arm, the reachable collapse, the runner-counted skips, the widened
attestation subject. Score moves from *2 PARTIAL / 3 FALSE* to *4 PARTIAL / 1 FALSE*.
Still **0 of 5 fully TRUE**, because the headline clause — twenty closed issues on a
shipped product — is 0/20 and cannot move until PR #77 merges.

The new gap is not in the code. **69 commits are unpushed.** `origin/gsd/v1.0-milestone`
is at `47a48cd`; PR #77's head is `47a48cd`; HEAD is `251b4aa`. Every green tick on that
PR describes the tree as it stood *before* the gap wave. The phase's own validation
contract requires three-platform green on the draft PR before verification runs, and for
this wave's code that evidence does not exist on any platform but this one.

I would not bet a pager on this phase being complete. I would bet one on the code being
better than it was at `37c0bd3`, and I would not bet one on it building on Linux.

---

## Gates re-run live in this session at `251b4aa`

Not read from a SUMMARY. Each command was executed here.

| Gate | Command | Result |
|------|---------|--------|
| Full unit suite | `node --test test/*.test.cjs` | **638 tests / 631 pass / 0 fail / 7 skipped**, 18.1s — exactly the claimed figure |
| Lint | `npx eslint . --max-warnings 0` | exit **0** |
| Typecheck | `npm run typecheck` (both projects) | exit **0** |
| Build | `npm run build` | exit **0**, built in 51.9s |
| Headline deliverable | `gh issue list --state open --label floor-inspection` | **24 open, 4 epics, 20 non-epic** — ❌ unchanged |
| Merge base | `git show origin/main:package.json \| grep electron` | `"electron": "^32.2.0"` — ❌ unchanged |
| **Branch sync** | `git rev-list --count origin/gsd/v1.0-milestone..HEAD` | **69** — ❌ **NEW GAP** |
| **PR head** | `gh pr view 77 --json headRefOid` | `47a48cd` — the PRE-gap tree |
| PR checks | `gh pr checks 77` | 7/7 green — **against `47a48cd`, not against HEAD** |
| Published releases | `gh release list` | **empty** — no attested artifact exists |
| Sub-14px literals in renderer | `grep -rnoE "fontSize: *'?(1[0-3]\|[0-9])px" src/renderer/src` | **0** |
| Debt markers in phase-modified source | `grep -nE "\b(TBD\|FIXME\|XXX)\b"` over 137 changed files | **0** |

---

## Goal Achievement — ROADMAP Success Criteria

Each criterion re-verified individually against source. The **Moved?** column answers the
question the re-verification exists to answer.

| # | Criterion | Verdict | Moved? | Named evidence |
|---|-----------|---------|--------|----------------|
| 1 | **Autonomy survives the window** — FLOOR-02 | ⚠️ **PARTIAL** | **No** | Code-move and doc clauses were already TRUE and are re-derived. Hardened by the wave: `loadQueue` (`delivery.ts:392-427`) now distinguishes ABSENT from UNREADABLE and holds `queueReadError` so one `EBUSY` cannot write `[]` over a good queue; `enqueue` refuses with that string (`:489`); the composer clears only after main accepts (`MessageQueueComposer.tsx:152-153`). **Observable clause still FALSE:** `index.ts:5857-5862` `window-all-closed` → `ptyManager.killAll(); app.quit()` on non-darwin — byte-identical to the previous verification. Never live-run. |
| 2 | **Supported runtime + checkable provenance** — FLOOR-03, FLOOR-06 | ⚠️ **PARTIAL** | **Partly, and one clause WEAKENED** | Improved: `release.yml:166` now hashes `*.blockmap` and `latest*.yml` alongside the installers, and `:218`/`:239` make that merged file the attestation subject — the electron-updater feed was previously the one shipped path with no provenance at all. `npm test` pinned byte-exact at `package.json:26`. **Weakened:** the "green on all three CI platforms" clause no longer has evidence for HEAD — see the branch-sync row above. **Live: still neither.** D-09 unrun (30 SUMMARYs for 31 plans); `gh release list` empty and `git show v0.4.4-rc.1:.github/workflows/release.yml \| grep -c attest` → 0, so no tag has ever carried the attestation. |
| 3 | **Spend, secrets and identity CONTAINED** — FLOOR-04, 09, 10, RECORD-03/04, GATE-01 | ⚠️ **PARTIAL** | **YES — from FALSE** | **OTLP closed:** `telemetry.ts:391` resolves `x-hive-otel-token` to an agent BEFORE the body is consumed, fails closed on absent/unknown/empty (`:428-432`), and attribution derives from the token; minted per-agent at `:265` and revoked at `:274`, spread at the single `pty.ts:743`/`:796-797` choke point on the PER-SIGNAL vars, and it is a different secret from the hook token. **Path gate closed:** the three prohibitions are 0/0/0 (`canonicalSpelling`, `server.maxConnections`, `conn.destroy(`); `pathIdentity` (`:148-153`) compares `(dev, ino)` with `{bigint:true}` and returns null on `ino === 0n`; `candidateDenial` (`:1031-1045`) consults a RECURSIVE `bin` scan on `nlink > 1n`, which is what catches a hard link into `<hive>/bin/runtime` — arbitrary code execution in every agent PTY; `vouchedBases` (`:944-951`) denies before `payload.cwd` is consulted at all. **Redaction bounded:** patterns 6/7 add `sk_`/`rk_`; `\bsk-` stops `desk-`/`task-`/`risk-`; pattern 5 byte-frozen with the JSON arm a declared loss. **Still not TRUE:** five ACTIVE FLOOR-04 bypasses against an unconditional "does not appear"; `hardStop: false` still caps FLOOR-10 at a request mail; GATE-01 clause 2 declined for the third time. |
| 4 | **Legible to the operator** — FLOOR-01, 05, 11, 12, 13, 14 | ⚠️ **PARTIAL** | **YES — from FALSE** | **Collapse now REACHABLE:** `MIN_WIN = { width: 960, height: 800 }` (`index.ts:2560`) is the only `minWidth` in the file (`:2714`) against `SIDEBAR_COLLAPSE_WIDTH = 1024`; `DESIGN.md:169` and `:677` both say 960×800 and `grep -c 1280 DESIGN.md` → 0. `splitterReachableMax` (`sidebarLayout.ts:52`) stops a resize across the newly-reachable band persisting a shrunken width. **AUTO chip fixed:** `autoMode.ts:96` scans every preset's `autoFlag` against the operator's own command through one tokenized `hasBypassFlag` (`:39-53`) that contributes both sides of a token's first `=` and guards the empty flag — the deliberate over-report is documented in-source. `MODEL_CHIP_MAX_W` bounds the model chip (`AgentCard.tsx:80`, `:352`). 0 sub-14px `fontSize` literals, re-measured. **Still not TRUE:** the Pixi bubbles are 7px effective (`ThoughtBubble.ts:22-23` `FONT_SIZE = 14` inside `scale.set(0.5)`), and **no human has looked at anything** — not the 960px window, not the ~600 swept surfaces, not the chip. |
| 5 | **Protocol closes its loops and the issue list is honest** — FLOOR-07, 08, 15, 16, 17, 18, VERDICT-02/03 | ❌ **FALSE** | **Partly — but not on the clause that decides it** | The FLOOR-07 naming residual IS closed: `git grep "Enterprise Knowledge Graph" -- src resources docs test scripts e2e '*.md' ':!.planning'` returns only `docs/floor-inspection.html:710` (a historical audit page quoting what README *used to* say) and three of `test/repo-claims.test.cjs`'s own assertion strings. The agent-facing `resources/skills/capabilities/SKILL.md` site is gone. Protocol clauses re-derived and unchanged-TRUE. `eslint . --max-warnings 0` exit 0 here. **Final clause FALSE, measured live: 24 open floor-inspection issues, 4 epics, 20 non-epic still OPEN — 0 closed, identical to the previous verification.** |

**Score: 0/5 fully TRUE — 4 PARTIAL, 1 FALSE.** (Previously: 0/5 — 2 PARTIAL, 3 FALSE.)

**Which criteria the gap wave moved:** SC-3 and SC-4, both from FALSE to PARTIAL, both on
real source changes verified here rather than on a SUMMARY's word. SC-2 moved forward
structurally and *backward* on the CI clause. SC-1 and SC-5 did not move, and neither can
be moved by code — SC-1 needs a restatement (or Phase 2), SC-5 needs a merge.

---

## Requirements Coverage — all 23 rows

`REQUIREMENTS.md`'s status table and its checkbox list agree, and both agree with the
ROADMAP `**Requirements**:` line. Union = exactly 23. Zero orphaned, zero unclaimed.

| Req | Box | Verified at source this session | Verdict | Moved? |
|-----|-----|----------------------------------|---------|--------|
| FLOOR-01 | `[ ]` | `autoMode.ts:39-53` `hasBypassFlag`; `:96` custom arm | ⚠️ **PARTIAL** — custom arm fixed; `opencode` still lies both ways (A27); checkpoint unrun | **improved** |
| FLOOR-02 | `[ ]` | `delivery.ts:392-427` `loadQueue`; `:489` refusal; `MessageQueueComposer.tsx:152` | ⚠️ **PARTIAL** — durability hardened; `window-all-closed` unchanged; never live-run | **improved** |
| FLOOR-03 | `[ ]` | `electron ^43.4.1`; `e2e/smoke.spec.ts` asserts ≥43 | ❌ **BLOCKED** — D-09 unrun, no 01-01-SUMMARY | no |
| FLOOR-04 | `[ ]` | `hive.ts:391-465` incl. new patterns 6/7 and the `\bsk-` boundary | ⚠️ **PARTIAL** — restated as bounded, five ACTIVE bypasses named | **improved** |
| FLOOR-05 | `[ ]` | `index.ts:4644` → `preload:840` → `SettingsModal:693` | ✅ **SATISFIED** (source) · needs a click | no |
| FLOOR-06 | `[ ]` | `release.yml:166`, `:218`, `:236-239` | ⚠️ **PARTIAL** — subject now correct; no published artifact | **improved** |
| FLOOR-07 | `[ ]` | `db.ts:100` FTS5; naming pin over 315 shipped files | ⚠️ **PARTIAL** — naming residual CLOSED; `--wing` scope deferred to RECALL-02 | **improved** |
| FLOOR-08 | `[x]` | `hive.ts` `owesReview` obligation set; `pending-replies.json` | ✅ **SATISFIED** | no |
| FLOOR-09 | `[x]` | `index.ts:547` `recordCostSample` sink | ✅ **SATISFIED** | no |
| FLOOR-10 | `[x]` | `index.ts:1635` → `breaker.ts`; `:379-384` band fix | ⚠️ **SATISFIED WITH A CEILING** — masking fixed; `hardStop:false` default still advisory | **improved** |
| FLOOR-11 | `[ ]` | `useHiveTasks` at 5 sites; pool disposal on every drop path | ✅ **SATISFIED** (source) · "no visual change" unobserved | no |
| FLOOR-12 | `[ ]` | 0 sub-14px `fontSize` literals (re-measured); lint green | ⚠️ **PARTIAL** — Pixi 7px effective (A1), two clips, no human look | no |
| FLOOR-13 | `[ ]` | `index.ts:2560` `MIN_WIN.width = 960`; `sidebarLayout.ts:22`/`:52`; `DESIGN.md:169`/`:677` | ⚠️ **PARTIAL** — collapse now REACHABLE; 960px look unobserved (C7) | **YES — was BLOCKED** |
| FLOOR-14 | `[ ]` | `hooks.ts` `notifyBlocked`, provider-gated in main | ✅ **SATISFIED** (source) · Windows toast unobserved | no |
| FLOOR-15 | `[x]` | `test/renderer-components.test.cjs` green | ✅ **SATISFIED** | no |
| FLOOR-16 | `[x]` | `npx eslint . --max-warnings 0` exit 0, run here | ✅ **SATISFIED** | no |
| FLOOR-17 | `[x]` | 6 ADRs + `docs/adr/README.md`; bug template | ✅ **SATISFIED** | no |
| FLOOR-18 | `[ ]` | `providerAutomation.ts`, `README.md`, UI roster line | ✅ **SATISFIED** (structural) · no Codex account for a live spawn | no |
| GATE-01 | `[ ]` | `hooks.ts` per-agent mint + `(dev,ino)` gate; `telemetry.ts:265`/`:391` | ⚠️ **PARTIAL** — both identity CHANNELS now closed; clause 2 declined 3× | **improved** |
| RECORD-03 | `[x]` | whole-ledger scan; `pruneCostByTask` | ✅ **SATISFIED** | no |
| RECORD-04 | `[x]` | clamped consecutive diff keyed `(agent_id, session_id)` | ✅ **SATISFIED** | no |
| VERDICT-02 | `[x]` | `owesReview` minted, guarded, cleared only on a mailed query | ⚠️ **SATISFIED WITH A CEILING** — process-local, does not survive restart | no |
| VERDICT-03 | `[x]` | `canReceiveInbox` enforced inside `leastLoadedIdle` | ✅ **SATISFIED** | no |

**The 10/13 split is still correct.** 10 ticked (FLOOR-08, 09, 10, 15, 16, 17, RECORD-03,
RECORD-04, VERDICT-02, VERDICT-03), 13 open. Verified twice — from the checkbox list and
from the status table, which agree. Plan 01-31 re-adjudicated every row at source and moved
no box, including declining 01-25's claim on GATE-01. **That refusal is correct and I
confirm it:** GATE-01's clause 2 is still false on Linux, and one unmet clause is not a
closed requirement. Eight rows have materially better evidence than at `37c0bd3` and one
(FLOOR-13) had a FALSE evidence sentence corrected — but none crossed the line.

---

## Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `pty.ts:743` | `telemetry.mintAgentToken` | `this.mintOtelToken?.(hookAgentId)`, gated on an OTLP endpoint existing | ✅ **WIRED** (new) |
| `pty.ts:796-797` | agent env | `OTEL_EXPORTER_OTLP_{METRICS,LOGS}_HEADERS`, set LAST, per-signal only | ✅ **WIRED** (new) |
| `telemetry.handleRequest:391` | `agentForToken` → `ingestMetrics/ingestLogs` | resolved BEFORE body consumption; only 2 callers, both pass the auth id | ✅ **WIRED** (new) |
| `hooks.candidateDenial:1031` | `binEntryIdentities` | `nlink > 1n` → recursive `<hive>/bin` identity scan | ✅ **WIRED** (new) |
| `hooks.vouchedBases:948` | `payload.cwd` | appended only to a NON-empty registry-vouched set | ✅ **WIRED** (was NOT WIRED) |
| `delivery.loadQueue:413` | `enqueue:489` | `queueReadError` rendered to the operator verbatim | ✅ **WIRED** (new) |
| `MessageQueueComposer:152` | `enqueueMessage` | `if (!res.ok) return;` — the draft survives a refusal | ✅ **WIRED** (new) |
| `delivery.quiesce:728` | `useHive.stopArmDecision:174` | `synthesized: true` → a blocked agent is not idled | ✅ **WIRED** (new) |
| `App.tsx` | `sidebarLayout()` collapsed branch | `vpWidth` from `window.innerWidth`, floor now 960 | ✅ **WIRED** (was UNREACHABLE) |
| `SidebarSplitter.tsx:28` | `splitterReachableMax` | resize clamps to reachability, not to the drag preference | ✅ **WIRED** (new) |
| `release.yml:166` | `:218` → `:239` | every uploaded glob hashed → merged → attested | ✅ **WIRED** (was PARTIAL) |
| `hive:tasks` `{tokens,budgetTokens,pct}` | any renderer consumer | — | ⚠️ **ORPHANED** — `grep -rn budgetTokens src/renderer/` = 0 hits (deferred, Phase 2+) |
| **HEAD** | **PR #77 CI** | **`git push`** | ❌ **NOT WIRED — 69 commits unpushed** |

---

## Behavioral Spot-Checks

All run in this session. See the gates table above for the full set; the load-bearing ones:

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite at HEAD | `node --test test/*.test.cjs` | 638 / 631 pass / 0 fail / 7 skipped | ✅ PASS — matches the claim exactly |
| Skip counters are honest | `test/suite-integrity.test.cjs` clauses 1–4 | green; census `FROZEN = {win32: 6, other: 1}` is platform-parameterised, and clause 2 proves the scanner red against three real pre-fix blobs | ✅ PASS |
| Lint gate | `npx eslint . --max-warnings 0` | exit 0 | ✅ PASS |
| Typecheck | `npm run typecheck` | exit 0 | ✅ PASS |
| Build | `npm run build` | exit 0 | ✅ PASS |
| Hook prohibitions | `grep -c` × 3 in `hooks.ts` | `canonicalSpelling` 0 · `server.maxConnections` 0 · `conn.destroy(` 0 | ✅ PASS |
| T-P24-10 recorded | `grep -n T-P24-10 src/main/hooks.ts .planning/REQUIREMENTS.md` | `hooks.ts:829` ceiling item (i) + `REQUIREMENTS.md:629` register row | ✅ PASS |
| **Headline deliverable** | `gh issue list --state open --label floor-inspection` | **24 open, 4 epics, 20 non-epic** | ❌ **FAIL** |
| **Gap-wave code on CI** | `gh pr view 77 --json headRefOid` vs `git rev-parse HEAD` | `47a48cd` ≠ `251b4aa`, 69 commits apart | ❌ **FAIL** |
| Attestation live sample | `gh release list` | empty | ? SKIP → human |
| D-09 live Windows run | — | **MEASUREMENT UNAVAILABLE** — requires an operator | ? SKIP → human |

---

## Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/*/tests/probe-*.sh` | `find scripts -path '*/tests/probe-*.sh'` | none — this project has no probe convention; its gates are `node --test`, `eslint`, `tsc` and `npm run build`, all four run above | N/A |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| *(git)* `origin/gsd/v1.0-milestone` | — | 69 commits of security-critical, platform-divergent code unpushed and un-CI'd | 🛑 **Blocker** | The phase's own validation contract is unsatisfied for everything the gap wave landed |
| `src/main/index.ts` | 5857-5862 | `window-all-closed` → `killAll(); quit()` on non-darwin | 🛑 Blocker | SC-1's first sentence is unobservable on the operator's own platform |
| `src/main/hive.ts` | 391-465 | Matcher narrower than the unconditional "never" it backs | ⚠️ Warning | Five ACTIVE FLOOR-04 bypasses — now *declared*, which is the improvement |
| `src/main/breaker.ts` | 91 · `index.ts:1647` | `hardStop: false` default; `constrain` action is a request mail | ⚠️ Warning | FLOOR-10's cap is advisory unless the operator opts in |
| `src/renderer/src/scene/office/ThoughtBubble.ts` | 22-23, 76 | `FONT_SIZE = 14` inside `scale.set(0.5)` | ⚠️ Warning | 7px effective against DESIGN.md's 14px floor — arithmetic, not opinion (A1) |
| `src/renderer/src/store/autoMode.ts` | 105 | `opencode` arm reads the live toggle, not the spawn-time value | ⚠️ Warning | The chip can lie in both directions for that one provider (A27) |
| `.planning/.../01-VALIDATION.md` | 4-5 | `nyquist_compliant: false`, `status: draft` | 🛑 Blocker | The phase's own validation contract declares itself unsatisfied. **It is correctly false** — D-09 is unrun. Three plans have now declined to flip it, which is the right call. |
| `.planning/.../01-SECURITY.md` | 8-10 | `threats_unverified: 184` of 289 | ⚠️ Warning | Two thirds of the threat surface is honestly recorded as not individually re-verified — an honest gap, not a false claim |

**No `TBD` / `FIXME` / `XXX` debt markers** in any of the 137 phase-modified files under
`src/`, `test/`, `.github/`, `scripts/`, `e2e/`. Re-swept this session.

---

## Gaps Summary

**What the gap wave actually delivered.** Eight plans, and I tested each one's central
claim at source rather than reading it. They held.

The hook socket's path gate no longer plays whack-a-mole with path spellings — it asks the
filesystem for `(dev, ino)` and compares identities, which is why a hard link into
`<hive>/bin/runtime/` (on every agent PTY's PATH, so: arbitrary code execution on the whole
floor) now denies where no canonicaliser could ever have reached it. The OTLP collector,
which any agent's Bash tool could `curl` to post fabricated spend as any agent, now demands
a per-agent capability resolved before the body is even read, minted at the same `pty.ts`
choke point the hook token uses and revoked with the PTY. The redaction matcher stopped
reading `desk-backend-engineer` as an OpenAI key and started catching `sk_live_…`. A queue
that cannot be read is no longer written over with `[]`. A message main refused no longer
vanishes from the composer. Two Windows non-runs that reported `ok` having executed zero
assertions are now runner-counted skips, and a new `suite-integrity` test guards the entire
defect class — including the skip census that 01-VALIDATION.md mandated and nothing
enforced. The window floor came down so a shipped, tested, documented responsive collapse
is reachable by a real operator instead of being dead code behind `minWidth: 1280`. The
electron-updater feed came inside the attestation.

That is a real wave. Two of five criteria moved off FALSE on the strength of it.

**Why the phase is still not finished.** Three things, in order of how much they cost.

**First, 69 commits are unpushed.** This is new since the last verification and it is the
finding I would escalate above all others. At `37c0bd3` the branch was pushed and PR #77's
three-platform green covered HEAD. It does not now: the PR's head is `47a48cd` and HEAD is
`251b4aa`. So the strongest single piece of evidence this phase has — `Test (ubuntu)`,
`Test (macos)`, `Test (windows)`, `Electron smoke` all green — is evidence about a tree
that does not contain the identity gate, the telemetry credential, the queue disarm or the
960px window floor. And this is not a paperwork gap. The new `hooks.ts` gate is the most
platform-divergent code in the phase: `bigint` `dev`/`ino`, an `ino === 0n` branch for
filesystems without stable ids, `realpathSync.native`, a win32-only component normaliser,
and a socket branch that is explicitly POSIX-shaped. Its first execution outside Windows
will be on somebody's CI runner or somebody's laptop. All four gates are green here, and
one host is not three.

**Second, the headline deliverable is untouched.** Twenty non-epic floor-inspection issues
are still open; `origin/main` still pins `electron ^32.2.0`. The phase goal is a statement
about closed issues on a shipped product, and it reads 0/20 today exactly as it did at
`37c0bd3`. Nothing in the gap wave could have changed that, and the register's row C1 says
so plainly with the operator named. This is the correct call — closing an issue against an
unmerged branch would be precisely the kind of green tick this phase exists to eliminate.

**Third, nobody has looked at the app.** D-09 is unrun, so 01-01-SUMMARY.md still does not
exist and the phase has 30 SUMMARYs for 31 plans. `gh release list` is empty, so
`gh attestation verify` has never executed against anything. And the gap wave *added* an
unrun operator check that did not exist before and which I would rank above D-09 for
consequence: nothing proves the Claude Code SDK actually forwards
`OTEL_EXPORTER_OTLP_METRICS_HEADERS`. The round-trip test proves the collector accepts the
header the app exports; it cannot prove the SDK sends it. If it does not, 01-25 took
telemetry dark floor-wide — cost ledger, resume key, every breaker cost arm, account
failover — and the only signal is a throttled log line.

**On the honesty of the documents.** The eight new SUMMARYs, `01-SECURITY.md`,
`01-VALIDATION.md` and the 53-row residual register are, on the evidence I gathered, more
honest than most verification reports. `01-SECURITY.md` records 184 of 289 threat IDs as
*not individually re-verified* rather than inheriting them as closed. `01-VALIDATION.md`
kept `nyquist_compliant: false` under pressure to flip it. Plan 01-31 re-derived thirteen
doc anchors, found thirteen stale including four a previous sweep had certified correct,
adjudicated GATE-01 **down** against a plan that had claimed it, and ticked no box. The
register assigns an owner to all 53 residuals and explicitly refuses to hand code work to
the operator. `01-VERIFICATION.md`'s own predecessor was amended at `47a48cd` to retract a
false claim about FLOOR-13. That pattern is the opposite of the failure mode this phase was
written to remove, and it deserves saying.

**The honest verdict is still PARTIAL, and that is the successful outcome.** The floor is
better. The floor is not finished. The one thing standing between this report and a much
stronger one is a `git push` and a merge.

---

## Remaining work, with an owner for every item

**Operator — blocking, do these first**

1. **Resolve the GitHub Push Protection block and push the 69 commits.** Then read
   `gh pr checks 77` against the real head and confirm all three `Test (os)` rows plus
   `Electron smoke` green. Until this happens no claim in this report generalises past
   win32. *(new gap, this verification)*
2. **Merge PR #77 to `main`,** then close the 20 non-epic floor-inspection issues, each
   against merged source. *(register C1 — SC-5)*
3. **Run D-09** on this Windows host and write `01-01-SUMMARY.md`. *(register C2 —
   SC-2, FLOOR-03)*
4. **Spawn one real `claude` agent** and watch for `[hive] OTLP batch REJECTED` in the main
   log. *(register C5 — highest-consequence unrun check in the wave)*
5. **The remaining visual checks:** the app at 960px (C7), the ~600 swept FLOOR-12
   surfaces, the AUTO chip live, the log-folder click, the Windows blocked-agent toast,
   the Tasks board after the poller migration, FLOOR-04's live fake-key drop. *(register
   C4, C7)*

**Whoever cuts the next tag**

6. **Cut a `v*` tag from the merged tree** and run `gh attestation verify <artifact>
   --repo MARKXAILABS/hello-markx`. *(register C3 — SC-2, FLOOR-06)*

**The ROADMAP's owner**

7. **Restate SC-1** to the reload/renderer-crash boundary FLOOR-02 actually covers, with a
   one-line pointer to Phase 2's DAEMON-01 — or hold the criterion open until Phase 2.
   *(register C8)*

**Follow-up plans in this milestone**

8. **`ThoughtBubble.ts` / `ToolBubble.ts`** — fix or formally accept the 7px effective
   label size. Not a two-line change: `PADDING_X`, `PADDING_Y` and `CORNER_RADIUS` are all
   half-size on screen too. *(register A1)*
9. **`src/renderer/src/store/autoMode.ts` + the agent store** — record the spawn-time
   bypass on the `Agent` shape so the `opencode` chip stops lying in both directions, and
   repoint `autoModeFlagForProvider` at `autoFlag`. *(register A27, and the `b/WR-01`
   reader mismatch)*
10. **`src/main/delivery.ts` + `src/renderer/src/hooks/useHive.ts`** — the two accepted
    `quiesce` residuals. *(register A23)*
11. **`src/main/hive.ts`** — the `recordSession` top-level guard. *(register A10)*
12. **`src/main/hooks.ts`** — the `.git` and other-agent halves of the hard-link ceiling.
    *(register A17 / T-P24-15)*
13. **STRUCT-01** — make `spawnAgentCore` importable so resume sinks 1–3 can be pinned
    behaviourally rather than structurally. *(register C6)*

**Later phases (deferred, not gaps)**

14. **GATE-02, Phase 4** — GATE-01 clause 2, the child-env requirement.
15. **DAEMON-01, Phase 2** — running with no window at all.
16. **RECALL-02, Phase 5** — server-enforced memory scope.
17. **VERDICT-01, Phase 5** — a review that reads the diff.
18. **A Phase 2+ plan holding `TasksKanban.tsx`** — either wire the budget meter or revert
    the `{tokens, budgetTokens, pct}` widening on `hive:tasks`.

---

_Verified: 2026-08-22T19:08:22Z_
_Verifier: Claude (gsd-verifier) — every gate in this report was executed in this session at `251b4aa`; no SUMMARY claim was accepted as evidence._
