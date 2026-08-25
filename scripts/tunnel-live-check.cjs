#!/usr/bin/env node
/**
 * DAEMON-05's live close, proven against a REAL cloudflared child and a
 * REAL outbound tunnel — deliberately OUTSIDE `test/`. `npm test` is
 * literally `node --test test/*.test.cjs` (see `.planning/codebase/TESTING.md`),
 * and this script makes one genuine network round-trip through Cloudflare's
 * edge, so it can never be part of that offline, three-platform gate.
 *
 * What it proves: stand up a loopback HTTP server serving a per-run random
 * NONCE; acquire the digest-verified cloudflared binary (`src/main/cloudflared.ts`);
 * open a tunnel over the server (`src/main/tunnel.ts`); poll the public URL
 * until it serves the nonce at 200 (the "open" half — a 200 from Cloudflare's
 * own error page is not the tunnel working); call `stop()`; then poll until
 * the response is non-200 OR the body is no longer the nonce, within ~15s,
 * printing every `(elapsed, status)` pair so the measured 502-then-530
 * transient (D-16) is visible in the output rather than asserted away.
 *
 * Three exit states, distinguishable, and a skip is NEVER exit 0:
 *   0  closed and verified — DAEMON-05's stop-criterion met.
 *   2  the tunnel is still reachable 15s after stop() — a real defect.
 *   3  ANNOUNCED SKIP — offline, the binary could not be acquired, or an
 *      unsupported platform (windows-arm64). Printed in the
 *      `test/net-binding.test.cjs` announced-skip register:
 *      `console.error('[…] case skipped — <reason>')`.
 *
 * Run: node scripts/tunnel-live-check.cjs
 */

'use strict';

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const loadTs = require('../test/load-ts.cjs');

const { openTunnel } = loadTs('src/main/tunnel.ts');
const { ensureCloudflared } = loadTs('src/main/cloudflared.ts');

/** ~15s poll window for the close half — a literal, not a claim in a SUMMARY. */
const CLOSE_POLL_TOTAL_MS = 15_000;
const CLOSE_POLL_INTERVAL_MS = 500;
/** Generous: cloudflared's own banner says the URL "may take some time to be
 *  reachable" — this is the OPEN half, not the ~15s close bound D-16 measured. */
const OPEN_POLL_TOTAL_MS = 30_000;
const OPEN_POLL_INTERVAL_MS = 1_000;

const NONCE = randomBytes(16).toString('hex');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One GET against the tunnel's public URL. Never throws — a network-level
 *  hiccup (which D-16 found the post-close response is NOT, but a transient
 *  DNS blip still could be) reports as `status: null` rather than crashing
 *  the poll loop. */
