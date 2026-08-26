'use strict';

/**
 * Hive protocol v2 — the four promises the protocol made and did not keep.
 *
 * 1. #17 The task ledger had three concurrent writers, no revision and no lock,
 *    so a writer that read it, thought, and wrote back erased what landed in
 *    between. Writes now compare-and-swap on `rev`, and agents mutate ONE card at
 *    a time through `bin/task.cjs`.
 * 2. #18 `requires_reply` was enforced by nothing, hop-cap overflow DROPPED the
 *    message HIVE.md promised to escalate, `done` had no reviewer, and there was
 *    no merge path at all for the agent branches the harness happily created.
 * 3. #34 Cost rows carried no task id, so "what did this card cost?" had no answer.
 * 4. #44 The per-engine capability line rides the ROSTER (re-sent per prompt),
 *    never the cached system-prompt prefix.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');
const { integrateAgentBranch, agentBranch, getStatus } = loadTs('src/main/git.ts');

// ─── helpers ────────────────────────────────────────────────────────────────

function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-protocol-v2-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  return { home, hive };
}

/** Register an agent the way a spawn would, without booting a real one. */
function seedAgent(home, id, extra = {}) {
  const dir = path.join(home, 'hive', 'agents', id);
  fs.mkdirSync(path.join(dir, 'inbox', '.done'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'outbox', '.sent'), { recursive: true });
  const registry = path.join(home, 'hive', 'registry.json');
  const reg = JSON.parse(fs.readFileSync(registry, 'utf8'));
  if (extra.isGod) reg.godId = id;
  reg.agents[id] = Object.assign(
    { id, name: id, cwd: home, status: 'idle', lastSeen: Date.now(), provider: 'claude' },
    extra
  );
  fs.writeFileSync(registry, JSON.stringify(reg, null, 2));
}

function card(id, extra = {}) {
  return Object.assign({
    id,
    title: id,
    status: 'todo',
    dependsOn: [],
    priority: 3,
    createdAt: '2026-08-20T08:00:00.000Z'
  }, extra);
}

const ids = (hive) => hive.tasks().tasks.map((t) => t.id);
const byId = (hive, id) => hive.tasks().tasks.find((t) => t.id === id);
const subjects = (msgs) => msgs.map((m) => m.subject);

// ─── #17 — the ledger cannot be clobbered by a stale writer ─────────────────

test('a stale-rev write is refused and does not clobber the card it never saw', (t) => {
  const { hive } = floor(t);
  hive.writeTasks([card('answered', { status: 'blocked' })]);

  // A writer reads the ledger here and goes away to think.
  const stale = hive.tasks().rev;

  // Meanwhile a webhook appends a card and the human answers a question.
  assert.equal(hive.addTask(card('webhook-1')), true);
  assert.equal(hive.patchTask('answered', { humanQA: [{ q: 'which?', a: 'B' }] }), true);

  // The thinker writes back the whole ledger it read a minute ago.
  assert.equal(hive.writeTasks([card('answered', { status: 'blocked' })], stale), false,
    'a write against a superseded revision must be refused');
  assert.deepEqual(ids(hive), ['answered', 'webhook-1'], 'nothing was erased');
  assert.equal(byId(hive, 'answered').humanQA[0].a, 'B', "the human's answer survived");

  // …and a write against the CURRENT revision still works.
  assert.equal(hive.writeTasks([card('answered'), card('webhook-1'), card('new')], hive.tasks().rev), true);
  assert.deepEqual(ids(hive), ['answered', 'webhook-1', 'new']);
});

test('rev advances on every write and survives a pre-rev ledger', (t) => {
  const { home, hive } = floor(t);
  // A floor created before this change has no `rev` at all.
  fs.writeFileSync(path.join(home, 'hive', 'tasks.json'), JSON.stringify({ tasks: [card('legacy')] }));
  assert.equal(hive.tasks().rev, 0, 'a pre-rev ledger reads as revision 0, not NaN');

  assert.equal(hive.addTask(card('a')), true);
  assert.equal(hive.tasks().rev, 1);
  assert.equal(hive.patchTask('a', { status: 'doing' }), true);
  assert.equal(hive.tasks().rev, 2);
  assert.equal(hive.patchTask('nope', { status: 'done' }), false, 'a no-op must not burn a revision');
  assert.equal(hive.tasks().rev, 2);
});

