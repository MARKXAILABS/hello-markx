---
phase: 04-overnight-on-a-repo-that-matters
plan: 05
subsystem: agent-runtime-security
tags: [gate-02, env-allowlist, pty, spawn, least-privilege, stride]
requires:
  - src/main/shellEnv.ts
  - src/main/pty.ts
  - src/main/config.ts
provides:
  - allowFromEnv
  - ENV_ALLOW
  - ENV_ALLOW_PREFIX
  - SpawnOptions.envPassThrough
  - HiddenClaudeOptions.envPassThrough
  - HarnessConfig.envPassThrough
affects:
  - src/main/pty.ts
  - src/main/hiddenClaude.ts
  - src/main/memory.ts
  - src/main/index.ts
  - src/main/config.ts
tech-stack:
  added: []
  patterns:
    - "allowlist at a single choke point, applied to the BASE spread only"
    - "injected over imported: the operator list rides SpawnOptions, pty.ts never reads config"
    - "written ceiling list as a deliverable (hooks.ts house format), not documentation"
key-files:
  created:
    - test/pty-env-allowlist.test.cjs
    - test/pty-spawn-env.test.cjs
  modified:
    - src/main/shellEnv.ts
    - src/main/pty.ts
    - src/main/hiddenClaude.ts
    - src/main/memory.ts
    - src/main/config.ts
    - src/main/index.ts
decisions:
  - "D-11 honoured: allowlist applied at all three `...process.env` spawn sites in the plan's owned files"
  - "D-13 escape hatch is ASSIGNED in main, never defaulted from renderer-supplied opts — `pty:spawn` takes its options off the IPC"
  - "D-34 ceiling shipped as items (a)-(j); (j) is new and names two spawn sites this plan's line ranges do not own"
  - "D-12's live smoke: run, and its non-Claude clause is BLOCKED by a control-proven environment fault, recorded UNVERIFIED rather than flattered"
metrics:
  duration: ~85 min
  completed: 2026-08-25
  tests_before: "843 total / 836 pass / 0 fail / 7 skipped"
  tests_after: "857 total / 850 pass / 0 fail / 7 skipped"
---

# Phase 4 Plan 05: GATE-02 — Bound the Blast Radius of Every Agent Shell

An allowlist filter (`allowFromEnv`) replaces the bare `...process.env` spread at all three
child-spawn sites in `src/main/`, cutting a real agent's inherited environment from **120 names to
33** — proven against a real OS-delivered environment and inside a live authenticated agent's own
terminal, not only against a stub.

## What shipped

| Artifact | What it is |
|---|---|
| `src/main/shellEnv.ts` | `allowFromEnv(env, extraPassThrough)`, `ENV_ALLOW` (37 exact names, stored upper-cased), `ENV_ALLOW_PREFIX` (`LC_`, `HIVE_`), and a **ten-item ceiling list** in `hooks.ts:801-859`'s house format with five named owners |
| `src/main/pty.ts:754` | the base spread becomes `...allowFromEnv(process.env, opts.envPassThrough ?? [])`; `SpawnOptions.envPassThrough` added |
| `src/main/hiddenClaude.ts:157` | the same one-line filter on the `--permission-mode bypassPermissions` session; `HiddenClaudeOptions.envPassThrough` added |
| `src/main/memory.ts:294` | the third site, filtered with an empty list by design |
| `src/main/config.ts` | `envPassThrough?: string[]`, default `[]`, config-file only |
| `src/main/index.ts:2016, :2361` | both `ptyManager.spawn(` sites carry the operator list |
| `test/pty-env-allowlist.test.cjs` | 9 cases over the pure filter, both directions |
| `test/pty-spawn-env.test.cjs` | 5 cases over the env each spawn site composes, with its ceiling in its own header |

## Commits

| Task | Gate | Commit | What |
|---|---|---|---|
| 1 | RED | `397504d` | 9 cases, measured **9 tests / 0 pass / 9 fail** |
| 1 | GREEN | `b15ad24` | `allowFromEnv` + `ENV_ALLOW` + the ceiling — **9 / 9 / 0** |
| 2 | RED | `88077b5` | 5 cases, measured **5 tests / 1 pass / 4 fail** |
| 2 | GREEN | `0b283fb` | the splice at all three sites + the operator hatch — **14 / 14 / 0** across both files |

