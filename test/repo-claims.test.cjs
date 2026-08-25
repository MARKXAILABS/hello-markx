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
 *   • #26 (FLOOR-12) — clause 1: a token layer that can represent a sub-14px size
 *   • #26 (FLOOR-12) — clause 2: the frozen content-keyed sub-14px allowlist
 *   • #26 (FLOOR-12) — clause 3: an allowlisted glyph that is not aria-hidden
 *   • #26 (FLOOR-12) — clause 4: the three non-literal sizes
 *   • #26 (FLOOR-12) — a sub-14px size hiding in a decimal or a quoted string
 *   • #26 (FLOOR-12) — an expression-valued size with no floor of its own
 *   • #26 (FLOOR-12) — an icon-only control with no accessible name
 *   • #26 (FLOOR-12) — PixelButton's {children} body, which that rule rests on
 *   • #26 (FLOOR-12) — the two deliberate <div role="button"> and their names
 *   • #19/#34 (FLOOR-09/10) — two composition-root seams minted and never fed
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

/**
 * The SHIPPED-SURFACE corpus: every text file this repo ships, as repo-relative
 * POSIX paths.
 *
 * Deliberately NOT `sourceFiles()` above. That walker matches `.ts`/`.tsx`
 * ONLY, so a "tree-wide" scan built on it would never read
 * `resources/skills/capabilities/SKILL.md` — the single highest-value site for
 * the naming claim below, because that file is installed into every agent's
 * skills directory and so the agents themselves consume whatever it says — and
 * it would DROP `README.md`, which the two-file loop it replaces already
 * covered. It would ship strictly weaker while reporting wider.
 *
 * Scope is an explicit ROOT LIST plus tracked top-level `*.md`. `dist/`, `out/`
 * and `.planning/` therefore fall outside by CONSTRUCTION, not by exclusion: an
 * exclusion list is a thing to forget, a root list is a thing to read, and a
 * scan with no build-output exclusion is permanently red on any machine that
 * has run `npm run build`. `node_modules` and `.git` are denied by name because
 * they can appear BELOW a listed root.
 *
 * Measured when written: 315 files, of which 43 are `.md`/`.html`.
 */
const SHIPPED_ROOTS = ['src', 'resources', 'docs', 'test', 'scripts', 'e2e'];
const SHIPPED_EXT = /\.(tsx?|cjs|mjs|jsx?|md|html|ya?ml)$/;
const SHIPPED_DIR_DENY = new Set(['node_modules', '.git']);

function shippedTextFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SHIPPED_DIR_DENY.has(entry.name)) walk(full);
      } else if (SHIPPED_EXT.test(entry.name)) {
        out.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  for (const rel of SHIPPED_ROOTS) {
    const full = path.join(root, rel);
    if (fs.existsSync(full)) walk(full);
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() && /\.md$/.test(entry.name)) out.push(entry.name);
  }
  return out.sort();
}

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
  // length is asserted too: twelve fails here instead of passing there.
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

/**
 * The six anchor SITES that pointed at unrelated code, frozen ON the wrong
 * string in the same shape as STALE_STOP_DRAIN_DENIALS above — and for the same
 * reason. Each was measured non-zero in its own document immediately before
 * plan 01-31 corrected it (`grep -c` read 4 lines in HIVE.md and 1 in
 * docs/adr/), so every row here could actually fail.
 *
 * Why a DENIAL table and not a pin on the correct line: a `:NNN` pin is red on
 * every unrelated refactor, which is how a pin ends up disabled. These name
 * strings that were WRONG IN THE PAST, so this test can never go red for a
 * refactor reason — only for the anchors coming back.
 *
 * Why it was needed at all: `01-23-SUMMARY.md` reported this exact sweep as
 * APPLIED when six of thirteen anchors had not been touched, and when 01-31
 * re-derived all thirteen at wave 4 it found 13 of 13 stale — 01-24, 01-25 and
 * 01-26 each insert above the four the earlier sweep had called correct. A
 * line number is a claim that expires on the next edit.
 */
const STALE_ANCHORS = [
  { doc: 'HIVE.md', wrong: 'hive.ts:1338', where: '§2.5 dedup paragraph',
    shouldSay: 'hive.ts drainForStop()', pointedAt: 'private startProxyBridge(' },
  { doc: 'HIVE.md', wrong: 'hive.ts:1338', where: "§3 on-disk layout, cursor.json block",
    shouldSay: 'hive.ts drainForStop()', pointedAt: 'private startProxyBridge(' },
  { doc: 'HIVE.md', wrong: 'hooks.ts:662', where: '§3 on-disk layout, cursor.json block',
    shouldSay: "hooks.ts's Stop arm", pointedAt: 'this.server = null;' },
  { doc: 'HIVE.md', wrong: 'hooks.ts:662', where: '§7 phased plan, Stop-loop paragraph',
    shouldSay: "hooks.ts's Stop arm", pointedAt: 'this.server = null;' },
  { doc: 'HIVE.md', wrong: 'delivery.ts:262', where: '§7 phased plan, Stop-loop paragraph',
    shouldSay: 'delivery.ts drainAtStop()', pointedAt: 'a VETO_TTL_MS comment' },
  { doc: 'docs/adr/0005-cumulative-cost-ledger.md', wrong: 'index.ts:1524',
    where: 'the "second appender" paragraph',
    shouldSay: 'index.ts appendCostLedger()', pointedAt: "the god-beat prompt builder's byteLength" },
];

test('no doc restores an anchor that pointed at unrelated code (FLOOR-02, FLOOR-17, c/WR-07)', () => {
  assert.equal(
    STALE_ANCHORS.length, 6,
    'the denial table has been shortened. Six SITES across five doc lines were wrong; dropping a '
    + 'row lets that anchor come back while this test stays green'
  );

  const offenders = [];
  for (const row of STALE_ANCHORS) {
    const text = fs.readFileSync(path.join(root, row.doc), 'utf8');
    if (text.includes(row.wrong)) {
      offenders.push(
        `${row.doc} (${row.where}) cites ${row.wrong}, which pointed at ${row.pointedAt}; `
        + `it should name ${row.shouldSay}`
      );
    }
  }

  assert.deepEqual(
    offenders, [],
    `a corrected anchor is back:\n  ${offenders.join('\n  ')}\n`
    + 'ROADMAP criterion 1 is "grep finds no doc promising a code path that does not run", and an '
    + 'anchor pointing at the wrong function routes the next change into the wrong file. Write '
    + '`<file>.ts <symbol>()`; if a line number genuinely helps navigation, put it BESIDE the '
    + 'symbol and only after re-deriving it.'
  );
});

/**
 * `DESIGN.md` stated a 1280 × 800 window minimum in two places. Plan 01-25
 * lowered `MIN_WIN.width` to 960 so FLOOR-13's sub-1024 sidebar collapse is
 * reachable in the shipped app at all, and 01-25 owns and edits `DESIGN.md`.
 *
 * `DESIGN.md` is NOT in plan 01-31's files_modified. This pin exists precisely
 * so the correction cannot fall BETWEEN the two plans: if 01-25 had missed it,
 * this is red and says which file and line.
 */
const PRE_FIX_DESIGN_MINIMUM = '- Main window minimum: 1280 × 800.';
const STATES_1280_MINIMUM = /1280\s*[×x]\s*800|minimum:?\s*1280/i;

