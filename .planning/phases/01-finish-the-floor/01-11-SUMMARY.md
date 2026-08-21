---
phase: 01-finish-the-floor
plan: 11
subsystem: hive-git
tags: [security, secrets, git, floor-04, adr-0004]
requires:
  - "redactSecrets (src/main/hive.ts) — the single sanitiser, mail-only until now"
  - "flushCommit / gitAsync — the single-committer commit path (ADR-0004)"
  - "test/hive-durability.test.cjs — the existing real-git harness"
provides:
  - "scrubStagedSecrets(): a redactSecrets-driven check between `git add -A` and `git commit`"
  - "harnessAuthored(): byte-identity suppression of the shim false positive"
  - "unstagePath(): `git restore --staged` with an unborn-HEAD `rm --cached` fallback"
  - "4 real-git integration tests pinning the clause AND the matcher's honest ceiling"
affects:
  - "every hive commit — one extra `git diff --cached --numstat` plus, when clean, one `--unified=0` diff"
tech-stack:
  added: []
  patterns:
    - "scrub at the single choke point, never per-caller"
    - "fail-open when the scrub cannot LOOK; fail-closed when it FOUND something it cannot fix"
    - "bound the work before it exists as a string (--numstat before the content diff)"
key-files:
  created: []
  modified:
    - "src/main/hive.ts (+178, 0 deletions)"
    - "test/hive-durability.test.cjs (+126, 0 deletions)"
decisions:
  - "scrub inside flushCommit's retry loop, not above it — every attempt re-runs `add -A`"
  - "reuse redactSecrets unchanged; REDACT-BODY hash byte-identical, LOCKSTEP branch (a)"
  - "scan ADDED lines only — flagging a removal would unstage a deletion and wedge the committer"
  - "harnessAuthored() byte-identity against the INDEX blob, not a path allowlist and not disk"
metrics:
  duration: "~1h55m"
  completed: 2026-08-21
  tasks: 3
  files: 2
  commits: 2
---

# Phase 01 Plan 11: Scrub Secrets at the Commit Choke Point — Summary

`redactSecrets` was mail-only; the hive's committer was a bare `git add -A` over an agent's
workspace with no content inspection. A `scrubStagedSecrets()` pass now runs the staged diff
through that same matcher between `add -A` and `commit` inside `flushCommit` — the one place
ADR-0004's single-committer model routes every hive write through — unstaging offending paths
and logging loudly, proven by four real-git integration tests with a RED control.

**B-sha: `1687ed6722e3f20833b36b6f619c66c49289e099`** (recorded before any edit).

## Commits

| Commit | Task | Files |
|---|---|---|
| `c15dcd4` | Task 2 — the scrub at the choke point | `src/main/hive.ts` |
| `a9db6b9` | Task 3 — real-git integration tests | `test/hive-durability.test.cjs` |

Task 1 was evidence-only (no files), per the plan.

---

## Task 1 — evidence that the clause was open

`redactSecrets` had **no caller on the commit path**. That absence is the evidence:

```
$ grep -n "redactSecrets" src/main/*.ts
src/main/accountPool.ts:70:  /** Secret-shape redaction for the error text we keep/log (redactSecrets). */
src/main/hive.ts:69: *  REDACTED main-side (see {@link redactSecrets}) before this ever leaves the
src/main/hive.ts:380:export function redactSecrets(text: unknown): string {
src/main/hive.ts:2196:   * SECURITY: every subject + body is passed through redactSecrets() here, in
src/main/hive.ts:2243:            subject: redactSecrets(m.subject),
src/main/hive.ts:2244:            body: redactSecrets(m.body),
src/main/index.ts:30:import { HiveManager, redactSecrets, ... } from './hive';
src/main/index.ts:411:  sanitize: redactSecrets
```

Two live call sites (`:2243`, `:2244`, both in `voiceMessages()`), one `sanitize:` wiring
(`index.ts:411`), two comments. Nothing in `flushCommit`.

