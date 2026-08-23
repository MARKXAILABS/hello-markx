---
phase: 02-the-daemon-and-the-protocol
plan: 05
subsystem: infra
tags: [http, ed25519, node-crypto, webhook, pwa, telegram, discord, node-test]

# Dependency graph
requires:
  - phase: 02-the-daemon-and-the-protocol
    provides: "02-04's WebhookServer.startTunnel/stopTunnel seam and off-by-default start(); 02-11's api.platform preload field; 02-02's boot/deps composition root this plan's index.ts edits land on top of"
provides:
  - "src/main/webhook.ts — PHONE_PREFIX/PHONE_ASSETS routed ahead of readEndpointId off an exact-filename allowlist; the phone's own rate bucket + a shared auth bucket/lockout across /phone/api/**; mintEnrollment()/phoneArmed() single-use enrollment -> generated bearer; GET /phone/api/asks + POST /phone/api/answer behind the bearer; a per-endpoint verifier dispatch (shared-secret/telegram/discord) with Discord's buffer-then-verify inversion scoped to its own signature headers and adaptInbound() payload adapters"
  - "src/shared/triggers.ts — WebhookVerifier/WEBHOOK_VERIFIERS/DEFAULT_WEBHOOK_VERIFIER, RESERVED_ENDPOINT_IDS/isReservedEndpointId, WebhookTrigger.verifier?"
  - "src/main/index.ts — phoneRootPath()/ensureWebhookServerInstance()/openPhoneAsks()/answerPhoneAsk(); ipcMain.handle('phone:pairing', ...) returning { ok, url, host, token, expiresAt }; sanitizeWebhookTrigger refuses 'phone' and carries verifier"
  - "src/preload/index.ts — phonePairing() wrapper"
  - "src/renderer/src/components/triggers/WebhooksSection.tsx — the verifier chip + picker (UI-SPEC S4c)"
  - "scripts/phone-curl-check.cjs — a real, re-runnable loopback curl proof (outside npm test)"
affects: [02-09, 02-10, 02-12]

tech-stack:
  added: []
  patterns:
    - "Injected staticRoot/openAsks/answerAsk thunks keep webhook.ts at zero electron imports (D-23) — the packaged/dev resource split and the hive reach both live in index.ts, resolved through the same slackReplyScriptPath()-shaped pair"
    - "An injectable clock (now?: () => number) on WebhookServerOptions so enrollment-TTL and lockout tests move virtual time forward without sleeping a real node:test case"
    - "A phone-scoped auth bucket + consecutive-failure lockout shared across the whole /phone/api/** surface (enroll, asks, answer), distinct from the phone's own lighter static-shell bucket, both strictly below the global cap"

key-files:
  created:
    - scripts/phone-curl-check.cjs
  modified:
    - src/main/webhook.ts
    - src/shared/triggers.ts
    - src/main/index.ts
    - src/preload/index.ts
    - src/renderer/src/components/triggers/WebhooksSection.tsx
    - test/webhook-endpoints.test.cjs
    - test/repo-claims.test.cjs
    - test/boot-floor.test.cjs

