# Red-team round 2, lens B — security efficacy + regression blast radius

**Target:** the eight REVISED gap plans `01-24-PLAN.md` … `01-31-PLAN.md`
**Tree:** branch `gsd/v1.0-milestone` @ `3051a47` (revisions `e513c83`, `97f6a82`, `197c291`, `02880cf`, `3051a47`)
**Round 1:** `01-REDTEAM-3-security.md` + `01-REDTEAM-5-regression.md` @ `a217018`
**Threat actor:** an LLM-controlled agent shell, same OS user, holding the app's env, able to read any file the user can, spawn processes, and open loopback connections. Not a remote attacker.
**Method:** read the live source each plan targets; execute the proposed logic (regexes, path resolution, cost) against real inputs on the operator's own Windows host. Everything marked **[demonstrated]** was reproduced by running it in this session; the exact commands are in the finding.

---

## VERDICT: **NOT CLEAN**

**7 BLOCKER · 7 HIGH · 6 WARNING.** Five of the seven blockers are NEW — introduced or left intact by revision 2 — and none of the seven is caught by any acceptance criterion in the set.

Two round-1 findings that were *cleared* as INFORMATIONAL are **false**, and the revised 01-24 explicitly forbids touching the code that would close them (*"do not touch `within` or `realResolve`"*). Two round-1 remediations were adopted at the level of prose but not at the level of the number that decides the behaviour.

---

## Round-1 blocker closure ledger

| Round 1 | Claim in revision 2 | Actually closed? |
|---|---|---|
| **B1** byte cap fails OPEN | cap + timeout write an explicit `permissionDecision: 'deny'` first | **Partly.** The written-deny path is correct. The *bound* is not: no `maxConnections`, no aggregate byte budget, and the mandated cap is >10 MB → **B2-03**. And the idle timeout is deliberately sized ABOVE the shim's own 5 s → the shim has already exited-0-as-allow before the deny is written → **B2-03b** |
| **B2** base set unimplementable | base 2 deleted, `payload.cwd` read absolute-only | **Partly.** Outage closed. But `payload.cwd` disarms the plan's own new fail-closed branch → **B2-04** |
| **B3** `VALID_SESSION_ID` accepts `--dangerously-skip-permissions` | `SPAWN_SAFE_SESSION_ID`, separate constant | **YES.** Table reproduced exactly; subset relation holds over 200 000 random inputs. See "Verified closed" §1 |
| **B4** forged 401 kills a shared account | disposition → `reduce`, residual named with anchors | **YES** (as a claim; the hole is honestly named, not closed) |
| **H1** hook token on `OTEL_EXPORTER_OTLP_HEADERS` | separate telemetry token, per-signal vars only | **YES** for the stated hole. Two new ones: **H2-01** (endpoint precedence) and **H2-02** (revoke races the flush) |
| **H2** wrong ceiling citation (GATE-02 vs `REQUIREMENTS.md:569`) | corrected | **YES** |
| **H3** `~` / `$HOME` bypass | `expandTilde` on the target + `HOME`/`USERPROFILE` in `expandHiveVars` | **YES** for those two spellings. Widens an unnamed sibling → **H2-05** |
| **H4** chunking not named in the ceiling | named, with measured evidence (0 hits chunked / 1 on one line) | **YES** |
| **M1** unbounded targets × 2 realpath climbs, fail-open by CPU | "cap the candidate targets, deny past the bound" | **NO — B2-02.** No number is chosen and no number exists that is both safe and non-breaking |
| **M2** per-signal header var precedence | both per-signal vars set, ours last | **Half.** Header axis closed; **endpoint** axis (`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`) left open → **H2-01** |
| **M3** unbounded session cardinality | not addressed anywhere in the set | **NO — H2-04.** Survives verbatim |
| **M4** 401 oracle vs 01-24's non-oracle posture | 01-24 records T-P24-07; 01-25 does not | Cosmetic. Accepted |
| **M5** validate at `recordSession` too | declined on file-ownership grounds, named as residual | **NO.** The residual's real consequence is unnamed → **H2-03** |
| **R-01** `DESIGN.md` unowned | declared in 01-25, both lines, in place; 01-29 clause 3 pins it | **YES.** Verified: `grep -c 1280 DESIGN.md` = 2, `grep -c 960` = 0, both at `:169`/`:677` |
| **R-02** splitter persists a shrunken width | adopted into 01-29 T3, `splitterReachableMax(vp, min)` reserving 48px | **YES.** At vp 1024 the bound is 976, so a 900px sidebar survives; splitter is unmounted below 1024 |
| **R-03/R-04/R-05** Pixi zoom, IDE 424, `clampBounds` | costed in 01-25 `<accepted_consequences>` | **YES** (costed, accepted, not fixed — the honest form) |
| **R-06/R-07** `sk[-_]` word boundary, value shape | `\b` + vendor body; value adjudicated in the replacement callback; 12 `assert.strictEqual` controls | **YES for the 12 named strings** [demonstrated 12/12 unchanged]. **NO overall — B2-06:** the value-shape rules delete four credential classes the matcher catches today |
| **R-08** malformed JSON out of the mail path | key quote gets its own group; `JSON.parse` asserted | **YES** [demonstrated: `{"token": "[redacted]", "keep": 1}` parses] |
| **R-09** inverted ceiling test has no specificity arm | positive control + specificity arm added | **YES** |
| **R-11** new test files in the poison loop | 01-26 states `voice-messages` stays hand-rolled | Partly; `test/telemetry-auth.test.cjs` / `test/hive-proxy-token.test.cjs` still unstated. WARNING |
| **R-12** telemetry blackout, silent | T-P25-08 `reduce`, throttled diagnosis, `MEASUREMENT UNAVAILABLE` recorded | Partly — the diagnosis names the wrong first cause for the two most likely real causes → **H2-01, H2-02** |
| **R-13** construction-order window | deleted by the redesign (collector owns its registry) | **YES** |
| **R-16** every `../` denied | base 2 deleted; six `../` negative controls mandated | **YES** |
| **R-17** the god's relative reads | explicit god allow/deny case added | **YES** |
| **R-18** unreachable "no base" branch | now reachable (relative registry cwd, no `payload.cwd`) | **YES** — but see **B2-04**, which makes it bypassable |
| **R-19** false doubled-side-effect claim | retracted in writing, "do not restore" | **YES** |
| **R-20** cap + timeout are new fail-open doors | see B1 | **Partly** |
| **R-21** quiesce guard wedges agents | `synthesized: true` on the emit, guard on SOURCE | **YES for the stated shape.** Premise partly false and one unrecoverable shape survives → **H2-06** |
| **R-22/R-23** breaker clear, `blockReason` | real Stop still clears `:533`; no assertion pins `blockReason` | **YES** |
| **R-24** `noProgressBeats` accrues | "byte-identical" withdrawn; consequence stated and pinned | **YES** |
| **R-25** transient read error → wrong error text | addressed in 01-27 | YES (not re-verified in depth — lens A/other) |
| **R-26/27/28/29** AUTO chip, pin brittleness | addressed in 01-29 | YES (not re-verified in depth) |
| **R-30** widened glob disarms the tripwire | `installers=` tripwire added, `contains: "*.blockmap latest*.yml"` | **YES** |
| **R-32/R-33** widened scan matches itself / `dist/` `out/` | explicit ROOT list, not a tree walk; two named exclusions with reasons | **YES** |
| **R-34** `.planning/codebase/` exempted | downgraded to a named residual (`CONCERNS.md:46`) | Not closed; honestly named. Accepted |
| **R-35** `DESIGN.md` unowned | now 01-25's | **YES** |

