# Phase 1: Finish the Floor — Pattern Map

**Mapped:** 2026-08-20
**Files analyzed:** 6 new · 41 modified (load-bearing subset classified below)
**Analogs found:** 6/6 new · 41/41 modified (every modified file is its own analog — this is a
hardening phase on a mature codebase, so "the analog" is usually the surrounding idiom in the same
file)

> **Anti-fabrication note.** Every excerpt below is verbatim text from a file read in this session,
> with its `file:line`. Where research or CONTEXT.md carried an anchor that did not survive
> re-reading, the corrected anchor is marked **CORRECTED**. Where no analog exists the entry says
> `NO ANALOG` and names the closest thing instead of inventing one.

---

## Corrections to upstream documents, found while reading analogs

| Claim | Source | Verified fact |
|---|---|---|
| `test/breaker.test.cjs` "may not exist" (RESEARCH A9) | 01-RESEARCH.md:1119 | **It exists — 224 lines — but it is NOT a `node:test` file.** See § "The breaker test is a different animal" below. This is sharper than "verify it exists" and changes how FLOOR-10's test must be written. |
| `appendCostLedger` at `hive.ts:2520` | 01-RESEARCH.md:324 | **CORRECTED — `src/main/hive.ts:2513`.** |
| `test/hive-protocol-v2.test.cjs:276-284` asserts the summing behaviour | D-23 / RESEARCH | Confirmed in substance. The enclosing test starts at **`:258`** (`test('cost rows carry the card they were spent on, and a card knows its cap', …)`), under the banner `// ─── #34 — per-card cost attribution ───` at `:256`. Rewriting "`:276-284`" in isolation will not compile — the whole test body is one arrange/act/assert block. |
| `test/config-secrets.test.cjs`'s `FakeDatabase` "has no SQL at all" | 01-RESEARCH.md:795 | True for DDL, but note it **does** model the migration rail: `pragma('user_version')` and `pragma('user_version = N')` are implemented (`test/config-secrets.test.cjs:59-62`). So a `PersistStore.open()` against the fake **runs the migration loop and bumps the version while executing no DDL** — an FTS5 test written against it would pass with an empty database. That is exactly Pitfall 5's failure mode, now with the line that causes it. |

---

## File Classification

### New files (6)

| New file | Role | Data flow | Closest analog | Match |
|---|---|---|---|---|
| `test/repo-claims.test.cjs` | test (repo-fact) | file-I/O + transform | `test/ci-config.test.cjs` (whole file) + `test/net-binding.test.cjs:217-232` (the source-grep test) | **exact** |
| `test/renderer-components.test.cjs` | test (static render) | transform (in → markup) | `test/pty-sanitize.test.cjs:1-19` (`Module._load` stub) + `test/load-ts.cjs:63-71` (`resolveTs`) | **role-match** — nothing in the repo renders React today |
| `test/db-fts.test.cjs` | test (integration) | CRUD over real SQLite | `test/config-secrets.test.cjs:31-73` (`require.cache` injection) — **inverted**; plus `test/hive-protocol-v2.test.cjs:31-37` (`floor(t)` real-tempdir harness) | **role-match** |
| `test/hooks-notify.test.cjs` | test (unit, DI fake) | event-driven | `test/delivery-main.test.cjs:21-53` (`harness()` of plain-function fakes) + `test/net-binding.test.cjs:107-136` (`hookFloor(t)`, a real `HookServer`) | **exact** |
| `eslint.config.js` | config | — | **NO ANALOG.** The repo has never had a linter (`CONVENTIONS.md:30-31`). Closest structural analog is `playwright.config.ts` (a root-level ESM default-export config). RESEARCH.md:882-902 supplies the literal file; use it. |
| `docs/adr/0005-*.md` … (FLOOR-17) | doc | — | `docs/adr/0002-prompt-cache-invariant.md`; numbering rule in `docs/adr/README.md` (never renumber; a reversal is a new record — `CONVENTIONS.md:85`) | **exact** |

### Modified files — load-bearing subset

| Modified file | Role | Data flow | Pattern to match | Token (contention) |
|---|---|---|---|---|
| `test/load-ts.cjs` | test infra | transform | its own `requireElectron()` at `:28-42` and `resolveTs()` at `:63-71` | T-LOADTS |
| `src/main/index.ts` (5,620 ln) | entry/IPC | request-response | `ipcMain.handle('domain:action', …)` — `:3894`, `:3983`, `:4461` | **T-INDEX** |
| `src/main/hive.ts` (3,562 ln) | service | CRUD + file-I/O | `.cjs` shim template consts `:3078+`; `taskSpend` `:2566`; `appendCostLedger` `:2513` | **T-HIVE** |
| `src/main/hooks.ts` | server | event-driven (socket) | `authorized()` `:194-210`; `notify()` `:420-431`; DI constructor `:100-131` | **T-HOOKS** |
| `src/main/breaker.ts` | service (pure policy) | transform | `evaluate()` arm chain `:299-362` | uncontended |
| `src/main/delivery.ts` | service | event-driven (tick) | `DeliveryDeps` `:54-79`, `constructor(private readonly deps)` `:153` | uncontended |
| `src/main/db.ts` | store | CRUD | `MIGRATIONS` array `:50-69` + `migrate()` `:110-121` | uncontended |
| `src/main/telemetry.ts` | service | event-driven | `recordCostSample()` `:251` (zero production callers) | uncontended |
| `src/shared/providerAutomation.ts` | shared pure | transform | `providerCapabilities` `:258-265`, `capabilityLine` `:280-289` | rides T-PARITY |
| `src/preload/index.ts` (1,502 ln) | bridge | request-response | one-line `ipcRenderer.invoke` wrappers `:776-781`, `:822-824` | **T-PRELOAD** |
| `src/renderer/src/components/AgentCard.tsx` | component | render | `BOSS` chip `:227-231`; cost span `:256-265` | **T-TSX** |
| `src/renderer/src/components/{FullscreenTerminal,CommandCenterPanel,SettingsModal,MemoryPanel}.tsx` | component | render | same | **T-TSX** |
| `src/renderer/src/design/tokens.css` | config (CSS vars) | — | `:61-68` sizes / `:70-77` line heights | uncontended |
| `src/renderer/src/hooks/useHiveTasks.ts` | hook (singleton poller) | pub-sub | its own header `:1-15` + `listeners: Set` `:23` | uncontended |
| `.github/workflows/ci.yml` | CI config | — | `typecheck` job `:16-35` | **T-CI** |
| `e2e/smoke.spec.ts` | test (e2e) | request-response | RESEARCH.md:844-855 gives the literal assertion | uncontended |
| `HIVE.md`, `README.md`, `DESIGN.md`, `CONTRIBUTING.md` | docs | — | — | T-README (README only) |

---

## Pattern Assignments — the six new files

### `test/repo-claims.test.cjs` (test, repo-fact / file-I/O)

**Analog A: `test/ci-config.test.cjs`** — the whole file. **Analog B: `test/net-binding.test.cjs:217-232`**
— the source-grep test, which is the closer analog for the *negative-grep* clauses (FLOOR-01's
`autoMode`, FLOOR-02's HIVE.md denials, FLOOR-12's sub-14px sweep).

**File-header pattern** (`test/ci-config.test.cjs:1-14`) — states the incident the file prevents,
which is the house convention (`CONVENTIONS.md:78`):

```js
'use strict';

/**
 * The regression guard for #7: eight test files sat in test/ for months without
 * ever running, because `test:focused` hand-lists the files it runs and nobody
 * remembers to append to a 33-entry string. `npm test` now uses a glob, and this
 * file is what stops the hand-list from creeping back — if a new *.test.cjs is
 * not covered by the `test` script's pattern, this test fails, in CI, on the PR
 * that added it.
 *
 * It also pins the Node story (`engines` + `.nvmrc`), because "works on my Node"
 * is the other way this repo's build has broken: Node 24 has no better-sqlite3
 * prebuild and breaks node-pty's winpty gyp build.
 */
```

