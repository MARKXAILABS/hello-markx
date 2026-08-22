# Red-Team Lens 3 — Do the security fixes actually close the hole?

**Target**: `01-24-PLAN.md`, `01-25-PLAN.md`, `01-26-PLAN.md` (branch `gsd/v1.0-milestone`, HEAD `47a48cd`)
**Posture**: hostile. Every fix is assumed insufficient until a bypass search fails.
**Threat actor**: an LLM-controlled agent shell, same OS user, holding the app's env vars, able to
read any file the user can, spawn processes, and open loopback sockets. Not a remote attacker.
**Method**: read the live source each plan targets; simulate the proposed logic where it is
mechanical (regex, path resolution); trace the fail path of every new control to its consumer.

---

## Verdict

| Plan | Task | Closes its stated hole? |
|---|---|---|
| 01-24 | 1 — relative-target resolution | **NO — BLOCKER (B2)**; partial, and the plan's own behaviour case 2 is unreachable with the prescribed bases |
| 01-24 | 2 — single-shot + byte cap + timeout | **NO — BLOCKER (B1)**; the cap is itself a gate bypass (fail-OPEN) |
| 01-24 | 3 — `agentForToken` + win32 skip | Yes. No bypass found. |
| 01-25 | 1 — collector auth + composite key | Partial. Auth is correct in shape; **T-P25-03 overclaims — BLOCKER (B4)** |
| 01-25 | 2 — `OTEL_EXPORTER_OTLP_HEADERS` | Yes for the stated hole, but **introduces a new exfil channel — H1** |
| 01-25 | 3 — `VALID_SESSION_ID` | **NO — BLOCKER (B3)**; the regex accepts `--dangerously-skip-permissions` |
| 01-26 | 1 — widened `redactSecrets` | Partial. Two named shapes close; **chunking survives and is not named — H4** |
| 01-26 | 2 — token-exact proxy revoke | Yes. No bypass found. |

---

## BLOCKERS

### B1 — 01-24 Task 2: the byte cap and idle timeout are an agent-triggerable fail-OPEN of the PreToolUse gate

**BLOCKER. This fix opens a bigger hole than the one it closes.**

Task 2 instructs: *"Add a module-level byte cap … and **destroy** the connection when `buf` crosses
it"* and *"Add `conn.setTimeout(...)` with a **destroy** handler."*

The peer on the other side of that socket is `HOOK_SHIM` (`src/main/hive.ts:3621-3672`). Its entire
failure contract:

```js
const c = net.createConnection(sock, () => c.write(JSON.stringify(payload) + '\n'));
c.on('data', (d) => { resp += d; });
c.on('end',   () => done(0));          // done(): if (resp) stdout.write(resp); exit(code)
c.on('error', () => process.exit(0));  // <- exit 0, NO stdout
setTimeout(() => process.exit(0), 5000).unref();
```

`test/net-binding.test.cjs:279` states the consequence in the repo's own words: *"the shims exit 0 on
a connect error, and **exit 0 with no stdout is `allow`**."*

`conn.destroy()` on an oversized body gives the shim `ECONNRESET` -> `error` -> `exit(0)` -> **allow**.

**Concrete bypass that survives the fix**: a `Write` PreToolUse whose `file_path` is
`<hive>/bin/cth-hook.cjs` and whose `content` field is padded past the cap. The shim's payload
crosses the cap, main destroys the connection, the shim allows, and the model writes the shim every
other agent on the floor executes. **Today, with no cap, that identical payload is parsed and
DENIED.** Task 2 converts a deny into an allow, and the attacker picks the size.

No cap value fixes this, because the attacker chooses the payload length. The plan even notices the
sizing problem (*"a `Write` payload carries file contents"*) without noticing that crossing the
number is the exploit.

**Required remediation**: on cap-cross and on idle-timeout, do **not** bare-destroy. Write a deny
response first, then end:
`conn.end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: '…oversized hook payload…' } }))`
— or, minimally, `conn.end('{}')` only for events that are not PreToolUse and a deny for PreToolUse.
A control whose overflow path is `allow` is not a control.

Note the second-order conflict this creates with the plan's own instruction to keep the reply shape
byte-identical so the socket is not an oracle: an oversized peer currently gets *nothing*, which is
both an oracle **and** the bypass. Deny-on-overflow resolves both.

