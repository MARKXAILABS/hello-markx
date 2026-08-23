# Red-team round 3, lens B — security efficacy

**Target:** gap plans `01-24-PLAN.md`, `01-25-PLAN.md`, `01-26-PLAN.md`, `01-28-PLAN.md`
**Tree:** branch `gsd/v1.0-milestone` @ `bd74777` (revisions `6a70e05` → 01-26, `994e036` → 01-28, `bd74777` → 01-24/01-25)
**Round 2:** `01-REDTEAM2-B.md` @ `3051a47` (7 BLOCKER · 7 HIGH · 6 WARNING)
**Threat actor:** an LLM-controlled agent shell, same OS user, holding the app's env, able to read any file the user can, spawn processes and open loopback connections. Not a remote attacker.
**Method:** every claim below marked **[demonstrated]** was produced by executing code against the live tree and the live filesystem on the operator's own Windows host (`DESKTOP-LO8BH39`, Node v24.13.0, home `C:\Users\Alienware`) in this session. Where a plan mandates a fix, that fix was implemented faithfully from the plan's own words and re-attacked. No source file and no plan was modified.

---

## VERDICT: **NOT CLEAN**

**5 BLOCKER · 5 HIGH · 5 WARNING.**

Round 3 genuinely closed **five** of round 2's seven blockers (B2-04, B2-05, B2-06's four named classes, B2-07, W-01), and closed most of B2-01 and B2-03. But three of the five new blockers are created *by the round-3 remediations themselves*, and one of those — `server.maxConnections` — is a **floor-wide fail-open that is strictly cheaper for the attacker than the DoS it was added to prevent**. That is round 2's own heading, "a fix that ships worse security than the bug", for the third round running.

Two of round 3's headline `<measured_evidence>` tables do not reproduce: the win32 spelling table is missing two live spellings that defeat the prescribed fix, and the cost table understates the post-fix attack cost by up to 7× *and inverts sign* on two rows.

---

## Round-2 blocker closure ledger

| Round 2 | Claim in revision 3 | Actually closed? |
|---|---|---|
| **B2-01** four win32 spellings bypass `denyReason` | measured 9-row table; `.native` on win32 + local-admin-share normalisation | **PARTLY.** 8.3 / `\\?\` / `\\.\` / `subst` reproduce exactly and `.native` closes all four **[demonstrated]**. Local admin share reproduces and the normaliser closes `localhost`/`127.0.0.1`/`::1`/`<hostname>` **[demonstrated]**. But `\\?\UNC\localhost\C$\…` and `\\.\UNC\localhost\C$\…` are **still ALLOWED after the plan's own fix**, and both really write into the protected `bin/` → **B3-01** |
| **B2-02** the target cap has no safe value | cap moved to distinct path-shaped candidates after filter → dedupe → per-dir memoise | **PARTLY.** A safe *count* does exist (measured: ~0.5 ms/candidate locally, so a cap of 200–2000 costs 0.1–1 s). But the cap bounds COUNT, not TIME: **one** candidate against a dead UNC host costs **21 017 ms** of synchronous main-thread block → **B3-03**. And the cost table is not reproducible → **H3-01**; the leaf-symlink protection the plan claims is pinned is not pinned → **B3-05** |
| **B2-03** framing bounds bound one connection / timeout fires too late | timeout **below** 5 s + elapsed assertion, `conn.end()` not `destroy()`, `server.maxConnections`, aggregate in-flight budget | **PARTLY.** Timeout sizing, elapsed-time assertion and `conn.end()` are correct and close the round-2 finding. `server.maxConnections` is a **new fail-open** — Node destroys the over-limit socket without ever invoking the connection handler, so no deny is ever written → **B3-02**. The aggregate byte budget has no eviction or per-peer accounting → **H3-03** |
| **B2-04** `payload.cwd` disarms the fail-closed branch | two-stage deny-wins; empty registry set denies BEFORE `payload.cwd` is read | **YES.** Attacked under every ordering I could construct; an attacker-supplied absolute `cwd` can only ever add a candidate to a non-empty vouched set, and the loop returns the FIRST deny. No DENY→ALLOW conversion found. See "Verified closed" §2. (The `cwd` field is still a free *cost* amplifier — that is B3-03, not B2-04.) |
| **B2-05** `sessionKey` separator is a space, `hive.ts:2842` uses `\u0000` | corrected to `\u0000`; two separator-independent injectivity assertions added | **YES.** Live `hive.ts:2842` re-grepped: `` const key = `${row.agent_id ?? ''}\u0000${row.session_id ?? ''}`; ``. Plan `:209-210` now states `\u0000`. The collision control (`sessionKey('a','b c') !== sessionKey('a b','c')`) is mandated as non-optional and forbidden from naming the separator |
| **B2-06** four credential classes leaked by the value-shape guard | adjudicator narrowed to five shapes; 47-row corpus, 0 failing; 4 REGRESSION pins | **NO — B3-04.** The four *named* classes are genuinely fixed (re-ran the full corpus: **42/42, 0 failing**, all four regression classes redacted, all 12 false positives strictly unchanged, JSON round-trips) — but the same predicate leaks **five further classes that are redacted at HEAD today**, and the new `REGRESSION` array contains none of them |
| **B2-07** LOCKSTEP compares regex literals, blind to the callback | two arms (behavioural + normalised-body textual), adjudicator sliced too, cardinality asserted | **YES.** A callback-only drift is RED on the behavioural arm; a `{6,}`→`{99,}` drift is RED on the textual arm; the cardinality assertion closes the `new RegExp(KEYS + …)` vacuity hole. See "Verified closed" §5 |
| **W-01** `destroy()` discards the deny | `conn.end(...)` mandated by name, pinned by a keep-writing client | **YES** |
| **W-02** PreToolUse-shaped deny returned to a `Stop` | recorded in the action text, the comment and the SUMMARY, as an accepted trade | **RECORDED, and the trade is defensible.** Verified live: `hive.ts:3722` (agy) and `:4103-4104` (grok) both translate `hookSpecificOutput.permissionDecision === 'deny'` into `{decision:'deny'}`. See W3-03 for the one arm the plan does not name |
| **H2-06/H2-07** (01-28) false premise + surviving unrecoverable ordering | premise corrected in T-P28-04 (*"R-21's stronger claim — that mail stops — is false"*); both residuals recorded under a mandated SUMMARY heading with owners and recovery paths | **ACCEPTED-AND-RECORDED, correctly.** The false "never receives mail" truth is retracted in writing at `:249-254` and `:598-600`; (a) and (b) are named at `:630-637` with recovery paths and a "do NOT satisfy this by narrowing truth #3" clause. This is the honest disposition, not a fix |
| **c/B2** `hooks.ts` ownership split | 01-25 takes it, `shares_files_with` both directions, wave 1 → wave 2, `depends_on: ["01-24"]` | **YES.** Split verified real — see "Verified closed" §6 |

---

# BLOCKERS

## B3-01 — 01-24 Task 1: the prescribed win32 fix leaves `\\?\UNC\localhost\C$\…` and `\\.\UNC\localhost\C$\…` ALLOWED, and both land the write in the real `bin/` **[demonstrated]**

The plan's 9-row table reproduces **exactly**. Run against a faithful copy of `realResolve` (`hooks.ts:126`) + `within` (`:143`) on a real hive-shaped tree under the operator's own home, once with the JS `realpathSync` (what `:68` imports and therefore what ships) and once with `.native`, with a real `writeFileSync` through each spelling:

```
protectedBin = C:\Users\Alienware\AppData\Local\Temp\claude\probe-hive-r3\bin

