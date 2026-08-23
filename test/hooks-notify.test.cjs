/**
 * FLOOR-14 (#42) — a blocked agent must reach the human.
 *
 * Three of FLOOR-14's four clauses shipped long ago: click-to-focus, the
 * long-task toast, and the blocked-CLAUDE toast that rides Claude Code's own
 * hook `Notification` stream. The fourth was missing entirely and silently: an
 * engine with no hook stream is marked `blocked` by the RENDERER, from an
 * approval prompt in its terminal tail, and that determination never crossed
 * into main. A Codex or Kimi worker stuck on "Do you want to proceed?" produced
 * no OS toast at all, on any platform, forever.
 *
 * These tests drive the REAL `HookServer` — not a stand-in for it — with a
 * recording `Notification` seeded into `require.cache` before `hooks.ts` is
 * transpiled, which is the same trick `net-binding.test.cjs` uses to run this
 * class outside Electron. That keeps `notify()` private (the class's public
 * surface grows by exactly one method) while still making the whole toast
 * observable: title, body, click handler and all.
 *
 * PLATFORM HONESTY. This proves the toast is CONSTRUCTED and SHOWN with the
 * right contents, on every CI platform. It does NOT prove the OS renders it.
 * Under Electron 42+ macOS routes toasts through `UNNotification`, which
 * requires a code-signed app, and this project's macOS signing is best-effort
 * (`build/notarize.cjs` no-ops without `APPLE_*`) — so on an unsigned local
 * macOS build these same calls may display nothing. No test here can tell the
 * difference, and none pretends to.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const loadTs = require('./load-ts.cjs');

// Every toast the server builds, in order. Seeded BEFORE hooks.ts is loaded:
// it imports `Notification` from electron at module scope, and outside Electron
// that resolve yields a path string with no usable exports.
const toasts = [];
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: {
    Notification: class {
      // The production gate. `false` here would make every assertion below
      // vacuously pass by never constructing anything.
      static isSupported() { return true; }
      constructor(opts) {
        this.title = opts && opts.title;
        this.body = opts && opts.body;
        this.handlers = {};
        this.shown = false;
        toasts.push(this);
      }
      on(event, cb) { this.handlers[event] = cb; return this; }
      show() { this.shown = true; }
    }
  }
};

const { HookServer } = loadTs('src/main/hooks.ts');

/** A throwaway hive ROOT with its own mkdtemp. Never derived from the socket
 *  path: on win32 `sockPath()` is a `\\.\pipe\` NAME and creates no directory. */
function hiveRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hooks-notify-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return fs.realpathSync(dir);
}

