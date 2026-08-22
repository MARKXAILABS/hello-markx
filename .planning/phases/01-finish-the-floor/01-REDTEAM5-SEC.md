# Round 5 — SECURITY lens — `01-24` and `01-26`

**Date**: 2026-08-22 · **Tree**: `E:\munder-difflin` @ `3c10fe1` · **Host**: `DESKTOP-LO8BH39`,
win32 10.0.26200, Node v24.13.0 · **POSIX arm**: WSL Ubuntu-24.04, ext4, Node v22.22.2
**Targets**: `01-24-PLAN.md` rev 5 (`3c10fe1`), `01-26-PLAN.md` rev 5 (`d8f5437`)
**Prior**: `01-REDTEAM4-SEC.md` (6 blockers)

## VERDICT

| plan | verdict | blockers | warnings |
|---|---|---|---|
| **01-24** | **NOT CLEAN** | 3 (B5-01 critical, B5-02, B5-03) | 5 |
| **01-26** | **NOT CLEAN** | 1 (B5-04) | 2 |

The mechanism replacements are **real and they work**. `(dev, ino)` closes the entire spelling class —
25 spellings measured, every one `dev` AND `ino` identical, every one ALLOWED at HEAD and DENIED under
identity, including SMB, the machine's own IP addresses, the Volume GUID and GLOBALROOT. Statement order
closes the greedy-append swallow — 38 rows, lost 0, newFP 0, gained 5, reproduced exactly. Neither of
those is where round 5 breaks.

Round 5 breaks in the **residue each replacement left behind**:

- 01-24 replaced an enumeration of *spellings* with identity, then re-introduced a **smaller enumeration**
  for the two cases identity cannot reach — the un-created tail (three literals: `bin`, `.git`, `agents`)
  and the hard-link `readdir` (one directory level). **Both enumerations are missing a member**, and both
  gaps are ALLOWs on live code-execution surfaces.
- 01-26's boundary closes `desk-`/`task-`/`risk-` and opens the identical shape for OpenAI keys that the
  plan's own evidence pins as must-not-lose for Anthropic keys.

---

## Harness

Faithful re-implementations of both prescribed shapes, run against real trees and real `git`. Nothing
inherited from a plan or a prior report. Source in
`%TEMP%\claude\e--munder-difflin\<session>\scratchpad\rt5\`:
`impl.cjs` (HEAD `realResolve`+`within` copied byte-for-byte from `src/main/hooks.ts:126/:143`, plus the
identity shape from 01-24 task 1), `battery.cjs`, `attack.cjs`, `alias.cjs`, `rooted.cjs`,
`fresh_cost.cjs`, `ino.cjs`, `posix.cjs` (WSL), `redact.cjs` (HEAD / SHIP / r4 / r4b / SHIP_IN3),
`battery26.cjs`, `replay2.cjs`, `hunt.cjs`, `gitattr.sh`.

**Teardown, verified**: `subst` → `(none)`; `net use` → `There are no entries in the list.`; junction
removed; `%TEMP%\probe-hive-rt5`, `rt5-attack`, `rt5-fresh`, `rt5-spray`, `rt5-ino`, `rt5-ino-hive`,
`rt5-gitattr` and WSL `/tmp/rt5-*` all deleted. No source file, plan file or test was modified; `git
status` is byte-identical to session start.

---

# 01-24

## What reproduces — verified, not assumed

### 1. The identity claim is TRUE at the syscall level

`statSync` returns **the same `dev` and the same `ino`** through every alias. This is the load-bearing
fact and it holds without exception on this host:

```
plain               dev=3222877229 ino=22517998137367376   <hive>\bin
forward slashes     dev=3222877229 ino=22517998137367376
8.3 short name      dev=3222877229 ino=22517998137367376   (PR305F~2)
\\?\C:\             dev=3222877229 ino=22517998137367376
\\.\C:\             dev=3222877229 ino=22517998137367376
\\localhost\C$      dev=3222877229 ino=22517998137367376   (6 ms)
\\LOCALHOST\c$      dev=3222877229 ino=22517998137367376
\\127.0.0.1\C$      dev=3222877229 ino=22517998137367376
\\DESKTOP-LO8BH39\C$ / \\desktop-lo8bh39\C$  identical
\\?\UNC\… · \\.\UNC\… · \\?\UNC\ + 8.3       identical
\\100.99.217.4\C$ (Tailscale)   identical      <- B4-01
\\192.168.31.97\C$ (Wi-Fi)      identical      <- B4-01
\\172.28.64.1\C$ (WSL vEth)     identical      <- B4-01
\\0--1.ipv6-literal.net\C$      identical      <- B4-01
\\?\Volume{5396649d-f2ea-49e0-8224-0ad5fa163cc0}\   identical   <- B4-04
\\?\GLOBALROOT\Device\HarddiskVolume3\              identical   <- B4-04
```

Critically, `dev` does **not** change across the SMB redirector, which is the one way this design could
have failed silently. It does not.

### 2. The battery: 27 rows, ALLOWED at HEAD, DENIED under identity

`node battery.cjs` — HEAD vs IDENTITY, same tree, same process:

```
01 plain absolute      HEAD=bin       ID=bin
02 forward slashes     HEAD=bin       ID=bin
03 8.3 short name      HEAD=ALLOWED   ID=bin          <- closed
04 long-path \\?\      HEAD=ALLOWED   ID=bin          <- closed
05 device \\.\         HEAD=ALLOWED   ID=bin          <- closed
06-10 admin shares (4 host/drive casings)  ALLOWED -> bin
11-14 LP-UNC / DEV-UNC / LP-UNC+8.3        ALLOWED -> bin
15-17 Tailscale / Wi-Fi / WSL vEthernet    ALLOWED -> bin
18-20 ipv6-literal, LP-UNC+LAN, DEV-UNC+ipv6lit  ALLOWED -> bin
21-23 trailing dot, its / twin, trailing space    ALLOWED -> bin
24 Volume GUID         HEAD=ALLOWED   ID=bin          <- closed
25 GLOBALROOT          HEAD=ALLOWED   ID=bin          <- closed
30/31 drive-relative   HEAD=ALLOWED   ID=cannot-frame <- closed
```

`subst`, `net use` and the ancestor junction, measured separately with teardown:

```
26  subst Y:\bin\cth-hook.cjs        HEAD=ALLOWED   ID=bin
26b subst, not-yet-created leaf      HEAD=ALLOWED   ID=bin
27  net use T:\…\bin\cth-hook.cjs    HEAD=ALLOWED   ID=bin
J1  junction hop\cth-hook.cjs        HEAD=bin       ID=bin
J2  junction hop\not-yet.cjs         HEAD=bin       ID=bin
```

Trailing dot/space: `statSync` throws ENOENT on all three spellings, so the plan's **component
normalisation is load-bearing, not decorative** — without it rows 21-23 take the climb and land on
`<hive>` with tail `['bin.', 'cth-hook.cjs']`, which the three-literal comparison does not match.

### 3. The hard link into `<hive>/bin` — CLOSED, exactly as claimed

```
A. hardlink -> bin/cth-hook.cjs   nlink=2  dev/ino equal=true
   HEAD=ALLOWED   IDENTITY=bin
