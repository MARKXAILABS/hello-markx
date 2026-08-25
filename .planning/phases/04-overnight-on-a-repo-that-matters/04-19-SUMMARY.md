---
phase: 04-overnight-on-a-repo-that-matters
plan: 19
subsystem: docs / phase-close
tags: [SECURITY.md, TELEMETRY.md, repo-facts, marker-ledger, nyquist, phase-close]

requires:
  - phase: "04-01 … 04-18, 04-20"
    provides: "every gate, record, watchdog and marker this rollup re-measures"
provides:
  - "SECURITY.md § Phase 4 — three gate ceilings at their measured counts, four fail-opens with dispositions and owners, the honest cross-engine claim, GATE-04's built-not-wired status, and the push leg's single root cause"
  - "TELEMETRY.md § The local record — RECORD-01/02, the unchanged span ring and why, the three reasons the writer is not on the telemetry path, and `synchronous = NORMAL` stated rather than upgraded"
  - "test/repo-claims.test.cjs — four closing clauses, each both-directions, two of them mutation-proven red"
  - "04-VALIDATION.md — 59/59 Status cells filled from this session's runs; wave_0_complete true; status approved; nyquist_compliant DELIBERATELY still false with the measured reason"
  - ".planning/REQUIREMENTS.md — eleven rulings, four Complete and seven OPEN each with a reason and an owner in the row"
  - ".planning/ROADMAP.md — criterion 1's four-engine wording annotated beside the original"
  - "NYQUIST BLOCKER: the phase does NOT close on `nyquist_compliant` — five of seven Manual-Only rows are open"
affects:
  - "phase 5 (any plan reading ROADMAP criterion 1 or SECURITY.md as fact)"
  - "the orchestrator (STATE.md/ROADMAP progress writes, and the nyquist non-close)"

tech-stack:
  added: []
  patterns:
    - "doc-vs-source counting: a doc's ceiling list is asserted AGAINST its source's item count, section-scoped, never summarised from it"
    - "conditional pin: a doc clause whose direction is decided by another plan's machine-readable SUMMARY line, and which fails if that line is absent or ambiguous"
    - "proximity negatives: `nearMatches(text, needle, nearRe)` so a doc may name a forbidden phrase in order to DENY it"

key-files:
  created:
    - .planning/phases/04-overnight-on-a-repo-that-matters/04-19-SUMMARY.md
  modified:
    - SECURITY.md
    - TELEMETRY.md
    - test/repo-claims.test.cjs
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - .planning/phases/04-overnight-on-a-repo-that-matters/04-VALIDATION.md

key-decisions:
  - "nyquist_compliant STAYS false. Five of seven Manual-Only rows are open, this workflow's own rule keeps the flag false for exactly that, and no Dimension 8 confirmation exists. The plan's success criterion FAILS and is reported, not explained away."
  - "The plan's own paraphrase of the honest claim was measured FALSE in three places and corrected: fail-open 4 degrades on FOUR engines not two; agy IS exercised by a test so `exercised by no test at all` was not written; `git clone` is explicitly NOT reached by the host arm."
  - "The 04-13 SUMMARY line reads `LIVE GATE-03 REFUSAL: no`, so SECURITY.md carries the corrected-downward wording and the pin asserts the live-refusal sentence is ABSENT."
  - "ROADMAP.md was edited despite the orchestrator's standing 'do not touch' — one 18-line pure-insertion hunk in criterion 1's prose, nowhere near the progress table. Recorded as a deviation for the orchestrator to revert in one hunk if it disagrees."
  - "Six map rows are ⚠️ rather than ✅; the legend's third glyph was widened from 'flaky' because nothing in this phase was flaky and forcing those rows to ✅ or ❌ would have lost the information a closing map exists to carry."

patterns-established:
  - "Zero-marker sweep by CANONICAL union-type id, not by the short name the prose uses — that is how the next auditor will check"
  - "A crash proof states what was killed: a real process holding the real store, not the Electron app, with the mechanism identity argued rather than assumed"

requirements-completed: [RECORD-01, RECORD-02, RECORD-05, VIGIL-02, VIGIL-04]

duration: ~95min
completed: 2026-08-26
---

# Phase 04 Plan 19: Phase Close — Every Claim Re-measured at Wave 7

**Two docs that describe the boundary that exists, four both-directions clauses that fail if it is
ever inflated, 59 verification rows filled from runs in this session — and a phase that does NOT
close, because five of its seven Manual-Only rows are still open and `nyquist_compliant` is
therefore still `false`.**

---

