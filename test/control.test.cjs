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

  // THE ID IS NOT DERIVED FROM ANYTHING THE CALLER SUPPLIED, asserted by
  // COLLISION rather than by substring. A substring check is the wrong
  // instrument here and was measured being wrong: `!id.includes('a1')` against
  // 32 characters of hex fails on roughly one run in nine, purely by chance, and
  // it went red in a full-suite run after passing four of them. Two entries
  // minted from the same clock — one for the same agent, one for a different
  // one — must both differ from this id, which a clock- or identity-derived id
  // cannot manage.
  const { reg: sameClock } = registryAt(entry.openedAt, 120_000);
  const twin = sameClock.open(ASK);
  const sibling = sameClock.open({ ...ASK, agentId: 'b2' });
  assert.equal(twin.openedAt, sibling.openedAt, 'the fixture did not hold the clock still');
  assert.notEqual(twin.id, sibling.id,
    'two asks minted in the same millisecond for different agents share an id — the id is derived '
    + 'from the clock and the agent rather than from randomBytes');
  assert.notEqual(twin.id, sameClock.open(ASK).id,
    'two asks minted in the same millisecond FOR THE SAME AGENT share an id — the id is a pure '
    + 'function of its inputs and is therefore guessable by anyone who knows them');
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

// ─── GATE-05: the four numbers that move together (plan 04-15 task 2) ────────
//
// D-08: *"a plan that changes one number without the other ships a gate that
// times out on the wrong side."* Every value below is read out of
// src/main/hiveProvisioning.ts — never re-typed here, because a literal in a
// test is a second copy of the number the derivation exists to prevent.

const provisioning = loadTs('src/main/hiveProvisioning.ts');
const {
  PRETOOLUSE_HOOK_TIMEOUT_SEC, CLAUDE_PRETOOLUSE_TIMEOUT_SEC, MIN_PRETOOLUSE_SEC, ASK_TTL_MS
} = provisioning;

test('GATE-05: MIN_PRETOOLUSE_SEC is the minimum of two REAL numbers, not of an undefined', () => {
  // Math.min over an undefined is NaN, and `NaN <= anything` is false — which
  // would surface below as a confusing failure rather than as this one. Assert
  // it directly, and assert both inputs, so the diagnosis arrives with the red.
  assert.equal(typeof PRETOOLUSE_HOOK_TIMEOUT_SEC, 'number', 'PRETOOLUSE_HOOK_TIMEOUT_SEC is not exported');
  assert.equal(typeof CLAUDE_PRETOOLUSE_TIMEOUT_SEC, 'number', 'CLAUDE_PRETOOLUSE_TIMEOUT_SEC is not exported');
  assert.ok(Number.isFinite(PRETOOLUSE_HOOK_TIMEOUT_SEC) && Number.isFinite(CLAUDE_PRETOOLUSE_TIMEOUT_SEC));
  assert.equal(
    MIN_PRETOOLUSE_SEC,
    Math.min(PRETOOLUSE_HOOK_TIMEOUT_SEC, CLAUDE_PRETOOLUSE_TIMEOUT_SEC),
    'MIN_PRETOOLUSE_SEC is not the minimum of the two budgets it is supposed to be derived from'
  );
});

