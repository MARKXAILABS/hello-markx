---
phase: 01-finish-the-floor
plan: 24
subsystem: security
tags: [hooks, gate-01, pretooluse, path-identity, dev-ino, unix-domain-socket, win32-paths, framing, dos]

requires:
  - phase: 01-finish-the-floor
    provides: "GATE-01's per-agent hook tokens and the PreToolUse protected-path gate (plans 01-04 / 01-23) that this plan puts a working perimeter around"
provides:
  - "PreToolUse protected-path containment decided by (dev, ino) IDENTITY instead of path strings, so a protected path is denied however it is spelled"
  - "relative PreToolUse targets framed against ABSOLUTE registry-vouched bases, deny-wins over payload.cwd"
  - "an explicit deny reason for the two shapes main cannot FRAME (drive-relative, rooted-relative) and the two it cannot IDENTIFY (dead ancestor chain, no stable file ids)"
  - "single-shot, byte-capped, idle-timed hook socket framing where every abnormal exit answers deny to a still-connected peer"
  - "a runner-counted skip for the win32 socket-watchdog case that used to report as a pass"
affects: [01-25, 01-26, 01-30, 01-31, GATE-02]

tech-stack:
  added: []
  patterns:
    - "compare filesystem IDENTITY (dev, ino via statSync { bigint: true }), never path spellings, at a deny-list boundary"
    - "climb to the nearest EXISTING ancestor, then walk up by identity; the un-created tail below an identified hive root is a four-literal name check"
    - "on this listener, every bound must deliver an explicit deny to a peer still connected to read it — closing, destroying or refusing a connection is a bypass"

key-files:
  created: []
  modified:
    - "src/main/hooks.ts"
    - "test/net-binding.test.cjs"

key-decisions:
  - "Compare (dev, ino) identity, not path spellings: 18 win32 spellings measured ALLOWED at HEAD in this session are all DENIED now, and the shipped fix contains no list of host names, prefixes or spellings"
  - "statSync uses { bigint: true }: 15 of 29 inodes sampled on this volume lose precision as a JS Number, so a Number ino fuses distinct files"
  - "The <hive>/bin hard-link scan is RECURSIVE, because <hive>/bin/runtime is on every agent PTY's PATH; crossing its 4096-entry bound DENIES"
  - "The un-created-tail rule names FOUR literals — bin, .git, agents and the socket basename — not three"
  - "driveRelative refuses both C:..\\x and rooted-relative \\x\\y, narrowed so s:foo:bar:g and the 22 bare / words in this repo's README stay allowed"
  - "vouchedBases denies on an empty registry set BEFORE payload.cwd is consulted, so one attacker-chosen JSON field cannot turn a deny into an allow"
  - "HOOK_CANDIDATE_MAX = 500 and HOOK_RESOLVE_BUDGET_MS = 250, both DENYING rather than truncating; measured worst case at the cap is 93 ms of in-function work"
  - "HOOK_LINE_MAX = 16 MiB and a 2000 ms idle timeout, both replying deny with conn.end; no server-level connection limit and no aggregate byte budget, because both are floor-wide ALLOWs"

patterns-established:
  - "Prohibition greps are regression guards, so the file they guard must not spell the prohibited token even in a comment explaining why it is prohibited"
  - "A capability-dependent test uses the runner's own skip (t.skip / test(name, { skip })), never a bare return, which node:test counts as a PASS"

requirements-completed: []   # GATE-01 is this plan's `requirements` entry and is NOT ticked — see "Requirement GATE-01 is deliberately NOT ticked" below

duration: 55min
completed: 2026-08-22
---

# Phase 01 Plan 24: PreToolUse Identity Gate + Fail-Closed Hook Framing Summary

**The PreToolUse protected-path gate now decides containment by `(dev, ino)` identity instead of path strings — 18 win32 spellings measured ALLOWED at HEAD in this session, plus a hard link into `bin/runtime`, a `subst` alias, a `net use` drive, a Volume GUID and a GLOBALROOT device path, are all DENIED — and every abnormal exit from the hook socket now answers an explicit deny to a peer still connected to read it.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-08-22T19:05+05:30
- **Completed:** 2026-08-22T20:00+05:30
- **Tasks:** 3 of 3
- **Files modified:** 2 (`src/main/hooks.ts`, `test/net-binding.test.cjs`) — 1521 insertions, 82 deletions

## Accomplishments

