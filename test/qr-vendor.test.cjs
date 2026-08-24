'use strict';

/**
 * The vetting gate for src/renderer/src/vendor/qrcodegen.ts — the only
 * executable code in phase 02 this repo did not write. It runs inside the
 * renderer, where `window.cth` is the entire IPC bridge to a floor of agent
 * CLIs with bypassed permissions: there is no sandbox between this file and
 * everything the operator can do. #57 ("msiexec ran on an unverified MSI",
 * `.github/workflows/ci.yml`) is this repo's own precedent for what happens
 * when a third-party artefact executes unverified — the reason every clause
 * here is a run, not a review, and the reason a hostile edit AND a silent
 * drift both have to go red.
 *
 * Every grep clause strips comments first. The vendored file's own retained
 * MIT header contains the word "document" (the canonical permission sentence
 * — "this software and associated documentation files") and the purity gate
 * bans `document` as a DOM-access pattern; a raw whole-file scan can only
 * satisfy one of those two mandates. Stripping comments before scanning is
 * what makes "ban `document` in code" and "keep the MIT text verbatim"
 * compatible instead of contradictory.
 *
 * The digest clause normalises CRLF -> LF and strips a leading BOM before
 * hashing, on both sides of the comparison. This repo's core.autocrlf=true
 * rewrites LF -> CRLF on every Windows checkout for any path .gitattributes
 * does not pin; `.gitattributes` now carries `*.ts text eol=lf`, which
 * already pins this file to LF on every platform (re-measured this session —
 * an earlier state of this repo had no .gitattributes at all). Normalising
 * anyway means the digest holds even if that pin is ever loosened, and the
 * comparison is never platform-dependent.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const VENDOR_PATH = path.join(root, 'src/renderer/src/vendor/qrcodegen.ts');
const VENDOR_REL = 'src/renderer/src/vendor/qrcodegen.ts';

/** Block comments stripped first, then line comments — sparing `https://`
 *  inside string literals via the `[^:]` guard, so a URL in a comment or a
 *  string does not get half-eaten and does not let `//` inside `https://`
 *  truncate the rest of the line. */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// ─── Clause 1: purity, both directions, over comment-stripped text ──────────

test('qrcodegen.ts: purity gate — no network/eval/DOM access (comment-stripped, both directions)', () => {
  const raw = fs.readFileSync(VENDOR_PATH, 'utf8');
  const s = stripComments(raw);
  const bans = [
    'fetch', 'XMLHttpRequest', 'sendBeacon', 'process.env',
    'eval', 'new Function', 'import(', 'document', 'window'
  ];
  for (const b of bans) {
    const count = s.split(b).length - 1;
    assert.equal(count, 0,
      `banned pattern "${b}" found ${count} time(s) in the vendored encoder's comment-stripped `
      + 'text — this file executes inside the renderer and must be pure computation only');
  }
  // Positive anchor (D-40): every ban above is also 0 on a zero-byte file and
  // on a strip regex that ate the whole file. These three floors are what
  // turn nine zeroes into a verdict instead of a vacuous pass.
  assert.ok(s.length > 1000,
    `stripped text is only ${s.length} chars — too short for a real QR encoder; an emptied `
    + 'file or an over-eager strip would pass every ban above vacuously');
  assert.ok(s.includes('class QrCode'),
    'stripped text has no `class QrCode` — the strip ate the whole file, or the vendoring is gone');
  assert.ok(s.includes('encodeText'),
    'stripped text has no `encodeText` — same failure mode as the `class QrCode` check above');
});

// ─── Clause 2: provenance present, each fact parsed (not "contains a colon") ─

test('qrcodegen.ts: provenance header — upstream, pinned commit, retrieval date, digest, MIT text', () => {
  const raw = fs.readFileSync(VENDOR_PATH, 'utf8');
  assert.match(raw, /UPSTREAM:\s*\S+/, 'no UPSTREAM: line naming the source project/repo');
  const commit = raw.match(/COMMIT:\s*([0-9a-f]{40})\b/);
  assert.ok(commit, 'no COMMIT: line carrying a 40-hex-character SHA (never `latest`/`master`, D-14)');
  const retrieved = raw.match(/RETRIEVED:\s*(\d{4}-\d{2}-\d{2})/);
  assert.ok(retrieved, 'no RETRIEVED: line carrying an ISO retrieval date');
  const digest = raw.match(/RETRIEVED-SHA256:\s*([0-9a-f]{64})\b/);
  assert.ok(digest, 'no RETRIEVED-SHA256: line carrying a 64-hex-character digest');
  assert.match(raw, /Permission is hereby granted, free of charge/,
    'the upstream MIT permission sentence is not retained verbatim');
});

