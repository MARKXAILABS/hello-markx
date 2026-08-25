# Phase 4 — Adversarial Red-Team, Round 2

**Plans reviewed:** 20 plans / 7 waves / 59 tasks @ `a06f1be`
**Reviewers:** 3 consolidated hostile lenses, parallel direct Agent calls
(1 gates × fail-direction · 2 waves × completeness · 3 tests × honesty)
**Verdict: `RED_TEAM_CLEAN=false`.** 9 unique BLOCKERs, 10 HIGH.

> **Round 1 → Round 2 movement is real but incomplete.** Of 11 round-1 blockers, **6 are genuinely
> closed** and independently verified. The rest were *moved* rather than closed — the named instance
> was fixed and the same failure shape rebuilt elsewhere.

---

## Round-1 blockers: closed vs moved

| R1 | Status | Evidence |
|---|---|---|
| BL-1 composition root | **CLOSED** | 04-20 owns `boot.ts` `HookServer` seams; effect-based assertions on a real booted floor |
| BL-2 `tool_name === 'Bash'` | **MOVED** → R2-BL4, R2-BL5 |
| BL-3 ask TTL | **HALF** → R2-BL1 (Claude), R2-BL9 (unwired) |
| BL-4 no ask producer | **CLOSED mechanically**; split unsound → R2-BL6 |
| BL-5 poll fail-open | **CLOSED in design, undone in practice** → R2-BL2 |
| BL-6 frozen skip census | **CLOSED** — verified: no plan adds any skip; file owned as escape hatch |
| BL-7 pinned line | **CLOSED** (relocation correct) ; wave-6 landing broken → R2-BL8 |
| BL-8 impossible criteria | **MOSTLY** — one leak → R2-H5 |
| BL-9 homeless join test | **CLOSED** — 04-15 owns `test/record-persist.test.cjs` |
| BL-10 POSIX gate | **CLOSED — reproduced twice independently** (see below) |
| BL-11 honesty | **MOVED** → R2-BL3 |

### BL-10 is closed, and this is the strongest evidence in either round

Two reviewers *and the orchestrator* independently ran the round trip on this machine.

Orchestrator probe (real `HOOK_SHIM` protocol — `c.write(payload + '\n')`, newline-delimited, server
replies with `conn.end`):
```
platform    : win32 | node v24.13.0
child exit  : 0
child stdout: {"hookSpecificOutput":{...,"permissionDecision":"deny",...}}
VERDICT     : NAMED PIPE ROUNDTRIP WORKS on win32
```
Lens 3 probe, against the **real** `cth-hook.cjs` and a **real** `HookServer`:
```
sock= "\\.\pipe\hello-markx-87f1317ca469"   exit= 0   ACCEPTED= true
poll connect 0..4 ok     child 0..2 exit 0 "{}"
```
The second run also exercised **repeated connects** — the mechanism the poll loop depends on and that
no plan had measured. Both clean. The POSIX gate is genuinely unnecessary; criterion 2's evidence is
restored **locally**, which is strictly better than a CI-output gate.

**Note the failure mode that made this subtle:** the orchestrator's *first* probe failed with `EPIPE`
because it used `c.end(payload)` — a half-close, which named pipes do not support. The real shim uses
`c.write(payload + '\n')`. Had the harness been written the first way, the gate would have been
required. The plans specify the correct pattern.

---

## BLOCKERS

### R2-BL1 — Claude's PreToolUse hook timeout is never set. The plan writes "unreconciled" in its own table and ships a 120 s TTL.
**2 lenses + orchestrator-verified.**

`04-15-PLAN.md:205`, inside `<planner_decisions>`, verbatim:

| Claude | engine default | `hookSettings` | **unreconciled** |

The fix below it covers *codex, kimi and grok only*. **Claude appears in the problem table and never
again** — not in the fix, not in ceiling items (a)–(f), not in any acceptance criterion.

Verified at source — `hiveProvisioning.ts:456-459`:
```ts
const entry = (matcher?: string) => ({
  ...(matcher ? { matcher } : {}),
  hooks: [{ type: 'command', command: cmd }]      // ← no `timeout` key, ever
});
```
`hookSettings` is Claude-only (`:457`), `PreToolUse: [entry('*')]` at `:486`. Claude Code's default
hook timeout is 60 s; `ASK_TTL_MS = 120_000`.

