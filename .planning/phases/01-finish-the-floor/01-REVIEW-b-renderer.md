---
phase: 01-finish-the-floor
slice: b-renderer
reviewed: 2026-08-21T00:00:00Z
depth: standard (deep on the seven named non-mechanical changes)
diff_base: origin/main..HEAD (gsd/v1.0-milestone)
files_reviewed: 79
findings:
  critical: 6
  warning: 11
  info: 4
  total: 21
status: issues_found
---

# Phase 01 — Code Review: RENDERER slice

**Reviewed:** 2026-08-21
**Depth:** standard, deep on the seven named non-mechanical changes
**Files Reviewed:** 79 (`git diff --name-only origin/main..HEAD -- src/renderer/`)
**Status:** issues_found

## Summary

The mechanical part of this slice holds up and was not re-litigated. Two claims were
verified as stated rather than taken on trust:

- **`PixelButton.tsx` is byte-identical.** `git rev-parse HEAD:src/renderer/src/components/PixelButton.tsx`
  → `bd286ebf5654a2647c93546dc135f608aeb5d0f0`. Matches. No finding.
- **The 16 remaining sub-14px sizes are all `aria-hidden` glyph spans.** Scripted scan of all
  79 changed files found exactly 16 sub-14px `fontSize` declarations, every one on an
  `aria-hidden="true"` span. Zero `aria-hidden` on a focusable element in the changed set;
  zero `aria-label` on a bare `<span>`/`<div>` without a `role`; zero icon-only buttons
  without a name. The token deletions (`--cth-text-display-sm`, `--cth-lh-display-sm`) have
  no orphaned consumers, and `--cth-lh-mono` (70 call sites) is defined at `tokens.css:81`.

The **non-mechanical** changes are where this slice is not ready. Six defects are blocking.
Three of them are the same root pattern — *a fact moved to main, but the renderer kept a
copy or a guard that no longer matches* — and they cost, respectively: the operator's typed
message, the operator's "this agent needs you" escalation, and a re-delivery of
pre-migration messages into live agent terminals. A fourth reintroduces the exact
flex-collapse defect the phase was chartered to remove, two rows below the fix, in the same
file. A fifth ships a safety indicator that under-reports a permissions bypass. A sixth
ships the phase's headline responsive feature at a breakpoint the shipping window cannot
reach.

### Untested renderer paths — named, not hand-waved

`test/renderer-components.test.cjs` is 6 tests over `PixelBadge` (×2), `BlockedBanner` (×2)
and `AgentCard` (×2), all through `renderToStaticMarkup` — a server render with **no effect
phase, no events, no state commits**, stated in the file's own header. Every finding below
is in a path that structurally cannot be reached by it:

| Path | Why nothing sees it |
|---|---|
| `useHive.ts:526-535` Stop→idle branch | effect-only; no test subscribes `onHiveHookEvent` |
| `useHive.ts:772-782` queue pull/push | effect-only; the pull-vs-push ordering is untested |
| `store.ts:521-527` `queueOp` error branch | no test drives `hiveQueue` returning `{ok:false}` |
| `MessageQueueComposer.queueIt` (`:137-149`) | zero tests on this component |
| `AgentCard` info-row containment | CR-03's two AgentCard tests assert the chip *exists* and its order; markup has no layout |
| `SidebarTabs.tsx` label truncation | zero tests on this component |
| `sidebarLayout.ts` collapsed branch | tested at vp 800/1000/1023/20 — widths the shipped window cannot produce (CR-05) |
| `agentRowForCard` → unresolved row → `'CLI default'` | function-level test exists; the *render* consequence (WR-08) is untested |

---

## Critical Issues

### CR-01: The composer wipes the user's message before knowing main accepted it — silent data loss

**File:** `src/renderer/src/components/MessageQueueComposer.tsx:146-148`, `src/renderer/src/store/store.ts:521-527`

**Issue:** `enqueueMessage` used to be a synchronous local store write that could not fail.
After FLOOR-02 it is `queueOp()` — fire-and-forget IPC whose rejection *and* whose
`{ok:false}` reply are both discarded:

```ts
// store.ts:521
void window.cth?.hiveQueue?.(op)
  .then((r) => { if (r?.queues) useStore.setState({ messageQueues: r.queues }); })
  .catch(() => { /* main's half absent — the next push corrects the view */ });
```

