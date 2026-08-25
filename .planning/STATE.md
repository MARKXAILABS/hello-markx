---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Phase 4 EXECUTED -- all 20 plans landed across 7 waves; phase does NOT close (nyquist_compliant FALSE, 5 of 7 Manual-Only items open, no Dimension 8 confirmation) -- see PR #83. Phase 3 is PLANNED and RED-TEAM CLOSED: RED_TEAM_CLEAN=true set 2026-08-25 on operator acceptance of 3 named residuals (03-CONTEXT.md Red-Team Log), NOT on a zero-finding round -- that distinction is deliberate; 10 review rounds, every finding closed, 4 mechanical auditors pass. Phase 3 now EXECUTING on top of the Phase 4 tip, so 03-09 can close SCALE-03 against a landed RECORD-02 instead of recording a residual gap. SCALE-01 still depends forward on Phase 5 RECALL-02 and stays open regardless."
last_updated: "2026-08-26T00:00:00.000Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 72
  completed_plans: 62
  percent: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-20)

**Core value:** You can leave it running and trust it.
**Current focus:** Phase 04 — overnight-on-a-repo-that-matters (executed, not closed)

## Current Position

### Phase 04 (overnight-on-a-repo-that-matters) — ALL 20 PLANS EXECUTED, PHASE NOT CLOSED

Executed 2026-08-25/26 across 7 waves on branch `worktree-gsd-plan-phase-04`.
Every plan's work was merged wave-by-wave and the full gate re-run on each merged tree,
not trusted from any SUMMARY.

**Measured at the phase tip (this session, three consecutive runs):**
`npm test` 1078 tests / 1071 pass / **0 fail** / 7 skipped / 24.2s worst wall.
`npm run typecheck` 0 errors both projects. `npm run lint` exit 0. `npm run build` exit 0 (Node 22).
Baseline at phase start was 843/836/0/7 — **+235 tests, zero regressions, zero new skips**.

**`nyquist_compliant` remains FALSE. The phase does NOT close.** 5 of 7 Manual-Only items are
open and no Dimension 8 confirmation exists in `.planning/`. Phase 2's audit had already moved
this same flag true -> FALSE for three of the identical blockers; flipping it now would reverse
that correction with less evidence. Awaiting `/gsd-verify-work` and operator UAT.

**Four defects found that no acceptance criterion would have caught — each a feature that
existed and did nothing:**
- GATE-03 was dead on OpenCode: `tool.execute.before` posted no `tool_input`, so main answered
  ALLOW on every call from an OpenCode agent (04-10).
- GATE-03's command never reached the renderer: `preload/index.ts` typed the payload without it,
  so it was unreachable by construction (04-14).
- GATE-05's desktop half was dead: `emitControl` sent neither `askId` nor `expiresInMs`, and
  `openApproval` called it without the entry it had opened six lines earlier (04-18).
- The kanban renderer re-declares its own `HiveTask` and `parseTasks` is a whitelist, so
  `updatedAt` and `released` would have arrived `undefined` at every card (04-12).

Also: a test that PASSED while taking 240,728 ms (an ask sitting out its 120s TTL) — the suite
had silently gone 26s -> 257s (04-16); a WCAG failure at 1.85:1 on the deny button in dark mode
(04-14); titlebar constants ~107px stale from before this phase (04-18); and a genuine ~1-in-9
flake caught by a 25-run probe (04-15).

**RECORD-02 durability proven live:** real `SIGKILL` against a 160,712-byte uncheckpointed WAL;
a second process answered both questions from disk.

**Open, with named owners — see `04-19-SUMMARY.md` for all 14:**
- GATE-04 is BUILT but NOT WIRED — no production caller passes `agentDir`; opt-in ON today gives
  `-s workspace-write` WITHOUT the folder added. Must be threaded via `sandboxFlagsForProvider`.
- GATE-04 LIVE-UNVERIFIED and `LIVE GATE-03 REFUSAL: no` — this machine's codex token is revoked
  (`401 refresh_token_reused`). Absence of evidence, NOT evidence of absence.
- The push leg is a declared stub in two places with one root cause: `webhook.ts` has no
  `PushSubscription` intake route, so VIGIL-01 cannot reach a phone by push.
- `resources/phone/sw.js:33-35` carries a KNOWN FALSE security comment (unowned).
- `test/hive-durability.test.cjs:197`'s argument slice is inert — `indexOf` returns -1, the slice
  runs 14,315 chars to EOF (unowned).
- `hiveProvisioning.ts:230-231`'s comment is over-strong (unowned).


Phase: 02 (the-daemon-and-the-protocol) — **COMPLETE, all 12 plans landed**
Plans complete: **12 of 12** (counted off disk: `ls .planning/phases/02-*/02-*-SUMMARY.md | wc -l`).
      Landed: **02-01, 02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08, 02-09, 02-10, 02-11, 02-12**.
      Wave 9 closed: **02-12** (the honesty ledger, the phase's last plan). Re-measured every claim
      this phase touched against the tree at wave 9's end, not carried forward from any prior
      SUMMARY: PARITY-03's marker ledger (18 raw `LIVE-UNVERIFIED` markers across 6 files, per-engine
      attributed via structural comment-block bounding — found and fixed a genuine gap in the same
      motion, `qwen` had ZERO markers despite being as unverified as pi/opencode/crush); all three
      copies of ADR-0001's one-gate sentence made to agree (`docs/message-queue.md` was already fixed
      by 01-23; `HIVE.md` was not); README's engine table re-derived from source (kimi off the NO MAIL
      row, a new NO MCP row, PARITY-02 restated to what shipped); SECURITY.md's tunnel-close claim
      corrected in the app's favour (the old "cannot be closed" limitation is false since 02-04) and
      three real exposures named (global remotely-triggerable lockout, the self-identifying `/phone/`
      shell, Discord's buffer-before-verify inversion); TESTING.md/CONCERNS.md re-measured (73 test
      files, 863 cases, 803 TAP tests); `.planning/ROADMAP.md`'s own four disproved Success Criteria
      and the god-file figures corrected in place, marked with date+D-id, no checkbox moved;
      `.planning/REQUIREMENTS.md`'s PARITY-02 restated in the requirement itself, checkbox left as
      found (already `[x]` from an earlier plan, against text that was false until this correction).
      **Also fixed, handed over from 02-10 and root-caused precisely**: the fresh-install
      `tunnel:start`/`phone:pairing` circular dependency (a zero-webhook-trigger install could never
      open the public tunnel at all, because the only thing that arms the phone route was never
      invoked before the tunnel refused) — `tunnel:start` now arms the phone as part of its own
      explicit operator action when nothing else is configured, proven by two new tests against the
      real `WebhookServer.start()` bind (index.ts's IPC handler itself is still untestable directly,
      D-02). See `02-12-SUMMARY.md` for the full ledger, all RED-drive runs, and two findings recorded
      rather than silently reconciled: the marker-count criterion undercounted to 8 where 10 was
      structurally required, and the god-file figures use this session's own re-measurement (4,967 /
      2,822 / 160) rather than the plan's own stale 2026-08-21 pointer (nine further waves moved it).

Execution facts as of this line:

- Branch `gsd/v1.0-floor-closure`; NOT `gsd/v1.0-milestone` (that branch is content-behind and would
  regress two phase-1 source fixes plus all 12 phase-2 plans). Nothing is pushed — `gh pr checks` is
  therefore MEASUREMENT UNAVAILABLE for every plan so far, recorded as such, never faked. (`gh pr
  checks` DOES return rows for PR #78, but its head sha `bb1ad70` is `origin`'s current tip — 53
  commits behind this session's `HEAD` and every unpushed 02-01..02-11 commit too. Stale, not fresh.)

- `workflow.use_worktrees=false`, so every plan runs sequentially on the main tree. No worktree
  merges, no post-merge reconciliation.

- Whole-suite figure re-measured after every plan, never SUMMARY-trusted:
  638/631/0 fail/7 skipped at phase start (commit 90a6cc9) -> 728/721/0/7 after 02-11 -> 753/746/0/7
  after 02-05 -> 762/755/0/7 after 02-06 -> 777/770/0/7 after 02-08 (+13 cases: 5 in
  task 1, 4 in task 2, 4 in task 3), matching the orchestrator's own pre-dispatch baseline of
  757/0/7 plus this plan's additions exactly -> **789/782/0 fail/7 skipped** after 02-09 (+12 cases: 4
  in `build-assets.test.cjs`, 8 in the new `push-vapid.test.cjs`) -> **800/793/0 fail/7 skipped** after
  02-10 (+11 cases across all 5 tasks in `test/qr-vendor.test.cjs`, the only test file this plan
  touched) -> **805/798/0 fail/7 skipped** after 02-12 (+5 cases: 1 new PARITY-03 clause, 1 new
  ADR-0001 clause, 1 new README clause, 1 new SECURITY.md clause in `test/repo-claims.test.cjs`, and 2
  new tests in `test/webhook-endpoints.test.cjs` for the fresh-install tunnel fix — 5 declared but
  actual delta was +5 tests exactly, confirmed by direct TAP diff, not arithmetic). `npm run
  typecheck`, `npm run build` and `npm run lint` (`--max-warnings 0`) all exit 0 at every checkpoint.
  0 failures is the bar; there is no pre-existing-failure allowance on this phase. **Phase 2 closes at
  0 failures, every checkpoint, all 12 plans** — 638 -> 805 tests, +167, zero regressions the whole
  way.

- **02-05 landed the phone's whole server-side door.** `/phone/**` routed ahead of `readEndpointId`
  off a five-file exact-filename allowlist; a single-use enrollment token (burned before its
  response) exchanged for a generated 192-bit bearer; a shared auth bucket + lockout across
  `/phone/api/**` that engages and provably clears; and a per-endpoint verifier dispatch admitting
  Telegram's header compare and Discord's Ed25519 signature (live-verified this session through
  `node:crypto` alone, zero new dependencies). `webhook.ts` still imports nothing from `electron`.
  Curl-verified for real on loopback with the tunnel off (`scripts/phone-curl-check.cjs`, 6/6 OK).
  **None of DAEMON-02/03/05 marked complete** — DAEMON-02/05 are shared with 02-09 (landed,
  localhost-verified, see below) and 02-10 (pairing UI, not yet landed); DAEMON-03's live half is
  operator-supplied (no bot token, no Discord application tested) and its own stated purpose has no
  phone UI to exercise until 02-10 lands.

- **02-11 landed DAEMON-04's mechanism for claude only.** `scripts/mcp-live-probe.cjs` live-reconfirmed
  `--mcp-config` spawns a server and `--settings`' `mcpServers` key does not (claude 2.1.236, run twice
  this session). `<agentDir>/mcp.json` (0600, git-ignored), per-agent write/secret grants
  (`mcpAgentGrants`, a latched migration dropping the old floor-wide consent), and three IPC channels
  are real.

- **02-06 closed DAEMON-04 and PARITY-01b (both flipped `[x]` in REQUIREMENTS.md).** `McpConsentModal.tsx`
  (the consent step 02-11 only built a data contract for) plus the agent card's `⚿`/`⚠`/`↻` MCP element
  complete DAEMON-04's operator-facing half. `capabilityGaps()` — one derivation over
  `providerCapabilities(provider, platform)` — now renders on the agent card, the provider picker
  (`AddAgentModal.tsx`) and the dispatch flow (`CommandCenterPanel.tsx`), closing PARITY-01b. This was a
  **recovery closeout**: a prior session landed all 5 task commits and was killed before writing
  SUMMARY.md; every claim was independently re-verified against the real tree (fresh greps, fresh
  containment diff against the correct base `5832c5e`, fresh `npm test`/`build`/`typecheck`/`lint`/`e2e`
  runs) before the requirements were flipped. One genuine STOP is on record and was independently
  re-confirmed rather than waved through: S2a's `maxWidth` cannot hold ≥80px in the scenario its own
  pass condition is written against (a capability gap chip AND a fully-populated MCP element on the same
  row) without growing the frozen 322×86 card — not forced, carried forward as a stated limitation,
  confirmed unreachable in the shipped app today because claude is the only MCP-wired engine and it
  carries zero capability gaps.

