#!/usr/bin/env node
'use strict';
/**
 * electron-builder 26 packaging guard, re-applied on every install (postinstall).
 * No-op when app-builder-lib is absent or already patched.
 *
 * app-builder-lib 26 replaced v25's filesystem walk (out/util/NodeModuleCopyHelper.js)
 * with a graph walk over the yarn-style hoister result:
 * `out/node-module-collector/nodeModulesCollector.js` -> `_getNodeModules()`.
 * That method is `async` and recurses into `d.dependencies` with **no visited set**,
 * so a self-referential package makes it recurse forever. Because it is async, each
 * level unwinds the JS stack into a microtask instead of overflowing it, so the
 * symptom is not a RangeError — it is
 *
 *     FATAL ERROR: Ineffective mark-compacts near heap limit
 *     Allocation failed - JavaScript heap out of memory
 *
 * after `• searching for node modules  pm=npm searchDir=<repo>`, and it does not go
 * away with --max-old-space-size (measured here at 4 GB, 6 GB and 8 GB).
 *
 * THIS repo trips it because `tunnelmole@2.4.0` — the newest published version —
 * declares `"dependencies": { "tunnelmole": "^2.1.6" }`, i.e. it depends on itself.
 * electron-builder's own log names it: `tunnelmole@2.4.0` appears in the
 * "duplicate dependency references" list. Nothing in this repo can remove that
 * edge: npm `overrides` cannot delete a dependency, and there is no later
 * tunnelmole to move to.
 *
 * Without this guard `npm run dist`, `dist:win`, `dist:mac`, `dist:linux` and
 * .github/workflows/release.yml's `npx electron-builder` step all die. With it,
 * `electron-builder --win --dir` completes in ~2s of collection instead of OOM-ing
 * after 100+ seconds.
 *
 * The guard is a cycle guard, NOT a memo: `seen` tracks the current recursion PATH,
 * so a package legitimately reachable by several paths is still emitted under each.
 *
 * WHY THIS EXITS 0 ON A MISSING ANCHOR, unlike tools/patch-node-pty-conpty.cjs.
 * That tool exits 1 on drift because node-pty rewriting its line means a Windows
 * build that takes the whole app down at run time — silent and catastrophic. Here
 * the anchor going missing most likely means app-builder-lib FIXED this upstream,
 * and failing every install (including CI's) over an upstream fix would be the
 * worse outcome. The failure this guards is also loud on its own: packaging OOMs
 * in the open. So: warn clearly, exit 0, and let a human retire this file.
 */
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const target = join(
  __dirname, '..', 'node_modules', 'app-builder-lib', 'out',
  'node-module-collector', 'nodeModulesCollector.js'
);
if (!existsSync(target)) process.exit(0);   // devDependencies not installed

const src = readFileSync(target, 'utf8');
const APPLIED = 'async _getNodeModules(dependencies, result, seen = new Set()) {';
if (src.includes(APPLIED)) process.exit(0);

const SIGNATURE = '    async _getNodeModules(dependencies, result) {';
const RECURSE =
  '            if (d.dependencies.size > 0) {\n' +
  '                node.dependencies = [];\n' +
  '                await this._getNodeModules(d.dependencies, node.dependencies);\n' +
  '            }';

if (!src.includes(SIGNATURE) || !src.includes(RECURSE)) {
  const version = require(join(__dirname, '..', 'node_modules', 'app-builder-lib', 'package.json')).version;
  console.warn(
    `[patch-electron-builder-cycle] app-builder-lib ${version} no longer matches the\n` +
    '  expected _getNodeModules() body. If the unguarded recursion is gone upstream,\n' +
    '  DELETE this file and its postinstall entry. If packaging still dies with\n' +
    '  "Ineffective mark-compacts near heap limit" after "searching for node modules",\n' +
    '  re-derive the patch against the new source.'
  );
  process.exit(0);
}

const patched = src
  .replace(SIGNATURE, '    async _getNodeModules(dependencies, result, seen = new Set()) {')
  .replace(
    RECURSE,
    '            if (d.dependencies.size > 0 && !seen.has(d)) {\n' +
    '                node.dependencies = [];\n' +
    '                await this._getNodeModules(d.dependencies, node.dependencies, new Set(seen).add(d));\n' +
    '            }'
  );

writeFileSync(target, patched);
console.log('[patch-electron-builder-cycle] guarded _getNodeModules against self-referential deps (tunnelmole)');
