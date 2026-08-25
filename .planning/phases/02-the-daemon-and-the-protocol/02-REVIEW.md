---
status: resolved
phase: 02-the-daemon-and-the-protocol
depth: standard
reviewed_at: 2026-08-24
baseline: 90a6cc9
head_at_review: 8e85748
findings_total: 8
findings_critical: 1
findings_high: 3
findings_medium: 2
findings_low: 1
findings_uncertain: 1
---

# Phase 02 Code Review — the-daemon-and-the-protocol

## Method

75 changed files (38 under `src/`) across 95 commits from `90a6cc9`. Reviewed by three
parallel domain reviewers, each reading its scope in full rather than sampling diffs:

| Reviewer | Scope | Coverage |
|---|---|---|
| Trust boundary & network | `webhook.ts`, `tunnel.ts`, `cloudflared.ts`, `push.ts`, `slack.ts`, `triggers.ts`, `mcpCatalog.ts`, `resources/phone/**`, the three live-check scripts, 2 test files | **complete — nothing skipped** |
| Main process core | `index.ts`, `floor/{boot,deps,headless,lifecycle}.ts`, `hive.ts`, `hiveProvisioning.ts`, `hiveTemplates.ts`, `gitCommitter.ts`, `delivery.ts`, `queueDelivery.ts`, `telemetry.ts`, `config.ts`, `integrationBroker.ts`, 4 test files | partial — see Coverage gaps |
| Renderer, preload & providers | `preload/index.ts`, 10 components, `useHive.ts`, `store/config.ts`, `vendor/qrcodegen.ts`, `agentProvider.ts`, `providerAutomation.ts`, 2 test files | partial — see Coverage gaps |

**Every finding below was independently re-verified by the orchestrator against the live
tree before being recorded here.** Reviewer claims were not taken on trust; one finding was
downgraded (SEC-02) and one reclassified (CR-02) as a result.

Gates at review time: `npm run typecheck` exit 0 · `npm run build` exit 0 ·
`npm test` 805 tests / 798 pass / **0 fail** / 7 skipped.

---

## Findings

### [CRITICAL] CR-01 — the consent modal reports a granted MCP server as ungranted after a partial batch failure

**File:** `src/renderer/src/components/McpConsentModal.tsx:110-129`

**Problem:** `submitGrant` grants each checked server in a sequential `await` loop and
`return`s early on the first failure. `load()` — the only path that republishes into the
renderer-wide `mcpGrantsSnapshot` singleton that `AgentCard.tsx` reads — sits *after* the
loop, so it never runs on the failure path. `setKeys(...)`, which clears submitted secrets,
is also after the loop.

**Failure scenario:** operator checks two servers and submits. The first grant succeeds in
main; the second fails (bad secret, IPC error, disk error). The modal and every `AgentCard`
on the floor continue to display the **first server as not granted** for the rest of the
session, while main has genuinely granted it. The operator's mental model of what this agent
can do is now wrong in the permissive direction. Separately, the first server's plaintext
secret remains in React state, violating the file's own documented
write-once-clear-immediately invariant.

**Why this is CRITICAL:** a consent dialog that misreports what was granted is worse than no
dialog — it converts an explicit capability grant into a silent one.

**Fix:** call `load()` on the failure path too (or use `try/finally`), and clear the keys for
ids that already succeeded. Partial success must republish, not discard.

---

### [HIGH] CR-02 — the MCP defaults snapshot is latched once per session and goes stale on a Settings change

**File:** `src/renderer/src/store/config.ts:592, 620-631`

**Problem:** `mcpGrantsEnsureStarted` is a module-level boolean set once and never reset, so
the `getConfig()` fetch that seeds `mcpDefaults` runs exactly once per app session.
`McpDefaultsSettings.tsx` writes the floor-wide safe-readonly toggle to config directly,
bypassing `setMcpGrants`, so nothing invalidates the cached snapshot.

**Failure scenario:** operator changes the safe-readonly MCP toggle in Settings. Every agent
card's "MCP N safe" count keeps rendering the pre-change number until the app is restarted.