- **The spelling class is closed by one control.** `realResolve` + `within` (a JS `realpathSync` and a string containment test) are deleted. A candidate's ancestors are walked comparing `pathIdentity` — `statSync(p, { bigint: true })` reduced to `dev:ino` — against the cached identities of `<hive>/bin`, `<hive>/.git`, the socket, `<hive>/agents`, `<hive>/agents/<agentId>` and the hive root itself. The shipped source contains no host set, no prefix rewrite table and no spelling list.
- **Relative targets are framed by the agent, not by the Electron main process.** `vouchedBases` returns the `isAbsolute`-filtered registry cwd first and appends `payload.cwd` only to a non-empty set, so an empty registry set denies before the payload is consulted at all.
- **Every bound on the hook socket delivers a deny body.** Per-connection `done` flag, `buf` slice, `HOOK_LINE_MAX` (16 MiB), and a 2000 ms idle timeout with a real `'timeout'` listener — all closing with `conn.end(response)`.
- **GATE-01's own socket-watchdog case stops reporting a win32 non-run as a pass.**

## Task Commits

1. **Task 1: decide a target by (dev, ino) identity, framed and bounded** — `e8cdf04` (test, RED) → `6df288c` (feat, GREEN)
2. **Task 2: one payload handled once, every abnormal exit answers DENY** — `38404c0` (test, RED) → `196a4f6` (feat, GREEN)
3. **Task 3: stop laundering the win32 non-run as a pass** — `434e5fd` (test)
4. **Follow-on fixes inside this plan** — `ec7d6c6` (fix: deterministic inode-precision case), `4d83a47` (fix: keep the two prohibition literals out of the file they guard)

TDD gate sequence for tasks 1 and 2: `test(...)` then `feat(...)`, in that order, in the git log above. Task 3 is a test-only change and has no `feat` half.

## Files Created/Modified

- `src/main/hooks.ts` — `pathIdentity`, `win32Components`, `driveRelative`, `fold`, the four hoisted deny reasons, `HOOK_CANDIDATE_MAX`, `HOOK_RESOLVE_BUDGET_MS`, `HOOK_BIN_SCAN_MAX`, `HOOK_LINE_MAX` (exported), `HOOK_IDLE_MS`, `boundDeny`; `vouchedBases`, `hiveIdentities`, `candidateDenial`, `containment`, `ownerVerdict`, `rootTailVerdict`, `binEntryIdentities`; rewritten `protectedPathDenial`, `expandHiveVars` and `listenOn` connection handler. `realResolve` and `within` deleted.
- `test/net-binding.test.cjs` — `hookFloor` gains a `registry` stub plus `rootDir`/`agentCwd`/`agents` options; `decider`, `rawClient`, `tmpDir`, `homeHive`, `seedHive` helpers; 26 new top-level cases.

## Round-5 corrections — all four implemented

| id | correction | where it landed | pinned by |
|---|---|---|---|
| **C-1 (CRITICAL)** | the hard-link check must walk `<hive>/bin` **recursively** | `binEntryIdentities()` walks a stack, not one `readdir`; bound `HOOK_BIN_SCAN_MAX = 4096`, and crossing it returns `null` which the caller turns into `DENY_BIN_SCAN` — it never degrades to allow | `a HARD LINK to a file under <hive>/bin is denied — including one level down, in bin/runtime` |
| **C-2** | the un-created-tail rule needs a **fourth** literal | `rootTailVerdict` compares against `bin`, `.git`, `agents` **and** `ids.sockName` (`basename(sockPath())`, POSIX only) | the fresh-hive case asserts `hooks.sock, while it does not exist` on POSIX |
| **C-3** | the 31st spelling: rooted-relative `\bin\…` | `driveRelative` covers it as its second clause | `a target main cannot FRAME is denied for that reason` asserts `\bin\cth-hook.cjs` denies with a framing reason |
| **C-4** | `statSync` must use `{ bigint: true }` | `pathIdentity` stats with `{ bigint: true }`, compares `BigInt`, and uses `0n` for the unstable-id check | `the identity comparison keeps FULL inode precision` |

**C-1 measured end to end in this session.** Against HEAD's own `realResolve` + `within` (extracted from `git show 00e8194:src/main/hooks.ts` and run unmodified), a hard link into `<hive>/bin/runtime/node.cmd`:

```
HEAD realResolve+within, hard link into <hive>/bin/runtime -> ALLOWED
  nlink=2 ino(link)=21392098232331867 ino(real)=21392098232331867 dev=3222877229
```

That directory is appended to **every agent PTY's PATH** (`hive.ts` `runtimeBinDir()`, `pty.ts` `withHiveRuntimeFallback()`), so the link is arbitrary code execution in every agent. It is DENIED under the shipped recursive scan.