```
Confirmed on ext4 too. Four revisions called this irreducible; it is not.

### 4. Ordinary work still passes

```
N1  new file in tmp        ALLOWED -> ALLOWED     N7  ordinary repo file   ALLOWED -> ALLOWED
N2  new file in bin        bin     -> bin         N8  bin-notes sibling    ALLOWED -> ALLOWED
N3  deep new in bin        bin     -> bin         N8b binary sibling       ALLOWED -> ALLOWED
N4  own agent dir          ALLOWED -> ALLOWED     N10 s:foo:bar:g          ALLOWED -> ALLOWED
N5  other agent            other   -> other       N13 notes.md             ALLOWED -> ALLOWED
N6  new other agent        other   -> other       N14 dist/main.js         ALLOWED -> ALLOWED
N16 http://a/b · N17 C:\abs\x · N18 ./rel   all ALLOWED -> ALLOWED
```
`../node_modules/.bin/tsc` and `../shared/lib.ts` are ALLOWED from an ordinary project base
(see W5-05 for the fixture hazard).

`driveRelative` classifier, measured: DENY on `C:../../bin/x`, `C:..\x`, `x:1/2`, `D:pkg/file.ts`;
not classified on `s:foo:bar:g`, `http://a/b`, `-c:v`, `9:30`, `a:b`, `sed`, `src/main/hooks.ts`,
`C:\abs\x`, `./rel`, `..\up`. The plan's two named residual false positives are the only two.

### 5. Fail-closed — real, cheap, and it does not touch local work

```
\\nas.invalid\share\project\file.ts   HEAD=ALLOWED  ID=unidentifiable   7 ms
Q:\work\x.ts  (unmapped letter)       HEAD=ALLOWED  ID=unidentifiable   2 ms
Q:\                                   HEAD=ALLOWED  ID=unidentifiable   1 ms
<hive>\src\new.ts                     HEAD=ALLOWED  ID=ALLOWED          1 ms
```
T-P24-17's claim holds: on a local drive the branch is unreachable, and the `.invalid` case costs
milliseconds rather than the 21 s a plausible NetBIOS name costs.

### 6. The fresh hive — all ten rows reproduce, on BOTH platforms

win32 (`bin/`, `.git/`, `agents/` absent):
```
bin/cth-hook.cjs  bin   ·  BIN/cth-hook.cjs  bin   ·  bin./cth-hook.cjs  bin
.git/hooks/pre-commit  git   ·  agents/b-1/settings.json  other-agent
\\localhost\C$\…\bin\cth-hook.cjs  bin   ·  \\?\…\bin\cth-hook.cjs  bin
agents/a-1/notes.md  allow  ·  binary/x.ts  allow  ·  README.md  allow
```
ext4 (WSL) reproduces every row. **The hive-root identity trick works.**

### 7. Cost — the recipe reproduces exactly, the absolute milliseconds do not

