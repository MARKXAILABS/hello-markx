---
phase: 01-finish-the-floor
round: 3
lens: A — vacuity + anchors + newly-introduced defects
reviewed: 2026-08-22
head: bd74777
branch: gsd/v1.0-milestone
depth: deep
plans_reviewed: 8
plans_reviewed_list:
  - .planning/phases/01-finish-the-floor/01-24-PLAN.md
  - .planning/phases/01-finish-the-floor/01-25-PLAN.md
  - .planning/phases/01-finish-the-floor/01-26-PLAN.md
  - .planning/phases/01-finish-the-floor/01-27-PLAN.md
  - .planning/phases/01-finish-the-floor/01-28-PLAN.md
  - .planning/phases/01-finish-the-floor/01-29-PLAN.md
  - .planning/phases/01-finish-the-floor/01-30-PLAN.md
  - .planning/phases/01-finish-the-floor/01-31-PLAN.md
findings:
  critical: 7
  warning: 15
  info: 0
  total: 22
status: issues_found
verdict: NOT CLEAN
---

# Red-team round 3, lens A — vacuity + anchors + newly-introduced defects

**Head:** `bd74777` · **Revisions under review:** `95abc90`, `6a70e05`, `994e036`, `bd74777`
**Method:** every `<done>` predicate in all eight plan bodies executed at HEAD; every `<action>`-block
line range opened against live source; every cross-plan and cross-file citation resolved; every
`key_links.pattern` compiled through `new RegExp()` and tested against the file its `from:` names;
`frontmatter.cjs:parseMustHavesBlock` and `verify.cjs` read and driven directly; 01-24's win32 bypass
table, cap-cost table and TAP counters re-run; 01-26's redaction corpus, LOCKSTEP normalisation and
chunking table re-run against the live matcher; the full suite re-run.

Nothing below is inherited from a plan's own prose or from rounds 1–2.

## Bottom line

The frontmatter gates really are structurally sound and RED — I confirm the orchestrator's
`0/N` counts, zero invalid regexes, zero `Source file not found`, zero NUL bytes, and I did not
re-litigate them. **Every one of the 46 `<done>` predicates across the eight plan bodies also fails
correctly at HEAD.** I could not find a single already-passing acceptance gate. The anchor work is the
best of the three rounds: 01-28 and 01-29 are flawless, 01-26's measured evidence reproduces
row-for-row including the two corrections it makes to round 2, and round 2's `01-30-PLAN.md:218`
cross-plan drift, the NUL separator, the `a217018` SHA test, the self-shifting `:529-544` delete and
the two false Windows baselines are all genuinely closed.

What survives is one level down again, and it is mostly **round 3's own work**:

1. **Round 3 added `server.maxConnections` to 01-24 (0 occurrences at `3051a47`, 8 at HEAD) and it is a
   silent-destroy path.** Measured live this session: an over-cap peer never reaches the connection
   handler and receives **ECONNRESET with zero bytes**. By the plan's own rule (`hive.ts:3669`,
   `net-binding.test.cjs:279`), that is `allow`. The mandate re-creates, in the same task, the exact
   gate bypass revision 3 wrote items 9 and T-P24-06 to remove — and the behaviour case it ships
   ("assert what the over-limit connections receive (a deny, then a close)") cannot pass.
2. **Round 3 fixed the prose-`from:` class by pointing at real paths, and picked the wrong file twice.**
   01-26's `LOCKSTEP drift` and 01-30's `hashedGlobs` both name a `from:` that the plan's own tasks put
   the string somewhere else. Both `to:` values are prose, so there is no fallback. Both are red in
   every state, forever.
3. **The regex/fixed-string confusion the brief predicted landed in the inverse direction.** 01-26's
   `pattern: "proxyTokens.get(agentId) === "` was validated with `grep -F`, then handed to
   `new RegExp()`, where `(agentId)` is a **capture group**. Verified: the compiled regex matches
   `proxyTokens.getagentId === ` and cannot match the literal text task 2 is told to write. The same
   plan explicitly reasons about this hazard for `\\bsk` two lines away and closes it there.
4. **01-30 now ships a false statement about the verifier, and contradicts itself.** Its footer says
   *"`verify.cjs` evaluates `contains:` as a REGEX"*. `verify.cjs:314` is `fileContent.includes(...)`.
   Its own line 214 says so correctly. Verified mechanism: the parser drops the key to `undefined`.
5. **01-27 was never revised for its round-2 blocker.** The whole round-3 diff on that plan is the two
   key_links and one sentence; BL-27-2 (a range edit against the plan's own prohibition, self-shifted by
   the same task) is untouched.

**Verdict: NOT CLEAN.** 7 BLOCKER, 15 WARNING.

---

## Part 0 — Ground truth measured this session at `bd74777`

| Fact | Measured |
|---|---|
| `git diff --name-only a217018..HEAD -- . ':!.planning/'` | **empty** — no source has changed; every "measured at a217018" claim is testable now |
| `node --test --test-reporter=tap test/*.test.cjs` | `tests 535 · pass 531 · fail 0 · skipped 4` — matches 01-24 and 01-27's corrected baselines |
| `node --test test/net-binding.test.cjs` | `tests 19 · pass 19 · fail 0 · skipped 0` — matches 01-24 exactly |
| `<done>` predicates executed | **46 across 8 plans — every one RED at HEAD.** No vacuous acceptance gate found |
| NUL bytes in any plan | **0** — BL-25-2 closed |
| Cross-plan `NN-PLAN.md:LINE` citations | **0 remaining** — BL-29-4 closed |
| `grep -rn "{ skip:" test/*.test.cjs` | exactly the four 01-31 lists, at the lines it lists |
| `git grep -n "Enterprise Knowledge Graph" -- src resources docs test scripts e2e '*.md' ':!.planning'` | **11 lines / 6 files** — matches 01-31 exactly; BL-31-1 closed |