Main returns `{ok:false, error}` **with no `queues` key** on four reachable paths
(`src/main/delivery.ts:437-445`): `invalid agentId`, `unknown agent: <id>`,
`no harness home — nowhere durable to park this`, and
`queue full for <id> (MAX_QUEUED_PER_AGENT)`. `if (r?.queues)` is false, so nothing renders
and nothing is said. Meanwhile the composer has already thrown the text away:

```ts
enqueueMessage(agent.id, body);
setText('');            // unconditional
setAttachments([]);     // unconditional
```

**Concrete failure scenario:** an operator fills a worker's queue to
`MAX_QUEUED_PER_AGENT`, types a 400-word brief, presses Enter. The textarea clears, the
queue count does not move, no error appears anywhere in the UI, and the brief is gone —
there is no draft store for the composer (unlike `AskMeTab`, which keeps answers in
`answerDrafts`). The same happens on a floor whose `harnessHome` is unset. The comment
"the next push corrects the view" is only true for the *view*; it is false for the message,
which was never accepted.

**Fix:** make `enqueueMessage` return the result and have the composer clear only on
success.

```ts
// store.ts — return the promise instead of swallowing it
function queueOp(op: QueueOp): Promise<QueueResult> {
  try {
    return window.cth.hiveQueue(op)
      .then((r) => { if (r?.queues) useStore.getState().setQueues(r.queues); return r; })
      .catch((e) => ({ ok: false, error: String(e) }));
  } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); }
}
enqueueMessage: (agentId, text, meta) => { /* … */ return queueOp({ op: 'enqueue', … }); },

// MessageQueueComposer.tsx
const queueIt = async () => {
  if (!canSend) return;
  const body = /* … */;
  const res = await enqueueMessage(agent.id, body);
  if (!res.ok) { setSendError(res.error ?? 'could not queue'); return; } // keep the text
  setText(''); setAttachments([]);
};
```

At minimum, do not clear on failure. The existing `statusHint` line is already the place to
render `res.error`.

---

### CR-02: A quiet agent sitting at a permission prompt is silently reset to `idle` — the human escalation disappears

**File:** `src/renderer/src/hooks/useHive.ts:526-535` (renderer half); `src/main/delivery.ts:643-673` (producer)

**Issue:** the deleted renderer quiescence effect (2e) filtered on status before flipping
anything:

```ts
if (!a.ptyId || a.status !== 'working') continue;   // old useHive effect 2e
```

Main's replacement `quiesce()` has **no status filter at all**. It honours the breaker pin
and the boot grace, then emits a Stop-shaped event for *any* live agent whose PTY has been
quiet for `QUIESCE_IDLE_MS`:

```ts
this.deps.setStatus?.(a.agentId, 'idle');
this.deps.emit('hive:hookEvent', { agentId: a.agentId, event: 'Stop', blocked: false });
```

Effect 2's unblocked-Stop arm applies it unconditionally:

```ts
} else {
  breakerLevel.current[e.agentId] = 'healthy';
  updateAgent(e.agentId, { status: 'idle', action: 'idle', carrying: undefined });
}
```

