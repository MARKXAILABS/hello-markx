---
phase: 01-finish-the-floor
plan: 31
subsystem: docs-and-verification-surface
tags: [stale-anchors, naming, shipped-surface-pin, requirements-adjudication, skip-ceiling, residual-register, gap-closure, phase-close]

requires:
  - phase: 01-finish-the-floor
    provides: "the seven landed gap-closure SUMMARYs (01-24 … 01-30) this plan sweeps, and the finished tree its pins are written against"
provides:
  - "doc anchors written as `<file>.ts <symbol>()` instead of line numbers that expire — thirteen re-derived, thirteen found stale at wave 4"
  - "shippedTextFiles(): an explicit-root, extension-allow-list walker over 315 files, PROVED to contain resources/skills/capabilities/SKILL.md, README.md and DESIGN.md"
  - "the FLOOR-07 naming pin widened from a two-file loop to the whole shipped surface, demonstrated RED against SKILL.md specifically"
  - "STALE_ANCHORS — a content-located denial table over six historical wrong anchors, run RED 6/6 against the pre-fix blobs"
  - "a cross-file pin that no shipped doc states a 1280 window minimum, so 01-25's DESIGN.md edit could not fall between two plans"
  - "requirement rows restated against the landed code, each verified at source, with GATE-01 adjudicated DOWN rather than rubber-stamped"
  - "the win32 skip ceiling DERIVED from the TAP, all seven members named by title, the move justified and re-frozen at <="
  - "one residual register: 35 code residuals, 5 recorded behaviour changes, 8 operator-blocked — every row with a named owner"
affects: [the phase verifier, Phase 2 planning, every follow-up plan named as an owner in the register]

tech-stack:
  added: []
  patterns:
    - "an anchor names a SYMBOL in a grep-checkable form; a line number is a claim that expires on the next edit"
    - "a denial table names strings that were WRONG IN THE PAST, so it can never go red for a refactor reason"
    - "assert the CORPUS before asserting the corpus is clean — a broken walker and a clean tree must stay distinguishable"
    - "scope a tree walker by an explicit ROOT LIST, not an exclusion list: an exclusion is a thing to forget, a root list is a thing to read"
    - "a residual owned by a plan that has already landed has no owner at all"

key-files:
  created:
    - .planning/phases/01-finish-the-floor/01-31-SUMMARY.md
  modified:
    - HIVE.md
    - docs/adr/0005-cumulative-cost-ledger.md
    - src/main/config.ts
    - src/renderer/src/store/config.ts
    - resources/skills/capabilities/SKILL.md
    - test/repo-claims.test.cjs
    - .planning/REQUIREMENTS.md
    - .planning/phases/01-finish-the-floor/01-VALIDATION.md

key-decisions:
  - "All thirteen anchors were re-derived at wave-4 HEAD rather than taken from the plan's table, and THIRTEEN OF THIRTEEN are stale — including the four the table called correct. 01-24, 01-25 and 01-26 each insert above them."
  - "The naming walker is NOT sourceFiles(): that helper is .ts/.tsx only and would never have read SKILL.md, the one file whose coverage was in doubt."
  - "GATE-01 is NOT ticked, against 01-25's requirements-completed. Clause 2 is still false on Linux and the source says so. One unmet clause is not closed."
  - "FLOOR-04 is restated from 01-26's LANDED SUMMARY, not from this plan's own task text — 01-26 revision 4 WITHDREW the value widening and ships a passing test proving the JSON arm still leaks."
  - "The skip ceiling is 7, MEASURED, not the 6 the plan expected: the seventh is an ENVIRONMENT skip (EPERM on symlinkSync) that will not appear on a runner with symlink permission."
  - "Nine register rows arrived owned by an already-landed plan or by a role rather than a plan, and were re-homed with a note saying so."

patterns-established:
  - "Pattern: run the widened pin BEFORE the last rename, so the RED names the file whose coverage was in doubt rather than a convenient one"
  - "Pattern: a requirements ledger's own anchors rot exactly like a doc's — sweep them with the docs"

requirements-completed: []   # NONE. Every Phase-1 row carries an operator clause this wave cannot discharge; see "The adjudication" below.

duration: 48min
completed: 2026-08-22
---

# Phase 01 Plan 31: Anchors that point at what they name, a pin whose corpus is proved, and one register with an owner on every row — Summary

**Thirteen doc anchors were re-derived at wave-4 HEAD and thirteen were stale — including the four an earlier sweep reported as correct — so they are now written as `<file>.ts <symbol>()` and frozen by a denial table that named six historical wrong strings and ran RED 6 of 6 against the pre-fix blobs; the retired product name is gone from every shipped surface except the audit record and the pin's own needle, over a 315-file corpus PROVED to contain `resources/skills/capabilities/SKILL.md` and demonstrated RED against exactly that file; and the requirement rows now describe the tree that exists, with GATE-01 adjudicated DOWN against a plan that claimed it, the win32 skip ceiling derived from the TAP rather than published from prose, and every one of 48 residuals carrying a named owner.**

## Performance

- **Duration:** ~48 min, one session
- **Tasks:** 3 of 3
- **Files modified:** 8 — exactly the plan's `files_modified`, nothing else. `git diff --diff-filter=D --name-only 76dc4dc..HEAD` is **empty**: no file deleted.

## Task Commits

| # | Task | Commit |
|---|---|---|
| 1 | Anchors that point at what they name | `395d74c` |
| 2 | The retired name goes, and the pins that hold the line cover what they claim to | `93eb72c` |
| 3 | The requirement rows, the skip ceiling, and the residuals that have no owner | `ff0bbd2` |

---

## Task 1 — the thirteen-anchor sweep, with every `sed -n '<n>p'` pasted

`grep -noE '(hooks|delivery|index|hive|pty|breaker|telemetry)\.ts:[0-9]+' HIVE.md docs/adr/*.md`
returned the same thirteen sites the plan's table names. Each was resolved against the file it
names, **at wave-4 HEAD (`76dc4dc`)**, in this session:

