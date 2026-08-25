# Spike — does `codex --add-dir` make a sibling agent dir writable under `-s workspace-write` on win32?

Phase 04 / plan 04-01 task 1. Wave 0. Run on **this machine**, 2026-08-25, by the plan 04-01 executor.
This file is a **verdict**, not a report. Plan 04-13 consumes the `VERDICT:` line verbatim.

Source of the question: `04-RESEARCH.md` § Risks and Landmines **L-11** and § Open Questions **1**, which
cite [openai/codex#23552](https://github.com/openai/codex/issues/23552) — *"workspace-write writable_roots
still prompts for approval on listed Windows directories"*, **OPEN**, filed against `codex-cli 0.130.0-alpha.5`.
This machine runs 0.128.0. Whether the defect reproduces here decides whether GATE-04 (plan 04-13) ships
live-verified or ships a `LIVE-UNVERIFIED` marker.

---

## Scope bound — read this before the verdict

`src/main/hiveProvisioning.ts:207` says, verbatim: *"hooks fire in INTERACTIVE codex sessions (how hive
workers run), not in headless `codex exec`."* And openai/codex#23552 is a **prompt** defect. A
non-interactive `codex exec` run **cannot prompt**, so it cannot reproduce that defect even when the defect
is present on this version. Therefore **no `codex exec` result on this page — positive or negative — is a
live-verified claim about the interactive path plan 04-13 spawns.** A `WORKS` outcome here would license
plan 04-13 to *build*, never to *claim*; the claim is decided by **plan 04-13 task 4's live interactive
agent**. This spike is bounded to: *does the flag reach codex's sandbox configuration, and does a write
land in a non-cwd tree in the exec path*.

---

## Environment, measured in this session

`codex --version`:

```
codex-cli 0.128.0
```

`codex login status`:

```
Logged in using ChatGPT
```

**`codex login status` is misleading on this machine and that is the headline finding.** It reports a
logged-in ChatGPT session, but the stored refresh token is **revoked** — every model turn fails with
`401 refresh_token_reused`. The status subcommand reads the on-disk auth record without exercising it.

Probe layout, deliberately mirroring the real shape of the GATE-04 problem (agent dir is a **sibling**
tree, not a subdirectory of cwd), entirely under `%TEMP%`, nothing under the repo:

```
C:\Users\Alienware\AppData\Local\Temp\codex-spike-01\
  proj\              <- stands in for the operator's project (the codex workdir / cwd)
  agents\a1\         <- stands in for <harnessHome>/hive/agents/<id>/  (the --add-dir target)
```

Two mechanical notes on the argv, both applied **identically to Run A and Run B** so the negative control
stays symmetric:

- `-C <dir>` is codex's own documented flag for the working root (`codex exec --help`: *"Tell the agent to
  use the specified directory as its working root"*). It is used in place of a shell `cd` because this
  executor's shell is worktree-isolated. Both banners below confirm `workdir:` landed on the probe `proj`.
- `--skip-git-repo-check` was added after a first attempt without it died at
  `Not inside a trusted directory and --skip-git-repo-check was not specified.` (exit 1, transcript in
  "Preliminary attempt" below). It permits running outside a git repo; it is **not** an approval- or
  sandbox-bypass flag. No `--dangerously-bypass-approvals-and-sandbox` was used anywhere in this spike —
  that would be measuring the thing GATE-04 exists to turn off.
- `< /dev/null` closes stdin, because with stdin piped codex prints `Reading additional input from stdin...`
  and appends an empty `<stdin>` block to the prompt.

ANSI colour escapes are stripped from the transcripts below. The text is otherwise verbatim; nothing is
paraphrased.

---

## Preliminary attempt (mechanical failure, not the measurement)

argv:

