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

module.exports = { stripComments, VENDOR_PATH, VENDOR_REL, root };
