# Deferred Items — Phase 01 (finish-the-floor)

Out-of-scope discoveries found while executing a plan. Logged, not fixed.

| Found in | Item | Why deferred |
|----------|------|--------------|
| 01-05 task 1 | **`store.feeds` is written and never read.** `pushFeed` (`src/renderer/src/store/store.ts:638`) appends one line per tool line per agent, from `usePtyParser.ts:142`, `useHive.ts:618` and `mockEvents.ts:103`. `grep -rn "feeds" src/renderer/src --include=*.ts --include=*.tsx \| grep -v store/store.ts` returns **two hits, both unrelated prose** (`realtime/CostHud.tsx:5`, `realtime/costStore.ts:10`) — **zero components select the slice**. So the slice is a bounded (`FEED_MAX`) write-only buffer costing one array + one object allocation per tool line for a reader that does not exist. | Not a FLOOR-11 defect (no subscriber ⇒ no re-render ⇒ issue #20's roster clause is unaffected — this is the finding that resolves RESEARCH Open Question 5 as *leave alone*). Fixing it means either deleting the slice and its three writers or wiring a reader, and `src/renderer/src/store/store.ts` is **not** in 01-05's `files_modified` — it is already-correct, tested code this plan is forbidden to touch. Needs its own owner in a later wave. |

## From 01-08 (wave 4)

- **`delivery-queue.json` is not in the hive's `.gitignore` seed or `UNTRACK_PATHS`.**
  `src/main/hive.ts:304` (`UNTRACK_PATHS`) and `:738-740` (the `.gitignore` seed in `ensureHive`) do
  not name the new main-owned queue file, so the hive's auto-commit will version it — a fresh copy of
  its whole self in every hive commit, the same churn `cost-ledger.jsonl` was untracked for. Not a
  correctness defect. `src/main/hive.ts` is owned by other plans this wave and the next, and 01-08's
  plan forbids touching it. Owner: whichever plan next holds `src/main/hive.ts`.

- **`docs/message-queue.md` and `docs/adr/0001-one-gate-for-pty-writes.md` name a deleted code path.**
  Both still say the one automatic PTY writer is `useHive.ts` effect #4, which 01-08 deleted; the
  writer is now `DeliveryService.submit()` in `src/main/delivery.ts`, fed by the main-owned queue.
  `message-queue.md` §1's diagram, §2's condition table, §6's file table, and ADR-0001's `Decision`
  and `Where it lives` sections are all affected. This makes ROADMAP criterion 1's "grep finds no doc
  promising a code path that does not run" clause FALSE. Neither file is in 01-08's `files_modified`;
  01-07's twelve-denial sweep is the precedent for doc corrections landing in their own plan.
  Owner: a plan that holds those two files, before 01-23's wave-9 sweep.

## From 01-10 (wave 5)

- **Seven more `"Enterprise Knowledge Graph"` sites survive the FLOOR-07 (#31) rename.**
  01-10 renamed the two the plan scoped (`README.md` — already clean, and `src/preload/index.ts`,
  three instances) plus the two comments in `src/main/index.ts` (:552, :4201), because leaving the
  claim in a file this plan was renaming it out of would have recreated the defect one line over.
  Still carrying it, measured at 94d6653:
  `resources/skills/capabilities/SKILL.md:96` (**agent-facing** — the highest-value one left),
  `src/main/config.ts:159/:275/:493`, `src/main/hive.ts:1444`,
  `src/renderer/src/store/config.ts:74/:142`.
  `docs/floor-inspection.html:710` is deliberately excluded: it is the audit record QUOTING the
  defect, and correcting it would erase the finding. None of these files is in 01-10's
  `files_modified`, and `src/main/hive.ts` and `src/main/config.ts` have owners in other waves, so
  editing them here risks a lost update (`use_worktrees: false`). The repo-claims pin added by 01-10
  covers only `README.md` and `src/preload/index.ts` — widening it would turn it red today.
  Owner: a plan that holds those files, before 01-23's wave-9 sweep.

- **`cost-ledger.jsonl` still has no rotation, and `memory_fts` now has no retention either.**
  01-10 added an FTS5 index fed from every agent's `memory.md` on the mine loop. It is bounded
  per agent (a re-index REPLACES that agent's rows, and each chunk is capped at 4,000 chars), so it
  cannot grow without bound for a fixed roster — but nothing prunes the rows of an agent that has
  been deleted from the hive, so a long-lived install accumulates one dead agent's notes per
  teardown. Not a correctness defect and not reachable by recall unless the caller names the dead
  agent's id. RECORD-02 (Phase 4) owns ledger/index retention; this belongs with it.