key-decisions:
  - "phoneArmed()/mintEnrollment() were built as part of task 2 (not task 3 as the plan's prose implied), because task 2's own acceptance criteria — the armed 200 and the unarmed dark-state 404 — need SOME way to arm the phone, and the plan's own action text already says 'Task 2's dark-state branch reads this [phoneArmed()]'. Task 3 then layers the exchange endpoint, bearer verification and lockout on top of that already-existing state. Re-attributing which task's COMMIT a method landed in doesn't change file containment (still webhook.ts) or behaviour."
  - "The auth lockout is a SINGLE shared counter across all of /phone/api/** (enroll, asks, answer), not scoped to /enroll alone — 'Both are keyed globally' in the plan's own words, and a brute-force attacker can guess bearers exactly as cheaply as enrollment tokens, so scoping the lockout to enrollment only would have left the bearer-guessing path unlimited."
  - "reconcileWebhookServer() (index.ts) was given one line so it does not tear down a server the phone is keeping alive with zero webhook triggers configured, when the operator's last WEBHOOK trigger is disabled/deleted (Rule 2 — a real correctness gap discovered while wiring phone:pairing's server-reuse path, not written in the plan's own prose, but load-bearing for 'once paired, reachable for the life of the process')."
  - "Neither DAEMON-02, DAEMON-03 nor DAEMON-05 is marked complete in REQUIREMENTS.md. DAEMON-02 and DAEMON-05 are also declared by 02-09/02-10 (not yet landed) — the STRUCT-01/PARITY-03 trap. DAEMON-03 is declared only here, but its own live half is operator-supplied and unverified this session (no bot token, no Discord application), and its stated purpose ('so an operator can answer from their phone') has no phone UI to exercise it until 02-09/02-10 land — marking it now would be the same trap by a different name."

requirements-completed: []

duration: ~57min
completed: 2026-08-23
---

# Phase 02 Plan 05: The Daemon and the Protocol — the Phone's Door Summary

**A single-owner trust boundary in `src/main/webhook.ts`: `/phone/**` routed ahead of `readEndpointId` off a five-file exact-filename allowlist, a single-use enrollment token burned before its response and exchanged for a generated 192-bit bearer, a shared auth bucket + lockout across the phone's data API that engages and provably clears, and a per-endpoint verifier dispatch admitting Telegram's header compare and Discord's live-verified Ed25519 signature — all through `node:crypto` alone, zero new dependencies, `webhook.ts` still importing nothing from `electron`.**

## Performance

- **Duration:** ~57 min (commit span 21:54–22:51 IST; excludes upfront context-reading time)
- **Completed:** 2026-08-23
- **Tasks:** 5/5, plus 2 deviation-fix commits and 1 verification-script commit
- **Files modified:** 8 (1 created, 7 modified) across 8 commits

## Baselines re-measured this session (D-01 — plan 02-04 moved every line number the plan quoted)

**B-sha:** `a0a3b297be3ffde8b12e78899e7484aa6b1e1168` (recorded before any edit).

```
$ wc -l src/main/webhook.ts src/shared/triggers.ts test/webhook-endpoints.test.cjs \
  src/renderer/src/components/triggers/WebhooksSection.tsx src/main/index.ts src/preload/index.ts
   461 src/main/webhook.ts        (plan said 468)
   309 src/shared/triggers.ts     (plan said 309)
   269 test/webhook-endpoints.test.cjs  (plan said 257)
   283 src/renderer/src/components/triggers/WebhooksSection.tsx  (plan said 281)
  4739 src/main/index.ts          (plan said 5,812)
  1595 src/preload/index.ts       (plan said 1,535)
```

**B-cases** (`grep -c '^test('`): **13** (plan said 12). **B-ipc** (`grep -c 'ipcMain.handle('`): **159** (plan said 153 — 02-11 landed 6 more since plan time). **B-limits:**

```
120:const MAX_BODY_BYTES = 1024 * 1024; // 1 MB
122:const RATE_LIMIT = 120;
125:const PER_ENDPOINT_RATE_LIMIT = 60;
126:const RATE_WINDOW_MS = 60_000;
```

**B-suite** (TAP): `EXIT=0 / # tests 728 / # pass 721 / # fail 0 / # skipped 7` — matches the verification baseline handed to this executor exactly.

## Ed25519 round trip, live-verified THIS session before writing the Discord branch (D-01)

```
node version: v24.13.0
raw 32-byte pubkey hex (64 chars): 719ef790a4ea1a639528d83b46aa82a4c62e8540eb05d495913af089fe5a1dbf  len= 64
verify valid signature -> true
verify tampered body -> false
malformed key throws as expected: Failed to read asymmetric key
```
Generate → export SPKI DER → drop the 12-byte header → hex-encode 32 raw bytes → re-import through `302a300506032b6570032100` → `crypto.verify(null, data, key, sig)`. Exactly the shape `src/main/webhook.ts`'s `discordPublicKeyFrom`/`verifyDiscord` implement; the malformed-key throw is caught and answered as the uniform 401, never a 500 (proven in `test/webhook-endpoints.test.cjs`'s `not-a-key` case too).

