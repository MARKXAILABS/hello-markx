'use strict';

/**
 * SCALE-04 — the daily digest: its scheduler, its content builder, and (in the
 * second half of this file) the three delivery arms driven through a REAL
 * booted floor.
 *
 * ── WHY THE TIMEZONE IS PINNED, AT THE TOP, BEFORE ANY OTHER REQUIRE ─────────
 * `msUntilNextLocalHour` steps to the next day with `setDate(+1)` rather than by
 * adding 86_400_000, and the ONLY thing that can tell those two apart is a
 * calendar day that is not 24 hours long. The developer machine this was written
 * on is Asia/Calcutta, which has never observed DST, and the CI runners are UTC:
 * on all of them a `+86_400_000` implementation passes every assertion below.
 * So the process is moved to a zone that DOES transition, and the two DST cases
 * assert 23h and 25h EXACTLY. Node re-reads `process.env.TZ` on assignment, and
 * `node --test` gives each test FILE its own process, so nothing else in the
 * suite sees this.
 */
process.env.TZ = 'America/New_York';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

/** Does THIS process's Date actually observe the DST the pin above asked for?
 *  A host that ignores `process.env.TZ` must skip the two exact-offset cases
 *  LOUDLY rather than assert a false green against a zone it is not in. */
const DST_LIVE =
  new Date(2026, 0, 1).getTimezoneOffset() !== new Date(2026, 6, 1).getTimezoneOffset();

const at = (y, m, d, h, mi, s, ms) => new Date(y, m, d, h, mi, s, ms).getTime();

// ─── Part 1: msUntilNextLocalHour — pure, fixed clock ───────────────────────

test('SCALE-04: msUntilNextLocalHour fires one second later when the hour is one second away', () => {
  const { msUntilNextLocalHour } = loadTs('src/main/floor/boot.ts');
  assert.equal(msUntilNextLocalHour(9, at(2026, 4, 12, 8, 59, 59, 0)), 1000);
});

test('SCALE-04: exactly AT the hour returns 0 — fire now, not in a full day', () => {
  const { msUntilNextLocalHour } = loadTs('src/main/floor/boot.ts');
  assert.equal(
    msUntilNextLocalHour(9, at(2026, 4, 12, 9, 0, 0, 0)), 0,
    'a process that arms exactly on the hour must fire, not sleep 24 hours. A `<=` here '
    + 'instead of `<` skips the whole day and the operator gets silence.'
  );
});

test('SCALE-04: one millisecond PAST the hour waits for tomorrow, not today', () => {
  const { msUntilNextLocalHour } = loadTs('src/main/floor/boot.ts');
  // 09:00:01 -> tomorrow 09:00:00 is a full day minus one second.
  assert.equal(msUntilNextLocalHour(9, at(2026, 4, 12, 9, 0, 1, 0)), 86_400_000 - 1000);
  assert.equal(msUntilNextLocalHour(9, at(2026, 4, 12, 9, 0, 0, 1)), 86_400_000 - 1);
});

test('SCALE-04: a spring-forward day is 23 hours long and the wait says so', (t) => {
  if (!DST_LIVE) {
    t.diagnostic('MEASUREMENT UNAVAILABLE — this process ignored process.env.TZ, so no DST '
      + 'transition is reachable and the 23h/25h arithmetic cannot be checked here.');
    t.skip('host has no DST zone available');
    return;
  }
  const { msUntilNextLocalHour } = loadTs('src/main/floor/boot.ts');
  // 2026-03-08 is the US spring-forward. Saturday 09:00 EST -> Sunday 09:00 EDT
  // is TWENTY-THREE hours. This is the case a `now + 86_400_000` implementation
  // gets wrong by a full hour, twice a year, silently.
  assert.equal(
    msUntilNextLocalHour(9, at(2026, 2, 7, 9, 0, 1, 0)), 23 * 3600_000 - 1000,
    'the next local 9am across a spring-forward is 23 hours away, not 24 — this is what '
    + 'setDate(+1) buys over adding 86_400_000'
  );
  // ...and the hour that does not exist at all. 02:00 on 2026-03-08 is skipped
  // by the clock; asking for it must normalise forward, never go negative.
  const skipped = msUntilNextLocalHour(2, at(2026, 2, 8, 1, 30, 0, 0));
  assert.ok(skipped > 0 && Number.isFinite(skipped),
    `asking for an hour the clock skips returned ${skipped}`);
});

