'use strict';

/**
 * VIGIL-03, the integration half: an agent parked on a permission prompt is
 * detected in a process with **no renderer module loaded at all**.
 *
 * D-28's warning is the reason this file exists: *"a plan that marks VIGIL-03
 * green by pointing at `stopArmDecision` has marked an unreachable branch
 * green."* `stopArmDecision` (`useHive.ts:169`) only reacts to an agent that is
 * ALREADY blocked, and blocked-ness used to be set by `usePtyParser`, which sees
 * only the MOUNTED terminal (`terminalPool.ts:59` has a single `onData` slot
 * "set by whichever view is mounted"). On a headless floor
 * (`src/main/floor/headless.ts`) that parser does not exist at all.
 *
 * So the claim under test is not "the matcher matches" — `delivery-main.test.cjs`
 * already pins the matcher's three bounds against string fixtures. The claim here
 * is the WIRING that `boot.ts:1092` ships:
 *
 *     matchBlockHint(ptyManager.outputTail(ptyId)) !== null
 *
 * driven through a REAL `PtyManager` session, with the mechanical proof that the
 * module graph carrying it holds nothing from `src/renderer`.
 *
 * The PTY is driven by swapping `node-pty`'s `spawn` for a fake child — the
 * in-repo precedent is `test/runtime-forget.test.cjs:152-170`. `pty.spawn` is
 * looked up on the module object at call time, so a property swap is enough, and
 * it exercises the REAL `onData` path (guard + ring), not a hand-built session
 * object. That matters: the ring is what `outputTail` reads, and the ring is
 * documented at `pty.ts:64-71` as recorded *"whether or not a renderer is
 * listening"* — which is the whole property this file is here to prove.
 *
 * Not platform-gated. Every case below runs identically on win32 and POSIX, so
 * `test/suite-integrity.test.cjs`'s declared census and its platform floor are
 * both untouched by this file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { PtyManager } = loadTs('src/main/pty.ts');
const { matchBlockHint } = loadTs('src/shared/blockHints.ts');

const AGENT = 'agent-1';

/**
 * A live `PtyManager` session with a fake child on the other end.
 *
 * `blocked()` is `boot.ts:1092` verbatim — the production composition root's own
 * expression, not a re-derivation of it. If that line changes shape, this helper
 * has to change with it, which is the point.
 */
function livePty(t) {
  const nodePty = require('node-pty');
  const realSpawn = nodePty.spawn;
  let emit = null;
  nodePty.spawn = () => ({
    pid: 0,
    cols: 80,
    rows: 24,
    onData: (cb) => { emit = cb; },
    onExit: () => {},
    kill: () => {},
    write: () => {},
    resize: () => {}
  });
  t.after(() => { nodePty.spawn = realSpawn; });

  const manager = new PtyManager();
  // An absolute, existing path bypasses resolveCommand's `where`/`which` probe.
  const res = manager.spawn({ id: AGENT, cwd: process.cwd(), command: process.execPath });
  assert.equal(res.ok, true, res.error);
  assert.equal(typeof emit, 'function', 'the fake child never handed over its data callback');

  // No attachWebContents and no owner: `safeSend` drops every chunk, exactly like
  // a floor with no window. The ring must still have them.
  return {
    emit: (chunk) => emit(chunk),
    tail: () => manager.outputTail(AGENT),
    blocked: () => matchBlockHint(manager.outputTail(AGENT))
  };
}

