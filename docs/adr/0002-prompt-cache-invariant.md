# ADR-0002 — The injected system prompt stays volatile-free

**Status:** Accepted · **Recorded:** 2026-08-20 (extracted from the comment on
`HiveManager.injectedPrompt`, `src/main/hive.ts`)

## Context

Every hive agent is spawned with a system-prompt prefix injected through
`--append-system-prompt` (or the equivalent for engines that take it another way). It
carries the agent's identity, its hive paths and the protocol it must follow.

Anthropic's prompt cache keys on a stable prefix. Anything in that prefix that changes
between turns re-primes the entire system prompt every turn — the cost of a habit like
stamping the current time into an identity block is paid on every single request, for
the whole life of the floor.

## Decision

The injected prefix interpolates **only values stable for an agent's whole lifetime**:
name, id, private directory, hive root, whether semantic memory is on. No dates, no
UUIDs, no counters, no board or registry state, nothing derived from `Date.now()`.

Volatile context belongs on the live channels — the inbox (hive messages) and the PTY —
never baked into the prefix.

A second rule rides along, from the same fix: **no shell syntax in the prefix.** Every
path and command is written the way the agent will actually type it on the platform it
is running on. `$VAR` is POSIX-only and expanded to nothing under `cmd.exe`, which made
those instructions dead on every Windows floor; string-concatenated separators produced
`C:\Users\x\hive\agents\god/inbox/`. Bake the absolute resolved path and use
`join()`. Absolute paths are also prompt-cache-stable, so the two rules agree.

## Consequences

- Live fleet state has to reach the orchestrator some other way. It does: `fleet.json`
  on disk, plus the roster line injected on a hook response — both outside the cached
  prefix.
- Anyone adding "helpful" context to the prefix will find the invariant as a comment
  at the top of the function, in the file they are already editing. That redundancy is
  deliberate; this record is the searchable copy.
- The invariant is a convention, not an enforced one. There is no test that fails when
  a `Date.now()` creeps into the prefix.

## Where it lives

`src/main/hive.ts` — `HiveManager.injectedPrompt()` and the block comment above it.
