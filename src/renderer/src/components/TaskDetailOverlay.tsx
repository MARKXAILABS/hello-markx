import { useEffect, useState } from 'react';
import { useStore } from '@/store/store';
import { useHiveTasks, refreshHiveTasks } from '@/hooks/useHiveTasks';
import { TaskDetail, parseTasks, type HiveTask } from './TasksKanban';

/**
 * App-wide host for the task detail: whoever calls store.openTaskDetail(id) —
 * a kanban card, the sticky note on an agent's strip card, a floor prop —
 * gets the SAME big overlay rendered over the office floor. Rides the
 * renderer's ONE ledger poll (hooks/useHiveTasks) so an open detail stays fresh
 * while the god edits cards, without a second 5s timer on the same file (#20).
 */

export function TaskDetailOverlay() {
  const taskDetailId = useStore((s) => s.taskDetailId);
  const closeTaskDetail = useStore((s) => s.closeTaskDetail);
  const agents = useStore((s) => s.agents);
  const restorable = useStore((s) => s.restorableAgents);
  // `tasks` stays LOCAL state rather than being derived straight off the shared
  // payload: `move` below writes to it optimistically, so a derived value would
  // leave the card in its old column until the next tick.
  const [tasks, setTasks] = useState<HiveTask[]>([]);
  const rawTasks = useHiveTasks();

  useEffect(() => {
    // parseTasks NORMALIZES (the ledger is a hand-written file; cards may lack
    // dependsOn/priority/etc.) — a raw card without dependsOn crashed the
    // detail once. Never feed TaskDetail unparsed ledger entries.
    try { setTasks(parseTasks(rawTasks)); } catch { /* keep last good */ }
  }, [rawTasks]);

  if (!taskDetailId) return null;
  const task = tasks.find((t) => t.id === taskDetailId);
  if (!task) return null;

  const nameFor = (id?: string): string | undefined =>
    id ? (agents.find((a) => a.id === id)?.name ?? restorable.find((a) => a.id === id)?.name ?? id) : undefined;

  const move = async (status: HiveTask['status']) => {
    const next = tasks.map((t) => (t.id === task.id ? { ...t, status } : t));
    setTasks(next); // optimistic
    try {
      // Force the shared poller to re-read NOW rather than waiting out its 5s
      // tick — the same job this view's own `refresh()` did before the migration.
      const result = await window.cth.hivePatchTask(task.id, { status });
      if (!result.ok) refreshHiveTasks();
    } catch { refreshHiveTasks(); }
  };

  const assign = () => {
    // Route through the Command Center's dispatch box (which mails the god —
    // the human never writes into a worker's inbox directly).
    const st = useStore.getState();
    const god = st.agents.find((a) => a.isGod);
    if (god) st.select(god.id);
    const desc = task.description?.trim() ? task.description.trim() : '(no description)';
    st.requestDispatchSeed(`Task: ${task.title}\nContext: ${desc}\n`);
    st.requestCommandCenterTab('floor');
    closeTaskDetail();
  };

  return (
    <TaskDetail
      task={task}
      all={tasks}
      assigneeName={nameFor(task.assignee)}
      onMove={(s) => void move(s)}
      onAssign={assign}
      onClose={closeTaskDetail}
    />
  );
}
