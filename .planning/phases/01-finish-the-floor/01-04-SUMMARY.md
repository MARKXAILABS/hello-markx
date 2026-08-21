---
phase: 01-finish-the-floor
plan: 04
subsystem: release-provenance-and-doc-honesty
tags: [floor-06, floor-17, gate-01, supply-chain, adr, ci-pinning]
requires:
  - "01-01 (Electron 43 runtime; the release pipeline this plan attests is the one 01-01's electron-builder cycle patch keeps buildable)"
provides:
  - "actions/attest-build-provenance@v4 over release/SHA256SUMS.txt in release.yml's publish job, with job-level contents/id-token/attestations permissions"
  - "the SmartScreen honesty sentence in README.md, RELEASE.md and SECURITY.md, each with a runnable `gh attestation verify` command"
  - "docs/adr/0005-cumulative-cost-ledger.md and docs/adr/0006-terminal-pool-lifetime.md, indexed in docs/adr/README.md"
  - "a bug template whose Logs ask is answerable today (platform paths) and forward-linked to FLOOR-05's Settings shortcut"
  - "six parsed repo-fact assertions in test/ci-config.test.cjs, two of them RED-proved"
  - "SECURITY.md's hook-server bullet rewritten for per-agent tokens (GATE-01, carried from plan 02)"
  - "js-yaml as a DECLARED devDependency — the workflow assertions parse, they do not grep"
affects:
  - "01-05 (wave 2) — owns terminalPool.ts and terminalPoolPolicy.ts; ADR-0006 exists here, its two source pointers are plan 05's to add"
  - "01-06 (wave 3) — owns hive.ts startProxyBridge + the three missing shim bodies; SECURITY.md's 'not yet covered' paragraph is the window plan 06 closes"
  - "01-10 (wave 5) — owns bug_report.yml's final wording; drops the by-hand log paths and the 'on the way' marker once FLOOR-05's button ships"
  - "01-23 (wave 9) — owns the FLOOR-06 / FLOOR-17 checkboxes, the #15/#41 closes, and the GATE-01 wholeness assertion across all four doc surfaces"
tech-stack:
  added:
    - "js-yaml ^4.3.1 (devDependency — DECLARED, not newly installed; it was already resolved transitively via electron-updater/electron-builder)"
  patterns:
    - "parse the config, never grep it, when the assertion is about structure, ordering, or key-vs-comment"
    - "a forward dependency declared in prose and discharged in the later plan's notes, rather than a depends_on that would serialize a wave"
    - "state the gap in the security doc rather than describing the boundary the code is going to have"
    - "extract rationale to an ADR and LINK the source comment, never delete it"
key-files:
  created:
    - docs/adr/0005-cumulative-cost-ledger.md
    - docs/adr/0006-terminal-pool-lifetime.md
  modified:
    - .github/workflows/release.yml
    - .github/ISSUE_TEMPLATE/bug_report.yml
    - README.md
    - RELEASE.md
    - SECURITY.md
    - docs/adr/README.md
    - src/main/db.ts
    - src/main/telemetry.ts
    - test/ci-config.test.cjs
    - package.json
    - package-lock.json
decisions:
  - "js-yaml declared as a devDependency and the workflow assertions PARSE: a commented-out attest step still matches `grep -c attest-build-provenance` (proved: it returned 1 on the broken file while the parsed test went red), and ci.yml says 'continue-on-error' twice in prose including once inside the test job itself"
  - "CONTRIBUTING.md:82-101 verified clause by clause against ci.yml and NOT rewritten — all three claims confirmed true, so the correct action was to pin it, not to edit it"
  - "SECURITY.md states the sidecar/pi/opencode shims send no token and their events are dropped, rather than omitting them — a fail-closed gap named out loud beats a boundary claimed early"
  - "the ceiling is stated as D-14's two properties only; 'agent A cannot authenticate as agent B' is deliberately NOT claimed because it is false on Linux"
metrics:
  duration: ~1h50m
  completed: 2026-08-21
---

# Phase 01 Plan 04: Release Provenance, Doc Honesty and Two ADRs Summary

FLOOR-06's one genuinely-open clause now ships — Sigstore build provenance over the merged
checksums file, attested between the merge and the upload so the attested digests are the bytes
that ship — and the three docs say plainly that it does **not** suppress SmartScreen. FLOOR-17's
bug template asks for logs that exist, and two pieces of ADR-shaped rationale moved to
`docs/adr/` with their source comments linked rather than deleted. Task 4 carried GATE-01's
fourth stale doc surface.

**Commits:** `dc9478b` (task 2) · `a50b713` (task 3) · `89283bb` (task 4). Task 1 is
evidence-only and declared `<files>(none)</files>`, so it produced no commit — its output is the
first section below.

---

## Task 1 — evidence (no files, no commit)

Every command below was run on this machine at HEAD `2b1bcba`, before any edit. **Every
baseline the plan stated was measured and matched.**

### Issue acceptance text, verbatim

**#15** — *H7 — Release pipeline: Windows/Linux ship unsigned, the release-link gate is not
wired in, no Node runtime pin.* Its Fix list:

> - Azure Trusted Signing via `win.azureSignOptions` gated on the Windows runner
> - `- run: npm run check:links` before publish and `--live` after
> - `"engines": {"node": ">=20 <23"}` + `.nvmrc` + a **Windows prerequisites** block in `CONTRIBUTING.md`
> - Make the patch script exit non-zero when unpatched; pin `node-pty` exactly
> - Add `actions/attest-build-provenance`

