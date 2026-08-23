# Phase 2: The Daemon and the Protocol - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-21
**Phase:** 2-the-daemon-and-the-protocol
**Mode:** `--auto` — no AskUserQuestion; every area auto-resolved to the researched recommendation.
Four `gsd-advisor-researcher` agents ran in parallel (tunnel close, Android PWA surface, headless
shape, per-agent MCP). Every load-bearing claim was re-verified by the orchestrator against live
source before locking. Calibration tier: **standard** (2-4 options), resolved from USER-PROFILE.md
`Vendor Philosophy: pragmatic-fast`. `NON_TECHNICAL_OWNER = false` — no `learning_style: guided`, no
"jargon" trigger, so technical framing was preserved.
**Areas discussed:** extraction shape & gate, headless daemon shape, tunnel with a real close, the
Android phone surface & auth, Telegram/Discord rails, per-agent MCP consent, engine parity honesty,
answer routing (GSD-06)

**`[--auto] Selected all gray areas:`** extraction-shape-and-gate, headless-daemon-shape,
tunnel-real-close, phone-surface-and-auth, telegram-discord-rails, per-agent-mcp-consent,
engine-parity-honesty, answer-routing.

**Todos cross-referenced:** `gsd-sdk query todo.match-phase 2` → `todo_count: 0`. Nothing folded.

---

## Extraction shape and the internal gate (STRUCT-01, STRUCT-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Side-effect-free `src/main/floor/` + injectable `bootFloor(deps)`; `index.ts` left as Electron wiring | Construction moves inside `bootFloor`; the gate is a passing `test/boot-floor.test.cjs` | ✓ |
| Mechanical file-split by line count / section banner | Moves lines, leaves module-scope construction intact — would pass a line-count gate and change nothing | |
| Full DI container | Solves a problem this codebase does not have; ~7 injectable fields do not need a framework | |

**Choice:** injectable `bootFloor(deps)` (recommended default).
**Notes:** The decisive input was a measurement, not a preference. `loadTs('src/main/index.ts')` was
run: it gets past the `electron` import (the stub in `test/load-ts.cjs` handles it), executes
`initFileLogging()` for real, and dies at `app.on is not a function`. So the roadmap's stated reason
for untestability is the wrong mechanism, and a split that does not remove module-scope side effects
would satisfy the roadmap's wording while satisfying none of its intent. `SHUTDOWN_STEPS`
(`index.ts:4340`) was adopted as the seam list because it is the author's own inverse of the boot
order. VS Code's `electron-main/main.ts` was taken as precedent.

---

## Headless daemon shape (DAEMON-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Windowless Electron, one process, `--headless` argv gate | ~6 named edits + the extraction; keeps `safeStorage`, `Notification`, `powerMonitor` and all 153 handlers in place | ✓ |
| Separate plain-Node daemon the Electron UI attaches to | 39 MB vs 290 MB and trivially testable — but `safeStorage` is Electron-only and `integrations.ts` is built on it | |
| `ELECTRON_RUN_AS_NODE=1` on the Electron binary as the daemon | Strictly dominated: needs the same wire protocol *and* still loses `safeStorage` (`require('electron')` throws in Node mode) | |

**Choice:** windowless Electron (recommended default).
**Notes:** My own initial assumption — that native-module ABI would force windowless Electron — was
**wrong and was corrected by measurement**: `better-sqlite3@^13` resolves an N-API prebuild and both
it and `node-pty@1.1.0` load under plain Node v24. The real disqualifier for a Node daemon is
`safeStorage` (`integrations.ts:19`, `:122-125`). The accepted cost is recorded rather than glossed:
~290 MB resident for a floor with no windows, and `disableHardwareAcceleration()` does not remove the
GPU process. A separate finding came out of this area and is locked as D-09: `before-quit`
(`index.ts:5783-5790`) preventDefaults on live PTYs and only asks the renderer to confirm *if a window
exists*, so a headless floor with live agents is currently unquittable.

---

## Tunnel with a real close (DAEMON-05)

| Option | Description | Selected |
|--------|-------------|----------|
| `cloudflared tunnel --url` spawned as a child process | Live-verified close on Win11: 200 → kill (12 ms) → 502 → 530, never 200 again. No account, static Go binary, no asar/`ELECTRON_RUN_AS_NODE` work | ✓ |
| `tunnelmole` CLI spawned as a child process | Also live-verified (instant 404), and zero new dependencies — but the public hostname embeds the operator's WAN IP, and it phones home on every start | |
| Tailscale Funnel | The only $0 option with a stable URL — but needs an account and a system daemon, and its close was **not** live-verified | |
| Keep the library call and document the leak | Rejected: DAEMON-05 names the close as a prerequisite, "not a nice-to-have" | |