**C-4's evidence is honest about what it could and could not build.** The runtime half measured that the hazard is live here — `15/29 inodes sampled on this volume LOSE precision as a JS Number (e.g. 15762598698118583 -> 15762598698118584)`. The exploit half could **not** be built on demand: a behavioural false-identity needs two live files whose inodes are within one `ulp`, and this volume does not hand those out on request (an explicit search over 200 file pairs found none). So the guarantee is pinned where it is decided — an unconditional source assertion that the identity stat is `{ bigint: true }` and that the unstable-id check compares `0n` — plus a behavioural negative control that an ordinary `nlink > 1` file outside the hive is still ALLOWED.

## The re-attack, RE-RUN in this session

`test/net-binding.test.cjs`, win32, `DESKTOP-LO8BH39`, Node v24.13.0. Every spelling is a `Write` of `<hive>/bin/cth-hook.cjs`. "reachable" means Node's own `fs` can `existsSync` that spelling.

**Before (HEAD source, from the RED run):**

```
  DENIED  reachable plain absolute (control)
  DENIED  reachable forward slashes
  ALLOWED reachable long-path prefix \\?\
  ALLOWED reachable device path \\.\
  ALLOWED reachable admin share \\localhost
  ALLOWED reachable admin share \\LOCALHOST, lc drive
  ALLOWED reachable admin share \\127.0.0.1
  ALLOWED reachable admin share \\<hostname>
  ALLOWED reachable admin share \\<hostname-lc>
  ALLOWED reachable LP-UNC \\?\UNC
  ALLOWED reachable DEV-UNC \\.\UNC
  ALLOWED reachable LP-UNC + <hostname>
  ALLOWED reachable \\0--1.ipv6-literal.net
  ALLOWED reachable own address 100.99.217.4 (Tailscale)
  ALLOWED reachable own address 192.168.31.97 (Wi-Fi)
  ALLOWED reachable own address 172.28.64.1 (vEthernet (WSL (Hyper-V firewall)))
  ALLOWED   —       trailing dot
  ALLOWED   —       trailing dot, / spelled
  ALLOWED   —       trailing space
  DENIED    —       trailing dot on the LEAF
```

**After (shipped source):** all 20 rows read `DENIED`. The three own-address rows and the ipv6-literal row are derived from `os.networkInterfaces()` at runtime, not hard-coded — a hard-coded IP list in the test is the same defect one level down.

**Plus, each in its own runner-counted case, all DENIED after and ALLOWED before:**

| case | derived how | HEAD | after |
|---|---|---|---|
| 8.3 short name | `for %I in ("<path>") do @echo %~sI` → `…\MD-NET~1\bin\cth-hook.cjs` | ALLOWED | DENIED |
| `subst` drive alias | `subst Y: <root>` (torn down with `subst Y: /d`) | ALLOWED | DENIED |
| `net use` mapped drive | `net use T: \\localhost\C$` (torn down with `/delete /y`) | ALLOWED | DENIED |
| `\\?\Volume{GUID}\…` | `mountvol C: /L` → `\\?\Volume{5396649d-f2ea-49e0-8224-0ad5fa163cc0}` | ALLOWED | DENIED |
| `\\?\GLOBALROOT\Device\HarddiskVolumeN\…` | probed 1..8 for the one that resolves | ALLOWED | DENIED |
| **HARD LINK to `bin/cth-hook.cjs`** | `fs.linkSync`, no elevation | ALLOWED | DENIED |
| **HARD LINK to `bin/runtime/node.cmd`** | `fs.linkSync`, no elevation (C-1) | ALLOWED (measured above) | DENIED |
| ancestor junction | `mklink /J <tmp>\hop <hive>\bin`, existing **and** not-yet-created leaf | DENIED | DENIED |
| relative `../../bin/cth-hook.cjs` | agent cwd `<root>/agents/a-1` | ALLOWED | DENIED |
| `~/…` and `$HOME/…` | hive under the real home dir | ALLOWED | DENIED |
| drive-relative `C:../../bin/…` and `C:..\..\bin\…` | | ALLOWED | DENIED (framing) |
| rooted-relative `\bin\cth-hook.cjs` (C-3) | | ALLOWED | DENIED (framing) |
| fresh hive: `bin/`, `BIN/`, `bin./`, `.git/hooks/`, `agents/b-1/`, `\\localhost\C$\…`, `\\?\…` | `bin/`, `.git/`, `agents/` all absent | ALLOWED | DENIED |
| `\\nas.invalid\share\project\file.ts` | RFC 2606, so DNS fails in ms | ALLOWED | **DENIED — see the behaviour change below** |