**#41** — *L5 — Bug template is macOS-only and asks for logs that are never written; no
ADR/decision log.* Its Fix list:

> OS dropdown; a `docs/adr/` directory seeded from the largest existing rationale comments.

### One command per clause, output pasted

```
$ grep -n "sha256sum\|shasum\|SHA256SUMS" .github/workflows/release.yml
150:          if command -v sha256sum >/dev/null 2>&1; then
151:            sha256sum $files > "SHA256SUMS-${{ matrix.os }}.txt"
153:            shasum -a 256 $files > "SHA256SUMS-${{ matrix.os }}.txt"
155:          cat "SHA256SUMS-${{ matrix.os }}.txt"
171:            dist/SHA256SUMS-*.txt
194:          cat artifacts/*/SHA256SUMS-*.txt > release/SHA256SUMS.txt 2>/dev/null || true
219:            release/SHA256SUMS.txt
EXIT=0

$ grep -n "check:links\|needs: links" .github/workflows/release.yml
33:        run: npm run check:links
37:    needs: links
230:        run: npm run check:links -- --live
EXIT=0

$ grep -n "attest" .github/workflows/release.yml
EXIT=1
```

**The empty grep IS the evidence (D-43).** Exit 1, no output: `attest` appeared nowhere in the
release workflow. That is FLOOR-06's one genuinely open clause.

```
$ grep -rn "SmartScreen" README.md RELEASE.md SECURITY.md .github/workflows/release.yml
.github/workflows/release.yml:111:  echo "::warning::Azure Trusted Signing is not configured - Windows
  installers ship UNSIGNED and every user hits SmartScreen on the primary install path. …"

$ grep -n -i "logs" .github/ISSUE_TEMPLATE/bug_report.yml
26:    id: logs
28:      # The app writes no log file (#13), so asking for "the logs" just sends

$ grep -c "11 tests" CONTRIBUTING.md
0
```

The honesty sentence existed only as a CI `::warning::` that no user ever reads — in none of the
three documents. The bug template's only mention of logs was a comment saying no log file
exists. `11 tests` returned `0` as the plan predicted: **that grep passes before any work is
done and was not used as a completion criterion.**

### Clause classification

| Requirement | Clause | Status at 2b1bcba |
|---|---|---|
| FLOOR-06 | published checksums | **ALREADY-SATISFIED** — generated per platform at `:143-155`, merged at `:194`, uploaded at `:219`. **Not scheduled for rebuild.** |
| FLOOR-06 | release-link gate runs in the pipeline | **ALREADY-SATISFIED** — `links` job at `:33`, `build` declares `needs: links` at `:37`, and `--live` re-checks after publish at `:230`. **Not scheduled for rebuild.** |
| FLOOR-06 | provenance | **OPEN** — the empty grep above |
| FLOOR-06 | the SmartScreen honesty sentence | **OPEN** — present in no document |
| FLOOR-17 | bug template asks for logs that exist | **OPEN** — the template said "There is no log file yet", which stopped being true when #13 landed the `main.log` sink (`src/main/index.ts` `initFileLogging` / `logsDir`) |
| FLOOR-17 | `docs/adr/` is the home for buried rationale | **PARTIAL** — the home exists (`0001`–`0004` + README); the migration of further rationale was open |

Also confirmed already-satisfied and left alone: #41's OS dropdown (`bug_report.yml` already
offers macOS / Windows / Linux) and #15's `engines` + `.nvmrc` pin (pinned, and already asserted
by this very test file).

### Action currency re-verified (RESEARCH is only valid to 2026-09-03)

```
$ gh api repos/actions/attest-build-provenance/tags --jq '.[].name' | head -5
v4.2.2
v4.1.1
v4.1.0
v4.0.0
v4

$ gh api repos/actions/attest-build-provenance/contents/action.yml | base64 -d | grep -A4 "subject-checksums:"
  subject-checksums:
    description: >
      Path to checksums file containing digest and name of subjects for
      attestation. Must specify exactly one of "subject-path", "subject-digest",
      or "subject-checksums".
```

`v4` is current (latest `v4.2.2`) and `subject-checksums` is still an accepted input. RESEARCH
holds.

### B-ciconfig baseline, under the TAP reporter

```
$ TAP=$(mktemp); node --test --test-reporter=tap test/ci-config.test.cjs > "$TAP"; echo "EXIT=$?"
$ grep -E "^# (tests|pass|fail|skipped|todo) " "$TAP"
EXIT=0
# tests 3
# pass 3
# fail 0
# skipped 0
# todo 0
```

**B-ciconfig = 3.** Recorded under the reporter, not the exit code, per the plan's reason: an
all-skipped file also exits `0`.

---

## Task 2 — attestation + the SmartScreen sentence (`dc9478b`)

`release.yml`'s `publish` job gained a job-level `permissions` block and one step. Nothing else
in the workflow moved: the `links` gate and the checksum generation were classified
ALREADY-SATISFIED in task 1 and were not touched.

`contents: write` is **restated** in the job block. A job-level `permissions` block replaces the
workflow-level one rather than extending it, and omitting it is the silent failure mode —
attestation would keep working while the release upload started 403ing.

Placement, proved by parse rather than by eye:

```
$ node -e "…yaml.load('.github/workflows/release.yml')…"
publish perms: {"contents":"write","id-token":"write","attestations":"write"}
0 actions/checkout@v4
1 actions/setup-node@v4
2 actions/download-artifact@v4
3 Flatten + merge checksums
4 Attest build provenance          ← after the merge
5 Publish to GitHub Release        ← before the upload
6 Verify published downloads resolve
```

