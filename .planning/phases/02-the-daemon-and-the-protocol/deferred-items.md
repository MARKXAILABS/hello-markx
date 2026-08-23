# Deferred Items — Phase 02

Out-of-scope discoveries logged during execution, per the executor's SCOPE BOUNDARY rule
(only auto-fix issues directly caused by the current task's own changes; log and defer
everything else).

## From plan 02-06, task 3

**`src/main/index.ts`: `app.whenReady()`'s boot chain throws `hive.setRoutedObserver is not
a function`, blocking window creation entirely.**

- **Discovered:** while building the live glyph-rendering probe for S2's `⚿`/`↻` marks
  (UI-SPEC's "Glyph rendering must be VERIFIED, not assumed" contract).
- **Repro:** `node_modules/electron/dist/electron.exe out/main/index.js
  --user-data-dir=<tmp>` (env cleared of `ELECTRON_RUN_AS_NODE`, which independently makes
  Electron run as plain Node if left set — see below) throws, at `out/main/index.js:19388`
  (`hive.setRoutedObserver((msg, targets) => closingTime.onRouted(msg, targets));`):
  `TypeError: Cannot read properties of undefined (reading 'setRoutedObserver')`. The
  process survives (an `uncaughtException` handler keeps it alive) but no `BrowserWindow`
  is ever created, so `electronApplication.firstWindow()` times out.
- **Confirmed pre-existing, not caused by this plan:** the project's OWN unmodified
  `e2e/smoke.spec.ts` (no changes from this plan or any uncommitted work) times out
  identically in this same session/environment — `TimeoutError:
  electronApplication.firstWindow: Timeout 30000ms exceeded`. This plan's `files_modified`
  never touches `src/main/index.ts` or `src/main/hive.ts`, and the main-process bundle
  contains none of this plan's renderer-only edits.
- **A second, independent environmental gotcha found along the way, already fixed locally
  by clearing it before every `electron.launch`/manual invocation in this session (not a
  repo change — this machine's own shell exports it):** `ELECTRON_RUN_AS_NODE=1` is set in
  this interactive session's environment. Left in place, `electron.exe` runs as plain
  Node (`electron.app` is `undefined`) instead of booting Electron at all — a DIFFERENT
  failure mode than the `hive.setRoutedObserver` one above, and one that
  `e2e/smoke.spec.ts`'s own `sandboxEnv()` already guards against by deleting it. Any
  future local Electron/Playwright work in this environment must do the same.
- **Not fixed here:** `src/main/index.ts` has no owner in this wave's plan set (touching it
  would violate this plan's declared `files_modified` and the disjoint-ownership rule), and
  it is unrelated to PARITY-01b/DAEMON-04's card/modal work. Whichever plan next touches
  `src/main/index.ts`'s `app.whenReady()` chain should check `hive`'s construction order
  against `closingTime`'s wiring.
- **Impact on this plan's own live-verification requirements:** task 3's glyph probe and
  task 5's containment probe were both re-routed around this bug — see the corresponding
  SUMMARY sections for the standalone-harness method used instead (real Electron, real
  built `tokens.css`, real Google Fonts CDN, but a trivial throwaway main process instead
  of booting `src/main/index.ts`'s hive/PTY machinery, which this specific verification has
  no use for).