test('SCALE-04: a fall-back day is 25 hours long and the wait says so', (t) => {
  if (!DST_LIVE) {
    t.diagnostic('MEASUREMENT UNAVAILABLE — process.env.TZ was ignored by this host.');
    t.skip('host has no DST zone available');
    return;
  }
  const { msUntilNextLocalHour } = loadTs('src/main/floor/boot.ts');
  // 2026-11-01 is the US fall-back. Saturday 09:00 EDT -> Sunday 09:00 EST is
  // TWENTY-FIVE hours.
  assert.equal(msUntilNextLocalHour(9, at(2026, 9, 31, 9, 0, 1, 0)), 25 * 3600_000 - 1000);
});

test('SCALE-04: never negative, never NaN, never more than 25 hours — a year of hours', () => {
  const { msUntilNextLocalHour } = loadTs('src/main/floor/boot.ts');
  let now = at(2026, 0, 1, 0, 0, 0, 0);
  for (let i = 0; i < 24 * 400; i++) {
    for (const hour of [0, 9, 23]) {
      const ms = msUntilNextLocalHour(hour, now);
      assert.ok(Number.isFinite(ms) && ms >= 0 && ms <= 25 * 3600_000,
        `msUntilNextLocalHour(${hour}, ${new Date(now).toString()}) = ${ms}`);
    }
    now += 3600_000 + 137; // a prime-ish step so the sweep lands off the hour too
  }
});

test('SCALE-04: DIGEST_DEFAULT_HOUR is a real named numeric constant, not a placeholder', () => {
  const { DIGEST_DEFAULT_HOUR } = loadTs('src/main/floor/boot.ts');
  assert.equal(typeof DIGEST_DEFAULT_HOUR, 'number');
  assert.ok(Number.isInteger(DIGEST_DEFAULT_HOUR) && DIGEST_DEFAULT_HOUR >= 0 && DIGEST_DEFAULT_HOUR <= 23,
    `DIGEST_DEFAULT_HOUR is ${DIGEST_DEFAULT_HOUR}, which is not an hour of the day`);
});

// ─── Part 2: buildDigestContent — pure, called directly with fixtures ────────

const DAY = { startMs: at(2026, 4, 11, 0, 0, 0, 0), endMs: at(2026, 4, 12, 0, 0, 0, 0) };
const LABEL = 'zz-fixture-project';

function content(over = {}) {
  const { buildDigestContent } = loadTs('src/main/floor/boot.ts');
  const o = {
    costRows: [], tasks: [], day: DAY, label: LABEL, gapNone: 0, gapTranscript: 0, ...over
  };
  return buildDigestContent(o.costRows, o.tasks, o.day, o.label, o.gapNone, o.gapTranscript);
}

test('SCALE-04 / D-31: the identity stamp is in the content, near the top', () => {
  const out = content();
  assert.ok(out.includes(LABEL), 'the project label is absent — two projects firing into one '
    + 'Slack channel at the same hour would produce indistinguishable posts (D-31, LOCKED)');
  // "near the top", asserted rather than hoped: within the first three lines.
  const lines = out.split('\n');
  assert.ok(lines.slice(0, 3).some((l) => l.includes(LABEL)),
    `the label appears only at line ${lines.findIndex((l) => l.includes(LABEL)) + 1} — buried is not stamped`);
});

