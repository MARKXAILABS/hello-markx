---
phase: 01-finish-the-floor
artifact: red-team review, lens 2 of 5 — VACUOUS VERIFICATION
reviewed: 2026-08-22
target: .planning/phases/01-finish-the-floor/01-24-PLAN.md … 01-31-PLAN.md
tree: HEAD fd66993 (plans authored against 47a48cd)
depth: deep (every criterion traced to live source)
findings:
  blocker: 21
  warning: 14
  total: 35
status: issues_found
---

# Red-team lens 2: Vacuous Verification

**Single question asked of every acceptance criterion, `must_haves.truth`,
`artifacts[].contains` and `key_links[].pattern` in the eight gap-closure plans:
CAN IT FAIL?**

Method: every `contains` and `pattern` string was executed against the live tree at
`fd66993`. Every `must_haves.truth` and `<done>` clause was traced to the source it
claims to constrain, and the cheapest wrong implementation that still satisfies it was
constructed. Where the plan names a line number, `sed -n` was used to confirm it.

**Headline: 25 of the 46 machine-checkable gates in these eight plans (54%) are already
GREEN on the untouched tree.** They cannot distinguish the finished work from doing
nothing at all. Plan 01-30 — the plan chartered specifically to remove fake
verification — has a gate-satisfaction rate of **6 of 6 green before a byte is edited**,
including a `contains: "sock_token"` that is satisfied by the exact vacuous
`assert.match(body, /sock_token/)` the plan exists to delete.

---

## A. Systemic: the frontmatter gate table, executed

Command run for each row: `grep -c "<pattern>" <file>` at `fd66993`.

| Plan | Gate | File | Hits at HEAD | Verdict |
|---|---|---|---|---|
| 24 | `contains: agentForToken` | src/main/hooks.ts | 0 | red (ok) |
| 24 | `contains: \.\./\.\./bin` | test/net-binding.test.cjs | 0 | red (ok) |
| 24 | `pattern: isAbsolute` | src/main/hooks.ts | **2** (`:69`, `:147`) | **GREEN AT HEAD** |
| 24 | `pattern: setTimeout` | src/main/hooks.ts | 0 | red (ok) |
| 24 | `pattern: agentForToken` | src/main/hooks.ts | 0 | red (ok) |
| 25 | `contains: resolveAgentForToken` | src/main/telemetry.ts | 0 | red (ok) |
| 25 | `contains: OTEL_EXPORTER_OTLP_HEADERS` | src/main/pty.ts | 0 | red (ok) |
| 25 | `contains: export const VALID_SESSION_ID` | src/main/transcript.ts | 0 | red (ok) |
| 25 | `contains: x-hive-token` | test/telemetry-auth.test.cjs | n/a (new) | red (ok) |
| 25 | `pattern: resolveAgentForToken` | src/main/telemetry.ts | 0 | red (ok) |
| 25 | `pattern: x-hive-token` | src/main/pty.ts | 0 | red (ok) |
| 25 | `pattern: VALID_SESSION_ID` | src/main/index.ts | 0 | red (ok) |
| 26 | `contains: revokeProxyToken` | src/main/hive.ts | **4** | **GREEN AT HEAD** |
| 26 | `contains: sk_live` | test/voice-messages.test.cjs | **1** (`:191`) | **GREEN AT HEAD** |
| 26 | `contains: FLOOR-04` | test/hive-durability.test.cjs | **5** | **GREEN AT HEAD** |
| 26 | `contains: generation` | test/hive-proxy-token.test.cjs | n/a (new) | red (ok) |
| 26 | `pattern: proxyTokens` | src/main/hive.ts | **4** | **GREEN AT HEAD** |
| 26 | `pattern: sk\[-_\]` | hive.ts / voice-messages | 0 | red — but see BL-26-04 |
| 27 | `contains: BUDGET_STEER_FRACTION` | src/main/breaker.ts | **2** | **GREEN AT HEAD** |
| 27 | `contains: ENOENT` | src/main/delivery.ts | 0 | red (ok) |
| 27 | `contains: top spender` | test/breaker.test.cjs | 0 | red (ok) |
| 27 | `contains: queueFile` | test/delivery-main.test.cjs | 0 | red (ok) |
| 27 | `pattern: soft` | src/main/breaker.ts | 0 | red — but see BL-27-02 |
| 27 | `pattern: queueFile = null` | src/main/delivery.ts | **1** (`:373`) | **GREEN AT HEAD** |
| 28 | `contains: setQueues` | store.ts | **4** | **GREEN AT HEAD** |
| 28 | `contains: queueIt` | MessageQueueComposer.tsx | **3** | **GREEN AT HEAD** |
| 28 | `contains: blocked` | useHive.ts | **11** | **GREEN AT HEAD** |
| 28 | `contains: ok: false` | test/renderer-queue.test.cjs | n/a (new) | red — see WR-28-03 |
| 28 | `pattern: await` | MessageQueueComposer.tsx | **2** (`:96`, `:119`) | **GREEN AT HEAD** |
| 28 | `pattern: 'blocked'` | useHive.ts | **5** | **GREEN AT HEAD** |
| 29 | `contains: custom` | autoMode.ts | **2** | **GREEN AT HEAD** |
| 29 | `contains: textOverflow` | AgentCard.tsx | **4** (`:261,310,351,387`) | **GREEN AT HEAD** |
| 29 | `contains: SIDEBAR_COLLAPSE_WIDTH` | test/renderer-runstate.test.cjs | **2** (`:14`, `:195`) | **GREEN AT HEAD** |
| 29 | `pattern: AGENT_PROVIDER_PRESETS` | autoMode.ts | 0 | red (ok) |
| 29 | `pattern: MIN_WIN` | test/renderer-runstate.test.cjs | 0 | red (ok) |
| 30 | `contains: sock_token` | test/hook-auth-roundtrip.test.cjs | **8** | **GREEN AT HEAD** |
| 30 | `contains: npm test` | test/ci-config.test.cjs | **7** | **GREEN AT HEAD** |
| 30 | `contains: latest*.yml` | .github/workflows/release.yml | **4** | **GREEN AT HEAD** |
| 30 | `contains: attestation` | SECURITY.md | **2** | **GREEN AT HEAD** |
| 30 | `pattern: npm test` | test/ci-config.test.cjs | **7** | **GREEN AT HEAD** |
| 30 | `pattern: SHA256SUMS` | .github/workflows/release.yml | **7** | **GREEN AT HEAD** |
| 31 | `contains: drainForStop` | HIVE.md | **1** (`:138`) | **GREEN AT HEAD** |
| 31 | `contains: enterprise knowledge graph` | test/repo-claims.test.cjs | **1** (`:348`) | **GREEN AT HEAD** |
| 31 | `contains: FLOOR-04` | .planning/REQUIREMENTS.md | **5** | **GREEN AT HEAD** |
| 31 | `pattern: floor-inspection` | test/repo-claims.test.cjs | 0 | red (ok) |
| 31 | `pattern: redactSecrets` | .planning/REQUIREMENTS.md | **1** | **GREEN AT HEAD** |