```
case                words  path-shaped  distinct-PS  dirs   HEAD ms   IDENTITY ms
heredoc README.md    2616      102          129        71     1467         41
git add 120 files     122      120          240         2       93         41
40-word build          33        2            4         4       23          1

  120 distinct dirs ->  39 /  42 /  49 ms  (median  42)
  200 distinct dirs ->  66 /  73 /  76 ms  (median  73)
  500 distinct dirs -> 179 / 187 / 188 ms  (median 187)   <- HOOK_CANDIDATE_MAX
 1000 distinct dirs -> 300 / 338 / 369 ms  (median 338)
```

`words=2616`, `path-shaped=102`, `dirs=71` match the plan **exactly** — the recipe is right. Absolute
times are uniformly ~1.6-2x the plan's on this run, for HEAD *and* IDENTITY alike, so it is machine
state and not a design error. The qualitative conclusions all hold: the heredoc goes 1467 → 41 ms, the
120-file `git add` 93 → 41 ms, and the cap's worst case is 27x under the shims' 5 s. **The identity walk
does not make the DoS worse than the resolver it replaced** — it is cheaper on every real row and only
~2x per candidate on the synthetic dir-spray, which is what the cap exists for. See W5-04 on the budget.

### 8. Group C — the leaf symlink

On ext4 the leaf symlink case is real and DENIES (`leaf.cjs -> <hive>/bin/cth-hook.cjs` → `bin`). On
win32 `symlinkSync` still throws EPERM without elevation, so the plan's runner-counted skip is correct.

---

## BLOCKERS

### B5-01 — CRITICAL — the hard-link closure enumerates ONE directory level, and `<hive>/bin/runtime/node` is a live code-execution surface below it

**The plan mandates shipping a false statement.** `<verification>` requires the SUMMARY to say
*"T-P24-15 — HARD LINK, NARROWED. The `<hive>/bin` half is CLOSED and must be reported as closed"*, and
the ceiling comment to name only `.git` and another agent's tree as the surviving hard-link residuals.
Task 1 step 4 spells out the mechanism: *"compare its identity against the identities of the entries
directly inside `<hive>/bin` (one `readdir`…)"*.

**`readdir` of `<hive>/bin` is not recursive, and `<hive>/bin` has a subdirectory.** Live source:

- `src/main/hive.ts:645` — `runtimeBinDir()` returns `join(root, 'bin', 'runtime')`
- `src/main/hive.ts:650-668` — `writeRuntimeShims()` writes `<hive>/bin/runtime/node.cmd` (win32) /
  `<hive>/bin/runtime/node` (POSIX, chmod 0755)
- `src/main/hive.ts:804` — `ensureHive` calls it **on every bootstrap**
- `src/main/pty.ts:22-29` — `withHiveRuntimeFallback` **appends that directory to every agent PTY's
  `PATH`**, called at `src/main/pty.ts:601`

So `<hive>/bin/runtime/node` is executed as `node` by any agent subprocess that shells out to node. It is
inside `bin/`, so a direct write is denied. A hard link is not.

**Measured, win32:**
```
A hardlink bin/cth-hook.cjs        HEAD=ALLOWED   IDENTITY=bin        (nlink=2, dev/ino equal)
B hardlink bin/runtime/node        HEAD=ALLOWED   IDENTITY=ALLOWED    (nlink=2, dev/ino equal)
D direct   bin/runtime/node.cmd    HEAD=bin       IDENTITY=bin
E new file bin/runtime/evil.cmd    HEAD=bin       IDENTITY=bin
```
**Measured, ext4 (WSL):** identical — `hardlink -> bin/runtime/node   HEAD=ALLOWED  ID=ALLOWED`.

**And the write lands:**
```
$ node land.cjs
real <hive>/bin/runtime/node.cmd now reads:
"@echo off\r\nREM PWNED - arbitrary code in every agent PATH\r\n"
```

Full chain, all agent-reachable, no elevation: `fs.linkSync('<hive>/bin/runtime/node.cmd', '<tmp>/x.cmd')`
(the gate never sees a link creation — it sees only the `Write` target), then one ALLOWED `Write` to
`<tmp>/x.cmd`. Every agent that runs `node` afterwards executes the attacker's file. That is the exact
harm `denyReason`'s own `bin` message describes: *"Writing it runs your code inside another agent's hook,
with that agent's environment and token."*

**Why this is the round-5 instance of the pattern.** Round 4 filed W4-04 because the ceiling's *"no
canonicalisation can ever close it"* read as unclosable. Revision 5 corrected it in the opposite
direction and overshot: it now asserts CLOSED for a directory it only inspects one level deep. A false
"closed" in an operator-facing ceiling is worse than a false "unclosable" — the operator stops looking.

