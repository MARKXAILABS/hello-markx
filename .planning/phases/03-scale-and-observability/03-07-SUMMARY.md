---
phase: 03-scale-and-observability
plan: 7
subsystem: renderer
tags: [timeline, svg, accessibility, empty-states, cost-attribution, replay]

# Dependency graph
requires:
  - phase: 03-03
    provides: "hive:timeline / hive:timelineBucket, one discriminated {ok} shape on every path, firstTs, eventsAgedOut, and a 200-row bucket cap whose `total` counts DISPLAYABLE rows"
  - phase: 04-02 (RECORD-02)
    provides: "the events table and appendEvent(kind, json, ts) whose `json` is the whole hive log row — which is what makes ActivityTab's fmt vocabulary reusable on this surface at all"
provides:
  - "src/renderer/src/components/DayBandTab.tsx — the day band SVG, native scrubber, native day picker and one-bucket-deep merged detail list, with an injectable summary/bucket/day seam"
  - "The FIRST renderer consumer of 03-03's timeline IPC — both channels now have a live caller"
  - "CCTab 'timeline' + the 12th TABS entry ('day', clock icon), appended last"
  - "global.css's .cth-scrub block — the one CSS addition this phase makes"
affects: [SCALE-03, 03-08, 03-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A component whose data arrives by IPC takes the FULL discriminated result as an optional prop, so renderToStaticMarkup can drive the failure branch — which is otherwise unreachable from a first render and is the branch that matters most"
    - "One sentence, one single-line constant, used by BOTH the DOM and the aria-label — a sighted and a screen-reader operator cannot be told different things about the same day"
    - "Copy a formatter rather than import it when importing would close a module cycle, and pin the copy with a parity test that lifts BOTH bodies out of BOTH real sources (the shippedRelAge technique)"
    - "Mutation-test the load-bearing branch before trusting it: six mutants run here, six killed"

key-files:
  created:
    - src/renderer/src/components/DayBandTab.tsx
  modified:
    - src/renderer/src/components/CommandCenterPanel.tsx
    - src/renderer/src/design/global.css
    - test/renderer-components.test.cjs

key-decisions:
  - "The day picker renders on the FAILURE branch too. UI-SPEC :247's remedy is literally 'Pick the day again to retry' — an instruction whose control is off screen cannot be followed."
  - "ActivityTab's fmt was COPIED, not imported: CommandCenterPanel imports DayBandTab, and a cycle back leaves one binding undefined at module-init under the CJS loader the tests use. A parity test lifting both real bodies keeps the copy honest."
  - "The pre-fetch state asserts NOTHING — aria-busy and the day, never a fabricated '0 events, 0 envelopes, $0.00' and never an empty-state sentence. WorkersTab and ActivityTab both fabricate here; UI-SPEC cites the latter as the precedent for the sin."
  - "The cost-track gap wash sits BEHIND the bars rather than replacing them: a floor with one no-meter engine can still have real spend from its metered ones."
  - "Rows are narrowed at the trust boundary but NEVER dropped — preload types them unknown[], and a renderer-side filter would make {shown} stop matching main's {total}."
  - "No new sentence was invented. Every string is either quoted from UI-SPEC with its row, or is one of the three the plan names as its own."

patterns-established:
  - "Run the plan's own acceptance greps against what landed instead of assuming behaviour implies the pin — three passed in spirit and failed literally here"
  - "Prose in a comment can trip a literal negative grep; say why the sentence is worded around it"

requirements-completed: []

# Metrics
duration: 41min
completed: 2026-08-26
---

# Phase 3 Plan 7: SCALE-03 Day Band Summary

The day band landed as one accessible SVG of rects over 03-03's timeline IPC — a native
scrubber, a native day picker, a one-bucket-deep detail list, and eight distinct declared
sentences so that no state this surface can reach renders as silence it cannot account for.

## Verification, measured this session

| Gate | Result |
|---|---|
| `npm test` at base `5f6dcfdb` | **1116 tests, 1109 pass, 0 fail, 7 skipped, 23.9s** |
| `npm test` at head `53a6ecc9` | **1136 tests, 1129 pass, 0 fail, 7 skipped, 24.6s** |
| Delta | **+20 tests, +20 pass, 0 fail, +0.7s** |
| `npm run typecheck` | 0 errors (node + web) |
| `npm run lint` | 0 errors, 0 warnings (`--max-warnings 0`) |

The suite duration moved 23.9s → 24.6s. The brief's ~24.6s figure is matched exactly at head;
the base run measured 23.9s on this machine. Twenty new `renderToStaticMarkup` cases cost
~0.7s, which is the whole delta.

## Six mutants run, six killed

Every load-bearing branch was replaced with its plausible wrong version and watched go red.
A green suite against an unmutated implementation proves the code runs; this proves the
assertions are actually load-bearing.

| # | Mutation | Case that went red |
|---|---|---|
| A | Strip `{reason}` out of the error sentence | `round-3 #8: an ok:false timeline` |
| B | `if (false && summary.eventsAgedOut)` | `round-3 #9: a day whose events aged out…` |
| C | `noMeterCount >= 0` (unconditional gap sentence) | the transcript case **and** the all-metered case |
| D | Unreadable bucket renders `EMPTY_BUCKET` | `round-3 #8: an ok:false bucket detail` |
| E | `truncatedLine(detail.total, detail.total)` | `a truncated bucket shows the real total` |
| F | Drop the `\|\| e.act` blank-subject fallback | the detail-list case **and the parity test**, which is exactly what the parity test exists to catch |

## Baseline drift — every UI-SPEC anchor for the containment section had moved

The brief warned that line numbers predate 20 Phase-4 plans plus 03-01..03-03, and 03-03
measured 19 of 20 citations stale. Re-measured here; **content confirmed identical in every
case**, only the numbers moved.

| Citation | Says | Measured at base `5f6dcfdb` | Moved |
|---|---|---|---|
| UI-SPEC `:343` → tab strip block | `CommandCenterPanel.tsx:266-278` | **:295-307** | yes, +29 |
| UI-SPEC `:345` → `flexWrap`/`overflowX` | `:274-275` | **:303-304** | yes, +29 |
| UI-SPEC `:346` → `flex: '1 0 auto'` | `:288` | **:317** | yes, +29 |
| UI-SPEC `:347` → `padding: '4px 8px 3px'` | `:292` | **:319** | yes, +27 |
| UI-SPEC `:350` → `TABS` | `:79-90` | **:104-115** | yes, +25 |
| UI-SPEC `:351` → the ~1320px comment | `:251-255` | **:278-282** | yes, +27 |
| Plan `<interfaces>` → `CostTracking` type | `agentProvider.ts:81` | **:81** | **no** — the one that held |
| Plan → codex's `'transcript'` | `agentProvider.ts:257` | **:268** | yes, +11 |
| Plan → `boot.ts` append gate | `boot.ts:429` | **:467** | yes, +38 |
| Plan → `caps.spend === 'none'` | `config.ts:488-493` | **:513-519** | yes, +25 |
| Plan → `'workers'` tab position | `CommandCenterPanel.tsx:89` | **:114** | yes, +25 |
| Plan/UI-SPEC → `ActivityTab`'s `fmt` | `:1616-1625` | **:1677-1686** | yes, +61 |
| Plan/UI-SPEC → `hiveLog(60)` / `Nothing yet.` | `:1608` / `:1630` | **:1669** / **:1691** | yes, +61 |
| UI-SPEC S1f → the envelope append | `hive.ts:1668` | **:1844** | yes, +176 |
| UI-SPEC S1e → `LOG_TAIL_BYTES` | `hive.ts:326` | **:383** | yes, +57 |
| UI-SPEC S1e → `logTail()` | `hive.ts:2443` | **:2758** | yes, +315 |
| UI-SPEC S1b → `QrCode` SVG | `QrCode.tsx:50-67` | **:50-66** | close enough |
| Plan → `main.tsx` CSS import | `main.tsx:5` | **:5** | **no** |

**16 of 18 resolvable citations had moved**, some by hundreds of lines. Every edit was made
by symbol, never by line number.

Counts the plan asserted, re-measured and **confirmed**: seven presets carry
`costTracking: 'none'` (grok, kimi, antigravity, opencode, pi, copilot, custom) and exactly
one carries `'transcript'` (codex). Both `>= 1`, so neither tier is hypothetical.

## Baselines re-measured before any work (all as the plan claimed)

`Could not read the timeline` · `Pick the day again` · `Nothing in this fifteen minutes` ·
`aged out of the record` · `no cost meter` · `never reaches the cost ledger` ·
`sentinel-store-unreadable` · `sentinel-bucket-unreadable` — **0 across `src/` and `test/`**.
`type="range"` anywhere in `src/renderer/src` — **0**. `.cth-scrub` — **0**.
`DayBandTab.tsx` — did not exist. `test/renderer-components.test.cjs` — **46 `test(` at column
0, 0 `describe(`**, so the mandated anchor-slice checks are sound; now 66 and 0.
`git ls-files "*.css"` returns exactly `design/global.css` and `design/tokens.css` — there is
no top-level `global.css`, confirming the plan's CSS-path correction.

## What survived the preload type and the whitelist, end to end

The brief's standing warning is that this project's defects hide in fields that are
unreachable by construction. Traced both new payloads the whole way:

- **`hive:timeline`.** `preload/index.ts:815-819` types the success half structurally, field
  for field — `buckets[]`, `firstTs: number | null`, `eventsAgedOut: boolean` — and the
  failure half as `{ok:false; error:string}`. There is **no whitelist and no re-declared
  type** on this path: `DayBandTab` derives its own types from the bridge
  (`Awaited<ReturnType<typeof window.cth.hiveTimeline>>`), so a change in preload is a type
  error here rather than a silently-wrong render. `eventsAgedOut` and `firstTs` are both
  asserted to reach rendered markup by their own cases, not merely to typecheck.
- **`hive:timelineBucket` — one real finding.** `preload/index.ts:826` types `rows` as
  **`unknown[]`**, so the `DetailRow` discriminated union `timeline.ts` actually returns
  (`{type:'event',ts,kind,json}` / `{type:'cost',ts,agentId,taskId,usd,tokens}`) is **erased
  at the renderer's type boundary**. This is a weaker version of the `HiveTask` whitelist
  class: the data *does* survive at runtime, but nothing types it, so a renderer that
  destructured `row.kind` would be writing against `unknown` with no compiler help.
  `src/preload/index.ts` is **not in this plan's `files_modified`**, so it was not touched.
  Handled correctly renderer-side instead: `rowParts()` narrows at the trust boundary and
  **drops nothing** — an unreadable row still renders, because `shown` must keep matching
  main's `total`. **Flagged for whoever owns preload next** (see Threat Flags).

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 2 — missing critical functionality] The day picker was rendering only on the success branch**

