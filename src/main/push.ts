/**
 * push.ts — Web Push, from `node:crypto` alone: VAPID (RFC 8292) request
 * signing and `aes128gcm` payload encryption (RFC 8291/8188). No dependency —
 * D-22 already established node-core is sufficient, and RESEARCH §"Package
 * Legitimacy Audit" names adding `web-push` for this as a ladder failure.
 *
 * Deliberately free of any `electron` import so `node --test` can drive every
 * case with fakes (test/push-vapid.test.cjs) and no real network reach. The
 * outbound HTTP call is an INJECTED `transport` (D-15's rule, applied here) —
 * no module in this file ever calls `fetch`/`https.request` itself.
 *
 * There is no in-repo analog for this crypto (02-PATTERNS.md:1318 — no ECDH,
 * no HKDF, no AES-GCM anywhere else in `src/`). Every construction below is
 * written against the RFC text, not copied from a neighbour, which is why
 * `test/push-vapid.test.cjs` carries a published RFC 8291 §5 vector and not
 * only a self-round-trip.
 */
import {
  createCipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync,
  hkdfSync, randomBytes, sign as cryptoSign, verify as cryptoVerify,
  type KeyObject
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The browser's own `PushSubscription.toJSON()` shape — the client sends it
 *  unmodified, so this interface is the wire contract, not a repo convention. */
export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Application-server VAPID keys, both base64url. `publicKey` is the
 *  uncompressed P-256 point (65 bytes, `0x04` prefix) the client passes as
 *  `applicationServerKey`; `privateKey` is the raw 32-byte `d` (JWK form),
 *  never the PKCS8 wrapper — re-import is `createPrivateKey({ key: {...},
 *  format: 'jwk' })`, exactly as `accountPool.ts`'s `AccountPoolDeps` model
 *  keeps its own state a plain, re-importable shape. */
export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** Mirrors `AccountPoolDeps` (`accountPool.ts:57-74`): `statePath` is a
 *  GETTER because this is constructed before Electron's `app` paths are
 *  usable. */
export interface PushDeps {
  statePath: () => string;
}

const CURVE = 'prime256v1';

/** Fixed 27-byte SPKI DER prefix for an uncompressed P-256 point (structurally
 *  verified this session, byte for byte, against RFC 5480/X.509: outer
 *  SEQUENCE(89) -> AlgorithmIdentifier SEQUENCE(19: OID ecPublicKey 1.2.840.
 *  10045.2.1 + OID prime256v1 1.2.840.10045.3.1.7) -> BIT STRING(66: one
 *  unused-bits byte 0x00 + the 0x04 uncompressed-point marker). Appending the
 *  raw 64-byte X||Y after this prefix (i.e. the point with its own leading
 *  0x04 stripped) is the complete 91-byte DER key — the same "fixed prefix +
 *  raw bytes" shape `webhook.ts`'s `discordPublicKeyFrom` already uses for
 *  Ed25519, applied to the curve this file needs. */
const P256_SPKI_PREFIX = Buffer.from('3059301306072a8648ce3d020106082a8648ce3d03010703420004', 'hex');

function toB64Url(buf: Buffer): string {
  return buf.toString('base64url');
}
function fromB64Url(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

/** Import a raw uncompressed P-256 point (65 bytes, leading `0x04`) as a
 *  public {@link KeyObject}. Throws on a malformed point — every caller here
 *  catches and answers the uniform failure shape, never a 500/throw across
 *  this module's own boundary. */
function importP256Point(point: Buffer): KeyObject {
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error('not an uncompressed P-256 point (expected 65 bytes, 0x04 prefix)');
  }
  return createPublicKey({ key: Buffer.concat([P256_SPKI_PREFIX, point.subarray(1)]), format: 'der', type: 'spki' });
}

/** The inverse of {@link importP256Point} — read a public {@link KeyObject}
 *  back out as the raw uncompressed point, via its JWK `x`/`y`. */
function exportP256Point(pub: KeyObject): Buffer {
  const jwk = pub.export({ format: 'jwk' }) as { x: string; y: string };
  return Buffer.concat([Buffer.from([0x04]), fromB64Url(jwk.x), fromB64Url(jwk.y)]);
}

/** Reconstruct the VAPID signing {@link KeyObject} from the stored JWK parts.
 *  `x`/`y` are recovered from the stored public point — nothing is stored
 *  twice. */
function vapidPrivateKeyObject(keys: VapidKeys): KeyObject {
  const point = fromB64Url(keys.publicKey);
  if (point.length !== 65 || point[0] !== 0x04) throw new Error('malformed VAPID public key');
  const x = toB64Url(point.subarray(1, 33));
  const y = toB64Url(point.subarray(33, 65));
  return createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x, y }, format: 'jwk' });
}