**Imports + root resolution** (`test/ci-config.test.cjs:16-22`):

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
```

**The source-grep pattern — copy this precisely** (`test/net-binding.test.cjs:217-232`). Note the
three load-bearing parts: (1) the comment explaining *why* a behavioural test would not do; (2)
`stripComments` before matching, because the file being pinned **quotes the thing it removed**;
(3) a per-file loop with a message naming the file:

```js
test('no length-mismatch early return survives in any of the four files', () => {
  // The behavioural assertions above pass for a length-bailing implementation
  // too — the leak is in the TIMING, and timing tests are flaky. So pin the one
  // structural thing that made it leak: comparing two `.length`s to each other.
  const guard = /\.length\s*(?:!==|===|!=|==)\s*\w+\.length/;
  // Comments stripped first: each of these files now QUOTES the guard it removed,
  // and the point of the comment is that the code no longer does it.
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const file of ['webhook.ts', 'slack.ts', 'hooks.ts', 'integrationBroker.ts']) {
    const src = stripComments(fs.readFileSync(path.resolve(__dirname, '..', 'src/main', file), 'utf8'));
    assert.equal(guard.test(src), false, `${file} still branches on a length comparison`);
    if (/timingSafeEqual/.test(src)) {
      assert.match(src, /sha256\(/, `${file} must hash to a fixed width before comparing`);
    }
  }
});
```

**`stripComments` is mandatory here, not optional.** Several Phase 1 requirements *add a comment
that quotes the thing it deleted* — D-40's replacement of the bare `return false` at
`src/main/index.ts:269`, and D-14's honesty paragraph in `hooks.ts`'s header both do. A raw grep
for `HIVE_SOCK_TOKEN =` or `platform === 'win32'` would match the explanatory comment and fail on
the correct fix.

**Structural-assertion pattern for a parsed artifact** (`test/ci-config.test.cjs:72-87`) — parse,
then compare two sources of truth against each other, never assert a literal:

```js
test('the supported Node range is pinned in package.json and .nvmrc', () => {
  const range = pkg.engines && pkg.engines.node;
  assert.ok(range, 'package.json needs "engines.node" — Node 24 breaks the native build');

  const lower = Number((/>=\s*(\d+)/.exec(range) || [])[1]);
  const upper = Number((/<\s*(\d+)/.exec(range) || [])[1]);
  assert.ok(Number.isFinite(lower) && Number.isFinite(upper), `engines.node ${range} must be a ">=X <Y" range`);
  ...
});
```

Use this shape for FLOOR-12's token assertion (parse `tokens.css`, assert no `--cth-text-*` value
`< 14`) rather than a literal-string match — a literal match breaks on whitespace.

**Assertion-message convention** (`TESTING.md:89`): every `assert` carries a message saying *what a
failure would mean*, not restating the assertion. `` `these test files would never run under
\`npm test\`: ${orphans.join(', ')}` `` (`ci-config:56`) is the model — it names the consequence and
prints the offending set.

---

### `test/renderer-components.test.cjs` (test, static render)

**Analog A: `test/pty-sanitize.test.cjs:1-19`** — the `Module._load` stub, the only established way
to load a renderer file under `node --test`.
**Analog B: `test/load-ts.cjs:63-71`** — `resolveTs`, which D-25 must extend.

**The `Module._load` stub** (`test/pty-sanitize.test.cjs:1-19`), verbatim:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

// useHive.ts is a React hook: it imports `react` and the renderer's `@/` alias,
// neither of which resolves under node:test. `sanitizePtyText` is a pure
// function, so stub those two out and load the real module — the guard is
// asserted where it actually ships, not against a copy.
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

**Adapt, do not copy, the predicate.** `renderToStaticMarkup` needs the **real** `react` and
`react-dom` — so the stub must pass `react` through and intercept only `@/…`. That is a two-word
change to the `if`, and it is the difference between rendering and rendering a Proxy.

**What `resolveTs` does and does not handle today** (`test/load-ts.cjs:63-71`):

```js
function resolveTs(fromDir, request) {
  const base = request.startsWith('@shared/')
    ? path.resolve(__dirname, '..', 'src/shared', request.slice('@shared/'.length))
    : path.resolve(fromDir, request);
  for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}
```

Two consequences the planner needs, both verified by reading the candidate components:

1. **`.tsx` is absent from the candidate list.** `BlockedBanner.tsx:1-2` imports `./PixelButton` and
   `./Icon` — both `.tsx` siblings. Without D-25's `.tsx` entry, `resolveTs` returns `null`, and
   `localRequire` (`load-ts.cjs:97-104`) falls through to the real `require`, which throws.
2. **`@/` is NOT resolved — only `@shared/`.** Candidate selection must therefore prefer components
   whose `@/` imports are *type-only* (erased by `transpileModule`) or absent:

| Candidate | Imports (read this session) | Verdict |
|---|---|---|
| `PixelBadge.tsx` (81 ln) | `import { CSSProperties } from 'react'` only | **cleanest** — no `@/`, no sibling `.tsx`, no `window.cth` |
| `ProviderLogo.tsx` (74 ln) | `import type { AgentProvider } from '@/store/config'` | **safe** — type-only `@/`, erased at transpile |
| `SidebarTabs.tsx` (61 ln) | `import { type SidebarTab } from '@/store/store'` (elided — specifier list empties), `@/design/tokens` (type), `./Icon` (value) | safe once `.tsx` resolves |
| `ErrorBoundary.tsx` (85 ln) | `react` + `./PixelButton` | safe once `.tsx` resolves |
| `BlockedBanner.tsx` (85 ln) | `./PixelButton`, `./Icon`, type-only `@/store/store` | safe once `.tsx` resolves |
| `UpdateBadge.tsx` (91 ln) | **calls `window.cth` at `:27-28,:40-44`** | **exclude** — confirms RESEARCH A5's warning with lines |
| `ToolWaterfall.tsx` (87 ln) | value import of `@/hooks/useTelemetry` | exclude unless `@/` resolution is added |

**Transpile options to mirror** (`test/load-ts.cjs:77-84`) — D-25 adds `jsx` here; note the
`esModuleInterop` comment explaining a bug the naive version ships:

```js
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      // Match tsconfig.node/tsconfig.web. Without it a default import of a CJS
      // builtin (`import path from 'node:path'`) compiles to `path_1.default`,
      // which is undefined at run time — the module loads fine and then explodes
      // on first use. Test harness only; no shipped code compiles through here.
      esModuleInterop: true
    },
```

**Component default-export convention** (`CONVENTIONS.md:101`): renderer `.tsx` files use **default**
exports while `src/main` / `src/shared` are named-export only. So the destructuring idiom
`const { X } = loadTs(...)` does **not** apply — expect `loadTs('src/.../PixelBadge.tsx').default`
(or a named export where the file happens to use one; `PixelBadge.tsx:1` suggests checking each).

**Assertion ceiling to state in the file header** (D-26 / RESEARCH:624): SSR runs no effects and no
events. Assertions are on markup only.

---

### `test/db-fts.test.cjs` (test, integration over a real SQLite handle)

**Analog A (inverted): `test/config-secrets.test.cjs:31-73`.** This is the file that *fakes*
`better-sqlite3`; `db-fts` is the file that must **not**. Read it to know exactly what to omit:

```js
// better-sqlite3 in this repo is built for Electron's ABI, so it cannot load under
// plain node — and config.ts falls back to keeping mission stamps in config.json
// when the store is unavailable, which would leave the diversion untested. Stand a
// fake driver in for it: enough of the surface PersistStore.getKv/setKv touches,
// and nothing else. (The fallback path itself is exercised every time this file is
// run WITHOUT the fake, which is how it was first seen working.)
const sqlite = require.resolve('better-sqlite3');
require.cache[sqlite] = {
  id: sqlite,
  filename: sqlite,
  loaded: true,
  exports: class FakeDatabase {
    constructor() { this.rows = new Map(); this.version = 0; }
    pragma(q) {
      if (q === 'user_version') return this.version;
      if (q.startsWith('user_version =')) this.version = Number(q.split('=')[1].trim());
      return undefined;
    }
    exec() { /* schema DDL — the Map is the schema here */ }
    ...
```

**The trap, with its line.** `FakeDatabase.pragma` at `:59-62` **implements the migration rail** and
`exec()` at `:64` is a **no-op**. So a `PersistStore` opened against the fake runs
`db.pragma('user_version = N')` and never executes the `CREATE VIRTUAL TABLE`. The migration "runs"
and the version bumps — with no FTS5 table anywhere. That is Pitfall 5 made concrete.

**Isolation fact that makes this workable:** `node --test` runs each test file in its own child
process, so `config-secrets.test.cjs`'s `require.cache` injection cannot leak into `db-fts.test.cjs`.
No un-injection dance is needed — just do not inject.

**Still needed:** the real `better-sqlite3` under plain Node is built for the **Electron** ABI
(`config-secrets:45-46` states this, and `ci.yml` already does exactly this dance for `node-pty`).
Budget `npm rebuild better-sqlite3` in the `test` job, or move the assertion to e2e (RESEARCH Open
Question 2).

**Analog B: the real-tempdir floor harness** (`test/hive-protocol-v2.test.cjs:31-37`) — the shape
for a self-cleaning store under test:

```js
function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-protocol-v2-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  return { home, hive };
}
```

`PersistStore`'s constructor takes exactly the override this needs
(`src/main/db.ts:74`): `/** @param dbPath  Override the DB location (tests). Defaults to
userData/harness.db. */ constructor(private dbPath?: string) {}` — so `new PersistStore(join(tmp,
'x.db'))` needs no `app.getPath` fake at all.

Use `realpathSync`-wrapped temp dirs if any assertion compares paths — `test/main-hardening.test.cjs:23-26`:

```js
/** A temp dir that cleans itself up, realpath'd so macOS's /var → /private/var
 *  symlink doesn't make every assertion here a symlink test by accident. */
function tempDir(t, prefix) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* noop */ } });
  return dir;
}
```

---

### `test/hooks-notify.test.cjs` (test, unit with a DI `notify` fake)

**Analog A: `test/delivery-main.test.cjs:21-53`** — the `harness()` of plain-function fakes on a
fake clock. This is the idiom `CONVENTIONS.md:95` names as the reason these classes are testable:

```js
/** A DeliveryService wired to fakes, on a fake clock so a TUI settle + four
 *  post-resume Enter retries cost no wall-clock time. */
function harness(overrides = {}) {
  const state = {
    clock: 1_000_000,
    agents: [{ agentId: 'dev1', ptyId: 'pty1', provider: 'claude', hasOutput: true, idleMs: 30_000 }],
    inbox: { dev1: [{ id: 'm1', from: 'god' }] },
    ...
  };
  const emitted = [];
  const writes = [];
  const svc = new DeliveryService({
    liveAgents: () => state.agents,
    inbox: (id) => state.inbox[id] ?? [],
    write: (ptyId, data) => { ... },
    emit: (channel, payload) => emitted.push({ channel, payload }),
    log: () => { /* quiet */ },
    now: () => state.clock,
    sleep: async (ms) => { state.clock += ms; },
    ...overrides
  });
  return { svc, state, emitted, writes, bump: (ms) => { state.clock += ms; } };
}
```

**Analog B: `test/net-binding.test.cjs:107-136` `hookFloor(t)`** — a **real** `HookServer` on a
throwaway socket, and the closest thing in the repo to what `hooks-notify` needs:

```js
async function hookFloor(t) {
  const sock = sockPath(t);
  const sent = [];
  const hive = {
    sockPath: () => sock,
    recordSession: () => {},
    isGod: () => false,
    rosterContext: () => null
  };
  const server = new HookServer(
    hive,
    () => ({ send: (channel, payload) => sent.push({ channel, payload }) }),
    () => ({ notifications: false })
  );
  server.start();
  t.after(() => server.stop());
  ...
}
```

**The one thing to change and why.** `hookFloor` passes `() => ({ notifications: false })` as the
third constructor arg — which is precisely the gate `notify()` returns on
(`src/main/hooks.ts:426`: `if (!this.getConfig().notifications) return;`). A FLOOR-14 test must pass
`{ notifications: true }`.

**`notify()` is `private` and calls Electron's `Notification` directly**
(`src/main/hooks.ts:420-431`):

```js
  private notify(agentId: string | undefined, title: string, body: string): void {
    if (!this.getConfig().notifications) return;
    try {
      if (!Notification.isSupported()) return;
      const n = new Notification({ title, body });
      if (agentId) n.on('click', () => { try { this.focus?.(agentId); } catch { /* window gone */ } });
      n.show();
    } catch { /* notifications unsupported on this platform — ignore */ }
  }
```

Since it is private and Electron-bound, the DI seam is the **`electron` `require.cache` injection**
already used at `test/net-binding.test.cjs:33-41` — a recording `Notification` class:

```js
// hooks.ts pulls Notification from electron; outside Electron that resolve gives
// a path string, so seed the cache with the surface the server actually touches.
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};
```

Widen that class to record `{title, body}` and return `true` from `isSupported()`, and the whole
FLOOR-14 assertion is available without touching `hooks.ts`'s visibility modifiers.

**Constructor arg order** (`src/main/hooks.ts:100-131`) — the two optional tail params are what a
blocked-notification test needs to observe:

```ts
  constructor(
    private hive: HiveManager,
    private getWebContents: () => WebContents | null,
    private getConfig: () => HarnessConfig,
    /** #7C — operator control state. Optional so tests can omit it. */
    private control?: ControlRegistry,
    private breaker?: CircuitBreaker,
    private drainAtStop?: (agentId: string) => { block: boolean; reason?: string },
    /** #42 — put an agent in front of the human when they click its toast. */
    private focus?: (agentId: string) => void
  ) {}
```

---

### `eslint.config.js` (config) — **NO ANALOG**