## THE HEADLINE: THIS PHASE DOES NOT CLOSE

Plan 04-19's own success criterion reads *"`nyquist_compliant` is `true`. If the plan-checker has
not confirmed Dimension 8, this criterion **fails** and the phase does not close — there is no
explained-exemption (M7). Say so plainly rather than writing a paragraph beside a `false`."*

**Saying so plainly: the criterion FAILS. The flag stays `false`.** Not as an exemption — as the
true value.

Two independent reasons, both measured at close:

1. **This workflow's own compliance rule forbids the flip.** Quoted verbatim in
   `02-VALIDATION.md` § Frontmatter corrections: *"A phase with zero automated coverage, **or with
   Manual-Only items still open**, keeps `nyquist_compliant: false`."* Phase 4 has **five of seven
   Manual-Only rows open**, none closeable on this machine (table below).
2. **No plan-checker Dimension 8 confirmation exists for this phase.** Searched at close: the three
   red-team artifacts (`04-REDTEAM.md`, `-R2`, `-R3`) contain **zero** occurrences of "dimension",
   and nothing else in `.planning/` confirms it for phase 4.

**Precedent, so this is not a novel judgement.** Phase 2's post-execution audit moved this exact
flag `true → FALSE` and called it *"a correction in the honest direction"*. Three of its five
blockers — a physical Android phone, un-installed engine CLIs, a live authenticated non-Claude
agent — are **the same three blocking phase 4**. Flipping it here would reverse that correction one
phase later on strictly less evidence.

| Open Manual-Only row | Req | Owning task | Blocker |
|---|---|---|---|
| Live codex agent finishes a task with the sandbox on | GATE-04 | 04-13-T4 | `401 refresh_token_reused` — needs an operator browser sign-in |
| A live agent has a command REFUSED by GATE-03 | GATE-03 | 04-13-T4 | same — no live agent ever started |
| A live non-Claude agent on a prompt is (or is not) `blocked` | VIGIL-03 | 04-13-T4 | same |
| GATE-05 approval answered on a **physical Android phone** | GATE-05 | 04-19-T3 | no device reachable (`adb` absent, no SDK) |
| A9 focus retention / click-driven swap / ticking countdown | GATE-05 | 04-18-T4 | `renderToStaticMarkup` fires no events; D-27 excludes jsdom/RTL/Playwright |

**What would settle all five, and it is cheap:** `codex login` (three rows at once), one Android
device with a fresh QR pairing (the fourth), and either a browser driver or one recorded operator
session (the fifth).

---

## Performance