**25 / 46 green before any work.** The three worst are diagnostic of the class:

- **`contains: "drainForStop"` on HIVE.md (01-31)** is satisfied by
  `HIVE.md:138`'s `"ADVANCED by drainForStop() (hive.ts:1338)"` — the *precise stale
  anchor the plan exists to correct*. The gate is satisfied by the defect.
- **`contains: "sock_token"` on test/hook-auth-roundtrip.test.cjs (01-30)** is satisfied
  by `:193`'s `assert.match(body, /sock_token/)` — the *precise vacuous pin the plan
  exists to replace*. The gate is satisfied by the defect.
- **`contains: "textOverflow"` on AgentCard.tsx (01-29)** returns 4 hits, none of which
  is the model chip at `:314-328`. The chip can stay unbounded and the gate stays green.

### BL-SYS-01 — 25 of 46 frontmatter gates cannot fail (BLOCKER)

**Wrong implementation that defeats them:** `git checkout .` — do nothing at all. Every
row marked GREEN above still reports satisfied.

**Fix:** every `contains` / `pattern` value must be re-chosen so
`grep -c "<value>" <file>` returns 0 on `fd66993`. Where the target string genuinely
pre-exists, pin the *shape of the change* instead:

```yaml
# 01-30, instead of `contains: sock_token`:
contains: "sock_token[\"']?\\s*[:=]"        # 0 hits at fd66993
# 01-29, instead of `contains: textOverflow`:
contains: "shortModel\\(row\\?\\.model\\)[\\s\\S]{0,400}?textOverflow"
# 01-31, instead of `contains: drainForStop`:
contains: "drainForStop\\(\\)(?![^\\n]*hive\\.ts:1338)"
```

Alternatively delete the gate. A gate that always passes is worse than no gate: it
consumes review budget and prints a green tick.

### BL-SYS-02 — the `pattern` gates are satisfied by comments and unused imports (BLOCKER)

Every `key_links[].pattern` in all eight plans is a bare symbol grep over raw source.
None is comment-stripped and none is assignment-shaped. This is *the same defect class
as `c/CR-02`*, the Critical finding that `assert.match(source, /sock_token/)` is
satisfied by `// payload.sock_token = …` — re-committed 16 times in the frontmatter of
the plans written to fix it.

Cheapest wrong implementations, one per plan:

| Plan | Gate | Defeated by |
|---|---|---|
| 24 | `pattern: setTimeout` | `// TODO: add conn.setTimeout` in a comment. Also `conn.setTimeout(30_000)` with **no `'timeout'` listener** — node's default action on `'timeout'` is to emit the event and *keep the socket open*, so the idle-drop never happens and the gate is green. |
| 24 | `pattern: isAbsolute` | already satisfied by `:69`'s import. Nothing added. |
| 25 | `pattern: VALID_SESSION_ID` | `import { VALID_SESSION_ID } from './transcript';` and never call `.test()`. Note `<done>` says `grep -vn "^\s*[/*]" src/main/index.ts \| grep -c "VALID_SESSION_ID"` is at least 1 — an unused **import line is not a comment**, so it satisfies the strengthened check too. |
| 26 | `pattern: proxyTokens` | already satisfied 4× by the unfixed code. |
| 27 | `pattern: soft` | the word `soft` in the rewritten doc block. The plan *instructs* writing "the band is advisory" prose — one use of "soft band" in a comment satisfies it. |
| 27 | `pattern: queueFile = null` | already satisfied by `delivery.ts:373`'s `if (!path) { this.queue = null; this.queueFile = null; …}` — **the line the plan's own `<interfaces>` block quotes as the current, unfixed code.** |
| 28 | `pattern: await` | already satisfied by `:96` `await window.cth.attachFiles()` and `:119` `await window.cth.saveClipboardImage()`, neither of which is `queueIt`. |
| 28 | `pattern: 'blocked'` | already satisfied 5× at `:555, :566, :727, :733, :761`, none of which is the Stop arm at `:526-535`. |
| 29 | `pattern: AGENT_PROVIDER_PRESETS` | unused import. |
| 29 | `pattern: MIN_WIN` | a test that reads `src/main/index.ts`, regexes `MIN_WIN`, and asserts nothing. |
| 30 | `pattern: SHA256SUMS`, `pattern: npm test` | already satisfied. |
| 31 | `pattern: redactSecrets` | already satisfied by REQUIREMENTS.md's current FLOOR-04 row. |

**Fix:** every pattern must be (a) 0-hit at `fd66993`, and (b) shaped so a comment
cannot satisfy it — anchor on an assignment, a call with arguments, or a two-symbol
adjacency.

---

## B. Per-plan BLOCKERs

### 01-24 — hooks.ts

#### BL-24-01 — acceptance criterion 2 is UNSATISFIABLE by the specified implementation (BLOCKER)

`<behavior>`: *"Same agent, `Bash` command `cd $HIVE_ROOT && cat >> bin/cth-hook.cjs` →
DENIED."*

`<action>` enumerates exactly two bases: `registry().agents[agentId]?.cwd` and
`join(hiveRoot, 'agents', agentId)`. Traced at source:

- `protectedPathDenial` (`src/main/hooks.ts:434`) expands `$HIVE_ROOT`, then splits on
  `/[\s;&|<>()"']+/`, producing the words `cd`, `<root>`, `cat`, `bin/cth-hook.cjs`.
- `bin/cth-hook.cjs` is relative. Joined onto either declared base it becomes
  `<root>/agents/a-1/bin/cth-hook.cjs`.
- `denyReason` (`:484`): not `within(<root>/bin, …)`, not `within(<root>/.git, …)`,
  not the socket. It *is* `within(<root>/agents, …)`, and `owner === agentId`, so the
  code takes the explicit **ALLOW** path at `:512-515`.
- The bare word `<root>` matches no deny branch either.

**Result: ALLOW.** The criterion is red against the implementation the same plan
mandates. The executor will resolve the contradiction by either silently adding
`hiveRoot` as a third base (deviating from `<action>`, and changing the blast radius of
criterion 4) or by quietly dropping the case. Both outcomes are undetectable in the
SUMMARY.

**Fix:** either add `this.hive.root()` to the enumerated base list in `<action>` and
re-derive criterion 4 (`notes.md` → `<root>/notes.md`, still allow) against it, or
delete criterion 2 and state in the plan that a `cd`-then-relative command is a named
residual of the "gate sees a string, not a shell" ceiling already written at
`hooks.ts:427-432`.

#### BL-24-02 — `must_haves.truth` #2 describes an unreachable branch (BLOCKER)

> *"A relative target for which main knows no base is denied rather than silently allowed"*

`protectedPathDenial:435-436` reads `const root = this.hive.root(); if (!root) return null;`
— `denyReason` is **never** entered without a hive root. And with a hive root,
`join(hiveRoot,'agents',agentId)` is always computable, so the candidate set is never
empty. The "deny when no base is known" branch is dead code on every public path.