test('bin/task.cjs mutates one card instead of rewriting the ledger', (t) => {
  const { home, hive } = floor(t);
  const cli = path.join(home, 'hive', 'bin', 'task.cjs');
  assert.ok(fs.existsSync(cli), 'the ledger CLI ships with the hive skeleton');
  hive.writeTasks([card('untouched', { status: 'doing', assignee: 'pam-1' })]);

  const run = (...args) => {
    const res = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, AGENT_ID: 'jim-1' } });
    assert.equal(res.status, 0, `task.cjs ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
    return JSON.parse(res.stdout.trim());
  };

  const added = run('add', 'ship the thing', '--desc', 'the details', '--budget-tokens', '5000');
  assert.equal(added.ok, true);
  assert.equal(added.task.title, 'ship the thing');
  assert.equal(added.task.budgetTokens, 5000);
  assert.equal(added.task.status, 'todo');

  const id = added.task.id;
  assert.equal(run('claim', id).task.assignee, 'jim-1', 'claim defaults to the calling agent');
  assert.equal(byId(hive, id).status, 'doing');
  assert.equal(run('done', id, '--result', 'shipped it').task.result, 'shipped it');
  assert.equal(byId(hive, id).status, 'done');

  // A human ask blocks the card and APPENDS to the history rather than replacing it.
  run('patch', 'untouched', '--q', 'which account?');
  assert.equal(byId(hive, 'untouched').status, 'blocked');
  assert.deepEqual(byId(hive, 'untouched').humanQA.map((e) => e.q), ['which account?']);
  run('patch', 'untouched', '--q', 'and which region?');
  assert.deepEqual(byId(hive, 'untouched').humanQA.map((e) => e.q), ['which account?', 'and which region?']);

  // Every one of those was a single-card mutation: the other card is intact and
  // the revision advanced once per command.
  assert.equal(byId(hive, 'untouched').assignee, 'pam-1');
  assert.equal(hive.tasks().rev, 6, '1 write + 5 CLI mutations');

  assert.equal(spawnSync(process.execPath, [cli, 'done', 'no-such-card'], { encoding: 'utf8' }).status, 1);
});

// ─── #18 — reply deadlines, hop-cap escalation, review ──────────────────────

test('an unanswered requires_reply is re-delivered once, then bounced to god', (t) => {
  const { home, hive } = floor(t);
  seedAgent(home, 'god-1', { isGod: true });
  seedAgent(home, 'jim-1');

  const t0 = Date.now();
  const msg = hive.send({ to: 'jim-1', act: 'request', subject: 'do X', body: 'the brief' }, 'god-1');
  assert.equal(msg.requires_reply, true, 'a request expects a reply');
  assert.equal(hive.sweepUnansweredReplies(t0), 0, 'nothing is overdue yet');

  assert.equal(hive.sweepUnansweredReplies(t0 + 16 * 60_000), 1);
  assert.ok(subjects(hive.inbox('jim-1')).some((s) => s.startsWith('[reminder')),
    'the first deadline re-delivers it to the same agent');
  assert.equal(subjects(hive.inbox('god-1')).length, 0, 'and does not bother god yet');

  assert.equal(hive.sweepUnansweredReplies(t0 + 40 * 60_000), 1);
  const bounced = hive.inbox('god-1').find((m) => m.subject.startsWith('[unanswered]'));
  assert.ok(bounced, 'the second deadline makes the silence visible to god');
  assert.match(bounced.body, /jim-1/);
  assert.match(bounced.body, /god-1/);

  assert.equal(hive.sweepUnansweredReplies(t0 + 99 * 60_000), 0,
    'the obligation is closed — it must not escalate forever');
});

test('a reply closes the obligation, by in_reply_to or by conversation', (t) => {
  const { home, hive } = floor(t);
  seedAgent(home, 'god-1', { isGod: true });
  seedAgent(home, 'jim-1');
  seedAgent(home, 'pam-1');

  const threaded = hive.send({ to: 'jim-1', act: 'request', subject: 'A' }, 'god-1');
  const loose = hive.send({ to: 'pam-1', act: 'query', subject: 'B', conversation: 'conv-b' }, 'god-1');

  hive.send({ to: 'god-1', act: 'inform', subject: 're: A', in_reply_to: threaded.id }, 'jim-1');
  hive.send({ to: 'god-1', act: 'agree', subject: 're: B', conversation: loose.conversation }, 'pam-1');

  assert.equal(hive.sweepUnansweredReplies(Date.now() + 99 * 60_000), 0,
    'an answered message must never be chased');
});

test('hop-cap overflow escalates to god instead of silently dropping', (t) => {
  const { home, hive } = floor(t);
  seedAgent(home, 'god-1', { isGod: true });
  seedAgent(home, 'jim-1');
  seedAgent(home, 'pam-1');

  hive.send({ to: 'jim-1', act: 'request', subject: 'who owns this?', body: 'round 13', hops: 99 }, 'pam-1');

  assert.equal(hive.inbox('jim-1').length, 0, 'the runaway message still stops looping');
  const escalated = hive.inbox('god-1');
  assert.equal(escalated.length, 1, 'but it is handed to the floor’s conflict owner, not dropped');
  assert.match(escalated[0].subject, /^\[hop-cap — this thread bounced 99 times between "pam-1" and "jim-1"/);
  assert.equal(escalated[0].body, 'round 13', 'god gets the whole message, not just a notice');
  assert.equal(escalated[0].requires_reply, false, 'an escalation must not itself enter the deadline sweep');

  const log = hive.logTail(50);
  assert.ok(log.some((e) => e.kind === 'escalate' && e.reason === 'hop-cap'));
  assert.ok(!log.some((e) => e.kind === 'drop'), 'nothing is dropped any more');
});

test('a card reaching done is reviewed by the least-loaded idle non-assignee', (t) => {
  const { home, hive } = floor(t);
  seedAgent(home, 'god-1', { isGod: true });
  seedAgent(home, 'jim-1');
  seedAgent(home, 'pam-1');
  seedAgent(home, 'dwight-1');
  seedAgent(home, 'kevin-1', { status: 'working' });
  // Give dwight a backlog so pam is the least loaded idle candidate.
  fs.writeFileSync(path.join(home, 'hive', 'agents', 'dwight-1', 'inbox', 'x.json'), '{}');

  hive.writeTasks([card('t1', { status: 'doing', assignee: 'jim-1' })]);
  assert.equal(hive.sweepTaskReviews(), 0, 'the first sweep learns the floor and reviews nothing');

  hive.patchTask('t1', { status: 'done', result: 'shipped' });
  assert.equal(hive.sweepTaskReviews(), 1);

  const query = hive.inbox('pam-1')[0];
  assert.ok(query, 'the least-loaded idle non-assignee is asked');
  assert.equal(query.act, 'query');
  assert.equal(query.conversation, 'review-t1');
  assert.match(query.body, /shipped/);
  assert.equal(hive.inbox('jim-1').length, 0, 'the assignee never reviews their own card');
  assert.equal(byId(hive, 't1').review.by, 'pam-1');

  assert.equal(hive.sweepTaskReviews(), 0, 'a card under review is not re-reviewed every minute');

  // A refusal sends the work back; an agreement signs it off.
  hive.send({ to: 'god-1', act: 'refuse', conversation: 'review-t1', subject: 'not done', body: 'no tests' }, 'pam-1');
  assert.equal(byId(hive, 't1').status, 'doing', 'a refusal reopens the card');
  assert.equal(byId(hive, 't1').review.ok, false);

  hive.patchTask('t1', { status: 'done', review: { by: 'pam-1', askedAt: 'x' } });
  hive.send({ to: 'god-1', act: 'agree', conversation: 'review-t1', subject: 'ok now' }, 'pam-1');
  assert.equal(byId(hive, 't1').status, 'done');
  assert.equal(byId(hive, 't1').review.ok, true);
});

test('a verdict from anyone but the assigned reviewer is ignored', (t) => {
  const { home, hive } = floor(t);
  seedAgent(home, 'god-1', { isGod: true });
  seedAgent(home, 'pam-1');
  hive.writeTasks([card('t2', { status: 'done', assignee: 'jim-1', review: { by: 'pam-1', askedAt: 'x' } })]);

  hive.send({ to: 'god-1', act: 'refuse', conversation: 'review-t2', subject: 'nope' }, 'god-1');
  assert.equal(byId(hive, 't2').status, 'done', 'only the reviewer we asked can reopen the card');
});

// ─── #18 — the review sweep loses no card: retry, fast cards, refuse→redo ────
// Three separate mechanisms used to lose a review SILENTLY, and the first two are
// invisible to the tests above: `if (!reviewer) continue` consumed the transition
// edge (lastTaskStatus is assigned ABOVE the loop), the snapshot MEMBERSHIP guard
// dropped any card that never existed in the previous snapshot, and a `refuse` left
// `task.review` truthy forever. The last test in this block is the opposite
// assertion — the fix must not turn a lost review into a boot review-storm.

test('a card that flips to done while every other agent is busy is reviewed on a later sweep', (t) => {
  const { home, hive } = floor(t);
  seedAgent(home, 'god-1', { isGod: true });
  seedAgent(home, 'jim-1');                          // the assignee — may never review itself
  seedAgent(home, 'kevin-1', { status: 'working' }); // the only other agent, and busy

  hive.writeTasks([card('t1', { status: 'doing', assignee: 'jim-1' })]);
  assert.equal(hive.sweepTaskReviews(), 0, 'the seed sweep learns the floor and reviews nothing');

  hive.patchTask('t1', { status: 'done', result: 'shipped' });
  assert.equal(hive.sweepTaskReviews(), 0, 'nobody is free, so no review can be mailed yet');
  assert.equal(hive.inbox('kevin-1').length, 0, 'and a busy agent is not mailed anyway');

  seedAgent(home, 'kevin-1', { status: 'idle' });
  assert.equal(hive.sweepTaskReviews(), 1,
    'a 0 here means the busy sweep CONSUMED the done transition — the card is now never reviewed again, silently, which is the whole of VERDICT-02 (#18)');
  const query = hive.inbox('kevin-1')[0];
  assert.ok(query, 'the obligation survived "no reviewer" and was mailed once someone freed up');
  assert.equal(query.act, 'query');
  assert.equal(query.conversation, 'review-t1');
});

test('a card created AND finished inside one sweep window is still reviewed', (t) => {
  const { home, hive } = floor(t);
  seedAgent(home, 'god-1', { isGod: true });
  seedAgent(home, 'jim-1');
  seedAgent(home, 'pam-1'); // idle non-assignee, so a review is mailable

  hive.writeTasks([]);
  assert.equal(hive.sweepTaskReviews(), 0, 'the seed sweep learns a floor on which this card does not exist yet');

  // Born and finished between two ticks. SWEEP_INTERVAL_MS is 60 s, so this is a
  // whole class of real cards: no snapshot EVER observes it in a non-done state.
  hive.writeTasks([card('fast-1', { status: 'done', assignee: 'jim-1', result: 'shipped' })]);

  assert.equal(hive.sweepTaskReviews(), 1,
    'a 0 here means the sweep still requires the card to have existed in the PREVIOUS snapshot, so a fast card is dropped permanently — no obligation is ever minted for it and no retry can recover it (#18)');
  const query = hive.inbox('pam-1')[0];
  assert.ok(query, 'the review was actually MAILED, not merely counted');
  assert.equal(query.conversation, 'review-fast-1');
});

test('a card refused by its reviewer and then re-done is reviewed again', (t) => {
  const { home, hive } = floor(t);
  seedAgent(home, 'god-1', { isGod: true });
  seedAgent(home, 'jim-1');
  seedAgent(home, 'pam-1');

  hive.writeTasks([card('t1', { status: 'doing', assignee: 'jim-1' })]);
  assert.equal(hive.sweepTaskReviews(), 0, 'the seed sweep learns the floor');
  hive.patchTask('t1', { status: 'done', result: 'first attempt' });
  assert.equal(hive.sweepTaskReviews(), 1, 'the first review goes out');
  const first = hive.inbox('pam-1').filter((m) => m.conversation === 'review-t1').length;
  assert.equal(first, 1);

  hive.send({ to: 'god-1', act: 'refuse', conversation: 'review-t1', subject: 'not done', body: 'no tests' }, 'pam-1');
  assert.equal(byId(hive, 't1').status, 'doing', 'a refusal reopens the card');

  hive.patchTask('t1', { status: 'done', result: 'tests added' });
  assert.equal(hive.sweepTaskReviews(), 1,
    'a 0 here means `task.review` stayed truthy after the refusal, so the refused-then-fixed path — the one where a second look matters most — is silently unreviewable (#18)');
  assert.equal(hive.inbox('pam-1').filter((m) => m.conversation === 'review-t1').length, 2,
    'the second review was MAILED, not merely counted');
});

// Pins behaviour that ALREADY SHIPPED at src/main/hive.ts leastLoadedIdle's
// `canReceiveInbox(a?.provider)` filter — this is not new work. It exists so a
// future refactor of the reviewer picker cannot quietly route a review into a
// black hole on a mixed-engine floor (VERDICT-03).
test('a reviewer whose engine cannot receive mail is never selected', (t) => {
  const { home, hive } = floor(t);
  seedAgent(home, 'god-1', { isGod: true });
  seedAgent(home, 'jim-1');
  seedAgent(home, 'oscar-1', { provider: 'custom' }); // idle, non-assignee, no inbox-drain path

  hive.writeTasks([card('t1', { status: 'doing', assignee: 'jim-1' })]);
  assert.equal(hive.sweepTaskReviews(), 0, 'the seed sweep learns the floor');
  hive.patchTask('t1', { status: 'done', result: 'shipped' });

  assert.equal(hive.sweepTaskReviews(), 0,
    'the only candidate cannot receive mail, so leastLoadedIdle must return null rather than route the review into a black hole (VERDICT-03)');
  assert.equal(hive.inbox('oscar-1').length, 0, 'nothing was mailed to an engine that cannot read it');
  assert.equal(byId(hive, 't1').review, undefined,
    'and the card was not stamped as under review by a reviewer that never got the query');
});

// The opposite assertion to the three above, and the one neither existing sweep
// test covers. It is GREEN against pre-fix source — a PRESERVED invariant, not a
// fixed defect — and goes RED against an `owesReview` rebuilt from the persisted
// board at startup, which is exactly why no such rebuild exists (#18).
test('a restart against a board full of historic done cards mails nothing, on the first sweep or the second', (t) => {
  const { home, hive } = floor(t);
  seedAgent(home, 'god-1', { isGod: true });
  seedAgent(home, 'jim-1');
  seedAgent(home, 'pam-1'); // idle non-assignee — a storm would really be mailable

  hive.writeTasks([
    card('old-1', { status: 'done', assignee: 'jim-1', result: 'a' }),
    card('old-2', { status: 'done', assignee: 'jim-1', result: 'b' }),
    card('old-3', { status: 'done', assignee: 'jim-1', result: 'c' })
  ]);

  // The restart: a brand-new manager over the same on-disk floor, whose board
  // already holds three finished, never-reviewed cards.
  const restarted = new HiveManager(() => home);
  restarted.ensureHive();

  assert.equal(restarted.sweepTaskReviews(), 0,
    'the seed sweep acts on nothing — covered by "the first sweep learns the floor" above');
  assert.equal(restarted.sweepTaskReviews(), 0,
    'the SECOND sweep is what nothing else covers: a failure here means the boot backlog was MASS-REVIEWED, which the lastTaskStatus comment in src/main/hive.ts promises cannot happen');
  assert.equal(restarted.inbox('pam-1').length, 0,
    'and nothing was mailed — a storm that forgets to increment the counter still fails here');
});

// ─── #34 — per-card cost attribution ────────────────────────────────────────

/** A CUMULATIVE ledger row — which, since RECORD-04, is what EVERY row is: the
 *  running total for one (agentId, sessionId), never one response's delta.
 *  `src/main/db.ts:44` states the contract; `hooks.ts` used to break it. */
const cumulative = (agentId, input, output, usd, sessionId = 's1') => ({
  agentId, sessionId, ts: 1, input, output, cacheRead: 0, cacheCreation: 0, model: 'claude-x', usd
});

/** Pull the raw ledger rows off disk — the file is the contract, not the API. */
function ledgerRows(home) {
  return fs.readFileSync(path.join(home, 'hive', 'cost-ledger.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
}

test('cost rows carry the card they were spent on, and a card is billed the DIFFERENCE between snapshots', (t) => {
  const { home, hive } = floor(t);
  hive.writeTasks([
    card('t-doing', { status: 'doing', assignee: 'jim-1', budgetTokens: 70 }),
    card('t-idle', { status: 'todo', assignee: 'pam-1' })
  ]);

  hive.appendCostLedger(cumulative('jim-1', 10, 5, 0.01));    // series opens at 15 → +15
  hive.appendCostLedger(cumulative('jim-1', 40, 20, 0.06));   // 60 − 15          → +45
  hive.appendCostLedger(cumulative('pam-1', 100, 100, 9.99)); // no card in flight

  assert.deepEqual(ledgerRows(home).map((r) => r.task_id), ['t-doing', 't-doing', null],
    'the row must name the card, or the ledger can only answer "what has this agent ever cost"');

  const spend = hive.taskSpend('t-doing');
  assert.equal(spend.tokens, 60,
    'the card burned 15, then 45 more: 15 + (60 − 15) = 60. SUMMING those two cumulative '
    + 'rows gives 15 + 60 = 75, which is the pre-RECORD-04 defect this assertion replaces — '
    + 'over-counting that grows roughly quadratically with the length of the card');
  assert.equal(Number(spend.usd.toFixed(2)), 0.06,
    'usd is diffed the same way; for a single unbroken series it lands on the last snapshot');
  assert.equal(spend.budgetTokens, 70);
  assert.equal(spend.over, false,
    'the card is 10 tokens under a 70-token cap. The old summing answer (75) would have '
    + 'stopped it early — the exact "generous cap, stopped early by double counting" failure');

  hive.appendCostLedger(cumulative('jim-1', 55, 20, 0.08));   // 75 − 60 → +15 = 75
  assert.equal(hive.taskSpend('t-doing').over, true,
    'and now it really is over — 75 against a cap of 70');

  // telemetry.forget() on a respawn resets the collector, so the next snapshot
  // can be SMALLER than the last. That is not a refund.
  hive.appendCostLedger(cumulative('jim-1', 1, 0, 0.001));
  assert.equal(hive.taskSpend('t-doing').tokens, 75,
    'a rewound snapshot was allowed to subtract from the card — an unclamped diff hands '
    + 'back spend that was really incurred, and an over-budget card silently comes back under');

  assert.deepEqual(hive.taskSpend('t-idle'), { tokens: 0, usd: 0, budgetTokens: null, over: false },
    'a card nobody has worked has spent nothing and has no cap');
});

test('a card is billed its EARLY rows too — spend is read over the whole ledger, not a 1 MB tail', (t) => {
  const { home, hive } = floor(t);
  hive.writeTasks([card('t-long', { status: 'doing', assignee: 'dwight-1', budgetTokens: 1000 })]);

  const row = (agentId, sessionId, taskId, tokens, usd) => JSON.stringify({
    agent_id: agentId, session_id: sessionId, task_id: taskId, ts: 1,
    input: tokens, output: 0, cache_read: 0, cache_creation: 0, model: 'claude-x', usd
  }) + '\n';

  // The card's FIRST worker, at the very top of the file: 900 tokens sitting
  // exactly where a 1 MB tail read drops them.
  const parts = [row('jim-1', 's1', 't-long', 900, 0.9)];
  let bytes = Buffer.byteLength(parts[0]);
  // Enough unrelated traffic to push those bytes out of any 1 MB window. Real
  // rows, not padding — this is what a busy floor's ledger actually looks like.
  for (let n = 1; bytes <= 1024 * 1024; n += 1) {
    const r = row('pam-1', 's2', null, n, 0);
    parts.push(r);
    bytes += Buffer.byteLength(r);
  }
  // The card's SECOND worker after the handover: 200 more tokens, in its OWN
  // series. That is what makes the early row load-bearing — dwight-1's
  // cumulative snapshot carries none of jim-1's spend, so dropping jim-1's row
  // does not merely lose history, it takes 900 tokens off the answer.
  parts.push(row('dwight-1', 's3', 't-long', 200, 0.2));

  const ledger = path.join(home, 'hive', 'cost-ledger.jsonl');
  fs.writeFileSync(ledger, parts.join(''));
  const size = fs.statSync(ledger).size;
  assert.ok(size > 1024 * 1024,
    `the fixture must exceed the old COST_TAIL_BYTES window or it proves nothing (got ${size} bytes)`);

  const spend = hive.taskSpend('t-long');
  assert.equal(spend.tokens, 1100,
    'the early 900 fell out of the read. That is RECORD-03: a long card under-reports, '
    + 'because a total that silently drops its oldest rows is not a total');
  assert.equal(spend.over, true,
    'over read FALSE on a card 10% past its cap — a 1 MB tail leaves only dwight-1\'s 200 '
    + 'against a 1000-token budget, and that is the number FLOOR-10 would enforce against');
});

/** The child of the restart test: a FRESH process, a FRESH HiveManager, the same
 *  home on disk. Written to a temp dir and run with `process.execPath`. */
const RESTART_CHILD = `'use strict';
const loadTs = require(process.argv[2]);
const { HiveManager } = loadTs('src/main/hive.ts');
const hive = new HiveManager(() => process.argv[3]);
process.stdout.write('SPEND:' + JSON.stringify(hive.taskSpend(process.argv[4])) + '\\n');
`;

function childSpend(stdout, stderr) {
  const line = stdout.split('\n').find((l) => l.startsWith('SPEND:'));
  assert.ok(line, `the child printed no SPEND line.\nstdout: ${stdout}\nstderr: ${stderr}`);
  return JSON.parse(line.slice('SPEND:'.length));
}

test('a card in flight does not reset its spend across an app restart — proven in a REAL second process', (t) => {
  const { home, hive } = floor(t);
  hive.writeTasks([card('t-restart', { status: 'doing', assignee: 'jim-1', budgetTokens: 500 })]);
  hive.appendCostLedger(cumulative('jim-1', 100, 20, 0.10));  // +120
  hive.appendCostLedger(cumulative('jim-1', 200, 30, 0.20));  // 230 − 120 → +110

  // 1. THE FILESYSTEM, before any restart. A separate and earlier failure point
  //    than the reload, on purpose: the accumulator RECORD-03 introduces lives
  //    in memory, and an in-memory Map cannot pass this.
  const ledger = path.join(home, 'hive', 'cost-ledger.jsonl');
  assert.ok(fs.existsSync(ledger), 'no cost ledger on disk — nothing could survive a restart');
  assert.match(fs.readFileSync(ledger, 'utf8'), /t-restart/,
    'the rows on disk do not name the card, so a fresh process cannot attribute them');
  assert.equal(hive.taskSpend('t-restart').tokens, 230,
    'the live process disagrees before we even restart');

  // 2. THE RESTART. A real second process — NOT a second HiveManager in this
  //    one, which a module-level Map satisfies while the durability claim stays
  //    false. No fork(), no vm, no delete require.cache: all three share state.
  const childPath = path.join(home, 'spend-child.cjs');
  fs.writeFileSync(childPath, RESTART_CHILD);
  const loader = path.join(__dirname, 'load-ts.cjs');
  const restarted = spawnSync(process.execPath, [childPath, loader, home, 't-restart'], { encoding: 'utf8' });
  assert.equal(restarted.status, 0, `the restarted process failed: ${restarted.stderr}`);
  assert.equal(childSpend(restarted.stdout, restarted.stderr).tokens, 230,
    'a card still in flight came back from a restart reporting different spend. Its cap is '
    + 'then enforced against a number that resets every time the app is reopened');

  // 3. NEGATIVE CONTROL. With the ledger gone the same fresh process must report
  //    zero. If it still finds spend, the rescan is serving it from somewhere
  //    that is not the file — and step 2 proved nothing about durability.
  fs.rmSync(ledger);
  const blank = spawnSync(process.execPath, [childPath, loader, home, 't-restart'], { encoding: 'utf8' });
  assert.equal(blank.status, 0, `the control process failed: ${blank.stderr}`);
  assert.equal(childSpend(blank.stdout, blank.stderr).tokens, 0,
    'spend survived deleting the ledger, so it is not being read from the ledger');
});

// ─── #34 / FLOOR-10 — the card's meter, and the budget the beat reads ───────
//
// D-22 is the whole reason the meter needs no new IPC channel: the renderer
// already polls `hive:tasks`, so the row is widened instead. NO grep over
// hive.ts can tell a widened row from the eight `budgetTokens` occurrences that
// predate this phase — only these assertions can, which is why they are here
// rather than in a count.

test('D-22: the hive:tasks row carries the card\'s meter, and a capless card reads null rather than NaN', (t) => {
  const { hive } = floor(t);
  hive.writeTasks([
    card('t-capped', { status: 'doing', assignee: 'jim-1', budgetTokens: 200 }),
    card('t-capless', { status: 'doing', assignee: 'pam-1' })
  ]);
  hive.appendCostLedger(cumulative('jim-1', 30, 20, 0.05));            // series opens at 50 → +50
  hive.appendCostLedger(cumulative('pam-1', 10, 5, 0.01, 'pam-s1'));   // → +15

  const ledger = hive.tasks();
  assert.equal(ledger.rev, 1,
    'the rev envelope did not survive the widening. Every mutation path compare-and-swaps on '
    + 'rev, so a row map that drops it re-opens #17 (a stale writer erasing a live answer)');
  assert.equal(typeof ledger.updatedAt, 'string', 'the updatedAt envelope was dropped too');

  const capped = ledger.tasks.find((r) => r.id === 't-capped');
  for (const key of ['tokens', 'budgetTokens', 'pct']) {
    assert.ok(key in capped,
      `the row has no "${key}", so the card can render no meter and FLOOR-13 has nothing to `
      + 'consume — D-22 was skipped and every count-based criterion in this plan still passed');
  }
  assert.equal(capped.tokens, 50,
    'the row\'s spend disagrees with taskSpend(). Two numbers for one card is how a meter and '
    + 'an enforcement decision drift apart');
  assert.equal(capped.budgetTokens, 200, 'the row lost the cap the dispatch set');
  assert.equal(capped.pct, 50 / 200,
    'pct is not spend/cap at the row\'s own numbers, so the meter renders a different '
    + 'proportion than the one the breaker enforces');

  const capless = ledger.tasks.find((r) => r.id === 't-capless');
  assert.equal(capless.tokens, 15, 'a capless card still has real spend and must still report it');
  assert.equal(capless.budgetTokens, null,
    'an unset cap must read as null, not undefined — undefined vanishes through JSON over IPC '
    + 'and the renderer cannot tell "no cap" from "field missing"');
  assert.equal(capless.pct, null,
    'a capless card was divided by nothing. NaN and Infinity both render as a blank or a full '
    + 'meter, which reads as "this card is fine" or "this card is doomed" — never as "no cap"');
  assert.ok(!Number.isNaN(capless.pct) && capless.pct !== Infinity,
    'pct came back NaN or Infinity for a card with no cap');
});

test('D-22: the derived meter never leaks back into tasks.json', (t) => {
  const { home, hive } = floor(t);
  hive.writeTasks([
    card('t-capped', { status: 'doing', assignee: 'jim-1', budgetTokens: 200 }),
    card('t-capless', { status: 'doing', assignee: 'pam-1' })
  ]);
  hive.appendCostLedger(cumulative('jim-1', 30, 20, 0.05));

  // TWO production paths read rows straight out of hive.tasks() and hand those
  // same objects back to hive.writeTasks(): the webhook card-creation path
  // (src/main/index.ts — `const ledger = hive.tasks()` … `hive.writeTasks([...existing, card])`)
  // and every voice task action (src/main/realtimeActions.ts findTasks →
  // hiveWriteTasks). Without a strip at the writeTasks choke point, the first
  // webhook card or voice command after this widening writes a derived meter
  // into the ledger as if it were card data.
  const readBack = hive.tasks();
  assert.equal(hive.writeTasks(readBack.tasks, readBack.rev), true, 'the round-trip write was refused');

  const onDisk = JSON.parse(fs.readFileSync(path.join(home, 'hive', 'tasks.json'), 'utf8'));
  const capped = onDisk.tasks.find((c) => c.id === 't-capped');
  assert.ok(!('tokens' in capped),
    'the derived spend was persisted as a card field. It is a snapshot of a number that keeps '
    + 'moving, and tasks.json is the ledger every writer compare-and-swaps on');
  assert.ok(!('pct' in capped), 'the derived percentage was persisted as a card field');
  assert.equal(capped.budgetTokens, 200,
    'the strip took the REAL card field with it — the cap the dispatch set is gone from the '
    + 'ledger, so the budget arm has nothing left to enforce');

  const capless = onDisk.tasks.find((c) => c.id === 't-capless');
  assert.ok(!('budgetTokens' in capless),
    'a capless card came back from tasks() carrying budgetTokens:null and that null was '
    + 'persisted onto the card');
});

test('FLOOR-10: budgetForAgent hands the beat the assignee\'s card — and null when there is no cap to enforce', (t) => {
  const { hive } = floor(t);
  hive.writeTasks([
    card('t-capped', { status: 'doing', assignee: 'jim-1', budgetTokens: 200 }),
    card('t-capless', { status: 'doing', assignee: 'pam-1' }),
    card('t-todo', { status: 'todo', assignee: 'dwight-1', budgetTokens: 50 })
  ]);
  hive.appendCostLedger(cumulative('jim-1', 30, 20, 0.05));   // → 50

  assert.deepEqual(hive.budgetForAgent('jim-1'), { taskId: 't-capped', tokens: 50, cap: 200 },
    'the ONE accessor the breaker beat calls did not resolve the assignee\'s in-flight card. '
    + 'It resolves through the same activeTaskId() the ledger stamps task_id with, so the row '
    + 'the spend was billed to and the card the cap is read from can never disagree');

  assert.equal(hive.budgetForAgent('pam-1'), null,
    'a card with NO cap produced a budget. A {tokens, cap: 0} object trips the arm on the '
    + 'first token spent — no cap must mean no arm, never a surprise stop');
  assert.equal(hive.budgetForAgent('dwight-1'), null,
    'a card that has not been started yet was treated as in flight');
  assert.equal(hive.budgetForAgent('nobody-1'), null,
    'an agent with no card at all got a budget out of nowhere');
});

test('FLOOR-10: a card that has LEFT the board yields no budget rather than a zero-spend cap', (t) => {
  const { home, hive } = floor(t);
  hive.writeTasks([card('t-gone', { status: 'doing', assignee: 'jim-1', budgetTokens: 100 })]);
  hive.appendCostLedger(cumulative('jim-1', 200, 100, 0.50));   // 300 against a cap of 100

  assert.deepEqual(hive.budgetForAgent('jim-1'), { taskId: 't-gone', tokens: 300, cap: 100 },
    'the over-cap card is not visible while it is ON the board, so the rest of this test is vacuous');

  hive.deleteTask('t-gone');

  // 01-06 bounds the cost accumulator by CARD LIFETIME (pruneCostByTask) — that
  // prune is the memory bound which replaced RECORD-03's deleted 1 MB window, so
  // taskSpend() on a card that has left the board now legitimately answers ZERO.
  // A fresh manager over the same home rather than a five-second sleep on the
  // active-card cache; it is also exactly what a restart does.
  const restarted = new HiveManager(() => home);
  assert.equal(restarted.taskSpend('t-gone').tokens, 0,
    '01-06\'s card-lifetime bound is not in place, and this test is asserting against the '
    + 'wrong contract — re-read 01-06-SUMMARY before changing anything here');
  assert.equal(restarted.budgetForAgent('jim-1'), null,
    'the beat was handed a budget for a card that is no longer on the board. Because the '
    + 'accumulator prunes it, that budget reads {tokens: 0} against a live cap — "comfortably '
    + 'under budget" — and an agent that was constrained a beat ago recovers on a number that '
    + 'only means the card was archived');
});

// ─── #44 — the capability line rides the cache-safe path ────────────────────

test('the roster names each agent’s engine and can carry a capability legend', (t) => {
  const { home, hive } = floor(t);
  seedAgent(home, 'god-1', { isGod: true });
  seedAgent(home, 'jim-1', { provider: 'codex' });
  hive.writeFleetSnapshot({
    ts: Date.now(),
    agents: [
      { id: 'god-1', name: 'Michael', role: 'orchestrator', isGod: true, lastActiveSecAgo: 3 },
      { id: 'jim-1', name: 'Jim', role: 'agent', lastActiveSecAgo: 30 }
    ]
  });

  const plain = hive.rosterContext();
  assert.match(plain, /god-1[^;]*claude/, 'an unset provider reads as claude, not blank');
  assert.match(plain, /jim-1[^;]*codex/);
  assert.doesNotMatch(plain, /Engine capabilities/, 'no legend until someone supplies one');

  hive.setEngineCapabilities({ codex: 'no MCP servers', gemini: 'not on this floor' });
  const withLegend = hive.rosterContext();
  assert.match(withLegend, /Engine capabilities: codex — no MCP servers\./);
  assert.doesNotMatch(withLegend, /not on this floor/, 'only engines actually on the floor');
  assert.ok(!withLegend.includes('\n'), 'still one compact line');
});

// ─── #18 — the missing merge primitive ──────────────────────────────────────

function repo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-integrate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => {
    const res = spawnSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
      { cwd: dir, encoding: 'utf8' });
    return res;
  };
  git('init', '-q', '-b', 'main');
  // Write the identity INTO the repo, not just onto this helper's own invocations.
  // integrateAgentBranch() shells out to `git merge` itself, and a non-fast-forward
  // merge has to write a commit — which fails with "Please tell me who you are" on
  // any machine without a global git identity. A developer box always has one; a CI
  // runner never does, so relying on the `-c` flags above passed locally and failed
  // on every runner. Configuring the fixture repo makes the test hermetic instead of
  // quietly borrowing the host's git config.
  git('config', 'user.name', 'T');
  git('config', 'user.email', 't@t');
  git('config', 'commit.gpgsign', 'false');
  fs.writeFileSync(path.join(dir, 'shared.txt'), 'base\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  return { dir, git };
}

test('integrate merges an agent branch and reports conflicts instead of throwing', async (t) => {
  const { dir, git } = repo(t);
  assert.equal(agentBranch('Jim 1'), 'agent/jim-1', 'the branch name is slugged, never injected');

  // A clean branch merges.
  git('checkout', '-q', '-b', 'agent/jim-1');
  fs.writeFileSync(path.join(dir, 'jim.txt'), 'jim\n');
  git('add', '-A'); git('commit', '-qm', 'jim works');
  git('checkout', '-q', 'main');
  const clean = await integrateAgentBranch(dir, 'jim-1', 'main');
  assert.deepEqual(clean, { ok: true, branch: 'agent/jim-1', conflicts: [] });
  assert.ok(fs.existsSync(path.join(dir, 'jim.txt')));

  // A conflicting branch reports its conflicts and leaves the repo untouched.
  git('checkout', '-q', '-b', 'agent/pam-1');
  fs.writeFileSync(path.join(dir, 'shared.txt'), 'pam\n');
  git('add', '-A'); git('commit', '-qm', 'pam works');
  git('checkout', '-q', 'main');
  fs.writeFileSync(path.join(dir, 'shared.txt'), 'main\n');
  git('add', '-A'); git('commit', '-qm', 'main moves');

  const clash = await integrateAgentBranch(dir, 'pam-1', 'main');
  assert.equal(clash.ok, false);
  assert.equal(clash.branch, 'agent/pam-1');
  assert.deepEqual(clash.conflicts, ['shared.txt'], 'god is told exactly what to resolve');
  assert.ok(!fs.existsSync(path.join(dir, '.git', 'MERGE_HEAD')),
    'a failed merge is aborted — never left half-done in the user’s repo');
  const status = await getStatus(dir);
  assert.equal(status.staged.length + status.unstaged.length, 0);
  // trim(): git's autocrlf may rewrite the line ending on checkout — the point is
  // that the abort left main's content, not the agent's or a conflict marker.
  assert.equal(fs.readFileSync(path.join(dir, 'shared.txt'), 'utf8').trim(), 'main');
});

test('integrate refuses rather than sweeping unrelated work into the merge', async (t) => {
  const { dir, git } = repo(t);
  const missing = await integrateAgentBranch(dir, 'ghost-1', 'main');
  assert.equal(missing.ok, false);
  assert.match(missing.error, /no branch agent\/ghost-1/);

  git('checkout', '-q', '-b', 'agent/jim-1');
  fs.writeFileSync(path.join(dir, 'jim.txt'), 'jim\n');
  git('add', '-A'); git('commit', '-qm', 'jim works');
  git('checkout', '-q', 'main');

  fs.writeFileSync(path.join(dir, 'shared.txt'), 'uncommitted edit\n');
  const dirty = await integrateAgentBranch(dir, 'jim-1', 'main');
  assert.equal(dirty.ok, false);
  assert.match(dirty.error, /uncommitted change/);

  git('checkout', '-q', '--', '.');
  git('checkout', '-q', 'agent/jim-1');
  const wrongBranch = await integrateAgentBranch(dir, 'jim-1', 'main');
  assert.equal(wrongBranch.ok, false);
  assert.match(wrongBranch.error, /not 'main'/);
});

// ─── SCALE-03 — the same diff, read by TIME instead of by card ──────────────
//
// `taskSpend` answers "what did card t-1 cost". The day band asks a different
// question of the same rows — "what was spent between 09:15 and 09:30" — and
// D-22 is explicit that a second lane must not re-derive the diff its own way.
// So `applyCostRow` is hoisted out of the class, exported, and made to RETURN
// the delta it already computed; `dailyCostRows` is a thin loop over it.
//
// The arithmetic is unchanged. What is new is the return channel, and the
// null-`task_id` exit is the load-bearing half of it: that guard credits no
// card (correctly — the spend belongs to no card), but the DAY total is not
// card-scoped and must still see it. An exit that returns nothing loses every
// between-cards cost sample from the day, silently.

const { applyCostRow } = loadTs('src/main/hive.ts');

test('SCALE-03: applyCostRow returns its delta on BOTH exits, including the null-task one', () => {
  const carded = applyCostRow(new Map(), new Map(), {
    agent_id: 'jim-1', session_id: 's1', task_id: 't-1', input: 2, output: 2, usd: 5
  });
  assert.deepEqual(carded, { tokens: 4, usd: 5 },
    'the final `return delta` is missing — the carded exit hands dailyCostRows nothing to bill');

  const between = applyCostRow(new Map(), new Map(), {
    agent_id: 'jim-1', session_id: 's1', input: 1, output: 1, usd: 2
  });
  assert.deepEqual(between, { tokens: 2, usd: 2 },
    'the `if (!taskId)` exit returned undefined. It still credits no card — that part is right — '
    + 'but it must hand the caller the delta it already computed, or the day total silently drops '
    + 'every cost sample recorded while an agent was between cards');

  // The guard's SEMANTICS are unchanged by the widening: it still credits no card.
  const byTask = new Map();
  applyCostRow(byTask, new Map(), { agent_id: 'jim-1', session_id: 's1', input: 9, output: 9, usd: 9 });
  assert.equal(byTask.size, 0,
    'a null-task row was billed to a card. Returning the delta must not also start crediting it.');
});

test('SCALE-03: a mid-day session rollover opens a NEW series — its first row bills its own whole value', (t) => {
  const { hive } = floor(t);
  hive.writeTasks([card('t-roll', { status: 'doing', assignee: 'jim-1', budgetTokens: 100000 })]);

  // The morning session runs a real cumulative total up to 600 tokens.
  hive.appendCostLedger(cumulative('jim-1', 100, 50, 1.50, 's-morning'));  // opens at 150 → +150
  hive.appendCostLedger(cumulative('jim-1', 400, 200, 6.00, 's-morning')); // 600 − 150   → +450
  assert.equal(hive.taskSpend('t-roll').tokens, 600, 'the morning series did not add up');

  // THE ROLLOVER — a genuinely new OTel session starting mid-sequence, not a
  // transcript fallback. Its counter restarts at zero, so its first snapshot is
  // far SMALLER than the morning's running total.
  hive.appendCostLedger(cumulative('jim-1', 20, 10, 0.30, 's-afternoon'));
  const spend = hive.taskSpend('t-roll');
  assert.equal(spend.tokens, 630,
    `the card reads ${spend.tokens} tokens after the rollover, not 630. Three ways to get here, all `
    + 'wrong: keying the series on agent_id alone clamps 30 − 600 to 0 and the card gains nothing; '
    + 'an unclamped agent-only key hands back a negative; summing the snapshots gives 780. The new '
    + '(agent_id, session_id) pair has no predecessor, so its first row is its OWN whole value.');
  assert.equal(Number(spend.usd.toFixed(2)), 6.30, 'usd must follow the same series rule as tokens');

  // And the afternoon then diffs against ITSELF, not against the morning.
  hive.appendCostLedger(cumulative('jim-1', 50, 25, 0.75, 's-afternoon'));
  assert.equal(hive.taskSpend('t-roll').tokens, 675, '75 − 30 = 45 more, inside the new series');
});

test('SCALE-03: dailyCostRows diffs the whole ledger and keeps null-task rows in the DAY total', (t) => {
  const { home, hive } = floor(t);
  const DAY = 24 * 60 * 60 * 1000;
  const dayStart = Date.UTC(2026, 0, 15, 0, 0, 0);
  const dayEnd = dayStart + DAY;

  const raw = (sessionId, taskId, ts, tokens, usd) => JSON.stringify({
    agent_id: 'jim-1', session_id: sessionId, task_id: taskId, ts,
    input: tokens, output: 0, cache_read: 0, cache_creation: 0, model: 'claude-x', usd
  }) + '\n';

  fs.writeFileSync(path.join(home, 'hive', 'cost-ledger.jsonl'), [
    // BEFORE the day. Excluded from the answer, but it must still SEED the diff
    // — otherwise the first in-day row looks like a series opening and bills its
    // whole cumulative value instead of the day's actual spend.
    raw('s1', 't-a', dayStart - 1000, 100, 1.00),
    raw('s1', 't-a', dayStart + 60_000, 250, 2.50),   // 250 − 100 → +150 / +1.50
    raw('s1', null, dayStart + 120_000, 300, 3.00),   // 300 − 250 → +50  / +0.50, no card
    raw('s2', 't-b', dayStart + 180_000, 40, 0.40),   // new series → +40  / +0.40
    raw('s2', 't-b', dayEnd + 1000, 90, 0.90)         // AFTER the day
  ].join(''));

  const rows = hive.dailyCostRows(dayStart, dayEnd);
  assert.deepEqual(rows.map((r) => r.tokens), [150, 50, 40],
    `dailyCostRows returned ${JSON.stringify(rows.map((r) => r.tokens))}. [250, 50, 40] means the `
    + 'pre-boundary row did not seed the diff; a missing 50 means the null-task exit returned '
    + 'undefined and the between-cards sample fell out of the day.');
  assert.deepEqual(rows.map((r) => r.taskId), ['t-a', null, 't-b'],
    'a null task_id is a real fact about the row (the agent was between cards) — it belongs in the '
    + 'day total and must stay distinguishable from a card');
  assert.deepEqual(rows.map((r) => Number(r.usd.toFixed(2))), [1.50, 0.50, 0.40]);
  assert.deepEqual(rows.map((r) => r.ts), [dayStart + 60_000, dayStart + 120_000, dayStart + 180_000],
    'rows outside [dayStart, dayEnd) must not be RETURNED, only used as diff seed');
  assert.equal(rows.every((r) => r.agentId === 'jim-1'), true, 'each row must name its agent');
});