- **Found during:** Task 2.
- **Issue:** the plan's Task 1 has the `ok:false` branch "return before any gap-cause or
  count logic runs". Taken literally as an early return of the whole component, the failure
  state renders the error sentence — whose text is `Pick the day again to retry.` — with the
  day picker not on screen. The stated remedy would be unfollowable.
- **Fix:** restructured to a single return. The picker (and the scrubber, disabled) render on
  every branch; only the band, the declarations and the detail list change. `ok` is still the
  first thing branched on, before any count or gap-cause logic — which is what the criterion
  is actually protecting.
- **Files:** `DayBandTab.tsx`. **Commit:** `34bc4cb0`.

**2. [Rule 2 — missing critical functionality] A rejected IPC promise would have rendered as a quiet day**

- **Found during:** Task 2.
- **Issue:** the plan specifies the `ok:false` payload branch but not what happens when
  `ipcRenderer.invoke` itself rejects (main not up, channel gone, serialization failure).
  A bare `.catch(() => {})` — the idiom `WorkersTab` and `ActivityTab` both use — leaves
  `summary` null forever, which is precisely "a broken channel renders as a silent floor".
- **Fix:** both `.catch` handlers convert the rejection into `{ok:false, error}`, so a dead
  channel takes the same declared path a rejected day does.
