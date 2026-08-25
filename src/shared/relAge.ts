/**
 * ONE terse relative-age formatter, for the surfaces VIGIL-04 puts an age on.
 *
 * WHY A SHARED MODULE AND NOT A FIFTH COPY
 * Four relative-time implementations already exist in this tree — `WorkersTab.tsx:20`
 * (`0s`/`47s`/`4m`/`9h`/`3d`), `git/CommitGraph.tsx:57` (adds `…mo`),
 * `triggers/SchedulesSection.tsx:36` and `triggers/TriggerHistoryTab.tsx:106` (both
 * `just now`/`4m ago`/`in 3h`), plus `resources/phone/index.html:326`'s `timeAgo`. The two
 * new surfaces (the kanban card and the ASK ME header) use WorkersTab's shape: it is the
 * terse one, and a kanban column is 170px at its minimum (`TasksKanban.tsx:186`).
 *
 * 04-UI-SPEC § S5 rule A-1 deliberately does NOT refactor those five call sites onto this
 * module. They work, they are covered where they are covered, and rewriting them is a
 * regression surface with no requirement behind it. This module has exactly two consumers.
 *
 * WHY IT RETURNS THE UNIT AND NOT JUST A STRING
 * Rule A-2 defines stale as "the age stopped being minutes" — an age that renders in `h` or
 * `d`. Handing the caller the unit letter is what lets that rule exist without a threshold
 * constant: the emphasis on screen and the letter in the text are read off the same value,
 * so they cannot disagree. A caller that re-parsed the string could.
 *
 * THE ONE DELIBERATE DIVERGENCE FROM THE SHIPPED FUNCTION
 * `WorkersTab.tsx:20` guards with `if (ms < 1000) return '0s'`, and `NaN < 1000` is FALSE —
 * so a NaN falls straight through to `Math.round(NaN / 1000)` and comes out of the last
 * branch as the string `'NaNd'` (measured, not inferred; `Infinity` likewise yields
 * `'Infinityd'`). A card whose `updatedAt` does not parse would render that on the board,
 * which reads as a crash rather than as a missing timestamp — threat T-04-AGE-06. The guard
 * here is `!Number.isFinite(ms) || ms < 1000`, which also covers the negative case the
 * original already handled. Every other boundary is copied verbatim.
 *
 * `WorkersTab.tsx` is NOT changed to match (rule A-1): the divergence is stated here and
 * pinned by a parity test, not propagated. Do not "restore parity" by reintroducing it.
 *
 * Electron-free, DOM-free, no node builtins — so both tsconfig projects can see it.
 */

/** The unit the formatted text ends in. `h` and `d` are rule A-2's stale set. */
export type AgeUnit = 's' | 'm' | 'h' | 'd';

export interface RelAge {
  /** The rendered text, e.g. `4m`. */
  text: string;
  /** The unit `text` ends in — read this rather than comparing `ms` to a constant. */
  unit: AgeUnit;
}

/** Format an elapsed duration in milliseconds. Never throws; a non-finite or negative
 *  input degrades to `0s` rather than rendering `NaNd`. */
export function relAge(ms: number): RelAge {
  if (!Number.isFinite(ms) || ms < 1000) return { text: '0s', unit: 's' };
  const s = Math.round(ms / 1000);
  if (s < 90) return { text: `${s}s`, unit: 's' };
  const m = Math.round(s / 60);
  if (m < 90) return { text: `${m}m`, unit: 'm' };
  const h = Math.round(m / 60);
  return h < 48
    ? { text: `${h}h`, unit: 'h' }
    : { text: `${Math.round(h / 24)}d`, unit: 'd' };
}

/** Rule A-2's whole definition of stale: the age stopped being minutes. */
export function isStaleUnit(unit: AgeUnit): boolean {
  return unit === 'h' || unit === 'd';
}
