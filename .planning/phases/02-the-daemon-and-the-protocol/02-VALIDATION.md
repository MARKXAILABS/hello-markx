---
phase: 2
slug: the-daemon-and-the-protocol
status: approved
nyquist_compliant: false
wave_0_complete: true
created: 2026-08-21
signed_off: 2026-08-23 — 54/54 tasks carry <automated> verify; all 11 Wave 0 surfaces owned by plans; no watch-mode flags; full suite 18.5s
revalidated: 2026-08-25 — post-execution audit; 19/19 mapped selectors re-executed exit 0 (345 passing assertions); wave_0_complete true; nyquist_compliant CORRECTED true->false because Manual-Only items remain open
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `02-RESEARCH.md` § Validation Architecture. Every "exists?" mark below was
> established by reading `test/` at `2f29d0b`, not asserted.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` (Node built-in) over `test/*.test.cjs` + `node:assert/strict`. No Jest/Vitest/Mocha, no config file. |
| **Config file** | none — `test/load-ts.cjs` is the loader (`ts.transpileModule` + a `require` shim + `@shared/` resolution + an `electron` stub; `require.cache` injection wins over the stub) |
| **Quick run command** | `node --test test/<file>.test.cjs` |
| **Full suite command** | `npm test` → `node --test test/*.test.cjs` |
| **Estimated runtime** | ~18.5 seconds (515 tests measured at `2f29d0b`) |
| **E2E** | Playwright over real Electron — separate workflow, **Linux/xvfb only**, `workers:1 retries:0` |
| **Coverage** | Not measured. No c8/nyc, no numeric gate. Do not introduce one in this phase. |

**Two gotchas that will silently produce a false green:**
- `node --test test/` does **not** work. Use the exact `test/*.test.cjs` glob.
- `npm run test:focused` is a hand-listed 33-file subset and `CONTRIBUTING.md` §7 **forbids gating on
  it**. It is never the gate.

---

## Sampling Rate

- **After every task commit:** the single affected `node --test test/<file>.test.cjs` (ms) +
  `npm run typecheck` (exit 0)
- **After every plan wave:** `npm test` (full, 18.5 s) + `npm run typecheck` + `npm run build`.
  **After Phase 1 plan 01-21 lands, also `npm run lint` with `--max-warnings 0`.**
- **Before `/gsd:verify-work`:** full suite green on all three CI platforms (no `continue-on-error`
  anywhere in the `test` matrix) + the e2e workflow green
- **Max feedback latency:** 19 seconds (full suite); sub-second for a single file

---

## Per-Requirement Verification Map

| Req | Behaviour to prove | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|
| STRUCT-01 | `bootFloor(fakeDeps)` boots a real floor with no Electron binary | unit | `node --test test/boot-floor.test.cjs` | ❌ W0 | ⬜ pending |
| STRUCT-01 | `floor.shutdown()` leaves zero live handles; every started subsystem is in the list | unit | same file | ❌ W0 | ⬜ pending |
| STRUCT-01 | agent lifecycle: `teardownPty` preserves a worktree with unintegrated work, removes a clean one | unit | `node --test test/agent-lifecycle.test.cjs` | ❌ W0 | ⬜ pending |
| STRUCT-01 | no module-scope `new X(` and no `process.on(` under `src/main/floor/**` | repo-fact | `node --test test/repo-claims.test.cjs` | ⚠️ extend | ⬜ pending |
| STRUCT-01 | all 153 IPC channel names still registered | repo-fact | `test/repo-claims.test.cjs` (grep `ipcMain.handle('…'`, compare to a committed list) | ❌ W0 | ⬜ pending |
| STRUCT-02 | `routeOnce` drains an outbox into an inbox and archives the source | unit | `node --test test/hive-router.test.cjs` | ❌ (writable today) | ⬜ pending |
| STRUCT-02 | exactly one git committer instance in `src/` (ADR-0004) | repo-fact | `test/repo-claims.test.cjs` | ❌ W0 | ⬜ pending |
| STRUCT-02 | the four existing committer tests still pass after the split | unit | `node --test test/hive-durability.test.cjs` | ✅ exists | ⬜ pending |
| DAEMON-01 | a headless floor with live PTYs **quits** (the D-09 deadlock) | unit | boot test: fake `ptyManager.list()` non-empty, assert the `quit()` dep is called | ❌ W0 | ⬜ pending |
| DAEMON-01 | mail to a hookless/proxy-tier agent is enqueued in main, not bounced, with no renderer | unit | `test/hive-router.test.cjs` — `emit` returns `false`; assert `delivery.enqueue` called and **no** `[undeliverable …]` bounce | ❌ W0 | ⬜ pending |
| DAEMON-01 | a Crush agent's protocol seed is enqueued by main | unit | `test/delivery-main.test.cjs` extension | ❌ W0 | ⬜ pending |
| DAEMON-01 | `window-all-closed` does not kill the floor in headless mode | repo-fact + unit | grep-pin + a unit test on the extracted predicate | ❌ W0 | ⬜ pending |
| DAEMON-02 | `/phone/*` is served; `phone` is a reserved endpoint id; an unknown id still 401s identically | unit | `node --test test/webhook-endpoints.test.cjs` | ⚠️ extend | ⬜ pending |
| DAEMON-02 | the enrollment token is single-use; a replayed QR fails | unit | same | ❌ W0 | ⬜ pending |
| DAEMON-02 | the phone assets are committed and resolvable in dev and packaged | repo-fact | `test/build-assets.test.cjs` | ⚠️ extend | ⬜ pending |
| DAEMON-03 | Telegram header compare is constant-time and no-enumeration | unit | `test/webhook-endpoints.test.cjs` | ❌ W0 | ⬜ pending |
| DAEMON-03 | Discord Ed25519 accepts a valid signature, rejects a tampered body | unit | same, using local `generateKeyPairSync('ed25519')` | ❌ W0 | ⬜ pending |
| DAEMON-04 | `<agentDir>/mcp.json` is written and `--mcp-config` is on the spawn argv | unit | new `test/mcp-per-agent.test.cjs` | ❌ W0 | ⬜ pending |
| DAEMON-04 | a `write`/`secret` server without explicit per-agent consent is **not** written (fail closed) | unit | same | ⚠️ floor-wide version exists | ⬜ pending |
| DAEMON-04 | revoke calls `deleteSecret` | unit | same | ❌ W0 | ⬜ pending |
| DAEMON-05 | the shared tunnel helper is used by both servers; neither retains an `openTunnel` body | repo-fact | `test/repo-claims.test.cjs` | ❌ W0 | ⬜ pending |
| DAEMON-05 | `stop()` calls `hardKillTree` with the child's pid | unit | `node --test test/tunnel.test.cjs` with an injected fake spawner | ❌ W0 | ⬜ pending |
| DAEMON-05 | the tunnel is off by default and never enabled as a side effect | repo-fact + unit | grep-pin on the config default + a boot-test assertion | ❌ W0 | ⬜ pending |
| GSD-06 | `--q` records `askedBy` from `AGENT_ID` | unit | `test/hive-task-mutation.test.cjs` | ⚠️ extend | ⬜ pending |
| GSD-06 | an entry with no `askedBy` falls through to assignee, then god | unit | same | ❌ W0 | ⬜ pending |
| GSD-06 | the god is still informed (D-39) | unit | same | ❌ W0 | ⬜ pending |
| PARITY-01a | kimi resolves to `{kind:'hooks', shim:'kimi'}` and the spawn argv carries `--config-file <agentDir>/…` | unit | `test/engine-parity.test.cjs` | ⚠️ extend | ⬜ pending |
| PARITY-01a | the generated kimi config **seeds from** the user's own file (auth survives) | unit | same, against a tmp `HOME` | ❌ W0 | ⬜ pending |
| PARITY-01b | **`capabilityLine` has ≥1 production consumer** | repo-fact | `test/repo-claims.test.cjs` — grep `src/renderer` for the import | ❌ W0 | ⬜ pending |
| PARITY-02 | each engine's `bridge`/`costTracking` matches what the spawn path actually wires | unit | `test/engine-parity.test.cjs` | ⚠️ extend | ⬜ pending |
| PARITY-03 | the `LIVE-UNVERIFIED` marker count in `src/main/hive.ts` matches a committed expected number | repo-fact | `test/repo-claims.test.cjs` | ❌ W0 | ⬜ pending |

**The PARITY-01b row is the honest gate for D-30.** `capabilityLine` currently has zero production
consumers; a repo-fact test asserting at least one is what stops this phase closing the same way the
last one did — with a tested pure function nothing renders.

**The PARITY-03 row is deliberately one-directional.** Pinning the marker count means unmarking a
bridge requires editing the expected number, which forces a reviewer to ask "verified against which
account?" — mechanically, in a diff, rather than by remembering to.

---

## Wave 0 Requirements

- [ ] `test/boot-floor.test.cjs` — `bootFloor(fakeDeps)`, shutdown, and the headless-quit deadlock
- [ ] `test/agent-lifecycle.test.cjs` — `teardownPty` worktree preservation
- [ ] `test/hive-router.test.cjs` — `routeOnce` + the no-renderer handoff path
- [ ] `test/tunnel.test.cjs` — `stop()` → `hardKillTree`, injected fake spawner
- [ ] `test/mcp-per-agent.test.cjs` — `<agentDir>/mcp.json` + `--mcp-config` + fail-closed consent
- [ ] Extensions to existing files: `repo-claims`, `webhook-endpoints`, `engine-parity`,
      `hive-task-mutation`, `delivery-main`, `build-assets`
- [ ] No framework install — `node --test` is already the harness

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Honest outcome if not run |
|---|---|---|---|
| Headless floor: spawn + mail + failover with no window | DAEMON-01 | Needs a real Electron process, real PTYs, real agent CLIs | **Not a pass.** Criterion 2 explicitly asks for both the `node --test` case *and* a live run. |
| The cloudflared close (D-16) | DAEMON-05 | Real outbound tunnel; ~7 s 502→530 transient; ~15 s poll window | A **targeted** test, skipped offline, whose skip is **announced** (`test/net-binding.test.cjs` pattern: `console.error('[…] case skipped — <reason>')`). Never in `npm test`. Never a silent skip. |
| Multi-hour cloudflared soak | DAEMON-05 | Cloudflare gives no SLA; quick tunnels are documented "testing and development only"; only ~30 s was verified | Deferred by CONTEXT.md. Record the ceiling. |
| macOS `setActivationPolicy('accessory')` | DAEMON-01 | No Mac available | `UNVERIFIED — needs a macOS machine`. Ships marked. |
| Linux login-item behaviour | DAEMON-01 | `setLoginItemSettings` is a no-op on Linux | State it in source, docs **and** UI. |

### Cannot be verified without an operator-supplied device or account

| Item | What is needed | Status |
|---|---|---|
| **DAEMON-02** — WebAPK install, `display:standalone`, Web Push while asleep | A physical Android phone on the network. Nothing in the phone research was tested on a real device. | The requirement names its own fallback: *"a localhost-verified auth path is the honest fallback."* Record it as such — **never as completion**. |
| **DAEMON-03 live** — Telegram / Discord | A bot token and a Discord application public key | Localhost verifier round-trips are the automated half; the live half is operator-supplied. |
| **PARITY-03** — pi, opencode, crush, qwen | A real paid account per engine. **None of these four CLIs is installed on this machine** — only `claude` and `codex` are present. | **All four stay `LIVE-UNVERIFIED`.** Under the zero-recurring-cost rule this is the expected outcome, not a failure. A plan that schedules "verify the four bridges" without an operator account is scheduling a lie. |
| **PARITY-01a** — the kimi bridge | Kimi Code CLI + a Moonshot account | ⚠️ **A kimi bridge built now makes it FIVE `LIVE-UNVERIFIED` bridges, not three.** PARITY-01a and PARITY-03 pull in opposite directions; the plan and the SUMMARY must both say so. Building it is still correct — an unverified inbox beats a bounce — but parity did not improve without qualification. |
| **DAEMON-04 live `/mcp`** | A live interactive Claude session | **Substitutable, and already proven.** The marker-file method (`02-RESEARCH.md` §5) demonstrates server spawn in one tiny `claude --print` turn. `claude mcp list` is **not** a valid probe — it ignores both `--settings` and `--mcp-config`. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or a Wave 0 dependency — **54 tasks, 54 `<automated>` blocks**, measured across all twelve plans
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — satisfied trivially, every task carries one
- [x] Wave 0 covers all ❌ references above — all 11 surfaces (`boot-floor`, `agent-lifecycle`, `hive-router`, `tunnel`, `mcp-per-agent`, plus the six extensions) appear in some plan's `files_modified`, sequenced across waves with zero same-wave collisions
- [x] No watch-mode flags — grep for `--watch` / `nodemon` / `jest --watch` across the plan set returns nothing
- [x] Feedback latency < 19s — full suite measured at **18.5s** (515 tests) this session
- [x] Every skipped live test announces its skip; none skips silently — bound in the plans via the `test/net-binding.test.cjs` announced-skip pattern
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-08-23 at plan time.

**What this sign-off does NOT claim.** `wave_0_complete` stays `false` — nothing has executed yet;
this certifies the validation *architecture*, not its results. The manual-only and
operator-supplied rows above are unchanged and remain the honest ceiling: DAEMON-01's live headless
run, DAEMON-05's tunnel close, the Android device, the Telegram/Discord tokens, and the four
`LIVE-UNVERIFIED` bridges are not automatable here and must be recorded as such rather than ticked.


---

## Validation Audit 2026-08-25 (post-execution)

State A audit, run after all 12 plans landed and after the code-review fix rounds.
The 2026-08-23 sign-off above was a **planning-time** sign-off — its own text says
"`wave_0_complete` stays `false` — nothing has executed yet." This audit replaces its
claims with measured ones.

| Metric | Count |
|--------|-------|
| Mapped selectors re-executed | 19 |
| Selectors exit 0 | 19 |
| Selectors non-zero | 0 |
| Passing assertions across mapped selectors | 345 |
| Gaps found (MISSING) | 0 |
| Requirements demoted COVERED→PARTIAL by re-run | 0 |
| Manual-Only items still open | 5 |

### Step 3.5 — live re-execution exit-code table

Every selector re-executed in THIS run (`node --test <file>`), 2026-08-25T00:26Z.
Static cross-reference was NOT accepted as evidence for any row.

| Selector | Exit | Pass | Fail |
|---|---|---|---|
| test/agent-lifecycle.test.cjs | 0 | 12 | 0 |
| test/boot-floor.test.cjs | 0 | 19 | 0 |
| test/boot-order.test.cjs | 0 | 4 | 0 |
| test/build-assets.test.cjs | 0 | 5 | 0 |
| test/capability-surface.test.cjs | 0 | 14 | 0 |
| test/delivery-main.test.cjs | 0 | 39 | 0 |
| test/engine-parity.test.cjs | 0 | 41 | 0 |
| test/hive-durability.test.cjs | 0 | 10 | 0 |
| test/hive-roster-injection.test.cjs | 0 | 8 | 0 |
| test/hive-router.test.cjs | 0 | 4 | 0 |
| test/hive-task-mutation.test.cjs | 0 | 13 | 0 |
| test/mcp-per-agent.test.cjs | 0 | 22 | 0 |
| test/net-binding.test.cjs | 0 | 43 | 0 |
| test/push-vapid.test.cjs | 0 | 12 | 0 |
| test/qr-vendor.test.cjs | 0 | 11 | 0 |
| test/queue-delivery.test.cjs | 0 | 4 | 0 |
| test/repo-claims.test.cjs | 0 | 31 | 0 |
| test/tunnel.test.cjs | 0 | 13 | 0 |
| test/webhook-endpoints.test.cjs | 0 | 40 | 0 |

Six of these (`boot-order`, `capability-surface`, `hive-roster-injection`, `push-vapid`,
`qr-vendor`, plus the extended `mcp-per-agent`) did not exist when the 2026-08-23 map was
written — they were created by this phase's plans and its two code-review fix rounds, and
are included here because the map is meant to cover what shipped, not what was foreseen.

Whole-suite figure at audit time: **824 tests / 817 pass / 0 fail / 7 skipped**,
`npm run typecheck` exit 0, `npm run build` exit 0.

### Frontmatter corrections made by this audit

**`wave_0_complete: false → true`.** All 11 Wave 0 surfaces now exist and their selectors
exit 0 in the table above. The original `false` was correct at the time and is now stale.

**`nyquist_compliant: true → FALSE`.** This is a correction in the honest direction, and it
is the finding of this audit. The `true` was written on 2026-08-23 *before any plan executed*
— it recorded an intention that every task would carry automated verification, not a measured
outcome. This workflow's own compliance rule states:

> A phase with zero automated coverage, **or with Manual-Only items still open**, keeps
> `nyquist_compliant: false`.

Five Manual-Only items remain open, none of them closeable on this machine or this network:

| Open item | Requirement | Blocker |
|---|---|---|
| Headless floor: spawn + mail + failover with no window | DAEMON-01 | Needs a live Electron process with real PTYs and real agent CLIs. The unit half is green; the doc itself says unit evidence alone is "**not a pass**" for criterion 2. |
| The cloudflared close (D-16) + multi-hour soak | DAEMON-05 | `scripts/tunnel-live-check.cjs` exits 3 (announced skip) on three separate runs including outside the tool sandbox. Root cause is environmental, not code: the LAN resolver (JioFiber router at 192.168.31.1) returns NXDOMAIN for freshly-minted `*.trycloudflare.com` subdomains while the apex resolves and general egress works. A public resolver (8.8.8.8 / 1.1.1.1) would likely let it pass. |
| WebAPK install, `display:standalone`, Web Push while asleep | DAEMON-02 | A physical Android phone. The localhost-verified auth path exists and is real, and the requirement names it as "the honest fallback" — to be recorded as such, **never as completion**. |
| Telegram / Discord live round-trip | DAEMON-03 | An operator-supplied bot token and Discord application public key. |
| pi / opencode / crush / qwen / kimi bridges | PARITY-03, PARITY-01a | A real paid account per engine; none of the five CLIs is installed here. Expected outcome under the zero-recurring-cost rule, not a failure. |

`DAEMON-04`'s live `/mcp` item is the one Manual-Only row that **did** close: plan 02-11 ran
the marker-file probe for real against the authenticated `claude` CLI 2.1.236 and recorded
`CHANNEL RE-CONFIRMED`, exit 0 — `--settings`' `mcpServers` spawned nothing, `--mcp-config`
spawned the marker server.

**Verdict: PARTIAL, not compliant.** Every automated selector this phase owns passes, and
there are zero MISSING gaps to fill — so no auditor was spawned, because there is nothing an
auditor could generate. What remains is not missing tests; it is five verifications that
require hardware, accounts, or a network this machine does not have. Generating more unit
tests would not move any of them, and marking the phase compliant would misrepresent all five.
