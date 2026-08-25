---
phase: 02-the-daemon-and-the-protocol
audited: 2026-08-25
threats_total: 112
threats_closed: 105
threats_open: 0
threats_fixed_this_audit: 3
threats_unknown: 1
threats_accepted: 3
register_authored_at_plan_time: true
status: secured
---

# Phase 02 Security Audit — the-daemon-and-the-protocol

Phase 02 put this app on the public internet for the first time: a cloudflared tunnel, a
phone PWA behind a bearer/enrollment exchange, per-agent MCP grants carrying real
credentials, and Telegram/Discord webhook verifiers. The threat register was authored at
plan time — all 12 plans carry a `<threat_model>` block — giving **112 declared threat IDs**.

## Method

Three parallel auditors, one per domain, each reading its scope in full and locating every
claimed mitigation at a `file:line` in the live tree. **The twelve SUMMARY.md files were
treated as claims to falsify, never as evidence.** Security-relevant mitigations were
additionally exercised by live test runs in this session.

| Auditor | Domain | Threats | Result |
|---|---|---|---|
| Trust boundary & network | `webhook.ts`, `tunnel.ts`, `cloudflared.ts`, `push.ts`, `slack.ts`, `triggers.ts`, `resources/phone/**` | 39 | **39 CLOSED, 0 OPEN** |
| Main process & IPC | `index.ts` (~160 handlers), `floor/**`, `hive*.ts`, `gitCommitter.ts`, `config.ts`, `integrationBroker.ts` | 54 | 44 CLOSED · 2 fixed here · 1 UNKNOWN · **2 NEW findings** |
| Renderer, preload & consent | `preload/index.ts`, 10 components, `store/config.ts`, `vendor/qrcodegen.ts` | 24 | 22 CLOSED · **1 fixed here** · 1 ledger gap |

Live verification actually run: 108/108 assertions across `tunnel`/`webhook-endpoints`/
`net-binding`/`push-vapid`, 33/33 `slack.test.cjs`, a live CSP-hash re-derivation, a
git-backed `check-ignore` proof that `<agentDir>/mcp.json` is really ignored, and
`repo-claims.test.cjs`'s marker ledger with an independent `grep` cross-check.

---

## Findings fixed during this audit

Three real defects. **None was in the declared register as an open item — all three were
mitigations the register believed were closed, which the audit found defeated, bypassed, or
absent.** That is the audit's core value.

### 1. T-P02-11-07 — the operator's own MCP servers were inherited by every fresh agent

**Severity: HIGH · elevation of privilege · fixed in `2f91d3a`**

`--strict-mcp-config` was pushed only inside `if (Object.keys(mcpServers).length)`. A freshly
spawned agent with zero grants — **the default state of every new agent** — launched with
neither `--mcp-config` nor `--strict-mcp-config`, and therefore inherited the operator's
personal `~/.claude.json` MCP servers while running `--permission-mode bypassPermissions`.
It held tools the capability card never showed, using the operator's own credentials.

The mitigation was defeated in exactly the case it was written for. The code's own comment,
two lines above the conditional that let it through, describes precisely this risk.

**Fixed:** the flag is now gated on `mcpWiredFor(provider)` — the provider being wired — not
on whether this agent happens to have anything armed. Harmless when nothing is armed: with no
`--mcp-config`, it simply asserts "no servers beyond what I was given", which is none.

### 2. IPC-01 — cross-agent inbox and memory disclosure

**Severity: HIGH · information disclosure · fixed in `2f91d3a`**

`hive:memory`, `hive:inbox` and `hive:messages` took a renderer-supplied id behind a bare
`typeof` check and passed it to `agentDir(id)` = `join(root,'agents',id)`. **No traversal was
even required for the flat case** — there was no ownership check at all, so any code running
in the renderer could read another agent's entire inbox. Per T-P02-08-02's own threat text,
that inbox may carry *"the human's answer — possibly a credential."*

This is the MAIN-02 class at three more call sites. The history matters: `mcp:agentState` was
fixed first; the follow-up found `mcp:grant`/`mcp:revoke` sharing the same ungated input; this
audit then found three more. Each round guarded callers individually.

**Fixed at the chokepoint instead.** `agentDir()` — the single place every per-agent path in
`HiveManager` is built — now refuses an unsafe id, so a caller added tomorrow inherits the
guard. It throws; the six public read accessors (`memory`, `hasMemory`, `inbox`, `outbox`,
`inboxBacklog`, `voiceMessages`) convert that into their own empty contract, because a throw
must never cross a sync `ipcMain` handler.

### 3. IPC-02 — the secret store's `int:` namespace was writable across features

**Severity: HIGH · tampering / elevation of privilege · fixed in `2f91d3a`**

`secretRefFor(id)` is `int:${id}` — the **same** namespace `mcp:grant` writes into as
`secretRefFor(mcpGrantKey(agentId, mcpId))` = `int:mcp:<agentId>:<mcpId>`.
`integrations:upsert` validates its id against `INTEGRATION_SLUG_RE` (which excludes `:`);
its sibling `integrations:setSecret` never did.

So a renderer could call `setSecret({ id: 'mcp:<agentId>:<mcpId>', secret: '<value>' })` and
write directly into an agent's MCP credential slot — bypassing `mcp:grant`'s `isSafeAgentId`
gate, its catalog-existence check, its tier refusal and its `mcpWiredFor` refusal — silently
replacing a credential the operator had legitimately granted. The next spawn arms the
poisoned value.

