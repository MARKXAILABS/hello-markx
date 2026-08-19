# The Hive — autonomous multi-agent layer

> How Hello MarkX turns a room full of independent `claude`
> processes into a collaborating, self-coordinating team with persistent memory,
> a shared blackboard, and a "god" orchestrator that runs the floor.

This document is the design source of truth for the agent-collaboration layer. It
sits alongside [`DESIGN.md`](./DESIGN.md) (visual system); [`SPEC.md`](./SPEC.md) is
the *superseded* original MVP spec, kept for history only. Code is the source of
truth for what's *built*; this is the source of truth for what we're *building
toward*. Where the two have diverged the divergence is written down rather than
smoothed over — §2 and §7 say what runs today and link the issue tracking the gap.

---

## 1. What we're building (and what it's called)

Each spawned agent is a real `claude` CLI process with a filesystem, a system
prompt, and a hook lifecycle. We layer four classic patterns on top:

| Behaviour the user asked for | Pattern (the name) |
| --- | --- |
| Per-agent memory file made at spawn, that the agent reads and updates | **Agent long-term memory** (MemGPT/Letta-style self-managed memory) |
| Writing a requirement into another agent's file | **Stigmergy** — coordinating by modifying a shared environment |
| A shared plan multiple agents edit | **Blackboard architecture** (Hearsay-II) |
| "Check after finishing every task" | **Mailbox / actor model** — drain an inbox at a lifecycle point |
| A "god" agent that runs the floor and clarifies for others | **Orchestrator / supervisor** (LangGraph-supervisor-style) |

The umbrella term is a **multi-agent system (MAS)** with **autonomous agent
loops**. The closest academic analogue to this app is Stanford's *Generative
Agents* (Park et al., 2023): Sims-style avatars in a 2D world with a memory
stream, retrieval, reflection, and planning.

---

## 2. Locked design decisions

