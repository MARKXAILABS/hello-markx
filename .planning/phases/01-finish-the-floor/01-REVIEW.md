---
status: issues_found
phase: 01-finish-the-floor
depth: deep (main, tests) / standard+ (renderer)
scope: 132 changed source files vs origin/main, covered in three disjoint slices
reviewed_at: 2026-08-21
critical: 16
warning: 35
info: 19
slices:
  - 01-REVIEW-a-main.md      # src/main, src/shared, src/preload — 16 files
  - 01-REVIEW-b-renderer.md  # src/renderer — 79 files
  - 01-REVIEW-c-tests.md     # tests, CI, build tooling, docs — 37 files
---

# Phase 01 Code Review — consolidated

Three reviewers covered all 132 changed source files across disjoint slices. Full findings with
`file:line` and failure scenarios live in the three slice files listed in the frontmatter. This
document is the index and the orchestrator's own verification record.

**Advisory, per the workflow — this review does not block. It does establish that Phase 01 must not
be marked complete.**

## Totals

| Slice | Files | Critical | Warning | Info |
|-------|-------|----------|---------|------|
| a — main / shared / preload | 16 | 7 | 11 | 4 |
| b — renderer | 79 | 6 | 11 | 4 |
| c — tests / CI / build / docs | 37 | 3 | 13 | 11 |
| **Total** | **132** | **16** | **35** | **19** |

## Orchestrator-verified findings

The mandate forbids SUMMARY-trust, so the orchestrator independently re-derived the six most
consequential claims at source rather than accepting them. All six hold.

| ID | Claim | Verification performed | Verdict |
|----|-------|------------------------|---------|
| a/CR-01 | The OTLP collector has no authentication | Read `telemetry.ts:314-340` — `handleRequest` has a body-size cap and no token, HMAC or origin check before `ingestMetrics`/`ingestLogs`. Compared against `slack.ts:309-322`, which does HMAC + replay window + timing-safe compare. The header comment claiming the posture "mirrors slack.ts" is false. | **CONFIRMED** |
| a/CR-03 | The hook path gate is bypassable with a relative path | Read `hooks.ts:126-138` — `realResolve(p)` calls `resolve(p)` with ONE argument, so a relative target resolves against main's `process.cwd()`, not the hive root. Every `within(...)` deny branch then compares the wrong path. `grep` for `payload.cwd` in `hooks.ts` returns zero uses — declared and unused, as reported. | **CONFIRMED** |
| b/CR-05 | The 1024px responsive collapse is unreachable | `MIN_WIN = { width: 1280 }` at `index.ts:2516`, applied as the window's `minWidth` at `:2670`. `SIDEBAR_COLLAPSE_WIDTH = 1024` at `sidebarLayout.ts:22`. The window cannot be narrower than 1280, so the collapsed branch is dead code and `renderer-runstate.test.cjs` is green at widths (1023/1000/800/20) the window cannot produce. | **CONFIRMED** |
| b/CR-06 | The AUTO chip under-reports | Read `autoMode.ts:30-50` — returns `false` for `custom` unconditionally and never inspects the raw command string for a bypass flag. The comment justifies this on what *the floor* does; FLOOR-01 asks whether *the agent is running* bypassed, which differs when the operator types the flag themselves. | **CONFIRMED** |
| c/CR-01 | A Windows non-run is laundered as a pass | Read `net-binding.test.cjs:319-325` — `if (process.platform === 'win32') { console.error(...); return; }` inside an `async (t) =>` callback. A `node:test` callback that returns normally is a PASS, not a skip. The published `531 pass / 4 skipped` figure therefore counts at least one Windows non-run as a pass. | **CONFIRMED** |
| c/CR-03 | The shim `sock_token` guard is satisfiable by a comment | Read `hook-auth-roundtrip.test.cjs:163-198` — `shimTemplates()` reads `hive.ts` raw and the guard is `assert.match(body, /sock_token/)`. A commented-out `// payload.sock_token = …` inside a template satisfies it. Five of six shims have no other pin. | **CONFIRMED** |

## Why this matters more than the count

Phase 01 exists because on 2026-08-20 four issues with real landed code and one unmet clause each were
closed against a bar of "some code exists". Three of the sixteen Critical findings are that same defect
recurring **inside the phase built to remove it**:

- `c/CR-01` — a test that cannot fail on the platform it runs on, inflating the phase's own floor figure.
- `c/CR-03` — a source pin a commented-out line satisfies, on five of six security-critical shims.
- `b/CR-05` — a shipped, tested, documented feature that the app's own minimum window size makes unreachable.

Two more are security controls that the phase added and that do not hold:

- `a/CR-01` — GATE-01 hardened hook-socket identity, but the OTLP collector one file over accepts
  `agent.id` / `session.id` off an unauthenticated payload from any process running as the same user.
- `a/CR-03` — the PreToolUse path gate that protects `<hive>/bin`, `<hive>/.git` and other agents'
  directories resolves relative targets against the wrong base.

## Disposition

No fixes were applied. Findings route to gap closure:

```
/gsd:plan-phase 1 --gaps
/gsd:code-review 1 --fix        # for the mechanical subset
```

The three slice files carry the full failure scenarios, reproduction steps and suggested fixes.