---

# BLOCKERS

## B2-01 — 01-24 Task 1: four Windows path spellings still walk straight past `denyReason`, and round 1 cleared all four as "no bypass" **[demonstrated]**

Round 1's INFORMATIONAL section states:

> *"`realResolve()` handles the path tricks … symlinks, post-resolution `..`, win32 8.3 short names (`HIVE~1`), and trailing-dot/space variants (`bin.`) all canonicalize … UNC and `\\?\` prefixes normalize through `path.resolve`/`relative` consistently on both sides of the comparison. **The defect is the missing base, not the resolution.**"*

**That paragraph is false**, and revision 2 acts on it: Task 1 instructs *"do not edit the four deny branches themselves and do not touch `within` or `realResolve`; the change is entirely above them."* So the plan pins the wrong half of the gate and leaves the resolution unfixed.

Run against a faithful copy of `realResolve` + `within` (`src/main/hooks.ts:126-147`, plain `realpathSync` per the import at `:68`) with a real hive-shaped tree created on this host:

```
protectedBin = C:\Users\Alienware\...\MarkXHarnessHome\hive\bin

plain absolute             DENIED
long-path prefix           *** ALLOWED ***  \\?\C:\...\hive\bin\cth-hook.cjs
device path                *** ALLOWED ***  \\.\C:\...\hive\bin\cth-hook.cjs
admin share                *** ALLOWED ***  \\localhost\C$\...\hive\bin\cth-hook.cjs
admin share (127.0.0.1)    *** ALLOWED ***  \\127.0.0.1\C$\...\hive\bin\cth-hook.cjs
forward slashes            DENIED
double sep                 DENIED
drive-relative C:x         DENIED
```

`path.win32.relative('C:\h\bin', '\\?\C:\h\bin\f')` returns the target **unchanged and absolute**, so `within()`'s `!isAbsolute(rel)` clause returns false. And the prefix is not cosmetic — it is a real write path:

```
fs.writeFileSync('\\\\?\\' + <hive>/bin/cth-hook-LPTEST.cjs, 'PWNED')
wrote via \\?\ -> true          ← the file landed in the REAL <hive>/bin
```

**The 8.3 short-name variant is worse, because it is live on the operator's own machine.** Node's `fs.realpathSync` (the JS implementation, which is what `hooks.ts:68` imports) does **not** canonicalize 8.3 aliases; only `fs.realpathSync.native` does:

```
realpathSync.native("C:\Users\ALIENW~1") = "C:\Users\Alienware"
realpathSync       ("C:\Users\ALIENW~1") = "C:\Users\ALIENW~1"    ← unchanged
```

so with the hive root spelled long (as `hive.root()` returns it) and the target spelled short:

```
protectedBin      = C:\Users\Alienware\...\MarkXHarnessHome\hive\bin
target (8.3)      = C:\Users\ALIENW~1\...\MarkXHarnessHome\hive\bin\cth-hook.cjs
realResolve       = C:\Users\ALIENW~1\...\MarkXHarnessHome\hive\bin\cth-hook.cjs
=> *** ALLOWED — 8.3 BYPASS ***
```

`C:\Users\ALIENW~1` is a genuine, resolvable alias on this host **today** (`realpathSync` on it succeeded), and `MEMORY.md`'s recorded harness home is under `C:\Users\Alienware`. This is not a laboratory shape.

**Blast radius:** every branch of `denyReason` — `<hive>/bin` (the shim every agent executes), `<hive>/.git` (a `core.hooksPath` that runs as a child of the MAIN process), and `<hive>/agents/<other>`. GATE-01's protected-path gate is off on Windows for any agent that writes `\\?\` in front of the path, and the exploit is one `Write` tool call with no shell involved.

