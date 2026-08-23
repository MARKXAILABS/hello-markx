# ADR-0001 — One gate for automatic PTY writes

**Status:** Accepted · **Recorded:** 2026-08-20 (the decision itself is older; this
record moves it out of `docs/message-queue.md` §1, which remains the full contract)

## Context

Every agent is a real CLI in a real PTY, and that CLI has exactly one input line. Two
parties want it: the human typing into the terminal, and the harness, which has
messages of its own to deliver — hive inbox nudges, Slack ingress, composer sends,
scheduled `/compact`.

When the inbox nudge wrote straight into the terminal it was a second writer with its
own idea of when the prompt was free. Its text landed on top of a half-written human
sentence and the two were submitted together as one garbled prompt.

## Decision

**Exactly one place types automatic text into a live agent's PTY**: the drain loop,
`DeliveryService.drainQueue()` in the main process (`src/main/delivery.ts:518`).
Everything else enqueues into the per-agent MD queue and lets the drain decide when.

> **Amended 2026-08-21.** As written in 2025 this decision named `useHive.ts` effect
> #4, in the RENDERER. The decision itself — one gate, never ad hoc — is unchanged and
> is why this record exists. What changed is **where the gate lives**: Phase 1 plan
> 01-08 deleted the renderer effect and moved the queue and its drain into main,
> because a gate that dies with the window is not a gate for an app whose whole
> premise is that you can close the window (#5). The renderer's drain was **deleted,
> not left as a fallback** — leaving it would have recreated the two-writer defect
> this ADR was written about. The pure policy both processes read is
> `src/shared/queueDelivery.ts`; the renderer keeps only a **veto** it reports up
> (`hive:deliveryVeto`), because the xterm buffer and the operator's keystrokes are
> the one fact main cannot see. The drain delivers the head of a queue only when the agent is
`idle`, auto-delivery is not paused (or the message was manually released), the boot
grace window has passed, `isTerminalAutomationSafe(ptyId)` says the user does not own
the prompt, and 4.5 s have passed since the last delivery to that agent.

One documented exception: the god agent's boot sequence writes its remote-control
command and orientation prompt directly. That PTY was spawned milliseconds earlier and
is covered by the boot-grace window, so there is no human draft it could land on.

## Consequences

- A new source of automatic messages needs **no** prompt logic of its own. It enqueues.
  That is the main thing this buys.
- Draft and picker detection is one-directional on purpose: a buffer read may only
  *clear* a block, never invent one. The two mistakes do not cost the same — a wrong
  "prompt is empty" fuses a queued message onto what you are writing; a wrong "has
  text" only parks that message until the block expires.
- Both inferred blocks expire after 30 minutes, because they are inferred rather than
  reported and a stuck flag would wedge that agent's queue for the session.
- A held queue looks like an idle agent with nothing to do, so the `typing` badge
  ("your draft") exists to answer *why nothing is being delivered*.

## Alternatives rejected

- **Let each caller write to the PTY and check the prompt itself.** This is what
  produced the garbled-prompt bug; every caller has to reimplement the same five-way
  safety check and one of them will get it wrong.
- **Send `Ctrl-U` before an automatic write.** An earlier version did, and it silently
  destroyed real human drafts that had merely been left alone for a minute.
- **Send `Escape` to close a picker so a queued message fits.** Taking down a menu the
  human deliberately opened is not the harness's call, and we cannot verify that the
  Escape worked anyway.

## Where it lives

`src/main/delivery.ts` (`drainQueue()` — **the gate**, plus the inbox wake, the
idle-quiesce backstop and account failover, all on one tick) ·
`src/shared/queueDelivery.ts` (the pure drain policy both processes import) ·
`src/renderer/src/hooks/useHive.ts` (effect #6, and the delivery veto it reports up) ·
`src/renderer/src/components/terminalAutomation.ts` (pure policy, unit-tested in
`test/terminal-automation.test.cjs`) · `src/renderer/src/components/terminalPool.ts`
(buffer reads, latches) · full contract in [`docs/message-queue.md`](../message-queue.md)