1. **Git as the coordination/audit layer, single committer.** Everything the
   hive knows is files in one local git repo. To avoid `.git/index.lock`
   corruption with many concurrent agents, **only the Electron main process
   commits**. Agents never call git — they write plain files. (Research:
   GitHub Desktop's commit-queue pattern; lazygit/git-retry backoff.)
2. **Single-writer-per-file.** Each agent writes only inside its own
   `agents/<id>/` directory. Cross-agent delivery happens by the **router**
   (main process) moving messages from a sender's `outbox/` into a recipient's
   `inbox/`. No file is ever written by two processes.
3. **God-mode autonomy, native HITL.** A privileged **god agent** (lives in
   Michael's room) adjudicates cross-agent traffic. Routine requests
   (clarifications, data asks, plan tweaks) it resolves itself and the system
   keeps running fully autonomously. **Critical** items (destructive ops, spend,
   scope changes, unresolvable conflicts) route to the god, who surfaces them to
   the human natively in his own Claude Code session — there is no separate
   approval queue.

   > **What actually gates a tool today.** This decision named the CLI's own
   > tool-permission prompt as the HITL gate. That prompt is **not there on a
   > default install**: `autoMode` defaults to `true` and appends each engine's
   > bypass flag at spawn (`commandForAutoMode`, `src/main/config.ts`), so nothing
   > pauses to ask. What survives a bypass is the harness's own `PreToolUse` gate —
   > `control.toolDecision()` returns `permissionDecision: 'deny'` for a paused
   > agent or a gated tool (`src/main/hooks.ts`), the circuit breaker, and the
   > standing `permissions.deny` list (`AGENT_DENY_RULES`, `src/main/hive.ts`)
   > written into every hive-authored per-agent settings file — `deny` is the one
   > permission surface that survives `bypassPermissions`
   > ([#4](https://github.com/MARKXAILABS/hello-markx/issues/4)). That list is
   > calibrated to the unrecoverable and the credential-leaking only, and it is
   > **not** a sandbox: `Bash(…)` rules are prefix matches, and engines with no
   > settings file take no deny list at all. Turn auto mode off and the native
   > prompt is back, approvable remotely from a phone via `/remote-control`. See
   > [`SECURITY.md`](./SECURITY.md#known-limitations).
4. **Memory: markdown first.** Per-agent `memory.md` + shared blackboard. A
   heavyweight vector layer (Letta/Mem0/Zep) is *not* needed at 5–15 agents and is
   architecturally wrong here (they want to own the agent runtime; our runtime is
   the `claude` CLI).

   > **What recall actually is today.** The **SQLite FTS index** this decision
   > named was never built. Keyword recall is `hive:textSearch`
   > (`src/main/index.ts`): a linear `indexOf` scan over `board.md`, `tasks.json`
   > and every agent's `memory.md`, capped at 3 hits per file — adequate at hive
   > scale, but not an index. Semantic recall shipped as the **MemPalace CLI**
   > (not MCP — see §7 Phase 3): `memory.ts` spawns the binary, so a cold call pays
   > a process start plus an embedding-model load and is bounded by a 120 s
   > timeout. It is optional and a no-op when `mempalace` is not installed. There
   > is no benchmark in this repo; do not quote latency numbers for it.
5. **Autonomous loop = `Stop` hook.** ~~An agent that finishes drains its inbox
   via a `Stop` hook that returns `{"decision":"block","reason":…}` to keep it
   working, guarded by `stop_hook_active` to prevent infinite loops.~~
   **Reversed — see below.**

   > `hooks.ts` now answers **every** `Stop`/`SubagentStop` with `{}`: it notifies
   > and emits, and never forces a continuation. Turning unread mail into a forced
   > next turn bypassed the terminal-draft and HITL gates and could spend credits
   > while a human was mid-answer. `HiveManager.drainForStop()` still exists and
   > still works, but nothing in the app calls it.
   >
   > Delivery moved to the renderer instead: `useHive.ts` effect #3 sees an **idle**
   > agent holding unread inbox files and enqueues a nudge, which effect #4 — the
   > one gate allowed to type into a live PTY — delivers once the terminal is
   > genuinely free (see [`docs/message-queue.md`](./docs/message-queue.md) and
   > [ADR-0001](./docs/adr/0001-one-gate-for-pty-writes.md)). Consequence: dedup is
   > a per-renderer-session set of message ids, **not** the durable `cursor.json` —
   > see §3 and §8. Tracked as
   > [#5](https://github.com/MARKXAILABS/hello-markx/issues/5).

---

## 3. On-disk layout — the "hive"

Lives under `<harnessHome>/hive/`, a git repo committed only by the main process.

```
hive/
  PROTOCOL.md            # the agent-facing contract (how to remember + message)
  registry.json          # roster: every agent, role, capabilities, status, seat
  board.md               # shared blackboard / co-authored plans
  tasks.json             # task ledger (id, assignee, spec, status, result ref)
  log.jsonl              # append-only event feed (drives the UI activity stream)
  agents/<agentId>/
    identity.md          # who am I, my role, my capabilities  (read at start)
    memory.md            # my long-term memory  (I read at start, append as I learn)
    inbox/               # messages delivered TO me — <ts>-<msgid>.json
    inbox/.done/         # processed messages (kept for audit, not deleted)
    outbox/              # messages I want to SEND — router drains these
    cursor.json          # { lastProcessed: <msgid> } — seeded at spawn; only
                         #   drainForStop() advances it and nothing calls that
                         #   today, so it stays { lastProcessed: null } (§2.5)
```

Design rules that make this robust:
- **One JSON file per message**, written via temp-file + atomic `rename` — never
  a co-edited shared mailbox file (those conflict under git).
- **Append-only** `log.jsonl`; consumers track their own cursor. It rotates one
  generation deep at 8 MB (`log.jsonl.1`) and is gitignored, so an event feed
  nobody reads to the end cannot become an unbounded read or an unbounded repo.
- `board.md` is the one genuinely co-edited file — it goes through the god agent
  (single scribe) to avoid conflicts.

---

## 4. Message schema (FIPA-lite)

Borrow the one useful idea from FIPA-ACL/KQML — the **speech act** — and drop the
LISP syntax. Seven semantic fields:

```jsonc
{
  "id":            "2026-05-30T14-03-11-123Z-a1b2",  // unique, time-sortable
  "conversation":  "conv-7f3",                        // groups a thread
  "in_reply_to":   "<prev msgid> | null",
  "from":          "agent.researcher",
  "to":            "agent.coder | god | broadcast",
  "act":           "request | inform | propose | query | agree | refuse | done",
  "subject":       "short human-readable summary",
  "body":          "free text / markdown / structured payload",
  "hops":          3,            // ++ per reply; capped to kill ping-pong loops
  "requires_reply": true,        // only request/query/propose obligate a reply
  "needs_human":   false,        // router/god may flip this to escalate
  "created_at":    "ISO-8601"
}
```

Anti-livelock rules: only `request`/`query`/`propose` obligate a reply (pure
`inform`/`done` are terminal); every reply increments `hops`; past a hop cap the
god agent escalates instead of letting two agents loop forever; re-seeing a
processed `id` is a no-op (idempotent via cursor).

---

## 5. Control flow

```
agent B mid-task needs something from agent C
        │ writes  agents/B/outbox/<msg>.json   (act:request, to:C)
        ▼
┌─────────────────────── main process (the harness) ───────────────────────┐
│  Router watches every outbox/                                             │
│    → deliver to agents/C/inbox/   (to:"human" → routed to the god proxy;  │
│       the god surfaces critical calls natively in its own session)        │
│    → append to log.jsonl → git commit (single committer, retry+backoff)   │
└──────────────────────────────────────────────────────────────────────────┘
        │ delivered to C's inbox
        ▼
agent C finishes its current turn → Stop hook fires
        │ hook POSTs to the hive socket; main answers {} — never a forced continue
        │ C goes idle; the renderer sees idle + unread inbox → enqueues a nudge
        │ the drain loop types it in once C's prompt is genuinely free
        ▼
agent C keeps working: reads the messages, acts, replies via its own outbox
```

The same hook socket drives the avatars: `PreToolUse`/`PostToolUse` payloads move
an agent to the right station. Every payload must carry `HIVE_SOCK_TOKEN`
(`hookSockToken()` in `hooks.ts`), injected into agent child environments only, so
another local process cannot forge agent events — see [`SECURITY.md`](./SECURITY.md).

---

## 6. The god agent (orchestrator)

A fixed, always-on agent seated at `desk-ceo` (Michael's room), `character:
michael`, flagged `isGod`. It is an ordinary `claude` process — the *intelligence*
— while the main process is the *mechanism* (git, sockets, routing). It owns:

- **Roster & routing** (`registry.json`): who exists, their capabilities, status.
- **Adjudication**: read each outbound request; resolve routine ones itself
  (answer clarifications, route to the right specialist with a self-contained
  task spec), escalate only critical ones. This is "god mode."
- **Blackboard scribe**: the single writer of `board.md`, so shared plans never
  conflict.
- **Task ledger** (`tasks.json`): assign, track, retry, checkpoint.

Its escalation policy (what counts as "critical") lives in its system prompt and
is the primary control surface — tune the prompt, not the code.

---

## 7. Phased plan

- **Phase 0 — Foundation** ✅: `hive.ts` on-disk layer + spawn injection
  (identity, protocol, env) + IPC to read hive state. Agents are hive-aware: they
  read their memory/inbox at task start and send via outbox; the router delivers;
  everything is committed and visible.
- **Phase 1 — Autonomy** ⚠️ *shipped, but not as planned*: `hooks.ts` socket
  server + `cth-hook` shim (attached per agent via `--settings`) landed, and hook
  events stream to the renderer to drive avatars. Codex, Grok and Antigravity got
  their own translating hook bridges; engines with no hook system at all (Crush,
  qwen) get a loopback proxy sidecar that derives the same events from the model
  response. The **`Stop`-loop did not**: `Stop` returns `{}` and inbox
  delivery is the renderer's idle-only nudge instead. See §2.5 for why, and
  [#5](https://github.com/MARKXAILABS/hello-markx/issues/5).
- **Phase 2 — God mode** ✅: the god agent auto-spawns into Michael's room
  (`desk-ceo` reserved) and, on a fresh spawn, is started with `/remote-control`
  (best-effort) plus an orientation prompt so it begins running the floor on its
  own. The router routes `to:"human"` traffic to the god (the human's proxy);
  there is no separate approval queue — human-in-the-loop is native to each
  agent's Claude Code session (permission prompts, approvable remotely from a
  phone). Idle agents are woken when they hold unread inbox messages.
- **Phase 3 — Semantic memory** ✅ (CLI integration): `memory.ts` wraps the
  **MemPalace CLI** (not MCP, by decision). The harness keeps one shared palace
  under `harnessHome`, points every agent's `MEMPALACE_PALACE_PATH` at it, mines
  each agent's `memory.md` into its own wing (mtime-gated), and agents recall via
  `mempalace search` / `wake-up`. Detect-and-degrade: a no-op when `mempalace`
  isn't installed (markdown memory still works). Default model `minilm` (light,
  for low-RAM Macs); `embeddinggemma` is the multilingual opt-in. A `MemoryPanel`
  lets the human search the same palace.
  - *Shipped since*: reflection/summarization (`reflect.ts`) does bound
    `memory.md` — backup-first, verify-don't-trust, atomic swap, then an immediate
    re-mine of that agent's wing. It summarizes through an ephemeral interactive
    PTY (`hiddenClaude.ts`), **not** headless `claude -p`, so it draws on the
    interactive plan quota rather than metered API credit.
  - *Still open*: **the palace never shrinks.** `memory.ts` calls only `mine`,
    `search` and `wake-up` — there is no delete, prune or rebuild — so a chunk
    condensed out of `memory.md` stays in the shared palace forever and keeps
    outranking the decision that replaced it in recall
    ([#16](https://github.com/MARKXAILABS/hello-markx/issues/16)). Retrieval
    quality also still needs a live `mempalace` install to validate end-to-end.
    (`log.jsonl` and `backups/` are *not* on this list: the log rotates one
    generation at 8 MB and backups are pruned to the newest 20, and both are
    gitignored and untracked so they stay out of the hive repo —
    [#11](https://github.com/MARKXAILABS/hello-markx/issues/11).)

---

## 8. Key risks & mitigations

| Risk | Mitigation |
| --- | --- |
| `index.lock` corruption | Single committer (main process), retry+backoff, stale-lock cleanup |
| Infinite Stop-hook loop | Moot today — `Stop` always answers `{}` (§2.5). The `stop_hook_active` guard and the `hops` cap stay for when a drain returns |
| Two agents ping-ponging | Only request/query/propose obligate replies; hop cap → god escalates |
| Reprocessing messages | Agents move handled messages to `inbox/.done/` — instructed in the prompt, not enforced. `cursor.json` is seeded but never advanced; the live dedup is the renderer's per-session set of nudged message ids, lost on reload ([#5](https://github.com/MARKXAILABS/hello-markx/issues/5)) |
| `memory.md` unbounded growth | `reflect.ts` condensation (shipped). `log.jsonl` rotates one generation at 8 MB, `backups/` keeps the newest 20 — both gitignored. The **semantic palace** is still unbounded: nothing prunes it ([#16](https://github.com/MARKXAILABS/hello-markx/issues/16)) |
| Modifying the user's repo with hooks | Write hooks to `<cwd>/.claude/settings.local.json` (gitignored convention) |

---

## 9. References

- Anthropic — *Building a multi-agent research system* (lead/subagent, plan-to-memory).
- LangGraph supervisor (structured routing + handoff registry + checkpoints).
- FIPA-ACL / KQML (speech acts).
- Stanford *Generative Agents* (memory stream, reflection, 2D world).
- Claude Code hooks reference (`Stop`, `PreToolUse`, `UserPromptSubmit`; `stop_hook_active`).
