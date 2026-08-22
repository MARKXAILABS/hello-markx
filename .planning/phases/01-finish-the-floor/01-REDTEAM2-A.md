---
phase: 01-finish-the-floor
round: 2
lens: A — anchor drift + vacuous verification
reviewed: 2026-08-22
head: 3051a47
branch: gsd/v1.0-milestone
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
  blocker: 20
  warning: 21
  total: 41
verdict: NOT CLEAN
---

# Red-team round 2, lens A — anchor drift + vacuous verification

**Head:** `3051a47`  ·  **Revisions under review:** `e513c83`, `97f6a82`, `197c291`, `02880cf`, `3051a47`
**Method:** every gate re-executed against the live tree; every `file:line` anchor opened; every
`<measured_evidence>` table re-run; the *actual GSD verifier* (`gsd-tools verify artifacts` /
`verify key-links`) run against all eight plans. Nothing below is inherited from a plan's own prose.

## Bottom line

The revisions did close most of round 1's *grep-level* vacuity. **57 of 58 frontmatter gates and every
`<done>` grep return 0 hits at HEAD when run as the plans write them**, and the anchor work in 01-26,
01-27, 01-28 and 01-30 is genuinely clean — `redactSecrets` now spans `391-418` in the plan exactly as
it does in the file, the `+3` drift is gone, and I could not break a single anchor in 01-30.

But the revisers measured their gates with `grep`. **The pipeline does not use `grep`.** Run through
the real verifier, the picture inverts:

```
$ node ~/.claude/get-shit-done/bin/gsd-tools.cjs verify artifacts 01-29-PLAN.md
{ "all_passed": true, "passed": 5, "total": 5 }        ← AT HEAD. ZERO WORK DONE.
```

01-29 is fully green on the shipped verifier before a byte is written. 01-25 is 4/5 and reaches 5/5 the
moment an empty `test/telemetry-auth.test.cjs` is touched. 01-30's single most-discussed gate — the one
its objective calls out as *"the worst"* of round 1 — now passes vacuously too. Round 1's finding was
not closed; it was moved somewhere the reviewers' `grep` could not see it.

Plus one anchor class the brief predicted and that landed: a cross-plan anchor drifted 156 lines during
the revision round itself, and 01-25 encodes its load-bearing separator in a byte that does not survive
being read.

**Verdict: NOT CLEAN.** 20 BLOCKER, 21 WARNING.

---

## Part 0 — Ground truth measured this session

| Fact | Measured at `3051a47` |
|---|---|
| `git diff --name-only a217018..HEAD -- . ':!.planning/'` | **empty** — no source changed since `a217018`, so every "measured at a217018" source claim is testable now |
| `npm run typecheck` | exit **0** |
| `npx eslint . --max-warnings 0` | exit **0** |
| `node --test --test-reporter=tap test/*.test.cjs` | **tests 535 · pass 531 · fail 0 · skipped 4** |
| `node --test test/net-binding.test.cjs` | tests 19 · pass 19 · fail 0 · skipped 0 — matches 01-24 |
| `node --test test/breaker.test.cjs` | tests 1 · pass 1 · fail 0 — matches 01-27 |
| `node --test test/delivery-main.test.cjs` | tests 28 · pass 28 · fail 0 — matches 01-27 |

**There are zero test failures on this host.** Two plans still say otherwise (BL-24-1, BL-27-1).

---

## Part 1 — SYSTEMIC BLOCKERS (the gates as the pipeline actually evaluates them)

The verifier is `~/.claude/get-shit-done/bin/lib/verify.cjs`, fed by
`lib/frontmatter.cjs:parseMustHavesBlock` — a **hand-rolled line parser, not a YAML parser**.

- `artifacts[].contains` → `fileContent.includes(value)` — a **fixed substring** test (`verify.cjs:314`).
- `key_links[].pattern` → `new RegExp(value)` — a **regex** test (`verify.cjs:359`).
- `key_links[].from` and `.to` → **treated as file paths**: `safeReadFile(path.join(cwd, link.from))`.
- `artifacts[].contains_alt` → **not read at all.** `verify.cjs` reads only `min_lines`, `contains`,
  `exports`.

### BL-A1 — BLOCKER — Eleven artifact gates are NO-OPs; the verifier parses them as `undefined`

A trailing `# …` comment on a value line, or an embedded escaped quote, makes the parser drop the value.
`verify.cjs:314` is `if (artifact.contains && …)` — an `undefined` value skips the check and the
artifact **passes**.

Parser output, dumped directly this session:

```
01-25  ART src/main/telemetry.ts                  contains=undefined
01-25  ART src/main/pty.ts                        contains=undefined
01-25  ART src/main/transcript.ts                 contains=undefined
01-25  ART DESIGN.md                              contains=undefined
01-25  ART test/telemetry-auth.test.cjs           contains=undefined
01-25  KL  pattern=undefined  (x3)
01-29  ART src/renderer/src/store/autoMode.ts     contains=undefined
01-29  ART .../components/AgentCard.tsx           contains=undefined
01-29  ART .../store/sidebarLayout.ts             contains=undefined
01-29  ART .../components/SidebarSplitter.tsx     contains=undefined
01-29  ART test/renderer-runstate.test.cjs        contains=undefined
01-29  KL  pattern=undefined  (x3)
01-30  ART test/hook-auth-roundtrip.test.cjs      contains=undefined
```

Cause in 01-25 / 01-29: every value carries `# HEAD a217018: grep -c → 0 (RED)` on the same line.
Cause in 01-30: `contains: "sock_token[\"']?"` — the escaped quote terminates the parser's scan.

Verifier verdicts at HEAD:

```
01-29:  all_passed: true   passed 5 / total 5      ← fully satisfied, zero work
01-25:  all_passed: false  passed 4 / total 5      ← only failure is a MISSING FILE
01-30:  test/hook-auth-roundtrip.test.cjs → passed: true
```

The 01-30 case is the sharpest. Its own objective:

> *"The worst was `contains: "sock_token"` on `test/hook-auth-roundtrip.test.cjs`: **8 hits at HEAD**,
> one of them `:193`'s `assert.match(body, /sock_token/)` — the exact vacuous pin this plan exists to
> delete satisfying this plan's own gate."*

Revision 2 replaced a gate that measured the wrong thing with a gate that measures **nothing**. That is
strictly worse: the old one at least executed.

**Fix:** move the `# …` annotations onto their own lines (or into `<measured_evidence>`), and quote
`sock_token` without an embedded `\"`. Then re-run `gsd-tools verify artifacts` on every plan and
require `all_passed: false` with a content issue — not a missing-file issue — for every artifact.

### BL-A2 — BLOCKER — Six gates are permanently unsatisfiable: YAML `\\` escapes survive literally