test('GATE-05: the ask TTL fits inside the shortest polling engine budget — all THREE bounds', () => {
  // THE UPPER BOUND ALONE CANNOT FAIL, and that is the point of the two below
  // it. ASK_TTL_MS is DERIVED from MIN_PRETOOLUSE_SEC, so the inequality holds
  // for every value: SEC = 31 gives a ONE-SECOND window to answer on a phone,
  // and SEC = 5 gives TTL = -25000 — every ask expired at birth — and
  // -25000 <= 5000 passes. Both degenerate values are named here so nobody
  // re-weakens this to the one-sided form.
  assert.ok(
    MIN_PRETOOLUSE_SEC >= 60,
    `MIN_PRETOOLUSE_SEC is ${MIN_PRETOOLUSE_SEC}s — an engine in this minimum runs a PreToolUse `
    + 'budget shorter than a minute, and a shim killed at that bound writes no stdout, which is ALLOW'
  );
  assert.ok(
    ASK_TTL_MS >= 30_000,
    `ASK_TTL_MS is ${ASK_TTL_MS}ms — a Web Push has to arrive and a human has to tap it, and that `
    + 'is not thirty seconds of headroom. This is the bound SEC = 31 fails'
  );
  assert.ok(
    ASK_TTL_MS <= MIN_PRETOOLUSE_SEC * 1000,
    `ASK_TTL_MS (${ASK_TTL_MS}ms) is longer than the shortest polling engine's own PreToolUse `
    + `budget (${MIN_PRETOOLUSE_SEC}s) — the shim is KILLED before it can answer, writes no stdout, `
    + 'and no stdout is ALLOW'
  );
});

test('GATE-05: Claude gets the PreToolUse timeout and NO other event does (path A)', () => {
  const settings = provisioning.hookSettings('/tmp/shim.cjs', undefined, (s) => `"node" "${s}"`);
  const hooks = settings.hooks;

  const pre = hooks.PreToolUse[0].hooks[0];
  assert.equal(
    pre.timeout, PRETOOLUSE_HOOK_TIMEOUT_SEC,
    'Claude\'s PreToolUse entry carries no timeout, or the wrong one. Claude is the ONE engine that '
    + 'certainly runs on this machine, and without this key its budget is whatever the release '
    + 'decides — a killed hook writes no stdout, and no stdout is ALLOW'
  );

  const withTimeout = Object.entries(hooks)
    .filter(([, groups]) => groups.some((g) => g.hooks.some((h) => 'timeout' in h)))
    .map(([event]) => event);
  assert.deepEqual(
    withTimeout, ['PreToolUse'],
    `these events carry a timeout: ${JSON.stringify(withTimeout)}. Only PreToolUse has a verdict to `
    + 'wait for; widening the others costs latency on paths with nothing to wait for and changes '
    + 'JSON that was byte-identical to HEAD'
  );
});