---

### B2 — 01-24 Task 1: the prescribed base set cannot satisfy the plan's own behaviour case 2

**BLOCKER — the plan is unimplementable as written, and the likely "fix" is to weaken the test.**

Task 1 prescribes exactly two vouched bases:

1. `this.hive.registry().agents[agentId]?.cwd` (the agent's project cwd)
2. `join(hiveRoot, 'agents', agentId)` (the agent's own hive dir)

Behaviour case 2 demands: `Bash` command `cd $HIVE_ROOT && cat >> bin/cth-hook.cjs` -> **DENIED**.

Simulated against the live `within()` and `path.join`, with `hiveRoot=/hive`, `agentId=a-1`,
registry cwd `/proj/repo`:

```
target 'bin/cth-hook.cjs'
  candidates: /proj/repo/bin/cth-hook.cjs , /hive/agents/a-1/bin/cth-hook.cjs
  within(/hive/bin, ...)   -> false
  within(/hive/.git, ...)  -> false
  => ALLOWED
```

The hive root is **not** in the candidate set, so a relative target reached by `cd $HIVE_ROOT` is
never measured against it. Case 1 (`../../bin/cth-hook.cjs`) and case 3 (`../b-1/settings.json`) do
work — they reach `/hive/bin/...` and `/hive/agents/b-1/...` via base 2 — so an implementer will see
two of three go green and be tempted to soften case 2.

Adding `hiveRoot` as a third base does **not** rescue it: it collides head-on with behaviour case 4
("an agent's own relative writes must be ALLOWED — a gate that blocks them is an outage"). Any repo
with a `bin/` directory would then have `cat bin/foo.js` denied, and `cat .git/config` — a routine
command — would hit the `.git` branch. That is an outage, not a control.

**The real diagnosis**: the gate cannot resolve a relative path without knowing the agent shell's
real cwd, and the plan forbids the only field that carries it.

**Counter-recommendation, and the plan's threat model is backwards here.** T-P24-02 rejects
`payload.cwd` as "spoofing". For a **deny-list** that reasoning inverts: if `payload.cwd` is used
*only as an additional candidate base*, and the two vouched bases are still checked, then a lying
`cwd` can only ever produce an **extra deny**, never an extra allow. An attacker gains nothing by
lying and loses the bypass by telling the truth. Read `payload.cwd`, reject it unless it is absolute,
and **add** it to the candidate set. Denying on ANY candidate is already the plan's stated posture —
it just picked the wrong set of candidates.

---

### B3 — 01-25 Task 3: `VALID_SESSION_ID` does not reject flag-shaped session ids

**BLOCKER. The plan's first behaviour bullet is factually false against the regex it mandates.**

Plan text, Task 3 behaviour: *"`VALID_SESSION_ID.test('--dangerously-skip-permissions')` is false."*
Plan text, Task 3 action: export `src/main/transcript.ts:73`'s pattern bounded to 128 —
`/^[A-Za-z0-9_-]{1,128}$/`.

`-` is a member of `[A-Za-z0-9_-]`. Measured:

```
"--dangerously-skip-permissions"  true
"--print"                         true
"--permission-mode"               true
"--continue"                      true
"--strict-mcp-config"             true
"-c"                              true
"x\" & whoami & \""               false
```

The cmd.exe half of the finding **is** closed — `"`, `&`, space and `=` are all outside the class, so
`buildCmdCommandLine` (`src/main/pty.ts:132-144`) can no longer be steered. The **argv-injection**
half is wide open, and it is the half the sink actually reaches:

```ts
// src/main/index.ts:3290-3292  — the !claudeProvider branch
if (sid && rf) { const args = opts.args ?? []; if (!args.includes(rf)) { args.push(rf, sid); … } }
```

`args.push('--resume', '--dangerously-skip-permissions')` on grok / kimi / custom
(`resumeFlag: '--resume'`), `--conversation` on agy, `--session` on crush. Every one of these is a
CLI whose option parser will read a `--`-prefixed value as a flag, not as the option's argument.

**Exploit path, end to end, all within the post-fix code:**
1. Agent posts a hook payload with its own valid `sock_token` and
   `session_id: "--dangerously-skip-permissions"`.
2. `src/main/hooks.ts:565` -> `hive.recordSession(agentId, p.session_id)`. Verified: **no validation
   in `recordSession`** (`src/main/hive.ts:1143-1156`) — it writes `registry.json` and commits.
3. Any restart — operator, or an account-pool failover which kills+respawns automatically
   (`src/main/accountPool.ts:11`) — reaches `hive.lastSession(id)` at `index.ts:3289`.
4. `VALID_SESSION_ID` passes it. `args.push(rf, sid)`.

Note this is *self-*escalation (an agent poisoning its own resume key), which is exactly the
threat: it lets a model turn off permission gating on an engine the operator deliberately started
without `autoMode`.

**Required remediation**: reject a leading `-`. `/^(?![-_])[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/` closes
it in one character class. If the plan really wants the transcript pattern verbatim, add an explicit
`!sid.startsWith('-')` at the sink and pin it with the test the plan already claims to have written.
**Also note the Claude branch is not covered by the plan's guard at all** — it lives in the
`!claudeProvider` block; the Claude branch at `index.ts:3255-3268` survives only because
`seedSessionTranscript()` requires a matching `.jsonl` to exist. That is an accidental control, not a
designed one, and the plan's claim that one guard covers "all three producers" is wrong: it covers
one sink of one producer chain.

---

### B4 — 01-25 T-P25-03 overclaims: a forged 401 still kills the account for every agent on it

**BLOCKER on the claim, not on the code.** The plan writes:

> T-P25-03 | forged `api_error 401` marking a Claude account dead for the whole floor | **mitigate** |
> `onApiError` fires only for the token's own agent.

Deriving `agentId` from the token is correct and does stop A from naming `victim`. It does **not**
stop the stated impact, because the account pool maps agent -> *shared* account:

```ts
// src/main/accountPool.ts:214-217, :257-262
const agent   = this.deps.liveAgents().find((a) => a.agentId === agentId);
const account = agent?.account;
…
this.state = markDead(this.state, account, 'token rejected (401)', now, lastError);
this.failover(`401 on "${label}"`);
```

`failover` then moves **every** agent on that account (`accountPool.ts:357` filters `liveAgents()` by
account, plural), and the renderer "kills + respawns those agents (`--resume`)"
(`accountPool.ts:11`).

**Surviving bypass**: agent A, with its own valid `x-hive-token`, POSTs `/v1/logs` with
`event.name: api_error`, `status_code: 401`. Its own account is marked dead, the operator is alerted
that a token was rejected, and every sibling agent sharing that account is killed and respawned.
That is the same floor-wide denial of service the plan says it mitigated, minus only the ability to
target an account A is not on.

Chaining B4 with B3 is worse: the forged 401 is the *trigger* that reaches the poisoned resume key
without waiting for an operator restart.

**Required remediation**: either downgrade the disposition to `reduce` and state the residual
plainly, or add the real control — a 401/429 arriving from **one** agent should not be sufficient to
mark a shared account dead. Corroboration across two distinct agents on the same account, or a
rate/consensus gate, is the fix that matches the blast radius.

---

## HIGH

### H1 — NEW HOLE: the hook token is promoted into `OTEL_EXPORTER_OTLP_HEADERS`, a standard env var every OTel-instrumented grandchild forwards

01-25 Task 2 puts the PTY's own hook token into `OTEL_EXPORTER_OTLP_HEADERS=x-hive-token=<token>` in
the spawn env (`src/main/pty.ts:731-735`), alongside `HIVE_SOCK_TOKEN`.

Confirmed: **the telemetry token is the SAME secret as the hook token.** `hookToken` is minted once
per spawn at `pty.ts:701` and the plan reuses that exact value.

`HIVE_SOCK_TOKEN` is a bespoke name nothing outside this repo reads. `OTEL_EXPORTER_OTLP_HEADERS` is
an OpenTelemetry-spec'd variable that **every** OTel SDK in **every** language reads by default, for
**all** signals. That env var is inherited by every descendant of the agent PTY.

**Concrete exfiltration path**: an agent runs `npm test` / `pytest` / `go test` in a repo that has
its own OTel instrumentation pointed at a vendor collector (Honeycomb, Datadog, Grafana Cloud — the
endpoint typically comes from the repo's own `.env` or code, not from the hive). That process
inherits `OTEL_EXPORTER_OTLP_HEADERS` from the environment and sends `x-hive-token: <token>` to a
third-party HTTPS endpoint. The hive's hook credential leaves the machine, and because it is the same
secret, it grants the hook socket too.

This is not hypothetical agent malice — it is the *normal* behaviour of the ecosystem that owns that
variable name. The fix converts a same-host-only credential into one that ordinary tooling will
happily post off-box.

**Required remediation** (any one):
- Use a **separate** token for the collector, minted at the same choke point but distinct from the
  hook token, so a leak of one does not grant the other; and/or
- Use the signal-specific names only (`OTEL_EXPORTER_OTLP_METRICS_HEADERS` +
  `OTEL_EXPORTER_OTLP_LOGS_HEADERS`) — still standard, but narrower blast radius; and/or
- Bind the token to the endpoint: reject a request whose `Host` header is not the collector's own
  bound `127.0.0.1:<port>`, which at least makes a leaked token useless against a different listener
  (it does not stop the exfil itself).

At minimum the plan must state this as an accepted, named risk. It currently does not mention it.

---

### H2 — 01-25 misattributes its own residual ceiling; the sibling-env read is the live one and it is already documented

Plan 01-25 line 210 writes the ceiling as *"the token is in the agent's own env, which is the
**GATE-02 child-env** ceiling this project already states for the hook socket."*

Two problems:

1. **GATE-02 is a different requirement.** `.planning/REQUIREMENTS.md:160` defines GATE-02 as *"`env`
   inside any agent terminal shows the hive's own variables and not the [operator's secrets]"*. That
   is about not exposing operator credentials **to** agents. It is not the ceiling that matters here.
2. **The ceiling that matters is already written down, verbatim, and it is GATE-01's.**
   `.planning/REQUIREMENTS.md:569`:

   > The requirement's first clause — *"an agent cannot post a hook payload claiming to be a
   > **different** agent"* — is **not unconditionally true on Linux**: agent B's token lives in B's
   > process environment and a same-uid sibling reads `/proc/<B-pid>/environ`.

Under this red-team's stated threat model (same OS user, can spawn processes), that is exactly the
attacker. So after 01-25, the three headline attacks are **not eliminated, only gated behind one
extra step**:

- Enumerate sibling agent PTY processes.
- Read `/proc/<pid>/environ` (Linux), `ps eww` (macOS, same uid), or read the PEB via
  `OpenProcess`+`ReadProcessMemory` (Windows, same user — full access to own-user processes by
  default).
- Extract `HIVE_SOCK_TOKEN` / `OTEL_EXPORTER_OTLP_HEADERS`.
- Replay every forged-spend / forged-401 / forged-resume-key attack **as the victim**, exactly as
  before.

There is no replay window, no nonce, and no body signature (the plan says so), so a captured token is
valid until the victim's PTY exits. `slack.ts:309-322` — the sibling listener the old comment claimed
to mirror — has HMAC-over-raw-body + a 5-minute replay window + `timingSafeEqual`. The collector gets
none of those. The plan is right that the token compare needs no timing-safe path (`Map.get` on a
hash), and right that a timing oracle is irrelevant to a local attacker — but that is because the
local attacker has a much better primitive.

**Required remediation**: dispositions T-P25-01, T-P25-02, T-P25-03 must read `reduce`, not
`mitigate`, and the ceiling must be attributed to GATE-01's `/proc` residual (REQUIREMENTS.md:569),
not to GATE-02. The must_have truth *"A POST to the OTLP collector with no valid per-agent token is
refused"* stays true and is worth shipping — it is the "no valid token" phrasing that has to survive
review, not a claim that impersonation is closed.

---

### H3 — 01-24 Task 1 is defeated by `~/…` and `$HOME/…`

`expandHiveVars` (`src/main/hooks.ts:465-483`) expands exactly three names: `HIVE_ROOT`, `HIVE_SOCK`,
`AGENT_DIR`. `~` and `$HOME` are expanded by the **shell**, not by the gate, and both are
`isAbsolute() === false`, so the candidate-set logic joins them onto the wrong bases (measured):

```
'~/h/bin/cth-hook.cjs'      -> /proj/repo/~/h/bin/...      , /hive/agents/a-1/~/h/bin/...      -> ALLOWED
'$HOME/h/bin/cth-hook.cjs'  -> /proj/repo/$HOME/h/bin/...  , /hive/agents/a-1/$HOME/h/bin/...  -> ALLOWED
```

**Concrete bypass surviving the fix**:
`ln -s "$HIVE_ROOT" ~/h && cat >> ~/h/bin/cth-hook.cjs`
The first word expands to a real absolute hive path (so the `ln` *source* is visible to the gate, but
`ln`'s destination is not protected), and the second command's target never resolves anywhere near
`<hive>/bin`. The `realResolve` symlink hop that existing test case 8 pins is bypassed not by
defeating `realpath` but by never handing `realpath` a path that points at the hive.

Cheaper still, no symlink: `cd "$(dirname "$HIVE_ROOT")" && cat >> hive/bin/cth-hook.cjs`.

**Required remediation**: expand `~` (and, if you are going to claim shell-word coverage at all,
`$HOME`) in `expandHiveVars` before splitting; and/or adopt the `payload.cwd`-as-extra-candidate
approach from B2, which catches the `cd`-based variants directly.

---

### H4 — 01-26 Task 1: chunking survives the widened matcher, and the restated ceiling does not name it

Verified by measurement. The widened patterns do what the plan says on the two named shapes:

```
{"token": "abcdef123456789"}     old: unchanged     new: {"token=[redacted]}
sk_live_<16+>                    old: unchanged     new: [redacted]
'The token cap is 1.2 million…'  old: unchanged     new: unchanged   (BENIGN control holds)
'Tasks: 3 todo, 1 doing, …'      old: unchanged     new: unchanged   (BENIGN control holds)
```

**But the commit path is a line-oriented detector, not a redactor.** `scrubStagedSecrets`
(`src/main/hive.ts:3186-3260`) builds `addedLines(text)` — every `+` line of the staged diff joined
by `\n` — and treats `redactSecrets(all) !== all` as "this file has a secret", then **unstages the
whole file**. Three consequences the plan does not state:

1. **Chunking across lines defeats it, exactly as this lens suspected.** The `+` prefix and the
   newline sit between the halves, so no pattern spans them:
   ```
   +const A = "sk_live_EXHxxxxxxxx";
   +const B = "yyyyyyyyyyyyyyyy";
   +const KEY = A + B;
   ```
   Neither line alone has 16+ chars after `sk_`. Nothing matches. The secret lands in git history.
   Base64, hex-split, or a `.env` written by `printf` in two appends do the same. The plan's
   "remaining ceiling" list names *bare high-entropy strings* and *the two size escapes* — it does
   **not** name chunking, which is the cheapest bypass and the one an LLM will find first.
2. **The size escapes are attacker-triggerable, not passive.** `SECRET_SCAN_MAX_LINES = 20_000`
   (`hive.ts:321`) and `SECRET_SCAN_MAX_BYTES = 4 MiB` (`:326`). An agent that writes one 20,001-line
   file in the same debounce window gets the **entire** commit — including its secret — committed
   `UNSCANNED` (`hive.ts:3203-3206`), with a `console.warn` nobody reads. The plan restates this as a
   ceiling but frames it as something that *happens*, not something an agent *does*. FLOOR-04's
   requirement text is *"so it never reaches git history."* One `seq 20001 > pad.txt` falsifies it.
3. **The widening increases silent durability loss.** The detector unstages the whole file. The
   `BENIGN` control list lives in `test/voice-messages.test.cjs` and is a **mail-path** control — it
   does not cover the commit path's inputs, which are source files. Measured, both old and new
   patterns already redact `token: string;` and `let secret = process.env.FOO;` (pattern 5's value
   run `[^\s"',}]{6,}` matches `string;` and `process.env.FOO;`), so any TypeScript file declaring a
   `token`/`secret` field is **already** being silently unstaged today. The optional-quote widening
   adds `{ "token": … }` — i.e. every `package.json`-shaped config and every JSON fixture. The plan
   must add commit-path benign controls (a real `.ts` with a `token: string` field, a config-shaped
   JSON) or it is trading a leak fix for a data-loss regression.

**Smaller residuals in the same fix**:
- `obj["token"] = "abcdef123456789"` is **still missed** by both old and new pattern 5 (the `]`
  breaks the key-to-delimiter adjacency). Measured.
- `rk_live_…` is named in the plan's own objective as a shape that passes today, and the prescribed
  `sk[-_]` widening does **not** cover it. Either cover it or stop naming it.
- The new replacement emits `{"token=[redacted]}` — invalid JSON. Harmless for the equality detector,
  but the same function feeds the mail/briefing path, where it corrupts payloads. State it.

**No bypass found for 01-26 Task 2** (token-exact proxy revocation). The closure-captured token plus
identity guard mirrors the working precedent at `src/main/pty.ts:400-405`, and `mintProxyToken`'s
pre-emptive `revokeProxyToken` keeps the map consistent across generations.

---

## MEDIUM

### M1 — 01-24 Task 1 roughly doubles synchronous `realpath` work on main's hot path, with no word cap, and the overflow is fail-open

`protectedPathDenial` (`hooks.ts:434-461`) splits a Bash command on `[\s;&|<>()"']+` and pushes
**every** word as a target, with no cap. Each target already costs one `realResolve` — which loops
`realpathSync` up the tree, a blocking syscall, on the Electron **main** thread. Task 1 makes it two
(one per vouched base).

An agent sends a `Bash` payload with 50,000 words. Main blocks. Every other agent's hook blocks
behind it. The shim's own `setTimeout(() => process.exit(0), 5000)` fires -> **exit 0, no stdout ->
allow** — the same fail-open as B1, reached by CPU instead of by byte count.

01-24 is caught between the two: cap the buffer and you get B1; do not cap and you get M1. Both land
on allow. The only sound resolution is deny-on-overflow (see B1) plus a hard cap on the number of
candidate targets per payload.

### M2 — a pre-existing `OTEL_EXPORTER_OTLP_{METRICS,LOGS}_HEADERS` in the operator's env silently 401s the whole floor

`pty.ts` spreads `...process.env` first and adds the generic `OTEL_EXPORTER_OTLP_HEADERS` last. In the
OTel spec and in the JS SDK, the **signal-specific** variable *replaces* the generic one; it does not
merge. An operator who already exports `OTEL_EXPORTER_OTLP_METRICS_HEADERS` for their own collector
keeps that value, the hive token is never sent, and every Claude agent's metrics 401 forever. The
breaker and every cost cap go blind. Plan 01-25's T-P25-07 anticipates a *spelling* mistake but not
this *precedence* one. Set the signal-specific names explicitly, or delete any inherited
`OTEL_EXPORTER_OTLP_*_HEADERS` from the child env.

### M3 — unbounded session-id cardinality survives authentication

`session.id` is still read off the payload (correctly — only Claude Code knows it), and
`session(agentId, sessionId)` (`telemetry.ts:438-448`) allocates a `SessionAccum` per unseen key with
no cap. An authenticated agent POSTs 10^6 distinct `session.id` values with its own valid token:
`sessions` and `agentSessions` grow without bound, and `aggregateLive` — which iterates the agent's
whole set on **every** publish — goes quadratic. Main-process memory and CPU exhaustion, post-fix.
`SESSION_MAX_AGE_MS` sweeps only at 24h. The composite key does not bound cardinality; it only bounds
*whose* accumulator you can touch. Add a per-agent session-set cap (LRU evict) — the plan touches all
four access sites anyway, so it is the cheap moment to do it.

### M4 — the collector's 401 is a token oracle, on the same trust surface where 01-24 explicitly preserves non-oracle behaviour

01-24 Task 2: *"Keep the reply shape byte-identical: an unauthorised peer still gets `conn.end('{}')`
… This socket answering differently is itself an oracle, which is why the current code answers the
same either way."*
01-25 Task 1: *"on `null` respond `401` and return."*

Two listeners, same trust boundary, opposite rulings, in the same gap-closure set. The 401 is
defensible — the OTel SDK needs it to surface T-P25-07's outage loudly, and brute-forcing a 256-bit
hex token is infeasible — but the plans should say so out loud rather than leave a reviewer to notice
the contradiction. Low practical risk; the inconsistency is the finding.

### M5 — the session-id guard sits at one sink; the poisoned value still reaches storage

Even with B3 fixed, `hive.recordSession` (`hive.ts:1143`) writes the unvalidated `session_id` into
`registry.json`, appends it to the hive log, and **git-commits it** — before any sink sees it. The
same string is `AgentUsageSample.sessionId`, so it also reaches `appendCostLedger` and the SQLite
mirror. A guard "at the sink" leaves attacker-chosen strings in three durable stores; JSON-escaped
newlines survive the parse, so the value is not even guaranteed single-line. Validate at
`recordSession` **as well** — one guard in the shared writer is a smaller diff than a guard per
consumer, and every consumer routes through it.

---

## INFORMATIONAL — things I attacked and could not break

- **`within()` is sound.** Measured: `within('/hive/bin', '/hive/binary') === false`. It is a
  `path.relative` segment test, not a prefix match, and it rejects absolute results (cross-drive on
  win32) and case-folds on win32. No sibling-prefix bypass.
- **`realResolve()` handles the path tricks.** It realpaths the deepest existing ancestor, so
  symlinks, post-resolution `..`, win32 8.3 short names (`HIVE~1`), and trailing-dot/space variants
  (`bin.`) all canonicalize — because the protected directories `<hive>/bin`, `<hive>/.git`,
  `<hive>/agents` **exist**, and `realpathSync` on an existing directory returns the canonical form.
  UNC and `\\?\` prefixes normalize through `path.resolve`/`relative` consistently on both sides of
  the comparison. **The defect is the missing base, not the resolution.**
- **`agentForToken` as a plain `Map.get` is the right call.** No per-byte compare, no length
  shortcut, nothing to leak a prefix — and the local attacker has `/proc` anyway, so a timing channel
  is not the weak link. The doc-comment contract ("`null` means REFUSE, never fall back to a
  payload-claimed id") is the load-bearing part and the plan states it.
- **No token is written to disk by any of these three plans.** No new file, no new permission
  surface, no `.secrets`-style artifact. Checked.
- **No secret is logged.** 01-25 explicitly forbids logging the token and the claimed `agent.id`, and
  reuses `authorized()`'s throttled-reject shape. `accountPool.sanitize()` already scrubs the error
  text on the pool path. The renderer has zero `dangerouslySetInnerHTML` sites, so attacker-controlled
  `error`/`tool` strings pushed on `telemetry:event` are React-escaped.
- **01-26 Task 2 (proxy token) has no bypass I could construct.**
- **01-24 Task 3 (`agentForToken` + counted win32 skip) has no bypass.** Converting the
  `if (win32) return;` at `test/net-binding.test.cjs:319-325` into an options-object `skip` is
  correct — a `node:test` callback that returns normally is a PASS, and that test is GATE-01's own
  socket-watchdog case, which has never run on the operator's platform while reporting green.

---

## What has to change before any of this merges

1. **01-24 Task 2**: deny-on-overflow and deny-on-timeout. Never bare-destroy a PreToolUse
   connection. (B1)
2. **01-24 Task 1**: either add `payload.cwd` as an *additional* candidate base (safe for a
   deny-list) or drop behaviour case 2 and say plainly that `cd`-relative targets are not covered.
   Add `~`/`$HOME` expansion. Cap the candidate-target count. (B2, H3, M1)
3. **01-25 Task 3**: reject a leading `-` in `VALID_SESSION_ID`, and validate in `recordSession` too,
   not only at the argv sink. (B3, M5)
4. **01-25 threat register**: T-P25-01/02/03 -> `reduce`; cite REQUIREMENTS.md:569's `/proc` ceiling,
   not GATE-02; add a row for the shared-account 401 blast radius. (B4, H2)
5. **01-25 Task 2**: mint a *separate* collector token, or use the signal-specific header names, and
   strip inherited `OTEL_EXPORTER_OTLP_*_HEADERS` from the child env. (H1, M2)
6. **01-26 Task 1**: name chunking in the restated ceiling, state that the size escapes are
   agent-triggerable in one command, and add commit-path benign controls (a `.ts` with
   `token: string`, a config-shaped JSON) before widening pattern 5. (H4)
