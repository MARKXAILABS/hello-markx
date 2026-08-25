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
