---
phase: 02-the-daemon-and-the-protocol
plan: 09
subsystem: daemon-phone-pwa
tags: [pwa, web-push, vapid, aes128gcm, node-crypto, service-worker, electron-builder, csp]

requires:
  - phase: 02-the-daemon-and-the-protocol
    provides: "plan 02-05's server-side door — /phone/** routing, the exact-filename static allowlist, the single-use enrollment->bearer exchange, GET /phone/api/asks, POST /phone/api/answer, the phone's own rate bucket/lockout, and the zero-endpoint guard already widened for the phone"
provides:
  - "resources/phone/{index.html,sw.js,manifest.webmanifest,icon-192.png,icon-512.png} — the whole installable phone shell"
  - "src/main/push.ts — VAPID (RFC 8292) + aes128gcm (RFC 8291/8188) from node:crypto alone, unit-verified, not wired to any route"
  - "electron-builder.yml extraResources entry so resources/phone ships in a packaged build"
  - "a localhost-verified auth path for DAEMON-02 (never claimed as device-verified completion)"
affects: [02-10, 02-12]

tech-stack:
  added: []
  patterns:
    - "aes128gcm Web Push encryption from node:crypto alone (ECDH + two-stage hkdfSync + aes-128-gcm), no dependency"
    - "VAPID JWT signed with dsaEncoding: 'ieee-p1363' for a raw P-256 signature, never Node's DER default"
    - "CSP authorised by recomputed sha256 hash of the exact inline <script>/<style> content, never 'unsafe-inline'"
    - "single-file PWA: markup + one <style> + one <script>, no framework, no bundler, no CDN"

key-files:
  created:
    - resources/phone/index.html
    - resources/phone/sw.js
    - resources/phone/manifest.webmanifest
    - resources/phone/icon-192.png
    - resources/phone/icon-512.png
    - src/main/push.ts
    - test/push-vapid.test.cjs
  modified:
    - electron-builder.yml
    - src/main/index.ts
    - test/build-assets.test.cjs

key-decisions:
  - "DAEMON-02 lands as a localhost-verified auth path, not completion — no physical Android device was used this session; requirements-completed is deliberately empty"
  - "R-push (a VAPID-public-key route + subscription-intake callback) is ABSENT from the merged src/main/webhook.ts — push.ts ships fully unit-verified but wired to no route; pushManager.subscribe() is never called client-side"
  - "phoneRootPath()/staticRoot() injection and the phone-aware zero-endpoint guard were already landed by plan 02-05 (commit 8577748) — this plan changes neither, and does not rename phoneRootPath() to match this plan's own draft text (phoneStaticDir())"
  - "The answer field is 'answer', not 'text' as this plan's own draft table assumed — read from the merged source, not guessed"

requirements-completed: []

duration: ~5h (single session)
completed: 2026-08-24
---

# Phase 02 Plan 09: The Phone PWA Bundle + push.ts Summary

**Shipped the five hand-written static files an Android phone installs plus a from-`node:crypto` VAPID/aes128gcm
Web Push implementation — verified end to end on a real loopback socket against the real committed bundle and in
a real packaged `dist/win-unpacked` tree, but never on a physical device, so DAEMON-02 lands as the localhost-verified
auth path its own requirement text names, not as completion.**

## Performance

- **Duration:** ~5h (single session, sequential executor, no worktree)
- **Tasks:** 5/5 completed
- **Files modified:** 10 (7 created, 3 modified) — exactly the plan's own `files_modified` list, verified by a
  per-commit `git show --name-only` sweep across the whole plan range (`c60380d..HEAD`)

## Accomplishments

- `resources/phone/{index.html,sw.js,manifest.webmanifest,icon-192.png,icon-512.png}` — the whole installable phone
  shell, packaged (`electron-builder.yml`'s `extraResources` entry proven against a real `dist/win-unpacked` build,
  byte-identical sha256 to the committed source)
- `src/main/push.ts` — VAPID + RFC 8291 `aes128gcm` from `node:crypto` alone, zero new dependencies, with the
  DER-signature bug and a CEK-derivation bug both reproduced live and fixed under test
