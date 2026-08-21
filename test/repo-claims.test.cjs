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
 *   • #13 (FLOOR-05) — a finished main handler with nothing wired to it
 *   • #16 (FLOOR-07) — two preload exports and their handlers, both dead
 *   • #31 (FLOOR-07) — a keyword store described as an "Enterprise Knowledge Graph"
 *   • #32 (FLOOR-07) — the FTS5 index the docs promised and the schema lacked
 *   • #32 (FLOOR-07) — the FTS5 test, bypassed into a permanently green gate
 *   • #32 (FLOOR-07) — the prebuilt N-API driver that test needs in order to load
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
const yaml = require('js-yaml');

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

// ─── FLOOR-05 (#13) / FLOOR-07 (#16, #31, #32): plan 01-10's clauses ────────

/**
 * The recurring failure mode this whole file exists for, in its purest form:
 * `app:openLogs` was complete and correct in the main process and had ZERO
 * callers — no preload export, no UI — so the bug template asked reporters for
 * logs they had no way to reach. A main-process half with nothing wired to it
 * is indistinguishable from a feature until someone tries to use it.
 */
test('the log folder is reachable from the renderer, not just implemented in main (#13, FLOOR-05)', () => {
  const preload = readStripped('src/preload/index.ts');
  const main = readStripped('src/main/index.ts');
  const settings = readStripped('src/renderer/src/components/SettingsModal.tsx');

  assert.match(
    main, /ipcMain\.handle\('app:openLogs'/,
    "src/main/index.ts no longer registers app:openLogs. The Settings row and the preload "
    + 'export below now invoke a channel with no handler, which rejects at run time — and the '
    + 'bug template tells every reporter to use that button.'
  );
  assert.match(
    preload, /openLogs:\s*\(\)/,
    'src/preload/index.ts stopped exporting openLogs, so the main-process handler is '
    + 'unreachable from the renderer again — exactly the state #13 was open for, with the '
    + 'handler present the whole time.'
  );
  assert.match(
    settings, /window\.cth\.openLogs\(/,
    'Settings no longer calls window.cth.openLogs. The preload export is then dead code, and '
    + "the bug template's `Settings → General → Log folder → open logs` route points at a "
    + 'button that is not there.'
  );
});

test('the two dead memory exports and their handlers stay deleted (#16, FLOOR-07)', () => {
  const preload = readStripped('src/preload/index.ts');
  const main = readStripped('src/main/index.ts');

  for (const dead of ['memoryWakeUp', 'reflectNow']) {
    assert.ok(
      !new RegExp(`${dead}\\s*:`).test(preload),
      `src/preload/index.ts exports ${dead} again. It had no renderer caller when it was `
      + 'deleted, and an unused IPC export is surface the sandbox pays for and nobody uses: '
      + 'every export here is a path from a web page into the main process.'
    );
  }
  for (const channel of ['hive:memoryWakeUp', 'memory:reflectNow']) {
    assert.ok(
      !main.includes(channel),
      `src/main/index.ts registers ${channel} again. Nothing invokes it — reflect.ts's own `
      + 'timer calls the class method directly — so this is an unreachable handler that reads '
      + 'as a live feature to the next person who greps for one.'
    );
  }
});

test('the keyword store is not described as an "Enterprise Knowledge Graph" (#31, FLOOR-07)', () => {
  // NOT comment-stripped, deliberately, and it is the one place in this file
  // that is: the claim is made IN prose and IN doc comments, so stripping them
  // would delete the very text under test.
  for (const rel of ['README.md', 'src/preload/index.ts']) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.ok(
      !/enterprise knowledge graph/i.test(text),
      `${rel} calls the knowledge store an "Enterprise Knowledge Graph". `
      + 'src/main/kg-core.cjs:3-8 says what it actually is — keyword scoring over text chunks, '
      + 'term frequency plus a title boost, no entities and no edges — and V2-05 (the entity '
      + 'graph) was formally RETIRED, not deferred. The name promises the retired thing.'
    );
  }
});

test('the FTS5 migration the docs promise is in the schema (#32, FLOOR-07)', () => {
  const db = readStripped('src/main/db.ts');

  assert.match(
    db, /CREATE VIRTUAL TABLE[\s\S]{0,60}memory_fts[\s\S]{0,40}USING\s+fts5/i,
    'src/main/db.ts no longer creates memory_fts as an FTS5 virtual table. Asserted on the '
    + 'DDL and not on the comment above it (this source is comment-stripped first) because '
    + 'docs/design/knowledge-graph.md:45 has promised this index since long before it existed '
    + '— a comment naming it is exactly the state that was wrong for months.'
  );

  const entries = (migrationsBody(db).match(/\(db\)\s*=>/g) || []).length;
  assert.ok(
    entries >= 2,
    `MIGRATIONS has ${entries} entr${entries === 1 ? 'y' : 'ies'}, not the 2 it needs. The rail `
    + 'is APPEND-ONLY: index N takes the DB from user_version N to N+1, so removing an entry '
    + 'or folding the FTS5 table into migration 1 means every already-shipped install — which '
    + 'has run migration 1 and will never run it again — silently never gets the index.'
  );
});

test('the FTS5 test cannot be bypassed into a green gate (#32, FLOOR-07)', () => {
  const rel = 'test/db-fts.test.cjs';
  assert.ok(
    fs.existsSync(path.join(root, rel)),
    `${rel} is gone. It is the only coverage over a REAL SQLite handle: the stand-in driver `
    + 'in test/config-secrets.test.cjs implements the migration rail in pragma() and makes '
    + 'exec() a no-op, so an FTS5 test written against that reports a successful migration '
    + 'over an empty database.'
  );

  const bypass = readStripped(rel).match(/\.skip\(|\.todo\(|skip\s*:|todo\s*:/g) || [];
  assert.deepEqual(
    bypass, [],
    'the FTS5 test was skipped — a skipped file exits 0, so the index would be untested while '
    + 'CI stayed green. This claim lives in a file `npm test` ALWAYS runs, so it is the guard '
    + 'that survives even when db-fts itself cannot load: whoever "fixes" a red CI by '
    + `bypassing that file turns this red instead. Found: ${bypass.join(', ')}`
  );

  // The whole line that loads the driver, not merely a line that mentions it.
  // A bare /^(const|let|var) .*require\('better-sqlite3'\)/m was tried first and
  // is NOT a pin: `let Database; try { Database = require('better-sqlite3'); }
  // catch { return; }` starts with `let` and contains the require, so it
  // satisfies that regex while being precisely the early-return this claim
  // exists to forbid. Proven by driving it RED, 2026-08-21.
  const source = readStripped(rel);
  const load = source.match(/^.*require\('better-sqlite3'\).*$/m);
  assert.ok(load, `${rel} does not load better-sqlite3 at all — it is not testing SQLite`);
  assert.match(
    load[0],
    /^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*require\('better-sqlite3'\);?\s*$/,
    `${rel} no longer loads better-sqlite3 as a plain top-level binding — the line is `
    + `\`${load[0].trim()}\`. Wrapped in a guard or nested in a function, a missing native `
    + 'module becomes an early return, the file reports zero tests, and `node --test` exits '
    + '0 — unavailable-and-failing must not be able to look like passing.'
  );
  assert.ok(
    !/\btry\b/.test(source.slice(0, source.indexOf("require('better-sqlite3')"))),
    `${rel} opens a try block before it loads better-sqlite3. Whatever the binding looks like, `
    + 'a load reached through a catch can swallow the ABI failure and leave the file with no '
    + 'tests and a zero exit code.'
  );
});

test('better-sqlite3 stays a prebuilt N-API 13.x that CI never rebuilds (#32, FLOOR-07)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const range = pkg.dependencies['better-sqlite3'] ?? '';

  assert.match(
    range, /^[\^~]?13\./,
    `package.json pins better-sqlite3 at "${range}". 11.x is raw-V8 and must be COMPILED; `
    + '13.x is N-API and ships eight prebuilds in the tarball with no install script. The CI '
    + 'test jobs install with `npm ci --ignore-scripts`, so on 11.x nothing loadable is left '
    + 'and test/db-fts.test.cjs cannot load in CI at all.'
  );

  // Parsed, never grepped: ci.yml names better-sqlite3 in three comments, one of
  // which explains why the rebuild must NOT be there. A text search reads those
  // as hits and answers the opposite of the truth.
  const dir = path.join(root, '.github/workflows');
  const offenders = [];
  for (const file of fs.readdirSync(dir).filter((n) => /\.ya?ml$/.test(n))) {
    const wf = yaml.load(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const [name, job] of Object.entries(wf?.jobs ?? {})) {
      for (const step of job?.steps ?? []) {
        if (typeof step?.run === 'string' && /npm\s+rebuild\s+better-sqlite3/.test(step.run)) {
          offenders.push(`${file}:${name}`);
        }
      }
    }
  }
  assert.deepEqual(
    offenders, [],
    `these jobs rebuild better-sqlite3: ${offenders.join(', ')}. \`npm rebuild\` DISCARDS the `
    + 'shipped prebuild and synthesises a node-gyp compile, which needs Python on the macOS '
    + 'and Windows runners where setup-python is Linux-gated — so "making the FTS5 test run" '
    + 'that way trades one green test for two broken hard-gate jobs.'
  );
});

/** The MIGRATIONS array literal, bounded by the STRUCTURE that closes it (a
 *  `];` at the start of a line) rather than by a character count. A fixed-size
 *  slice of a file that grows either runs out mid-entry or swallows the next
 *  declaration, and both make the entry count above wrong in a way that reads as
 *  a real failure. */
function migrationsBody(dbSource) {
  const start = dbSource.indexOf('const MIGRATIONS');
  assert.ok(start >= 0, 'src/main/db.ts no longer declares MIGRATIONS — re-derive this anchor');
  const rest = dbSource.slice(start);
  const end = rest.indexOf('\n];');
  assert.ok(
    end > 0,
    'the MIGRATIONS array literal no longer ends with `];` at the start of a line. The entry '
    + 'count is measured against that delimiter, so it would silently be counting the rest of '
    + 'the file instead of the array.'
  );
  return rest.slice(0, end);
}