The plan states the consequence itself (`:207-210`): *"the hook is killed and logged as **failed**, not
denied. A killed shim writes no stdout, and no stdout is ALLOW."* **On the one engine that certainly
runs on this machine — and on which every live GATE-03/GATE-05 evidence in the phase is gathered —
GATE-05's "times out to deny" is still "times out to allow."** The relationship test cannot catch it:
it reads `PRETOOLUSE_HOOK_TIMEOUT_SEC`, which Claude never consumes.

**Fix:** add `PreToolUse: [entry('*', PRETOOLUSE_HOOK_TIMEOUT_SEC)]` to `hookSettings` (the `entry`
helper must learn a timeout param), **or** measure Claude's real default, write it into ceiling (g),
and re-derive `ASK_TTL_MS` from `min(all engine timeouts)`. Either way Claude must leave the
"unreconciled" row.

---

### R2-BL2 — The shims' unconditional 5 s `process.exit(0)` is never cleared, and every test completes below the threshold where it fires.
**Orchestrator-verified.**

All three shims arm, unconditionally, with **no handle captured**:
`hiveTemplates.ts:347` (`HOOK_SHIM` — Claude, codex, kimi), `:412` (`AGY_HOOK_SHIM`), `:795`
(`GROK_HOOK_SHIM`) — each literally `setTimeout(() => process.exit(0), 5000).unref();`

`.unref()` does not stop it firing while the process is alive for other reasons, and the poll loop
keeps it alive. **A silent exit is ALLOW** — the plan's own words: *"the single most important line in
this plan."*

04-16 states the intent (`:74`: *"the deadline replaces it only once `hive_ask` is seen"*) but never
specifies the mechanism. Verified: **`grep -n "clearTimeout" 04-16-PLAN.md` returns nothing.** No task,
no acceptance criterion requires one. You cannot clear a timer whose handle was never captured, so
"replace" requires editing a line the standing constraints say is unchanged.

**And the test is structurally blind.** 04-16 T2: *"use the smallest TTL the implementation accepts…
do not sleep 120 s"*, with a criterion *"the whole file runs in under 10 s."* All five cases therefore
complete **under 5 s** — beneath the exact threshold the bug lives at. Production TTL is 120 s (a phone
push plus a human tap). Green suite; the first real 3am ask silently allows at t=5s **on every engine**.

**Fix:** capture the timer (`const bootTimer = setTimeout(...)`), `clearTimeout(bootTimer)` on entering
the poll loop, per-poll timers thereafter. Acceptance criterion `grep -c 'clearTimeout'
src/main/hiveTemplates.ts` ≥ 3. **Add a T2 case with a TTL deliberately > 5 s** (≈6 s; the 10 s file
budget still holds) asserting non-empty deny stdout — the only case that can see this class of bug.

---

### R2-BL3 — The honest-claim pin names no target file, is written a wave before its evidence, and its correction path is barred by ownership.
**2 lenses.**

The **rider is real** — 04-13 T4's blocking criterion requiring a live GATE-03 refusal is a genuine
acceptance criterion, not prose. Four defects in the pin around it:

1. **No target.** `04-10-PLAN.md:355` says *"add one new clause to **this file**"* and never says what
   the clause reads.
2. **Both readings break.** SECURITY.md is the natural target (`repo-claims.test.cjs:1606-1624` already
   pins SECURITY.md prose) — but the claim reaches SECURITY.md only in **wave 7**, so a wave-3 pin is
   red for four waves and fails 04-10's own wave gate. The alternative target is the comment 04-10 T2
   writes into `test/engine-parity.test.cjs` — making the pin **satisfied by a comment it just wrote**,
   self-certifying, and leaving SECURITY.md unpinned. The prescribed `grep -v '^#'` filter guards a
   Markdown heading; a JS `//` comment sails through.
3. **The riskiest clause is unpinned.** The three required positive phrases are `through the real
   HookServer`, `LIVE-UNVERIFIED for pi`, `exercised by no test at all`. **None covers** *"a live codex
   agent had a command refused on this machine"* — the exact sentence R1-BL-11 was about. Inflation in
   the named direction still passes.
