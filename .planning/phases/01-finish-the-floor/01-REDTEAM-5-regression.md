# Red-team lens 5 of 5 — WHAT DOES EACH FIX BREAK?

**Target:** gap-closure plans `01-24-PLAN.md` … `01-31-PLAN.md`
**Tree:** branch `gsd/v1.0-milestone` @ `47a48cd`
**Stance:** hostile. Every finding below was derived from the LIVE source the plan targets, not from the plan's own `<interfaces>` block. Regressions proved by execution are marked **[demonstrated]**.

**Verdict: 11 BLOCKER, 20 WARNING, 4 INFO.** Nine of the eleven blockers are invisible to every acceptance criterion in the set.

---

## Summary table

| ID | Plan | Regression | Criterion catches? | Sev |
|---|---|---|---|---|
| R-01 | 01-25 T3 | `DESIGN.md` still says min window 1280×800; no plan owns the file | no | BLOCKER |
| R-02 | 01-25 T3 | Splitter re-clamp now destroys+persists the operator's sidebar width at 1024–1279 | no | BLOCKER |
| R-03 | 01-25 T3 | Pixi camera min-zoom drops 25%; FLOOR-12's 14px floor is source-only | no | WARNING |
| R-04 | 01-25 T3 | IDE tree 424px was measured at 1280/1024/800, never at 960 | no | WARNING |
| R-05 | 01-25 T3 | `clampBounds` floor lowered — restored geometry no longer widened to 1280 | n/a | INFO |
| R-06 | 01-26 T1 | `sk[-_]` has no word boundary → eats `task_`, `disk_`, `desk_`, `risk_`, `flask_` **[demonstrated]** | no | BLOCKER |
| R-07 | 01-26 T1 | Optional closing quote → eats JSON/YAML config templates **[demonstrated]** | no | BLOCKER |
| R-08 | 01-26 T1 | Replacement eats the key's closing quote → mail path emits malformed JSON **[demonstrated]** | no | WARNING |
| R-09 | 01-26 T1 | Inverted ceiling test measures sensitivity only; no specificity ceiling replaces it | no | WARNING |
| R-10 | 01-24/30 | No minimum-test-count gate exists — the pass drop is safe | n/a | INFO |
| R-11 | 01-25/26/28 | Three new test files enter the poison-harness loop if not `node:test` | partly | WARNING |
| R-12 | 01-25 T2 | Telemetry blackout: cost ledger, resume key, breaker and account failover all go blind, silently | no | BLOCKER |
| R-13 | 01-25 T2 | Fail-closed window between collector (`:379`) and HookServer (`:543`) | partly | WARNING |
| R-14 | 01-25 T2 | Collector capability added to every PTY grandchild's env | acknowledged | WARNING |
| R-15 | 01-25 | Threat model says "every producer" without enumerating; proxy tier verified clear | n/a | INFO |
| R-16 | 01-24 T1 | Any single-`../` token in any Bash command is DENIED as "another agent" **[demonstrated]** | no | BLOCKER |
| R-17 | 01-24 T1 | Michael's relative reads of the floor become denied (his cwd is the harness home) | no | WARNING |
| R-18 | 01-24 T1 | The "no base known" deny branch is unreachable; its test must fake an impossible state | no | WARNING |
| R-19 | 01-24 T2 | No shipped shim can double-handle; the "doubled cost sample" claim is false | no | WARNING |
| R-20 | 01-24 T2 | Byte cap + idle timeout are two NEW fail-open doors on the PreToolUse gate | no | BLOCKER |
| R-21 | 01-28 T2 | The guard cannot tell a synthesized Stop from a real one → falsely-blocked agents never get mail again | no | BLOCKER |
| R-22 | 01-28 T2 | Skipping the `breakerLevel = 'healthy'` reset makes R-21 unrecoverable | no | WARNING |
| R-23 | 01-28 T2 | "keeps its `blockReason`" pins an existing accident as the contract | no | WARNING |
| R-24 | 01-27 T1 | Band-only case is NOT byte-identical: `noProgressBeats` now accrues → escalation past `steering` | no | BLOCKER |
| R-25 | 01-27 T2 | Transient read error now rejects every enqueue with "no harness home" | no | WARNING |
| R-26 | 01-29 T1 | Tokenizing loses `--flag=value` → new false NEGATIVE on the safety chip | no | WARNING |
| R-27 | 01-29 T1 | Scanning every preset's flag paints AUTO for generic `--auto` / `--approve` / `--yolo` | no | WARNING |
| R-28 | 01-29 T1 | Two presets carry `autoModeFlag: ''` → vacuous match if not guarded | yes | WARNING |
| R-29 | 01-29 T3 | Renderer test now parses `src/main/index.ts` by regex | no | WARNING |
| R-30 | 01-30 T3 | `latest*.yml` in the glob disarms the "no artifacts to hash" tripwire | no | WARNING |
| R-31 | 01-30 T2 | Coverage pin parses shell globs out of a `run:` block | partly | WARNING |
| R-32 | 01-31 T2 | The widened un-stripped scan matches `test/repo-claims.test.cjs` ITSELF → cannot pass | no | BLOCKER |
| R-33 | 01-31 T2 | `dist/` and `out/` carry the string; the plan's own done-command fails **[demonstrated]** | no | BLOCKER |
| R-34 | 01-31 T2 | Excluding `.planning/` wholesale exempts the live codebase docs | no | WARNING |
| R-35 | 01-31 | `DESIGN.md` is in no plan's `files_modified` — R-01 has no owner in the set | no | WARNING |

---

## 1. `MIN_WIN.width` 1280 → 960 (plan 01-25, Task 3)

This is a product change, applied as `minWidth` to the primary AND every floor window (`src/main/index.ts:2670-2671`), and as the floor of `clampBounds` (`:2525-2526`). Below 1280 the app has never been run.

### Enumerated layouts with a hardcoded width ≥ 960 — and what happens

