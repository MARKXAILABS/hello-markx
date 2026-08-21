---
phase: 01-finish-the-floor
plan: 02
subsystem: hook-socket-trust-boundary
tags: [security, gate-01, hooks, pty, identity]
requires:
  - "01-01 (Electron 43 runtime + the load-ts loader the tests run on)"
provides:
  - "HookServer.mintToken(agentId) / revokeToken(token) / revokeAgent(agentId) — a Map<token, agentId> registry"
  - "server-side identity derivation: authorized() returns the derived agentId, payload.agent_id is discarded"
  - "PtyManager.setHookTokenSource(mint, revoke) — per-spawn token injection at the one place every agent PTY is created"
  - "a PreToolUse write gate over the hive's protected set (bin/, .git/, the socket, other agents' dirs)"
  - "a socket watchdog that re-listens on a missing or replaced socket"
affects:
  - "01-06 (wave 3) — owns the hive.ts startProxyBridge token edit AND the three missing shim bodies"
  - "01-04 (wave 2) — owns the SECURITY.md hook-token paragraph"
  - "01-07 (wave 3) — owns HIVE.md; this plan edited §5's hook-socket paragraph only"
  - "01-23 (wave 9) — asserts GATE-01 whole"
tech-stack:
  added: []
  patterns:
    - "identity derived server-side from a capability token, never read off the payload"
    - "realpath the deepest existing ancestor + path.relative containment, never resolve+startsWith"
    - "$HIVE_ROOT/${HIVE_ROOT}/%HIVE_ROOT% expansion before testing a Bash command string"
    - "inode watchdog on a Unix socket to bound a fail-open window"
key-files:
  created: []
  modified:
    - src/main/hooks.ts
    - src/main/index.ts
    - src/main/pty.ts
    - test/net-binding.test.cjs
    - test/hook-auth-roundtrip.test.cjs
    - test/hive-roster-injection.test.cjs
    - HIVE.md
    - .planning/codebase/ARCHITECTURE.md
    - .planning/codebase/INTEGRATIONS.md
decisions:
  - "Mint at PtyManager (pty.ts:664), not at each index.ts call site — one choke point covers every current and future spawn"
  - "Revoke token-exact on PTY exit, not by agent — a restart is kill()+spawn() under the same id, so revokeAgent there would dead-hook the live replacement"
  - "Drop timingSafeEqual AND sha256 from hooks.ts together — a Map.get lookup has no compare; keeping either would be a dead import"
  - "hiddenClaude.ts and memory.ts get NO token and need no edit — the D-12 deletion closes their leak for free"
  - "GATE-01 is NOT complete at the end of this plan"
metrics:
  duration: ~2h10m
  completed: 2026-08-21
---

# Phase 01 Plan 02: Per-Agent Hook Tokens (GATE-01) Summary

Replaced the single floor-wide hook-socket secret with per-agent tokens minted per PTY spawn and
bound to `agent_id` server-side, and closed the four holes that sat beside it — the shared shim, the
hive's own `.git`, the fail-open socket, and four documents describing a design that no longer
exists.

**GATE-01 is NOT complete.** Plan 06 (wave 3) lands the qwen sidecar edit and the three missing shim
bodies; plan 23 (wave 9) asserts it whole. See the cross-plan section below.

---

## Task 1 — evidence (no files, no commit)

Task 1 is declared `<files>(none — evidence only)</files>`, so it produced no commit. Its output is
this section. Every number below was measured on this machine at HEAD `4a4eee9` before any edit, and
every one matched the plan's stated baseline.

### GATE-01 acceptance text, verbatim (`.planning/REQUIREMENTS.md`)

> **GATE-01**: An agent cannot post a hook payload claiming to be a **different** agent, and the
> token that authenticates the socket is not readable from any agent's shell.
> *Status: half done.* PR #76 fixed the half that was simply broken — no shim set
> `payload.sock_token`, so `authorized()` rejected every hook and the whole floor was silent. What
> remains is the security half: the token is a **single floor-wide secret** and `pty.ts:665` spreads
> `process.env` into every PTY, so every LLM-controlled shell can read it. Against a prompt-injected
> agent the check buys nothing. The fix is **per-agent tokens bound to `agent_id` server-side** —
> exactly the threat `hooks.ts:11-18` names.

### One command per clause

```
$ grep -n "HIVE_SOCK_TOKEN" src/main/*.ts
src/main/hive.ts:3092:  payload.sock_token = process.env.HIVE_SOCK_TOKEN || '';
src/main/hive.ts:3162:    sock_token: process.env.HIVE_SOCK_TOKEN || '',
src/main/hive.ts:3534:    sock_token: process.env.HIVE_SOCK_TOKEN || '',
src/main/hooks.ts:17,67,73,188,205   (comments + the rejection log)
src/main/index.ts:5534:  process.env.HIVE_SOCK_TOKEN = hookSockToken();

$ grep -n "process.env" src/main/pty.ts        # the spread, clause 2
670:          ...process.env,                  # (plus PATH/locale reads at 449-629)

$ grep -n "p.agent_id" src/main/hooks.ts       # the trusted read, clause 1
203:        + `agent=${p.agent_id ?? '?'} event=${p.hook_event_name ?? '?'}, `
212:    const agentId = p.agent_id ?? undefined;

$ grep -n "process.env.HIVE_SOCK_TOKEN = " src/main/index.ts
5534:  process.env.HIVE_SOCK_TOKEN = hookSockToken();          # clause open, confirmed
```

