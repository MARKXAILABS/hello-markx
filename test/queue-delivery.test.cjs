'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { deliverWithAcknowledgement } =
  loadTs('src/shared/queueDelivery.ts');

test('queue item is acknowledged only after delivery succeeds', async () => {
  let finish;
  let acknowledged = false;
  const sending = new Promise((resolve) => { finish = resolve; });
  const attempt = deliverWithAcknowledgement(
    () => sending,
    () => { acknowledged = true; }
  );

  assert.equal(acknowledged, false);
  finish();
  assert.equal(await attempt, true);
  assert.equal(acknowledged, true);
});

test('failed delivery remains unacknowledged for retry', async () => {
  let acknowledged = false;
  const sent = await deliverWithAcknowledgement(
    () => Promise.reject(new Error('PTY unavailable')),
    () => { acknowledged = true; }
  );
  assert.equal(sent, false);
  assert.equal(acknowledged, false);
});