**Fix (small, and the plan's own cost argument does not apply).** The reason `.git` and agent trees are
excluded is size — thousands of files, unbounded. `<hive>/bin` is 6 files plus one `runtime/` holding one
file. Walk it recursively (still bounded, still one lazy pass, still cached per payload), or state the
scope honestly as *"the entries directly inside `<hive>/bin`; a hard link to a file in `bin/runtime/` is
NOT closed and that directory is on every agent's PATH"*. Either is acceptable. Shipping "CLOSED" is not.

---

### B5-02 — HIGH — the socket deny branch flips DENY → ALLOW while the socket file is absent, which is the exact window the watchdog exists for

Task 1 step 5: *"Match against the hive ROOT → the un-created tail below it is now inside a directory
main has already identified, so compare its first component, case-folded, against the three literals
`bin`, `.git` and `agents`."*

**There are FOUR protected paths, and the literal list has three.** `sockPath()`
(`src/main/hive.ts:536-543`) returns `join(root, 'hooks.sock')` on POSIX — a direct child of the hive
root, whose basename is in none of the three literals. Identity covers it while the file exists; the
literal list is what has to cover it when it does not.

**Measured on ext4 (WSL Ubuntu-24.04), real `net.createServer().listen(sock)`:**
```
=== socket PRESENT (normal operation) ===
socket file exists: true
socket path, socket PRESENT     HEAD=SOCK   ID=SOCK

=== socket ABSENT (the watchdog window) ===
socket file exists: false
socket path, socket ABSENT      HEAD=SOCK   ID=ALLOWED     <<<< DENY -> ALLOW

=== fresh hive ===
fresh hooks.sock                HEAD=SOCK   ID=ALLOWED     <<<< DENY -> ALLOW
```

At HEAD this denies because `realResolve` climbs to the nearest existing ancestor and **re-joins the
un-created tail**, so `within(realResolve(sock), t)` is `rel === ''` → true. The identity walk has no
equivalent for a not-yet-existing socket.

**The window is real, documented, and 10 seconds long.** `src/main/hooks.ts:193`
`socketWatchdogMs = 10_000`; `checkSocket` (`:293-317`) logs
*"hook socket GONE … the PreToolUse gate was open for every agent on this floor until this re-listen"*
and, on the replaced branch, *"Re-taking is a race we can lose, so check the floor."* The gate on that
path is the only thing that stops an agent winning that race. An agent reaches the window without ever
naming the socket in a denied word — e.g. `find $HIVE_ROOT -name '*.sock' -delete`, whose every shell
word resolves outside the protected set — and then issues a `Write` that HEAD denies and revision 5
allows.

**Blast radius**: whoever binds that path collects every agent's `sock_token` and answers `allow` to the
whole floor — the threat `hooks.ts:263-276` and the `:319` watchdog test both exist for.

**Fix**: add the socket's `basename` to the un-created-tail comparison on POSIX (it is already in the
cached-identity set; it just needs to be in the literal list too), or compute the tail comparison from
the full relative path against the four protected paths rather than three hard-coded names.

---

### B5-03 — HIGH — the 31st spelling: a ROOTED-RELATIVE target (`\bin\…`) is unframeable, `isAbsolute` says otherwise, and it lands a real file in the real `bin/`

`driveRelative` refuses `C:..\…` because main cannot see the per-drive current directory. **The sibling
shape has the same defect and no rule.** `\probe-hive-rt5\bin\cth-hook.cjs` has no drive letter:
Windows frames it against the *writing process's* current drive; `path.win32.isAbsolute` returns `true`,
so the plan's `isAbsolute(target) → measure exactly that one path` branch fires and `path.resolve()`
frames it against **Electron main's** `process.cwd()` drive.

**Measured, with `subst` to put the hive on a non-main drive (torn down):**
```
main process.cwd() drive = C:    hive drive = Z:

rooted  \probe-hive-rt5\bin\cth-hook.cjs   isAbsolute=true  driveRelative=false
        resolve() = C:\probe-hive-rt5\bin\cth-hook.cjs
        HEAD=ALLOWED   IDENTITY=ALLOWED
rooted fwd /probe-hive-rt5/bin/cth-hook.cjs   same: ALLOWED / ALLOWED
control <D>:\probe-hive-rt5\bin\cth-hook.cjs  HEAD=bin  IDENTITY=bin

cmd.exe at the agent's own cwd (Z:\probe-hive-rt5\agents\a-1):
  echo <marker>> \probe-hive-rt5\bin\rooted-probe.txt
landed in the REAL <hive>/bin ?  true  "ROOTED-RELATIVE-LANDED-1787405235680"
```

**Precondition, stated plainly**: the hive must sit on a drive other than main's `process.cwd()` drive
(a second disk, a mapped drive, `subst`, a removable volume, an app launched from a different root). On a
single-drive host the gate and `cmd.exe` agree and the target denies correctly. That precondition is an
operator configuration, not an exotic one.

**Why it is a blocker and not a residual**: the plan states it unconditionally.
`must_haves.truths`: *"A protected path reaches the same deny branch its plain absolute spelling reaches
NO MATTER HOW IT IS SPELLED"*. `<success_criteria>`: *"**A protected path is DENIED however it is
spelled**"*. Both are falsified by a spelling that lands a file. The ceiling's residual list (a)-(h)
names the drive-relative-with-no-separator case (`C:cth-hook.cjs`) and does not name this one. Round 4
filed the drive-relative sibling as **CRITICAL B4-02** on exactly this reasoning.

**Fix**: extend `driveRelative` (or add a second predicate beside it) to refuse, on win32, a target that
begins with a separator and carries no drive — main cannot frame it either. One condition, same deny
reason, and the negative-control sweep already run in `<interfaces>` is unaffected (`./rel`, `..\up`,
`C:\abs\x`, `s:foo:bar:g`, `http://a/b` are all unchanged by it).

---

