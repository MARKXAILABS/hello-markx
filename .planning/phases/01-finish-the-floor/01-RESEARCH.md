# Phase 1: Finish the Floor — Research

**Researched:** 2026-08-20
**Domain:** Electron desktop app maintenance — runtime major-version migration, local trust boundary, cost arithmetic, renderer performance, release provenance, lint/test infrastructure
**Confidence:** HIGH on current-source facts (every claim below carries a `file:line` I read in this session); MEDIUM on the Electron-43 migration surface (verified against official breaking-change docs + npm registry, not against a live build); LOW on the size of the ESLint finding set (unmeasured — see Open Question 1).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

All 47 decisions D-01…D-47 in `.planning/phases/01-finish-the-floor/01-CONTEXT.md` are locked. They are not restated here. This research **does not contradict any of them**; where it adds information a decision did not have, that is called out explicitly as an **amendment note** attached to the decision by number.

Amendment notes raised by this research (detail in the sections below):

| Decision | Status after research | Note |
|----------|----------------------|------|
| D-06 (`better-sqlite3` bump is a *contingency*) | **Reclassify as near-certain** | better-sqlite3 11.10.0 compiles against **raw V8** (`v8::` in `src/better_sqlite3.cpp`, no N-API). Upstream reports 12.4.1 already failing at Electron 39 on a removed V8 API. 13.0.0 is the first N-API release and explicitly lists Electron 42–43. Plan the bump as work, not as a branch. |
| D-28 (`eslint-plugin-react-hooks` ONLY, "two rules") | **Amend: needs a TS parser, and v7's preset is not two rules** | ESLint core cannot parse `.ts`/`.tsx` at all without a parser — `@typescript-eslint/parser` is **mandatory**, as a parser only. And `eslint-plugin-react-hooks@7`'s `configs.flat.recommended` now carries the React Compiler rule set (~17 rules), not two. Use an explicit two-rule config, not the preset. |
| D-38(b) (four stale `HIVE.md` denials) | **Substance confirmed, one anchor off by one** | `:272` should read `:271`. A fourth anchor is `:124-126`, not `:126` alone. All four claims verified false against source. |
| D-40 / FLOOR-18 | **Confirmed** | `src/main/index.ts:269` is the bare `return false`, verbatim. |
| VERDICT-03 | **Already satisfied in source** | `leastLoadedIdle` already filters on `canReceiveInbox` (`src/main/hive.ts:1746`). See "Requirements Already Satisfied". |

### Claude's Discretion

Copied verbatim from CONTEXT.md:

- Plan slicing and wave assignment across the 23 requirements — subject to the hard constraint that the Electron bump (D-03) is plan 1 and gates everything else.
- Exact disjoint file-ownership lists per agent (the proven method; `use_worktrees: false`).
- Which specific presentational components get static-render tests (D-26 gives candidates).
- Whether `better-sqlite3` is bumped, which is contingent on the D-06 compile result.
- The exact shape of the `capabilityLine` platform argument vs `remote` bit (D-40).

This research supplies a concrete recommendation for each of the five.

### Deferred Ideas (OUT OF SCOPE)

Copied verbatim from CONTEXT.md — do not research, plan or build any of these:

- `node:sqlite` FTS5 in the `kg-core.cjs` sidecar.
- Server-enforced memory scope (RECALL-02, Phase 5).
- Socket peer-credential binding (SO_PEERCRED / `GetNamedPipeClientProcessId`).
- HMAC / nonce replay protection on hook payloads.
- Windows and macOS Electron-launching e2e runners.
- Full `typescript-eslint` **ruleset** (the *parser* is a separate thing — see amendment above).
- React Testing Library + jsdom.
- A knowledge-graph renderer panel (the graph was **retired**, not deferred).
- `better-sqlite3` 12/13 bump *as planned work* — but see the D-06 amendment: the contingency has become the expected path.

</user_constraints>

<phase_requirements>
## Phase Requirements

23 IDs. "Research Support" names the section below that gives the planner what it needs.

| ID | Description (abbreviated from REQUIREMENTS.md) | Research Support |
|----|-----------------------------------------------|------------------|
| FLOOR-01 | `autoMode` visible on the agent card | Verified absent: `grep -c autoMode src/renderer/src/components/AgentCard.tsx` → **0**. Renderer wave, § Wave Plan. |
| FLOOR-02 | Window close stops no delivery path; queue-drain + idle-quiesce move to main; no doc promises a dead path | § FLOOR-02: the real body. Largest single item. Anchors verified. |
| FLOOR-03 | Electron on a supported major, natives rebuilt, 3-platform suite green | § The Electron 32 → 43 Migration. Ten verified findings incl. two that break CI. |
| FLOOR-04 | Secret scrubbed before the hive commits it | § FLOOR-04: genuinely open. `redactSecrets` exists but is mail-only. |
| FLOOR-05 | Open the log folder from Settings | § Inert Features Found: main handler exists, **no preload export, no UI caller**. |
| FLOOR-06 | Provenance + published checksums + release-link gate in pipeline | § FLOOR-06: two of three clauses **already true**. One step to add. |
| FLOOR-07 | Memory recall scoped per agent/project; SQLite FTS index exists | § FLOOR-07: FTS5 verified compiled in; honesty half is the bulk. |
| FLOOR-08 | "Done" verified by someone else; unanswered `requires_reply` chased | § VERDICT-02/03 + FLOOR-08. Three defects found, one more than the roadmap names. |
| FLOOR-09 | Every engine's spend reaches the breaker; god told capabilities cache-safely | § FLOOR-09: one-call edit confirmed (`recordCostSample` has zero production callers). |
| FLOOR-10 | Per-task token budget **enforced** | § Spend Arithmetic + § Breaker Ladder Mechanics (the one-level-per-beat constraint). |
| FLOOR-11 | PTY byte doesn't re-render roster; pool bounded and disposes | § FLOOR-11: two of three clauses already landed; the **four-pollers** clause is inert code. |
| FLOOR-12 | Icon buttons named; text ≥ 14px | § FLOOR-12. Measured: 49 `aria-label` / 133 `<button>`; 4 tokens below floor. |
| FLOOR-13 | Sidebar collapses responsively; four renderings agree, incl. cost | § FLOOR-13. Depends on FLOOR-10's `hive:tasks` widening. |
| FLOOR-14 | Notification on blocked / long task; click focuses | § FLOOR-14: click-to-focus and long-task **already landed**. Remaining gap is narrow. |
| FLOOR-15 | Real renderer test coverage beyond boot smoke | § FLOOR-15. Fold the `load-ts.cjs` change into Wave 1. |
| FLOOR-16 | ESLint replaces the 13 orphaned disables | § FLOOR-16. Two amendments to D-28; 9+4 split confirmed exactly. |
| FLOOR-17 | Bug template asks for logs that exist; `docs/adr/` is home for rationale | § FLOOR-17. Templates + 4 existing ADRs verified. |
| FLOOR-18 | Codex-on-Windows supported or limitation stated | § FLOOR-18. `index.ts:269` verified verbatim. |
| GATE-01 | Agent cannot post a hook payload claiming to be another agent | § GATE-01. All three D-11/D-12/D-13 anchors verified. |
| RECORD-03 | `taskSpend()` over all rows, not a 1 MB tail | § Spend Arithmetic. `hive.ts:244` + `:2571` verified. |
| RECORD-04 | Cost from **differences** between cumulative snapshots | § Spend Arithmetic. Mixed row semantics verified at `index.ts:1513` and `hooks.ts:272`. |
| VERDICT-02 | A card done while everyone is busy is still reviewed later | § VERDICT-02/03. Root cause is a consumed transition edge — exact mechanism below. |
| VERDICT-03 | A reviewer that cannot receive mail is never selected | **Already satisfied** — `hive.ts:1746`. Becomes verify-and-pin, plus a REQUIREMENTS.md correction. |

</phase_requirements>

## Summary

This phase is not 23 pieces of new construction. It is **23 acceptance clauses, of which a material fraction are already satisfied by code that landed after the audit was written, and a second fraction are satisfied by code that exists but has zero callers.** That is the same shape that produced the recorded 2026-08-20 error in both directions — four issues wrongly called done, and (as this research found) at least five clauses wrongly assumed open. D-42's per-clause bar is the right instrument for both. The single highest-value planning move is to make the first task of every plan a **clause-by-clause `grep`/read against current source**, with the output pasted, before any code is written.

The Electron bump is correctly wave 1 and correctly solo, and it is riskier than CONTEXT.md assumed in exactly two places that CI will hit on the first run. First, `better-sqlite3@11.10.0` is a **raw-V8** addon (`v8::` throughout `src/better_sqlite3.cpp`; deps are only `bindings` + `prebuild-install`, no `node-addon-api`), and upstream already reports 12.4.1 failing to build at Electron 39 on `Context::GetIsolate()` being removed from V8. Electron 43 carries V8 **15.0**, seven majors past Electron 32's. Treat the 13.x bump as the plan, not the fallback; 13.0.0 is the first N-API release and its notes name Electron 42–43. Second, and more insidiously: `electron@43`'s npm `index.js` ends with `module.exports = getElectronPath()`, and that function now **downloads the binary on demand** when `path.txt` is absent. Every `ci.yml` `test` job installs with `npm ci --ignore-scripts`, and `test/load-ts.cjs:30` calls `require('electron')` — so the first `loadTs()` of an electron-importing module will trigger a ~100 MB network download on all three test runners instead of the clean throw the current comment documents. `node-pty@1.1.0`, by contrast, is **low risk**: it builds on `node-addon-api ^7.1.0` (N-API, ABI-stable), which independently confirms D-05.

The contention problem is real and has a clean answer. `use_worktrees: false` means every agent edits **one** working tree, so two agents touching different regions of `src/main/index.ts` is a lost-update race, not a merge conflict — disjoint file ownership is mandatory, not stylistic. Six files carry almost all of the collision pressure: `src/main/index.ts` (7 requirements), `src/main/hive.ts` (3 clusters), `src/main/hooks.ts` (4), `src/preload/index.ts` (5), `src/renderer/src/**/*.tsx` (5), and `test/hive-protocol-v2.test.cjs` (2 clusters that must not land together). Treating those six as **exclusive tokens, at most one holder per wave** produces a 6-wave plan with genuine parallelism in waves 2–4 and no shared-file risk anywhere.

**Primary recommendation:** Run six waves. Wave 1 is the Electron bump **plus** the `test/load-ts.cjs` changes both D-25 (FLOOR-15) and the lazy-download fix need, since that file is already wave 1's to own — one file, one owner, three requirements served. Waves 2–4 partition the main-process hot files by exclusive token. Waves 5–6 are the renderer, ordered so ESLint lints the *final* components and the static-render tests assert the *final* markup.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Agent identity at the hook socket (GATE-01) | Electron main (`hooks.ts`) | PTY child env (`pty.ts`) | The socket is the trust boundary; the child can only ever present a token, never assert an identity. Deriving the id server-side from a `Map<token, agentId>` is the only tier where the claim can be refused. |
| Autonomy: inbox wake, Stop-drain, failover, **queue-drain**, **idle-quiesce** (FLOOR-02) | Electron main (`delivery.ts`) | Renderer (veto/draft signal only) | The requirement *is* "survives the window". Any part left in the renderer dies with it. The renderer keeps exactly one job: reporting the human's draft **up** as a veto. |
| Cost ledger row semantics (RECORD-03/04) | Electron main (`hive.ts`) | — | `db.ts:44` already declares the contract ("Rows are CUMULATIVE snapshots"). One tier must own it or the two appenders keep disagreeing. |
| Budget enforcement (FLOOR-10) | Electron main (`breaker.ts`) | Renderer (display only) | Enforcement in the renderer dies with the window; the breaker is already per-agent and already wired to a native toast. |
| Budget **display** (FLOOR-13 cost field) | Renderer | main (`hive:tasks` row) | D-22: widen an existing polled channel rather than mint a new one. |
| FTS5 memory index (FLOOR-07) | Electron main (`db.ts` `PersistStore`) | — | `better-sqlite3` already loads in main only. The `kg-core.cjs` sidecar runs as plain `node` and must stay native-free — different subsystem, do not conflate. |
| Release provenance (FLOOR-06) | CI (GitHub Actions) | Docs | Sigstore signing requires the workflow's OIDC identity. Nothing about it belongs in app code. |
| Engine capability declaration (FLOOR-18) | `src/shared/providerAutomation.ts` | main (spawn), docs, README | `capabilityLine` is already the per-engine gap channel and is already asserted on by a test. Riding it costs one field. |
| Renderer render-cost policy (FLOOR-11) | Renderer store (`agentPatch.ts`, `useHiveTasks.ts`) | Components | Both policies are already extracted as pure, testable modules. The remaining work is **adoption**, not design. |
| Lint (FLOOR-16) | Repo root config + CI | — | Config-only. |

## Requirements Already Satisfied (verify-and-pin, do not rebuild)

The phase's own premise — *"every claim the project makes about itself is true"* — cuts both ways. These clauses are satisfied by current source. The correct Phase 1 work for each is: paste the evidence per D-43, add the named test per D-43, correct the requirement/roadmap text that says otherwise, and close.

| Clause | Evidence (read this session) | What is actually left |
|--------|------------------------------|----------------------|
| **VERDICT-03** — "a reviewer that cannot receive mail is never selected" | `src/main/hive.ts:1746` — `leastLoadedIdle` filter already includes `&& canReceiveInbox(a?.provider)`. Also enforced on the routing side at `hive.ts:1451` and `:1474`. | A named test pinning it, plus a correction to `REQUIREMENTS.md` VERDICT-03 (`*(filter on canReceiveInbox)*` reads as undone work and is not). |
| **FLOOR-14** — "clicking it focuses that agent" | `src/main/hooks.ts:425` — `n.on('click', () => this.focus?.(agentId))`; wired at `src/main/index.ts:468` — `(agentId) => focusAgent(agentId)`. | Nothing. |
| **FLOOR-14** — "a notification fires when an agent … finishes a long task" | `src/main/hooks.ts:343` — `if (turnMs >= LONG_TURN_MS) this.notify(...)`. | Nothing. |
| **FLOOR-14** — "a notification fires when an agent is blocked" (Claude only) | `src/main/hooks.ts:405-407` + the `#42` comment at `:397`: *"EVERY Notification hook is a toast now, not just the idle one."* | The **non-Claude** case only: `status: 'blocked'` is set in the renderer (`usePtyParser.ts:175,190`, `useHive.ts:575`) and never reaches main's `notify()`. That is the residual gap — and it is narrow, because VIGIL-03 (Phase 4) owns the deeper "only the mounted terminal is parsed" limitation. **Do not fix VIGIL-03 here.** |
| **FLOOR-06** — "published checksums" | `.github/workflows/release.yml` "Generate checksums" step (`sha256sum`/`shasum -a 256` → `SHA256SUMS-<os>.txt`), merged into `release/SHA256SUMS.txt` in the `publish` job and uploaded. | Nothing. |
| **FLOOR-06** — "the release-link gate runs in the pipeline rather than being a documented intention" | `release.yml` job `links` runs `npm run check:links`; the `build` job declares `needs: links`. It is a hard pre-flight gate on every `v*` tag. | Nothing. |
| **FLOOR-11** — "a PTY byte does not re-render the roster" | `src/renderer/src/store/store.ts:614-621` — `updateAgent` returns `s` unchanged when `patchChangesAgent` is false, with the `#20` rationale inline. Policy is extracted pure in `src/renderer/src/store/agentPatch.ts`. Plus the blocked-repaint early return at `src/renderer/src/hooks/usePtyParser.ts:171`. | Audit only. One residual: `pushFeed` (`store.ts:638`) reallocates unconditionally, but it fires per **tool line**, not per chunk, and is already bounded by `FEED_MAX`. Judgement call, not obviously a defect. |
| **FLOOR-11** — "the terminal pool is bounded" | `src/renderer/src/store/terminalPoolPolicy.ts` — `TERMINAL_POOL_MAX = 24`, `terminalsToEvict()` LRU-evicts detached entries, `orphanedTerminalIds()` sweeps the roster. Cap applied at `terminalPool.ts:319`, sweep at `terminalPool.ts:335` called from `useHive.ts:1007`. | The "**disposes on every drop path**" half needs an explicit audit of the five call sites (`AgentDetailPanel.tsx:93`, `CommandCenterPanel.tsx:501`, `FullscreenTerminal.tsx:849`, `OfficeThemePicker.tsx:73`, plus the sweep) against the archive/remove/reconcile paths in the store. |
| **FLOOR-02** — the Stop-drain | `src/main/index.ts:467` → `src/main/hooks.ts:332` (`this.drainAtStop?.(agentId)`) → `src/main/delivery.ts:216` (`drainAtStop`, guarded on `paused()` then `vetoed()`) → `src/main/hive.ts:1243` `drainForStop()`, which advances `cursor.json` at `hive.ts:1253`. | Confirms D-37 exactly. Do not restore, do not delete. |