test('SCALE-04: the spend total is the sum of the rows it was HANDED', () => {
  const out = content({
    costRows: [
      { ts: DAY.startMs + 1, agentId: 'a', taskId: 't1', usd: 0.25, tokens: 100 },
      { ts: DAY.startMs + 2, agentId: 'b', taskId: null, usd: 0.5, tokens: 200 },
      { ts: DAY.startMs + 3, agentId: 'a', taskId: 't2', usd: 0.25, tokens: 300 }
    ]
  });
  assert.ok(out.includes('$1.0000'), `spend total missing or wrong:\n${out}`);
  assert.ok(out.includes('600 tokens'), `token total missing or wrong:\n${out}`);
  assert.ok(out.includes('t1') && out.includes('t2'), 'the cards that carried spend are not named');
});

test('SCALE-04: board counts are CURRENT state and the content never claims a per-day completion', () => {
  const tasks = [
    { id: 'a', title: 'A', status: 'todo', dependsOn: [], priority: 1, createdAt: '' },
    { id: 'b', title: 'B', status: 'doing', dependsOn: [], priority: 1, createdAt: '' },
    { id: 'c', title: 'C', status: 'done', dependsOn: [], priority: 1, createdAt: '' },
    { id: 'd', title: 'D', status: 'done', dependsOn: [], priority: 1, createdAt: '' },
    { id: 'e', title: 'E', status: 'blocked', dependsOn: [], priority: 1, createdAt: '' }
  ];
  const out = content({ tasks });
  assert.ok(out.includes('todo 1'), out);
  assert.ok(out.includes('doing 1'), out);
  assert.ok(out.includes('blocked 1'), out);
  assert.ok(out.includes('done 2'), out);
  assert.ok(out.includes('doneAt'),
    'the content does not declare that a card carries no doneAt — without that sentence "done 2" '
    + 'reads as "two cards were finished on this day", which this ledger cannot support');
  for (const forbidden of [/completed (yesterday|today|on this day)/i, /finished (yesterday|today) /i, /cards? (completed|finished) (yesterday|today)/i]) {
    assert.doesNotMatch(out, forbidden,
      `the content implies a per-day completion (${forbidden}) — HiveTask has no doneAt, so no `
      + 'arithmetic over this ledger can produce that number');
  }
});

test('SCALE-04: only UNANSWERED questions asked INSIDE the day reach "waiting on you"', () => {
  const iso = (ms) => new Date(ms).toISOString();
  const tasks = [
    { id: 'in', title: 'In range', status: 'blocked', dependsOn: [], priority: 1, createdAt: '',
      humanQA: [{ q: 'WHICH-BRANCH', askedAt: iso(DAY.startMs + 3600_000) }] },
    { id: 'answered', title: 'Answered', status: 'doing', dependsOn: [], priority: 1, createdAt: '',
      humanQA: [{ q: 'ALREADY-ANSWERED', askedAt: iso(DAY.startMs + 10), a: 'yes', answeredAt: iso(DAY.startMs + 20) }] },
    { id: 'old', title: 'Old', status: 'blocked', dependsOn: [], priority: 1, createdAt: '',
      humanQA: [{ q: 'LAST-WEEK', askedAt: iso(DAY.startMs - 7 * 86_400_000) }] },
    { id: 'later', title: 'Later', status: 'blocked', dependsOn: [], priority: 1, createdAt: '',
      humanQA: [{ q: 'TOMORROW', askedAt: iso(DAY.endMs + 10) }] }
  ];
  const out = content({ tasks });
  assert.ok(out.includes('WHICH-BRANCH'), 'an unanswered question asked inside the day is missing');
  assert.ok(!out.includes('ALREADY-ANSWERED'), 'an ANSWERED question is still being asked for');
  assert.ok(!out.includes('LAST-WEEK'), 'a question from a different day leaked into this digest');
  assert.ok(!out.includes('TOMORROW'), 'a question asked after the day covered leaked in');
});

// The four gap-declaration branches. Run as four independent cases, because the
// one that actually bites (b) is the one a single merged count silently loses.

test('SCALE-04 / D-35 (a): none-tier only -> the meter sentence alone', () => {
  const out = content({ gapNone: 2, gapTranscript: 0 });
  assert.ok(out.includes('2 agent(s) report no cost meter; their spend is not in this total.'), out);
  assert.ok(!out.includes('never reaches the cost ledger'),
    'the transcript-tier sentence rendered with a count of 0 — an unconditional declaration is boilerplate');
});

