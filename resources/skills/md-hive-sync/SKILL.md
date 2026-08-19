---
name: md-hive-sync
version: 1.1.0
description: |
  Hello MarkX hive sync — runs the start-of-task hive protocol steps:
  reads memory.md, checks inbox/ for new messages, and reminds you to record
  durable facts in memory.md and write coordination files before ending.
  Use when asked to "sync with the hive", "check my inbox", "hive status",
  or "hive sync".
  Proactively suggest at the start of a new task if you haven't checked your
  hive inbox in this conversation. (hello-markx)
allowed-tools:
  - Read
  - Glob
  - Bash
---

## Hive Sync

Your agent directory is in the `AGENT_DIR` environment variable. **Read it the way
your shell spells it** — this hive runs on Windows floors as well as macOS/Linux,
and the POSIX `$AGENT_DIR` form expands to nothing in `cmd.exe`/PowerShell:

| Shell | Read the variable | Move a file |
|---|---|---|
| bash / zsh (macOS, Linux) | `echo "$AGENT_DIR"` | `mv "<src>" "<dest>"` |
| PowerShell (Windows) | `echo $env:AGENT_DIR` | `Move-Item "<src>" "<dest>"` |
| cmd.exe (Windows) | `echo %AGENT_DIR%` | `move "<src>" "<dest>"` |

Prefer the Read and Glob tools over the shell for the read-only steps — they take
a plain path and are identical on every platform. Only step 2's move needs a shell.

Run the mandatory hive start-of-task steps:

1. **Read memory** — Read `<AGENT_DIR>/memory.md` for durable context from prior
   sessions.

2. **Check inbox** — Glob `<AGENT_DIR>/inbox/*` and read every message that is not
   already under `inbox/.done/`. For each one:
   - Act on the message.
   - Move the handled file into `<AGENT_DIR>/inbox/.done/` using your shell's move
     command from the table above. Create `.done/` first if it does not exist
     (`mkdir -p` on POSIX; `New-Item -ItemType Directory -Force` in PowerShell;
     `mkdir` in cmd.exe, which is already recursive).

3. **Report** — summarize what you found in memory and any new inbox messages. Note
   any tasks assigned to you or information relevant to the current session.

4. **End-of-task reminder** — before closing this conversation, append durable facts,
   decisions, and outcomes to `<AGENT_DIR>/memory.md` so future-you remembers. Date
   each new `##` heading in ISO form (`## 2026-08-20 — what happened`): the memory
   condenser reads those dates to decide which sections are newest, and an undated
   section can only fall back to its position in the file.

If `AGENT_DIR` is unset, locate your agent directory under the hive root (`HIVE_ROOT`)
before continuing.