// ─── Clause 3: digest matches the vendored slice's own bytes ────────────────

test('qrcodegen.ts: RETRIEVED-SHA256 matches the vendored slice (CRLF/BOM normalised)', () => {
  const raw = fs.readFileSync(VENDOR_PATH, 'utf8');
  const BEGIN = '// VENDORED (upstream, byte-identical) BEGIN';
  const END = '// VENDORED END';
  const beginIdx = raw.indexOf(BEGIN);
  const endIdx = raw.indexOf(END);
  assert.notEqual(beginIdx, -1, 'BEGIN sentinel not found — cannot slice the vendored region');
  assert.notEqual(endIdx, -1, 'END sentinel not found — cannot slice the vendored region');
  assert.ok(endIdx > beginIdx, 'END sentinel appears before BEGIN — the file is malformed');

  // The slice runs from immediately after the BEGIN sentinel's own line to
  // immediately before the END sentinel's own line; trim exactly the one
  // newline on each side that belongs to a sentinel line's own terminator,
  // never a byte of the vendored content itself.
  let slice = raw.slice(beginIdx + BEGIN.length, endIdx);
  if (slice.startsWith('\n')) slice = slice.slice(1);
  if (slice.endsWith('\n')) slice = slice.slice(0, -1);
  assert.ok(slice.trim().length > 0,
    'the sliced vendored region is empty — a zero-byte slice has a stable digest and would '
    + 'otherwise pass any comparison (D-40)');

  slice = slice.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const digest = crypto.createHash('sha256').update(slice, 'utf8').digest('hex');
  const headerDigest = raw.match(/RETRIEVED-SHA256:\s*([0-9a-f]{64})/)[1];
  assert.equal(digest, headerDigest,
    "the vendored slice's own digest does not match the header's RETRIEVED-SHA256 — a "
    + 'hostile edit or an unnoticed drift');
});

// ─── Clause 4: the vendored code has a production consumer ──────────────────
//
// `02-PATTERNS.md` § Shared Pattern 5 names the disease by name: "a test file
// is the only importer of a `src/shared` export" — capabilityLine's exact
// shape before 02-08 gave it one. This clause is the standing guard against
// the same thing happening to the encoder: at least one file under
// `src/renderer/src`, other than this test and the vendored file itself,
// must import it.

test('qrcodegen.ts: has a production consumer, not only this test', () => {
  const rendererRoot = path.join(root, 'src/renderer/src');
  const consumers = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (full === VENDOR_PATH) continue;
      const src = fs.readFileSync(full, 'utf8');
      if (/from ['"](\.\.\/)*vendor\/qrcodegen['"]/.test(src)) consumers.push(path.relative(root, full));
    }
  })(rendererRoot);
  assert.ok(consumers.length >= 1,
    'no file under src/renderer/src (other than the vendored file itself) imports vendor/qrcodegen '
    + '— the encoder has no production consumer, only this test');
});

// ─── Task 2: execute the encoder, and render the component that consumes it ─

const loadTs = require('./load-ts.cjs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// The binding probe value (02-UI-SPEC.md §S4a, D-14's live-measured label on
// cloudflared's fixed suffix): 48 characters, never a shorter invented host.
const PROBE_HOST = 'adams-medical-meeting-enormous.trycloudflare.com';
assert.equal(Buffer.byteLength(PROBE_HOST), 48, 'PROBE_HOST drifted off its measured 48 characters');
// A single-use enrollment token, base64url(32 random bytes) = 43 characters —
// the same shape `phone:pairing`'s real token takes (D-19).
const PROBE_TOKEN = crypto.randomBytes(32).toString('base64url');
assert.equal(PROBE_TOKEN.length, 43, 'PROBE_TOKEN drifted off its measured 43 characters');
const PROBE_PAYLOAD = `https://${PROBE_HOST}/phone/#${PROBE_TOKEN}`;

/** True where a standard QR finder pattern is dark at (dx,dy) inside its own
 *  7x7 box: a solid outer ring, a light ring one module in, a solid 3x3
 *  centre. Structural, not "a dark ring" eyeballed. */
function finderDarkAt(dx, dy) {
  if (dx < 0 || dx > 6 || dy < 0 || dy > 6) return false;
  if (dx === 0 || dx === 6 || dy === 0 || dy === 6) return true; // outer border
  if (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) return true; // inner 3x3
  return false; // the light ring in between
}

/** Assert the three finder patterns of a decoded QrCode instance. */
function assertFinderPatterns(qr, label) {
  const n = qr.size;
  const corners = [[0, 0], [n - 7, 0], [0, n - 7]];
  for (const [ox, oy] of corners) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        assert.equal(qr.getModule(ox + dx, oy + dy), finderDarkAt(dx, dy),
          `${label}: finder pattern at corner (${ox},${oy}) mismatches the standard shape `
          + `at offset (${dx},${dy})`);
      }
    }
  }
}