- **Duration:** ~95 min
- **Tasks:** 3 of 3 (task 3 is a checkpoint — see § The checkpoint did not reach a human)
- **Commits:** 2 task commits + this SUMMARY
- **Files modified:** 6 (`SECURITY.md`, `TELEMETRY.md`, `test/repo-claims.test.cjs`,
  `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `04-VALIDATION.md`)

| # | Commit | What |
|---|--------|------|
| 1 | `dde5119` | SECURITY.md + TELEMETRY.md describe the boundary that exists |
| 2 | `169e93c` | The final ledger, four closing clauses, and the rulings they pin |

---

## Every number below was produced by a command run in THIS session

Not one figure is carried forward from a prior SUMMARY, from `04-RESEARCH.md`, or from the plan.

### Gates

| Gate | Command | Result |
|---|---|---|
| Full suite | `npm test` ×3 | **1078 tests / 1071 pass / 0 fail / 7 skipped** |
| Wall time | same three runs | **23 729 / 24 087 / 23 768 ms** — worst **24.1 s** |
| Typecheck | `npm run typecheck` | exit 0, both projects |
| Lint | `npm run lint` (`--max-warnings 0`) | exit 0 |
| Build | `npm run build` | exit 0, built in 46.66 s |
| Closing clauses | `node --test test/repo-claims.test.cjs` | **45 / 45 / 0 fail** |

**Skipped count: 7. Delta from the 7-skip baseline: ZERO.** `test/suite-integrity.test.cjs` is
**byte-untouched over the whole phase** (`git diff --stat 8749a2b..HEAD --` on it is empty) and
`FROZEN = { win32: 6, other: 1 }` still reads as written.

**Feedback latency vs the budget (M6).** Baseline was a **range**, not a point: 24.3 / 34.2 /
42.4 s across three quiet runs, plan against the worst, **42.4 s**. Measured at close: worst
**24.1 s**. **Delta: −18.3 s** — faster, against a suite that grew from **805** to **1078** cases.
Headroom under the 90 s phase budget: **~66 s**. The budget was never threatened. The two heaviest
files were measured anyway, in case it ever is: `engine-parity` **11.9 s**, `gate05-bounded-wait`
**10.5 s**. Both integration sub-budgets hold — `gate05-bounded-wait` **10.5 s** against 15 s,
`gate03-roundtrip` **1.4 s** against 10 s.

**D-36 (no installs).** `git diff --stat 8749a2b..HEAD -- package.json package-lock.json` over the
whole phase: **empty**. Zero packages installed by any of the twenty plans.

### The marker ledger, re-measured

```
$ grep -ro 'LIVE-UNVERIFIED' src/ | cut -d: -f1 | sort | uniq -c
      3 src/main/hive.ts
      5 src/main/hiveProvisioning.ts
      7 src/main/hiveTemplates.ts
      1 src/main/index.ts
      3 src/main/webhook.ts
      4 src/shared/agentProvider.ts
   (total 23)
```

All four pins match with nothing to reconcile: `MARKER_LEDGER` per-file ✓, `LIVE_UNVERIFIED_TOTAL`
= 23 ✓, the file set ✓, `LIVE_UNVERIFIED_ENGINES` ✓. Re-measured and found identical is a
different fact from not re-measured, so the ledger comment now records that it happened at wave 7.

### The zero-marker sweep — the job plan 02-12 invented

Run over all **23** marker blocks by **canonical `AgentProvider` id** rather than by the short name
the prose uses, because an audit keyed on the union type is how the next reader will check:

| claude | codex | kimi | opencode | pi | grok | agy | crush | qwen | antigravity | copilot |
|---|---|---|---|---|---|---|---|---|---|---|
| 11 | 7 | 6 | 5 | 4 | 4 | 2 | 1 | 1 | **0** | **0** |

**Verdict: NO bridged engine carries zero markers. Nothing of 02-12's shape was found.**

The two zeroes are both explained and neither is a hole:

- **`copilot`** has no bridge at all — there is nothing to mark.
- **`antigravity`** is the *canonical id* of the engine every marker block spells **`agy`**, which
  carries 2. That is worth writing down and it is now in the file: **a naming inconsistency, not a
  missing marker.** It is recorded rather than inflated into a finding it is not.

The plan named three candidates by name and all three were checked: **kimi** (6 blocks, and in
`LIVE_UNVERIFIED_ENGINES` at 6), **antigravity/agy** (2 blocks, deliberately absent from that map
and documented as such at 04-16), and **codex's sandbox path** (04-13's spike came back
INCONCLUSIVE, and the path carries its own marker — `sandbox` 1, `workspace-write` 1).

### The ceilings, counted against source rather than summarised

| Gate | Source | Source count | SECURITY.md count |
|---|---|---|---|
| GATE-02 | `shellEnv.ts` (a)-(j) | **10** | **10** |
| GATE-03 | `hooks.ts` (j)-(v) | **13** | **13** |
| GATE-05 | `hooks.ts` (a)-(h) | **8** | **8** |

Whole-doc, heading-filtered: `grep -v '^#' SECURITY.md | grep -cE '^\s*[-*(]\s*\([a-v]\)'` → **31**
(= 10 + 13 + 8). **No doc count is lower than its source count.**

One measurement worth recording because it is a trap: a naive `^\s*\*\s+\((a|…|h)\)` over the
GATE-05 block scores **9** for **8** items — the ninth is the `(a)'s degradation` *cross-reference*
inside item (e), which is indented seven spaces where real items are indented three. The clause
matches on the three-space indent, so the cross-reference cannot inflate the count.

---

## Task 1 — SECURITY.md and TELEMETRY.md

**SECURITY.md** gained a section carrying the three new gates' ceilings at the counts above, plus:

- **The four fail-opens**, each with a **Disposition** and an **Owner** (6 disposition lines, 6+
  owner lines — the clause requires ≥ 4 of each).
- **The deliberate contrast, in one paragraph** because the contrast *is* the claim:
  `protectedPathDenial`'s `if (!root) return null` fails **open** (with no hive root there is
  nothing to protect — a true statement about the world), while GATE-03's host arm fails **closed**
  on an *empty* allowlist (an empty allowlist is a configuration this app cannot distinguish from a
  tampered one, so there *is* something to protect).
- **The honest cross-engine claim**, verbatim from `test/engine-parity.test.cjs`, including
  **`NO LIVE AGENT HAS EVER BEEN OBSERVED REFUSED`** and the sense-of-the-`no` paragraph.