Worse, the containing statement is `return null` = **ALLOW**, so at the level above the
truth is *false*: no hive root means every target is allowed, which is the exact
"silently allowed" the truth forbids.

**Wrong implementation that satisfies it:** write the branch, then test it by calling
the private `denyReason` through `srv['denyReason'](…)`. The test is green, the branch
is unreachable in production, and the truth is reported TRUE.

**Fix:** move the criterion up to `protectedPathDenial` — "with no hive root, a
protected-path decision is refused, not allowed" — or delete it and record the
`if (!root) return null` fail-open as a named ceiling.

#### BL-24-03 — the `# pass` arithmetic is internally contradictory (BLOCKER)

- Task 3 `<behavior>`: *"the file's `# pass` count is one LOWER than it is today."*
- `<verification>`: *"`# skip` is one higher than today's run and `# pass` one lower on win32."*
- Tasks 1 and 2 add **at least nine** new cases to the same file
  (5 relative-path + 4 framing) — so `# pass` for `test/net-binding.test.cjs` will be
  roughly `today + 8`, never `today − 1`.

A criterion that cannot be true invites a narrative "verified" in the SUMMARY. This is
the same document class the phase is trying to clean.

**Fix:** state it as `# skip` is +1 and `# pass` is `today − 1 + N_added`, and require
the SUMMARY to publish `N_added` explicitly.

#### BL-24-04 — task 2's `<done>` grep does not test what its prose says (BLOCKER)

> `grep -vn '^\s*[/*]' src/main/hooks.ts | grep -c 'setTimeout'` **is at least 1 inside `listenOn`**

The command is file-wide; it has no notion of `listenOn`. `grep -vn '^\s*[/*]'` strips
only *full-line* comments, so a trailing `foo(); // setTimeout` counts. And
`conn.setTimeout(N)` with no `'timeout'` handler satisfies the same count while leaving
the connection open forever — defeating truth #4 (*"cannot hold the connection open
forever"*) with the check still green.

**Fix:** require `conn.on('timeout', () => conn.destroy())` as the pinned shape, and
prove it with a test that connects, writes nothing, and asserts the socket emits
`'close'` within `2 × interval`.

---

### 01-25 — telemetry / pty / index / transcript

#### BL-25-01 — `must_haves.truth` #6 is satisfied by deleting the comment (BLOCKER)

> *"No comment in `telemetry.ts` claims a transport posture the file does not implement"*

No grep, no test, no `<done>` clause checks it. **Cheapest wrong implementation: delete
`telemetry.ts:28-30` entirely.** The truth is then vacuously satisfied and the file
documents nothing. A second cheap defeat: rewrite the comment to be *vaguer* rather than
*truer* ("this handler is local") — unfalsifiable and green.

Same defect in 01-26 truth #5 (`hive.ts` revocation posture) and 01-28 truth #4
(`useHive.ts` deleted drain) — see BL-28-04, which is the sharpest instance.