The ancestor junction is the one row that was already DENIED at HEAD; it is kept because it is the Windows-reachable half of the leaf-symlink clause and it needs no resolver at all.

## Ordinary work is still ALLOWED — the negative controls

Every one of these passed **before** the change (against HEAD source) and **after**. A fix that silently converts an allow into a deny is the failure mode this plan exists to avoid.

| control | before | after |
|---|---|---|
| `npx tsc -p ../tsconfig.json` | allow | allow |
| `../node_modules/.bin/tsc --noEmit` | allow | allow |
| `{ file_path: '../shared/lib.ts' }` | allow | allow |
| `{ file_path: 'notes.md' }` | allow | allow |
| `{ file_path: '../packages/core/index.ts' }` | allow | allow |
| a 40-word chained build command | allow | allow |
| **the README heredoc** (`cat > README.md <<'EOF'` + 2612 shell words) | allow, **597 ms** | allow, **70–77 ms** |
| **`git add` of 120 distinct `src/file-N.ts`** | allow | allow |
| a new file inside `bin/` | deny | deny |
| `bin/a/b/c/new.ts` (deep, not yet created) | deny | deny |
| `<root>/bin-notes/x.ts` (prefix sibling) | allow | allow |
| `<tmp>/does-not-exist-yet.ts` | allow | allow |
| `<hive>/agents/a-1/…` (own dir) | allow | allow |
| `<hive>/agents/b-1/settings.json` | deny | deny |
| `sed -i 's:foo:bar:g' notes.txt` | allow | allow |
| `curl http://a/b -c:v 9:30 a:b` | allow | allow |
| `C:\abs\x` | allow | allow |
| god case: `cat notes.md` from the harness home | allow | allow |
| god case: `cat hive/agents/oscar/inbox/msg.json` | ALLOWED | **DENIED** (relative reach into another agent's tree; the absolute spelling was already denied) |
| `$HOMEPATH` / `$HOMEDRIVE` survive `$HOME` expansion | n/a (no `$HOME` entry existed) | asserted on the expansion OUTPUT, not the verdict |
| an ordinary hard link (`nlink > 1`) outside the hive | allow | allow |
| a 15 MiB `Write` just under `HOOK_LINE_MAX` | n/a | not denied |
| 24 simultaneous well-formed hook calls | allow ×24 | allow ×24 |
| all nine pre-existing cases in the `:250` test | unchanged | unchanged, unmodified |

## The one deliberate ALLOW → DENY behaviour change

**`\\nas.invalid\share\project\file.ts`, and every other candidate whose entire ancestor chain fails to `stat`, is now DENIED (T-P24-17).** It was ALLOWED at HEAD. Main cannot say what such a path names, and a gate that allows what it cannot identify has a spelling-shaped hole in it. On a local volume the branch is unreachable — the volume root always stats — so it fires for exactly two classes: an unmapped drive letter and an unreachable UNC host. The failure mode is a false deny, with a reason naming identification, on storage that could not have accepted the write anyway.

The god-case row above is the second, narrower behaviour change: an agent whose cwd is the harness home now has its **relative** reach into another agent's tree denied, exactly as the absolute spelling already was. That is the point of framing relative targets at all.

## The three prohibitions

All three measured **0 at HEAD** and **0 after**, in `src/main/hooks.ts`:

```
grep -c 'canonicalSpelling'      -> 0
grep -c 'maxConnections'         -> 0
grep -cE 'conn\.destroy\('       -> 0
grep -c 'agentForToken'          -> 0   (task 3's deleted half; not added)
```

They were **not** free. The first draft of the design-rule comment above the connection handler explained why Node's server-level connection limit and a `destroy()`-on-cap-cross are inadmissible here — and named both verbatim, which pushed the greps to `3` and `1`. Those greps are this plan's only automatic defence against the two mechanisms that made earlier revisions ship a fail-open on this exact listener, so a comment that disarms them is worse than no comment. `4d83a47` removes the two spellings, keeps the whole argument, and says in the comment why it does not spell them.

## Numbers, and the commands that produced them

**The framing bounds.**

- `HOOK_LINE_MAX = 16 MiB (16 777 216 bytes)`. Sized above what this app itself permits a tool to move: `src/main/fs.ts:113` allows a 2 MB text read (`MAX_READ_BYTES`) and `:142` a 10 MB binary read (`MAX_BINARY_READ_BYTES`), and a `Write` PreToolUse carries the file contents JSON-escaped. `slack.ts`'s 1 MB was deliberately not copied: at 1 MB the largest writes are exactly the ones the gate stops inspecting.
- **Idle timeout `HOOK_IDLE_MS = 2000 ms`, a 3000 ms margin under the shims' own 5 s self-timeout** (`setTimeout(() => process.exit(0), 5000)` in every shim). Measured: the idle deny arrives at ~2.0 s on a still-connected socket, asserted `< 5000 ms`.
- **The resident-byte arithmetic, published honestly.** The app models a floor whose roster prompt caps its own listing at 24 agents (`hive.ts` `rosterContext`), and there is **no enforced agent limit anywhere in the app**, so 24 is a modelled figure and not a ceiling. At 24 concurrent connections the worst case is `24 x 16 MiB = 402 653 184 bytes ≈ 384 MiB`, buffered **before authentication** (`buf += d.toString()` runs on every connection; `authorized()` only after a newline). `HOOK_LINE_MAX` is **not** the lever — its floor is set by the largest payload the app legitimately produces. What would reduce the product is to stop holding the payload as one JS string (a streaming framer that counts bytes and never accumulates), which is its own plan. Until then the number is T-P24-12, accepted with an owner.

**The resolution bounds.** Measured in this session through the real socket with the shipped code, one candidate per distinct parent directory so the memo never hits, median of three:

```
     1 distinct dir   ->  54 /  54 /  64 ms  (median  54)   <- transport + JSON baseline
   120 distinct dirs  ->  67 /  74 /  77 ms  (median  74)   <- the worst REAL observation
   200 distinct dirs  ->  88 /  91 /  94 ms  (median  91)
   500 distinct dirs  -> 140 / 147 / 158 ms  (median 147)   <- HOOK_CANDIDATE_MAX
   501 distinct candidates -> DENIED in 65 ms               <- the cap denies BEFORE resolving
```

Subtracting the 54 ms transport baseline gives the in-function cost the budget actually measures: **~20 ms at 120 candidates and ~93 ms at the 500 cap**, against the plan's predicted 24 ms and 114 ms. So:

- **`HOOK_CANDIDATE_MAX = 500`** — 4x headroom over the worst real observation (120), measured worst case 93 ms of blocking main-thread work, 54x under the shims' 5 s.
- **`HOOK_RESOLVE_BUDGET_MS = 250`** — ~2.7x headroom over the cap's own worst case, so the budget only fires when a single resolve is pathological. The constants are the plan's; the justification is re-derived from this session's numbers, which came in slightly *cheaper* than predicted.
- The `501` row is the one that matters for the cap's shape: the deny lands in 65 ms, i.e. at transport cost, because the count is taken **before** anything is resolved. Truncating instead of denying would have been fail-open with a free padding attack.

**The heredoc.** `cat > README.md <<'EOF'` with this repo's real README — 2612 shell words — decided in **597 ms at HEAD** and **70–77 ms after**, both measured in this session by the same test. That is the control that makes a candidate cap safe to add at all.

## Test counters

`test/net-binding.test.cjs` on **win32**, same session, same machine:

```
before   tests 19 · pass 19 · fail 0 · skipped 0
after    tests 45 · pass 43 · fail 0 · skipped 2

pass_after    = pass_before − 1 + N   where N = 25   ->  19 − 1 + 25 = 43
skipped_after =              1 + S    where S =  1   ->       1 +  1 =  2
```

- **The `−1` is the point of task 3**, not a regression: the win32 socket-watchdog case was a bare `return`, which `node:test` counts as a PASS. It is now the runner's own skip.
- **N = 25** new top-level cases that RUN on this platform. **S = 1**: the leaf-symlink case, because `fs.symlinkSync(..., 'file')` throws `EPERM` here without elevation or Developer Mode (the caught error is printed as the skip reason).
- Counters verified stable across three consecutive runs: `45 / 43 / 0 / 2` each time.

**Full suite**, same session, same machine, `node --test test/*.test.cjs`:

```
before   tests 535 · pass 531 · fail 0 · skipped 4
after    tests 561 · pass 555 · fail 0 · skipped 6
delta    +26 tests · +24 pass · 0 fail · +2 skipped
```

Zero failures before, zero after. The `+2` skipped are exactly this file's two; the four pre-existing skips are unchanged.

**Gates and lint, all executed in this session:**

```
npm run typecheck                                        exit 0
npx eslint . --max-warnings 0                            exit 0
node --test test/*.test.cjs                              exit 0
gsd-tools verify artifacts  01-24-PLAN.md   ->  all_passed: true    10 / 10   (0/10 at HEAD)
gsd-tools verify key-links  01-24-PLAN.md   ->  all_verified: true   4 /  4   (0/4  at HEAD)
```

## Which platform each group ran on, and what that leaves unpinned

- **Group B (the win32 spelling battery, 8.3, `subst`, `net use`, Volume GUID, GLOBALROOT, the junction) RAN on win32** and is a counted skip on POSIX.
- **The hard-link cases RAN on win32** and are cross-platform (`fs.linkSync` needs no elevation anywhere), so they also run on the Linux CI runner.
- **Group C (the LEAF symlink) SKIPPED on win32.** `fs.symlinkSync(..., 'file')` throws `EPERM` without elevation or Developer Mode on this host, and so does the `'dir'` form. **The leaf-dereference step (`realpathSync.native` on an `lstat`-confirmed symlink) is therefore UNPINNED on Windows and a reviewer must read the diff for it.** It runs on `ubuntu-latest` (`.github/workflows/ci.yml`), which is where the gate is real. Group B's **ancestor junction** case is the Windows-reachable half of the same clause and it passes with `statSync` alone — a symlinked ancestor needs no resolver, which is why the leaf is the only remaining use of one in this file.
- **The fail-closed case (`\\nas.invalid\…`) RAN on win32** and is a counted skip on POSIX, where the branch is unreachable because the volume root always stats.
- **The C-2 socket-basename case RUNS on POSIX** and is not exercised on win32, where `sockPath()` is a `\\.\pipe\` name with no filesystem entry.

## Accepted residuals

These are recorded here, by id, because plan 01-31's register sweep reads SUMMARYs — a residual recorded only in a source comment or only in the plan's threat table is invisible to it.

### T-P24-12 — the NUMBER of concurrent hook connections is unbounded
**Owner: hive maintainer.**
Contained by `HOOK_LINE_MAX` + the idle timeout, which close the loop between them: a peer that stops sending is reaped with a deny, a peer that keeps sending crosses the byte cap and is denied. There is no third state, and that is pinned by a test that drives both halves from one case and asserts a *different* bound fired for each. **The arithmetic, honestly:** the product is `N x HOOK_LINE_MAX`, buffered **before** authentication, and at the 24-agent floor the app models that is **≈ 384 MiB**. `HOOK_LINE_MAX` is **not** a lever — its floor is set by the largest payload the app legitimately produces (`fs.ts`'s 10 MB binary read). A **userland** connection counter *is* admissible under this listener's own rule (it accepts, runs the handler, writes the deny and then closes); it is rejected on the narrower ground that it converts an attacker's socket count into a floor-wide DENY for every legitimate shim and its threshold has no calibrated value — not on the earlier generalisation that no connection bound is admissible, which was drawn from one fact about how Node enforces its own server-level limit and was wrong.

### T-P24-14 — one blocking syscall against storage that does not answer
**Owner: hive maintainer.**
An attacker-supplied unreachable UNC host, a dead `net use` letter, a disconnected removable volume. `HOOK_RESOLVE_BUDGET_MS` is checked **between** candidate resolutions and cannot interrupt the one call already in flight, so the true worst case is `budget + one resolve`. **This is pre-existing at HEAD** — a single absolute `file_path` of `Z:\x` does exactly this today with no plan applied — and this plan neither introduces nor multiplies it: with the per-payload memo, N candidates against the same dead host cost one blocking resolve and then a deny. Revision 4's non-local-UNC short circuit, which claimed to remove the UNC half, is deleted: it was the same enumeration this plan exists to remove, and round 4 measured it turning two device-namespace spellings into ALLOWs.

### T-P24-15 — the HARD LINK residual, NARROWED
**Owner: a follow-up plan holding `src/main/hooks.ts`.**
**What is closed:** a hard link to any file beneath `<hive>/bin`, **recursively** — including `<hive>/bin/runtime`, which is on every agent PTY's PATH and which a one-level `readdir` would have missed. Measured this session: ALLOWED at HEAD (with `dev`/`ino` literally equal and `nlink = 2`), DENIED after.
**What remains:** a hard link to a file under `<hive>/.git` (an object store of thousands of files) or under **another agent's tree** (unbounded), because identifying every file beneath them per payload is not a cost this gate can pay; and a **local non-admin SMB share** (`\\localhost\<sharename>\…`) whose host answers but whose backing directory main has no identity for, which is unchanged from HEAD.
The unqualified sentence *"no canonicalisation can ever close it"* is deleted from the ceiling comment and is not restored here.

### T-P24-16 — the framing rule's false positives
**Owner: hive maintainer.**
`driveRelative` denies two shapes main cannot frame, and its false-positive surface was measured rather than assumed. Not classified: `s:foo:bar:g`, `http://a/b`, `-c:v`, `9:30`, `a:b`, `./rel`, `../up`, `C:\abs\x`, and all 22 words in this repo's README that begin with a bare `/`. Classified, and therefore falsely denied: `x:1/2`, `D:pkg/file.ts`, and a bare rooted regex word such as `/^a$/`. A false deny is the right failure mode for a shape main cannot frame.

### T-P24-17 — a candidate main cannot IDENTIFY, and a volume with no stable file ids
**Owner: hive maintainer.**
**(i)** A candidate whose entire ancestor chain fails to `stat` DENIES. Unreachable on a local volume; it fires for an unmapped drive letter and an unreachable UNC host, and it is the `\\nas.invalid\…` ALLOW → DENY change stated above. **(ii)** A volume that reports `ino === 0` (exFAT, some network filesystems) has no identity to compare, so if the hive **root** itself has none, **every** candidate denies with a reason naming the volume rather than silently degrading to the string comparison in which all of this plan's measured bypasses live. That is an outage for that operator, it is loud, and it is the correct direction.

## Requirement GATE-01 is deliberately NOT ticked

This plan's `requirements` frontmatter names **GATE-01**, and `requirements-completed` is nonetheless
empty. That is not an oversight and `requirements mark-complete GATE-01` was deliberately not run.

GATE-01 has two clauses. `REQUIREMENTS.md`:

> An agent cannot post a hook payload claiming to be a **different** agent, **and the token that
> authenticates the socket is not readable from any agent's shell.**

This plan advanced neither clause. It closed the **protected-path perimeter around** GATE-01 — the gate
GATE-01's own hook socket enforces — which is what `01-VERIFICATION.md` gap SC-3 asked for. The second
clause remains false on Linux for the reason `src/main/hooks.ts`'s own header states in writing: agent
B's token lives in B's process environment, and a same-uid sibling reads `/proc/<B-pid>/environ`.
`REQUIREMENTS.md` already records that ceiling with an owner (**GATE-02, Phase 4**), and `01-23`'s
verdict counts GATE-01 among the 13 requirements that do **not** close.

Ticking it here would be a status flip against the project's own recorded evidence. The traceability row
stays `Pending`.

## Decisions Made

- **Rooted-relative (`\bin\x`) is DENIED rather than re-framed against each vouched base.** Re-framing would have had zero false positives and is arguably more correct, but C-3 mandates extending the framing predicate, and denying is the fail-closed direction. The false-positive surface was measured before committing to it: **0 of the 22 bare-`/` words in this repo's own README** are classified, because the rule additionally requires a *second* separator. The residual is named as T-P24-16 rather than argued away.
- **The path-shaped filter is applied only to Bash words, never to `file_path` / `path` / `notebook_path`.** Those keys are definitionally paths; filtering them would be a hole, and the measured cost model only ever concerned shell words.
- **`realResolve` and `within` were deleted rather than left in place.** Under identity neither is called, and an unused private helper in a security file is an invitation to re-wire the old comparison back in.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The two prohibition greps were non-zero in the shipped file**
- **Found during:** Task 2 (final verification sweep)
- **Issue:** The design-rule comment above the connection handler named `server.maxConnections` and `conn.destroy()` verbatim while explaining why both are inadmissible. That took `grep -c 'maxConnections'` to 3 and `grep -cE 'conn\.destroy\('` to 1, against a plan `<done>` predicate of **0** for both — disarming this plan's only automatic guard against the two mechanisms that made earlier revisions ship a fail-open on this listener.
- **Fix:** Rewrote the four affected comment lines to describe both mechanisms without their literal spellings, kept the entire argument, and added a clause saying why the file does not spell them.
- **Files modified:** `src/main/hooks.ts`
- **Verification:** `grep -c 'maxConnections'` → 0, `grep -cE 'conn\.destroy\('` → 0, `npm run typecheck` exit 0, `npx eslint . --max-warnings 0` exit 0, `node --test test/net-binding.test.cjs` → 45/43/0/2 unchanged.
- **Committed in:** `4d83a47`

**2. [Rule 1 - Bug] The inode-precision case was sampling-dependent, so the file's counters were not reproducible**
- **Found during:** Task 3 (full-suite run)
- **Issue:** The case gated its whole body on finding a Number-lossy inode among 16 freshly created files. NTFS does not guarantee that: an isolated run measured 9/16 lossy and the case RAN, the full-suite run measured 0/16 and the case SKIPPED. A file whose `skipped` counter changes between runs cannot support the counter arithmetic this plan is required to publish.
- **Fix:** The requirement — `pathIdentity` must stat with `{ bigint: true }` — does not depend on which inodes a run draws, so that half is now unconditional. The volume measurement is widened (24 fresh files plus five long-lived directory entries) and *reported* rather than used as a gate.
- **Files modified:** `test/net-binding.test.cjs`
- **Verification:** Three consecutive runs of `node --test test/net-binding.test.cjs` → `45 / 43 / 0 / 2` each time.
- **Committed in:** `ec7d6c6`

---

**Total deviations:** 2 auto-fixed (2 × Rule 1 — Bug).
**Impact on plan:** Both were defects in this plan's own output caught by its own gates before completion, not scope creep. No plan instruction was skipped, softened or substituted.

## Issues Encountered

- **C-4's behavioural exploit could not be constructed.** A false identity through `Number` rounding needs two live files whose inodes are within one `ulp`; a search over 200 file pairs on this volume found none, because NTFS file reference numbers carry a sequence number in the high bits and consecutive creations are not adjacent. Resolved by pinning the requirement where it is decided (an unconditional source assertion) plus a behavioural negative control, and by saying plainly in the SUMMARY that the exploit half is unbuilt rather than implying it was demonstrated.
- **Group C is unpinned on Windows.** `fs.symlinkSync` throws `EPERM` here in both the `'file'` and `'dir'` forms. Resolved by a runner-counted skip carrying the caught error as evidence, plus the ancestor-junction case as the Windows-reachable half — and by saying so in this SUMMARY rather than leaving a reviewer to infer it.

## Shared-file coordination with plan 01-25

`src/main/hooks.ts` is shared with **plan 01-25 (wave 2, `depends_on: 01-24`)**, which adds exactly one statement — the `SPAWN_SAFE_SESSION_ID` guard immediately above the existing `this.hive.recordSession(agentId, p.session_id)` call — and touches nothing else.

**This plan left that call site untouched.** `git diff 00e8194..HEAD -- src/main/hooks.ts | grep recordSession` returns nothing, and the call is live and unmodified inside `handle()` — `if (agentId && p.session_id) this.hive.recordSession(agentId, p.session_id);`, found by `grep -n 'this.hive.recordSession' src/main/hooks.ts` rather than by a line number, because this plan's own blast radius is exactly why a number written here would be stale. Everything this plan changed in the file is listed under **Files Created/Modified** above; none of it is in `handle()`'s session-recording path.

## Next Phase Readiness

- **GATE-01's protected-path perimeter is closed for the spelling and framing classes**, with the residuals named and owned above.
- **01-25 can open `src/main/hooks.ts` cleanly** — its one insertion point is untouched and its line number is stated.
- **01-31's register sweep can reach all five residuals** from the `## Accepted residuals` section above, by id and with an owner each.
- **A reviewer on Windows must read the diff for the leaf-symlink dereference step**, which is the one clause this platform cannot execute.

## Self-Check: PASSED

Every artefact and commit claimed above was verified to exist, in this session, by the command shown:

```
[ -f .planning/phases/01-finish-the-floor/01-24-SUMMARY.md ]   FOUND
[ -f src/main/hooks.ts ]                                       FOUND
[ -f test/net-binding.test.cjs ]                               FOUND
git log --oneline --all | grep <hash>   for e8cdf04 6df288c 38404c0 196a4f6 434e5fd ec7d6c6 4d83a47
                                                               FOUND x7
grep -cF  canonicalSpelling src/main/hooks.ts                  0
grep -cF  maxConnections    src/main/hooks.ts                  0
grep -cE 'conn\.destroy\('  src/main/hooks.ts                  0
grep -cF  agentForToken     src/main/hooks.ts                  0
```

One claim was **corrected** by this check rather than shipped: the shared-file section originally cited
`src/main/hooks.ts:1195` for the `recordSession` call, and the live line is 1196 — the comment above it
is 1195. The citation is now by symbol, which is the lesson this plan applied to the source's own stale
`hive.ts:1072` reference and should have applied to itself first.

No sentence in this SUMMARY says "VERIFIED" about a command that was not executed in this session, and
no sentence restores the retracted double-handle impact claim: the double-handle defect is stated as
**latent**, because all six shipped shims emit exactly one payload per connection.

---
*Phase: 01-finish-the-floor*
*Completed: 2026-08-22*
