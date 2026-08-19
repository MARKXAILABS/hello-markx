# Contributing to Hello MarkX

This guide covers setup, the gotchas, and the conventions that keep the codebase
coherent.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.

## Development setup

### Prerequisites

- **macOS, Windows, or Linux.** CI type-checks, builds, and runs the full test
  suite on all three.
- **Node.js 20 or 22** and npm — enforced by `"engines": { "node": ">=20 <23" }`
  in `package.json`. `.nvmrc` pins **22**, which is the version CI runs, so
  `nvm use` gets you the supported one. Node 24 is **not** supported:
  `better-sqlite3` ships no prebuilt binary for it and `node-pty`'s winpty build
  fails under it.
- A **C/C++ toolchain** for the native addons (`node-pty`, `better-sqlite3`):
  - macOS: `xcode-select --install`
  - Windows: see [Windows prerequisites](#windows-prerequisites) below.
  - Linux: `build-essential` + `python3`.
- At least one agent CLI on your `PATH` (Claude Code is the default) if you want
  agents to actually run.

### Windows prerequisites

The native rebuild is the one genuinely fiddly part of setup on Windows, and it
fails with opaque node-gyp output, so here is the exact list.

**Use Node 22, not 24.** Node 24 has no `better-sqlite3` prebuild and breaks
`node-pty`'s winpty gyp build. `nvm use` reads `.nvmrc`.

**Visual Studio 2019 or 2022 Build Tools**, C++ workload, plus three components
that are *not* selected by default:

| Component ID | Needed by |
|---|---|
| `Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre` | `node-pty` — winpty links against the Spectre-mitigated CRT |
| `Microsoft.VisualStudio.Component.VC.Llvm.Clang` | `better-sqlite3` — it builds with the ClangCL toolset |
| `Microsoft.VisualStudio.Component.VC.Llvm.ClangToolset` | `better-sqlite3` — the MSBuild integration for the above |

Installable in one shot:

```powershell
vs_BuildTools.exe --quiet --wait --norestart `
  --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended `
  --add Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre `
  --add Microsoft.VisualStudio.Component.VC.Llvm.Clang `
  --add Microsoft.VisualStudio.Component.VC.Llvm.ClangToolset
```

**If `npm install` dies inside winpty's `GetCommitHash.bat`,** make sure the
`NoDefaultCurrentDirectoryInExePath` environment variable is **not** set in that
shell. That batch file calls `git` with a bare name and relies on the current
directory being searched.

**If `postinstall` fails with `[patch-node-pty-conpty] node-pty … no longer
contains the expected line`,** do not skip it. `node-pty` is pinned to an exact
version because `tools/patch-node-pty-conpty.cjs` matches a byte-exact line in
its source; that message means a bump moved the line and the Windows crash guard
it applies is no longer being applied.

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
2. **Run the tests:** `npm test` runs everything in `test/`. (`npm run
   test:focused` is a hand-picked subset for tight edit loops — handy, but never
   the thing you gate a PR on: a hand-written file list is how eight test files
   went unrun for months.)

   **Known Windows baseline:** 11 tests fail on Windows today, all of them
   POSIX-path assumptions in the tests rather than bugs in the source —
   `cli-install-ladder`, `codex-remote`, `expand-tilde` and
   `transcript-project-dir`. That is issue #7, not something you broke. CI marks
   the Windows job non-blocking for exactly those; Linux and macOS are hard gates.
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
