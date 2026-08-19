/**
 * ONE poll of the hive task file for the whole renderer.
 *
 * Four components (AgentStrip, AskMeTab, TasksKanban, TaskDetailOverlay) each
 * ran their own 5 s `window.cth.hiveTasks()` timer against the same file, and
 * the office floor ran two more — six independent reads of one JSON file, every
 * five seconds, forever (#20). They share this instead: one timer that exists
 * only while something is mounted, one IPC round trip per tick, one result
 * fanned out.
 *
 * Returns the RAW `hiveTasks()` payload, deliberately: every caller already has
 * its own parser for the shape it cares about, and making them agree on one
 * would be a much larger change than this is worth. Migration is one line —
 * delete the local `useState` + polling `useEffect`, call this.
 */
import { useEffect, useState } from 'react';

const POLL_MS = 5000;

let cached: unknown = null;
let lastReadAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<(value: unknown) => void>();

async function read(): Promise<void> {
  let next: unknown;
  try {
    next = await window.cth.hiveTasks();
  } catch {
    return; // keep the last good payload — a transient read must not blank the board
  }
  cached = next;
  lastReadAt = Date.now();
  for (const listener of listeners) listener(next);
}

/** Force a re-read now — for a caller that just MUTATED a task and wants the
 *  board to show it without waiting out the tick. */
export function refreshHiveTasks(): void {
  void read();
}

export function useHiveTasks(): unknown {
  const [value, setValue] = useState<unknown>(cached);
  useEffect(() => {
    listeners.add(setValue);
    if (!timer) timer = setInterval(() => void read(), POLL_MS);
    // A second subscriber mounting gets the payload the first one already
    // fetched; only a cold or stale cache costs an extra round trip.
    if (cached === null || Date.now() - lastReadAt > POLL_MS) void read();
    else setValue(cached);
    return () => {
      listeners.delete(setValue);
      if (!listeners.size && timer) { clearInterval(timer); timer = null; }
    };
  }, []);
  return value;
}
