import { useEffect, useState } from 'react';
import { PixelButton } from './PixelButton';
import { PixelBadge } from './PixelBadge';
import { useStore } from '@/store/store';
import { useHiveTasks } from '@/hooks/useHiveTasks';
import { type HiveTask, type HumanQA, openQuestion, waitsOnHuman } from './TasksKanban';

/**
 * ASK ME — first-class human feedback through the task system.
 *
 * Tasks the god can only move with the human's input sit here. An entry isn't
 * necessarily a question — it can be a TO-DO only the human can perform
 * (create an account, approve a purchase, provide credentials, test on a real
 * device). Each card shows the open ask, a place to respond (an answer, or a
 * "done, here's the result" confirmation), and the CASCADE of downstream
 * tasks stuck waiting on this one — so "why isn't X done?" reads as "ah,
 * because I still owe something here."
 *
 * Sending an answer does two things:
 *   1. writes it into the card's humanQA entry in hive/tasks.json (the
 *      decision is documented ON the task, forever), and
 *   2. mails BOTH the god and the agent that asked (D-39): the god's copy is
 *      the ADDITION and is sent first — it carries the unblock, since the god
 *      owns the board — and the asker's copy (recipientOf, below) tells it to
 *      continue its own work without touching the card's status. When the
 *      asker IS the god, exactly one message goes out, not two into one inbox.
 */

/** A humanQA entry as `bin/task.cjs` actually writes it since D-37: `askedBy`
 *  is not part of the shared `HumanQA` shape in `./TasksKanban` (that file's
 *  own `parseTasks()` whitelist would drop it — this component deliberately
 *  does not route through that whitelist, see `parse()` below), so the wider
 *  shape is declared locally rather than widening a shared interface for one
 *  optional field two other files still read. */
type OpenAsk = HumanQA & { askedBy?: string };

function parse(raw: unknown): HiveTask[] {
  const list = (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown }).tasks))
    ? (raw as { tasks: HiveTask[] }).tasks
    : [];
  return list.filter((t) => !!t && typeof t === 'object');
}

/** All tasks transitively waiting on `id` (dependents chain), cycle-safe. */
function dependentsTree(id: string, all: HiveTask[], seen = new Set<string>()): HiveTask[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const direct = all.filter((t) => Array.isArray(t.dependsOn) && t.dependsOn.includes(id) && t.status !== 'done');
  return direct.flatMap((d) => [d, ...dependentsTree(d.id, all, seen)]);
}

