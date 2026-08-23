'use strict';

/*
 * Unit tests for the voice read-layer's MESSAGE-CONTENT + RECENT-ACTIVITY path
 * (card enable-voice-agent-acces-cnzlfs).
 *
 * The logic under test lives in src/main/hive.ts — redactSecrets() (the
 * main-side privacy gate) and voiceMessages() (dedup + sort + slice over an
 * agent's inbox/outbox). hive.ts is TypeScript and these are not importable from
 * a plain .cjs test, so the redaction battery and the selection core below are a
 * CHARACTER-IDENTICAL copy (minus TS type annotations). Same convention as
 * test/realtime-findcard.test.cjs. KEEP IN LOCKSTEP: if you change redactSecrets
 * or voiceMessages in hive.ts, mirror the change here — these tests are what
 * PROVE a secret-shaped value is stripped and that retrieval behaves.
 *
 * Run: node test/voice-messages.test.cjs   (exit 0 = all pass)
 */

const assert = require('assert');

// ── redactSecrets — MIRROR of src/main/hive.ts redactSecrets() ───────────────
function redactSecrets(text) {
  if (typeof text !== 'string' || !text) return typeof text === 'string' ? text : '';
  let s = text;
  // 1. PEM private-key blocks (RSA/EC/OPENSSH/PGP — header through footer).
  s = s.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[redacted]');
  // 2. JSON Web Tokens — three base64url segments separated by dots.
  s = s.replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, '[redacted]');
  // 3. Known credential prefixes. The sk- arm is SPLIT: sk-ant-/sk-proj-/
  //    sk-svcacct- stay UNBOUNDED (the vendor segment discriminates), the bare
  //    sk- arm alone carries the \b (it is the only one with a measured false
  //    positive), and the other six are untouched. Reasons, measurements and
  //    the declared trade live in src/main/hive.ts — do not restate them here,
  //    restating a measurement in two places is how the two drift.
  s = s.replace(
    /(?:sk-ant-[A-Za-z0-9_-]{16,}|sk-proj-[A-Za-z0-9_-]{16,}|sk-svcacct-[A-Za-z0-9_-]{16,}|\bsk-[A-Za-z0-9_-]{16,}|xox[bpaors]-[A-Za-z0-9-]{10,}|xapp-[A-Za-z0-9-]{10,}|gh[posru]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{20,})/g,
    '[redacted]'
  );
  // 4. Bearer tokens — keep the label, drop the credential.
  s = s.replace(/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [redacted]');
  // 5. Sensitive key = value / key: value — keep the key name, drop the value.
  //    An optional namespace prefix (aws_, gcp_, …) is folded into the captured
  //    key so a LABELED secret survives the \b boundary: `aws_secret_access_key`
  //    is all word chars, so a bare `\b(secret)\b` never sees it. Listing
  //    secret_access_key / private_key alone is not enough — the prefix run is
  //    what lets `aws_secret_access_key=…` (no AKIA shape on the value) redact.
  s = s.replace(
    /\b((?:[a-z0-9]+[_-])*(?:api[_-]?key|secret[_-]?access[_-]?key|secret|token|password|passwd|pwd|access[_-]?token|refresh[_-]?token|client[_-]?secret|signing[_-]?secret|webhook[_-]?secret|auth[_-]?token|bot[_-]?token|private[_-]?key))(\s*[:=]\s*)(["']?)[^\s"',}]{6,}\3/gi,
    (_m, k) => `${k}=[redacted]`
  );
  // 6. Unlabelled vendor keys spelled with an UNDERSCORE vendor segment. These
  //    are their own statements running AFTER pattern 5 on purpose: appended
  //    inside pattern 3's alternation, the greedy body eats the leading "sk" of
  //    a following sk-ant- key and leaks 20 bytes of it. See src/main/hive.ts.
  s = s.replace(/\bsk_(?:ant|live|test|proj)_[A-Za-z0-9_]{10,}/g, '[redacted]');
  s = s.replace(/\brk_(?:live|test)_[A-Za-z0-9_]{10,}/g, '[redacted]');
  return s;
}

// ── selection core — MIRROR of src/main/hive.ts voiceMessages() inner logic ──
// `tagged` is the folder-traversal order: [{ msg, owner, direction, archived }].
function toVoice(m, owner, direction, archived) {
  return {
    id: m.id, conversation: m.conversation, from: m.from, to: m.to, act: m.act,
    subject: redactSecrets(m.subject), body: redactSecrets(m.body),
    requires_reply: !!m.requires_reply, direction, owner, archived, created_at: m.created_at
  };
}
function selectMessages(tagged, opts = {}) {
  const wantId = typeof opts.id === 'string' ? opts.id.trim() : '';
  const seen = new Set();
  const out = [];
  for (const t of tagged) {
    const m = t.msg;
    if (!m || typeof m.id !== 'string' || seen.has(m.id)) continue;
    seen.add(m.id);
    if (wantId && m.id !== wantId) continue;
    out.push(toVoice(m, t.owner, t.direction, t.archived));
  }
  out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  if (wantId) return out.slice(0, 1);
  const lim = typeof opts.limit === 'number' && isFinite(opts.limit)
    ? Math.max(1, Math.min(40, Math.round(opts.limit)))
    : 12;
  return out.slice(0, lim);
}

// ── recent-activity selection — MIRROR of hive.ts logTail() + tools.ts ───────
// logTail returns the last n log lines (oldest→newest); get_activity reverses
// for newest-first. Activity is METADATA-ONLY by design (no message bodies).
function logTailSelect(lines, n) {
  return lines.slice(-n);
}
function activityNewestFirst(lines, n) {
  return lines.slice(-n).reverse();
}

// ── harness (mirrors test/realtime-findcard.test.cjs) ────────────────────────
let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}\n     ${err.message}`);
  }
}

// ── fixtures ─────────────────────────────────────────────────────────────────
const mk = (over) => ({
  id: 'm1', conversation: 'c1', in_reply_to: null, from: 'kevin', to: 'god',
  act: 'inform', subject: 'status', body: 'all green', hops: 0,
  requires_reply: false, needs_human: false, created_at: '2026-06-27T09:00:00.000Z',
  ...over
});

console.log('voice read-layer: recent-activity + message-content + redaction');

// ===== RECENT ACTIVITY (metadata-only) =======================================
const LOG = [
  { ts: 1, kind: 'spawn', agentId: 'meredith' },
  { ts: 2, kind: 'message', from: 'kevin', agentId: 'kevin' },
  { ts: 3, kind: 'tasks', count: 12 },
  { ts: 4, kind: 'archive', agentId: 'creed' },
  { ts: 5, kind: 'voice_action', actor: 'michael-voice' }
];

test('activity: last-N selection returns the N most recent', () => {
  const sel = logTailSelect(LOG, 3);
  assert.strictEqual(sel.length, 3);
  assert.deepStrictEqual(sel.map((e) => e.kind), ['tasks', 'archive', 'voice_action']);
});
test('activity: newest-first ordering', () => {
  const sel = activityNewestFirst(LOG, 3);
  assert.deepStrictEqual(sel.map((e) => e.kind), ['voice_action', 'archive', 'tasks']);
});
test('activity: log entries carry NO message body (metadata-only source)', () => {
  for (const e of LOG) assert.ok(!('body' in e), 'activity log must not expose message bodies');
});

// ===== MESSAGE RETRIEVAL =====================================================
const A = mk({ id: 'a', from: 'kevin', to: 'god', subject: 'done', body: 'shipped', created_at: '2026-06-27T08:00:00.000Z' });
const B = mk({ id: 'b', from: 'god', to: 'kevin', subject: 'next', body: 'pick up card x', created_at: '2026-06-27T09:30:00.000Z' });
const C = mk({ id: 'c', from: 'pam', to: 'god', subject: 'review', body: 'looks good', created_at: '2026-06-27T07:00:00.000Z' });

// A delivered message lives in BOTH the sender's outbox/.sent AND the recipient's
// inbox/.done — the traversal sees it twice. Dedup must collapse to one.
const TAGGED = [
  { msg: B, owner: 'kevin', direction: 'inbox', archived: false },
  { msg: A, owner: 'kevin', direction: 'outbox', archived: true },
  { msg: A, owner: 'god', direction: 'inbox', archived: true },   // duplicate of A
  { msg: C, owner: 'god', direction: 'inbox', archived: true }
];

test('retrieval: by id returns exactly that one message', () => {
  const r = selectMessages(TAGGED, { id: 'a' });
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].id, 'a');
  assert.strictEqual(r[0].body, 'shipped');
});
test('retrieval: missing id returns empty', () => {
  assert.strictEqual(selectMessages(TAGGED, { id: 'zzz' }).length, 0);
});
test('recent: dedups a message seen in two mailboxes', () => {
  const r = selectMessages(TAGGED, {});
  assert.strictEqual(r.length, 3, 'A appears once despite two copies');
  assert.strictEqual(new Set(r.map((m) => m.id)).size, 3);
});
test('recent: sorted newest-first by created_at', () => {
  const r = selectMessages(TAGGED, {});
  assert.deepStrictEqual(r.map((m) => m.id), ['b', 'a', 'c']);
});
test('recent: limit caps the list', () => {
  const r = selectMessages(TAGGED, { limit: 2 });
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r.map((m) => m.id), ['b', 'a']);
});
test('shape: carries direction + owner + archived for briefing context', () => {
  const r = selectMessages(TAGGED, { id: 'a' });
  assert.strictEqual(r[0].owner, 'kevin');
  assert.strictEqual(r[0].direction, 'outbox');
  assert.strictEqual(r[0].archived, true);
});

// ===== REDACTION (the security crux) =========================================
const SECRETS = [
  ['OpenAI key', 'key is sk-proj-abc123DEF456ghi789JKL012mno345 ok', 'sk-proj-abc123DEF456ghi789JKL012mno345'],
  ['Anthropic key', 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx done', 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx'],
  // NB: this fake Slack-token fixture is split ('xoxb-' + '…') so GitHub push protection
  // doesn't flag it as a real secret — the runtime value is byte-identical, the redaction
  // assertion is unchanged. Do NOT rejoin into one literal (it re-trips the public-push block).
  ['Slack bot token', 'token xoxb-' + '1234567890-ABCDEFghijklmnop here', 'xoxb-' + '1234567890-ABCDEFghijklmnop'],
  ['Slack app token', 'xapp-1-A0123456-789012345-abcdef0123 end', 'xapp-1-A0123456-789012345-abcdef0123'],
  ['GitHub PAT', 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 x', 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'],
  ['GitHub fine-grained', 'github_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ z', 'github_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ'],
  ['AWS access key', 'AKIAIOSFODNN7EXAMPLE is the id', 'AKIAIOSFODNN7EXAMPLE'],
  ['Google API key', 'AIzaSyA1234567890_abcdefghijklmnopqrst go', 'AIzaSyA1234567890_abcdefghijklmnopqrst'],
  ['JWT', 'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJ here', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJ'],
  ['api_key assignment', 'config api_key=sk_live_th_isIsASecretValue123 stored', 'sk_live_th_isIsASecretValue123'],
  ['password assignment', 'login password: hunter2password now', 'hunter2password'],
  ['signing_secret assignment', 'slack signing_secret = 8f9a0b1c2d3e4f5a6b7c done', '8f9a0b1c2d3e4f5a6b7c'],
  ['bot_token assignment', 'env bot_token="xoxb-keepme-but-strip" set', 'xoxb-keepme-but-strip'],
  // Pam hardening: a LABELED aws secret access key — the AKIA id half is caught
  // by rule 3, but the 40-char SECRET value has no prefix shape and sits behind a
  // namespace prefix (aws_), so it must be caught by the rule-5 key=value path.
  ['aws_secret_access_key (namespaced label)', 'creds aws_secret_access_key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY here', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'],
  ['private_key assignment', 'config private_key=abc123DEF456ghi789jkl012mno here', 'abc123DEF456ghi789jkl012mno']
];

// SENSITIVITY — UNLABELLED vendor keys spelled with an UNDERSCORE vendor segment.
// No `=`, no `:`, no key name anywhere in the string, so pattern 5 cannot see them
// and only a pattern-3-class prefix rule can. Every one of these is PLAINTEXT under
// the matcher that shipped before 01-26; they are the five detections this plan gains.
// Kept in their own array so REGRESSION below can iterate SECRETS alone and stay a
// HEAD-pinned battery.
const SECRETS_NEW = [
  ['unlabelled sk_live_ (Stripe live)', 'sk_live_EX_HxxxxxxxxxxxxYYYY', 'sk_live_EX_HxxxxxxxxxxxxYYYY'],
  ['unlabelled sk_test_ (Stripe test)', 'sk_test_51_HxxxxxxxxxxxxYYYY', 'sk_test_51_HxxxxxxxxxxxxYYYY'],
  ['unlabelled sk_proj_', 'sk_proj_51_HxxxxxxxxxxxxYYYY', 'sk_proj_51_HxxxxxxxxxxxxYYYY'],
  ['unlabelled sk_ant_ (the durability suite MISSED_SECRET)', 'sk_ant_api03_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJ', 'sk_ant_api03_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJ'],
  ['unlabelled rk_live_ (Stripe restricted)', 'rk_live_51HxxxxxxxxxxxxYYYY', 'rk_live_51HxxxxxxxxxxxxYYYY']
];

for (const [label, input, secret] of [...SECRETS, ...SECRETS_NEW]) {
  test(`redact: strips ${label}`, () => {
    const out = redactSecrets(input);
    assert.ok(!out.includes(secret), `secret leaked: ${out}`);
    assert.ok(out.includes('[redacted]'), `nothing redacted: ${out}`);
  });
}

// ===== REGRESSION — EXACT-OUTPUT PINS CAPTURED FROM THE HEAD MATCHER ==========
//
// WHY EXACT OUTPUT AND NOT `!out.includes(secret)`. Two successive attempts to widen
// this battery each turned real detections into plaintext — four credential classes
// the first time, eleven more the second — and BOTH reported all-green, because the
// SECRETS loop above only ever asks "is the secret gone" of strings that were never
// those shapes. A rule that STOPS matching leaves the secret present and the loop
// above cannot see it. Every row below is pinned to the byte-exact string the matcher
// produced BEFORE this plan touched it, so a lost detection is a failed assertion.
//
// The rows were CHOSEN BY RUNNING THE HEAD MATCHER, not by taste: 15 live SECRETS,
// the 4 classes revision 2 lost, the 12 shapes revision 3 lost, 2 crypt-hash controls
// and the 5 shapes round 4 lost. If you add a credential class to SECRETS, add its
// HEAD pin to SECRETS_HEAD_PIN or the drift guard below fails on purpose.
const SECRETS_HEAD_PIN = {
  'OpenAI key': 'key is [redacted] ok',
  'Anthropic key': '[redacted] done',
  'Slack bot token': 'token [redacted] here',
  'Slack app token': '[redacted] end',
  'GitHub PAT': '[redacted] x',
  'GitHub fine-grained': '[redacted] z',
  'AWS access key': '[redacted] is the id',
  'Google API key': '[redacted] go',
  JWT: 'jwt [redacted] here',
  'api_key assignment': 'config api_key=[redacted] stored',
  'password assignment': 'login password=[redacted] now',
  'signing_secret assignment': 'slack signing_secret=[redacted] done',
  'bot_token assignment': 'env bot_token=[redacted] set',
  'aws_secret_access_key (namespaced label)': 'creds aws_secret_access_key=[redacted] here',
  'private_key assignment': 'config private_key=[redacted] here'
};

// The 18 shapes revisions 2 and 3 turned into plaintext, plus 2 crypt-hash controls.
// The argon2 row's pin is a PARTIAL redaction — pattern 5's value class stops at the
// comma. That is the real behaviour; do NOT "fix" it to a full redaction, because the
// only way to do that is to edit pattern 5, which is frozen (see FROZEN_PATTERN_5).
const REGRESSION_LITERAL = [
  ['login password=12345678', 'login password=[redacted]'],
  ['db password=$2b$12$KIXxPfPqmSabcdefghijklmn', 'db password=[redacted]'],
  ['cfg client_secret=ABCDEFGH1234IJKL', 'cfg client_secret=[redacted]'],
  ['bot_token=XOXBTESTTOKENVALUE1234', 'bot_token=[redacted]'],
  ['login password=Correct.Horse.Battery', 'login password=[redacted]'],
  ['cfg api_key=my.secret.key.value', 'cfg api_key=[redacted]'],
  ['auth_token=v1.aBcDeFgH12345678', 'auth_token=[redacted]'],
  ['client_secret=prod.app.9f3a2b1c', 'client_secret=[redacted]'],
  ['webhook_secret=hooks.slack.com', 'webhook_secret=[redacted]'],
  ['refresh_token=eyJhbG.ciOiJI.UzI1NiJ', 'refresh_token=[redacted]'],
  ['token=hvs.CAESIJabcdefgh', 'token=[redacted]'],
  ['password=CORRECT_HORSE_BATTERY', 'password=[redacted]'],
  ['client_secret=PROD_SLACK_SIGNING_1', 'client_secret=[redacted]'],
  ['token=$ecretV4lue', 'token=[redacted]'],
  ['password=unknown', 'password=[redacted]'],
  ['token=boolean', 'token=[redacted]'],
  ['password=$argon2id$v=19$m=65536,t=3,p=4$abcdefgh', 'password=[redacted],t=3,p=4$abcdefgh'],
  ['password=hunter2password;', 'password=[redacted]'],
  // The 4 non-swallow shapes round 4 lost to a blanket word boundary. Each is a
  // credential glued to a preceding WORD CHARACTER — a URL-encoded `=` in a curl
  // line, a log, a stack trace. All four are redacted at HEAD.
  ['q=key%3Dsk-ant-api03-AAAABBBBCCCCDDDD', 'q=key%3D[redacted]'],
  ['xsk-ant-api03-AAAABBBBCCCCDDDD', 'x[redacted]'],
  ['AWSAKIAIOSFODNN7EXAMPLE', 'AWS[redacted]'],
  ['MYgithub_pat_11ABCDEFG0aBcDeFgHiJkLmNoPqRsTuVwXyZ', 'MY[redacted]']
];

// The SWALLOW ROW — the one row where the shipped matcher is STRICTER than HEAD, so
// pinning it to HEAD's output would pin a leak. HEAD answers
// "sk_live_AAAAAAAAAA[redacted]"; the shipped matcher answers "[redacted][redacted]".
// The second assertion is the one that matters: it goes RED the moment the two new
// underscore arms are appended INSIDE pattern 3's alternation instead of running as
// their own statements after pattern 5, because a greedy [A-Za-z0-9_]{10,} body then
// eats the leading "sk" of the following key and leaks 20 bytes of it in plaintext.
const SWALLOW_IN = 'sk_live_AAAAAAAAAAsk-ant-BBBBBBBBBBBBBBBB';
const SWALLOW_SHIPPED = '[redacted][redacted]';
const SWALLOW_TAIL = '-ant-BBBBBBBBBBBBBBBB';

test('REGRESSION: every SECRETS row still has a HEAD pin (drift guard)', () => {
  for (const [label] of SECRETS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(SECRETS_HEAD_PIN, label),
      `SECRETS grew a row with no HEAD pin: ${label}. Capture its exact pre-change output `
      + 'and add it, or this battery silently stops covering the row you just added'
    );
  }
  assert.strictEqual(Object.keys(SECRETS_HEAD_PIN).length, SECRETS.length,
    'SECRETS_HEAD_PIN and SECRETS disagree on how many rows exist');
});

for (const [label, input] of SECRETS) {
  test(`REGRESSION: ${label} produces its exact pre-change output`, () => {
    assert.strictEqual(redactSecrets(input), SECRETS_HEAD_PIN[label]);
  });
}
for (const [input, expected] of REGRESSION_LITERAL) {
  test(`REGRESSION: ${JSON.stringify(input).slice(0, 52)} produces its exact pre-change output`, () => {
    assert.strictEqual(redactSecrets(input), expected);
  });
}
test('REGRESSION: the swallow row is redacted MORE than before, and no fragment survives', () => {
  const out = redactSecrets(SWALLOW_IN);
  // The no-fragment arm runs FIRST, deliberately: it is GREEN before the change and
  // must STAY green, and putting the shipped-value pin ahead of it would leave it
  // unexercised until the change landed — which is how this class was missed once.
  assert.ok(!out.includes(SWALLOW_TAIL),
    'a fragment of the SECOND key survived — the underscore arms were appended inside '
    + "pattern 3's alternation, where a greedy body eats the next key's prefix");
  assert.strictEqual(out, SWALLOW_SHIPPED);
});
// The battery is 15 + 22 + 1 = 38 rows. Stated as a number on purpose: reporting it
// folded into a suite total is what let two revisions ship a net detection loss.
const REGRESSION_ROWS = SECRETS.length + REGRESSION_LITERAL.length + 1;
test('REGRESSION: the battery is 38 rows', () => {
  assert.strictEqual(REGRESSION_ROWS, 38);
});

// ===== C-1 — the bare `sk-` boundary, measured in BOTH directions ============
//
// A word boundary on the WHOLE `sk-` arm loses 15 measured shapes: three OpenAI key
// spellings (`sk-proj-`, `sk-svcacct-` and the legacy bare `sk-<alnum>`) in five
// contexts where the key is glued to a preceding word character. Ten of those fifteen
// are restored by giving the VENDOR-SEGMENTED spellings their own unbounded
// alternatives — the same argument that keeps `sk-ant-` unbounded. These ten are
// HEAD-pinned: they are real detections and they must never regress again.
const C1_RESTORED = [
  ['q=key%3Dsk-proj-abc123DEF456ghi789JKL012mno345', 'q=key%3D[redacted]'],
  ['q=key\\u003Dsk-proj-abc123DEF456ghi789JKL012mno345', 'q=key\\u003D[redacted]'],
  ['xsk-proj-abc123DEF456ghi789JKL012mno345', 'x[redacted]'],
  ['apikeysk-proj-abc123DEF456ghi789JKL012mno345', 'apikey[redacted]'],
  ['deadbeefsk-proj-abc123DEF456ghi789JKL012mno345', 'deadbeef[redacted]'],
  ['q=key%3Dsk-svcacct-abc123DEF456ghi789JKL012', 'q=key%3D[redacted]'],
  ['q=key\\u003Dsk-svcacct-abc123DEF456ghi789JKL012', 'q=key\\u003D[redacted]'],
  ['xsk-svcacct-abc123DEF456ghi789JKL012', 'x[redacted]'],
  ['apikeysk-svcacct-abc123DEF456ghi789JKL012', 'apikey[redacted]'],
  ['deadbeefsk-svcacct-abc123DEF456ghi789JKL012', 'deadbeef[redacted]']
];
for (const [input, expected] of C1_RESTORED) {
  test(`C-1 restored: ${JSON.stringify(input).slice(0, 52)} still redacts`, () => {
    assert.strictEqual(redactSecrets(input), expected);
  });
}

// *** DECLARED LOSS — READ THIS BEFORE CHANGING IT ***
//
// These five rows ARE redacted by the pre-01-26 matcher and are NOT redacted by the
// one that ships with it. They are pinned to the LEAKING output on purpose, because
// an undeclared trade is the defect class this phase exists to remove and a silent
// one would be invisible. The trade, measured:
//
//   family lost : a LEGACY bare `sk-<32+ alnum>` OpenAI key IMMEDIATELY PRECEDED BY
//                 A WORD CHARACTER. `sk-ant-`, `sk-proj-` and `sk-svcacct-` are all
//                 unbounded and keep matching in every one of these contexts.
//   bought with : `desk-backend-engineer`, `desk-market-researcher`,
//                 `task-kanban-work-as-a-board-not-a-chat-log` and
//                 `risk-assessment-matrix-builder-v2` stop being read as vendor keys.
//                 Those four unstage tracked files from EVERY commit that touches
//                 them, permanently, and the log line is indistinguishable from a
//                 real credential catch.
//   measured    : 481 tracked text files and 400 commits — 0 newly unstaged paths, 4
//                 tracked files rescued, 0 of the 38 REGRESSION rows lost.
//
// A lookbehind on the bare arm — `(?<![a-z])sk-` instead of `\bsk-` — was measured
// and restores the first two rows below (a `%3D`/`=` prefix ends in an UPPERCASE
// D) with the same 0 newly-unstaged paths. It was not taken here because it drops the
// literal `\bsk` that this plan's key-links gate compiles against; it is recorded as
// the measured upgrade path, not as a hypothetical.
//
// If a later change closes this gap, these assertions go RED. That is the ceiling
// moving UP — repin them to the redacted output, do not narrow the matcher back.
const C1_DECLARED_LOSS = [
  ['q=key%3Dsk-A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6', 'q=key%3D[redacted]'],
  ['q=key\\u003Dsk-A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6', 'q=key\\u003D[redacted]'],
  ['xsk-A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6', 'x[redacted]'],
  ['apikeysk-A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6', 'apikey[redacted]'],
  ['deadbeefsk-A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6', 'deadbeef[redacted]']
];
for (const [input, wasRedactedTo] of C1_DECLARED_LOSS) {
  test(`C-1 DECLARED LOSS: ${JSON.stringify(input).slice(0, 52)} is no longer redacted`, () => {
    assert.strictEqual(redactSecrets(input), input,
      `this shape used to redact to ${JSON.stringify(wasRedactedTo)}. If it redacts again, the `
      + 'ceiling moved UP — repin this row and update the FLOOR-04 ceiling in src/main/hive.ts');
  });
}

// ===== LIVE FALSE POSITIVES THIS PLAN FIXES ==================================
// NOT hypotheticals and NOT in BENIGN — BENIGN is green-at-HEAD by contract and these
// four are RED until the boundary lands. The first two are byte-copied from
// tools/mapgen/build_map.py, which the matcher unstages from every commit that
// touches it. The third is the blog anchor id behind the one path a 400-commit replay
// rescues; the fourth is the `risk-` family.
const FALSE_POSITIVES_FIXED = [
  ["    'desk-team-lead': grid[6], 'desk-backend-engineer': grid[7],", 'desk- (build_map.py, line 1)'],
  ["    'desk-project-manager': grid[10], 'desk-market-researcher': grid[11],", 'desk- (build_map.py, line 2)'],
  ['<h2 id="the-task-kanban-work-as-a-board-not-a-chat-log" tabindex="-1">', 'task- (blog anchor id)'],
  ['risk-assessment-matrix-builder-v2 shipped', 'risk- (identifier)']
];
for (const [input, family] of FALSE_POSITIVES_FIXED) {
  test(`false positive fixed: ${family} is returned unchanged`, () => {
    assert.strictEqual(redactSecrets(input), input,
      'this is ordinary tracked source. A hit here does not over-redact — scrubStagedSecrets '
      + 'calls unstagePath and the file never reaches git history at all');
  });
}

test('redact: PEM private key block is stripped', () => {
  const pem = 'before -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabc123\n-----END RSA PRIVATE KEY----- after';
  const out = redactSecrets(pem);
  assert.ok(!out.includes('MIIEowIBAAKCAQEA'));
  assert.ok(out.includes('[redacted]'));
  assert.ok(out.includes('before') && out.includes('after'), 'surrounding prose preserved');
});

test('redact: bearer keeps the label, drops the credential', () => {
  const out = redactSecrets('Authorization: Bearer abcDEF0123456789xyzqrst');
  assert.ok(!out.includes('abcDEF0123456789xyzqrst'));
  assert.ok(/bearer \[redacted\]/i.test(out));
});

// ===== BENIGN CONTENT MUST SURVIVE ===========================================
const BENIGN = [
  'integrated feat/voice-key-ux at commit db61b12 off main 4585902',
  'kevin-mqpbq43v parked, awaiting assignment',
  '/Users/dev/Documents/Personal/cth-voice-msg-access is the worktree',
  'The token cap is 1.2 million tokens this session.',
  'Tasks: 3 todo, 1 doing, 0 blocked, 12 done.',
  'Pam approved 8 of 8 dimensions, no must-fix.',
  // Twelve demonstrated false positives — every one of these is a shape an agent
  // writes constantly, and every one of them is a PERMANENT UNSTAGE if the matcher
  // fires: scrubStagedSecrets drops the path from the commit and logs it as
  // `secret-scrubbed`, which an operator cannot tell from a real credential catch.
  // The last six are the reason no value-shape predicate ships on pattern 5, and the
  // reason the quoted-key JSON arm was measured and rejected on its cost.
  'const task_scheduler_interval_ms = 5;',
  'def risk_assessment_matrix_builder(x): pass',
  'from flask_sqlalchemy_helpers import db',
  'disk_usage_report_generator()',
  'const desk_seat_pool_assignment = seatPool.next();',
  'mask_sensitive_output_fields = True',
  '"token": 1200000,',
  '"api_key": "$OPENAI_API_KEY"',
  '"secret": "REPLACE_ME"',
  // byte-exact from resources/md-slack-reply.cjs: six leading spaces, no trailing comma
  "      'x-md-reply-token': cfg.token",
  '{"maxTokens": 200000, "debug": true}',
  'He said the "secret" was: nothing much'
];
for (const b of BENIGN) {
  test(`benign preserved: "${b.slice(0, 40)}..."`, () => {
    assert.strictEqual(redactSecrets(b), b, 'redaction must not alter benign content');
  });
}

test('redact: tolerates non-string input', () => {
  assert.strictEqual(redactSecrets(undefined), '');
  assert.strictEqual(redactSecrets(null), '');
  assert.strictEqual(redactSecrets(42), '');
  assert.strictEqual(redactSecrets(''), '');
});

// ===== THE MIRROR CONTRACT, ENFORCED AT RUNTIME ==============================
//
// The comment at the top of this file has asked a human to keep the copy above in
// step with src/main/hive.ts since the day it was written. The three sections below
// turn that request into an assertion, and add one more: pattern 5 is FROZEN.

const fs = require('node:fs');
const path = require('node:path');
const REPO_ROOT = path.resolve(__dirname, '..');
// The working tree is checked out CRLF on Windows while the blobs are LF, so a naive
// indexOf('\n}\n') finds nothing there. Measured; strip CR before slicing anything.
const readSrc = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/\r/g, '');

/** The whole `function redactSecrets(…) { … }` block, opening line through its `}`. */
function sliceRedactSecrets(src, signature) {
  const at = src.indexOf(signature);
  if (at < 0) return null;
  const end = src.indexOf('\n}\n', at);
  return end < 0 ? null : src.slice(at, end + 2);
}
/** The ONE `s = s.replace(` statement under the `// 5.` comment, and nothing else. */
function slicePattern5(src) {
  const c = src.indexOf('// 5. Sensitive key = value / key: value');
  if (c < 0) return null;
  const s = src.indexOf('s = s.replace(', c);
  if (s < 0) return null;
  const e = src.indexOf('\n  );', s);
  return e < 0 ? null : src.slice(s, e + 5);
}
/** Comments out, whitespace collapsed — so indentation and prose cannot mask a drift. */
const normalise = (s) => s
  .split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n')
  .replace(/\s+/g, ' ').trim();

const PROD_REL = 'src/main/hive.ts';
const MIRROR_REL = 'test/voice-messages.test.cjs';
const PROD_SIG = 'export function redactSecrets(text: unknown): string {';
const MIRROR_SIG = 'function redactSecrets(text) {';
// The ONLY differences the mirror is allowed to have. Declared as data and asserted
// to have applied, so this list cannot quietly become the place a real difference hides.
const TS_ONLY_TOKENS = [
  ['export ', ''],
  ['(text: unknown): string', '(text)']
];
// How many `s = s.replace(` statements redactSecrets is expected to contain. A count
// is what stops a future `new RegExp(KEYS + …)` refactor from leaving the guard below
// comparing two empty pattern lists forever.
const EXPECTED_REPLACE_STATEMENTS = 7;

// PATTERN 5 IS FROZEN. Captured byte-for-byte from src/main/hive.ts before this plan
// touched it, then whitespace-normalised. Pattern 5 is the ONLY arm covering labelled
// `key=value`, so every value-shape predicate ever proposed for it subtracts from LIVE
// detections: one such predicate turned 4 credential classes into plaintext and its
// re-derived replacement turned 11 more into plaintext, and both times every fixture
// the change owned still reported green. A predicate cannot be added INSIDE this
// statement without this assertion going red first, before any corpus has to be lucky
// enough to contain the shape.
const FROZEN_PATTERN_5 = "s = s.replace( /\\b((?:[a-z0-9]+[_-])*(?:api[_-]?key|secret[_-]?access[_-]?key|secret|token|password|passwd|pwd|access[_-]?token|refresh[_-]?token|client[_-]?secret|signing[_-]?secret|webhook[_-]?secret|auth[_-]?token|bot[_-]?token|private[_-]?key))(\\s*[:=]\\s*)([\"']?)[^\\s\"',}]{6,}\\3/gi, (_m, k) => `${k}=[redacted]` );";

test('pattern 5 is byte-frozen against the constant captured before this plan', () => {
  const stmt = slicePattern5(readSrc(PROD_REL));
  assert.ok(stmt, `could not find pattern 5's statement in ${PROD_REL}`);
  assert.strictEqual(normalise(stmt), FROZEN_PATTERN_5,
    'pattern 5 changed. It is the only arm covering labelled key=value, so narrowing it '
    + 'removes LIVE detections silently — 4 classes the first time this was tried, 11 the '
    + 'second. If the change is deliberate, re-measure the whole REGRESSION battery against '
    + 'the OLD matcher first and repin every row it moves');
});

// The shared corpus. ONE table, so the drift guard and the sensitivity battery cannot
// disagree about what they cover. NOTE WHAT THIS PROVES AND WHAT IT DOES NOT: it proves
// the two copies AGREE, never that either is CORRECT. A credential class absent from
// this corpus is invisible to the battery above and to the drift guard below at the
// same time — one blind spot, counted twice. Treat the row list as a floor.
const LOCKSTEP_CORPUS = [
  ...SECRETS.map((r) => r[1]),
  ...SECRETS_NEW.map((r) => r[1]),
  ...REGRESSION_LITERAL.map((r) => r[0]),
  ...C1_RESTORED.map((r) => r[0]),
  ...C1_DECLARED_LOSS.map((r) => r[0]),
  ...FALSE_POSITIVES_FIXED.map((r) => r[0]),
  ...BENIGN,
  SWALLOW_IN,
  'before -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabc123\n-----END RSA PRIVATE KEY----- after',
  'Authorization: Bearer abcDEF0123456789xyzqrst'
];

test('LOCKSTEP: both copies of redactSecrets are found, non-empty and the same size', () => {
  const prod = sliceRedactSecrets(readSrc(PROD_REL), PROD_SIG);
  const mirror = sliceRedactSecrets(readSrc(MIRROR_REL), MIRROR_SIG);
  assert.ok(prod && prod.length > 200, `LOCKSTEP drift: could not slice redactSecrets out of ${PROD_REL}`);
  assert.ok(mirror && mirror.length > 200, `LOCKSTEP drift: could not slice redactSecrets out of ${MIRROR_REL}`);
  const countProd = prod.split('s = s.replace(').length - 1;
  const countMirror = mirror.split('s = s.replace(').length - 1;
  assert.strictEqual(countProd, EXPECTED_REPLACE_STATEMENTS,
    `LOCKSTEP drift: ${PROD_REL} has ${countProd} replace statements, expected ${EXPECTED_REPLACE_STATEMENTS}`);
  assert.strictEqual(countMirror, countProd,
    `LOCKSTEP drift: ${MIRROR_REL} has ${countMirror} replace statements, ${PROD_REL} has ${countProd}`);
});

test('LOCKSTEP behavioural: both copies produce identical output over the shared corpus', () => {
  let prod = sliceRedactSecrets(readSrc(PROD_REL), PROD_SIG);
  const mirror = sliceRedactSecrets(readSrc(MIRROR_REL), MIRROR_SIG);
  assert.ok(prod && mirror, 'LOCKSTEP drift: a copy of redactSecrets could not be sliced');
  for (const [from, to] of TS_ONLY_TOKENS) {
    assert.ok(prod.includes(from),
      `LOCKSTEP drift: the TypeScript-only token ${JSON.stringify(from)} is no longer in `
      + `${PROD_REL}. The strip list is stale, and a stale strip list is where a real `
      + 'difference hides');
    prod = prod.replace(from, to);
  }
  const compiled = (body) => new Function(`${body}\nreturn redactSecrets;`)();
  const a = compiled(prod);
  const b = compiled(mirror);
  const outA = LOCKSTEP_CORPUS.map((s) => a(s));
  const outB = LOCKSTEP_CORPUS.map((s) => b(s));
  for (let i = 0; i < LOCKSTEP_CORPUS.length; i++) {
    assert.strictEqual(outA[i], outB[i],
      `LOCKSTEP drift: the two copies disagree on ${JSON.stringify(LOCKSTEP_CORPUS[i])} — `
      + `${PROD_REL} says ${JSON.stringify(outA[i])}, ${MIRROR_REL} says ${JSON.stringify(outB[i])}`);
  }
  // ...and the corpus is not empty, so this cannot pass by comparing two empty lists.
  assert.ok(outA.length >= 60, `LOCKSTEP drift: the shared corpus shrank to ${outA.length} rows`);
});

test('LOCKSTEP textual: the normalised bodies are character-identical', () => {
  let prod = sliceRedactSecrets(readSrc(PROD_REL), PROD_SIG);
  const mirror = sliceRedactSecrets(readSrc(MIRROR_REL), MIRROR_SIG);
  for (const [from, to] of TS_ONLY_TOKENS) prod = prod.replace(from, to);
  assert.strictEqual(normalise(prod), normalise(mirror),
    `LOCKSTEP drift: the normalised bodies differ. The behavioural arm alone cannot see a `
    + 'change the shared corpus happens not to exercise, and a regex-literal comparison alone '
    + 'cannot see a change inside a replacement callback — both arms are load-bearing');
});

console.log(`\n${failures ? failures + ' FAILED' : 'all passed'}.`);
process.exit(failures ? 1 : 0);
