# Contributing to Hello MarkX

This guide covers setup, the gotchas, and the conventions that keep the codebase
coherent.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.

## Development setup

### Prerequisites

- **macOS, Windows, or Linux.**
- **Node.js 20 or 22** and npm. Node 24 is not supported yet: `better-sqlite3`
  ships no prebuilt binary for it and `node-pty`'s winpty build fails under it.
- A **C/C++ toolchain** for the native addons (`node-pty`, `better-sqlite3`):
  - macOS: `xcode-select --install`
  - Windows: Visual Studio 2019/2022 Build Tools with the **C++ workload**, the
    **Spectre-mitigated libraries** (winpty needs them) and the **ClangCL toolset**
    (`better-sqlite3` uses it). If `npm install` fails inside winpty's
    `GetCommitHash.bat`, make sure the `NoDefaultCurrentDirectoryInExePath`
    environment variable is **not** set in that shell.
  - Linux: `build-essential` + `python3`.
- At least one agent CLI on your `PATH` (Claude Code is the default) if you want
  agents to actually run.

### Install & run

```bash
git clone https://github.com/MARKXAILABS/hello-markx.git
cd hello-markx
npm install        # postinstall rebuilds node-pty against Electron's ABI
npm run dev        # live-reloading Electron build
```

> [!IMPORTANT]
> **The most common setup failure is the native rebuild.** The `postinstall`
> script runs `electron-rebuild` so `node-pty` and `better-sqlite3` match Electron's
> ABI. If you see a "wrong ELF/Mach-O" or "NODE_MODULE_VERSION" error at launch,
> re-run `npm install` after confirming your toolchain is installed.

## Before you open a PR

1. **Keep the type-checker green:** `npm run typecheck` (node + web TS projects).
2. **Run the tests:** `npm run test:focused`. On Windows a small set of POSIX-path
   tests is known to fail; say so in the PR if you hit them.
3. **Confirm a production build works:** `npm run build`.
4. **Match the aesthetic.** Any new UI **must** derive from the design tokens in
   [`DESIGN.md`](./DESIGN.md) / `src/renderer/src/design/tokens.ts` — no ad-hoc
   colors, spacing, or fonts. `tokens.ts` and `tokens.css` are mirrored; if you
   change one, change both.
5. **For anything visual, include a screenshot or short clip** in the PR.

## Project layout

| Path | What lives there |
|---|---|
| `src/main/` | Electron main process — PTYs (`pty.ts`), fs/git bridges, the hive (`hive.ts`, `hooks.ts`, `memory.ts`), config, updater, triggers. |
| `src/preload/` | Context-bridge IPC surface (`window.cth`). |
| `src/renderer/` | React UI, Pixi.js office scene (`scene/office/`), components, design system, stores. |
| `src/shared/` | Types and pure logic shared by main and renderer. |
| `test/` | `node:test` unit tests (`*.test.cjs`). |
| `tools/mapgen/` | Python helpers for building/rendering the Tiled office map. |

See the [Architecture](./README.md#architecture) section of the README for the
data-flow overview, and [`HIVE.md`](./HIVE.md) for the multi-agent design.

## Commit & PR conventions

- Branch off `main`; keep PRs focused on one change.
- Write a clear PR description of *what* changed and *why*.
- Don't commit `node_modules/`, `out/`, or built artifacts (already gitignored).

## A note on assets

The bundled pixel art is under the **LimeZu FREE VERSION license
(non-commercial only)** — see [`ATTRIBUTION.md`](./src/renderer/src/assets/ATTRIBUTION.md).
If you contribute new art, it must be either your own work or compatibly
licensed, and you must add it to `ATTRIBUTION.md`. Don't add commercial-only or
unlicensed assets.