/** Does the stored private key genuinely belong to the advertised public
 *  point? `createPrivateKey({ format: 'jwk' })` does NOT answer that — it is
 *  a SHAPE check only. Measured live on Node v24.13.0: it accepts an empty, a
 *  4-byte, a non-base64, a 120-byte PKCS8-sized, and a foreign-keypair `d`
 *  without complaint, and `createPublicKey()` on the result just echoes back
 *  the `x`/`y` it was handed rather than deriving `d*G`, so comparing points
 *  cannot catch it either. Signing a probe and verifying it against the
 *  ADVERTISED point is therefore the check: one ECDSA sign + verify, once per
 *  process start. Without it a mismatched stored key signs VAPID JWTs that
 *  never verify against the `k=` we advertise — silent, permanent 401s from
 *  every push service, with nothing left to trigger regeneration — or throws
 *  `too small buffer` out of {@link vapidAuthHeader}. Non-throwing by
 *  contract: every failure mode above is a `false`, never an exception.
 *  Never logs either half of the pair. */
function vapidKeysMatch(keys: VapidKeys): boolean {
  try {
    const probe = Buffer.from('vapid-keypair-probe', 'utf8');
    const sig = cryptoSign('sha256', probe, { key: vapidPrivateKeyObject(keys), dsaEncoding: 'ieee-p1363' });
    const pub = importP256Point(fromB64Url(keys.publicKey));
    return cryptoVerify('sha256', probe, { key: pub, dsaEncoding: 'ieee-p1363' }, sig);
  } catch {
    return false;
  }
}

/** Fresh application-server VAPID keypair. */
export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: CURVE });
  const point = exportP256Point(publicKey);
  const privJwk = privateKey.export({ format: 'jwk' }) as { d: string };
  return { publicKey: toB64Url(point), privateKey: privJwk.d };
}

/** Read the persisted VAPID keypair, generating and persisting one on first
 *  use. Written ATOMICALLY (temp + rename), the same shape
 *  `accountPool.ts`'s own `save()` uses (`accountPool.ts:126-145`) and for
 *  the identical reason: a truncated file on a crash mid-write must never
 *  read back as a corrupt key. `deps.statePath()` MUST resolve under
 *  `app.getPath('userData')`, never the hive git repo — a VAPID private key
 *  in a commit is a permanent key compromise (T-P02-09-05). A write failure
 *  is swallowed (best effort): the caller still gets a usable in-memory
 *  keypair for this run. */
