import { useCallback, useEffect, useState } from 'react';
import { Modal } from './Modal';
import { PixelButton } from './PixelButton';
import { PixelBadge } from './PixelBadge';
import { Icon } from './Icon';
import { useStore } from '@/store/store';
import { useHiveTasks, refreshHiveTasks } from '@/hooks/useHiveTasks';
import { relAge, isStaleUnit } from '@shared/relAge';

/** A card on the task kanban. Mirrors HiveTask in the main/preload process —
 *  re-declared locally so the renderer doesn't reach into the preload package
 *  (same convention as store/config.ts). */
export interface HumanQA {
  q: string;
  a?: string;
  askedAt?: string;
  answeredAt?: string;
  /** Set when the human dismisses the ask from the ASK ME board WITHOUT
   *  answering — the question stays on the card (history is preserved) but
   *  openQuestion() stops returning it, so the card leaves ASK ME. */
  dismissedAt?: string;
}

export interface HiveTask {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  status: 'todo' | 'doing' | 'blocked' | 'done';
  dependsOn: string[];
  priority: number;
  createdAt: string;
  /** First-class human feedback: the god appends {q} when a card needs the
   *  human; the ASK ME view fills in {a}. Full history stays on the card. */
  humanQA?: HumanQA[];
  /** ISO 8601, "when THIS card last changed" — stamped by every ledger writer
   *  (bin/task.cjs and main's HiveManager.writeTasks). Distinct from the
   *  LEDGER's `updatedAt`, which is "when tasks.json was last written".
   *
   *  ABSENT on every card written before this phase, so the card's age falls
   *  back to `createdAt` — and the tooltip SAYS it did (rule A-3). "Nine hours
   *  since the last change" and "nine hours since it was created and nothing
   *  has ever touched it" are different facts and must not read the same. */
  updatedAt?: string;
  /** Written when the owning agent's PTY exits with the card still in flight.
   *  Two writes: {by, at} synchronously, then {branch, detail} once the
   *  worktree is finalized. The absence of `branch` is the CORRECT rendering of
   *  "not known yet" — never a placeholder (rule R-1). */
  released?: { by: string; at: string; branch?: string; detail?: string };
}

/** The card's currently open question for the human, if any. An entry the human
 *  dismissed (dismissedAt) counts as resolved, same as an answered one. */
export function openQuestion(t: HiveTask): HumanQA | undefined {
  if (!Array.isArray(t.humanQA)) return undefined;
  for (let i = t.humanQA.length - 1; i >= 0; i--) {
    const e = t.humanQA[i];
    if (e && typeof e.q === 'string' && !e.a && !e.dismissedAt) return e;
  }
  return undefined;
}

/** Waiting on the human = blocked with an unanswered question on the card. */
export function waitsOnHuman(t: HiveTask): boolean {
  return t.status === 'blocked' && !!openQuestion(t);
}

type Status = HiveTask['status'];

/** An ISO string as a human-readable local timestamp. An unparseable value is
 *  shown RAW rather than as `Invalid Date` or as a blank — what is actually on
 *  the card is the only honest thing to show about it. */
export function localStamp(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * VIGIL-04's age — the one element both surfaces that carry an age use
 * (04-UI-SPEC § S5 rules A-2, A-3, A-4).
 *
 * DERIVED AT RENDER, NEVER STORED (D-32). A stored elapsed value is wrong the
 * moment nothing re-writes it, and a card nobody is touching is exactly the case
 * this requirement exists to make visible — the age of a stale card would be the
 * one number that stopped moving.
 *
 * FOUR CHANNELS, not colour alone (`DESIGN.md:707`). Rule A-2 defines stale as
 * "the age stopped being minutes", so the unit letter and the emphasis are read
 * off the SAME `relAge()` result and cannot drift apart: `9h` renders in
 * `--cth-ink-900` at weight 600 behind a clock, `4m` in `--cth-ink-500` at 400
 * with no icon. `emphasize={false}` turns the treatment off for `done` cards —
 * a card finished three days ago is not a problem, and lighting it up is noise.
 *
 * `marginLeft: 'auto'` is rule A-4's kanban placement (push the age to the far
 * end of the meta row). It is inert in the ASK ME header, where the title button
 * is `flex: 1` and there is no free space to absorb.
 */
