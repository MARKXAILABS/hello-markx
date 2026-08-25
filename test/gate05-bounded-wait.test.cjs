'use strict';

/**
 * GATE-05's bounded wait, observed on the real shim's real stdout.
 *
 * WHAT IS UNDER TEST HERE IS THE SHIM, not the registry. Plan 04-15 already
 * unit-tested `ApprovalRegistry` (unguessable ids, single-use answers, expiry
 * unanswerable, cross-agent poll denied). 04-VALIDATION.md § Anti-Vacuous-Pass
 * Rules refuses that as evidence for criterion 2 in as many words: *"Calling
 * `handle()` directly proves the judge, not the loop. Drive the real shim as a
 * child process into the real `HookServer`."* So every verdict assertion below
 * reads a child process's stdout and exit code. Nothing here reads a verdict off
 * the registry.
 *
 * NO `{ skip: … }` OF ANY KIND, and that is load-bearing rather than tidy.
 * test/gate-harness.cjs (plan 04-01) asks `hive.sockPath()` for the endpoint, so
 * it is a `\\.\pipe\` name on win32 and a socket file on POSIX and both `listen`
 * and `net.createConnection` take it either way — the platform gate on
 * test/hook-auth-roundtrip.test.cjs is a fixture limitation that this file does
 * not inherit. A POSIX gate here would make criterion 2's ONLY admissible
 * evidence pass vacuously, with all eight cases skipped, on the only machine
 * this phase runs on; and a skipped case has no RED, so the RED run this task
 * owes its SUMMARY would be unproducible (T-04-ASK-33).
 *
 * NEVER ASK THE FILESYSTEM WHETHER A SOCKET IS THERE (04-RESEARCH Pitfall 3): a
 * win32 named pipe has no filesystem entry, so the answer is always false.
 * Connect, never stat — test/boot-floor.test.cjs:183 in those words.
 *
 * WHY SOME CASES RUN AGAINST A STUB FLOOR. Production's ask TTL is
 * `ASK_TTL_MS = (MIN_PRETOOLUSE_SEC - 30) * 1000` — two minutes, a phone push
 * plus a human tap — and `HookServer` builds its own `ApprovalRegistry` with
 * that constant (hooks.ts), with no seam a test may shorten. The three cases
 * whose subject is the SHIM's own bound (a deadline it enforces itself, a boot
 * timer it must clear, a poll that is never answered) therefore face a floor
 * whose replies this file writes, on its own socket, reached through the
 * harness's own documented `opts.env.HIVE_SOCK` seam. The shim is the real
 * shim, the child process is real, the socket is real; only the floor's clock is
 * the test's. Every case whose subject is the SERVER's behaviour — an operator's
 * yes, a cross-agent poll, a mid-ask death, grok's translator — runs against the
 * real `HookServer` through `withHookServer`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const { withHookServer, runShim } = require('./gate-harness.cjs');

/** The whole file's budget, stated as a number so a future change that
 *  reintroduces a real 120 s wait fails loudly instead of slowly. Fifteen
 *  seconds, not ten: cases 6 (~6 s) and 8 (~5 s) sit deliberately ABOVE the two
 *  5 s thresholds that no faster case can observe, so a ten-second file is only
 *  reachable by deleting the only two cases that can see a fail-open.
 *  04-VALIDATION.md § Sampling Rate budgets the full suite at 90 s. */
const FILE_BUDGET_MS = 15_000;

/** No SINGLE shim run may take this long. Comfortably above case 6's ~6.5 s and
 *  a thirteenth of the production TTL, so a shim that starts really waiting out
 *  a two-minute ask fails here rather than in an operator's suite. */
const SHIM_CEILING_MS = 9_000;

/** The shim's own boot `process.exit(0)` budget and its own per-poll budget are
 *  both 5 s (hiveTemplates.ts). Cases 6 and 8 exist to sit above them. */
const SHIM_TIMER_MS = 5_000;

/** Returned by a stub handler that means "accept the connection, then never
 *  write a byte and never end it" — case 8's whole mechanism. */
const SILENT = Symbol('accept and never answer');

/** An endpoint in the right namespace for this platform that nothing ever binds.
 *  A NAME, never a stat: on win32 the pipe namespace is not the filesystem. */