export function ensureVapidKeys(deps: PushDeps): VapidKeys {
  const path = deps.statePath();
  try {
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<VapidKeys>;
      if (typeof parsed.publicKey === 'string' && typeof parsed.privateKey === 'string') {
        const stored = { publicKey: parsed.publicKey, privateKey: parsed.privateKey };
        // `typeof === 'string'` alone lets a corrupted or legacy-format file
        // through, to blow up later inside the signing path — and re-IMPORTING
        // it is not enough either, because the JWK import validates only the
        // PUBLIC point (see {@link vapidKeysMatch}). Only a real pair check
        // catches a stored private key that is empty, truncated, non-base64,
        // PKCS8-wrapped, or simply from a different keypair; each of those signs
        // JWTs that never verify against the `k=` we advertise. Falls through to
        // regenerate + rewrite the file. Never logs either half.
        if (vapidKeysMatch(stored)) return stored;
      }
    }
  } catch { /* unreadable/corrupt — regenerate below */ }
  const keys = generateVapidKeys();
  const tmp = `${path}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmp, JSON.stringify(keys));
    renameSync(tmp, path);
  } catch { /* best effort; keys are still usable in-memory this run */ }
  return keys;
}

/** Validate a push endpoint at the trust boundary and hand back its ORIGIN,
 *  or `null` if it is not a well-formed absolute `https:`/`http:` URL.
 *  `PushSubscription.endpoint` arrives unmodified from the browser client, so
 *  it is externally-supplied data: a non-URL string used to throw `Invalid
 *  URL` out of {@link sendPush}, and a `file:`/`javascript:` URL would parse
 *  yet still be handed to the injected transport. Callers fail closed on
 *  `null`; the endpoint is never echoed into an error (a capability URL). */
export function endpointOrigin(endpoint: string): string | null {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * The `Authorization: vapid t=<jwt>, k=<publicKey>` header (RFC 8292).
 * ES256 over `{"typ":"JWT","alg":"ES256"}`; claims `aud` = the endpoint's
 * ORIGIN (scheme + host, no path — a push service rejects a mismatched
 * audience), `exp` = `now + 12h` (well under the 24h ceiling most push
 * services enforce), `sub` = the caller's contact URI.
 *
 * `dsaEncoding: 'ieee-p1363'` — Node's default is DER. A push service
 * answers a DER-signed VAPID JWT with 401, and this is the single most
 * common way a hand-rolled VAPID implementation fails. Do not delete this
 * option as dead-looking noise.
 */
export function vapidAuthHeader(endpoint: string, keys: VapidKeys, subject: string, now?: number): string {
  const aud = endpointOrigin(endpoint);
  if (aud === null) throw new Error('malformed push endpoint');
  const iat = Math.floor((now ?? Date.now()) / 1000);
  const exp = iat + 12 * 60 * 60;
  const headerB64 = toB64Url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }), 'utf8'));
  const claimsB64 = toB64Url(Buffer.from(JSON.stringify({ aud, exp, sub: subject }), 'utf8'));
  const signingInput = `${headerB64}.${claimsB64}`;
  const sig = cryptoSign('sha256', Buffer.from(signingInput, 'utf8'), {
    key: vapidPrivateKeyObject(keys),
    dsaEncoding: 'ieee-p1363'
  });
  return `vapid t=${signingInput}.${toB64Url(sig)}, k=${keys.publicKey}`;
}

/** RFC 8188's `aes128gcm` record size. Fixed at the RFC's own default —
 *  Web Push messages are always a single record, so this only ever bounds
 *  the plaintext cap below. */
const RECORD_SIZE = 4096;
/** `aes128gcm`'s per-record header: salt(16) + rs(4) + idlen(1) + keyid(65). */
const RECORD_HEADER_BYTES = 16 + 4 + 1 + 65;
/** 1 byte padding delimiter + 16 byte GCM auth tag are the other per-record
 *  overhead RFC 8188 §2 charges against the record size. */
const RECORD_OVERHEAD_BYTES = RECORD_HEADER_BYTES + 1 + 16;
/** The plaintext cap this module enforces — exported so a test can assert
 *  the boundary from the module's own constant, never a quoted number. */
export const MAX_PUSH_PLAINTEXT_BYTES = RECORD_SIZE - RECORD_OVERHEAD_BYTES; // 3993

/**
 * RFC 8291 `aes128gcm` payload encryption. A fresh P-256 keypair per message
 * (unless `localKeys` pins one — see below), ECDH against the subscription's
 * `p256dh`, then the two-stage HKDF the RFC specifies: stage one derives the
 * shared IKM from the ECDH secret keyed by the subscription's `auth` secret;
 * stage two derives the CEK and nonce from that IKM keyed by this message's
 * own random salt. `node:crypto`'s `hkdfSync(digest, ikm, salt, info,
 * keylen)` already performs HKDF-Extract(salt, ikm) + HKDF-Expand(·, info,
 * keylen) in one call, so each stage below is exactly one `hkdfSync`.
 *
 * `salt`/`localKeys` exist ONLY so a test can pin a published vector —
 * `localKeys` is the application server's EPHEMERAL private key for this one
 * message (never a VAPID key, never reused across messages); production
 * callers ({@link sendPush}) pass neither.
 */
export function encryptPayload(
  plaintext: string | Buffer,
  sub: PushSubscription,
  salt?: Buffer,
  localKeys?: KeyObject
): { ok: true; body: Buffer } | { ok: false; error: string } {
  const plainBuf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  if (plainBuf.length > MAX_PUSH_PLAINTEXT_BYTES) {
    return { ok: false, error: `payload too large (${plainBuf.length} bytes > ${MAX_PUSH_PLAINTEXT_BYTES} byte cap)` };
  }

  let asPrivate: KeyObject;
  let asPublic: KeyObject;
  try {
    if (localKeys) {
      asPrivate = localKeys;
      asPublic = createPublicKey(localKeys);
    } else {
      const pair = generateKeyPairSync('ec', { namedCurve: CURVE });
      asPrivate = pair.privateKey;
      asPublic = pair.publicKey;
    }

    const uaPoint = fromB64Url(sub.keys.p256dh);
    const authSecret = fromB64Url(sub.keys.auth);
    const uaPublic = importP256Point(uaPoint);
    const asPublicPoint = exportP256Point(asPublic);

    const ecdhSecret = diffieHellman({ privateKey: asPrivate, publicKey: uaPublic });

    const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPoint, asPublicPoint]);
    const ikm = Buffer.from(hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));

    const recordSalt = salt ?? randomBytes(16);
    const cek = Buffer.from(hkdfSync('sha256', ikm, recordSalt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16));
    const nonce = Buffer.from(hkdfSync('sha256', ikm, recordSalt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12));

    // 0x02: the last (and here, only) record's padding delimiter (RFC 8188 §2).
    const padded = Buffer.concat([plainBuf, Buffer.from([0x02])]);
    const cipher = createCipheriv('aes-128-gcm', cek, nonce);
    const ciphertext = Buffer.concat([cipher.update(padded), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const header = Buffer.alloc(RECORD_HEADER_BYTES);
    recordSalt.copy(header, 0);
    header.writeUInt32BE(RECORD_SIZE, 16);
    header.writeUInt8(asPublicPoint.length, 20);
    asPublicPoint.copy(header, 21);

    return { ok: true, body: Buffer.concat([header, ciphertext, authTag]) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The outbound call, injected — D-15's rule applied here. No test in this
 *  repo fakes an outbound HTTP client, and a module-scope `fetch` would mean
 *  `test/push-vapid.test.cjs` cannot exist at all. */
export type PushTransport = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: Buffer }
) => Promise<{ status: number }>;

export interface SendPushOpts {
  vapid: VapidKeys;
  /** The VAPID `sub` claim — a contact URI (`mailto:` or an `https:` URL). */
  subject: string;
  /** Seconds a push service may hold the message before discarding it. */
  ttl?: number;
  transport: PushTransport;
  now?: () => number;
}

/** Why a STRING and not a boolean: the caller answers with it verbatim, and
 *  each shape failure is a different operator-visible cause. Takes `unknown`
 *  deliberately — the declared {@link PushSubscription} type is a WIRE
 *  contract the browser is trusted to honour, not something the compiler can
 *  enforce at run time, and `null`/`undefined`/a bare string do reach here.
 *  Touches nothing but `typeof` on already-destructured locals, so it cannot
 *  throw on its own; it is still called from inside the try, belt and
 *  braces. Never echoes the endpoint (a capability URL). */
function malformedSubscription(sub: unknown): string | null {
  if (typeof sub !== 'object' || sub === null) return 'malformed push subscription';
  const { endpoint, keys } = sub as Partial<PushSubscription>;
  if (typeof endpoint !== 'string' || endpointOrigin(endpoint) === null) return 'malformed push endpoint';
  if (typeof keys !== 'object' || keys === null) return 'malformed push subscription keys';
  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return 'malformed push subscription keys';
  return null;
}

/**
 * Encrypt and POST one push message. 404/410 mean the subscription is dead —
 * `gone: true` tells the caller to prune it (D-19: every tunnel restart kills
 * every subscription, so without pruning the state file only grows). 429 is
 * NOT `gone`: a rate limit is not a dead subscription, and pruning on it
 * would unsubscribe a working phone. A `sub` that is not an object, or whose
 * `endpoint` is not a well-formed absolute `https:`/`http:` URL, or whose
 * `keys` are absent or not strings, fails closed as `{ok:false}` before any
 * crypto or transport call. Never throws across this boundary — for ANY
 * `sub`, `null` and `undefined` included; never logs the private key, the
 * auth secret, or the endpoint (a capability URL).
 */
export async function sendPush(
  sub: PushSubscription,
  payload: string | Buffer,
  opts: SendPushOpts
): Promise<{ ok: true } | { ok: false; status?: number; gone?: boolean; error: string }> {
  // EVERYTHING is inside the try, the guard's own dereference of `sub`
  // included. A pre-try `sub.endpoint` read is precisely how the "never
  // throws" contract was broken once already: `sendPush(null, ...)` REJECTED
  // with a TypeError instead of resolving `{ok:false}`. `sub` is the browser's
  // own `PushSubscription.toJSON()` forwarded unmodified, so its SHAPE is
  // externally supplied too — not only the `endpoint` string inside it.
  try {
    const bad = malformedSubscription(sub);
    if (bad !== null) return { ok: false, error: bad };
    const enc = encryptPayload(payload, sub);
    if (!enc.ok) return { ok: false, error: enc.error };
    // `vapidAuthHeader` throws on a corrupt stored VAPID key; in here that
    // throw fails closed instead of aborting a caller's whole send loop.
    const headers: Record<string, string> = {
      TTL: String(opts.ttl ?? 60),
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(enc.body.length),
      Authorization: vapidAuthHeader(sub.endpoint, opts.vapid, opts.subject, opts.now ? opts.now() : undefined)
    };
    const res = await opts.transport(sub.endpoint, { method: 'POST', headers, body: enc.body });
    if (res.status === 404 || res.status === 410) return { ok: false, status: res.status, gone: true, error: 'subscription gone' };
    if (res.status >= 200 && res.status < 300) return { ok: true };
    return { ok: false, status: res.status, gone: false, error: `push service responded ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The floor-quiet alarm's push tag (VIGIL-01, 04-UI-SPEC §S6a rule Q-4).
 *
 * `sw.js` sets `tag: 'ask:' + taskId`, so a notification REPLACES rather than
 * stacks on another with the same tag. This one is distinct and stable: the
 * alarm can only ever replace its own previous notification, and it can never
 * collide with — or swallow — a real ask. It satisfies `PHONE_TASK_ID_RE`
 * (`webhook.ts`), which is the only shape constraint on the field.
 */
