'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { ControlRegistry } = loadTs('src/main/control.ts');

test('auto-delivery pause is independent from tool pause and halt', () => {
  const control = new ControlRegistry();
  control.pauseAutoDelivery('dev1', true);

  assert.equal(control.isAutoDeliveryPaused('dev1'), true);
  assert.equal(control.snapshot('dev1').autoDeliveryPaused, true);
  assert.equal(control.snapshot('dev1').paused, false);
  assert.equal(control.snapshot('dev1').halted, false);

  control.resume('dev1');
  assert.equal(control.isAutoDeliveryPaused('dev1'), true, 'normal resume must not spend queued work');
  control.pauseAutoDelivery('dev1', false);
  assert.equal(control.isAutoDeliveryPaused('dev1'), false);
});

test('persisted delivery pauses replace stale in-memory state', () => {
  const control = new ControlRegistry();
  control.pauseAutoDelivery('old', true);
  control.replaceAutoDeliveryPauses(['dev2', 'dev3']);

  assert.equal(control.isAutoDeliveryPaused('old'), false);
  assert.equal(control.isAutoDeliveryPaused('dev2'), true);
  assert.equal(control.isAutoDeliveryPaused('dev3'), true);
});

// ─── GATE-05: ApprovalRegistry (plan 04-15 task 1) ───────────────────────────
//
// Extended here rather than in a new file for the reason this file already
// models: a pure, electron-free main module driven with an INJECTED clock.
// `ApprovalRegistry` is the same shape of thing as `ControlRegistry` — no
// syscalls, no `electron`, no timers of its own — so it belongs beside it.
//
// Every case below drives the registry with a `now()` the test owns. A registry
// that read the wall clock could only be tested by sleeping, and a test that
// sleeps for a two-minute TTL gets deleted by the next person who waits for it.

const { ApprovalRegistry } = loadTs('src/main/approvals.ts');

/** `PHONE_TASK_ID_RE`, copied as a LITERAL from src/main/webhook.ts:231, where
 *  it is enforced at :670 BEFORE `answerAsk` is called. An ask id that fails it
 *  produces a 400 the operator reads as "the floor is broken", so the shape is
 *  asserted here rather than eyeballed (04-UI-SPEC rule G-1). Copied rather than
 *  imported on purpose: importing the module-under-test's own constant would
 *  make the assertion true by construction. */
const PHONE_TASK_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

/** A registry on a clock the test owns. `ttlMs` defaults to 50 so an expiry is
 *  a number bump, never a sleep. */
function registryAt(t0 = 1_770_000_000_000, ttlMs = 50) {
  let clock = t0;
  const published = [];
  const reg = new ApprovalRegistry({
    ttlMs,
    now: () => clock,
    publish: (open) => published.push(open)
  });
  return {
    reg,
    published,
    advance: (ms) => { clock += ms; },
    clock: () => clock
  };
}

const ASK = { agentId: 'a1', tool: 'Bash', command: 'git push origin +main', reason: 'because' };

test('GATE-05: an ask id is unguessable, hex, and satisfies the phone regex', () => {
  const { reg } = registryAt();
  const entry = reg.open(ASK);

  assert.match(entry.id, /^ask-[0-9a-f]{16,}$/, 'the id must be `ask-` plus at least 64 bits of hex');
  assert.match(
    entry.id, PHONE_TASK_ID_RE,
    'the id fails webhook.ts:231\'s PHONE_TASK_ID_RE, so POST /phone/api/answer would 400 on it '
    + 'at :670 before answerAsk ever ran — the operator reads that as a broken floor'
  );
  assert.ok(entry.id.length <= 128, `the id is ${entry.id.length} chars — past the regex's own bound`);

  // The id is not derivable from anything the caller supplied.
  assert.ok(!entry.id.includes(String(entry.openedAt)), 'the id encodes openedAt');
  assert.ok(!entry.id.includes(ASK.agentId), 'the id encodes the agent id');
});

test('GATE-05: 1000 generated ids are all distinct', () => {
  const { reg } = registryAt();
  const ids = new Set();
  for (let i = 0; i < 1000; i += 1) ids.add(reg.open(ASK).id);
  assert.equal(ids.size, 1000, 'two ask ids collided — the id is not random enough to be a capability');
});

test('GATE-05: expiresAt is openedAt + ttlMs, and both come from the injected clock', () => {
  const t0 = 1_770_000_000_000;
  const { reg } = registryAt(t0, 120_000);
  const entry = reg.open(ASK);

  assert.equal(entry.openedAt, t0, 'openedAt did not come from the injected clock');
  assert.equal(entry.expiresAt - entry.openedAt, 120_000,
    'the TTL handed to the constructor is not the one the entry carries — a registry that ignores '
    + 'ttlMs is exactly how ASK_TTL_MS fails to reach production');
  assert.equal(entry.agentId, ASK.agentId);
  assert.equal(entry.tool, ASK.tool);
  assert.equal(entry.command, ASK.command);
  assert.equal(entry.reason, ASK.reason);
});

test('GATE-05: an unknown id polls DENY — an unknown id is an expired or a forged one', () => {
  const { reg } = registryAt();
  assert.equal(reg.poll('ask-deadbeef', 'a1'), 'deny', 'a never-opened id must fail closed');
  assert.equal(reg.poll('', 'a1'), 'deny');
  // The positive control, so "it denies everything" cannot pass this case.
  const entry = reg.open(ASK);
  assert.equal(reg.poll(entry.id, 'a1'), 'pending', 'a live ask must poll pending');
});

