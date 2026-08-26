# Deferred items — Phase 3

Out-of-scope discoveries logged during execution. Not fixed here (SCOPE BOUNDARY: only
issues directly caused by the current task's changes are auto-fixed; plan 03-09 is
docs-only and touches no source).

---

## D-1 — `test/gate05-bounded-wait.test.cjs` test 5 is load-dependent flaky

**Found during:** plan 03-09, pre-edit baseline run at base commit `a29c4054`.
**Status:** PRE-EXISTING. Not caused by any Phase 3 plan; observed before any edit was made.

**Measurement (this session, on this machine):**

| Run mode | Runs | Failures |
|---|---|---|
| Full suite (`npm test`) | 2 | 1 |
| File in isolation (`node --test test/gate05-bounded-wait.test.cjs`) | 6 | 0 |

Failing case: `5 — a MID-ask dead socket DENIES: killing the floor cannot turn a pending
deny into an allow`, at `test/gate05-bounded-wait.test.cjs:406`.

```
AssertionError [ERR_ASSERTION]
  actual:   'Denied: the floor answered this approval poll with something this shim could not read.'
  expected: /became unreachable/
```

The assertion message names the defect itself: the shim denied with *the ask reply's own
reason*, "so it never entered the wait and this case proves nothing." Under full-suite
contention the ask reply comes back unreadable **before** the bounded wait is entered, so
the test exercises a different path than the one it exists to cover — and still reports a
result either way.

**Why this matters beyond the flake:** on the contended path this test is *vacuous*, not
merely red. It is the same defect class Phase 3 spent nine plans removing — a criterion
that can be satisfied (or fail) without touching the behaviour under test. A retry loop
would hide it; the fix is to make the test wait for the socket to actually enter the
bounded wait before killing the floor.

**Owner:** unassigned. Recommend Phase 4's VIGIL/GATE work, which already owns
`gate05-bounded-wait`.

**Not fixed here because:** plan 03-09 changes no source and no test; fixing it would be an
unrelated-file change outside this plan's scope.