**Choice:** cloudflared as a spawned child (recommended).
**Notes:** The premise that this was impossible did not survive. `stop()` cannot close a *library*
call — `tunnelmole`'s websocket never escapes `connect()`, so the in-repo comment is accurate — but
the CLI wraps the same function, so a child process supplies the missing disposer. tunnelmole-as-child
is the smaller diff and lost anyway, on the WAN-IP-in-hostname leak, because this door fronts agent
CLIs with bypassed permissions. `bore.pub` was ruled out for having no TLS at all. Two implementation
facts were carried into CONTEXT.md rather than left to discovery: `procKill.ts:34 hardKillTree` already
does the cross-platform kill, and `openTunnel()`/`stop()` in `slack.ts` and `webhook.ts` are
byte-identical duplicates that must become one helper.

---

## The Android phone surface and its auth (DAEMON-02)

| Option (auth) | Description | Selected |
|--------|-------------|----------|
| QR enrollment URL → one-time exchange → long-lived bearer in IndexedDB, `Authorization` header | The QR carries origin **and** credential together, which is the only shape where one scan fixes both halves of an origin rotation | ✓ |
| Same QR → `HttpOnly; Secure; SameSite` signed session cookie | Genuinely safe on these PSL-listed hosts, but origin-scoped and dies with the hostname exactly like the bearer — buys nothing against the real failure mode, for 50% more code on the trust boundary | |
| WebAuthn / passkey | Structurally broken: the RP ID must be a registrable domain and `tunnelmole.net` is a public suffix, so the credential dies every session | |

| Option (build) | Description | Selected |
|--------|-------------|----------|
| Hand-written static files under `resources/phone/` | A question list, a textarea and a POST — `index.html` + `sw.js` + manifest + 2 icons | ✓ |
| Second Vite entry in the existing renderer input map | Reuses React and `@shared` types; kept as the documented upgrade path | |
| A route inside the existing renderer | Disqualifying: written against the preload `window.cth` bridge, which does not exist in a phone browser | |

**Choice:** QR-enrolled bearer + hand-written static bundle (both recommended).
**Notes:** Two findings reshaped this area. First, **the tunnel is mandatory** — `http://192.168.x.x`
is not a secure context, so a LAN-only path yields a browser shortcut, not an installed PWA, and
calling that "added to the home screen" would be an over-claim. Second, **origin churn is the dominant
failure mode**: a new hostname kills the WebAPK, the service worker, all origin storage and the push
subscription at once, so the design optimises for one-action re-onboarding rather than pretending the
URL is stable. The renderer bundle was measured at 12,228.98 kB, which settled the build-shape option
before the architectural argument even ran. Notification shape was decided in the same area:
visibility-gated polling plus Web Push (VAPID, free, Node-core crypto), with SSE excluded because
TryCloudflare does not support it and it only delivers in the foreground anyway.

---

## Telegram and Discord rails (DAEMON-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-endpoint verification strategy on the existing `WebhookServer` | Telegram is a header compare; Discord needs Ed25519 over `timestamp + body` | ✓ |
| Two new bespoke servers | Rejected: a second trust boundary to get right, against one that is already correct | |

**Choice:** per-endpoint verifier on the existing rails.
**Notes:** Verified locally that `node:crypto` does Ed25519 sign/verify natively, so Discord costs
zero new dependencies. The honest part is that "route onto the existing rails" is not free — today
every endpoint shares one hardcoded secret-compare, and Discord does not fit it.

---

## Per-agent MCP consent (DAEMON-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Floor-wide for the `safe-readonly` tier; per-agent grant for `write`/`secret` only | The tier branch already exists and is already fail-closed at `hive.ts:1235` — consent becomes a change of where one boolean is read from | ✓ |
| Per-agent override map layered over the floor default | Buys per-agent control of the safe tier that nobody asked for, and blurs "granted here" vs "inherited" on the card — the exact signal consent carries | |
| Per-agent only, floor becomes a hire-time seed | Config migration plus N repeated grants on a single-operator floor | |