function endpoint(tag) {
  const id = `md-gate05-${tag}-${randomBytes(8).toString('hex')}`;
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\${id}`
    : path.join(os.tmpdir(), `${id}.sock`);
}

/**
 * A floor whose replies this file writes, on its own socket.
 *
 * Same wire framing as the real one (`hooks.ts`'s `listenOn`): one
 * newline-terminated JSON payload per connection, answered with `conn.end(body)`.
 * `received` is every payload that arrived, in order — the positive lower bound
 * D-33/D-40 demands beside every negative assertion, and the only way to tell a
 * shim that WAITED from one that took the ask reply's deny and left.
 */
function stubFloor(handler) {
  const sock = endpoint('floor');
  const received = [];
  const live = new Set();

  const server = net.createServer((conn) => {
    live.add(conn);
    conn.on('close', () => live.delete(conn));
    conn.on('error', () => { /* the shim hung up — that is a case, not a fault */ });
    conn.setEncoding('utf8');
    let buf = '';
    let answered = false;
    conn.on('data', (d) => {
      if (answered) return;
      buf += d;
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      answered = true;
      let payload = {};
      try { payload = JSON.parse(buf.slice(0, nl)); } catch { /* the shim's bytes are the assertion */ }
      received.push(payload);
      const reply = handler(payload, received);
      if (reply === SILENT) return;
      try { conn.end(JSON.stringify(reply)); } catch { /* the shim is already gone */ }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(sock, () => resolve({
      sock,
      received,
      polls: () => received.filter((p) => p && p.hook_event_name === 'ApprovalPoll'),
      close: () => new Promise((done) => {
        // Destroy first: case 8 deliberately holds a connection open, and
        // `server.close()` alone waits for it forever.
        for (const c of live) { try { c.destroy(); } catch { /* gone */ } }
        server.close(() => done());
      })
    }));
  });
}

/**
 * `withHookServer`, with the shim pointed at a stub floor instead of the real
 * one. The harness still stands up a real `HookServer` (and therefore a real
 * per-agent token and a real scratch dir); `ctx.sock` is swapped, which is the
 * harness's own documented seam for exactly this.
 */
function withStubFloor(handler, fn) {
  return withHookServer({ agentId: 'a1' }, async (ctx) => {
    const floor = await stubFloor(handler);
    try {
      return await fn({ ...ctx, sock: floor.sock, realSock: ctx.sock, floor });
    } finally {
      await floor.close();
    }
  });
}

/** The engine-native payload for a command `commandShape.ts` routes to `ask`. */
const forcePush = (cwd) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'git push origin +main' },
  cwd
});

/** The ask reply main really writes (hooks.ts `openApproval`): ONE object that
 *  is simultaneously a valid PreToolUse deny and a `hive_ask` handle. */
const askReply = (deadlineMs, pollMs) => ({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: 'Refused: this command FORCE-pushes to a git remote.'
  },
  hive_ask: { id: `ask-${randomBytes(16).toString('hex')}`, deadlineMs, pollMs }
});

function parseVerdict(run, what) {
  assert.notEqual(
    run.stdout, '',
    `${what}: the shim exited ${run.code} with EMPTY stdout. A silent exit is ALLOW — that is the `
    + `single most important line in this gate. stderr: ${run.stderr}`
  );
  let out;
  try {
    out = JSON.parse(run.stdout);
  } catch (e) {
    assert.fail(`${what}: stdout is not JSON (${e.message}): ${JSON.stringify(run.stdout)}`);
  }
  return (out && out.hookSpecificOutput) || {};
}

function assertBounded(run, what) {
  assert.equal(run.code, 0, `${what}: the shim exited ${run.code}, not 0. stderr: ${run.stderr}`);
  assert.ok(
    run.elapsedMs < SHIM_CEILING_MS,
    `${what}: the shim took ${run.elapsedMs}ms, over this file's ${SHIM_CEILING_MS}ms per-run `
    + `ceiling. A shim really waiting out the production TTL takes 120 000ms; that must fail here.`
  );
}