test('SCALE-04 / D-35 (b): a floor of ONLY codex agents still gets a declaration', () => {
  // costGapNone is 0 here. This is the exact case a single merged count loses:
  // the seven 'none' presets are absent, the one 'transcript' preset is all
  // there is, and the digest would otherwise ship a bare spend figure that is
  // silently missing every dollar those agents spent.
  const out = content({ gapNone: 0, gapTranscript: 1 });
  assert.ok(
    out.includes('1 agent(s) report spend only from their own transcripts — that spend never reaches the cost ledger this total is drawn from.'),
    `the transcript-tier declaration is missing on a codex-only floor:\n${out}`
  );
  assert.ok(!out.includes('no cost meter'),
    'the meter sentence rendered with a count of 0, and it is the WRONG sentence for this tier — '
    + "a codex agent's meter works; it is the ledger hop that is missing");
});

test('SCALE-04 / D-35 (c): both tiers present -> both sentences, separately', () => {
  const out = content({ gapNone: 3, gapTranscript: 1 });
  assert.ok(out.includes('3 agent(s) report no cost meter'), out);
  assert.ok(out.includes('1 agent(s) report spend only from their own transcripts'), out);
});

test('SCALE-04 / D-35 (d): neither tier present -> neither sentence', () => {
  const out = content({ gapNone: 0, gapTranscript: 0 });
  assert.ok(!out.includes('no cost meter'), 'the meter declaration is unconditional boilerplate');
  assert.ok(!out.includes('never reaches the cost ledger'), 'the ledger declaration is unconditional boilerplate');
});

// ─── Part 3: the SHUTDOWN_STEPS entry ───────────────────────────────────────
//
// Same named-pin shape, and for the same reason, as boot-floor.test.cjs's
// restorePointTimer / watchdogTimer pins: the digest timer is a module-level
// `let`, so the "every subsystem appears in the shutdown list" coverage test
// there walks Object.keys(floor) and cannot see it. Without this pin an
// un-cleared digest timer fails by keeping `node --test` ALIVE FOREVER rather
// than by a red assertion — D-30's own hang-not-red warning.

test('SCALE-04: digestTimer is declared in the boot module and cleared by SHUTDOWN_STEPS', () => {
  const { SHUTDOWN_STEPS } = loadTs('src/main/floor/boot.ts');
  const shutdownSource = SHUTDOWN_STEPS.map((s) => s.stop.toString()).join('\n');
  const bootSource = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'floor', 'boot.ts'), 'utf8'
  );
  assert.match(bootSource, /^let digestTimer: MissionTimer \| null = null;$/m,
    "SCALE-04's timer is not declared in boot.ts's module `let` block — it has nowhere to live "
    + 'that shutdown can reach');
  assert.match(shutdownSource, /clearDigestTimer\(\)/,
    'the digest timer is armed by startHiveServices but never cleared. An un-cleared setTimeout '
    + 'keeps the process alive past shutdown, and the boot test fails that by HANGING');
  assert.ok(SHUTDOWN_STEPS.some((s) => s.name === 'clearDigestTimer'),
    'no SHUTDOWN_STEPS entry is NAMED clearDigestTimer — shutdown() logs by step name, so an '
    + 'unnamed step is an unattributable failure');
});

// ─── Part 4: the delivery arms, driven through a REAL booted floor ──────────
//
// A `.toString()` assertion proves the SOURCE mentions deps.notify. It cannot
// prove the file is written, cannot prove the toast fires, and cannot prove the
// project stamp survives to any of the arms. Four Phase-4 features on this
// codebase shipped fully wired and doing nothing while every grep stayed green,
// so the arms below are driven end to end and the sinks are read back.

let userData;
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    app: {
      getPath: (name) => (name === 'userData' ? userData : path.join(userData, name)),
      getAppPath: () => userData,
      isPackaged: false,
      getVersion: () => '0.0.0-test'
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(`enc:${s}`, 'utf8'),
      decryptString: (b) => Buffer.from(b).toString('utf8').replace(/^enc:/, '')
    },
    Notification: class { show() { /* noop */ } static isSupported() { return false; } }
  }
};

