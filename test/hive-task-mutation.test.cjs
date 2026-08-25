'use strict';

/**
 * Regression for the 2026-08-15 webhook-card loss: ASK ME had read an eight-card
 * ledger, the webhook appended card nine, then ASK ME overwrote tasks.json with
 * its stale eight-card snapshot while recording an answer. Renderer actions must
 * mutate one card against the latest main-process ledger instead of replacing the
 * whole collection they happened to read earlier.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

// Strip line and block comments before any source-text pin — see
// test/repo-claims.test.cjs's own header for why an unstripped pin is a
// vacuous gate a comment can satisfy on its own.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-task-mutate-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return new HiveManager(() => home);
}

/** `floor(t)` does NOT call `ensureHive()`, so `hive/bin/task.cjs` is not on
 * disk — the `--q`/`askedBy` cases in this file drive the REAL generated CLI
 * (the shape `hive-protocol-v2.test.cjs:107-143` uses), so they need their
 * own fixture that does. */
function floorWithCli(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-task-mutate-cli-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  const cli = path.join(home, 'hive', 'bin', 'task.cjs');
  assert.ok(fs.existsSync(cli), 'the ledger CLI ships with the hive skeleton');
  const run = (env, ...args) => {
    const res = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env });
    assert.equal(res.status, 0, `task.cjs ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
    return JSON.parse(res.stdout.trim());
  };
  return { home, hive, cli, run };
}

function card(id, extra = {}) {
  return {
    id,
    title: id,
    status: 'todo',
    dependsOn: [],
    priority: 3,
    createdAt: '2026-08-15T08:00:00.000Z',
    ...extra
  };
}

function tasks(hive) {
  return hive.tasks().tasks;
}

test('patching a stale UI card preserves a concurrently appended webhook card', (t) => {
  const hive = floor(t);
  const question = card('needs-human', {
    status: 'blocked',
    humanQA: [{ q: 'Which option?', askedAt: '2026-08-15T08:00:00.000Z' }]
  });
  hive.writeTasks([question]);

  // The renderer still holds this one-card snapshot when the webhook arrives.
  const staleQuestion = structuredClone(tasks(hive)[0]);
  const webhook = card('webhook-1', {
    webhook: { tokenHash: 'a'.repeat(64) }
  });
  assert.equal(hive.addTask(webhook), true);

  staleQuestion.humanQA[0].a = 'Option B';
  staleQuestion.humanQA[0].answeredAt = '2026-08-15T08:00:01.000Z';
  assert.equal(hive.patchTask(staleQuestion.id, { humanQA: staleQuestion.humanQA }), true);

  assert.deepEqual(tasks(hive).map((task) => task.id), ['needs-human', 'webhook-1']);
  assert.equal(tasks(hive)[0].humanQA[0].a, 'Option B');
  assert.equal(tasks(hive)[1].webhook.tokenHash, 'a'.repeat(64));
});

test('atomic add is idempotent and delete removes only the named card', (t) => {
  const hive = floor(t);
  hive.writeTasks([card('existing')]);

  assert.equal(hive.addTask(card('new')), true);
  assert.equal(hive.addTask(card('new', { title: 'duplicate' })), false);
  assert.equal(hive.deleteTask('existing'), true);
  assert.equal(hive.deleteTask('missing'), false);

  assert.deepEqual(tasks(hive).map((task) => task.id), ['new']);
  assert.equal(tasks(hive)[0].title, 'new');
});

test('patch refuses an unknown card without rewriting the ledger', (t) => {
  const hive = floor(t);
  hive.writeTasks([card('existing')]);
  const before = hive.tasks();

  assert.equal(hive.patchTask('missing', { status: 'done' }), false);

  const after = hive.tasks();
  assert.equal(after.rev, 1,
    'the ledger revision advanced on a REFUSED patch, so the whole collection was written back '
    + 'anyway — the #17 clobber this file exists for, and one no card-content check can see');
  assert.deepEqual(after.tasks.map((c) => c.id), ['existing']);

  // D-22 (#34): rows read back through `hive:tasks` now also carry the card's
  // meter — `tokens` spent, the `budgetTokens` cap and `pct`. Those three are
  // DERIVED per read, not card data (`writeTasks` strips them before persisting),
  // so the card content is compared on its own and the meter is pinned beside it
  // rather than the whole widened row being compared to a bare card literal.
  // VIGIL-04 widened the persisted card with `updatedAt` — the card's own clock,
  // stamped by writeTasks when the seed above created it. It is real card data
  // (unlike the meter), so it is pulled out and asserted on its own terms rather
  // than dropped: a refused patch must leave it byte-identical too, which is a
  // strictly stronger statement than the shape comparison it is lifted out of.
  const { tokens, budgetTokens, pct, updatedAt, ...persisted } = after.tasks[0];
  assert.deepEqual(persisted, card('existing'),
    'a refused patch changed the card that WAS there');
  assert.equal(updatedAt, before.tasks[0].updatedAt,
    'a refused patch moved the surviving card\'s clock — its content did not change, so its '
    + '`last changed` timestamp must not either');
  assert.equal(typeof updatedAt, 'string',
    'the seeding write must have stamped the card at all — a never-written clock would '
    + 'satisfy the byte-identity check above while measuring nothing');
  assert.deepEqual({ tokens, budgetTokens, pct }, { tokens: 0, budgetTokens: null, pct: null },
    'an untouched card with no cap must meter as no spend and no cap — a null cap that reads '
    + 'as 0 would put every capless card permanently over budget');
});

// ─── D-37 — `askedBy` is recorded from the environment, and only the environment ───

test('AGENT_ID patch --q records the calling agent as askedBy and blocks the card', (t) => {
  const { hive, run } = floorWithCli(t);
  hive.writeTasks([card('needs-human')]);

  const patched = run({ ...process.env, AGENT_ID: 'jim-1' }, 'patch', 'needs-human', '--q', 'which account?');
  assert.equal(patched.task.status, 'blocked');
  assert.equal(patched.task.humanQA.at(-1).askedBy, 'jim-1');
  assert.equal(tasks(hive).find((c) => c.id === 'needs-human').humanQA.at(-1).askedBy, 'jim-1');
});

test('with AGENT_ID absent from the child env, patch --q records askedBy: god', (t) => {
  const { hive, run } = floorWithCli(t);
  hive.writeTasks([card('needs-human')]);

  // Build a FRESH env object with the key deleted, never merely set empty —
  // an empty string is still a truthy assignment site and `process.env.AGENT_ID`
  // on an empty string is falsy in JS either way, but a stray case-variant key
  // left in the object would satisfy `process.env.AGENT_ID` on Windows, where
  // the environment block is case-insensitive. Assert the constructed env is
  // really clean before trusting the run.
  const env = { ...process.env };
  delete env.AGENT_ID;
  const leftover = Object.keys(env).filter((k) => /^AGENT_ID$/i.test(k));
  assert.deepEqual(leftover, [], 'the child env must carry no AGENT_ID key in any case variant');

  const patched = run(env, 'patch', 'needs-human', '--q', 'which account?');
  assert.equal(patched.task.humanQA.at(-1).askedBy, 'god');
});

test('a pre-existing humanQA entry has no askedBy key at all — back-compat, not just undefined', (t) => {
  const hive = floor(t);
  hive.writeTasks([card('legacy', {
    status: 'blocked',
    humanQA: [{ q: 'an old question', askedAt: '2026-08-15T08:00:00.000Z' }]
  })]);

  const entry = tasks(hive).find((c) => c.id === 'legacy').humanQA[0];
  // `=== undefined` is what a BROKEN writer that sets `askedBy: undefined`
  // also produces — Object.hasOwn is the assertion that actually distinguishes
  // "the key was never written" from "the key was written as undefined".
  assert.equal(Object.hasOwn(entry, 'askedBy'), false);
});

test('--askedBy is not an accepted flag — the environment value wins regardless', (t) => {
  const { hive, run } = floorWithCli(t);
  hive.writeTasks([card('needs-human')]);

  const patched = run({ ...process.env, AGENT_ID: 'jim-1' }, 'patch', 'needs-human', '--q', 'which account?', '--askedBy', 'evil-1');
  assert.equal(patched.task.humanQA.at(-1).askedBy, 'jim-1');
  assert.ok(!JSON.stringify(patched.task).includes('evil-1'), 'evil-1 must appear nowhere on the card');
});

test('a second --q appends without touching the first entry\'s askedBy, and patchTask round-trips askedBy', (t) => {
  const { hive, run } = floorWithCli(t);
  hive.writeTasks([card('needs-human')]);

  run({ ...process.env, AGENT_ID: 'jim-1' }, 'patch', 'needs-human', '--q', 'first question?');
  run({ ...process.env, AGENT_ID: 'pam-1' }, 'patch', 'needs-human', '--q', 'second question?');

  const humanQA = tasks(hive).find((c) => c.id === 'needs-human').humanQA;
  assert.deepEqual(humanQA.map((e) => e.askedBy), ['jim-1', 'pam-1']);

  // This is the exact write AskMeTab's `sendAnswer` performs when the human
  // answers: patchTask with a spread-updated humanQA array. If that patch path
  // drops askedBy, task 2's recipient resolver is built on sand.
  const answered = humanQA.map((e, i) => (i === 0 ? { ...e, a: 'Option B', answeredAt: '2026-08-15T09:00:00.000Z' } : e));
  assert.equal(hive.patchTask('needs-human', { humanQA: answered }), true);
  const roundTripped = tasks(hive).find((c) => c.id === 'needs-human').humanQA;
  assert.equal(roundTripped[0].a, 'Option B');
  assert.equal(roundTripped[0].askedBy, 'jim-1', 'askedBy must survive the answer-write round trip');
  assert.equal(roundTripped[1].askedBy, 'pam-1');
});

// ─── D-36/D-37/D-39 — the answer reaches the asker, sourced as text (test/load-ts.cjs
// cannot load AskMeTab.tsx — `Cannot find module '@/store/store'`, verified this
// session — so these four clauses are asserted over comment-stripped source, not
// executed behaviour) ───

function askMeTabSource() {
  const root = path.resolve(__dirname, '..');
  return stripComments(fs.readFileSync(path.join(root, 'src/renderer/src/components/AskMeTab.tsx'), 'utf8'))
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/ +/g, ' ');
}

test('AskMeTab: the to: \'god\' hardcode is gone and recipientOf() is wired and defined', () => {
  const src = askMeTabSource();
  assert.ok((src.match(/to: 'god'/g) ?? []).length <= 1, 'at most one literal to: \'god\' (the god-addressed send may still name it)');
  assert.ok((src.match(/recipientOf\(/g) ?? []).length >= 2, 'recipientOf( must have at least two call sites');
  assert.ok((src.match(/const recipientOf|function recipientOf/g) ?? []).length >= 1, 'recipientOf must actually be defined, not just called');
});

test('AskMeTab: recipientOf resolves the D-37 chain — askedBy, assignee, then god', () => {
  const src = askMeTabSource();
  assert.ok(src.includes('askedBy'));
  assert.ok(src.includes('assignee'));
  assert.ok(src.includes("'god'"));
});

test('AskMeTab: D-39 holds structurally — two sends, one god-addressed, the unblock phrase present', () => {
  const src = askMeTabSource();
  assert.ok((src.match(/hiveSend\(/g) ?? []).length >= 2, 'at least two hiveSend( calls (2a and 2b)');
  assert.ok(src.includes("to: 'god'"), 'a god-addressed send must exist');
  assert.ok((src.match(/unblock the card/g) ?? []).length >= 1, 'the unblock phrase must survive in the god\'s message');
});

test('AskMeTab: askedBy survives the answer write — the entry mapper spreads, not rebuilds', () => {
  const src = askMeTabSource();
  assert.ok((src.match(/\{ \.\.\.e, a: text/g) ?? []).length >= 1,
    'sendAnswer must spread the existing humanQA entry ({ ...e, a: text… }) rather than rebuild it from named fields — a rebuild is exactly the mutation that would silently drop askedBy');
});

test('renderer task actions never send a whole stale ledger back to main', () => {
  const root = path.resolve(__dirname, '..');
  const preload = fs.readFileSync(path.join(root, 'src/preload/index.ts'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/index.ts'), 'utf8');
  const sources = [
    'src/renderer/src/components/AskMeTab.tsx',
    'src/renderer/src/components/TaskDetailOverlay.tsx',
    'src/renderer/src/components/TasksKanban.tsx',
    'src/renderer/src/hooks/useHive.ts'
  ].map((file) => fs.readFileSync(path.join(root, file), 'utf8'));

  for (const source of sources) {
    assert.doesNotMatch(source, /hiveWriteTasks\s*\(/,
      'renderer code must use atomic task IPC rather than overwrite tasks.json');
  }
  assert.doesNotMatch(preload, /hiveWriteTasks\s*:/,
    'the renderer bridge must not expose the unsafe whole-ledger write primitive');
  assert.doesNotMatch(main, /ipcMain\.handle\('hive:writeTasks'/,
    'main must not accept whole-ledger writes from a stale renderer');
  assert.match(sources[0], /hivePatchTask\s*\(/);
  assert.match(sources[1], /hivePatchTask\s*\(/);
  assert.match(sources[2], /hiveDeleteTask\s*\(/);
  // FLOOR-02 moved the Slack-origin kanban promotion OUT of useHive.ts — it
  // lived in the drain's `.then()`, and the drain is main's now — into main's
  // `onQueueDelivered`. A card minted by the renderer is a card that is NOT
  // minted with the window closed, which is the exact hole that migration exists
  // to close, so the anchor follows the behaviour rather than being dropped.
  // The contract this test guards is untouched: nothing writes a whole ledger.
  assert.doesNotMatch(sources[3], /hiveAddTask\s*\(/,
    'the Slack-origin card promotion belongs to main now; a renderer that mints it does not mint it with the window closed');
  // 02-02 moved the DeliveryService construction (onQueueDelivered included)
  // out of index.ts into src/main/floor/boot.ts's bootFloor(); the hook itself
  // is unchanged, only its file.
  const boot = fs.readFileSync(path.join(root, 'src/main/floor/boot.ts'), 'utf8');
  const hook = boot.indexOf('onQueueDelivered:');
  assert.ok(hook > 0,
    'main lost its post-delivery hook — Slack-origin work would stop becoming a kanban card at all');
  // Sliced to that hook's own block, so an unsliced match here would stay
  // green with the promotion deleted.
  assert.match(boot.slice(hook, boot.indexOf('\n  },', hook)), /hive\.addTask\(/,
    "main's Slack-origin promotion must go through the atomic addTask, never a whole-ledger rewrite");
});

/* ── the PreToolUse gate must not deny the floor's own protocol (operator-found) ──
 *
 * Measured live, 2026-08-25: the god ran the exact command the injected prompt tells
 * every agent to run —
 *
 *   "<hive>\bin\hive-node.cmd" "<hive>\bin\task.cjs" add "…"
 *
 * — reported "adding kanban card assigned to Jim", and the gate answered DENY_BIN.
 * tasks.json stayed at 0 tasks. Both words are paths INTO <hive>/bin, and the Bash
 * branch of protectedPathDenial pushes EVERY path-shaped word as a candidate write
 * target, so the floor's own kanban CLI was denied on every call. The only visible
 * symptom was a kanban that silently never filled. */
test('the gate carves out the protocol executables, and does so on TWO conditions', () => {
  const src = stripComments(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'hooks.ts'), 'utf8'));

  // 1. The allow-list exists and names exactly the executables the prompt mandates.
  const setStart = src.indexOf('PROTOCOL_BIN_EXECUTABLES');
  assert.ok(setStart > 0, 'the protocol-executable allow-list must exist');
  const setBlock = src.slice(setStart, setStart + 260);
  for (const exe of ['hive-node', 'task.cjs', 'kg.cjs']) {
    assert.ok(setBlock.includes(exe),
      `${exe} is named in the injected prompt as a command every agent runs — denying it `
      + 'breaks the protocol the same prompt mandates');
  }

  // 2. The carve-out requires BOTH a basename match AND the absence of a write marker.
  //    Either alone is unsafe: filename-only lets `cat >> <hive>/bin/task.cjs` through,
  //    and write-marker-only re-opens all of <hive>/bin.
  const carve = src.slice(src.indexOf('const writeMarker'), src.indexOf('const writeMarker') + 900);
  assert.ok(/!writeMarker\s*&&\s*PROTOCOL_BIN_EXECUTABLES\.has\(/.test(carve),
    'the carve-out must require BOTH conditions — a filename allow-list alone would admit '
    + 'a redirect that overwrites the shim the whole floor executes');

  // 3. The write marker must be tested on the RAW command, BEFORE the split — the split
  //    regex consumes `>` and `>>`, so after it a redirect is invisible.
  const splitAt = carve.indexOf('.split(');
  const markerAt = carve.indexOf('.test(expanded)');
  assert.ok(markerAt > 0 && markerAt < splitAt,
    'writeMarker must be evaluated on the unsplit command: the split regex eats `>` and '
    + '`>>`, so testing after it cannot see a redirect at all');
});

test('the write marker still catches the redirect and mutation shapes that target the shim', () => {
  const src = stripComments(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'hooks.ts'), 'utf8'));
  const line = src.split('\n').find((l) => l.includes('const writeMarker'));
  assert.ok(line, 'sanity: the write marker must exist');
  const body = src.slice(src.indexOf('const writeMarker'), src.indexOf('.test(expanded)'));
  const re = new RegExp(body.slice(body.indexOf('/') + 1, body.lastIndexOf('/i')), 'i');

  // These MUST be seen as writes — each one mutates a file the whole floor executes.
  for (const attack of [
    'cat >> "C:/h/bin/task.cjs"',
    'echo x > C:/h/bin/hive-node.cmd',
    'cp evil.cjs C:/h/bin/task.cjs',
    'mv evil.cjs C:/h/bin/kg.cjs',
    'rm C:/h/bin/task.cjs',
    'Copy-Item evil.cjs C:/h/bin/task.cjs',
    'Set-Content C:/h/bin/task.cjs "x"',
    'tee C:/h/bin/task.cjs',
    'sed -i s/a/b/ C:/h/bin/task.cjs'
  ]) {
    assert.ok(re.test(attack), `must be treated as a WRITE and stay denied: ${attack}`);
  }

  // And these MUST NOT — they are the protocol's own read/execute calls.
  for (const ok of [
    '"C:/h/bin/hive-node.cmd" "C:/h/bin/task.cjs" add "Ship it"',
    '"C:/h/bin/hive-node.cmd" "C:/h/bin/task.cjs" claim t-1',
    '"C:/h/bin/hive-node.cmd" "C:/h/bin/kg.cjs" search "policy"'
  ]) {
    assert.equal(re.test(ok), false,
      `the protocol's own command must not read as a write: ${ok}`);
  }
});