**Choice:** tier-split consent (recommended).
**Notes:** This area surfaced the second GATE-01-shaped defect. `hive.ts:1192` writes `mcpServers`
into the per-session file passed via `--settings`, and `mcpServers` is not a documented `settings.json`
key — so the shipped default MCP bundle may be a silent no-op today, while the in-source comment
asserts "Claude merges this additively". Verification with `/mcp` inside a spawned agent is a
prerequisite, not a task. Per-engine support was researched to a table: 7 clean, 1 unverified
(antigravity), 3 unsupported (kimi, pi, custom). No engine is confirmed to hot-reload a changed server
set, so grants on a running agent must show `pending · restart` rather than claim a live connection.

---

## Engine parity honesty (PARITY-01a/01b/02/03)

| Option | Description | Selected |
|--------|-------------|----------|
| Build what is buildable (kimi's bridge, proxy-bridge cost where a base URL exists); declare the rest through a channel that actually renders | Splits the requirement the way PARITY-01b was already split, and restates PARITY-02 rather than faking it | ✓ |
| Claim parity by estimating tokens locally for engines that emit none | Fabrication — explicitly banned by the project's own out-of-scope table | |
| Drop the engines that cannot reach parity | Not in scope; the requirement asks for honesty about them, not their removal | |

**Choice:** build-or-declare (recommended).
**Notes:** The headline finding of the whole discussion landed here: **`capabilityLine()` has zero
production consumers** — 0 in `src/main`, 0 in `src/renderer`, 0 in `src/preload`; its only caller is
`test/engine-parity.test.cjs`, which asserts its strings. So README's engine-limitation table
documents a UI that does not exist, PARITY-01b is entirely unbuilt, and Phase 1's D-40 — which called
`capabilityLine` "the established per-engine gap channel" — rests on the same false assumption and
must be re-checked. Two further corrections: kimi belongs to PARITY-01a (it supports lifecycle hooks
and simply has no bridge), not to the label list; and PARITY-02's "all eleven" is unachievable for
copilot and custom by construction and must be restated in the plan.

---

## Answer routing (GSD-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Record `askedBy` on the `humanQA` entry; `AskMeTab` addresses `askedBy ?? assignee ?? 'god'` | Reuses the identity `task.cjs claim` already reads from `process.env.AGENT_ID`; back-compatible for entries written before the change | ✓ |
| Free-text address field in the UI | Puts an agent-id typo between a human and an unblocked card | |
| Agent picker defaulting to the card's assignee | Half the answer — the asker is not always the assignee, and the record has no `askedBy` to fall back from | |

**Choice:** `askedBy` on the record (recommended).
**Notes:** The protocol already supports this — `HiveMessage.to` accepts any agentId, and the message
carries `conversation`/`in_reply_to`. The hardcode is at `AskMeTab.tsx:92`, **not `:93`** as the
roadmap states. The one architectural point settled here: the answer goes to that agent's hive
**inbox**, never into its PTY, so ADR-0001 is untouched; and the god must still be informed, or the
card stays blocked with nobody moving it.

---

## Claude's Discretion

Auto-mode resolved every gray area to its researched recommendation, so the following were left to the
planner rather than pre-locked: plan slicing and wave assignment (subject to the extraction gate);
module boundaries inside `src/main/floor/` beyond the `SHUTDOWN_STEPS` list; disjoint file-ownership
per agent; how the `cloudflared` binary is acquired (bundled ~55 MB/platform vs downloaded on first
enable — note there is no `windows-arm64` asset); which PARITY-01b surfaces the phase covers and in
what order; which extra engines actually get proxy-bridge cost; and whether the phone bundle stays
hand-written or is promoted to a Vite entry.

## Deferred Ideas

Tailscale Funnel for a stable phone origin (close semantics must be live-verified first); a local CA +
static-LAN-IP HTTPS; a second Vite entry for the phone bundle; serving the phone shell from a stable
static host; WebAuthn once a stable origin exists; a plain-Node daemon (blocked only by `safeStorage`,
not by native ABI); per-agent control of the safe-readonly MCP tier; antigravity cost via a `gemini`
sidecar mode; Windows/macOS Electron-launching e2e runners; a multi-hour cloudflared soak.

## Scope creep redirected

None. Every candidate that fell outside the twelve requirements was written to Deferred Ideas rather
than absorbed. Two items that *look* like scope creep were kept deliberately because they are
prerequisites rather than additions: amending ADR-0001 (D-12, unowned by any Phase 1 plan and made
load-bearing by DAEMON-01) and verifying the MCP settings channel (D-25, without which DAEMON-04 is
built on a no-op).