**Premise check:** the phase's premise held for every clause. Nothing was already satisfied. The
line numbers in the plan (`index.ts:5534`, `hooks.ts:212`, `pty.ts:665`→670) were all accurate.

### Spawn-site inventory — classified, complete

```
$ grep -rn "ptyManager.spawn(\|pty.spawn(" src/main/ | wc -l
5
```

Five, as the plan measured. One classified entry per line, plus the three sites outside the grep:

| # | Site | What it is | Decision |
|---|---|---|---|
| 1 | `src/main/pty.ts:664` | THE `pty.spawn` — every agent PTY | **Mints here.** Keyed on `opts.env.AGENT_ID`, the id the shim actually reports |
| 2 | `src/main/pty.ts:97` | **A COMMENT**, not a spawn site | n/a — classified, not counted |
| 3 | `src/main/index.ts:2996` | `ptyManager.spawn` — the missing-CLI installer PTY | **No token.** Its opts carry no `env`, so no `AGENT_ID`; it runs an install script, installs no hooks, posts no payloads |
| 4 | `src/main/index.ts:3311` | `ptyManager.spawn` — the real agent spawn | Routes through #1 → gets a token |
| 5 | `src/main/hiddenClaude.ts:148` | `pty.spawn` direct, `--permission-mode bypassPermissions`, **no `--settings`**, `--disallowedTools` default excludes `Bash` | **No token, and no edit needed.** It installs no hook, so it never posts a payload. It *did* inherit the floor-wide token; deleting `index.ts:5534` closes that leak for free. **Not editing it is the fix.** |
| 6 | `src/main/memory.ts:349` and `:392` | `spawn(bin, …, { env: this.childEnv(agentId) })`, `childEnv` spreads `...process.env` | **No token, and no edit needed.** Same reasoning — mempalace posts no hook payloads, and the D-12 deletion stops it inheriting one |
| 7 | `src/main/hive.ts` `startProxyBridge` (`:1170-1223`) | the qwen proxy sidecar, `...process.env`, no `HIVE_SOCK_TOKEN` | **Out of this plan's scope.** Handed to 01-06 task 4, wave 3 — see the cross-plan section |

### The two surfaces per-agent identity does not close on its own

**The shared shim.** `hive.ts:682` writes ONE `<hiveRoot>/bin/cth-hook.cjs` for the whole floor
(`mkdirSync(join(root,'bin'))` at `:681`), and every agent's hooks execute it.

```
$ sed -n '/^const AGENT_DENY_RULES/,/^];/p' src/main/hive.ts | grep -c "bin"
0
```

Nothing in the deny list names the hive root. Confirmed by reading it: it covers `git push --force`,
`rm -rf`, `sudo`, `~/.ssh`, `~/.aws`, `.env` — and nothing under `$HIVE_ROOT`.

**The documentation.**

```
$ grep -rn "HIVE_SOCK_TOKEN\|hookSockToken" SECURITY.md HIVE.md .planning/codebase/ARCHITECTURE.md .planning/codebase/INTEGRATIONS.md
SECURITY.md:35                              # plan 04's — not touched here
HIVE.md:192, HIVE.md:193
.planning/codebase/ARCHITECTURE.md:473
.planning/codebase/INTEGRATIONS.md:116
```

FIVE lines across FOUR files, exactly as the plan stated.

### Recorded baselines (every one matched the plan)

| Command | Expected | Measured |
|---|---|---|
| `grep -c "randomBytes" src/main/hooks.ts` | 2 | **2** |
| `grep -c "stripComments" test/net-binding.test.cjs` | 2 | **2** |
| `grep -cE "(^\|[^A-Z_])SOCK_TOKEN([^A-Z_]\|$)" src/main/hooks.ts` | 3 | **3** |
| `grep -c "hookSockToken" src/main/hooks.ts` | 4 | **4** |
| `grep -c "hookSockToken" src/main/index.ts` | 3 | **3** |
| `grep -c "timingSafeEqual" src/main/hooks.ts` | 2 | **2** |
| `grep -c "timingSafeEqual(" src/main/hooks.ts` | 1 | **1** |
| `grep -c "sockPath()" src/main/hooks.ts` | 2 | **2** |
| `grep -cE "unlinkSync\|rmSync" test/net-binding.test.cjs` | 1 | **1** |
| `grep -c "hookSockToken" test/hook-auth-roundtrip.test.cjs` | 3 | **3** |

Zero baselines that tasks 2 and 3 invert — every one measured `0`, so no part of the work already
existed and no criterion needed re-expressing as a delta:
`grep -c "'\.git'"` **0** · `grep -c "'agents'"` **0** · `grep -ci realpath` **0** ·
`grep -c HIVE_ROOT` **0** · `grep -c setInterval` **0** · `grep -c clearInterval` **0** ·
`grep -c statSync` **0** (all in `hooks.ts`); `grep -c symlinkSync` **0** ·
`grep -c HIVE_ROOT` **0** (in `test/net-binding.test.cjs`); `grep -c "hive.root()"` **0** ·
`grep -c cth-hook test/net-binding.test.cjs` **0**.

### TAP baselines

```
test/net-binding.test.cjs        EXIT=0  # tests 12 / pass 12 / fail 0 / skipped 0 / todo 0   [win32]
test/hook-auth-roundtrip.test.cjs EXIT=0 # tests 3  / pass 1  / fail 0 / skipped 2 / todo 0   [win32]
```

**B-netbind = 12**, measured on this machine, win32. The roundtrip file's two round-trip tests carry
`{ skip: !POSIX }`, so the Windows run cannot demonstrate task 3's repair — which is why a POSIX
runner was stood up (see Deviations).