export function TaskAge({ iso, title, emphasize = true }: {
  /** The stored timestamp this age is derived from. */
  iso?: string;
  /** Rule A-3: relative on screen, absolute in the tooltip — and the tooltip
   *  NAMES which clock it read, so the caller composes it. */
  title: string;
  emphasize?: boolean;
}) {
  // Date.parse of undefined/garbage is NaN; relAge degrades that to `0s` rather
  // than rendering `NaNd` (T-04-AGE-06).
  const { text, unit } = relAge(Date.now() - Date.parse(iso ?? ''));
  const stale = emphasize && isStaleUnit(unit);
  return (
    <span
      title={title}
      style={{
        flexShrink: 0, marginLeft: 'auto',
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontFamily: 'var(--cth-font-ui)',
        fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)',
        color: stale ? 'var(--cth-ink-900)' : 'var(--cth-ink-500)',
        fontWeight: stale ? 600 : 400
      }}
    >
      {stale && <Icon name="clock" />}
      {text}
    </span>
  );
}

/** Resolve an agent id to a display name — the live floor roster first, then the
 *  restorable roster (so a done card keeps its author's name after that worker's
 *  terminal is gone), then the raw id.
 *
 *  A hook rather than a prop so `TaskDetail` can resolve `released.by` without
 *  its host (`TaskDetailOverlay.tsx`) having to grow a prop for it. */
function useNameFor(): (id?: string) => string | undefined {
  const agents = useStore((s) => s.agents);
  const restorableAgents = useStore((s) => s.restorableAgents);
  return (id) =>
    id
      ? (agents.find((a) => a.id === id)?.name
        ?? restorableAgents.find((a) => a.id === id)?.name
        ?? id)
      : undefined;
}

const COLUMNS: { key: Status; label: string; accent: string }[] = [
  { key: 'todo',    label: 'TODO',    accent: 'var(--cth-sky)' },
  { key: 'doing',   label: 'DOING',   accent: 'var(--cth-lemon)' },
  { key: 'blocked', label: 'BLOCKED', accent: 'var(--cth-coral)' },
  { key: 'done',    label: 'DONE',    accent: 'var(--cth-mint)' }
];

/** Deterministic fallback id derived from a task's content (djb2 → base36).
 *  Used for tasks lacking a valid string id so re-parsing tasks.json on every
 *  5s poll yields the SAME id — no React key churn / card remount. Unlike
 *  shortId() (random, for brand-new tasks), this never changes across polls. */
function stableId(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (((h << 5) + h) ^ seed.charCodeAt(i)) | 0;
  return `t-${(h >>> 0).toString(36)}`;
}

/** `released`, normalized. Same law as every other field here — the ledger is a
 *  hand-written file, so a half-written `released` (an object with no `by`, or a
 *  `branch` that is not a string) must normalize to something safe rather than
 *  reach a render as `undefined.toUpperCase()`. `by` and `at` are required for the
 *  block to exist at all; `branch`/`detail` arrive on the SECOND write and their
 *  absence is a legitimate, renderable state (rule R-1). */
function releasedOf(raw: unknown): HiveTask['released'] {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.by !== 'string' || !r.by || typeof r.at !== 'string') return undefined;
  return {
    by: r.by,
    at: r.at,
    branch: typeof r.branch === 'string' && r.branch ? r.branch : undefined,
    detail: typeof r.detail === 'string' && r.detail ? r.detail : undefined
  };
}

/** Normalize whatever hive:tasks returns into a typed task array. The god
 *  writes this file by hand — every field except the shape itself is optional
 *  in practice, so EVERY consumer must go through this (exported for the
 *  detail overlay; a raw card without dependsOn once crashed it). */
