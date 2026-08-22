'use strict';

/**
 * FLOOR-09 / GATE-01: a proxy-tier agent's sidecar restart must not dead-hook its
 * own replacement.
 *
 * `startProxyBridge` is stop-then-start under the SAME agent id. The restart runs
 * synchronously in one tick — stopProxyBridge (which correctly revokes generation
 * 1) -> mintProxyToken (which sets generation 2) -> spawn -> proxyChildren.set —
 * while the dying sidecar's `exit` event is ASYNCHRONOUS and therefore always lands
 * afterwards. So an exit handler that revokes BY AGENT reaches into the map and
 * kills the token generation 2 is already using. Not a race: it happens every time.
 *
 * The symptom is silent and expensive. The new sidecar posts a revoked
 * `sock_token`, `authorized()` in src/main/hooks.ts drops it, and that agent then
 * has no live status, no Stop-drain and NO COST ROWS AT ALL — so `budgetForAgent`
 * and every breaker arm are blind to it.
 *
 * WHY node:test AND NOT A HAND-ROLLED DRIVER. test/repo-claims.test.cjs collects
 * every test/*.test.cjs that does NOT require('node:test') and re-runs it with
 * every assertion poisoned, asserting a non-zero exit. A hand-rolled driver — which
 * this file invites, since it must control exactly when generation 1's exit fires —
 * would enter that loop and add a child-process spawn per suite run.
 *
 * WHAT IS FAKED AND WHAT IS NOT. The hive is real (a real temp home, ensureHive,
 * the real proxyTokens/proxyChildren maps and the real startProxyBridge). Only the
 * CHILD PROCESS is faked, and deliberately its `kill()` does NOT emit `exit` — the
 * test emits it, because WHEN it lands is the whole subject.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');

// A fake sidecar. `spawn` is looked up on the module object at CALL time, so this
// swap is picked up by the compiled hive.ts without touching the loader.
const spawned = [];
const realSpawn = childProcess.spawn;
childProcess.spawn = function fakeSpawn() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stdout.setEncoding = () => {};
  child.killed = false;
  // Records the kill; does NOT emit `exit`. The real one is asynchronous and this
  // suite exists to drive that asynchrony by hand.
  child.kill = () => { child.killed = true; return true; };
  setImmediate(() => child.stdout.emit('data', `${JSON.stringify({ port: 4300 + spawned.length })}\n`));
  spawned.push(child);
  return child;
};
test.after(() => { childProcess.spawn = realSpawn; });

const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');

const CFG = { sock: '/tmp/md-hive-test.sock', sessionId: 's-1', api: 'anthropic', upstream: 'https://example.invalid' };
const tick = () => new Promise((r) => { setImmediate(r); });

/** A real hive in a throwaway home, plus a recording token registry. */
function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hive-proxytok-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  spawned.length = 0;
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  const minted = [];
  const revoked = [];
  let n = 0;
  hive.setHookTokenSource(
    (agentId) => { const tok = `tok-${agentId}-gen${++n}`; minted.push(tok); return tok; },
    (tok) => { revoked.push(tok); }
  );
  return { hive, minted, revoked };
}

test('a restarted sidecar keeps the REPLACEMENT token live when generation 1 finally exits', async (t) => {
  const { hive, revoked } = floor(t);

  await hive.startProxyBridge('q-1', CFG);
  const gen1Child = spawned[0];
  const gen1Token = hive.proxyTokens.get('q-1');
  assert.ok(gen1Token, 'generation 1 minted no token at all');

  // The restart. Generation 2 mints and takes over the map, synchronously.
  await hive.startProxyBridge('q-1', CFG);
  const gen2Child = spawned[1];
  const gen2Token = hive.proxyTokens.get('q-1');
  assert.ok(gen2Token, 'generation 2 minted no token at all');
  assert.notEqual(gen2Token, gen1Token, 'the restart reused generation 1\'s token');
  assert.equal(gen1Child.killed, true, 'the restart never killed generation 1');
  assert.ok(revoked.includes(gen1Token),
    'the restart path did not revoke generation 1 — stopProxyBridge revokes BY AGENT and that '
    + 'is CORRECT there, because it runs before any re-mint');

  // THE ORDERING IS ASSERTED, NOT LEFT TO TIMING. Generation 1's exit is fired only
  // now, after generation 2 has minted and taken the map — the real production order.
  assert.equal(hive.proxyChildren.get('q-1'), gen2Child,
    'generation 2 does not own proxyChildren before the exit — the premise of this test is wrong');
  gen1Child.emit('exit', 0, null);
  await tick();

  assert.equal(hive.proxyTokens.get('q-1'), gen2Token,
    "generation 1's exit revoked the REPLACEMENT's token. Every qwen/crush restart then posts a "
    + 'revoked sock_token, authorized() in src/main/hooks.ts drops it, and that agent has no live '
    + 'status, no Stop-drain and NO cost rows — so budgetForAgent and every breaker arm go blind');
  assert.equal(revoked.filter((tok) => tok === gen2Token).length, 0,
    "the replacement's token was handed to revoke() by the dying sidecar's exit handler");
  assert.equal(hive.proxyChildren.get('q-1'), gen2Child,
    'proxyChildren no longer holds exactly the live child');
});

test('NEGATIVE CONTROL: a sidecar that exits with NO replacement leaves no live token', async (t) => {
  const { hive, revoked } = floor(t);

  await hive.startProxyBridge('q-2', CFG);
  const child = spawned[0];
  const token = hive.proxyTokens.get('q-2');
  assert.ok(token);

  child.emit('exit', 0, null);
  await tick();

  // A guard written as "never revoke from the exit handler" passes the test above
  // and fails this one. That is why this control exists.
  assert.equal(hive.proxyTokens.get('q-2'), undefined,
    'a dead sidecar left its token live in proxyTokens — the credential outlives the process '
    + 'that held it, which is the failure the guard must not introduce while fixing the other one');
  assert.ok(revoked.includes(token), 'the dead sidecar\'s own token was never handed to revoke()');
  assert.equal(hive.proxyChildren.get('q-2'), undefined, 'the dead child stayed in proxyChildren');
});

test('NEGATIVE CONTROL: an explicit stopProxyBridge with no restart still revokes', async (t) => {
  const { hive, revoked } = floor(t);

  await hive.startProxyBridge('q-3', CFG);
  const token = hive.proxyTokens.get('q-3');
  assert.ok(token);

  hive.stopProxyBridge('q-3');

  // stopProxyBridge revokes BY AGENT and that is correct there: it runs before any
  // re-mint, so the map still holds the token belonging to the child it is killing.
  assert.equal(hive.proxyTokens.get('q-3'), undefined);
  assert.ok(revoked.includes(token));
  assert.equal(hive.proxyChildren.get('q-3'), undefined);
});

test('two live agents are independent — one restarting never touches the other', async (t) => {
  const { hive } = floor(t);

  await hive.startProxyBridge('q-4', CFG);
  const otherToken = hive.proxyTokens.get('q-4');
  await hive.startProxyBridge('q-5', CFG);
  const gen1Child = spawned[1];
  await hive.startProxyBridge('q-5', CFG); // generation 2 for q-5 only
  const gen2Token = hive.proxyTokens.get('q-5');

  gen1Child.emit('exit', 0, null);
  await tick();

  assert.equal(hive.proxyTokens.get('q-4'), otherToken, 'an unrelated agent lost its token');
  assert.equal(hive.proxyTokens.get('q-5'), gen2Token);
  assert.equal(hive.proxyChildren.size, 2, 'proxyChildren does not hold exactly the live children');
});
