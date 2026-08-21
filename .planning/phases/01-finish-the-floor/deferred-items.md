# Deferred Items — Phase 01 (finish-the-floor)

Out-of-scope discoveries found while executing a plan. Logged, not fixed.

| Found in | Item | Why deferred |
|----------|------|--------------|
| 01-05 task 1 | **`store.feeds` is written and never read.** `pushFeed` (`src/renderer/src/store/store.ts:638`) appends one line per tool line per agent, from `usePtyParser.ts:142`, `useHive.ts:618` and `mockEvents.ts:103`. `grep -rn "feeds" src/renderer/src --include=*.ts --include=*.tsx \| grep -v store/store.ts` returns **two hits, both unrelated prose** (`realtime/CostHud.tsx:5`, `realtime/costStore.ts:10`) — **zero components select the slice**. So the slice is a bounded (`FEED_MAX`) write-only buffer costing one array + one object allocation per tool line for a reader that does not exist. | Not a FLOOR-11 defect (no subscriber ⇒ no re-render ⇒ issue #20's roster clause is unaffected — this is the finding that resolves RESEARCH Open Question 5 as *leave alone*). Fixing it means either deleting the slice and its three writers or wiring a reader, and `src/renderer/src/store/store.ts` is **not** in 01-05's `files_modified` — it is already-correct, tested code this plan is forbidden to touch. Needs its own owner in a later wave. |

## From 01-08 (wave 4)

- **`delivery-queue.json` is not in the hive's `.gitignore` seed or `UNTRACK_PATHS`.**
  `src/main/hive.ts:304` (`UNTRACK_PATHS`) and `:738-740` (the `.gitignore` seed in `ensureHive`) do
  not name the new main-owned queue file, so the hive's auto-commit will version it — a fresh copy of
  its whole self in every hive commit, the same churn `cost-ledger.jsonl` was untracked for. Not a
  correctness defect. `src/main/hive.ts` is owned by other plans this wave and the next, and 01-08's
  plan forbids touching it. Owner: whichever plan next holds `src/main/hive.ts`.

- **`docs/message-queue.md` and `docs/adr/0001-one-gate-for-pty-writes.md` name a deleted code path.**
  Both still say the one automatic PTY writer is `useHive.ts` effect #4, which 01-08 deleted; the
  writer is now `DeliveryService.submit()` in `src/main/delivery.ts`, fed by the main-owned queue.
  `message-queue.md` §1's diagram, §2's condition table, §6's file table, and ADR-0001's `Decision`
  and `Where it lives` sections are all affected. This makes ROADMAP criterion 1's "grep finds no doc
  promising a code path that does not run" clause FALSE. Neither file is in 01-08's `files_modified`;
  01-07's twelve-denial sweep is the precedent for doc corrections landing in their own plan.
  Owner: a plan that holds those two files, before 01-23's wave-9 sweep.

## From 01-10 (wave 5)

- **Seven more `"Enterprise Knowledge Graph"` sites survive the FLOOR-07 (#31) rename.**
  01-10 renamed the two the plan scoped (`README.md` — already clean, and `src/preload/index.ts`,
  three instances) plus the two comments in `src/main/index.ts` (:552, :4201), because leaving the
  claim in a file this plan was renaming it out of would have recreated the defect one line over.
  Still carrying it, measured at 94d6653:
  `resources/skills/capabilities/SKILL.md:96` (**agent-facing** — the highest-value one left),
  `src/main/config.ts:159/:275/:493`, `src/main/hive.ts:1444`,
  `src/renderer/src/store/config.ts:74/:142`.
  `docs/floor-inspection.html:710` is deliberately excluded: it is the audit record QUOTING the
  defect, and correcting it would erase the finding. None of these files is in 01-10's
  `files_modified`, and `src/main/hive.ts` and `src/main/config.ts` have owners in other waves, so
  editing them here risks a lost update (`use_worktrees: false`). The repo-claims pin added by 01-10
  covers only `README.md` and `src/preload/index.ts` — widening it would turn it red today.
  Owner: a plan that holds those files, before 01-23's wave-9 sweep.

- **`cost-ledger.jsonl` still has no rotation, and `memory_fts` now has no retention either.**
  01-10 added an FTS5 index fed from every agent's `memory.md` on the mine loop. It is bounded
  per agent (a re-index REPLACES that agent's rows, and each chunk is capped at 4,000 chars), so it
  cannot grow without bound for a fixed roster — but nothing prunes the rows of an agent that has
  been deleted from the hive, so a long-lived install accumulates one dead agent's notes per
  teardown. Not a correctness defect and not reachable by recall unless the caller names the dead
  agent's id. RECORD-02 (Phase 4) owns ledger/index retention; this belongs with it.

## From 01-13 (wave 6)

- **The Settings UI still claims notifications work, with no platform qualifier.**
  `src/renderer/src/components/SettingsModal.tsx:1008` (inside the `activeSection === 'General'`
  block that opens at `:891`) reads *"Native toasts when an agent finishes or needs your input."* —
  a bare capability claim, which is exactly the defect 01-13's `must_haves` truth #5 names
  (*"Every FLOOR-14 sentence in docs or UI carries a platform qualifier"*). Under Electron 42+ macOS
  routes toasts through `UNNotification`, which only displays for a code-signed app, and this
  project's macOS signing is best-effort (`build/notarize.cjs` no-ops without `APPLE_*`), so on an
  unsigned local macOS build that sentence is false. 01-13 fixed the README half
  (`README.md:139-147`) and could not fix this half: `SettingsModal.tsx` is **not** in 01-13's
  `files_modified`, and both of 01-13's containment criteria fail on any file outside the declared
  set. Owners of the file are 01-10 (wave 5, landed) and 01-15 (wave 7), and 01-15 is a
  `fontSize`/accessible-name sweep whose own truth #3 forbids reflowing or changing copy — so
  nobody currently picks this up.
  **The fix is one sentence**, matching the wording already in `README.md`: append something like
  *"Windows and Linux only in an unsigned build — macOS requires code signing to display them."*
  to the existing description span. Do not add a `fontSize` while doing it: 01-15 pins a measured
  count of sub-14px `fontSize` occurrences in this file.
  Owner: a plan that holds `SettingsModal.tsx` **after** 01-15, or 01-23's wave-9 doc-claim sweep
  (which already owns `test/repo-claims.test.cjs`, the natural place to pin it so it cannot regress).

- **`src/main/config.ts:277`'s JSDoc for the `notifications` flag is now slightly stale.**
  It says the flag fires *"on agent lifecycle events (idle finish / waiting for input)"*. Since
  01-13 the same flag also gates the blocked-non-Claude toast that arrives over
  `hive:notifyBlocked`, which is neither an idle finish nor a Claude `Notification` hook. Cosmetic —
  the flag's behaviour is unchanged and `notify()` is still the single gate — but the comment now
  under-describes its reach. `src/main/config.ts` is not in 01-13's `files_modified` and is owned by
  other plans. Owner: whichever plan next holds `src/main/config.ts`.

- **The two Pixi canvas labels clear `FONT_SIZE = 14` but render at 7px on screen.** Found by 01-14
  while executing UI-SPEC's Rule 3. `ThoughtBubble.ts` and `ToolBubble.ts` both render their `Text`
  inside a container held at `RENDER_SCALE = 0.5` (`ThoughtBubble.ts:76`, `ToolBubble.ts:71`) — the
  classic render-at-2x-and-scale-down supersampling trick — and every on-screen dimension in those
  files is computed as `bgW * RENDER_SCALE` (`ThoughtBubble.ts:163-165`). So the DESIGNED on-screen
  text size is `FONT_SIZE * RENDER_SCALE`: **6px before 01-14, 7px after**. UI-SPEC's Rule 3 and
  01-14's own criterion both pin the literal `FONT_SIZE = 14`, and 01-14 landed exactly that — but
  the requirement behind it ("at or above 14 on screen") is NOT met at these two sites.
  **Why 01-14 did not just set 28.** A true 14px on-screen label needs `FONT_SIZE / RENDER_SCALE`
  = 28 in inner space, which at the current `WRAP_WIDTH` (288) drops the bubble from ~40 characters
  per line to ~17 and turns `MAX_CHARS = 160` into a ten-line cloud floating over an 18x28 sprite.
  Making that legible means re-geometrying `MAX_WIDTH`, `MAX_CHARS` and the overlap-resolution pass
  — a redesign of the office floor's bubbles, which UI-SPEC's containment rule calls step 3 ("stop
  and report") and which the phase contract's "no new visual language, no redesign" forbids.
  Owner: a plan that may change the floor's bubble geometry. **Plan 23 must NOT read FLOOR-12's
  clause-4 as unconditionally true on the strength of `grep -c "FONT_SIZE = 14"`.**

- **`ToolBubble`'s exported class has zero consumers and is tree-shaken out of the shipped bundle.**
  Verified at 01-14: `grep -rn "ToolBubble" src --include=*.ts --include=*.tsx` outside the file
  itself returns only `ThoughtBubble.ts:3`, which imports `toolIcon` alone. `class ToolBubble` does
  not appear in `out/renderer/assets/index-*.js` after `npm run build`. So `ToolBubble.ts`'s
  `FONT_SIZE` is dead at runtime and its FLOOR-12 sweep is correct-but-inert. Deleting the class is
  not one of the six requirements and is outside 01-14's authorised action, so it was swept as
  specified and recorded here instead. Owner: a later cleanup plan, or leave it — but do not cite it
  as evidence that a 14px label ships on the floor.

## [01-19] SkillsTab catalog identity row overflows at Rule 1's 14px — containment step 3

`src/renderer/src/components/SkillsTab.tsx:319-336`. MEASURED in real Electron 43 at 1280x900 /
1024x768 / 800x600 (CDP `Emulation.setDeviceMetricsOverride`, `window.innerWidth` read back on every
scan), row width 368px inside the shipped app's 420px sidebar:

| row | chip 1 | chip 2 | +gap | leftover for the name | row spill |
|---|---|---|---|---|---|
| `CATALOG SKILL 5` | `engineering` 170px | `abubakarsiddik31` 242px | 428px | **-60px** | **dx 61** |
| `CATALOG SKILL 11` | `research` 127px | `abubakarsiddik31` 242px | 385px | -17px | dx 8 / dx 18 |
| `CATALOG SKILL 2` | `writing` 113px | `abubakarsiddik31` 242px | 371px | -3px | dx 3 |
| `CATALOG SKILL 1` | `engineering` 170px | `anthropics` 156px | 342px | +26px | dx 51 (card) |

Both chips are `flexShrink: 0` and sized by UNBOUNDED catalog content, so at Press Start 2P 14px they
exceed the column on their own and the name's flex box collapses to 0. At the BASE sha (11px) the
worst chip pair was 320px against 368px, so this is new with FLOOR-12.

NOT fixed by plan 01-19, deliberately, per UI-SPEC's containment ladder:
- step 1 (it already truncates) does not apply to the chips;
- step 2 (raise the container integer) is unavailable — the integer is `sidebarWidth`, whose default
  lives in `src/renderer/src/store/store.ts`, outside 01-19's declared `files_modified`, and raising it
  would not close the class because the chips are content-sized;
- so step 3: stop and report.

The name spans themselves ARE fixed (commit `af8f202`): both carry
`whiteSpace:'nowrap' + overflow:'hidden' + textOverflow:'ellipsis'`, so a name no longer prints over a
chip at any width. Only the chip pair still overruns the card.

One-line evaluation for whoever takes it: give `SkillsTab.tsx`'s `Chip` (`:24-34`) the same truncation
contract the name now has (`flexShrink: 1, minWidth: 0` plus the triplet), or cap the rendered
category/owner text. Both are content decisions, not typography.

---

## 01-21 (FLOOR-16, lint gate) — four items, none in this plan's declared bound

### 1. ESLint 9.x is deprecated-tagged upstream; moving to 10 needs an `engines` widening first

`npm install eslint@9` prints *"npm warn deprecated eslint@9.39.5: This version is no longer
supported."* Every 9.x carries the identical message (checked 9.39.1 … 9.39.5), so it is the
`maintenance` dist-tag's support policy applied to the whole major, not a security advisory —
`npm audit --audit-level=high` is unaffected.

ESLint 9 was still the right pick **because of this repo's own `engines`**: `package.json` declares
`node: ">=20 <23"`, which admits Node 20.0–20.18 and 22.0–22.12. ESLint 10 requires
`^20.19.0 || ^22.13.0 || >=24`, so on those Node versions — versions this package says it supports —
`npm run lint` would not run at all. A gate a contributor cannot execute locally is the same defect
class FLOOR-16 exists to close. ESLint 9's `^18.18.0 || ^20.9.0 || >=21.1.0` is a superset of the
repo's range.

**The fix, when someone takes it:** widen `engines.node` to `^20.19.0 || ^22.13.0 || >=24` (`.nvmrc`
is already `22` and CI's `NODE_VERSION` is `22`, so both already satisfy it), confirm
`test/ci-config.test.cjs`'s `">=X <Y"` engines parser still holds or update it, then
`npm i -D eslint@10`. That is a package-wide compatibility change, not an executor call inside a lint
plan.

### 2. Six untracked scratch files appeared in the repo root during this plan, and are NOT ours

`c.ts`, `inv.ts`, `pre.ts`, `pred.ts`, `sig.ts`, `f5/wrapped.ts` (plus the pre-existing `psl.dat`).
Contents are wrapped/multi-line source shapes — a multi-line function signature, a wrapped `if`
condition, a wrapped `ipcRenderer.invoke`, a multi-line `import` — i.e. fixtures for testing whether
some assertion survives line wrapping. Timestamps land inside this plan's window but nothing this
plan ran writes them, and no file in `test/` references those names.

**Left completely alone**: not staged, not deleted. Deleting another agent's working files is the
exact class of destruction the executor rules forbid. Whoever owns them should clean them up or
`.gitignore` them; a stray `f5/` directory in the repo root will otherwise reach a future
containment filter.

### 3. `eslint .` does not cover TypeScript outside `src/`

The flat config's single entry is `files: ['src/**/*.{ts,tsx}']`, so `e2e/*.ts`,
`playwright.config.ts` and `electron.vite.config.ts` are parsed by nothing. That is deliberate and
harmless today — the two configured rules are React-hooks rules and there are no React hooks in
those files — but it is a real scope statement, not an oversight, and it is written down here so a
future "why didn't lint catch that" has an answer. Widening `files` costs nothing while the rule
surface stays at two rules.

### 4. Orphaned Electron probe processes hold `node_modules/electron/dist` open and break `npm ci`

Four `electron.exe` processes running `node_modules/electron/dist/electron.exe probe/main.js` —
leftovers from an earlier plan's CDP probe harness — were still alive on this host and held
`dist/dxil.dll` and `dist/resources/default_app.asar` locked. `npm ci --ignore-scripts` deleted
`node_modules/` and then failed `EPERM: unlink` half way through, leaving the tree unusable until
they were killed and the install re-run.

The probe harnesses that waves 5–7 wrote should `app.quit()` (and the driver should kill the child
on both the success and the failure path) so this cannot happen again. Cost here was one broken
`node_modules` and a re-install; on a machine without a portable Node 22 to re-install with it would
have been worse.
