---
phase: 01-finish-the-floor
plan: 10
subsystem: memory-recall + operator-affordances
tags: [sqlite, fts5, migration, ipc, preload, electron, honesty, circuit-breaker, node-test]

# Dependency graph
requires:
  - phase: 01-01
    provides: "better-sqlite3 ^13.0.3 — N-API, eight prebuilds in the tarball, no install script. This is what lets test/db-fts.test.cjs load under plain `node` in the CI test matrix with no rebuild step."
  - phase: 01-08
    provides: "the FLOOR-09 production injection (recordCostSample at index.ts:525) — hard-gated by task 5 here, not assumed"
  - phase: 01-09
    provides: "hive.budgetForAgent(agentId), BreakerInput.budget and the breaker's budget arm — minted but deliberately unwired"
provides:
  - "src/main/db.ts: MIGRATIONS entry 2 — memory_fts(text, agent_id UNINDEXED, project UNINDEXED), append-only, user_version 2"
  - "src/main/db.ts: PersistStore.indexMemory() / .searchMemory() — replace-not-append indexing, bound-parameter MATCH scoped by WHERE agent_id = ? (and project = ?)"
  - "src/main/db.ts: ftsMatchTerms() — reduces any query to quoted terms, so an FTS5 operator is a search term and never syntax (T-P10-03)"
  - "src/main/memory.ts: the mine loop indexes memory.md whether or not mempalace is on PATH; keywordSearch() and a search() fallback"
  - "src/main/index.ts: MemoryManager is handed the open PersistStore and the registry cwd — the index and the project predicate are actually populated"
  - "src/preload/index.ts: openLogs — FLOOR-05's missing exposure half"
  - "src/renderer/src/components/SettingsModal.tsx: the Log folder row"
  - "src/renderer/src/components/MemoryPanel.tsx: the shared-by-default scope warning"
  - "src/main/index.ts: budget: hive.budgetForAgent(id) in runBreakerBeat — FLOOR-10 CLOSES HERE"
  - "test/db-fts.test.cjs: 6 tests over a real SQLite handle, no bypass of any kind"
  - "test/repo-claims.test.cjs: 6 new clauses (5 -> 11)"
  - "test/engine-parity.test.cjs: the FLOOR-10 wiring pin and a FLOOR-09 sink pin (24 -> 26)"
affects: [01-11, 01-13, 01-23]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "a source pin's window is bounded by STRUCTURE (declaration -> push -> the `});` that closes it), never by a character count, and carries a positive control on the window itself"
    - "an FTS5 MATCH term is sanitised to quoted words, because binding a parameter binds the string and not its meaning"
    - "a subsystem that degrades to a silent no-op gets a second sink that does not share the missing dependency"

key-files:
  created:
    - test/db-fts.test.cjs
  modified:
    - src/main/db.ts
    - src/main/memory.ts
    - src/main/index.ts
    - src/preload/index.ts
    - src/renderer/src/components/MemoryPanel.tsx
    - src/renderer/src/components/SettingsModal.tsx
    - README.md
    - .github/ISSUE_TEMPLATE/bug_report.yml
    - test/repo-claims.test.cjs
    - test/engine-parity.test.cjs
    - .planning/phases/01-finish-the-floor/deferred-items.md

decisions:
  - "CREATE VIRTUAL TABLE IF NOT EXISTS is KEPT: probed against the binary that actually loads (SQLite 3.53.4) rather than assumed from the grammar"
  - "The mine loop no longer requires the mempalace CLI — on the common machine the whole memory subsystem was a silent no-op, and the FTS index is the recall path that survives that"
  - "MemoryManager is wired to PersistStore in src/main/index.ts even though task 2's file list omits it: without the wire the index is never populated and the must-have truth is false"
  - "The FLOOR-10 wiring pin is bounded structurally, overriding BOTH the plan's slice-then-strip form (measurably broken) and 01-09's strip-then-bound form (still a fixed byte count)"
  - "Requirement rows left Pending in REQUIREMENTS.md — plan 23 owns the checkboxes (01-02/04/05/06/07/08/09 precedent)"

metrics:
  duration: 35m
  tasks: 4
  files: 11
  completed: 2026-08-21
---

# Phase 01 Plan 10: FTS5 Recall, the Log Folder, and the FLOOR-10 Budget Arm — Summary

Memory recall now runs off a real SQLite FTS5 index in the PersistStore the app already holds open,
narrowed by a bound `WHERE agent_id = ?` predicate whose agent-supplied limitation is stated in the
panel, the README and the source; the log folder opens from Settings; two dead preload exports and
their handlers are gone; and `FLOOR-10` closes here with the budget arm fed from the production
breaker beat.

```
FLOOR-10 BUDGET ARM FED IN PRODUCTION (from 01-09 handoff)
```

---

## Headline evidence