4. **Correction barred.** 04-10 is wave 3; its evidence is 04-13 T4 in wave 4.
   `04-VALIDATION.md:284` prescribes correction *"in the same commit"* — but 04-13's `files_modified`
   contains neither `test/engine-parity.test.cjs` nor `SECURITY.md`. D-35 violation by construction.

**Fix:** name the pin's subject file. Move the claim pin to **04-19 (wave 7)**, which owns both
SECURITY.md and `repo-claims.test.cjs`; have 04-10 pin only what exists at wave 3. Add
`test/engine-parity.test.cjs` to 04-13's `files_modified` for the correction path. Add the
live-refusal clause to the pinned positive set.

---

### R2-BL4 — codex's real `tool_input` shape was never measured, and the test that "proves" the fix defines the shape as whatever passes.

Round 1's prescribed fix was explicit: *"measure codex's actual PreToolUse `tool_name` / `tool_input`
shape in the 04-01 spike (one hook fire, no spend)."* **Not implemented.** `04-01-PLAN.md` has two
tasks — the `--add-dir` spike and the harness — and `grep -n "tool_input" 04-01-PLAN.md` returns only a
sample line. The spike runs `codex exec`, and `hiveProvisioning.ts:207` records that hooks fire in
**interactive** sessions, not `codex exec`, so it could not observe a payload even incidentally.

What replaced it is self-referential. 04-10 T2: *"build a payload with codex's actual shell tool name
and a `tool_input.command` of `rm -rf ./x`… take the tool name from 04-01's spike transcript **if it
recorded one; otherwise use a name that is demonstrably not `Bash`**."* The plan defines "codex-shaped"
as *a `command` **string*** — i.e. as whatever satisfies the condition under test.

**Codex's `shell` tool takes `command` as an argv array** (`["bash","-lc","rm -rf ./x"]`), not a string.
`hiveProvisioning.ts:160` vouches only that the *envelope* is Claude-shaped, never that
`tool_input.command` is a string. If it is an array, `typeof ti.command === 'string'` is false and
**GATE-03 refuses nothing on codex** — while every test stays green and 04-10's honest claim already
says "refused for Codex-shaped payloads."

**Fix:** (a) add a measurement task to 04-01 — one *interactive* codex turn with the shim logging raw
stdin JSON; (b) accept both shapes: `const cmd = typeof ti.command === 'string' ? ti.command :
Array.isArray(ti.command) ? ti.command.join(' ') : null;` with a criterion driving the array form;
(c) 04-10 T2's codex case must cite the measured transcript, not a synthesized name.

---

### R2-BL5 — The fix adds a test that pins the *sibling* gate arm Claude-only, and the new `restore` protection depends on that arm.

04-06 T2's acceptance criterion: `grep -c "p.tool_name === 'Bash'" src/main/hooks.ts` returns **1,
unchanged**. That freezes `hooks.ts:871` — `protectedPathDenial`'s command-tokenizing arm — as
Claude-only, **permanently, by test**.

Measured at `hooks.ts:862-889`: on codex/grok/pi/OpenCode/kimi/agy, `protectedPathDenial` collects
targets only from `ti.file_path` / `ti.path` / `ti.notebook_path` — Claude's key names — never from the
command string. So for six of seven engines, `mv <hive>/restore /tmp`, `cat > <hive>/bin/task.cjs`,
`cp <hive>/agents/other/inbox/* .` all reach `targets.length === 0 → return null` → **ALLOW**.

That makes 04-06's own threat row **T-04-SNAP-08 disposition `mitigate` false**: the `restore` literal
it adds (correctly, per R1-H-7) protects the shadow store against Claude agents and nothing else. **No
ceiling item records it** — (j)–(r) cover the *shape* arm's gaps.

**Fix:** widen `protectedPathDenial`'s arm to the same presence-of-a-command-string condition (it can
keep `tool_name` for the audit record), **or** change the criterion to a bounded `≤ 1`, add a ceiling
item stating plainly that GATE-01's path protection including `restore` is Claude-only, and
re-disposition T-04-SNAP-08 to `accept`.

