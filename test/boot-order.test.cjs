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
 *
 * ── POLARITY (MAIN-03) ──────────────────────────────────────────────────────
 * The first version of this guard enumerated the UNSAFE shapes: it flagged
 * `hive.x` / `hive[x]` and nothing else. That is fail-OPEN, and it left three
 * holes wide enough for a verbatim recurrence of the shipped bug:
 *
 *   const { setRoutedObserver } = hive;     // 1. destructuring
 *   hive!.setRoutedObserver(cb);            // 2. non-null assertion bypass
 *   const h = hive;                          // 3. capture-by-value (used later)
 *   new Controller(hive, ...);              //    …and plain argument passing,
 *                                           //    which was LIVE in index.ts
 *                                           //    when MAIN-03 was fixed.
 *
 * Shape 3 is the nastiest: it does not throw at load. It silently freezes
 * `undefined` into a long-lived object, and the crash lands later, in a
 * feature the operator reaches by hand — far from the boot code that caused it.
 *
 * So the polarity is now inverted and the guard is fail-CLOSED: every
 * non-deferred mention of a boot singleton is treated as a runtime value read
 * UNLESS it sits in a position that provably never evaluates (the import that
 * binds it, a re-export, a declaration/property NAME, or any type position).
 * Adding a new unsafe syntax to the language cannot open a hole in that.
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

/** Names `sf` actually imports from `floor/boot`. Intersecting with this keeps
 *  the fail-closed polarity from firing on an unrelated local that merely
 *  shares a name with a singleton (`control`, `memory`, `roster` are generic).
 *  Still zero hardcoding: both halves are derived from source. */
function importedFromBoot(sf) {
  const named = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    if (!/\/boot'?"?$/.test(st.moduleSpecifier.getText(sf).replace(/['"]/g, ''))) continue;
    const bindings = st.importClause && st.importClause.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) named.add(el.name.text);
  }
  return named;
}

/** True when a function/class boundary separates `node` from the file root —
 *  i.e. the code does not execute during module evaluation.
 *
 *  An IMMEDIATELY-INVOKED function is not a boundary: `(() => hive.x())()` runs
 *  during module evaluation exactly like the bare call would, so the walk keeps
 *  climbing through it. */
function isDeferred(node) {
  for (let p = node.parent; p; p = p.parent) {
    const isFn =
      ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) || ts.isMethodDeclaration(p) ||
      ts.isConstructorDeclaration(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p) ||
      ts.isClassDeclaration(p) || ts.isClassExpression(p);
    if (!isFn) continue;
    if (isImmediatelyInvoked(p)) continue;
    return true;
  }
  return false;
}

function isImmediatelyInvoked(fn) {
  let cur = fn;
  while (cur.parent && ts.isParenthesizedExpression(cur.parent)) cur = cur.parent;
  const p = cur.parent;
  return !!p && ts.isCallExpression(p) && p.expression === cur;
}

/** Positions in which an identifier is NOT a runtime value read. Everything
 *  else IS one — that is the fail-closed half of MAIN-03. */
function isValueRead(node) {
  const p = node.parent;
  if (!p) return false;
  // The import/export machinery that binds or re-exports the name.
  if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) ||
      ts.isExportSpecifier(p) || ts.isImportEqualsDeclaration(p)) return false;
  // `foo.hive` / `Ns.hive` — a property called `hive`, not our binding.
  if (ts.isPropertyAccessExpression(p) && p.name === node) return false;
  if (ts.isQualifiedName(p) && p.right === node) return false;
  // A NAME being declared, not a value being read. (`const { hive: h } = o`
  // reads `o`, and `hive` there is o's property name.)
  if (ts.isBindingElement(p) && p.propertyName === node) return false;
  if (p.name === node && (
    ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p) ||
    ts.isPropertySignature(p) || ts.isPropertyDeclaration(p) || ts.isPropertyAssignment(p) ||
    ts.isMethodSignature(p) || ts.isMethodDeclaration(p) || ts.isEnumMember(p) ||
    ts.isFunctionDeclaration(p) || ts.isClassDeclaration(p) || ts.isTypeAliasDeclaration(p) ||
    ts.isInterfaceDeclaration(p)
  )) return false;
  // Anywhere inside a type annotation, `typeof hive` included — never evaluates.
  for (let a = node; a; a = a.parent) if (ts.isTypeNode(a)) return false;
  return true;
}