```
$ grep -n "add', '-A'" src/main/hive.ts
3105:        const add = await this.gitAsync(['add', '-A'], root);

$ grep -n "UNTRACK_PATHS\|untrackIgnored" src/main/hive.ts
330:const UNTRACK_PATHS = ['cost-ledger.jsonl', 'log.jsonl', 'log.jsonl.1', 'backups'];
3030:  private async untrackIgnored(root: string): Promise<void> {
3035:    const tracked = await this.gitAsync(['ls-files', '--', ...UNTRACK_PATHS], root);
3037:    await this.gitAsync(['rm', '--cached', '-r', '-q', '--ignore-unmatch', ...
3101:      await this.untrackIgnored(root);
```

### Recorded baselines

| Baseline | Value |
|---|---|
| `grep -c "redactSecrets" src/main/hive.ts` | **5** (as the plan predicted) |
| `grep -c -- "--staged" src/main/hive.ts` | **0** |
| `grep -c "diff --cached" src/main/hive.ts` | **0** |
| **B-durability** (`# pass`, `test/hive-durability.test.cjs`) | **6** — `EXIT=0`, `# tests 6 / # pass 6 / # fail 0 / # skipped 0 / # todo 0` |
| REDACT-BODY | `c9c1cf47f0eb87da8d706662e80fdefbaef82c75` — matches the plan's recorded hash exactly |

B-durability is **6**, i.e. plan 08's wave-4 FLOOR-09 wiring pin is present and intact. Not a
STOP-and-report.

### Anchor drift — every anchor re-derived by content match

Three waves of edits landed above these. The plan's numbers were all stale:

| Symbol | Plan-time | **Live at B-sha** | Drift |
|---|---|---|---|
| `UNTRACK_PATHS` | `:274` | **`:330`** | +56 |
| `redactSecrets` | `:324` | **`:380`** | +56 |
| `gitAsync` | `:2627` | **`:2992`** | +365 |
| `untrackIgnored` | `:2665` | **`:3030`** | +365 |
| `commit(message)` | `:2698` | **`:3063`** | +365 |
| `scheduleCommit` | `:2705` | **`:3070`** | +365 |
| `flushCommit` | `:2730` | **`:3095`** | +365 |

### `redactSecrets` pattern inventory — read from source, then measured

Five patterns. What each **actually** does, verified by running the real function over fixtures
rather than by reading the regex:

| # | Pattern | Catches | Verified |
|---|---|---|---|
| 1 | PEM private-key blocks | `-----BEGIN … PRIVATE KEY-----` … `-----END …-----` (RSA/EC/OPENSSH/PGP) | by inspection |
| 2 | JWTs | `eyJ…` + three base64url segments | ✅ CAUGHT |
| 3 | Credential prefixes | `sk-` / `sk-ant-`, `xox[bpaors]-`, `xapp-`, `gh[posru]_`, `github_pat_`, `AKIA…`, `AIza…` | ✅ CAUGHT (`sk-ant-`, `AKIA`, `ghp_`) |
| 4 | Bearer tokens | `bearer <cred>` — keeps the label, drops the credential | by inspection |
| 5 | Sensitive `key=value` / `key: value` | `api_key`, `secret`, `token`, `password`, `client_secret`, … with an optional `aws_`/`gcp_`-style prefix run | ✅ CAUGHT (`ANTHROPIC_API_KEY=…`, `export MY_TOKEN=…`) |

### The honest ceiling, in one sentence

**This is a best-effort shape matcher, not a guarantee: it catches credentials that carry a known
vendor prefix or sit next to a recognised key name, and it misses everything else.**

Measured misses (each run through the real function):