export function parseTasks(raw: unknown): HiveTask[] {
  const list = (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown }).tasks))
    ? (raw as { tasks: unknown[] }).tasks
    : [];
  return list
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t, i) => ({
      id: typeof t.id === 'string' && t.id
        ? t.id
        : stableId(`${typeof t.title === 'string' ? t.title : ''}|${typeof t.createdAt === 'string' ? t.createdAt : ''}|${i}`),
      title: typeof t.title === 'string' ? t.title : '(untitled)',
      description: typeof t.description === 'string' ? t.description : undefined,
      assignee: typeof t.assignee === 'string' ? t.assignee : undefined,
      status: (['todo', 'doing', 'blocked', 'done'] as const).includes(t.status as Status)
        ? (t.status as Status) : 'todo',
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.filter((d): d is string => typeof d === 'string') : [],
      priority: typeof t.priority === 'number' ? t.priority : 3,
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      // NOT defaulted to createdAt or to now: "this card has never been touched"
      // is a fact the tooltip renders, and defaulting would erase it silently.
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : undefined,
      released: releasedOf(t.released),
      humanQA: Array.isArray(t.humanQA)
        ? (t.humanQA as unknown[])
          .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as { q?: unknown }).q === 'string')
          .map((e) => ({
            q: e.q as string,
            a: typeof e.a === 'string' ? e.a : undefined,
            askedAt: typeof e.askedAt === 'string' ? e.askedAt : undefined,
            answeredAt: typeof e.answeredAt === 'string' ? e.answeredAt : undefined,
            // Preserve a dismissal across the 5s re-parse, else the card would
            // resurface on the next poll (openQuestion would see it as open).
            dismissedAt: typeof e.dismissedAt === 'string' ? e.dismissedAt : undefined
          }))
        : undefined
    }));
}

/**
 * Task kanban over hive/tasks.json — a READ surface. Rides the renderer's ONE
 * 5s task poll (hooks/useHiveTasks) rather than running its own against the
 * same file (#20); cards
 * carry just the title and open the app-wide detail overlay on click. The god
 * is the ledger's writer: new work enters via the dispatch box (mailed to the
 * god), never by the human inserting cards the orchestrator never heard about.
 */
