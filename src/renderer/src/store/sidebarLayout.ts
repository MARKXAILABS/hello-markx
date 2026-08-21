/**
 * FLOOR-13 — the responsive sidebar collapse, as one pure function.
 *
 * `DESIGN.md:678` has promised *"Right panel collapses below 1024 to bottom
 * drawer"* while `grep -rn "@media" src/renderer/src` returned exactly one hit
 * and it was `prefers-reduced-motion`. This is the code that makes the line
 * true.
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

/** Below this viewport width the sidebar stops being a column. `DESIGN.md:678`. */
export const SIDEBAR_COLLAPSE_WIDTH = 1024;

/** Canvas kept visible beside the overlay, so the floor is never fully covered. */
export const SIDEBAR_OVERLAY_GUTTER = 48;

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
   * large-window boot — the exact bug class `SidebarSplitter.tsx:27-34` was
   * written to kill. It is a render-time computation, full stop.
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