---

### R2-BL6 — The `rm -rf` deny reason names a bypass that destroys the same tree, and the split is not reasoned to the requirement.

04-06 `<planner_decisions>` sends force-push, pipe-to-interpreter and denied-host to **ask**; `rm -rf`
to **deny**, reasoned *"There is also a recoverable alternative available to the agent (`rm` without
`-rf`), which the deny reason names."* The shape rule is *"`rm` + an `-*r*` token + an `-*f*` token."*

So **`rm -r ./build` matches nothing and is allowed**, and deletes the identical tree — in a non-tty
agent shell there is no prompt to save anything. **The gate's own operator-legible deny message
instructs the agent in how to bypass it**, and the bypass is exactly as unrecoverable. Also unjudged
and unnamed in the ceiling: `find . -delete`, `git clean -xfd`, `shred`, `truncate -s0`, `> file`,
`dd of=`.

The split also fails its own stated test. The plan's criterion for choosing `ask` is *"denying outright
blocks a real path with no way through"* — `rm -rf node_modules` / `.next` / `build` is vastly more
frequent in an overnight run than `curl … | sh`, and it gets the treatment the plan calls unacceptable.
Meanwhile GATE-05's requirement is *"an agent about to run something **unrecoverable** stops, the
operator is asked"* — and the one unrecoverable shape is the one that never asks. The stated
justification (the operator cannot evaluate blast radius from the token list) does not survive contact:
the **deny** is issued from the same token list with no more information, and the desktop surface
renders the full command anyway.