**Planner instruction:** these belong in the plan as explicit `verify` tasks with pasted evidence, not as omissions. A clause silently dropped from the plan is indistinguishable at review time from a clause forgotten.

## Inert Features Found (code that exists and nothing calls)

D-21 found one. This research found two more. They matter because each one turns a "build it" task into a "wire it" task, and because a fourth is a live possibility the planner should look for.

| Feature | Definition | Callers | Requirement it unblocks |
|---------|-----------|---------|------------------------|
| `telemetry.recordCostSample()` | `src/main/telemetry.ts:251` | **Zero production.** Verified: only two doc comments (`src/shared/agentProvider.ts:119`, `:321`) and six calls in `test/engine-parity.test.cjs`. | **FLOOR-09** — confirms D-21 is a one-call edit at `hooks.ts`'s `CostSample` branch (`hooks.ts:266-289`). |
| `useHiveTasks()` / `refreshHiveTasks()` | `src/renderer/src/hooks/useHiveTasks.ts` — a shared single-timer poller whose own header says it exists to replace *"four components … each ran their own 5 s `window.cth.hiveTasks()` timer against the same file … six independent reads of one JSON file, every five seconds, forever (#20)"* | **Zero.** `grep -rn "useHiveTasks\|refreshHiveTasks" src/ test/` excluding its own file returns nothing. All four still poll independently: `AgentStrip.tsx:81`, `AskMeTab.tsx:55`, `TaskDetailOverlay.tsx:26`, `TasksKanban.tsx:128`. | **FLOOR-11**'s "four pollers on one file" clause (issue #20's third clause). Migration is what the file's own comment says: *"delete the local `useState` + polling `useEffect`, call this."* It is **also the seam D-22 needs** — widening `hive:tasks` with `{tokens, budgetTokens, pct}` fans out through one poller instead of four. |
| `app:openLogs` IPC handler | `src/main/index.ts:4461-4469` — `mkdirSync(logsDir())` then `shell.openPath(dir)`, returning `{ok, path}` or `{ok:false, error}` | **Zero.** No `openLogs` export in `src/preload/index.ts`, no reference anywhere in `src/renderer/`. | **FLOOR-05** in full. The main half is done; the work is a preload export plus a Settings button. |

**Pattern the planner should expect:** post-audit PRs on this repo have repeatedly landed the *main-process* half of a fix and left the *exposure* half unwired. Before planning any FLOOR item as new construction, grep for an existing implementation and then grep for its callers. Absence of callers is the tell.

## The Electron 32 → 43 Migration

`electron@43.4.1` = Chromium **150.0.7871.46**, Node **24.17.0**, V8 **15.0** (from Electron 43.x release notes). Current: `electron ^32.2.0`, resolved 32.3.3 (Chromium 128, V8 12.8).

### What actually breaks — audited against source

I read the official cumulative breaking-changes list for v33 → v43 and then grepped this codebase for every affected API. **The result is unusually good news:** this app uses almost none of them.

| Electron ver | Breaking change | Does it apply here? |
|---|---|---|
| 33 | Native modules require **C++20** minimum | **Already satisfied.** `node_modules/better-sqlite3/binding.gyp:12-21` sets `-std=c++20` / `/std:c++20` on all three toolchains. |
| 33 | `document.execCommand("paste")` deprecated | No — `grep` finds no use. |
| 33 | `WebFrameMain` may be detached/null | No — no `webFrameMain` use. |
| 34 | Menu bar hidden in fullscreen on Windows | Cosmetic; no code depends on it. |
| 35 | `setPreloads`/`getPreloads` deprecated | **No** — `grep -rn "setPreloads\|getPreloads"` → empty. |
| 35 | `console-message` event signature → object | **No** — `grep -rn "console-message"` → empty. |
| 36 | `session.loadExtension` etc. moved to `session.extensions` | **No** — `grep -rn "loadExtension\|session.extensions"` → empty. |
| 36 | `nativeImage.getBitmap()` deprecated | **No** — `grep -rn "getBitmap\|toBitmap"` → empty. |
| 36 | `PrinterInfo.isDefault/status` removed | No printing code. |
| 36 | GTK 4 default on GNOME | Linux AppImage only; no GTK-specific code. |
| 38 | macOS 11 no longer supported | Docs/support-matrix note only. |
| 38 | `plugin-crashed` removed from webContents | **No** — grep empty. |
| 38 | `webFrame.routingId` deprecated | **No** — grep empty. |
| 39 | `window.open` popups always resizable | No dependence found. |
| 40 | Renderer-side `clipboard` module deprecated | **No.** The five renderer clipboard uses (`AddAgentModal.tsx:247`, `FilesTab.tsx:41`, `FullscreenFileEditor.tsx:44`, …) are all **`navigator.clipboard`** — the Web API, unaffected. No renderer file imports `from 'electron'`. |
| 42 | macOS notifications migrate `NSUserNotification` → `UNNotification`; **code-signing required for notifications to display** | **YES — and it collides with FLOOR-14.** Three `new Notification(...)` sites: `hooks.ts:424`, `index.ts:1479`, `index.ts:4834`. macOS signing here is *best-effort* (`build/notarize.cjs`, no-ops without `APPLE_*`). An unsigned local macOS build may show no toasts at all under Electron 42+. Must be stated honestly wherever FLOOR-14 is claimed. |
| 42 | `Session.clearStorageData()` `quotas` removed | **No** — grep empty. |
| 42 | **`electron` npm package no longer downloads in postinstall; downloads on first use** | **YES — breaks CI. See below.** |
| 43 | `dialog.showOpenDialog/showSaveDialog` default initial directory → **Downloads** when `defaultPath` omitted | **YES, four sites, all omit `defaultPath`:** `index.ts:2539` (import hire manifest), `:3432` ("Pick a folder"), `:4080` (KG docs), `:4103` (attach images). Behaviour change, not a break — but "Pick a folder" opening in Downloads instead of the last-used directory is a visible UX regression on the primary project-picking path. Decide deliberately; adding `defaultPath` is one line each. |
| 43 | `showHiddenFiles` removed on Linux | **No** — grep empty. |
| 43 | `roundedCorners` now supported and defaults `true` on Linux; frameless WCO adopts native layout | Only `titleBarStyle: 'hiddenInset'` at `index.ts:2573` (macOS). Low risk; visually verify the Linux AppImage. |
| 43 | `NativeImage.toBitmap()` normalizes to sRGB | Not used. |