| Site | Value | At a 960 window |
|---|---|---|
| `src/renderer/src/App.tsx:315` | `width: '100vw'` | 960; canvas row is `960 − 32` padding = 928 |
| `src/renderer/src/components/SettingsModal.tsx:746` | `width={840}`, `maxWidth '92vw'` | 92vw = 883 > 840 → unchanged at 840. **Safe** |
| `src/renderer/src/components/AddAgentModal.tsx:451-452` | `width={940}`, `maxWidth="95vw"` | 95vw = 912 < 940 → dialog shrinks to 912 around a fixed 168px nav (`:564`). Content pane ~712. Degraded, not broken |
| `src/renderer/src/components/OnboardingWizard.tsx:245` | `width: 640, maxWidth '94vw'` | 640 < 902. **Safe** |
| `src/renderer/src/ide/IdePanel.tsx:108/:470` | `treeWidth = 424`, `flexShrink: 0` | Editor pane = `960 − 424 − 4` = **532px**. Side-by-side diff (`:692-694`) = **266px per side**. See R-04 |
| `src/renderer/src/components/SidebarSplitter.tsx:22` | `clampMax = min(1200, max(320, vpW − 360))` | 600 at 960; **664–919 across the newly reachable 1024–1279 band**. See R-02 |
| `src/renderer/src/store/store.ts:579/:872` | sidebar default 420, clamp 320..1200 | overlay renders at `min(420, 960 − 48)` = 420 — same as today. **Safe** |
| `src/renderer/src/components/SidebarTabs.tsx:63-66` | 4 Press Start 2P labels needing 518px in a 420 rail | Already carries `minWidth: 0, overflow: hidden, whiteSpace: nowrap` — truncates, does not spill. Sidebar width is unchanged at 960, so **no new clipping**. (It still truncates without `text-overflow`, pre-existing.) |
| `src/renderer/src/components/SkillsTab.tsx:242-252, :320-331` | catalog/installed name row | Already carries the three containment properties. Sidebar width unchanged. **Safe** |
| `src/renderer/src/App.tsx:326-336` | title bar, `paddingLeft: 96` + 3×28px buttons | ~250px of content in 960. **Safe** |
| `src/renderer/src/scene/office/Camera.ts:44-56` | `fitToScreen` → `min(vw/mapW, vh/mapH)` | Min zoom falls 25%. See R-03 |

### R-01 — BLOCKER: `DESIGN.md` still ships the 1280 promise, and no plan owns the file

```
DESIGN.md:169  - Main window minimum: 1280 × 800.
DESIGN.md:677  Min window: 1280 × 800. Right panel collapses below 1024 to bottom drawer.
```

`DESIGN.md` appears in **no plan's `files_modified`** — not 01-25's (which makes the change), and not 01-31's doc-residual sweep, whose list is `HIVE.md`, `docs/adr/0005-…`, `src/main/config.ts`, `src/renderer/src/store/config.ts`, `resources/skills/capabilities/SKILL.md`, `test/repo-claims.test.cjs`, `.planning/REQUIREMENTS.md`, `01-VALIDATION.md`.

ROADMAP criterion 1 is *"grep finds no doc promising a code path that does not run."* The set closes that criterion's residual in `HIVE.md` and `useHive.ts` while manufacturing a fresh instance of it in the design system's own spec. `grep -rn "1280" src/ DESIGN.md` after the change returns three source COMMENTS that also read as claims (`SidebarSplitter.tsx:31`, `SidebarTabs.tsx:55`, `SkillsTab.tsx:245/:323`, `IdePanel.tsx:108`) — all of them cite measurements taken at a minimum width that no longer exists.

`DESIGN.md:677`'s second sentence is a second, pre-existing contradiction the change makes *reachable*: it promises a **bottom drawer**, and `App.tsx:512-528` implements a right-edge overlay at `z-index: 2`. Today that layout is unreachable, so the contradiction is inert. At 960 it is the first thing an operator sees.

**No criterion catches it.** Plan 01-29's cross-file pin asserts only `MIN_WIN.width < SIDEBAR_COLLAPSE_WIDTH`; it will be green. No test reads `DESIGN.md:169` or `:677` (`grep -rn "DESIGN.md" test/` returns four hits, at `:653`, `:678`, `:706` — none at `:169`/`:677`).

**Fix:** add `DESIGN.md` to plan 01-25's `files_modified` (the plan that changes the constant should change the claim in the same commit), and add a `test/repo-claims.test.cjs` assertion that `DESIGN.md`'s stated minimum equals `MIN_WIN` in `src/main/index.ts`. Plan 01-29 Task 3 is already writing a cross-file constant pin — extend it to three constants instead of two.

### R-02 — BLOCKER: the splitter re-clamp destroys and PERSISTS the operator's sidebar width

```
src/renderer/src/components/SidebarSplitter.tsx:22
  const clampMax = Math.min(max, Math.max(min, viewportWidth - 360));
src/renderer/src/components/SidebarSplitter.tsx:33-35
  useEffect(() => { if (width > clampMax) onChange(clampMax); }, [width, clampMax, onChange]);
src/renderer/src/App.tsx:568-572
  <SidebarSplitter width={sidebarWidth} onChange={setSidebarWidth} viewportWidth={vpWidth} />
src/renderer/src/store/store.ts:871-875
  setSidebarWidth: (px) => { const clamped = …; window.localStorage.setItem(LS_SIDEBAR_WIDTH, String(clamped)); set({ sidebarWidth: clamped }); }
```

`onChange` is the **persisting** store setter. The splitter is mounted only when `layout.showSplitter` is true, i.e. at `vpWidth >= 1024` (`sidebarLayout.ts:52`, `App.tsx:566-573`).

- **Today**, the narrowest reachable viewport is ~1280, so `clampMax >= 920`. A persisted width of 900 survives.
- **After the change**, widths 1024–1279 become reachable *with the splitter still mounted*. `clampMax` there is **664–919**. Dragging the window to 1024 silently rewrites a 900px sidebar to 664 **and writes it to `localStorage`**. The next boot on a 27" monitor opens at 664.

This is precisely the failure `SidebarSplitter.tsx:27-34` says it was written to kill, and precisely what `App.tsx:512-519` says it avoided for the overlay (*"persisting a small-window width is what strands the user's chosen width on the next large-window boot"*). The overlay path was made safe; the splitter path was not, and the fix expands its damage band from ~0px wide to 256px wide.

**No criterion catches it.** 01-29 Task 3 asserts a constant inequality. 01-29's success criteria never mention persistence. `test/renderer-runstate.test.cjs:187-230` tests the pure `sidebarLayout()` function, which does not touch the store.

**Fix:** the re-clamp effect must not write through the persisting setter. Either add a non-persisting `setSidebarWidthEphemeral`, or clamp at render (`Math.min(sidebarWidth, clampMax)`) exactly as the overlay already does at `sidebarLayout.ts:66`.

### R-03 — WARNING: the Pixi floor's minimum zoom drops 25%, and FLOOR-12's floor is source-only

```
src/renderer/src/scene/office/Camera.ts:44-47
  private getMinZoom(): number { return Math.min(this.viewWidth / this.mapWidth, this.viewHeight / this.mapHeight); }
src/renderer/src/scene/office/OfficeFloor.tsx:1781-1789
  ResizeObserver → app.renderer.resize(w,h); camera.setViewSize(w,h)  // → fitToScreen()
src/renderer/src/scene/office/ThoughtBubble.ts:22-23
  const FONT_SIZE = 14;  const RENDER_SCALE = 0.5;   // "render at 2x, scale down"
```

Everything on the floor is drawn inside a camera whose zoom is `min(vw/mapW, vh/mapH)`. Cutting the minimum width from 1280 to 960 cuts the width term by 25%; whenever width is the binding constraint (it is, for a wide office map), every sprite, portrait, task card and Pixi label shrinks by 25% at the new floor.

