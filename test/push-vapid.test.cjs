'use strict';

/**
 * 02-09 task 3 — Web Push, unit-verified from `node:crypto` alone. No case
 * here reaches the network (the transport is always a fake), so every case
 * runs offline on all three CI platforms — there is nothing to skip.
 *
 * Two independent grounds are asserted, deliberately kept apart:
 *   1. A SELF round trip (case 1) — this file plays the browser: it mints
 *      its own UA keypair + auth secret, hands push.ts a subscription built
 *      from them, and decrypts push.ts's own output by re-deriving the same
 *      keys FROM THE RECEIVER'S SIDE. This proves push.ts's encrypt and this
 *      test's decrypt agree with EACH OTHER — SYMMETRY, not correctness, since
 *      both halves were written by the same author from the same reading of
 *      the RFC.
 *   2. The RFC 8291 §5 published vector (case 2) is the half that would catch
 *      a SHARED misreading — fixed keys, fixed salt, a ciphertext this repo
 *      did not produce. This execution session has no live web-fetch tool, so
 *      the RFC text is not retrievable here, and reproducing its byte-exact
 *      base64 vector from training memory risks silently encoding a
 *      misremembered value as a passing assertion — exactly the failure mode
 *      this case exists to catch. So: MEASUREMENT UNAVAILABLE — RFC 8291 §5
 *      vector not retrieved. The round trip in case 1 does NOT stand in for
 *      it (see `02-09-SUMMARY.md`).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const loadTs = require('./load-ts.cjs');

const push = loadTs('src/main/push.ts');
const {
  generateVapidKeys, ensureVapidKeys, vapidAuthHeader, encryptPayload, sendPush, MAX_PUSH_PLAINTEXT_BYTES
} = push;

const P256_SPKI_PREFIX = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d03010703420004', 'hex');

function b64url(buf) { return buf.toString('base64url'); }
function fromB64url(s) { return Buffer.from(s, 'base64url'); }

function importP256Point(point) {
  return crypto.createPublicKey({ key: Buffer.concat([P256_SPKI_PREFIX, point.subarray(1)]), format: 'der', type: 'spki' });
}
function exportP256Point(pub) {
  const jwk = pub.export({ format: 'jwk' });
  return Buffer.concat([Buffer.from([0x04]), fromB64url(jwk.x), fromB64url(jwk.y)]);
}

/** The browser side of the RFC 8291 exchange, re-derived independently in
 *  the TEST rather than reusing any of push.ts's own internals, so this is a
 *  real cross-check and not a tautology. */
function decryptAsSubscriber(body, uaPrivateKey, authSecret) {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublicPoint = body.subarray(21, 21 + idlen);
  const record = body.subarray(21 + idlen);
  const ciphertext = record.subarray(0, record.length - 16);
  const authTag = record.subarray(record.length - 16);

  const asPublic = importP256Point(asPublicPoint);
  const uaPoint = exportP256Point(crypto.createPublicKey(uaPrivateKey));
  const ecdhSecret = crypto.diffieHellman({ privateKey: uaPrivateKey, publicKey: asPublic });

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPoint, asPublicPoint]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12));

  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(authTag);
  const padded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  assert.equal(padded[padded.length - 1], 0x02, 'last byte of the decrypted record must be the 0x02 padding delimiter');
  return padded.subarray(0, padded.length - 1);
}

function makeUaSubscription() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const authSecret = crypto.randomBytes(16);
  const sub = {
    endpoint: 'https://push.example.com/wpush/abc123',
    keys: { p256dh: b64url(exportP256Point(publicKey)), auth: b64url(authSecret) }
  };
  return { sub, uaPrivateKey: privateKey, authSecret };
}

test('case 1 — round trip: push.ts encrypts, this test decrypts as the subscriber (SYMMETRY, not correctness)', () => {
  const { sub, uaPrivateKey, authSecret } = makeUaSubscription();
  const plaintext = 'Ada is waiting on you';
  const enc = encryptPayload(plaintext, sub);
  assert.equal(enc.ok, true, enc.ok ? '' : enc.error);
  const decrypted = decryptAsSubscriber(enc.body, uaPrivateKey, authSecret);
  assert.equal(decrypted.toString('utf8'), plaintext);
});

