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

// ─── #34 — per-card cost attribution ────────────────────────────────────────

test('cost rows carry the card they were spent on, and a card knows its cap', (t) => {
  const { home, hive } = floor(t);
  hive.writeTasks([
    card('t-doing', { status: 'doing', assignee: 'jim-1', budgetTokens: 20 }),
    card('t-idle', { status: 'todo', assignee: 'pam-1' })
  ]);

  const sample = (agentId, input, output, usd) => ({
    agentId, sessionId: 's1', ts: 1, input, output, cacheRead: 0, cacheCreation: 0, model: 'claude-x', usd
  });
  hive.appendCostLedger(sample('jim-1', 10, 5, 0.01));
  hive.appendCostLedger(sample('jim-1', 4, 1, 0.02));
  hive.appendCostLedger(sample('pam-1', 100, 100, 9.99)); // no card in flight

  const rows = fs.readFileSync(path.join(home, 'hive', 'cost-ledger.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(rows.map((r) => r.task_id), ['t-doing', 't-doing', null]);

  const spend = hive.taskSpend('t-doing');
  assert.equal(spend.tokens, 20);
  assert.equal(Number(spend.usd.toFixed(2)), 0.03);
  assert.equal(spend.budgetTokens, 20);
  assert.equal(spend.over, false, 'at the cap is not over it');

  hive.appendCostLedger(sample('jim-1', 1, 0, 0.001));
  assert.equal(hive.taskSpend('t-doing').over, true);
  assert.deepEqual(hive.taskSpend('t-idle'), { tokens: 0, usd: 0, budgetTokens: null, over: false });
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