function writeCfg(obj) {
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify(obj, null, 2), 'utf8');
}

/** A fresh (userData, harnessHome) pair with config.json pre-seeded, exactly as
 *  test/boot-floor.test.cjs does it. `slackEnabled:false` and no webhook
 *  triggers: a unit test must never open a real outbound anything. */
function floorEnv(t, extra) {
  userData = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-digest-')));
  // The label the digest must stamp is basename(harnessHome), so the directory
  // gets a distinctive prefix and the assertion reads the real value back.
  const harnessHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'zzdigestproj-')));
  writeCfg({ harnessHome, slackEnabled: false, webhookTriggers: [], notifications: false, ...extra });
  const thisUserData = userData;
  t.after(() => {
    try { fs.rmSync(thisUserData, { recursive: true, force: true }); } catch { /* best-effort */ }
    try { fs.rmSync(harnessHome, { recursive: true, force: true }); } catch { /* best-effort */ }
  });
  return { userData: thisUserData, harnessHome, label: path.basename(harnessHome) };
}

function fakeDeps(env) {
  const sent = [];
  const notified = [];
  return {
    deps: {
      paths: () => ({ userData: env.userData, logs: path.join(env.userData, 'logs'), appPath: env.userData }),
      version: '0.0.0-test',
      packaged: false,
      secrets: {
        available: () => true,
        encrypt: (s) => `enc:${s}`,
        decrypt: (s) => s.replace(/^enc:/, '')
      },
      notify: (a) => { notified.push(a); },
      send: (channel, payload) => { sent.push({ channel, payload }); return true; },
      quit: () => { /* noop */ },
      focus: () => { /* noop */ },
      syncKeepAwake: () => { /* noop */ },
      respawnCore: async () => ({ ok: true }),
      startWorkerWatcher: () => { /* noop */ }
    },
    sent,
    notified
  };
}

/** The local YYYY-MM-DD of the day the digest covers — yesterday, written out
 *  longhand here so the test is not checking the implementation against itself. */