`ThoughtBubble` and `ToolBubble` already sit inside a `RENDER_SCALE = 0.5` container, and `test/repo-claims.test.cjs:646-665` records that caveat in its own failure message: *"the DESIGNED on-screen size is half this number. Raising FONT_SIZE is necessary and not sufficient."* That test asserts the **source constant**, so it stays green while the rendered size falls another 25%.

**Not caught.** FLOOR-12 is not in plan 01-25's `requirements` list, and no plan re-derives the label geometry at 960.

### R-04 — WARNING: the IDE was measured at 1280/1024/800, never at 960

```
src/renderer/src/ide/IdePanel.tsx:108
  const [treeWidth, setTreeWidth] = useState(424); // 424 = 300 + the 124px spill MEASURED in real Electron 43 at 1280/1024/800
src/renderer/src/ide/IdePanel.tsx:470  width: treeWidth, flexShrink: 0
src/renderer/src/ide/IdePanel.tsx:587  <editor pane> flex: 1, minWidth: 0
src/renderer/src/ide/IdePanel.tsx:692-694  <diff> two panes, each flex: 1, minWidth: 0
```

The editor pane does have `minWidth: 0`, so nothing *overflows*. But the default leaves **532px** of Monaco at a 960 window, and the side-by-side diff view gets **266px per side** — narrower than Monaco's own minimap+gutter+scrollbar chrome. The 424 default was picked from a measurement at 1280 and below; nobody measured it at 960, and the drag clamp (`:341`, `200..520`) means the operator has to discover the fix.

`AddAgentModal.tsx:451-452` (`width={940}`, `maxWidth="95vw"`) crosses its clamp for the first time at a 960 window: 95vw = 912.

**Not caught.** No plan touches `IdePanel.tsx` or `AddAgentModal.tsx`, and 01-29's success criteria are the AUTO chip, the model chip and the constant pin.

### R-05 — INFO: `clampBounds` behaviour change

`src/main/index.ts:2525-2526` floors restored geometry at `MIN_WIN`. A user whose persisted `window.bounds` is 1000×800 is silently widened to 1280 today and restored at 1000 after the change. Intentional and correct; noting it because it changes what an existing install does on the first launch after the update, and no plan's SUMMARY will mention it.

---

## 2. `redactSecrets` widening (plan 01-26, Task 1)

### The blast radius is worse than "over-redaction"

The scrub does not rewrite files — `src/main/hive.ts:3246-3268` **unstages the whole path** and logs `secret-scrubbed`, with a warning that says *"it will be skipped again on every commit."* `harnessAuthored` (`:3123-3133`) whitelists exactly two paths by byte-identity (`bin/cth-hook.cjs`, `bin/hive-proxy.cjs`). Everything else — every agent-authored file under `<hive>/agents/<id>` — is dropped from history **permanently and silently**, with a log line indistinguishable from a real credential hit.

### R-06 — BLOCKER: `sk[-_]` has no word boundary **[demonstrated]**

The live pattern (`src/main/hive.ts:402-406`) already lacks `\b` on the `sk-` alternative. Adding `sk_` to it makes ordinary snake_case identifiers match. Run against the widened pattern:

```
const task_scheduler_interval_ms = 5;              =>  const ta[redacted] = 5;
def risk_assessment_matrix_builder(x): pass        =>  def ri[redacted](x): pass
from flask_sqlalchemy_helpers import db            =>  from fla[redacted] import db
disk_usage_report_generator()                      =>  di[redacted]()
mask_sensitive_output_fields = True                =>  ma[redacted] = True
const desk_seat_pool_assignment = seatPool.next(); =>  const de[redacted] = seatPool.next();
kiosk_display_configuration_panel                  =>  kio[redacted]
ask_the_operator_before_deleting = true            =>  a[redacted] = true
```

Every one of those unstages the file that contains it, forever. This repo is an office simulator with `desk`/`seat` naming (`src/renderer/src/scene/office/SeatPool.ts`) — the shape is not hypothetical even inside the harness, let alone inside the arbitrary user projects agents work in.

**No criterion catches it.** The plan's stated control is `test/voice-messages.test.cjs:224-230`:

```js
const BENIGN = [
  'integrated feat/voice-key-ux at commit db61b12 off main 4585902',
  'kevin-mqpbq43v parked, awaiting assignment',
  '/Users/dev/Documents/Personal/cth-voice-msg-access is the worktree',
  'The token cap is 1.2 million tokens this session.',
  'Tasks: 3 todo, 1 doing, 0 blocked, 12 done.',
  'Pam approved 8 of 8 dimensions, no must-fix.'
];
```

Not one string contains `sk-` or `sk_`. The plan even names the wrong risk: *"the optional-quote widening is the edit most likely to start eating ordinary prose, and that list is the control that catches it."* Pattern 3 is the more damaging of the two and has no control at all.

**Fix:** anchor it — `\bsk[-_](?:ant[-_])?[A-Za-z0-9_-]{16,}\b` at minimum, and better, require a Stripe/Anthropic-shaped body (`sk_(?:live|test)_`, `sk_ant_`) rather than any 16-char run. Add `desk_seat_pool_assignment`, `task_scheduler_interval_ms`, `disk_usage_report_generator` and `risk_assessment_matrix` to `BENIGN`.

### R-07 — BLOCKER: the optional closing quote eats config templates **[demonstrated]**

Widening group 2 to `(["']?\s*[:=]\s*)`:

```
"token": 1200000,                        =>  "token=[redacted],
"api_key": "$OPENAI_API_KEY"             =>  "api_key=[redacted]
"secret": "REPLACE_ME"                   =>  "secret=[redacted]
"private_key": "-----BEGIN"              =>  "private_key=[redacted]
{"maxTokens": 200000, "token":"sess-a"}  =>  {"maxTokens": 200000, "token=[redacted]}
'x-md-reply-token': cfg.token            =>  'x-md-reply-token=[redacted]
```

The last one is a real line in a shipped file — `resources/md-slack-reply.cjs:80`. Scanning this repo's own tree, the widening produces six new hits, all of that shape (a header-name key ending `-token`/`-secret` with a variable or placeholder value). In an agent's workspace that shape is `.env.example`, `docker-compose.yml`, `config.template.json`, a Terraform variable file, a test fixture — every one of which becomes permanently uncommittable, silently.