There is no linter config in this repo and never has been (`CONVENTIONS.md:30-31`: *"No linter
configured. No `.eslintrc*`, `eslint.config.*`, no `eslint` package"*). The closest structural
analog is `playwright.config.ts` (root-level, ESM `export default`). **Do not derive the file from a
codebase pattern** — use the literal config at `01-RESEARCH.md:882-902`, which was written against
the plugin's own README and encodes the two amendments to D-28 (parser mandatory; never a preset).

The one *codebase* pattern that applies is the comment convention (`CONVENTIONS.md:78`): the config
must carry the paragraph explaining why the parser is present with zero rules, or a future
contributor will "simplify" it away.

---

### `docs/adr/0005-*.md` (FLOOR-17)

**Analog:** `docs/adr/0002-prompt-cache-invariant.md`, and the numbering rule at
`CONVENTIONS.md:85`: *"never renumbered, a reversed decision gets a new record, not an edit."*

**The pattern that matters most** (`01-RESEARCH.md:685`): **do not delete the source comment when
the ADR lands — link it.** ADR-0002 already uses the file:line-pointer-at-the-call-site + depth-in-
the-ADR shape. `src/shared/providerAutomation.ts:278-279` is the live example of the pointer half:

```ts
 * `hive.ts` owns where this lands (it must go in a cache-safe position — the
 * roster path, not the content; see #44).
```

---

## The four load-bearing idioms

### 1. Extraction-to-pure-function — the testability seam, and the contention answer

`src/main/index.ts` **cannot be loaded under plain Node** (it imports `electron` at module scope).
The proven response is to pull the guard into a topic file and test the topic file. The header
comment that states the rule (`test/main-hardening.test.cjs:1-8`):

```js
'use strict';

// Guards for the main-process hardening pass (#1, #8, #9).
//
// src/main/index.ts itself cannot be loaded here — it imports 'electron' — so
// each assertion targets the pure function the handler now delegates to. That
// is deliberate: index.ts was untestable precisely because every guard used to
// be inline in a handler.
```

The two shipped examples, and how the test reaches them (`test/main-hardening.test.cjs:18-19`):

```js
const { safeJoin, isWithinRoots, isAllowedExternalUrl } = loadTs('src/main/fs.ts');
const { worktreeHasUnintegratedWork } = loadTs('src/main/git.ts');
```

What an extracted guard looks like — note it returns `null` rather than throwing, and the comment
explains the failure the "obviously simpler" version ships (`src/main/fs.ts:15-27`):

```ts
export function safeJoin(root: string, rel: string): string | null {
  const absRoot = resolve(root);
  const absPath = isAbsolute(rel) ? normalize(rel) : resolve(absRoot, rel);
  // Compare the paths the OS will ACTUALLY use, not the strings the caller typed:
  // a symlink sitting INSIDE the root but pointing outside it passes a purely
  // textual containment check, and then the read/write lands on the target (#9).
  // `realish` degrades to the lexical path for anything not on disk yet — a file
  // about to be created, or a rel path validated against a git rev rather than
  // the working tree — so no legitimate caller loses.
  const rel2 = relative(realish(absRoot), realish(absPath));
  if (rel2.startsWith('..') || isAbsolute(rel2)) return null;
  return absPath;
}
```

And the fail-safe verdict-object variant (`src/main/git.ts:334-342`), which `CONVENTIONS.md:70`
names as the second of the two error-handling patterns:

```ts
export async function worktreeHasUnintegratedWork(
  wtPath: string, baseBranch: string
): Promise<{ keep: boolean; detail: string; branch: string; dirty: boolean; ahead: number }> {
  const br = await getBranch(wtPath);
  const branch = 'current' in br && br.current ? br.current : '(detached)';
  // Uncommitted or untracked changes?
  const status = await runGit(wtPath, ['status', '--porcelain']);
  const dirty = status.ok ? status.stdout.trim().length > 0 : true; // unknown → assume dirty
```

> **`use_worktrees: false` — seams that keep a change OUT of `src/main/index.ts`.**
> `src/main/index.ts` is 5,620 lines and is written by **seven** requirements. Two agents editing it
> in the same wave is a lost update. Concrete seams found while reading, each of which moves work
> out of T-INDEX:
>
> | Requirement | Naive site (T-INDEX) | Seam that avoids it |
> |---|---|---|
> | **FLOOR-18** | `index.ts:269` `if (process.platform === 'win32') return false;` | Put the declaration in `src/shared/providerAutomation.ts` (a `remote` bit on `ProviderCapabilities`, per Open Question 4). `index.ts` keeps a one-line comment edit only — small enough to hand to whichever agent already holds T-INDEX. |
> | **FLOOR-10 / RECORD-03** | the beat's ledger appender at `index.ts:1513` | The `Map<taskId, tokens>` accumulator and the startup ledger rescan both belong in `src/main/hive.ts` next to `taskSpend` (`:2566`) and `appendCostLedger` (`:2513`). `index.ts` keeps its existing one-line `hive.appendCostLedger(sample)` call unchanged. |
> | **FLOOR-10 (budget arm)** | — | Already outside: `src/main/breaker.ts` `evaluate()` is uncontended and pure. |
> | **FLOOR-02 (idle-quiesce)** | a new interval in `index.ts` | `src/main/delivery.ts` already owns a tick and already receives `now`/`sleep`/`liveAgents` (`DeliveryDeps:54-79`). The backstop is a branch in the existing tick, not a new timer in `index.ts`. |
> | **GATE-01** | spawn-site env in `index.ts` + `pty.ts:665` | The `Map<token, agentId>` and the identity derivation belong in `src/main/hooks.ts` (T-HOOKS). Only the deletion of `index.ts:5534` and the qwen sidecar's env are unavoidably T-INDEX — two line-level edits, so give them to whichever agent holds T-INDEX that wave rather than splitting GATE-01. |
> | **FLOOR-07 (dead preload exports)** | `index.ts:4041,4046` handler deletions | Unavoidably T-INDEX, but they are two `ipcMain.handle` line deletions. Per RESEARCH's wave-4 note, hand them to the T-INDEX holder as a checklist item. |

### 2. The DI-config-object idiom (FLOOR-02, FLOOR-10, FLOOR-14)

`CONVENTIONS.md:95` states it: *"Constructors for stateful classes take a single dependency/config
object … which is also what makes them testable with fakes."*

The canonical interface (`src/main/delivery.ts:54-79`) — note every dep is a plain function, and the
`now`/`sleep` pair exists **specifically** so a test can drive it on a fake clock:

```ts
export interface DeliveryDeps {
  /** Live, non-archived agents that own a PTY right now. */
  liveAgents: () => LiveAgentPty[];
  /** Unread messages in an agent's inbox (hive.inbox). */
  inbox: (agentId: string) => DeliverableMessage[];
  /** Raw PTY write (ptyManager.write). Never throws; reports `ok:false`. */
  write: (ptyId: string, data: string) => { ok: boolean; error?: string };
  /** Operator's auto-delivery pause for this agent (ControlRegistry). */
  paused: (agentId: string) => boolean;
  ...
  /** Send an event to the renderer (a no-op when no window is attached). */
  emit: (channel: string, payload: unknown) => void;
  log?: (...args: unknown[]) => void;
  now?: () => number;
  /** Injectable delay, so a test can drive the whole loop on a fake clock
   *  instead of actually waiting out a TUI settle + four Enter retries. */
  sleep?: (ms: number) => Promise<void>;
}
```

Wired at `src/main/delivery.ts:153`: `constructor(private readonly deps: DeliveryDeps) {}`.

**FLOOR-02's queue-drain and idle-quiesce must extend this interface, not add a second one.** The
wiring site is `src/main/index.ts:455-465`, whose existing shape shows how a main-side computation
is folded into a dep rather than leaked into `index.ts`:

```ts
    const res = hive.drainForStop(agentId);
    return { ...res, delivered: res.block ? pending.map((m) => ({ id: m.id, from: m.from })) : [] };
  },
  respawn: respawnOnAccount,
  emit: (channel, payload) => { try { liveWebContents()?.send(channel, payload); } catch { /* window tore down */ } }
});
```

### 3. `PRAGMA user_version` migration rail (FLOOR-07)

`src/main/db.ts:33-50` — the contract, stated in the array's own doc comment. **Append only.**

```ts
/**
 * Ordered, append-only migrations. Index N takes the DB from user_version N to
 * N+1. To evolve the schema, APPEND a new function — never edit an existing one
 * (shipped DBs have already run it).
 *
 * FUTURE (do NOT build in v1 — reserved so the array isn't painted into a corner):
 *   - Phase B: `agents` + `message_queue` mirror of the renderer roster/queues
 *     (dual-write), enabling the eventual authority flip off localStorage.
 *   - Cross-lane (Lane A #6): migrate Jim's cost ledger onto this DB so his
 *     circuit-breaker can move off transcript-polling. Column names match his
 *     <harnessHome>/hive/cost-ledger.jsonl keys 1:1 for a straight INSERT…SELECT
 *     (coordinated w/ jim-mq290qkn 2026-06-06):
 *       cost_ledger(id, agent_id, session_id TEXT, ts, input, output,
 *                   cache_read, cache_creation, model TEXT, usd REAL)
 *     Rows are CUMULATIVE snapshots (one per agent per heartbeat beat) — diff
 *     consecutive rows for velocity; index (agent_id, session_id, ts). Additive;
 *     lands as a later migration.
 */
const MIGRATIONS: Array<(db: Database.Database) => void> = [
```

**The existing migration's exact shape — copy this** (`src/main/db.ts:51-69`). Note the
`→ user_version N` comment above each entry, `CREATE TABLE IF NOT EXISTS`, one `db.exec` with a
single template literal, and an explicit index:

```ts
  // → user_version 1 (Phase A): scalar kv + net-new command history.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,     -- JSON-encoded
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS command_history (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        cwd      TEXT,
        text     TEXT NOT NULL,
        ts       INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ch_agent_ts ON command_history(agent_id, ts DESC);
    `);
  }
];
```

**The runner** (`src/main/db.ts:110-121`) — a crashed migration can never leave a half-applied schema
at the wrong version, because the DDL and the version bump share one transaction:

```ts
  private migrate(db: Database.Database): void {
    const version = db.pragma('user_version', { simple: true }) as number;
    for (let i = version; i < MIGRATIONS.length; i++) {
      // Each migration + its version bump run in one transaction so a crash
      // mid-migration never leaves a half-applied schema at the wrong version.
      const run = db.transaction(() => {
        MIGRATIONS[i](db);
        db.pragma(`user_version = ${i + 1}`);
      });
      run();
    }
  }