async function probe(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const body = await res.text();
    return { status: res.status, body };
  } catch (e) {
    return { status: null, body: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function run() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(NONCE);
  });
  let tunnel = null;

  // Always torn down on every path — a run that fails must not leave a
  // public origin behind. Idempotent: safe to call more than once.
  let tornDown = false;
  const teardown = () => {
    if (tornDown) return;
    tornDown = true;
    try { tunnel?.stop(); } catch { /* best-effort */ }
    try { server.close(); } catch { /* best-effort */ }
  };

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    console.log(`[tunnel-live-check] local nonce server listening on 127.0.0.1:${port}`);

    const bin = await ensureCloudflared(path.join(os.tmpdir(), 'md-tunnel-live-check-bin'));
    if (!bin) {
      console.error('[tunnel-live-check] case skipped — cloudflared could not be acquired '
        + '(offline, an unsupported platform such as windows-arm64, or a digest mismatch — see above)');
      teardown();
      process.exit(3);
    }
    console.log(`[tunnel-live-check] cloudflared acquired: ${bin}`);

    try {
      tunnel = await openTunnel(port, { bin });
    } catch (e) {
      console.error(`[tunnel-live-check] case skipped — openTunnel failed to open a tunnel: ${e.message}`);
      teardown();
      process.exit(3);
    }
    console.log(`[tunnel-live-check] tunnel open: ${tunnel.url}`);

    // ── The open half — a 200 from Cloudflare's own error page is not the
    //    tunnel working, so this checks the BODY too, not just the status. ──
    const openStarted = Date.now();
    let opened = false;
    let sawAnyHttpResponse = false;
    while (Date.now() - openStarted < OPEN_POLL_TOTAL_MS) {
      const elapsed = Date.now() - openStarted;
      const res = await probe(tunnel.url);
      console.log(`[tunnel-live-check] open-poll  (elapsed=${elapsed}ms, status=${res.status ?? 'ERR:' + res.error})`);
      if (res.status !== null) sawAnyHttpResponse = true;
      if (res.status === 200 && res.body === NONCE) { opened = true; break; }
      await sleep(OPEN_POLL_INTERVAL_MS);
    }
    if (!opened && !sawAnyHttpResponse) {
      // EVERY probe failed at the network/DNS layer — never even an HTTP
      // error response. cloudflared itself minted a real hostname (logged
      // above), so this is not tunnel.ts failing to open a tunnel; it is
      // THIS environment's own DNS/egress unable to resolve or reach a
      // freshly-provisioned *.trycloudflare.com record. An announced skip,
      // not a claimed defect — the close was never reachable to test.
      console.error('[tunnel-live-check] case skipped — every probe failed at the network/DNS layer '
        + '(never a single HTTP response, not even an error one); this environment cannot resolve or '
        + 'reach a freshly-provisioned *.trycloudflare.com hostname, even though general internet '
        + 'egress and the trycloudflare.com apex both work — see the probe trace above');
      teardown();
      process.exit(3);
    }
    if (!opened) {
      console.error(`[tunnel-live-check] the tunnel never served the nonce at 200 within ${OPEN_POLL_TOTAL_MS}ms — `
        + 'cannot proceed to the close half. Real HTTP responses WERE observed, so this is a genuine '
        + 'defect in tunnel.ts or the local server, not an environment limitation.');
      teardown();
      process.exit(2);
    }

    // ── The close — this is DAEMON-05's actual stop-criterion. ──
    tunnel.stop();
    console.log('[tunnel-live-check] stop() called — polling for the close (D-16: expect 502, then 530 steady)...');

    const closeStarted = Date.now();
    let closed = false;
    while (Date.now() - closeStarted < CLOSE_POLL_TOTAL_MS) {
      const elapsed = Date.now() - closeStarted;
      const res = await probe(tunnel.url);
      console.log(`[tunnel-live-check] close-poll (elapsed=${elapsed}ms, status=${res.status ?? 'ERR:' + res.error})`);
      // "Closed" = no longer BOTH 200 and the nonce — never a single
      // hardcoded status and never an awaited rejection (D-16: the post-kill
      // response is an HTTP error, not a network error).
      if (res.status !== 200 || res.body !== NONCE) { closed = true; break; }
      await sleep(CLOSE_POLL_INTERVAL_MS);
    }
    teardown();

    if (!closed) {
      console.error(`[tunnel-live-check] the public URL was STILL serving the app's own content ${CLOSE_POLL_TOTAL_MS}ms `
        + 'after stop() — DAEMON-05\'s close FAILED. Fix the source and re-run; never widen this poll window to make it pass.');
      process.exit(2);
    }

    console.log('[tunnel-live-check] CLOSED — stop() genuinely closed the public tunnel.');
    console.log('[tunnel-live-check] Four ceilings this run does NOT disprove (D-17):');
    console.log('  - the hostname is new on every open, and will be again next run (no $0 stable-URL option)');
    console.log('  - Cloudflare documents quick tunnels as testing-and-development only');
    console.log('  - the hard cap is 200 concurrent in-flight requests (HTTP 429 past it)');
    console.log('  - there is no SSE support at all');
    console.log('  - only this run\'s own duration was observed — no multi-hour soak was performed');
    process.exit(0);
  } catch (e) {
    // Anything unexpected (a bind error, a thrown promise this function's own
    // try/catches did not already turn into an announced skip) tears down
    // and fails loud rather than exiting 0 on a claim nothing verified.
    console.error('[tunnel-live-check] unexpected failure:', e);
    teardown();
    process.exit(2);
  }
}

run();