/* ── the frame rule must not refuse ordinary POSIX paths (operator-found) ──
 *
 * Measured live 2026-08-25, from the deny log added the same session:
 *
 *   PreToolUse DENIED agent=god tool=Bash: … cannot FRAME this target …
 *     | target: cat "C:\…\hive\agents\god\memory.md" 2>/dev/null | tail -100
 *     | target: ls -la /c/Users/Alienware/…/hive/agents/god/inbox/
 *
 * god was refused on reading its OWN memory and its OWN inbox. The first spells
 * its path absolutely and STILL failed: the word split turns `2>/dev/null` into
 * the word `/dev/null`, and the rooted-relative rule's `[\/]` class matched the
 * forward slash. So every command using the commonest redirect on the platform
 * was denied, along with every Git-Bash `/c/...` path the agent's shell emits. */
test('driveRelative refuses only genuinely unframable shapes, not POSIX absolutes', () => {
  const src = stripComments(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'hooks.ts'), 'utf8'));
  const fn = src.slice(src.indexOf('function driveRelative'), src.indexOf('function driveRelative') + 400);

  // The rooted-relative rule must be BACKSLASH-only. A `[\/]` class there also
  // matches every forward-slash-rooted path, which on win32 is not a Windows path
  // at all -- it is an ordinary POSIX/MSYS one.
  assert.ok(/return\s+\/\^\\\\/.test(fn) || fn.includes('/^\\[^\\/]+[\\/]/'),
    'the rooted-relative rule must anchor on a BACKSLASH only. With a [\\/] class it also '
    + 'refuses /dev/null (from the ubiquitous 2>/dev/null) and every Git-Bash /c/... path, '
    + "which is how god lost read access to its own memory and inbox.");
  assert.ok(!/return\s+\/\^\[\\\\\/\]/.test(fn),
    'the old [\\/] character class must be gone from the rooted-relative rule');
});