test('GATE-05: codex writes 150 for PreToolUse and 30 for the other seven — from the generated file', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-gate05-codex-'));
  try {
    const home = provisioning.installCodexHooks(dir, '/tmp/shim.cjs', (s) => `"node" "${s}"`, dir);
    const config = fs.readFileSync(path.join(home, 'config.toml'), 'utf8');

    // The GENERATED file is what codex reads, so it is what this asserts — a
    // `grep -c 'timeout = 30'` over the SOURCE measures a template string and
    // would push an executor toward keeping a literal branch where an
    // interpolation belongs.
    const groups = [...config.matchAll(/\[\[hooks\.(\w+)\]\][\s\S]*?timeout = (\d+)/g)]
      .map((m) => [m[1], Number(m[2])]);
    const byEvent = Object.fromEntries(groups);

    assert.equal(groups.length, 8, `expected eight hook groups, found ${groups.length}`);
    assert.equal(byEvent.PreToolUse, PRETOOLUSE_HOOK_TIMEOUT_SEC,
      `codex's PreToolUse group carries timeout = ${byEvent.PreToolUse}`);
    const others = groups.filter(([ev]) => ev !== 'PreToolUse');
    assert.equal(others.length, 7, 'the other seven events went missing');
    for (const [ev, t] of others) {
      assert.equal(t, 30,
        `codex's ${ev} group moved to ${t}s. Only PreToolUse has a verdict to wait for; a longer `
        + 'budget elsewhere only slows the detection of a wedged shim');
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('GATE-05: kimi writes 150 for PreToolUse and 30 for the other seven — from the generated file', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-gate05-kimi-'));
  const userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'md-gate05-kimihome-'));
  try {
    const file = provisioning.installKimiConfig({
      dir, shim: '/tmp/shim.cjs', nodeRun: (s) => `"node" "${s}"`, userHome
    });
    const config = fs.readFileSync(file, 'utf8');
    const groups = [...config.matchAll(/\[\[hooks\]\]\s*\nevent = "(\w+)"[\s\S]*?timeout = (\d+)/g)]
      .map((m) => [m[1], Number(m[2])]);
    const byEvent = Object.fromEntries(groups);

    assert.equal(groups.length, 8, `expected eight flat [[hooks]] tables, found ${groups.length}`);
    assert.equal(byEvent.PreToolUse, PRETOOLUSE_HOOK_TIMEOUT_SEC);
    for (const [ev, t] of groups.filter(([ev]) => ev !== 'PreToolUse')) {
      assert.equal(t, 30, `kimi's ${ev} table moved to ${t}s`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(userHome, { recursive: true, force: true });
  }
});

test('GATE-05: grok and agy are UNCHANGED — this gate guesses at no unverified unit', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').resolve(__dirname, '..', 'src/main/hiveProvisioning.ts'), 'utf8'
  );
  // By SYMBOL BOUNDARY, never by a line window: this plan inserts constants
  // above both functions and moves every line number in the file.
  const block = (startRe) => {
    const lines = src.split('\n');
    const i = lines.findIndex((l) => startRe.test(l));
    assert.ok(i >= 0, `no line matched ${startRe} — the symbol was renamed and this gate went blind`);
    const end = lines.findIndex((l, k) => k > i && l === '}');
    assert.ok(end > i, 'the function has no closing brace at column 0');
    return lines.slice(i, end + 1).join('\n');
  };

  const agy = block(/^export function installAgyHooks\(/);
  assert.equal(
    (agy.match(/timeout: 0/g) || []).length, 2,
    'installAgyHooks no longer writes `timeout: 0` twice. agy is not installed here, the semantics '
    + 'of its 0 are unknown, and hiveProvisioning\'s own note records the same 0 sentinel meaning '
    + 'ONE SECOND on codex rather than "no timeout"'
  );

  const grok = block(/^export function installGrokHooks\(/);
  assert.equal(
    (grok.match(/timeout/g) || []).length, 0,
    'installGrokHooks now writes a timeout key. grok is not installed here and the UNIT of that key '
    + 'is unverified: if it reads milliseconds, 150 means 150ms, every grok PreToolUse hook dies '
    + 'before the shim can answer, and that is worse than today and undetectable'
  );
});

test('GATE-05: the word `unreconciled` appears nowhere in src/main', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.resolve(__dirname, '..', 'src/main');
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx|cjs)$/.test(e.name)) continue;
      if (/unreconciled/i.test(fs.readFileSync(full, 'utf8'))) hits.push(full);
    }
  };
  walk(dir);
  assert.deepEqual(hits, [],
    'a shipped decision table still says `unreconciled`. Every engine budget in this gate is a '
    + 'NUMBER or an explicitly named ceiling item — never a shrug');
});

// ─── GATE-05: the reply, and the poll (plan 04-15 task 2) ────────────────────

const { HookServer } = loadTs('src/main/hooks.ts');

/** A HookServer over a fake hive, the shape test/net-binding.test.cjs already
 *  uses. No socket and no child process: these cases are about what `handle`
 *  RETURNS, and the socket join is proved by test/gate03-roundtrip.test.cjs and
 *  (for the poll) by test/record-persist.test.cjs. */
