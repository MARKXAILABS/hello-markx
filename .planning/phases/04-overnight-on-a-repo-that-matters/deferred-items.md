# Deferred items — phase 04

Out-of-scope discoveries logged rather than fixed, per the executor's scope
boundary. Each names who found it and what would settle it.

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