## WARNINGS — 01-24

### W5-01 — `pathIdentity`'s spec implies a Number `ino`, and NTFS file ids exceed `Number.MAX_SAFE_INTEGER`

Task 1: *"calls `statSync`, and returns a stable key built from `dev` and `ino` — or `null` when the stat
throws or when `ino` is `0`"*. An executor reads that as `const st = fs.statSync(p); if (st.ino === 0)`.
Default `statSync` returns `ino` as a **double**.

Measured on the live probe tree, in `%TEMP%` on this host's system volume:
```
<hive>/bin           ino = 22517998137367376     (> 2^53 = 9007199254740992)
<hive>/bin/cth-hook  ino = 23925373021321016
<hive>               ino = 27021597764737090
```
All three are above `Number.MAX_SAFE_INTEGER`; at that magnitude a double's ulp is 4, so the low two bits
of the NTFS MFT record number are not represented. A 4000-file sample showed 108 inos above the safe
integer bound and **0 collisions** there, so this is not currently firing — but the failure it invites is
a false identity match between MFT-adjacent objects with the same sequence number, and the fix is free:
`statSync(p, { bigint: true })` with `ino === 0n`.

Collisions are fail-CLOSED in this design (a spurious match can only add a deny), so this is a
correctness/outage hazard, not a bypass. Say `{ bigint: true }` in the task text.

### W5-02 — the POSIX owner comparison case-folds a name that POSIX does not

Task 1 step 5: *"compare its IDENTITY to `<hive>/agents/<agentId>` when it exists, and its NAME
(case-folded) when it does not"*. Measured on ext4:
```
agents/A-1/settings.json (dir absent)   HEAD=other-agent   ID=ALLOWED   <<<< DENY -> ALLOW
agents/b-1/settings.json                HEAD=other-agent   ID=other-agent
```
HEAD's `owner !== agentId` is case-SENSITIVE on POSIX (`within` folds only on win32). Narrow — it needs
an un-created directory whose name differs from the agent's only by case — but it is a second unnamed
deny→allow flip in a plan whose SUMMARY must declare *"the one deliberate allow-to-deny change"*.
Fold only on win32, or say so.

### W5-03 — on Linux every directory has `nlink > 1`, so the hard-link branch's cost narrowing is win32-only

The plan justifies the `readdir` by *"the check only runs for a leaf whose `nlink > 1`"*. Measured on
ext4: `nlink(/tmp/rt5-hive)=7`, `nlink(bin)=3`, `nlink(src)=2`, `nlink(/tmp)=11`, `nlink(/)=23` —
and the branch **fired for 200/200 ordinary directory candidates**. Harmless if the `bin` entry-id set is
computed once per payload (it must be — say so explicitly); a per-candidate `readdir` on the CI platform
otherwise. `.github/workflows/ci.yml` runs `ubuntu-latest`, so this is the platform the gate is measured
on.

### W5-04 — `HOOK_RESOLVE_BUDGET_MS = 250` has 1.34x headroom over the cap's worst case here, not the claimed ~2.2x

Re-measured at `HOOK_CANDIDATE_MAX = 500`: median **187 ms** (179 / 187 / 188), not 114 ms. The plan
already instructs *"If your own measurement disagrees with these, move the numbers and publish the
measurement"* — this is the note that it will. Ordinary work is unaffected (worst real observation, the
120-file `git add`, is 42 ms — 6x under budget), but the sentence *"the budget only ever fires when a
single resolve is pathologically slow, never on ordinary work"* should be re-derived rather than copied.

### W5-05 — the plan's own group-A fixture agent would fail the plan's own `../` negative control

Group A pins *"Agent `a-1` whose registry cwd is `<root>/agents/a-1`"*. Measured with exactly that base:
```
../node_modules/.bin/tsc   HEAD=ALLOWED   ID=other-agent   <<<< allow -> deny
../shared/lib.ts           HEAD=ALLOWED   ID=other-agent
../up                      HEAD=ALLOWED   ID=other-agent
```
`join('<hive>/agents/a-1', '../node_modules/.bin/tsc')` = `<hive>/agents/node_modules/…`, owner
`node_modules ≠ a-1`. This is the **exact defect revision 1 was rejected for**, arriving through the
registry base instead of the deleted synthetic one. Not a production defect — real agent cwds are
`config.harnessHome` (`src/renderer/src/hooks/useHive.ts:391/:431`) or an operator project dir, never
`<hive>/agents/<id>` — but the plan's negative controls say *"Agent whose registry cwd is an ordinary
project dir"* while group A says otherwise. **If the executor reuses one agent fixture for both, the
suite goes red and the executor will "fix" it by weakening the deny.** Say in the task that groups A and
the negative controls use two different agents.

### Not findings, recorded so the next round does not re-file them

- **TOCTOU** between the ancestor stat and the write (junction swapped in after the identity cache is
  populated) is inherent to any path-based gate and the window is identical at HEAD, which realpaths at
  the same moment. Identity does not make it worse.
- **`hop/../bin/x` through a POSIX symlinked ancestor** is ALLOWED at HEAD *and* under identity —
  `path.resolve()` collapses `..` lexically before either resolver sees it. Pre-existing, unchanged.