**Fix:** make it a positive claim with a machine check, e.g.
`assert.match(header, /per-agent capability minted at the PTY/)` plus
`assert.doesNotMatch(header, /mirrors\s+`?slack\.ts/)` in `test/repo-claims.test.cjs`.

#### BL-25-02 — task 1's `<done>` grep is defeated by one character (BLOCKER)

> `grep -vn "^\s*[/*]" src/main/telemetry.ts | grep -c "attrs\['agent.id'\]"` is 0

Defeated by any of: `attrs?.['agent.id']` (optional chaining breaks the literal),
`attrs["agent.id"]` (double quotes), `const K = 'agent.id'; attrs[K]`,
`attrs['agent' + '.id']`. Each leaves the payload-claimed id being read while the check
reports 0.

Secondary: `grep -c` returning `0` exits **1**. Under any `set -e` harness this
"success" condition fails the run, which trains the executor to ignore it.

**Fix:** assert behaviourally instead — a POST with A's token and
`attrs['agent.id']='victim'` must produce `getAgentUsage('victim') === null` *and*
`getAgentUsage('A') !== null`. That is already behaviour case 3; the grep adds nothing
but a false sense of a structural pin.

#### BL-25-03 — truth #5 has no automated check anywhere in the plan (BLOCKER)

> *"The shipped window can be made narrow enough for the responsive sidebar collapse to fire"*

Task 3's `<done>` is *"`MIN_WIN.width` is 960 and the comment states why"* — a manual
read. The only automated pin is in **plan 01-29 task 3**, which is BLOCKED by
BL-29-03 below. Net: the truth is verified by nothing in either plan.

Further, changing `MIN_WIN` does not by itself make the collapse reachable — `:2670`
`minWidth: MIN_WIN.width` and `:2525` `clampBounds` must both still consume it. No
criterion asserts either consumption. **Cheapest wrong implementation:** set
`MIN_WIN.width = 960` and hardcode `minWidth: 1280` at `:2670`. Every stated criterion
in 01-25 *and* 01-29's pin stay green; the feature stays unreachable.

**Fix:** pin `minWidth` and `clampBounds` to the constant, not just the constant's
value — e.g. assert `src/main/index.ts` contains no numeric literal in the
`minWidth:`/`minHeight:` position.

#### BL-25-04 — bounding `VALID_SESSION_ID` at `{1,128}` silently narrows two existing call sites (BLOCKER)

`transcript.ts:73`'s regex is consumed at `:77` and `:105`. Adding `{1,128}` makes a
129+ char session id fail `transcriptPathFor`/`projectDir` resolution, which currently
succeeds. No criterion in the plan covers those two call sites; task 3's
`<verify>` does run `test/transcript-project-dir.test.cjs`, but only if that file
happens to carry a long-id fixture — it does not.

**Cheapest wrong implementation:** ship it. Behaviour case *"a 129-char run is false"*
goes green and a real long session id stops resolving in the transcript reader.

**Fix:** either bound only the new index.ts guard (`VALID_SESSION_ID` stays unbounded,
a separate `MAX_SESSION_ID_LEN` is checked at the sink), or add a criterion that the two
`transcript.ts` call sites still accept a 200-char id.

---

### 01-26 — hive.ts redaction + proxy tokens

#### BL-26-01 — truth #1's Stripe half is already green, via the wrong pattern (BLOCKER)

`test/voice-messages.test.cjs:191` already carries
`['api_key assignment', 'config api_key=sk_live_th_isIsASecretValue123 stored', 'sk_live_th_isIsASecretValue123']`
and it passes **today** — because pattern 5 matches `api_key=` and replaces the value.
It exercises **nothing** in pattern 3.

**Cheapest wrong implementation:** do not widen pattern 3 at all. Satisfy
*"`sk_live_` + a 16+ char run is redacted"* by adding a second labelled fixture
(`token=sk_live_…`). `contains: "sk_live"` is green (already was), every SECRETS case is
green, and a bare `sk_live_EX_H8xQ2eZvKYlo2C…` in a workspace file still reaches git
history.

**Fix:** the criterion must specify an **unlabelled** fixture with no `[:=]` anywhere in
the string, e.g. `'stripe sk_live_EX_H8xQ2eZvKYlo2CabcdEFGH end'`, and assert
`redactSecrets(x) !== x`.

#### BL-26-02 — the inverted FLOOR-04 ceiling test becomes three negatives with no positive control (BLOCKER)

Read at source, `test/hive-durability.test.cjs:305-341` today asserts:
`history.includes(MISSED_SECRET)` (positive), `assert.match(history, /"token": "…"/)`
(positive), and a final `includes(CAUGHT_SECRET) === false` (negative, explicitly the
anti-vacuity control).

After the plan's inversion **all three are negatives**. The plan's `<action>` says only
*"keep the final control … exactly as it is"* — but that control is itself a negative,
so it no longer distinguishes anything.

**Cheapest wrong implementation:** make `flushCommit` a no-op (or let its retry loop
swallow a git failure — it already has one). Nothing is committed, `git log -p` is
empty, and all three assertions pass. The test reports the ceiling as risen while the
scrub is not running.

The `<behavior>` list *does* name the fix — *"and the rest of that commit still
lands"* — but `<action>` never instructs adding it, and `<done>` does not require it.

**Fix:** promote that clause into `<action>` as a mandatory assertion:
`assert.match(history, /underscore-key\.md/)` plus a benign marker string from the same
commit that MUST be present.

#### BL-26-03 — task 2's `<done>` is an unfalsifiable command (BLOCKER)

> `grep -vn '^\s*[/*]' src/main/hive.ts | grep -n "revokeProxyToken"` **shows the call inside an identity guard**

`grep` cannot show containment. The pipeline emits matching lines with renumbered
offsets; the function *declaration* at `:719-735` alone guarantees non-empty output.
Output is non-empty at `fd66993` with zero edits. The condition is always satisfied.

**Fix:** assert the shape:
`assert.match(hiveSrc, /child\.on\('exit',[\s\S]{0,200}?if \(this\.proxyTokens\.get\(agentId\) === (spawnToken|tok)\)/)`
— or better, drop the structural clause; task 2's two-generation behavioural test is the
real evidence.

#### BL-26-04 — `key_links[].pattern: "sk\\[-_\\]"` is ambiguous between "always green" and "never green" (BLOCKER)

The YAML value resolves to the string `sk\[-_\]`. As an **ERE** it matches the literal
text `sk[-_]` (which the widened regex will contain → green). As a **fixed string** it
looks for the seven characters `sk\[-_\]`, which will never appear anywhere → red
forever regardless of correctness.

Nothing in the plan states which. Whichever the tool does, the gate carries no
information about the change.

**Fix:** `pattern: "sk\\[-_\\]\\(\\?:ant\\[-_\\]\\)\\?"` is still comment-satisfiable;
better to drop the pattern and let the `BENIGN`/`SECRETS` behaviour carry it.

#### BL-26-05 — truth #3 (`BENIGN` control) cannot see the failure mode the widening introduces (BLOCKER)

The widening is `(\s*[:=]\s*)` → `(["']?\s*[:=]\s*)`, i.e. an optional quote *before* the
delimiter. The `BENIGN` list (`test/voice-messages.test.cjs:225-231`) is six strings and
**none contains a quote character**. The control is structurally incapable of catching a
regression in the thing being changed.

**Cheapest wrong implementation:** the widening eats
`He said the "secret" was: nothing much` → `secret=[redacted]` in a commit message or a
Slack DM. All six BENIGN strings still pass. Green.

**Fix:** add quote-adjacent benign fixtures to the criterion list, e.g.
`'The "token" field is documented in HIVE.md'` and
`'Config keys: "secret" and "password" are optional.'`

---

### 01-27 — breaker + delivery

#### BL-27-01 — `pattern: "queueFile = null"` is satisfied by the unfixed line the plan quotes (BLOCKER)

`src/main/delivery.ts:373`:
`if (!path) { this.queue = null; this.queueFile = null; return []; }`

This is the current, defective loader's *first* line, reproduced verbatim in the plan's
own `<interfaces>` block. The gate declared as the link "from `loadQueue`'s catch branch
to `saveQueue`" is satisfied by a branch that is not the catch branch, on the untouched
tree.

**Cheapest wrong implementation:** nothing. `git status` clean.

**Fix:** `pattern: "code !== 'ENOENT'"` (0 hits at `fd66993`), or an assignment-adjacency
regex anchored on `catch`.

#### BL-27-02 — `pattern: "soft"` is satisfied by the comment the plan instructs writing (BLOCKER)

`<action>` says: *"Rewrite that doc block. … it must now say that the band is advisory."*
Any such sentence containing the word "soft" satisfies the gate. The gate for
"the soft band no longer returns early" is satisfied by prose *describing* that it no
longer returns early, with the `return` still there.

**Cheapest wrong implementation:** rewrite the doc block, change nothing else. Behaviour
case 4 (band-only → `ceiling:'steering'`) passes. Cases 1-3 fail — *unless* the executor
writes them as assertions on `evaluate()`'s return shape (which the plan warns against
but does not prevent) against a hand-built input, in which case they can be tuned to
pass. See WR-27-01.

**Fix:** `pattern: "softTrip"` or whatever the local variable is named, plus a 0-hit
check at `fd66993`.

#### BL-27-03 — the on-disk-bytes criterion is a negative a test that never enqueues satisfies (BLOCKER)

> *"a subsequent `enqueue` does NOT overwrite the file — the on-disk bytes are identical afterwards"*

There is **no positive control** requiring that an `enqueue` after a *successful* load
DOES change the bytes.

**Cheapest wrong implementation:** the test's `enqueue` throws (unrelated fixture
problem), is swallowed, and the bytes are trivially unchanged. Green. Or: the executor
points `queuePath()` at a path that yields `ENOENT` rather than a genuine read failure —
the fixture never enters the branch under test, `saveQueue` short-circuits on `!path`
for the wrong reason, bytes unchanged, green.

`<behavior>` line 2 (*"The next tick, with the read now succeeding, loads all N items"*)
is close but tests the *load*, not the *write*.

**Fix:** add as a mandatory criterion: after the successful re-load, one `enqueue`
produces `N+1` items on disk. Without that, a permanently-disarmed `loadQueue` (return
`[]` and never arm, ever) satisfies every stated criterion in task 2.

---

### 01-28 — renderer store / composer / useHive

#### BL-28-01 — truth #1's "the reason is on screen" half is checked by nothing (BLOCKER)

> *"When main declines a queued message, the operator's text is still in the textarea and the reason is on screen"*

Enumerating the plan's own checks:
- store tests (behaviour 1-4) verify `enqueueMessage` **resolves** the result. They do
  not touch the composer.
- behaviour 5 is a comment-stripped structural scan for `setText('')` ordering. It sees
  `setText`, not rendering.
- `<action>` states flatly: *"no test here can press Enter and observe the textarea."*

Nothing at all checks *"the reason is on screen"*.

**Cheapest wrong implementation:**
```tsx
const queueIt = async () => {
  const r = await enqueueMessage(agent.id, body);
  if (!r?.ok) return;               // reason discarded
  setText(''); setAttachments([]);
};
```
Every stated criterion passes. The operator sees the message survive with no explanation
of why nothing happened — which is the review finding `b/CR-01` verbatim.

**Fix:** add a `renderToStaticMarkup` assertion that `statusHint`'s rendered output
contains a supplied refusal string, driven by seeding the store's error state directly.
`renderToStaticMarkup` *can* see that (the plan itself relies on it for 01-29 task 2).

#### BL-28-02 — task 2's prescribed test is tautological: it bypasses the guard it claims to test (BLOCKER)

> *"Test the DECISION, not the effect: extract nothing and add no dependency — drive the store's `updateAgent` through the same shape the effect uses and assert the resulting agent record."*

The guard being added lives **inside the effect** in `useHive.ts:526-535`. A test that
calls `updateAgent(id, {status:'idle'})` directly and asserts the record is `idle`
exercises `store.updateAgent`, never the guard. It is **GREEN before and after** the
source change.

**Cheapest wrong implementation:** write exactly what the plan says. Four green tests,
zero coverage, and the SUMMARY reports the guard "pinned by four status cases."

Compounding it, `<action>` supplies an escape hatch: *"If the effect body genuinely
cannot be reached from `node --test`, say so explicitly and pin the guard with a
comment-stripped structural assertion."* The executor will take it — `useHive.ts` is a
React hook and cannot be driven under `node --test` without a renderer. So the four
behavioural criteria collapse to one source grep.

**Fix:** require the guard to be extracted as a pure exported function —
`export function stopArmDecision(current: AgentStatus, blocked: boolean): AgentPatch | null`
— in `useHive.ts` or a sibling module, called from the effect, and driven directly by
the four cases. That is a smaller change than the plan already mandates and it makes
every criterion real.

#### BL-28-03 — `must_haves.truth` #4 is defeated by deleting three words (BLOCKER)

> *"No comment in `useHive.ts` describes the deleted renderer drain as the live delivery path"*

`<done>`: `grep -n "effect #4" src/renderer/src/hooks/useHive.ts` returns only the
tombstone at `:766`.

**Cheapest wrong implementation:** at `:873` change
*"effect #4 above then drains it to his PTY"* → *"the renderer then drains it to his
PTY"*, and at `:908` *"effect #4 types it into the REPL"* → *"the composer effect types
it into the REPL"*. The grep returns only `:766`. Green. Both comments still name a
deleted renderer path as live — the exact `c/WR-08` finding, now harder to find because
the searchable token is gone.

**Fix:** grep for the *claim*, not the label:
`assert.doesNotMatch(src, /(renderer|effect)[^.\n]{0,60}(drains?|types?)[^.\n]{0,40}(PTY|REPL)/i)`.

#### BL-28-04 — `pattern: "await"` and `contains: "blocked"` are the two weakest gates in the set (BLOCKER)

`await` already appears twice in `MessageQueueComposer.tsx` (`:96`, `:119`), in
`onAttach`/`onPaste` — neither is `queueIt`. `blocked` appears 11 times in `useHive.ts`
and `'blocked'` 5 times, none of them in the Stop arm at `:526-535`.

Both are green at HEAD; both survive the feature being deleted entirely.

**Fix:** `pattern: "await enqueueMessage"` (0 hits) and
`pattern: "status === 'blocked'"` (0 hits at `fd66993` — confirmed).

---

### 01-29 — autoMode / AgentCard / cross-file pin

#### BL-29-01 — task 3's RED demonstration is not mechanically achievable as specified (BLOCKER)

> *"Write the test FIRST and confirm it would have been RED at `47a48cd` (`MIN_WIN.width` was 1280) — run it against the pre-01-25 value if the tree already carries the fix, and paste the output. A pin that has never been seen failing is not a pin."*

By wave ordering (01-29 is wave 3, `depends_on: ["01-25"]`), the tree **will** carry
`width: 960` when this runs. To see RED the executor must either:
- temporarily edit `src/main/index.ts` — **not in this plan's `files_modified`**, owned
  by 01-25, and `use_worktrees: false` makes a concurrent edit a lost update; or
- point the extraction at a different source text — impossible, because the plan
  specifies the test *"Read `src/main/index.ts`"* with a hardcoded path and never asks
  for the extractor to be factored as `extractMinWidth(sourceText)`.

**Cheapest wrong implementation:** write the pin, run it green, and write
*"confirmed it would have been RED against 1280"* in the SUMMARY without running
anything. This is precisely the "vacuous verification" class the phase was chartered to
remove, re-created in the plan that carries the anti-drift pin.

**Fix:** mandate the extractor be a pure function over source text
(`function minWinWidth(src) { … }`), and require the RED demo to run it against
`execFileSync('git', ['show', '47a48cd:src/main/index.ts'])` — no working-tree
mutation, fully reproducible, and it makes the demo a permanent second test case.

#### BL-29-02 — the pin asserts the constant, not the consumption (BLOCKER)

The pin is `MIN_WIN.width < SIDEBAR_COLLAPSE_WIDTH`. `src/main/index.ts:2670` applies
`minWidth: MIN_WIN.width` and `:2525-2526` applies it in `clampBounds`. Neither
application is pinned.

**Cheapest wrong implementation:** `const MIN_WIN = { width: 960, height: 800 };` and
`minWidth: 1280` hardcoded at `:2670`. Pin green, four `sidebarLayout` tests green,
window still cannot be dragged below 1280, feature still unreachable. Truth #5 (*"can
never drift apart silently again"*) reported TRUE.

**Fix:** assert `src/main/index.ts` has no numeric literal in the `minWidth:` /
`minHeight:` position — `assert.doesNotMatch(src, /minWidth:\s*\d/)`.

#### BL-29-03 — `contains: "textOverflow"` is satisfied by four sibling elements (BLOCKER)

Confirmed at source: `AgentCard.tsx:261, 310, 351, 387` all carry
`whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'`. The model chip at
`:314-328` — the one element under repair — carries none of them.

**Cheapest wrong implementation:** `git checkout .`

**Fix:** anchor the gate on adjacency to the chip's own content:
`contains: "shortModel\\(row\\?\\.model\\)[\\s\\S]{0,300}?textOverflow"` — or, since
`<action>` names `FullscreenTerminal.tsx:743-747` as the source pattern, pin
`maxWidth` **and** the chip's `title` in one regex.

#### BL-29-04 — the anti-vacuity control for the chip cannot fail (BLOCKER)

> *"The same render still emits the project/action line (`infoLine`) as a non-empty element — the chip must not be the only thing on the row."*

`renderToStaticMarkup` performs no layout. `infoLine` is emitted unconditionally by the
JSX at `:243-252` whether or not the model chip drives it to zero width at runtime. The
assertion is green today, green after the fix, and green if the fix is reverted.

**Fix:** delete it and say so, or replace it with the honest statement already in
`<action>` (*"this proves the GUARDS ARE PRESENT, not that nothing clips"*). Keeping a
decorative assertion in a `<behavior>` list is how a reviewer counts four checks where
there are three.

---

### 01-30 — the anti-vacuity plan

#### BL-30-01 — task 3's `<done>` grep is ALREADY SATISFIED, 2× over (BLOCKER)

> `grep -c "latest\*\.yml" .github/workflows/release.yml` **is at least 2 (hash + upload)**

Measured at `fd66993`: **4 hits** — `:161` (a comment), `:170` (upload path), `:200`
(the flatten `find`), `:245` (publish path). The condition is satisfied before any edit.

It gets worse. `<action>` explicitly instructs: *"replace the comment … with the reason
the wider set is correct — `latest*.yml` is the electron-updater feed."* Writing that
comment is the *fifth* hit. **The plan's own instruction adds a satisfying token to a
comment, guaranteeing its own grep passes with the `ls` list untouched.**

**Cheapest wrong implementation:** rewrite the comment at `:147`, leave
`files=$(ls *.dmg *.zip *.exe *.AppImage …)` alone. `<done>` green.

**Fix:** pin the `ls` line itself:
`assert.match(genStep.run, /ls[^\n]*'?\*\.blockmap'?[^\n]*latest\*\.yml/)` — or rely
solely on task 2's coverage pin and delete the grep.

#### BL-30-02 — truth #1 is a universal quantifier checked by a grep that misses at least two forms (BLOCKER)

> *"**Every** win32 non-run in the suite is counted as a skip, so the published pass figure is an honest floor"*

The prescribed check is
`grep -rn "platform === 'win32'" test/*.test.cjs` + *"check every hit for a bare `return`
inside a test callback."* Executed against the tree, that misses:

1. **`test/transcript-project-dir.test.cjs:122`** —
   `if (process.platform !== 'win32') return;` inside
   `test('a legacy-only install still resolves, so old transcripts stay readable', …)`.
   Confirmed by `sed -n '117,131p'`: the second `withHome(...)` block with its
   `assert.equal(path.basename(projectDir('/Users/me/app')), '-Users-me-app')` **never
   runs on ubuntu or macOS** and the test reports `ok`. Same defect, `!==` spelling,
   invisible to the `===` grep.

2. **`test/proc-kill.test.cjs:29-40`** — `if (process.platform === 'win32') { … process.exit(0); }`
   at **module scope**. The grep finds it, but the instruction ("bare `return` inside a
   test callback") tells the executor it is not an instance. It is a worse one: the file
   defines its own `test()` at `:59` and runs five cases at `:65-103` which, on win32,
   never execute and appear in **neither** `# pass` nor `# skipped`. They vanish from the
   denominator entirely.

The glob `test/*.test.cjs` is also narrower than the corpus — it excludes
`test/load-ts.cjs` (correctly) but would exclude any future subdirectory (none today:
61 files, all `.cjs`, flat).

**Cheapest wrong implementation:** fix the two named instances, run the prescribed grep,
report *"none found — confirmed no third instance"*, and truth #1 is recorded TRUE with
at least two live counterexamples in the tree.

**Fix:** widen the sweep to
`grep -rnE "platform\s*(===|!==)\s*['\"]win32|process\.exit\(0\)" test/` and require the
SUMMARY to adjudicate **every** hit individually, including module-scope exits and
`POSIX`/`WIN` const indirections (`test/hook-auth-roundtrip.test.cjs:42`,
`test/hive-hook-node.test.cjs:28`, `test/hive-runtime-path.test.cjs:26` — all three
already use the correct `{ skip: !POSIX }` form and are clean; they belong in the
report as verified negatives).

#### BL-30-03 — truth #2 quantifies over six shims; the plan mandates one mutation (BLOCKER)

> *"A commented-out `sock_token` assignment in **any of the six** shim templates turns `npm test` RED"*

`<action>` says: *"Do that mutation in memory (read `src/main/hive.ts`, comment the line
in the string, run the predicate) and paste both outcomes."* — singular, unspecified
which.

The six live assignments (`hive.ts:3635, :3705, :3758, :3797, :3859, :4085`) are in six
different template languages. An assignment-shaped regex tuned to
`payload.sock_token = process.env.HIVE_SOCK_TOKEN` will behave differently against a
JSON-ish `"sock_token": process.env.…` inside a `JSON.stringify`, a Python shim, or a
`.cmd` shim.

**Cheapest wrong implementation:** demo the mutation against the one shim whose shape the
regex was written for. The other five keep whatever pin the loose form gives them, which
may still be the `/sock_token/` substring in practice.

**Fix:** require the mutation loop over all six —
`for (const [name, body] of shims) { assert.throws(() => check(commentOut(body))) }` —
which is *less* work than one hand-run demo and turns truth #2 into a real universal.

#### BL-30-04 — every one of plan 01-30's six frontmatter gates is green at HEAD (BLOCKER)

`sock_token` 8, `npm test` 7 (×2 gates), `latest*.yml` 4, `attestation` 2,
`SHA256SUMS` 7. Not one can distinguish the finished plan from the untouched tree.

For the plan whose stated purpose is *"Make the phase's own verification surface tell the
truth"*, this is the finding.

**Fix:** see BL-SYS-01. Concretely, 0-hit replacements available today:
`contains: "sock_token[\"']?\\s*[:=]"`, `contains: "trim\\(\\) === 'npm test'"`,
`contains: "'\\*\\.blockmap'"`, `contains: "pre-change releases"`,
`pattern: "hashedGlobs"`.

#### BL-30-05 — the glob-subset coverage pin is unsound as specified and will be "fixed" by loosening (BLOCKER)

The hashed set is `*.dmg *.zip *.exe *.AppImage` (relative, `cd dist` first). The
uploaded set is `dist/*.dmg … dist/latest*.yml dist/SHA256SUMS-*.txt` (prefixed). A
naive string-subset comparison finds **zero** overlap and the pin is RED even after task
3 lands correctly.

The executor's cheapest route out is to normalise so aggressively (strip `dist/`, strip
`*`, compare extensions) that the pin stops distinguishing `latest*.yml` from
`latest-mac.yml` — or to add an exclusion list until it goes green.