test('no shipped doc still states a 1280 window minimum (FLOOR-13, cross-checks 01-25)', () => {
  // Non-vacuity first: the matcher must fire on the sentence the tree actually
  // shipped before 01-25. A pin nobody has seen failing is a comment.
  assert.ok(
    STATES_1280_MINIMUM.test(PRE_FIX_DESIGN_MINIMUM),
    'the matcher no longer recognises the pre-01-25 DESIGN.md sentence, so a green result below '
    + 'would mean the regex broke rather than the docs being right'
  );

  const docs = shippedTextFiles().filter((rel) => /\.(md|html)$/.test(rel));
  assert.ok(
    docs.length > 30,
    `expected the shipped doc corpus, found ${docs.length} files (43 measured when written)`
  );
  assert.ok(docs.includes('DESIGN.md'), 'DESIGN.md is not in the doc corpus — the walker is wrong');

  const offenders = [];
  for (const rel of docs) {
    fs.readFileSync(path.join(root, rel), 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (STATES_1280_MINIMUM.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }

  assert.deepEqual(
    offenders, [], `a shipped doc still promises a 1280px window minimum:\n  ${offenders.join('\n  ')}\n`
    + 'src/main/index.ts MIN_WIN.width is 960 (plan 01-25), which is what makes '
    + "sidebarLayout.ts's SIDEBAR_COLLAPSE_WIDTH = 1024 branch reachable in the shipped app. A doc "
    + 'stating 1280 describes a window the app no longer enforces.'
  );
});

test('the Stop-drain wiring HIVE.md now describes is still there (#5, FLOOR-02)', () => {
  // The negative test above can be satisfied by DELETING the feature as well as by
  // correcting the docs — and a deletion would make every removed denial
  // retroactively true. Pin the positive direction in the same file so that
  // refactor fails the suite instead of quietly winning the argument.
  //
  // 02-02 moved the composition root (the DeliveryService/HookServer wiring)
  // out of index.ts into src/main/floor/boot.ts's bootFloor(); the wiring text
  // itself is unchanged, only its file.
  const boot = readStripped('src/main/floor/boot.ts');
  const hooks = readStripped('src/main/hooks.ts');
  const delivery = readStripped('src/main/delivery.ts');

  assert.ok(
    /drainForStop\(/.test(boot) && /delivery\.drainAtStop\(/.test(boot),
    'src/main/floor/boot.ts no longer wires the Stop-drain (hive.drainForStop into DeliveryService.deps.drain, '
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

/**
 * The two paths held OUT of the naming scan, each carrying its reason here
 * rather than in a comment somewhere else, because an unexplained exclusion is
 * the shape a weakened pin takes.
 */
const EKG_SCAN_EXCLUDED = {
  'docs/floor-inspection.html':
    'the audit RECORD, which quotes the defect in order to report it — erasing the quotation '
    + 'would delete the finding rather than fix it',
  'test/repo-claims.test.cjs':
    'this file: a pin must be allowed to contain its own needle, or it can never pass '
    + '(01-REDTEAM-5 R-32 demonstrated exactly that)',
};

test('no shipped surface describes the keyword store as an "Enterprise Knowledge Graph" (#31, FLOOR-07)', () => {
  // NOT comment-stripped, deliberately, and it is the one place in this file
  // that is: the claim is made IN prose and IN doc comments, so stripping them
  // would delete the very text under test. That reasoning survived the widening
  // from two files to the whole shipped surface. It is also NOT routed through
  // `stripComments` for a second reason — that helper carries an unfixed
  // string-truncation defect (review c/WR-13), outside this plan's scope.
  const files = shippedTextFiles().filter((rel) => !(rel in EKG_SCAN_EXCLUDED));

  // Assert the CORPUS before asserting the corpus is clean: a broken walker and
  // a clean tree must never be indistinguishable. 315 measured when written.
  assert.ok(
    files.length > 200,
    `expected the shipped tree, found ${files.length} files — shippedTextFiles() is broken, `
    + 'so a green result below would mean nothing was read rather than nothing was found'
  );
  for (const needed of ['resources/skills/capabilities/SKILL.md', 'README.md', 'DESIGN.md']) {
    assert.ok(
      files.includes(needed),
      `${needed} is NOT in the scanned corpus. It is the reason this scan does not reuse `
      + "sourceFiles(), which matches .ts/.tsx only — a corpus that excludes this file's own "
      + 'highest-value site reports a guarantee it does not hold.'
    );
  }

  const offenders = files.filter(
    (rel) => /enterprise knowledge graph/i.test(fs.readFileSync(path.join(root, rel), 'utf8'))
  );

  assert.deepEqual(
    offenders, [],
    `these shipped files call the keyword store an "Enterprise Knowledge Graph": ${offenders.join(', ')}. `
    + 'src/main/kg-core.cjs says what it actually is — keyword scoring over text chunks, term '
    + 'frequency plus a title boost, no entities and no edges — and V2-05 (the entity graph) was '
    + 'formally RETIRED, not deferred. The name promises the retired thing. '
    + 'resources/skills/capabilities/SKILL.md is the one that matters most: it is installed into '
    + "every agent's skills directory, so a false capability claim there is consumed by the models."
  );
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

// ───────────────────────────────────────────────────────────────────────────
// Wave 9 (plan 01-23) — the accumulator asserted whole.
//
// Everything below is a negative grep this phase relied on that would otherwise
// have lived only in a SUMMARY. D-45: a grep that lives in a report rots; a
// grep that lives here runs on three platforms on every future PR.
// ───────────────────────────────────────────────────────────────────────────

/**
 * M1, pinned. Do NOT re-derive with a different regex — the repo-wide count
 * moves by ±6 with regex shape, and the whole FLOOR-12 completeness bar is a
 * multiset equality against it. This is character-identical to the shell form
 * `grep -rhoE "fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])"`, which counts
 * OCCURRENCES (`-o`), not lines. The unit matters: a `grep -c` form under-counts
 * any line carrying two hits.
 */
const M1 = /fontSize *[:=] *\{?(1[0-3]|[1-9])($|[^0-9.])/g;

/**
 * The frozen FLOOR-12 allowlist, keyed on CONTENT and never on a line number.
 *
 * The line-anchor contract (01-23-PLAN `<interfaces>`), in two halves:
 *   • half 1 — plan 01-21 (wave 8) changed no line matching M1, so the TEXT of
 *     every site below is stable even though its line number is not. 81 M1 sites
 *     sat below a plan-21 edit, and 44 of the 61 M1 files contain a React hook,
 *     so a line-keyed array would be off by at least one line and would fail for
 *     a reason that has nothing to do with FLOOR-12.
 *   • half 2 — THIS array. Each entry is `{ file, text, count }` where `text` is
 *     the trimmed source line and `count` is how many M1 hits that exact trimmed
 *     text produces in that file. The assertion compares two multisets for exact
 *     equality, so a NEW sub-14px site either introduces an unlisted
 *     `(file, text)` key or bumps a count — either way the suite fails — while a
 *     line inserted above an existing site is a non-event.
 *
 * Assembled from the seven wave-7 sweep SUMMARYs (01-14 … 01-20) and re-derived
 * against the tree at wave 9. Attribution, per 01-20-SUMMARY: 01-14 five,
 * 01-17 four, 01-18 three, 01-20 three, 01-19 one, 01-15/01-16 zero — which
 * reconciles with 01-14's handoff arithmetic (567 handed out + 5 kept = 572;
 * wave 7 kept 11; 5 + 11 = 16).
 *
 * Every entry is a decorative glyph inside a `<span aria-hidden="true">` with
 * its own local fontSize override — UI-SPEC Rule 0's exempt shape. That is not
 * a convention here, it is asserted below, clause by clause.
 */
const FLOOR12_ALLOWLIST = [
  { file: 'src/renderer/src/components/AgentCard.tsx', text: '<span aria-hidden="true" style={{ fontSize: 10 }}>✎</span>', count: 1 },
  { file: 'src/renderer/src/components/AgentStrip.tsx', text: '<span aria-hidden="true" style={{ fontSize: 11 }}>✕</span>', count: 1 },
  { file: 'src/renderer/src/components/AgentStrip.tsx', text: '<span aria-hidden="true" style={{ fontSize: 12 }}>✕</span>', count: 1 },
  { file: 'src/renderer/src/components/AskMeTab.tsx', text: '<span aria-hidden="true" style={{ fontSize: 13 }}>✕</span>', count: 1 },
  { file: 'src/renderer/src/components/CommandCenterPanel.tsx', text: "{armed && <span aria-hidden=\"true\" title={breaker?.reason} style={{ color: 'var(--cth-coral)', fontSize: 12 }}>⚠</span>}", count: 1 },
  { file: 'src/renderer/src/components/CommandCenterPanel.tsx', text: '<span aria-hidden="true" style={{ fontSize: 11 }}>✓</span>', count: 1 },
  { file: 'src/renderer/src/components/FullscreenFileEditor.tsx', text: '<span aria-hidden="true" style={{ fontSize: 12 }}>✕</span>', count: 1 },
  { file: 'src/renderer/src/components/FullscreenTerminal.tsx', text: '<span aria-hidden="true" style={{ fontSize: 11 }}>✕</span>', count: 1 },
  { file: 'src/renderer/src/components/FullscreenTerminal.tsx', text: '<span aria-hidden="true" style={{ fontSize: 12 }}>✎</span>', count: 1 },
  { file: 'src/renderer/src/components/PtyTerminalView.tsx', text: '<span aria-hidden="true" style={{ fontSize: 12 }}>−</span>', count: 1 },
  { file: 'src/renderer/src/components/PtyTerminalView.tsx', text: '<span aria-hidden="true" style={{ fontSize: 12 }}>+</span>', count: 1 },
  { file: 'src/renderer/src/components/TasksKanban.tsx', text: '<span aria-hidden="true" style={{ fontSize: 12 }}>✕</span>', count: 1 },
  { file: 'src/renderer/src/components/triggers/ui.tsx', text: "<span aria-hidden=\"true\" style={{ flexShrink: 0, width: 8, fontSize: 11, color: 'var(--cth-ink-500)' }}>{open ? '▾' : '▸'}</span>", count: 1 },
  { file: 'src/renderer/src/ide/GitPanes.tsx', text: '<span aria-hidden="true" style={{ fontSize: 11 }}>✕</span>', count: 1 },
  { file: 'src/renderer/src/ide/GitPanes.tsx', text: '<span aria-hidden="true" style={{ fontSize: 11 }}>⇄</span>', count: 1 },
  { file: 'src/renderer/src/ide/IdePanel.tsx', text: "<span aria-hidden=\"true\" style={{ fontSize: 10, lineHeight: '14px' }}>{gitCollapsed ? '▸' : '▾'}</span>", count: 1 },
];

/** Every renderer `.ts`/`.tsx`, comment-stripped, keyed by repo-relative path. */
function rendererSources() {
  const out = new Map();
  for (const rel of sourceFiles(rendererRoot)) out.set(rel, readStripped(rel));
  return out;
}

/** The `(file, trimmed-line-text) -> occurrence count` multiset M1 produces. */
function m1Multiset() {
  const found = new Map();
  for (const [rel, src] of rendererSources()) {
    for (const line of src.split('\n')) {
      const hits = line.match(M1);
      if (!hits) continue;
      const key = `${rel}\u0000${line.trim()}`;
      found.set(key, (found.get(key) ?? 0) + hits.length);
    }
  }
  return found;
}

test('FLOOR-12 clause 1 — tokens.css declares no text size below the 14px floor (#26)', () => {
  const css = fs.readFileSync(path.join(rendererRoot, 'design', 'tokens.css'), 'utf8');

  // Parsed, not matched against a literal: a whitespace change inside the
  // declaration must not be able to make this pass or fail.
  const decls = [...css.matchAll(/--cth-text-([a-z-]+)\s*:\s*([0-9.]+)px/g)]
    .map((m) => ({ name: `--cth-text-${m[1]}`, px: Number(m[2]) }));
  assert.ok(decls.length >= 5, `tokens.css declared ${decls.length} --cth-text-* sizes; the parse is wrong`);

  const under = decls.filter((d) => d.px < 14);
  assert.deepEqual(
    under, [],
    'DESIGN.md:706 states no user-facing text sits below 14px, and the token layer is where a '
    + 'sub-floor value becomes representable at all. These declarations are below it: '
    + `${under.map((d) => `${d.name}: ${d.px}px`).join(', ')} (#26, FLOOR-12).`
  );

  // display-sm was DELETED rather than raised (01-14): a token whose whole job
  // is "the smallest" cannot sit AT the floor without inviting the next
  // sub-floor value to be written into it. Deleting it makes the regression
  // unrepresentable rather than merely wrong.
  for (const dead of ['--cth-text-display-sm', '--cth-lh-display-sm']) {
    assert.equal(
      new RegExp(`${dead}\\s*:`).test(css), false,
      `${dead} is back in tokens.css. It was deleted, not raised, so that "the smallest text `
      + 'token" cannot exist as a place to put a sub-14px value (#26, FLOOR-12).'
    );
  }
});

test('FLOOR-12 clause 2 — every sub-14px site left in the renderer is on the frozen allowlist (#26)', () => {
  const found = m1Multiset();
  const allowed = new Map();
  for (const e of FLOOR12_ALLOWLIST) {
    const key = `${e.file}\u0000${e.text}`;
    allowed.set(key, (allowed.get(key) ?? 0) + e.count);
  }

  const show = (k, n) => `  ${k.split('\u0000')[0]}  ×${n}\n      ${k.split('\u0000')[1]}`;
  const extra = [];
  const missing = [];
  for (const [k, n] of found) if ((allowed.get(k) ?? 0) !== n) extra.push(show(k, n));
  for (const [k, n] of allowed) if ((found.get(k) ?? 0) !== n) missing.push(show(k, n));

  assert.ok(
    extra.length === 0 && missing.length === 0,
    'The FLOOR-12 allowlist and the tree disagree (#26).\n\n'
    + 'PRESENT IN SOURCE BUT NOT ALLOWLISTED — a new sub-14px site, or an existing one whose\n'
    + 'count grew. Fix the site; do NOT widen this list:\n'
    + (extra.join('\n') || '  (none)')
    + '\n\nALLOWLISTED BUT ABSENT FROM SOURCE — a stale entry, or half 1 of the line-anchor\n'
    + 'contract broke and a site\'s TEXT changed. If the text no longer exists anywhere in its\n'
    + 'file, report it against the plan that moved it rather than editing this list:\n'
    + (missing.join('\n') || '  (none)')
  );

  const total = [...found.values()].reduce((a, b) => a + b, 0);
  assert.equal(
    total, FLOOR12_ALLOWLIST.reduce((a, e) => a + e.count, 0),
    'the repo-wide M1 occurrence count no longer equals the summed allowlist size'
  );
});

test('FLOOR-12 clause 3 — every allowlisted site is a decorative glyph hidden from the a11y tree (#26)', () => {
  const sources = rendererSources();
  for (const entry of FLOOR12_ALLOWLIST) {
    const src = sources.get(entry.file);
    assert.ok(src, `${entry.file} is on the FLOOR-12 allowlist and no longer exists`);

    // Located by CONTENT, never by a line number: find the site's text, then walk back to
    // the opening tag of the element that owns the fontSize.
    const at = src.indexOf(entry.text);
    assert.ok(at >= 0, `the allowlisted text is gone from ${entry.file}: ${entry.text}`);
    const sizeAt = src.slice(at).search(M1) + at;
    const tagStart = src.lastIndexOf('<', sizeAt);
    const tagEnd = src.indexOf('>', sizeAt);
    const openTag = src.slice(tagStart, tagEnd + 1);

    assert.match(
      openTag, /aria-hidden=("true"|\{true\})/,
      `${entry.file} keeps a sub-14px size on an element that is NOT hidden from the accessibility `
      + 'tree. UI-SPEC Rule 0 exempts a decorative glyph only because a screen reader never '
      + `announces it. Without aria-hidden it is user-facing text below the floor:\n  ${openTag}\n`
      + '(#26, FLOOR-12).'
    );
  }
});

test('FLOOR-12 clause 4 — the three non-literal sizes are at or above the floor (#26)', () => {
  // Located by IDENTIFIER, not by line — `ThoughtBubble.ts:22` and
  // `ToolBubble.ts:29` both read `const FONT_SIZE = 12;` before wave 7, so this
  // is a real gate on that work rather than a formality.
  for (const rel of ['src/renderer/src/scene/office/ThoughtBubble.ts', 'src/renderer/src/scene/office/ToolBubble.ts']) {
    const m = readStripped(rel).match(/const FONT_SIZE\s*=\s*([0-9.]+)/);
    assert.ok(m, `${rel} no longer declares FONT_SIZE — re-derive this anchor`);
    assert.ok(
      Number(m[1]) >= 14,
      `${rel} renders its Pixi label at ${m[1]}px, below DESIGN.md's 14px floor (#26, FLOOR-12). `
      + 'NOTE the caveat 01-14 filed and did not claim away: both classes draw inside a container '
      + 'held at RENDER_SCALE = 0.5, so the DESIGNED on-screen size is half this number. Raising '
      + 'FONT_SIZE is necessary and not sufficient; the geometry is UI-SPEC containment step 3.'
    );
  }

  const ft = readStripped('src/renderer/src/components/FullscreenTerminal.tsx');
  const floor = ft.match(/fontSize:\s*Math\.max\(\s*([0-9.]+)\s*,/);
  assert.ok(floor, 'FullscreenTerminal.tsx no longer floors a fontSize with Math.max — re-derive this anchor');
  assert.ok(
    Number(floor[1]) >= 14,
    `FullscreenTerminal.tsx floors an expression-valued fontSize at ${floor[1]}px (#26, FLOOR-12).`
  );
});

test('FLOOR-12 — no sub-14px size hides in a decimal or quoted literal, where M1 cannot see it (#26)', () => {
  // M1's regex requires a bare digit right after `fontSize:`, so `fontSize: 12.5`
  // and `fontSize: '13px'` are both invisible to it. Red-team round 2 found
  // twelve real sub-14px sites in exactly those forms, so asserting M1 alone
  // would sign FLOOR-12 off with `fontSize: 12.5` re-introduced.
  //
  // M1d matches ONLY the two forms M1 is blind to — a decimal, or a quoted
  // string — so it can never overlap the allowlist above, every entry of which
  // is a bare integer. `< 14` is the bar, not `> 0`: `fontSize: '16px'` is a real
  // hit of this shape and is correctly above the floor.
  const M1d = /fontSize *[:=] *\{?(?:'[0-9.]+(?:px)?'|"[0-9.]+(?:px)?"|[0-9]+\.[0-9]+)/g;
  const seen = [];
  const under = [];
  for (const [rel, src] of rendererSources()) {
    for (const m of src.matchAll(M1d)) {
      const px = Number(m[0].replace(/[^0-9.]/g, '').replace(/\.$/, ''));
      seen.push(`${rel}: ${m[0].trim()} (${px})`);
      if (px < 14) under.push(`${rel}: ${m[0].trim()}`);
    }
  }
  assert.ok(
    seen.length > 0,
    'M1d matched nothing at all in the renderer. It is a NEGATIVE scan, so an empty result is '
    + 'indistinguishable from a broken regex — and a broken regex here signs FLOOR-12 off with '
    + '`fontSize: 12.5` re-introduced. Re-derive the pattern before trusting a zero.'
  );
  assert.deepEqual(
    under, [],
    'These sizes are below the 14px floor and are INVISIBLE to M1, because M1 requires a bare '
    + 'digit straight after `fontSize:` and cannot see a decimal or a quoted string. They are '
    + 'not eligible for the Rule 0 allowlist — that list is literal-only (#26, FLOOR-12):\n'
    + under.join('\n')
  );
});

test('FLOOR-12 — every expression-valued size carries its own 14px floor (#26)', () => {
  // M1x hits SURVIVE the sweep by construction: the sweeps fix them by raising
  // the expression's minimum, not by deleting the expression. So the rule is
  // per-hit, never a count. The terminal's OWN font is the carve-out
  // (`term.options.fontSize` — UI-SPEC: terminal sizing is user-controlled, and
  // MIN_TERMINAL_FONT_SIZE stays 8 for exactly that reason). CHROME that merely
  // READS the zoom is not exempt and must carry its own floor, which is why the
  // composer is floored on its consumer rather than on the shared constant.
  const floors = [
    ['src/renderer/src/components/FullscreenTerminal.tsx', /name:\s*clamp\([^,]+,\s*([0-9.]+)\s*,/, 'rosterScale().name'],
    ['src/renderer/src/components/FullscreenTerminal.tsx', /group:\s*clamp\([^,]+,\s*([0-9.]+)\s*,/, 'rosterScale().group'],
    ['src/renderer/src/components/FullscreenTerminal.tsx', /note:\s*clamp\([^,]+,\s*([0-9.]+)\s*,/, 'rosterScale().note'],
    ['src/renderer/src/components/FullscreenTerminal.tsx', /noteFontSize\s*=\s*Math\.min\([0-9.]+,\s*Math\.max\(\s*([0-9.]+)/, 'noteFontSize'],
    ['src/renderer/src/components/FullscreenTerminal.tsx', /noteLabelSize\s*=\s*Math\.max\(\s*([0-9.]+)/, 'noteLabelSize'],
    ['src/renderer/src/components/MessageQueueComposer.tsx', /composerFontSize\s*=\s*Math\.max\(\s*([0-9.]+)/, 'composerFontSize'],
  ];
  for (const [rel, re, name] of floors) {
    const m = readStripped(rel).match(re);
    assert.ok(m, `${rel} no longer floors ${name} — re-derive this anchor by content, not by line`);
    assert.ok(
      Number(m[1]) >= 14,
      `${name} floors at ${m[1]}px in ${rel}. It reads the terminal zoom, whose own minimum is `
      + 'MIN_TERMINAL_FONT_SIZE = 8, so without its own floor it renders chrome text at 8px the '
      + 'moment the operator zooms out. Raising the shared constant instead would take two zoom '
      + 'steps away from xterm, which is what the terminal carve-out exists to protect '
      + '(#26, FLOOR-12).'
    );
  }
});

test('FLOOR-12 — an icon-only button carries an accessible name; a text button is left alone (#26)', () => {
  // THE RULE, NOT A RATIO. 49 `aria-label` against 133 `<button>` is not a bar,
  // and a ratio test would be actively wrong: a <button> with visible text
  // already HAS an accessible name, and adding `aria-label` to it OVERRIDES the
  // visible label and breaks voice control ("click Save" stops working). So this
  // asserts a per-element rule and never a count.
  //
  // Name sources accepted: aria-label, aria-labelledby, and `title` — on the
  // control or on a non-hidden element inside it. `title` is not a stylistic
  // choice here, it is the ONLY name source `PixelButton`'s closed prop set
  // exposes, and 01-16/01-20 measured it live on Chromium's AX tree
  // (`Accessibility.getFullAXTree` reported "Remove <path>", not ""). Excluding
  // it would fail this test against code that is demonstrably named.
  //
  // PIXELBUTTON'S CLASSIFICATION IS EXPLICIT, per 01-23-PLAN task 1: the
  // predicate below classifies a `{children}` body as TEXT-BEARING, so
  // `PixelButton.tsx`'s own <button> is never reported as icon-only and needs no
  // exclusion by name. That is the general rule and not a carve-out — a
  // ReactNode prop's accessible name is supplied by the CALLER, so it is not
  // statically knowable here, and demanding `aria-label` on the primitive would
  // override every caller's visible text. The pin below keeps that reasoning
  // from silently outliving itself.
  const glyphOnly = (body) => {
    const text = body.replace(/<[^>]*>/g, '').trim();
    return text.length > 0 || body.includes('<') ? !/[A-Za-z0-9]/.test(text) : false;
  };
  const named = (openTag, body) => {
    if (/(aria-label|aria-labelledby|title)\s*=/.test(openTag)) return true;
    for (const tag of body.match(/<[^>]*>/g) ?? []) {
      if (/aria-hidden/.test(tag)) continue;
      if (/(aria-label|aria-labelledby|title)\s*=/.test(tag)) return true;
    }
    return false;
  };

  const unnamed = [];
  let iconOnly = 0;
  for (const [rel, src] of rendererSources()) {
    if (!rel.endsWith('.tsx')) continue;
    for (const tag of ['button', 'PixelButton']) {
      for (const el of jsxElements(src, tag)) {
        if (!glyphOnly(el.body)) continue;
        iconOnly++;
        if (!named(el.openTag, el.body)) {
          unnamed.push(`${rel}\n      ${el.openTag.replace(/\s+/g, ' ').slice(0, 160)}`);
        }
      }
    }
  }

  assert.ok(iconOnly > 20, `the icon-only predicate found ${iconOnly} controls; it has stopped matching`);
  assert.deepEqual(
    unnamed, [],
    'These controls render nothing but a glyph and have no accessible name, so a screen reader '
    + 'announces them as "button" and nothing else (#26, FLOOR-12):\n' + unnamed.join('\n')
  );
});

test('FLOOR-12 — PixelButton still renders {children}, so its text-bearing classification holds (#26)', () => {
  // The exclusion above rests entirely on this: PixelButton's <button> renders a
  // ReactNode PROP, whose accessible name comes from the caller. If it ever
  // rendered a glyph literal instead, that reasoning would be dead and the
  // predicate would have to demand a name here.
  const src = readStripped('src/renderer/src/components/PixelButton.tsx');
  const el = jsxElements(src, 'button')[0];
  assert.ok(el, 'PixelButton.tsx no longer renders a <button>');
  assert.match(
    el.body, /\{\s*children\s*\}/,
    "PixelButton's <button> no longer renders {children}. The FLOOR-12 accessible-name test "
    + 'classifies it as text-bearing precisely BECAUSE its content is a caller-supplied '
    + 'ReactNode. If it now renders a glyph, that classification is wrong and the test above '
    + 'is silently exempting a real unnamed control (#26, FLOOR-12).'
  );
});

test('the two deliberate <div role="button"> keep their accessible names (#26)', () => {
  // `.planning/codebase/CONCERNS.md` records these as RESOLVED history: a native
  // <button> cannot legally contain the other buttons these rows carry, so the
  // row is a div with an explicit role. A future "accessibility cleanup" that
  // converts them back to <button> would regress a documented decision and
  // reintroduce nested-interactive markup.
  //
  // Located by ATTRIBUTE, never by the line numbers :145 and :604 —
  // FullscreenTerminal.tsx has useEffect at :142 and :168, both ABOVE both
  // anchors, so plan 01-21's dependency fixes can legitimately shift them.
  for (const rel of [
    'src/renderer/src/components/AgentCard.tsx',
    'src/renderer/src/components/FullscreenTerminal.tsx',
  ]) {
    const src = readStripped(rel);
    // The BRACE-AWARE scanner, not `indexOf('>')`: both of these divs carry an
    // `onKeyDown={(e) => …}` arrow, so a naive scan for the next `>` ends the
    // open tag inside the arrow's fat arrow and reports "no aria-label" against
    // a div that plainly has one. That failure looks exactly like the real
    // regression this test exists to catch, which makes it worse than no test.
    const el = jsxElements(src, 'div').find((d) => /role="button"/.test(d.openTag));
    assert.ok(
      el,
      `${rel} no longer carries a <div role="button">. CONCERNS.md records it as the resolved `
      + 'form of the nested-interactive defect in #26: the row holds its own buttons, so it '
      + 'cannot be a native <button>. Converting it back regresses that decision.'
    );
    assert.match(
      el.openTag, /aria-label\s*=/,
      `${rel}'s <div role="button"> has no aria-label. A div has no implicit accessible name, so `
      + 'without one this control announces as "button" and nothing else (#26, FLOOR-12).'
    );
  }
});

test('both composition-root seams are still fed — FLOOR-09 and FLOOR-10 are not dead code (#19, #34)', () => {
  // `src/main/index.ts` is single-owner-per-wave, so two requirements crossed a
  // wave boundary as named handoffs: plan 06 minted `recordCostSample` in wave 3
  // and plan 08 injected it in wave 4; plan 09 minted `budgetForAgent` in wave 4
  // and plan 10 fed the breaker beat in wave 5. A handoff that is written but
  // never applied leaves a requirement closed on paper with dead code beneath it,
  // and BOTH greps read 0 when this plan was written.
  //
  // 02-02 moved both feed sites (the HookServer construction and the breaker
  // beat) out of index.ts into src/main/floor/boot.ts's bootFloor()/
  // runBreakerBeat(); the wiring itself is unchanged, only its file.
  const boot = readStripped('src/main/floor/boot.ts');

  assert.ok(
    boot.includes('recordCostSample'),
    'src/main/floor/boot.ts never calls recordCostSample. The HookServer sink exists and is unit-tested, '
    + 'but nothing in production feeds it: proxy-tier spend stops reaching getAgentUsage and the '
    + 'budget cap becomes a false cap (#19, FLOOR-09).'
  );
  assert.ok(
    boot.includes('budgetForAgent'),
    'src/main/floor/boot.ts never calls hive.budgetForAgent. The accessor exists and is unit-tested, '
    + 'but the breaker beat is never handed a budget: BreakerInput.budget becomes an optional '
    + 'field nothing ever sets, and the FLOOR-10 arm is dead code behind a green suite (#34).'
  );
});

/**
 * JSX elements of one tag name, as `{ openTag, body }`, nesting-aware and
 * quote-aware. Written by hand rather than pulled in as a parser dependency:
 * this file must keep loading under a plain `node --test` with no build step,
 * on all three CI platforms, exactly as every other clause here does.
 */
function jsxElements(src, tag) {
  const out = [];
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const re = new RegExp(`<${tag}\\b`, 'g');
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + open.length;
    let quote = null;
    let brace = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== '\\') quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '{') brace++;
      else if (c === '}') brace--;
      else if (c === '>' && brace === 0) break;
    }
    const openTag = src.slice(m.index, i + 1);
    if (/\/>$/.test(openTag)) { out.push({ openTag, body: '' }); continue; }
    let j = i + 1;
    let depth = 1;
    while (j < src.length && depth > 0) {
      const nested = src.indexOf(open, j);
      const closing = src.indexOf(close, j);
      if (closing < 0) break;
      if (nested >= 0 && nested < closing) { depth++; j = nested + open.length; } else { depth--; j = closing + close.length; }
    }
    out.push({ openTag, body: src.slice(i + 1, j - close.length) });
  }
  return out;
}

// ─── STRUCT-02 (phase 2 plan 02-01): ADR-0004 survives the git-committer split ──

/** Comment-stripped source of every .ts/.tsx under src/, joined with a single
 *  space so a construction or declaration wrapped across lines by a
 *  formatter cannot defeat either clause below — same joined-text discipline
 *  the plan's own shell criteria use, applied here in plain JS. */
function joinedSrcText() {
  return sourceFiles(path.join(root, 'src'))
    .map((rel) => readStripped(rel))
    .join(' ')
    .replace(/\s+/g, ' ');
}

test('ADR-0004: exactly one GitCommitter is ever constructed, and hive.ts owns it (02-01)', () => {
  const joined = joinedSrcText();
  const total = (joined.match(/new GitCommitter\(/g) || []).length;
  assert.equal(
    total, 1,
    `found ${total} \`new GitCommitter(\` construction(s) across src/**. ADR-0004 is a single- `
    + 'committer model — a second construction races the first on the same git index, which is '
    + 'index corruption plus a bypassed FLOOR-04 secret scrub. This must stay exactly 1.'
  );

  const hive = readStripped('src/main/hive.ts').replace(/\s+/g, ' ');
  const inHive = (hive.match(/new GitCommitter\(/g) || []).length;
  assert.ok(
    inHive >= 1,
    "src/main/hive.ts no longer constructs a GitCommitter. The negative half of this clause "
    + '(exactly one, above) is satisfiable by deleting the committer outright — this positive '
    + 'half fails that case: HiveManager must be the one owner.'
  );
});

test('HiveManager still exposes commit()/flushCommit() as delegations, not the old inline git state (02-01)', () => {
  const hive = readStripped('src/main/hive.ts');

  // Positive half: the public API six tests and every hive-mutating method
  // call did not move away.
  assert.ok(
    // The type annotation is required to distinguish the DECLARATION from an
    // internal call site (`this.committer.commit(message)` has no `: string`)
    // — a bare `commit(message` matches both and can never go red.
    /\bcommit\(message: string/.test(hive),
    'src/main/hive.ts no longer declares commit(message: string...) — every hive mutation (router '
    + 'tick, writeTasks(), ensureAgent(), setArchived(), …) calls this by name'
  );
  assert.ok(
    /\bflushCommit\(root: string/.test(hive),
    'src/main/hive.ts no longer declares flushCommit(root: string...) — test/hive-durability.test.cjs '
    + 'and test/engine-parity.test.cjs call this exact method, by this exact name, at runtime'
  );

  // Negative half: the debounce/retry state that used to live on HiveManager
  // is gone from here — proving these are delegations, not a second copy of
  // GitCommitter's internals sitting alongside the real one.
  for (const moved of ['gitInFlight', 'committing']) {
    assert.equal(
      hive.includes(moved), false,
      `src/main/hive.ts still contains "${moved}" — this field moved to GitCommitter `
      + '(src/main/gitCommitter.ts) in plan 02-01. Its presence here means either the move was '
      + 'incomplete or a second copy of the committer\'s internal state has been reintroduced.'
    );
  }
});

// ─── 02-02: bootFloor's module-scope discipline (T-P02-02-01, D-03) ─────────
//
// D-02's whole rationale: a file under src/main/floor/** that constructs at
// MODULE SCOPE, or installs a process-global handler there, produces a boot
// test that is green on a crashed boot — the exact repudiation threat
// T-P02-02-01 names. Both clauses below were driven RED before being trusted
// (planted violation / deleted call / deleted directory) — see the commit
// message for the pasted runs; this file only carries the clauses themselves.
//
// This tree is CRLF (`core.autocrlf=true`, no `.gitattributes`) and
// `readStripped` reads raw utf8 with no newline normalisation, so a wrapped
// construction on disk is `=\r\n  new` — every pattern below is written with
// `\r?` for that reason, not decoration.

/** Every .ts file under src/main/floor/, as repo-relative POSIX paths. */
function floorSourceFiles() {
  const dir = path.join(root, 'src', 'main', 'floor');
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => `src/main/floor/${e.name}`);
}

test('no module-scope construction or process handler under src/main/floor/** (T-P02-02-01)', () => {
  const files = floorSourceFiles();
  // Positive half first: D-40's exact trap. Deleting src/main/floor/ entirely
  // must FAIL this clause, not satisfy it — a directory with nothing in it
  // trivially has zero matches for every negative pattern below.
  assert.ok(files.length > 0,
    'src/main/floor/ has no .ts files — either it was deleted or bootFloor never shipped. '
    + 'A missing directory must fail this clause, not satisfy its negative half.');

  const bareConstruction = /^(export )?(const|let|var) [A-Za-z_$][\w$]* *(:[^=\r\n]*)? *= *new /m;
  const wrappedConstruction = /^(export )?(const|let|var) [A-Za-z_$][\w$]* *(:[^=\r\n]*)? *=\r?\n\s*new /m;
  const processOrAppOn = /(^|[^.\w$])(process|app)\.on\(/;

  for (const rel of files) {
    const raw = fs.readFileSync(path.join(root, rel), 'utf8');
    const stripped = stripComments(raw);
    assert.doesNotMatch(stripped, bareConstruction,
      `${rel} constructs at module scope (\`const x = new X(...)\` outside any function) — `
      + 'bootFloor must construct every subsystem INSIDE the function, or a boot test\'s import '
      + 'alone would run the side effect D-02 exists to keep out');
    assert.doesNotMatch(stripped, wrappedConstruction,
      `${rel} constructs at module scope in WRAPPED form (\`const x: T =\\n  new X(...)\`) — `
      + 'the bare-form check above cannot see a construction split across lines');
    assert.doesNotMatch(stripped, processOrAppOn,
      `${rel} installs a process-global or Electron app-global handler `
      + '(process.on(/app.on() — T-P02-02-01: a crashed boot would report green because the '
      + 'handler that would have surfaced the throw is exactly what this file is not allowed to install');
  }

  // Positive half for the construction check: boot.ts DOES construct, just
  // inside bootFloor — at least 20 `new X(...)` sites (D-01: the 14 subsystems
  // plus their Maps), so the negative checks above are proven non-vacuous.
  const bootStripped = stripComments(fs.readFileSync(path.join(root, 'src/main/floor/boot.ts'), 'utf8'));
  const newCount = (bootStripped.match(/\bnew [A-Za-z_$]/g) ?? []).length;
  assert.ok(newCount >= 20,
    `src/main/floor/boot.ts has only ${newCount} \`new X(...)\` sites (comment-stripped) — expected `
    + 'at least 20 (the ~14 subsystems bootFloor constructs, plus their Maps). Fewer than that means '
    + 'either bootFloor stopped constructing something, or the file was gutted.');
});

test('index.ts calls bootFloor and no longer owns SHUTDOWN_STEPS (D-04)', () => {
  const index = readStripped('src/main/index.ts');
  assert.match(index, /bootFloor\(/,
    'src/main/index.ts no longer calls bootFloor(...) — the composition root was extracted into '
    + 'src/main/floor/boot.ts specifically so whenReady could inject it; a floor that never boots '
    + 'this way is dead code behind a passing typecheck');
  assert.doesNotMatch(index, /SHUTDOWN_STEPS/,
    'src/main/index.ts still declares SHUTDOWN_STEPS — the declarative shutdown list moved to '
    + 'src/main/floor/boot.ts\'s Floor.shutdown(); a second copy here is exactly the two-hand-'
    + 'maintained-teardown-paths drift #34 exists to prevent'
  );
});

// ─── 02-12 (wave 9): PARITY-03's LIVE-UNVERIFIED marker pin, re-measured ────
// after the whole phase (D-33, D-35, D-40) ────────────────────────────────
//
// THIS CLAUSE IS THE FILE'S ONE DELIBERATE EXCEPTION TO COMMENT-STRIPPING.
// `LIVE-UNVERIFIED` lives INSIDE comments — every marker below is a comment
// line, by construction (it is how a bridge is marked as unverified) — so a
// `readStripped` read would delete every single one and this clause would
// count zero forever, passing green against any ledger whatsoever (D-40).
// `readRaw`, defined beside `readStripped` below, is the required read path
// for anything in this clause; the file's mandatory comment-stripping and
// this clause's mandatory raw read are both deliberate, not in tension.
//
// Plan 02-07 (wave 4) wrote the first version of this pin. Read at execution
// time: it already called `fs.readFileSync` directly rather than routing
// through `readStripped` — so it was never the vacuous "collapses to zero"
// case D-40 warns about, and RED run 4 below re-proves that rather than
// finding a bug. What wave 4's version did NOT have is a named `readRaw`
// counterpart to `readStripped`, a per-engine lower bound, or a committed
// file-set assertion — all three land here, and this task's fix commit
// (02779b9) also closed a genuine gap wave 4's pin did not catch: `qwen` had
// ZERO raw markers despite being exactly as unverified as pi/opencode/crush
// (02-VALIDATION.md's own operator-account table lists all four together).
// A per-file-and-total pin cannot see a missing per-engine attribution; only
// asserting the attribution itself can, which is the whole reason this task
// adds it rather than trusting wave 4's shape to still be sufficient.
//
// Pinned in BOTH directions — tighter than D-35's one-directional marker
// rule, per D-40 (#39): unmarking a bridge (the count drops) and silently
// shipping a new unverified one (the count rises) both go red, AND unmarking
// one engine while leaving the total untouched (renaming it inside its own
// block) goes red too — RED run 3 below is the proof a count-only pin cannot
// see that case. There is no `live-unverified` field anywhere in the
// provider table (D-35) — this comment-and-regex pin is the only thing that
// can catch any of the three.

/** Every file under `src/` that carries at least one `LIVE-UNVERIFIED`
 *  marker, mapped to its EXACT occurrence count. Re-measure with:
 *  `grep -ro 'LIVE-UNVERIFIED' src/ | cut -d: -f1 | sort | uniq -c`
 *  Re-measured in THIS session by plan 04-10 (2026-08-25), in the same commit
 *  as the two markers it added — never computed by adding a plan's expected
 *  marker count to the previous ledger, and never copied from a plan file or
 *  a prior SUMMARY. Plan 02-12 found a real gap the arithmetic way round.
 *  `src/main/hiveTemplates.ts` went 3 → 5: GATE-03 gave pi a request/response
 *  PreToolUse path and OpenCode a veto, and each carries its own marker.
 *  RE-MEASURED AGAIN by plan 04-13 (2026-08-25, wave 4) with the command above,
 *  in the same commit as the marker it adds. `src/shared/agentProvider.ts`
 *  went 3 → 4: GATE-04's codex sandbox path. The FILE SET is unchanged — no
 *  file gained or lost its first marker — which is why the file-set assertion
 *  below stays green while the two counts move.
 *  RE-MEASURED AGAIN by plan 04-16 (2026-08-25, wave 5) with the command above
 *  in that session, in the same commit as the two markers it adds — not by
 *  adding 2 to plan 04-13's figures. `src/main/hiveTemplates.ts` went 5 → 7:
 *  GATE-05's bounded wait puts a poll loop in `HOOK_SHIM`, and the two markers
 *  say DIFFERENT things. One is kimi's — the loop is real new code and kimi is
 *  one of the three engines that runs this shim, exercised here on Claude's and
 *  codex's contract rather than kimi's, with `hiveTemplates.ts`'s own note that
 *  Moonshot documents a BLOCK as exit code 2 still open. The other is grok's
 *  and agy's — their shims are UNCHANGED and an ask degrades to a deny through
 *  decoders they already ship, a translation `test/gate05-bounded-wait.test.cjs`
 *  case 7 drives as a real child process on this machine, so what is unverified
 *  there is the ENGINE honouring the deny, not the shim writing it. The FILE
 *  SET is unchanged again. */
const MARKER_LEDGER = {
  'src/main/hive.ts': 3,
  'src/main/hiveProvisioning.ts': 5,
  'src/main/hiveTemplates.ts': 7,
  'src/main/index.ts': 1,
  'src/main/webhook.ts': 3,
  'src/shared/agentProvider.ts': 4
};

/** The repo-wide EXACT total of raw `LIVE-UNVERIFIED` occurrences under
 *  `src/` — the sum of MARKER_LEDGER's values, re-measured in THIS session
 *  by plan 04-10 (2026-08-25) with
 *  `grep -rc 'LIVE-UNVERIFIED' src --include=*.ts | grep -v ':0' | awk -F: '{s+=$2} END {print s}'`.
 *  The ONLY reason this number is allowed to change is a real marker being
 *  added or removed in source — never a refactor, a rename, or a change to
 *  how this file strips comments. 18 → 20: GATE-03's two new engine paths.
 *  20 → 21, re-measured by plan 04-13 (2026-08-25, wave 4) with the command
 *  above and NOT by adding one to 20: GATE-04's codex sandbox path ships
 *  built-but-unverified, because this machine's codex auth is dead
 *  (401 `refresh_token_reused`, re-tested live in that session) so the plan's
 *  own live interactive run could not execute. openai/codex#23552 is OPEN and
 *  neither reproduced nor ruled out.
 *  21 → 23, re-measured by plan 04-16 (2026-08-25, wave 5) with the command
 *  above in that session and NOT by adding two to 21: GATE-05's poll loop ships
 *  with one marker for kimi's path through it and one for grok's and agy's
 *  deliberate absence from it. This is also the answer to plan 04-19's
 *  zero-marker sweep for GATE-05 — a decision, recorded, rather than a hole. */
const LIVE_UNVERIFIED_TOTAL = 23;

/** The five engines this project built bridges for and never live-verified
 *  (D-33, D-35), mapped to the MINIMUM number of marker blocks that must
 *  name each: none of these four CLIs is installed on this machine
 *  (`pi`, `opencode`, `crush`, `qwen`), and `kimi`'s bridge is unverified by
 *  construction. Committed here rather than derived from
 *  `agentProvider.ts`'s preset table, because the whole point of the
 *  per-engine assertion below is to catch a bridge that shipped with NO
 *  marker at all — deriving the expected set from the same table the
 *  markers are supposed to describe would let a missing marker hide behind
 *  a missing list entry too.
 *
 *  A per-engine COUNT rather than mere presence, since plan 04-10 (2026-08-25).
 *  `>= 1` cannot see an engine being unmarked in one place while a second,
 *  unrelated marker still names it — the exact shape of the drift the total
 *  pin above also cannot see. The numbers are a live measurement from that
 *  session, not arithmetic: pi 3 → 4 and opencode 4 → 5 because GATE-03 gave
 *  each a second marker (pi's request/response PreToolUse path, OpenCode's
 *  veto), on top of their pre-existing bridge markers. Lowering any of these
 *  is a claim that a real session ran against a real account — say which.
 *
 *  DELIBERATELY UNCHANGED by plan 04-13, which is a decision rather than an
 *  oversight. That plan added a marker on codex's SANDBOX path, and codex is
 *  not in this map: this map is about BRIDGES that were never live-verified,
 *  and codex's bridge is not one of them — codex is installed here (0.128.0)
 *  and its hook bridge does run. Adding `codex` would conflate an unverified
 *  sandbox with an unverified bridge, and the floor would be met by any of the
 *  five pre-existing marker blocks that merely CROSS-REFERENCE codex (kimi's
 *  says "the CODEX case, not the grok case"), so it would pin almost nothing.
 *  Measured, not assumed: 6 blocks name codex with the new marker, 5 without.
 *  The repo-wide total above is what holds the new marker in place.
 *
 *  RAISED FOR kimi ONLY by plan 04-16 (2026-08-25, wave 5), 5 → 6, from a live
 *  run of this file's own `markerBlocks` over `src/` in that session — before
 *  21 blocks {pi 4, opencode 5, crush 1, qwen 1, kimi 5, grok 3, agy 1,
 *  codex 6}, after 23 blocks {pi 4, opencode 5, crush 1, qwen 1, kimi 6,
 *  grok 4, agy 2, codex 7}. GATE-05's poll loop carries a kimi marker, and
 *  raising the floor to the measured value is what stops that marker being
 *  quietly dropped later while the total still balances — the exact drift this
 *  per-engine half exists to catch.
 *
 *  `grok` and `agy` are DELIBERATELY still absent, which is a decision rather
 *  than an oversight and is written down so plan 04-19's sweep finds one. Both
 *  gained a marker block in the same commit (3 → 4 and 1 → 2), and neither CLI
 *  is installed here. But this map is the set plans 04-10 and 04-13 scoped to
 *  bridges that were never live-verified, and adding two engines to it is a
 *  claim about THEIR bridges that this plan neither made nor measured: what
 *  04-16 observed is that their UNCHANGED decoders translate an ask reply into
 *  their own deny, driven as real child processes here
 *  (`test/gate05-bounded-wait.test.cjs` case 7 for grok,
 *  `test/engine-parity.test.cjs` for agy). Widening the map on the back of that
 *  would conflate an unverified engine with an unverified bridge, the same
 *  conflation 04-13 refused for codex. The repo-wide total above is what holds
 *  the grok/agy marker in place. */
const LIVE_UNVERIFIED_ENGINES = {
  pi: 4, opencode: 5, crush: 1, qwen: 1, kimi: 6
};

/** Raw (un-stripped) contents of a repo-relative file. The required read
 *  path for anything counting `LIVE-UNVERIFIED`: the marker IS a comment,
 *  and `readStripped` (above) would erase the very thing being counted. */
const readRaw = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

/** Occurrence count of `needle` in the RAW file at `rel` — comments
 *  included, counted per OCCURRENCE (global regex), never per LINE
 *  (`grep -c` counts matching lines, so two markers sharing one line would
 *  silently score as one). */
function rawOccurrences(rel, needle) {
  return (readRaw(rel).match(new RegExp(needle, 'g')) || []).length;
}

/** For every `LIVE-UNVERIFIED` occurrence in the RAW text of `rel`, the
 *  comment block it sits in — bounded by the block's own structure, never
 *  by a character count: the smallest enclosing `/* ... *\/` (or `/**` doc)
 *  block, or, when the marker sits in `//` comments instead, the maximal
 *  contiguous run of `//` lines touching it. Two markers in the same block
 *  yield the same block text twice — attribution must not silently drop
 *  the second occurrence because its neighbour already answered. */
function markerBlocks(rel) {
  const text = readRaw(rel);
  const blockRanges = [];
  const blockRe = /\/\*[\s\S]*?\*\//g;
  let bm;
  while ((bm = blockRe.exec(text))) blockRanges.push([bm.index, bm.index + bm[0].length]);

  const lines = text.split('\n');
  const lineStart = [0];
  for (const l of lines) lineStart.push(lineStart[lineStart.length - 1] + l.length + 1);
  const lineOf = (idx) => lineStart.findIndex((s, i) => idx >= s && idx < lineStart[i + 1]);

  const blocks = [];
  const markerRe = /LIVE-UNVERIFIED/g;
  let mm;
  while ((mm = markerRe.exec(text))) {
    const enclosing = blockRanges.find(([s, e]) => mm.index >= s && mm.index < e);
    if (enclosing) { blocks.push(text.slice(enclosing[0], enclosing[1])); continue; }
    const lineNo = lineOf(mm.index);
    let start = lineNo;
    while (start > 0 && /^\s*\/\//.test(lines[start - 1])) start--;
    let end = lineNo;
    while (end < lines.length - 1 && /^\s*\/\//.test(lines[end + 1])) end++;
    blocks.push(lines.slice(start, end + 1).join('\n'));
  }
  return blocks;
}

test('PARITY-03: the LIVE-UNVERIFIED ledger is pinned per file, repo-wide, per engine and by file set (D-33/D-35/D-40)', () => {
  let ledgerSum = 0;
  for (const [rel, expected] of Object.entries(MARKER_LEDGER)) {
    const full = path.join(root, rel);
    assert.ok(
      fs.existsSync(full) && fs.statSync(full).isFile() && readRaw(rel).length > 0,
      `${rel} is listed in MARKER_LEDGER but is missing or empty — deleting the bridges (or `
      + 'deleting the file) must FAIL this clause, not satisfy it by removing every match'
    );
    const found = rawOccurrences(rel, 'LIVE-UNVERIFIED');
    assert.equal(
      found, expected,
      `${rel}: expected exactly ${expected} LIVE-UNVERIFIED marker(s), found ${found}. A bridge `
      + 'in this file was unmarked (fewer) or a new unverified one shipped (more) without this '
      + 'ledger being updated to match.'
    );
    ledgerSum += expected;
  }
  assert.equal(
    ledgerSum, LIVE_UNVERIFIED_TOTAL,
    `MARKER_LEDGER sums to ${ledgerSum}, but the committed LIVE_UNVERIFIED_TOTAL is `
    + `${LIVE_UNVERIFIED_TOTAL}. Both are supposed to be the same number measured two ways.`
  );

  // Repo-wide total, over EVERY .ts/.tsx under src/ via the file's own
  // sourceFiles() walker — not a hardcoded file list. This is the check that
  // catches a marker moved INTO (or newly created in) a file MARKER_LEDGER
  // does not mention: every per-file entry above can still balance exactly
  // while this total drifts.
  const allSrcFiles = sourceFiles(path.join(root, 'src'));
  let repoTotal = 0;
  const filesWithMarkers = [];
  for (const rel of allSrcFiles) {
    const n = rawOccurrences(rel, 'LIVE-UNVERIFIED');
    repoTotal += n;
    if (n > 0) filesWithMarkers.push(rel);
  }

  assert.ok(
    repoTotal >= 1,
    'zero LIVE-UNVERIFIED markers anywhere in src/ — either every bridge this project ships is '
    + 'now genuinely live-verified (in which case replace this whole clause with the real '
    + 'evidence) or the markers were silently deleted. An empty ledger must not read as "clean".'
  );

  // The committed FILE SET carrying markers, so a future split that moves
  // them again (as plan 02-01 already did once) shows up in a diff rather
  // than in nobody's head. Checked BEFORE the total-equality assertion below
  // on purpose: a marker added to (or moved into) a file MARKER_LEDGER does
  // not list changes this set without necessarily changing repoTotal (a move
  // nets to zero), so file-set drift needs its own assertion, reachable on
  // its own rather than only as a side effect of the total going stale.
  assert.deepEqual(
    filesWithMarkers.slice().sort(),
    Object.keys(MARKER_LEDGER).slice().sort(),
    `the files actually carrying a LIVE-UNVERIFIED marker (${filesWithMarkers.sort().join(', ')}) `
    + `do not match MARKER_LEDGER's keys (${Object.keys(MARKER_LEDGER).sort().join(', ')}). A `
    + 'marker moved to a file this ledger does not name.'
  );

  assert.equal(
    repoTotal, LIVE_UNVERIFIED_TOTAL,
    `src/ carries ${repoTotal} LIVE-UNVERIFIED marker(s) total (every .ts/.tsx file, enumerated `
    + `via sourceFiles()), but the committed LIVE_UNVERIFIED_TOTAL is ${LIVE_UNVERIFIED_TOTAL}. A `
    + 'marker moved into, or a new one was added in, a file this ledger does not list. Unmarking '
    + 'a bridge is a claim that a real session ran against a real account — which account? '
    + 'Reconcile MARKER_LEDGER and LIVE_UNVERIFIED_TOTAL against a '
    + '`grep -ro \'LIVE-UNVERIFIED\' src/ | cut -d: -f1 | sort | uniq -c` re-measurement before '
    + 'trusting any of the three.'
  );

  // Per-engine: which of the five is named inside each marker's own comment
  // block, attributed structurally (never by character count). A total
  // alone is satisfied by unmarking crush and adding a marker elsewhere —
  // this is the positive half that catches exactly that.
  const engines = Object.keys(LIVE_UNVERIFIED_ENGINES);
  const engineCounts = Object.fromEntries(engines.map((e) => [e, 0]));
  for (const rel of allSrcFiles) {
    for (const block of markerBlocks(rel)) {
      for (const engine of engines) {
        if (new RegExp(`\\b${engine}\\b`, 'i').test(block)) engineCounts[engine]++;
      }
    }
  }
  for (const [engine, floor] of Object.entries(LIVE_UNVERIFIED_ENGINES)) {
    assert.ok(
      engineCounts[engine] >= floor,
      `${engine} has ${engineCounts[engine]} attributed LIVE-UNVERIFIED marker(s), expected >= `
      + `${floor}. Under the zero-recurring-cost rule the honest answer is normally "none, and `
      + `it stays marked" — which account was ${engine}'s bridge verified against, by whom, on `
      + 'what date? If the answer is a real one, replace the marker with the evidence; if not, '
      + 'put the marker back. Re-measure, never subtract: the per-engine floor is a live '
      + 'measurement, and arithmetic over a prior figure is how plan 02-12\'s gap survived.'
    );
  }
});

// ─── 02-12 task 2: all three copies of ADR-0001's one-gate sentence agree ──
// (D-02, D-12) ───────────────────────────────────────────────────────────
//
// `HIVE.md`, `docs/message-queue.md` and `docs/adr/0001-one-gate-for-pty-
// writes.md` each carry their own copy of "the one gate allowed to type into
// a live PTY". A single-site fix leaves the other two stale, which is worse
// than leaving all three stale — the disagreement makes every copy
// untrustworthy. This clause asserts over JOINED text (`tr`-style, in plain
// JS) so a claim wrapped mid-sentence by the file's own formatter cannot
// hide from a line-oriented grep, and pins the ADR's continued existence as
// a positive lower bound so deleting it does not satisfy the negative half.
// The ADR itself belongs to plan 02-03 — asserted here, never edited.

/** repo-relative doc path -> its raw text, joined to one line and squeezed,
 *  same discipline as `joinedSrcText()` above but over a single doc file
 *  rather than the whole source tree (docs are not source; this is the
 *  file-level joiner the `<interfaces>` style note describes). */
function joinedDocText(rel) {
  return readRaw(rel).replace(/\r/g, '').replace(/\n/g, ' ').replace(/ +/g, ' ');
}

const ONE_GATE_DOCS = ['HIVE.md', 'docs/message-queue.md', 'docs/adr/0001-one-gate-for-pty-writes.md'];

test('ADR-0001: all three one-gate copies name the drain, none still hands the title to the deleted useHive.ts effect #4 (D-02/D-12)', () => {
  assert.ok(
    fs.existsSync(path.join(root, 'docs/adr/0001-one-gate-for-pty-writes.md'))
    && readRaw('docs/adr/0001-one-gate-for-pty-writes.md').length > 0,
    'docs/adr/0001-one-gate-for-pty-writes.md is missing or empty — deleting the ADR must FAIL '
    + 'this clause, not satisfy the negative half by removing the stale claim along with it. It '
    + 'belongs to plan 02-03; this clause asserts over it, never edits it.'
  );

  for (const rel of ONE_GATE_DOCS) {
    const joined = joinedDocText(rel);
    const stillClaimsEffect4 =
      /(one place types|the one gate|the one writer).{0,200}useHive\.ts/i.test(joined)
      || /useHive\.ts.{0,200}(the one gate|the one writer)/i.test(joined);
    assert.ok(
      !stillClaimsEffect4,
      `${rel} still hands the one-gate title to useHive.ts's effect #4, which FLOOR-02/D-02 `
      + 'deleted — main\'s DeliveryService.drainQueue() is the one gate now. Matching the bare '
      + 'string "effect #4" is not this assertion: that phrase legitimately survives as history '
      + '(e.g. "the drain used to be useHive.ts effect #4"); this one matches the CLAIM that it '
      + 'still is the gate.'
    );

    const namesMainDrain =
      /(one place types|the one gate|the one writer|single writer).{0,200}(delivery\.ts|drainQueue)/i.test(joined)
      || /(delivery\.ts|drainQueue).{0,200}(the one gate|the one writer|one place types)/i.test(joined);
    assert.ok(
      namesMainDrain,
      `${rel} does not name main's drain (delivery.ts / drainQueue) as the one gate. All three `
      + 'copies of this sentence must describe the same mechanism.'
    );
  }

  assert.ok(
    /drainQueue\(/.test(readRaw('src/main/delivery.ts')),
    'src/main/delivery.ts no longer contains drainQueue( — the three docs above all point at a '
    + 'function that no longer exists.'
  );
});

// ─── 02-12 task 3: README's engine table describes a channel that renders, ─
// and PARITY-02 is stated as what shipped (D-30, D-33, D-34) ──────────────
//
// Both directions, over README.md's joined+squeezed text (a claim wrapped
// mid-sentence by the file's own line width cannot hide from a line grep).
// The renderer-consumer half does NOT duplicate
// test/capability-surface.test.cjs's 'providerCapabilities has >= 1
// production consumer' clause (plan 02-06) — that clause is a pure
// code-surface check with no README involvement. This one pins the
// DOCUMENTATION-TO-RENDERER link: the table exists AND something under
// src/renderer imports the channel, so deleting either half (the doc or the
// consumer) fails, independent of whether the other test file's own clause
// also still passes.

test('README: the engine table documents a channel that renders, and "all eleven" never appears as a cost claim (D-30/D-34)', () => {
  const readme = readRaw('README.md');
  const joined = readme.replace(/\r/g, '').replace(/\n/g, ' ').replace(/ +/g, ' ');

  // Positive half 1: the table exists, counted by its own |-delimited
  // structure (a header separator row `|---|---|` plus >= 5 data rows —
  // never a fixed line-count slice, which silently measures the wrong thing
  // once the table grows or shrinks by a row).
  const tableRows = readme
    .split('\n')
    .filter((line) => /^\|.*\|\s*$/.test(line) && !/^\|\s*---/.test(line) && line.includes('|'));
  assert.ok(
    tableRows.length >= 5,
    `README.md's engine-limitation table has ${tableRows.length} data row(s) (counted by its own `
    + '|-delimited structure), expected >= 5. The table documenting per-engine gaps is gone or '
    + 'collapsed.'
  );

  // Positive half 2: at least one renderer file imports the capability
  // channel — the D-30 headline (zero production consumers before this
  // phase).
  const rendererConsumers = sourceFiles(rendererRoot).filter((rel) =>
    /providerCapabilities|capabilityLine/.test(readStripped(rel))
  );
  assert.ok(
    rendererConsumers.length >= 1,
    'no file under src/renderer imports providerCapabilities or capabilityLine — README documents '
    + 'a channel with zero renderer consumers, exactly D-30\'s defect.'
  );

  // Negative half: no claim that all eleven engines report cost.
  assert.ok(
    !/all eleven[^.]*cost/i.test(joined) && !/eleven engines[^.]*(cost|ledger|breaker)/i.test(joined),
    'README.md still claims "all eleven" engines report cost — PARITY-02 as originally written is '
    + 'unachievable for copilot and custom by construction (D-34); the README must say what shipped, '
    + 'never the unachievable original.'
  );

  // Negative half, pinned to source: copilot and custom still declare
  // costTracking: 'none'. This is D-40's deliberately-fails-on-improvement
  // pin — if a future change gives either one a real cost path, THIS
  // assertion goes red and forces the README paragraph naming them to be
  // rewritten in the same diff, rather than drifting silently true-again.
  const providerSrc = readStripped('src/shared/agentProvider.ts').replace(/\s+/g, ' ');
  for (const engine of ['copilot', 'custom']) {
    const idBlock = providerSrc.slice(providerSrc.indexOf(`id: '${engine}'`), providerSrc.indexOf(`id: '${engine}'`) + 300);
    assert.ok(
      /costTracking: 'none'/.test(idBlock),
      `${engine}'s preset no longer declares costTracking: 'none' — if this is a real new cost `
      + 'path, README.md\'s copilot/custom cost paragraph (task 3, this plan) must be rewritten in '
      + 'the same diff, not left claiming an impossibility that source just disproved.'
    );
  }
});

// ─── 02-12 task 4: SECURITY.md's tunnel entry corrected in the direction ───
// the phase actually moved it (D-13/D-16) ──────────────────────────────────
//
// Both directions, over joined+squeezed text. Negative: the doc no longer
// claims the tunnel cannot be closed. Positive (>= 1 each): the doc names
// the global-lockout caveat; src/main/tunnel.ts still contains the kill
// path (hardKillTree) plan 02-04 delivered; and neither webhook.ts nor
// slack.ts retains its own openTunnel body while both still reference the
// shared helper — asserted over comment-stripped, joined source, with the
// helper reference as the lower bound so deleting the tunnel outright
// (rather than re-inlining it) also fails.

test('SECURITY.md: the tunnel-close claim is corrected, and the three new exposures are named (D-13/D-16/D-23)', () => {
  const joined = readRaw('SECURITY.md').replace(/\r/g, '').replace(/\n/g, ' ').replace(/ +/g, ' ');

  assert.ok(
    !/does not close its tunnel|no handle and no disposer/i.test(joined),
    'SECURITY.md still claims the tunnel cannot be closed. Plan 02-04 made stop() kill the '
    + 'cloudflared child process (hardKillTree) — this is now false in the app\'s favour, which is '
    + 'the harder direction to notice.'
  );

  assert.ok(
    /(lockout|locked out)[\s\S]{0,160}(global|globally|every client|remotely)|(global|globally|remotely)[\s\S]{0,160}(lockout|locked out)/i.test(joined),
    'SECURITY.md does not name the global, remotely-triggerable lockout (D-23) — every caller '
    + 'behind the tunnel presents the tunnel\'s own IP, so per-IP limiting is meaningless.'
  );

  assert.ok(
    /hardKillTree/.test(readStripped('src/main/tunnel.ts')),
    'src/main/tunnel.ts no longer contains hardKillTree — SECURITY.md\'s corrected tunnel-close '
    + 'claim points at a kill path that no longer exists.'
  );

  for (const rel of ['src/main/webhook.ts', 'src/main/slack.ts']) {
    const stripped = readStripped(rel).replace(/\s+/g, ' ');
    assert.ok(
      !/function openTunnel\(/.test(stripped) && !/\bopenTunnel\s*=\s*(async\s*)?\(/.test(stripped),
      `${rel} retains its own openTunnel body — the shared helper in tunnel.ts exists precisely `
      + 'so no server owns a second copy of tunnel-acquisition logic.'
    );
    assert.ok(
      /TunnelHandle|TunnelOpener/.test(stripped),
      `${rel} no longer references the shared tunnel helper's types (TunnelHandle/TunnelOpener) — `
      + 'deleting the tunnel outright must fail this clause too, not just re-inlining it.'
    );
  }
});

/* ── FLOOR-04: one padded file must not disable the scanner for the rest ──
 *
 * gitCommitter's own header documented this as ACTIVE BYPASS 2:
 *
 *   "seq 20001 > pad.txt in the same debounce window pushes --numstat past
 *    SECRET_SCAN_MAX_LINES and sends the WHOLE commit, secret included, down
 *    the `committing UNSCANNED` path."
 *
 * i.e. a single agent-controllable command walked a credential into history by
 * making the commit merely LARGE. Not theoretical — it fired twice on an
 * operator's machine (105,089 and 106,609 lines) before anyone looked at the log.
 *
 * The cap now applies PER FILE. A genuinely enormous single file is still
 * skipped, and named; it can no longer take its neighbours with it. */
test('FLOOR-04: the line cap is applied per file, not to the whole staged diff', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'gitCommitter.ts'), 'utf8');
  const fn = src.slice(src.indexOf('private async scrubStagedSecrets'));

  // The whole-diff early return is what made one pad file fatal. It must be gone.
  assert.ok(!/reason: 'diff-too-large'/.test(fn),
    "the whole-commit 'diff-too-large' skip must not exist: it let one padded file send every "
    + 'other file in the commit, secret included, into history unscanned');

  // Over-cap commits must now take a per-file path that still scans what it can.
  assert.ok(/secret-scan-chunked/.test(fn),
    'an over-cap commit must fall back to per-file scanning, not to skipping everything');
  assert.ok(/scanned \$\{parts\.length\}\/\$\{rows\.length\} files individually/.test(fn),
    'the operator must be told how many files were actually scanned');

  // And the files it could NOT scan must be named — "which file went unscanned"
  // is the question an operator actually has, and the old message could not answer it.
  assert.ok(/UNSCANNED: \$\{skipped\.join/.test(fn),
    'skipped files must be named individually, not summarised as a line count');

  // The per-file cap comparison must be against that file's own line count.
  assert.ok(/lines > SECRET_SCAN_MAX_LINES/.test(fn),
    'the cap must be compared against each FILE\'s line count, not the commit total');
});

// ─── GATE-04 (04-13): the Settings sandbox group says what it does ───────────
//
// The copy is fixed by 04-UI-SPEC rule S-4 and pinned VERBATIM, because the
// sub-label is the operator's escape hatch: this feature's own failure mode is a
// floor that silently stops working at 3am, and "turn it off if this engine stops
// writing" is the sentence that gets them back out. A paraphrase loses that.
test('GATE-04: the Settings sandbox group carries rule S-4\'s copy verbatim, with a DERIVED count', () => {
  const settings = readRaw('src/renderer/src/components/SettingsModal.tsx');

  for (const copy of [
    "Codex — sandbox off (today's behaviour)",
    'Codex — sandbox on, agent folder writable',
    'Applies to newly spawned agents. Turn it off if this engine stops writing.'
  ]) {
    assert.ok(settings.includes(copy), `rule S-4 copy missing or paraphrased: ${copy}`);
  }

  // Rule S-3: ONE row per sandbox-capable engine, and the rest named in one quiet
  // sentence whose number is DERIVED. A hard-coded "ten" is the failure this pins —
  // when a second engine gains support the row appears and the number must drop by
  // itself, with no edit here and no stale sentence left behind.
  assert.equal(
    (settings.match(/other ten engines/g) || []).length, 0,
    'the "other N engines" count is hard-coded. It must be derived from the preset '
    + 'table, so a second sandbox-capable engine moves the row list and the number together.'
  );
  assert.ok(
    /AGENT_PROVIDER_PRESETS\.length - sandboxEngines\.length/.test(settings),
    'the count must be the preset table minus the sandbox-capable engines'
  );
  assert.ok(
    /sandboxEngines\.map\(/.test(settings),
    'rows must be mapped from the derived sandbox-capable list, never written out one by one'
  );

  // D-33/D-40: the positive lower bound beside the negatives. The derivation must
  // actually produce ONE row and TEN others today — a derivation that yields zero
  // rows would satisfy every assertion above while showing the operator nothing.
  const shared = readRaw('src/shared/agentProvider.ts');
  const capable = (shared.match(/^\s{4}sandboxFlags:/gm) || []).length;
  const presets = (shared.match(/^\s{4}id: '/gm) || []).length;
  assert.equal(capable, 1, 'D-15: exactly one engine ships the opt-in');
  assert.equal(presets - capable, 10, 'and the sentence therefore says ten');
});

// AddAgentModal is a READ-ONLY reflection of that setting, never a second control:
// a per-engine setting with two controls in two places is how the two splice sites
// drift in the UI as well as in the code (L-08 / T-04-SBX-04).
test('GATE-04: AddAgentModal previews the sandbox without offering a second control', () => {
  const modal = readRaw('src/renderer/src/components/AddAgentModal.tsx');
  assert.ok(
    modal.includes('Command (auto mode on · sandbox on)'),
    'the command preview must report the sandbox when it is on'
  );
  // Narrowly: it must never WRITE providerSandbox. It legitimately writes other
  // config (registeredRepos, agentTokenCaps), so a blanket "no updateConfig" ban
  // would be a false claim about this file — the invariant is about THIS key.
  assert.ok(
    !/providerSandbox\s*:/.test(modal),
    'AddAgentModal must never WRITE providerSandbox — Settings owns that control, and a '
    + 'per-engine setting with two controls in two places drifts exactly like the two splices do'
  );
  // …but it must still READ it, or the preview label is decorative (D-33/D-40's
  // positive bound: this is what proves the negative above is not vacuous).
  assert.ok(
    /config\.providerSandbox\?\.\[provider\]/.test(modal),
    'the preview must READ providerSandbox, or the sandbox label can never appear'
  );
});

test('FLOOR-04: the bypass register does not claim a bypass that is now closed', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'gitCommitter.ts'), 'utf8');
  const header = src.slice(0, src.indexOf('private async scrubStagedSecrets'));
  const two = header.slice(header.indexOf('2. THE LINE CAP'), header.indexOf('3. THE BYTE CAP'));
  assert.ok(/CLOSED/.test(two),
    'bypass 2 is closed in code, so the register must say so. A source comment that documents '
    + 'a bypass which no longer exists is the same defect class as one that documents a '
    + 'mitigation it does not enforce — the next reader trusts it either way.');
});

// ───────────────────────────────────────────────────────────────────────────
// GATE-05 (plan 04-18, wave 6) — the desktop approval route, asserted at every
// hop it has to cross.
//
// D-45's reason for these living here rather than in a SUMMARY: a grep that
// lives in a report rots, and every one of these is a security property. The
// counts are MEASURED, per file and per direction — a bare `grep -c` over two
// files prints `file:count` per file and compares against nothing, which is how
// the round-3 draft of this criterion managed to assert nothing at all.
// ───────────────────────────────────────────────────────────────────────────

/** Occurrences (not lines) of a literal in a comment-stripped source file. */
const strippedHits = (rel, needle) => readStripped(rel).split(needle).length - 1;

test('GATE-05: the approval EVENT channel is reused — no second main→renderer name', () => {
  // `control:approvalRequest` already existed and is already named for this.
  // One send in main, one on + one removeListener in the preload. Unchanged by
  // plan 04-18: the answer needs a name of its own, the event does not.
  assert.equal(strippedHits('src/main/hooks.ts', "'control:approvalRequest'"), 1,
    'the ask event has more than one publisher in main, or none');
  assert.equal(strippedHits('src/preload/index.ts', "'control:approvalRequest'"), 2,
    'the preload subscription no longer pairs `on` with `removeListener` — a 1 means the unsubscribe leaks, a 3 means a second channel was added for an event that already had one');
});

test('GATE-05: the ANSWER is exactly one new renderer→main invoke channel', () => {
  // The other direction, which DOES need a name: an ipcMain.handle must have
  // one. Exactly one, and the same spelling on both sides of the bridge.
  assert.equal(strippedHits('src/main/index.ts', "'control:answerApproval'"), 1,
    'the answer handler is missing, or registered twice');
  assert.equal(strippedHits('src/preload/index.ts', "'control:answerApproval'"), 1,
    'the preload no longer invokes the answer channel, or invokes it from two places');

  const main = readStripped('src/main/index.ts');
  assert.equal(main.split("ipcMain.handle('control:").length - 1, 9,
    'the `control:` handler count moved off 9 (measured 8 before plan 04-18 added the answer) — exactly one handler was added and no other was dropped');

  // The settle routes through HookServer's NAMED accessor, never a second
  // registry: two registries means an ask answered on the desktop stays open on
  // the phone, and the shim polls whichever one it was opened in.
  assert.match(main, /hookServer\.answerApproval\(/,
    'the desktop settle does not reach ApprovalRegistry through HookServer.answerApproval — a second registry would let the same ask be answered twice, with opposite verdicts');
});

test('GATE-05: the renderer names NEITHER channel literal — contextIsolation makes the preload the only place they can live', () => {
  // `contextIsolation: true` and the `cth` bridge mean every channel literal
  // stays in the preload. Comment-stripped, so the JSDoc at useHive.ts:345 that
  // legitimately MENTIONS `control:approvalRequest` cannot redden a security
  // gate and push an executor into deleting a comment to make it pass.
  assert.equal(strippedHits('src/renderer/src/hooks/useHive.ts', 'control:'), 0,
    'a channel literal crossed the bridge into the renderer');

  // D-33/D-40's positive lower bound over the SAME stripped text, so an emptied
  // or unparsed file cannot satisfy the negative above.
  assert.ok(strippedHits('src/renderer/src/hooks/useHive.ts', 'window.cth') >= 30,
    'useHive subscribes through fewer than the 30 measured `window.cth` hops — the negative above is now passing on a file that lost its subscriptions');
});

test('ADR-0001: the approval answer is not a second PTY typer', () => {
  // The whole of T-04-ASK-21. `writePty` must be exactly where it already was:
  // the PTY-parser-derived reasons BlockedBanner's callers were written for.
  // Plan 04-18 branches AROUND that path on `askId` and adds no new call site.
  assert.equal(strippedHits('src/renderer/src/hooks/useHive.ts', 'writePty'), 2,
    'the writePty count in useHive moved — an ask must reach ApprovalRegistry.answer through the IPC and the hook return, never a live PTY (ADR-0001)');
  for (const rel of [
    'src/renderer/src/components/AgentDetailPanel.tsx',
    'src/renderer/src/components/CommandCenterPanel.tsx'
  ]) {
    assert.equal(strippedHits(rel, 'writePty'), 1,
      `${rel} gained or lost a writePty call. The existing path survives unchanged for non-ask reasons; the ask path must not acquire one`);
  }
});

test('GATE-05 rule G-3: the desktop countdown is re-derived from an anchor, never decremented', () => {
  const rel = 'src/renderer/src/components/BlockedBanner.tsx';
  const src = readStripped(rel);

  // A backgrounded window throttles intervals, so a decremented counter drifts
  // arbitrarily far in the OPTIMISTIC direction — it tells the operator they have
  // time to answer a question that has already auto-denied.
  assert.equal(/remaining\s*(--|-=)|--\s*remaining|setRemaining\(/.test(src), false,
    'the countdown decrements a counter instead of re-deriving from its anchor');

  // D-33/D-40's positive bound over the same text, so the negative above cannot be
  // satisfied by a banner that never counts at all.
  assert.ok(strippedHits(rel, 'receivedAt') >= 2,
    'the countdown anchor is not both written and read');
  assert.ok(strippedHits(rel, 'expiresInMs') >= 1,
    "main's measured duration is not consumed");
  assert.equal(strippedHits(rel, 'expiresAt'), 0,
    'a deadline TIMESTAMP reached the banner. The renderer clock is not main\'s, and the whole reason main sends a duration is that the two never have to agree');
});
