---
phase: 01-finish-the-floor
plan: 30
subsystem: verification-surface
tags: [false-pass, runner-skip, vacuous-pin, mutation-testing, supply-chain, attestation, gap-closure]

requires:
  - phase: 01-finish-the-floor
    provides: "01-24's runner-skip conversion of test/net-binding.test.cjs (the precedent and its conditional-skip control); 01-26's rewritten src/main/hive.ts, whose six shim templates this plan re-derives rather than inherits"
provides:
  - "two win32 non-runs converted from a bare `return` (which node:test counts as a PASS) to CONDITIONAL runner skips, one on each polarity"
  - "stripLineComments() + an assignment-shaped sock_token pin over ALL SIX shim templates, with the comment-strip's own precondition asserted"
  - "a mutation loop that comments out each of the six sock_token assignments in turn and asserts the pin goes red, iteration count pinned to the derived shims.size"
  - "a byte-exact pin on ci.yml's `npm test` step — the disarm door `continue-on-error` cannot see"
  - "a parsed pin that every glob a release UPLOADS is inside the glob set `Generate checksums` HASHES, with one named exclusion and both cardinalities"
  - "the electron-updater feed (`latest*.yml`) and the blockmaps brought inside the attestation's subject"
  - "an installers-present tripwire that fails the release job loudly, restoring the guard the widening would have disarmed"
  - "SECURITY.md scoped to the control's real reach, pre-change releases included"
affects: [01-31 (owns the residual register — three residuals handed over below, by name)]

tech-stack:
  added: []
  patterns:
    - "a platform-conditional case uses the runner's own `skip` option with a CONDITIONAL value; a bare `return` is a PASS and an unconditional skip is a non-run on every platform"
    - "a conditional skip is PROVEN conditional by poisoning the case's own assertion: the poison must fire on the polarity that runs and stay invisible on the one that skips"
    - "a source-text pin matches an ASSIGNMENT with a value, over comment-stripped source — never a bare symbol over raw source"
    - "a pin is proven by a mutation LOOP over the whole derived corpus, with the iteration count asserted, not by one hand-run sample"
    - "when a control's soundness rests on a measurement, ASSERT the measurement in the test so the guarantee cannot expire silently"
    - "widening a glob that a tripwire keyed on requires re-establishing the tripwire on the narrower set, in the same change"

key-files:
  created: []
  modified:
    - test/win-cmd-shim.test.cjs
    - test/transcript-project-dir.test.cjs
    - test/hook-auth-roundtrip.test.cjs
    - test/ci-config.test.cjs
    - .github/workflows/release.yml
    - SECURITY.md

key-decisions:
  - "The transcript case is SPLIT, not skipped. A skip on the whole test would have dropped the half that runs and asserts on every platform — trading one non-run for another."
  - "The mutation loop's cardinality is asserted as `mutated === shims.size` plus `mutated >= 6`, not as a hardcoded 6. The plan offered both; the derived form cannot go stale when a seventh shim lands, and combined with the pre-existing `shims.size >= 6` floor it yields the same guarantee."
  - "The comment-strip's safety is an ASSERTION (`no shim body contains `://``), not a recorded measurement. A `//` strip cuts to end of line; if a future shim gains a URL the suite says so instead of silently truncating the line the pin reads."
  - "The installers tripwire fails with `::error::` + `exit 1`, replacing an `exit 0`. A release that built a feed and no installer is a short publish, and it is the only place in the job where that is distinguishable from a correct one."
  - "test/proc-kill.test.cjs was NOT converted. Rewriting it onto node:test also removes it from test/repo-claims.test.cjs's poisoned-assert loop — a different guarantee, in a file no plan in this set owns."
  - "README.md and RELEASE.md were re-read and deliberately NOT edited: both speak about artifacts named in SHA256SUMS.txt, so both became more accurate, not less."

metrics:
  duration: 21m
  tasks: 3
  files: 6
  completed: 2026-08-22
---

# Phase 01 Plan 30: Make the Phase's Own Verification Surface Tell the Truth — Summary

Two win32 non-runs are now counted by the runner (one skipping on win32, one on POSIX), the
`sock_token` pin that a comment satisfied is now an assignment-shaped match over comment-stripped
source proven red for all six shims by mutating the real `hive.ts`, the CI test command is pinned
byte-for-byte, and the electron-updater feed is inside the attestation with the "built nothing"
tripwire restored.

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | `a588667` | `test(01-30): two win32 non-runs become runner-counted, and the shim pin stops being satisfiable by a comment` |
| 2 | `ba596ae` | `test(01-30): pin the CI test command byte-exact, and pin the hashed globs to the uploaded ones (RED)` |
| 3 | `af692a7` | `fix(01-30): hash everything the release ships, keep the tripwire, scope the claim (GREEN)` |

