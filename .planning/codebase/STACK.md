# Technology Stack

**Analysis Date:** 2026-08-20

## Languages

**Primary:**
- TypeScript 5.9.3 — 198 `.ts`/`.tsx` files, ~63,730 lines, across `src/main` (Electron main process), `src/preload`, `src/renderer/src` (React UI), `src/shared` (dependency-free code imported by both main and renderer)

**Secondary:**
- CommonJS `.cjs` — sidecar scripts that must load under plain Node (not bundled): `src/main/kg-core.cjs` (knowledge-store core, also shipped standalone as `resources/kg.cjs`), `src/main/slack-trigger.cjs`, `resources/md-slack-reply.cjs`. Also every in-memory "shim" hive.ts writes to disk for a spawned agent (hook shims, proxy-bridge sidecar) is authored as a `.cjs`-flavoured template string inside `src/main/hive.ts` (e.g. `HOOK_SHIM`, `PROXY_BRIDGE_SHIM`, `GROK_HOOK_SHIM`, `AGY_HOOK_SHIM`, `OPENCODE_PLUGIN`, `PI_EXTENSION`) — these run as separate Node processes, not inside Electron main.
- YAML — `.github/workflows/*.yml`, `electron-builder.yml`

## Runtime

**Environment:**
- Node.js 22, pinned three separate ways: `package.json` `engines: ">=20 <23"`, `.nvmrc` = `22`, and `env.NODE_VERSION: "22"` in every GitHub Actions workflow (`ci.yml`, `e2e.yml`, `release.yml`). Node 24 is explicitly excluded — it ships no `better-sqlite3` prebuild and breaks `node-pty`'s winpty gyp build on Windows (documented inline in `ci.yml` and in `CONTRIBUTING.md`).
- Electron 32.3.3 (resolved; `package.json` pins `^32.2.0`) — bundles Node 20 internally for the main process (relevant to `fetch`/`FormData` availability noted in `src/main/freeflow.ts`).

**Package Manager:**
- npm (lockfile: `package-lock.json`, present, 454KB)
- CI installs with `npm ci --ignore-scripts` in the `typecheck`/`test`/`build` jobs of `ci.yml` (native rebuild is done as a separate, explicit step) and a full `npm ci` (scripts on) only in `e2e.yml`, because the Electron smoke test needs `node-pty`/`better-sqlite3` built for the Electron ABI.

## Frameworks

**Core:**
- Electron 32.3.3 — desktop shell; three-process split (main/preload/renderer) built by `electron-vite`
- React 18.3.1 + `react-dom` 18.3.1 — renderer UI (`src/renderer/src`)
- Zustand 4.5.7 — renderer state management
- `node-pty` 1.1.0 — PTY spawning for agent CLIs (`src/main/pty.ts`)
- `better-sqlite3` 11.10.0 — synchronous native SQLite binding (`src/main/db.ts`)

**UI/Editor:**
- `@monaco-editor/react` 4.7.0 + `monaco-editor` 0.52.2 — code editor surface
- `@uiw/react-codemirror` + `@codemirror/*` (lang-css/html/javascript/json/markdown/python/yaml, state, view, language) — secondary editor use
- `@xterm/xterm` 5.5.0 + `@xterm/addon-fit`, `@xterm/addon-unicode11`, `@xterm/addon-webgl` — terminal rendering for spawned agent PTYs
- `pixi.js` 8.18.1 — 2D rendering for the "office floor" avatar/scene view
- `react-markdown` 10.1.0 + `remark-gfm` 4.0.1 — markdown rendering