The parser does not process escapes. `contains: "\\.\\./\\.\\./bin"` is handed to `includes()` as the
literal 15 characters `\\.\\./\\.\\./bin`. Verifier output at HEAD:
`"Missing pattern: \\\\.\\\\./\\\\.\\\\./bin"`.

`key_links[].pattern` values go to `new RegExp()`, so `"vouchedBases\\("` compiles to
`/vouchedBases\\(/` — **a literal backslash followed by `(`**. Constructed and tested this session:

| plan | declared | compiled regex | matches real TS? |
|---|---|---|---|
| 01-24 | `vouchedBases\\(` | `/vouchedBases\\(/` | **never** |
| 01-24 | `conn\\.on\\('timeout'` | `/conn\\.on\\('timeout'/` | **never** |
| 01-24 | `agentForToken\\(` | `/agentForToken\\(/` | **never** |
| 01-26 | `\\bsk` | `/\bsk/` | **TRUE at HEAD** — see BL-26-1 |
| 01-28 | `e\\.synthesized` | `/e\\.synthesized/` | **never** |
| 01-24 | `contains: "\\.\\./\\.\\./bin"` | substring `\\.\\./\\.\\./bin` | **never** |

Plus 01-29's `contains: "Runs the CLI default model[\\s\\S]{0,400}?textOverflow"` — a regex handed to a
substring test. Currently masked by BL-A1; fix BL-A1 alone and this one surfaces as a permanent red.

### BL-A3 — BLOCKER — 18 of 22 `key_links` can never verify: `from:` is prose, the verifier wants a path

`verify.cjs` does `safeReadFile(path.join(cwd, link.from))`. A prose `from` returns null →
`detail: 'Source file not found'` → `verified: false`, forever, regardless of implementation.

| plan | `from:` values that are not files | of |
|---|---|---|
| 01-24 | `denyReason`, `the hook socket connection handler`, `HookServer.agentForToken` | 3/3 |
| 01-25 | `PtyManager.spawn`, `TelemetryCollector.handleRequest`, `index.ts's Claude AND generic resume branches` | 3/3 |
| 01-26 | `the sidecar exit handler in startProxyBridge`, `redactSecrets in src/main/hive.ts`, `pattern 3's sk/rk alternative` | 3/3 |
| 01-27 | `the budget soft band`, `loadQueue's failure branch` ×2 | 3/3 |
| 01-28 | `MessageQueueComposer.queueIt`, `useHive effect 2's Stop arm`, `MessageQueueComposer's statusHint` | 3/3 |
| 01-29 | `isAutoModeAgent's custom arm`, `SidebarSplitter's resize effect` | 2/3 |
| 01-30 | `release.yml Generate checksums` | 1/2 |
| 01-31 | — | 0/2 |

Every plan annotates these patterns `# HEAD a217018: 0 (RED)`, implying they turn green on completion.
They cannot. A gate that is red in both states carries no information and trains its reader to ignore
the whole block.

### BL-A4 — BLOCKER — `contains_alt` is never read

`verify.cjs` reads `min_lines`, `contains`, `exports`. 01-24 declares `contains_alt` twice
(`agentForToken`, `HOOK_LINE_MAX`) and 01-27 once (`ENOENT`). All three are decorative. The practical
effect: 01-24's `test/net-binding.test.cjs` artifact rests **entirely** on the unsatisfiable
`\\.\\./\\.\\./bin` (BL-A2), with the working fallback silently discarded.

---

## Part 2 — PER-PLAN FINDINGS

### 01-24 — hooks.ts perimeter · **NOT CLEAN**

**BL-24-1 — BLOCKER — the stale Windows-failure baseline survived the revision.**
`01-24-PLAN.md:500`:

> *"`npm test` run locally. **This machine has a known baseline of Windows-only failures unrelated to
> this plan** — report the delta against a baseline run captured on the SAME machine…"*

Measured at HEAD this session: `tests 535 · pass 531 · fail 0 · skipped 4`. There is no failure
baseline. The sentence hands the executor a licence to absorb any regression it causes as
"pre-existing Windows noise" — the exact laundering the phase was chartered to remove. Delete it and
require an absolute `fail 0`.

**BL-24-2 — BLOCKER — the `test/net-binding.test.cjs` artifact gate is unsatisfiable and its fallback is inert.**
See BL-A2 and BL-A4. The `<done>` clause `grep -cE '\.\./\.\./bin'` is correct and returns 0; the
frontmatter gate is a different, impossible string.

**BL-24-3 — BLOCKER — all three `key_links` patterns are unsatisfiable regexes on unresolvable sources.**
See BL-A2 and BL-A3.

**WR-24-1 — WARNING — `:444-451` is not the Bash arm.**
The header claims *"EVERY anchor below was re-derived by RUNNING grep/sed against the live tree at HEAD
a217018."* Live: `:444` is the `}` closing the `file_path`/`path`/`notebook_path` loop; the Bash arm
opens at `:445` and the two quoted statements (`expandHiveVars`, the word split) are at **`:453-454`**.
Off by up to 9. The quoted text is greppable so this is recoverable, but the "every anchor re-derived"
claim is not true.

**WR-24-2 — WARNING — the header's "no line-range edit" claim is overstated.**
`:125` says *"No task in this plan performs a line-range edit."* Task 1 then instructs
*"`:427-432`, THE CEILING … say so. Then ADD the residual."* It survives only because `THE CEILING` is
a greppable literal at `hooks.ts:427`; say so explicitly rather than denying the range exists.

**WR-24-3 — WARNING — `:311-316` is misdescribed.**
The plan calls `:282-287` and `:311-316` *"two in-test `if (win32) … else console.error(...)`
branches."* Live, the second (`:310-316`) is `if (linked === true) … else` — a **symlink-capability**
branch, not a platform branch. The conclusion (leave both) is right; the stated reason is not.

**WR-24-4 — WARNING — the `~/…` deny case ships with a built-in escape hatch.**
Task 1: *"Build the fixture by pointing the harness's registry cwd at a directory under `os.homedir()`
**only if one can be created and removed cleanly**; otherwise assert … with a `$HOME`-spelled Bash
command."* An executor can always take the second branch, leaving `expandTilde` — one of the two named
live bypasses — with no test at all, and the `<done>` clause `grep -c 'expandTilde' >= 2` is satisfied
by the import plus the call regardless.

