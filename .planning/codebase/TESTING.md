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

**Structure:** Flat directory, 55 test files, ~466 individual `test(...)` cases, no subdirectories, no per-suite folders.

## The Key Piece: `test/load-ts.cjs`

Plain `node --test` runs `.cjs` files directly with no build step — but all source is TypeScript. `test/load-ts.cjs` is a hand-rolled loader that closes that gap:

- Uses the `typescript` package's `ts.transpileModule` API (not `ts-node`, not a bundler) to transpile a `.ts` file to CommonJS on the fly, then `new Function(...)`-executes it with a custom `require` shim.
- Resolves `.ts` extensions and `@shared/` imports itself (`resolveTs()`), and caches modules by absolute path so repeated `loadTs()` calls for the same file/its transitive imports don't re-transpile.
- Exposed as `module.exports = function loadTs(relativePath)`; every test does `const { X, Y } = loadTs('src/main/whatever.ts');`.

**Why `electron` needs special handling:** twelve `src/main` modules `import` from `'electron'` at module scope. Outside a real Electron process, plain Node's `require('electron')` resolves to a *path string* (the location of the Electron binary), not the API object — or throws entirely on a CI runner where the binary was never downloaded (`npm ci --ignore-scripts`, which every CI job uses). Either way, a module doing `import { app } from 'electron'` gets nonsense at module-load time, before any test even runs — "Electron failed to install correctly" is the exact throw, and a file that cannot load is a file whose tests silently do not exist (this caused 3 different test counts across the 3 CI platforms historically).

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

**Platform guards:** `t.skip('reason')` is used for tests that cannot run in the current environment (e.g. `test/main-hardening.test.cjs`'s symlink test skips on a machine that refuses to create symlinks). These are the suite's only 2 skips, both POSIX-only guards — not failures, not disabled tests.

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

**Actual current state** (verified by running `npm test` in this environment): **423 tests, 421 pass, 0 fail, 2 skipped** — matching `.github/workflows/ci.yml`'s CI matrix result. `CONTRIBUTING.md` still documents an older "11 tests fail on Windows, non-blocking" baseline; that note is now stale — `ci.yml`'s current comments state all three platforms (ubuntu/windows/macos) are **hard gates with no `continue-on-error`**, and that the 11-failure baseline was root-caused (7 real Windows source bugs fixed: `#58` `expandTilde` drive-letter bug, `#60` Codex remote endpoint backslash bug, `#57` unverified MSI checksum; 4 were genuine test bugs) rather than waived. Treat `ci.yml` as the source of truth over `CONTRIBUTING.md`'s stale paragraph if the two ever disagree again.

## Test Types

**Unit Tests:** The entire `test/*.test.cjs` suite — pure functions and classes loaded via `loadTs()`, run in milliseconds, no Electron, no browser, no network (loopback sockets only where the code under test genuinely binds a socket).

**Integration Tests:** Blurred into the same suite — e.g. `test/hive-durability.test.cjs` and `test/hive-protocol-v2.test.cjs` drive a real `HiveManager` against a real temp-dir filesystem and real `git` subprocess calls (`execFileSync('git', ...)`), not mocks, to prove end-to-end file/registry behavior.

**E2E Tests:** **Playwright**, over a real Electron app — `e2e/smoke.spec.ts`, driven by `playwright.config.ts`. This is a **separate workflow** (`.github/workflows/e2e.yml`), **not part of `npm test`**, and Linux-only in CI (`xvfb-run`) to keep it cheap; it launches the app's own Electron via `_electron`, so no browser is downloaded. It covers exactly one flow: onboarding → first agent spawn, using a stub CLI binary in place of a real agent so the spawn path is real but no network/API key is required. `workers: 1` and `retries: 0` deliberately — "a smoke test that only passes on the second attempt is telling you something."

**Gap — no renderer component tests:** There is **no unit-test framework for React** (no React Testing Library, no component-level tests at all). The 55 `test/*.test.cjs` files test main-process and shared logic exclusively (plus the two pure-function exceptions loaded with the `Module._load` stub trick, e.g. `sanitizePtyText` out of `useHive.ts`). `e2e/smoke.spec.ts`'s own header comment states this directly: *"7 of 123 renderer files are touched by tests, all of them pure helpers, and nothing exercises the app as an app"* — which is exactly the gap the Playwright smoke test was added to start closing, one flow at a time. If adding renderer logic, either keep it in a pure, `loadTs()`-testable function/hook (the established escape hatch) or accept it ships with only e2e-level coverage.

## Common Patterns

**Async Testing:** `async (t) => { ... await svc.tick(); ... }` — plain `async`/`await`, no special async test wrapper needed since `node:test` awaits the callback's returned promise natively.

**Error/negative-path Testing:** Assert the *safe* outcome of a failure, not just that a throw happens — e.g. `worktreeHasUnintegratedWork` against a non-repo directory asserts `keep: true` ("a git query we cannot run means 'there might be work'"), and `config.ts`'s corrupt-file test asserts the original bytes are preserved on disk under a `.corrupt-<timestamp>` name rather than merely asserting `readConfig()` didn't throw.

**Structural/regression pinning:** A few tests assert against the *source text itself*, not just runtime behavior, to pin a fix that could otherwise silently regress — `test/net-binding.test.cjs`'s final test greps four files for a length-comparison regex (`\.length\s*(?:!==|===...)`) to prove the timing-unsafe secret-compare pattern never comes back, because a timing-based test would be flaky. Reach for this only when the property truly can't be asserted behaviorally.

---

*Testing analysis: 2026-08-20*