The plan's own anti-vacuity clause (*"Assert the extraction matched something before
comparing"*) guards emptiness but not cardinality: 1 upload glob vs 5 hash globs passes.

**Fix:** specify the normalisation in the plan (`strip a leading 'dist/'`), pin both
cardinalities (`assert.equal(uploaded.length, 7)`), and name `SHA256SUMS-*.txt` as the
single explicit exclusion.

---

### 01-31 — docs, naming pin, requirement rows

#### BL-31-01 — the widened naming pin, built as instructed, does not scan a single `.md` file (BLOCKER — highest severity in this review)

`<action>`: *"widen `test/repo-claims.test.cjs:337-352` from its two-file loop to a
tree-wide scan, **reusing the file walker the rest of that file already uses (`:98`)**."*

That walker, read at source (`test/repo-claims.test.cjs:66-74`):

```js
function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(…);   // ← .ts / .tsx ONLY
  }
  return out;
}
```

It matches **`.ts` and `.tsx` only.** Following the instruction literally:

| Site the plan must protect | Extension | Scanned by `sourceFiles`? |
|---|---|---|
| `resources/skills/capabilities/SKILL.md:96` — *"the highest-value one"*, ships into every agent | `.md` | **NO** |
| `README.md` — covered by the CURRENT two-file test | `.md` | **NO** |
| `src/main/kg-core.cjs` | `.cjs` | **NO** |
| `docs/floor-inspection.html` — the plan mandates excluding it | `.html` | **NO** (exclusion is dead code) |
| `src/main/config.ts`, `src/renderer/src/store/config.ts`, `src/main/hive.ts` | `.ts` | yes |
| `src/preload/index.ts` — covered by the CURRENT two-file test | `.ts` | yes |