| Shape | Result | Why |
|---|---|---|
| `sk_ant_api03_AAAA…` (underscores) | **MISS** | pattern 3 anchors on a literal `sk-`; one character is the whole gap |
| `sk_live_4eC39…` (Stripe) | **MISS** | same reason — real vendors do ship underscore-separated keys |
| `9f8e7d6c5b4a392817065f4e3d2c1b0a` | **MISS** | bare high-entropy string, no prefix and no label; the function deliberately does not redact on entropy |
| `{"token": "abcdef123456789"}` | **MISS** | **the sharpest one.** Pattern 5 needs `:`/`=` *directly* after the key name and the closing quote is in the way — and the hive commits `registry.json`, `tasks.json` and every per-agent `settings.json` |
| binary blobs | **not scanned** | `-U0` produces no `+` lines for them |

**No second pattern set was built.** Two matchers that disagree is worse than one imperfect one,
because the disagreement is silent — the commit path would quietly accept what the mail path
redacts. Stated per T-P11-03.

### FLOOR-04's issue number — the plan's premise is FALSE, reported not worked around

The plan instructs: *"Per D-42, **#10 is the Electron issue** … Task notes … confirm it is **not**
`#10`."* **That criterion cannot be satisfied, because it is factually wrong.**

`gh issue list --state open --label floor-inspection` returns 24 issues. #10 is
**"H2 — Network and secret hygiene: LAN-bound servers, plaintext secrets to the renderer,
unauthenticated hook socket, uncloseable tunnel"**. Its body contains nothing about Electron. Its
**defect 5** is FLOOR-04, verbatim:

> `CLAUDE_CODE_OAUTH_TOKEN` and broker tokens are in the child env of an LLM-controlled shell
> (`index.ts:2843`, `:4514`), and `hive.commit()` runs `git add -A` over the hive root — a token
> echoed into `memory.md` is in git history forever.
> **Fix:** a secret-scrub pass over agent-written files before `commit()`.

I searched every open `floor-inspection` issue body for the scrub clause. **#10 is the only match**,
and it is unambiguous:

```
$ for n in 61 45 42 41 39 38 36 34 32 31 26 20 19 18 16 15 13 10 5 4; do … done
### ISSUE #10 MATCHES:
22:… `hive.commit()` runs `git add -A` over the hive root — a token echoed into `memory.md` is in git history forever.
23:**Fix:** a secret-scrub pass over agent-written files before `commit()`.
```

So **FLOOR-04's resolved issue is #10**, and filing its evidence anywhere else would be filing it on
the wrong issue — the exact error the plan's criterion was written to prevent, inverted.

Two upstream doc errors follow from this and are **filed, not fixed** (neither file is mine):

1. **`.planning/REQUIREMENTS.md:20-23` maps FLOOR-03 (Electron 38+) to #10.** #10 has no Electron
   clause. The EOL-Electron issue is **#8** (*"C8 — End-of-life Electron rendering agent-authored
   content…"*), which is **CLOSED**. FLOOR-03 has no correct open issue to point at.
2. **D-42 in `01-CONTEXT.md:293-298` records #10's unmet clause as `electron` still `^32.2.0`** —
   it inherited the same mis-mapping. D-42's *reasoning* is unaffected; only that one parenthetical
   is wrong.

**#10 is NOT closed by this plan.** It carries five defects and only defect 5 is FLOOR-04. Per D-42
(per-clause bar) and D-44 (close in the PR that fixes it), a per-clause evidence comment was posted
instead — the same call plan 01-03 made for #18.

---

## Task 2 — the scrub, at the choke point

`scrubStagedSecrets()` sits **inside `flushCommit`'s retry loop**, between `add -A` and `commit`:

```
3276:         const add = await this.gitAsync(['add', '-A'], root);
3277-3282:    // FLOOR-04: the scrub sits INSIDE the retry loop, not above it, because
              // every attempt re-runs `add -A` — a scrub hoisted out would be undone
              // by the second attempt's staging and the secret would ride in on the retry.
3283:         if (!(await this.scrubStagedSecrets(root))) return;
3284:         const commit = await this.gitAsync(
3285:           ['commit', '-q', '-m', subject, ...(body ? ['-m', body] : [])],
```