- A real `WebhookServer` bound to a real loopback socket, driven by the real `curl` binary, against the real
  committed `resources/phone/` directory (not a fixture) — 12/12 checks pass, transcript below
- The CSP's inline `<script>`/`<style>` are authorised by a recomputed sha256 hash, pinned by a `build-assets.test.cjs`
  clause that was driven RED with a real one-character edit
- A real Chromium (`@playwright/test`, already installed) A6 accessibility probe at a real 360×640 viewport, which
  caught and fixed a real accessible-name defect (missing space in "NEEDS YOU{count}")

## Task Commits

1. **Task 1: packaging entry + the assets it copies** — `fb5d9c8` (feat)
2. **Task 2: `resources/phone/index.html`** — `218356b` (feat)
3. **Task 3: `src/main/push.ts` + `test/push-vapid.test.cjs`** — `18f14db` (feat)
4. **Task 4: `sw.js` + push-state path in `index.ts`** — `690b317` (feat)
5. **Task 5: localhost proof + packaging proof + CSP-hash clause** — `797b8f3` (fix)

**Plan metadata:** *(this commit, docs: complete plan)*

## Files Created/Modified

- `resources/phone/index.html` (584 lines) — two screens, no router, no framework; the pairing credential is
  cleared from the URL before first paint; bearer in IndexedDB, drafts in localStorage
- `resources/phone/sw.js` — four listeners (install/activate/push/notificationclick), no fetch handler, no cache
- `resources/phone/manifest.webmanifest` — `standalone`, `/phone/` start_url, `#17171B` ground/theme
- `resources/phone/icon-{192,512}.png` — 512 is a byte copy of `docs/logo.png`; 192 is a real `nativeImage.resize`
  downscale (verified true PNG IHDR dimensions, not assumed)
- `src/main/push.ts` — `generateVapidKeys`/`ensureVapidKeys`/`vapidAuthHeader`/`encryptPayload`/`sendPush`, all
  named exports, injected transport, electron-free
- `test/push-vapid.test.cjs` — 8 cases, 0 network reach
- `electron-builder.yml` — `resources/phone -> phone` `extraResources` entry
- `src/main/index.ts` — `pushStatePath()` added (not called; see Deviations); comment on `phoneRootPath()` updated
- `test/build-assets.test.cjs` — 4 new clauses (packaging entry, manifest icon sizes, icon-512 digest, CSP hash)

## Decisions Made

See `key-decisions` in the frontmatter above. The most consequential: DAEMON-02 is NOT flipped `[x]` in
REQUIREMENTS.md by this plan. See "The Honesty Ledger" below.

---

## The door's contract, recorded from the merged `src/main/webhook.ts` (not guessed)

Read in full at the start of task 1, at commit `c60380d` (unchanged by this plan — verified: `git diff --stat
c60380d..HEAD -- src/main/webhook.ts` prints nothing).