/** Every load-time read of one of `names` in `src`. Exported shape so the
 *  self-test below can prove each blind spot against synthetic source instead
 *  of trusting that the walk "looks right". */
function loadTimeReads(fileName, src, names) {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true);
  const lines = src.split('\n');
  const hits = [];
  (function walk(node) {
    if (ts.isIdentifier(node) && names.has(node.text) && !isDeferred(node) && isValueRead(node)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      hits.push(`  ${fileName}:${line + 1}  ${lines[line].trim().slice(0, 100)}`);
    }
    ts.forEachChild(node, walk);
  })(sf);
  return hits;
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
  const src = fs.readFileSync(INDEX, 'utf8');
  const sf = ts.createSourceFile(INDEX, src, ts.ScriptTarget.Latest, true);
  const imported = importedFromBoot(sf);
  const names = new Set([...bootConstructed()].filter((n) => imported.has(n)));
  assert.ok(names.has('hive'), 'index.ts no longer imports `hive` from ./floor/boot — re-derive this guard');

  const offenders = loadTimeReads('src/main/index.ts', src, names);

  assert.deepStrictEqual(
    offenders, [],
    'Boot-constructed singleton evaluated during module load of src/main/index.ts.\n' +
    'These are unassigned `export let X;` in src/main/floor/boot.ts — undefined until\n' +
    'bootFloor() runs inside whenReady. Reading one at load either throws immediately on\n' +
    'every launch of the PACKAGED app, or — if the read only PASSES the value on\n' +
    '(`new C(hive)`, `const h = hive`, `const { m } = hive`) — freezes `undefined` into a\n' +
    'long-lived object and crashes later, in whatever feature uses it.\n' +
    'Either way npm test / typecheck / eslint all stay green.\n' +
    'Move the read into the post-boot wiring beside wirePtyExitHandler().\n\n' +
    offenders.join('\n')
  );
});

/**
 * MAIN-03: the guard's own regression test. Each case is a shape that the
 * previous fail-open version silently accepted. If someone later "simplifies"
 * the detector back to matching property access, these go red immediately.
 */
test('the guard catches every load-time read shape, not just direct dereference', () => {
  const names = new Set(['hive']);
  const cases = {
    'direct dereference': 'hive.setRoutedObserver(cb);',
    'destructuring': 'const { setRoutedObserver } = hive;',
    'non-null assertion': 'hive!.setRoutedObserver(cb);',
    'capture-by-value': 'const h = hive;',
    'passed as an argument': 'const c = new Controller(hive, () => 1);',
    'immediately-invoked wrapper': 'void (() => hive.registry())();'
  };
  for (const [label, code] of Object.entries(cases)) {
    assert.strictEqual(
      loadTimeReads('t.ts', code, names).length, 1,
      `guard no longer catches ${label}: ${code}`
    );
  }
});

test('the guard stays quiet on shapes that never read the value at load', () => {
  const names = new Set(['hive']);
  const quiet = {
    'the import that binds it': "import { hive } from './floor/boot';",
    'deferred callback': "ipcMain.handle('x', () => hive.registry());",
    'deferred function body': 'function f() { return hive.registry(); }',
    'class method body': 'class C { m() { return hive.registry(); } }',
    'a same-named property': 'const o = { hive: 1 }; const p = o.hive;',
    'a type position': 'type T = { hive?: number }; let x: typeof hive;',
    'a renamed destructure of something else': 'const { hive: h } = someOtherObject;'
  };
  for (const [label, code] of Object.entries(quiet)) {
    assert.deepStrictEqual(
      loadTimeReads('t.ts', code, names), [],
      `guard false-positives on ${label}: ${code}`
    );
  }
});