```

D-33's target, in this shape, is `// → user_version 2 (FLOOR-07): FTS5 keyword recall.` plus one
`db.exec` containing `CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(text, agent_id
UNINDEXED, project UNINDEXED)`. **Note `CREATE VIRTUAL TABLE` has no `IF NOT EXISTS` in older SQLite
grammars — verify against the shipped `better-sqlite3` before assuming, and do not silently drop the
guard.**

Also note `openOnce` (`src/main/db.ts:99-107`) sets four pragmas before migrating; FTS5 needs none of
them changed, but the corrupt-DB quarantine path at `:82-96` is what makes a bad migration
survivable — do not add a `throw` inside a migration.

### 4. The `.cjs` shim template idiom (GATE-01)

Six templates live as top-level template literals in `src/main/hive.ts`, each written to disk by a
`writeFileSync` at a named site:

| Const | Definition | Written at |
|---|---|---|
| `HOOK_SHIM` | `hive.ts:3078` | `hive.ts:682` |
| `AGY_HOOK_SHIM` | `hive.ts:3140` | `hive.ts:2054` |
| `PI_EXTENSION` | `hive.ts:3199` | `hive.ts:2189` |
| `OPENCODE_PLUGIN` | `hive.ts:3238` | `hive.ts:2223` |
| `PROXY_BRIDGE_SHIM` | `hive.ts:3275` | `hive.ts:684` |
| `GROK_HOOK_SHIM` | `hive.ts:3496` | `hive.ts:2284` |

The template shape (`src/main/hive.ts:3074-3090`) — a header comment stating the shim's whole
contract, then a backtick literal whose inner `\n` are escaped `\\n`:

```ts
// ─── cth-hook shim (written to <hive>/bin/cth-hook.cjs) ──────────────────────
// A minimal pipe: read the hook payload on stdin, tag it with this agent's id,
// forward it to the hive's UDS, and relay the response back to `claude`. All the
// real logic lives in the main process (HookServer). Never blocks a stop on error.
const HOOK_SHIM = `#!/usr/bin/env node
'use strict';
const net = require('net');
const isStatus = process.argv.includes('--status');
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { data += d; });
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(data || '{}'); } catch (_) {}
  if (!payload.agent_id) payload.agent_id = process.env.AGENT_ID || null;
  const sock = process.env.HIVE_SOCK;
```

**D-11 is confirmed by reading these: the shim bodies need no change.** The shim reads its token out
of inherited env; only what main puts in each PTY's `opts.env` changes. Confirmed by grep — none of
the six templates is in the write set for GATE-01.

**Where the token actually comes from today** (`src/main/index.ts:5525-5534`) — this is the comment
D-12 deletes, and it explains why deleting it is mandatory rather than cosmetic:

```ts
  // The hook socket's shared secret, by the same inheritance route. HookServer
  // rejects every payload whose `sock_token` doesn't equal hookSockToken(), and
  // the hook shims read this value out of the env they inherit — as PTY
  // descendants (pty.ts merges process.env) AND, for the qwen proxy bridge, as a
  // sidecar main spawns with `...process.env`. Setting it here rather than at
  // each spawn site is what makes BOTH of those work. Get this wrong and every
  // hook in the app goes dead at once; hooks.ts's rejection log names this exact
  // variable for that reason.
  process.env.HIVE_SOCK_TOKEN = hookSockToken();
```

**The gate to modify** (`src/main/hooks.ts:194-210`) — the `Map<token, agentId>` replaces the
`SOCK_TOKEN` comparison here, and the loud-rejection throttle must survive:

```ts
  private authorized(p: HookPayload): boolean {
    const provided = typeof p.sock_token === 'string' ? p.sock_token : '';
    if (timingSafeEqual(sha256(provided), sha256(SOCK_TOKEN))) return true;
    this.rejected += 1;
    const now = Date.now();
    if (now - this.lastRejectLog >= REJECT_LOG_INTERVAL_MS) {
      this.lastRejectLog = now;
      console.error(
        `[hive] hook payload REJECTED (${provided ? 'wrong' : 'missing'} sock_token) — `
        + `agent=${p.agent_id ?? '?'} event=${p.hook_event_name ?? '?'}, `
        + `${this.rejected} rejected so far. If this is every hook, the agent PTY env `
        + 'is missing HIVE_SOCK_TOKEN (see hookSockToken() in hooks.ts).'
      );
    }
    return false;
  }
