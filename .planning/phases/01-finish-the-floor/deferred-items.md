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
