# Phase 1: Finish the Floor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-20
**Phase:** 1-Finish the Floor
**Mode:** `--auto` (config `mode: yolo`) — advisor mode active (USER-PROFILE.md present),
calibration tier `standard`, `NON_TECHNICAL_OWNER = false` (rating `educational`, no `guided`
learning style, no `jargon` frustration trigger — technical framing retained).
**Areas discussed:** Electron 38+ bump, Hook token identity, Budget cap enforcement,
Test + lint surface, Memory FTS5 + scoping, Build-or-declare forks

**Method:** six `gsd-advisor-researcher` agents ran in parallel, one per gray area. Under `--auto`
no `AskUserQuestion` was issued — each area resolved to the option the research marked
**Recommendation**. Every load-bearing claim was then re-verified by the orchestrator against live
source before being locked; three claims did not survive and the corrected fact was locked instead
(marked **CORRECTED** below).

**Agent reliability note:** the Electron researcher failed twice — once on a classifier timeout,
once on a mid-response connection loss — and was resumed to completion. Its central factual claim
(`latest: 43.4.1`, latest-3 window = 41/42/43) was independently confirmed by the orchestrator via
`npm view electron dist-tags` before use.

---

## Electron 38+ bump (FLOOR-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Electron 43, bump FIRST, builder 26 same plan | Chromium 150 / Node 24.17, EOL 2027-01-05; inside latest-3 and stays supported past the end of the roadmap | ✓ |
| Electron 42, bump FIRST, builder 26 same plan | One Chromium step smaller, same Node 24 ABI family — but EOL ~2026-10-20, guaranteeing a second bump inside the same roadmap | |
| Electron 39, bump FIRST | Only candidate keeping Electron's Node on 22 (smallest ABI delta) — but already EOL 2026-05-05, so it fails SC-2 "supported runtime" outright | |
| Electron 43, bump LAST | Protects 22 requirements from runtime destabilisation — but voids the phase's own "checked against a live test run" standard for all 19 fixes landed before it | |

**Choice:** Electron `^43.4.1`, first, as its own atomic revertable plan, with
`electron-builder ^26.15.3` in the same diff.
**Notes:** The tempting low-risk trap was Electron 39 — smallest technical delta, total policy
failure. Two orchestrator corrections: the roadmap's **"Electron 38+" bar is stale** (38 is itself
EOL, so a literal reading ships the defect FLOOR-03 exists to close) and must be restated as
"Electron 43.x"; and the researcher's `electron-builder ^26.15.7` was **CORRECTED** to `^26.15.3`,
the actual `npm view electron-builder version`. Electron 44 goes stable ~5 days from this discussion
and 41 EOLs the same day — 43 is the newest *seasoned* major inside the window.
Separately flagged as a first-class risk: `npm test` stubs `electron` via `test/load-ts.cjs`, so all
423 unit tests are structurally incapable of failing on an Electron regression, and the only
real-Electron job is Linux-only. FLOOR-03 therefore closes on a live Windows operator run, not on CI
green.

---