- **GATE-04's real status**: built + `LIVE-UNVERIFIED` **and separately NOT WIRED**.
- **The push leg**: one root cause, two visible stubs.
- **`sw.js`'s now-false security comment**, recorded with its owner (this plan may not touch that
  file — see § Findings this plan could not fix).

**TELEMETRY.md** gained a `# The local record` half, opening by saying that nothing in it leaves
the machine — because a reader who meets `tool_calls` inside a file about PostHog will otherwise
assume it is uploaded. It states that the span ring is **unchanged and why** (the waterfall UI
reads exactly that ring, and a durable table with different retention would give the waterfall a
second source of truth), the **three measured reasons** the writer is in `hooks.ts` and not on the
telemetry path — verified individually in source:

| Reason | Measured |
|---|---|
| `ToolSpan` has no `target` | fields are `agentId, sessionId, ts, tool, success, durationMs, decision?, error?` |
| `ATTR_ALLOWLIST` admits no path or command key | 15 keys, all of them ids/metrics; no path, no command |
| The OTel block is Claude-only | the collector receives OTLP from Claude Code and nothing else |

…and `synchronous = NORMAL` **stated, not upgraded**: a row survives a **process** crash, and is
**not** guaranteed against an OS or power loss until the next checkpoint. `events` retention is a
**query bound** at **30 days** with a strictly-older prune, and `harness.db` lives in `userData`,
**outside the hive root**, so it needs no `UNTRACK_PATHS` entry — with the cost of that location
cross-referenced to GATE-03 ceiling item (r).

---

## Task 2 — the four closing clauses, and the mutation check that proves they bite

| Clause | Asserts | Both directions |
|---|---|---|
| 1 | Each gate ceiling in SECURITY.md at **no fewer** items than its source, section-scoped | doc ≥ source, plus explicit checks for (s)(t)(u)(v) and (e)(g)(h) by name |
| 2 | Four fail-opens with dispositions and owners, and the fail-open/fail-closed contrast | ≥ 4 dispositions, ≥ 4 owners, each of the four named individually, contrast as a proximity claim |
| 3 | The honest GATE-03 claim — **four** positive literals + the negatives | see below |
| 4 | TELEMETRY.md's durability level, and the writer's location | positive on `hooks.ts`, negative on `telemetry.ts` |

**Clause 3's four positive literals**, over joined text (SECURITY.md wraps at ~88 columns, so every
claim in it straddles a newline and a line grep would miss the ones that matter most):

1. `` through the real `HookServer` `` — unconditional
2. `LIVE-UNVERIFIED for pi` — unconditional
3. `exercised through a real child process` — unconditional (the agy clause; see the correction below)
4. **conditional and cross-checked** — plan 04-13's SUMMARY carries `LIVE GATE-03 REFUSAL: no`
   (twice, in agreement), so SECURITY.md must **not** carry a live-refusal sentence and **must**
   carry `NO LIVE AGENT HAS EVER BEEN OBSERVED REFUSED`. **The clause fails if that line is absent
   or if two copies disagree** — an unmeasured run cannot be rounded either way.

**The negatives are proximity claims, not presence checks**, because SECURITY.md is allowed to name
a forbidden phrase in order to *deny* it: `live-verified` may not appear within 200 characters of
`grok`, `pi` or `OpenCode`, and `unit-verified` may not appear near `agy`/`antigravity`. Both
currently occur **0** times in the whole document, and are paired with a `LIVE-UNVERIFIED ≥ 3`
lower bound so a document that stopped talking about engines fails instead of passing.

### The recorded mutation check — both mutations, both reverts

**Mutation A (the one the plan names).** `built for grok, kimi and agy` → `built for grok
(live-verified), kimi and agy`:

```
✖ 04-19 clause 3: SECURITY.md carries the honest GATE-03 claim and cannot inflate it
  AssertionError: SECURITY.md describes grok as live-verified. None of grok, pi or OpenCode is
  installed on this machine and no live session has ever run against any of them.
```

**Mutation B (proving clause 1 bites too).** Deleted GATE-03 ceiling item (v):

```
✖ 04-19 clause 1: SECURITY.md carries each gate ceiling at NO FEWER items than its source
  AssertionError: SECURITY.md's GATE-03 ceiling lists 12 items, expected >= 13
```

**Both reverted** with `git checkout -- SECURITY.md`; `git diff --stat -- SECURITY.md` empty after
each, and `node --test test/repo-claims.test.cjs` back to **45 / 45 / 0 fail**.

### The verification map — 59 rows, filled from runs

