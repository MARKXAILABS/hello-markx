---
status: not_clean
round: 1
phase: 01-finish-the-floor
target: gap plans 01-24 … 01-31 (committed fd66993)
gates_run: 6
blockers: 49
verdict: DO NOT EXECUTE — revision required
reports:
  - 01-GAP-CHECK.md          # gsd-plan-checker
  - 01-REDTEAM-1-anchors.md  # lens 1 — source-anchor drift
  - 01-REDTEAM-2-vacuity.md  # lens 2 — vacuous verification
  - 01-REDTEAM-3-security.md # lens 3 — security efficacy
  - 01-REDTEAM-4-ordering.md # lens 4 — ownership & ordering
  - 01-REDTEAM-5-regression.md # lens 5 — regression blast radius
---

# Phase 01 gap plans — adversarial red-team, round 1

Six gates ran in parallel against the eight gap-closure plans: the `gsd-plan-checker` plus five
hostile source-grounded lenses. **Round 1 is NOT CLEAN.** The plans must not execute.

| Gate | Blocker | High/Warning | Info |
|------|---------|--------------|------|
| plan-checker | 2 | 5 high / 6 med | 3 |
| 1 — anchor drift | 9 | 14 | 11 |
| 2 — vacuous verification | 21 | 14 | — |
| 3 — security efficacy | 4 | 4 high / 5 med | — |
| 4 — ownership & ordering | 2 | 11 | 3 |
| 5 — regression blast radius | 11 | 20 | 4 |
| **Total** | **49** | **~79** | **21** |

## What the gates agreed on

Three independent gates converged on the same structural verdict: **the gap plans reproduce the
exact defect class the phase exists to remove.**

- **54% of the acceptance criteria already pass at HEAD.** Lens 2 executed all 46 `contains` /
  `pattern` strings against the live tree: 25 return non-zero hits before a byte is edited. They are
  satisfied by `git checkout .`.
- **Plan 01-30 — chartered to delete fake verification — is 6 of 6 green at HEAD.** Its
  `contains: "sock_token"` gate on `test/hook-auth-roundtrip.test.cjs` is satisfied by `:193`'s
  `assert.match(body, /sock_token/)`: *the vacuous pin the plan exists to remove satisfies the plan's
  own gate.* Plan 01-31 has the same shape against a stale HIVE.md anchor it was written to fix.
- **Plan 01-28 carries a fabricated verification claim** — it cites a `window` stub "VERIFIED by probe
  at 47a48cd". Live: `grep -rn "global.window\|globalThis.window" test/` returns nothing, and the
  harness it names never loads the module in question.
- **Every plan's header claims "Re-derived at HEAD 47a48cd."** Lens 1 checked 214 anchors: true for
  ~85%, false precisely where it is destructive.

## The findings that would have caused damage

Ranked by what actually breaks if executed as written.

### 1. 01-26 would disable secret scrubbing and corrupt all agent mail
The `redactSecrets` anchor block is shifted a consistent **+3** — a signature that says copied, not
re-derived. Two range edits land wrong:
- `Edit hive.ts:402-407` — pattern 3's call is `:401-404`. **Line 406 is the bearer-token rule.**
  The range replace deletes it.