**Concrete failure scenario:** an agent hits a tool-permission prompt. `usePtyParser:188` or
the hook `Notification` branch sets `status:'blocked'`; `OfficeFloor.tsx:1596-1597` paints
the red `!` glyph over the character and the operator's only cue that anyone needs them
appears. A permission prompt is a *static painted frame* — it emits no further bytes. Twelve
seconds later `quiesce()` fires, the renderer flips the agent to `idle`, and the `!` glyph
goes away. The agent is now indistinguishable from a spare worker and stays wedged at its
prompt indefinitely. `blockReason` (`store.ts:55`, documented as "populated when status ===
'blocked'") is **not** cleared by the flip, so the detail panel now shows a block reason on
an agent the floor calls idle — the state is inconsistent in both directions.

This is a regression introduced by the move: the old code could not do this, because
`blocked !== 'working'`.

**Fix (renderer side, one line, covers every producer of a synthesized Stop):**

```ts
} else {
  const cur = agents.find((a) => a.id === e.agentId)?.status;
  // A prompt on screen emits no bytes — silence is not turn-end for a blocked agent.
  if (cur === 'blocked') return;
  breakerLevel.current[e.agentId] = 'healthy';
  updateAgent(e.agentId, { status: 'idle', action: 'idle', carrying: undefined });
}
```

Route the mirror-image guard (`if (this.deps.status?.(a.agentId) === 'blocked') continue;`)
to the main slice so the durable `setStatus` write is fixed too.

---

### CR-03: `roster.json` still carries a frozen `queues` slice the renderer no longer owns — re-delivers pre-migration messages after a Change Home

**File:** `src/renderer/src/store/store.ts:600` (`rosterMirror.queues = initialQueues`), `src/renderer/src/store/store.ts:529-535` (dead `persistQueues`)

**Issue:** `persistQueues` has zero callers after this diff (verified: the only three call
sites were replaced by `queueOp`). But `rosterMirror.queues` is still seeded from
localStorage at module load and is written into `roster.json` on **every** roster flush
(`store.ts:372-376`), forever, at its boot-time value. The renderer therefore keeps
publishing a stale copy of a fact main now owns — the exact "one fact two owners" failure
the comment at `store.ts:529-535` says it is avoiding.

Main trusts that slice. `adoptRendererQueues()` (`src/main/index.ts:4040-4064`) is guarded
only by `existsSync(join(home, 'delivery-queue.json'))`, and `changeHome`
(`src/main/index.ts:3821`) copies exactly `['hive', 'palace', 'roster.json',
'roster-backups']` — **`delivery-queue.json` is at the home ROOT (`index.ts:491`) and is not
in that list.**

**Concrete failure scenario:** an operator with pre-migration messages in localStorage runs
Settings → Change Home. `roster.json` is copied (carrying the frozen `queues`);
`delivery-queue.json` is not. The app relaunches, `bootstrapHiveServices()` runs against the
new home, the `existsSync` guard passes, and `adoptRendererQueues()` re-enqueues every one
of those already-delivered messages. Main's drain then **types them into live agent
terminals** — arbitrary stale text pushed through the one gate this codebase treats as its
trust boundary (`sanitizePtyText`'s own docstring). Simultaneously, the *genuinely* pending
messages in `delivery-queue.json` are lost, because that file was never copied.

**Fix (renderer side — stop publishing a fact you no longer own):**

```ts
// store.ts:600 — the localStorage copy exists only for main's one-shot adoption.
// Do not keep re-publishing it: it is frozen, and main cannot tell frozen from current.
rosterMirror.queues = {};
```

and delete `persistQueues` (`:535`) with it. Route the co-factor — `changeHome` must copy
`delivery-queue.json` alongside `roster.json` — to the main slice.

---

### CR-04: The model chip reintroduces the collapse-to-zero the card was widened to fix

**File:** `src/renderer/src/components/AgentCard.tsx:319-328`

**Issue:** the card widened 220→322 because the identity row's only flexible item absorbed
the whole deficit from `flexShrink: 0` siblings and rendered at zero width — "not truncation,
a dropped field", per the comment at `:113-121`. The same commit adds a new `flexShrink: 0`
sibling to the info row **without any of the guards the row it was copied from uses**:

```tsx
<span title={…} style={{
  flexShrink: 0,
  fontSize: 'var(--cth-text-body-sm)',   // 14px
  lineHeight: 'var(--cth-lh-body-sm)',
  color: 'var(--cth-ink-500)',
  whiteSpace: 'nowrap'                    // no maxWidth, no overflow, no textOverflow
}}>{shortModel(row?.model) ?? 'CLI default'}</span>
```

The source it was copied from, `FullscreenTerminal.tsx:743-747`, bounds the identical chip:

```tsx
<span style={{ flexShrink: 0, maxWidth: '52%',
               whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} …>
```

All three of those guards were dropped.

**Concrete failure scenario:** the antigravity preset's own
`recommendedOrchestratorModel` is the literal string `'Gemini 3.1 Pro (High)'`
(`src/shared/agentProvider.ts:313`), which `shortModel()` passes through unchanged — 21
characters, ≈145px at 14px Inter, unshrinkable. The card's right column is
`322 − 16 (panel padding) − 36 (portrait) − 8 (gap) ≈ 262px`, shared by: the flexible
`infoLine` (`flex:1, minWidth:0`), this 145px chip, an optional cost chip, an account chip
(`maxWidth: 76`, `:348`) and three 5px gaps. Fixed content alone exceeds 262px, so
`infoLine` — the project / current-action line — resolves to **zero width and vanishes**,
and the model chip itself paints past the card edge. `qwen3-coder-plus` (16 chars) and the
`'CLI default'` fallback (11 chars, the *default* state for any agent with no model) narrow
the margin on every other card.

**Fix:** copy the guards from the row this was taken from.

```tsx
<span title={…} style={{
  flexShrink: 0, maxWidth: 96,
  fontSize: 'var(--cth-text-body-sm)', lineHeight: 'var(--cth-lh-body-sm)',
  color: 'var(--cth-ink-500)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
}}>{shortModel(row?.model) ?? 'CLI default'}</span>
```

The `title` already carries the full model id, so ellipsis loses nothing.

---

### CR-05: The responsive collapse cannot fire — the breakpoint (1024) is below the enforced window minimum (1280)

**File:** `src/renderer/src/store/sidebarLayout.ts:22`, `src/renderer/src/App.tsx:263`

**Issue:** `SIDEBAR_COLLAPSE_WIDTH = 1024` and `vpWidth` is `window.innerWidth`
(`App.tsx:79`, refreshed on `resize` at `:229`). The BrowserWindow is created with
`minWidth: MIN_WIN.width` where `MIN_WIN = { width: 1280, height: 800 }`
(`src/main/index.ts:2516`, `:2670`), the window is `titleBarStyle: 'hiddenInset'`, and there
is **no `setZoomFactor` / `setZoomLevel` call anywhere in the repo** (grep: zero hits). At
default zoom `window.innerWidth` therefore has a hard floor of ~1280 and
`vpWidth >= 1024` is always true.

**Consequence:** `collapsed`, `showToggle`, `showOverlay` and `overlayWidth` are unreachable
in every shipping configuration. The `show panel` / `hide panel` button (`App.tsx:543-561`),
the overlay (`:519-530`) and the `SIDEBAR_OVERLAY_GUTTER` clamp are dead code. The stated
purpose — making `DESIGN.md:678` ("Right panel collapses below 1024 to bottom drawer") true
— is **not achieved**; the doc/code contradiction the plan set out to close is still open.
`test/renderer-runstate.test.cjs:188-225` exercises this at viewport widths 1023, 1000, 800
and 20, so the suite is green on states the app cannot produce, which is worse than no test:
it reads as coverage.

The pure function itself is correct — boundary is right (`>= 1024` not collapsed, matching
"below 1024"), and the overlay is anchored `right: 0` with `overlayWidth = min(sidebarWidth,
vpWidth − 48)`, so it can never be stranded offscreen or written back through
`setSidebarWidth`. The defect is entirely that nothing can call it with a collapsing width.

**Fix:** pick one and make it explicit.

```ts
// Option A — align the breakpoint to the window floor (make the feature reachable):
export const SIDEBAR_COLLAPSE_WIDTH = MIN_WIN_WIDTH; // 1280, imported from a shared const
// Option B — lower the window floor so 1024 is reachable, in src/main/index.ts:2516.
```

Either way, add a test asserting `SIDEBAR_COLLAPSE_WIDTH > MIN_WIN.width` so the two
constants cannot drift apart again silently. `test/ci-config.test.cjs` is the precedent for
that kind of cross-file constant assertion.

---

### CR-06: `isAutoModeAgent` returns `false` for a genuinely bypassed `custom` agent — the safety chip under-reports

**File:** `src/renderer/src/store/autoMode.ts:42`; the behaviour is *asserted* at `test/renderer-runstate.test.cjs:138`

**Issue:** the `custom` arm returns `false` unconditionally, on the reasoning that "custom is
an arbitrary binary … the floor never bypasses it". That reasoning covers what the *floor*
splices onto the command; it does not cover what the *operator typed*. With provider
`custom`, `AddAgentModal` hands the operator a free-text command field
(`buildSpawnCommand` returns `config.defaultCommand || ''` for custom,
`store/config.ts:414`) and spawns whatever is in it verbatim.

**Concrete failure scenario:** the operator selects "Custom" and enters
`claude --dangerously-skip-permissions` (or `my-wrapper --yolo`, or
`codex --dangerously-bypass-approvals-and-sandbox`). The PTY runs a genuinely
permissions-bypassed agent. `inferAgentProvider(cmd, 'custom')` honours the explicit
override, hits line 42, and returns `false` — **no AUTO chip on any of the three
renderings**, and `AgentCard`'s `aria-label` omits the "runs with permissions bypassed"
clause too. The module's own docstring calls this "the worst failure this chip can have";
this is that failure, in the direction the module does not check.

The test at `:138` enshrines it:
`assert.equal(isAutoModeAgent('custom', 'my-agent --yolo --dangerously-skip-permissions', true), false)`
— a command carrying two real bypass flags, asserted as not-bypassed.

**Fix:** for `custom`, scan the command against every preset's flag instead of returning a
flat `false`. The floor still cannot *grant* a bypass to custom; it can and must *report*
one the operator granted.

```ts
if (p === 'custom') {
  // The floor never splices a flag onto a custom command — but the operator may have
  // typed one, and a bypass we can read is a bypass the chip must show.
  const cmd = command ?? '';
  return AGENT_PROVIDER_PRESETS.some((preset) => {
    const f = (preset.autoFlag ?? '').trim();
    return !!f && cmd.includes(f);
  });
}
```

Update `test/renderer-runstate.test.cjs:138` to assert `true` for that fixture (the source is
the contract here, not the test) and keep `isAutoModeAgent('custom', 'my-agent', true) === false`
as the "no flag, no chip, not even with the toggle" case.

---

## Warnings

### WR-01: The safety predicate reads `autoModeFlag`; the command builder writes `autoFlag`

**File:** `src/renderer/src/store/autoMode.ts:66` → `src/shared/agentProvider.ts:624`; builder at `src/renderer/src/store/config.ts:427`

**Issue:** `isAutoModeAgent` matches against `autoModeFlagForProvider(p)`, which returns
`preset.autoModeFlag`. `buildSpawnCommand` appends `preset.autoFlag`. These are two separate
optional fields on `AgentProviderPreset`. All eleven presets currently set both to the same
string, so today the predicate is correct by coincidence. The moment anyone edits one
without the other — and `agentProvider.ts:74-75` explicitly documents them as a legacy pair —
the chip starts lying silently, in whichever direction the edit went. Nothing in the suite
compares the two fields.

**Fix:** read the same field the builder writes, and pin the invariant:

```ts
// autoMode.ts
const flag = (providerPreset(p).autoFlag ?? '').trim();
```
plus, in `test/renderer-runstate.test.cjs`:
```js
for (const p of AGENT_PROVIDER_PRESETS)
  assert.equal(p.autoFlag ?? '', p.autoModeFlag ?? '', `${p.id}: auto flags must not drift`);
```

### WR-02: `'--auto'` is a substring match — any `--auto*` flag flips the AUTO chip on

**File:** `src/renderer/src/store/autoMode.ts:68`

**Issue:** `(command ?? '').includes(flag)` is a raw substring test. Kimi's flag is `'--auto'`,
which is a prefix of every plausible neighbour: `kimi --model x --auto-compact` or
`--autosave` both make `includes('--auto')` true and paint a permissions-bypassed badge on an
agent that is not bypassed. The other presets are safe today only because their flags happen
to be long and unlikely (`--yolo`, `--approve`, `--permission-mode bypassPermissions`).

Note also that Copilot's flag is a three-token string, `'-s --allow-all-tools --no-ask-user'`;
`includes` only matches because `buildSpawnCommand` appends it as one contiguous chunk. Any
future arg spliced between those tokens breaks the match into a false negative.

**Fix:** tokenize both sides instead of substring-matching.

```ts
const flagTokens = flag.split(/\s+/).filter(Boolean);
const cmdTokens = new Set((command ?? '').split(/\s+/));
return flagTokens.every((t) => cmdTokens.has(t));
```

### WR-03: The one-shot queue pull can clobber a newer push

**File:** `src/renderer/src/hooks/useHive.ts:772-777`

**Issue:** the effect subscribes to `onHiveQueue` and *then* issues an unordered
`hiveQueue({op:'list'})`. Both write the same slice with no sequencing:

```ts
const off = window.cth.onHiveQueue?.((queues) => { useStore.getState().setQueues(queues); });
void window.cth.hiveQueue?.({ op: 'list' }).then((r) => {
  if (r.queues) useStore.getState().setQueues(r.queues);   // may resolve AFTER a push
}).catch(() => {});
```

**Failure scenario:** window reloads at t0 and issues the list. At t1 an inbound Slack message
is enqueued and main pushes the updated snapshot, which the store applies. At t2 the list
reply — a snapshot taken at t0 — resolves and overwrites it. The new message disappears from
the composer's queue view (and from `queue.length`, which drives the whole `statusHint`
block) until the next unrelated mutation pushes again. Main still delivers it; only the
operator's view is wrong, and wrong in the direction of "your message vanished".

**Fix:** stamp the applications, or simply drop the pull result if any push has landed:

```ts
let pushed = false;
const off = window.cth.onHiveQueue?.((q) => { pushed = true; useStore.getState().setQueues(q); });
void window.cth.hiveQueue?.({ op: 'list' }).then((r) => {
  if (!pushed && r.queues) useStore.getState().setQueues(r.queues);
}).catch(() => {});
```

### WR-04: `setQueues` is documented as the only writer of the view; `queueOp` writes it directly

**File:** `src/renderer/src/store/store.ts:524` vs `:291-294`

**Issue:** the `setQueues` doc says "this is the only writer of it", and `useHive.ts:783`
repeats the claim. `queueOp` bypasses it: `useStore.setState({ messageQueues: r.queues })`.
Three writers now exist (push, pull, op-reply), two of which skip the declared gate — so a
future invariant added to `setQueues` (ordering, sequence numbers, the WR-03 fix) silently
does not apply to the op-reply path.

**Fix:** `.then((r) => { if (r?.queues) useStore.getState().setQueues(r.queues); })`.

### WR-05: Optimistic task mutations revert on screen for up to 5 s

**File:** `src/renderer/src/hooks/useHiveTasks.ts:25-40`; consumers `TasksKanban.tsx:139-147`, `TaskDetailOverlay.tsx:39-48`, `AskMeTab.tsx`

**Issue:** `refreshHiveTasks()` is `void read()` with no in-flight guard and no sequencing
against the 5 s interval, and `read()` overwrites `cached` with whatever resolves last.

**Failure scenario:** the operator drags a card to `done`. `move()` writes it optimistically,
awaits `hivePatchTask`, and calls `refreshHiveTasks()`. Meanwhile the 5 s interval had already
fired a `read()` before the patch hit disk. That older read resolves second, overwrites
`cached` with the pre-patch ledger, and every consumer's `useEffect([rawTasks])` calls
`setTasks(parseTasks(stale))` — the card jumps back to its old column, then jumps forward
again on the next tick. Same for `TasksKanban.dismissTask`: the dismissed card reappears and
then disappears. This is precisely the flicker the local optimistic `useState` was kept to
prevent.

**Fix:** drop stale responses with a generation counter.

```ts
let gen = 0;
async function read(): Promise<void> {
  const mine = ++gen;
  let next; try { next = await window.cth.hiveTasks(); } catch { return; }
  if (mine !== gen) return;          // a newer read already landed
  cached = next; lastReadAt = Date.now();
  for (const l of listeners) l(next);
}
```

### WR-06: SidebarTabs clips its labels at BOTH ends, with no ellipsis and no hover recovery

**File:** `src/renderer/src/components/SidebarTabs.tsx:49-66`

**Issue:** the containment fix pairs `justifyContent: 'center'` with `overflow: 'hidden'` and
no `textOverflow`. When a flex item's centred content overflows, it overflows *symmetrically*
— the clip takes the same amount off the leading edge as the trailing edge, and the leading
overflow is unreachable (no scroll). The documented remaining 17px clip on TERMINAL/MESSAGES
therefore does not render `TERMINA…`; it renders roughly `ERMINA`, losing the first character
as well as the last, with no `title` and no `aria-label` on the button to recover the full
word by hover.

The accessible name is unaffected (accname reads text content, not painted glyphs), so this
is a sighted-user defect only — but it is a defect, and it is the *specific* remaining clip
this phase filed as known.

**Fix:** two lines, no layout change.

```tsx
justifyContent: 'flex-start',   // clip the tail only
textOverflow: 'ellipsis',
// and on the <button>:
title={t.label.toUpperCase()}
```

### WR-07: `hiveNotifyBlocked` is called unguarded while its catch claims version-skew resilience

**File:** `src/renderer/src/hooks/usePtyParser.ts:182`

**Issue:**

```ts
window.cth.hiveNotifyBlocked(agentId).catch(() => {
  /* main tearing down, or a renderer hot-reloaded against an older main */
});
```

`.catch()` cannot catch a synchronous `TypeError` from invoking `undefined`. On the exact
scenario the comment names — a renderer running against a preload that predates
`hive:notifyBlocked` — this throws inside the pty-data handler on every blocked transition
rather than degrading. Every other new bridge call in this slice uses optional chaining
(`window.cth.onHiveQueue?.`, `window.cth.hiveQueue?.`, `autonomyApi().onHiveDelivered?.`);
this one does not.

**Fix:** `void window.cth.hiveNotifyBlocked?.(agentId)?.catch(() => {});`

### WR-08: The card asserts "CLI default" when it simply could not resolve the agent row

**File:** `src/renderer/src/components/AgentCard.tsx:320, 328`

**Issue:** `agentRowForCard` deliberately fails safe to `undefined` on an ambiguous name (two
agents sharing a name with no live PTY) — good. But the render turns that "unknown" into a
positive claim: the chip prints `CLI default` and the tooltip reads
`Runs the CLI default model`. The operator is told a fact about an agent whose row the card
could not identify. `autoMode` degrades correctly here (absent chip = no claim); the model
chip does not.

**Fix:** distinguish the two:

```tsx
const modelText = row ? (shortModel(row.model) ?? 'CLI default') : '—';
const modelTitle = !row ? 'Could not resolve this agent (duplicate name, no live terminal)'
  : row.model ? `Model: ${row.model}` : 'Runs the CLI default model';
```

### WR-09: `lastFlush` is now write-only, and the comment above it describes a guard that no longer exists

**File:** `src/renderer/src/hooks/useHive.ts:340` (decl), `:758` (only write), comment at `:745-753`

**Issue:** the ref is written by effect 4a and read by nobody — the only reader was the
`dispatch()` cooldown deleted with the drain. The comment above still explains it as
"Stamp the queue drain's per-agent cooldown so effect #4 does not type on top of it. (#4's
idle gate catches this too…)", naming a `#4` that is now a passive queue view. At 3am this
reads as an active anti-collision guard; it is a no-op. Nothing in the toolchain flags it —
`noUnusedLocals: false` in `tsconfig.web.json:19`, and the ESLint config carries exactly two
react-hooks rules.