```

Two constraints from `test/net-binding.test.cjs:217-232` (the repo-fact test above): the new lookup
must **not** compare `.length`s, and any `timingSafeEqual` in `hooks.ts` must still be preceded by a
`sha256(` — a `Map.get(token)` lookup satisfies both trivially, but a naive per-entry compare loop
would fail the existing test.

**The trust-boundary comment to preserve/extend** (`src/main/hooks.ts:145-149`):

```ts
        // THE trust boundary. Anything past this line is believed — including
        // `agent_id`, which decides whose session/ledger/breaker gets written.
        // Answer an unauthenticated peer with the same empty object a real hook
        // gets, so the socket is not also a probe for whether it guessed right.
        if (!this.authorized(payload)) { conn.end('{}'); return; }
```

D-11 **discards** `payload.agent_id` — so the follow-on line `const agentId = p.agent_id ??
undefined;` (`src/main/hooks.ts:212`) is the second edit, and the header paragraph at
`src/main/hooks.ts:12-18` is where D-14's honest ceiling goes.

---

## Pattern Assignments — modified files, by requirement cluster

### FLOOR-09 / FLOOR-10 / RECORD-03 / RECORD-04 — the spend cluster

**`src/main/breaker.ts` — the arm chain to insert into** (`:309-330`). Ordered `if`-chain with early
`return`; each arm returns `{tripping, reason}` and the reason string is what the operator reads:

```ts
    // (b) repeated identical tool calls
    if (s.repeatCount >= cfg.repeatedToolLimit) {
      return { tripping: true, reason: `looping: ${s.repeatCount}× identical tool call (${s.repeatKey?.split(':')[0] ?? '?'})` };
    }
    // (b) api_error storm
    if (s.errorCount >= cfg.errorStormLimit) {
      return { tripping: true, reason: `error storm: ${s.errorCount} consecutive api errors/retries` };
    }
    // (a) per-agent token limit — this agent's own total over its configured cap
    const perAgentCap = cfg.agentTokenCaps?.[input.agentId];
    const billable = billableTokensOf(input.sample);
    if (typeof perAgentCap === 'number' && perAgentCap > 0 && billable > perAgentCap) {
      return { tripping: true, reason: `token limit: ${billable.toLocaleString()} billable tokens (output + fresh input, cache reads excluded) over the agent cap of ${perAgentCap.toLocaleString()}` };
    }
```

Per RESEARCH:520 the budget arm goes **after** the two `(b)` arms and **before** the floor-wide
`(a)` caps. `BreakerInput` (`src/main/breaker.ts:50-57`) is the interface D-17 widens with
`budget: {taskId, tokens, cap}`:

```ts
/** Per-agent input for one beat. */
export interface BreakerInput {
  agentId: string;
  /** Cumulative usage snapshot, or null when unknown (skips cost/velocity trips). */
  sample: AgentUsageSample | null;
  /** Did the agent make coordination progress recently (file-mtime signal)? */
  progressing: boolean;
}
```

**The one-level-per-beat constraint, at its line** (`src/main/breaker.ts:275-282`):

```ts
      const ceiling: BreakerLevel = cfg.hardStop ? 'stopped' : 'constrained';
      let target = s.level;
      if (trip.tripping) {
        target = LEVELS[Math.min(rank(s.level) + 1, rank(ceiling))];
      } else {
        target = LEVELS[Math.max(rank(s.level) - 1, 0)]; // recover one level
      }
```

**⚠ The breaker test is a different animal — read before writing FLOOR-10's test.**
`test/breaker.test.cjs` does **not** use `node:test`, does **not** use `loadTs`, and **exits the
process**:

```js
const { CircuitBreaker } = require(path.join(out, 'breaker.js'));   // :32 — hand-transpiled to a temp dir

let failures = 0;
function test(name, fn) {                                          // :35 — its OWN test(), shadowing nothing
  try { fn(); console.log(`  ok  ${name}`); }
  catch (e) { failures++; console.error(`FAIL  ${name}\n      ${e.message}`); }
}
...
process.exit(failures ? 1 : 0);                                    // :224 — LAST LINE OF THE FILE
```

Consequences for wave 3A: adding `require('node:test')` + `test(...)` to this file collides with the
local `test` binding, and the terminal `process.exit(0)` runs before any async `node:test`
registration could complete — a green run that asserted nothing. **Either** follow the file's own
synchronous hand-rolled idiom (the budget arm is pure and synchronous, so this works and is the lazy
option), **or** put the budget test in `test/engine-parity.test.cjs`, which is a real `node:test`
file and already constructs a `CircuitBreaker` with the same helper (`test/engine-parity.test.cjs:46-51`):

```js
/** A breaker with fixed config (mirrors test/breaker.test.cjs's helper). */
function makeBreaker(over = {}) {
  return new CircuitBreaker(() => ({
    enabled: true, hardStop: false, repeatedToolLimit: 8, errorStormLimit: 5,
    tokenVelocityPerMin: 60000, ...over
  }));
}
```

**The two-beat pattern that satisfies Pitfall 6 already exists** (`test/engine-parity.test.cjs:70-83`)
— tick once for the baseline, tick again after the sample:

```js
test('a CostSample from a proxy-tier engine arms the breaker', () => {
  const t = new TelemetryCollector();
  const b = makeBreaker({ agentTokenCaps: { 'qwen-1': 10_000 } });
  const now = 1_700_000_000_000;

  // Before any sample the engine is invisible: no sample, no trip. This is
  // exactly the old behaviour for the whole proxy tier.
  assert.equal(b.tick([{ agentId: 'qwen-1', sample: null, progressing: true }], now)[0].state.level, 'healthy');

  t.recordCostSample(costSample({ input: 9_000, output: 5_000 }));
  const d = b.tick([{ agentId: 'qwen-1', sample: t.getAgentUsage('qwen-1'), progressing: true }], now + 30_000)[0];
  assert.equal(d.state.level, 'steering');
  assert.match(d.state.reason, /token limit/);
});
```

**`src/main/hooks.ts:261-289` — the `CostSample` branch FLOOR-09 repoints.** The early `return {}`
at `:288` is deliberate and documented; D-21 rewrites it, does not delete it:

```ts
    // CostSample — synthesized by the proxy-bridge sidecar (qwen) on every
    // response with usage. Persist it to the SAME cost ledger as Claude's OTel
    // path, keyed by the synthesized session_id, then return early so cost stays
    // OUT of the Claude-only OTel/breaker/drain paths below. `usd` is the fallback
    // per-model estimate (a local model normally costs ~$0, but the row keeps the
    // accounting schema uniform). Pure telemetry — never feeds the loop detector.
    if (event === 'CostSample') {
      if (agentId && p.session_id) {
        const input = p.input ?? 0;
        const output = p.output ?? 0;
        const cacheRead = p.cache_read ?? 0;
        const cacheCreation = p.cache_creation ?? 0;
        this.hive.appendCostLedger({ ... });
      }
      return {};
    }
```

The `?? 0` coercions above are pinned by `test/engine-parity.test.cjs:85-94` (`a garbage sample
cannot rewind a cumulative accumulator`) — keep them.

**The test to rewrite (D-23)** — `test/hive-protocol-v2.test.cjs:256-284`. The whole test, not a
line range:

```js
// ─── #34 — per-card cost attribution ────────────────────────────────────────

test('cost rows carry the card they were spent on, and a card knows its cap', (t) => {
  ...
  const sample = (agentId, input, output, usd) => ({
    agentId, sessionId: 's1', ts: 1, input, output, cacheRead: 0, cacheCreation: 0, model: 'claude-x', usd
  });
  hive.appendCostLedger(sample('jim-1', 10, 5, 0.01));
  hive.appendCostLedger(sample('jim-1', 4, 1, 0.02));
  hive.appendCostLedger(sample('pam-1', 100, 100, 9.99)); // no card in flight
  ...
  const spend = hive.taskSpend('t-doing');
  assert.equal(spend.tokens, 20);          // ← 10+5+4+1 — the SUMMING contract D-19/D-20 remove
```

Under the corrected arithmetic those two `appendCostLedger` calls are cumulative snapshots, so the
diff is `(4+1) − (10+5)` clamped to 0, then re-based. **The commit message must quote
`assert.equal(spend.tokens, 20)` as the old expectation** (D-23), and the source fix lands first in
its own `fix(...)` commit.

**`src/main/hive.ts` anchors for the arithmetic fix:** `COST_TAIL_BYTES` `:244`, `redactSecrets`
`:324`, `appendCostLedger` **`:2513`** (CORRECTED), `taskSpend` `:2566`, the tail read at `:2571`.

### FLOOR-18 / FLOOR-09's capability line

**`src/shared/providerAutomation.ts:258-289`** — the whole channel, verbatim:

```ts
export function providerCapabilities(provider: AgentProvider): ProviderCapabilities {
  const preset = providerPreset(provider);
  return {
    provider,
    mail: preset.canReceiveInbox,
    spend: preset.costTracking,
    compact: contextCommandsForProvider(provider).compact
  };
}

/**
 * One line telling the god what an engine can actually do — the fix for #19's
 * real damage: the god assigns mail-dependent work to a Kimi worker that cannot
 * receive mail, and reads a floor budget that silently omits five engines.
 *
 * Written for a model skimming a roster, so the MISSING capabilities shout
 * (uppercase) and the present ones stay quiet — the gaps are the actionable
 * half. Kept to one clause per capability: this is injected once per roster
 * entry, and a paragraph per agent would crowd out the prompt it decorates.
 *
 * `hive.ts` owns where this lands (it must go in a cache-safe position — the
 * roster path, not the content; see #44).
 */
export function capabilityLine(provider: AgentProvider): string {
  const c = providerCapabilities(provider);
  const bits = [
    c.mail ? 'mail ok' : 'NO MAIL (bounces to you)',
    c.spend === 'none' ? 'spend UNTRACKED (invisible to every budget)' : `spend tracked (${c.spend})`,
    c.compact ? `compacts ${c.compact}` : 'NO COMPACT (context cannot be reclaimed)'
  ];
  return `${c.provider}: ${bits.join(', ')}`;
}
```

The `bits` array is where a `remote` clause lands (Open Question 4's recommendation), and the
uppercase-shouts-for-gaps convention is the copy contract: `'REMOTE CONTROL unavailable on Windows'`,
not `'remote control: n/a'`.

**Assertions that will break and must be updated in lockstep**
(`test/engine-parity.test.cjs:134-155`) — these are **exact-equality** on the full string, so any new
clause changes three of them:

```js
test('the capability line is honest about a mail-capable engine', () => {
  assert.equal(capabilityLine('claude'), 'claude: mail ok, spend tracked (otel), compacts /compact');
});

test('the capability line SHOUTS about a mail-incapable engine', () => {
  // Kimi has no hook bridge, so routed mail bounces to the god — the exact
  // failure #19 opens with (god assigns mail-dependent work to a Kimi worker).
  assert.equal(
    capabilityLine('kimi'),
    'kimi: NO MAIL (bounces to you), spend UNTRACKED (invisible to every budget), compacts /compact'
  );
});
```

And the total-coverage test at `:157-165`, which is the one to extend with the new field:

```js
test('every engine answers all three capability questions', () => {
  for (const p of ['claude', 'codex', 'grok', 'kimi', 'antigravity', 'qwen',
    'opencode', 'crush', 'pi', 'copilot', 'custom']) {
    const c = providerCapabilities(p);
    assert.equal(typeof c.mail, 'boolean', p);
    assert.ok(['otel', 'proxy', 'transcript', 'none'].includes(c.spend), `${p}: ${c.spend}`);
    assert.ok(c.compact === null || typeof c.compact === 'string', p);
  }
});
```

### FLOOR-05 / FLOOR-07 / FLOOR-10 — preload

**Pattern** (`src/preload/index.ts:776-781`) — one line per channel, explicit return type,
`ipcRenderer.invoke` with the `domain:action` string:

```ts
  hiveTasks: (): Promise<unknown> => ipcRenderer.invoke('hive:tasks'),
  hiveLog: (n?: number): Promise<unknown[]> => ipcRenderer.invoke('hive:log', n ?? 200),
  hiveMemory: (id: string): Promise<string> => ipcRenderer.invoke('hive:memory', id),
  hiveInbox: (id: string): Promise<HiveMessage[]> => ipcRenderer.invoke('hive:inbox', id),
```

**The closest analog for FLOOR-05's `openLogs`** — a `{ok, error}` returner with a one-line doc
comment (`src/preload/index.ts:822-824`):

```ts
  /** Show a skill's folder in the OS file manager. */
  skillsReveal: (path: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('skills:reveal', path),
```

`app:openLogs` returns exactly that shape (`src/main/index.ts:4461`), so the new export is:
`/** Reveal the log folder (#13). */ openLogs: (): Promise<{ ok: boolean; path?: string; error?: string }> => ipcRenderer.invoke('app:openLogs'),`

**The two exports D-35 deletes** (`src/preload/index.ts:828-829` and `:834-835`) — verified present:

```ts
  memoryWakeUp: (wing?: string): Promise<{ ok: boolean; output: string; error?: string }> =>
    ipcRenderer.invoke('hive:memoryWakeUp', wing),
  ...
  reflectNow: (id?: string): Promise<Array<{ id: string; condensed: boolean; reason: string; oldBytes?: number; newBytes?: number }>> =>
    ipcRenderer.invoke('memory:reflectNow', id),

  // ─── Enterprise Knowledge Graph (multimodal context for agents) ───────────
```

`:838` is the section header D-35 renames — verified verbatim above.

**IPC handler pattern in main** (`src/main/index.ts:3888-3894`) — colon-namespaced, thin, argument
type-narrowed inline (`CONVENTIONS.md:16`):

```ts
ipcMain.handle('hive:registry', () => hive.registry());
ipcMain.handle('hive:board', () => hive.board());
ipcMain.handle('hive:tasks', () => hive.tasks());
ipcMain.handle('hive:log', (_evt, n: unknown) => hive.logTail(typeof n === 'number' ? n : 200));
```

`hive:tasks` at `:3894` is the row D-22 widens — the handler stays a one-liner; the widening happens
inside `hive.tasks()`.

### FLOOR-01 / FLOOR-12 / FLOOR-13 — the renderer

**The `BOSS` chip UI-SPEC:203 says to clone exactly** (`src/renderer/src/components/AgentCard.tsx:226-232`):

```tsx
                {isGod && (
                  <span style={{
                    fontFamily: 'var(--cth-font-display)', fontSize: 7, lineHeight: '11px',
                    background: `var(--cth-${accent})`, color: 'var(--cth-ink-900)',
                    padding: '1px 4px 0', flexShrink: 0
                  }}>BOSS</span>
                )}
```

Note `fontSize: 7` — this exact site is a FLOOR-12 Rule 1 target, so the new `AUTO` chip must be
written at `var(--cth-text-display-md)` from the start (UI-SPEC:222), not copied at 7 and swept later.

**The `flexShrink: 0` rationale, which the new chip inherits** (`AgentCard.tsx:234-237`):

```tsx
              {/* flexShrink:0 — the badge is a fixed 2-to-5 character chip; when
                  it was allowed to shrink, the browser resolved the overflow by
                  eating the NAME instead. Truncation should land on the longest,
                  most redundant thing, not on the identity. */}
              <PixelBadge status={typing ? 'typing' : status} style={{ flexShrink: 0 }} />
```

**The cost span — the model FLOOR-13's new `model` field copies** (`AgentCard.tsx:253-265`):

```tsx
              {/* Cost before the account chip: money is the thing being asked
                  about, the account is context for it. Hidden until telemetry
                  reports a non-zero spend — "$0.00" on a fresh agent is noise. */}
              {!!usd && usd > 0 && (
                <span
                  title={`Estimated spend so far: $${usd.toFixed(2)}`}
                  style={{
                    flexShrink: 0,
                    fontFamily: 'var(--cth-font-mono)',
                    fontSize: 10, lineHeight: '13px',
                    color: 'var(--cth-ink-700)'
                  }}
                >${usd.toFixed(2)}</span>
              )}
```

**Tokens to edit** (`src/renderer/src/design/tokens.css:60-77`) — the exact current block:

```css
  /* Type scale — v0.3.4: one step tighter (Inter reads larger than Pixelify
     at equal px, and the controls were oversized) */
  --cth-text-display-lg: 16px;
  --cth-text-display-md: 12px;
  --cth-text-display-sm: 8px;
  --cth-text-body-lg:    16px;
  --cth-text-body-md:    14px;
  --cth-text-body-sm:    13px;
  --cth-text-mono-md:    14px;
  --cth-text-mono-sm:    13px;

  /* Line heights — integer multiples */
  --cth-lh-display-lg: 24px;
  --cth-lh-display-md: 20px;
  --cth-lh-display-sm: 12px;
```

The name token at `AgentCard.tsx:219-221` consumes `--cth-text-display-sm` / `--cth-lh-display-sm`,
which UI-SPEC's migration table **deletes** — so the two Rule-1b sites must land in the same commit
as the token deletion or the renderer resolves `var()` to nothing.

**FLOOR-11's migration target** (`src/renderer/src/hooks/useHiveTasks.ts:1-15`) — its own header is
the migration instruction, and the `unknown` return is deliberate:

```ts
/**
 * ONE poll of the hive task file for the whole renderer.
 *
 * Four components (AgentStrip, AskMeTab, TasksKanban, TaskDetailOverlay) each
 * ran their own 5 s `window.cth.hiveTasks()` timer against the same file, and
 * the office floor ran two more — six independent reads of one JSON file, every
 * five seconds, forever (#20). They share this instead: one timer that exists
 * only while something is mounted, one IPC round trip per tick, one result
 * fanned out.
 *
 * Returns the RAW `hiveTasks()` payload, deliberately: every caller already has
 * its own parser for the shape it cares about, and making them agree on one
 * would be a much larger change than this is worth. Migration is one line —
 * delete the local `useState` + polling `useEffect`, call this.
 */
```

Its own header says **six** reads, matching UI-SPEC's corrected count of 10 sites / 5 timers — not
CONTEXT.md's and RESEARCH.md's "four". Use UI-SPEC's table.

### FLOOR-16 — the CI step

**Target job** (`.github/workflows/ci.yml:16-29`) — the `typecheck` job already installs with
`--ignore-scripts` and needs no native build, so the lint step goes here:

```yaml
  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      # --ignore-scripts skips postinstall's electron-rebuild: tsc needs the
      # .d.ts files, not compiled native bindings.
      - name: Install dependencies
        run: npm ci --ignore-scripts
      - name: Typecheck (node + web)
        run: npm run typecheck
```

**The one `continue-on-error` that exists here and must not be joined** (`.github/workflows/ci.yml:30-35`):

```yaml
      - name: npm audit (high and above)
        # Advisory. A fresh advisory in a transitive dep should be visible on the
        # PR, not block an unrelated change; dependabot (.github/dependabot.yml)
        # is what opens the actual bump PR.
        continue-on-error: true
```

---

## Shared Patterns

### Error handling — the discriminated result object

**Source:** `src/main/fs.ts` (quoted at `CONVENTIONS.md:53-68`).
**Apply to:** every new IPC handler, every fallible main-process function.

```ts
export async function readFileText(root: string, rel: string): Promise<{
  ok: true; content: string; path: string; size: number;
} | { ok: false; error: string }> {
  const abs = safeJoin(root, rel);
  if (!abs) return { ok: false, error: 'path escapes root' };
  try { ... } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

`e instanceof Error ? e.message : String(e)` is the repo-wide narrowing idiom (`CONVENTIONS.md:72`).
**Never throw across IPC** (`CONVENTIONS.md:74`). Prefer `null` over throwing for "not found"
(`CONVENTIONS.md:97`).

### Comments — the defining convention

**Source:** `CONVENTIONS.md:78`: *"comments explain WHY, at length … This habit is load-bearing and
should be preserved when adding or modifying code, not trimmed for brevity."*

Every excerpt above demonstrates it. The operational rule for this phase: **if a change exists
because of a bug, a race, a platform quirk or a security requirement, write the comment that
explains the failure it prevents, citing the issue number.** Several Phase 1 requirements are
*themselves* comment edits (D-14, D-40's `index.ts:269`), and `test/repo-claims.test.cjs` must strip
comments before grepping precisely because of this convention.

### Test-file skeleton

**Source:** `TESTING.md:79-101` + every analog above.
**Apply to:** all five new/extended test files.

```js
'use strict';
/** <why this file exists — the incident it prevents, with issue numbers> */
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { X } = loadTs('src/main/whatever.ts');

// ─── section title citing the issue ─────────────────────────────────────────
test('a full sentence describing the behaviour', async (t) => {
  ...
  assert.equal(actual, expected, 'what a failure here would MEAN');
});
```

- Flat `test(...)`, no `describe`/`beforeEach` (`TESTING.md:79`).
- `t.after(...)` for cleanup, not `afterEach` (`TESTING.md:91`).
- `t.skip('reason')` for environment-impossible cases — the suite's only two skips are POSIX guards
  (`TESTING.md:101`).
- Inline factory functions per file; **no** `test/fixtures/` or `test/helpers/` (`TESTING.md:145`).
- Never mock the thing under test (`TESTING.md:136`).

### `require.cache` injection

**Source:** `test/config-secrets.test.cjs:31-43` (electron) and `:52-73` (better-sqlite3);
`test/net-binding.test.cjs:33-41` (electron, narrow).
**Apply to:** `test/hooks-notify.test.cjs` (Notification), `test/renderer-components.test.cjs` (if a
store-coupled component is chosen), and **deliberately NOT** to `test/db-fts.test.cjs`.

```js
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { /* only the surface the module under test touches */ }
};
```

Seed **before** calling `loadTs(...)` (`TESTING.md:61`). `load-ts.cjs:28-42`'s `requireElectron()`
asks for the real module first precisely so this wins — and Wave 1's Finding-1 fix must preserve
that property while removing the `require('electron')` call.

### Zero-recurring-cost / no-new-dependency

**Source:** `.planning/PROJECT.md`, restated at `01-RESEARCH.md:1092`.
**Apply to:** every plan. The only additions this phase permits are three **devDependencies**
(`eslint`, `@typescript-eslint/parser`, `eslint-plugin-react-hooks`) plus version bumps of existing
packages. `react-dom` and FTS5 are already present.

---

## No Analog Found

| File | Role | Data flow | Reason / closest thing |
|---|---|---|---|
| `eslint.config.js` | config | — | The repo has never had a linter (`CONVENTIONS.md:30-31`). Closest structural analog: `playwright.config.ts`. Use the literal config at `01-RESEARCH.md:882-902`. |
| the FTS5 migration body | store/migration | CRUD | The `MIGRATIONS` array has exactly **one** entry (`src/main/db.ts:51-69`) and it creates only ordinary tables. There is no `CREATE VIRTUAL TABLE` anywhere in `src/`. The rail is the analog; the FTS5 DDL itself has none in-repo. |
| a main-side **queue** (FLOOR-02a) | store | pub-sub | Nothing in `src/main` owns a renderer-produced queue today. `src/main/delivery.ts`'s tick + `DeliveryDeps` is the closest, and RESEARCH Open Question 3 flags the scoping decision as unresolved. Do not start by porting `useHive.ts:819-968`. |
| responsive sidebar collapse (FLOOR-13) | component | render | **`grep -rn "@media" src/renderer/src` returns exactly one hit** (`global.css:151`, `prefers-reduced-motion`) — verified via UI-SPEC. There is no breakpoint pattern in this codebase. UI-SPEC's contract (drive off the existing `vpWidth` at `App.tsx:222-226`; no `matchMedia`) is the substitute for an analog. |
| a `renderToStaticMarkup` harness | test | transform | No React is rendered anywhere in `test/`. `TESTING.md:163` states the gap explicitly. `test/pty-sanitize.test.cjs` is the closest (it loads a renderer file, but stubs React out rather than using it). |

---

## Metadata

**Analog search scope:** `test/` (all 56 files listed; 11 read), `src/main/{index,hive,hooks,breaker,delivery,db,fs,git,memory}.ts`, `src/shared/providerAutomation.ts`, `src/preload/index.ts`, `src/renderer/src/{components/AgentCard.tsx, components/{ErrorBoundary,BlockedBanner,UpdateBadge,PixelBadge,ProviderLogo,SidebarTabs,ToolWaterfall}.tsx (import lines), hooks/useHiveTasks.ts, design/tokens.css}`, `.github/workflows/ci.yml`.
**Files scanned:** ~40 read in whole or in targeted range; every excerpt above carries its `file:line`.
**Pattern extraction date:** 2026-08-20
