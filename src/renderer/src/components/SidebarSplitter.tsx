import { useEffect, useRef, useState } from 'react';
import { splitterReachableMax } from '../store/sidebarLayout';

export interface SidebarSplitterProps {
  /** Current sidebar width in px. */
  width: number;
  /** Called with the new width (already clamped externally). */
  onChange: (px: number) => void;
  /** Containing viewport width — used to clamp delta to a sane max. */
  viewportWidth: number;
  min?: number;
  max?: number;
}

/**
 * Vertical drag handle. Sits between the floor canvas (left) and the sidebar
 * (right). Drag left → wider sidebar. Cursor + pixel-stripe affordance.
 */
export function SidebarSplitter({
  width, onChange, viewportWidth, min = 320, max = 1200
}: SidebarSplitterProps) {
  const startRef = useRef<{ clientX: number; width: number } | null>(null);
  const [active, setActive] = useState(false);

  /** The widest the sidebar may be and still leave the floor 360px. DRAG only. */
  const clampMax = Math.min(max, Math.max(min, viewportWidth - 360));
  /** The widest it may be and still leave the handle reachable. RESIZE only. */
  const reachableMax = splitterReachableMax(viewportWidth, min);

  // Re-clamp when the WINDOW changes, not only while dragging.
  //
  // The clamp used to live inside the drag handler alone, so a width chosen on a
  // wide monitor survived into a small window: the persisted 900px sidebar on a
  // 1280px laptop left the floor 370px and, restored from localStorage at boot,
  // could put this handle past the right edge — no way to drag it back. The
  // store still clamps to its own absolute bounds; this is the viewport-relative
  // half it cannot see.
  //
  // TWO BOUNDS, ON PURPOSE. `onChange` is App's `setSidebarWidth`, which WRITES
  // localStorage — so anything this effect enforces becomes a permanent rewrite
  // of a preference the operator chose. Enforcing `clampMax` here enforced a
  // LAYOUT PREFERENCE ("leave the floor 360px") that way: once `MIN_WIN.width`
  // dropped to 960 the 1024–1279 band became reachable with this splitter still
  // mounted, where `clampMax` is 664–919, and one drag of the window to 1024
  // silently rewrote a 900px sidebar to 664 — which the next boot on a 27"
  // monitor then opened at. `reachableMax` enforces only the invariant issue #38
  // actually needs: the handle must not sit past the right edge.
  //
  // WHAT THIS DOES NOT CLOSE: the genuine rescue still writes through the
  // persisting setter, so a width really wider than `viewportWidth - 48` is
  // still reduced and stored. That is the #38 trade and it is the right one —
  // the alternative is an unreachable handle. This removes the newly opened band
  // from the damage surface and shrinks the pre-existing one at every viewport
  // (at 1280 the effect fired above 920 before, above 1232 now). The complete
  // fix is a NON-PERSISTING ephemeral setter, which lives in `store.ts`.
  useEffect(() => {
    if (width > reachableMax) onChange(reachableMax);
  }, [width, reachableMax, onChange]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!startRef.current) return;
      const delta = startRef.current.clientX - e.clientX; // left drag = positive delta → grow sidebar
      const next = Math.min(clampMax, Math.max(min, startRef.current.width + delta));
      onChange(next);
    };
    const onUp = () => {
      startRef.current = null;
      setActive(false);
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    if (active) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'ew-resize';
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [active, clampMax, min, onChange]);

  return (
    <div
      onMouseDown={(e) => {
        startRef.current = { clientX: e.clientX, width };
        setActive(true);
        e.preventDefault();
      }}
      onDoubleClick={() => onChange(420)}
      title="Drag to resize · double-click to reset"
      style={{
        width: 10,
        cursor: 'ew-resize',
        flexShrink: 0,
        position: 'relative',
        background: active ? 'var(--cth-cream-300)' : 'transparent'
      }}
    >
      {/* The visible 2px stripe with hash marks in the middle */}
      <div style={{
        position: 'absolute',
        top: 0, bottom: 0, left: 4,
        width: 2,
        background: active ? 'var(--cth-ink-900)' : 'var(--cth-ink-300)'
      }} />
      <div style={{
        position: 'absolute',
        top: '50%', left: 2, transform: 'translateY(-50%)',
        width: 6, height: 24,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
      }}>
        <span style={{ height: 2, background: 'var(--cth-ink-900)' }} />
        <span style={{ height: 2, background: 'var(--cth-ink-900)' }} />
        <span style={{ height: 2, background: 'var(--cth-ink-900)' }} />
      </div>
    </div>
  );
}
