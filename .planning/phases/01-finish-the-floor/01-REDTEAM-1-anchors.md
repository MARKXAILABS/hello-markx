---
redteam_lens: 1
lens_name: source-anchor-drift
target: .planning/phases/01-finish-the-floor/01-24-PLAN.md … 01-31-PLAN.md
verified_at_head: fd66993 (worktree clean except .planning/intel/*)
branch: gsd/v1.0-milestone
method: every path:line and every grep/pattern in frontmatter + <interfaces> + task bodies opened at live source
anchors_checked: 214
findings:
  blocker: 9
  warning: 14
  info: 11
  total: 34
verdict: NOT SAFE TO EXECUTE AS WRITTEN — 01-26 and 01-28 must be corrected first
---

# Red-team lens 1 — source-anchor drift

**Question asked:** does every `file:line` anchor in plans 01-24 … 01-31 still point at what the plan
says it does, in live source right now?

**Answer:** mostly yes — and the exceptions are concentrated exactly where they do the most damage.
Every one of the eight plans carries the header *"Re-derived at HEAD 47a48cd on 2026-08-22"*. That
claim is **true for roughly 85% of the anchors and false for the rest**, including three range-edit
anchors in 01-26 that would corrupt working code, one insertion anchor in 01-25 that lands one line
early, one fabricated harness claim in 01-28, and two `<done>` criteria (01-28, 01-31) that are
**logically impossible to satisfy**.

The strongest plan is **01-30** (every one of its ~25 anchors is exact, including all six shim
`sock_token` line numbers in an 852→4085-line file). The weakest are **01-26** (the whole
`redactSecrets` block is shifted +3 and two of its three edit ranges destroy adjacent code) and
**01-28** (a call-site count off by 4, a fabricated test harness, and an unsatisfiable done-gate).

---

## BLOCKERS

### BL-01 — 01-26 task 1: the pattern-3 edit range swallows the bearer rule

**Plan:** `01-26-PLAN.md`, task 1 — *"Edit `src/main/hive.ts:402-407` (pattern 3)"*
**Anchor as written:** `src/main/hive.ts:402-407` = pattern 3, the prefix battery
**What is actually there:**

| line | live content |
|---|---|
| 401 | `s = s.replace(` ← pattern 3 call opens |
| 402 | the prefix-battery regex |
| 403 | `'[redacted]'` |
| 404 | `);` ← pattern 3 call closes |
| 405 | `// 4. Bearer tokens — keep the label, drop the credential.` |
| **406** | **`s = s.replace(/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]');`** ← **pattern 4** |
| 407 | `// 5. Sensitive key = value / key: value — …` |

**Correct range:** `398-404` (comment + call) or `401-404` (call only).
An executor that does a range replace over `402-407` **deletes the bearer-token rule**. The existing
test `test/voice-messages.test.cjs:218-222` (`redact: bearer keeps the label, drops the credential`)
would go red — so it is caught — but a "green after fixing the test" recovery is exactly the failure
mode the global mandate forbids. Fix the anchor, not the test.

---

### BL-02 — 01-26 task 1: the pattern-5 edit range deletes `return s;`

**Plan:** `01-26-PLAN.md`, task 1 — *"Edit `src/main/hive.ts:410-417` (pattern 5)"*, and
*"Re-read the replacement at `:417` after editing and confirm it still emits `key=[redacted]`."*
**What is actually there:**

| line | live content |
|---|---|
| 410-412 | tail of pattern 5's explanatory comment |
| 413 | `s = s.replace(` ← pattern 5 call opens |
| **414** | the key/value regex the plan quotes |
| **415** | `(_m, k) => \`${k}=[redacted]\`` ← **the replacement, not `:417`** |
| 416 | `);` |
| **417** | **`return s;`** ← the function's only return |

**Correct range:** `407-416`. **Correct replacement line:** `415`.
A range replace over `410-417` removes `return s;` from `redactSecrets`, which then returns
`undefined` on every call. `scrubStagedSecrets` at `hive.ts:3230` tests
`redactSecrets(all) === all` → `undefined === all` → false → the scrub path takes the *dirty* branch
on every commit; `redactSecrets` is also the mail path (`hive.ts:2254-2255`), which would start
writing `undefined` into every message subject and body. This is FLOOR-04's single matcher; breaking
it silently is a data-loss and secret-leak class defect.

---

### BL-03 — 01-26 task 1: the LOCKSTEP mirror range does not contain the pattern it must mirror

**Plan:** `01-26-PLAN.md`, task 1 — *"Mirror BOTH edits character-identically into
`test/voice-messages.test.cjs:21-40`"*; `<interfaces>` — *"`:21-40` the mirrored `redactSecrets` body."*
**What is actually there:** the mirror runs **`:21-49`**:

```
21: // ── redactSecrets — MIRROR of src/main/hive.ts redactSecrets() ───────────────
22: function redactSecrets(text) {
...
32-35: pattern 3 (regex on :33)
37:     pattern 4 (bearer)
38-43:  pattern 5 comment
44:     s = s.replace(
45:       <the pattern-5 regex>          ← OUTSIDE the plan's stated range
46:       (_m, k) => `${k}=[redacted]`
47:     );
48:   return s;
49: }
```

The stated range **ends at line 40, mid-comment**, and does not contain the pattern-5 regex the task
requires be mirrored character-identically. The LOCKSTEP contract at `hive.ts:386-390` is the thing
this plan calls *"load-bearing"* — an executor working the stated range mirrors pattern 3 and silently
does not mirror pattern 5, producing the exact silent divergence between the mail scrub and the commit
scrub that the plan's own threat register calls T-P26-03.

---

### BL-04 — 01-25 task 3: the resume-guard insertion point is one line early (TDZ)

**Plan:** `01-25-PLAN.md`, task 3 — *"Import it in `src/main/index.ts` and refuse at the SINK,
immediately after `const sid = ...` (`:3289`), so BOTH the `resumeFlag` branch (`:3290-3293`) and the
`resumeSubcommand` branch (`:3294+`) are covered by one guard."*
**What is actually there:**

```
3289: const typedSid = typeof opts.resumeSessionId === 'string' ? opts.resumeSessionId.trim() : '';
3290: const sid = typedSid || (opts.resume === true ? hive.lastSession(opts.hive.id) : undefined);
3291: if (sid && rf) {
3292:   const args = opts.args ?? [];
3293:   if (!args.includes(rf)) { args.push(rf, sid); opts.args = args; didResume = true; }
3294: } else if (sid && rsub) {
```

Inserting "immediately after `:3289`" puts the `VALID_SESSION_ID` guard **between `typedSid` and
`sid`**, referencing `sid` in its temporal dead zone. TypeScript catches it, so this costs a build
cycle rather than shipping — but the anchor is wrong and the branch range is wrong too
(`resumeFlag` is `:3291-3294`, not `:3290-3293`). **Correct insertion point: after `:3290`.**
The same `<interfaces>` block quotes `:3289-3293` with `const sid` as its first line, so the error is
consistent and an executor has nothing in the plan to catch it against.

---

### BL-05 — 01-25 task 3 creates a false doc claim in DESIGN.md that no plan owns

**Plan:** `01-25-PLAN.md`, task 3 — *"`sidebarLayout()` … collapses the sidebar below 1024 precisely
so a narrow window works, **`DESIGN.md:678` promises it**"*, then lowers `MIN_WIN.width` 1280 → 960.
**What is actually there:** `DESIGN.md:678` is **blank**. The sentence is at **`DESIGN.md:677`**, and
it reads in full:

> `Min window: 1280 × 800. Right panel collapses below 1024 to bottom drawer.`

The same line the plan cites as the authority for the collapse **also documents the 1280 minimum the
plan deletes**. `DESIGN.md` appears in **no plan's `files_modified`** across 01-24 … 01-31. After
01-25 task 3 lands, `DESIGN.md:677` states a window minimum the app no longer has — a doc promising
behaviour the code does not implement, which is precisely ROADMAP criterion 1 (*"grep finds no doc
promising a code path that does not run"*) and the residual 01-31 exists to close. 01-31's anchor
sweep is explicitly scoped to `HIVE.md` and `docs/adr/*.md` and will not see it.

Two live source sites carry the same off-by-one and are likewise uncorrected:
`src/renderer/src/store/sidebarLayout.ts:21` and `test/renderer-runstate.test.cjs:183` both cite
`DESIGN.md:678`.

**Required:** add `DESIGN.md` to 01-25 (or 01-31) `files_modified` and correct line 677 in the same
commit that changes `MIN_WIN`.

---

### BL-06 — 01-28: `enqueueMessage` has SEVEN call sites, not three; the two named are wrong

**Plan:** `01-28-PLAN.md`, task 1 — *"Check every other caller of `enqueueMessage` before changing the
type. `useHive.ts:891` (Slack ingress) and `useHive.ts:~915` (the non-Claude enqueue) both call it"*;
`<verification>` — *"the widened `enqueueMessage` signature crosses **three** call sites."*
**What is actually there** (`grep -n "enqueueMessage"`):

| site | live line | what the plan says |
|---|---|---|
| `useHive.ts` | **668** | not mentioned |
| `useHive.ts` | **672** | not mentioned |
| `useHive.ts` | **895** | plan says `:891` — off by 4 |
| `useHive.ts` | **914** | plan says `~915` — ok |
| `useHive.ts` | **972** | not mentioned |
| `useHive.ts` | **1033** | not mentioned |
| `MessageQueueComposer.tsx` | **146** | the site being changed |

Seven, not three. Four are unnamed. All seven are inside `files_modified`, so `npm run typecheck`
will surface them — but the plan's own verification tells the executor the work is done at three, and
an executor reconciling against that number stops early. The store's own tombstone at
`useHive.ts:782-783` names **five producers** (composer, Slack ingress, context triggers, terminal
work orders, voice bridge), which is itself evidence the plan's count was never derived.

---

### BL-07 — 01-28 task 1 cites a test harness that does not exist anywhere in the repo

**Plan:** `01-28-PLAN.md`, `<interfaces>` — *"store.ts loads under `node --test` through
`test/load-ts.cjs` with a `window` stub (`localStorage` + `cth`) installed on `global` before the load
— **VERIFIED by probe at 47a48cd** … `test/renderer-runstate.test.cjs` is the harness idiom to copy."*
Task 1 — *"following `test/renderer-runstate.test.cjs`'s `loadTs` idiom with a `global.window` stub
carrying `localStorage` and a scriptable `cth.hiveQueue`."*

**Measured, live:**

```
$ grep -rn "global.window\|globalThis.window\|global\.localStorage" test/
(no matches — zero window stubs anywhere in test/)

$ grep -n "window" test/renderer-runstate.test.cjs
203, 209, 214, 220, 228   ← all five are prose in comments

$ grep -rn "store/store" test/
test/renderer-components.test.cjs:113:  ({ useStore } = loadTs('src/renderer/src/store/store.ts'));
```

`test/renderer-runstate.test.cjs` **never loads `store.ts`** and **contains no window stub**. The only
file that loads `store.ts` is `test/renderer-components.test.cjs`, and its harness is a different
idiom entirely — a `Module._load` interceptor for `@/`-aliased and `.css` requests plus a
`globalThis.self = globalThis` shim, both restored in a `finally` (`:96-122`). The plan names none of
that.

The label **"VERIFIED by probe at 47a48cd"** on a harness that does not exist is a fabricated
verification claim inside the phase chartered to remove fabricated verification claims.

---

### BL-08 — 01-28 task 2: the `<done>` criterion is logically unsatisfiable

**Plan:** `01-28-PLAN.md`, task 2 `<done>` — *"`grep -n "effect #4" src/renderer/src/hooks/useHive.ts`
returns **only the tombstone at `:766`** and any comment that explicitly describes it as deleted."*
**What is actually there:**

```
$ grep -n "effect #4" src/renderer/src/hooks/useHive.ts
752:  //         cooldown so effect #4 does not type on top of it. (#4's idle gate
873:  //    into the composer — effect #4 above then drains it to his PTY.
908:  //     task text here so effect #4 types it into the REPL when the agent idles.
```

Line **766 does not contain the string `effect #4`** — the tombstone reads
`// 4) THE QUEUE AND ITS DRAIN ARE MAIN'S NOW (#5 / FLOOR-02).` The three matches are exactly the
three comments the task asks to be corrected. After the fix the grep returns **zero** lines, which is
not "only the tombstone at `:766`". The gate can never report success as written; the executor must
either fail it or reinterpret it, and this phase's review already found three cases of source pins
reported as passing tests.

---

### BL-09 — 01-31 task 2: the `<done>` grep is logically unsatisfiable

**Plan:** `01-31-PLAN.md`, task 2 `<done>` — *"`grep -rn "Enterprise Knowledge Graph" .
--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.planning` returns **only**
`docs/floor-inspection.html:710`."*
**Run verbatim, live (after mentally applying all six renames):**

```
./docs/floor-inspection.html:710      ← the intended survivor
./test/repo-claims.test.cjs:28        ← file header naming the finding
./test/repo-claims.test.cjs:338       ← the TEST TITLE
./test/repo-claims.test.cjs:346       ← the assertion's failure message
```

`test/repo-claims.test.cjs` is the very file task 2 widens into a tree-wide pin. It must contain the
literal string in order to search for it. **The criterion is impossible.**

Root cause: the plan's `<interfaces>` derives its "seven sites" from
`grep -rn "Enterprise Knowledge Graph" src resources docs README.md` — a corpus that **excludes
`test/`**, hiding the three occurrences that make the done-gate unachievable. (It also excludes them
from the widened pin's own exclusion list, so the new tree-wide scan will flag its own source file.)

Restate the criterion as: only `docs/floor-inspection.html:710` and `test/repo-claims.test.cjs`
(self-reference), with both excluded by explicit path in the widened pin.

---

## WARNINGS

### WR-01 — 01-24: `denyReason`'s "FIRST statement" is not the statement named
`<interfaces>` `:484` — *"its FIRST statement is `const t = realResolve(target);`. This is the defect
site."* Live: `:484` is the signature ✓, but `:485` is `const hiveRoot = realResolve(root);` and
`const t = realResolve(target);` is **`:486`**. Task 1 says "Before the existing body runs" so the
executor lands correctly by reading, but the characterisation is false and the defect site is `:486`.

### WR-02 — 01-24: two token-registry anchors off by one / off by 15
- `<interfaces>` `:351 revokeToken(token: string): void` → live `:350` is the declaration; `:351` is
  `this.tokens.delete(token);`.
- Task 3 — *"the same `this.tokens` registry `authorized()` reads at `:412`"* → live `:412` is the
  closing `}` of `authorized`; `this.tokens.get(provided)` is at **`:397`**.

### WR-03 — 01-24 task 1: the `<done>` grep passes before any work is done
*"`grep -n "payload\.cwd\|p\.cwd" src/main/hooks.ts` returns either nothing or only the deliberate
comment."* Live: **0 matches today**. The gate is satisfied on the untouched tree and cannot
distinguish "deleted the field", "annotated the field", or "did nothing". The field it is meant to
police is `cwd?: string;` at `:97`, which matches neither alternative in the pattern.
(By contrast 01-24 task 2's `setTimeout` gate is sound — live count in `hooks.ts` is 0.)

### WR-04 — 01-25: `index.ts:1622` is off by one, cited twice
*"`:1622` `if (sample?.sessionId) hive.recordSession(id, sample.sessionId);` — a SECOND producer of the
registry resume key"*, repeated in task 3 as *"the OTel sample (`index.ts:1622`)"*. Live: that
statement is **`:1621`**; `:1622` is `if (id === reg.godId) continue;`.

### WR-05 — 01-25: `hive.ts:2840` is a parameter type, not the composite-key convention
*"`src/main/hive.ts:2840`'s `costCumulative` already uses a composite `agentId\0sessionId` key"*, cited
in `<interfaces>` and again in task 1. Live `:2840` is the `row:` parameter type annotation. The key is
at **`:2842`** (`const key = \`${row.agent_id ?? ''} ${row.session_id ?? ''}\``) and
`costCumulative` is declared at **`:2833`**. The plan tells the executor to match a convention at a
line where the convention is not visible. Same anchor is reused as the FLOOR-04/FLOOR-13 evidence in
01-31 task 3.

### WR-06 — 01-25: "the four `this.sessions` access sites" is five line numbers
*"The four `this.sessions` access sites are exactly `:275`, `:439`, `:442`, `:471`, `:473`."* Five
numbers, labelled four. `grep -n "this\.sessions" src/main/telemetry.ts` confirms **five** sites at
exactly those lines. A key composition change that misses one leaves `forget()` or `aggregateLive()`
reading a stale-shaped key and silently orphaning accumulators.

### WR-07 — 01-25: the `TelemetryCollectorOptions` edit anchor starts inside the body
*"Add `resolveAgentForToken?: …` to `TelemetryCollectorOptions` (`src/main/telemetry.ts:140-154`)"* —
live the `export interface TelemetryCollectorOptions {` line is **`:138`**; `:140` is the first field.
Harmless in practice (the insertion is inside the body either way) but the range does not delimit the
declaration it names.

### WR-08 — 01-26: the whole `redactSecrets` pattern index is shifted +3
Beyond BL-01/BL-02, three more `<interfaces>` anchors are wrong by the same offset:

| plan says | live |
|---|---|
| `:398` pattern 1 — PEM blocks | PEM `replace` is **`:395`**; `:398` is pattern 3's comment |
| `:400` pattern 2 — JWTs | JWT `replace` is **`:397`**; `:400` is pattern 3's comment |
| `:409` pattern 4 — bearer | bearer `replace` is **`:406`**; `:409` is pattern 5's comment |

A consistent +3 offset across five anchors is the signature of a block re-derived from a stale copy,
not from live source — despite the *"Re-derived at HEAD 47a48cd on 2026-08-22"* header.

### WR-09 — 01-26: `SECRETS` starts at `:178`, not `:190`
`<interfaces>` — *"`:190-200` `SECRETS` — the positive fixtures."* Live `const SECRETS = [` is at
**`:178`**; `:190-200` is the tail (rows 12-16). Task 1's "add the two new shapes to that file's
`SECRETS` list" still lands inside the array, so this is navigational rather than destructive.

### WR-10 — 01-26: the RED-first claim for `sk_live_` may not be red
Task 1 requires *"the two new fixtures must fail before the regex edit"*. `test/voice-messages.test.cjs:191`
**already** carries `['api_key assignment', 'config api_key=sk_live_th_isIsASecretValue123 stored',
'sk_live_th_isIsASecretValue123']` and it passes today — via **pattern 5** (`api_key=`), not pattern 3.
Only a **bare** `sk_live_…` with no labelled key is genuinely RED. An executor who writes the new
fixture in the shape already present will produce no RED output and will have to invent one.

### WR-11 — 01-26 / 01-31: the FLOOR-04 size escapes are cited at their use sites, not their declarations
*"the two size escapes at `src/main/hive.ts:3196-3226` (`SECRET_SCAN_MAX_LINES`,
`SECRET_SCAN_MAX_BYTES`)"* — repeated verbatim in 01-31 task 3's FLOOR-04 restatement. Live the
constants are declared at **`:321`** and **`:326`**; `:3196` is a closing `}` and `:3226` is blank.
The usages are at `:3203/:3204` and `:3221/:3223`. A requirements row citing `3196-3226` as the
definition site is a row the next phase cannot navigate.

### WR-12 — 01-27: two key-link / artifact contracts are unverifiable or self-contradictory
- `key_links[0].pattern: "soft"` → **0 matches** in `src/main/breaker.ts` today. A key-link pattern
  that matches nothing anywhere cannot be verified as a link.
- `artifacts[test/delivery-main.test.cjs].contains: "queueFile"` → 0 matches today, and satisfying it
  pushes the test toward inspecting a **private field** (`delivery.ts:285 private queueFile`) — which
  task 2's own behaviour list forbids: *"An assertion on the in-memory queue would pass today and prove
  nothing; the defect is what reaches disk."* The artifact contract and the task instruction disagree.

### WR-13 — 01-27: `index.ts:1635` is the breaker's INPUT, not its level consumer
Task 1 — *"the level is what `index.ts:1635` consumes."* Live `:1635` is
`budget: hive.budgetForAgent(id) ?? undefined,` — an element of the `inputs` array being *built*. The
level is consumed at **`:1639-1640`** (`for (const d of breaker.tick(inputs, now)) … d.state`). Also
`:283-301` is cited as "the ladder step" but `const ceiling: BreakerLevel = …` is at **`:287`**;
`:283` is the `);` closing the `evaluate(...)` call. Also `:433-482 enqueue` spans two methods —
`removeQueued` starts at **`:477`**.

### WR-14 — 01-28: "Main's four reachable refusals" is five, and the range excludes two of them
`<interfaces>` — *"Main's four reachable refusals, verified at `src/main/delivery.ts:437-445`"*, then
lists `invalid agentId · unknown agent · no harness home · queue full`. Live `enqueue` has **five**
`{ok:false}` returns:

```
436: invalid agentId          ← BEFORE the stated range
437: empty message            ← unlisted by the plan
441: unknown agent: <id>
444: no harness home — …
446: queue full for <id> (…)  ← AFTER the stated range
```

Both the first and the last refusal fall outside `:437-445`. Task 1's UI work ("render the refusal
reason") is built on this enumeration. Related INFO: the behaviour example uses
`'queue full for x (25)'`; the real cap is `MAX_QUEUED_PER_AGENT = 200`
(`src/shared/queueDelivery.ts:73`).

---

## INFO

### IN-01 — 01-29: `AgentCard.tsx:243-252` is not `infoLine`
*"`:243-252` `infoLine` — the flexible item (`flex: 1, minWidth: 0`) this chip competes with."*
Live `:243-249` is the sprite-portrait tile and `:251` the flex-column wrapper. `infoLine` is computed
at **`:151`** and rendered at **`:304-312`**, with `flex: 1, minWidth: 0` at **`:307`**. Prose only —
task 2 edits `:319-328`, which is correct.

### IN-02 — 01-29: the account chip's `maxWidth: 76` is at `:347`, not `:348`
Cited twice (`<interfaces>` and task 2's card arithmetic). Live `:347` is
`flexShrink: 0, maxWidth: 76,`; `:348` is the `fontSize`/`lineHeight`/`padding` line.

### IN-03 — 01-29: the model-chip range starts in its comment
`<interfaces>` `:314-328`; live the JSX is `:319-328` and `:313-318` is the FLOOR-13 comment. Task 2
uses `:319-328` correctly, so no risk.

### IN-04 — 01-29: the sidebarLayout test range under-runs and under-lists
`:187-230` — four tests ✓, but the last closes at **`:231`**, and `:224` also drives widths
`1400 / 600` which the plan's width list omits.

### IN-05 — 01-30: the `latest*.yml` `<done>` gate already passes
Task 3 `<done>` — *"`grep -c "latest\*\.yml" .github/workflows/release.yml` is at least 2 (hash +
upload)."* Live count **today is 4** (`:161` comment, `:170` upload, `:200` find, `:245` release
assets). The gate cannot detect whether the hashing step was widened. Use
`grep -n 'latest\*\.yml' … | grep -c 'Generate checksums'`-adjacent evidence, or assert on the parsed
`ls` line.

### IN-06 — 01-30: a third win32 non-run exists and is neither named nor converted
`must_haves.truths[0]` — *"Every win32 non-run in the suite is counted as a skip."*
`test/proc-kill.test.cjs:29-39` is a **module-level** guard:
`if (process.platform === 'win32') { assert…; console.log('  ok  (win32: smoke import only…)');
process.exit(0); }`. On Windows the file's real tests are never registered and the file reports green
off two `typeof` assertions. It is not a "bare `return` inside a test callback" — so the plan's
narrower claim ("the second and last instance of *that shape*") survives, and the source comment at
`:30-34` is honest about it — but the `truths` line as written is not met by this plan.
Sweep result for the record: `grep -rn "platform === 'win32'" test/*.test.cjs` → 11 hits; exactly two
are bare-return-in-callback (`net-binding.test.cjs:322`, `win-cmd-shim.test.cjs:167`); one is
module-level-exit (`proc-kill.test.cjs:29`); the other eight are path/harness helpers.

### IN-07 — 01-30 / 01-31: `01-VALIDATION.md` does not name the four skips
Both plans assert *"`01-VALIDATION.md` … pins `# skipped 4` and **names all four by title** so they
cannot grow unnoticed"* (01-30 `:314`, 01-31 `:135` and `:252`). Live `01-VALIDATION.md` pins
`# skipped 4` at **`:52-53`** and names **no titles**. The named list is in
**`01-23-SUMMARY.md:181`** — which is in **no plan's `files_modified`**, so the list 01-31 task 3
means to update will stay at four regardless. (For the record the four live `{ skip: !POSIX }` cases
are `hive-hook-node.test.cjs:153`, `hive-runtime-path.test.cjs:83`, `hook-auth-roundtrip.test.cjs:95`
and `:128` — **not** "hive-hook-node's two" as `01-REVIEW-c-tests.md:94` states.)

### IN-08 — 01-31 blesses four anchors that its own upstream plans will break
`<interfaces>` — *"`HIVE.md:90-91` and `:295` were already corrected and are fine."* Verified: they
**are** exact at HEAD (`hooks.ts:663` = `const drain = this.drainAtStop?.(agentId);` ✓,
`delivery.ts:604` = `drainAtStop` ✓, `index.ts:545` = `(agentId) => delivery.drainAtStop(agentId)` ✓,
`hive.ts:1375` = `cursor.lastProcessed = fresh[fresh.length - 1].id;` ✓).

But 01-31 runs in **wave 4**, after: 01-24 inserts into `hooks.ts` above `:663`, 01-25 inserts into
`index.ts` above `:545`, and 01-26 inserts into `hive.ts` at `:1336-1339`, above `:1375`. All four
anchors will be stale on arrival. Task 1's sweep instruction
(`grep -noE '(hooks|delivery|index|hive|pty|breaker|telemetry)\.ts:[0-9]+' HIVE.md docs/adr/*.md` and
check every hit) would catch them — but the `<interfaces>` block tells the executor these are fine and
not to look. Delete that sentence.

### IN-09 — 01-31: `repo-claims.test.cjs:337-352` is `:338-352`
`:337` is blank. Trivial.

### IN-10 — bonus, not in any plan: `hooks.ts:422` cites the wrong `hive.ts` line
`src/main/hooks.ts:418-422` — *"that list is written only into Claude's per-session `settings.json`
(hive.ts:1072)"*. Live `hive.ts:1072` is `// If a provider somehow exposes neither a flag nor a
positional prompt, spawn bare.` The settings write is at **`:1108`** and
`permissions: { deny: AGENT_DENY_RULES }` at **`:1183`**. 01-24 task 1 instructs rewriting the ceiling
comment at `:427-432`, five lines below — the executor will be reading this stale anchor and is not
told about it. Fold the correction into 01-24 task 1.

### IN-11 — bonus, not in any plan: two more stale source anchors inside files this set edits
- `test/net-binding.test.cjs`, acceptance case 3 comment: *"hive.ts:1366 names HIVE_ROOT in every
  agent's …"* — live `hive.ts:1366` is `const dir = this.agentDir(agentId);` inside `drainForStop`.
  01-24 edits this file; 01-31's sweep is scoped to `HIVE.md` + `docs/adr` and will not see it.
- `test/repo-claims.test.cjs:231` — comment says *"eleven fails here"* while the assertion at `:233`
  requires `12` (and the array at `:214-227` holds 12). 01-31 task 2 edits this file.

---

## Anchors verified CORRECT (so the fix set stays narrow)

Recorded so a fixer does not re-derive what is already sound.

**01-24** — `hooks.ts` `:97`, `:126`, `:143`, `:245`, `:340`, `:356`, `:395`, `:427-432`, `:434`,
`:465`, `:470`, `:484`; `slack.ts:105`, `:232`; `telemetry.ts:129`, `:322`;
`net-binding.test.cjs:282-287`, `:311-316`, `:319-325` (all exact, including the
`if (process.platform === 'win32') { console.error(…); return; }` shape); `win-cmd-shim.test.cjs:167`;
"nine acceptance cases" ✓ (9 numbered cases live). Patterns: `isAbsolute` 0, `agentForToken` 0,
`setTimeout` 0 in `hooks.ts` — all as the plan implies.

**01-25** — `telemetry.ts` `:28-30`, `:129`, `:178`, `:255`, `:274-276`, `:314`, `:361-362`,
`:400-401`, `:438-448`; `hive.ts:1082-1095`, `:1087`; `pty.ts:731-735`, `:132-144`, `:105-112`;
`index.ts:379`, `:543`, `:1613`, `:2515`, `:2516`, `:2525-2526`, `:2670-2671`; `transcript.ts:73`,
`:77`, `:105`; `sidebarLayout.ts:22`; `accountPool.ts:212`; `hooks.ts:400-410`, `:565`, `:597-621`;
`slack.ts:309-322`. Pattern `OTEL_EXPORTER_OTLP_HEADERS` → **0 hits** ✓ exactly as claimed;
`setZoomFactor|setZoomLevel|zoomFactor` in `src/main` → **0 hits** ✓ exactly as claimed.

**01-26** — `hive.ts:386-390`, `:391`, the `:414` regex text (character-identical to the plan's
quotation), `:719-735`, `:726-728`, `:1143`, `:1285-1293`, `:1336-1339` (exact, all four lines),
`:1455`, `:3283`; `pty.ts:400-405`; `hive-durability.test.cjs:305`; `voice-messages.test.cjs:224-236`;
`kg-core.cjs:3-8`; `hooks.ts:395-412`. `grep -c "Enterprise Knowledge Graph" src/main/hive.ts` → 1,
so that `<done>` gate is meaningful.

**01-27** — `breaker.ts:341-357`, `:341-344`, `:358-365` (exact, all eight lines), `:366`, `:369`,
`:373`, `:377`, `:385-390`; `delivery.ts:238-246`, `:366-370`, `:371-384` (exact), `:388-402`,
`:643-673` (exact), `:551-556`; `index.ts:533-536`.

**01-28** — `store.ts:283`, `:291-294`, `:521-527` (exact), `:529-544`, `:821`;
`MessageQueueComposer.tsx:135`, `:137-149` (exact), `:146-148`, `:151`, `:151-157`, `:168`, `:222-233`;
`useHive.ts:526-535` (exact), `:752`, `:766`, `:873`, `:908`; `delivery.ts:518`, `:684-688`;
`index.ts:533-536`. (`useHive.ts:783` is wrong — see below.)

**01-29** — the whole `autoMode.ts` block is **exact**: `:14-18`, `:35`, `:37-42`, `:42`, `:44-57`,
`:50-57`, `:66-69`. `agentProvider.ts:83`, `:183`, `:313` (`'Gemini 3.1 Pro (High)'` ✓ 21 chars),
`:624`; Kimi's `--auto` (`:289-290`) and Copilot's `-s --allow-all-tools --no-ask-user` (`:509-510`)
both confirmed; **eleven** presets confirmed, and every one sets `autoFlag === autoModeFlag` — the
plan's "correct by coincidence" residual is real. `AgentCard.tsx:113-121`;
`FullscreenTerminal.tsx:743-747` (exact); `renderer-runstate.test.cjs:9-15`, `:14-15`, `:133-140`,
`:138` (exact); `renderer-components.test.cjs:246`, `:274` (exact); `config.ts:414`, `:427`.

**01-30 — the cleanest plan in the set.** `win-cmd-shim.test.cjs:162-171`;
`hook-auth-roundtrip.test.cjs:154-162`, `:163-173`, `:175-181`, `:193-203`; **all six** shim
`sock_token` anchors `hive.ts:3635 / :3705 / :3758 / :3797 / :3859 / :4085` exact and all six are live
assignments today ✓; `ci-config.test.cjs:140-159`, `:161-199`, `:314-334` (including the quoted
`const lint = steps.filter(…)` at `:317`); `ci.yml:115`; `release.yml:12-13`, `:72`, `:143-155`,
`:157-172`, `:197-202`, `:219-222`; `engine-parity.test.cjs:288-330` (including
`assert.equal(lines.length, 1, …)` at `:321`); `electron-builder.yml:9-12`; `README.md:174-180`;
`RELEASE.md:42-48` and `:43-44`; `SECURITY.md:114-124` (bullet actually runs `:114-125`).

**01-31** — all four target stale anchors confirmed **exactly** as described:
`HIVE.md:116 / :138 / :139 / :250`, and the diagnoses are right — `hive.ts:1338` really is
`this.revokeProxyToken(agentId);`, `hooks.ts:662` really is off by one (`:663` is the
`drainAtStop` call), `delivery.ts:262` really is the `VETO_TTL_MS` comment, `drainAtStop` really is at
`delivery.ts:604`. `docs/adr/0005:52` exact, and `index.ts:1524` really is
`const log = hive.logTail(8)…` while the only `appendCostLedger` call is `:1613` ✓.
`config.ts:159 / :275 / :493`, `renderer/store/config.ts:74 / :142`,
`resources/skills/capabilities/SKILL.md:96`, `hive.ts:1455`, `docs/floor-inspection.html:710` — all
exact. `repo-claims.test.cjs:63`, `:98`, `:229-253` (DENIALS array length is **12** ✓ matching the
plan, though the source comment at `:231` says "eleven"). `index.ts:5792` exact.
`01-VALIDATION.md:60-83` exact.

---

## Recommended disposition

| Plan | Verdict | Must fix before execute |
|---|---|---|
| 01-24 | execute after a 5-min anchor patch | WR-01, WR-02, WR-03 (+ fold IN-10 into task 1) |
| 01-25 | **hold** | BL-04, BL-05 (add `DESIGN.md` to an owner), WR-04, WR-05, WR-06 |
| 01-26 | **hold — do not execute** | BL-01, BL-02, BL-03 are all destructive edit ranges; then WR-08, WR-09, WR-10 |
| 01-27 | execute | WR-12, WR-13 (prose + contract fixes only) |
| 01-28 | **hold — do not execute** | BL-06, BL-07, BL-08; then WR-14 |
| 01-29 | execute | IN-01, IN-02 (prose only) |
| 01-30 | execute as written | IN-05, IN-06 (gate + truth-statement wording) |
| 01-31 | **hold** | BL-09; then IN-07, IN-08 |

**One structural recommendation.** Six of the nine BLOCKERs are line-range edit anchors or greps.
This plan set already tells its executors *"Prefer a SYMBOL NAME over a line number"* (01-31
`<interfaces>`) and *"use those STRUCTURAL delimiters for any source-shape assertion, never a byte
offset"* (01-28 `<interfaces>`). Apply that rule to the plans themselves: every `Edit file:A-B`
instruction in 01-25, 01-26 and 01-28 should name the function or the pattern number and let the
executor find it. The +3 offset that runs through the whole of 01-26's `redactSecrets` block is
exactly what a symbol-named instruction would have survived.

---

_Lens 1 of 5 — source-anchor drift. Read-only; no source or plan file was modified._
_Verified at working-tree HEAD `fd66993`, 2026-08-22._