- **Files:** `DayBandTab.tsx`. **Commit:** `34bc4cb0`.

**3. [Rule 1 — bug] Three acceptance criteria passed in spirit and failed literally**

- **Found during:** post-task verification, by running the plan's own greps rather than
  assuming the behaviour implied the pin.
- **Issue:** (a) the header comment named the Pixi constructor in prose, so
  `grep '<canvas\|new Application('` read **1** against a criterion of *exactly 0*; (b) the
  `ok:false` timeline case asserted the ARIA half through a helper, so the mandated anchor
  slice contained no literal `aria-label` and the check **failed**, reporting the ARIA half
  unproven; (c) the transcript case relied on codex's real preset without naming the tier, so
  `grep "costTracking: *.transcript."` read **0**.
- **Fix:** the comment makes its point without spelling the constructor out (and says why);
  the ARIA assertion reads the attribute inline, making the case self-contained about where
  it looks; the transcript case now pins its own premise against `AGENT_PROVIDER_PRESETS`, so
  if codex stops carrying that tier the case says so instead of quietly testing nothing.
  None of these weakened an assertion — (b) and (c) are strictly stronger than what they
  replaced.
- **Files:** `DayBandTab.tsx`, `test/renderer-components.test.cjs`. **Commit:** `53a6ecc9`.

**4. [Rule 1 — bug, test-side] One of my own RED assertions contradicted the binding spec**

- **Found during:** Task 1 GREEN.
- **Issue:** the first case asserted `> 96` `<rect>`s on a **sparse** fixture. S1b's encoding
  is "zero draws nothing", so satisfying that assertion would have required a 288-rect band
  of empty columns — the opposite of the spec.