**The "widened" pin is strictly WEAKER than the two-file loop it replaces**: it drops
`README.md`, which the existing test covers today.

And `sourceFiles(root)` from the repo root has no `node_modules` / `dist` / `out`
exclusion — it will walk the entire dependency tree.

**Cheapest wrong implementation that reports full success:** rename `SKILL.md` and the
two `config.ts` files first, then run the widened `.ts`-only pin, get a corpus of 200+
files (`files.length > 50` green), demo RED by re-introducing the string into
`src/main/config.ts`, paste it, revert, green. Every criterion satisfied. Truth #2
(*"No file in the repo … **including the agent-facing skill**"*) reported TRUE while
`SKILL.md` is pinned by nothing, and a future re-introduction there sails through.

**Fix:** the plan must specify a *new* walker with an explicit extension allow-list
(`/\.(tsx?|cjs|mjs|js|md|html|json|ya?ml)$/`) and explicit directory denies
(`node_modules`, `.git`, `dist`, `out`, `.planning`), and must require the RED
demonstration to be performed **against `resources/skills/capabilities/SKILL.md`
specifically** — the one file whose coverage is in doubt.

#### BL-31-02 — truth #1's escape clause makes it satisfiable by deleting the evidence (BLOCKER)

> *"Every `file.ts:NNN` anchor in HIVE.md and docs/adr/0005 points at the function it names, **or names the symbol instead of a line**"*