test('an agent parked on a prompt is detected with no renderer module in the process', (t) => {
  const pty = livePty(t);
  pty.emit('● Bash npm test\r\n');
  pty.emit('Do you want to proceed?\r\n❯ 1. Yes\r\n  2. No\r\n');

  // Newest matching line wins: a TUI repaints its whole frame, and the line the
  // agent is sitting on is the last one printed.
  assert.equal(
    pty.blocked(), '❯ 1. Yes',
    'an agent sitting on an approval menu was not detected from main’s own tail ring'
  );

  // ── the mechanical proof of "no renderer attached" ───────────────────────────
  const cacheKeys = Object.keys(require.cache);

  // Positive lower bound FIRST (D-33/D-40): a scan over an empty cache would
  // satisfy every negative below without proving anything at all.
  assert.ok(cacheKeys.length > 0, 'require.cache is empty — the negatives below are vacuous');
  assert.ok(
    cacheKeys.some((k) => /node-pty/.test(k)),
    'node-pty is not in require.cache, so this scan is not looking at the graph that just ran'
  );

  assert.deepEqual(
    cacheKeys.filter((k) => /renderer/i.test(k)), [],
    'a renderer module was loaded into the process that just detected a blocked agent — '
    + 'the detection under test is not the main-side one'
  );

  // The scan above is NECESSARY BUT NOT SUFFICIENT, and saying so here is the
  // only thing that stops it being trusted for more than it proves:
  // `test/load-ts.cjs` keeps its OWN module cache (`load-ts.cjs:7`, `:117`) and
  // never touches require.cache, so a `.ts` file under src/renderer pulled in
  // through loadTs would NOT appear above. What it cannot hide is the renderer's
  // runtime dependencies: loadTs resolves bare specifiers with a plain
  // `require` (`load-ts.cjs:124`), so react/zustand would land in require.cache
  // the moment any renderer module was loaded through it.
  //
  // MEASURED, not reasoned: loading `src/renderer/src/components/QrCode.tsx`
  // through loadTs leaves **0** keys matching /renderer/i and **4** matching the
  // pattern below. The first scan alone would have passed while a renderer
  // component sat in the process.
  assert.deepEqual(
    cacheKeys.filter((k) => /node_modules[\\/](react|zustand)[\\/]/.test(k)), [],
    'the renderer’s runtime dependencies are loaded, so a renderer module came in through '
    + 'test/load-ts.cjs where the require.cache key scan cannot see it'
  );

  // The remaining hole, closed at the source rather than left implied: a
  // renderer `.ts` that imports neither react nor zustand
  // (`src/renderer/src/store/config.ts` is one — measured: 0 keys on BOTH scans
  // above) would evade both. Nothing in require.cache can see it, so the only
  // place to catch it is this file's own text.
  const self = fs.readFileSync(__filename, 'utf8');
  assert.deepEqual(
    self.match(/loadTs\(\s*['"][^'"]*renderer/g) ?? [], [],
    'this file loads a renderer module through test/load-ts.cjs, which keeps its own cache and '
    + 'leaves no require.cache key — the two scans above cannot see it, so the claim in this '
    + 'test’s name would be false while it passed'
  );
  // Positive lower bound (D-33/D-40) for the scan above: it must be finding
  // loadTs calls at all, or a renamed loader makes it vacuous.
  assert.ok(
    (self.match(/loadTs\(\s*['"]/g) ?? []).length >= 2,
    'the loadTs-call scan found fewer than the two loads at the top of this file — the pattern '
    + 'has stopped matching the loader and the negative above proves nothing'
  );

  // And the tier itself: `usePtyParser` calls `window.clearTimeout` and
  // `window.cth` at module-use time. Neither global exists here.
  assert.equal(typeof globalThis.window, 'undefined', 'a DOM window exists in a main-tier test');
  assert.equal(typeof globalThis.document, 'undefined', 'a DOM document exists in a main-tier test');

  // ── T-04-BLK-12: one list, not two ───────────────────────────────────────────
  // Read as TEXT, deliberately: reading the file is not loading the module, so
  // this assertion cannot itself violate the four above. Two copies of a regex
  // list drift, and the copy that drifts is the one nobody is looking at.
  const hook = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'renderer', 'src', 'hooks', 'usePtyParser.ts'),
    'utf8'
  );
  assert.equal(
    (hook.match(/const BLOCK_HINTS/g) ?? []).length, 0,
    'usePtyParser.ts declares its own BLOCK_HINTS again — a shadow copy of the list is back, and '
    + 'a fix landing in src/shared/blockHints.ts will not reach the renderer'
  );
  assert.ok(
    /@shared\/blockHints/.test(hook),
    'usePtyParser.ts no longer imports the shared list at all — the renderer stopped reading the '
    + 'one list rather than starting to'
  );
});

test('ordinary build output through the same PTY is not a prompt — the positive control', (t) => {
  const pty = livePty(t);
  pty.emit('● Bash npm test\r\n');
  pty.emit('ℹ tests 885\r\nℹ pass 878\r\nℹ fail 0\r\n');

  assert.equal(
    pty.blocked(), null,
    'ordinary build output read as a human prompt — without this case every assertion in this '
    + 'file is satisfied by a detector that returns a match for everything'
  );
  // The control must not pass because the ring was empty.
  assert.ok(pty.tail().includes('tests 885'), 'the tail never recorded the control output');
});

test('the prompt scrolls out of the bounded window and the determination clears itself', (t) => {
  const pty = livePty(t);
  pty.emit('Do you want to proceed? (y/n)\r\n');
  assert.equal(
    pty.blocked(), 'Do you want to proceed? (y/n)',
    'precondition failed: the prompt was never detected, so nothing below tests recovery'
  );

  // Rule V-3's recovery path — "its next real turn-end" — is not a latch that
  // somebody clears, it is the window bound doing it mechanically. Push the
  // prompt PAST RECENT_WINDOW_BYTES (4096, blockHints.ts:74) rather than
  // appending one line, which would prove nothing about the window.
  pty.emit('still working…\r\n'.repeat(600));

  assert.equal(
    pty.blocked(), null,
    'the agent printed 9 KiB past the prompt and still reads as blocked — the determination '
    + 'latched instead of clearing itself, and the known false positive can never recover'
  );

  // The discrimination that makes the assertion above mean what it says: the
  // prompt is STILL in the ring (256 KiB cap, `pty.ts:76`). So it is the
  // matcher's 4 KiB window that cleared the determination, not the tail having
  // dropped the bytes.
  assert.ok(
    pty.tail().includes('Do you want to proceed?'),
    'the ring dropped the prompt, so this case measured the tail cap rather than the window bound'
  );
  assert.ok(pty.tail().length > 4096, 'the fixture never exceeded the window it is meant to overflow');
});

test('a 500-character prompt line is stripped and capped before anything can paint it', (t) => {
  const pty = livePty(t);
  // T-04-BLK-05 / 04-UI-SPEC rule A8: model-controlled text bound for a
  // fixed-width row, arriving the way it really arrives — through the PTY.
  pty.emit(
    '\x1b[2J\x1b]0;agent\x07\x1b[1;32mDo you want to proceed\x1b[0m? '
    + 'x'.repeat(500) + ' (y/n)\r\n'
  );

  const got = pty.blocked();
  assert.ok(got, 'a prompt buried in ANSI never matched at all');
  assert.ok(got.length <= 120, `the returned line is ${got.length} chars — an unbounded model-controlled string reached the row`);
  assert.equal(got.includes('\x1b'), false, 'an escape byte survived into the string a renderer paints');
  // Positive lower bound over the same fixture (D-33/D-40): a cap that returned
  // '' would satisfy both negatives above.
  assert.equal(got.length, 120, 'the cap never engaged — this fixture is 530 characters after stripping');
  assert.match(
    got, /^Do you want to proceed\? x+$/,
    'stripping ran after the cap, leaving a truncated escape sequence in a string React inserts as text'
  );
});