**Fix (minimum):** route `rm -rf` to `ask` like the other three (the requirement's plain reading), **or**
keep the deny and (a) delete the "use `rm` without `-rf`" sentence, (b) extend the shape to `rm` + any
recursive flag regardless of `-f`, (c) add a ceiling item enumerating the deletion spellings not judged.
`<planner_decisions>` must record which, reasoned against GATE-05's own wording.

---

### R2-BL7 — VIGIL-01's `QuietSnapshot` has no declared route to either consumer, and both consumers are barred from building one.
**This is R1-BL-1's exact shape, rebuilt in a new place.**

`04-11-PLAN.md:131` declares `publishQuiet(s: QuietSnapshot | null): void;` and `:140` `current():
QuietSnapshot | null`. `:289` then says *"`publishQuiet` is wired to a **no-op or a simple store** in
this plan; plan 04-17 connects it to the phone's `floorQuiet` field and plan 04-18 to the desktop
`QUIET` chip."* **No mechanism is named, and neither consumer can create one:**

**Phone (04-17, w5).** `AbsenceWatchdog` is not on the `Floor` interface (`boot.ts:97-146`, 24 members,
verified) and 04-11 never adds an export or a `Floor` member — its criterion is only `grep -c
'watchdog' boot.ts ≥ 3`. 04-17 asserts `git diff --stat src/main/floor/boot.ts` **empty**, and in wave 5
`boot.ts` belongs to 04-20. `index.ts` reaches floor state by named import at `:121`, but 04-17's own
criterion confines its `index.ts` diff to `:1219-1260` and `:1315-1323`.
Contrast: 04-17 solved the *approval* seam correctly via `floor.hookServer.openApprovals()` — because
`hookServer` **is** on `Floor` (`boot.ts:102`). The watchdog got no equivalent.

**Desktop (04-18, w6).** Task 3's `<files>` is `App.tsx` + the render test — no store, no preload, no
IPC. Task 1's IPC work is approval-only and pins *"no new channel name appears."* Grepping 04-18 for
`QuietSnapshot|publishQuiet|floorQuiet|watchdog` returns **2 hits, both prose**. Its key_link's `via`
describes chip *geometry*, not a data path.

**Fix:** 04-11 (wave 3, the only plan that can) must name the accessor — `export let watchdog` + a
`Floor` member, or a `deps.send('floor:quiet', …)` channel plus a module getter in `watchdog.ts` — and
04-17/04-18 need matching read criteria and widened diff boundaries.

---

### R2-BL8 — 04-18's FLOOR-12 reconciliation is impossible in the shape the plan itself prescribes; wave 6 ends red.

Verified at source: `repo-claims.test.cjs:684` `M1 = /fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])/g`;
`:717` the pinned entry `count: 1`; clause 2 (`:781-812`) an exact-text multiset counting M1 hits per
line; clause 3 (`:814-838`) walks to the owning open tag and asserts a literal
`aria-hidden=("true"|\{true\})`. `CommandCenterPanel.tsx:796` carries `fontSize: 12`.

`04-18-PLAN.md:339-347` instructs, in one paragraph: (1) update `:717`'s `text` to the new line, (2)
*"e.g. render **two sibling spans**"* (one `aria-hidden`, one `role="img"`), (3) *"**do not widen or
delete the allowlist entry**"*.

The second span is a new M1 hit → clause 2 reports it under `extra` unless a **second** allowlist entry
is added, which (3) and the file's own failure message (`:800` *"Fix the site; do NOT widen this list"*)
both forbid. If it *is* allowlisted, clause 3 fails on it — its open tag has no literal `aria-hidden`,
which is exactly what 04-18's own criterion demands.

The one compliant shape — the blocked-branch span carrying no inline sub-14px `fontSize` — is **named
nowhere**, and changes the glyph's rendered size, which the plan elsewhere forbids.

**Fix:** name the exact JSX. Smallest working shape is two branches where the blocked one inherits its
size (no `fontSize` prop), with `:717` updated to
`{armed && a.status !== 'blocked' && <span aria-hidden="true" …>}` at `count: 1`.

---

### R2-BL9 — `ASK_TTL_MS` never reaches the production registry; 04-20's own must_have asserts that it does.

04-15 says `ApprovalRegistry` takes `ttlMs` as a constructor option and *"the production value is
`ASK_TTL_MS` and **plan 04-20 passes it**"* — while also instructing *"construct the
`ApprovalRegistry` **inside `HookServer`**, not at the composition root."* So `boot.ts` never
constructs it. 04-20 Task 1 appends exactly **four** arguments (`hostAllowlist`, `openAsk`,
`recordToolCall`, `publishApproval`) — no `ttlMs`, no criterion mentioning `ASK_TTL_MS` — and its
constraint is *"this plan touches no other source file."*

04-20's must_have #3 nonetheless asserts *"the ask TTL the production registry uses is `ASK_TTL_MS`."*
An unowned promise — R1's systemic defect, recurring.

The only relationship test compares two **constants** and says nothing about what the production
registry was constructed with. The derivation — the entire remedy for R1-BL-3 — is not connected to
production.

**Fix:** settle in one place who passes `ttlMs`. Either `HookServer` imports `ASK_TTL_MS` in 04-15 T2
(which owns both files in one commit) with a criterion, or 04-20 gains a fifth argument plus a
boot-floor assertion that the production entry's `expiresAt - openedAt === ASK_TTL_MS`.

---

## HIGH

### R2-H1 — R1's M-8 was never fixed, and the revision added more. Five line-window criteria sit downstream of edits that move them; two are provably wrong by arithmetic; one becomes a silent vacuous pass.
**3 lenses + orchestrator-verified.**

Verified: `new HookServer(` is at `boot.ts:1120`; 04-20 cites `:1119` throughout — **off by one before
any wave runs.**

| Criterion | Why it breaks |
|---|---|
| `04-06:452` `sed -n '1140,1170p' hooks.ts \| grep -ci 'five'` ≥ 1 | **The same task** adds ceiling items (j)–(r) at `:801-859` (~+50 lines). The `rootTailVerdict` doc comment moves from `:1137-1152` to ~`:1187`. Window misses it → **fails on correct code** |
| `04-15:605` `sed -n '1188,1210p' \| grep -c 'this.record('` returns `0` | `handle` is `:1188` today, ~`:1241` after 04-06's wave-2 ceiling. Window reads unrelated code → **passes vacuously** — worse than failing |
| `04-15:605` `sed -n '1360,1420p' \| grep -c 'this.record('` ≥ 4 | Same ~+80 shift; PreToolUse exits land ~`:1443-1503` → **fails** |
| `04-20:201-202` `sed -n '1115,1140p' boot.ts \| grep -c …` | 04-03 (w1), 04-09 (w2), 04-11 (w3) all insert above `:1120`; 04-20 runs in **wave 5**. Drift +20–30 |
| `04-16:236` `sed -n '291,800p' hiveTemplates.ts` marker delta = 2 | `GROK_HOOK_SHIM` spans `:730-798` — **tail is 2 lines from the window edge**; any insertion above pushes its marker past 800 |

Also fragile: `04-10:216-217` (`PI_EXTENSION` at exactly `:425`, `OPENCODE_PLUGIN` at exactly `:466`,
both shifted by 04-04 in wave 1) and `04-09:306` (`sed -n '780,800p' hive.ts`).

Only `04-05:293` does the right thing (*"re-measure the range and state the measured line in the
SUMMARY"*). **Every window criterion must become a symbol boundary** (`awk '/new HookServer\(/,/^  \);/'`,
`grep -n 'private record('`) **or carry an explicit re-measure-at-wave-start instruction.**

### R2-H2 — A second unfiltered `pty.spawn` with `...process.env` exists, runs `--permission-mode bypassPermissions` over web-scraped text, and appears in **zero** phase-4 documents.
**Orchestrator-verified.**

```
src/main/pty.ts:745         const proc = pty.spawn(file, spawnArgs, {   ← 04-05 owns this
src/main/hiddenClaude.ts:148  ptyProc = pty.spawn(spawnFile, spawnArgs, {   ← nobody
```
`hiddenClaude.ts:153` is `...process.env,`. `:130` passes `'--permission-mode', 'bypassPermissions'`.
The file's **own header at `:32`** says it runs *"over agent-authored — often web-scraped — text, so a
prompt injection in that text would have both the pinned facts it was handed and a tool to send them
somewhere."* Reached from `reflect.ts:38`. The repo already documents the problem at `index.ts:4859`:
*"`hiddenClaude.ts` and `memory.ts` spawn children with `...process.env`"* — so `memory.ts` is a third
site.

`grep -rc "hiddenClaude" .planning/phases/04-*/` → **0 across every document.** GATE-02's criterion is
*"`env` inside **any** agent's terminal"*; it would ship with blast radius bounded on the roster PTYs
and wide open on the most injection-exposed process in the app.

**Fix:** add both to 04-05's scope, **or** name them explicitly in the GATE-02 ceiling as a knowing hole
with an owner — D-34 obliges either way. Do not leave them unmentioned.

### R2-H3 — Raising codex/kimi to 150 s is a real new hazard the repo's own comment argues against.
`hiveProvisioning.ts:210-223` records why 30 s was chosen: each hook cold-starts via hive-node,
*"measured 0.08-0.16s idle but 0.6-0.7s under 8 concurrent spawns"*, and 30 s *"clears that by two
orders of magnitude while still capping a wedged shim."* At 150 s a shim wedged for a **non-ask** reason
stalls the agent 5× longer per tool call. `150` is `[ASSUMED]` with no measurement, and the plan does
not run the no-spend verification its own `read_first` cites (`codex app-server` → `hooks/list`).

### R2-H4 — grok is guessed at for exactly the reason agy was not.
04-15 refuses to touch agy's `timeout: 0` because *"its semantics are unknown, agy is not installed, and
a guess that made it worse would be undetectable"* — then writes `timeout:
PRETOOLUSE_HOOK_TIMEOUT_SEC` into grok's config, where grok is **also not installed**, its unit
(seconds vs ms) is unverified, and `hiveProvisioning.ts:424-425` deliberately omits the key. **If grok
reads ms, `150` = 150 ms → every grok PreToolUse hook is killed before the shim can answer → GATE-03
and GATE-05 both fail open on grok, worse than today, undetectably.** Apply agy's own reasoning: leave
grok unchanged as a ceiling item, or add a `LIVE-UNVERIFIED` marker naming the unit question.

### R2-H5 — 04-18 T3 reproduces R1-BL-8 inside an `<automated>` block.
`04-18:454`: *"A test asserts the chip is a `<button>` and **that clicking it invokes the task-board
action**"*, verified by `<automated>node --test test/renderer-components.test.cjs</automated>`. That
file's ceiling (`:23-38`) says it *"fires no events… anything behind a click"* — and 04-18's **own Task
2** quotes that ceiling at `:375` to move three such criteria into T4. The sweep covered T2 and missed
T3. Threat row T-04-ASK-38 nonetheless claims the class was swept.

### R2-H6 — The OpenCode fix's only client-side evidence is a grep satisfiable by a comment.
04-10 T1's criteria are a server-side test (which 04-10 T2's codex case already proves) plus
`sed -n '466,495p' hiveTemplates.ts | grep -c 'tool_input'` ≥ 1. **Nothing executes `OPENCODE_PLUGIN`'s
payload builder.** A `// we now send tool_input` comment satisfies it. (`OPENCODE_PLUGIN` is ESM so
`runShim` cannot drive it — a real ceiling, but it is not stated as one.)