## The `phone` reservation, driven RED before being trusted

Temporarily changed `setEndpoints`' guard to `if (false && isReservedEndpointId(e.id)) continue;`:
```
not ok 13 - phone is reserved and can never be minted as an operator endpoint id
```
Restored the real guard, re-ran green (`# pass 14 # fail 0` at that point in the file's growth), and confirmed the edit left no trace: `git diff -- src/main/webhook.ts | grep -c '^-.*continue'` → `0`.

## The five-way uniform-401 diff (D-19/D-24)

```
absent        -> 401 {"ok":false,"error":"unauthorized"}
wrong bearer   -> 401 {"ok":false,"error":"unauthorized"}
burned enroll  -> 401 {"ok":false,"error":"unauthorized"}
unknown route  -> 401 {"ok":false,"error":"unauthorized"}
$ diff absent.json wrong.json && diff absent.json burned.json && diff absent.json unknown-route.json \
    && diff wrong.json burned.json && diff wrong.json unknown-route.json && diff burned.json unknown-route.json
(every pairwise diff empty, all six comparisons exit 0)
```

## The curl proof — real loopback, tunnel OFF (`scripts/phone-curl-check.cjs`)

A real `WebhookServer` bound on `127.0.0.1`, no Electron, no tunnel, driven by the real `curl` binary (async `execFile` — see Deviations for the self-deadlock this caught before it shipped):

```
[phone-curl-check] real WebhookServer bound on 127.0.0.1:39221, tunnel OFF
1. GET /phone/                                -> HTTP 200 (expected 200) OK
2. GET /phone/../config.json (w/ bogus token) -> HTTP 404 (expected 404) OK
3. GET /phone/api/asks (no bearer)            -> HTTP 401 (expected 401) OK
4. POST /phone/api/enroll (token)             -> HTTP 200 (expected 200) OK
5. POST /phone/api/enroll (replay)            -> HTTP 401 (expected 401) OK
6. GET /phone/api/asks (bearer)               -> HTTP 200 (expected 200) OK
SCRIPT_EXIT=0
```
Re-runnable: `node scripts/phone-curl-check.cjs`. Case 2's request carries `x-md-webhook-token: bogus` — Node's own `URL` parser normalises `/phone/../config.json` to `/config.json` *before* this ever reaches the phone branch (verified directly: `new URL('/phone/../config.json','http://localhost').pathname` → `/config.json`), so it lands on `readEndpointId` as an unknown single-segment id; a GET there needs some token header to reach the 404 rather than "token required" — proven identically in the six-traversal-shapes unit test.

## Six traversal shapes, all refused (`test/webhook-endpoints.test.cjs`)

`/phone/../config.json`, `/phone/..%2fconfig.json`, `/phone/%2e%2e/config.json`, `/phone/sub/dir/index.html`, `/phone/./../../package.json`, `/phone/index.html%00.png` — all six 404, none returning file bytes (`six traversal shapes are refused, none returning file bytes` — passing). The allowlist is the mechanism: the file's only `join()` call joins `PHONE_ASSETS[key].file` (the allowlist entry's own field), never a request-derived string.

## `PHONE_ASSETS` key list (heading plan 02-09 can grep)

```
["index.html","sw.js","manifest.webmanifest","icon-192.png","icon-512.png"]
```
Exported from `src/main/webhook.ts`, frozen. Every key matches `/^[a-z0-9][a-z0-9.-]*$/`; `staticRoot()` returning `null` (no `resources/phone/` yet) 404s and never throws.

## `phone:pairing`'s return shape — cross-wave contract for plan 02-10