Commit 2 lands deliberately RED (the coverage pin), commit 3 turns it green. That ordering is the
plan's, and it is what makes the pin's failure mode observable rather than asserted.

## Gate greps — HEAD (`dcc907e`) vs now, both run this session

```
GATE                          FILE                                    HEAD  NOW
skip:                         test/win-cmd-shim.test.cjs              0     1
skip:                         test/transcript-project-dir.test.cjs    0     1
skip: true                    test/win-cmd-shim.test.cjs              0     0   <- must stay 0
skip: true                    test/transcript-project-dir.test.cjs    0     0   <- must stay 0
stripLineComments             test/hook-auth-roundtrip.test.cjs       0     6
sock_token["']?               test/hook-auth-roundtrip.test.cjs       0     1
=== 'npm test'                test/ci-config.test.cjs                 0     1
hashedGlobs                   test/ci-config.test.cjs                 0     5
*.blockmap latest*.yml        .github/workflows/release.yml           0     1
installers=                   .github/workflows/release.yml           0     1
pre-change releases           SECURITY.md                             0     1
```

Nine gates moved 0 → non-zero. The two `skip: true` gates read the same before and after **and that
is the point of them** — they are prohibitions, not targets. They did not measure nothing: the first
draft of both conversions carried the string `{ skip: true }` inside an explanatory COMMENT, the gate
caught it at 1/1, and both comments were rephrased. That is the same trap 01-27 and 01-28 hit with
`queueFile`/`persistQueues`.

Plan verifiers (not grep):

```
verify artifacts  .../01-30-PLAN.md   HEAD: 0/6   now: 6/6   all_passed: true
verify key-links  .../01-30-PLAN.md   HEAD: 0/2   now: 2/2   all_verified: true
```

## Task 1 — the win32 non-runs, and the shim pin

### The both-polarity sweep, re-run rather than inherited

`grep -rnE "platform\s*(===|!==)\s*['\"]win32" test/` (29 hits) and
`grep -rn "process\.exit(" test/*.test.cjs` (12 hits), every hit adjudicated:

**CONVERTED (1)**
- `test/win-cmd-shim.test.cjs:167` — `if (process.platform === 'win32') return;` inside a `node:test`
  callback. A callback that returns normally is a PASS, so on win32 this reported `ok` having
  executed **not one assertion**. Now `{ skip: process.platform === 'win32' && '<reason>' }`.
  **Runs on POSIX, skips on win32.**

**SPLIT (1)**
- `test/transcript-project-dir.test.cjs:122` — `if (process.platform !== 'win32') return;` in the
  MIDDLE of `'a legacy-only install still resolves…'`. Its first `withHome(…)` block runs everywhere;
  the second never ran on ubuntu or macOS while the case reported `ok`. Split into
  `'the POSIX legacy spelling stays inert on win32, even as the only directory present'` with
  `{ skip: process.platform !== 'win32' && '<reason>' }`. **Runs on win32, skips on POSIX** — the
  mirror polarity. A skip on the whole case would have dropped the half that asserts everywhere.

**NAMED, NOT CONVERTED (1)**
- `test/proc-kill.test.cjs:29-39` — module-scope `if (process.platform === 'win32') { … process.exit(0); }`.
  See the handoff section below.

**ALREADY CORRECT — runner-counted (9 hits)**
- `net-binding.test.cjs:460, 538, 563, 582, 599, 617, 653, 749` — `t.skip('<reason>'); return;`
  inside the callback. The runner reports a `t.skip()` case as skipped, so these are counted, not
  silent.
- `net-binding.test.cjs:907` — `skip: process.platform === 'win32'`, plan 01-24's conversion.
- Separately, the frozen `{ skip: !POSIX }` four, re-derived with `grep -rn "{ skip: !POSIX }" test/`
  (they carry no `platform ===` on their own line, so the sweep hits their `POSIX` consts instead):
  `hive-hook-node.test.cjs:153` *('a hook fires with NO node on PATH, and its payload reaches HIVE_SOCK')*,
  `hive-runtime-path.test.cjs:83` *('`node` resolves and RUNS with no node on PATH — the whole point')*,
  `hook-auth-roundtrip.test.cjs:95` *('the real shim authenticates to the real hook server')*,
  `hook-auth-roundtrip.test.cjs:128` *('a shim with no token is still rejected')*.