### Baselines for the three holes beside the token

```
$ sed -n '/private startProxyBridge/,/^  }$/p' src/main/hive.ts | grep -c "HIVE_SOCK_TOKEN"   → 0
$ sed -n '/^const AGENT_DENY_RULES/,/^];/p' src/main/hive.ts | grep -c "bin"                  → 0
$ grep -c "hive.root()" src/main/hooks.ts                                                     → 0
$ grep -c "cth-hook" test/net-binding.test.cjs                                                → 0
```

---

## Task 2 — identity moved server-side (`7642274`)

`src/main/hooks.ts`, `src/main/index.ts`, `src/main/pty.ts` (+ one fixture line, see Deviations).

**What landed:**

- `Map<string, string>` token → agentId. `mintToken(agentId)` (`randomBytes(32)`, never hand-rolled),
  `revokeToken(token)`, `revokeAgent(agentId)`.
- `authorized(p)` now returns `string | null` — the **derived** agent id or nothing. `payload.agent_id`
  is discarded entirely (D-11 removes the mismatch branch rather than adding one). `handle(p, agentId)`
  takes the derived id as a parameter, so there is no path by which a payload's claim reaches it.
- The throttled `REJECT_LOG_INTERVAL_MS` loud-rejection log is kept, and an unauthenticated peer
  still gets the same empty `{}` a real hook gets, so the socket is not a probe. The log no longer
  prints the claimed `agent_id`: it is the unauthenticated claim this gate exists to disbelieve.
- **Socket watchdog** in `start()`/`listenOn()`/`armSocketWatchdog()`/`checkSocket()`: records the
  listening inode, re-checks on an unref'd interval, and re-listens on **gone** (one message) or
  **replaced** (a louder, differently-worded one naming it as a possible rebind, `rmSync` first).
  Cleared in `stop()`. Guarded on `process.platform !== 'win32'` with the reason stated inline.
  Interval is a public field (`socketWatchdogMs`, default 10s) so a test can shorten it to 50ms.
