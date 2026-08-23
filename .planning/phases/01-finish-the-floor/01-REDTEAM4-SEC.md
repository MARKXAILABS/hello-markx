# Red team round 4 — SECURITY lens

**Target:** `01-24-PLAN.md` (revision 4, `bc94644`) and `01-26-PLAN.md` (revision 4, `473d961`)
**Repo HEAD when measured:** `bc94644` · host `DESKTOP-LO8BH39` · Node `v24.13.0` · win32 10.0.26200
**Method:** the prescribed fixes were IMPLEMENTED from the plan text and re-attacked. Every verdict
below is a measurement taken in this session, not a reading of the plan.

## VERDICT

| plan | verdict | blockers |
|---|---|---|
| `01-24-PLAN.md` | **NOT CLEAN** | 4 (B4-01 … B4-04) |
| `01-26-PLAN.md` | **NOT CLEAN** | 2 (B4-05, B4-06) |

Round 4's pattern holds for a fourth time. `01-24` task 2 is finally clean — the `maxConnections`
deletion is correct and leaves nothing worse than it removed. But **the new round-4 mechanism, the
(b) non-local-UNC short circuit, is itself a fail-open** (B4-04), and the round-4 decision to make
climb-on-throw the *only* resolution path turns every unopenable-but-writable spelling into an ALLOW
(B4-03). `01-26`'s structural claim that appending to an alternation cannot subtract is false by
construction (B4-05).

---

## Harness

`fixed.cjs` implements the 01-24 revision-4 shape literally: `canonicalSpelling` with the three rewrite
rules in the plan's order, the documented local host set
(`localhost`, `127.0.0.1`, `::1`, `.`, `os.hostname()`), applied to a fixed point on **both** sides of
the resolve step; `realpathSync.native` only, climbing on throw, **no** JS fallback; `within()` and
HEAD's `realResolve` copied byte-for-byte from `src/main/hooks.ts:126` and `:143`; and the (b) short
circuit as task 1 step 5 spells it. `rt4-redact.cjs` implements 01-26's pattern 3 (a `\b` on the seven
existing alternatives plus the two appended ones) with patterns 1, 2, 4 and 5 lifted verbatim from
`src/main/hive.ts:391`.

---

# 01-24-PLAN.md

## What round 4 got RIGHT (verified, not assumed)

### 1. The `maxConnections` deletion is real and leaves no worse hole — CONFIRMED

```
grep -c 'maxConnections' src/main/hooks.ts        -> 0
grep -cE 'conn\.destroy\(' src/main/hooks.ts      -> 0
```

`maxConnections` appears in the plan only inside `revision_reason` prose. It appears in **no**
`must_haves.artifacts[].contains`, **no** `key_links[].pattern`, and no positive `<done>` clause — the
two `<done>` mentions are labelled prohibitions. `verify.cjs` reads only `artifacts` and `key_links`,
so no positive gate remains. The orchestrator's claim is accurate.

Exposure arithmetic, which is what "no worse hole" actually means:

| state | per connection | connection count | terminal state |
|---|---|---|---|
| HEAD | **unbounded** (`buf` never sliced, never capped) | unbounded | main OOM |
| revision 3 | `HOOK_LINE_MAX` | capped by `server.maxConnections` | **floor-wide ALLOW at N idle sockets, 0 payload bytes** |
| revision 4 | `HOOK_LINE_MAX`, with forced turnover under the idle timeout | unbounded | main OOM |

Revision 4 is strictly better than HEAD on one axis and identical on the other, and strictly better than
revision 3 on the axis that matters. **The deletion does not open anything.** Shim contract re-confirmed
at source: `hive.ts:3669`, `:3734`, `:4117` are `c.on('error', () => process.exit(0))` with a 5 s
`setTimeout` at `:3670`, `:3735`, `:4118`.

### 2. The 14-spelling table reproduces EXACTLY

Run against a real hive-shaped tree, with a real `writeFileSync` through each spelling and an
`existsSync`/content check on the plain path afterwards:

```
spelling                  HEAD      FIXED     write lands in the REAL bin?
plain absolute            DENIED    DENIED    YES
8.3 short name            ALLOWED   DENIED    YES
long-path prefix   \\?\    ALLOWED   DENIED    YES
device path        \\.\    ALLOWED   DENIED    YES
share \\localhost\C$      ALLOWED   DENIED    YES
share \\LOCALHOST\c$      ALLOWED   DENIED    YES
share \\127.0.0.1\C$      ALLOWED   DENIED    YES
share \\DESKTOP-LO8BH39\C$ ALLOWED  DENIED    YES
share \\desktop-lo8bh39\C$ ALLOWED  DENIED    YES
LP-UNC \\?\UNC\localhost\C$ ALLOWED DENIED    YES
DEV-UNC \\.\UNC\localhost\C$ ALLOWED DENIED   YES
LP-UNC \\?\UNC\<HOSTNAME>\C$ ALLOWED DENIED   YES
LP-UNC + 8.3 composed     ALLOWED   DENIED    YES
forward slashes           DENIED    DENIED    YES
subst Y:                  ALLOWED   DENIED    YES
net use T: \\localhost\C$ ALLOWED   DENIED    YES
REMOTE UNC (neg control)  ALLOWED   ALLOWED   n/a
```