- **`ino === 0`** never occurred on this host for any spelling, local or SMB. The fail-closed branch is
  correct and unexercised here; it cannot be measured without an exFAT/no-stable-id volume.

---

# 01-26

## What reproduces — verified

### 1. The 38-row battery: SHIP loses NOTHING, and the two rejected shapes lose what the plan says

```
variant     lost  stricter   (38 rows: 15 SECRETS + 18 r2/r3 + 5 round-4)
SHIP           0         1     <- the swallow row, MORE redacted
R4             5         0     <- exactly the 5 the plan names
R4B            3         0     <- exactly the 3 the plan names
SHIP_IN3       1         0     <- my own control, see below
```

The two shapes round 4 broke:
```
"sk_live_AAAAAAAAAAsk-ant-BBBBBBBBBBBBBBBB"
  HEAD "sk_live_AAAAAAAAAA[redacted]"
  SHIP "[redacted][redacted]"                  <- claim confirmed
  R4   "[redacted]-ant-BBBBBBBBBBBBBBBB"       <- 20 bytes leaked, confirmed

"q=key%3Dsk-ant-api03-AAAABBBBCCCCDDDD"
  HEAD "q=key%3D[redacted]"
  SHIP "q=key%3D[redacted]"                    <- claim confirmed
  R4   "q=key%3Dsk-ant-api03-AAAABBBBCCCCDDDD" <- whole key leaked
```

**`SHIP_IN3` is the control the plan needed and did not run.** I built the variant that keeps
`sk-ant-` unbounded *and* appends the two underscore arms inside pattern 3's alternation — i.e. the
plan's prefix fix without its statement-order fix. It **still loses the swallow row**
(`"[redacted]-ant-BBBBBBBBBBBBBBBB"`). So the statement-order argument is not decoration: it is the only
thing that closes that class, and the plan's reasoning for it is correct.

Sensitivity (5 gained) and specificity all reproduce:
```
sk_live_ / sk_test_ / sk_proj_ / sk_ant_ / rk_live_   HEAD=plaintext   SHIP=[redacted]
'desk-team-lead': grid[6], 'desk-backend-engineer'    HEAD='de[redacted]'  SHIP=strictEqual input
'desk-project-manager': …'desk-market-researcher'     HEAD='de[redacted]'  SHIP=strictEqual input
<h2 id="the-task-kanban-work-as-a-board-not-a-chat-log"…>  HEAD='the-ta[redacted]'  SHIP=unchanged
risk-assessment-matrix-builder-v2 shipped             HEAD='ri[redacted]'  SHIP=unchanged
12 demonstrated FPs + 6 BENIGN: all unchanged under SHIP.   newFP = 0
```

### 2. Measurement B reproduces EXACTLY — and only with hive.ts's own `addedLines`

At the plan's stated commit, replaying `scrubStagedSecrets`' algorithm:
```
$ node replay2.cjs 0b3d631
tip = 0b3d631  commits = 400
HEAD   50/400 (12.5%)  paths=66
SHIP   48/400 (12.0%)  paths=65
newly unstaged under SHIP: []
rescued: ["docs/blog/command-center-guide/index.html"]
```
**Every figure matches the plan**, including the rescued path.

One implementation detail the plan should carry: `hive.ts:3187-3188`'s `addedLines` **keeps the leading
`+`** (it filters, it does not `slice(1)`). Stripping it — the natural thing to write — answers **67/66**
instead, which is the number the plan attributes to the `diff --git` extraction method. So the plan's
warning is right but its attribution is off by one cause. Reproducing 48/65 requires the `+` retained.

At current `HEAD` (`3c10fe1`) the same replay answers HEAD 53/400 (13.3%) / 67 paths and SHIP 50/400
(12.5%) / **65 paths** — the window moved by 6 commits. See W5-07.

### 3. The fifth ACTIVE bypass — verified end to end against real git

```
$ printf 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAA\n' > secret.txt && git add -A
  numstat:  1  0  secret.txt
  diff:     +++ b/secret.txt
            +sk-ant-api03-AAAAAAAAAAAAAAAAAAAA

$ printf '* -diff\n' > .gitattributes && git add -A
  numstat:  -  -  .gitattributes
            -  -  secret2.txt
  diff:     Binary files /dev/null and b/.gitattributes differ
            Binary files /dev/null and b/secret2.txt differ
```
Traced against `src/main/hive.ts:3197-3201`: `Number('-') || 0` → `changed = 0` → the
`SECRET_SCAN_MAX_LINES` branch never fires → **no `secret-scan-skipped` row**; `addedLines(text)` is `''`
→ `if (!all || …) return true` at `:3230` → commit proceeds, nothing scanned, **nothing logged**. Silent
and persistent, exactly as the plan states. Both size caps at least `console.warn` — this one does not.

HEAD's true clause is live at `src/main/hive.ts:3171-3172`:
*"Binary blobs produce no `+` lines and are never scanned."* It is the only sentence in the paragraph
documenting the family this bypass belongs to, and the plan is right that it must survive the rewrite.

---

## BLOCKER

### B5-04 — HIGH — the `\b` on the bare `sk-` arm loses OpenAI keys after a word character, including the plan's OWN evidence shape