**Testing:**
- Node's built-in `node --test` runner over `test/*.test.cjs` (55 test files) — no Jest/Vitest/Mocha. `npm test` = `node --test test/*.test.cjs`; `npm run test:focused` runs a named subset (~30 files) for fast local iteration.
- `test/load-ts.cjs` — a custom loader that transpiles `.ts` on the fly via the `typescript` package's `ts.transpileModule` (not `ts-node`/`tsx`) and stubs Electron's `app`/`ipcMain`/etc. for modules that `import { app } from 'electron'` at module scope, so main-process TypeScript can be unit-tested under plain Node without a real Electron binary. Real Electron is preferred when available/injected (see file header comment on `requireElectron()`).
- `@playwright/test` 1.62.1 — Electron E2E smoke test (`e2e/`), driven via Playwright's `_electron` launcher against the built `out/main/index.js` (not a bundled browser). Deliberately excluded from `npm test`; runs in its own CI workflow (`e2e.yml`, Linux/xvfb only).

**Build/Dev:**
- `electron-vite` 2.3.0 (wrapping Vite 5.4.21) — three build targets defined in `electron.vite.config.ts`: `main` (input `src/main/index.ts`), `preload` (input `src/preload/index.ts`), `renderer` (input `src/renderer/index.html`, React plugin, path aliases `@`→`src/renderer/src`, `@shared`→`src/shared`, `@brand`→`docs`)
- `electron-builder` 25.1.8 — packaging (`electron-builder.yml`): NSIS + portable exe on Windows, universal dmg+zip on macOS (Developer ID + notarize via `build/notarize.cjs`), AppImage on Linux
- `@electron/rebuild` 3.7.0 — rebuilds native modules (`node-pty`, `better-sqlite3`) for Electron's ABI; run in `postinstall` and again in CI's `build` job (best-effort there) and in `electron-builder`'s `npmRebuild: true`
- `tools/patch-node-pty-conpty.cjs` — Windows-only postinstall patch applied to `node_modules/node-pty/lib/conpty_console_list_agent.js`; wraps a call that otherwise throws an uncaught `AttachConsole failed` and crashes the whole app (exit 255) when an agent CLI's console is already gone on exit. The patch does a **byte-exact string match** against a specific line in that file — this is the documented reason `node-pty` is pinned to the exact version `1.1.0` (no `^`) in `package.json`: a version bump would silently invalidate the byte-exact match, and the script fails loudly (`process.exit(1)`) rather than silently skipping.
- `typescript` is pinned exact at `5.9.3` (no `^`) in `devDependencies` — for typecheck reproducibility (`npm run typecheck` = `tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json`), consistent with the project's general practice of exact-pinning anything a byte-exact or compiler-exact contract depends on.
- `tools/ensure-pty-perms.cjs`, `tools/patch-node-pty-conpty.cjs` — chained in `postinstall`: `electron-rebuild -f && node tools/ensure-pty-perms.cjs && node tools/patch-node-pty-conpty.cjs`

## Key Dependencies

**Critical:**
- `better-sqlite3` ^11.10.0 (resolved 11.10.0) — synchronous native SQLite; `PersistStore` (`src/main/db.ts`) with `PRAGMA user_version` migrations, WAL mode, `busy_timeout=5000`. Native — `asarUnpack`'d in `electron-builder.yml`.
- `node-pty` 1.1.0 (exact pin) — spawns agent CLI processes as real PTYs (`src/main/pty.ts`). Native — `asarUnpack`'d.
- `@openai/agents-realtime` 0.11.8 — client SDK for the renderer-side OpenAI Realtime voice session ("Realtime Michael")
- `posthog-node` 5.48.2 — outbound anonymous product analytics (`src/main/analytics.ts`), build-time-gated key
- `tunnelmole` ^2.4.0 (resolved 2.4.0) — ESM-only public tunnel client, dynamically `import()`ed at runtime (not statically imported, since main is bundled CJS) from `src/main/slack.ts` and `src/main/webhook.ts`
- `electron-updater` ^6.8.9 — auto-update against GitHub Releases (`src/main/updater.ts`)
- `commit-graph` ^2.4.0 — git commit graph rendering support

**Infrastructure:**
- `@types/better-sqlite3`, `@types/node` 22.7.5, `@types/react`, `@types/react-dom` — typings only
- `@electron/notarize` 2.5.0 — macOS notarization (`build/notarize.cjs`, `afterSign` hook)