/* ── VIGIL-04 — every ledger mutation stamps a card-level `updatedAt` ──
 *
 * "A card nine hours in `doing`" is unmeasurable without a per-card clock:
 * `HiveTask` carried `createdAt` and nothing else, so a card that was created
 * this morning and touched a minute ago read the same as one nobody has opened
 * since. The field is stamped by BOTH writers — `bin/task.cjs`, which agents
 * mutate through, and `HiveManager.writeTasks`, which the kanban UI, inbound
 * webhooks, Slack and the voice read-layer all pass through. A TASK_CLI-only
 * stamp measures the age from the wrong clock in exactly the case a human
 * touched the card.
 *
 * Four SEPARATE verb cases below, never one parameterised loop: a loop is the
 * shape that stays green with three verbs unstamped and the fourth carrying the
 * assertion (04-VALIDATION § Anti-Vacuous-Pass Rules, the VIGIL-04 row). */

/** A timestamp old enough to be unmistakably NOT "now", seeded straight onto
 *  disk so a stamp that fires can be told from one that does not. */
const SEEDED = '2026-08-15T08:00:00.000Z';

/** `floor(t)` hides its home, and `writeTasks` now stamps everything it writes —
 *  so a card in the pre-phase legacy shape (`createdAt`, no `updatedAt`), or one
 *  carrying a known-old stamp, can only be put on disk behind the writer's back. */