```ts
ipcMain.handle('phone:pairing', async () =>
  ({ ok: true, url: string, host: string, token: string, expiresAt: number })
  // or { ok: false, error: string } — no tunnel up, or the local server failed to bind
);
```
`url` = `<publicUrl>/phone/#<token>` — the enrollment token rides the URL **fragment**, never a query param. Order, computed not eyeballed: handler at `index.ts:4034`, `mintEnrollment()` call at `:4036`, `startWebhookServer(...)` call at `:4038` — arms strictly before it binds. `phone:pairing` does not open the tunnel itself; `{ ok:false }` with a reason is returned when no public tunnel is up yet, rather than a URL the operator cannot use.

## `LIVE-UNVERIFIED` markers (heading plan 02-12 can grep)

`grep -c 'LIVE-UNVERIFIED' src/main/webhook.ts` → **3** (both payload adapters in `adaptInbound` + the Discord signature branch's own doc comment — neither Telegram nor Discord has been run against a real bot token or a real Discord application). Plan 02-01/02-07's `hive.ts`-family ledger is unaffected: `grep -rl 'LIVE-UNVERIFIED' src/main --include='hive*.ts'` → `hive.ts hiveProvisioning.ts hiveTemplates.ts`, sum **11**, unchanged by this plan (webhook.ts is not in that glob). `test/repo-claims.test.cjs`'s separate **repo-wide** ledger (`MARKER_LEDGER`, covering every `.ts`/`.tsx` under `src/`, not just the `hive*` family) legitimately needed `'src/main/webhook.ts': 3` added — see Deviations.

## Task Commits

1. **Task 1: shared verifier contract + reserved phone prefix** — `875e183` (feat)
2. **Task 2: `/phone/**` routing, static allowlist, phone rate bucket** — `4acbc44` (feat)
3. **Task 3: enrollment->bearer exchange, auth lockout, phone data endpoints** — `94222f0` (feat)
4. **Task 4: per-endpoint verifier strategy (Telegram/Discord/adapters)** — `fb1c0e9` (feat)
   - **[Rule 1 - Bug] PARITY-03's repo-wide LIVE-UNVERIFIED ledger** — `07889df` (fix, separate commit)
   - **[Rule 1 - Bug] boot-floor's D-40 IPC ledger pin** — `2543584` (fix, separate commit)
5. **Task 5: wire the door (index.ts/preload/UI)** — `8577748` (feat)
6. **The curl-verifiable loopback proof script** — `5a26904` (feat)

## Files Created/Modified

- `src/main/webhook.ts` — the whole server contract: `PHONE_PREFIX`/`PHONE_ASSETS`, the phone/auth buckets, `mintEnrollment`/`phoneArmed`, `handlePhone*`, the verifier dispatch (`verifySharedSecret`/`verifyTelegram`/`verifyDiscord`), `readBody`/`finishCreate`, `adaptInbound`, `discordPublicKeyFrom`. Zero `electron` imports throughout (re-checked after every task).
- `src/shared/triggers.ts` — `WebhookVerifier`/`WEBHOOK_VERIFIERS`/`DEFAULT_WEBHOOK_VERIFIER`, `RESERVED_ENDPOINT_IDS`/`isReservedEndpointId`, `WebhookTrigger.verifier?`.
- `src/main/index.ts` — `phoneRootPath()`, `ensureWebhookServerInstance()` (split out of `startWebhookServer` so pairing can arm before binding), `openAskOf`/`openPhoneAsks`/`answerPhoneAsk`, `startWebhookServer({forPhone?})`, `reconcileWebhookServer`'s phone-aware guard, `ipcMain.handle('phone:pairing', ...)`, `sanitizeWebhookTrigger`'s reservation + `verifier` carry-through.
- `src/preload/index.ts` — `phonePairing()` wrapper. `api.platform` was already present (landed by 02-11) — confirmed via `JS src/preload/index.ts | grep -o 'platform: process.platform' | wc -l` → `1`, not re-added.
- `src/renderer/src/components/triggers/WebhooksSection.tsx` — one `<code>` verifier chip reusing `POST TO`'s own boxed-mono style object (`postToBoxStyle`, lifted into a shared const), a `VerifierPicker` beside `TRUST`, and a per-verifier `SECRET` hint. +57/-8 lines — within S4c's narrow scope.
- `test/webhook-endpoints.test.cjs` — grew from 13 to 39 top-level cases (routing, static allowlist, traversal, dark state, phone bucket, enrollment lifecycle, lockout, Discord/Telegram verifiers, the request-keyed inversion, the mode gate on an adapted message).
- `test/repo-claims.test.cjs` (deviation) — `MARKER_LEDGER` gained `'src/main/webhook.ts': 3`.
- `test/boot-floor.test.cjs` (deviation) — `B_IPC_JOINED` 158→159; `'phone:pairing'` inserted in sorted position.
- `scripts/phone-curl-check.cjs` (new) — the real curl proof, outside `npm test`.

## Decisions Made

See `key-decisions` in frontmatter. Summarized:
1. `phoneArmed()`/`mintEnrollment()` landed in task 2's commit rather than task 3's, because task 2's own acceptance criteria need an armed state to exist — a re-attribution of which commit a method lands in, not a scope or behaviour change.
2. The auth lockout counter is shared across the whole `/phone/api/**` surface, not scoped to `/enroll` alone — closes the bearer-brute-force path the narrower reading would have left open.
3. `reconcileWebhookServer()` now checks `phoneArmed()` before tearing a server down on an empty webhook-trigger list (Rule 2 — see Deviations).
4. None of DAEMON-02/03/05 marked complete — see key-decisions and the `<verification>` section below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `reconcileWebhookServer()` would tear down a phone-armed server**
- **Found during:** Task 5, while wiring `phone:pairing`'s reuse-or-start path
- **Issue:** `reconcileWebhookServer()` (called from `webhooks:save`/`webhooks:delete`) unconditionally called `stopWebhookServer()` whenever the enabled webhook-trigger list became empty. If the phone had armed the server with zero webhook triggers configured (D-23's own circularity), disabling or deleting the operator's last unrelated webhook trigger would silently kill the phone's door mid-session — undermining "once paired, reachable for the life of the process."
- **Fix:** `reconcileWebhookServer()` now checks `webhookServer?.phoneArmed()` before stopping; an armed-but-triggerless server is re-pointed (`setEndpoints([])`) instead of stopped.
- **Files modified:** `src/main/index.ts` (already in task 5's declared `files_modified`).
- **Verification:** `npm run typecheck` exit 0; behaviour is a one-line guard on an existing code path — no test file loads `index.ts` under `node --test` (documented main-file limitation, same as D-39's answer-path check below).
- **Committed in:** `8577748` (task 5's own commit).

**2. [Rule 1 - Bug] `test/repo-claims.test.cjs`'s PARITY-03 repo-wide ledger went stale**
- **Found during:** Task 4, whole-suite verification after adding Discord/Telegram's `LIVE-UNVERIFIED` markers
- **Issue:** `MARKER_LEDGER` pins BOTH a per-file count AND a repo-wide total across every `.ts`/`.tsx` under `src/`. Task 4's 3 new markers in `src/main/webhook.ts` (a file the ledger did not list) inflated the repo-wide total without inflating the ledger's own sum, failing `PARITY-03: the LIVE-UNVERIFIED ledger is pinned exactly, per file and repo-wide (D-35/D-40)` — exactly the drift class that assertion exists to catch.
- **Fix:** Added `'src/main/webhook.ts': 3` to `MARKER_LEDGER`; every other entry re-measured unchanged (`hive.ts`:3, `hiveProvisioning.ts`:5, `hiveTemplates.ts`:3, `index.ts`:1, `agentProvider.ts`:2).
- **Files modified:** `test/repo-claims.test.cjs` (NOT in this plan's declared `files_modified` — per the plan's own `<interfaces>` table, this file belongs to plan 02-12).
- **Verification:** full suite `753/746/0 fail/7 skipped` after the fix (was failing 1 before it).
- **Committed in:** `07889df` (separate commit, per the 02-04/02-11 precedent for a pre-existing repo-fact ledger a legitimate addition is obligated to update).

**3. [Rule 1 - Bug] `test/boot-floor.test.cjs`'s D-40 IPC ledger pin went stale**
- **Found during:** Task 5, immediately after adding the `phone:pairing` IPC handler
- **Issue:** The joined/comment-stripped `ipcMain.handle(` count and sorted channel-name list are pinned exactly (158 at this plan's start). Adding `phone:pairing` without updating it breaks two assertions.
- **Fix:** `B_IPC_JOINED` 158→159; `'phone:pairing'` inserted in sorted position between `'org:setTrigger'` and `'providerKey:clear'`. Re-measured both the joined-stripped form (159) and the raw `grep -c` form (160 — the file has carried a pre-existing +1 raw/joined discrepancy since before this plan, documented and reproduced, not introduced here).
- **Files modified:** `test/boot-floor.test.cjs` (not in task 5's declared list).
- **Verification:** `node --test test/boot-floor.test.cjs` → `# pass 19 # fail 0`.
- **Committed in:** `2543584` (separate commit, same precedent).

**4. [Rule 1 - Bug] The first draft of `scripts/phone-curl-check.cjs` self-deadlocked**
- **Found during:** Producing the security_emphasis-mandated curl evidence
- **Issue:** The script shells out to `curl` with `execFileSync` from the SAME Node process that hosts the in-process `WebhookServer` it is testing. `execFileSync` blocks the one event loop the server needs to accept and answer the connection curl is making — every request hung for the full timeout with 0 bytes received (`curl: (28) Operation timed out ... with 0 bytes received`), reproduced against a bare minimal `http.createServer` control (which worked fine when curl ran from a separate shell) before the real cause was isolated.
- **Fix:** Switched to async `child_process.execFile`, awaited via a `Promise`, so the event loop stays free while curl's own subprocess runs.
- **Files modified:** `scripts/phone-curl-check.cjs` (new file, own commit).
- **Verification:** all six curl checks pass, `SCRIPT_EXIT=0`, pasted above.
- **Committed in:** `5a26904`.

---

**Total deviations:** 4 auto-fixed (1 Rule 2 missing-critical, 3 Rule 1 bugs — two pre-existing repo-fact ledgers this plan's own legitimate additions were obligated to update, one self-inflicted script bug caught and fixed before being trusted).
**Impact on plan:** All four are scoped exactly to making this plan's own additions correct against this repo's existing gates, or to a real correctness gap the phone-pairing wiring surfaced. No scope creep — the two ledger fixes are committed separately per house precedent; the `reconcileWebhookServer` fix stayed inside task 5's own declared file.

## Issues Encountered

- **A leftover background process from the curl-check debugging session.** The FIRST (buggy, `execFileSync`-based) invocation of `scripts/phone-curl-check.cjs` was left running in the background — its own event loop stayed blocked inside the deadlocked `execFileSync` call with no timeout on that first draft's curl invocation, so it never reached its own cleanup (`server.stop()`) and is still holding `127.0.0.1:39217`. Harmless (no other process needs that port; the script's final version defaults to `39221` and accepts `PHONE_CURL_CHECK_PORT` to avoid any collision) but not force-killed this session — the harness's own auto-mode classifier declined a `taskkill` against a PID discovered via an opaque `tasklist` query, correctly, since it could not verify the process was this session's own. It will clear on its own on session end/reboot, or can be killed by the operator directly (`taskkill /F /PID 11680 /T` on this machine, this session).

## User Setup Required

None — no external service configuration required. Building `resources/phone/**` (plan 02-09) and rendering the QR (plan 02-10) both need this plan's server contract, which is what was built here.

## Explicitly NOT claimed (per the plan's own `<verification>` section)

- **DAEMON-02 closes as a localhost-verified auth path, not completion.** No physical Android device, no WebAPK install, no `display: standalone`, no Web Push while asleep — none of that was exercised this session. The requirement's own text names this fallback; this plan uses its words.
- **DAEMON-03's live half is operator-supplied.** No bot token, no Discord application. The verifier round trips (constant-time header compare, live-verified Ed25519 accept/tamper/replay/malformed-key) and both payload adapters are localhost-verified only; both adapters and both new verifier branches carry a `LIVE-UNVERIFIED` marker in source.
- **DAEMON-05 is not closed here.** This plan satisfies exactly two of its bullets — a strong generated token, never a user-chosen password (`grep -oiE 'password|passphrase'` over comment-stripped joined text → `0`); and rate limiting + lockout on the auth endpoint, proven engaging and provably clearing. Plan 02-10 owns DAEMON-05's closure.
- **The auth lockout is global, not per-client, and therefore remotely DoS-able behind a tunnel.** Stated in source (`webhook.ts`'s own comments on `PHONE_LOCKOUT_FAILURES`/`phoneLockedOut`), not only here.
- **The public `/phone/` shell makes the origin self-identifying once paired.** Narrowed to "after the operator deliberately pairs, for the life of the process" (the dark-state 404 before that, proven byte-identical to the unknown-endpoint case).
- **No content filtering exists on the answer body.** The bearer + the tight body cap + the `taskId` charset restriction are the only gates; the text that reaches `answerAsk` becomes an instruction inside an agent's terminal verbatim.

## Next Phase Readiness

- Plan 02-09 can add `resources/phone/**` and its `extraResources` entry without reopening `webhook.ts` — `staticRoot()` returning `null` or a rootless directory already 404s cleanly, proven by this plan's own fixture-based tests and the curl script.
- Plan 02-10 has `phone:pairing`'s exact return shape (documented above) to render as a QR, and the three preload/IPC pieces (`phonePairing`, `mcpAgentState`-style consent pattern) it needs.
- Plan 02-12 has the re-measured `LIVE-UNVERIFIED` count (`3` in `webhook.ts`) and the now-current `MARKER_LEDGER` to close PARITY-03 against.
- `npm run typecheck`, `npm run build`, `npm run lint` (`--max-warnings 0`) all exit 0 at the end of this plan. Full suite (TAP): `753/746/0 fail/7 skipped` (was `728/721/0/7` at dispatch — +25 new passing cases, 0 regressions).
- **Not run this session:** `gh pr checks` returned results, but they are from PR #78's current head (`bb1ad70`), which is `origin/gsd/v1.0-floor-closure`'s tip — 53 commits behind this plan's own `HEAD` (`5a26904`) and behind every unpushed commit from 02-01 through 02-11 too. `MEASUREMENT UNAVAILABLE — needs a push to origin/gsd/v1.0-floor-closure first`, matching every prior plan's precedent in this phase for the identical reason.
- **REQUIREMENTS.md left unchanged** — DAEMON-02/03/05 all stay `[ ]`, reasons above and in `key-decisions`.

---
*Phase: 02-the-daemon-and-the-protocol*
*Completed: 2026-08-23*

## Self-Check: PASSED

All 9 claimed files verified present on disk (`src/main/webhook.ts`, `src/shared/triggers.ts`,
`src/main/index.ts`, `src/preload/index.ts`, `WebhooksSection.tsx`,
`test/webhook-endpoints.test.cjs`, `test/repo-claims.test.cjs`, `test/boot-floor.test.cjs`,
`scripts/phone-curl-check.cjs`) and all 8 claimed commits (`875e183`, `4acbc44`, `94222f0`,
`fb1c0e9`, `07889df`, `2543584`, `8577748`, `5a26904`) found in `git log --oneline --all`.