## The RED runs, and what the one passing RED case proves

Task 1 RED: `node --test test/pty-env-allowlist.test.cjs` → **tests 9 / pass 0 / fail 9**.

Task 2 RED: `node --test test/pty-spawn-env.test.cjs` → **tests 5 / pass 1 / fail 4**. *Which* case
passed is the finding, not an accident: the one green case was
`REGRESSION CHECK, NOT THE GATE: every post-spread layer is untouched`. It passed against the
completely unfiltered code, because `AGENT_ID`, `HIVE_ROOT`, `HIVE_SOCK_TOKEN` and `PATH` are all
layered in **after** the base spread. That is **T-04-ENV-07 demonstrated rather than asserted** — a
GATE-02 test whose positives are those four names proves nothing at all. The four cases that failed
carry the real lower bound (`HOME`/`USERPROFILE`, `TMP`/`TMPDIR`, a planted `HIVE_CANARY_KEEP`).

## The live smoke (task 3) — three halves, two green, one BLOCKED

The plan says a stub is not an OS and the automated half is not the evidence alone. Three separate
live measurements were run, all from this session.

### Half A — a real OS-delivered environment (the half the plan said the unit test cannot reach)

Harness: `C:\Users\Alienware\AppData\Local\Temp\gate02-os-half.cjs` — the **real** `PtyManager.spawn`
through **real node-pty / ConPTY**, no `nodePty.spawn` swap anywhere, spawning a real child that
writes its own `process.env` to a file (a file, because ConPTY hard-wraps and would shred a long
JSON line). Canaries planted in the parent so both directions are reachable.

```
parent process.env has 120 names before the filter

=== RUN 1 — default: no operator pass-through list ===
the child's REAL env, as delivered by the OS: 33 names
AGENT_ID ALLUSERSPROFILE APPDATA COLORTERM COMMONPROGRAMFILES COMSPEC FORCE_COLOR HIVE_CANARY_KEEP
HIVE_ROOT HIVE_SOCK_TOKEN HOME HOMEDRIVE HOMEPATH LANG LOCALAPPDATA NUMBER_OF_PROCESSORS OS PATH
PATHEXT PROCESSOR_ARCHITECTURE PROGRAMFILES PUBLIC ProgramData ProgramFiles(x86) SHELL SYSTEMDRIVE
SYSTEMROOT TEMP TERM TMP USERNAME USERPROFILE WINDIR

-- the POSITIVE lower bound (through the filter, no later layer) --
  USERPROFILE present : true  (== parent)
  TMP         present : true  (== parent)
  HIVE_CANARY_KEEP    : "planted-hive-name"

-- the NEGATIVE (planted in the parent, must not cross) --
  CANARY_DROP           : absent
  AWS_SECRET_ACCESS_KEY : absent
  GH_TOKEN              : absent
  ANTHROPIC_API_KEY     : absent
  NPM_TOKEN             : absent

-- REGRESSION CHECK, not the gate (all layered in AFTER the spread) --
  AGENT_ID              : "gate02-smoke"
  HIVE_ROOT             : "C:\\Users\\ALIENW~1\\AppData\\Local\\Temp\\fake-hive"
  HIVE_SOCK_TOKEN       : "live-sock-token"
  TERM                  : "xterm-256color"
  COLORTERM             : "truecolor"
  FORCE_COLOR           : "1"
  PATH                  : set, 2949 chars

=== RUN 2 — the operator re-admits exactly CANARY_DROP ===
the child's REAL env, as delivered by the OS: 34 names
  CANARY_DROP           : LEAKED "planted-operator-credential"   <- intended: the hatch works
  AWS_SECRET_ACCESS_KEY : absent                                 <- and admits ONLY the named name

=== VERDICT ===
parent names: 120 -> child names: 33
PASS — both directions hold against a REAL OS-delivered environment.
```

One piece of noise, recorded rather than hidden: `manager.kill()` printed
`Error: AttachConsole failed` from `node-pty/lib/conpty_console_list_agent.js`. That is node-pty's
console-enumeration helper failing when there is no attached Windows console; it happens after the
env was captured and does not touch it.

### Half B — a LIVE agent, authenticated, completing a real task under the filter