```
codex exec -s workspace-write --add-dir C:/Users/Alienware/AppData/Local/Temp/codex-spike-01/agents/a1 -C C:/Users/Alienware/AppData/Local/Temp/codex-spike-01/proj "write the single word ok into C:/Users/Alienware/AppData/Local/Temp/codex-spike-01/agents/a1/memory.md"
```

exit code: `1`

stderr (complete, 2 lines):

```
Reading additional input from stdin...
Not inside a trusted directory and --skip-git-repo-check was not specified.
```

Superseded by Run A below.

---

## Run A — the control (`--add-dir` present)

argv, verbatim:

```
codex exec --skip-git-repo-check -s workspace-write --add-dir C:/Users/Alienware/AppData/Local/Temp/codex-spike-01/agents/a1 -C C:/Users/Alienware/AppData/Local/Temp/codex-spike-01/proj "write the single word ok into C:/Users/Alienware/AppData/Local/Temp/codex-spike-01/agents/a1/memory.md" < /dev/null
```

exit code: `1`

`C:\Users\Alienware\AppData\Local\Temp\codex-spike-01\agents\a1\memory.md exists: no`

stdout, verbatim (this is a SessionStart hook of the operator's own codex config, not codex itself):

```
SUCCESS: The process with PID 10752 (child process of PID 13768) has been terminated.
SUCCESS: The process with PID 13768 (child process of PID 37652) has been terminated.
SUCCESS: The process with PID 37652 (child process of PID 9140) has been terminated.
SUCCESS: The process with PID 9140 (child process of PID 30164) has been terminated.
```

**The banner, which is the one load-bearing line of this whole spike** (stderr lines 17-27 of 80):

```
OpenAI Codex v0.128.0 (research preview)
--------
workdir: C:\Users\Alienware\AppData\Local\Temp\codex-spike-01\proj
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, C:\Users\Alienware\AppData\Local\Temp\codex-spike-01\agents\a1, C:\Users\Alienware\.codex\memories]
reasoning effort: xhigh
reasoning summaries: none
session id: 01a03946-9716-7040-94f7-afe58ba4b5a9
--------
```

stderr, last 40 lines, verbatim:

```
2026-08-25T14:15:38.008833Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:38.009037Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:38.589550Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
2026-08-25T14:15:39.065504Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:39.304219Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:39.305376Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:39.306089Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:39.306798Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:39.530933Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:39.798428Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:40.054384Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
2026-08-25T14:15:40.055342Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:40.055537Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:40.055735Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:40.182930Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:15:40.815628Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart Completed
hook: SessionStart Completed
hook: SessionStart Failed
hook: UserPromptSubmit
2026-08-25T14:16:02.556421Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
hook: UserPromptSubmit Completed
2026-08-25T14:16:02.791254Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:16:03.074311Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:16:03.074785Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:16:03.075295Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:16:03.310745Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:16:03.854484Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:16:03.943642Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
2026-08-25T14:16:03.944481Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:16:03.944684Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:16:03.944925Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:16:04.322465Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:16:04.485478Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
ERROR: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
ERROR: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:16:04.764910Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
```

The full 401 body, from earlier in the same stderr (line 2 onward), verbatim:

```
2026-08-25T14:15:11.187219Z ERROR codex_login::auth::manager: Failed to refresh token: 401 Unauthorized: {
  "error": {
    "message": "Your refresh token has already been used to generate a new access token. Please try signing in again.",
    "type": "invalid_request_error",
    "param": null,
    "code": "refresh_token_reused"
  }
}
```

---

## Run B — the negative control (identical, `--add-dir` removed)

argv, verbatim:

```
codex exec --skip-git-repo-check -s workspace-write -C C:/Users/Alienware/AppData/Local/Temp/codex-spike-01/proj "write the single word ok into C:/Users/Alienware/AppData/Local/Temp/codex-spike-01/agents/a1/memory.md" < /dev/null
```

exit code: `1`

`C:\Users\Alienware\AppData\Local\Temp\codex-spike-01\agents\a1\memory.md exists: no`

stdout, verbatim:

```
SUCCESS: The process with PID 11820 (child process of PID 36664) has been terminated.
SUCCESS: The process with PID 36664 (child process of PID 15300) has been terminated.
SUCCESS: The process with PID 15300 (child process of PID 36636) has been terminated.
SUCCESS: The process with PID 36636 (child process of PID 37220) has been terminated.
```

The banner (stderr lines 16-27), verbatim:

```
OpenAI Codex v0.128.0 (research preview)
--------
2026-08-25T14:16:58.414650Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
workdir: C:\Users\Alienware\AppData\Local\Temp\codex-spike-01\proj
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, C:\Users\Alienware\.codex\memories]
reasoning effort: xhigh
reasoning summaries: none
session id: 01a03948-059c-7011-89c4-4d20630dc0c0
--------
```

stderr, last 40 lines, verbatim:

```
--------
user
write the single word ok into C:/Users/Alienware/AppData/Local/Temp/codex-spike-01/agents/a1/memory.md
2026-08-25T14:16:58.497498Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:16:58.828214Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer resource_metadata=\"https://mcp.postman.com/.well-known/oauth-protected-resource/mcp\"" })
2026-08-25T14:16:59.452094Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when AuthRequired(AuthRequiredError { www_authenticate_header: "Bearer error=\"invalid_request\", error_description=\"No access token was provided in this request\", resource_metadata=\"https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/\"" })
2026-08-25T14:17:01.384702Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:01.617651Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:01.618366Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:01.618969Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:02.171990Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when UnexpectedContentType(Some("text/plain; body: {\n  \"error\": {\n    \"message\": \"Could not parse your authentication token. Please try signing in again.\",\n    \"type\": null,\n    \"code\": \"unauthorized_unknown\",\n    \"param\": null\n  },\n  \"status\": 401\n}"))
2026-08-25T14:17:02.213272Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
2026-08-25T14:17:02.214245Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:02.214429Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:02.214640Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:02.747577Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
hook: SessionStart
hook: SessionStart
hook: SessionStart
hook: SessionStart Completed
hook: SessionStart Completed
hook: SessionStart Failed
hook: UserPromptSubmit
2026-08-25T14:17:03.725570Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
hook: UserPromptSubmit Completed
2026-08-25T14:17:03.930600Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:03.964813Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:04.173386Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:04.173906Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:04.174383Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:04.261537Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:04.556411Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:04.892478Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
2026-08-25T14:17:04.893118Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:04.893311Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:04.893486Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:05.652428Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://chatgpt.com/backend-api/codex/responses
ERROR: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
2026-08-25T14:17:05.663207Z ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
ERROR: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.
```

---

## What the two runs did and did not settle

**Did not settle — the question the spike was for.** Neither run reached a model turn. `codex login status`
says "Logged in using ChatGPT", but the stored refresh token is revoked (`401`, `code:
"refresh_token_reused"`), so codex never got a completion, never emitted a shell tool call, and therefore
**never attempted a write**. Run A wrote nothing; Run B wrote nothing. Because both runs failed for the
*same* reason and that reason is upstream of the sandbox, the pair carries **no signal at all** about
whether a write into the sibling agent dir would be permitted, refused, or prompted. `agents\a1` is empty
after both runs, and "empty because the sandbox refused" is indistinguishable here from "empty because no
model ever ran".

**Did settle — one real thing, at the configuration layer.** Codex's own startup banner enumerates the
writable-root set, and the two banners differ in exactly the expected way:

| Run | `--add-dir` | banner `sandbox:` line |
|-----|-------------|------------------------|
| A | present | `workspace-write [workdir, /tmp, C:\Users\Alienware\AppData\Local\Temp\codex-spike-01\agents\a1, C:\Users\Alienware\.codex\memories]` |
| B | absent | `workspace-write [workdir, /tmp, C:\Users\Alienware\.codex\memories]` |

So on `codex-cli 0.128.0` (win32), `--add-dir` **is parsed, is accepted for a path outside the workdir
tree, and is admitted into the `workspace-write` writable-root set** — and the negative control confirms
that without the flag the sibling dir is not in that set. That is the *plumbing* premise GATE-04 rests on
(D-14's "path-tree problem"), and it holds. It is **not** the *enforcement* answer: openai/codex#23552 is
precisely a claim that a directory which *appears* in `writable_roots` still prompts when written to. This
spike observed the list, not the write.

**openai/codex#23552 — did it reproduce here?** **Unknown; not reproduced and not ruled out.** The defect is
an approval *prompt* on write. No write was attempted (auth died first) and `codex exec` runs with
`approval: never` and cannot prompt at all, so this run shape could not have reproduced it even with
working auth. The issue remains OPEN and remains a live risk for plan 04-13.

**Incidental, recorded because it contradicts an in-repo comment and someone will trip on it.**
`src/main/hiveProvisioning.ts:207` says hooks fire in interactive codex sessions, "not in headless `codex
exec`." Both transcripts above show `codex exec` firing hooks: `hook: SessionStart` (x3, one of which
reports `Failed`) and `hook: UserPromptSubmit ... Completed`. Those are the operator's own `~/.codex` hooks.
This does **not** overturn the comment for the hook GATE-03 cares about — `PreToolUse` was never reached,
because no tool call ever happened — but "codex exec fires no hooks at all" is measurably too strong. Plan
04-13 should re-check rather than inherit it.

CODEX SHELL TOOL NAME: unobserved

(Not guessed. No shell tool was ever invoked — the session died at auth before any model output. Plan 04-10
must take this from plan 04-13 task 4 rider 4's live interactive transcript, not from this page.)

---

## Verdict

VERDICT: INCONCLUSIVE — codex-cli 0.128.0 is installed and `codex login status` reports "Logged in using ChatGPT", but the stored ChatGPT refresh token is revoked (`401 Unauthorized`, `"code": "refresh_token_reused"`), so both Run A and Run B died before any model turn and neither attempted a filesystem write; `--add-dir` was measurably admitted into the `workspace-write` writable-root set (Run A's banner lists the sibling agent dir, Run B's does not), which settles the flag-plumbing premise but not sandbox enforcement, and openai/codex#23552 neither reproduced nor was ruled out.

---

## What plan 04-13 must do with this

1. **Do not read the banner differential as GATE-04 live-verification.** It is evidence that the flag is
   wired, nothing more. Enforcement is unmeasured.
2. **GATE-04 ships with a `LIVE-UNVERIFIED` marker citing openai/codex#23552** unless plan 04-13 task 4's
   live interactive agent produces a real write into the agent dir on a re-authenticated codex. The
   interactive path was always 04-13 task 4's to decide (see the scope bound at the top); this spike's
   failure does not change that, it only removes the exec-path corroboration 04-13 was going to get for free.
3. **Re-running this spike is cheap and is worth doing the moment codex auth is restored.** It needs an
   operator-interactive `codex login` (browser sign-in) — no `OPENAI_API_KEY` is present in this
   environment, so the non-interactive `codex login --with-api-key` path was not available. Re-run the two
   argv lines above verbatim; everything else on this page stays valid.

**Operator action required to convert this INCONCLUSIVE into a real verdict:** run `codex login` and
complete the browser sign-in, then re-run Run A and Run B.

---

## Hygiene

- Both probe directories live under `%TEMP%` (`C:\Users\Alienware\AppData\Local\Temp\codex-spike-01\`).
  Nothing was written under the repo. T-04-SBX-01 mitigation holds.
- `git status --porcelain src/` after this task: empty. No source file was touched; this task's only
  product is this page.
- No approval- or sandbox-bypass flag was used. T-04-SBX-02's negative control (Run B) is present and its
  result is reported honestly rather than being read as support for Run A.