function floorWithLedger(t, cards, rev = 0) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-task-seed-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  fs.writeFileSync(
    path.join(home, 'hive', 'tasks.json'),
    JSON.stringify({ tasks: cards, rev, updatedAt: SEEDED }, null, 2),
    'utf8');
  return { home, hive };
}

/** The card as it is PERSISTED — `tasks()` widens every row with the derived
 *  meter (`tokens`/`budgetTokens`/`pct`), which is not card data. */
function persisted(hive, id) {
  const { tokens, budgetTokens, pct, ...rest } = tasks(hive).find((c) => c && c.id === id) ?? {};
  void tokens; void budgetTokens; void pct;
  return rest;
}

function assertIsoAtOrAfter(updatedAt, createdAt, what) {
  assert.equal(typeof updatedAt, 'string', `${what}: updatedAt must be an ISO string, got ${updatedAt}`);
  assert.equal(new Date(updatedAt).toISOString(), updatedAt,
    `${what}: updatedAt must be ISO 8601, got ${updatedAt}`);
  assert.ok(Date.parse(updatedAt) >= Date.parse(createdAt),
    `${what}: updatedAt (${updatedAt}) predates createdAt (${createdAt})`);
}

test('bin/task.cjs add stamps updatedAt, exactly equal to createdAt', (t) => {
  const { hive, run } = floorWithCli(t);
  const added = run(process.env, 'add', 'ship the thing');

  assertIsoAtOrAfter(added.task.updatedAt, added.task.createdAt, 'add');
  assert.equal(added.task.updatedAt, added.task.createdAt,
    'a brand-new card must read 0s old, not a millisecond of jitter');
  assert.equal(persisted(hive, added.task.id).updatedAt, added.task.createdAt,
    'the stamp must reach tasks.json, not just the CLI stdout');
});