- **02-08 closed GSD-06 (flipped `[x]` in REQUIREMENTS.md).** `AskMeTab.tsx:92`'s hardcoded `to: 'god'`
  is gone; a `recipientOf(task)` resolver — one function, shared by the mail `to:` field and the
  header badge — routes the human's answer to whichever agent's `AGENT_ID` asked (via a new
  `askedBy` field on the humanQA entry, written by `task.cjs`'s `--q` branch from the environment
  only, never a flag). The god always gets a copy first and is still the one that unblocks the card;
  the asker's copy tells it to continue its own work. `capabilityLine()` — a tested pure function
  with **zero production consumers anywhere in this repo before this plan** — gets its first one, on
  `rosterContext()`'s per-row output, gated on an actual capability gap so a fully-capable floor
  renders byte-for-byte what it rendered before (measured: 469 content-only characters, identical
  before/after). `godLine`'s prompt-cached sentence that this phase made false (*"arrives as an inbox
  message to you"*) is rewritten with zero interpolated values, so ADR-0002 holds. D-01 correction:
  kimi is no longer the NO-MAIL example the plan's own text named — 02-07's bridge landed first — so
  copilot is used instead, live-verified. See `02-08-SUMMARY.md` for all 8 RED-drive runs, the
  measured roster lengths, and the honest statement that the answer reaches the asker's **inbox**
  (D-38), not its terminal (ROADMAP:221 is corrected there, not here).

- **02-09 landed the phone PWA bundle + `src/main/push.ts`, DAEMON-02's client half.**
  `resources/phone/{index.html,sw.js,manifest.webmanifest,icon-192.png,icon-512.png}` — two screens,
  no framework, packaged via a real `dist/win-unpacked` build (sha256-identical to the committed
  source). `src/main/push.ts` implements VAPID (RFC 8292) + `aes128gcm` (RFC 8291/8188) from
  `node:crypto` alone; the DER-vs-raw-signature bug and a CEK-derivation bug were both reproduced live
  and fixed under test. A real `WebhookServer` on a real loopback socket, driven by real `curl`,
  against the real committed bundle (not a fixture) passed all 12 auth-path checks — full transcript
  in `02-09-SUMMARY.md`. **R-push is ABSENT from the merged `webhook.ts`** (no VAPID-key route, no
  subscription intake), so `push.ts` ships unit-verified but wired to no route — named for 02-12.
  `phoneRootPath()`/the zero-endpoint guard were already plan 02-05's (commit `8577748`); this plan
  changed neither. **DAEMON-02 is NOT flipped `[x]`** — no physical Android device was used.

- **02-10 landed the pairing UI/QR — DAEMON-05's UI half, live-loop-verified end to end except one
  environmental step.** A vendored, digest-pinned QR encoder (Project Nayuki, MIT, pinned commit
  `2d0d3c9276cda321a206d6b48dd3c060f18d8e16`) with a purity gate that goes red on a hostile edit or a
  silent drift; `QrCode.tsx` renders + executes it under `node --test`; the tunnel panel in
  Settings → Connections (armed-then-confirm expose, untruncated URL, permanent re-minting QR, pairing
  link never rendered as text); the titlebar `PUBLIC` chip with two degradation widths measured live
  and pinpointed exactly (833px / 783px — **corrects** the plan's own 800px estimate: the full host is
  actually still shown at 800px, only auto-mode text hides there). The full live loop ran through the
  real app/real IPC/real cloudflared: tunnel opened, chip + panel + QR all correct, pairing minted,
  stop closed it, restart minted a genuinely new host + token — but the public-origin fetch step failed
  at the DNS layer, the same environmental blocker 02-04 found, re-confirmed live twice more this
  session. A second, independent, non-environmental gap was ALSO found live and left unpatched (outside
  02-10's declared files): `tunnel:start` refuses on a zero-webhook-trigger install because
  `phone:pairing` requires the tunnel already open — see the DAEMON-05 entry below. **DAEMON-05 is NOT
  flipped `[x]`.**

Requirements deliberately still OPEN, with the reason (none of these is an oversight):

- **DAEMON-01** — unit half green (02-03). `02-VALIDATION.md` requires BOTH `node --test` AND a live
  Electron run with real PTYs; the live run has not happened. Tracked as a phase-close gate.

- **DAEMON-02** — 02-05 landed the server's auth path, curl-verified on loopback; 02-09 landed the
  client half (the phone bundle + push.ts), also localhost-verified; 02-10 landed the pairing UI and
  ran the live loop end to end except the public-origin fetch (DNS-layer environmental blocker). Still
  not device-verified — DAEMON-02's own text names a real Android device as the honest completion bar,
  not yet attempted. **The `tunnel:start`/`phone:pairing` circular-dependency gap 02-10 found is FIXED
  by 02-12**: `tunnel:start` now arms the phone route itself when zero webhook triggers are
  configured, the same mint-then-start order `phone:pairing` already used, so the one operator control
  the shipped UI exposes is self-sufficient on a fresh install. Proven against the real
  `WebhookServer.start()` bind in `test/webhook-endpoints.test.cjs` (index.ts's own IPC handler is
  still untestable directly, D-02) — device-level pairing itself remains unattempted.

- **DAEMON-03** — the verifier + payload-adapter mechanism is real and localhost-verified (02-05); the
  live half (a real Telegram bot token, a real Discord application) is operator-supplied and was not
  available this session.

- **DAEMON-05** — spans 02-04/02-05/02-10/02-12. 02-05 closed two of its five bullets (generated
  token, rate limiting + lockout on the auth endpoint) — both re-proven live again in 02-10 (38/38 and
  13/13 test runs, this session). Live close attempted for real across two sessions now: 02-04 twice,
  02-10 once more via `scripts/tunnel-live-check.cjs` (re-run once, per authorization) AND via the full
  UI-driven live loop (`scripts/p10-live-loop.cjs`, real app, real button, real cloudflared) — every
  attempt: exit 3 / DNS-layer `fetch failed`, ANNOUNCED skip, never a claimed pass. Root cause remains
  ENVIRONMENTAL, not code — the LAN resolver returns NXDOMAIN for freshly-minted
  `*.trycloudflare.com` subdomains while the apex resolves and general egress is fine. A public
  resolver (8.8.8.8 / 1.1.1.1) would likely let this verification actually pass.
  **02-10's SECOND, independent, non-environmental gap is FIXED by 02-12** (see the DAEMON-02 entry
  above for the fix) — root-caused precisely: `tunnel:start`'s own comment premise ("a phone route
  family becomes servable in plan 02-05") was true but never wired through to the one path an operator
  can actually reach, since `phone:pairing` is only ever renderer-invoked AFTER a tunnel is already
  reported running.

- **STRUCT-01** — 02-02 and 02-03 closed the boot and agent-lifecycle seams; `spawnAgentCore`
  (~480 lines, imports electron at module scope) and ~160 IPC handlers remain in `index.ts` (measured
  by 02-12: `index.ts` 4,967 lines, `hive.ts` 2,822 lines — two further extractions past 02-02's own
  split moved more out since).

- **PARITY-03** — pinned by 02-12 as a ledger, not closed by verification. 18 raw `LIVE-UNVERIFIED`
  markers across 6 files, per-engine attributed and file-set pinned in `test/repo-claims.test.cjs`; 5
  bridges (pi, opencode, crush, qwen, kimi) stay marked, none run against a real account. Correctly
  never flipped — the honest outcome under the zero-recurring-cost rule, not a gap 02-12 failed to
  close.

Parity ledger after 02-12 (re-measured, not carried forward from 02-07): engines that can receive mail
**8 -> 9** (unchanged since 02-07); live-verified bridges **unchanged at zero**; LIVE-UNVERIFIED
bridges **4 -> 5** (kimi joins pi, opencode, crush, qwen, per PARITY-01a — the sign is stated
explicitly: PARITY-01a raised the can-receive-mail count while raising the unverified count too, not a
pure win). None of those five CLIs is installed on this machine, so this is the expected outcome under
the zero-recurring-cost rule. PARITY-02 restated (not "all eleven report cost"): claude/codex via
native telemetry, qwen/crush via the proxy-bridge sidecar — four tracked, seven not (grok, kimi,
antigravity, opencode, pi, plus copilot/custom which are structurally unfixable) — same words in
README.md, ROADMAP.md and REQUIREMENTS.md.

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
| Phase 01 P12 | 45m | 4 tasks | 7 files |
| Phase 01 P13 | 43m | 3 tasks | 9 files |
| Phase 01 P14 | 1h55m | 3 tasks | 9 files |
| Phase 01 P15 | 2h20m | 3 tasks | 5 files |
| Phase 01 P16 | 2h05m | 3 tasks | 5 files |
| Phase 01 P17 | 3h | 3 tasks | 6 files |
| Phase 01 P18 | 3h05m | 2 tasks | 13 files |
| Phase 01 P19 | 3h20m | 2 tasks | 8 files |
| Phase 01 P20 | 3h05m | 3 tasks | 24 files |
| Phase 01 P21 | 40m | 4 tasks | 18 files |
| Phase 01 P22 | 25m | 3 tasks | 1 files |
| Phase 01 P23 | 3h10m | 4 tasks | 16 files |
| Phase 01 P24 | 55m | 3 tasks | 2 files |
| Phase 01 P25 | 27min | 3 tasks | 8 files |
| Phase 01 P26 | 30min | 3 tasks | 5 files |
| Phase 01 P27 | 20m | 2 tasks | 4 files |
| Phase 01 P28 | 1h05m | 3 tasks | 7 files |
| Phase 01 P29 | 21m | 3 tasks | 6 files |
| Phase 01 P30 | 21m | 3 tasks | 6 files |
| Phase 01 P31 | 48m | 3 tasks | 8 files |
| Phase 02 P01 | 50min | 3 tasks | 8 files |
| Phase 02 P02 | 70min | 3 tasks | 11 files |
| Phase 02 P03 | 3h40m | 5 tasks | 16 files |
| Phase 02 P04 | 55min | 5 tasks | 14 files |
| Phase 02 P07 | 50min | 4 tasks | 12 files |
| Phase 02 P11 | 55min | 4 tasks | 9 files |
| Phase 02 P05 | 57min | 5 tasks | 8 files |
| Phase 02 P06 | 58min | 5 tasks | 8 files |
| Phase 02 P08 | 45min | 3 tasks | 5 files |
| Phase 02 P09 | ~5h | 5 tasks | 10 files |
| Phase 02 P10 | 75min | 5 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [02-11]: DAEMON-04 is left OFF `requirements-completed` in 02-11's own SUMMARY, deliberately, even
  though 02-11's own plan frontmatter declares it. 02-06-PLAN.md (wave 6) also declares
  `requirements: [DAEMON-04]` and has not executed — it owns the consent-modal UI. `requirements
  mark-complete` must not be called for DAEMON-04 until 02-06 lands too; two plans in the same phase
  both claiming a requirement is exactly the STRUCT-01/PARITY-03 trap the production-stress mandate
  names.

- [02-11]: `spawnSync('claude', …)` needs `shell: process.platform === 'win32'` — `claude` resolves to
  an npm-global `claude.cmd` shim on Windows, and Node's non-shell `spawnSync` does not append `.cmd`
  via PATHEXT. Same fix `pty.ts`/`shellEnv.ts` already use for their `where` probe. Node's `shell:true`
  no longer auto-quotes array args (DEP0190) — manual quoting is now required alongside it.

- [01-29]: A safety indicator errs toward OVER-reporting, and the direction is written into the
  source comment and pinned as a case. `isAutoModeAgent` returned `false` for every `custom` agent
  because the floor cannot GRANT that engine a bypass — but FLOOR-01 asks whether the AGENT is
  bypassed, and `config.ts` spawns the operator’s free-text command verbatim. A bypass the floor
  cannot grant is still one it can READ. Scanning every preset’s `autoFlag` means `mytool --auto`
  also lights the chip; that is a cosmetic false alarm, while a missed bypass is the failure the
  module’s own docstring calls the worst this chip can have.

- [01-29]: A substring is not a flag. Match whole argv tokens, and let each token contribute both
  sides of its first `=` — that one rule closes the substring false positive (`--auto` matching
  `--auto-compact`), the tokenizer’s own false negative (`--flag=value`) and Copilot’s three-token
  flag at once. And an empty needle set is NEVER a match: `[].every(...)` is `true`, which on a
  safety predicate is the difference between “no rule” and “always”.

- [01-29]: A cross-file pin is only a pin once its acceptance clause has been seen FAILING, and the
  failure input must cost the suite nothing. An INLINE FIXTURE of the prior source text gives the
  identical guarantee as `git show <sha>:<file>` with no process, no git object and no working-tree
  write — and unlike the git call it survives CI, where every `actions/checkout@v4` is a depth-1
  clone that does not contain the object. The extractor also asserts it MATCHED before comparing: a
  broken regex and a compliant tree must never be indistinguishable.