**Sources:** [electronjs.org/docs/latest/breaking-changes](https://www.electronjs.org/docs/latest/breaking-changes) `[CITED]`, [Electron 43 blog](https://www.electronjs.org/blog/electron-43-0) `[CITED]`.

### Finding 1 (BLOCKING) — `require('electron')` now downloads a binary, in every CI test job

`electron@43.4.1/index.js`, fetched from the registry this session, ends:

```js
module.exports = getElectronPath();
```

and `getElectronPath()` calls `downloadElectron()` — `spawnSync(process.execPath, ['install.js'])` — whenever `path.txt` is missing or `dist/<exe>` does not exist.

`test/load-ts.cjs:28-42` is built on the *old* behaviour, and says so in its own comment:

```js
function requireElectron() {
  try {
    const real = require('electron');
    if (real && typeof real === 'object') return real;
  } catch {
    // "Electron failed to install correctly" — the binary was never downloaded, which is
    // exactly what `npm ci --ignore-scripts` gives every CI runner.
  }
  return electronStub();
}
```

All three `ci.yml` `test` jobs run `npm ci --ignore-scripts`. Under Electron 43 the `try` block will no longer throw immediately — it will **spawn a ~100 MB download** on the first `loadTs()` of any of the twelve `src/main` modules that import `electron`. Outcomes range from "three CI jobs get much slower and network-dependent" to "a rate-limited or offline runner spends the download timeout before falling through to the stub".

**Fix (lazy, correct, one edit):** the comment already states the real intent — *"a test which has injected a fake API into `require.cache['electron']` before calling `loadTs()` must win"*. So consult `require.cache` directly and never call the real loader:

```js
function requireElectron() {
  // Electron 42+ downloads the binary on first require (see electron/index.js —
  // module.exports = getElectronPath()), so calling the real loader here would
  // pull ~100 MB on every `npm ci --ignore-scripts` CI runner. The only reason
  // this ever asked for the real module was to let an injected fake win — so ask
  // require.cache for the injection directly, and never touch the loader.
  let id;
  try { id = require.resolve('electron'); } catch { return electronStub(); }
  const injected = require.cache[id]?.exports;
  if (injected && typeof injected === 'object') return injected;
  return electronStub();
}
```

This must land **in wave 1, in the same commit as the version bump**, or the bump's own CI run is the thing that discovers it. It is also directly load-bearing for D-08: the suite's blind spot is *Electron-version regressions*, and this is a case where the blind spot bites the suite itself rather than the app.

`[VERIFIED: npm registry — electron@43.4.1/index.js fetched and read this session]`

### Finding 2 (near-certain) — `better-sqlite3` 11.10.0 will not build against V8 15

Verified locally:

- `node_modules/better-sqlite3/package.json` dependencies: **`{"bindings":"^1.5.0","prebuild-install":"^7.1.1"}`** — no `node-addon-api`, no `nan`.
- `grep -rl "v8::" node_modules/better-sqlite3/src` matches `better_sqlite3.cpp` and `better_sqlite3.hpp`; `grep -c "napi\|Napi" src/better_sqlite3.cpp` → **0**.

So 11.10.0 is a **raw V8 addon**, ABI- and API-coupled to the V8 major it was written against. Electron 32 ships V8 12.8; Electron 43 ships V8 15.0.

Upstream: [WiseLibs/better-sqlite3#1416](https://github.com/WiseLibs/better-sqlite3/issues/1416) — *"better-sqlite3 12.4.1 fails to build with electron 39.1 / new v8 due to `Context::GetIsolate` removed after being deprecated"*. A **12.4.1** already failing at **Electron 39** is decisive evidence about **11.10.0** at **Electron 43**.

Upstream fix: **13.0.0 is the first release to run on N-API**, and the release notes for the 13.x line name support for Node 26 and **Electron v42–v43**. `latest` is **13.0.3** (`npm view better-sqlite3 dist-tags`). The 12.x line reaches 12.11.1 before the 13.0.0 cut.

**Recommendation — amend D-06's framing:** plan the `better-sqlite3` → `^13.0.3` bump as **expected work in wave 1**, with "it compiles clean at 11.10.0" as the surprise branch rather than the default. Drag `@types/better-sqlite3` with it (currently `^7.6.13`). Verify the two consumer-visible changes: 13.0.1 fixed an over-strict parameter-binding regression from 13.0.0 (plain objects from other realms), and `db.explain()` / `preparedStatement.toString()` were added.

**Risk to check, do not assume:** the 12.12.0 notes state that **from Electron v43, Linux prebuilds require glibc ≥ 2.41**. The AppImage is built on `ubuntu-latest` and the e2e job runs there too. Verify the runner's glibc before assuming the Linux leg is free. `[CITED: github.com/WiseLibs/better-sqlite3/releases]` — release **dates** in that page rendered inconsistently in fetch and are **UNVERIFIED**; the version/support facts are what matters and are consistent across two independent sources.

### Finding 3 — `node-pty` is low risk, which confirms D-05 from a second direction

`node_modules/node-pty/package.json` dependencies: **`{"node-addon-api":"^7.1.0"}`**. N-API is ABI-stable across V8/Node majors by construction. `binding.gyp` pulls `node_addon_api_except` and adds Windows hardening flags (`SpectreMitigation: Spectre`, `/guard:cf`, `/sdl`) — which is why the Windows toolchain needs the VS2019 Spectre components, not an Electron-version fact.

D-05's reasoning (the conpty patch keys off the **node-pty version**, which is not changing) is correct. This adds: even the compile is low-risk, because N-API insulates it. `electron-rebuild -f` compiles from source against Electron's headers, so the absence of a Node 24 prebuild is irrelevant — also as D-05 states.

### Finding 4 — `@electron/rebuild` pairs at **4.x**, not 3.x

`npm view @electron/rebuild version` → **4.2.0**. `engines: { node: '>=22.12.0' }`.

D-04 says "bump `@electron/rebuild` from `^3.7.0`" without naming a target. The answer is **`^4.2.0`**. The 3.x line tops out at 3.7.2.

**Interaction with D-07 (host Node stays 22):** `>=22.12.0` is satisfied by `actions/setup-node@v4` with `node-version: 22` (which resolves latest 22.x), and by `.nvmrc` = `22` on a current install. It is **not** satisfied by an older Node 22.x, and `package.json` `engines: ">=20 <23"` still admits Node 20, which cannot run `@electron/rebuild@4`. That is a pre-existing looseness the bump makes real. Decide deliberately; the minimal honest move is a comment, not necessarily an engines change.

`[VERIFIED: npm registry — npm view, this session]`

### Finding 5 — `electron-builder` 25 → 26 against **this** `electron-builder.yml`

`npm view electron-builder version` → **26.15.3**, deps pin `app-builder-lib@26.15.3`, `builder-util-runtime@9.7.0`. `engines: { node: '>=14.0.0' }` — no Node-version pressure.

The v26 breaking changes that could touch this config, checked key by key against the actual file:

| v26 change | This repo's config | Verdict |
|---|---|---|
| Windows signing moved to `win.signtoolOptions`; `azureOptions` split out | `electron-builder.yml` contains **no** `win` signing keys at all. Azure options are injected only as CLI flags from `release.yml` (`-c.win.azureSignOptions.*`), and only when five `AZURE_*` secrets exist — which they do not on this project. | **Inert.** Re-read the flag names against v26's schema for correctness, but nothing can regress since the path never executes. |
| `mac.notarize` deprecated in favour of env vars | `mac.notarize: false` **is present**, alongside a root `afterSign: build/notarize.cjs`. | **Review required.** An explicitly-set deprecated key is the most likely single source of a v26 schema warning-or-error on this file. |
| `.desktop` entry must migrate to an object | Repo has no `linux.desktop` key. | Not applicable. |
| HFS+ DMG removed on non-arm64 macs | `mac.target: dmg + zip, arch: [universal]`, built on `macos-latest` (arm64). | Low risk; verify the DMG still builds. |
| Deprecated fields removed from `winOptions`/`macOptions` | Remaining `mac` keys are `category`, `icon`, `extendInfo`, `hardenedRuntime`, `entitlements`, `entitlementsInherit`, `gatekeeperAssess`, `target`, `artifactName` — all current. `win`: `icon`, `target`. | Low risk. |

`electron-updater` is already at the exactly-matching version: `npm view electron-updater version` → **6.8.9**, and `package.json` pins `^6.8.9`. No pairing work.

**Note on tooling:** electron-builder ships a `migrate-schema` command with `--dry-run`. It is documented for the v26→v27 migration; whether v26.15.3 exposes it is **UNVERIFIED**. Try `npx electron-builder migrate-schema --dry-run` after the bump — if it exists it is free evidence; if it does not, read the file by hand as D-04 already requires.

`[CITED: electron.build, github.com/electron-userland/electron-builder/releases/tag/v26.0.0]`

### Finding 6 — Chromium 128 → 150 across the renderer's three heavy surfaces

No specific incompatibility found for any of the three. Reporting that honestly rather than padding.

- **Pixi.js** — `package.json` pins `^8.5.1`; STACK.md records resolved **8.18.1**. Searched for Pixi 8 / Chromium 150 / Electron 43 rendering issues and found **nothing specific** — only generic historical WebGL-unsupported reports from Pixi 4–6 eras. `[UNVERIFIED — absence of a found report is not evidence of absence]`. Mitigating fact: the app already ships GL context-loss recovery and it is already tested — `test/office-gl-recovery.test.cjs` is in the `test:focused` list, and `scheduleWebglRecovery` lives in `src/renderer/src/components/terminalRecovery.ts`.
- **xterm.js** — `@xterm/xterm ^5.5.0` with `@xterm/addon-webgl ^0.19.0`. Same result: nothing found. The WebGL addon is the surface most exposed to a Chromium GL-stack change, and `terminalPool.ts:528,544,558` already dispose and recover it on loss.
- **Monaco / CodeMirror** — `monaco-editor ^0.52.2`, `@codemirror/*` 6.x. Pure DOM/canvas consumers, no GL. Lowest risk of the three.

**Recommendation:** do not research these further. The only evidence that would settle it is the e2e run and D-09's live operator run, both of which are already in the plan. Budget one manual pass over the office floor, one terminal pane, and one editor pane in the D-09 Windows run and record what was seen.

### Finding 7 — the D-08 blind spot, quantified

`npm test` = `node --test test/*.test.cjs`, **56 test files**, 426 tests (verified 2026-08-20 post-merge against `ls test/*.test.cjs | wc -l` → 56). Every one runs under plain Node with `electron` stubbed by `test/load-ts.cjs`. There is no assertion anywhere in that suite that can fail on an Electron version change — CONTEXT.md D-08 states this and it is correct.

The only real-Electron job is `.github/workflows/e2e.yml`, `runs-on: ubuntu-latest`, `xvfb-run`, one spec (`e2e/smoke.spec.ts`), `workers: 1`, `retries: 0`. Windows and macOS get **zero** real-Electron coverage, and the Windows conpty path is exercised by no Electron-launching job on any platform.

D-10's one-line assertion is the right interim. Concretely, inside the launched app:

```ts
// e2e/smoke.spec.ts — the ONLY automated thing that fails on a silent revert to 32.
const versions = await electronApp.evaluate(({ process }) => ({
  electron: process.versions.electron,
  modules: process.versions.modules
}));
expect(Number(versions.electron.split('.')[0])).toBeGreaterThanOrEqual(43);
```

Pin the **major**, not the exact string, so a patch bump does not turn the gate red. `process.versions.modules` (the ABI number) is worth recording in the same assertion because it is what a native-module mismatch actually reports.

`[VERIFIED: source read this session — .github/workflows/{ci,e2e}.yml, package.json, test/ dir listing]`

## The Contention Problem, and the Wave Plan

### Why disjoint file ownership is mandatory here

`.planning/config.json` has `"use_worktrees": false`. Every agent in a wave edits **the same working tree**. Two agents editing different regions of `src/main/index.ts` concurrently do not produce a merge conflict — they produce a **lost update**, silently, with no signal at review time. Disjoint file ownership is therefore a correctness requirement, not a convention.

Model each hot file as an **exclusive token**. A wave may contain at most one agent holding each token.

### File → requirement collision map

Verified by reading each anchor. Requirement IDs in **bold** are the ones that must *write* the file; others only read.

| File | Lines | Requirements that write it | Token |
|------|------:|---------------------------|-------|
| `src/main/index.ts` | 5,620 | **FLOOR-03** (dialogs, contingent), **GATE-01** (`:5534` delete, spawn sites, qwen sidecar), **FLOOR-02** (queue-drain IPC + main-side quiesce), **FLOOR-07** (`:4041`,`:4046` handler deletes), **FLOOR-10/RECORD-03/04** (`:1513` beat appender, `hive:tasks` row at `:3894`), **FLOOR-14** (blocked notify), **FLOOR-18** (`:269`) | **T-INDEX** |
| `src/main/hive.ts` | 3,562 | **FLOOR-04** (commit path), **FLOOR-08/VERDICT-02** (`sweepTaskReviews` `:1762`), **FLOOR-10/RECORD-03/04** (`taskSpend` `:2566`, `appendCostLedger` `:2520`, `COST_TAIL_BYTES` `:244`) | **T-HIVE** |
| `src/main/hooks.ts` | ~460 | **GATE-01** (token Map, `authorized`, header doc `:12-18`), **FLOOR-09** (`CostSample` branch `:266-289`), **RECORD-04** (`:272` appender semantics), **FLOOR-14** (`notify`) | **T-HOOKS** |
| `src/preload/index.ts` | 1,502 | **FLOOR-02** (queue IPC), **FLOOR-05** (`openLogs` export), **FLOOR-07** (delete `:828-835`), **FLOOR-10** (`:779` task row), **FLOOR-14** | **T-PRELOAD** |
| `src/renderer/src/components/*.tsx` | 75 files | **FLOOR-01**, **FLOOR-12** (aria-labels across 133 buttons), **FLOOR-13**, **FLOOR-11** (4 poller components), **FLOOR-16** (6 disable sites), **FLOOR-15** (asserts on final markup) | **T-TSX** |
| `test/hive-protocol-v2.test.cjs` | — | **FLOOR-08/VERDICT-02** (`:220-233` sweep tests), **FLOOR-10/RECORD-03/04** (`:276-284`, which D-23 says asserts the *wrong* behaviour) | **T-PROTO** |
| `.github/workflows/ci.yml` | — | **FLOOR-03**, **FLOOR-16** (lint step) | **T-CI** |
| `test/load-ts.cjs` | 116 | **FLOOR-03** (lazy-download fix), **FLOOR-15** (D-25 `.tsx` + `JsxEmit`) | **T-LOADTS** |
| `README.md` | — | **FLOOR-06** (SmartScreen honesty), **FLOOR-07** (rename "Enterprise Knowledge Graph"), **FLOOR-18** (engine table) | **T-README** |
| `test/engine-parity.test.cjs` | — | **FLOOR-09**, **FLOOR-18** (both assert on `capabilityLine`) | **T-PARITY** |
| `src/shared/providerAutomation.ts` | — | **FLOOR-09**, **FLOOR-18** | (rides T-PARITY) |

Uncontended files (safe filler for any wave): `src/main/breaker.ts`, `src/main/telemetry.ts`, `src/main/delivery.ts`, `src/main/db.ts`, `src/main/memory.ts`, `src/main/pty.ts`, `src/renderer/src/design/tokens.css`, `src/renderer/src/store/*.ts`, `.github/workflows/release.yml`, `.github/ISSUE_TEMPLATE/*`, `docs/adr/*`, `HIVE.md`, `eslint.config.js` (new).

### Recommended wave plan

Six waves. Every wave respects the token table. Requirement coverage is complete (23/23).

**Wave 1 — the runtime bump. One agent. Gates everything (D-03).**

Tokens: T-LOADTS, T-CI, plus `package.json`, `package-lock.json`, `electron-builder.yml`, `e2e/smoke.spec.ts`, `.github/workflows/e2e.yml`.
Requirements: **FLOOR-03**, and the D-25 half of **FLOOR-15**.

Why fold D-25 in: wave 1 already owns `test/load-ts.cjs` for the lazy-download fix. Making the `.tsx` + `ts.JsxEmit.React` change in the same commit costs three lines and removes T-LOADTS from every later wave's dependency set. Fewest files, one owner.

Ordering inside the wave, so a failure is diagnosable:
1. `test/load-ts.cjs` — lazy-download fix + `.tsx`/JsxEmit. Run `npm test` on the **old** Electron first; it must stay green. This isolates the loader change from the version change.
2. `electron ^43.4.1`, `electron-builder ^26.15.3`, `@electron/rebuild ^4.2.0`, `better-sqlite3 ^13.0.3` + `@types/better-sqlite3`. Wipe `node_modules`; regenerate `package-lock.json` on a clean tree (D-07). **The "with npm 10" clause is WITHDRAWN** — npm 9, 10 and 11 all write `lockfileVersion: 3`, so it had no discriminating check, and this host is node v24.13.0 / npm 11.6.2 with no Node 22. Plan 01 is the authority.
3. `electron-builder.yml` read-through — start with `mac.notarize: false`.
4. D-10's version assertion in `e2e/smoke.spec.ts`.
5. Three-platform CI, then D-09's live Windows operator run.

Rollback pin: one revertable commit, as D-03 requires. Record the exact SHA in the plan.

**Wave 2 — main-process, three disjoint agents.**

| Agent | Requirements | Tokens held | Also owns |
|---|---|---|---|
| 2A | **GATE-01** | T-INDEX, T-HOOKS | `src/main/pty.ts`, `test/net-binding.test.cjs` |
| 2B | **FLOOR-08, VERDICT-02, VERDICT-03** | T-HIVE, T-PROTO | — |
| 2C | **FLOOR-06, FLOOR-17** | T-README | `.github/workflows/release.yml`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `docs/adr/*`, `RELEASE.md`, `SECURITY.md` |

2A and 2B are the two clusters that most need fresh runtime evidence, so they run immediately after the bump. 2C is pure CI/docs and collides with nobody.

**Wave 3 — the spend cluster. One main-process agent, one renderer agent.**

| Agent | Requirements | Tokens held | Also owns |
|---|---|---|---|
| 3A | **FLOOR-09, FLOOR-10, RECORD-03, RECORD-04** | T-INDEX, T-HIVE, T-HOOKS, T-PRELOAD, T-PROTO, T-PARITY | `src/main/breaker.ts`, `src/main/telemetry.ts`, `src/shared/providerAutomation.ts` |
| 3B | **FLOOR-11** | T-TSX | `src/renderer/src/hooks/useHiveTasks.ts`, `terminalPool.ts` |

3A holds five tokens because the spend cluster genuinely spans them; that is why it is solo on the main side. Split it internally into ordered commits, not into parallel agents:
`fix(cost): unify ledger row semantics` → `fix(cost): sum over all rows` → `feat(cost): wire recordCostSample` → `feat(breaker): budget arm` → `feat(ipc): widen hive:tasks` → `test: rewrite hive-protocol-v2 assertions`. D-23 is explicit that the source fix lands **before** the test rewrite, in its own `fix(...)` commit, with the old expectation in the message.

3B's adoption of `useHiveTasks` is a prerequisite for 3A's `hive:tasks` widening reaching the UI cheaply — but they do not conflict (3A widens the main-side row and the preload type; 3B changes which renderer hook reads it). If sequencing is tight, run 3B **before** 3A.

**Wave 4 — main-process remainder + renderer identity. Three agents.**

| Agent | Requirements | Tokens held | Also owns |
|---|---|---|---|
| 4A | **FLOOR-02** | T-INDEX, T-PRELOAD | `src/main/delivery.ts`, `src/renderer/src/hooks/useHive.ts`, `src/renderer/src/hooks/queueDelivery.ts`, `src/renderer/src/store/store.ts`, `HIVE.md` |
| 4B | **FLOOR-04, FLOOR-07** | T-HIVE | `src/main/db.ts`, `src/main/memory.ts` |
| 4C | **FLOOR-18, FLOOR-05** | T-README, T-PARITY | `src/shared/providerAutomation.ts`, `src/renderer/src/components/SettingsModal.tsx` |

Conflict to watch: 4B needs T-PRELOAD for D-35's two deletions and 4C needs T-PRELOAD for FLOOR-05's `openLogs` export, but 4A holds it. Resolution: **give 4A the preload edits for all three** — they are three independent line-level changes in one file, and one owner making three small edits is strictly safer than three owners coordinating. Note it explicitly in 4A's task list so it is not lost.

FLOOR-02 is the phase's largest single item and 4A should be sized accordingly. See § FLOOR-02 below.

**Wave 5 — renderer surface. Two agents, ordered.**

| Agent | Requirements | Tokens held |
|---|---|---|
| 5A | **FLOOR-01, FLOOR-13** | T-TSX (`AgentCard`, `AgentStrip`, `AgentDetailPanel`, `CommandCenterPanel`, `App.tsx`) |
| 5B | **FLOOR-12** | `src/renderer/src/design/tokens.css` **only**, in this wave |

FLOOR-12's aria-label sweep touches nearly every `.tsx` and cannot share T-TSX with 5A. Split it: the **token** half (four values in `tokens.css:61-68`) is uncontended and lands in wave 5; the **aria-label** half lands in wave 6 after 5A's components are final. Doing it the other way round means labelling components that are about to be rewritten.

**Wave 6 — the closing sweep. Sequential, single agent.**

Order matters and is not negotiable:
1. **FLOOR-12** (aria-label half) — every `<button>` is final by now.
2. **FLOOR-16** — ESLint lints the final tree. Linting before wave 5 means re-linting after it.
3. **FLOOR-15** — static-render tests assert the final markup of the final components.
4. **FLOOR-14** (residual non-Claude blocked notification).
5. The D-45 repo-fact test file, accumulating every negative grep from all 23 requirements.
6. The D-46 mechanical phase gate.

D-44 says close issues incrementally in the fixing PR, not in an end-of-phase sweep — that stands. Wave 6 is not an issue-closing sweep; it is the three requirements that are genuinely *last by dependency*, plus the mechanical gate.

### Requirement → wave, complete

| Wave | Requirements | Count |
|---|---|---|
| 1 | FLOOR-03 (+ FLOOR-15's loader half) | 1 |
| 2 | GATE-01, FLOOR-08, VERDICT-02, VERDICT-03, FLOOR-06, FLOOR-17 | 6 |
| 3 | FLOOR-09, FLOOR-10, RECORD-03, RECORD-04, FLOOR-11 | 5 |
| 4 | FLOOR-02, FLOOR-04, FLOOR-07, FLOOR-18, FLOOR-05 | 5 |
| 5 | FLOOR-01, FLOOR-13, FLOOR-12 (tokens) | 3 |
| 6 | FLOOR-12 (labels), FLOOR-16, FLOOR-15, FLOOR-14 | 3 (+FLOOR-12 completion) |
| | **Total distinct** | **23** ✓ |

## Per-Requirement Findings

### GATE-01 — per-agent hook identity

All three D-11/D-12/D-13 anchors verified verbatim:

- `src/main/index.ts:5534` — `process.env.HIVE_SOCK_TOKEN = hookSockToken();`, preceded by a six-line comment that states the exact reason it must go: *"Setting it here rather than at each spawn site is what makes BOTH of those work"* (PTY descendants **and** the qwen proxy sidecar). D-13 is that comment's other half.
- `src/main/pty.ts:665-670` — `pty.spawn(file, spawnArgs, { ..., env: { ...process.env, PATH: userPath, TERM: 'xterm-256color', ... } })`. This is why D-12 is mandatory rather than cosmetic.
- `src/main/hooks.ts:12-18` — the header already scopes the threat correctly (*"ANY local process could connect and post a payload claiming any `agent_id`"*) and already names `HIVE_SOCK_TOKEN`. D-14's honesty edit goes here.

Test seam confirmed: `test/net-binding.test.cjs` drives a **real** `net.createConnection` over a real socket/named pipe (TESTING.md, and it is the file that also greps four source files to pin the constant-time compare). D-16 extends an existing real-socket harness — no new infrastructure.

Do not touch the six shim templates in `hive.ts` (`HOOK_SHIM`, `PROXY_BRIDGE_SHIM`, `GROK_HOOK_SHIM`, `AGY_HOOK_SHIM`, `OPENCODE_PLUGIN`, `PI_EXTENSION`); D-11 is right that only what main puts in each PTY's `opts.env` changes.

### VERDICT-02 / VERDICT-03 / FLOOR-08 — the review sweep

`sweepTaskReviews()` is `src/main/hive.ts:1762-1791`. I read the whole function. There are **three** defects, one more than the roadmap names.

**Defect 1 — VERDICT-02, the consumed transition edge.** The loop is:

```js
if (task.status !== 'done' || task.review || !task.assignee) continue;
if (previous.get(task.id) === 'done' || !previous.has(task.id)) continue;
const reviewer = this.leastLoadedIdle([task.assignee]);
if (!reviewer) continue;                       // ← the bug
```

`this.lastTaskStatus = seen` is assigned **before** the loop runs. So by the time `if (!reviewer) continue` fires, this sweep has already recorded the card as `done`. On the next sweep, `previous.get(task.id) === 'done'` is true and the card is skipped **forever**. The function's own doc comment (`:1738-1740`) even claims the opposite: *"Null when nobody qualifies — the sweep then simply leaves the card alone and tries again next minute."* That is a false claim in a source comment, which is squarely inside this phase's scope.

**Defect 2 — a re-done card after a `refuse` is never re-reviewed.** `applyReviewVerdict` (`hive.ts:1794-1806`) patches `review: {...task.review, ok: false}` and `status: 'doing'`. The `review` object stays set. When the assignee fixes the card and marks it `done` again, `sweepTaskReviews`'s first guard — `|| task.review` — makes it `continue`. So the *refused-then-fixed* path, which is exactly the path where a second look matters most, is silently unreviewable. This is a genuine VERDICT-02 clause ("no card reaches `done` unreviewed") and the roadmap does not name it.

**Defect 3 — none. VERDICT-03 is already satisfied.** `leastLoadedIdle` (`hive.ts:1741-1750`):

```js
.filter(([id, a]) => id !== godId && !skip.includes(id) && !a?.archived && !a?.isAssistant
  && !a?.isGod && a?.status === 'idle' && canReceiveInbox(a?.provider))
```

`canReceiveInbox` is imported at `hive.ts:34` from `src/shared/agentProvider.ts:575`. The same filter is applied on the routing side at `hive.ts:1451` and `:1474`.

**Cheapest correct fix for defects 1 and 2** — one `Set`, not a state machine:

```js
// ponytail: a Set of "owes a review", not a second status field. The transition
// edge MINTS the obligation; only a successfully-mailed query clears it. A card
// that flipped done while every agent was busy stays in the set and is retried
// next sweep, which is the whole of VERDICT-02.
private owesReview = new Set<string>();
```

- On the `previous.get(id) !== 'done'` transition → `this.owesReview.add(task.id)`.
- Iterate `owesReview` (not just transitions) each sweep; `continue` on no reviewer **without** deleting.
- Delete on a successful `send` + `patchTask`.
- On `refuse` in `applyReviewVerdict`, re-add the id — that closes defect 2 without touching the `task.review` guard.
- Rebuild from the ledger at startup so an in-flight obligation survives a restart (same reasoning as D-20's ledger rescan).

Existing tests to update: `test/hive-protocol-v2.test.cjs:220,223,233`. `:220` (*"the first sweep learns the floor and reviews nothing"*) and `:233` (*"a card under review is not re-reviewed every minute"*) must both still pass — they encode correct behaviour and are the guard against over-correcting into a review storm.

### Spend Arithmetic — RECORD-03, RECORD-04, FLOOR-10, FLOOR-09

**RECORD-04's mixed semantics, verified at both appenders:**

- `src/main/index.ts:1505-1513` — the beat: `const sample = usageProvider.getAgentUsage(id); ... if (sample?.sessionId) hive.appendCostLedger(sample);`. `getAgentUsage` returns a **cumulative** `AgentUsageSample` (`telemetry.ts:11`, `db.ts:44`).
- `src/main/hooks.ts:266-289` — the `CostSample` branch: builds a row from `p.input`/`p.output`/`p.cache_read`/`p.cache_creation` and calls `this.hive.appendCostLedger({...})`. Its own comment says *"synthesized by the proxy-bridge sidecar (qwen) on **every response** with usage"* — i.e. a **per-response delta**.
- `src/main/hive.ts:2566-2582` `taskSpend()` sums both: `tokens += (row.input ?? 0) + (row.output ?? 0)`.

`db.ts:44` states the contract verbatim, so the fix direction is not a judgement call: make every row cumulative-per-agent and derive spend from clamped consecutive diffs. D-19 has it exactly right.

**RECORD-03's tail, verified:** `COST_TAIL_BYTES = 1024 * 1024` at `hive.ts:244`, read through at `hive.ts:2571` via `this.tailLines(join(root,'cost-ledger.jsonl'), COST_TAIL_BYTES)`. The constant's own comment already names the defect and even tags it: *"ponytail: a card whose spend predates this window under-reports; widen it (or move to Kevin's cost_ledger table, whose row shape this already matches) if that ever matters."* It matters now.

Note the escape hatch that comment names: a **`cost_ledger` table already exists in `PersistStore`** with a matching row shape. D-20 chose an in-memory `Map<taskId, tokens>` rebuilt by one startup scan. That is cheaper and it is the locked decision — but the planner should know the SQL alternative exists and is one `SUM(...) GROUP BY task_id` if the Map ever proves insufficient.

**FLOOR-09 — one call, confirmed.** `telemetry.recordCostSample()` at `telemetry.ts:251` has zero production callers (see § Inert Features). Repointing `hooks.ts`'s `CostSample` branch at it is D-21's one-call edit. Two interactions to respect: (a) `hooks.ts:266-289` currently `return {}`s immediately after appending, deliberately keeping proxy cost *out* of the Claude-only OTel/breaker/drain paths — the whole point of FLOOR-09 is to change that, so the early return needs a deliberate rewrite, not a deletion; (b) the six existing calls in `test/engine-parity.test.cjs:58-98` already exercise the function's own arithmetic including negative and `NaN` inputs, so the contract is pinned.

### Breaker Ladder Mechanics — a constraint D-17 does not mention

D-17 says: *"≥80% → `steering` … >100% → `constrained`"*. The breaker does not work that way, and the planner must know before writing the arm.

Reading `src/main/breaker.ts:269-294`:

```js
const ceiling: BreakerLevel = cfg.hardStop ? 'stopped' : 'constrained';
let target = s.level;
if (trip.tripping) {
  target = LEVELS[Math.min(rank(s.level) + 1, rank(ceiling))];
} else {
  target = LEVELS[Math.max(rank(s.level) - 1, 0)];  // recover one level
}
```

Three consequences:

1. **`evaluate()` returns `{tripping, reason}` — a boolean, not a level.** It cannot target `constrained` directly. A new arm can only say "trip" or "don't".
2. **Escalation is one rank per beat, from the current level.** `LEVELS = ['healthy','steering','constrained','stopped']`. A healthy agent that goes >100% of budget reaches `constrained` on the **second** beat, not the first. Any test for FLOOR-10 must tick the beat at least twice or it will assert the wrong level and get "fixed" by weakening the assertion — which is precisely the failure mode the project's standing rule forbids.
3. **`hardStop: false` caps the ladder at `constrained`** (`breaker.ts:277`, default at `:85`). D-18 is therefore already the shipped behaviour: nothing gets killed. The budget arm inherits it for free — no new guard needed.

Also: `evaluate()` is a `private` method with an eight-argument signature, and the arms are an ordered `if`-chain with early `return`. Placement in that chain determines which `reason` string the operator sees when two conditions trip at once. Put the budget arm **after** the loop/error-storm arms (a looping agent is a more urgent diagnosis than an expensive one) and **before** the floor-wide cost/token caps (a per-card cap is more specific than a floor total). `evaluate()` is pure, so it tests under the existing fake-clock DI style with no new harness.

The `steering` arm's mail-to-assignee side effect (D-17's ≥80% branch) does **not** belong in `evaluate()` — that function is pure by design and the existing `actionFor(level)` → `'steer'` action is the established channel for side effects. Keep it pure.

### FLOOR-02 — the real body, and its true size

D-37 is confirmed (see § Requirements Already Satisfied). D-38's two remaining halves:

**(a) Move the queue-drain and the idle-quiesce backstop into main.** This is the phase's largest single item and the plan must size it honestly.

- **Queue-drain**: `src/renderer/src/hooks/useHive.ts:819` through ~`:968` — roughly 150 lines with `FLUSH_COOLDOWN_MS`, `MAX_SEND_ATTEMPTS`, an `inFlight` Set, a `sendFailures` map, and a `dispatch()` that reads `messageQueues` and `removeQueuedMessage` from the Zustand store. Its own comment (`:806-818`) explains precisely why it stayed in the renderer: *"it holds messages the RENDERER produced (the composer, Slack ingress, the context triggers, terminal work orders, the voice bridge), it lives in renderer state, and main has no view of it."* **Moving the loop therefore requires moving the queue itself** — the store slice, its producers, and the `hive:deliveryVeto` contract that lets the two writers coexist. That is a data-ownership migration, not a code move. The pure policy is already extracted in `src/renderer/src/hooks/queueDelivery.ts` and tested (`test/queue-delivery.test.cjs`), which is the seam to reuse.
- **Idle-quiesce backstop**: `useHive.ts:704-746` (effect "2e"), a `setInterval` at `QUIESCE_POLL_MS` that calls `window.cth.listPtys()` and flips `working` → `idle` after `QUIESCE_IDLE_MS`. This one is **much easier**: it reads `p.lastOutputAt`, which main already tracks, and consults `breakerLevel` and `bootGraceUntil` — both of which main also has. It is a near-mechanical move into `delivery.ts`'s tick. Land it first as the cheap half.

**(b) Delete `HIVE.md`'s stale denials.** All four verified false against source. **Corrected anchors** (D-38(b)'s `:272` is off by one, and `:126` is the tail of a three-line block):

| Anchor | Stale text | Why it is now false |
|---|---|---|
| `HIVE.md:124-126` | `cursor.json` … *"only `drainForStop()` advances it and nothing calls that today, so it stays `{ lastProcessed: null }`"* | `drainForStop` **is** called — `src/main/index.ts:455`, via `DeliveryService.deps.drain` — and it **does** advance the cursor at `src/main/hive.ts:1253`. |
| `HIVE.md:223-230` | *"Phase 1 — Autonomy ⚠️ shipped, but not as planned … The **`Stop`-loop did not**: `Stop` returns `{}` and inbox delivery is the renderer's idle-only nudge instead."* | `hooks.ts:332` calls `drainAtStop` at the Stop boundary and returns `{decision:'block', reason}` when mail is present. |
| `HIVE.md:269` | *"Infinite Stop-hook loop \| Moot today — `Stop` always answers `{}`"* | Same. |
| `HIVE.md:271` | *"`cursor.json` is seeded but never advanced; the live dedup is the renderer's per-session set of nudged message ids, lost on reload"* | Cursor advances (`hive.ts:1253`); the dedup set now lives in main (`delivery.ts` `seenSet`, pruned against the live inbox — see `delivery.ts` `tick()`). |

`.planning/codebase/ARCHITECTURE.md` describes it **correctly** at `:56`, `:201`, `:307`. So the in-repo contradiction is real and points the opposite way from the roadmap's assumption — which is itself the "doc promising a code path that does not run" that criterion 1 bans.

### FLOOR-04 — the secret scrub is genuinely absent from the commit path

`redactSecrets` exists (`src/main/hive.ts:324`) and is **mail-only**: applied at `hive.ts:2011-2012` to `subject`/`body` in `voiceMessages()`, and passed as `sanitize:` at `index.ts:410`. It is **not** applied anywhere in the git commit path.

The commit path is `hive.ts:2698` `commit(message)` → `scheduleCommit` (debounced) → `flushCommit` (`:2729`), which does `await this.untrackIgnored(root)` then `gitAsync(['add','-A'], root)` then `gitAsync(['commit', ...])`. A bare `add -A` over an agent's workspace with no content inspection.

The lazy shape, reusing what exists rather than adding a scanner: after `add -A` and before `commit`, run `git diff --cached` and pass the output through the **existing** `redactSecrets` matcher; if it matches, unstage the offending paths (`git restore --staged <path>`) and log loudly. That reuses the one pattern set the project already trusts and keeps the fix inside `flushCommit`, which is the single choke point ADR-0004 (single-committer git) guarantees. Do **not** build a second pattern set — two matchers that disagree is worse than one imperfect one.

Constraint from ADR-0004 and `UNTRACK_PATHS` (`hive.ts:288`): the hive repo already excludes `cost-ledger.jsonl`, `log.jsonl`, `log.jsonl.1`, `backups` from versioning. Any new exclusion must go through `untrackIgnored()`, not a raw `.gitignore` line — the comment at `:286-288` explains that a gitignore line does nothing to an already-tracked file.

### FLOOR-05 — preload + one button

`app:openLogs` at `src/main/index.ts:4461-4469` is complete and correct: `mkdirSync(logsDir(), {recursive:true})`, `await shell.openPath(dir)`, returns `{ok:true, path}` or `{ok:false, error}`. Its own comment names the requirement: *"Reveal the log folder (#13). The bug template asks users for 'Logs'; this is how they reach them without knowing where Electron hides them per platform."*

Missing: a preload export and a `SettingsModal.tsx` button. Two small edits. Note the tie-in to **FLOOR-17** — the bug template asks for logs, and until this button exists the template asks for something the user cannot reach. Plan them to reference each other.

### FLOOR-07 — FTS5 and the honesty half

Verified: `node_modules/better-sqlite3/deps/defines.gypi:24` contains `SQLITE_ENABLE_FTS5` (alongside FTS3/FTS4/RTREE/JSON1). Zero new dependencies, exactly as D-32 states. **This must be re-verified after the wave-1 `better-sqlite3` 13.x bump** — the defines file is version-specific and a one-line `grep` is cheap insurance.

Honesty half, all anchors verified:
- `src/main/memory.ts:10-21` — the sharing-model comment spells out the exposure verbatim. `status().scope` at `:220-233`.
- `src/preload/index.ts:828-829` (`memoryWakeUp`) and `:834-835` (`reflectNow`) — the two dead exports D-35 deletes. Their `ipcMain.handle` registrations at `index.ts:4041,4046`. `reflect.ts`'s own timer calls the class method directly, so nothing breaks.
- `src/main/config.ts:497` — `knowledgeGraph: { enabled: false }`, with a comment that itself records a previous default/doc mismatch. D-34 keeps it false.
- `src/preload/index.ts:838` — the *"Enterprise Knowledge Graph (multimodal context for agents)"* section header D-35 renames.

**Test-infrastructure trap (already flagged in CONTEXT.md, restated because it is easy to lose):** `test/config-secrets.test.cjs` fakes `better-sqlite3` with an in-memory `FakeDatabase` class via `require.cache` injection. That fake has **no FTS5** — indeed no SQL at all. The FTS5 migration therefore cannot be tested through the existing fake and needs a real SQLite handle in its own test, or it ships unverified. Under plain Node the real `better-sqlite3` is built for the **Electron** ABI and will not load, so a Node-loadable build is required. **[SUPERSEDED by red-team round 2/3 — see this file's Open Questions, and plans 01/10/21 which are the authority.]** Wave 1 bumps `better-sqlite3` to 13.x, which is N-API and ships prebuilds, so the CI `test` jobs' `npm ci --ignore-scripts` already leaves a working binary — **do NOT add `npm rebuild better-sqlite3`; it discards the prebuild and forces node-gyp where Python is pinned on Linux only.** This is a genuine, non-obvious cost and belongs in the plan as its own task.

### FLOOR-11 — adoption, not construction

Two of three clauses already landed (see § Requirements Already Satisfied). The open clause is issue #20's third: *"four pollers on one file"*.

`src/renderer/src/hooks/useHiveTasks.ts` is the written-but-uncalled fix. Its module-level singleton (`cached`, `lastReadAt`, `timer`, `listeners: Set`) starts one `setInterval(POLL_MS=5000)` on first subscriber and clears it on last unsubscribe, and fans one payload to all listeners. It also exports `refreshHiveTasks()` for post-mutation re-reads.

Migration, per the file's own instruction (*"delete the local `useState` + polling `useEffect`, call this"*), at four sites: `AgentStrip.tsx:76-92`, `AskMeTab.tsx:55`, `TaskDetailOverlay.tsx:26`, `TasksKanban.tsx:128`. `TasksKanban` additionally has a `dismissTask` mutation → that is `refreshHiveTasks()`'s use case.

Watch the return type: `useHiveTasks()` returns `unknown` **deliberately** (*"every caller already has its own parser for the shape it cares about, and making them agree on one would be a much larger change than this is worth"*). Do not "improve" this into a shared typed shape — that is scope the file explicitly declined.

Pool drop-path audit (the remaining half of the bounded-pool clause): `disposeTerminal` is called from `AgentDetailPanel.tsx:93`, `CommandCenterPanel.tsx:501`, `FullscreenTerminal.tsx:849`, `OfficeThemePicker.tsx:73`, plus `disposeOrphanedTerminals(live)` at `useHive.ts:1007`. `terminalPoolPolicy.ts`'s own header argues the sweep exists **because** the per-call-site approach *"did not agree with each other, and the next one added would not have either"* — so the audit's conclusion should be "every drop path reaches the sweep", not "every drop path calls dispose".

### FLOOR-12 — measured

- `aria-label` occurrences in `src/renderer/src`: **49**. `<button` occurrences: **133**. (The audit's baseline was 27/128.)
- `src/renderer/src/design/tokens.css:61-68` — four values below the `DESIGN.md:706` floor (*"never go below 14 px for any user-facing text"*, verified verbatim): `--cth-text-display-md: 12px`, `--cth-text-display-sm: 8px`, `--cth-text-body-sm: 13px`, `--cth-text-mono-sm: 13px`.

The token half is four lines in one uncontended file. The label half touches ~40 `.tsx` files and is why FLOOR-12 must split across waves 5 and 6.

**Do not bump `--cth-text-mono-sm` blindly.** It is the terminal/monospace scale, and xterm sizing is handled separately in `src/renderer/src/components/terminalFontSize.ts`. Check which surfaces consume the mono tokens before changing them; a global mono bump can reflow terminal panes.

The two remaining `role="button"` usages (`AgentCard.tsx:145`, `FullscreenTerminal.tsx:604`) are `<div role="button">` with inline comments explaining why a native `<button>` does not fit (each carries multiple independent interactive children). CONCERNS.md records these as **already-resolved history**, not debt. Leave them; a plan task that "fixes" them is regressing a deliberate decision.

### FLOOR-13 — the four renderings

Issue #39: *"Four renderings of the same agent show four different field sets, and none shows cost."* Issue #38: *"Long cwds wrap to four lines; no responsive collapse; `sidebarWidth` only clamped while dragging."*

Verified anchors for #38: `sidebarWidth` lives in `store.ts:191` / `:605`, persisted under `LS_SIDEBAR_WIDTH = 'cth.sidebarWidth'` (`:310`), and is clamped at `store.ts:867` (`set({ sidebarWidth: clamped })`) — i.e. in the setter, which is the drag path. Consumed at `App.tsx:52,446,452`. The gap is the **responsive** clamp: nothing re-clamps on window resize.

The four renderings are **UNVERIFIED as an exact set** — I did not read all four to enumerate their field lists. Strong candidates from the component inventory and their `usePtyParser` attachments: `AgentCard.tsx`, `AgentStrip.tsx`, `AgentDetailPanel.tsx` (`usePtyParser` at `:64`), `CommandCenterPanel.tsx` (`usePtyParser` at `:136`). The plan's first FLOOR-13 task should be "read all four, paste the field lists, then define the agreed set" — do not assume.

**Hard dependency:** the "including cost" clause is satisfied by D-22's `hive:tasks` widening, which is wave 3A's. FLOOR-13 in wave 5 consumes it. If 3A slips, FLOOR-13 ships with three of four clauses.

### FLOOR-14 — the narrow residual

Three of four clauses already landed (see § Requirements Already Satisfied). What remains: `status: 'blocked'` is a **renderer** determination — `usePtyParser.ts:175` and `:190` (BLOCK_HINTS regex match on the last 400 chars of terminal text) and `useHive.ts:575` (an approval-request IPC) — and none of those reaches main's `notify()`. For a Claude agent this does not matter, because Claude's own `Notification` hook already reaches `hooks.ts:405`. For a non-Claude engine on a floor with no Claude hook stream, a blocked agent produces no OS toast.

Smallest honest fix: one IPC from the renderer's block transition to a main-side `notify(agentId, name, reason)`, reusing `hooks.ts`'s existing `notify()` (which already gates on `getConfig().notifications` and already wires click-to-focus). Do **not** attempt main-side terminal parsing — that is VIGIL-03 (Phase 4), and `usePtyParser.ts`'s own limitation (only the mounted terminal is parsed) is called out at `useHive.ts:693` as the reason the quiesce backstop exists.

**Cross-check with the Electron bump:** Electron 42's macOS UNNotification migration means **notifications require code-signing to display on macOS**. Whatever FLOOR-14 claims in docs or UI must be true on all three platforms. On an unsigned local macOS build under Electron 43, it may not be. State the limitation rather than claim the capability — the same discipline D-39/D-40 apply to FLOOR-18.

### FLOOR-15 — component tests via `renderToStaticMarkup`

D-24/D-25/D-26 are sound. Verified supporting facts:

- `react-dom` is a production dependency (`^18.3.1`), so `renderToStaticMarkup` costs zero new deps.
- `test/load-ts.cjs:114` `loadTs(relativePath)` resolves via `resolveTs()` and caches by absolute path; adding `.tsx` to the extension list and `ts.JsxEmit.React` to the transpile options is the whole of D-25.
- The `Module._load` stub pattern for renderer files that pull `react` or the `@/` alias is already established in `test/pty-sanitize.test.cjs` (TESTING.md documents it) — the same technique covers `@/` imports inside a component under test.
- D-26's claim that *"no `.tsx` file references `window.api`/`window.electron` directly"* — **UNVERIFIED by me**. Note that components *do* reference `window.cth` (e.g. `AgentStrip.tsx:81`, `TasksKanban.tsx:128`), so a candidate component must be checked for `window.cth` too, not only `window.api`.

Candidate shortlist re-checked against the component inventory: `ErrorBoundary.tsx`, `BlockedBanner.tsx`, `UpdateBadge.tsx`, `PixelBadge.tsx`, `ProviderLogo.tsx`, `SidebarTabs.tsx`, `ToolWaterfall.tsx` all exist. Pick the 3–5 with no `window.cth` reference and no store subscription; for a store-coupled one, use the documented `require.cache` injection.

Accept the stated ceiling: SSR runs no effects and no events, so assertions are on rendered markup only. That is the point — it satisfies "real `.tsx` is rendered" literally, at zero dependency cost, on all three platforms.

### FLOOR-16 — two amendments to D-28, both mechanical

The 9 + 4 split is **exactly confirmed**. All 13 sites:

*9 × `react-hooks/exhaustive-deps`* — `components/GitTab.tsx`, `components/MemoryGraphPanel.tsx`, `components/OnboardingWizard.tsx`, `components/TerminalView.tsx`, `components/triggers/SchedulesSection.tsx`, `components/triggers/WebhooksSection.tsx`, `hooks/useRestoreTeam.ts`, `ide/IdePanel.tsx`, `realtime/CompletionToast.tsx`.

*4 × `@typescript-eslint/*`* — `src/main/knowledge.ts` (`no-var-requires`), `src/main/nodeInstall.ts` (`no-var-requires`), `src/main/slack.ts` (`no-require-imports`), `src/renderer/src/ide/monaco.ts` (`no-explicit-any`).

**Amendment A — a TypeScript parser is mandatory.** ESLint's default parser (espree) cannot parse type annotations, so it cannot lint a single file in `src/`. `@typescript-eslint/parser` must be installed **as a parser only**. This does not violate D-31, which rejects the ~100-rule *ruleset*; adopting zero rules from it adds zero findings. Current version **8.67.0**, peers `eslint: ^8.57.0 || ^9.0.0 || ^10.0.0` and `typescript: >=4.8.4 <6.1.0` — compatible with the exact `typescript@5.9.3` pin. So the dependency count is **3, not 2**: `eslint`, `@typescript-eslint/parser`, `eslint-plugin-react-hooks`.

**Amendment B — do not use `eslint-plugin-react-hooks@7`'s recommended preset.** D-28's premise — *"the rule surface is two rules … so the finding count is bounded and small"* — was true of v5. Version 7 (current: **7.1.1**) ships the React Compiler rule set: `config`, `error-boundaries`, `gating`, `globals`, `immutability`, `preserve-manual-memoization`, `purity`, `refs`, `set-state-in-effect`, `set-state-in-render`, `static-components`, `unsupported-syntax`, `use-memo`, `incompatible-library` — most at `error`. Whether `configs.flat.recommended` or only `configs.flat['recommended-latest']` carries them is ambiguous in the plugin's own README (**UNVERIFIED**), and the difference is the difference between a ten-line config and a phase-eating finding explosion.

**Recommendation: write the two rules explicitly and never touch a preset.** That makes D-28's bounded-surface guarantee mechanically true regardless of what the plugin's presets do now or in a future minor:

```js
// eslint.config.js — deliberately two rules. See D-28/D-31: the full
// typescript-eslint ruleset and the React Compiler rules are OUT of scope for
// this phase. The parser below adds zero rules; it exists because espree cannot
// parse a type annotation, so without it ESLint lints nothing in src/.
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } } },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
];
```

Two further mechanical facts the planner needs:

- **The 4 `@typescript-eslint/*` deletions are forced, not stylistic.** ESLint errors with *"Definition for rule '…' was not found"* on a disable comment naming a rule no configured plugin provides. D-29 reaches the right answer; this is the reason it is not optional.
- **`--max-warnings 0` is load-bearing, and D-30 is right.** `exhaustive-deps` is `warn`, and unused-directive reporting defaults to `warn` in flat config. Without the flag a hard gate waves both straight through. Setting `reportUnusedDisableDirectives: 'error'` in the config (as above) is belt-and-braces.
- **ESLint 10 (`10.8.1`) requires `node: ^20.19.0 || ^22.13.0 || >=24`.** `package.json` `engines` says `>=20 <23`, which admits Node 20.0–20.18 — versions that cannot run it. CI (`node-version: 22` → latest 22.x) is fine. Either accept the looseness with a comment or use the `maintenance` tag (`eslint@9.39.5`, engines `^18.18.0 || ^20.9.0 || >=21.1.0`). ESLint 9 is the safer pick given the repo has never linted and nothing depends on ESLint 10 features; the react-hooks plugin peer-supports both.

**The one thing nobody has measured:** how many `exhaustive-deps` warnings 131 `useEffect` + 45 `useCallback` + 26 `useMemo` call sites across 130 renderer files actually produce. See Open Question 1.

### FLOOR-17 — templates and ADRs

`.github/ISSUE_TEMPLATE/` contains `bug_report.yml`, `config.yml`, `feature_request.yml`. `docs/adr/` contains `0001-one-gate-for-pty-writes.md`, `0002-prompt-cache-invariant.md`, `0003-fail-safe-worktree-gc.md`, `0004-single-committer-git.md`, `README.md`. So the ADR **home** exists; the requirement's clause is that rationale currently buried in long source comments moves there.

Rich candidates found while reading source this session, each currently a multi-paragraph inline comment carrying a real decision:

| Rationale | Currently at | Why it is ADR-shaped |
|---|---|---|
| Why the ledger holds cumulative snapshots and how to derive velocity | `src/main/db.ts:44`, `src/main/telemetry.ts:11` | RECORD-03/04 exist because this contract was violated; writing it down is the durable fix. |
| Why the terminal pool is one Terminal per pty for the app's lifetime, and the two bounding rules | `src/renderer/src/components/terminalPool.ts:1-16`, `src/renderer/src/store/terminalPoolPolicy.ts:1-19` | Explains a non-obvious design and its failure modes; the policy file's header is already ADR prose. |
| Why `updateAgent` must be a no-op on an unchanged patch | `src/renderer/src/store/agentPatch.ts:25-40` | A performance invariant that a future contributor would otherwise "simplify" away. |
| Why the ledger commit debounce and `add -A` batching are shaped as they are | `src/main/hive.ts:2686-2697` | Complements ADR-0004. |
| Why the breaker steers before it constrains and why `hardStop` is off | `src/main/breaker.ts:22`, `src/main/config.ts:143` | D-18 is a product decision, not a config default. |

Do **not** delete the source comments when the ADR lands — link them. A file:line pointer at the call site plus depth in the ADR is the pattern `docs/adr/0002` already uses.

Bug-template half: the template asks for "Logs". Until FLOOR-05's button ships, that ask is unanswerable. Also note `CONTRIBUTING.md` carries a **stale** paragraph claiming *"11 tests fail on Windows, non-blocking"* — `ci.yml`'s comments record that all three platforms are hard gates and that 7 of the 11 were real Windows source bugs, now fixed. That stale paragraph is a doc claim contradicting source and is in scope for this phase's honesty work.

### FLOOR-18 — Codex on Windows

`src/main/index.ts:269` verified verbatim: `if (process.platform === 'win32') return false;`, opening `enableCodexRemoteForSpawn` (`:266-270`). The JSDoc above (`:262-265`) explains that failure is non-fatal in general but says nothing about Windows.

The declaration channel is `src/shared/providerAutomation.ts` — `providerCapabilities` builds `mail: preset.canReceiveInbox` at `:262` and `capabilityLine` follows; `:278` carries the cache-safe roster-position marker ADR-0002 governs. The channel already carries "NO MAIL" and "spend UNTRACKED", so a "REMOTE CONTROL: unavailable on Windows" entry is an addition in kind.

**ADR-0002 is the live constraint and it is sharp:** a platform-dependent capability line changes roster-prompt text **per OS**, which changes the prompt prefix, which invalidates the prompt cache differently on different machines. Read ADR-0002 before choosing between D-40's two options. The **`remote` bit** is the safer of the two: it keeps `capabilityLine`'s signature stable and puts the platform decision at the call site (main, which already knows the platform), rather than threading a platform argument through a shared module that both main and renderer import. `test/engine-parity.test.cjs` already asserts on `capabilityLine`, so either shape is testable — but a signature change ripples into that test and into `test/provider-config.test.cjs`, while a new boolean field does not.

D-41 is right that removing the bare `return false` is not a fix: the existing ladder would then attempt a Unix-socket path on Windows, producing two subprocess timeouts per spawn and still surfacing nothing in UI or docs. Upstream `openai/codex#30372` records the daemon lifecycle as Unix-only (pidfile + Unix process/file locking) `[CITED via CONTEXT.md D-39; not independently re-fetched this session — UNVERIFIED by me]`.

### FLOOR-06 — one step, and a doc sentence

Two of three clauses already ship (see § Requirements Already Satisfied). What is missing is **attestation** and the **SmartScreen honesty sentence**.

Current: `actions/attest-build-provenance` is at **v4** (`v4.2.2` latest tag). As of v4 it is a thin wrapper over `actions/attest`; the README says new implementations should prefer `actions/attest`, but `attest-build-provenance` remains supported and is the lower-friction choice for a build-provenance predicate. Public repos use the public-good Sigstore instance and artifact attestations are free on all current GitHub plans.

Inputs (read from the action's `action.yml` this session): exactly one of `subject-path` | `subject-digest` | `subject-checksums`. **`subject-checksums`** — *"Path to checksums file containing digest and name of subjects for attestation"* — is a precise fit for this repo, because `release.yml`'s `publish` job already produces `release/SHA256SUMS.txt` by concatenating the three per-platform files.

**Recommended shape — one step, one job, zero restructuring:**

```yaml
  publish:
    name: Publish release
    needs: build
    if: startsWith(github.ref, 'refs/tags/')
    runs-on: ubuntu-latest
    permissions:
      contents: write        # the release upload
      id-token: write        # mint the OIDC token for a Sigstore cert
      attestations: write    # persist the attestation
    steps:
      # ... existing checkout / setup-node / download-artifact / flatten steps ...

      # FLOOR-06. Attests every artifact named in SHA256SUMS.txt in one call —
      # the file the "Flatten + merge checksums" step above already produces.
      # Verify with:  gh attestation verify <file> --repo MARKXAILABS/hello-markx
      - name: Attest build provenance
        uses: actions/attest-build-provenance@v4
        with:
          subject-checksums: release/SHA256SUMS.txt

      # ... existing softprops/action-gh-release step ...
```

Two things to get right:

1. The workflow currently declares `permissions: contents: write` at **workflow** level. A job-level `permissions:` block **replaces** it, so `contents: write` must be repeated in the `publish` job or the release upload loses its token.
2. Attest **after** the flatten step and **before** the release upload, so the attested digests are the bytes that ship.

Verification command for the docs: `gh attestation verify <artifact> --repo MARKXAILABS/hello-markx`.

**The honesty sentence is part of the requirement, not a nicety.** REQUIREMENTS.md FLOOR-06 states it explicitly: provenance *"does **not** buy SmartScreen suppression, so the docs must say so plainly."* `release.yml` already emits a `::warning::` on the unsigned Windows path with the right words. The same statement belongs in `README.md`, `RELEASE.md` and `SECURITY.md`, next to the download links.

Zero recurring cost: confirmed. Sigstore public-good + GitHub attestations are free on public repos; nothing here adds a metered dependency.

`[VERIFIED: actions/attest-build-provenance action.yml + tag list, fetched this session]` `[CITED: docs.github.com/actions/security-for-github-actions/using-artifact-attestations]`

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Per-agent hook identity | A second auth scheme, a token file with restrictive perms, an HMAC/nonce layer | `Map<token, agentId>` in `HookServer` + per-spawn env injection (D-11) | D-15 already rejected each alternative with reasons. `chmod 0o600` is a no-op on NTFS; there is no supported Node API for socket peer credentials (nodejs/node#7627). |
| Budget enforcement state | A second state machine beside the breaker | One arm in `breaker.ts`'s `evaluate()` (D-17) | The breaker is already per-agent, already wired to `control:breakerState` → renderer, already emits a native toast, already calls `forget()` on teardown, already ships `hardStop:false`. |
| Cost surfacing to the UI | A new IPC channel | Widen the existing `hive:tasks` row (D-22) — and fan it out through `useHiveTasks` | The renderer already polls it. A new channel is a fifth poller in a requirement about having too many. |
| Renderer component testing | React Testing Library + jsdom | `react-dom/server` `renderToStaticMarkup` under `node --test` (D-24) | 4 permanent devDeps, a second test idiom, and a directly contradicted house rule, for interaction coverage a one-operator tool exercises manually every session. |
| Full-text memory search | A tokeniser, a scorer, a second index | SQLite **FTS5**, already compiled into the bundled `better-sqlite3` (D-32) | Zero new dependencies. `kg-core.cjs`'s hand-rolled TF scorer is the cautionary example, and it was formally retired. |
| Lint | oxlint / Biome / full typescript-eslint | ESLint flat config, two rules (D-28/D-31, amended) | Neither oxlint nor Biome honours the existing `// eslint-disable-next-line` syntax, so all 13 comments would need rewriting — deletion cost *plus* dependency cost. |
| A shared task poller | A new context/provider | `useHiveTasks()` — already written, zero callers | See § Inert Features. |
| Secret matching in the commit path | A second pattern set | `redactSecrets` (`hive.ts:324`) | Two matchers that disagree is worse than one imperfect one. |
| Terminal-pool disposal per call site | A dispose call at each new drop site | The roster sweep (`orphanedTerminalIds`) | `terminalPoolPolicy.ts`'s header records that the per-call-site approach already failed once for exactly this reason. |
| ESLint TypeScript support | A custom parser or a `.js`-only lint scope | `@typescript-eslint/parser`, **parser only, zero rules** | There is no other way to parse `.ts`/`.tsx`. Zero rules means zero findings. |

**Key insight:** the recurring failure mode on this repo is not building the wrong thing — it is building the right thing and never calling it. Three separate instances are confirmed in this document. Before any plan task says "implement X", make it say "grep for X; if it exists, grep for its callers; paste both."

## Common Pitfalls

### Pitfall 1 — Two agents in one working tree

**What goes wrong:** `use_worktrees: false` means all agents share one checkout. Two agents editing different parts of `src/main/index.ts` produce a lost update, not a conflict, and it is invisible at review.
**Why:** no isolation boundary; last writer wins silently.
**Avoid:** the exclusive-token discipline in § Wave Plan. At most one holder of T-INDEX / T-HIVE / T-HOOKS / T-PRELOAD / T-TSX / T-PROTO per wave.
**Warning sign:** two tasks in the same wave whose file lists intersect at all. Not "mostly disjoint" — disjoint.

### Pitfall 2 — Bending a test so a buggy source path passes

**What goes wrong:** `test/hive-protocol-v2.test.cjs:276-284` asserts the *summing* behaviour that RECORD-04 exists to remove. The path of least resistance is to change source and test in one commit and call it done.
**Why:** the test encodes a defect, so it *must* change — which makes it feel like an exception to the rule.
**Avoid:** D-23's exact sequence. Source fix lands first, in its own `fix(...)` commit. The test is rewritten in a following commit, with the old expectation quoted in the message.
**Warning sign:** one commit whose diff touches both `src/main/hive.ts` arithmetic and a test assertion about that arithmetic.

### Pitfall 3 — Assuming a clause is open because a requirement says so

**What goes wrong:** planning FLOOR-11, FLOOR-14, FLOOR-06 and VERDICT-03 as construction work when four to six of their clauses already ship. Wasted effort, plus a real chance of *regressing* a working feature.
**Why:** REQUIREMENTS.md and ROADMAP.md were written against the audit snapshot `1ad9638`; PRs #51/#56/#72 and others landed after it.
**Avoid:** D-42's per-clause bar applied at **plan** time, not just at close time. First task of every plan: quote the clause, run the grep, paste the output.
**Warning sign:** a plan task with no "current state" evidence line.

### Pitfall 4 — "CI green" as closure evidence for the runtime bump

**What goes wrong:** the 423-test suite stubs `electron`, so it cannot fail on an Electron-version regression. Three green platforms prove nothing about FLOOR-03.
**Why:** `test/load-ts.cjs`'s stub exists so the suite can run *without* Electron.
**Avoid:** D-09's live Windows operator run (launch built app → terminal pane → real PTY spawns → real `better-sqlite3` write lands), recorded alongside CI, plus D-10's version assertion in the e2e spec.
**Warning sign:** a FLOOR-03 closing comment whose only evidence is a CI link.

### Pitfall 5 — The FTS5 migration shipping untested

**What goes wrong:** `test/config-secrets.test.cjs`'s `FakeDatabase` has no SQL at all, so a test written against the existing fake asserts nothing about the migration.
**Why:** the real `better-sqlite3` is built for the Electron ABI and cannot load under plain `node --test`.
**Avoid:** ~~budget a task for `npm rebuild better-sqlite3` in CI~~. **[SUPERSEDED by red-team round 2/3 — see this file's Open Questions, and plans 01/10/21 which are the authority.]** On 13.x that step is harmful, not merely redundant. Budget nothing: the N-API prebuild loads under `npm ci --ignore-scripts`.
**Warning sign:** an FTS5 test that passes without ever executing `CREATE VIRTUAL TABLE`.

### Pitfall 6 — Escalating the breaker one level and expecting `constrained`

**What goes wrong:** a FLOOR-10 test ticks one beat, sees `steering`, and gets "fixed" by asserting `steering` — silently accepting a cap that never constrains.
**Why:** `breaker.ts:280` escalates `rank+1` per beat from the current level.
**Avoid:** tick at least twice; assert the *final* level and the reason string.
**Warning sign:** a budget test with exactly one `tick()`.

### Pitfall 7 — `package-lock.json` written by the wrong npm, or over a dirty tree

**What goes wrong:** the Electron 43 dep tree re-resolves broadly. A lockfile written by npm 11, or over a `node_modules` still holding Electron-32-ABI `.node` files with `-f` in play, produces the classic works-locally / red-on-CI split.
**Why:** lockfile format drift plus stale native artifacts.
**Avoid:** D-07 exactly — wipe `node_modules`, install on a clean tree, never hand-edit the lockfile. (The "npm 10" clause is withdrawn; record the writer's `node --version && npm --version` instead.)
**Warning sign:** a lockfile diff with `"lockfileVersion"` changed, or a local `npm test` green while CI's `npm ci` is red.

### Pitfall 8 — Claiming a capability the platform will not deliver

**What goes wrong:** FLOOR-14's docs claim notifications work everywhere; under Electron 42+ macOS requires code-signing for UNNotification delivery, and this project's macOS signing is best-effort.
**Why:** a platform behaviour change inside the same phase as the feature claim.
**Avoid:** the same discipline D-39/D-40 apply to FLOOR-18 — declare the limitation in source, docs and UI rather than claiming the capability.
**Warning sign:** any FLOOR-14 doc sentence without a platform qualifier.

## Code Examples

### 1. `test/load-ts.cjs` — stop `require('electron')` from downloading a binary

```js
// Source: read of electron@43.4.1/index.js (npm registry, this session);
// current file at test/load-ts.cjs:28-42
function requireElectron() {
  // Electron 42+ downloads the binary on first require (electron/index.js ends
  // `module.exports = getElectronPath()`), so calling the real loader under
  // `npm ci --ignore-scripts` pulls ~100 MB on every CI runner. The ONLY reason
  // this asked for the real module was to let an injected fake win — so ask
  // require.cache for that injection directly and never touch the loader.
  let id;
  try { id = require.resolve('electron'); } catch { return electronStub(); }
  const injected = require.cache[id]?.exports;
  if (injected && typeof injected === 'object') return injected;
  return electronStub();
}
```

### 2. `e2e/smoke.spec.ts` — the one automated Electron-version gate (D-10)

```ts
// Source: pattern from Playwright's _electron API; the app is launched from
// out/main/index.js by playwright.config.ts.
const versions = await electronApp.evaluate(({ process }) => ({
  electron: process.versions.electron,
  modules: process.versions.modules   // the native ABI number
}));
// Pin the MAJOR only: a patch bump must not turn the gate red, but a silent
// revert to 32 must. This is the only assertion in the repo that can catch it —
// npm test stubs `electron` and structurally cannot (see D-08).
expect(Number(versions.electron.split('.')[0])).toBeGreaterThanOrEqual(43);
```

### 3. `.github/workflows/release.yml` — provenance in one step (FLOOR-06)

```yaml
# Source: actions/attest-build-provenance action.yml (inputs read this session).
# `subject-checksums` attests every file named in a sha256sum-format file — the
# exact artifact the "Flatten + merge checksums" step already produces.
    permissions:
      contents: write        # NOTE: a job-level block REPLACES the workflow-level
      id-token: write        # one, so contents:write must be restated here or the
      attestations: write    # release upload loses its token.
    steps:
      - name: Attest build provenance
        uses: actions/attest-build-provenance@v4
        with:
          subject-checksums: release/SHA256SUMS.txt
```

### 4. `eslint.config.js` — two rules, explicitly (FLOOR-16, D-28 amended)

```js
// Source: eslint-plugin-react-hooks README (facebook/react, main) + the
// @typescript-eslint/parser 8.67.0 peer range, both read this session.
// The preset is deliberately NOT used: v7's flat.recommended may carry the
// React Compiler rule set (~17 rules), which is the finding explosion D-31
// rejects. Two rules, named, is the bounded surface D-28 locked.
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,               // parser ONLY — zero typescript-eslint rules
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'   // needs --max-warnings 0 (D-30)
    }
  }
];
```

CI step (`.github/workflows/ci.yml`, into the existing `typecheck` job — it already runs `npm ci --ignore-scripts` and needs no native build):

```yaml
      - name: Lint
        run: npm run lint          # NOT bare `npx eslint` — plan 21 adds the script and asserts this exact form
```

### 5. `sweepTaskReviews` — the obligation set (VERDICT-02)

```ts
// Source: src/main/hive.ts:1762-1791, read this session.
// ponytail: a Set of "owes a review", not a second status field. The transition
// EDGE mints the obligation; only a successfully-mailed query clears it. A card
// that flipped done while every agent was busy stays in the set and is retried
// next sweep — which is the whole of VERDICT-02.
private owesReview = new Set<string>();

// inside sweepTaskReviews(), replacing the transition-only gate:
for (const task of tasks) {
  if (task.status !== 'done' || !task.assignee) continue;
  const wasDone = previous.get(task.id) === 'done';
  if (!wasDone && previous.has(task.id)) this.owesReview.add(task.id);
  if (!this.owesReview.has(task.id)) continue;
  const reviewer = this.leastLoadedIdle([task.assignee]);
  if (!reviewer) continue;            // obligation SURVIVES — this was the bug
  this.send({ /* … unchanged … */ }, 'system');
  this.patchTask(task.id, { review: { by: reviewer, askedAt: new Date().toISOString() } });
  this.owesReview.delete(task.id);
  asked++;
}
```

And in `applyReviewVerdict` (`hive.ts:1794-1806`), on `refuse`, re-add the id — that closes the *refused-then-fixed-then-done-again* hole without weakening the `task.review` guard.

## State of the Art

| Old approach | Current approach | When changed | Impact here |
|---|---|---|---|
| `electron` downloads its binary in `postinstall` | Downloads lazily on first `require()` | Electron **42** | Breaks `test/load-ts.cjs`'s throw-and-stub assumption on all three `--ignore-scripts` CI jobs. See Finding 1. |
| `better-sqlite3` as a raw-V8 addon | **N-API** from **13.0.0** | better-sqlite3 13.0.0 | 11.10.0 will not build against Electron 43's V8 15. See Finding 2. |
| `@electron/rebuild` 3.x | 4.x (`4.2.0`, `node >=22.12.0`) | — | 3.7 predates the Electron 40+ ABI tables (D-04). |
| macOS `NSUserNotification` | `UNNotification`; code-signing required to display | Electron **42** | FLOOR-14's macOS claim needs a qualifier. |
| electron-builder `win.*` signing keys | `win.signtoolOptions` + separate `azureOptions` | electron-builder **26** | Inert here (no signing keys in the yml), but re-read the CLI flag names. |
| electron-builder `mac.notarize` config key | Env vars | electron-builder **26** | `mac.notarize: false` is explicitly set — most likely single schema warning on this file. |
| `eslint-plugin-react-hooks` = 2 rules | v7 adds the React Compiler rule set | eslint-plugin-react-hooks **7** | D-28's bounded-surface premise needs the explicit-rules config to stay true. |
| ESLint `.eslintrc` | Flat config only (ESLint 10 drops eslintrc entirely) | ESLint **9** → **10** | The plan writes flat config regardless; only affects which docs to trust. |
| Electron dialogs restore last-used directory | Default to **Downloads** when `defaultPath` omitted | Electron **43** | Four call sites, all omitting `defaultPath`. See the table in § What actually breaks. |

**Deprecated/outdated in this repo's own docs:**
- `CONTRIBUTING.md`'s *"11 tests fail on Windows, non-blocking"* — stale; `ci.yml` is the source of truth (all three platforms are hard gates; 7 of the 11 were real Windows source bugs, fixed as #57/#58/#60).
- `HIVE.md:124-126`, `:223-230`, `:269`, `:271` — four claims about the Stop-drain and `cursor.json` that source now contradicts. See § FLOOR-02(b).
- `src/main/hive.ts:1738-1740` — `leastLoadedIdle`'s doc comment claims *"the sweep then simply leaves the card alone and tries again next minute"*, which the code does not do. See § VERDICT-02.
- `README.md` / `src/preload/index.ts:838` — *"Enterprise Knowledge Graph"* for what `kg-core.cjs:3-8` honestly calls a keyword knowledge store (D-35).

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js (host) | everything | ✓ | System is **v24** per operator memory; `.nvmrc` pins 22 | **No longer a mismatch for the lockfile.** The npm-10/Node-22 writer rule is withdrawn (npm 9/10/11 all write `lockfileVersion: 3`); do NOT install a second Node to satisfy it. Node 24 also breaks the `node-pty` winpty gyp build on Windows per `ci.yml`. |
| npm 10 | ~~D-07 lockfile regeneration~~ | n/a | — | **Rule withdrawn.** npm 9/10/11 all write `lockfileVersion: 3`; the writer's version is recorded, not gated. |
| `git` | commits, `hive.ts` git paths, tests | ✓ | — | — |
| `gh` CLI | D-46 phase gate, D-43/44 issue closing, `src/main/github.ts` | ✓ | Authenticated — `gh issue list` returned 24 issues this session | — |
| Visual Studio 2019 Spectre / ClangCL | `node-pty` native build on Windows | ✓ per operator memory | — | Required for `node-pty`'s `SpectreMitigation: Spectre` in `binding.gyp`. |
| Python 3.11 | `node-gyp` (`distutils`) on Linux CI | ✓ (CI pins it) | 3.11 | Already pinned in `ci.yml`, `e2e.yml`, `release.yml`. |
| Electron 43 binary | e2e job, D-09 live run | ✗ (not yet installed) | — | Wave 1 installs it. Note Finding 1 — under Electron 43 it downloads lazily. |
| `mempalace` CLI | `MemoryManager` | ✗/unknown | — | `MemoryManager` degrades to a silent no-op when absent — which is exactly why D-33's FTS5 keyword path is worth having. Not a blocker. |
| Live accounts for pi/opencode/crush/qwen | engine verification | ✗ | — | Out of scope for Phase 1 (STATE.md blocker). FLOOR-09/FLOOR-18 must be verified against the **capability tables**, not live sessions. |
| macOS signing certs (`APPLE_*`) | notarization; **macOS notification delivery under Electron 42+** | ✗ | — | Best-effort no-op today. Means FLOOR-14 on macOS is unverifiable here — state the limitation. |
| Azure Trusted Signing (`AZURE_*`) | Windows code signing | ✗ (deliberately — zero-recurring-cost) | — | FLOOR-06 delivers provenance + checksums instead. Docs must say SmartScreen still fires. |
| Android device on the LAN | — | n/a | — | Phase 2 concern, listed only to confirm it is **not** Phase 1's. |

**Missing dependencies with no fallback:** none block Phase 1.
**Missing dependencies with fallback:** the Node-22-for-lockfile mismatch is the one item that will bite immediately and silently. Put it in wave 1's first task.

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Node built-in **`node --test`** (no Jest/Vitest/Mocha) + `node:assert/strict`. Playwright `@playwright/test ^1.62.1` for e2e only. |
| Config file | **None** for the unit suite (behaviour comes from `package.json` scripts). `playwright.config.ts` for e2e. |
| Quick run command | `npm run test:focused` — hand-listed ~33 files. **Never a gate** (`CONTRIBUTING.md`: *"a hand-written file list is how eight test files went unrun for months"*, #7). |
| Full suite command | `npm test` = `node --test test/*.test.cjs` — 56 files, 426 tests (422 pass / 0 fail / 4 skip). **The gate.** |
| Typecheck | `npm run typecheck` = `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json` |
| E2E | `npm run e2e` = `playwright test` — Linux/xvfb only, one spec, `workers: 1`, `retries: 0` |
| Lint (after FLOOR-16, wave 8) | `npm run lint` (the local install — never bare `npx eslint`) |
| Shell gotcha | `node --test test/` does **not** work — the glob `test/*.test.cjs` is expanded by Node itself. Always use the exact invocation. |

### Phase Requirements → Test Map

Command column is the automated proof. "Live" means an operator/CI action that no unit test can substitute for.

| Req | Behaviour to prove | Type | Automated command | File exists? |
|---|---|---|---|---|
| FLOOR-01 | `autoMode` renders on the agent card | static render | `node --test test/renderer-components.test.cjs` | ❌ Wave 6 (needs W1 loader) |
| FLOOR-02 | queue-drain + quiesce run in main with no window | unit (DI harness) | `node --test test/delivery-main.test.cjs` | ✅ extend |
| FLOOR-02 | no doc promises a dead path | repo-fact | `node --test test/repo-claims.test.cjs` (greps `HIVE.md` for the four dead claims) | ❌ Wave 6 (D-45) |
| FLOOR-03 | 3-platform suite green on Electron 43 | full suite | `npm test` on ubuntu/windows/macos | ✅ `ci.yml` |
| FLOOR-03 | the launched app really is Electron ≥43 | e2e | `npm run e2e` (D-10 assertion) | ✅ extend `e2e/smoke.spec.ts` |
| FLOOR-03 | real PTY spawns; real `better-sqlite3` write lands on Windows | **live (D-09)** | operator run of the built app | — |
| FLOOR-04 | a secret in an agent file never reaches `git log -p` | integration (real temp git repo) | `node --test test/hive-durability.test.cjs` | ✅ extend — this file already drives a real `git` |
| FLOOR-05 | `openLogs` is exposed and reachable from Settings | repo-fact + static render | `test/repo-claims.test.cjs` (preload export present) | ❌ Wave 6 |
| FLOOR-06 | attestation step present with correct permissions | repo-fact (YAML parse) | `node --test test/ci-config.test.cjs` | ✅ extend |
| FLOOR-06 | a published artifact verifies | **live** | `gh attestation verify <file> --repo MARKXAILABS/hello-markx` after the next tag | — |
| FLOOR-07 | FTS5 table created and queryable | integration (**real** SQLite handle) | `node --test test/db-fts.test.cjs` | ❌ Wave 4 — see Pitfall 5 |
| FLOOR-07 | scope surfaced in `MemoryPanel`; dead preload exports gone | static render + repo-fact | `test/renderer-components.test.cjs`, `test/repo-claims.test.cjs` | ❌ Wave 6 |
| FLOOR-08 | a card finished while everyone is busy is reviewed on a later sweep | unit | `node --test test/hive-protocol-v2.test.cjs` | ✅ extend `:220-233` |
| FLOOR-09 | proxy-tier (qwen/crush) spend reaches `getAgentUsage` and can trip the breaker | unit | `node --test test/engine-parity.test.cjs` | ✅ extend (6 `recordCostSample` calls already there) |
| FLOOR-10 | an over-cap card reaches `constrained` — **after ≥2 beats** | unit (fake clock) | `node --test test/breaker.test.cjs` | ⚠ verify exists; else Wave 0 |
| FLOOR-11 | `useHiveTasks` is the only `hiveTasks` timer | repo-fact | `test/repo-claims.test.cjs` (grep: no `setInterval` near `hiveTasks(` outside the hook) | ❌ Wave 6 |
| FLOOR-11 | pool cap + orphan sweep | unit (pure) | `node --test test/terminal-*.test.cjs` | ✅ (`terminalPoolPolicy` already covered) |
| FLOOR-12 | no text token below 14px | repo-fact (parse `tokens.css`) | `test/repo-claims.test.cjs` | ❌ Wave 6 |
| FLOOR-12 | every `<button>` has an accessible name | repo-fact (count/ratio assertion) | `test/repo-claims.test.cjs` | ❌ Wave 6 |
| FLOOR-13 | the four renderings agree on the field set incl. cost | static render | `test/renderer-components.test.cjs` | ❌ Wave 6 |
| FLOOR-13 | `sidebarWidth` re-clamps on resize | unit (pure clamp fn) | `node --test test/renderer-runstate.test.cjs` | ✅ extend — extract the clamp first |
| FLOOR-14 | a blocked non-Claude agent produces a notify call | unit (DI `notify` fake) | `node --test test/hooks-notify.test.cjs` | ❌ Wave 6 |
| FLOOR-15 | 3–5 presentational components render to expected markup | static render | `node --test test/renderer-components.test.cjs` | ❌ Wave 6 |
| FLOOR-16 | lint is a hard gate at zero warnings | repo-fact + live | `test/ci-config.test.cjs` asserts the step + flag; `npm run lint` | ✅ extend / live |
| FLOOR-17 | bug template asks only for logs that exist; ADRs present | repo-fact | `test/repo-claims.test.cjs` | ❌ Wave 6 |
| FLOOR-18 | `capabilityLine` declares the Windows Codex gap | unit | `node --test test/engine-parity.test.cjs` | ✅ extend |
| GATE-01 | agent A's token carrying `agent_id: 'B'` surfaces as A (or is dropped) | integration (**real** socket / named pipe) | `node --test test/net-binding.test.cjs` | ✅ extend (D-16) |
| GATE-01 | the floor-wide `HIVE_SOCK_TOKEN` assignment is gone | repo-fact | `test/net-binding.test.cjs` (already greps source for the timing-safe compare) | ✅ extend |
| RECORD-03 | spend over **all** rows, not a 1 MB tail | unit (ledger > 1 MB) | `node --test test/hive-protocol-v2.test.cjs` | ✅ rewrite `:276-284` (D-23) |
| RECORD-04 | spend from clamped consecutive **diffs**, not sums | unit | `node --test test/hive-protocol-v2.test.cjs` | ✅ rewrite `:276-284` (D-23) |
| VERDICT-02 | obligation survives "no reviewer"; survives a refuse→redo | unit | `node --test test/hive-protocol-v2.test.cjs` | ✅ extend |
| VERDICT-03 | a `canReceiveInbox: false` agent is never selected | unit | `node --test test/hive-protocol-v2.test.cjs` | ✅ new test, **existing** behaviour |

### Sampling Rate

- **Per task commit:** `npm run test:focused` for the tight loop, **then** `npm test` before the commit is considered done. `test:focused` alone is explicitly not a gate.
- **Per wave merge:** `npm test` and `npm run typecheck`, with the three-platform evidence taken from **the phase's draft PR** (`gh pr checks` — rows `Typecheck`, `Test (ubuntu-latest|windows-latest|macos-latest)`, `Electron smoke (ubuntu-latest)`), because both workflows trigger on `branches: [main]` only and a phase-branch push produces **no run at all**. Plus, **after wave 8** (not wave 6 — ESLint does not exist until plan 21), `npm run lint` — never bare `npx eslint`, which fetches an unpinned ESLint from the registry. No `continue-on-error` may be added anywhere.
- **Per wave merge, waves 1 and 4:** `npm run e2e` additionally — wave 1 changes the runtime, wave 4 changes the boot-time delivery path.
- **Phase gate:** full suite green on three platforms; e2e green; lint green; D-09's live Windows run recorded; D-46's mechanical `gh` query returning `0`.

### Nyquist note — the one place sampling is structurally insufficient

`npm test` samples the **stubbed-Electron** behaviour of this app at high rate and the **real-Electron** behaviour at rate ≈ 0 on Windows and macOS. That is below the Nyquist rate for the signal FLOOR-03 cares about: no number of unit runs can reconstruct an Electron-version regression. D-09 (a live operator run) and D-10 (a version assertion in the one real-Electron job) are the two samples that raise the rate above zero. Neither is optional, and neither may be replaced by a CI link.

### Wave 0 Gaps

Test infrastructure that must exist before the requirements that depend on it:

- [ ] `test/load-ts.cjs` — `.tsx` resolution + `ts.JsxEmit.React` (D-25). **Wave 1**, folded into the Electron plan since it owns the file. Blocks FLOOR-01, FLOOR-07 (panel), FLOOR-13, FLOOR-15.
- [ ] `test/load-ts.cjs` — lazy-download fix (Finding 1). **Wave 1**, first commit, verified green on the **old** Electron before the version bump.
- [ ] `test/repo-claims.test.cjs` — the D-45 repo-fact file, following the `test/ci-config.test.cjs` / `test/main-hardening.test.cjs` / `test/engine-parity.test.cjs` precedent. Accumulated across waves 2–6, asserted whole in wave 6. Turns the end-of-phase sweep into `npm test` on three platforms plus one `gh` query.
- [ ] `test/renderer-components.test.cjs` — the `renderToStaticMarkup` harness (D-24). **Wave 6**, after components are final.
- [ ] `test/db-fts.test.cjs` — needs a **real** SQLite handle; the existing `FakeDatabase` cannot serve it. **Wave 4**, and budget the ABI-rebuild step (see Pitfall 5).
- [ ] Verify `test/breaker.test.cjs` exists; if not, create it before FLOOR-10. `evaluate()` is pure and the fake-clock DI style is established.
- [ ] `test/hooks-notify.test.cjs` — or extend an existing hooks test — with a DI `notify` fake for FLOOR-14.
- [ ] No framework install needed. No coverage tool exists and none is being added — this repo's confidence comes from the 3-platform matrix plus the "never mock the thing under test" rule, not from a coverage number.

## Security Domain

### Applicable ASVS categories

| ASVS category | Applies | Standard control in this phase |
|---|---|---|
| V2 Authentication | **Yes** — GATE-01 | Per-agent random token minted per spawn, injected into that PTY's env; server-side `Map<token, agentId>`; `payload.agent_id` **discarded**. Constant-time compare already pinned by a source-grep test in `test/net-binding.test.cjs`. |
| V3 Session Management | Partial | The token is the session credential for the hook socket. Revocation on PTY exit is handled by the same Map (D-11). No timeout/rotation — deliberately deferred (D-15). |
| V4 Access Control | **Yes** | The achievable property is **impersonation resistance** ("A cannot authenticate as B"), not secrecy — an agent's own shell can always read what its own shim can read. D-14 requires this ceiling be documented in `hooks.ts`'s header and **not** overclaimed in docs or UI. |
| V5 Input Validation | **Yes** | Hook payloads cross a trust boundary. `HookPayload` fields (`input`, `output`, `cache_read`, `cache_creation`, `model`) feed the cost ledger; FLOOR-09's rewiring must keep the existing `?? 0` coercions and the `NaN`/negative handling that `test/engine-parity.test.cjs:89-90` already pins. The renderer's IPC defence-in-depth pattern (`useHive.ts:658-660`: *"the main process already filters limit > 0, but the renderer must not trust IPC blindly"*) is the house convention — follow it on the widened `hive:tasks` row. |
| V6 Cryptography | **Yes** | `node:crypto` `randomBytes` + `timingSafeEqual`, already imported at `hooks.ts:23`. **Never hand-roll.** Do not add HMAC/nonce (deferred, D-15). |
| V7 Error handling / logging | **Yes** | `redactSecrets` (`hive.ts:324`) is the single sanitiser; FLOOR-04 extends it to the commit path. Rejected hook payloads must log **loudly** (existing behaviour, `hooks.ts` `authorized`). |
| V12 File / resource | **Yes** | FLOOR-04's commit-path scrub and `UNTRACK_PATHS`. `safeJoin`/`isWithinRoots`/`isAllowedExternalUrl` in `src/main/fs.ts` are the established path guards; `skills:reveal` (`index.ts:3983-3991`) is the pattern to copy for any new path-taking IPC. |
| V14 Configuration | **Yes** | Secrets live in `integration-secrets.json` via Electron `safeStorage`, never in `config.json`, never plaintext over IPC. FLOOR-06's provenance is a supply-chain control. `ci.yml:31-36` runs `npm audit --audit-level=high` (advisory, `continue-on-error` — that one is deliberate and pre-existing). |

### Known threat patterns for this stack

| Pattern | STRIDE | Standard mitigation | Status in this phase |
|---|---|---|---|
| Prompt-injected agent reads the floor-wide hook secret from its own `env` | **Spoofing** | Per-agent tokens bound server-side | **GATE-01** — the phase's core security item. `pty.ts:665` spreads `process.env` into every PTY, which is why D-12's deletion is mandatory. |
| Agent posts a hook payload claiming another agent's id | **Spoofing** | Derive the id from the token server-side; discard `payload.agent_id` | **GATE-01** (D-11), tested over a real socket (D-16). |
| Any local process connects to the socket / named pipe | **Spoofing / Tampering** | Token check at the socket layer; loopback-only binds (already landed) | Existing; GATE-01 strengthens it. |
| Secret written by an agent lands in git history | **Information disclosure** | Scrub at the single commit choke point | **FLOOR-04**, reusing `redactSecrets`. |
| Timing attack on the token compare | **Spoofing** | `timingSafeEqual`, pinned by a source-grep regression test | Already landed; do not regress. `test/net-binding.test.cjs` greps four files for the length-comparison pattern. |
| Cost-ledger poisoning via forged hook payloads | **Tampering / Repudiation** | Same token gate; FLOOR-09's rewiring must not open a second unauthenticated path | **FLOOR-09** — route through `recordCostSample`, keep the `authorized()` gate ahead of it. |
| Supply-chain: a tampered release binary | **Tampering** | Sigstore build provenance + published SHA256SUMS | **FLOOR-06**. Note honestly: this does **not** suppress SmartScreen. |
| Dependency-confusion / malicious transitive dep | **Tampering** | `npm ci` from a committed lockfile, dependabot, `npm audit --audit-level=high` | Existing. Wave 1's lockfile regeneration is the moment of maximum exposure — regenerate on a clean tree and review the diff (the npm-10 writer clause is withdrawn). |
| Path traversal via IPC file arguments | **Tampering** | `safeJoin`/`isWithinRoots`, root-confinement checks | Existing; no new file-taking IPC is planned. Copy `skills:reveal`'s shape if one appears. |
| Unbounded resource growth (feeds, pools, ledgers) | **Denial of service** | `FEED_MAX`, `TERMINAL_POOL_MAX`, `LOG_ROTATE_BYTES`, ledger tail | Mostly landed. **RECORD-03 deliberately removes one bound** (the 1 MB `taskSpend` tail) — D-20's in-memory `Map<taskId, tokens>` is what replaces it, and it must be bounded by card lifetime, not grow forever. Flag this in the plan. |

**Not in scope, explicitly:** server-side memory scope enforcement (RECALL-02, Phase 5), socket peer-credential binding, HMAC/nonce replay protection, engine sandboxes (GATE-04, Phase 4), command-string judging in main (GATE-03, Phase 4). Building any of them here hollows out a later requirement.

## Project Constraints

There is **no `./CLAUDE.md`** at the repo root (verified: `ls` of the root). There are **no project skills** (`.claude/skills/`, `.agents/skills/` — neither directory exists). The binding constraints therefore come from `.planning/` and from in-repo docs. Treat these with the authority of locked decisions:

1. **Zero recurring cost, total roadmap $0.** No paid certificate, notarization, hosted embedding or metered API on a required path. Every Phase 1 choice was checked against this: FTS5 is bundled, Sigstore is free on public repos, ESLint and `@typescript-eslint/parser` are free, `renderToStaticMarkup` adds nothing.
2. **Verification honesty.** An agent reporting "fixed" is a claim, not evidence. This has already caught four over-claims. D-42–D-47 make the bar mechanical.
3. **No `git add .` / `git add -A` for source commits; stage specific files only.** (Note the distinction: `hive.ts`'s own `flushCommit` uses `add -A` **inside the hive repo**, which is a different repository and a deliberate design — see ADR-0004.)
4. **Disjoint file ownership per agent; `use_worktrees: false`.** See Pitfall 1.
5. **Never mock the thing under test.** `test/win-cmd-shim.test.cjs`'s header: *"Testing against a copy would prove nothing."* Prefer real git repos, real sockets, real temp dirs.
6. **`test:focused` is never a PR gate** (`CONTRIBUTING.md`, #7).
7. **No `continue-on-error` may be added to `ci.yml`.** The existing two (the advisory `npm audit`, and the flaky native-rebuild step in the `build` job) are pre-existing and deliberate; both are documented inline. Do not add a third.
8. **`node-pty` stays exact-pinned at `1.1.0`** — `tools/patch-node-pty-conpty.cjs` does a byte-exact string match and `process.exit(1)`s loudly on mismatch. Read its failure as *"node-pty version changed"*, never *"Electron version changed"* (D-05).
9. **`typescript` stays exact-pinned at `5.9.3`** for typecheck reproducibility.
10. **`package-lock.json` is regenerated on a clean tree, never hand-edited** (D-07 — the "by npm 10" clause is withdrawn; `lockfileVersion: 3` plus `npm ci --ignore-scripts && git diff --exit-code package-lock.json` are the checks that discriminate).
11. **ADR-0002 (prompt-cache invariant)** constrains anything that changes roster-prompt text — directly binding on FLOOR-18 (D-40) and on FLOOR-09's "god is told per-engine capabilities in a prompt-cache-safe position".
12. **ADR-0001 (one gate for PTY writes)** governs anything that types into a terminal — binding on FLOOR-02's queue-drain move.
13. **ADR-0004 (single-committer git)** governs the commit path — binding on FLOOR-04.
14. **The knowledge graph is retired, not deferred.** Do not resurrect a renderer panel as a Phase 1 nicety.

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | `eslint-plugin-react-hooks@7`'s `configs.flat.recommended` *may* include the React Compiler rules; the README is ambiguous. | FLOOR-16 | Low — the recommendation (explicit two-rule config, never a preset) is correct either way. Verify by inspecting the installed `index.js` after install. |
| A2 | `better-sqlite3` release **dates** as reported by fetch (2024) look inconsistent with the version timeline; treated as UNVERIFIED. Version numbers, the N-API-from-13.0.0 fact, and the Electron 42–43 support statement are consistent across two sources. | Electron migration, Finding 2 | Nil for planning — no decision depends on the dates. |
| A3 | Electron 43's Linux glibc ≥ 2.41 requirement for `better-sqlite3` prebuilds, from the 12.12.0 notes. | Finding 2 | Medium — could break the AppImage build or the Linux e2e job. **Verify the ubuntu runner's glibc in wave 1.** |
| A4 | The "four renderings of an agent" are `AgentCard`, `AgentStrip`, `AgentDetailPanel`, `CommandCenterPanel`. Inferred from the component inventory and `usePtyParser` attachments, not confirmed against issue #39's text. | FLOOR-13 | Low — the plan's first FLOOR-13 task is to read and paste the actual four. |
| A5 | D-26's claim that no `.tsx` references `window.api`/`window.electron` directly. Not re-verified. Components **do** reference `window.cth`. | FLOOR-15 | Low — candidate selection must check `window.cth` too, which the plan should state. |
| A6 | Upstream `openai/codex#30372` records the Codex app-server daemon lifecycle as Unix-only. Taken from CONTEXT.md D-39; not independently re-fetched. | FLOOR-18 | Low — D-39 is a locked decision and the outcome (declare the limitation) does not change if the issue number is off. |
| A7 | `electron-builder@26.15.3` exposes a `migrate-schema` command. Documented for v26→v27; presence in 26.15.3 unconfirmed. | Finding 5 | Nil — it is a convenience. The manual read-through D-04 requires happens regardless. |
| A8 | No known Pixi 8 / xterm-webgl incompatibility with Chromium 150. Searched and found nothing; absence of a report is not proof. | Finding 6 | Medium — mitigated by existing GL-recovery code and by D-09's live run. Budget one manual visual pass. |
| A9 | `test/breaker.test.cjs` may not exist. Not verified by listing. | Validation Architecture | Nil — listed as a Wave 0 check. |
| A10 | Suggested v26 electron-builder impacts on `mac.notarize: false` are inferred from release-note prose, not from running the tool against this config. | Finding 5 | Low — wave 1 runs the packager on three platforms, which settles it. |

## Open Questions (RESOLVED)

> **Every question below has an owning plan and task in the final Phase 1 plan set.** None is a live
> unknown at execution time. "Resolved" means *an owner is assigned and the resolution mechanism is
> planned* — for OQ1 that mechanism is deliberately a measurement plus a decision gate, not a number,
> because the number is genuinely unknowable until eslint runs for the first time in this repo.
>
> | OQ | Question | Resolved by | Form of resolution |
> |----|----------|-------------|--------------------|
> | 1 | `exhaustive-deps` finding count | **plan 21, tasks 1 and 4** | **measure-then-escalate** — see below |
> | 2 | `better-sqlite3` rebuild in CI | **plan 01 task 2** (rebuild trialled in wave 1) + **plan 10 task 1** (FTS5 test placement) | decided by measurement |
> | 3 | How much of FLOOR-02's queue moves to main | **plan 08 task 1** | scoped to "main owns the queue and its drain; producers enqueue over IPC" |
> | 4 | `capabilityLine` platform arg vs `remote` bit | **plan 13 task 2** | decided: the `remote` bit |
> | 5 | `pushFeed` no-op guard | **plan 05 task 1** | audit-then-decide; a guard with no dense subscriber is not added |

1. **How many `exhaustive-deps` warnings does this codebase actually produce?**
   - What we know: 131 `useEffect`, 45 `useCallback`, 26 `useMemo` across 130 renderer files, never linted. Nine sites already carry an `exhaustive-deps` disable, which is evidence the rule has real findings here.
   - What's unclear: whether the count is 15 or 150. `--max-warnings 0` (D-30) turns every one into phase work — either a genuine dependency fix or a reviewed suppression.
   - Recommendation: make the **first** FLOOR-16 task an `npx eslint . --max-warnings 999 --format json` run piped through `node -e` for a per-rule tally, paste the count, and only then decide whether the D-30 gate lands in this phase or whether the plan takes a documented, bounded suppression pass first. Do not commit to `--max-warnings 0` in CI before the number is on the page. This is the single largest unbounded item in the phase.
   - **RESOLVED — owner: plan 21, task 1 (measure) and task 4 (gate).** The resolution is **measure-then-escalate**, not a number. Task 1 runs the count and pastes it before any gate exists; task 2 works that list; task 4 commits `--max-warnings 0` to CI only after the list is empty. If the count comes back large enough that resolving it would exceed plan 21's context budget, the executor stops and reports rather than weakening the rule set or taking a blanket suppression pass — that escalation is the planned outcome for the bad branch, not a plan failure. The number stays unknown here on purpose: writing a guess into this document would be the same false-claim class the phase exists to remove.

2. **Does the FTS5 test need a Node-ABI `better-sqlite3` rebuild in CI, and does that survive the 13.x bump?**
   - **ANSWERED — no, and adding one is harmful.** Verified 2026-08-20 in a clean directory: `npm i better-sqlite3@13.0.3 --ignore-scripts` installs 8 N-API prebuilds (`prebuilds/{darwin,linux,linuxmusl,win32}-{x64,arm64}.node`) and nothing compiles; a plain-node `new Database(':memory:')` + `CREATE VIRTUAL TABLE … USING fts5(x)` then works (exit 0). The CI `test` jobs install with `npm ci --ignore-scripts`, which is exactly that condition. `npm rebuild better-sqlite3` **discards** the prebuild and synthesises `node-gyp rebuild`, which needs Python on macOS/Windows runners where `setup-python` is Linux-gated. Owners: plan 01 task 2 (asserts `grep -c "npm rebuild better-sqlite3" ci.yml` is `0`) and plan 10 task 2 (asserts the same value, and is barred from touching `ci.yml`).
   - What we knew before: `ci.yml` already does exactly this for `node-pty` (`npm rebuild node-pty`, with a Python 3.11 pin on Linux) — but node-pty declares a real `install` script that exits 0 where a prebuild exists, so that step is a cheap no-op and better-sqlite3's would not be.
   - Prebuild coverage, measured rather than assumed: 13.0.3 ships `darwin-{x64,arm64}`, `linux-{x64,arm64}`, `linuxmusl-{x64,arm64}` and `win32-{x64,arm64}` — all three CI runners are covered, and the install is a download, not a compile (`added 2 packages in 2s`).
   - **RESOLVED — owner: plan 01 task 2 (does NOT add the step, and asserts `0`) and plan 10 task 2 (asserts the same `0` and is barred from touching `ci.yml`).** The earlier recommendation here — "trial `npm rebuild better-sqlite3` in the `test` job during wave 1 and measure the delta" — is **withdrawn**: it was written against 11.10.0, and on 13.x the rebuild is not a slower no-op but an actively destructive step. There is no delta to carry forward in `01-01-SUMMARY.md`; the number that matters is the `0`.

3. **How much of FLOOR-02's queue must actually move to main?**
   - What we know: the loop is ~150 lines in `useHive.ts:819+`, but the **queue** lives in the Zustand store and has five renderer-side producers (composer, Slack ingress, context triggers, terminal work orders, voice bridge).
   - What's unclear: whether "moves to main" means moving the queue too (a data-ownership migration) or mirroring it (a sync problem). The requirement's success criterion — *"With the app window closed, a message composed in the UI still reaches its recipient's inbox"* — is satisfiable by a persisted main-side queue that the renderer *appends to*, which is much smaller than moving all five producers.
   - Recommendation: plan FLOOR-02 as **two** plans. (a) The idle-quiesce backstop → main: near-mechanical, main already has every input. (b) The queue-drain: start by defining the minimum that satisfies the criterion, which is very likely "main owns the queue and its drain; the renderer's producers enqueue over IPC". Do not start by porting 150 lines.
   - **RESOLVED — owner: plan 07 (the quiesce backstop) and plan 08 (the queue drain), exactly the two-plan split recommended.** Plan 08's task 1 fixes the scope to "main owns the queue and its drain; the renderer's producers enqueue over IPC", and the renderer explicitly keeps the human-draft veto — the one job that stays on its side.

4. **`capabilityLine` platform argument vs `remote` bit (D-40, explicitly left to the planner).**
   - What we know: `providerCapabilities`/`capabilityLine` live at `src/shared/providerAutomation.ts:258-289`; `:278` carries the ADR-0002 cache-safe marker; `test/engine-parity.test.cjs` and `test/provider-config.test.cjs` both assert on this surface.
   - Recommendation: **the `remote` bit.** A signature change ripples into two test files and every caller; a new boolean field does not. And it keeps the platform decision in main, which already knows the platform, rather than threading it through a module both processes import.
   - **RESOLVED — owner: plan 13 task 2, which takes the `remote` bit.** `capabilityLine`'s signature stays stable and the platform decision is made at the call site in main, preserving ADR-0002's cache-safe roster position. D-40 left this to the planner; the planner has decided.

5. **Does `pushFeed` (`store.ts:638`) need the same no-op guard as `updateAgent`?**
   - What we know: it reallocates `feeds` unconditionally, but fires per **tool line**, not per chunk, and is bounded by `FEED_MAX`.
   - What's unclear: whether any component subscribes to `feeds` densely enough for this to matter.
   - Recommendation: check subscribers; if none render `feeds` on the hot path, leave it and say so in the closing comment. A guard added without a subscriber is speculative work.
   - **RESOLVED — owner: plan 05 task 1's drop-path and re-render audit.** The audit enumerates `feeds` subscribers and records a verdict; a guard is added only if a dense hot-path subscriber exists, and its absence is written into the closing comment rather than left implicit.

## Sources

### Primary (HIGH confidence — read directly this session)

- **Repository source**, every `file:line` cited in this document. Principal files read: `src/main/{index,hive,hooks,breaker,delivery,memory,pty,telemetry,db,config}.ts`, `src/renderer/src/hooks/{useHive,usePtyParser,useHiveTasks}.ts`, `src/renderer/src/store/{store,agentPatch,terminalPoolPolicy}.ts`, `src/renderer/src/components/{terminalPool,AgentStrip,TasksKanban}.tsx|.ts`, `src/shared/agentProvider.ts`, `src/preload/index.ts`, `test/load-ts.cjs`, `package.json`, `electron-builder.yml`, `.github/workflows/{ci,e2e,release}.yml`, `HIVE.md`, `DESIGN.md`, `.github/ISSUE_TEMPLATE/`, `docs/adr/`.
- **`.planning/`**: `phases/01-finish-the-floor/01-CONTEXT.md` (all 47 decisions), `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`, `codebase/{CONCERNS,TESTING,STACK}.md`.
- **npm registry** (`npm view`, this session): `electron` 43.4.1 · `electron-builder` 26.15.3 (+ deps, engines) · `@electron/rebuild` 4.2.0 (engines `node >=22.12.0`) · `better-sqlite3` 13.0.3 (+ full version list) · `eslint` 10.8.1 / maintenance 9.39.5 (+ engines) · `eslint-plugin-react-hooks` 7.1.1 (+ peers) · `@typescript-eslint/parser` 8.67.0 (+ peers) · `electron-updater` 6.8.9.
- **`electron@43.4.1/index.js`** fetched from unpkg and read in full — the lazy-download finding.
- **`node_modules/better-sqlite3/{binding.gyp,package.json,deps/defines.gypi,src/}`** and **`node_modules/node-pty/{binding.gyp,package.json}`** — native-surface analysis.
- **`actions/attest-build-provenance` `action.yml`** (raw.githubusercontent, main) + tag list via `gh api` — v4.2.2, `subject-checksums` semantics.
- **`facebook/react` `packages/eslint-plugin-react-hooks/README.md`** (raw.githubusercontent, main) — flat config shape and the full v7 rule list.
- **`gh issue list --state open --label floor-inspection`** — 24 issues, 20 non-epic, matching CONTEXT.md exactly.

### Secondary (MEDIUM confidence — official docs, fetched and summarised)

- [electronjs.org/docs/latest/breaking-changes](https://www.electronjs.org/docs/latest/breaking-changes) — cumulative v33→v43 breaking changes, cross-checked against source greps.
- [Electron 43 release blog](https://www.electronjs.org/blog/electron-43-0) — Chromium 150 / Node 24.17 / V8 15.0.
- [github.com/WiseLibs/better-sqlite3/issues/1416](https://github.com/WiseLibs/better-sqlite3/issues/1416) — 12.4.1 failing at Electron 39 on `Context::GetIsolate()`.
- [github.com/WiseLibs/better-sqlite3/releases](https://github.com/WiseLibs/better-sqlite3/releases) — v13 N-API migration, Electron 42–43 support, glibc note.
- [github.com/electron-userland/electron-builder/releases/tag/v26.0.0](https://github.com/electron-userland/electron-builder/releases/tag/v26.0.0) — v26 breaking changes.
- [docs.github.com — using artifact attestations](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds) — permissions, public-repo Sigstore, `gh attestation verify`.
- [github.com/actions/attest-build-provenance](https://github.com/actions/attest-build-provenance) — v4-as-wrapper note.

### Tertiary (LOW confidence — searched, nothing authoritative found)

- Pixi.js 8 / xterm `addon-webgl` behaviour under Chromium 150. Searched; only pre-Pixi-8 generic WebGL reports surfaced. Reported as "no known issue found", **not** as "no issue exists".
- electron-builder v25→v26 migration page — **does not exist** (`/docs/migration/v25-to-v26/` returns 404). Only v26→v27 is documented. The v26 breaking-change facts above come from the v26.0.0 release notes instead.

### Package Legitimacy Audit

Not applicable in the usual form: **this phase adds no package from an untrusted or newly-discovered source.** Every package named is either already a dependency of this repo (`electron`, `electron-builder`, `@electron/rebuild`, `better-sqlite3`, `node-pty`, `@types/better-sqlite3`) being version-bumped, or a first-party/canonical tool whose identity is not in question:

| Package | Registry | Provenance | Disposition |
|---|---|---|---|
| `electron` ^43.4.1 | npm | Existing dependency, bumped. Publisher: Electron project. | Approved |
| `electron-builder` ^26.15.3 | npm | Existing dependency, bumped. | Approved |
| `@electron/rebuild` ^4.2.0 | npm | Existing dependency (`^3.7.0` → `^4.2.0`). First-party Electron org scope. | Approved |
| `better-sqlite3` ^13.0.3 | npm | Existing dependency, bumped. Publisher: WiseLibs. | Approved |
| `@types/better-sqlite3` | npm | Existing dependency, follows the above. DefinitelyTyped. | Approved |
| `eslint` | npm | Canonical, referenced by the repo's own 13 `eslint-disable` comments. Version choice open (10.8.1 vs maintenance 9.39.5) — see FLOOR-16. | Approved |
| `eslint-plugin-react-hooks` ^7.1.1 | npm | **First-party React** — published from `facebook/react`, `packages/eslint-plugin-react-hooks`. Verified by reading its README at that path in the React repo. | Approved |
| `@typescript-eslint/parser` ^8.67.0 | npm | Canonical `typescript-eslint` project. Peer-compatible with the exact `typescript@5.9.3` pin. **Parser only — zero rules adopted.** | Approved |

`slopcheck` was not run (not installed, and no candidate package here originated from a search result or from training recall — every one is either already in `package.json` or was reached by reading the canonical upstream repository). No package is `[SLOP]` or `[SUS]`. No new runtime **dependency** is added by this phase; all additions are `devDependencies`.

`npm view` confirmed existence and current version for every package above on the **npm** registry, which is the correct ecosystem for all of them.

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|---|---|---|
| Current-source facts (every `file:line`) | **HIGH** | Read directly this session. Nothing restated from CONTEXT.md without re-verification. |
| Requirements-already-satisfied findings | **HIGH** | Each backed by a specific line I read; several contradict the roadmap, which is the phase's stated purpose. |
| Inert-feature findings | **HIGH** | Each confirmed by an exhaustive `grep` excluding the definition site. |
| Electron 33→43 breaking-change applicability | **HIGH** | Official cumulative doc cross-checked with a source grep per API. The negative results (grep empty) are the strongest part. |
| `better-sqlite3` incompatibility (Finding 2) | **MEDIUM-HIGH** | Two independent signals (raw-V8 in the local tree; upstream 12.4.1 failing at Electron 39) plus the N-API-from-13.0.0 fix. Not proven by a build — that is wave 1's job. |
| `electron@43` lazy download (Finding 1) | **HIGH** | Read the published `index.js` directly. |
| Wave plan / collision map | **HIGH** on the collisions (each anchor read), **MEDIUM** on the wave assignment (a defensible partition, not the only one; D-42's per-clause pass may reshuffle it). |
| electron-builder 26 impact | **MEDIUM** | Release-note prose plus a key-by-key read of this repo's config. No v25→v26 migration doc exists. |
| Chromium 150 × Pixi/xterm | **LOW** | Searched, found nothing specific. Reported as unknown, not as safe. |
| ESLint finding volume | **LOW** | Unmeasured. Open Question 1. |

**Research date:** 2026-08-20
**Valid until:** **2026-09-03** (14 days). Short deliberately: Electron 44 goes stable ~2026-08-25 and Electron 41 EOLs the same day, which shifts the supported window to 42/43/44 within a week of this document. That does not invalidate D-01 (43 stays supported to 2027-01-05) but it does date every "latest" figure here. Re-verify `npm view electron dist-tags` and `npm view better-sqlite3 version` before wave 1 executes.