test('bin/task.cjs patch stamps updatedAt at or after createdAt', (t) => {
  const { hive, run } = floorWithCli(t);
  hive.writeTasks([card('to-patch')]);

  const patched = run(process.env, 'patch', 'to-patch', '--title', 'renamed');
  assert.equal(patched.task.title, 'renamed');
  assertIsoAtOrAfter(patched.task.updatedAt, patched.task.createdAt, 'patch');
  assert.equal(persisted(hive, 'to-patch').updatedAt, patched.task.updatedAt);
});

test('bin/task.cjs claim stamps updatedAt at or after createdAt', (t) => {
  const { hive, run } = floorWithCli(t);
  hive.writeTasks([card('to-claim')]);

  const claimed = run({ ...process.env, AGENT_ID: 'jim-1' }, 'claim', 'to-claim');
  assert.equal(claimed.task.status, 'doing');
  assertIsoAtOrAfter(claimed.task.updatedAt, claimed.task.createdAt, 'claim');
  assert.equal(persisted(hive, 'to-claim').updatedAt, claimed.task.updatedAt);
});

test('bin/task.cjs done stamps updatedAt at or after createdAt', (t) => {
  const { hive, run } = floorWithCli(t);
  hive.writeTasks([card('to-finish')]);

  const finished = run(process.env, 'done', 'to-finish', '--result', 'shipped');
  assert.equal(finished.task.status, 'done');
  assertIsoAtOrAfter(finished.task.updatedAt, finished.task.createdAt, 'done');
  assert.equal(persisted(hive, 'to-finish').updatedAt, finished.task.updatedAt);
});

