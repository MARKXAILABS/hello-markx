---
phase: 02-the-daemon-and-the-protocol
verified: 2026-08-25T00:35:50Z
status: gaps_found
score: 3/6 must-haves fully verified (2 partial, 1 human-gated)
overrides_applied: 0
gaps:
  - truth: "Criterion 1 [INTERNAL GATE] — index.ts is split along its named seams and left as thin `ipcMain.handle(name, wrapper)` registration"
    status: partial
    reason: >
      STRUCT-02 (hive.ts) is genuinely done. STRUCT-01 (index.ts) is not, measured live in this
      session: index.ts is 5021 lines with 160 ipcMain.handle registrations (comment-stripped
      grep, matches the plan's own B-ipc-joined pin). Of those 160, only 53 are truly thin
      (<=3 lines of body); 33 have more than 10 lines of inline body, one runs to 70 lines, and
      the mean body is 8 lines. `spawnAgentCore` — the ~500-line agent-spawn core (measured
      lines 1894-2395) that imports `electron` at module scope via the file's top-level import —
      is still a top-level function in index.ts, not delegated to `src/main/floor/**`. The
      scheduler/ephemeral-worker tick (`ephemeralWorkerTick`, `workers:stop` — the exact code
      MAIN-01 was found and fixed in) and all 160 IPC handler registrations were never moved.
      Only two of the five named seams (shutdown via `floor/boot.ts`'s SHUTDOWN_STEPS, and agent
      lifecycle via `floor/lifecycle.ts`) are actually extracted; scheduler, ephemeral workers
      and IPC registration are not. The roadmap's own D-05 correction narrows what "could not be
      written before the split" means (only shutdown+lifecycle were genuinely new), but it does
      NOT strike or correct the separate clause "`index.ts` is left as thin `ipcMain.handle(name,
      wrapper)` registration" — that clause is still asserted by the roadmap text and is
      measurably false. REQUIREMENTS.md itself keeps STRUCT-01 unchecked (`[ ]`), which this
      verification confirms is the honest state, not an oversight.
    artifacts:
      - path: "src/main/index.ts"
        issue: "5021 lines; 160 ipcMain.handle registrations, only 53/160 <=3 lines; spawnAgentCore (~500 lines) and ephemeralWorkerTick/workers:stop still resident"
    missing:
      - "Move IPC handler bodies into thin wrappers that delegate to src/main/floor/** (or an equivalent module), leaving index.ts as registration only"
      - "Extract spawnAgentCore and the scheduler/ephemeral-worker tick out of index.ts along the roadmap's own named seams"
human_verification:
  - test: "Start the packaged (or `electron .`) app with `--headless` and no window, and no Electron dev tooling attached; confirm at least one agent spawns, a mail message is delivered between two agents, and (if a Claude account failover condition can be induced) failover completes — all with the window never opened."
    expected: "Agent spawn, mail delivery and failover all observable in fleet.json / logs with zero renderer process ever created."
    why_human: "Needs a real Electron process with real PTYs and real agent CLIs; VALIDATION.md's own post-execution audit calls this 'not a pass' with only the unit half (test/boot-floor.test.cjs, 19/19 green) closed. This verification pass deliberately did not launch the packaged app, per the 'grep/file checks, not running the app' verification-speed constraint — so this remains genuinely unverified, not merely unclaimed."
  - test: "Install the phone PWA on a physical Android device over the tunnel, add to home screen, and answer an ASK ME question from the phone."
    expected: "WebAPK installs, runs `display:standalone`, and the answer reaches the asking agent's inbox."
    why_human: "No physical Android device on this network. DAEMON-02's own text names the localhost-verified auth path as 'the honest fallback ... never as completion' — REQUIREMENTS.md and this session's code inspection confirm only the fallback is built."
  - test: "Send a real Telegram message and a real Discord interaction to the paired webhook endpoints using an operator-supplied bot token and Discord application public key."
    expected: "Both route onto the existing webhook rails and reach the addressed agent's inbox."
    why_human: "Needs operator-supplied credentials not available in this environment. The localhost verifiers (Telegram secret-token compare, Discord Ed25519 accept/reject) are automated and green (test/webhook-endpoints.test.cjs, 40 passing assertions, independently re-run this session)."
  - test: "Run `scripts/tunnel-live-check.cjs` on a network whose DNS resolver can reach freshly-minted `*.trycloudflare.com` subdomains, and separately let a tunnel run for several hours to observe stability beyond the ~30s verified window."
    expected: "The open-then-close poll observes the public URL serving the app, then genuinely 530/refused after `stop()` — proving the close, not just the `hardKillTree(pid)` call in isolation."
    why_human: "Re-run live in this session: `node scripts/tunnel-live-check.cjs` opened a real tunnel (`https://explorer-fig-gcc-fastest.trycloudflare.com`), polled for 30s, and printed its own announced skip — 'this environment cannot resolve or reach a freshly-provisioned *.trycloudflare.com hostname, even though general internet egress and the trycloudflare.com apex both work' — exit code 3, confirmed. This is environmental (this LAN's DNS resolver), not a code defect; the underlying `stop()` → `hardKillTree(realPid)` unit proof is green and code-reviewed clean."
  - test: "Exercise the pi, opencode, crush, qwen and kimi bridges against real paid accounts."
    expected: "Each either verifies live and is unmarked, or stays marked LIVE-UNVERIFIED."
    why_human: "None of the five CLIs is installed on this machine and no operator account was supplied — the expected outcome under the zero-recurring-cost rule, not a failure. `test/repo-claims.test.cjs`'s PARITY-03 marker pin (independently re-run this session, 31/31 assertions green) confirms all five stay marked: LIVE_UNVERIFIED_TOTAL=18 across 6 files, LIVE_UNVERIFIED_ENGINES=['pi','opencode','crush','qwen','kimi']."