`<action>` reinforces it: *"Prefer the symbol to the number."* And: *"Do not add a test
that pins these anchors."*

**Cheapest wrong implementation:** delete every `:NNN` from HIVE.md and ADR-0005.
The universal quantifier now ranges over the empty set. Truth #1 is vacuously TRUE,
nothing checks that the substituted symbol names are correct, and the SUMMARY's
`sed -n '<n>p'` check list is self-reported with no artifact.

The plan has a defensible reason not to pin line numbers. It has no reason not to pin
**symbols**, which is the durable half of its own recommendation.

**Fix:** add a claims pin in the shape `test/repo-claims.test.cjs:229-253` already uses —
for each `(doc, symbol, file)` triple asserted in HIVE.md, assert
`readFileSync(file).includes(symbol)`. It is 6 lines and it survives every refactor that
does not delete the symbol.

#### BL-31-03 — `contains: "drainForStop"` on HIVE.md is satisfied by the stale anchor it must fix (BLOCKER)

`HIVE.md:138` today reads *"ADVANCED by drainForStop() (hive.ts:1338)"*, and
`sed -n '1338p' src/main/hive.ts` is `this.revokeProxyToken(agentId);`. The gate is green
because the defect exists.

Compounding: 01-26 edits `hive.ts` around `:1336-1339`, so `:1338` will point somewhere
*else* wrong by the time 01-31 runs.

**Cheapest wrong implementation:** `git checkout .`

**Fix:** `contains: "drainForStop\\(\\)(?!.*hive\\.ts:1338)"`, or better, the claims pin
from BL-31-02.

#### BL-31-04 — truth #4 (REQUIREMENTS.md rows) has zero machine-checkable content (BLOCKER)

> *"REQUIREMENTS.md's evidence and owner columns describe the code as it is after this gap-closure set, with every remaining ceiling named"*

`<done>`: *"Every restated row was checked at source (**list the commands used**)."*
That is self-attestation. `contains: "FLOOR-04"` (5 hits) and `pattern: "redactSecrets"`
(1 hit) are both already green. `<action>` forbids ticking any `[ ]`, so no state
transition is observable either.

**Cheapest wrong implementation:** rewrite the seven rows' prose plausibly from the
01-24…01-30 SUMMARYs without opening a source file, and paste a list of commands that
were never run. Indistinguishable from the real thing in the artifact.

This is explicitly what the phase-level mandate forbids (*"Trust prior plan SUMMARY
claims instead of live re-execution → STOP"*), and the plan's own `<action>` warns
against it (*"SUMMARY-trust is how this phase's rows drifted the first time"*) — while
providing no mechanism to prevent it.

**Fix:** for each restated row, require the SUMMARY to paste the **command AND its
output**, not the command alone. Two of the seven can be made fully mechanical today:
FLOOR-13 (`grep -n 'MIN_WIN' src/main/index.ts`) and FLOOR-07 (the tree-wide grep).

---

## C. WARNINGs

### WR-24-01 — `contains: "agentForToken"` cannot distinguish a stub (WARNING)
`agentForToken(t: string) { return null; }` satisfies the gate and the doc-comment
requirement. Task 3's three behaviour cases catch it, so the risk is bounded — but the
gate itself carries no information. Same for 01-25's `resolveAgentForToken`.

### WR-24-02 — the byte cap has no upper-bound criterion (WARNING)
*"pick a value large enough for a real PreToolUse `tool_input`"* with no ceiling. `2 ** 31`
satisfies every stated criterion and the DoS remains. Name a bound (e.g. `≤ 8 MB`,
matching `telemetry.ts:129`).

### WR-24-03 — "destroyed once the byte cap is crossed" is unobservable from the test (WARNING)
`buf` is closure-local. The test can only see the socket close. A cap checked *after* the
append lets `buf` reach `cap + chunkSize`; a cap checked before lets one oversized chunk
through untouched. Neither is distinguishable. Specify which side of the append.

### WR-25-01 — the 401-with-no-resolver case is stated in prose, not in `<behavior>` (WARNING)
*"if `resolveAgentForToken` is absent … the listener must refuse"* appears only in
`<action>`. No behaviour case drives a collector constructed without the option. Add one.

### WR-25-02 — the OTel header spelling has no source of truth in the plan (WARNING)
*"Confirm the exact spelling the OTel SDK expects … and put the citation in the comment"*
— the round-trip test proves the app's own collector accepts what the app exports, which
is true for *any* spelling including a wrong one. The plan correctly flags this as
MEASUREMENT UNAVAILABLE; make sure the SUMMARY does not claim otherwise.

### WR-26-01 — `contains: "generation"` on a new file is a title grep (WARNING)
`test('generation', () => {})` satisfies it. The two-generation `<behavior>` is strong;
the gate adds nothing.

### WR-26-02 — `grep -c "Enterprise Knowledge Graph"` is case- and whitespace-sensitive (WARNING)
`enterprise knowledge graph`, `Enterprise  Knowledge Graph`, or a line-wrapped
`Enterprise\n * Knowledge Graph` all pass the `<done>` check. Use `-i` and collapse
whitespace. (The existing test at `:348` correctly uses `/enterprise knowledge graph/i`;
the plan's `<done>` regresses from it.)

### WR-26-03 — `grep -c` exits 1 on zero matches (WARNING)
Applies to 01-24 (`payload\.cwd`), 01-25 (`attrs['agent.id']`), 01-26 (Enterprise), 01-29
(`includes(flag)`). Under `set -e` these "success" conditions fail the run. Use
`|| true` or `grep -c … ; [ $? -le 1 ]` in the plan text.

### WR-27-01 — "proven by a test that names the composite scenario" (WARNING)
Truth #5's wording makes *naming* the criterion. `test('85% of cap AND top spender', () => assert.ok(true))`
satisfies the letter. The three `<behavior>` cases are the real content; drop the "names"
phrasing.

### WR-27-02 — `<action>` assumes a single `return { tripping: false }` exit (WARNING)
*"return the remembered soft result only at the point where the function would otherwise
return `{ tripping: false }`"*. If `evaluate()` has more than one such exit (the
no-progress arm at `:395+` is a candidate), patching one leaves the soft band silently
dropped on the other path — and no criterion covers it. Require a count.

### WR-28-01 — `contains: "ok: false"` is whitespace-fragile (WARNING)
The plan's own prose writes `{ok:false, error}` (no space) six times. If the executor
writes it that way the gate is RED on a correct implementation; the cheapest repair is a
comment `// ok: false`. Use a tolerant pattern or drop it.

### WR-28-02 — the structural composer pin uses a comment-stripper with a known defect (WARNING)
`test/repo-claims.test.cjs:63`'s `stripComments` truncates `href="https://…"` (review
`c/WR-13`, explicitly out of scope). The plan does not say which stripper the composer
pin uses. If it reuses that one, a URL in `MessageQueueComposer.tsx` silently truncates
the scanned region and the pin can go vacuous. Name the stripper.