**Fix:** delete `lastFlush` and rewrite the 4a comment to say only what it still does (mark
the agent as reading its inbox).

### WR-10: Dead imports in `useHive.ts`

**File:** `src/renderer/src/hooks/useHive.ts:2` (`type QueuedMessage`), `:26` (`deliverWithAcknowledgement`)

**Issue:** both appear exactly once in the file — on their import line. `deliverWithAcknowledgement`
was the drain's delivery primitive; the drain is gone, but the import was repointed from
`./queueDelivery` to `@shared/queueDelivery` rather than removed, so the renderer bundle
still pulls the shared module in for nothing. Neither `noUnusedLocals` (off) nor the
two-rule ESLint config can see this, which is why it survived the lint gate.

**Fix:** delete both. Also consider turning on `noUnusedLocals` for the web tsconfig — the
whole point of FLOOR-16 was that inert guards are worse than no guards.

### WR-11: The god-spawn effect's comment claims values are read "at spawn time"; they are read from a closure captured at effect time

**File:** `src/renderer/src/hooks/useHive.ts:477-485`, reads at `:385-441`

**Issue:** the added eslint-disable is justified with "The rest are read inside the 1.2s
timeout, at spawn time, which is the moment their values matter." The 1.2 s timeout delays
*when the read executes*, not *which object it reads*: `config.godProvider`,
`config.godModel`, `config.godAccount` and `config.godAccountPolicy` all resolve against the
`config` object captured when the effect last ran. This is the identical bug class that the
`configRef` added at `:334-335` in this same diff was introduced to fix for the failover
labels — and `configRef` is right there, unused by this effect. A config update landing in
the 1.2 s window (the async config load settling, or main pushing a patch) spawns Michael on
the old engine/model with no signal that it happened.