**Reclassified from the reviewer's CRITICAL to HIGH by the orchestrator:** this staleness
affects the *safe-readonly count*, not grant state, so it misinforms without misrepresenting
an actual write/secret grant. Still user-visible wrong data on a capability surface.

**Fix:** invalidate or re-seed the snapshot when the defaults toggle is written — route that
write through `setMcpGrants`, or subscribe the store to config changes.

---

### [HIGH] SEC-01 — `sendPush()` throws across a boundary it documents as never throwing

**File:** `src/main/push.ts:279-284`

**Problem:** the `headers` object literal — which calls
`vapidAuthHeader(sub.endpoint, ...)` — is constructed **before** the `try` block.
`vapidAuthHeader` does `new URL(endpoint).origin` with no prior validation, and
`vapidPrivateKeyObject` throws on a malformed stored key. The module header and the
function's own docstring both promise *"Never throws across this boundary."*

**Failure scenario:** reproduced live by the reviewer against the real module — a
`PushSubscription` with a valid P-256 `p256dh`/`auth` but a non-URL `endpoint` makes
`await sendPush(...)` **reject** with `Invalid URL` instead of resolving `{ok:false}`. A
caller written against the documented contract (a loop sending to several devices and pruning
dead subscriptions) aborts the whole loop on the first bad subscription. `PushSubscription.endpoint`
arrives unmodified from the browser client, per this file's own docstring.

**Reachability, stated honestly:** no subscribe/intake route exists yet in this phase, so it
is not network-triggerable today. It becomes live the moment that route lands, and the
contract is already being relied on.

**Fix:** move `headers` construction inside the `try`, and validate `sub.endpoint` as a
well-formed absolute URL first. Also length/shape-check the persisted VAPID keypair in
`ensureVapidKeys` so a corrupted state file regenerates rather than being trusted.

---

### [HIGH] MAIN-01 — a failed PTY kill strands a worker in `releasing` forever, leaking a concurrency slot

**File:** `src/main/index.ts:4667-4676` (`workers:stop`), `:4534-4571` (`ephemeralWorkerTick`)

**Problem:** both paths set `rec.releasing = true` and call `ptyManager.kill()` **without
checking its return value**. `PtyManager.kill()` never throws — it swallows failures into
`{ok:false}` — and nothing anywhere resets `releasing` back to `false` (confirmed by grep:
every occurrence is a set-to-true or a read).

**Failure scenario:** a kill fails (permission, already-dead handle, Windows PTY quirk). The
worker is now permanently stuck: `if (rec.releasing) continue;` at :4535 makes the reap loop
skip it forever, `if (rec.releasing) return { ok: true };` at :4671 makes a retry report false
success, and it permanently occupies a `maxConcurrentWorkers` slot. Repeated occurrences
starve the floor until restart.

**Contrast in the same file:** `pty:kill` and `killAgent` call `teardownPty` unconditionally
rather than depending on the async exit event — the correct pattern is already present here.

**Note:** pre-dates phase 02, but sits squarely in this phase's orphaned-process priority and
is untested.

**Fix:** check `kill()`'s result; on failure either reset `releasing` so a later reap retries,
or call `teardownPty` unconditionally as the sibling handlers do.

---

### [MEDIUM] MAIN-02 — `mcp:agentState` builds a filesystem path from an unvalidated renderer-supplied `agentId`

**File:** `src/main/index.ts` (`mcp:agentState` → `hive.mcpArmed` / `hive.agentDir`)

**Problem:** the agent id from the renderer is used to construct a directory path with no
registry-membership check, on IPC surface newly reachable this phase.

**Failure scenario:** a bounded path-traversal read primitive — leaks JSON key names only,
not file contents. The renderer is the less-trusted side of this boundary by design.

**Fix:** validate `agentId` against the live registry before path construction.

---

### [MEDIUM] MAIN-03 — the boot-order AST guard has three blind spots for the bug class it exists to catch

**File:** `test/boot-order.test.cjs`

