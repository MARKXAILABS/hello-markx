/**
 * FLOOR-13 — the responsive sidebar collapse, as one pure function.
 *
 * `DESIGN.md:677` has promised *"Right panel collapses below 1024 to a
 * right-edge overlay"* while `grep -rn "@media" src/renderer/src` returned
 * exactly one hit and it was `prefers-reduced-motion`. This is the code that
 * makes the line true.
 *
 * The breakpoint is a MEASURED WIDTH COMPARISON, deliberately — not a CSS
 * `@media` rule and not a `matchMedia` listener. `App.tsx` already tracks
 * `window.innerWidth` into `vpWidth` and feeds it to `SidebarSplitter`'s
 * viewport-relative clamp; a second source of viewport truth is how the two
 * start disagreeing about which side of the boundary the window is on.
 *
 * Pure and dependency-free so it runs under plain `node --test`: the two things
 * most worth pinning here — that the toggle exists only below the boundary, and
 * that the overlay width is never written back as the user's chosen width —
 * are arithmetic, not pixels.
 */

/** Below this viewport width the sidebar stops being a column. `DESIGN.md:677`. */
export const SIDEBAR_COLLAPSE_WIDTH = 1024;

/** Canvas kept visible beside the overlay, so the floor is never fully covered. */
export const SIDEBAR_OVERLAY_GUTTER = 48;

/** Canvas kept reachable to the LEFT of the docked splitter handle.
 *
 *  The same 48px as `SIDEBAR_OVERLAY_GUTTER` and for the same reason — keep a
 *  strip of floor the operator can still grab — so the two are visibly ONE
 *  decision rather than two magic numbers that drift apart. */
export const SPLITTER_REACHABLE_RESERVE = 48;

/**
 * The widest the sidebar may be and still leave the splitter handle REACHABLE.
 *
 * This is not the drag clamp, and the difference is the whole point. Two
 * requirements were being served by one number:
 *
 *   - *"leave the floor 360px"* is a layout PREFERENCE. It is correct to enforce
 *     while the operator drags, and `SidebarSplitter` still does.
 *   - *"the handle must not sit past the right edge"* (issue #38) is the only
 *     invariant a WINDOW RESIZE may enforce — because the resize re-clamp calls
 *     `setSidebarWidth`, which writes localStorage. Enforcing a preference there
 *     turns a transient viewport into a permanent choice the operator never made.
 *
 * With `MIN_WIN.width` at 960 the 1024–1279 band is reachable with the splitter
 * still mounted (`sidebarLayout`'s docked branch gates `showSplitter` on
 * `>= SIDEBAR_COLLAPSE_WIDTH`), where the drag clamp is only 664–919. Dragging
 * the window to 1024 once would rewrite a 900px sidebar to 664 and persist it.
 */
export function splitterReachableMax(viewportWidth: number, min: number): number {
  return Math.max(min, viewportWidth - SPLITTER_REACHABLE_RESERVE);
}

export interface SidebarLayout {
  /** The viewport is below the breakpoint: the canvas takes the full width. */
  collapsed: boolean;
  /** The one persistent `show panel` / `hide panel` control. Below only. */
  showToggle: boolean;
  /** The drag handle. Nothing to drag while collapsed. */
  showSplitter: boolean;
  /** The sidebar, floating over the canvas at `z-index: 2` (`DESIGN.md:686`). */
  showOverlay: boolean;
  /**
   * Width to RENDER the overlay at. Capped so the canvas keeps a gutter on a
   * narrow window.
   *
   * This value must never be written back through `setSidebarWidth`. Persisting
   * a small-window width would strand the user's chosen width on the next
   * large-window boot — the exact bug class `SidebarSplitter`'s resize
   * `useEffect` was written to kill (and, with the drag clamp, was itself
   * causing across 1024–1279; see `splitterReachableMax` above). It is a
   * render-time computation, full stop.
   */
  overlayWidth: number;
}

export function sidebarLayout(
  vpWidth: number,
  sidebarWidth: number,
  isOpen: boolean
): SidebarLayout {
  if (vpWidth >= SIDEBAR_COLLAPSE_WIDTH) {
    return {
      collapsed: false,
      showToggle: false,
      showSplitter: true,
      showOverlay: false,
      overlayWidth: sidebarWidth
    };
  }
  return {
    collapsed: true,
    showToggle: true,
    showSplitter: false,
    showOverlay: isOpen,
    overlayWidth: Math.max(0, Math.min(sidebarWidth, vpWidth - SIDEBAR_OVERLAY_GUTTER))
  };
}