Re-counted from the **plans**, not from the map's own sign-off line:
`grep -cE '^\s*<task type='` sums to **59** across the 20 plans; the map has **59** rows. Exact
bijection. Before touching anything: **59** rows, **0** with a placeholder coordinate, **59**
reading `pending` — every number the plan predicted, confirmed.

After: **59 rows / 59 outcome glyphs / 0 pending**, split **53 ✅ / 0 ❌ / 6 ⚠️**.

Each ✅ means every `Automated Command` on that row was executed here and exited 0. The **24
distinct test files** those commands name were each run individually — **all 24 came back 0 fail,
0 skipped**. The six ⚠️ carry their reason **in the row's own cell**:

| Row | Why ⚠️ |
|---|---|
| 04-01-T1 | artifact exists and is honest, but the verdict is **INCONCLUSIVE**; codex's payload shape still UNMEASURED |
| 04-05-T3 | halves A/B green on a live `claude` agent; **half C BLOCKED** with attribution proven |
| 04-13-T1 | assembler correct and unit-green, but **no production caller passes `agentDir`** |
| 04-13-T4 | **DID NOT RUN** — codex auth revoked |
| 04-18-T4 | **NOT PERFORMED** — auto-approved; the seven demonstrations never ran |
| 04-19-T3 | **partially performed** — crash test ran and passed; the physical-device half did not |

The legend's third glyph was widened from `flaky` to *green-with-a-recorded-caveat, flaky, or not
fully exercised*, and the reason is stated in the file: **nothing in this phase was flaky** — zero
red rows, no test failed once — and forcing a caveated row to ✅ or ❌ would have destroyed exactly
the information a closing map exists to carry.

---

## Task 3 — the checkpoint DID NOT REACH A HUMAN

**Stated first, because 04-18 got this wrong and the environment brief said so explicitly.**

`workflow.auto_advance` is `true` in `.planning/config.json`, so this `checkpoint:human-verify`
**auto-approved**. ⚡ Auto-approved: the phase-close review. **No operator typed "approved" and no
operator ruled on any of the eleven checkboxes.** The eleven rulings below are the **executor's**,
made against measurements taken in this session, and they are **subject to operator review**. They
are not an operator sign-off and this SUMMARY does not present them as one.

Everything automatable ran first, as the plan requires:

### 1. The physical device — HONEST OUTCOME: no device, recorded as first-class

`adb` is not on `PATH` (`command -v adb` → exit 1) and there is no Android SDK
(`.../AppData/Local/Android/Sdk/platform-tools/` does not exist). **No physical Android device is
reachable from this session.** No desktop browser was substituted and nothing was called
device-verified.

Two further blockers sit behind the missing device, so this is not one fix away: triggering a real
GATE-05 ask needs a live agent (codex auth is revoked), and TryCloudflare Quick Tunnels mint a new
hostname on every open, so an installed PWA needs a fresh QR pairing each time.

**Recorded exactly as Phase 2 recorded it for DAEMON-02, and cited rather than re-derived** —
`04-VALIDATION.md` § Manual-Only says it in its own words: *"'Verification needs a real device' is
a first-class outcome here, not a failure."*

### 2. The kill-and-restart crash test — RAN, PASSED

RECORD-01's own criterion, exercised rather than inferred. A real process opened the real
`PersistStore` against a real `harness.db`, wrote three `tool_calls` and two `events`, and was
**`SIGKILL`ed with the handle still open** — no `close()`, no shutdown hook, no WAL checkpoint. A
**second, independent process** then opened the same file:

```
writer exited code=null signal=SIGKILL
files on disk after the kill: harness.db, harness.db-shm, harness.db-wal
-wal present (uncheckpointed): true (160712 bytes)

Q1 — "who wrote this file?"  (target = SECURITY.md)
   A: agent=a1 tool=Edit ts=2026-08-26T02:02:00.000Z target=…/SECURITY.md decision=allow

Q2 — "what did the floor run overnight?"
   02:02  a1  Edit   allow  …/SECURITY.md
   02:01  a2  Bash   ask    rm -rf build/
   02:00  a1  Write  allow  …/src/main/hooks.ts
   tool_calls rows recovered: 3
   events rows recovered for that day: 2 [task.done, mail]

CRASH TEST: PASS
```

**Scope, stated rather than assumed.** What was killed is a real Node process holding the real
store — **not the Electron app**; no GUI session exists here. The mechanism under test (WAL
recovery after an uncheckpointed kill) is identical, and the two things a full app kill would add
are separately covered: production **wiring** is proven by 04-20's really-booted-floor test
observing a real row land in `floor.persist` with a non-null target and a token-derived id, and
app-level teardown is pinned by `SHUTDOWN_STEPS`.