- [01-29]: Two bounds for two requirements. An effect that calls a PERSISTING setter may enforce an
  invariant (the splitter handle must stay reachable) but never a preference (leave the floor
  360px) — the drag handler enforces the preference, because a drag is the operator asking for it.
  Conflating them let a single window resize to 1024 rewrite a 900px sidebar to 664 and store it.

- [01-30]: A platform-conditional case uses the runner's own `skip` option with a CONDITIONAL
  value, and the conditionality is PROVEN, not intended. An unconditional skip satisfies every
  "the runner counts it" gate while deleting the other platform's coverage — a real non-run on
  every platform, strictly worse than the false pass it replaces. The control is to poison the
  case's own assertion: it must fire on the polarity that runs and stay invisible on the one
  that skips. And when the guard the test names cannot be dropped everywhere, SPLIT rather than
  skip — a skip on `transcript-project-dir`'s case would have traded one non-run for another.

- [01-30]: A source-text pin matches an ASSIGNMENT with a value, over COMMENT-STRIPPED source,
  never a bare symbol over raw source — `assert.match(body, /sock_token/)` was satisfied by a
  commented-out `// payload.sock_token = …` and was the only pin on five of six shims. Proven
  by a mutation LOOP over the whole derived corpus with the iteration count asserted, plus the
  same six mutations against the REAL `hive.ts`, because the loop proves the regex and only the
  file proves `npm test`. Where a control's soundness rests on a measurement (`no shim body
  contains a `://``, so the `//` strip cannot truncate), the measurement is ASSERTED in the test
  so the guarantee cannot expire silently.

- [01-30]: `continue-on-error` is not the only way to disarm a CI gate and it is not the
  important one — `npm test || echo "flaky, see #NNN"` swallows the runner's exit code with
  every existing assertion still passing. The command is pinned BYTE-EXACT, and widening a glob
  that a tripwire keyed on requires re-establishing that tripwire on the narrower set in the
  SAME change: hashing `latest*.yml` would otherwise have let a release publish an attested
  update feed with no installers, every check green.