| Ref | Method + path | Auth | Success | Failure | Body shape | Source |
|---|---|---|---|---|---|---|
| R-static | `GET /phone/`, `/phone/index.html`, `/phone/sw.js`, `/phone/manifest.webmanifest`, `/phone/icon-192.png`, `/phone/icon-512.png` | none | 200, content-type per `PHONE_ASSETS` | 404 | `{"ok":false,"error":"not found"}` | `handlePhoneStatic`, `webhook.ts:688-724`; allowlist `PHONE_ASSETS`, `webhook.ts:253-259` |
| R-pair (real name: **enroll**, not `pair`) | `POST /phone/api/enroll`, header `x-md-phone-enroll: <token>` | the single-use enrollment token | 200 `{"ok":true,"bearer":"<48-hex>"}` | 401 `{"ok":false,"error":"unauthorized"}` | — | `handlePhoneEnroll`, `webhook.ts:566-598` |
| R-asks | `GET /phone/api/asks`, header `Authorization: Bearer <bearer>` | bearer | 200 `{"ok":true,"asks":PhoneAsk[]}` | 401, same body as above | `PhoneAsk = {taskId,title,question,agent?,askedAt?}` (`webhook.ts:111-117`) | `handlePhoneAsks`, `webhook.ts:633-641` |
| R-answer | `POST /phone/api/answer`, header `Authorization: Bearer <bearer>`, body `{"taskId":string,"answer":string}` (**field is `answer`, not `text`** as this plan's own draft table assumed) | bearer | HTTP status is **always 200**; body `{"ok":true\|false}` reflects whether the write actually succeeded | 401 (auth), 400 (bad json / bad taskId charset / empty answer), 413 (body > 8 KB) | — | `handlePhoneAnswer`, `webhook.ts:649-678` |
| R-push | **ABSENT.** No route, no field on `WebhookServerOptions` for a VAPID public key or a subscription intake. | — | — | — | — | confirmed by reading the whole file (`grep -ci 'push\|vapid\|subscri' src/main/webhook.ts` → 2, both unrelated `chunks.push(c)` array pushes) |

Consequence carried into every later task: `index.html` calls `POST /phone/api/answer` with `{taskId, answer}`
(not `text`); `push.ts` ships fully unit-verified but is wired to no route anywhere in `index.ts`.

## The zero-endpoint guard — already widened by plan 02-05, this plan changes nothing there

Three places already handle "the phone is armed but no webhook trigger is configured", all traced to commit
`8577748` (`feat(02-05): wire the door — injected thunks, pairing IPC, config reservation, UI chip (task 5)`),
via `git log -S'forPhone' --oneline HEAD -- src/main/index.ts` (a naive `git log -S'endpoints.length === 0'`
on the guard's own literal text is a false signal — it finds an unrelated occurrence at `9f44125`, a commit that
predates plan 02-05 entirely):

```
src/main/webhook.ts:387   if (this.endpoints.size === 0 && !this.phoneArmed()) {
src/main/index.ts:1341    if (endpoints.length === 0 && !opts?.forPhone) return { ok: false, error: 'no enabled webhook endpoints' };
src/main/index.ts:1367    if (endpoints.length === 0) {
                             ... if (webhookServer?.phoneArmed()) { webhookServer.setEndpoints(endpoints); return; }
```

This plan's task 4 read all three, confirmed the widening was already real (an operator with zero configured
webhook triggers still gets a server the moment `phone:pairing` arms it), and touched none of them.

## `phoneRootPath()` vs. this plan's own `phoneStaticDir()` — a symbol-name divergence, documented not silently patched

Task 4's action text (written before plan 02-05 executed) says to add `phoneStaticDir()` beside
`skillsResourceDir()`. Plan 02-05 already added the identical packaged/dev resolution — same two branches, same
`app.isPackaged` split — under the name `phoneRootPath()`, already injected as `staticRoot: () =>
phoneRootPath()` at `index.ts:1302`, already covered by plan 02-05's own tests. This plan does **not** rename or
duplicate it: `grep -c 'phoneStaticDir' src/main/index.ts` is `0` and stays `0`; `grep -c 'phoneRootPath'` and
`grep -c 'staticRoot'` are both `>= 1`. The underlying requirement — an injected, packaged/dev-aware static root,
with `webhook.ts` staying free of any `electron` import — is satisfied under the name the symbol actually has.

## Contrast ratios — computed this session, not copied from the UI-SPEC's own numbers

WCAG relative-luminance one-liner, run against the hex values as committed in `resources/phone/index.html`:

```
--p-on-accent (#1A1320) on --p-accent (#A896E3) = 7.03:1   (bar 4.5:1)  PASS
--p-text (#DEDBD6) on --p-card (#1A1A1F)        = 12.55:1  (bar 4.5:1)  PASS
--p-text-3 (#96919F) on --p-ground (#17171B)    = 5.83:1   (bar 4.5:1)  PASS
--p-line (#787684) on --p-card (#1A1A1F)        = 3.90:1   (bar 3.0:1)  PASS
```

All 13 colour custom properties verified byte-identical to `02-UI-SPEC.md`'s own table (`spec=13 bundle=13`,
empty diff).

## The localhost-verified auth path — full transcript, real socket, real curl, real committed bundle