/** Count dark modules across the whole matrix. */
function darkCount(qr) {
  let count = 0;
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) count++;
    }
  }
  return count;
}

test('qrcodegen.ts executed: the probe payload decodes to a real module matrix', () => {
  const { qrcodegen } = loadTs(VENDOR_REL);
  const qr = qrcodegen.QrCode.encodeText(PROBE_PAYLOAD, qrcodegen.QrCode.Ecc.MEDIUM);
  const n = qr.size;
  assert.ok(n >= 21 && n <= 177 && (n - 17) % 4 === 0,
    `module count ${n} is not a valid QR version size (21..177, step 4)`);
  assertFinderPatterns(qr, 'real encoder');
  const dark = darkCount(qr);
  // Anti-stub assertion (D-40): an encoder replaced by a constant-returning
  // stub passes every structural check above except this one.
  assert.notEqual(dark, 0, 'zero dark modules — encodeText/getModule is stubbed to always return false');
  assert.notEqual(dark, n * n, 'every module dark — encodeText/getModule is stubbed to always return true');
});

test('qrcodegen.ts executed: two different payloads produce two different matrices', () => {
  const { qrcodegen } = loadTs(VENDOR_REL);
  const qrA = qrcodegen.QrCode.encodeText(PROBE_PAYLOAD, qrcodegen.QrCode.Ecc.MEDIUM);
  const qrB = qrcodegen.QrCode.encodeText(PROBE_PAYLOAD + 'x', qrcodegen.QrCode.Ecc.MEDIUM);
  const flatten = (qr) => {
    const bits = [];
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) bits.push(qr.getModule(x, y) ? 1 : 0);
    return bits.join('');
  };
  assert.notEqual(flatten(qrA), flatten(qrB), 'two different payloads produced byte-identical matrices');
});