### R2-H7 — The TTL relationship test cannot fail for the reason it exists.
`ASK_TTL_MS = (PRETOOLUSE_HOOK_TIMEOUT_SEC - 30) * 1000`, asserted `ASK_TTL_MS <=
PRETOOLUSE_HOOK_TIMEOUT_SEC * 1000`. Degenerate passes: `SEC = 31` → TTL 1 s (one second to answer on a
phone); **`SEC = 5` → TTL `-25000`, every ask expired at birth, and `-25000 ≤ 5000` passes.** Because
the TTL is *derived* from the bound, the inequality holds for every value > 30. **No lower bound is
asserted anywhere.**

### R2-H8 — The host allowlist turns "the operator has not curated a list yet" into an agent stall on the overnight run the phase exists to enable.
`DEFAULT_HOST_ALLOWLIST` is `[ASSUMED]` and admittedly incomplete (`api.github.com`, `nodejs.org`,
`sh.rustup.rs`, `get.docker.com`, `astral.sh`, `deb.debian.org` all absent). Post-wave-5 each unlisted
host is an `ask` costing up to 120 s of agent wall time plus a 3am push; **pre-wave-5 (waves 2–4, before
`openAsk` is wired) it is a hard deny with no operator recourse** — including during 04-13 T4's live
codex run in wave 4. No plan re-checks the wave-2 behaviour after wave 5.