test('a main-side patchTask (the mutateTasks path) stamps updatedAt too', (t) => {
  const { hive } = floorWithLedger(t, [card('main-side', { updatedAt: SEEDED })], 4);

  assert.equal(hive.patchTask('main-side', { status: 'doing' }), true);
  const after = persisted(hive, 'main-side');
  assertIsoAtOrAfter(after.updatedAt, after.createdAt, 'patchTask');
  assert.notEqual(after.updatedAt, SEEDED,
    'the kanban / webhook / Slack writers must move the clock too, or a human-touched card '
    + 'is aged from the wrong one');
});

test('a direct writeTasks stamps only the card that changed — an unchanged sibling keeps its updatedAt byte-for-byte', (t) => {
  // src/main/index.ts:1061 (webhook card creation) and index.ts:4166 →
  // realtimeActions.ts:360,427,446,497 (voice) call writeTasks DIRECTLY, bypassing
  // mutateTasks entirely — a stamp placed in mutateTasks misses every one of them.
  const { hive } = floorWithLedger(t, [
    card('touched', { updatedAt: SEEDED }),
    card('untouched', { updatedAt: SEEDED })
  ], 4);

  // Rows straight out of tasks() — the exact objects those five call sites hand back,
  // derived meter and all.
  const ledger = hive.tasks();
  const next = ledger.tasks.map((c) => (c.id === 'touched' ? { ...c, status: 'doing' } : c));
  assert.equal(hive.writeTasks(next, ledger.rev), true);

  const touched = persisted(hive, 'touched');
  assertIsoAtOrAfter(touched.updatedAt, touched.createdAt, 'writeTasks');
  assert.notEqual(touched.updatedAt, SEEDED, 'the changed card must be re-stamped');
  assert.equal(persisted(hive, 'untouched').updatedAt, SEEDED,
    'an UNCHANGED card was re-stamped: HiveTask.updatedAt has silently become a duplicate of '
    + 'the ledger-level updatedAt and no card can ever look stale (T-04-AGE-10)');
});