export function TasksKanban() {
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  // Detail view: cards show just the title — clicking one opens the full
  // breakdown as an APP-WIDE overlay over the office floor (see
  // TaskDetailOverlay) — the content grows (contracts, deps, human Q&A), so it
  // gets the big stage instead of the narrow side panel.
  const openTaskDetail = useStore((s) => s.openTaskDetail);

  // `tasks` stays LOCAL state rather than being derived straight off the shared
  // payload: dismissTask writes to it optimistically, so a derived value would
  // leave the dismissed card on the board until the next tick.
  const rawTasks = useHiveTasks();
  useEffect(() => {
    try { setTasks(parseTasks(rawTasks)); } catch { /* keep last good */ }
  }, [rawTasks]);

  // Dismiss a card off the board (human-initiated). The kanban is otherwise the
  // god's to write, but a person can clear a card they no longer want tracked.
  // Main removes the named id from its latest on-disk ledger, so a webhook or
  // god card added since this renderer's last poll cannot be lost.
  const dismissTask = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id)); // optimistic
    try {
      await window.cth.hiveDeleteTask(id);
      // Force the shared poller to re-read NOW instead of waiting out its 5s
      // tick: confirms the removal, and resurrects the card from disk if main
      // refused the delete — the job this view's own `refresh()` used to do.
      refreshHiveTasks();
    } catch { /* keep last good; the next poll re-syncs from disk */ }
  }, []);

  const nameFor = useNameFor();

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--cth-paper-200)', position: 'relative' }}>
      {/* Toolbar — read-only: the god is the ledger's writer. New work enters
          through the dispatch box (which mails the god), not by the human
          inserting cards the orchestrator never heard about. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', flexShrink: 0,
        borderBottom: '1px solid var(--cth-ink-300)'
      }}>
        <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', color: 'var(--cth-ink-500)' }}>
          {tasks.length} task{tasks.length === 1 ? '' : 's'}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-300)' }}>
          new work? dispatch it to Michael (monitor tab)
        </span>
      </div>

      {/* Columns */}
      <div style={{
        flex: 1, minHeight: 0, display: 'flex', gap: 8, padding: 10, overflowX: 'auto'
      }}>
        {COLUMNS.map((col) => {
          const cards = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} style={{
              flex: '1 1 0', minWidth: 170, display: 'flex', flexDirection: 'column',
              background: 'var(--cth-cream-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px 4px',
                background: col.accent, boxShadow: 'inset 0 -1px 0 var(--cth-ink-900)',
                fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', color: 'var(--cth-ink-900)'
              }}>
                {col.label}
                <span style={{ marginLeft: 'auto', fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', fontFamily: 'var(--cth-font-ui)' }}>{cards.length}</span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cards.length === 0 && (
                  <div style={{ fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-300)', textAlign: 'center', padding: '8px 0' }}>Nothing here yet</div>
                )}
                {cards.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    accent={col.accent}
                    assigneeName={nameFor(t.assignee)}
                    releasedByName={nameFor(t.released?.by)}
                    onOpen={() => openTaskDetail(t.id)}
                    onDismiss={() => dismissTask(t.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
// Deliberately minimal — a colored status edge, the title, and ONE meta row
// carrying a whisper of an assignee (or who dropped the card) plus its age.
// Everything else (the full contract, deps, the branch a released card left
// behind, controls) lives in the detail view a click away: a kanban card can
// carry a title at most.
//
// Exported for `test/renderer-components.test.cjs`. The board around it cannot be
// server-rendered — `TasksKanban` fills `tasks` from a `useEffect`, and
// `renderToStaticMarkup` runs no effect phase, so rendering the board yields four
// empty columns and asserts nothing about a card.

export function TaskCard({ task, accent, assigneeName, releasedByName, onOpen, onDismiss }: {
  task: HiveTask;
  accent: string;
  assigneeName?: string;
  /** `task.released.by` resolved to a display name (rule R-2). */
  releasedByName?: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  // Rule A-3. The age falls back to `createdAt` when the card has never been
  // touched — which is every card written before this phase — and the tooltip
  // SAYS so. Silently substituting one clock for the other is the repudiation
  // threat T-04-AGE-07: "nothing has changed in nine hours" and "nothing has
  // ever touched this" would read identically.
  const ageTitle = task.updatedAt
    ? `updated ${localStamp(task.updatedAt)}`
    : `created ${localStamp(task.createdAt)} — never updated`;

  // Rule R-1: when write 2 has not landed the branch is simply absent. No `…`,
  // no `loading`, no `unknown`, no skeleton — a placeholder is the only way this
  // state can look broken in between, and if write 2 never lands (git failed;
  // ADR-0003 keeps the work anyway) the placeholder would be permanent and false.
  const cardTitle = task.released
    ? `${releasedByName ?? task.released.by}'s terminal exited at ${localStamp(task.released.at)}.`
      + (task.released.branch ? ` Their work is on branch ${task.released.branch}.` : '')
    : 'open task details';

  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      <button
        onClick={onOpen}
        title={cardTitle}
        style={{
          flex: 1, minWidth: 0,
          display: 'flex', alignItems: 'stretch', gap: 0, padding: 0,
          border: 'none', cursor: 'pointer', textAlign: 'left',
          background: 'var(--cth-paper-100)',
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)'
        }}
      >
        <span style={{ width: 4, flexShrink: 0, background: accent, boxShadow: 'inset -1px 0 0 var(--cth-ink-700)' }} />
        <span style={{ flex: 1, minWidth: 0, padding: '6px 18px 6px 7px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{
            fontFamily: 'var(--cth-font-ui)', fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)',
            color: 'var(--cth-ink-900)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
          }}>{task.title}</span>
          {/* The meta row (rule A-4). This is the line that used to render ONLY
              when an assignee resolved; it is now unconditional, so an unassigned
              card still shows its age. NO new row and no height change — the row
              already existed, it just always renders now.

              The label slot is where a released card says who dropped it (rule
              R-2): releasing the card CLEARS its assignee, so the slot is free.
              Only the colour changes — same face, same uppercase, same ellipsis. */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <span style={{
              flex: 1, minWidth: 0,
              fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)',
              color: task.released ? 'var(--cth-coral)' : 'var(--cth-ink-500)',
              fontFamily: 'var(--cth-font-display)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
              {task.released
                ? `DROPPED BY ${(releasedByName ?? task.released.by).toUpperCase()}`
                : (assigneeName ? assigneeName.toUpperCase() : '')}
            </span>
            <TaskAge
              iso={task.updatedAt ?? task.createdAt}
              title={ageTitle}
              emphasize={task.status !== 'done'}
            />
          </span>
        </span>
        {waitsOnHuman(task) && (
          <span title="waiting on YOUR answer — see the ASK ME tab" role="img" aria-label="Waiting on your answer" style={{
            alignSelf: 'center', marginRight: 18, flexShrink: 0,
            fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', padding: '2px 5px 1px',
            background: 'var(--cth-lilac)', color: 'var(--cth-ink-900)',
            boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
          }}>?</span>
        )}
      </button>
      {/* Dismiss — sibling button (not nested) so it never triggers onOpen. */}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        title="dismiss this task (removes it from the board)"
        aria-label="dismiss task"
        style={{
          position: 'absolute', top: 0, right: 0, width: 16, height: 16, padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          border: 'none', cursor: 'pointer', background: 'transparent',
          color: 'var(--cth-ink-500)', fontFamily: 'var(--cth-font-ui)'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--cth-coral)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--cth-ink-500)'; }}
      >
        {/* Rule 0 — decorative glyph. aria-hidden on the GLYPH; the button keeps
            its accessible name and stays focusable. */}
        <span aria-hidden="true" style={{ fontSize: 12 }}>✕</span>
      </button>
    </div>
  );
}

// ─── Detail view ─────────────────────────────────────────────────────────────
// The full breakdown of one task: status, assignee, priority, the complete
// description (the god writes 4-part dispatch contracts in there — preserved
// line by line), dependencies resolved to their titles, the human Q&A trail,
// and the move/assign controls that used to crowd every card. Rendered as an
// APP-WIDE overlay (over the office floor) — this content grows, so it gets
// the big stage instead of the narrow side panel. Exported for App's
// TaskDetailOverlay; opened via the store's openTaskDetail from anywhere.

export function TaskDetail({ task, all, assigneeName, onMove, onAssign, onClose }: {
  task: HiveTask;
  all: HiveTask[];
  assigneeName?: string;
  onMove: (s: Status) => void;
  onAssign: () => void;
  onClose: () => void;
}) {
  const col = COLUMNS.find((c) => c.key === task.status) ?? COLUMNS[0];
  // Belt + suspenders: parseTasks normalizes these, but the ledger is a
  // hand-written file — never trust a card's shape at the point of use.
  const deps = (task.dependsOn ?? [])
    .map((id) => all.find((t) => t.id === id))
    .filter((t): t is HiveTask => !!t);
  const created = new Date(task.createdAt);
  const nameFor = useNameFor();
  // Rule R-3: the branch is long, and `TasksKanban.tsx`'s own law is that a
  // kanban card carries a title at most — so the full text lives HERE and in the
  // card's title attribute, never in the card body.
  const droppedBy = task.released ? (nameFor(task.released.by) ?? task.released.by) : undefined;
  return (
    <Modal
      title="TASK"
      onClose={onClose}
      zIndex={280}
      backdrop="rgba(26, 19, 32, 0.6)"
      width={720}
      maxWidth="94vw"
      frameStyle={{ maxHeight: '90vh', display: 'flex' }}
      panelStyle={{ display: 'flex', flexDirection: 'column', width: '100%', minHeight: 0 }}
    >
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflowY: 'auto' }}>
            {/* Title under a status-colored bar */}
            <div style={{ borderLeft: `4px solid ${col.accent}`, paddingLeft: 8 }}>
              <div style={{ fontFamily: 'var(--cth-font-ui)', fontSize: 15, lineHeight: '20px', color: 'var(--cth-ink-900)' }}>
                {task.title}
              </div>
            </div>

            {/* Fact row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', padding: '2px 6px 1px',
                background: col.accent, color: 'var(--cth-ink-900)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
              }}>{col.label}</span>
              {assigneeName
                ? <PixelBadge status="working" label={assigneeName} />
                : <span style={{ fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-300)' }}>unassigned</span>}
              <PriorityDots level={Math.max(1, Math.min(5, task.priority))} />
              {/* Rule A-3: relative on the card, ABSOLUTE here. Both clocks are
                  labelled — two unlabelled timestamps side by side say nothing,
                  and which one you are reading is the whole point. */}
              <span style={{ marginLeft: 'auto', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', color: 'var(--cth-ink-500)', fontFamily: 'var(--cth-font-display)' }}>
                {isNaN(created.getTime()) ? '' : `CREATED ${created.toLocaleString()}`}
                {task.updatedAt ? ` · UPDATED ${localStamp(task.updatedAt)}` : ' · NEVER UPDATED'}
              </span>
            </div>

            {/* VIGIL-02 — the released card, in full (rule R-3). */}
            {task.released && (
              <div style={{
                padding: '7px 9px', background: 'var(--cth-paper-100)',
                boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                display: 'flex', flexDirection: 'column', gap: 3,
                fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-900)'
              }}>
                <span style={{
                  fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)',
                  lineHeight: 'var(--cth-lh-display-md)', color: 'var(--cth-coral)'
                }}>
                  {`DROPPED BY ${(droppedBy ?? '').toUpperCase()}`}
                </span>
                <span>{`${droppedBy}'s terminal exited at ${localStamp(task.released.at)}. The card is back on the board.`}</span>
                {/* No placeholder when write 2 has not landed (rule R-1) — absence
                    IS the rendering of "not known yet". `break-all` copies
                    WorkersTab.tsx:161's shipped treatment of a worktree path. */}
                {task.released.branch && (
                  <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 'var(--cth-text-mono-md)', lineHeight: 'var(--cth-lh-mono)', wordBreak: 'break-all' }}>
                    {`Their work is on branch ${task.released.branch}.`}
                  </span>
                )}
                {task.released.detail && (
                  <span style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 'var(--cth-text-mono-md)', lineHeight: 'var(--cth-lh-mono)', wordBreak: 'break-all', color: 'var(--cth-ink-700)' }}>
                    {task.released.detail}
                  </span>
                )}
              </div>
            )}

            {/* The contract — preserved line by line */}
            <div style={{
              padding: 10, background: 'var(--cth-paper-100)',
              boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
              fontFamily: 'var(--cth-font-mono)', fontSize: 'var(--cth-text-mono-md)', lineHeight: 'var(--cth-lh-mono)',
              color: 'var(--cth-ink-900)', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
            }}>
              {task.description?.trim() || <span style={{ color: 'var(--cth-ink-300)' }}>(no description on this card)</span>}
            </div>

            {/* The human Q&A trail — every decision documented on the card */}
            {(task.humanQA?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', color: 'var(--cth-ink-500)' }}>
                  HUMAN Q&A
                </div>
                {task.humanQA!.map((e, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{
                      padding: '5px 7px', background: 'var(--cth-lilac-light, #ece2f5)',
                      boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                      fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-900)', whiteSpace: 'pre-wrap'
                    }}>
                      <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', marginRight: 6 }}>Q</span>
                      {e.q}
                    </div>
                    {e.a ? (
                      <div style={{
                        padding: '5px 7px', background: 'var(--cth-mint-light, #d9eed9)',
                        boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                        fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-900)', whiteSpace: 'pre-wrap'
                      }}>
                        <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', marginRight: 6 }}>A</span>
                        {e.a}
                      </div>
                    ) : (
                      <div style={{ fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', color: 'var(--cth-coral)', fontFamily: 'var(--cth-font-display)' }}>
                        AWAITING YOUR ANSWER — ASK ME TAB
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Dependencies, resolved to titles */}
            {deps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', color: 'var(--cth-ink-500)' }}>
                  DEPENDS ON
                </div>
                {deps.map((d) => {
                  const dc = COLUMNS.find((c) => c.key === d.status) ?? COLUMNS[0];
                  return (
                    <div key={d.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px',
                      background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                      fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-700)'
                    }}>
                      <span style={{ width: 8, height: 8, background: dc.accent, boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                value={task.status}
                onChange={(e) => onMove(e.target.value as Status)}
                style={{
                  flex: 1, padding: '4px 6px', background: 'var(--cth-paper-100)', border: 'none',
                  boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', fontFamily: 'var(--cth-font-ui)',
                  fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-900)', cursor: 'pointer'
                }}
              >
                {COLUMNS.map((c) => (<option key={c.key} value={c.key}>{c.label.toLowerCase()}</option>))}
              </select>
              <PixelButton variant="secondary" size="sm" onClick={onAssign}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <Icon name="arrow-right" /> assign
                </span>
              </PixelButton>
              <PixelButton variant="ghost" size="sm" onClick={onClose}>close</PixelButton>
        </div>
      </div>
    </Modal>
  );
}

function PriorityDots({ level }: { level: number }) {
  // 1 = lowest, 5 = highest. Warmer fill as priority climbs.
  const color = level >= 4 ? 'var(--cth-coral)' : level === 3 ? 'var(--cth-lemon)' : 'var(--cth-mint)';
  return (
    <span title={`Priority ${level}/5`} style={{ display: 'inline-flex', gap: 1, flexShrink: 0, marginTop: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{
          width: 4, height: 8,
          background: i <= level ? color : 'var(--cth-cream-200)',
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
        }} />
      ))}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', background: 'var(--cth-paper-100)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', fontFamily: 'var(--cth-font-ui)',
  fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-900)', outline: 'none', boxSizing: 'border-box'
};

const selectStyle: React.CSSProperties = {
  padding: '3px 6px', background: 'var(--cth-paper-100)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', fontFamily: 'var(--cth-font-ui)',
  fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-900)', cursor: 'pointer'
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', color: 'var(--cth-ink-500)'
};