**Fix:** read through the ref that already exists.

```ts
const cfg = configRef.current;
if (!cfg) return;
const godProvider = cfg.godProvider ?? 'claude';
const godModel = cfg.godModel;
```
and correct the comment to describe what the code does.

---

## Info

### IN-01: `persistQueues` is dead, and its "deliberately kept" rationale is inverted

**File:** `src/renderer/src/store/store.ts:529-544`

The comment keeps a *writer* alive because a *reader* elsewhere still exists. Those are
independent: `rosterMirror.queues` reads a value seeded at `:600`; nothing needs the
function that used to update it. It is unreachable code with a rationale that reads as
reviewed. Delete it alongside the CR-03 fix.

### IN-02: The "one poll" claim in `useHiveTasks` is not quite true

**File:** `src/renderer/src/hooks/useHiveTasks.ts:4-9`; remaining reads at `src/renderer/src/scene/office/OfficeFloor.tsx:1017`, `src/renderer/src/realtime/tools.ts:169,579,631`

The header says the office floor "ran two more"; only one (`pollTaskBoard`) was migrated.
`OfficeFloor.tsx:1017` still reads `hiveTasks()` directly on a 30 s cadence inside the boss-aura
ticker. That is defensible (different cadence, imperative scene), and the `realtime/tools.ts`
reads are on-demand — but the doc comment overstates the result. Amend it to name the
survivors.