A real `WebhookServer` bound to `127.0.0.1:39231` (tunnel OFF), `staticRoot` pointing at the actual committed
`resources/phone/` directory (not a fixture), driven by the real `curl` binary via async `execFile` (the same
self-deadlock `scripts/phone-curl-check.cjs` already documented and fixed — a sync spawn from the same event
loop the server needs would hang every request). Script lived in `mktemp`, never committed.

```
[T5] real WebhookServer bound on 127.0.0.1:39231, tunnel OFF, staticRoot=E:\munder-difflin\resources\phone

[T5] 1. GET /phone/
  HTTP/1.1 200 OK
  content-type: text/html; charset=utf-8, body matches committed index.html: true
  -> OK

[T5] 2. GET /phone/sw.js
  HTTP/1.1 200 OK
  content-type: text/javascript; charset=utf-8
  -> OK

[T5] 3a. GET /phone/manifest.webmanifest
  HTTP/1.1 200 OK
  content-type: application/manifest+json
  -> OK

[T5] 3b. GET /phone/icon-192.png
  HTTP/1.1 200 OK
  -> OK

[T5] 3c. GET /phone/icon-512.png
  HTTP/1.1 200 OK
  -> OK

[T5] 4. GET /phone/../../package.json (raw)
  HTTP/1.1 404 Not Found
  body: {"ok":false,"error":"not found"}
  -> OK

[T5] 5. GET /phone/..%2f..%2fpackage.json (encoded)
  HTTP/1.1 404 Not Found
  body: {"ok":false,"error":"not found"}
  -> OK

[T5] 6a. POST /phone/api/enroll (token)
  HTTP/1.1 200 OK
  body: {"ok":true,"bearer":"b53044bce3aa530ece783a6365a17b0f97c3308751c598a9"}
  -> OK

[T5] 6b. POST /phone/api/enroll (replay)
  HTTP/1.1 401 Unauthorized
  body: {"ok":false,"error":"unauthorized"}
  -> OK

[T5] 7a. GET /phone/api/asks (bearer)
  HTTP/1.1 200 OK
  body: {"ok":true,"asks":[{"taskId":"t-42","title":"Ship the release","question":"Should I tag v1?","agent":"Ada","askedAt":"2026-08-24T09:49:33.558Z"}]}
  -> OK

[T5] 7b. GET /phone/api/asks (tampered bearer)
  HTTP/1.1 401 Unauthorized
  body: {"ok":false,"error":"unauthorized"} (byte-identical to 6b's 401 body: true)
  -> OK

[T5] 8. POST /phone/api/answer (verified via hiveState, not the HTTP status)
  HTTP/1.1 200 OK
  hiveState.answers: [{"taskId":"t-42","answer":"Yes, tag it.","askedBy":"Ada"}], remaining asks: 0
  -> OK

[T5] summary:
  OK  1. GET /phone/
  OK  2. GET /phone/sw.js
  OK  3a. GET /phone/manifest.webmanifest
  OK  3b. GET /phone/icon-192.png
  OK  3c. GET /phone/icon-512.png
  OK  4. GET /phone/../../package.json (raw)
  OK  5. GET /phone/..%2f..%2fpackage.json (encoded)
  OK  6a. POST /phone/api/enroll (token)
  OK  6b. POST /phone/api/enroll (replay)
  OK  7a. GET /phone/api/asks (bearer)
  OK  7b. GET /phone/api/asks (tampered bearer)
  OK  8. POST /phone/api/answer (verified via hiveState, not the HTTP status)

SCRIPT_EXIT=0
```

Test 8 is deliberately verified by **reading the fixture "hive" state** the injected `openAsks`/`answerAsk`
callbacks own (the ask left the open list, the answer landed against the correct asker `Ada`) rather than by
trusting the HTTP 200 — matching exactly how `test/webhook-endpoints.test.cjs` (plan 05) already tests this same
callback boundary. This is NOT a real git-backed `hive.ts` round trip; `index.ts`'s own `answerPhoneAsk` (which
calls the real `hive.patchTask`/`hive.send`) is Electron-dependent and out of reach for a `node --test`-style
driver. `answerAsk`/`openAsks` are always tested via fixtures at this exact boundary throughout this repo.