**Inside the loop, not above it**, because `GIT_ATTEMPTS` is 2 and every attempt re-runs `add -A` —
a scrub hoisted out of the loop is undone by the second attempt's staging, and the secret rides in
on the retry. That is not hypothetical: the retry fires on `index.lock` contention, which is common
on Windows behind antivirus.

### How it works

1. **`git diff --cached --numstat`** — one short row per changed *path*. Summed added+deleted lines
   are checked against `SECRET_SCAN_MAX_LINES` (20,000) **before the content diff is ever pulled
   into memory**. That is the actual bound; a cap applied after buffering would not be one.
2. **`git -c core.quotePath=false diff --cached --unified=0 --no-color --no-ext-diff`**, then
   `SECRET_SCAN_MAX_BYTES` (4 MB) on the scanned text — because a line count does not bound bytes
   (one minified 10 MB line is a single line to `--numstat`). `quotePath=false` so a non-ASCII path
   comes back raw and can be handed straight back to `restore --staged`.
3. **Added lines only.** One `redactSecrets` pass over every `+` line as a fast path; only if that
   is dirty does it split per file on `^diff --git ` and resolve the path from `+++ b/<path>`.
4. Offending paths are unstaged and logged to **both** `console.warn` and the durable hive log.

### The diff-scanning bound, stated

Two bounds, both named in the code comment: **20,000 changed lines** (checked pre-buffer via
`--numstat`) and **4 MB of scanned text**. Past either, the scan is **skipped or truncated and said
out loud** (`secret-scan-skipped` / `secret-scan-truncated` on the hive log) — never skipped
silently and never presented as a clean scan.

### Failure polarity — deliberate and asymmetric

| Situation | Behaviour | Why |
|---|---|---|
| `git diff` fails | **commit anyway**, log loudly | The scrub cannot *look*. Halting every commit would take the hive's whole durability path down (T-P11-04) — worse than the risk, and nothing is lost: `commit()`'s own doc says git here is history, not storage. |
| diff over the bound | **commit anyway**, log loudly | Same. |
| secret found, path resolved, unstage OK | **commit the rest** | Per-path, not per-commit. |
| secret found, unstage **fails** | **do not commit** | We *know* a secret is staged. Committing puts it in history permanently. |
| secret found, path **unresolvable** | **do not commit** | Same. |

Summarised: **fail-open when it cannot look, fail-closed when it found something it cannot fix.**
It never throws out of the debounced flush.

### The false positive that would have shipped a broken feature

Measured, not predicted. A naive implementation unstages **the hive's own bootstrap on every
commit**:

```
TRIPS: bin/cth-hook.cjs
TRIPS: bin/hive-proxy.cjs
  FP LINE: "+  payload.sock_token = process.env.HIVE_SOCK_TOKEN || '';"
```

Both generated hook shims (written from compiled-in constants on **every** bootstrap — plan 01-06's
GATE-01 work put that line there) contain source that *reads* a token. Pattern 5 matches
`sock_token = …` on sight. Because an unstaged file stays untracked, the next `add -A` re-stages it
and the scrub fires again — **forever**. The result would be a warning on every commit about the
harness's own files, which is how an operator learns to ignore the warning that matters.

`harnessAuthored()` suppresses it by **byte-identity against the compiled-in constant**, not by path:

- It is a **proof of authorship, not an allowlist** — an agent that edits a shim to smuggle a key
  changes the bytes and the scrub fires on it like any other file.
- It compares the **INDEX blob** (`git show :path`), not the working file. That is both semantically
  right (the index is what is about to be committed) and the only form immune to `core.autocrlf`,
  which is **`true` by default on Git for Windows** — measured `true` in a fresh hive repo here.
  A `readFileSync` comparison would silently never match on Windows and quietly restore the false
  positives. This is pinned by test 2.

### `git restore --staged` does not work on an unborn HEAD — measured

```
--- unborn HEAD probe ---
restore status: 128 stderr: fatal: could not resolve HEAD
still staged after restore? YES
rm --cached status: 0 still staged? NO
```