- **The protected-path gate** at the PreToolUse boundary, placed **before** the `control.toolDecision`
  call and deliberately outside the `this.control` guard, so it holds on a floor with no
  ControlRegistry. Protected set: `join(hive.root(),'bin')`, `join(hive.root(),'.git')`,
  `sockPath()` (POSIX), and `join(hive.root(),'agents')/<other>` — with the caller's OWN agent
  directory explicitly allowed. Each branch has its own reason string.
  - Symlinks: `realResolve()` realpaths the deepest **existing** ancestor and re-joins the remainder
    (a target that does not exist yet cannot be realpath'd whole).
  - `$HIVE_ROOT` / `${HIVE_ROOT}` / `%HIVE_ROOT%` (and the same three for `HIVE_SOCK`, `AGENT_DIR`)
    expanded before a `Bash` command is examined, because `hive.ts:1366` names those vars in every
    agent's injected prompt — that spelling is the app's own calling convention.
  - Containment via `path.relative`, case-folded on win32, never a bare `includes`. Bash commands are
    split on shell separators and each word checked, rather than substring-scanned.
- `index.ts:5534` **deleted** (D-12). The replacement comment explains the removal without re-quoting
  the assignment, because plan 06 and plan 23 both run that grep raw. `hookSockToken()` is deleted
  outright, not orphaned — nothing in `src/main/` still needs a floor-identity accessor.
- `pty.ts`: `hookToken` on `PtySession`; mint keyed on `opts.env.AGENT_ID`; injected **last** in the
  env literal so nothing shadows it; released on all three paths that drop a session
  (`onExit`, `kill()`, `killByOwner()`) and in the spawn `catch`, so a PTY that never started cannot
  leave a live token behind.
- The header states D-14's ceiling narrowly, names the same-uid `/proc/<pid>/environ` defeat, records
  D-15's rejected alternatives with reasons, states the shim-side fail-open residual, and names the
  user-global engine seeds the gate cannot reach.

**Acceptance criteria — measured after the change:**

| Criterion | Required | Measured |
|---|---|---|
| `grep -c "process.env.HIVE_SOCK_TOKEN *=" src/main/index.ts` (raw) | 0 | **0** |
| `grep -rn "process.env.HIVE_SOCK_TOKEN *=" src/main/` | no output, exit 1 | **no output, exit 1** |
| `grep -c "p\.agent_id" src/main/hooks.ts` | 0 | **0** |
| `grep -cE "\.length\s*(!==\|===\|!=\|==)\s*\w+\.length" src/main/hooks.ts` | still 0 | **0** |
| `timingSafeEqual` coherence probe | PASS | **PASS** (count 0, calls 0 — both gone) |
| `sha256` coherence probe | PASS | **PASS** (count 0, calls 0 — both gone) |
| `grep -cE "\bSOCK_TOKEN\b" src/main/hooks.ts` | 0 (baseline 3) | **0** |
| `grep -n "randomBytes(" src/main/hooks.ts` | exactly 1, inside the mint | **`317:    const token = randomBytes(32).toString('hex');`** — inside `mintToken` |
| `grep -c "hookSockToken" src/main/hooks.ts` | 0 (baseline 4) | **0** |
| `grep -rc "hookSockToken" src/main/ \| grep -v ":0"` | no output | **no output** |
| `grep -c "hive.root()" src/main/hooks.ts` | ≥1 (baseline 0) | **2** |
| gate reached before `control.toolDecision` | ordering | **:636 gate, :655 toolDecision** |
| `grep -c "'\.git'"` / `"'agents'"` / `-ci realpath` / `HIVE_ROOT` | ≥1 each (baseline 0) | **1 / 2 / 3 / 7** |
| `grep -c "sockPath()" src/main/hooks.ts` | ≥3 (baseline 2) | **6** |
| `grep -c setInterval` / `clearInterval` / `statSync` | ≥1 each (baseline 0) | **2 / 2 / 3** |
| `clearInterval` inside `stop()` | line numbers | **`stop()` at :296, `clearInterval` at :300** (the other, :263, is `armSocketWatchdog` re-arming) |
| `npm run typecheck` | exit 0 | **0** |

**The `timingSafeEqual`/`sha256` choice, stated:** both gone, the first of the two coherent outcomes.
A `Map.get` lookup has no per-byte comparison to leak a prefix and no length shortcut to bail on, so
keeping either symbol would be a dead import kept to feed a grep. `test/net-binding.test.cjs:228`'s
conditional (`if timingSafeEqual survives, sha256 must too`) is satisfied vacuously and still passes.
The `authorized` docblock explains the removal **without naming either symbol**, because that same
raw grep would otherwise read a comment as a dead import.

---

## Task 3 — the tests (`d541ca2`)

`test/net-binding.test.cjs` extended in place (it already drives a real `net.createConnection` over a
real socket — never mocked), `test/hook-auth-roundtrip.test.cjs` repaired.

### RED → GREEN, per new test

Every new assertion was proved able to fail against the **specific defect it guards**, not merely
observed passing. Each probe was installed, run, and reverted.

**1. Impersonation.** Probe: restore the pre-GATE-01 trusted read (`return p.agent_id ?? agentId`).

```
RED  (POSIX)  not ok 9 - agent A's token cannot post as agent B, however the payload is addressed
              expected: 'a-1'   actual: 'b-1'
              # pass 17 / # fail 1
GREEN (POSIX) ok 9   # pass 18 / # fail 0 / # skipped 0
```

**2. Socket watchdog.** Probe: early-return from `armSocketWatchdog` — exactly the pre-fix behaviour
(`listen()` once, error handler only logs, nothing re-listens).

```
RED  (POSIX)  not ok 13 - deleting the hook socket no longer opens the gate until the app restarts
              error: 'connect ENOENT /tmp/md-net-binding-p2zx8k/hooks.sock'
              # pass 17 / # fail 1
GREEN (POSIX) ok 13  # pass 18 / # fail 0 / # skipped 0
```

**3a. The `$HIVE_ROOT` literal (case 3).** Probe: drop the expansion, i.e. a prefix test on the raw
command — the naive implementation.

```
RED  (POSIX)  not ok 12 - an agent cannot write the shim, the hive .git, the socket, or another agent
              "the spelling the app TEACHES agents to use walks straight past the gate"
              expected: 'deny'   actual: 'allow'
```

**3b. The symlink hop (case 8).** Probe: `path.resolve` instead of `realResolve` — the other half of
the same naive implementation.

```
RED  (POSIX)  not ok 12 - "a symlink into <hive>/bin was allowed — realpath is not being applied"
              expected: 'deny'   actual: 'allow'
```

**4. The D-12 source pin.** Probe: re-add a floor-wide assignment to `index.ts`.

```
RED  (win32)  not ok 18 - the floor-wide hook token cannot come back into main
              "src/main/index.ts assigns a floor-wide HIVE_SOCK_TOKEN again…"
```

**5. The repaired round-trip, against the real inversion.** The UNREPAIRED file, run against
post-task-2 source, on a POSIX host:

```
RED  (POSIX)  not ok 1 - the real shim authenticates to the real hook server
              error: 'hookSockToken is not a function'
              TypeError at test/hook-auth-roundtrip.test.cjs:106:22
              # tests 3 / # pass 2 / # fail 1 / # skipped 0
GREEN (POSIX) ok 1, ok 2, ok 3
              # tests 3 / # pass 3 / # fail 0 / # skipped 0
```

*(The `TypeError` is at `:106`, not the plan's `:90` — 01-01 commit `82dd5b1` reshaped this fixture
to feed the shim on stdin and shifted the line. The stdin fixture shape was preserved.)*

### The nine protected-path cases, each outcome individually

Driven over the REAL socket with agent `a-1`'s real minted token, decision read out of
`hookSpecificOutput.permissionDecision`.

| # | Tool | Target | Required | POSIX | win32 |
|---|---|---|---|---|---|
| 1 | `Write` | `<root>/bin/cth-hook.cjs` | deny | **deny** | **deny** |
| 2 | `Bash` | `cat >> <root>/bin/cth-hook.cjs` | deny | **deny** | **deny** |
| 3 | `Bash` | `cat >> "$HIVE_ROOT/bin/cth-hook.cjs"` (unexpanded literal) | deny | **deny** | **deny** |
| 4 | `Write` | `<root>/.git/hooks/pre-commit` | deny | **deny** | **deny** |
| 5 | `Bash` | `rm <root>/hooks.sock` | deny | **deny** | *conditional, see below* |
| 6 | `Write` | `<root>/agents/b-1/settings.json` | deny | **deny** | **deny** |
| 7 | `Write` | `<root>/agents/a-1/settings.json` (own dir) | **allow** | **allow** | **allow** |
| 8 | `Write` | symlink hop `<tmp>/b → <root>/bin`, write `<tmp>/b/cth-hook.cjs` | deny | **deny** | *conditional, see below* |
| 9 | `Write` | an ordinary file under the agent's own cwd (+ `Bash: npm test`) | **allow** | **allow** | **allow** |

Cases 7 and 9 are the calibration: this gate runs on every PreToolUse of every agent, so a gate that
blocks ordinary work is an outage, not a control.

**The two win32 conditionals print their concrete reason to stderr — neither is a silent skip, and
neither uses `{ skip: … }` on the enclosing test:**

```
[net-binding] socket-delete case skipped — a win32 named pipe has no file to rm
[net-binding] symlink case skipped — symlinkSync threw: EPERM: operation not permitted,
  symlink 'C:\...\md-net-binding-XKKZd4\bin' -> 'C:\...\md-net-binding-lxVaOX\b'
```

On POSIX **`# skipped 0`** and no reason lines were printed at all — so cases 3, 5, 8 and the
watchdog genuinely executed there, on this machine and on both CI POSIX runners.

### Acceptance criteria

| Criterion | Baseline | Required | Measured |
|---|---|---|---|
| `node --test test/net-binding.test.cjs` | — | exit 0 | **0** |
| `grep -c "stripComments" test/net-binding.test.cjs` | 2 | ≥3 | **4** |
| net-binding TAP | 12 pass | ≥ B-netbind + 6 = 18 | **19 tests / 19 pass / 0 fail / 0 skipped / 0 todo** |
| roundtrip TAP (win32) | 3/1/2 skip | EXIT 0, fail 0, todo 0 | **3 tests / 1 pass / 0 fail / 2 skipped** |
| roundtrip TAP (POSIX) | — | 3 pass / 0 skipped | **3 tests / 3 pass / 0 fail / 0 skipped** |
| `grep -c "hookSockToken" test/hook-auth-roundtrip.test.cjs` | 3 | 0 | **0** |
| `grep -c "const HOOK_SHIM" test/hook-auth-roundtrip.test.cjs` | 1 | 0 | **0** |
| derived template count | — | ≥6 | **6: `HOOK_SHIM, AGY_HOOK_SHIM, PI_EXTENSION, OPENCODE_PLUGIN, PROXY_BRIDGE_SHIM, GROK_HOOK_SHIM`** |
| `grep -c "cth-hook" test/net-binding.test.cjs` | 0 | ≥1 | **3** |
| `grep -c "symlinkSync" test/net-binding.test.cjs` | 0 | ≥1 | **3** |
| `grep -c "HIVE_ROOT" test/net-binding.test.cjs` | 0 | ≥1 | **3** |
| `grep -cE "unlinkSync\|rmSync" test/net-binding.test.cjs` | 1 | ≥2 | **2** |
| `npm test` | — | exit 0 | **0** |

The `:139` claim is now true: the hardcoded three-element array and the `start + 6000` slice (which
overran `HOOK_SHIM` into `AGY_HOOK_SHIM`, so `HOOK_SHIM` alone carrying the field would have passed
for both) are replaced by a regex enumeration sliced on real delimiters. The per-template field
assertion stays scoped to the three that carry it today, with `01-06-PLAN.md task 4` named in the
comment as the plan that widens it — asserting all six here would leave the suite red until another
plan lands and deadlock a parallel wave.

---

## Task 4 — the documents (`e6ed5f0`)

| File | Was | Now |
|---|---|---|
| `HIVE.md:191-194` | "injected into agent child environments only" | per-agent, minted per-spawn into that one agent's PTY; the server derives the caller and ignores `payload.agent_id`; ceiling stated in one sentence. **§5's hook-socket paragraph only — nothing else in the file moved or renumbered.** |
| `.planning/codebase/ARCHITECTURE.md:469-475` | "a per-process `sock_token` (minted once at module load, `SOCK_TOKEN`, `src/main/hooks.ts:70`)" | the `Map<token, agentId>` design, with D-14's ceiling. **The `hooks.ts:70` line-number pointer is dropped for the symbol**, per `SECURITY.md:31-32`'s own rule about how this document went wrong the first time. |
| `.planning/codebase/INTEGRATIONS.md:116` | "every spawned agent" (one value) | per-agent, minted per-spawn, identity derived rather than trusted |

All three say plainly that the qwen proxy sidecar does **not** yet carry a token — because it does
not, and writing otherwise would be the same false self-claim the phase exists to remove.

**Pinned** by a new test beside the existing source-grep test in `test/net-binding.test.cjs`,
asserting all four stale phrasings are absent from the three files AND that each says `per-spawn`,
so a deletion is not mistaken for a replacement. Proved able to fail:

```
RED   not ok 18 - no document this plan owns still describes ONE floor-wide hook secret
      "HIVE.md still describes the floor-wide hook secret (/injected into agent child environments only/)…"
      # pass 18 / # fail 1
GREEN # tests 19 / # pass 19 / # fail 0
```

| Criterion | Baseline | Required | Measured |
|---|---|---|---|
| `grep -c "injected into agent child environments only" HIVE.md` | 1 | 0 | **0** |
| `grep -c "minted once at module load" …/ARCHITECTURE.md` | 1 | 0 | **0** |
| `grep -c "per-process .sock_token" …/ARCHITECTURE.md` | 1 | 0 | **0** |
| `grep -c "hooks.ts:70" …/ARCHITECTURE.md` | 1 | 0 | **0** |
| `grep -n "HIVE_SOCK_TOKEN" …/INTEGRATIONS.md \| grep -c "per-agent"` | 0 | 1 | **1** |
| `grep -c "per-agent" HIVE.md` | 1 | ≥2 | **2** |
| `grep -c "per-agent" …/ARCHITECTURE.md` | 1 | ≥2 | **2** |
| `grep -c "per-spawn"` HIVE / ARCH / INTEG | 0 / 0 / 0 | ≥1 each | **1 / 1 / 1** |
| `SECURITY.md` in `git diff --name-only` | — | absent | **absent** |
| `grep -c "SECURITY.md" test/net-binding.test.cjs` | 0 | 0 | **0** |
| `npm run check:links` | — | green | **`✓ release links consistent at v0.4.4`, exit 0** |

---

## Verification

### Full suite, three platforms, from PR #77 (`e6ed5f0`)

Both workflows are `branches: [main]` only, so a phase-branch push triggers nothing — this resolves
against the draft PR plan 01 opened, exactly as the plan requires. Counters pulled from the job logs,
not from the green tick:

| Check | Result | tests / pass / fail / skipped |
|---|---|---|
| `Typecheck` | **pass** (40s) | — |
| `Test (ubuntu-latest)` | **pass** (1m0s) | **433 / 433 / 0 / 0** |
| `Test (macos-latest)` | **pass** (35s) | **433 / 433 / 0 / 0** |
| `Test (windows-latest)` | **pass** (1m10s) | **433 / 429 / 0 / 4** |
| `Electron smoke (ubuntu-latest)` | **pass** (1m39s) | — |
| `Build` | **pass** (1m2s) | — |

`https://github.com/MARKXAILABS/hello-markx/actions/runs/32435745740`

Baseline before this plan was 426 / 422 / 0 / 4. This plan adds **+7 tests, all passing**. The
Windows `# skipped 4` is the pre-existing platform-conditional set (including the roundtrip file's
two `{ skip: !POSIX }` tests); **both POSIX runners report `# skipped 0`**, which is the proof that
the round-trip repair and the POSIX-shaped gate cases actually executed rather than being skipped
into a green.

Local: `npm run typecheck` exit 0; `npm test` win32 433 / 429 / 0 / 4; `npm run check:links` green.

### Operator sanity — run for real, not asserted

The plan asks for a manual check: spawn two agents, `echo $HIVE_SOCK_TOKEN` in each, confirm they
differ. Rather than assert it, it was executed against the **real `PtyManager` wired to the real
`HookServer`**, with two live node-pty PTYs printing what their own shell can read from their own
environment:

```
agent-a HIVE_SOCK_TOKEN = a5d630b9f20d7a4b92b5e33396b118e9ff9d03c71a8bc1a7f3a8b9d9493ed800
agent-b HIVE_SOCK_TOKEN = fcd52d1f7683c9f3047404daa5d8710a84eed07f38892f773221e03a8fbc18e5
differ                                    : true
while A was alive, its token resolved to  : agent-a
while B was alive, its token resolved to  : agent-b
...and A's token was NOT in B's live map  : true   (A had already exited)
live tokens after both PTYs exited        : 0      (revoked on exit)
```

**What this covers:** the real mint→env→PTY→revoke lifecycle, two real child processes, real
revocation on a real node-pty exit. **What it does not cover, stated rather than implied:** it does
not launch the Electron app, so it exercises no renderer, no window, and no real engine CLI. The
qwen manual sanity check (avatar moves, cost rows land) was **not** run — and its expected result
today is the dead-hooked symptom, because the `hive.ts` handoff has not landed. See below.

---

## SHIM TOKEN COVERAGE

```
$ for t in HOOK_SHIM AGY_HOOK_SHIM PI_EXTENSION OPENCODE_PLUGIN PROXY_BRIDGE_SHIM GROK_HOOK_SHIM; do
    sed -n "/^const $t = \`/,/^\`;/p" src/main/hive.ts | grep -c "HIVE_SOCK_TOKEN"; done
1 1 0 0 0 1
```

Unchanged by this plan, because `hive.ts` is plan 03's file this wave.

**`PI_EXTENSION`, `OPENCODE_PLUGIN` and `PROXY_BRIDGE_SHIM` build their payloads with no
`sock_token` field at all, and all three reach `authorized()`** through the single connection
handler — `if (!agentId) { conn.end('{}'); return; }` is the only door into `handle()`. "Fire and
forget" describes only that they ignore the response, not a different code path.

**So pi, opencode and the qwen sidecar were already dead-hooked at HEAD, before this plan changed
anything.** That is a live pre-existing defect this phase inherits, not one GATE-01 introduced. Plan
06 task 4 must take this table to `1 1 1 1 1 1`; plan 23 needs this starting state to tell a
pre-existing defect from one this phase caused.

---

## Cross-plan surfaces — named, not assumed

**1. `src/main/hive.ts` `startProxyBridge` — owner: `01-06-PLAN.md` task 4, wave 3.**

```
$ sed -n '/private startProxyBridge/,/^  }$/p' src/main/hive.ts | grep -c "HIVE_SOCK_TOKEN"
0
```

Expected `0` here. `hive.ts` is plan 03's file in this wave, and the edit references the mint this
plan creates in the same wave, so whichever landed first would leave the tree failing `typecheck`.

**QWEN SIDECAR DEAD-HOOKED UNTIL 01-06.**

The window, stated rather than hidden: from this plan's deletion of the floor-wide assignment until
plan 06 task 4 lands, every qwen/crush agent posts `sock_token: ''` and is dead-hooked — no live
status, no Stop→drain, no cost rows. One wave, inside one phase, and the deliberate choice: the
alternative is keeping the floor-wide secret alive through wave 3, which is the exact vulnerability
GATE-01 exists to remove. A dead hook is inert and visible; a live floor-wide secret is exploitable.

Note for plan 06: the env change alone is a **no-op**. Adding `HIVE_SOCK_TOKEN` to
`startProxyBridge`'s env literal without also adding the `sock_token` field to `emit()`
(`hive.ts:3307-3313`) makes the sidecar read a variable it never sends. The env change and the shim
body change are ONE fix. The same applies to `PI_EXTENSION`'s `post()` (`:3210-3217`) and
`OPENCODE_PLUGIN`'s `post()` (`:3247-3254`).

**Also handed to plan 06 task 4 (the wave-3 `hive.ts` owner):** pass `--no-verify` on the hive's own
commit path. `gitAsync` (`hive.ts:2626-2640`) spawns `git` with no `--no-verify` and no `env`, so it
inherits main's environment — which is what makes `<hive>/.git/hooks/pre-commit` arbitrary execution
as a child of main. This plan gates writes to that directory but cannot make the one-flag change,
because it may not edit `hive.ts`.

**2. `SECURITY.md:34-39` — owner: `01-04-PLAN.md`, wave 2 (this same wave).**

```
$ grep -c "process-local token" SECURITY.md
1
```

Still `1` — correct, untouched, and this plan's doc-pin test deliberately does not name the file at
all (comments included), so plan 04 can land it without a cross-plan deadlock. Between the two plans
all four documents are covered.

**3. `HIVE.md` — owner: `01-07-PLAN.md`, wave 3.** This plan edited **§5's hook-socket paragraph
only** (`:191-194`, 4 lines → 8). No other paragraph in that file was touched, moved or renumbered.
**Plan 07 must not undo this edit** when it lands the stale Stop-drain denials.

---

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking] `test/hive-roster-injection.test.cjs` calls `handle()` directly**