`must_haves.truths[0]`: *"**NOT ONE** credential shape that `redactSecrets` redacts at HEAD stops being
redacted"*. Measured, that is false — **15 losses**, all of the same class:

```
=== LOSS HUNT: bare sk- key after a word character ===
in   "q=key%3Dsk-proj-abc123DEF456ghi789JKL012mno345"
HEAD "q=key%3D[redacted]"
SHIP "q=key%3Dsk-proj-abc123DEF456ghi789JKL012mno345"      <- whole key leaked

in   "q=key%3Dsk-A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6"          (OpenAI classic)
HEAD "q=key%3D[redacted]"        SHIP unchanged             <- whole key leaked

in   "q=key%3Dsk-svcacct-abc123DEF456ghi789JKL012"           (OpenAI service account)
HEAD "q=key%3D[redacted]"        SHIP unchanged             <- whole key leaked

… and the same three keys after \u003D, after a bare word char ("xsk-proj-…"),
  after "apikey", and after a hex run ("deadbeef…"):  15 rows total.

as a staged diff line:
"+curl \"https://api.example/v1?q=key%3Dsk-proj-abc123DEF456ghi789JKL012mno345\""
  HEAD "+curl \"https://api.example/v1?q=key%3D[redacted]\""
  SHIP unchanged — the scrub does not fire, the line reaches history
```

**The plan's own argument condemns it.** Task 2, change 1, on why `sk-ant-` must stay unbounded:

> *a boundary here is what loses `q=key%3Dsk-ant-…` (a URL-encoded `=` in a query string, a `curl` line,
> a log or a stack trace) and `xsk-ant-…` — both redacted at HEAD*

Every word of that applies verbatim to `q=key%3Dsk-proj-…`. The plan pins the Anthropic spelling as
REGRESSION rows 34 and 35 and never tests the OpenAI spelling of the same context — even though
`sk-proj-abc123DEF456ghi789JKL012mno345` is **`SECRETS[0]` in this repo's own fixture list**
(`test/voice-messages.test.cjs:179`), the first credential the suite claims to redact.

The 38-row battery cannot see this: its only word-char-prefixed `sk-` rows are `sk-ant-` shapes, which the
split arm keeps. `<measured_evidence>` D's *"pattern-3 spans that KEEP matching under [SHIP] … `sk-ant-…`
after any word char"* is an accurate list of what survives — and its silence about the bare arm is the
whole finding.

**This is round 5's instance of the pattern.** B4-05 returned revision 4 for a boundary that lost real
detections. Revision 5 narrowed the boundary to one arm and lost a smaller, more specific set — the
class the boundary was aimed at is `desk-`/`task-`/`risk-`, and the class it takes down with it is
OpenAI's entire key family in URL-encoded and concatenated contexts.

**Two acceptable resolutions; either clears this.**

1. **Narrow the predicate instead of using `\b`.** The measured false positives are `desk-`, `task-`,
   `risk-` — `sk-` preceded by a **lowercase letter**. `(?<![a-z])sk-[A-Za-z0-9_-]{16,}` keeps
   `%3Dsk-proj-…` (`D` is uppercase) and `deadbeefsk-…` is still lost, but `desk-`/`task-`/`risk-` all
   go. Re-run the 400-commit replay and the 481-file corpus against it before adopting — do not take my
   arithmetic on trust.
2. **Keep `\b` and DECLARE the trade.** Add these rows to the REGRESSION battery pinned to the SHIP
   output (i.e. as an accepted loss, not a HEAD pin), rewrite truth #1 to say *"one credential shape
   stops being redacted: a bare `sk-` key preceded by a word character; measured, N such spans in the
   corpus"*, and put it in the FLOOR-04 ceiling next to the five bypasses. The plan already models this
   exactly — the swallow row is a declared deviation from HEAD in the *stricter* direction. A declared
   deviation in the looser direction is a legitimate engineering choice; an undeclared one, under a
   truth that says "NOT ONE", is not.

---

## WARNINGS — 01-26

### W5-06 — the two appended underscore arms redact ordinary snake_case identifiers; `newFP 0` is a property of the corpus, not of the arms

```
sk_test_helper_function        -> [redacted]
sk_proj_root_directory         -> [redacted]
sk_live_reload_enabled         -> [redacted]
sk_ant_colony_simulation       -> [redacted]
rk_live_stream_handler         -> [redacted]
rk_test_fixture_builder        -> [redacted]
my-sk_test_configuration_flag  -> my-[redacted]

(correctly unaffected, the \b holds:  disk_test_helper_function, work_live_stream_handler,
 task_test_helper_function, RISK_LIVE_SCORE_THRESHOLD, "const sk_test_x = 1;")
```

The plan's 18-string specificity corpus contains `disk_`, `task_`, `risk_`, `mask_`, `desk_` — every one
shielded by the `\b` — and no bare `sk_test_…` / `rk_live_…` identifier. **Realized impact on this tree
is zero**: my 400-commit replay reports `newly unstaged under SHIP: []`, so nothing here regresses. But
the plan's own justification for putting `\b` on the bare `sk-` arm — *"the bare body is ambiguous by
construction"* — is equally true of a bare `sk_`/`rk_` body, and the consequence of a hit is a permanent
silent unstage. One line in the ceiling naming the family is enough; do not claim a measured `newFP 0`
without stating the corpus it was measured over.

