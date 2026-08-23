# ADR-0006 — One xterm Terminal per pty, for the app's lifetime

**Status:** Accepted · **Recorded:** 2026-08-21 (extracted from the header comments on
`src/renderer/src/components/terminalPool.ts` and
`src/renderer/src/store/terminalPoolPolicy.ts`)

## Context

`node-pty` keeps no scrollback. The pty streams bytes and forgets them; whatever has been
rendered lives only in the xterm `Terminal` that consumed the stream.

That makes the obvious lifecycle — create a `Terminal` when a view mounts, dispose it when the
view unmounts — quietly wrong. Every agent switch and every fullscreen toggle unmounts a view,
so the next mount got a brand-new empty terminal that stayed blank until the TUI on the other
end happened to repaint. That is the "terminal vanishes until I drag the splitter" bug: the
splitter drag forced a resize, the resize forced a repaint, and the content came back.

## Decision

**Each pty gets exactly ONE `Terminal`, created on first use and kept for the app's lifetime.**

It is opened into a detached host `<div>` and subscribes to the pty stream once, so its buffer
is always populated whether or not anything is looking at it. A view — the sidebar tab, the
fullscreen overlay — does not create or destroy a terminal. It **re-parents the existing host
element into itself** on mount and detaches it on unmount. The rendered content moves with the
element, so the terminal is complete and visible immediately, with no repaint required and
nothing to replay.

## The two bounding rules

One Terminal per pty forever is unbounded by construction, and it was: a long session
accumulated a terminal — its scrollback, its host element and its pty subscription — for every
agent that had *ever* run, including agents archived hours ago or dead with the previous
session (#20). Two rules bound it, and they exist because they cover **different** failures:

- **The CAP** (`TERMINAL_POOL_MAX`, 24) is the backstop for **churn**: many short-lived
  agents. When the pool is over cap, `terminalsToEvict()` evicts the least-recently-acquired
  detached entries. It is deliberately generous, because the sweep below is what actually
  reclaims dead agents and evicting a *live* agent's terminal silently drops its scrollback.
- **The SWEEP** (`orphanedTerminalIds()`) is the fix for the **actual leak**: an agent leaves
  the roster. It diffs the pool against the live pty ids and reclaims anything no longer
  there.

**Both refuse to touch a terminal that is currently attached to a view.** A detached terminal
can always be rebuilt on its next attach; disposing an attached one blanks a pane the user is
looking at. That guard is the reason both functions take `attached` on the entry rather than
inferring liveness.

Both rules are **pure functions in `terminalPoolPolicy.ts`**, separate from the pool itself,
specifically so they can be tested without xterm, WebGL or a DOM.

## Why the sweep, and not a dispose at each call site

This is the part worth recording, because the rejected design is the one a reader will propose
again.

The direct fix for "an agent left the roster" looks like disposing its terminal at the place
the agent is dropped. There are several such places — the archive action, the main-process
archive broadcast, the dead-pty reconcile at startup, a plain remove — **and they did not
agree with each other.** Each handled some of the cases; none handled all of them; and the
next drop path someone added would not have agreed either, because agreeing requires knowing
that a pool exists and that it must be told.

So reclamation is **swept against the live roster** instead of pushed from each dropper. The
sweep needs no cooperation from any call site, which means a new way to drop an agent cannot
reintroduce the leak. The cost is that reclamation is eventual rather than immediate — which
is fine, because the resource being reclaimed is a detached DOM element and a buffer, not a
lock or a file handle.

## Consequences

- Terminals outlive views by design. Anything that assumes "unmounted means disposed" is
  wrong here.
- Reclamation is eventual, so a just-archived agent's terminal survives until the next sweep.
- The pool's memory ceiling is the cap, not the number of agents that have ever run.
- The two policy functions are pure and unit-tested; the pool wiring around them is not, and
  that split is deliberate.

## Where it lives

- `src/renderer/src/components/terminalPool.ts` — the pool itself: `acquireTerminal`, the host
  element, the re-parenting, and the call sites of both policy functions.
- `src/renderer/src/store/terminalPoolPolicy.ts` — `TERMINAL_POOL_MAX`, `terminalsToEvict()`
  and `orphanedTerminalIds()`, with the "the call sites did not agree" note on the sweep.