- [01-25]: An endpoint injected into the attacker's own environment has no transport boundary.
  The OTLP collector mints its OWN per-agent capability (never the hook token — one secret on an
  OpenTelemetry-spec'd env var is inherited by every grandchild and posted to whatever vendor an
  agent's tooling is configured for), resolves it server-side before the body is consumed, and
  fails CLOSED on an empty registry. Attribution comes from the token; the payload's `agent.id`
  is unreachable on the network path.

- [01-25]: A session id is not one thing. `VALID_SESSION_ID` is a PATH-COMPONENT charset and must
  keep accepting long and leading-underscore ids; `SPAWN_SAFE_SESSION_ID` is an ARGV shape anchored
  on the FIRST CHARACTER, because `-` is a member of `[A-Za-z0-9_-]` and round 0's proposal accepted
  `--dangerously-skip-permissions`. Two constants, a subset control asserted over the whole measured
  table so they cannot invert, and four guarded sinks — the writer validates what the reader refuses.

- [01-25]: An accumulator keyed by a caller-chosen id is a cross-agent collision. The key is the
  (agentId, sessionId) PAIR, and the control that proves it is INJECTIVE must never name the
  separator — every test that imports the key builder agrees with it by construction.

- [01-24]: Compare filesystem IDENTITY, not path spellings, at the PreToolUse deny boundary.
  Four prior revisions canonicalised spellings and each review round found more; the shipped fix
  has no host set, no prefix table and no spelling list, and 18 spellings measured ALLOWED at HEAD
  in the execution session are all DENIED. statSync uses { bigint: true } because 15 of 29 inodes
  sampled on this volume lose precision as a JS Number.

- [01-24]: On the hook socket, any mechanism that closes, destroys, refuses or starves a connection
  is a BYPASS, not a control, because the shims read a silent close as ALLOW. The only admissible
  bound delivers an explicit deny to a peer still connected to read it — so the byte cap and the
  idle timeout reply and then `end()`, Node’s server-level connection limit and an aggregate byte
  budget are both absent, and the unbounded connection COUNT is an accepted residual (T-P24-12).

- [01-24]: A capability-dependent test uses the runner’s own skip, never a bare `return` — which
  node:test counts as a PASS. GATE-01’s own socket-watchdog case had reported green on win32
  without executing a single assertion there.

- [01-22]: Route A over route B for FLOOR-01/FLOOR-13. The plan's own probe licensed the route-B
  fallback — a pure `store/autoMode.ts` assertion whose own acceptance criterion concedes it adds no
  FLOOR-01/FLOOR-13 coverage, because plan 12 already covers that module in
  `test/renderer-runstate.test.cjs`. Measured that the obstacle was "Node is not a browser", not "the
  component is untestable": two shims the real build already provides (`globalThis.self` for
  `@xterm/addon-fit`'s UMD header, `.css` imports resolving to `{}`) make `AgentCard.tsx` render 3,050
  characters of real markup with the AUTO chip in it. Both requirements are asserted on RENDERED
  MARKUP, including FLOOR-13 clause 5 ("the model, before the cost"), which plan 12 could only record
  as MEASUREMENT UNAVAILABLE for the pixels.

- [01-22]: `ErrorBoundary.tsx` excluded from the renderer test set and named as excluded. React error
  boundaries are inert on the server — `react-dom/server` RETHROWS a child's error instead of calling
  `getDerivedStateFromError` (measured) — so its fallback is unreachable and its only other branch
  renders 13 characters. A non-empty check there would be decoration, not coverage.

- [01-22]: Seed zustand's `getInitialState()` object, never `setState()`, for a static render.
  zustand 4.5's `useStore` passes `api.getServerState || api.getInitialState` as React's
  `getServerSnapshot`, so `setState()` is invisible to `renderToStaticMarkup` by design (a
  setState-seeded card renders byte-identically), and assigning `useStore.getServerState` lands on the
  wrong object because `create()` does `Object.assign(useBoundStore, api)`.

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

- [Roadmap]: GSD is Phase 7, deliberately last. Every trust property that makes a GSD phase on
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
- [Phase 01-12]: the AUTO chip's derivation is the agent's OWN command string, never config.autoMode - buildSpawnCommand appends the flag ONCE at spawn, so a chip driven off the live toggle lies in BOTH directions (off does not de-bypass a running agent; on does not bypass one already up). opencode is the single documented exception and follows the toggle because its bypass is written into OPENCODE_CONFIG_CONTENT at spawn (index.ts:3357) and is NOT recorded on the agent; custom returns false unconditionally because it has no auto path at all. Proven RED twice: making custom follow the toggle fails test 12, making everyone follow it fails tests 9/10/13.
- [Phase 01-12]: AgentCard resolves its OWN store row (agentRowForCard: ptyId, else a UNIQUE name) rather than gaining props - the card is handed flat display props and never an agent id, and AgentStrip.tsx (its only caller) is plan 14's file and is banned both by this plan's action text and by its containment criterion. A duplicate name resolves to undefined rather than to the wrong agent's bypass state, so the failure direction is 'no chip', never 'someone else's chip'.
- [Phase 01-12]: the sidebar toggle is a NATIVE <button>, not <PixelButton> - a deliberate deviation from UI-SPEC's locked toggle clause. PixelButton forwards only title/style/onClick to its <button> so aria-expanded cannot reach the element, and plan 23 pins PixelButton.tsx byte-identical to bd286ebf5654a2647c93546dc135f608aeb5d0f0 with 'nothing in Phase 1 edits it, by design'. All five pre-existing aria-expanded controls in src/renderer are native buttons for the same reason. Palette copied from PixelButton secondary/sm token for token; the visible label is the accessible name, no aria-label.
- [Phase 01-12]: shortModel is EXPORTED from FullscreenTerminal.tsx and IMPORTED by AgentCard.tsx rather than copied. Two copies of a display formatter are two ways to render one model id, which is the exact drift FLOOR-13 exists to close. Verified acyclic: AgentCard is imported only by AgentStrip, AgentStrip only by App, and nothing in FullscreenTerminal's import graph reaches either.
- [Phase 01-12]: the live config.autoMode toggle is published ONCE by App into store/autoMode.ts and read back by all three renderings via useSyncExternalStore - the module-singleton shape already established by components/terminalFontSize.ts and design/theme.ts. autoMode.ts itself imports no React, so it still loads under node --test. Three independent routes to one boolean is how a safety indicator starts disagreeing with itself.
- [Phase 01-13]: took the `remote` BIT not a platform argument on capabilityLine (D-40 left the shape open) - ADR-0002 bans values that change BETWEEN TURNS, and process.platform read once behind a defaulted parameter is a process-lifetime constant, so the roster line is byte-identical every turn on a given host; a caller free to pass a VARYING platform is how a stable prefix turns volatile
- [Phase 01-13]: the capability clause names WHICH gap it is - 'REMOTE CONTROL unavailable on Windows' only where the engine HAS remote control and this host cannot use it, 'NO REMOTE CONTROL' for the nine that never had it. One shouted string for both would have blamed Windows for a gap that exists on every platform
- [Phase 01-13]: the new blocked-toast path is gated on PROVIDER IN MAIN off the live registry, never in the renderer - the renderer names an agent and gets no say in the title, body, click target or whether a toast fires at all (T-P13-03/T-P13-06); RED-controlled by removing each guard in turn, 5/5
- [Phase 01-13]: FLOOR-14 truth 5 reported PARTIAL rather than satisfied - SettingsModal.tsx:1008 still claims notifications work with no platform qualifier, and that file is outside the plan's declared set, so silently breaking a mechanical containment criterion to satisfy a prose truth was refused. Blocker + deferred item with the one-sentence fix instead
- [Phase 01-14]: fixed the TOKEN LAYER first and in its own commit with its only two consumers, per the operator root-cause directive - tokens.css declared 8/12/13px while DESIGN.md:706 says never below 14, so patching call sites against a broken scale would have been the surface fix. display-sm was DELETED not raised: a token whose whole job was 'smallest' cannot sit at the floor without inviting the next sub-floor value to be written into it, and deleting it makes the regression unrepresentable
- [Phase 01-14]: aria-hidden goes on a <span> wrapping the glyph, NOT on the button UI-SPEC's Rule 0 literally names. Four of this group's five exempt glyphs ARE the entire content of a focusable <button>, and aria-hidden on a focusable element removes it from the a11y tree while leaving it in the tab order - a control with no name, which is threat T-P14-05 itself (axe aria-hidden-focus). The span carries the local fontSize override, so it is also the allowlist entry UI-SPEC's own hoisted-object rule asks for. Wave 7 must copy this shape
- [Phase 01-14]: the accessible-name pass found NOTHING to add across all four files and nothing was manufactured to satisfy a count. AgentStrip's 'grep -c aria-label must increase' criterion is UNSATISFIABLE on correct code - its only icon-only buttons already carry labels and its other three controls have visible text - so it is reported NOT SATISFIED rather than met by adding a redundant aria-label to a button with visible text, the exact anti-pattern UI-SPEC bans. Same call as 01-04's CONTRIBUTING.md and 01-10's README
- [Phase 01-14]: the agent card shipped with NO NAME while every grep in the plan passed. The identity row gives the name flex:1/minWidth:0 while every sibling is flexShrink:0, so at the 14px floor two 64px Press Start 2P chips (BOSS+AUTO) plus the badge needed 262px against 160px of column and the name clamped to ZERO width. Caught by npm run e2e against real Electron 43, measured live with getBoundingClientRect + canvas measureText, fixed at SOURCE in its own atomic commit cea311e: width 220 -> 322 (+102, the measured delta). A green grep is not a green pixel
- [Phase 01-14]: the two Pixi labels take FONT_SIZE = 14 exactly as pinned, but their DESIGNED on-screen size is 14 * RENDER_SCALE = 7px - both bubbles render their Text inside a container held at 0.5 and every on-screen dimension is bgW * RENDER_SCALE. A true 14px needs authoring at 28 in inner space, which takes the cloud from ~40 to ~17 chars per line and turns MAX_CHARS=160 into a ten-line balloon over an 18x28 sprite - re-geometrying MAX_WIDTH/MAX_CHARS/the overlap pass, i.e. containment step 3 (stop and report) and a redesign the phase contract forbids
- [Phase 01-14]: containment integers were moved by deltas MEASURED in a running Electron window, not by arithmetic on font metrics. Six containers changed (card 78->86 and 220->322, sticky note 20x18->30x20, strip 112->120, label clamp 84->92, note popover 280->340), nine were checked and deliberately left alone. The one sized by arithmetic alone - the card width - was the one that was wrong
- [Phase 01-15]: the nav rail's +43 was MEASURED, not derived - and arithmetic would have got it wrong. The three LONGEST nav labels ('Autonomy & Budgets' and 'Memory & Knowledge' at 252px intrinsic, 'Agents & Models' at 210px) do not overflow at all, because each contains a space and wraps inside a rail with no fixed height. The two that broke are the unbreakable single words: 'Prerequisites' (182px, overflowX 43) and 'Connections' (154px, overflowX 15). Sizing by the longest label gives 284px - 81px of dead rail, for the wrong string. 160 + 43 = 203, at which all seven buttons report overflowX 0
- [Phase 01-15]: six px line-heights were ORPHANED onto their own line, one below their fontSize, and the same-line sweep structurally could not see them - SettingsModal.tsx:77 (slackLabelStyle) and :870 (the nav button), McpDefaultsSettings.tsx:24/:122, AiEnginesSettings.tsx:50, ClaudeAccountsSettings.tsx:33. Left alone they would have put 14px text in a 12px line box in the app's most-used hoisted label style. Found by re-scanning for lineHeight px AFTER the sweep. Every wave-7 sweep must run that second scan
- [Phase 01-15]: CDP Emulation.setDeviceMetricsOverride is the ONLY route that moves an Electron BrowserWindow's LAYOUT viewport. page.setViewportSize, win.setBounds and win.setContentSize were each measured to leave window.innerWidth pinned at 1280, so the first two 'narrow floor' runs printed VIEWPORT 1024x768 (inner 1280x900) - a narrow-viewport claim with no narrow viewport behind it. Caught only because the harness printed the TRUE inner size beside the requested one
- [Phase 01-15]: the positive control caught its own vacuity on the first run. Two probes reported MISSING because McpDefaultsSettings renders under Connections (SettingsModal.tsx:1342), not Memory & Knowledge - its tab had been scanned CLEAN with the component not on screen. A clean sub-14px scan over an unmounted component is worth nothing; 19/19 probes found and >=14px is what makes the zero real
- [Phase 01-15]: ZERO aria-labels added across all five files, reported as the correct outcome rather than a miss. 6 native buttons and 51 PixelButtons, every one with visible text or (the two 'i' help toggles) an existing aria-label. Raising the count would mean labelling a button with visible text, which overrides the visible label - threat T-P15-04 in this plan's own register. Proven live: unnamedButtons=0 on 7 tabs x 3 widths, 21 measurements. Same call as 01-14's AgentStrip, 01-10's README and 01-04's CONTRIBUTING.md
- [Phase 01-15]: this group's Rule 0 allowlist is EMPTY and nothing was manufactured to fill it. M3 returns zero candidates across all five files, UI-SPEC's 30-candidate table names none of them, and NEITHER hoisted style object (slackInputStyle's 20 input consumers, slackLabelStyle's 18 label consumers) serves a glyph - so no local fontSize override was created and there is no allowlist entry. For this group allowlist size == post-sweep M1 == 0 in every file
- [Phase 01]: 01-16: migrated the onboarding/picker cluster (100 M1 occurrences, 5 files) onto 01-14's corrected token layer rather than patching literals -- 0 -> 100 var(--cth-text-*) references, Press Start 2P retired at zero sites (cth-font-display counts unchanged 3/13/4/3/4).
- [Phase 01]: 01-16: classify each fontSize by its ENCLOSING style OBJECT (string-aware brace matching), not by its physical line -- 27 of 100 sites take Rule 1 because of a fontFamily that is not on the fontSize's line. Cross-checked: the Rule 1 count must equal the sum of the five files' grep -c cth-font-display, and it did.
- [Phase 01]: 01-16: answered 'did the sweep break containment' with a BASE-vs-HEAD differential -- built the base sha and ran the identical Electron probe against it. Overflow lines came back byte-identical, so ZERO container integers were changed and that is measured, not assumed. It also converted HivePicker's 7 alarming overflows into a proven pre-existing folderName() Windows bug.
- [Phase 01]: 01-16: read accessible names off CDP Accessibility.getFullAXTree, never off aria-label ?? textContent. That is the only reason OnboardingWizard.tsx:582's EMPTY accessible name was found. must_haves truth 2 is reported PARTIAL, not green: the name is real and measured but rides title, because the root-cause fix (an aria-label prop on PixelButton) would break plan 23's byte pin.
- [Phase 01-17]: role=img is REQUIRED alongside aria-label on a non-interactive span — Chromium does not expose aria-label on role=generic, so UI-SPEC's bare-aria-label wording for the % unit label and the ? chip would have shipped silent with every grep green. Proven on the AX tree.
- [Phase 01-17]: IntegrationsRegistry.tsx:388's variable-rendered {st.dot} takes NO Rule 0 size exemption — UI-SPEC's Rule 0 applies only to the frozen literal-only M3 candidate set. Swept to the token and given aria-hidden, so the phase's only two-occurrences-on-one-line site is removed structurally rather than by edit ordering.
- [Phase 01-17]: global.css's markdown preview migrated onto the token layer (the root-cause option), but OfficeFloor's two WebGL-failure banners were deliberately kept as a 14px LITERAL — that path runs when the renderer is already failing and must not depend on a stylesheet having loaded.
- [Phase 01-17]: The sweep caused TWO real container regressions invisible to every grep in the plan (the TriggerCard caret spilling a fixed 8px box at all three widths; the TasksKanban assignee chip spilling an 87px column). Both were found only by the BASE-vs-HEAD Electron differential and fixed at source.
- [Phase 01-17]: The positive control earned its keep again: 01-17's first probe run reported sub14=0 on all 30 surface-scans while the app sat behind the launch-time hive picker. texts=10 and every control MISSING is what caught it.

- [Phase 01-18]: GitPanes' hoisted smallBtn has SIX consumers, not the three the plan mapped — two are
  glyphs (✕ :138, ⇄ :225), four are text. Allowlisting the shared declaration would have held `load
  older…`, `jump here`, the mode toggle and `switch to` below the floor with every grep green. A hoisted
  object's consumer list is derived by grep from LIVE SOURCE, never taken from the plan.

- [Phase 01-18]: Monaco's own fontSize option raised 12 -> 14 as a NUMERIC literal in MonacoEditor and
  MonacoDiff. It is user-facing editor text under DESIGN.md:706 with no allowlist entry it could
  lawfully take (it is not a glyph, so it can never carry aria-hidden), and Monaco cannot parse a var().
  Verified on the rendered .view-line — 14px/20px with real text at 1280/1024/800; at BASE every one of
  315/630 rendered lines of source and diff was sub-14px.

- [Phase 01-18]: THE FINDING — the sweep spilled the IDE git rail out of its 300px column by 85px. Three
  Press Start 2P labels at Rule 1's 14px need ~386px and nothing on that row truncates, so it painted
  over the editor at 1280, 1024 and 800. Invisible to every grep in the plan; found ONLY by building the
  BASE sha and running the identical CDP probe against it. Fixed at source in its own commit: treeWidth
  300 -> 424, the MEASURED delta, inside the pre-existing 200..520 drag clamp. ComparePane was ALREADY
  spilling 39/51px before the sweep and is closed by the same integer — reported, not claimed as mine.

- [Phase 01-18]: TriggerHistoryTab's eight `fontSize: 11` overrides on top of uiText/muted were DELETED,
  not rewritten to the token twice — post-sweep the base object already carries 14/20, so the override is
  a no-op and deleting it is the smaller true diff.

- [Phase 01-18]: two eslint-disable-next-line anchors were displaced by this plan's OWN edits
  (SchedulesSection 184->187 by a 4-line style expansion; IdePanel 278->286 by the containment fix's
  rationale block) and BOTH were actively reversed. Suppressions bind by adjacency so neither was ever
  detached — but a criterion that has to be argued is not a criterion. The rationale moved into the
  commit message and the code kept a one-line trailing comment. All four anchors are on 84/149/184/278.

- [Phase 01-18]: zero aria-labels added across 22 buttons + 13 PixelButtons, reported as the CORRECT
  outcome rather than a miss (the 01-14/01-15 call). Every icon-only control already carried one; every
  other has visible text. Proven live with unnamedButtons=0 on all 33 AX-tree scans, not by grep.

- [Phase 01-19]: classify every fontSize by its ENCLOSING object literal with the REAL TypeScript parser, never a hand-rolled string masker — the masker swallowed 5 sites in MemoryPanel and 2 in App on apostrophes inside JSX text (isn't, agent&rsquo;s), and only cross-checking its per-file site count against M1's caught it. The Rule 1 count (12) equals the sum of the eight files' grep -c cth-font-display (12), which cross-checks the whole classification.
- [Phase 01-19]: the composer is floored on the CONSUMER — Math.max(14, useTerminalFontSize()) in MessageQueueComposer only — and MIN_TERMINAL_FONT_SIZE stays 8. Raising the shared constant would floor a TEXTAREA by taking two zoom steps away from xterm, which is exactly what UI-SPEC's terminal carve-out protects. composerLineHeight 17->20, minHeight 99->114, maxHeight 306->360 all follow by derivation; no literal was hand-edited and the box still holds the same visible line count.
- [Phase 01-19]: THE FINDING — the sweep made a skill name print OVER its provider chip and no grep in the plan could see it. Measured against the BASE sha in real Electron 43: at 14px the name's box is squeezed to 81px (1280/1024) / 69px (800) against 84px of ink, so it spilled dx 3 / dx 15 and at 800x600 crossed 7px INTO the Claude Code chip; in the catalog list it reached dx 98 with a 0px box. 01-14 handoff trap 4 exactly (flex:1 + minWidth:0 beside flexShrink:0 siblings). Fixed at source in its own commit af8f202 with UI-SPEC containment step 1's own cited house pattern (nowrap + overflow:hidden + textOverflow:ellipsis, AgentCard.tsx:223-224). The same three properties also close a pre-existing 30px BASE spill on the catalog name — reported, not claimed as this plan's.
- [Phase 01-19]: the SkillsTab CATALOG row residual is containment step 3 and was REPORTED, not fixed. At 14px the two flexShrink:0 chips are sized by unbounded catalog content and exceed the 368px column on their own (170+242+16 = 428), so the row spills up to 61px and the name box goes to 0. Step 2's container integer is sidebarWidth in store/store.ts, outside this plan's file set (T-P19-06), and raising it cannot close a class whose width is content-driven. 'If the answer looks like redesign it, it is option 3.'
- [Phase 01-19]: ELECTRON_RUN_AS_NODE=1 was exported in the executing shell, and with it set every electron.launch() starts a bare Node with no app object. Stripped inside both probe runners — the same fix e2e/smoke.spec.ts already carries in sandboxEnv(). Recorded because 'the probe would not start' and 'the probe found nothing' are indistinguishable in a SUMMARY.
- [Phase 01-19]: App.tsx is the SHELL, so it was measured in the SHIPPED APP (out/main/index.js) at 1280/1024/1023/800 across two shas, not in the component harness. That is the only way plan 12's collapse could be verified at its EXACT boundary: the toggle is absent at 1024 and present at 1023, labelled 'show panel', aria-expanded=false, aria-label NULL (the visible label IS the accessible name) and 14px — identical at BASE and HEAD. The first shell run reported a perfectly clean sub14=[] while the window was still showing the hive picker; asserting stillPicker===false is what made the number real.
- [Phase 01-20]: TerminalView's own xterm fontSize 13 -> 14 as a NUMERIC literal, against the plan's 'do not touch xterm configuration'. The carve-out enumerates ASSIGNMENT sites and missed a CONSTRUCTOR option; more importantly its predicate ('terminal sizing is user-controlled') is FALSE at that site -- no zoom hook, no store read, 13 hardcoded. Not a glyph, so it could never carry the aria-hidden a Rule 0 entry needs, and T-P20-06 (changing USER-CONTROLLED sizing) has no user control there to break. Numeric because xterm cannot parse a var(), the 01-18 Monaco constraint. Stated honestly: the file has ZERO importers, so no probe can observe it render.
- [Phase 01-20]: THE HEADLINE -- the sweep spilled the sidebar tab strip 98px past its 420px rail at 1280, 1024 AND 800, and every grep in the plan passed. Four Press Start 2P tabs at Rule 1's 14px need 518px, and flex:1 does NOT save it: a flex item's min-width is auto, so each button refused to shrink below its own content and the row grew past its parent (01-14 trap 4 in its second form). Found ONLY by building BASE 5a6234c into a second bundle (M1 over it = 75, the right bytes) and running the identical CDP probe: BASE overflow 0 on all 27 scans, HEAD 98 on 18. Fixed at source in its own commit 4dfa405.
- [Phase 01-20]: fixed with UI-SPEC containment step 1, NOT step 2, and the reason is arithmetic -- the rail is sidebarWidth, clamped 320..1200 in store/store.ts, so NO container integer makes four 14px Press Start 2P labels fit at every width the splitter permits. minWidth:0 + overflow:hidden + whiteSpace:nowrap (style-only; JSX element multiset byte-identical for plan 22). Residual is step 3 REPORTED: TERMINAL and MESSAGES clip 17px each at the default 420. Zero container integers were changed in this whole plan.
- [Phase 01-20]: the plan mapped ONE mixed-consumer hoisted object; live source has TWO. FullscreenFileEditor's chip has THREE consumers not two (:103 the mode toggles via spread, :111 'open in IDE', :119 the glyph), and PtyTerminalView's zoomBtnStyle is a SECOND, undeclared one serving both exempt glyphs AND the {fontSize}px readout AND the exit-fullscreen icon. Allowlisting either declaration would have held four pieces of real text below the floor with every grep green -- T-P20-03 at a site the plan never named. A hoisted object's consumer list is grepped from live source, never taken from the plan (01-18).
- [Phase 01-20]: the app's LAST unnamed button was AgentDetailPanel's kill PixelButton -- icon-only, no title, no label, EMPTY accessible name on the AX tree at BASE and at HEAD. Pre-existing, but this plan's file and its truth 2. Named via title, not aria-label, because PixelButton's props are a closed set plan 23 pins byte-identical. unnamedButtons 1 -> 0 on all 27 AX-tree scans. Read off Accessibility.getFullAXTree, never off a grep.
- [Phase 01-20]: FLOOR-12's arithmetic CLOSES -- repo-wide M1 604 -> 16 occurrences, and every one of the 16 is a span with aria-hidden='true' holding a single decorative glyph with its own local fontSize. Attribution: 01-14 five, 01-17 four, 01-18 three, 01-20 three, 01-19 one, 01-15/01-16 zero. Reconciles exactly with 01-14's handoff (567 handed out + 5 kept = 572; wave 7 kept 11; 5+11=16). Repo-wide M1d is 0. The plan forbade a repo-wide total because five wave-mates were concurrent -- that premise is factually absent in a sequential run, so the number is stable, not stale.
- [Phase 01-20]: ToolWaterfall's success/failure glyph takes NO Rule 0 exemption -- UI-SPEC's Rule 0 applies only to its frozen 30-candidate M3 set and this file is not in it (01-17's IntegrationsRegistry ruling). It is also the row's only success/failure signal, so it is swept to the token and given role='img' + aria-label rather than aria-hidden; aria-label on a bare span announces nothing in Chromium. Its status box needs exactly its 12px at 14px -- zero headroom, measured delta 0, reported rather than silently widened.
- [Phase 01-20]: 10 of 23 components could NOT be mounted by driving the real app and are metric-measured only (real Chromium measureText against the source container integers; 17 cases, 0 over, at three viewports). THREE have no live entry point at all: TerminalView has zero importers, and FullscreenFileEditor plus the CodeEditor inside it are reached only through setFullscreenFile, whose sole caller FilesTab.tsx has been dead since v0.3.4. Dead renderer code a later phase should wire up or delete.
- [Phase 01-21]: ESLint 9, not 10, and the reason is this repo's OWN engines field - `>=20 <23` admits Node 20.0-20.18 and 22.0-22.12, which ESLint 10 (^20.19.0 || ^22.13.0 || >=24) refuses to run on. A gate a contributor cannot run locally is the defect FLOOR-16 exists to close. npm flags the ENTIRE 9.x line deprecated (identical message on 9.39.1 through 9.39.5 - a maintenance-tag support policy, not a security advisory); recorded as a cost with its upgrade path (widen engines first) in deferred-items.md, not hidden.
- [Phase 01-21]: assumption A1 closed by INSPECTING the installed plugin, not its README - eslint-plugin-react-hooks 7.1.1 exposes 29 rules and configs.flat.recommended carries SIXTEEN of them (recommended-latest seventeen): the two wanted rules plus fourteen React Compiler rules, most at 'error'. Amendment B was load-bearing, not cautionary. The two rules are written longhand, no preset is spread anywhere, and the surface is pinned by a test asserting through ESLint's OWN resolver - proven RED against a real `...configs.flat.recommended` spread, which a grep of the config source cannot see.
- [Phase 01-21]: RESEARCH Open Question 1 CLOSED - the whole tree produces NINE findings, not hundreds. Five of the nine ARE the orphaned comments (4 x 'Definition for rule not found' at ERROR + 1 unused directive); four are real. Amendment D decided all nine suppressions by RESOLVER, never by reading code: 8 kept live, CompletionToast.tsx:80 deleted on a pasted 0 (its true explanatory comment kept, only the dead directive line removed). Of the four real findings ONE was fixed at source and three were suppressed with a reviewed reason, because in each the rule's own remedy IS the defect.
- [Phase 01-21]: the useHive exhaustive-deps finding was a REAL stale-closure bug, not a lint nit - labelOf resolved Claude account labels from a config object captured inside an effect keyed on onboardingComplete, which flips once at first boot and never again, so a renamed or newly ADDED account was reported by raw id ('switching to acc_7f3a...') forever. Fixed with a latest-value configRef mirrored in its own effect, NOT by adding the dependency the rule asked for: that effect owns two long-lived IPC subscriptions and re-running it tears them down mid-failover. The finding is gone because the dependency is gone, not because it was suppressed.
- [Phase 01-21]: three suppressions beyond the original nine, each because the rule's OWN remedy introduces a defect, and each naming the rejected alternative: agentGroups.ts:122 (the memo reads a module-level async cache repoKeyOf/repoLabelOf fill, so 'unnecessary dependency repoVersion' is the only thing that rebuckets when the git lookups land - dropping it re-merges two checkouts sharing a basename); useHive.ts:480 (adding `config` respawns the ORCHESTRATOR on any settings change); OfficeFloor.tsx:1805 (mountIdRef is a mount-generation counter and bumping the LIVE ref is the point - the rule's 'copy it to a variable' advice is exactly what breaks it). Zero rules-of-hooks errors existed, so none was suppressed.
- [Phase 01-21]: the lockfile was written and verified under portable Node v22.23.2 / npm 10.9.8 - OVERRIDING the plan's 'the npm 10 rule is dead, do not reinstate it' clause. The plan withdrew that rule on the premise 'no Node 22 is installed on this host', which is no longer true; the repo's own history says otherwise (f8664dd 'regenerate the lockfile with npm 10, not npm 11'); and the stricter option costs nothing. All three of the plan's own discriminating checks were run and pasted as well: lockfileVersion 3, npm ci --dry-run --ignore-scripts exit 0, npm ci --ignore-scripts exit 0, and the sha256 of the lockfile npm ci consumed equals the committed one.
- [Phase 01-21]: issue #36 left OPEN - 3 of its 4 Fix clauses are closed (dependabot+audit pre-existing, ESLint by this plan, the duplicate tools/copy-main-assets.cjs already gone) but clause 4 is not: slack.ts:191/210 and webhook.ts:257/276 still each carry a private listen() and openTunnel(), and both repeat the same ERR_REQUIRE_ESM note. Neither file is in this plan's bound and no phase-1 plan owns that work, so the plan's 'issue #36 closes in this PR' criterion is unsatisfiable on correct work. Per-clause evidence comment posted instead (issuecomment-5372297276) - the same call 01-03 made on #18 and 01-11 on #10.
- [Phase ?]: [01-23]: Phase 01 is reported PARTIAL. 10 of 23 requirements close; 13 do not; ZERO GitHub issues were closed because main is at 19dbdfb with electron ^32.2.0 and all 152 commits sit behind draft PR #77. Closing an issue is a public statement about the SHIPPED product; a requirement checkbox is a statement about the milestone branch. Two bars, stated so they cannot drift.
- [Phase ?]: [01-23]: the FLOOR-12 allowlist is a content-keyed {file, text, count} multiset compared for exact equality, never a file:line array - and BOTH halves of that choice are proven by MUTATION rather than argued. A line inserted above an allowlisted site keeps the suite green (exit 0); a new fontSize: 9 turns it red and the failure NAMES the site. 16 occurrences, 16 entries, summed count 16, reconciling exactly with 01-14's handoff arithmetic (567 + 5 = 572; wave 7 kept 11; 5 + 11 = 16).
- [Phase ?]: [01-23]: title counts as an accessible-name source in the icon-only rule, and PixelButton's byte pin was HELD rather than taking the two-line aria-label fix three plans filed against this one. Its props are a closed set, but 01-16/01-20 measured title live on Chromium's AX tree (unnamedButtons 0 across 27 scans), so FLOOR-12's accessible-name clause is SATISFIED - the prop is an ergonomics upgrade, not a gap. Breaking the pin in the last plan of the phase, with no operator present, would invalidate 01-12's native-button decision and every wave-7 naming call to buy nothing the requirement needs. Live: 128 button + 155 PixelButton, 38 icon-only, 0 unnamed.
- [Phase ?]: [01-23]: D-47's fresh-context adversarial re-verify could NOT be run - this executor has no subagent-dispatch tool - and is recorded as MEASUREMENT UNAVAILABLE rather than substituted with a self-report dressed as one. D-43's mechanical per-clause bar was run in full and is what decides; D-47 was always an ADDITION to it, never a substitute.
- [Phase ?]: [01-23]: the M1x carve-out is per-hit, never a count. 17 expression-valued hits (not the 18 the plan predicted), each classified: 5 are the terminal carve-out (terminalPool.ts plus THREE term.options.fontSize assignments in PtyTerminalView - three, not four - plus :133 which feeds one), and 12 evaluate to a minimum of exactly 14. terminalFontSize.ts is correctly NOT a carve-out entry: grep -cE fontSize returns 0, so naming it would have sent an executor hunting for a phantom.
- [Phase ?]: [01-26]: C-1 resolved by MEASUREMENT, not the directive's letter — (a) restores 10 of C-1's 15 shapes, not all 15, so the ship is (a) plus (b)'s declaration discipline: sk-ant-/sk-proj-/sk-svcacct- unbounded, only the bare sk- residue carrying the word boundary, and the residual 5 shapes DECLARED in truths[0], in a pinned C1_DECLARED_LOSS block and in the source ceiling. Pure (b) measured strictly worse (15 lost) with identical false-positive behaviour.
- [Phase ?]: [01-26]: Pattern 5 is byte-frozen against a constant, and non-subtraction is a property of STATEMENT ORDER — the two sk_/rk_ arms run as their own statements AFTER pattern 5. Measured: appended inside pattern 3's alternation they lose 5 of 38 rows and leak 20 bytes of a following sk-ant- key; the same prefix fix with an in-alternation append still loses the swallow row.
- [Phase ?]: [01-26]: A security control that trades a detection must declare the trade in three places — the plan's truths, a pinned test, and the source ceiling. An undeclared trade is the defect class this phase exists to remove; a declared one is a legitimate engineering choice.
- [Phase 02-01]: hive.ts split for the seam PARITY-01a/02 and DAEMON-04 need, not for testability (D-07) -- five test files already loaded it under node --test — STRUCT-02's real justification is that later plans must touch the router/installers/templates and this phase opens that seam regardless
- [Phase 02-01]: GitCommitter extracted by composition (ADR-0004 shape A), never free functions — six runtime call sites (test/hive-durability.test.cjs, test/engine-parity.test.cjs) call HiveManager.flushCommit(root) directly; free functions would break all six and violate the single-committer invariant the moment a second caller imports them
- [Phase 02-01]: GitCommitterDeps injects root/log/redactSecrets as plain functions rather than importing back from hive.ts — keeps gitCommitter.ts electron-free with zero circular-import risk, mirroring DeliveryDeps' style
- [Phase ?]: FloorDeps needs focus/syncKeepAwake/respawnCore/startWorkerWatcher beyond the plan's 7 named fields
- [Phase ?]: bootstrapHiveServices() ran from 3 places (whenReady, config:update onboarding transition, config:changeHome failure recovery) against the ALREADY-CONSTRUCTED floor; split bootFloor's tail into a separately-exported startHiveServices() so re-invocation re-arms instead of leaking the old listeners/timers
- [Phase ?]: 01-21 lint-gate precondition verified against HEAD's own ancestry (git merge-base --is-ancestor), not literal main:eslint.config.js -- this project's milestone branching strategy keeps main 203 commits behind for the whole milestone
- [Phase ?]: Fixed a real pre-existing race condition in IntegrationBroker/TelemetryCollector: server was assigned inside the async listening callback, so stop() racing an in-flight bind leaked the socket forever -- now assigned before listen()
- [Phase 02]: DAEMON-01 and STRUCT-01 left Pending in REQUIREMENTS.md after 02-03 — DAEMON-01's own 02-VALIDATION.md manual-verification row states unit/composed evidence alone is not a pass for criterion 2, and no live Electron GUI session was available this session; STRUCT-01 names five seams and 02-03 closes only agent-lifecycle -- workers and IPC remain fully inside index.ts
- [Phase 02]: Task 5's lifecycle.ts extraction was real work, not a no-op — 02-02 had already relocated the four teardown functions into boot.ts, but as private closures over module state, not the AgentTeardownDeps-injected shape STRUCT-01's tests require -- the dependency-injection extraction itself was still the whole task
- [Phase 02]: terminalWorkOrderPrompt moved into the EXISTING src/shared/queueDelivery.ts, not a new file — deliberate deviation from 02-PATTERNS.md:35 -- queueDelivery.ts already owns every way a renderer may touch the main-owned queue, and a terminal work order is exactly that kind of object
- [Phase 02]: DAEMON-05: the tunnel closes via a spawned cloudflared child + procKill.hardKillTree, not the deleted tunnelmole library call — tunnelmole exposed no process handle to close; running the tunnel as a child process makes the OS process handle the disposer the library never gave
- [Phase 02]: DAEMON-05's off-by-default clause is structural, not a config check: start() opens no tunnel at all — a tunnel exists only where an operator action passes an opener into startTunnel(), so no other feature can bring the public origin up as a side effect
- [Phase 02]: PARITY-01a's kimi bridge ships LIVE-UNVERIFIED (no Moonshot account on this machine); zero engines converted for PARITY-02 (BridgeDescriptor is mutually exclusive, hooks XOR proxy dispatch); PARITY-03's marker ledger pinned exactly at 14 sites across 5 files, driven red four ways. — D-33/D-34/D-35/D-40 all required the ruling and the pin to be written in source and driven red before being trusted, not merely asserted in the plan.
- [Phase 02-05]: phoneArmed()/mintEnrollment() landed in task 2's commit (not task 3's) — task 2's own acceptance criteria need an armed state to test the 200/dark-404 split, and the plan's own action text already says task 2's branch reads phoneArmed().
- [Phase 02-05]: The /phone/api/** auth lockout is one shared counter across enroll+asks+answer, not scoped to /enroll alone — a brute-force attacker can guess bearers exactly as cheaply as enrollment tokens.
- [Phase 02-05]: None of DAEMON-02/03/05 marked complete in REQUIREMENTS.md: DAEMON-02/05 are shared with 02-09/02-10 (not landed); DAEMON-03's live half is operator-supplied and its stated purpose has no phone UI to exercise until 02-09/02-10 land.
- [Phase ?]: PARITY-01b and DAEMON-04 flipped complete after 02-06's closeout (last declarer of both)
- [Phase 02-08]: kimi is no longer this plan's NO-MAIL roster example — 02-07's inbox bridge landed first, so copilot is used instead for the capabilityLine() gap-carrying test case (canReceiveInbox permanently false, D-32/D-33/D-34)
- [Phase 02-08]: an absolute roster-length assertion in a test embeds os.tmpdir()'s path length, which varies by machine/CI runner — strip the volatile preamble before comparing, or measure the SAME reused home directory for both before/after loads, never hardcode a raw byte count
- [Phase 02]: 02-09: DAEMON-02 lands as a localhost-verified auth path, deliberately not flipped [x] — no physical Android device was used this session, and the requirement's own text names a real device as the honest completion bar.
- [Phase 02]: 02-09: R-push (a VAPID-key route + subscription-intake callback) is ABSENT from src/main/webhook.ts. push.ts ships fully unit-verified (VAPID + RFC 8291 aes128gcm, node:crypto only) but is wired to no route — named for plan 02-12's honesty ledger, not silently dropped.
- [Phase 02]: 02-09: plan 02-05 already added the packaged/dev static-root resolver (as phoneRootPath(), not the phoneStaticDir() name this plan's own draft text used) and already widened the zero-endpoint guard for the phone in three places (traced to commit 8577748). This plan changes neither and does not rename the working symbol to match its own draft.
- [Phase 02]: [02-10]: DAEMON-05 left OPEN -- environmental DNS blocker (LAN resolver cannot resolve freshly-minted *.trycloudflare.com hostnames) re-confirmed live this session, plus a newly-discovered tunnel:start/phone:pairing circular dependency for zero-webhook-trigger installs (tunnel:start refuses with 'no enabled webhook endpoints' because phone:pairing itself requires the tunnel already open) -- documented, not patched (outside this plan's declared files, a genuine trust-boundary design question).

### Pending Todos

- **Operator decision, Phase 3 ordering — RESOLVED at the Phase 3 close (plan 03-09, D-05).**
  Numeric order was kept, and the re-verification is no longer a prose line: **the post-Phase-5
  re-verification phase now exists in ROADMAP.md with a real id**, carrying the two skeptic
  tests verbatim, and the GSD phase was renumbered one later in the same edit across
  ROADMAP.md, REQUIREMENTS.md and this file. SCALE-01 and SCALE-03 stay Pending in
  REQUIREMENTS.md with that new phase named as their owner. See "Blockers" below.

### Blockers/Concerns

- **[01-18] OPERATOR VISUAL CHECK OUTSTANDING — MEASUREMENT UNAVAILABLE.** A human must open the git
  tab, the triggers tabs and the IDE panel (with a diff open) in the dev app and confirm nothing is
  clipped, `load older…` is legible, and Monaco's own font looks right. Everything a machine can
  measure was measured (33 mounted surface-scans, three real viewports, two shas, per-node computed
  font sizes + overflow deltas + AX-tree names). Truth 1-5 are SATISFIED on that evidence; the human
  eye on finished pixels is NOT claimed.

- **[01-18] The 424px default IDE file-tree width is a visible product change.** At 800x600 the editor
  drops to 376px. It is the smallest value satisfying UI-SPEC's containment ladder without a forbidden
  reflow, and the splitter can drag it back — but it deserves an operator look.

- **Phase 3 has two forward dependencies** (found while extending the roadmap; not resolved by
  moving requirements, because the pull-forward cascades):

  - **SCALE-03 — blocker LANDED, and the original diagnosis was wrong.** The claim that
    `LOG_ROTATE_BYTES` "rotates at 8 MB keeping one generation, so a busy day replays as a
    window" is refuted: that rotate (`hive.ts:375`, not the long-cited `:267`) has **never
    fired** in measured use. The real wall was `LOG_TAIL_BYTES = 64 KB` (`hive.ts:383`), a
    *read* cap 128x tighter — at 137,099 bytes `logTail()` had already lost the morning while
    the rotate stayed dormant. RECORD-02 (Phase 4) has since landed the durable store
    (`PersistStore.eventsBetween`, `db.ts:450`; `EVENT_RETENTION_MS` = 30 days, `db.ts:70`),
    so **the replay bound is now retention, not rotation**. The skeptic test as written ("pick
    a day whose log passed 8 MB") can never fire and is restated in the new phase.

  - **SCALE-01 — blocker NOT landed.** Isolation is still enforced by a `--wing` flag the agent
    supplies and could simply omit; RECALL-02 (Phase 5) is unrun, so isolation remains
    cooperative rather than enforced. RECALL-02 alone is also **not sufficient** — it is
    memory-only, so this criterion's task-ledger half is net-new work for the re-verification
    phase under either ordering.
  Neither was checked off in Phase 3. Both are owned by the post-Phase-5 re-verification phase.

- **Phase 2 is the largest single-phase risk.** Mitigated by making STRUCT-01/02 the phase's
  internal gate, but the mitigation only works if it is honoured at plan time.

- **PARITY-03 (Phase 2) and GATE-04 (Phase 4)** both need the pi/opencode/crush/qwen CLIs with
  real accounts. Operator-supplied; each engine needs its own subscription, which this project
  does not have. Bridges stay marked `live-unverified` otherwise, and GATE-04 ships enabled only
  for the engines actually exercised.

- **DAEMON-02 (Phase 2)** needs a real Android device on the network for its last mile;
  otherwise a localhost-verified auth path, recorded as such.

- **REACH-02 (Phase 7)** needs an AWS account with Bedrock model access; **REACH-03 (Phase 7)**
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
- TASK 4 OF 01-12 IS OUTSTANDING and 01-12 does NOT claim it. The plan's seven-step operator checkpoint (checkpoint:human-verify, gate=blocking) was NOT run: nobody launched the dev app, spawned a Claude agent with auto mode on, toggled it off without restarting, spawned a custom-provider agent, tabbed at the chip, or dragged the window under 1024px. MEASUREMENT UNAVAILABLE - it is an interactive GUI observation on a live Electron window and the operator was not available this session. What IS proven headless: 19/19 unit tests with 5 RED controls, typecheck 0, npm test 0, six CI jobs green at 11da0c9 (ubuntu/macos 507/507/0 fail/0 skipped, windows 507/503/0 fail/4 skipped), E2E green locally and in CI against real Electron 43, and the SHIPPED bundle out/renderer/assets/index-*.js carries all three AUTO chips with BYTE-IDENTICAL style objects, the sidebarLayout function with SIDEBAR_COLLAPSE_WIDTH=1024, the whole resize->vpWidth->sidebarLayout->render chain, and the toggle rendered AFTER the overlay at zIndex 2. The untested link is a human looking at it. Owner: operator, before plan 23. Plan 23 must not tick FLOOR-01 or FLOOR-13 on bundle evidence alone.
- D-22 RESIDUAL, NO OWNER: the hive:tasks row fields tokens/budgetTokens/pct that 01-09 minted are STILL unread by every renderer file at 11da0c9 - grep -rn budgetTokens src/renderer and grep -rn '\.pct\b' src/renderer/src both return 0, unchanged from B-sha 471a9e2. 01-09-SUMMARY says the consumer 'is FLOOR-13's job' citing 01-RESEARCH:610, but 01-UI-SPEC (later, and verified against source) CORRECTS that: FLOOR-13's cost clause already ships and rides useFleetTelemetry, and the D-22 widening's consumer is the budget/cap meter, which is FLOOR-10 and landed in MAIN at 01-10 (hive.budgetForAgent -> runBreakerBeat, index.ts:1613). 01-12-PLAN accordingly specifies nothing for it and its gap list is 'exactly two: auto mode in all three, model on the card'. Building a per-task budget meter here would have needed TasksKanban.tsx, outside files_modified, and would have failed this plan's own containment criteria. So the three fields are live on the channel with no renderer consumer anywhere. Either a later plan wires them or 01-09's widening is dead weight to revert. Plan 23 must adjudicate; do NOT read it as closed by 01-12.
- 01-12-PLAN TASK 2's containment criterion is a COPY of TASK 3's: it omits three of task 2's own declared files (src/renderer/src/store/autoMode.ts, FullscreenTerminal.tsx, CommandCenterPanel.tsx) and includes two that belong to task 3 (App.tsx, sidebarLayout.ts). As literally written no single commit carrying task 2's <files> can satisfy it. Handled by splitting task 2 into two commits along a real seam (9abdbcd = the derivation + the two roster rows; dc4703a = the card chip + the App publisher + the tests) so the criterion is genuinely evaluated rather than vacuously skipped, AND by additionally running a plan-wide form over ALL THREE commits against the frontmatter's seven files_modified. Both forms print nothing. Any later plan copying this criterion shape must fix the path list first.
- HANDOFF TO 01-14 (wave 6) - preserve these exact edits; AgentCard.tsx and FullscreenTerminal.tsx are in BOTH plans' files_modified. AgentCard.tsx: (a) imports useSyncExternalStore, useStore, {agentRowForCard,isAutoModeAgent,getLiveAutoMode,subscribeLiveAutoMode} from @/store/autoMode and {shortModel} from ./FullscreenTerminal; (b) three derived consts row/liveAutoMode/autoMode after noteFirstLine; (c) the root aria-label now folds the auto-mode clause in - do NOT drop it, the chip is aria-hidden so that label is the ONLY announcement; (d) the AUTO chip span in the identity row after BOSS, already written at var(--cth-text-display-md)/var(--cth-lh-display-md) - do not sweep it and add no numeric literal (B-fontsize must stay 7, B-rolebutton 2); (e) the model span BEFORE the cost span at var(--cth-text-body-sm)/var(--cth-lh-body-sm), also already tokenised. FullscreenTerminal.tsx: (a) useSyncExternalStore in the react import; (b) the @/store/autoMode import; (c) shortModel is now EXPORTED - AgentCard imports it, so un-exporting it breaks the card; (d) SidebarRow gained liveAutoMode/autoMode right after 'const typing'; (e) its aria-label folds the auto clause in; (f) the AUTO chip sits between the name span and PixelBadge. 01-14's sweep raises --cth-text-display-md 12->14 and --cth-text-body-sm 13->14, which is exactly what both new elements are written against.
- PRE-EXISTING, found by 01-12, NOT fixed (SettingsModal.tsx is outside files_modified): App's config state is never refreshed after a Settings save. SettingsModal.toggleAutoMode (SettingsModal.tsx:216) calls window.cth.updateConfig({autoMode}) and nothing pushes the new config back to App - only AddAgentModal carries onConfigChange={setConfig}. So App.tsx:285's title-bar text 'auto mode on'/'auto mode off' is ALREADY stale after a Settings toggle until relaunch, and 01-12's published live toggle inherits exactly that staleness. It affects ONE arm of the auto-mode derivation - opencode - and no other provider, because every other provider answers from the agent's own command string. opencode's bypass is itself baked at spawn (OPENCODE_CONFIG_CONTENT), so the live toggle was always an approximation there. Closing it properly means pushing config back from SettingsModal or recording the spawn-time value on the Agent shape.
- 01-13 FLOOR-14 PARTIAL: the Settings UI notification copy still over-claims. src/renderer/src/components/SettingsModal.tsx:1008 says 'Native toasts when an agent finishes or needs your input.' with no platform qualifier - the exact defect 01-13 must_haves truth 5 names. That file is NOT in 01-13's files_modified (owners: 01-10 wave 5 landed; 01-15 wave 7 is a fontSize/a11y sweep that will not touch copy), so editing it would have broken 01-13's own containment criteria. README carries the qualifier; the UI does not. Needs an owner before ROADMAP criterion 4 can read TRUE.
- 01-13 MEASUREMENT UNAVAILABLE (2 operator-only checks). (a) FLOOR-14 end-to-end on screen: an operator must block a real non-Claude agent on an approval prompt, see exactly one Windows toast, and click it to confirm the agent is focused. Automated as far as it goes - the main-side path is proven by test/hooks-notify.test.cjs (6 pass, 5/5 RED-controlled) and the OS layer is proven live on this win32 host (Electron 43.4.1, Notification.isSupported() true, toast constructed+shown+click handler registered, no throw). What no test can reach: that Windows actually DREW it (Focus Assist / per-app notification settings can suppress it) and that the click focused the agent in the running app. (b) FLOOR-18 live Codex spawn on Windows: no Codex subscription on this machine. The no-subprocess-timeout half is proven structurally - the win32 early return is the first statement of enableCodexRemoteForSpawn, ahead of both awaited codex subprocesses - and the capability clause is proven by capabilityLine('codex') returning 'REMOTE CONTROL unavailable on Windows' on this host.
- FLOOR-12 must_haves truth 3 is PARTIAL at 01-14 and 01-14 does NOT claim it. ThoughtBubble.ts:22 and ToolBubble.ts:29 carry FONT_SIZE = 14 exactly as UI-SPEC Rule 3 pins, but both classes render their Pixi Text inside a container held at RENDER_SCALE = 0.5 (ThoughtBubble.ts:76, ToolBubble.ts:71) and every on-screen dimension is computed as bgW * RENDER_SCALE (ThoughtBubble.ts:163-165), so the DESIGNED on-screen text size is 14 * 0.5 = 7px - it was 6px before. Reaching a true 14px needs FONT_SIZE / RENDER_SCALE = 28 in inner space, which at WRAP_WIDTH 288 drops the bubble from ~40 to ~17 chars per line and turns MAX_CHARS=160 into a ten-line cloud over an 18x28 sprite - re-geometrying MAX_WIDTH, MAX_CHARS and the overlap pass, which is UI-SPEC containment step 3 (stop and report) and a redesign the phase contract forbids. PLAN 23 MUST NOT read FLOOR-12 clause 4 as unconditionally true off grep -c 'FONT_SIZE = 14'. Also in deferred-items.md.
- 01-14 MEASUREMENT UNAVAILABLE (operator-only): nobody ran 'npm run dev' and LOOKED at the swept surfaces. What IS proven headless is more than usual - the Electron E2E smoke drives a real BrowserWindow, mounts the real agent strip and card, and its assertions FOUND and then confirmed the fix for a real zero-width-name defect, with live getBoundingClientRect and canvas measureText readings; the built bundle carries every token and every container integer; six CI jobs green at cea311e. NOT reached by any automation: a human looking at the fullscreen roster, the threads panel, the Pixi thought/tool bubbles and the note popovers at the new sizes. Owner: operator, before plan 23. Confirm (a) the 120px strip with 322px cards still reads as a dock, (b) fullscreen roster names truncate legibly at a narrow rail, (c) the 340px note popover, (d) the bubbles still fit their balloons. Plan 23 must not tick FLOOR-12's visual clause on bundle evidence alone.
- HANDOFF FROM 01-14 TO WAVE 7 (plans 01-15..01-20): the six file groups are recorded in .planning/phases/01-finish-the-floor/01-14-SUMMARY.md under the heading 'HANDOFF TO WAVE 7'. Verified programmatically at cea311e: ZERO overlaps between the files_modified sets of 01-14..01-20, all 60 remaining M1 files owned by exactly one plan, and 567 occurrences handed out + 5 kept by 01-14 (its Rule 0 allowlist) = 572, exactly the repo-wide M1 occurrence count after this plan. Per-plan totals: 01-15 129, 01-16 100, 01-17 110, 01-18 68, 01-19 85, 01-20 75. The plan's objective text says 'four disjoint file groups' - an arithmetic slip; there are six wave-7 plans and six groups. Token layer now: display-md/body-md/body-sm/mono-md/mono-sm all 14px, display-lg/body-lg 16px, and --cth-text-display-sm / --cth-lh-display-sm DELETED (a var() reference to either resolves to nothing; repo-wide refs are 0). The mono line-height token is --cth-lh-mono, singular - there is no -md/-sm pair.
- 01-14 WARNING FOR EVERY WAVE-7 SWEEP: a green grep is not a green pixel. Every acceptance criterion in 01-14 tasks 2 and 3 passed, typecheck was 0 and node --test was 515/511/0 fail/4 skipped, while the agent card shipped WITH NO NAME ON IT. Root cause: the identity row gives the name flex:1/minWidth:0 while every sibling is flexShrink:0, and a 'flex: 1 1 0%' item has a hypothetical main size of 0, so negative free space goes entirely to the siblings - when they refuse to shrink the flexible item is clamped to ZERO rather than truncated to an ellipsis. UI-SPEC containment step 1 ('nothing - nowrap/ellipsis truncates') is only true when the flexible item can actually reach an ellipsis. Found by npm run e2e against real Electron 43; fixed at SOURCE (AgentCard width 220 -> 322, the measured delta) in atomic commit cea311e. If your files have fixed-width chrome with flexShrink:0 siblings, run the app.
- 01-14 FOUND, NOT FIXED: ToolBubble's exported CLASS has zero consumers and is tree-shaken out of the shipped bundle. grep -rn 'ToolBubble' src --include=*.ts --include=*.tsx outside the file itself returns only ThoughtBubble.ts:3, which imports toolIcon alone, and 'class ToolBubble' does not appear in out/renderer/assets/index-*.js after npm run build. So ToolBubble.ts's FONT_SIZE is dead at runtime and its FLOOR-12 sweep is correct-but-inert. Deleting the class is not one of the six requirements and was outside 01-14's authorised action. Do not cite it as evidence that a 14px label ships on the floor. Also in deferred-items.md.
- 01-14 REPORTED-NOT-MET criterion, for the verifier: task 3's 'grep -c aria-label src/renderer/src/components/AgentStrip.tsx is greater than before this task' is UNSATISFIABLE on correct code and was deliberately left at 4 -> 4. AgentStrip has five controls - two icon-only buttons that already carry aria-label (:199 'Close note editor', :394 'Dismiss <name>') and three PixelButtons whose content is visible text - plus an input and a textarea that already have labels. Zero icon-only buttons lack a name across all four of this plan's files, so nothing was added anywhere. The only way to raise the count is to put an aria-label on a button with visible text, which overrides the visible label: the exact anti-pattern UI-SPEC bans. Same call as 01-04's CONTRIBUTING.md pin and 01-10's README non-rename.
- FLOOR-12's requirement row deliberately left Pending in REQUIREMENTS.md by 01-14, matching the 01-02/04/05/06/07/08/09/10/11/12/13 precedent: plan 23 owns the checkboxes. FLOOR-12 is not closeable at 01-14 in any case - 572 of the original 605 M1 occurrences are still outstanding and belong to plans 15-20. What IS closed here: completeness-bar clause 1 (tokens.css declares no --cth-text-* below 14px and display-sm is gone), DESIGN.md 4.1's self-contradiction, the boot-splash title, and clause 4 for the three UI-SPEC-named non-literal sites plus the six Rule 3b sites M1 structurally cannot see - with the Pixi RENDER_SCALE caveat filed above.
- SettingsModal.tsx:1008 COPY BLOCKER STANDS after 01-15 - not resolved, not dropped. The line still reads 'Native toasts when an agent finishes or needs your input.' with NO platform qualifier: 01-13's FLOOR-14 truth 5. 01-15 HELD that file and deliberately did not take it - its own must_haves truth 3 and its task-2 action text ('Change no copy, no layout, no colour, no spacing token') forbid copy changes, and 01-14's handoff says explicitly 'the blocker still stands and is NOT transferred to 01-15'. What 01-15 DID establish: the line is still at :1008 at 19d8051 (the sweep touched :1007, the fontSize on its enclosing span, and nothing on :1008), and it now RENDERS AT 14px - measured live in Electron 43, box 380x20. Legible, still inaccurate. The fix is one sentence appended to the existing description span, wording already in README.md:139-147, and it must add NO fontSize because 01-15 pins that file's M1 occurrence count at 0 and plan 23 asserts it. Owner: plan 23's wave-9 doc-claim sweep, or any earlier plan that legitimately holds SettingsModal.tsx.
- 01-15 MEASUREMENT UNAVAILABLE (operator-only): nobody ran 'npm run dev' and LOOKED at the swept Settings tabs. Automated further than usual - a real Electron 43 BrowserWindow, real getBoundingClientRect and canvas measureText, all seven Settings tabs at 1280x900 / 1024x768 / 800x600 (CDP Emulation.setDeviceMetricsOverride; setBounds and setContentSize were both MEASURED to leave window.innerWidth pinned at 1280, so the first two 'narrow' runs were silently a third wide run), reporting overflow=0, zeroWidth=0 and unnamedButtons=0 on 21 tab-scans, plus a 19/19 positive control proving every probed surface actually mounted. NOT reached by any automation: aesthetic judgement on the three widened boxes - whether the 203px nav rail still reads as a rail, whether the 18px 'i' circles still read as the same control, and whether the 84px webhook label column still reads as a column. Owner: operator, before plan 23. Plan 23 must not tick FLOOR-12's visual clause for this group on measured-geometry evidence alone. NOTE ALSO: npm run e2e never opens Settings, so NO committed test covers any of these five files at pixel level - plan 23's repo-claims M1 bar is source-level only.
- 01-15 CROSS-PLAN, FOUND NOT FIXED (measured live in the Settings modal, out of 01-15's file set): sub-14px text still RENDERING in Settings from five wave-mates' files. Modal.tsx 10px close glyph and UpdatesSection.tsx 8px/13px/12px (both 01-20); OfficeThemePicker.tsx 8px/13px (01-16); SetupPanel.tsx - 79 distinct sub-14px nodes on the Prerequisites tab, including 9px 'READY' verdict chips and 11px resolved binary paths, the densest and most legibility-critical sub-14px surface in the whole app (01-16); IntegrationsRegistry.tsx 8px/12px (01-17); realtime/DevicePicker.tsx 8px/12px (01-20); realtime/CostHud.tsx 8px/12px/11px (01-19). 01-15 touched of them - editing them would have broken its own containment criterion. 01-16 should measure the Prerequisites tab live. Also: SettingsHeroCard.tsx:141 renders a decorative star emoji beside visible text inside a PixelButton, so a screen reader says 'star star on GitHub'; it is NOT an M3 candidate and not a Rule 0 site, so 01-15 had no rule for it and deliberately left it.
- 01-15 REQUIREMENT ROW: FLOOR-12 deliberately left Pending in REQUIREMENTS.md, matching the 01-02/04/05/06/07/08/09/10/11/12/13/14 precedent - plan 23 owns the checkboxes. FLOOR-12 is not closeable at 01-15 in any case: repo-wide M1 is 443 occurrences / 55 files at 19d8051 (was 572/60 after 01-14), and the remaining 438 belong to plans 16-20 (100+110+68+85+75) with 01-14's 5 allowlisted entries making 443. What IS closed here: completeness-bar clauses 2 and 3 for this group's five files - M1 0, M1d 0, M1x 0, and an EMPTY Rule 0 allowlist, so allowlist size == post-sweep count == 0 in every file. test/repo-claims.test.cjs was NOT edited by 01-15.
- PixelButton cannot be given an accessible name by any caller (found by plan 01-16). Its props are a closed set with no aria-label and React drops unknown props, while Icon.tsx hardcodes aria-hidden -- so EVERY <PixelButton><Icon/></PixelButton> in src/renderer/src is an unnamed control. Proven live at base sha 6e13162 via CDP Accessibility.getFullAXTree: OnboardingWizard.tsx:582 reported accessible name "". Plan 01-16 named it via title (verified "Remove <path>" in the AX tree) because PixelButton.tsx is pinned byte-identical by plan 23 (bd286ebf5654a2647c93546dc135f608aeb5d0f0) and is outside 01-16's declared file set. ROOT-CAUSE FIX, two lines: add 'aria-label'?: string to PixelButtonProps and forward it onto the <button>, then convert :582 from title to aria-label. OWNER: plan 23, or any plan that legitimately holds PixelButton.tsx. Other wave-7 groups should grep their own files for the same shape.
- HivePicker.tsx:18 folderName() splits on '/' only, so on Windows a harness-home path renders as one ~45-character unbreakable token (C:\Users\...\Temp\p16-hive -> 'C:UsersATempp16-hive'). Measured by plan 01-16 in real Electron 43: with a Windows-shaped path the picker reports 7 overflows at 1280/1024/800; with a POSIX path, 0. PRE-EXISTING (it overflows at the old 11px too, reproduced identically at base sha 6e13162) and made ~27% worse by the 14px floor. NOT fixed by 01-16: it is a logic change, not a fontSize change, and 01-16's must_haves truth 3 plus its action text forbid it -- same grounds on which 01-15 refused SettingsModal.tsx:1008. OWNER: plan 23 or a follow-up.
- 01-17 FLOOR-13 CONSUMER RESIDUAL STILL UNOWNED. src/main/hive.ts:2049-2072 widens every hive:tasks row with {tokens, budgetTokens, pct} and grep -rn budgetTokens src/renderer/ returns NOTHING — zero renderer consumers, exactly as 01-12 reported. 01-17 held TasksKanban.tsx and EXPLICITLY DID NOT ABSORB IT: its requirements field is [FLOOR-12], its must_haves truth 5 forbids adding/moving/dropping fields on a card it simultaneously pins for overflow, and its per-file M1 occurrence count (1) is asserted by plan 23. Owner: plan 23, or any later plan that legitimately holds TasksKanban.tsx for FLOOR-13.
- 01-17 ARIA-LABEL ALONE ON A BARE <span> ANNOUNCES NOTHING — applies to every remaining sweep plan. UI-SPEC's FLOOR-12 copywriting contract specifies a bare aria-label on the % unit label (triggers/ui.tsx) and the ? waiting-on-you chip (TasksKanban.tsx). Chromium does NOT expose aria-label on an element whose computed role is generic, so the contract's literal wording ships an unannounced chip with every grep green. 01-17 added role="img" to both and proved it on the AX tree ({"percent":"image"}, {"Waiting on your answer":"image"}). Plans 18/19/20/23: any plan specifying a bare aria-label on a non-interactive span is specifying something that does not work.
- 01-17 OPERATOR VISUAL CHECK OUTSTANDING (adds to 01-14/15/16's). Not verified by a human: (a) the swept command centre, task board with an empty column, triggers form and Settings->Connections in the dev app; (b) CommandCenterPanel.tsx:761's WARNING glyph and :1542's TICK glyph, whose states (armed circuit breaker / open token-limit editor) are unreachable from a stub-engine sandbox, so both allowlist entries have SOURCE-LEVEL EVIDENCE ONLY; (c) the rendered-markdown preview (.cth-md-preview) at the new token sizes — the tokens are proven in the shipped CSS, the rendered result is not; (d) the two WebGL-failure banners in OfficeFloor.tsx, which by construction only appear when the GPU context is lost. Plan 23 must not tick FLOOR-12's visual clause on bundle evidence alone.
- 01-17 PIXELBUTTON aria-label BLOCKER REAFFIRMED (originally 01-16's). PixelButton.tsx is byte-pinned by plan 23 at bd286ebf5654a2647c93546dc135f608aeb5d0f0 and its props are a closed set with no aria-label, so no caller can name an icon-only PixelButton. 01-17 hit the identical shape at IntegrationsRegistry.tsx:392 (<PixelButton>✕</PixelButton>) and shipped the name via title, the one accname source the prop set exposes — plus four more PixelButtons whose label collapses to a bare ellipsis while they run. ROOT-CAUSE fix remains an aria-label prop on PixelButton. Owner: plan 23, which holds the pin.
- 01-19 CONTAINMENT STEP 3 — SkillsTab's CATALOG identity row overflows its column at Rule 1's 14px, and it is NOT fixed. src/renderer/src/components/SkillsTab.tsx:319-336. MEASURED in real Electron 43 at 1280/1024/800 with CDP setDeviceMetricsOverride, row 368px: the two flexShrink:0 catalog chips are sized by UNBOUNDED catalog content and at 14px exceed the column on their own — 'engineering' 170px + 'abubakarsiddik31' 242px + 16px gap = 428px, so the row spills 3/8/18/51/61px and the name's flex box collapses to 0. At BASE (11px) the worst pair was 320px and there was no row spill, so this is new with FLOOR-12. Step 1 does not apply (nothing on that row truncates); step 2 is unavailable — the only container integer is sidebarWidth in src/renderer/src/store/store.ts, OUTSIDE 01-19's declared files_modified (threat T-P19-06), and raising it cannot close the class because the chips are content-sized. So step 3: stop and report. The NAME spans themselves ARE fixed at source in commit af8f202 (nowrap+overflow:hidden+textOverflow:ellipsis, UI-SPEC containment step 1's cited house pattern at AgentCard.tsx:223-224) — measured: before the fix the name printed 7px INTO the provider chip at 800x600 and up to 68px in the catalog list. One-line evaluation for the owner: give SkillsTab's Chip (:24-34) the same truncation contract, or cap the rendered category/owner. Owner: plan 23 or a follow-up.
- 01-19 OPERATOR VISUAL CHECK OUTSTANDING — MEASUREMENT UNAVAILABLE (adds to 01-14/15/16/17/18's). A human must open the skills tab in BOTH modes (installed and browse), the workers tab, the memory panel, the memory graph, the message-queue composer, the ask-me tab and the cost HUD in the dev app, and confirm nothing is clipped and the sidebar collapse still works either side of 1024. Everything a machine can measure WAS measured: 57 mounted component scans (19 states x 3 real CDP viewports) plus 8 shipped-app scans at 1280/1024/1023/800 across two shas, with per-node computed font sizes, classified overflow and AX-tree accessible names. Truths 1-5 are SATISFIED on that evidence; the human eye on finished pixels is NOT claimed.
- 01-20 containment step 3 (REPORTED, not fixed): SidebarTabs' four tab labels at Rule 1's 14px need 518px; the sidebar rail is sidebarWidth, default 420 and clamped 320..1200 in src/renderer/src/store/store.ts. The 98px SPILL is fixed at source in SidebarTabs.tsx (minWidth:0 + overflow:hidden + whiteSpace:nowrap, rail 420 / scrollWidth 420 / overflow 0 measured at 1280/1024/800), but the labels now CLIP: TERMINAL and MESSAGES need 122px in a 105px tab (-17px each), TRACES -3px, GIT fits. No container integer fixes it at every width the splitter permits, and step 2's integer (sidebarWidth default 420 -> 520) is outside this plan's declared file set. Same integer 01-19 reported for the SkillsTab catalog row.
- 01-20: the operator visual check in the plan's <verification> is MEASUREMENT UNAVAILABLE. A human must open the dev app and confirm the file tree, an agent detail panel, the fullscreen file editor, the command bar, a terminal view and the updates section are unclipped, that 'open in IDE' is legible, and that terminal font sizing still responds to Cmd +/-. Everything automatable was automated: 27 CDP scans per sha at 1280x900/1024x768/800x600 over the shipped bundle at BASE and HEAD.
- 01-20: 10 of this plan's 23 components were NOT observed rendering and are metric-measured only (real Chromium measureText against the source container integers, all 17 cases fit at all three viewports): CodeEditor, CommandBar, CompletionToast, DevicePicker, ErrorBoundary, FullscreenFileEditor, RecentText, ReleaseDrop, TerminalView, UpdateToast. THREE of them have NO live entry point at all in the shipped app -- TerminalView has zero importers, and FullscreenFileEditor (and the CodeEditor inside it) is reached only through setFullscreenFile, whose sole caller is FilesTab.tsx, itself dead since v0.3.4. That is dead renderer code a later phase should either wire up or delete.
- [01-21] Issue #36 clause 4 is OPEN: slack.ts:191/210 and webhook.ts:257/276 still each carry a private listen()/openTunnel() plus a duplicated ERR_REQUIRE_ESM note. Not in any phase-1 plan's declared bound. Fix: lift both into one src/main/tunnel.ts helper taking { port, server }. Per-clause evidence comment posted at issue 36 (issuecomment-5372297276); the issue must NOT be closed until this clause lands.
- [01-21] ESLint is pinned to the 9.x line, which npm flags deprecated ('no longer supported') on EVERY 9.x version. It is a maintenance dist-tag support policy, not a security advisory, and the choice was forced by package.json engines '>=20 <23' (ESLint 10 needs ^20.19.0 || ^22.13.0 || >=24). Unblocking it is a package-wide change: widen engines.node to ^20.19.0 || ^22.13.0 || >=24 (.nvmrc=22 and CI NODE_VERSION=22 already satisfy it), confirm test/ci-config.test.cjs's '>=X <Y' engines parser still holds, then npm i -D eslint@10.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Memory | V2-05 knowledge **graph** | **Retired**, not deferred — RECALL-01…05 covers it; no query was found that an entity graph answers and FTS5 cannot | 2026-08-20 |

## Session Continuity

Last session: 2026-08-25T11:03:23.534Z
Stopped at: Phase 3 PLANNED and RED-TEAMED CLOSED. RED_TEAM_CLEAN=true, set 2026-08-25 on operator acceptance of 3 named residuals (recorded in 03-CONTEXT.md Red-Team Log) — NOT on a zero-finding round; that distinction is deliberate. 10 review rounds, every finding closed; 4 mechanical auditors pass; suite 830/823/0/7. Ready for /gsd:execute-phase 03 (Wave 0 creates 5 new test files). Phase 2 verification reads gaps_found (STRUCT-01) but does not gate Phase 3.
(16, then ~35, then 40+ findings; 15 BLOCKER in round 3). The step-11.5 iteration budget is
exhausted, so RED_TEAM_CLEAN stays false and auto-advance to execute-phase is blocked. The defect
rate did not converge and each round's fixes introduced new defects of the same class, so the
recommendation recorded in 01-CONTEXT.md's Red-Team Log is to RE-PLAN, not to patch a fourth time.
Decisive finding: GATE-01's qwen-sidecar fix is a no-op — PROXY_BRIDGE_SHIM never reads
HIVE_SOCK_TOKEN (3 of 6 shim templates do not), so the fix, its criterion and the wave-9 wholeness
assertion all pass while the tier stays dead-hooked.
filled in for all 71 v1 requirements and verified programmatically (71 mapped, 0 orphans,
0 duplicates)
Resume file: .planning/phases/03-scale-and-observability/03-CONTEXT.md