`restore --staged` restores from HEAD, so before the first commit it exits 128 having unstaged
**nothing**. The hive's first commit stages the entire bootstrap — precisely the window a planted
secret would ride in on. `unstagePath()` therefore falls back to
`git rm --cached -q --ignore-unmatch`. Without that fallback the graded clause would fail on exactly
the highest-risk commit, and it would have looked like it worked everywhere else.

### Acceptance criteria

| Criterion | Required | Result |
|---|---|---|
| `grep -c "redactSecrets" src/main/hive.ts` | > 5 | **9** ✅ |
| `grep -c "diff --cached"` | ≥ 1 | **2** ✅ |
| `grep -c -- "--staged"` (baseline `0`) | ≥ 1 | **3** ✅ — load-bearing one is `3141: const restored = await this.gitAsync(['restore', '--staged', '--', rel], root);`, an argument array |
| **LOCKSTEP verdict** | (a) or (b) | **(a) NO WIDENING** ✅ |
| `npm run typecheck` | 0 | **0** ✅ |
| `npm test` | 0 | **0** ✅ |
| Containment | empty | **empty** ✅ |

**LOCKSTEP verdict — branch (a), no widening:**

```
REDACT-BODY=c9c1cf47f0eb87da8d706662e80fdefbaef82c75
recorded   =c9c1cf47f0eb87da8d706662e80fdefbaef82c75
VERDICT: (a) NO WIDENING
$ git diff --name-only 1687ed6..HEAD -- test/voice-messages.test.cjs
(nothing)
```

The regex battery is byte-identical, so `test/voice-messages.test.cjs` needed no mirror and was not
touched. The FALSE-POSITIVE and the ceiling were both handled **without** touching the battery —
the temptation to relax pattern 5 to make the shims stop tripping was the wrong fix and was not
taken, because pattern 5 is what redacts `aws_secret_access_key=…` on the mail path.

**Containment** (per-commit, range-bound against B-sha):

```
$ BASE=1687ed67…; SHAS=$(git log --format=%H "$BASE"..HEAD -- src/main/hive.ts test/hive-durability.test.cjs test/voice-messages.test.cjs)
SHAS walked: c011eb70… c15dcd40…
--- files outside the allowed set (must be empty) ---
[end — empty above = PASS]
```

### One criterion adapted — reported, not silently skipped

> *"`grep -n "redactSecrets" src/main/hive.ts` shows at least one hit **inside `flushCommit`**"*

**Not satisfied in the letter.** `flushCommit` calls `scrubStagedSecrets()`, which is where the two
`redactSecrets` calls live; the token is one hop away. Inlining ~110 lines of scan-and-unstage into
the debounced committer's retry loop to make a grep pass would be worse code, and the plan's own
`key_links` describes the relationship (`from: flushCommit → to: redactSecrets`) rather than
demanding textual adjacency.

The criterion's stated purpose is anti-vacuity — *"cannot be satisfied by the four call sites that
already exist."* That purpose is met by **stronger** evidence than the grep asks for:

1. **Ordering**, from a structurally-bounded slice of `flushCommit` (not a fixed line window):
   `add -A` at **3276** → `scrubStagedSecrets` at **3283** → `commit` at **3284**.
2. **The link is unbranched** — `scrubStagedSecrets` appears exactly twice in the file: its
   definition (`:3186`) and that single call (`:3283`). Not dead, not conditional, no second path.
3. **The calls are code, not comments** — inside a structurally-bounded slice of
   `scrubStagedSecrets`: `3230: if (!all || redactSecrets(all) === all) return true;` and
   `3238: if (!plus || redactSecrets(plus) === plus) continue;`.
4. **Behaviour, with a RED control** — task 3 below. This is the load-bearing evidence; the greps
   are corroboration. I did not add a comment mentioning `redactSecrets` at the call site to make
   the grep pass: a comment-shaped pass is exactly the fake plan 01-10 drove RED against.

---

## Task 3 — proof over a real temp git repo

Four tests appended to `test/hive-durability.test.cjs`. The FLOOR-09 pin from plan 01-08 was **not
touched** — appended below it, `git diff --stat` shows **126 insertions, 0 deletions**.