test('GATE-05: answer settles once — the second answer returns false and changes nothing', () => {
  const { reg } = registryAt();
  const entry = reg.open(ASK);

  assert.equal(reg.answer(entry.id, true), true, 'the first answer must be accepted');
  assert.equal(reg.poll(entry.id, 'a1'), 'allow');
  assert.equal(reg.answer(entry.id, false), false, 'a settled ask must not be answerable again');
  assert.equal(reg.poll(entry.id, 'a1'), 'allow', 'the second answer changed the settled verdict');
  assert.equal(reg.answer('ask-deadbeef', true), false, 'an unknown id must not be answerable');
});

test('GATE-05: an expired ask polls deny and cannot be answered afterwards', () => {
  const { reg, advance } = registryAt(1_770_000_000_000, 50);
  const entry = reg.open(ASK);
  assert.equal(reg.poll(entry.id, 'a1'), 'pending', 'the positive control: it was live before expiry');

  advance(51);
  assert.equal(reg.poll(entry.id, 'a1'), 'deny', 'past expiresAt an unanswered ask must read deny');
  assert.equal(reg.answer(entry.id, true), false,
    'an operator\'s late yes answered a question whose asker already denied and moved on');
  assert.equal(reg.poll(entry.id, 'a1'), 'deny', 'the late yes changed the verdict after all');
});

test('GATE-05: an ask belongs to ONE agent — agent B cannot poll agent A\'s ask', () => {
  const { reg } = registryAt();
  const entry = reg.open(ASK); // owned by a1

  assert.equal(reg.poll(entry.id, 'b2'), 'deny',
    'agent B polled agent A\'s ask. authorized() maps a VALID token to an identity and has no '
    + 'reason to object, so without an owner check B reads — and settles — A\'s approval');
  assert.equal(reg.poll(entry.id, 'a1'), 'pending',
    'the positive control: the owner still polls pending, so the deny above is the owner check '
    + 'and not a registry that rejects everything');
});

test('GATE-05: sweep settles every expired entry to deny EXACTLY ONCE across five calls', () => {
  const { reg, published, advance, clock } = registryAt(1_770_000_000_000, 50);
  const entry = reg.open(ASK);
  const openPublishes = published.length;
  assert.ok(openPublishes >= 1, 'opening an ask must publish, or nothing pages the operator');

  advance(51);
  for (let i = 0; i < 5; i += 1) reg.sweep(clock());

  assert.equal(published.length - openPublishes, 1,
    `sweep published ${published.length - openPublishes} times for one expiry — a re-publish per `
    + 'sweep is a notification storm on a floor whose poll loop sweeps once a second');
  assert.equal(reg.poll(entry.id, 'a1'), 'deny');
  assert.equal(reg.answer(entry.id, true), false, 'a swept entry must be settled, not merely stale');
});

test('GATE-05: sweep hands back exactly the entries it settled, so a caller can rewrite their rows', () => {
  const { reg, advance, clock } = registryAt(1_770_000_000_000, 50);
  const entry = reg.open(ASK);
  advance(51);

  const first = reg.sweep(clock());
  assert.deepEqual(first.map((e) => e.id), [entry.id],
    'sweep returned nothing to settle — RECORD-01\'s row would then read decision=\'ask\' forever '
    + 'for a call that was in fact denied');
  assert.deepEqual(reg.sweep(clock()), [], 'the second sweep re-settled an already-settled entry');
});

test('GATE-05: list() holds only unsettled, unexpired entries — both directions', () => {
  const { reg, advance } = registryAt(1_770_000_000_000, 50);
  const live = reg.open(ASK);
  const answered = reg.open({ ...ASK, command: 'rm -rf ./x' });
  reg.answer(answered.id, true);

  const ids = reg.list().map((e) => e.id);
  assert.deepEqual(ids, [live.id],
    `list() returned ${JSON.stringify(ids)} — it must hold the live ask (the positive lower bound) `
    + 'and drop the settled one');
  assert.equal(reg.list()[0].command, ASK.command, 'the entry lost its command on the way out');

  advance(51);
  assert.deepEqual(reg.list(), [], 'an expired entry is still listed as an open question');
});

test('GATE-05: an agent-authored command is capped at the bound tool_calls.target uses', () => {
  const { reg } = registryAt();
  const entry = reg.open({ ...ASK, command: 'x'.repeat(10_000) });
  assert.ok(
    Buffer.byteLength(entry.command, 'utf8') <= 4096,
    `the command survived at ${Buffer.byteLength(entry.command, 'utf8')} bytes — it is agent-authored `
    + 'untrusted text (ASVS V7) and it is about to be rendered on a phone'
  );
  assert.ok(entry.command.length > 0, 'the cap ate the whole command');
});

test('GATE-05: approvals.ts imports nothing from electron, and says why an ask is not a card', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').resolve(__dirname, '..', 'src/main/approvals.ts'), 'utf8'
  );
  assert.equal(
    (src.match(/from 'electron'/g) || []).length, 0,
    'approvals.ts imports electron — it would then be unloadable on a CI runner installed with '
    + '`npm ci --ignore-scripts`, which is every runner this repo has'
  );
  assert.match(src, /D-10/,
    'the module header must state WHY a tool approval is not a card (D-10), or the next reader '
    + '"improves" it into tasks.json where it blocks a real card and outlives its own timeout');
});
