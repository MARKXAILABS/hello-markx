# Deferred items — phase 04

Out-of-scope discoveries logged rather than fixed, per the executor's scope
boundary. Each names who found it and what would settle it.

## `sw.js:33-35`'s security comment is now false, and it is a SECURITY comment

- **Found by:** plan 04-17, task 3, making rule Q-4's one-line body-fallback change.
- **Observed:** the comment above the changed line reads *"The body is the fixed
  phrase, **unconditionally** — the question text is NEVER in the notification."*
  After the fallback lands, the body is conditional: it renders `data.body` when
  the sender supplies one. The **security property still holds** — `askPushPayload`
  and `floorQuietPushPayload` are the only two composers and neither carries a
  command, a path or a question, and both are asserted — but the *guarantee moved
  from the worker to the sender*, and the comment still claims the worker enforces
  it.
- **Why it was not fixed here:** 04-UI-SPEC rule Q-5 caps `resources/phone/sw.js`
  at **exactly one changed line** (it is installed on the operator's phone with no
  local reproduction of a mismatch), and plan 04-17's own acceptance criterion
  enforces that mechanically with `git diff --numstat` = 1 insertion, 1 deletion.
  Editing the comment would have broken the gate. Loosening the gate to fit the
  fix was refused.
- **Risk if left:** a future author who trusts the comment may put a command
  string in `data.body` believing the worker drops it. It does not.
- **What would settle it:** the next plan permitted to touch `sw.js` rewrites
  those three lines to say the sender composes the body and names the two
  composers. One comment, no behaviour change.

## codex 0.128.0 recognises only five of the eight hook events this app writes

- **Found by:** plan 04-15, task 2, running the no-spend acceptance check
  (`codex app-server` → `initialize` → `hooks/list`) against a config seeded by
  `installCodexHooks`.
- **Observed:** `hooks/list` reports `preToolUse`, `postToolUse`, `sessionStart`,
  `userPromptSubmit` and `stop`. The three groups `installCodexHooks` also writes
  — `SubagentStop`, `PreCompact`, `PostCompact` — are **absent from the resolver's
  output entirely**, i.e. codex's own event vocabulary does not include them at
  this version. Those three `[[hooks.*]]` tables have therefore been inert since
  the codex bridge shipped.
- **Pre-existing:** yes. Nothing in plan 04-15 changed which events are written;
  the plan only changed the `timeout` on `PreToolUse`.
- **Impact:** low and in the safe direction — three tables codex ignores. No
  parity claim in this repo depends on them today, but any prose saying "eight
  lifecycle events are bridged on codex" is wrong for this version.
- **What would settle it:** decide whether to drop the three unrecognised groups
  (smaller config, honest parity table) or keep them against a future codex that
  adds the events. Owner: the hive maintainer. Not fixed here — `installCodexHooks`
  belongs to whichever plan owns `hiveProvisioning.ts`'s event list, and changing
  the emitted event set is not this plan's scope.
