---
phase: 3
slug: scale-and-observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-24
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `03-RESEARCH.md` §"Validation Architecture" (line 1091).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node's built-in `node --test` — **no** Jest/Vitest/Mocha. `test/load-ts.cjs` transpiles TypeScript on demand and stubs Electron. |
| **Config file** | none — behavior lives entirely in `package.json` `scripts`. **`package.json` must not be modified this phase** (D-37). |
| **Quick run command** | `node --test test/<the specific file(s) this task touches>.test.cjs` |
| **Full suite command** | `npm test` (= `node --test test/*.test.cjs`) |
| **Estimated runtime** | ~22s full suite (measured this session: 21.7s) |
| **Measured baseline** | **800 tests / 793 pass / 0 fail / 7 skipped** at `f04f9ec`; `npm run typecheck` → 0 errors |

**Baseline rule:** 0 failures is the standing bar. Any red test is a real regression, never an
expected cost of the change. The skip count may not rise above 7 without an explicit, named reason.

---

## Sampling Rate

- **After every task commit:** run that task's specific test file(s)
- **After every plan wave:** run `npm test` (full suite)
- **Before `/gsd:verify-work`:** full suite green — 0 fail, skips ≤ 7
- **Max feedback latency:** ~22 seconds (full suite); a few seconds for a single file

---

## Per-Requirement Verification Map

Task IDs are filled in after the planner runs; the requirement → test mapping below is fixed now so
the planner must attach every task to a row.

