'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const cache = new Map();

/**
 * How `electron` is resolved for a module under test (issue #55).
 *
 * Twelve modules under src/main import `electron` at module scope, so merely loading one
 * for a unit test pulls it in. In plain Node that is never the Electron API: electron's
 * entry point resolves to the *path string* of the binary, and on a machine where the
 * binary was never downloaded — which is every CI runner, because we install with
 * `npm ci --ignore-scripts` — it throws "Electron failed to install correctly".
 *
 * That is not a cosmetic failure. A file that cannot load is a file whose tests silently
 * do not exist, which is why the three CI platforms used to collect three different test
 * counts (357 / 343 / 287) and "the suite passes" meant something different on each.
 *
 * Order matters: ask for the REAL module first so a test that injects the API into
 * require.cache still wins (test/config-secrets.test.cjs does exactly that, and needs its
 * own userData dir). Only when that yields no usable object do we fall back to the stub
 * below, whose job is to let modules LOAD — not to make them behave. Anything a test needs
 * to assert on should be injected, not reached through the stub.
 */
function requireElectron() {
  try {
    const real = require('electron');
    // A test that needs real behaviour injects the API into require.cache before calling
    // loadTs (see test/config-secrets.test.cjs) — that path must win, so we ask for the
    // real module FIRST and only fall back below. Outside Electron an uninjected
    // `require('electron')` resolves to the binary's PATH STRING, not the API, which is
    // useless to a module doing `import { app } from 'electron'` — hence the typeof check.
    if (real && typeof real === 'object') return real;
  } catch {
    // "Electron failed to install correctly" — the binary was never downloaded, which is
    // exactly what `npm ci --ignore-scripts` gives every CI runner.
  }
  return electronStub();
}

function electronStub() {
  const tmpRoot = path.join(require('node:os').tmpdir(), 'md-electron-stub');
  const app = {
    // The one member with real behaviour, because callers use the value.
    getPath: (name) => path.join(tmpRoot, String(name)),
    getName: () => 'hello-markx',
    getVersion: () => '0.0.0-test',
    isPackaged: false,
  };
  // Unmodelled members are no-ops rather than throwers: several modules call things like
  // ipcMain.handle() at module scope, and a throw there would fail the load we are trying
  // to make possible. A test that needs real behaviour must inject it.
  const noop = () => new Proxy(() => undefined, { get: () => noop() });
  return new Proxy(
    { app },
    { get: (target, prop) => (prop in target ? target[prop] : noop()) }
  );
}

function resolveTs(fromDir, request) {
  const base = request.startsWith('@shared/')
    ? path.resolve(__dirname, '..', 'src/shared', request.slice('@shared/'.length))
    : path.resolve(fromDir, request);
  for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function loadFile(filename) {
  const cached = cache.get(filename);
  if (cached) return cached.exports;
  const source = fs.readFileSync(filename, 'utf8');
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
    fileName: filename,
    reportDiagnostics: true
  });
  if (output.diagnostics?.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(output.diagnostics, {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: (name) => name,
      getNewLine: () => '\n'
    }));
  }
  const mod = { exports: {} };
  cache.set(filename, mod);
  const localRequire = (request) => {
    if (request === 'electron') return requireElectron();
    if (request.startsWith('.') || request.startsWith('@shared/')) {
      const resolved = resolveTs(path.dirname(filename), request);
      if (resolved) return loadFile(resolved);
    }
    return require(request);
  };
  const run = new Function('module', 'exports', 'require', '__filename', '__dirname', output.outputText);
  run(mod, mod.exports, localRequire, filename, path.dirname(filename));
  return mod.exports;
}

/** Load a TypeScript module and its local TypeScript imports for node:test. */
module.exports = function loadTs(relativePath) {
  return loadFile(path.resolve(__dirname, '..', relativePath));
};
