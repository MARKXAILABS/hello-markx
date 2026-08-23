'use strict';

/**
 * The queue's renderer half: refusals that survive, a turn-end that knows its own
 * source, and a roster slice that publishes once (01-28 — b/CR-01, b/CR-02, b/CR-03).
 *
 * WHY THIS FILE EXISTS
 * FLOOR-02 moved the delivery queue into main. The renderer kept a half of each fact
 * that no longer matched, and all three defects here are that same shape:
 *   1. `MessageQueueComposer` cleared the textarea unconditionally while `store.ts`
 *      dropped main's `{ok:false}` on five reachable paths. Fill a queue, type, press
 *      Enter — the message is gone and nothing anywhere says why.
 *   2. The renderer's own quiesce filtered `status !== 'working'`; main's replacement
 *      has no filter, so a permission-prompted agent was flipped to idle at 12 s and
 *      the "needs you" escalation vanished.
 *   3. `persistQueues` is dead, yet `rosterMirror.queues` is still seeded from
 *      localStorage and republished to `roster.json` forever.
 *
 * THE HARNESS, STATED HONESTLY
 * The `Module._load` interceptor (`.css` to `{}`, `@/...` to `loadTs`) plus
 * `globalThis.self = globalThis` is copied from `test/renderer-components.test.cjs:96-122`,
 * and `seedServerSnapshot`'s shape from `:155-161` — `renderToStaticMarkup` is a SERVER
 * render, so zustand hands React `getInitialState()` and `useStore.setState()` is
 * invisible to it. That much has a precedent.
 *
 * The `globalThis.window` stub does NOT. Measured before writing this file:
 * `grep -rn "global.window\|globalThis.window\|global\.localStorage" test/` matched
 * nothing, so no test in this repo has ever installed one. `store.ts` needs no window to
 * LOAD (every `window` access in it sits inside a try/catch), but a test that has to
 * SCRIPT `window.cth.hiveQueue` and `window.cth.rosterWrite` has to install one. This is
 * the first; it is not copied from an idiom that exists.
 *
 * THE CEILING
 * `renderToStaticMarkup` runs no effects and fires no events. No test here presses Enter.
 * "a refused message survives in the textarea" is asserted as MARKUP seeded through the
 * server snapshot — `drafts` is store state (`store.ts` `drafts: Record<string,string>`),
 * which is exactly why it is observable at all. The end-to-end keystroke is recorded as
 * MEASUREMENT UNAVAILABLE in the summary, not smuggled in as a green tick.
 *
 * EVERY assertion below is BEHAVIOURAL — it calls the shipped function and reads what it
 * returns or what it rendered — with exactly ONE exception, marked STRUCTURAL where it
 * lives: the comment-claim regex, which can only see source text.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const loadTs = require('./load-ts.cjs');

const ROOT = path.join(__dirname, '..');
const LS_QUEUES = 'cth.messageQueues';

/** `@/x` to the repo-relative path `loadTs` wants. Same candidates `resolveTs` tries. */
function resolveAlias(request) {
  const base = path.join('src/renderer/src', request.slice(2));
  for (const candidate of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (fs.existsSync(path.join(ROOT, candidate))) return candidate;
  }
  return null;
}

// ─── the window stub ────────────────────────────────────────────────────────
//
// `node --test` runs every test FILE in its own child process, so installing a
// global here cannot leak into another file's run. It is installed for the whole
// of this one on purpose: `queueOp` and `flushRosterNow` read `window` at CALL
// time, not at load time, so a load-only shim would be gone by the time the
// assertions run.

const lsData = new Map();
/** Swapped per test — the stub delegates so a test can script one call. */
const cth = { hiveQueue: null, rosterWrite: null };
const winListeners = [];

globalThis.window = {
  cth: {
    hiveQueue: (op) => cth.hiveQueue(op),
    rosterWrite: (snap) => cth.rosterWrite(snap)
  },
  localStorage: {
    getItem: (k) => (lsData.has(k) ? lsData.get(k) : null),
    setItem: (k, v) => { lsData.set(k, String(v)); },
    removeItem: (k) => { lsData.delete(k); }
  },
  addEventListener: (ev, fn) => { winListeners.push({ ev, fn }); },
  removeEventListener: () => { /* noop */ }
};