| Gate | Result |
|------|--------|
| `npm run typecheck` | **EXIT 0** |
| `npm test` (local, Windows) | **EXIT 0** — `tests 492 · pass 488 · fail 0 · skipped 4 · todo 0` (baseline 478/474/0/4) |
| CI — Test (ubuntu-latest) | **success** — `# tests 492 # pass 492 # fail 0 # skipped 0 # todo 0` |
| CI — Test (macos-latest) | **success** — `# tests 492 # pass 492 # fail 0 # skipped 0 # todo 0` |
| CI — Test (windows-latest) | **success** — `# tests 492 # pass 488 # fail 0 # skipped 4 # todo 0` |
| CI — Typecheck / Build | **success** |
| E2E — Electron smoke (ubuntu) | **success** |
| `npm run build` (local, Node 22.23.2) | **EXIT 0** |

CI run at `94d6653`: <https://github.com/MARKXAILABS/hello-markx/actions/runs/32452403583>
E2E run at `94d6653`: <https://github.com/MARKXAILABS/hello-markx/actions/runs/32452403601>

The four Windows skips are the pre-existing platform-gated cases, unchanged in count from the
478/474/**4** baseline. No test this plan added is among them: all three of this plan's files report
`# skipped 0` individually.

---

## Where `test/db-fts.test.cjs` was executed

**RUN LOCALLY, and in CI on all three platforms.** The `NOT RUN LOCALLY` branch does not apply — the
runtime probe opened a database on this machine, so the honest line is the other one.

```
$ node --test --test-reporter=tap test/db-fts.test.cjs
EXIT=0
# tests 6
# pass 6
# fail 0
# skipped 0
# todo 0
```

Those are the **TAP reporter's** counters (`# skipped 0`, not the spec reporter's `ℹ skipped 0`), which
is the point: `node --test` exits `0` for a file whose every test was bypassed, so the exit code alone
cannot tell a passing FTS5 test from an absent one.

CI ran the same file on ubuntu, macOS and Windows with **no rebuild step added** — `npm ci
--ignore-scripts` leaves the N-API prebuild in place, exactly as planned. Per-platform proof it
actually executed rather than being collected and skipped:

```
Test (ubuntu-latest)   ok 85 - open() creates memory_fts as a real FTS5 table and lands on user_version 2
Test (macos-latest)    ok 85 - open() creates memory_fts as a real FTS5 table and lands on user_version 2
Test (windows-latest)  ok 85 - open() creates memory_fts as a real FTS5 table and lands on user_version 2
```

---

## Task 1 — evidence, pasted

**B-sha, recorded before any edit:**

```
$ git rev-parse HEAD
efb367d65d6484617a27a4f60df4e77ef7a54a1c
```

### 1. `openLogs` — FLOOR-05's gap

```
$ grep -rn "openLogs" src/preload/ src/renderer/
EXIT=1
```

Empty. That empty grep **is** FLOOR-05's evidence: the main half was finished and the exposure half
did not exist.

### 2. `app:openLogs` — nothing to build in main

```
$ grep -n "app:openLogs" src/main/index.ts
4603:ipcMain.handle('app:openLogs', async () => {
EXIT=0
```

(The plan's pointer said `:4461`. Re-derived at execution: **`:4603`** — four waves have edited above it.)

### 3. The two dead exports and their handlers

```
$ grep -rn "memoryWakeUp\|reflectNow" src/ --include=*.ts --include=*.tsx
src/main/index.ts:4183:ipcMain.handle('hive:memoryWakeUp', (_evt, wing: unknown) =>
src/main/index.ts:4188:ipcMain.handle('memory:reflectNow', (_evt, id: unknown) =>
src/main/index.ts:4189:  reflector.reflectNow(typeof id === 'string' && id ? id : undefined));
src/main/reflect.ts:122:  /** True while a reflectNow() pass is in flight — serializes the loop (a slow
src/main/reflect.ts:159:    this.timer = setInterval(() => { void this.reflectNow(); }, ms);
src/main/reflect.ts:172:  async reflectNow(onlyId?: string): Promise<ReflectResult[]> {
src/preload/index.ts:830:  memoryWakeUp: (wing?: string): Promise<{ ok: boolean; output: string; error?: string }> =>
src/preload/index.ts:831:    ipcRenderer.invoke('hive:memoryWakeUp', wing),
src/preload/index.ts:836:  reflectNow: (id?: string): Promise<Array<{ id: string; condensed: boolean; ... }>> =>
src/preload/index.ts:837:    ipcRenderer.invoke('memory:reflectNow', id),
```

**Zero renderer callers** — every hit is the preload export, its main handler, or `reflect.ts`'s own
timer calling the class method directly. Deleting the two IPC paths breaks nothing, and the `reflect.ts`
hits prove it.

### 4. `fts5` — the index the docs promise, absent

```
$ grep -rn "fts5\|FTS5\|CREATE VIRTUAL TABLE" src/
src/main/kg-core.cjs:7:   * the same thing; keep it that way. (The SQLite FTS5 step named in the design
src/main/kg-core.cjs:174:  * design doc's SQLite FTS5 step is for.
src/main/kg-core.cjs:315:  *  SQLite FTS5 (docs/design/knowledge-graph.md), `contentHash` becomes a UNIQUE
EXIT=0

$ grep -rn "fts5\|FTS5\|CREATE VIRTUAL TABLE" src/ | grep -vc "kg-core"
0
```

Exactly the three `kg-core.cjs` hits and nothing else, as the criterion requires. Not one line of
FTS5 existed outside a comment describing it as a future step.

### 5. The overclaim

```
$ grep -rn "Enterprise Knowledge Graph" README.md src/preload/index.ts
src/preload/index.ts:345:  /** Enterprise Knowledge Graph (multimodal context for agents). Default OFF. */
src/preload/index.ts:379:/** Enterprise Knowledge Graph — corpus status, one document, and a search hit. */
src/preload/index.ts:839:  // ─── Enterprise Knowledge Graph (multimodal context for agents) ───────────
```

**Finding that corrects the plan:** `README.md` returns **zero** hits. The plan says to "rename the
`Enterprise Knowledge Graph` claim" in README — that clause is **ALREADY-SATISFIED**. README:101 reads
*"A knowledge base of your own documents… search is keyword scoring over text chunks, not entities or
a graph"*, which is precisely what `kg-core.cjs:7` means by *"The README says the same thing; keep it
that way."* Deleting correct prose to "fix" it would have destroyed it. The preload carries **three**
instances, not the one at `:838` the plan names.

### 6. `SQLITE_ENABLE_FTS5`, re-verified after the 13.x bump

```
$ grep -n "SQLITE_ENABLE_FTS5" node_modules/better-sqlite3/deps/defines.gypi
24:    'SQLITE_ENABLE_FTS5',
EXIT=0
```

Present. **Necessary, never sufficient** — that file is the define list for a *source* build and a
prebuilt binary is not obliged to match it, which is why 7 below is the evidence that counts.

### 7. The runtime FTS5 probe — the only command that proves the feature

```
$ node -e "const D=require('better-sqlite3'); const db=new D(':memory:'); db.exec('CREATE VIRTUAL TABLE t USING fts5(text, agent_id UNINDEXED)'); console.log('FTS5 USABLE', db.prepare('select sqlite_version() v').get().v)"
FTS5 USABLE 3.53.4
EXIT=0
```

**FTS5 is usable on this machine, and `test/db-fts.test.cjs` therefore runs here.** The pre-plan-01
constraint has dissolved exactly as predicted: 13.0.3 is N-API and the prebuild loads under plain
`node`.

### 7b. The `IF NOT EXISTS` grammar question, settled

```
$ node -e "const D=require('better-sqlite3'); const db=new D(':memory:'); db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS t USING fts5(text, agent_id UNINDEXED)'); db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS t USING fts5(text, agent_id UNINDEXED)'); console.log('IF NOT EXISTS ACCEPTED (twice, idempotent)')"
IF NOT EXISTS ACCEPTED (twice, idempotent)
EXIT=0
```

**Accepted, and idempotent on a second run.** So the guard is **KEPT**, not silently dropped. Run
twice deliberately: accepting the syntax once proves the parser, running it twice proves the guard.

### 8. The native binaries actually installed

```
$ find node_modules/better-sqlite3 -name '*.node'
node_modules/better-sqlite3/prebuilds/darwin-arm64.node
node_modules/better-sqlite3/prebuilds/darwin-x64.node
node_modules/better-sqlite3/prebuilds/linux-arm64.node
node_modules/better-sqlite3/prebuilds/linux-x64.node
node_modules/better-sqlite3/prebuilds/linuxmusl-arm64.node
node_modules/better-sqlite3/prebuilds/linuxmusl-x64.node
node_modules/better-sqlite3/prebuilds/win32-arm64.node
node_modules/better-sqlite3/prebuilds/win32-x64.node
```

Eight prebuilds, every CI platform covered. Compare the plan-time measurement (`no matches at all`) —
this is the 13.x bump landing.

### 9. Which CI job produces a Node-ABI `better-sqlite3`

```
$ grep -n "rebuild" .github/workflows/ci.yml
10:# better-sqlite3 13.x is N-API and ships a prebuild for every platform in the
11:# matrix, so it loads under Node 24 and the `test` jobs must never rebuild it -
12:# doing so throws the prebuild away and forces a node-gyp compile that only the
27:      # --ignore-scripts skips postinstall's electron-rebuild: tsc needs the
69:      # postinstall runs electron-rebuild, which builds node-pty for the ELECTRON
78:      # scope on non-win32. node-pty ships prebuilds for darwin-* and win32-* but
82:      # Cheap and non-flaky everywhere a prebuild exists: node-pty's install
94:        run: npm rebuild node-pty
110:      - name: Install dependencies (without the native rebuild)
114:      # This is the one historically flaky step — node-gyp, winpty, prebuilds.
117:      # the compile below is a hard gate. The release workflow rebuilds for
120:        run: npx electron-rebuild -f
```

**Answer: NONE, and that is the correct answer, not a gap.** Read per job, from the two `run:` lines —
lines 10-12, 27, 69, 78, 82, 114 and 117 are comments and prove nothing:

| Job | Rebuild step | ABI | Relevant? |
|-----|--------------|-----|-----------|
| `test` (×3 platforms) | `:94` `npm rebuild node-pty` | Node | node-pty only — never better-sqlite3 |
| `build` | `:120` `npx electron-rebuild -f` | **Electron** | wrong ABI for `node --test`; this is for the packaged app |

No job produces a Node-ABI `better-sqlite3` and none needs to: 13.0.3 is N-API, so the ABI question no
longer exists. Corroborating facts:

```
$ grep -c "npm rebuild better-sqlite3" .github/workflows/ci.yml     → 0   (same value plan 01 asserts)
$ grep -n 'NODE_VERSION' .github/workflows/ci.yml                   → 15:  NODE_VERSION: "22"
$ node -e "…package-lock…"                                          → 13.0.3
```

### Where `test/db-fts.test.cjs` actually runs

In the **CI `test` matrix on Node 22, on all three platforms**, under `npm ci --ignore-scripts` with no
rebuild step — and **also on this dev machine**, because `new Database(':memory:')` opens here. Both
were measured, neither predicted.

### Per-clause classification

| Req | Clause | Status at B-sha |
|-----|--------|-----------------|
| FLOOR-05 (#13) | main handler `app:openLogs` complete | **ALREADY-SATISFIED** — do not touch |
| FLOOR-05 (#13) | preload export | **OPEN** |
| FLOOR-05 (#13) | Settings affordance | **OPEN** |
| FLOOR-07 (#16) | `memoryWakeUp` / `reflectNow` dead exports + handlers | **OPEN** |
| FLOOR-07 (#31) | `Enterprise Knowledge Graph` in `src/preload/index.ts` | **OPEN** (×3, not ×1) |
| FLOOR-07 (#31) | `Enterprise Knowledge Graph` in `README.md` | **ALREADY-SATISFIED** — 0 hits |
| FLOOR-07 (#32) | FTS5 index in the schema | **OPEN** |
| FLOOR-07 (#32) | scope predicate | **OPEN** |
| FLOOR-07 (D-35/36) | the sharing model surfaced in UI/docs | **OPEN** |

`knowledgeGraph.enabled` **stays `false`** (D-34) — `src/main/config.ts:497` unchanged, verified after
the work. The knowledge **graph** (V2-05) was formally **RETIRED**, not deferred: no renderer panel for
it was built, and none may be resurrected as a nicety.

**`npm test` baseline before any edit: EXIT 0** — `tests 478 · pass 474 · fail 0 · skipped 4`.

---

## Task 2 — the migration, the predicate, the real-SQLite test

**Commit `ba4fd9a`.** `user_version` goes **1 → 2**.

The migration is **appended**, never edited: the existing entry is untouched, so an install that has
already run it is unaffected and gets the new table on next open. No `throw` inside it — the
quarantine path at `db.ts:82-96` only fires for corruption, and a throw raised by a migration escapes
it and leaves the store permanently unopenable.

`CREATE VIRTUAL TABLE **IF NOT EXISTS**` — accepted, kept (§7b above).

`agent_id`/`project` are `UNINDEXED` on purpose: indexed, they would join the searchable text and a
query term equal to an agent id would match that agent's rows — the cross-agent leak the predicate
exists to close, reopened through the index.

### Acceptance, run

```
$ grep -ci "fts5" src/main/db.ts                                     → 3
$ grep -c "memory_fts" src/main/memory.ts                            → 4
$ grep -c "FakeDatabase" test/db-fts.test.cjs                        → 0
$ grep -cE "\.skip\(|\.todo\(|skip:|todo:" test/db-fts.test.cjs      → 0
$ grep -cE "^(const|let|var) .*require\('better-sqlite3'\)" test/…   → 1
$ grep -cE "^try" test/db-fts.test.cjs                               → 0
$ grep -c "sqlite_master" test/db-fts.test.cjs                       → 2
$ grep -c "knowledgeGraph" src/main/config.ts                        → 2   (unchanged; :497 still `false`)
$ grep -c "npm rebuild better-sqlite3" .github/workflows/ci.yml      → 0
$ grep -n 'NODE_VERSION' .github/workflows/ci.yml                     → 15:  NODE_VERSION: "22"
$ node -e "…package-lock…"                                            → 13.0.3
```

**CI containment, base bound inside the criterion:**

```
$ BASE=efb367d65d6484617a27a4f60df4e77ef7a54a1c; test -n "$BASE" && git rev-parse --verify -q "$BASE" >/dev/null && N=$(git log --format=%H "$BASE"..HEAD -- .github/workflows/ | wc -l) && echo "WORKFLOW-COMMITS=$N" || { echo "UNBOUND BASE — CRITERION FAILS"; false; }
WORKFLOW-COMMITS=0
```

This plan authored no commit touching `.github/workflows/`.

### The cross-agent negative assertion, pasted

```js
// The scoping clause. Same query, different agent.
assert.deepEqual(
  store.searchMemory('thirty days', { agentId: 'jim-b2' }),
  [],
  "jim-b2 can recall pam-a1's notes. The WHERE agent_id = ? predicate is not being applied, "
  + 'so memory recall leaks across agents — and SCALE-01 and RECALL-02 both build on the '
  + 'assumption that this predicate is the seam they bind server-side.'
);
```

It is preceded by a **positive control** on the same data (`searchMemory('thirty days', {})` must return
`1`), because a MATCH that silently matches nothing would satisfy the negative assertion for entirely
the wrong reason and make the whole file pass over a broken index.

### Negative controls on the new test

| Control | Change | Result |
|---------|--------|--------|
| A | `if (opts.agentId)` → `if (false && opts.agentId)` — the scope predicate dropped | **EXIT 1**, `# fail 1`, failing on the cross-agent assertion |
| B | `CREATE VIRTUAL TABLE … USING fts5(` → `CREATE TABLE (` | **EXIT 1**, `# fail 6` — every test |
| restored | — | **EXIT 0**, `# pass 6 # fail 0 # skipped 0 # todo 0` |

