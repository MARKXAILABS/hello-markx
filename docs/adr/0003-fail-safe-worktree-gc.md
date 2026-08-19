# ADR-0003 — Worktree reclamation fails safe

**Status:** Accepted · **Recorded:** 2026-08-20 (extracted from the comments on
`worktreeHasUnintegratedWork` and `worktreeIsGcSafe`, `src/main/git.ts`)

## Context

Agents can run in their own git worktrees so parallel work never collides on branches.
Ephemeral workers — the ones a Slack message or a webhook spawns — are torn down
automatically, and preserved worktrees are swept later by a GC pass. Both moments are
a chance to delete somebody's uncommitted work, and a wrong delete is unrecoverable.

## Decision

Two gates, both biased the same way: **when we cannot prove the work is safe to
discard, we keep it.**

`worktreeHasUnintegratedWork()` decides whether to *preserve* at teardown. It returns
`keep: true` if the tree is dirty (uncommitted or untracked changes) **or** the branch
has commits the base does not. Any git query that fails is treated as "there might be
work" — an unknown status counts as dirty, an unknown ahead-count counts as ahead.

`worktreeIsGcSafe()` is the stronger sibling and decides whether an already-preserved
worktree may now be reclaimed. It returns `gc: true` only when **both** the tree is
clean **and** the content is already in the base branch, proven either by
`commitsAheadOf(base) === 0` (robust even after base advances) **or** by
`git diff --quiet base HEAD` (catches a squash merge, which leaves the original commits
unreachable so the ahead-count alone would never clear). Everything else — dirty tree,
un-integrated commits, or any query we could not run — yields `gc: false`.

Ephemeral workers never push, so "commits ahead of base" is the local proxy for
"un-pushed work / would-be PR".

## Consequences

- The failure mode is **disk**, not data loss: worktrees accumulate when git is
  unreadable or a branch was merged in a way neither check recognizes. That is the
  trade we want.
- Squash-merge support needs the second, more expensive proof. It is worth it; without
  it every squash-merged worker worktree would be kept forever.
- Killing a floor window must still run the per-PTY teardown, or these gates never get
  consulted and the worktrees leak anyway — see
  [#14](https://github.com/MARKXAILABS/hello-markx/issues/14).

## Where it lives

`src/main/git.ts` — `worktreeHasUnintegratedWork()`, `worktreeIsGcSafe()`,
`removeWorktree()`.