/**
 * A pre-FLOOR-02 queue in localStorage. This is the ONLY bridge main has to those
 * messages (main cannot read localStorage), which is why b/CR-03's fix is a
 * one-shot rather than a deletion.
 */
const PRE_MIGRATION = {
  a1: [{ id: 'old-1', text: 'typed before the migration', ts: 1 }]
};
lsData.set(LS_QUEUES, JSON.stringify(PRE_MIGRATION));

/** Load a module tree through the alias/css interceptor, restoring both shims after. */
function underInterceptor(load, fn) {
  const origLoad = Module._load;
  const origSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
  globalThis.self = globalThis;
  Module._load = function (request, ...rest) {
    if (request.endsWith('.css')) return {};
    if (request.startsWith('@/')) {
      const hit = resolveAlias(request);
      if (hit) return load(hit);
    }
    return origLoad.call(this, request, ...rest);
  };
  try { return fn(); }
  finally {
    Module._load = origLoad;
    if (origSelf) Object.defineProperty(globalThis, 'self', origSelf);
    else delete globalThis.self;
  }
}

const listenersBefore = winListeners.length;
const { useStore } = underInterceptor(loadTs, () => loadTs('src/renderer/src/store/store.ts'));
const { MessageQueueComposer } = underInterceptor(loadTs, () =>
  loadTs('src/renderer/src/components/MessageQueueComposer.tsx'));
const { stopArmDecision } = underInterceptor(loadTs, () =>
  loadTs('src/renderer/src/hooks/useHive.ts'));

/** `store.ts` registers `flushRosterNow` on `beforeunload` — that is the seam that
 *  drives a synchronous roster write without waiting out the 500 ms debounce. */
const flushRoster = winListeners.slice(listenersBefore).find((l) => l.ev === 'beforeunload')?.fn;

assert.equal(typeof useStore, 'function', 'store.ts did not come back from loadTs');
assert.equal(typeof MessageQueueComposer, 'function', 'MessageQueueComposer did not come back from loadTs');
assert.equal(typeof flushRoster, 'function', 'store.ts did not register flushRosterNow on beforeunload');

/** Call the exported decision, failing the CASE rather than aborting the whole file.
 *  A load-time assert here would hide every other failure in this file, which is
 *  exactly the thing that lets a red suite look like one broken test. */
function decide(...args) {
  assert.equal(typeof stopArmDecision, 'function',
    'useHive.ts does not export stopArmDecision — the Stop arm is still buried in a React effect, where node --test cannot reach it');
  return stopArmDecision(...args);
}

const html = (element) => renderToStaticMarkup(element);
const visibleText = (markup) => markup.replace(/<[^>]*>/g, '').trim();

/** Seed the state the SERVER render reads (renderer-components.test.cjs:155-161). */
function seedServerSnapshot(t, patch) {
  const snapshot = useStore.getInitialState();
  const before = {};
  for (const key of Object.keys(patch)) before[key] = snapshot[key];
  Object.assign(snapshot, patch);
  t.after(() => Object.assign(snapshot, before));
}

/** An idle agent row — `idle` gates the composer's own statusHint branches. */
const agentRow = (extra = {}) => ({
  id: 'a1', name: 'Ada', ptyId: 'pty-1', provider: 'claude', command: 'claude', status: 'idle', ...extra
});

const queued = (text) => [{ id: 'q-1', text, ts: 1 }];

/** Reset the live store between tests — `setState` is what the ACTIONS read. */
function resetStore(t) {
  const before = { queueError: useStore.getState().queueError, messageQueues: useStore.getState().messageQueues };
  t.after(() => useStore.setState(before));
  useStore.setState({ queueError: {}, messageQueues: {} });
}

// ════ TASK 1 — a refused message is not lost, and the reason is reachable ════

test('a refused enqueue resolves main refusal verbatim and parks the reason for that agent', async (t) => {
  resetStore(t);
  const calls = [];
  cth.hiveQueue = async (op) => { calls.push(op); return { ok: false, error: 'queue full for a1 (200)' }; };

  const res = await useStore.getState().enqueueMessage('a1', 'do not lose me');

  assert.equal(res.ok, false, 'enqueueMessage did not report main refusal to its caller');
  assert.equal(res.error, 'queue full for a1 (200)', 'main reason did not survive the store');
  assert.equal(useStore.getState().queueError.a1, 'queue full for a1 (200)',
    'the refusal is not in store state, so no render can ever show it');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, 'enqueue');
  assert.equal(calls[0].text, 'do not lose me');
});

