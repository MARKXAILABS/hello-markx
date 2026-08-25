---
status: partial
phase: 02-the-daemon-and-the-protocol
source: [02-VERIFICATION.md]
started: 2026-08-25T00:45:00Z
updated: 2026-08-25T00:45:00Z
---

## Current Test

[awaiting operator]

> **None of these rows may be filled in from a SUMMARY, a plan, or an agent's report.**
> Every one is here precisely because it cannot be closed without the operator, their
> hardware, their credentials, or a different network. The automated/localhost half of each
> is already built and green — that half is stated per row so the remaining work is exact.

## Tests

### 1. Headless floor — spawn, mail, failover with no window (DAEMON-01)

**Do:** start the packaged app (or `electron .`) with `--headless`, no window, no Electron dev
tooling attached. Confirm at least one agent spawns, a mail message is delivered between two
agents, and — if a Claude account failover condition can be induced — failover completes, all
with the window never opened.

**expected:** agent spawn, mail delivery and failover all observable in `fleet.json` / logs,
with zero renderer process ever created.

**why it needs you:** a real Electron process with real PTYs and real agent CLIs. The unit half
(`test/boot-floor.test.cjs`, 19/19 green) is done; `02-VALIDATION.md` states plainly that the
unit half alone is **"not a pass"** for criterion 2.

**weight:** this is the phase's headline claim — *"the office stops depending on a window."*
It is also the one item where a bad outcome would be most surprising, because a startup crash
in the packaged app already slipped past a fully green suite once this phase (`d0f3775`).

**result:** [pending]

---

### 2. Phone PWA on a real Android device (DAEMON-02)

**Do:** install the phone PWA on a physical Android device over the tunnel, add it to the home
screen, and answer an ASK ME question from the phone.

**expected:** the WebAPK installs, runs `display:standalone`, and the answer reaches the asking
agent's inbox.

**why it needs you:** no physical Android device on this network. Nothing in the phone work was
tested on real hardware. DAEMON-02's own text names the localhost-verified auth path as *"the
honest fallback … never as completion"* — only that fallback is built.

**already proven without a device:** six real `curl` round trips against a loopback server —
`GET /phone/` 200, traversal `GET /phone/../config.json` 404, no-bearer 401, enroll 200,
**replay 401**, bearer 200 (`scripts/phone-curl-check.cjs`, exit 0, re-run independently).

**result:** [pending]

---

### 3. Telegram and Discord live round-trip (DAEMON-03)

**Do:** send a real Telegram message and a real Discord interaction to the paired webhook
endpoints, using your own bot token and Discord application public key.

**expected:** both route onto the existing webhook rails and reach the addressed agent's inbox.

**why it needs you:** operator-supplied credentials. The localhost verifiers — Telegram
secret-token compare, Discord Ed25519 accept/reject/malformed — are automated and green
(`test/webhook-endpoints.test.cjs`, 40 passing assertions, independently re-run).

**result:** [pending]

---

### 4. Live tunnel close, and a multi-hour soak (DAEMON-05)

**Do:** run `node scripts/tunnel-live-check.cjs` on a network whose DNS resolver can reach
freshly-minted `*.trycloudflare.com` subdomains. Separately, leave a tunnel up for several hours
to observe stability beyond the ~30s window actually verified.

**expected:** the open-then-close poll observes the public URL serving the app, then genuinely
530/refused after `stop()` — proving the close, rather than proving the `hardKillTree(pid)` call
in isolation.

**why it needs you — and this one has a concrete fix:** the blocker is **environmental, not
code**. Run live three times this session, including outside the tool sandbox: the script opens
a real tunnel with a correctly-shaped hostname, then every probe fails at the DNS layer. Root
cause traced by direct `nslookup`: this LAN's resolver (JioFiber router at `192.168.31.1`)
returns **NXDOMAIN for freshly-minted `*.trycloudflare.com` subdomains**, while the
`trycloudflare.com` apex resolves fine and general egress works (`github.com` → 200). Exit code
3, an announced skip the script distinguishes in its own logic from a claimed defect (exit 2).

**Likely one-line fix on your side:** point DNS at `8.8.8.8` or `1.1.1.1` and re-run. This is
the cheapest open item on the list and would close DAEMON-05's automated half outright.

**result:** [pending]

---

### 5. The five LIVE-UNVERIFIED engine bridges (PARITY-03, PARITY-01a)

**Do:** exercise the pi, opencode, crush, qwen and kimi bridges against real accounts.

**expected:** each either verifies live and has its marker removed, or stays marked
`LIVE-UNVERIFIED`.

**why it needs you:** none of the five CLIs is installed here and no account was supplied. This
is the **expected outcome under the zero-recurring-cost rule, not a failure** — the phase's own
validation doc says "a plan that schedules 'verify the four bridges' without an operator account
is scheduling a lie."

**the honest parity ledger** (re-derived, not copied): engines that can receive mail **8 → 9**;
live-verified bridges **unchanged at zero**; LIVE-UNVERIFIED bridges **4 → 5** (kimi joined).
Pinned by `test/repo-claims.test.cjs` (31/31): `LIVE_UNVERIFIED_TOTAL=18` across 6 files,
`LIVE_UNVERIFIED_ENGINES=['pi','opencode','crush','qwen','kimi']`.

**result:** [pending]

---

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

None recorded yet — no test has been run by the operator.

Note that the phase's one **non**-human gap is tracked separately in `02-VERIFICATION.md`, not
here: criterion 1 / STRUCT-01 (`index.ts` at 5,021 lines with 160 IPC handlers, `spawnAgentCore`
still resident at 502 lines) is a code gap, closeable without the operator, and routes to
`/gsd:plan-phase 2 --gaps`.