| # | Test | Asserts |
|---|---|---|
| 1 | the graded clause | the secret is **not** in `git log -p`, and the agent's file is **untouched on disk** (the scrub unstages; it never edits or deletes an agent's work) |
| 2 | the commit still lands | the clean sibling file **is** in history; and **both generated shims are still versioned** — the regression guard on `harnessAuthored()` |
| 3 | loud, not silent | `secret-scrubbed` on the durable hive log, **naming the path** |
| 4 | the documented ceiling | the underscore-prefix variant and the JSON pair both get through — **and**, in the same test, that the shape the matcher does know is still stopped |

Test 4's fixture pair is a controlled comparison: `MISSED_SECRET` is `CAUGHT_SECRET`'s **own key
material with `_` for `-`**, so exactly one variable differs — the literal `sk-` pattern 3 anchors
on. Its last assertion is the anti-vacuity guard: if the scrub were switched off wholesale, the
ceiling test would otherwise pass for entirely the wrong reason.

No `git` is mocked or faked anywhere — real `spawnSync('git', …)` against a real temp repo:

```
222:const { spawnSync } = require('node:child_process');
226:  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
```

(the single `mock|fake` grep hit is line 218, the comment saying so.)

### RED → GREEN

RED, with `src/main/hive.ts` restored to B-sha `1687ed6` (scoped to this plan's own path via
`git checkout 1687ed6 -- src/main/hive.ts`, never a bare stash):

```
RED EXIT=1
# tests 10 / # pass 6 / # fail 4 / # skipped 0 / # todo 0
not ok 7  - a secret an agent writes into its workspace never reaches the hive git history (FLOOR-04)
not ok 8  - the scrub drops the offending path only — the rest of the commit still lands (FLOOR-04)
not ok 9  - a scrubbed commit is announced on the durable hive log, not silently altered (FLOOR-04)
not ok 10 - FLOOR-04 ceiling: redactSecrets is best-effort, and these shapes get through (FLOOR-04)
```

Test 1's failure is on exactly the right assertion:

```
error: the secret is in `git log -p` of the hive. Git history is durable and replicated to every
       clone and every backup, so this is a permanent disclosure that no later commit undoes
       true !== false
```

GREEN at HEAD:

```
EXIT=0
# tests 10 / # pass 10 / # fail 0 / # skipped 0 / # todo 0
```

| | Required | Actual |
|---|---|---|
| `# pass` | ≥ B-durability + 4 = **10**, and ≥ 10 absolute | **10** ✅ |
| `# fail` | 0 | **0** ✅ |
| `# skipped` | 0 | **0** ✅ |
| `grep -c "log -p"` | ≥ 1 | **6** ✅ |

B-durability **6 → 10**, delta exactly **+4**.

### GitHub Push Protection rejected the first fixture — a finding, not a nuisance

The first `MISSED_SECRET` was a realistic Stripe key. The push was **rejected**:

```
remote: error: GH013: Repository rule violations found …
remote:   —— Stripe API Key ——
remote:        path: test/hive-durability.test.cjs:235
```

The unblock URL was **not** used. Allowing a secret-shaped fixture past push protection would
weaken the repo's scanning posture permanently and train the operator to click through the control.
The fixture was changed to the underscore variant instead, which is a *better* test anyway (it
isolates one character against `CAUGHT_SECRET`), and the reason is recorded in the fixture's own
comment so nobody "improves" it back and gets a blocked push.

It is also a real data point on the ceiling, worth stating plainly: **GitHub's scanner catches a
shape `redactSecrets` misses.** The hive's matcher is the weaker of the two, exactly as T-P11-02
accepts.