- `Edit hive.ts:410-417` — pattern 5's call is `:413-416`. **Line 417 is `return s;`.** Deleting it
  makes `redactSecrets` return `undefined` on every call; `scrubStagedSecrets`' `redactSecrets(all)
  === all` check inverts, and the mail path (`hive.ts:2254`) writes `undefined` into every subject
  and body.

### 2. 01-24's byte cap converts a DENY into an ALLOW
The plan adds a payload size cap and `destroy()`s the connection when crossed. Every shim does
`c.on('error', () => process.exit(0))`, and the repo's own `test/net-binding.test.cjs:279` states
the rule: *"the shims exit 0 on a connect error, and exit 0 with no stdout is `allow`."*
A `Write` to `<hive>/bin/cth-hook.cjs` padded past the cap is **denied today and allowed after the
fix**. The attacker chooses the size, so no cap value is safe. This is a fail-OPEN gate bypass
introduced by a security fix.

### 3. 01-25's session-id guard accepts the flag it was written to block
Proposed `VALID_SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/`, with an asserted test that
`--dangerously-skip-permissions` returns `false`. Measured: it returns **`true`** — `-` is inside the
character class. The argv-injection half of the vulnerability survives untouched.

### 4. 01-25 would leak the floor's hook token to third parties
The fix puts the hook token into `OTEL_EXPORTER_OTLP_HEADERS` — the same secret as `HIVE_SOCK_TOKEN`
(`pty.ts:701`). That variable is OpenTelemetry-spec'd, read by every OTel SDK for all signals, and
inherited by every grandchild process. An agent running `npm test` in a repo with its own
OTel→vendor config posts `x-hive-token: <token>` to that vendor. Not agent malice — normal ecosystem
behaviour.

### 5. Two fixes cause outages on legitimate work
- **`realResolve` base 2** (`<hive>/agents/<agentId>`) turns **any single `../` token in any Bash
  command** into a "belongs to another agent" deny — `../node_modules/.bin/tsc`, `../shared/lib.ts`.
  `hooks.ts:445` feeds every shell word through the gate. Base 2 adds no security value because
  `hooks.ts:510` already allows the agent its own directory.
- **The widened `redactSecrets`** has no word boundary on `sk[-_]`, so it eats
  `task_scheduler_interval_ms`, `disk_usage_report_generator`, `risk_assessment_matrix_builder`,
  `flask_sqlalchemy_helpers`. Pattern 5 eats `"token": 1200000` and `'x-md-reply-token': cfg.token`
  (a real line at `resources/md-slack-reply.cjs:80`). And `hive.ts:3246` does not refuse the commit —
  it **unstages the path forever**, logged indistinguishably from a real hit.

### 6. The quiesce filter would permanently wedge agents
`delivery.ts:671` and `hooks.ts:842` emit **byte-equivalent** payloads, so guarding on
`status === 'blocked'` swallows Claude Code's real Stop too. `usePtyParser.ts:35` falsely blocks on
`/\(y\/n\)/i` against the terminal tail; today the next real Stop clears it, after the guard nothing
does — and `useHive.ts:761` means that agent never receives mail again. `useHive.ts:532` is the only
clearer of `breakerLevel`, so the state is unrecoverable. One-key fix: mark the synthesized emit and
guard on the source, not the status.

### 7. MIN_WIN 1280→960 has two uncosted consequences
- **`DESIGN.md:169` and `:677` both state "Min window: 1280 × 800"**, and `DESIGN.md` is in **no
  plan's `files_modified`** — not 01-25's, not 01-31's doc sweep. The set would close ROADMAP
  criterion 1's residual while manufacturing a fresh instance of it.
- `SidebarSplitter.tsx:22-35`'s re-clamp calls `onChange` → `setSidebarWidth` → **persists to
  localStorage**. Lowering the floor opens a 256px band (1024–1279) where the operator's chosen
  sidebar width is silently rewritten and persisted — the exact bug `SidebarSplitter.tsx:27-34`
  claims to have killed.

## Claims the gates disproved

Recorded because the plans assert them as fact and an executor would have pasted them into a SUMMARY:

- **No shipped shim can double-handle a payload.** All six emit one payload per connection. Gap 8's
  premise (doubled cost samples, doubled breaker signal) is false; there is nothing to halve.
- **`within()` is segment-safe** — `/hive/binary` is not caught by a `/hive/bin` check. Measured.
- **`realResolve()` handles symlinks, `..`, win32 8.3 names and trailing dots correctly.** The defect
  is the missing base, not the resolution.
- **The `t.skip()` conversions are safe** — no minimum-test-count gate exists anywhere; `ci.yml:115`
  is a bare `npm test` and no test asserts an absolute count. 4 existing skips + 2 conversions = 6.

## What the gates confirmed as sound

- **File ownership is genuinely clean.** 36 declared paths, 36 unique; the union of every task's
  `<files>` equals its plan's `files_modified` exactly, in all eight plans. Zero collisions.
- **The wave graph is acyclic, correctly computed, and matches the declared `wave:` fields.**
- **Every test file has exactly one owner**, `repo-claims.test.cjs` included, and all its pins are
  content-located rather than line-located, so none trips.
- **15 of 16 Critical review findings have a real owner.**

## The one orphan

`b/CR-03` — `rosterMirror.queues` re-seeded from localStorage and re-published to `roster.json`
forever, so pre-migration messages are re-typed into live terminals after a Change Home. Three
separate gates flagged it independently. Plan 01-28 declines it *while owning `store.ts`*, and it
appears in neither `deferred-items.md` nor 01-31's out-of-scope register.

## Structural lesson

Six of nine anchor blockers are **line-range edits**. These plans themselves preach *"prefer a SYMBOL
NAME over a line number"* (01-31) and *"use STRUCTURAL delimiters, never a byte offset"* (01-28).
Applying their own rule to themselves would have survived the entire +3 drift in 01-26.

## Disposition

Revision round 1 required. Every BLOCKER and HIGH above must be resolved, then all six gates re-run.
Per the mandate, execution is gated on a clean round — `--auto` does not bypass it.
