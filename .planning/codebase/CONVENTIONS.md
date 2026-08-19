# Coding Conventions

**Analysis Date:** 2026-08-20

## Naming Patterns

**Files:**
- `src/main/*.ts` — one module per subsystem, camelCase filenames matching the primary export's domain: `hive.ts` (`HiveManager`), `accountPool.ts` (`AccountPoolManager`), `webhook.ts` (`WebhookServer`), `fs.ts` (path/file helpers). Two `.cjs` files live alongside the TS ones (`kg-core.cjs`, `slack-trigger.cjs`) where a CommonJS entry point is required at runtime.
- `src/renderer/src/components/*.tsx` — PascalCase, one component per file: `AgentCard.tsx`, `OnboardingWizard.tsx`, `GitTab.tsx`.
- `src/renderer/src/hooks/*.ts` — `use`-prefixed camelCase: `useHive.ts`, `useClaudeAccountPool.ts`, `useRestoreTeam.ts`.
- `src/shared/*.ts` — camelCase, cross-process types/logic shared by main and renderer via the `@shared/` alias: `claudeAccountPool.ts`, `providerAutomation.ts`, `heroPayload.ts`.
- `test/*.test.cjs` — `<area>.test.cjs`, kebab-case, named after the subsystem under test, not the source file 1:1: `hive-durability.test.cjs`, `pty-sanitize.test.cjs`, `net-binding.test.cjs`. Several source files have more than one test file (`hive.ts` is covered by `hive-durability`, `hive-protocol-v2`, `hive-cwd`, `hive-task-mutation`, etc.) grouped by concern/issue, not by file.

**Functions:**
- camelCase throughout, verb-first for actions (`safeJoin`, `readFileText`, `worktreeHasUnintegratedWork`, `isWithinRoots`), `is`/`has` prefix for booleans (`isAllowedExternalUrl`, `isWithinRoots`).
- IPC channel names are `domain:action` strings, colon-namespaced: `pty:spawn`, `pty:write`, `hive:deliveryVeto`, `app:copyToClipboard`, `fs:writeFile`, `config:get`. New IPC handlers should follow this scheme — see the `ipcMain.handle('domain:action', …)` calls throughout `src/main/index.ts`.

**Variables:**
- camelCase. Short, local, and disposable in tests (`h`, `svc`, `t`); descriptive in source (`absRoot`, `torn`, `bounced`).

**Types:**
- PascalCase for `interface`/`type`/`class`: `HiveMessage`, `AgentMeta`, `RegistryAgent`, `TaskLedger`, `HiveManager` (`src/main/hive.ts`).
- Discriminated result unions are the standard return shape for fallible operations — see Error Handling below.

## Code Style

**Formatting:**
- **No formatter configured.** No `.prettierrc*`, no `prettier` dependency, no format-on-save config anywhere in the repo. Formatting is by convention/eye, not enforced.

**Linting:**
- **No linter configured.** No `.eslintrc*`, `eslint.config.*`, no `eslint` package in `package.json` dependencies. There is no `npm run lint` script.
- Despite this, **13 orphaned `eslint-disable` comments** remain in source from before ESLint was removed (or never wired up):
  - `src/main/knowledge.ts:22`, `src/main/nodeInstall.ts:58`, `src/main/slack.ts:30` — `@typescript-eslint/no-var-requires` / `no-require-imports`
  - `src/renderer/src/ide/monaco.ts:29` — `@typescript-eslint/no-explicit-any`
  - Seven `react-hooks/exhaustive-deps` disables in renderer components/hooks: `GitTab.tsx:84`, `MemoryGraphPanel.tsx:108`, `OnboardingWizard.tsx:179`, `TerminalView.tsx:80`, `triggers/SchedulesSection.tsx:184`, `triggers/WebhooksSection.tsx:149`, `hooks/useRestoreTeam.ts:252`, `ide/IdePanel.tsx:278`, `realtime/CompletionToast.tsx:80`
  - These comments are inert (no linter reads them) — do not treat their presence as evidence a rule is enforced. If adding a linter, audit these sites first; several mark real intentional dependency-array omissions.
- The only enforced gate is the **TypeScript compiler** in `strict: true` mode (`tsconfig.node.json`, `tsconfig.web.json`), run via `npm run typecheck` (`tsc --noEmit`, split into a node project and a web project). This is a hard CI gate (`.github/workflows/ci.yml`, `typecheck` job) — treat type errors as build breaks, since there is no separate lint gate to catch style/logic issues.

## Import Organization

**Order:** No enforced order (no import-sorting tool). Observed convention: Node builtins first (`node:fs`, `node:path`, `node:os`), then third-party packages, then local relative/aliased imports — see `src/main/fs.ts` and `src/main/hive.ts` for the pattern.

**Path Aliases** (renderer + shared only, `tsconfig.web.json`):
- `@/*` → `src/renderer/src/*`
- `@brand/*` → `docs/*` (brand assets — see `test/build-assets.test.cjs`, which verifies every `@brand/*` asset import resolves to a committed file)
- `@shared/*` → `src/shared/*`
- `src/main` has no bundler and no path aliases — it compiles straight through `tsc`/`electron-vite`'s node build, so imports there are relative (`../shared/imageTypes`) or bare package names. Tests reproduce the `@shared/` alias manually in `test/load-ts.cjs`'s `resolveTs()`.

## Error Handling

**No custom Error subclasses anywhere in `src/`** (`grep -rn "extends Error"` returns nothing). Two patterns cover essentially all fallible operations:

1. **Discriminated result objects** for anything an IPC handler or async operation can fail at — the standard shape is `{ ok: true; ...data } | { ok: false; error: string }`. Example, `src/main/fs.ts`:
   ```ts
   export async function readFileText(root: string, rel: string): Promise<{
     ok: true; content: string; path: string; size: number;
   } | { ok: false; error: string }> {
     const abs = safeJoin(root, rel);
     if (!abs) return { ok: false, error: 'path escapes root' };
     try {
       ...
       return { ok: true, content: buf.toString('utf8'), path: abs, size: s.size };
     } catch (e) {
       return { ok: false, error: e instanceof Error ? e.message : String(e) };
     }
   }
   ```
   Callers branch on `.ok`, never on a thrown exception, at the IPC boundary.

2. **Fail-safe guards return a verdict object**, biased toward the safer outcome when the check itself cannot be completed — see `worktreeHasUnintegratedWork` (`src/main/git.ts`, documented in `docs/adr/0003-fail-safe-worktree-gc.md`): a git query that errors returns `keep: true`, never throws and never silently proceeds as if it were safe.

**`e instanceof Error ? e.message : String(e)`** is the repo-wide idiom for narrowing a caught `unknown`/`any` into a string — used throughout `src/main/fs.ts` and elsewhere. Use it rather than assuming `e.message` exists.

**Never throw across an IPC boundary** to communicate an expected failure (missing file, bad path, invalid input) — return an `{ ok: false, error }` value instead. Reserve actual `throw` for programmer errors / truly unexpected states (e.g. `test/load-ts.cjs` throws on a TypeScript transpile diagnostic, because that is a broken test file, not a runtime condition).

## Comments

**This is the codebase's defining convention: comments explain WHY, at length, especially for anything subtle** — race conditions, platform quirks, security invariants, prior incidents. This habit is load-bearing and should be preserved when adding or modifying code, not trimmed for brevity.

Characteristic shape: a doc-comment above a function states not just what it does but *why it exists*, often citing the issue number that drove it and the failure mode it replaces. Examples:

- `src/main/fs.ts`, `expandTilde()` — a 20-line comment explaining why `normalize()` is used instead of `resolve()`, tracing through a real Windows drive-letter bug (a rooted-but-driveless path silently inheriting whatever drive the app launched from) and stating that the fix must never anchor to `process.cwd()`.
- `src/main/fs.ts`, `readFileBinary()` — explains why the byte copy is necessary (Node's pooled `Buffer` would otherwise leak adjacent unrelated bytes across the IPC structured-clone boundary).
- `test/load-ts.cjs`'s `requireElectron()` — a comment block walking through exactly why and how twelve `src/main` modules importing `electron` at module scope would break under plain `node --test`, and why the real module must be resolved before the stub.
- `docs/adr/*.md` — four standing decisions extracted verbatim from load-bearing source comments (`docs/adr/0001`–`0004`), specifically so "why is it like this" is discoverable without hunting through git blame. New standing architectural decisions (not simple implementation notes) should get an ADR, following `docs/adr/README.md`'s numbering rule: never renumbered, a reversed decision gets a new record, not an edit.

When writing code here: if a piece of logic exists because of a bug, a race, a platform quirk, or a security requirement, **write the comment that explains the failure it prevents**, ideally citing the issue number. A comment that only restates the code is not this convention; a comment that would let a future reader understand why the "obviously simpler" version is wrong, is.

**JSDoc/TSDoc:** Used liberally on exported functions in `src/main/*.ts`, `/** ... */` block above the signature. Not enforced by tooling — no `typedoc` or JSDoc lint rule — but consistently present on anything non-trivial. Inline `//` comments are used for the "why" narrative inside function bodies, often multi-paragraph.

## Function Design

**Size:** No hard limit; functions range from a few lines (`isAllowedExternalUrl`) to large stateful classes (`HiveManager` in `src/main/hive.ts` is 1000+ lines, a single class covering hive lifecycle, messaging, task ledger and logging — the codebase tolerates large cohesive classes over forcing artificial splits, but keeps the *pure logic* extractable into small standalone functions specifically so it can be unit tested without Electron — see `main-hardening.test.cjs`'s comment: "index.ts was untestable precisely because every guard used to be inline in a handler.")

**Parameters:** Options objects for anything with more than 2-3 parameters or optional config, e.g. `isAllowedExternalUrl(url: unknown, opts: { settingsDeepLink?: boolean } = {})`. Constructors for stateful classes take a single dependency/config object (see `DeliveryService`, `AccountPoolManager`, `HookServer` — all take an object of injected functions: `liveAgents`, `inbox`, `write`, `emit`, `log`, `now`, `sleep`), which is also what makes them testable with fakes (see TESTING.md).

**Return Values:** Prefer the `{ ok, ... }` discriminated union (see Error Handling) over throwing, for anything an operation can fail at. Prefer returning `null` over throwing for "not found / could not determine" (`safeJoin` returns `null` on a traversal violation; `parseNpmCmdShim` returns `null` for an unrecognized shim shape rather than guessing).

## Module Design

**Exports:** Named exports throughout — no default exports observed in `src/main` or `src/shared`. React components use default exports in `.tsx` files per convention (implied by React/Vite tooling) but shared logic and main-process modules are named-export only, which is what lets tests destructure exactly the functions they need: `const { safeJoin, isWithinRoots, isAllowedExternalUrl } = loadTs('src/main/fs.ts')`.

**Barrel Files:** Not used. No `index.ts` re-export barrels found in `src/main` or `src/shared` — each module is imported directly by path.

---

*Convention analysis: 2026-08-20*
