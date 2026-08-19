import { useEffect, useState } from 'react';
import type { PoolSnapshot } from '@/store/config';

/**
 * Live Claude account-pool health (PR 2): cold-start read of the snapshot, then
 * every `claudeAccount:state` push from main (each change + the 30s beat).
 * Null until the first read lands. Pure read model — the renderer never
 * decides health; it renders what main persisted.
 */
export function useClaudeAccountPool(): PoolSnapshot | null {
  const [snap, setSnap] = useState<PoolSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    window.cth.claudeAccountPoolState()
      .then((s) => { if (alive && s) setSnap(s); })
      .catch(() => { /* pool unavailable — panel stays PR 1 shaped */ });
    const off = window.cth.onClaudeAccountState((s) => { if (alive) setSnap(s); });
    return () => { alive = false; off(); };
  }, []);
  return snap;
}