All 14 claimed spellings plus `subst`: **ALLOWED at HEAD, DENIED under the fixed shape, every one lands
the write in the real directory.** The fixed-point-on-both-sides requirement is load-bearing exactly as
claimed — the two UNC compositions close only because of it.

### 3. `realResolve` is fail-CLOSED for the cases the plan names — CONFIRMED

```
new file INSIDE bin/    <root>\bin\does-not-exist-yet.ts   FIXED=DENIED   HEAD=DENIED
deep new dirs in bin/   <root>\bin\a\b\c\new.ts            FIXED=DENIED
ordinary new file       <tmp>\ordinary-new-file-*.ts       FIXED=ALLOWED  HEAD=ALLOWED
  realResolve(...) -> C:\Users\Alienware\AppData\Local\Temp\ordinary-new-file-1787400774603.ts
```

The `.native`-only deletion of the JS fallback does not break the create-a-new-file case. **But see
B4-03** — the same climb is fail-OPEN for a different class.

### 4. The `path.relative` premise behind (b) — CONFIRMED

```
relative('C:\hive\bin', '\\nas\share\x')            = "\\nas\share\x"   isAbsolute=true  within=false
relative('C:\hive\bin', '\\192.168.31.97\C$\...')   = "\\192.168.31.97\c$\..." isAbsolute=true within=false
relative('\\nas\share\hive\bin', '\\nas\share\hive\bin\x') = "x"        isAbsolute=false within=true
```

The micro-claim is true. The flaw is in the classifier's scope, not the premise — B4-04.

### 5. The 21 s block reproduces; **the variance does NOT** — see W4-03.

### 6. Baseline TAP counters re-measured at HEAD on win32

`tests 19 · pass 19 · fail 0 · skipped 0`, and `deleting the hook socket no longer opens the gate until
the app restarts` reports `✔ … (0.2531ms)` — the laundered non-run is exactly as described.

---

## BLOCKERS

### B4-01 — CRITICAL — the 15th spelling: family 5's local-host set is an enumeration, and four reachable local spellings are missing

`canonicalSpelling` rewrites `\\<host>\<X>$\<rest>` → `<X>:\<rest>` **only when `<host>` is local**, and
the plan defines local as exactly `localhost`, `127.0.0.1`, `::1`, `.`, `os.hostname()`. Every other
spelling of *this machine* walks straight through — and the (b) short circuit then guarantees it is
never resolved at all.

Measured on the operator's host, against a real hive tree, with a real write through each spelling:

```
label                HEAD     FIXED (with SC)          FIXED (no SC)  write lands in the REAL bin?
A own LAN IP         ALLOWED  ALLOWED (short-circuit)  ALLOWED        YES
B tailscale IP       ALLOWED  ALLOWED (short-circuit)  ALLOWED        YES
C wsl vEthernet IP   ALLOWED  ALLOWED (short-circuit)  ALLOWED        YES
D ipv6-literal ::1   ALLOWED  ALLOWED (short-circuit)  ALLOWED        YES
E \\?\UNC\ + LAN IP  ALLOWED  ALLOWED (short-circuit)  ALLOWED        YES
F \\.\UNC\ + ipv6lit ALLOWED  ALLOWED (short-circuit)  ALLOWED        YES
```

Strings, verbatim:

```
\\192.168.31.97\C$\Users\ALIENW~1\AppData\Local\Temp\probe-hive-rt4\bin\cth-hook.cjs
\\100.99.217.4\C$\...          (Tailscale)
\\172.28.64.1\C$\...           (WSL vEthernet)
\\0--1.ipv6-literal.net\C$\... (the IPv6 loopback)
\\?\UNC\192.168.31.97\C$\...
\\.\UNC\0--1.ipv6-literal.net\C$\...
```

Independent reachability check, before any gate logic:

```
8ms    EXISTS  \\localhost\C$\Windows
6ms    EXISTS  \\127.0.0.1\C$\Windows
16ms   EXISTS  \\192.168.31.97\C$\Windows      <- NOT in the plan's local set
7ms    EXISTS  \\100.99.217.4\C$\Windows       <- NOT in the plan's local set
5ms    EXISTS  \\172.28.64.1\C$\Windows        <- NOT in the plan's local set
5ms    EXISTS  \\0--1.ipv6-literal.net\C$\Windows  <- NOT in the plan's local set
1ms    no      \\127.0.0.2\C$\Windows
2122ms no      \\DESKTOP-LO8BH39.\C$\Windows
```

