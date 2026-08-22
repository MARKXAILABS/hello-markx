---
phase: 01-finish-the-floor
audited: 2026-08-23
tree: E:\munder-difflin
branch: gsd/v1.0-milestone
head: 1a2bf7e
host: win32 10.0.26200 · Node v22.23.2 (`/c/Users/Alienware/AppData/Local/nodejs-22`)
threats_total: 289
threats_closed: 104
threats_open: 1
threats_unverified: 184
status: gaps_found
asvs_level: 2
production_state: NOT IN PRODUCTION — `origin/main` still pins `electron ^32.2.0`; this branch is unmerged behind draft PR #77
---

# Phase 01 — security audit

**State B.** No `01-SECURITY.md` existed. This document is built from the `<threat_model>`
blocks of all 31 plans and verified against the code that is actually on
`gsd/v1.0-milestone` at `1a2bf7e`.

## What this audit is, and what it is not

Every verdict below was produced by running a command in this session. Nothing is
carried over from a SUMMARY. Where a SUMMARY claim could not be re-derived, the row
says so rather than inheriting the claim.

**Threat actor model** (from the phase's own trust boundaries, and it is the one that
matters here): an LLM-controlled agent shell running as the **same OS user**, with the
app's environment in its own environment. It reads any file the user can, spawns
processes, and makes loopback connections. It is not a remote attacker. **A control
that only stops a remote attacker is not a control on this floor.**

**Production state.** Nothing in this document is in production. `origin/main` still
pins `"electron": "^32.2.0"`; all of phase 01 sits unmerged on `gsd/v1.0-milestone`
behind draft PR #77. Phase 01 itself is **PARTIAL** — 10 of 23 requirement rows close.

## Gates re-run live at `1a2bf7e`

| Gate | Command | Result |
|---|---|---|
| Full suite | `node --test test/*.test.cjs` | `# tests 634` · `# pass 627` · `# fail 0` · `# skipped 7` · exit 0 |
| Hook gate | `node --test test/net-binding.test.cjs` | 45 tests · 43 pass · 0 fail · 2 skip |
| Telemetry auth | `node --test test/telemetry-auth.test.cjs` | 32 tests · 32 pass · 0 fail · 0 skip |
| Redaction | `node --test test/voice-messages.test.cjs` | own harness · `# all passed` |
| Breaker + delivery | `node --test test/breaker.test.cjs test/delivery-main.test.cjs test/queue-delivery.test.cjs test/renderer-queue.test.cjs` | 57 tests · 57 pass · 0 fail |

The 634/627/0/7 figure matches the phase's recorded gate exactly. The two skips inside
the hook suite are **runner-counted** (`t.skip(...)`, not a bare `return`), so they are
inside the `# skipped 7` total and cannot inflate `# pass` — that is `T-P24-09` and
`T-P30-01` working. The skip ceiling was re-frozen at `≤ 7` on win32 with the reason
written down (`01-VALIDATION.md:57-101`).

---

## Register summary

| | Count |
|---|---|
| Threats declared across 31 `<threat_model>` blocks | **289** |
| Individually verified CLOSED in this audit | **104** |
| **OPEN (BLOCKER)** | **1** |
| Not individually re-verified by this audit | **184** |

Disposition mix over the whole register: `mitigate` 253 · `accept` 29 · `reduce` 6 ·
`partial mitigate` 1.

The 289 rows were parsed mechanically out of every `<threat_model>` block; there are
no duplicate IDs and no plan lacks a block. The gap-closure wave (01-24 … 01-31)
carries **86** of them — 78 substantive plus 8 `-SC` supply-chain rows.

---

# 1. OPEN — must be resolved before this phase ships

## T-P24-10 — `protectedPathDenial`'s `if (!root) return null` fail-open is not recorded anywhere in the shipped tree

**Plan:** 01-24 · **Category:** Elevation of privilege · **Disposition:** `accept`

The plan's accept condition is its own sentence: *"Named so it is a recorded ceiling
and not an unspoken assumption."* That condition is **not met**.

| Where it should be | What is there |
|---|---|
| `src/main/hooks.ts:831` | `if (!root) return null;` — **no comment at the site** |
| `src/main/hooks.ts:779-826` — the ceiling list `(a)`–`(h)` on `protectedPathDenial` | the branch is **absent** from all eight items |
| `01-24-SUMMARY.md` `## Accepted residuals` | covers T-P24-12/14/15/16/17 only — **T-P24-10 is absent** |
| `.planning/REQUIREMENTS.md:618` residual register (A1–A35) | **no row** |

`grep -rn 'T-P24-10' src/ test/ .planning/REQUIREMENTS.md .planning/phases/01-finish-the-floor/01-24-SUMMARY.md` → **no output**.

01-24's own SUMMARY states the rule this violates: *"a residual recorded only in a
source comment or only in the plan's threat table is invisible to it [01-31's register
sweep]."* T-P24-10 is recorded in **neither** — only in the plan's threat table.

**Severity.** The underlying behaviour is benign in the ordinary case: with no hive
root there are genuinely no protected paths. It is filed OPEN because an `accept`
disposition whose entire consideration was "write it down" did not write it down, and
an unrecorded fail-open in a security gate is exactly the shape that gets re-discovered
as a finding two phases later.

**What closes it:** one item `(i)` in the `protectedPathDenial` ceiling comment naming
the `!root` branch, plus one row in `.planning/REQUIREMENTS.md`'s residual register
with a named owner (the pattern A15–A19 already use). No code change.

---

# 2. CLOSED — the gap-closure wave, verified against merged-state code

## 2.1 `src/main/hooks.ts` — the PreToolUse path gate (plan 01-24)

### The three prohibitions are 0 — measured, not asserted

```
$ grep -n 'canonicalSpelling\|maxConnections\|conn\.destroy(' src/main/hooks.ts
$ echo $?
1
```

Zero matches for all three. This matters per-prohibition:

* `server.maxConnections` — Node enforces it inside `onconnection` **before** the
  `'connection'` event, so the over-limit peer reads zero bytes; zero bytes is
  `exit(0)` with no stdout, which every shim reads as **allow**. Its absence is the
  control.
* `conn.destroy(` — discards the pending write → `ECONNRESET` → exit 0 → allow. The
  file uses `conn.end(...)` on every bound instead (`:581`, `:587`, `:593`).
* `canonicalSpelling` — the enumeration approach that produced seventeen bypasses over
  four review rounds.

### The identity comparison is real, and I read it rather than trusting the comment

`pathIdentity` (`src/main/hooks.ts:149-155`):