- **Fix:** re-anchored the count on a fully-populated day (`>= 97`: 96 bars + plate). The
  correction was to a test I had just written, against a component that did not yet exist —
  no source path was bent to make a test pass. Recorded here because "I changed a test" is a
  claim that should never be silent.
- **Commit:** `3334c05b` (documented in its message).

### Interface reality vs. the plan's restatement

The plan restated 03-03's return shape as
`rows: Array<{ts:number; kind:string; /* + per-kind fields */}>`. What 03-03 actually shipped
is a **discriminated union** with a `type` tag (`'event'` carrying the whole hive row inside
`json`; `'cost'` carrying `agentId`/`taskId`/`usd`/`tokens`), typed `unknown[]` at preload.
Derived from the live `timeline.ts` and `preload/index.ts` as the plan instructed ("re-derive
the exact field names from the live files, do not assume"). The consequence is that an event
row's display fields are inside `json` and must be parsed, which is why `parseEntry()` exists.

## Deferred issues

None. No auto-fix hit the three-attempt limit, and no out-of-scope failure was found.

## Known stubs

None. Every branch this component can reach renders real content from real data; the only
`null` return is `DetailList` before its query has answered, which deliberately asserts
nothing rather than claiming an empty bucket.

## Copy adjacency worth a look by whoever owns UI-SPEC

Not a defect and **not worked around here** — the plan is explicit that a state needing a
sentence UI-SPEC does not bind must be reported, not invented.

- **A genuinely-zero TODAY renders both** `{date} was quiet. The floor recorded nothing that
  day.` **and** `The rest of today has not happened yet.` UI-SPEC's condition for the first is
  "day is inside the record and genuinely had no rows", which today satisfies exactly; the
  two are independent declarations and the plan states any combination may render together.
  It is nonetheless slightly odd to read a past-tense claim about a whole day at 10am.
  Suppressing it would have been me overriding a binding row, so it renders as specified.
- **The pre-fetch state has no UI-SPEC row.** Rather than invent one, the band renders
  `aria-busy` with the day as its accessible name and **no** empty-state sentence — it makes
  no claim at all. Worth a row of its own if UI-SPEC is ever revised.
- **A cost row whose `agentId` is null** renders `unattributed` as the `{name}` slot. A field
  value, not a sentence, and it beats a blank.

## Task 4 — the containment checkpoint: what is verified and what is NOT

**Auto mode was active, so this blocking `checkpoint:human-verify` was auto-approved. It was
NOT operator-verified, and this section must not be read as a sign-off.**

What is genuinely established, from source at both shas:

| Step | Status |
|---|---|
| 3 — no tab label clips (`scrollWidth === clientWidth`) | **Structurally guaranteed.** Every tab button is `whiteSpace: 'nowrap'` + `flex: '1 0 auto'` (flex-shrink **0**), so a button can never be squeezed below its label; overflow goes to the strip, never into the text. |
| 4 — fullscreen stays ONE row at 1280 | **Structurally guaranteed.** `flexWrap: fullscreen ? 'nowrap' : 'wrap'` with `overflowX: 'auto'` — the fullscreen rail cannot wrap by construction, it scrolls. UI-SPEC also records a live twelve-tab measurement ("~1320px of content, ~1610px available") taken when a longer-labelled `setup` tab was present, so returning to twelve with a **three-character** label is strictly cheaper than a state already measured to fit. |
| 2 — docked strip grows by at most one 31px row at 1280/1024/800 | **MEASUREMENT UNAVAILABLE.** Requires the live CDP probe. UI-SPEC `:356-360` states this itself and forbids estimating it. TABS went 11 → 12 (counted at both shas); a wrap container gaining one item grows by at most one row *provided the item fits a row alone*, which a 3-char label trivially does — but the rendered row count is not derivable from source. |
| 5 — day tab body does not overflow at its narrowest | **MEASUREMENT UNAVAILABLE.** The guards are present and asserted: the root is `minWidth: 0` + `overflow: auto`, the band is `width: '100%'` with `preserveAspectRatio="none"`, and every detail row is `minWidth: 0` with `overflow: hidden` + `textOverflow: ellipsis`. Whether it *composes* without clipping at a ~322px rail is a layout observation, and `renderToStaticMarkup` has no layout — the same ceiling this test file already states for `AgentCard`'s chip row. |

**Outstanding for the operator:** steps 2 and 5 only. UI-SPEC's stop-and-report clause stands
— if the 12th tab adds more than one row or clips a label, stop; do not shorten another
label and do not shrink the tab font.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: type-erasure | `src/preload/index.ts:826` | `hiveTimelineBucket` types `rows` as `unknown[]`, erasing `timeline.ts`'s `DetailRow` union at the renderer boundary. Data survives at runtime; the compiler cannot help any consumer. Narrowed defensively in `DayBandTab.rowParts()` (nothing dropped). Not fixed here — `preload/index.ts` is outside this plan's `files_modified`. |

The plan's own register is otherwise satisfied: **T-03-07a** — the 200-row cap is enforced in
main and this UI renders only what main returns plus the truncation line, computing nothing;
**T-03-07b** — the missing envelope body is stated in the UI, not only in a comment;
**T-03-07c** — `grep '<canvas\|new Application('` over `DayBandTab.tsx` is **0**, verified.

## Acceptance criteria, each measured

**Task 1** — `<canvas>`/`new Application(` **0** ✓ · `role="img"` **2** ✓ · `summary?:` **1** ✓ ·
five gap strings **5** ✓ · `Could not read the timeline: ` **1** ✓ · `Pick the day again to
retry.` **1** ✓ · invented `could not read the record` **0** ✓ · `aged out of the record` **1**
✓ · `no cost meter` **2** ✓ · `never reaches the cost ledger` **1** ✓ · `'transcript'` **3** ✓ ·
`firstTs: null` **2** ✓ · `firstTs: [0-9]` **1** ✓ · `ok: false` **7** ✓ · `eventsAgedOut`
**14** ✓ · `costTracking: 'transcript'` **1** ✓ · the mandated `round-3 #8` anchor check
**PASS** (2075-byte slice, all six strings) ✓

**Task 2** — `type="range"` **1** ✓ · `aria-valuetext` **1** ✓ · `type="date"` **2** ✓ · `min=`
appears **only** on the range input, never the date input ✓ · `Showing … of … rows in this
bucket` **1** ✓ · `Nothing in this fifteen minutes.` **1** ✓ · invented `This bucket could not
be read` **0** ✓ · zero-delta filters (`usd === 0` etc.) **0** ✓ · the mandated `round-3 #8
bucket detail` anchor check **PASS** (988-byte slice, both strings) ✓ ·
`window.cth.hiveTimeline(` **1** ✓ · `window.cth.hiveTimelineBucket(` **1** ✓

**Task 3** — `key: 'timeline', label: 'day'` **1** ✓ · `'timeline'` **3** ✓ (TABS, CCTab,
render branch) · `.cth-scrub` in `design/global.css` **4** ✓ · `src/renderer/src/global.css`
**does not exist** ✓ · `design/global.css` in `main.tsx` **1** ✓

**SCALE-03 was NOT ticked** in `.planning/REQUIREMENTS.md`, per D-07 and the plan's own
requirements-ledger note. This plan carries `requirements_addressed`, not `requirements`, and
no `requirements.mark-complete` was run. `STATE.md` and `ROADMAP.md` were not touched — the
orchestrator owns those writes.

## Commits

| Commit | What |
|---|---|
| `632ad716` | `test(03-07)` RED — 12 band cases against a `DayBandTab.tsx` that did not exist |
| `3334c05b` | `feat(03-07)` GREEN — the band, all four firstTs causes, the aged-out override, both cost tiers |
| `7ceded22` | `test(03-07)` RED — 8 cases for the scrubber, picker, detail list and both sentinels |
| `34bc4cb0` | `feat(03-07)` GREEN — scrubber, picker, IPC wiring, merged detail list |
| `eff42c3a` | `feat(03-07)` the 12th tab and the `.cth-scrub` block in the bundled stylesheet |
| `53a6ecc9` | `fix(03-07)` three criteria that passed in spirit and failed literally |

## Self-Check: PASSED

- All five files claimed above exist on disk (`DayBandTab.tsx`, `CommandCenterPanel.tsx`,
  `design/global.css`, `renderer-components.test.cjs`, this SUMMARY).
- All six commit hashes resolve in `git log`.
- `git diff --name-only 5f6dcfdb..HEAD` lists **exactly** this plan's four `files_modified`
  and nothing else — `STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md` are untouched, and no file
  in 03-04's concurrent main-process/storage territory was written.
- `.planning/REQUIREMENTS.md:175` still reads `- [ ] **SCALE-03**` and `:628` still reads
  `| SCALE-03 | Phase 3 | Pending |`, which is what 03-09 will assert.
- Every number in this file came from a command run in this session. The two figures that
  could not be produced are printed as **MEASUREMENT UNAVAILABLE** rather than estimated.