**NOT AN INSTANCE — platform-conditional VALUES, or inline case guards where both arms assert or log (15 hits)**
- `cli-install-ladder:26` · `engine-parity:238, 320, 578` · `expand-tilde:149` · `hive-hook-node:28`
  · `hive-runtime-path:26` · `hive-windows-prompt:69` · `hook-auth-roundtrip:42` · `hooks-notify:75`
  · `main-hardening:110` · `net-binding:114, 308, 722` · `transcript-project-dir:57`.
  `net-binding:308` and `:722` are `if/else` blocks whose non-win32 arm asserts or logs;
  `hive-hook-node:28`, `hive-runtime-path:26` and `hook-auth-roundtrip:42` are the `POSIX` consts the
  frozen four are built from.

**PROSE IN THIS PLAN'S OWN NEW COMMENTS (2 hits)** — `transcript-project-dir:130`,
`win-cmd-shim:168`, each quoting the bare `return` it replaced.

1 + 1 + 1 + 9 + 15 + 2 = 29, the full sweep. The 12 `process.exit(` hits are hand-rolled harnesses'
own exit codes (`breaker`, `kg-core`, `realtime-findcard`, `slack`, `transcript-usage`,
`voice-messages`, `agent-provider`), `proc-kill:38` (row 1 of the handoff) and `proc-kill:110` (that
harness's own exit), or string literals describing shim behaviour — not platform gates.

**After the change, zero bare-`return` platform non-runs remain in `test/`.**

### The conditional-skip control — proven, not intended

`{ skip: true }` would satisfy the frontmatter gate, be "counted by the runner", and delete the other
platform's coverage outright. The control poisons the converted case's own assertion and runs the file
on BOTH polarities (`--require` a preload that loads node-pty's native binding first, then redefines
`process.platform`):

```
FILE test/win-cmd-shim.test.cjs                    (SKIPS on win32, RUNS on POSIX)
-- unpoisoned --
  this host (win32)          exit=0  ok 9 - the win32 branch is genuinely platform-gated # SKIP this case asserts the NON-win32 short-circuit…
  forced platform=linux      exit=0  ok 9 - the win32 branch is genuinely platform-gated
-- assertion poisoned --
  this host (win32)          exit=0  ok 9 - the win32 branch is genuinely platform-gated # SKIP …
  forced platform=linux      exit=1  not ok 9 - the win32 branch is genuinely platform-gated
  => poisoned: win32 exit=0, linux exit=1

FILE test/transcript-project-dir.test.cjs          (RUNS on win32, SKIPS on POSIX)
-- unpoisoned --
  this host (win32)          exit=0  ok 7 - the POSIX legacy spelling stays inert on win32, even as the only directory present
  forced platform=linux      exit=0  ok 7 - … # SKIP this case asserts a win32-only rule…
-- assertion poisoned --
  this host (win32)          exit=1  not ok 7 - the POSIX legacy spelling stays inert on win32, even as the only directory present
  forced platform=linux      exit=0  ok 7 - … # SKIP …
  => poisoned: win32 exit=1, linux exit=0
  restored | identical: true
```

Both files restored byte-identically. An unconditional skip would be `exit=0` in all four poisoned
cells; each of these has exactly one `exit=1`, on the polarity that runs.

### The shim pin

`assert.match(body, /sock_token/)` over RAW source was satisfiable by a commented-out
`// payload.sock_token = …`, and it was the ONLY pin on five of the six shims. Replaced with:

- `stripLineComments(src)` — block comments whole, then `//` to end of line. **The name is
  load-bearing**: it is this plan's frontmatter gate on the file.
- `ASSIGNS_SOCK_TOKEN = /(^|[^\w$])["']?sock_token["']?\s*[:=]\s*["'`\w$(]/` — an assignment with a
  value that starts something. Both live shapes match: `payload.sock_token = process.env.…` (four
  templates) and `sock_token: process.env.…` inside an object literal (two).
- `READS_SOCK_TOKEN_ENV` — the same stripped treatment for the env read, requiring
  `process.env.HIVE_SOCK_TOKEN` (or the bracket form), not a bare mention of the name.
- `assertNoUrlsInShims(shims)` — **asserts** `(body.match(/:\/\//g) || []).length === 0` for every
  template before either match. The `://` count is 0 across all six today; asserting it means a future
  shim that gains a URL fails loudly rather than having its line silently truncated by the strip.

The six templates are re-derived by `shimTemplates()` at run time, not hardcoded — they are
`HOOK_SHIM`, `AGY_HOOK_SHIM`, `PI_EXTENSION`, `OPENCODE_PLUGIN`, `PROXY_BRIDGE_SHIM`,
`GROK_HOOK_SHIM`, with live assignments at `src/main/hive.ts:3789, :3859, :3912, :3951, :4013, :4239`
(01-26 moved every one of them; the plan's `:3635…` anchors are stale and were not used).

**6 green then 6 red — the in-suite loop, from the TAP:**

```
ok 4 - commenting out the sock_token assignment turns the pin RED, in every shim
# HOOK_SHIM          pin-green-at-HEAD=true  pin-red-when-commented=true
# AGY_HOOK_SHIM      pin-green-at-HEAD=true  pin-red-when-commented=true
# PI_EXTENSION       pin-green-at-HEAD=true  pin-red-when-commented=true
# OPENCODE_PLUGIN    pin-green-at-HEAD=true  pin-red-when-commented=true
# PROXY_BRIDGE_SHIM  pin-green-at-HEAD=true  pin-red-when-commented=true
# GROK_HOOK_SHIM     pin-green-at-HEAD=true  pin-red-when-commented=true
```

The loop also asserts, per shim, that the bare-symbol pin it replaced **still matches the mutant** —
that is the demonstration that the old pin was vacuous, not merely weaker. Iteration count is asserted
as `mutated === shims.size` and `mutated >= 6`.

**And the real thing, not only the predicate.** The loop proves the regex; this proves `npm test`.
Each of the six assignments was commented out in the REAL `src/main/hive.ts`, one at a time, and the
real test file run against it:

```
shims found: 6 -> HOOK_SHIM@3789, AGY_HOOK_SHIM@3859, PI_EXTENSION@3912, OPENCODE_PLUGIN@3951, PROXY_BRIDGE_SHIM@4013, GROK_HOOK_SHIM@4239
HOOK_SHIM          line  3789 commented -> exit 1 RED  (correct)
AGY_HOOK_SHIM      line  3859 commented -> exit 1 RED  (correct)
PI_EXTENSION       line  3912 commented -> exit 1 RED  (correct)
OPENCODE_PLUGIN    line  3951 commented -> exit 1 RED  (correct)
PROXY_BRIDGE_SHIM  line  4013 commented -> exit 1 RED  (correct)
GROK_HOOK_SHIM     line  4239 commented -> exit 1 RED  (correct)
restored src/main/hive.ts identical: true
```

The two `{ skip: !POSIX }` cases at `:95` and `:128` were not touched.

## Task 2 — the CI test command, and the hashed-vs-uploaded coverage

**`npm test`, byte-exact**, added to *'the `test` matrix is a hard gate on all three platforms…'*,
copying the lint test's idiom verbatim
(`steps.filter((s) => String(s.run || '').trim() === 'npm test')`), plus a `mentionsSuite` count so a
job that never invokes the suite at all is a distinct failure. Proven RED by rewriting `ci.yml`'s step
on disk, reported per failing test name because the coverage pin in the same file was deliberately red
at that moment:

```
-- unmutated control --
  run: npm test                          gate-test RED=false
-- disarmed --
  run: npm test || true                  gate-test RED=true
  run: npm test || echo "flaky, see #NNN" gate-test RED=true
  run: npm test | tee out.log            gate-test RED=true
  run: npm test; exit 0                  gate-test RED=true
restored .github/workflows/ci.yml | identical: true
```

`continue-on-error` is absent in all four. This is the disarm door the existing assertions could not
see, and it is the more important of the two.

**The coverage pin.** `uploadedGlobs` is PARSED (`with.path` is real YAML); `hashedGlobs` is
regex-extracted from the `files=$(ls … 2>/dev/null` line inside a `run:` block scalar, because a parse
cannot reach inside one. The extraction's own match is asserted. Normalisation strips exactly one
leading `dist/`, justified by an assertion that `Generate checksums` still contains `cd dist` —
from the file, not from a comment. One named exclusion, `NOT_HASHABLE = ['SHA256SUMS-*.txt']`, because
the checksums file cannot hash itself. Both cardinalities pinned: `uploadedGlobs.length === 7`
absolutely, and `hashedGlobs.length === uploadedGlobs.length - NOT_HASHABLE.length` relationally, so a
silently SHORTENED upload list cannot make the subset check pass by having less to cover.

RED before task 3, for exactly the right reason:

```
✖ every glob a release uploads is inside the file the attestation signs
  AssertionError: these globs are UPLOADED to the release but never hashed into SHA256SUMS.txt:
  *.blockmap, latest*.yml …
  + actual - expected
  + [ '*.blockmap', 'latest*.yml' ]
  - []
```

GREEN after task 3: `test/ci-config.test.cjs` 14 tests / 14 pass / 0 fail.

## Task 3 — the release feed inside the attestation, and the tripwire back

`Generate checksums` hashed 4 globs; `Upload build artifacts` ships 7. `*.blockmap` and `latest*.yml`
were outside `SHA256SUMS.txt`, and `SHA256SUMS.txt` is the attestation's whole subject —
`latest*.yml` is the electron-updater feed carrying the sha512 the updater validates a download
against, so the automatic update path was the one path with no provenance at all.

The `ls` list is now `*.dmg *.zip *.exe *.AppImage *.blockmap latest*.yml`, and
`[ -z "$files" ] && { echo "no artifacts to hash"; exit 0; }` is replaced by a SEPARATE
`installers=$(ls *.dmg *.zip *.exe *.AppImage …)` check that fails loudly. Driven against the real
step body, extracted from the parsed workflow and run under bash in a temp dir:

```
CASE A: nothing built at all
  exit=1  dist=[]
      ::error::no installers (*.dmg *.zip *.exe *.AppImage) in dist/ — refusing to publish an attested update feed with nothing to install
CASE B: an update feed and NO installer (the exposure the widening creates)
  exit=1  dist=[app-1.0.0.exe.blockmap latest.yml]
      ::error::no installers …
CASE C: a real linux build
  exit=0  dist=[SHA256SUMS-ubuntu-latest.txt app-1.0.0.AppImage app-1.0.0.AppImage.blockmap latest-linux.yml]
      8be1dd55… *app-1.0.0.AppImage
      d38badd2… *app-1.0.0.AppImage.blockmap
      6608edc3… *latest-linux.yml
```

For contrast, the OLD step body on that same case B: `exit=0`, `no artifacts to hash`, and **no
`SHA256SUMS-*.txt` written at all** — the job would have gone on to upload a feed with no checksums
behind it. (Case B also confirms `*.exe` does not match `app-1.0.0.exe.blockmap`, so a blockmap alone
never satisfies the installer check.)

Nothing else in the job was restructured: `Flatten + merge checksums` already copies both new patterns
into `release/`, and `Attest build provenance` already takes `subject-checksums: release/SHA256SUMS.txt`
after the merge and before the upload.

**SECURITY.md** now states the control's real scope: what the attestation covers after the widening
(installers, blockmaps, the `latest*.yml` feed), that **you** have to run `gh attestation verify` and
nothing in the app does it, that attesting the feed makes it checkable-by-a-human rather than
self-verifying, and that **pre-change releases carry an unattested update feed**.

`README.md:170-185` and `RELEASE.md:38-52` were re-read and NOT edited — both speak only about
artifacts named in `SHA256SUMS.txt`, so both became more accurate. Anchors recorded here for 01-31's
doc-residual sweep; no STOP was required.

## Suite delta — this host (win32), measured before and after in this session

```
                 # tests   # pass   # fail   # skipped
BEFORE (dcc907e)     623      617        0           6
AFTER  (af692a7)     626      619        0           7
delta                 +3       +2        0          +1
```

The arithmetic closes exactly, and **`# pass` did not simply go up**:

| change | tests | pass | skipped |
|---|---|---|---|
| `win-cmd-shim` conversion (skips on win32) | 0 | **−1** | +1 |
| `transcript-project-dir` split (runs on win32) | +1 | +1 | 0 |
| the six-way shim mutation loop (new case) | +1 | +1 | 0 |
| the checksum-coverage pin (new case) | +1 | +1 | 0 |
| **total** | **+3** | **+2** | **+1** |

The `−1` is the change working: that case previously reported `ok` on win32 having asserted nothing.

**On the ubuntu and macOS CI rows the same edits read differently**, and this is stated as an
expectation, not as a measurement — no POSIX host ran here:
`win-cmd-shim` +1 pass (it runs there), `transcript-project-dir` +1 **skipped** (it skips there), the
two new cases +1 pass each. So POSIX should read `# tests +3, # pass +3, # skipped +1`.

The seven skipped cases on this host, from the TAP:

1. `hive-hook-node.test.cjs:153` — *a hook fires with NO node on PATH…* (`{ skip: !POSIX }`)
2. `hive-runtime-path.test.cjs:83` — *`node` resolves and RUNS with no node on PATH…* (`{ skip: !POSIX }`)
3. `hook-auth-roundtrip.test.cjs:95` — *the real shim authenticates to the real hook server* (`{ skip: !POSIX }`)
4. `hook-auth-roundtrip.test.cjs:128` — *a shim with no token is still rejected* (`{ skip: !POSIX }`)
5. `net-binding.test.cjs` — *a LEAF symlink pointing at the shim from outside the hive is denied*
   (**runtime** `t.skip` on EPERM: symlink needs elevation/Developer Mode — an ENVIRONMENT skip, not a
   platform one, and therefore **not** a member of the frozen set)
6. `net-binding.test.cjs:907` — *deleting the hook socket no longer opens the gate until the app restarts* (01-24)
7. `win-cmd-shim.test.cjs` — *the win32 branch is genuinely platform-gated* (**new, this plan**)

**Plan 01-31 owns the authoritative whole-suite figure and must derive it from the TAP counter on its
own host at its own point in the wave, not from this table.** `01-VALIDATION.md` still pins
`# skipped 4` and was NOT edited here — raising it is 01-31's, and the honest input is: the frozen
`{ skip: !POSIX }` set is still exactly the four titles above; item 5 is environment-conditional and
will not appear on a runner with symlink permission; items 6 and 7 are the two platform conversions
this wave added.

## Other gates

- `npm run typecheck` — exit 0.
- `npx eslint . --max-warnings 0` — exit 0.
- Full suite — 0 failures. No pre-existing failure baseline was inherited; the before-figure above was
  measured in this session at `dcc907e`.

**MEASUREMENT UNAVAILABLE — `gh attestation verify` against a published artifact.** The publish job is
gated on `refs/tags/v*` and no tag has been pushed. This plan makes the ATTESTED SET correct; it does
not and cannot demonstrate a live verification. The parsed pin is a pin on the workflow, not a
verification of an attestation, and must not be read as one.

## Residuals handed to plan 01-31's register — BY NAME

Plan 01-31 task 3 sweeps this file for residuals. Three rows, each with an owner that is a follow-up
plan, never the operator.

### 1. `test/proc-kill.test.cjs` — FIVE cases invisible to the TAP counters on EVERY platform

`if (process.platform === 'win32') { … process.exit(0); }` at `:29-39`, at MODULE scope, before any
test is defined — so its five cases at `:65-103` never execute on win32. And because the file defines
its own `test()` at `:59` and does **not** `require('node:test')` (measured this session: 0
occurrences), those five cases appear in **neither `# pass` nor `# skipped` on ANY platform**. The file
contributes exactly one top-level test point to the suite.

Arithmetic: **five** silent non-runs, which is more than the two the *"the published `531 pass` figure
is an honest floor"* gap enumerated — same defect class as `c/CR-01`.

Declined here for a real reason, not for convenience: converting it means rewriting the file onto
`node:test`, which also removes it from `test/repo-claims.test.cjs:169-196`'s poisoned-assert loop — a
different guarantee, in a file no plan in this gap-closure set owns. The fix is two-part: (a) rewrite
onto `node:test`, (b) re-establish the poisoned-assert coverage the rewrite removes.

**Owner: a follow-up plan holding `test/proc-kill.test.cjs` AND `test/repo-claims.test.cjs`. The two
halves cannot be done separately. NOT the operator.**

### 2. `test/engine-parity.test.cjs` — byte-level drive for the five shims that have only a source-text pin

`test/engine-parity.test.cjs:288-330` drives `PROXY_BRIDGE_SHIM` end to end — writes the generated
shim, runs it, asserts the bytes on the wire, and asserts `lines.length === 1` before parsing, so it
cannot go vacuous. That is the only assertion shape source text cannot satisfy.

The other five — `HOOK_SHIM`, `AGY_HOOK_SHIM`, `PI_EXTENSION`, `OPENCODE_PLUGIN`, `GROK_HOOK_SHIM` —
rest entirely on this plan's comment-stripped, assignment-shaped pin. That is a large improvement on
the bare grep it replaces and it is still source text: it proves the template *says* the right thing,
never that the shim *sends* it. Not in this plan because it needs five engine harnesses and
`test/engine-parity.test.cjs` has no owner in this gap set.

**Owner: a follow-up plan holding `test/engine-parity.test.cjs`. NOT the operator.**

### 3. NEW, found while executing — `test/win-cmd-shim.test.cjs`'s converted case asserts an outcome it cannot attribute

Discovered while producing the "runs and asserts" evidence, and reported rather than papered over.
The case *'the win32 branch is genuinely platform-gated'* now runs on POSIX and its two assertions
execute (proven by the poisoned-assertion control above: the poison fires there). But **deleting the
guard it names does not turn it red.** Measured this session by commenting out
`src/main/pty.ts:573`'s `if (process.platform !== 'win32') return null;` and re-running the
forced-POSIX control:

```
guard PRESENT (control)   exit=0  ok 9 - the win32 branch is genuinely platform-gated
guard DELETED (mutant)    exit=0  ok 9 - the win32 branch is genuinely platform-gated
```

Cause: `SHIM` is the fabricated path `C:\Users\Tester\AppData\Roaming\npm\opencode.cmd`, which exists
on no host, so `resolveWindowsShimSpawn` returns `null` from its `statSync` catch whether or not the
platform guard is there. The case pins the OUTCOME (`null`) and not the REASON (short-circuit before
the filesystem), which is what its title claims.

Deliberately not fixed here. The strengthening needs a real on-disk `.cmd` fixture, and the only
branch that would yield a non-null result on a real POSIX runner is the direct-executable one
(`target.interpreter === null`) — the interpreter branch returns null on POSIX anyway, because
`resolveCommand('node')` there resolves to a path that is not `.exe`/`.com`. Building that fixture
blind, on a host that cannot execute the POSIX arm, risks a false RED on the ubuntu and macOS CI rows,
which is a worse outcome than a weak-but-honest assertion. It is in scope for the same follow-up as
row 2 (both are "a source-text/outcome pin that needs a real drive").

**Owner: a follow-up plan holding `test/win-cmd-shim.test.cjs` and `src/main/pty.ts`, with a POSIX
runner available. NOT the operator.**

## Also for 01-31 — not residuals, but anchors it will need

- **`01-VALIDATION.md` pins `# skipped 4` and forbids a `>=` clause.** Not edited here, by
  instruction. The new figure on this win32 host is **7**, of which 4 are the frozen `{ skip: !POSIX }`
  set (titles listed above), 1 is `net-binding.test.cjs:907` (01-24), 1 is this plan's `win-cmd-shim`
  conversion, and 1 is an ENVIRONMENT skip (`EPERM` on `symlinkSync`) that will not appear on a runner
  with symlink permission. On a POSIX runner the platform set is different: the
  `transcript-project-dir` split skips there and `win-cmd-shim` does not.
- **Doc anchors re-read and found accurate, no change needed:** `README.md:170-185`
  (*"Together those prove an artifact was built from this repository"* — scoped to artifacts beside
  `SHA256SUMS.txt`) and `RELEASE.md:42-48` (*"every artifact named in it can be traced back"* — the
  quiet tell, not a false claim). Both became MORE accurate after task 3.
- **`c/WR-02` is only partly closed.** The review names four failure-swallowing settings composing
  into a short attestation with every check green. This plan restored ONE of them — the
  built-nothing tripwire, now `installers=` + `::error::` + `exit 1` at
  `.github/workflows/release.yml:161-165`. Still open, and NOT touched here:
  `Upload build artifacts`'s `if-no-files-found: warn` (`release.yml:180`), `Publish to GitHub
  Release`'s `fail_on_unmatched_files: false` (`release.yml:238`), and `Flatten + merge checksums`'s
  `cat … 2>/dev/null || true` (`release.yml:200`), which still lets an empty `SHA256SUMS.txt` reach
  the attest step from the publish side. The build-side hole is closed; the publish-side one is not.

## Deviations from Plan

**1. [Rule 3 — blocking] The plan's `hive.ts` anchors were stale; re-derived rather than used.**
- **Found during:** Task 1.
- **Issue:** `<measured_evidence>` D gives the six assignment sites as `:3635, :3705, :3758, :3797,
  :3859, :4085`. At `dcc907e` they are `:3789, :3859, :3912, :3951, :4013, :4239` — 01-26's rewrite
  moved every one.
- **Fix:** Everything is located by `shimTemplates()` and by text, never by line number, exactly as the
  plan's own instruction says. No line number from the plan was used.
- **Files:** none changed by this; it changed how the change was made.

**2. [Rule 1 — bug in my own first draft] The explanatory comments breached the `skip: true` prohibition.**
- **Found during:** Task 1, gate re-measurement.
- **Issue:** Both conversions carried the literal string `{ skip: true }` inside a comment explaining
  why the skip is conditional. `grep -Fc "skip: true"` read 1 on each file; the `<done>` clause
  requires 0.
- **Fix:** Rephrased to "an UNCONDITIONAL skip option". Re-measured: 0 and 0.
- **Commit:** `a588667`.

**3. [Rule 2 — the assertion's failure mode had to be observable] The coverage pin's assertions were reordered.**
- **Found during:** Task 2.
- **Issue:** With the cardinality assertions first, the RED read `4 !== 6` — true, but it says nothing
  about WHICH globs ship unattested, and the plan's evidence requirement is the missing set.
- **Fix:** The `missing` deep-equal now runs first (the substantive claim), the cardinality pins after
  (the anti-vacuity guard). RED now names `*.blockmap, latest*.yml` directly.
- **Commit:** `ba596ae`.

**4. [judgement call, recorded] The mutation loop's cardinality is derived, not hardcoded to 6.**
- The `<done>` clause says *"with its iteration count asserted as 6"*; the task action offers *"or
  assert against `shims.size` after the existing `>= 6` floor"*. Took the second: the loop asserts
  `mutated === shims.size` and `mutated >= 6`, and `shims.size >= 6` is already asserted in both tests.
  Same guarantee, and it does not go stale when a seventh shim lands — which is the whole reason
  `shimTemplates()` is derived in the first place.

No authentication gates occurred. No architectural changes were needed, so no Rule 4 stop.

## Threat model — dispositions, measured

| Threat ID | Disposition | Evidence in this SUMMARY |
|---|---|---|
| T-P30-01 | mitigated | Two conversions + the both-polarity sweep with all 29 hits adjudicated; the third named with its anchor, its arithmetic and its two-part fix. |
| T-P30-02 | mitigated | Comment-stripped, assignment-shaped pin; 6 green / 6 red in-suite AND against the real `hive.ts`; the strip's `://` precondition asserted. |
| T-P30-03 | mitigated | Byte-exact `=== 'npm test'`, RED under four disarm shapes, green unmutated. |
| T-P30-04 | mitigated | Hashed set widened to the uploaded set; parsed pin with a file-justified normalisation, one named exclusion, both cardinalities. |
| T-P30-05 | mitigated | `installers=` split out; case B (feed + blockmap, no installer) exits 1 where the old step exits 0. |
| T-P30-06 | mitigated | SECURITY.md states coverage, the manual-action limit, and pre-change releases. |
| T-P30-07 | accepted + documented | The coverage pin regex-matches a shell line inside a `run:` block; a legitimate reformat (a `for` loop, a `PATTERNS=` variable, a heredoc) breaks the extraction and turns the test red on a correct change. The extraction assertion makes that loud rather than silent, which is the right trade — but it is a ceiling, not durability against refactors. |
| T-P30-08 | accepted + documented | `c/WR-02`'s remaining three settings, anchored above. |
| T-P30-SC | mitigated | No package installs. `package.json` untouched; the workflow change adds no action and no dependency. |

## Known Stubs

None. No placeholder values, no unwired data paths, no TODO/FIXME introduced.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema at a trust boundary was
introduced. The `release.yml` change narrows what can be published, and the SECURITY.md change
describes surface that already existed.

## Self-Check: PASSED

Every file this SUMMARY names exists on disk, and all three commit hashes resolve in `git log`.

```
FOUND:   .planning/phases/01-finish-the-floor/01-30-SUMMARY.md
FOUND:   test/win-cmd-shim.test.cjs
FOUND:   test/transcript-project-dir.test.cjs
FOUND:   test/hook-auth-roundtrip.test.cjs
FOUND:   test/ci-config.test.cjs
FOUND:   .github/workflows/release.yml
FOUND:   SECURITY.md
FOUND:   a588667   FOUND:   ba596ae   FOUND:   af692a7
```