export function AskMeTab() {
  const agents = useStore((s) => s.agents);
  const restorable = useStore((s) => s.restorableAgents);
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  // Drafts live in the STORE (keyed by task id) — switching tabs unmounts this
  // view, and a half-typed answer must survive the round trip.
  const drafts = useStore((s) => s.answerDrafts);
  const setAnswerDraft = useStore((s) => s.setAnswerDraft);
  const openTaskDetail = useStore((s) => s.openTaskDetail);
  const [sending, setSending] = useState<string | null>(null);

  // The renderer's ONE task poll (hooks/useHiveTasks) replaces this view's own
  // 5s timer against the same file (#20). `tasks` stays LOCAL state rather than
  // being derived straight off the payload: sendAnswer and dismiss both write
  // to it optimistically (`setTasks(next)` before the disk round trip, and the
  // restore-on-failure below), so a derived value would drop the immediate
  // feedback and leave the card sitting there until the next tick.
  const rawTasks = useHiveTasks();
  useEffect(() => {
    try { setTasks(parse(rawTasks)); } catch { /* keep last good */ }
  }, [rawTasks]);

  const nameFor = (id?: string): string | undefined =>
    id ? (agents.find((a) => a.id === id)?.name ?? restorable.find((a) => a.id === id)?.name ?? id) : undefined;

  // D-37's chain plus one security control (D-36): `askedBy` is agent-authored
  // text from a bypassed-permission shell (`AGENT_ID`), so it is never used as
  // a mail `to:` unless it names an agent CURRENTLY on this floor. Same for
  // `assignee`. Neither check narrows to the god specially — the literal
  // 'god' fallback below is always routable (hive.ts's resolveTo), so it needs
  // no membership check of its own.
  const recipientOf = (task: HiveTask): string => {
    const askedBy = (openQuestion(task) as OpenAsk | undefined)?.askedBy;
    if (askedBy && agents.some((a) => a.id === askedBy)) return askedBy;
    if (task.assignee && agents.some((a) => a.id === task.assignee)) return task.assignee;
    return 'god';
  };

  const waiting = tasks.filter(waitsOnHuman);

  const sendAnswer = async (task: HiveTask) => {
    const text = (drafts[task.id] ?? '').trim();
    const open = openQuestion(task);
    if (!text || !open || sending) return;
    setSending(task.id);
    try {
      // 1) Document the answer ON the card.
      const next = tasks.map((t) => {
        if (t.id !== task.id) return t;
        const qa = (t.humanQA ?? []).map((e) =>
          e === open || (e.q === open.q && !e.a)
            ? { ...e, a: text, answeredAt: new Date().toISOString() }
            : e
        );
        return { ...t, humanQA: qa };
      });
      const updated = next.find((candidate) => candidate.id === task.id);
      const result = updated
        ? await window.cth.hivePatchTask(task.id, { humanQA: updated.humanQA })
        : { ok: false };
      if (!result.ok) throw new Error('task changed before answer could be saved');
      setTasks(next);

      const recipient = recipientOf(task);
      const recipientIsGod = recipient === 'god' || agents.find((a) => a.id === recipient)?.isGod === true;

      // 2a — the god, and this is the message that carries the unblock (D-39).
      // Sent FIRST, deliberately: if 2b below fails, the card is still
      // unblocked and the god still holds the full answer.
      await window.cth.hiveSend({
        to: 'god',
        act: 'inform',
        subject: `HUMAN ANSWER on task "${task.title}"`,
        body: [
          `The human answered the open question on task ${task.id} ("${task.title}"):`,
          `Q: ${open.q}`,
          `A: ${text}`,
          recipientIsGod
            ? 'The answer is also recorded in the card\'s humanQA. Act on it, unblock the card, and continue the work.'
            : `The answer is also recorded in the card's humanQA and was sent to ${recipient}, who asked it. Act on it, unblock the card, and continue the work.`
        ].join('\n')
      }, 'human');

      // 2b — the asker. Skipped when recipientOf(task) already resolves to the
      // god: two copies into one inbox is not "the god is still told", it is
      // noise the god has to de-duplicate.
      if (!recipientIsGod) {
        await window.cth.hiveSend({
          to: recipient,
          act: 'inform',
          subject: `HUMAN ANSWER on task "${task.title}"`,
          body: [
            `The human answered your open question on task ${task.id} ("${task.title}"):`,
            `Q: ${open.q}`,
            `A: ${text}`,
            'Continue your own work with this answer. Do not change the card\'s status yourself — the god owns the board and will unblock it.'
          ].join('\n')
        }, 'human');
      }

      setAnswerDraft(task.id, '');
    } catch { /* leave the draft so the user can retry */ }
    setSending(null);
  };

  // Dismiss the open ask off the ASK ME board WITHOUT answering it. We mark the
  // open humanQA entry `dismissedAt` (no fabricated answer) so openQuestion()
  // stops returning it and the card leaves this view — the question itself stays
  // on the card, so the Q&A history is never dropped (protocol). The task stays
  // blocked on the kanban; the god can re-ask by appending a fresh humanQA entry.
  const dismiss = async (task: HiveTask) => {
    const open = openQuestion(task);
    if (!open || sending === task.id) return;
    const next = tasks.map((t) => {
      if (t.id !== task.id) return t;
      const qa = (t.humanQA ?? []).map((e) =>
        e === open || (e.q === open.q && !e.a && !e.dismissedAt)
          ? { ...e, dismissedAt: new Date().toISOString() }
          : e
      );
      return { ...t, humanQA: qa };
    });
    setTasks(next); // optimistic — the card disappears immediately
    try {
      const updated = next.find((candidate) => candidate.id === task.id);
      const result = updated
        ? await window.cth.hivePatchTask(task.id, { humanQA: updated.humanQA })
        : { ok: false };
      if (!result.ok) throw new Error('task changed before ask could be dismissed');
    } catch {
      setTasks(tasks); // restore on failure so the user can retry
    }
  };

  return (
    // Body text is set in the mono face (VT323) — the same readable font the
    // memory viewer uses. Pixelify Sans (font-ui) is too chunky for prose like
    // questions and answers. Display/badge bits keep their explicit faces.
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--cth-paper-200)', padding: 10, display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'var(--cth-font-mono)' }}>
      {waiting.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--cth-ink-500)', fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)' }}>
          Nothing needs you right now. 🌿<br />
          <span style={{ fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-300)' }}>
            When the team blocks a task on your input — a question to answer or a to-do only
            you can perform — it shows up here (and on the ASK ME board on the floor).
          </span>
        </div>
      )}
      {waiting.map((t) => {
        const open = openQuestion(t)!;
        const stuck = dependentsTree(t.id, tasks);
        const recipient = nameFor(recipientOf(t))!;
        return (
          <div key={t.id} style={{
            background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
            display: 'flex', flexDirection: 'column'
          }}>
            {/* header: title + assignee */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px',
              background: 'var(--cth-lilac-light, #ece2f5)', boxShadow: 'inset 0 -1px 0 var(--cth-ink-700)'
            }}>
              <button
                onClick={() => openTaskDetail(t.id)}
                title="open the full task detail"
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left',
                  fontFamily: 'var(--cth-font-mono)', fontSize: 15, color: 'var(--cth-ink-900)',
                  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}
              >
                {t.title}
              </button>
              {/* the recipient badge — sourced from the SAME recipientOf() call
                  sendAnswer mails to, so this card can never display one
                  recipient and mail another (D-36/T-P02-08-02). The operator
                  may be answering with a credential; the recipient is visible
                  before the send, not after. */}
              <span title={`your answer will be sent to ${recipient}`}>
                <PixelBadge status="blocked" label={recipient} />
              </span>
              {/* Dismiss — clears this ask off the board without answering it.
                  The card's Q&A history is preserved (the question stays on the
                  card, just marked dismissed). */}
              <button
                onClick={() => void dismiss(t)}
                disabled={sending === t.id}
                title="dismiss — clear this off the ASK ME board without answering (history kept)"
                aria-label="dismiss this ask"
                style={{
                  flexShrink: 0, width: 18, height: 18, padding: 0, marginLeft: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                  border: 'none', cursor: sending === t.id ? 'default' : 'pointer',
                  background: 'transparent', color: 'var(--cth-ink-500)',
                  fontFamily: 'var(--cth-font-ui)'
                }}
                onMouseEnter={(e) => { if (sending !== t.id) e.currentTarget.style.color = 'var(--cth-coral)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--cth-ink-500)'; }}
              >
                {/* Rule 0 — decorative glyph. aria-hidden on the GLYPH; the
                    button keeps its accessible name and stays focusable. */}
                <span aria-hidden="true" style={{ fontSize: 13 }}>✕</span>
              </button>
            </div>

            <div style={{ padding: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* the question */}
              <div style={{ fontSize: 15, lineHeight: '19px', color: 'var(--cth-ink-900)', whiteSpace: 'pre-wrap' }}>
                {open.q}
              </div>

              {/* answer box */}
              <textarea
                value={drafts[t.id] ?? ''}
                onChange={(e) => setAnswerDraft(t.id, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendAnswer(t); }}
                rows={3}
                placeholder="Your answer — or 'done', with the result… (Ctrl+Enter to send)"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '6px 8px', resize: 'vertical',
                  background: 'var(--cth-paper-100)', border: 'none',
                  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
                  fontFamily: 'var(--cth-font-mono)', fontSize: 15, lineHeight: '18px',
                  color: 'var(--cth-ink-900)', outline: 'none'
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PixelButton
                  variant="primary" size="sm"
                  disabled={!(drafts[t.id] ?? '').trim() || sending === t.id}
                  onClick={() => void sendAnswer(t)}
                >
                  {sending === t.id ? 'sending…' : 'respond & unblock'}
                </PixelButton>
                {(t.humanQA?.filter((e) => e.a).length ?? 0) > 0 && (
                  <button
                    onClick={() => openTaskDetail(t.id)}
                    title="open the task detail with the full Q&A history"
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                      fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', color: 'var(--cth-ink-700)', fontFamily: 'var(--cth-font-display)',
                      textDecoration: 'underline'
                    }}
                  >
                    VIEW {t.humanQA!.filter((e) => e.a).length} EARLIER ANSWER{t.humanQA!.filter((e) => e.a).length === 1 ? '' : 'S'}
                  </button>
                )}
              </div>

              {/* the cascade: what's stuck behind this answer */}
              {stuck.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 'var(--cth-text-display-md)', lineHeight: 'var(--cth-lh-display-md)', color: 'var(--cth-coral)' }}>
                    BLOCKING {stuck.length} DOWNSTREAM TASK{stuck.length === 1 ? '' : 'S'}
                  </div>
                  {stuck.slice(0, 6).map((d, i) => (
                    <div key={d.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      paddingLeft: 8 + Math.min(i, 3) * 8,
                      fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-700)'
                    }}>
                      {/* Rule 0 — decorative glyph. It has no fontSize of its
                          own (it rides the row's), so it takes aria-hidden and
                          no allowlist entry. */}
                      <span aria-hidden="true" style={{ color: 'var(--cth-ink-300)' }}>└</span>
                      <span style={{ width: 7, height: 7, flexShrink: 0, background: d.status === 'blocked' ? 'var(--cth-coral)' : 'var(--cth-sky)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
                      {nameFor(d.assignee) && <span style={{ fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-500)' }}>({nameFor(d.assignee)})</span>}
                    </div>
                  ))}
                  {stuck.length > 6 && (
                    <div style={{ paddingLeft: 14, fontSize: 'var(--cth-text-body-md)', lineHeight: 'var(--cth-lh-body-md)', color: 'var(--cth-ink-300)' }}>… +{stuck.length - 6} more</div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