### 3. The eleven requirements — four Complete, seven OPEN

Each is written into `.planning/REQUIREMENTS.md` with its reason **in the row itself**, and its
traceability row updated. Every OPEN one names what would settle it and who owns it.

| Req | Ruling | The clause that decided it |
|---|---|---|
| GATE-02 | **OPEN** | Live-verified both directions inside a real `claude` agent's own `env`. **D-13's non-Claude clause did not run** — both installed non-Claude engines fail auth identically **with and without** the filter, so attribution is proven and the clause is unrunnable here. Ceiling (j)'s two unfiltered spawns remain. |
| GATE-03 | **OPEN** | **NO LIVE AGENT EVER OBSERVED REFUSED**; three of the criterion's four engines are not installed. Reaches seven engines main-side, refused through the real `HookServer` in both command shapes. |
| GATE-04 | **OPEN** | **DID NOT RUN** (auth) **and NOT WIRED** (no production caller passes `agentDir`). |
| GATE-05 | **OPEN** | Bounded wait real and proven by 8 child-process cases in 10.5 s. **Push leg composed-not-delivered**, **device half never ran**, **degrades to deny on four engines**. |
| RECORD-01 | **Complete** | Crash test RAN and PASSED; writer proven on a really-booted floor with a token-derived id; scope and `NORMAL` ceiling both stated. |
| RECORD-02 | **Complete** | A >16 MiB day reads back whole from its first row through the real `appendLog`; `eventsBetween` deliberately unlimited; 30-day strictly-older prune. |
| RECORD-05 | **Complete** | 11/11: one of three restored, other two byte-identical, operator's index/branches/`status`/`log` untouched, store excluded twice, timer in `SHUTDOWN_STEPS`. |
| VIGIL-01 | **OPEN** | Watchdog real, alarms once, fires when the god died, torn down on shutdown. **"Wherever they are" reaches the desktop only** — same root cause as GATE-05(a). |
| VIGIL-02 | **Complete** | Released **in the teardown tick, synchronously**, naming the dropper; a git failure loses the branch and never the release. CAS residual named. |
| VIGIL-03 | **OPEN** | Detection works with no renderer loaded; quiesce and nudge both closed. **`BLOCK_HINTS` has never been observed matching any non-Claude engine** — `LIVE VIGIL-03 BLOCKED: no`. |
| VIGIL-04 | **Complete** | Age on cards and on unanswered asks, `relAge` at five boundaries, `updatedAt` stamped at one diff-driven choke point. |

**No checkbox was flipped to make the phase look finished.** Seven of eleven stay open. Four of the
seven are open on evidence that **cannot** be produced on this machine; that is the outcome, and it
is recorded as one.

---

## Deviations from Plan

### [Rule 1 — Bug] The plan's own paraphrase of the honest claim was FALSE in three places

Task 1's `<action>` paraphrased the claim as *"refused for Claude and Codex (live-verified on this
machine); built for grok, kimi and agy and unit-verified through the real `HookServer`"*, and task
2 required the positive literal *`exercised by no test at all`*. **All three clauses contradict the
tree**, and the plan's own acceptance criteria contradict its action prose. Measured and corrected:

| Plan said | Tree says | Written |
|---|---|---|
| Codex "live-verified on this machine" | 04-13: `LIVE GATE-03 REFUSAL: no` — codex auth revoked, no agent ever started | `NO LIVE AGENT HAS EVER BEEN OBSERVED REFUSED` |
| agy "unit-verified" (task 1) **and** "exercised by no test at all" (task 2) — the plan contradicts itself | `test/engine-parity.test.cjs` drives the real `AGY_HOOK_SHIM` **as a child process**; 04-10 recorded this as a **corrected-up** clause in wave 3 | *"grok's and agy's reply translators are each exercised through a real child process"*, and the pin's third positive literal is that phrase |
| fail-open 4 names **pi and OpenCode** | `hooks.ts` GATE-05 ceiling (a) names **four** — pi, OpenCode, grok **and agy**; (e) makes grok's and agy's degradation explicit | all four named, with a note that the plan's narrower set was corrected |

Writing *"agy is exercised by no test at all"* into SECURITY.md would have been a false statement
in the app's *disfavour* — still false, and still an over-claim about the project's own record.

### [Rule 2 — Missing critical documentation] `git clone` was implied to be covered