| Req | Behavior | Test Type | Automated Command | File Status |
|-----|----------|-----------|-------------------|-------------|
| SCALE-01 | `PersistStore` + `KnowledgeManager` default under `harnessHome`; a note indexed under home A is returned for home A (**positive lower bound, hits >= 1**) and returns 0 against home B | integration (real SQLite, real tmpdir) | `node --test test/db-fts.test.cjs` (extend) or new `test/db-repoint.test.cjs` | Extend ✅ / ❌ W0 for the repoint case |
| SCALE-01 | `repoint()` fires at the one non-relaunching `harnessHome: null→set` transition; **both** live handles (`floor/boot.ts:1148`, `config.ts:684`) repoint together | integration | same file as above | ❌ W0 |
| SCALE-01 | Task-ledger isolation is free by construction (`hive.root()` already lazy) — **no new code, therefore no new test** | existing | `node --test test/hive-runtime-path.test.cjs test/hive-cwd.test.cjs` | ✅ existing |
| SCALE-02 | `readHireManifestFile` branches on raw `spec` **before** `validateHireManifest` (which hard-rejects non-`hire@1` today) | unit | `test/hire-manifest.test.cjs` (new) | ❌ W0 |
| SCALE-02 | IPC name pin moves 159→160 with `team:export`; `B_IPC_JOINED` **and** sorted `B_IPC_NAMES` edited in the same commit (D-17) | structural pin | `node --test test/boot-floor.test.cjs` | Extend ✅ |
| SCALE-02 | Export stripper drops all 7 security/portability fields — **`slimAgents()` alone is insufficient** (see Correction below) | unit | `test/hire-manifest.test.cjs` | ❌ W0 |
| SCALE-02 | Bulk-spawn loop preserves concurrency, original roster order, and per-agent failure isolation | unit/integration | new renderer-logic test via `test/load-ts.cjs` | ❌ W0 |
| SCALE-03 | `events` lands as `MIGRATIONS[2]`; schema read back through a **second independent handle** | integration (real SQLite) | `node --test test/db-fts.test.cjs` (extend) | Extend ✅ |
| SCALE-03 | Cost lane uses `applyCostRow`'s clamped consecutive diff, **never SUM** — fixture includes a mid-day `session_id` rollover (D-22) | unit | new, following `hive-durability.test.cjs`'s cost-arithmetic style | ❌ W0 |
| SCALE-03 | Synthetic driver pushes >8 MB through `appendLog`, then the events table still returns the earliest hour (**rows >= 1**) after `log.jsonl.1` is renamed over, while `logTail()` no longer sees it | integration | new | ❌ W0 |
| SCALE-03 | Day-band range input renders `min`/`max`/`step`/`aria-label`/`aria-valuetext` in first-pass static markup | renderer component | `node --test test/renderer-components.test.cjs` (extend) | Extend ✅ |
| SCALE-03 | Gap marker renders the real truncated count rather than silently slicing (D-27) | renderer component | same | Extend ✅ |
| SCALE-04 | `msUntilNextLocalHour` pure fn: before / after / exactly-at / next-day / **DST transition**, against a fixed injected clock | unit | new digest-scheduler test | ❌ W0 |
| SCALE-04 | Digest timer appears in `SHUTDOWN_STEPS` — a missing entry **hangs** `boot-floor` rather than failing red | structural + integration | `node --test test/boot-floor.test.cjs` (the existing "every subsystem bootFloor started appears in the shutdown list" test covers this once the timer is registered) | ✅ existing |
| SCALE-04 | `postSlackDigest` requires an explicit channel and refuses a blank one; token is never logged | unit | `node --test test/slack.test.cjs` (extend) | Extend ✅ |
| SCALE-04 | `postSlackDigest` has **at least one production call site** under `src/main/` (`count >= 1`) — the anti-`push.ts` pin (D-38) | repo-fact | `node --test test/repo-claims.test.cjs` (extend) | Extend ✅ |
| SCALE-04 | Digest content never phrases current board counts as per-day completions (no `doneAt` exists) | unit | new/extended digest-content test | ❌ W0 |
| SCALE-05 | `agentView.ts` derivation is fed a fixture and the derived row asserted — **not** a literal `usd` prop | unit | `node --test test/renderer-runstate.test.cjs` (extend) | Extend ✅ |
| SCALE-05 | ONE context threshold pair — the 85/65 and 88/75 drift is gone; each rendering calls the selector (`count >= 1` per rendering) | unit + repo-fact | same, plus `test/repo-claims.test.cjs` | Extend ✅ |
| SCALE-05 | `control:breakerSnapshot` returns current per-agent levels on demand | unit/integration | `node --test test/breaker.test.cjs` or `test/boot-floor.test.cjs` | Extend ✅ |
| SCALE-05 | Transcript-tier spend reaches `cost-ledger.jsonl`, not only the breaker — **must honour ADR-0005's cumulative contract or it double-counts every 30s beat** | integration | `node --test test/transcript-usage.test.cjs` or `test/telemetry-auth.test.cjs` (confirm ownership before editing) | Extend ✅ |
| SCALE-05 | Cost renders a declared gap, never `$0.00`, for a `costTracking:'none'` engine | renderer component | `node --test test/renderer-components.test.cjs` (extend) | Extend ✅ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/hire-manifest.test.cjs` — team@1 spec-branching, per-member validation delegation, the
      export stripper's 7 fields, and the byte-cap decision (Open Question 1)
- [ ] A digest-scheduler test file — `msUntilNextLocalHour` cases + the three-arm dispatch
- [ ] A bulk-spawn-from-team test — the extracted loop against `HireManifest[]`
- [ ] A cost-lane diffing test with a mid-day session rollover fixture (D-22) — **confirm whether the
      existing `applyCostRow` tests already cover the general case before writing a new fixture**
- [ ] A SCALE-01 two-home leak test — positive control first (`hits >= 1` for home A), then the
      negative (0 for home B)
- [ ] Framework install: **none** — `node --test` is already wired; no new runner, no `package.json` edit

---

## Manual-Only Verifications

| Behavior | Req | Why Manual | Test Instructions |
|---|---|---|---|
| Moving the scrubber changes the detail list | SCALE-03 | `renderToStaticMarkup` runs no effects and fires no events — first-render assertions are the harness ceiling | Open the day band in the dev app, step the range input with arrow keys, confirm the detail list re-renders for the new bucket |
| A `chat.postMessage` to a channel root actually succeeds | SCALE-04 | Needs a real bot token with `chat:write` in a live workspace; nothing in the repo fakes slack.com | Configure a token + digest channel, trigger the digest, observe the post. **SCALE-04 cannot be marked green without one real observed post.** |
| An Electron `Notification` surfaces with no window open | SCALE-04 | Requires launching packaged with `--headless` and watching the Action Center | Enable Start-at-login, close all windows, wait for the digest hour |
| The consolidated card's width behaviour at 1280 / 1024 / 800 | SCALE-05 | Needs live Electron measurement; the recorded failure at `AgentCard.tsx:222` was a dropped field, not truncation | Same live-measure treatment `MODEL_CHIP_MAX_W` and `MCP_CHIP_MAX_W` received |

---

## Correction carried from research

`03-CONTEXT.md` D-15 describes export as "a field pick" reading the same `PersistedAgent` records
`slimAgents` already writes. Research refined this: **`slimAgents()` is insufficient as the export
stripper** — it drops only 6 ephemeral UI fields, not the 7 security/portability fields D-16 requires
(`cwd`, `account`, `accountPolicy`, `worktreePath`, `ptyId`, raw `command`, `commandFlags`). The
export path needs its own explicit stripper. D-16's field list stands; the *mechanism* named in D-15
does not. Plans must not reuse `slimAgents()` alone.

**Open questions the planner must decide** (from research, genuinely not locked in CONTEXT.md):
1. Byte cap for `team@1` — the existing 64 KB `HIRE_MAX_BYTES` could be exceeded by a 16-member team
   of worst-case manifests. Reuse the cap, or a team-specific constant? The pre-read `statSync` size
   check must apply either way.
2. Where timeline bucket aggregation lives — research recommends **main**; not locked.
3. UI location for the `team:export` button — no existing pattern to match.

---

## Validation Sign-Off

- [ ] All tasks have an `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all ❌ references above
- [ ] No watch-mode flags
- [ ] Every repo-fact assertion carries a positive lower bound (`count >= 1`) alongside its negative
- [ ] Feedback latency < 25s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