- **Found during:** Task 2.
- **Issue:** `:50` builds `server.handle({ agent_id, hook_event_name, session_id })`, reading the
  agent id off the payload — the exact shape this plan removes. After `handle(p, agentId)`, all four
  of its tests failed (`LIVE ROSTER` never injected, because `agentId` was `undefined`).
- **Root cause, not symptom:** the fixture modelled the pre-GATE-01 call. The fix is to model the
  new one — hand `handle()` the derived id, as the socket now does — not to keep reading it off the
  payload.
- **Fix:** one line, plus a comment saying why.
- **Ownership checked:** `grep -rln "hive-roster-injection" .planning/phases/01-finish-the-floor/`
  returns nothing — no plan in this phase declares this file, so there is no competing writer.
- **Files modified:** `test/hive-roster-injection.test.cjs`. **Commit:** `7642274`.
- **Verified:** 4 tests / 4 pass / 0 fail.

**2. [Rule 3 — Blocking] No POSIX runner existed for a POSIX-only proof**

- **Found during:** Task 3.
- **Issue:** the plan requires the repaired round-trip test to be shown RED-then-GREEN **on a POSIX
  host**, because its two round-trip tests carry `{ skip: !POSIX }` and the Windows run therefore
  cannot demonstrate the repair. Cases 3, 5, 8 and the watchdog are POSIX-shaped for the same reason.
  This machine is win32; WSL2 (Kali) was present but had no Linux Node.