```ts
function pathIdentity(p: string): string | null {
  try {
    const st = statSync(p, { bigint: true });
    if (st.ino === 0n) return null;
    return `${st.dev}:${st.ino}`;
  } catch { return null; }
}
```

`{ bigint: true }` is load-bearing and present: live NTFS hive inodes measure
`ino = 24769797950806710`, ~2750× past `Number.MAX_SAFE_INTEGER`, so a Number `ino`
would round two distinct files into a false identity. `ino === 0n` returns *no
identity* rather than *identity 0*, which is what stops two unrelated files on an
exFAT volume comparing equal.

The comparison chain is `candidateDenial` (`:999-1043`) → `containment` (`:1057-1085`)
→ `ownerVerdict` (`:1091-1099`) → `rootTailVerdict` (`:1115-1131`). There is no host
set, no prefix table and no spelling list anywhere in the file. The only two places a
NAME is still compared are both **inside a directory whose identity is already
established**: the four-literal un-created tail (`bin`, `.git`, `sockName`, `agents`)
and the agent-owner fold.

### Live measurement of the spelling battery on this host

`node --test --test-name-pattern='every win32 spelling' test/net-binding.test.cjs`
printed its own table:

```
# [net-binding] win32 spelling battery, 20 spellings:
#   DENIED  reachable plain absolute (control)
#   DENIED  reachable forward slashes
#   DENIED  reachable long-path prefix \\?\
#   DENIED  reachable device path \\.\
#   DENIED  reachable admin share \\localhost
#   DENIED  reachable admin share \\LOCALHOST, lc drive
#   DENIED  reachable admin share \\127.0.0.1
#   DENIED  reachable admin share \\<hostname>
#   DENIED  reachable admin share \\<hostname-lc>
#   DENIED  reachable LP-UNC \\?\UNC
#   DENIED  reachable DEV-UNC \\.\UNC
#   DENIED  reachable LP-UNC + <hostname>
#   DENIED  reachable \\0--1.ipv6-literal.net
#   DENIED  reachable own address 100.99.217.4 (Tailscale)
#   DENIED  reachable own address 192.168.31.97 (Wi-Fi)
#   DENIED  reachable own address 172.28.64.1 (vEthernet (WSL (Hyper-V firewall)))
#   DENIED    —       trailing dot
#   DENIED    —       trailing dot, / spelled
#   DENIED    —       trailing space
#   DENIED    —       trailing dot on the LEAF
```

Sixteen of the twenty are `reachable` — `fs.existsSync` resolves them to a real file in
the real `bin/`. The four trailing-dot/space rows read `—` for the documented reason:
Node's `fs` runs `path.resolve()` then `toNamespacedPath()`, and the `\\?\` prefix that
adds **disables** Win32's trailing-dot normalisation, while `cmd.exe` — which
`pty.ts:84` documents as the harness's Windows shell — writes straight through them.
That is what `win32Components` (`:176-188`) exists for, and it is a closed-form OS rule,
not an enumeration.

Note the three `own address` rows are **derived at runtime** from
`os.networkInterfaces()` — these are this machine's real Tailscale, Wi-Fi and WSL
addresses. A hard-coded IP list in the test would be the same defect one level down.

The remaining ten of the claimed thirty are separate named tests, all green in the same
run: `8.3 SHORT NAME` (20), `subst` alias (21), `net use` mapped drive (22), Volume GUID
+ GLOBALROOT (23), ancestor junction for both an existing and a not-yet-created leaf
(24), **hard link including one level down in `bin/runtime`** (25), fresh-hive creation
writes (27), unidentifiable candidate (28), full inode precision (29).

### Negative controls are present — the gate is not simply denying everything

Tests 30, 31, 32 in the same file: *"the ordinary work this gate runs in front of is
untouched"*, *"the god case: the harness home as a cwd still denies another agent's
tree"*, *"the protected-path negative controls: prefixes, new files and deep new
directories"*. All green.

### Per-threat verdicts (01-24)