| doc site | anchor | `sed -n '<n>p'` AT WAVE-4 HEAD | verdict | plan's table said |
|---|---|---|---|---|
| `HIVE.md:90` | `hooks.ts:663` | `this.listenOn(sock);` | ❌ **stale** | ✅ correct |
| `HIVE.md:91` | `delivery.ts:604` | `this.commitQueue();` | ❌ **stale** | ✅ correct |
| `HIVE.md:91` | `index.ts:545` | `const hookServer = new HookServer(` | ❌ **stale** | ✅ correct |
| `HIVE.md:95` | `hooks.ts:646` | `console.error(` | ❌ **stale** | ✅ correct |
| `HIVE.md:116` | `hive.ts:1338` | `private startProxyBridge(` | ❌ stale | ❌ stale |
| `HIVE.md:138` | `hive.ts:1338` | `private startProxyBridge(` | ❌ stale | ❌ stale |
| `HIVE.md:139` | `hooks.ts:662` | `this.server = null;` | ❌ stale | ❌ stale |
| `HIVE.md:250` | `hooks.ts:662` | `this.server = null;` | ❌ stale | ❌ stale |
| `HIVE.md:250` | `delivery.ts:262` | `*  was asserted so a dead renderer's veto expires (VETO_TTL_MS). */` | ❌ stale | ❌ stale |
| `HIVE.md:293` | `hooks.ts:646` | `console.error(` | ❌ **stale** | ✅ correct |
| `HIVE.md:295` | `hive.ts:1375` | `` console.error(`[hive] startProxyBridge spawn failed for ${agentId}:`, e); `` | ❌ **stale** | ✅ correct |
| `docs/adr/0001:20` | `delivery.ts:518` | `queue.push(item);` | ❌ **stale** | ✅ correct |
| `docs/adr/0005:52` | `index.ts:1524` | `const newBytes = Buffer.byteLength(rebuilt, 'utf8');` | ❌ stale | ❌ stale |

**THIRTEEN OF THIRTEEN ARE STALE.** The plan predicted six and instructed *"trust none of this
table"* — that instruction is what caught the other seven. 01-24 inserts into `hooks.ts`, 01-25
into `index.ts`, 01-26 into `hive.ts`, and 01-27/01-28 both edit `delivery.ts`; every one of the
four anchors an earlier sweep certified as correct had expired by the time wave 4 ran. **A doc
line number is a claim with a shelf life shorter than the phase that writes it.** That is the
argument for symbols, made by measurement instead of by assertion.

**The correct targets, located by symbol in this session:**

```
$ grep -n "drainForStop" src/main/hive.ts
1431:  drainForStop(agentId: string): { block: boolean; reason?: string } {
1441:    cursor.lastProcessed = fresh[fresh.length - 1].id;     ← the cursor write
$ grep -n "drainAtStop" src/main/delivery.ts src/main/index.ts src/main/hooks.ts
src/main/delivery.ts:650:  drainAtStop(agentId: string): { block: boolean; reason?: string } {
src/main/index.ts:547:  (agentId) => delivery.drainAtStop(agentId),
src/main/hooks.ts:1316:      const drain = this.drainAtStop?.(agentId);
$ grep -n "stop_hook_active" src/main/hooks.ts
1299:      if (p.stop_hook_active) { this.emit(agentId, event, p); return {}; }
$ grep -n "appendCostLedger" src/main/index.ts
1632:    if (sample?.sessionId) hive.appendCostLedger(sample);
$ grep -n "private async drainQueue" src/main/delivery.ts
564:  private async drainQueue(live: LiveAgentPty[], now: number): Promise<void> {
```

**`docs/adr/0005-cumulative-cost-ledger.md`'s citation was 108 lines off**, not 89 — it pointed at
the god-beat prompt builder's `Buffer.byteLength`, and the real `appendCostLedger` call is the
breaker beat at `index.ts:1632`.

`docs/adr/0001-one-gate-for-pty-writes.md` is **not** in this plan's `files_modified`. Its anchor
IS now stale (`delivery.ts:518` is `queue.push(item)`; `drainQueue` is `:564`), and per the plan's
instruction it is **reported, not edited** — register row **A6**.

### Task 1 gates, RE-RUN and pasted

| gate | at `76dc4dc` | after |
|---|---|---|
| `grep -c "hive\.ts drainForStop()" HIVE.md` | **0** | **3** |
| `grep -c "delivery\.ts drainAtStop()" HIVE.md` | **0** | **2** |
| `grep -c "index\.ts appendCostLedger()" docs/adr/0005-…md` | **0** | **1** |
| `grep -c "hive\.ts:1338\|hooks\.ts:662\|delivery\.ts:262" HIVE.md` | **4** | **0** |
| `grep -c "index\.ts:1524" docs/adr/0005-…md` | **1** | **0** |
| `node --test test/repo-claims.test.cjs` | 21/21 | 21/21 |

The one residual `.ts:NNN` anchor in `HIVE.md` + `docs/adr/` after the edit is
`docs/adr/0001:20`'s, which this plan does not own.

No line-number pin was added. A pin on `:NNN` is red on every unrelated refactor, which is how a
pin ends up disabled; the durable half is task 2's denial table.

---

## Task 2 — the retired name, and a corpus that is proved rather than asserted

### The walker

`shippedTextFiles()`: explicit roots `['src','resources','docs','test','scripts','e2e']` plus
tracked top-level `*.md`, extension allow-list `/\.(tsx?|cjs|mjs|jsx?|md|html|ya?ml)$/`, directory
denies for `node_modules` and `.git`. **`dist/`, `out/` and `.planning/` are outside by
CONSTRUCTION**, not by exclusion — a scan with no build-output exclusion is permanently red on any
machine that has run `npm run build`, and an exclusion list is a thing to forget while a root list
is a thing to read.

Prototyped and measured in this session **before** it was written into the test:

```
corpus size = 315
SKILL.md in corpus: true    README.md in corpus: true    DESIGN.md in corpus: true
any dist/out/.planning leak: []
doc slice (.md|.html) = 43
```

315 against the plan's 312 — the three are wave 1-3's additions. The doc slice is 43, matching the
plan's measurement exactly.

**It is deliberately NOT `sourceFiles()`**, which the plan's round 1 instructed reusing. Read at
source, that helper is `else if (/\.tsx?$/.test(entry.name))` — `.ts`/`.tsx` only. Built as
originally instructed the "tree-wide" pin would never have read `SKILL.md`, its own highest-value
site, and would have **dropped `README.md`, which the two-file loop it replaces already covered** —
strictly weaker while reporting wider.

### The RED, against `SKILL.md` specifically

The `config.ts` renames landed first; then the widened pin was run **before** the last rename. This
is the only RED that proves anything, because `SKILL.md`'s coverage is exactly what was in doubt:

```
✖ no shipped surface describes the keyword store as an "Enterprise Knowledge Graph" (#31, FLOOR-07)
  AssertionError [ERR_ASSERTION]: these shipped files call the keyword store an
  "Enterprise Knowledge Graph": resources/skills/capabilities/SKILL.md. …
  resources/skills/capabilities/SKILL.md is the one that matters most: it is installed into every
  agent's skills directory, so a false capability claim there is consumed by the models.
  + actual - expected
  + [ 'resources/skills/capabilities/SKILL.md' ]
  - []
```

Then `SKILL.md` was renamed, and:

```
✔ no shipped surface describes the keyword store as an "Enterprise Knowledge Graph" (#31, FLOOR-07)
ℹ tests 23   ℹ pass 23   ℹ fail 0   ℹ skipped 0
```

### The renames — six sites, located by string

`src/main/config.ts` ×3, `src/renderer/src/store/config.ts` ×2,
`resources/skills/capabilities/SKILL.md` ×1, all rewritten to `src/main/kg-core.cjs`'s own words:
*keyword scoring over text chunks, term frequency plus a title boost, no entities and no edges*.
`src/main/hive.ts:1455` was verified renamed by 01-26 (`grep -Fc` → **0**) and **not edited** — it
is 01-26's file.

`SKILL.md` mattered most and it is worth saying plainly: until this commit, **every agent on the
floor was being told in its own skills directory that a formally RETIRED capability (V2-05) was
available to it.**

### The gate — keyed on the FILE SET, not a line count

```
$ git grep -l "Enterprise Knowledge Graph" -- src resources docs test scripts e2e '*.md' ':!.planning'
docs/floor-inspection.html
test/repo-claims.test.cjs
```

**Exactly two files, and they are exactly the two exclusions written into the walker** — the audit
record quoting the defect (erasing the quotation would delete the finding) and the pin's own
needle. The gate and the pin agree by construction.

Two facts recorded so the gate cannot be mis-substituted later:

- The plan predicted **11 lines across 6 files**; measured **10 across 5** before this task and **4
  across 2** after. The difference is that 01-26 had already removed `hive.ts`'s hit by the time
  wave 4 ran. The gate keys on the file SET, so this is not a discrepancy — adding further
  self-references inside `test/repo-claims.test.cjs` cannot falsify it.
- The same command **without** `':!.planning'` returns **76 lines** (the plan measured 71; the wave
  has since written five more SUMMARYs). Git's `*.md` pathspec matches at any depth, so it sweeps
  all of `.planning/`. That form is unsatisfiable without editing historical records, and it was
  round 1's gate. It is **not** used.

### `STALE_ANCHORS` — RED 6/6, measured

A content-located denial table in the shape of `STALE_STOP_DRAIN_DENIALS`: six rows, each a
`{ doc, wrong, where, shouldSay, pointedAt }`, with `assert.equal(STALE_ANCHORS.length, 6)` beneath
so trimming the list is not the easy way to make it pass.

Run against the **pre-fix blobs** (`git show 76dc4dc:HIVE.md` and `:docs/adr/0005-…md`), in this
session:

```
STALE_ANCHORS run against the PRE-01-31 blobs (76dc4dc):
  offenders = 6 of 6 -> the denial table is RED at HEAD
    HIVE.md (§2.5 dedup) cites hive.ts:1338
    HIVE.md (§3 layout) cites hive.ts:1338
    HIVE.md (§3 layout) cites hooks.ts:662
    HIVE.md (§7 phased plan) cites hooks.ts:662
    HIVE.md (§7 phased plan) cites delivery.ts:262
    0005.md (second appender) cites index.ts:1524
```

It names strings that were wrong in the PAST, so it can never go red for a refactor reason.

### The 1280 cross-check — **the hand-off IS discharged**

Over the `/\.(md|html)$/` slice (43 files), `/1280\s*[×x]\s*800|minimum:?\s*1280/i` returns
**0 offenders**. Verified independently: `grep -c 1280 DESIGN.md` → **0**, and `DESIGN.md:169` /
`:677` now read `960 × 800`. **01-25 made the correction it owned**, so this pin is green rather
than reporting an unclosed hand-off — and it is what makes that checkable from a plan that does not
own the file.