## Configuration

**Environment:**
- No `.env` file present in the repo; `.gitignore` excludes `.env`, `.env.local`, `.env.signing` (existence of the exclusion rule only — no secret files were read).
- Build-time environment injected via `electron-vite`'s `define` in `electron.vite.config.ts`: `__APP_VERSION__` (from `package.json`), `__POSTHOG_KEY__` / `__POSTHOG_HOST__` (from `POSTHOG_KEY`/`POSTHOG_HOST` env, set by release CI; empty string in dev/fork builds — this makes `src/main/analytics.ts` a no-op for anyone without the CI secret).
- Runtime app config lives in `HarnessConfig`, persisted as `config.json` under `app.getPath('userData')`, read/written by `src/main/config.ts` (54KB — the largest config surface in the app: agent roster, providers, triggers, integrations metadata, missions, Claude account pool, etc.)
- Secrets (integration tokens, BYOK model-provider keys, Slack signing secret/bot token) are held in a **separate** encrypted file, `integration-secrets.json` under `userData`, via Electron `safeStorage` — never in `config.json`, never over IPC in plaintext. See INTEGRATIONS.md.

**Build:**
- `electron.vite.config.ts` — the electron-vite build config (main/preload/renderer, path aliases, PostHog/version `define`, a `copyMainSidecars()` custom plugin that copies `slack-trigger.cjs` and `kg-core.cjs` next to the compiled main bundle post-build, since Rollup neither bundles nor copies `require()`'d `.cjs` sidecars)
- `tsconfig.json` — root project-references file only (`files: []`, references `tsconfig.node.json` + `tsconfig.web.json`)
- `tsconfig.node.json` — main/preload/shared: `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `strict: true`, types `["node", "electron-vite/node"]`
- `tsconfig.web.json` — renderer/shared: adds `lib: [DOM, DOM.Iterable, ES2022]`, `jsx: react-jsx`, path aliases mirroring the Vite config (`@/*`, `@brand/*`, `@shared/*`)
- `electron-builder.yml` — packaging config: `appId: com.markxailabs.hellomarkx`, GitHub-provider publish block (`MARKXAILABS/hello-markx`), `hellomarkx://` protocol registration, `asarUnpack` for `node-pty`/`better-sqlite3`, `extraResources` shipping `md-slack-reply.cjs`, `kg.cjs`+`kg-core.cjs`, and `resources/skills` outside the asar so spawned agent processes (plain `node`, no Electron) can `require()`/read them directly

## Platform Requirements

**Development:**
- Node 22 (`.nvmrc`), npm
- Windows: portable Node build + Visual Studio 2019 Spectre/ClangCL components required to compile `node-pty`'s native module (documented in the project's Windows build-environment memory; not in-repo)
- Python 3.11 pinned for `node-gyp` on Linux CI (`ci.yml`, `e2e.yml`) — Python ≥3.12 dropped `distutils`, which `node-gyp` needs
- `gh` CLI expected on `PATH` for `src/main/github.ts`'s issue/CI-run listing (shells out; degrades to an error result if absent, never throws)

**Production:**
- Desktop targets: Windows (NSIS installer + portable exe, x64), macOS (universal dmg + zip, Developer ID signed + best-effort notarized), Linux (AppImage, x64)
- Windows code signing: Azure Trusted Signing, wired in `.github/workflows/release.yml` only (not in `electron-builder.yml`, to avoid breaking `npm run dist:win` for contributors without the org's Entra credentials) — unsigned installers ship (SmartScreen warning) until the five `AZURE_*` secrets are present
- macOS notarization: best-effort via root-level `afterSign: build/notarize.cjs`, no-ops without `APPLE_*` env
- Auto-update: `electron-updater` against GitHub Releases (`latest*.yml` + zip/blockmaps uploaded by `release.yml`); a portable-exe/error fallback path polls `releases/latest` and offers only "open the releases page" (notify-only, no self-install)

---

*Stack analysis: 2026-08-20*