test('QrCode.tsx: renders one accessible inline SVG, module count derived from the same matrix', () => {
  const { qrcodegen } = loadTs(VENDOR_REL);
  const qr = qrcodegen.QrCode.encodeText(PROBE_PAYLOAD, qrcodegen.QrCode.Ecc.MEDIUM);
  const expectedDark = darkCount(qr);
  const expectedDim = qr.size + 8;

  const { QrCode } = loadTs('src/renderer/src/components/QrCode.tsx');
  const markup = renderToStaticMarkup(React.createElement(QrCode, { text: PROBE_PAYLOAD }));

  const svgOpenTags = markup.match(/<svg\b/g) || [];
  assert.equal(svgOpenTags.length, 1, `expected exactly one <svg, found ${svgOpenTags.length}`);
  assert.match(markup, /role="img"/, 'no role="img" on the rendered markup');
  assert.match(markup, /aria-label="Pairing QR code for the phone"/, 'aria-label missing or wrong');
  const viewBoxMatch = markup.match(/viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(viewBoxMatch, 'no viewBox attribute found');
  assert.equal(Number(viewBoxMatch[1]), expectedDim, 'viewBox width does not equal module count + 8');
  assert.equal(Number(viewBoxMatch[2]), expectedDim, 'viewBox height does not equal module count + 8');
  assert.match(markup, /<rect[^>]*fill="#FFFFFF"/, 'no #FFFFFF background rect');
  const rectTags = markup.match(/<rect\b/g) || [];
  assert.equal(rectTags.length, expectedDark + 1,
    `expected ${expectedDark + 1} <rect> elements (${expectedDark} dark modules + 1 background), `
    + `found ${rectTags.length}`);
});

test('QrCode.tsx: an oversized payload renders null rather than throwing (trust-boundary guard)', () => {
  const { QrCode } = loadTs('src/renderer/src/components/QrCode.tsx');
  const oversized = 'x'.repeat(3000);
  const markup = renderToStaticMarkup(React.createElement(QrCode, { text: oversized }));
  assert.equal(markup, '', `expected null render (empty markup) for a 3000-char payload, got ${markup.length} chars`);
});

// ─── Task 3: the pairing link's only two sanctioned sinks ───────────────────
//
// The QR is the ONLY sanctioned rendering of the pairing link, so the
// assertion that no second rendering exists lives beside the component that
// provides the sanctioned one, over joined, comment-stripped SettingsModal.tsx.

test('SettingsModal.tsx: the pairing link reaches only <QrCode text> and copyToClipboard, never text', () => {
  const raw = fs.readFileSync(path.join(root, 'src/renderer/src/components/SettingsModal.tsx'), 'utf8');
  const s = stripComments(raw).replace(/\s+/g, ' ');
  const posQr = (s.match(/<QrCode\b[^>]*text=\{pairingLink\}/g) || []).length;
  const posCopy = (s.match(/copyToClipboard\(pairingLink\)/g) || []).length;
  assert.ok(posQr >= 1, 'pairingLink never reaches <QrCode text={pairingLink}>');
  assert.ok(posCopy >= 1, 'pairingLink never reaches copyToClipboard(pairingLink)');
  assert.equal((s.match(/value=\{pairingLink\}/g) || []).length, 0,
    'pairingLink is bound to a value={…} — the credential must never be selectable input text');
  assert.equal((s.match(/>\s*\{pairingLink\}\s*</g) || []).length, 0,
    'pairingLink appears as a bare JSX text child');
  assert.equal((s.match(/title=\{[^}]*pairingLink/g) || []).length, 0,
    'pairingLink appears inside a title= attribute');
  assert.equal((s.match(/<code>[^<]*\{pairingLink\}/g) || []).length, 0,
    'pairingLink appears inside a <code> element');
});

// ─── Task 3: the QR is a permanent region, never behind a dismissal ─────────

test('SettingsModal.tsx: the tunnel panel QR is permanent, keyed, and never behind a toggle', () => {
  const raw = fs.readFileSync(path.join(root, 'src/renderer/src/components/SettingsModal.tsx'), 'utf8');
  const s = stripComments(raw).replace(/\s+/g, ' ');
  const el = s.match(/<QrCode\b[^>]*>/g) || [];
  const keyed = el.filter((t) => /key=\{/.test(t) && /text=\{/.test(t));
  assert.ok(el.length >= 1, 'no <QrCode> element found in the tunnel panel');
  assert.equal(keyed.length, el.length,
    'a <QrCode> is rendered without both key={…} and text={…} — React could keep a stale '
    + 'matrix mounted across a host change');
  assert.equal((s.match(/show ?qr|hideQr|qrOpen|showQr/gi) || []).length, 0,
    'a show/hide-QR toggle idiom was found — the QR must be a permanent region with no dismissal');
});

// ─── Task 5: the tunnel stays off by default (DAEMON-05, re-proven here) ────
//
// The other four DAEMON-05 clauses (generated token, rate limit + lockout,
// stop() genuinely closing) are proven live in test/webhook-endpoints.test.cjs
// and test/tunnel.test.cjs (re-run this session, see 02-10-SUMMARY.md for the
// commands and their output). This is the fifth: the parsed config DEFAULT,
// not a line-oriented grep, so a config shape that renamed the field around a
// stale grep cannot pass silently. Both directions: the default is
// absent-or-false (negative) AND the key exists at all (positive) — deleting
// the key must not satisfy the clause.

test('config.ts: tunnelEnabled defaults to false and the key genuinely exists (parsed, not grepped)', () => {
  const fsNode = require('node:fs');
  const osNode = require('node:os');
  const userData = fsNode.mkdtempSync(path.join(osNode.tmpdir(), 'md-p10-tunnel-default-'));
  const electronId = require.resolve('electron');
  const priorElectron = require.cache[electronId];
  require.cache[electronId] = {
    id: electronId, filename: electronId, loaded: true,
    exports: {
      app: { getPath: () => userData },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s) => Buffer.from(`enc:${s}`, 'utf8'),
        decryptString: (b) => b.toString('utf8').replace(/^enc:/, '')
      }
    }
  };
  try {
    // A fresh cache entry so this file's own config.ts load is not poisoned
    // by another test's electron stub or a previous readConfig() call.
    for (const key of Object.keys(require.cache)) {
      if (key.endsWith(path.join('src', 'main', 'config.ts'))) delete require.cache[key];
    }
    const { readConfig } = require('./load-ts.cjs')('src/main/config.ts');
    const cfg = readConfig();
    assert.ok('tunnelEnabled' in cfg, 'the tunnelEnabled key is entirely absent from a freshly-read config — deleting it must not satisfy this clause');
    assert.equal(cfg.tunnelEnabled, false, `tunnelEnabled defaults to ${cfg.tunnelEnabled}, not false — the tunnel must be off on a fresh install`);
  } finally {
    if (priorElectron) require.cache[electronId] = priorElectron; else delete require.cache[electronId];
    fsNode.rmSync(userData, { recursive: true, force: true });
  }
});

module.exports = { stripComments, VENDOR_PATH, VENDOR_REL, root, PROBE_HOST, PROBE_TOKEN, PROBE_PAYLOAD };