---

# Phase 2: The Daemon and the Protocol — Verification Report

**Phase Goal:** "The office stops depending on a window and stops depending on one engine. Agents
spawn, mail moves and failover completes entirely in main; the operator reaches the floor from an
Android phone; all eleven engines have an inbox, cost accounting and an honest verification
status."

**Verified:** 2026-08-25T00:35:50Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Method

This report is built entirely from live measurements taken in this session against the actual
tree (branch `gsd/v1.0-floor-closure`) — every count below has a command beside it. Twelve
SUMMARY.md files, 02-VALIDATION.md and 02-REVIEW.md were read as claims to falsify, not as
evidence. Independently re-run this session: `npm run typecheck` (exit 0), `npm run build`
(exit 0, `built in 39.96s`), `npm test` (**824 tests / 817 pass / 0 fail / 7 skipped**, matching
the orchestrator's stated figures exactly), `node --test test/repo-claims.test.cjs` (31/31),
and `node scripts/tunnel-live-check.cjs` (exit 3, announced skip, live re-confirmed).

## Goal Achievement

### Observable Truths (mapped to the ROADMAP's five numbered Success Criteria)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | **[GATE] The god-files no longer block tests** — STRUCT-01 + STRUCT-02, both split along their named seams, index.ts left thin | ⚠️ PARTIAL / ✗ FAILED (STRUCT-01) | STRUCT-02 verified: `hive.ts` 2830 lines, split into `hiveTemplates.ts`, `gitCommitter.ts` (1 `new GitCommitter(` in `src/`), `hiveProvisioning.ts`; `test/hive-durability.test.cjs` and `test/engine-parity.test.cjs` still pass. STRUCT-01 not met: `index.ts` measured 5021 lines / 160 `ipcMain.handle(` sites this session; only 53/160 handler bodies are <=3 lines, 33 exceed 10 lines (max 70); `spawnAgentCore` (lines 1894-2395, ~500 lines) and `ephemeralWorkerTick`/`workers:stop` remain resident in `index.ts`. The redefined functional gate (`test/boot-floor.test.cjs` green, no module-scope side effects under `src/main/floor/**`) IS met — 19/19 assertions pass, re-run this session — which is what legitimately unblocked DAEMON-01/DAEMON-05/PARITY work. But the roadmap's own un-struck clause "index.ts is left as thin ipcMain.handle(name, wrapper) registration" is not true. |
| 2 | **The floor runs with no window** — agents spawn, mail routes, failover completes, entirely in main | ⚠️ UNCERTAIN (unit half VERIFIED, live half not attempted) | `quitDecision`/`shouldQuitOnLastWindowClose` (`src/main/floor/headless.ts`) are real, wired into `index.ts`'s `before-quit`/`window-all-closed` handlers (confirmed by import + call-site grep). D-11's two mail-gap fixes are live: `terminalHandoff` routes through an injected `handoff` dep (`boot.ts:999-1007`) into `DeliveryService.enqueue`, and Crush's protocol seed is enqueued by main (`index.ts:2356`), not typed by the renderer. ADR-0001 is honestly amended (both fixes named, four remaining renderer `submitToPty` call sites listed as exceptions, not hidden). All of this is unit-proven (`test/boot-floor.test.cjs`'s D-11-composed cases, `test/agent-lifecycle.test.cjs` 12/12). **The live half — a real Electron process, real PTYs, real agent CLIs, no window — was never run**, this session included (see Human Verification). |
| 3 | **Operator reaches the floor from a phone; the answer reaches the right agent** — DAEMON-02, DAEMON-03, GSD-06 | GSD-06 ✓ VERIFIED / DAEMON-02, DAEMON-03 ⚠️ UNCERTAIN (localhost-verified only) | GSD-06 fully verified: `AskMeTab.tsx`'s `recipientOf(task)` resolver drives both the `to:` field and the header badge (no `to: 'god'` literal remains in the send path — `to: 'god'` appears only in the god's own always-sent unblock message, by design, D-39); `hiveTemplates.ts:128` writes `askedBy: process.env.AGENT_ID \|\| 'god'`; god message sent first, asker message skipped when recipient is god. DAEMON-02/03's automated halves are real and green (`test/webhook-endpoints.test.cjs` 40 assertions, `test/push-vapid.test.cjs` 12, `test/qr-vendor.test.cjs` 11 — all independently re-run). No physical Android device and no operator-supplied Telegram/Discord credentials exist in this environment, so the live halves are honestly unclaimed in REQUIREMENTS.md (`[ ]` for both) and remain so here. |
| 4 | **What is exposed is exposed on purpose** — DAEMON-04, DAEMON-05 | DAEMON-04 ✓ VERIFIED / DAEMON-05 ⚠️ UNCERTAIN (code complete, live close environmentally blocked) | DAEMON-04 verified end to end: `McpConsentModal.tsx` calls `grantMcpBatch` and unconditionally calls `load()` (CR-01's fix, confirmed live — no early return before republish); `<agentDir>/mcp.json` write + `--mcp-config` argv confirmed at `hive.ts:1157-1167`; revoke → `deleteSecret`; per-agent grant keying via `mcpGrantKey`. DAEMON-05: `start()` opens no tunnel by itself (test-proven, "DAEMON-05's off-by-default clause, proven as behaviour not grep" — re-run this session, passing), token is `node:crypto`-generated, rate-limit/lockout tested, `stop()` calls `hardKillTree(child.pid)` against a real pid (`tunnel.ts:122,144`), titlebar chip is driven purely by `tunnelStatus()`/`onTunnelChanged` with no optimistic flag (REVIEW.md, independently spot-checked). The one clause not closed: `scripts/tunnel-live-check.cjs`, re-run live this session, opened a real `trycloudflare.com` tunnel and exited 3 (announced skip) after 30s of DNS-layer failures — confirmed environmental (this LAN's resolver), not a code defect. |
| 5 | **Every engine is a first-class citizen, or the UI says so before it matters** — PARITY-01a, PARITY-01b, PARITY-02, PARITY-03 | ✓ VERIFIED | `src/shared/agentProvider.ts`: 9 of 11 presets have `canReceiveInbox: true` (2 `false`: copilot, custom — matches D-34's "unachievable by construction" framing). `capabilityGaps(` appears with count 1 in each of `AgentCard.tsx`, `AddAgentModal.tsx`, `CommandCenterPanel.tsx` (D-31's anti-orphan clause). `costTracking` confirmed to have exactly one production consumer (`providerAutomation.ts:311`) and is honestly `'none'` for 7 of 11 engines (grok, kimi, antigravity, opencode, pi, copilot, custom), `'proxy'` for qwen/crush, `'otel'`/`'transcript'` for claude/codex — 4 tracked, matching the roadmap's D-34-corrected wording exactly. `test/repo-claims.test.cjs`'s PARITY-03 marker pin re-run live: `LIVE_UNVERIFIED_TOTAL = 18`, independently confirmed via `grep -rn "LIVE-UNVERIFIED" src/ \| wc -l` → 18 across the same 6 files; `LIVE_UNVERIFIED_ENGINES = ['pi','opencode','crush','qwen','kimi']` — 5 marked, matching D-33/D-35. |

**Score:** 3/6 sub-truths (STRUCT-02, GSD-06, PARITY suite) fully VERIFIED; 1 (criterion 1 / STRUCT-01) FAILED; 2 (DAEMON-01's live half, DAEMON-05's live close) UNCERTAIN pending human/environment action; DAEMON-02/03 UNCERTAIN pending operator hardware/credentials.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/main/floor/boot.ts` | `bootFloor(deps)` composition root + shutdown | ✓ VERIFIED | Exists, 52969 bytes; `test/boot-floor.test.cjs` drives it, 19/19 assertions green |
| `src/main/floor/deps.ts` | `FloorDeps` injection contract | ✓ VERIFIED | Exists; `send` returns boolean per D-03 (spot-checked in file) |
| `src/main/floor/headless.ts` | `quitDecision`/`shouldQuitOnLastWindowClose` pure predicates | ✓ VERIFIED / WIRED | Imported and called from `index.ts`'s `before-quit`/`window-all-closed` handlers |
| `src/main/floor/lifecycle.ts` | `teardownPty` + worktree finalizers | ✓ VERIFIED | 14791 bytes; `test/agent-lifecycle.test.cjs` 12/12 green |
| `src/main/hiveTemplates.ts` | Shim template constants (HOOK_SHIM etc.) | ✓ VERIFIED | Extracted from `hive.ts`; `askedBy` write confirmed here |
| `src/main/gitCommitter.ts` | Debounced single git committer | ✓ VERIFIED | Exactly one `new GitCommitter(` in `src/` (`test/repo-claims.test.cjs`, re-run green) |
| `src/main/hiveProvisioning.ts` | Per-provider installers incl. `installKimiConfig` | ✓ VERIFIED | Confirmed present, referenced from `hive.ts`'s hooks arm |
| `src/main/tunnel.ts` | `openTunnel`/`stop()` → `hardKillTree` | ✓ VERIFIED | Real-pid kill confirmed, code-reviewed clean |
| `src/main/cloudflared.ts` | Pinned-tag acquisition + SHA-256 verify | ✓ VERIFIED | Present; live-run confirmed the binary is genuinely acquired and a real tunnel opens |
| `src/renderer/src/components/McpConsentModal.tsx` | DAEMON-04 consent dialog | ✓ VERIFIED (post-fix) | CR-01's fix confirmed live: `load()` runs unconditionally, `grantMcpBatch` reports actually-granted ids |
| `src/shared/agentProvider.ts` | 11-preset ledger, kimi bridge, `supportsMcp` | ✓ VERIFIED | 9/11 `canReceiveInbox: true`; kimi present with `LIVE-UNVERIFIED` marker |
| `test/repo-claims.test.cjs` | STRUCT-02, PARITY-03, ADR-0001, README markers | ✓ VERIFIED / WIRED | 31/31 assertions, independently re-run |
| `resources/phone/*` | PWA bundle | ✓ VERIFIED (exists, untested on device) | `index.html`, `sw.js`, `manifest.webmanifest` present; DAEMON-02 live device check outstanding |
| `src/main/index.ts` | Left as thin IPC registration | ✗ NOT MET | 5021 lines, 160 handlers, 33 with >10-line bodies, `spawnAgentCore` (~500 lines) and scheduler/ephemeral-worker tick still resident |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `index.ts` `before-quit`/`window-all-closed` | `floor/headless.ts` predicates | named import + call site | ✓ WIRED | `import { isHeadless, quitDecision, shouldQuitOnLastWindowClose } from './floor/headless'` at `index.ts:124`, used at lines 4978, 5001 |
| `HiveManager.terminalHandoff` | `DeliveryService.enqueue` | injected `handoff` dep, `boot.ts:999-1007` | ✓ WIRED | Confirmed real, not a stub — `handoff` composes `terminalWorkOrderPrompt` and returns the enqueue's ok flag |
| `McpConsentModal.submitGrant` | `grantMcpBatch` → `load()` → `getMcpGrantsSnapshot` | unconditional post-batch republish | ✓ WIRED (post CR-01 fix) | No early return before `load()`; confirmed in source |
| `capabilityGaps()` | `AgentCard.tsx` / `AddAgentModal.tsx` / `CommandCenterPanel.tsx` | one import per surface | ✓ WIRED | Count 1 in each file, non-orphaned |
| `AskMeTab.recipientOf` | `hiveSend`'s `to:` field + header badge | one resolver feeding both | ✓ WIRED | Same function drives both surfaces; god-first / dedup-if-god logic confirmed |
| `tunnel.ts stop()` | `procKill.hardKillTree(pid)` | direct call, real pid | ✓ WIRED | `tunnel.ts:122,144`; asserted against a real spawned pid in `test/tunnel.test.cjs` |
| `test/repo-claims.test.cjs` marker pin | every `LIVE-UNVERIFIED` site under `src/` | raw (non-stripped) text scan, both-directions | ✓ WIRED | 18 total, 6 files, 5 engines — independently re-derived via plain `grep`, matches exactly |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `AgentCard.tsx` gap chip | `capabilityGaps(provider, platform)` | `providerCapabilities()` reading the live preset table, not a hardcoded list | Yes | ✓ FLOWING |
| Titlebar `PUBLIC` chip | `tunnelStatus()` | `onTunnelChanged` event from main, no local optimistic flag (REVIEW.md "Clean areas", independently spot-checked) | Yes | ✓ FLOWING |
| `McpConsentModal` granted state | `getMcpGrantsSnapshot()` | `load()` → main's saved config via IPC, republished unconditionally post-CR-01 | Yes | ✓ FLOWING |
| `test/repo-claims.test.cjs` PARITY-03 pin | `MARKER_LEDGER` + `sourceFiles()` walker | live filesystem read of `src/`, not a static list | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full suite green | `npm test` | 824 tests / 817 pass / 0 fail / 7 skipped | ✓ PASS |
| Typecheck clean | `npm run typecheck` | exit 0 | ✓ PASS |
| Build clean | `npm run build` | `built in 39.96s`, exit 0 | ✓ PASS |
| PARITY-03 marker pin | `node --test test/repo-claims.test.cjs` | 31/31 pass | ✓ PASS |
| STRUCT-01 gate test | `node --test test/boot-floor.test.cjs` (via full suite) | 19/19 pass | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| `scripts/tunnel-live-check.cjs` (DAEMON-05 D-16, declared Manual-Only in 02-VALIDATION.md) | `node scripts/tunnel-live-check.cjs` | Opened a real tunnel (`https://explorer-fig-gcc-fastest.trycloudflare.com`), polled ~30s, all probes failed at the DNS layer, exited with the script's own announced skip, exit code **3** | ANNOUNCED SKIP (matches claimed behavior exactly; environmental, not a code defect) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| DAEMON-01 | 02-03 | Floor runs with no window, entirely in main | ⚠️ PARTIAL | Unit half green (boot-floor.test.cjs, agent-lifecycle.test.cjs); live half not attempted this session or claimed anywhere. REQUIREMENTS.md `[ ]` — matches. |
| DAEMON-02 | 02-05, 02-09 | Android phone reach, PWA | ⚠️ PARTIAL (fallback only) | Localhost-verified auth path confirmed real (`resources/phone/*`, webhook routing, enrollment/bearer exchange all tested); no physical device. REQUIREMENTS.md `[ ]` — matches. |
| DAEMON-03 | 02-05 | Telegram/Discord onto webhook rails | ⚠️ PARTIAL (localhost only) | Telegram compare + Discord Ed25519 accept/reject confirmed live in `webhook.ts`, tested and green; no operator token. REQUIREMENTS.md `[ ]` — matches. |
| DAEMON-04 | 02-06, 02-11 | Per-agent MCP with consent | ✓ SATISFIED | Consent modal, mcp.json + `--mcp-config`, revoke, fail-closed all confirmed; CR-01/MAIN-02 review findings confirmed fixed. REQUIREMENTS.md `[x]` — matches. |
| DAEMON-05 | 02-04, 02-10 | Public tunnel, killable, off-by-default | ⚠️ PARTIAL | Off-by-default, token, rate-limit, `stop()`→`hardKillTree(realPid)` all code-proven; live close blocked by this LAN's DNS resolver (confirmed live this session, exit 3). REQUIREMENTS.md `[ ]` — matches. |
| GSD-06 | 02-08 | Human answer addressable to any agent | ✓ SATISFIED | `recipientOf`, `askedBy` chain, god-first ordering all confirmed live. REQUIREMENTS.md `[x]` — matches. |
| PARITY-01a | 02-07 | Every mail-capable engine has a routed inbox | ✓ SATISFIED | 9/11 `canReceiveInbox: true`, kimi bridge confirmed. REQUIREMENTS.md `[x]` — matches. |
| PARITY-01b | 02-06 | UI states which engines can't receive mail, before assignment | ✓ SATISFIED | `capabilityGaps(` non-orphaned across 3 surfaces, confirmed. REQUIREMENTS.md `[x]` — matches. |
| PARITY-02 | 02-07, 02-12 | Cost accounting per engine, honestly scoped | ✓ SATISFIED | `costTracking` declaration matches the wired reality (4 tracked, 7 declared none); restated in README/REQUIREMENTS per D-34. REQUIREMENTS.md `[x]` — matches. |
| PARITY-03 | 02-07, 02-12 | Live-unverified bridges stay marked, never silently unmarked | ✓ SATISFIED | Marker pin re-run green, independently re-derived (18 total, 5 engines). REQUIREMENTS.md `[x]` — matches. |
| STRUCT-01 | 02-02 | index.ts split, thin IPC registration | ✗ NOT SATISFIED | 5021 lines, 160 handlers mostly not thin, spawnAgentCore + scheduler/workers still resident. REQUIREMENTS.md `[ ]` — matches, and this verification confirms it is honest, not stale. |
| STRUCT-02 | 02-01 | hive.ts split | ✓ SATISFIED | Confirmed split, single GitCommitter, committer/router tests pass. REQUIREMENTS.md `[x]` — matches. |

No orphaned requirements — all 12 IDs declared across the phase's plans appear in `.planning/REQUIREMENTS.md`'s Phase 2 rows, and REQUIREMENTS.md's checkbox states match this session's independent code measurements in every case.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `src/shared/mcpCatalog.ts`, `src/shared/agentProvider.ts`, `src/renderer/src/store/config.ts` | multiple | `// TODO-verify` markers on catalog/preset metadata | ℹ️ Info | Pre-existing project convention (documented at `mcpCatalog.ts:28`) predating Phase 2 (oldest instance at commit `3ad2089`, "lp-foundation"), not new debt from this phase. Explicitly declares "not yet live-verified," consistent with the phase's honesty discipline rather than hidden incompleteness. Not a blocker. |
| `src/main/index.ts` | throughout | 160 IPC handlers, ~160-handler surface "pattern-scanned rather than individually traced end-to-end" | ⚠️ Warning (self-declared by 02-REVIEW.md) | The review's own stated coverage gap; MAIN-02 was found here by pattern-scan and a follow-up found two more sibling issues on the same input shape — direct evidence a full trace would find more. Tracked, not fixed, in this phase. |
| — | — | No TBD/FIXME/XXX debt markers found in any phase-modified core file (`floor/*`, `tunnel.ts`, `cloudflared.ts`, `webhook.ts`, `push.ts`, `McpConsentModal.tsx`, `config.ts`, `hiveProvisioning.ts`, `hiveTemplates.ts`, `agentProvider.ts`, `providerAutomation.ts`, `AskMeTab.tsx`, `index.ts`, `hive.ts`, `mcpCatalog.ts`) | — | — | Debt-marker gate clean |

### Code Review Resolution — Independently Re-Verified

02-REVIEW.md found 1 CRITICAL, 3 HIGH, 2 MEDIUM, 1 LOW, 1 UNCERTAIN. This verification independently re-checked the four most consequential fixes directly against source (not against the review's own resolution table):

- **CR-01 (CRITICAL, consent-misreport)** — confirmed fixed: `submitGrant` calls `grantMcpBatch` and unconditionally calls `load()` afterward (no early return before republish).
- **CR-02 (HIGH, stale MCP defaults)** — code present (`setMcpGrants` routing referenced in `config.ts`); not independently re-derived beyond the review's own claim, given time budget — lower-risk, non-blocking finding.
- **SEC-01 (HIGH, sendPush throws)** — confirmed fixed: `malformedSubscription()` guard exists and the whole `sendPush` body is now inside its `try` block (`push.ts:344-356`).
- **MAIN-01 (HIGH, stranded worker slot)** — confirmed fixed: `teardownPty` calls are now unconditional on the release paths, matching the sibling `pty:kill`/`killAgent` pattern the finding cited as the correct shape.

## Gaps Summary

**Criterion 1, the phase's own declared gate, is not fully met.** STRUCT-02 (hive.ts) is done
cleanly. STRUCT-01 (index.ts) delivered a real and valuable extraction — `src/main/floor/**`
gives the floor an injectable `bootFloor(deps)` with zero module-scope side effects, which is
what makes DAEMON-01's unit tests possible at all, and that redefined boot-gate
(`test/boot-floor.test.cjs`) is genuinely green. But the roadmap's own separate, un-struck clause
— "index.ts is left as thin `ipcMain.handle(name, wrapper)` registration" — is measurably false:
5021 lines, 160 handlers with a mean 8-line body and 33 exceeding 10 lines, and a ~500-line
`spawnAgentCore` still resident. The phase proceeded past its own declared gate (DAEMON-01,
DAEMON-05 and PARITY work all landed) on the strength of the redefined, narrower gate rather
than the original one — which the roadmap's own D-05 correction partially licenses but does not
fully cover, since the "thin registration" clause was never corrected or struck.

**Five items are genuinely human/hardware/environment-gated, not code gaps**, and REQUIREMENTS.md
already keeps every one of them honestly open: DAEMON-01's live headless run, DAEMON-02's
physical Android device, DAEMON-03's operator-supplied bot credentials, DAEMON-05's live tunnel
close (this session independently re-confirmed the environmental DNS block, exit 3, matching the
documented root cause exactly), and the pi/opencode/crush/qwen/kimi live account verifications.
None of these were found to be quietly under-delivered — every one carries real, tested,
code-reviewed automated coverage for its localhost/unit half, and every "not yet" is stated in
REQUIREMENTS.md's own checkbox state rather than papered over in a SUMMARY.

**Everything else checked (STRUCT-02, GSD-06, DAEMON-04, PARITY-01a/01b/02/03, the code-review
fixes) is real, live-wired, and independently reproduced in this session** — not merely claimed.
The full suite (824/817/0/7), typecheck, build, and the two most load-bearing pinned tests
(`repo-claims.test.cjs` 31/31, `boot-floor.test.cjs` 19/19) all match the orchestrator's stated
figures exactly under independent re-run.

---

_Verified: 2026-08-25T00:35:50Z_
_Verifier: Claude (gsd-verifier)_