export const FLOOR_QUIET_TAG = 'floor-quiet';

/**
 * The floor-quiet alarm's wire body — the JSON `resources/phone/sw.js` parses
 * out of the push event, and the only place that mapping is written down.
 *
 * **`agent` is the TITLE.** `sw.js` calls `showNotification(data.agent, {body:
 * 'is waiting on you'})` with the body HARD-CODED, and that worker is already
 * installed on the operator's phone. So an old worker renders the title alone,
 * and the title has to be a complete, true statement on its own — `The floor
 * has stopped`, `The orchestrator is gone`. A title of `Floor` would render as
 * "Floor is waiting on you", which is false. `body` is carried for the worker
 * that reads it; an old one ignores it, which is why both directions are
 * compatible and why `sw.js` needs no change from this plan (rule Q-5: a
 * service-worker edit is a live-device risk with no local reproduction).
 *
 * Composition only. The floor has no `PushSubscription` to send this to yet —
 * `webhook.ts` has no subscription-intake route, so nothing in this process has
 * ever captured one, and adding that route is `index.ts`'s, not this plan's.
 * When the intake lands, this is the payload it hands to {@link sendPush}.
 */
export function floorQuietPushPayload(
  a: { title: string; body: string }
): { agent: string; body: string; taskId: string } {
  return { agent: a.title, body: a.body, taskId: FLOOR_QUIET_TAG };
}