Note `"token": 1200000` specifically: a **numeric budget** in a JSON config now trips the credential scan. The hive commits `registry.json`, `tasks.json` and every per-agent `settings.json` (the plan's own comment says so), so this is inside the harness's own data path, not just the agent's.

**No criterion catches it.** Same `BENIGN` list; it contains no JSON, no YAML and no key/value line at all.

**Fix:** require the value to look like a credential, not merely to be six characters — exclude pure digits, exclude `$`-prefixed env references, exclude `null`/`true`/`false`, and exclude ALL-CAPS placeholder tokens. Add every line above to `BENIGN` with `assert.strictEqual`.

### R-08 — WARNING: the replacement mangles the JSON it redacts **[demonstrated]**

`src/main/hive.ts:417` is `(_m, k) => \`${k}=[redacted]\`` — it drops group 2 and group 3. With group 2 now absorbing the key's closing quote, `{"token": "abc123456"}` becomes `{"token=[redacted]}`: unbalanced quote, `:` replaced by `=`, closing `}` orphaned.

For the commit scan that only matters as "something changed". For the **mail path** (`src/main/hive.ts:2254-2255` redacts every hive message `subject` and `body`) the mangled text is what the receiving agent actually reads. An agent handed `{"token=[redacted]}` is handed invalid JSON.

**No criterion catches it.** The `SECRETS` assertions at `voice-messages.test.cjs:202-206` check only `!out.includes(secret)` and `out.includes('[redacted]')` — never the surrounding shape.

### R-09 — WARNING: the inverted ceiling test loses its only specificity arm

`test/hive-durability.test.cjs:305-341` currently asserts two shapes get through, plus a control that the known shape does not (so it cannot pass vacuously). Plan 01-26 inverts the first two and keeps the control. After the inversion the test measures **sensitivity three times and specificity zero times** — and R-06/R-07 are specificity failures. Add a fourth case: an agent file containing `const task_scheduler_interval_ms = 5;` and `{"maxTokens": 200000}` must still reach `git log -p` in the same commit.

---

## 3. `t.skip()` conversions (plans 01-24 Task 3, 01-30 Task 1)

### R-10 — INFO: no absolute-count gate exists. The drop is safe.

Checked and found clear:

- `.github/workflows/ci.yml:115` is `run: npm test`. No count parsing, no `--test-reporter` threshold, no coverage gate.
- `package.json:26` is `"test": "node --test test/*.test.cjs"` — a glob, so the three new files are collected automatically.
- `test/ci-config.test.cjs:71-72` reads `test/` only to check every file is covered by the glob (`:74-84`). It asserts no count.
- `test/repo-claims.test.cjs:98` asserts `files.length > 50` over the **renderer** tree, not `test/`.
- `test/repo-claims.test.cjs:175` asserts `harnesses.length > 0`. A floor, not a pin.
- `grep -rn "515\|511\|531\|535" test/*.cjs` → **zero hits**. No prior plan's `515/511` baseline was ever encoded as an assertion.

The only pinned figure is prose: `01-VALIDATION.md`'s frozen `# skipped 4` set. It is a planning document with no executable enforcement, and plan 01-31 Task 3 updates it. Between waves 1 and 4 the repo carries a wrong figure with nothing to catch it — doc drift, not breakage.

### R-11 — WARNING: the new test files must be `node:test`

`test/repo-claims.test.cjs:169-196` collects every `test/*.test.cjs` that does **not** `require('node:test')` and re-runs it with every assertion poisoned, asserting a non-zero exit. Plan 01-26 says of `test/hive-proxy-token.test.cjs`: *"fake only the child process — the thing under test is the ORDER of mint, set and revoke, so the test must control when generation 1's `exit` fires."* That is the shape most likely to be written as a hand-rolled driver. If any of the three new files is hand-rolled, it enters the poison loop and adds a child-process spawn per run — and if it is hand-rolled *and* swallows its own failures, `repo-claims` goes red naming it.

Low risk, easily avoided, but no plan states the constraint.

---

## 4. OTLP authentication (plan 01-25)

### Every producer, traced

`grep -rn "OTEL_EXPORTER_OTLP_ENDPOINT\|otelEndpoint" src/ resources/ tools/ scripts/` → the endpoint is injected in exactly one place:

```
src/main/hive.ts:1082   if (claudeProvider && this._otelEndpoint) { … }
src/main/hive.ts:1087   env.OTEL_EXPORTER_OTLP_ENDPOINT = this._otelEndpoint;
```

- **Claude Code CLI** — the only producer. Gated on `claudeProvider`.
- **The six hook shims** — post newline-JSON to `HIVE_SOCK`, not HTTP. Unaffected.
- **The qwen/crush proxy sidecar** — `hive.ts:3855-3863` `emit()` opens a socket to `SOCK`. Its provider is not `claudeProvider`, so `hive.ts:1082` never gives it an OTLP endpoint. Unaffected, **verified**.
- **`providerAutomation` / vendor CLIs** — no OTLP env is built for them.
- **Anything else** — `grep -rn "v1/metrics\|v1/logs" src/` returns only `telemetry.ts:335-336`. No main-side self-post.

So the change breaks exactly one producer if the header spelling is wrong — and that producer is the entire cost/telemetry substrate.

### R-12 — BLOCKER: the blackout is total, silent, and the plan defers the only test that would detect it

Plan 01-25 marks it itself: *"**MEASUREMENT UNAVAILABLE without an operator:** whether a real `claude` child actually sends the `x-hive-token` header."* The round-trip test proves the collector accepts a header the app can construct — it cannot prove the Claude Code SDK forwards `OTEL_EXPORTER_OTLP_HEADERS` rather than requiring `OTEL_EXPORTER_OTLP_METRICS_HEADERS` / `..._LOGS_HEADERS`, which the OTel spec defines as taking precedence for the per-signal exporters this env turns on (`OTEL_METRICS_EXPORTER=otlp`, `OTEL_LOGS_EXPORTER=otlp` at `hive.ts:1084-1085`).

If it does not forward, every Claude batch 401s and the following go dark **with no red anywhere**:

| Consumer | Anchor | Failure |
|---|---|---|
| Cost ledger | `src/main/index.ts:1613` `hive.appendCostLedger(sample)` | no rows |
| Resume key | `src/main/index.ts:1622` `hive.recordSession(id, sample.sessionId)` | `--resume` after a crash silently starts fresh |
| Budget arm | `src/main/breaker.ts:359` `input.budget` from `hive.budgetForAgent` | never trips |
| Per-agent cap | `src/main/breaker.ts:369` | never trips |
| Floor cost cap | `src/main/breaker.ts:373` `isTopSpender` | never trips |
| Floor token cap | `src/main/breaker.ts:377` | never trips |
| Velocity arm | `src/main/breaker.ts:385-390` needs `input.sample` + `s.lastSample` | never trips |
| Account failover | `src/main/index.ts:435` `telemetry.onApiError(… accountPool.handleApiError)` | a dead Claude account is never rotated out |

The only signal is a throttled `console.error` in the main process — invisible in a packaged app. Cost tracking and the budget arm both go blind and **nothing turns red**, which is exactly the failure mode the phase exists to remove.

**No criterion catches it.** 01-25's `<verification>` block explicitly records the gap and instructs "do not mark it verified." That is honest, but it does not make the regression acceptable: the change is being made anyway, and the app ships between now and the operator's session.

**Fix:** make the outage self-announcing rather than log-only. The collector already knows how many batches it refused (`this.rejected`-style counter, mirroring `hooks.ts:400-410`). Surface a floor-level banner or toast after N consecutive refusals — the same posture `hooks.ts:395-412`'s comment argues for (*"a silent version of that is far harder to diagnose than the hijack it prevents"*). Additionally: set **both** the generic and the two per-signal header vars, so a precedence surprise cannot produce the blackout at all.

### R-13 — WARNING: the construction-order window

`src/main/index.ts:379` constructs `TelemetryCollector`; `:543` constructs `HookServer`. The plan requires a request arriving in that window to fail closed. Correct posture — but it means the app has a startup interval in which authenticated telemetry is refused. That is normally empty (no PTY exists yet), but a floor restored with `resume: true` respawns agents from a renderer effect, and the plan gives no bound on the window. At minimum the refusal in that window must be logged distinguishably from a forged batch, or the first real diagnosis of R-12 will chase the wrong cause.

### R-14 — WARNING: a second capability in every grandchild's environment

`src/main/pty.ts:707-736` spreads `...process.env` into the child, and the new `OTEL_EXPORTER_OTLP_HEADERS` sits alongside `HIVE_SOCK_TOKEN`. Every Bash tool call the agent makes inherits both. One `env` dump now leaks two capabilities instead of one, and the collector capability is equivalent to the hook socket's identity because plan 01-25 derives `agentId` from the same registry. The plan names this as the GATE-02 ceiling — correctly — but the ceiling's cost went up and the SUMMARY should say so rather than restate it unchanged.

### R-15 — INFO: the threat model's "every producer" is not enumerated

`T-P25-01`…`T-P25-07` reason about the collector but nowhere lists what posts to it. I enumerated it above; it is a single producer and the proxy tier is clear. Recording it so a future reader does not have to re-derive it.

---

## 5. `realResolve` gaining a base (plan 01-24, Task 1)

### R-16 — BLOCKER: any single-`../` token in any Bash command is denied as "another agent" **[demonstrated]**

`src/main/hooks.ts:445-451` feeds **every shell word** of every `Bash` command into `denyReason`:

```ts
const expanded = this.expandHiveVars(agentId, ti.command);
for (const word of expanded.split(/[\s;&|<>()"']+/)) if (word) targets.push(word);
```

Plan 01-24 makes the candidate set for a relative word `[join(registryCwd, w), join(hiveRoot, 'agents', agentId, w)]` and denies on **any** match. Simulating that against the four live deny branches (`hooks.ts:487-513`), with `hive = /home/u/.markx/hive`, `agentId = a-1`, `registryCwd = /home/u/projects/myrepo`:

```
DENIED  "../node_modules/.bin/tsc"   OTHER-AGENT(node_modules)
DENIED  "../shared/lib.ts"           OTHER-AGENT(shared)
DENIED  "../packages/core"           OTHER-AGENT(packages)
DENIED  "../b-1/settings.json"       OTHER-AGENT(b-1)          ← the one the plan wants
allowed "../../scripts/build.sh"
allowed "notes.md"   "./src/index.ts"   ".."   "bin/tool"   "--force"
```

The deny fires from **base 2 alone** — `join('<hive>/agents/a-1', '../node_modules/.bin/tsc')` = `<hive>/agents/node_modules/.bin/tsc`, which is inside `<hive>/agents` with owner `node_modules ≠ a-1`. And base 2 adds **no security value**: `hooks.ts:510-513` explicitly allows an agent its own directory, so joining onto the agent's own hive dir can only produce a false deny.

`../` is the single most common relative form in real work: monorepo package references, `../node_modules/.bin/*`, sibling git worktrees (`useHive.ts:1085` sets an agent's cwd to `a.worktreePath`, and worktrees are siblings), `cd ../other && npm test`. The operator sees:

> `Denied: <hive>/agents/node_modules belongs to another agent. Its settings.json names the hook commands that agent runs…`

— a message that names a directory that does not exist, about an agent that does not exist, for a command that touched neither.

**No criterion catches it.** The plan's behaviour list has exactly one allow case (`{ file_path: 'notes.md' }`) and no `../` case at all. Its "every existing absolute-path case still returns exactly the reason it returns today" clause is satisfied by construction, because absolute targets are byte-identical by design.

**Fix:** drop base 2 entirely — it contributes only false denies. Use the registry cwd alone, and only when the registry cwd is itself inside the hive root (which is the only configuration where a relative path can reach a protected directory). That closes the plan's actual finding (`agents/a-1` cwd + `../../bin/cth-hook.cjs`) with none of the collateral.

### R-17 — WARNING: the god's relative reads of the floor become denied

```
src/renderer/src/hooks/useHive.ts:408   { id: GOD_ID, name: 'Michael', … cwd: config.harnessHome!, isGod: true, … }
src/main/hive.ts:520-522                root() { const home = this.getHome(); return home ? join(home, 'hive') : null; }
```

Michael's registry cwd is the harness home; the hive is `<harnessHome>/hive`. After the fix, `cat hive/agents/oscar/inbox/msg.json` resolves to `<hive>/agents/oscar/…` and is **DENIED**. Absolute forms are already denied today, so the fix is internally consistent — but it is a live behaviour change for the orchestrator, in a floor whose whole model is "Michael coordinates the others". The plan's behaviour list has no god case and no case where the agent's cwd is the hive's parent.

### R-18 — WARNING: the "no base known" deny branch is unreachable

`protectedPathDenial` returns early at `hooks.ts:435-436` when `!root`, so `denyReason` never runs without a hive root — which means `join(hiveRoot, 'agents', agentId)` **always** exists and the candidate set is never empty. The plan mandates:

> *"If the candidate set is empty (relative target, no registry entry, no hive root) → return a deny reason that names the missing base."*

and a behaviour case for it. The branch is dead code, and the case can only be produced by constructing a state the caller forbids. A test that fakes an impossible state to prove a deny is exactly the vacuity class this phase's own review found three times.

---

## 6. `buf` consumption (plan 01-24, Task 2, gap 8)

### R-19 — WARNING: the doubled-side-effect claim is false for every shipped shim

The prompt's hypothesis was that something downstream had been tuned to a doubled rate. It has not — because the doubling does not happen. Every emitter is **one payload per connection**:

| Shim | Anchor | Shape |
|---|---|---|
| `HOOK_SHIM` (status) | `hive.ts:3652` | `c.end(JSON.stringify(payload) + '\n')` — write + FIN |
| `HOOK_SHIM` (main) | `hive.ts:3665` | `c.write(…)`, then `c.on('end', () => done(0))` → `process.exit(0)`. Never a second line |
| `AGY_HOOK_SHIM` | `hive.ts:3730` | same |
| `OPENCODE` / plugin | `hive.ts:3759`, `:3798` | `c.end(…)` |
| proxy `emit()` | `hive.ts:3861` | `c.end(…)` — and it opens a **fresh connection per payload** (`:3855-3862`) |
| grok shim | `hive.ts:4113` | `c.write(…)` then read-and-exit |

So there is no doubled cost sample, no doubled `breaker.recordToolUse`, no second `drainAtStop` cursor advance and no second toast to halve. **The breaker's thresholds and the cost ledger are unaffected in both directions.** Plan 01-24 instructs the executor to paste that claim into the SUMMARY as an established fact:

> *"The doubled side effects this closes are real and named in the review: a doubled cost sample, a doubled `breaker.recordToolUse` repeat count, a second `drainAtStop` cursor advance and a second toast, all from ONE authenticated payload."*

They are reachable only by a peer that writes past the newline on the same connection, and no such peer ships. The fix is correct hardening; the claim is an overstatement that will land in a SUMMARY as measured truth.

There is a *real* latent shape worth naming instead: because `buf` is never sliced, a peer that sends **two** payloads on one connection re-handles line 1 and **never handles line 2**. The `done` flag fixes the first half and leaves the second half silently dropped. If a future shim batches, the fix converts over-counting into under-counting with no error.

### R-20 — BLOCKER: the cap and the timeout are two NEW fail-open doors on the PreToolUse gate

Every shim treats a socket failure as **allow**:

```
src/main/hive.ts:3669   c.on('error', () => process.exit(0));
src/main/hive.ts:3670   setTimeout(() => process.exit(0), 5000).unref();
src/main/hooks.ts:253   // "the shims exit 0 on a connect error, and exit 0 with no stdout is *allow*"
test/net-binding.test.cjs:318-320  the same fact, asserted
```

Plan 01-24 adds a byte cap that `destroy()`s the connection and a `conn.setTimeout(…)` that destroys it. Both produce `ECONNRESET` at the shim, which exits 0, which **allows the tool call**. So:

1. A `PreToolUse` for `Write` carries the file contents. `src/main/fs.ts:113` permits 2 MB text reads and `:142` 10 MB binary; an agent writing a large generated file produces a payload larger than any cap the plan suggests. Sizing the cap like its named siblings (`slack.ts:105` = 1 MB) means **the largest writes are exactly the ones the gate stops inspecting**.
2. Any peer slow to write its first newline — a loaded machine, a cold `node` start under the 5 s shim budget — is destroyed and allowed.

The plan's behaviour list asserts only *"the server does not accumulate past the cap"* and *"is destroyed by the idle timeout rather than held open."* Neither asserts the **security consequence**, and there is no case asserting that an over-cap `Write` targeting `<hive>/bin` is still denied.

**No criterion catches it.**

**Fix:** on cap-exceeded and on timeout, reply `conn.end(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny', … } }))` **before** destroying — fail closed at the one place the gate can. Size the cap from the largest `Write` the app itself permits (`fs.ts:142`, 10 MB), not from `slack.ts`. Add the deny-on-oversize case to the acceptance list.

---

## 7. The quiesce status filter (plan 01-28, Task 2)

### Which agents stop being woken

Every agent whose store status is `'blocked'`. Two writers set it:

```
src/renderer/src/hooks/useHive.ts:566   updateAgent(e.agentId, { status: 'blocked', waitingOnGod: !self.isGod });   // hook Notification
src/renderer/src/hooks/usePtyParser.ts:188/:203  updateAgent(agentId, { status: 'blocked', … })                     // terminal text
```

and the terminal-text writer matches on:

```
src/renderer/src/hooks/usePtyParser.ts:31-37
const BLOCK_HINTS = [ /Do you want to proceed/i, /❯\s*\d+\.\s*Yes/i, /Yes, and don't ask again/i, /\(y\/n\)/i, /\[y\/n\]/i ];
…
const recent = text.slice(-400);
if (BLOCK_HINTS.some(re => re.test(recent))) { … }
```

`/\(y\/n\)/i` and `/\[y\/n\]/i` match the **terminal tail**. Any agent that prints `(y/n)` — echoing a shell script it wrote, `cat`ing a README, showing a diff of an installer prompt, quoting a man page — is falsely marked blocked. This is not a rare shape.

### R-21 — BLOCKER: the guard cannot tell the two Stop producers apart

```
src/main/delivery.ts:671  this.deps.emit('hive:hookEvent', { agentId: a.agentId, event: 'Stop', blocked: false });
src/main/hooks.ts:841-850 send('hive:hookEvent', { agentId, event, tool: p.tool_name, notificationType, source, message, blocked });
```

For a real Stop from Claude Code, `tool`, `notificationType`, `source` and `message` are all `undefined` — **byte-equivalent at the renderer to the synthesized one**. Guarding `useHive.ts:531-534` on `status === 'blocked'` therefore swallows the genuine turn-end Stop as well.

Today a falsely-blocked agent recovers at its next real Stop (`useHive.ts:532-534` → `idle`). After the guard it recovers only if it produces another `PreToolUse` / `PostToolUse` / `UserPromptSubmit` — and an agent that has finished its turn produces none. It is then stuck `blocked` forever, and:

```
src/renderer/src/hooks/useHive.ts:761   if (!self || self.status === 'blocked') return; // never talk over a prompt
```

**That agent never receives mail again.** `delivery.ts:669` (`this.quiesced.add(...)`) also guarantees main will not re-announce for that quiet spell, so nothing retries.

**No criterion catches it.** The plan's four behaviour cases all drive the arm directly with a synthetic event; none distinguishes source, and none covers "a genuinely finished agent that was falsely blocked."

**Fix:** discriminate at the source. Add a field to `delivery.ts:671`'s payload — `{ event: 'Stop', blocked: false, synthesized: true }` — and guard on **that**, not on the agent's status. It is one key, main already owns the emit, and it makes the guard mean what the plan says it means (*"silence is not turn-end for a blocked agent"*) instead of *"a blocked agent's turn never ends."*

### R-22 — WARNING: skipping the breaker reset makes R-21 unrecoverable

`useHive.ts:532` `breakerLevel.current[e.agentId] = 'healthy'` is the **only** place that clears the renderer's breaker override. Every other status arm in effect 2 is gated `if (!breakerArmed)` (`:506`, `:509`, `:512`, `:516`, `:520`, `:523`). So for an agent that was `constrained`/`stopped` and then blocked, the plan's guard removes the last exit: `breakerArmed` stays true, so no later `PreToolUse` or `PostToolUse` can clear the status either. The stuck state in R-21 becomes permanent until a respawn.

The plan states this deliberately: *"do nothing — neither the status write nor the `breakerLevel.current[id] = 'healthy'` reset."* It does not state the consequence.

### R-23 — WARNING: "keeps its `blockReason`" pins an accident

`updateAgent` merges. `useHive.ts:534`'s idle write never clears `blockReason`, so a *normally* idled agent already carries a stale `blockReason` today. The plan's behaviour case — *"keeps its `blockReason`"* — reads as a designed property; it is an existing bug that the fix now depends on. If anyone later fixes the stale-`blockReason` leak, this plan's test goes red for the right reason and will look like a regression.

---

## 8. Plan 01-27 — the budget band and the queue loader

### R-24 — BLOCKER: "byte-identical when the band is the only thing wrong" is false

`src/main/breaker.ts:358-365`'s early return today prevents the no-progress arm from running at all. That arm is **stateful**:

```
src/main/breaker.ts:398-407
  if (!input.progressing && !toolActive) {
    s.noProgressBeats += 1;
    if (s.noProgressBeats >= NO_PROGRESS_BEATS) {
      return { tripping: true, reason: 'no-progress: generating tokens without coordinating (stale log/files)' };
    }
  } else { s.noProgressBeats = 0; }
```

With the band no longer returning early, `s.noProgressBeats` accumulates for every band-only beat. After `NO_PROGRESS_BEATS` consecutive beats the no-progress arm returns **with no ceiling**, so `breaker.ts:288` escalates one rank per beat up to `cfg.hardStop ? 'stopped' : 'constrained'`.

That directly contradicts the plan's own criterion:

> *"Agent at 85% of a card cap and nothing else wrong → trips with the BUDGET reason and `ceiling: 'steering'`, exactly as today, and **stays at `steering` across repeated beats rather than escalating**."*

and it defeats D-18's posture, which `breaker.ts:352-357` writes down explicitly (*"do NOT 'finish' this into a kill… An agent killed mid-edit with unsaved work is precisely the trust failure this product exists to prevent"*). With `hardStop` on, a card merely near its budget now reaches `stopped`.

The plan's repeated-beats test passes **vacuously** unless it supplies `input.sample` and `s.lastSample` on consecutive beats with `progressing: false` and no recent tool activity — which the plan does not require.

**Fix:** if the soft band is remembered rather than returned, the remembered result must also suppress the arms whose *only* effect is stateful accumulation, or the state must be advanced identically in both paths. State it explicitly, and write the repeated-beats test with `progressing: false` and `NO_PROGRESS_BEATS + 1` beats so it can actually fail.

### R-25 — WARNING: a transient read error now rejects the operator's message with a false reason

```
src/main/delivery.ts:443-444
  const queue = this.loadQueue();
  if (!this.queueFile) return { ok: false, error: 'no harness home — nowhere durable to park this' };
```

Leaving `queueFile = null` after a non-`ENOENT` read failure means **every enqueue during that window is refused** — with a message that is flatly wrong. There *is* a harness home; the file was momentarily locked by antivirus or an indexer, which is the exact stall class the plan cites as its motivation.

Composed with plan 01-28 (which surfaces main's `error` verbatim through the composer's `statusHint` at `MessageQueueComposer.tsx:168/:222-233`), the operator is told there is no harness home during a virus scan. That is a support ticket manufactured by two plans that never read each other's failure text.

The trade is also not free in the direction the plan claims: today a transient error loses the *persisted* queue; after the fix it loses the *new message* instead. Both are data loss. Plan 01-27's behaviour list asserts the on-disk bytes are unchanged and never asserts the enqueue **result**.

**Fix:** distinguish a third state — `queueFile` armed for reads but marked dirty for writes — or return a distinct error (`'queue temporarily unreadable — try again'`) that the composer can render honestly. One string.

---

## 9. Plan 01-29 — the AUTO chip, the model chip, the pin

### R-26 — WARNING: tokenizing loses `--flag=value`, a new FALSE NEGATIVE on a safety chip

`src/renderer/src/store/autoMode.ts:66-69` is `command.includes(flag)` today, so `mytool --dangerously-skip-permissions=true` **matches**. Whole-argv tokenization does not: the token is `--dangerously-skip-permissions=true`, which is not equal to `--dangerously-skip-permissions`.

The module's own docstring calls a missing chip on a bypassed agent *"the worst failure this chip can have"*, and the new `custom` arm is precisely where an operator types free text. `AddAgentModal`'s custom command is spawned verbatim (`src/renderer/src/store/config.ts:414`), so `=`-joined forms are entirely plausible.

**Not caught.** The plan's cases are `--yolo --dangerously-skip-permissions`, `kimi --auto-compact`, `kimi --auto`. **Fix:** match a token whose `split('=')[0]` equals the flag token.

### R-27 — WARNING: scanning every preset's flag paints AUTO for generic words

```
src/shared/agentProvider.ts:289  autoModeFlag: '--auto'      (kimi)
src/shared/agentProvider.ts:472  autoModeFlag: '--approve'   (crush)
src/shared/agentProvider.ts:326  autoModeFlag: '--yolo'
src/shared/agentProvider.ts:426  autoModeFlag: '--yolo'
```

A custom command `mytool --auto` (meaning "non-interactive"), or `deploy --approve` (meaning "skip the confirmation on the deploy, not on tool calls"), now shows the AUTO chip and its accessible name claims a permission bypass that does not exist. That is the mirror image of the `--auto-compact` false positive the same task is fixing, introduced by the same task. No case covers it.

### R-28 — WARNING: two presets carry an empty flag

`src/shared/agentProvider.ts:356` and `:531` are `autoModeFlag: ''`. If the new custom-arm loop does not skip empties, `hasFlag(command, '')` splits to `[]` and "every flag token present" is **vacuously true** → every custom agent shows AUTO. The existing per-provider arm guards with `if (!flag) return false` (`:66-67`); the new loop is separate and the plan never states the guard. Their listed case `isAutoModeAgent('custom', 'my-agent', true) === false` *does* catch it — this is a WARNING because the trap is unnamed, not because it escapes.

### R-29 — WARNING: a renderer test now parses a main-process source file

Plan 01-29 Task 3 has `test/renderer-runstate.test.cjs` read `src/main/index.ts`, regex out `MIN_WIN`'s width and compare it to `SIDEBAR_COLLAPSE_WIDTH`. Renaming the constant, inlining it, or moving it to a shared module makes a **renderer** test fail with a message about the sidebar. The plan mitigates the vacuity half ("assert the extraction matched something") but not the brittleness half — and this phase's own conclusion is that pinning across files by textual anchor is what expires. Prefer exporting the constant from `src/shared/` so both sides import one value and the pin becomes a type-level fact.

---

## 10. Plan 01-30 — the release workflow

### R-30 — WARNING: widening the glob disarms the "no artifacts" tripwire

```
.github/workflows/release.yml:147-149
  files=$(ls *.dmg *.zip *.exe *.AppImage 2>/dev/null || true)
  [ -z "$files" ] && { echo "no artifacts to hash"; exit 0; }
```

Adding `latest*.yml` guarantees `$files` is non-empty on any run where electron-builder produced a feed file, whether or not it produced an installer. The guard that catches "this release built nothing" is disarmed by the same edit that widens the attestation. The result is a release that publishes an attested update feed with no installers and every check green — the precise composition review `c/WR-02` describes.

Plan 01-30 says *"Leave `[ -z "$files" ] && … ` alone unless task 2's coverage pin forces it"* and files `c/WR-02` as out of scope, so **no criterion catches it**.

**Fix:** one line — split the guard: `installers=$(ls *.dmg *.zip *.exe *.AppImage 2>/dev/null || true); [ -z "$installers" ] && { echo "::error::no installers built"; exit 1; }` before hashing the wider set.

### R-31 — WARNING: the coverage pin parses shell out of a `run:` block

Deriving "the set of globs hashed" from `release.yml:143-155` means regex-matching a bash `ls` line inside a YAML block scalar. Any legitimate reformat (a `for` loop, a `PATTERNS=` variable, a heredoc) breaks the extraction. The plan requires asserting the extraction matched, which converts a silent pass into a red test — better than the alternative, but it is a pin on a *file the test does not own*, failing on refactors that are correct. Note the ceiling in the SUMMARY rather than presenting it as a durable gate.

Verified clear, for the record: adding `*.blockmap` and `latest*.yml` produces no filename collisions in `Flatten + merge checksums` (`:197-202`) — mac emits `latest-mac.yml`, Linux `latest-linux.yml`, Windows `latest.yml`; blockmaps are named after their installer. The hashed set becomes a superset of nothing it did not already ship.

---

## 11. Plan 01-31 — the doc and naming sweep

### R-32 — BLOCKER: the widened scan matches the test file itself

Plan 01-31 Task 2 widens `test/repo-claims.test.cjs:338-352` from a two-file loop to a tree-wide scan, and requires it stay **NOT comment-stripped**. The literal appears three times in that very file:

```
test/repo-claims.test.cjs:28   *   • #31 (FLOOR-07) — a keyword store described as an "Enterprise Knowledge Graph"
test/repo-claims.test.cjs:338  test('the keyword store is not described as an "Enterprise Knowledge Graph" (#31, FLOOR-07)', …
test/repo-claims.test.cjs:346  `${rel} calls the knowledge store an "Enterprise Knowledge Graph". `
```

The current test never reads itself because it loops over `['README.md', 'src/preload/index.ts']`. A tree-wide walker reads it. **As specified, the test cannot pass.** The plan names exactly two exclusions (`docs/floor-inspection.html`, `.planning/`) and neither is this.

**Fix:** construct the needle (`['Enterprise', 'Knowledge', 'Graph'].join(' ')`) or exclude the test file by explicit path with the reason written in, exactly as the plan already does for the audit record.

### R-33 — BLOCKER: build outputs carry the string, and the plan's own done-command fails **[demonstrated]**

Plan 01-31's `<done>`:

> `grep -rn "Enterprise Knowledge Graph" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.planning` returns only `docs/floor-inspection.html:710`

Run on this tree right now:

```
./dist/win-unpacked/resources/app.asar
./dist/win-unpacked/resources/skills/capabilities/SKILL.md
./docs/floor-inspection.html
./out/main/index.js
./resources/skills/capabilities/SKILL.md
./src/main/config.ts
./src/main/hive.ts
./src/renderer/src/store/config.ts
./test/repo-claims.test.cjs
```

`grep -r .` does not respect `.gitignore`. After every rename lands, the command still returns four paths, three of them build artifacts. The executor will either chase a phantom or delete `dist/`, and — worse — a tree-wide **test** walker with no `dist/`/`out/`/`build/` exclusion is permanently RED on every developer machine that has run `npm run build`, and on `release.yml`'s runners.

The plan says to reuse "the file walker the rest of this file uses (`:98`)". That walker is `sourceFiles(rendererRoot)` — scoped to `src/renderer`. Widening it to the tree requires exclusions the plan never names.

**Fix:** use `git ls-files` (or an explicit root list: `src/`, `resources/`, `docs/`, `test/`, plus the top-level `*.md`) rather than a raw tree walk, and state the exclusion set in the failure message.

### R-34 — WARNING: excluding `.planning/` wholesale exempts live documentation

`.planning/codebase/CONCERNS.md:46` carries the string, and `.planning/codebase/` is **not** phase scratch — `test/net-binding.test.cjs:414` reads `.planning/codebase/ARCHITECTURE.md` and `.planning/codebase/INTEGRATIONS.md` as living documentation:

```js
const docs = ['HIVE.md', '.planning/codebase/ARCHITECTURE.md', '.planning/codebase/INTEGRATIONS.md'];
```

The exclusion's stated justification is *"this phase's VERIFICATION, REVIEW and REQUIREMENTS documents quote the string as evidence."* That reason does not extend to `.planning/codebase/`, which is the repo's architecture record. Exclude `.planning/phases/` specifically, not `.planning/`.

### R-35 — WARNING: `DESIGN.md` has no owner in the whole set

01-31 is the doc-residual sweep and runs last, explicitly *"so its pins are written against the finished tree."* It is the natural owner of R-01, and `DESIGN.md` is not in its `files_modified`. The set therefore closes ROADMAP criterion 1's known residual while leaving a fresh, self-inflicted instance of the same criterion open in the design spec.

---

## Cross-plan composition risks

1. **01-27 R-25 × 01-28.** 01-27 makes `enqueue` return `'no harness home — nowhere durable to park this'` on a transient FS error; 01-28 renders that string to the operator verbatim. Neither plan reads the other's failure text.
2. **01-24 R-16 × 01-26 R-06/R-07.** Both fixes make an agent's ordinary work fail silently — one blocks tool calls on `../`, the other blocks files from the commit. An operator hitting both simultaneously has two independent invisible failures with two different, misleading log lines.
3. **01-25 R-12 × 01-27 R-24.** 01-27 makes the breaker's arms *reachable*; 01-25 risks making their **inputs empty**. If the header spelling is wrong, 01-27's enforcement improvement is unobservable and unverifiable — and the SUMMARY for 01-27 will still report its unit tests green.
4. **File ownership is clean.** Wave 1: `hooks.ts` (01-24), `hive.ts` (01-26), `breaker.ts`/`delivery.ts` (01-27), renderer (01-28) — no overlap. Wave 2: `src/main/*` (01-25) vs `test/`+`.github/`+`SECURITY.md` (01-30) — no overlap. Verified.

---

## What I would gate on before any of this executes

1. **01-24 T1** — delete base 2 from the candidate set. It produces every false deny in R-16 and no security value.
2. **01-24 T2** — fail **closed** on cap and timeout: reply with a deny before `destroy()`. Size the cap from `fs.ts:142`.
3. **01-25 T3** — add `DESIGN.md` to `files_modified` and add a persistence guard to the splitter re-clamp (R-01, R-02).
4. **01-25 T2** — set the per-signal header vars as well as the generic one, and make N consecutive 401s operator-visible (R-12).
5. **01-26 T1** — word-boundary and body-shape the `sk` alternative; add the six demonstrated false-positive lines to `BENIGN` with `assert.strictEqual` (R-06, R-07).
6. **01-27 T1** — write the repeated-beats test with `progressing: false` over `NO_PROGRESS_BEATS + 1` beats, and reconcile the `noProgressBeats` side effect (R-24).
7. **01-28 T2** — add `synthesized: true` to `delivery.ts:671` and guard on the source, not on the agent's status (R-21).
8. **01-31 T2** — construct the needle and drive the scan off `git ls-files`, or the test cannot pass (R-32, R-33).

---

_Lens 5 of 5 — regression hunt. Read against live source at `47a48cd`; every "[demonstrated]" finding was reproduced by executing the proposed pattern/logic against real inputs._
