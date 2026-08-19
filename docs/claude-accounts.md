# Claude accounts — run agents on more than one subscription

Munder Difflin can run each Claude Code agent on a **different Claude subscription**.
You register any number of accounts (a label + a long-lived OAuth token), pin any
agent — Michael included — to one or let the pool pick (**Auto** = least loaded),
and watch per-account usage + health live in the Command Center. When an account
hits its usage limit its agents are **moved to the next healthy account and
resumed**; a rejected token marks the account dead until you replace it. Agents
you don't pin keep using the machine's normal `/login` account, exactly as before.

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

3. **Assign agents** — pick an account, or **Auto (least loaded)**, in the Add
   Agent dialog (Engine section), on an existing agent's panel header, or
   per-row in the Command Center's monitor tab. Michael's choice lives in his
   engine row (provider · model · account · apply). A change **takes effect on
   the next (re)start** of that agent — the running session keeps its current
   account until then (or until a failover moves it).

4. **Watch it** — Command Center → monitor → **CLAUDE ACCOUNTS** shows one row
   per account (plus the login account): its health (active / cooling with a
   countdown / dead), its active agents, live input/output/cache tokens,
   estimated USD, tokens used in the last 5h, the switch count, the last API
   error that changed its state, the opaque `user.account_uuid` reported by
   Claude Code's own telemetry, and the **rotate now** / **mark active**
   buttons.

## The integrity flag

Each Claude Code session reports an opaque account identifier
(`user.account_uuid`) in its first-party OTel telemetry. The harness records the
first uuid seen per account as that account's reference (persisted by the main
process; cleared when the account dies on a 401 or its token is replaced, and
never seeded while it is dead); if another agent on the same account reports a
different uuid, its row shows **"token not applied / account mismatch"** — the
usual causes are an expired or revoked token (the CLI fell back to the login
account) or a token pasted for the wrong subscription. Replace the token in
Settings and restart the agent.

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

## Assignment policy: pinned or Auto

Every Claude agent (Michael included) has one of three assignments, chosen in
the Add Agent dialog, the agent's panel header, the Command Center's agent row,
or Michael's engine row:

| Choice | What it means |
|---|---|
| **Login account** | No pin, no pool — exactly the pre-pool behaviour. Never moved. |
| **a pinned account** | Always spawns on that account while it is healthy (PR 1 behaviour). |
| **Auto (least loaded)** | At every (re)spawn the pool picks the **healthy account with the fewest tokens used in the last 5 hours** (ties → the account the agent was last on, then creation order). |

`Auto` resolves to a concrete account in the main process at spawn time; the
token injection stays fail-closed exactly as before (the resolved account must
exist and hold a token). Which account an agent actually landed on is shown on
its card (`Work · auto`) and the Command Center row (`on Work`). An empty pool
means `Auto` = the login account. The 5h figure is the harness's own rolling
sum of that account's agents' tokens (input + output + cache), not Anthropic's
quota — a proxy for "least loaded", not a plan percentage.

## Health: active · cooling · dead

Each pool account carries a health state, persisted across restarts in
`claude-account-pool.json` under the app's userData folder (never in the secret
broker — no token lives there):

```
active ──429──▶ cooling (until <reset>)  ──reset passes──▶ active
active ──401──▶ dead (token rejected)     ──new token saved / "mark active"──▶ active
any ──"rotate now"──▶ cooling (5h)
```

Detection keys on the **HTTP status code** of Claude Code's own
`claude_code.api_error` telemetry event — never on message text:

- **429 → cooling.** The account is out of the rotation. If the error text
  carries a reset time (`retry-after: N`, `resets in 2h 30m`, `resets 3pm`, an
  ISO timestamp, a `reset_at` epoch) the cooldown ends then; otherwise it
  defaults to **5 hours** (the length of a Claude usage window). Repeated 429s
  never shorten a cooldown; when it lapses the account is handed out again and
  the idle agents still on it are nudged to continue.
- **401 → dead.** The token was rejected. The account stays out until you
  paste a new `claude setup-token` token for it (saving one marks it active
  again) or press **mark active**. Because a session that ran on a rejected
  token reports the *login* account's uuid, a 401 also **clears the account's
  reference uuid** and a dead account never seeds one — the next good session
  re-seeds it (this closes PR 1's "first session wins" gap).
- Any other status (5xx, overloaded, …) changes nothing; the circuit breaker's
  error-storm arm still sees every api error as before.

## Failover: what actually happens

When an account turns cooling or dead, every running agent on it is moved to
the next healthy account (least loaded, token present):

1. the agent's terminal is **killed and respawned with the same agent id**,
   `--resume <its last session id>`, and the new account's token — the same
   path Restart & Continue and the post-sleep revive use;
2. the agent is **re-pinned** to the new account (Michael's pin in config
   follows him), the Command Center row shows **`↻ switched A → B hh:mm`**, and
   the old account's **switch count** ticks up;
3. it receives **exactly one** nudge — *"Your previous turn was interrupted by a
   Claude account switch (A → B). Continue where you left off."* — so the
   resumed session picks the thread back up.

Guard rails: an agent is switched **at most once per 10 minutes** (a 429 on the
new account right away waits; the 30-second beat carries out the pending move
once the window passes), late telemetry from the killed process is never
blamed on the new account, an account without a stored token is never a
target, and a `pinned` agent whose account is cooling/dead at spawn time is
moved the same way (with the switch recorded) instead of failing the spawn.

When **every** account is cooling or dead nothing is respawned — the agents are
paused where they are, the CLAUDE ACCOUNTS panel shows
*"every Claude account is cooling or dead — N agent(s) paused, auto-resumes in
hh:mm"* (plus a desktop notification), and at the earliest reset the pool
resumes: the reset account's idle agents are nudged, the stranded ones are
moved onto it. Manual controls per account: **rotate now** (cool it for 5h and
move its agents off) and **mark active** (end a cooldown or revive a dead
account by hand).

### Honest limits

- **Failover is a pause, not a seamless handoff.** The turn that was in flight
  on the old account is lost; the session resumes on the new account from its
  last saved transcript and is told to continue. Expect the agent to redo part
  of its last step.
- **It cannot create quota.** With every account cooling, the floor waits for
  the earliest reset. Nothing is retried against a cooling account.
- **The 429 shape is calibrated on the first real hit.** The parser understands
  the reset formats above and falls back to 5h; the first 429 per account is
  logged once as `[account-pool] calibration: first 429 on "<label>" —
  status_code=429 parsedReset=<iso|none> error=<sanitized text>` in the main
  process log. If a real limit produces a shape the parser misses (it would
  show `parsedReset=none` with a reset time visible in the text), send that
  log line along — the parser is a single pure function
  (`parseResetFromError` in `src/shared/claudeAccountPool.ts`) with tests.
  A transient 429 (true per-minute rate limit, not a usage limit) cools the
  account for 5h too; **mark active** undoes that.
- The 401 path was verified live on Windows with a deliberately invalid
  token (dead + reference cleared + failover + resume nudge); the 429 path is
  unit-tested end-to-end through the collector with synthetic OTLP payloads.
- Slack/webhook notifications are not wired (app-initiated Slack posts must
  target an explicit thread in this codebase); failover uses the existing
  desktop notifications + the panel.
- The hidden helper session used for memory condensation stays on the login
  account.