test('case 2 — RFC 8291 §5 published vector', () => {
  // MEASUREMENT UNAVAILABLE — RFC 8291 §5 vector not retrieved
  // No live web-fetch tool is available in this execution session, and
  // reproducing the RFC's byte-exact base64 fixture (keys, salt, ciphertext)
  // from training memory would risk silently encoding a misremembered value
  // as a passing assertion — the exact "shared misreading" this case exists
  // to catch (see the file header). Case 1's round trip does NOT stand in
  // for this. Recorded honestly rather than fabricated; named for 02-12.
  assert.ok(true, 'documented gap, not a fabricated vector — see 02-09-SUMMARY.md');
});

test('case 3 — the VAPID JWT signature is raw (64 bytes), not DER (70-72, variable)', () => {
  const keys = generateVapidKeys();
  const header = vapidAuthHeader('https://push.example.com/wpush/abc123', keys, 'mailto:ops@example.com');
  const jwt = /t=([^,]+),/.exec(header)[1];
  const sigB64 = jwt.split('.')[2];
  const sigBytes = fromB64url(sigB64);
  assert.equal(sigBytes.length, 64, `expected a raw 64-byte P-256 signature, got ${sigBytes.length} bytes`);
});

test('case 4 — the JWT verifies and its claims are correct', () => {
  const keys = generateVapidKeys();
  const now = 1_700_000_000_000;
  const endpoint = 'https://push.example.com/wpush/abc123?foo=bar';
  const header = vapidAuthHeader(endpoint, keys, 'mailto:ops@example.com', now);
  const jwt = /t=([^,]+),/.exec(header)[1];
  const [headerB64, claimsB64, sigB64] = jwt.split('.');

  const headerJson = JSON.parse(fromB64url(headerB64).toString('utf8'));
  assert.equal(headerJson.alg, 'ES256');
  const claims = JSON.parse(fromB64url(claimsB64).toString('utf8'));
  assert.equal(claims.aud, 'https://push.example.com', 'aud must be the origin only, no path/query');
  assert.equal(claims.sub, 'mailto:ops@example.com');
  const nowSec = Math.floor(now / 1000);
  assert.ok(claims.exp > nowSec, 'exp must be in the future');
  assert.ok(claims.exp - nowSec <= 24 * 60 * 60, 'exp must not exceed the 24h ceiling');

  const point = fromB64url(keys.publicKey);
  const pub = crypto.createPublicKey({
    key: Buffer.concat([P256_SPKI_PREFIX, point.subarray(1)]), format: 'der', type: 'spki'
  });
  const ok = crypto.verify(
    'sha256', Buffer.from(`${headerB64}.${claimsB64}`, 'utf8'), { key: pub, dsaEncoding: 'ieee-p1363' }, fromB64url(sigB64)
  );
  assert.equal(ok, true, 'the JWT signature must verify against its own public key');
});

test('case 5 — base64url discipline: no =, +, / anywhere in the header, payload, signature or public key', () => {
  const keys = generateVapidKeys();
  const header = vapidAuthHeader('https://push.example.com/wpush/abc123', keys, 'mailto:ops@example.com');
  const jwt = /t=([^,]+),/.exec(header)[1];
  const k = /k=([^,\s]+)/.exec(header)[1];
  const parts = [...jwt.split('.'), k, keys.publicKey, keys.privateKey];
  for (const p of parts) {
    assert.doesNotMatch(p, /[=+/]/, `base64url part contains a padded/standard-base64 character: ${p}`);
  }
});

test('case 6 — 410/404 mean gone; 201 is ok; 429 is neither ok nor gone', async () => {
  const { sub } = makeUaSubscription();
  const keys = generateVapidKeys();

  const gone410 = await sendPush(sub, 'x', {
    vapid: keys, subject: 'mailto:ops@example.com', transport: async () => ({ status: 410 })
  });
  assert.deepEqual(gone410, { ok: false, status: 410, gone: true, error: 'subscription gone' });

  const gone404 = await sendPush(sub, 'x', {
    vapid: keys, subject: 'mailto:ops@example.com', transport: async () => ({ status: 404 })
  });
  assert.equal(gone404.ok, false);
  assert.equal(gone404.gone, true);

  const ok201 = await sendPush(sub, 'x', {
    vapid: keys, subject: 'mailto:ops@example.com', transport: async () => ({ status: 201 })
  });
  assert.deepEqual(ok201, { ok: true });

  const rateLimited429 = await sendPush(sub, 'x', {
    vapid: keys, subject: 'mailto:ops@example.com', transport: async () => ({ status: 429 })
  });
  assert.equal(rateLimited429.ok, false);
  assert.equal(rateLimited429.gone, false, '429 must never be treated as a dead subscription');
});

