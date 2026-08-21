# Deferred Items — Phase 01 (finish-the-floor)

Out-of-scope discoveries found while executing a plan. Logged, not fixed.

| Found in | Item | Why deferred |
|----------|------|--------------|
| 01-05 task 1 | **`store.feeds` is written and never read.** `pushFeed` (`src/renderer/src/store/store.ts:638`) appends one line per tool line per agent, from `usePtyParser.ts:142`, `useHive.ts:618` and `mockEvents.ts:103`. `grep -rn "feeds" src/renderer/src --include=*.ts --include=*.tsx \| grep -v store/store.ts` returns **two hits, both unrelated prose** (`realtime/CostHud.tsx:5`, `realtime/costStore.ts:10`) — **zero components select the slice**. So the slice is a bounded (`FEED_MAX`) write-only buffer costing one array + one object allocation per tool line for a reader that does not exist. | Not a FLOOR-11 defect (no subscriber ⇒ no re-render ⇒ issue #20's roster clause is unaffected — this is the finding that resolves RESEARCH Open Question 5 as *leave alone*). Fixing it means either deleting the slice and its three writers or wiring a reader, and `src/renderer/src/store/store.ts` is **not** in 01-05's `files_modified` — it is already-correct, tested code this plan is forbidden to touch. Needs its own owner in a later wave. |