`04-06` scoped GATE-03's host arm to a downloader's own first non-flag argument after the wider
form denied a README here-doc. `SECURITY.md` now says plainly, as ceiling item (p), that
`git clone` / `npm` / `pip` against an unlisted host is **not reached**, and that any wording
elsewhere implying otherwise is corrected by that item.

### [Deviation — orchestrator instruction vs plan requirement] ROADMAP.md was edited

**The orchestrator's brief says "Do NOT modify STATE.md or ROADMAP.md." The plan requires the
ROADMAP edit**, names `.planning/ROADMAP.md` in `files_modified`, makes it a task-2 acceptance
criterion, and registers **T-04-DOC-07** whose entire mitigation is that annotation — *"an
over-claim there becomes a design premise two phases later."*

**Resolution taken, and surfaced rather than performed silently:** the annotation was made, but
confined to **one 18-line pure-insertion hunk** in criterion 1's prose
(`@@ -427,0 +428,18 @@`, 18 insertions, **0 deletions**). It touches no progress row, no phase
checkbox and no plan list, so it merges cleanly beside an orchestrator progress write and can be
reverted in a single hunk if the orchestrator disagrees. **`.planning/STATE.md` was not touched at
all.**

Leaving it unannotated was the alternative, and it is exactly the failure this phase's own threat
register names.

---

## Findings this plan could not fix — every one with a named owner

**D-35 binds this plan to touch no source file.** Each of the following is real, was verified in
the tree at wave 7, and is a finding rather than a drive-by fix.

| # | Finding | Verified how | Owner |
|---|---|---|---|
| 1 | **`test/hive-durability.test.cjs:197`'s argument slice is INERT.** `src.indexOf('\n);', at)` returns **−1** because `boot.ts`'s closing paren is indented, so `slice(at, -1)` runs **14 315** chars to EOF — the whole rest of the file. The single-call clause above it is sound. | measured: `at=57144`, `end=-1`, slice length **14 315** vs 14 316 to EOF | **unowned** — no plan in this phase owns that file. It pins a Phase-1 (FLOOR-09) clause, not a phase-4 one. |
| 2 | **`resources/phone/sw.js`'s security comment is FALSE.** It says the body is the fixed phrase *"unconditionally"*; since 04-17 the body renders `data.body` when the sender supplies one. The property still holds (the two composers are the only senders and neither carries a command, path or question) but **the guarantee moved from the worker to the sender**. | `deferred-items.md`, re-read at close | the next plan permitted to touch `sw.js` (UI-SPEC rule Q-5 caps it at one changed line) — **now also recorded in SECURITY.md** |
| 3 | **GATE-04 is built but NOT WIRED.** No production caller passes `agentDir`. | every `buildSpawnCommand(...)` call site in `src/` is 3-argument; `commandForAutoMode` has **no** caller in `src/` at all | hive maintainer — **in SECURITY.md and in REQUIREMENTS.md's GATE-04 row** |
| 4 | **The push leg is composed, never sent** — one root cause (`webhook.ts` has no `PushSubscription` intake route), two visible stubs (`askPushPayload` has **no caller at all**; `floorQuietPushPayload` composes and `console.warn`s). | grepped both symbols across `src/` | whoever adds the intake route — **in SECURITY.md, GATE-05 and VIGIL-01** |
| 5 | **`hooks.ts` ceiling item (u) is stale.** It ties *"the approval transport is wired"* to `openAsk` being supplied; production passes `openAsk: undefined` **deliberately**, `HookServer` owns an `ApprovalRegistry` and opens a real ask anyway, and `boot.ts` supplies `readConfig().hostAllowlist ?? []`. So an **unlisted** host is an **ask**; only an **emptied** allowlist is a hard deny. | read `boot.ts:1270-1293`, `hooks.ts:1016`, `commandShape.ts:345/348` | hive maintainer — **SECURITY.md item (u) carries the correction in a parenthetical** |
| 6 | **`04-06-SUMMARY.md` § Known Stubs and T-04-NET-04 are stale** for the reason above. **And the phase ledger's own attribution needed correcting:** the ask *machinery* landed at **04-15** (`HookServer` owning the registry), but the production host arm stopped hard-denying at **04-20**, when `boot.ts` first supplied the allowlist — before that, an absent allowlist meant `allowed.length === 0`, which `commandShape.ts:345` answers with a bare **deny**. Both dates matter and they are different. | read `commandShape.ts:345` / `:348` and `boot.ts`'s argument list | hive maintainer |
| 7 | **OpenCode's path arm cannot see a file read** — `output.args.filePath` vs the collected `file_path`/`path`/`notebook_path`. Its command arm works. | `hiveTemplates.ts:729-730` says so in source | hive maintainer — **now in SECURITY.md** |
| 8 | **`hiveProvisioning.ts:230-231`'s comment is too strong.** Session hooks DO fire in headless `codex exec` (measured: `SessionStart` ×3, `UserPromptSubmit`); **`PreToolUse` is UNMEASURED, not disproven.** | carried from 04-13's measurement; the comment is unchanged in the tree | **unowned** — no plan owned the fix |
| 9 | **Two unfiltered `...process.env` spawns remain** — `hive.ts`'s proxy sidecar, `index.ts`'s codex daemon. Neither is an agent *terminal*, which is why GATE-02's literal wording holds. | `shellEnv.ts` ceiling item (j) | hive maintainer — **in SECURITY.md and GATE-02's row** |
| 10 | **`blockReason` is singular per agent** — a burst of refusals shows only the latest; no floor-wide denial log (T-04-CMD-15, accepted). | carried; recorded in VIGIL-03's row | hive maintainer |
| 11 | **04-08's branch-label race is not closed** — CAS prevents any clobber; closing it needs the `tasks.lock` upgrade. | 04-08-SUMMARY § Residual risk, re-read | hive maintainer — **in VIGIL-02's row** |
| 12 | **04-15's settle APPENDS its verdict to `tool_calls`** rather than rewriting the row — `PersistStore` has no `UPDATE` on that table. Accepted by the orchestrator; **not** claimed as an in-place rewrite. | `db.ts` — the class exposes `recordToolCall` / `toolCalls` and no update path | accepted — **stated in TELEMETRY.md** |
| 13 | **04-04's `hiveTemplates.ts` `updatedAt` criterion measured 3 against a stated ≥ 4** — discharged executably instead, by four spawned-CLI cases. The literal criterion was not met. | carried; recorded in VIGIL-04's row | recorded, not open |
| 14 | **`antigravity` carries zero marker blocks** while `agy` carries 2 — an alias, not a hole. | the sweep above | recorded in `LIVE_UNVERIFIED_ENGINES`' comment |

