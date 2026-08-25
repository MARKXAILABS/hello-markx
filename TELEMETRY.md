# Telemetry

Hello MarkX collects a small set of **anonymous** usage events so we can
understand adoption (how many people launch the app, which features get used)
and make the product better. This document is the complete, authoritative
contract: **if an event or property is not listed here, the app does not send
it.** The implementation lives in [`src/main/analytics.ts`](src/main/analytics.ts)
and enforces this list as a hard allowlist — the code and this file are kept in
lockstep, and because the repo is open source you can verify that yourself.

## What is sent

Every event carries only these common properties:

| Property | Example | Notes |
| --- | --- | --- |
| `app_version` | `0.4.4` | The app's own version |
| `os` | `darwin` / `win32` / `linux` | Platform, nothing more |
| `arch` | `arm64` / `x64` | CPU architecture |

The events:

| Event | Extra properties | When |
| --- | --- | --- |
| `first_run` | — | Once, the first time the app ever starts |
| `app_launched` | — | Each app start |
| `agent_spawned` | `provider` (CLI engine name, e.g. `claude`, `codex`) | An agent terminal is spawned |
| `feature_used` | `feature` — one of `slack_trigger`, `webhook_trigger`, `hire_install`, `voice_dictation` | At most once per feature per app session |
| `session_ended` | `duration_bucket` — one of `<5m`, `5-30m`, `30m-2h`, `2-8h`, `8h+` | On quit (coarse bucket, never raw duration) |

## What is never sent

No prompts. No agent transcripts or output. No file paths, repo names, branch
names, or hostnames. No email addresses, account identifiers, machine
identifiers, or API keys. Nothing free-form — the property allowlist in
`analytics.ts` drops anything not in the tables above.

## How it stays anonymous