function sockFor(root) {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\md-hooks-notify-${randomBytes(6).toString('hex')}`
    : path.join(root, 'hooks.sock');
}

/**
 * A live HookServer over a real socket, with a roster you choose.
 *
 * `notifications` defaults to TRUE here, unlike `net-binding.test.cjs`'s
 * `hookFloor` which passes `false` — that flag is the first thing `notify()`
 * returns on, so a copy-paste of the other harness would make every toast
 * assertion in this file vacuous.
 */
async function floor(t, { agents = {}, notifications = true } = {}) {
  toasts.length = 0;
  // Spelled out rather than shorthanded, because `{ notifications: true }` is
  // the exact shape `notify()` reads and the exact thing `hookFloor` gets wrong
  // for this file's purposes — worth being able to grep for.
  const config = notifications ? { notifications: true } : { notifications: false };
  const root = hiveRoot(t);
  const sock = sockFor(root);
  const sent = [];
  const focused = [];
  const hive = {
    root: () => root,
    sockPath: () => sock,
    recordSession: () => {},
    isGod: (id) => !!(agents[id] && agents[id].isGod === true),
    rosterContext: () => null,
    registry: () => ({ agents })
  };
  const server = new HookServer(
    hive,
    () => ({ send: (channel, payload) => sent.push({ channel, payload }) }),
    () => config,
    undefined,                       // control
    undefined,                       // breaker
    undefined,                       // drainAtStop
    (agentId) => focused.push(agentId)
  );
  server.start();
  t.after(() => server.stop());
  await new Promise((resolve, reject) => {
    server.server.once('listening', resolve);
    server.server.once('error', reject);
  });
  const send = (payload) => new Promise((resolve, reject) => {
    const c = net.createConnection(sock, () => c.end(JSON.stringify(payload) + '\n'));
    let resp = '';
    c.setEncoding('utf8');
    c.on('data', (d) => { resp += d; });
    c.on('end', () => resolve(resp));
    c.on('error', reject);
  });
  return { server, send, sent, focused };
}

const WORKER = { 'kevin-1': { id: 'kevin-1', name: 'Kevin', provider: 'codex' } };
const GOD = { god: { id: 'god', name: 'Michael', provider: 'codex', isGod: true } };

// ── 1. the gap FLOOR-14 left open ────────────────────────────────────────────

test('a blocked non-Claude worker produces exactly one toast, in the locked copy', async (t) => {
  const { server } = await floor(t, { agents: WORKER });

  server.notifyBlocked('kevin-1');

  assert.equal(toasts.length, 1,
    'a Codex worker stuck on an approval prompt produced no OS toast at all — the '
    + 'whole FLOOR-14 residual. Its blocked state is a renderer determination, so '
    + 'nothing in main ever knew');
  assert.equal(toasts[0].title, 'Kevin',
    'UI-SPEC locks the title to the agent BARE NAME, matching the long-task and '
    + 'blocked-Claude toasts already on this floor');
  assert.equal(toasts[0].body, 'is waiting on Michael',
    'a worker is parked on the god, not on the human — that difference is the whole '
    + 'point of #12, and the body is where the human reads it');
  assert.ok(toasts[0].shown, 'a Notification that is constructed and never shown is not a toast');
  assert.ok(!toasts[0].body.includes('!'), 'DESIGN.md:653 reserves exclamation marks for completions');
});

test('the god blocked on a HUMAN says so in the second person', async (t) => {
  const { server } = await floor(t, { agents: GOD });

  server.notifyBlocked('god');

  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].title, 'Michael');
  assert.equal(toasts[0].body, 'is waiting on you',
    'only the god escalates to the human. Sending "is waiting on Michael" for Michael '
    + 'would tell the operator to go ask the agent that is asking them');
});

// ── 2. and the failure mode fixing it could have created ─────────────────────

test('a blocked CLAUDE agent gets ONE toast for one event, not two', async (t) => {
  const agents = { 'jim-1': { id: 'jim-1', name: 'Jim', provider: 'claude' } };
  const { server, send } = await floor(t, { agents });

  // The path that already shipped: Claude Code's own hook Notification stream.
  await send({
    hook_event_name: 'Notification',
    agent_id: 'jim-1',
    message: 'Claude needs your permission to use Bash',
    sock_token: server.mintToken('jim-1')
  });
  assert.equal(toasts.length, 1, 'the shipped blocked-Claude toast regressed');
  assert.equal(toasts[0].body, 'Claude needs your permission to use Bash');

  // …and now the renderer, which marks Claude agents blocked too (usePtyParser's
  // BLOCK_HINTS match Claude's own approval menu), reports the same transition.
  server.notifyBlocked('jim-1');

  assert.equal(toasts.length, 1,
    'two toasts for one blocked Claude agent. The renderer sees the SAME event the '
    + 'hook stream already reported, so an ungated new path double-fires — which is '
    + 'how a floor teaches its operator to mute notifications');
});

// ── 3. the gates it must not route around ────────────────────────────────────

test('notifications turned off means no toast, on this path like every other', async (t) => {
  const { server } = await floor(t, { agents: WORKER, notifications: false });

  server.notifyBlocked('kevin-1');

  assert.equal(toasts.length, 0,
    "the new path reached the OS around the operator's own setting. FLOOR-14 adds no "
    + 'second setting precisely so there is one switch that means it');
});

test('an agent id that names nobody on this floor raises nothing', async (t) => {
  const { server, focused } = await floor(t, { agents: WORKER });

  server.notifyBlocked('not-on-this-floor');
  server.notifyBlocked('');

  assert.equal(toasts.length, 0,
    'the agent id crosses IPC from the renderer, so main must resolve it against the '
    + 'live roster before showing anything or arming a click target (T-P13-06)');
  assert.equal(focused.length, 0);
});

// ── 4. the clause that was already true, kept true ───────────────────────────

test('clicking the toast focuses THAT agent', async (t) => {
  const agents = { ...WORKER, 'pam-1': { id: 'pam-1', name: 'Pam', provider: 'kimi' } };
  const { server, focused } = await floor(t, { agents });

  server.notifyBlocked('pam-1');

  assert.equal(toasts.length, 1);
  assert.equal(typeof toasts[0].handlers.click, 'function',
    'a toast that only says a name is a puzzle — the human still has to find the agent');
  toasts[0].handlers.click();
  assert.deepEqual(focused, ['pam-1'],
    'the click focused the wrong agent, or none. The target is the id main RESOLVED, '
    + 'never the one the payload asked for');
});
