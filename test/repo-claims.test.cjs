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
 *   • #5  (FLOOR-02) — HIVE.md denying the Stop-drain runs, twelve ways
 *   • #5  (FLOOR-02) — the Stop-drain wiring HIVE.md now describes
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

// ─── FLOOR-02 (#5): HIVE.md must stop denying the Stop-drain runs ────────────

/**
 * Every stale denial HIVE.md carried, frozen ON the false claim rather than next
 * to it. Each of the twelve was measured at exactly `1` in HIVE.md immediately
 * before it was deleted (2026-08-21), so every one of these assertions could
 * actually fail — a literal that was already `0` is a permanently-green
 * assertion, not a gate.
 *
 * Compared with `String.prototype.includes`, never a RegExp: two contain `*`
 * and three contain `{}`, and a regex engine reads both as syntax.
 *
 * Section attributions are from `grep -n "^## " HIVE.md` before the edit
 * (§2 :36, §3 :107, §5 :169, §7 :221, §8 :268); the line numbers are pointers,
 * the LITERAL is the key.
 */
const STALE_STOP_DRAIN_DENIALS = [
  'nothing calls that',            // HIVE.md:125 — §3 on-disk layout, cursor.json block
  'shipped, but not as planned',   // HIVE.md:227 — §7 phased plan
  'Moot today',                    // HIVE.md:273 — §8 risk table
  'never advanced',                // HIVE.md:275 — §8 risk table
  '**Reversed',                    // HIVE.md:88  — §2 decision 5 struck out
  'answers **every**',             // HIVE.md:90  — §2 "Stop always returns {}"
  'never forces a continuation',   // HIVE.md:91  — §2
  'nothing in the app calls it',   // HIVE.md:94  — §2 drainForStop "uncalled"
  'per-renderer-session',          // HIVE.md:101 — §2 dedup denial
  '`Stop` returns `{}`',           // HIVE.md:232 — §7 phased plan, second half
  'always answers `{}`',           // HIVE.md:273 — §8 risk table, second half
  'main answers {} — never a forced continue' // HIVE.md:184 — §5 control-flow diagram
];

test('HIVE.md no longer promises the Stop-drain does not run (#5, FLOOR-02)', () => {
  // Trimming this list is the obvious way to make the loop below pass, so the
  // length is asserted too: eleven fails here instead of passing there.
  assert.equal(
    STALE_STOP_DRAIN_DENIALS.length, 12,
    'the freeze list has been shortened. Five of the twelve denials live in §2 decision 5, one in '
    + "§3's on-disk layout, one in §5's control-flow diagram, two in §7 and three in §8 — dropping "
    + 'one lets that section go back to denying the feature while this test stays green'
  );

  const hive = stripComments(fs.readFileSync(path.join(root, 'HIVE.md'), 'utf8'));
  const found = STALE_STOP_DRAIN_DENIALS.filter((claim) => hive.includes(claim));

  assert.deepEqual(
    found,
    [],
    'HIVE.md says the Stop-drain does not run, and it does: '
    + `${found.map((c) => JSON.stringify(c)).join(', ')}. `
    + '.planning/codebase/ARCHITECTURE.md describes the same code correctly, so the two docs '
    + 'contradict each other — and ROADMAP criterion 1 for FLOOR-02 bans exactly this: "grep finds '
    + 'no doc promising a code path that does not run". The drain is live and guarded: '
    + 'hooks.ts calls DeliveryService.drainAtStop at the Stop boundary and returns '
    + "{decision:'block', reason} when the agent has unread mail"
  );
});

test('the Stop-drain wiring HIVE.md now describes is still there (#5, FLOOR-02)', () => {
  // The negative test above can be satisfied by DELETING the feature as well as by
  // correcting the docs — and a deletion would make every removed denial
  // retroactively true. Pin the positive direction in the same file so that
  // refactor fails the suite instead of quietly winning the argument.
  const index = readStripped('src/main/index.ts');
  const hooks = readStripped('src/main/hooks.ts');
  const delivery = readStripped('src/main/delivery.ts');

  assert.ok(
    /drainForStop\(/.test(index) && /delivery\.drainAtStop\(/.test(index),
    'src/main/index.ts no longer wires the Stop-drain (hive.drainForStop into DeliveryService.deps.drain, '
    + 'and delivery.drainAtStop into HookServer). HIVE.md §2.5/§3/§5/§7/§8 now all say it runs'
  );
  assert.ok(
    /this\.drainAtStop\?\.\(/.test(hooks) && /decision: 'block'/.test(hooks),
    "src/main/hooks.ts no longer calls the drain at the Stop boundary, or no longer returns "
    + "{decision:'block'} — without both, Stop really does always answer {} and HIVE.md's "
    + 'corrected sections would be the lie instead'
  );
  assert.ok(
    /paused\(agentId\)/.test(delivery) && /vetoed\(agentId\)/.test(delivery),
    'src/main/delivery.ts drainAtStop lost a guard. The UNGUARDED drain is the version that was '
    + 'removed for bypassing the terminal-draft/HITL gate; both guards are why decision 5 ships'
  );
});
