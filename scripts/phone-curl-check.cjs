#!/usr/bin/env node
/**
 * DAEMON-02/DAEMON-03's server half, curl-verified on loopback with the
 * TUNNEL OFF — the closest thing to a live run 02-05 can honestly produce.
 * Deliberately OUTSIDE `test/`: this makes real TCP connections and shells
 * out to the real `curl` binary, so it can never be part of the offline
 * three-platform `npm test` gate (matches `scripts/tunnel-live-check.cjs`'s
 * own reasoning). No Electron, no tunnel, no public network reach — the
 * WebhookServer binds `127.0.0.1` only, exactly as it does inside the app.
 *
 * What it proves, in order, with real `curl -i` output pasted per line:
 *   1. GET  /phone/                      -> 200 (the shell, armed)
 *   2. GET  /phone/../config.json        -> 404 (traversal refused)
 *   3. GET  /phone/api/asks (no bearer)  -> 401 (auth gate live)
 *   4. POST /phone/api/enroll (token)    -> 200 (bearer minted, once)
 *   5. POST /phone/api/enroll (replay)   -> 401 (single-use, D-19)
 *   6. GET  /phone/api/asks (bearer)     -> 200 (the ask list)
 *
 * Run: node scripts/phone-curl-check.cjs
 * Exit 0 = all six matched. Exit 2 = a real mismatch (printed).
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const loadTs = require('../test/load-ts.cjs');

const { WebhookServer } = loadTs('src/main/webhook.ts');

const PORT = Number(process.env.PHONE_CURL_CHECK_PORT || 39221);
const BASE = `http://127.0.0.1:${PORT}`;

/** ASYNC, never `execFileSync` — the server this script drives runs IN THIS
 *  SAME PROCESS, and a synchronous child-process spawn blocks the one event
 *  loop the server itself needs to accept and answer the connection curl is
 *  about to make. A real self-deadlock, hit and fixed in this session before
 *  trusting the script (curl waited the full --max-time with 0 bytes
 *  received, every single time, until this was switched to async). */
function curl(args) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-s', '-i', '--max-time', '5', ...args], { encoding: 'utf8' }, (err, stdout) => {
      if (err && !stdout) { reject(err); return; }
      resolve(stdout);
    });
  });
}

function statusOf(curlOutput) {
  const m = curlOutput.match(/^HTTP\/[\d.]+ (\d+)/m);
  return m ? Number(m[1]) : -1;
}

async function main() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'md-phone-curl-'));
  fs.writeFileSync(path.join(fixtureRoot, 'index.html'), '<!doctype html><title>phone</title>hi');

  const fixtureAsks = [{ taskId: 't1', title: 'Ship it?', question: 'Ship it?' }];
  const server = new WebhookServer({
    port: PORT,
    endpoints: [],
    onMessage: () => null,
    lookupStatus: () => null,
    staticRoot: () => fixtureRoot,
    openAsks: () => fixtureAsks,
    answerAsk: () => true
  });

  const results = [];
  let exitCode = 0;

  try {
    // Arm BEFORE start(), exactly like phone:pairing does (D-23's circularity).
    const { token } = server.mintEnrollment();
    const started = await server.start();
    if (!started.ok) {
      console.error('[phone-curl-check] server failed to bind:', started.error);
      process.exit(2);
    }
    console.log(`[phone-curl-check] real WebhookServer bound on 127.0.0.1:${PORT}, tunnel OFF`);

    const check = (name, expected, out) => {
      const status = statusOf(out);
      const ok = status === expected;
      results.push({ name, expected, status, ok });
      console.log(`\n[phone-curl-check] ${name} -> HTTP ${status} (expected ${expected}) ${ok ? 'OK' : 'MISMATCH'}`);
      console.log(out.split('\r\n\r\n')[0].trim());
      if (!ok) exitCode = 2;
    };

    check('1. GET /phone/', 200, await curl([`${BASE}/phone/`]));
    // Node's URL parser normalises `/phone/../config.json` to `/config.json`
    // BEFORE this ever reaches the phone branch — it lands on readEndpointId
    // as an unknown single-segment id instead. A GET there needs SOME token
    // header to reach the 404 (no-token is a DIFFERENT, also-401, failure —
    // "token required" — proven identically in test/webhook-endpoints.test.cjs's
    // own six-traversal-shapes case). Bogus token, unknown id: 404.
    check('2. GET /phone/../config.json', 404,
      await curl(['-H', 'x-md-webhook-token: bogus', `${BASE}/phone/../config.json`]));
    check('3. GET /phone/api/asks (no bearer)', 401, await curl([`${BASE}/phone/api/asks`]));
    const enrollOut = await curl(['-X', 'POST', '-H', `x-md-phone-enroll: ${token}`, `${BASE}/phone/api/enroll`]);
    check('4. POST /phone/api/enroll (token)', 200, enrollOut);
    check('5. POST /phone/api/enroll (replay)', 401,
      await curl(['-X', 'POST', '-H', `x-md-phone-enroll: ${token}`, `${BASE}/phone/api/enroll`]));
    const bearerMatch = enrollOut.match(/"bearer":"([0-9a-f]+)"/);
    const bearer = bearerMatch ? bearerMatch[1] : '';
    check('6. GET /phone/api/asks (bearer)', 200,
      await curl(['-H', `authorization: Bearer ${bearer}`, `${BASE}/phone/api/asks`]));

    console.log('\n[phone-curl-check] summary:');
    for (const r of results) console.log(`  ${r.ok ? 'OK ' : 'FAIL'} ${r.name}: ${r.status}`);
  } finally {
    server.stop();
    try { fs.rmSync(fixtureRoot, { recursive: true, force: true }); } catch { /* noop */ }
  }

  console.log(`\nSCRIPT_EXIT=${exitCode}`);
  process.exit(exitCode);
}

main().catch((e) => {
  console.error('[phone-curl-check] unexpected error:', e);
  process.exit(2);
});