## Hook token identity (GATE-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-agent token via per-spawn env; server maps token→agent_id and discards the claimed id | Delivers SC-3 verbatim, identical on all three platforms, zero body change to the six shim templates | ✓ |
| Per-agent token in a perms-restricted file the shim reads | Keeps the secret out of `env` — but buys nothing against a same-uid shell, and `chmod 0o600` is a no-op on NTFS (false assurance) | |
| Rotating / HMAC-signed payloads | Adds replay resistance — but not impersonation resistance; `PI_EXTENSION` and `OPENCODE_PLUGIN` are fire-and-forget and cannot do challenge-response | |
| Socket peer-credential binding (SO_PEERCRED / named pipe) | Strongest in theory, no shared secret at all — but Node exposes no API for the socket fd or pipe handle (nodejs/node#7627); would mean a native addon ABI-rebuilt on three CI gates | |

**Choice:** per-agent token, minted per spawn, injected into that PTY's env; `Map<token, agentId>`
server-side; `payload.agent_id` discarded entirely.
**Notes:** The load-bearing detail is a **deletion**, not an addition — `process.env.HIVE_SOCK_TOKEN
= hookSockToken()` at `src/main/index.ts:5534` (verified present) must go, because
`src/main/pty.ts:665` spreads `process.env` into every PTY and leaving it makes everything else
cosmetic. The qwen proxy sidecar needs its token passed explicitly at its own spawn site or it goes
dead-hooked. The honest ceiling is recorded rather than papered over: agent A can always read A's
own token, so the tested property is impersonation resistance, not secrecy.

---

## Budget cap enforcement (FLOOR-10 + RECORD-03/04, and FLOOR-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Budget arm inside the existing breaker ladder | Reuses a complete, already-wired path: steer→constrain→stop, per-assignee, toast, `hardStop: false` default | ✓ |
| Per-card state only — enforce at dispatch, not in flight | Zero kill risk, smallest diff — but does not stop the burn, which is the exact overnight-runaway case criterion 3 names | |
| Hard-stop: kill the assignee PTY on `over` | Unambiguous and immediate — but an agent killed mid-edit is the trust failure the product exists to prevent | |
| Escalate to Michael only | Fits the god-agent architecture — but the god may be asleep, wedged, or itself the spender; unbounded burn while it deliberates | |

**Choice:** new arm in `breaker.ts`; ≥80% → `steering`, >100% → `constrained` + operator toast;
`hardStop` stays `false`; per-assignee, not floor-wide.
**Notes:** Research surfaced a defect **worse than the roadmap documents**, confirmed by the
orchestrator against source: the ledger holds *mixed* row semantics — `index.ts:1513` appends
cumulative per-beat snapshots while `hooks.ts:272` appends per-response deltas — and `taskSpend()`
sums both, so it is wrong in two directions at once. `db.ts:44` states the intended contract
verbatim. Also found: `telemetry.recordCostSample()` at `telemetry.ts:251` has **zero production
callers** (verified — only two doc comments and six test calls reference it), so FLOOR-09 closes
with a one-call redirect. Noted for the planner: `test/hive-protocol-v2.test.cjs:276-284` asserts
the current *wrong* arithmetic and must be rewritten with the source fix — source first, in its own
`fix(...)` commit, never the test bent to match buggy output.

---

## Test + lint surface (FLOOR-15 + FLOOR-16)

### Sub-decision: renderer component tests (FLOOR-15)

| Option | Description | Selected |
|--------|-------------|----------|
| `react-dom/server` `renderToStaticMarkup` under `node --test` | Zero new deps (`react-dom` already ships), renders real `.tsx`, stays inside the existing gate on all 3 platforms | ✓ |
| React Testing Library + jsdom | Industry default with real interaction coverage — but 4 permanent devDeps, a second test idiom, and a directly contradicted house rule | |
| More Playwright specs on the existing `e2e/` harness | Zero new deps and maximal fidelity — but Linux-only, slowest signal, and covers flows rather than components | |
| Keep extracting logic into pure `loadTs()`-able modules | The repo's own escape hatch — but renders no `.tsx`, and means refactoring 2000-line components inside a 23-requirement phase | |

**Choice:** static render via `react-dom/server`, plus a ~3-line `test/load-ts.cjs` change (`.tsx`
in `resolveTs()`, `ts.JsxEmit.React`), on 3–5 sub-100-line presentational components.
**Notes:** Grep confirmed no `.tsx` references `window.api`/`window.electron` directly — all IPC
goes through hooks and the store — so the small components are genuinely renderable in isolation.
Accepted limits recorded: SSR runs no effects and no events, so assertions are markup-only.

### Sub-decision: lint (FLOOR-16)

| Option | Description | Selected |
|--------|-------------|----------|
| ESLint flat config, `eslint-plugin-react-hooks` ONLY, hard gate | 2 devDeps, ~10-line config; two rules, so a bounded finding count; the existing hook disables become live honoured suppressions | ✓ |
| Full ESLint + typescript-eslint + react-hooks, hard gate | Comprehensive — but ~100 rules over 63.7k lines predictably surfaces hundreds-to-thousands of findings that must all clear before CI can gate | |
| Delete the 13 comments, record a deliberate no-lint decision | Cheapest close, zero deps, satisfies SC-5's lint branch verbatim — but discards the intent recorded at each hook site and leaves `rules-of-hooks` bugs permanently uncatchable | |
| oxlint or Biome instead | Very fast — but neither honours the existing suppression syntax, so all 13 comments need rewriting: the cost of deletion *plus* a dependency | |

**Choice:** ESLint flat config with `eslint-plugin-react-hooks` only, CI step gated with
`--max-warnings 0`.
**Notes:** **CORRECTED** — research reported the 13 comments as 10 hooks + 3 typescript-eslint; the
verified split is **9 + 4** (2 `no-var-requires`, 1 `no-require-imports`, 1 `no-explicit-any`). The
9 hook disables become live suppressions with zero rewriting; the 4 are deleted. `--max-warnings 0`
is not optional — both `exhaustive-deps` and unused-directive reporting default to *warnings* a hard
gate would otherwise wave through.

---

## Memory FTS5 + scoping (FLOOR-07)

| Option | Description | Selected |
|--------|-------------|----------|
| FTS5 in PersistStore, in-app callers only; sidecar keeps `index.jsonl` | Uses the already-open DB and its migration rail; FTS5 already compiled in; sidecar's native-free contract untouched | ✓ |
| FTS5 in PersistStore + sidecar reads the same file via `node:sqlite` | One index, one source of truth — but FTS5 only reached `node:sqlite` in Node 22.16 while the project declares `>=20 <23`, so the fallback branch never goes away | |
| FTS5 + sidecar delegates queries over the hooks socket | Exactly the mechanism the design doc names — but that *is* RECALL-02's job; building it now hollows out Phase 5 | |
| Keep `index.jsonl`, replace the TF scorer with BM25 in JS | No schema change, no ABI question — but leaves the requirement literally unmet and gives memory recall nothing | |

**Choice:** append-only migration adding `memory_fts(text, agent_id UNINDEXED, project UNINDEXED)`
to `PersistStore`; `kg-core.cjs` untouched; `knowledgeGraph.enabled` stays `false`.
**Notes:** The apparent blocker dissolved on inspection — two subsystems had been conflated. The
sidecar is what must stay native-free (plain `node`, outside Electron), but the clause Phase 1 is
graded on is *memory* recall, which lives in main where `better-sqlite3` already loads. Verified
`SQLITE_ENABLE_FTS5` in `deps/defines.gypi:24`, so this costs zero dependencies. Test gap recorded:
`test/config-secrets.test.cjs`'s in-memory `FakeDatabase` has no FTS5, so the migration needs a real
SQLite handle in its test or it ships unverified. Honesty work taken in full (render `status().scope`,
delete two dead preload exports, rename the "Enterprise Knowledge Graph" claim). The `--wing` limit
is documented, not fixed — server enforcement is Phase 5.

---

## Build-or-declare forks

### Fork A — FLOOR-02, the "dead" Stop-drain

| Option | Description | Selected |
|--------|-------------|----------|
| Keep the live guarded drain; delete the stale HIVE.md claims | The drain is already live and guarded with four passing tests; the untruths are in HIVE.md, which contradicts ARCHITECTURE.md in the same repo | ✓ |
| Delete `drainAtStop` + wiring + every doc claim | Literally satisfies "deleted along with the doc claims" — but deletes a working, tested feature and re-opens the headless-autonomy hole #5 exists to close | |
| Treat criterion 1 as already met; move only queue-drain + quiesce | Zero doc churn — but HIVE.md keeps asserting things that are false, which is precisely what the criterion bans | |

**Choice:** keep the drain, move the queue-drain and idle-quiesce backstop to main, delete HIVE.md's
four stale denials.
**Notes:** **CORRECTED — the roadmap's premise is factually wrong.** Verified directly:
`index.ts:467` → `hooks.ts:332` → `delivery.ts:216`, guarded on `stop_hook_active`, `SubagentStop`,
operator pause and renderer veto, with four passing assertions at
`test/delivery-main.test.cjs:117-142`. Criterion 1's "live under a guard" branch is *already taken*.
The doc-lie the criterion bans exists — it just points the opposite way from what the roadmap
assumed, and the fix is a doc deletion, not a code restore.

### Fork B — FLOOR-18, Codex on Windows

| Option | Description | Selected |
|--------|-------------|----------|
| Declare the limitation in source comment + docs + `capabilityLine` | Upstream `openai/codex#30372` records the daemon lifecycle as Unix-only, and the UI gap channel already exists and is already tested | ✓ |
| Make Codex remote control actually work on Windows | Would close #61 outright — but needs upstream Rust work or a WSL/named-pipe shim this repo owns forever | |
| Drop the bare `return false`; let the best-effort ladder fail loudly | Removes the unexplained line — but trades a silent no-op for guaranteed noise plus two subprocess timeouts, and still surfaces nothing in UI or docs | |

**Choice:** declare it in all three places, riding `providerCapabilities` / `capabilityLine` — the
channel that already carries "NO MAIL" and "spend UNTRACKED".
**Notes:** "Supported" is not available at any price this project controls. Flagged for the planner:
making the capability shape platform-aware changes roster-prompt text per OS, which touches the
prompt-cache invariant (ADR 0002; `providerAutomation.ts:278` marks the cache-safe position).

### Fork C — the evidence bar and issue-closing cadence

| Option | Description | Selected |
|--------|-------------|----------|
| Per-clause record (quote → shown-output command → named test → run), closed in the fixing PR | Mechanically kills the recorded 2026-08-20 error: all four mis-assessed issues had one unmet clause each, each caught by a grep returning empty | ✓ |
| One audited sweep: fix everything, close all 20 at the end | One consistent bar applied by one pass — but this is exactly the shape that produced the recorded error | |
| Incremental closure with a fresh-context adversarial re-verify per issue | Matches the verification-honesty constraint most directly — but a subagent verdict is still an agent's report, and leaves no durable artifact | |

**Choice:** per-**clause** bar, closed incrementally in the fixing PR, with negative greps
accumulated in one repo-fact test file; adversarial re-verify added for #4, #5, #10 and #34 only.
**Notes:** The resolution matters more than the ceremony — a per-*issue* bar of "some code exists"
passes all four previously mis-assessed issues; a per-*clause* bar fails all four. Phase gate is one
mechanical `gh` query returning 0 non-epic open `floor-inspection` issues.

---

## Claude's Discretion

Auto-mode resolved every gray area to its researched recommendation, so these were left open for the
planner rather than pre-locked:

- Plan slicing and wave assignment across the 23 requirements — constrained only by the Electron
  bump being plan 1 and gating the rest.
- Exact disjoint file-ownership lists per agent (`use_worktrees: false`).
- Which specific presentational components receive static-render tests.
- Whether `better-sqlite3` is bumped to 12/13 — contingent on the Electron 43 compile result.
- The exact shape of the `capabilityLine` platform argument vs a `remote` capability bit.

## Deferred Ideas

- `node:sqlite` FTS5 in the `kg-core.cjs` sidecar — revisit when the agent-side Node can be pinned.
- Server-enforced memory scope — RECALL-02, Phase 5.
- Socket peer-credential binding as defence in depth — blocked on Node exposing no handle API.
- HMAC / nonce replay protection on hook payloads — worth doing if payloads gain replay-sensitive effects.
- Windows and macOS Electron-launching e2e runners — add after a second Electron-version incident.
- Full `typescript-eslint` ruleset — rejected for Phase 1, not forever.
- React Testing Library + jsdom — rejected for Phase 1, not forever.
- A knowledge-graph renderer panel — the graph was **retired** 2026-08-20, not deferred.
- `better-sqlite3` 12/13 as planned work — contingency only.

## Scope creep redirected

None. Auto-mode raised no new capabilities; every area stayed inside the 23 requirements. The two
roadmap corrections (D-02, D-37) narrow or restate existing criteria rather than widening scope.