### W5-07 — the 400-commit replay window is commit-relative, so `48/400` is not reproducible from the SUMMARY alone

`git log -n 400` at `0b3d631` gives 48/400 (12.0%) / 65 paths — exactly as published. At `3c10fe1`
(6 commits later) the same code gives 50/400 (12.5%) / 65 paths, because 6 commits rolled in and 6 rolled
out. The SUMMARY must name the tip commit and the `addedLines` variant (`+` retained) beside the number,
or the next reviewer will file a non-reproduction. Note that the *distinct path* count, 65, is stable
across both windows — that is the number worth leading with.

---

## Per-plan verdict

### `01-24-PLAN.md` revision 5 — **NOT CLEAN**

The `(dev, ino)` redesign is the right call and it **closes the class it was built for**: 27 measured
spellings, `subst`, `net use`, a junction, a hard link into `bin/`, a fresh hive on two filesystems, and
it does it with no host list, no prefix table and no fixed-point iteration. That is a genuine end to four
rounds of enumeration, and it should not be relitigated.

It fails on the two places where identity cannot reach and the plan fell back to a **list**:

- **B5-01 (CRITICAL)** — the hard-link `readdir` is one directory deep, so
  `<hive>/bin/runtime/node` — written every bootstrap, on every agent's `PATH` — is ALLOWED through a
  hard link on both platforms, with the write demonstrated landing. The plan mandates shipping
  *"the `<hive>/bin` half is CLOSED"* into the SUMMARY and the ceiling.
- **B5-02 (HIGH)** — the un-created-tail comparison lists three literals and there are four protected
  paths; `<hive>/hooks.sock` flips DENY → ALLOW while absent, inside the documented 10 s watchdog window
  the socket branch exists for.
- **B5-03 (HIGH)** — a rooted-relative `\bin\…` target is unframeable, `isAbsolute` disagrees, and it
  lands a real file in the real `bin/` when the hive is on a non-main drive. Same class as B4-02, which
  round 4 filed CRITICAL; not named in the ceiling's residual list.

All three fail in the ALLOW direction, and all three fixes are small and local. W5-01 (`{ bigint: true }`)
should ride along in the same revision.

### `01-26-PLAN.md` revision 5 — **NOT CLEAN**

Everything this plan measured, reproduces. The 38-row battery, the r4/r4b loss counts, the two round-4
shapes, the five gains, the four rescues, the 18 specificity rows, measurement B down to the path count,
the `.gitattributes` bypass end to end, and the survival requirement on HEAD's binary-blob clause. The
statement-order argument is correct and I confirmed it with a variant the plan did not run
(`SHIP_IN3`, which still loses the swallow row). The decision *not* to widen the value matcher is well
argued and well evidenced.

It fails on one thing, and it is the same thing round 4 failed on one arm over:

- **B5-04 (HIGH)** — the `\b` that rescues `desk-`/`task-`/`risk-` loses OpenAI `sk-` / `sk-proj-` /
  `sk-svcacct-` keys after a word character, including `q=key%3D…` — the exact context the plan pins as a
  must-not-lose REGRESSION row for the Anthropic spelling, and `sk-proj-…` is `SECRETS[0]` in this
  repo's own fixture list. 15 measured losses. `must_haves.truths[0]` ("NOT ONE … stops being redacted")
  is false as written.

Declaring the trade is a perfectly good resolution — the plan already models declaring a deviation from
HEAD for the swallow row. Shipping it undeclared under a truth that says "NOT ONE" is not.

---

## Reproduction

```
# 01-24
node scratchpad/rt5/mkhive.cjs "C:/Users/ALIENW~1/AppData/Local/Temp/probe-hive-rt5"
node scratchpad/rt5/devino.cjs        # dev/ino across 25 spellings
node scratchpad/rt5/battery.cjs       # HEAD vs IDENTITY, spellings + negative controls
node scratchpad/rt5/attack.cjs        # B5-01: hard links incl. bin/runtime
node scratchpad/rt5/land.cjs          # B5-01: the write lands
node scratchpad/rt5/alias.cjs         # subst / net use / junction  (self-tearing-down)
node scratchpad/rt5/rooted.cjs        # B5-03: rooted-relative      (self-tearing-down)
node scratchpad/rt5/fresh_cost.cjs "E:\munder-difflin"   # fresh hive + cost
node scratchpad/rt5/ino.cjs           # W5-01: NTFS ino precision
wsl -d Ubuntu-24.04 -e bash -lc '~/.nvm/versions/node/v22.22.2/bin/node /tmp/posix.cjs'   # B5-02, W5-02, W5-03

# 01-26
node scratchpad/rt5/battery26.cjs     # the 38-row battery, 4 variants
node scratchpad/rt5/replay2.cjs 0b3d631   # measurement B
node scratchpad/rt5/hunt.cjs          # B5-04 loss hunt + W5-06 FP hunt
sh   scratchpad/rt5/gitattr.sh "<tmp>/rt5-gitattr"        # the fifth bypass
```