Harness: `C:\Users\Alienware\AppData\Local\Temp\gate02-claude-live.cjs`. A real `claude` CLI spawned
through the **real** `PtyManager` under the GATE-02 filter, authenticating against its real account,
running a real Bash tool call, and reporting the environment from inside its own terminal:

```
GATE02 KEEP=yes DROP=no HOME=yes AGENT=yes SOCK=yes AWS=no N=51
CARD-DONE
```

- `KEEP=yes`, `HOME=yes` — the through-the-filter positives, from inside a live agent.
- `DROP=no`, `AWS=no` — the planted operator credentials did not cross.
- `AGENT=yes`, `SOCK=yes` — the no-regression check; the agent's hive identity and hook token survive.
- `CARD-DONE` — the card completed, so the engine authenticated and finished a turn under the filter.
- `N=51` is a **grandchild** count (a `node` process the agent's Bash tool spawned): 33 inherited
  names plus the ~18 the agent CLI adds itself. That is ceiling item (d) made visible — grandchildren
  inherit what the agent has, and the agent's set is now bounded.

### Half C — D-13's "non-Claude engine" clause: **BLOCKED, UNVERIFIED**

**This is the plan's one unmet acceptance criterion and it is not marked passed.**

`04-RESEARCH.md` names codex as the only non-Claude engine installed. Re-measured this session:
codex **and gemini** are both installed (`grok`, `pi`, `opencode`, `crush`, `kimi`, `agy`, `qwen` are
absent). Both were run live through the real `PtyManager` under the filter. Both failed to
authenticate:

| Engine | Failure under the filter | Control (full unfiltered env, no PtyManager) |
|---|---|---|
| codex-cli 0.128.0 | `401 refresh_token_reused` — *"Your refresh token has already been used… Please log out and sign in again."* | **identical**: `401 refresh_token_reused` |
| gemini-cli | `IneligibleTierError: This client is no longer supported for Gemini Code Assist for individuals` (tier `free-tier`) | **identical** `IneligibleTierError` |

**Attribution is proven, not assumed.** Each failure reproduces byte-for-byte with the operator's
complete unfiltered environment and without `PtyManager` in the path, so neither is caused by
GATE-02. The plan's instruction for this case — *"if the codex agent fails to authenticate the
pass-through list is wrong (L-04); name the exact variable"* — **does not apply**: no variable is
missing. Nothing was added to `ENV_ALLOW` or to `envPassThrough` to make anything pass.

A second measurement makes L-04 structurally unreachable on this machine right now:
`GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`,
`ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are **all unset in the operator's environment**. There is no
shell-exported BYOK key for the filter to remove, from any engine.

**What the checkpoint could and could not fail on**, stated out loud as the plan requires: codex
authenticates from `~/.codex/auth.json` (confirmed present on disk), not from an environment
variable, so **this checkpoint's authentication half cannot fail for L-04's reason** and is a
regression check on the app rather than a test of the env filter. What it CAN fail on, and what the
evidence above therefore rests on, is the reachable pair — `CANARY_DROP`/`AWS_SECRET_ACCESS_KEY`
absent, and `HIVE_CANARY_KEEP` + `USERPROFILE` present — which halves A and B both assert.

**Outstanding operator obligation (do not read this plan as having discharged it):**

1. `codex login` (the stored refresh token is burned), then re-run
   `node C:\Users\Alienware\AppData\Local\Temp\gate02-codex-live.cjs` and confirm `CARD-DONE`.
2. The plan also required hiring the agent **in the running app**, assigning it a card, and seeing
   the card reach `done` with its mail delivered. That half was **not run**: it needs GUI
   interaction with the Electron app and this executor has no GUI-automation tool. It is not
   claimed, in any form, anywhere above.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 2 — missing security control] The operator escape hatch is ASSIGNED in main, not defaulted from caller opts**

- **Found during:** Task 2, wiring `index.ts:2361`.
- **Issue:** The plan specifies `envPassThrough: readConfig().envPassThrough ?? []`. At the normal
  spawn site the natural reading is `opts.envPassThrough ?? readConfig()…` — but `spawnAgentCore` is
  reached from the `pty:spawn` IPC handler, whose `opts` come **straight off the renderer**. A
  renderer that could name its own pass-through list would re-admit every credential GATE-02 just
  removed, at the exact choke point the gate exists to defend.
- **Fix:** `opts.envPassThrough = readConfig().envPassThrough ?? [];` — assignment, so a
  caller-supplied value is overwritten. The config file is the only authority.
- **Files:** `src/main/index.ts`. **Commit:** `0b283fb`.

**2. [Rule 2 — undersized ceiling] Two further `...process.env` spawn sites exist; added as ceiling item (j)**

- **Found during:** Task 2, auditing `grep -rn '\.\.\.process\.env' src/main/`.
- **Issue:** The plan's `truths` block asserts *"`...process.env` survives in NO spawn site in
  `src/main/`"*. That is **not true after this plan**, and was not true of the plan's own scope:
  `src/main/hive.ts:1360` (`startProxyBridge`, our first-party `.cjs` sidecar under
  `process.execPath`) and `src/main/index.ts:338` (`enableCodexRemoteForSpawn`, the
  `codex app-server daemon`) are two more. Round 3 found `hiddenClaude.ts` and `memory.ts`; a round 4
  would have found these.
- **Fix:** Neither was filtered. `hive.ts` is in no plan's `files_modified`, so editing it violates
  D-35; `index.ts:338` is outside this plan's owned two-spawn-opts-lines region and is a live-auth
  path this phase cannot smoke-test. Both are named in **ceiling item (j)** with disposition ACCEPT,
  owner *hive maintainer*, and the settling condition. D-34 says a gate's ceiling is part of the
  deliverable; silently leaving them out would have made the truth statement a false guarantee.
- **Files:** `src/main/shellEnv.ts`. **Commit:** `b15ad24`.

**3. [Rule 3 — blocking] `node_modules` absent in the worktree**

- **Fix:** A Windows directory junction to the main repo's `node_modules`
  (`mklink /J node_modules E:\munder-difflin\node_modules`). Filesystem only, gitignored, no
  `package.json` touched (D-36 respected).

### Acceptance criteria that could not be met as written

**`grep -o 'envPassThrough' src/main/index.ts | wc -l` returns `2`** — measured **`4`**, and the
criterion is arithmetically unsatisfiable rather than unmet. The plan mandates the literal shape
`envPassThrough: readConfig().envPassThrough ?? []` at both sites; that string contains the token
**twice**, so two correct sites necessarily produce four occurrences. The criterion's real intent
(R2-H10: *both* sites carry the list, not one) **is satisfied**, measured by symbol:

```
$ grep -n 'envPassThrough' src/main/index.ts
2016:          envPassThrough: readConfig().envPassThrough ?? [],
2361:  opts.envPassThrough = readConfig().envPassThrough ?? [];
$ grep -n 'ptyManager.spawn(' src/main/index.ts
2004:      const res = ptyManager.spawn(          <- install-ladder path, list at :2016
2362:  const res = ptyManager.spawn(opts, owner);  <- normal path, list at :2361
```

Both measured `ptyManager.spawn(` line numbers, as the plan requires them stated: **2004** and
**2362** (the plan predicted 2003 / 2349 at its HEAD; re-measured here, as D-35 instructs).

## The repo's own record of the problem, quoted as the plan asks

The plan cites `index.ts:4859`. Re-measured, the line has moved to **`src/main/index.ts:4898`**, and
reads:

> `// with `...process.env` and neither installs a hook, so losing it is a leak`

with `hiddenClaude.ts` and `memory.ts` named in the sentence above it. The problem has been written
down in this repo since Phase 1. What was missing was an owner, not a discovery.

## Verification

| Check | Result |
|---|---|
| `node --test test/pty-env-allowlist.test.cjs` | 9 / 9 pass / 0 fail |
| `node --test test/pty-spawn-env.test.cjs` | 5 / 5 pass / 0 fail |
| `npm test` (full suite) | **857 tests / 850 pass / 0 fail / 7 skipped** (baseline 843 / 836 / 0 / 7 — delta is exactly the 14 new cases, skipped unchanged) |
| `npm run typecheck` | exit 0, both projects |
| `npm run lint` | exit 0, `--max-warnings 0` |
| `grep -c 'allowFromEnv(process.env' src/main/pty.ts` | `1` |
| `grep -c '\.\.\.process\.env' src/main/{pty,hiddenClaude,memory}.ts` | `0` / `0` / `0`, each paired with `allowFromEnv(process.env` = `1` |
| `grep -c "from './config'" src/main/{pty,hiddenClaude}.ts` | `0` / `0` — the list is injected, never imported |
| `grep -c 'allowFromEnv' src/main/hiddenClaude.ts` | `3` (≥ 1: "no config import" cannot be satisfied by a file that also does no filtering) |
| `grep -oE "^\s*\*\s+\([a-i]\)" src/main/shellEnv.ts \| wc -l` | `9` (plus item (j)) — was `0` at HEAD |
| `grep -v '^\s*\*' src/main/shellEnv.ts \| grep -c 'toUpperCase'` | `2` — both sides of the comparison |
| `grep -v '^\s*\*' src/main/shellEnv.ts \| grep -ci 'config.json'` | `1` |
| `grep -c "from 'electron'" src/main/shellEnv.ts` | `0` |
| `git diff --stat src/main/reflect.ts` | empty — the caller needed no edit |
| `git diff --stat src/main/floor/boot.ts` | empty — nothing wired at the composition root |
| `git diff --stat test/pty-sanitize.test.cjs` | empty — it is a `sanitizePtyText` test and was not co-opted |
| `git diff src/main/pty.ts` | confined to the import line, one `SpawnOptions` field and the base spread; the locale block, `...opts.env`, `HIVE_SOCK_TOKEN` and both OTLP header layers are byte-identical and in the same order |
| Live: real OS-delivered env | 120 → 33 names, both directions, escape hatch verified |
| Live: an authenticated agent completing a card under the filter | `GATE02 KEEP=yes DROP=no HOME=yes AGENT=yes SOCK=yes AWS=no N=51 / CARD-DONE` |
| Live: **a NON-CLAUDE engine** authenticating (D-13) | **UNVERIFIED — BLOCKED.** Both installed non-Claude engines fail identically with and without the filter (control-proven). Operator action required. |
| Live: hire-in-app + card reaches `done` + mail delivered | **NOT RUN** — needs GUI automation this executor does not have. Not claimed. |

## Known Stubs

None. Every code path added is wired and exercised.

`HiddenClaudeOptions.envPassThrough` is declared and **unpopulated by any caller**, which is not a
stub but an accepted, documented ceiling: closing it means importing `./config` → `./db` →
`better-sqlite3` into a module graph that `test/memory-hygiene.test.cjs` loads before it injects its
sqlite fake. It is recorded in `shellEnv.ts` ceiling item (h) with the owner and the exact upgrade
path, and it is honoured by a test that drives the field explicitly and proves it works when set.

## Threat Flags

| Flag | File | Description |
|---|---|---|
| `threat_flag: unfiltered-spawn` | `src/main/hive.ts:1360` | `startProxyBridge` spawns the first-party proxy sidecar with a full `...process.env`. Not in any plan's `files_modified`; ceiling item (j), ACCEPT, owner: hive maintainer |
| `threat_flag: unfiltered-spawn` | `src/main/index.ts:338` | `enableCodexRemoteForSpawn` starts `codex app-server daemon` with a full `...process.env`. Outside this plan's owned region and a live-auth path this phase cannot smoke-test; ceiling item (j), ACCEPT, owner: hive maintainer |
| `threat_flag: renderer-supplied-security-config` | `src/main/index.ts:2361` | `pty:spawn` takes `SpawnOptions` off the renderer IPC. Mitigated here (main assigns `envPassThrough` rather than defaulting from `opts`), but the same shape applies to every other security-relevant field on that interface and is not audited by this plan |

## Self-Check

- `src/main/shellEnv.ts` — FOUND
- `src/main/pty.ts` — FOUND
- `src/main/hiddenClaude.ts` — FOUND
- `src/main/memory.ts` — FOUND
- `src/main/config.ts` — FOUND
- `src/main/index.ts` — FOUND
- `test/pty-env-allowlist.test.cjs` — FOUND
- `test/pty-spawn-env.test.cjs` — FOUND
- commit `397504d` — FOUND
- commit `b15ad24` — FOUND
- commit `88077b5` — FOUND
- commit `0b283fb` — FOUND

## Self-Check: PASSED

Every file and commit claimed above was verified present in this session. The two live checks that
were **not** run (a non-Claude engine authenticating; the in-app hire/card/mail loop) are recorded as
UNVERIFIED and BLOCKED with their exact blockers, not as passes.
