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
- **ESLint 9 flat config**, `eslint.config.js`, wired as `npm run lint` → `eslint . --max-warnings 0`. Landed by Phase 1 plan 01-21. Exactly **two rules** are enabled, both written longhand with no preset spread anywhere: `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps`. That is deliberate — `eslint-plugin-react-hooks` 7.x's `configs.flat.recommended` carries sixteen rules, fourteen of them React Compiler rules mostly at `error`, and the surface is pinned by a test that asserts through ESLint's **own resolver** rather than by grepping the config source.
- **The 9.x pin is forced, and it is a recorded cost.** `package.json` `engines` is `">=20 <23"`, which admits Node 20.0–20.18 and 22.0–22.12; ESLint 10 refuses to run on those. A gate a contributor cannot run locally is the defect this requirement exists to close. npm flags the whole 9.x line deprecated — a maintenance dist-tag policy, not a security advisory. Unblocking it is a package-wide change: widen `engines.node`, re-check the `">=X <Y"` parser in `test/ci-config.test.cjs`, then `npm i -D eslint@10`.
- **The orphaned disables are resolved.** They were 13 inert comments (no linter read them) at the start of Phase 1. All were decided by the resolver, never by reading code: the 4 `@typescript-eslint/*` disables are **deleted** (that plugin is not installed, so each was itself an ERROR — "Definition for rule not found"), one dead directive was deleted, and the rest are live suppressions each carrying a reviewed reason. **Re-derived at wave 9, not carried forward:**
  - `grep -rc "eslint-disable" src/` sums to **11**
  - `grep -rc "react-hooks/exhaustive-deps" src/` sums to **11** — every remaining disable is one
  - `grep -rc "@typescript-eslint" src/` sums to **0**
  - the eleven sites: `components/agentGroups.ts`, `components/GitTab.tsx`, `components/MemoryGraphPanel.tsx`, `components/OnboardingWizard.tsx`, `components/TerminalView.tsx`, `components/triggers/SchedulesSection.tsx`, `components/triggers/WebhooksSection.tsx`, `hooks/useHive.ts`, `hooks/useRestoreTeam.ts`, `ide/IdePanel.tsx`, `scene/office/OfficeFloor.tsx`
  - the count went **9 → 11** rather than down, because three suppressions were *added* where the rule's own remedy introduces a defect, and one real stale-closure bug was fixed at source so its finding disappeared with its dependency. A suppression here is a decision with a reason beside it, not a silencer.
- The **TypeScript compiler** in `strict: true` mode (`tsconfig.node.json`, `tsconfig.web.json`) remains the other hard gate, run via `npm run typecheck` (`tsc --noEmit`, split into a node project and a web project). Both gates are hard: `.github/workflows/ci.yml`'s `typecheck` job runs the lint step, and neither the step nor the job may swallow it.

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

**Exports:** Named exports throughout — **including `.tsx`**, with no exceptions anywhere in the repo. Measured 2026-08-21: `grep -rl "export default" src/renderer/src --include=*.tsx | wc -l` returns **0**, against 75 `.tsx` files (63 of them under `components/`). Named-export-only is also what lets tests destructure exactly the functions they need: `const { safeJoin, isWithinRoots, isAllowedExternalUrl } = loadTs('src/main/fs.ts')`.

> **Corrected 2026-08-21.** This entry used to say the opposite for `.tsx` — that renderer components followed a default-export convention, *"implied by React/Vite tooling"*. It was inferred from the tooling rather than measured, and it was never true of this repo. It is precisely the shape of claim a downstream agent follows into expecting `.default` on every import and getting `undefined`, in a document those agents are told to read as canonical. Re-measure before restating it.

**Barrel Files:** Not used. No `index.ts` re-export barrels found in `src/main` or `src/shared` — each module is imported directly by path.

---

*Convention analysis: 2026-08-20*
