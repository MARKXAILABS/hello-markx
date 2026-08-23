---
phase: 02-the-daemon-and-the-protocol
plan: 04
subsystem: infra
tags: [electron, node-test, cloudflared, child-process, supply-chain, tunnel]

requires:
  - phase: 02-the-daemon-and-the-protocol
    provides: "02-02's bootFloor(deps)/Floor composition root and 02-03's floor/headless.ts+floor/lifecycle.ts seams — this plan's index.ts edits land on top of both, measured fresh at this plan's own B-sha rather than trusting either SUMMARY's line numbers"
provides:
  - "src/main/tunnel.ts — openTunnel(port, {bin, spawn?, timeoutMs?}): Promise<TunnelHandle>, electron-free, closes via procKill's hardKillTree(child.pid)"
  - "src/main/cloudflared.ts — cloudflaredArtifactFor/resolveCloudflared/ensureCloudflared: pinned-tag acquisition with a repo-committed SHA-256, verified before any write"
  - "SlackWebhookServer/WebhookServer.startTunnel(open)/stopTunnel() — start() itself opens no tunnel; a tunnel exists only where an operator action passes an opener"
  - "config.ts tunnelEnabled — the off-by-default master switch, written only by tunnel:start/tunnel:stop"
  - "3 new IPC channels (tunnel:start/status/stop) + 4 preload wrappers (tunnelStart/Stop/Status/onTunnelChanged) — the enable path plan 02-10 renders a UI over"
  - "scripts/tunnel-live-check.cjs — the live close proof, outside npm test, run this session (exit 3, announced skip — see below)"
affects: [02-05, 02-10, 02-12]

tech-stack:
  added: []
  patterns:
    - "A shared child-process tunnel helper with an injected spawner (SpawnFn) and binary path, following hive.ts's startProxyBridge shape — the first fake-spawner test in this repo"
    - "Acquisition-before-execution: buffer the whole artifact in memory, hash it, compare to a repo-committed digest, and ONLY THEN write to disk — nodeInstall.ts's refuse-without-a-digest pattern, with cloudflared's one divergence (no vendor checksum file exists, so the digest is a repo constant, not fetched)"
    - "A repo-fact test file scoped to ONE plan's clauses (test/tunnel.test.cjs) when the shared accumulator (test/repo-claims.test.cjs) is owned by a different plan in the same wave"

key-files:
  created:
    - src/main/tunnel.ts
    - src/main/cloudflared.ts
    - test/tunnel.test.cjs
    - scripts/tunnel-live-check.cjs
  modified:
    - src/main/slack.ts
    - src/main/webhook.ts
    - src/main/config.ts
    - src/main/index.ts
    - src/preload/index.ts
    - test/net-binding.test.cjs
    - test/webhook-endpoints.test.cjs
    - test/slack.test.cjs
    - test/boot-floor.test.cjs
  deleted:
    - src/main/tunnelmole.d.ts

key-decisions:
  - "The conditional-collision measured first, per the plan's own instruction: startSlackServer/stopSlackServer/startWebhookServer/stopWebhookServer are all still in src/main/index.ts at this plan's B-sha (330235d), NOT moved into src/main/floor/boot.ts by 02-02/02-03. No frontmatter amendment was needed; task 4 proceeded as written."
  - "test/tunnel.test.cjs's clause 3 (config.ts's tunnelEnabled default) needed config.ts's DEFAULTS entry to exist before task 3's own commit, but task 3's containment criterion forbids touching config.ts inside that commit. Front-ran the one-line DEFAULTS entry as its own atomic commit (61ffa2a) — the same cross-task-prerequisite pattern 02-03's SUMMARY documents. The rest of the enable path (IPC handlers, preload wrappers, index.ts wiring, the every-writer sweep) is unchanged: still task 4's scope in full."
  - "tunnel:status's `enabled` field is a SESSION-LOCAL in-memory mirror (`tunnelIsEnabled`), not a re-read of config.tunnelEnabled — deliberately, so `tunnelEnabled` is written/read in exactly two places in index.ts (tunnel:start writes true, tunnel:stop writes false), which is what task 4's own scope-attribution acceptance criterion demands ('must name only tunnel:start and tunnel:stop'). It starts false on every launch regardless of a prior session's persisted value: nothing auto-reopens the tunnel at boot anyway (the off-by-default clause is structural), so a stale persisted `true` would report a tunnel that neither is running nor will resume without the operator pressing start again — arguably more honest than surfacing the stale flag."
  - "tunnel:start opens the webhook server's tunnel (the phone's origin, D-18/D-23) as the PRIMARY, return-shaping call, and ALSO opens Slack's tunnel best-effort if slackServer is already running — a SEPARATE cloudflared child and hostname, per D-15's explicit 'this plan does not unify them.' Slack's own result never shadows the webhook result the caller asked about."
  - "Two out-of-scope test fixes were committed SEPARATELY from task 4's own commit, for the identical containment reason 02-03 already established: test/boot-floor.test.cjs's D-40 IPC pin (152->155, 3 new channel names) and test/tunnel.test.cjs's own clause 1 (narrowed from counting every `openTunnel` REFERENCE to counting `function openTunnel(` DEFINITIONS, because task 4 legitimately makes index.ts import and call it)."