---

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm test` (local, Windows) | **exit 0** — `tests 496 / pass 492 / fail 0 / skipped 4` (was 492/488/0/4) |
| `git diff --stat` shape | `hive.ts +178/-0`, `hive-durability.test.cjs +126/-0`; **0 NUL bytes**, **0 mixed line endings** |

### CI — read off draft PR #77 (base `main`), at `a9db6b9`

```
$ gh pr checks 77
Build                          pass   55s
CodeRabbit                     pass   0     Review skipped: draft pull request
Electron smoke (ubuntu-latest) pass   1m37s
Test (macos-latest)            pass   58s
Test (ubuntu-latest)           pass   45s
Test (windows-latest)          pass   1m29s
Typecheck                      pass   34s
```

**All six jobs green.** Counts pulled from the job logs:

| Platform | Before (1687ed6) | After (a9db6b9) |
|---|---|---|
| ubuntu | 492 / 492 pass / 0 fail / 0 skip | **496 / 496 / 0 / 0** |
| macos | 492 / 492 / 0 / 0 | **496 / 496 / 0 / 0** |
| windows | 492 / 488 / 0 / 4 | **496 / 492 / 0 / 4** |

Exactly **+4 on every platform**, no new failures and no new skips. The 4 Windows skips are the
pre-existing ones.

---

## Handoff item — `gitAsync` pre-commit-hook execution: **ALREADY FIXED, by `840c36e`**

I was asked to verify whether plan 01-06 actually closed 01-02's finding that `gitAsync` spawns
`git` with no hook suppression, making `<hive>/.git/hooks/pre-commit` arbitrary code execution as a
child of the Electron main process. **It did.** Verified in live source, not from the SUMMARY:

```
$ grep -n "GIT_HOOKS_DISABLED" src/main/hive.ts
300:const GIT_HOOKS_DISABLED = '/dev/null';
2981:  spawnSync('git', ['-c', `core.hooksPath=${GIT_HOOKS_DISABLED}`, …   ← private git()
3001:    ['-c', `core.hooksPath=${GIT_HOOKS_DISABLED}`, …                  ← private gitAsync()

$ git log --oneline -S "GIT_HOOKS_DISABLED" -- src/main/hive.ts
840c36e fix(gate-01): give the qwen sidecar its own hook token, in the env AND in the shim body
```

Both wrappers carry it, and 01-06 chose `core.hooksPath` over `--no-verify` deliberately —
`--no-verify` covers only `pre-commit`/`commit-msg`, leaves `post-commit` running, and would need
repeating at seven call sites. It is pinned behaviourally (a sentinel-writing hook that must not
fire) by `test/engine-parity.test.cjs`. **No fix was needed here and none was made.**

This matters to my change specifically: because hooks are suppressed, a `pre-commit` hook was never
an option for the scrub. The single choke point inside `flushCommit` is the only place it can go —
which is the argument recorded in the code comment.

---

## Deviations from Plan

### [Rule 2 — missing critical functionality] `harnessAuthored()` false-positive suppression

Not in the plan. Without it the scrub unstages the hive's own generated hook shims on **every**
commit, forever, and test 2 fails. Discovered by probing a real hive before writing code, not after.
Implemented as byte-identity against the compiled-in constant read from the index blob — a proof of
authorship that closes no hole. **Commit `c15dcd4`.**

### [Rule 2 — missing critical functionality] unborn-HEAD fallback in `unstagePath()`

The plan specifies `git restore --staged`. Measured: it exits 128 on a repo with no first commit and
unstages **nothing** — which is the hive's very first commit, the highest-risk window. Added a
`git rm --cached -q --ignore-unmatch` fallback. **Commit `c15dcd4`.**

### [Rule 1 — plan premise false] FLOOR-04's issue is #10, and the plan says it is not

The plan's criterion *"confirm it is **not** `#10`"* rests on *"#10 is the Electron issue"*, which
is false. Reported above with the resolving query pasted, rather than filed on a wrong issue to
satisfy the letter. Two consequent upstream doc errors filed as blockers (not fixed — neither file
is in this plan's `files_modified`).

### [Reported, not deviated] the `flushCommit`-adjacency criterion

Met in substance via a one-hop extraction with strictly stronger evidence; see task 2. Called out
rather than glossed.

### Not done, deliberately

- **No widening of `redactSecrets`.** LOCKSTEP branch (a); `test/voice-messages.test.cjs` untouched.
- **`add -A` inside the hive repo left alone**, per the plan's scope note and ADR-0004.
- **No `.gitignore` / `UNTRACK_PATHS` change.** Ignoring `bin/` would have removed the false
  positive too, but it stops the scrub from *seeing* that subtree at all and changes what every
  existing hive versions — a bigger blast radius than FLOOR-04's remit.
- **REQUIREMENTS.md row left `Pending`**, matching the 01-02/04/05/06/07/08/09/10 precedent: plan 23
  owns the checkboxes.

---

## Threat Register Outcome

| Threat | Disposition | Outcome |
|---|---|---|
| T-P11-01 secret reaches history | mitigate | **Closed** — scrub at the choke point, pinned by test 1 with a RED control |
| T-P11-02 secret the matcher misses | accept + document | **Accepted, and pinned by test 4** rather than promised. Ceiling stated in the code comment, this SUMMARY and the test |
| T-P11-03 a second disagreeing matcher | mitigate | **Closed** — `redactSecrets` reused unchanged, REDACT-BODY byte-identical |
| T-P11-04 scrub takes down the committer | mitigate | **Closed** — fail-open when it cannot look; never throws out of the flush |
| T-P11-05 scanning an enormous diff | mitigate | **Closed** — bounded twice, `--numstat` pre-check before the diff is buffered, both bounds named in the comment |
| T-P11-06 silently altered commit | mitigate | **Closed** — `console.warn` + durable `secret-scrubbed` log line, pinned by test 3 |

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change. The one new
external surface is `git show :<path>` on a path the hive itself just staged.

---

## Known Stubs

None.

## must_haves — verdict against each truth

| Truth | Verdict |
|---|---|
| "A secret written into an agent's files is scrubbed before the hive commits it, so it never reaches git history" | **TRUE, within the matcher's stated ceiling.** Proven by test 1 over a real repo with a RED control. Not true for shapes `redactSecrets` does not recognise — pinned by test 4, and stated here rather than papered over |
| "The scrub uses the ONE pattern set the project already trusts — no second matcher is introduced" | **TRUE.** REDACT-BODY byte-identical; no new regex anywhere |
| "A scrubbed path is unstaged and logged loudly, not silently dropped" | **TRUE.** `console.warn` + durable hive log naming the path; test 3 |
| "The single-committer git model and the existing untrackIgnored contract are preserved" | **TRUE.** Change is confined to `flushCommit`; no second committer, no hook, no `.gitignore`/`UNTRACK_PATHS` edit |

## Outstanding / MEASUREMENT UNAVAILABLE

- **The optional manual dev-app check was not run.** *MEASUREMENT UNAVAILABLE — a human must run
  `npm run dev`, drop a fake key into a live agent's workspace, wait out the 5 s debounce, and
  confirm `git log -p` in the real hive lacks it while the log records the scrub.* It needs a live
  Electron window and a real agent CLI session. The plan marks it optional; what *is* proven is the
  same code path driven synchronously against a real git repo on three platforms in CI. Filed as a
  STATE blocker for the operator before plan 23.
- **FLOOR-04's row stays `Pending`** in REQUIREMENTS.md — plan 23 owns the checkboxes.
- **#10 stays OPEN.** Only defect 5 of five is closed here; a per-clause evidence comment was posted
  per D-43/D-44.

---

## Self-Check: PASSED

| Claim | Verified |
|---|---|
| `src/main/hive.ts` modified | ✅ `c15dcd4` |
| `test/hive-durability.test.cjs` modified | ✅ `a9db6b9` |
| commit `c15dcd4` exists | ✅ |
| commit `a9db6b9` exists | ✅ |
| `.planning/phases/01-finish-the-floor/01-11-SUMMARY.md` | ✅ this file |
| CI green at `a9db6b9` | ✅ six jobs, read off PR #77 |