| Criterion | Required | Measured |
|---|---|---|
| `grep -c "attest-build-provenance" .github/workflows/release.yml` | 1 | **1** |
| `grep -c "subject-checksums" .github/workflows/release.yml` | 1 | **1** |
| `grep -c "id-token: write" .github/workflows/release.yml` | ≥1 | **1** |
| `attestations: write` + job-level `contents: write` in the same block | present | **both present** (parse above) |
| workflow still parses as valid YAML | yes | **yes** — parsed with `js-yaml`, output above |
| `grep -c -i "smartscreen"` in README / RELEASE / SECURITY | ≥1 each | **1 / 1 / 1** |
| `grep -c "gh attestation verify"` across the three, total | ≥1 | **3** (one each) |

The three doc edits each say the same two things: provenance plus checksums prove the artifact
came from this repo at this commit and give the verification command, **and** they do not
suppress SmartScreen (or Gatekeeper), because every route to code signing is a recurring charge
this project does not pay. In `SECURITY.md` it sits under *Known limitations*, which is where
the file itself says trust decisions get made from.

`npm run check:links` green after the doc edits — `✓ release links consistent at v0.4.4`.
`README.md` is not a file `check:links` scans (it reads `RELEASE.md`, `docs/index.html`,
`docs/llms.txt`), so its new section is deliberately version-free and points at
`/releases/latest`.

---

## Task 3 — template, CONTRIBUTING, two ADRs, and the pins (`a50b713`)

### CONTRIBUTING.md — verified and pinned, NOT rewritten

Read `:82-101` clause by clause against `.github/workflows/ci.yml`. **All three claims
confirmed. Nothing corrected, nothing "cleaned up", the file is unmodified by this plan.**

| Doc claim | Source of truth | Verdict |
|---|---|---|
| "All three platforms are hard gates. Linux, macOS and Windows must all be green" | `ci.yml` `test.strategy.matrix.os = ["ubuntu-latest","windows-latest","macos-latest"]`, `fail-fast: false` | **CONFIRMED** |
| "there is no `continue-on-error` anywhere in the test matrix, and please do not add one" | parsed: `test` job has no job-level `continue-on-error` and **no step** carries one. The two real ones are `typecheck`'s *npm audit (high and above)* step and `build`'s *Rebuild native modules* step — **both outside the matrix** | **CONFIRMED**, and the wording is precise: it must NOT be broadened to "anywhere in ci.yml", which would be false |
| `test:focused` is "never the thing you gate a PR on" | `ci.yml:99` runs `npm test`; `grep -rn "test:focused" .github/workflows/` is **empty** | **CONFIRMED** |

```
$ grep -c "continue-on-error" .github/workflows/ci.yml
4
```

The baseline, unchanged — nothing was added. Two of those four are prose inside comments
(`:47` inside the `test` job itself, `:115` inside `build`); two are real keys, both outside the
matrix. **That split is why the pin had to parse rather than grep** — see the decision below.

```
$ grep -c "there is no .continue-on-error. anywhere in the test matrix" CONTRIBUTING.md
1
```

Preservation criterion: baseline `1`, still `1`.

### Bug template

The Logs field said *"There is no log file yet."* That was true when written and is not any
more: #13 landed a file sink that tees every `console.*` in main into `main.log` under
`app.getPath('logs')`, rotating once at 5 MB. A template asking for something that does not
exist and a template denying something that does are the same defect.