**Measured-table reproductions.** 01-24's win32 resolution table reproduces **exactly** (8.3 alias
lives on this host; JS `realpathSync` returns it unchanged, `.native` → `C:\Users\Alienware`; JS throws
`EISDIR` on `\\?\` and `\\.\` where `.native` resolves; both return the `\\localhost\C$\…` and
`\\127.0.0.1\C$\…` UNC forms unchanged). 01-24's cap-cost table reproduces on 3 of 4 rows
(README 2616/1297/102/67 ✓, DESIGN 3613/1840/83/30 ✓, `git add` 122/122/120/120 ✓; transcript.ts off by
one — WR3-05). 01-26's 13-row table A reproduces **row for row** including both already-broken
TypeScript shapes; its section B four leak classes are all redacted today; sections C and H reproduce
exactly (`chunked 0 / one-line 0` at HEAD, `obj["token"]` unchanged); the LOCKSTEP normalisation
reproduces **exactly `959 / 959 / identical: true`**.

---

## Critical Issues

### CR-01 — BLOCKER — 01-24 mandates `server.maxConnections`, which is a silent destroy: the aggregate bound IS a gate bypass

**File:** `.planning/phases/01-finish-the-floor/01-24-PLAN.md:39-41` (artifact gate), `:646-655`
(task 2 action), `:691` (`<done>`), `:552` (T-P24-12), and behaviour case at `:622-625`.

**New in round 3.** `git show 3051a47:…/01-24-PLAN.md | grep -c maxConnections` → **0**. At HEAD → **8**.

The plan's own load-bearing rule, stated three times, is that no exit from this listener may close
without replying:

> *"On cap-cross, on aggregate-cross and on timeout, write an explicit DENY response before closing,
> and close with `conn.end(response)` — never `conn.destroy()` and never a silent close. `destroy()`
> discards pending writes; the peer gets ECONNRESET, exits 0, and that is an ALLOW."*

`server.maxConnections` does exactly what that sentence forbids, in C++, before the `'connection'`
event is emitted. Measured this session:

```
server.maxConnections = 1
  connection handler invocations: 1        ← the over-cap connection NEVER reaches the handler
  over-cap peer saw: { event: 'error', code: 'ECONNRESET', got: '' }
```

Node's `net.Server` closes the client handle and returns without emitting `'connection'`, so the
module-level deny constant this task creates can never be written on that path. Follow the plan's own
chain: ECONNRESET → `c.on('error', () => process.exit(0))` (`hive.ts:3669`, `:3734`, `:4117`) → exit 0
with no stdout → **`allow`** (`test/net-binding.test.cjs:279`).

The result is strictly worse than the DoS it is written to fix. Today, exhausting main's descriptors
requires actually exhausting them. After this change, an attacker opens `maxConnections` idle sockets
— cheap, no bytes, no payload — and **every real shim's connect is destroyed, floor-wide, for as long
as it holds them.** The plan says this itself in the same paragraph: *"exhausting main turns every
shim's connect into an `allow`."* `maxConnections` reaches that state deliberately and at a number the
plan tells the executor to publish.

Three further consequences:

- The behaviour case *"assert what the over-limit connections receive (a deny, then a close)"* is
  **unsatisfiable**. The over-limit connection receives nothing. The executor's cheapest exits are to
  delete the assertion or to delete the bound — and `contains: "maxConnections"` rewards keeping the
  broken half.
- T-P24-12 records the mitigation as *"`server.maxConnections` plus an aggregate in-flight byte budget
  … both replying deny before closing."* The first half cannot reply.
- The artifact gate pins the wrong mechanism into `src/main/hooks.ts` permanently.

**Fix:** drop `server.maxConnections` entirely and count connections the same way the plan already
(correctly) specifies for bytes — a module-scope counter incremented in the connection handler,
decremented on close, refusing past the bound **inside** the handler with the same explicit
`conn.end(DENY)` path. Change the artifact gate off `maxConnections` to the name of that counter, and
add the negative control the byte cap already has: assert the over-limit peer read the deny body
before close.

```js
// in listenOn's createServer callback — NOT server.maxConnections
let liveConns = 0;                       // module scope
createServer((conn) => {
  if (liveConns >= HOOK_MAX_CONNS) { conn.end(BOUND_DENY); return; }  // the peer READS this
  liveConns++;
  conn.on('close', () => { liveConns--; });
  ...
});
```

---

### CR-02 — BLOCKER — 01-26's `proxyTokens.get(agentId) === ` key_link is a regex whose parens are a capture group; it can never verify

**File:** `.planning/phases/01-finish-the-floor/01-26-PLAN.md:40-43`

`verify.cjs:359` is `new RegExp(link.pattern)`. Parsed and compiled this session:

```
pattern "proxyTokens.get(agentId) === "  ->  /proxyTokens.get(agentId) === /
  vs the literal text the task writes:  proxyTokens.get(agentId) === token   ->  FALSE
  vs de-parenthesised text:             proxyTokens.getagentId === token     ->  TRUE
