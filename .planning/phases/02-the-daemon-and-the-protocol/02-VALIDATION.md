---
phase: 2
slug: the-daemon-and-the-protocol
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-21
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

- [ ] All tasks have `<automated>` verify or a Wave 0 dependency
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all ❌ references above
- [ ] No watch-mode flags
- [ ] Feedback latency < 19s
- [ ] Every skipped live test announces its skip; none skips silently
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