async function waitFor(fn, what, budgetMs = 4_000) {
  const until = Date.now() + budgetMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > until) throw new Error(`timed out after ${budgetMs}ms waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

// ─── the two slow cases, started here and awaited in their own cases ──────────
// Cases 6 and 8 each sit deliberately above a 5 s threshold that no faster case
// can observe: the shim's boot `process.exit(0)` and the shim's own per-poll
// timeout. Run one after the other they alone floor this file at ~11 s against a
// 15 s budget. Starting them at load lets the two waits overlap each other AND
// the six fast cases, so the file's wall time is about its slowest case rather
// than the sum. Each case still RUNS and still asserts, and every elapsed
// assertion reads that shim's OWN wall clock (`runShim`'s `elapsedMs`), never
// this file's — so neither case can be satisfied by another's waiting.

/** Case 6 (R2-BL2): a TTL deliberately longer than the shim's 5 s boot timer. */
function runBootTimerCase() {
  const ttlMs = 6_000;
  return withStubFloor(
    (p) => (p.hook_event_name === 'ApprovalPoll'
      ? { status: 'pending' }
      : askReply(Date.now() + ttlMs, 400)),
    async (ctx) => ({ ttlMs, run: await runShim(ctx, forcePush(ctx.userData)), floor: ctx.floor.polls().length })
  );
}

/** Case 8 (M-8 / T-04-ASK-47): a poll that opens and is never answered. */
function runSilentPollCase() {
  return withStubFloor(
    (p) => (p.hook_event_name === 'ApprovalPoll'
      ? SILENT
      : askReply(Date.now() + 60_000, 50)),
    async (ctx) => ({ run: await runShim(ctx, forcePush(ctx.userData)), polls: ctx.floor.polls().length })
  );
}

const bootTimerCase = runBootTimerCase();
const silentPollCase = runSilentPollCase();
// Node warns about a promise that rejects before anything awaits it; the real
// failure is re-thrown at the `await` inside each case below.
bootTimerCase.catch(() => {});
silentPollCase.catch(() => {});

// ─── 1 ───────────────────────────────────────────────────────────────────────

test('1 — an unanswered ask DENIES at the deadline, on the shim\'s own stdout', async () => {
  await withStubFloor(
    (p) => (p.hook_event_name === 'ApprovalPoll'
      ? { status: 'pending' }
      : askReply(Date.now() + 700, 150)),
    async (ctx) => {
      const run = await runShim(ctx, forcePush(ctx.userData));
      assertBounded(run, 'deadline');

      const verdict = parseVerdict(run, 'deadline');
      assert.equal(
        verdict.permissionDecision, 'deny',
        `the deadline passed and the shim wrote ${JSON.stringify(run.stdout)} instead of a deny`
      );

      // The positive lower bound beside the negative (D-33/D-40), and the whole
      // discriminator: an UN-upgraded shim writes the ask reply verbatim — which
      // is also a deny — and never sends a single poll. Only a shim that WAITED
      // gets here with polls on the wire.
      const polls = ctx.floor.polls();
      assert.ok(
        polls.length >= 1,
        'the shim wrote a deny without ever polling — it took the ask reply\'s own deny and left, '
        + 'which is the old behaviour, not the bounded wait'
      );
      for (const poll of polls) {
        assert.match(poll.ask_id, /^ask-[0-9a-f]{32}$/, 'a poll carried no usable ask id');
        assert.equal(poll.sock_token, ctx.token, 'a poll carried the wrong per-agent token');
      }
      // A fresh SHORT connection per poll, never a held-open one (L-02): the
      // stub answers one payload per connection, so N polls means N connections.
      assert.ok(polls.length >= 1 && polls.length <= 12, `${polls.length} polls in ~700ms is not a ~150ms cadence`);
    }
  );
});

// ─── 2 ───────────────────────────────────────────────────────────────────────

test('2 — an explicit yes ALLOWS, through the real HookServer', async () => {
  await withHookServer({ agentId: 'a1' }, async (ctx) => {
    const run = runShim(ctx, forcePush(ctx.userData));
    const ask = await waitFor(() => ctx.server.openApprovals()[0], 'the real HookServer to open an ask');
    assert.equal(ctx.server.answerApproval(ask.id, true), true, 'the operator\'s yes was refused');

    const finished = await run;
    assertBounded(finished, 'yes');
    assert.equal(
      parseVerdict(finished, 'yes').permissionDecision, 'allow',
      `the operator said yes and the shim wrote ${JSON.stringify(finished.stdout)}`
    );
    assert.ok(
      finished.elapsedMs >= 500,
      `the shim answered in ${finished.elapsedMs}ms — it cannot have waited for an answer it got `
      + 'after the first reply; it wrote the ask reply\'s own deny instead'
    );
  });
});

// ─── 3 ───────────────────────────────────────────────────────────────────────

test('3 — a PRE-ask dead socket still ALLOWS, and sends no poll at all (D-08 clause 3)', async () => {
  await withStubFloor(() => ({}), async (ctx) => {
    const dead = endpoint('dead');
    const run = await runShim(ctx, forcePush(ctx.userData), { env: { HIVE_SOCK: dead } });

    assertBounded(run, 'pre-ask dead socket');
    assert.equal(
      run.stdout, '',
      `the floor was not running and the shim wrote ${JSON.stringify(run.stdout)}. "The floor is `
      + 'down" ALLOWS; only "the floor asked and nobody answered" denies. Those are different '
      + 'failures and they must not share a default.'
    );
    assert.equal(
      ctx.floor.received.length, 0,
      'a payload reached the recorder from a shim that was pointed at a dead endpoint'
    );

    // The recorder itself works — otherwise "zero polls" is satisfied by a
    // stub that never counted anything.
    const control = await runShim(ctx, forcePush(ctx.userData));
    assertBounded(control, 'pre-ask dead socket control');
    assert.equal(ctx.floor.received.length, 1, 'the live control never reached the recorder either');
    assert.equal(ctx.floor.polls().length, 0, 'a reply with no hive_ask must not start a poll loop');
  });
});