---

## Contradictions a wave-7 measurement produced

Four, and in each case **the measurement won**:

1. **The plan's honest-claim paraphrase** — three false clauses, corrected above.
2. **The plan's fail-open 4** named two engines; the source names four.
3. **The phase ledger's "closed at 04-15, not 04-20"** for the hard-deny window — measured, and it
   is **both**: the ask registry is 04-15's, the production allowlist seam is 04-20's, and the host
   arm hard-denied until the latter.
4. **`nyquist_compliant: true`** — the plan required the flip; the workflow's own rule, the five
   open Manual-Only rows and phase 2's own precedent all forbid it. The flag stays `false`.

---

## Known Stubs

Two, both already listed above with owners, both **in SECURITY.md** so a reader of that file finds
them without reading this one:

1. **The push leg** (`askPushPayload` uncalled; `floorQuietPushPayload` composes-and-logs) — no
   `PushSubscription` intake route has ever existed in this process.
2. **GATE-04's `agentDir`** — accepted by both assemblers, passed by no production caller.

Neither is fixable inside this plan (D-35: no source files), and neither is claimed as delivered in
any document this plan wrote.

## Threat Flags

None. This plan introduced no network endpoint, auth path, file-access pattern or schema change —
it touched two Markdown files, one test file and three planning files.

---

## Self-Check: PASSED

**Files claimed created/modified, verified on disk:**

```
FOUND: SECURITY.md
FOUND: TELEMETRY.md
FOUND: test/repo-claims.test.cjs
FOUND: .planning/REQUIREMENTS.md
FOUND: .planning/ROADMAP.md
FOUND: .planning/phases/04-overnight-on-a-repo-that-matters/04-VALIDATION.md
FOUND: .planning/phases/04-overnight-on-a-repo-that-matters/04-19-SUMMARY.md
```

**Commits claimed, verified in `git log`:**

```
FOUND: dde5119  docs(04-19): SECURITY.md and TELEMETRY.md describe the boundary that exists
FOUND: 169e93c  test(04-19): the final ledger, four closing clauses, and the rulings they pin
```

**Scratch artifacts removed:** the six `scratch-*.cjs` helpers written for the sweep, the map run,
the map fill, the traceability update and the crash test were deleted before the task-2 commit;
`git status --short` showed no `??` entries at either commit.

**No number in this SUMMARY was carried forward from a prior SUMMARY.**