### T-P10-03, discriminated rather than asserted

The MATCH sanitiser is pinned by a control that a weaker implementation would fail: `password OR
pineapple` must return **zero** rows. `OR` reaching FTS5 as an *operator* matches the row on `password`
alone; `OR` reduced to a *term* does not, because neither "or" nor "pineapple" is in the text. A
sanitiser that merely escaped quotes passes the no-throw loop and fails this.

---

## Task 3 — the honesty and exposure sweep

**Commit `6a8e550`.**

### Acceptance, run

```
$ grep -c "openLogs" src/preload/index.ts                                  → 1
$ grep -c "openLogs" src/renderer/src/components/SettingsModal.tsx         → 2
$ grep -c "memoryWakeUp\|reflectNow" src/preload/index.ts                  → 0
$ grep -c "hive:memoryWakeUp\|memory:reflectNow" src/main/index.ts         → 0
$ grep -c "Enterprise Knowledge Graph" README.md                           → 0
$ grep -c "Enterprise Knowledge Graph" src/preload/index.ts                → 0
$ grep -c "app:openLogs" src/main/index.ts                                 → 1   (PRESERVATION — untouched)
$ grep -c "scope" src/renderer/src/components/MemoryPanel.tsx              → 4
$ grep -c "aria-label" .../SettingsModal.tsx                               → 2   (was 2 — none added)
$ grep -ciE "arriving|will ship|once .* ships" …/bug_report.yml            → 0
$ node --test test/repo-claims.test.cjs   → EXIT 0, # tests 11 (plan 07 left 5; +6)
```