### IN-03: `treeWidth = 424` duplicates the drag clamp inline and is not viewport-relative

**File:** `src/renderer/src/ide/IdePanel.tsx:108`, clamp at `:341`

`424` and the `200..520` bounds are three magic numbers written in two places (one of them
inside a trailing comment). The sibling control, `SidebarSplitter`, takes `viewportWidth` and
clamps relatively; `treeWidth` clamps only against absolutes. Harmless at the enforced 1280
minimum, but it will drift the first time either the window floor or the tree default moves.
Extract `const TREE_W = { def: 424, min: 200, max: 520 }` and use it in both places.

### IN-04: `role="img"` on a visible text unit is a misuse of the pattern

**File:** `src/renderer/src/components/triggers/ui.tsx:348`

`<span role="img" aria-label="percent">%</span>` — `role="img"` exists to give a *glyph* an
accessible name. `%` next to a number input is ordinary text that already announces
correctly; overriding it to `img`/"percent" makes the output slightly worse
("percent" instead of "%"), and the input it modifies has no programmatic association either
way. Prefer plain text here, or associate it with `aria-describedby` on the input.

---

## Verified — no finding

- `PixelButton.tsx` blob hash matches `bd286ebf5654a2647c93546dc135f608aeb5d0f0` exactly.
- 16/16 remaining sub-14px `fontSize` declarations in the changed set sit on `aria-hidden` spans.
- No `aria-hidden` on any focusable element in the 79 changed files.
- No unnamed icon-only control in the changed files (`AgentCard`'s `✎` button carries
  `aria-label={`Edit note for ${name}`}`; `IdePanel`'s caret, `GitPanes`' close, `PtyTerminalView`'s
  zoom controls and `FullscreenFileEditor`'s close all carry `title` + `aria-label`).
- No `aria-label` on a bare `<span>`/`<div>` without a `role`.
- Deleted tokens `--cth-text-display-sm` / `--cth-lh-display-sm` have zero remaining consumers;
  `--cth-lh-mono` (70 consumers) is defined at `tokens.css:81`.
- `sidebarLayout()`'s boundary is correct (`>= 1024` → not collapsed, matching "below 1024"),
  the overlay is anchored `right: 0` and cannot be stranded offscreen, and `overlayWidth` is
  never written back through `setSidebarWidth`. The defect is CR-05: nothing can reach it.
- The `useHiveTasks` migration dropped no 5 s poll consumer and introduces no render loop
  (`agentRowForCard` and the parse `useMemo`s all return stable references or scalars).
- `useHive` effect 4's optional-chaining short-circuit is correct — `a?.b(x).then(y)`
  short-circuits the whole chain, so a missing `hiveQueue` does not throw.
- Main's `quiesce()` does honour the breaker pin, so the renderer's unconditional
  `breakerLevel.current[id] = 'healthy'` at `useHive.ts:533` is not reachable for a
  constrained/stopped agent. (The *status* half of that branch is still CR-02.)
- No `console.log`, `debugger`, empty catch block, or new `TODO`/`FIXME` introduced by this diff.

---

_Reviewed: 2026-08-21_
_Reviewer: Claude (gsd-code-reviewer) — RENDERER slice_
_Depth: standard, deep on the seven named non-mechanical changes_
_Not committed — orchestrator merges the three slices._