**Verified correct (no drift found):** `hooks.ts :69 :97 :126 :143 :153 :245 :340 :350/351 :356 :395
:397 :412 :419 :427-432 :434-436 :465 :484 :485 :486 :510-515` — including the revision's own
correction of `:412`→`:397`, which is right. `hive.ts :216-221 :520 :825 :831 :908-921 :3652 :3665
:3669 :3670 :3730 :3734 :3735 :3759 :3798 :3861 :4113 :4117 :4118` — all six shims confirmed one
payload per connection, so the retraction in §4 of the objective is sound. `fs.ts :113 :142 :232`.
`net-binding :114 :120 :250 :279 :282-287 :319 :322-325`, and `grep -c registry` = **0**, confirming the
harness-stub hazard is real. TAP 19/19/0/0 exact. All eleven `<done>` greps fail correctly at HEAD.

---

### 01-25 — telemetry capability · **NOT CLEAN (worst of the eight)**

**BL-25-1 — BLOCKER — all five artifact gates parse as `undefined`; the verifier reports 4/5 passing at HEAD.**
See BL-A1. Creating an empty `test/telemetry-auth.test.cjs` takes this plan to `all_passed: true` with
no source change whatsoever. The three `key_links` patterns are `undefined` too, so key-link
verification degrades to `sourceContent.includes(link.to)` against prose `to:` values.

**BL-25-2 — BLOCKER — the `sessionKey` separator is transmitted as a raw NUL byte.**
`01-25-PLAN.md` contains **4 literal NUL (0x00) bytes**, at lines 177, 178, 376 and 405 — first at byte
offset 13409. They are the *entire specification* of the composite-key separator:

```
L177: `:2842` `const key = ` + backtick + `${row.agent_id ?? ''}<NUL>${row.session_id ?? ''}` + backtick
L178: → **`<NUL>` is the separator.** Use the same one so the two halves of the cost path agree.
L376: `${agentId}<NUL>${sessionId}` — the same separator `src/main/hive.ts:2842` already uses in
L405: … do not hardcode `'jim<NUL>old'`, or the …
```

Four independent failures, all reproduced this session:

1. **It does not survive being read.** Loading the plan through ordinary tooling renders the NUL as a
   **space** — I read `` `${agentId} ${sessionId}` `` and *"**` ` is the separator**"* before hex-dumping.
   An executor implements a space separator, which does **not** match `applyCostRow`, defeating the
   instruction's own stated purpose.
2. **`grep` now refuses to read the plan.** `grep -nE … 01-25-PLAN.md` → `Binary file … matches`. Any
   executor or reviewer grepping this plan gets no content. (Confirmed live in this session.)
3. **The quoted source is misquoted.** `hive.ts:2842` contains the six-character escape ` ` inside
   a template literal, not a raw NUL. An executor who copies the plan's byte writes a **raw NUL into
   `src/main/telemetry.ts`**, making that source file binary to git.
4. **If the byte is dropped in transit** — the most likely outcome — the result is
   `` `${agentId}${sessionId}` `` with no separator at all, so `sessionKey('a','bc') === sessionKey('ab','c')`.
   That is a cross-agent accumulator collision: precisely the vulnerability `T-P25-04` is written to close.

**Fix:** write the separator as the visible escape ` ` in the plan, exactly as `hive.ts` spells it,
and strip all four NUL bytes.

**BL-25-3 — BLOCKER — task 2's `<done>` predicate forbids what task 2's `<action>` mandates.**
The gate is

```js
!/OTEL_EXPORTER_OTLP_HEADERS[^_]/.test(s)      // s = the RAW file, no comment strip
```

while the action says *"**Do NOT set the generic `OTEL_EXPORTER_OTLP_HEADERS`.** Write the reasoning
into the comment, because it is the correction round 0 needed…"* A faithful implementation that
documents its reasoning names the string in a comment and **fails its own gate**. The tasks 1 and 3
predicates strip comment lines; this one does not. The cheapest way green is to delete the mandated
explanation. Either strip comments here too, or scope the negative to an assignment shape.

**BL-25-4 — BLOCKER — "No line-range edits anywhere in this plan" is false.**
`revision_note` row for `REDTEAM-1 BL-04` states it flatly. Task 1: *"**The header.** Replace
`telemetry.ts:28-30`."* Live, the posture claim is `:28-29`; **`:30` is a different and still-true
sentence** — *"deliberately free of any `electron` import so it can be smoke-tested as a plain Node
module"* — which the range edit deletes. Task 3 additionally keys both DESIGN.md edits to `:169`/`:677`.

**WR-25-1 — WARNING — task 1's predicate carries a clause that is green at HEAD and red on a correct fix.**
`(body.match(/this\.sessions/g)||[]).length === 5` measures **5 at HEAD** — it contributes nothing to the
RED, and it turns RED if the implementation adds a sixth reference (e.g. a helper). Label it a
regression guard the way 01-29 labels its equivalents, or drop it.

**WR-25-2 — WARNING — the exploit's provider list over-claims.**
Task 3: *"`args.push('--resume', '--dangerously-skip-permissions')` on grok/kimi/custom."* Live,
**kimi has neither `resumeFlag` nor `resumeSubcommand`** (`agentProvider.ts`, `id: 'kimi'` at `:282`),
so neither sink is reachable for it. grok (`:279`) and custom (`:518`) are correct.

**WR-25-3 — WARNING — `contains: "960"` on `DESIGN.md` is satisfied by any occurrence of `960` anywhere**
(including inside `19600`). The `<done>` pair `grep -c 1280 == 0` / `grep -c 960 == 2` is the real
control — verified reachable: DESIGN.md has exactly 2 `1280` lines, both the ones this plan edits.

**Verified correct:** `telemetry.ts :138 :178 :255 :273 :275 :314 :315 :330 :335 :336 :337 :350 :391
:438 :439 :442 :463 :471 :473` and the *five* `this.sessions` sites; `pty.ts :40 :336/337 :393 :401-405
:703 :734 :791`; `index.ts :218 :379 :543 :556 :1613 :1621 :2515 :2516 :2521 :2670/2671 :3256/3257
:3289/3290`; `transcript.ts :73 :77`; `DESIGN.md :169 :677` and `:678` blank; `REQUIREMENTS.md :160
:565 :569` (both quotations present); `accountPool.ts :10-12 :211 :214-215`; `hive.ts :1082-1095 :1084/1085
:1086/1087 :1143-1156`; `hooks.ts :395-412 :565`; `slack.ts :309-322`; `App.tsx :512-528`.
Call-site counts reproduce exactly: **26 / 4 / 2 = 32**, `collector.sessions` in exactly one test file at
`:99 :104 :108`, `ingestMetrics|ingestLogs` in `src/` = 4. The `SPAWN_SAFE_SESSION_ID` candidate table
reproduces **16/16 rows with zero mismatches** — including the round-0 correction that
`/^[A-Za-z0-9_-]{1,128}$/` returns `true` for `--dangerously-skip-permissions`.

---

### 01-26 — redactSecrets · **NOT CLEAN, but by far the cleanest anchor work**