```

`(agentId)` is a group; it matches the four characters `agentId` **without** the parentheses. No
correct implementation of task 2 can satisfy this link. `to:` is the prose string
`"the token that sidecar was spawned with"`, so `safeReadFile` returns null and the fallback arm never
runs either — `verified: false` in both states, forever.

This is the identical hazard the plan diagnoses and closes seven lines later for `\\bsk`
(`:357-361`: *"the harness compiles the stored `\\bsk` to a regex matching a literal backslash followed
by `bsk`"* — correct, and turned into a design requirement). The reasoning was applied to one gate and
not to its neighbour, and `<measured_evidence>` E (`:357`) states *"Every gate this plan declares is
RED at HEAD"* without distinguishing red-now from red-always.

The **artifact** gate of the same string is fine — `verify.cjs:314` is `includes()`, a fixed substring
— so only the key_link is broken.

**Fix:** escape the metacharacters for the regex slot — `pattern: "proxyTokens\.get\(agentId\) === "` —
or drop the parens from the pattern (`pattern: "proxyTokens\.get\(agentId\)"` still needs escaping;
`pattern: "proxyTokens"` plus the artifact gate is sufficient). Then re-run
`gsd-tools verify key-links` and require a *content* failure, not a structural one.

---

### CR-03 — BLOCKER — 01-26's `LOCKSTEP drift` key_link names a `from:` the string will never be in

**File:** `.planning/phases/01-finish-the-floor/01-26-PLAN.md:44-47`

```yaml
- from: "src/main/hive.ts"
  to: "its mirror in test/voice-messages.test.cjs"     # prose — safeReadFile returns null
  pattern: "LOCKSTEP drift"
```

The plan puts `LOCKSTEP drift` in the **test**, not in `hive.ts`. Task 1 `:464`: *"Put `LOCKSTEP drift`
in every failure message"*, in a task whose own opening line is *"Everything in this task is a TEST
change. `src/main/hive.ts` is NOT edited here"* (`:413`). Task 1's `<done>` (`:497`) gates it there:
`grep -Fc "LOCKSTEP drift" test/voice-messages.test.cjs` ≥ 1. Nothing anywhere in the plan writes that
string into `src/main/hive.ts` — task 2's only hive.ts comment work is the `Enterprise Knowledge Graph`
rename and the pattern battery.

Because `to:` is prose, `verify.cjs`'s target fallback cannot rescue it. Permanently `verified: false`.

Round 3 converted this `from:` from prose (`"redactSecrets in src/main/hive.ts"`) to a real path and
chose the wrong one — the round-2 finding is relabelled, not closed.

**Fix:** `from: "test/voice-messages.test.cjs"`, `to: "src/main/hive.ts"`.

---

### CR-04 — BLOCKER — 01-30's `hashedGlobs` key_link names `release.yml`; the plan puts `hashedGlobs` in `test/ci-config.test.cjs`

**File:** `.planning/phases/01-finish-the-floor/01-30-PLAN.md:50-53`

```yaml
- from: ".github/workflows/release.yml"
  to: "release.yml Upload build artifacts"    # prose — no fallback
  pattern: "hashedGlobs"