### WR-29-01 — truth #4's "longest model name any preset can produce" is the wrong bound (WARNING)
`row?.model` is a **runtime** value returned by the CLI, not a preset field.
`'Gemini 3.1 Pro (High)'` (21 chars, `agentProvider.ts:313`) is a preset *recommendation*;
a real value like `claude-sonnet-4-5-20250929` is longer. The chosen `maxWidth` is
justified against the wrong number. The guards make length moot, so this is a
documentation defect rather than a behavioural one — but the truth as written is false.

### WR-29-02 — `grep -c "includes(flag)"` is defeated by whitespace (WARNING)
`.includes( flag )`, `.includes(flag as string)`, or `.includes(String(flag))` all pass.
The six `<behavior>` cases (especially `--auto` / `--auto-compact`) are the real pin.

### WR-30-01 — `proc-kill.test.cjs` uses a hand-rolled `test()` and contributes nothing to TAP (WARNING)
`test/proc-kill.test.cjs:59` defines `async function test(name, fn)` — it is not
`node:test`. Its five cases at `:65-103` never appear in `# pass` or `# skipped` on any
platform, and on win32 the `process.exit(0)` at `:40` prevents them from running at all.
Truth #1's *"the published pass figure is an honest floor"* is affected by this file and
the plan's grep instruction cannot classify it. Adjudicate it explicitly in the SUMMARY.

### WR-31-01 — the "6 skips" figure is pre-committed before the sweep that determines it (WARNING)
01-31 `<action>` hardcodes *"the honest count is 6"* while 01-30 task 1 is still asking
*"report what you find — including 'none' if that is the answer."* Given BL-30-02 there
is at least one more instance (`transcript-project-dir.test.cjs:122`). If 01-30 fixes it
the count is 7 and 01-31 records a wrong number; if 01-30's narrow grep misses it, both
plans record a figure that is not a floor. Derive the number from the run, do not assert
it in advance.

---

## D. Verdict

**Do not execute these plans as written.**

Twenty-one BLOCKERs. The distribution is the signal: the plans' *prose* (the
`<behavior>` lists, the `<action>` bodies, the threat models) is unusually rigorous and
frequently anticipates its own vacuity risk in a sentence. The plans' **machine-checkable
gates are not.** 54% of them are green on an untouched tree.

Three findings are load-bearing enough to invalidate the plans they sit in:

1. **BL-31-01** — 01-31's widened naming pin, built exactly as instructed, scans `.ts`
   and `.tsx` only. It never reads `resources/skills/capabilities/SKILL.md` (the plan's
   own "highest-value" site) and it drops `README.md`, which the two-file test it
   replaces already covers. The pin ships weaker than what it replaces while reporting
   "tree-wide."
2. **BL-28-02** — 01-28's prescribed test for the blocked-Stop guard calls `updateAgent`
   directly, bypassing the guard entirely. Green before and after the source change, with
   a written escape hatch to downgrade to a source grep.
3. **BL-30-01 / BL-30-02** — the anti-vacuity plan's task-3 `<done>` grep is satisfied
   4× on the untouched tree and is *further* satisfied by a comment the plan instructs
   writing; and its "every win32 non-run" sweep uses a `===`-only grep that misses the
   live `!== 'win32'` bare return at `test/transcript-project-dir.test.cjs:122`.

**On the two the brief called out specifically:**

- **01-29's cross-file collapse assertion (`width: 1280` RED demo): NOT genuinely
  non-vacuous.** BL-29-01 — the demonstration is not mechanically achievable without
  editing a file 01-29 does not own, so it will be narrated rather than run. BL-29-02 —
  even when green, the pin does not assert that `minWidth:` consumes the constant, so
  the feature can stay unreachable with the pin passing.
- **01-30's rewritten shim `sock_token` pin: the *assertion* is genuinely stronger; the
  *gates around it* are not.** The comment-stripped, assignment-shaped match with a
  mutation demo is the right shape and closes `c/CR-02`. But the plan's own
  `contains: "sock_token"` gate is satisfied by the vacuous regex it deletes (BL-30-04),
  and only ONE of the six shims is required to be mutation-proved against a universal
  truth that quantifies over all six (BL-30-03).

**Minimum before execution:** re-derive all 46 frontmatter gates to 0 hits at `fd66993`
(BL-SYS-01, BL-SYS-02); replace the `sourceFiles` instruction in 01-31 (BL-31-01);
replace 01-28 task 2's test strategy with an extracted pure decision function
(BL-28-02); resolve 01-24's base-set contradiction (BL-24-01); widen 01-30's platform
sweep and re-derive the skip count from the run rather than asserting it (BL-30-02,
WR-31-01).

---

_Lens 2 of 5 — vacuous verification. Read-only; no source modified._
_Every "GREEN AT HEAD" row in section A was executed against `fd66993`, not inferred._