| ID | Cat | Disp | Verdict | Evidence |
|---|---|---|---|---|
| T-P24-01 | EoP | mitigate | **CLOSED** | `vouchedBases` `isAbsolute`-filters `registry().agents[id].cwd` — `hooks.ts:934-943`; `DENY_CANNOT_LOCATE` on an empty set `:872`; tests 13, 16 |
| T-P24-02 | Spoofing | mitigate | **CLOSED** | two-stage deny-wins: `if (bases.length === 0) return []` **before** `p.cwd` is consulted — `hooks.ts:940-942`; tests 16, 17 |
| T-P24-03 | EoP | mitigate | **CLOSED** | `expandTilde` `:866`; boundary-aware `$HOME`/`$USERPROFILE` via `new RegExp('\\$NAME(?![A-Za-z0-9_])')` and a **function** replacement so a `$` in a home dir is not a capture ref — `hooks.ts:955-975`; tests 14, 15 |
| T-P24-04 | DoS | mitigate | **CLOSED** | `pathShaped` word filter `:276`; `HOOK_CANDIDATE_MAX = 500` `:318` tested **before** any resolve `:876`; per-parent memo `:886`; `HOOK_RESOLVE_BUDGET_MS = 250` `:339`/`:890` — deny, never truncate |
| T-P24-05 | Tampering | mitigate | **CLOSED** | per-connection `done` flag + `buf` slice; test 34 drives an `allowHalfOpen` client |
| T-P24-06 | EoP | mitigate | **CLOSED** | `grep 'conn.destroy('` → 0; both bounds write an explicit `permissionDecision:'deny'` and `conn.end(...)` `:581`/`:587`/`:593`; idle timeout sized **below** the shims' 5 s self-timeout — tests 35, 36, 37, 38 |
| T-P24-07 | Info disc | accept | **CLOSED (accepted)** | rationale in shipped source, `hooks.ts:600`: *"The two bound replies ARE distinguishable from `{}`, deliberately"*. Deliberate design property; the alternative is T-P24-06. **No register owner — see WARNING W2.** |
| T-P24-09 | Repudiation | mitigate | **CLOSED** | `t.skip(...)` (runner-counted) at `net-binding.test.cjs:461/539/563/570/572/582/590/599/608/617/648/653`; the phase gate reports `# skipped 7` and the ceiling is re-frozen at `≤ 7` (`01-VALIDATION.md:57-101`) |
| T-P24-10 | EoP | accept | **OPEN** | see §1 |
| T-P24-11 | EoP | mitigate | **CLOSED** | live battery above; `pathIdentity` `:149`; no host set / prefix table / spelling list in the file |
| T-P24-12 | DoS | accept — **owner: hive maintainer** | **CLOSED (accepted)** | owner named in `01-24-SUMMARY.md` `## Accepted residuals` **and** `REQUIREMENTS.md` register row **A15**. Arithmetic published: `N × HOOK_LINE_MAX` = **≈384 MiB** at the 24-agent modelled floor, buffered **before** `authorized()`. `HOOK_LINE_MAX = 16 MiB` at `:412` is explicitly **not** a lever (its floor is `fs.ts`'s 10 MB read) |
| T-P24-13 | EoP | accept | **CLOSED (accepted)** | ceiling item **(b)**, `hooks.ts:793-798` — the `[\s;&\|<>()"']+` split tears `C:\Users\John Smith\…` into two words and turns the whole Bash arm off for that operator. **No register owner — see WARNING W2.** |
| T-P24-14 | DoS | mitigate + accept — **owner: hive maintainer** | **CLOSED (accepted)** | mitigated by per-payload memo + `HOOK_RESOLVE_BUDGET_MS` (deny on crossing, `:891-897`); residual `budget + one in-flight resolve` named as ceiling **(f)** `:806-812`, in the SUMMARY, and as register row **A16** |
| T-P24-15 | EoP | accept, NARROWED — **owner: a follow-up plan holding `src/main/hooks.ts`** | **CLOSED (accepted)** | the `<hive>/bin` half is genuinely **closed**: `binEntryIdentities` `:1138-1155` is a **recursive** stack walk (`if (entry.isDirectory()) { stack.push(full); continue; }`), consulted only for `nlink > 1n` `:1032-1039`, bounded by `HOOK_BIN_SCAN_MAX` which returns `null` → `DENY_BIN_SCAN`. Test 25 covers `bin/runtime` explicitly. `.git`/other-agent halves named as ceiling **(c)** and register row **A17** |
| T-P24-16 | EoP | mitigate | **CLOSED** | `driveRelative` `hooks.ts:216-220` — both halves: `/^[A-Za-z]:[^\\/]/ && /[\\/]/` (drive-relative) and `/^[\\/][^\\/]+[\\/]/` (rooted-relative, which is REDTEAM5's B5-03). `DENY_FRAME` returned at `:864` before any resolve. Test 18 covers ordinary colon words. FP surface as register row **A18** |
| T-P24-17 | DoS | accept | **CLOSED (accepted)** | (i) `containment` returns `DENY_UNIDENTIFIABLE` when nothing in the chain stats `:1084`; (ii) `hiveIdentities` returns `null` on a rootless-id volume `:983` → `DENY_NO_STABLE_ID` `:869`. Register rows **A19** + **B1** |
| T-P24-SC | Tampering | mitigate | **CLOSED** | `git log --oneline -20 --name-only \| grep -c 'package.json'` → **0**. No dependency moved in the gap wave |

### REDTEAM5-SEC's three 01-24 blockers, re-checked against shipped code

`01-REDTEAM5-SEC.md` (independent, run at plan-revision `3c10fe1`) filed three blockers.
All three are fixed in the shipped file:

| Blocker | Fix at HEAD |
|---|---|
| **B5-01 CRITICAL** — hard-link `readdir` one level deep, so `<hive>/bin/runtime/node` (on every agent PTY's PATH) was an ALLOW | `binEntryIdentities` is a **recursive** stack walk (`hooks.ts:1138-1155`); test 25's title names `bin/runtime` |
| **B5-02 HIGH** — un-created tail listed three literals, four are protected; `<hive>/hooks.sock` flipped DENY → ALLOW while absent | `rootTailVerdict` compares **four**: `bin`, `.git`, `ids.sockName`, `agents` (`hooks.ts:1119-1130`); the comment says *"Four, not three"* and names the 10 s watchdog window as the reason |
| **B5-03 HIGH** — rooted-relative `\bin\…`, `isAbsolute` says true, lands a real file | second half of `driveRelative` (`hooks.ts:219`), documented as framing case 2 at `:198-203` |

## 2.2 `src/main/telemetry.ts` — the OTLP collector (plan 01-25)

### The telemetry token is provably a different secret from the hook token

Two independent registries, two independent mints, no shared state:

| | Hook socket | Telemetry |
|---|---|---|
| Registry | `HookServer.tokens` (`hooks.ts:497`) | `TelemetryCollector.otelTokens` (`telemetry.ts:215`) |
| Mint | `mintToken` `hooks.ts:686` — `randomBytes(32).toString('hex')` | `mintAgentToken` `telemetry.ts:265` — its own `randomBytes(32).toString('hex')` |
| Env var | `HIVE_SOCK_TOKEN` (`pty.ts:775`) | `OTEL_EXPORTER_OTLP_{METRICS,LOGS}_HEADERS` (`pty.ts:796-797`) |
| Revoke | `revokeToken` (token-exact) | `revokeAgentToken` (token-exact) |

Pinned by `telemetry-auth.test.cjs` test 17 — *"the telemetry token is NOT the hook
token — this is the whole redesign"* — green.

### It does not ride the generic variable

```
$ grep -rn 'OTEL_EXPORTER_OTLP_HEADERS' src/
(no output)
$ grep -rn 'OTEL_EXPORTER_OTLP_METRICS_HEADERS\|OTEL_EXPORTER_OTLP_LOGS_HEADERS' src/
src/main/pty.ts:796:              OTEL_EXPORTER_OTLP_METRICS_HEADERS: `x-hive-otel-token=${otelToken}`,
src/main/pty.ts:797:              OTEL_EXPORTER_OTLP_LOGS_HEADERS: `x-hive-otel-token=${otelToken}`
```

The generic var appears **nowhere** in `src/`. This is the control that matters against
this threat actor: the generic variable is read by every OTel SDK in every language for
every signal and is inherited by every grandchild, so an agent running `npm test` in a
repo with its own OTel-to-vendor configuration would forward our header to that vendor.
Pinned by test 18 (*"the GENERIC ... is never set"*) and test 19 (*"ours is set LAST"*).

### The token gate resolves before the body is consumed

`telemetry.ts:391-392`:

```ts
const agentId = this.agentForToken(req.headers['x-hive-otel-token']);
if (!agentId) { this.refuse(res); return; }
```

`agentForToken` (`:428-432`) fails closed on an absent header, an unknown/stale token
**and an empty registry**. Attribution is derived from the token; the payload's own
`agent.id` is never read on this path. Tests 1–7 drive all three failure modes plus the
POINT-attribute and RESOURCE-attribute claim paths separately.

### The composite session key matches `hive.ts`

`telemetry.ts:158-160` → `` `${agentId}\u0000${sessionId}` ``. `hive.ts:2913`
`applyCostRow` → `` `${row.agent_id ?? ''}\u0000${row.session_id ?? ''}` ``. **Same
`\u0000` separator.** Five `this.sessions` sites all route through `sessionKey`
(`:346`, `:563`, `:564/567`, `:596`, `:598`). Injectivity is pinned separator-independently
by test 9, which asserts the property *without naming the separator* — so the pin
survives a separator change.

### `SPAWN_SAFE_SESSION_ID` — I ran the regex myself

```
$ node -e '<regexes from src/main/transcript.ts:76 and :102>'
REFUSE  SPAWN | VALID=accept  --dangerously-skip-permissions
REFUSE  SPAWN | VALID=accept  --print
REFUSE  SPAWN | VALID=accept  --permission-mode
REFUSE  SPAWN | VALID=accept  --continue
REFUSE  SPAWN | VALID=accept  --strict-mcp-config
REFUSE  SPAWN | VALID=accept  -c
REFUSE  SPAWN | VALID=accept  -
--- subset check over a fuzz corpus ---
subset violations: 0
129-char id: false 128-char: true
```

All seven flag shapes are **refused** by `SPAWN_SAFE_SESSION_ID`
(`/^(?![-_])[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/`) and **accepted** by
`VALID_SESSION_ID` — which is precisely why the narrower validator had to exist. The
subset property (`SPAWN_SAFE ⊂ VALID`) holds over an exhaustive 1–3 character corpus
drawn from `{A,a,0,_,-}`: **0 violations**.

**`VALID_SESSION_ID` is unchanged in behaviour.** `git log -L 76,76:src/main/transcript.ts`
shows the only edit in the gap wave was adding the `export` keyword:

```
- const VALID_SESSION_ID = /^[A-Za-z0-9_-]+$/;
+ export const VALID_SESSION_ID = /^[A-Za-z0-9_-]+$/;
```

The pattern bytes are identical. Test 26 pins that a 200-char id and a leading `_` still
resolve through `transcript.ts`, so the path-component rule did not tighten.

**Four sinks, all present:**

| Sink | Site |
|---|---|
| 1 — Claude resume branch | `src/main/index.ts:3310` |
| 2 — generic resume branch | `src/main/index.ts:3352` |
| 3 — OTel producer / breaker beat | `src/main/index.ts:1649` |
| 4 — hook writer → `hive.recordSession` | `src/main/hooks.ts:1211` |

Test 31 asserts the guard is **imported, not redeclared**, in both sink files — which is
what stops a fifth copy drifting.

### Per-threat verdicts (01-25)

| ID | Cat | Disp | Verdict | Evidence |
|---|---|---|---|---|
| T-P25-01 | Spoofing | reduce | **CLOSED (reduced)** | `telemetry.ts:391`; tests 1–5. Residual (same-uid env read) is GATE-01's recorded ceiling, `REQUIREMENTS.md:569` + `telemetry.ts:37-41` |
| T-P25-02 | DoS | reduce | **CLOSED (reduced)** | tests 4, 5 — the fabricated sample never reaches `aggregateLive` for an unowned agent |
| T-P25-03 | DoS | reduce | **CLOSED (reduced)** | tests 6, 7. **Unclosed half named, not claimed:** A can forge a 401 for *itself* and `accountPool` kills every sibling on that shared account → register row **A22** with an owner |
| T-P25-04 | Tampering | mitigate | **CLOSED** | composite key at all five sites; tests 8, 9, 11 |
| T-P25-05 | EoP | reduce | **CLOSED (reduced)** | four sinks above; my own regex run; tests 23–31. Pre-existing poisoned-id residual → register row **A21** |
| T-P25-06 | Info disc | mitigate | **CLOSED** | separate secret + per-signal-only vars, both proven above; tests 16, 17, 18 |
| T-P25-07 | Info disc | mitigate | **CLOSED** | `refuse()` `telemetry.ts:440-455` prints event, count and diagnosis — never the token, never the payload's claimed id |
| T-P25-08 | DoS | reduce | **CLOSED (reduced)** | ours set LAST (test 19); real round-trip against a live collector (test 22); throttled `console.error` whose first named cause is SDK non-forwarding. Residual (invisible in a packaged app) → operator-blocked row **C5** |
| T-P25-09 | Repudiation | mitigate | **CLOSED** | `grep -c 'mirrors.*slack\.ts' src/main/telemetry.ts` → 0; the header at `:28-41` now states the capability model **and both ceilings**; test 15 machine-checks both directions, so deleting the comment does not pass |
| T-P25-SC | Tampering | mitigate | **CLOSED** | `package.json` untouched |

## 2.3 `src/main/hive.ts` — `redactSecrets` and the commit scrub (plan 01-26)

### Pattern 5 is byte-frozen, and the freeze is pinned

`test/voice-messages.test.cjs:547` holds `FROZEN_PATTERN_5` as a literal string captured
from `src/main/hive.ts` before the plan ran; `:549` normalises the live statement out of
the source and asserts `strictEqual`. Green. The two new arms are separate statements
**after** pattern 5 (`hive.ts:463-464`), never appended inside pattern 3's alternation —
which the plan measured as losing 20 bytes of a following `sk-ant-` key in plaintext.
The 38-row regression battery (`:340-344`) plus the two-armed LOCKSTEP guard
(behavioural + normalised-text) are all green.

### The five ACTIVE bypasses — each verified genuinely open AND genuinely documented

I did not take the ceiling comment's word for any of these. Bypasses 1 and 4 were run
live against the shipped `redactSecrets`:

```
$ node -e "<loadTs('src/main/hive.ts').redactSecrets over 5 shapes>"
UNREDACTED(open) B1 chunked across the line  ->  const A = "sk_live_" + "51Hxxxxxxxxxxxx";
REDACTED         B1 control, one line        ->  const KEY = "[redacted]";
UNREDACTED(open) B4 quoted-key JSON          ->  {"token": "abcdef1234567890"}
UNREDACTED(open) B4 bracket assignment       ->  obj["token"] = "abcdef1234567890"
REDACTED         control bare key=value      ->  token=[redacted]
```

| # | Bypass | Genuinely OPEN — evidence | Genuinely DOCUMENTED — evidence |
|---|---|---|---|
| 1 | line-chunking | run above: chunked shape survives, single-line control redacts. Mechanism: `addedLines` joins `+` lines with `\n` (`hive.ts:3341-3342`) so no pattern spans a break | `hive.ts:3259-3268` with **both** measured strings; `REQUIREMENTS.md:577` FLOOR-04 row |
| 2 | `SECRET_SCAN_MAX_LINES` | `hive.ts:3357-3361` — `if (changed > SECRET_SCAN_MAX_LINES) { warn; appendLog; return true; }` — commits **UNSCANNED**. `seq 20001 > pad.txt` is one agent command | `hive.ts:3269-3271` with the exact command; FLOOR-04 row |
| 3 | `SECRET_SCAN_MAX_BYTES` | `hive.ts:3375` — `diff.out.slice(0, SECRET_SCAN_MAX_BYTES)`; everything past the cut is never scanned | `hive.ts:3272-3273`; FLOOR-04 row |
| 4 | quoted-key JSON | run above: both `{"token": "…"}` and `obj["token"] = "…"` survive. Pattern 5 requires `(\s*[:=]\s*)` adjacent to the key; the closing quote and `]` break it | `hive.ts:3274-3288`, **with the rejected arm's real cost** (+2 detections vs 2 permanent FPs, 0 additional paths over 400 commits); FLOOR-04 row |
| 5 | `printf '* -diff' > .gitattributes` | `hive.ts:3355` — `changed += (Number(added) \|\| 0) + (Number(deleted) \|\| 0)`; a binary numstat row is `-`/`-`, `Number('-')` is `NaN`, so `changed` stays 0, the line-cap branch never fires, `addedLines` is empty, and `scrubStagedSecrets` returns `true` having scanned nothing — **no warning, no log row** | `hive.ts:3289-3296` with the exact command, explicitly beside HEAD's binary-blob sentence it escalates; FLOOR-04 row |

All five carry an owner via the FLOOR-04 requirement row's owner cell: *"a follow-up plan
holding `src/main/hive.ts` + `test/voice-messages.test.cjs`, plus the operator for the
live clause."*

### The "single committer" premise is confirmed false, and confirmed recorded

```
$ grep -Fc 'Bash(git commit' src/main/hive.ts   →  0
$ grep -Fc 'Bash(git add'    src/main/hive.ts   →  0
```

I read `AGENT_DENY_RULES` in full (`hive.ts:497-533`). It denies destructive git
(`push --force`, `reset --hard`, `clean -f/-d/-x`), recursive force-delete, privilege
escalation and credential paths. It contains **no** `git add`, `git commit` or `git -C`
rule, so an agent can run `git -C "$HIVE_ROOT" add -A && git -C "$HIVE_ROOT" commit -m x`
and never reach `flushCommit` or the scrub at all. Recorded at `hive.ts:3231` and as
register row **A14** with an owner.

### Per-threat verdicts (01-26)

| ID | Cat | Disp | Verdict | Evidence |
|---|---|---|---|---|
| T-P26-01 | Info disc | mitigate | **CLOSED** | two `s = s.replace(` statements at `hive.ts:463-464`, both with a **required** vendor segment (`sk_(?:ant\|live\|test\|proj)_`, `rk_(?:live\|test)_`), placed after pattern 5 |
| T-P26-02 | DoS / data loss | partial mitigate + document | **CLOSED (partial, accepted)** | `desk-`/`task-`/`risk-` fixed by the `\b` on the **bare** `sk-` arm only (`hive.ts:429`); remaining 65-path channel is register row **A12** with an owner and a published number |
| T-P26-03 | Info disc | accept + document | **CLOSED (accepted)** | bypass 1 above |
| T-P26-04 | DoS → Info disc | accept + document | **CLOSED (accepted)** | bypasses 2 + 3 above |
| T-P26-05 | Tampering | mitigate | **CLOSED** | LOCKSTEP: statement-count arm + behavioural arm + normalised-text arm, all green |
| T-P26-07 | DoS | mitigate | **CLOSED** | token-exact revocation guarded by the spawn closure's own token; `test/hive-proxy-token.test.cjs` green in the full run |
| T-P26-08 | Repudiation | mitigate | **CLOSED** | ceiling restated at `hive.ts:3247-3345`: HEAD's binary-blob sentence **kept** (`"Binary blobs produce no + lines and are never scanned."`), five bypasses named as commands, false premise recorded, FP rate as a number (48/400 commits, 65 distinct paths), rejected JSON arm with its cost |
| T-P26-09 | Info disc | mitigate | **CLOSED** | `FROZEN_PATTERN_5` byte-freeze + 38-row battery + LOCKSTEP statement count |
| T-P26-10 | Info disc | accept + document | **CLOSED (accepted)** | bypass 4 above |
| T-P26-11 | Info disc | accept + document | **CLOSED (accepted)** | bypass 5 above |
| T-P26-12 | EoP | accept + document | **CLOSED (accepted)** | greps above; `hive.ts:3231`; register row **A14** |
| T-P26-SC | Tampering | mitigate | **CLOSED** | `package.json` untouched |

**REDTEAM5-SEC B5-04** (the `\b` losing OpenAI keys after a word character) was resolved
by *narrowing rather than reverting*: `sk-ant-`, `sk-proj-` and `sk-svcacct-` are
**unbounded** in the shipped alternation (`hive.ts:430`), so only a legacy **bare**
`sk-<alnum>` residue is affected — 15 measured losses reduced to 5, declared, pinned as
`C1_DECLARED_LOSS`, with the measured upgrade path (`(?<![a-z])sk-`) recorded as register
row **A13** with an owner. That is an acceptable resolution of a HIGH; shipping it
silently would not have been.

## 2.4 `src/main/breaker.ts` (plan 01-27)

The 80–100% band no longer masks the arms below it. `breaker.ts:377-433`: the band
writes `softTrip` and **falls through**; per-agent cap, floor cost cap, floor token cap,
velocity and no-progress all still run; `return softTrip ?? { tripping: false }` is the
last line. Past 100% still returns immediately with **no** ceiling (so it reaches
`constrained` on the next beat), which is the intended asymmetry.

| ID | Cat | Disp | Verdict | Evidence |
|---|---|---|---|---|
| T-P27-01 | EoP | mitigate | **CLOSED** | `breaker.ts:377`, `:384`, `:433` |
| T-P27-02 | DoS | accept | **CLOSED (accepted)** | the stateful `s.noProgressBeats += 1` (`:422`) now advances for a band-only agent — deliberate, `hardStop: false` (`:91`) caps the ladder at `constrained`. Register row **B3** |
| T-P27-03 | DoS | mitigate | **CLOSED** | negative control in `breaker.test.cjs`, green |
| T-P27-04 | Tampering | mitigate | **CLOSED** | `loadQueue` `delivery.ts:411-418` — non-`ENOENT` sets `queue = null`, `queueFile = null`, `queueReadError = why`, returns `[]`; `saveQueue`'s `if (!path) return` then short-circuits so the emptiness is never written over a good file |
| T-P27-05 | Tampering | mitigate | **CLOSED** | positive control in `delivery-main.test.cjs`, green |
| T-P27-06 | Repudiation | mitigate | **CLOSED** | `delivery.ts:489` — `this.queueReadError ?? 'no harness home — nowhere durable to park this'` |
| T-P27-07 | Repudiation | mitigate | **CLOSED** | `delivery.ts:405-407` counts and logs `queue load dropped N of M rows — wrong shape` |
| T-P27-08 | Repudiation | mitigate | **CLOSED** | `delivery.ts:373-390` and the breaker budget block `:345-376` both describe the shipped code |
| T-P27-SC | Tampering | mitigate | **CLOSED** | `package.json` untouched |

## 2.5 `src/main/delivery.ts` + the quiesce discriminator (plans 01-27, 01-28)

A queue that cannot be READ is no longer EMPTY — verified above. The quiesce emit
carries the discriminator at source:

```ts
// delivery.ts:728
this.deps.emit('hive:hookEvent', { agentId: a.agentId, event: 'Stop', blocked: false, synthesized: true });
```

The renderer guard keys on **source**, not status —
`src/renderer/src/hooks/useHive.ts:174`:

```ts
if (e.synthesized && self?.status === 'blocked') return { patch: null, clearBreaker: false };
```

A **real** Stop (no `synthesized`) still idles and still clears the breaker, so a
falsely-blocked agent is not wedged out of its own paint forever. The comment at
`delivery.ts:717-724` records why the discriminator must come from main: `hooks.ts`'s
real Stop emit sends byte-equivalent payloads, so no renderer-side shape heuristic could
tell them apart.

### The two ACCEPTED quiesce residuals have owners

`01-28-SUMMARY.md` `## Quiesce residuals — ACCEPTED, not fixed` records both **(a)** the
unrecoverable post-last-Stop false `blocked` and **(b)** `setStatus?.(id,'idle')` being
called unconditionally at `delivery.ts:715`. Both name **Owner: plan 01-31's residual
register** — and I verified that hand-off actually landed rather than dangling:
`REQUIREMENTS.md:656` row **A23** carries both, re-homed to *"a follow-up plan holding
`src/main/delivery.ts` and `src/renderer/src/hooks/useHive.ts`. **NOT the operator**"*.
That register's own preamble forbids *"an operator has to look at it"* as an owner for
anything measurable from source, and it enforced it here.

| ID | Cat | Disp | Verdict | Evidence |
|---|---|---|---|---|
| T-P28-01 | Tampering | mitigate | **CLOSED** | `queueOp` returns main's `QueueResult`; composer clears only on `ok`; `renderer-queue.test.cjs` green |
| T-P28-02 | Repudiation | mitigate | **CLOSED** | five `{ok:false}` reasons surfaced through `statusHint`, attributed to main |
| T-P28-03 | DoS | mitigate | **CLOSED** | `useHive.ts:174` |
| T-P28-04 | DoS | mitigate | **CLOSED** | same guard keys on `e.synthesized`, so a REAL Stop still idles |
| T-P28-05 | DoS | mitigate | **CLOSED** | the single breaker clear is skipped only for synthesized+blocked |
| T-P28-06 | Repudiation | accept + document | **CLOSED (accepted)** | main holds no blocked status to filter on; residual is register row **A23(b)** with an owner |
| T-P28-07 | Tampering | mitigate | **CLOSED** | `grep -rn persistQueues src/` → 0; roster publication is a one-shot consumed only by a successful write |
| T-P28-08 | Tampering | mitigate | **CLOSED** | op-reply path routes through `setQueues` |
| T-P28-SC | Tampering | mitigate | **CLOSED** | `package.json` untouched |

## 2.6 Plans 01-29, 01-30, 01-31

| ID | Disp | Verdict | Evidence |
|---|---|---|---|
| T-P29-01/02/03 | mitigate | **CLOSED** | `hasBypassFlag` whole-token matcher + explicit empty-flag guard, `src/renderer/src/store/autoMode.ts:36-39/:96`; `renderer-components.test.cjs` green |
| T-P29-04 | accept | **CLOSED (accepted)** | deliberate over-report in the fail-safe direction; register row **B5** |
| T-P29-05 | accept | **CLOSED (accepted)** | `opencode`'s bypass is baked into `OPENCODE_CONFIG_CONTENT` at spawn (`index.ts:3456`); register row **A27** with an owner |
| T-P29-06 | accept | **CLOSED (accepted)** | `autoFlag` vs `autoModeFlag` guarded by an all-preset equality assertion; `autoMode.ts:84` names the field read; register row **A28** |
| T-P29-07/08 | mitigate | **CLOSED** | chip `maxWidth` guards; three-clause cross-file `MIN_WIN` pin, green |
| T-P29-09 | reduce | **CLOSED (reduced)** | reachability bound removes the 1024–1279 band; persisting rescue path is register row **A29** with an owner |
| T-P30-01 | mitigate | **CLOSED** | runner-counted skips; `# skipped 7` in the live gate |
| T-P30-02 | mitigate | **CLOSED** | comment-stripped assignment-shaped `sock_token` match proven RED by a mutation loop over all six templates; `engine-parity.test.cjs:288` |
| T-P30-03 | mitigate | **CLOSED** | byte-exact equality on the CI test step's `run`; `ci-config.test.cjs` green |
| T-P30-04 | mitigate | **CLOSED** | `release.yml:166` hashes `*.dmg *.zip *.exe *.AppImage *.blockmap latest*.yml` — the same set `:184-188` uploads. `latest*.yml` is the electron-updater feed carrying the sha512 the updater validates against, so this was the one path with no provenance |
| T-P30-05 | mitigate | **CLOSED** | the tripwire is split — `installers=` at `release.yml:161` is checked separately from `files=` at `:166`, so a widened hash set cannot disarm it |
| T-P30-06 | mitigate | **CLOSED** | root `SECURITY.md` states scope, that verification is a manual action, and that pre-change releases carry an unattested feed |
| T-P30-07 | accept | **CLOSED (accepted)** | register row **A34** with an owner |
| T-P30-08 | accept | **CLOSED (accepted)** | verified genuinely open: `if-no-files-found: warn` still at `release.yml:189`; register row **A33** with an owner |
| T-P31-01…09 | mitigate | **CLOSED** | `test/repo-claims.test.cjs` green in the full run; the residual register exists at `REQUIREMENTS.md:618` with 35 code residuals / 5 behaviour changes / 8 operator-blocked, **every row carrying a named owner**; the skip ceiling is measured, named member-by-member and re-frozen at `≤ 7` (`01-VALIDATION.md:57-101`) |
| T-P29-SC / T-P30-SC / T-P31-SC | mitigate | **CLOSED** | `package.json` untouched across the wave |

---

# 3. CLOSED — the security cluster in plans 01-01 … 01-23

Nineteen rows individually re-derived at source in this audit. These are the rows on the
attacker's actual path; the rest of the early register is §4.

| ID | Plan | Cat | Disp | Verdict | Evidence |
|---|---|---|---|---|---|
| T-P02-01 | 01-02 | Spoofing | mitigate | **CLOSED** | `authorized()` `hooks.ts:742-756` derives the agent from the token via `Map.get`; `payload.agent_id` is never read for identity. Enforced at the socket, not in `handle` |
| T-P02-02 | 01-02 | Spoofing | mitigate | **CLOSED** | `grep -c 'process.env.HIVE_SOCK_TOKEN *=' src/main/index.ts` → **0**. Per-spawn mint at `pty.ts:775`, set LAST so nothing upstream can shadow it |
| T-P02-03 | 01-02 | Spoofing | mitigate | **CLOSED** | sidecar spawn `hive.ts:1368` — `HIVE_SOCK_TOKEN: token` placed after the `...process.env` spread, with the comment naming why |
| T-P02-04 | 01-02 | Spoofing | mitigate | **CLOSED** | `hooks.ts:724-731` — a plain `Map.get` with the reasoning written down (a hash lookup has no per-byte compare to leak a prefix and no `.length` shortcut). The other four surfaces use `timingSafeEqual` over SHA-256'd fixed-length inputs: `index.ts:2399`, `integrationBroker.ts:157`, `slack.ts:326/527`, `webhook.ts:400`. Pinned by `net-binding.test.cjs` tests 40–43 |
| T-P02-07 | 01-02 | EoP | accept | **CLOSED (accepted)** | rationale in shipped source `hooks.ts:39-41` — no supported Node API for the socket fd / pipe handle (nodejs/node#7627), so it means authoring and ABI-rebuilding a native addon on three CI gates |
| T-P02-08 | 01-02 | Tampering | accept | **CLOSED (accepted, under-documented)** | see WARNING **W3** |
| T-P02-09 | 01-02 | Tampering | mitigate | **CLOSED (superseded)** | the original mitigation (`realResolve` + `within` string comparison) is **gone**: `grep -c 'realResolve\|function within(' src/main/hooks.ts` → **0**. Replaced by 01-24's identity gate, which is strictly stronger — §2.1 |
| T-P02-11 | 01-02 | EoP | accept | **CLOSED (accepted)** | named **by threat ID** in the shipped ceiling: `hooks.ts:824-825` — *"it does not exist at all for an engine with no PreToolUse hook (T-P02-11)"* |
| T-P02-12 | 01-02 | DoS/EoP | mitigate | **CLOSED** | `armSocketWatchdog` `hooks.ts:630-637` + `checkSocket` `:639-671`: inode-compare every `socketWatchdogMs`, loud `hook socket GONE` on absence, re-listen. POSIX-only by design (win32 `sockPath()` is a `\\.\pipe\` name with no filesystem entry) |
| T-P02-13 | 01-02 | Spoofing/EoP | mitigate | **CLOSED** | same `checkSocket`: a **different** inode on our path logs `hook socket REPLACED`, `rmSync`es it and re-takes. The re-take race is admitted in the message rather than hidden |
| T-P03-03 | 01-03 | Spoofing | mitigate | **CLOSED** | `hive.ts:2045` — `const reviewer = this.leastLoadedIdle([task.assignee]);` excludes the assignee |
| T-P04-02 | 01-04 | Spoofing | mitigate | **CLOSED** | root `SECURITY.md` states the unsigned-Windows-binary posture; `T-P30-06` re-pins it |
| T-P04-03 | 01-04 | EoP | mitigate | **CLOSED** | `release.yml:12-13` workflow-level `contents: write`; the publish job narrows to `contents/id-token/attestations: write` at `:199-202` with per-permission reasons |
| T-P06-09 | 01-06 | Spoofing | mitigate | **CLOSED** | verified not a no-op — `hive.ts:1367-1368` places `HIVE_SOCK_TOKEN` **after** the spread, and `stdio: ['ignore','pipe','ignore']` keeps the sidecar off the agent's terminal |
| T-P08-05 | 01-08 | EoP | mitigate | **CLOSED** | `delivery.ts:481-484` — `if (this.deps.knownAgent && !this.deps.knownAgent(agentId)) return { ok:false, error: 'unknown agent: …' }`, **wired at the composition root** `index.ts:498`, exercised by `delivery-main.test.cjs:511` |
| T-P10-01 | 01-10 | Info disc | partial + doc | **CLOSED (partial, accepted)** | `MemorySettings.scope` / `MemoryScope` `memory.ts:74/:87`; sharing model stated at `:10-20`; reported through `status().scope` so the UI can say so |
| T-P10-02 | 01-10 | Info disc | mitigate | **CLOSED** | same — the default is surfaced rather than implicit |
| T-P11-01 | 01-11 | Info disc | mitigate | **CLOSED (superseded)** | `scrubStagedSecrets` `hive.ts:3340`, called from inside `flushCommit`'s retry loop at `:3437`; `hive-durability.test.cjs` tests 7, 8, 9 green against a real temp git repo |
| T-P11-02 | 01-11 | Info disc | accept + doc | **CLOSED (accepted, superseded)** | superseded by 01-26's FLOOR-04 restatement, which is far more specific — five named bypasses with commands, a measured FP rate, and an owner |
| T-P13-06 | 01-13 | Spoofing | mitigate | **CLOSED** | `notifyBlocked` `hooks.ts:1433-1441` resolves the renderer-supplied id against the live registry and **returns** if absent, with the threat ID cited in-source at `:1435`. Title, body and click target are all chosen in main |

---

# 4. NOT INDIVIDUALLY RE-VERIFIED — 184 rows

The remaining 184 rows in plans 01-01 … 01-23 were **not** individually re-derived by
this audit. They are recorded here rather than counted as closed, because a SUMMARY
claim is not evidence.

**Category mix of the 203 early rows:** Repudiation 87 · Tampering 41 ·
Information disclosure 31 (predominantly legibility / accessible-name pins, not
credential exposure) · Denial of service 30 · Spoofing 8 · Elevation of privilege 4 ·
mixed 2. The 19 rows on the attacker's path are in §3; what remains is dominated by
documentation-drift and UI-legibility threats.

**Supporting evidence gathered, stated at its real strength.** Of the 203 early rows,
88 name a checkable code symbol in their register cell. A mechanical presence check
against every `.ts/.tsx/.cjs/.mjs/.js/.yml/.json/.md/.html/.css` file in the tree
(excluding `node_modules`, `.git`, `dist`, `out`, `.planning`) found **77 with every
named symbol present at HEAD**, 4 partial and 7 with none. All 11 misses are prose or
shell artefacts, not absent code: `$SHAS` (a shell variable inside a plan's verification
command, ×7), `EADDRINUSE`, `eslint-formatter-compact`, `package-lock.json`,
`docs/adr/....md`. Additionally, every plan's declared pins run inside the 634-test
suite, which is `# fail 0`.

**Why that is not "CLOSED".** A symbol existing proves the mitigation was written; it
does not prove it is wired at every entry point, and it cannot demonstrate that the
attack fails. Under the standard this audit applies to §2 and §3, these rows are
**unverified**, and `threats_closed` does not include them.

**To close them:** a follow-up pass that, for each row, locates the mitigation call
site and runs the plan's named negative test selector. Roughly 60% are UI-legibility
pins (`T-P1x-01/02/90` families) that share four test files, so the real work is smaller
than 184 suggests.

---

# 5. WARNINGS — not blockers

## W1 — plan 01-24 has no `## Threat Flags` section, and it is the highest-risk plan of the wave

`grep -c '^## Threat Flags' 01-24-SUMMARY.md` → **0**, and there is no equivalent
heading. 01-27 and 01-28 also lack the exact heading but carry
`### No stubs, no new threat surface` with the same declaration; 01-25, 01-26, 01-29,
01-30 and 01-31 all carry `## Threat Flags` reading *"None."*

01-24 does record its surface change elsewhere — `## The one deliberate ALLOW → DENY
behaviour change`, `## Accepted residuals`, `## The three prohibitions` — so this is a
process gap, not evidence of unmapped surface. No new network endpoint, auth path or
trust-boundary schema appears in the 01-24 diff. **Unregistered flags found: none.**

## W2 — three accepted threats have no owner in the residual register

`T-P24-07`, `T-P24-10` and `T-P24-13` are all `accept`. All three are absent from
`01-24-SUMMARY.md`'s `## Accepted residuals` section (which covers T-P24-12/14/15/16/17
with owners) and absent from `REQUIREMENTS.md:618`'s A/B/C register.

T-P24-07 and T-P24-13 **are** documented in shipped source (`hooks.ts:600` and ceiling
item `(b)` at `:793-798`), so they are CLOSED; they simply have no owner. T-P24-10 is
documented **nowhere**, which is why it is the one OPEN item in §1.

01-24's own SUMMARY states the rule these break: *"a residual recorded only in a source
comment or only in the plan's threat table is invisible to it."*

## W3 — `T-P02-08` (hook payload replay) is accepted with no replay-specific statement in source

`grep -in 'replay' src/main/hooks.ts` → **no output**. The file's ceiling at `:22-32`
does claim exactly two properties and explicitly disclaims everything else, which covers
replay by construction — but it never names it. `telemetry.ts:37-40` names its own
no-replay-window residual explicitly; the hook socket does not. One sentence in the
`hooks.ts` ceiling closes it.

---

# 6. Standing residuals this audit confirms are still LIVE

## GATE-01 clause 2 — NOT TICKED, and this audit does not tick it either

GATE-01 reads *"…**and** the token that authenticates the socket is not readable from
any agent's shell."* That clause is **still false on Linux**. Both credentials live in
the agent's own process environment; a same-uid sibling reads `/proc/<pid>/environ`.
The ceiling is written into the shipped source rather than papered over:

* `src/main/hooks.ts:27-32` — *"It is NOT 'agent A cannot authenticate as agent B' —
  that sentence is false on Linux. B's token lives in B's process environment (pty.ts
  spreads it into the PTY), so a same-uid sibling reads /proc/&lt;B-pid&gt;/environ;
  AGENT_DENY_RULES covers no /proc path and B's pid is one `pgrep -f` away."*
* `src/main/telemetry.ts:37-41` — the same ceiling, cross-referenced to
  `REQUIREMENTS.md:569`.

Both 01-24 and 01-31 declined to tick GATE-01 for this reason. **So does this audit.**
Owner: GATE-02 (Phase 4), which is the child-env requirement.

## The three ceilings an operator must not be allowed to forget

1. **Unbounded hook connection count** (T-P24-12 / register A15) — `N × HOOK_LINE_MAX`,
   **≈384 MiB** at the 24-agent modelled floor, buffered **before** authentication
   (`buf += d.toString()` runs on every connection; `authorized()` only after a
   newline). `HOOK_LINE_MAX` is explicitly not the lever.
2. **A hard link into `<hive>/.git` or another agent's tree** (T-P24-15 / register A17)
   — the `<hive>/bin` half is genuinely closed, recursively; these two are not.
3. **Five active `redactSecrets` bypasses** (§2.3), each one agent command, one of which
   (`printf '* -diff' > .gitattributes`) is persistent and logs nothing at all.

---

# 7. Verdict

**`status: gaps_found`.**

The security-critical work of the gap-closure wave is real and it holds. The
`(dev, ino)` identity gate is a genuine mechanism replacement rather than another
enumeration round — I measured 20 spellings denied on this host with 16 of them
resolving to a real file, and the remaining ten shapes have their own green tests
including the hard link that no canonicalisation could have reached. The telemetry token
is provably a different secret from the hook token and provably does not ride the
generic OTLP variable. `SPAWN_SAFE_SESSION_ID` refuses all seven flag shapes that
`VALID_SESSION_ID` accepts, and the subset property holds under fuzz. The five FLOOR-04
bypasses are all genuinely open **and** all genuinely documented with an owner — I ran
two of them live rather than reading the comment.

One threat is OPEN, and it is a recording failure rather than a code failure:
**T-P24-10**, whose entire accepted-risk obligation was to write itself down, is written
down nowhere in the shipped tree.

Phase 01 is PARTIAL and unmerged; nothing here is in production. `threats_open: 1`
should be driven to 0 before PR #77 merges — it is a comment and a register row.

**Would I bet my pager on this verification surface?** For §2 and §3 — 104 rows, each
with a command run in this session — yes. For §4's 184 rows I would not, and this
document says so in its own frontmatter rather than in a footnote.