**Label, precisely:** a localhost-verified auth path. Not a device verification. This document never claims the
phone was added to a home screen or that the app ran in standalone display mode on real hardware.

## Packaging — real, not simulated

```
npm run build                                          # exit 0
npx electron-builder --win --dir -c.npmRebuild=false    # exit 0
```

`-c.npmRebuild=false` isolates the resource-copy question from this machine's blocked native rebuild (see
`~/.claude/.../memory/windows-build-environment.md`) — a measurement isolation, not a workaround to make a gate
pass, and it changes no committed file (`git status --porcelain` printed nothing afterward; `dist/` is
gitignored).

```
$ ls -la dist/win-unpacked/resources/phone/
total 53
drwxr-xr-x 1 Alienware 197121     0 Aug 24 15:23 .
drwxr-xr-x 1 Alienware 197121     0 Aug 24 15:23 ..
-rw-r--r-- 1 Alienware 197121 13277 Aug 24 14:49 icon-192.png
-rw-r--r-- 1 Alienware 197121  7794 Aug 24 14:51 icon-512.png
-rw-r--r-- 1 Alienware 197121 20054 Aug 24 15:19 index.html
-rw-r--r-- 1 Alienware 197121   364 Aug 24 14:51 manifest.webmanifest
-rw-r--r-- 1 Alienware 197121  2368 Aug 24 15:09 sw.js
```

`index.html`'s packaged and committed bytes are sha256-identical (`d2757f64...8ef5c`) — rebuilt a second time
after the CSP-hash fix (below) specifically to package the FINAL committed content, not an earlier draft.

## The A6 probe — real Chromium, real 360×640 viewport, against the real bundle

`@playwright/test` 1.62.1's bundled chromium was already installed and launched cleanly (`CHROMIUM LAUNCH OK`) —
no `npx playwright install` was needed, so there is no `git status --porcelain` residue to report from it.

```
[A6] requested viewport 360, true window.innerWidth = 360
[A6] <h1> count on screen 1: 1
[A6] positive control — h1 text: "NEEDS YOU 1"
[A6] interactive element heights: [{"tag":"BUTTON","cls":"p-refresh","h":48},{"tag":"BUTTON","cls":"p-ask","h":100}]
[A6] textarea/label association: {"taId":"p-answer","labelExists":true,"labelText":"Your answer"}
[A6] send button aria-label: null, text content: "send answer"
[A6] divs styled as clickable (cursor:pointer) outside a button: 0

A6_EXIT=0
```

This run is AFTER the accessible-name fix below — the FIRST run (before the fix) showed `h1 text: "NEEDS YOU1"`
(no space), which is what caught the defect in the first place.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing space in the ask-list `<h1>`'s accessible name**
- **Found during:** Task 5's A6 Playwright probe (first run)
- **Issue:** `resources/phone/index.html`'s list-screen heading concatenated `"NEEDS YOU"` and the open-count
  `<span>` with no separating text node, so the rendered/announced text read `"NEEDS YOU1"` instead of
  `"NEEDS YOU 1"`. Visually masked by the `.p-count` rule's `margin-left`, so a static read of the file did not
  catch it — exactly the kind of defect A6's live probe exists to catch that a static grep cannot.
- **Fix:** one-character fix (`resources/phone/index.html`) inserting a literal space before the count span's
  opening tag.
- **Consequence:** the fix edits the inline `<script>` content, which invalidated the CSP's `script-src` sha256
  hash embedded in the same file — recomputed and re-embedded (`EtyV4iwjHDyNCCr1Hm+KnT4nQXdYDHo/DsYAJH53NwQ=`),
  confirmed matching by an independent recompute, and re-verified by re-running the A6 probe (which now shows
  `"NEEDS YOU 1"`) and the full localhost driver.
- **Files modified:** `resources/phone/index.html`
- **Committed in:** `797b8f3` (task 5)

**2. [Rule 2 - documented, not silently dropped] `pushStatePath()` added but not called**
- **Found during:** Task 4's action text (which assumed a push-subscription route would exist to wire against)
- **Issue:** R-push is ABSENT from the merged `webhook.ts` (see the contract table above) — there is no
  subscription-intake callback anywhere that could ever hand `sendPush()` a `PushSubscription`. Wiring
  `ensureVapidKeys()`/`sendPush()` to a route that does not exist would be dead code with no caller.