- **Fix:** installed portable Node 22.23.2 (linux-x64) into WSL at `~/nodedist/`, matching CI's
  pairing. Every POSIX RED and GREEN in this SUMMARY was produced there.
- **Honest limit, recorded:** the WSL runner shares `node_modules` with Windows, so the 5 test files
  that load `src/main/pty.ts` transitively cannot run there — `node-pty`'s native module is a
  Windows build (`Cannot find module './prebuilds/linux-x64//pty.node'`). This is the same reason
  PROJECT.md records for rejecting git-worktree isolation. Those 5 files were checked individually
  and every failure is that identical error. **The authoritative POSIX verdict is CI's ubuntu and
  macOS jobs — 433/433/0/0 each — not the WSL run.**
- **Files modified:** none in the repo.

### Deliberate departures from the plan text

**3. Mint at `PtyManager`, not at each `index.ts` call site.**
The plan says "at every PTY spawn site from task 1's inventory, mint a token … and put it in that
spawn's `opts.env`", and that `pty.ts` should only be touched "if the inventory shows a spawn path
that does not thread `opts.env` through". Both `index.ts` call sites do thread it, so the literal
reading is a per-call-site edit. **Taken instead: the root-cause placement** — `pty.ts:664` is the
one place every agent PTY is actually created, both call sites route through it, and it already owns
the session teardown where the matching revoke belongs. A per-call-site mint means the next spawn
site added silently gets no token, which is precisely the failure mode the plan itself names ("a
missed spawn site is a silently dead-hooked engine"). Injected as callbacks
(`setHookTokenSource`), so `pty.ts` keeps no dependency on `hooks.ts`. The env spread itself is
unchanged, as instructed; the token is appended after `...(opts.env ?? {})` so nothing can shadow it.

**4. Revoke token-exact on PTY exit; `revokeAgent` kept for teardown.**
D-11 says "the same Map handles revocation on PTY exit" and task 3 requires `revokeAgent('A')` to
work. Revoking *by agent* at PTY exit is racy: a restart is `kill()+spawn()` under the same id, and
the dying PTY's exit can land after the replacement has already minted — which would dead-hook the
live agent. So exit uses `revokeToken(token)` (exact) and `revokeAgent(agentId)` exists for a
teardown where no replacement is coming. Both are on one Map; the reason is in the code comment.

**5. Task 2's "net-binding exit 0" criterion is only satisfiable after task 3.**
Task 2 deletes `hookSockToken()`, which `test/net-binding.test.cjs:139/140/166` calls — so the file
is red by construction between the two commits, and task 3 is the task that exists to repair it. The
criterion is met at `d541ca2`, not at `7642274`. Recorded rather than papered over: commit `7642274`
alone leaves that one test file red, and no commit in this plan is pushed in that state — the branch
was pushed once, at `e6ed5f0`, with all six CI jobs green.

**6. GATE-01 is deliberately NOT marked complete.**
The plan's frontmatter carries `requirements: [GATE-01]`, but its own task-2 criterion and its
`<output>` section both state that GATE-01 is not complete at the end of this plan and that this
SUMMARY must not say it is. `requirements.mark-complete GATE-01` was therefore **not** run. Plan 06
lands the sidecar edit; plan 23 asserts it whole in wave 9.

### Authentication gates

None.

---

## Threat register — disposition against what shipped

| Threat | Disposition | Status here |
|---|---|---|
| T-P02-01 spoofing via `payload.agent_id` | mitigate | **Done** — derived server-side, field discarded |
| T-P02-02 floor-wide secret spread by `pty.ts` | mitigate | **Done** — assignment deleted, pinned by a source test over all of `src/main/` |
| T-P02-03 qwen sidecar | mitigate | **Open — 01-06 task 4, wave 3.** Window recorded above |
| T-P02-04 timing attack on the compare | mitigate | **Done differently** — there is no compare; a `Map.get` lookup replaced it, and the no-`.length` preservation criterion still holds at 0 |
| T-P02-05 overclaiming in docs/UI | mitigate | **Done** for the three docs this plan owns; `SECURITY.md` is plan 04's |
| T-P02-06 ledger/session poisoning | mitigate | **Done** — same gate |
| T-P02-07 non-descendant local attacker | accept | Unchanged; D-15's reasons are now in the `hooks.ts` header |
| T-P02-08 replay | accept | Unchanged; reasons in the header |
| T-P02-09 the shared shim | mitigate | **Done** — gated with realpath + `$HIVE_ROOT` expansion, proved by 9 real-socket cases |
| T-P02-10 stale docs | mitigate | **Done** for three of four |
| T-P02-11 engines with no PreToolUse hook | accept | Named in the header. **Not restated without its qualifier anywhere in this SUMMARY** |
| T-P02-12 socket deletion = floor-wide fail-open | mitigate | **Done** — gate + watchdog; the shim-side residual is stated in the header, not implied away |
| T-P02-13 socket rebind (MITM) | mitigate | **Done** — a rebind requires the delete first (`EADDRINUSE`), so both layers cover it; the inode check detects a replaced socket. Residual: re-taking is a race we can lose, which the code says out loud |

## Threat Flags

None. No file in this plan introduces a network endpoint, auth path or schema change not already in
the threat register.

## Known Stubs

None.

---

## must_haves — every truth, checked

1. **`env` in A's terminal yields nothing that authenticates as B** — ✅ live two-PTY run above: two
   different 64-hex tokens, each resolving only to its own agent.
2. **A's token + `agent_id: 'B'` surfaces as A or is dropped, never as B** — ✅ real-socket test,
   RED-proved.
3. **No floor-wide assignment survives anywhere in main, by recursive grep** — ✅
   `grep -rn "process.env.HIVE_SOCK_TOKEN *=" src/main/` prints nothing (baseline: exactly one hit at
   `index.ts:5534`). Also pinned by a test that walks every `.ts` in `src/main/`.
4. **Deleting the socket no longer disables the gate until restart; the shim residual is stated, not
   implied away** — ✅ watchdog, RED-proved with `connect ENOENT`; residual is in the header under
   "FAIL-OPEN AT THE SHIM, deliberately".
5. **A delete-and-rebind is denied at the gate and detected by the watchdog** — ✅ case 5 denies the
   delete (a rebind needs it first — `EADDRINUSE`), and the inode check detects a replaced socket and
   re-takes the path with a distinct, louder message.
6. **`test/hook-auth-roundtrip.test.cjs` asserts the POST-GATE-01 contract; green on correct code,
   not on a restored floor-wide token** — ✅ `grep -c hookSockToken` = 0; POSIX 3/3.
7. **The qwen sidecar fix is NAMED and handed to plan 06, the window recorded, GATE-01 not claimed
   complete** — ✅ above, with the literal string and the `0` count.
8. **A cannot write the shared shim dir, the hive `.git`, the socket or another agent's dir
   *through any engine whose tools route through the PreToolUse gate*; engines with no PreToolUse
   hook are T-P02-11, accepted and named** — ✅ nine cases; the qualifier is carried everywhere the
   claim appears, in the code header and in this SUMMARY.
9. **No document still describes one floor-wide secret: HIVE/ARCHITECTURE/INTEGRATIONS here,
   SECURITY.md by plan 04** — ✅ pinned; plan 04's status recorded with its grep output.
10. **The header states the ceiling narrowly — not secrecy, not "A cannot authenticate as B"** — ✅
    `hooks.ts:22-32`, naming the `/proc/<B-pid>/environ` defeat explicitly.

## Self-Check: PASSED

```
FOUND: src/main/hooks.ts          FOUND: test/net-binding.test.cjs
FOUND: src/main/index.ts          FOUND: test/hook-auth-roundtrip.test.cjs
FOUND: src/main/pty.ts            FOUND: test/hive-roster-injection.test.cjs
FOUND: HIVE.md                    FOUND: .planning/codebase/ARCHITECTURE.md
FOUND: .planning/codebase/INTEGRATIONS.md
FOUND: 7642274  FOUND: d541ca2  FOUND: e6ed5f0
```
