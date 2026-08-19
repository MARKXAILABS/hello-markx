# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documentation

- **Shipped docs now describe the code, not the plan** (#46, from the floor-inspection
  audit). `SECURITY.md` lists the real network surface — six HTTP servers, the
  token-gated hook socket, the opt-in public tunnel — and gained a *Known limitations*
  section covering auto mode and what the `permissions.deny` list does and does not
  cover (#4), the one `fs:*` handler still outside the managed-root gate (#9), and the
  tunnel that `stop()` cannot close. `HIVE.md` records that the `Stop`-hook drain loop
  was reversed (#5) and that the SQLite FTS index was never built. `SPEC.md` is marked **superseded** — it is the
  original tmux-era MVP spec and is kept for history only. `MEMORY_GRAPH_SPEC.md` is
  marked shipped. `README.md` no longer implies an enforced approval gate.
- **`docs/adr/`** — four architecture decision records, extracted from rationale that was
  already written down in source comments: the one gate for automatic PTY writes, the
  prompt-cache invariant on the injected system prompt, fail-safe worktree GC, and
  single-committer git for the hive.

### Changed

- **The project is now Hello MarkX.** Package name, app id (`com.markxailabs.hellomarkx`),
  product name, the `hellomarkx://hire` deep-link scheme, the hire spec tag
  (`hello-markx/hire@1`), release artifact names, the update feed and the Settings hero feed all
  point at this repository. The previous marketing site, blog, supporters wall, sponsor links,
  community workflows and marketing tooling were removed from the tree.

### Added

- **A pool of Claude accounts** ([docs](docs/claude-accounts.md)) — register any number of
  Claude subscriptions (label + `claude setup-token` token, stored write-only in the
  encrypted secret broker) and pin any agent — the orchestrator included — to one. The pinned
  account's token is injected as `CLAUDE_CODE_OAUTH_TOKEN` into that agent's process only,
  main-side at spawn; a pinned agent whose token is missing fails to spawn with a visible
  error rather than silently running on the `/login` account. The Command Center gains a
  **CLAUDE ACCOUNTS** panel with per-account live tokens, estimated USD, the opaque
  `user.account_uuid` observed in telemetry, and a "token not applied / account mismatch"
  integrity flag.
- **Account pool policy + automatic failover** — every Claude agent is either **pinned** to an
  account or **Auto (least loaded)**. Each account carries a persisted health state
  (`active · cooling(until) · dead`) driven by the status code of the CLI's own `api_error`
  telemetry: a **429** cools the account and moves its running agents to the next healthy one
  (kill, respawn with `--resume`, re-pin, one "continue where you left off" nudge, at most one
  switch per agent per 10 minutes); a **401** marks it dead until a new token is saved. All
  accounts cooling → agents pause with a countdown and auto-resume.

## [0.4.4] — 2026-08-18

The 0.4.x line this project starts from: ten agent engines with BYOK keys and local LLMs, the
hive (memory · mailboxes · blackboard · event log), a Command Center with kanban and schedules,
a built-in Monaco IDE with git rails, integrations registry + secret broker, Slack- and
webhook-spawned workers, shareable hires, observability and the circuit breaker, durable
persistence, session resume, multi-window floors, auto-update, Skills, Prerequisites, release
drops, and agent-to-agent messaging on Windows.