**BL-26-1 — BLOCKER — `pattern: "\\bsk"` is GREEN at HEAD under the semantics the harness actually uses.**
`<measured_evidence>` E declares: *"Every `contains` and `pattern` in this revision is a **FIXED
STRING**, matched with `grep -F`. **No ERE interpretation is intended and none is needed.**"* The
harness does not honour that for `pattern:` — `verify.cjs:359` is `new RegExp(link.pattern)`. Measured
this session under the harness's reading:

```
/\bsk/  vs src/main/hive.ts              → 29 line-hits   TRUE at HEAD
/\bsk/  vs test/voice-messages.test.cjs  →  5 line-hits   TRUE at HEAD
```

This is the identical ERE-vs-fixed ambiguity 01-26 correctly diagnoses in round 1's `sk\[-_\]` gate
(*"additionally ambiguous between an ERE … and a fixed string"*), reproduced in its own frontmatter.
It is masked today only by BL-A3 (the prose `from:`), which is not a control.

**WR-26-1 — WARNING — `<measured_evidence>` section C's control does not reproduce, and the plan ships it into source.**
The block is headed *"Everything in this block was EXECUTED this session against HEAD a217018."* It
prints:

```
pattern-3 hits across the chunked key: 0
same key on ONE line:                  1
```

Re-run at HEAD: **chunked 0, one-line 0.** The live pattern 3 has no `sk_` alternative at all — only
`sk-` — so `sk_live_…` matches nothing in either arrangement and the "control" proves nothing about
chunking. The `1` is a *post-fix* number presented as a HEAD measurement. Task 2 then instructs writing
*"Measured: 0 hits chunked, 1 hit on one line"* into `scrubStagedSecrets`' shipped ceiling comment as
fact. Re-measure against the new pattern and label the column.

**WR-26-2 — WARNING — the flagship false-positive fixture does not match the real line.**
The plan's fixture is `  'x-md-reply-token': cfg.token,` (2 spaces, trailing comma). Live
`resources/md-slack-reply.cjs:80` is `      'x-md-reply-token': cfg.token` (6 spaces, no comma, CRLF
line ending). Both are returned unchanged today, so the test passes either way — but `<verification>`
asks the executor to *"Confirm … that `resources/md-slack-reply.cjs:80` … is returned unchanged by the
shipped `redactSecrets`, **by running it**"*, and the fixture is not that line.

**WR-26-3 — WARNING — three `contains` gates are satisfiable by inert text.**
`proxyTokens.get(agentId) === ` (substring) is satisfied by a **comment**. `x-md-reply-token` and
`task_scheduler_interval_ms` are satisfied by adding a string to a fixture array without ever asserting
on it. The `<action>` text requires `assert.strictEqual`; the gate cannot see that.

**Verified correct — zero drift, and this is the plan round 1 hurt worst:**
`redactSecrets` decl `:391`, PEM `:395`, JWT `:397`, prefix-battery call `:401-404` with the literal at
`:402`, bearer `:406`, key/value call `:413-416` with the literal at `:414` and the lambda at `:415`,
`return s;` at **`:417`**, closing `}` at `:418` — **exact match to the orchestrator's baseline.** The
`+3` drift that would have deleted `return s;` is genuinely gone.
`hive.ts :321 :326 :708 :719 :720 :722 :726-728 :729 :730 :732 :1292 :1293 :1336-1340 :1351 :1455 :1462
:3106-3113 :3123 :3166-3173 :3186 :3187 :3203 :3221 :3247`; `voice-messages :22 :45 :48 :49 :178-200
:202-208 :225-232 :233-237 :247` and `require('node:test')` = 0; `hive-durability :233 :241 :263-289
:305-340`; `pty.ts :401-405`; `kg-core.cjs :3-8`; `repo-claims :169-196`.
**All 13 rows of `<measured_evidence>` A reproduce exactly**, including the two shapes broken at HEAD
(`  token: string;` → `  token=[redacted]`; `let secret = process.env.FOO;` → `let secret=[redacted]`).
All four sensitivity fixtures are RED. The LOCKSTEP premise checks out: **14 regex-shaped literals in
each copy, byte-identical.** `Enterprise Knowledge Graph` in `hive.ts` = 1, as claimed.

---

### 01-27 — breaker band + queue loader · **NOT CLEAN**

**BL-27-1 — BLOCKER — the stale Windows-failure baseline, again.**
`01-27-PLAN.md:439` carries the same sentence as 01-24. Measured: `fail 0`. Same fix.

**BL-27-2 — BLOCKER — the plan forbids line-range edits and then issues one.**
`<interfaces>` `:124`: *"no task in this plan performs a line-range edit, and none may be introduced."*
Task 1 `:273`: *"**Rewrite the arm's doc block (`:341-357`)**."* Worse, task 1's own earlier instruction
inserts `softTrip` into `evaluate()` **above** that block, so `:341-357` has already shifted by the time
the executor reaches the sentence. Anchor it on the comment's opening text
(`// Placed after the (b) storm arms…`, live `:341`).

**BL-27-3 — BLOCKER — all three `key_links` are inert (BL-A3) and `contains_alt: ENOENT` is never read (BL-A4).**
`src/main/delivery.ts` therefore hangs on `queueReadError` alone.

**WR-27-1 — WARNING — an undifferentiated removal gate that already reads 0 at HEAD.**
`<done>`: *"`grep -c 'queueFile' test/delivery-main.test.cjs` is 0."* Measured **0 at HEAD** — the file
does not mention it because the test does not exist yet. It is a constraint on new code, not evidence
of work, and it sits in a list of four gates that *do* correctly fail. 01-29 labels its equivalents
*"regression guard, already true at HEAD"*; do the same here.

**WR-27-2 — WARNING — `contains: "softTrip"` is satisfiable by prose.**
`<done>` asks for `grep -c 'softTrip' >= 3`, which the rewritten doc block alone can supply. The plan
spots this for `softTrip = ` (*"a comment cannot satisfy it"*) but leaves the bare-name gate as the
frontmatter artifact.

**WR-27-3 — WARNING — `contains: "EISDIR"` on `test/delivery-main.test.cjs` is satisfiable by a comment.**
Nothing in the gate forces a test to drive the branch.