- **Fix:** `pushStatePath()` is defined (userData-scoped, never the hive git repo — T-P02-09-05) so the location
  is settled ahead of the plan that adds the intake, but it is called nowhere in `index.ts`. Documented inline
  and here rather than silently omitted, per the plan's own instruction: "leave `push.ts` exported and tested,
  and record the gap."
- **Files modified:** `src/main/index.ts`
- **Committed in:** `690b317` (task 4)

No other deviations. Every other acceptance criterion in the plan was met as written, including all four
D-40 parsed-both-directions clauses, all RED-drive requirements, and every containment check.

## RED drives — every gate proven capable of failing before it was trusted

**Task 1 — three `build-assets.test.cjs` clauses**, each mutated and restored:
- Renamed `extraResources`'s `from:` → `expected exactly one extraResources entry for resources/phone \n 0 !== 1`
- Deleted `icon-192.png` → `resources/phone/icon-192.png does not exist`
- Flipped one byte of `icon-512.png` → sha256 mismatch pasted, both digests shown
- (bonus) mutated a manifest `sizes` field → `icon-192.png is really 192x192 but the manifest declares 999x999`

**Task 3 — `push.ts`'s two central crypto claims**, both reproduced live:
- Removed `dsaEncoding: 'ieee-p1363'` from `vapidAuthHeader` → signature length went from 64 to **72 bytes**
  (`expected a raw 64-byte P-256 signature, got 72 bytes`), and the independent JWT-verify assertion failed too
  (`the JWT signature must verify against its own public key`, `false !== true`) — restored, `diff` against the
  pre-mutation backup printed nothing (byte-identical restore).
- Flipped one byte of the CEK derivation info string (`aes128gcm` → `aes128gcX`) → the round-trip decrypt threw
  `Unsupported state or unable to authenticate data` (GCM auth-tag verification correctly rejecting a
  wrong-key ciphertext) — restored, byte-identical.

**Task 5 — the new CSP-hash clause**: edited one character inside the inline `<script>` block → 
`the CSP script-src hash does not match the committed <script> content — the phone would execute nothing`,
both digests pasted — restored, byte-identical.

## D-21's promotion trigger — measured, not taken

`wc -l resources/phone/index.html` → **584 lines**. The plan's own bar is "a few hundred lines"; 584 sits above
a strict "few hundred" reading but the trigger's own action (promoting the bundle into `electron.vite.config.ts`,
i.e. a build step) was explicitly **not taken** in this plan regardless of the number — `git diff --stat
c60380d..HEAD -- electron.vite.config.ts` prints nothing. The number is recorded here for whoever next reads
this file to decide, not decided by this plan.

## Verification

- `npm run typecheck` — exit 0 (both `typecheck:node` and `typecheck:web`)
- `npm run build` — exit 0
- `npm run lint` (`eslint . --max-warnings 0`) — exit 0
- `npm test` (`node --test test/*.test.cjs`) — **789 tests / 782 pass / 0 fail / 7 skipped**, exit 0.
  B-suite baseline was 777/770/0/7; this plan added 12 passing cases (4 in `build-assets.test.cjs`, 8 in
  `push-vapid.test.cjs`) and 0 failures/skips, matching the orchestrator's own pre-dispatch expectation exactly.
- `node --test test/boot-order.test.cjs test/boot-floor.test.cjs` — 21/21 pass (the concurrent session's
  singleton-boot-order AST guard and the D-40 IPC channel-count/list pin both still hold)
- IPC surface untouched: `grep -c 'ipcMain.handle(' src/main/index.ts` = 160 both before and after this plan's
  task 4 edit; the sorted channel-name list diffs empty
- `src/main/webhook.ts` untouched by this plan (`git diff --stat c60380d..HEAD -- src/main/webhook.ts` prints
  nothing) and still carries zero `electron` imports