**Problem:** the guard added in `d0f3775` catches direct module-scope dereference of a
`boot.ts` `export let` singleton, but would miss destructuring, non-null-assertion bypasses,
and capture-by-value.

**Why it matters:** this is the guard for a bug class that **already shipped** — a startup
crash on every launch of the packaged app that `npm test`, `typecheck` and `eslint` were all
structurally blind to, because every suite stubs `electron` and never evaluates the real
module graph. A guard with holes here is a guard that will let the same class through again.

**Currently exploited:** none. The reviewer hand-traced every remaining singleton reference in
`index.ts` and confirmed no live recurrence, and verified only `index.ts` imports from
`floor/boot`, so the guard's file scope is structurally correct.

**Fix:** extend the AST check to cover the three shapes.

---

### [LOW] SEC-02 — the reserved-id allowlist doesn't cover the internal rate-bucket namespace

**File:** `src/shared/triggers.ts:202-209`; buckets at `src/main/webhook.ts:187,199,207`

**Problem:** `RESERVED_ENDPOINT_IDS` is `['phone']` only. The internal rate-limit bucket keys
are `':phone'`, `':phone:auth'` and `':unknown'`, none of which are reserved. `setEndpoints`'s
only rejection check is `isReservedEndpointId`.

**Downgraded from the reviewer's MEDIUM by the orchestrator after resolving its explicit
uncertainty flag:** `sanitizeWebhookTrigger` (`index.ts:3794`) enforces
`/^[A-Za-z0-9._-]{1,64}$/`, which excludes colons — so `:phone` cannot be saved through the
UI/IPC path, and the collision is **not reachable in practice**.

**Residual risk:** the reservation is enforced in two places and only one of them checks
charset, so a hand-edited `config.json` reaching `setEndpoints` by another route would not be
caught by the reservation itself. Defense-in-depth gap, not a live vulnerability.

**Fix:** reserve the `:` prefix in `isReservedEndpointId`, or key internal buckets in a
separate map that cannot collide with any operator id.

---

### [UNCERTAIN] SEC-03 — possible timing signal for whether the phone lockout is engaged

**File:** `src/main/webhook.ts:620-631` (`phoneAuthGate`)

**Problem:** when locked out, `verifyPhoneBearer` (sha256 + `timingSafeEqual` over every
stored digest) is skipped entirely; when not locked out but the bearer is wrong, the full loop
runs. Same 401 body either way, but measurably different work.