Written **conditionally**, as the plan requires. It now gives the three platform paths
(`%APPDATA%\Hello MarkX\logs\`, `~/Library/Logs/Hello MarkX/`, `~/.config/Hello MarkX/logs/`)
plus `main.log` / `main.log.1`, so it is answerable **today**, and names *Settings → open log
folder* as **on the way (FLOOR-05)** rather than as something that exists. A source comment on
the field tells plan 10 to drop the by-hand paths and the marker once its button ships. This is
a **forward dependency declared in prose, not a `depends_on`** — plan 10 is wave 5, three waves
out, and a `depends_on` would serialize this wave for nothing.

**Two further unanswerable asks found and fixed** (the plan asked for exactly this sweep):

1. The Pre-flight checkbox *"I re-ran `npm install` so `node-pty` is rebuilt for the current
   Electron ABI"* was `required: true`. Nobody on a **downloaded release build** runs npm at
   all, so a required field forced them to either lie or abandon the report. Scoped to the
   route it applies to, with the source comment recording why.
2. The **Node version** input is `required: true` with placeholder `node -v`. A release build
   bundles its own runtime, so a reporter who never built from source has nothing to run. The
   placeholder now offers `"none"`, keeping the field required and always answerable.

No fields were added.

### The two ADRs

**`docs/adr/0005-cumulative-cost-ledger.md`** — the ledger row-semantics contract. Rows are
cumulative snapshots per `(agent_id, session_id)`; velocity is the **difference** between
consecutive rows, never their sum, because summing N snapshots of a session ending at T tokens
gives about `N·T/2`.

The plan's stated rationale — *"it was violated by a second appender writing per-response deltas
into the same file"* — **was checked against source rather than reproduced, and it is
correct.** There are two callers of `appendCostLedger`:

```
$ grep -rn "appendCostLedger" src/
src/main/hive.ts:2604:  appendCostLedger(sample: AgentUsageSample): void {
src/main/hooks.ts:555:        this.hive.appendCostLedger({
src/main/index.ts:1524:    if (sample?.sessionId) hive.appendCostLedger(sample);
```

`index.ts:1524` appends genuine cumulative `AgentUsageSample` rows on the ~30 s beat.
`hooks.ts:549-571` handles the qwen sidecar's `CostSample` event and builds its row from
`p.input` / `p.output` off **one response's** usage — per-response deltas — into the same file,
with nothing in the row saying which kind it is. `taskSpend()` (`hive.ts:2657`) then does
`tokens += (row.input ?? 0) + (row.output ?? 0)` across both, so the same function is right on
one engine's rows and quadratically wrong on another's. That is RECORD-04, and RECORD-03 rides
with it because the same read is windowed to `COST_TAIL_BYTES` (1 MB). Both are FLOOR-10
prerequisites for one reason the ADR states: enforcing a cap against a truncated,
over-counted number is worse than having no cap, because it gives a confident wrong answer
instead of an obvious missing one.

**`docs/adr/0006-terminal-pool-lifetime.md`** — one xterm `Terminal` per pty for the app's
lifetime, because node-pty keeps no scrollback and a create/dispose-per-view lifecycle is the
"terminal vanishes until I drag the splitter" bug. Records both bounding rules — the
`TERMINAL_POOL_MAX` cap as the backstop for churn, the roster orphan sweep as the fix for the
actual leak (#20), both refusing to touch an attached terminal — and the recorded reason the
per-call-site dispose approach was rejected: there are several drop paths (archive, the
main-process archive broadcast, the dead-pty reconcile at startup, a plain remove), *"they did
not agree with each other, and the next one added would not have either"*.

Both follow `0002`'s shape, including its **Where it lives** section. Neither deletes the source
comment it came from.

### ADR pointer comments — the ownership split, stated so no later wave undoes it

| Pointer | File | Owner | Status |
|---|---|---|---|
| `docs/adr/0005-cumulative-cost-ledger.md` | `src/main/db.ts` — appended to the reserved `cost_ledger` block in the `MIGRATIONS` header | **this plan** | **ADDED, `a50b713`** |
| `docs/adr/0005-cumulative-cost-ledger.md` | `src/main/telemetry.ts` — appended to the `AgentUsageSample` contract comment | **this plan** | **ADDED, `a50b713`** |
| `docs/adr/0006-terminal-pool-lifetime.md` | `src/renderer/src/components/terminalPool.ts` | **plan 05, this same wave** | **NOT added here, by design** |
| `docs/adr/0006-terminal-pool-lifetime.md` | `src/renderer/src/store/terminalPoolPolicy.ts` | **plan 05, this same wave** | **NOT added here, by design** |

`src/main/db.ts` and `src/main/telemetry.ts` are also touched by plan 06 (wave 3) and plan 10
(wave 5), both **later** waves, so the ordering is safe — but the two one-line edits are listed
explicitly above so neither plan reverts them while editing nearby.

The two ADR-0006 pointers are plan 05's because plan 05 may conditionally edit `terminalPool.ts`
as part of its drop-path fix, and two plans editing one file in one wave in one working tree is
a lost update. **ADR-0006 is written here; plan 05 points at it.** Verified untouched:

```
$ git diff --name-only 2b1bcba..89283bb -- src/renderer/src/components/terminalPool.ts \
                                            src/renderer/src/store/terminalPoolPolicy.ts
(empty)
```

### DECISION — the pin parses the YAML, and `js-yaml` is now declared

The plan left this open: *"Either add the assertion with a plain read, or declare the parser as
an explicit decision this plan makes."* **Declaring the parser is the decision**, chosen because
it is the root-cause option and the plain read cannot answer two of the four questions:

1. **A commented-out step still matches a string search.** T-P04-04's whole premise is "the
   attestation step is silently dropped in a later refactor". Proved, not argued — with the step
   commented out, `grep -c "attest-build-provenance" .github/workflows/release.yml` **still
   returned `1`**, while the parsed test went red. A grep-based pin would have shipped green
   over a dead workflow.
2. **`continue-on-error` cannot be located by text.** It appears four times in `ci.yml`, twice
   as prose in comments — including once **inside the `test` job**, in the very sentence
   promising there is none. A text-region search of that job returns a hit today, when the true
   answer is zero.
3. **Ordering is an index comparison** (merge < attest < upload) and needs a parsed list.
4. `js-yaml` was already resolved in the tree at 4.3.1 — but only **transitively**, via
   `electron-updater` and `electron-builder`. Depending on someone else's transitive hoist is
   the "works by accident" class this phase exists to remove: an unrelated dependency bump that
   dedupes differently makes `npm test` fail with `MODULE_NOT_FOUND` on a PR that touched
   nothing. Declaring it does not add bytes, it removes an accident.

The lockfile was written with the pinned toolchain (**Node 22.23.2 / npm 10.9.8**, the exact
pairing CI's `setup-node` installs, never the npm 11 that ships with Node 24) using
`npm install --save-dev --package-lock-only --ignore-scripts`. The diff is **one line in each
file** — `package.json` gains `"js-yaml": "^4.3.1"` in `devDependencies`, `package-lock.json`
gains the same line in the root package's dev list — because the resolved `node_modules/js-yaml`
entry already existed.

### The pins added

Five tests in task 3, one more in task 4. Every assertion message states what a failure would
**mean**, not just what it saw.

| Test | Pins |
|---|---|
| `release.yml attests the artifacts it publishes, with the permissions to do it` | all three job-level permissions by key **and** value; the attest step exists as a real `uses`; it declares `subject-checksums`; `merge < attest < upload` |
| `the \`test\` matrix is a hard gate on all three platforms, exactly as CONTRIBUTING.md claims` | all three OSes in the matrix; no job-level `continue-on-error`; no step carrying one; CONTRIBUTING.md still contains the hard-gate sentence |
| `no workflow gates a PR on the hand-picked test subset` | no workflow references `test:focused` (#7) |
| `docs/adr/ holds the numbered records and README.md indexes every one` | ≥6 numbered records, and README links **each one by filename** |
| `the bug template asks only for things a reporter can actually produce` | the template parses; the Logs description names **Settings** and **main.log** |
| `SECURITY.md describes the per-agent hook token…` (task 4) | see below |

| Criterion | Baseline | Required | Measured |
|---|---|---|---|
| `ls docs/adr/*.md \| wc -l` | 5 | ≥7 | **7** |
| `grep -c "0005" docs/adr/README.md` | 0 | ≥1 | **1** |
| `grep -c "0006" docs/adr/README.md` | 0 | ≥1 | **1** |
| `grep -rc "adr/0005" src/main/db.ts src/main/telemetry.ts` | 0 / 0 | 1 / 1 | **db.ts:1, telemetry.ts:1** |
| `grep -c "continue-on-error" .github/workflows/ci.yml` | 4 | 4 | **4** |
| `grep -c "there is no .continue-on-error. anywhere in the test matrix" CONTRIBUTING.md` | 1 | 1 | **1** |
| `grep -c "continue-on-error" test/ci-config.test.cjs` | 0 | ≥1 | **7** |
| TAP after task 3 | `# pass 3` | `# pass ≥6`, `# fail 0`, `# skipped 0`, `# todo 0` | **`# tests 8` / `# pass 8` / `# fail 0` / `# skipped 0` / `# todo 0`, EXIT=0** |
| `npm test` | exit 0 | exit 0 | **exit 0 — 443 tests / 439 pass / 0 fail / 4 skipped** |

### RED proofs — the two parse-only assertions, proved able to fail

```
# RED 1 — comment the attest step out (4 lines prefixed with '#')
$ grep -c 'attest-build-provenance' .github/workflows/release.yml
1                                    ← a string-match test would have PASSED here
not ok 4 - release.yml attests the artifacts it publishes, with the permissions to do it
  error: `release.yml's publish job no longer attests build provenance. …`
# pass 7 / # fail 1
$ # restored → # pass 8 / # fail 0

# RED 2 — add continue-on-error: true to the test job's "Run the test suite" step
not ok 5 - the `test` matrix is a hard gate on all three platforms, exactly as CONTRIBUTING.md claims
  these steps in the CI test job would swallow their own failure: Run the test suite. A test step
  that cannot fail is not a gate, and CONTRIBUTING.md promises it is one.
# pass 7 / # fail 1
$ # restored → # pass 8 / # fail 0, and `git diff --stat` on both workflows is empty (no residue)
```

---

## Task 4 — GATE-01's SECURITY.md correction (`89283bb`)

**This task is NOT FLOOR-06 or FLOOR-17 work.** It is **GATE-01**, which is
`01-02-PLAN.md`'s requirement. It landed here because `SECURITY.md` is in this plan's
`files_modified` for this wave, and two plans editing one file in one wave in one working tree
is a lost update. Plan 02 owns and corrected the other three surfaces. **Report this clause
against GATE-01's issue, not against #15 or #41.**

### Reconciliation with plan 02 — measured at HEAD, not read from its SUMMARY

The plan requires this task to state whether plan 02's tokens landed and whether its D-13 gap is
open. Verified live:

```
$ grep -n "mintToken\|revokeToken\|revokeAgent" src/main/hooks.ts | head -3
316:  mintToken(agentId: string): string {
326:  revokeToken(token: string): void {
332:  revokeAgent(agentId: string): void {

$ grep -n "setHookTokenSource" src/main/*.ts
src/main/index.ts:477:ptyManager.setHookTokenSource(
src/main/pty.ts:393:  setHookTokenSource(mint: …, revoke: …): void {

$ grep -n "process.env.HIVE_SOCK_TOKEN = " src/main/index.ts       # D-12's mandatory deletion
(empty — the floor-wide assignment is GONE)

$ grep -n "hookSockToken" src/main/*.ts
(empty — the function itself is GONE)
```

**Plan 02's per-agent tokens HAVE landed.** The PTY half of the description is shipped code, not
a locked decision written ahead of it.

```
$ sed -n '/private startProxyBridge/,/^  }$/p' src/main/hive.ts | grep -c "HIVE_SOCK_TOKEN"
0                                                    ← D-13's hive.ts gap is OPEN

$ for t in HOOK_SHIM AGY_HOOK_SHIM PI_EXTENSION OPENCODE_PLUGIN PROXY_BRIDGE_SHIM GROK_HOOK_SHIM; do
    sed -n "/^const $t = \`/,/^\`;/p" src/main/hive.ts | grep -c "HIVE_SOCK_TOKEN"; done
1 1 0 0 0 1                                          ← unchanged; plan 06 task 4 takes it to 1 1 1 1 1 1
```

**D-13's `hive.ts` scope gap is OPEN**, owned by plan 06 task 4 in wave 3. So `SECURITY.md`
does **not** say the qwen proxy sidecar carries a token. It states the gap:

> **Not yet covered, and it fails closed.** Three of the six lifecycle shims send no token at
> all today — the per-agent proxy sidecar, and the pi and OpenCode extensions — so the hook
> server drops everything they post. […] That is a gap being closed, not a design: until it is,
> treat the hook boundary as enforced only for the engines whose shims send a token.

A doc that runs ahead of the code is the same defect as one that lags it. Plan 06's SUMMARY
closes this window; this file does not close it early.

### The ceiling, stated narrowly

Exactly D-14's two properties: **there is no floor-wide key** (reading one agent's token buys
that agent's identity, not the floor's) and **the payload's own `agent_id` is never trusted**.

The broader claim *"agent A cannot authenticate as agent B"* is **deliberately not written**,
because it is false on the platform most of this floor runs on: B's token lives in B's process
environment, and a same-uid sibling on Linux reads it out of `/proc/<B-pid>/environ`, which the
deny list does not cover. The file says so in as many words. Secrecy is not claimed either.

The paragraph names **symbols, not line numbers** (`mintToken`, `authorized`, `hooks.ts`), per
this file's own rule at `:31-32`.

### Criteria — baseline and after, both pasted

| Criterion | Baseline | Required | Measured |
|---|---|---|---|
| `grep -c "process-local token" SECURITY.md` | **1** | 0 | **0** |
| `grep -c "minted fresh at each app start" SECURITY.md` | **1** | 0 | **0** |
| `grep -c "per-agent" SECURITY.md` | **1** | ≥2 | **3** — a strict delta, so the claim was REPLACED, not merely deleted |
| `tr -s '[:space:]' ' ' < SECURITY.md \| grep -c "not a defence against a process that can already read this app's child environments"` | **1** | 1 | **1** — preserved |
| the same phrase under a plain `grep -c` | **0** | — | **0** — which is why the squeeze is the right form: the sentence wraps |
| `git diff --name-only` for this task | — | `SECURITY.md` + `test/ci-config.test.cjs` only | **exactly those two** |
| `grep -c "ARCHITECTURE.md" test/ci-config.test.cjs` | 0 | 0 | **0** (also `HIVE.md` **0**, `INTEGRATIONS.md` **0** — named nowhere, comments included) |
| TAP | `# pass 8` | ≥8, `# fail 0`, `# skipped 0`, `# todo 0` | **`# tests 9` / `# pass 9` / `# fail 0` / `# skipped 0` / `# todo 0`, EXIT=0** |
| `npm test` | exit 0 | exit 0 | **exit 0 — 444 tests / 440 pass / 0 fail / 4 skipped** |

The proxy-sidecar bullet directly beneath (`- **The proxy sidecar** …`) was verified undisturbed.

### RED proof for the SECURITY.md pin

```
# RED — restore the stale floor-wide wording
$ grep -c 'process-local token' SECURITY.md ; grep -c 'minted fresh at each app start' SECURITY.md
1
1
not ok 9 - SECURITY.md describes the per-agent hook token, not the floor-wide secret it replaced
    SECURITY.md still says "process-local token", which describes the single floor-wide hook
    secret that no longer exists. Tokens are now minted per agent per PTY spawn and the sender
    identity is derived server-side. A stale trust-boundary claim is worse than no claim.
# pass 8 / # fail 1

# GREEN — restore the fix
$ grep -c 'process-local token' SECURITY.md ; grep -c 'per-agent' SECURITY.md
0
3
# tests 9 / # pass 9 / # fail 0 / # skipped 0 / # todo 0
```

### GATE-01 doc surfaces — where the four live, so the issue can cite them in one place

| Surface | Owner | Status |
|---|---|---|
| `SECURITY.md` hook-server bullet | **this plan, task 4** | **DONE — `89283bb`**, pinned in `test/ci-config.test.cjs` |
| `HIVE.md` §5 | plan 02 | done (`e6ed5f0`), pinned in `test/net-binding.test.cjs` |
| `.planning/codebase/ARCHITECTURE.md` | plan 02 | done (`e6ed5f0`), pinned in `test/net-binding.test.cjs` |
| `.planning/codebase/INTEGRATIONS.md` | plan 02 | done (`e6ed5f0`), pinned in `test/net-binding.test.cjs` |

**No document now describes one floor-wide hook secret.** The pins are split across two test
files on purpose: asserting plan 02's three files here would have failed this plan on another
plan's work, and asserting `SECURITY.md` there would have failed plan 02 on this one.

**GATE-01 is still NOT complete** — the docs are whole, the code is not. `hive.ts`
`startProxyBridge` and three shim bodies are plan 06 task 4, wave 3; plan 23 asserts it whole in
wave 9.

---

## Verification

| Check | Result |
|---|---|
| `npm test` | **exit 0 — 444 tests / 440 pass / 0 fail / 4 skipped** (baseline 438/434/0/4; +6 tests, all new, all passing) |
| `npm run typecheck` (node + web) | **exit 0** |
| `npm run check:links` | **exit 0** — `✓ release links consistent at v0.4.4` |
| release workflow parses as valid YAML | **yes** — parsed with `js-yaml`, and now asserted inside `test/ci-config.test.cjs` rather than by eye |
| `node --test test/ci-config.test.cjs` | **exit 0 — 9/9** |
| CI on all three platforms | **GREEN, all six jobs, at `89283bb`** (the commit carrying all four tasks) **and again at `e6f9669`** (HEAD, docs) on PR [#77](https://github.com/MARKXAILABS/hello-markx/pull/77) — Typecheck, Test ubuntu, Test windows, Test macOS, Build, Electron smoke. Verified on the remote with `gh run view`, not assumed. |

Local toolchain for anything touching the lockfile: Node **22.23.2** / npm **10.9.8** (portable
Node 22), matching CI's `setup-node`. System Node is 24.13.0 and was not used for the lockfile
write.

### OUTSTANDING — FLOOR-06's live sample

**`gh attestation verify <artifact> --repo MARKXAILABS/hello-markx` has NOT been run, and cannot
be.** The attestation is produced by `release.yml`'s `publish` job, which is gated on
`startsWith(github.ref, 'refs/tags/')` — no `v*` tag has been pushed since this change landed,
so no attested artifact exists to verify. Per `01-VALIDATION.md` § Manual-Only Verifications
this is FLOOR-06's live sample and it is **recorded as outstanding, not claimed**. After the
next `v*` tag, run it against a published artifact and paste the output. Until then the
provenance clause is verified *structurally* (the step, its input, its permissions and its
position are asserted by a parsed test) and **not** end-to-end.

The plan's success criterion says ROADMAP criterion 2's provenance half is TRUE. It is true of
the pipeline; it is not yet demonstrated on a shipped artifact. That distinction is the whole
point of this plan and is stated here rather than smoothed over.

---

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Bug] README.md claimed CI gates on `test:focused`**

- **Found during:** Task 2, reading `README.md` for the download section
- **Issue:** `README.md:167` read `npm run test:focused  # the curated subset CI gates on`. It is
  false: `ci.yml:99` runs `npm test`, `test:focused` appears in **no** workflow, and
  `CONTRIBUTING.md` tells contributors it is *"never the thing you gate a PR on"*. A hand-listed
  subset presented as the gate is exactly how eight test files went unrun for months (#7) — and
  a false self-claim in a doc this plan owns, in the plan whose purpose is removing them.
- **Fix:** corrected both lines to say `npm test` is what CI gates on and `test:focused` is a
  tight-loop subset, never a gate. Pinned by the new `no workflow gates a PR on the hand-picked
  test subset` test, so it cannot come back.
- **Files:** `README.md`, `test/ci-config.test.cjs` · **Commits:** `dc9478b`, `a50b713`

**2. [Rule 2 — Missing critical functionality] Two required bug-template fields were
unanswerable on the release-build route**

- **Found during:** Task 3 — the plan explicitly asked for this sweep
- **Issue:** the Pre-flight checkbox demanded the reporter confirm they re-ran `npm install`,
  `required: true`; and the Node version input was `required: true` with placeholder `node -v`.
  Neither is producible by someone who installed a release build, so a required field forced a
  false answer or an abandoned report — the same class as asking for logs that do not exist.
- **Fix:** the checkbox is scoped to the from-source route; the Node placeholder offers `"none"`.
  Both keep `required: true`. No fields added.
- **Files:** `.github/ISSUE_TEMPLATE/bug_report.yml` · **Commit:** `a50b713`

**3. [Rule 3 — Blocking issue] `js-yaml` was undeclared**

- **Found during:** Task 3
- **Issue:** the plan's own correction flagged that `test/ci-config.test.cjs` does not parse YAML
  and `js-yaml` is not a declared dependency. The pin the threat model requires (T-P04-04)
  cannot be written without a parser, for the three reasons recorded under the decision above.
- **Fix:** declared `js-yaml ^4.3.1` as a devDependency, lockfile written by npm 10.9.8 under
  Node 22.23.2. One-line diff in each file; no new bytes installed.
- **Files:** `package.json`, `package-lock.json` · **Commit:** `a50b713`

### Deliberate non-changes

- **`CONTRIBUTING.md` is unmodified.** Verified clause by clause against `ci.yml`; all three
  claims true. The plan warned that deleting and replacing that paragraph would destroy correct,
  informative prose, and the read confirmed there was nothing to correct. Pinned instead.
- **`src/renderer/src/components/terminalPool.ts` and
  `src/renderer/src/store/terminalPoolPolicy.ts` untouched** — plan 05's, this same wave.
- **`HIVE.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/INTEGRATIONS.md`
  untouched** — plan 02's, this same wave, and not named anywhere in this plan's test file.
- **FLOOR-06's two already-satisfied clauses were not rebuilt** — the `links` gate and the
  checksum steps were classified in task 1 and left alone.

### Authentication gates

None. `gh` was already authenticated as MARKXAILABS.

---

## must_haves — every truth, adjudicated

| Truth | Verdict |
|---|---|
| "A downloaded release artifact can be traced to this repo and this commit via `actions/attest-build-provenance` plus published checksums" | **SATISFIED STRUCTURALLY, NOT LIVE.** The step, its `subject-checksums` input, its three job-level permissions and its position between merge and upload are all present and asserted by a parsed test. **No artifact has been verified end-to-end** — the publish job is tag-gated and no `v*` tag has been pushed. Outstanding, named above. |
| "The docs say plainly that provenance does NOT suppress SmartScreen" | **SATISFIED.** README.md, RELEASE.md and SECURITY.md, one `smartscreen` hit each, each with `gh attestation verify`. |
| "The bug template asks only for logs a user can actually reach" | **SATISFIED.** Platform paths + `main.log` are reachable today; the Settings shortcut is named as arriving, not as existing. Two further unreachable required asks fixed. |
| "`docs/adr/` holds the rationale currently buried in long source comments, with the source comments linked rather than deleted" | **SATISFIED for ADR-0005** — both pointers added, both source comments intact. **PARTIALLY SATISFIED for ADR-0006 by design**: the record exists and its source comments are intact, but its two pointers are plan 05's to add, in this same wave. Until plan 05 lands them, `terminalPool.ts` and `terminalPoolPolicy.ts` carry no link to `0006`. Stated, not implied. |
| "CONTRIBUTING.md's Windows-gate paragraph matches ci.yml, and `test/ci-config.test.cjs` pins it so it cannot silently rot back" | **SATISFIED.** All three claims confirmed against a parsed `ci.yml`; pinned and RED-proved. |
| "SECURITY.md's hook-server paragraph describes the PER-AGENT tokens plan 02 lands in this same wave, not the floor-wide secret they replace" | **SATISFIED.** Plan 02's code verified landed at HEAD before the prose was written. The sidecar gap is stated rather than papered over. |

### Artifacts

| Path | Provides | Contains | Verdict |
|---|---|---|---|
| `.github/workflows/release.yml` | attestation step with job-level contents/id-token/attestations permissions | `attest-build-provenance` | **present** (`grep -c` = 1) |
| `docs/adr/0005-cumulative-cost-ledger.md` | the ledger row-semantics contract RECORD-03/04 exist because it was violated | — | **present**, and the violation verified against source |
| `test/ci-config.test.cjs` | plain-read assertions over package.json and .nvmrc | `attestations` | **present**, and extended with parsed workflow assertions per the recorded decision |
| `SECURITY.md` | the SmartScreen honesty sentence AND the per-agent hook-token correction | `per-agent` | **present** (3 hits) |

### Key links

| From → To | Pattern | Verdict |
|---|---|---|
| `release.yml` publish job → `release/SHA256SUMS.txt` | `subject-checksums` | **present** (1 hit), and the parsed test asserts the merge step precedes it |
| `bug_report.yml` → Settings → open logs (plan 10, wave 5) | `[Ll]ogs` | **present**, marked as arriving with FLOOR-05, and asserted by the template test |
| `SECURITY.md` hook-server paragraph → plan 02's per-agent token registry | `HIVE_SOCK_TOKEN` | **present** (1 hit), naming the symbol not a line number |

---

## Threat register — dispositions

| Threat ID | Disposition | Status |
|---|---|---|
| T-P04-01 Tampering — published release binaries | mitigate | **Done structurally.** Attested over the merged checksums, after flatten, before upload. Live `gh attestation verify` outstanding until the next tag. |
| T-P04-02 Spoofing — a user trusting an unsigned binary because "it has provenance" | mitigate | **Done.** All three docs state the limitation; none overclaims. |
| T-P04-03 EoP — over-broad workflow token | mitigate | **Done.** Job-level `permissions` on `publish` only, exactly the three needed; the rest of the workflow keeps the narrower workflow-level `contents: write`. |
| T-P04-04 Repudiation — attestation step silently dropped in a refactor | mitigate | **Done, and RED-proved.** The parsed test fails on a commented-out step, which a string match would not catch — measured. |
| T-P04-05 Repudiation — docs claiming a CI gate that is not enforced | mitigate | **Done.** `ci.yml` parsed as the single source of truth; both the matrix shape and the CONTRIBUTING sentence pinned, RED-proved. |
| T-P04-06 Repudiation — SECURITY.md describing a floor-wide hook secret | mitigate | **Done, and RED-proved.** Rewritten for per-agent tokens, honest ceiling sentence preserved, pinned by greps that fail while the stale wording survives. |

## Threat Flags

None. No file changed in this plan introduces a network endpoint, an auth path, a file-access
pattern or a schema change. The one dependency added (`js-yaml`) is a devDependency already
present in the tree, used only by a test.

## Known Stubs

None.

---

## For the next plans

- **Plan 05 (wave 2)** — `docs/adr/0006-terminal-pool-lifetime.md` exists. Add the two one-line
  pointers to `terminalPool.ts` and `terminalPoolPolicy.ts`; you own both files this wave.
- **Plan 06 (wave 3)** — `SECURITY.md`'s *"Not yet covered, and it fails closed"* paragraph is
  the window your task 4 closes. When `hive.ts` `startProxyBridge` carries the token and the
  three shim bodies send `sock_token`, delete that paragraph. It is pinned only on the stale
  floor-wide phrases, so removing it will not fail `test/ci-config.test.cjs`.
- **Plan 10 (wave 5)** — you own `bug_report.yml`'s final wording. Once Settings → open log
  folder ships, drop the three by-hand platform paths and the "on the way (FLOOR-05)" marker,
  and keep the Settings line. `test/ci-config.test.cjs` asserts the description mentions
  **Settings** and **main.log**; both survive that edit.
- **Plan 23 (wave 9)** — FLOOR-06's checkbox needs the live `gh attestation verify` sample after
  a `v*` tag; do not tick it on this plan's structural evidence alone. GATE-01's issue can cite
  all four corrected doc surfaces from the table above. #15 and #41 close in their PRs per D-43
  with the acceptance text, the per-clause commands above (including the empty `attest` grep),
  the named tests, and the `npm test` exit line.

---

## Self-Check: PASSED

All 14 files claimed above exist on disk. All three commit hashes (`dc9478b`, `a50b713`,
`89283bb`) resolve in `git log`. Nothing claimed is missing.