spelling               JS(ships)    native       write lands in real bin?
plain absolute         DENIED       DENIED       YES
8.3 short name         *ALLOWED*    DENIED       YES
long-path prefix \\?\  *ALLOWED*    DENIED       YES
device path      \\.\  *ALLOWED*    DENIED       YES
admin localhost C$     *ALLOWED*    *ALLOWED*    YES
admin 127.0.0.1  C$    *ALLOWED*    *ALLOWED*    YES
admin ::1        C$    *ALLOWED*    *ALLOWED*    YES
admin LOCALHOST  c$    *ALLOWED*    *ALLOWED*    YES
admin <hostname> C$    *ALLOWED*    *ALLOWED*    YES
forward slashes        DENIED       DENIED       YES
double sep             DENIED       DENIED       YES
trailing dot dir       *ALLOWED*    *ALLOWED*    write ENOENT   (not exploitable — matches the plan)

subst Y: -> JS: Y:\bin\cth-hook.cjs | native: C:\Users\...\bin\cth-hook.cjs | write via Y: lands in real bin: true
C:\Users\ALIENW~1 -> JS: unchanged  | native: C:\Users\Alienware
\\?\C:\Users\Alienware -> JS: THREW EISDIR (hence the climb, hence the string returned unchanged) | native: C:\Users\Alienware
```

Every mechanism the plan asserts is confirmed, including the EISDIR-then-climb explanation for `\\?\`.

**But the plan's table is missing two spellings, and they are exactly the two its fix cannot see.** The plan mandates the order *"Normalise a **local** admin share to its drive-letter form **before resolving**"*. I implemented that literally — host set `{localhost, 127.0.0.1, ::1, ., os.hostname()}`, case-folded, `\\<host>\<L>$\<rest>` → `<L>:\<rest>`, applied to both sides, then `.native` with the mandated JS fallback — and re-ran the whole set:

```
spelling                   AFTER THE PLAN'S FIX   resolved to
plain absolute             DENIED
8.3 short name             DENIED
long-path prefix           DENIED
device path                DENIED
long-path prefix + 8.3     DENIED
admin localhost   C$       DENIED
admin LOCALHOST   c$       DENIED
admin 127.0.0.1   C$       DENIED
admin ::1         C$       DENIED
admin <HOSTNAME>  C$       DENIED
admin <host-lc>   C$       DENIED
LP-UNC  \\?\UNC\localhost\C$   *** ALLOWED ***   \\localhost\C$\Users\Alienware\...\bin\cth-hook.cjs
DEV-UNC \\.\UNC\localhost\C$   *** ALLOWED ***   \\localhost\C$\Users\Alienware\...\bin\cth-hook.cjs
LP-UNC  \\?\UNC\<HOSTNAME>\C$  *** ALLOWED ***   \\DESKTOP-LO8BH39\C$\Users\...\bin\cth-hook.cjs
forward slashes            DENIED
REMOTE UNC (control)       *** ALLOWED ***       \\some-nas\share\project\file.ts   ← correct
```

And both spellings really write:

```
\\?\UNC\localhost\C$   WRITES-REAL   | native -> \\localhost\C$\Users\Alienware\...\probe-hive-r3
\\.\UNC\localhost\C$   WRITES-REAL   | native -> \\localhost\C$\Users\Alienware\...\probe-hive-r3
```

**The mechanism is the plan's own ordering.** `\\?\UNC\localhost\C$\…` does not match `\\<host>\<letter>$\` (its first component is `?`, its second is `UNC`), so the normaliser skips it. Then `.native` **converts it into** `\\localhost\C$\…` — i.e. resolution *produces* an admin-share spelling, after the only normalisation pass has already run. `within()` then compares a UNC path against a drive-letter path and allows it.

Round 2's remediation text said *"strip a leading `\\?\` / `\\.\` (and reject or normalise `\\server\share`)"*. Revision 3 replaced prefix-stripping with `.native` and kept only the share normaliser — which is correct for every spelling **except** the composition of the two, and the composition is one string concatenation away for the attacker.

**Blast radius:** identical to B2-01 — `<hive>/bin` (the shim every agent executes), `<hive>/.git` (a `core.hooksPath` that runs as a child of MAIN), `<hive>/agents/<other>`. One `Write` tool call, no shell.

**Required remediation:** normalise the local admin share **after** resolution as well as before (or instead of), i.e. run the share normaliser over `realResolve`'s *output* on both sides. Add `\\?\UNC\<local>\C$\…` and `\\.\UNC\<local>\C$\…` to behaviour group B. The general rule the plan is missing: **`.native` can emit a spelling class that the pre-resolution normaliser was written to eliminate**, so any spelling normalisation must be idempotent across the resolution step.

---

## B3-02 — 01-24 Task 2: `server.maxConnections` never invokes the connection handler, so the mandated aggregate bound is itself a floor-wide gate bypass — and the plan's own behaviour case for it is unsatisfiable **[demonstrated]**

The plan mandates, as one of two non-optional aggregate bounds:

> *"set `server.maxConnections` to a value derived from the floor's real concurrency … Both refusals take the same explicit-deny path as the cap and the timeout."*

They cannot. Node's `net.Server` enforces `maxConnections` inside `onconnection`, **before** the `'connection'` event: it calls `clientHandle.close()` and returns. The user handler never runs, so there is nothing to write a deny from. Measured on this host:

```
server.maxConnections = 3; 3 sockets held open; a 4th connects and writes a PreToolUse payload