**Explicitly not asserted as exploitable.** The reviewer could not construct a
network-realistic exploitation over a tunnel with cloudflared's jitter, and the value to an
attacker (a few seconds' notice that a 30s lockout cleared, against a 192-bit bearer) is
minimal. Recorded as observed, not as a defect.

**Fix (optional):** run a decoy compare on the locked-out path, matching the length-oracle
discipline used elsewhere in this file.

---

## Clean areas — verified, not assumed

These were adversarially traced and held up. Recorded because "we checked and it was sound"
is evidence too.

**Trust boundary**
- Every verifier (`verifySharedSecret`, `verifyTelegram`, `verifyDiscord`) hashes both sides
  to fixed width before `timingSafeEqual`; an unknown endpoint id runs a real comparison
  against a per-process decoy rather than short-circuiting. No path fails cheaper for
  "unknown id" than for "wrong secret".
- Single-use enrollment burn is race-free — `phoneEnrollment = null` happens synchronously
  with no `await` between compare and burn.
- `/phone/**` static traversal is genuinely closed: no request-derived string is ever joined
  into a path. All six traversal shapes verified against the implementation, plus a
  prototype-pollution trace (`__proto__`, `constructor`, `hasOwnProperty` all resolve to
  values lacking `.file`, producing a 404, never a disclosure).
- CSP hash pinning in `resources/phone/index.html` **independently recomputed** and confirmed
  byte-for-byte. The header policy is looser, but multi-source CSP is enforced as an
  intersection, so the tight pinned policy governs.
- `sw.js` has no fetch handler and no Cache Storage; the push body is a fixed phrase, never
  the question text.
- `tunnel.ts` keeps stdout/stderr subscribed after settling (avoiding the pipe-buffer hang),
  kills before rejecting on the hard ceiling, and `stop()` is idempotent.
- `cloudflared.ts` buffers, hashes and compares against the pinned digest **before** any
  write — a mismatch leaves nothing on disk. All five committed digests validated as 64-char
  lowercase hex.
- `push.ts` RFC 8188/8291 layout verified by hand: header `salt(16)||rs(4)||idlen(1)||keyid(65)`
  = 86 bytes, `0x02` delimiter, two-stage HKDF, `MAX_PUSH_PLAINTEXT_BYTES` arithmetic.
  **Salt and ephemeral keypair are freshly generated on every production call** — no reuse;
  the `salt`/`localKeys` params are test-only. `dsaEncoding: 'ieee-p1363'` correct for VAPID.
- `slack.ts`'s phase-02 diff is scoped purely to the tunnel-provider swap; HMAC verification,
  the 5-minute replay window and loopback binding are byte-identical to baseline.

**Main process**
- `SHUTDOWN_STEPS`/`bootFloor` construction–teardown symmetry; the D-09 headless-quit deadlock
  fix; `lifecycle.ts` teardown fail-safety; D-11 mail-gap boundary validation with direct test
  coverage; GitCommitter's secret-scrub self-disclosure; the MCP-consent migration and its
  secret-sweep prefix correctness; the assign-before-listen fix in `telemetry.ts`.
- **Boot-order sibling hunt: none found.** Every remaining singleton reference in `index.ts`
  hand-traced; aliasing, destructuring, non-null-assertion and capture-by-value all checked.

**Renderer / preload**
- `preload/index.ts` read in full (1,606 lines): no raw `ipcRenderer` exposure, no channel
  wildcarding, consistent write-only secret contracts.
- The titlebar tunnel chip is driven purely by `tunnelStatus()`/`onTunnelChanged` — **no
  optimistic local flag**, so it cannot claim PUBLIC while the tunnel is down.
- The pairing QR re-mints on host change, is keyed to prevent a stale remount, and degrades
  to *no* QR rather than a stale one, with tests in `test/qr-vendor.test.cjs`.

**Test quality** — the suites genuinely exercise negative cases: unknown-id/wrong-secret
indistinguishability, all six traversal shapes, enrollment burn-before-respond with a replay
proof, lockout engage *and* clear on a fake clock, byte-identical 401 across five failure
modes, Discord tampered-body/stale-timestamp rejection, 410/404-vs-429 semantics. Where a
published RFC 8291 §5 vector could not be reproduced, the test file marks it
`MEASUREMENT UNAVAILABLE` and labels its substitute "symmetry, not correctness" rather than
implying more.

---

## Coverage gaps — stated, not papered over

The reviewers flagged these themselves rather than implying full coverage:

- `src/renderer/src/components/SettingsModal.tsx` — ~1,100 of 2,303 lines unread
  (confirmed via diff to be pre-existing, out-of-phase code)
- `src/renderer/src/components/CommandCenterPanel.tsx` — ~1,350 of 1,739 lines unread
- `src/main/index.ts` — most of the ~160 IPC handlers pattern-scanned rather than individually
  traced end-to-end
- `hiveProvisioning.ts` — 5 per-provider installers diffed but not read line-by-line
  (verbatim lifts from the 02-01 split)
- `hiveTemplates.ts` — 7 shim template bodies diffed but not read line-by-line (verbatim lifts)

`index.ts`'s IPC handler surface is the largest genuine gap. MAIN-02 was found there by
pattern scan, which suggests a full trace would be worthwhile before this ships publicly.

---

## Verdict

**Not clean — 1 CRITICAL and 3 HIGH findings require code changes.**

CR-01 should be fixed before this phase is considered shippable: it is on the consent path,
it is the failure mode the phase's own UI-SPEC names as unacceptable, and it has zero test
coverage. MAIN-01 and SEC-01 are both contract violations with concrete failure scenarios.
CR-02 is user-visible wrong data on a capability surface.

None of these block *phase verification* — they are defects in delivered work, not missing
work — but none should be waved through to a follow-up phase without an explicit decision.

Recommended: `/gsd:code-review 2 --fix` to apply, or fix CR-01 + MAIN-01 + SEC-01 + CR-02
directly, each with the regression test its finding names.


---

## Resolution — all findings closed

Fixed across two rounds, each fix driven RED first, then adversarially verified by
three independent skeptics per fix (correctness / regression / test-honesty), each
instructed to REFUTE and to default to refuted when uncertain.

| Finding | Sev | Commit(s) | Closed by |
|---|---|---|---|
| CR-01 | CRITICAL | `16b93eb` | `grantMcpBatch(ids, grant)` extracted to `store/config.ts`, reporting `{granted, error}` — the ids main actually accepted — instead of discarding them. `submitGrant` is now straight-line with no early return: clears keys for exactly the succeeded ids, surfaces the error, republishes unconditionally. |
| CR-02 | HIGH | `0b9014c` | The defaults write routed through `setMcpGrants`, publishing main's SAVED map (not the sent patch) so D-27's prune cannot desync the mirror. |
| SEC-01 | HIGH | `cba55d5`, `243dc37` | `malformedSubscription()` non-throwing guard; the ENTIRE `sendPush` body moved inside the try; `vapidKeysMatch()` now enforces the pair check the comment previously only claimed. |
| MAIN-01 | HIGH | `a17950b` | A worker release always runs teardown, so a failed kill cannot strand a `maxConcurrentWorkers` slot or report false success. |
| MAIN-02 | MEDIUM | `2f10127`, `7133da5` | Shape guard `isSafeAgentId` on **all three** MCP handlers (round 1 guarded one, with a registry test that broke DAEMON-04 for non-hive agents). |
| MAIN-03 | MEDIUM | `c47abb8` | AST guard extended to destructuring, non-null assertion and capture-by-value — **which caught a live instance**. |
| SEC-02 | LOW | — | Unreachable (`sanitizeWebhookTrigger` excludes colons). Left as a documented defense-in-depth note. |
| SEC-03 | UNCERTAIN | — | Not asserted as exploitable; no exploit constructed. Left recorded. |

### What the adversarial pass caught that the fixers missed

Round 1's fixers all reported "fixed". Three were not:

1. **SEC-01's guard was placed outside the try**, so `sendPush(null, …)` began *rejecting* where it previously resolved `{ok:false}` — the fix for "throws across a boundary" reintroduced a throw across that boundary. Caught by a differential probe against `cba55d5^`.
2. **`ensureVapidKeys` documented a validation it did not perform.** `createPrivateKey({format:'jwk'})` accepts an empty, truncated, or foreign `d` (proven live on Node v24.13.0), so a mismatched key was trusted and would sign VAPID JWTs that never verify — silent, permanent 401s with nothing to trigger recovery. Now enforced by sign-then-verify against the advertised point; a `createPublicKey` point-compare was tried and rejected because Node echoes back the supplied x/y rather than deriving `d*G`.
3. **MAIN-02's membership check rejected real agents.** See the table row above.

Two false-greens were also caught and corrected — one by a fixer in its own work (a
brace-blanking scanner that blanked the exact `if (!res.ok) { return; }` under test
and passed vacuously), one by the orchestrator (a pin asserting the substring
`registry().agents[agentId]`, which a bare `?.provider` lookup also satisfied).

### Gates at resolution

`npm run typecheck` exit 0 · `npm run build` exit 0 · `npx eslint --max-warnings 0` exit 0 ·
`npm test` **824 tests / 817 pass / 0 fail / 7 skipped** (was 805/798/0/7 at review time —
+19 tests, all regression coverage for these findings).

### Coverage gaps from the review that remain open

Unchanged and still worth doing before this is public: `index.ts`'s ~160 IPC handlers were
pattern-scanned rather than individually traced. MAIN-02 was found *by* that scan, and the
follow-up then found two MORE ungated handlers on the same input — which is direct evidence
that a full trace of that surface would find more.
