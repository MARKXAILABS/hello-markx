# Claude accounts — run agents on more than one subscription

Munder Difflin can run each Claude Code agent on a **different Claude subscription**.
You register any number of accounts (a label + a long-lived OAuth token), pin any
agent — Michael included — to one, and watch per-account usage live in the Command
Center. Agents you don't pin keep using the machine's normal `/login` account,
exactly as before.

## How it works

Claude Code resolves credentials in a fixed precedence order, and a per-process
`CLAUDE_CODE_OAUTH_TOKEN` environment variable outranks the `/login` credential
stored on the machine (see the [Claude Code IAM docs](https://code.claude.com/docs/en/iam)).
Munder Difflin uses exactly that: when a pinned agent spawns, the harness injects
the account's token into **that agent's process environment only**. Nothing else
changes — no wrapper scripts, no per-agent config dirs, and the machine-wide
`~/.claude/.credentials.json` login file is never touched.

- **Tokens are stored encrypted, write-only.** A pasted token goes straight into
  the same OS-encrypted secret store as the BYOK API keys (Electron `safeStorage`;
  DPAPI on Windows). The UI can only ask "is a token stored?" — the value is never
  shown again, never crosses into the UI process, and never appears in
  `registry.json`, `fleet.json`, logs, or telemetry.
- **Fail closed.** If a pinned agent's account or token is missing at spawn time,
  the spawn **fails with a visible error** instead of silently starting on the
  login account.
- **Pins survive restarts.** The account id rides the agent's persisted record,
  so "restore team", "restart & continue", and the post-sleep auto-revive all
  re-inject the right token automatically.

## Setting it up

1. **Mint a token per account** — in any terminal run:

   ```bash
   claude setup-token
   ```

   A browser window opens; sign in with the subscription you want to add
   (Pro/Max/Team/Enterprise — token auth needs a subscription). The command
   prints a long-lived OAuth token (valid ~1 year).

2. **Add the account** — Settings → AI Engines → **Claude accounts**: enter a
   label (e.g. `Work · Max`), paste the token, press Add. Repeat per account.

3. **Pin agents** — pick the account in the Add Agent dialog (Engine section),
   on an existing agent's panel header, or per-row in the Command Center's
   monitor tab. Michael's pin lives in his engine row (provider · model ·
   account · apply). An account change **takes effect on the next (re)start**
   of that agent — the running session keeps its current account until then.

4. **Watch it** — Command Center → monitor → **CLAUDE ACCOUNTS** shows one row
   per account (plus the login account): its active agents, live input/output/
   cache tokens, estimated USD, and the opaque `user.account_uuid` reported by
   Claude Code's own telemetry.

## The integrity flag

Each Claude Code session reports an opaque account identifier
(`user.account_uuid`) in its first-party OTel telemetry. The harness records the
first uuid seen per account as that account's reference; if another agent pinned
to the same account reports a different uuid, its row shows
**"token not applied / account mismatch"** — the usual causes are an expired or
revoked token (the CLI fell back to the login account) or a token pasted for the
wrong subscription. Replace the token in Settings and restart the agent.

Only the uuid is read — the telemetry collector still drops `user.email`,
`organization.id`, and every other identity attribute.

## Limits of token auth (upstream behaviour)

- `claude setup-token` requires a Pro/Max/Team/Enterprise subscription.
- A token-authenticated session can make model requests but does not carry
  claude.ai connectors or Remote Control; local MCP servers work fine.
- Tokens expire (~1 year) and can be revoked; a dead token surfaces as auth
  errors in the agent's terminal plus the integrity flag in the panel.
- Plan-quota percentages are not exposed by any supported API — run `/usage`
  inside an agent's session to see its account's limits.

## What this feature does NOT do (yet)

This is PR 1 — the pool. Deliberately out of scope, coming as PR 2:

- **No automatic failover** — a rate-limited account is not swapped out.
- **No pool policy** — no round-robin/least-used auto-assignment; every pin is
  explicit.
- The hidden helper session used for memory condensation stays on the login
  account.
