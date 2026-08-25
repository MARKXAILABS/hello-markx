---
phase: 03-scale-and-observability
plan: 1
subsystem: database
tags: [sqlite, better-sqlite3, electron, harnessHome, knowledge-graph, project-isolation]

# Dependency graph
requires:
  - phase: 04 (GATE/RECORD/VIGIL)
    provides: "MIGRATIONS[2] + PersistStore event methods, the absence watchdog's SHUTDOWN_STEPS entry, and boot.ts's composition-root wiring — all present at the base commit and left untouched"
provides:
  - "PersistStore takes an injected `getHome: () => string | null`; the default DB path is `<harnessHome>/harness.db`, falling back to userData before onboarding"
  - "PersistStore.repoint() — close-then-reopen, for the one harnessHome transition that does not relaunch"
  - "config.ts's repointFiredStore() and harnessHomeOnDisk()"
  - "KnowledgeManager.root() defaults under harnessHome (no repoint needed — it recomputes per call)"
  - "config:changeHome 'move' now moves harness.db (+wal/shm) and knowledge/, with persist closed across the copy and reopened on the copy-failure path"
  - "Honest doc/UI text: no dead per-agent memory-scope control, no side-by-side claim"
affects: [03-02 through 03-09, RECALL-02, SCALE-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injected `getHome` closure for project-local paths — the shape hive.ts/MemoryManager/RosterStore already use, extended to PersistStore"
    - "Path getters must not re-enter readConfig(): a file-level scalar reader (harnessHomeOnDisk) where the caller is itself inside readConfig"

key-files:
  created:
    - test/config-fired-store.test.cjs
  modified:
    - src/main/db.ts
    - src/main/knowledge.ts
    - src/main/config.ts
    - src/main/floor/boot.ts
    - src/main/index.ts
    - src/renderer/src/components/MemoryPanel.tsx
    - src/renderer/src/components/HivePicker.tsx
    - README.md
    - CHANGELOG.md
    - test/db-fts.test.cjs

key-decisions:
  - "No copy-forward migration for existing installs on the default boot path — declared as a one-time, non-destructive relocation in CHANGELOG.md instead (D-9 discretion). changeHome 'move' does move the data, because that action's whole promise is that it comes along."
  - "config.ts's path getter reads harnessHome straight off the file (harnessHomeOnDisk), NOT `() => readConfig().harnessHome` — the plan's literal wording. The plan's spelling re-enters readConfig from inside itself and burns a one-shot migration latch; caught live by test/mcp-per-agent.test.cjs."
  - "A read-count assertion written to guard that re-entry was DELETED after measuring 2 reads under both spellings — it could not have failed. test/mcp-per-agent.test.cjs is the real guard."
  - "SCALE-01 deliberately NOT ticked in .planning/REQUIREMENTS.md (D-07); verified still `- [ ]` / Pending."

patterns-established:
  - "Repoint pairs: every live PersistStore handle repoints together at the null->set transition, before anything reads through them"
  - "Comment text is part of a positional gate: four of this plan's acceptance pins are indexOf-ordering checks, so prose mentioning `startHiveServices()` or `app.relaunch` above a call site breaks them"

requirements-completed: []

# Metrics
duration: 78min
completed: 2026-08-26
---

# Phase 3 Plan 1: harness.db and KG_ROOT follow harnessHome Summary

**The two stores that escaped `harnessHome` now follow it — `harness.db` via an injected `getHome` closure plus `PersistStore.repoint()`, and `KnowledgeManager.root()` via a one-line default — closing SCALE-01's code half while the task-ledger half stays zero-code by construction.**

## Performance

- **Duration:** ~78 min
- **Tasks:** 3 of 3
- **Files modified:** 10 modified, 1 created
- **Commits:** 5

## Commits

| Commit | Type | What |
|---|---|---|
| `5e60cab` | test | RED gate — 2 of 4 new cases fail (getter ignored, `repoint` undefined) |
| `f0f78f5` | feat | Task 1 GREEN — `getHome` + `repoint()` + `KnowledgeManager.root()` |
| `fafe10a` | feat | Task 2 — both handles repoint; `changeHome` 'move' widened; WAL closed across the copy |
| `c7e0172` | docs | Task 3 — dead memory-scope control removed, side-by-side claim removed, CHANGELOG policy |
| `c53a8c7` | fix | Regression: the fired store's path getter must not re-enter `readConfig()` |

## Accomplishments

### Task 1 — `PersistStore.repoint()` and both harnessHome-aware defaults

`PersistStore`'s constructor gained a second parameter, `getHome?: () => string | null`. `open()`'s
path expression is now `dbPath ?? join(getHome?.() ?? app.getPath('userData'), 'harness.db')` — an
explicit `dbPath` still wins (every existing test in `db-fts.test.cjs` passes one), and a null
`getHome` is byte-identical to the previous behaviour. `repoint()` is `close()` then `open()`;
`dbPath` is deliberately untouched so a genuine test override cannot be disturbed.

`KnowledgeManager.root()` changed by one expression. It caches nothing, so no repoint plumbing was
needed — verified by reading the class, not assumed.

`db.ts` still contains **zero** occurrences of `readConfig` and zero imports from `./config`; the
circular-import constraint holds (config.ts imports `PersistStore` from db.ts).

### Task 2 — the one repoint call site, both handles, and the `changeHome` escape

- `config.ts`'s `firedStore()` handle is harnessHome-aware and gained `repointFiredStore()`.
- `boot.ts`'s `persist` takes the same injected getter (one line, at what is now line 1359).
- `config:update`'s `!hiveWasEnabled && hive.enabled()` block repoints **both** handles, in its own
  `try`/`catch`, strictly before `startHiveServices()` — so a locked/read-only DB is a wrong-DB
  problem and never also a dead-services problem (D-12).
- `config:changeHome` 'move' closes `persist` as the first statement inside the copy `try` (WAL
  checkpointed before `cpSync`), copies `harness.db`, `harness.db-wal`, `harness.db-shm` and
  `knowledge` alongside the existing four entries, and calls `persist.repoint()` on the
  copy-failure recovery path — the only exit from that handler that does not relaunch, and
  therefore the only one where the close would otherwise strand the handle closed for the session.
- `app:resetAll` untouched; `app.relaunch` count still exactly 2.

### Task 3 — doc/UI honesty

`README.md` and `MemoryPanel.tsx` no longer tell the operator to reach a per-agent memory scope
(`HarnessConfig` has no `scope` field and `boot.ts` passes `{ enabled, model }` only, so `scope()`
can only ever return `'shared'`). Both now name RECALL-02 as where enforcement lands and say plainly
that no such setting exists yet. `HivePicker.tsx` no longer claims side-by-side operation; `README.md`
gained the limitation it never stated at all. `CHANGELOG.md`'s `[Unreleased]` records all three, plus
the existing-install data policy.

## Deviations from Plan

### 1. [Rule 1 — Bug] The plan's literal getter spelling for `config.ts` broke a security migration

- **Found during:** the full-suite run after Task 3.
- **Issue:** the plan mandated `new PersistStore(undefined, () => readConfig().harnessHome)` in
  `config.ts` and asserted it was "safe here". It is not. `firedStore()` is called **from inside**
  `readConfig` (via `withMissionStamps`/`stripMissionStamps`), so that getter re-enters `readConfig`
  during `open()`. `readConfig` runs `migrateMcpConsentV1` and `migrateTriggersV1`, both **one-shot
  migrations latched by a process-global boolean**. The inner read burned the latch; the outer read
  then early-returned and the migration never applied.
- **Symptom (measured, not reasoned):** `test/mcp-per-agent.test.cjs` red —
  *"floor-wide write/secret consent must be dropped"*. Floor-wide write/secret MCP consent left
  armed. A security regression reached through a database path lookup.
- **Fix:** added `harnessHomeOnDisk()` — parse `config.json`, take the one scalar, return null on
  any failure. No migrations, no secret overlay, no write. `firedStore()` injects that instead.
  `boot.ts`'s handle keeps `() => readConfig().harnessHome` as planned and is safe, because it is
  called from `bootFloor`, never from inside `readConfig`.
- **Files:** `src/main/config.ts` · **Commit:** `c53a8c7`

### 2. [Rule 1 — Bug, self-inflicted] A test assertion that could not fail

- **Found during:** negative-checking my own new test.
- **Issue:** I first guarded the re-entry above with a `config.json` read-count assertion. Measured:
  **2 reads under both spellings** (the re-entrant read and `harnessHomeOnDisk`'s read cost the
  same), so it was green either way.
- **Fix:** deleted it and documented in the test file why, naming `test/mcp-per-agent.test.cjs` as
  the real guard. A check that cannot go red is worse than no check.
- **Commit:** `c53a8c7`

### 3. [Rule 3 — Blocking] Comment prose broke three of the plan's own positional gates

Three acceptance pins are `indexOf`-ordering checks over the raw source. Explanatory comments
mentioning `app.relaunch()`, `startHiveServices()` (twice) placed *above* the calls they describe
made the gates fail. Rewording — never weakening the gate — was the fix in every case. The same
happened to Task 1's `grep -c readConfig src/main/db.ts == 0`, where a JSDoc line mentioning
`readConfig()` broke a criterion whose intent (no reverse import) was already satisfied.
No gate was relaxed.

### 4. [Rule 2 — Missing critical verification] Added `test/config-fired-store.test.cjs`

The plan's only mandated test covers `db.ts`. The `config.ts` half — the actual D-12 mission-stamp
bug — had grep/positional proof only, and Phase 4's lesson is that all four of its "the feature
exists and does nothing" defects passed structural checks. This file drives the path against a
**real** SQLite file (`config-secrets.test.cjs`'s stand-in driver never touches the filesystem, so
"the stamps went to the right file" is unobservable through it) and asserts the stamps land in the
project DB only after `repointFiredStore()`. **Verified red** when the `getHome` injection is
removed, failing on the target assertion.

## Live verification (executed, not grepped)

| Check | Result |
|---|---|
| RED gate before any source change | 2 fail — getter ignored, `store.repoint is not a function` |
| `node --test test/db-fts.test.cjs` | 10/10 pass |
| `test/config-fired-store.test.cjs` negative check (getter removed) | red on the target assertion, as designed |
| `test/config-fired-store.test.cjs` read-count guard | **could not fail** (2 under both spellings) → deleted |
| `HivePicker` through `renderToStaticMarkup` | 2634 bytes; "Only one project runs at a time" present, "side by side" absent |
| `MemoryPanel` through `renderToStaticMarkup` | collapsed render is 421 bytes (`useState(false)`); forced open → 3139 bytes, new sentence present, dead phrase absent |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 warnings (`--max-warnings 0`) |
| 4 positional pins from the plan | all PASS |

The MemoryPanel render is worth recording: a plain static render emits only the collapsed `🧠 memory`
pill, so a naive "does the new text render?" check would have reported the sentence missing. The
banner lives behind `const [open] = useState(false)` and is reachable by clicking. Forcing the first
`useState` true confirmed the corrected text is what the operator actually sees.

## Baseline drift (plan written before Phase 4 landed)

Every numeric baseline the plan's criteria compare against was re-measured at commit `32fee73`:

| Baseline the plan states | Re-measured | Moved? |
|---|---|---|
| `grep -c "app.relaunch" src/main/index.ts` == 2 | 2 | no |
| `grep -c repoint test/db-fts.test.cjs` == 0 | 0 | no |
| `grep -c readConfig src/main/db.ts` == 0 | 0 | no |
| `grep -c "side by side" README.md` == 0 | 0 | no |
| `grep -c "harness.db\|knowledge-graph" CHANGELOG.md` == 0 | 0 | no |
| `'harness.db'` / `'knowledge'` in index.ts == 0 | 0 / 0 | no |

**Line numbers did move** (the plan's ANCHOR RULE anticipated this — content was used, never the number):

| Plan citation | Actual at `32fee73` |
|---|---|
| `persist = new PersistStore()` at boot.ts ~1148 | **boot.ts:1359** |
| `export let persist` at boot.ts:163 | **boot.ts:191** |
| `config:changeHome` 'move' sub-array at index.ts ~2752-2778 | **index.ts ~2894-2903** |
| copy-failure catch at index.ts:2797-2787 | **index.ts ~2905-2915** |
| `config:update` handler | **index.ts:2819** |
| README memory-scope sentence at :118-123 | **README.md:152-153** |
| MemoryPanel sentence at :118-127 | **MemoryPanel.tsx:125-126** |
| HivePicker "side by side" at :82 | **HivePicker.tsx:82** (unmoved) |

The plan's quoted CONTENT was accurate everywhere. Structures Phase 4 added to these files
(`MIGRATIONS[2]`, the absence watchdog, `SHUTDOWN_STEPS`, the four `HookServer` seams with
`openAsk` positionally `undefined`, GATE-02's env allowlist) were left untouched. No shipped
migration was edited and no `user_version` equality pin was introduced.

## Test suite

| | Baseline @`32fee73` | After this plan | Delta |
|---|---|---|---|
| tests | 1078 | **1084** | +6 (4 in `db-fts`, 2 in `config-fired-store`) |
| pass | 1071 | **1077** | +6 |
| **fail** | 0 | **0** | — |
| skipped | 7 | **7** | unchanged |
| duration | ~23.9 s | **24.3 s** | +0.4 s |

No clock blowout — the +0.4 s is the two new real-SQLite files. (An intermediate run at 24.8 s with
1 fail is the regression above, before `c53a8c7`.)

## Requirements

**SCALE-01 was NOT ticked**, per D-07 and this plan's frontmatter note (`requirements_addressed`,
not `requirements`). Verified after all work: `.planning/REQUIREMENTS.md:171` is still `- [ ]` and
the traceability row still reads `Pending`. `.planning/STATE.md` and `.planning/ROADMAP.md` were
not modified — the orchestrator owns those.

## What this plan does NOT deliver

- **Simultaneous side-by-side projects.** One project per running app; switching relaunches. Both
  `README.md` and `HivePicker.tsx` now say so.
- **The task-ledger half of SCALE-01** — zero code, per D-11. Verified rather than assumed:
  `hive.root()` is `home ? join(home, 'hive') : null` (`hive.ts:563-566`), already harnessHome-derived.
  No task in this plan touched it or claimed it.
- **Enforced memory isolation** — still agent-supplied scope until RECALL-02 (Phase 5).
- **A copy-forward migration for existing installs.** Declared in `CHANGELOG.md`; data is relocated,
  never deleted.

## Known Stubs

None. No hardcoded empty values, placeholder text or unwired data sources were introduced.

## Threat Flags

None. No new network endpoint, auth path or trust-boundary schema change. The one security-relevant
event was the *removal* of a mitigation by the plan's own mandated code (deviation 1) — found and
fixed, with the shipped test suite as the detector.

The plan's threat register was honoured: T-03-01d (WAL open across `cpSync`) is mitigated by the
`persist.close()` placement, verified by a positional pin; T-03-01b (`repoint()` reachable from an
ordinary config patch) holds — both repoint calls sit inside the `!hiveWasEnabled && hive.enabled()`
transition guard; T-03-01c is the accepted, CHANGELOG-declared data relocation.

## Self-Check: PASSED

Created files verified present: `test/config-fired-store.test.cjs`.
All five commits verified in `git log`: `5e60cab`, `f0f78f5`, `fafe10a`, `c7e0172`, `c53a8c7`.