`bug_report.yml` parses (js-yaml, 9 fields) and its Logs description now reads:

> **From an installed build:** attach `main.log` (and `main.log.1` if it is there — the log rotates once
> at 5 MB). Open the folder from the app: **Settings → General → Log folder → `open logs`**. **From a
> dev build:** the terminal output of `npm run dev` is the same content and is easier to copy. Either
> way, the DevTools console (View → Toggle Developer Tools) carries renderer errors that never reach the
> file, so paste anything red there too. A screenshot or short clip is just as good for anything visual.

No by-hand platform paths, no "arriving" marker. **This discharges plan 04's declared forward
dependency** — FLOOR-17's template asked for "Logs" and that ask was unanswerable until this row shipped;
the wording now matches the row that exists.

### The six new `repo-claims` clauses, each driven RED before being trusted

| Control | Change | Result |
|---------|--------|--------|
| C1 | delete the `openLogs` preload export | **RED** — clause 6 |
| C2 | re-export `memoryWakeUp` | **RED** — clause 7 |
| C3 | put `Enterprise Knowledge Graph` back in README | **RED** — clause 8 |
| C4a | `USING fts5(` → a plain table | **RED** — clause 9 |
| C4b | fold `MIGRATIONS` back to one entry | **RED** — clause 9 |
| C5a | `test(` → `test.skip(` in db-fts | **RED** — clause 10 |
| C5b | one-line guarded driver load | **initially GREEN → see below** |
| C5c | multi-line guarded driver load | **RED** — clause 10 |
| C5d | driver load moved into a function | **RED** — clause 10 |
| C6a | `better-sqlite3` → `^11.10.0` | **RED** — clause 11 |
| C6b | `npm rebuild better-sqlite3` in the CI test job | **RED** — clause 11 |