test('01-27 own refusal string reaches the caller unaltered', async (t) => {
  // Quoted verbatim from 01-27-SUMMARY.md's HANDOFF section. The dash is U+2014.
  const READ_FAULT = 'queue temporarily unreadable (EISDIR) — holding the parked messages rather than overwriting them';
  resetStore(t);
  cth.hiveQueue = async () => ({ ok: false, error: READ_FAULT });

  const res = await useStore.getState().enqueueMessage('a1', 'hello');

  assert.equal(res.error, READ_FAULT);
  assert.equal(useStore.getState().queueError.a1, READ_FAULT);
});

test('NEGATIVE CONTROL: an accepted enqueue resolves ok, applies main snapshot, and CLEARS the reason', async (t) => {
  resetStore(t);
  cth.hiveQueue = async () => ({ ok: false, error: 'unknown agent: a1' });
  await useStore.getState().enqueueMessage('a1', 'first try');
  assert.equal(useStore.getState().queueError.a1, 'unknown agent: a1', 'precondition: a refusal is parked');

  const snapshot = { a1: queued('second try') };
  cth.hiveQueue = async () => ({ ok: true, id: 'q-9', queues: snapshot });
  const res = await useStore.getState().enqueueMessage('a1', 'second try');

  assert.equal(res.ok, true);
  assert.deepEqual(useStore.getState().messageQueues, snapshot, 'main snapshot was not applied');
  assert.equal(useStore.getState().queueError.a1, undefined,
    'acceptance did not clear the refusal — the operator would keep reading a dead reason');
});

test('a REJECTED hiveQueue resolves a refusal instead of throwing out of a click handler', async (t) => {
  resetStore(t);
  cth.hiveQueue = () => Promise.reject(new Error('ipc channel closed'));

  const res = await useStore.getState().enqueueMessage('a1', 'do not lose me');

  assert.equal(res.ok, false);
  assert.match(String(res.error), /ipc channel closed/);
  assert.match(String(useStore.getState().queueError.a1), /ipc channel closed/);
});

test('NEGATIVE CONTROL: window.cth absent, and window absent, both stay non-fatal', async (t) => {
  resetStore(t);
  const realCth = globalThis.window.cth;
  t.after(() => { globalThis.window.cth = realCth; });

  globalThis.window.cth = undefined;
  const noCth = await useStore.getState().enqueueMessage('a1', 'do not lose me');
  assert.equal(noCth.ok, false, 'a missing preload must refuse, not resolve undefined');
  assert.ok(noCth.error, 'a missing preload refused with no reason at all');

  const realWindow = globalThis.window;
  globalThis.window = undefined;
  try {
    const noWindow = await useStore.getState().enqueueMessage('a1', 'do not lose me');
    assert.equal(noWindow.ok, false, 'no window at all must refuse rather than throw');
  } finally {
    globalThis.window = realWindow;
  }
});

test('a whitespace-only message resolves main own empty-message wording, never undefined', async (t) => {
  resetStore(t);
  const calls = [];
  cth.hiveQueue = async (op) => { calls.push(op); return { ok: true, queues: {} }; };

  const res = await useStore.getState().enqueueMessage('a1', '   ');

  assert.ok(res, 'the early return resolved undefined — every caller reading .ok would throw');
  assert.equal(res.ok, false);
  assert.equal(res.error, 'empty message', 'one refusal must have one wording wherever it is produced');
  assert.equal(calls.length, 0, 'an empty message was still sent to main');
});

// ── the reason on screen ────────────────────────────────────────────────────

test('the refusal renders in the markup with one message queued, and the draft survives', (t) => {
  seedServerSnapshot(t, {
    drafts: { a1: 'do not lose me' },
    messageQueues: { a1: queued('hi') },
    queueError: { a1: 'queue full for a1 (200)' }
  });

  const markup = html(React.createElement(MessageQueueComposer, { agent: agentRow() }));
  const text = visibleText(markup);

  assert.match(text, /queue full for a1 \(200\)/, 'main reason is nowhere in the rendered markup');
  assert.match(text, /main declined/i, 'the reason is rendered as the app own diagnosis rather than attributed to main');
  assert.ok(markup.includes('do not lose me'), 'the operator text is not in the rendered textarea');
});