The pin carries its own non-vacuity guard rather than relying on being green: it asserts the
matcher still fires on `PRE_FIX_DESIGN_MINIMUM`, an inline fixture of the sentence the tree shipped
before 01-25 (01-29's precedent). A matcher that quietly stopped matching would otherwise be
indistinguishable from a clean tree.

### The `eleven`/`12` comment

The comment above `STALE_STOP_DRAIN_DENIALS`' length assertion read *"eleven fails here instead of
passing there"* while the assertion beneath asserts `12` and the array holds 12. Counted, corrected
to *"twelve"*.

### Task 2 gates, RE-RUN and pasted

| gate | at `76dc4dc` | after |
|---|---|---|
| `grep -c "shippedTextFiles" test/repo-claims.test.cjs` | **0** | **4** |
| `grep -c "STALE_ANCHORS" test/repo-claims.test.cjs` | **0** | **3** |
| `grep -c "1280" test/repo-claims.test.cjs` | **0** | **8** |
| the file-set gate | 5 files | **exactly the 2 exclusions** |
| `npm run typecheck` | — | exit **0** |
| `npx eslint . --max-warnings 0` | — | exit **0** |

---

## Task 3 — the rows, the ceiling, and the register

### The restated rows, each with the command AND its output

Every row below was verified **at source in this session**. A list of commands with no output is
indistinguishable from a list of commands never run.

**FLOOR-04** — the two caps cited BY NAME, because 01-26 inserted above both:

```
$ grep -n "SECRET_SCAN_MAX_LINES\|SECRET_SCAN_MAX_BYTES" src/main/hive.ts
321:const SECRET_SCAN_MAX_LINES = 20_000;
326:const SECRET_SCAN_MAX_BYTES = 4 * 1024 * 1024;
3357:    if (changed > SECRET_SCAN_MAX_LINES) {
3375:    const text = diff.out.slice(0, SECRET_SCAN_MAX_BYTES);
$ grep -Fc "Bash(git commit" src/main/hive.ts   -> 0
$ grep -Fc "Bash(git add"    src/main/hive.ts   -> 0
$ grep -Fc "C1_DECLARED_LOSS" test/voice-messages.test.cjs -> 3
$ grep -Fc "DECLARED LOSS" src/main/hive.ts     -> 2
```

**This row was restated from 01-26's LANDED SUMMARY, not from this plan's own task text.** 01-26
revision 4 (`473d961`) **WITHDREW** the value widening — its objective opens *"This revision does
NOT widen the value matcher. That is the deliverable"* and *"The JSON arm is DROPPED."* It ships a
**passing** durability assertion that `"token": "abcdef123456789"` is **still present** in
`git log -p`. Writing *"the matcher now covers JSON value position"* into the requirements ledger
would have put a claim there that 01-26's own green test contradicts — ROADMAP criterion 1's exact
defect class, manufactured by the plan that closes it. The row now says: pattern 5 is
**byte-frozen**, only pattern 3's prefix boundaries changed, measured **0 lost / 0 new false
positives / 5 gained**, and it names **five ACTIVE bypasses** (line-chunking, `SECRET_SCAN_MAX_LINES`,
`SECRET_SCAN_MAX_BYTES`, quoted-key JSON, and `printf '* -diff' > .gitattributes` — the only one
that logs nothing at all).

**The owner is re-homed.** It read *"Owner: a plan that widens the matcher, plus the operator."*
**No plan widens it any more**, so that owner resolved to nobody — which the register's own preamble
forbids. It is now a follow-up plan holding `src/main/hive.ts` + `test/voice-messages.test.cjs`,
with 01-26's measured finding recorded as the reason the widening was withdrawn: the matcher fires
on 184 spans across 481 tracked files, **none of them credentials**, and would have unstaged a path
in 50 of the last 400 commits (12.5%) across 66 distinct paths.

**FLOOR-13** — the row recorded the OPPOSITE of the tree:

```
$ grep -n "const MIN_WIN" src/main/index.ts
2560:const MIN_WIN = { width: 960, height: 800 };
$ grep -n "SIDEBAR_COLLAPSE_WIDTH\s*=" src/renderer/src/store/sidebarLayout.ts
22:export const SIDEBAR_COLLAPSE_WIDTH = 1024;
$ grep -n "960" DESIGN.md
169:- Main window minimum: 960 × 800.
677:Min window: 960 × 800. Right panel collapses below 1024 to a right-edge overlay.
$ grep -c 1280 DESIGN.md -> 0
$ grep -n "splitterReachableMax" src/renderer/src/store/sidebarLayout.ts
52:export function splitterReachableMax(viewportWidth: number, min: number): number {
```

The cell said *"NOT in the shipped app, which cannot reach that width: `MIN_WIN.width = 1280` …
so the collapsed branch is unreachable for a real operator"*. It is reachable now. The row records
that **the resolution was to lower the window floor rather than delete the feature**, and why —
deleting a built, tested, documented responsive behaviour to resolve a one-constant contradiction
would also have left the app unusable below 1280 on 1366×768 laptops, and `DEFAULT_WIN` is unchanged
at 1440×900, so this changes what an operator may drag to, not what the app opens as. D-22's
`{tokens, budgetTokens, pct}` adjudication is left exactly as it stands.

**FLOOR-01**:

```
$ grep -n "hasBypassFlag" src/renderer/src/store/autoMode.ts
39:function hasBypassFlag(command: string | undefined, flag: string): boolean {
96:    return AGENT_PROVIDER_PRESETS.some((preset) => hasBypassFlag(command, preset.autoFlag ?? ''));
124:  return hasBypassFlag(command, autoModeFlagForProvider(p));
$ grep -n "OPENCODE_CONFIG_CONTENT" src/main/*.ts
src/main/index.ts:3456:      extra.OPENCODE_CONFIG_CONTENT = JSON.stringify(oc);
```

The surviving `opencode` ceiling (its bypass is baked into `OPENCODE_CONFIG_CONTENT` at spawn and
never reaches the command string the chip reads) and the `autoFlag`/`autoModeFlag` field drift are
both named in the row and in the register.

**FLOOR-07** — closed except the two deliberate exclusions; `--wing` scope stays RECALL-02's
(Phase 5). `knowledgeLine` is named as a separate residual the pin **cannot** discover, because it
does not contain the scanned phrase.

**GATE-01**:

```
$ grep -c "mintAgentToken" src/main/telemetry.ts    -> 2
$ grep -c "x-hive-otel-token" src/main/telemetry.ts -> 3
$ grep -c "pathIdentity" src/main/hooks.ts          -> 11
$ grep -c "vouchedBases" src/main/hooks.ts          -> 2
$ grep -c "SPAWN_SAFE_SESSION_ID" src/main/hooks.ts -> 2
$ grep -n "proc/" src/main/hooks.ts src/main/telemetry.ts
src/main/hooks.ts:29: * PTY), so a same-uid sibling reads /proc/<B-pid>/environ; AGENT_DENY_RULES
src/main/telemetry.ts:40: * a same-uid sibling can read (`/proc/<pid>/environ` on Linux) — the ceiling
```

**FLOOR-06**:

```
$ grep -n "latest\*\.yml" .github/workflows/release.yml
166:  files=$(ls *.dmg *.zip *.exe *.AppImage *.blockmap latest*.yml 2>/dev/null || true)
$ grep -c "installers=" .github/workflows/release.yml -> 1
```

**FLOOR-02 / FLOOR-10 / RECORD-03** — evidence sentences checked for literal truth:

```
$ grep -n "queueReadError" src/main/delivery.ts   -> 291 (field), 382 (doc), 7 refs total
$ grep -n "softTrip" src/main/breaker.ts
377:    let softTrip: … = null;
433:    return softTrip ?? { tripping: false, reason: '' };
$ grep -c "COST_TAIL_BYTES" src/main/hive.ts -> 1
$ sed -n '265p' src/main/hive.ts
// RECORD-03 (#34): the 1 MB `COST_TAIL_BYTES` window that `taskSpend()` used to
```

- **RECORD-03's sentence is still literally true** — the only surviving `COST_TAIL_BYTES` is a
  comment tombstone; spend runs through the `costByTask` accumulator bounded by `pruneCostByTask`.
  No correction needed.
- **FLOOR-02's was hardened and is extended**, and its own anchor chain was corrected (below).
- **FLOOR-10's needed a real correction**: 01-27 made the 80–100% band ADVISORY. The cell implied a
  ceiling the shipped arm did not have — an agent at 85% of its card cap that was also the floor's
  biggest spender over `costCapUsd` could not be constrained at all, because `evaluate()` returns on
  the first match and the band sat above five harder arms.

**The requirements ledger's own anchors had rotted exactly like the docs'.** FLOOR-02's evidence
chain cited `index.ts:545` → `hooks.ts:663` → `delivery.ts:604` → `hive.ts:1368`, cursor at
`:1375`; **all five point at unrelated code** at wave 4, and the row's own parenthetical already
said the numbers had *"drifted twice during Phase 1"*. They drifted a third time, inside the wave.
FLOOR-09's `index.ts:547` / `hive.ts:2596` and FLOOR-10's `hive.ts:2953` → `index.ts:1635` →
`breaker.ts:361` were likewise all stale. All are rewritten as symbols.

### The adjudication — no row was ticked, and GATE-01 was declined

```
checkbox counts HEAD: [x]=10  [ ]=61        traceability HEAD: 10 Complete / 61 Pending
checkbox counts now:  [x]=10  [ ]=61        traceability now:  10 Complete / 61 Pending
```

Three plans named requirements in `requirements-completed`. **Each was adjudicated per clause:**

| Claimed by | Req | Verdict |
|---|---|---|
| 01-25 | **GATE-01** | **DECLINED.** GATE-01 has two clauses and the second reads *"…**and** the token that authenticates the socket is not readable from any agent's shell."* Still false on Linux — `/proc/<pid>/environ` — and the source says so at `hooks.ts:29` and `telemetry.ts:40`. **01-24 named GATE-01 and deliberately left `requirements-completed` EMPTY for exactly this reason.** 01-25 closed the second identity CHANNEL, which is not the same thing. One unmet clause is not closed. |
| 01-25 / 01-29 | **FLOOR-13** | **DECLINED as a tick, upgraded as a row.** The collapse is genuinely reachable now; 01-12's operator checkpoint is still unrun and nobody has looked at the app at 960px. |
| 01-26 | **FLOOR-04** | **DECLINED.** Live clause unrun; the requirement's own word was *"never"* and is restated to what a bounded matcher delivers. |
| 01-26 / 01-31 | **FLOOR-07** | **DECLINED.** Naming half genuinely closed; the `--wing` scope clause is RECALL-02's (Phase 5). |
| 01-29 | **FLOOR-01** | **DECLINED.** Operator checkpoint unrun; two source-verified ceilings survive. |
| 01-25 / 01-26 | **FLOOR-09** | Already `[x]`. Nothing to flip; anchors corrected. |
| 01-27 | **FLOOR-02 / FLOOR-10 / RECORD-03** | 01-27 did not run `mark-complete` and said so. FLOOR-02 stays Pending on its live operator run. |

`requirements mark-complete` was **not** run. `nyquist_compliant: false` and `status: draft` are
byte-identical to HEAD, confirmed by diffing the frontmatter:

```
$ git diff --unified=0 .../01-VALIDATION.md | grep -E '^[-+](status|nyquist_compliant):'
(no output — neither line appears in the diff)
```

### The skip ceiling — DERIVED, not carried forward

```
$ node --test --test-reporter=tap test/*.test.cjs | grep -E "^# (tests|pass|fail|skipped|todo) "
# tests 634
# pass 627
# fail 0
# skipped 7
# todo 0
```

**Seven, read off the TAP by title — not hardcoded, and not "6", "7 or 8" or any figure from prose:**

| # | Title | Kind |
|---|---|---|
| 1 | *a hook fires with NO node on PATH, and its payload reaches HIVE_SOCK* | frozen four (`{ skip: !POSIX }`) |
| 2 | *`node` resolves and RUNS with no node on PATH — the whole point* | frozen four |
| 3 | *the real shim authenticates to the real hook server* | frozen four |
| 4 | *a shim with no token is still rejected* | frozen four |
| 5 | *a LEAF symlink pointing at the shim from outside the hive is denied* | **ENVIRONMENT** — runtime `t.skip` carrying `EPERM: operation not permitted, symlink`; will NOT appear on a runner with symlink permission (01-24) |
| 6 | *deleting the hook socket no longer opens the gate until the app restarts* | **CONVERSION** — was a bare `return`, i.e. a PASS (01-24) |
| 7 | *the win32 branch is genuinely platform-gated* | **CONVERSION** — was a bare `return`, i.e. a PASS (01-30) |

**Reconciliation against 01-30, which measured this in wave 2:** 01-30 reported `# skipped 7` with
these same seven titles and instructed 01-31 to re-derive rather than inherit. **The measurement
agrees with 01-30 title for title. No discrepancy to report.** Only `# tests`/`# pass` differ
(626/619 → 634/627), because 01-29 added +6 and this plan +2 after 01-30 ran.

**The plan expected 6.** Measured is 7, and the difference is member 5 — an environment skip, not a
platform one. The plan's own instruction settles it: *"on disagreement the measurement wins and the
discrepancy is reported."* It is reported, and `01-VALIDATION.md` re-freezes at `≤ 7` on win32
while stating that a host **with** symlink permission should read 6 and that this is a pass, not a
failure, because the clause is a ceiling.

`01-VALIDATION.md` names **no** skip titles today — verified before editing
(`grep -c "hook-auth-roundtrip"` → **0**), which confirms the plan's correction of round 1's claim.
`01-23-SUMMARY.md:181` keeps its `# skipped 4` list permanently as a historical record; it is in no
plan's `files_modified`.

### The whole-suite arithmetic — this plan owns the authoritative figure

```
Phase-01 pre-gap baseline (01-VERIFICATION.md)   535 tests / 531 pass / 0 fail / 4 skipped
Live baseline at this plan's start (76dc4dc)     632 / 625 / 0 / 7
AUTHORITATIVE, after this plan                   634 / 627 / 0 / 7

delta vs this plan's start   +2 tests, +2 pass, 0 fail, +0 skipped   ← STALE_ANCHORS + the 1280 pin
delta vs the pre-gap baseline +99 tests, +96 pass, 0 fail, +3 skipped
```

**The identity is `pass = 531 − 2 + N_run`, not `531 + N`:**

```
pass  = 531 − 2 (the two conversions) + 98 (new cases that RUN here) = 627   ✔ measured 627
tests = 535 + 99 (new test points; the conversions were already counted) = 634  ✔ measured 634
skip  = 4 + 2 (the two conversions) + 1 (one new case that skips here) = 7    ✔ measured 7
```

**The −2 is the change WORKING.** `node:test` counts a callback that returns normally as a PASS, so
`net-binding.test.cjs` (01-24) and `win-cmd-shim.test.cjs` (01-30) were each reporting `ok` on win32
having executed not one assertion. This phase's headline gap is that the published figure counted
Windows non-runs as passes; a `# pass` that goes DOWN by exactly 2 is the arithmetic proof it no
longer does.

---

## The residual-register SWEEP — what each SUMMARY contributed, and the rows it became

The register is **derived**, not copied. The plan's seeded fourteen rows are a SEED; the sweep read
all seven landed SUMMARYs and the shipped register carries **35 code residuals (A1-A35), 5 recorded
behaviour changes (B1-B5) and 8 operator-blocked items (C1-C8)**. It lives in
`.planning/REQUIREMENTS.md` under *"The residual register"* and is reproduced below.

| SUMMARY | Section swept | Lines it contributed | Rows they became |
|---|---|---|---|
| **01-24** | `## Accepted residuals` (T-P24-12 … -17), `## Issues Encountered`, `## Next Phase Readiness` | 5 ids + the Group-C win32 gap + the stated ALLOW→DENY | **A15, A16, A17, A18, A19, A20**; **B1, B2** |
| **01-25** | `## Residuals — named, with anchors` (4), `## MEASUREMENT UNAVAILABLE` (3), `## Accepted consequences of MIN_WIN 1280 → 960`, `## Issues Encountered` | recordSession defence-in-depth; poisoned stored id; account-pool blast radius; same-uid env read; the OTLP-forwarding unknown; the 960 usability unknown; the argv unknown; the SDK clobber | **A10, A21, A22, A35**; **B4**; **C5, C6, C7**; the same-uid row folded into GATE-01's adjudication |
| **01-26** | `## Residuals for the 01-31 register sweep` (R1-R4), `### MEASUREMENT UNAVAILABLE`, `## FLOOR-04 — the restatement text` | `knowledgeLine`; the false-positive channel; the declared C-1 loss + its measured upgrade; `AGENT_DENY_RULES`; the unrun live clause | **A11, A12, A13, A14**; **C4**; and the whole FLOOR-04 row text |
| **01-27** | `## Recorded behaviour change (T-P27-02)`, `### Requirements: FLOOR-02 was NOT marked complete`, `## State files — the SDK clobber` | the no-progress escalation; FLOOR-02's live run; the deterministic STATE.md corruption *"not fixed here"* with **no owner named** | **B3**; FLOOR-02 row; **A35** |
| **01-28** | **`## Quiesce residuals — ACCEPTED, not fixed`** (heading VERIFIED present at `:78`, both (a) and (b)), `R-21`/`R-23` notes, the `b/CR-03` CEILING, `### MEASUREMENT UNAVAILABLE` | both quiesce residuals; mail-to-a-stuck-blocked-agent; `blockReason`; the pre-01-28 `roster.json` ceiling; three unrun observations | **A23, A24, A25, A26**; FLOOR-02's unrun list |
| **01-29** | `## Residuals — named, with anchors and owners` (5), `## MEASUREMENT UNAVAILABLE` (3), `## Accepted consequences, restated` | opencode's env-baked bypass; `autoModeFlag` vs `autoFlag`; the persisting rescue path; `b/WR-08`; the cross-process pin; the deliberately-unverified `DESIGN.md:686` | **A27, A28, A29, A30, A31**; **A32 (new — see below)**; **B5**; **C7** |
| **01-30** | `## Residuals handed to plan 01-31's register — BY NAME` (3), `## Also for 01-31`, threat table `T-P30-07`, `MEASUREMENT UNAVAILABLE` | proc-kill's five invisible cases; engine-parity's byte-level drive; the win-cmd-shim outcome-vs-reason finding; `c/WR-02`'s three remaining settings; the block-scalar extraction ceiling; the unrun `gh attestation verify` | **A7, A8, A9, A33, A34**; **C3** |

### What the sweep found that the seed did not

- **A6 — `docs/adr/0001-one-gate-for-pty-writes.md:20` is stale.** Found by task 1's thirteen-anchor
  sweep, which the seed did not cover because that file is in no plan's `files_modified`.
- **A32 — `DESIGN.md:686` is off by one, and two live source comments cite it.** 01-29 deliberately
  left it alone (*"it was not checked in this session and an unverified 'correction' is worse than a
  stale one"*). **This plan checked it:**

  ```
  $ sed -n '685,686p' DESIGN.md
  | 2 | drawer / sidebar |
  | 3 | toasts |
  $ grep -rn "DESIGN.md:686" src/
  src/renderer/src/App.tsx:513:  … z-index 2 is DESIGN.md:686's drawer/sidebar
  src/renderer/src/store/sidebarLayout.ts:63:  /** … at `z-index: 2` (`DESIGN.md:686`). */
  ```

  The drawer/sidebar row is `:685`. 01-29's caution was correct and the check resolves it.
- **A35 — the deterministic `STATE.md` clobber has no owner.** 01-27 measured it twice with a
  backup-and-diff and wrote *"it is not fixed here because that paragraph is 01-23's verdict text
  and is not this plan's to rewrite"* — naming no owner at all. Three separate SUMMARYs (01-25,
  01-27, 01-29) each independently hand-edited around it.

### Seeded rows reconciled against source

| Seed row | Re-verified | Outcome |
|---|---|---|
| 1 Pixi 7px | `ThoughtBubble.ts:15/16/17/22/23/32/76`, `ToolBubble.ts:29/30/39` all confirmed | **A1**, unchanged |
| 2 layout clips | corroborated by REQUIREMENTS FLOOR-12's own cell | **A2** |
| 3 FLOOR-10 ladder | corroborated by 01-27 | **A3** |
| 4 `CONCERNS.md:46` | still says README calls it EKG; `grep -c` on README → **0** | **A4** |
| 5 `net-binding:295` cites `hive.ts:1366` | **doubly stale** — the seed measured `:1366` as `const dir = this.agentDir(agentId);`; at wave 4 it is a `process.env` spread comment. `grep -c 1366 01-24-PLAN.md` → **0**, confirming 01-24 has no such task | **A5**, owner re-homed |
| 6 `b/CR-03` CLOSED by 01-28 | `grep -rn persistQueues src/` → **0**; `adoptRendererQueues` live at `index.ts:4105` | **A26**, closure recorded |
| 7 proc-kill | matches 01-30 §1 | **A7** |
| 8 engine-parity | matches 01-30 §2 | **A8** |
| **9 `recordSession`** | **RESOLVED — the seed instructs deleting this row if the fourth sink shipped. It shipped:** `grep -c "SPAWN_SAFE_SESSION_ID" src/main/hooks.ts` → **2**, and `hooks.ts:467` names *"sink 4 (below, at the `recordSession` call)"*. The seed's version is deleted | narrowed to **A10** (the one-line guard inside `recordSession` itself, which still reads only `if (!root \|\| !sessionId) return;` — confirmed at `hive.ts:1200-1202`) |
| 10 quiesce (a)+(b) | **`## Quiesce residuals — ACCEPTED, not fixed` heading VERIFIED present** at `01-28-SUMMARY.md:78`, both halves; re-verified at source (`delivery.ts:714` `quiesced.has`, `:716` unconditional `setStatus?.(id,'idle')`, `:728` the `synthesized: true` emit) | **A23** |
| operator rows | PR #77 / D-09 / `v*` tag / `human_verification` / SC-1 | **C1-C4, C8** |

### Owners re-homed — nine rows

**No row in the shipped register is filed against a plan that has already landed.** These arrived
owned by a landed plan, by this plan (which does not hold the file), or by a role:

| Row | Arrived owned by | Re-homed to |
|---|---|---|
| A5 | *"01-24 if it is still in flight, otherwise a follow-up"* — a condition that can never hold | a follow-up plan holding `test/net-binding.test.cjs` |
| A10 | *"01-31's residual register"* (01-25) | a follow-up plan holding `src/main/hive.ts` |
| A11 | *"01-31 (FLOOR-07 naming sweep)"* (01-26) — **01-31 does not hold `src/main/hive.ts` and may not edit it** | a follow-up plan holding `src/main/hive.ts` |
| A15, A16, A18, A19 | *"hive maintainer"* — a role, not an owner for something measurable from source | a follow-up plan holding `src/main/hooks.ts` |
| A23 | *"plan 01-31's residual register"* (01-28) | a follow-up plan holding `src/main/delivery.ts` + `useHive.ts` |
| A27, A28, A30 | *"01-31's register"* (01-29) | follow-up plans holding `autoMode.ts` / `agentProvider.ts` / `AgentCard.tsx` |
| A29 | *"plan 01-28's file"*, which 01-29 itself noted has landed | a follow-up plan holding `src/renderer/src/store/store.ts` |
| FLOOR-04's row | *"a plan that widens the matcher"* — nobody widens it any more | a follow-up plan holding `src/main/hive.ts` + `test/voice-messages.test.cjs` |

**The full register is in `.planning/REQUIREMENTS.md`.** Its 48 rows are not reproduced verbatim
here to avoid two copies that can drift; the table above records exactly which SUMMARY line became
which row id, which is what makes the closure checkable.

---

## Verification — every command executed in THIS session

| Check | Result |
|---|---|
| `gsd-tools verify artifacts .../01-31-PLAN.md` | `all_passed: true`, **5 / 5** (was **0 / 5** at HEAD) |
| `gsd-tools verify key-links .../01-31-PLAN.md` | `all_verified: true`, **2 / 2** (was **0 / 2** at HEAD) |
| `node --test --test-reporter=tap test/*.test.cjs` | **634 / 627 / 0 fail / 7 skipped** |
| `npm run typecheck` (node + web) | exit **0** |
| `npx eslint . --max-warnings 0` | exit **0** |
| `node --test test/repo-claims.test.cjs` | 23 / 23 (was 21 / 21) |
| `node --test test/repo-claims.test.cjs test/ci-config.test.cjs` | 37 / 37 |
| `git diff --diff-filter=D --name-only 76dc4dc..HEAD` | **empty** — no file deleted |
| `git diff --name-only 76dc4dc..HEAD` | exactly the **8** declared files |
| `[x]` / `[ ]` counts in REQUIREMENTS.md | **10 / 61 before and after** — no row ticked |
| traceability table Complete / Pending | **10 / 61 before and after** |
| `nyquist_compliant` + `status` in 01-VALIDATION.md | absent from the diff — byte-identical |

`npm run build` and `npm run e2e` were **not** run: this plan touches no bundled runtime code path
(two comment-only `config.ts` edits, one shipped `.md`, one test file, two docs and two planning
documents), and 01-29 ran both in wave 3 with `✓ built in 39.80s` and `2 passed`. Typecheck crosses
both `config.ts` files and is exit 0.

## Deviations from Plan

### 1. [Rule 1 — the plan's own table was wrong, and it said to check] Thirteen anchors stale, not six

- **Found during:** Task 1.
- **Issue:** The plan's `<interfaces>` table certifies four anchors as `✅ correct` at its writing
  tip. At wave-4 HEAD every one of them is stale, plus `docs/adr/0001`'s.
- **Fix:** All thirteen re-derived with `sed -n '<n>p'` and pasted above; every one this plan owns
  rewritten as a symbol. The plan's own instruction (*"Check all thirteen again; trust none of this
  table"*) is what caught it, so this is the plan working, not a defect in it.
- **Impact:** `docs/adr/0001` is not owned here and became register row **A6** rather than an edit.

### 2. [Argued] The measured skip ceiling is 7, not the 6 the plan expected

- **Found during:** Task 3.
- **Issue:** The plan reasoned to *"a win32 expectation of 6"* while insisting the number be derived.
- **Fix:** Derived: **7**. The seventh is `net-binding`'s leaf-symlink case, an ENVIRONMENT skip
  (`EPERM` on `symlinkSync`) rather than a platform one — exactly what 01-30 flagged. `≤ 7` is
  frozen with the distinction written in, so a runner with symlink permission reading 6 is a pass.
- **Impact:** None on the rule; the `≤` semantics is preserved and re-stated.

### 3. [Argued] The register carries 48 rows against the seed's fourteen

- **Found during:** Task 3's sweep.
- **Issue:** The seed is explicitly *"not the set"*. Sweeping all seven SUMMARYs produced 35 code
  residuals, 5 recorded behaviour changes and 8 operator-blocked items, including three the seed did
  not carry (**A6**, **A32**, **A35**).
- **Impact:** This is the sweep working. The plan's own truth #5 required exactly it.

### 4. [Rule 2 — missing critical] The 1280 pin carries its own non-vacuity guard

- **Found during:** Task 2.
- **Issue:** The 1280 scan is green because 01-25 did its job. A pin that has only ever been green,
  whose matcher could silently break, is indistinguishable from a clean tree — the defect class this
  phase exists to remove.
- **Fix:** `PRE_FIX_DESIGN_MINIMUM`, an inline fixture of the pre-01-25 sentence, asserted to still
  match before the scan runs. Three lines, following 01-29's `PRE_FIX_MIN_WIN_SOURCE` precedent.

**Total deviations:** 4 (1 plan-table correction the plan itself mandated, 2 argued, 1 Rule 2).
**Impact:** No scope creep. Nothing was skipped, softened or substituted.

## MEASUREMENT UNAVAILABLE — not verified, must not be read as verified

1. **Nothing in this plan was observed in the running app.** Every claim is a source read, a grep or
   a test run. The `SKILL.md` rename in particular changes what agents are TOLD; whether an agent's
   behaviour improves is unobservable here.
2. **The POSIX skip figure.** No POSIX host ran in this session. Members 1-7 all have different
   polarity there, so no number is published for it — publishing an unmeasured one is the defect this
   phase exists to remove.
3. **`npm run build` / `npm run e2e` were not re-run** (reasoned above, not measured here).

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired component was introduced.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change at a trust boundary.
Every surface touched is inside the plan's own `<threat_model>` (T-P31-01 … T-P31-SC). No package
installs; `package.json` untouched.

---

## Is Phase 01 COMPLETE or PARTIAL?

### **PARTIAL.** It is not close to complete, and the honest reason is not this wave's work.

**What the gap-closure wave actually achieved:** eight plans landed real, measured fixes — a
`(dev, ino)` identity gate that denies 18 previously-allowed win32 spellings plus a hard link into
every agent's PATH; a second per-agent credential on the telemetry endpoint; a secret matcher that
gains 5 detections and loses none; a budget band that stops shielding five harder arms; a queue
loader that stops overwriting good data after a failed read; a composer that stops discarding the
operator's text; an AUTO chip that reads the command the operator actually typed; two Windows
non-runs relabelled from PASS to SKIP; and this plan's doc and ledger corrections.

**What that changed about the phase verdict: nothing.** Requirements close at **10 of 23**, exactly
as `01-23` adjudicated. Thirteen stay open. Not one box moved, and the reason each stays open is
recorded per clause.

**What remains, and who must do it:**

| Blocker | Who | Why nobody else can |
|---|---|---|
| **`origin/main` still pins `"electron": "^32.2.0"`.** The entire phase — 160+ commits — sits behind draft PR **#77**. **0 of 20** floor-inspection issues can honestly be closed, because closing one today records "fixed" against a shipped product that still carries the defect. | **operator** | Merging is not an agent action here. |
| **D-09.** No one has launched `dist\win-unpacked\Hello MarkX.exe`, confirmed a real PTY echo, a persisted setting surviving a relaunch and a clean visual pass. **`01-01-SUMMARY.md` does not exist** — the only plan of 23 with none. `01-VALIDATION.md`'s Nyquist section states outright that no number of unit runs can reconstruct an Electron-version regression, because `test/load-ts.cjs` stubs `electron` for the whole suite. | **operator** | Structurally unreachable from CI. |
| **A `v*` tag,** so `gh attestation verify` has a published artifact. 01-30 makes the attested SUBJECT correct; only a real release makes the sample run. | **whoever cuts the tag** | The publish job is gated on `refs/tags/v*`. |
| **~9 further `human_verification` items** in `01-VERIFICATION.md` — the log-folder click, the Windows blocked-agent toast, the Tasks-board visual, the auto-mode chip checkpoint, ~600 swept FLOOR-12 surfaces, FLOOR-04's live fake-key drop, and now the app at a 960px window. | **operator** | Each is an observation, not a computation. |
| **35 code residuals (A1-A35)**, each with a named follow-up owner. | **follow-up plans**, named per row | Out of every plan's file set in this wave. |
| **SC-1 stays untrue on win32.** *"Autonomy survives the window"* is not observable while `index.ts` kills every PTY and quits on `window-all-closed`. Running with no window is **Phase 2's DAEMON-01**. | **the ROADMAP's owner** | A criterion, not code. |

**This plan does not close the phase and does not claim to.** `01-VALIDATION.md` still carries
`nyquist_compliant: false` and `status: draft` — **correctly**, byte-identical to HEAD. Flipping
either follows a re-run of `/gsd:verify-work 1`; `01-23` was right to refuse it and so is this plan.
Re-run `/gsd:verify-work 1` after this lands; **the verdict is the verifier's, not this plan's.**

## Next Phase Readiness

- **Wave 4 is done. All eight gap-closure plans (01-24 … 01-31) have landed.**
- **Every unfixed residual has a named owner in one register** at `.planning/REQUIREMENTS.md`, and
  none is filed against a plan that has already landed.
- **The verifier can re-run against a tree whose docs no longer contradict it**, and against
  requirement rows whose evidence sentences were checked at source rather than inherited.
- **Phase 2 planning should read the register's A-section first** — A1 (FLOOR-12's arithmetic),
  A7/A8 (the two test-surface gaps), A23 (the quiesce pair) and A35 (the STATE.md clobber) are the
  four that will otherwise be rediscovered.

---
*Phase: 01-finish-the-floor*
*Completed: 2026-08-22*

## Self-Check: PASSED

Files claimed modified/created, checked on disk in this session:

```
FOUND: HIVE.md
FOUND: docs/adr/0005-cumulative-cost-ledger.md
FOUND: src/main/config.ts
FOUND: src/renderer/src/store/config.ts
FOUND: resources/skills/capabilities/SKILL.md
FOUND: test/repo-claims.test.cjs
FOUND: .planning/REQUIREMENTS.md
FOUND: .planning/phases/01-finish-the-floor/01-VALIDATION.md
FOUND: .planning/phases/01-finish-the-floor/01-31-SUMMARY.md
```

Commits claimed, checked in `git log --oneline --all`:

```
FOUND: 395d74c   FOUND: 93eb72c   FOUND: ff0bbd2
```

No sentence in this SUMMARY says "VERIFIED" about a command that was not executed in this session.
No requirement box was ticked, no issue was closed, and no `MEASUREMENT UNAVAILABLE` is presented as
evidence.