patterns-established:
  - "A script outside test/ that needs a TS module from src/main reuses test/load-ts.cjs rather than reimplementing TS transpilation — scripts/tunnel-live-check.cjs is not a test (not *.test.cjs, never runs under npm test) but the loader is a plain utility, and duplicating its resolve-relative-TS-imports logic would be the exact kind of hand-rolled duplication this codebase's own conventions warn against."

requirements-completed: []

duration: ~55min
completed: 2026-08-23
---

# Phase 02 Plan 04: The Tunnel That Actually Closes Summary

**`stop()` on both public-facing servers now genuinely closes the tunnel — a cloudflared child process this app spawns and reaps via `procKill.hardKillTree(pid)` — proven against a real disposable pid in the offline unit gate and against a real outbound Cloudflare tunnel this session (which opened correctly but could not be DNS-resolved from this sandboxed environment, so the close's live verification is an announced skip, not a claimed pass).**

## Performance

- **Duration:** ~55 min (commit span 17:42–18:27 IST; excludes upfront context-reading time)
- **Completed:** 2026-08-23
- **Tasks:** 5 (cloudflared.ts, tunnel.ts + server rewiring, the offline unit gate, the enable path, the live check)
- **Files modified:** 14 (4 created, 9 modified, 1 deleted) — the plan's own 13-file `files_modified` list plus one documented cross-task deviation (`test/boot-floor.test.cjs`)

## Accomplishments

- **`src/main/cloudflared.ts` (new).** `nodeInstall.ts`'s refuse-without-a-digest acquisition shape, with cloudflared's one mandated divergence: Cloudflare publishes no checksum file, so `CLOUDFLARED_SHA256` is a repo constant, not fetched. Every digest was pulled live from `GET https://api.github.com/repos/cloudflare/cloudflared/releases/tags/2026.8.2` in this session (see below) — none copied from the plan or RESEARCH.md. `windows-arm64` refuses with a stated reason (no such asset is published, across all 26 assets enumerated). A digest mismatch refuses loudly (citing issue #57), writes nothing to disk, and was seen firing both directions in `test/tunnel.test.cjs`. **Live-acquired the real binary in this session** (`cloudflared version 2026.8.2 (built 2026-08-14T04:22 UTC)`) and confirmed `--no-autoupdate` exists on it via `cloudflared tunnel --help`.
- **`src/main/tunnel.ts` (new).** `openTunnel(port, {bin, spawn?, timeoutMs?})` copies `hive.ts`'s `startProxyBridge` wholesale (the `settle` idempotence latch, non-inherited stdio, `error`/`exit` both settling, an unref'd hard ceiling), with three divergences: stderr is piped and scanned (cloudflared's banner lives there, not stdout); the URL is matched by regex over an accumulated, capped buffer (not `indexOf('\n')` — the banner's box border arrives first); and both pipes keep draining after settling, so a piped stream nobody reads never blocks the child. `stop()` is `hardKillTree(child.pid)`, imported, never re-implemented.
- **The byte-identical duplication deleted.** `slack.ts:210-220` and `webhook.ts:276-286`'s `openTunnel()` bodies were re-proved byte-identical by `diff` this session (empty diff, pasted below) before deletion. Both servers' `stop()` no longer returns `{tunnelStillOpen}`; both "tunnelmole exposes no close handle" comments are DELETED, not reworded (D-15). `start()` on both servers now opens **no tunnel at all** — DAEMON-05's off-by-default clause made structural. `src/main/tunnelmole.d.ts` deleted; `package.json`'s `tunnelmole` entry is untouched (D-06 — npm 11 on an npm-10-locked lockfile; removal deferred to plan 02-12 and a future npm-10 session).
- **The offline unit gate.** `test/tunnel.test.cjs` (new, 13 cases, 0 skipped, ~1.2s): the fake spawner's argv/banner-parsing/exit/timeout cases; `stop()`'s `hardKillTree` proof against a REAL disposable pid on the real platform (idempotent); every `cloudflared.ts` platform/arch branch offline; `ensureCloudflared`'s verify-then-write path (matching bytes written + `chmod 0o755` on POSIX, mismatched bytes refused with nothing written, citing #57); and four DAEMON-05 repo-fact clauses (this file, not `repo-claims.test.cjs` — 02-07 owns that file this wave), all four driven RED and reverted before being trusted. `test/net-binding.test.cjs`'s "stop() admits the tunnel outlives it" test inverted into "stop() genuinely closes it." `test/webhook-endpoints.test.cjs` and `test/slack.test.cjs` each gained a case proving `start()` opens no tunnel.
- **The enable path.** `config.ts`'s `tunnelEnabled` (off by default). `index.ts`: `resolveCloudflaredBin()` (lazy, memoised, never at boot); three IPC handlers (`tunnel:start/status/stop`) mirroring `slack:status`'s shape; the old `!res.ok && !server.listening()` workaround deleted; `tunnelEnabled` written in exactly two places (verified by a scope-attribution sweep); the four D-17 ceilings stated in source. `preload/index.ts`: four wrappers copying the `slack:*` shapes verbatim.
- **The live close, run this session.** `scripts/tunnel-live-check.cjs` acquired the real binary, opened a real tunnel (`https://oxford-sampling-veterinary-uni.trycloudflare.com`), and then found every subsequent probe against that hostname failed at the DNS/network layer from this sandbox — never a single HTTP response, even though `google.com` and the `trycloudflare.com` apex both resolve fine. Exit `3`, an announced skip distinguishable from a claimed defect (full trace below). **DAEMON-05's close was NOT live-verified in this session** — the reason is a sandbox DNS/egress limitation for freshly-provisioned `*.trycloudflare.com` records, not a defect in `tunnel.ts`.

## Task Commits

1. **Task 1: `src/main/cloudflared.ts`** — `1299454` (feat)
2. **Task 2: `src/main/tunnel.ts` + server rewiring** — `af25cc3` (feat)
3. **[Rule 3 - Blocking] `tunnelEnabled` config default, front-run ahead of task 3's clause 3** — `61ffa2a` (feat, separate commit — see Deviations)
4. **Task 3: the offline unit gate** — `14ea13f` (test)
5. **[Rule 1 - Bug] `boot-floor.test.cjs`'s D-40 IPC pin updated for 3 new channels** — `b12b439` (fix, separate commit — see Deviations)
6. **[Rule 1 - Bug] `tunnel.test.cjs`'s clause 1 narrowed to definitions, not references** — `1c54c9f` (fix, separate commit — see Deviations)
7. **Task 4: the enable path** — `66910f3` (feat)
8. **Task 5: the live close check** — `675054c` (feat)

_No separate plan-metadata commit was requested by the harness this run; STATE.md/ROADMAP.md/REQUIREMENTS.md updates are captured in the final docs commit below._

## Files Created/Modified

- `src/main/cloudflared.ts` (new, 196 lines) — pinned-tag acquisition, `CLOUDFLARED_SHA256`, `cloudflaredArtifactFor`/`resolveCloudflared`/`ensureCloudflared`.
- `src/main/tunnel.ts` (new, 166 lines) — `TunnelHandle`/`TunnelOpener`/`openTunnel`.
- `src/main/slack.ts`, `src/main/webhook.ts` — `openTunnel()`/`TUNNEL_START_TIMEOUT_MS`/`{tunnelStillOpen}`/both false comments deleted; `startTunnel(open)`/`stopTunnel()` added; `start()` no longer opens a tunnel; type-only import from `./tunnel`; vendor name corrected in the loopback-bind and per-IP-caveat comments (substance kept, D-23's caveat verbatim).
- `src/main/tunnelmole.d.ts` — deleted (`git rm`).
- `src/main/config.ts` — `tunnelEnabled?: boolean` + `DEFAULTS.tunnelEnabled: false`.
- `src/main/index.ts` — `resolveCloudflaredBin()`, `emitTunnelChanged()`, `tunnel:start`/`tunnel:status`/`tunnel:stop`; `startWebhookServer()`'s workaround deleted; `lastSlackUrl`/`lastWebhookUrl` now updated from `startTunnel()`'s result (keeps the pre-existing `slack:status`/`webhook:status` badges accurate now that `start()` never sets a url).
- `src/preload/index.ts` — `tunnelStart`/`tunnelStop`/`tunnelStatus`/`onTunnelChanged`.
- `test/tunnel.test.cjs` (new, 333 lines) — the offline unit gate.
- `test/net-binding.test.cjs`, `test/webhook-endpoints.test.cjs`, `test/slack.test.cjs` — the three existing-file updates task 3's action specifies.
- `test/boot-floor.test.cjs` — the D-40 IPC-count/channel-name pin updated (152→155, +`tunnel:start`/`tunnel:status`/`tunnel:stop`).
- `scripts/tunnel-live-check.cjs` (new, 187 lines) — the live close check.

## D-01 measurements, this session

**B-sha:** `330235d505467ebcd8e1fac255b5c8bbc0e66d90` (recorded before any edit).

**B-ipc-04** (re-measured at THIS plan's B-sha, not carried forward from 02-01's `153`):
```
$ grep -c 'ipcMain.handle(' src/main/index.ts
153
```
Unchanged from 02-01's own number — 02-02/02-03 added no new IPC handlers, only relocated code.

**B-suite:**
```
$ node --test --test-reporter=tap test/*.test.cjs
EXIT=0 / # tests 679 / # pass 672 / # fail 0 / # skipped 7
```
Matches the verification baseline handed to this executor exactly.

## Digests fetched live this session (not copied from any planning document)

```
$ node -e "
fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/tags/2026.8.2',
  {headers:{'User-Agent':'md-tunnel-plan'}}).then(r=>r.json()).then(j=>{
  console.log('tag_name', j.tag_name, 'published', j.published_at);
  for (const a of j.assets) console.log(a.name, a.size, a.digest);
});"

tag_name 2026.8.2 published 2026-08-14T12:23:25Z
cloudflared-windows-amd64.exe 54893480 sha256:c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5
cloudflared-linux-amd64 39799316 sha256:fcfb02b575a52ca1af2e3267af4e1517bcdeb30ac48c834c69abaed3c0576ad2
cloudflared-linux-arm64 37404344 sha256:7747d94570fb390cf47dcb4f9555c193c6355cda9793f0d878d9049e5d6a7790
cloudflared-darwin-amd64.tgz 21116242 sha256:f1727723c586500e2092368ae21871b3df7ddfd2cb097f22d81bee4a9c458bb4
cloudflared-darwin-arm64.tgz 19214189 sha256:9042c2c5d8b2de78e60f313d5fb31b6c5c1cebde787a3caf1f2c9588084ac442
```
(26 assets total enumerated; no `SHASUMS`-equivalent file exists among them — confirmed again this session, matching RESEARCH's own finding.) The windows-amd64 digest matches RESEARCH's recorded value byte-for-byte, confirming no drift since research time; the other four were not previously recorded and are new to this session's own fetch.

## The byte-identity diff (task 2, re-proved before deletion)

```
$ grep -n 'private async openTunnel' src/main/slack.ts src/main/webhook.ts
src/main/slack.ts:210
src/main/webhook.ts:276
$ diff <(sed -n '210,220p' src/main/slack.ts) <(sed -n '276,286p' src/main/webhook.ts)
DIFF_RC=0   (empty — byte-identical)
```

## The sorted IPC-channel diff (task 4)

```
$ B4=<pre-task-4 sorted channel list>; A4=<post-task-4 sorted channel list>
$ diff "$B4" "$A4"
140a141,143
> tunnel:start
> tunnel:status
> tunnel:stop
```
Exactly three additions, zero removals. `grep -c 'ipcMain.handle(' src/main/index.ts`: 153 → 156.

## The five RED runs (all reverted clean, `git status --porcelain -- src/` empty afterward)

1. **Clause 1** (`test/tunnel.test.cjs`) — planted `export async function openTunnel() {}` in a scratch `src/main/_redtest_openTunnel.ts` → `not ok 10`. Reverted, re-green.
2. **Clause 1's positive half** — renamed `slack.ts`'s `startTunnel` method to `startTunnelREDTEST` → `not ok 10` (the method NAME, not just a call site, is what the clause needs — a partial edit that only touched a call site earlier in the drive did not fail it, which is why the method itself was renamed for the real drive). Reverted, re-green.
3. **Clause 3** — flipped `config.ts`'s `DEFAULTS.tunnelEnabled` to `true` → `not ok 12`. Reverted, re-green.
4. **Clause 4** — emptied `CLOUDFLARED_SHA256` to `{}` → `not ok 6`, `not ok 7`, `not ok 13` (collateral on the platform-branch tests too, expected). Reverted, re-green.
5. **`test/slack.test.cjs`'s new section** — flipped the `server.tunnel` assertion's expected value to `'REDTEST'` → `EXIT=1`, `✗ start() opens no tunnel...`. Reverted, re-green (`EXIT=0`, `33` `✓` lines, `all passed`).

## The live-check trace (task 5, run this session — exit 3)

```
$ node scripts/tunnel-live-check.cjs
[tunnel-live-check] local nonce server listening on 127.0.0.1:53404
[tunnel-live-check] cloudflared acquired: C:\Users\...\Temp\md-tunnel-live-check-bin\cloudflared.exe
[tunnel-live-check] tunnel open: https://oxford-sampling-veterinary-uni.trycloudflare.com
[tunnel-live-check] open-poll  (elapsed=0ms, status=ERR:fetch failed)
[tunnel-live-check] open-poll  (elapsed=1386ms, status=ERR:fetch failed)
   ... (30 probes total, one per ~1s, all ERR:fetch failed) ...
[tunnel-live-check] open-poll  (elapsed=29638ms, status=ERR:fetch failed)
[tunnel-live-check] case skipped — every probe failed at the network/DNS layer (never a single HTTP
response, not even an error one); this environment cannot resolve or reach a freshly-provisioned
*.trycloudflare.com hostname, even though general internet egress and the trycloudflare.com apex both
work — see the probe trace above
SCRIPT_EXIT=3
```
**Diagnosis, isolated separately this session** (`node -e` one-offs, pasted in full in the task-5 work above): `fetch('https://www.google.com')` → `200`. `fetch('https://trycloudflare.com')` (the bare apex) → `200`. `dns.lookup()` against the REAL, currently-open tunnel hostname → `ENOTFOUND`, retried 5× over 10s, every attempt failing identically. This is a DNS-resolution limitation specific to freshly-provisioned `*.trycloudflare.com` subdomains from this sandboxed Windows session — not a defect in `tunnel.ts` (cloudflared itself successfully registered a real, correctly-shaped hostname with Cloudflare's edge — `oxford-sampling-veterinary-uni`, matching D-14's "random words" description exactly) and not "offline" in the simple sense (general internet and the apex domain both resolve). The script's own logic distinguishes this from a genuine close-defect: it tracks whether ANY probe during the open-poll ever got a real HTTP response (even an error one); since none did here, it exits `3` (announced skip) rather than `2` (claimed defect) — a defect claim would require having actually reached the tunnel at least once.

**DAEMON-05's close was NOT live-verified in this session.** The reason is recorded above, verbatim and diagnosed, not asserted.

## The four D-17 ceilings, stated in source (not only here)

```
$ for f in src/main/index.ts src/main/tunnel.ts; do
    joined "$f" | grep -oE '200 concurrent|no SSE|new on every open|testing.and.development'
  done | sort -u
new on every open
testing-and-development
200 concurrent
no SSE
```
All four distinct ceilings present: the hostname is new on every open (no $0 stable-URL option); Cloudflare documents quick tunnels as testing-and-development only; the hard cap is 200 concurrent in-flight requests; there is no SSE support at all. Only this session's own ~30s open-attempt duration (before the DNS limitation surfaced) was observed — no multi-hour soak was performed, consistent with CONTEXT.md's deferral.

## The behaviour change, stated (D-40; this is a deliberate loss of convenience)

Before this plan: enabling Slack or a webhook endpoint opened a public tunnel automatically, with no separate switch. After this plan: the local server still binds loopback and is still the security boundary, but **no tunnel opens until the operator presses the new tunnel enable control** — `start()` on both `SlackWebhookServer` and `WebhookServer` contains no tunnel code at all; a tunnel exists only where `tunnel:start`'s handler passes an opener into `startTunnel(...)`. Existing Slack users who relied on the old auto-tunnel behaviour will need to press the new control once after upgrading. Every writer of `tunnelEnabled` in `src/main/index.ts` is enumerated (exactly two: `tunnel:start` writes `true`, `tunnel:stop` writes `false`) by a scope-attribution `awk` sweep, pasted in the task-4 work above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `config.ts`'s `tunnelEnabled` default needed to exist before task 3's own commit**
- **Found during:** Task 3, while writing `test/tunnel.test.cjs`'s clause 3 (config's off-by-default pin)
- **Issue:** Clause 3 asserts `config.ts` already contains `tunnelEnabled: false` — but `config.ts` is task 4's file, and task 3's own containment criterion forbids touching it inside task 3's commit range.
- **Fix:** Front-ran the one-line `DEFAULTS` entry (+ interface field + doc comment) as its own atomic commit between tasks 2 and 3 — the identical pattern 02-03's SUMMARY documents for cross-task prerequisites.
- **Files modified:** `src/main/config.ts`.
- **Committed in:** `61ffa2a`.

**2. [Rule 1 - Bug] `test/boot-floor.test.cjs`'s D-40 IPC pin went stale**
- **Found during:** Task 4, immediately after adding the three `tunnel:*` IPC handlers
- **Issue:** `test/boot-floor.test.cjs` pins `index.ts`'s exact `ipcMain.handle` count (152, joined/stripped) and the full sorted channel-name list. The test's own assertion message says to fix this "in the same commit that changes the channel" — but `test/boot-floor.test.cjs` is not in task 4's declared file list, so updating it inside task 4's own commit would break task 4's containment check.
- **Fix:** `B_IPC_JOINED` 152 → 155; `B_IPC_NAMES` gained `tunnel:start`/`tunnel:status`/`tunnel:stop` in sorted position. Committed separately, before task 4's own commit.
- **Files modified:** `test/boot-floor.test.cjs`.
- **Committed in:** `b12b439`.

**3. [Rule 1 - Bug] `test/tunnel.test.cjs`'s own clause 1 needed narrowing**
- **Found during:** Task 4, immediately after `index.ts` legitimately imported and called `openTunnel`
- **Issue:** Clause 1 (task 3) asserted exactly one bare `openTunnel` identifier under `src/main`. Task 4's enable path legitimately makes `index.ts` both `import { openTunnel }` and call it once — correctly growing the reference count past 1, turning a true positive into a false failure.
- **Fix:** Narrowed the count to `function openTunnel(` DEFINITIONS (still exactly 1 — `tunnel.ts`'s export), which still catches the actual regression class (a second COPY of the function body anywhere under `src/main`) without penalizing a legitimate caller. Re-driven RED (a planted scratch definition) and reverted before being trusted, matching the discipline the plan requires for every clause here.
- **Files modified:** `test/tunnel.test.cjs`.
- **Committed in:** `1c54c9f`.

---

**Total deviations:** 3 auto-fixed (1 blocking cross-task prerequisite, 2 bugs in pre-existing/self-authored repo-fact pins triggered by task 4's own legitimate additions). **Impact on plan:** All three were necessary for correctness of the plan's own gates; none represents scope creep — each is a one-or-few-line fix to a pin that the plan's own acceptance-criteria discipline (and 02-03's established precedent) requires to be updated "in the same commit that changes the channel," done here in a separate, cleanly-attributed commit instead.

## Issues Encountered

- **The live tunnel close could not be verified end-to-end in this sandboxed session** (see the live-check trace above) — a DNS/egress limitation specific to freshly-provisioned `*.trycloudflare.com` records from this Windows sandbox, isolated and diagnosed with standalone `node -e` probes, not merely observed and shrugged off. `tunnel.ts` itself is not implicated: cloudflared successfully registered a correctly-shaped hostname with Cloudflare's control plane every time it was tried.
- **A self-inflicted false block-comment match, caught and fixed before it could corrupt a grading run.** Task 4's own draft comment contained the literal text `` `/phone/*` `` (a route-pattern reference), which the plan's own `stripped()`/comment-stripping regex reads as an OPENING block comment (the `/*` at the end of "phone/*"), swallowing real code down to the next `*/` it could find — the exact class of defect 02-03's SUMMARY flagged as a pre-existing bug elsewhere in `index.ts` (an UNRELATED `google/*` inside a `//` comment, at line 2119, still present and not this plan's file to fix). Caught by re-running `stripped src/main/index.ts | grep -o 'startTunnel(' | wc -l` and finding it did not match the raw count; reworded the comment to avoid the literal `/*` sequence rather than leaving a passing-by-luck acceptance criterion.

## User Setup Required

None — no external service configuration required. (Acquiring cloudflared itself needs outbound network access on first enable; this is a runtime behaviour, not a setup step, and is stated in `cloudflared.ts`'s own header.)

## Next Phase Readiness

- `TunnelOpener`/`TunnelHandle` and both servers' `startTunnel`/`stopTunnel` are the seam plan 02-05's phone routing needs.
- **Interface note for 02-05 (one origin for both servers).** Exposing Slack and the webhook server means two cloudflared children and two hostnames today — the same shape that shipped under tunnelmole. Unifying them behind one origin needs D-23's path routing, explicitly out of scope here.
- **Interface note for 02-05 (the zero-endpoints refusal).** `tunnel:start` with no enabled webhook endpoint returns the local server's own `{ ok: false, error: 'no enabled webhook endpoints' }` verbatim, not papered over — `/phone/*`-style routes become servable in plan 02-05, and until then a floor with no webhook endpoint genuinely has nothing to expose.
- **Handed to plan 02-12:** the deferred `tunnelmole` npm dependency removal (D-06 — this machine has npm 11.6.2 against an npm-10-only lockfile constraint); the pre-existing `google/*`-inside-`//`-comment defect in `index.ts`'s comment-stripping (line 2119, unrelated to this plan, not this plan's file to fix).
- **DAEMON-05 is NOT marked complete in REQUIREMENTS.md.** Its off-by-default clause, the shared-helper consolidation, and the `hardKillTree` proof are all done and tested; its generated-token/rate-limiting/lockout bullets belong to plans 02-05/02-09 (stated explicitly in the plan's own `<verification>` section); and its live-close bullet is an announced skip this session, not a pass. Left `[ ]` accordingly.
- **Not verified in this session, by design (Windows-executed plan):** `npm run e2e` (Playwright, Linux/xvfb-only) and cross-platform CI on a draft PR — both are read off CI/the PR at phase-close, matching 02-02/02-03's own precedent. `MEASUREMENT UNAVAILABLE — a pushed branch + open PR with the 6-check matrix all green.`

---
*Phase: 02-the-daemon-and-the-protocol*
*Completed: 2026-08-23*

## Self-Check: PASSED

All created files verified present (`src/main/cloudflared.ts`, `src/main/tunnel.ts`,
`test/tunnel.test.cjs`, `scripts/tunnel-live-check.cjs`, this SUMMARY.md). All 8
commits verified present in `git log` (`1299454`, `af25cc3`, `61ffa2a`, `14ea13f`,
`b12b439`, `1c54c9f`, `66910f3`, `675054c`).