function hookServer(opts = {}) {
  const sent = [];
  const hive = {
    root: () => null,
    sockPath: () => null,
    recordSession: () => {},
    isGod: () => false,
    rosterContext: () => null,
    registry: () => ({ godId: null, agents: {} })
  };
  const server = new HookServer(
    hive,
    () => ({ send: (channel, payload) => sent.push({ channel, payload }) }),
    () => ({}),
    undefined, undefined, undefined, undefined, undefined,
    opts.hostAllowlist,
    undefined,
    opts.recordToolCall,
    opts.publishApproval
  );
  const fire = (tool_name, tool_input, extra = {}) =>
    server.handle({ hook_event_name: 'PreToolUse', tool_name, tool_input, ...extra }, opts.agentId || 'a1');
  return { server, sent, fire };
}

test('GATE-05: the ask reply is a valid deny AND a poll handle, in one object', () => {
  const { server, fire } = hookServer();
  const reply = fire('Bash', { command: 'git push origin +main' });

  // An un-upgraded shim reads only this half, and refuses. No version
  // negotiation, no wave in which a mixed floor is unsafe.
  assert.equal(reply.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(reply.hookSpecificOutput.permissionDecision, 'deny',
    'an un-upgraded shim would read this reply as an ALLOW');
  assert.ok(reply.hookSpecificOutput.permissionDecisionReason.length > 0);

  // An upgraded shim reads this half instead, and polls.
  assert.match(reply.hive_ask.id, /^ask-[0-9a-f]{16,}$/);
  assert.equal(typeof reply.hive_ask.deadlineMs, 'number');
  assert.equal(reply.hive_ask.pollMs, 1000);

  const open = server.openApprovals();
  assert.equal(open.length, 1, 'the reply carried an ask id that no registry entry backs');
  assert.equal(reply.hive_ask.deadlineMs, open[0].expiresAt,
    'deadlineMs and expiresAt are two independently-computed numbers. That is exactly the "times '
    + 'out on the wrong side" failure D-08 names: an operator\'s late yes answering a question '
    + 'whose asker already denied and moved on');
  assert.equal(open[0].id, reply.hive_ask.id);
});

test('GATE-05: deadlineMs is READ OFF the entry — under a stepping clock, a recompute diverges', () => {
  // WHY THIS CASE EXISTS SEPARATELY. The equality above is true by coincidence
  // when the deadline is recomputed as `Date.now() + ASK_TTL_MS`: `openedAt` and
  // the recompute land in the same millisecond, so the assertion passes and the
  // defect it exists to catch walks straight through it. Measured — that exact
  // mutation was applied to hooks.ts and the whole file stayed green.
  //
  // A clock that STEPS ten seconds per read discriminates them: read once for
  // `openedAt` and once for a recompute and the two answers are ten seconds
  // apart, so only a deadline read OFF THE ENTRY can still equal `expiresAt`.
  const realNow = Date.now;
  let t = 1_770_000_000_000;
  Date.now = () => { t += 10_000; return t; };
  try {
    const { server, fire } = hookServer();
    const reply = fire('Bash', { command: 'git push origin +main' });
    const [entry] = server.openApprovals();
    assert.equal(
      reply.hive_ask.deadlineMs, entry.expiresAt,
      `deadlineMs (${reply.hive_ask.deadlineMs}) and expiresAt (${entry.expiresAt}) are ` +
      `${Math.abs(reply.hive_ask.deadlineMs - entry.expiresAt)}ms apart — the shim was handed a `
      + 'deadline the registry does not honour'
    );
    assert.ok(reply.hive_ask.deadlineMs <= entry.expiresAt,
      'the shim\'s deadline is LATER than the server-side expiry, so an operator can answer a '
      + 'question whose asker already denied and moved on (T-04-ASK-04)');
  } finally {
    Date.now = realNow;
  }
});

test('GATE-05: the production registry really got ASK_TTL_MS, measured as an EFFECT', () => {
  const { server, fire } = hookServer();
  fire('Bash', { command: 'git push origin +main' });
  const [entry] = server.openApprovals();
  assert.equal(
    entry.expiresAt - entry.openedAt, ASK_TTL_MS,
    'the registry HookServer constructed did not get the derived TTL. A ttlMs option nobody passes '
    + 'silently takes whatever the class was written with, and a constants-only comparison says '
    + 'nothing at all about what production was constructed with'
  );
});

test('GATE-05: the ask reaches the DESKTOP carrying its id and its remaining duration', () => {
  const { sent, fire } = hookServer();
  const { hive_ask: ask } = fire('Bash', { command: 'git push origin +main --force' });

  const evt = sent.find((s) => s.channel === 'control:approvalRequest');
  assert.ok(evt, 'the ask fired no control:approvalRequest at all — the desktop banner never hears about it');

  // `askId` PRESENT is the only discriminator the renderer has between a
  // GATE-05 ask (still open, answerable, expiring) and a GATE-03 notice (already
  // denied, nothing to answer). Without it the banner renders a `dismiss` button
  // for a question the floor is still blocking on, and GATE-05's desktop half is
  // dead by construction however well the banner is built.
  assert.equal(evt.payload.askId, ask.id,
    'the desktop was told a command was refused and NOT told which question it may answer — `askId` is the ask\'s whole capability on this path, and the shim is meanwhile sitting on a poll loop nobody can settle');

  // Rule G-3: a DURATION measured at emit time, never a deadline. The renderer's
  // clock is not main's, and a deadline sent to a client is optimistic by the
  // skew — which is the one direction that is unsafe.
  assert.ok(typeof evt.payload.expiresInMs === 'number' && evt.payload.expiresInMs > 0 && evt.payload.expiresInMs <= ASK_TTL_MS,
    `the desktop got expiresInMs=${JSON.stringify(evt.payload.expiresInMs)}; rule G-3 wants a positive duration no larger than the server-side TTL (${ASK_TTL_MS}ms)`);
  assert.equal(evt.payload.expiresAt, undefined,
    'a deadline TIMESTAMP reached the renderer. `expiresAt` never leaves this process — openPhoneAsks already computes a duration for the same reason');

  // The command survives the trip: rule 3 exists because the dangerous half of
  // `git push origin +main --force` is at the END, and a banner that cannot show
  // it cannot be ellipsis-safe either.
  assert.equal(evt.payload.command, 'git push origin +main --force',
    'the refused command did not reach the banner verbatim');
});

test('GATE-05: a hard deny reaches the desktop with NO ask id — a final decision is not answerable', () => {
  // The paired negative for the case above, and not a formality: an askId on a
  // GATE-03 notice renders approve/deny buttons that settle nothing, which is a
  // worse lie than the silent banner it replaced.
  const { sent, fire } = hookServer({ hostAllowlist: () => [] });
  fire('Bash', { command: 'curl https://evil.example/x' });

  const notice = sent.find((s) => s.channel === 'control:approvalRequest');
  assert.ok(notice, 'the hard deny stopped reaching the renderer entirely');
  assert.equal(notice.payload.askId, undefined,
    'a hard deny carried an ask id — the banner would offer to approve a decision that is already final');
  assert.equal(notice.payload.expiresInMs, undefined,
    'a hard deny carried a countdown — there is nothing counting down, the call was refused');
});

test('GATE-05: a bare deny carries NO hive_ask, and an ordinary command carries neither', () => {
  // The emptied allowlist is the one producer of kind:'deny' — an operator who
  // cleared the list said "no hosts". Without this leg, "a force-push asks" is
  // satisfied by a judge with exactly one answer.
  const denied = hookServer({ hostAllowlist: () => [] })
    .fire('Bash', { command: 'curl https://evil.example/x' });
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(denied.hive_ask, undefined,
    'a hard deny handed out a poll handle — the operator can now "approve" a decision that is final');

  const benign = hookServer().fire('Bash', { command: 'ls -la' });
  assert.deepEqual(benign, {},
    `an ordinary command was judged: ${JSON.stringify(benign)}. Without this leg a judge that `
    + 'verdicts everything passes both cases above');
});

test('GATE-05: an ApprovalPoll answers pending, then the operator\'s verdict, and denies the unknown', () => {
  const { server, fire } = hookServer();
  const { hive_ask: ask } = fire('Bash', { command: 'git push origin +main' });
  const poll = (ask_id, agentId = 'a1') =>
    server.handle({ hook_event_name: 'ApprovalPoll', ask_id }, agentId);

  assert.deepEqual(poll(ask.id), { status: 'pending' }, 'a live ask must tell the shim to loop again');

  const unknown = poll('ask-deadbeef');
  assert.equal(unknown.status, 'deny');
  assert.equal(unknown.hookSpecificOutput.permissionDecision, 'deny',
    'an unknown ask id is either expired or forged, and both must fail closed');

  assert.equal(server.answerApproval(ask.id, true), true);
  const allowed = poll(ask.id);
  assert.equal(allowed.status, 'allow');
  assert.equal(allowed.hookSpecificOutput.permissionDecision, 'allow',
    'the operator approved and the shim was still refused');
});

test('GATE-05: agent B cannot poll agent A\'s ask with B\'s own VALID token', () => {
  const { server, fire } = hookServer();
  const { hive_ask: ask } = fire('Bash', { command: 'git push origin +main' });
  const poll = (agentId) => server.handle({ hook_event_name: 'ApprovalPoll', ask_id: ask.id }, agentId);

  // `authorized()` maps a valid token to the identity it was minted for, so it
  // has no reason to object to B holding B's own token. GATE-01 bound a token to
  // an identity; it never bound an ask to an owner.
  const foreign = poll('b2');
  assert.equal(foreign.status, 'deny');
  assert.equal(foreign.hookSpecificOutput.permissionDecision, 'deny',
    'agent B read — and could settle — agent A\'s approval');
  // The positive control, because "it rejected everything" is also what a broken
  // registry returns.
  assert.deepEqual(poll('a1'), { status: 'pending' },
    'the owner\'s own poll was refused too, so the deny above proves nothing');
});

test('GATE-05: an ApprovalPoll with NO token never reaches the branch — authorized() drops it first', async () => {
  // A DIFFERENT mechanism from the owner check above, asserted separately so the
  // two are not confused for one another: this one is the socket's, it runs
  // before `handle` at all, and it answers the same `{}` a real unauthenticated
  // hook gets. Driven over the REAL socket, because that is the only place
  // `authorized()` is applied.
  const net = require('node:net');
  const { withHookServer } = require('./gate-harness.cjs');

  await withHookServer({ agentId: 'a1' }, async (ctx) => {
    const send = (payload) => new Promise((resolve, reject) => {
      const c = net.createConnection(ctx.sock, () => c.end(JSON.stringify(payload) + '\n'));
      let resp = '';
      c.setEncoding('utf8');
      c.on('data', (d) => { resp += d; });
      c.on('close', () => resolve(resp));
      c.on('error', reject);
    });

    const ask = JSON.parse(await send({
      hook_event_name: 'PreToolUse', tool_name: 'Bash',
      tool_input: { command: 'git push origin +main' }, sock_token: ctx.token
    })).hive_ask;
    assert.ok(ask && ask.id, 'the positive control never opened an ask, so the negative proves nothing');

    const tokenless = await send({ hook_event_name: 'ApprovalPoll', ask_id: ask.id });
    assert.equal(tokenless, '{}',
      `a tokenless ApprovalPoll got ${tokenless} — it reached the branch instead of being dropped `
      + 'at the socket, which is where the trust boundary lives');

    const owned = JSON.parse(await send({
      hook_event_name: 'ApprovalPoll', ask_id: ask.id, sock_token: ctx.token
    }));
    assert.deepEqual(owned, { status: 'pending' },
      'the same poll WITH the token was also dropped, so the assertion above is about the branch '
      + 'never existing rather than about the token');
  });
});
