# Architecture decision records

Standing decisions about how this app is built: what was decided, what it rules out,
and what it costs. One file per decision, numbered, never renumbered. A decision that
gets reversed is superseded by a new record, not edited away — the reversal is the
interesting part.

All six so far are **extractions, not new decisions.** Each was already argued out
and written down, in a source comment or in `docs/message-queue.md`, where nobody
looking for "why is it like this" would find it. Moving them here does not change any
behaviour; the source comments stay where they are, because that is where you hit them
while editing.

| # | Decision | Status |
| --- | --- | --- |
| [0001](./0001-one-gate-for-pty-writes.md) | One gate for automatic PTY writes | Accepted |
| [0002](./0002-prompt-cache-invariant.md) | The injected system prompt stays volatile-free | Accepted |
| [0003](./0003-fail-safe-worktree-gc.md) | Worktree reclamation fails safe | Accepted |
| [0004](./0004-single-committer-git.md) | Single-committer git for the hive | Accepted |
| [0005](./0005-cumulative-cost-ledger.md) | The cost ledger holds cumulative snapshots | Accepted |
| [0006](./0006-terminal-pool-lifetime.md) | One xterm Terminal per pty, for the app's lifetime | Accepted |

Related documents that are *not* ADRs: [`HIVE.md`](../../HIVE.md) (the multi-agent
design and its open gaps), [`docs/message-queue.md`](../message-queue.md) (the full
contract ADR-0001 summarizes), [`SECURITY.md`](../../SECURITY.md) (network surface and
known limitations), and [`SPEC.md`](../../SPEC.md) (superseded original MVP spec).