Two aggravating details:

- **`::1` in the local set is dead code.** A colon is not legal in a UNC host component, so `\\::1\C$`
  can never be typed. The *only* spelling of the IPv6 loopback that reaches SMB is
  `\\0--1.ipv6-literal.net\C$`, and it is absent. The plan's set therefore contains one entry that can
  never match and omits the one that does.
- **The (b) short circuit makes this permanently unfixable-by-resolver.** With the short circuit these
  candidates are never handed to `realpathSync` at all, so no future improvement to the resolver can
  reach them; only the host set can.

**Effect:** `must_haves.truths[3]` ("a protected path spelled in any of FIVE win32 aliasing families
reaches the same deny branch its plain absolute spelling reaches … (5) a LOCAL admin share") is FALSE
under the shape the plan mandates. Behaviour group B's six admin-share cases all pass while the family
stays open — the same "closed on faith" defect that got `subst` filed as a3/H3-04 in round 3, one level
down. The precondition is identical to the six cases the plan already ships (the operator's account must
be able to reach `C$`), so nothing new is required of the attacker.

**Direction of fix (not prescriptive):** stop enumerating names. Either (i) resolve the UNC host and
compare the resulting address against `os.networkInterfaces()` plus the loopback `/8` and `::1`, or
(ii) drop the host test entirely and decide the admin-share rewrite on the `<X>$` share shape alone,
then let `.native` + the hive-root prefix comparison arbitrate. Any list of names will be wrong on the
next host — this one has three interface addresses and a MagicDNS name the plan never saw.

---

### B4-02 — CRITICAL — the 16th spelling: `C:` drive-relative defeats the entire group-A relative-frame fix

`path.win32.isAbsolute('C:../../bin/cth-hook.cjs')` is **false**, so the target takes the
`join(base, target)` branch — and `path.win32.join` treats the `C:` as an ordinary path segment, which
the first `..` then consumes. One `..` is eaten. The gate measures a directory one level too deep and
allows; Windows measures from the process's per-drive current directory and writes the real file.

Measured, agent cwd = `<root>\agents\a-1` (the exact frame `truths[0]` names):

```
target "C:..\..\bin\cth-hook.cjs"
  isAbsolute                       = false
  join(agentDir, target)           = <root>\agents\a-1\bin\cth-hook.cjs
  gate verdict on that candidate   = ALLOWED
  cmd.exe from agentDir            -> LANDS IN REAL bin = true

target "C:../../bin/cth-hook.cjs"     (forward slashes — same result)
  join(agentDir, target)           = <root>\agents\a-1\bin\cth-hook.cjs
  gate verdict                     = ALLOWED
  cmd.exe from agentDir            -> LANDS IN REAL bin = true
```

`src/main/pty.ts:84` documents that the harness runs agent commands through **`cmd.exe /d /s /c` on
Windows**, so this is the harness's own shell, at the agent's own cwd, with no `cd` and no elevation.

The string is a two-character prefix on the exact string behaviour group A case 1 uses
(`../../bin/cth-hook.cjs`), and it contains `/`, so it survives the Bash arm's
`[\s;&|<>()"']+` split and is classified path-shaped by the plan's own filter.

**Effect:** `must_haves.truths[0]` is FALSE. Group A's headline case passes while the class it stands
for stays open.

**Direction of fix:** treat a drive-relative spelling as what it is. Either reject any target matching
`^[A-Za-z]:(?![\\/])` outright, or normalise it against the vouched base's own drive before joining. A
plain `join` can never be right for it.

---

### B4-03 — HIGH — the 17th spelling: a trailing dot on a directory component, and the proof that "climb on throw" is fail-OPEN

Win32 path normalisation strips trailing dots from path components. `realpathSync.native` cannot open
the un-normalised form, so revision 4's climb — now the **only** resolution path, because item 13 deleted
the JS fallback — returns the attacker's own string, which is not inside `<hive>/bin`.

```
spelling: C:\...\probe-hive-rt4\bin.\cth-hook.cjs   (and the /-spelled twin)
  gate verdict  HEAD = ALLOWED   FIXED = ALLOWED
  realResolve(FIXED) = C:\Users\Alienware\...\probe-hive-rt4\bin.\cth-hook.cjs   <- unchanged
  realpathSync.native(<root>\bin.) -> THROW ENOENT
  realpathSync(<root>\bin.)        -> THROW ENOENT
  existsSync(<root>\bin.)          -> false

  cmd.exe write               -> lands in the REAL bin = true
  powershell -LiteralPath     -> lands in the REAL bin = true
  node fs.writeFileSync       -> ERR ENOENT   (Node prefixes \\?\, which disables normalisation)
```

Node's own `fs` refuses it, so the `Write`/`Edit` tools cannot exploit it — but the **Bash arm** exists
precisely because agents write files with shell commands, and both shells the harness can reach land the
write. Git Bash does not (msys does its own translation); `cmd.exe` — the documented harness shell — does.

The general statement, which belongs in the plan whether or not this particular spelling is closed:

> **Climb-on-throw is fail-OPEN for every spelling the OS canonicalises but the resolver cannot open.**
> Revision 4 removed the JS fallback on the ground that the climb is "fail-CLOSED". It is fail-closed for
> a path that does not exist yet, and fail-OPEN for a path that exists under a name `realpath` will not
> accept. Those are two different failure modes sharing one branch, and only the first is measured.

**Direction of fix:** after the climb returns unresolved, strip trailing dots and spaces from each
component and retry once; if the retry resolves, the two spellings are the same file and the resolved
one wins. Or: refuse any candidate that still contains a component matching `[. ]$` (fail-closed —
no legitimate path has one).

---

### B4-04 — HIGH — the (b) short circuit is NOT verdict-preserving. This is round 4's new hole.

The plan's headline defence of (b): *"This changes COST, never VERDICT … `within()` compares via
`path.relative`, which returns an absolute path when the two sides are on different roots."* That
argument holds only for candidates the resolver would also have left as UNC. It does not hold for the
Windows device namespace — and the predicate the plan tells the executor to write does not exclude it.

```
label            HEAD     FIXED (with SC)          FIXED (no SC)  lands
O volume GUID    ALLOWED  ALLOWED (short-circuit)  DENIED         YES
P GLOBALROOT     ALLOWED  ALLOWED (short-circuit)  DENIED         YES

\\?\Volume{5396649d-f2ea-49e0-8224-0ad5fa163cc0}\Users\...\probe-hive-rt4\bin\cth-hook.cjs
\\?\GLOBALROOT\Device\HarddiskVolume3\Users\...\probe-hive-rt4\bin\cth-hook.cjs
```

`realpathSync.native` **does** canonicalise both to `C:\…` — the resolver would DENY them. The short
circuit ALLOWS them. That is a bound whose failure mode is allow, for the fourth consecutive round.

Why the executor will write it that way — every natural spelling of "still a UNC path `\\<host>\<share>\`"
classifies both as UNC:

```
\\?\Volume{5396649d-...}\x
  /^\\\\[^\\]+\\[^\\]+/            -> true
  path.win32.parse().root          -> "\\?\Volume{5396649d-...}\"
\\?\GLOBALROOT\Device\HarddiskVolume3\x
  /^\\\\[^\\]+\\[^\\]+/            -> true
  path.win32.parse().root          -> "\\?\GLOBALROOT\"
```

`canonicalSpelling` deliberately leaves both untouched (its `\\?\` rules only cover `\\?\UNC\` and
`\\?\<X>:\`), so they arrive at the short circuit still `\\`-prefixed. Nothing in the plan says to carve
`\\?\` and `\\.\` out of the UNC test.

**Effect:** two spellings that the mandated resolver DENIES are turned into ALLOWs by the mechanism
introduced to make the DoS decision, and both land the write in the real `bin/`.

**Direction of fix:** one clause. The short circuit must apply only when the candidate is a *genuine*
UNC path — `p.startsWith('\\\\') && !p.startsWith('\\\\?\\') && !p.startsWith('\\\\.\\')` — and the plan
must say so, because "still a UNC path `\\<host>\<share>\…`" does not.

---

## WARNINGS

### W4-01 — T-P24-12's "accept" rests on a false dichotomy

The plan's own design rule: *"The only admissible bound is one that delivers an explicit
`permissionDecision: 'deny'` to a peer that is still connected to read it."* A **userland** connection
counter satisfies that rule exactly: accept the connection, run the handler, write the module-level deny
constant, `conn.end(response)`. The shim's `c.on('data', …)` fills `resp`, `c.on('end', …)` runs `done`,
a non-empty body is a deny. That is admissible by the plan's own test — and the plan forecloses it:
*"If a reviewer asks for an aggregate bound, the answer is the recorded residual below, not a
mechanism."*

`server.maxConnections` is inadmissible because Node enforces it in C++ before the `'connection'` event.
That is a fact about `server.maxConnections`, not about connection bounds. The plan generalises from one
to the other and then accepts a residual it did not have to.

### W4-02 — the published arithmetic makes the residual the same harm class, not a lesser one

Task 2 mandates `HOOK_LINE_MAX` be sized above `fs.ts:113` (2 MB) and `:142` (10 MB), and forbids
`slack.ts`'s 1 MB. Buffering happens **before** authentication — `buf += d.toString()` runs on every
connection, `authorized()` only after a newline — so an unauthenticated local peer can hold
`HOOK_LINE_MAX`. The residual is therefore `N (unbounded) × >10 MB`, pre-auth.

T-P24-12 says *"If that product is uncomfortable, the lever is `HOOK_LINE_MAX` — never a connection
count"*, while the same plan pins `HOOK_LINE_MAX` above 10 MB. The only named lever is the one the plan
forbids moving.

And the terminal state is not a "lesser harm": main OOMs, the socket goes, every shim's connect fails,
every shim exits 0 with no stdout — which the plan's own trust-boundary table calls *"allow floor-wide"*.
It is the same harm the plan refuses to trade for, reached by a different road. The disposition is
honestly labelled as accepted and the arithmetic is deferred to the SUMMARY as required — but the
"lesser harm" sentence is not supported.

### W4-03 — the routing-variance measurement does not reproduce

The plan's second measurement (*"0–1 ms, minutes later, on FRESH unreachable hosts"*) is the evidence
for *"no count cap is calibrated for both"*. Re-run this session, same host:

```
\\10.255.255.1\share\a\b.ts    -> 21055 ms   (plan: 21023)
\\192.0.2.1\share\a\b.ts       -> 21046 ms   (plan: 21029)
\\172.31.255.11\share\a\b.ts   -> 21043 ms   (plan:     0)
\\10.99.88.77\share\a\b.ts     -> 21028 ms   (plan:     0)
\\192.168.244.13\share\a\b.ts  -> 21063 ms   (plan:     1)
```

The 21 s half reproduces to within 0.2 %. The 0–1 ms half does not — all five hosts now block. The
plan's *structural* conclusion is unaffected and in fact strengthened (uniform 21 s makes a count cap
worse, not better), so **(b) remains the correct answer**. But the published 0/0/1 ms row is a
point-in-time artifact of a routing table, and the plan presents it as the decisive measurement. Label
it as routing-state-dependent, or re-measure and publish both states with the routing table alongside.

### W4-04 — T-P24-15 is honest, but its ceiling sentence overstates unclosability

Hard link, verified this session:

```
fs.linkSync(<bin file>, <tmp hardlink>)  -> CREATED, no elevation
verdict through the link, FIXED          -> ALLOWED
write through the link                   -> lands in the REAL bin = YES

real  dev=3222877229 ino=9007199256821258 nlink=2
link  dev=3222877229 ino=9007199256821258 nlink=2
identity check would close it            -> true
```

The plan's claim *"no canonicalisation can ever close it"* is literally true and T-P24-15 does say the
closure needs a volume/inode check. But the *ceiling comment* text the plan dictates —
*"which `realpath` cannot dereference and no canonicalisation can ever close"* — reads to an operator as
"unclosable". It is closable in about three lines using `statSync`, which `hooks.ts:68` **already
imports**: compare `dev`/`ino` of the resolved target against the protected files when `nlink > 1`.
Accepting it is defensible; writing "can ever close" without the qualifier is not. Say
"not closable by canonicalisation; closable by an inode identity check, which is its own plan."

### W4-05 — residual (d) is over-stated for the local-host case

The ceiling is told to name *"a remote alias of the same volume — a `net use Z: \\localhost\C$` mapped
drive"*. Measured:

```
net use T: \\localhost\C$ ; target T:\Users\...\probe-hive-rt4\bin\cth-hook.cjs
  HEAD = ALLOWED    FIXED = DENIED    lands = YES
```

The post-resolve fixed point closes it: `.native` returns the `\\localhost\C$\…` form and the second
`canonicalSpelling` pass rewrites it to `C:\…`. The residual holds for a mapping to a **non-local** host
spelling (which is B4-01), not for `\\localhost\C$`. Writing a closed case into a ceiling list is the
mirror image of the `subst` defect round 3 was returned for.

---

# 01-26-PLAN.md

## What round 4 got RIGHT (verified)

### 1. Pattern 5 is frozen, and the pin fails RED on drift — CONFIRMED

The freeze was implemented as the plan prescribes (locate `// 5. Sensitive key = value / key: value`,
slice from the following `s = s.replace(` to the first `);`, normalise whitespace, `strictEqual` against
a HEAD-captured constant). Measured against the live `src/main/hive.ts`:

```
slice found: true   normalised length: 318
freeze passes at HEAD: true

RED   <- add a value-shape predicate to the literal   ((?![A-Z_]+$) inserted before the value class)
RED   <- change the callback text                     (`${k}=[redacted]` -> `${k}=[REDACTED]`)
RED   <- change one quantifier                        ({6,} -> {8,})
```

There is no `);` sequence inside the statement before its terminator, so the slice is unambiguous. The
freeze is real and non-vacuous. Scoping caveat in W4-09.

### 2. Measurement B — the decisive one — reproduces EXACTLY

Replayed at the plan's own stated commit `0b3d631`, using `scrubStagedSecrets`' own algorithm (split on
`^diff --git `, keep `+` lines that are not `+++`, run the matcher, skip the two `harnessAuthored`
paths):

```
PLAN CLAIMS : HEAD 50 commits (12.5%) / 66 distinct paths
MEASURED    : HEAD 50 commits (12.5%) / 66 distinct paths     <- exact
```

**The architectural decision — freeze rather than widen — is correctly grounded.** The control's cost is
what the plan says it is.

### 3. Zero detection loss on the stated corpus — CONFIRMED

```
33-row REGRESSION corpus (15 live SECRETS + the 4 round-2 classes + the 12 round-3 shapes
                          incl. the Vault hvs. token + 2 crypt controls)
  detections LOST: 0

the plan's 18 PUBLISHED HEAD outputs, re-derived from the live matcher
  mismatches: 0 / 18       <- including the argon2 partial redaction
                              "password=[redacted],t=3,p=4$abcdefgh"

the 12 named false positives:  HEAD-clean and SHIP-clean, all 12
the 6 live BENIGN:             unchanged
the two build_map.py desk lines:
  HEAD "    'desk-team-lead': grid[6], 'de[redacted]': grid[7],"
  SHIP "    'desk-team-lead': grid[6], 'desk-backend-engineer': grid[7],"   strictEqual: true
  HEAD "    'desk-project-manager': grid[10], 'de[redacted]': grid[11],"
  SHIP "    'desk-project-manager': grid[10], 'desk-market-researcher': grid[11],"  strictEqual: true

the five unlabelled underscore shapes: RED at HEAD, GREEN shipped, all five
```

### 4. The JSON arm's rejection measurement reproduces exactly

Built the arm as the plan describes (appended, inheriting pattern 5's value class verbatim):

```
new false positives among the 12 named:  2      (plan claims 2)
  "api_key": "$OPENAI_API_KEY"   ->  "api_key": "[redacted]"
  "secret": "REPLACE_ME"         ->  "secret": "[redacted]"
gains:
  {"token": "abcdef123456789"}        ship=unchanged   +json=redacted
  "client_secret": "9f8e7d6c5b4a3210" ship=unchanged   +json=redacted
still missed either way:
  obj["token"] = "abcdef123456"       unchanged in both
```

### 5. The `\bsk` key_link gate is NOT vacuous — CONFIRMED

The real verifier reports the stored pattern as `"\\\\bsk"`, i.e. a regex matching a literal backslash
followed by `bsk` — satisfiable only if `hive.ts` literally contains `\bsk`. Red at HEAD:

```
Pattern "\\bsk" not found in source or target
```

The plan's warning that a shared `\b(?:sk|rk)` group can never satisfy it is correct.

---

## BLOCKERS

### B4-05 — HIGH — "appending to an alternation cannot subtract" is FALSE, and the boundary change loses real detections

The plan's structural licence for shipping without a wider corpus: *"Appending a branch to an alternation
cannot subtract from what the other branches match, which is the structural reason the detection delta is
0 rather than a corpus result that has to be re-argued every revision."*

**Counterexample, measured:**

```
in   "sk_live_AAAAAAAAAAsk-ant-BBBBBBBBBBBBBBBB"
HEAD "sk_live_AAAAAAAAAA[redacted]"          <- the sk-ant- key fully redacted
SHIP "[redacted]-ant-BBBBBBBBBBBBBBBB"       <- 20 bytes of the second key in PLAINTEXT
```

Mechanism: the appended branch `\bsk_(?:ant|live|test|proj)_[A-Za-z0-9_]{10,}` matches at an *earlier*
position and its greedy body consumes the leading `sk` of the following `sk-ant-` key, so the existing
`sk-` branch has nothing left to match. Appending cannot subtract *at a position*; it can and does
subtract *downstream*, because a global replace resumes after the new match's end.

**And the `\b` half — which the same sentence covers — loses four shapes outright:**

```
in   "q=key%3Dsk-ant-api03-AAAABBBBCCCCDDDD"       (URL-encoded '=')
HEAD "q=key%3D[redacted]"
SHIP "q=key%3Dsk-ant-api03-AAAABBBBCCCCDDDD"       <- whole key leaked

in   "AWSAKIAIOSFODNN7EXAMPLE"     HEAD "AWS[redacted]"   SHIP unchanged
in   "xsk-ant-api03-AAAABBBBCCCCDDDD"  HEAD "x[redacted]" SHIP unchanged
in   "MYgithub_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ"  HEAD "MY[redacted]"  SHIP unchanged
```

The URL-encoded row is not exotic: `%3D` is how an API key appears in a query string, a `curl` line, a
log entry or an error trace, and `D` is a word character so `\b` blocks it.

**Effect:** `must_haves.truths[0]` — *"NOT ONE credential shape that `redactSecrets` redacts at HEAD
stops being redacted"* — is FALSE as stated. The 33-row battery cannot detect it because none of these
shapes is in the corpus, which is the exact failure mode (*"every fixture the plan owned still reported
green"*) the battery was built to end. This is a smaller loss than revision 2's four classes or
revision 3's eleven, but it is the same class, and the sentence that licenses skipping a wider corpus is
the one that is wrong.

**Direction of fix, cheap:** the measured false positives are *all* on the `sk-` arm
(`desk-backend-engineer`, `desk-market-researcher`, `sk-kanban-work-as-a-board-not-a-chat-log`). The
other six alternatives have **zero** measured false positives across 502 files and 400 commits. Put the
`\b` on `sk-` only — the uniformity argument (*"one uniform rule is a smaller thing to get right than six
exceptions"*) buys nothing and costs four detections. Then add the swallow row and the `%3D` row to the
REGRESSION battery so the next revision cannot lose them silently.

---

### B4-06 — HIGH — a FIFTH ACTIVE FLOOR-04 bypass, cheaper and quieter than all four named — and the prescribed rewrite DELETES a true ceiling clause

**`printf '* -diff\n' > .gitattributes`** — one command, persistent, silent.

Measured end to end against real git:

```
before:
  $ git -c core.quotePath=false diff --cached --unified=0 --no-color --no-ext-diff
  +sk-ant-api03-AAAAAAAAAAAAAAAAAAAA
  $ git diff --cached --numstat
  1  0  secret.txt

after `printf '* -diff\n' > .gitattributes`:
  $ git -c core.quotePath=false diff --cached --unified=0 --no-color --no-ext-diff
  Binary files /dev/null and b/.gitattributes differ
  Binary files /dev/null and b/secret.txt differ
  $ git diff --cached --numstat
  -  -  .gitattributes
  -  -  secret.txt
```

Trace it through `scrubStagedSecrets` at `src/main/hive.ts:3186`:

1. `--numstat` returns `-`/`-`; the loop does `Number('-') || 0`, so `changed` is **0** — the
   `SECRET_SCAN_MAX_LINES` branch never fires and **nothing is logged**.
2. The diff carries zero `+` lines, so `addedLines(text)` is `''`.
3. `if (!all || redactSecrets(all) === all) return true;` — **commit proceeds, scanned nothing, with no
   `console.warn`, no `secret-scan-skipped` and no `secret-scan-truncated` entry.**

Both size caps at least emit `committing UNSCANNED` and an `appendLog` row. This one is **completely
silent**, and unlike `seq 20001 > pad.txt` (which works for one debounce window) it persists for every
future commit until someone reads `.gitattributes`.

**Aggravating.** The plan orders the ceiling paragraph *"REWRITTEN, not appended to"* and enumerates
exactly four bypasses. HEAD's paragraph already contains the sentence:

> *"Binary blobs produce no `+` lines and are never scanned."*

The prescribed rewrite therefore **removes a true ceiling clause the shipped source has today**, and
replaces it with a list that misses the agent-controllable escalation of that same clause. A ceiling
that loses a residual across a rewrite is worse than no rewrite.

**Sixth, closely related, and it undermines the paragraph's premise:** `AGENT_DENY_RULES`
(`src/main/hive.ts:450`) contains no `git add`, no `git commit` and no `git -C` rule. An agent can run
`git -C "$HIVE_ROOT" add -A && git -C "$HIVE_ROOT" commit -m x` and the scrub never executes. The
paragraph being restated opens with *"ADR-0004 makes this class the hive repo's single committer, so
flushCommit is the ONE place every hive write reaches git through"* — that premise does not hold, and
the restatement is the place to say so.

**Direction of fix:** name both in the rewritten ceiling; keep HEAD's binary sentence and extend it with
the `.gitattributes` command exactly as the plan does for `seq 20001 > pad.txt`. Separately worth
considering (own plan): treat a `-`/`-` numstat row as `committing UNSCANNED` and log it, so the silent
path at least becomes a loud one.

---

## WARNINGS

### W4-06 — measurement A does NOT reproduce at the plan's own stated commit

Re-run at `0b3d631` (tree extracted with `git archive`, so LF blobs, no CRLF noise):

```
PLAN CLAIMS : 471 tracked files / 173 distinct pattern-5 / 319 occurrences / 70 of 471 altered
MEASURED    : 502 tracked (481 text, 21 binary) / 184 distinct / 2456 occurrences / 80 altered
MEASURED (counting each distinct span ONCE PER FILE, the reading that fits the plan's
          "13x sock_token…" top-list) : 184 distinct / 661 file-occurrences
```

Neither counting method reproduces 173/319, and the top-span list diverges completely (plan:
`13x "sock_token = process.env.HIVE_SOCK_TOKEN"`; measured: `166x "token: string):"` raw,
`15x "token: string):"` per-file). The distinct count is off by 11 and the file count by 10.

Measurement **B** — the one the architecture rests on — reproduces exactly, so the decision stands. But
task 2 orders these A numbers written **verbatim into `src/main/hive.ts`**: *"`redactSecrets` fires on
173 distinct spans across the 471 tracked text files of this repo."* Shipping an unreproducible
measurement into a source comment is the exact defect class (`a/CR-01`, *"transport posture mirrors
slack.ts"*) this phase exists to remove. Either re-derive A and publish the extractor, or cite B only.

### W4-07 — the plan's own B table row for the shipped matcher is wrong

```
plan's table   : HEAD + this plan's pattern-3 change -> 400 / 50 (12.5%) / 66 paths   [IDENTICAL]
measured       : 48 (12.0%) / 65 paths
rescued        : docs/blog/command-center-guide/index.html
                 (span "sk-kanban-work-as-a-board-not-a-chat-log", from "#the-task-kanban-…")
newly unstaged : none
```

The divergence is in the safe direction — the boundary change rescues one more real false positive than
the plan credits it with. But `<verification>` instructs the executor to expect the replay to read
*"identically to the HEAD row (50 / 400, 66 paths) minus the four desk-id files"*, which is both
self-contradictory and not what the data does: the four desk-id files were never touched with those lines
in the last 400 commits; the one rescue is a different file entirely. An executor who measures 48/65 and
trusts the plan will report a discrepancy that is actually a correct result.

### W4-08 — "NOT ONE of the 173 is a credential" is a rhetorical simplification

The whole-tree scan flags 12 spans whose values are credential-shaped:

```
"api_key=sk_live_th_isIsASecretValue123"
"aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
"private_key=abc123DEF456ghi789jkl012mno"
"CAUGHT_SECRET = 'sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJ'"
"MISSED_SECRET = 'sk_ant_api03_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJ'"
"HIVE_SOCK_TOKEN=SENTINEL-TOKEN-abc123`"
"password=$2b$12$KIXxPfPqmSabcdefghijklmn"   (+ 5 more)
```

All are the suite's own synthetic fixtures, so no *live* credential is present and the plan's conclusion
survives. But *"measured precision of zero"* is not the measurement: the matcher fires correctly on every
credential-shaped string in the tree, and every one of them happens to be a fixture. The honest form is
"no LIVE credential", and it costs one word.

### W4-09 — the pattern-5 freeze pins the STATEMENT, not the arm's behaviour

`truths[1]`: *"the shipped regex literal is asserted identical to a constant captured at HEAD, so no
value-shape predicate can be added to it without the suite going RED."* True for a predicate written
*inside* that statement (measured RED, three ways). A predicate added as a **sixth** `s = s.replace(…)`
after pattern 5, or applied to the input before it, passes the freeze untouched.

The plan is saved by two other controls: the LOCKSTEP statement count (`5` at HEAD, `7` after task 2,
equal in both copies) goes RED on a sixth statement, and the 33 exact-output REGRESSION pins go RED on
any behaviour change. **The combination is sound.** The claim as written attributes the whole guarantee
to the freeze alone. One clause fixes it.

### W4-10 — the JSON arm's rejection is defensible; its stated reason is a category error

The plan rejects it because a value-shape predicate *"is the mechanism that lost 15 detections across two
rounds"*. Those 15 were lost to a predicate on **pattern 5** — the only arm covering labelled
`key=value`, so a predicate there subtracts from live detections. A predicate confined to a **newly
appended** JSON arm cannot subtract from anything that matches today; it can only reduce the new arm's
own gains. That is the plan's own append argument, applied to itself.

The cost/benefit conclusion (+2 detections is thin) is still reasonable, and the durability suite's arm
asserting the JSON pair is still present is a good guard. But *"re-opening a door that cost 15"* is not
the same door, and the ceiling should say why the arm was rejected on value rather than on a hazard that
does not apply to it.

---

## Reproduction

Harnesses used, all in the session scratchpad
(`…/4111c3ad-b22d-41bd-a975-8fafe0475b65/scratchpad/`):

| file | what it does |
|---|---|
| `fixed.cjs` | the 01-24 revision-4 resolver, implemented from the plan text |
| `attack.cjs` | the 14-spelling table + `subst`, against a real hive tree, with write-lands checks |
| `attack2.cjs` | the 15th-spelling battery (B4-01, B4-04), junction, hard link, `net use`, volume GUID, GLOBALROOT |
| `attack3.cjs` | drive-relative (B4-02), `path.relative` premise, fail-closed controls, hard-link inode identity |
| `attack4.cjs` | trailing dot (B4-03) through cmd/PowerShell/Node, and the UNC timing re-run |
| `rt4-redact.cjs` | HEAD / SHIPPED / boundary-only / append-only variants of `redactSecrets` |
| `rt4-26b.cjs` | measurements A and B replayed at `0b3d631` |
| `rt4-26d.cjs` | the 33-row corpus, the 12 false positives, the five new shapes, the subtraction attack |
| `rt4-26e.cjs` | the pattern-5 freeze + drift mutations, and the rejected JSON arm |

No source file, plan file or repository state was modified. `subst` and `net use` aliases created during
the run were released; probe trees, the junction and the hard link were deleted.