```

The plan states the destination itself, at `:458-459`:

> *"Name the extracted sets `hashedGlobs` and `uploadedGlobs` — the plan's `key_links` pattern is
> `hashedGlobs`, and it measures 0 at HEAD."*

`hashedGlobs` is a **JavaScript identifier in the test**, produced by a regex over `genStep.run`. Task
2's `<done>` gates it there (`grep -Fc "hashedGlobs" test/ci-config.test.cjs` ≥ 1). Task 3's `<done>`
gates `release.yml` on `*.blockmap latest*.yml` and `installers=` — never on `hashedGlobs`, and nothing
in task 3's action would produce it. `verified: false` forever.

Same shape as CR-03: round 3 replaced round-2's prose `from: "release.yml Generate checksums"` with a
real-but-wrong path. Verified at HEAD: `grep -Fc hashedGlobs .github/workflows/release.yml` → 0, and
no instruction changes that.

**Fix:** `from: "test/ci-config.test.cjs"`, `to: ".github/workflows/release.yml"`.

---

### CR-05 — BLOCKER — 01-30 states a false verifier semantics as measured fact, and contradicts itself in the same document

**File:** `.planning/phases/01-finish-the-floor/01-30-PLAN.md:613-623` vs `:213-217`

`:616` — *"But `verify.cjs` evaluates `contains:` as a REGEX, where `["']?` is optional and the pattern
collapses to plain `sock_token` -> 8 hits, INCLUDING the very `assert.match(body, /sock_token/)` this
plan exists to delete. **Measured:** the plan graded `1/6` under the real verifier with that gate
passing at HEAD."*

`:214` of the **same plan** — *"`verify.cjs` evaluates `artifacts[].contains` with `String.includes()`
and `key_links[].pattern` with `new RegExp()`."*

`:214` is right. `verify.cjs:314` is:

```js
if (artifact.contains && !fileContent.includes(artifact.contains)) { … }
```

There is no `RegExp` on the artifact path. The real mechanism, driven through
`frontmatter.cjs:parseMustHavesBlock` this session with the exact old line:

```
RAW:    contains: "sock_token[\"']?"
PARSED: { path: 'test/hook-auth-roundtrip.test.cjs', provides: 'x' }   ← contains key ABSENT
        contains value: undefined
```

`if (artifact.contains && …)` short-circuits on `undefined`, so the artifact passed with **no check
executed at all**. The `8` in the footer is a `grep -cE` count of bare `sock_token` (reproduced: 8),
not something the verifier ever computed.

The conclusion (the old gate passed vacuously) is right; the stated cause is false, is presented as a
session measurement, and sits in the section written to correct a previously-false statement about the
same tooling. A plan author who copies this will write regex-shaped `contains:` values that silently
never match — the failure that produced round 2's headline finding.

**Fix:** delete `:616`'s claim and restate the mechanism: the hand-rolled parser drops a value
containing an embedded escaped quote, so the key parses as `undefined` and `verify.cjs:314` skips the
test. Keep the corrected `:213-217` wording as the single description.

---

### CR-06 — BLOCKER — 01-27's round-2 line-range blocker was never revised

**File:** `.planning/phases/01-finish-the-floor/01-27-PLAN.md:124` vs `:273`

The entire round-3 diff on this plan is three `key_links` `from:`/`via:` edits and one `<verification>`
sentence. BL-27-2 is untouched.

`:124` — *"no task in this plan performs a line-range edit, and none may be introduced."*
`:273` — *"Rewrite the arm's doc block (`:341-357`)."*

And the range is invalidated **by the same task, before the executor reaches the sentence.** Verified
against live `src/main/breaker.ts`:

```
:317  private evaluate(
:341-357  the budget arm's doc block ("Placed after the (b) storm arms …")
:358  const budget = input.budget;
:359  if (budget && budget.cap > 0 && … BUDGET_STEER_FRACTION) {
```

Task 1's first instruction (`:248-251`) is *"In `evaluate()` … Declare a local — name it `softTrip` …
assign the band's result to it"*. Any declaration between `:317` and `:341` shifts `:341-357`. This is
the identical defect round 2 filed against 01-28 (BL-28-1), which 01-28 **did** fix in round 3 by
switching to structural delimiters and adding *"Do not use a line range"* in bold.

**Fix:** anchor on the comment's opening text — live `breaker.ts:341` is
`// Placed after the (b) storm arms and before the (a) floor-wide caps: a` — exactly as 01-28 now
anchors `queueOp`'s doc block on *"Fire-and-forget on purpose."*

---

### CR-07 — BLOCKER — 01-24's `truths` and `success_criteria` name two different sets of four win32 spellings; the `subst` alias has no acceptance path

**File:** `.planning/phases/01-finish-the-floor/01-24-PLAN.md:26` (truths), `:395-401` (behaviour group
B), `:817-818` (`<success_criteria>`)

`truths` (`:26`):
> *"A protected path spelled as a win32 **8.3 short name**, a **long-path-prefixed** path, a **device
> path** or a **`subst` drive alias** reaches the same deny branch … **All four are ALLOWED at HEAD**"*

`<success_criteria>` (`:817`):
> *"The four win32 aliasing spellings … — **8.3**, **long-path prefix**, **device path**, **local admin
> share** — are all DENIED"*

Behaviour group B drives 8.3, long-path, device, local admin share (`\\localhost\` and `127.0.0.1`),
plus two negative controls. **`subst` appears in no behaviour case, no `<done>` clause and no success
criterion**, and the admin share appears in no `truths` entry.

`must_haves.truths` is the acceptance contract. This one asserts a security property with nothing that
can fail if it is untrue. The plan's own measured table (`:307-317`) shows `subst` is ALLOWED at HEAD
and lands a real file in the real `bin/` — so it is a live bypass being closed on faith. It will
probably hold (`.native` resolves `X:\probe-subst` to the real path, reproduced this session), but the
plan is written so that an executor who ships only the four criteria-named spellings marks the truth
satisfied without ever driving it.

**Fix:** make the two sets identical — five spellings — and add the `subst` case to group B, gated the
same way as the rest (`{ skip: process.platform !== 'win32' && '<reason>' }`), with a stated ceiling if
`subst` cannot be created without elevation on the run host. Do not leave a `truths` entry with no
behaviour case.

---

## Warnings

### WR-01 — 01-27 still declares `contains_alt`, which `verify.cjs` never reads

**File:** `01-27-PLAN.md:39-42` — `src/main/delivery.ts` carries `contains: "queueReadError"` plus
`contains_alt`. Parsed this session: `extra=["contains_alt"]`. `verify.cjs:311-330` reads only
`min_lines`, `contains` and `exports`. 01-24 removed its two `contains_alt` entries in round 3 and says
so explicitly (*"a gate the pipeline never reads is not a gate"*); 01-27 kept its one. Harmless today
because the primary `contains` is functional, but it is a decorative gate in a plan set whose charter
is removing decorative gates. **Fix:** delete it, or list the artifact twice with the same `path` as
01-24 now does.

### WR-02 — 01-27's corrected baseline sentence leaves a dangling fragment

**File:** `01-27-PLAN.md:439` — *"…Compare a same-session before/after delta, never an absolute count.
**Unrelated to this plan —** report the delta against a baseline run captured on the SAME machine…"*
The `Unrelated to this plan —` clause is an orphan from the deleted *"known baseline of Windows-only
failures unrelated to this plan"* sentence. It now reads as though the delta report is unrelated to the
plan. **Fix:** delete the fragment.

### WR-03 — 01-27's `queueFile` removal gate is 0 at HEAD and still unlabelled

**File:** `01-27-PLAN.md:400`. Measured: `grep -c 'queueFile' test/delivery-main.test.cjs` → **0**. It
is a constraint on new code sitting unmarked in a list of three gates that do correctly fail. Round 2
filed this (WR-27-1); round 3 did not touch it. 01-29 (`:548`) and 01-30 label their equivalents.
**Fix:** append *"(0 at HEAD — a constraint on the new test, not evidence of work)"*.

### WR-04 — 01-24's capability-branch anchor moved further from live, under a header claiming it was re-derived

**File:** `01-24-PLAN.md:340-343` and `:781-783` — *"`:307-316` is a CAPABILITY branch
(`if (linked === true) … else`, the symlink hop)"*.

Live `test/net-binding.test.cjs`:
```
307:   let linked = null;
308:   try { fs.symlinkSync(path.join(root, 'bin'), hop, 'dir'); linked = true; }
309:   catch (e) { linked = e; }
310:   if (linked === true) {
...
316:   }
```
The `if (linked === true) … else` is `:310-316`. Revision 2 wrote `:311-316`; round 2 corrected it to
`:310-316`; revision 3 wrote `:307-316`. The `<interfaces>` header (`:196-198`) claims *"every anchor
revision 2 got wrong was RE-DERIVED AGAIN in revision 3 (round-2 lens A found three drifts; all three
are corrected below)"*. Two of three were; this one was changed to a different wrong value. Recoverable
(the branch is greppable and the conclusion — leave it alone — is right), but the header's claim is not
true. **Fix:** `:310-316`, or anchor on `if (linked === true)`.

### WR-05 — 01-24's cap-cost table: the `transcript.ts` row is off by one on both path-shaped columns

**File:** `01-24-PLAN.md:352-360`. Re-run with the plan's own split regex `[\s;&|<>()"']+` and its own
stated filter (contains `/` or `\`, or starts with `~`, `.`, or a drive letter):

| command | plan: words / distinct / path-shaped / distinct PS | measured |
|---|---|---|
| `cat > README.md <<'EOF'` | 2616 / 1297 / 102 / 67 | **2616 / 1297 / 102 / 67** ✓ |
| `cat > DESIGN.md <<'EOF'` | 3613 / 1840 / 83 / 30 | **3613 / 1840 / 83 / 30** ✓ |
| `git add <120 files>` | 122 / 122 / 120 / 120 | **122 / 122 / 120 / 120** ✓ |
| `cat > src/main/transcript.ts <<'EOF'` | 2209 / 807 / **97** / **33** | 2209 / 807 / **98** / **34** |

The word and distinct columns match exactly, so the tokenizer agrees; the extra path-shaped word is
`src/main/transcript.ts` from the command prefix the row's own label carries. The row is internally
inconsistent with its label. No conclusion changes (worst heredoc 67, worst real 120 both hold).
**Fix:** correct the row or drop the prefix from the label.

### WR-06 — 01-24 says `ensureAgent` stores `meta.cwd` "verbatim"; it stores the tilde-expanded value

**File:** `01-24-PLAN.md:284-287`. Live `src/main/hive.ts:907`:
`if (meta.cwd) meta = { ...meta, cwd: expandTilde(meta.cwd) };` before `cwdValidity` is computed. The
substance survives (`expandTilde` returns the input untouched when the result is still relative, so a
relative registry cwd does reach the registry), but "verbatim" is wrong and the plan uses that word to
justify the `isAbsolute()` filter. **Fix:** say "tilde-expanded but not made absolute".

### WR-07 — 01-25's "No line-range edits anywhere in this plan" is still broader than the plan delivers

**File:** `01-25-PLAN.md:107` and `:125` state it flatly; `:125` adds *"Every edit in this plan is now
anchored on quoted text."* Round 2's specific instance (`telemetry.ts:28-30`) **is** properly fixed —
task 1 now names the sentence to replace and the sentences to keep. But:

- `:470` — *"the house-shortcut comment at `:97-98` stays and gains one line"* — an edit to
  `test/runtime-forget.test.cjs`, a file this same task rewrites at `:99`, `:104`, `:108`, anchored on
  a line range and neither quoted nor symbol-named.
- `:509-511` — pty.ts insertion sites given as `:336-337`, `:393-396`, `:402-404` in a file task 2
  edits in three places; each edit shifts the next.

Live check: `:97-98` really is the two-line house-shortcut comment and it sits **above** the three
rewrites, so it is not self-invalidating — this is a claim-accuracy defect, not a correctness one.
**Fix:** anchor `:97-98` on its opening words (*"Age the dead one. Reaching into the private map"*) and
soften the blanket claim to match.

### WR-08 — 01-25 still cites `test/repo-claims.test.cjs:646-665`; 01-31 fixed the same anchor and 01-25 did not

**File:** `01-25-PLAN.md:774`. Live, the test opens at `:646` and closes at `:669`; `:665` is
`assert.ok(` mid-statement (`:660` closes the inner `for`, `:662-668` is the FullscreenTerminal arm).
01-31 corrected its half of this in round 3 (`:646-669`, verified). Round 2 filed both halves as
WR-31-2. **Fix:** `:646-669`, or cite the test title.

### WR-09 — 01-31 task 3 gives two contradictory instructions about titles, in one paragraph

**File:** `01-31-PLAN.md:439-451`.

`:441-442` — *"…pin the ceiling and, contrary to what round 1 asserts, name **no titles**."*
`:447` — *"**Enumerate every member by test title** — the four listed in this plan's `<interfaces>`
plus each new one."*

The first can be read as a description of `01-VALIDATION.md`'s current state, but it sits inside an
imperative sentence about what to edit, and the emphasis is on the instruction word. The `<done>` gate
(`grep -c "hook-auth-roundtrip" 01-VALIDATION.md` ≥ 1, 0 at HEAD) resolves it in favour of enumerating,
so it is recoverable — but the executor has to notice the gate to resolve the instruction.
**Fix:** split the description from the instruction.

### WR-10 — 01-31's "71 lines" control measures 72 and is self-referential

**File:** `01-31-PLAN.md:394`. Measured at HEAD:
`git grep -n "Enterprise Knowledge Graph" -- src resources docs test scripts e2e '*.md'` → **72**. The
number counts the plan's own text, so it drifts every time the plan is edited — and it already has. It
is explicitly labelled *"NOT a gate"*, so nothing depends on it. **Fix:** state it as "~70, and it
counts this plan's own text" rather than a fixed figure.

### WR-11 — 01-26 hands the `knowledgeLine` residual to a plan that does not carry it, on a stated rationale that does not hold

**File:** `01-26-PLAN.md:683-687` — *"Hand it to 01-31 with that grep anchor so its tree-wide pin does
not discover it late."*

`grep -n 'knowledgeLine\|Enterprise knowledge' 01-31-PLAN.md` → **no hits**. And 01-31's widened pin
searches for `Enterprise Knowledge Graph`; live `hive.ts:1462` reads *"Enterprise knowledge: this
organisation has a private Knowledge Graph of its own documents"* — which does not contain that phrase,
so the pin could never discover it, early or late. The hand-off therefore exists only as an
instruction to write a SUMMARY note, which 01-31's task-3 sweep may or may not pick up.

The sweep mechanism itself is sound (01-31 truth #5 derives the register from the seven SUMMARYs it
`@`-loads — verified, all seven are listed in `<context>`). This is a rationale defect, not an orphan:
the residual has a route, but not the one 01-26 names. **Fix:** state the real reason (the pin's phrase
does not match, so it needs an explicit register row) and name the file:symbol in 01-31's seed.

### WR-12 — 01-26's "14 regex-shaped literals per copy" is extractor-dependent and I measure 13

**File:** `01-26-PLAN.md:306`, `:461-462`. Task 1 step 4 makes it a hard assertion: *"the extracted
regex literal count equals the measured cardinality (14 per copy at HEAD)"*. Run against the live
slices with a standard JS regex-literal scanner (`/(?:\\.|\[(?:\\.|[^\]])*\]|[^/\\\n])+/[gimsuy]*`):
**13 in each copy**, not 14 — while the normalisation arm reproduces the plan's `959 / 959 / identical:
true` exactly. `redactSecrets` contains five `.replace()` regexes; neither 13 nor 14 is obviously the
"right" answer without the plan's extractor, which it does not supply.

The plan does say *"re-measure after task 2 and pin the new number"*, so this is self-correcting — but
an executor whose extractor returns 13 at HEAD will spend time reconciling against a figure that was
never reproducible. **Fix:** state the extractor with the number, or drop to "assert the count is
identical in both copies and non-zero", which is the property that matters.

### WR-13 — `revision:` metadata is wrong or absent on 7 of 8 plans, and only 01-24 documents round 3

Measured (`git log fd66993..HEAD -- <plan>`):

| plan | `revision:` field | actual revision commits | "What changed in revision 3" section |
|---|---|---|---|
| 01-24 | 3 | 3 | ✅ `:122` |
| 01-25 | **2** | 3 | ❌ (`:117` is labelled "revision 2") |
| 01-26 | **absent** | 3 | ❌ |
| 01-27 | **2** | 3 | ❌ (`:76` is "from revision 1") |
| 01-28 | **absent** | 3 | ❌ |
| 01-29 | **1** | 3 | ❌ |
| 01-30 | **absent** | 3 | ❌ |
| 01-31 | **absent** | 2 | ❌ |

01-29 in particular reads as a first-revision document while carrying round-2 corrections throughout.
The plans do address round-2 findings inline (01-26 `<measured_evidence>` E, 01-28's R-21 retraction,
01-30's gate footer, 01-31 `:393-399`), so the work is there — it is the metadata that lies about how
many times these documents have moved. In a phase whose criterion 1 is stale claims, that matters.
**Fix:** set `revision: 3` (01-31: 2) on all eight and add the missing narrative sections.

### WR-14 — 01-24's `conn.destroy(` and `agentForToken` gates are 0 at HEAD and one is unlabelled

**File:** `01-24-PLAN.md:695` and `:754`. Measured: both **0** at HEAD. `:754`
(`grep -c 'agentForToken'` is 0) carries its own explanation (*"this plan does not add it"*); `:695`
does not. Same class as WR-03. **Fix:** label `:695` as a regression guard.

### WR-15 — three `contains` gates remain single-token-presence surrogates

- `01-30-PLAN.md:44` `contains: "*.blockmap latest*.yml"` on `release.yml` — still satisfiable by a
  comment (round-2 WR-30-1 unaddressed), and additionally requires the two globs to be **adjacent and
  in that order** in the `ls` list, which nothing in task 3's action states. The parsed coverage pin in
  task 2 is the real control.
- `01-31-PLAN.md:45` `contains: "SECRET_SCAN_MAX_BYTES"` on `.planning/REQUIREMENTS.md` and `:47`
  `contains: "hook-auth-roundtrip"` on `01-VALIDATION.md` — satisfied by mentioning the token once
  anywhere (round-2 BL-31-2 partially unaddressed). Now that BL-31-1 is fixed the plan does have a
  working acceptance signal (`STALE_ANCHORS`, `shippedTextFiles`, the 1280 doc pin, all verifiably RED
  at HEAD), so this is a warning rather than the blocker round 2 filed.

**Fix:** where the artefact is prose, keep the gate but say in `<done>` which behavioural clause is the
real control, as 01-26 and 01-29 already do.

---

## Part 3 — What I checked and could NOT break

Recorded so the next round does not spend its budget here.

**All 46 `<done>` predicates, executed at HEAD, all correctly RED:**

```
01-24  vouchedBases( 0 · realpathSync.native 0 · expandTilde 0 · ../../bin 0 · node_modules 0
       registry: 0 · hive.ts:1072 1(must→0) · conn.on('timeout' 0 · maxConnections 0
       HOOK_LINE_MAX 0/0 · allowHalfOpen 0 · conn.destroy( 0 · agentForToken 0 · TAP 19/19/0/0
01-25  4 node -e predicates all exit 1 · setOtelTokenSource 0 · SPAWN_SAFE_SESSION_ID 0/0
       1280 DESIGN.md 2(must→0) · 960 DESIGN.md 0(must→2) · writeHead(401) noncomment 0
       collector.sessions → runtime-forget :99 :104 :108 exactly · ingestMetrics|ingestLogs src/ = 4
01-26  x-md-reply-token 0 · task_scheduler_interval_ms 0 · LOCKSTEP drift 0 · generation 2 (no file)
       proxyTokens.get(agentId) ===  0 · literal \bsk / \brk in hive.ts 0 · EKG in hive.ts 1(must→0)
01-27  softTrip 0 · softTrip =  0 · top spender 0 · queueReadError 0 · code !== 'ENOENT' 0 · EISDIR 0
01-28  await enqueueMessage 0 · queueError 0/0 · synthesized: true 0 · synthesized 0/0/0
       stopArmDecision 0 · e.synthesized 0 · effect #4 = 3 at :752 :873 :908 · persistQueues src/ = 1
01-29  3 node -e predicates all exit 1 · includes(flag) 1 · AGENT_PROVIDER_PRESETS 0
       MODEL_CHIP_MAX_W 0 · child_process|execFileSync|spawnSync 0 · DESIGN.md:678 in sidebarLayout 2
01-30  skip: 0/0 · skip: true 0 · stripLineComments 0 · sock_token["']? (grep -F) 0 · === 'npm test' 0
       hashedGlobs 0 · *.blockmap latest*.yml 0 · installers= 0 · pre-change releases 0
01-31  drainForStop() 0 · drainAtStop() 0 · appendCostLedger() 0 · stale anchors HIVE.md 4(must→0)
       index.ts:1524 1(must→0) · shippedTextFiles 0 · STALE_ANCHORS 0 · 1280 repo-claims 0
       SECRET_SCAN_MAX_BYTES 0 · 960 0 · SIDEBAR_COLLAPSE_WIDTH 0 · hook-auth-roundtrip 0
```

**Round-2 blockers confirmed CLOSED:** BL-25-2 (four NUL bytes gone; `\u0000` now spelled as the
six-character escape exactly as `hive.ts:2842` spells it, verified byte-for-byte). BL-25-3 (task 2's
predicate now strips comment lines, so the mandated explanation no longer fails its own gate).
BL-25-4 (the `telemetry.ts:28-30` range replaced by a sentence-scoped edit; live `:28-29` is the posture
claim and `:29-30` the two sentences the plan names as KEEP — both verified). BL-28-1/2 (both ranges
replaced with structural delimiters and an explicit *"Do not use a line range"*). BL-29-2 (the
`git show a217018:` dependency is gone; the `<done>` now asserts
`grep -cE "child_process|execFileSync|spawnSync"` → 0). BL-29-4 (**zero** `NN-PLAN.md:LINE` citations
remain in any of the eight plans). BL-31-1 (`':!.planning'` scoping — the gate now returns 11 lines
across 6 files at HEAD, exactly as the plan claims, and the post-state of 2 files is reachable).
BL-24-1 / BL-27-1 (both false Windows baselines replaced; measured 535/531/0/4 confirms the corrected
text). BL-30-1 (`sock_token[\"']?` gate replaced by `stripLineComments`, which parses cleanly and reads
0). BL-26-1 (`\\bsk` — the plan now *documents* that the harness compiles it to a literal
backslash+`bsk` and turns that into a design requirement on pattern 3; verified 0 at HEAD).
WR-26-1/2 (section C corrected and its column labelled — reproduces `0/0` at HEAD; the
`md-slack-reply.cjs:80` fixture now byte-exact at six leading spaces, no comma — verified). WR-29-1/2/3
(`sidebarLayout.ts:53`, `SidebarSplitter.tsx:27-34` and `:35-37`, and `--approve` correctly reattributed
to pi at `:472-473` inside `id: 'pi'` at `:463` — all four verified). WR-29-4 (task 3 now repoints
`sidebarLayout.ts`'s in-source citation). WR-30-2 (`{ skip: true }` now explicitly forbidden with a
`grep -Fc "skip: true"` = 0 gate and a both-polarity TAP requirement). WR-30-3 (01-30's expectation is
now explicitly subordinated to 01-31's measurement). WR-31-1 (`ThoughtBubble.ts:32` — verified,
`WRAP_WIDTH` is on `:32`). WR-31-2 (01-31's half).

**Anchors verified with zero drift** (every one opened this session):
`hooks.ts :66 :68 :69 :97 :126 :143 :245 :340 :350 :356 :395 :419 :427 :434 :435-436 :444 :445 :453-454
:465 :484 :531 :564 :565`; `hive.ts :216-221 :520 :825 :831 :901 :907-921 :1072 :1108 :1183 :1338 :1455
:1461-1462 :2035 :2842 :3652 :3665 :3669 :3670 :3722 :3730 :3734 :3735 :3759 :3798 :3861 :4103 :4113
:4117 :4118`, plus `redactSecrets` spanning `:391-418` exactly; `fs.ts :113 :142 :232`;
`net-binding.test.cjs :114 :120-152 :250 :278-279 :282-287 :306-316 :319 :322-325` and the `hive` stub
having no `registry` method (confirmed — and `hooks.ts:786`/`:823` already call `registry()` inside
try/catch, so the hazard the plan describes is real); `breaker.ts :112 :277 :317 :341-357 :358 :359`;
`delivery.ts :265 :274 :334 :342 :518 :522-525 :606 :657 :688-697 :742`;
`useHive.ts :733 :752 :755-764 :761 :873 :908`; `telemetry.ts :28-30 :275 :439 :442 :471 :473` and the
five `this.sessions` sites; `runtime-forget.test.cjs :97-98 :99 :104 :108`;
`AgentCard.tsx :124 :261 :303 :304-312 :307 :310 :313-318 :319-328 :347`;
`agentProvider.ts :289 :313 :417 :426-427 :463 :472-473`;
`sidebarLayout.ts :4 :21 :22 :25 :34 :37-44 :52 :53`; `SidebarSplitter.tsx :25 :27-34 :35-37`;
`repo-claims.test.cjs :214 :231 :233 :646-669`; `proc-kill.test.cjs :29-39` and
`require('node:test')` = 0; `win-cmd-shim.test.cjs :162 :167`; `md-slack-reply.cjs :80`;
`HIVE.md :90 :91 :95 :116 :138 :139 :250 :293 :295`; `SKILL.md:96`;
`floor-inspection.html:710`; `CONCERNS.md:46`; `DESIGN.md :169 :677 :678(blank) :686`;
`REQUIREMENTS.md :160 :563 :565 :569`; `01-VALIDATION.md :52-55`; `01-23-SUMMARY.md:181`.

**Cross-plan hazards checked and found sound:** wave ordering (1: 01-24/26/27 · 2: 01-25/28/30 ·
3: 01-29 · 4: 01-31); `hooks.ts` shared 01-24→01-25 with a `shares_files_with` split on both sides;
`delivery.ts` and `delivery-main.test.cjs` shared 01-27→01-28, declared; `hive.ts` owned solely by
01-26 with 01-24 and 01-31 both instructed to cite symbols rather than lines; 01-31's `depends_on`
lists all seven predecessors and its `<context>` `@`-loads all seven SUMMARYs, so 01-30's
`proc-kill`/`engine-parity` hand-off and 01-25's `recordSession` hand-off have a real receiver;
`DESIGN.md:678` is blank in both states so 01-25's in-place sentence edit cannot shift 01-29's
citation.

**01-28's R-21 retraction independently verified** — the strongest single correction in this round.
`useHive.ts:761`'s `blocked` guard really is inside the `onHiveDelivered` **subscriber**
(`:755-764`), and `DeliveryService.drainQueue`'s gate list at `delivery.ts:522-525` really is
`switching` / `vetoed` / `bootGrace` / `idleMs` with **no status check anywhere**. A stuck-`blocked`
agent does keep receiving mail; round 1's stated consequence was false and 01-28 now says so at the
right size.

---

## Per-plan verdicts

| plan | blockers | warnings | verdict |
|---|---|---|---|
| **01-24** | CR-01 (`maxConnections` is a silent destroy — **new in round 3**), CR-07 (truths ≠ criteria; `subst` untested) | WR-04, WR-05, WR-06, WR-14 | **NOT CLEAN** |
| **01-25** | — | WR-07, WR-08 | **CLEAN** (2 warnings) |
| **01-26** | CR-02 (regex capture group), CR-03 (wrong `from:` file) | WR-11, WR-12 | **NOT CLEAN** |
| **01-27** | CR-06 (round-2 BL-27-2 never revised) | WR-01, WR-02, WR-03 | **NOT CLEAN** |
| **01-28** | — | — | **CLEAN** — nothing found this round |
| **01-29** | — | — | **CLEAN** — nothing found this round |
| **01-30** | CR-04 (wrong `from:` file), CR-05 (false verifier semantics, self-contradicting) | WR-15 | **NOT CLEAN** |
| **01-31** | — | WR-09, WR-10, WR-15 | **CLEAN** (3 warnings) |
| **all** | — | WR-13 (revision metadata) | — |

# OVERALL: **NOT CLEAN**

**7 BLOCKER · 15 WARNING.**

Round 3 closed every round-2 blocker it aimed at — I verified all twenty, and the anchor discipline is
now genuinely good: 46 of 46 `<done>` predicates fail correctly at HEAD, 01-28 and 01-29 are clean end
to end, and 01-26's evidence tables reproduce to the character. What it did not do is check its own new
work with the same instrument it used on the old:

- The `key_links` `from:` fix was applied mechanically. Three of the eight plans now name a real file
  that does not and will not contain the pattern (CR-03, CR-04), or a pattern whose regex meaning
  differs from the fixed string it was validated as (CR-02). All three are red in both states — the
  same information-free gate round 2 filed as BL-A3, wearing a valid path.
- The one genuinely new *engineering* instruction in the round — 01-24's aggregate bound — reaches for
  a Node built-in whose documented and measured behaviour is precisely the silent close the same task
  spends four paragraphs forbidding (CR-01). It converts a resource-exhaustion DoS into a cheap,
  deliberate, floor-wide `allow`.
- 01-27 received a key_links touch-up and nothing else, so its round-2 blocker is still on the page
  (CR-06).
- And 01-30's correction footer states the opposite of the truth its own `<measured_evidence>` states
  twelve lines earlier (CR-05).

**Minimum to clear lens A:**
1. Delete `server.maxConnections` from 01-24 task 2; count connections in the handler so the deny can
   be written; repoint the artifact gate; keep the over-limit read assertion.
2. Reconcile 01-24's `truths` #4 with `<success_criteria>` and give the `subst` alias a behaviour case.
3. Escape `proxyTokens\.get\(agentId\)` in 01-26's key_link; repoint `LOCKSTEP drift` to
   `test/voice-messages.test.cjs`; repoint `hashedGlobs` to `test/ci-config.test.cjs`.
   Then re-run `verify key-links` on all eight and require a **content** failure per link — a link that
   is red at HEAD *and* red after a correct implementation is not a gate.
4. Replace 01-30's `:616` sentence with the measured mechanism (parser drops the key to `undefined`).
5. Anchor 01-27's `:341-357` on `// Placed after the (b) storm arms`, exactly as 01-28 now anchors
   `queueOp`'s doc block, and drop the "no line-range edit" absolute or make it true.
6. Set `revision: 3` on all eight and add the missing round-3 narrative sections.

---

_Reviewed: 2026-08-22 · HEAD `bd74777` · lens A (vacuity + anchors + newly-introduced defects)_
_Reviewer: gsd-code-reviewer, adversarial round 3_
_Every predicate, anchor, regex, parser call and evidence table above was executed against the live tree in this session. Nothing is inherited._