**Verified correct:** `breaker.ts :108 :112 :277 :279 :287 :317 :327 :331 :341-357 :358-365 :366
:367-371 :372-375 :376-379 :380-392 :393-407 :410`; `index.ts :1635` (the INPUT) and `:1639` (the
consumer) — the revision's correction over round 1 is right; `delivery.ts :239 :285 :301 :367-370 :371
:372 :373 :374 :376 :380 :381 :382 :395 :412 :433 :477`. TAP baselines exact (breaker 1/1,
delivery-main 28/28). The `EISDIR`/`ENOENT` probe reproduces on this host (win32, node v24.13.0). All
seven `<done>` greps return 0.

---

### 01-28 — composer + Stop arm + roster · **NOT CLEAN**

**BL-28-1 — BLOCKER — task 3 deletes a line range that task 1 has already moved.**
Task 3: *"Then **DELETE `persistQueues` (`:529-544`)** and its doc block."* `:529-544` is accurate at
HEAD (`:529` opens the doc block, `:535` is the declaration, `:544` is the closing `}`). But task 1 of
**this same plan** inserts above it: `queueError` on the state interface (near `:241`/`:283`/`:291`), a
`setQueueError` action, a rewritten doc block at `:513-520`, a rewritten `queueOp` at `:521-527`, and a
widened `enqueueMessage` signature at `:283`. By the time task 3 runs, `:529-544` names live code. This
is a self-inflicted version of the exact defect round 1 was rejected for. Anchor on
`function persistQueues(` and its preceding `/**`.

**BL-28-2 — BLOCKER — same hazard in task 1.**
*"Rewrite the doc block at `:513-520`"* — the `:283` type widening is above it, so ordering inside the
task decides whether the range is right. Anchor on the block's opening text.

**BL-28-3 — BLOCKER — `key_links` pattern `e\\.synthesized` is an unsatisfiable regex (BL-A2), on a prose `from:` (BL-A3).**

**WR-28-1 — WARNING — the coordination note and the plan body disagree.**
`<coordination>`: *"**Re-derive both line numbers after 01-27 lands** — 01-27 inserts above them."*
Correct (01-27's `loadQueue` edits at `:371-384` are above `quiesce`'s emit at `:671`). The plan then
hard-codes `:671`, `:639`, `:437-445` and `:518` throughout its `<action>` and `<done>` prose anyway.

**WR-28-2 — WARNING — `contains: "synthesized"` on `src/preload/index.ts` is satisfied by half the change.**
The action asks to widen *"both the callback signature and the listener's."* Widening either one alone
satisfies the gate, and there is no behavioural test on the preload boundary.

**WR-28-3 — WARNING — `contains: "renderToStaticMarkup"` gates a file the same task creates.**
A bare `require` line satisfies it; the composer need never be rendered. (Same class:
01-26's `generation 2`, 01-25's `x-hive-otel-token`.) The behaviour list is the real control.

**Verified correct — this plan's anchor work is excellent:** `delivery.ts :60-65 :262 :436 :437 :441
:444 :446 :518 :604 :639 :671`; `hooks.ts :841-850` — the payload really is byte-equivalent
(`tool`/`notificationType`/`source`/`message` all `undefined` for a bare Stop), so the "renderer
provably cannot tell them apart" premise holds; `store.ts :241 :283 :291-294 :320 :366-378 :513-520
:521-527 :529 :535 :544 :600 :790-792 :821-823 :871-875`; `useHive.ts :114 :323 :495 :526-535 :533 :668
:672 :752 :761 :766 :783 :873 :895 :908 :914 :972 :1033` — **all seven `enqueueMessage` call sites
confirmed at the stated lines**, and the round-1 correction of `:891`→`:895` is right;
`preload/index.ts :887-891`; `MessageQueueComposer.tsx :37-39 :137-149 :146 :151 :168 :222-233`;
`renderer-components.test.cjs :96-122 :113 :155-161 :274`; `pty-sanitize.test.cjs :11-19`;
`index.ts :491 :533-536 :3821 :4044`; `roster.ts :38`; `queueDelivery.ts :73`; `usePtyParser.ts :31-37`.
`grep -rn persistQueues src/` returns **exactly one line** as claimed. `grep -c 'effect #4'` = **3**.
And the claim-shaped comment regex, run as real JS, matches **exactly 2** — *"effect #4 above then
drains it to his PTY"* and *"effect #4 types it into the REPL"* — precisely as documented.

---

### 01-29 — AUTO chip + model chip + window pin · **NOT CLEAN (most blockers)**

**BL-29-1 — BLOCKER — `gsd-tools verify artifacts` returns `all_passed: true, 5/5` at HEAD.**
All five `contains` values are voided by their trailing `# HEAD a217018: grep -c → 0 (RED)` comments
(BL-A1). The plan's entire frontmatter gate set is satisfied before a byte is written. Its own
`revision_note` calls out four separate round-0 gates for being green at HEAD; revision 1 made every
one of its replacements green at HEAD by a different mechanism.

**BL-29-2 — BLOCKER — the permanent `git show a217018:…` test case will fail in CI.**
Task 3 mandates a *permanent* test in `test/renderer-runstate.test.cjs`:

```js
execFileSync('git', ['show', 'a217018:src/main/index.ts'])
```

- All three `actions/checkout@v4` steps in `.github/workflows/ci.yml` (`:22`, `:79`, `:121`) set **no
  `fetch-depth`**, so CI clones at depth 1. Object `a217018` will not exist. `execFileSync` throws.
- The test job runs `npm test` (`ci.yml:114-115`) → `node --test test/*.test.cjs` on ubuntu, windows and
  macOS. The new case reddens the **hard gate** on all three.
- `git branch --contains a217018` → `gsd/v1.0-milestone` only. A squash-merge to `main` orphans the
  commit; it is then GC-able and the test breaks permanently with a message about the sidebar.

The plan states the brittleness ceiling for a `MIN_WIN` rename (R-29) but never costs the SHA
dependency. Either capture the 1280 source text as an inline fixture string, or gate the case on
`git cat-file -e a217018^{commit}` and skip with a reason when the object is absent.

**BL-29-3 — BLOCKER — `contains: "Runs the CLI default model[\\s\\S]{0,400}?textOverflow"` is a regex in a substring slot.**
Unsatisfiable by any real TSX once BL-A1 is fixed (BL-A2). Move it to `key_links.pattern` with a real
file `from:`, or keep it only as the `node -e` predicate (which is correct and exits 1 at HEAD).

**BL-29-4 — BLOCKER — the cross-plan anchor `01-30-PLAN.md:218` drifted during the revision round.**
Cited **twice** (`01-29-PLAN.md:83` and `:420`) as the source of the *"mutate the parsed step's `run` …
in memory"* idiom that task 3 is told to *"copy it exactly."* Live `01-30-PLAN.md:218` is a bare
` ``` ` code fence opening the win32-sweep table. The quoted sentence lives at **`01-30-PLAN.md:374`** —
156 lines away. Cause: 01-29 was revised in `197c291`, 01-30 in `02880cf`, which is later. This is the
exact drift class the round-2 brief predicted for anchors into plan files. Cite the sentence, not the
line.

**WR-29-1 — WARNING — `sidebarLayout.ts:52` is off by one.**
Plan: *"`:52` the docked branch is `vpWidth >= SIDEBAR_COLLAPSE_WIDTH`."* Live `:52` is
`): SidebarLayout {`; the branch is `:53`.

**WR-29-2 — WARNING — `SidebarSplitter.tsx:34-36` is off by one at both ends, and the sibling anchor is spelled two ways.**
Live the resize effect is `:35-37`; `:34` is the last line of the preceding comment. The same comment
block is cited `:27-34` at plan `:195` and `:27-33` at `:204` and `:451`; live it is `:27-34`, so the
`:27-33` spelling truncates it.

**WR-29-3 — WARNING — `--approve` is attributed to the wrong provider.**
`<accepted_consequences>`: *"`--approve` is Crush's (`:472`)."* Live, `agentProvider.ts:472-473` sits
inside the **pi** preset (`id: 'pi'` at `:463`). Crush (`id` at `:417`) carries `--yolo` at `:426-427`.
Line number right, provider wrong.

**WR-29-4 — WARNING — task 3 manufactures a fresh stale anchor in a file it owns.**
Editing `SidebarSplitter.tsx` (new import + rewritten effect) invalidates the in-source citation
`SidebarSplitter.tsx:27-34` at `sidebarLayout.ts:42`. `sidebarLayout.ts` is in this plan's
`files_modified` and the task lists two other citation fixes in that file — but not this one. In the
phase whose criterion 1 is about stale anchors, that is a self-inflicted regression.

**WR-29-5 — WARNING — `contains: "minWinWidth"` is satisfied by a helper that is never called.**

**Verified correct — the measured tables are genuinely solid:**
The 12-row `isAutoModeAgent` table reproduces **exactly**, every HEAD column included, loaded through
`test/load-ts.cjs`. The all-preset regression guard reproduces: **11 presets, 0 `autoFlag`/`autoModeFlag`
mismatches**. The clampMax/`splitterReachableMax` table reproduces on all five viewports
(1024→664/976, 1100→740/1052, 1279→919/1231, 1280→920/1232, 1920→1200/1872). The `DESIGN.md` extractor
dry-run reproduces **exactly `[[169,1280,800],[677,1280,800]]`**, and `git show a217018:src/main/index.ts`
does return `MIN_WIN = 1280 × 800`. Anchors verified: `autoMode.ts :35 :42 :50-57 :66-69`;
`agentProvider.ts :183 :190/193 :225/226 :267/268 :289/290 :305/308 :313 :326/329 :356/357 :426/427
:472/473 :509/510 :531/533 :624`; `AgentCard.tsx :110-124 :261 :303 :319-328 :347`;
`FullscreenTerminal.tsx :743-747`; `renderer-runstate.test.cjs :138 :183`; `renderer-components.test.cjs
:274`; `DESIGN.md :677` and `:678` blank; `store.ts :871-875`; `App.tsx :568-572`; `ci-config.test.cjs
:44-46`; `index.ts :2516 :2670`. All six `node -e` predicates exit 1 at HEAD.

---

### 01-30 — verification-surface honesty · **NOT CLEAN (but the strongest evidence base)**

**BL-30-1 — BLOCKER — the headline gate now measures nothing.**
`contains: "sock_token[\"']?"` on `test/hook-auth-roundtrip.test.cjs` parses to `undefined` (the
embedded `\"` terminates the parser's scan), so `gsd-tools verify artifacts` reports that artifact
**`passed: true` at HEAD**. The plan's objective is built on this gate:

> *"The worst was `contains: "sock_token"` … **8 hits at HEAD**, one of them `:193`'s
> `assert.match(body, /sock_token/)` — the exact vacuous pin this plan exists to delete satisfying this
> plan's own gate. … **Every gate in this revision was run this session and every one returns 0.**"*

It returns 0 to `grep -F`. It returns *nothing at all* to the verifier. Requote without `\"` — e.g.
`contains: 'sock_token["'']?'` or a token that needs no quote at all.

**WR-30-1 — WARNING — `contains: "*.blockmap latest*.yml"` is satisfied by a comment.**
It is a fixed substring on `release.yml`, and task 3's own `<action>` instructs *replacing the comment*
with prose about `latest*.yml`. A comment reading `# also hash *.blockmap latest*.yml` turns the gate
green with the `ls` list untouched. The parsed coverage pin in task 2 is the real control; the
frontmatter gate can be satisfied by the wrong artefact.

**WR-30-2 — WARNING — `contains: "skip:"` cannot distinguish a conditional skip from an unconditional one.**
`{ skip: true }` on `test/win-cmd-shim.test.cjs` satisfies the gate, satisfies "the runner counts it,"
and **deletes the POSIX coverage entirely** — converting a false pass into a real non-run on every
platform. 01-24 task 3 carries the matching negative control (*"on POSIX the watchdog case still RUNS
and still asserts — the skip must be conditional on the platform, never unconditional"*). 01-30 task 1
has no such control for either conversion. Add it.

**WR-30-3 — WARNING — the skip arithmetic contradicts 01-31's instruction.**
`<verification>` asserts *"`# skipped` +1 on win32 … plus **+1 from plan 01-24 already landed in wave 1**,
taking the frozen baseline of 4 to **6**."* 01-30 is wave 2, so this is only true if 01-24 landed and
landed as designed. 01-31 is separately told *"**Do not hardcode the new count** … Round 1 wrote 'the
honest count is 6' … derive the number from the TAP counter."* Two plans, two instructions, one number.

**WR-30-4 — WARNING — `key_link` `from: "release.yml Generate checksums"` is prose (BL-A3).**

**Verified correct — I could not break a single anchor in this plan:**
`shimTemplates()` finds **6** shims (`HOOK_SHIM`, `AGY_HOOK_SHIM`, `PI_EXTENSION`, `OPENCODE_PLUGIN`,
`PROXY_BRIDGE_SHIM`, `GROK_HOOK_SHIM`) and all six `sock_token` assignment lines are exactly where the
plan says (`hive.ts:3635, 3705, 3758, 3797, 3859, 4085`), in the two shapes described.
`grep -c "://"` over `hive.ts:3621-4110` → **0**, and 0 inside the six bodies — the comment-strip safety
argument holds. All five round-1 gate counts reproduce exactly (`sock_token` 8, `npm test` 7,
`latest*.yml` 4, `attestation` 2, `SHA256SUMS` 7). The parsed checksum-coverage pin reproduces
**identically**: `hashed=4`, `uploaded=7`, `cd dist` present, and
`MISSING FROM HASHED SET: ["*.blockmap","latest*.yml"]`.
Anchors: `release.yml :12-13 :143-155 :146 :147 :148 :149 :157-172 :197-202 :219-222`;
`ci.yml :114-115`; `win-cmd-shim :162 :167`; `transcript-project-dir :117 :122`; `proc-kill :29-39`;
the four `{ skip: !POSIX }` sites (`hive-hook-node:153`, `hive-runtime-path:83`,
`hook-auth-roundtrip:95` and `:128`); `hook-auth-roundtrip :163-173 :177-182 :193-203`;
`ci-config :46 :47 :159 :161-199 :314-334`; `SECURITY.md :114 :117-120 :125`;
`engine-parity :288-330`; `repo-claims :169-196 :173`; `electron-builder.yml :9-12`;
`README.md :174-180`; `RELEASE.md :42-48 :43-44`. Eight of eight `<done>` greps return 0.

---

### 01-31 — doc residuals · **NOT CLEAN**

**BL-31-1 — BLOCKER — task 2's `<done>` gate is unsatisfiable, and its stated HEAD count is wrong by 61.**
The clause:

> *"`git grep -n "Enterprise Knowledge Graph" -- src resources docs test scripts e2e '*.md'` returns
> **only** `docs/floor-inspection.html:710` and the three self-references inside
> `test/repo-claims.test.cjs`. **It returned nine such lines at HEAD.**"*

Run at HEAD: **70 lines.** Git's `*.md` pathspec matches at any depth, so the command sweeps all of
`.planning/`:

```
.planning/REQUIREMENTS.md:563          .planning/ROADMAP.md:164
.planning/STATE.md:162, :326           .planning/codebase/CONCERNS.md:46
01-10-PLAN.md      x8                  01-10-SUMMARY.md   x11
01-23-SUMMARY.md   x4                  deferred-items.md  x2
01-26-PLAN.md      x6                  01-31-PLAN.md      x3
01-REDTEAM-1/-2/-5, 01-CONTEXT, 01-DISCUSSION-LOG, 01-PATTERNS, 01-RESEARCH,
01-REVIEW-c-tests, 01-VERIFICATION …
```

Satisfying it would require editing historical records **this same plan forbids touching** —
`01-23-SUMMARY.md` is explicitly *"in no plan's `files_modified` and will keep its `# skipped 4` figure
permanently as a historical record"* — and the plan's own text. This is the identical defect 01-31
diagnoses in round 1 (*"which excludes `test/`, which is why its `<done>` gate was unsatisfiable"*),
re-created with a different pathspec. Scope it with `:!.planning` or use the `shippedTextFiles`
corpus the plan already prototyped.

**BL-31-2 — BLOCKER — both `key_links` and all five `contains` gates are `grep`-shaped surrogates for work the plan itself calls unverifiable.**
`contains: "SECRET_SCAN_MAX_BYTES"` on `.planning/REQUIREMENTS.md`, `"hook-auth-roundtrip"` on
`01-VALIDATION.md`, and `pattern: 1280` on `test/repo-claims.test.cjs` are all satisfied by mentioning
the token once, anywhere. For a plan whose entire deliverable is *"every restated row was checked at
source with its output pasted"*, the gate set measures string presence and nothing else. Combined with
BL-31-1 (the only non-trivial gate being unsatisfiable), this plan has no working acceptance signal.

**WR-31-1 — WARNING — `ThoughtBubble.ts:31` is off by one.**
Residual register item 1: *"`ThoughtBubble.ts:31 WRAP_WIDTH = MAX_WIDTH / RENDER_SCALE - PADDING_X * 2`."*
Live `:31` is a comment tail; `WRAP_WIDTH` is `:32`. (`PADDING_X = 6` is `:15`, `CORNER_RADIUS = 5` is
`:17`; no lines given.) The `<interfaces>` header claims *"Every command below was RUN in this session
at HEAD a217018 and its output is pasted."*

**WR-31-2 — WARNING — the FLOOR-12 pin's extent is wrong, in two plans, two different ways.**
01-31 says `test/repo-claims.test.cjs:646-660`; `:660` is the `}` closing the inner `for` and the test
runs to `:669`. 01-25 says `:646-665`; `:665` is mid-assertion.

**WR-31-3 — WARNING — `01-VALIDATION.md:60-83` starts on a blank line.**

**WR-31-4 — WARNING — the `1280` doc pin depends on 01-25, which is where the NUL blocker lives.**
The plan handles the hand-off correctly (*"if 01-25 misses it, this plan's pin is RED"*). Flagged only
so the dependency is visible alongside BL-25-2.

**Verified correct — and the thirteen-anchor table is the best piece of work in the set:**
Every one of the 13 rows reproduces, including all six "stale" verdicts and all seven "correct" ones:
`HIVE.md:90`→`hooks.ts:663` ✓, `:91`→`delivery.ts:604` ✓ and `index.ts:545` ✓, `:95`→`hooks.ts:646` ✓,
`:116`/`:138`→`hive.ts:1338` **stale** ✓, `:139`/`:250`→`hooks.ts:662` **stale** ✓,
`:250`→`delivery.ts:262` **stale** ✓, `:293`→`hooks.ts:646` ✓, `:295`→`hive.ts:1375` ✓,
`ADR-0001:20`→`delivery.ts:518` ✓, `ADR-0005:52`→`index.ts:1524` **stale** ✓. Targets located: `hive.ts
drainForStop()` at `:1365`, `index.ts appendCostLedger()` at `:1613`.
The `shippedTextFiles` prototype reproduces **exactly**: `corpus size = 312`, the same six EKG hits,
`SKILL.md`/`README.md`/`DESIGN.md` all in corpus, `md/html slice = 43`, and the 1280 doc scan returning
exactly `["DESIGN.md"]`. `repo-claims.test.cjs:231` really does say *"eleven fails here"* against a
12-element array asserted as `12` at `:233`. `hive.ts:1366` is `const dir = this.agentDir(agentId);`.
`index.ts:5792` is `app.on('window-all-closed', …)`. `01-VALIDATION.md:52-55` and `01-23-SUMMARY.md:181`
confirmed, as are all four `{ skip: }` titles.

---

## Part 3 — Gate execution log (all 58 frontmatter gates, run at HEAD)

Every gate returns **0 hits** as the plans write them. Full run in the appendix table below; the
exceptions that matter are the *semantic* ones already filed as BL-A1/A2/A3.

| plan | gates | 0-at-HEAD by `grep` | verdict from the real verifier |
|---|---|---|---|
| 01-24 | 7 | 7/7 | `passed 0/2` — but one gate unsatisfiable, `contains_alt` inert |
| 01-25 | 9 | 8/8 (+1 missing file) | **`passed 4/5` — gates voided** |
| 01-26 | 7 | 6/6 (+1 missing file) | `passed 0/4` — `\bsk` regex TRUE at HEAD |
| 01-27 | 8 | 8/8 | `passed 0/4` |
| 01-28 | 9 | 8/8 (+1 missing file) | `passed 0/7` |
| 01-29 | 6 | 6/6 | **`all_passed: TRUE — 5/5`** |
| 01-30 | 7 | 7/7 | **`passed 1/6` — the flagship gate voided** |
| 01-31 | 7 | 7/7 | `passed 0/5` |

`<done>` clause greps: 46 executed, all correct at HEAD, with these exceptions —
01-24's `hive.ts:1072` removal gate correctly reads **1**; 01-26's `Enterprise Knowledge Graph` removal
gate correctly reads **1**; 01-28's `effect #4` reads **3** and its claim-regex reads **2**, both as
claimed; 01-31's stale-anchor removal gates read **4** and **1**, both as claimed; 01-27's
`grep -c queueFile test/delivery-main.test.cjs` reads **0** (WR-27-1); 01-31's EKG git-grep reads
**70**, not nine (BL-31-1).

## Part 4 — Cheapest wrong implementation per surviving gate

| gate | cheapest thing that satisfies it | real control? |
|---|---|---|
| 01-24 `HOOK_LINE_MAX` | a declared-and-never-referenced constant | yes — the over-cap DENY test |
| 01-24 `grep -cE 'registry:' >= 1` | `registry:` in any unrelated object literal | partly |
| 01-24 `~/…` deny case | claim the `os.homedir()` fixture "could not be created cleanly" and ship only the `$HOME` variant, leaving `expandTilde` undriven | **no** (WR-24-4) |
| 01-26 `proxyTokens.get(agentId) === ` | put the string in a **comment** | yes — the two-generation test |
| 01-26 `x-md-reply-token`, `task_scheduler_interval_ms` | add the string to a fixture array, never assert on it | yes — `assert.strictEqual` in `<action>` |
| 01-26 `generation 2` | write the words in a test title | yes |
| 01-27 `softTrip` (≥3) | three mentions in the rewritten doc block | partly — `softTrip = ` is assignment-shaped |
| 01-27 `EISDIR` | a comment naming the code | yes — the on-disk-bytes assertion |
| 01-28 `synthesized` (preload) | widen the callback signature only, leave the listener | **no** |
| 01-28 `renderToStaticMarkup` | a bare `require` line | yes — the markup assertions |
| 01-29 `minWinWidth` | a helper defined and never called | yes — the three pin clauses |
| 01-30 `skip:` | `{ skip: true }` — unconditional, deleting POSIX coverage | **no** (WR-30-2) |
| 01-30 `*.blockmap latest*.yml` | a comment mentioning both globs | yes — the parsed coverage pin |
| 01-31 `SECRET_SCAN_MAX_BYTES`, `hook-auth-roundtrip`, `1280` | mention the token once, anywhere | **no** (BL-31-2) |
| 01-25 `960` (DESIGN.md) | any `960` anywhere, incl. inside `19600` | yes — the `1280 == 0` pair |
| 01-25 / 01-26 / 01-28 new-file gates | write the string the task told you to write | yes — the behaviour lists |

---

## Verdicts

| plan | anchors | vacuity | verdict |
|---|---|---|---|
| **01-24** | 3 WARNING drifts; the "every anchor re-derived" and "no line-range edit" claims are both overstated | 1 BLOCKER (stale failure baseline) + 2 systemic | **NOT CLEAN** |
| **01-25** | clean on `file:line`; **NUL-byte separator is unreadable** | 3 BLOCKER incl. gates voided + a self-contradicting predicate | **NOT CLEAN — worst of the eight** |
| **01-26** | **CLEAN** — `391-418` exact, `+3` drift gone, zero drift found anywhere | 1 BLOCKER (`\bsk` regex TRUE at HEAD) + a non-reproducing control | **NOT CLEAN** (narrowly) |
| **01-27** | clean | 2 BLOCKER (stale baseline; range edit against its own prohibition) | **NOT CLEAN** |
| **01-28** | **CLEAN** — every one of ~40 anchors verified | 2 BLOCKER (self-shifting range deletes) | **NOT CLEAN** |
| **01-29** | 1 BLOCKER cross-plan drift + 3 WARNING off-by-ones + a self-made stale anchor | 2 BLOCKER (fully green at HEAD; CI-breaking permanent test) | **NOT CLEAN — most blockers** |
| **01-30** | **CLEAN** — not one anchor drifted, evidence reproduces exactly | 1 BLOCKER (flagship gate voided) | **NOT CLEAN** |
| **01-31** | 3 WARNING off-by-ones; the 13-anchor table itself is exact | 2 BLOCKER (unsatisfiable gate; no working acceptance signal) | **NOT CLEAN** |

# OVERALL: **NOT CLEAN**

**20 BLOCKER · 21 WARNING.**

Round 1's `grep`-level vacuity is largely closed and the anchor discipline is genuinely better —
01-26, 01-28 and 01-30 are near-perfect on anchors and I could not break them. What survived is one
level down: **the revisers validated their gates with the wrong tool.** Four systemic defects
(BL-A1–A4) mean the shipped verifier reports 01-29 as fully satisfied at HEAD, 01-25 as one empty file
away from it, and 01-30's most-discussed gate as not evaluated at all. Add one cross-plan anchor that
drifted *during this revision round* (BL-29-4), one separator encoded in a byte that does not survive
being read (BL-25-2), one permanent test that will redden CI on all three platforms (BL-29-2), one
unsatisfiable doc gate (BL-31-1), two self-shifting range deletes (BL-28-1/2), and the stale
"Windows-only failures" claim in two plans against a measured `fail 0` (BL-24-1, BL-27-1).

**Minimum to clear lens A:**
1. Move every `# …` annotation off the value line; requote `sock_token` without `\"`. Re-run
   `gsd-tools verify artifacts` on all eight and require a **content** failure per artifact.
2. Un-double every `\\` in `contains`/`pattern`; drop `contains_alt` or stop relying on it.
3. Point every `key_links.from` at a real file path, or delete the block.
4. Strip the four NUL bytes from `01-25-PLAN.md`; write ` ` as `hive.ts` spells it.
5. Delete the "known baseline of Windows-only failures" sentence from 01-24 and 01-27.
6. Replace `01-30-PLAN.md:218` with the quoted sentence; replace `:341-357`, `:513-520`, `:529-544`
   and `telemetry.ts:28-30` with structural delimiters.
7. Re-scope 01-31's EKG gate with `:!.planning`; drop the `a217018` SHA dependency from 01-29's
   permanent test.

---

_Reviewed: 2026-08-22 · HEAD `3051a47` · lens A (anchor drift + vacuous verification)_
_Reviewer: gsd-code-reviewer, adversarial round 2_
_Every gate, anchor and evidence table above was executed against the live tree in this session._