**C5b is the finding.** The first version of the top-level-load pin was
`/^(?:const|let|var) .*require\('better-sqlite3'\)/m`, and `let Database; try { Database =
require('better-sqlite3'); } catch { return; }` **satisfies it** — that line starts with `let` and
contains the require. The control stayed green, which means the pin was decoration. Fixed at source:
the pin now matches the WHOLE load line against an exact top-level-binding shape and additionally
asserts no `try` opens before the load. C5b, C5c and C5d all go red against the corrected pin. A
control that will not go red is not a control, and this one nearly shipped as one.

### The `continue-on-error` clause, corrected

The plan's clause says `ci.yml` should contain "no `continue-on-error`". **That is false at HEAD and
was false before this plan ran**: `:37` (advisory `npm audit`, lint job) and `:119` (the flaky native
rebuild, build job) both carry it deliberately, and `CONTRIBUTING.md` says "anywhere in the *test
matrix*" for exactly that reason. Asserting the plan's literal wording would have been red on arrival.
The property the plan actually wants — **no `continue-on-error` in the test matrix, parsed not
grepped** — is already fully pinned by `test/ci-config.test.cjs:161`, job-level and per-step. Adding a
duplicate would have been redundant; the new clause covers the two facts that were **not** yet pinned
(the 13.x range, and no `npm rebuild better-sqlite3` in any workflow's parsed `run:` steps).

---

## Task 5 — FLOOR-10 closes, FLOOR-09 hard-gated

**Commit `94d6653`.**

### The FLOOR-09 hard gate — run, not assumed

```
$ grep -c "recordCostSample" src/main/index.ts                                        → 1
$ grep -c "FLOOR-09 PRODUCTION INJECTION LANDED" .planning/…/01-08-SUMMARY.md          → 2
```

```
FLOOR-09 INJECTION: PRESENT — GATE PASSES
```

`01-08` applied `01-06`'s handoff at `index.ts:525`. The `STOP and report FLOOR-09 INJECTION MISSING`
branch did not fire. It is also now pinned by a test in this plan (below), so it cannot silently
regress between here and plan 23.

### The anchor, re-derived by content

```
$ grep -n "const inputs: BreakerInput\[\]" src/main/index.ts
1570:  const inputs: BreakerInput[] = [];
```

**1570**, not 01-09's recorded 1560 — this plan's own earlier commits moved it. Derived by content
every time, never from a document.

### The injection

```
    inputs.push({
      agentId: id,
      sample,
+     budget: hive.budgetForAgent(id) ?? undefined,   // FLOOR-10 (#34) — per-card token cap
      progressing: now - lastCoordinationAt(id) < progressWindowMs || now - lastSpanAt < progressWindowMs
    });
```

**(a)** `grep -c "budgetForAgent" src/main/index.ts` → **1** (baseline `0`).

**(b)** The hit is real code inside the literal:

```
anchor=1570
1                                                        ← comment-stripped count
1613:      budget: hive.budgetForAgent(id) ?? undefined,   // FLOOR-10 (#34) — per-card token cap
```

`1613` is 43 lines below the anchor, inside the required 60.

### Same-commit criterion — asserted over this task's own recorded SHA, never `HEAD`

```
$ SHAS="94d665312283b417c90a60eaa86de0ec7a16d3cc"; for sha in $SHAS; do i=$(git show --name-only --format= "$sha" | grep -cx "src/main/index.ts"); t=$(git show --name-only --format= "$sha" | grep -cx "test/engine-parity.test.cjs"); echo "$sha index=$i test=$t"; done
94d665312283b417c90a60eaa86de0ec7a16d3cc index=1 test=1
```

```
$ for sha in $SHAS; do git show --stat "$sha"; done
94d6653 feat(01-10): feed the FLOOR-10 budget arm from the production breaker beat (#34)
 src/main/index.ts           |  1 +
 test/engine-parity.test.cjs | 99 +++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 100 insertions(+)
```

One line, reading `index=1 test=1`. No `index=1 test=0` or `index=0 test=1` line exists, so the red
window this task exists to avoid was never reopened.

### The wiring test can fail — demonstrated

| Control | Change | Result |
|---------|--------|--------|
| D1 | delete the `budget:` property | **EXIT 1**, `# pass 25 # fail 1` on the FLOOR-10 test |
| D2 | demote it to `// budget: hive.budgetForAgent(id) — pulled in wave 6` | **EXIT 1**, `# fail 1` — **while `grep -c "budgetForAgent" src/main/index.ts` still returned `1`** |
| D3 | `telemetry.recordCostSample(s)` → `void s` | **EXIT 1**, `# fail 1` on the FLOOR-09 pin |
| restored | — | **EXIT 0**, `# pass 26 # fail 0 # skipped 0 # todo 0` |

D2 is the one that matters: it is the exact fake a bare grep criterion accepts, and the structural
window rejects it.

### Divergence from BOTH prescribed slice forms — deliberate, and reported

The plan mandates *"slice(anchor, anchor + 2000) then strip comments"*. **01-09 measured that form and
it is broken**: `runBreakerBeat`'s body is ~70% comment prose, so the raw 2,000 characters after the
anchor stop three lines before `inputs.push({` and the test is red no matter what `index.ts` contains.
01-09's SUMMARY corrects it to strip-then-bound (6,000 raw → strip → first 2,000) — better, but still a
**fixed byte count** on a file that grows every wave.

**This plan uses neither.** The window is bounded by STRUCTURE: `const inputs: BreakerInput[]` →
`inputs.push({` → the `});` that closes the literal. It cannot drift with file size, it is strictly
tighter than either byte window (the regex can only match *inside* the literal), and each of the three
delimiters carries its own re-derive-me assertion. It also carries a **positive control on the window
itself** — `agentId: id,` must match before the budget assertion is trusted — which is what exposed the
broken window in 01-09 and is the only reason to believe a negative result here.

01-09's copy of the snippet is not this plan's to edit; the divergence is recorded here instead.

### Pass-count floors, both bounds

```
B-pass-ep-w5 (measured HERE, before touching the file):
  EXIT=0  # tests 24  # pass 24  # fail 0  # skipped 0  # todo 0

post-edit:
  EXIT=0  # tests 26  # pass 26  # fail 0  # skipped 0  # todo 0
```

- ≥ **B-pass-ep-w5 + 1** = 25 → **26** ✔ (delta **+2**: the FLOOR-10 wiring test *and* a FLOOR-09 sink pin)
- ≥ **25** absolute → **26** ✔
- ≥ **24** floor → **24** ✔, so plan 09's tests are all in the tree. Neither STOP condition fired.
- B-pass-ep-w5 (**24**) equals the post-run `# pass` recorded in `01-09-SUMMARY.md` (**24**). No discrepancy.

### Survival by name, not by count

```
$ grep -c "'constrained'" test/engine-parity.test.cjs    → 3   (floor 2 — plan 09's breaker-budget cases)
$ grep -c "recordCostSample" test/engine-parity.test.cjs → 8   (floor 6 — plan 06's calls, plus this plan's pin)
$ grep -cE "\.skip\(|\.todo\(|skip:|todo:" …             → 0
```

Neither dropped.

---

## Built-artifact evidence (short of a human click)

`npm run build` under **Node 22.23.2 / npm 10.9.8** (the exact pairing CI's `setup-node` installs) —
**EXIT 0**. Every change reaches the shipped bundles:

```
out/renderer/assets/index-*.js   "open logs"                                          → 1
out/renderer/assets/index-*.js   "Log folder"                                         → 1
out/renderer/assets/index-*.js   "Memory is shared across the whole hive by default"  → 1
out/preload/index.js             openLogs                                             → 1
out/preload/index.js             memoryWakeUp / reflectNow                            → 0 / 0
out/main/index.js                memory_fts                                           → 9
out/main/index.js                budgetForAgent                                       → 3
out/main/index.js                app:openLogs                                         → 1
out/main/index.js                hive:memoryWakeUp                                    → 0
```

This proves the row, the warning and the export are compiled into the app, not merely present in
source. It does **not** prove a human clicking the button opens a folder — see the gap below.

---

## Deviations from Plan

### Auto-fixed / auto-added

**1. [Rule 2 — missing critical functionality] `MemoryManager` is wired to the open `PersistStore` in `src/main/index.ts`**
- **Found during:** Task 2.
- **Issue:** Task 2's `<files>` list is `db.ts, memory.ts, test/db-fts.test.cjs` and names no wiring. With no wire, `getStore` is `undefined`, `memory_fts` is never written, and the must-have truth *"Memory recall is backed by a real SQLite FTS5 index in the already-open PersistStore"* is FALSE — the exact minted-but-never-wired failure this whole phase exists to remove (the same shape as FLOOR-05 and FLOOR-09/10).
- **Fix:** `new MemoryManager(..., () => persist, (agentId) => hive.registry().agents[agentId]?.cwd ?? null)`. `src/main/index.ts` **is** in the plan's frontmatter `files_modified`, and this plan is wave 5's T-INDEX owner, so this is inside the plan's declared surface.
- **Commit:** `ba4fd9a`.

**2. [Rule 1 — bug] `MemoryStatus.scope` was missing from the preload mirror**
- **Found during:** Task 3 (surfaced by `npm run typecheck` EXIT 2).
- **Issue:** `MemoryManager.status()` has returned `scope` since it was written (`memory.ts:220-233`), and `src/preload/index.ts`'s `MemoryStatus` mirror silently dropped it. The renderer therefore **could not** surface the sharing model even though main was already reporting it — the honesty half of D-35 was unimplementable, not merely unimplemented.
- **Fix:** added `scope: 'shared' | 'agent'` to the preload interface.
- **Commit:** `6a8e550`.

**3. [Rule 1 — bug] the top-level-load pin in `repo-claims` was satisfiable by the guard it forbids**
- **Found during:** Task 3 controls. Detailed above under C5b. Fixed at source; three guard shapes now go red.
- **Commit:** `6a8e550`.

**4. [Rule 3 — blocking] `test/db-fts.test.cjs`'s own operator assertion asserted a wrong fact about its fixture**
- **Found during:** Task 2. My first version asserted `'password AND NOT staging'` returns 1 row. FTS5 combines bare phrases with an implicit AND, so a sanitiser that correctly turns `AND`/`NOT` into literal terms returns **0** — the document contains neither word. The SOURCE was right and my assertion was wrong.
- **Fix:** replaced with a *sharper* pair — a positive control (`'staging, password!'` → 1) and a real discriminator (`'password OR pineapple'` → 0). Not a weakening: the new form rejects an implementation the old one accepted. No source behaviour was changed to make a test pass.

### Deliberate divergences from the plan text

**5. The FLOOR-10 wiring window is bounded structurally, overriding both prescribed forms.** Detailed in
Task 5. The plan's form is measurably broken; 01-09's correction is still a fixed byte count.

**6. `README.md`'s "Enterprise Knowledge Graph" rename was ALREADY-SATISFIED and was NOT performed.**
Zero hits at B-sha. README:101 already states the honest thing, and `kg-core.cjs:7` explicitly says to
keep it that way. Deleting correct prose to satisfy a plan clause would have destroyed it — the same
call `01-04` made on `CONTRIBUTING.md:82-101`. The `--wing` limitation sentence WAS added.

**7. The preload carried three instances of the overclaim, not the one at `:838` the plan names.** All
three renamed; the acceptance criterion (`grep -c … → 0`) demands it.

**8. Two comments in `src/main/index.ts` (`:552`, `:4201`) also carried the overclaim and were renamed**,
beyond the plan's "two line-level deletions only" for that file. Leaving the claim in the very file the
plan renames it out of would have recreated the defect one line over — the exact second-instance
problem `01-08` warned about. `app:openLogs` was **not** touched (`grep -c` still `1`).

**9. The `continue-on-error` clause was re-scoped to what is true.** Detailed in Task 3.

**10. `.github/ISSUE_TEMPLATE/bug_report.yml`'s pointer said `:4461` for `app:openLogs`; it is `:4603`.**
Anchor drift, recorded below.

### Authentication gates

None. No auth gate occurred at any point in this plan.

---

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or trust-boundary schema change was
introduced beyond the register in the plan.

`T-P10-05` (path traversal) remains **accept**: `app:openLogs` takes no caller-supplied path — it opens
`logsDir()` — and this plan added no path-taking IPC. `T-P10-01` remains **mitigate (partially) +
document**, exactly as registered: the predicate exists and is pinned, its INPUT is still
agent-supplied, and the panel, `README.md`, the preload doc comment and `memory.ts`'s own header all say
so in those words.

---

## Known Stubs

None. Every surface this plan added is wired end to end and proven at run time:

- `memory_fts` is created by a migration, written by the mine loop, read by `keywordSearch()`, reachable
  from `search()` when mempalace is absent, and present in `out/main/index.js`.
- `openLogs` exists in the preload, is called by `SettingsModal`, resolves to a live handler, and is
  present in `out/preload/index.js`.
- `budget` is populated from the production beat and consumed by 01-09's breaker arm.

---

## Anchor drift, recorded for later plans and 01-23's greps

| What | Plan/doc says | Measured at `94d6653` |
|------|---------------|----------------------|
| `ipcMain.handle('app:openLogs')` | `index.ts:4461` | **`:4603`** |
| `const inputs: BreakerInput[]` | `01-09`: `:1560` | **`:1570`** |
| Home folder row | `SettingsModal.tsx:880-894` | `:880-894` at read time; Log folder now sits at `:924-953` |
| preload dead exports | `:828-829` / `:834-835` | were `:830-831` / `:836-837`; now deleted |
| preload KG section header | `:838` | was `:839`, and there were **three** instances (`:345`, `:379`, `:839`) |

---

## NOT SATISFIED / PARTIAL — stated loudly

**1. The plan's manual verification clause is NOT satisfied.**

> *Manual: open Settings → General in the dev app, click `open logs`, and confirm the OS file manager
> opens the log folder. Then confirm the Memory panel shows the shared-scope warning.*

```
MEASUREMENT UNAVAILABLE — a human must run `npm run dev`, open Settings → General,
click `open logs` and confirm the OS file manager opens the log folder; then open the
Memory panel and confirm the shared-scope warning renders.
```

This is an interactive GUI observation on a live Electron window and cannot be produced from a headless
session. What IS proven instead, and it is not nothing: the handler is unchanged and live
(`grep -c "app:openLogs"` → 1, present in `out/main/index.js`), the preload export reaches the bundle,
the button label `open logs`, the section label `Log folder` and the warning's first sentence are all
present in the built renderer bundle, typecheck is green, and the Electron smoke E2E job passed. The
untested link is precisely the last one — a real click producing a real `shell.openPath`. Filed as a
STATE blocker. **Plan 23 must not tick FLOOR-05 on the evidence above alone.**

**2. FLOOR-07 is not wholly closed by this plan, and this plan does not claim it is.**
Seven `"Enterprise Knowledge Graph"` sites survive outside this plan's declared files — most
importantly the **agent-facing** `resources/skills/capabilities/SKILL.md:96`. Logged with exact
`file:line` in `deferred-items.md` and as a STATE blocker. Editing `src/main/hive.ts` /
`src/main/config.ts` here would risk a lost update (`use_worktrees: false`, wave-5 siblings).

**3. Requirement rows left `Pending` in `REQUIREMENTS.md`** for FLOOR-05, FLOOR-07 and FLOOR-10 —
matching the `01-02`/`04`/`05`/`06`/`07`/`08`/`09` precedent: **plan 23 owns the checkboxes.** FLOOR-10's
code half is genuinely complete and proven; FLOOR-05's code half is complete with the manual clause
outstanding; FLOOR-07's honesty half has the residual above.

---

## Self-Check: PASSED

Files claimed as created/modified, checked on disk:

```
FOUND: test/db-fts.test.cjs
FOUND: src/main/db.ts
FOUND: src/main/memory.ts
FOUND: src/main/index.ts
FOUND: src/preload/index.ts
FOUND: src/renderer/src/components/MemoryPanel.tsx
FOUND: src/renderer/src/components/SettingsModal.tsx
FOUND: README.md
FOUND: .github/ISSUE_TEMPLATE/bug_report.yml
FOUND: test/repo-claims.test.cjs
FOUND: test/engine-parity.test.cjs
```

Commits claimed, checked in `git log`:

```
FOUND: ba4fd9a  feat(01-10): FTS5 keyword recall in the already-open PersistStore, scoped by predicate
FOUND: 6a8e550  feat(01-10): wire the log folder to Settings, say the sharing model out loud, drop two dead exports
FOUND: 94d6653  feat(01-10): feed the FLOOR-10 budget arm from the production breaker beat (#34)
```

All present. Every metric in this document was produced by a command run in this session, and every
claim that could not be measured is marked `MEASUREMENT UNAVAILABLE` rather than asserted.
