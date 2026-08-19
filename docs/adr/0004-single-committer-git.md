# ADR-0004 — Single-committer git for the hive

**Status:** Accepted · **Recorded:** 2026-08-20 (the decision is `HIVE.md` §2.1; this
record adds what the implementation actually had to do)

## Context

The hive — roster, blackboard, task ledger, every agent's memory and mailbox — is
plain files in one local git repo, so that coordination is auditable and diffable. With
5–15 agents live, several will want to record something at the same moment. Concurrent
`git commit` in one repo produces `.git/index.lock` contention and, when a process dies
holding the lock, a repo that refuses every subsequent write.

## Decision

**Only the Electron main process commits.** Agents never call git; they write plain
files into their own `agents/<id>/` directory and the main process is the sole
committer. Cross-agent delivery is the router moving a file from a sender's `outbox/`
into a recipient's `inbox/`, so no file is ever written by two processes.

Commits are debounced and serialized behind a `committing` flag, retried a bounded
number of times with a **timer** backoff (never a blocking sleep — this runs on the
Electron main thread and a blocking retry freezes every window), and give up quietly on
a non-lock failure because the next mutation retries anyway.

A `.git/index.lock` older than the staleness threshold is treated as abandoned and
removed — but only after checking it does not belong to a live child of ours.

## Consequences

- Agents need no git knowledge, no credentials and no lock discipline. Their entire
  contract is "write a file in your own directory".
- The main process is a single point of failure for hive durability. It is also the
  only process that can see all of it, which is why the router, the log and the
  registry all live there.
- Message delivery is atomic by construction: one JSON file per message, written to a
  temp path and `rename`d. A co-edited mailbox file would conflict under git; a
  directory of small files does not.
- `board.md` is the one genuinely co-edited document, so it has a single scribe (the
  god agent) rather than a lock.

## Where it lives

`src/main/hive.ts` — the commit path (debounce, `committing` guard, retry/backoff,
stale-lock recovery) and the router. Design rationale in [`HIVE.md`](../../HIVE.md) §2
and §3.