### R2-H9 — pi and OpenCode regress from silent no-op to hard deny on every command, and the ceiling conveys only half of it.
04-10 T1 *adds* `tool_input` to `OPENCODE_PLUGIN`, making `commandShapeDenial` fire on OpenCode for the
first time — and three of its four shapes are `ask`, which for a non-polling shim means **deny**. So
every force-push, every `curl | sh` and **every fetch to a host outside a 20-entry assumed list**
becomes an unconditional deny with no path through, on two LIVE-UNVERIFIED engines. Safe direction,
substantial new behaviour; ceiling item (a)'s one line does not convey it.

### R2-H10 — `spawnAgentCore` builds spawn opts in two places, not one.
`spawnAgentCore` (`index.ts:1893`) contains **two** `ptyManager.spawn(` calls: `:2003` (the missing-CLI
install-ladder path, which builds its own opts literal) and `:2349` (the normal path). 04-05 says *"the
one place `spawnAgentCore` builds them."* Threading the pass-through onto `:2349` alone leaves `:2003`
spawning under the new filter with **no** operator pass-through — a silent behaviour split on the
install path.

---

## MED (selected)

- **M1** — two new count errors in the artifact rebuilt to fix a count error: `04-VALIDATION.md:277`
  says *"Six rows… Two were added"* (actual: seven rows, three added); `:237` says *"the ten RED-first
  files"* (table has eleven).
- **M2** — `04-17:333`'s `grep -cE 'remaining--|setInterval'` has no threshold, no direction, and ORs the
  wanted thing with the forbidden thing. `04-18:371` gets the identical idea right.
- **M3** — `grep -c 'timeout = 30'` "unchanged" (measured 3) pushes toward keeping a literal branch
  string when a natural interpolation would drop it to 1.
- **M4** — **D-05's fail-closed direction was silently softened.** R1 recorded *"D-05 decided in writing,
  fail-closed on empty"*; the revision changes an operator-emptied allowlist from **deny** to **ask**
  while its prose still asserts *"D-05 holds."* It holds only while `openAsk` is unwired.