test('the refusal renders on an EMPTY queue — a refused FIRST message is exactly that case', (t) => {
  seedServerSnapshot(t, {
    drafts: { a1: 'do not lose me' },
    messageQueues: {},
    queueError: { a1: 'no harness home — nowhere durable to park this' }
  });

  const markup = html(React.createElement(MessageQueueComposer, { agent: agentRow() }));
  const text = visibleText(markup);

  assert.match(text, /no harness home/,
    'statusHint still short-circuits on queue.length === 0, so a refused first message renders nothing at all');
  assert.ok(markup.includes('do not lose me'), 'the operator text is not in the rendered textarea');
});

test('NEGATIVE CONTROL: with no refusal seeded the existing statusHint is not displaced', (t) => {
  seedServerSnapshot(t, {
    drafts: { a1: 'still typing' },
    messageQueues: { a1: queued('hi') },
    queueError: {}
  });

  const text = visibleText(html(React.createElement(MessageQueueComposer, { agent: agentRow() })));

  assert.match(text, /sending to Ada one-by-one/, 'the refusal line displaced the normal status hint');
  assert.doesNotMatch(text, /main declined/i);
});

// ════ TASK 2 — a synthesized turn-end is not a turn-end for a blocked agent ════

test('a SYNTHESIZED turn-end does nothing to an agent the floor already calls blocked', () => {
  const out = decide({ status: 'blocked' }, { blocked: false, synthesized: true }, false);

  assert.equal(out.patch, null,
    'main silence backstop flipped a permission-prompted agent to idle — the needs-you escalation is gone');
  assert.equal(out.clearBreaker, false);
});

test('NEGATIVE CONTROL: a REAL turn-end still idles a blocked agent AND still clears the breaker', () => {
  const out = decide({ status: 'blocked' }, { blocked: false });

  assert.deepEqual(out.patch, { status: 'idle', action: 'idle', carrying: undefined },
    'a falsely-blocked agent (usePtyParser BLOCK_HINTS matches a bare "(y/n)") can no longer recover its status');
  assert.equal(out.clearBreaker, true,
    'the only clearer of breakerLevel was skipped — a constrained agent would be stranded (R-22)');
});

test('NEGATIVE CONTROL: a synthesized turn-end still idles a WORKING agent — the backstop survives', () => {
  const out = decide({ status: 'working' }, { blocked: false, synthesized: true }, false);

  assert.deepEqual(out.patch, { status: 'idle', action: 'idle', carrying: undefined });
  assert.equal(out.clearBreaker, true);
});

test('a synthesized turn-end on an already-idle agent is idempotent', () => {
  const out = decide({ status: 'idle' }, { blocked: false, synthesized: true }, false);

  assert.deepEqual(out.patch, { status: 'idle', action: 'idle', carrying: undefined });
  assert.equal(out.clearBreaker, true);
});

test('NEGATIVE CONTROL: breaker precedence on a blocked Stop is unchanged', () => {
  const open = decide({ status: 'blocked' }, { blocked: true }, false);
  assert.deepEqual(open.patch, { status: 'working', action: 'reading inbox', carrying: undefined });
  assert.equal(open.clearBreaker, false);

  const armed = decide({ status: 'blocked' }, { blocked: true }, true);
  assert.equal(armed.patch, null, 'a constrained/stopped agent was re-painted working by a blocked Stop');
  assert.equal(armed.clearBreaker, false);
});