Same shape as SEC-02 from the code review: a charset rule enforced at one call site and not
at its sibling. **Fixed** by applying `INTEGRATION_SLUG_RE` in `integrations:setSecret`.

### Also fixed: T-P02-11-10 — the capability card claimed a channel nothing writes

**Severity: HIGH · repudiation · fixed in `8e4b952`** (renderer domain)

`mcpCardSummary` gated on `supportsMcp` (the static "can this engine take MCP at all" preset
claim) rather than `mcpWiredFor` (does this engine's spawn path actually write a bundle).
Nine presets declare `supportsMcp: true`; one is wired. So **eight engines** — codex, grok,
kimi, antigravity, qwen, opencode, crush, copilot — rendered `MCP 6 safe` out of the box while
their agents spawned with zero MCP servers. The shipped default state, not an edge case.

`mcpCatalog.ts`'s own header names this exact failure: *"Conflating the two is how a
capability card starts lying about a channel nothing writes."* The code did what its comment
warned against.

---

## Verified closed — a selection worth recording

Not exhaustive; these are the ones where the audit did more than read a diff.

- **Secret-gate decoy discipline.** Every verifier hashes both sides to fixed width before
  `timingSafeEqual`, and an unknown endpoint id runs a real comparison against a per-process
  decoy rather than short-circuiting. No path fails *cheaper* for "unknown id" than for
  "wrong secret".
- **`/phone/**` traversal is genuinely closed.** No request-derived string is ever joined into
  a filesystem path. All six traversal shapes verified against the implementation, plus a
  prototype-pollution trace (`__proto__`, `constructor`, `hasOwnProperty` resolve to values
  lacking `.file`, producing a 404, never a disclosure).
- **CSP hash pinning is real, not aspirational** — the inline `<style>`/`<script>` SHA-256
  hashes were independently recomputed and match byte-for-byte.
- **Web Push crypto conforms.** RFC 8188/8291 record layout verified by hand; salt and
  ephemeral keypair are freshly generated on every production call (no reuse); VAPID uses
  `dsaEncoding: 'ieee-p1363'` correctly.
- **`cloudflared` verifies before writing** — the artifact is buffered, hashed and compared to
  the pinned digest *before* any `writeFileSync`; a mismatch leaves nothing on disk.
- **`mcp.json` cannot leak into git** — in `MINE_IGNORE_LINES`, written `0o600`, with
  `ensureMineIgnore` ordered before the write. Proven by a real `git check-ignore` run.
- **No secret or secretRef crosses to the renderer** — `mcp:agentState` returns
  `hasSecret: boolean` only; zero `getSecret`/`secretRefFor` occurrences under `src/preload/`.
- **Preload is a boundary, not a convenience layer** — full read of all 1,606 lines: no raw
  `ipcRenderer` exposure, no channel wildcarding, write-only secret contracts throughout.
- **`--permission-mode bypassPermissions` blast radius** is now genuinely bounded by
  `--strict-mcp-config` for every wired agent (finding 1 above).

---

## Known limitations — accepted risks

These are accepted with the operator's eyes open. They are recorded here because this file,
not a planning doc, is the project's accepted-risk ledger.

| Risk | Threat | Why accepted |
|---|---|---|
| An agent can set `AGENT_ID` in its own shell and self-attribute a question | T-P02-08-01 | The god always receives its own copy of every answer, and that copy carries the unblock — so a spoofed `askedBy` misroutes a duplicate, never suppresses the authoritative one. Disclosed in the god prompt itself. |
| LLM-authored text can reach another agent's terminal | T-P02-03-06 | Pre-existing gate `sanitizeForPty` remains; unchanged by this phase. |
| The pairing link is copied to the clipboard | T-P02-10-08 | A clipboard is readable by other local software. The link is single-use and short-lived; the alternative (no copy affordance) makes pairing materially harder. **Recorded here at this audit's insistence** — it was documented only in `02-10-SUMMARY.md`, while its three sibling accept-dispositioned threats were properly logged. An accepted risk that lives only in a planning doc is not accepted, it is forgotten. |

## Unresolved

| Item | Threat | State |
|---|---|---|
| IPC channel silently renamed during the `bootFloor` extraction | T-P02-02-02 | **UNKNOWN.** No persisting channel-name diff test was located. Low security materiality (a functional-correctness threat), but it is not *verified*, and is recorded as unknown rather than assumed closed. What would settle it: a repo-fact test diffing the sorted channel-name list. |
| CSP header/meta comment drift | — | `resources/phone/index.html` does the hash-pinning; `webhook.ts:261-267`'s HTTP-header CSP still says `'unsafe-inline'` with a now-stale comment. **Not exploitable** — multi-source CSP is enforced as an intersection, so the hash-pinned policy governs — but the comment misdescribes the posture. Doc-drift follow-up. |
| `push.ts` is unreachable code | T-P02-09-04/05 | The Web Push send path is fully built and tested but wired to no route, so its mitigations have no live attack surface yet. Openly disclosed in `02-09-SUMMARY.md`. **Must be re-audited when the subscribe route lands** — that is the moment SEC-01's class of defect becomes network-reachable. |

## Scope note

`index.ts`'s ~160 IPC handlers were swept for the specific pattern that produced MAIN-02 and
IPC-01/02 (renderer-supplied values reaching filesystem paths, secret namespaces, process
spawns or shell commands) — that sweep is the table in the main-process auditor's report and
is what found IPC-01 and IPC-02. It was **not** a full end-to-end trace of every handler's
semantics. Each round of tracing this surface has found more instances of the same class; a
complete trace before any public release remains advisable.