// ─── 4 ───────────────────────────────────────────────────────────────────────

test('4 — a poll carrying ANOTHER agent\'s token is refused, with the owner as control', async () => {
  await withHookServer({ agentId: 'a1' }, async (ctx) => {
    const opener = runShim(ctx, forcePush(ctx.userData));
    const ask = await waitFor(() => ctx.server.openApprovals()[0], 'the real HookServer to open an ask');

    const foreignToken = ctx.server.mintToken('a2');
    assert.notEqual(foreignToken, ctx.token, 'a2 was minted a2 token identical to a1\'s');

    const foreign = await runShim(
      ctx,
      { hook_event_name: 'ApprovalPoll', ask_id: ask.id },
      { env: { AGENT_ID: 'a2', HIVE_SOCK_TOKEN: foreignToken } }
    );
    assertBounded(foreign, 'cross-agent poll');
    assert.equal(
      parseVerdict(foreign, 'cross-agent poll').permissionDecision, 'deny',
      `a2 polled a1's ask and got ${JSON.stringify(foreign.stdout)}`
    );

    const owner = await runShim(ctx, { hook_event_name: 'ApprovalPoll', ask_id: ask.id });
    assertBounded(owner, 'owner poll');
    assert.equal(
      JSON.parse(owner.stdout).status, 'pending',
      `the OWNING agent polled its own live ask and got ${JSON.stringify(owner.stdout)} — if this `
      + 'is also a deny, the cross-agent assertion above proves nothing'
    );

    // Let the opener finish rather than orphaning a polling child.
    assert.equal(ctx.server.answerApproval(ask.id, false), true);
    const finished = await opener;
    assertBounded(finished, 'opener');
    assert.equal(parseVerdict(finished, 'opener').permissionDecision, 'deny');
  });
});

// ─── 5 ───────────────────────────────────────────────────────────────────────

test('5 — a MID-ask dead socket DENIES: killing the floor cannot turn a pending deny into an allow', async () => {
  await withHookServer({ agentId: 'a1' }, async (ctx) => {
    const run = runShim(ctx, forcePush(ctx.userData));
    await waitFor(() => ctx.server.openApprovals()[0], 'the real HookServer to open an ask');
    // The ask entry is created INSIDE handle(), a moment before the reply is
    // written back. Let that reply land, then take the floor away — well inside
    // the server's own 1 000 ms poll cadence, so the death lands between the
    // hive_ask and the first poll.
    await new Promise((r) => setTimeout(r, 250));
    ctx.server.stop();

    const finished = await run;
    assertBounded(finished, 'mid-ask death');
    assert.equal(
      parseVerdict(finished, 'mid-ask death').permissionDecision, 'deny',
      `the floor died while an ask was pending and the shim wrote ${JSON.stringify(finished.stdout)}. `
      + 'Agents here run permissions-bypassed by design, so a fail-open on this path makes killing '
      + 'the Electron main process an agent-triggerable way to get a yes.'
    );
    assert.ok(
      finished.elapsedMs >= 250,
      `the shim answered in ${finished.elapsedMs}ms — it never entered the wait, so this deny is `
      + 'the ask reply\'s own and says nothing about the mid-ask path'
    );
  });
});

// ─── 6 ───────────────────────────────────────────────────────────────────────