- Containment: every file touched across all 5 commits (`c60380d..HEAD`) is exactly the plan's own
  `files_modified` list — `electron-builder.yml`, the five `resources/phone/**` files, `src/main/push.ts`,
  `src/main/index.ts`, `test/build-assets.test.cjs`, `test/push-vapid.test.cjs`. No `tools/`, no `scripts/`.
- `package.json`/`package-lock.json` untouched across the whole plan (`git diff --stat c60380d..HEAD --
  package.json package-lock.json` prints nothing) — zero npm packages added
- Zero SSE anywhere in this plan's diff: `git diff c60380d..HEAD | grep '^+' | grep -o 'EventSource\|text/event-stream' | wc -l` = `0`, against 1,281 added lines (a real, non-trivial diff)
- **Cross-platform CI**: `gh pr checks` on PR #78 returns green rows (Typecheck, Test × 3 platforms, Build,
  Electron smoke), but `gh pr view --json headRefOid` shows the PR's head sha (`bb1ad70`) is 53+ commits behind
  this session's `HEAD` — this matches `STATE.md`'s own existing caveat for the whole phase (nothing pushed yet)
  and is **not** substituted as evidence for this plan's own changes. Recorded honestly as
  `MEASUREMENT UNAVAILABLE — PR #78's head sha is stale relative to this plan's HEAD` rather than claimed green.

## Limitation ledger

- **No physical Android device was used.** The WebAPK install, `display: standalone`, the home-screen add,
  push-while-asleep, the sticky bar's behaviour under the on-screen keyboard, and `-webkit-line-clamp` rendering
  are all **UNVERIFIED**. DAEMON-02 lands as the localhost-verified auth path its own requirement names.
- **The public `/phone/` shell answers 200 with no token** once the phone is armed, so the origin
  self-identifies as a Hello MarkX floor. Unavoidable for an installable PWA (D-18); stated, not silently
  accepted. The shell itself carries no floor data, no agent names and no hostnames — asserted by the localhost
  transcript above (test 1's body is the static shell only).
- **`frame-ancestors` is unenforced**, because a meta CSP cannot carry it and the response headers are plan
  05's file (`webhook.ts`, untouched by this plan).
- **The global rate-limit lockout is remotely DoS-able behind a tunnel** — every client presents the tunnel's
  IP (`webhook.ts:156`'s own long-standing comment). No per-client lockout is claimed.
- **The bearer at rest is browser storage (IndexedDB), not a keystore.** Anyone holding the unlocked phone has
  the floor. No device-level protection is claimed.
- **Everything dies with the tunnel hostname** — bearer, worker registration, push subscription (D-19).
  Re-onboarding is the QR, by design.
- **Web Push was verified against `node:crypto` and (for the round trip) an independently re-derived receiver
  side, never against a live push service.** The RFC 8291 §5 published vector itself is recorded
  `MEASUREMENT UNAVAILABLE` — this execution session has no live web-fetch tool, and reproducing an RFC's
  byte-exact base64 fixture from training memory risks silently encoding a misremembered value as a passing
  assertion. **R-push is ABSENT from the merged `webhook.ts`**, so Web Push is not reachable end to end: no
  subscription intake exists anywhere in this codebase. Naming the missing callback for plan 02-12's honesty
  ledger.
- **D-21's promotion trigger**: `resources/phone/index.html` measured at 584 lines this session. The trigger
  was recorded, not taken — `electron.vite.config.ts` gained no entry from this plan.

No physical Android device was used this session. DAEMON-02 lands as a localhost-verified auth path, per the
requirement's own stated fallback — never as completion.

## Self-Check: PASSED

Created files — all verified present on disk:
- FOUND: resources/phone/index.html
- FOUND: resources/phone/sw.js
- FOUND: resources/phone/manifest.webmanifest
- FOUND: resources/phone/icon-192.png
- FOUND: resources/phone/icon-512.png
- FOUND: src/main/push.ts
- FOUND: test/push-vapid.test.cjs

Commits — all verified present in `git log --oneline --all`:
- FOUND: fb5d9c8
- FOUND: 218356b
- FOUND: 18f14db
- FOUND: 690b317
- FOUND: 797b8f3