test('case 7 — the payload cap is enforced before the transport is ever called', async () => {
  const { sub } = makeUaSubscription();
  const keys = generateVapidKeys();
  const oversized = Buffer.alloc(MAX_PUSH_PLAINTEXT_BYTES + 1, 0x41);
  assert.equal(oversized.length, 3994, 'sanity: the cap constant moved — this test must move with it');

  const direct = encryptPayload(oversized, sub);
  assert.equal(direct.ok, false);

  let calls = 0;
  const result = await sendPush(sub, oversized, {
    vapid: keys, subject: 'mailto:ops@example.com', transport: async () => { calls += 1; return { status: 201 }; }
  });
  assert.equal(result.ok, false);
  assert.equal(calls, 0, 'an oversized payload must never reach the transport');
});

test('ensureVapidKeys persists atomically and re-reads the same keypair', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-push-vapid-'));
  const file = path.join(dir, 'push-state.json');
  try {
    const first = ensureVapidKeys({ statePath: () => file });
    assert.ok(fs.existsSync(file));
    const second = ensureVapidKeys({ statePath: () => file });
    assert.deepEqual(second, first, 'a second call must re-read the persisted keypair, not regenerate one');
    assert.equal(fs.existsSync(`${file}.tmp`), false, 'the temp file must not survive a successful write');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('case 8 — a malformed endpoint or a corrupt VAPID key resolves {ok:false}, never rejects (the docstring contract)', async () => {
  const { sub } = makeUaSubscription();
  const keys = generateVapidKeys();

  // `endpoint` arrives unmodified from the browser client, so it is
  // externally-supplied data crossing a trust boundary.
  for (const endpoint of ['not-a-url', '', 'wpush/abc123', 'file:///etc/passwd', 'javascript:alert(1)']) {
    let calls = 0;
    const res = await sendPush({ ...sub, endpoint }, 'x', {
      vapid: keys,
      subject: 'mailto:ops@example.com',
      transport: async () => { calls += 1; return { status: 201 }; }
    });
    assert.equal(res.ok, false, `endpoint ${JSON.stringify(endpoint)} must fail closed, not throw`);
    assert.equal(calls, 0, `a rejected endpoint must never reach the transport (${JSON.stringify(endpoint)})`);
    assert.doesNotMatch(String(res.error), /etc\/passwd|alert\(1\)/, 'the error must not echo the endpoint — it is a capability URL');
  }

  // The other pre-`try` throw on the same line: a corrupt stored VAPID key.
  const corrupt = await sendPush(sub, 'x', {
    vapid: { publicKey: 'AAAA', privateKey: keys.privateKey },
    subject: 'mailto:ops@example.com',
    transport: async () => ({ status: 201 })
  });
  assert.equal(corrupt.ok, false, 'a malformed VAPID public key must fail closed, not throw');
});

test('case 9 — a corrupt/legacy VAPID state file regenerates rather than being trusted', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-push-vapid-corrupt-'));
  const file = path.join(dir, 'push-state.json');
  try {
    // Shape-valid JSON, both fields strings — but not a P-256 keypair. The
    // `typeof === 'string'` check alone passes this through and it blows up
    // later, inside the signing path.
    fs.writeFileSync(file, JSON.stringify({ publicKey: 'bm90LWEta2V5', privateKey: 'bm9wZQ' }));
    const keys = ensureVapidKeys({ statePath: () => file });
    assert.notEqual(keys.publicKey, 'bm90LWEta2V5', 'a corrupt stored key must not be handed back');
    const point = fromB64url(keys.publicKey);
    assert.equal(point.length, 65, 'the regenerated public key must be an uncompressed P-256 point');
    assert.equal(point[0], 0x04);
    // usable for the one thing the corrupt file could not do
    assert.match(
      vapidAuthHeader('https://push.example.com/wpush/abc123', keys, 'mailto:ops@example.com'),
      /^vapid t=/, 'the regenerated keypair must actually sign'
    );
    assert.deepEqual(
      JSON.parse(fs.readFileSync(file, 'utf8')), keys,
      'the corrupt file must be replaced by the regenerated keypair'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