test('a legacy card — createdAt present, updatedAt absent — survives a patch and gains one', (t) => {
  const { hive } = floorWithLedger(t, [card('legacy-card')], 4);
  assert.equal(Object.hasOwn(persisted(hive, 'legacy-card'), 'updatedAt'), false,
    'sanity: the seed must be the pre-phase shape every card on disk today has');

  assert.equal(hive.patchTask('legacy-card', { status: 'doing' }), true);
  const after = persisted(hive, 'legacy-card');
  assert.equal(after.status, 'doing', 'the patch itself must succeed on a legacy card');
  assert.equal(after.createdAt, '2026-08-15T08:00:00.000Z',
    'createdAt must come through byte-identical — the new field is additive, not a rewrite');
  assertIsoAtOrAfter(after.updatedAt, after.createdAt, 'legacy patch');
});

test('reading the ledger without mutating leaves updatedAt byte-identical', (t) => {
  const { hive } = floorWithLedger(t, [card('idle', { updatedAt: SEEDED })], 4);

  const first = persisted(hive, 'idle').updatedAt;
  const second = persisted(hive, 'idle').updatedAt;
  assert.equal(first, SEEDED, 'a plain read must not stamp the card');
  assert.equal(second, first, 'two reads with no mutation between must agree byte-for-byte');

  // D-33/D-40 — the positive lower bound beside the negative. A field that never
  // moves at all satisfies both assertions above and measures nothing.
  assert.equal(hive.patchTask('idle', { priority: 1 }), true);
  assert.notEqual(persisted(hive, 'idle').updatedAt, SEEDED,
    'the clock did not move on a real mutation either — the field measures nothing');
});

test('a legacy tasks.json round-trips through writeTasks byte-identically', (t) => {
  const { hive } = floorWithLedger(t, [card('legacy-roundtrip')], 4);
  const before = JSON.stringify(persisted(hive, 'legacy-roundtrip'));

  const ledger = hive.tasks();
  assert.equal(hive.writeTasks(ledger.tasks, ledger.rev), true);

  assert.equal(JSON.stringify(persisted(hive, 'legacy-roundtrip')), before,
    'an unmodified legacy card was rewritten by a write that changed nothing about it');
  assert.equal(Object.hasOwn(persisted(hive, 'legacy-roundtrip'), 'updatedAt'), false,
    'and it was not given the key as undefined either — Object.hasOwn is what tells those apart');
});