**Required remediation:** normalise both sides in `realResolve` before comparing — strip a leading `\\?\` / `\\.\` (and reject or normalise `\\server\share`), and use `realpathSync.native` on win32 (or run the base through the same non-canonicalising path so the two sides agree). One function; the plan currently forbids touching it. Add each of the four spellings as a behaviour case in the `:250` test — the plan's nine existing cases and its four new deny cases all use the plain absolute form.

---

## B2-02 — 01-24 Task 1: the candidate-target cap has no safe value. An ordinary heredoc costs 400 ms of main-thread block; the padding attack still fails OPEN **[demonstrated]**

The plan's action: *"Add a module-level cap … when `targets.length` exceeds it **return a deny reason** rather than truncating … Pick a number with headroom over the 40-word negative control."*

`protectedPathDenial` (`hooks.ts:444-451`) pushes **every shell word** of a Bash command. Measured this session with the live split regex `[\s;&|<>()"']+` on real files from this repo:

```
   484 shell words   cat > src/renderer/src/components/SidebarSplitter.tsx <<'EOF' … (101 lines)
  2209 shell words   cat > src/main/transcript.ts <<'EOF' … (342 lines)
  2616 shell words   cat > README.md <<'EOF' … (331 lines)
   122 shell words   git add <120 files>
    19 shell words   a chained build command
```

A heredoc write is one of the most common shapes a coding agent emits. **A cap "with headroom over 40" denies every one of them**, with a message about hive-protected paths, for a command that touches none. That is R-16's failure class — an outage the operator cannot diagnose from the message — reintroduced by the fix for M1. The plan's only negative control is the 40-word command, so **no criterion catches it**.

Raising the cap does not rescue it, because the cost is per-word, not per-policy. Measured on this host with the live `realResolve`:

```
 2616 words × 2 bases:   400 ms   ← blocking, on the Electron MAIN thread
50000 words × 2 bases:  9323 ms   ← > the shims' own 5 s budget (hive.ts:3670)
```

400 ms of main-thread block per hook is a UI freeze and a queue behind which every other agent's PreToolUse waits. And at any cap above ~13 000 words, M1's original fail-open is unchanged: main blocks past 5 s, the shim's own `setTimeout(() => process.exit(0), 5000)` fires, **exit 0 with no stdout is `allow`** (`test/net-binding.test.cjs:279`) — and no deny main writes afterwards reaches anyone.

So the plan is pinned between an outage and a bypass and resolves it by deferring the number to the executor. That is the decision, not a detail.

**Required remediation:** stop paying `realResolve` per word. Filter to words that can plausibly be paths (contain `/`, `\`, or a `~`/`$` that expanded) *before* resolving, memoise `realResolve` per directory prefix within one payload, and only then cap — at a number derived from the measured cost, with a heredoc-shaped negative control (≥ 500 words) in the behaviour list.

---

## B2-03 — 01-24 Task 2: the byte cap bounds one connection and nothing else, and the mandated timeout sizing hands the attacker the fail-open for free

Two independent holes in the same fix.

**(a) No aggregate bound.** `listenOn` builds `createServer(...)` with no `maxConnections`, and the plan adds a **per-connection** cap sized *"ABOVE what this app itself permits a tool to move: `fs.ts:113` 2 MB … `:142` 10 MB … Do not copy `slack.ts`'s 1 MB."* So each connection may buffer >10 MB into a JS string in the main process, and nothing bounds how many connections exist. The threat actor spawns processes and opens loopback sockets by definition:

```sh
for i in $(seq 200); do (head -c 10000000 /dev/zero | tr '\0' 'a' | nc -U "$HIVE_SOCK") & done
```

2 GB of main-process string memory, no newline ever sent, no cap ever crossed. Main GCs to a standstill or dies; every real shim's own 5 s timer fires; **exit 0, no stdout, allow, floor-wide.** The revision raised the per-connection cap by 10×, which makes this cheaper than it would have been under round 1's sizing.

**(b) The timeout is sized to fire after the peer is already gone.** The plan: *"Size the interval ABOVE the shims' own 5 s self-timeout … so it can only ever reap a connection the shim has already abandoned."* Read that clause against `test/net-binding.test.cjs:279`: **a shim that has abandoned the connection has already exited 0 with no stdout, which is `allow`.** The deny main writes at t=10 s is written to a socket whose reader called `process.exit(0)` at t=5 s. So for every case the idle timeout actually handles, the answer the model received was `allow`, and the deny is decoration. The same sizing also makes fd-holding cheap: N idle connections each held for >5 s, with no connection cap, exhausts main's descriptors → `server.on('error')` → real shims get ECONNREFUSED → `process.exit(0)` → allow.

**Required remediation:** set `server.maxConnections` and a floor-wide in-flight byte budget (deny+close past it); size the idle timeout **below** the shim's 5 s budget, not above — a deny at 3 s that the shim actually reads is a control, a deny at 10 s that nothing reads is not. Add a behaviour case that drives N concurrent under-cap connections and asserts a protected-path `Write` on a fresh connection is still DENIED while they are open.

---

## B2-04 — 01-24 Task 1: `payload.cwd` disarms the fail-closed branch the same task introduces. T-P24-02's safety argument is false as written

T-P24-02: *"On a DENY-LIST an extra candidate base can only add a deny: the vouched bases are still checked, so a lying `cwd` costs the caller a deny and gains nothing."*

That holds for the *deny branches*. It does **not** hold for the new **empty-set** branch, which the same task adds and which must_have truth #2 depends on:

> *"`vouchedBases` returned nothing → return a deny reason that says main cannot locate the target and names `cwdValid`."*

Trace an agent whose registry cwd is non-absolute — the case `hive.ts:831`'s `'not-absolute'` and `RegistryAgent.cwdValid`'s JSDoc exist for, and the case the plan's own deny fixture uses (`'ClaudeTerminalHarness'`):

| `payload.cwd` | vouched bases | relative target `../../bin/cth-hook.cjs` |
|---|---|---|
| absent | `[]` | **DENIED** (the new fail-closed branch) |
| `"/tmp/anywhere"` (attacker-chosen, absolute) | `["/tmp/anywhere"]` | `/tmp/bin/cth-hook.cjs` → no branch matches → **ALLOWED** |

The attacker converts a DENY into an ALLOW by supplying a *truthful-looking, absolute, irrelevant* `cwd`. Cost: one JSON field. That is exactly the primitive T-P24-02 says does not exist, and the plan's behaviour case *"an agent whose registry cwd is RELATIVE … and whose payload carries no `cwd` … → DENIED"* is written so it cannot see it — the bypass is the `cwd` the case omits.

**Required remediation:** `payload.cwd` may be *added* to a non-empty base set but must **not** make the set non-empty on its own. One clause: compute the vouched set first; if it is empty, deny regardless of `payload.cwd`. State it in T-P24-02 and add the behaviour case with `cwd` present.

---

## B2-05 — 01-25 Task 1: the mandated `sessionKey` separator is a space. `hive.ts:2842` uses `\u0000`. The plan states the opposite as a re-measured fact **[demonstrated]**

Plan `<interfaces>`, presented as run-this-session output:

> `:2842` `const key = ` ``  `${row.agent_id ?? ''} ${row.session_id ?? ''}` `` → **` ` is the separator.** Use the same one so the two halves of the cost path agree.

Live, at HEAD:

```
$ grep -n 'u0000' src/main/hive.ts
2842:    const key = `${row.agent_id ?? ''}\u0000${row.session_id ?? ''}`;
```

Two consequences:

1. **The stated goal is inverted.** Following the instruction produces the disagreement it claims to fix: the ledger side keys on NUL, the collector side on space.
2. **A space separator is ambiguous where NUL is not.** `sessionKey(a, b)` is not injective over a charset that contains the separator — `sessionKey('x', 'y z') === sessionKey('x y', 'z')`. The composite key is the plan's *independent* control (T-P28… sorry, T-P25-04: *"it survives even a total failure of the token gate"*), and a separator collision is precisely a failure of that independence. `session.id` is read raw off the OTLP body and is validated nowhere on this path — the plan's own residual says so. NUL was chosen deliberately at `hive.ts:2842` for this reason.
3. **No test can catch it.** The plan instructs the test to import `sessionKey` *"so the separator has one definition"* — so the test agrees with whatever the source does, by construction, forever.

**Required remediation:** `\u0000`. Correct the `<interfaces>` line, and add one assertion that is independent of the implementation: `assert.notStrictEqual(sessionKey('a','b c'), sessionKey('a b','c'))`.

---

## B2-06 — 01-26 Task 2: the value-shape guard converts four credential classes that are redacted TODAY into leaks, and no fixture in the battery has any of those shapes **[demonstrated]**

The plan mandates the replacement callback *"Reject: pure numbers (`1200000`), `$`-prefixed env references (`$OPENAI_API_KEY`), ALL-CAPS placeholders (`REPLACE_ME`), dotted code paths (`process.env.FOO`, `cfg.token`), and TypeScript type names (`string`)."*

A faithful implementation of exactly that spec, run against the live pattern for comparison:

```
                       LIVE @HEAD    AFTER the plan's rules
login password=12345678             redacted   ->  *** LEAK ***
db password=$2b$12$KIXxPfPqmSabcd…  redacted   ->  *** LEAK ***     (bcrypt / argon2 hashes ALL start with `$`)
cfg client_secret=ABCDEFGH1234IJKL  redacted   ->  *** LEAK ***
bot_token=XOXBTESTTOKENVALUE1234    redacted   ->  *** LEAK ***
```

The twelve specificity strings all pass (12/12 strictly unchanged), and every sensitivity fixture the plan names passes — so **the plan's own battery reports 41/41 green while four classes of real credential stop being redacted.** Checked against the live fixture list (`test/voice-messages.test.cjs:178-200`): not one of the fifteen `SECRETS` rows is pure-numeric, `$`-prefixed, or ALL-CAPS, and the plan adds four more rows, all of them `sk_`/`rk_`/JSON shapes. There is no control anywhere in the set that can go red for this.

`redactSecrets` feeds **two** consumers: `scrubStagedSecrets` (a credential that stops matching reaches git history — FLOOR-04's requirement text is *"so it never reaches git history"*) and the mail path (`hive.ts:2254-2255`, every message subject and body). A numeric PIN, a password hash and an all-caps API key are not exotic; `$2b$…` is the canonical bcrypt encoding and appears in every seeded test fixture and every leaked `users` table.

This is the exact failure mode round 1 named in its heading — *"a fix that ships worse security than the bug"*.

**Required remediation:** invert the rule. Reject only the *placeholder* shape (`^[A-Z][A-Z0-9_]*$` **and** length ≤ 24 **and** contains `_`, i.e. `REPLACE_ME`/`CHANGEME`), and reject `$`-references only when they match `^\$\{?[A-Z][A-Z0-9_]*\}?$` (an env reference, not a bcrypt hash). Drop "pure numbers" or bound it to ≤ 8 digits. Then add four sensitivity fixtures — `password=12345678`, `password=$2b$12$…`, `client_secret=ABCDEFGH1234IJKL`, `bot_token=XOXBTESTTOKEN…` — to `SECRETS`, so the battery can fail.

---

## B2-07 — 01-26 Task 1: the LOCKSTEP guard compares regex literals, and the same plan moves the security decision OUT of the regex into a callback. must_have truth #4 is false by design

must_have truth: *"A drift between `redactSecrets` in hive.ts and its mirror in test/voice-messages.test.cjs turns the suite RED, rather than being checked by eye."*

The guard, as specified: *"slice each `redactSecrets` body … **extract every regex literal** from each slice, and `assert.deepEqual` the two lists."*

Task 2, same plan: *"**Do the value adjudication in the replacement callback, not in a lookahead.**"*

So after task 2 the decision "is this value a credential?" lives in a function body. Two ways it escapes the guard:

- If the adjudicator is a **module-level helper** (the natural shape — it is called from a `.replace` callback and needs to be testable), it is outside the `export function redactSecrets(` … `return s;` slice entirely. Drift in the mirror's copy is invisible. The mirror can then silently redact a different set than production while every test passes.
- Even inline, an exclusion expressed as `v.startsWith('$')` or `/^\d+$/.test(v)` inside the callback is only *partially* a regex literal; a drift like `≤ 24` vs `≤ 32`, or an inverted `!`, is not a literal at all.

Secondary: the guard is also **vacuity-prone**. It asserts *"the slice was found and is non-empty"* but not that the **extracted literal list** is non-empty. The plan's own pattern-5 key alternation is ~200 characters; an executor who moves it to `new RegExp(KEYS + …)` for readability produces zero literals in both files and the guard compares `[]` to `[]` — green, forever, measuring nothing.

**Required remediation:** compare the **whole normalised body text** (both `redactSecrets` and any adjudicator it calls, whitespace-collapsed), not an extracted literal list; assert the extracted set has the measured cardinality (the plan says 14) rather than merely being non-empty; and add one behavioural cross-check — run the same 41-row table through both copies and `assert.deepEqual` the outputs.

---

# HIGH

## H2-01 — 01-25 Task 2: M2's precedence hazard is closed on the header axis and left open on the ENDPOINT axis, and that is the blackout the plan's own diagnostic will misattribute

`hive.ts:1086-1087` sets only the **generic** `OTEL_EXPORTER_OTLP_ENDPOINT`. The plan sets only the **per-signal** `OTEL_EXPORTER_OTLP_{METRICS,LOGS}_HEADERS`. `pty.ts:707` spreads `...process.env` into the child.

Per the OTel spec, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` **overrides** the generic endpoint for the metrics exporter. An operator with their own collector exported globally gets:

- metrics posted to **their vendor**, carrying our `x-hive-otel-token` header;
- **nothing** posted to `127.0.0.1:<port>`;
- so `getAgentUsage` is null forever, and the T-P25-08 blackout table fires in full: cost ledger, `--resume` key, budget arm, per-agent cap, floor cost cap, floor token cap, velocity arm, account failover — all dark, nothing red.

And the collector's reject counter stays at **zero**, because no request arrives at all. The plan's mandated diagnosis — *"make the FIRST [named cause] the one this change can cause: the Claude Code SDK is not forwarding the per-signal OTLP header vars"* — is wrong for this failure and will send the operator hunting the SDK.

Round 1's M2 remediation was *"Set the signal-specific names explicitly, **or delete any inherited `OTEL_EXPORTER_OTLP_*_HEADERS` from the child env**." The second clause is the one that generalises; it was dropped.

**Fix:** delete every inherited `OTEL_EXPORTER_OTLP_*` key from the child env before adding ours, or set `OTEL_EXPORTER_OTLP_{METRICS,LOGS}_ENDPOINT` explicitly alongside the headers. Add a "zero batches received in N minutes while a Claude PTY is live" arm to the diagnosis, distinct from "batches received and refused".

## H2-02 — 01-25 Task 2: revoking the telemetry token on PTY exit races the child's final flush, and the loss is misdiagnosed by the same log line

`hive.ts:1088-1089` sets `OTEL_METRIC_EXPORT_INTERVAL = 5000` and `OTEL_LOGS_EXPORT_INTERVAL = 2000`. The plan mandates the revoke fire *"from EVERY path that drops a session"*, mirroring `releaseHookToken` at `pty.ts:783` — which runs **synchronously inside node-pty's `onExit`**.

The hook token is safe there because hooks are synchronous request/response with a live child. Telemetry is **batched and asynchronous**: up to 5 s of metrics and 2 s of logs are in flight or queued when the child exits, and both revoke and the collector's `req.on('end')` run on the same main event loop with no ordering guarantee. The final batch — the one carrying the turn that just ended — 401s.

Blast radius per occurrence: the last cost sample is dropped (`index.ts:1613`), and with it the `recordSession` write that produces the `--resume` key (`index.ts:1621`). The account pool **kills and respawns** agents on failover (`accountPool.ts:10-12`), so this fires on exactly the path where a correct resume key matters most. And the operator sees a 401 in the throttled log whose first named cause is "the SDK is not forwarding the header" — the wrong answer again.

**Fix:** don't revoke on exit; expire. Keep the token resolvable for one export interval past exit (`setTimeout(revoke, 10_000).unref()`), and say why in the comment — the hook token's teardown contract does not transfer to a batched exporter.

## H2-03 — 01-25 Task 3: a poisoned stored session id now disables `--resume` for that agent permanently, and nothing can clear it

The plan declines M5 (*"validate at `recordSession` as well"*) on file-ownership grounds and records the residual as *"it can no longer reach argv; it can still poison stored state."* That understates it.

`hooks.ts:565` → `hive.recordSession(agentId, p.session_id)` writes `registry.json`, appends the hive log and `commit()`s, with no validation (`hive.ts:1143-1156`). `hive.lastSession(id)` returns that value at both spawn sinks. After this plan, the guard **refuses** it — every time, forever, with a warning nobody reads in a packaged app. There is no path that overwrites the poisoned value except a *new* legitimate `session_id` from a *new* session — which requires the agent to run without resume and then be recorded again, i.e. it recovers only by losing the very state resume exists to preserve.

So an agent can permanently sever its own session continuity across restarts with one forged hook payload, and the plan's disposition ("residual, cannot reach argv") does not name it. Note also that the guard is applied *after* `const sid`, so it also rejects an **operator-typed** id in Add Agent that is 129+ characters or leading-`_` — both of which `transcript.ts`'s own `VALID_SESSION_ID` accepts today and which `seedSessionTranscript` resolves fine. The plan's negative control only covers `transcript.ts`'s two callers, not the dialog path.

**Fix:** one line in `recordSession` — refuse to store what the sink will refuse to use. It is the same guard, at the writer every consumer routes through, and it makes the stored state self-consistent. If `hive.ts` truly cannot be touched in this wave, then the SUMMARY must say plainly that resume can be permanently poisoned and that the follow-up is not optional.

## H2-04 — M3 survives untouched: unbounded session cardinality, post-authentication, quadratic on every publish

Not cited in any of the eight plans. Live shape confirmed at `telemetry.ts:438-448` and `:463-478`:

```ts
private session(agentId, sessionId) { let accum = this.sessions.get(sessionId); … set.add(sessionId); }
private aggregateLive(agentId) { for (const sid of set) { … } }     // whole set, every publish
```

The composite key changes *whose* accumulator you can touch. It does not bound *how many*. An authenticated agent, with its own valid token, POSTs 10^6 distinct `session.id` values: `sessions` and `agentSessions` grow without bound in the main process, and `aggregateLive` — which iterates the agent's entire set on every publish/pull — goes quadratic. `SESSION_MAX_AGE_MS` sweeps at 24 h, inside `aggregateLive`, so it does not help. Main-process memory and CPU exhaustion, after the fix, by an agent that is behaving "legitimately" as far as the new gate is concerned.

01-25 touches all five `this.sessions` sites anyway. **Fix:** cap the per-agent set (LRU-evict the oldest `SessionAccum`) at the same moment.

## H2-05 — 01-24 Task 1: the rewritten CEILING comment enumerates the residuals and omits the one that voids the whole Bash arm — and adding `$HOME` widens it

`protectedPathDenial` splits the expanded command on `[\s;&|<>()"']+`. **A harness home containing a space defeats every deny branch for every Bash target**, because `$HIVE_ROOT` expands to a path that the very next line tears in half:

```
cat >> "$HIVE_ROOT/bin/cth-hook.cjs"
  → cat >> "C:\Users\John Smith\...\hive\bin\cth-hook.cjs"
  → words: ["cat", ">>", "C:\Users\John", "Smith\...\hive\bin\cth-hook.cjs"]
  → neither word resolves anywhere near <hive>/bin  →  ALLOWED
```

`C:\Users\<name with a space>`, OneDrive-redirected profiles (`C:\Users\x\OneDrive - Company\…`) and `~/Library/Application Support/…` are all ordinary. Task 1 **rewrites** the ceiling paragraph (`:427-432`) and adds exactly one new residual (`cd`), while claiming relative paths and `~`/`$HOME` are "now covered". A ceiling list that enumerates three residuals and omits the one that turns the control off entirely reads as a guarantee it does not hold.

Adding `HOME`/`USERPROFILE` to `expandHiveVars` **widens** the surface: it introduces two more expansions whose values routinely contain spaces, on the same naive split. It also introduces a substring-collision the existing three names do not have — `out.split('$HOME').join(homedir())` also rewrites `$HOMEPATH` and `$HOMEDRIVE`, two real Windows variables, into garbage words.

**Fix:** name the space residual in the ceiling; expand `${NAME}`/`$NAME` with a word-boundary-aware replace (`$HOME(?![A-Za-z0-9_])`); and, if the Bash arm is to mean anything, split with a quote-aware tokenizer instead of a character class, or at minimum re-join adjacent words that reconstruct an existing directory prefix.

## H2-06 — 01-28 Task 2: the guard closes the shape it was given, but the shape it was given rests on a false premise, and the genuinely unrecoverable ordering survives

Two problems, one inherited and one new.

**(a) The premise.** R-21 (and 01-28's must_have truth, which repeats it) says a stuck-`blocked` agent *"never receives mail again"*, citing `useHive.ts:761`. Read live: `:755-763` is the `onHiveDelivered` **subscriber** — it only skips the renderer's *status paint* after main has already delivered. Mail delivery is main's (`delivery.ts` `drainQueue`), and its gate list is `switching` / `vetoed` / `bootGrace` / `idleMs` — **no status check**, because `setStatus` is wired at `index.ts:533-536` to a hive log line and nothing else. So the true impact of a stuck `blocked` is a wrong avatar, a stuck red `!`, and a seed-prompt retry (`useHive.ts:733`) that never fires — not a mail blackout. The plan should not ship a truth it has not verified; a reviewer who checks it will distrust the rest.

**(b) The surviving shape.** The guard is correct for "false block, then the agent finishes its turn" — the real Stop clears. It does **not** cover "the agent finishes its turn, *then* the false block lands." `usePtyParser:157` tests `text.slice(-400)` on every chunk, and bytes keep arriving after the hook Stop (the statusLine shim writes `ctx 12k/200k (6%)` to stdout after every response, `hive.ts:3646`). If the tail carries `(y/n)` when that trailing write arrives, the parser sets `blocked` **after** the last real Stop. From there: no further output → no further Stop; `delivery.quiesce` fires once, `this.quiesced.add(id)` (`delivery.ts:670`) suppresses repeats, and the one synthesized Stop is now **dropped by the new guard**. The agent is `blocked` until a respawn, and `breakerLevel` (the only clear is `useHive.ts:533`) is never reset. That is R-22's permanence, reached by a route the plan's four behaviour cases do not model.

**Fix:** state (a) correctly. For (b), give the renderer a recovery edge that does not depend on a Stop it will never see — e.g. clear `blocked` when a `PostToolUse`/`UserPromptSubmit`/`hive:delivered` arrives, or have `quiesce` re-announce after M consecutive quiet spells rather than once per spell.

## H2-07 — 01-28: the durable half of `quiesce` still writes `idle` for an agent the renderer keeps `blocked`

`quiesce` (`delivery.ts:671-672`) does **two** things: `this.deps.setStatus?.(id, 'idle')` and `this.deps.emit(...)`. The plan adds `synthesized: true` only to the emit and lists *"the durable `setStatus` half … untouched"* as a **negative control**. After the fix the hive log records `agent_quiesced / idle / pty_silent` for an agent the floor is painting `blocked` with a red `!`.

`index.ts:533-536` is the only consumer today, so the blast radius is a log line and anything downstream that reads it (the voice read-layer's `list_agents`/`get_agent_detail` narration of "who is stuck"). But it is a fresh instance of the "one fact, two owners" shape the plan's own action text says both of its defects came from, added by the plan, and named as a control rather than as a divergence.

**Fix:** one line — pass the discriminator to both halves, or skip both for the case the guard drops.

---

# WARNINGS

**W-01 — 01-24 Task 2: "write the deny, then close" is a race if "close" is `destroy()`.** The plan says *"write an explicit DENY response before closing. Never bare-destroy"* without naming the API. `conn.write(DENY); conn.destroy();` discards pending writes — the shim gets ECONNRESET, exits 0, **allows**. Only `conn.end(DENY)` (writable half-close, readable side left open so the peer's remaining megabytes drain) is safe. Say `conn.end(...)` in the action text and assert it in the behaviour case by having the test client keep writing after it receives the deny.

**W-02 — 01-24 Task 2: the deny reply is emitted for events that have no deny semantics.** The cap fires before `JSON.parse`, so main cannot know the `hook_event_name`. A `hookSpecificOutput.hookEventName: 'PreToolUse'` deny returned to a `Stop`, `PostToolUse`, `Notification` or `Status` payload is at best ignored and at worst logged as a schema violation by each engine. The agy and grok shims translate `hookSpecificOutput.permissionDecision === 'deny'` (`hive.ts:3722`, `:4103`), so a Stop-time deny becomes `{decision:'deny'}` on those engines. State the intended behaviour per event.

**W-03 — 01-25 Task 2: our per-signal header vars silently clobber the operator's own.** `...process.env` first, ours last. An operator exporting `OTEL_EXPORTER_OTLP_METRICS_HEADERS` for their own collector loses it inside every agent PTY. The plan names only the opposite direction (*"an operator-set per-signal value cannot silently replace it"*). One sentence in `<accepted_consequences>`.

**W-04 — 01-26: the `\b` + vendor-body requirement narrows pattern 3 more than the plan admits.** With `sk[-_](?:ant|live|test|proj)[-_]` required, a bare `sk-` key with a non-vendor body (`sk-abcdefghij0123456789`) stops matching unless the plain `sk-[A-Za-z0-9_-]{16,}` alternative is retained. The plan lists "do not lose `sk-ant-…` or `sk-proj-…`" as fixtures but does not require the generic `sk-` arm to survive; the existing `SECRETS` list happens to contain only vendor-bodied forms, so nothing catches its loss. Add `sk-` + 20 random chars as a fixture.

**W-05 — R-11 is only half-stated.** 01-26 pins `test/voice-messages.test.cjs` as hand-rolled. `test/telemetry-auth.test.cjs` (01-25) and `test/hive-proxy-token.test.cjs` (01-26) are new files with no stated harness constraint. If either is hand-rolled, `test/repo-claims.test.cjs:169-196` re-runs it with every assertion poisoned and asserts a non-zero exit — a shape that a driver swallowing its own failures turns red, naming the wrong file.

**W-06 — 01-25's `<done>` gate for `MIN_WIN` is satisfiable while the docs drift.** `grep -c "1280" DESIGN.md` is 0 / `grep -c "960"` is 2 is fine today (measured: 2 and 0 at HEAD, both on `:169` and `:677`), but 01-29's clause-3 extractor requires *exactly two* `NNN × NNN` pairs "on lines naming a window minimum". `DESIGN.md` currently contains **no other** `NNN × NNN` pair (verified), so the extractor is safe at HEAD — but nothing stops a later doc edit from adding a third and turning a drift guard into a flake. Pin the two line numbers or the two sentence prefixes, not the count.

---

# Verified closed — attacked and could not break

1. **`SPAWN_SAFE_SESSION_ID` (01-25 T3).** Every row of the plan's table reproduces exactly. Additional shapes I invented all fail closed: `a\n--dangerously-skip-permissions` → false, `abc\n` → false, `abc\r\n` → false (JS `$` without the `m` flag anchors at end-of-input, unlike Python). Subset relation `SPAWN ⊆ VALID` holds over the plan's table **and** over 200 000 randomised strings from the union charset: **0 violations**. `--print`, `-c`, `-`, `_leading`, 129×`a` all rejected; UUID, 128×`a`, `sess_01-ABC`, `a-b` all accepted. Round 0's candidate A is confirmed broken exactly as the plan's table says.
2. **01-26's twelve specificity strings.** Ran the plan's spec against all twelve: **12/12 strictly equal to input**, including `task_scheduler_interval_ms`, `risk_assessment_matrix_builder`, `flask_sqlalchemy_helpers`, `"token": 1200000,`, `"api_key": "$OPENAI_API_KEY"`, `'x-md-reply-token': cfg.token,`, `token: string;`, `let secret = process.env.FOO;`. Also clean on shapes the plan does not name: a `sha512-` lockfile integrity hash, a `"resolved"` registry URL, a git-SHA line, a base64 blob, `//registry.npmjs.org/:_authToken=…`.
3. **01-26's JSON round-trip.** `{"token": "abcdef123456789", "keep": 1}` → `{"token": "[redacted]", "keep": 1}`, `JSON.parse` succeeds. R-08 closed.
4. **01-26's sensitivity set.** All fifteen existing `SECRETS` fixtures plus the four new ones (`sk_live_` unlabelled, `sk_test_`, `rk_live_`, `sk_ant_api03_`) still redact under the plan's spec. The `[A-Z]`-lookahead trap the plan warns about is real and the plan's remedy (adjudicate in the callback) avoids it.
5. **R-02, the splitter persistence.** `splitterReachableMax` reserving 48px gives 976 at vp 1024, so a persisted 900px sidebar survives the newly reachable band; below 1024 `showSplitter` is false (`sidebarLayout.ts:52`) so the effect is unmounted. Closed.
6. **R-01/R-35, `DESIGN.md`.** Now in 01-25's `files_modified`, both `:169` and `:677`, edited in place with a `git diff --numstat` equality gate, and cross-pinned by 01-29 clause 3. Verified live: two `1280` hits, zero `960` hits, no other `NNN × NNN` pair in the file.
7. **R-32/R-33, the 01-31 walker.** Explicit root list rather than a tree walk, so `dist/`, `out/` and `.planning/` are outside by construction; the pin excludes itself by explicit path with the reason written in; a `files.length > 200` floor (measured 312) keeps a broken walker distinguishable from a clean tree.
8. **R-30, the release tripwire.** `installers=` split out before the widened hash set. Closed.
9. **No token reaches disk in any of the eight plans.** No new file, no new permission surface. `pty.ts` logs no env and no token; `PtySession.otelToken` mirrors `hookToken`, which is not serialised to the renderer.
10. **No error message oracles a valid token.** The collector's 401 is uniform; the throttled reject line mirrors `hooks.ts:395-412` and prints neither the token nor the payload's claimed id.
11. **`within()` remains sound as a segment test.** `within('/hive/bin','/hive/binary') === false`; forward-slash, doubled-separator and `C:relative` spellings all normalise correctly and stay DENIED. The defect in B2-01 is in `realResolve`'s canonicalisation, not in `within`.
12. **01-24 Task 3 (`agentForToken` + counted win32 skip)** — no bypass found, unchanged from round 1.

---

## Gate list before any of this executes

1. **01-24 T1** — normalise `\\?\` / `\\.\` / UNC and use `realpathSync.native` on win32 in `realResolve`; add the four spellings as behaviour cases. (B2-01)
2. **01-24 T1** — filter non-path words and memoise before capping; pick the cap from the measured cost with a ≥500-word heredoc negative control. (B2-02)
3. **01-24 T2** — `server.maxConnections` + an aggregate in-flight byte budget; size the idle timeout **below** the shim's 5 s, not above. (B2-03)
4. **01-24 T1** — `payload.cwd` may not make the vouched-base set non-empty on its own; correct T-P24-02. (B2-04)
5. **01-25 T1** — separator is `\u0000`; add an injectivity assertion independent of the implementation. (B2-05)
6. **01-26 T2** — narrow the value-shape exclusions to placeholder/env-reference shapes and add four sensitivity fixtures (numeric, `$2b$`, ALL-CAPS, SCREAMING). (B2-06)
7. **01-26 T1** — LOCKSTEP compares normalised bodies including the adjudicator, and asserts the extracted cardinality. (B2-07)
8. **01-25 T2** — strip inherited `OTEL_EXPORTER_OTLP_*` from the child env (or set the per-signal endpoints); expire the telemetry token rather than revoking it on exit; add a "zero batches" arm to the diagnosis. (H2-01, H2-02)
9. **01-25 T3** — validate in `recordSession`, or say plainly in the SUMMARY that resume can be permanently poisoned. (H2-03)
10. **01-25 T1** — cap per-agent session cardinality while all five sites are open. (H2-04)
11. **01-24 T1** — name the space-in-path residual in the ceiling; word-boundary the `$HOME` expansion. (H2-05)
12. **01-28 T2** — correct the "never receives mail" truth; add a recovery edge for a false block that lands after the last real Stop; pass the discriminator to both halves of `quiesce`. (H2-06, H2-07)

---

_Lens B of round 2. Every finding marked **[demonstrated]** was reproduced by executing the proposed logic against live source and real inputs on the operator's Windows host in this session. No source file and no plan was modified._