test('STRUCTURAL: no comment in useHive.ts presents a renderer-side drain as the live path', () => {
  // The ONE structural assertion in this file. It reads source text, so it cannot see
  // whether the code is right — only whether a comment still routes the next maintainer
  // into a deleted path. It is written against the CLAIM rather than the label
  // "effect #4" so that rewording it cannot defeat the check: measured at HEAD it
  // matched two lines, and it also matches the cheapest evasions ("the renderer then
  // drains it to his PTY", "the composer effect types it into the REPL").
  const CLAIM = /(renderer|effect #?\d|composer effect)[^.\n]{0,80}(drains?|types?)[^.\n]{0,60}(PTY|REPL|terminal)/i;
  const src = fs.readFileSync(path.join(ROOT, 'src/renderer/src/hooks/useHive.ts'), 'utf8');

  // Offenders first, so a failure names the LINES rather than dumping 56 KB of source.
  const offenders = src.split('\n')
    .map((line, i) => ({ n: i + 1, line: line.trim() }))
    .filter(({ line }) => CLAIM.test(line));
  assert.deepEqual(offenders, [],
    'a comment still names a renderer-side drain as the live delivery path — it is main drainQueue');

  // The plan's literal gate, kept as written.
  assert.doesNotMatch(src, CLAIM);
});

// ════ TASK 3 — roster.json publishes the pre-FLOOR-02 queue ONCE (b/CR-03) ════
//
// Ordering is load-bearing: the failed-write case must run BEFORE the successful
// one, because the one-shot is module state and a success consumes it.

test('NEGATIVE CONTROL: a write that FAILS or is SKIPPED does not consume the one-shot', async () => {
  const payloads = [];
  cth.rosterWrite = async (snap) => { payloads.push(snap); return { ok: false, error: 'EPERM' }; };
  flushRoster();
  await new Promise((r) => setImmediate(r));

  cth.rosterWrite = async (snap) => { payloads.push(snap); return { ok: true, skipped: 'empty-first-write' }; };
  flushRoster();
  await new Promise((r) => setImmediate(r));

  cth.rosterWrite = async (snap) => { payloads.push(snap); return { ok: false, error: 'EPERM' }; };
  flushRoster();
  await new Promise((r) => setImmediate(r));

  assert.equal(payloads.length, 3);
  for (const [i, p] of payloads.entries()) {
    assert.deepEqual(p.queues, PRE_MIGRATION,
      `write ${i + 1} lost the pre-migration slice after a write that never landed — that was the only copy`);
  }
});

test('the pre-FLOOR-02 queue reaches roster.json on the first SUCCESSFUL write, and never again', async () => {
  const payloads = [];
  cth.rosterWrite = async (snap) => { payloads.push(snap); return { ok: true }; };

  flushRoster();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(payloads[0].queues, PRE_MIGRATION,
    'the migration bridge is broken: main cannot read localStorage, so this write is the only way adoptRendererQueues ever sees these messages');

  flushRoster();
  await new Promise((r) => setImmediate(r));
  flushRoster();
  await new Promise((r) => setImmediate(r));

  assert.equal(payloads.length, 3);
  assert.deepEqual(payloads[1].queues, {},
    'roster.json still republishes the frozen slice — a Change Home re-enqueues it into live terminals');
  assert.deepEqual(payloads[2].queues, {});

  // The localStorage key goes with it: a later boot must not re-seed the mirror.
  assert.equal(globalThis.window.localStorage.getItem(LS_QUEUES), null,
    'the persisted copy survived, so the next boot re-arms the one-shot with already-delivered messages');
});

test('NEGATIVE CONTROL: the roster mirror four other slices are byte-identical across the one-shot', async () => {
  const payloads = [];
  cth.rosterWrite = async (snap) => { payloads.push(snap); return { ok: true }; };
  flushRoster();
  await new Promise((r) => setImmediate(r));
  flushRoster();
  await new Promise((r) => setImmediate(r));

  const [a, b] = payloads;
  for (const key of ['agents', 'archived', 'restorable', 'selectedId']) {
    assert.deepEqual(b[key], a[key], `the one-shot disturbed the roster mirror ${key} slice`);
  }
  assert.equal(b.version, 1);
});

test('with NO pre-migration queue every write carries an empty slice from the very first flush', async () => {
  // A genuinely fresh boot: drop load-ts's module cache so store.ts re-evaluates
  // against an empty localStorage. Same interceptor, same window.
  lsData.clear();
  delete require.cache[require.resolve('./load-ts.cjs')];
  const freshLoad = require('./load-ts.cjs');

  const before = winListeners.length;
  underInterceptor(freshLoad, () => freshLoad('src/renderer/src/store/store.ts'));
  const flushFresh = winListeners.slice(before).find((l) => l.ev === 'beforeunload')?.fn;
  assert.equal(typeof flushFresh, 'function', 'the fresh store boot registered no beforeunload flush');

  const payloads = [];
  cth.rosterWrite = async (snap) => { payloads.push(snap); return { ok: true }; };
  flushFresh();
  await new Promise((r) => setImmediate(r));
  flushFresh();
  await new Promise((r) => setImmediate(r));

  assert.equal(payloads.length, 2);
  assert.deepEqual(payloads[0].queues, {});
  assert.deepEqual(payloads[1].queues, {});
});
