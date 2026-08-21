'use strict';

/**
 * The repo-fact accumulator for Phase 1 (D-45).
 *
 * Phase 1's premise is that every claim the project makes about itself is true.
 * The reason that needs a test file rather than a review is recorded verbatim in
 * `.planning/codebase/CONCERNS.md` § Method: on 2026-08-20 four issues — #4, #5,
 * #10 and #34 — were called "stale trackers whose code was already fixed", and
 * all four were wrong, because the bar applied was "some code exists" rather
 * than "the issue's stated done". Each was genuinely partial and correctly still
 * open. That is not a reviewer being careless; it is what happens when a claim
 * is graded by reading rather than by running something.
 *
 * So each test here pins ONE such claim, mechanically, so it cannot silently rot
 * back. Clauses are added by later waves — one owner per wave — and the whole
 * file is asserted at the end of the phase. It is a real `node:test` file, so it
 * runs under `npm test` on all three platforms with no extra ceremony.
 *
 * Clauses so far:
 *   • #20 (FLOOR-11) — N independent 5-second polls of one JSON file
 *   • #20 (FLOOR-11) — the shared poller keeps its callers
 *   • #7  (D-45)     — a hand-rolled harness whose assertions cannot fail
 *
 * Everything here greps COMMENT-STRIPPED source. That is mandatory, not
 * tidiness: several Phase 1 fixes deliberately add a comment quoting the very
 * thing they removed (this file's own subject matter included), and a raw grep
 * would match the explanation and fail the correct fix.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const rendererRoot = path.join(root, 'src', 'renderer', 'src');

/**
 * Block and line comments removed. Same intent as the one at
 * test/net-binding.test.cjs:217-232, and load-bearing for the same reason.
 */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Every .ts/.tsx under a directory, as repo-relative POSIX paths. */
function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out;
}

const readStripped = (rel) => stripComments(fs.readFileSync(path.join(root, rel), 'utf8'));

// The one file allowed to own a hiveTasks timer: it IS the shared poller.
const POLLER = 'src/renderer/src/hooks/useHiveTasks.ts';

/**
 * Files that read `hiveTasks(` one-shot AND happen to run timers for unrelated
 * things, so the per-file rule below cannot adjudicate them by shape alone.
 * Each is pinned by its exact call-site COUNT instead: a new read appearing in
 * one of these is what a regression would look like, and it forces a human to
 * look at whether the new read is on a timer.
 *
 * `hooks/useHive.ts` — its single `hiveTasks()` lives in `ensureSlackCard()`, a
 * per-delivered-message promotion, and none of its six `setInterval`s touch it
 * (they are the nudge poll, the veto report, the feed flush and the 30s terminal
 * reap). Verified by reading, 2026-08-21.
 */
const ONE_SHOT_READERS = { 'src/renderer/src/hooks/useHive.ts': 1 };

test('no renderer file outside the shared poller owns a hiveTasks timer (#20)', () => {
  const offenders = [];
  const files = sourceFiles(rendererRoot).filter((f) => f !== POLLER);
  assert.ok(files.length > 50, `expected the renderer tree, found ${files.length} files`);

  for (const file of files) {
    const src = readStripped(file);
    const reads = (src.match(/hiveTasks\(/g) || []).length;
    if (!reads) continue;

    const pinned = ONE_SHOT_READERS[file];
    if (pinned !== undefined) {
      assert.equal(
        reads,
        pinned,
        `${file} gained a hiveTasks() read (${reads}, was ${pinned}). It is allowlisted because its `
        + 'existing read is one-shot while it runs timers for other things — a NEW read here has to '
        + 'be checked by hand for being on a timer, which is what #20 is about'
      );
      continue;
    }
    if (/setInterval\(/.test(src)) offenders.push(file);
  }

  assert.deepEqual(
    offenders,
    [],
    'a second independent 5-second poll of one JSON file has come back — #20. These files both '
    + `read hiveTasks() and run a setInterval: ${offenders.join(', ')}. The renderer gets ONE task `
    + `poll (${POLLER}); a component subscribes to it, it does not start its own timer`
  );
});

test('the shared poller still has its callers — it was written once and orphaned (#20)', () => {
  // The recurring failure mode on this repo is building the right thing and
  // never calling it: useHiveTasks shipped with ZERO callers and stayed that way
  // while five components each ran their own 5s timer. Absence of timers is not
  // enough to pin that — a refactor could delete both the timers and the calls.
  const callers = sourceFiles(rendererRoot)
    .filter((f) => f !== POLLER)
    .filter((f) => /\buseHiveTasks\b/.test(readStripped(f)));

  assert.ok(
    callers.length >= 5,
    `${POLLER} is down to ${callers.length} caller(s) (${callers.join(', ') || 'none'}). The five `
    + 'migrated timer sites are AgentStrip, AskMeTab, TaskDetailOverlay, TasksKanban and '
    + 'OfficeFloor; fewer than five means one of them stopped reading the ledger, or went back to '
    + 'polling it itself'
  );
});

// Poison `assert` so every assertion throws, then load the harness. A file that
// still exits 0 is a file whose assertions cannot fail - fake coverage. #20 / D-45.
const POISON =
  "const M=require('module'),o=M.prototype.require,b=()=>{throw new Error('poison')};" +
  "M.prototype.require=function(i){return (i==='assert'||i==='node:assert')" +
  "?new Proxy(b,{get:()=>b}):o.apply(this,arguments)};" +
  "require(require('path').resolve(process.argv[1]))";

test('every hand-rolled harness fails loudly — no assertion that cannot fail (#7)', () => {
  // Why this is durable rather than a one-off check at authoring time: it caught
  // test/proc-kill.test.cjs, whose win32 branch exited 0 straight after the smoke
  // import and BEFORE a single assertion ran, so on Windows it was green
  // forever — green even if procKill.ts had stopped exporting anything. Running
  // it once in wave 2 proves nothing about a bypass introduced into breaker,
  // kg-core, slack or voice-messages in a later wave.
  //
  // Cost: one short-lived node process per hand-rolled harness (eight today),
  // each only loading a module. If that count ever grows past a couple of dozen
  // the fix is to delete hand-rolled harnesses in favour of node:test, not to
  // delete this test.
  //
  // Files that use the real runner are skipped: node:test reports its own
  // failures and sets the exit code itself, so poisoning them measures nothing.
  const harnesses = fs
    .readdirSync(path.join(root, 'test'))
    .filter((name) => name.endsWith('.test.cjs'))
    .map((name) => `test/${name}`)
    .filter((rel) => !/require\('node:test'\)/.test(readStripped(rel)));

  assert.ok(harnesses.length > 0, 'expected some hand-rolled harnesses — has the glob moved?');

  const silent = [];
  for (const rel of harnesses) {
    let status = 0;
    try {
      execFileSync(process.execPath, ['-e', POISON, rel], { cwd: root, stdio: 'ignore' });
    } catch (err) {
      // execFileSync throws on a non-zero exit — which is the PASSING case here.
      status = err && typeof err.status === 'number' ? err.status : 1;
    }
    if (status === 0) silent.push(rel);
  }

  assert.deepEqual(
    silent,
    [],
    `these harnesses cannot fail, so their green is meaningless: ${silent.join(', ')}. Every `
    + 'assertion in them was made to throw and they still exited 0 — they run to completion '
    + 'without asserting anything, or they swallow the failure and exit 0 anyway'
  );
});