handler invocations for the 4 connections: 3      (the 4th never reaches the handler)
4th connection events: connect -> end -> close hadError=false
4th connection received bytes: ""
```

Zero bytes. Now read the shim that receives that (`src/main/hive.ts:3663-3669`, re-read at HEAD):

```js
let resp = '';
const done = (code) => { if (resp) process.stdout.write(resp); process.exit(code); };
const c = net.createConnection(sock, () => c.write(JSON.stringify(payload) + '\n'));
c.on('data', (d) => { resp += d; });
c.on('end', () => done(0));
c.on('error', () => process.exit(0));
```

`resp` is empty → `process.exit(0)` with **no stdout** → the repo's own words at `test/net-binding.test.cjs:279`: *"exit 0 with no stdout is `allow`."*

**So the fix for B2-03 is a cheaper version of the attack B2-03 described.** Round 2's attack needed ~2 GB of main-process string memory. This one needs `maxConnections` idle sockets — the plan tells the executor to derive that number from "the floor's real concurrency", so realistically tens — held open with zero bytes sent. From that moment **every PreToolUse on the floor is `allow`**, silently, with the gate reporting healthy and the aggregate byte counter at zero.

**The plan is also internally unsatisfiable here.** Its own behaviour case for this bound reads:

> *"N concurrent connections … Drive it with enough connections to cross both the connection cap and the aggregate in-flight budget, and assert what the over-limit connections receive (a deny, then a close) as well as what the fresh legitimate one receives."*

With `server.maxConnections` set, the over-limit connections receive **nothing** and the fresh legitimate one receives **nothing**. Meanwhile `<done>` requires `grep -c 'maxConnections' src/main/hooks.ts` ≥ 1 and the artifact gate `contains: "maxConnections"`. An executor cannot satisfy the gate and the behaviour case together; the cheapest resolutions are (a) weaken the test, or (b) write `maxConnections` into a comment to satisfy the grep. Both leave the floor with a gate that is off.

**Required remediation:** do **not** set `server.maxConnections`. Enforce the connection cap *inside* the connection handler — count live connections, and for the over-limit one write the same explicit deny and `conn.end(...)`, exactly as the byte cap and the timeout do. If `maxConnections` is kept at all it must be a far-outside backstop (e.g. 10× the soft cap) with a comment saying it is unreachable in the designed path and why it must stay unreachable, and the `<done>` gate must move to the soft cap's symbol. Add a behaviour case that asserts the over-limit connection **receives a non-empty body**, not merely that it closed.

---

## B3-03 — 01-24 Tasks 1+2: the candidate cap bounds COUNT, not TIME. One candidate against a dead UNC host blocks main for 21 seconds, and `payload.cwd` hands the attacker that primitive for free **[demonstrated]**

The whole of the plan's cost model — the `<interfaces>` table, T-P24-04's "mitigate", the *"if it is over ~1 s, the cap is too high"* instruction — assumes every `realResolve` is sub-millisecond. Every measurement in it is on **local** paths. Measured on this host with the live `realResolve` (JS only, i.e. HEAD) and with the plan's mandated `.native`-then-JS shape:

```
one realResolve of  \\10.255.255.1\share\a\b.ts   ->  21 017 ms   (live JS, i.e. at HEAD)
one realResolve of  \\10.255.255.1\share\a\b.ts   ->  21 028 ms   (the plan's mandated resolver)
one realResolve of  \\192.0.2.1\share\a\b.ts      ->  21 036 ms   (TEST-NET-1, RFC 5737)
one realResolve of  \\nosuchhost-zzz\share\f.ts   ->   2 682 ms
```

`path.win32.isAbsolute('\\\\10.255.255.1\\share')` is **true**, so this string passes the *only* filter the plan puts on `payload.cwd`.

Three consequences, in increasing order of severity:

1. **The cap is not a bound.** A cap of 120–500 distinct path-shaped candidates was chosen from a table where a candidate costs ~0.5 ms. At 21 s a candidate, that same cap authorises **42 minutes to 2.9 hours** of synchronous main-thread block. T-P24-04's mitigation is void as calibrated.
2. **Every bound in Task 2 is void at the same moment.** `conn.setTimeout` fires from the event loop; `server.maxConnections` is accounted on the event loop; the aggregate byte counter is incremented from `'data'`. All of them are frozen while main sits inside a blocking `realpathSync`. Meanwhile all six shims' `setTimeout(() => process.exit(0), 5000)` **do** fire, in their own processes → exit 0, no stdout, **allow, floor-wide**, for the whole window.
3. **`payload.cwd` is a free amplifier the plan introduced.** B2-04 is correctly closed on the *authorisation* axis — a lying `cwd` cannot convert a DENY into an ALLOW. It was never examined on the *cost* axis. With `cwd: "\\\\10.255.255.1\\share"` appended to a non-empty vouched set, **every relative candidate in the payload is resolved against a dead network host**, doubling the per-candidate cost to 21 s and multiplying by the candidate count. One JSON field. T-P24-02's safety argument (*"a lying `cwd` costs the caller a deny and gains nothing"*) is true of the verdict and false of the cost.

The absolute-target form of this (`tool_input.file_path = "\\\\10.255.255.1\\share\\x"`, one target, 21 s) is **pre-existing at HEAD** — but this plan is the one that claims to bound `denyReason`'s work, adds a cap justified by measured cost, and adds a second attacker-controlled resolution base. Shipping it with the cost model calibrated only on local paths converts a documented DoS into a documented-and-mitigated one that is not mitigated.

**Required remediation:** the bound must be on TIME, not on count. Concretely, all three of:
- reject any candidate base or target whose first two characters are `\\` and whose host is not local, **before** resolving (a remote UNC target cannot be inside `<hive>` anyway — it is a pure allow, so refusing to *resolve* it costs nothing and the existing "remote UNC is ALLOWED" negative control still passes);
- add a wall-clock budget across the whole `protectedPathDenial` call (measure elapsed inside the candidate loop; past ~500 ms, stop and **deny** with a reason naming the budget) so the cap has a time floor as well as a count ceiling;
- state the budget, the shim's 5 s, and the margin in the comment and the SUMMARY, and pin it with a behaviour case that drives a dead-UNC `cwd` and asserts the call returns in under the budget.

---

## B3-04 — 01-26 Task 2: the re-derived adjudicator closes the four NAMED classes and opens five more that are redacted at HEAD today. The new `REGRESSION` array cannot see any of them **[demonstrated]**

First, the good news, re-run in full against a faithful implementation of `<measured_evidence>` F (pattern 3 with the three `\b`-anchored arms, pattern 5 with the back-referenced key quote, the six-rule adjudicator in the replacement callback):

```
--- SENSITIVITY: 15 live SECRETS ---                        15/15 ok
--- SENSITIVITY: 5 new (sk_live/sk_test/rk_live/sk_ant/generic sk-) --- 5/5 ok
--- B2-06 REGRESSION: must stay redacted ---
   ok  "login password=12345678"                       -> "login password=[redacted]"
   ok  "db password=$2b$12$KIXxPfPqmSabcdefghijklmn"   -> "db password=[redacted]"
   ok  "cfg client_secret=ABCDEFGH1234IJKL"            -> "cfg client_secret=[redacted]"
   ok  "bot_token=XOXBTESTTOKENVALUE1234"              -> "bot_token=[redacted]"
--- SPECIFICITY: 12 false positives ---                     12/12 strictly unchanged
--- SPECIFICITY: 6 live BENIGN ---                           6/6 strictly unchanged
--- JSON round trip ---   {"token": "[redacted]", "keep": 1}   parses: true
ROWS 42  FAILING 0
```

**B2-06's four named classes are genuinely closed.** The bcrypt/argon2/sha512-crypt family is safe because the `$`-rule requires the whole value to be `\$\{?[A-Za-z_][A-Za-z0-9_]*\}?` and every crypt encoding carries a second `$`.

Now the same predicate against classes nobody enumerated. `LIVE @HEAD` is the shipped `redactSecrets` (`hive.ts:391`), verbatim:

```
class                         LIVE @HEAD  AFTER 01-26   output
dotted passphrase             redacted    CLEAR    "login password=Correct.Horse.Battery"       <<< NEW LEAK
dotted api key                redacted    CLEAR    "cfg api_key=my.secret.key.value"            <<< NEW LEAK
versioned auth token          redacted    CLEAR    "auth_token=v1.aBcDeFgH12345678"             <<< NEW LEAK
dotted client secret          redacted    CLEAR    "client_secret=prod.app.9f3a2b1c"            <<< NEW LEAK
dotted domain-ish secret      redacted    CLEAR    "webhook_secret=hooks.slack.com"             <<< NEW LEAK
non-eyJ dotted token          redacted    CLEAR    "refresh_token=eyJhbG.ciOiJI.UzI1NiJ"        <<< NEW LEAK
ALLCAPS underscore passphrase redacted    CLEAR    "password=CORRECT_HORSE_BATTERY"             <<< NEW LEAK
ALLCAPS underscore <=24       redacted    CLEAR    "client_secret=PROD_SLACK_SIGNING_1"         <<< NEW LEAK
$-prefixed real password      redacted    CLEAR    "token=$ecretV4lue"                          <<< NEW LEAK
type-name-shaped password     redacted    CLEAR    "password=unknown"                           <<< NEW LEAK
weak word password            redacted    CLEAR    "token=boolean"                              <<< NEW LEAK
bcrypt (control)              redacted    redacted "db password=[redacted]"
argon2 (control)              redacted    redacted "password=[redacted]"
trailing-semicolon (control)  redacted    redacted "password=[redacted]"
```

**The dotted rule is the worst of these and it is unbounded.** `/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z0-9_$]+)+$/` has no length limit and no context. Version-prefixed dotted tokens are a mainstream credential encoding — HashiCorp Vault service tokens (`hvs.CAESIJ…`), Doppler service tokens (`dp.st.dev.…`), and any `v1.<base64ish>` scheme all match it exactly. `token=hvs.CAESIJabcdefgh` is redacted today and is a plaintext leak after this plan.

**And no fixture can catch it.** The new `REGRESSION` array carries exactly the five pins the plan lists (four B2-06 classes + the generic `sk-` arm). `SECRETS` asks only *"is the secret gone"* of strings that were never these shapes. `BENIGN` asks only that its six strings are unchanged. The behavioural LOCKSTEP arm reuses `SECRETS + BENIGN + REGRESSION`, so it compares two identical leaks. **The plan's battery will report 47/47 green while eleven more real credential shapes stop being redacted** — which is, word for word, the failure mode B2-06 described and this revision was written to close.

**Secondarily, the plan's own stated principle is not implemented.** `<measured_evidence>` F justifies the numeric rule as *"in JSON a credential is a string; an unquoted number under a quoted key is a number."* The adjudicator receives only `keyQuoted` — the captured value quote `vq` is never passed to it. So a **quoted** numeric string, which is a credential by the plan's own sentence, is rejected as a number:

```
{"token": "12345678901234"}   -> CLEAR
{"password": "98765432"}      -> CLEAR
{'api_key': '12345678'}       -> CLEAR
```

Neither is a regression (live pattern 5 cannot match a quoted key at all), but the entire point of the new `(["']?)\b(KEY)\1` change is to *reach* quoted keys — and having reached them the adjudicator throws the catch away for exactly the shape the rationale calls a credential. One-token fix: pass `vq` and require `!vq` on the numeric rule.

Both consumers are hit: `scrubStagedSecrets` (FLOOR-04's requirement text is *"so it never reaches git history"*) and the mail path (`hive.ts:2254-2255`, every subject and body).

**Required remediation:**
- **Dotted rule:** bound it. Require the value to also be short (`t.length <= 32`) **and** to have no segment of 12+ chars, or better, restrict the rule to values whose first segment matches a known code-ish root (`process`, `cfg`, `config`, `env`, `opts`, `this`, `self`) — the twelve specificity strings only need `cfg.token` and `process.env.FOO`, both of which that covers. Verify against `hvs.CAESIJabcdefgh` and `v1.aBcDeFgH12345678`.
- **ALL-CAPS rule:** already length-bounded at 24; the remaining leak is real passphrases. Require it to *also* match a placeholder vocabulary (`REPLACE`, `CHANGE`, `YOUR`, `TODO`, `XXX`, `EXAMPLE`, `PLACEHOLDER`) rather than mere shape.
- **Type-name rule:** require the match to be preceded by `:` (a TypeScript annotation) rather than `=`; `password=unknown` is a password, `token: string;` is a type.
- **`$`-rule:** require length ≥ 4 after the `$` **and** that the name be ALL-CAPS or contain `_` — `$ecretV4lue` is not an env reference, `$OPENAI_API_KEY` is.
- **Pass `vq` to the adjudicator** and only reject numerics when the value was unquoted.
- **Add all eleven rows above to `REGRESSION` with exact-output pins**, so the battery can go red. Every one of them is a one-line `assert.strictEqual`.

---

## B3-05 — 01-24 Task 1: the leaf-symlink case the memoisation is required to preserve is **not** pinned by the test the plan cites, and the plan's own performance target rewards dropping it **[demonstrated]**

The plan mandates:

> *"Memoise the directory. Cache `realResolve` per distinct parent directory within ONE payload, then canonicalise the leaf separately. **Do NOT skip the leaf**: a symlink whose LAST component points into `<hive>/bin` is exactly the attack `realResolve` exists to catch, and **case 8 of the `:250` test pins it**."*

Case 8 does not pin it. Read live, `test/net-binding.test.cjs:307-316`:

```js
const hop = path.join(hiveRoot(t), 'b');
try { fs.symlinkSync(path.join(root, 'bin'), hop, 'dir'); linked = true; } ...
assert.equal(await decide('Write', { file_path: path.join(hop, 'cth-hook.cjs') }), 'deny', ...)
```

`hop` is a **directory** symlink and the target is `hop/cth-hook.cjs`. Under the memoise-the-dir scheme, `dirname` is `hop`, the memo resolves `hop` → `<root>/bin`, the leaf is joined on, and the case is **DENIED whether or not the leaf is canonicalised**. I ran the skip-the-leaf variant explicitly and confirmed it: the only test the plan names as protection is green with the protection removed.

A genuine leaf symlink — `ln -s <hive>/bin/cth-hook.cjs /tmp/x.cjs`, then `Write /tmp/x.cjs` — has **no test anywhere in the file**, at HEAD or after this plan. (It could not be added on this host anyway: `fs.symlinkSync(file, link, 'file')` returns **EPERM** without elevation or Developer Mode — so the case is POSIX/Developer-Mode-only and needs the same capability branch case 8 already has.)

**Why this is a blocker and not a note:** the leaf canonicalisation is exactly the clause that costs the plan's headline speedup. Measured on this host:

```
                     memo-dir + canonicalise leaf   memo-dir + SKIP leaf
README heredoc            33 ms                          28 ms
git add 120 files          9 ms                           2 ms
```

An executor told to hit "342 ms → 14 ms" and told that "case 8 pins the leaf" will, on finding case 8 green either way, take the faster shape. The plan supplies the incentive and a false assurance that the incentive is fenced.

**Required remediation:** add a leaf-symlink behaviour case (capability-branched exactly like case 8, with the caught error printed as evidence on win32), and delete the false "case 8 pins it" sentence. If the case cannot run on the executor's platform, the plan must say the leaf canonicalisation is unpinned and that the reviewer must read the diff for it.

---

# HIGH

## H3-01 — 01-24 `<interfaces>`: the cost table does not reproduce, and on two rows the "optimisation" is a pessimisation **[demonstrated]**

The plan's table is presented as *"MEASURED IN THE REVISION-3 SESSION"* and its numbers drive the cap. Re-measured here, same host, same split regex, two bases, real repo files. `charitable` = memo the dir with a full climb + ONE non-climbing realpath for the leaf (the reading that produces the plan's numbers). `FIXED` = the same, but with the resolver **this plan mandates** (`.native` first, JS fallback, then climb):

```
case                  plan says            today JS   charit/JS   charit/FIXED   literal/FIXED
README heredoc        342 -> 14 ms         492 ms     24 ms       33 ms          56 ms
git add 120 files      16 -> 6  ms          22 ms     16 ms        9 ms          72 ms
dir-spray 10 000        — -> 3 147 ms     2 979 ms  3 984 ms    5 166 ms       12 322 ms
path-shaped 50 000  >9000 -> 3 533 ms    14 402 ms 20 461 ms   25 477 ms       58 276 ms
```

Three problems:

1. **The two attack rows are wrong by 1.6× to 7×, in the unsafe direction.** The plan's own `dir-spray 10 000` row, re-measured with the resolver the same plan mandates, is **5 166 ms — past the shims' 5 s budget**. The plan uses that row as the "still too expensive, so cap lower" evidence; it is in fact the row that already fails open.
2. **The claim *"a 24× reduction with no loss of coverage"* is true only for the heredoc.** On the *worst real observation* the plan itself nominates — `git add` of 120 files — the literal reading of the plan's own instruction sequence (memoise the dir with a climb, then canonicalise the leaf with a climb) is **3× slower than today** (22 ms → 72 ms). The memoisation only pays when many candidates share a directory; the adaptive attacker's obvious move, and the plan's own `dir-spray` row, is one directory per candidate, where the memo never hits and you pay dir *and* leaf instead of just the path.
3. **The 342 ms baseline does not reproduce either** (492 ms here) — same order, but the whole table is presented as an exact re-measurement.

**Consequence for the cap:** a safe value *does* exist for local paths (~0.5 ms/candidate → a cap of 200–2000 costs 0.1–1 s, clearing the 120-file `git add` with headroom), so B2-02's "no safe value" is resolved. But an executor calibrating from the plan's table will believe 10 000 costs 3.1 s and set the cap far too high. **Fix:** re-measure with the mandated `.native` resolver, publish both readings of "canonicalise the leaf separately", and state the cap's worst-case in the same units.

## H3-02 — 01-24 Task 1: the mandated `.native` fallback is fail-OPEN by construction, its motivating claim does not reproduce, and no behaviour case pins it

The plan states as measured fact:

> *"`.native` is **not** a drop-in: it throws where the JS one does not on at least one shape, and this file's `realResolve` already swallows throws by climbing — so a naive swap DEGRADES SILENTLY."*

The plan's own table contains **no such shape** — every row where one throws, both throw or `.native` is the one that succeeds. I hunted for one across 22 shapes (trailing dot/space, `C:` bare, reserved device names, `nul`/`CON`, invalid characters, 374-character deep existing paths, directory junctions, junctions to missing targets, junction loops, `\\.\PhysicalDrive0`, `\\.\pipe`, a dead UNC host) and, separately, under an exclusive `FileShare.None` lock held by another process. **Zero divergences in that direction.** The only divergences found are `\\?\` and `\\.\`, where the *JS* one throws EISDIR and `.native` succeeds.

So the plan mandates a fallback on an unreproducible premise, and the fallback is — in the plan's own words — *"exactly the old, non-canonicalising behaviour"*. Whatever shape does trigger it restores the 8.3 / `subst` bypass in full. Its only stated protection is *"that is what the group-B tests pin"* — but group B exercises the *success* path; **not one behaviour case drives the fallback**.

**Fix:** either drop the fallback (fail closed: if `.native` throws, climb, exactly as today's single implementation does) or keep it and add a behaviour case that forces `.native` to throw and asserts the verdict is still DENY. Do not ship an unmeasured, unpinned, documented-fail-open branch inside the function that decides GATE-01.

## H3-03 — 01-24 Task 2: the aggregate byte budget has no eviction and no per-peer accounting, so the cheap attack becomes a total floor denial

The counter is *"incremented on `data` and decremented on close"*, with a floor-wide budget. A `done`-flagged connection is half-closed on the writable side only — the plan mandates `conn.end(...)`, deliberately leaving the readable side open — so its bytes stay counted until the peer closes. An attacker who never closes holds budget indefinitely.

Once the aggregate budget is exhausted, **every new connection takes the explicit-deny path**. That is fail-*closed*, which is the right direction, but the consequence is unstated: every PreToolUse on the floor is denied, and — via `hive.ts:3722` / `:4103` — every `Stop` on agy and grok becomes `{decision:'deny'}`. A total, self-sustaining floor outage from a handful of sockets, with no eviction, no per-peer cap and no recovery path named anywhere in the plan.

Combined with B3-02 the attacker simply picks: `maxConnections` for fail-open, the byte budget for fail-closed-total-outage.

**Fix:** account bytes per *connection* and evict the oldest/largest offender rather than refusing new arrivals; drop `done` connections' bytes from the counter at `done`, not at close; state the recovery behaviour and pin it with a case that closes the attacker sockets and asserts the floor recovers.

## H3-04 — 01-24 Task 1: the local-share host match is unspecified on case and unpinned on two of its five hosts, and `subst` is asserted closed with no behaviour case

The action names the host set `{localhost, 127.0.0.1, ::1, ., os.hostname()}` but never says the comparison is case-insensitive. Measured: `\\LOCALHOST\c$\…` and `\\desktop-lo8bh39\C$\…` both write into the real directory, and `.native` echoes the machine's canonical casing (`DESKTOP-LO8BH39`) regardless of the input's. A `===` comparison — the natural first write — leaves both open. Behaviour group B pins only `\\localhost\C$` and the `127.0.0.1` form; there is **no case case and no `<hostname>` case**, so neither gap can go red.

Separately: `\\.\C$` is in the mandated host list and is not a reachable spelling at all (measured: `FAIL ENOENT`), while `\\127.1\C$`, `\\0x7f000001\C$` and `\\2130706433\C$` all fail at the OS layer too — so the list is harmless but two of its entries are decoration and the two that matter are untested.

And `must_haves.truths[4]` asserts *"a `subst` drive alias reaches the same deny branch"*, but behaviour group B contains **no subst case** and the success criterion silently substitutes "local admin share" for it. The fix does close subst (verified: JS `Y:\bin\cth-hook.cjs` → `.native` `C:\Users\…\bin\cth-hook.cjs`) — the gap is that nothing pins it.

**Fix:** state `.toLowerCase()` on both host and drive letter; add behaviour cases for `\\LOCALHOST\c$`, `\\<os.hostname()>\C$` and a `subst` alias (capability-branched, since `subst` may be unavailable in CI).

## H3-05 — 01-26: the widened pattern 5 reaches quoted-key JSON and then declines exactly the shape its own rationale calls a credential

Covered in B3-04's second half; raised separately because the fix is one token (`vq`) and because the residual the plan *does* name (*"a secret written as an unquoted JSON number is not redacted"*) is narrower than the behaviour that ships: **quoted numeric strings are also declined**, and those are unambiguously strings. `{"token": "12345678901234"}` is the canonical shape of a numeric API token in a config file the hive itself commits (`registry.json`, `tasks.json`, every per-agent `settings.json` — the plan's own list).

---

# WARNINGS

**W3-01 — 01-24 Task 1: the mandated non-local-UNC negative control makes the suite slow and network-dependent.** Behaviour group B requires *"a NON-local UNC path (`\\some-nas\share\project\file.ts`) is still ALLOWED"*. Measured on this host: **2 682 ms** for a NetBIOS-resolution failure, and **21 017 ms** if the name resolves to an unroutable address — which a corporate DNS with a wildcard, a captive portal or a search-domain suffix will do. Pick a name that cannot resolve (a `.invalid` TLD host, e.g. `\\nas.invalid\share\project\file.ts`) and state the reason, or assert the ALLOW without resolving.

**W3-02 — 01-24 Task 1 step 5: the order of "memoise" and "cap" is under-specified and one reading is fail-open.** The bullets run *Filter → Dedupe → Memoise the directory → Then cap*. "Memoise" is a resolution step; read literally, the cap is applied after everything has already been resolved, which pays the full cost before denying. The trailing clause (*"return a deny reason rather than truncating the scan"*) implies the opposite. Say explicitly: **count the distinct path-shaped candidates and deny before resolving any of them.**

**W3-03 — 01-24 Task 2: the W-02 trade is correctly recorded, and one arm is missing from it.** Verified live at `hive.ts:3722` and `:4103-4104`. The plan names `Stop`, `PostToolUse`, `Notification` and `Status`; it does not name that the **statusLine** path (`hive.ts:3646-3655`) never reads a reply at all (`c.end(...)` then `c.on('close', () => process.exit(0))`), so a bound-cross on a status tick is silently discarded rather than mistranslated. That is the one harmless case and it is worth one clause, because it is also the highest-frequency payload on the socket.

**W3-04 — 01-25 `:104` quotes a `VALID_SESSION_ID` the file does not contain.** Live `src/main/transcript.ts:73` is `const VALID_SESSION_ID = /^[A-Za-z0-9_-]+$/;` — unbounded. `:104` states `/^[A-Za-z0-9_-]{1,128}$/`. The task-3 table's column C is correct (`/^[A-Za-z0-9_-]+$/`), and the subset relation holds either way, so nothing is unsafe — but a security plan quoting a bound the shipped constant does not have is how B2-01 happened.

**W3-05 — 01-26: the behavioural LOCKSTEP arm shares its corpus with the sensitivity battery, so both are blind to the same gaps.** Arm 2 runs `SECRETS + BENIGN + REGRESSION` through both copies. Any credential class absent from those three arrays (B3-04's eleven) is invisible to the sensitivity battery *and* to the drift guard simultaneously — one blind spot, counted twice. The textual arm covers drift, so this is not a blocker; but the plan should say plainly that the behavioural arm proves *agreement*, not *correctness*.

---

# Verified closed — attacked and could not break

1. **The win32 mechanism claims (01-24).** Every row of the plan's 9-row table reproduced exactly, including the write-lands column, the `subst` row, the `C:\Users\ALIENW~1` live alias, the EISDIR-then-climb explanation for `\\?\`, and the "both implementations return the admin-share form unchanged" row. `.native` closes 8.3, `\\?\`, `\\.\` and `subst`; the local-share normaliser closes `localhost`/`LOCALHOST`/`127.0.0.1`/`::1`/`<hostname>`/`<hostname lowercased>`. The remote-UNC negative control (`\\some-nas\share\…` ALLOWED) holds. Only B3-01's `\\?\UNC\` composition survives.
2. **B2-04, `payload.cwd` deny-wins (01-24 T1).** Traced under every ordering: stage 1 registry-only with an `isAbsolute` filter; empty → deny before `payload.cwd` is read; stage 2 append-only onto a non-empty set; the candidate loop returns the FIRST deny. An attacker-supplied absolute `cwd` can add candidates and therefore only add denies. Cap-cross and aggregate-cross both **deny** rather than truncate, so neither can be used to convert a deny into an allow either. **No DENY→ALLOW conversion found.** (The cost axis is B3-03; the verdict axis is closed.)
3. **B2-05, the `sessionKey` separator (01-25 T1).** `grep -n 'u0000' src/main/hive.ts` → `2842: const key = \`${row.agent_id ?? ''}\u0000${row.session_id ?? ''}\`;`. The plan now states `\u0000` at `:209-210`, `:418-422`, and T-P25-04. The two injectivity assertions are mandated as non-optional, forbidden from naming the separator, and are the only assertions in the file that a wrong separator can fail. Closed.
4. **`SPAWN_SAFE_SESSION_ID` (01-25 T3), re-run.** `/^(?![-_])[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/` rejects `--dangerously-skip-permissions`, `--print`, `-c`, `-`, `--`, `_leading`, `x" & whoami & "`, 129×`a`, 200×`a`, empty, and every shape I invented: `a\n--dangerously-skip-permissions`, `abc\n`, `abc\r\n`, `a\u0000b`, `@x`, `a b`, `a/b`, `a\b`, `a$b`, `a\u2028b`, `\uFF0Dprint` (fullwidth hyphen-minus), `a\u00ADb` (soft hyphen), `a\uFEFF`, `ａbc` (fullwidth A). Accepts UUID, 128×`a`, `sess_01-ABC`, `a-b`, `0`, `A`. Subset relation `SPAWN ⊆ VALID(live)`: **0 violations** over the plan's table and over 300 000 randomised strings drawn from the union charset including `\n`, `\r`, `\u0000`, space, `/`, `\`, `$`, `"`, `&`, `\u2028`.
5. **B2-07, the LOCKSTEP guard (01-26 T1).** Two arms is the right shape: a callback-only drift is RED behaviourally and blind textually to a literal list; a `{6,}`→`{99,}` drift is RED textually and blind behaviourally. The cardinality assertion closes the `new RegExp(KEYS + …)` vacuity hole round 2 named. Slicing the adjudicator is mandated (*"whatever function `redactSecrets` calls is part of the contract"*). The strip-list-must-apply assertion closes the "hide the difference in the strip list" hole. Closed.
6. **The `hooks.ts` split (01-24 / 01-25).** Real and non-colliding. `.planning/config.json:31` → `"use_worktrees": false`. 01-24 is wave 1 with `depends_on: []`; 01-25 is wave 2 with `depends_on: ["01-24"]`. Both carry the reciprocal `shares_files_with` with the same split text. 01-24's surface is `realResolve` (`:126`), `within` (`:143`), `listenOn` (`:245`), `protectedPathDenial` (`:434`), `expandHiveVars` (`:465`), `denyReason` (`:484`) and two comments; 01-25's is one statement above `hooks.ts:565` (`if (agentId && p.session_id) this.hive.recordSession(agentId, p.session_id);`) plus one import. Disjoint. 01-24's `<verification>` requires the SUMMARY to state it left the `recordSession` call site untouched; 01-25 carries a STOP-and-report clause if 01-24's landed shape makes the statement unplaceable. No line-range edits in either plan.
7. **B2-06's four named classes (01-26 T2).** `password=12345678`, `password=$2b$12$…`, `client_secret=ABCDEFGH1234IJKL`, `bot_token=XOXBTEST…` all redact after the change. The whole crypt-hash family is safe (`$2b$`, `$2y$`, `$6$`, `$argon2id$`, `$apr1$`) because the `$`-rule demands the *entire* value be a single `\$NAME`. The 12 specificity strings are 12/12 strictly unchanged, the 6 BENIGN 6/6, `{"token": "…"}` round-trips through `JSON.parse`. **42/42, 0 failing.**
8. **W-01, `conn.end()` (01-24 T2).** Named by API, with the reason (`destroy()` discards pending writes → ECONNRESET → exit 0 → allow), pinned by a client that keeps writing after the deny arrives, and `<done>` asserts `conn.destroy(` is 0 on every new bound path.
9. **B2-03's timeout half (01-24 T2).** Sized BELOW the shims' 5 s (`hive.ts:3670`, `:3735`, `:4118`), with an elapsed-time assertion and a still-connected assertion. This is the correct inversion of revision 2 and it closes the round-2 finding — subject to B3-03, which freezes the event loop the timer lives on.
10. **01-28's round-2 dispositions.** The false "a stuck-`blocked` agent never receives mail again" premise is retracted in writing (T-P28-04, and the `:249-254` interface note re-derives `drainQueue`'s gate list). Both surviving shapes — (a) a false `blocked` landing after the last real Stop, (b) `quiesce`'s durable `setStatus('idle')` half — are recorded at `:630-637` under a mandated SUMMARY heading, with anchors, owners and recovery paths, plus an explicit *"do NOT satisfy this by narrowing truth #3's wording"* clause. Accepted-and-recorded is the honest disposition for a gap-closure plan; nothing here is presented as fixed when it is not.
11. **No new credential reaches disk, no new permission surface, no token oracle.** Re-checked across all four plans: no new file, no new IPC channel, no serialisation of `hookToken`/`otelToken` to the renderer, and the bound-cross deny reply carries the bound's name and no token material.
12. **`agentForToken` stays deleted (01-24 T3).** `<done>` asserts `grep -c 'agentForToken' src/main/hooks.ts` is 0, and the objective's clause 10 records why in a form a future executor cannot mistake for an oversight.

---

## Gate list before any of this executes

1. **01-24 T1** — normalise the local admin share **after** resolution as well as before; add `\\?\UNC\<local>\C$` and `\\.\UNC\<local>\C$` to group B. (B3-01)
2. **01-24 T2** — remove `server.maxConnections` as the connection bound; enforce the cap inside the handler so the over-limit peer receives a non-empty deny; move the `<done>` grep off `maxConnections`. (B3-02)
3. **01-24 T1+T2** — reject non-local UNC candidates before resolving, add a wall-clock budget across `protectedPathDenial`, and pin it with a dead-UNC `payload.cwd` case. (B3-03)
4. **01-26 T2** — bound the dotted rule, gate the ALL-CAPS rule on a placeholder vocabulary, restrict the type-name rule to `:` annotations, require a `_`/ALL-CAPS name in the `$`-rule, pass `vq` to the adjudicator, and add all eleven leaked classes to `REGRESSION` with exact-output pins. (B3-04, H3-05)
5. **01-24 T1** — add a leaf-symlink behaviour case and delete the false "case 8 pins it" sentence. (B3-05)
6. **01-24 `<interfaces>`** — re-measure the cost table with the mandated `.native` resolver and publish both readings of "canonicalise the leaf separately"; correct the two attack rows. (H3-01)
7. **01-24 T1** — pin or drop the `.native` fallback; do not ship an unmeasured fail-open branch inside GATE-01's decision function. (H3-02)
8. **01-24 T2** — per-connection byte accounting with eviction; drop bytes at `done`, not at close; state and pin the recovery path. (H3-03)
9. **01-24 T1** — case-fold the share host/drive comparison; add `\\LOCALHOST\c$`, `\\<hostname>\C$` and a `subst` behaviour case. (H3-04)
10. **01-24 T1** — use a `.invalid` host for the remote-UNC negative control; state the cap/resolve ordering explicitly. (W3-01, W3-02)
11. **01-25** — correct the `VALID_SESSION_ID` quotation at `:104` to the live `/^[A-Za-z0-9_-]+$/`. (W3-04)

---

_Lens B of round 3. Every finding marked **[demonstrated]** was reproduced by executing the plans' own proposed logic against live source and the live filesystem on the operator's Windows host in this session. No source file and no plan was modified; nothing was committed._