- **M5** — 04-13 T4's machine-readable `<human-check>` lists six items and omits **both** riders (the
  GATE-03 live refusal and the VIGIL-03 block observation) — the two things R1-BL-11 and R1-H-4 exist to
  close. They appear only in prose.
- **M6** — **the feedback-latency gate is already false.** `04-VALIDATION.md:72` claims *"max feedback
  latency 24 s"*; a lens measured `npm test` at **48 392 ms** in this worktree — 2×, and *before* the
  phase adds eleven test files including two child-process integration suites with real timers.
  (Caveat: measured while several review agents were running, so treat as an upper bound and re-measure
  quiet. The direction is not in doubt.)
- **M7** — R1's M-17 downgraded, not closed: 04-19 still licenses closing with `nyquist_compliant:
  false` "if explained". The operator's standing mandate has no explained-exemption.
- **M8** — 04-19 T2's `<files>` omits `REQUIREMENTS.md` / `ROADMAP.md` (they are in `files_modified`, so
  this is task-level inconsistency, not an ownership gap).
- **M9** — 04-14 T3's `<files>` omits `test/renderer-components.test.cjs` though its first criterion is
  *"four rendered cases."*
- **M10** — the TTL derivation covers 3 of 5 shim engines; the must_have asserts it for five.

---

## What Round 2 confirmed as genuinely closed

Recorded so round 3 does not churn it: BL-1 (composition root — `boot.ts` owned per wave, effects
asserted on a real booted floor), BL-6 (verified: **no plan adds any skip**; the census file is owned as
an escape hatch with empty-diff criteria), BL-9, BL-10 (**reproduced twice**), H-5, H-8, H-10
(`writeTasks` at `hive.ts:2112-2126` — `realtimeActions.ts` needs no edit), H-11 (`AgentTeardownDeps` is
in `lifecycle.ts:57`; no `boot.ts`/`deps.ts` edit needed), H-12 (criterion correctly inverted to expect
**3** and forbids "fixing" it to 1), H-13, H-14 (**59 tasks ↔ 59 rows, verified independently**), H-15,
H-17, H-18 (`this\.protectedPathDenial(` matches exactly one line), M-7 (all occurrence gates now
`grep -o | wc -l`), M-9, M-10, M-14, M-16.

**Ownership matrix rebuilt independently from all 20 `files_modified` blocks: 0 same-wave collisions,
DAG acyclic, every edge to a strictly lower wave, 04-19 depends on all 19.** The four round-1 orphans
(`boot.ts`, `deps.ts`, `hiveProvisioning.ts`, `suite-integrity.test.cjs`) all have owners in free waves.

Baseline re-measured independently: **805 tests / 798 pass / 0 fail / 7 skipped** — VALIDATION's figure
is honest.

---

## The recurring shape, named so round 3 can break it

The planner fixes the **named instance** correctly and rebuilds the **same shape** elsewhere. Three
times now:

1. **"Declared seam with no owner."** R1: `boot.ts`'s four `HookServer` seams. R2: VIGIL-01's
   `QuietSnapshot`, declared with a route to neither consumer, both consumers barred from building one
   (R2-BL7); and `ASK_TTL_MS`, which 04-20's must_have asserts and 04-20's task list does not pass
   (R2-BL9).
2. **"Criterion pinned to coordinates a prior wave moves."** R1: M-8. R2: five more, one already off by
   one at HEAD before any wave runs (R2-H1).
3. **"A test that asserts the assumption instead of the fact."** R1: the honesty pin asserting only the
   negative. R2: "codex-shaped" defined as *whatever satisfies the condition under test* (R2-BL4); the
   TTL inequality that holds for every value because the TTL is derived from the bound (R2-H7); the
   OpenCode grep satisfied by a comment (R2-H6).

**Round 3 must fix the shapes, not just the instances.** Concretely: no acceptance criterion may use a
bare line-number window; every declared seam needs a named accessor and a consumer criterion that reads
it; and every "prove X" criterion must be checked by asking *what is the degenerate implementation that
passes this?*

---

*Round 2. `RED_TEAM_CLEAN=false`. 9 BLOCKER, 10 HIGH. Revision required.*