- Events are sent to [PostHog](https://posthog.com) (itself open source) with
  `$process_person_profile: false`, which makes them **anonymous events**: no
  person profile is created and no identity is stored.
- The only identifier is a **random UUID** minted on first run and stored in
  the app's user-data directory (`telemetry-install-id`). It is not derived
  from your machine, and deleting the app's data deletes it.
- IP-based geolocation is used only to derive a country for aggregate stats;
  PostHog does not retain the IP on the event.

## Opting out

Any one of these fully disables telemetry:

1. **Settings → General → Anonymous usage stats → off** (or uncheck "Share
   anonymous usage stats" during onboarding). Takes effect immediately.
2. Set the standard [`DO_NOT_TRACK`](https://consoledonottrack.com)
   environment variable (any value other than `0`). Respected unconditionally.
3. **Build without a key.** The PostHog key is read from the `POSTHOG_KEY` build
   secret in the release workflow; this repository ships no key, so builds from
   this source — including the official ones — send nothing unless you add one.

## Self-hosting note

PostHog is open source and self-hostable. The endpoint is a build-time setting (`POSTHOG_HOST`), so the
project can move to a self-hosted instance without any code change.

---

# The local record — RECORD-01 and RECORD-02

**Nothing in this half leaves your machine.** Everything above is about the anonymous
product-analytics events sent to PostHog when a key is present. Everything below is about
the app's own **local** record of what the floor did — a SQLite database in the app's
user-data directory. It is never uploaded, never sampled, and has no opt-out because it
never goes anywhere: opting out of telemetry does not turn it off, and turning it on sends
nothing.

## The span ring is unchanged, and that is deliberate

`src/main/telemetry.ts` still keeps a per-agent **in-memory ring buffer of 200 `ToolSpan`s**
and still never persists it. Its own comment — *"Ephemeral — kept only in the in-memory ring
buffer, never persisted"* — is still true **of the ring**. It was not replaced, because the
per-agent waterfall UI reads exactly that ring, and a durable table with different retention
would have given the waterfall a second source of truth.

What changed is that a **separate, durable record** was added beside it. The sentence above
is now half the story, and this section is the other half.

## Why the durable writer is not on the telemetry path

Three measured reasons, stated so nobody "fixes" this later by moving it back:

1. **`ToolSpan` has no `target`.** Its fields are `agentId`, `sessionId`, `ts`, `tool`,
   `success`, `durationMs`, `decision?`, `error?`. RECORD-01's requirement is *"who wrote
   this file"* — without a target there is no file in the answer.
2. **`ATTR_ALLOWLIST` admits no path or command key.** The OTLP attribute allowlist in
   `telemetry.ts` is `agent.id`, `agent.name`, `session.id`, `model`, `type`, `tool_name`,
   `success`, `duration_ms`, `decision`, `event.name`, `error`, `message`, `status_code`,
   `user.account_uuid`, `user.account_id`. A path or a command string is dropped by
   construction, and widening it would widen what the OTel collector accepts from the
   network.
3. **The OTel block is Claude-only.** The collector receives OTLP from Claude Code and from
   nothing else. The hook socket is the one place where **agent, tool and target** all exist
   for **every** engine that bridges, so that is where the writer lives.

So the writer is `PersistStore.recordToolCall`, called from **`src/main/hooks.ts`** while a
`PreToolUse` payload is being judged — and it is **not** in `telemetry.ts`.

## What is recorded locally

The database is `harness.db` in Electron's `userData` directory. Two tables were added.

| Table | Columns | Written by | Read for |
| --- | --- | --- | --- |
| `tool_calls` | `id`, `agent_id`, `ts`, `tool`, `target`, `decision`, `reason` | `hooks.ts`, on every judged `PreToolUse` | *"who wrote this file, and what did the floor run overnight"* |
| `events` | `id`, `ts`, `kind`, `json` | `hive.ts`, mirroring every hive event | replaying a day that has already happened |

Notes that matter for reading either table:

- **`target` is agent-authored untrusted text.** It is whatever string a model put in
  `tool_input.command` / `file_path`. It is written with bound parameters only, never
  interpolated into SQL, and it must be **escaped at render** — never `eval`'d, never fed to
  a shell, never trusted as a path. It is capped at **4 KiB** and is nullable on purpose: a
  `Bash` call with no path-shaped argument has no target, and *"null by design"* must stay
  distinguishable from *"nothing was written"*.
- **`decision` is the gate's verdict** — `allow` / `deny` / `ask` — and `reason` carries the
  operator-legible deny reason. An expired ask is settled by appending its verdict, not by
  rewriting the original row: `PersistStore` has no `UPDATE` on `tool_calls`, so an ask that
  timed out reads as two rows, not one amended one.
- **`events.json` holds the whole event verbatim**, so nothing is lost to a schema guess.
  That is why the table is bounded by pruning rather than by a length cap.

## Durability, at the level SQLite actually gives it

The database opens with `journal_mode = WAL` and **`synchronous = NORMAL`**.

**What that buys:** a `tool_calls` row is a committed WAL append before the insert returns,
so it **survives a process crash** — which is the crash this record exists for.

**What it does not buy:** it is **not guaranteed against an OS crash or a power loss** until
the next checkpoint. That is the right trade for this app and it is written down rather than
silently upgraded. `synchronous = FULL` would `fsync` on every single tool call — on the
order of hundreds of thousands of times a day on a busy floor — to buy a guarantee against a
failure mode that also takes the work being recorded.

## Retention

`events` is kept for **30 days** (`EVENT_RETENTION_MS`), enforced by a prune that deletes
rows **strictly older** than the bound, so a caller passing the start of the oldest day it
wants keeps that whole day. The read path (`eventsBetween`) is deliberately **unlimited** —
a day minus whatever fell past a `LIMIT` is precisely the one-generation rotate this
requirement replaced. `tool_calls` reads are clamped instead, because the caller is
ultimately an agent reaching over IPC.

`harness.db` lives in **`userData`, outside the hive root**, so it needs no `UNTRACK_PATHS`
entry — the restore-point machinery never sees it. The same location has a cost, and it is
listed in [`SECURITY.md`](./SECURITY.md) as GATE-03 ceiling item (r): the audit trail is
reachable by the agents it audits.
