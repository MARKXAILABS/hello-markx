'use strict';
/**
 * BOOT-ORDER GUARD
 *
 * `src/main/floor/boot.ts` declares its singletons as bare `export let X: T;`
 * — DECLARED but UNASSIGNED until `bootFloor()` runs inside `whenReady`. Any
 * use of one of them that is EVALUATED DURING MODULE LOAD therefore reads
 * `undefined` and throws the moment the bundle is evaluated.
 *
 * That is not hypothetical. It shipped:
 *
 *   [main] uncaughtException (kept alive):
 *     TypeError: Cannot read properties of undefined (reading 'setRoutedObserver')
 *     at out/main/index.js:19388
 *
 * `hive.setRoutedObserver(...)` sat at module scope while `hive` is built
 * inside `bootFloor()`. Every launch of the PACKAGED app threw at startup.
 *
 * Why nothing caught it: every other suite loads `src/main/**` through
 * `test/load-ts.cjs`, which stubs `electron` and never evaluates the real
 * module graph in an Electron main process. `npm test`, `npm run typecheck`
 * and `npx eslint` were all green — TypeScript is satisfied because
 * `export let hive: HiveManager` is a legal declaration, and evaluation ORDER
 * is a runtime property it cannot see. Only launching the built binary showed it.
 *
 * THE DISTINCTION THIS GUARD MUST DRAW, and why a grep cannot:
 *
 *   hive.setRoutedObserver(cb);                       // UNSAFE — runs at load
 *   ipcMain.handle('x', () => hive.registry());       // SAFE   — runs later
 *
 * Both are top-level lines. Only an AST can separate them, so this walks the
 * real TypeScript AST and flags a reference only when NO function boundary
 * sits between it and the source root. A brace-depth version of this guard
 * reported 14 false positives on exactly the safe form above.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'src/main/index.ts');
const BOOT = path.join(ROOT, 'src/main/floor/boot.ts');

/** The singletons bootFloor() assigns — read from source so a newly-added one
 *  is covered automatically rather than needing this list edited. */
function bootConstructed() {
  const src = fs.readFileSync(BOOT, 'utf8');
  const sf = ts.createSourceFile(BOOT, src, ts.ScriptTarget.Latest, true);
  const names = new Set();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    const isExported = (st.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isLet = (st.declarationList.flags & ts.NodeFlags.Let) !== 0;
    if (!isExported || !isLet) continue;
    for (const d of st.declarationList.declarations) {
      // Only bindings with NO initializer are the trap. An initialized
      // `export let x = ...` is assigned at load and is safe.
      if (!d.initializer && ts.isIdentifier(d.name)) names.add(d.name.text);
    }
  }
  return names;
}

/** True when a function/class boundary separates `node` from the file root —
 *  i.e. the code does not execute during module evaluation. */
function isDeferred(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (
      ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) || ts.isMethodDeclaration(p) ||
      ts.isConstructorDeclaration(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p) ||
      ts.isClassDeclaration(p) || ts.isClassExpression(p)
    ) return true;
  }
  return false;
}

test('boot.ts still declares unassigned `export let` singletons (this guard\'s premise)', () => {
  const names = bootConstructed();
  assert.ok(
    names.size >= 5,
    `expected several unassigned \`export let\` singletons in boot.ts, found ${names.size}. ` +
    'If that pattern changed, REWRITE this guard rather than deleting it — the failure it ' +
    'prevents is a startup crash visible only in the packaged app.'
  );
  assert.ok(names.has('hive'), '`hive` is no longer an unassigned `export let` in boot.ts — re-derive this guard');
});

test('no boot-constructed singleton is evaluated during module load of index.ts', () => {
  const names = bootConstructed();
  const src = fs.readFileSync(INDEX, 'utf8');
  const sf = ts.createSourceFile(INDEX, src, ts.ScriptTarget.Latest, true);
  const offenders = [];

  (function walk(node) {
    if (ts.isIdentifier(node) && names.has(node.text) && !isDeferred(node)) {
      const p = node.parent;
      // Only a DEREFERENCE is unsafe (`hive.x`, `hive[x]`). A bare mention in
      // an import clause or a type position never reads the value.
      const deref =
        (ts.isPropertyAccessExpression(p) && p.expression === node) ||
        (ts.isElementAccessExpression(p) && p.expression === node);
      if (deref) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        offenders.push(`  src/main/index.ts:${line + 1}  ${src.split('\n')[line].trim().slice(0, 100)}`);
      }
    }
    ts.forEachChild(node, walk);
  })(sf);

  assert.deepStrictEqual(
    offenders, [],
    'Boot-constructed singleton evaluated during module load of src/main/index.ts.\n' +
    'These are unassigned `export let X;` in src/main/floor/boot.ts — undefined until\n' +
    'bootFloor() runs inside whenReady. Reading one at load throws on every launch of\n' +
    'the PACKAGED app, while npm test / typecheck / eslint all stay green.\n' +
    'Move the call into the post-boot wiring beside wirePtyExitHandler().\n\n' +
    offenders.join('\n')
  );
});
