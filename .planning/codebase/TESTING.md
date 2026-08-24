# Testing Patterns

**Analysis Date:** 2026-08-20

## Test Framework

**Runner:**
- **No framework.** Not Jest, not Vitest, not Mocha — plain **`node --test`** (Node's built-in test runner) over `test/*.test.cjs`.
- Config: none (no `jest.config.*`/`vitest.config.*` exists). Behavior comes entirely from `package.json` scripts.

**Assertion Library:**
- Node's built-in `node:assert/strict` (`assert.equal`, `assert.deepEqual`, `assert.ok`, `assert.match`, `assert.doesNotMatch`, `assert.rejects`). No Chai, no custom matchers.

**Run Commands:**
```bash
npm test              # node --test test/*.test.cjs — full suite, the PR gate
npm run test:focused  # node --test <hand-listed 33 files> — fast subset for tight edit loops, NEVER a PR gate
```
`test:focused` is a hand-picked file list maintained in `package.json`'s `scripts` block. `CONTRIBUTING.md` explicitly warns against gating a PR on it: "a hand-written file list is how eight test files went unrun for months" (issue #7). Always run full `npm test` before considering work done.

**Critical shell gotcha:** `npm test` invokes `node --test test/*.test.cjs` — the glob is expanded by the shell/Node's own glob handling, not a directory argument. `node --test test/` does **not** work; it resolves `test/` as a literal path argument rather than discovering the `.test.cjs` files inside it. Always match the exact `test/*.test.cjs` invocation (or a subset of literal file paths) when running tests manually.

## Test File Organization

**Location:** All test files live flat in `test/`, not co-located with source. Source lives in `src/main/`, `src/renderer/`, `src/shared/`; tests reach into them via `test/load-ts.cjs`.

**Naming:** `<subsystem-or-concern>.test.cjs`, kebab-case. Not a strict 1:1 mapping to source filenames — grouped by concern/issue instead. Example: `src/main/hive.ts` alone is covered by at least `hive-durability.test.cjs`, `hive-protocol-v2.test.cjs`, `hive-cwd.test.cjs`, `hive-task-mutation.test.cjs`, `hive-hook-node.test.cjs`, `hive-roster-injection.test.cjs`, `hive-runtime-path.test.cjs`, `hive-windows-prompt.test.cjs`.

**Structure:** Flat directory, **73 test files, 863 individual `test(...)` cases**, no subdirectories, no per-suite folders. Re-derived at wave 9 of Phase 2 (`ls test/*.test.cjs | wc -l`; `grep -rhc "^test(" test/*.test.cjs` summed) — it read "60 files, 592 cases" at the end of Phase 1, which was true before Phase 2 added thirteen files across its ten waves.

## The Key Piece: `test/load-ts.cjs`

Plain `node --test` runs `.cjs` files directly with no build step — but all source is TypeScript. `test/load-ts.cjs` is a hand-rolled loader that closes that gap:

- Uses the `typescript` package's `ts.transpileModule` API (not `ts-node`, not a bundler) to transpile a `.ts` file to CommonJS on the fly, then `new Function(...)`-executes it with a custom `require` shim.
- Resolves `.ts` extensions and `@shared/` imports itself (`resolveTs()`), and caches modules by absolute path so repeated `loadTs()` calls for the same file/its transitive imports don't re-transpile.
- Exposed as `module.exports = function loadTs(relativePath)`; every test does `const { X, Y } = loadTs('src/main/whatever.ts');`.

**Why `electron` needs special handling:** twelve `src/main` modules `import` from `'electron'` at module scope. Outside a real Electron process, plain Node's `require('electron')` resolves to a *path string* (the location of the Electron binary), not the API object — or throws entirely on a CI runner where the binary was never downloaded (`npm ci --ignore-scripts`, which every CI job uses). Either way, a module doing `import { app } from 'electron'` gets nonsense at module-load time, before any test even runs — "Electron failed to install correctly" is the exact throw, and a file that cannot load is a file whose tests silently do not exist (this caused 3 different test counts across the 3 CI platforms historically).

**The `require.cache` injection is load-bearing, not a curiosity (D-02, Phase 2).** The stub above lets a module *load* — for `src/main/index.ts` specifically, loading was never the actual blocker (the stub has resolved the `electron` import since #55). The real blocker was **module-scope side effects**: an `app.on(...)` call and a real `initFileLogging()` write stream, both executed at import time, which cross-contaminated parallel test files through a shared stub path. `test/boot-floor.test.cjs` is where this stopped being a limitation and became the route by which the whole composition root is testable: Phase 2 extracted `bootFloor(deps)` (`src/main/floor/boot.ts`) as an **injected** composition root with zero module-scope side effects, and `boot-floor.test.cjs` drives it end to end — real subsystem construction, real shutdown, no Electron binary — through exactly this file's `require.cache` injection pattern. `test/main-hardening.test.cjs`'s own header states the same corrected mechanism in the same words, and so does `.planning/ROADMAP.md`'s Phase 2 section (task 2 and task 6 of plan 02-12, this correction's origin).

`load-ts.cjs`'s `requireElectron()` resolves in this order:
1. **The real `electron` module first** — specifically so that a test which has injected a fake API into `require.cache['electron']` *before* calling `loadTs()` wins. `test/config-secrets.test.cjs` does exactly this (see below).
2. If that yields nothing usable (not an object), falls back to a **headless stub** — a `Proxy` whose only member with real behavior is `app.getPath()`; everything else is a no-op function, so a module that calls e.g. `ipcMain.handle(...)` at module scope doesn't throw while loading. The stub's job is to let modules *load*, never to make them *behave* — anything a test needs to assert on must be injected, not reached through the stub.

**The injection pattern**, when a test needs real Electron-API behavior (`test/config-secrets.test.cjs`, `test/net-binding.test.cjs`):
```js
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: {
    app: { getPath: () => userData },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(`enc:${s}`, 'utf8'),
      decryptString: (b) => b.toString('utf8').replace(/^enc:/, '')
    }
  }
};
```
Seed `require.cache` **before** calling `loadTs(...)` on the module under test. `test/config-secrets.test.cjs` also fakes `better-sqlite3` the same way (a minimal in-memory `FakeDatabase` class), because the real native module is built for Electron's ABI and cannot load under plain Node.

For a hook/React file that pulls in `react` or the renderer's `@/` alias (neither resolvable under `node:test`), stub `Module._load` around the `loadTs` call instead (`test/pty-sanitize.test.cjs`):
```js
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request.startsWith('@/') || request === 'react') {
    return new Proxy(function () {}, { get: () => function () {} });
  }
  return origLoad.call(this, request, ...rest);
};
const { sanitizePtyText } = require('./load-ts.cjs')('src/renderer/src/hooks/useHive.ts');
Module._load = origLoad;
```

## Test Structure

**Suite Organization:** No `describe`/`beforeEach` nesting — flat `test('full sentence describing behavior', (t) => { ... })` calls, grouped visually with `// ─── section title ───` banner comments, often citing the issue number the section addresses.

```js
test('worktreeHasUnintegratedWork keeps a dirty worktree and releases a clean one', async (t) => {
  const root = tempDir(t, 'mh-repo-');
  ...
  assert.equal(clean.keep, false, 'a clean, un-advanced worktree is removable');
});
```

**Test names are full sentences describing behavior**, not `it('should...')` fragments, and frequently cite the issue/finding number that motivated the test: `#10: redactedConfig leaks no secret value and no secret length`, `a stale-rev write is refused and does not clobber the card it never saw`. Every `assert.equal`/`assert.ok` carries a message string explaining *what a failure would mean*, not just restating the assertion — treat the message as documentation for the next person who breaks it.

**Setup/teardown:** Node's `test(name, (t) => {...})` receives a `TestContext` (`t`); `t.after(() => {...})` registers cleanup (temp dir removal, restoring monkey-patched globals) instead of a separate `afterEach`. A shared `tempDir(t, prefix)` helper pattern recurs across files:
```js
function tempDir(t, prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* noop */ } });
  return dir;
}
```
Note the `realpathSync` wrap — done specifically so macOS's `/var` → `/private/var` symlink doesn't make every path-containment assertion an accidental symlink test.

**Platform guards:** `t.skip('reason')` is used for tests that cannot run in the current environment (e.g. `test/main-hardening.test.cjs`'s symlink test skips on a machine that refuses to create symlinks). There are **4** such skips, all `{ skip: !POSIX }` guards, and they appear on **win32 only** — the counters read `# skipped 4` on Windows and `# skipped 0` on ubuntu and macOS. By name: two in `test/hive-hook-node.test.cjs` (*a hook fires with NO node on PATH*; *`node` resolves and RUNS with no node on PATH*) and two in `test/hook-auth-roundtrip.test.cjs` (*the real shim authenticates to the real hook server*; *a shim with no token is still rejected*). A fifth appears on any host lacking symlink privilege (`test/main-hardening.test.cjs`). Not failures, not disabled tests — but treat the number as a **ceiling, not a floor**: `node --test` counts skips in its total and exits `0` when every test in a file is skipped, so a `>=` clause on this number lets a whole wave's work go green while skipped.

## Mocking

**No mocking framework** (no `sinon`, no `jest.fn()`, no `vi.mock`). Three techniques cover everything:

1. **Dependency-injection objects** for anything stateful — classes under test (`DeliveryService`, `AccountPoolManager`, `HookServer`) take a config object of plain functions (`write`, `emit`, `log`, `now`, `sleep`, `respawn`, ...) in their constructor, and tests pass a `harness()` of fakes:
   ```js
   function harness(overrides = {}) {
     const state = { clock: 1_000_000, agents: [...], ... };
     const writes = [];
     const svc = new DeliveryService({
       liveAgents: () => state.agents,
       write: (ptyId, data) => { writes.push({ ptyId, data }); return { ok: true }; },
       now: () => state.clock,
       sleep: async (ms) => { state.clock += ms; },   // fake clock — no real wall-clock waits
       ...overrides
     });
     return { svc, state, writes };
   }
   ```
   This is why `test/delivery-main.test.cjs` can exercise retries, timers, and a multi-step failover sequence with zero real elapsed time.

2. **Monkey-patching Node built-ins directly**, restored in a `try/finally` or `t.after`:
   ```js
   const real = fs.writeFileSync;
   fs.writeFileSync = (p, data, enc) => { /* simulate a torn write */ };
   try { hive.recordSession(...); } finally { fs.writeFileSync = real; }
   ```
   Used to simulate crash-mid-write scenarios (`test/hive-durability.test.cjs`, `test/config-secrets.test.cjs`'s `traceFs()` helper, which records every `writeFileSync`/`renameSync` call to prove atomic-write-then-rename behavior).

3. **`require.cache` injection** for un-loadable native/Electron modules — see `load-ts.cjs` section above.

**What to mock:** Electron APIs (unavailable outside Electron), native modules with the wrong ABI (`better-sqlite3` under plain Node), wall-clock time/timers (for speed and determinism), and the PTY/filesystem write path when testing crash-safety.

**What NOT to mock:** The actual logic under test, ever. The house rule, stated explicitly in `test/win-cmd-shim.test.cjs`'s header comment: *"Testing against a copy would prove nothing"* — that file `require()`s node-pty's own `argsToCommandLine` escaper directly (`require('node-pty/lib/windowsPtyAgent.js')`) rather than reimplementing or mocking it, specifically so the test fails if the real escaper's behavior changes. `test/net-binding.test.cjs`'s hook-socket auth test drives a **real** `net.createConnection` over a real Unix socket/named pipe rather than calling the handler function directly, because the auth gate deliberately lives at the socket layer. Prefer driving the real code path (real git repo via `execFileSync('git', ...)`, real sockets, real temp directories) over mocking anything that is cheap to run for real.

## Fixtures and Factories

No fixture files or JSON snapshots — tests build state programmatically with small local factory functions, redefined per test file as needed:
```js
const agent = (id, extra = {}) => ({ id, name: id, cwd: os.tmpdir(), capabilities: [], ...extra });
const card = (id, extra = {}) => Object.assign({ id, title: id, status: 'todo', ... }, extra);
```
**Location:** Inline at the top of each test file, not shared across files — there is no `test/fixtures/` or `test/helpers/` directory. Each file is self-contained.

## Coverage

**Requirements:** No coverage tool configured (no `c8`, no `nyc`, no `--experimental-test-coverage` flag in the `test` script). No numeric coverage gate exists anywhere in CI.

**View Coverage:** Not applicable — not measured. Coverage confidence instead comes from the CI matrix passing on all 3 platforms plus the explicit "no mocking the thing under test" discipline above.

**Actual current state** (verified by running `node --test --test-reporter=tap test/*.test.cjs` at wave 9 of Phase 2, plan 02-12, on win32): **803 tests, 796 pass, 0 fail, 7 skipped, 0 todo**. It read "535 / 531 / 0 / 4" at wave 9 of Phase 1, and "423 / 421 / 0 / 2" before that. Phase 2 (commit `90a6cc9` through this plan) added 268 tests across its ten waves with zero regressions the whole way — every orchestrator checkpoint held at 0 failures. The 7 skipped this session is higher than Phase 1's 4 — all 4 of Phase 1's declarative `{ skip: !POSIX }` guards are unchanged, and the delta is `test/net-binding.test.cjs`'s runtime-conditional Windows-capability skips (8.3 short names / `subst` / admin shares / symlink privilege), which vary by what this specific host permits, not by anything this phase regressed. `CONTRIBUTING.md` still documents an older "11 tests fail on Windows, non-blocking" baseline; that note is now stale — `ci.yml`'s current comments state all three platforms (ubuntu/windows/macos) are **hard gates with no `continue-on-error`**, and that the 11-failure baseline was root-caused (7 real Windows source bugs fixed: `#58` `expandTilde` drive-letter bug, `#60` Codex remote endpoint backslash bug, `#57` unverified MSI checksum; 4 were genuine test bugs) rather than waived. Treat `ci.yml` as the source of truth over `CONTRIBUTING.md`'s stale paragraph if the two ever disagree again.

## Test Types

**Unit Tests:** The entire `test/*.test.cjs` suite — pure functions and classes loaded via `loadTs()`, run in milliseconds, no Electron, no browser, no network (loopback sockets only where the code under test genuinely binds a socket).

**Integration Tests:** Blurred into the same suite — e.g. `test/hive-durability.test.cjs` and `test/hive-protocol-v2.test.cjs` drive a real `HiveManager` against a real temp-dir filesystem and real `git` subprocess calls (`execFileSync('git', ...)`), not mocks, to prove end-to-end file/registry behavior.

**E2E Tests:** **Playwright**, over a real Electron app — `e2e/smoke.spec.ts`, driven by `playwright.config.ts`. This is a **separate workflow** (`.github/workflows/e2e.yml`), **not part of `npm test`**, and Linux-only in CI (`xvfb-run`) to keep it cheap; it launches the app's own Electron via `_electron`, so no browser is downloaded. It covers exactly one flow: onboarding → first agent spawn, using a stub CLI binary in place of a real agent so the spawn path is real but no network/API key is required. `workers: 1` and `retries: 0` deliberately — "a smoke test that only passes on the second attempt is telling you something."

**Gap — thin renderer component coverage, narrower than before Phase 2.** There is still **no unit-test framework for React** (no React Testing Library, no component-level render tests). The 73 `test/*.test.cjs` files test main-process and shared logic almost exclusively, plus a growing set of pure-function/logic exceptions reached through renderer-side `loadTs()` calls and the `Module._load` stub trick. Re-measured this session (`grep -rn "loadTs\|require.*renderer" test/*.test.cjs`, deduped by target path): **17 of 134** renderer files are now touched by some test, up from the "7 of 123" `e2e/smoke.spec.ts` recorded before Phase 2 — Phase 2 plans 02-06 (`AgentCard.tsx`, `store/config.ts`'s `capabilityGaps`/`mcpCardSummary`) and 02-10 (`QrCode.tsx`) both added renderer test surface. Still thin relative to the tree, and still nothing exercises a full component render — the e2e smoke test remains the only surface that runs the app as an app. If adding renderer logic, either keep it in a pure, `loadTs()`-testable function/hook (the established escape hatch) or accept it ships with only e2e-level coverage.

## Phase 2 additions (wave 9 note)

**The nine Wave-0 files, named by the behaviour each proves** (`02-VALIDATION.md`'s Wave 0 list, all landed):
- `test/boot-floor.test.cjs` — `bootFloor(fakeDeps)` boots a real floor with no Electron binary; `floor.shutdown()` leaves zero live handles; a headless floor with live PTYs quits rather than deadlocking.
- `test/agent-lifecycle.test.cjs` — `teardownPty` preserves a worktree with unintegrated work and removes a clean one.
- `test/hive-router.test.cjs` — `routeOnce` drains an outbox into an inbox and archives the source; mail to a hookless/proxy-tier agent is enqueued in main, never bounced, with no renderer involved.
- `test/tunnel.test.cjs` — `stop()` calls `hardKillTree` with the child's pid, against an injected fake spawner; the tunnel is off by default.
- `test/mcp-per-agent.test.cjs` — `<agentDir>/mcp.json` is written and `--mcp-config` lands on the spawn argv; a `write`/`secret` server with no explicit per-agent consent is NOT written (fail closed); revoke calls `deleteSecret`.
- `test/capability-surface.test.cjs` — `providerCapabilities` has a real renderer production consumer; the three D-31 UI surfaces each consume `capabilityGaps`; `capabilityLine`'s joined prompt-line string is never rendered in the UI.
- `test/qr-vendor.test.cjs` — the vendored Nayuki QR encoder matches its pinned digest and stays free of any network/DOM call (the purity gate).
- `test/push-vapid.test.cjs` — VAPID key generation and RFC 8291 `aes128gcm` encryption, built from `node:crypto` alone, round-trip correctly.
- `test/build-assets.test.cjs` — the phone PWA bundle's assets are committed and resolvable in both dev and packaged builds.

**The announced-skip convention is a named house rule, not an ad hoc pattern.** Phase 2 added live-network and platform-gated branches (the tunnel close, Windows path-aliasing cases already covered above), and the rule those follow is: **never `return` silently on an unrunnable case.** Either the test framework's own `t.skip('reason')`, or — for a case outside `node:test` entirely — an announced, non-zero-but-distinguishable exit printing `console.error('[…] case skipped — <reason>')` before returning. `test/net-binding.test.cjs` is the exemplar both for the runtime pattern and for the phrasing quoted verbatim by every follower. A silent skip is a test that does not exist; this repo has been burned by that once already (the historical 3-different-test-counts-per-platform incident this same file documents above).

**Tests deliberately outside `npm test`:** no test in this repo makes a real outbound network call — that is what keeps `npm test` an offline, ~19s, three-platform gate. `scripts/tunnel-live-check.cjs` is the one live probe Phase 2 added: it stands up a loopback server, acquires the real digest-verified `cloudflared` binary, opens a real tunnel through Cloudflare's edge, and polls for the close DAEMON-05 claims — proving the ~30s close bound `SECURITY.md` documents. It follows the SAME announced-skip register as `net-binding.test.cjs` (exit `3` = announced skip, never exit `0`), lives in `scripts/` rather than `test/`, and is never invoked by `npm test` or any CI job — by design, since a genuine network dependency in the offline gate would make the gate flaky on the vendor's schedule rather than this repo's.

## Common Patterns

**Async Testing:** `async (t) => { ... await svc.tick(); ... }` — plain `async`/`await`, no special async test wrapper needed since `node:test` awaits the callback's returned promise natively.

**Error/negative-path Testing:** Assert the *safe* outcome of a failure, not just that a throw happens — e.g. `worktreeHasUnintegratedWork` against a non-repo directory asserts `keep: true` ("a git query we cannot run means 'there might be work'"), and `config.ts`'s corrupt-file test asserts the original bytes are preserved on disk under a `.corrupt-<timestamp>` name rather than merely asserting `readConfig()` didn't throw.

**Structural/regression pinning:** A few tests assert against the *source text itself*, not just runtime behavior, to pin a fix that could otherwise silently regress — `test/net-binding.test.cjs`'s final test greps four files for a length-comparison regex (`\.length\s*(?:!==|===...)`) to prove the timing-unsafe secret-compare pattern never comes back, because a timing-based test would be flaky. Reach for this only when the property truly can't be asserted behaviorally. **`test/repo-claims.test.cjs` is this pattern's much larger consumer** — a single accumulator file, one clause per claim, whose own header states the standard any new clause must meet (D-40): **both directions** (a deletion and an unwanted addition each fail their own assertion), a **positive lower bound** (never a bare negative a deletion would trivially satisfy), and **joined text** (a claim wrapped mid-sentence by a formatter must not defeat a line-oriented grep). The file's default read path is comment-stripped (`readStripped`) — deliberately, because several fixes add a comment quoting the very claim they corrected, and a raw grep would match the explanation and fail the correct fix. The ONE exception is PARITY-03's `LIVE-UNVERIFIED` marker clause, which reads raw source on purpose: the marker itself lives inside a comment, so the house helper would erase the very thing being counted, and a clause routed through it would pass vacuously against any tree.

---

*Testing analysis: 2026-08-20, updated 2026-08-24 (Phase 2 wave 9, plan 02-12)*