function yesterdayKey(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  const two = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

test('SCALE-04: the file arm writes a stamped digest under the hive root, with no config at all', async (t) => {
  const env = floorEnv(t);
  const { deps, sent } = fakeDeps(env);
  const { bootFloor, fireDigest } = loadTs('src/main/floor/boot.ts');
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  const target = path.join(floor.hive.root(), `digest-${yesterdayKey()}.md`);
  fs.rmSync(target, { force: true }); // clear whatever the boot-time catch-up may have left
  const sentBefore = sent.length;

  await fireDigest();

  assert.ok(fs.existsSync(target),
    `no digest at ${target}. The file arm is the ONLY arm with no config gate — if it grows one, `
    + 'a headless operator gets nothing at all');
  const body = fs.readFileSync(target, 'utf8');
  assert.ok(body.includes(env.label),
    `the digest on disk does not name the project (${env.label}) — D-31, LOCKED:\n${body}`);

  // Pitfall 2, asserted rather than grepped. deps.send returns FALSE with no
  // window; a digest routed through it is a silent no-op on exactly the machine
  // SCALE-04 exists for.
  assert.equal(sent.length, sentBefore,
    `fireDigest pushed ${sent.length - sentBefore} message(s) through deps.send: `
    + JSON.stringify(sent.slice(sentBefore)));
});

test('SCALE-04: the toast arm is gated on dailyDigest — NOT on the notifications field', async (t) => {
  const env = floorEnv(t, { dailyDigest: false, notifications: true });
  const { deps, notified, sent } = fakeDeps(env);
  const { bootFloor, fireDigest } = loadTs('src/main/floor/boot.ts');
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  notified.length = 0;
  await fireDigest();
  assert.equal(notified.length, 0,
    'the digest toasted with dailyDigest OFF, while `notifications` was ON. `notifications` is '
    + 'documented as "agent lifecycle events" — borrowing it makes the digest toggle a decoration');

  writeCfg({ harnessHome: env.harnessHome, slackEnabled: false, webhookTriggers: [], notifications: false, dailyDigest: true });
  const sentBefore = sent.length;
  await fireDigest();
  // The deps.send pin belongs HERE as well as on the file-arm case: with the
  // toggle OFF the toast arm never runs, so that case cannot see a toast
  // rerouted through the renderer channel. This one can.
  assert.equal(sent.length, sentBefore,
    `the toast arm pushed ${sent.length - sentBefore} message(s) through deps.send, which returns `
    + `FALSE with no window: ${JSON.stringify(sent.slice(sentBefore))}`);
  assert.equal(notified.length, 1, 'the digest did NOT toast with dailyDigest ON');
  assert.ok(notified[0].title.includes(env.label),
    `the toast title does not name the project: ${JSON.stringify(notified[0])}`);
  assert.ok(typeof notified[0].body === 'string' && notified[0].body.length > 0,
    'the toast has no body — a title-only toast tells the operator nothing happened');
});

test('SCALE-04 / D-30: catch-up on arm — a machine started past the fire hour is not silent', async (t) => {
  // digestHour 0: whatever hour this suite runs at, "now is past the fire hour"
  // is true, so bootFloor's own armDigestTimer must fire the catch-up.
  const env = floorEnv(t, { digestHour: 0 });
  const { deps } = fakeDeps(env);
  const { bootFloor, startHiveServices } = loadTs('src/main/floor/boot.ts');
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  const target = path.join(floor.hive.root(), `digest-${yesterdayKey()}.md`);
  assert.ok(fs.existsSync(target),
    'bootFloor completed past the fire hour with nothing sent today, and wrote no digest. '
    + 'Without catch-up-on-arm a machine that was asleep at 9am gets silence until tomorrow');

  // ...and exactly once. A re-arm (a second startHiveServices, which index.ts
  // really does call after onboarding) must not re-send today's digest.
  fs.rmSync(target, { force: true });
  startHiveServices();
  assert.ok(!fs.existsSync(target),
    'the digest was re-sent on a second arm. The last-sent stamp is what makes catch-up safe; '
    + "without it every re-arm is another copy in the operator's Slack");
});

test('SCALE-04: a floor armed BEFORE its fire hour sends nothing yet', async (t) => {
  const hourNow = new Date().getHours();
  if (hourNow === 23) {
    t.diagnostic('MEASUREMENT UNAVAILABLE — this suite is running in the 23:00 hour, so there is '
      + 'no later hour today to arm against and the negative half cannot be driven.');
    t.skip('no future hour left in the local day');
    return;
  }
  const env = floorEnv(t, { digestHour: 23 });
  const { deps } = fakeDeps(env);
  const { bootFloor } = loadTs('src/main/floor/boot.ts');
  const floor = await bootFloor(deps);
  t.after(() => floor.shutdown());

  assert.ok(!fs.existsSync(path.join(floor.hive.root(), `digest-${yesterdayKey()}.md`)),
    `armed at ${hourNow}:00 with a fire hour of 23:00 and the digest went out anyway — the `
    + 'catch-up branch fires unconditionally, which makes it fire-on-every-boot, not catch-up');
});

test('SCALE-04: fireDigest calls deps.notify and never deps.send (structural, T-03-05d)', () => {
  const { fireDigest } = loadTs('src/main/floor/boot.ts');
  // COMMENT-STRIPPED, both directions. `Function.prototype.toString` returns the
  // comments too, so an unstripped check is satisfiable by a comment that merely
  // NAMES deps.notify — and fails on a comment that merely names deps.send.
  // Neither is what this pin is about. Same helper shape as repo-claims.test.cjs.
  const src = fireDigest.toString().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(src.includes('deps.notify'),
    'fireDigest does not CALL deps.notify — the toast arm is not in this function');
  assert.equal(src.includes('deps.send'), false,
    'fireDigest routes through deps.send, which returns FALSE with no window attached. That is a '
    + 'silent no-op on exactly the headless machine SCALE-04 exists for');
});