test('6 (R2-BL2) — an ask outliving the shim\'s 5 s boot timer still DENIES', async () => {
  const { ttlMs, run } = await bootTimerCase;

  assert.ok(
    ttlMs > SHIM_TIMER_MS,
    `this case's TTL is ${ttlMs}ms, at or under the ${SHIM_TIMER_MS}ms boot timer it exists to `
    + 'outlive. Reducing it turns the only case that can see this class of bug into one more '
    + 'blind one.'
  );
  assertBounded(run, 'boot timer');
  assert.equal(
    parseVerdict(run, 'boot timer').permissionDecision, 'deny',
    `an ask outliving the boot timer produced ${JSON.stringify(run.stdout)}. If stdout is empty the `
    + 'shim exited SILENTLY at t=5s mid-ask — and a silent exit is ALLOW. `.unref()` does not stop '
    + 'that timer firing while the poll loop keeps the process alive; only clearing it does.'
  );
  assert.ok(
    run.elapsedMs > SHIM_TIMER_MS,
    `the shim finished in ${run.elapsedMs}ms, at or under the ${SHIM_TIMER_MS}ms boot timer. Every `
    + 'other case in this file finishes below that threshold, which is exactly why this one exists; '
    + 'a version of it that finishes early has stopped testing the thing it was written for.'
  );
});

// ─── 7 ───────────────────────────────────────────────────────────────────────

test('7 — the UNCHANGED GROK_HOOK_SHIM reads the ask reply as the deny it also is', async () => {
  await withHookServer({ agentId: 'a1' }, async (ctx) => {
    const grokPayload = (command) => ({
      hookEventName: 'pre_tool_use',
      sessionId: 's1',
      cwd: ctx.userData,
      toolName: 'Bash',
      toolInput: { command }
    });

    const denied = await runShim(ctx, grokPayload('git push origin +main'), { shim: 'GROK_HOOK_SHIM' });
    assertBounded(denied, 'grok ask');
    assert.notEqual(denied.stdout, '', 'grok wrote nothing on an ask reply — no stdout is ALLOW');
    const out = JSON.parse(denied.stdout);
    assert.equal(out.decision, 'deny', `grok translated the ask reply into ${denied.stdout}`);
    assert.match(
      out.reason, /FORCE-pushes/,
      'grok dropped the judge\'s own sentence, so the operator reading a refused transcript cannot '
      + 'tell WHICH rule refused it'
    );
    // grok must NOT have entered a poll loop: a shim may poll only on an engine
    // whose PreToolUse timeout this app itself writes, and grok's is its own
    // ~5 s event-aware default with an unverified unit.
    assert.ok(
      denied.elapsedMs < 2_000,
      `grok took ${denied.elapsedMs}ms — that is a wait, and grok must not wait`
    );

    const allowed = await runShim(ctx, grokPayload('ls -la'), { shim: 'GROK_HOOK_SHIM' });
    assertBounded(allowed, 'grok control');
    assert.equal(
      allowed.stdout, '',
      `a benign command produced ${JSON.stringify(allowed.stdout)} from grok — agy and grok both `
      + 'fail CLOSED on any object written to stdout, so an unconditional write is a deny-everything'
    );
  });
});

// ─── 8 ───────────────────────────────────────────────────────────────────────

test('8 (T-04-ASK-47) — a poll that OPENS and is never answered DENIES on the per-poll timer', async () => {
  const { run, polls } = await silentPollCase;

  assert.ok(polls >= 1, 'the shim never sent the poll this case exists to leave unanswered');
  assertBounded(run, 'silent poll');
  assert.equal(
    parseVerdict(run, 'silent poll').permissionDecision, 'deny',
    `a poll the floor accepted and never answered produced ${JSON.stringify(run.stdout)}. This is a `
    + 'different code path from case 5: that one kills the socket (an `error` event), this one '
    + 'keeps it open and silent (a timeout). Both must WRITE.'
  );
  assert.ok(
    run.elapsedMs > SHIM_TIMER_MS - 500,
    `the shim gave up after ${run.elapsedMs}ms, under the per-poll ${SHIM_TIMER_MS}ms budget minus `
    + 'slack — so whatever ended that wait, it was not the timer this case is about'
  );
  assert.ok(
    run.elapsedMs < FILE_BUDGET_MS,
    `one shim run took ${run.elapsedMs}ms against this file's whole ${FILE_BUDGET_MS}ms budget`
  );
});
